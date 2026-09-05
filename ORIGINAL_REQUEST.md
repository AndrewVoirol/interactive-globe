# Original User Request

## 2026-09-02T17:55:03Z

<USER_REQUEST>
A multi-agent swarm (Code Auditor, Mathematician, and Physicist) to conduct a clinical, rigorous architectural, mathematical, and physics-based audit of the 100,000-node WebGL Continuous Volumetric Matrix morphing engine in `ais-interactive-globe-to-map`, producing a unified `engine-audit.md` report.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Requirements

### R1. Code Architecture & Optimization Audit (App.tsx & precompute-100k.js)
Conduct a deep architectural review of `App.tsx` and `precompute-100k.js`.
- Trace the memory lifecycle and identify specific memory leaks, unoptimized Three.js buffer handling, garbage collection pressure (e.g., JSON payload parsing, Float32Array re-allocation, `Set` operations in edge extraction), and React state anti-patterns.
- Benchmark our buffer strategy against enterprise geospatial/volumetric engines (e.g., Deck.gl).
- Document the exact architectural, memory (VRAM/RAM), and draw-call delta required to scale the matrix from 100,000 nodes to 1,000,000 nodes at sustained 60fps.

### R2. Mathematical Rigor & Projection Limits (Shaders & Precomputation)
Analyze the mathematical formulations in `toSphere`, `toMercator`, and the GLSL vertex shader:
- Audit `toSphere` and `toMercator` for boundary conditions, pole singularities ($lat = \pm 85^\circ$), and numerical stability.
- Critique the linear vertex interpolation `mix(pos3D, pos2D, ease)` against spherical geometry constraints (chord-line trajectory vs. great-circle / geodesic / slerp pathing, volume collapse during transition).
- Evaluate normal transformation accuracy (`normalMatrix * normal`) and viewDir/facing math during non-isometric morphing.
- Formulate GPU-level math optimizations (e.g., analytical Mercator expansion on the GPU, matrix precomputation, FP32 precision limits).

### R3. Lateral Simulation Paradigms (Non-Geospatial Physics)
Abstract the 100,000-node matrix into an unconstrained geometric manifold and propose 2 radical, non-geospatial physical simulation paradigms for the transition:
- Paradigm A: Elastic/Viscoelastic or Cloth/Verlet tearing simulation (e.g., mass-spring lattice, fracture dynamics).
- Paradigm B: Fluid advection / particle-field dynamics or magnetic/electrostatic field repulsion.
- For both paradigms, provide the complete GPU execution architecture (e.g., ping-pong FBOs / GPGPU render targets, Transform Feedback in WebGL2, or WebGPU compute shader pipeline) demonstrating zero CPU blocking and deterministic memory budgets.

### R4. Delivery & Cleanliness Constraints
- All findings must be compiled into a single comprehensive technical document: `engine-audit.md` at the project root.
- Strict Read-Only constraint on source files: Do NOT modify `App.tsx`, `precompute-100k.js`, or any public JSON data payloads (`public/geo-mesh-100k.json`, etc.).
- Maintain a clinical, rigorous engineering tone: no subjective hyperbole or marketing fluff; strictly observable math, memory layouts, and WebGL/GPU constraints.

## Acceptance Criteria

### Audit Deliverable & Integrity
- [ ] `engine-audit.md` exists at `/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/engine-audit.md`.
- [ ] `git status --porcelain` verifies no existing codebase files (`App.tsx`, `precompute-100k.js`, `public/*.json`, `package.json`) were altered.

### Architectural & Scaling Analysis
- [ ] Explicitly identifies memory allocations and GC bottlenecks in `App.tsx` (e.g., data loading, `new THREE.BufferGeometry()` in useMemo, uniform updates in `useFrame`) and `precompute-100k.js` (e.g., worker thread communication, Set-based edge deduplication).
- [ ] Contains a concrete comparison matrix between current Float32Array / BufferGeometry strategy and Deck.gl (instancing, interleaved vertex attributes, binary columnar format, double-precision emulation / 64-bit float emulation).
- [ ] Specifies the exact memory footprint calculation (bytes per vertex/attribute) and rendering budget required for 1,000,000 nodes at 60fps (bandwidth, primitive count, cull/LOD strategies).

### Mathematical & Shader Rigor
- [ ] Evaluates pole singularities and trigonometric distortion in `toSphere` and `toMercator` ($lat \in [-85, 85]$ clamping, logarithmic divergence).
- [ ] Formally analyzes why `mix(pos3D, pos2D, ease)` produces interior sphere penetration (chord contraction) during morphing and provides the exact mathematical formulation for constant-radius or geodesic projection.
- [ ] Identifies normal/facing vector distortion during morphing where `pos3D` is normalized but interpolated non-linearly.

### Physics Simulation Architecture
- [ ] Details 2 distinct non-geospatial physics paradigms with governing differential equations / discrete update steps.
- [ ] Provides concrete WebGL shader architecture diagrams or pseudo-code showing GPU texture state / ping-pong FBOs / Transform Feedback data flow without CPU readback (`readPixels`).


## 2026-09-02T21:23:50Z

<USER_REQUEST>
Architect, optimize, and expand the Continuous Volumetric Matrix into a scientific-grade 1,000,000-node globe-to-map unfurling engine that balances visual restraint, GIS coastline fidelity, and smooth continuous flow states across five physical and geometric paradigms in WebGL2 and WebGPU. Lever any colosseum, adversarial review, OWL, or research subagent methods as orchestration sees fit.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Requirements

### R1. Visual Restraint & Adaptive Lattice Layering
Provide an interactive HUD display layer selector (`[Both]` | `[Points Only]` | `[Wireframe Only]`) with dynamic opacity transitions. At 1M density, points must resolve coastlines and islands at GIS-grade clarity without wireframe moiré interference, while allowing the Delaunay lattice wireframe to be toggled on demand.

### R2. WebGL2 1M Performance Optimization & Backface Early-Out
Eliminate redundant trigonometric evaluations on back-hemisphere vertices and dissolved lines in Mode 3 (Fluid Flow). When on the 3D sphere, the vertex shader must early-out vertices with $\mathbf{n}_{\text{view}} \cdot \mathbf{v}_{\text{dir}} < -0.25$ to degenerate clip coordinates before evaluating curl noise, sustaining $\ge 60$ FPS at 1M nodes.

