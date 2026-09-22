# Indicatrix Engine — Discovery & Remediation Ledger

**Date:** 2026-09-14  
**Status:** Discovery Phase Completed / Remediation Scoping  
**Guiding Benchmark:** *"Maps or globes one can find in a museum or library. Precise, perfect cartography with distinct, authentic archival styles, where every element feels intentional rather than half-baked."*

---

## 1. High-Level Triage Summary

| Domain | User Verdict | Root Cause / Current Failure State | Immediate Strategic Direction |
| :--- | :---: | :--- | :--- |
| **Air Dancer & Audio Whimsy** | `❌ CUT` | 3D inflatable tube man and synthesizer audio chime dissonance. Clashes with serious cartography. | **Purge completely.** Delete `AirDancerScene.tsx`, `ProceduralAudioEngine.ts`, and all references in `App.tsx`. |
| **Globe-to-Map Morphing** | `✅ KEEP` | 5 modes diluting focus; icosahedral net is broken across styles. | **Consolidate to 2 heroes:** Hero 1 = Linear/Spherical Unfurl, Hero 2 = Fluid Flow. Excised polyhedral net from the main UI in Phase 2.2. |
| **Archival Paper Mediums** | `⚠️ REWORK` | Cream Rag, Prussian Cyanotype, and Marie Tharp have gotten muddy, lost their distinct craft, and lost fidelity. | **Return to authentic medium roots.** Calibrate color palettes, paper substrate tooth, and ink profiles. |
| **Vector Linework & Overlays** | `⚠️ REWORK` | Linework is no longer crisp; lost sharpness and resolution across zooms. | **Re-architect vector ribbon feathering & LOD.** Crisp sub-pixel drafting hairlines; eliminate blur and z-fighting. |
| **Terrain Elevation & Oceans** | `⚠️ REWORK` | Feels "half-baked", noisy, lacking genuine depth, not producing a "wow" factor. | **Re-tune Imhof Swiss relief shading & bathymetry.** Clean DEM sampling, natural hypsometry, authentic ocean trench depth. |
| **WeatherNext 3, Radar & Clouds** | `⚠️ REWORK` | High potential, but fragments (fog, radar, clouds) fall flat. Wind ribbons are cool; needs a cohesive "holy shit" moment. | **Elevate to a dedicated, curated lens/mode.** Unify wind streamlines, cloud strata, and precipitation into a singular atmospheric lens with clear data sources. |
| **HUD Controls & Sidebar** | `⚠️ REWORK` | "Nightmare and hurts my brain." 2,700-line sidebar, unclear what works, obscure data sources, sensory overload. | **Radical pruning.** Strip out pseudo-dials; display clear data provenance (NOAA, ETOPO, WeatherNext); museum-grade minimalist framing. |

---

## 2. Immediate Purge List (Zero-Hesitation Scope Reductions)

### 2.1. Air Dancer & Audio Whimsy Removal
* **Target Files:**
  - `src/components/tubeman/AirDancerScene.tsx`
  - `src/components/tubeman/AirDancerSim.ts`
  - `src/components/tubeman/AirDancerAudio.ts`
  - `src/core/audio/ProceduralAudioEngine.ts`
* **Action:** Delete files, remove imports, remove audio mute toggle and tube man scene from `App.tsx`.

### 2.2. Polyhedral Net Excision Completed
* **Target Files:** `src/App.tsx`, `src/webgpu/WebGPUEngine.ts`, `src/core/GlobeOverlay.ts`, `src/core/VectorOverlayLayer.tsx`, `src/utils/contour-topology.ts`, and more.
* **Action:** Polyhedral net references, logic, and branches completely excised from the core engine and UI in Phase 2.2. Fluid Advection is now the 4th mode (index 3).

---

## 3. Detailed Subsystem Diagnosis & Rework Plan

### Domain A: Archival Paper Mediums & Theming
* **Symptom:** Prussian has lost its architectural drafting blueprint precision; Tharp has lost its rich physiographic ocean floor depth; Cream Rag feels muddy rather than tactile 310 GSM cotton rag.
* **Root Cause:**
  - Shader branching collapsed distinct color responses into shared clamps.
  - Paper tooth noise is either washed out or over-contrasted against relief shading.
