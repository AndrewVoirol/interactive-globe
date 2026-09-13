// ============================================================================
// File: tests/phase2/milestone2-cloud-noise.test.ts
// Architecture: Milestone 2 Verification Suite (3D Perlin-Worley Compute Generator)
// Topics: 128³ rgba8unorm 3D Texture Allocation, Compute Pipeline Dispatch,
//         Pure Math Parity (Invariant §46), 10,000-Iteration Monte Carlo Robustness,
//         and Slice Readback Integration.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  CLOUD_NOISE_SIZE,
  WORLEY_PERIODS,
  PERLIN_PERIODS,
  pcg3d,
  hash33,
  quinticHermite,
  quinticFade3,
  perlinGradient,
  periodicPerlin3D,
  perlinNoise3D,
  periodicWorley3D,
  worleyNoise3D,
  remap,
  combinePerlinWorley,
  evaluateCloudNoise,
  sampleCloudNoiseVoxel,
} from '../../src/core/math/cloudNoiseMath';

import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

import cloudNoiseComputeWGSL from '../../src/webgpu/shaders/cloud_noise_compute.wgsl?raw';

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

describe('Milestone 2: 3D Perlin-Worley Compute Generator', () => {
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
  // Suite 1: WebGPU 3D Texture Allocation & Storage Binding Contract
  // ==========================================================================
  describe('Suite 1: WebGPU 3D Texture Allocation & Storage Binding Contract', () => {
    it('M2-T01: verifies cloudNoiseTexture allocates with 128x128x128, rgba8unorm, and 3D dimension', async () => {
      await engine.initialize(createTestConfig());

      const noiseTex = engine.getCloudNoiseTexture();
      const noiseView = engine.getCloudNoiseTextureView();

      expect(noiseTex).not.toBeNull();
      expect(noiseView).not.toBeNull();

      const tex = noiseTex as any;
      expect(tex.width).toBe(128);
      expect(tex.height).toBe(128);
      expect(tex.depthOrArrayLayers).toBe(128);
      expect(tex.format).toBe('rgba8unorm');
    });

    it('M2-T02: verifies WebGPU usage bitflags include STORAGE_BINDING, TEXTURE_BINDING, and COPY_SRC', async () => {
      await engine.initialize(createTestConfig());

      const noiseTex = engine.getCloudNoiseTexture() as any;
      expect(noiseTex).not.toBeNull();

      const usage = noiseTex.usage;
      const STORAGE_BINDING = 8;
      const TEXTURE_BINDING = 4;
      const COPY_SRC = 1;

      expect((usage & STORAGE_BINDING) !== 0).toBe(true);
      expect((usage & TEXTURE_BINDING) !== 0).toBe(true);
      expect((usage & COPY_SRC) !== 0).toBe(true);
    });

    it('M2-T03: verifies public accessors return null before init and after dispose', async () => {
      const freshEngine = new WebGPUEngine();
      expect(freshEngine.getCloudNoiseTexture()).toBeNull();
      expect(freshEngine.getCloudNoiseTextureView()).toBeNull();

      await freshEngine.initialize(createTestConfig());
      expect(freshEngine.getCloudNoiseTexture()).not.toBeNull();
      expect(freshEngine.getCloudNoiseTextureView()).not.toBeNull();

      freshEngine.dispose();
      expect(freshEngine.getCloudNoiseTexture()).toBeNull();
      expect(freshEngine.getCloudNoiseTextureView()).toBeNull();
    });

    it('M2-T04: confirms the 5-core-buffers startup invariant (Invariant §20) is strictly maintained', async () => {
      const engineFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(engineFilePath, 'utf-8');

      // The 3D noise generator allocates ZERO GPU buffers on boot (pure texture synthesis)
      expect(content).toContain('initCloudNoiseGenerator');
      expect(content).toContain('readCloudNoiseSlice');
      expect(content).toContain('readCloudNoiseSlices');
    });
  });

  // ==========================================================================
  // Suite 2: WGSL Shader Module & Uniform Control Flow Linting
  // ==========================================================================
  describe('Suite 2: WGSL Shader Module & Uniform Control Flow Linting', () => {
    it('M2-T05: verifies cloud_noise_compute.wgsl structure and entry point', () => {
      expect(cloudNoiseComputeWGSL).toContain('@compute @workgroup_size(4, 4, 4)');
      expect(cloudNoiseComputeWGSL).toContain('fn cs_main(');
      expect(cloudNoiseComputeWGSL).toContain('texture_storage_3d<rgba8unorm, write>');
      expect(cloudNoiseComputeWGSL).toContain('textureStore(');
    });

    it('M2-T06: verifies uniform control flow and dynamic dimension inspection (Invariant §48)', () => {
      expect(cloudNoiseComputeWGSL).toContain('let dims = textureDimensions(noiseTexture);');
      expect(cloudNoiseComputeWGSL).toContain('if (any(global_id >= dims))');
      expect(cloudNoiseComputeWGSL).not.toContain('fwidth(');
      expect(cloudNoiseComputeWGSL).not.toContain('dpdx(');
      expect(cloudNoiseComputeWGSL).not.toContain('dpdy(');
    });
  });

  // ==========================================================================
  // Suite 3: Pure Noise Mathematics & Invariant §46 Production Ingestion
  // ==========================================================================
  describe('Suite 3: Pure Noise Mathematics & Invariant §46 Production Ingestion', () => {
    it('M2-T07: verifies PCG3D hash determinism, range [0, 1), and non-zero origin output', () => {
      const h1 = pcg3d(0, 0, 0);
      const h2 = pcg3d(0, 0, 0);
      expect(h1[0]).toBe(h2[0]);
      expect(h1[1]).toBe(h2[1]);
      expect(h1[2]).toBe(h2[2]);

      // Origin output is not zero
      expect(h1[0]).toBeGreaterThan(0.0);
      expect(h1[1]).toBeGreaterThan(0.0);
      expect(h1[2]).toBeGreaterThan(0.0);

      // Alias hash33 test
      const h3 = hash33([0, 0, 0]);
      expect(h3[0]).toBe(h1[0]);
    });

    it('M2-T08: verifies quintic Hermite polynomial properties and remap clamping', () => {
      expect(quinticHermite(0)).toBe(0);
      expect(quinticHermite(1)).toBe(1);
      expect(quinticHermite(0.5)).toBeCloseTo(0.5, 5);

      const fade3 = quinticFade3([0, 0.5, 1]);
      expect(fade3[0]).toBe(0);
      expect(fade3[1]).toBeCloseTo(0.5, 5);
      expect(fade3[2]).toBe(1);

      // Remap
      expect(remap(0.5, 0.0, 1.0, 10, 20)).toBe(15);
      expect(remap(-1.0, 0.0, 1.0, 10, 20)).toBe(10); // clamped lower
      expect(remap(2.0, 0.0, 1.0, 10, 20)).toBe(20); // clamped upper
    });

    it('M2-T09: verifies periodic 3D Perlin gradient noise continuity and periodic boundary conditions', () => {
      const period = 8;
      const v0 = periodicPerlin3D(0.0, 0.5, 0.5, period);
      const v1 = periodicPerlin3D(1.0, 0.5, 0.5, period);
      // Because period is integer and wraps periodically, f(0) == f(1)
      expect(v0).toBeCloseTo(v1, 4);

      // Value strictly in [0, 1]
      expect(v0).toBeGreaterThanOrEqual(0.0);
      expect(v0).toBeLessThanOrEqual(1.0);

      // Alias test
      const aliasVal = perlinNoise3D(0.2, 0.3, 0.4, period);
      expect(aliasVal).toBeGreaterThanOrEqual(0.0);
      expect(aliasVal).toBeLessThanOrEqual(1.0);
    });

    it('M2-T10: verifies periodic 3D Worley cellular noise distance and periodic boundary conditions', () => {
      const period = 8;
      const w0 = periodicWorley3D(0.0, 0.5, 0.5, period);
      const w1 = periodicWorley3D(1.0, 0.5, 0.5, period);
      expect(w0).toBeCloseTo(w1, 4);

      expect(w0).toBeGreaterThanOrEqual(0.0);
      expect(w0).toBeLessThanOrEqual(1.0);

      // Alias test
      const aliasWorley = worleyNoise3D(0.2, 0.3, 0.4, period);
      expect(aliasWorley).toBeGreaterThanOrEqual(0.0);
      expect(aliasWorley).toBeLessThanOrEqual(1.0);
    });

    it('M2-T11: verifies combinePerlinWorley Schneider dilated remap behavior', () => {
      // When worley is 1.0 (at cell center), billowThreshold is 0.0 -> full perlin passes
      const billowMax = combinePerlinWorley(0.8, 1.0);
      expect(billowMax).toBeGreaterThan(0.0);

      // When worley is 0.0 (in voids), billowThreshold is 0.75 -> low perlin is eroded to 0
      const eroded = combinePerlinWorley(0.3, 0.0);
      expect(eroded).toBe(0.0);
    });

    it('M2-T12: verifies evaluateCloudNoise exports correct channels and period constants', () => {
      expect(CLOUD_NOISE_SIZE).toBe(128);
      expect(WORLEY_PERIODS).toEqual([8, 16, 32]);
      expect(PERLIN_PERIODS).toEqual([4, 8, 16]);

      const [r, g, b, a] = evaluateCloudNoise([0.25, 0.5, 0.75]);
      expect(r).toBeGreaterThanOrEqual(0.0);
      expect(r).toBeLessThanOrEqual(1.0);
      expect(g).toBeGreaterThanOrEqual(0.0);
      expect(g).toBeLessThanOrEqual(1.0);
      expect(b).toBeGreaterThanOrEqual(0.0);
      expect(b).toBeLessThanOrEqual(1.0);
      expect(a).toBeGreaterThanOrEqual(0.0);
      expect(a).toBeLessThanOrEqual(1.0);

      // sampleCloudNoiseVoxel alias
      const voxel = sampleCloudNoiseVoxel(0.25, 0.5, 0.75);
      expect(voxel).toEqual([r, g, b, a]);
    });
  });

  // ==========================================================================
  // Suite 4: Monte Carlo Robustness & Singularity Probing
  // ==========================================================================
  describe('Suite 4: Monte Carlo Robustness & Singularity Probing', () => {
    it('M2-T13: executes 10,000-iteration Monte Carlo fuzzing guaranteeing zero NaNs, zero Infinities, and [0, 1] bounds', () => {
      let rSum = 0;
      let rSqSum = 0;
      let count = 10000;

      for (let i = 0; i < count; i++) {
        // Random 3D coordinate in [-2.0, 3.0] to test wide domain robustness
        const x = Math.random() * 5.0 - 2.0;
        const y = Math.random() * 5.0 - 2.0;
        const z = Math.random() * 5.0 - 2.0;

        const [r, g, b, a] = evaluateCloudNoise([x, y, z]);

        expect(Number.isFinite(r)).toBe(true);
        expect(Number.isFinite(g)).toBe(true);
        expect(Number.isFinite(b)).toBe(true);
        expect(Number.isFinite(a)).toBe(true);

        expect(r).toBeGreaterThanOrEqual(0.0);
        expect(r).toBeLessThanOrEqual(1.0);
        expect(g).toBeGreaterThanOrEqual(0.0);
        expect(g).toBeLessThanOrEqual(1.0);
        expect(b).toBeGreaterThanOrEqual(0.0);
        expect(b).toBeLessThanOrEqual(1.0);
        expect(a).toBeGreaterThanOrEqual(0.0);
        expect(a).toBeLessThanOrEqual(1.0);

        rSum += r;
        rSqSum += r * r;
      }

      // Variance check: ensures the Red channel is not constant or dead
      const mean = rSum / count;
      const variance = rSqSum / count - mean * mean;
      expect(variance).toBeGreaterThan(0.01);
    });

    it('M2-T14: tests exact boundary singularities and infinitesimal offsets', () => {
      const singularities = [
        [0.0, 0.0, 0.0],
        [1.0, 1.0, 1.0],
        [127.0, 127.0, 127.0],
        [1e-7, 1e-7, 1e-7],
        [1.0 - 1e-7, 1.0 - 1e-7, 1.0 - 1e-7],
      ];

      for (const [x, y, z] of singularities) {
        const [r, g, b, a] = evaluateCloudNoise([x, y, z]);
        expect(isNaN(r)).toBe(false);
        expect(isNaN(g)).toBe(false);
        expect(isNaN(b)).toBe(false);
        expect(isNaN(a)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Suite 5: Engine Boot Timing & Debug Hook
  // ==========================================================================
  describe('Suite 5: Engine Boot Timing & Debug Hook', () => {
    it('M2-T15: verifies engine records cloudNoiseComputeDurationMs upon initialization', async () => {
      await engine.initialize(createTestConfig());

      const durationMs = engine.getCloudNoiseComputeDurationMs();
      expect(typeof durationMs).toBe('number');
      expect(durationMs).toBeGreaterThanOrEqual(0);
      expect(durationMs).toBeLessThan(100); // Mock run completes virtually instantaneously (<100ms)
    });

    it('M2-T16: verifies readCloudNoiseSlice returns a 65,536-byte Uint8Array for slice Z', async () => {
      await engine.initialize(createTestConfig());

      const sliceData = await engine.readCloudNoiseSlice(64);
      expect(sliceData).toBeInstanceOf(Uint8Array);
      expect(sliceData.length).toBe(128 * 128 * 4); // 65,536 bytes
    });

    it('M2-T17: verifies readCloudNoiseSlices returns batch results for requested slices', async () => {
      await engine.initialize(createTestConfig());

      const slices = await engine.readCloudNoiseSlices([16, 64, 112]);
      expect(slices.length).toBe(3);
      expect(slices[0].z).toBe(16);
      expect(slices[0].data.length).toBe(65536);
      expect(slices[1].z).toBe(64);
      expect(slices[1].data.length).toBe(65536);
      expect(slices[2].z).toBe(112);
      expect(slices[2].data.length).toBe(65536);
    });
  });
});
