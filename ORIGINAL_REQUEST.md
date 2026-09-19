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


## 2026-09-06T17:20:58Z

Modernize the Indicatrix 3D cartography engine into a pure, standalone WebGPU instrument: upgrade vector geometry to 10m high-precision linework, implement Orbital Mode (C) with NASA satellite draping and solar terminator blending, ingest real NOAA GFS wind velocity grids and CelesTrak satellite orbits into WGSL compute, wire intuitive frontend HUD and UI/UX controls to drive all new features, ensure all 5 unfurl modes operate flawlessly, and completely retire Three.js / WebGL2 dependencies.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Requirements

### R1. High-Precision Vector Geometry & Topographic Relief Detail
- Upgrade vector precomputation in `scripts/precompute-vectors-10m.ts` to ingest Natural Earth 1:10m physical coastlines and river centerlines, maintaining antimeridian segment severance and DEM terrain elevation sampling to emit `public/geo-vectors.bin` (~35 MB raw, sub-kilometer fidelity).
- In `WebGPUEngine.ts` (`loadDEMTexture`), replace arithmetic box-filtering with conservative max-pooling downsampling (0.4 * mean + 0.6 * max) to prevent summit flattening from orbit.
- Dynamically scale `u_peakExponent` from 1.0 (close-up) to 1.8 (orbital `camDist > 25.0`) in `crust_hydrosphere.wgsl` to retain sharp topographic silhouette contrast from space.

### R2. WebGPU Feature Parity & All 5 Unfurl Modes Flawless Operation
- In `crust_hydrosphere.wgsl`, bind 4096x2048 equirectangular (EPSG:4326) NASA Blue Marble and VIIRS Night Lights textures via `@group(0) @binding(3)` and `@binding(4)` sampler. Ingest using `device.queue.copyExternalImageToTexture()`.
- Implement dynamic solar terminator blending using `computeSunLightDir` so daylight photography transitions into illuminated night cities on the dark side of the globe.
- Ensure all 5 projection and unfurl modes morph flawlessly without vertex explosions or texture seam tearing:
  - Mode 0: Linear Spherical-to-Planar Morph
  - Mode 1: Archimedean Scroll Unroll
  - Mode 2: Griffith Fracture Mechanics
  - Mode 3: Viscoelastic Fluid Continuum Morph
  - Mode 4: Fuller Dymaxion Polyhedral Unfurl
- Decouple dynamic particle compute from terrain mesh tessellation: support terrain mesh scaling up to 16.78M vertices while bounding interactive particle physics simulation in `physics_sim.wgsl` to 4.19M/1.05M to sustain high frame rates. Procedurally spawn 4.19M particles in a one-time boot compute pass directly in VRAM (0 MB network download).

### R3. Standalone WebGPU Architecture & WebGL2 Retirement
- Decouple `useCameraKinematics.ts` and `CameraTelemetryUpdater` from `three` math classes (`THREE.Vector3`, `THREE.Matrix4`), replacing with pure ES6 linear algebra / Float32Array spherical trig functions.
- Wire camera drag, pan, and zoom interactions directly to `<WebGPUCanvas>` via the native `KinematicCameraController.tsx`, ensuring smooth inertial damping matching Drei OrbitControls.
- Delete legacy Three.js renderers (`src/core/layers/renderers/*.tsx`, `src/components/canvas/GeometryLayer.tsx`, `src/core/_deferred/`) and strip the backend switcher in `App.tsx`.
- Uninstall `three`, `@types/three`, `@react-three/fiber`, and `@react-three/drei`. Add a clean SVG/HTML fallback for browsers lacking WebGPU support.

### R4. Live Planetary Instrumentation & Automation
- Ingest real NOAA GFS 0.25°/1.0° surface wind velocity grids (u, v half-float binary `public/data/gfs-wind-latest.bin`, ~260 KB) into `physics_sim.wgsl` as a 2D float texture, replacing `Math.random()` with hardware bilinear velocity sampling to drive real atmospheric advection.
- Ingest CelesTrak active Starlink & ISS TLE orbital elements (`public/data/tle-starlink.json`, ~400 KB) into an instanced WebGPU line ribbon pipeline using SGP4 propagation.
- Set up local scheduled tasks using Antigravity's `schedule` tool to verify periodic refresh of wind and satellite data.

### R5. Complete Frontend HUD & UI/UX Integration
- Wire prominent UI controls across `NavigationDock.tsx`, `TopologyControlDock.tsx`, `UnifiedRightSidebar.tsx`, and `DataLayersDrawer.tsx`:
  - Orbital Mode C Control: Direct selector or primary preset button that activates NASA Blue Marble & Night Lights draping with live sun azimuth/altitude sliders.
  - Planetary Layer Toggles: Dedicated toggles in `DataLayersDrawer` for Real NOAA Wind Field and Starlink Satellite Orbits with "Live Synced" badge indicators.
  - Unfurl Mode Controls: Clean UI selector in `TopologyControlDock` allowing direct switching between all 5 unfurl modes (Linear, Scroll, Griffith, Fluid, Dymaxion) with live transition progress sliders.
  - Resolution & Node Count Telemetry: Ensure `SystemStatusPill.tsx` displays accurate live readouts of both the 3D terrain vertex count (up to 16.7M) and active particle compute nodes (1M/4M).

---

## Acceptance Criteria

### Build & Bundle Verification
- [ ] `npm run build` succeeds with zero TypeScript errors and zero warnings.
- [ ] Production build verification confirms `three-vendor` and `r3f-vendor` chunks are completely eliminated.
- [ ] Total production JavaScript bundle shrinks by >= 2.0 MB.

### Hardware Benchmark Harness Verification
- [ ] `node scripts/benchmark-fps-matrix.mjs` executes and verifies:
  - 1M node globe sustains >= 100 FPS on M4 Pro.
  - 4M node globe sustains >= 80 FPS on M4 Pro.
  - 16.7M terrain mesh sustains >= 60 FPS on M4 Pro.

### UI/UX & Frontend Interactivity Verification
- [ ] Toggling Orbital Mode C in the HUD mounts the NASA Blue Marble texture and sun terminator without UI lockup or dropped frames.
- [ ] Enabling NOAA Wind in the Data Layers drawer activates physical atmospheric particle advection.
- [ ] Enabling Starlink Orbits in the Data Layers drawer renders real-time orbital paths.
- [ ] Cycling through all 5 unfurl modes via `TopologyControlDock` updates the manifold state smoothly across sliders 0.0 -> 1.0.
- [ ] `SystemStatusPill` correctly reflects live FPS, active resolution tier, and VRAM memory telemetry.

### In-Browser DevTools Live Verification (Real Runtime)
- [ ] Application loads on local dev server (`http://localhost:3000` / `5173`) and connects to WebGPU context with zero WebGL2 contexts created.
- [ ] Browser DevTools console confirms 0 uncaught exceptions or WebGPU validation errors during a 60-second interactive session.
- [ ] 10m high-resolution vectors display crisp sub-kilometer coastal indentations in Norway, the Mediterranean, and Puget Sound without geometric faceting.
- [ ] All 5 unfurl modes (Linear, Scroll, Griffith, Fluid, Dymaxion) cycle through slider states 0.0 -> 1.0 without seam tearing, inverted normals, or vertex explosion.
- [ ] Orbital Mode (C) displays NASA Blue Marble with day/night solar terminator transition.
- [ ] Particles in `physics_sim.wgsl` stream along physical atmospheric circulation corridors (Trade Winds, Jet Stream).

## 2026-09-08T00:52:00Z

Conduct an exhaustive, rigorous review and visual analysis of the Indicatrix Engine (interactive-globe) application. Use a very large team of agents acting as design experts, usability experts, cartographic researchers, and an adversarial critique coliseum to push back on mapping decisions.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Requirements

### R1. Rigorous Visual Audit via Screenshots
Conduct an exhaustive review of *everything*: every screen, tab, state turn, table, dropdown, and component. Do not rely solely on DOM inspection; you must **take screenshots** and perform true visual analysis. Identify elements that contradict style guides or design ethos (`DESIGN_ETHOS.md`, `design-language.md`, `AGENTS.md`).

### R2. Cartographic Research & Adversarial Critique
Deploy a research team to investigate external cartographic history and craft. Where are these design mediums inspired from? Run an "adversarial coliseum" to aggressively push back on design decisions that lack utility or contradict traditional cartographic meaning.

### R3. Critique and Refine the Physical Mediums (Themes)
Evaluate the core rendering themes (Tharp/Physiographic, Cream Rag/Swiss Relief, Prussian/Cyanotype) as standalone physical mediums. Ensure consistency, proper contrast, depth, and visual integrity through all user interactions and map generations.

### R4. Investigate and Wire "Hypsometric Pigment Pans"
Investigate the "pigment pans" feature in the unified right sidebar (`UnifiedRightSidebar.tsx`). Diagnose why interacting with them currently does nothing (state management bug, missing pipeline wire, or incomplete feature) and wire it up so it functions as intended.

### R5. Eliminate Visual Noise with Justification
Eliminate visual noise across the application. You must explicitly detail in your deliverable what specific "noise" was removed, why it was removed, and what criteria classified it as "noise".

## Acceptance Criteria

### Audit & Visual Analysis Deliverable
- [ ] A comprehensive `visual-audit-report.md` is generated and saved to the project root.
- [ ] The report explicitly details what "noise" was removed, why, and the classification criteria.
- [ ] The report includes evidence of true visual analysis (e.g., referencing specific screenshots taken via headless browser/MCP during the audit), verifying that every screen, tab, dropdown, and component was analyzed visually.

### Cartographic Integrity
- [ ] The deliverable contains an adversarial critique section, evaluating the app's UI/UX decisions against historical cartographic craft and external research.
- [ ] Floating UI elements maintain a strict 10px minimum clearance from the outer neatline, verified by both layout inspection and visual analysis.

### Theme Viability & Pigment Pans Functionality
- [ ] All 3 themes render without visual tearing and maintain their defined OKLCH palettes.
- [ ] Clicking a pigment pan in the `UnifiedRightSidebar` successfully updates the global theme state and rendering pipeline without a page reload.


## 2026-09-08T18:36:43Z

# Teamwork Project Prompt

> Requested team: Deploy three focused agents with strict verification gates: [VECTOR-ENGINEER], [HYDROLOGY-ENGINEER], [VERIFICATION-LEAD]

Execute STAGE 1 (The Foundational Substrate) of the Indicatrix Engine Transformation: eliminate vector ribbon geometric standoff and floating silhouette spikes, implement camera-distance-adaptive stroke scaling, and implement in-shader geomorphic drainage conforming to DEM valley troughs.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map  
Integrity mode: development  
Reference: artifacts://teamwork_preview_master_dossier.md (Document ID: `HANDBOOK-INDICATRIX-STAGES-2026-09`, Section 2)

## Team Mandate & Roles

- **[VECTOR-ENGINEER]**: Responsible for `vector_ribbon.wgsl` and `WebGPUEngine.ts`. Eliminate the `0.025` normal standoff; implement surface-conforming elevation offset; implement camera-distance adaptive stroke scaling (`0.35px` at planetary orbit, `0.75px` zoomed); evaluate horizon facing falloff to eliminate detached spikes on the silhouette.
- **[HYDROLOGY-ENGINEER]**: Responsible for `crust_hydrosphere.wgsl`. Implement in-shader geomorphic drainage using DEM discrete Laplacian curvature (`kValley`) and elevation descent; glaze self-tapering waterways directly into DEM valley troughs for Cream Rag and Cyanotype; set Cream Rag initial state with Imhof relief and watercolor shelves.
- **[VERIFICATION-LEAD]**: Use Chrome DevTools MCP to capture Viewpoint 1 (Limb Horizon at 75° pitch) and Viewpoint 2 (Alpine Basin at 3.5x zoom). Verify that zero vector spikes float past the silhouette and that waterways sit in the actual DEM valleys. Report empirical FPS and shader compilation status.

## Requirements

### R1. Vector Ribbon Surface-Conforming Geometry & Horizon Falloff
- In `src/webgpu/shaders/vector_ribbon.wgsl` and `src/webgpu/WebGPUEngine.ts`:
  - Eliminate the artificial `0.025` normal standoff (`standoff = 0.0`).
  - Align ribbon vertex elevation displacement with the terrain crust decoding logic so vector linework strictly conforms to the DEM surface without clipping.
  - Implement camera-distance-adaptive stroke scaling: dynamic transition from ultra-fine hairline (`0.35px` physical / CSS stroke scaling) at full planetary orbit to standard line width (`0.75px`) at close zoom.
  - Refine horizon facing falloff (`in.facing`) and front-to-back attenuation so vectors smoothly attenuate before the silhouette limb. Ensure any finite difference derivative calls (`fwidth`, `dpdx`, `dpdy`) remain in unconditional uniform control flow strictly before conditional discards (per AGENTS.md invariant #3).

### R2. In-Shader Geomorphic Hydrology Drainage
- In `src/webgpu/shaders/crust_hydrosphere.wgsl`:
  - Calculate discrete Laplacian valley curvature (`kValley`) and elevation descent gradient to detect natural geomorphic drainage channels.
  - Glaze self-tapering waterways (headwaters hairline to broad valley confluences) directly into the DEM valley troughs for Cream Rag (Theme 1) and Prussian Cyanotype (Theme 2).
  - Hydrological linework must visually harmonize with Eduard Imhof relief shading and avoid artifacting across tile borders.
  - Ensure the initial application view defaults to Cream Rag with its optimal paper substrate, relief, and watercolor shelf presentation.

### R3. TypeScript & Shading Language Invariants
- Comply with all authoritative invariants from `AGENTS.md`:
  - **WGSL Uniform Control Flow**: Unconditional evaluation of all derivatives (`fwidth`) at entry of `fs_main` prior to any branching or `discard`.
  - **Substrate Clear Invariant**: Premultiplied alpha zero clear (`{ r: 0.0, g: 0.0, b: 0.0, a: 0.0 }`) to avoid DOM background blowout.
  - **Type Checking**: Clean execution of `npx tsc --noEmit` and `npm test` with zero compile or test regressions.

## Acceptance Criteria

### Shaders & TypeScript Build
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] `npm test` passes with 0 regressions.
- [ ] Live WebGPU shader compilation succeeds in browser with zero driver errors or WGSL uniform control flow rejections.

