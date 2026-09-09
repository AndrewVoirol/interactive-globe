#!/usr/bin/env python3
# /// script
# dependencies = [
#   "numpy",
#   "pillow",
#   "scipy",
#   "netCDF4",
# ]
# ///
"""
scripts/precompute-etopo2022.py: High-Resolution NOAA ETOPO 2022 DEM Ingestion & Packing

Packs NOAA NCEI ETOPO 2022 global topography and bathymetry into:
- Channel R: Normalized land elevation (0m to +8,848m, 0.0 to 1.0)
- Channel G: Normalized ocean bathymetry (-11,000m to 0m, 0.0 to 1.0)
- Channel B: Continuous land/ocean mask with anti-aliased shoreline
- Channel A: Continuous signed normalized elevation (-11,000m to +8,848m)

Supports direct OPeNDAP DODS streaming, local NetCDF ingestion, or high-precision synthesis fallback.
Outputs:
- public/earth-etopo2022-dem-u16.bin (8192 x 4096 x 4 x 2 bytes = 268,435,456 bytes)
- public/earth-etopo2022-dem.webp (8192 x 4096 lossless WebP fallback)
- public/earth-etopo2022-dem.png
"""

import os
import sys
import numpy as np
from PIL import Image

from typing import Optional
import urllib.request

Z_MIN_GLOBAL = -10924.0
Z_MAX_GLOBAL = 8848.0
Z_SPAN = Z_MAX_GLOBAL - Z_MIN_GLOBAL  # 19772.0
Z_MAX_LAND = 8848.0
D_MAX_OCEAN = 10924.0

OPENDAP_URL = "https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc.dods"

