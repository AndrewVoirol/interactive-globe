# Comparative Analysis: Current Elevation, Bathymetry & Vector Stack vs. Global Alternatives

An exhaustive evaluation of the datasets, formats, and delivery architectures implemented in the `ais-interactive-globe-to-map` project against state-of-the-art open, governmental, and commercial alternatives, prioritized for offline and self-hosted environments.

---

## Executive Summary & Solution Matrix

The `ais-interactive-globe-to-map` codebase currently employs a hybrid architecture combining global base textures with selected regional topobathymetric insets. Specifically:
- **Global Elevation/Bathymetry**: NOAA ETOPO 2022 15 arc-second (~450m) bedrock DEM packed into a 16-bit binary grid (`earth-etopo2022-dem-u16.bin`) and block-compressed BC4 DDS pyramid (`earth-etopo2022-dem-bc4.dds`).
- **Global Hydrology**: MERIT Hydro 15 arc-second upstream drainage area + HydroLAKES vector polygons burned into a BC5 DDS pyramid (`earth-hydrology-bc5.dds`).
- **Regional Litmus DEMs**: NOAA CUDEM (Hawaii ~10m, Cape Cod ~3m), USGS 3DEP (Grand Canyon ~30m), and Copernicus GLO-30 (Mount Fuji ~30m).
- **Vectors**: Natural Earth 1:10m physical coastlines and river centerlines serialized into a custom binary structure (`geo-vectors.bin`), with an exploratory DuckDB pipeline targeting Overture Maps GeoParquet.

While this architecture delivers outstanding 60 FPS performance on WebGPU, significant opportunities exist to increase spatial fidelity, eliminate vertical datum discontinuities, and scale to true sub-meter global terrain using modern open formats (such as Cloud-Optimized GeoTIFFs, PMTiles, and Quantized Mesh) without relying on rate-limited commercial tile APIs.

