#!/usr/bin/env python3
"""
scripts/convert-regional-to-cog.py: Convert regional DEM binary grids into Cloud-Optimized GeoTIFFs (COGs)

Reads 4-channel rgba16unorm elevation grids from public/regional/*.bin,
extracts real elevation in meters:
    elev = (a16 / 65535.0) * 19772.0 - 10924.0
and packages them into standard Cloud-Optimized GeoTIFFs (256x256 tiles, DEFLATE compression,
multi-resolution overviews) using Python rasterio (GDAL 3.12+).
"""

import os
import sys
import json
import time
import numpy as np
import rasterio
from rasterio.transform import from_bounds

MANIFEST_PATH = "public/regional/manifest.json"
REGIONAL_DIR = "public/regional"

Z_MIN_GLOBAL = -10924.0
Z_SPAN = 19772.0


def convert_region(region_meta: dict):
    reg_id = region_meta["id"]
    name = region_meta["name"]
    bounds = region_meta["bounds"]
    width = region_meta["width"]
    height = region_meta["height"]

    bin_path = os.path.join(REGIONAL_DIR, os.path.basename(region_meta["binUrl"]))
    if "cogUrl" in region_meta and region_meta["cogUrl"]:
        cog_name = os.path.basename(region_meta["cogUrl"])
    else:
        cog_name = f"{reg_id}.cog.tif"
    cog_path = os.path.join(REGIONAL_DIR, cog_name)

    print(f"\n========================================================")
    print(f" Converting '{name}' ({reg_id}) to Cloud-Optimized GeoTIFF")
    print(f" Source:      {bin_path}")
    print(f" Target:      {cog_path}")
    print(f" Bounds:      Lon [{bounds['minLon']}, {bounds['maxLon']}], Lat [{bounds['minLat']}, {bounds['maxLat']}]")
    print(f" Dimensions:  {width} x {height}")
    print(f"--------------------------------------------------------")

    if not os.path.exists(bin_path):
        print(f"Error: Source binary file '{bin_path}' not found.", file=sys.stderr)
        return False

    t0 = time.time()

    # 1. Read binary array via memory map (preserves RAM)
    u16_mem = np.memmap(bin_path, dtype=np.uint16, mode="r", shape=(height, width, 4))
    a16 = u16_mem[:, :, 3].astype(np.float32)

    # 2. Decode full-range elevation in meters (Rule 8 cross-pipeline DEM parity)
    elev_meters = (a16 / 65535.0) * Z_SPAN + Z_MIN_GLOBAL
    min_elev = float(np.nanmin(elev_meters))
    max_elev = float(np.nanmax(elev_meters))
    print(f" Elevation range: {min_elev:.2f} m to {max_elev:.2f} m")

    # 3. Construct affine geo-transform in EPSG:4326
    transform = from_bounds(
        bounds["minLon"],
        bounds["minLat"],
        bounds["maxLon"],
        bounds["maxLat"],
        width,
        height,
    )

    # 4. Write Cloud-Optimized GeoTIFF
    with rasterio.open(
        cog_path,
        "w",
        driver="COG",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        blocksize=256,
        compress="deflate",
        overview_resampling="bilinear",
        num_threads="ALL_CPUS",
    ) as dst:
        dst.write(elev_meters, 1)

    t1 = time.time()
    in_size = os.path.getsize(bin_path) / (1024 * 1024)
    out_size = os.path.getsize(cog_path) / (1024 * 1024)
    print(f" ✓ Conversion completed in {t1 - t0:.2f} s")
    print(f"   Input binary:  {in_size:.2f} MB")
    print(f"   Output COG:    {out_size:.2f} MB (Compression ratio: {in_size / out_size:.1f}x)")

    return cog_name


def main():
    if not os.path.exists(MANIFEST_PATH):
        print(f"Error: Manifest '{MANIFEST_PATH}' not found.", file=sys.stderr)
        sys.exit(1)

    with open(MANIFEST_PATH, "r") as f:
        manifest = json.load(f)

    results = {}
    for region in manifest.get("regions", []):
        cog_filename = convert_region(region)
        if cog_filename:
            results[region["id"]] = f"/regional/{cog_filename}"

    print(f"\n========================================================")
    print(f" Generated {len(results)} Cloud-Optimized GeoTIFFs:")
    for rid, path in results.items():
        print(f"   - {rid}: {path}")
    print(f"========================================================\n")


if __name__ == "__main__":
    main()
