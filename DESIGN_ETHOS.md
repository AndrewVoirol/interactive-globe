# INDICATRIX ENGINE: DESIGN ETHOS & AUTHORITATIVE REFERENCE

**Project**: `ais-interactive-globe-to-map`
**Target Hardware**: Apple Silicon M4 Pro (20-core GPU, 24 GB UMA, 273 GB/s)
**Performance Target**: 120 FPS sustained at 1,000,000 nodes
**Classification**: Master Reference — read this before touching any code

---

## 1. Engine Identity

The Indicatrix Engine is a **reusable manifold morphing engine**. Earth is Subject #1, but the architecture inherently supports other manifolds (brain topography, basketball seam geometry, solar coronal mapping) through natural abstraction — not forced interfaces.

This is not a demo. The engine's identity is depth and craft — empirical portfolio evidence of scientific computing on the web. We are allergic to "cool demo" energy. Everything must be mathematically grounded, perceptually uniform, and visually flawless.

**The research dossier is the specification. The pixels are the deliverable. The gap between them is the work.**

---

## 2. The 15 Core Design Principles

Deviations from these are architectural regressions.

1. **Empirical Browser Primacy** — Visual verification over test passing. If the math says it works but the screen shows tearing, the screen wins.
2. **Singularity-Free Geometry** — Bounded math across $t \in [0, 1]$. No NaN, no division by zero at poles or antimeridian.
3. **Cartographic Glass Ethos** — Optical clarity over visual noise. UI elements float but never obscure.
4. **Topological Particle Conservation** — Every node maintains continuous identity. Particles displace, never spawn or despawn.
5. **Hardware Portability** — Shaders within baseline WebGPU API limits.
6. **Scientific Clarity over Photorealism** — Vectors and relief over satellite tiles. No stretched textures.
7. **WebGPU-First Architecture** — WebGPU is the primary stack. WebGL2 is a functional fallback, not a parity target. All new work targets WebGPU.
8. **Sub-Pixel Empirical Ground Truth** — Coastlines to 0.0px mean error.
9. **Tactile Topography** — Physically sculpted, not painted flat. Real normals interacting with real light.
10. **Render Loop Decoupling** — GPU animation never throttled by React reconciliation. React manages state, WebGPU manages pixels.
11. **Perceptual Uniformity** — OKLCH color transitions. No linear RGB muddy midpoints.
12. **Composable Cartography** — Layers reorder without shader recompilation.
13. **Topological Integrity** — Seam cuts geometrically clean across the antimeridian and Dymaxion net.
14. **Visual Primacy** — Visual fidelity is the deliverable. Audio is a future wire-in, not a verification criterion. Do not invest in audio until the visual output honors the research.
15. **Horizon Sculpting** — Geometry displacement on the silhouette, not fragment tricks. Real vertices must move.

---

## 3. Three Visual Identities

### Mode 1: Mathematical Purity (Base State)
*"Maximum math translated into minimal magic."*

Active when no data layers are present. Point cloud and wireframe should feel like elegant mathematical machinery — the segue into richer modes.

- **Dark Theme**: BLACK, WHITE, GRAYS ONLY. No colored heatmaps on the base substrate. Background must have atmospheric depth — subtle radial gradient, not flat black.
- **Light Theme**: COPPER, CREAM, PARCHMENT. Da Vinci's drafting table meets Swiss topographic survey.
- **Line Weight**: Wireframe must be exceptionally thin and crisp — like a technical engraving. Target **0.75px** via `fwidth()` feathering: `smoothstep(0.0, fwidth(v_distance), 0.75 - abs(v_distance))`.

### Mode 2: Cartographic Instrument (Direction A)
*"Swiss topo meets Da Vinci's draft table."*

- Eduard Imhof Swiss relief shading with analytical contour lines
- Multidirectional sun: NW 315° Primary + SW 225° Fill
- Discrete 5-tap Laplacian curvature for ridge contrast and crevice AO
- Slope-dependent rock cliff exposure >35° with procedural alpine strata
- Restrained, academic, precise — a calibrated tool of measure, not a game environment

### Mode 3: Scientific Visualization (Direction B)
*"Detailed crust, water sphere filling trenches, depth refraction color, vegetation from elevation NOT stretched satellite imagery."*

- Physical vertex displacement from ETOPO 2022 DEM with peak exponent sharpening
- Hydrosphere as a first-class visual layer (see §4 below)
- Color derived from elevation/procedural hypsometry and Jerlov depth refraction — never satellite tiles
- Future: atmosphere layer with volumetric clouds, Google Weather Next 3 integration

---

## 4. The Hydrosphere: A Living Layer of Water