```
+-------------------------------------------------------------------------------------------------------------------------+
|                                    GEOSPATIAL DATASET COMPARISON AT A GLANCE                                            |
+--------------------------+---------------------+-------------------+---------------------+------------------------------+
| Dataset                  | Spatial Resolution  | Vertical Accuracy | Geographic Coverage | Licensing / Cost             |
+--------------------------+---------------------+-------------------+---------------------+------------------------------+
| Current Codebase Stack   |                     |                   |                     |                              |
| - NOAA ETOPO 2022 Bedrock| 15" (~450m)         | ~10m to 100m+     | Global (Land+Ocean) | Public Domain (Free)         |
| - MERIT Hydro UPA        | 15" (~450m)         | Hydrologic Flow   | Global Land         | Open Access (CC BY-NC 4.0)   |
| - HydroLAKES Polygons    | >10 ha lakes        | Surface Elevation | Global Inland Lakes | Open Access (CC BY 4.0)      |
| - Natural Earth 1:10m    | 1:10,000,000        | 2D Vector Polylines| Global Coast/Rivers | Public Domain (Free)         |
| - Regional CUDEM Insets  | 1/9" (~3m) to 1/3"  | 0.1m to 1.5m      | Selected US Coasts  | Public Domain (Free)         |
+--------------------------+---------------------+-------------------+---------------------+------------------------------+
| Global Topobathy Contenders                                                                                             |
| - GEBCO 2024 Grid        | 15" (~450m)         | 1m to 50m (sonar) | Global (Land+Ocean) | Open Data (Free / Attrib)    |
| - SRTM15+ v2.6 (SIO/NGA) | 15" (~450m)         | 1m to 50m (sonar) | Global (Land+Ocean) | Public Domain (Free)         |
| - BedMachine Ant./Green. | 500m / 150m (Bed)   | Ice-mass mass cons| Polar Ice Sheets    | NASA Open Data (Free)        |
+--------------------------+---------------------+-------------------+---------------------+------------------------------+
| Global Terrestrial Land DEMs                                                                                            |
| - Copernicus GLO-30      | 1" (~30m)           | < 4.0m LE90       | Global (98% Land)   | Open Data (Free for all use) |
| - FABDEM v1.2            | 1" (~30m)           | < 2.8m (bare-earth| Global Land         | CC BY-NC-SA 4.0 (Free pers.) |
| - NASADEM v1.0           | 1" (~30m)           | < 5.0m LE90       | 60°S to 60°N        | NASA Open Access (Free)      |
| - ALOS AW3D30 v3.2       | 1" (~30m)           | ~4.4m LE90        | Global Land         | JAXA Open Data (Free w/ reg) |
+--------------------------+---------------------+-------------------+---------------------+------------------------------+
| Ultra-High Resolution Regional & Airborne                                                                               |
| - USGS 3DEP 1m LiDAR     | 1.0m (0.03" grid)   | < 0.10m RMSE      | Conterminous US     | Public Domain (Free)         |
| - IGN RGE ALTI (France)  | 1.0m / 5.0m         | < 0.20m to 0.50m  | France & Outre-Mer  | Open Licence 2.0 (Free)      |
| - UK EA LiDAR Composite  | 1.0m / 2.0m         | < 0.15m RMSE      | England & Wales     | Open Government Lic. (Free)  |
+--------------------------+---------------------+-------------------+---------------------+------------------------------+
| Coastlines & Hydrography Alternatives                                                                                   |
| - OSM Coastlines / Water | Sub-meter to 10m    | Geodetic shoreline| Global              | ODbL (Free w/ attribution)   |
| - Overture Maps Water    | Sub-meter to 5m     | Standardized Schema| Global              | CDLA-Permissive 2.0 (Free)   |
| - GSHHG v2.3.7           | 5 levels (~40m res) | Hierarchical poly | Global Coast/Lakes  | LGPL (Free / Open)           |
| - HydroSHEDS v1 / v2     | 3" (~90m) to 15"    | Hydro-conditioned | Global Hydrography  | Free for research/personal   |
+--------------------------+---------------------+-------------------+---------------------+------------------------------+
```

---

## Detailed Analysis of Global Elevation & Bathymetry Alternatives

### 1. Global Topographic & Bathymetric Combined Models

```
   NOAA ETOPO 2022 (Current)           GEBCO 2024 (Primary Challenger)
+-------------------------------+   +-------------------------------+
| - 15 arc-sec grid (~450m)     |   | - 15 arc-sec grid (~450m)     |
| - Released: 2022              |   | - Released: May 2024 (Annual) |
| - Dual products: Ice surface  |   | - Dual products: Ice surface  |
|   and sub-ice bedrock         |   |   and sub-ice bedrock         |
| - Ingests 3DEP, CUDEM, EMODnet|   | - Seabed 2030 direct partner  |
| - Global OPeNDAP DODS endpoint|   | - Higher density multi-beam   |
| - Strong coastal US vertical  |   |   swath sonar coverage in     |
|   integration                 |   |   international waters        |
+-------------------------------+   +-------------------------------+
```

