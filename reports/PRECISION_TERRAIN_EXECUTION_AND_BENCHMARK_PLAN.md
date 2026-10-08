# Master Execution Plan: High-Precision Terrain, Bathymetry & Automated Benchmark Engine

An operational roadmap to incrementally build, test, benchmark, and deploy the high-precision elevation, bathymetry, vector, and provenance systems in the `ais-interactive-globe-to-map` WebGPU engine.

---

## 1. System Architecture & Worktree Configuration

To ensure strict repository hygiene and prevent regression on `main`, all implementation work is isolated within a dedicated Git worktree with symlinked binary assets.

### Worktree Status (Completed)
- **Worktree Location**: `/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/.worktrees/precision-terrain`
- **Feature Branch**: `feat/unified-precision-terrain`
- **Asset Mounting**: 117 gitignored binary assets (`.bin`, `.dds`) symlinked from the canonical repository root via `scripts/mount-worktree-assets.ts`.

```
CANONICAL REPOSITORY (main)
/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
  ├── public/*.bin, *.dds  (ETOPO 256MB, Hydrology BC5, Vectors 38MB)
  └── reports/ (Architecture, Alternatives, and Blueprint Reports)
        │
        └── [.worktrees/precision-terrain] (Branch: feat/unified-precision-terrain)
              ├── Symlinked public/ binaries (Zero duplicate disk usage)
              ├── Isolated shader development (crust_hydrosphere.wgsl, manifold.wgsl)
              └── Isolated benchmarking & visual capture outputs
```

---

## 2. Phase 1: Automated Baseline Measurement & Visual Capture Suite

Before altering any shaders or data pipelines, an exhaustive, reproducible baseline must be captured across all visual mediums, projection modes, and global litmus locations.

### 1. Matrix of Visual Themes & Litmus Locations

```
+---------------------------------------------------------------------------------------------------------+
|                                    BASELINE CAPTURE BENCHMARK MATRIX                                    |
+---------------------------------------------------------------------------------------------------------+
| THREE ARCHIVAL THEMES                                                                                   |
| 1. Theme 0: Cream Rag Paper (Light Monochrome / Archival Parchment - Swiss Relief)                      |
| 2. Theme 1: Marie Tharp Physiographic (Dark Cyber / Abyssal Obsidian - Ocean Floor)                     |
| 3. Theme 2: Prussian Cyanotype (Ferroprussiate Blueprint & Drafting Linen)                              |
+---------------------------------------------------------------------------------------------------------+
| EIGHT GEOGRAPHIC LITMUS LOCATIONS                                                                       |
| 1. Mount Everest / Himalayas      (27.988°N,  86.925°E) -> Extreme Terrestrial Elevation (+8,848m)      |
| 2. Challenger Deep / Mariana      (11.373°N, 142.592°E) -> Deepest Ocean Bathymetry (-10,924m)          |
| 3. Grand Canyon National Park     (36.054°N, 112.140°W) -> Extreme Topographic Slope & Bare-Earth Chasm|
| 4. Hawaii / Mauna Kea             (19.821°N, 155.468°W) -> Oceanic Island Slope (+4,207m to -5,000m)    |
| 5. Cape Cod Spit & Shoals         (41.668°N,  70.296°W) -> Coastal Barrier Spit & Shallow Soundings     |
| 6. Amazon River Mouth             ( 0.000°N,  50.000°W) -> Major Hydrologic Flow & Estuarine Outflow    |
| 7. Lake Titicaca                  (15.925°S,  69.335°W) -> High-Altitude Perched Water Table (+3,812m)  |
| 8. Matterhorn / Swiss Alps        (45.976°N,   7.658°E) -> Eduard Imhof Classic Relief Shading          |
+---------------------------------------------------------------------------------------------------------+
| FOUR MANIFOLD PROJECTION MODES                                                                          |
| - Mode 0: Equirectangular 2:1 Developable Folio Wave (alpha = 0.0, 0.5, 1.0)                            |
| - Mode 1: Cylindrical / Web Mercator Unroll (alpha = 0.0, 0.5, 1.0)                                     |
| - Mode 2: Linear Elastic Fracture Mechanics (LEFM) Tear (alpha = 0.5)                                   |
| - Mode 3: Solenoidal Fluid Morph (alpha = 0.5)                                                          |
+---------------------------------------------------------------------------------------------------------+
```

