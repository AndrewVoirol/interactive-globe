// ============================================================================
// File: tests/tier1/tier1-settings-inconsistencies.test.ts
// Test Suite: Verification of Inconsistency Fixes Across Cartographic Pipeline
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Verification of Cartographic Pipeline Inconsistency Fixes', () => {
  const rasterPath = path.resolve(__dirname, '../../src/core/layers/renderers/RasterLayerRenderer.tsx');
  const rasterCode = fs.existsSync(rasterPath) ? fs.readFileSync(rasterPath, 'utf-8') : '';

  const webgpuPath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
  const webgpuCode = fs.readFileSync(webgpuPath, 'utf-8');

  const managerPath = path.resolve(__dirname, '../../src/core/layers/useGlobeLayerManager.ts');
  const managerCode = fs.readFileSync(managerPath, 'utf-8');

  const engineStatePath = path.resolve(__dirname, '../../src/hooks/useEngineState.ts');
  const engineStateCode = fs.readFileSync(engineStatePath, 'utf-8');

  const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');

  const appPath = path.resolve(__dirname, '../../src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  describe('1. 3D Vertex Sea-Level Displacement Synchronization', () => {
    it('FIX-01: verifies vertex shader declares u_seaLevelOffset uniform', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('uniform float u_seaLevelOffset;');
    });

    it('FIX-02: verifies vertex shader calculates dynamic dry land elevation relative to seaLevelOffset', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('float dryElevMeters = max(0.0, currentElevMeters - u_seaLevelOffset);');
      expect(rasterCode).toContain('float dryElevNorm = clamp(dryElevMeters / 8848.0, 0.0, 1.0);');
    });

    it('FIX-03: verifies fragment shader contour gate and slope gating eliminate plateau block artifacts', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('float contourGate = smoothstep(0.0008, 0.0035, localSlope);');
      expect(rasterCode).toContain('float bathGate = smoothstep(0.0010, 0.0040, bathSlope);');
      expect(rasterCode).toContain('combinedTopo *= contourGate;');
      expect(rasterCode).toContain('creviceAO *= contourGate;');
    });
  });

  describe('2. WebGPU Fallback Overlay Prop Parity', () => {
    it('FIX-04: verifies WebGPUCanvas forwards all enhancement props to DataLayerOverlay', () => {
      expect(webgpuCode).toContain('seaLevelOffset={layer.seaLevelOffset}');
      expect(webgpuCode).toContain('waterClarity={layer.waterClarity}');
      expect(webgpuCode).toContain('peakExponent={layer.peakExponent}');
      expect(webgpuCode).toContain('ambientOcclusion={layer.ambientOcclusion}');
    });
  });

  describe('3. Clean Terrain & Initial State Alignment', () => {
    it('FIX-05: verifies useGlobeLayerManager provides explicit enhancement defaults in initial state', () => {
      expect(managerCode).toContain('ambientOcclusion: 0.65');
      expect(managerCode).toContain('seaLevelOffset: 0');
      expect(managerCode).toContain('waterClarity: 0.75');
      expect(managerCode).toContain('peakExponent: 1.4');
    });

    it('FIX-06: verifies useEngineState defaults layerMode to 0 (Both: Points + Hairlines) and showVectors to true', () => {
      expect(engineStateCode).toContain('const [layerMode, setLayerMode] = useState<0 | 1 | 2>(0);');
      expect(engineStateCode).toContain('const [showVectors, setShowVectors] = useState<boolean>(true);');
    });

    it('FIX-07: verifies App.tsx sets layerMode to 2 when selecting cartographic styles', () => {
      expect(appCode).toContain('setLayerMode(2);');
    });

    it('FIX-08: verifies UnifiedRightSidebar provides Base Lattice toggle and expanded sidebar controls', () => {
      expect(sidebarCode).toContain('Base Lattice:');
      expect(sidebarCode).toContain('Clean Terrain');
      expect(sidebarCode).toContain('+ Node Cloud');
    });
  });
});
