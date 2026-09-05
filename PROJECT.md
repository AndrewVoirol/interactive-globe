# Project: 1,000,000-Node Continuous Volumetric Matrix Engine (WebGL2 & WebGPU)

## Architecture
The Continuous Volumetric Matrix is a scientific-grade 1,000,000-node globe-to-map unfurling engine operating across dual rendering backends: WebGL2 (Three.js / GLSL) and dedicated WebGPU (WGSL compute/render).

```
                                [ Data Pipeline ]
                      scripts/precompute.js (Node / Canvas 2D)
                                        │
                                        ▼
                           public/geo-mesh-1m.bin
                           (32-byte 0x47454F4D Header,
                            Columnar Float32/Uint32)
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
        [ WebGL2 Engine (App.tsx) ]            [ WebGPU Engine (WebGPUEngine.ts) ]
    ├── Camera-Relative RTC Coord Space    ├── @compute @workgroup_size(256)
    ├── Vertex Shader Backface Early-Out   ├── Zero-Copy Compute-to-Vertex Storage Buffers
    ├── 5 Physical Morph Paradigms         ├── Lamb-Oseen Rotational Fluid Wake
    ├── Adaptive Wireframe Layering (R1)   ├── Griffith Hoop Stress Concentration
    └── Passive Raycast Cursor Perturb.    └── 120 FPS Sustained at 1,000,000 Nodes
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        ▼
                            [ Modern HUD & Telemetry ]
                   ├── Dual Backend Toggle: [WebGL2] | [WebGPU]
                   ├── Layer Selector: [Both] | [Points Only] | [Wireframe Only]
                   ├── 5 Paradigms: Linear, Scroll, Griffith, Fluid, Dymaxion
                   └── Real-Time 60/120 FPS, Memory & VRAM Profiling
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Three.js Clock Migration | Replace deprecated `THREE.Clock` with monotonic `performance.now()` in `App.tsx` | M1 | Survey E1 |
| F2 | Vite Chunk Splitting | Configure `build.rollupOptions.output.manualChunks` in `vite.config.ts` to eliminate >500kB bundle warnings | M1 | Survey E1 |
| F3 | Parameterized Precomputation CLI | Unify `precompute.js`, `precompute-100k.js`, `precompute-1m.js` into `scripts/precompute.js` supporting `--density 100k\|1m\|N` | M1 | Survey E1 |
| F4 | Interactive HUD Layer Selector | Add `[Both]` \| `[Points Only]` \| `[Wireframe Only]` selector with dynamic opacity transitions and 102:1 coastline contrast | M2 | Survey E2 |
| F5 | Moiré Mitigation & Point Attenuation | Scale wireframe opacity $\propto \sqrt{100k/N}$ and adapt point sizes ($1.8\text{px}$ land, $1.0\text{px}$ sea) to avoid rasterizer clutter | M2 | Survey E2 |
| F6 | WebGL2 Backface Early-Out Culling | Vertex shader check $\mathbf{n}_v \cdot \mathbf{v}_{eye} < -0.25$ assigns degenerate clip coords `vec4(0.0, 0.0, 2.0, 0.0)` for $\alpha < 0.08$ | M3 | Survey E2 |
| F7 | 1M Mode 3 Fluid Optimization | Eliminate 162M transcendental calls/sec on back-hemisphere vertices, sustaining $\ge 60$ FPS at 1M nodes | M3 | Survey E2 |
| F8 | Fuller Dymaxion 20-Facet Projection | Project Fibonacci sphere onto regular icosahedron ($\phi \approx 1.618034$, $\min \mathbf{p} \cdot \mathbf{C}_k \ge 0.934 > 0$) with 0 NaN vertices | M4 | Survey E2 |
| F9 | Fuller Planar Net Unfolding | Unfold 20 spherical facets isometrically along edge hinges into Buckminster Fuller's planar net in `App.tsx` | M4 | Survey E2 |
| F10 | Non-Blocking Cursor Screen Raycasting | Unproject screen-space cursor onto 3D manifold with zero OrbitControls drag fighting | M5 | Survey E3 |
| F11 | Fluid Lamb-Oseen Vortex Wake | Inject trailing rotational vortex circulation and bioluminescent cyan vorticity glow on cursor hover | M5 | Survey E3 |
| F12 | Griffith Tensile Hoop Stress Probe | Concentrate tensile hoop stress along antimeridian crack nucleation fronts on cursor proximity | M5 | Survey E3 |
| F13 | Dedicated WebGPU Compute Pipeline | Construct `src/webgpu/WebGPUEngine.ts` with `@compute @workgroup_size(256)` WGSL compute shader | M6 | Survey E3 |
| F14 | WebGPU Zero-Copy Render Pipeline | Bind output particle storage buffer directly as vertex buffer in `points_render.wgsl` and `lines_render.wgsl` | M6 | Survey E3 |
| F15 | WebGPU/WebGL2 Runtime HUD Switch | Detect `navigator.gpu` and provide smooth runtime toggle between WebGL2 and WebGPU rendering backends | M6 | Survey E3 |
| F16 | 120 FPS WebGPU Execution at 1M Scale | Execute 1M particle advection and morphing at sustained 120 FPS with $< 15.4\text{ GB/s}$ bandwidth | M6 | Survey E3 |
| F17 | Dual-Track Acceptance Verification | Validate 100% E2E test pass across all 4 tiers and Tier 5 adversarial stress testing | M7 | Dual Track |
| F18 | ETOPO 2022 16-Bit Signed DEM Texture Unpacking | Ingest NOAA NCEI ETOPO 2022 texture; decode continuous signed elevation (-10,924m to +8,848m) without 8-bit banding | P2-M1 | Frontier 4 |
| F19 | Eduard Imhof Swiss Relief Shading Pass | Branchless SIMD32 terrain shading pass with 5-tap Laplacian curvature, NW 315° + SW 225° dual lighting, and >35° cliff darkening | P2-M1 | Frontier 4 |
| F20 | Jerlov Hydrosphere Radiative Transfer & Dual-Surface Morphing | Spectral downwelling attenuation $K_d(\lambda)$ across Types I–III, Kubelka-Munk shallow bathymetry, and zero z-fighting dual surface | P2-M1 | Frontier 3 |
| F21 | Screen-Space Anti-Aliased Vector Line Ribbon Pipeline | Instanced screen-space quad extrusion with 4D homogeneous near-plane guard ($w_c \le 0$) and subpixel feathering across 1×–3× Retina | P2-M1 | Frontier 1 |
| F22 | Spherical Contour Ingestion & Simon l'Huilier Topological Severance | Stream binary contour meshes (`geo-contour-mesh.bin`), compute spherical excess area on $S^2$, and sever polylines across antimeridian and 14 Dymaxion boundaries | P2-M2 | Frontier 2 |
| F23 | Apple Silicon SIMD32 Workgroup 256 Zero-Copy 16M Dispatch | Configure 1D dispatch grid `ceil(N/256)` (62,500 <= 65,535 for 16M) with zero-copy `STORAGE | VERTEX` buffer aliasing (Arithmetic benchmark — no 16M dataset exists) | P2-M3 | Frontier 5 |
| F24 | Asynchronous Triple-Buffered 16-Query GPUProfiler | Sub-microsecond GPU kernel pass profiling via 16-query ring buffer with non-blocking async mapping and graceful fallback | P2-M3 | Frontier 5 |

## Scaffolding & Scaling Status (DESIGN_ETHOS.md §11 Compliance)

### 1. Active Production Pipelines
- **WebGPU Compute**: `src/webgpu/shaders/physics_sim.wgsl` (`@compute @workgroup_size(256)`)
- **Dual-Surface Crust & Hydrosphere**: `src/webgpu/shaders/crust_hydrosphere.wgsl` (consolidated Imhof Swiss relief + Jerlov spectral optics)
- **Vector Ribbons**: `src/webgpu/shaders/vector_ribbon.wgsl` (instanced screen-space quads with 4D near-plane guard)
- **Wireframe & Contours**: Zero-copy compute-to-vertex buffer rendering (`lines_render.wgsl`, `renderContours`)
- **Point Lattice**: `points_render.wgsl` with sub-pixel attenuation and OKLCH color spaces

### 2. Wired Scaffolding Components
- **DataLayerOverlay Dynamic Routing**: `src/core/layers/DataLayerOverlay.tsx` routes by category:
  - `'topo' | 'ocean' | 'thermal' | 'night' | 'satellite'` → `RasterLayerRenderer`
  - `'vectors'` → `VectorBoundaryRenderer`
  - `'point'` → `VectorContourRenderer`
  - `'field'` → `VectorFieldRenderer`
- **WhimsicalEffectsManager Lifecycle**: `src/core/WhimsicalEffectsManager.ts` instantiated in `WebGPUCanvas.tsx`, modulates `pointScaleMultiplier` to trigger Fibonacci Moiré ring scaling when view vector aligns with polar axis (< 0.5°).
- **ManifoldPinchController DOM Bindings**: `src/core/ManifoldPinchController.ts` bound to canvas pointer events, executing damped harmonic oscillator ($k=45, \gamma=6.5, \omega_d=28$) and passing `u_cursorActive` and `u_cursorHitPos` perturbations into WebGPU uniforms.

### 3. Inert Architectural Scaffolding (Preserved for Future Extensions)
- **Authoritative Framework Stubs**: `src/core/standards/`, `src/core/physics/`, `src/core/camera/` (~5,000 LOC authored reference architectures preserved per §11; not deleted).
- **Audio Synthesizer**: `src/core/audio/ProceduralAudioEngine.ts` (authored and unit-tested; visual output takes precedence per §2 Principle 14).

### 4. 16M Node Scaling Reality & Ground Truth
- **Arithmetic Benchmark Only**: Theoretical workgroup dispatch calculation $\lceil N / 256 \rceil = 62,500 \le 65,535$ mathematically proves M4 Pro GPU dispatch limits and memory budgets ($\le 1.54\text{ GB VRAM}$) for 16,000,000 nodes without CPU readback.
- **No 16M Dataset Exists**: The maximum precomputed physical binary dataset generated and distributed in the repository is `public/geo-mesh-1m.bin` (1,000,000 nodes, 47.96 MB). There is no 16M physical dataset (`geo-mesh-16m.bin`). All multi-million node benchmarks are synthetic arithmetic stress tests.


## Code Layout
```
ais-interactive-globe-to-map/
├── index.html                      # Root HTML mount
├── vite.config.ts                  # Vite build config with manual chunk splitting
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript configuration
├── scripts/
│   └── precompute.js               # Unified parameterized precomputation CLI tool
├── src/
│   ├── App.tsx                     # Main React application, WebGL2 pipeline, HUD, interaction handlers
│   ├── types.ts                    # Type definitions for geometry, telemetry, layers, modes
│   ├── webgpu/
│   │   ├── WebGPUEngine.ts         # Autonomous WebGPU compute & render engine class
│   │   ├── WebGPUCanvas.tsx        # React wrapper component for WebGPU canvas
│   │   ├── WebGPUBenchmark.ts      # Scaling metrics, UMA VRAM calculation & bandwidth benchmarks
│   │   ├── support.ts              # Lightweight WebGPU feature detection
│   │   ├── profiling/
│   │   │   └── GPUProfiler.ts      # 16-query triple-buffered async GPU timestamp profiler
│   │   └── shaders/
│   │       ├── physics_sim.wgsl    # WebGPU compute shader (@compute @workgroup_size(256))
│   │       ├── points_render.wgsl  # WebGPU point rasterization shader
│   │       ├── lines_render.wgsl   # WebGPU line segment rasterization shader
│   │       ├── dem_unpack.wgsl     # ETOPO 2022 16-bit signed elevation unpacking shader
│   │       ├── swiss_relief_shading.wgsl # Eduard Imhof Swiss relief shading pass
│   │       ├── hydrosphere_optics.wgsl # Jerlov radiative transfer & shallow bathymetry
│   │       └── vector_ribbon.wgsl  # Screen-space anti-aliased vector ribbon quad extrusion
│   └── utils/
│       ├── contour-topology.ts     # Simon l'Huilier spherical excess & topological severance
│       ├── dymaxion.ts             # 20-facet icosahedron and Fuller net mathematical projection utilities
│       └── raycast.ts              # Analytical screen-space raycasting & unprojection math
├── public/
│   ├── geo-mesh-100k.bin           # 100k node binary columnar dataset (4.57 MB)
│   ├── geo-mesh-1m.bin             # 1M node binary columnar dataset (45.74 MB)
│   └── geo-contour-mesh.bin        # Precomputed isoline contour mesh (2.48 MB)
└── tests/
    ├── tier1/                      # Tier 1 Feature coverage tests (F1-F16) & milestone adversarial suites
    ├── tier2/                      # Tier 2 Boundary value analysis & corner case suites
    ├── tier3/                      # Tier 3 Pairwise combinatorial interaction suites
    ├── tier4/                      # Tier 4 Real-world application scenarios
    ├── tier5/                      # Tier 5 Adversarial hardening & stress testing
    └── phase2/                     # Phase 2 behavioral suites (Milestones 1-3, shaders, contours, scaling)
