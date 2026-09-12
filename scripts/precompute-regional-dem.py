#!/usr/bin/env python3
"""
scripts/precompute-regional-dem.py: High-Resolution Regional DEM Ingestion & Packing

Precomputes regional DEM insets for litmus test regions:
1. Hawaii (18°N-23°N, 161°W-154°W): 5400 x 3600 pixels (~155 MB raw uint16) - NOAA CUDEM
2. Cape Cod (41°N-43°N, 71°W-69°W): 2400 x 2400 pixels (~46 MB raw uint16) - NOAA CUDEM
3. Grand Canyon (35.9°N-36.5°N, 112.5°W-111.5°W): 900 x 540 pixels (~3.89 MB rgba16unorm) - USGS 3DEP (1 arc-sec ~30m)
4. Mount Fuji (35.2°N-35.5°N, 138.5°E-139.0°E): 900 x 540 pixels (~3.89 MB rgba16unorm) - Copernicus GLO-30 (~30m)

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
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

# Elevation packing constants (exact parity with global DEM and crust_hydrosphere.wgsl)
Z_MIN_GLOBAL = -10924.0
Z_MAX_GLOBAL = 8848.0
Z_SPAN = Z_MAX_GLOBAL - Z_MIN_GLOBAL  # 19772.0
Z_MAX_LAND = 8848.0
D_MAX_OCEAN = 10924.0

CACHE_DIR = "/tmp/regional_dem_cache"
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
    {
        "id": "grand-canyon",
        "name": "Grand Canyon",
        "min_lon": -112.5,
        "max_lon": -111.5,
        "min_lat": 35.9,
        "max_lat": 36.5,
        "width": 900,
        "height": 540,
        "direct_urls": [
            "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current/n37w113/USGS_1_n37w113.tif",
            "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current/n37w112/USGS_1_n37w112.tif",
            "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current/n36w113/USGS_1_n36w113.tif",
            "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current/n36w112/USGS_1_n36w112.tif",
        ],
        "bin_filename": "dem-grand-canyon-30m.bin",
        "webp_filename": "dem-grand-canyon-30m.webp",
    },
    {
        "id": "fuji",
        "name": "Mount Fuji",
        "min_lon": 138.5,
        "max_lon": 139.0,
        "min_lat": 35.2,
        "max_lat": 35.5,
        "width": 900,
        "height": 540,
        "direct_urls": [
            "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/Copernicus_DSM_COG_10_N35_00_E138_00_DEM/Copernicus_DSM_COG_10_N35_00_E138_00_DEM.tif",
        ],
        "bin_filename": "dem-fuji-30m.bin",
        "webp_filename": "dem-fuji-30m.webp",
    },
]

def box_filter_3x3(arr: np.ndarray) -> np.ndarray:
    """Vectorized 3x3 uniform box filter using numpy padding."""
    h, w = arr.shape
    padded = np.pad(arr, 1, mode='edge')
    return (
        padded[0:h, 0:w] + padded[0:h, 1:w+1] + padded[0:h, 2:w+2] +
        padded[1:h+1, 0:w] + padded[1:h+1, 1:w+1] + padded[1:h+1, 2:w+2] +
        padded[2:h+2, 0:w] + padded[2:h+2, 1:w+1] + padded[2:h+2, 2:w+2]
    ) / 9.0

def read_geotiff(path: str):
    """
    Reads a GeoTIFF returning (data_array, tiepoint, pixel_scale).
    Uses tifffile if installed, otherwise Pillow Image.
    """
    try:
        import tifffile
        with tifffile.TiffFile(path) as tif:
            page = tif.pages[0]
            tiepoint = None
            pixel_scale = None
            for tag in page.tags:
                if tag.name == 'ModelTiepointTag':
                    tiepoint = tag.value
                elif tag.name == 'ModelPixelScaleTag':
                    pixel_scale = tag.value
            data = tif.asarray()
            return data.astype(np.float32), tiepoint, pixel_scale
    except Exception:
        pass

    with Image.open(path) as img:
        tiepoint = img.tag_v2.get(33922)
        pixel_scale = img.tag_v2.get(33550)
        data = np.array(img, dtype=np.float32)
        return data, tiepoint, pixel_scale

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
            with urllib.request.urlopen(req, timeout=60) as resp, open(temp_path, "wb") as out:
                chunk_size = 1024 * 128
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out.write(chunk)
            os.replace(temp_path, dest_path)
            return True
        except Exception as e:
            if attempt == retries - 1:
                print(f"[DEM] Failed to download {url}: {e}")
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                return False
            time.sleep(1.0)
    return False

def load_global_dem_base(min_lon: float, max_lon: float, min_lat: float, max_lat: float, width: int, height: int) -> np.ndarray:
    """
    Samples the global ETOPO 2022 8K DEM to provide seamless baseline elevation for any region.
    """
    print(f"[DEM] Sampling global DEM base for Lon [{min_lon}, {max_lon}], Lat [{min_lat}, {max_lat}] ({width}x{height})...")
    if not os.path.exists(GLOBAL_DEM_PATH):
        print(f"[DEM] WARNING: {GLOBAL_DEM_PATH} not found; initializing zero base.")
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

def process_region(region: dict, force: bool = False):
    reg_id = region["id"]
    name = region["name"]
    min_lon = region["min_lon"]
    max_lon = region["max_lon"]
    min_lat = region["min_lat"]
    max_lat = region["max_lat"]
    width = region["width"]
    height = region["height"]

    bin_path = os.path.join(OUTPUT_DIR, region["bin_filename"])
    webp_path = os.path.join(OUTPUT_DIR, region["webp_filename"])

    # If outputs exist and force is not set, load existing metadata without re-downloading
    if not force and os.path.exists(bin_path) and os.path.exists(webp_path):
        target_bytes = width * height * 8
        actual_bytes = os.path.getsize(bin_path)
        if actual_bytes == target_bytes:
            print(f"[DEM] Region '{name}' already exists at {bin_path} ({actual_bytes} bytes). Reusing asset.")
            # Read elevation metrics from existing binary
            raw_data = np.fromfile(bin_path, dtype=np.uint16).reshape((height, width, 4))
            elev_approx = (raw_data[:, :, 3].astype(np.float32) / 65535.0) * Z_SPAN + Z_MIN_GLOBAL
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
                "minElevationMeters": float(np.nanmin(elev_approx)),
                "maxElevationMeters": float(np.nanmax(elev_approx)),
            }

    print(f"\n====================================================================")
    print(f"[DEM] Processing region '{name}' ({reg_id})")
    print(f"      Bounds: Lon [{min_lon}, {max_lon}], Lat [{min_lat}, {max_lat}]")
    print(f"      Dimensions: {width} x {height} ({width * height * 8 / (1024*1024):.2f} MB rgba16unorm)")
    print(f"====================================================================")

    # 1. Initialize regional elevation grid from global DEM base
    elev_matrix = load_global_dem_base(min_lon, max_lon, min_lat, max_lat, width, height)

    # 2. Gather tiles (either from direct URLs or S3 prefix listing)
    tile_downloads = []  # (url, fname, fallback_t_lat, fallback_t_lon)
    if "direct_urls" in region:
        for u in region["direct_urls"]:
            fname = os.path.basename(u)
            tile_downloads.append((u, fname, None, None))
    elif "s3_prefixes" in region:
        tile_coord_pattern = re.compile(r'n(\d+)x(\d+)_w(\d+)x(\d+)')
        for prefix in region["s3_prefixes"]:
            print(f"[DEM] Querying S3 prefix: {prefix}...")
            s3_keys = list_s3_tiles(prefix)
            print(f"[DEM] Found {len(s3_keys)} total tiles under {prefix}.")
            for k in s3_keys:
                m = tile_coord_pattern.search(k)
                if m:
                    t_lat = int(m.group(1)) + int(m.group(2)) / 100.0
                    t_lon = -(int(m.group(3)) + int(m.group(4)) / 100.0)
                    if (t_lon + 0.30 >= min_lon and t_lon - 0.05 <= max_lon and
                        t_lat + 0.05 >= min_lat and t_lat - 0.30 <= max_lat):
                        url = f"{S3_BASE_URL}/{k}"
                        fname = os.path.basename(k)
                        tile_downloads.append((url, fname, t_lat, t_lon))

    print(f"[DEM] {len(tile_downloads)} tiles to download/mosaic for region '{name}'.")

    # 3. Concurrent download of tiles
    local_files = []
    os.makedirs(os.path.join(CACHE_DIR, reg_id), exist_ok=True)

    print(f"[DEM] Downloading {len(tile_downloads)} GeoTIFF tiles to cache...")
    download_tasks = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        for url, fname, t_lat, t_lon in tile_downloads:
            local_path = os.path.join(CACHE_DIR, reg_id, fname)
            future = executor.submit(download_file, url, local_path)
            download_tasks.append((future, local_path, t_lat, t_lon, fname))

        for future, local_path, t_lat, t_lon, fname in download_tasks:
            success = future.result()
            if success:
                local_files.append((local_path, t_lat, t_lon, fname))

    print(f"[DEM] Successfully cached {len(local_files)} / {len(tile_downloads)} tiles.")

    # 4. Mosaic tiles onto regional elevation grid with exact spatial intersection
    print(f"[DEM] Mosaicing GeoTIFF tiles into {width}x{height} regional grid...")
    tiles_applied = 0

    for local_path, t_lat, t_lon, fname in local_files:
        try:
            data, tiepoint, pixel_scale = read_geotiff(local_path)
            if data is None or data.size == 0:
                continue

            th, tw = data.shape
            if tiepoint and pixel_scale:
                lon_origin = float(tiepoint[3])
                lat_origin = float(tiepoint[4])
                scale_x = float(pixel_scale[0])
                scale_y = float(pixel_scale[1])
                tile_max_lat = lat_origin
                tile_min_lat = lat_origin - th * scale_y
                tile_min_lon = lon_origin
                tile_max_lon = lon_origin + tw * scale_x
            elif t_lat is not None and t_lon is not None:
                tile_max_lat = float(t_lat)
                tile_min_lat = float(t_lat) - 0.25
                tile_min_lon = float(t_lon)
                tile_max_lon = float(t_lon) + 0.25
            else:
                print(f"[DEM] Warning: Could not determine bounding box for {fname}")
                continue

            # Compute geographic overlap between tile and regional bounds
            ov_min_lon = max(tile_min_lon, min_lon)
            ov_max_lon = min(tile_max_lon, max_lon)
            ov_min_lat = max(tile_min_lat, min_lat)
            ov_max_lat = min(tile_max_lat, max_lat)

            if ov_min_lon >= ov_max_lon or ov_min_lat >= ov_max_lat:
                continue

            # Source slice indices in the GeoTIFF
            src_c_start = int(np.clip(np.round((ov_min_lon - tile_min_lon) / (tile_max_lon - tile_min_lon) * tw), 0, tw))
            src_c_end = int(np.clip(np.round((ov_max_lon - tile_min_lon) / (tile_max_lon - tile_min_lon) * tw), 0, tw))
            src_r_start = int(np.clip(np.round((tile_max_lat - ov_max_lat) / (tile_max_lat - tile_min_lat) * th), 0, th))
            src_r_end = int(np.clip(np.round((tile_max_lat - ov_min_lat) / (tile_max_lat - tile_min_lat) * th), 0, th))

            if src_c_end <= src_c_start or src_r_end <= src_r_start:
                continue

            tile_sub = data[src_r_start:src_r_end, src_c_start:src_c_end]
            sub_h, sub_w = tile_sub.shape

            # Destination box in the regional elevation matrix
            dst_c_start = int(np.clip(np.round((ov_min_lon - min_lon) / (max_lon - min_lon) * width), 0, width))
            dst_c_end = int(np.clip(np.round((ov_max_lon - min_lon) / (max_lon - min_lon) * width), 0, width))
            dst_r_start = int(np.clip(np.round((max_lat - ov_max_lat) / (max_lat - min_lat) * height), 0, height))
            dst_r_end = int(np.clip(np.round((max_lat - ov_min_lat) / (max_lat - min_lat) * height), 0, height))

            box_w = dst_c_end - dst_c_start
            box_h = dst_r_end - dst_r_start

            if box_w <= 0 or box_h <= 0:
                continue

            # Clean nodata values (-999999, -9999, NaNs, < -10000, > 10000)
            valid_mask = (tile_sub > -10000.0) & (tile_sub < 10000.0) & (~np.isnan(tile_sub))
            if not np.any(valid_mask):
                continue

            # Extract destination slice from global DEM base to replace nodata seamlessly
            base_slice = elev_matrix[dst_r_start:dst_r_end, dst_c_start:dst_c_end]
            base_img = Image.fromarray(base_slice, mode='F')
            base_upsampled = np.array(base_img.resize((sub_w, sub_h), resample=Image.BILINEAR), dtype=np.float32)

            filled_sub = np.where(valid_mask, tile_sub, base_upsampled).astype(np.float32)

            # Resample filled sub-tile to destination box size
            sub_img = Image.fromarray(filled_sub, mode='F')
            resampled_sub = np.array(sub_img.resize((box_w, box_h), resample=Image.BILINEAR), dtype=np.float32)

            # Place into destination matrix
            elev_matrix[dst_r_start:dst_r_end, dst_c_start:dst_c_end] = resampled_sub
            tiles_applied += 1

        except Exception as e:
            print(f"[DEM] Error mosaicing {fname}: {e}")

    print(f"[DEM] Mosaiced {tiles_applied} tiles into '{name}'. Elevation range: {np.nanmin(elev_matrix):.1f}m to {np.nanmax(elev_matrix):.1f}m.")

    # 5. Pack into 4-channel rgba16unorm format (exact parity with global ETOPO DEM)
    print(f"[DEM] Packing into rgba16unorm (R: land, G: ocean, B: mask, A: full-range)...")

    # Channel 0 (R): Land elevation (0 to +8,848m)
    land_elev = np.clip(elev_matrix, 0.0, Z_MAX_LAND)
    r16 = np.round((land_elev / Z_MAX_LAND) * 65535.0).astype(np.uint16)

    # Channel 1 (G): Ocean bathymetry (0 to 10,924m depth)
    ocean_depth = np.clip(-elev_matrix, 0.0, D_MAX_OCEAN)
    g16 = np.round((ocean_depth / D_MAX_OCEAN) * 65535.0).astype(np.uint16)

    # Channel 2 (B): Continuous shoreline land mask with antialiasing
    is_land = (elev_matrix > 0.0).astype(np.float32)
    shoreline = box_filter_3x3(is_land)
    b16 = np.round(np.clip(shoreline, 0.0, 1.0) * 65535.0).astype(np.uint16)

    # Channel 3 (A): Continuous full-range signed normalized elevation [-10,924m .. +8,848m]
    z_norm = np.clip((elev_matrix - Z_MIN_GLOBAL) / Z_SPAN, 0.0, 1.0)
    a16 = np.round(z_norm * 65535.0).astype(np.uint16)

    packed16 = np.stack([r16, g16, b16, a16], axis=-1)

    # Write .bin file
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    packed16.tofile(bin_path)
    print(f"[DEM] Saved uint16 binary texture: {bin_path} ({packed16.nbytes} bytes / {packed16.nbytes / (1024*1024):.2f} MB)")

    # Write 8-bit WebP fallback
    r8 = (r16 >> 8).astype(np.uint8)
    g8 = (g16 >> 8).astype(np.uint8)
    b8 = (b16 >> 8).astype(np.uint8)
    a8 = (a16 >> 8).astype(np.uint8)
    rgba8 = np.stack([r8, g8, b8, a8], axis=-1)
    out_img = Image.fromarray(rgba8, 'RGBA')
    out_img.save(webp_path, lossless=True, quality=100, method=6)
    print(f"[DEM] Saved lossless WebP fallback: {webp_path} ({os.path.getsize(webp_path) / (1024*1024):.2f} MB)")

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
    force = "--force" in sys.argv

    manifest_entries = []
    for region in REGIONS:
        entry = process_region(region, force=force)
        manifest_entries.append(entry)

    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    manifest_data = {
        "version": "1.0",
        "description": "High-Resolution Regional Elevation Overlays (1/3 arc-second ~10m & 1 arc-second ~30m)",
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

    print(f"\n[DEM] Successfully wrote {manifest_path} with {len(manifest_entries)} regions.")
    print(f"[DEM] All regions precomputed in {time.time() - t_start:.1f}s.")

if __name__ == "__main__":
    main()