### R3. Fuller Dymaxion Polyhedral Unfolding (Scientific GIS Paradigm)
Implement a 5th simulation paradigm (`[Dymaxion]`) in `App.tsx` that projects the Fibonacci sphere onto a 20-facet regular icosahedron. When scrubbed via the unfurl slider ($\alpha \in [0, 1]$), the 20 spherical triangles must rotate open isometrically along edge hinges into Buckminster Fuller's planar net, demonstrating zero polar singularities and true-area continental conservation.

### R4. Passive Raycast Cursor Perturbation (Tactile Interaction)
Track mouse cursor hover in screen space, unprojecting onto the 3D manifold without interrupting 3D OrbitControls camera drag. In Fluid Mode, cursor hover injects a trailing rotational velocity wake; in Griffith Mode, cursor proximity concentrates tensile hoop stress along crack nucleation fronts.

### R5. Dedicated WebGPU WGSL Compute Pipeline
Construct an autonomous WebGPU compute and render module (`src/webgpu/WebGPUEngine.ts`) utilizing compute storage buffers (`@compute @workgroup_size(256)`). When `navigator.gpu` is detected, allow switching between `[WebGL2]` and `[WebGPU]` in the HUD, executing particle advection directly on GPU compute cores at 120 FPS.

### R6. Code Housekeeping & Build Hygiene
Replace deprecated Three.js APIs (`THREE.Clock` $\to$ `performance.now()`), configure Vite chunk splitting to eliminate vendor bundle size warnings, and unify precomputation into a clean parameterized CLI tool (`scripts/precompute.js`).

## Acceptance Criteria

### Performance & Rendering Budgets
- [ ] 1,000,000-node Fluid Mode in WebGL2 maintains $\ge 60$ FPS on Apple Silicon / dedicated GPU during active morphing.
- [ ] Adaptive Lattice toggle allows switching between `[Both]`, `[Points Only]`, and `[Wireframe Only]` with zero visual glitching.
- [ ] Fuller Dymaxion mode unfolds 20 icosahedral facets continuously from $S^2$ to $\mathbb{R}^2$ with 0 NaN vertices.
- [ ] Cursor hover generates responsive fluid vortex trails without blocking orbit/pan/zoom camera interactions.
- [ ] WebGPU pipeline initializes cleanly on supported browsers and sustains 120 FPS on 1M nodes.
- [ ] `npm run build` passes with zero TypeScript errors and no chunk size warnings.

</USER_REQUEST>

## 2026-09-03T13:07:37Z

<USER_REQUEST>
# Indicatrix Engine: Final Validation & QA Directive

Perform a comprehensive, publication-grade final validation and QA sweep of the Indicatrix Engine (`/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map`). Execute exhaustive live browser verification, performance profiling, visual pixel audits, cross-feature matrix testing, and regression analysis against prior audit artifacts to produce a definitive `validation-report.md`.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: demo

## Prior Artifacts
- `audit-report.md` — 7 correctness bugs, 4 performance bugs, 4 architectural debts, enterprise scorecard
- `architecture-evolution.md` — IRenderParadigm, IDataSource<T>, IGlobeLayer, camera system specs
- `research-bibliography.md` — Literature validation, physics grounding ratings, corrections needed
- `design-language.md` — Color palettes (OKLCH specs), typography, animation curves, audio synthesizers, whimsy moments, interaction state machine

## Requirements

### R1. Live Browser UI/UX & Interaction Matrix Sweeps
Execute live testing across all interactive UI controls in `NavigationDock` and `TelemetryHUD`, all 8 keyboard shortcuts, and all 30 Mode × Layer × Backend and 20 Overlay × Mode combinations. Record exact behaviors, theme shifts (Dark Cyber vs Light Monochrome), and visual stability.

### R2. Visual Pixel & Design Language Audit
Verify color accuracy against `design-language.md` §1.2 using DevTools sampling. Check contrast ratios (102:1 Dark Theme, >7:1 Light Theme), wireframe density attenuation at 1M nodes (sqrt(0.1) factor), WebGL2 point size differential, and document any WebGPU vs WebGL2 visual parity gaps.

### R3. Performance & Memory Profiling
Profile frame rates across 6 configurations (100K/1M nodes, WebGL2/WebGPU, Linear/Fluid modes) using 10-second averages. Perform memory leak detection (resolution toggles, backend switches, 5-min morph playback, overlay toggles) via heap snapshots, audit GC pauses (target <10ms), and measure startup timing.

### R4. Known Bug & Audit Artifact Regression Analysis
Verify status of all 7 prior audit correctness bugs (Mode 1 Cylindrical Scroll Singularity, Triplicate Physics Drift, Dymaxion Scale Inconsistency, Duplicate CursorTrackers, WebGPU Depth Buffer Absence, WebGPU Per-Frame Allocations, Static Buffer Re-write). Re-evaluate the 10-dimension audit scorecard and verify design language compliance (including whimsy moments).

### R5. Code Quality & Test Suite Verification
Run `npm run build` (zero TS errors, zero chunk warnings) and `npm test` (zero failures). Perform strictness audit (`tsconfig.json`), count `as any` type escapes, and check for unreferenced types/dead code.

## Acceptance Criteria

### Deliverables & Report Standards
- [ ] Deliver a complete `validation-report.md` at the project root containing:
  - Complete PASS/FAIL/PARTIAL Test Results Matrix with concrete empirical evidence for all tests across Domains 1–6.
  - Performance Dashboard with 10-second average FPS readings, heap snapshot trends, GC pause durations, and startup timings.
  - Known Bug Status Table for all 7 audit bugs (FIXED / NOT FIXED / PARTIALLY FIXED) with visual/console evidence.
  - Delta Scorecard re-evaluating the 10 enterprise dimensions with detailed justifications.
  - Design Language Compliance Checklist covering §1.2 through §6 (COMPLIANT / NON-COMPLIANT / NOT IMPLEMENTED).
  - Cross-Feature Failure Log detailing any state combination glitches.
  - Top 3 prioritized recommendations before portfolio release.

### Quality Guardrails & Constraints
- [ ] Every FAIL must be backed by a screenshot or console output.
- [ ] Every PASS must include concrete empirical metrics (e.g. sustained FPS, exact heap size).
- [ ] No source files modified during validation (read-only QA pass).
- [ ] Automated build (`npm run build`) and test suite (`npm test`) pass with zero errors.
</USER_REQUEST>

## 2026-09-03T17:56:07Z

<USER_REQUEST>
Stabilize and recover quality for the 1,000,000-node interactive globe-to-map transformation engine with dual WebGL2/WebGPU backends and 5 morphing paradigms. Eliminate dead code, placebo calculations, and zombie references; fix critical rendering, uniform, and state synchronization bugs; refactor root structure and components cleanly; overhaul tests from string matching to behavioral testing; and visually verify every paradigm and layer state in Chrome.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Requirements

