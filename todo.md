# Persistent State Ledger: Indicatrix WebGPU Macro-Loop (`todo.md`)

**Master Orchestrator**: Antigravity 2.0 Multi-Agent Framework  
**Target Codebase**: `ais-interactive-globe-to-map`  
**Operational Status**: `[ALL MILESTONES COMPLETED - 3,660/3,660 TESTS PASSING]`  
**Current Baseline**: 253 test files, 3,660 tests passing (100% pass rate, 0 failures, 0 regressions)  
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
