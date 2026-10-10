# ZOOM_DETAIL_SPEC_LEDGER.md
---

## §1: Executive Architecture Audit — Current Zoom Detail Plateaus

This specification ledger details the authoritative technical options for enabling deep zoom-in detail anywhere on the globe or unfurled map within the Indicatrix Engine.

### 1.1 Root Causes of Detail Degradation Across Current Subsystems

| Subsystem | Source Asset / Code Location | Native Resolution / Baseline | Zoom Plateau Symptom |
| :--- | :--- | :--- | :--- |
| **Crust DEM (Elevation)** | `public/earth-gebco2024-dem-u16.bin` (`u_demTexture`) | 8192 × 4096 (16-bit uint per channel) | At equator, 1 texel $\approx 4.88\text{ km}$. Zooming below 100 km altitude samples interpolated texels; terrain lacks sub-kilometer summits, gullies, or cirques. |
| **CDLOD Quadsphere Mesh** | `src/webgpu/WebGPUEngine.ts` (`updateCDLOD`) | 64×64 patch grid; `cdlodMaxLod = 10` (global) | At LOD 10, patch size is $0.3515^\circ \approx 39.1\text{ km}$; vertex spacing is $\approx 610\text{ meters}$. Close-up camera views run out of geometric vertices. |
| **Surface Normal Shading** | `src/webgpu/shaders/crust_hydrosphere.wgsl` (`normSample0`) | `public/earth-normals-bc5.dds` (8192 × 4096) | Blends macro/micro normals using `pixelFootprintM`. Clamps at 450 m to an 8K normal map that itself is derived from the ~4.88 km DEM. Rock massifs look like smooth clay. |
| **Vector Linework** | `public/geo-vectors.bin` (`vector_ribbon.wgsl`) | Natural Earth 1:10M (~600k segments) | Coastlines and rivers are static single-tier vectors. When zoomed in to a bay or valley, lines are coarse straight chords spanning 10–30 km. No tributary rills. |
| **Topographic Contours** | `public/geo-contour-mesh.bin` (`renderContours`) | Fixed precomputed global isolines | Fixed vertical interval; does not subdivide into dense 50m / 20m / 10m lines when zooming into steep alpine passes. |
| **Geographic Toponymy** | N/A (unimplemented) | 0 labels on 3D manifold | No mountain peak names, spot elevations (e.g. `▲ 4,809m`), ocean trench soundings, or city/bay inscriptions. Map feels empty at local scales. |
| **Camera Kinematics** | `KinematicCameraController.tsx` & `WebGPUCanvas.tsx` | Heliocentric orbit around $(0, 0, 0)$ | Orbiting or rotating when zoomed in swings the camera across continents in a massive arc rather than pivoting around the local terrain focus. |

---

## §2: Option Track A — Procedural Geomorphic Synthesis & Imhof Rock Shading (Shader-Driven / Zero Asset Overhead)

Procedural geomorphic synthesis requires **zero additional asset downloads**, maintains 120 FPS on WebGPU, and provides infinite resolution at any zoom depth.

### 2.1 Technical Specifications

- [ ] **A.1 Procedural Eduard Imhof Alpine Rock Face Shading (Slopes >35°)**:
  - Implement slope classification in `crust_hydrosphere.wgsl`:
    $$\theta_{\text{slope}} = \arccos(\mathbf{n}_{\text{crust}} \cdot \mathbf{n}_{\text{up}})$$
    $$w_{\text{rock}} = \text{smoothstep}(0.58, 0.72, \sin \theta_{\text{slope}}) \quad (\approx 35^\circ \text{ to } 46^\circ)$$
  - Evaluate high-frequency directional jointing and couloir fluting:
    $$S_{\text{couloir}} = \left| \nabla h \times \mathbf{n}_{\text{up}} \right| \cdot \text{noise3D}(\mathbf{p} \cdot k_{\text{rock}})$$
  - Modulate diffuse and specular response to evoke hand-engraved rock drawing from Eduard Imhof's cartographic method.