### R1. Dead Code Surgery & Clean Up
- Remove unused imports from `App.tsx` (`CursorTracker`, `isWebGPUSupported`, `GeodesicOverlayMode`, `DataLayerItem`, `BlendModeType`, and the 5 inline GLSL chunk imports from `ShaderChunkRegistry`).
- Remove zombie manager refs (`whimsicalRef`, `pinchControllerRef`) from `App.tsx` and `useEngineState.ts`.
- Remove dead state destructuring in `App.tsx` (`isHudOpen, setIsHudOpen`, `playDirection, setPlayDirection`).
- Remove dead GLSL functions from `pointFragmentShader` (`oklch2rgb` 20-line matrix conversion).
- Remove commented-out code in `App.tsx` (e.g. lines 839-840).
- Clean dead imports in `WebGPUCanvas.tsx` (`RTCCamera`, `ThemeManager`).
- Remove dead WGSL uniforms:
  - In `physics_sim.wgsl`: remove unused uniforms (`u_dt`, `u_cursorRayOrig`, `u_cursorRayDir`, `u_viewMatrix`, `u_projectionMatrix`, `u_cameraPos`) from struct and uniform buffer writes in JS.
  - In `points_render.wgsl` and `lines_render.wgsl`: remove unused `u_cursorRayOrig` and `u_cursorRayDir`.
- Remove dead CSS classes from `index.css` (`.loading-spinner`, `.canvas-container`, `.toggle-btn`).
- Remove unused types and unused imports (`geojson`, `topojson-specification`, `d3`) from root `types.ts`, keeping only active types (`SimulationMode`, `LayerMode`, `GeodesicOverlayMode`, `DymaxionProjectionResult`).
- Audit `src/core/` modules:
  - Move inert stubs and hollow skeletons to `_deferred/` with notes (e.g. `GlobeOverlayAdapters.ts`, unused paradigm stubs, duplicate `morph-shared.glsl.ts`).
  - Keep genuinely functional core modules intact (`CursorContext.tsx`, `DevToolsAPI.ts`, `GeodesicOverlayLayer.tsx`, `GlobeOverlay.ts`, `VectorOverlayLayer.tsx`, `ProceduralAudioEngine.ts`, `DataLayerCatalog.ts`, `RasterTileDataSource.ts`, `IDataSource.ts`, `useGlobeLayerManager.ts`, `DataLayerOverlay.tsx`, renderers, `ThemeManager.ts`).
- Audit synthetic data sources in `src/core/data/` (`GeoTIFFDataSource.ts`, `GeoJSONDataSource.ts`, `VectorFieldDataSource.ts`, `TLETrajectoryDataSource.ts`): clarify in names/docs that they are procedural/synthetic generators and ensure renderers handle them cleanly without false claims of real parsing.

### R2. Visual & Functional Bug Fixes
- **Pseudo-RTC Precision**: Replace the no-op calculation in `App.tsx` vertex shader (`vec3 rtcPos = finalPos - u_cameraCenter; vec4 mvPosition = viewMatrix * vec4(rtcPos + u_cameraCenter, 1.0);`) with clean, standard `vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);` and remove misleading comments.
- **Frozen Telemetry Coordinates**: Fix lat/lon HUD readout in `App.tsx` by computing coordinates from the camera's true position or raycast center-of-viewport hit rather than static `cameraTarget` `(0,0,0)`.
- **OrbitControls 60fps Re-render Storm**: Eliminate 60fps state re-renders from `OrbitControls onChange` calling `setCameraTarget(target.clone())` by throttling/damping updates or using refs where React reconciliation is not required.
- **Icosahedral Frame Uniforms (Fuller Dymaxion)**: Ensure the 20-facet icosahedral frame `<shaderMaterial>` receives updated uniforms (including `u_unfurl`) in `useFrame` so that it unfurls smoothly with the mesh instead of remaining frozen at `u_unfurl = 0`.
- **Backface Culling Artifact on Lines**: Fix screen-spanning degenerate lines caused by single-vertex clipping on line segments by using a distinct `meshVertexShader` for line rendering that omits the aggressive vertex-drop early-out.
- **WebGPU Flat-Map Normal Dimming**: In `points_render.wgsl` and `lines_render.wgsl`, blend `dynamicNormal` toward `vec3(0,0,1)` based on `sim.u_unfurl` during planar morphing to match WebGL2 GLSL behavior and prevent 76% flat-map dimming.
- **WebGPU Depth Test Z-Clipping**: Update points pipeline in `WebGPUEngine.ts` to use `depthCompare: 'less-equal'` so coincident points are not culled behind lines.
- **WebGPU Device Loss Recovery**: Wire `onDeviceLost` callback in `WebGPUCanvas.tsx` to handle device loss gracefully.
- **DataLayer Props Parity**: Ensure `<DataLayerOverlay>` in WebGL2 mode accepts and passes `displacementScale`, `elevationEncoding`, `sunAzimuth`, `sunAltitude`, and `hillshadeIntensity` matching WebGPU mode.
- **Audio Mute Sync**: Synchronize initial audio mute state on mount (`audioEngineRef.current.setMute(true)`) so engine state and UI state match.
- **Theme & Favicon Fixes**: Fix Zen mode exit pill styling for light theme contrast; fix or remove broken `/vite.svg` reference in `index.html`.

### R3. Architecture Cleanup
- Consolidate duplicated `LoadedDataInfo` type into `src/types.ts`.
- Move root-level `App.tsx` into `src/App.tsx`, update `index.tsx` to import from `./src/App`, and remove redundant shims.
- Extract `GeometryLayer` and `KinematicCameraController` from `App.tsx` into standalone components in `src/components/canvas/`.
- Correct Vite alias convention in `vite.config.ts` so `@` points to `./src`.

### R4. Test Quality Overhaul
- Replace source-code string/regex tests (`adversarial-m1-challenger2.test.ts`, `adversarial-m2-challenger2.test.ts`, `adversarial-m3-challenger2.test.ts`) with behavioral tests against actual mathematical and projection functions.
- Replace self-contained mock tests (`tier1-f1-clock.test.ts`, `tier2-nan-inf-robustness.test.ts`, `tier3-pairwise.test.ts`) with unit tests importing production modules from `src/`.
- Configure DOM test environment (`happy-dom` or `jsdom`) in `vitest.config.ts` to support component-level HUD testing.
- Preserve all existing legitimate mathematical, morph trajectory, and adversarial stress tests.

