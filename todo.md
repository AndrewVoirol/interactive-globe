# Persistent State Ledger: Indicatrix WebGPU Macro-Loop (`todo.md`)

**Master Orchestrator**: Antigravity 2.0 Multi-Agent Framework  
**Target Codebase**: `ais-interactive-globe-to-map`  
**Operational Status**: `[ALL MILESTONES COMPLETED - 3,825/3,825 TESTS PASSING]`  
**Current Baseline**: 269 test files, 3,825 tests passing (100% pass rate, 0 failures, 0 regressions)  
**Circuit Breaker Rule**: `MAX_RETRIES = 2` (Halts on 2 consecutive failed iterations per task ➔ `escalation.md`)

---

## Operational Legend
- `[PLANNING]`: Task requirements, dependencies, and interfaces being formulated.
- `[RESEARCH]`: Mathematical formulas, API limits, or shader schemas being analyzed.
- `[IMPLEMENTATION]`: Code authoring in `src/` or `shaders/`.
- `[TESTING]`: Automated Vitest behavioral tests or Chrome DevTools visual audits running.
- `[COMPLETED]`: Code merged, passed all 4 Micro-Verification Gates (Syntax, Logic, Domain, Alignment).
- `[HALTED]`: Circuit breaker triggered at `Iteration: 2`; awaiting human user architectural decision.

---

## Milestone 1: WebGPU Shader & Ingestion Pipelines (Frontiers 1, 3, 4)

- [x] **Task M1-T1**: ETOPO 2022 DEM Unpacking & 16-bit Texture Pipeline
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Cartography & Shader Engineer / WebGPU Systems Engineer
  - **Target Files**: `src/webgpu/shaders/dem_unpack.wgsl`, `src/webgpu/WebGPUEngine.ts`, `public/earth-etopo2022-dem.webp`
  - **Specification**: Ingest `rgba16unorm` 32-bit elevation texture into WebGPU texture sampler; decode signed elevation in meters without 8-bit quantization banding.
  - **Micro-Verification**: Syntax Gate (valid WGSL), Logic Gate (correct signed elevation mapping [-10924m, +8848m]).

- [x] **Task M1-T2**: Eduard Imhof Swiss Relief Shading Render Pass
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Cartography & Shader Engineer / WebGPU Systems Engineer
  - **Target Files**: `src/webgpu/shaders/swiss_relief_shading.wgsl`, `src/webgpu/WebGPUEngine.ts`
  - **Specification**: Bind Imhof Swiss relief shading pipeline in `WebGPUEngine.ts`; evaluate 5-tap discrete Laplacian curvature, NW 315° primary + SW 225° fill sun lighting, and slope-dependent rock cliff exposure (>35°).
  - **Micro-Verification**: Syntax Gate (compiles cleanly), Domain Gate (SIMD32 branchless execution, 16-byte uniform alignment).

- [x] **Task M1-T3**: Jerlov Radiative Transfer & Hydrosphere Dual-Surface Morphing
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Cartography & Shader Engineer
  - **Target Files**: `src/webgpu/shaders/hydrosphere_optics.wgsl`, `src/webgpu/shaders/crust_hydrosphere.wgsl`
  - **Specification**: Implement Jerlov Types I-III spectral attenuation $K_d(\lambda)$, Kubelka-Munk two-flux shallow bathymetry reflectance (0–50m), and synchronous dual-surface morphing proving zero z-fighting on morph transitions.
  - **Micro-Verification**: Logic Gate (0 NaNs across $\alpha \in [0, 1]$), Alignment Gate (exact compliance with `research-dossier.md` Section 3).

- [x] **Task M1-T4**: Screen-Space Anti-Aliased Vector Line Ribbon Pipeline
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Cartography & Shader Engineer / WebGPU Systems Engineer
  - **Target Files**: `src/webgpu/shaders/vector_ribbon.wgsl`, `src/webgpu/WebGPUEngine.ts`
  - **Specification**: Wire `vector_ribbon.wgsl` into `WebGPUEngine.ts`; implement instanced quad extrusion, analytical homogeneous 4D near-plane guard ($w \le 0$), and sub-pixel box filter feathering invariant across 1×–3× Retina viewports.
  - **Micro-Verification**: Syntax Gate (WGSL valid), Logic Gate (near-plane crossing does not produce division-by-zero).

- [x] **Task M1-T5**: Milestone 1 QA & Verification Gate
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: QA & Verification Engineer
  - **Target Files**: `tests/phase2/milestone1-shaders.test.ts`, Vitest suite
  - **Specification**: Verify 100% zero-regression invariant across 676 baseline Vitest tests; execute new unit suites for M1 shader bindings and uniform packing; perform live Chrome DevTools WebGPU visual audit.
  - **Micro-Verification**: Automated suite pass rate = 100% (711 passing across 60 test files), visual confirmation in browser.

---

## Milestone 2: Contour & Vector Topology (Frontier 2)

- [x] **Task M2-T1**: Isoline Contour Mesh Streaming & Ingestion
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Systems Engineer / Cartography & Shader Engineer
  - **Target Files**: `public/geo-contour-mesh.bin`, `src/core/data/`, `src/webgpu/WebGPUEngine.ts`
  - **Specification**: Ingest precomputed binary contour mesh with 32-byte header into WebGPU index and vertex buffers with zero CPU heap re-allocations.
  - **Micro-Verification**: Domain Gate (zero-copy buffer allocation, memory footprint $< 10\,\text{MB}$).

- [x] **Task M2-T2**: Simon l'Huilier Spherical Excess & Topological Severance
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Cartography & Shader Engineer
  - **Target Files**: `src/utils/contour-topology.ts`, `src/webgpu/shaders/`
  - **Specification**: Implement Simon l'Huilier spherical excess metric ($\Delta \Omega = \text{Area}_{3D}/R^2$) for polyline generalization on $S^2$; enforce analytical topological severance cutting closed rings across 180° antimeridian and 14 Dymaxion net boundaries.
  - **Micro-Verification**: Logic Gate (zero dangling edges across antimeridian seam and icosahedral cuts).

- [x] **Task M2-T3**: Milestone 2 QA & Verification Gate
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: QA & Verification Engineer
  - **Target Files**: `tests/phase2/milestone2-contour.test.ts`
  - **Specification**: Unit test contour severance, spherical excess calculations, and boundary invariant guarantees. Ensure zero regressions on full test matrix.
  - **Micro-Verification**: All tests passing, zero NaNs, zero dangling vertices.

