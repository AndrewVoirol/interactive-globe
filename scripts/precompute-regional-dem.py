#!/usr/bin/env python3
"""
scripts/precompute-regional-dem.py: High-Resolution NOAA CUDEM Regional DEM Ingestion & Packing

Downloads 1/3 arc-second (~10m) NOAA CUDEM topobathy tiles for litmus test regions:
1. Hawaii (18°N-23°N, 161°W-154°W): 5400 x 3600 pixels (~155 MB raw uint16)
2. Cape Cod (41°N-43°N, 71°W-69°W): 2400 x 2400 pixels (~46 MB raw uint16)

Mosaics tiles on top of the global ETOPO 2022 DEM base and packs into 4-channel rgba16unorm
binary textures (.bin) and lossless WebP fallbacks with manifest.json in public/regional/.
"""

import os
import sys
import json
import time
import urllib.request
import xml.etree.ElementTree as ET
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
from PIL import Image

try:
    import tifffile
except ImportError:
    print("[ERROR] tifffile not found. Run via: uv run --with tifffile --with imagecodecs --with pillow --with scipy --with numpy python scripts/precompute-regional-dem.py")
    sys.exit(1)

# Elevation packing constants (exact parity with global DEM and crust_hydrosphere.wgsl)
Z_MIN_GLOBAL = -10924.0
Z_MAX_GLOBAL = 8848.0
Z_SPAN = Z_MAX_GLOBAL - Z_MIN_GLOBAL  # 19772.0
Z_MAX_LAND = 8848.0
D_MAX_OCEAN = 10924.0

CACHE_DIR = "/tmp/cudem_cache"
OUTPUT_DIR = "public/regional"
GLOBAL_DEM_PATH = "public/earth-etopo2022-dem-u16.bin"

S3_BASE_URL = "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com"

REGIONS = [
    {
        "id": "hawaii",
        "name": "Hawaii",
        "min_lon": -161.0,
        "max_lon": -154.0,
        "min_lat": 18.0,
        "max_lat": 23.0,
        "width": 5400,
        "height": 3600,
        "s3_prefixes": ["dem/NCEI_third_Topobathy_Hawaii_9429/tiles/"],
        "bin_filename": "hawaii-dem-u16.bin",
        "webp_filename": "hawaii-dem.webp",
    },
    {
        "id": "capecod",
        "name": "Cape Cod",
        "min_lon": -71.0,
        "max_lon": -69.0,
        "min_lat": 41.0,
        "max_lat": 43.0,
        "width": 2400,
        "height": 2400,
        "s3_prefixes": [
            "dem/NCEI_third_Topobathy_2014_8580/MA_NH_ME/",
            "dem/NCEI_ninth_Topobathy_2014_8483/MA_NH_ME/",
        ],
        "bin_filename": "capecod-dem-u16.bin",
        "webp_filename": "capecod-dem.webp",
    },
]

def list_s3_tiles(prefix: str):
    url = f"{S3_BASE_URL}/?prefix={prefix}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (IndicatrixEngine/2.0)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        xml_data = resp.read()
    root = ET.fromstring(xml_data)
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    keys = [elem.text for elem in root.findall(".//s3:Key", ns) if elem.text and elem.text.endswith(".tif")]
    return keys

def download_file(url: str, dest_path: str, retries: int = 3) -> bool:
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
        return True
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    temp_path = f"{dest_path}.tmp"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (IndicatrixEngine/2.0)"})
            with urllib.request.urlopen(req, timeout=30) as resp, open(temp_path, "wb") as out:
                chunk_size = 1024 * 64
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out.write(chunk)
            os.replace(temp_path, dest_path)
            return True
        except Exception as e:
            if attempt == retries - 1:
                print(f"[CUDEM] Failed to download {url}: {e}")
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                return False
            time.sleep(1.0)
    return False