### R5. Rigorous Visual Verification (Browser & Chrome DevTools MCP)
- Visually verify all 5 morphing paradigms in WebGL2 across α=0 (globe), α=0.5 (transition), and α=1.0 (flat map).
- Verify Fuller Dymaxion 20-facet frame unfurls with the mesh.
- Verify vector overlays (coastlines, Tissot indicatrix, landmarks, great circles) morph in sync with point clouds.
- Verify Data Layers drawer functionality: catalog presets, raster/topographic rendering with elevation displacement and hillshading, contour lines, reordering, visibility toggling, and WebGL2/WebGPU parity.
- Verify WebGPU backend: no flat-map dimming, no line/point z-fighting, clean toggling between WebGL2 and WebGPU.
- Verify HUD, themes (Obsidian dark, Archival light), Zen mode exit, and active telemetry updates (lat/lon, scale, FPS, data info).

## Acceptance Criteria

### Code Hygiene & Surgery
- [ ] `npm run build` succeeds with zero errors and zero warnings.
- [ ] `npx tsc --noEmit` exits with 0 errors.
- [ ] `App.tsx` has zero unused imports, zero zombie manager refs, and zero uncalled GLSL helper functions.
- [ ] Unused WGSL uniform declarations and uniform buffer writes in `physics_sim.wgsl`, `points_render.wgsl`, and `lines_render.wgsl` are removed.
- [ ] Dead CSS classes removed from `index.css`.
- [ ] Inert scaffolding and hollow stubs moved to `_deferred/` with explanatory documentation.

### Bug Fixes & Rendering Parity
- [ ] Pseudo-RTC replaced with standard model-view transformation in vertex shader.
- [ ] Telemetry lat/lon updates dynamically as the camera orbits (never frozen at `00°00'N, 000°00'E`).
- [ ] `OrbitControls` does not trigger 60fps React state re-render loops during auto-rotation.
- [ ] Fuller Dymaxion (Mode 5) icosahedral frame unfurls simultaneously with the mesh vertices.
- [ ] Vector line rendering exhibits zero screen-spanning degenerate line artifacts during backface transitions.
- [ ] WebGPU flat map renders at full brightness without normal-induced dimming.
- [ ] Points in WebGPU are visible without z-clipping behind coincident wireframe lines (`less-equal` depth comparison).
- [ ] WebGPU device loss listener is registered and gracefully reports errors.
- [ ] Data layer props (`displacementScale`, `elevationEncoding`, `sunAzimuth`, `sunAltitude`, `hillshadeIntensity`) are passed identically in WebGL2 and WebGPU modes.
- [ ] Audio mute state is synchronized on initial mount.
- [ ] Zen mode exit pill is clearly legible in both dark and light themes.

### Architectural Structure
- [ ] `App.tsx` lives at `src/App.tsx` and is imported directly by `index.tsx`.
- [ ] `GeometryLayer` and `KinematicCameraController` reside in `src/components/canvas/`.
- [ ] `LoadedDataInfo` is centralized in `src/types.ts`.
- [ ] Vite `@` alias resolves to `./src`.

### Test Suite Quality
- [ ] `npm test` passes 100% across all suites.
- [ ] Regex string-matching on source files replaced with direct functional assertions.
- [ ] Local duplicate mock functions replaced with imports from production code.
- [ ] DOM test environment configured and functional in `vitest.config.ts`.

### Visual Verification
- [ ] WebGL2 Mode 1 (Linear Mix) verified at α=0, α=0.5, α=1.0 with screenshots.
- [ ] WebGL2 Mode 2 (Cylindrical Scroll) verified without pole singularities.
- [ ] WebGL2 Mode 3 (Griffith Fracture) verified with tensile strain and rupture dynamics.
- [ ] WebGL2 Mode 4 (Fluid Advection) verified with curl noise and wake response.
- [ ] WebGL2 Mode 5 (Fuller Dymaxion) verified with 20-facet frame unfurling.
- [ ] Vector overlays (coastlines, Tissot ellipses, great circles) verified in morph states.
- [ ] Topographic data layer verified with visible continental relief and hillshading.
- [ ] WebGPU backend verified with parity against WebGL2.
- [ ] Dark and light themes visually verified in HUD.
</USER_REQUEST>

## 2026-09-04T21:47:49Z

<USER_REQUEST>
# Teamwork Project Prompt: Indicatrix Engine Deep-Thinking Research

> Status: Launched
> Goal: Execute Phase 2 Scientific & Architectural Research and produce the definitive `research-dossier.md`
> Requested team: Research Crew (Applied Mathematics, Ocean Optics, WebGPU Systems, Cartographic Engineering)

Execute comprehensive scientific literature validation, algorithmic derivation, and hardware limit benchmarking for the Indicatrix WebGPU Cartography Engine on Apple Silicon M4 Pro, synthesizing all findings into `research-dossier.md`.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Requirements

### R1. Screen-Space Anti-Aliased Vector Line Ribbon Mathematical Formulation (Frontier 1)
- Formulate the screen-space quad extrusion pipeline for non-linear dynamic manifolds ($S^2 \to \mathbb{R}^2$ morphing).
- Derive the camera near-plane guard preventing division-by-zero or negative $w$ clipping singularities ($w \le 0$) without geometry shaders in WebGPU WGSL.
- Evaluate line-join geometry algorithms (He & Li 2019 two-triangle joins vs. instanced segment quads with circular caps) for vertex count and memory footprint.
- Derive the analytical distance function $d(u,v)$ and screen-pixel feathering equations for perceptual width invariance across 1× to 3× Retina displays.
- Provide compilable WGSL vertex and fragment shader function code for drop-in integration into `vector_ribbon.wgsl`.

### R2. Topographic & Bathymetric Isoline Contour Extraction on Spherical Manifolds (Frontier 2)
- Formulate continuous isoline extraction from dense elevation grids using subpixel marching squares with Nielson's Asymptotic Decider to resolve diagonal saddle-point topological ambiguities.
- Specify the spherical Visvalingam-Whyatt effective area metric on $S^2$ ($\Delta \Omega = \frac{\text{Area}_{3D}}{R^2}$) for topology-preserving line generalization from 100k+ points to optimal GPU buffer budgets.
- Derive the analytical topological severance rule for cutting closed contour rings into open segments when crossing the 180° antimeridian (Cylindrical Scroll) or Fuller's 14 icosahedral net cut boundaries (Dymaxion Net) without leaving dangling edge artifacts.
- Provide reference Python/TypeScript algorithms for `precompute-contours.py`.