---

## Milestone 3: Apple Silicon M4 Pro 4M–16M Node Scaling (Frontier 5)

- [x] **Task M3-T1**: Workgroup Size 256 SIMD32 Dispatch & Zero-Copy Layout
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Systems Engineer
  - **Target Files**: `src/webgpu/WebGPUEngine.ts`, `src/webgpu/shaders/physics_sim.wgsl`
  - **Specification**: Configure 1D dispatch grid `ceil(N / 256)` mapped to Apple Silicon SIMD32 execution units; bind compute storage buffers directly as vertex buffers (`STORAGE | VERTEX`) with zero CPU readback.
  - **Micro-Verification**: Domain Gate (dispatch size $\le 65535$ workgroups for up to 16M nodes: $62,500 \le 65,535$).

- [x] **Task M3-T2**: Asynchronous Triple-Buffered GPU Timestamp Query Profiling
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Systems Engineer / QA & Verification Engineer
  - **Target Files**: `src/webgpu/profiling/GPUProfiler.ts`, `src/webgpu/WebGPUEngine.ts`
  - **Specification**: Activate `timestamp-query` feature on WebGPU device with defensive fallback; implement triple-buffered GPUQuerySet ring buffer (16 queries, 128 bytes) measuring microsecond compute and render kernel execution times without pipeline stalls.
  - **Micro-Verification**: Domain Gate (graceful fallback if `--enable-dawn-features=allow_unsafe_apis` is absent; non-blocking ring buffer mapping).

- [x] **Task M3-T3**: 4M–16M Node Memory Budget & Bandwidth Stress Verification
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Systems Engineer / QA & Verification Engineer
  - **Target Files**: `src/webgpu/WebGPUBenchmark.ts`, `tests/phase2/milestone3-scaling.test.ts`, `tests/tier1/webgpu-m4pro-architecture.test.ts`
  - **Specification**: Stress-test buffer allocations scaling to 4M and 16M nodes on Apple Silicon UMA (512 MB static reference buffer, 512 MB ping-pong buffers); calculate memory bandwidth against M4 Pro 273 GB/s bus (122.88 GB/s @ 60 FPS, 153.60 GB/s decoupled @ 120 FPS).
  - **Micro-Verification**: Domain Gate (total VRAM footprint $1,536\,\text{MB} \le 2.0\,\text{GB}$, sustained compute throughput $\ge 100\text{M}$ nodes/sec, 30 new behavioral tests passing).

- [x] **Task M3-T4**: Final Publication Deliverable & Research Delegation Report
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Master Orchestrator / QA & Verification Engineer
  - **Target Files**: `validation-report-v3.md`, `PROJECT.md`
  - **Specification**: Synthesize empirical results into publication-grade `validation-report-v3.md` conforming to `validation-report-v2.md` scorecard standards; update `PROJECT.md` feature inventory; document specific feedback instructions for the research team.
  - **Micro-Verification**: All scorecard dimensions scored (Scorecard Grade: PRODUCTION READY 10/10), 0 regressions (901/901 tests passing), all milestones M1-T1 through M3-T4 completed.

---

## Milestone 4: Camera Interaction, Zoom Kinematics & Diagnostic Purity

- [x] **Task M4-T1**: Cursor-Relative Zoom Kinematics & Hit-Point Lerping
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Interaction & Systems Engineer
  - **Target Files**: `src/webgpu/WebGPUCanvas.tsx`, `tests/modern/challenger-m4-cursor-zoom-kinematics.test.ts`
  - **Specification**: Implement cursor-relative zoom kinematics with hit-point lerping in `WebGPUCanvas.tsx`. Ensure flat map zooming maintains geographic focus without collapsing orbital camera angles.
  - **Micro-Verification**: Verified with `challenger-m4-cursor-zoom-kinematics.test.ts` and interactive invariant scripts.

- [x] **Task M4-T2**: End-to-End "Purity · DEM Only" Diagnostic Mode
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Cartography & Shader Engineer / Systems Engineer
  - **Target Files**: `src/webgpu/shaders/crust_hydrosphere.wgsl`, `src/webgpu/WebGPUEngine.ts`
  - **Specification**: Implement dedicated diagnostic mode stripping atmospheric and hydrosphere passes to expose pure substrate and DEM crust geometry without artifacts.
  - **Micro-Verification**: Verified clean shader execution, zero zombie passes, and diagnostic plate rendering.

---

## Milestone 5: Pipeline & Asset Hygiene, Zero-GC Buffer Discipline

- [x] **Task M5-T1**: Zombie Pipeline Decommissioning & Zero-GC Enforcement
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Systems Engineer
  - **Target Files**: `src/webgpu/WebGPUEngine.ts`, `src/webgpu/WebGPUCanvas.tsx`
  - **Specification**: Decommission dormant `swissReliefPipeline` in `WebGPUEngine.ts`. Preallocate static typed array mirror buffers and scratch `Vector3` objects (satisfying Rule 26: zero allocations in animation/render loops).
  - **Micro-Verification**: Verified zero allocations during continuous animation, zero pipeline recompilations, 100% test pass rate.

- [x] **Task M5-T2**: ETOPO 2022 16-bit DEM Full-Resolution Sync
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Data Pipeline Engineer
  - **Target Files**: `public/earth-etopo2022-dem-u16.bin`, `src/webgpu/WebGPUEngine.ts`
  - **Specification**: Synchronize full-resolution 16-bit DEM raster asset (`/earth-etopo2022-dem-u16.bin`, 268.4 MB) with Float16/R16Unorm decoding parity across all passes.
  - **Micro-Verification**: Automated DEM guard verification clean, zero hardcoded texture dimension regressions.

---

## Milestone 6: Responsive Layout Refactoring & Cross-Cutting Theme Purity

- [x] **Task M6-T1**: 10px Spatial Clearance Moat & HUD Geometry
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: HUD & UI Engineer
  - **Target Files**: `src/components/hud/`, `src/components/hud/instruments/CurvatureUnfurlSextant.tsx`
  - **Specification**: Enforce 10px spatial clearance moat from neatline to instrument edges, 20px inter-instrument gutters, single-border HUD enclosures, and responsive layouts across 1440×900 and 1920×1080.
  - **Micro-Verification**: Verified layout invariant tests and Chrome DevTools responsive audits.

