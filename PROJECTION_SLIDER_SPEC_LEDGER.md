# PROJECTION_SLIDER_SPEC_LEDGER.md
---

## §1: Sextant Slider Geometry, Reticle Responsiveness & Dynamic Ticks
**Target File**: `src/components/hud/instruments/CurvatureUnfurlSextant.tsx`

### 1.1 Problem Statement
- The SVG has `viewBox="0 0 240 36"` inside a responsive container (`w-72` / `sm:w-80` / `md:w-[350px]`). With default `preserveAspectRatio="xMidYMid meet"`, the 240px SVG is pillarboxed with 55px empty margins on both sides at 350px width, resulting in a **40% total dead zone** and a **1.67× hyper-sensitivity spike** in the active zone.
- Reticle `<circle>` has `className="... transition-all duration-150"` which causes 150ms trailing lag during playback and snap on release.
- Thumb position is derived from React prop `alpha` (throttled to 33ms / 30Hz) rather than local drag position, causing reticle stutter while WebGPU scrubs smoothly at 120Hz via `window.__INDICATRIX_SCRUB_ALPHA__`.
- Intermediate tick dots are hardcoded at `cx="78" cy="17"` and `cx="162" cy="17"`. When the arc flattens to $y=26$ at $\alpha = 1.0$, they float 9px in mid-air above the track.
- Milestone 4 ("PLANAR MAP (K = 0)") triggers prematurely at `alpha >= 0.85` while the planet still has 15% curvature.

### 1.2 Required Specifications
- [ ] **SVG Responsive Stretch**: Add `preserveAspectRatio="none"` to `<svg>` or map pointer coordinates directly across the container width:
  ```typescript
  // Direct client coordinate mapping to [0.0, 1.0] across full interactive width
  const rect = boxRef.current.getBoundingClientRect();
  const paddingX = 14; // in px
  const activeWidth = Math.max(1, rect.width - 2 * paddingX);
  const normX = Math.max(0.0, Math.min(1.0, (clientX - (rect.left + paddingX)) / activeWidth));
  ```
- [ ] **Instant Reticle Drag Position**: Use local drag state (`dragAlphaRef` or local `normX`) for thumb rendering while dragging, bypassing the 30Hz React throttle:
  ```typescript
  const effectiveAlpha = isDragging ? localAlpha : alpha;
  const t = Math.max(0, Math.min(1, effectiveAlpha));
  const thumbX = 15 + t * 210;
  const thumbY = (1 - t) * (1 - t) * 26 + 2 * (1 - t) * t * peakY + t * t * 26;
  ```
- [ ] **Remove CSS Transition Delay**: Remove `transition-all duration-150` from the reticle thumb circle so it responds instantly during playback and scrubbing:
  ```tsx
  <circle
    cx={thumbX}
    cy={thumbY}
    r={isHovered || isDragging ? 5.5 : 4.5}
    fill={sextantTokens.thumbFill}
    stroke={sextantTokens.thumbStroke}
    strokeWidth="2"
    className="shadow-sm pointer-events-none"
  />
  ```
- [ ] **Dynamic Quadratic Bezier Ticks**: Compute intermediate tick $y$-coordinates using the Bezier formula at $t_1 = 0.30$ and $t_2 = 0.70$:
  $$y_{\text{tick}}(\alpha, t) = (1 - t)^2 \cdot 26 + 2(1 - t)t \cdot (6 + 20\alpha) + t^2 \cdot 26$$
  - At $\alpha = 0.0$ ($\text{peakY} = 6$): $y(0.30) = 17.6\text{px}$, $y(0.70) = 17.6\text{px}$.
  - At $\alpha = 1.0$ ($\text{peakY} = 26$): $y(0.30) = 26.0\text{px}$, $y(0.70) = 26.0\text{px}$ (conforms perfectly to flat line).
- [ ] **Milestone 4 Threshold**: Adjust `alpha >= 0.85` to `alpha >= 0.98` so "PLANAR MAP" is not declared until the cylinder is virtually flat.

---

## §2: Camera Standoff & Triple-Easing Harmonization
**Target Files**: `src/webgpu/WebGPUCanvas.tsx`, `src/hooks/useEngineState.ts`

### 2.1 Problem Statement
- In `WebGPUCanvas.tsx:2489`, camera standoff uses quintic smootherstep:
  $$\text{standoff} = 5.0(1 - S_5(\alpha)), \quad S_5(x) = 6x^5 - 15x^4 + 10x^3$$
  While shader surface deformation uses linear $\alpha$:
  $$Z_{\text{surface}} = 5.0(1 - \alpha)$$
  This creates an oscillating target delta $\Delta Z = 5.0(S_5(\alpha) - \alpha)$ that pulls the camera backward into the screen by $-0.71$ units before surging forward by $+0.71$ units.
- During auto-morph playback, `useEngineState.ts:257` already applies $S_5(t)$. Passing this to `WebGPUCanvas` results in a 25th-order double polynomial $S_5(S_5(t))$ with two violent jerk points at $t = 0.35$ and $t = 0.65$.
- `WebGPUCanvas.tsx:840` and `883` evaluate a third formula: cubic smoothstep ($3\alpha^2 - 2\alpha^3$).

### 2.2 Required Specifications
- [ ] **Linear Camera Standoff**: Replace `WebGPUCanvas.tsx:2489`:
  ```typescript
  // BEFORE:
  // const ease = clampedUnfurl * clampedUnfurl * clampedUnfurl * (clampedUnfurl * (clampedUnfurl * 6.0 - 15.0) + 10.0);
  // const standoff = 5.0 * (1.0 - ease);

  // AFTER (Rule: exact linear parity with manifold surface translation):
  const ease = clampedUnfurl;
  const standoff = 5.0 * (1.0 - clampedUnfurl);
  ```