### R3. Hydrosphere Optics, Jerlov Radiative Transfer & Micro-Ripple Caustics (Frontier 3)
- Extract empirical spectral absorption $a(\lambda)$ and scattering $b(\lambda)$ coefficients across red (650 nm), green (532 nm), and blue (440 nm) wavelengths for Jerlov Oceanic Water Types (Type I oligotrophic open ocean vs. Type III mesotrophic coastal waters).
- Formulate a closed-form Kubelka-Munk two-flux bottom reflectance approximation in WGSL for shallow bathymetry ($0\text{m} - 50\text{m}$) modeling turquoise reefs and marine sediment albedo.
- Formulate the mathematical proof of Synchronous Dual-Surface Morphing: verify that crust position $\vec{p}_{\text{crust}}(\lambda, \phi, t)$ and water position $\vec{p}_{\text{water}}(\lambda, \phi, t)$ sharing the identical base manifold and normal field $\vec{n}(\lambda, \phi, t)$ mathematically guarantees zero z-fighting and zero boundary gaps across all 5 morph modes.
- Formulate the Cartographic Glass Caustics normal perturbation $\Delta \vec{n}(\vec{x}, t)$ using multi-octave micro-ripple harmonics with closed-form WGSL code.

### R4. NOAA NCEI ETOPO 2022 Architecture & Ingestion Pipeline (Frontier 4)
- Verify the active NOAA NCEI THREDDS OPeNDAP DODS endpoint URL, grid dimensions (15 arc-sec vs. 60 arc-sec), coordinate arrays, and geoid datum offsets ($WGS84$ vs. $EGM2008$) for global elevation ($-10,924\text{m}$ to $+8,848\text{m}$).
- Test and specify the binary packing schema for encoding full-range 32-bit elevation into RGBA texture channels (R: land elevation, G: bathymetry, B: land/ocean mask, A: signed normalized elevation) to eliminate 8-bit quantization banding.
- Formulate Eduard Imhof's classical Swiss relief shading as a branchless WGSL fragment shader incorporating multidirectional sun illumination, warm-to-cool aerial perspective tinting, and slope-dependent rock cliff exposure for angles $> 35^\circ$.

### R5. Apple Silicon M4 Pro WebGPU Architecture & 4M–16M Node Scaling (Frontier 5)
- Document the exact WebGPU adapter limits supported on Apple Silicon M4 Pro Metal backend (`maxStorageBufferBindingSize`, `maxBufferSize`, `maxComputeWorkgroupStorageSize`).
- Determine the optimal WGSL `@workgroup_size` for Apple Silicon SIMD32 GPU execution cores to maximize ALU occupancy and minimize register spilling.
- Provide the configuration and launch arguments (`--enable-dawn-features=allow_unsafe_apis`) for programmatic GPU timestamp queries and sub-microsecond kernel profiling.
- Specify zero-copy storage-to-vertex buffer layout and memory alignment for ping-pong compute dispatches scaling from 1M to 16M nodes.

## Acceptance Criteria

### Scientific Rigor & Algorithmic Parity
- [ ] All 5 research frontiers are fully answered with canonical mathematical equations (LaTeX), derivation steps, and published literature citations (arXiv, IEEE, ACM, NOAA).
- [ ] Compilable WGSL shader modules and reference scripts are provided for ribbons, isolines, caustics, and relief.
- [ ] Every formula accounts for boundary conditions (near-plane crossing, antimeridian seams, pole singularities, and zero-depth shorelines).
- [ ] NOAA OPeNDAP DODS endpoint query syntax is verified.
- [ ] Apple Silicon M4 Pro device limit parameters and memory bounds are documented with verified byte counts.

### Deliverable Artifacts
- [ ] `research-dossier.md` created in the project repository containing all derivations, parameter matrices, and reference code.
- [ ] All outputs pass the 4 Micro-Verification Gates: Syntax Gate (valid WGSL/TS/Python), Logic Gate (edge cases handled), Domain Gate (WebGPU M4 Pro specific), and Alignment Gate (addresses project requirements).

</USER_REQUEST>

## 2026-09-04T23:16:38Z

<USER_REQUEST>
# Teamwork Project Prompt: Indicatrix Engine Milestone 1 Execution

> Requested team: WebGPU Cartography & Systems Engineering Team (Cartography & Shader Engineer, WebGPU Systems Engineer, QA & Verification Engineer)

Execute Milestone 1 (WebGPU Shader & Ingestion Pipelines) of the Indicatrix Cartography Engine on Apple Silicon M4 Pro, implementing ETOPO 2022 DEM unpacking, Eduard Imhof Swiss relief shading, Jerlov oceanic radiative transfer, and screen-space anti-aliased vector ribbons in WebGPU WGSL.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Reference Material
- Mandate Contract: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/SYSTEM_ORCHESTRATION_MANDATE.md
- Persistent Task Ledger: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/todo.md
- Scientific Research Dossier: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/research-dossier.md
- Baseline Test Suite: 59 test files, 676 tests passing (100% pass rate)

## Requirements

### R1. ETOPO 2022 DEM Ingestion & 16-Bit Texture Pipeline (M1-T1)
Ingest the precomputed NOAA NCEI ETOPO 2022 elevation dataset (`public/earth-etopo2022-dem.webp` and `public/earth-etopo2022-dem-u16.bin`) into a WebGPU texture resource. Implement the texture unpacking logic in `src/webgpu/shaders/dem_unpack.wgsl` and wire into `src/webgpu/WebGPUEngine.ts` to decode full-range signed elevation (-10,924m bathymetry to +8,848m topography) into high-precision floating-point elevation without 8-bit banding artifacts.

### R2. Eduard Imhof Swiss Relief Shading Render Pass (M1-T2)
Integrate `src/webgpu/shaders/swiss_relief_shading.wgsl` into `WebGPUEngine.ts` as a dedicated terrain rendering pass. Evaluate the 5-tap discrete Laplacian surface curvature, multi-directional illumination (NW 315° primary sun, SW 225° fill light), and slope-dependent rock cliff exposure for terrain gradients > 35°. All calculations must be branchless and SIMD32-optimized for Apple Silicon Metal backend.

### R3. Jerlov Radiative Transfer & Synchronous Dual-Surface Morphing (M1-T3)
Integrate `src/webgpu/shaders/hydrosphere_optics.wgsl` and `src/webgpu/shaders/crust_hydrosphere.wgsl` into the WebGPU render loop. Implement Jerlov Oceanic Water Types I–III spectral attenuation Kd(lambda) across red (650nm), green (532nm), and blue (440nm) wavelengths, and Kubelka-Munk two-flux bottom reflectance for shallow bathymetry (0m - 50m). Guarantee synchronous dual-surface morphing such that crust p_crust and ocean p_water share the identical base manifold, preventing z-fighting and boundary tearing across all 5 morph modes (alpha in [0, 1]).