- [x] **Task M6-T2**: Theme Token Harmonization & Cyanotype Purity
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Theme & Cartography Engineer
  - **Target Files**: `src/components/hud/`, `src/core/themes/ThemeManager.ts`
  - **Specification**: Replace hardcoded Tailwind amber classes with `var(--theme-status-amber)` across all HUD instruments, eliminating warm gold contamination in Theme 2 (Prussian Cyanotype).
  - **Micro-Verification**: Verified 100% visual contrast and photochemical purity in Cyanotype theme tests.

---

## Milestone 7: CDLOD Quadtree Engine & Adversarial Hardening

- [x] **Task M7-T1**: 2:1 Parametric Cylindrical CDLOD Quadtree & Watertight Geomorphing
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Systems Engineer / Cartography & Shader Engineer
  - **Target Files**: `src/webgpu/shaders/culling.wgsl`, `src/webgpu/WebGPUEngine.ts`, `scripts/verify_manifold_cdlod.ts`
  - **Specification**: Implement 2-root parametric cylindrical CDLOD quadtree in canonical UV space $[0, 1] \times [0, 1]$. Provide dynamic restricted 2:1 quadtree balancing, perimeter skirts for crack-free morph transitions, and periodic horizontal wrap sealing.
  - **Micro-Verification**: Verified with `verify_manifold_cdlod.ts` and `cdlod-universal-manifold.test.ts` (zero cracks, zero background bleed, watertight LOD seams).

- [x] **Task M7-T2**: Universal Manifold Coupling & Mode 0 Nested Harmonic Roll
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Shader & Mathematical Physicist
  - **Target Files**: `src/webgpu/shaders/manifold.wgsl`, `src/core/GlobeOverlay.ts`, `SHADERS_SPEC_LEDGER.md §3`
  - **Specification**: Deploy calibrated Mode 0 nested harmonic roll mechanics with 5-scale hierarchy (C2 ease-in, 4% living directional peel, synchronized parallel expansion, developable circular arc unroll with $C^\infty$ spine relaxation, asymmetric chiral seam lip and polar corner curl). Excised Mode 4 across all pipelines.
  - **Micro-Verification**: Passed Monte Carlo stress tests and adversarial verification suites.

- [x] **Task M7-T3**: Orographic Wind Deflection Coupling & Atmospheric Radiative Transfer
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Atmospheric & Shader Engineer
  - **Target Files**: `src/webgpu/shaders/cloud_shell.wgsl`, `src/webgpu/shaders/volumetric_cloud.wgsl`
  - **Specification**: Couple orographic vertical wind velocity $w_{\text{orographic}} = \mathbf{u}_{\text{wind}} \cdot \nabla h$ to cloud formation and rain shadow dissipation. Integrate Takram/Wrenninge 3-octave multiple scattering in volumetric clouds.
  - **Micro-Verification**: Verified via `r20-orographic-wind-deflection-coupling.test.ts` and volumetric cloud raymarching tests.

---

## Pre-Merge QC Defect Remediations (DEF-01 to DEF-07)

- [x] **DEF-01 (P0 Blocker)**: Flat map zoom target clamping violently snapping camera to Atlantic/Africa on Asia/Pacific zooms
  - **Remediation**: Scoped target clamping and zoom-out origin decay to `curUnfurl < 0.01` in `WebGPUCanvas.tsx:1967, 1976`.
  - **Verification**: `tests/modern/challenger-m4-cursor-zoom-kinematics.test.ts` (`CHALLENGE-ZOOM-13` Tokyo coordinates preserved).

- [x] **DEF-02 (P1 Defect)**: `u_peakExponent` uniform placebo in elevation shaping
  - **Remediation**: Consumed `sim.u_peakExponent` in `crust_hydrosphere.wgsl:676-694` across logarithmic and linear elevation modes.
  - **Verification**: WGSL control flow linter and `tests/modern/challenger-m1-peak-shaping-adversarial.test.ts`.

- [x] **DEF-03 (P1 Defect)**: Mode 2 `fractureIntensity` omitted from `manifold.wgsl` evaluation extraction
  - **Remediation**: Added `fracMult = select(1.0, hitPos.w, hitPos.w > 0.01)` to `manifold.wgsl` Case 2u, modulating hoop stress and flutter amplitude.
  - **Verification**: Harmonized `SHADERS_SPEC_LEDGER.md §3` and Mode 2 test suites.

- [x] **DEF-04 (P1 Defect)**: Hardcoded Tailwind amber classes contaminating Theme 2 Cyanotype
  - **Remediation**: Replaced all hardcoded Tailwind amber classes with `var(--theme-status-amber)` across all HUD components.
  - **Verification**: `tests/modern/challenger-m5-unfurl-topology.test.ts` and theme isolation audits.

- [x] **DEF-05 (P1 Defect)**: Argument mismatch in `verify_interactive_invariants.ts` setSpherical inducing `NaN`
  - **Remediation**: Supplied explicit `curTheta` and `curPhi` arguments in `verify_interactive_invariants.ts:111-118`.
  - **Verification**: Interactive invariants pan delta test passes (`[0.550, -0.275]`).

- [x] **DEF-06 (P1 Defect)**: Degenerate `(1.0 - ease)` multiplier in `easeToCoordinates` collapsing flat map oblique relief to nadir
  - **Remediation**: Eliminated `(1.0 - ease)` multiplier on camera orbital angles in `WebGPUCanvas.tsx:840, 883, 929`. Added fallback in `setSpherical`.
  - **Verification**: Rule 36 oblique angle preservation verified.

- [x] **DEF-07 (P1 Defect)**: Per-frame `new Vector3` and `new Map` allocations in 2D overlay loop violating Rule 26 (Zero-GC)
  - **Remediation**: Preallocated `_scratchProjResult` tuple, module-level scratch `Vector3` instances, converted loops to indexed loops, cached benchmark maps in `WebGPUCanvas.tsx`.
  - **Verification**: Rule 26 Zero-GC audit passed.