- [ ] **A.2 Screen-Space Dynamic Analytical Contour Isolines**:
  - In `crust_hydrosphere.wgsl`, evaluate continuous topographic and bathymetric isolines analytically:
    $$\Delta h_{\text{zoom}} = \text{exp2}\left(\left\lfloor \log_2(\max(10.0, \text{camAltitudeMeters} \cdot 0.05)) \right\rfloor\right)$$
    $$u_{\text{contour}} = \frac{h_{\text{elev}}}{\Delta h_{\text{zoom}}}$$
    $$I_{\text{contour}} = \text{smoothstep}\left(1.2 \cdot \text{fwidth}(u_{\text{contour}}), 0.0, \left| \operatorname{fract}(u_{\text{contour}} - 0.5) - 0.5 \right|\right)$$
  - Automatically thickens every 5th index contour by evaluating $u_{\text{index}} = u_{\text{contour}} / 5.0$.
  - Generates dense, crisp 20m, 50m, 100m, or 500m contours everywhere on Earth dynamically without mesh buffers.

- [ ] **A.3 Multi-Octave Geomorphic Micro-Roughness Normal Perturbation**:
  - When $pixelFootprintM < 2500\text{m}$, blend an analytical multi-frequency Perlin/Worley erosion noise into $\mathbf{n}_{\text{effective}}$:
    $$\mathbf{n}_{\text{micro}} = \text{normalize}\left(\mathbf{n}_{\text{macro}} + \sum_{i=1}^4 \frac{1}{2^i} \nabla_{\text{tangent}} \mathcal{N}(2^i \cdot \mathbf{p})\right)$$
  - Attenuate over flat plains ($w_{\text{rock}} \to 0$) and amplify on scree slopes and ridge crests.

### 2.2 WGSL Signature & Uniform Layout

```wgsl
struct GeomorphicMicroUniforms {
    u_microDetailStrength: f32, // offset 0 (0.0 to 1.5, default 0.65)
    u_rockSlopeThreshold: f32,  // offset 4 (radians, default 0.61 rad ~35 deg)
    u_contourBaseInterval: f32, // offset 8 (meters, default 50.0m)
    u_contourActive: f32,       // offset 12 (1.0 = on, 0.0 = off)
};

fn evaluateImhofRockStrata(p: vec3<f32>, n: vec3<f32>, slope: f32, footprintM: f32) -> vec3<f32>;
fn evaluateDynamicContours(elevM: f32, dElev: vec2<f32>, camDist: f32) -> f32;
```

---

## §3: Option Track B — Global Multi-Resolution Data Streaming (OGC Tiles & COG Pyramids)

Streams real-world elevation and topobathymetry on demand via standard geospatial protocols, unlocking authentic 10m–30m LiDAR/radar ground truth worldwide.

### 3.1 Technical Specifications

- [ ] **B.1 Global Terrain Tile Pyramid Streaming (Terrarium / Mapbox RGB)**:
  - Wire `src/core/standards/OGCTileEngine.ts` to standard cloud elevation tile services (AWS Open Data Terrarium, Cop-DEM 30m, or USGS 3DEP):
    $$h_{\text{terrarium}} = (R \cdot 256 + G + B / 256) - 32768.0$$
    $$h_{\text{mapbox}} = -10000.0 + (R \cdot 65536 + G \cdot 256 + B) \cdot 0.1$$
  - Implement a GPU Texture2DArray Tile Cache (e.g. 64 slots of 256×256 Float16) with LRU eviction and zero-GC writeTexture.
  - Coordinate system: `WorldCRS84Quad` or `WebMercatorQuad` via `traversePyramid(bounds, zoom)`.

- [ ] **B.2 Global Cloud-Optimized GeoTIFF (COG) Pyramid Extension**:
  - Extend `globalGeoTIFFDataSource` in `WebGPUEngine.ts` to stream from global COG pyramids (e.g. ETOPO 15-arcsec or GEBCO 2024 global COG with overviews LOD 0..6).
  - Use HTTP 206 Range requests for individual 256×256 tiles, reusing the existing `streamRegionalCOGTile` zero-GC pipeline.

- [ ] **B.3 Dynamic CDLOD Quadsphere Subdivision Scaling**:
  - Increase `cdlodMaxLod` from 10 to 14 (effective vertex spacing drops from 610m to 38m).
  - Dynamically budget `cdlodNodePool` (increase capacity from 4096 to 8192 nodes during close zoom).

---

## §4: Option Track C — Multi-Tier Vector LOD & Hydrological Stream Hierarchy

Replaces monolithic 1:10M vector linework with zoom-adaptive multi-scale cartographic vectors.

### 4.1 Technical Specifications

- [ ] **C.1 Multi-Scale Natural Earth Vector Tiers**:
  - Tier 0 (Global/Orbit): 1:110M generalized vectors (~1.2 MB).
  - Tier 1 (Regional): 1:10M vectors (current `geo-vectors.bin`, ~39 MB).
  - Tier 2 (Local / High Detail): 1:1M Overture Maps water boundaries and Natural Earth large-scale coastline tiles.