### 2. Quantitative Telemetry Captured per Run
- **Cold Boot & Asset Ingestion Time**: Time to first frame (TTFF), texture allocation duration for BC4/BC5 pyramids and 16-bit binary buffers.
- **Memory Ledger**:
  - JavaScript Heap Used / Total (MB via `performance.memory`).
  - Allocated GPU Buffers & Textures (MB via `WebGPUEngine.activeTextureAllocationBytes`).
- **Framerate & Frame Time Stability**:
  - Mean FPS, 1% Low FPS, 0.1% Min FPS.
  - Frame time distribution: Mean (ms), 95th Percentile P95 (ms), Maximum frame spike (ms).
- **GPU Pipeline Invariants**:
  - Draw call count per frame.
  - Active CDLOD node count and maximum LOD reached.
  - Sub-pixel crack / seam violation counter (must strictly be zero).
- **Visual Artifacts**:
  - High-resolution lossless WebP screenshot ($1920 \times 1080$ @ 2x DPR).
  - Perceptual Image Difference (SSIM and RMSE against reference).

---

## 3. Step-by-Step Implementation Roadmap

```
  +-----------------------------------------------------------------------------------------------+
  | PHASE 1: Automated Baseline Capture Suite                                                     |
  | - Script: scripts/capture-precision-baseline.mjs                                              |
  | - Deliverable: reports/baseline-v1-measurements.json + 24 reference screenshots               |
  +-----------------------------------------------------------------------------------------------+
                                                  |
                                                  v
  +-----------------------------------------------------------------------------------------------+
  | PHASE 2: GEBCO 2024 Ingestion & EGM2008 Geoid Datum Reconciliation                            |
  | - Ingest GEBCO 2024 15" Grid (replace ETOPO 2022 bathymetry)                                  |
  | - Apply h = H + N geoid undulation model; eliminate 2m-15m coastal shoreline cliff             |
  | - Rebuild public/earth-etopo2022-dem-bc4.dds & u16.bin                                        |
  +-----------------------------------------------------------------------------------------------+
                                                  |
                                                  v
  +-----------------------------------------------------------------------------------------------+
  | PHASE 3: Relative-to-Eye (RTE) Camera Coordinates & Float-Float Precision                     |
  | - Eliminate 38cm Float32 planetary quantization barrier in crust_hydrosphere.wgsl             |
  | - Sub-millimeter geometric stability during ground-level zoom (< 50m altitude)                |
  +-----------------------------------------------------------------------------------------------+
                                                  |
                                                  v
  +-----------------------------------------------------------------------------------------------+
  | PHASE 4: Bare-Earth DTM Fusion (FABDEM 30m) & Coastal Topobathy (CUDEM 3m)                   |
  | - Strip forest canopies & buildings from terrestrial land using FABDEM v1.2                    |
  | - Multi-band Burt-Adelson spline blending for seamless coastal transitions                    |
  +-----------------------------------------------------------------------------------------------+
                                                  |
                                                  v
  +-----------------------------------------------------------------------------------------------+
  | PHASE 5: Real-Time Dynamic Data Provenance & Telemetry HUD                                    |
  | - Real-time GPU crosshair sampling: Source Dataset, Native Resolution, Elevation, Datum       |
  | - Museum-grade minimal HUD telemetry overlay                                                  |
  +-----------------------------------------------------------------------------------------------+
```

---

## 4. Phase-by-Phase Technical Specifications

### Phase 1: Automated Baseline Capture Script

Create `scripts/capture-precision-baseline.mjs` using Playwright:
1. Spawns headless Chrome with WebGPU flags:
   `--enable-unsafe-webgpu`, `--use-webgpu-adapter=default`, `--window-size=1920,1080`.
2. Connects to the local test server and accesses `window.__INDICATRIX_WEBGPU_ENGINE__`.
3. Iterates over the 3 themes and 8 anchor viewpoints:
   - Sets camera position, target, altitude, pitch, and yaw.
   - Warms up for 30 frames to allow asynchronous texture uploads to settle.
   - Samples 120 consecutive frames, recording precise hardware timing via `performance.now()`.
   - Captures lossless screenshot to `screenshots/baseline/`.
4. Saves structured telemetry to `reports/baseline-v1-measurements.json`.

---

### Phase 2: GEBCO 2024 Ingestion & EGM2008 Datum Reconciliation

#### Objectives
- Replace the 2022 static bathymetry with GEBCO 2024 to incorporate recent multibeam acoustic sounding swaths.
- Apply vertical geoid correction ($h = H + N$) so ocean water level perfectly aligns with terrestrial coastlines at $0.000\text{ m}$.