* **Target Files:**
  - `src/core/theme/ThemeManager.ts`
  - `src/webgpu/shaders/crust_hydrosphere.wgsl`
  - `src/webgpu/shaders/swiss_relief_shading.wgsl`

### Domain B: Vector Linework & Overlays
* **Symptom:** Coastlines and graticules are no longer crisp; blur or dissolve at different zoom levels.
* **Root Cause:** Screen-space quad extrusion in `vector_ribbon.wgsl` has inconsistent feathering width thresholds across device pixel ratios (DPR) and altitude ranges.
* **Target Files:**
  - `src/webgpu/shaders/vector_ribbon.wgsl`
  - `src/core/VectorOverlayLayer.tsx`

### Domain C: Terrain Elevation, Relief & Oceans
* **Symptom:** Spiky or muddy terrain, lacking genuine museum-grade relief engraving and ocean floor depth.
* **Root Cause:** DEM elevation displacement interacts awkwardly with the lighting passes; hillshade slopes are over-saturated in some areas and flat in others.
* **Target Files:**
  - `src/webgpu/shaders/crust_hydrosphere.wgsl`
  - `src/webgpu/shaders/swiss_relief_shading.wgsl`

### Domain D: WeatherNext 3, Radar & Clouds (The "Wow" Factor)
* **Symptom:** Wind particles/streamlines look good, but volumetric clouds, radar textures, and fog look half-baked and obscure the map instead of elevating it.
* **Root Cause:** Too many disparate weather overlays toggled individually in separate drawers without a unified optical composition.
* **Target Files:**
  - `src/components/AtmosphereDrawer.tsx`
  - `src/webgpu/shaders/volumetric_cloud.wgsl`
  - `src/core/data/weathernext/WeatherNextDataSource.ts`

### Domain E: HUD Controls, Sidebar & Data Provenance
* **Symptom:** 2,709-line monolith in `src/components/hud/UnifiedRightSidebar.tsx`. Users cannot tell what is active, what controls do what, or where data originates. Overwhelming cognitive load.
* **Root Cause:** Accretion of every experimental slider, switch, and custom SVG instrument without an editorial hierarchy.
* **Target Files:**
  - `src/components/hud/UnifiedRightSidebar.tsx`
  - `src/components/hud/NavigationDock.tsx`
  - `src/components/hud/TelemetryHUD.tsx`

---

## 4. Current Execution Status (Updated 2026-09-14)

### Completed Milestones
1. **Air Dancer Purge (Zero-Hesitation Scope Cut)**:
   - Deleted `AirDancerScene.tsx`, `AirDancerSim.ts`, `AirDancerAudio.ts`, and associated unit tests.
   - Cleared `App.tsx` imports, key listeners ('w'), and state. Preserved archival design-system comment.
2. **Sidebar Re-Architecture (5 Curated Plates)**:
   - Replaced chaotic plates with 5 structured tabs: `[ALL]`, `[MEDIUM]`, `[TERRAIN]`, `[WEATHER]`, `[PROJECTION]`.
   - Added dedicated `Live Doppler Radar` control with active RainViewer sync indicators.
   - Linear Unfurl and Fluid Advection designated as primary hero projections.
3. **Curator's Colophon Embedded**:
   - Created `CuratorsColophon.tsx` displaying complete authoritative provenance:
     - ETOPO 2022 15 arc-sec 16-bit DEM (-10,924m to +8,848m)
     - DeepMind WeatherNext 3 (0.1° / 10km) & NOAA GFS (10m winds)
     - RainViewer Global Radar Mosaic (10-minute cadence)
     - Natural Earth 1:10M Coplanar Vectors
     - WebGPU 120 FPS Compute Pipeline
   - Embedded directly into the sidebar with dynamic material calibration across all 3 archival mediums.
4. **Permanent Invariants 108–113 Codified**:
   - Codified Museum-Grade Zero-Whimsy Invariant (108).
   - Scale-Coupled Troposphere Ceiling Invariant (109).
   - Concrete Visual Comps in Discovery Invariant (110).
   - Zero-Lingering Server Discipline (111).
   - Full Data Provenance & Curator Colophon (112).
   - Cross-Session Discovery Ledger & Parameter Retention (113).

