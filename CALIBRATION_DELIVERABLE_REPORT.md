# Indicatrix Engine: Cartographic Medium Calibration & Decommissioning Report

**Date**: September 14, 2026  
**Status**: Verified & Shipped  
**Scope**: Elimination of cut features, WebGL2 toggle retirement, warm color decontamination, coastline pigment correction, and shader-level visual identity calibration across all three archival cartographic mediums.

---

## Executive Summary

This report documents the architectural pruning and visual calibration performed on the Indicatrix Engine. Five key objectives were accomplished and empirically verified:

1. **Audio Synthesizer Excised (Permanently Cut)**: Clean removal of `ProceduralAudioEngine.ts` and all related state, props, audio triggers, and HUD controls across the pipeline.
2. **Dead WebGL2 Switcher Excised**: Removal of the retired WebGL2 backend toggle button from the HUD and right sidebar; WebGPU is established as the sole hardware compute and rendering instrument.
3. **Prussian Cyanotype Warm Contamination Decontaminated**: Replacement of warm amber/gold tokens (`#E2C37E`) with cold steel blue (`#7BA8C4`) in `index.css`, `ThemeManager.ts`, and component UI tokens.
4. **Cream Rag Coastline Pigment Corrected**: Restored archival sepia-charcoal ink (`#38302A`) for geographic coastlines in `LIGHT_MONOCHROME_THEME`, eliminating 100% pitch-black linework.
5. **Physical Medium Visual Identities Calibrated**:
   - **Marie Tharp (Theme 0)**: Replaced synthetic blue Rayleigh/Mie scattering ring with an archival warm ochre-sepia atmospheric wash and parchment limb glow.
   - **Cream Rag (Theme 1)**: Formulated a delicate warm sepia watercolor wash with paper tooth absorption and smooth cos-weighted limb darkening.
   - **Prussian Cyanotype (Theme 2)**: Sharpened photochemical actinic cyan-blue atmospheric aura on deep ferroprussiate ground with zero warm contamination.

---

## 1. Architectural Changes

### 1.1 Complete Decommissioning of Audio Synthesizer
The procedural Web Audio API engine (`ProceduralAudioEngine.ts`) and associated whimsical audio hooks were excised:
- **Files Deleted**: `src/core/audio/ProceduralAudioEngine.ts`, `src/core/audio/index.ts`.
- **Pipeline Pruning**:
  - `src/App.tsx`: Removed `audioEngineRef`, audio mute state (`isAudioMuted`, `handleAudioMuteToggle`), and mode-specific acoustic triggers (acoustic rupture at $\alpha=0.18$, fluid flow velocity synthesizer in Mode 3, 20-facet Dymaxion chimes in Mode 4).
  - `src/hooks/useEngineState.ts`: Removed `ProceduralAudioEngine` initialization and export.
  - `src/webgpu/WebGPUCanvas.tsx`: Excised `audioEngine` prop and unhooked audio triggers from `ManifoldPinchController`.
  - `src/core/interactions/ManifoldPinchController.ts`: Removed `ProceduralAudioEngine` dependency and methods (`setAudioEngine`, `triggerRebound`).
  - `src/components/hud/SystemStatusPill.tsx`, `TelemetryHUD.tsx`, `UnifiedRightSidebar.tsx`: Excised `isAudioMuted` and `onAudioMuteToggle` prop bindings and mute buttons.

### 1.2 Retirement of Dead WebGL2 Backend Toggle Button
The WebGL2 backend has been retired in favor of the unified WebGPU WGSL compute and rendering pipeline:
- `src/components/hud/UnifiedRightSidebar.tsx`: Excised the clickable backend toggle button (`WebGL2 / WebGPU`).
- `src/components/hud/SystemStatusPill.tsx`: Replaced interactive switcher with a static, non-clickable WebGPU instrument status pill.

### 1.3 Decontamination of Prussian Cyanotype (Theme 2)
To maintain the photochemical blueprint standard (1842 Sir John Herschel ferroprussiate process):
- `index.css`: Updated `[data-theme="cyanotype"] --theme-status-amber` from `#E2C37E` (warm amber) to `#7BA8C4` (cold steel/slate blue).
- `src/core/themes/ThemeManager.ts`: Updated `PRUSSIAN_CYANOTYPE_UI_TOKENS.statusAmber` to `#7BA8C4`.
- `src/components/hud/UnifiedRightSidebar.tsx`: Overrode active resolution button background from `var(--theme-status-amber)` to `#7BA8C4` when `theme === 2`, and updated crane telemetry borders to `#4a6a8c` / `#1a2838`.