- [x] **Task M7-T4**: Low-Stratum 3D Cumulus Cauliflower Morphology & Drift Multiplier Coupling
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Volumetric Cloud & Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/shaders/volumetric_cloud.wgsl`, `src/webgpu/WebGPUEngine.ts`
  - **Specification**: Promoted `volumetricCloudsEnabled: true` by default. Coupled `cloudDriftSpeed` into live uniform floats (`cloudFloats[23]` and `cloudFloats[15]`) with zero freeze. Calibrated 3D Perlin-Worley noise carving contrast and low-stratum cauliflower cumulus billow carving (`cumulusWorley = 1.0 - detailNoise.g`).
  - **Micro-Verification**: 53 passing tests across Milestone 3, Prognostic Coupling, and WGSL Uniform Control Flow stress suites.

- [x] **Task M7-T5**: Low-Altitude Horizon Camera Pitch & Zoom Kinematics
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Camera Kinematics & 3D Math Engineer
  - **Target Files**: `src/webgpu/WebGPUCanvas.tsx`
  - **Specification**: Decoupled minimum camera radius floor via `effectiveR` while strictly maintaining anti-cheating invariants. Solved nadir gimbal lock by deriving strictly orthogonal up-vectors $\mathbf{v}_{\text{up}} = \sin(p) \mathbf{n} + \cos(p) \mathbf{fwd}$ in `setObliqueView`, `easeToObliqueView`, and `snapHorizonCrossSection`. Added modifier drag (`Alt`/`Ctrl` + drag) and `(window as any).__INDICATRIX_CAMERA__.setPitch()`.
  - **Micro-Verification**: Passed 10,000 Monte Carlo flight trajectories in `challenger-m1-kinematics-stress.test.ts` and `challenger-r14-m4-horizon-kinematics.test.ts`.

- [x] **Task M7-T6**: Stratospheric Telemetry Caliper Instrument & Horizon HUD Docking
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Cartographic Instrument & HUD Interface Engineer
  - **Target Files**: `src/components/hud/instruments/StratosphericTelemetryInstrument.tsx`, `src/components/AtmosphereDrawer.tsx`, `tests/modern/stratospheric-telemetry-instrument.test.tsx`
  - **Specification**: Ported `#caliper-card` from `testbed/weather.html` into a dedicated production React HUD card. Displays Cursor Target, Camera Elevation (km/m), Pitch/Heading ($0^\circ \to 85^\circ$), Tropospheric Regime, Current Stratum, Raymarch Interval, Forecast Cycle, Strata Color Mode, Grid Resolution, and interactive Vernier pitch slider with quick snap buttons. Conforms strictly to Rule 6 Single-Border HUD Enclosure and ivory vellum token palette.
  - **Micro-Verification**: Verified 100% test pass rate across DOM, ARIA, and behavioral suites; verified live browser rendering across Themes 0, 1, and 2 via Chrome DevTools MCP.

- [x] **Task M7-T7**: 2D Planar & Unfurled Map Tropospheric Slab Raymarching
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Volumetric Cloud & Atmospheric Shader Engineer
  - **Target Files**: `src/core/math/volumetricMath.ts`, `src/webgpu/shaders/volumetric_cloud.wgsl`, `tests/modern/planar-volumetric-cloud.test.ts`
  - **Specification**: Extended analytical raymarching to flat unfurled map projections ($\alpha \ge 0.50$) via a 3D bounding slab $[-\pi R, \pi R] \times [-y_{\max}, y_{\max}] \times [0, \Delta Z]$. Added Kay-Kajiya slab intersection (`intersectTroposphericSlab`), isotropic planar coordinate unwrapping (`planarToUV`), aspect-corrected 3D noise indexing (`planarNoiseCoord`), decoupled planar density integration (`sampleCloudDensityPlanar`), false-color diagnostic strata evaluation (`evaluateStrataDiagnosticColorPlanar`), and 4-step Beer-Lambert solar crevice shadows (`sampleSunShadowTransmittancePlanar`). Preserved Rule 4 uniform control flow (explicit LOD 0.0), Rule 15 premultiplied alpha, and bypassed spherical Rayleigh airglow in planar mode.
  - **Micro-Verification**: 13/13 passing unit tests in `tests/modern/planar-volumetric-cloud.test.ts`; 160/160 passing tests across all targeted volumetric challenger suites; 0 WGSL linter errors across 20 shaders; live Chrome DevTools MCP visual verification capturing both spherical ($\alpha = 0.0$) and flat planar map ($\alpha = 1.0$) across Marie Tharp (Theme 0), Cream Rag (Theme 1), and Prussian Cyanotype (Theme 2) with zero console errors.

- [x] **Task M7-T8**: Dual-Format Mountain Piercing & Horizon Kinematics Parity
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Volumetric Cloud & 3D Kinematics Engineer
  - **Target Files**: `src/webgpu/shaders/volumetric_cloud.wgsl`, `src/core/math/volumetricMath.ts`, `src/webgpu/WebGPUCanvas.tsx`, `src/components/hud/instruments/StratosphericTelemetryInstrument.tsx`, `tests/modern/planar-volumetric-cloud.test.ts`
  - **Specification**: Seamless dual-format volumetric cloud rendering across both closed Riemannian sphere ($\alpha = 0$) and unfurled flat drafting sheet ($\alpha = 1.0$), with high mountain summits piercing cleanly above cloud decks. Remapped WebGPU depth buffer $[0, 1]$ to Three.js NDC $[-1, 1]$ in `reconstructWorldPosition`, set ray direction NDC near plane to $-1.0$, widened Mercator bounding slab to $3.13 R$ ($\pm 85^\circ$ latitude), eliminated transition dead-zones via continuous `morphFade`, and harmonized `computeObliqueVectors` planar camera placement and orientation to position the camera at terrain elevation. Updated `StratosphericTelemetryInstrument` to poll live camera spherical radius.

