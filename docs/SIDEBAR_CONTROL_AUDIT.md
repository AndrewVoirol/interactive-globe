# Indicatrix Engine: Sidebar Control Audit & Functional Ledger

This document establishes the clinical functional audit of all interactive controls, vernier instruments, tactile switches, and telemetry readouts across the `SCENE` and `DATA` tabs in `src/components/hud/UnifiedRightSidebar.tsx`.

## Summary Statistics
- **Total Audited Controls**: 28 original instruments + 1 Purity Diagnostic control = 29 controls.
- **Fully Functional (✅)**: 27 controls (93.1%)
- **Partially Functional (⚠️)**: 2 controls (6.9%) — orographic rain shadow and cloud self-shadow (scheduled for uniform wireup in Requirement R2).
- **Dead Controls / Placebos (❌)**: **0 controls (0.0%)**.

---

## Comprehensive Control Audit Table

| # | Tab | Card / Section | Instrument / Control | Target State & Uniform Pipeline | Status | Diagnostic Evaluation & Mechanism |
| :-: | :--- | :--- | :--- | :--- | :-: | :--- |
| 1 | **SCENE** | Relief & Lighting | `PolarSunCompass` (Azimuth & Altitude) | `primaryLayer.sunAzimuth`, `sunAltitude` → `SimUniforms.u_sunAzimuth`, `u_sunAltitude` | ✅ Working | Direct 2D polar dial. Dynamically steers Swiss relief primary NW/SW light vectors and cloud shadow ground projections. |
| 2 | **SCENE** | Relief & Lighting | `HypsometricReliefCurve` (Scale & Peak) | `primaryLayer.displacementScale`, `peakExponent` → `SimUniforms.u_displacementScale`, `u_peakExponent` | ✅ Working | 2D curve editor. Drives non-linear hypsometric elevation transfer and terrain displacement in `crust_hydrosphere.wgsl`. |
| 3 | **SCENE** | Relief & Lighting | `BathymetricTideGauge` (Sea Level & Clarity) | `primaryLayer.seaLevelOffset`, `waterClarity` → `SimUniforms.u_seaLevel`, `u_waterClarity` | ✅ Working | 1D vertical tide gauge. Floods/lowers coastline and shifts Jerlov oceanic radiative transfer Types I–III. |
| 4 | **SCENE** | Relief & Lighting | Hypsometric Strata (5 Pigment Pans) | `isolatedStratum` → `SimUniforms.u_isolatedStratum` (float 63) | ✅ Working | Isolates specific depth/altitude bands (-11km trench, shelf, coast, steppe, glacier) via fragment elevation glaze. |
| 5 | **SCENE** | Relief & Lighting | Crevice Depth (`VernierSlider`) | `primaryLayer.ambientOcclusion` → `SimUniforms.u_ambientOcclusion` | ✅ Working | Modulates discrete 5-tap Laplacian curvature darkening in mountain ravines and ocean trenches. |
| 6 | **SCENE** | Manifold Strata | Composite / Stipple / Lattice Buttons | `layerMode` (0, 1, 2) → `WebGPUEngine.render` lines/points pass | ✅ Working | Segmented toggle. Disables points in mode 2; disables wireframe in mode 1; enables both in mode 0. |
| 7 | **SCENE** | Projection Manifold | Modes I–V (Archival Parchment Strip) | `mode` (0..4) → `SimUniforms.u_mode`, compute shader | ✅ Working | Seamlessly morphs between Linear, Cylindrical Scroll, Griffith Fracture, Fluid Advection, and Dymaxion Net. |
| 8 | **SCENE** | Projection Manifold | Fracture Intensity (`VernierSlider`) | `fractureIntensity` → `sim.u_cursorHitPos.w` (Mode 2 only) | ✅ Working | Scales Griffith tensile hoop stress along crack nucleation fronts. Dynamically hidden in non-fracture modes. |
| 9 | **SCENE** | Projection Manifold | Vortex Strength (`VernierSlider`) | `fluidVortexStrength` → `vortexStrength` in `physics_sim.wgsl` (Mode 3) | ✅ Working | Modulates Lamb-Oseen vortex circulation and curl noise wake. Dynamically hidden in non-fluid modes. |
| 10 | **SCENE** | Projection Manifold | Distortion Indicatrix (`TactileSwitch`) | `showTissot` boolean → `WebGPUCanvas` overlay pass | ✅ Working | Renders Tissot deformation ellipses and updates real-time telemetry (Eq. Area, Local Area, Polar Dilation). |
| 11 | **SCENE** | Spatial Vantage | Kinematics Attitude Readout | Camera orientation → pitch/roll readout | ✅ Working | Monospace tabular readout: `Pitch XX° · Roll XX°`. Updates dynamically on camera rotation. |
| 12 | **SCENE** | Spatial Vantage | 5 Waypoint Presets (Equator, Pole, Seam, Iso, Horizon) | `onSnapCamera(key)` → `WebGPUCanvas` camera slerp | ✅ Working | Smoothly animates camera position, target, and up-vector to canonical cartographic vantage points. |
| 13 | **SCENE** | Spatial Vantage | Flyover Tour (`TactileSwitch` & Select) | `isDemoMode`, `demoSequence` → `trajectoryControllerRef` | ✅ Working | Automated cinematic flyover tour transitioning between Hawaii, Cape Cod, Grand Canyon, and Fuji. |
| 14 | **SCENE** | Vector Ink | Coastlines & Graticule (`TactileSwitch`) | `showVectors` (V) → `vectorRibbonPipeline` | ✅ Working | Instanced quad ribbon extrusion with screen-space anti-aliased feathering and 4D near-plane clipping guard. |
| 15 | **SCENE** | Purity Diagnostics | Purity · DEM Only (`TactileSwitch`) | `purityMode` → `crustFloats[75]` (`u_purityMode`) | ✅ Working | Gated secondary pass execution (zero draw calls per Rule 24); discards liquid hydrosphere surface in `crust_hydrosphere.wgsl:1059`. |
| 16 | **SCENE** | BETA / Diagnostics | Cursor Physics (`TactileSwitch`) | `cursorPhysicsEnabled` → `pinchControllerRef`, `u_cursorActive` | ✅ Working | Enables spring-damper cursor grab perturbations on the manifold lattice. |
| 17 | **SCENE** | BETA / Diagnostics | Paper Grain (`VernierSlider`) | `paperTooth` → `crustFloats[64..67]` (Cream Rag only) | ✅ Working | Simulates cellulose fiber tooth on 310 GSM cotton rag. Correctly tagged `(Cream Rag only)` in other themes. |
| 18 | **DATA** | Layers Stack | `+ Catalog` Slide-Out Drawer Button | `isCatalogOpen` boolean → floating sheet modal | ✅ Working | Toggles dataset catalog drawer with domain filtering (`ALL`, `TOPO`, `VECTORS`, `SATELLITE`). |
| 19 | **DATA** | Layers Stack | Layer Z-Reorder Buttons (`Up` / `Down`) | `onReorderDataLayer(id, dir)` → `useGlobeLayerManager` | ✅ Working | Restructures active layer stack order and Z-indices. |
| 20 | **DATA** | Layers Stack | Layer Visibility (`Eye` Button) | `onToggleDataLayer(id)` → layer cache | ✅ Working | Toggles dataset visibility; updates primary raster detection. |
| 21 | **DATA** | Layers Stack | Layer Removal (`Trash` Button) | `onRemoveDataLayer(id)` → layer stack | ✅ Working | Removes dataset from active composition stack. |
| 22 | **DATA** | Layers Stack | Layer Opacity & Blend Mode Accordion | `layer.opacity`, `layer.blendMode` → render passes | ✅ Working | Accordion expansion exposes continuous opacity slider and SegmentedControl blend modes (`Norm`, `Add`, `Mult`, `Scrn`). |
| 23 | **DATA** | Atmospheric Strata | Timeline Scrubber (`TimelineScrubber`) | `timelineMinutes` → `u_scrubTau`, `radarRingBuffer` | ✅ Working | Scrubs 48h prognostic forecast slices ($0..+48\text{h}$) and past Doppler radar ($-60\text{m}..0$). |
| 24 | **DATA** | Atmospheric Strata | Atmospheric Column (`AtmosphericColumnInstrument`) | `showLow`, `showMid`, `showHigh`, `atmosphericScale`, `opacity` | ✅ Working | Multi-layer strata toggle and vertical scale transfer instrument with medium-adaptive SVG artifacts. |
| 25 | **DATA** | Atmospheric Strata | Orographic Moisture (`OrographicMoistureProfile`) | `orographicCoupling`, `pluvialGamma`, `thermodynamicGating` | ⚠️ Partially Working | Orographic & pluvial coupling functional; `u_rainShadowFeedback` in `cloud_shell.wgsl:400-435` scheduled for R2 wireup. |
| 26 | **DATA** | Atmospheric Strata | Cloud Ground Shadow (`CloudShadowInstrument`) | `shadowIntensity` → `crustFloats[68]`, `cloudUniformFloats` | ⚠️ Partially Working | Modulates terrain ground shadow in `crust_hydrosphere.wgsl:695-752`; self-shadowing in `cloud_shell.wgsl:431` pending R2. |
| 27 | **DATA** | Atmospheric Strata | Cloud Drift Speed (`CloudDriftSpeedInstrument`) | `cloudDriftSpeed` → `crustFloats[69]` (`u_cloudDriftRate`) | ✅ Working | Continuous temporal advection velocity slider ($0..2000\times$). |
| 28 | **DATA** | Atmospheric Strata | Prognostic Model Card (`PrognosticModelCard`) | `prognosticModel`, `prognosticVariable` → `WeatherNextDataSource` | ✅ Working | Selects between NOAA GFS ($0.25^\circ$) and DeepMind WeatherNext 3 ($0.1^\circ$). |
| 29 | **DATA** | Geodesic Feeds | Antipodes / Conveyor / Migration / Off | `activeOverlay` → `GeodesicOverlayLayer` | ✅ Working | Eases camera to antipodal or oceanic coordinates and draws great circle circulation ribbons. |
| 30 | **DATA** | Survey Feeds | Soundings / Triangulation / Landmarks | `showSoundings`, `showTriangulation`, `showLandmarks` | ✅ Working | Tactile switches for marine bathymetric depth soundings, Delaunay survey baseline, and astronomical observatories. |
| 31 | **DATA** | Telemetry Footer | Resolution Selector (100k, 1M, 3M, 4M, 8M, 16M) | `resolution` → dynamic GPU mesh retessellation | ✅ Working | Reallocates particle storage buffers and retessellates dual-surface grid on GPU in sub-millisecond time. |
| 32 | **DATA** | Telemetry Footer | Center Coordinate & Scale Readouts | Real-time camera raycast → lat/lon & nominal scale | ✅ Working | Dynamic tabular readouts updated continuously from camera focal point raycast. |
| 33 | **DATA** | Telemetry Footer | GPU Profiler Strip & FPS Badge | `GPUProfiler.getLatestReport()` → pass timings & FPS | ✅ Working | Triple-buffered non-blocking timestamp query readout (`Sim`, `Crust`, `Lines`, `Cont`). |