- [ ] **Harmonize Camera LookAt**: Ensure lines 840 and 883 in `WebGPUCanvas.tsx` use the identical linear standoff formula ($5.0 \times (1.0 - \text{clampedUnfurl})$).
- [ ] **Playback Continuity**: Leave `animAlpha = S_5(t)` in `useEngineState.ts:257` so playback begins and ends smoothly, but because camera standoff is linear with respect to `curUnfurl`, both camera target and mesh surface will track identically with zero relative oscillation.

---

## §3: CPU/GPU Manifold Parity & Mode Tuning
**Target Files**: `src/core/GlobeOverlay.ts`, `src/webgpu/shaders/manifold.wgsl`

### 3.1 Problem Statement
- **Mode 2 (Griffith LEFM Fracture)**:
  - $t_{\text{rupture}}$ is hardcoded to $0.18$. For $\alpha \in [0, 0.18]$, there is zero motion on the front hemisphere.
  - In `manifold.wgsl:146-170`, Mode 2 base deformation is Cylindrical Unroll. In `GlobeOverlay.ts:253-260`, Mode 2 uses linear chord interpolation (`mix(p3D, p2D)`), decoupling overlay markers and camera targets from the crust mesh.
- **Mode 3 (Fluid Vortex Advection)**:
  - `manifold.wgsl:224` adds $+2.5$ unit ballooning displacement:
    `let balloonAmp = RADIUS * 0.50 * rawSin; let swelledBasePos = basePos + sphereNorm * balloonAmp;`
  - `GlobeOverlay.ts:267` omits `balloonAmp`. The camera target stays 2.5 units inside the globe, pulling the camera into extreme close-up and submerging overlay markers.

### 3.2 Required Specifications
- [ ] **Mode 2 Front-Hemisphere Reactivity**:
  - Lower $t_{\text{rupture}}$ from $0.18$ to $0.05$ in both `manifold.wgsl` and `GlobeOverlay.ts`.
  - Add global pre-rupture hoop stress so the visible hemisphere exhibits tactile expansion/strain as soon as $\alpha > 0$.
- [ ] **Mode 2 Manifold Alignment**:
  - Update `GlobeOverlay.ts:253` to evaluate the cylindrical unroll base coordinates instead of `mix(p3D, p2D)`, matching `manifold.wgsl:151-170`.
- [ ] **Mode 3 Volumetric Parity**:
  - In `GlobeOverlay.ts:267`, add `balloonAmp`:
    ```typescript
    const rawSin = Math.sin(PI * clampedAlpha);
    const balloonAmp = RADIUS * 0.50 * rawSin;
    const normLen = Math.hypot(p3D[0], p3D[1], p3D[2]) || 1.0;
    const sphereNorm = [p3D[0] / normLen, p3D[1] / normLen, p3D[2] / normLen];
    const swelledBasePos: [number, number, number] = [
      basePos[0] + sphereNorm[0] * balloonAmp,
      basePos[1] + sphereNorm[1] * balloonAmp,
      basePos[2] + sphereNorm[2] * balloonAmp,
    ];
    ```
  - This ensures camera focus remains on the exterior fluid surface and soundings ride on top of the fluid.

---

## §4: Dock Projection Mode Selector UI
**Target File**: `src/components/hud/NavigationDock.tsx`

### 4.1 Problem Statement
- Users cannot select projection modes from the dock. The controls are isolated in `TelemetryHUD` or tied to keyboard shortcuts `1`, `2`, `3`, `4`. Because the sextant displays mode-specific milestones, mode switching should be accessible directly at the dock.

### 4.2 Required Specifications
- [ ] Add a compact 4-segment button group (`[Linear]`, `[Scroll]`, `[Fracture]`, `[Fluid]`) into `NavigationDock.tsx`.
- [ ] Style conforms to Cartographic HUD standard: mono typography, ivory vellum background, 10px breathing clearance, zero nested borders.
- [ ] Clicking a segment calls `setProjectionMode(modeIndex)` and updates the active indicator.

---

## §5: Test Harmonization & Acceptance Verification
**Target Files**: `tests/hud/CurvatureUnfurlSextant.test.tsx`, `tests/core/GlobeOverlay.test.ts`, `tests/unit/hud/NavigationDock.test.tsx`

### 5.1 Pre-Flight Grep & Rule 21 Compliance
- [ ] Check for source-scanning tests that inspect `CurvatureUnfurlSextant.tsx` and `NavigationDock.tsx`.
- [ ] Update any expected static strings or class names in test assertions without adding synthetic comments.

### 5.2 Targeted Test Commands
```bash
npx vitest run tests/hud/CurvatureUnfurlSextant.test.tsx
npx vitest run tests/core/GlobeOverlay.test.ts
npx vitest run tests/unit/hud/NavigationDock.test.tsx
```

### 5.3 Live Browser MCP Verification Checklist
- [ ] At $\alpha = 0.05$, pointer click immediately registers deformation with zero dead zone.
- [ ] At $\alpha = 1.00$, intermediate tick dots sit flush on the horizontal track line at $y = 26$ (no floating ticks).
- [ ] At $\alpha = 0.50$ in Mode 3 (Fluid), camera framing remains comfortably centered on the whole planet (no close-up clipping).
- [ ] In Mode 2 (Fracture), dragging from $0.0 \to 0.10$ produces visible deformation on the front hemisphere.