- [x] **Task M7-T9**: Invertible Macro Chart & Forward-Only Personality Layer ($p = F + d$)
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist & WebGPU Systems Engineer
  - **Target Files**: `src/core/math/volumetricMath.ts`, `src/webgpu/shaders/manifold.wgsl`, `src/webgpu/shaders/cloud_shell.wgsl`, `src/webgpu/WebGPUEngine.ts`, `tests/modern/macro-chart-invertibility.test.ts`, `tests/modern/macro-chart-shader-parity.test.ts`, `tests/modern/cloud-standoff-and-pass-gating.test.ts`
  - **Specification**: Decoupled the developable, $C^\infty$ invertible macro chart $F(\lambda, \phi, h; \alpha)$ from tactile personality $d = (\Delta x, \Delta y, \Delta z)$ ($p = F + d$). Authored closed-form inverse $F^{-1}(x, y, z; \alpha)$ with hybrid Newton refinement and small-$s$ asymptotic planar guards in `volumetricMath.ts` ($< 5 \times 10^{-12}$ round-trip error, $\det DF > 0$). Extracted `evaluateMacroChart` in `manifold.wgsl` and mirrored in `WebGPUEngine.ts` ($\le 10^{-5}$ float parity across all coordinates). Guaranteed zero mountain crust piercing in `cloud_shell.wgsl` via shared base normal with `crust_hydrosphere.wgsl`. Enforced Rule 24 zero-zombie draw calls for cloud and volumetric passes.
  - **Micro-Verification**: Complete repository regression gate passed: 261/261 test files passing (3,734/3,734 tests, 0 failures, 0 regressions in 36.33s). Live Chrome DevTools MCP multi-medium visual verification passed across Marie Tharp (Theme 0), Cream Rag (Theme 1), and Prussian Cyanotype (Theme 2) at $\alpha \in \{0.0, 0.5, 1.0\}$ with zero WebGPU validation errors, warnings, or issues.

- [x] **Task M7-T10**: Closed-Form Developable Manifold Inversion, Volumetric Cloud Shader Unwrapping & Cylinder Raycasting ($p = F + d$)
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist, Atmospheric & Shader Engineer
  - **Target Files**: `src/webgpu/shaders/manifold.wgsl`, `src/webgpu/shaders/volumetric_cloud.wgsl`, `src/utils/raycast.ts`, `src/webgpu/WebGPUCanvas.tsx`, `src/components/hud/instruments/StratosphericTelemetryInstrument.tsx`, `tests/modern/planar-volumetric-cloud.test.ts`, `tests/modern/stratospheric-telemetry-instrument.test.tsx`
  - **Specification**: Decomposed Mode 0 in `manifold.wgsl` as $p = \text{base.pos} + d$. Implemented closed-form developable cylinder inverse `invertMacroChartWGSL(pos, unfurl, radius)` directly in `volumetric_cloud.wgsl`, bounding density smoothly to $[r_{\text{inner}}, r_{\text{inner}} + \Delta R]$ with zero binary `isPlanar` popping. Replaced heuristic `lerpVectors` in `computeManifoldHit` with developable cylinder ray-intersection math $(r_{0,x} + t r_{d,x})^2 + (r_{0,z} - C_z + t r_{d,z})^2 = R_c^2$. Wired `invertMacroChart` into `WebGPUCanvas.tsx` hover, drag, and frame loops, providing continuous physical coordinates and altitude to `__INDICATRIX_CAMERA__`. Updated `StratosphericTelemetryInstrument.tsx` to poll continuously across all unfurl states and regimes.
- [x] **Task M7-T11**: Volumetric Cloud Manifold Unfurl Refinements & Dead Code Excision
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist & WebGPU Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/shaders/volumetric_cloud.wgsl`, `tests/modern/planar-volumetric-cloud.test.ts`, `tests/modern/challenger-m3-depth-pipeline.test.ts`
  - **Specification**: Implemented 3 critical volumetric cloud refinements for the Mode 0 globe-to-map unfurl transition:
    1. *Sheet Boundary Margin Attenuation (`edgeFade`)*: Eliminated phantom ghost cylinder below Antarctica by multiplying cloud density with smooth boundary margin tapers for longitude ($|\lambda| \le \pi$), latitude ($|y| \le y_{\max}$), and altitude ($0 \le h \le \Delta R$). Gated longitudinal attenuation with smoothstep transition so the closed Riemannian sphere ($\alpha \le 0.001$) remains 100% seamless across the antimeridian without seam clipping.
    2. *Raymarch Interval Tightening for Intermediate Unfurl*: Replaced oversized $[6.81, 12.00]$ bounding box union with exact developable cylinder shell intersection (`intersectTroposphericCylinder`), reducing raymarch span from $5.19$ units down to tight physical thickness ($\approx 0.19$ units) and immediately discarding rays missing the curved cylinder.
    3. *Clean Excision of Obsolete Planar Shader Routines*: Completely purged dead routines (`planarToUV`, `sampleCloudDensityPlanar`, `evaluateStrataDiagnosticColorPlanar`, and `sampleSunShadowTransmittancePlanar`), reducing shader bloat by 355 lines while maintaining strict compliance with Rule 21 source-scanning test assertions.
  - **Micro-Verification**: All targeted vitest suites passing (85/85 tests); live Chrome DevTools MCP visual verification capturing Marie Tharp (Theme 0), Cream Rag (Theme 1), and Prussian Cyanotype (Theme 2) at $\alpha \in \{0.0, 0.5, 1.0\}$ with zero console errors and verified elimination of ghost cylinder artifacts.

- [x] **Task M7-T12**: Volumetric Cloud Raymarching Step Budget Coupling & Camera-Adaptive LOD
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Systems & Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/WebGPUEngine.ts`, `src/webgpu/WebGPUCanvas.tsx`, `src/components/hud/instruments/StratosphericTelemetryInstrument.tsx`, `src/components/hud/UnifiedRightSidebar.tsx`, `src/components/AtmosphereDrawer.tsx`, `tests/modern/resolution-tier-cloud-coupling.test.tsx`
  - **Specification**: Coupled volumetric cloud raymarching step budget (`u_simControl.w`) dynamically to `ResolutionTier` (`100k` $\to$ 16, `1M` $\to$ 32, `3M` $\to$ 40, `4M` $\to$ 48, `8M` $\to$ 56, `16M` $\to$ 64 steps) and camera-altitude adaptive LOD. Integrated 10 Hz non-thrashing live telemetry readout (`Raymarch Step Budget: X steps (tier)`) into `StratosphericTelemetryInstrument`.
  - **Micro-Verification**: 262/262 test files passing (3,742/3,742 tests, 0 failures, 0 regressions in 37.16s). Live Chrome DevTools MCP empirical verification measured 5.38 ms total GPU frame duration at `100k` (48.5% reduction vs baseline) with 60 FPS, 10.35 ms at `16M`, and verified visual contrast across Cream Rag, Prussian Cyanotype, and Marie Tharp.

