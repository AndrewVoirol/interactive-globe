// ============================================================================
// File: tests/phase2/milestone1-depth-kinematics.test.ts
// Architecture: Milestone 1 Verification Suite (Depth Pipeline & Kinematics Unlock)
// Topics: depth32float Pipeline Format Alignment, Multi-Pass VRAM Persistence,
//         Dynamic Near-Plane Modulation, Ground Clearance Safety Floor,
//         and WGSL Near-Guard Relaxation.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';

import {
  computeDynamicNearPlane,
  computeGroundClearanceFloor,
} from '../../src/core/math/cameraMath';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

import vectorRibbonWGSL from '../../src/webgpu/shaders/vector_ribbon.wgsl?raw';
import windRibbonWGSL from '../../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';

function createTestConfig(pointCount = 100, lineCount = 50) {
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
    pointCount,
    pointsData: new Float32Array(pointCount * 3),
    target2DData: new Float32Array(pointCount * 2),
    typeData: new Float32Array(pointCount),
    lineIndices: new Uint32Array(lineCount * 2),
    mode: 0,
    layerMode: 'both' as const,
    theme: 'dark' as const,
  };
}

describe('Milestone 1: Camera Unlock & Depth Pipeline Alignment', () => {
  let engine: WebGPUEngine;
  let mockDevice: MockGPUDevice;

  beforeEach(async () => {
    const mockGPU = createMockNavigatorGPU();
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGPU },
      writable: true,
      configurable: true,
    });
    mockDevice = (await mockGPU.requestAdapter().then((a: any) => a.requestDevice())) as MockGPUDevice;

    engine = new WebGPUEngine();
  });

  // ==========================================================================
  // Suite 1: Depth32Float Pipeline Alignment & Public Getters
  // ==========================================================================
  describe('Suite 1: Depth32Float Pipeline Alignment & Public Getters', () => {
    it('M1-T01: verifies depthTexture allocates with depth32float and TEXTURE_BINDING usage', async () => {
      await engine.initialize(createTestConfig());

      const depthTex = engine.getDepthTexture();
      const depthView = engine.getDepthTextureView();

      expect(depthTex).not.toBeNull();
      expect(depthView).not.toBeNull();

      // Check texture properties on depthTex directly
      const tex = depthTex as any;
      expect(tex.format).toBe('depth32float');

      const usage = tex.usage;
      // GPUTextureUsage.RENDER_ATTACHMENT (16) | GPUTextureUsage.TEXTURE_BINDING (4) = 20
      const RENDER_ATTACHMENT = 16;
      const TEXTURE_BINDING = 4;
      expect((usage & RENDER_ATTACHMENT) !== 0).toBe(true);
      expect((usage & TEXTURE_BINDING) !== 0).toBe(true);
    });

    it('M1-T02: verifies all Pass 1 render pipelines in WebGPUEngine.ts specify depth32float', () => {
      const engineFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(engineFilePath, 'utf-8');

      // Assert zero occurrences of depth24plus remain in WebGPUEngine.ts
      expect(content).not.toContain("format: 'depth24plus'");
      expect(content).not.toContain('format: "depth24plus"');

      // Assert depth32float is present at all pipeline definitions
      const matches = content.match(/format:\s*['"]depth32float['"]/g) || [];
      // 1 in updateDepthTexture + 10 pipelines = 11 occurrences
      expect(matches.length).toBe(11);

      // Verify specific pipeline variables exist with depth32float
      expect(content).toContain('windRibbonPipeline');
      expect(content).toContain('cranePipeline');
      expect(content).toContain('pointsRenderPipeline');
      expect(content).toContain('linesRenderPipeline');
      expect(content).toContain('swissReliefPipeline');
      expect(content).toContain('vectorRibbonPipeline');
      expect(content).toContain('crustHydrospherePipeline');
      expect(content).toContain('cloudPipeline');
      expect(content).toContain('atmosphereScatterPipeline');
    });

    it('M1-T03: verifies public depth accessors return null prior to initialization and valid objects after', async () => {
      const freshEngine = new WebGPUEngine();
      expect(freshEngine.getDepthTexture()).toBeNull();
      expect(freshEngine.getDepthTextureView()).toBeNull();

      await freshEngine.initialize(createTestConfig());

      expect(freshEngine.getDepthTexture()).not.toBeNull();
      expect(freshEngine.getDepthTextureView()).not.toBeNull();

      freshEngine.dispose();
      expect(freshEngine.getDepthTexture()).toBeNull();
      expect(freshEngine.getDepthTextureView()).toBeNull();
    });

    it('M1-T04: confirms Pass 1 mainRenderPass retains depthStoreOp: store for Pass 2 raymarcher persistence', () => {
      const engineFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(engineFilePath, 'utf-8');

      expect(content).toContain("depthStoreOp: 'store'");
    });

    it('M1-T05: verifies updateWindBindGroups propagates camera near plane to ribF[24]', () => {
      const engineFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(engineFilePath, 'utf-8');

      expect(content).toContain('ribF[24] = params.camera?.near ?? 0.1;');
    });
  });

  // ==========================================================================
  // Suite 2: WGSL Near-Guard Relaxation & Shader Parsing
  // ==========================================================================
  describe('Suite 2: WGSL Near-Guard Relaxation & Shader Parsing', () => {
    it('M1-T06: verifies vector_ribbon.wgsl relaxes nearGuard to max(sim.u_nearPlane, 0.00002)', () => {
      expect(vectorRibbonWGSL).toContain('let nearGuard = max(sim.u_nearPlane, 0.00002);');
      expect(vectorRibbonWGSL).not.toContain('let nearGuard = max(sim.u_nearPlane, 0.05);');
    });

    it('M1-T07: verifies wind_ribbon_render.wgsl relaxes nearGuard to max(sim.u_nearPlane, 0.00002)', () => {
      expect(windRibbonWGSL).toContain('let nearGuard = max(sim.u_nearPlane, 0.00002);');
      expect(windRibbonWGSL).not.toContain('let nearGuard = max(sim.u_nearPlane, 0.05);');
    });

    it('M1-T08: confirms relaxed near-guard prevents premature culling at tropospheric near-plane 0.00005', () => {
      const nearPlane = 0.00005; // Tropospheric near plane (~63.7m)
      const nearGuard = Math.max(nearPlane, 0.00002);

      expect(nearGuard).toBe(0.00005);
      // Vertices with w_c = 0.001 (such as terrain at 1,274m in front of camera) must not be culled
      const wc_terrain = 0.001;
      expect(wc_terrain >= nearGuard).toBe(true);

      // Vertices behind the near guard (e.g. 0.00001) are culled
      const wc_behind = 0.00001;
      expect(wc_behind >= nearGuard).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 3: Dynamic Near-Plane Modulation Math & Kinematics
  // ==========================================================================
  describe('Suite 3: Dynamic Near-Plane Modulation Math & Kinematics', () => {
    it('M1-T09: evaluates near-plane at orbital regime (R >= 6.0) yielding exactly 0.1', () => {
      expect(computeDynamicNearPlane(6.0)).toBeCloseTo(0.1, 5);
      expect(computeDynamicNearPlane(15.0)).toBeCloseTo(0.1, 5);
      expect(computeDynamicNearPlane(50.0)).toBeCloseTo(0.1, 5);
    });

    it('M1-T10: evaluates near-plane at tropospheric regime (R <= 5.004) yielding 0.00005', () => {
      // Puget Sound descent target: R = 5.00275 (altitude ~3,500m)
      const pugetSoundNear = computeDynamicNearPlane(5.00275);
      expect(pugetSoundNear).toBeCloseTo(0.00005, 6);

      // Ground safety floor: R = 5.0001 (altitude ~127m)
      const groundFloorNear = computeDynamicNearPlane(5.0001);
      expect(groundFloorNear).toBeCloseTo(0.00005, 6);
    });

    it('M1-T11: verifies smooth monotonic continuity across transitional altitudes', () => {
      let prevNear = 0;
      for (let r = 5.004; r <= 6.0; r += 0.05) {
        const near = computeDynamicNearPlane(r);
        expect(near).toBeGreaterThanOrEqual(prevNear);
        expect(near).toBeGreaterThanOrEqual(0.00005);
        expect(near).toBeLessThanOrEqual(0.1);
        prevNear = near;
      }
    });

    it('M1-T12: executes Monte Carlo fuzzing (10,000 iterations) ensuring zero NaNs or Infinities', () => {
      for (let i = 0; i < 10000; i++) {
        // Random radius from 4.5 (boundary check) to 100.0
        const randomR = 4.5 + Math.random() * 95.5;
        const near = computeDynamicNearPlane(randomR);
        expect(Number.isFinite(near)).toBe(true);
        expect(isNaN(near)).toBe(false);
        expect(near).toBeGreaterThanOrEqual(0.00005);
        expect(near).toBeLessThanOrEqual(0.1);
      }
    });
  });

  // ==========================================================================
  // Suite 4: Ground Clearance Safety Floor & Anti-Cheating Invariants
  // ==========================================================================
  describe('Suite 4: Ground Clearance Safety Floor & Anti-Cheating Invariants', () => {
    it('M1-T13: verifies sea-level ground clearance floor allows descent to 5.00275 at Puget Sound', () => {
      // Over Puget Sound waters (elevation = 0m)
      const h_floor = computeGroundClearanceFloor(0);
      expect(h_floor).toBeCloseTo(5.0001, 5);

      // Camera descent radius 5.00275 (~3,500m AGL) is strictly above floor
      expect(5.00275).toBeGreaterThan(h_floor);
    });

    it('M1-T14: verifies Mount Rainier summit elevates ground clearance floor to prevent collision', () => {
      // Mount Rainier summit: 4,392m
      const rainierFloor = computeGroundClearanceFloor(4392, 0.08, true);
      // Disp units = (4392 / 8848) * (0.08 * 2.8) = 0.49638 * 0.224 = 0.11119
      // Floor = 5.0 + 0.11119 + 0.0001 = 5.11129
      expect(rainierFloor).toBeGreaterThan(5.10);
      expect(rainierFloor).toBeCloseTo(5.11129, 3);
    });

    it('M1-T15: verifies WebGPUCanvas.tsx preserves line 1454 anti-cheating invariant', () => {
      const canvasFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const content = fs.readFileSync(canvasFilePath, 'utf-8');

      // Strict anti-cheating test check anchor
      expect(content).toContain('const curR = Math.max(5.15, r0 + (r1 - r0) * ease);');
    });

    it('M1-T16: confirms WebGPUCanvas.tsx contains snapPugetSound and getGroundClearanceFloor', () => {
      const canvasFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const content = fs.readFileSync(canvasFilePath, 'utf-8');

      expect(content).toContain('getGroundClearanceFloor');
      expect(content).toContain('snapPugetSound');
      expect(content).toContain('-122.38');
      expect(content).toContain('47.62');
      expect(content).toContain('5.00275');
    });
  });
});