### Visual & Runtime Verification Gate 1 (via Chrome DevTools MCP)
- [ ] **Capture 1 (Limb Horizon)**: Captured at 75° pitch looking across the planetary limb. Zero vector spikes or disconnected geometry float outside the planetary silhouette.
- [ ] **Capture 2 (Alpine Basin Zoom)**: Captured at 3.5x zoom focused over the Alpine arc, Po Valley, and Rhône basin. In-shader waterways sit centered within the DEM valley floors, exhibiting smooth self-tapering linework.
- [ ] **Empirical Runtime Metrics**: Live browser FPS measured and confirmed ≥ 60 FPS (target ≥ 110 FPS on Apple Silicon) with zero console warnings.

## 2026-09-08T19:23:00Z

Execute STAGE 2 (The Physical Medium as Ink) of the Indicatrix Engine Transformation. Elevate the three cartographic themes from color-swap palettes into physically-grounded material simulations — copperplate intaglio on cotton rag, 1842 Herschel cyanotype photochemistry, and Heezen–Tharp physiographic stippling — while enforcing strict HUD layout invariants from `AGENTS.md` and maintaining zero-frame theme switching at ≥110 FPS.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

**Prerequisite**: Stage 1 (The Foundational Substrate) has been completed and verified. Zero-standoff vector ribbons, camera-distance adaptive stroke scaling, horizon facing falloff, and in-shader geomorphic drainage are all in place and passing (`npx tsc --noEmit` = 0 errors, `npm test` = all passing, live FPS 86–116 on Apple Silicon).

## Authoritative References

The following files are the authoritative design specifications. Consult them before making any changes:
- `AGENTS.md`: 7 project invariants including WGSL uniform control flow, cartographic framing, HUD layout geometry, substrate/optics hierarchy, and archival ink rules.
- `DESIGN_ETHOS.md`: 15 core design principles, rendering identities, hydrosphere physics, and framing hierarchy.
- `design-language.md`: OKLCH-to-Linear-sRGB color spaces, theme tokens, typographic scale, HUD geometry.

## Team Mandate & Roles

- **[MATERIALS-ENGINEER]**: Responsible for `src/webgpu/shaders/crust_hydrosphere.wgsl` and `src/core/themes/ThemeManager.ts`. Implement physically-grounded medium simulation for all three themes:
  - **Cream Rag (Theme 1)**: Subtractive Kubelka-Munk intaglio ink absorption with capillary micro-bleed; high-frequency cellulose paper fiber tooth modulated by the `u_roughness` / tactile slider; Lehmann slope-angle hachuring where steep mountain faces receive technical line density proportional to slope angle.
  - **Prussian Cyanotype (Theme 2)**: 1842 John Herschel photochemical exposure model — unexposed areas (mountain ridges, coastlines, graticules) wash out to crisp ruling-pen chalk linework (`#E8EDF2`); exposed oceanic and lowland areas develop deep ferroprussiate indigo washes (`#162B42`); exposure intensity correlates with elevation inversion.
  - **Marie Tharp (Theme 0)**: Bruce Heezen & Marie Tharp physiographic pen-and-ink stippling on abyssal plains and rift valleys; stipple density modulated by bathymetric slope gradient; mid-ocean ridge crests rendered with concentrated hatching.
  - All medium effects must operate within the existing `u_theme` branching in the fragment shader. No new shader pipeline compilation or bind group changes on theme switch — only uniform buffer updates.

- **[CARTOGRAPHY-DESIGNER]**: Responsible for all React HUD overlay components. Enforce the cartographic layout invariants from `AGENTS.md` by remediating the following **9 known violations** identified during pre-flight audit:

  **Vertical Gutter Violations (left-column instrument stack):**
  1. **Cartouche-to-Aside Gap = 6px** (requires 20px): In `src/webgpu/WebGPUCanvas.tsx` line 1339 and `src/App.tsx` line 343. Cartouche top edge at `h - 92px`, Imhof NW Aside at `bottom-[98px]`. Fix: shift Aside to `bottom-[112px]` when Cartouche is visible.
  2. **Aside-to-Toast Gap ≈ 8px** (requires 20px): In `src/App.tsx` line 343 and `src/components/hud/DataLayerToastNotification.tsx` line 46. Fix: cascade the toast stack position upward to maintain 20px gutter from the shifted Aside.
  3. **Aside doesn't adapt when Cartouche is toggled off**: Aside stays at `bottom-[98px]` even when Cartouche is hidden. Should drop to `bottom-5` (20px from neatline) when `showCartouche` is false.

  **Corner Mark Collisions:**
  4. **`⌝ 90.00°` collides with header bar**: At `md:right-[26rem]`, the corner mark text overlaps the header bar's right end horizontally and has 2px vertical overlap. Corner marks must clear all floating panels dynamically.
  5. **`⌜ 00.00°` encroaches on header**: At `top-1 left-2`, the mark overlaps the header at `top-5 left-5` by 2px vertically.

  **Mobile / Responsive Violations:**
  6. **Header vs. sidebar collision below `md:`**: Header defaults to `right-5` on mobile, directly colliding with the `right-5 w-96` sidebar.
  7. **Right corner marks trapped under sidebar below `md:`**: `⌝ 90.00°` and `⌟ 270.00°` fall back to `right-2`, fully occluded by the 384px sidebar.

  **Utility Class & Edge Cases:**
  8. **Invalid `z-35` Tailwind class**: In `src/components/hud/DataLayerToastNotification.tsx` line 46. Tailwind v3 drops `z-35` silently. Fix: change to `z-[35]`.
  9. **Catalog-to-NavigationDock overlap on compact `2xl` (1536–1650px)**: Catalog sheet (`z-40`) extends down to 20px from bottom and overlaps the centered NavigationDock (`z-20`) by ~325px on narrow 2xl viewports.

- **[VERIFICATION-LEAD]**: Use Chrome DevTools MCP to perform live visual verification:
  - **Capture 3 (Cream Rag Intaglio Close-up)**: Close-up of alpine terrain showing paper fiber tooth texture and Lehmann hachuring on steep slopes.
  - **Capture 4 (Cyanotype Blueprint)**: Architectural view showing glowing chalk ruling-pen linework and coordinate graticules against ferroprussiate washes.
  - **Capture 5 (1-Frame Hot Switch)**: Confirm instantaneous medium switching between all three themes with zero shader recompilation lag or frame drops.
  - Report empirical FPS, console errors, and WGSL compilation status for each theme.

## Requirements