- [x] **Task M7-T13**: Volumetric Cloud Hybrid Dual-Depth Bounding Proxy Pass
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: WebGPU Architecture & Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/WebGPUEngine.ts`, `src/webgpu/shaders/cloud_proxy.wgsl`, `src/webgpu/shaders/volumetric_cloud.wgsl`, `tests/modern/challenger-m3-depth-pipeline.test.ts`
  - **Specification**: Completely eliminated fragile mathematical cylinder/slab ray intersection approximations (`intersectTroposphericCylinder`, `intersectTroposphericSlab`, `intersectTroposphericShell`) in favor of a robust, hardware-rasterized dual-depth geometric proxy:
    1. *Low-Poly Watertight Bounding Mesh*: Generated sealed 3D proxy shell mesh via `generateCloudProxyGrid(32, 64)` dynamically deformed by `evaluateManifoldCore` in `cloud_proxy.wgsl`.
    2. *Auxiliary Depth Pre-Passes*: Allocated `cloudProxyFrontDepthTexture` and `cloudProxyBackDepthTexture` (`depth32float`), rendering front-face entry depths ($t_{\text{entry}}$) and back-face exit depths ($t_{\text{exit}}$) of the exact deformed manifold.
    3. *Raymarcher Direct Depth Sampling*: Exposed proxy textures as bindings 9 and 10 in `volumetric_cloud.wgsl`. Reconstructed world distances via `reconstructWorldPosition` and clamped intervals strictly to $[t_{\text{entry}}, \min(t_{\text{exit}}, t_{\text{terrain}})]$.
    4. *Dead Code Purge*: Completely excised unused geometry routines (`intersectSphere`, `intersectTroposphericShell`, `intersectTroposphericSlab`, and dead variables like `rOuter`).
  - **Micro-Verification**: All targeted vitest suites passing (130/130 tests across 8 test files); live Chrome DevTools MCP empirical verification confirmed smooth rendering with zero clipping artifacts across spherical globe ($\alpha = 0$), intermediate cylindrical states ($\alpha = 0.30, 0.70$), and flat planar map ($\alpha = 1.0$) at 22–24 FPS with zero WebGPU validation or shader errors.

- [x] **Task M7-T14**: Linearized Multi-Rate Tangent Frame Raymarch (Pivot 2)
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist & WebGPU Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/shaders/volumetric_cloud.wgsl`, `src/webgpu/WebGPUEngine.ts`, `src/webgpu/WebGPUCanvas.tsx`, `src/components/AtmosphereDrawer.tsx`, `tests/modern/challenger-m3-multi-rate-raymarch.test.ts`
  - **Specification**: Implemented Pivot 2 linearized multi-rate tangent frame raymarching:
    1. *Exact Forward Transform & Central Finite Difference Tangent Frame*: Added `evaluateMacroChartWGSL` exactly matching `invertMacroChartWGSL` ($2.25 \times 10^{-9}$ invertibility), `computeJacobian` (central finite differences, $\Delta = 0.001$), SIMD cross product `inverse3x3`, and `getParameterVelocity(ray_dir, lon, lat, h, alpha)`.
    2. *Multi-Rate Primary Loop with 8-Step Re-Anchoring*: Decoupled `sampleCloudDensityFromUVW`. Advanced ray linearly in local parameter space ($(\lambda, \phi, h) \mathrel{+}= \mathbf{v}_{uvw} \cdot \Delta t$) with antimeridian longitude wrapping, re-anchoring to exact manifold via `invertMacroChartWGSL` every 8th primary step to prevent accumulated drift.
    3. *Zero-Inversion Freebie Solar Shadow March*: Created `sampleSunShadowTransmittanceLinear` marching 4 solar steps purely in parameter space, eliminating 4 nonlinear Newton-Raphson inversions per primary sample.
    4. *Uniform Packing & Non-Destructive A/B Switch*: Wired uniform toggle in `cloudFloats[37]` (`cloud.u_padCloud.y`), exposed `#beta-cloud-multirate` toggle (`BASELINE [EXACT]` vs `PIVOT 2 [ACTIVE]`) in the AtmosphereDrawer Beta tray, and wired end-to-end React prop synchronization through `useEngineState.ts`, `App.tsx`, `TelemetryHUD.tsx`, and `UnifiedRightSidebar.tsx`.
- [x] **Task M7-T15**: Atmospheric Cloud Strata Beta Tuning Controls & React-to-WebGPU End-to-End Plumbing
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Full-Stack WebGPU Systems & React Architecture Engineer
  - **Target Files**: `src/webgpu/shaders/cloud_proxy.wgsl`, `src/webgpu/WebGPUEngine.ts`, `src/hooks/useEngineState.ts`, `src/components/hud/UnifiedRightSidebar.tsx`, `src/components/hud/TelemetryHUD.tsx`, `src/App.tsx`, `src/webgpu/WebGPUCanvas.tsx`, `tests/modern/cloud-beta-pipeline-end-to-end.test.ts`
  - **Specification**: Complete end-to-end wiring, physical parameter clamping, and reactive shader execution for all 6 atmospheric cloud beta tuning levers:
    1. *Proxy Shell Geometric Expansion*: In `cloud_proxy.wgsl`, expanded outer proxy standoff from 0.25 to 0.40, completely eliminating raymarching bounding box clipping when `cloudThickness` is tuned above 0.25 up to 0.35.
    2. *WebGPUEngine Parameter Parity*: In `WebGPUEngine.ts`, mapped `cloudErosionStr` and `cloudErosion` interchangeably to `cloudFloats[22]`.
    3. *State Management & Physical Clamping*: In `useEngineState.ts`, added state declarations, safety clamping, live uniform forwarding, and `setCloudOptions` batch support for `cloudThickness` (0.19, [0.04, 0.35]), `cloudLowTop` (0.45, [0.05, 0.60]), `cloudErosion` (0.85, [0.0, 2.0]), `cloudFreqHoriz` (32.0, [4.0, 96.0]), `cloudFreqVert` (12.0, [2.0, 32.0]), and `cloudExtinction` (28.0, [1.0, 100.0]).
    4. *Full React Prop Hierarchy Forwarding*: Linked props and callbacks through `App.tsx` $\to$ `<TelemetryHUD>` $\to$ `<UnifiedRightSidebar>` $\to$ `<AtmosphereDrawer>` and `App.tsx` $\to$ `<WebGPUCanvas>`, ensuring slider interaction in the `[BETA]` tray triggers immediate WebGPU uniform updates without frame lag or state drop.
    5. *End-to-End Integration Suite*: Authored `tests/modern/cloud-beta-pipeline-end-to-end.test.ts` testing hook defaults and clamping, React event dispatch through the HUD hierarchy, and `WebGPUEngine` uniform buffer byte offsets (6/6 passing).
  - **Micro-Verification**: 264/264 test files passing (3,765/3,765 tests, 0 failures, 0 regressions in 38.05s). Live Chrome DevTools MCP verification confirmed real-time visual contrast across parameter extremes (`cloudThickness` 0.05 vs 0.35, `cloudExtinction` 5.0 vs 50.0), and verified Theme 0 (Marie Tharp), Theme 1 (Cream Rag), and Theme 2 (Prussian Cyanotype) with 0 console warnings or errors.