```

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| Phase 1 - M1 | Code Housekeeping & Build Hygiene (R6) | Migrate `THREE.Clock` -> `performance.now()`, configure Vite chunk splitting, create `scripts/precompute.js` | none | DONE |
| Phase 1 - M2 | Visual Restraint & Adaptive Lattice (R1) | Implement HUD layer toggle `[Both] \| [Points Only] \| [Wireframe Only]`, 102:1 contrast ratio, wireframe attenuation | M1 | DONE |
| Phase 1 - M3 | WebGL2 1M Optimization & Backface Early-Out (R2) | GLSL vertex shader backface early-out ($\mathbf{n}_v \cdot \mathbf{v}_{eye} < -0.25$), Mode 3 Fluid 60 FPS optimization | M1, M2 | DONE |
| Phase 1 - M4 | Fuller Dymaxion Polyhedral Unfolding (R3) | Implement 5th paradigm `[Dymaxion]` with 20 icosahedral facets unfolding continuously into Fuller net ($0\text{ NaN}$) | M1, M2, M3 | DONE |
| Phase 1 - M5 | Passive Raycast Cursor Perturbation (R4) | Screen-space cursor raycast unprojection, Lamb-Oseen fluid vortex wake, Griffith hoop stress probe | M1, M3 | DONE |
| Phase 1 - M6 | Dedicated WebGPU WGSL Compute Pipeline (R5) | `WebGPUEngine.ts`, WGSL compute `@workgroup_size(256)`, zero-copy render, HUD `[WebGL2] \| [WebGPU]` toggle | M1, M3, M4, M5 | DONE |
| Phase 1 - M7 | Dual-Track E2E & Hardening (Phase 1 & 2) | Run full E2E test suite (Tiers 1-4), adversarial Tier 5 tests, verify all acceptance criteria | M1-M6 | DONE |
| Phase 2 - M1 | WebGPU Shader & Ingestion Pipelines | ETOPO 2022 DEM unpacking, Eduard Imhof Swiss relief shading, Jerlov oceanic optics, and screen-space vector ribbons | Phase 1 M7 | DONE |
| Phase 2 - M2 | Contour & Vector Topology | Isoline contour binary mesh streaming, Simon l'Huilier spherical excess on $S^2$, and 14-cut topological severance | Phase 2 M1 | DONE |
| Phase 2 - M3 | Apple Silicon M4 Pro 16M Node Scaling & Publication | SIMD32 workgroup 256 zero-copy dispatch, triple-buffered GPUProfiler, 16M node UMA budgets, and validation-report-v3.md | Phase 2 M2 | DONE |

## Interface Contracts

### Binary Buffer Contract (`GEOM` v1)
- Magic: `0x47454F4D` (uint32)
- Version: `1` (uint32)
- Header Size: 32 bytes
- Column Offsets:
  - `pointsOffset`: $3N \times 4$ bytes (Float32Array $x, y, z$)
  - `target2DOffset`: $2N \times 4$ bytes (Float32Array $u, v$)
  - `typeOffset`: $N \times 4$ bytes (Float32Array $1.0 = \text{Land}, 0.0 = \text{Ocean}$)
  - `indicesOffset`: $2M \times 4$ bytes (Uint32Array line vertex pairs)

### Shader Uniform Contract (`App.tsx` WebGL2 & `physics_sim.wgsl` WebGPU)
- `u_unfurl`: `float` $\in [0.0, 1.0]$
- `u_mode`: `int / u32` ($0=\text{Linear}, 1=\text{Scroll}, 2=\text{Griffith}, 3=\text{Fluid}, 4=\text{Dymaxion}$)
- `u_layerMode`: `int / u32` ($0=\text{Both}, 1=\text{Points Only}, 2=\text{Wireframe Only}$)
- `u_time`: `float / f32` (monotonic continuous elapsed time from `performance.now()`)
- `u_cursorRayOrig`: `vec3 / vec4` (Camera ray origin in world space)
- `u_cursorRayDir`: `vec3 / vec4` (Normalized camera ray direction in world space)
- `u_cursorHitPos`: `vec3 / vec4` (Unprojected hit coordinate on manifold)
- `u_cursorVel`: `vec4` ($xyz$: direction $\times$ speed, $w$: scalar velocity magnitude)
- `u_cursorActive`: `float` ($1.0 = \text{active hover}, 0.0 = \text{idle/decayed}$)