### R4. Screen-Space Anti-Aliased Vector Line Ribbon Pipeline (M1-T4)
Bind `src/webgpu/shaders/vector_ribbon.wgsl` into `WebGPUEngine.ts` to render cartographic linework (coastlines, contours, graticules) using instanced quad extrusion. Implement the homogeneous 4D near-plane guard preventing division-by-zero or inverted projection when vertices cross behind the camera (w_c <= 0). Apply sub-pixel box-filter feathering equations ensuring perceptual ribbon width invariance across 1× to 3× Retina displays.

### R5. Verification, Zero-Regression & Milestone 1 QA Gate (M1-T5)
Author dedicated Vitest behavioral test suites in `tests/phase2/` covering DEM texture unpacking, Swiss relief shading math, Jerlov spectral attenuation, and vector ribbon near-plane clipping. Enforce the Zero-Regression Invariant: all 676 baseline Vitest tests must continue to pass with 0 failures. Execute live visual audit on Chrome/Edge to verify visual rendering across globe (S^2) and flat map (R^2) regimes. Synchronize status and iteration counts in `todo.md`.

## Acceptance Criteria

### Shader Compilation & Pipeline Integration
- [ ] `src/webgpu/WebGPUEngine.ts` initializes and executes render passes for Swiss relief shading, hydrosphere optics, and vector ribbons without runtime WebGPU validation errors.
- [ ] All WGSL shader modules (`dem_unpack.wgsl`, `swiss_relief_shading.wgsl`, `hydrosphere_optics.wgsl`, `vector_ribbon.wgsl`) compile cleanly against Dawn/Metal with 16-byte uniform buffer alignment.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] `npm run build` succeeds with 0 errors.

### Algorithmic & Optical Parity
- [ ] ETOPO 2022 elevation decodes signed elevation continuously from deep oceanic trenches to mountain summits without quantization step artifacts.
- [ ] Hydrosphere rendering exhibits zero z-fighting or surface gaps between water surface and continental crust across all 5 morph modes at alpha = 0.0, 0.5, 1.0.
- [ ] Vector line ribbons maintain uniform screen-pixel width across 1×, 2×, and 3× Retina DPR settings without exploding or vanishing when passing through the camera near-plane.

### Regression & Verification Standards
- [ ] Automated Vitest test suite passes with 100% pass rate and >= 676 passing tests (zero regressions).
- [ ] New behavioral test suite in `tests/phase2/` verifies numerical stability (zero NaNs, zero Infinities across all uniforms and coordinates).
- [ ] Tasks M1-T1 through M1-T5 in `todo.md` are updated to `[COMPLETED]` with iteration counts recorded.
</USER_REQUEST>

## 2026-09-04T23:44:42Z

<USER_REQUEST>
# Teamwork Project Prompt: Indicatrix Engine Milestone 2 Execution

> Requested team: WebGPU Cartography & Systems Engineering Team (Cartography & Shader Engineer, WebGPU Systems Engineer, QA & Verification Engineer)

Execute Milestone 2 (Contour & Vector Topology) of the Indicatrix Cartography Engine on Apple Silicon M4 Pro, ingesting precomputed isoline contour meshes (`public/geo-contour-mesh.bin`), implementing Simon l'Huilier spherical excess generalization on $S^2$, and enforcing analytical topological severance across the 180° antimeridian seam and Fuller's 14 Dymaxion net cut boundaries.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Reference Material
- Mandate Contract: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/SYSTEM_ORCHESTRATION_MANDATE.md
- Persistent Task Ledger: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/todo.md
- Scientific Research Dossier: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/research-dossier.md (Frontier 2: Sections 2.1–2.6)
- Baseline Test Suite: 62 test files, 750 tests passing (100% pass rate, 0 regressions)

## Requirements

### R1. Isoline Contour Mesh Streaming & Ingestion (M2-T1)
Stream and ingest the precomputed binary contour mesh (`public/geo-contour-mesh.bin`, 2.48 MB) containing subpixel topographic and bathymetric isolines generated via Nielson's Asymptotic Decider. Parse the 32-byte binary header (`0x434F4E54` "CONT" magic, format version, elevation span, vertex/index counts) and allocate GPU storage and index buffers in `src/webgpu/WebGPUEngine.ts` with zero CPU heap re-allocations, keeping total VRAM overhead under 10 MB.

### R2. Simon l'Huilier Spherical Excess & Topological Severance (M2-T2)
Implement the Simon l'Huilier spherical excess formula in `src/utils/contour-topology.ts` and WGSL shaders to compute true spherical triangle areas ($\Delta \Omega = \frac{\text{Area}_{3D}}{R^2}$) for topology-preserving polyline generalization on $S^2$. Formulate the analytical topological severance rule: when closed contour loops cross the 180° antimeridian seam (Mode 1 Cylindrical Scroll) or Fuller's 14 icosahedral net boundaries (Mode 4 Dymaxion Net), inject boundary split vertices and sever closed rings into open line strips, eliminating screen-spanning wrap artifacts and dangling edge glitches across all morph states ($\alpha \in [0, 1]$).

### R3. Verification, Zero-Regression & Milestone 2 QA Gate (M2-T3)
Author dedicated Vitest behavioral test suites in `tests/phase2/` validating Simon l'Huilier spherical excess precision against known geodetic benchmarks, contour header binary decoding, antimeridian split vertex interpolation, and Dymaxion 14-boundary edge severance. Enforce the Zero-Regression Invariant: all 750 baseline Vitest tests must continue to pass with 100% pass rate. Update tasks M2-T1 through M2-T3 in `todo.md` to `[COMPLETED]` with iteration counts recorded.

## Acceptance Criteria

### Binary Ingestion & Buffer Management
- [ ] `public/geo-contour-mesh.bin` header (32 bytes) decodes correctly with valid vertex and index counts.
- [ ] GPU buffers for contour vertices and indices allocate cleanly in `WebGPUEngine.ts` with zero memory leaks across mode switches.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] `npm run build` succeeds with 0 errors.

### Topological & Spherical Mathematical Parity
- [ ] Simon l'Huilier spherical excess calculation yields non-negative, numerically stable steradian values ($\Delta \Omega \ge 0$) with zero NaNs across all spherical polylines.
- [ ] Antimeridian seam crossing ($\lambda = \pm \pi$) and Dymaxion net boundaries generate zero screen-spanning degenerate lines or topological pinches during morph transitions ($\alpha \in [0, 1]$).
- [ ] Isoline contours render harmoniously over Swiss relief shading and hydrosphere passes.