The water sphere is not a texture or a flat blue plane. It is an **organic, physical layer** — a perfect sphere of water that can be expanded and contracted, filling trenches and waterways, and providing the visual identity of the crust through its optical properties.

### What You Must SEE
- **Shallow coastal waters**: Vibrant emerald green over carbonate sand, with visible seabed and dynamic caustics dancing on the surface. The Kubelka-Munk two-flux reflectance over aragonite reef sand (`ALBEDO_CARBONATE_REEF = vec3(0.48, 0.54, 0.44)`) produces a warm glow in shallow reef areas.
- **Deep ocean trenches**: Opaque sapphire to midnight indigo gradient. No seabed visible. The water absorbs all color.
- **The transition**: Spectral color shift from turquoise to navy as depth increases — this is Jerlov spectral radiative transfer, not a color ramp.
- **Surface**: 4-octave Gerstner trochoidal micro-ripples with analytical divergence caustics. The water surface is alive.

### The Sea Level Slider
The sea level slider raises and lowers the water sphere. This is not a "polar melt simulation" — it is a way to reveal and conceal the crust's underwater topography. When lowered, ocean trenches and continental shelves emerge. When raised, the water fills higher, smoothing the coastline. The dual-surface rendering (Synchronous Dual-Surface Morphing, Theorem 3.3.2) guarantees **zero z-fighting** between lithosphere and hydrosphere at all sea levels.

### Jerlov Spectral Extinction Coefficients
The water color comes from physics, not a color picker:

| Water Type | $K_d$ Red | $K_d$ Green | $K_d$ Blue | Visual Result |
|---|---|---|---|---|
| Type I (Crystal Tropical) | 0.355 | 0.055 | 0.023 | Deep sapphire blue — blue penetrates deepest |
| Type III (Coastal/Turbid) | 0.480 | 0.145 | 0.190 | Emerald green — CDOM reverses the blue dominance |

The **Clarity slider** interpolates between Type I and Type III. At maximum clarity, the water is crystal tropical blue. At minimum, it shifts to turbid coastal green. This is mathematically why coastal waters appear emerald — $K_d(532) < K_d(440)$ in Type III reverses the open-ocean relationship.

### Shader Uniforms
- `sim.u_seaLevel` — vertical offset of the water sphere
- `hydroUniforms.u_seaLevelOffset` — fine-tuning parameter
- `sim.u_waterClarity` — Jerlov type interpolation (0.0 = Type III turbid, 1.0 = Type I crystal)

---

## 5. Interaction Quality

Interaction quality is critical to the experience. The globe must respond with the precision and weight of a scientific instrument, not a toy.

### Interaction State Machine
```
IDLE → HOVER_PROBE → PINCH_ENGAGED → RELEASE_REBOUND
```

### Hover Probe
As the cursor moves over the surface, it casts a non-blocking raycast. The cursor position perturbs the geometry — a subtle Gaussian depression into the crust/water. This creates a feeling of physical contact between the pointer and the manifold.

### Manifold Pinch (ManifoldPinchController.ts)
Mouse down engages a pinch into the surface. The deformation follows a Gaussian influence:

$$\Delta\mathbf{p}(r) = -\mathbf{n} \cdot z_{\text{pinch}} \cdot \exp\left(-\frac{r^2}{2\sigma^2}\right), \quad \sigma = 0.64$$

Mouse up triggers a **damped harmonic oscillator** — the surface rebounds and wobbles:

$$z(t) = z_{\text{pinch}} \cdot e^{-\gamma t} \cdot \cos(\omega_d t)$$

| Parameter | Value | Effect |
|---|---|---|
| Spring stiffness $k$ | 45.0 | Snappy, responsive feel |
| Damping $\gamma$ | 6.5 | Quick decay without feeling sluggish |
| Damped frequency $\omega_d$ | 28.0 | Visible wobble, not oscillating forever |

**Shader uniforms**: `u_cursorActive`, `u_cursorHitPos`, `u_cursorVel`

### Paradigm Switching Animation Curves
Each morph paradigm uses a physics-derived animation curve, not generic cubic eases:
- **Linear**: Hermite ease $\alpha^2(3 - 2\alpha)$
- **Scroll**: Cylindrical unrolling $R / (1-t)$ with Taylor guard at $1-t \le 10^{-3}$
- **Griffith**: Elastostatic strain phase step response at $\alpha = 0.18$
- **Fluid**: Liquefaction arc $L(t) = \sin^{1.15}(\pi t)$
- **Dymaxion**: Polyhedral facet lift $0.45\sin(\pi t)$

---

## 6. Color Palettes (OKLCH)

All interpolation in OKLCH, analytically converted to Linear sRGB in fragment shaders.

