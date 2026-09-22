# PROJECTION_MODES_SPEC_LEDGER.md
---

## §1: The "Honest Geometry" of the Four Projection Modes

This ledger defines the authoritative mathematical equations, boundary conditions, and physical kinematics for the Indicatrix projection engine, resolving the historical homogenization defect.

### 1.1 Stratum Volume Preservation Invariant
In all deformation modes, the physical thickness of the crust (16-bit ETOPO DEM elevation), ocean bathymetry (abyssal trenches), and atmosphere (cloud shells and Rayleigh scattering) MUST displace along the evaluated manifold normal vector:
$$\mathbf{p}_{\text{final}} = \mathbf{p}_{\text{manifold}} + \mathbf{n}_{\text{manifold}} \cdot z_{\text{elev}}$$
The physical relief must never be squashed into a 2D planar decal mid-flight.

---

## §2: Mode 0 — Polar-Convergent Geodesic Unfolding with Boundary Seam Lip
**Target**: `src/webgpu/shaders/manifold.wgsl` (`default:`)

### 2.1 Problem Solved
Eliminates polar bat/cat ears, needle spindle, traveling peel shockwaves through inner continents, depth squishing into almond/ellipsoid, cylindrical slab appearance, and polar holes, via polar-convergent developable circular arc curvature relaxation and boundary-anchored fingernail seam lip.

### 2.2 Mathematical Formulation
- Staged meridional unbending and parallel expansion:
  $$t_{\text{unbend}} = \text{smoothstep}(0.15, 0.85, \alpha)$$
  $$y_{\text{physical}} = \text{mix}(pos3D.y, R \cdot \phi, t_{\text{unbend}})$$
  $$curY = \text{mix}(y_{\text{physical}}, pos2D.y, \text{smoothstep}(0.60, 1.0, \alpha))$$
  $$t_{\text{parallel}} = \text{smoothstep}(0.18, 0.82, \alpha)$$
  $$\text{parallelWidth} = \text{mix}(\cos\phi, 1.0, t_{\text{parallel}})$$
  $$curX = \text{mix}(pos3D.x, pos2D.x \cdot \text{parallelWidth}, \alpha)$$
- Planar depth convergence with uniform chord lift (eliminates Antarctica depression bowl):
  $$\text{chordLiftZ} = (0.5 + 0.5 \cos\phi) \cdot R \cdot (1.0 - \alpha) \cdot \sin(\pi \alpha) \cdot 0.28$$
  $$curZ = \text{mix}(pos3D.z, 0.0, \alpha) + \text{chordLiftZ}$$
  $$\mathbf{p}_{\text{base}} = (curX, curY, curZ)$$
- Boundary-Seam Confined Lip Detachment ($|\lambda| > 150^\circ$, i.e. $\text{lonNorm} \in [0.85, 1.0]$):
  $$s_{\text{peel}} = \text{select}\left(0.0, \text{smoothstep}(0.85, 1.0, \text{lonNorm}), \text{lonNorm} > 0.85\right)$$
  $$e_{\text{peel}} = \sin(\pi \cdot \alpha^{0.70}) \cdot (1.0 - \alpha)$$
  $$\theta_{\text{roll}} = s_{\text{peel}} \cdot 1.1$$
  $$\text{liftBarrel} = R \cdot 0.35 \cdot e_{\text{peel}} \cdot (1.0 - \cos\theta_{\text{roll}}) \cdot \cos\phi$$
- Outward Radial Displacement (zero tangential compression toward Greenwich):
  $$\mathbf{n}_{\text{horiz}} = \text{normalize}(pos3D.x, 0, pos3D.z)$$
  $$\mathbf{p}_{\text{final}} = \mathbf{p}_{\text{base}} + \mathbf{n}_{\text{horiz}} \cdot \text{liftBarrel}$$