### Regression & Verification Standards
- [ ] Automated Vitest test suite passes with 100% pass rate and >= 750 passing tests (zero regressions).
- [ ] New behavioral test suite in `tests/phase2/` validates boundary clipping, spherical excess invariants, and extreme coordinate inputs.
- [ ] Tasks M2-T1 through M2-T3 in `todo.md` are marked `[COMPLETED]`.
</USER_REQUEST>

## 2026-09-05T00:13:00Z

<USER_REQUEST>
# Teamwork Project Prompt: Indicatrix Engine Milestone 3 Execution

> Requested team: WebGPU Cartography & Systems Engineering Team (WebGPU Systems Engineer, Cartography & Shader Engineer, QA & Verification Engineer)

Execute Milestone 3 (Apple Silicon M4 Pro 4M–16M Node Scaling & Publication Deliverables) of the Indicatrix Cartography Engine, configuring SIMD32 workgroup size 256 dispatch with zero-copy compute-to-vertex buffers, implementing asynchronous triple-buffered GPU timestamp query profiling, verifying 4M–16M node UMA scaling budgets, and producing the publication-grade validation-report-v3.md deliverable.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Reference Material
- Mandate Contract: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/SYSTEM_ORCHESTRATION_MANDATE.md
- Persistent Task Ledger: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/todo.md
- Scientific Research Dossier: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/research-dossier.md (Frontier 5: Sections 5.1–5.6)
- Previous Validation Standard: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/validation-report-v2.md
- Baseline Test Suite: 65 test files, 830 tests passing (100% pass rate, 0 regressions)

## Requirements

### R1. Workgroup Size 256 SIMD32 Dispatch & Zero-Copy Layout (M3-T1)
Optimize src/webgpu/shaders/physics_sim.wgsl and src/webgpu/WebGPUEngine.ts for Apple Silicon M4 Pro Metal architecture. Configure 1D dispatch grid ceil(N / 256) workgroups (62,500 workgroups for 16,000,000 nodes, strictly within the 65,535 1D grid limit). Enforce zero-copy architecture binding compute storage buffers directly as vertex buffers (GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX), eliminating CPU readback and intermediate GPU memory copy operations.

### R2. Asynchronous Triple-Buffered GPU Timestamp Query Profiling (M3-T2)
Implement sub-microsecond kernel execution profiling in src/webgpu/profiling/GPUProfiler.ts. Initialize a triple-buffered GPUQuerySet ring buffer (type: 'timestamp', capacity 16 queries) to measure compute pass and render pass durations without blocking the GPU pipeline or stalling CPU animation frames. Provide clean, non-crashing fallback telemetry when browser flags (--enable-dawn-features=allow_unsafe_apis) are absent.

### R3. 4M–16M Node Memory Budget & Bandwidth Stress Verification (M3-T3)
Incorporate 4M and 16M node density scaling calculations and memory allocations in src/webgpu/WebGPUBenchmark.ts and automated stress harnesses. Verify that memory layout across static reference buffers and ping-pong storage buffers fits comfortably within Apple Silicon Unified Memory Architecture limits (1M: 96 MB, 4M: 384 MB, 16M: 1,536 MB VRAM <= 2.0 GB). Benchmark theoretical memory bandwidth against the M4 Pro 273 GB/s ceiling, confirming compute throughput >= 100M nodes/sec.

### R4. Final Publication Deliverable & Research Delegation Report (M3-T4)
Synthesize all Phase 2 empirical findings into a publication-grade validation-report-v3.md at the project root, strictly adhering to the 5-domain evaluation matrix and scorecard format established in validation-report-v2.md. Update PROJECT.md feature inventory reflecting completed Phase 2 research frontiers. Document specific, actionable feedback instructions to delegate back to the research team. Mark all remaining tasks in todo.md as [COMPLETED] with iteration counts recorded. Enforce the Zero-Regression Invariant: all 830 baseline Vitest tests must continue to pass with 100% pass rate.

## Acceptance Criteria

### Performance & Scaling Limits
- [ ] 1D workgroup dispatch calculation ceil(N / 256) scales from 100k up to 16,000,000 nodes with workgroup count <= 65,535.
- [ ] Storage-to-vertex buffer aliasing executes with zero CPU readback (readPixels / mapAsync absent from render loop).
- [ ] Triple-buffered GPUProfiler measures microsecond pass durations and falls back gracefully when timestamp queries are unsupported.
- [ ] Memory footprint for 16M nodes is strictly bounded at <= 1.54 GB VRAM (well within Apple Silicon 24 GB UMA).

### Final Report & Documentation
- [ ] validation-report-v3.md exists at project root with complete scorecard (Target: PRODUCTION READY 10/10, PASS across all domains).
- [ ] PROJECT.md feature inventory updated with Phase 2 capabilities (Frontiers 1 through 5).
- [ ] Concrete delegation feedback instructions documented for the research team.
- [ ] All 12 tasks in todo.md (M1-T1 through M3-T4) are marked [COMPLETED] with iteration counts recorded.

### Regression & Verification Standards
- [ ] Automated Vitest test suite passes with 100% pass rate and >= 830 passing tests (zero regressions).
- [ ] npx tsc --noEmit passes with 0 errors.
- [ ] npm run build succeeds with 0 errors.
</USER_REQUEST>

## 2026-09-05T19:02:07Z

<USER_REQUEST>
# Teamwork Project: Indicatrix Engine Final Assembly & Visual Polish

/boost Complete the final wiring, visual tuning, and quality verification of the Indicatrix Engine. The research dossier (302KB, 4,857 lines) defines the exact mathematics. The research is the specification. The pixels are the deliverable. The gap between them is the work.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development (no restrictions on internal techniques, but intentional testing with a strict zero-regression invariant on the 925 Vitest suite and no endless test loops)
Authoritative Reference: DESIGN_ETHOS.md, research-dossier.md, research-frontier5-m4pro-extreme-scaling.md
Specialized Skills: webgpu-interactive-simulation (~/.gemini/config/skills/webgpu-interactive-simulation/SKILL.md), chrome-devtools

## Multi-Agent Role Architecture