5. **Mode 0 Unfurl Geometry & Intermediate Trajectory Calibration**:
   - Eliminated polar bat/cat ears via polar attenuation ($\cos\phi$).
   - Eliminated normal collapse at the antimeridian equator via rotational unrolling normal.
   - Decoupled intermediate parallel expansion ($t_{\text{parallel}} = \text{smoothstep}(0.18, 0.82, \text{ease})$) from vertical Mercator stretching ($t_{\text{Mercator}} = \text{smoothstep}(0.60, 1.0, \text{ease})$), eliminating the intermediate $\alpha \approx 0.62$ diamond / rhombus silhouette while retaining closed spherical caps at $\alpha \le 0.20$.
   - **Resolved Polar Point Buckling & Layer Inversion**:
     - *Root Cause*: Adding fixed $+Z$ curl offsets at the antimeridian ($\lambda = \pm 180^\circ$, where the outward normal is $-\hat{\mathbf{z}}$) pushed cut margins inward into the globe body, and exceeding the local parallel radius ($R \cos\phi$) near the poles caused the surface to fold over and crease onto itself.
     - *Remedy*: Replaced rogue $+Z$ with the true outward horizontal radial normal $\mathbf{n}_{\text{horiz}}$ (strictly directed away from the globe core) and modulated all peel/lift displacements by $\cos\phi$, guaranteeing displacement vanishes to zero at the polar points ($|\phi| \to \pm 90^\circ$).
     - *Tangential Involute Barrel Roll (Chopes Slab Lip Kinematics)*: Upgraded Option B displacement from Cartesian straight-line offsets to a true circular arc roll in the intrinsic normal-tangent frame (horizNorm, rollTan). Replaced world-X shear with parallel tangent curving (horizTan), eliminating accordion pleating/sleeves while delivering quadratic takeoff near the hinge and substantial slab lip curvature at the seam.
     - *3D Sticker Peel Model Calibration & Seam Lip Confinement*:
       - *Root Cause of Instability*: Dynamic `peelLine` swept inward from 1.0 down to 0.0 across all inner longitudes, and `rollTan * flareBarrel` shoved vertices tangentially toward Greenwich in both hemispheres, causing circumferential bunching and traveling wave shockwaves across the continents.
       - *Remedy*: Re-anchored lip detachment strictly to the antimeridian boundary zone ($|\lambda| > 150^\circ$, i.e. $\text{lonNorm} \in [0.85, 1.0]$) with $s_{\text{peel}} = \text{smoothstep}(0.85, 1.0, \text{lonNorm})$, ensuring all inner longitudes ($|\lambda| \le 150^\circ$) remain undisturbed. Completely eliminated `rollTan * flareBarrel`, expressing curvature purely via outward radial displacement $\mathbf{n}_{\text{horiz}} \cdot \text{liftBarrel}$. Monotonic geodesic unrolling trajectory fully harmonized across WGSL, CPU engine, and overlay layers.
     - *Developable Geodesic Arc Unrolling (Elimination of Cartesian Chord Blending)*:
       - *Root Cause of 5 Perspective Artifacts*: Cartesian straight-line chord blending $\mathbf{p}(t) = (1 - t)\mathbf{p}_{\text{sphere}} + t\mathbf{p}_{\text{map}}$ collapsed depth along $Z$, creating an oblate almond/ellipsoid (Screenshot 2); $+Z$ chord lift attenuated by $\cosLat$ starved Antarctica, carving an acoustic depression bowl (Screenshot 1); early Mercator vertical stretching at high latitudes produced a polar needle spike / shark fin (Screenshot 4); desynchronized timers tore the sheet (Screenshot 3); and clamped `tOnset` killed the seam lip at $\alpha = 0.48$ (Screenshot 5).
       - *Pendulum Swing Identification & Option 1 Polar Convergence*: Setting $r_{\text{par}} = \text{mix}(R\cos\phi, R, \alpha)$ linearly with $\alpha$ destroyed polar convergence ($r_{\text{par}} = \alpha R > 0$ at poles), blowing open hollow cylindrical voids/holes at both poles and flattening the silhouette into an extruded rectangular slab.
       - *Remedy (Option 1 Polar-Convergent Developing Shell)*: Re-anchored parallel radius to strict latitude taper: $r_{\text{par}} = \text{mix}(R\cos\phi, R, t_{\text{rect}})$, where $t_{\text{rect}} = \text{smoothstep}(0.75, 1.0, \alpha)$. For $\alpha \le 0.75$, $r_{\text{par}} \equiv R\cos\phi$, guaranteeing poles remain 100% closed, solid apex points ($r = 0$) throughout the 3D unfolding phase with organic spherical silhouette. Squaring off into the planar Mercator neatline occurs smoothly only during final table landing ($\alpha \in [0.75, 1.0]$).
      - *The Pendulum Swing & Over-Correction Resolution*:
        - *Pendulum Swing 1 (Slab / Polar Holes)*: Expanding parallels linearly with $\alpha$ ($r_{\text{par}} = \text{mix}(R\cos\phi, R, \alpha)$) blew open polar holes early on and made the globe look like an extruded rectangular slab.
        - *Pendulum Swing 2 (Diamond Kite Over-Correction)*: Option 1 delayed parallel expansion until $\alpha \in [0.75, 1.0]$. This locked polar width to zero ($r=0$) for 75% of the transition while the equator unrolled flat, creating an acute needle-pointed diamond kite at $\alpha \approx 0.74$.
        - *Calibrated Balanced Resolution*: Restored staged, continuous parallel expansion ($t_{\text{parallel}} = \text{smoothstep}(0.18, 0.82, \alpha)$) coupled with uniform chord lift ($\text{chordLiftZ} = (0.5 + 0.5\cos\phi) \cdot R \cdot (1 - \alpha)\sin(\pi\alpha) \cdot 0.28$). Confined the tactile lip strictly to the boundary seam ($|\lambda| > 150^\circ$, `lonNorm > 0.85`) with pure outward radial curl and zero tangential compression toward Greenwich. Verified side-by-side at $\alpha = 0.741$: preserves natural continental proportions, eliminates polar needle spires and slab holes, and maintains closed sphere and flat neatline boundary invariants.

