# Unified Composition, High-Precision Fusion & Compression Blueprint

An architectural master plan for synthesizing heterogeneous geospatial datasets, reconciling vertical datums, maximizing compression efficiency, and pushing the mathematical limits of planetary-scale elevation and bathymetric representation in the `ais-interactive-globe-to-map` WebGPU engine.

---

## Executive Blueprint: The Ideal Planetary Model

To achieve the single most accurate, seamless representation of the Earth's terrestrial land, inland water bodies, coastal intertidal zones, and ocean floor on a continuous spherical-to-planar manifold, the rendering engine must overcome three fundamental engineering bottlenecks:

1. **Vertical Datum Incongruity**: Terrestrial elevation models (referenced to gravity geoids such as EGM2008 or NAVD88) clash with ocean bathymetry (referenced to Mean Sea Level or tidal datums), creating artificial vertical cliffs along shorelines.
2. **Resolution & Memory Saturation**: Global 1-meter elevation would require over $500\text{ Terabytes}$ of uncompressed raw data—far exceeding browser and GPU memory.
3. **Floating-Point Precision Breakdown**: At planetary dimensions ($R_{\text{earth}} \approx 6,371,000\text{ m}$), standard 32-bit floating-point numbers (`f32`) have only 24 bits of significand, losing sub-meter precision ($6,371,000 \cdot 2^{-24} \approx 0.38\text{ m}$) and inducing severe visual jitter when zooming into local terrain.

```
+---------------------------------------------------------------------------------------------------------+
|                                UNIFIED FOUR-TIER COMPOSITION PIPELINE                                   |
|                                                                                                         |
|  TIER 1: GLOBAL FOUNDATION (LOD 0..8)                                                                   |
|  - Ocean Bathymetry: GEBCO 2024 / SRTM15+ v2.6 (15 arc-sec multi-beam acoustic sounding)                |
|  - Terrestrial Land: FABDEM v1.2 (30m Bare-Earth DTM, canopy/building stripped)                        |
|  - Polar Bedrock: BedMachine Antarctica v3 & Greenland v5                                               |
|  - Datum Transform: Unified EGM2008 geoid undulation offset to WGS84 ellipsoid                          |
|                                                                                                         |
|  TIER 2: HYDROLOGIC & LAKE EQUILIBRIUM (LOD 0..12)                                                      |
|  - River Networks: MERIT Hydro Upstream Drainage Area (Log-scaled accumulation)                         |
|  - Inland Water Datums: HydroLAKES polygon boundaries + authoritative surface water levels              |
|  - Dual-Surface Separation: Solid crust vs. Liquid hydrostatic water table                              |
|                                                                                                         |
|  TIER 3: HIGH-PRECISION REGIONAL & COASTAL INSETS (LOD 9..16)                                           |
|  - Coastal Topobathy: NOAA CUDEM 1/9" (3m) & 1/3" (10m) seamless intertidal models                     |
|  - Continental Land: USGS 3DEP 1m/10m LiDAR, IGN RGE ALTI 1m (France), UK EA 1m LiDAR                   |
|  - Spatial Blending: Multi-band Burt-Adelson splines + gradient-matched Dirichlet boundary conditions  |
|                                                                                                         |
|  TIER 4: VECTOR TOPOLOGY & REEF STRUCTURES                                                              |
|  - Coastlines: Overture Maps Foundation GeoParquet (Theme: Water) + OSM Water Polygons                  |
|  - Screen-Space Extrusion: Adaptive width ribbons with Chapman atmospheric limb falloff                 |
+---------------------------------------------------------------------------------------------------------+
                                                |
                                                v
+---------------------------------------------------------------------------------------------------------+
|                                    GPU STREAMING & COMPRESSION MATRIX                                   |
|                                                                                                         |
|  +-------------------------------------+  +----------------------------------------------------------+  |
|  | SPARSE VIRTUAL TEXTURING (SVT)      |  | HARDWARE BLOCK COMPRESSION (BC4 / BC5 / BC7)             |  |
|  | - Single 4096x4096 Virtual Texture  |  | - BC4: 8 bits/pixel -> 16-bit dynamic elevation decode   |  |
|  | - Page Indirection Table (LOD 0..16)|  | - BC5: 16 bits/pixel -> Flow Accumulation + Lake Datum   |  |
|  | - Tile Pool: 128x128 byte chunks    |  | - BC5: Tangent Normals (Nx, Ny) + Toksvig Roughness (L)  |  |
|  +-------------------------------------+  +----------------------------------------------------------+  |
|                                                |                                                        |
|                                                v                                                        |
|  +---------------------------------------------------------------------------------------------------+  |
|  | CAMERA-CENTRIC HIGH-PRECISION WGSL SHADER PIPELINE                                                |  |
|  | - Relative-to-Eye (RTE) coordinate translation (zero vertex swimming at 1-meter zoom)             |  |
|  | - Emulated double-precision (Float-Float arithmetic) for planetary geoid transformations          |  |
|  | - Real-time continuous CDLOD quadtree morphing across developable manifold projection modes       |  |
|  +---------------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

---

## 1. Vertical Datum Reconciliation: Eliminating Coastal Seam Discontinuities

The most prevalent flaw in global elevation models is the vertical discontinuity between land datasets and ocean bathymetry. 

```
                                  SHORELINE VERTICAL DATUM CONFLICT
                                  
        TERRESTRIAL LAND                          COASTLINE GAP                        OCEAN BATHYMETRY
  (Ref: EGM2008 Geoid / NAVD88)                                                  (Ref: Mean Sea Level / MLLW)
  
         h_land = H + N                                                             h_ocean = D_msl + Delta
              |                                                                                |
              v                                                                                v
  +-----------------------+                    Artificial 2m - 15m Step                  +--------------------+
  | Ground: +1.5m Ortho   |                    ========================                  |                    |
  +-----------------------+                                                              | Seabed: -0.5m MSL  |
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~+--------------------+
                                      Local Geoid Undulation N(lon, lat)
  =============================================================================================================
                                      WGS84 Reference Ellipsoid (h = 0)
