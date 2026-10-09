#!/usr/bin/env bash
# ==============================================================================
# Script: scripts/convert-regional-to-cog.sh
# Purpose: Convert arbitrary raster GeoTIFF DEMs into Cloud-Optimized GeoTIFFs (COGs)
#          with on-demand streaming tile pyramids (256x256 tiles, DEFLATE compression).
# ==============================================================================

set -euo pipefail

function show_help() {
  cat << EOF
Usage:
  $(basename "$0") <input_geotiff> [output_cog] [blocksize]

Arguments:
  input_geotiff   Path to source raster GeoTIFF (.tif / .tiff)
  output_cog      (Optional) Destination path for the Cloud-Optimized GeoTIFF.
                  Default: public/regional/<basename>.cog.tif
  blocksize       (Optional) Tile width & height in pixels. Default: 256

Description:
  Packages arbitrary elevation GeoTIFFs into an on-demand streaming tile pyramid
  using GDAL COG driver. Generates multi-resolution overviews and compressed
  256x256 tiles suited for asynchronous HTTP range-request querying.

Requirements:
  gdal_translate (GDAL >= 3.1 with COG driver support)

Examples:
  ./scripts/convert-regional-to-cog.sh data/hawaii-dem.tif
  ./scripts/convert-regional-to-cog.sh data/hawaii-dem.tif public/regional/hawaii.cog.tif 256
EOF
}

if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

INPUT_FILE="$1"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: Input file '$INPUT_FILE' not found." >&2
  exit 1
fi

BASENAME="$(basename "$INPUT_FILE")"
STEM="${BASENAME%.*}"
OUTPUT_FILE="${2:-public/regional/${STEM}.cog.tif}"
BLOCKSIZE="${3:-256}"

# Check for gdal_translate binary
if ! command -v gdal_translate &> /dev/null; then
  echo "Error: 'gdal_translate' executable not found on PATH." >&2
  echo "" >&2
  echo "Please install GDAL with COG driver support:" >&2
  echo "  - macOS:   brew install gdal" >&2
  echo "  - Debian:  sudo apt-get install -y gdal-bin" >&2
  echo "  - Conda:   conda install -c conda-forge gdal" >&2
  echo "  - Docker:  docker run --rm -v \$(pwd):/data ghcr.io/osgeo/gdal:ubuntu-small-latest \\" >&2
  echo "               gdal_translate /data/$INPUT_FILE /data/$OUTPUT_FILE -of COG -co COMPRESS=DEFLATE" >&2
  exit 1
fi

# Ensure destination directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "=================================================================="
echo " Cloud-Optimized GeoTIFF (COG) Translation Pipeline"
echo "=================================================================="
echo " Input GeoTIFF:  $INPUT_FILE"
echo " Output COG:     $OUTPUT_FILE"
echo " Tile Blocksize: ${BLOCKSIZE}x${BLOCKSIZE}"
echo " Compression:    DEFLATE (Lossless)"
echo " Overviews:      AUTO (Bilinear)"
echo " Threads:        ALL_CPUS"
echo "------------------------------------------------------------------"

gdal_translate "$INPUT_FILE" "$OUTPUT_FILE" \
  -of COG \
  -co COMPRESS=DEFLATE \
  -co BLOCKSIZE="$BLOCKSIZE" \
  -co OVERVIEWS=AUTO \
  -co RESAMPLING=BILINEAR \
  -co PREDICTOR=YES \
  -co NUM_THREADS=ALL_CPUS

echo "------------------------------------------------------------------"
if [[ -f "$OUTPUT_FILE" ]]; then
  IN_SIZE=$(du -h "$INPUT_FILE" | cut -f1)
  OUT_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
  echo "✓ Conversion successful."
  echo "  Input size:   $IN_SIZE"
  echo "  Output size:  $OUT_SIZE"
  echo "  Stream ready: $OUTPUT_FILE"
else
  echo "Error: Conversion failed. Output file '$OUTPUT_FILE' was not generated." >&2
  exit 1
fi
echo "=================================================================="
