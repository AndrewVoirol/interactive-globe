# PROJECTION_MODES_SPEC_LEDGER.md
---

## §1: The "Honest Geometry" of the Four Projection Modes

This ledger defines the authoritative mathematical equations, boundary conditions, and physical kinematics for the Indicatrix projection engine, resolving the historical homogenization defect.

### 1.1 Four-Mode Architecture & Mode Excision (Rule 9 & Rule 30)
The Indicatrix Engine operates under a strict 4-mode physical architecture (Modes 0..3: Mode 0 Developable Folio Wave, Mode 1 Parchment Scroll, Mode 2 Tectonic Fracture, Mode 3 Hydrodynamic Fluid). Pursuant to Rule 9 ("Feature cuts are permanent") and Rule 30 ("Excision audit hygiene"), Mode 4 (Fuller Dymaxion) has been permanently excised across all pipelines, shaders, types, and HUD controls.

### 1.2 Stratum Volume Preservation Invariant
In all deformation modes, the physical thickness of the crust (16-bit ETOPO DEM elevation), ocean bathymetry (abyssal trenches), and atmosphere (cloud shells and Rayleigh scattering) MUST displace along the evaluated manifold normal vector:
$$\mathbf{p}_{\text{final}} = \mathbf{p}_{\text{manifold}} + \mathbf{n}_{\text{manifold}} \cdot z_{\text{elev}}$$
The physical relief must never be squashed into a 2D planar decal mid-flight.

---

## §2: Mode 0 — Equirectangular 2:1 Developable Folio Wave Kinematics & Analytical Normal
**Target**: `src/webgpu/shaders/manifold.wgsl` (`default:` / `evaluateModeZero`)  
**Authoritative Reference**: `SHADERS_SPEC_LEDGER.md §3`

### 2.1 Problem Solved
Eliminates polar bat/cat ears, needle spindle, traveling peel shockwaves through inner continents, depth squishing into almond/ellipsoid, cylindrical slab appearance, and polar holes, via polar-convergent developable circular arc curvature relaxation, 5-scale nested harmonic roll mechanics, and closed-form analytical normal derivation.

### 2.2 Mathematical Formulation (The 5 Scales of Nested Harmonic Roll)

1. **Boundary Envelopes & $C^2$ Smooth Ease-In**:
   $$s_{\text{zero}} = \text{smoothstep}(0.0, 0.10, \alpha)$$
   $$s_{\text{one}} = 1.0 - \text{smoothstep}(0.90, 1.0, \alpha)$$
   $$\text{env} = \sin(\pi \alpha) \cdot s_{\text{zero}} \cdot s_{\text{one}}$$
   $$\alpha_{\text{eased}} = \alpha^2 (3.0 - 2.0\alpha)$$

2. **Living Directional Peel & Synchronized Parallel Expansion**:
   $$\text{waveBias} = \text{normLon} \cdot 0.040 \cdot \text{env}$$
   $$\text{latFactor} = 1.0 - 0.14 \cdot \text{env} \cdot (1.0 - \cos\phi)$$
   $$\text{easeLocal} = \text{clamp}(\alpha_{\text{eased}} \cdot \text{latFactor} - \text{waveBias}, 0.0, 1.0)$$
   $$t_{\text{parallel}} = \text{smoothstep}(0.05, 0.85, \text{easeLocal})$$
   $$\text{parallelWidth} = \text{mix}(\cos\phi, 1.0, t_{\text{parallel}})$$
   $$r_{\text{par}} = R \cdot \text{parallelWidth}$$

3. **Developable Circular Arc Unroll with $C^\infty$ Smooth Spine Relaxation**:
   $$s_{\text{base}} = \max(0.0, 1.0 - \text{easeLocal})$$
   $$\text{spineWeight} = \cos^4(\lambda / 2)$$
   $$s_{\text{local}} = s_{\text{base}} \cdot (1.0 - 0.10 \cdot \text{env} \cdot \text{spineWeight})$$
   $$u = s_{\text{local}} \cdot \lambda$$
   - For $|u| > 0.02$:
     $$curX = r_{\text{par}} \cdot \frac{\sin(u)}{s_{\text{div}}}, \quad curZ = r_{\text{par}} \cdot \left(\frac{\cos(u) - 1.0}{s_{\text{div}}} + s_{\text{local}}\right)$$
   - For small $|u| \le 0.02$ (Taylor series expansion):
     $$curX = r_{\text{par}} \lambda (1 - u^2/6), \quad curZ = -s_{\text{local}} r_{\text{par}} \lambda^2 (0.5 - u^2/24) + r_{\text{par}} s_{\text{local}}$$

