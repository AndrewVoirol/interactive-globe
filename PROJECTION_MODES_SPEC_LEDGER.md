# PROJECTION_MODES_SPEC_LEDGER.md
---

## §1: The "Honest Geometry" of the Four Projection Modes

This ledger defines the authoritative mathematical equations, boundary conditions, and physical kinematics for the Indicatrix projection engine, resolving the historical homogenization defect.

### 1.1 Stratum Volume Preservation Invariant
In all deformation modes, the physical thickness of the crust (16-bit ETOPO DEM elevation), ocean bathymetry (abyssal trenches), and atmosphere (cloud shells and Rayleigh scattering) MUST displace along the evaluated manifold normal vector:
$$\mathbf{p}_{\text{final}} = \mathbf{p}_{\text{manifold}} + \mathbf{n}_{\text{manifold}} \cdot z_{\text{elev}}$$
The physical relief must never be squashed into a 2D planar decal mid-flight.

---

## §2: Mode 0 — Polar-Convergent Geodesic Unfolding (The Optical Illusion)
**Target**: `src/webgpu/shaders/manifold.wgsl` (`case 0u:`)

### 2.1 Problem Solved
Eliminates the gaping circular hole at the North and South Poles caused by Cartesian lerp $\text{mix}(\mathbf{p}_{3D}, \mathbf{p}_{2D}, \alpha)$.

### 2.2 Mathematical Formulation
- At latitude $\phi \in [-\pi/2, \pi/2]$ and longitude $\lambda \in [-\pi, \pi]$:
  - In 3D: $\mathbf{p}_{3D} = (R\cos\phi\sin\lambda, R\sin\phi, R\cos\phi\cos\lambda)$.
  - In 2D Mercator: $\mathbf{p}_{2D} = (\lambda R, Y_{\text{merc}}(\phi), 0)$.
- Effective longitude dilation:
  $$\lambda_{\text{eff}}(\lambda, \phi, \alpha) = \lambda \cdot \left(\cos\phi + (1.0 - \cos\phi) \cdot S_3(\alpha)\right)$$
  where $S_3(\alpha) = 3\alpha^2 - 2\alpha^3$.
- Radial elevation preservation (prevents interior chord deflation):
  $$\mathbf{n}_{\text{sphere}} = \frac{\mathbf{p}_{3D}}{|\mathbf{p}_{3D}|}$$
  $$\mathbf{p}_{\text{unfurl}} = \text{mix}(\mathbf{p}_{3D}, \mathbf{p}_{2D}, \alpha) + \mathbf{n}_{\text{sphere}} \cdot R \cdot (1.0 - \alpha) \cdot \sin(\pi \alpha) \cdot 0.28$$
- Normal vector:
  $$\mathbf{n}_{\text{manifold}} = \text{normalize}\left(\text{mix}(\mathbf{n}_{\text{sphere}}, (0, 0, 1), \alpha)\right)$$

### 2.3 Boundary Invariants
- At $\alpha = 0.0$: $\mathbf{p} = \mathbf{p}_{3D}$, $\mathbf{n} = \mathbf{n}_{\text{sphere}}$ (exact sphere).
- At $\alpha = 1.0$: $\mathbf{p} = \mathbf{p}_{2D}$, $\mathbf{n} = (0, 0, 1)$ (exact flat Mercator sheet).
- At $\phi = \pm \pi/2$ (Poles) for $\alpha \in [0, 0.5]$: $|\mathbf{p}_x| < 0.15 R$, keeping the polar caps sealed.

---

## §3: Mode 1 — Authentic Developable Scroll Unfurl (Parchment Cylinder)
**Target**: `src/webgpu/shaders/manifold.wgsl` (`case 1u:`)

### 3.1 The Cartographic Truth
Reverse-engineering a flat rectangular map of dimensions $2\pi R \times 2 Y_{\max}$ rolled without stretching yields an **open cylinder (scroll)** of radius $R$ and height $2 Y_{\max}$. Gauss's *Theorema Egregium* guarantees that a cylinder ($K = 0$) unrolls onto a plane ($K = 0$) isometrically without tearing or distortion.

### 3.2 Two-Stage Developable Kinematics
- **Stage 1 ($\alpha \in [0.00, 0.35]$): Sphere to Developable Cylinder ($K = 1/R^2 \to 0$)**
  - Parameter $t_1 = \text{smoothstep}(0.0, 0.35, \alpha)$.
  - Meridians straighten vertically. Parallel circles expand from $R\cos\phi$ to full cylinder radius $R$:
    $$r(\phi, t_1) = \text{mix}(R\cos\phi, R, t_1)$$
    $$y(\phi, t_1) = \text{mix}(R\sin\phi, Y_{\text{merc}}(\phi), t_1 \cdot 0.5)$$
  - Top and bottom poles open from points into circular cylinder rims of radius $R$.