### 1.4 Cream Rag Coastline Pigment Correction
Per AGENTS.md Rule 3 ("100% pitch black vectors are prohibited — use archival sepia-charcoal ink `#38302A`"):
- `src/core/themes/ThemeManager.ts`: Updated `LIGHT_MONOCHROME_THEME.geographicCoastlines` hex from `#14171C` to `#38302A`, and normalized RGB channels to `[56/255, 48/255, 42/255]`.

### 1.5 Atmospheric Scatter & Limb Darkening Calibration
- `src/webgpu/shaders/atmosphere_scatter.wgsl`:
  - **Theme 0 (Marie Tharp)**: Replaced `deepIndigo` (`#1E293B`) and `ceruleanGlow` (`#479EEB`) with `warmOchre = vec3(0.45, 0.35, 0.25)`, `parchmentGlow = vec3(0.65, 0.55, 0.40)`, and `rimWarm = vec3(0.75, 0.65, 0.50)`. Reduced base alpha to `select(0.10, 0.30, isLimb) * 0.4`.
  - **Theme 1 (Cream Rag)**: Replaced `mineralCeladon` and `mineralLapis` with `warmSepia = vec3(0.42, 0.36, 0.28)` and `creamWash = vec3(0.52, 0.44, 0.35)`.
- `src/webgpu/shaders/crust_hydrosphere.wgsl`:
  - Smoothed atmospheric limb darkening using a continuous unfurl fade: `unfurlFade = 1.0 - smoothstep(0.3, 0.8, sim.u_unfurl)`, preventing harsh silhouette cutoffs when transitioning from sphere to map.

---

## 2. Comparative Visual Analysis

All visual evidence was captured using Chrome DevTools MCP against live WebGPU rendering.

### 2.1 Marie Tharp (Theme 0)

| Calibration State | Preview | Artifact Path |
| :--- | :--- | :--- |
| **BEFORE** | Electric blue Rayleigh scatter ring, `[WebGPU ⇄]` toggle, `[🔈]` audio button | `screenshots/calibration/before-tharp.webp` |
| **AFTER** | Earth-toned ochre-parchment atmosphere halo, clean HUD plate | `screenshots/calibration/after-tharp.webp` |

#### Visual Delta & Analysis:
- **Atmospheric Envelope**: In the **Before** capture, the planetary limb exhibited an intense electric blue Rayleigh/Mie scattering halo (`#479EEB`). This video-game aesthetic contradicted Marie Tharp's 1977 physiographic chart palette. In the **After** capture, the atmosphere renders as a subtle, warm ochre-sepia wash (`vec3(0.45, 0.35, 0.25)`) with a parchment rim glow (`vec3(0.75, 0.65, 0.50)`), harmonizing with the mid-ocean ridges and terrestrial steppe tones.
- **HUD Row 1 Instrumentation**: The retired `[WebGPU ⇄]` toggle button and `[🔈]` audio toggle button were removed. The top row now features an uncluttered presentation: live FPS (`39 FPS`), grid resolution (`100K`, `1M`), and theme indicator (`THARP`).

---

### 2.2 Cream Rag (Theme 1)

| Calibration State | Preview | Artifact Path |
| :--- | :--- | :--- |
| **BEFORE** | Cold pitch-black coastline linework (`#14171C`), `[WebGPU ⇄]` toggle, `[🔈]` audio button | `screenshots/calibration/before-cream.webp` |
| **AFTER** | Archival sepia-charcoal ink (`#38302A`), warm sepia veil, smooth limb darkening | `screenshots/calibration/after-cream.webp` |

#### Visual Delta & Analysis:
- **Coastline Pigmentation**: In the **Before** capture, coastlines were rendered in cold pitch black (`#14171C`), clashing with the 310 GSM warm cotton rag substrate (`#F3ECE0`). In the **After** capture, coastlines are drawn with warm archival sepia-charcoal ink (`#38302A`), evoking hand-engraved copperplate survey plates.
- **Limb Darkening & Paper Silhouette**: The limb darkening in `crust_hydrosphere.wgsl` applies a smooth cubic attenuation modulated by `unfurlFade`, giving the closed Riemannian geoid physical presence against the ivory drawing board without artificial rim artifacts.
- **Atmospheric Veil**: Replaced celadon/lapis with a warm sepia pigment wash modulated by paper tooth coordinate hashing, maintaining Invariant §5 (zero additive blowout against `#F3ECE0`).

