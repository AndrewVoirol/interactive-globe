# Forensic Pre-Merge Quality Control Report: Branch `cdl_od_path_forward`

**Execution Date**: September 19, 2026  
**Auditor**: Antigravity Autonomous Investigation Worker  
**Audit Protocol**: Adversarial Pre-Merge Audit (Read-Only Forensic Phase)  
**Target Branch**: `cdl_od_path_forward` (Commit `22662b9`)  
**Base Rule Compliance**: Rules 3, 5, 21, 24, 26, 32, 35, 36

---

## Executive Summary

A comprehensive, read-only adversarial audit was conducted on branch `cdl_od_path_forward` across all five mandated quality control protocols. While the branch achieves **3,521 passing unit tests across 246 test suites** and demonstrates a watertight, crack-free CDLOD quadtree mesh engine, forensic examination revealed **several critical regressions and hidden defects** that unit tests failed to detect:

1. **P0 Blocker**: Flat map mouse wheel zoom clamps camera target vector length to $R \le 5.0$, causing severe target corruption and violent camera snapping towards the center of the world (Atlantic Ocean) when zooming in on Asia, Australia, Americas, or the Pacific.
2. **P1 Algorithmic Defect**: Horizontal dragging on the Hypsometric Relief Curve ("Peak Sharpness" / `peakExponent` from 0.5 to 3.0) is a **100% Dead Uniform Placebo** — `u_peakExponent` is declared in `SimUniforms` (float 60) but is never consumed anywhere in vertex displacement or fragment shading in `crust_hydrosphere.wgsl`.
3. **P1 Algorithmic Defect**: Mode 2 "Fracture Intensity" slider is a **100% Dead Uniform Placebo** — `fractureIntensity` is stored into `simFloats[11]` but zero shaders in the repository consume it.
4. **P1 Visual/Thematic Defect**: Seven hardcoded Tailwind `amber-500` utility classes in `UnifiedRightSidebar.tsx` contaminate the Prussian Cyanotype (Theme 2) aesthetic with warm amber/gold badges, violating Rule 3.
5. **P1 Performance Defect**: The 2D overlay projection loop in `WebGPUCanvas.tsx` instantiates multiple Three.js `Vector3` objects and a `Map` every frame, violating Rule 26.
6. **P1 Test Harness Defect**: `scripts/verify_interactive_invariants.ts` calls `setSpherical(12.0)` without theta/phi arguments, polluting camera state with `NaN`, which silently passes the panning test due to `NaN < 0.1` evaluating to `false`.
7. **P2 Uniform Placebo**: Water Clarity in the default ocean view (`renderStyle == 0`, `seaLevel == 0`) produces $\Delta\text{pixels} = 0$ because the liquid hydrosphere pass executes an early `discard;` at line 1049 of `crust_hydrosphere.wgsl`.

---

## Protocol 1: Live Interactive Kinematics & Ground Floor

**Verdict**: **FAIL (P0 Blocker + P1 Defect Detected)**

### Evaluated Invariants
1. **3D Flat Map Rotation**: PASS — Left-button drag rotates camera azimuth ($\theta$) and elevation ($\phi$) across $360^\circ \times 180^\circ$ on flat map mode (`unfurl = 1.0`).
2. **Zoom Monotonicity**: PASS — Radius decreases monotonically under controlled input; clamped to $h_{\text{floor}} \ge 5.0$.
3. **Camera Ground Clearance Floor**: PASS — Geodetic terrain-following ground floor guarantees camera radius $r \ge R_{\text{planet}} + h_{\text{DEM}} + 127\text{m}$.
4. **Decoupled Drafting Board Kinematics (Rule 36)**: **FAIL** — Multipliers like `(1.0 - ease)` in camera navigation methods collapse rotational degrees of freedom at `unfurl = 1.0`.
5. **Flat Map Zoom Boundary Integrity**: **FAIL (P0 Blocker)** — Extreme camera target clamping in `onWheel` corrupts flat map coordinates.

### Forensic Findings