def load_global_dem_base(min_lon: float, max_lon: float, min_lat: float, max_lat: float, width: int, height: int) -> np.ndarray:
    """
    Samples the global ETOPO 2022 8K DEM to provide seamless baseline elevation for any region.
    """
    print(f"[CUDEM] Sampling global DEM base for Lon [{min_lon}, {max_lon}], Lat [{min_lat}, {max_lat}] ({width}x{height})...")
    if not os.path.exists(GLOBAL_DEM_PATH):
        print(f"[CUDEM] WARNING: {GLOBAL_DEM_PATH} not found; initializing zero base.")
        return np.zeros((height, width), dtype=np.float32)

    global_u16 = np.memmap(GLOBAL_DEM_PATH, dtype=np.uint16, mode='r', shape=(4096, 8192, 4))
    # Normalized elevation in A channel: elev = (u16 / 65535.0) * Z_SPAN + Z_MIN_GLOBAL
    global_elev = (global_u16[:, :, 3].astype(np.float32) / 65535.0) * Z_SPAN + Z_MIN_GLOBAL

    # Vectorized grid coordinate mapping
    lats = np.linspace(max_lat, min_lat, height, dtype=np.float32)
    lons = np.linspace(min_lon, max_lon, width, dtype=np.float32)

    rows_f = np.clip((90.0 - lats) / 180.0 * 4096.0, 0.0, 4095.0)
    cols_f = np.clip((lons + 180.0) / 360.0 * 8192.0, 0.0, 8191.0)

    r0 = np.floor(rows_f).astype(np.int32)
    r1 = np.clip(r0 + 1, 0, 4095)
    fr = (rows_f - r0)[:, None]

    c0 = np.floor(cols_f).astype(np.int32)
    c1 = (c0 + 1) % 8192
    fc = (cols_f - c0)[None, :]

    # Bilinear sample: (height, width)
    top_left = global_elev[r0[:, None], c0[None, :]]
    top_right = global_elev[r0[:, None], c1[None, :]]
    bottom_left = global_elev[r1[:, None], c0[None, :]]
    bottom_right = global_elev[r1[:, None], c1[None, :]]

    top = (1.0 - fc) * top_left + fc * top_right
    bottom = (1.0 - fc) * bottom_left + fc * bottom_right
    elev_grid = (1.0 - fr) * top + fr * bottom

    return elev_grid.astype(np.float32)