#### NOAA ETOPO 2022 (Current Codebase Choice)
- **Architecture in Code**: Ingested via OPeNDAP or NetCDF in [`scripts/precompute-etopo2022.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-etopo2022.py#L38) and [`pipelines/pack_dem_hydrology.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/pipelines/pack_dem_hydrology.py#L188).
- **Strengths**: Integrates coastal topobathy seamless models (CUDEM), European EMODnet, and regional Japanese/Australian surveys. Provides both ice-surface and true bedrock grids.
- **Weaknesses**: The 15" global product is static and was last compiled in 2022; deep-ocean bathymetry in un-surveyed regions relies heavily on satellite altimetry gravity inversions, which exhibit $\pm 50\text{m}$ to $\pm 100\text{m}$ vertical uncertainty.

#### GEBCO 2024 (The General Bathymetric Chart of the Oceans)
- **Data Source**: IHO/IOC GEBCO project in partnership with Nippon Foundation-GEBCO Seabed 2030 ([GEBCO Portal](https://www.gebco.net/data_and_products/gridded_bathymetry_data/)).
- **Key Enhancements over Current Stack**:
  - Incorporates millions of square kilometers of newly declassified multi-beam echo-sounder (MBES) swath sonar surveys collected up through early 2024.
  - Percentage of ocean floor covered by direct acoustic measurement increased from 6% (in older GEBCO) to ~26.1% in the 2024 release.
  - Sub-ice topography in Antarctica and Greenland utilizes the latest BedMachine v3 / BedMachine v5 datasets, offering realistic bed profiles under the Ross and Ronne ice shelves.
- **Licensing**: Open Data, free for commercial and non-commercial use with simple attribution.
- **Offline / Hosting Viability**: Available as a single 12.5 GB compressed GeoTIFF or Cloud-Optimized GeoTIFF (COG), easily sliced into pyramids or cached locally.

#### SRTM15+ v2.6 (Scripps Institution of Oceanography / NGA)
- **Data Source**: Tozer et al., Scripps Institution of Oceanography, UC San Diego ([SRTM15+ SIO](https://topex.ucsd.edu/WWW_html/srtm15_plus.html)).
- **Key Characteristics**: The scientific backbone of many global bathymetry models (including GEBCO). Version 2.6 integrates gravity predictions from CryoSat-2 and SARAL/AltiKa with all public multibeam cruises.
- **Licensing**: Public Domain.

---

### 2. Global Terrestrial Bare-Earth Land DEMs (1 arc-sec / ~30m)

While 15 arc-second models (~450m) are sufficient for orbital overview viewing, terrestrial surface topography requires 1 arc-second (~30m) resolution to properly resolve mountain massifs, canyons, volcanic calderas, and river valleys.

```
       RAW RADAR SURFACE (DSM) vs. BARE-EARTH TERRAIN (DTM)
   
        [ Radar Echo ]                [ Bare-Earth DTM ]
          |        |                     |        |
          v        v                     |        |
       +-------+  /\  (Canopy)           |        |
       |Forest | /  \                    |        |
  -----+-------+------+---------    -----+--------+---------- (Ground)
     Copernicus GLO-30 / SRTM           FABDEM v1.2 / Bare-Earth
  (Includes Trees & Buildings)      (Canopy & Buildings Stripped)
```

#### Copernicus DEM GLO-30 (The Gold Standard for Web & GPU)
- **Data Source**: European Space Agency (ESA) / Airbus derived from the TanDEM-X radar constellation ([Copernicus DEM Portal](https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model)).
- **Resolution**: 1 arc-second ($30\text{ m}$) globally. Free for all commercial and personal use worldwide without restrictions.
- **Accuracy**: Absolute vertical accuracy $< 4.0\text{ m}$ (LE90), with typical measured accuracy $< 1.8\text{ m}$ in non-forested terrain.
- **Why It Beats SRTM v3 & NASADEM**:
  - No radar voids: SRTM is plagued by no-data holes in rugged mountains (Himalayas, Andes, Alps) caused by radar shadow and layover. Copernicus GLO-30 is fully hydrologically conditioned and void-filled.
  - True global coverage: Covers from $84^\circ\text{ N}$ to $84^\circ\text{ S}$, whereas SRTM terminates at $60^\circ\text{ N}$ (missing Scandinavia, Alaska, northern Canada, and Siberia).
- **Public Cloud Hosting**: Hosted free in public AWS S3 buckets as Cloud-Optimized GeoTIFFs (`s3://copernicus-dem-30m/`).

#### FABDEM v1.2 (Forest And Buildings removed Copernicus DEM)
- **Data Source**: University of Bristol (Hawker et al., 2022).
- **Technology**: Uses machine learning trained on ICESat-2 spaceborne LiDAR photon counting and GEDI canopy height data to mathematically subtract tree heights and urban structures from Copernicus GLO-30.
- **Significance for the Indicatrix Engine**:
  - Copernicus GLO-30 is a **Digital Surface Model (DSM)**: It measures the top of tree canopies and building rooftops. In dense rainforests (Amazon, Congo, Pacific Northwest), rivers appear to run in artificial ditches, and forest boundaries appear as steep cliffs.
  - FABDEM produces a true **Digital Terrain Model (DTM / Bare-Earth)**: The ground beneath the canopy is accurately revealed. River gradients flow naturally, and lake shorelines match true land edges.
- **Licensing**: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0) — 100% free for personal, educational, and research projects.

#### ALOS World 3D - 30m (AW3D30 v3.2)
- **Data Source**: Japan Aerospace Exploration Agency (JAXA).
- **Technology**: Optical stereo photogrammetry using PRISM sensor pairs on the ALOS satellite.
- **Pros & Cons**: Extremely sharp ridge crests in arid/rocky terrain (e.g., Grand Canyon, Tibetan Plateau), but prone to optical cloud artifacts and seasonal snow mis-registration in polar latitudes. Free with user registration.

---

### 3. Ultra-High Resolution Regional & Airborne Elevation (Sub-10m)

For local litmus insets (such as the Hawaii, Cape Cod, Grand Canyon, and Fuji test beds currently implemented in `scripts/precompute-regional-dem.py`), airborne LiDAR and coastal topobathy surveys offer extraordinary sub-meter detail.

```
+---------------------------------------------------------------------------------------------+
|                            AIRBORNE LIDAR RESOLUTION HIERARCHY                              |
|                                                                                             |
|  Global Base:     ETOPO 2022     (15 arc-sec  ≈ 450.0m)  [~0.30m vertical step]             |
|  Global Terrestrial: Copernicus  (1 arc-sec   ≈  30.0m)  [< 1.8m vertical error]            |
|  Regional Topo:   USGS 3DEP      (1/3 arc-sec ≈  10.0m)  [< 0.5m vertical error]            |
|  Coastal Topobathy:NOAA CUDEM    (1/9 arc-sec ≈   3.0m)  [< 0.15m vertical error]           |
|  Airborne LiDAR:  USGS 3DEP 1m   (0.03 arc-sec≈   1.0m)  [< 0.05m vertical error]           |
+---------------------------------------------------------------------------------------------+
```

#### NOAA CUDEM (Continuously Updated Digital Elevation Model)
- **Current Role in Codebase**: Ingested for Hawaii and Cape Cod (`scripts/precompute-regional-dem.py` L46–L75).
- **Key Advantage**: Specifically designed for coastal zone hydrodynamic modeling; seamlessly resolves the difficult transition across the intertidal zone (between dry land LiDAR and shallow water acoustic bathymetry) down to $1/9\text{ arc-sec}$ (~3m) and $1/3\text{ arc-sec}$ (~10m).
- **Public Cloud Hosting**: Available directly on AWS S3 (`noaa-nos-coastal-lidar-pds.s3.amazonaws.com`).

#### USGS 3DEP (3D Elevation Program)
- **Resolution**: 1-meter bare-earth LiDAR for $>85\%$ of the conterminous United States, plus seamless 1/3 arc-sec (10m) and 1 arc-sec (30m) across the entire US.
- **Licensing**: Public Domain, 100% free. Available on AWS S3 (`prd-tnm.s3.amazonaws.com`).

#### European High-Resolution Open LiDAR:
- **France (IGN RGE ALTI)**: 1-meter and 5-meter bare-earth mesh covering all of metropolitan France and overseas departments, available free under Open Licence 2.0.
- **United Kingdom (Environment Agency LiDAR Composite)**: 1-meter and 2-meter resolution covering England and Wales, free under Open Government Licence.
- **Spain (PNOA-IGN)**: 2-meter LiDAR DTM covering Spain, free under CC BY 4.0.

---

## Detailed Analysis of Coastlines, Water & Vector Alternatives

```
       NATURAL EARTH 1:10m (Current)                 OSM / OVERTURE WATER (Modern)
+-----------------------------------------+   +-----------------------------------------+
| - Cartographic generalization           |   | - Survey-grade GPS / satellite polygon  |
| - Fixed vertices (sub-kilometer errors) |   | - Exact sub-10m coastline boundaries    |
| - Fjords, barrier islands, atolls       |   | - Complex multi-polygons, barrier reefs,|
|   heavily simplified or smoothed        |   |   delta estuaries, and dynamic sandspits|
| - Single static file: 2.9 MB JSON       |   | - Distributed GeoParquet or PMTiles     |
+-----------------------------------------+   +-----------------------------------------+
```

### 1. GSHHG (Global Self-consistent, Hierarchical, High-resolution Geography)
- **Developer**: Wessel & Smith (SOEST, University of Hawaii / NOAA).
- **Characteristics**: The gold standard in academic oceanography. Merges World Vector Shorelines (WVS) and CIA World DataBank II into a strictly topology-validated polygon hierarchy:
  - Level 1: Continental land masses and ocean islands.
  - Level 2: Lakes inside land.
  - Level 3: Islands inside lakes.
  - Level 4: Ponds on islands in lakes.
  - Level 5: Antarctica grounding line and ice front.
- **Fidelity**: Full resolution contains features down to $0.04\text{ km}$ ($40\text{ m}$). Available under GNU LGPL.

### 2. OpenStreetMap (OSM) Water Polygons / Coastlines
- **Source**: Daily-extracted global coastline topology from OpenStreetMap (`osmdata.openstreetmap.de`).
- **Fidelity**: Unmatched real-world precision (typically $5\text{m}$ to $15\text{m}$). Every dock, breakwater, spit, and sea wall on Earth is mapped.
- **Processing Requirement**: Raw global coastline is $\approx 1.2\text{ GB}$ compressed shapefile. Slicing into regional vector tiles or PMTiles is necessary for fast WebGPU buffer generation.

### 3. Overture Maps Foundation (GeoParquet Base Theme: Water)
- **Current Role in Codebase**: Targeted by `scripts/precompute-overture-vectors.ts` via DuckDB.
- **Architecture**: Backed by the Linux Foundation, Amazon, Meta, Microsoft, and TomTom. Harmonizes OpenStreetMap with global government open data into cloud-native Apache Parquet files on AWS S3 (`s3://overturemaps-us-west-2/release/`).
- **Key Advantage**: DuckDB can query and filter the entire global water theme directly over HTTP using spatial SQL, extracting only major ocean coastlines and primary river networks without downloading massive archives.

---

## Offline & Self-Hosted Delivery Strategies

To fulfill the objective of running **100% offline or self-hosted** without hitting third-party rate limits, token quotas, or bandwidth throttling, three primary architectural patterns are available:

```
+---------------------------------------------------------------------------------------------------+
|                                 OFFLINE & SELF-HOSTED ARCHITECTURES                               |
+---------------------------------------------------------------------------------------------------+

  PATTERN A: Cloud-Optimized GeoTIFF (COG) via HTTP Range Requests
  [Client WebGPU Engine] --- (HTTP Range: bytes=1048576-2097152) ---> [Static File Server / S3 / Nginx]
  - Zero application server required.
  - Client reads TIFF directory, determines tile offset, and downloads only required 256x256 tiles.
  - Ideal for multi-gigabyte regional DEMs (e.g. Hawaii, Grand Canyon, Alps).

  PATTERN B: Single-File PMTiles Archive (Vector & Raster)
  [Client WebGPU Engine] --- (HTTP Range: Sparse Octree Header) -----> [Local SSD / Static Nginx]
  - Single binary archive (.pmtiles) containing millions of vector or terrain tiles.
  - Hilbert-curve spatial index in header allows O(1) tile lookups with 1-2 HTTP requests.
  - Completely immune to file descriptor exhaustion on local operating systems.

  PATTERN C: WebGPU-Native Block-Compressed Pyramid (Current Codebase Pattern)
  [Client WebGPU Engine] --- (Fetch Full Array: 21 MB DDS / 38 MB BIN) -> [VRAM Texture Allocation]
  - Maximum possible rendering performance (zero CPU decode overhead; directly copied to VRAM).
  - Best for global baseline disks (LOD 0..6); memory footprint must be capped for low-end devices.
+---------------------------------------------------------------------------------------------------+
```

### Comparative Evaluation of Delivery Architectures

| Delivery Strategy | Offline Complexity | GPU Decode Overhead | Storage Footprint | Network / I/O Efficiency | Best Fit for Indicatrix Engine |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GPU Block Compressed DDS (Current)** | Very Low (Static files) | **Zero (Direct GPU copy)** | 21 MB (BC4) + 11 MB (BC5) | Single initial fetch; stays in VRAM | **Global 8K Base (Unfurl Modes 0..3)** |
| **Cloud-Optimized GeoTIFF (COG)** | Low (Nginx / local files) | Low (Client TIFF unpack) | Original raster size (e.g. 10 GB) | High (Fetches only visible bounding box) | **On-demand Regional Insets (1m–30m)** |
| **PMTiles (Vector / Terrain-RGB)** | Low (Static HTTP server) | Moderate (PNG/MVT decode) | 2–8 GB for entire planet | Very High (Compact Hilbert-indexed single file) | **Global Coastlines, Roads & Contours** |
| **Quantized Mesh / Cesium Terrain** | Moderate (TIN generation) | Low (Direct index/vertex GPU bind)| 5–15 GB for planet LOD 0..14 | Exceptional (Pre-meshed terrain tiles) | **Ultra-steep terrain / Alpine Massifs** |
| **TileServer GL / Martin (Dynamic)**| High (Requires Docker/DB) | Moderate (PBF decompression) | 50+ GB database | Variable (Server-side bottleneck) | Not recommended for offline portable app |

---

## Architectural Recommendations for the Indicatrix Project

1. **Upgrade Global Topobathy from ETOPO 2022 to GEBCO 2024**:
   - Swap the base ocean bathymetry from ETOPO 2022 to GEBCO 2024. This immediately incorporates millions of square kilometers of recent multi-beam swath bathymetry across the Mid-Atlantic Ridge, Mariana Arc, and Southern Ocean, eliminating artificial satellite altimetry ripples.
2. **Adopt FABDEM v1.2 as the Authoritative Terrestrial Ground Model**:
   - Replace raw radar surface elevations with FABDEM's bare-earth canopy-stripped model. This eliminates forest canopy stepping around river mouths and ensures water bodies rest at their true hydrographic datums.
3. **Migrate Regional Inset Ingestion to Cloud-Optimized GeoTIFF (COG)**:
   - Instead of baking fixed monolithic binary buffers for each region (`hawaii-dem-u16.bin`, `capecod-dem-u16.bin`), package regional insets as local COGs. The client can use range requests to dynamically stream only the visible sub-tiles as the user zooms in, scaling effortlessly to hundreds of regions without blowing up initial memory.
4. **Transition Vectors from Natural Earth 1:10m to Overture / OSM via PMTiles**:
   - Natural Earth 1:10m introduces noticeable polygon angularity when zooming closer than orbital altitudes. Packaging Overture Maps water boundaries into a single self-hosted PMTiles archive provides crisp, true-to-life shorelines down to street scale while maintaining 100% offline self-containment.