- [ ] **C.2 Leopold-Maddock Hydrological River Hierarchy (Rule 14)**:
  - Classify rivers by Strahler stream order (Order 1 headwater rill $\to$ Order 8 Amazon/Mississippi trunk).
  - Zoom gating:
    - Orbit ($camDist > 16$): Render only Orders 6–8.
    - Regional ($8 < camDist \le 16$): Render Orders 4–8.
    - Local ($camDist \le 8$): Render Orders 1–8.
  - Taper line widths dynamically via Leopold-Maddock power law:
    $$w(Q) = a \cdot Q^b, \quad b \approx 0.50$$

---

## §5: Option Track D — Archival Toponymy & Spot Elevation Inscriptions (SDF Typography)

Brings authentic library/museum cartographic annotations to the 3D manifold.

### 5.1 Technical Specifications

- [ ] **D.1 GPU Signed Distance Field (SDF) Text Rendering Engine**:
  - Single 1024×1024 monochrome SDF font atlas (IM Fell English or Caslon for archival 19th-century aesthetics; Consolas/DIN for blueprint).
  - Vertex shader evaluates `evaluateManifoldPosition` so labels curve seamlessly with Mode 0 unfurl.
  - Fragment shader evaluates sub-pixel anti-aliasing:
    $$\alpha_{\text{glyph}} = \text{smoothstep}(0.5 - \delta, 0.5 + \delta, \text{sdfSample}), \quad \delta = 0.707 \cdot \text{fwidth}(\text{sdfSample})$$

- [ ] **D.2 Hierarchical Zoom-Gated Toponymic Dataset**:
  - Orbital ($z < 4$): Major oceans, continents, equator/tropics.
  - Regional ($4 \le z < 8$): Mountain ranges, seas, sovereign states.
  - Local ($z \ge 8$): Mountain summits with spot heights (`▲ Matterhorn 4,478 m`, `▲ Mt. Fuji 3,776 m`), ocean trenches (`Mariana Trench -10,924 m`), capes, and straits.
  - Simple 2D screen-space bounding box spatial hash for collision avoidance (preventing label overlap).

---

## §6: Option Track E — Topocentric Inspection Kinematics (Camera Pivot)

Enables smooth, intuitive inspection of close-up terrain features without disorienting orbital swing.

### 6.1 Technical Specifications

- [ ] **E.1 Smooth Orbit Pivot Transition**:
  - When camera approaches the surface ($camDist < 8.0$), smoothly blend the camera orbit center from $(0, 0, 0)$ to the cursor ground intersection $\mathbf{p}_{\text{surface}}(\lambda_0, \phi_0)$:
    $$\mathbf{p}_{\text{target}}(t) = \operatorname{mix}\left(\mathbf{0}, \mathbf{p}_{\text{surface}}, \text{smoothstep}(12.0, 6.0, r_{\text{cam}})\right)$$
  - Pitch range: Permit 0° (nadir) to 85° (grazing horizon), allowing dramatic oblique views of mountain valleys.
  - Enforce `computeGroundClearanceFloor` to prevent camera penetration into displaced terrain.

---

## §7: Architectural Tradeoff Matrix

| Track | Visual Fidelity Impact | Asset Footprint | Network Dependency | Implementation Complexity | Primary Benefit |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Track A (Procedural Geomorphology & Imhof Shading)** | High (Archival / Swiss Topo) | **0 MB** | None (100% offline) | Moderate (Shader WGSL) | Immediate visual depth, rock strata, and dynamic contours everywhere on Earth. |
| **Track B (Global Multi-Res DEM Streaming)** | Extreme (Real Earth 10m–30m) | Streaming tiles | Network required | High (Tile cache + WebGPU array) | True real-world topography for every canyon, mountain, and island. |
| **Track C (Multi-Tier Vector LOD)** | High (Crisp linework) | ~15–30 MB or streaming | Optional | Moderate | Eliminates chunky 10–30 km straight-line chords; natural river branching. |
| **Track D (Archival Toponymy & Labels)** | Transformative (Museum aesthetic) | ~2–4 MB (SDF atlas + JSON) | None | Moderate | Solves the "blank map" problem at close zoom; provides authentic library feel. |
| **Track E (Topocentric Camera Pivot)** | High (Usability / Inspection) | **0 MB** | None | Low-Moderate | Makes inspecting any zoom detail fluid and controllable. |