### R1. Physical Medium Simulation in WGSL Fragment Shader
- In `src/webgpu/shaders/crust_hydrosphere.wgsl`:
  - **Cream Rag**: Enhance the existing `hashPaper2D` cellulose fiber tooth with Lehmann slope-angle hachuring — technical line density increases with terrain slope angle (theta > 20°), using the existing `gradDir` and `strikeDir` vectors. Implement subtractive Kubelka-Munk ink absorption for watercolor depth glazes using the existing `evaluateKubelkaMunkReflectance` function.
  - **Prussian Cyanotype**: Implement photochemical exposure model — the fragment shader treats elevation as an exposure mask. High-altitude features remain "unexposed" (bright chalk), while oceanic depths and lowland valleys "develop" into deep ferroprussiate indigo. Graticule lines render as ruling-pen chalk against the developed substrate.
  - **Marie Tharp**: Extend the existing bathymetric fault hachuring (currently only in Theme 0 block at line ~948) into full physiographic stippling — procedural dot density modulated by bathymetric slope gradient on abyssal plains, with concentrated hatching along mid-ocean ridge transform faults.
  - All derivative evaluations (`fwidth`, `dpdx`, `dpdy`) must remain in unconditional uniform control flow at the top of `fs_main` (AGENTS.md Invariant #3).

### R2. Theme Manager Medium Properties
- In `src/core/themes/ThemeManager.ts`:
  - Add physical medium properties to the `ThemePalette` interface — `mediumProperties` object containing: `inkAbsorption` (0–1 Kubelka-Munk scattering coefficient), `fiberDensity` (paper tooth frequency multiplier), `exposureGamma` (cyanotype photochemical curve), `stippleDensity` (Tharp stipple frequency).
  - These properties are passed as uniforms to the shader and switch instantaneously when `setMode()` is called — no pipeline recompilation, no new bind groups.
  - Ensure `applyCSSVariables()` continues to update all CSS custom properties on theme switch for HUD consistency.

### R3. HUD Cartographic Layout Compliance (9 Known Violations)
- Remediate all 9 violations identified in the pre-flight audit (listed in the Team Mandate above):
  - Fix the 3 vertical gutter violations in the left-column instrument stack (Cartouche → Aside → Toast cascade)
  - Fix the 2 corner mark collision issues (dynamic clearing of header bar)
  - Fix the 2 mobile/responsive violations (header-sidebar collision, corner mark occlusion)
  - Fix the invalid `z-35` utility class
  - Address the catalog-to-NavigationDock overlap on compact 2xl viewports
- Preserve the existing compliant layout geometry: 10px neatline moats on all primary containers, 20px header-to-sidebar gutters, single-border enclosure contract.

### R4. TypeScript & WGSL Invariant Compliance
- `npx tsc --noEmit` passes with 0 errors.
- `npm test` (Vitest) passes with 0 regressions against the current test suite.
- Live WebGPU shader compilation succeeds in browser with zero WGSL uniform control flow rejections.
- Premultiplied alpha transparent clear value (`{ r: 0.0, g: 0.0, b: 0.0, a: 0.0 }`) preserved (AGENTS.md Invariant #5).

## Acceptance Criteria

### Build & Type Safety
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] `npm test` passes with 0 regressions.
- [ ] `npm run build` produces a clean production build.

### Visual Verification Gate 2 (via Chrome DevTools MCP)
- [ ] **Capture 3 (Cream Rag Intaglio)**: Close-up capture of alpine terrain showing visible paper fiber tooth modulation and Lehmann slope-dependent hachure lines on steep mountain faces. Slopes > 35° show noticeably denser technical hatching than gentle lowlands.
- [ ] **Capture 4 (Cyanotype Blueprint)**: Capture showing chalk-white ruling-pen coastlines and graticules against deep ferroprussiate indigo ocean washes. Mountain summits render as bright unexposed chalk; deep ocean basins show maximum Prussian blue development.
- [ ] **Capture 5 (Hot Switch Verification)**: Switching between all three themes (keyboard shortcut or UI control) produces zero frame drops, zero console errors, and zero shader recompilation events. FPS remains ≥ 60 during transition.

### Runtime Performance
- [ ] Sustained FPS ≥ 110 on Apple Silicon in Cream Rag theme at default viewport.
- [ ] Theme switching completes within 1 frame (< 8.3ms at 120 Hz) — uniform buffer update only, no pipeline rebuild.
- [ ] Zero `fwidth must only be called from uniform control flow` or similar WGSL compilation errors in browser console.

### HUD Layout Invariants (9 Violations Remediated)
- [ ] Cartouche-to-Aside vertical gap ≥ 20px (was 6px).
- [ ] Aside-to-Toast vertical gap ≥ 20px (was ~8px).
- [ ] Aside position adapts dynamically when Cartouche is toggled off (drops to `bottom-5`).
- [ ] Corner marks (`⌜ ⌝ ⌞ ⌟`) clear all floating panels at all breakpoints — no horizontal or vertical overlap with header bar.
- [ ] Header bar does not collide with sidebar below `md:` breakpoint.
- [ ] Right corner marks are not occluded by sidebar on mobile viewports.
- [ ] `z-35` replaced with `z-[35]` in DataLayerToastNotification.
- [ ] Catalog sheet does not overlap NavigationDock on 1536–1650px viewports, or overlap is handled gracefully (z-index + pointer-events).
- [ ] All pre-existing compliant geometry preserved: 10px moats, 20px header-sidebar gutters, single-border enclosure.

## 2026-09-08T20:42:39Z

# Teamwork Project Prompt

Requested team: Deploy three specialized agents with strict verification gates: [ATMOSPHERIC-ENGINEER], [DYNAMICS-ENGINEER], and [VERIFICATION-LEAD]

Execute STAGE 3 (Coupled System Dynamics) of the Indicatrix Engine Transformation: couple NOAA GFS horizontal wind velocities with the 3D DEM elevation gradient for orographic lift and condensation, and integrate the autonomous origami crane flight controller into the resulting terrain lift field.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Requirements

### R1. Orographic Wind Velocity & Topographic Condensation
In `src/webgpu/shaders/wind_particles.wgsl` and `src/webgpu/shaders/wind_ribbon_render.wgsl`, couple horizontal NOAA GFS wind velocity $\mathbf{u}_h = (u, v)$ with the 3D DEM elevation gradient $\nabla h = (\frac{\partial h}{\partial x}, \frac{\partial h}{\partial y})$ sampled from `u_demTexture`:
- Compute vertical orographic velocity $w = \mathbf{u}_h \cdot \nabla h$.
- Modulate particle altitude $z$ and streamline vertical deflection over mountain barriers (e.g., Alps, Andes, Himalayas).
- In `wind_ribbon_render.wgsl`, evaluate orographic condensation wash on windward slopes ($w > 0$) as subtle moisture glazes without altering the non-moralized drafting ink palette, maintaining uniform control flow for all derivatives.

### R2. Autonomous Origami Crane Orographic Lift Coupling
In `src/core/physics/OrigamiCraneFlightSolver.ts` and `src/webgpu/WebGPUEngine.ts`:
- Wire the elevation sampler and real-time wind field into `OrigamiCraneFlightSolver.step()` during the engine render loop.
- Modulate the crane's vertical variometer, altitude, and glide ratio based on local orographic vertical air motion $w = \mathbf{u}_h \cdot \nabla h$.
- Ensure terrain ground clearance enforcement ($\ge 80\text{m}$) prevents clipping into mountain meshes.
- Update HUD telemetry states in `DataLayersDrawer.tsx` / `UnifiedRightSidebar.tsx` to reflect positive variometer climb rates ($+3\text{ m/s}$ to $+5\text{ m/s}$) when crossing ridges.

### R3. WebGPU Pipeline Binding & Uniform Control Flow Invariants
- Bind `u_demTexture` and `u_demSampler` into `windComputeBindGroupLayout` / `windComputePipeline` in `WebGPUEngine.ts`.
- Adhere strictly to the WebGPU WGSL Uniform Control Flow invariant: all texture sampling and derivative evaluations must occur before dynamic branching or discards.
- Maintain the strict 5-core-buffer invariant on engine initialization, ensuring wind and crane buffers remain lazily allocated.

## Acceptance Criteria

### Atmospheric Orographic Dynamics
- [ ] `wind_particles.wgsl` samples `u_demTexture` and evaluates $w = \mathbf{u}_h \cdot \nabla h$ during RK2 advection.
- [ ] Streamline 3D coordinates reflect vertical displacement over elevated terrain barriers.
- [ ] `wind_ribbon_render.wgsl` renders orographic condensation washes under uniform control flow without driver-level compilation errors.

### Crane Flight Aerodynamics & Telemetry
- [ ] `OrigamiCraneFlightSolver.step()` receives active wind and elevation gradient data from the engine loop.
- [ ] Variometer telemetry measures positive climb ($+1.5$ to $+5.0\text{ m/s}$) when traversing windward mountain barriers (e.g., Andes at $-68.5^\circ\text{W}, -32.5^\circ\text{S}$).
- [ ] Crane maintains $\ge 80\text{m}$ clearance over mountain summits without terrain clipping.
- [ ] Vitest test suite passes with zero regressions (`npm test tests/phase5-wind-crane-physics.test.ts`).

### Verification Gate 3 (Visual & Performance)
- [ ] Chrome DevTools MCP captures Viewpoint 5 (Orographic Streamline Deflection over the Alps/Andes) into `screenshots/`.
- [ ] Console logs confirm zero WebGPU WGSL uniform control flow validation errors.
- [ ] WebGPU frame profiling confirms 120 FPS target with zero dropped frames.

## 2026-09-10T00:05:07Z

Build the "Alive Planet" atmosphere system for the Indicatrix Engine — a WebGPU cartographic manifold morpher. The engine already has: terrain (8K DEM), hydrosphere (Jerlov radiative transfer), wind ribbons (NOAA GFS surface + jet stream), vector boundaries, contour topology, origami crane, and 3 cartographic themes (Theme 0: Marie Tharp, Theme 1: Cream Rag, Theme 2: Prussian Cyanotype). This build adds **multi-altitude cloud shells** using real NOAA GFS data and **polishes the existing wind ribbon system** for contrast and altitude differentiation.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Critical Project Invariants

This project has **49 numbered invariants** documented in `AGENTS.md`. The following are load-bearing for this build:

- **Invariant §3 (WGSL Uniform Control Flow)**: All `fwidth()`, `dpdx()`, `dpdy()` calls MUST be evaluated at the top of `fs_main` in unconditional control flow, before any `if`, `discard`, or dynamic branching. Violation causes fatal GPU compilation errors.
- **Invariant §5 (Premultiplied Alpha Transparent Clear)**: The engine uses `alphaMode: 'premultiplied'`. All render passes MUST use `clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }`.
- **Invariant §10 (Horizon Tangent Attenuation)**: Surface-conforming geometry must evaluate facing (`n · v`) and smoothstep attenuate to zero before the horizon limb.
- **Invariant §15 (Cross-Pipeline DEM Mathematical Parity)**: Any new render pass conforming to the crust must use the identical geoid decoding formula: `elevMeters = demSample.a * 19772.0 - 10924.0`.
- **Invariant §20 (Core Buffer Discipline)**: New subsystems (cloud shells) must allocate lazily on first activation and cleanly destroy on `engine.dispose()`.
- **Invariant §24 (Zero-Recompile Theme Switching)**: Theme changes flow through uniform buffer updates only — no pipeline recreation. All per-theme cloud inks go through uniforms.
- **Invariant §28 (Exhaustive Multi-Medium Shader Parity)**: Every new shader MUST contain explicit branches for all 3 themes with period-accurate archival inks. No binary `if/else` fallthrough collapsing two themes.
- **Invariant §46 (Test Import Integrity)**: Tests must import from `src/` — no local reimplementations.

The full invariant list is in `AGENTS.md` at the project root. Read it before starting any work.

## Reference Documents

- `DESIGN_ETHOS.md`: The 16 core design principles, rendering identities, hydrosphere physics
- `design-language.md`: Color spaces (OKLCH to Linear sRGB), theme tokens, HUD geometry
- `AGENTS.md`: 49 numbered invariants — the authoritative constraint set

## Requirements

### R1. Multi-Altitude Cloud Layer (P0)

Three independent cloud shells rendered as spherical geometry at different altitude standoffs above the crust, each sampling real NOAA GFS cloud fraction data:

| Layer | GFS Variable | Altitude | Standoff |
|-------|-------------|----------|----------|
| Low (stratus/fog) | `LCDC` | ~1-2 km | R + 0.001 |
| Mid (altocumulus) | `MCDC` | ~4-6 km | R + 0.004 |
| High (cirrus) | `HCDC` | ~10-12 km | R + 0.008 |

Cloud shells must:
- Participate in the globe→map morph (`u_unfurl`), preserving altitude standoff as vertical offset above flattened terrain at α=1.0
- Drift independently via `u_cloudDrift` uniform (low clouds slower than high clouds — real atmospheric drift ratios)
- Render with altitude-dependent opacity (high cirrus 0.2–0.4, low stratus 0.5–0.8)
- Feather cloud fraction values below 20% to zero to prevent harsh grid-aligned edges from 0.25° GFS resolution
- Respect render pass ordering: Crust → Wind Ribbons → Cloud LOW → Cloud MID → Cloud HIGH
- Be individually toggleable via HUD controls

### R2. GFS Cloud Data Pipeline

Extend the existing NOAA GFS fetch pipeline (`scripts/fetch-real-gfs.py` and `scripts/fetch-or-generate-gfs-wind.ts`) to also fetch `LCDC`, `MCDC`, and `HCDC` cloud cover percentage grids from the same NOMADS GRIB filter endpoint. The pipeline already handles 0.25° grids (1440×721) — cloud data uses the same resolution. Include a procedural fallback generator (same pattern as `fetch-or-generate-gfs-wind.ts`) that produces realistic cloud fraction patterns when NOAA is unavailable.

### R3. Wind Ribbon Visual Polish (P0.5)

Fix three issues in the existing wind ribbon system:

**3a. Theme-aware contrast colors**: Replace the current surface wind colors for Theme 1 (Cream Rag) and Theme 2 (Cyanotype) that disappear against their respective terrain palettes:
- Cream Rag: Warm sienna-copper wind filaments (visible against both cream paper and dark terrain features)
- Cyanotype: Bright actinic white or warm amber contrast against the cool blue field
- Reference: `wind_ribbon_render.wgsl` lines 229–252

**3b. Jet stream altitude differentiation**: Jet stream ribbons should render at a visible altitude standoff above the surface (between mid and high cloud shells, where jet streams physically exist at ~10 km), reinforcing the layered atmosphere concept from oblique viewing angles.

**3c. Layer ordering with clouds**: Wind ribbons render below the lowest cloud shell. Surface winds peek through cloud gaps naturally. Default HUD state shows one at a time, but both simultaneously must be possible.

### R4. Per-Theme Cloud Inking

All three cloud shells must render in theme-appropriate archival inks, driven entirely through uniform buffers (Invariant §24):

| Theme | Cloud Appearance |
|-------|------------------|
| Theme 0 (Marie Tharp 1977) | Soft warm white, semi-transparent, subtle cast shadows |
| Theme 1 (Cream Rag) | Warm ivory watercolor washes, absorbed into paper tooth texture |
| Theme 2 (Prussian Cyanotype 1842) | Actinic white wisps against prussian blue, photochemical exposure |

### R5. HUD Integration

Add cloud layer controls to the existing HUD sidebar that follow the established cartographic instrument design language:
- Master cloud toggle (all layers on/off)
- Per-altitude layer toggles (Low / Mid / High)
- Cloud drift speed slider
- Controls must follow the 20px grid axis and 10px moat conventions documented in AGENTS.md §2

## Acceptance Criteria

### Build & Type Safety
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` (Vite production build) completes successfully
- [ ] `npm test` (Vitest) — all existing tests pass, no regressions

### WGSL Shader Integrity
- [ ] `node scripts/lint-wgsl-control-flow.mjs` passes — all derivatives in unconditional control flow (Invariant §3)
- [ ] New `cloud_shell.wgsl` shader contains explicit branches for all 3 themes (Invariant §28) — no binary if/else fallthrough
- [ ] Cloud shell shader uses premultiplied alpha blend (Invariant §5)
- [ ] Horizon tangent attenuation prevents cloud geometry from protruding beyond the planetary silhouette (Invariant §10)

### Data Pipeline
- [ ] Cloud fetch script successfully downloads LCDC, MCDC, HCDC from NOAA NOMADS when available
- [ ] Procedural fallback generates 3 cloud fraction binary files (same format as wind data) when NOAA is unavailable
- [ ] Binary files are correctly sized for 0.25° grid: 1440 × 721 × 1 component × 2 bytes = 2,076,480 bytes each

### Visual Verification (Live Browser via Chrome DevTools MCP)
- [ ] Globe view: Three cloud layers composite into one realistic cloud image from overhead
- [ ] Oblique view: Visible depth parallax between low, mid, and high cloud shells
- [ ] Theme 0: Marine indigo terrain visible through cloud gaps, warm white clouds
- [ ] Theme 1: Cream paper substrate visible, ivory watercolor cloud washes
- [ ] Theme 2: Prussian blue terrain, actinic white cloud wisps
- [ ] Wind ribbons: Cream Rag surface winds visible as warm sienna-copper filaments against terrain
- [ ] Wind ribbons: Cyanotype surface winds clearly visible against blue terrain
- [ ] Jet stream ribbons render at visible altitude standoff (between mid and high cloud shells)
- [ ] Cloud shells morph correctly during globe→map unfurl (clouds separate into visible layers at α≈0.5)
- [ ] Theme hot-switch (all 3 themes) completes in < 1 frame (< 8.3ms at 120 Hz) with zero console errors

### Performance
- [ ] 120 FPS sustained with all 3 cloud shells active (Apple Silicon M4 Pro target)
- [ ] No pipeline recompilation during theme switching (Invariant §24 — uniform buffer updates only)

### Engine Integration
- [ ] Cloud buffers allocate lazily via `ensureCloudBuffers()` pattern (Invariant §20)
- [ ] `engine.dispose()` cleanly destroys all cloud GPU resources with zero VRAM leaks
- [ ] Cloud shell DEM decoding formula matches crust exactly: `elevMeters = demSample.a * 19772.0 - 10924.0` (Invariant §15)

## 2026-09-10T22:37:52Z

<USER_REQUEST>
Execute the First-Principles Atmospheric & Topographic Coupling implementation unifying the Indicatrix Engine's 11 strata into a 3-Domain Physical Continuum (Geosphere → Troposphere → Exosphere), eliminating flat 2D cloud decals with dynamic ground shadows, introducing horizontal topographic wind deflection, decoupling tri-strata cloud shells with an Atmosphere Drawer scale slider (1.0x to 12.0x), and verifying live on Apple Silicon Metal-3 GPU.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

## Authoritative Specifications & Invariants
- `docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md`
- `docs/horizon_strata_cutaway.jpg`
- Invariant §3: WGSL Unconditional Derivative Evaluation (`fwidth`, `dpdx`, `dpdy` strictly evaluated at top of `fs_main` in uniform control flow)
- Invariant §5: WebGPU Canvas Premultiplied Alpha Transparent Clear (`clearValue: { r:0, g:0, b:0, a:0 }`)
- Invariant §10: Zero-Standoff Surface Conformance & Horizon Tangent Attenuation (`smoothstep(0.02, 0.20, in.facing)`)
- Invariant §12: 4 Canonical Benchmark Viewpoints (Limb Horizon, Alpine Basin, Planar Unroll, Medium Shift)
- Invariant §13: Sequential Staged Gating (Milestones 1 → 2 → 3 → 4; no monolithic convergence)
- Invariant §14: Hardware Depth Bias for Coplanar Cartography (`depthBias: -120`, `depthBiasSlopeScale: -1.0`)
- Invariant §15: Cross-Pipeline DEM Mathematical Parity (`elevMeters = demSample.a * 19772.0 - 10924.0`)
- Invariant §17: Independent Victory Auditor Contract (Independent test execution & MCP browser verification)
- Invariant §20: 16-Byte WGSL Struct Alignment & Uniform Float Packing
- Invariant §28: Exhaustive Multi-Medium Shader Parity (Theme 0 Tharp, Theme 1 Cream Rag, Theme 2 Cyanotype)
- Invariant §48: Dynamic Dimensions (Zero Hardcoded Numeric Literals in DEM and texture handling)

---

## Requirements

### R1. Pre-Flight Hygiene & Dynamic Cloud Ground Shadows (Milestone 1)
- Resolve DEM Guard hardcoded literals in `src/webgpu/WebGPUEngine.ts` (lines 273, 274, 1414, 1782, 2891) by dynamically reading texture dimensions and falling back cleanly to constant symbols.
- Bind `u_cloudTexture` and `u_cloudSampler` into `crust_hydrosphere.wgsl`.
- Compute physical shadow UV offsets based on key light sun azimuth ($\phi_{\text{sun}} = 315.0^\circ$) and sun altitude ($\theta_{\text{sun}} = 45.0^\circ$):
  $$\Delta u = -\frac{z_{\text{cloud}}}{\tan(\theta_{\text{sun}}) \cdot 2\pi R_E} \cos(\phi_{\text{sun}}), \quad \Delta v = \frac{z_{\text{cloud}}}{\tan(\theta_{\text{sun}}) \cdot \pi R_E} \sin(\phi_{\text{sun}})$$
- Implement soft ground shadow attenuation using 4-tap jittered sampling with ~20km penumbra:
  $$\text{shadowFactor} = 1.0 - u\_shadowIntensity \cdot \text{smoothstep}(0.10, 0.35, \text{cloudDens})$$
- Modulate direct diffuse terrain and ocean lighting by `shadowFactor`, ensuring realistic mountain ridge and maritime shadow casting.

### R2. Topographic Barrier Wind Deflection (Milestone 2)
- In `src/webgpu/shaders/wind_particles.wgsl:sampleVelocity`, evaluate the local DEM elevation gradient $\nabla h = (\partial h/\partial x, \partial h/\partial y)$ using spherical metric tensor differences.
- Compute normalized slope normal $\hat{\mathbf{n}}_{\text{slope}} = \nabla h / \sqrt{\|\nabla h\|^2 + \epsilon}$.
- Decompose horizontal wind velocity $\mathbf{u}$ and apply fluid deflection against upslope barriers:
  $$d = \mathbf{u} \cdot \hat{\mathbf{n}}_{\text{slope}}$$
  $$\mathbf{u}_{\text{deflected}} = \mathbf{u} - 0.75 \cdot d \cdot \hat{\mathbf{n}}_{\text{slope}} \quad (\text{if } d > 0)$$
- Conserve kinetic energy by scaling $\|\mathbf{u}_{\text{deflected}}\| = \|\mathbf{u}_{\text{raw}}\|$.
- Ensure wind streamlines smoothly steer around Alpine massifs and barrier ridges into adjacent lowlands (e.g. Po Valley) without artificial divergence or stalling.

### R3. Pitch-Adaptive Cloud Shell Separation & Rain Shadows (Milestone 3)
- In `src/webgpu/shaders/cloud_shell.wgsl`, implement the 256-byte uniform struct with 16-byte alignment, including `u_atmosphericScale` $[1.0 .. 12.0]$ and `u_shadowIntensity` $[0.0 .. 0.60]$.
- Implement pitch-adaptive standoff exaggeration:
  $$k_{\text{exagg}} = 1.0 + (u\_atmosphericScale - 1.0) \cdot \left(1.0 - \text{clamp}\left(\frac{\mathbf{n} \cdot \mathbf{v}_{\text{cam}}}{0.35}, 0.0, 1.0\right)\right)^2$$
- Separate Low (0.0010), Mid (0.0040), and High (0.0080) cloud decks along the horizon limb as camera pitch approaches oblique angles (pitch $> 70^\circ$).
- Couple cloud density to orographic lift: enhance windward condensation and create distinct leeward rain shadow thinning.

### R4. Atmosphere Drawer Controls & Horizon Cross-Section Preset (Milestone 4)
- In `UnifiedRightSidebar.tsx` and `AtmosphereDrawer`, add the "Atmospheric Scale" slider ($1.0\times$ to $12.0\times$, step $0.1$, default $1.0\times$) coupled dynamically to `u_atmosphericScale`.
- Add a 1-click "Horizon Cross-Section" camera preset button (Pitch $78.0^\circ$, oblique limb view, altitude configured to highlight separated cloud decks and Jet Stream).
- Ensure smooth animated transition when selecting the preset.

### R5. Independent Multi-Medium Verification Gate on Apple Silicon Metal-3 GPU
- Verify compilation with `npx tsc --noEmit` and run test suite with `npm test`.
- Verify runtime WebGPU adapter on Apple Silicon Metal-3:
  $$\text{adapter.info.architecture} === \text{'metal-3'}$$
- Capture all 3 mandatory visual checkpoints:
  1. `screenshots/capture-horizon-limb-strata.png` (Pitch $78^\circ$, showing distinct Low/Mid/High shells separated above terrain).
  2. `screenshots/capture-alpine-wind-deflection.png` (Alps $3.5\times$ zoom, showing wind particles steering around mountain massifs).
  3. `screenshots/capture-cloud-shadow-terrain.png` (Oblique ridge view, showing dynamic cloud ground shadows conforming to topography).
- Multi-Medium Parity: Verify identical physical behavior and medium-appropriate ink rendering across Theme 0 (Marie Tharp 1977), Theme 1 (Cream Rag), and Theme 2 (Prussian Cyanotype 1842) at 120 FPS sustained with zero console warnings.

---

## Acceptance Criteria

### Milestone 1: Pre-Flight Hygiene & Dynamic Cloud Ground Shadows
- [ ] No hardcoded DEM dimensions at `WebGPUEngine.ts:273, 274, 1414, 1782, 2891` (verified by DEM Guard check).
- [ ] `u_cloudTexture` correctly bound in `crust_hydrosphere.wgsl` and sampled with Sun Azimuth $315^\circ$ / Altitude $45^\circ$ UV offset.
- [ ] Direct diffuse terrain/ocean lighting modulated by `shadowFactor`, producing clearly visible soft shadows under clouds on terrain and ocean.
- [ ] Live Metal-3 DevTools MCP screenshot captured to `screenshots/capture-cloud-shadow-terrain.png`.

### Milestone 2: Topographic Barrier Wind Deflection
- [ ] `wind_particles.wgsl:sampleVelocity` computes DEM gradient and deflects upslope flow with $0.75$ barrier deflection factor.
- [ ] Kinetic velocity magnitude $\|\mathbf{u}\|$ conserved across all deflection steps.
- [ ] Wind particles steer tangentially around mountain ridges rather than flowing directly over peaks regardless of elevation barrier.
- [ ] Live Metal-3 DevTools MCP screenshot captured to `screenshots/capture-alpine-wind-deflection.png`.

### Milestone 3: Pitch-Adaptive Cloud Shell Separation & Rain Shadows
- [ ] `cloud_shell.wgsl` 256-byte uniform buffer matches TypeScript byte offsets with strict 16-byte alignment.
- [ ] Dynamic $k_{\text{exagg}} formula expands cloud deck standoffs when viewing the planetary limb (pitch $> 70^\circ$).
- [ ] Low, Mid, and High cloud strata visually decouple into 3 distinct layered shells above the crust at high pitch angles.
- [ ] Orographic lift modulation produces visible leeward rain shadows downwind of mountain ranges.
- [ ] Live Metal-3 DevTools MCP screenshot captured to `screenshots/capture-horizon-limb-strata.png`.

### Milestone 4: UI Drawer Controls, Horizon Preset & Multi-Medium Verification
- [ ] "Atmospheric Scale" slider ($1.0\times$ to $12.0\times$) added to Atmosphere Drawer and updates WebGPU uniform in real time with 0 pipeline recompiles.
- [ ] "Horizon Cross-Section" camera preset navigates camera to Pitch $78^\circ$ oblique limb view.
- [ ] All 3 visual captures present in `screenshots/`.
- [ ] `npx tsc --noEmit` and `npm test` pass with 0 errors.
- [ ] Live Chrome DevTools console reports 0 WebGPU warnings/errors and confirms `architecture === 'metal-3'`.
- [ ] Parity verified across Marie Tharp, Cream Rag, and Cyanotype themes at 120 FPS.

</USER_REQUEST>

## 2026-09-12T01:17:08Z

<USER_REQUEST>
Build the complete Google DeepMind WeatherNext 3 data ingestion pipeline for the Indicatrix Engine, spanning requester-pays GCS Zarr v3 extraction, Float16 binary tiling, TypeScript data source with 3-slot ring buffering, and DataLayerCatalog integration.

Working directory: `/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map`
Integrity mode: development

## Requirements

### R1. Python WeatherNext 3 Extraction & Staging CLI (`scripts/fetch-weathernext3.py`)
- Authenticate against Google Cloud using Application Default Credentials (ADC), respecting `~/.zshenv` environment variables (`GOOGLE_APPLICATION_CREDENTIALS`, `CLOUDSDK_CORE_PROJECT`).
- Access the requester-pays GCS bucket:
  `gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/2026_to_present/`
  with billing project `antigravity-agent-1765655548` (specifying `userProject` parameter).
- Query available prediction cycles and automatically select the latest initialized forecast run.
- Extract 48 hourly timesteps ($t = 0\text{h}$ to $t = +47\text{h}$) across 6 core meteorological prognostic fields:
  1. `u_component_of_wind_10m_mean` (10m eastward wind velocity)
  2. `v_component_of_wind_10m_mean` (10m northward wind velocity)
  3. `total_precipitation_1hr_mean` (accumulated precipitation rate)
  4. `temperature_2m_mean` (2m ambient surface temperature)
  5. `dewpoint_temperature_2m_mean` (2m surface dewpoint temperature)
  6. `total_cloud_cover_mean` (column-integrated cloud fraction)
- Decode Zarr v3 compressed chunks (shape `[1, 1801, 3600]` representing $0.1^\circ$ global pole-to-pole grid), downcast Float32 $\to$ Float16 (`np.float16`).
- Export binary slices to `public/data/weathernext/[variable]-[hour].bin` (padded or compatible with WebGPU 256-byte row pitch contracts).
- Generate metadata index `public/data/weathernext/meta.json` recording forecast initialization timestamp, variable list, valid prediction hours, and grid dimensions (`3600x1801`).
- Provide local caching: bypass downloading if binary files and matching cycle metadata already exist.
- Implement `--dry-run` flag to authenticate, verify bucket connectivity, list available forecast runs, and calculate download bandwidth without fetching tensor chunks.
- Support execution via `uv run --with zarr --with gcsfs --with numpy python scripts/fetch-weathernext3.py`.

### R2. TypeScript WeatherNext Data Source & 3-Slot Ring Buffer (`src/core/data/WeatherNextDataSource.ts`)
- Implement an asynchronous TypeScript data source loader reading metadata from `public/data/weathernext/meta.json` and on-demand Float16 slices from `public/data/weathernext/[variable]-[hour].bin`.
- Expose `getSlice(variable: string, hour: number): Promise<ArrayBuffer>` with in-memory caching to avoid redundant HTTP requests.
- Integrate directly with `TemporalTextureRingBuffer` (`src/webgpu/TemporalTextureRingBuffer.ts`) for GPU texture staging and streaming.
- Implement 3-slot sliding-window buffer lifecycle:
  - Logical Slot 0 ($t_k$): Base hour slice.
  - Logical Slot 1 ($t_{k+1}$): Next hour slice.
  - Logical Slot 2 ($t_{k+2}$): Asynchronous background prefetch staging.
- Provide clean advance/rotation logic on hourly step transitions via `TemporalTextureRingBuffer.advance()`.

### R3. Cartographic Catalog & Atmosphere Deck Integration (`src/core/data/DataLayerCatalog.ts` & `AtmosphereDrawer.tsx`)
- Register `google-weathernext3` preset in `DATA_LAYER_CATALOG` (`src/core/data/DataLayerCatalog.ts` and `src/core/layers/DataLayerCatalog.ts`):
  - Category: `field` / `atmospheric-clouds`.
  - Resolution tag: `0.1° (10km) AI`.
  - Source attribution: `Google DeepMind WeatherNext 3`.
- Wire model backend selector in `src/components/AtmosphereDrawer.tsx` allowing user to switch prognostic model input between NOAA GFS ($0.25^\circ$) and DeepMind WeatherNext 3 ($0.1^\circ$).
- Connect time scrubber callbacks (`TimelineScrubberState.bracketHour` and `TimelineScrubberState.tau`) to drive WeatherNext slice staging and interpolation factor.

## Acceptance Criteria

### Stage 1 Gate: GCS Ingestion CLI
- [ ] `uv run --with zarr --with gcsfs --with numpy python scripts/fetch-weathernext3.py --dry-run` executes with exit code 0 and lists recent forecast cycles from `gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/2026_to_present/`.
- [ ] Dry-run prints forecast init timestamp, variable manifest, and expected byte footprint without throwing GCS authentication or billing errors.

### Stage 2 Gate: TypeScript Data Source & WebGPU Ring Buffer
- [ ] `src/core/data/WeatherNextDataSource.ts` cleanly exports `WeatherNextDataSource` class.
- [ ] Unit tests in `tests/` verify `WeatherNextDataSource` loads `meta.json`, decodes binary slice buffers, and uploads to `TemporalTextureRingBuffer` with 256-byte row pitch compliance.
- [ ] `npx tsc --noEmit` and `npm run build` pass with 0 errors.

### Stage 3 Gate: Catalog Integration & UI Selector
- [ ] `DATA_LAYER_CATALOG` includes the `google-weathernext3` entry with correct cartographic legend and attribution.
- [ ] `AtmosphereDrawer.tsx` exposes model backend selector allowing toggle between GFS and WeatherNext.
- [ ] Full automated test suite (`npm test`) passes with 0 failures across all 158+ test files.

</USER_REQUEST>

## 2026-09-12T12:38:03Z

<USER_REQUEST>
Upgrade the Indicatrix Engine's vector coastline linework using Overture Maps GeoParquet via DuckDB, and add 2 new high-resolution regional DEM insets (Grand Canyon and Mount Fuji) with UI preset integration and multi-medium verification.

Working directory: `/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map`
Integrity mode: development

Execute this project in strictly gated sequential stages (per AGENTS.md Invariant #13). Progression to Stage 2 is blocked until Stage 1 passes Gate 1.
Keep progress reported regularly.
Deliverable requirement: At completion, produce an explicit summary and a specific follow-up prompt that the user can run for any remaining work, remediation, or otherwise.

---

## Requirements

### R1. Overture Maps GeoParquet Vector Extraction & Binary Repackaging (Stage 1)
- Install `duckdb-async` with spatial extension.
- Query Overture Maps v1.18.0 GeoParquet directly from S3 (`s3://overturemaps-us-west-2/release/2024-*/theme=base/type=water/*` or latest stable release) in `scripts/precompute-overture-vectors.ts`.
- Extract coastline/shoreline geometries and apply Douglas-Peucker simplification to fit within the $\le 42.0$ MB size budget (target ~35–42 MB).
- Match the existing `geo-vectors.bin` binary layout exactly:
  - 32-byte header: Magic `0x47564543` (`GVEC`), version 1, vertex count, index count, 16 zero-padded reserved bytes.
  - Columnar payload: `positions3D` (Float32 x3), `target2D` (Float32 x2), `dymaxion2D` (Float32 x2), `vType` (Float32 x1), and `indices` (Uint32 x2).
- Ensure drop-in binary compatibility with zero changes required to WebGPU vector ribbon shaders or loading logic.

### R2. Additional Regional DEM Insets: Grand Canyon & Mount Fuji (Stage 2)
- Extend `scripts/precompute-regional-dem.py` to ingest and process elevation data for two new regions:
  1. **Grand Canyon**: bounds approx -112.5°W to -111.5°W, 35.9°N to 36.5°N, sourced from USGS 3DEP (1/3 arc-second ~10m or 1 arc-second ~30m).
  2. **Mount Fuji**: bounds approx 138.5°E to 139.0°E, 35.2°N to 35.5°N, sourced from Copernicus GLO-30 / AW3D30.
- Match existing preprocessing and packaging:
  - Sample against the local ETOPO 2022 global DEM base for seamless boundary feathering.
  - Pack into 4-channel `rgba16unorm` binary textures (`public/regional/dem-grand-canyon-30m.bin` and `public/regional/dem-fuji-30m.bin`) targeting ~3–4 MB each.
  - Generate companion lossless WebP fallbacks (`dem-grand-canyon-30m.webp`, `dem-fuji-30m.webp`).
- Update `public/regional/manifest.json` with the new region entries (bounds, dimensions, elevation ranges, asset paths).

### R3. Regional DEM Preset UI Integration (Stage 2)
- Update the regional preset selection list in `src/components/hud/UnifiedRightSidebar.tsx` (and camera waypoint controllers if applicable) to add Grand Canyon and Mount Fuji alongside Hawaii and Cape Cod.
- Ensure fly-to navigation or manual camera panning to the new regions activates the high-resolution DEM overlay and applies 0.5° smoothstep boundary feathering without seam artifacts.

### R4. Controlled Infrastructure & Verification (Victory Gate)
- Allow public S3 and elevation API access for fetching Overture GeoParquet and DEM tiles.
- Verify binary compliance and web runtime health using an independent victory audit before completion.
- Formulate a precise, actionable follow-up prompt for any residual remediation or next-phase enhancements.

---

## Acceptance Criteria

### Gate 1: Vector Line Integrity (Stage 1)
- [ ] `scripts/precompute-overture-vectors.ts` executes and generates `public/geo-vectors.bin`.
- [ ] `public/geo-vectors.bin` size is $\le 42.0$ MB and $\ge 35.0$ MB.
- [ ] `node scripts/verify-geo-vectors-challenger.mjs` executes and passes 100% of checks (Header magic, byte layout, vertex/index counts, finite non-NaN coordinates, Dymaxion/Mercator cut bounds).

### Gate 2: Regional DEM Artifacts & Types (Stage 2)
- [ ] `public/regional/dem-grand-canyon-30m.bin` and `public/regional/dem-fuji-30m.bin` exist and are ~3–4 MB each.
- [ ] Companion WebP fallback files exist in `public/regional/`.
- [ ] `public/regional/manifest.json` is valid JSON containing all 4 regions (`hawaii`, `capecod`, `grand-canyon`, `fuji`).
- [ ] `npx tsc --noEmit` and `npm run build` pass with 0 errors.

### Gate 3: Live System Verification & Victory Audit
- [ ] An independent auditor verifies both new DEM regions load in the browser without uncaptured WebGPU errors, WGSL errors, or 404 network requests.
- [ ] Live Chrome DevTools MCP verification confirms clean relief shading over Grand Canyon and Mount Fuji across themes.
- [ ] Explicit follow-up prompt for subsequent tasks or remediation provided in final report.
</USER_REQUEST>


## 2026-09-13T17:18:28Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Sentinel & Pipeline Lead, Compute & Shader Specialist, Camera & Telemetry Specialist, Independent Victory Auditor

Transform the Indicatrix Engine's cloud subsystem from 2D concentric geometric shells into a true-depth volumetric tropospheric raymarcher rendering stratified cloud layers, valley inversions, and mountain peaks piercing cloud decks, driven by Google DeepMind WeatherNext 3 prognostic data (0.1° resolution) and verified against canonical litmus locations.

Working directory: /Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map
Integrity mode: development

---

## Architectural & Mathematical Invariants

1. **WebGPU Depth Buffer Format & Binding Contract**:
   - WebGPU forbids `GPUTextureUsage.TEXTURE_BINDING` on `depth24plus`.
   - Update `this.depthTexture` in `src/webgpu/WebGPUEngine.ts` to `format: 'depth32float'` with `usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING`.
   - Synchronize all Pass 1 pipeline descriptors (`crust`, `ribbons`, `lines`, `contours`, `crane`) to `depthStencil: { format: 'depth32float', ... }` to prevent WebGPU pipeline validation mismatches.
   - Pass 1 (`mainRenderPass`) must preserve `depthStencilAttachment.depthStoreOp: 'store'` so the depth buffer remains valid in GPU VRAM for subsequent passes.

2. **Camera Descent Floor & Dynamic Near-Plane Unlocking**:
   - In `src/webgpu/WebGPUCanvas.tsx:1526`, replace the hardcoded orbit radius clamp (`radius >= 5.08`, 101.9 km altitude) with a terrain-coupled ground clearance safety floor: $h_{\text{floor}} = 5.0 + h_{\text{DEM}} + 0.0001$ (~127m AGL floor).
   - In `src/webgpu/WebGPUCanvas.tsx:284`, dynamically modulate `camera.near` with camera altitude (from 0.1 at orbital altitude down to 0.00005 [~63m] in the troposphere) to prevent near-plane planetary crust clipping while preserving 32-bit logarithmic depth precision.

3. **Multi-Pass Render Sequence & Buffer Discipline**:
   - **Pass 1 (`mainRenderPass`)**: Crust, ocean, terrain relief, vector lines, and crane render to swapchain texture + `depth32float` depth attachment (`loadOp: 'clear'`, `storeOp: 'store'`, `depthStoreOp: 'store'`).
   - **Pass 2 (`volumetricCloudPass`)**: Dedicated render pass with color `loadOp: 'load'` (blending into Pass 1 pixels), binding `depth32float` as `texture_depth_2d` and `sampler` (or explicit `textureLoad`). Raymarches the tropospheric interval $[t_{\text{start}}, \min(t_{\text{exit}}, t_{\text{terrain}})]$.
   - **Pass 3 (`overlayPass`)**: Vector labels, neatlines, verniers, and UI overlays.
   - Maintain Invariant §20: 16-byte WGSL struct alignment for any expanded or new uniform buffers; zero dynamic reallocation during frame execution.

4. **Existing Ground Shadows Preservation**:
   - Do NOT rewrite ground shadows. `src/webgpu/shaders/crust_hydrosphere.wgsl:695-752` already implements dynamic 4-tap Poisson disk ground shadows. Hook integrated volumetric cloud density directly into this existing pass.

5. **WeatherNext 3 Multi-Layer Ingestion & Psychrometric Coupling**:
   - Hourly slices are staged in `public/data/weathernext/`: `low_cloud_cover_mean-{0..11}.bin`, `medium_cloud_cover_mean-{0..11}.bin`, `high_cloud_cover_mean-{0..11}.bin` (3600×1801 Float16 with 256-byte row pitch padding).
   - Update `src/core/data/WeatherNextDataSource.ts` to stream and expose all three discrete cloud cover layers into the 3-slot WebGPU texture ring buffer.
   - Couple base cloud height to surface psychrometrics via lifting condensation level ($h_{\text{base}} = 125.0 \cdot (T_{2\text{m}} - T_{d,2\text{m}})$).

6. **3D Micro-Noise Volume Synthesis**:
   - Author `src/webgpu/shaders/cloud_noise_compute.wgsl` synthesizing a $128 \times 128 \times 128$ `rgba8unorm` 3D texture in GPU memory on engine boot (<8ms, 0 MB download).
   - Red channel: low-frequency billowy Perlin-Worley. Green, Blue, Alpha channels: 3 octaves of high-frequency Worley erosion.

7. **WGSL Uniform Control Flow & Explicit LOD Invariant (Invariant §3)**:
   - In `volumetric_cloud.wgsl`, all texture lookups must strictly obey WebGPU uniform control flow: use `textureSampleLevel(..., 0.0)` or `textureLoad(depthTexture, coord, 0)` to guarantee zero fatal driver-level gradient compilation errors.

8. **Multi-Medium Historical Inking Parity (Invariant §24 & §28)**:
   - Uniform-buffer-driven dynamic switching across all 3 active mediums without pipeline recompilation:
     - Theme 0 (Marie Tharp 1977): Warm white billows with lithographic physiographic stippling.
     - Theme 1 (Cream Rag): Absorbent cotton paper wash modulated by `u_paper_tooth`.
     - Theme 2 (Prussian Cyanotype 1842): Actinic solarized blueprint highlights with Prussian cyan shadows.

---

## Sub-Agent Team Structure & Staged Execution

- **Sentinel & Pipeline Lead**: Manages depth pass format alignment (`depth32float`), render pass sequencing (Pass 1 $\to$ Pass 2 $\to$ Pass 3), 16-byte uniform packing, and invariant enforcement.
- **Compute & Shader Specialist**: Authors `cloud_noise_compute.wgsl` and `volumetric_cloud.wgsl` (dual-lobe Henyey-Greenstein phase function $g_1 = 0.82, g_2 = -0.25$, 1-tap sun crevice shadowing, Invariant §3 uniform control flow).
- **Camera & Telemetry Specialist**: Manages camera clearance envelope ($h_{\text{floor}}$), dynamic near-plane modulation in `WebGPUCanvas.tsx`, and canonical HUD bookmarks (Mount Rainier and Haleakala).
- **Independent Victory Auditor**: Executes clean-context Phase A/B/C verification (Invariant §17), runs test suites, and confirms exact benchmark image counts in `screenshots/` (Invariant §27).

---

## Sequential Gated Milestones & Verification Checkpoints (Invariant §13)

### Milestone 1: Camera Unlock & Depth Pipeline Alignment
- Reconfigure `this.depthTexture` to `depth32float` (`RENDER_ATTACHMENT | TEXTURE_BINDING`).
- Align all Pass 1 depthStencil states (`crust`, `ribbons`, `lines`, `contours`, `crane`).
- Relax `WebGPUCanvas.tsx` orbit radius clamp to terrain-following floor ($5.0 + h_{\text{DEM}} + 0.0001$).
- Dynamically modulate `camera.near` with altitude ($0.1 \to 0.00005$).
- **Milestone 1 Verification**: Boot dev server; navigate Chrome DevTools MCP at Puget Sound. Verify smooth descent from orbit down to $\le 4,000\text{m}$ without geometry clipping or depth rejections. Save capture to `screenshots/m1_camera_descent.png`.

### Milestone 2: 3D Perlin-Worley Compute Generator
- Author `cloud_noise_compute.wgsl` and allocate 3D `GPUTexture` (`dimension: '3d'`).
- Dispatch single compute pass on engine boot.
- **Milestone 2 Verification**: Browser verification of the generated 3D volume noise slices. Confirm billow base and erosion octaves without GPU stalls. Save capture to `screenshots/m2_noise_volume.png`.

### Milestone 3: Volumetric Raymarch Pass & Depth Occlusion
- Author `volumetric_cloud.wgsl` and integrate Pass 2 into `WebGPUEngine.ts`.
- Reconstruct world position from `texture_depth_2d` and inverse view-projection matrix $\mathbf{M}_{\text{inv}} = (P \cdot V)^{-1}$.
- Clamp raymarch distance to $t_{\text{terrain}}$ and integrate optical depth using Beer-Lambert law ($T = \exp(-\sigma_t \Delta s)$).
- Stream multi-layer WeatherNext 3 cloud data (`low`, `medium`, `high`) and couple base height to LCL psychrometrics.
- Hook volumetric cloud density into existing 4-tap Poisson ground shadows in `crust_hydrosphere.wgsl`.
- **Milestone 3 Verification**: Jump camera to **Mount Rainier Bookmark** ($46.8529^\circ\text{N}, 121.7604^\circ\text{W}$, altitude $3,800\text{m}$). Verify Puget Sound marine stratus fills the basin while Rainier's $4,392\text{m}$ glaciated peak cleanly pierces into sunlight without depth artifacts. Save capture to `screenshots/m3_rainier_inversion.png`.

### Milestone 4: Dual-Phase Optical Scattering & Archival Inking
- Implement dual-lobe Henyey-Greenstein phase function ($g_1 = 0.82, g_2 = -0.25$) for forward Mie "silver lining" glare.
- Implement 1-tap sun raymarch for self-shadowed crevices.
- Implement period-accurate inking across all 3 themes (Marie Tharp, Cream Rag, Prussian Cyanotype) via uniform buffer updates with zero shader recompilations (Invariant §24 & §28).
- **Milestone 4 Verification**: Jump camera to **Haleakala Sunset Bookmark** ($20.7097^\circ\text{N}, 156.2533^\circ\text{W}$, altitude $3,100\text{m}$, sun altitude $+7.5^\circ$). Verify golden rim-lighting on cloud billows with indigo diffuse shadows across all 3 themes. Save captures to `screenshots/m4_haleakala_tharp.png`, `screenshots/m4_haleakala_cream.png`, `screenshots/m4_haleakala_cyanotype.png`.

---

## Acceptance Criteria

### Depth Pipeline & Camera Motion
- [ ] `WebGPUEngine.ts` initializes `depthTexture` with `format: 'depth32float'` and `usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING`.
- [ ] Pass 1 depthStencil states (`crust`, `ribbons`, `lines`, `contours`, `crane`) use `depth32float` with zero WebGPU validation errors.
- [ ] Camera altitude smoothly descends below 5.08 down to tropospheric altitudes ($\le 4,000\text{m}$) without planetary crust near-plane clipping.
- [ ] Benchmark capture `screenshots/m1_camera_descent.png` verifies Puget Sound descent.

### 3D Noise Compute Generation
- [ ] `cloud_noise_compute.wgsl` dispatches once on startup and generates a $128^3$ `rgba8unorm` 3D texture without console errors (<8ms).
- [ ] Channel distribution matches spec: Red contains Perlin-Worley billows; Green, Blue, Alpha contain 3 octaves of Worley erosion.
- [ ] Benchmark capture `screenshots/m2_noise_volume.png` verifies noise volume generation.

### WeatherNext 3 Data Integration
- [ ] `WeatherNextDataSource.ts` loads and ring-buffers low, medium, and high cloud slices.
- [ ] Base cloud deck height couples dynamically to LCL psychrometrics ($h_{\text{base}} = 125.0 \cdot (T_{2\text{m}} - T_{d,2\text{m}})$).
- [ ] Existing 4-tap Poisson ground shadows in `crust_hydrosphere.wgsl:695-752` receive volumetric cloud density without regression.

### Volumetric Raymarching & Depth Occlusion
- [ ] Pass 2 samples `texture_depth_2d` and terminates raymarching at $t_{\text{terrain}}$, preventing clouds from rendering beneath the planetary crust.
- [ ] All WGSL texture sampling in `volumetric_cloud.wgsl` uses explicit LOD (`textureSampleLevel` / `textureLoad`) obeying Invariant §3 uniform control flow.
- [ ] At Mount Rainier bookmark ($46.8529^\circ\text{N}, 121.7604^\circ\text{W}$, altitude $3,800\text{m}$), Puget Sound marine stratus fills the basin while the $4,392\text{m}$ summit pierces into sunlight.
- [ ] Benchmark capture `screenshots/m3_rainier_inversion.png` verifies terrain occlusion.

### Optical Scattering & Multi-Medium Archival Inks
- [ ] Dual-lobe Henyey-Greenstein scattering ($g_1 = 0.82, g_2 = -0.25$) creates forward Mie silver lining glare near the solar disk.
- [ ] 1-tap solar raymarch generates crevice self-shadowing.
- [ ] Theme switching across Marie Tharp, Cream Rag, and Prussian Cyanotype maintains distinctive historical inking without shader recompilation (Invariant §24 & §28).
- [ ] At Haleakala sunset bookmark ($20.7097^\circ\text{N}, 156.2533^\circ\text{W}$, sun altitude $+7.5^\circ$), cloud decks display golden rim-lighting and deep diffuse shadowing across all 3 mediums.
- [ ] Benchmark captures `screenshots/m4_haleakala_tharp.png`, `screenshots/m4_haleakala_cream.png`, `screenshots/m4_haleakala_cyanotype.png` recorded.

### Independent Verification & Test Integrity
- [ ] `npm test` passes 100% across all unit and mathematical invariant suites (2,597+ tests).
- [ ] `npx tsc --noEmit` completes with 0 type errors.
- [ ] Canonical captures saved to `screenshots/` covering all milestone checkpoints (minimum 6 litmus images).
- [ ] Live Chrome DevTools console logs show zero WGSL compilation rejections or unhandled exceptions.
</USER_REQUEST>

## 2026-09-15T05:21:57Z

<USER_REQUEST>
Refactor the AtmosphereDrawer in the Indicatrix Engine from a flat stack of 17 generic VernierSliders and hand-rolled button grids into domain-specific cartographic instruments matching the existing PolarSunCompass, HypsometricReliefCurve, BathymetricTideGauge, and CurvatureUnfurlSextant pattern. Full 3-theme medium-adaptive SVG artifacts (Cream Rag/Cyanotype/Tharp) from day one. Production quality — this is portfolio work.

Working directory: /Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/atmosphere_visual_controls_audit
Integrity mode: development

## Requirements

### R1. Primitive Consistency (Stage 0)
Replace the 5 hand-rolled segmented button grids in `AtmosphereDrawer.tsx` (Vertical Scale Transfer, Thermodynamic Gating, Weather Optical Mode, Prognostic Model, Prognostic Variable) with the existing `SegmentedControl` component from `src/components/ui/SegmentedControl.tsx`. Replace the master cloud deck raw `<button role="switch">` with the existing `TactileSwitch` component from `src/components/ui/TactileSwitch.tsx`. Upgrade any bare `<input type="range">` elements in the drawer and related instruments to `VernierSlider`. All existing functionality, state flow, and window bridge dispatchers must be preserved exactly. No new components — only adopting existing primitives.

### R2. Atmospheric Cross-Section Column Instrument
Create a new cartographic instrument (`AtmosphericColumnInstrument`) that replaces the tri-altitude layer toggles (LOW/MID/HIGH), Atmospheric Scale VernierSlider, and Cloud Opacity VernierSlider. The instrument must render a vertical atmospheric column cross-section showing cloud strata bands at their calibrated altitude positions (1–2km, 4–6km, 10–12km). Clicking a stratum band toggles that layer. Dragging the top edge of the column controls atmospheric scale (1.0–12.0x). Cloud fill opacity within bands reflects cloud opacity (0.1–1.0). Must include medium-adaptive SVG artifacts for all 3 themes: Cream Rag (Victorian meteorological engravings), Cyanotype (pressure-altitude graph paper), Tharp (acoustic atmospheric sounding traces). Double-click resets to defaults. Full keyboard accessibility via arrow keys. Pointer capture drag. Must dispatch to the same window bridge functions (`__INDICATRIX_SET_CLOUD_OPTIONS__`, `__INDICATRIX_SET_ATMOSPHERIC_SCALE__`) at zero latency.

### R3. Orographic Moisture Profile Instrument
Create a new cartographic instrument (`OrographicMoistureProfile`) that replaces the Orographic Coupling VernierSlider, Pluvial Coupling VernierSlider, and Thermodynamic Gating segmented toggle. The instrument must render a mountain cross-section showing the orographic precipitation cycle: windward moisture ascent, LCL condensation altitude line, precipitation column, and leeward rain shadow. Dragging the windward cloud mass controls Orographic Coupling (0.0–1.0). Dragging the rain column controls Pluvial Coupling (0.0–2.0). A footer toggle controls Thermodynamic Gating (LCL on/off) — when ON, the LCL line is drawn and clouds form only above it. Medium-adaptive SVG artifacts for all 3 themes. Double-click resets. Keyboard accessible. Pointer capture drag. Same window bridge dispatchers preserved.

### R4. Shadow Intensity and Cloud Drift Speed Controls
Redesign the Shadow Intensity and Cloud Drift Speed controls as individual visual instruments (not generic VernierSliders) that convey their physical meaning. Shadow Intensity (0.0–0.60) should visualize ground shadow projection. Cloud Drift Speed (0–2000×) should visualize temporal motion. These remain independent controls — not coupled. Each must have medium-adaptive SVG artifacts for all 3 themes, double-click reset, keyboard accessibility, and pointer capture drag.

### R5. Prognostic Model Consolidation
Consolidate the Prognostic Model selector, Prognostic Variable selector, and WeatherNext Status Telemetry pill into a single self-contained card instrument. The card should use `SegmentedControl` for model and variable selection. Data provenance information (Zarr storage status, forecast lead time) should be integrated into the card rather than dangling as a separate pill. Conditional rendering of WeatherNext-specific controls when that model is selected must be preserved.

## Acceptance Criteria

### Primitive Consistency
- [ ] Zero hand-rolled segmented button grids remain in `AtmosphereDrawer.tsx` — all use `SegmentedControl`
- [ ] Master cloud toggle uses `TactileSwitch`, not raw `<button role="switch">`
- [ ] No bare `<input type="range">` in drawer — all use `VernierSlider`
- [ ] `role="radiogroup"` and arrow key navigation work on all segmented groups
- [ ] All existing window bridge dispatchers fire identically to before refactor

### Instrument Visual Quality
- [ ] Each new instrument follows the established pattern: status header → interactive viewport → footer with reset
- [ ] Each instrument renders distinct medium-adaptive SVG artifacts across all 3 themes (Cream Rag, Cyanotype, Tharp)
- [ ] Theme switching via CSS custom properties — no pipeline recompilation
- [ ] Visual artifacts match the quality standard of existing instruments (PolarSunCompass, HypsometricReliefCurve, BathymetricTideGauge)

### Interaction & Accessibility
- [ ] All instruments use pointer capture for drag operations beyond window bounds
- [ ] Double-click resets to scientifically meaningful defaults on every instrument
- [ ] Arrow key navigation with shift-key coarse stepping on all continuous parameters
- [ ] `role="slider"` or appropriate ARIA roles on all interactive viewports
- [ ] `tabIndex={0}` on all focusable instrument viewports

### Functional Parity
- [ ] All 17 original control parameters remain adjustable — no functionality lost
- [ ] All window bridge dispatcher functions preserved exactly (`__INDICATRIX_SET_CLOUD_OPTIONS__`, `__INDICATRIX_SET_ATMOSPHERIC_SCALE__`, `__INDICATRIX_SET_SHADOW_INTENSITY__`, etc.)
- [ ] Controlled/uncontrolled dual-mode prop pattern preserved (internal state with prop override)
- [ ] Value clamping ranges unchanged from original implementation
- [ ] AtmosphereDrawer total scroll height does not increase (should decrease)

### Code Quality
- [ ] TypeScript strict mode — no `any` casts except for window bridge globals
- [ ] All new instruments have dedicated test coverage extending `tests/phase6-precision-instruments.test.ts`
- [ ] Medium-adaptive SVG class assertions in `tests/modern/r6-design-system-ergonomics.test.ts`
- [ ] Project builds successfully with zero TypeScript errors
- [ ] All existing tests pass

### Design Compliance
- [ ] Single-border HUD enclosure contract (no nested inner neatlines)
- [ ] `bg-[var(--theme-card-bg)]` and `border-[var(--theme-card-border)]` on all instrument cards
- [ ] Monospace tabular numerals (`font-mono tabular-nums`) on all dynamic readouts
- [ ] Hover glow (`hover:shadow-[0_0_12px_var(--theme-focus-ring)]`) and focus ring on interactive viewports

## Verification Resources

### Existing Test Suites
- `tests/phase6-precision-instruments.test.ts` — Mathematical invariant contracts for existing instruments
- `tests/modern/r6-design-system-ergonomics.test.ts` — Medium-adaptive SVG artifact DOM testing
- `tests/modern/r14-m4-atmosphere-drawer-controls.test.ts` — AtmosphereDrawer unit/integration tests
- `tests/tier1/tier1-design-system-bugs-and-polish.test.ts` — CSS theme card variable enforcement

### Reference Implementations
- `src/components/hud/instruments/PolarSunCompass.tsx` — Canonical example of polar drag instrument with medium-adaptive SVG
- `src/components/hud/instruments/HypsometricReliefCurve.tsx` — Canonical example of 2D Cartesian drag instrument
- `src/components/hud/instruments/BathymetricTideGauge.tsx` — Canonical example of 1D vertical drag instrument
- `src/components/ui/SegmentedControl.tsx` — Target primitive for segmented groups
- `src/components/ui/TactileSwitch.tsx` — Target primitive for master toggle

### Authoritative Design Documents
- `DESIGN_ETHOS.md` — 16 core design principles, rendering identities, neatline rules
- `design-language.md` — Color spaces, theme tokens, typography scale, HUD geometry
- `AGENTS.md` — Project rules including medium identity standards, spatial clearance, single-border contract
</USER_REQUEST>

## 2026-09-17T01:02:25Z

<USER_REQUEST>
# Mission: Indicatrix Engine — High-Precision DEM Downstream Coupling, Cloud Fidelity, UX Polish & Performance Hardening

Eliminate DEM coordinate and elevation shaping bottlenecks across all WebGPU shaders, elevate volumetric cloud fidelity with Takram/Wrenninge 2017 multiple scattering while preserving WeatherNext 3 data coupling, implement cursor-relative zoom and diagnostic Purity Mode, decommission dead pipeline assets, audit sidebar controls, and produce rigorous visual delta and strategic next-steps artifacts.

Working directory: `/Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/dem_shader_improvements`
Integrity mode: `development`

---

## Authoritative References & Core Invariants
- Master References: `DESIGN_ETHOS.md`, `AGENTS.md` (Rules 3, 4, 5, 8, 12, 18, 21, 23, 24, 26), `docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md`.
- Target Hardware: Apple Silicon Metal-3 WebGPU (Dawn Backend).
- Invariant §3: Unconditional Derivative Evaluation (`fwidth`, `dpdx`, `dpdy` strictly before dynamic branches/discards).
- Invariant §5: No Uniform Placebos (Every uploaded uniform must be actively consumed in the target shader's default path).
- Invariant §8: Cross-Pipeline DEM Mathematical Parity (Identical `shapedH` saturation and `dynamicExp` curves across all shaders).
- Invariant §21: Test Harmonization Discipline — update source-scanning tests simultaneously when modifying shader tokens or pipeline properties.
- Invariant §23: Fast-Path Iterative vitest scoping (`npx vitest run <target-files>`). Reserve full suite for final gating.
- Invariant §24: Zero-Zombie Pass Invariant — every secondary pass or pipeline must have dedicated gating and zero unused pipelines.
- Invariant §26: Zero-GC per-frame buffer discipline — no allocations in animation loops.

---

## Requirements

### R1. Coordinate & Mathematical Parity Gate
- Correct the 180° longitude phase inversion in `src/webgpu/shaders/wind_particles.wgsl:184` from `fract(lonRad / TWO_PI)` to `fract(lonRad / TWO_PI + 0.5)` so wind particles sample velocity vectors aligned with terrain elevation.
- Synchronize mathematical peak shaping (`shapedH = (1.0 - exp(-2.2 * normH)) / (1.0 - exp(-2.2))`) and clamped `dynamicExp` ([0.85, 1.30]) across `cloud_shell.wgsl:218-223` and `wind_particles.wgsl:227-239` to match `crust_hydrosphere.wgsl:722-725` (Rule 8 parity).
- In `crust_hydrosphere.wgsl:1817, 1929`, upgrade Theme 2 isoline contours and hypsometric stratum isolation glaze to evaluate the 8K fragment DEM `elevMeters` instead of blurry vertex-interpolated `input.elevation`.

### R2. Uniform Placebo & Orographic Coupling Gate
- Wire `u_rainShadowFeedback` in `cloud_shell.wgsl:400-435` to modulate cloud density and optical depth on the lee side of mountain ranges based on orographic vertical velocity $w_{\text{orographic}} = \mathbf{u}_{\text{wind}} \cdot \nabla h$ (Spec §2.2, Rule 5).
- Wire `cloud.u_shadowIntensity` in `cloud_shell.wgsl:431` (`selfShadow = mix(1.0 - cloud.u_shadowIntensity * 0.5, 1.0, NdotL)`) to resolve the uniform placebo and make the sidebar Shadow Intensity slider functional while preserving the 288-byte uniform struct layout.

### R3. Volumetric Cloud Fidelity (Takram Wrenninge Multi-Scattering)
- Implement Wrenninge 2017 energy-conserving multiple scattering approximation in `volumetric_cloud.wgsl:403-441`: for each raymarch step with density > 0.002, evaluate 3 octaves where scattering albedo halves and phase converges toward isotropic ($g \rightarrow 0$), transforming dark cloud interiors into bright-white cumulus tops while preserving the medium inking system.
- Replace the 1-tap `sampleSunShadowTransmittance` call with a 4-step Beer-Lambert integration along the sun vector, accumulating optical depth through the cloud column.
- Add a second noise frequency pass at 2× base frequency for the low cloud stratum only (`layerHeightEnvelope(hNorm, lowBottom, lowTop, 0.04)`) for billowy cumulus detail.
- **Constraint**: Cloud macro-density must remain coupled to WeatherNext 3 prognostic textures (`u_cloudLowTexture`, `u_cloudMidTexture`, `u_cloudHighTexture`).
- **Performance guard**: Total raymarch steps (`maxSteps`) must not exceed 64; use adaptive step sizing (skip empty space with 2× step distance when density < 0.002).

### R4. Camera Interaction UX & Purity Diagnostic Mode
- Implement cursor-relative zoom in `src/webgpu/WebGPUCanvas.tsx:1607-1613`: read `currentHitPosRef.current`, lerp `targetRef.current` toward cursor hit point on zoom in (`deltaY < 0`), gradually recenter toward `(0, 0, 0)` on zoom out (`deltaY > 0`), and fall back to center zoom when off-globe.
- Add Purity Mode toggle overlay: when ON, strip atmosphere pass, water surface shading, volumetric cloud pass, cloud shell pass, and wind particle pass (Rule 24). Output clean archival paper substrate + DEM-displaced point cloud / wireframe mesh. Pack `u_purityMode` in `crustFloats[75]` (offset 300).

### R5. Pipeline & Catalog Sanitization Gate
- Safely decommission zombie `this.swissReliefPipeline` in `WebGPUEngine.ts` while harmonizing source-scanning tests (`challenger-m1-depth-pipeline.test.ts`, `crust-hydrosphere-dual-surface.test.ts`, `milestone1-depth-kinematics.test.ts`, `milestone1-shaders.test.ts`).
- Synchronize `DATA_LAYER_CATALOG` entries across BOTH `src/core/data/DataLayerCatalog.ts` and `src/core/layers/DataLayerCatalog.ts` to reference `/earth-etopo2022-dem-u16.bin`.
- Update default URL in `src/core/layers/useGlobeLayerManager.ts` to `/earth-etopo2022-dem-u16.bin`.
- Remove synthetic comment hack in `wind_particles.wgsl:212` and harmonize `challenger-m2-wind-deflection-adversarial.test.ts:158`.

### R6. UI Integrity & Performance Hardening
- Complete sidebar control audit across all SCENE and DATA tab instruments in `UnifiedRightSidebar.tsx`. Document status in a `✅ / ⚠️ / ❌` table.
- Add Purity Mode `TactileSwitch` in the SCENE tab ("Purity · DEM Only") wired end-to-end.
- Audit responsive layout at 1440×900 and 1920×1080 to eliminate text clipping or label collisions.
- Measure GPU profiler timings (`GPUProfiler.ts`) to ensure `totalGpuMs` ≤ 16.67ms (≥ 60 FPS) on Apple Silicon. Verify zero typed-array allocations in animation frame loop (Rule 26).

### R7. Adversarial Verification, Before/After Delta & Next Steps
- **Gate 0 Baseline Captures**: Capture Chrome DevTools MCP screenshots across all 3 archival themes (Marie Tharp, Cream Rag, Cyanotype) at Hawaii litmus location (19.65°N, 155.55°W), sidebar SCENE/DATA tabs, cloud close-up, and baseline FPS/GPU timings *before any source files are modified*.
- Author `tests/modern/r20-orographic-wind-deflection-coupling.test.ts` and run targeted vitest verification (100% pass rate).
- Capture identical AFTER screenshots post-implementation.
- Author `visual_delta_report.md` artifact embedding before/after screenshot pairs side-by-side with observable pixel deltas and performance metrics.
- Author `next_steps_and_differentiators.md` artifact detailing immediate priorities, performance headroom analysis, and differentiator opportunities.

---

## Acceptance Criteria

### Parity & Mathematical Soundness
- [ ] `wind_particles.wgsl` samples longitude with `fract(lonRad / TWO_PI + 0.5)`.
- [ ] Soft-summit saturation formula `(1.0 - exp(-2.2 * normH)) / (1.0 - exp(-2.2))` and clamped `dynamicExp` ([0.85, 1.30]) match exactly across `crust_hydrosphere.wgsl`, `cloud_shell.wgsl`, and `wind_particles.wgsl`.
- [ ] Theme 2 isolines and hypsometric stratum glaze evaluate fragment `elevMeters` instead of `input.elevation`.
- [ ] `u_rainShadowFeedback` actively attenuates cloud density and optical depth when $w_{\text{orographic}} < 0$.
- [ ] `u_shadowIntensity` in `cloud_shell.wgsl` actively scales self-shadowing without breaking the 288-byte uniform struct.

### Cloud Fidelity & Data Coupling
- [ ] Cumulus cloud tops in `volumetric_cloud.wgsl` appear bright white via Wrenninge multi-scattering octaves rather than dark gray.
- [ ] 4-tap sun shadow ray integration creates smooth self-shadow gradients across cloud columns.
- [ ] WeatherNext 3 prognostic cloud fraction textures strictly dictate macro cloud coverage.
- [ ] Total raymarch steps do not exceed 64 and adaptive step sizing skips empty space (`density < 0.002`).

### Camera & UI Integrity
- [ ] Zooming in on any off-center terrain feature moves the camera target toward that feature; zooming out recenters toward globe center `(0, 0, 0)`.
- [ ] Purity Mode toggle strips atmosphere, water, cloud, and wind passes, leaving archival paper substrate + DEM point cloud / wireframe mesh.
- [ ] 0 dead controls (0 ❌ in sidebar audit table); zero overlapping labels at 1440×900 and 1920×1080.
- [ ] Zero WebGPU or WGSL errors in browser console.

### Performance & Memory Discipline
- [ ] GPU profiler `totalGpuMs` ≤ 16.67ms (≥ 60 FPS) at 1080p on Apple Silicon.
- [ ] Zero `new Float32Array`, `new ArrayBuffer`, or `new Uint32Array` allocations in the continuous render loop (Rule 26).

### Verification & Artifacts
- [ ] Gate 0 baseline captures completed before code changes.
- [ ] All targeted vitest suites pass 100%.
- [ ] `visual_delta_report.md` created with embedded before/after screenshot pairs.
- [ ] `next_steps_and_differentiators.md` created with ≥ 5 substantive, evidence-grounded recommendations.
</USER_REQUEST>

## 2026-09-18T19:26:03Z

<USER_REQUEST>
Harden the Indicatrix Engine's WebGPU shader pipeline across 4 sequential phases. Each phase has strict gating — do not advance until the current phase's acceptance criteria pass. The work spans baseline visual captures, horizon falloff + CDLOD culling fixes (parallel), Mode 4 Dymaxion excision (26+ files), and evaluateManifold unification into a shared WGSL module.

Working directory: /Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward

## Binding References & Invariants

Before ANY code changes, read and internalize these project files:

1. **`SHADERS_SPEC_LEDGER.md`** (project root) — All shader math MUST conform to the ledger specifications. This is a binding contract (AGENTS.md Rule 27). Sections:
   - §1: `horizonFalloff` function — Beer-Lambert transmission with Chapman function approximation and kill-term smoothstep
   - §2: CDLOD tangent horizon culling — replaces hardcoded `24.5` with dynamic `R² - δ_max` via uniforms
   - §3: `evaluateManifold` unified core — `switch(mode)` dispatch (modes 0–3, Mode 4 excised), `DeformedVertex` struct, mandatory deletion checklist for `computeCurlNoise` duplicates
   - §4: Hardware `depthBias` parameters — replaces geometric standoff `0.005` in `points_render.wgsl`

2. **`AGENTS.md`** (project root) — 28 rules governing shader development. Critical rules:
   - Rule 4: WGSL derivatives (`fwidth`, `dpdx`, `dpdy`) must execute in uniform control flow before any branching
   - Rule 7: Zero geometric standoff, hardware depth bias only
   - Rule 11: Sequential milestones, no monolithic mandates
   - Rule 21: Source-scanning test fragility — many tests use `readFileSync` to scan source files
   - Rule 27: Spec ledger is a binding contract
   - Rule 28: Shared module extraction requires mandatory deletion checklist

3. **`.agents/skills/shader-pipeline/SKILL.md`** — Procedures for shader refactoring, visual capture protocol, verification commands.

4. **`.agents/skills/shader-pipeline/references/phase-2-track-scopes.md`** — Disjoint file ownership for parallel workers. Strictly exclusive write access per track.

5. **`.agents/hooks.json`** — Mechanical enforcement:
   - `baseline-sentinel`: DENIES all shader file edits (`src/webgpu/shaders/`) until `screenshots/baseline_theme0.png` exists
   - `mode4-excision-gate`: BLOCKS agent stop while `PHASE_2_2_ACTIVE` marker exists AND Mode 4 references remain in `src/`
   - `spec-ledger-reminder`: Injects ephemeral reminder about spec ledger on every invocation

6. **`DISCOVERY_LEDGER.md`** (project root) — Cross-session memory. Read before planning.

## Requirements

### R1. Baseline Sentinel Gate (Phase 2.0 — BLOCKING)

Before any shader file is modified, capture visual baselines at the Hawaii litmus location (21°N, 157°W) in globe state (α=0.0) across all 3 cartographic mediums. The `baseline-sentinel` hook mechanically enforces this — shader edits will be denied until baselines exist.

1. Run `npm run dev` to start the dev server.
2. Using Chrome DevTools MCP, navigate to the running app (typically `http://localhost:5173`).
3. Set camera to Hawaii litmus location (21°N, 157°W) in globe state (α=0.0).
4. For each of the 3 mediums:
   - **Theme 0** (Marie Tharp): Switch via UI controls → `take_screenshot` (omit `filePath`) → copy MCP temp file to `screenshots/baseline_theme0.png`
   - **Theme 1** (Cream Rag): Switch → capture → copy to `screenshots/baseline_theme1.png`
   - **Theme 2** (Prussian Cyanotype): Switch → capture → copy to `screenshots/baseline_theme2.png`
5. Verify: `bash .agents/skills/shader-pipeline/scripts/verify-baselines.sh` must exit 0.

### R2. Horizon Falloff & Standoff Compliance (Phase 2.1, Track A — parallel with R3)

Implement spec-ledger-compliant horizon falloff and replace geometric standoffs with hardware depth bias. These files are EXCLUSIVELY owned by this track — no other worker may touch them:
- `src/webgpu/shaders/vector_ribbon.wgsl`
- `src/webgpu/shaders/atmosphere_scatter.wgsl`
- `src/webgpu/shaders/points_render.wgsl`
- `src/webgpu/shaders/lines_render.wgsl`

1. Implement the `horizonFalloff` function from `SHADERS_SPEC_LEDGER.md §1` in the applicable shaders with their per-shader τ and killEdge parameters.
2. Replace the `0.005` geometric standoff at `points_render.wgsl:49` (`let offsetPos = pos + dynamicNormal * (0.005 * ...)`) with `let offsetPos = pos;` and enable hardware `depthBias: -120`, `depthBiasSlopeScale: -1.0`, `depthBiasClamp: 0.0` on `pointsRenderPipeline` and `linesRenderPipeline` in `WebGPUEngine.ts` (pipeline creation only — Track B owns the culling section).
3. Delete zombie file `src/webgpu/shaders/swiss_relief_shading.wgsl` (252 lines, confirmed orphaned).
4. Verify: `npx vitest run tests/webgpu/` must pass.

### R3. CDLOD Tangent Horizon Culling (Phase 2.1, Track B — parallel with R2)

Replace hardcoded magic constant `24.5` with the tangent-distance formula. These files are EXCLUSIVELY owned by this track:
- `src/webgpu/shaders/culling.wgsl`
- `src/webgpu/WebGPUEngine.ts` (ONLY the `24.5` comparison near line 1782 — rest of file is shared)

1. In `culling.wgsl:94`, replace `24.5` with dynamically computed `R_squared_minus_disp` per `SHADERS_SPEC_LEDGER.md §2`. This requires adding the threshold as a uniform.
2. In `WebGPUEngine.ts:1782`, replace the matching `24.5` with the same formula computed CPU-side.
3. Verify: `npx vitest run tests/modern/cdlod-quadsphere-culling.test.ts` must pass.

### R4. Mode 4 (Dymaxion) Complete Excision (Phase 2.2 — sequential, after R2+R3)

Remove all Mode 4 / Dymaxion code across the entire codebase. Scope confirmed at 26+ files across shaders (9 WGSL files with `mode == 4u`), engine, UI, utilities, and types.

1. Create marker: `touch .agents/PHASE_2_2_ACTIVE` (activates the `mode4-excision-gate` Stop hook).
2. Pre-flight: `grep -r 'readFileSync' tests/ | grep -iE 'dymaxion|mode.4'` to identify source-scanning tests that will break.
3. Remove all `mode == 4u` / `mode === 4` branches from shaders and TypeScript.
4. Update `SimulationMode` in `src/types.ts` from `0 | 1 | 2 | 3 | 4` to `0 | 1 | 2 | 3`. Remove `DymaxionProjectionResult` interface.
5. Delete `src/utils/dymaxion.ts` entirely (354 lines).
6. Remove Dymaxion imports and all dependent code from `src/utils/contour-topology.ts` (imports `UNIT_VERTICES`, `ICOSAHEDRON_FACES`, `UNIT_CENTROIDS`, `DYMAXION_FACE_VERTICES_2D`, `projectToDymaxion2D`, `clipSegmentDymaxion`, `partitionPolylineByDymaxionFacets`).
7. Update `DESIGN_ETHOS.md` and `DISCOVERY_LEDGER.md` to reflect Mode 4 removal.
8. Harmonize all broken tests — source-scanning tests that expected Dymaxion strings must be updated to scan correct files or remove Dymaxion assertions.
9. Verify: `bash .agents/skills/shader-pipeline/scripts/audit-mode4.sh` must exit 0.
10. Remove marker: `rm .agents/PHASE_2_2_ACTIVE`.

### R5. evaluateManifold Unification (Phase 2.3 — sequential, after R4)

Unify 5 divergent inline `evaluateManifold` definitions into a single shared WGSL module concatenated at pipeline creation time.

Current inline definitions (all must be deleted after extraction):
- `crust_hydrosphere.wgsl:531` — `fn evaluateManifold(uv, unfurl, mode)`
- `atmosphere_scatter.wgsl:60` — `fn evaluateManifold(pos3D, mercator2D, dymaxion2D)`
- `cloud_shell.wgsl:154` — `fn evaluateManifold(pos3D, mercator2D, dymaxion2D)`
- `vector_ribbon.wgsl:170` — `fn evaluateManifold(pos3D_raw, target2D, dymaxion2D, pointType)`
- `wind_particles.wgsl:263` — `fn evaluateManifoldPosition(lonRad, latRad, altOffset, mode, unfurl)`

Also extract and deduplicate `computeCurlNoise` (currently in `crust_hydrosphere.wgsl:505`, `vector_ribbon.wgsl:141`, `physics_sim.wgsl:41`).

1. Create `src/webgpu/shaders/manifold.wgsl` matching the unified signature in `SHADERS_SPEC_LEDGER.md §3` — `evaluateManifoldCore` with `switch(mode)` dispatch (Rule 28: use `switch` not `if/else if`).
2. In `src/webgpu/WebGPUEngine.ts`, modify pipeline creation to concatenate `manifold.wgsl` (imported via `?raw`) before each consumer shader: `crust_hydrosphere`, `vector_ribbon`, `atmosphere_scatter`, `cloud_shell`, `wind_particles`. Pattern: `const fullShader = uniformsDecl + '\n' + manifoldWGSL + '\n' + mainShaderWGSL;`
3. Delete ALL inline `evaluateManifold` and `computeCurlNoise` definitions from consumer shaders. Also delete any `const PI` or `const RADIUS` re-declarations that would collide with shared module declarations.
4. Create appropriate adapter functions (grid adapter for `crust_hydrosphere`, geodetic adapter for `wind_particles`) per §3.
5. Verify: `bash .agents/skills/shader-pipeline/scripts/audit-manifold.sh` must exit 0 (exactly 1 `fn evaluateManifold` definition in shaders/).
6. Full suite gate: `npm test` (all 219+ test files must pass).
7. Build gate: `npm run build` must succeed.

## Acceptance Criteria

### Phase 2.0 — Baseline Sentinel
- [ ] `screenshots/baseline_theme0.png` exists and is >50KB (real visual content, not blank)
- [ ] `screenshots/baseline_theme1.png` exists and is >50KB
- [ ] `screenshots/baseline_theme2.png` exists and is >50KB
- [ ] `bash .agents/skills/shader-pipeline/scripts/verify-baselines.sh` exits 0

### Phase 2.1 — Horizon Falloff (Track A)
- [ ] `horizonFalloff` function exists in `vector_ribbon.wgsl`, `atmosphere_scatter.wgsl`, `points_render.wgsl`, and `lines_render.wgsl` matching §1 signature
- [ ] `grep -n '0.005' src/webgpu/shaders/points_render.wgsl` returns 0 matches (geometric standoff removed)
- [ ] `depthBias: -120` configured on `pointsRenderPipeline` and `linesRenderPipeline` in `WebGPUEngine.ts`
- [ ] `src/webgpu/shaders/swiss_relief_shading.wgsl` does not exist (zombie deleted)
- [ ] `npx vitest run tests/webgpu/` passes all tests

### Phase 2.1 — CDLOD Culling (Track B)
- [ ] `grep -n '24.5' src/webgpu/shaders/culling.wgsl` returns 0 matches
- [ ] `grep -n '24.5' src/webgpu/WebGPUEngine.ts` returns 0 matches (near former line 1782)
- [ ] Dynamic `R_squared_minus_disp` uniform replaces the hardcoded constant
- [ ] `npx vitest run tests/modern/cdlod-quadsphere-culling.test.ts` passes

### Phase 2.2 — Mode 4 Excision
- [ ] `bash .agents/skills/shader-pipeline/scripts/audit-mode4.sh` exits 0
- [ ] `grep -rnE 'mode == 4u|Dymaxion|Mode 4' src/` returns 0 matches
- [ ] `src/utils/dymaxion.ts` does not exist
- [ ] `SimulationMode` in `src/types.ts` is `0 | 1 | 2 | 3` (no `4`)
- [ ] `DymaxionProjectionResult` interface removed from `src/types.ts`
- [ ] No Dymaxion imports remain in `src/utils/contour-topology.ts`
- [ ] `.agents/PHASE_2_2_ACTIVE` marker removed
- [ ] All source-scanning tests that referenced Dymaxion strings have been updated
- [ ] `npm test` passes (intermediate gate)

### Phase 2.3 — evaluateManifold Unification
- [ ] `src/webgpu/shaders/manifold.wgsl` exists with `evaluateManifoldCore` using `switch(mode)` dispatch
- [ ] `bash .agents/skills/shader-pipeline/scripts/audit-manifold.sh` exits 0 (exactly 1 `fn evaluateManifold` definition in shaders/)
- [ ] Zero inline `evaluateManifold` definitions remain in consumer shaders
- [ ] Zero duplicate `computeCurlNoise` definitions remain (extracted to shared module)
- [ ] Pipeline concatenation pattern visible in `WebGPUEngine.ts`
- [ ] `npm test` passes (full suite — 219+ test files, 3100+ tests)
- [ ] `npm run build` succeeds

### Global Invariants (must hold at every phase)
- [ ] No WGSL derivative calls (`fwidth`, `dpdx`, `dpdy`) inside conditional branches (Rule 4)
- [ ] Zero geometric standoffs > 0.002 in any shader (Rule 7)
- [ ] All `clearValue` for premultiplied-alpha passes are `{r:0, g:0, b:0, a:0}` (Rule 15)
- [ ] No `console.error` or WebGPU device-lost errors in browser console during visual verification
</USER_REQUEST>

## 2026-09-18T20:27:54Z

<PARENT_DIRECTIVE>
PHASE 2.2 COMPLETE — ALL GATES PASSED:

- `audit-mode4.sh`: ✅ Zero Mode 4/Dymaxion references in src/
- `npm test`: ✅ 225/225 test files, 3254/3254 tests passing
- `.agents/PHASE_2_2_ACTIVE` marker: ✅ Removed
- `mode4-excision-gate` stop hook: ✅ Will now allow stop

Phase 2.3 (evaluateManifold unification into `manifold.wgsl`) is UNBLOCKED. The orchestrator should now proceed with:
1. Create `src/webgpu/shaders/manifold.wgsl` per SHADERS_SPEC_LEDGER.md §3
2. Concatenate via `?raw` import in WebGPUEngine.ts pipeline creation
3. Delete all 5 inline evaluateManifold definitions + 3 computeCurlNoise duplicates
4. Verify with `audit-manifold.sh`, then `npm test` + `npm run build`
</PARENT_DIRECTIVE>

## 2026-09-18T21:17:48Z

<PARENT_DIRECTIVE>
VICTORY AUDIT FINDINGS RESOLVED:

1. ✅ `swiss_relief_shading.wgsl` deleted (was restored during a test fix — now permanently removed)
2. ✅ `manifold.wgsl:6` Mode 4 comment removed — `audit-mode4.sh` now exits 0

Both audit scripts pass cleanly. The orchestrator's remediation team can re-submit for victory audit, or the auditor can re-verify directly. These were 2 trivial fixes — no code logic changed.
</PARENT_DIRECTIVE>

## 2026-09-19T10:11:38Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full team

Transition from the hybrid fallback baseline into the full architectural commitment of the high-resolution Level-of-Detail DEM engine, including hardware perimeter skirts, 2:1 restricted quadtree balancing, and Riemannian metric calibration.

Working directory: /Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward
Integrity mode: development

**Reference Material:**
- `SHADERS_SPEC_LEDGER.md` is active. All shader math MUST conform to the specifications in that ledger. Read it before modifying any WGSL files.
- Academic Research may be used to inform the agents to build a novel, scalable solution.

## Requirements

### R1. Hardware Perimeter Skirt Generation
Update `generatePatchMesh(64)` to include perimeter skirt geometry ($z_{\text{skirt}} = \Delta h_{\text{DEM}}$) and update vertex/fragment shaders to handle skirt rendering without texture stretching or lighting seams.

### R2. Topological 2:1 Restricted Quadtree Balancing Pass
Implement an explicit adjacency-balanced traversal pass on the CPU quadtree candidate pool to guarantee that no patch borders an active neighbor with $\Delta\text{LOD} > 1$.

### R3. Screen-Space Error (SSE) with Riemannian Metric Calibration
Replace hardcoded Euclidean distance ranges (`cdlodLodRanges`) with a dynamic Screen-Space Error formulation incorporating the Riemannian metric determinant $g(\phi)$ for Mercator and active deformation modes.

### R4. Streamed 16-Bit Regional High-Resolution DEM Ingestion
Scale CDLOD quadtree depth dynamically up to LOD 12 for litmus regions, ensuring synchronous Float16 / R16Unorm elevation decoding parity across all passes.

### R5. In-Engine Real-Time CDLOD Diagnostic Plate
Implement an in-shader diagnostic mode toggle in the `[BETA]` Tray to color each patch by integer LOD level and render morph factor $\alpha$ as a color gradient.

## Acceptance Criteria

### Verification Gating
- [ ] `PORT=3000 npx tsx scripts/verify_interactive_invariants.ts` passes strictly at every milestone.
- [ ] 3D flat map rotation, monotonic zooming, and zero console errors remain green.
- [ ] Sub-pixel rasterization cracks at LOD boundaries are physically eliminated.
- [ ] Morph progression visually bridges exactly one resolution octave (no popping).
- [ ] Uniform pixel-level geometric detail is maintained from the equator to high latitudes.
</USER_REQUEST>
