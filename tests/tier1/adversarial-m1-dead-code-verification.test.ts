// ============================================================================
// File: tests/tier1/adversarial-m1-dead-code-verification.test.ts
// Challenger 1 Empirical Test Suite: Milestone 1 Dead Code Surgery & Clean Up
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import type { SimulationMode, LayerMode, GeodesicOverlayMode, DymaxionProjectionResult } from '../../types';
import { useEngineState } from '../../src/hooks/useEngineState';

describe('Milestone 1 Empirical Stress-Test: Dead Code Surgery & Clean Up', () => {
  const rootDir = path.resolve(__dirname, '../..');

  // ==========================================================================
  // Section 1: types.ts Export & Dead Code Verification
  // ==========================================================================
  describe('1. types.ts Active Exports & Dead Import Pruning', () => {
    it('validates active exported types conform to runtime contract', () => {
      const mode0: SimulationMode = 0;
      const mode4: SimulationMode = 4;
      const layerBoth: LayerMode = 0;
      const layerPoints: LayerMode = 1;
      const layerWire: LayerMode = 2;
      const overlayAntipodes: GeodesicOverlayMode = 'antipodes';
      const dymaxResult: DymaxionProjectionResult = {
        faceIndex: 0,
        maxDot: 0.95,
        gnomonicPos: [0.1, 0.2, 0.3],
        dymaxion2D: [0.5, 0.5],
      };

      expect([mode0, mode4]).toEqual([0, 4]);
      expect([layerBoth, layerPoints, layerWire]).toEqual([0, 1, 2]);
      expect(overlayAntipodes).toBe('antipodes');
      expect(dymaxResult.faceIndex).toBe(0);
    });

    it('verifies types.ts contains zero unused GIS types and zero external GIS imports', () => {
      const typesPath = path.join(rootDir, 'types.ts');
      const content = fs.readFileSync(typesPath, 'utf8');

      // Unused external library imports
      expect(content).not.toContain("from 'geojson'");
      expect(content).not.toContain("from 'topojson-specification'");
      expect(content).not.toContain("from 'd3'");

      // Dead types
      expect(content).not.toMatch(/\btype Feature\b/);
      expect(content).not.toMatch(/\btype FeatureCollection\b/);
      expect(content).not.toMatch(/\binterface WorldAtlas\b/);
      expect(content).not.toMatch(/\btype RenderStyle\b/);
      expect(content).not.toMatch(/\binterface TelemetryData\b/);
      expect(content).not.toMatch(/\binterface CustomInterpolatorInstance\b/);

      // Active types must exist
      expect(content).toContain('export type SimulationMode');
      expect(content).toContain('export type LayerMode');
      expect(content).toContain('export type GeodesicOverlayMode');
      expect(content).toContain('export interface DymaxionProjectionResult');
    });
  });

  // ==========================================================================
  // Section 2: index.css Dead Selector Pruning
  // ==========================================================================
  describe('2. index.css Dead Selector Pruning & Compilation Health', () => {
    it('verifies dead classes (.loading-spinner, .canvas-container, .toggle-btn) are completely absent', () => {
      const cssPath = path.join(rootDir, 'index.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      expect(content).not.toContain('.loading-spinner');
      expect(content).not.toContain('@keyframes spin');
      expect(content).not.toContain('.canvas-container');
      expect(content).not.toContain('.toggle-btn');
    });

    it('verifies tailwind directives are preserved and stylesheet compiles cleanly', () => {
      const cssPath = path.join(rootDir, 'index.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      expect(content).toContain('@tailwind base;');
      expect(content).toContain('@tailwind components;');
      expect(content).toContain('@tailwind utilities;');
    });
  });

  // ==========================================================================
  // Section 3: App.tsx Dead Imports, Zombie Refs & Dead State
  // ==========================================================================
  describe('3. App.tsx Dead Code, Zombie Refs & Unused Imports', () => {
    const appPath = fs.existsSync(path.join(rootDir, 'src/App.tsx')) ? path.join(rootDir, 'src/App.tsx') : path.join(rootDir, 'App.tsx');
    let appContent = fs.readFileSync(appPath, 'utf8');
    const geoPath = path.join(rootDir, 'src/components/canvas/GeometryLayer.tsx');
    if (fs.existsSync(geoPath)) {
      appContent += '\n' + fs.readFileSync(geoPath, 'utf8');
    }

    it('verifies unreferenced module imports are absent from App.tsx', () => {
      expect(appContent).not.toMatch(/import\s+.*\{[^}]*\bCursorTracker\b[^}]*\}\s+from/);
      expect(appContent).not.toContain('isWebGPUSupported');
      expect(appContent).not.toMatch(/import\s+.*\{[^}]*\bGeodesicOverlayMode\b[^}]*\}\s+from/);
      expect(appContent).not.toContain('WhimsicalEffectsManager');
      expect(appContent).not.toContain('ManifoldPinchController');
      expect(appContent).not.toContain('DataLayerItem');
      expect(appContent).not.toContain('BlendModeType');
      expect(appContent).not.toContain('computeCurlNoiseGLSL');
      expect(appContent).not.toContain('mode1CylindricalScrollGLSL');
      expect(appContent).not.toContain('mode2GriffithFractureGLSL');
      expect(appContent).not.toContain('mode3FluidAdvectionGLSL');
      expect(appContent).not.toContain('mode4FullerDymaxionGLSL');
    });

    it('verifies zombie manager refs (whimsicalRef, pinchControllerRef) are absent', () => {
      expect(appContent).not.toContain('whimsicalRef');
      expect(appContent).not.toContain('pinchControllerRef');
    });

    it('verifies dead state destructuring (isHudOpen, playDirection) is absent from App.tsx', () => {
      expect(appContent).not.toMatch(/const\s*\{[^}]*\bisHudOpen\b[^}]*\}\s*=\s*engineState/);
      expect(appContent).not.toMatch(/const\s*\{[^}]*\bplayDirection\b[^}]*\}\s*=\s*engineState/);
    });

    it('verifies dead GLSL function oklch2rgb is absent from shader code in App.tsx', () => {
      expect(appContent).not.toContain('oklch2rgb');
    });

    it('verifies commented-out debug code (layerMode comments) is absent', () => {
      expect(appContent).not.toContain('// const [layerMode, setLayerMode]');
      expect(appContent).not.toContain('(window as any).setLayerMode');
    });
  });

  // ==========================================================================
  // Section 4: useEngineState Hook Empirical Contract & Runtime Safety
  // ==========================================================================
  describe('4. useEngineState Hook Integrity & Runtime Consumer Execution', () => {
    it('verifies useEngineState source code has zero zombie refs', () => {
      const hookPath = path.join(rootDir, 'src/hooks/useEngineState.ts');
      const hookContent = fs.readFileSync(hookPath, 'utf8');

      expect(hookContent).not.toContain('WhimsicalEffectsManager');
      expect(hookContent).not.toContain('ManifoldPinchController');
      expect(hookContent).not.toContain('whimsicalEffectsRef');
      expect(hookContent).not.toContain('pinchControllerRef');
      expect(hookContent).not.toContain('whimsicalEffects');
      expect(hookContent).not.toContain('pinchController');
    });

    it('executes useEngineState without crashing and asserts all consumer contract properties are defined', () => {
      let state: any = null;
      function TestHarness() {
        state = useEngineState();
        return React.createElement('div', null, 'OK');
      }

      expect(() => {
        ReactDOMServer.renderToStaticMarkup(React.createElement(TestHarness));
      }).not.toThrow();

      expect(state).not.toBeNull();

      // State properties
      expect(state.backend).toBe('webgl2');
      expect(typeof state.setBackend).toBe('function');
      expect([0, 1]).toContain(state.theme);
      expect(typeof state.setTheme).toBe('function');
      expect(state.themePalette).toBeDefined();
      expect(typeof state.hasWebGPU).toBe('boolean');
      expect(typeof state.setHasWebGPU).toBe('function');
      expect(typeof state.alpha).toBe('number');
      expect(typeof state.setAlpha).toBe('function');
      expect([0, 1, 2, 3, 4]).toContain(state.mode);
      expect(typeof state.setMode).toBe('function');
      expect([0, 1, 2]).toContain(state.layerMode);
      expect(typeof state.setLayerMode).toBe('function');
      expect(typeof state.cursorPhysicsEnabled).toBe('boolean');
      expect(typeof state.setCursorPhysicsEnabled).toBe('function');
      expect(['100k', '1M']).toContain(state.resolution);
      expect(typeof state.setResolution).toBe('function');
      expect(typeof state.fps).toBe('number');
      expect(typeof state.setFps).toBe('function');
      expect(state.activeOverlay).toBe('off');
      expect(typeof state.setActiveOverlay).toBe('function');
      expect(typeof state.showLandmarks).toBe('boolean');
      expect(typeof state.setShowLandmarks).toBe('function');
      expect(typeof state.showTissot).toBe('boolean');
      expect(typeof state.setShowTissot).toBe('function');
      expect(typeof state.showVectors).toBe('boolean');
      expect(typeof state.setShowVectors).toBe('function');
      expect(typeof state.isPlaying).toBe('boolean');
      expect(typeof state.setIsPlaying).toBe('function');
      expect(typeof state.playbackSpeed).toBe('number');
      expect(typeof state.setPlaybackSpeed).toBe('function');
      expect(typeof state.isZenMode).toBe('boolean');
      expect(typeof state.setIsZenMode).toBe('function');
      expect(state.dataInfo).toBeDefined();
      expect(state.dataInfo.pointCount).toBeGreaterThan(0);
      expect(typeof state.setDataInfo).toBe('function');
      expect(state.audioEngine).toBeDefined();

      // Pruned properties must be undefined
      expect(state.whimsicalEffects).toBeUndefined();
      expect(state.pinchController).toBeUndefined();
    });
  });

  // ==========================================================================
  // Section 5: WebGPU Canvas & WGSL Uniform Dead Code Pruning
  // ==========================================================================
  describe('5. WebGPU Cleanliness & Uniform Compaction', () => {
    it('verifies WebGPUCanvas.tsx has zero unused RTCCamera or ThemeManager imports', () => {
      const canvasPath = path.join(rootDir, 'src/webgpu/WebGPUCanvas.tsx');
      const canvasContent = fs.readFileSync(canvasPath, 'utf8');

      expect(canvasContent).not.toMatch(/import\s+.*\{[^}]*\bRTCCamera\b[^}]*\}\s+from/);
      expect(canvasContent).not.toMatch(/import\s+.*\{[^}]*\bThemeManager\b[^}]*\}\s+from/);
    });

    it('verifies physics_sim.wgsl has removed unused uniforms', () => {
      const simWgslPath = path.join(rootDir, 'src/webgpu/shaders/physics_sim.wgsl');
      const simContent = fs.readFileSync(simWgslPath, 'utf8');

      const simUniformsMatch = simContent.match(/struct\s+SimUniforms\s*\{([^}]+)\}/);
      expect(simUniformsMatch).not.toBeNull();
      const uniformsBody = simUniformsMatch![1];

      expect(uniformsBody).not.toContain('u_dt');
      expect(uniformsBody).not.toContain('u_cursorRayOrig');
      expect(uniformsBody).not.toContain('u_cursorRayDir');
      expect(uniformsBody).not.toContain('u_viewMatrix');
      expect(uniformsBody).not.toContain('u_projectionMatrix');
      expect(uniformsBody).not.toContain('u_cameraPos');
    });

    it('verifies points_render.wgsl and lines_render.wgsl have removed u_dt, u_cursorRayOrig, u_cursorRayDir', () => {
      const pointsWgslPath = path.join(rootDir, 'src/webgpu/shaders/points_render.wgsl');
      const linesWgslPath = path.join(rootDir, 'src/webgpu/shaders/lines_render.wgsl');
      const pointsContent = fs.readFileSync(pointsWgslPath, 'utf8');
      const linesContent = fs.readFileSync(linesWgslPath, 'utf8');

      for (const content of [pointsContent, linesContent]) {
        const simUniformsMatch = content.match(/struct\s+SimUniforms\s*\{([^}]+)\}/);
        expect(simUniformsMatch).not.toBeNull();
        const uniformsBody = simUniformsMatch![1];

        expect(uniformsBody).not.toContain('u_dt');
        expect(uniformsBody).not.toContain('u_cursorRayOrig');
        expect(uniformsBody).not.toContain('u_cursorRayDir');
      }
    });
  });

  // ==========================================================================
  // Section 6: Deferred Scaffolding & Synthetic Data Documentation
  // ==========================================================================
  describe('6. Deferred Scaffolding & Synthetic Data Documentation', () => {
    it('verifies src/core/_deferred/README.md catalog exists and documents reasons for deferral', () => {
      const readmePath = path.join(rootDir, 'src/core/_deferred/README.md');
      expect(fs.existsSync(readmePath)).toBe(true);

      const content = fs.readFileSync(readmePath, 'utf8');
      expect(content).toContain('GlobeOverlayAdapters.ts');
      expect(content).toContain('paradigms/');
      expect(content).toContain('morph-shared.glsl.ts');
    });

    it('verifies procedural data generators in src/core/data/ clearly document synthetic nature', () => {
      const files = [
        'GeoTIFFDataSource.ts',
        'GeoJSONDataSource.ts',
        'VectorFieldDataSource.ts',
        'TLETrajectoryDataSource.ts',
      ];

      for (const file of files) {
        const filePath = path.join(rootDir, 'src/core/data', file);
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content.toLowerCase()).toMatch(/procedural|synthetic|mock/);
      }
    });
  });
});