- **Stage 2 ($\alpha \in [0.35, 1.00]$): Cylinder Unrolling onto Drafting Table**
  - Parameter $t_2 = \text{smoothstep}(0.35, 1.0, \alpha)$.
  - Cylinder of radius $R$ unrolls circumferentially:
    $$s = 1.0 - t_2, \quad u = s \cdot \lambda$$
    $$x = R \cdot \frac{\sin(u)}{s}, \quad z = R \cdot \frac{\cos(u) - 1.0}{s} + R \cdot s$$
    $$y = \text{mix}(y(\phi, 1.0), Y_{\text{merc}}(\phi), t_2)$$
- Robust Taylor expansion for $u \to 0$ when $s \to 0$:
  $$x = R \lambda (1 - u^2/6), \quad z = -s R \lambda^2 (0.5 - u^2/24) + R s$$

---

## §4: Mode 2 — Tectonic Crust Fracture (Mid-Atlantic Ridge Calving)
**Target**: `src/webgpu/shaders/manifold.wgsl` (`case 2u:`)

### 4.1 Single Seam Specification
- The fracture initiates along a single primary geological rift: the **Mid-Atlantic Ridge** ($\lambda_{\text{rift}} \approx -28^\circ \approx -0.488\text{ rad}$).
- Distance to rift:
  $$d_{\text{rift}}(\lambda) = |\lambda - \lambda_{\text{rift}}|$$
  $$f_{\text{seam}} = 1.0 - \text{smoothstep}(0.0, 0.70, d_{\text{rift}})$$

### 4.2 Kinematics: Immediate Elastic Strain & Calving
- **$\alpha \in [0.00, 0.15]$ (Pre-Rupture Dilatation & Crack Nucleation)**:
  - Globe visibly swells with tensile hoop strain: $\Delta R = 0.06 R \cdot \alpha / 0.15$.
  - The Mid-Atlantic crack visibly opens by $\pm 0.08$ units immediately at $\alpha > 0.01$.
  - Subterranean mantle luminosity ($I_{\text{mantle}} \propto f_{\text{seam}} \cdot \alpha$) emits from the opening crevasse.
- **$\alpha \in [0.15, 1.00]$ (Crustal Plate Peeling & Calving)**:
  - Eastern Plate ($\lambda > \lambda_{\text{rift}}$) and Western Plate ($\lambda < \lambda_{\text{rift}}$) rotate outward along rigid hinges.
  - Acoustic micro-fracture shockwaves ripple through the basaltic crust:
    $$w_{\text{flutter}} = \sin(18.0 \cdot d_{\text{rift}} - 20.0 \cdot \alpha) \cdot \exp(-3.5 \cdot \alpha) \cdot f_{\text{seam}}$$
  - Zero coupling to Mode 1 scroll unroll math.

---

## §5: Mode 3 — Hydrodynamic Fluid Relaxation & Suspended Silk Sheet
**Target**: `src/webgpu/shaders/manifold.wgsl` (`case 3u:`)

### 5.1 Elimination of High-Frequency Noise
- Completely eliminate radial curl noise bump displacement (`balloonAmp * sphereNorm + computeCurlNoise * 1.55`) that creates knobby spherical "marbles".

### 5.2 Kinematics
- **Phase 1 ($\alpha \in [0.00, 0.35]$): Viscous Laminar Liquefaction**
  - Smooth low-frequency surface tension flow. Manifold retains continuous volume while softening edges.
- **Phase 2 ($\alpha \in [0.35, 0.85]$): Suspended Silk Sheet Draping**
  - The manifold billows like a weightless silk sheet suspended in fluid.
  - Governed by two low-frequency traveling harmonics:
    $$\Phi_1 = 0.45 x + 0.60 y - 1.2 t_{\text{sim}}, \quad \Phi_2 = -0.50 x + 0.35 y - 0.8 t_{\text{sim}}$$
    $$Z_{\text{silk}} = (0.35 \sin\Phi_1 + 0.20 \cos\Phi_2) \cdot \sin(\pi \alpha)$$
- **Phase 3 ($\alpha \in [0.85, 1.00]$): Planar Capillary Tension**
  - Billowing waves decay smoothly to zero as capillary tension pulls the sheet flush to $Z = 0$ on the drafting table.

---

## §6: Curvature Unfurl Sextant — Pure Continuous 1:1 Scrubbing
**Target**: `src/components/hud/instruments/CurvatureUnfurlSextant.tsx`

1. **Remove 50ms VDOM Throttle**: Pointer event writes immediately to local state and sets `window.__INDICATRIX_SCRUB_ALPHA__ = normX`.
2. **Zero Dead Zones**: SVG `preserveAspectRatio="none"` or map client pointer coordinates across `activeWidth = rect.width - 2 * paddingX`.
3. **Instant Reticle Response**: Remove CSS `transition-all duration-150` from reticle thumb circle.
4. **Non-Magnetic Milestones**: Milestone ticks ($t \in [0.0, 0.3, 0.7, 1.0]$) serve strictly as visual reference markers with zero stickiness or resistance.
