# Master Technical Specification: First-Principles Atmospheric & Topographic Coupling

**Location**: `docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md`  
**Classification**: Authoritative Implementation Specification  
**Target Hardware**: Apple Silicon Metal-3 WebGPU (Dawn Backend)  
**Authoritative Invariants**:
- Invariant §3: Unconditional Derivative Evaluation (`fwidth`, `dpdx`, `dpdy` strictly before branches)
- Invariant §5: Premultiplied Alpha Transparent Clear (`clearValue: { r:0, g:0, b:0, a:0 }`)
- Invariant §10: Horizon Tangent Attenuation (`smoothstep(0.02, 0.20, in.facing)`)
- Invariant §12: 4 Canonical Benchmark Viewpoints (Limb Horizon, Alpine Basin, Planar Unroll, Medium Shift)
- Invariant §14: Hardware Depth Bias for Coplanar Cartography (`depthBias: -120`, `slopeScale: -1.0`)
- Invariant §15: Cross-Pipeline DEM Mathematical Parity (`sample.a * 19772.0 - 10924.0`)
- Invariant §20: 16-Byte WGSL Struct Alignment
- Invariant §28: Exhaustive Multi-Medium Shader Parity (Theme 0 Tharp, Theme 1 Cream Rag, Theme 2 Cyanotype)
- Invariant §48: Dynamic Dimensions (Zero Hardcoded Numeric Literals)

---

## 1. Verified Resolution & Boundary Services Contract

### 1.1 Geosphere Data Assets (Domain 1)
* **Global Topo-Bathymetry**: `public/earth-etopo2022-dem-u16.bin` (268,435,456 bytes).
  * Dimensions: $8192 \times 4096$ pixels ($360^\circ \times 180^\circ$).
  * Horizontal Step: $0.0439^\circ \approx 4.88\text{ km}$ at equator.
  * Vertical Encoding: 16-bit uint16 normalized across $[-10,924\text{ m}, +8,848\text{ m}]$, delivering $\mathbf{0.30\text{ m}}$ vertical precision.
* **Regional Overlays**: `public/regional/manifest.json` (NOAA CUDEM 1/3 arc-second ~10m).
  * Hawaii: $5400 \times 3600$ over $[-161^\circ, -154^\circ] \times [18^\circ, 23^\circ]$ ($\mathbf{10\text{ m}}$ precision).
  * Cape Cod: $2400 \times 2400$ over $[-71^\circ, -69^\circ] \times [41^\circ, 43^\circ]$ ($\mathbf{10\text{ m}}$ precision).
  * Blended via `sampleRegionalComposite` in `crust_hydrosphere.wgsl`.

### 1.2 Troposphere Weather Assets (Domain 2)
* **GFS Weather Grids**: `public/data/gfs-*.bin`.
  * Grid: $1440 \times 721$ ($0.25^\circ \times 0.25^\circ \approx 27.8\text{ km}$ resolution).
  * Surface Wind: `gfs-wind-latest.bin` (U/V half-float fp16, 4.15 MB).
  * Jet Stream: `gfs-jetstream-latest.bin` (250 hPa U/V fp16, 4.15 MB).
  * Clouds: `gfs-cloud-low-latest.bin` (LCDC), `gfs-cloud-mid-latest.bin` (MCDC), `gfs-cloud-high-latest.bin` (HCDC) (fp16 scalar cloud fraction, 2.07 MB each).

### 1.3 Two-Scale Coupling Principle
The $4.8\text{ km}$ DEM gradient $\nabla h = (\partial h/\partial x, \partial h/\partial y)$ acts as a continuous analytical micro-deflection field on top of the macro $27.8\text{ km}$ GFS wind field, allowing particles to steer around ridges that the raw GFS grid cannot resolve.

---

## 2. Core Mathematical Specifications

### 2.1 Cloud Ground Shadow Projection (`crust_hydrosphere.wgsl`)
* **Sun Parameters**: Azimuth $\phi_{\text{sun}} = 315.0^\circ$ (NW Key Light), Altitude $\theta_{\text{sun}} = 45.0^\circ$.
* **Shadow UV Offset**:
  $$\Delta u = -\frac{z_{\text{cloud}}}{\tan(\theta_{\text{sun}}) \cdot 2\pi R_E} \cdot \cos(\phi_{\text{sun}})$$
  $$\Delta v = \frac{z_{\text{cloud}}}{\tan(\theta_{\text{sun}}) \cdot \pi R_E} \cdot \sin(\phi_{\text{sun}})$$
* **Shadow Attenuation**:
  $$\text{cloudDens} = \text{textureSampleLevel}(u\_cloudTexture, u\_cloudSampler, uv + \Delta uv, 0.0).r$$
  $$\text{shadowFactor} = 1.0 - u\_shadowIntensity \cdot \text{smoothstep}(0.10, 0.35, \text{cloudDens})$$