#### Implementation Details
1. Create `pipelines/ingest_gebco_egm2008.py`:
   - Streams or reads the GEBCO 2024 15-arc-second NetCDF/GeoTIFF grid.
   - Computes EGM2008 geoid separation $N(\lambda, \phi)$ on a corresponding grid.
   - Adjusts ocean depths: $z_{\text{corrected}} = z_{\text{gebco}} + N(\lambda, \phi)$.
   - Clamps intertidal shoreline transitions smoothly using an anti-aliased water mask.
2. Transcode to:
   - `public/earth-gebco2024-dem-bc4.dds` (BC4-R-UNORM, 21.3 MB).
   - `public/earth-gebco2024-dem-u16.bin` (RGBA16-UNORM, 256 MB).
3. Update `src/webgpu/WebGPUCanvas.tsx` to load the GEBCO 2024 assets.

---

### Phase 3: Relative-to-Eye (RTE) Camera Coordinates

#### Objectives
- Overcome the 32-bit float limitation ($6,371,000 \cdot 2^{-24} \approx 0.38\text{ m}$) that causes vertex jitter at ground-level zoom.

#### Implementation Details
1. In `src/webgpu/WebGPUEngine.ts`:
   - Decompose 64-bit camera position into high and low 32-bit float vectors:
     $$\vec{C}_{\text{high}} = \text{Float32Array}(\vec{C}_{\text{64}}), \quad \vec{C}_{\text{low}} = \text{Float32Array}(\vec{C}_{\text{64}} - \vec{C}_{\text{high}})$$
   - Pass `u_cameraPosHigh` and `u_cameraPosLow` in `SimUniforms`.
2. In `src/webgpu/shaders/crust_hydrosphere.wgsl`:
   - Compute camera-relative vertex position before multiplying by the view-projection matrix:
     ```wgsl
     let posRelative = (posWorld - sim.u_cameraPosHigh.xyz) - sim.u_cameraPosLow.xyz;
     output.position = sim.u_viewProjectionMatrix * vec4<f32>(posRelative, 1.0);
     ```
   - Precision near the camera improves from $38\text{ cm}$ to $< 0.06\text{ mm}$, yielding rock-solid stability during close-up inspection.

---

### Phase 4: Bare-Earth FABDEM Fusion & Coastal Topobathy

#### Objectives
- Strip tree canopies and building rooftops from terrestrial elevation to ensure rivers and coastlines do not sit in artificial trenches.
- Seamlessly blend 3-meter NOAA CUDEM coastal models into the global base using multi-band Burt-Adelson splines.

#### Implementation Details
1. Create `pipelines/fuse_bare_earth_cudem.py`:
   - Combines FABDEM 30m bare-earth elevation with GEBCO 2024 ocean bathymetry.
   - Insets NOAA CUDEM 1/9" (3m) coastal LiDAR in litmus zones (Cape Cod, Hawaii).
   - Evaluates Burt-Adelson multi-band Laplacian pyramids to eliminate boundary ghosting.
2. Encode resulting textures into GPU block-compressed pyramids.

---

### Phase 5: Real-Time Dynamic Data Provenance & Telemetry HUD

#### Objectives
- Give the user complete transparency regarding what dataset, resolution, and geodetic datum they are observing at their current viewpoint, altitude, and cursor position.

#### Implementation Details
1. In `src/components/hud/`:
   - Create `DataProvenanceOverlay.tsx`: Displays active dataset provenance card:
     - **Dataset Title**: e.g., *"NOAA CUDEM Topobathy"* or *"GEBCO 2024 / FABDEM Bare-Earth"*.
     - **Nominal Resolution**: e.g., *"3.0 meters (Airborne LiDAR)"* vs. *"450 meters (15 arc-sec)"*.
     - **Vertical Datum**: e.g., *"WGS84 Ellipsoidal / EGM2008 Geoid Ref"*.
     - **Real-Time Coordinates**: Latitude, Longitude, Altitude, Terrain Elevation, and Water Depth under crosshair.
   - Connects to `DevToolsAPI.ts` and `WebGPUEngine.ts` GPU readback buffers.

---

## 5. Verification Gates & Commit Protocol

Every stage follows a strict regression and quality gate:

| Stage Gate | Pass Criteria | Validation Script |
| :--- | :--- | :--- |
| **Gate 0: Baseline** | 24 screenshots captured; memory & frame timings recorded in JSON | `node scripts/capture-precision-baseline.mjs` |
| **Gate 1: GEBCO 2024** | Shoreline cliff error $< 0.1\text{m}$; Mariana Depth verified at $-10,924\text{m} \pm 10\text{m}$ | `node scripts/verify-data-assets.mjs` |
| **Gate 2: RTE Precision** | Vertex jitter $= 0.0\text{px}$ at altitude $= 25\text{m}$ across 120 frames | `node scripts/verify_interactive_invariants.ts` |
| **Gate 3: Bare-Earth** | Canopy ditch artifacts eliminated around Amazon & Congo estuaries | `node scripts/verify-bathymetry-tide-clarity.mjs` |
| **Gate 4: Provenance HUD**| Telemetry updates synchronously with camera orbit; zero dropped frames | `node scripts/verify-browser.mjs` |

### Git Hygiene & Lifecycle
1. Execute within worktree `.worktrees/precision-terrain`.
2. Commit message format: `feat(terrain): [Phase X] <Descriptive Title>`.
3. Verify test pass: `npm run test` and benchmark verification.
4. Merge back to `main`: `git checkout main && git merge feat/unified-precision-terrain`.
5. Prune worktree after completion: `git worktree remove .worktrees/precision-terrain`.

---

## 6. Antigravity Agent Execution Prompts

The following prompt templates are structured for immediate handoff to the Antigravity agent:

### Prompt 1: Phase 1 — Baseline Suite Execution
```text
Execute Phase 1 of the Precision Terrain Plan in the existing worktree at .worktrees/precision-terrain:
1. Ensure the development server is running on port 3001: `npm run dev -- --port 3001`
2. Create and run `scripts/capture-precision-baseline.mjs` using Playwright:
   - Iterate over Theme 0 (Cream Rag), Theme 1 (Marie Tharp), Theme 2 (Prussian Cyanotype).
   - Sample all 8 litmus locations: Everest, Mariana, Grand Canyon, Hawaii, Cape Cod, Amazon, Titicaca, Matterhorn.
   - Record cold start, heap memory, VRAM allocation, mean/P95 frame times, and 1% low FPS.
   - Save screenshots to screenshots/baseline/ and JSON telemetry to reports/baseline-v1-measurements.json.
3. Verify that zero WebGPU validation errors or shader compilation warnings occurred.
4. Commit the baseline report and scripts to branch feat/unified-precision-terrain.
```

### Prompt 2: Phase 2 — GEBCO 2024 & Geoid Ingestion
```text
Execute Phase 2 of the Precision Terrain Plan in the existing worktree at .worktrees/precision-terrain:
1. Ingest GEBCO 2024 15" bathymetry and reconcile with the EGM2008 geoid undulation model using pipelines/ingest_gebco_egm2008.py.
2. Transcode the unified topobathy into public/earth-gebco2024-dem-bc4.dds (BC4) and public/earth-gebco2024-dem-u16.bin.
3. Update WebGPUCanvas.tsx and WebGPUEngine.ts to load the new GEBCO 2024 DEM textures.
4. Run scripts/capture-precision-baseline.mjs to generate reports/stage1-gebco-delta.json and compare SSIM against baseline.
5. Verify that shoreline datum steps are eliminated (< 0.1m difference at coast).
6. Commit changes with: git commit -m "feat(terrain): ingest GEBCO 2024 topobathy with EGM2008 datum reconciliation"
```

### Prompt 3: Phase 3 — Relative-to-Eye (RTE) Camera Coordinates
```text
Execute Phase 3 of the Precision Terrain Plan in the existing worktree at .worktrees/precision-terrain:
1. In WebGPUEngine.ts, decompose camera position into high and low float32 components (u_cameraPosHigh, u_cameraPosLow).
2. Update SimUniforms buffer binding layout and write operations.
3. In crust_hydrosphere.wgsl, refactor vertex projection to subtract camera position before view-projection multiplication:
   let posRelative = (posWorld - sim.u_cameraPosHigh.xyz) - sim.u_cameraPosLow.xyz;
   output.position = sim.u_viewProjectionMatrix * vec4<f32>(posRelative, 1.0);
4. Run camera orbit stress test at 25m altitude over Grand Canyon and Mount Everest to verify zero vertex swimming.
5. Commit changes with: git commit -m "feat(shaders): implement Relative-to-Eye camera coordinates for sub-millimeter precision"
```