### 2.3 Boundary Invariants
- At $\alpha = 0.0$: $\mathbf{p} = \mathbf{p}_{3D}$, $\mathbf{n} = \mathbf{n}_{\text{sphere}}$ (exact sphere).
- At $\alpha = 1.0$: $\mathbf{p} = \mathbf{p}_{2D}$, $\mathbf{n} = (0, 0, 1)$ (exact flat Mercator sheet).
- At $\phi = \pm \pi/2$ (Poles) for all $\alpha$: $\cos\phi = 0 \implies \text{liftBarrel} = 0$, completely preventing polar ear distortion.
- At inner longitudes ($|\lambda| \le 150^\circ$): $s_{\text{peel}} = 0.0 \implies \text{liftBarrel} = 0.0$, guaranteeing smooth monotonic unrolling with zero traveling waves.

---

## §3: Mode 1 — Parchment Scroll Unfurl with Tight Roll Dynamics
**Target**: `src/webgpu/shaders/manifold.wgsl` (`case 1u:`)

### 3.1 Problem Solved
Eliminates polar puckering caused by premature Mercator $Y$ expansion and provides rapid transition to a pristine cylinder followed by tight parchment roll-up and smooth drafting table unrolling.

### 3.2 Formulation
- **Phase 1: Rapid Cylinder Formation** ($\alpha \in [0.0, 0.20]$):
  $$t_{\text{cyl}} = \text{smoothstep}(0.0, 0.20, \alpha)$$
  $$r_{\text{cyl}}(\phi, \alpha) = \text{mix}(R\cos\phi, R, t_{\text{cyl}})$$
- **Phase 2: Parchment Tight Roll-Up Compression** ($\alpha \in [0.15, 0.40]$):
  $$t_{\text{roll}} = \sin(\pi \cdot \text{smoothstep}(0.15, 0.40, \alpha))$$
  $$r_{\text{scroll}} = r_{\text{cyl}} \cdot (1.0 - 0.20 \cdot t_{\text{roll}})$$
- **Phase 3: Curvature Unrolling & Flat Table Relaxation** ($\alpha \in [0.20, 1.00]$):
  $$t_{\text{unroll}} = \text{smoothstep}(0.20, 1.0, \alpha), \quad s = 1.0 - t_{\text{unroll}}, \quad u = s \cdot \lambda$$
  - For $|u| > 0.02$:
    $$x = r_{\text{scroll}} \cdot \frac{\sin(u)}{s_{\text{div}}}, \quad z = r_{\text{scroll}} \cdot \left(\frac{\cos(u) - 1.0}{s_{\text{div}}} + s\right)$$
  - For small $|u| \le 0.02$ (Taylor series):
    $$x = r_{\text{scroll}} \lambda (1 - u^2/6), \quad z = -s r_{\text{scroll}} \lambda^2 (0.5 - u^2/24) + r_{\text{scroll}} s$$
- **Polar Puckering Elimination**:
  $$y = \text{mix}(\mathbf{p}_{3D}.y, \mathbf{p}_{2D}.y, t_{\text{unroll}})$$
- **Normal Evolution**:
  $$\mathbf{n}_{\text{cyl}} = (\sin(u), 0, \cos(u))$$
  $$\mathbf{n}_{\text{manifold}} = \text{select}\left(\mathbf{n}_{\text{sphere}}, \text{normalize}(\text{mix}(\mathbf{n}_{\text{sphere}}, \mathbf{n}_{\text{cyl}}, t_{\text{cyl}})), |\mathbf{n}_{\text{cyl}}| > 10^{-4}\right)$$

---

## §4: Mode 2 — Tectonic Crust Fracture (Mid-Atlantic Ridge Calving)
**Target**: `src/webgpu/shaders/manifold.wgsl` (`case 2u:`)

### 4.1 Single Seam Specification
- The fracture initiates along a single primary geological rift: the **Mid-Atlantic Ridge** ($\lambda_{\text{rift}} \approx -28^\circ \approx -0.48869\text{ rad}$).
- Distance to rift:
  $$d_{\text{rift}}(\lambda) = |\lambda - \lambda_{\text{rift}}|$$
  $$f_{\text{seam}} = 1.0 - \text{smoothstep}(0.0, 0.70, d_{\text{rift}})$$

