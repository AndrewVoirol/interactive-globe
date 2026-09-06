# Deferred Architectural Modules & Stubs

This directory contains hollow stubs, theoretical exploration prototypes, and duplicate code modules that were cataloged during the Indicatrix Engine Quality Recovery project (Milestone 1, Requirement R1) and deferred from active production execution.

---

## Catalog of Deferred Items

### 1. `adapters/GlobeOverlayAdapters.ts`
- **Original Path**: `src/core/layers/GlobeOverlayAdapters.ts`
- **Contents**: `BaseGlobeOverlayLayer`, `VectorOverlayPluginLayer`, `GeodesicOverlayPluginLayer`.
- **Reason for Deferral**: Every method (`onAdd`, `onRemove`, `update`, `render`, `dispose`) was an empty `{}` stub implementing the `IGlobeLayer` interface. In the production architecture, vector overlays (`VectorOverlayLayer.tsx`) and geodesic arcs (`GeodesicOverlayLayer.tsx`) are mounted directly as first-class React Three Fiber declarative components, rendering the imperative adapter pattern inert and redundant.

### 2. `paradigms/` (Universal Substrate Stubs)
- **Original Paths**: `src/core/paradigms/*.ts`
- **Contents**:
  - `IRenderParadigm.ts` & `ParadigmRegistry.ts` (substrate interface and registry scaffolding)
  - `ScientificWireframeParadigm.ts`, `PhotorealisticTerrainParadigm.ts`, `VoxelParadigm.ts`, `LowPolyParadigm.ts`, `TopographicContourParadigm.ts`, `AbstractSculptureParadigm.ts` (empty method stubs)
  - Theoretical prototypes: `MassSpringLatticeParadigm.ts`, `ViscoelasticTearParadigm.ts`, `FractureDynamicsParadigm.ts`, `MagneticRepulsionParadigm.ts`, `AdvectionDiffusionParadigm.ts`, `TransformFeedbackParadigm.ts` (conceptual non-geospatial physics stubs formulated in early architectural audit proposals)
- **Reason for Deferral**: The engine's real simulation and rendering pipeline executes through custom WebGL2 GLSL shaders in `App.tsx` and dedicated WebGPU WGSL compute shaders in `WebGPUEngine.ts`. The `IRenderParadigm` hierarchy was a conceptual abstraction layer whose implementations were empty shells never wired to the live GPU context or rendering loop.

### 3. `shaders/morph-shared.glsl.ts`
- **Original Path**: `src/core/shaders/morph-shared.glsl.ts`
- **Contents**: Shared GLSL functions (`computeCurlNoiseGLSL`, `mode1CylindricalScrollGLSL`, `mode2GriffithFractureGLSL`, `mode3FluidAdvectionGLSL`, `mode4FullerDymaxionGLSL`).
- **Reason for Deferral**: Exact duplicate of `src/core/shaders/ShaderChunkRegistry.ts`. Retaining `ShaderChunkRegistry.ts` as the canonical source of shared GLSL chunks eliminates code duplication and confusion.

### 4. `hud/` (Superseded Fragmented HUD Components)
- **Archived In**: `src/core/_deferred/hud/`
- **Original / Mirror Paths**: `src/components/hud/TopologyControlDock.tsx`, `src/components/hud/SystemStatusPill.tsx`, `src/components/hud/DataLayersDrawer.tsx`
- **Reason for Deferral**: Superseded by `UnifiedRightSidebar.tsx` and `TelemetryHUD.tsx`, which integrate engine status, morph topology, and GIS data layers into a unified responsive HUD dock with a sliding cartographic catalog sheet. The original standalone files are preserved in `src/components/hud/` for vitest test suite backward compatibility and mirrored here for architectural hygiene.

---

## Active Production Core Modules (Intact)

The following core modules are genuinely functional and remain active in `src/core/`:
- `src/core/CursorContext.tsx` — Manifold raycasting and hover state provider
- `src/core/DevToolsAPI.ts` — Engine state exposure for testing and debugging
- `src/core/GeodesicOverlayLayer.tsx` — Great circle arcs and Tissot indicatrices
- `src/core/GlobeOverlay.ts` — Static cartographic baseline overlay
- `src/core/VectorOverlayLayer.tsx` — High-precision coastline vector boundaries
- `src/core/audio/ProceduralAudioEngine.ts` — Web Audio API procedural synthesis
- `src/core/data/DataLayerCatalog.ts` — Layer presets and metadata
- `src/core/data/RasterTileDataSource.ts` — Raster DEM tile ingestion
- `src/core/data/IDataSource.ts` — Universal data source interface
- `src/core/layers/useGlobeLayerManager.ts` — Layer state orchestration hook
- `src/core/layers/DataLayerOverlay.tsx` — GIS layer compositor
- `src/core/layers/renderers/*` — Active GIS layer sub-renderers
- `src/core/themes/ThemeManager.ts` — Obsidian/Archival design palette system
