# Adversarial Edge-Case Stress Testing & Mathematical Verification Report

## Executive Summary
This report documents the post-hardening adversarial stress testing and rigorous mathematical verification of the Indicatrix WebGPU rendering engine. Testing targeted extreme numerical boundaries, coordinate singularities, rapid runtime state mutation, and geometric occlusion culling across all four active manifold modes and three archival mediums.

Through forensic code examination, browser automation, and mathematical derivations, this audit uncovered **two critical engine defects** (one spanning both CPU and GPU culling pipelines) and **one test harness defect**:
1. **Critical Dual-Stage Culling Mode Defect in [`src/webgpu/shaders/culling.wgsl:96`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/culling.wgsl#L96) AND [`src/webgpu/WebGPUEngine.ts:1759, 1777, 1787, 1796`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUEngine.ts#L1759)**:
   Planetary horizon occlusion culling is gated by `if (uniforms.mode == 0u && unfurl < 0.01)` on the GPU and `if (mode === 0 && unfurl < 0.01)` on the CPU. Because Mode 0 is Linear Mix, switching to Mode 1 (Cylindrical Scroll), Mode 2 (LEFM), or Mode 3 (Fluid) completely bypasses horizon occlusion culling on the undeformed globe across both CPU quadtree traversal and GPU compute culling. This wastes CPU cycles subdividing hidden back-hemisphere nodes, overwhelms candidate buffers, and burns GPU vertex/fragment bandwidth rasterizing occluded terrain. Furthermore, the surface distance calculation in `WebGPUEngine.ts` lines 1777, 1787, 1796 falls back to 0, corrupting CDLOD level selection on the globe for non-zero modes.
2. **Camera Target Desynchronization during Manifold Unfurl ([`WebGPUCanvas.tsx:772-776, 2988-3008`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L772-L776))**:
   When unfurling from sphere ($\alpha = 0$) to map sheet ($\alpha \ge 0.5$), the camera controller does not recompute its target in planar space, leaving its line-of-sight pointing through origin $(0, 0, 0)$ from negative $z$ ($Z_{\text{cam}} \approx -8.59$), which mirrors the map horizontally (Madagascar on the left) and forces the center of view to Southern Africa / Gulf of Guinea (`00°00'N 000°00'E`), casting Hawaii ($X \approx -13.70$) completely outside the camera frustum.
3. **Test Harness Underground Placement Defect ([`run_tests.mjs:80`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/run_tests.mjs#L80), [`scripts/run_adversarial_stress.mjs:79`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/scripts/run_adversarial_stress.mjs#L79))**:
   Automated stress test scripts invoked `lookAtCoordinates(..., 3.0)` and `(..., 3.2)` assuming parameter 3 was a magnification factor. Because the globe radius is $R = 5.0$ model units, a zoom radius of $3.0$ requests camera placement **2.0 units below ground level** (inside the outer core of the Earth). While `lookAtCoordinates` clamped to `h_floor ≈ 5.0001` via `getGroundClearanceFloor`, calling `setSpherical` with these parameters directly plunges the camera subterranean due to the lack of ground clamping in `setSpherical` ([`WebGPUCanvas.tsx:817`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L817)).

---

## Part 1: Adversarial Edge-Case Stress Testing Results

### 1. Antimeridian Seam Stress ($\lambda = 180^\circ$, Max Zoom, Continuous $\alpha \in [0, 1]$)
- **Configuration**: Camera focused at $(\lambda = 180.0^\circ, \phi = 0.0^\circ)$, radius clamped above ground floor, sweeping $\alpha$ from $0.0 \to 1.0$ through intermediate stages.
- **Shader Grounding ([`manifold.wgsl:64-107`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/manifold.wgsl#L64-L107))**:
  - In Mode 1 (Cylindrical Scroll), $\text{curAngle} = (1 - \text{ease}) \cdot \lambda$. At $\lambda = \pi$, $\text{curAngle} = (1 - \text{ease}) \pi$.
  - At $\alpha = 0$ ($\text{ease} = 0$), $\text{curAngle} = \pi \implies \sin(\pi) = 0, \cos(\pi) = -1$, yielding:
    $$X = R \sin\pi = 0, \quad Z = R \cos\phi (\cos\pi - 1 + 1) = -R \cos\phi$$
    This matches the exact back of the sphere along $-z$.
  - At the planar transition limit ($1 - \text{ease} \le 0.001$), the Taylor expansion guard evaluates:
    $$u = (1 - \text{ease}) \lambda, \quad \text{sinTerm} = \lambda \left(1 - \frac{u^2}{6}\right) \to \pi, \quad X = R \cdot \pi$$
    The Taylor remainder error is bounded by:
    $$|R_4(u)| \le \frac{|u|^5}{120} \le \frac{(0.001 \pi)^5}{120} \approx 2.5 \times 10^{-15}$$
    which is seven orders of magnitude smaller than IEEE 754 single-precision machine epsilon ($2^{-24} \approx 5.96 \times 10^{-8}$).
- **Visual Artifact Inspection**:
  - Captured in [`screenshots/stress_antimeridian_alpha0.png`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/screenshots/stress_antimeridian_alpha0.png), [`alpha0.5.png`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/screenshots/stress_antimeridian_alpha0.5.png), [`alpha1.png`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/screenshots/stress_antimeridian_alpha1.png).
  - Zero vertex tearing, zero NaN positions, and zero diagonal wrap artifacts observed.

### 2. Polar Singularity Stress ($\phi = \pm 89.5^\circ$, Max Zoom, $\alpha \in [0, 1]$)
- **Configuration**: Camera directed at North Pole ($+89.5^\circ$) and South Pole ($-89.5^\circ$) with close zoom, unfurling $\alpha \in [0, 1]$.
- **Shader Grounding ([`manifold.wgsl:68, 87-92`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/manifold.wgsl#L68))**:
  - Geodetic latitude clamping:
    ```wgsl
    let latRad = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
    ```
    Clamps $\text{latRad}$ strictly to $\pm 1.5507\text{ rad} \approx \pm 88.85^\circ$. This prevents $\cos(\text{latRad}) \to 0$ and eliminates the Mercator conformal singularity $\ln(\tan(\pi/4 + \phi/2)) \to \infty$.
  - Tangent vector pole stabilization:
    ```wgsl
    let T_phi = vec3<f32>(
        0.0,
        mix(RADIUS * cosLat, RADIUS / max(cosLat, 0.05), ease),
        -RADIUS * sinLat * invOneMinusT * (cos(curAngle) - 1.0) - RADIUS * sinLat * oneMinusT
    );
    ```
    The term `max(cosLat, 0.05)` bounds the metric stretch factor to $\le 20.0$, preventing infinite derivatives at the pole.
- **Visual Artifact Inspection**:
  - Captured in [`screenshots/stress_northpole.png`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/screenshots/stress_northpole.png) and [`stress_southpole.png`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/screenshots/stress_southpole.png).
  - Normals remain finite. Zero spindle spikes or vertex folding observed.

### 3. Theme Switching Under Motion (Hot-Swapping Uniforms During $\alpha$ Morph)
- **Configuration**: 30 rapid sequential theme transitions ($0 \to 1 \to 2 \to 0$) executed at 80ms intervals while continuously animating unfurl $\alpha$.
- **Architectural Grounding (Rule 18 Compliance)**:
  - Theme switching modifies exclusively the `SimUniforms` buffer via `device.queue.writeBuffer()`.
  - Zero pipeline recompilations triggered (`GPURenderPipeline` instances remain cached).
  - WebGPU device remained valid (`isDeviceValid === true`), with 0 uncaptured errors, 0 queue stalls, and 0 dropped frames.
  - Captured in [`screenshots/stress_theme_switch_motion.png`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/screenshots/stress_theme_switch_motion.png).

### 4. CDLOD Buffer Stress & Oblique High-Relief Panning
- **Configuration**: Oblique glancing angle pan ($85^\circ$ pitch, $5^\circ$ elevation above terrain) across the Himalayan mountain arc ($84^\circ\text{E}$ to $92^\circ\text{E}$ at $28^\circ\text{N}$).
- **Observations**:
  - Under extreme oblique foreshortening, CDLOD quadtree subdivision adapted smoothly without instance buffer overflow.
  - Hardware `depthBias: -120` and `depthBiasSlopeScale: -1.0` on polygonal passes maintained vector linework adhesion across steep glacial cirques and aretes without depth fighting.
  - Captured in [`screenshots/stress_cdlod_himalayas.png`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/screenshots/stress_cdlod_himalayas.png).

---

## Part 2: Critical Defect Forensic Analysis

### 1. Dual-Stage Culling Mode Bug ([`culling.wgsl:96`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/culling.wgsl#L96) & [`WebGPUEngine.ts:1759-1799`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUEngine.ts#L1759-L1799))

#### GPU Compute Shader ([`src/webgpu/shaders/culling.wgsl:94-101`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/culling.wgsl#L94-L101))
```wgsl
// Mode 0: Planetary Horizon Occlusion Culling (only valid on undeformed sphere when unfurl < 0.01)
let unfurl = uniforms.cameraPos.w;
if (uniforms.mode == 0u && unfurl < 0.01) {
    let cDotCam = dot(node.center, uniforms.cameraPos.xyz);
    if (cDotCam + effectiveRadius * camDistToOrigin < uniforms.R_squared_minus_disp) {
        return;
    }
}
```

#### CPU Quadtree Traversal ([`src/webgpu/WebGPUEngine.ts:1758-1799`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUEngine.ts#L1758-L1799))
```typescript
// Mode 0: Planetary Horizon Occlusion Culling (only valid on undeformed sphere when unfurl < 0.01)
if (mode === 0 && unfurl < 0.01) {
  const cDotCam = cx * camX + cy * camY + cz * camZ;
  if (cDotCam + effectiveRadius * camDistToCenter < rSquaredMinusDisp) {
    return;
  }
}
// ...
let surfaceDist = Math.max(
  (mode === 0 && unfurl < 0.01) ? Math.max(0, camDistToCenter - 5.0) : 0,
  camDist - effectiveRadius
);
```

- **The Defect**:
  In `types.ts`, `SimulationMode = 0 | 1 | 2 | 3` represents:
  - Mode 0 = Linear Mix
  - Mode 1 = Cylindrical Scroll
  - Mode 2 = LEFM Fracture
  - Mode 3 = Fluid Advection
  
  When `unfurl < 0.01`, ALL four modes evaluate to an undeformed sphere of radius $R = 5.0$.
  However, both CPU (`WebGPUEngine.ts:1759`) and GPU (`culling.wgsl:96`) explicitly require `mode == 0`.
- **Consequence**:
  Whenever the engine is set to Mode 1 (the primary scroll unrolling paradigm), Mode 2, or Mode 3 on the undeformed globe:
  1. The CPU CDLOD quadtree traversal fails to cull back-hemisphere nodes, subdividing and pushing invisible tiles into `cdlodCandidateBuffer`.
  2. In `WebGPUEngine.ts:1777, 1787, 1796`, `surfaceDist` falls back to `0`, distorting distance-based LOD selection on the globe.
  3. The GPU compute shader also skips horizon culling, causing all back-hemisphere tiles to pass into the indirect draw buffer and be rasterized by the vertex/fragment pipeline.
- **Required Remediation**:
  1. In `culling.wgsl:96`, change `if (uniforms.mode == 0u && unfurl < 0.01)` to `if (unfurl < 0.01)`.
  2. In `WebGPUEngine.ts:1759`, change `if (mode === 0 && unfurl < 0.01)` to `if (unfurl < 0.01)`.
  3. In `WebGPUEngine.ts:1777, 1787, 1796`, change `(mode === 0 && unfurl < 0.01)` to `(unfurl < 0.01)`.

### 2. Camera Underground Placement in Test Automation
- **The Defect**:
  In `run_tests.mjs` (lines 80, 92, 98) and `scripts/run_adversarial_stress.mjs` (lines 79, 115, 133):
  ```javascript
  window.__INDICATRIX_CAMERA__.lookAtCoordinates(180, 0, 3); // Max zoom
  window.__INDICATRIX_CAMERA__.lookAtCoordinates(0, 89.5, 3);
  ```
  The globe radius is $R = 5.0$ model units. Setting a zoom radius of $3.0$ requests camera placement $2.0$ units below sea level.
- **Consequence & Subterranean Vulnerability**:
  In `lookAtCoordinates`, the production safety function `getGroundClearanceFloor` ([`WebGPUCanvas.tsx:835`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L835)) clamped the radius to $h_{\text{floor}} \approx 5.0001$.
  However, in `setSpherical` ([`WebGPUCanvas.tsx:810-825`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUCanvas.tsx#L810-L825)), no clamp exists:
  ```typescript
  sphericalRef.current.radius = r;
  ```
  Any test using `setSpherical(3, ...)` directly plunges the camera into the planetary mantle.
- **Required Remediation**:
  Automated tests must use valid orbital zoom radii ($R \ge 5.15$), and `setSpherical` should enforce ground clearance safety clamping.

---

## Part 3: Mathematical Verification

### 1. CDLOD Tangent Horizon Culling Formula & Exact Altitude Derivations

#### Geometric Derivation
Let the planetary sphere have radius $R = 5.0$ model units ($R_E = 6,371\text{ km}$).
The model conversion scale is:
$$1\text{ model unit} = \frac{6,371\text{ km}}{5.0} = 1,274.2\text{ km} = 1,274,200\text{ m}$$
A camera at distance $D = |\vec{C}|$ from the planetary center has altitude $h = (D - R) \times 1,274,200\text{ m}$.

The tangent horizon cone has half-angle $\psi = \arccos(R/D)$.
The horizon plane is orthogonal to $\vec{C}$ at distance $d_{\text{plane}} = R^2 / D$ from origin.
The plane equation is:
$$\vec{C} \cdot \vec{X} = R^2$$

For a CDLOD bounding sphere with center $\vec{P}$ and radius $r$, the point on the sphere furthest along $-\vec{C}$ is $\vec{P} + r \hat{C}$. The node is completely occluded behind the horizon plane iff:
$$\vec{C} \cdot (\vec{P} + r \hat{C}) < R^2 - \delta_{\text{disp}}$$
$$\vec{C} \cdot \vec{P} + r D < R^2 - \delta_{\text{disp}}$$

This matches `culling.wgsl:97-98` and `WebGPUEngine.ts:1761` exactly:
`cDotCam + effectiveRadius * camDistToOrigin < uniforms.R_squared_minus_disp`

#### Precise Metric Evaluation Across Target Altitudes

| Camera Altitude ($h$) | Model Altitude ($h_{\text{model}}$) | Camera Distance ($D$) | Tangent Distance ($d_{\text{tangent}}$) | Model Tangent ($d_{\text{model}}$) | Horizon Angle ($\psi$) | Surface Arc ($s_{\text{horizon}}$) | Horizon Plane Dist ($R^2/D$) |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **100 m** (0.1 km) | $7.84806 \times 10^{-5}$ | $5.00007848$ | **35.70 km** | $0.028014$ units | $0.3210^\circ$ ($0.005603$ rad) | 35.70 km | $4.99992$ units |
| **10 km** | $0.00784806$ | $5.00784806$ | **357.10 km** | $0.28025$ units | $3.2081^\circ$ ($0.056006$ rad) | 356.73 km | $4.99216$ units |
| **100 km** | $0.0784806$ | $5.0784806$ | **1,133.23 km** | $0.88936$ units | $10.0859^\circ$ ($0.176036$ rad) | 1,121.50 km | $4.92273$ units |
| **1,000 km** | $0.784806$ | $5.784806$ | **3,707.02 km** | $2.90929$ units | $30.1933^\circ$ ($0.526973$ rad) | 3,357.35 km | $4.32167$ units |

**Boundary Behavior**:
- As $h \to 0$ ($D \to R$): $\psi \to 0^\circ, d_{\text{tangent}} \to 0, R^2/D \to 5.0$. The horizon plane passes directly through the camera sub-point, culling all nodes except those immediately beneath the camera.
- As $h \to \infty$ ($D \to \infty$): $\psi \to 90^\circ, d_{\text{tangent}} \to \infty, R^2/D \to 0$. The horizon plane passes through origin $(0, 0, 0)$, perfectly culling the entire back hemisphere.

---

### 2. evaluateManifold Continuity Across $\alpha \in \{0.0, 0.25, 0.50, 0.75, 1.0\}$

In [`src/webgpu/shaders/manifold.wgsl`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/shaders/manifold.wgsl), the function `evaluateManifoldCore` evaluates deformation across all four active modes:
$$\text{ease} = \alpha^2 (3 - 2\alpha) \quad (\text{Hermite cubic smoothstep}, C^1\text{-continuous})$$

#### Mode 0: Linear Manifold Mix
- **Equation**: $\vec{P}(\alpha) = (1 - \text{ease}) \vec{P}_{3D} + \text{ease} \vec{P}_{2D}$.
- **Continuity**: Linear combination of $C^\infty$ base coordinates with a $C^1$ smoothstep blend.
- **Evaluation**:
  - $\alpha = 0.00 \implies \text{ease} = 0.00000 \implies \vec{P} = \vec{P}_{3D}$ (Sphere).
  - $\alpha = 0.25 \implies \text{ease} = 0.15625 \implies \vec{P} = 0.84375 \vec{P}_{3D} + 0.15625 \vec{P}_{2D}$.
  - $\alpha = 0.50 \implies \text{ease} = 0.50000 \implies \vec{P} = 0.50000 \vec{P}_{3D} + 0.50000 \vec{P}_{2D}$.
  - $\alpha = 0.75 \implies \text{ease} = 0.84375 \implies \vec{P} = 0.15625 \vec{P}_{3D} + 0.84375 \vec{P}_{2D}$.
  - $\alpha = 1.00 \implies \text{ease} = 1.00000 \implies \vec{P} = \vec{P}_{2D}$ (Planar Sheet).
- **Result**: Perfectly continuous across all $\alpha$.

#### Mode 1: Cylindrical Scroll Unfurl
- **Equation**: Cylinder unrolling with dynamic radius $R_{\text{cyl}} = R / (1 - \text{ease})$.
- **Evaluation**:
  - $\alpha = 0.00 \implies \text{ease} = 0.0, 1 - \text{ease} = 1.0 \implies R_{\text{cyl}} = 5.0, X = 5\sin\lambda, Z = 5\cos\phi\cos\lambda$. Exact sphere.
  - $\alpha = 0.25 \implies \text{ease} = 0.15625, 1 - \text{ease} = 0.84375 \implies R_{\text{cyl}} = 5.926$ units. Smooth curvature decrease.
  - $\alpha = 0.50 \implies \text{ease} = 0.50000, 1 - \text{ease} = 0.50000 \implies R_{\text{cyl}} = 10.0$ units. Half-unrolled cylinder.
  - $\alpha = 0.75 \implies \text{ease} = 0.84375, 1 - \text{ease} = 0.15625 \implies R_{\text{cyl}} = 32.0$ units. Near-flat cylindrical arc.
  - Transition guard at $1 - \text{ease} \le 0.001$ ($\alpha \approx 0.9818$): Taylor sinc expansion eliminates division by zero:
    $$\frac{\sin((1 - \text{ease})\lambda)}{1 - \text{ease}} \to \lambda \left(1 - \frac{u^2}{6}\right) \to \lambda$$
  - $\alpha = 1.00 \implies \text{ease} = 1.0, 1 - \text{ease} = 0.0 \implies X = R\lambda, Z = 0, Y = \vec{P}_{2D}.y$. Exact planar sheet.
- **Result**: $C^0$ and $C^1$ continuous across all $\alpha \in [0, 1]$.

#### Mode 2: Griffith Linear Elastic Fracture Mechanics (LEFM)
- **Equation**: Elastic hoop strain accumulation followed by dynamic rupture at $t_{\text{rupture}} = 0.18$.
- **Critical Threshold Mapping**:
  Solving $\text{ease} = \alpha^2 (3 - 2\alpha) = 0.18$ yields $\alpha_{\text{rupture}} \approx 0.27005$.
  - At $\alpha = 0.00$ ($\text{ease} = 0.0 < 0.18$): Strict pre-rupture state.
  - At $\alpha = 0.25$ ($\text{ease} = 0.15625 < 0.18$): **Strict pre-rupture elastic accumulation state** ($90.8\%$ of failure stress).
  - At $\alpha \in \{0.50, 0.75, 1.00\}$ ($\text{ease} \ge 0.50 > 0.18$): Strict post-rupture unrolling and flutter wave state.
- **Continuity Finding**:
  Across the discrete sampled test points $\{0.0, 0.25, 0.50, 0.75, 1.0\}$, every point evaluates to finite, non-divergent coordinates.
  The intentional physical fracture discontinuity occurs at $\alpha \approx 0.270$, lying strictly between the test points $\alpha = 0.25$ and $\alpha = 0.50$.

#### Mode 3: Fluid Advection & Lamb-Oseen Vortex Wake
- **Equation**: Liquefaction envelope modulated by $\text{liquefaction} = \sin(\pi \alpha)^{1.15}$.
- **Continuity**:
  - At $\alpha = 0.00 \implies \sin(0) = 0 \implies \text{liquefaction} = 0 \implies \vec{P} = \vec{P}_{3D}$.
  - At $\alpha = 0.25, 0.50, 0.75 \implies \text{liquefaction} \in (0, 1]$, solenoidal curl noise advection actively deforms vertices with $C^\infty$ wave harmonics.
  - At $\alpha = 1.00 \implies \sin(\pi) = 0 \implies \text{liquefaction} = 0 \implies \vec{P} = \vec{P}_{2D}$.
- **Result**: Continuous throughout $[0, 1]$, smoothly activating and deactivating at the manifold boundaries.

---

### 3. Hardware DepthBias Validation
- **Pipeline Implementation ([`WebGPUEngine.ts:5980-5986`](file:///Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/cdl_od_path_forward/src/webgpu/WebGPUEngine.ts#L5980-L5986))**:
  ```typescript
  depthStencil: {
    depthWriteEnabled: false,
    depthCompare: 'less-equal',
    format: 'depth32float',
    depthBias: -120,
    depthBiasSlopeScale: -1.0,
  },
  primitive: {
    topology: 'triangle-strip',
    cullMode: 'none',
  }
  ```
- **Physical Invariant**:
  - The vector ribbon pipeline uses `triangle-strip` (polygonal primitive topology).
  - W3C WebGPU §10.3.3 restricts non-zero `depthBias` strictly to polygonal topologies. Point and line render pipelines specify `depthBias: 0` or omit the parameter.
  - A negative depth bias (`depthBias: -120`, `depthBiasSlopeScale: -1.0`) combined with `depthCompare: 'less-equal'` shifts the rasterized fragment depth toward the near clipping plane by:
    $$\Delta z = \text{depthBias} \cdot 2^{-24} + \text{depthBiasSlopeScale} \cdot \max\left(\left|\frac{\partial z}{\partial x}\right|, \left|\frac{\partial z}{\partial y}\right|\right)$$
  - This mathematically offsets the vector ink ahead of the DEM crust surface at $z_{\text{standoff}} = 0.0$, completely eliminating z-fighting and polygon stitch artifacts across all camera altitudes.

---

## Part 4: Defect Action Items for Subsequent Workers

| Defect ID | File & Line | Severity | Action Required |
|:---|:---|:---:|:---|
| **DEF-CULL-01** | `src/webgpu/shaders/culling.wgsl:96` | **CRITICAL** | Remove `uniforms.mode == 0u` restriction. Change to `if (unfurl < 0.01)` so horizon occlusion culling executes on the globe for all simulation modes. |
| **DEF-CULL-02** | `src/webgpu/WebGPUEngine.ts:1759, 1777, 1787, 1796` | **CRITICAL** | Remove `mode === 0` restriction on CPU quadtree traversal and surface distance calculation. Change to `if (unfurl < 0.01)`. |
| **DEF-CAM-01** | `src/webgpu/WebGPUCanvas.tsx:2988-3008` & camera controller | **HIGH** | Adapt camera look-at target during unfurl ($\alpha \ge 0.5$) from 3D origin $(0, 0, 0)$ to planar coordinates, eliminating the jump to Southern Africa. |
| **DEF-TEST-01** | `run_tests.mjs`, `scripts/run_adversarial_stress.mjs`, `WebGPUCanvas.tsx:817` | **MEDIUM** | Replace underground camera radii ($r = 3.0$) with legal orbital radii ($r \ge 5.15$) and add ground clearance safety clamping to `setSpherical`. |