def process_region(region: dict):
    reg_id = region["id"]
    name = region["name"]
    min_lon = region["min_lon"]
    max_lon = region["max_lon"]
    min_lat = region["min_lat"]
    max_lat = region["max_lat"]
    width = region["width"]
    height = region["height"]
    s3_prefixes = region.get("s3_prefixes", [region.get("s3_prefix")])

    print(f"\n====================================================================")
    print(f"[CUDEM] Processing region '{name}' ({reg_id})")
    print(f"        Bounds: Lon [{min_lon}, {max_lon}], Lat [{min_lat}, {max_lat}]")
    print(f"        Dimensions: {width} x {height} ({width * height * 8 / (1024*1024):.1f} MB uint16)")
    print(f"====================================================================")

    # 1. Initialize regional elevation grid from global DEM base
    elev_matrix = load_global_dem_base(min_lon, max_lon, min_lat, max_lat, width, height)

    # 2. List matching CUDEM tiles on NOAA S3 across all configured prefixes
    matching_keys = []
    tile_coord_pattern = re.compile(r'n(\d+)x(\d+)_w(\d+)x(\d+)')

    for prefix in s3_prefixes:
        print(f"[CUDEM] Querying S3 prefix: {prefix}...")
        s3_keys = list_s3_tiles(prefix)
        print(f"[CUDEM] Found {len(s3_keys)} total tiles under {prefix}.")

        for k in s3_keys:
            m = tile_coord_pattern.search(k)
            if m:
                t_lat = int(m.group(1)) + int(m.group(2)) / 100.0
                t_lon = -(int(m.group(3)) + int(m.group(4)) / 100.0)
                # A 0.25° tile covers [t_lat - 0.25, t_lat] (or [t_lat, t_lat + 0.25]) and [t_lon, t_lon + 0.25]
                # Check overlap with region bounds with small margin
                if (t_lon + 0.30 >= min_lon and t_lon - 0.05 <= max_lon and
                    t_lat + 0.05 >= min_lat and t_lat - 0.30 <= max_lat):
                    matching_keys.append((k, t_lat, t_lon))

    print(f"[CUDEM] {len(matching_keys)} tiles intersect region '{name}'.")

    # 3. Concurrent download of tiles
    local_files = []
    os.makedirs(os.path.join(CACHE_DIR, reg_id), exist_ok=True)

    print(f"[CUDEM] Downloading {len(matching_keys)} GeoTIFF tiles to cache...")
    download_tasks = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        for k, t_lat, t_lon in matching_keys:
            fname = os.path.basename(k)
            local_path = os.path.join(CACHE_DIR, reg_id, fname)
            url = f"{S3_BASE_URL}/{k}"
            future = executor.submit(download_file, url, local_path)
            download_tasks.append((future, local_path, t_lat, t_lon, fname))

        for future, local_path, t_lat, t_lon, fname in download_tasks:
            success = future.result()
            if success:
                local_files.append((local_path, t_lat, t_lon, fname))

    print(f"[CUDEM] Successfully cached {len(local_files)} / {len(matching_keys)} tiles.")

    # 4. Mosaic tiles onto regional elevation grid
    print(f"[CUDEM] Mosaicing GeoTIFF tiles into {width}x{height} regional grid...")
    tiles_applied = 0

    for local_path, t_lat, t_lon, fname in local_files:
        try:
            with tifffile.TiffFile(local_path) as tif:
                page = tif.pages[0]
                tiepoint = None
                pixel_scale = None
                for tag in page.tags:
                    if tag.name == 'ModelTiepointTag':
                        tiepoint = tag.value
                    elif tag.name == 'ModelPixelScaleTag':
                        pixel_scale = tag.value

                data = tif.asarray()
                if data is None or data.size == 0:
                    continue

            # Determine geographic coordinates of tile
            th, tw = data.shape
            if tiepoint and pixel_scale:
                lon_origin = tiepoint[3]
                lat_origin = tiepoint[4]
                scale_x = pixel_scale[0]
                scale_y = pixel_scale[1]
                tile_max_lat = lat_origin
                tile_min_lat = lat_origin - th * scale_y
                tile_min_lon = lon_origin
                tile_max_lon = lon_origin + tw * scale_x
            else:
                # Approximate 0.25° grid bounding box fallback
                tile_max_lat = t_lat
                tile_min_lat = t_lat - 0.25
                tile_min_lon = t_lon
                tile_max_lon = t_lon + 0.25

            # Calculate destination pixel box in regional grid
            c_start = int(np.round((tile_min_lon - min_lon) / (max_lon - min_lon) * width))
            c_end = int(np.round((tile_max_lon - min_lon) / (max_lon - min_lon) * width))
            r_start = int(np.round((max_lat - tile_max_lat) / (max_lat - min_lat) * height))
            r_end = int(np.round((max_lat - tile_min_lat) / (max_lat - min_lat) * height))

            c_start = max(0, min(width, c_start))
            c_end = max(0, min(width, c_end))
            r_start = max(0, min(height, r_start))
            r_end = max(0, min(height, r_end))

            box_w = c_end - c_start
            box_h = r_end - r_start

            if box_w <= 0 or box_h <= 0:
                continue

            # Clean nodata values (-999999, -9999, NaNs, < -10000)
            valid_mask = (data > -10000.0) & (data < 10000.0) & (~np.isnan(data))
            if not np.any(valid_mask):
                continue

            # Extract destination slice of global DEM base to replace nodata seamlessly
            base_slice = elev_matrix[r_start:r_end, c_start:c_end]
            # Resize base slice up to tile dimensions for nodata backfill
            base_img = Image.fromarray(base_slice, mode='F')
            base_upsampled = np.array(base_img.resize((tw, th), resample=Image.BILINEAR), dtype=np.float32)

            filled_tile = np.where(valid_mask, data, base_upsampled).astype(np.float32)

            # Resample filled tile to destination box size
            tile_img = Image.fromarray(filled_tile, mode='F')
            resampled_tile = np.array(tile_img.resize((box_w, box_h), resample=Image.BILINEAR), dtype=np.float32)

            # Blend into destination matrix
            elev_matrix[r_start:r_end, c_start:c_end] = resampled_tile
            tiles_applied += 1

        except Exception as e:
            print(f"[CUDEM] Error mosaicing {fname}: {e}")

    print(f"[CUDEM] Mosaiced {tiles_applied} tiles into '{name}'. Elevation range: {np.nanmin(elev_matrix):.1f}m to {np.nanmax(elev_matrix):.1f}m.")

    # 5. Pack into 4-channel rgba16unorm format (exact parity with global ETOPO DEM)
    print(f"[CUDEM] Packing into rgba16unorm (R: land, G: ocean, B: mask, A: full-range)...")

    # Channel 0 (R): Land elevation (0 to +8,848m)
    land_elev = np.clip(elev_matrix, 0.0, Z_MAX_LAND)
    r16 = np.round((land_elev / Z_MAX_LAND) * 65535.0).astype(np.uint16)

    # Channel 1 (G): Ocean bathymetry (0 to 10,924m depth)
    ocean_depth = np.clip(-elev_matrix, 0.0, D_MAX_OCEAN)
    g16 = np.round((ocean_depth / D_MAX_OCEAN) * 65535.0).astype(np.uint16)

    # Channel 2 (B): Continuous shoreline land mask with antialiasing
    is_land = (elev_matrix > 0.0).astype(np.float32)
    try:
        from scipy.ndimage import uniform_filter
        shoreline = uniform_filter(is_land, size=3, mode='nearest')
    except ImportError:
        shoreline = is_land
    b16 = np.round(np.clip(shoreline, 0.0, 1.0) * 65535.0).astype(np.uint16)

    # Channel 3 (A): Continuous full-range signed normalized elevation [-10,924m .. +8,848m]
    z_norm = np.clip((elev_matrix - Z_MIN_GLOBAL) / Z_SPAN, 0.0, 1.0)
    a16 = np.round(z_norm * 65535.0).astype(np.uint16)

    packed16 = np.stack([r16, g16, b16, a16], axis=-1)

    # Write .bin file
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    bin_path = os.path.join(OUTPUT_DIR, region["bin_filename"])
    packed16.tofile(bin_path)
    print(f"[CUDEM] Saved uint16 binary texture: {bin_path} ({packed16.nbytes / (1024*1024):.2f} MB)")

    # Write 8-bit WebP fallback
    r8 = (r16 >> 8).astype(np.uint8)
    g8 = (g16 >> 8).astype(np.uint8)
    b8 = (b16 >> 8).astype(np.uint8)
    a8 = (a16 >> 8).astype(np.uint8)
    rgba8 = np.stack([r8, g8, b8, a8], axis=-1)
    webp_path = os.path.join(OUTPUT_DIR, region["webp_filename"])
    out_img = Image.fromarray(rgba8, 'RGBA')
    out_img.save(webp_path, lossless=True, quality=100, method=6)
    print(f"[CUDEM] Saved lossless WebP fallback: {webp_path} ({os.path.getsize(webp_path) / (1024*1024):.2f} MB)")

    return {
        "id": reg_id,
        "name": name,
        "bounds": {
            "minLon": min_lon,
            "maxLon": max_lon,
            "minLat": min_lat,
            "maxLat": max_lat,
        },
        "width": width,
        "height": height,
        "binUrl": f"/regional/{region['bin_filename']}",
        "webpUrl": f"/regional/{region['webp_filename']}",
        "minElevationMeters": float(np.nanmin(elev_matrix)),
        "maxElevationMeters": float(np.nanmax(elev_matrix)),
    }

def main():
    t_start = time.time()
    print("=== INDICATRIX REGIONAL HIGH-RESOLUTION DEM PRECOMPUTATION ===")

    manifest_entries = []
    for region in REGIONS:
        entry = process_region(region)
        manifest_entries.append(entry)

    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    manifest_data = {
        "version": "1.0",
        "description": "High-Resolution NOAA CUDEM Regional Elevation Overlays (1/3 arc-second ~10m)",
        "elevationEncoding": {
            "zMin": Z_MIN_GLOBAL,
            "zMax": Z_MAX_GLOBAL,
            "zSpan": Z_SPAN,
            "channels": {
                "R": "land_elevation_normalized_to_8848m",
                "G": "ocean_depth_normalized_to_10924m",
                "B": "shoreline_land_mask",
                "A": "full_range_signed_elevation_normalized"
            }
        },
        "regions": manifest_entries
    }

    with open(manifest_path, "w") as f:
        json.dump(manifest_data, f, indent=2)

    print(f"\n[CUDEM] Successfully wrote {manifest_path}")
    print(f"[CUDEM] All regions precomputed in {time.time() - t_start:.1f}s.")

if __name__ == "__main__":
    main()
