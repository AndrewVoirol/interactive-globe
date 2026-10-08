# Visual Technical Architecture & Codebase Ground-Truth Analysis

An authoritative forensic analysis of the geospatial data pipelines, elevation encoding, bathymetry, coastlines, and GPU rendering methodology in the `ais-interactive-globe-to-map` (Indicatrix Engine) codebase.

---

## Executive Summary & System Overview

The `ais-interactive-globe-to-map` project is a high-performance WebGPU cartographic rendering engine designed to achieve seamless, continuous morphological transformation between a 3D geodetic planetary sphere (globe) and planar 2D projections (Equirectangular, Web Mercator, Dymaxion net). Unlike traditional GIS applications that rely on raster tile servers or pre-rendered tile pyramids fetched over the network, this engine implements an offline-capable, GPU-driven architecture where topographic elevation, oceanic bathymetry, lake water datums, hydrologic drainage accumulation, and vector coastlines are evaluated on the GPU.

```
+---------------------------------------------------------------------------------------------------------+
|                                    OFFLINE INGESTION & PACKING PIPELINE                                 |
|                                                                                                         |
|  [NOAA ETOPO 2022]        [MERIT Hydro UPA]       [HydroLAKES GPKG]        [Natural Earth 1:10m]        |
|  15 arc-sec Topobathy     15 arc-sec Flow Basin    Authoritative Polygons   Coastlines & River Centerlines|
|         |                        |                        |                        |                    |
|         v                        v                        v                        v                    |
|  pipelines/pack_dem_hydrology.py                                    scripts/precompute-vectors-10m.ts    |
|  scripts/precompute-etopo2022.py                                     scripts/precompute-contours.py      |
|         |                                                 |                        |                    |
|         +-----------------------+-------------------------+                        |                    |
|                                 v                                                  v                    |
|  +------------------------------+-------------------------------+  +---------------+-----------------+  |
|  | GPU Block-Compressed Texture Pyramids (public/)              |  | Binary Structured Meshes        |  |
|  | - earth-etopo2022-dem-bc4.dds  (21.3 MB, [-11km, +9km])      |  | - geo-vectors.bin     (38.8 MB) |  |
|  | - earth-etopo2022-dem-u16.bin  (256 MB, 8192x4096 rgba16)    |  | - geo-contour-mesh.bin (2.4 MB) |  |
|  | - earth-hydrology-bc5.dds      (10.7 MB, Flow + Lake Datum)  |  | - geo-mesh-1m.bin     (45.7 MB) |  |
|  | - earth-normals-bc5.dds        (10.7 MB, Tangent + Toksvig)  |  +---------------------------------+  |
|  +--------------------------------------------------------------+                                       |
+---------------------------------------------------------------------------------------------------------+
                                                |
                                                v
+---------------------------------------------------------------------------------------------------------+
|                                     WEBGPU RUNTIME ENGINE (CLIENT)                                      |
|                                                                                                         |
|  WebGPUEngine.ts (428 KB Core Engine)                                                                   |
|  +---------------------------------------------------------------------------------------------------+  |
|  | Two-Root Spherical CDLOD Quadtree (Root 0: West Hemisphere [0..0.5], Root 1: East [0.5..1.0])    |  |
|  | - Traversal up to LOD 12 with Distance-Based Subdivision & Edge-Constraint Relaxation             |  |
|  | - Continuous Morph Factor: alpha = clamp((r - morphStart) * invMorphRange, 0.0, 1.0)              |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                                                |                                                        |
|                                                v                                                        |
|  GPU Vertex & Fragment Shader Pipeline:                                                                 |
|  +---------------------------------------------------------------------------------------------------+  |
|  | crust_hydrosphere.wgsl (113 KB)                                                                   |  |
|  | - Manifold Kinematics: Mode 0 (Equirectangular), Mode 1 (Mercator), Mode 2 (LEFM), Mode 3 (Fluid)|  |
|  | - Elevation Sampling: Global ETOPO + Regional Insets (CUDEM 3m/10m, USGS 3DEP 30m, GLO-30 30m)   |  |
|  | - Dual-Surface Hydrosphere: Liquid envelope conforming to dynamic lake datums & global sea level   |  |
|  | - Jerlov Water Optical Model: Type I-III spectral downwelling attenuation Kd(lambda)             |  |
|  | - Kubelka-Munk Scattering & Gerstner Wave Harmonic Micro-Caustics                               |  |
|  | - Eduard Imhof Swiss Relief Hillshading with Aspect-Dependent Warm/Cool Tinting                   |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                                                |                                                        |
|                                                v                                                        |
|  Vector Ribbon & Overlay Shaders:                                                                       |
|  +---------------------------------------------------------------------------------------------------+  |
|  | vector_ribbon.wgsl (17 KB)                                                                        |  |
|  | - Screen-space dynamic width extrusion (sub-millimeter standoff R = 5.015 above terrain)           |  |
|  | - Chapman atmospheric horizon limb falloff: tau = 0.15, zero bleed past geometric horizon        |  |
|  +---------------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

---

## Authoritative Data Sources Identified in Code

A rigorous audit of the repository's ingestion scripts, Python pipelines, TypeScript loaders, and WebGPU bindings reveals the complete inventory of ground-truth datasets used to construct the planetary model:

| Data Category | Authoritative Source Dataset | Spatial Resolution / Extent | Ingestion Script / Code Reference | Physical Target Artifact |
| :--- | :--- | :--- | :--- | :--- |
| **Global Bedrock Topobathy** | **NOAA NCEI ETOPO 2022** (Bedrock & Surface 15 arc-sec / 60 arc-sec) | 15 arc-sec (~450m at equator); $21,600 \times 10,800$ downsampled to $8,192 \times 4,096$ | [`pipelines/pack_dem_hydrology.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/pipelines/pack_dem_hydrology.py#L188-L270)<br>[`scripts/precompute-etopo2022.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-etopo2022.py#L38-L120) | `public/earth-etopo2022-dem-bc4.dds`<br>`public/earth-etopo2022-dem-u16.bin`<br>`public/earth-etopo2022-dem.webp` |
| **Global Drainage Basins** | **MERIT Hydro** (Upstream Drainage Area - UPA) | 15 arc-sec (~450m); Global hydrological river networks | [`pipelines/pack_dem_hydrology.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/pipelines/pack_dem_hydrology.py#L272-L375) | `public/earth-hydrology-bc5.dds` (Red channel) |
| **Authoritative Lakes** | **HydroLAKES** (Global Lake Polygons & Surface Elevation Datums) | Global vector database of 1.4M lakes (>10 ha); Burned to raster | [`pipelines/pack_dem_hydrology.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/pipelines/pack_dem_hydrology.py#L377-L485) | `public/earth-hydrology-bc5.dds` (Green channel)<br>`data/hydrolakes_authoritative.gpkg` |
| **Regional Topobathy (Litmus)** | **NOAA CUDEM** (Continuously Updated DEM) | $1/9\text{ arc-sec}$ (~3m) & $1/3\text{ arc-sec}$ (~10m) | [`scripts/precompute-regional-dem.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-regional-dem.py#L46-L75) | `public/regional/hawaii-dem-u16.bin`<br>`public/regional/capecod-dem-u16.bin` |
| **Regional Terrestrial (Litmus)** | **USGS 3DEP** (Grand Canyon National Park) | $1\text{ arc-sec}$ (~30m) Seamless GeoTIFF | [`scripts/precompute-regional-dem.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-regional-dem.py#L76-L92) | `public/regional/dem-grand-canyon-30m.bin` |
| **Regional Terrestrial (Litmus)** | **Copernicus DEM GLO-30** (Mount Fuji, Japan) | $1\text{ arc-sec}$ (~30m) Cloud-Optimized GeoTIFF | [`scripts/precompute-regional-dem.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-regional-dem.py#L93-L105) | `public/regional/dem-fuji-30m.bin` |
| **Vector Coastlines & Rivers** | **Natural Earth 1:10m Physical** | $1:10,000,000$ cartographic vector scale | [`scripts/precompute-vectors-10m.ts`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-vectors-10m.ts#L45-L110) | `public/geo-vectors.bin` (Magic: `GVEC`) |
| **Modern Vector Challenger** | **Overture Maps Foundation** (GeoParquet Base Theme: Water) | High-precision OSM/Daylight derived water & coastline polygons | [`scripts/precompute-overture-vectors.ts`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-overture-vectors.ts#L20-L75) | DuckDB S3 query extraction pipeline |
| **Legacy Baseline Baseline** | **NASA Blue Marble Next Generation / GEBCO 2008** | $5400 \times 2700$ downsampled to $2048 \times 1024$ | [`scripts/precompute-dem.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-dem.py#L12-L55) | `public/earth-elevation-dem.webp` |
| **Orbital Surface Imagery** | **NASA Blue Marble & Black Marble** | $4096 \times 2048$ RGB Photographic Earth | [`src/webgpu/WebGPUCanvas.tsx`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/src/webgpu/WebGPUCanvas.tsx#L896) | `public/earth-blue-marble-4k.webp`<br>`public/earth-night-lights-4k.webp` |

---

## Data Pipeline Architecture & Encoding Formats

### 1. The Global Elevation Texture (`earth-etopo2022-dem-bc4.dds` & `u16.bin`)

The engine establishes a globally continuous vertical coordinate system calibrated between two authoritative geodetic anchors:
1. **Mount Everest Summit** ($27.9881^\circ\text{ N}, 86.9250^\circ\text{ E}$): $+8,848.86\text{ m}$
2. **Mariana Trench Challenger Deep** ($11.3733^\circ\text{ N}, 142.5917^\circ\text{ E}$): $-10,924.0\text{ m}$

The total vertical dynamic span is:
$$\Delta Z_{\text{global}} = Z_{\max} - Z_{\min} = 8848.0 - (-10924.0) = 19,772.0\text{ m}$$

In `pipelines/pack_dem_hydrology.py`, a broader headroom span of $[-11,000\text{m}, +9,000\text{m}]$ ($\Delta Z = 20,000.0\text{m}$) is used for block-compressed BC4 packaging:

```
+---------------------------------------------------------------------------------------------+
|                          BC4 DIRECTDRAW SURFACE (DDS) MIPMAP PYRAMID                        |
|                                                                                             |
|  Level 0: 8192 x 4096 (16,777,216 bytes) -> 4x4 blocks compressed to 8 bytes (BC4U / RGTC1)|
|  Level 1: 4096 x 2048 ( 4,194,304 bytes)                                                   |
|  ...                                                                                        |
|  Level 13: 1 x 1      (         8 bytes)                                                   |
|  Total File Size: 22,369,664 bytes (21.33 MB)                                               |
+---------------------------------------------------------------------------------------------+
```

#### Dual-Format Loading Strategy (`WebGPUEngine.ts` L4165–L4350)
The client engine implements an adaptive loading hierarchy:
1. **16-bit Raw Binary (`earth-etopo2022-dem-u16.bin`)**: When available, the engine allocates an `rgba16float` GPU texture. The 16-bit unsigned integers are converted to IEEE 754 half-precision floats via a precomputed lookup table (`U16_TO_F16_LUT`). This achieves a vertical quantization step of:
   $$\delta z = \frac{19,772.0\text{ m}}{65,535} \approx 0.3017\text{ m (sub-foot precision)}$$
   This completely eliminates the staircase terracing artifacts inherent in 8-bit elevation textures.
2. **Lossless WebP Fallback (`earth-etopo2022-dem.webp`)**: If bandwidth or memory constraints prevent streaming the 256 MB raw array, the engine loads an $8192 \times 4096$ 4-channel WebP texture (12.9 MB), where:
   - **Channel R**: Normalized terrestrial elevation ($0\text{m}$ to $+8,848\text{m}$)
   - **Channel G**: Normalized oceanic bathymetry ($-10,924\text{m}$ to $0\text{m}$)
   - **Channel B**: Continuous anti-aliased shoreline mask ($0.0 = \text{Ocean}, 1.0 = \text{Land}$)
   - **Channel A**: Signed continuous elevation ($z_{\text{norm}} = (z - Z_{\min}) / \Delta Z$)

### 2. Hydrology & Lake Datum Packaging (`earth-hydrology-bc5.dds`)

In `pipelines/pack_dem_hydrology.py`, two independent hydrologic datasets are merged and block-compressed into a two-channel BC5 texture (`bc5-rg-unorm`, 10.7 MB):

```
+---------------------------------------------------------------------------------------------+
|                          BC5 HYDROLOGY TEXTURE ENCODING (4096 x 2048)                       |
|                                                                                             |
|  [RED CHANNEL: Drainage Accumulation V]           [GREEN CHANNEL: Lake Datum z_lake]        |
|  Source: MERIT Hydro 15" UPA                      Source: HydroLAKES Authoritative Polygons |
|  Formula: V = log(A + 1) / log(A_max + 1)         Range: 0.0m to 9,000.0m                   |
|  A_max = 7,000,000 km^2 (Amazon Basin Mouth)      Formula: G = clamp(z_lake / 9000.0, 0, 1) |
|  Preserved across mips via 2D MAX-POOLING         Zero for oceans and dry land              |
+---------------------------------------------------------------------------------------------+
```

- **Max-Pooling Mipmap Construction**: Traditional box-filtering averaging destroys thin river paths and small high-altitude lakes at higher mip levels. The pipeline overrides linear downsampling with a 2D max-pooling filter (`maxpool_2d`), ensuring that major drainage arteries (Amazon, Congo, Mississippi, Nile, Yangtze) remain visible as continuous ribbons even when viewing the entire planetary disc.

### 3. Tangent-Space Normals & Toksvig Anti-Aliasing (`earth-normals-bc5.dds`)

Surface normals are computed analytically on the sphere using geodetic finite differences taking into account latitude-dependent metric grid convergence:
$$\Delta y = R_{\text{earth}} \cdot \Delta\phi, \quad \Delta x(\phi) = R_{\text{earth}} \cdot \cos(\phi) \cdot \Delta\lambda$$

$$\frac{\partial z}{\partial x} = \frac{z(\lambda + \Delta\lambda) - z(\lambda - \Delta\lambda)}{2 \Delta x(\phi)}, \quad \frac{\partial z}{\partial y} = \frac{z(\phi - \Delta\phi) - z(\phi + \Delta\phi)}{2 \Delta y}$$

$$\vec{N} = \text{normalize}\left(-\frac{\partial z}{\partial x}, \frac{\partial z}{\partial y}, 1.0\right)$$

#### Toksvig Specular Roughness Filtering
When minified, averaging unit normal vectors decreases their length:
$$L = \|\vec{N}_{\text{avg}}\| \le 1.0$$
The length deficit $1 - L$ represents unresolved sub-texel geometric variance (roughness). The pipeline stores $(N_x \cdot L, N_y \cdot L)$ in `earth-normals-bc5.dds`. In the fragment shader, this length is unpacked to dynamically broaden the specular highlight and soften hillshading grazing angles, completely eliminating specular aliasing and shimmering over mountain massifs.

### 4. Vector Geometry Engine (`geo-vectors.bin`)

Coastlines, international borders, and major river centerlines are precomputed by `scripts/precompute-vectors-10m.ts` into a dedicated binary format with magic header `0x47564543` (`GVEC`):

```
+---------------------------------------------------------------------------------------------+
|                                  GVEC BINARY DATA STRUCTURE                                 |
|                                                                                             |
|  Offset  0..3:   Magic (0x47564543 = 'GVEC')                                                |
|  Offset  4..7:   Segment Count N (uint32)                                                   |
|  Offset  8..11:  Vertex Count V (uint32)                                                    |
|                                                                                             |
|  Interleaved Vertex Buffer:                                                                 |
|  - positions3D: Float32Array (V * 3) -> Spherical coordinates at R = 5.015                  |
|  - target2D:    Float32Array (V * 2) -> Planar Mercator coordinates (x, y)                   |
|  - dymaxion2D:  Float32Array (V * 2) -> Unfolded Fuller Icosahedral coordinates              |
|  - vType:       Float32Array (V * 1) -> 1.0 for Coastlines, 0.5 for Major Rivers            |
|  - IndexBuffer: Uint32Array  (N * 2) -> Segment endpoints (i0, i1)                          |
+---------------------------------------------------------------------------------------------+
```

- **Standoff Radius ($R = 5.015$)**: The 3D vertices are computed at $R = 5.015$ (where the base planetary crust is $R = 5.000$). This provides a precise $15\text{ mm}$ physical standoff in engine model units, preventing any z-fighting against highest mountain peaks while remaining visually clamped to the terrain.

---

## Rendering Methodology & Mathematical Foundations

### 1. Continuous Distance-Dependent Level of Detail (CDLOD)

To render an entire planet with local sub-meter detail without exceeding GPU memory budgets, `WebGPUEngine.ts` implements a modified CDLOD (Continuous Distance-Dependent Level of Detail) quadtree on a dual-root spherical base.

```
       GLOBAL PARAMETRIC SPACE [0, 1] x [0, 1]
+-------------------------+-------------------------+
|                         |                         |
|   ROOT 0: WEST HEMI     |   ROOT 1: EAST HEMI     |
|   UV: [0.0, 0.0]        |   UV: [0.5, 0.0]        |
|    to [0.5, 1.0]        |    to [1.0, 1.0]        |
|   Center: (-R, 0, 0)    |   Center: (+R, 0, 0)    |
|                         |                         |
+-------------------------+-------------------------+
             |                         |
             v                         v
     Quadtree Division         Quadtree Division
      (up to LOD 12)            (up to LOD 12)
```

#### Crack-Free Morphing Without Skirts
Adjacent quadtree nodes at different LOD levels create T-junctions and crack artifacts along edges. The engine avoids geometry skirts or stitch strips by evaluating a continuous parameter space morph factor $\alpha$ directly in `crust_hydrosphere.wgsl` (L633–L646):

$$\alpha = \text{clamp}\left(\frac{r - \text{morphStart}}{\text{morphEnd} - \text{morphStart}}, 0.0, 1.0\right)$$

$$\vec{p}_{\text{morphed}} = \vec{p} - \alpha \cdot \left(\text{fract}(\vec{p} \cdot 32.0) \cdot \frac{1}{32.0}\right)$$

Where $r$ is the Euclidean distance from the camera to the patch vertex, and odd grid vertices smoothly interpolate to even grid vertices as $\alpha \to 1.0$. This ensures that at the boundary where a finer node meets a coarser node, the finer node's edge vertices have already snapped exactly to the coarser node's vertices, maintaining strict topological $C^0$ continuity across all LOD boundaries.

### 2. Four-Mode Developable Manifold Kinematics (`manifold.wgsl`)

The unrolling transformation from 3D sphere to 2D planar map is governed by an unfurl parameter $\mu \in [0.0, 1.0]$, executed entirely in vertex shaders:

```
+---------------------------------------------------------------------------------------------+
|                                    MANIFOLD PROJECTION MODES                                |
|                                                                                             |
|  Mode 0: Equirectangular Developable Folio Wave                                             |
|          - Unrolls along parallels; preserves 2:1 aspect ratio                              |
|          - Target: (lambda * R, phi * R)                                                    |
|                                                                                             |
|  Mode 1: Cylindrical / Web Mercator Unroll                                                  |
|          - Conformal mapping; parallel lines of latitude and longitude                      |
|          - Target: (lambda * R, R * ln(tan(pi/4 + phi/2)))                                  |
|                                                                                             |
|  Mode 2: Linear Elastic Fracture Mechanics (LEFM)                                           |
|          - Peeling sheet with stress-intensity crack propagation along antimeridian seam    |
|          - Stress field: sigma_ij ~ K_I / sqrt(2*pi*r) * f_ij(theta)                        |
|                                                                                             |
|  Mode 3: Solenoidal Conformal Fluid Morph                                                   |
|          - Non-divergent curl noise vector field (div u = 0 guaranteed)                     |
|          - u = curl(psi), preserving surface metric tensor during transition                |
+---------------------------------------------------------------------------------------------+
```

#### Analytical Surface Normal During Morphing
Rather than using finite-difference vertex re-sampling, `evaluateMacroChart` in `manifold.wgsl` evaluates the exact analytical surface normal $\vec{N}_{\text{base}} = \vec{T}_\lambda \times \vec{T}_\phi$ throughout the entire unrolling process, ensuring that lighting and shadows remain physically consistent at every intermediate stage of projection.

### 3. Dual-Surface Liquid Hydrosphere (`crust_hydrosphere.wgsl`)

To model the physical separation between dry land, inland lakes, and the global ocean, the engine evaluates two distinct geometric horizons at every vertex:

1. **The Solid Crust Surface**:
   $$z_{\text{crust}} = \text{decodeElevation}(\text{DEM}(u, v))$$
2. **The Liquid Water Datum**:
   $$z_{\text{water}} = \begin{cases} z_{\text{lake}}, & \text{if } z_{\text{lake}} > 0 \\ z_{\text{sea\_level}}, & \text{otherwise} \end{cases}$$

The actual vertex displacement along the normal vector $\vec{n}$ is modulated by surface type:
$$\vec{P}_{\text{final}} = \vec{P}_{\text{base}} + \vec{n} \cdot \left(\text{select}(z_{\text{crust}}, \max(z_{\text{crust}}, z_{\text{water}}), \text{isWaterSurface}) \cdot S_{\text{vertical}}\right)$$

This mathematical formulation guarantees:
- **No Z-Fighting**: The water surface and underlying seabed are rendered in distinct passes or displaced cleanly above the crust.
- **Perched Inland Lakes**: High-altitude lakes (e.g., Lake Titicaca at $+3,812\text{ m}$, Lake Superior at $+183\text{ m}$) do not drain down to global sea level ($0\text{ m}$); they rest naturally within their topographic basins.
- **Submerged Bathymetric Relief**: The ocean floor remains geometrically carved below sea level, enabling optical depth calculations through the water column.

### 4. Hydrospheric Optics: Jerlov Water Types & Kubelka-Munk Radiative Transfer

Instead of rendering oceans as a flat blue texture, the engine models physical radiative transfer through water columns:

```
           Incident Sunlight (L)
                 \
                  \   Fresnel Reflection (R_f)
       ~~~~~~~~~~~~\~~~~~~~~~~~~~~~~ Surface ~~~~~~~~~~~~
                     \
                      \  Downwelling Attenuation exp(-Kd * d)
                       \
                        v
                 +--------------+
                 | Ocean Floor  |  Albedo (A_b)
                 +--------------+
                        |
                        | Upwelling Attenuation exp(-Ku * d)
                        v
       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              Observer / Camera View (V)
```

- **Jerlov Optical Water Classification**: In `crust_hydrosphere.wgsl` (L244–L270), the spectral attenuation coefficient $K_d(\lambda)$ is parameterized across Jerlov water types (Type I oceanic clear water, Type II coastal water, Type III turbid estuarine water):
  - **Type I (Open Ocean)**: Blue-green wavelength transmission ($\lambda \approx 475\text{ nm}$) penetrates up to $100\text{ m}$, creating deep navy and cobalt hues in ocean trenches.
  - **Type III (Coastal / Estuarine)**: Strong red/blue absorption with higher green scatter, matching real-world shallow continental shelves and river outflows.
- **Kubelka-Munk Radiative Transfer**: Shallow water reflectance is calculated using dual-flux absorption ($K$) and scattering ($S$) coefficients, allowing underlying bathymetric topography (shoals, coral atolls, continental shelves) to softly emerge through crystal-clear shallow water.
- **Gerstner Wave Micro-Caustics**: In shallow coastal waters ($d < 30\text{ m}$), a dynamic multi-harmonic Gerstner wave network calculates optical caustic intensity:
  $$I_{\text{caustic}} = \exp\left(-\frac{d}{12.0}\right) \cdot \left(\sum_{k=1}^3 A_k \cos(\vec{K}_k \cdot \vec{x} - \omega_k t)\right)^2$$
  producing animated underwater sunlight ripples on shallow sea beds.

### 5. Cartographic Shading: Eduard Imhof Swiss Relief

Land topography is rendered using a modern WebGPU realization of Eduard Imhof's classical Swiss relief shading principles (`crust_hydrosphere.wgsl` L780–L890):
- **Aspect-Dependent Color Temperature Modulation**: Northwest-facing illuminated slopes receive a warm golden/cream tint ($\approx 5200\text{ K}$), while southeast-facing shadow slopes receive a cool, atmospheric cyan/blue tint ($\approx 7500\text{ K}$).
- **Elevation-Dependent Aerial Perspective**: Lowlands are softened with a gentle atmospheric tint, while high peaks (Himalayas, Alps, Andes) feature crisp, un-attenuated contrast and pristine snowcaps.
- **Slope-Curvature Adaptation**: The shading model blends Lambertian diffuse reflectance with second-order profile curvature, exaggerating sharp ridgelines, glacial cirques, and canyon walls.

---

## Code Verification Reference Matrix

| Architectural Subsystem | Source Code Path | Primary Functions / Symbols | Key Mathematical Invariant |
| :--- | :--- | :--- | :--- |
| **DEM & Hydrology Packing** | [`pipelines/pack_dem_hydrology.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/pipelines/pack_dem_hydrology.py) | `ingest_etopo_dem`<br>`ingest_merit_hydro`<br>`ingest_hydrolakes`<br>`encode_bc4_channel_blocks` | ETOPO 15" downsampled to 8K BC4; MERIT UPA max-pooled to BC5; HydroLAKES burned to 16-bit raster |
| **Regional Litmus Precompute** | [`scripts/precompute-regional-dem.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-regional-dem.py) | `REGIONS`<br>`read_geotiff`<br>`pack_dem_arrays` | Hawaii (CUDEM 10m), Cape Cod (CUDEM 3m), Grand Canyon (3DEP 30m), Fuji (GLO-30 30m) |
| **Vector Extraction Pipeline** | [`scripts/precompute-vectors-10m.ts`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-vectors-10m.ts) | `toSphere`<br>`toMercator`<br>`sampleElevation` | Natural Earth 1:10m packed into `GVEC` binary with $R = 5.015$ elevation offset |
| **Isoline Contour Engine** | [`scripts/precompute-contours.py`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/scripts/precompute-contours.py) | `BilinearMarchingSquares`<br>`SphericalVisvalingamWhyatt` | Gregory Nielson Asymptotic Decider (1991) + Simon l'Huilier Spherical Excess Formula |
| **WebGPU Core Engine** | [`src/webgpu/WebGPUEngine.ts`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/src/webgpu/WebGPUEngine.ts) | `loadDEMTexture`<br>`loadHydroTexture`<br>`buildCDLODQuadtree`<br>`updateDEMBindGroups` | Two-root spherical quadtree, CDLOD LOD 0..12 node pool, BC4/BC5 texture slot management |
| **Crust & Ocean Shader** | [`src/webgpu/shaders/crust_hydrosphere.wgsl`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/src/webgpu/shaders/crust_hydrosphere.wgsl) | `vs_main`<br>`decodeElevation`<br>`computeHydrosphereShading`<br>`evaluateKubelkaMunk` | Dual-surface displacement, continuous CDLOD morphing, Jerlov optics, Imhof hillshading |
| **Manifold Projection Shader** | [`src/webgpu/shaders/manifold.wgsl`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/src/webgpu/shaders/manifold.wgsl) | `evaluateMacroChart`<br>`evaluateModeZero`<br>`horizonFalloff` | 4-mode kinematic unrolling, analytical surface normal $\vec{T}_\lambda \times \vec{T}_\phi$, Chapman horizon falloff |
| **Screen-Space Vector Ribbon** | [`src/webgpu/shaders/vector_ribbon.wgsl`](file:///Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/src/webgpu/shaders/vector_ribbon.wgsl) | `vs_main`<br>`fs_main` | Dynamic pixel-width line extrusion, anti-aliased edge smoothing, horizon occlusive fade |