### 4.2 Kinematics: Immediate Elastic Strain & Calving
- **$\alpha \in [0.00, 0.15]$ (Pre-Rupture Dilatation & Crack Nucleation)**:
  - Globe visibly swells with tensile hoop strain: $\Delta R = 0.06 R \cdot \alpha / 0.15$.
  - The Mid-Atlantic crack visibly opens by $\pm 0.08$ units immediately at $\alpha > 0.01$.
- **$\alpha \in [0.15, 1.00]$ (Crustal Plate Peeling & Calving)**:
  - Eastern Plate ($\lambda > \lambda_{\text{rift}}$) and Western Plate ($\lambda < \lambda_{\text{rift}}$) rotate outward along rigid hinges.
  - Acoustic micro-fracture shockwaves ripple through the basaltic crust:
    $$w_{\text{flutter}} = \sin(18.0 \cdot d_{\text{rift}} - 20.0 \cdot \alpha) \cdot \exp(-3.5 \cdot \alpha) \cdot f_{\text{seam}}$$
  - Zero coupling to Mode 1 scroll unroll math.

---

## §5: Mode 3 — Hydrodynamic Fluid Relaxation & Viscous Streamline Shear
**Target**: `src/webgpu/shaders/manifold.wgsl` (`case 3u:`)

### 5.1 Tangent-Projected Solenoidal Shear (Zero Radial Knobs)
- Projects the solenoidal velocity field strictly onto the 2-manifold surface tangent plane:
  $$\mathbf{v}_{\text{tangent}} = \mathbf{v}_{\text{curl}} - (\mathbf{v}_{\text{curl}} \cdot \mathbf{n}_{\text{surf}})\,\mathbf{n}_{\text{surf}}$$
  $$\Delta \mathbf{p}_{\text{shear}} = \mathbf{v}_{\text{tangent}} \cdot [R \cdot 0.28 \cdot \sin(\pi \alpha) (1 - 0.35\alpha)]$$
  Continents smoothly shear and swirl along fluid streamlines with zero perpendicular bunching.

### 5.2 3-Octave Dispersion-Coupled Multi-Axis 3D Traveling Harmonics
- Traveling harmonic wave packets across 3D directional axes with fast temporal undulations:
  $$\Phi_1 = \mathbf{p}_{\text{base}} \cdot (0.35, 0.62, 0.42) \times 1.35 - 2.8 t_{\text{sim}}$$
  $$\Phi_2 = \mathbf{p}_{\text{base}} \cdot (-0.45, 0.30, 0.65) \times 1.75 - 2.2 t_{\text{sim}}$$
  $$\Phi_3 = \mathbf{p}_{\text{base}} \cdot (0.55, -0.40, 0.35) \times 2.10 - 3.4 t_{\text{sim}}$$
  $$z_{\text{capillary}} = (0.45 \sin\Phi_1 + 0.30 \cos\Phi_2 + 0.20 \sin\Phi_3) \cdot \sin(\pi \alpha) (1 - 0.35\alpha) \cdot (1 - \text{smoothstep}(0.85, 1.0, \alpha))$$
- Final fluid manifold position:
  $$\mathbf{p}_{\text{fluid}} = \mathbf{p}_{\text{base}} + \Delta \mathbf{p}_{\text{shear}} + \mathbf{n}_{\text{surf}} \cdot z_{\text{capillary}} + \text{cursorOffset}$$

---

## §6: Curvature Unfurl Sextant — Pure Continuous 1:1 Scrubbing
**Target**: `src/components/hud/instruments/CurvatureUnfurlSextant.tsx`

1. **Remove 50ms VDOM Throttle**: Pointer event writes immediately to local state and sets `window.__INDICATRIX_SCRUB_ALPHA__ = normX`.
2. **Zero Dead Zones**: SVG `preserveAspectRatio="none"` or map client pointer coordinates across `activeWidth = rect.width - 2 * paddingX`.
3. **Instant Reticle Response**: Remove CSS `transition-all duration-150` from reticle thumb circle.
4. **Non-Magnetic Milestones**: Milestone ticks ($t \in [0.0, 0.3, 0.7, 1.0]$) serve strictly as visual reference markers with zero stickiness or resistance.