1. Architect / Lead Orchestrator: Decomposes work, guards atomic git commits, arbitrates PRs, and holds the final veto based on DESIGN_ETHOS.md.
2. Scaffolding & Integration Engineer: Owns TypeScript, React wrappers, DataLayerOverlay.tsx, WhimsicalEffectsManager.ts, and ManifoldPinchController.ts. Enforces that vitest run stays at 925/925 with zero regressions.
3. WGSL Shader & Physics Specialist: Owns crust_hydrosphere.wgsl and physics_sim.wgsl. Implements exact math from the research dossier (Jerlov extinction depth gradient, Kubelka-Munk carbonate reef glow, solenoidal silk drape advection) guided by webgpu-interactive-simulation.
4. Empirical Verifier / Independent Judge: Operates independently with browser automation tools. Captures the baseline "Before" images first, benchmarks FPS, audits visual fidelity, and compiles the final side-by-side Before/After deliverable artifact.

## Contract Gates & Execution Protocol

### Gate 0: Mandatory Baseline Anchor (Before State)
Rule: No shader or render code may be modified until Gate 0 is archived and verified.
1. The Verifier boots the dev server (npm run dev) and launches Chromium with Apple Silicon Metal WebGPU flags per webgpu-interactive-simulation:
   --use-angle=metal --enable-unsafe-webgpu --ignore-gpu-blocklist
2. Capture and archive 1920×1080 @2x baseline screenshots to screenshots/before/:
   - before-mathematical-purity-dark.png: alpha = 0.0, base state, no data layers
   - before-hydrosphere-caribbean.png: Caribbean sea zoomed in, recording current water optics
   - before-fluid-morph-alpha05.png: alpha = 0.5, fluid advection mode
   - before-dymaxion-unfold.png: alpha = 1.0, Dymaxion planar net
3. Record initial FPS, memory footprint, and confirm npx vitest run passes 925/925 tests.

### The Core Work: Parallel Convergence Under Continuous Invariants
- Invariants:
  - npx vitest run must pass (925/925) at every step.
  - npx tsc --noEmit and npm run build must succeed without errors.
  - No blind file deletions (grep -r audit required).
  - Precompute scripts and binary assets (public/*.bin) remain untouched.

- Scaffolding & Integration Track:
  - DataLayerOverlay Dynamic Routing: In DataLayerOverlay.tsx, dispatch on props.category:
    - 'topo' | 'ocean' | 'thermal' | 'night' | 'satellite' -> RasterLayerRenderer
    - 'vectors' -> VectorBoundaryRenderer
    - 'point' -> VectorContourRenderer
    - 'field' -> VectorFieldRenderer
  - WhimsicalEffectsManager Lifecycle: Instantiate and update WhimsicalEffectsManager.ts in the render loop. Wire pointScaleMultiplier into GPU uniforms to trigger Moiré rings during polar axis alignment (< 0.5°).
  - ManifoldPinchController DOM Bindings: Connect ManifoldPinchController.ts into the canvas interaction loop. Keep cursor physics OFF by default (or require holding Shift key) to maintain strict separation between camera orbit and manifold pinch. When engaged, run the damped harmonic oscillator (k=45, gamma=6.5, omega_d=28) and feed surface perturbation into the shader uniforms (u_cursorActive, u_cursorHitPos). Audio synthesis remains deferred.

- WGSL Shader & Optics Track:
  - Hydrosphere Optical Fidelity: In crust_hydrosphere.wgsl, verify and tune:
    - Jerlov spectral radiative transfer: Type I crystal sapphire blue in deep trenches vs Type III emerald green in coastal shallows.
    - Kubelka-Munk carbonate reef reflectance (ALBEDO_CARBONATE_REEF = vec3(0.48, 0.54, 0.44)) producing warm glow over shallow reefs.
    - Gerstner 4-octave caustics dancing on the water surface.
    - Sea level slider smoothly raising/lowering the water sphere with zero z-fighting against the lithosphere.
  - Fluid Morph Silk Billowing: In physics_sim.wgsl, verify and tune:
    - Solenoidal curl noise (div u = 0) with irrational SO(3) rotation.
    - Silk drape wave dynamics (silkDrapeOffset = surfaceNormal * silkWave) producing the organic, graceful, weightless billow of silk floating in water at alpha = 0.5. Ensure it does not look like random noise or rigid displacement.
  - Performance Profiling: Audit WebGPU render passes, uniform writes, and rAF cycles for M4 Pro framerate bottlenecks towards the 120 FPS target without compromising visual quality.

### Gate 1: Empirical Deliverable & Circuit Breaker
The primary circuit breaker: "Does the visual output honor the research that informed it?"
1. Matching "After" Capture: Capture 1920×1080 @2x screenshots at identical camera coordinates and parameters to screenshots/:
   - after-mathematical-purity-dark.png
   - after-hydrosphere-caribbean.png
   - after-fluid-morph-alpha05.png
   - after-dymaxion-unfold.png
2. Before vs After Deliverable Report: Generate docs/visual-deliverable-comparison.md embedding side-by-side Before/After imagery, detailing:
   - Concrete parameter deltas (Jerlov absorption/scattering, reef albedo, silk drape amplitude).
   - Observable visual changes (color gradient depth, ripple definition, motion organic fluidity).
   - Measured frame rates (baseline vs final on M4 Pro).
3. Documentation Honesty: Update PROJECT.md to reflect that 16M node scaling is an arithmetic benchmark (no 16M dataset exists), and document active vs inert scaffolding.
4. Architect Sign-off: Architect audits all visual deliverables against DESIGN_ETHOS.md and confirms zero-regression test status before completing the mission.

## Acceptance Criteria

### Automated & Integrity Verification
- [ ] npx vitest run passes with 0 regressions (925/925 tests passing).
- [ ] npx tsc --noEmit and npm run build succeed with zero errors.
- [ ] No blind file deletions; all changes made via targeted edits.
- [ ] Precompute scripts and binary assets (public/*.bin) remain intact without regeneration.

### Empirical Deliverables
- [ ] Baseline "Before" screenshots captured and committed in screenshots/before/ prior to shader edits.
- [ ] DataLayerOverlay.tsx dynamically routes all layer categories to their specialized renderers.
- [ ] Polar view vector alignment (< 0.5°) triggers visible Fibonacci Moiré ring scaling.
- [ ] Shift-drag or HUD-activated pointer interaction triggers Gaussian depression during hold and damped harmonic rebound upon release.
- [ ] Ocean shallows visibly glow with carbonate sand reflectance; deep ocean transitions to sapphire/navy.
- [ ] Fluid morph at alpha = 0.5 billows like silk floating in water with solenoidal flow.
- [ ] Matching "After" screenshots and comprehensive side-by-side comparison report delivered in docs/visual-deliverable-comparison.md.
</USER_REQUEST>

