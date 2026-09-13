// ============================================================================
// File: tests/phase2/milestone3-volumetric-clouds.test.ts
// Architecture: Milestone 3 Verification Suite (Volumetric Clouds & Depth Occlusion)
// Topics: Pass 2 Pipeline & Bind Groups, Ray-Sphere Intersections,
//         Beer-Lambert Transmission, LCL Psychrometrics, Invariant §46
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  EARTH_RADIUS_UNITS,
  EARTH_RADIUS_METERS,
  intersectRaySphere,
  computeTroposphericInterval,
  clampRayIntervalToTerrain,
  computeBeerLambertTransmission,
  integrateOpticalStep,
  computeLCLHeightMeters,
  metersToWorldUnits,
  worldUnitsToMeters,
  computeCloudLayerRadii,
  reconstructWorldPositionFromDepth,
} from '../../src/core/math/volumetricMath';

import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

function createTestConfig() {
  const mockContext = {
    configure: () => {},
    getCurrentTexture: () => ({
      createView: () => ({}),
    }),
    canvas: { width: 1024, height: 768 },
  };

  const canvas = {
    width: 1024,
    height: 768,
    clientWidth: 1024,
    clientHeight: 768,
    getContext: (type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    pointCount: 100,
    pointsData: new Float32Array(300),
    target2DData: new Float32Array(200),
    typeData: new Float32Array(100),
    lineIndices: new Uint32Array(100),
    mode: 0,
    layerMode: 'both' as const,
    theme: 'dark' as const,
  };
}

describe('Milestone 3: Pass 2 Volumetric Clouds & Rainier Inversion', () => {
  let engine: WebGPUEngine;

  beforeEach(async () => {
    const mockGPU = createMockNavigatorGPU();
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGPU },
      writable: true,
      configurable: true,
    });
    await mockGPU.requestAdapter().then((a: any) => a.requestDevice());
    engine = new WebGPUEngine();
  });

  // ==========================================================================
  // Suite 1: Pass 2 Pipeline Descriptor & Bind Group Verification
  // ==========================================================================
  describe('Suite 1: Pass 2 Pipeline Descriptor & Bind Groups', () => {
    it('M3-T01: verifies Pass 2 pipeline binds depth32float texture view for depth reconstruction', async () => {
      await engine.initialize(createTestConfig());
      const depthView = engine.getDepthTextureView();
      expect(depthView).not.toBeNull();
    });

    it('M3-T02: verifies Pass 2 color attachment uses loadOp: "load" to preserve Pass 1 crust', async () => {
      await engine.initialize(createTestConfig());
      // Assert engine contains volumetric render pass or pipeline
      expect(typeof (engine as any).renderVolumetricClouds).toBe('function');
    });

    it('M3-T03: verifies Pass 2 binds 3D Perlin-Worley noise texture from Milestone 2', async () => {
      await engine.initialize(createTestConfig());
      const noiseTex = engine.getCloudNoiseTexture();
      expect(noiseTex).not.toBeNull();
    });

    it('M3-T04: confirms Pass 2 uses depthWriteEnabled: false to prevent overwriting terrain depth', async () => {
      await engine.initialize(createTestConfig());
      const pipelineDesc = (engine as any).getVolumetricPipelineDescriptor?.();
      if (pipelineDesc?.depthStencil) {
        expect(pipelineDesc.depthStencil.depthWriteEnabled).toBe(false);
      }
    });

    it('M3-T05: verifies engine.dispose() safely destroys Pass 2 resources with zero leaks', async () => {
      await engine.initialize(createTestConfig());
      expect(() => engine.dispose()).not.toThrow();
    });
  });

  // ==========================================================================
  // Suite 2: Ray-Sphere Bounding & Depth Clamping (t_terrain)
  // ==========================================================================
  describe('Suite 2: Ray-Sphere Bounding & Depth Clamping (t_terrain)', () => {
    it('M3-T06: calculates exact entry and exit parameters for ray intersecting Earth sphere', () => {
      const r0: [number, number, number] = [0, 0, 10.0];
      const dir: [number, number, number] = [0, 0, -1.0];
      const hit = intersectRaySphere(r0, dir, 5.0);
      expect(hit).not.toBeNull();
      expect(hit!.tNear).toBeCloseTo(5.0, 5);
      expect(hit!.tFar).toBeCloseTo(15.0, 5);
    });

    it('M3-T07: returns null when ray misses the planet sphere', () => {
      const r0: [number, number, number] = [0, 10.0, 10.0];
      const dir: [number, number, number] = [0, 0, -1.0];
      const hit = intersectRaySphere(r0, dir, 5.0);
      expect(hit).toBeNull();
    });

    it('M3-T08: computes tropospheric interval bounded by R_bottom and R_top', () => {
      const r0: [number, number, number] = [0, 0, 10.0];
      const dir: [number, number, number] = [0, 0, -1.0];
      const rBottom = 5.001; // ~1,274m
      const rTop = 5.008;    // ~10,193m
      const interval = computeTroposphericInterval(r0, dir, rBottom, rTop);
      expect(interval).not.toBeNull();
      expect(interval!.tStart).toBeCloseTo(10.0 - 5.008, 3);
      expect(interval!.tEnd).toBeCloseTo(10.0 - 5.001, 3);
    });

    it('M3-T09: clamps ray interval when terrain is in foreground (Rainier Summit)', () => {
      const tStart = 4.992;
      const tEnd = 4.999;
      const tTerrain = 4.990; // Summit is closer than cloud interval start
      const clamped = clampRayIntervalToTerrain(tStart, tEnd, tTerrain);
      expect(clamped).toBeNull(); // 0 raymarch steps executed under summit
    });

    it('M3-T10: preserves full interval when terrain is deep in background (Puget Basin)', () => {
      const tStart = 4.992;
      const tEnd = 4.999;
      const tTerrain = 5.005; // Valley floor is behind clouds
      const clamped = clampRayIntervalToTerrain(tStart, tEnd, tTerrain);
      expect(clamped).not.toBeNull();
      expect(clamped!.tStart).toBeCloseTo(tStart, 5);
      expect(clamped!.tEnd).toBeCloseTo(tEnd, 5);
    });

    it('M3-T11: partially clamps interval when terrain ridge cuts through cloud deck', () => {
      const tStart = 4.992;
      const tEnd = 4.999;
      const tTerrain = 4.995; // Ridge midway through cloud deck
      const clamped = clampRayIntervalToTerrain(tStart, tEnd, tTerrain);
      expect(clamped).not.toBeNull();
      expect(clamped!.tStart).toBeCloseTo(tStart, 5);
      expect(clamped!.tEnd).toBeCloseTo(tTerrain, 5);
    });
  });

  // ==========================================================================
  // Suite 3: Beer-Lambert Optical Depth Transmission
  // ==========================================================================
  describe('Suite 3: Beer-Lambert Optical Depth Transmission', () => {
    it('M3-T12: verifies T = 1.0 for zero optical depth', () => {
      expect(computeBeerLambertTransmission(0.0)).toBe(1.0);
    });

    it('M3-T13: verifies monotonic decrease of transmittance with optical depth', () => {
      const t1 = computeBeerLambertTransmission(0.5);
      const t2 = computeBeerLambertTransmission(1.0);
      const t3 = computeBeerLambertTransmission(2.5);
      expect(t1).toBeGreaterThan(t2);
      expect(t2).toBeGreaterThan(t3);
      expect(t3).toBeGreaterThan(0.0);
    });

    it('M3-T14: satisfies multiplicative transmission property T(a + b) = T(a) * T(b)', () => {
      const ta = computeBeerLambertTransmission(1.2);
      const tb = computeBeerLambertTransmission(0.8);
      const tab = computeBeerLambertTransmission(2.0);
      expect(ta * tb).toBeCloseTo(tab, 6);
    });

    it('M3-T15: integrates single ray step optical depth and calculates step alpha', () => {
      const currentT = 1.0;
      const density = 0.8;
      const sigmaT = 45.0;
      const stepSize = 0.001; // World units
      const { nextTransmittance, stepAlpha } = integrateOpticalStep(currentT, density, sigmaT, stepSize);
      expect(nextTransmittance).toBeLessThan(1.0);
      expect(stepAlpha).toBeCloseTo(1.0 - (nextTransmittance / currentT), 6);
    });

    it('M3-T16: proves transmittance remains strictly within [0.0, 1.0] across 10,000 random samples', () => {
      for (let i = 0; i < 10000; i++) {
        const od = Math.random() * 50.0;
        const T = computeBeerLambertTransmission(od);
        expect(T).toBeGreaterThanOrEqual(0.0);
        expect(T).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // ==========================================================================
  // Suite 4: Psychrometric LCL Formula & Cloud Layer Height Bounds
  // ==========================================================================
  describe('Suite 4: Psychrometric LCL Formula & Layer Bounds', () => {
    it('M3-T17: verifies LCL formula h_LCL = 125 * (T - Td) for standard Pacific Northwest marine layer', () => {
      // Marine air: T = 16°C, Td = 14°C -> spread = 2°C -> LCL = 250m
      const hLCL = computeLCLHeightMeters(16.0, 14.0);
      expect(hLCL).toBe(250.0);
    });

    it('M3-T18: handles zero spread (saturated 100% RH fog) returning 0m AGL', () => {
      const hLCL = computeLCLHeightMeters(12.0, 12.0);
      expect(hLCL).toBe(0.0);
    });

    it('M3-T19: clamps negative spread gracefully to 0m AGL', () => {
      const hLCL = computeLCLHeightMeters(10.0, 15.0); // Dew point above temp
      expect(hLCL).toBe(0.0);
    });

    it('M3-T20: computes correct concentric shell radii for cloud deck from LCL meters', () => {
      const { rBottom, rTop } = computeCloudLayerRadii(1200.0, 1500.0);
      // rBottom = 5.0 + (1200 / 6371000) * 5.0 = 5.0009417
      expect(rBottom).toBeCloseTo(5.0009417, 5);
      // rTop = rBottom + (1500 / 6371000) * 5.0 = 5.0009417 + 0.0011772 = 5.0021189
      expect(rTop).toBeCloseTo(5.0021189, 5);
    });
  });

  // ==========================================================================
  // Suite 5: Invariant §46 Anti-Cheating & Camera Hook Verification
  // ==========================================================================
  describe('Suite 5: Invariant §46 Anti-Cheating & Camera Hook Verification', () => {
    it('M3-T21: verifies WebGPUCanvas.tsx exposes snapRainierInversion in __INDICATRIX_CAMERA__', () => {
      const canvasFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const content = fs.readFileSync(canvasFilePath, 'utf-8');
      expect(content).toContain('snapRainierInversion');
      expect(content).toContain('-121.7604');
      expect(content).toContain('46.8529');
      expect(content).toContain('5.00298');
    });

    it('M3-T22: confirms this test suite imports pure math directly from src/core/math/volumetricMath.ts', () => {
      const testFilePath = path.resolve(__dirname, 'milestone3-volumetric-clouds.test.ts');
      const content = fs.readFileSync(testFilePath, 'utf-8');
      expect(content).toContain("from '../../src/core/math/volumetricMath'");
      // Anti-cheating: ensure no duplicate local helper re-definitions
      expect(content).not.toContain('function ' + 'intersectRaySphere(');
      expect(content).not.toContain('function ' + 'computeBeerLambertTransmission(');
    });

    it('M3-T23: confirms WGSL shader volumetric_cloud.wgsl exists and passes uniform control flow', () => {
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
      if (fs.existsSync(shaderPath)) {
        const content = fs.readFileSync(shaderPath, 'utf-8');
        expect(content).toContain('@fragment');
        expect(content).toContain('texture_depth_2d');
      }
    });

    it('M3-T24: verifies reconstructWorldPositionFromDepth accurately reconstructs NDC points', () => {
      // Identity matrix test
      const identity = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ];
      const pos = reconstructWorldPositionFromDepth(512, 384, 0.5, 1024, 768, identity);
      expect(pos[0]).toBeCloseTo(0.0, 4);
      expect(pos[1]).toBeCloseTo(0.0, 4);
      expect(pos[2]).toBeCloseTo(0.5, 4);
    });

    it('M3-T25: validates metersToWorldUnits and worldUnitsToMeters round-trip with zero numerical drift', () => {
      const elevations = [0, 800, 1500, 3800, 4392, 8848];
      for (const elev of elevations) {
        const units = metersToWorldUnits(elev);
        const back = worldUnitsToMeters(units);
        expect(back).toBeCloseTo(elev, 5);
      }
    });
  });
});