#### 1. Flat Map Target Clamping & Snap Regression (P0 Blocker)
* **Location**: [`src/webgpu/WebGPUCanvas.tsx:1965-1968`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L1965-L1968)
* **Source Code**:
  ```ts
  const hitPos = currentHitPosRef.current;
  if (e.deltaY < 0) {
    if (hitPos) {
      const lerpFactor = Math.min(0.08, Math.abs(e.deltaY) * 0.0008);
      targetRef.current.lerp(hitPos, lerpFactor);
      const len = targetRef.current.length();
      if (len > 5.0) {
        targetRef.current.multiplyScalar(5.0 / len);
      }
    }
  ```
* **Analysis**:
  On a sphere, the planet surface is bounded by radius 5.0. On the flat map (`curUnfurl >= 0.01`), the projection sheet spans:
  $$X \in [-\pi R, \pi R] \approx [-15.707, 15.707], \quad Y \in [-12.5, 12.5]$$
  Any user zooming in on North America, South America, East Asia, Australia, or the Pacific has $\|T\| > 5.0$.
  Executing `targetRef.current.multiplyScalar(5.0 / len)` unconditionally clamps the target to an arbitrary circle of radius 5.0 centered at $(0, 0, 0)$ (Gulf of Guinea / West Africa).
* **Live Experimental Proof**:
  Executing camera focus on Tokyo ($139.69^\circ\text{E}, 35.68^\circ\text{N}$) on the flat map:
  ```json
  {
    "beforeTarget": [ 12.19025, 3.33693, 0.0 ],
    "afterTarget":  [  4.81867, 1.33434, 0.0 ]
  }
  ```
  A single mouse wheel tick shifted the target by $7.37$ units (60% of the entire distance to the origin), snapping the viewport violently towards the Atlantic Ocean.
