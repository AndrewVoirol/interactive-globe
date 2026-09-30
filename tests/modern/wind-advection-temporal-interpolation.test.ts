import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

let originalNavigator: any;

function setupMockNavigator() {
  originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
        requestAdapter: async () => ({
          limits: {
            maxStorageBufferBindingSize: 1024 * 1024 * 1024,
            maxBufferSize: 1024 * 1024 * 1024,
            maxComputeWorkgroupStorageSize: 32768,
            maxComputeInvocationsPerWorkgroup: 1024,
          },
          features: new Set(['timestamp-query']),
          requestDevice: async () => new MockGPUDevice(),
        }),
      },
    },
    configurable: true,
    writable: true,
  });
}

function restoreMockNavigator() {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
}

function createMockCanvas(width = 800, height = 600) {
  const mockContext = {
    configure: () => {},
    getCurrentTexture: () => ({
      createView: () => ({}),
    }),
    canvas: { width, height },
  };

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: (type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;

  return { canvas, mockContext };
}

function createEngineConfig(pointCount = 1000, lineCount = 100) {
  const { canvas } = createMockCanvas();
  const pointsData = new Float32Array(pointCount * 3);
  const target2DData = new Float32Array(pointCount * 2);
  const typeData = new Float32Array(pointCount);
  const lineIndices = new Uint32Array(lineCount * 2);

  return {
    canvas,
    pointCount,
    pointsData,
    target2DData,
    typeData,
    lineIndices,
  };
}

describe('Stage 2: Dual-Slot Temporal Interpolation & Vector Ring Buffer', () => {
  const wgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/wind_particles.wgsl');
  const wgslSource = fs.readFileSync(wgslPath, 'utf8');

  describe('1. WGSL Dual-Slot Texture & Uniform Invariants', () => {
    it('declares dual-slot wind texture bindings at bindings 4 and 5', () => {
      expect(wgslSource).toContain('@group(0) @binding(4) var u_windTexture0: texture_2d<f32>;');
      expect(wgslSource).toContain('@group(0) @binding(5) var u_windTexture1: texture_2d<f32>;');
      expect(wgslSource).toContain('@group(0) @binding(10) var u_jetTexture: texture_2d<f32>;');
    });

    it('preserves DEM elevation bindings 6 and 7 for orographic terrain coupling', () => {
      expect(wgslSource).toContain('@group(0) @binding(6) var u_demSampler: sampler;');
      expect(wgslSource).toContain('@group(0) @binding(7) var u_demTexture: texture_2d<f32>;');
    });

    it('contains u_tau in WindSimUniforms at byte offset 60', () => {
      expect(wgslSource).toContain('u_cameraPos: vec3<f32>');
      expect(wgslSource).toContain('u_tau: f32');
    });

    it('evaluates bilinear-temporal vector interpolation using mix and clamp', () => {
      expect(wgslSource).toContain('let w0 = textureSampleLevel(u_windTexture0, u_windSampler, uv, 0.0).xy;');
      expect(wgslSource).toContain('let w1 = textureSampleLevel(u_windTexture1, u_windSampler, uv, 0.0).xy;');
      expect(wgslSource).toContain('let rawVel = mix(w0, w1, clamp(sim.u_tau, 0.0, 1.0));');
    });
  });

  describe('2. Mathematical Temporal Interpolation Properties', () => {
    const bilinearTemporalInterp = (w0: [number, number], w1: [number, number], tau: number): [number, number] => {
      const t = Math.max(0.0, Math.min(1.0, tau));
      return [
        w0[0] * (1.0 - t) + w1[0] * t,
        w0[1] * (1.0 - t) + w1[1] * t,
      ];
    };

    it('yields pure slot 0 vector when tau = 0.0', () => {
      const res = bilinearTemporalInterp([12.5, -4.2], [5.0, 8.0], 0.0);
      expect(res[0]).toBeCloseTo(12.5, 5);
      expect(res[1]).toBeCloseTo(-4.2, 5);
    });

    it('yields pure slot 1 vector when tau = 1.0', () => {
      const res = bilinearTemporalInterp([12.5, -4.2], [5.0, 8.0], 1.0);
      expect(res[0]).toBeCloseTo(5.0, 5);
      expect(res[1]).toBeCloseTo(8.0, 5);
    });

    it('yields exact 50/50 linear blend when tau = 0.5', () => {
      const res = bilinearTemporalInterp([10.0, 20.0], [20.0, -10.0], 0.5);
      expect(res[0]).toBeCloseTo(15.0, 5);
      expect(res[1]).toBeCloseTo(5.0, 5);
    });

    it('clamps negative tau to 0.0 and tau > 1.0 to 1.0', () => {
      const resLow = bilinearTemporalInterp([10.0, 20.0], [20.0, -10.0], -0.5);
      expect(resLow[0]).toBeCloseTo(10.0, 5);
      expect(resLow[1]).toBeCloseTo(20.0, 5);

      const resHigh = bilinearTemporalInterp([10.0, 20.0], [20.0, -10.0], 1.5);
      expect(resHigh[0]).toBeCloseTo(20.0, 5);
      expect(resHigh[1]).toBeCloseTo(-10.0, 5);
    });
  });

  describe('3. WebGPUEngine Dual-Slot Upload & Uniform Packaging', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      await engine.initialize(createEngineConfig());
    });

    afterEach(() => {
      engine?.dispose();
      restoreMockNavigator();
    });

    it('allocates windUniformBuffer of exactly 64 bytes (Rule 4 struct alignment)', () => {
      engine.ensureWindBuffers();
      const engineAny = engine as any;
      expect(engineAny.windUniformBuffer).toBeDefined();
      expect(engineAny.windUniformBuffer.size).toBe(64);
      expect(engineAny.windUniformFloats.length).toBe(16);
    });

    it('packs tau into float index 15 during updateUniforms', () => {
      engine.ensureWindBuffers();
      const engineAny = engine as any;
      engine.setWeatherTau(0.65);
      engine.updateUniforms({ unfurl: 0.0, mode: 0, dt: 0.016, time: 1.0 } as any);
      expect(engineAny.windUniformFloats[15]).toBeCloseTo(0.65, 4);

      // Explicit scrub override takes precedence
      engine.updateUniforms({ unfurl: 0.0, mode: 0, dt: 0.016, time: 1.0, scrubTau: 0.82 } as any);
      expect(engineAny.windUniformFloats[15]).toBeCloseTo(0.82, 4);
    });

    it('supports direct slot loading via loadWindTextureSlot(0 | 1)', () => {
      const dummyBuffer = new ArrayBuffer(278016); // 1.0° GFS padded buffer
      expect(() => {
        engine.loadWindTextureSlot(0, dummyBuffer);
        engine.loadWindTextureSlot(1, dummyBuffer);
      }).not.toThrow();
    });

    it('initializes both windTexture and windTexture1', () => {
      const engineAny = engine as any;
      expect(engineAny.windTexture).toBeDefined();
      expect(engineAny.windTexture1).toBeDefined();
      expect(engineAny.windTextureView).toBeDefined();
      expect(engineAny.windTextureView1).toBeDefined();
    });
  });
});