```

### The Physical Problem
- **Land Surveys (e.g., Copernicus GLO-30, SRTM, USGS 3DEP)**: Measure **Orthometric Height ($H$)** relative to the Earth's gravity geoid (approximated by EGM96 or EGM2008).
- **Ocean Bathymetry (e.g., GEBCO, SRTM15+)**: Measures water depth relative to sea level surfaces such as **Mean Sea Level (MSL)**, **Mean Lower Low Water (MLLW)**, or **Lowest Astronomical Tide (LAT)**.
- **Satellite Positioning & Engine Manifolds**: Calculate geometry on the mathematical **WGS84 Reference Ellipsoid ($h$)**.

Because the Earth's geoid undulates significantly relative to the WGS84 ellipsoid—ranging from $-106\text{ m}$ (south of India) to $+85\text{ m}$ (in the North Atlantic)—mixing datasets without explicit vertical geodetic conversion results in vertical offsets of $2\text{m}$ to $15\text{m}$ along coastlines, causing flooded coastal cities or false $10\text{m}$ ocean cliffs.

### Mathematical Datum Harmonization Formula
To create an airtight model, all input sources must be converted to a common **Ellipsoidal Height ($h$)** or a unified **EGM2008 Geoid Datum ($H_{\text{EGM2008}}$)** prior to texture baking:

$$h(\lambda, \phi) = H(\lambda, \phi) + N(\lambda, \phi)$$

Where:
- $h$ is the ellipsoidal height (distance above WGS84 ellipsoid along the geodetic normal).
- $H$ is the orthometric height (elevation above the geoid).
- $N(\lambda, \phi)$ is the geoid undulation evaluated from the NOAA/NGA EGM2008 2.5-minute spherical harmonic expansion:

$$N(\lambda, \phi) = \frac{GM}{r \gamma} \sum_{n=2}^{N_{\max}} \left(\frac{a}{r}\right)^n \sum_{m=0}^n \left(\bar{C}_{nm}^* \cos m\lambda + \bar{S}_{nm} \sin m\lambda\right) \bar{P}_{nm}(\sin \phi)$$

In the precomputation pipeline, a precomputed $0.25^\circ$ grid of $N(\lambda, \phi)$ is sampled using bicubic interpolation to adjust coastal bathymetry and land heights, ensuring that at the exact shoreline:
$$z_{\text{land}}(u_{\text{coast}}, v_{\text{coast}}) \equiv z_{\text{bathymetry}}(u_{\text{coast}}, v_{\text{coast}}) \equiv 0.000\text{ m}$$

---

## 2. Multi-Source Hybrid Fusion Pipeline

Rather than relying on a single compromise dataset, the optimal strategy composites four distinct authoritative layers using multi-resolution spatial masking:

```
+---------------------------------------------------------------------------------------------------+
|                                  MULTI-SOURCE COMPOSITION MATRIX                                  |
+-----------------------------------+-----------------------------------+---------------------------+
| Geographic Realm                  | Primary Authoritative Dataset     | Fallback / Blend Layer    |
+-----------------------------------+-----------------------------------+---------------------------+
| Open Ocean & Deep Trenches        | GEBCO 2024 (Acoustic Multibeam)   | SRTM15+ v2.6              |
| Polar Bedrock & Sub-Ice Canyons   | BedMachine Antarctica v3 / Green. | ETOPO 2022 Bedrock        |
| Continental Land Surfaces         | FABDEM v1.2 (Bare-Earth DTM 30m)  | Copernicus GLO-30         |
| Coastal & Intertidal Zones        | NOAA CUDEM (3m/10m Topobathy)     | EMODnet / Regional LiDAR  |
| Inland Waterbodies & Perched Lakes| HydroLAKES Vector Polygons        | MERIT Hydro River Network |
+-----------------------------------+-----------------------------------+---------------------------+
```

### Multi-Band Laplacian Pyramid Blending
When merging regional high-resolution insets (such as 3-meter NOAA CUDEM in Cape Cod or Hawaii) into the global 450-meter base, simple linear alpha blending creates visible edge blur and ghosting along steep slopes. 

The pipeline implements **Burt-Adelson Multi-Band Spline Blending**:
1. Decompose both the regional high-res grid $A$ and the global base grid $B$ into Laplacian pyramids:
   $$L_k(I) = G_k(I) - \text{expand}(G_{k+1}(I))$$
   where $G_k$ is the Gaussian pyramid level at octave $k$.
2. Decompose the regional alpha mask $M$ into a Gaussian pyramid $G_k(M)$.
3. Blend each spatial frequency band independently:
   $$L_k(\text{Composite}) = G_k(M) \cdot L_k(A) + (1 - G_k(M)) \cdot L_k(B)$$
4. Collapse the Laplacian pyramid from coarse to fine:
   $$I_{\text{fused}} = \sum_{k=0}^{K} \text{expand}^k(L_k(\text{Composite}))$$

This technique guarantees that high-frequency terrain crispness (canyon cliffs, mountain peaks) is preserved in the regional inset while low-frequency regional elevation biases are smoothly equalized across kilometers of transition zone.

---

## 3. High-Efficiency Compression & Memory Architecture

### 1. GPU Block Compression Comparison

WebGPU provides hardware decompression directly in the texture units, consuming zero CPU cycles and using $75\%$ to $87.5\%$ less VRAM than uncompressed floats:

| Texture Compression Format | Channels | Bits / Pixel | Compression Ratio | Filterable in WebGPU | Ideal Engine Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BC4 (`bc4-r-unorm`)** | 1 (Red) | 4 bpp (8 bytes / 4x4) | **8:1** (vs float32) | Yes | **Primary Global DEM Elevation** |
| **BC5 (`bc5-rg-unorm`)** | 2 (RG) | 8 bpp (16 bytes / 4x4)| **4:1** (vs float32) | Yes | **Drainage Flow + Lake Datums**<br>**Tangent Normals (Nx, Ny)** |
| **BC7 (`bc7-rgba-unorm`)**| 4 (RGBA)| 8 bpp (16 bytes / 4x4)| **4:1** (vs rgba8) | Yes | **Photographic Blue Marble Albedo** |
| **ASTC 4x4 / 6x6 (Mobile)**| 1..4 | 8.0 to 3.56 bpp | **4:1 to 9:1** | Yes (Feature opt) | **Cross-platform Mobile fallback** |
| **Packed RGBA16 Float** | 4 (RGBA)| 64 bpp (8 bytes/pixel)| 1:1 (Uncompressed) | Yes | **Raw Regional Inset Buffers** |

```
                 BC4 / BC5 HARDWARE BLOCK PACKING (4x4 TEXELS)
   
     Texel Grid (4x4 = 16 values)             BC4 Compressed Block (8 Bytes)
      +----+----+----+----+                 +--------+--------+-----------------+
      | z0 | z1 | z2 | z3 |                 | e0 (1B)| e1 (1B)| 16x 3-bit Index |
      +----+----+----+----+   Encode ->     | Max Val| Min Val| (6 Bytes = 48b) |
      | z4 | z5 | z6 | z7 |                 +--------+--------+-----------------+
      +----+----+----+----+
      | z8 | z9 |z10 |z11 |                 BC5 Compressed Block (16 Bytes)
      +----+----+----+----+                 +-----------------+-----------------+
      |z12 |z13 |z14 |z15 |                 | Red BC4 Block   | Green BC4 Block |
      +----+----+----+----+                 | (8 Bytes)       | (8 Bytes)       |
                                            +-----------------+-----------------+
