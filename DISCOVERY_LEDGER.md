# Indicatrix Engine — Discovery & Remediation Ledger

**Date:** 2026-09-14  
**Status:** Discovery Phase Completed / Remediation Scoping  
**Guiding Benchmark:** *"Maps or globes one can find in a museum or library. Precise, perfect cartography with distinct, authentic archival styles, where every element feels intentional rather than half-baked."*

---

## 1. High-Level Triage Summary

| Domain | User Verdict | Root Cause / Current Failure State | Immediate Strategic Direction |
| :--- | :---: | :--- | :--- |
| **Air Dancer & Audio Whimsy** | `❌ CUT` | 3D inflatable tube man and synthesizer audio chime dissonance. Clashes with serious cartography. | **Purge completely.** Delete `AirDancerScene.tsx`, `ProceduralAudioEngine.ts`, and all references in `App.tsx`. |
| **Globe-to-Map Morphing** | `✅ KEEP` | 5 modes diluting focus; Dymaxion is broken across styles. | **Consolidate to 2 heroes:** Hero 1 = Mode 1 (Linear/Spherical Unfurl), Hero 2 = Mode 4 (Fluid Flow). Demote/retire Dymaxion from the main UI. |
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

### 2.2. Dymaxion De-prioritization
* **Target Files:** `src/App.tsx`, `src/components/hud/NavigationDock.tsx`
* **Action:** Remove Dymaxion from the primary mode switcher. Establish Mode 1 (Linear/Spherical Unfurl) as the premier hero mode, with Mode 4 (Fluid Advection) as the dynamic visual hero.

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
   - Mode 1 (Linear Unfurl) and Mode 4 (Fluid Advection) designated as primary hero projections.
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

### Active Priority Roadmap
1. **Visual Style Noise Stripping & Medium Clarification**:
   - Refactor `crust_hydrosphere.wgsl` for all 3 mediums (Cream Rag Swiss relief, Marie Tharp bathymetry, Prussian Cyanotype blueprint).
   - Remove muddying overlaps; restore crisp, high-contrast medium identities.
2. **Artisanal Weather Overlays ("Holy Shit" Experience)**:
   - Harmonize live weather and Doppler radar layers with the physical medium inking profiles (e.g. pencil-stippled storm cells, blueprint isobars).