4. **Tactile Lip, Polar Dog-Ear Curl, Margin Drape & Vertical Transformation**:
   $$\text{envLate} = \text{select}(0.0, \sin(\pi \alpha^{0.72}) \cdot (1.0 - \text{smoothstep}(0.88, 1.0, \alpha)), \alpha > 0.0)$$
   $$f_{\text{west}} = \sin(\pi \alpha^{0.60}) (1.0 - 0.25\alpha) \cdot 1.15, \quad f_{\text{east}} = (2.0\alpha - 0.34)(1.0 - 0.20\alpha) \cdot 1.05$$
   $$\text{flapChiral} = \text{select}(f_{\text{west}}, f_{\text{east}}, \text{normLon} > 0.0)$$
   $$\text{poleScale} = \cos\phi + (1.0 - \cos\phi) \cdot t_{\text{parallel}}$$
   $$\text{lipMag} = (\text{seamZone} \cdot 0.150 \cdot \text{flapChiral} + \text{microRim} \cdot 0.070 \cdot \text{env}) \cdot R \cdot \text{envLate} \cdot \text{latTaper} \cdot \text{poleScale}$$
   $$curX \mathrel{+}= \sin(u) \cdot \text{lipMag} \cdot 0.70 + \text{edgeFlexX}$$
   $$curZ \mathrel{+}= (\cos(u) \cdot 0.80 + 0.65) \cdot \text{lipMag} + \text{cornerCurlZ} + \text{marginDrapeZ} + \text{polarDrapeZ} + \text{waveFlex} + \text{chordLiftZ}$$
   $$y_{\text{straight}} = \text{mix}(R \sin\phi, R\phi, t_{\text{parallel}})$$
   $$curY = y_{\text{straight}} + \text{polarRimFlexY}$$

5. **Closed-Form Analytical Normal Vector**:
   $$\mathbf{N}_{\text{base}} = \mathbf{T}_\lambda \times \mathbf{T}_\phi$$
   $$\frac{\partial y}{\partial \phi} = R \cdot \text{mix}(\cos\phi, 1.0, t_{\text{parallel}}), \quad -\frac{\partial r}{\partial \phi} = R \sin\phi (1.0 - t_{\text{parallel}})$$
   $$\mathbf{n} = \text{normalize}\left(\frac{\partial y}{\partial \phi} \sin(u),\, -\frac{\partial r}{\partial \phi} \cdot \text{bracket},\, \frac{\partial y}{\partial \phi} \cos(u)\right)$$

### 2.3 Boundary Invariants
- At $\alpha = 0.0$: $\text{env} = 0$, $t_{\text{parallel}} = 0$, $r_{\text{par}} = R\cos\phi \implies \mathbf{p} = \mathbf{p}_{3D}$, $\mathbf{n} = \mathbf{n}_{\text{sphere}}$ (**Exact Sphere Invariant: PASS**).
- At $\alpha = 1.0$: $\text{env} = 0$, $t_{\text{parallel}} = 1$, $r_{\text{par}} = R$, $uAngle \le 0.02 \implies \mathbf{p} = (R\lambda, R\phi, 0.0) = \mathbf{p}_{2D}$, $\mathbf{n} = (0, 0, 1)$ (**Exact Planar Map Invariant: PASS**).
- At $\phi \to \pm \pi/2$ (Poles for all $\alpha$): $\cos\phi \to 0 \implies \text{poleScale} \to t_{\text{parallel}}$, $lipMag \to 0$, $latWeight \to 1.0$, completely preventing polar ear distortion (**Zero-Polar-Distortion Invariant: PASS**).
- At $\alpha = 0.5$, $\lambda = \pm\pi, \phi = 0$ (Antimeridian Equator): $\|\mathbf{n}\| = 1.0$ strictly unit normalized (**Non-Vanishing Normal Invariant: PASS**).

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