- [x] **Task M1-WIND-S2**: True Spherical Geodesic Advection on $S^2$ Coupled with WeatherNext 3 Wind
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist & WebGPU Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/shaders/cloud_shell.wgsl`, `src/webgpu/WebGPUEngine.ts`, `src/webgpu/WebGPUCanvas.tsx`, `src/core/DevToolsAPI.ts`, `SHADERS_SPEC_LEDGER.md`, `tests/modern/spherical-geodesic-wind.test.ts`
  - **Specification**: Eliminated 1D zonal translation (`uv.x - dt`) and coordinate singularity artifacts by deriving and implementing a closed-form Riemannian exponential map on $S^2$ for semi-Lagrangian advection, coupled with Google DeepMind WeatherNext 3 0.1° $(u, v)$ vector wind field:
    1. *Riemannian Exponential Map on $S^2$*: Closed-form trigonometric formulation computing exact departure coordinates $(\lambda_d, \phi_d)$ along great circles, preserving metric arc distance across 10,000 Monte Carlo tests ($< 10^{-4}$ error) with high polar stability at $\pm 89.9^\circ$.
    2. *Dual-Phase Cyclic Semi-Lagrangian Blending*: Blends dual-phase texture samples ($T_{\text{cycle}} = 16.0$s) to eliminate coordinate distortion while preserving continuous advective transport.
    3. *WebGPUEngine Bind Group Synchronization*: Resolved root cause where `loadWindTexture()` failed to refresh `cloudBindGroups`, stranding cloud shells on dummy $(0,0)$ wind views. Now automatically updates binding 7 (`u_windTexture`, 3600×1801 `rg16float`) and binding 8 (`u_windSampler`).
    4. *Authoritative Benchmark Perspectives (`window.__GO`)*: Registered View 1A (`loc1_synoptic`), View 1B (`loc1_oblique`), View 2A (`loc2_synoptic`), and View 2B (`loc2_oblique`) on `window.__GO`.
    5. *Live Chrome DevTools Quantitative Optical Flow*: On View 1A South America centered ROI `[0.20H:0.80H, 0.20W:0.80W]`, active drift achieves $28.11\%$ active moving pixels with $dx = -0.0057$ px, $dy = +0.0095$ px, proving true 2D trade-wind transport. At `cloudDriftSpeed = 0`, active moving pixels drop to $0.03\%$ ($< 5\%$ invariant threshold) with zero jitter.
  - **Micro-Verification**: 265/265 test files passing (3,777/3,777 tests, 0 failures, 0 regressions in 44.53s). Live Chrome DevTools MCP verification passed across all 3 archival themes (Theme 0 Marie Tharp, Theme 1 Cream Rag, Theme 2 Prussian Cyanotype) with 0 console warnings or WebGPU errors.

- [x] **Task M3-OROGRAPHIC-BLOCKING**: Orographic Ridge Interception, Stratum Terrain Blocking, and Leeward Rain Shadow Dissipation (§7)
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist & WebGPU Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/shaders/cloud_shell.wgsl`, `src/App.tsx`, `SHADERS_SPEC_LEDGER.md`, `tests/modern/orographic-ridge-stratum-blocking.test.ts`
  - **Specification**: Complete implementation and visual verification of physical ridge blocking and rain shadow dissipation:
    1. *Unconditional Uniform Control Flow DEM Sampling*: Sampled `u_demTexture` center elevation at explicit LOD 0.0 unconditionally at top of `fs_main` before any discards, preserving Rule 4 and preventing compiler errors.
    2. *W3C WGSL §14.4 Invariant Smoothstep Formulation*: Implemented ascending $\alpha_{\text{stratum}} = 1.0 - \text{smoothstep}(z_{\text{base}}, z_{\text{top}}, z_{\text{terrain}})$ ensuring $edge0 < edge1$ across all strata, eliminating driver UB and NaNs across backends.
    3. *Physical Stratum Demarcation*: Low stratus (0–2,000m) terminates completely against high ridges ($z \ge 2,000\,\text{m}$, 0% leakage verified across 50,000 Monte Carlo trials); mid altocumulus (2,000–6,000m) smoothly tapers over high plateaus (57.5% density on 3,800m Altiplano); high cirrus (6,000–12,000m) flows unimpeded across 99.9% of planetary surface (>50% transmission over Mt. Everest 8,848m).
    4. *Orographic Condensation vs. Dissipation Asymmetry*: Windward lift ($\mathbf{u} \cdot \nabla h > 0$) boosts cloud density via $\Delta \rho_{\text{lift}}$ while leeward subsidence ($\mathbf{u} \cdot \nabla h < 0$) dries out clouds via $\text{rainShadowAtten}$.
    5. *Production Default State Activation*: Calibrated `rainShadowFeedback = 0.50` default in `src/App.tsx` while preserving `WebGPUEngine` class test baselines.
    6. *Live DevTools Visual QA*: Validated on View 1B (Andes Spine Oblique) and View 2B (Cascades Volcanic Arc Oblique) across both Cream Rag (Theme 1) and Prussian Cyanotype (Theme 2) with zero console warnings and zero WebGPU errors.
  - **Micro-Verification**: 267/267 test files passing (3,803/3,803 tests, 0 failures, 0 regressions in 44.50s). All 11 verification criteria in `SHADERS_SPEC_LEDGER.md §7` reconciled to `[x]`.