* Default $u\_shadowIntensity = 0.45$. Softness achieved via 4-tap jittered sampling with a ~20 km radius.

### 2.2 Topographic Barrier Wind Deflection (`wind_particles.wgsl`)
In `sampleVelocity`:
1. Evaluate DEM elevation gradient $\nabla h = (h_E - h_W) / \Delta x, (h_N - h_S) / \Delta y$.
2. Compute normalized slope normal: $\hat{\mathbf{n}}_{\text{slope}} = \nabla h / \sqrt{\|\nabla h\|^2 + \epsilon}$.
3. Decompose horizontal velocity:
   $$d = \mathbf{u} \cdot \hat{\mathbf{n}}_{\text{slope}}$$
   $$\mathbf{u}_{\text{deflected}} = \begin{cases} 
   \mathbf{u} - 0.75 \cdot d \cdot \hat{\mathbf{n}}_{\text{slope}} & \text{if } d > 0 \text{ (upslope barrier)} \\ 
   \mathbf{u} & \text{if } d \le 0 \text{ (downslope/flat)}
   \end{cases}$$
4. Re-normalize speed to conserve kinetic energy: $\|\mathbf{u}_{\text{deflected}}\| = \|\mathbf{u}_{\text{raw}}\|$.

### 2.3 Pitch-Adaptive Standoff Exaggeration (`cloud_shell.wgsl`)
* **Standoff Multiplier**:
  $$k_{\text{exagg}} = 1.0 + (u\_atmosphericScale - 1.0) \cdot \left(1.0 - \text{clamp}\left(\frac{\mathbf{n} \cdot \mathbf{v}_{\text{cam}}}{0.35}, 0.0, 1.0\right)\right)^2$$
* Base Standoffs:
  - Low (Stratus): $z_0 = 0.0010 \to z_{\text{eff}} = z_0 \cdot k_{\text{exagg}}$
  - Mid (Altocumulus): $z_0 = 0.0040 \to z_{\text{eff}} = z_0 \cdot k_{\text{exagg}}$
  - High (Cirrus): $z_0 = 0.0080 \to z_{\text{eff}} = z_0 \cdot k_{\text{exagg}}$
* UI Control: `u_atmosphericScale` slider in Atmosphere Drawer with range $[1.0, 12.0]$ (default $1.0$).

---

## 3. Pre-Flight File & Line Pinning

### 3.1 DEM Guard Cleanup (`WebGPUEngine.ts`)
* Replace hardcoded numbers at lines 273, 274, 1414, 1782, 2891 with dynamic properties:
  - Line 273-274: `public demWidth: number = 0; public demHeight: number = 0;` (initialized from texture metadata)
  - Line 1414: Use `daySource.width || this.defaultTextureWidth`
  - Line 2891: Fallback to `this.demWidth || 8192` through constant symbols.

### 3.2 Uniform Struct Layout (`cloud_shell.wgsl` - 256 bytes)
```wgsl
struct CloudUniforms {
    u_unfurl: f32,                 // offset 0   (float 0)
    u_mode: u32,                   // offset 4   (float 1)
    u_theme: u32,                  // offset 8   (float 2)
    u_time: f32,                   // offset 12  (float 3)
    u_cameraPos: vec4<f32>,        // offset 16  (floats 4..7)
    u_viewport: vec4<f32>,         // offset 32  (floats 8..11)
    u_cloudDrift: vec4<f32>,       // offset 48  (floats 12..15)
    u_layerStandoff: vec4<f32>,    // offset 64  (floats 16..19)
    u_layerOpacity: vec4<f32>,     // offset 80  (floats 20..23)
    u_layerIndex: u32,             // offset 96  (float 24)
    u_peakExponent: f32,           // offset 100 (float 25)
    u_atmosphericScale: f32,       // offset 104 (float 26) [1.0 .. 12.0]
    u_shadowIntensity: f32,        // offset 108 (float 27) [0.0 .. 0.60]
    u_sunDirection: vec4<f32>,     // offset 112 (floats 28..31)
    u_mediumProperties: vec4<f32>, // offset 128 (floats 32..35)
    u_pad: vec4<f32>,              // offset 144 (floats 36..39)
    u_viewMatrix: mat4x4<f32>,     // offset 160 (floats 40..55)
    u_projectionMatrix: mat4x4<f32>// offset 224 (floats 56..71)
};
```

---

## 4. Hardware Verification Protocol

* Mandatory Apple Silicon Metal-3 GPU Verification:
  ```javascript
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter || adapter.isFallbackAdapter || adapter.info.architecture !== 'metal-3') {
    throw new Error('Verification failure: Real Metal-3 GPU not active.');
  }
  ```
* Capture Checkpoints:
  1. `screenshots/capture-horizon-limb-strata.png` (Pitch $78^\circ$)
  2. `screenshots/capture-alpine-wind-deflection.png` (Alps 3.5× zoom)
  3. `screenshots/capture-cloud-shadow-terrain.png` (Visible ground shadows)
