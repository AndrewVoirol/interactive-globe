#!/usr/bin/env python3
"""
scripts/convert-global-to-cog.py: Convert Global DEM binary grids into Cloud-Optimized GeoTIFFs (COGs)

Converts monolithic 4-channel uint16 binary elevation datasets (such as NOAA ETOPO 2022
or GEBCO 2024 at 8192x4096) into standard Cloud-Optimized GeoTIFFs with multi-resolution
overview pyramids and 256x256 DEFLATE-compressed tiles for sub-second HTTP range streaming.
"""

import os
import sys
import time
import argparse
import numpy as np
import rasterio
from rasterio.transform import from_bounds

Z_MIN_GLOBAL = -10924.0
Z_SPAN = 19772.0


def convert_global_dem(
    input_path: str,
    output_path: str,
    width: int = 8192,
    height: int = 4096,
    blocksize: int = 256,
):
    print("========================================================")
    print(" Global Cloud-Optimized GeoTIFF (COG) Translation")
    print("========================================================")
    print(f" Input binary:   {input_path}")
    print(f" Output COG:     {output_path}")
    print(f" Resolution:     {width} x {height} (EPSG:4326)")
    print(f" Tile blocksize: {blocksize} x {blocksize}")
    print(" Compression:    DEFLATE")
    print(" Overviews:      AUTO (Bilinear)")
    print("--------------------------------------------------------")

    if not os.path.exists(input_path):
        print(f"Error: Input file '{input_path}' not found.", file=sys.stderr)
        return False

    t0 = time.time()

    # 1. Read binary array via memory map (preserves RAM)
    u16_mem = np.memmap(input_path, dtype=np.uint16, mode="r", shape=(height, width, 4))
    a16 = u16_mem[:, :, 3].astype(np.float32)

    # 2. Decode full-range elevation in meters (Rule 8 cross-pipeline DEM parity)
    elev_meters = (a16 / 65535.0) * Z_SPAN + Z_MIN_GLOBAL
    min_elev = float(np.nanmin(elev_meters))
    max_elev = float(np.nanmax(elev_meters))
    print(f" Elevation range: {min_elev:.2f} m to {max_elev:.2f} m")

    # 3. Construct affine geo-transform in EPSG:4326 spanning full globe
    transform = from_bounds(-180.0, -90.0, 180.0, 90.0, width, height)

    # 4. Write Cloud-Optimized GeoTIFF
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with rasterio.open(
        output_path,
        "w",
        driver="COG",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        blocksize=blocksize,
        compress="deflate",
        overview_resampling="bilinear",
        num_threads="ALL_CPUS",
    ) as dst:
        dst.write(elev_meters, 1)

    t1 = time.time()
    in_size = os.path.getsize(input_path) / (1024 * 1024)
    out_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f" ✓ Conversion completed in {t1 - t0:.2f} s")
    print(f"   Input binary:  {in_size:.2f} MB")
    print(f"   Output COG:    {out_size:.2f} MB (Compression: {in_size / out_size:.1f}x)")
    print("========================================================\n")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Convert global DEM binary datasets into Cloud-Optimized GeoTIFFs (COGs)."
    )
    parser.add_argument(
        "--input",
        type=str,
        default="public/earth-etopo2022-dem-u16.bin",
        help="Path to source 4-channel uint16 binary elevation file (default: public/earth-etopo2022-dem-u16.bin)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="public/earth-etopo2022.cog.tif",
        help="Destination path for the Cloud-Optimized GeoTIFF (default: public/earth-etopo2022.cog.tif)",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=8192,
        help="Raster width in pixels (default: 8192)",
    )
    parser.add_argument(
        "--height",
        type=int,
        default=4096,
        help="Raster height in pixels (default: 4096)",
    )
    parser.add_argument(
        "--blocksize",
        type=int,
        default=256,
        help="Tile blocksize in pixels (default: 256)",
    )

    args = parser.parse_args()
    success = convert_global_dem(
        args.input,
        args.output,
        width=args.width,
        height=args.height,
        blocksize=args.blocksize,
    )
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