### Active Priority Roadmap
1. **Visual Style Noise Stripping & Medium Clarification**:
   - Refactor `crust_hydrosphere.wgsl` for all 3 mediums (Cream Rag Swiss relief, Marie Tharp bathymetry, Prussian Cyanotype blueprint).
   - Remove muddying overlaps; restore crisp, high-contrast medium identities.
2. **Artisanal Weather Overlays ("Holy Shit" Experience)**:
   - Harmonize live weather and Doppler radar layers with the physical medium inking profiles (e.g. pencil-stippled storm cells, blueprint isobars).

---

## 8. Mode 0 Manifold Mechanics — Session Summary (2026-09-22)

**Conversation**: `e63e0c35-2cd6-46ae-b6f3-c7ebf93383a8`  
**Duration**: ~80 hours  
**Branch**: `perfect_mode_zero_mechanics`  
**Commit**: `0a061e5`

### What Was Built
- Self-contained WebGPU testbed at `testbed/index.html` for isolated manifold geometry iteration
- Pin system, URL hash state encoding, auto-scrub, keyboard shortcuts
- 9 versions of proposed manifold math (v1–v9)

### Critical Discovery: Why Progressive Peel Always Fails
The equirectangular map is **π× wider** than the sphere. Any progressive approach (fold, gather, per-point curvature) that flattens back-facing points to their equirect positions creates flat extensions 3.14× wider than the sphere — manifesting as butterfly wings, rugby balls, or giant intermediate shapes. The production formula `sin(s·λ)/s` avoids this because it naturally bounds intermediate width.

### Current State (v9)
Production arc formula with all 5 staged smoothsteps replaced by continuous alpha parameters. User confirmed "Progressive seems smoother." This is the clean foundation for further iteration.

### What v9 Needs
- Directional character (unfurl feel, not just uniform unbend)
- Seam lip (surf-break curl)
- Easing curve exploration

### DO NOT RETRY
- Geodesic-distance peel timing (Saturn rings)
- Per-point curvature via localAlpha (rugby balls)
- Cartesian lerp to distant flat target (interior traversal)
- R/s cylinder radius scaling with per-point s (explosive width)
- Quadratic fold acceleration (butterfly wings)
- Dynamic peel narrowing at low alpha (premature flaps)
