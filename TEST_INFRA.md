# Modern WebGPU Test Infrastructure (TEST_INFRA.md)
# Project: Indicatrix 3D Standalone WebGPU Modernization (ais-interactive-globe-to-map)

## 1. Test Philosophy

The test suite for the Indicatrix Modern WebGPU Instrument enforces an **opaque-box, requirement-driven testing philosophy**:
- **Authoritative Specifications**: All assertions are derived strictly from documented requirements in `ORIGINAL_REQUEST.md` (specifically `## 2026-09-06T17:20:58Z`) and architectural contracts in `PROJECT.md`.
- **Anti-Facade Invariant**: No facade tests that always pass without executing real logic are permitted. Every test exercises real mathematical operations, binary schema decoders, shader logic emulators, or component contracts.
- **Physical & Numerical Realism**: Vector coordinates, projection transformations, trigonometric functions, and buffer layouts are verified against geodetic, physical, and hardware limits (e.g. steradian limits on $S^2$, zero NaN/Infinity, memory bounds within Apple Silicon Unified Memory Architecture).
- **Progressive Testability & Isolation**: Tests are self-contained and isolated. They set up their own buffers, mock contexts when testing in headless environments, and do not depend on external live networks or execution order.

---

## 2. Tiered Testing Methodology

The test architecture divides behavioral verification across four rigorous tiers:

| Tier | Focus | Scope & Methodology |
|---|---|---|
| **Tier 1: Feature Contracts** | Primary Behavior & Happy Path | Validates direct function outputs, binary header structures, and component props against interface contracts in isolation. |
| **Tier 2: Boundary & Numerical Stress** | Edge Cases, Extremes & Singularity Guards | Validates boundary behaviors: $\alpha \in \{0.0, 10^{-4}, 0.5, 1.0 - 10^{-4}, 1.0\}$, camera distances $\text{camDist} \in [5.01, 100.0]$, pole singularities ($\pm 90^\circ$, $\pm 85^\circ$), antimeridian crossings ($\lambda = \pm\pi$), and empty/extreme inputs. |
| **Tier 3: Cross-Feature Combinations** | Multi-System Interactions | Validates interactions between systems: mode transitions under varying camera distances, day/night terminator transitions under varying sun azimuth/altitude, terrain displacement coupled with vector ribbons, and decoupled particle simulations. |
| **Tier 4: Empirical Hardware & Invariants** | Memory, Throughput & Data Integrity | Validates byte-accurate memory layouts (e.g., 260,640 bytes for NOAA GFS wind grids, 32-byte binary headers), workgroup limit compliance ($\le 65,535$ for 1D dispatches), and absence of forbidden legacy dependencies. |

---

## 3. Feature Inventory Matrix (F25 – F36)

The modernization roadmap introduces 12 new core features (F25 through F36) supporting Requirements R1 through R5:

| # | Feature | Requirement | Description | Tier 1 (Unit) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Empirical/Stress) |
|---|---|:---:|---|:---:|:---:|:---:|:---:|
| **F25** | 10m Vector Precomputation & Ingestion | R1 | 1:10m coastlines & rivers, antimeridian & Mercator cuts, `GVEC` 32-byte header, sub-km resolution | ✓ (Schema & Header) | ✓ (Antimeridian Seams) | ✓ (Terrain Coupling) | ✓ (Byte & Vertex Counts) |
| **F26** | DEM Conservative Max-Pooling | R1 | $0.4 \times \text{mean} + 0.6 \times \max$ downsampling across mip levels to preserve summit peaks | ✓ (Formula Precision) | ✓ (Single-Pixel Peaks) | ✓ (Plateau vs Peak) | ✓ (11 Mip Level Decay) |
| **F27** | Dynamic Peak Exponent Scaling | R1 | $u_{\text{peakExponent}}$ scales continuously from 1.0 (close-up $\le 8.0$) to 1.8 (orbit $\ge 25.0$) | ✓ (Scaling Curve) | ✓ (Dist Extrema) | ✓ (Silhouette Contrast) | ✓ (Shader Uniform Sync) |
| **F28** | NASA Blue Marble & Night Lights Draping | R2 | Dual 4096×2048 equirectangular texture ingestion via bindings 3 & 4 with copyExternalImageToTexture | ✓ (Binding Contract) | ✓ (Aspect & Resolution) | ✓ (Day/Night Balance) | ✓ (Zero CPU Retention) |
| **F29** | Celestial Solar Terminator Blending | R2 | True world-space celestial sun direction $\mathbf{n}_{\text{world}} \cdot \mathbf{L}_{\text{sun}}$ with twilight rim scattering | ✓ (Vector Direction) | ✓ (Zenith Cosine Bounds) | ✓ (Day/Night Hand-off) | ✓ (Twilight Rim Envelope) |
| **F30** | 5 Flawless Unfurl Modes | R2 | Modes 0–4 (Linear, Scroll, Griffith, Fluid, Dymaxion) continuous across $\alpha \in [0, 1]$ | ✓ (Mode Evaluation) | ✓ (Singularity Guards) | ✓ (Seam Continuity) | ✓ (0 NaN / 0 Inverted Normals) |
| **F31** | Decoupled 4.19M VRAM Particle Spawn | R2 | Procedural Fibonacci sphere boot compute pass (0 MB download); decoupled from 16.78M terrain mesh | ✓ (Fibonacci Formulas) | ✓ (Dispatch Bounds) | ✓ (Dual-Mesh Decoupling) | ✓ (Workgroup Count $\le 65,535$) |
| **F32** | Pure ES6 Camera Kinematics & Inertial Damping | R3 | Pure linear algebra & spherical trig in `cameraMath.ts`; native inertial gliding matching OrbitControls | ✓ (Matrix & Vec3 Math) | ✓ (Gimbal / Pole Clamping) | ✓ (Momentum Damping) | ✓ (Zero Three.js Classes) |
| **F33** | Three.js & WebGL2 Complete Retirement | R3 | Complete removal of Three.js / R3F dependencies, elimination of vendor chunks, clean SVG fallback | ✓ (Fallback Component) | ✓ (Viewport Resizing) | ✓ (WebGPU Check) | ✓ (Zero Three.js in Bundle) |
| **F34** | Real NOAA GFS Wind Grid Ingestion | R4 | $360 \times 181$ half-float binary grid (260,640 bytes) sampled via hardware bilinear texture | ✓ (Grid Dimensions) | ✓ (Velocity Invariants) | ✓ (Advection Corridors) | ✓ (Byte Count & Alignment) |
| **F35** | CelesTrak Starlink & ISS SGP4 Orbits | R4 | TLE schema parsing and SGP4 orbital propagation into instanced line ribbon vertices | ✓ (TLE Parsing) | ✓ (Eccentricity / Keplers) | ✓ (Ribbon Coupling) | ✓ (Orbit Radius Verification) |
| **F36** | HUD & UI/UX Modern Integration | R5 | Wiring Orbital Mode C, sun sliders, unfurl slider, NOAA/Starlink toggles, 16.7M & 4.19M telemetry | ✓ (Component Props) | ✓ (Slider Ranges) | ✓ (State Dispatch) | ✓ (Live Telemetry Labels) |

---

## 4. Test Suite Architecture

All modernization test suites reside in `tests/modern/`:

```
tests/modern/
├── r1-vector-dem-scaling.test.ts          # Covers F25, F26, F27 (Requirements R1)
├── r2-textures-terminator-unfurls.test.ts # Covers F28, F29, F30, F31 (Requirements R2)
├── r3-standalone-webgpu-math.test.ts      # Covers F32, F33 (Requirements R3)
├── r4-planetary-instrumentation.test.ts   # Covers F34, F35 (Requirements R4)
└── r5-hud-telemetry-controls.test.ts      # Covers F36 (Requirements R5)
```

### Execution Commands
- Run all modern test suites:
  ```bash
  npx vitest run tests/modern/
  ```
- Run a specific test suite:
  ```bash
  npx vitest run tests/modern/r1-vector-dem-scaling.test.ts
  ```

---

## 5. Coverage Thresholds & Quality Gates

1. **Pass Rate Gate**: 100% pass rate across all tests in `tests/modern/` (0 failures, 0 skipped, 0 flaky tests).
2. **Numeric Precision Gate**:
   - Vector coordinates on $S^2$: $\|p\| = R \pm 10^{-4}$.
   - Matrix inversions: $M \times M^{-1} = I \pm 10^{-4}$.
   - Conservative pooling: preserves isolated peak summits at $\ge 60\%$ elevation over 11 mip levels.
   - Solar terminator: zenith cosine $\mu_0 = \mathbf{n} \cdot \mathbf{L} \in [-1.0, 1.0]$.
3. **Hardware Constraint Gate**:
   - 1D compute workgroups: $\lceil N / 256 \rceil \le 65,535$.
   - GFS wind buffer: exactly $260,640$ bytes.
   - Vector binary header: exactly $32$ bytes with magic `0x47564543`.
4. **Cleanliness Gate**: Zero imports of `'three'`, `'@react-three/fiber'`, or `'@react-three/drei'` within modern architecture files.
