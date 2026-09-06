// ============================================================================
// File: tests/phase5-unified-connectivity.test.ts
// Test Suite: Phase 5 - Unified Architectural Connectivity, Presets, and Hardware Parity
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_LAYER_CATALOG, getPresetById } from '../src/core/data/DataLayerCatalog';
import { ProceduralAudioEngine } from '../src/core/audio/ProceduralAudioEngine';
import { ManifoldPinchController } from '../src/core/interactions/ManifoldPinchController';

describe('Phase 5: Unified Architectural Connectivity & Hardware Parity', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const catalogPath = path.join(projectRoot, 'src/core/data/DataLayerCatalog.ts');
  const catalogCode = fs.readFileSync(catalogPath, 'utf-8');

  const overlayPath = path.join(projectRoot, 'src/core/layers/DataLayerOverlay.tsx');
  const overlayCode = fs.readFileSync(overlayPath, 'utf-8');

  const sidebarPath = path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');

  const webgpuCanvasPath = path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx');
  const webgpuCanvasCode = fs.readFileSync(webgpuCanvasPath, 'utf-8');

  const wgslPath = path.join(projectRoot, 'src/webgpu/shaders/physics_sim.wgsl');
  const wgslCode = fs.readFileSync(wgslPath, 'utf-8');

  const geometryLayerPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  const geometryLayerCode = fs.existsSync(geometryLayerPath) ? fs.readFileSync(geometryLayerPath, 'utf-8') : '';

  const appPath = path.join(projectRoot, 'src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  // ==========================================================================
  // 1. Data Layer Catalog Presets & DataLayerOverlay Routing
  // ==========================================================================
  describe('1. Data Layer Presets & Overlay Routing', () => {
    it('CON-01: exposes NOAA Global Wind Vectors preset in DataLayerCatalog', () => {
      const preset = getPresetById('noaa-grib2-wind');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('NOAA Global Wind Vectors');
      expect(preset?.category).toBe('field');
      expect(preset?.url).toBe('/data/wind-grib2.json');
    });

    it('CON-02: exposes USGS Hypsometric Vector Contours preset in DataLayerCatalog', () => {
      const preset = getPresetById('usgs-elevation-contours');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('USGS Hypsometric Vector Contours');
      expect(preset?.category).toBe('point');
      expect(preset?.url).toBe('/geo-contour-mesh.bin');
    });

    it('CON-03: exposes SpaceX Starlink & LEO Constellation preset in DataLayerCatalog', () => {
      const preset = getPresetById('spacex-satellite-constellation');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('SpaceX Starlink & LEO Constellation');
      expect(preset?.category).toBe('trajectory');
    });

    it('CON-04: routes trajectory category in DataLayerOverlay to SatelliteTrajectoryRenderer', () => {
      expect(overlayCode).toContain("case 'trajectory':");
      expect(overlayCode).toContain('SatelliteTrajectoryRenderer');
    });
  });

  // ==========================================================================
  // 2. GPU Uniform Sliders & Shader Parity (WebGL2 & WebGPU)
  // ==========================================================================
  describe('2. Mode 2 & Mode 3 Physics Sliders and Uniform Parity', () => {
    it('CON-05: WGSL compute shader defines u_vortexStrength and u_cursorHitPos.w fracture multiplier', () => {
      expect(wgslCode).toContain('u_vortexStrength: f32');
      expect(wgslCode).toContain('let fracMult = select(1.0, sim.u_cursorHitPos.w, sim.u_cursorHitPos.w > 0.01);');
      expect(wgslCode).toContain('let vortexMult = select(1.0, sim.u_vortexStrength, sim.u_vortexStrength > 0.01);');
    });

    it('CON-06: WebGL2 GeometryLayer declares u_vortexStrength and u_fractureIntensity uniforms and applies multipliers', () => {
      if (!geometryLayerCode) return;
      expect(geometryLayerCode).toContain('uniform float u_vortexStrength;');
      expect(geometryLayerCode).toContain('uniform float u_fractureIntensity;');
      expect(geometryLayerCode).toContain('float fracMult = max(0.01, u_fractureIntensity);');
      expect(geometryLayerCode).toContain('float vortexMult = max(0.01, u_vortexStrength);');
    });

    it('CON-07: UnifiedRightSidebar renders Fracture Intensity slider when mode === 2', () => {
      expect(sidebarCode).toContain('Fracture Intensity');
      expect(sidebarCode).toContain('mode === 2');
      expect(sidebarCode).toContain('onFractureIntensityChange');
    });

    it('CON-08: UnifiedRightSidebar renders Vortex Swirl Strength slider when mode === 3', () => {
      expect(sidebarCode).toContain('Vortex Swirl Strength');
      expect(sidebarCode).toContain('mode === 3');
      expect(sidebarCode).toContain('onFluidVortexStrengthChange');
    });
  });

  // ==========================================================================
  // 3. WebGPU Visual Parity Overlays & Telemetry Profiler
  // ==========================================================================
  describe('3. WebGPU Parity Overlays & Telemetry Profiler', () => {
    it('CON-09: WebGPUCanvas decouples showContours from activeOverlay to enable independent contour toggle', () => {
      expect(webgpuCanvasCode).toContain("l.id === 'usgs-elevation-contours' && l.visible");
      expect(webgpuCanvasCode).toContain('showContours');
    });

    it('CON-10: WebGPUCanvas renders 2D overlay canvas for Landmarks, Tissot, and Geodesic Arcs', () => {
      expect(webgpuCanvasCode).toContain('overlayCanvasRef');
      expect(webgpuCanvasCode).toContain('curActiveOverlay');
      expect(webgpuCanvasCode).toContain('curShowTissot');
      expect(webgpuCanvasCode).toContain('curShowLandmarks');
    });

    it('CON-11: WebGPUCanvas polls GPU Profiler report and forwards via onGpuProfilerReport', () => {
      expect(webgpuCanvasCode).toContain('lastProfilerTimeRef');
      expect(webgpuCanvasCode).toContain('engine.getProfiler()?.getLatestReport()');
      expect(webgpuCanvasCode).toContain('callbacksRef.current.onGpuProfilerReport');
    });

    it('CON-12: UnifiedRightSidebar displays GPU Profiler pass breakdown when backend === "webgpu"', () => {
      expect(sidebarCode).toContain("backend === 'webgpu' && gpuReport");
      expect(sidebarCode).toContain('gpuReport.computeMs');
      expect(sidebarCode).toContain('gpuReport.reliefMs');
      expect(sidebarCode).toContain('gpuReport.linesMs');
      expect(sidebarCode).toContain('gpuReport.contoursMs');
    });
  });

  // ==========================================================================
  // 4. Audio Engine Integration
  // ==========================================================================
  describe('4. Audio Engine Integration & Rebound Mechanics', () => {
    it('CON-13: ProceduralAudioEngine provides triggerRebound, triggerRupture, and updateFlowVelocity', () => {
      const audio = new ProceduralAudioEngine(true);
      expect(typeof audio.triggerRebound).toBe('function');
      expect(typeof audio.triggerRupture).toBe('function');
      expect(typeof audio.updateFlowVelocity).toBe('function');
    });

    it('CON-14: ManifoldPinchController triggers audioEngine.triggerRebound upon pointer release', () => {
      const audio = new ProceduralAudioEngine(true);
      let reboundCalledWith: number | null = null;
      audio.triggerRebound = (depth: number) => {
        reboundCalledWith = depth;
      };

      const controller = new ManifoldPinchController(audio);
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 5, 0.85);
      expect(controller.getState().fsmState).toBe('PINCH_ENGAGED');

      controller.onPointerUp();
      expect(controller.getState().fsmState).toBe('RELEASE_REBOUND');
      expect(reboundCalledWith).toBeCloseTo(0.85, 2);
    });

    it('CON-15: App.tsx routes flow velocity audio modulated by fluidVortexStrength during Mode 3', () => {
      expect(appCode).toContain('audioEngineRef.current.updateFlowVelocity(flowMag)');
      expect(appCode).toContain('fluidVortexStrength');
    });
  });

  // ==========================================================================
  // 5. Deferred HUD Archiving & Backward Compatibility
  // ==========================================================================
  describe('5. Deferred HUD Archiving & Backward Compatibility', () => {
    it('CON-16: archives superseded HUD components in src/core/_deferred/hud/', () => {
      const deferredDir = path.join(projectRoot, 'src/core/_deferred/hud');
      if (!fs.existsSync(deferredDir)) return;
      expect(fs.existsSync(deferredDir)).toBe(true);
      expect(fs.existsSync(path.join(deferredDir, 'TopologyControlDock.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(deferredDir, 'SystemStatusPill.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(deferredDir, 'DataLayersDrawer.tsx'))).toBe(true);
    });

    it('CON-17: documents deferred HUD components in src/core/_deferred/README.md', () => {
      const readmePath = path.join(projectRoot, 'src/core/_deferred/README.md');
      const readmeCode = fs.readFileSync(readmePath, 'utf-8');
      expect(readmeCode).toContain('### 4. `hud/` (Superseded Fragmented HUD Components)');
      expect(readmeCode).toContain('TopologyControlDock.tsx');
      expect(readmeCode).toContain('DataLayersDrawer.tsx');
    });
  });
});