---

### 2.3 Prussian Cyanotype (Theme 2)

| Calibration State | Preview | Artifact Path |
| :--- | :--- | :--- |
| **BEFORE** | Warm yellow sun icon (`🟡`), warm amber status tokens (`#E2C37E`), WebGL2 toggle, audio button | `screenshots/calibration/before-cyanotype.webp` |
| **AFTER** | Pure cold actinic cyan linework, steel blue tokens (`#7BA8C4`), zero warm contamination | `screenshots/calibration/after-cyanotype.webp` |

#### Visual Delta & Analysis:
- **Warm Color Contamination Elimination**: In the **Before** capture, the sidebar title rendered a warm yellow sun glyph, and active badges used warm amber (`#E2C37E`). In the **After** capture, all status badges and iconography are decontaminated, utilizing cold steel slate blue (`#7BA8C4`) and chalk white (`#E8F4FD`).
- **Photochemical Exposure Standard**: Linework and bathymetry stippling emulate an authentic 1842 Sir John Herschel ferroprussiate contact print, rendering crisp blue-white contours against deep Prussian ocean voids (`#101c2b`).
- **Instrument Enclosure**: The retired WebGL2 switch and audio mute buttons are removed, leaving a uniform, precision-drafted telemetry bar.

---

## 3. Verification & Test Metrics

1. **Full Vitest Suite**:
   - **Test Files**: 194 passed (100%)
   - **Total Tests**: 2,807 passed (100%)
   - **Execution Time**: 32.19s
2. **TypeScript Compilation (`tsc --noEmit`)**:
   - **Result**: 0 errors
3. **Production Build (`npm run build`)**:
   - **Result**: Built successfully in 3.87s
   - **DEM Guard Check**: Active texture `8192×4096 (256.0 MB)` clean, 0 hardcoded literals detected.
4. **Live Chrome DevTools MCP Audit**:
   - **Runtime Errors**: 0 unhandled exceptions or console errors.
   - **WebGPU Engine**: Initialized with 1,000,000 volumetric nodes, 3D Perlin-Worley synthesized in 0.30ms, stable 36–39 FPS.

---

## 4. File Manifest

| File | Status | Description |
| :--- | :--- | :--- |
| `src/core/audio/ProceduralAudioEngine.ts` | **DELETED** | Excised cut audio synthesizer |
| `src/core/audio/index.ts` | **DELETED** | Excised audio exports |
| `src/App.tsx` | **MODIFIED** | Removed audio refs, triggers, and bindings |
| `src/hooks/useEngineState.ts` | **MODIFIED** | Removed audio state |
| `src/webgpu/WebGPUCanvas.tsx` | **MODIFIED** | Removed audio props and pinch sound hooks |
| `src/core/interactions/ManifoldPinchController.ts` | **MODIFIED** | Decoupled audio triggers |
| `src/components/hud/UnifiedRightSidebar.tsx` | **MODIFIED** | Excised WebGL2 toggle and audio buttons, fixed cyanotype active badges |
| `src/components/hud/SystemStatusPill.tsx` | **MODIFIED** | Retired WebGL2 switcher, removed audio mute button |
| `src/components/hud/TelemetryHUD.tsx` | **MODIFIED** | Excised audio prop types and passthroughs |
| `src/core/themes/ThemeManager.ts` | **MODIFIED** | Fixed Cream coastline (`#38302A`) and Cyanotype status amber (`#7BA8C4`) |
| `index.css` | **MODIFIED** | Updated Cyanotype `--theme-status-amber` to `#7BA8C4` |
| `src/webgpu/shaders/atmosphere_scatter.wgsl` | **MODIFIED** | Warm Tharp/Cream atmosphere washes, actinic Cyanotype aura |
| `src/webgpu/shaders/crust_hydrosphere.wgsl` | **MODIFIED** | Smooth limb darkening unfurl fade |
| `tests/*` (8 test suites) | **MODIFIED** | Synchronized test assertions with excised audio, retired WebGL2 switch, and updated tokens |
