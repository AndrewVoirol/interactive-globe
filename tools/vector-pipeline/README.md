# Vector Pipeline Tooling (DuckDB & Overture Maps GeoParquet)

This directory contains the isolated offline vector data pipeline for the Indicatrix Engine.

## Why This Is Isolated
DuckDB uses native Node-API bindings (`node-pre-gyp` / `node-gyp`) and includes transitive dependencies that trigger npm audit vulnerabilities (such as legacy `tar`). To preserve **zero-vulnerability root hygiene**, eliminate native compilation steps during standard `npm install`, and keep client bundle dependencies pristine, DuckDB is quarantined in this dedicated subpackage.

## What It Does
The pipeline script [`scripts/precompute-overture-vectors.ts`](../../scripts/precompute-overture-vectors.ts):
1. Loads the NOAA ETOPO 2022 16-bit DEM (`public/earth-etopo2022-dem-u16.bin`).
2. Initializes an in-memory DuckDB database with `spatial` and `httpfs` extensions.
3. Direct-queries Overture Maps GeoParquet partitions from AWS S3 (`s3://overturemaps-us-west-2/release/2026-08-19.0/theme=base/type=water/*`) for high-resolution coastlines and river centerlines.
4. Harmonizes features with Natural Earth 1:10m vectors.
5. Projects line segment vertices to 3D sphere, EPSG:3857 Web Mercator, and Buckminster Fuller Dymaxion net planar coordinates.
6. Writes binary vector data to `public/geo-vectors.bin` (`GVEC` binary layout, ~39MB).

## How to Run

```bash
# 1. Navigate to vector pipeline directory
cd tools/vector-pipeline

# 2. Install isolated DuckDB dependencies
npm install

# 3. Execute vector precomputation
npm run precompute
```

Alternatively, from the project root:
```bash
npm --prefix tools/vector-pipeline install
npm run precompute:overture-vectors
```