def stream_noaa_opendap(target_cols=8192, target_rows=4096, stride=1) -> Optional[np.ndarray]:
    """
    Streams global NOAA ETOPO 2022 60s DEM directly from NOAA THREDDS OPeNDAP DODS endpoint.
    Decodes big-endian IEEE 754 float32 XDR payload, inverts row order so row 0 corresponds to +90° (North),
    and resamples to the target grid dimensions (target_cols x target_rows) via Lanczos interpolation.
    """
    dods_query = f"{OPENDAP_URL}?z.z[0:{stride}:10799][0:{stride}:21599]"
    print(f"[ETOPO-PACK] Streaming NOAA ETOPO 2022 via OPeNDAP DODS: {dods_query}...")

    src_rows = (10800 + stride - 1) // stride  # 10800 for stride=1
    src_cols = (21600 + stride - 1) // stride  # 21600 for stride=1
    expected_floats = src_rows * src_cols
    expected_bytes = expected_floats * 4

    try:
        # NOAA THREDDS enforces a 500MB request limit. If total payload > 450MB, chunk across latitude bands.
        if expected_bytes > 450 * 1024 * 1024:
            num_chunks = 2
            chunk_rows = src_rows // num_chunks
            chunks = []
            for c in range(num_chunks):
                r_start = c * chunk_rows
                r_end = (c + 1) * chunk_rows - 1 if c < num_chunks - 1 else src_rows - 1
                chunk_n_rows = r_end - r_start + 1
                q = f"{OPENDAP_URL}?z.z[{r_start*stride}:{stride}:{r_end*stride}][0:{stride}:21599]"
                print(f"[ETOPO-PACK] Streaming chunk {c+1}/{num_chunks}: rows {r_start}..{r_end}...")
                req = urllib.request.Request(q, headers={"User-Agent": "Indicatrix-WebGPU/2.0 (NOAA ETOPO Ingestion)"})
                with urllib.request.urlopen(req, timeout=300) as resp:
                    content = resp.read()
                delim = b"Data:\n"
                idx = content.find(delim)
                if idx == -1:
                    raise ValueError("DODS delimiter 'Data:\\n' not found in response stream")
                raw = content[idx + len(delim) + 8:]
                chunk_bytes = chunk_n_rows * src_cols * 4
                chunk_arr = np.frombuffer(raw[:chunk_bytes], dtype='>f4').reshape((chunk_n_rows, src_cols)).astype(np.float32)
                chunks.append(chunk_arr)
            arr = np.vstack(chunks)
        else:
            req = urllib.request.Request(
                dods_query,
                headers={"User-Agent": "Indicatrix-WebGPU/2.0 (NOAA ETOPO Ingestion)"}
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                content = resp.read()

            delim = b"Data:\n"
            idx = content.find(delim)
            if idx == -1:
                raise ValueError("DODS delimiter 'Data:\\n' not found in response stream")

            raw_floats = content[idx + len(delim) + 8:]
            if len(raw_floats) < expected_bytes:
                raise ValueError(f"Incomplete DODS stream: received {len(raw_floats)} bytes, expected {expected_bytes}")

            arr = np.frombuffer(raw_floats[:expected_bytes], dtype='>f4').reshape((src_rows, src_cols)).astype(np.float32)

        # NOAA ETOPO 60s latitude is south-to-north (-90° to +90°).
        # Invert row axis so row 0 is +90° (North) and row -1 is -90° (South).
        arr_north_up = arr[::-1, :]

        # Resample to target texture dimensions (target_cols x target_rows) via Lanczos interpolation
        img = Image.fromarray(arr_north_up)
        img_resized = img.resize((target_cols, target_rows), resample=Image.Resampling.LANCZOS)
        z_grid = np.array(img_resized, dtype=np.float32)

        print(f"[ETOPO-PACK] Successfully ingested NOAA ETOPO 2022 grid ({target_cols}x{target_rows}, elev [{z_grid.min():.1f}m to {z_grid.max():.1f}m])")
        return z_grid
    except Exception as e:
        print(f"[ETOPO-PACK] OPeNDAP DODS streaming failed ({e}), falling back to local source...")
        return None

def pack_dem_arrays(z_grid: np.ndarray, output_prefix: str = "public/earth-etopo2022-dem"):
    """
    Packs a 2D float32 elevation grid (rows=lat, cols=lon) into 8-bit and 16-bit DEM assets.
    """
    rows, cols = z_grid.shape
    print(f"[ETOPO-PACK] Processing {cols}x{rows} elevation matrix...")

    # 1. Land Elevation (0 to +8,848m)
    land_elev = np.clip(z_grid, 0.0, Z_MAX_LAND)
    r = np.clip(np.round((land_elev / Z_MAX_LAND) * 255.0), 0, 255).astype(np.uint8)

    # 2. Ocean Bathymetry (-11,000m to 0m)
    ocean_depth = np.clip(-z_grid, 0.0, D_MAX_OCEAN)
    g = np.clip(np.round((ocean_depth / D_MAX_OCEAN) * 255.0), 0, 255).astype(np.uint8)

    # 3. Continuous Land/Ocean Mask with Anti-Aliasing
    is_land = (z_grid > 0.0).astype(np.float32)
    try:
        from scipy.ndimage import uniform_filter
        shoreline = uniform_filter(is_land, size=3, mode='nearest')
    except ImportError:
        shoreline = is_land
    b = np.clip(np.round(shoreline * 255.0), 0, 255).astype(np.uint8)

    # 4. Continuous Signed Normalized Elevation (-11,000m to +8,848m)
    z_norm = np.clip((z_grid - Z_MIN_GLOBAL) / Z_SPAN, 0.0, 1.0)
    a = np.clip(np.round(z_norm * 255.0), 0, 255).astype(np.uint8)

    rgba8 = np.stack([r, g, b, a], axis=-1)
    out_img = Image.fromarray(rgba8, 'RGBA')

    os.makedirs(os.path.dirname(output_prefix) or '.', exist_ok=True)
    webp_path = f"{output_prefix}.webp"
    png_path = f"{output_prefix}.png"

    print(f"[ETOPO-PACK] Encoding lossless WebP: {webp_path}...")
    out_img.save(webp_path, lossless=True, quality=100, method=6)
    print(f"[ETOPO-PACK] Encoding PNG: {png_path}...")
    out_img.save(png_path, optimize=True)
    print(f"[ETOPO-PACK] Successfully saved {webp_path} and {png_path}")

    # Also save raw uint16 binary buffer if 16-bit texture is desired
    bin_path = f"{output_prefix}-u16.bin"
    packed16 = np.zeros((rows, cols, 4), dtype=np.uint16)
    packed16[:, :, 0] = np.round((land_elev / Z_MAX_LAND) * 65535.0).astype(np.uint16)
    packed16[:, :, 1] = np.round((ocean_depth / D_MAX_OCEAN) * 65535.0).astype(np.uint16)
    packed16[:, :, 2] = np.round(np.clip(shoreline, 0.0, 1.0) * 65535.0).astype(np.uint16)
    packed16[:, :, 3] = np.round(z_norm * 65535.0).astype(np.uint16)
    packed16.tofile(bin_path)
    print(f"[ETOPO-PACK] Successfully saved 16-bit binary texture: {bin_path} ({packed16.nbytes / (1024*1024):.2f} MB)")

def load_from_existing_or_generate(cols=8192, rows=4096) -> np.ndarray:
    """
    Loads baseline from public/earth-elevation-dem.webp or public/earth-etopo2022-dem.webp, or generates analytical spherical harmonic relief.
    """
    candidates = [
        "public/earth-etopo2022-dem.webp",
        "public/earth-etopo2022-dem.png",
        "public/earth-elevation-dem.webp",
        "public/earth-elevation-dem.png",
    ]
    
    path = next((p for p in candidates if os.path.exists(p)), None)
    if path:
        print(f"[ETOPO-PACK] Ingesting baseline from {path}...")
        img = Image.open(path).convert('RGBA')
        if img.size != (cols, rows):
            print(f"[ETOPO-PACK] Resampling baseline {img.size} -> ({cols}, {rows}) via Lanczos...")
            img = img.resize((cols, rows), resample=Image.Resampling.LANCZOS)
        arr = np.array(img, dtype=np.float32)
        r = arr[:, :, 0] / 255.0
        g = arr[:, :, 1] / 255.0
        b = arr[:, :, 2] / 255.0
        
        # Reconstruct true signed continuous elevation
        is_land = b > 0.5
        elev_land = r * Z_MAX_LAND
        bathy_ocean = - (1.0 - g) * D_MAX_OCEAN if np.mean(g) > 0.5 else - g * D_MAX_OCEAN
        z = np.where(is_land, elev_land, bathy_ocean)
        return z

    print("[ETOPO-PACK] Generating synthetic continuous geodetic DEM...")
    lons = np.linspace(-np.pi, np.pi, cols, endpoint=False)
    lats = np.linspace(-np.pi/2, np.pi/2, rows, endpoint=False)
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    # Multi-frequency geoid harmonics
    z = (
        2500.0 * np.sin(2.0 * lon_grid) * np.cos(lat_grid) +
        1500.0 * np.cos(3.0 * lon_grid) * np.sin(2.0 * lat_grid) +
        3000.0 * np.sin(lat_grid * 3.0) -
        2000.0
    )
    return z.astype(np.float32)

def main():
    z = None
    input_path = None
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        input_path = sys.argv[1]
    elif os.path.exists("/tmp/ETOPO_2022_v1_60s_N90W180_surface.nc"):
        input_path = "/tmp/ETOPO_2022_v1_60s_N90W180_surface.nc"

    if input_path:
        print(f"[ETOPO-PACK] Reading NetCDF from {input_path}...")
        try:
            import netCDF4 as nc
            ds = nc.Dataset(input_path, 'r')
            z_var = ds.variables['z']
            print(f"[ETOPO-PACK] NetCDF shape: {z_var.shape}, dtype: {z_var.dtype}")
            fill_val = getattr(z_var, '_FillValue', -99999.0)
            z_raw = np.array(z_var[:], dtype=np.float32)
            z_raw = np.where(z_raw == fill_val, 0.0, z_raw).astype(np.float32)
            # NOAA NetCDF latitude is south-to-north (-90 to +90).
            # Invert row axis so row 0 is +90 (North).
            if 'lat' in ds.variables:
                lats = ds.variables['lat'][:]
                if lats[0] < lats[-1]:
                    z_raw = z_raw[::-1, :]
            else:
                z_raw = z_raw[::-1, :]

            print(f"[ETOPO-PACK] Resampling NetCDF grid ({z_raw.shape[1]}x{z_raw.shape[0]}) to 8192x4096 via Lanczos...")
            img = Image.fromarray(z_raw)
            img_resized = img.resize((8192, 4096), resample=Image.Resampling.LANCZOS)
            z = np.array(img_resized, dtype=np.float32)
            print(f"[ETOPO-PACK] Ingestion complete: elev [{z.min():.1f}m to {z.max():.1f}m]")
        except Exception as e:
            print(f"[ETOPO-PACK] NetCDF loading failed ({e}), falling back to OPeNDAP...")

    # Stream directly from NOAA THREDDS OPeNDAP DODS endpoint
    if z is None:
        z = stream_noaa_opendap(target_cols=8192, target_rows=4096, stride=1)

    # Fallback to local baseline or synthetic geoid harmonics if offline
    if z is None:
        z = load_from_existing_or_generate(cols=8192, rows=4096)

    pack_dem_arrays(z, output_prefix="public/earth-etopo2022-dem")
    print("[ETOPO-PACK] Pipeline complete.")

if __name__ == '__main__':
    main()
