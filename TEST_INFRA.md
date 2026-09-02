# E2E Test Infra: ais-interactive-globe-to-map (1M-Node Volumetric Matrix)

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| F1 | Three.js Clock Migration | ORIGINAL_REQUEST R6 | 5 | 5 | ✓ | ✓ |
| F2 | Vite Chunk Splitting | ORIGINAL_REQUEST R6 | 5 | 5 | ✓ | ✓ |
| F3 | Parameterized Precompute CLI | ORIGINAL_REQUEST R6 | 5 | 5 | ✓ | ✓ |
| F4 | Interactive HUD Layer Selector | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ | ✓ |
| F5 | Moiré Mitigation & Point Attenuation | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ | ✓ |
| F6 | WebGL2 Backface Early-Out | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |
| F7 | 1M Fluid Mode Optimization (>=60 FPS) | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |
| F8 | Fuller Dymaxion Projection (0 NaN) | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ | ✓ |
| F9 | Fuller Planar Net Unfolding | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ | ✓ |
| F10 | Non-Blocking Cursor Screen Raycast | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ | ✓ |
| F11 | Fluid Lamb-Oseen Vortex Wake | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ | ✓ |
| F12 | Griffith Tensile Hoop Stress Probe | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ | ✓ |
| F13 | Dedicated WebGPU WGSL Compute Pipeline | ORIGINAL_REQUEST R5 | 5 | 5 | ✓ | ✓ |
| F14 | WebGPU Zero-Copy Render Pipeline | ORIGINAL_REQUEST R5 | 5 | 5 | ✓ | ✓ |
| F15 | WebGPU/WebGL2 Runtime HUD Switch | ORIGINAL_REQUEST R5 | 5 | 5 | ✓ | ✓ |
| F16 | 120 FPS WebGPU Execution at 1M Scale | ORIGINAL_REQUEST R5 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: Automated Node/Playwright test suite & TypeScript test harness.
- Execution command: `npm test` or `npx vitest run` / `npx playwright test`.
- Test case tiers:
  - **Tier 1 (Feature Coverage)**: Basic functionality per feature in isolation (>=5 tests per feature).
  - **Tier 2 (Boundary & Extreme Inputs)**: Alpha $\alpha \in \{0.0, 0.001, 0.5, 0.999, 1.0\}$, 1M node capacity, NaN checks, canvas resize $(0\times0, 3840\times2160)$.
  - **Tier 3 (Cross-Feature Combinations)**: Pairwise switching between modes (0..4), layers (0..2), backends (WebGL2/WebGPU), and active cursor drag.
  - **Tier 4 (Real-World Scenarios)**: High-resolution GIS inspection, rapid scrubbing stress testing, 1M node fluid morphing under continuous cursor wake, WebGPU fallback resilience.
  - **Tier 5 (Adversarial Coverage Hardening)**: White-box stress tests, memory leak checks, VRAM reallocation checks during mode switching.

## Acceptance Thresholds
- Tier 1: $\ge 80$ test cases (16 features $\times 5$)
- Tier 2: $\ge 80$ test cases (16 features $\times 5$)
- Tier 3: $\ge 16$ cross-feature interaction cases
- Tier 4: $\ge 8$ real-world simulation scenarios
- **Total Minimum**: $\ge 184$ automated test cases.