```

### 2. Sparse Virtual Texturing (SVT) / Virtual Clipmaps

To transcend the limit of fixed 8K textures without loading hundreds of megabytes of redundant data into VRAM, the engine should implement **Sparse Virtual Texturing (Clipmaps)**:

```
  CAMERA VIEWPOINT (Looking at Alpine Summit)
       |
       v
  +--------------------------------------------------------------------+
  | RING 0: LOD 14 (1m resolution)   -> Local 1km x 1km around camera  |
  | RING 1: LOD 12 (4m resolution)   -> Mid-range 4km x 4km            |
  | RING 2: LOD 10 (16m resolution)  -> Regional 16km x 16km           |
  | RING 3: LOD 8  (64m resolution)  -> Sub-continental 64km x 64km    |
  | RING 4: LOD 0..6 (Global Base)   -> Entire Planetary Disc          |
  +--------------------------------------------------------------------+
       |
       v
  +-------------------------------------+      +-------------------------------+
  | INDIRECTION PAGE TABLE (GPU Texture)| ---> | PHYSICAL CACHE POOL (VRAM)    |
  | Coordinates (u, v, lod)             |      | Fixed 4096 x 4096 Texture     |
  | -> Maps to Cache Slot (x, y)        |      | Holds 1024 active 128x128 tiles|
  +-------------------------------------+      +-------------------------------+