### Theme 0: Dark Cyber
- **Viewport Background**: `oklch(0.12, 0.01, 260)` / `#090B10` — with subtle radial gradient for depth
- **HUD Panel**: `oklch(0.15, 0.01, 255)` / `#0F121A` / Opacity 0.85
- **Coastlines**: `oklch(0.92, 0.01, 85)` / `#EAE6DE` — 102:1 contrast required
- **Ocean Nodes**: `oklch(0.22, 0.02, 240)` / `#1E2633` / Opacity 0.03
- **Geo Wireframe**: `oklch(0.48, 0.04, 240)` / `#596B85` / Opacity `0.45 * sqrt(100k/N)`
- **Structural Wire**: `oklch(0.24, 0.03, 240)` / `#242E3D` / Opacity `0.025 * sqrt(100k/N)`

### Theme 1: Light Monochrome
- **Viewport Background**: `oklch(0.98, 0.002, 247)` / `#F8FAFC` — archival paper
- **Coastlines**: `oklch(0.12, 0.005, 260)` / `#14171C` — carbon ink
- **Geo Wireframe**: `oklch(0.68, 0.008, 250)` / `#A0A6B0` / Opacity `0.40 * sqrt(100k/N)`

---

## 7. WebGPU Render Pipeline (Exact Draw Order)

Violations of this order cause z-fighting or topological occlusion errors.

1. **crustHydrospherePipeline** — 3D dual-surface: Imhof Swiss relief (lithosphere) + Jerlov radiative transfer (hydrosphere)
2. **linesRenderPipeline** — Delaunay wireframe (zero-copy from compute buffer)
3. **vectorRibbonPipeline** — Anti-aliased coastline ribbons (instanced quads, 4D near-plane guard $w_c \le 0$)
4. **renderContours** — Topographic/bathymetric isolines (asymptotic decider)
5. **pointsRenderPipeline** — Point sprites (zero-copy from compute buffer)

The standalone `swiss_relief_shading.wgsl` is **dead code** — superseded by consolidated `crust_hydrosphere.wgsl`.

---

## 8. Morph Paradigms: What You Must SEE

Each paradigm is a physical phenomenon. The research dossier defines the exact mathematics. The pixels must reflect them.

### Paradigm 0: Linear Manifold Interpolation
- **α=0.0**: Perfect sphere. **α=0.5**: Smooth Hermite interpolation, no popping. **α=1.0**: Flat projection, clean lock-in.

### Paradigm 1: Conformal Cylindrical Scroll
- **α=0.5**: Expanding tangent cylinder $R/(1-t)$. Must look mechanical and rigid — an architectural blueprint unrolling. Taylor guard at $1-t \le 10^{-3}$.

### Paradigm 2: Griffith LEFM Fracture
- **α=0.18**: Crack nucleation along antimeridian. Must LOOK like a material rupturing under hoop stress — not just points spreading. Palette: Tension Amber → Rupture Crimson → Active Crack White.
- **α=0.5**: Post-rupture decay flutter with visible shear displacement along the crack front.

### Paradigm 3: Fluid Advection — "Silk Floating in Water"
This is the most visually demanding paradigm. **It must look like a piece of silk floating in water** — not noise displacing points, not random turbulence, but the organic, graceful, weightless movement of fabric suspended in fluid.

- **Liquefaction curve**: $L(t) = \sin^{1.15}(\pi t)$
- **Velocity field**: Solenoidal curl noise ($\nabla \cdot \mathbf{u} \equiv 0$) — divergence-free guarantees no mass creation/destruction
- **SO(3) rotation between octaves** (exact matrix from `physics_sim.wgsl`):
  ```
  rot = mat3x3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64)
  ```
  This irrational rotation breaks grid alignment, producing organic swirl patterns.
- **Silk drape**: Two interfering wave phases summed and scaled by `liquefaction * 0.65` produce `silkWave`, which modulates the surface normal via `silkDrapeOffset = surfaceNormal * silkWave`.
- **At α=0.5**: Peak turbulent flow. Bioluminescent Cyan nodes. The surface should billow gracefully — not jitter, not snap, not feel mechanical.

### Paradigm 4: Dymaxion Polyhedral Unfolding
- **α=0.5**: Icosahedral facet lift $0.45\sin(\pi t)$. Harmonic standing waves visible on hinge edges. Must feel like origami engineering.
- **α≥0.998**: Specular flash sweeps sequentially across all 20 facets over 350ms.

---

## 9. Visual Verification: The Research Is The Spec

**The research dossier is the specification. The pixels are the deliverable. The gap between them is the work.**

When verifying, open the browser and ask:

### Does the water honor the Jerlov research?
- Does the ocean show volumetric depth with spectral color shift? Shallow turquoise → deep navy?
- Can you distinguish Type I (crystal tropical) from Type III (coastal turbid) via the Clarity slider?
- Does Kubelka-Munk reflectance produce visible carbonate sand glow in shallow reefs?
- Are Gerstner micro-ripple caustics visible on the water surface?
- Does the sea level slider visibly raise/lower the water sphere, filling/exposing trenches?
- Reference: `research-dossier.md` §2.2

### Does the terrain honor the Imhof research?
- Does terrain feel physically sculpted with shadow and ridge definition?
- Are mountain ridges sharp with peak exponent enhancement?
- Do crevice shadows deepen with AO >35° slopes?
- Does the Swiss relief look like it belongs in an Imhof atlas?
- Reference: `research-dossier.md` §2.1

### Do the morph transitions honor the physics?
- Does Fluid morph feel like silk floating in water, not noise displacement?
- Does Griffith fracture feel like material rupturing, not points spreading?
- Does Dymaxion unfold feel like origami with hinge vibrations?
- Reference: `research-dossier.md` §3

### Does the interaction feel like a scientific instrument?
- Does hover create a visible Gaussian probe depression?
- Does pinch release trigger visible damped harmonic rebound?
- Does paradigm switching feel kinetic with physics-derived curves?

### Technical Metrics (Secondary)
- **Frame Rate**: Target 120 FPS on M4 Pro. Below 100 = investigate, but FPS is not the mission.
- **Contrast**: Theme 0 coastlines >102:1 against ocean
- **Line Crispness**: Sub-pixel wireframe via `fwidth()` feathering
- **Zero Z-Fighting**: No tearing at coastlines between lithosphere and hydrosphere
- **Pole Safety**: No vertex anomalies at latitudes >85°

---

## 10. Whimsy Moments (Visual Only — Audio Is Future Wire-In)

All whimsy tied to strict geometric or physical conditions.

1. **Fibonacci Pole Alignment**: View vector <0.5° from polar axis → point scale ×1.2 producing concentric Moiré rings
2. **Harmonic Edge Standing Waves**: Dymaxion mode α ∈ [0.45, 0.55] → hinge lines visibly vibrate
3. **Dymaxion Specular Flash**: α ≥ 0.998 → flash sweeps across 20 facets over 350ms
4. **Pinch Rebound**: Mouse up → visible damped harmonic oscillation ($k=45, \gamma=6.5, \omega_d=28$)

> **Audio note**: `ProceduralAudioEngine.ts` exists and can be wired later. Visual must land first.

---

## 11. Gap Inventory

### Active
- WebGPU compute (`physics_sim.wgsl`), `crustHydrospherePipeline`, `linesRender`, `vectorRibbon`, `renderContours`, `pointsRender`

### Inert — Wire These (Priority 1)
- `DataLayerOverlay.tsx` lines 42-43 hardcode `RasterLayerRenderer`; 4 sub-renderers imported but unused
- `WhimsicalEffectsManager.ts` — authored, not instantiated
- `ManifoldPinchController.ts` — authored, no DOM bindings

### Inert — Future (Do Not Delete)
- `src/core/standards/`, `src/core/physics/`, `src/core/camera/` (~5,000 LOC)
- **16M Node Scaling**: Arithmetic benchmarking only. No 16M dataset exists.

---

## 12. Binary Assets (DO NOT Regenerate)

| Asset | Size | Schema |
|---|---|---|
| `public/geo-mesh-100k.bin` | 4.78 MB | GEOM header, 100K Fibonacci nodes |
| `public/geo-mesh-1m.bin` | 47.96 MB | GEOM header, 1M nodes |
| `public/geo-vectors.bin` | 5.76 MB | 167,842 coastline/river vertices |
| `public/geo-contour-mesh.bin` | 2.37 MB | 69,028 contour isoline vertices |
| `public/earth-etopo2022-dem.webp` | ~1.1 MB | RGBA packed DEM |

**DO NOT modify precompute scripts.**

---

## 13. DataLayerOverlay Routing

Dispatch on `category` from `DataLayerCatalog.ts`:
```typescript
type DataLayerCategory = 'satellite' | 'night' | 'topo' | 'ocean' | 'thermal' | 'vectors' | 'point' | 'field';
```

- `'topo' | 'ocean' | 'thermal' | 'night' | 'satellite'` → `RasterLayerRenderer`
- `'vectors'` → `VectorBoundaryRenderer`
- `'point'` → `VectorContourRenderer`
- `'field'` → `VectorFieldRenderer`

---

## 14. Extensibility Strategy

Focus entirely on making Earth undeniably excellent. Good architecture produces abstraction naturally.

The geometry source (`precompute.js`) produces generic binary columnar data — any manifold that can produce `positions3D`, `target2D`, and `typeBuffer` arrays can drive the engine. Do NOT build `IManifoldGeometry` prematurely.