* **Brittle Test Provenance**:
  This bug was directly driven by [`tests/modern/challenger-m4-cursor-zoom-kinematics.test.ts:42`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/tests/modern/challenger-m4-cursor-zoom-kinematics.test.ts#L42):
  ```ts
  it('CHALLENGE-ZOOM-02: Verifies targetRef is clamped to length <= 5.0 in WebGPUCanvas', () => {
    expect(canvasSrc).toMatch(/if\s*\(\s*len\s*>\s*5\.0\s*\)\s*\{\s*targetRef\.current\.multiplyScalar\(\s*5\.0\s*\/\s*len\s*\);\s*\}/);
  });
  ```
  The test scanner statically asserted this exact regex without verifying manifold mode gating, forcing the regression into production code.

#### 2. Degenerate Multipliers Collapsing Oblique Attitude (P1)
* **Location**: [`src/webgpu/WebGPUCanvas.tsx:840-845`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L840-L845), [`L883-L888`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L883-L888), [`L929-L945`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L929-L945)
* **Source Code**:
  ```ts
  const dirX = (1.0 - ease) * (sinPhi * sinTheta);
  const dirY = (1.0 - ease) * cosPhi;
  const dirZ = (1.0 - ease) * (sinPhi * cosTheta) + ease;
  ```
* **Analysis**:
  At `curUnfurl = 1.0` (`ease = 1.0`), `dirX = 0`, `dirY = 0`, and `dirZ = 1.0`.
  In `easeToCoordinates`, this forces `endPos = (endTarget.x, endTarget.y, endTarget.z + safeRadius)`.
  The camera attitude is forcefully collapsed to strictly nadir (perpendicular to map board) with zero pitch and zero yaw, violating Rule 36: *"Prohibition of Degenerate Multipliers: Never multiply orbital angle components by transition terms like (1.0 - ease) that collapse rotational degrees of freedom at boundary states."*

#### 3. Verification Harness NaN Pollution & Silent Pass (P1)
* **Location**: [`scripts/verify_interactive_invariants.ts:111-125`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/scripts/verify_interactive_invariants.ts#L111-L125), [`L153-L160`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/scripts/verify_interactive_invariants.ts#L153-L160)
* **Analysis**:
  `verify_interactive_invariants.ts` calls `c.setSpherical(12.0)`. Because `setSpherical` expects `(r, theta, phi)`, `theta` and `phi` become `undefined`.
  In `WebGPUCanvas.tsx`, `Math.sin(undefined)` returns `NaN`, poisoning `targetRef.current`.
  Invariant 3 subsequently logged `Pan Target Delta: [NaN, NaN]`.
  The check `if (Math.abs(panResult.dx) < 0.1 && Math.abs(panResult.dy) < 0.1) throw new Error(...)` evaluated `NaN < 0.1` to `false`, allowing the test to report:
  `PASS: Pan translates target across sheet cleanly.`

---

## Protocol 2: Dual-State Uniform Placebo Sweep

**Verdict**: **FAIL (2 Full Placebos + 1 Contextual Placebo)**

### Evaluated Uniforms Sweep Matrix
| Parameter / Uniform | Min Bound | Max Bound | Target WGSL Shader | Active Path Consumption | Delta Pixels | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Sun Azimuth** (`u_sunAzimuth`) | $45^\circ$ | $225^\circ$ | `crust_hydrosphere.wgsl` | Yes (Lines 1209-1210 hillshading) | $\Delta > 0$ | **PASS** |
| **Sun Altitude** (`u_sunAltitude`) | $15^\circ$ | $75^\circ$ | `crust_hydrosphere.wgsl` | Yes (Lines 1209-1210 hillshading) | $\Delta > 0$ | **PASS** |
| **Displacement Scale** (`u_displacementScale`) | $0.01$ | $0.20$ | `crust_hydrosphere.wgsl` | Yes (Line 671 `dispScale` in vertex shader) | $\Delta > 0$ | **PASS** |
| **Crevice Depth AO** (`u_ambientOcclusion`) | $0.0$ | $1.0$ | `crust_hydrosphere.wgsl` | Yes (Line 1221 `creviceAO` in fragment shader) | $\Delta > 0$ | **PASS** |
| **Paper Grain** (`u_roughness` in Theme 1) | $0.0$ | $1.0$ | `crust_hydrosphere.wgsl` | Yes (Line 1448 `fiberTooth` in Theme 1) | $\Delta > 0$ | **PASS** |
| **Sea Level Offset** (`u_seaLevel`) | $-100\text{m}$ | $+100\text{m}$ | `crust_hydrosphere.wgsl` | Yes (Coastline inundation / shelf exposure) | $\Delta > 0$ | **PASS** |
| **CDLOD Diagnostics** (`u_cdlodDiagnosticMode`) | $0.0$ | $3.0$ | `crust_hydrosphere.wgsl` | Yes (Lines 2110-2130 false-color plate) | $\Delta > 6.8\text{M}$ bytes | **PASS** |
| **Peak Exponent** (`u_peakExponent`) | $0.5$ | $3.0$ | `crust_hydrosphere.wgsl` | **NO (Declared at L27, NEVER READ)** | $\mathbf{\Delta = 0}$ | **FAIL (Placebo)** |
| **Fracture Intensity** (`fractureIntensity`) | $0.5$ | $2.5$ | No Shader | **NO (Uploaded to `simFloats[11]`, unread)** | $\mathbf{\Delta = 0}$ | **FAIL (Placebo)** |
| **Water Clarity** (`u_waterClarity` @ SeaLevel=0) | $0.10$ | $1.00$ | `crust_hydrosphere.wgsl` | **NO (Discarded by L1049 in default view)** | $\mathbf{\Delta = 0}$ | **FAIL (Placebo)** |

### Forensic Findings

#### 1. Peak Exponent / Mountain Sharpness Uniform Placebo (P1)
* **Location**: [`src/webgpu/shaders/crust_hydrosphere.wgsl:27`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/crust_hydrosphere.wgsl#L27), [`src/components/hud/instruments/HypsometricReliefCurve.tsx:39`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/components/hud/instruments/HypsometricReliefCurve.tsx#L39)
* **Analysis**:
  The `HypsometricReliefCurve` UI component claims to provide:
  *"2D Hypsometric Mountain Elevation Curve: Direct interactive control of 3D Relief Amplitude and Peak Sharpness"*
  Dragging horizontally updates `peakExponent` (from 0.5 to 3.0), which `WebGPUEngine.ts` writes into float 60 (`cf[60]`).
  Grep analysis of `src/webgpu/shaders/crust_hydrosphere.wgsl` reveals:
  ```wgsl
  Line 27: u_peakExponent: f32,
  ```
  `u_peakExponent` appears in `SimUniforms` struct definition and nowhere else in the 2,135 lines of the terrain shader. It is never referenced in `vs_main` (lines 668-698 compute linear or log elevation) and never referenced in `fs_main`. Adjusting Peak Sharpness has **zero visual effect** on terrain relief or shading.

#### 2. Mode 2 Fracture Intensity Uniform Placebo (P1)
* **Location**: [`src/components/hud/UnifiedRightSidebar.tsx:917-927`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/components/hud/UnifiedRightSidebar.tsx#L917-L927), [`src/webgpu/WebGPUEngine.ts:6719`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUEngine.ts#L6719)
* **Analysis**:
  When Mode 2 (Fracture) is selected, a VernierSlider renders for "Fracture Intensity" ($0.5\times$ to $2.5\times$).
  `WebGPUEngine.ts` writes this to `simFloats[11]`.
  A global search across all shaders in `src/webgpu/shaders/` yields zero matches for `fractureIntensity` or `simFloats[11]` consumption. It is a completely disconnected UI control.

#### 3. Water Clarity Ocean Discard Placebo (P2)
* **Location**: [`src/webgpu/shaders/crust_hydrosphere.wgsl:1049-1051`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/crust_hydrosphere.wgsl#L1049-L1051)
* **Source Code**:
  ```wgsl
  if (sim.u_renderStyle == 0u && abs(sim.u_seaLevel) <= 0.01 && z_lake <= 0.0) {
      discard;
  }
  ```
* **Analysis**:
  In commit `2216c25`, the liquid hydrosphere was gated by this early `discard;` in default relief style when `seaLevel == 0.0`.
  Because the hydrosphere shell is discarded, `computeHydrosphereShading()` (lines 370-495) never runs over ocean areas in the default state. `u_waterClarity` is only read inside `computeHydrosphereShading()` and is never consumed by the crust pass.
  As a result, moving the "Water Clarity" slider in the Bathymetric Tide Gauge produces $\Delta\text{pixels} = 0$ in the default application state. It only functions if the user first moves the Sea Level slider away from 0m.

---

## Protocol 3: CDLOD Terrain, Perimeter Skirts & High-Relief Topology Audit

**Verdict**: **PASS**

### Evaluated Invariants
1. **Perimeter Skirt Watertightness**: PASS — Zero sub-pixel cracks or light bleed across all oblique relief test angles.
2. **High-Relief Topologies**: PASS — Himalayas (Mount Everest), Hawaii (Mauna Kea/Haleakala), Alps (Matterhorn), and Grand Canyon render smoothly without cracking.
3. **Polar Latitude Geometries**: PASS — Singularity attenuation at $\ge 85^\circ$ latitude (`poleDist >= 0.85`) successfully damps Mercator and spherical pole pinches without topological rips.
4. **CDLOD Diagnostic Plate**: PASS — Modes 0 (Off), 1 (Integer LOD Hue), 2 (Morph Alpha Ramp), and 3 (Combined Plate) functional and dynamically selectable.

### Image-Based Crack Detection Evidence
Screenshots captured using non-headless WebGPU Playwright harness and analyzed via 2D sub-pixel neighborhood disparity sampling:
* `qc-cdlod-himalayas-oblique.png` (86.9°E, 27.9°N, pitch=60°): **0 bleed pixels (PASS)**
* `qc-cdlod-hawaii-oblique.png` (-155.5°W, 19.8°N, pitch=70°): **0 bleed pixels (PASS)**
* `qc-cdlod-greenland-polar.png` (-40.0°W, 75.0°N, alt=7.5): **0 bleed pixels (PASS)**
* `qc-cdlod-antarctica-polar.png` (0.0°W, -82.0°S, alt=8.0): **0 bleed pixels (PASS)**

---

## Protocol 4: Three-Theme Archival Parity Audit

**Verdict**: **FAIL (P1 Visual Contamination Detected)**

### Evaluated Invariants
1. **Theme 1 (Cream Rag Paper)**: PASS — Warm ivory tone (`#F3ECE0`), sepia drafting ink (`#38302A`, `#261E18`), paper tooth visible. Zero pitch-black (`rgb(0,0,0)`) pixels detected on map canvas (0 out of 5,184,000 pixels).
2. **Theme 0 (Marie Tharp Physiographic)**: PASS — Warm earth tones, Bruce Heezen/Marie Tharp physiographic stippling, abyssal plain wash.
3. **Theme 2 (Prussian Cyanotype)**: **FAIL** — While the WebGPU map canvas contains zero warm contamination (0 warm pixels in map area), the HUD overlay injects 752 warm gold/amber pixels (`#B39354`) via hardcoded Tailwind utility classes.

### Forensic Findings

#### Hardcoded Tailwind Amber Contaminating Cyanotype Theme (P1)
* **Location**: [`src/components/hud/UnifiedRightSidebar.tsx:1120, 1175, 1316, 1600, 1603, 1675, 1830`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/components/hud/UnifiedRightSidebar.tsx#L1120)
* **Source Code**:
  ```tsx
  Line 1120: <span className="... bg-amber-500/20 text-amber-500 border border-amber-500/30">
  Line 1175: <span className="text-nano font-mono text-amber-500 font-bold">
  Line 1316: <span className="... bg-amber-500/20 text-amber-300 border-amber-500/40">
  ```
* **Analysis**:
  Rule 3 states: *"Prussian Cyanotype (Theme 2): Cold blue-white on deep Prussian blue, sharp high-contrast linework, photochemical exposure aesthetic. Must evoke an 1842 blueprint. Zero warm yellow/gold/sepia contamination."*
  In [`src/core/themes/ThemeManager.ts:391`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/core/themes/ThemeManager.ts#L391), Theme 2 defines `statusAmber: '#7BA8C4'` (cold slate) specifically to neutralize warm tones.
  However, `UnifiedRightSidebar.tsx` bypasses the theme token and hardcodes literal Tailwind `text-amber-500` classes on diagnostic badges.
  In Theme 2, this renders 752 bright warm gold/amber pixels (`rgb(179, 147, 84)` / `#B39354`) on top of the Prussian blue blueprint cards.

---

## Protocol 5: Zero-GC Memory & Draw Pass Audit

**Verdict**: **FAIL (P1 Heap Allocation Defect Detected)**

### Evaluated Invariants
1. **WebGPUEngine Hot Path Zero-GC (Rule 26)**: PASS — `updateUniforms` and `render` contain zero typed array or buffer instantiations, updating exclusively via preallocated mirrors (`crustFloats`, `simFloats`, `reliefFloats`, etc.).
2. **Zero-Zombie Pass Gating (Rule 24)**: PASS — Volumetric clouds, atmospheric scattering, surface winds, jet stream, and CDLOD indirect draws are strictly decoupled and execute zero draw calls when disabled.
3. **2D Overlay Frame Loop Allocation (Rule 26)**: **FAIL** — `WebGPUCanvas.tsx` instantiates multiple Three.js `Vector3` objects and a `Map` per frame.

### Forensic Findings

#### Per-Frame Allocations in 2D Overlay Projection (P1)
* **Location**: [`src/webgpu/WebGPUCanvas.tsx:2854-2860`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L2854-L2860), [`L3066-L3067`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L3066-L3067)
* **Source Code**:
  ```ts
  const projectPoint = (x3: number, y3: number, z3: number): [number, number, boolean] => {
    const vec = new Vector3(x3, y3, z3);
    let isFront = true;
    if (curUnfurl < 0.35) {
      const norm = vec.clone().normalize();
      const vDir = new Vector3().subVectors(camera.position, vec).normalize();
  ...
  if (curShowTriangulation) {
    const bmMap = new Map<string, GeodeticBenchmark>();
    GEODETIC_BENCHMARKS.forEach((b) => bmMap.set(b.id, b));
  ```
* **Analysis**:
  In `renderLoop` (executing at 60–120 fps), `projectPoint` is called for every landmark, benchmark, and Tissot indicatrix. Each invocation creates 3 new `Vector3` heap objects.
  When Triangulation is enabled, a `new Map()` is instantiated on every frame.
  This creates hundreds of ephemeral objects per second, inducing GC pauses during continuous user panning and rotation.

---

## Defect Remediation & Verification Ledger

| ID | Protocol | Severity | Description | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **DEF-01** | Protocol 1 | **P0 Blocker** | Flat map zoom clamps target to $\|T\| \le 5.0$, snapping camera violently to Africa/Atlantic on Asia/Pacific zooms | **RESOLVED** | Scoped target clamping and zoom-out origin decay to `curUnfurl < 0.01` in `WebGPUCanvas.tsx:1967, 1976`. Verified in `challenger-m4-cursor-zoom-kinematics.test.ts:CHALLENGE-ZOOM-13` (Tokyo coordinates preserved without clamping). |
| **DEF-02** | Protocol 2 | **P1 Defect** | `u_peakExponent` is a 100% dead uniform placebo; Hypsometric Relief Curve "Peak Sharpness" does nothing | **RESOLVED** | Consumed `sim.u_peakExponent` in `crust_hydrosphere.wgsl:676-694` across logarithmic and linear vertical elevation modes. Verified with WGSL linter and `challenger-m1-peak-shaping-adversarial.test.ts`. |
| **DEF-03** | Protocol 2 | **P1 Defect** | `fractureIntensity` was omitted from `manifold.wgsl:119, 132` during evaluation extraction | **RESOLVED** | Added `fracMult = select(1.0, hitPos.w, hitPos.w > 0.01)` to `manifold.wgsl` Case 2u and multiplied `hoopStress` and `flutterAmp` by `fracMult`. Synchronized `SHADERS_SPEC_LEDGER.md §3`. |
| **DEF-04** | Protocol 4 | **P1 Defect** | Hardcoded Tailwind `amber-` classes across HUD components inject warm gold contamination into Theme 2 Cyanotype | **RESOLVED** | Replaced all hardcoded Tailwind amber classes with `var(--theme-status-amber)` across all 6 HUD components. Harmonized `challenger-m5-unfurl-topology.test.ts`. |
| **DEF-05** | Protocol 1 | **P1 Defect** | `scripts/verify_interactive_invariants.ts` setSpherical argument bug induces `NaN` and masks failure | **RESOLVED** | Supplied explicit `curTheta` and `curPhi` arguments in `verify_interactive_invariants.ts:111-118`. Pan delta test now validates true motion `[0.550, -0.275]`. |
| **DEF-06** | Protocol 1 | **P1 Defect** | Degenerate multiplier `(1.0 - ease)` in `easeToCoordinates` collapses flat map oblique relief attitude to nadir | **RESOLVED** | Eliminated `(1.0 - ease)` multiplier on camera orbital angles in `WebGPUCanvas.tsx:840, 883, 929`. Added undefined-angle fallback in `setSpherical`. Verified Rule 36 compliance. |
| **DEF-07** | Protocol 5 | **P1 Defect** | Per-frame `new Vector3` and `new Map` allocations in 2D overlay loop induce continuous GC pressure | **RESOLVED** | Preallocated `_scratchProjResult` tuple, module-level scratch `Vector3` instances, converted `.forEach` and closures into indexed `for` loops, and cached benchmarks map in `WebGPUCanvas.tsx`. |
| **DEF-08** | Protocol 2 | **P2 Polish** | Water Clarity slider produces $\Delta\text{pixels} = 0$ in default ocean view due to early hydrosphere discard | **DOCUMENTED** | Intentional architectural gate in default relief style to preserve Marie Tharp physiographic ocean floor painting without z-fighting. Active when Sea Level != 0m. |
| **DEF-09** | Protocol 1 | **P2 Polish** | Flat map panning is screen-space world-locked instead of aligned with camera right/up projection vectors | **DOCUMENTED** | Minor ergonomic polish item for future milestone. |

---

## Final Pre-Merge Verification Gate

- **Interactive Invariants Smoke Test**: `PORT=3000 npx tsx scripts/verify_interactive_invariants.ts` — **PASS (5/5 invariants, 0 console errors)**
- **WGSL Control Flow Lint**: `node scripts/lint-wgsl-control-flow.mjs` — **PASS (0 errors, 0 warnings across 20 shaders)**
- **TypeScript Compilation**: `npx tsc --noEmit` — **PASS (0 errors)**
- **Production Bundle**: `npm run build` — **PASS (built in 2.14s, 0 chunk warnings)**
- **Full Vitest Test Suite**: `npx vitest run` — **PASS (246/246 test files, 3,525/3,525 tests passing)**
- **Working Tree Purity**: `git status` — **PASS (Rule 31 compliant, 0 dirty test artifacts)**