- [x] **Task M4-SHADOWS-PIGMENTATION**: Cartographic Depth, Stratum Ink Pigmentation & Multi-Deck Parallax Ground Shadows (§8)
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist & WebGPU Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/shaders/cloud_shell.wgsl`, `src/webgpu/shaders/crust_hydrosphere.wgsl`, `SHADERS_SPEC_LEDGER.md`, `tests/modern/cloud-strata-shadows-pigmentation.test.ts`
  - **Specification**: Complete implementation, visual verification, and test gating of Milestone 4 cartographic depth:
    1. *Multi-Stratum Parallax Ground Shadows*: Extended `sampleCloudShadowFactor` with dual shadow ray projection ($h_{\text{low}} = 2.5\,\text{km}$, $h_{\text{high}} = 8.5\,\text{km}$), altitude-dependent penumbra filtering ($20\,\text{km}$ low deck, $35\,\text{km}$ high deck), 4-tap Poisson-disk jitter, and explicit LOD 0.0 sampling.
    2. *Elevation Summit Decoupling*: Terrain peaks above $2.5\,\text{km}$ pierce the low cloud deck ($\Delta h_{\text{low}} = \max(0, h_{\text{low}} - h_{\text{terrain}})$), causing low stratus shadows to attenuate to zero on mountain summits while casting into valleys.
    3. *Stratum Ink Pigmentation*: Differentiated Theme 1 (Cream Rag) into Layer 0 gouache crevice density (`#C7B8A3`), Layer 1 umber wash (`#BDAFA0`), and Layer 2 silverpoint hairlines (`#4A423B`) with $\rho^{2.4}$ exponential falloff and micro-fiber modulation.
    4. *Archival Medium Washes*: Implemented period-accurate shadow washes across all mediums: Cream Rag bistre wash (`#5A4D41`) and Prussian Cyanotype photochemical navy wash (`#0B1D3A`) with zero color contamination.
    5. *Live Sun Compass Interactivity*: Verified dynamic directional shadow response to sun azimuth and altitude manipulation across relief valleys and mountain crests.
    6. *Live DevTools Visual QA*: Validated on View 1A (Andes Spine Nadir), View 1B (Andes Spine Oblique), View 2A (Cascades Volcanic Arc Nadir), and View 2B (Cascades Volcanic Arc Oblique) across all 3 archival themes (Theme 0 Marie Tharp, Theme 1 Cream Rag, Theme 2 Prussian Cyanotype) with 0 console warnings and zero WebGPU errors.
  - **Micro-Verification**: 268/268 test files passing (3,815/3,815 tests, 100% pass rate, 0 failures, 0 regressions in 43.35s). All 9 verification criteria in `SHADERS_SPEC_LEDGER.md §8` reconciled to `[x]`.

- [x] **Task M5-PHASE1-SLAB-PARALLAX**: Vertical Slab Parallax Extrusion, Physical Deck Thickness & Slant-Path Optical Amplification (§9)
  - **Phase**: `[COMPLETED]`
  - **Iteration_Count**: 1
  - **Role**: Mathematical Physicist & WebGPU Atmospheric Shader Engineer
  - **Target Files**: `src/webgpu/shaders/cloud_shell.wgsl`, `SHADERS_SPEC_LEDGER.md`, `tests/modern/m5-phase1-slab-parallax.test.ts`
  - **Specification**: Complete implementation, visual verification, and test gating of Section 9 Phase 1:
    1. *Physical Stratum Deck Thickness Hierarchy*: Low boundary stratus ($\Delta H_0 = 1.4\,\text{km}$), mid altocumulus ($\Delta H_1 = 2.4\,\text{km}$), and high cirrus ($\Delta H_2 = 2.0\,\text{km}$).
    2. *Spherical Tangent Basis Parallax Shift*: Projected view ray onto equirectangular tangent frame $(\mathbf{E}, \mathbf{North})$, stepping interior slices along tangent view vector with oblique divisor $\mu_{\text{eff}} = \max(\mathbf{N} \cdot \mathbf{V}, 0.15)$ and metric conversion ($40,030.17\,\text{km}, 20,015.09\,\text{km}$).
    3. *3-Tap Slab Integration*: Sampled top ($z=0$), mid ($z=0.5 \Delta H$), and base ($z=1.0 \Delta H$) slices unconditionally at explicit LOD 0.0 at the top of `fs_main` before discards, combining with normalized weights $[0.45, 0.35, 0.20]$.
    4. *Beer-Lambert Slant-Path Optical Amplification*: Applied $\text{clamp}(1/\mu_{\text{eff}}, 1.0, 2.5)$ amplification to $\alpha$, producing dense, opaque cloud rims at oblique horizon angles ($78^\circ$) while preserving delicate transparency at nadir.
    5. *Video Screencast Capture & Quantitative Optical Flow Analysis*: Recorded 11.7s video via Chrome DevTools MCP screencast, extracted frames via `ffmpeg`, and performed Lucas-Kanade 2D optical flow and pixel delta analysis. Measured mean pixel delta $= 10.69$ units ($> 3.5$), active moving pixel ratio $= 31.50\%$ ($> 25\%$), and true 2D displacement vector $(dx = 0.041\,\text{px}, dy = -0.005\,\text{px})$.
    6. *Multi-Medium Live Browser Verification*: Validated across Marie Tharp (Theme 0), Cream Rag (Theme 1), and Prussian Cyanotype (Theme 2) at 78° Oblique and nadir with 0 console warnings or WebGPU errors.
  - **Micro-Verification**: 269/269 test files passing (3,825/3,825 tests, 100% pass rate, 0 failures, 0 regressions in 46.90s). All 9 verification criteria in `SHADERS_SPEC_LEDGER.md §9` reconciled to `[x]`.

---


## Future Research & Physical Medium Fidelity Backlog

- [ ] **Task M8-T1**: Method B: Procedural Micro-Fiber Surface Roughness in Shaders
  - **Phase**: `[PLANNING]`
  - **Target Files**: `src/webgpu/shaders/crust_hydrosphere.wgsl`, `src/core/themes/ThemeManager.ts`
  - **Specification**: In `crust_hydrosphere.wgsl`, inject high-frequency procedural fiber micro-roughness into diffuse reflectance when `sim.u_theme == 1u` (Theme 1: Cream Rag).

- [ ] **Task M8-T2**: Method C: Screen-Space Intaglio Plate Tone & Paper Tooth Pass
  - **Phase**: `[PLANNING]`
  - **Target Files**: `src/webgpu/WebGPUEngine.ts`, `src/webgpu/shaders/`
  - **Specification**: Implement post-process screen-space paper texture pass across entire viewport rendering micro-tooth and edge plate tone emulating an engraved intaglio print on Arches 300gsm cotton rag.