```

- **Fixed VRAM Footprint**: The physical GPU texture memory remains completely fixed (e.g., $128\text{ MB}$ for a $4096 \times 4096$ physical cache), regardless of whether the user explores at global scale or zooms into a 1-meter LiDAR trench.
- **Asynchronous Range Streaming**: The client WebGPU engine issues HTTP range requests to local or remote Cloud-Optimized GeoTIFFs (COGs) or PMTiles only for missing cache pages.

---

## 4. Precision Boundaries & Mathematical Limits

### 1. The 32-Bit Single-Precision Limit at Planetary Scale

In WebGPU, standard vertex and fragment processing uses single-precision 32-bit IEEE 754 floats (`f32`). A float32 contains 1 sign bit, 8 exponent bits, and 23 explicit mantissa bits ($24$ bits of precision):
$$\epsilon = 2^{-24} \approx 5.96 \times 10^{-8}$$

When coordinates are expressed in world space relative to the Earth's center:
$$R_{\text{earth}} \approx 6,371,000.0\text{ m}$$

The absolute distance between representable consecutive numbers is:
$$\Delta x = R_{\text{earth}} \cdot 2^{-24} \approx 6,371,000 \cdot 5.96 \times 10^{-8} \approx 0.380\text{ meters (38 cm)}$$

```
+---------------------------------------------------------------------------------------------+
|                            IEEE 754 FLOAT32 PLANETARY PRECISION BREAKDOWN                   |
|                                                                                             |
|  Radius: 6,371,000 meters                                                                   |
|  Mantissa: 24 bits                                                                          |
|  Precision Step at Planet Radius: Delta X = 0.3797 meters (38 cm)                           |
|                                                                                             |
|  CONSEQUENCE AT HIGH ZOOM (Camera at ground level, altitude < 50m):                         |
|  - Small camera rotations cause vertex positions to quantize to the nearest 38 cm grid.    |
|  - Result: Severe "vertex swimming", geometric jitter, and shimmering polygons.             |
+---------------------------------------------------------------------------------------------+
```

#### Pushing Past the Limit: Relative-to-Eye (RTE) Transformation
The engine overcomes this limitation by implementing **Relative-to-Eye (RTE)** coordinate systems:
1. Split the high-precision 64-bit camera position into two 32-bit floats in CPU JavaScript:
   $$\vec{P}_{\text{cam}} = \vec{P}_{\text{cam,high}} + \vec{P}_{\text{cam,low}}$$
2. In the vertex shader, subtract camera position *before* applying the projection matrix:
   $$\vec{P}_{\text{eye}} = (\vec{P}_{\text{model}} - \vec{P}_{\text{cam,high}}) - \vec{P}_{\text{cam,low}}$$
3. Model-space relative coordinates near the camera have magnitudes of $10\text{ m}$ to $1,000\text{ m}$, where float32 precision is:
   $$\Delta x_{\text{local}} = 1,000 \cdot 2^{-24} \approx 0.0000596\text{ m (0.06 millimeters!)}$$
This completely eliminates vertex swimming and allows the engine to render millimeter-precision cracks in rock faces or shoreline waves on an interactive planetary globe.

### 2. Vertical Quantization Limits

```
+---------------------------------------------------------------------------------------------+
|                               VERTICAL QUANTIZATION ACCURACY STEPS                          |
|                                                                                             |
|  Format           Bits    Total Steps   Range (-11km to +9km)      Precision Step (delta z) |
|  -----------------------------------------------------------------------------------------  |
|  8-bit (RGBA8)     8              256   20,000 meters              78.125 meters (Terracing)|
|  16-bit (UINT16)  16           65,536   20,000 meters               0.305 meters (Sub-foot) |
|  24-bit (RGB24)   24       16,777,216   20,000 meters               0.0012 meters (1.2 mm)  |
|  Float16 (Half)   11 mantissa    2048   Variable (11-bit mantissa)  0.5m to 4.0m in mountains|
|  Float32 (Single) 24 mantissa16.7M/oct  20,000 meters               < 0.0001 meters         |
+---------------------------------------------------------------------------------------------+
```

- **Analysis**: The current codebase's use of 16-bit uint16 arrays (`earth-etopo2022-dem-u16.bin`) provides $\delta z \approx 0.30\text{ m}$ ($1\text{ foot}$), which is ideal for regional topography. To represent 1-meter LiDAR with centimeter vertical precision, the pipeline should adopt **24-bit packed RGB encoding** (Mapbox/Terrarium standard: $z = -10000 + (R \cdot 256^2 + G \cdot 256 + B) \cdot 0.1$) or native `r32float` COG streaming.

---

## 5. Frontier Technologies to Push Beyond Current Limits

```
+---------------------------------------------------------------------------------------------+
|                                    FRONTIER HORIZONS                                        |
+---------------------------------------------------------------------------------------------+

  FRONTIER A: WebGPU Mesh Shaders / Compute Pre-Tessellation
  - Replace static quadtree grid patches with compute shader cluster generation.
  - Dynamically cull backface and sub-pixel terrain clusters before rasterization.
  - Generates adaptive micro-triangles perfectly matched to screen pixel density (1:1).

  FRONTIER B: Implicit Neural Elevation Fields (Neural DEMs)
  - Train a compact Multi-Layer Perceptron (MLP) with hash grid encoding (Instant-NGP style)
    on global 30m elevation.
  - An entire continent can be compressed into a 50 MB weight tensor evaluated in real time
    inside a WebGPU compute shader, producing infinite smooth fractal micro-relief.

  FRONTIER C: Real-Time Shallow-Water Hydrodynamic Simulation
  - Couple the static elevation DEM with a live 2D shallow-water equation solver (SWE).
  - Simulates dynamic storm surges, tsunami propagation, and rainfall runoff pooling
    directly over the topographic terrain in real time.
+---------------------------------------------------------------------------------------------+
```

### Strategic Action Plan for Implementation

| Milestone | Action Item | Target Technology | Measurable Deliverable |
| :--- | :--- | :--- | :--- |
| **Stage 1** | Upgrade Global Topobathy Base | GEBCO 2024 Grid (15") + EGM2008 Datum Reconciliation | Zero coastline datum step; modern multi-beam bathymetry |
| **Stage 2** | Implement Relative-to-Eye (RTE) | Float-Float camera subtraction in `crust_hydrosphere.wgsl` | Sub-millimeter geometric stability at ground-level zoom |
| **Stage 3** | Convert Inset Streaming to COG / PMTiles | Cloud-Optimized GeoTIFF + HTTP Range Requests | On-demand streaming of USGS 3DEP 1m and CUDEM 3m insets |
| **Stage 4** | Deploy Virtual Texture Clipmaps | WebGPU Sparse Virtual Texture Pool ($4096^2$ cache) | Seamless zoom from space to ground within 128 MB VRAM |
| **Stage 5** | High-Res Vector Coastline Integration | Overture Maps Water Theme via local PMTiles | Survey-grade sub-10m coastlines across all projection modes |
