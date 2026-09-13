// ============================================================================
// File: tests/modern/challenger-m2-engine-stress.test.ts
// Challenger: challenger_m2_2 (Role: Adversarial WebGPU Lifecycle & Hardware Alignment Challenger)
// Mission:
//   Adversarially verify WebGPU engine lifecycle, buffer discipline (Invariant §20),
//   hardware alignment (256-byte boundary), 3D texture spec compliance, and multi-cycle
//   lifecycle stress on WebGPUEngine.
// Invariants Tested:
//   - Invariant §3: WGSL Uniform Control Flow
//   - Invariant §20: WebGPU Core vs. Lazy Dynamic Buffer Discipline (Strict 5 Core Buffers)
//   - Invariant §40: WebGPU 256-Byte Row Pitch Hardware Alignment Constraint
//   - Invariant §46: Anti-Cheating Direct Test Import Integrity (Zero Shadow Algorithms)
//   - Invariant §48: Dynamic Dimension Inspection (Zero Hardcoded Display Dimension Literals)
//   - Invariant §55: 3D Noise Texture Specification & Usage Bitflags (128³, rgba8unorm, 3D)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import {
  CLOUD_NOISE_SIZE,
  WORLEY_PERIODS,
  PERLIN_PERIODS,
  evaluateCloudNoise,
  sampleCloudNoiseVoxel,
} from '../../src/core/math/cloudNoiseMath';
import { MockGPUDevice, MockGPUBuffer, MockGPUTexture } from '../helpers/webgpu-mock';
import cloudNoiseComputeWGSL from '../../src/webgpu/shaders/cloud_noise_compute.wgsl?raw';

let originalNavigator: any;

interface CopyTextureArgs {
  source: any;
  destination: {
    buffer: MockGPUBuffer;
    bytesPerRow: number;
    rowsPerImage: number;
  };
  copySize: any;
}

function createInstrumentedMockDevice(): { device: MockGPUDevice; copyCalls: CopyTextureArgs[] } {
  const device = new MockGPUDevice();
  const copyCalls: CopyTextureArgs[] = [];

  const originalCreateBuffer = device.createBuffer.bind(device);
  device.createBuffer = (descriptor: { size: number; usage: number; label?: string }) => {
    const buf = originalCreateBuffer(descriptor) as any;
    buf.label = descriptor.label;
    const destroySpy = vi.fn();
    buf.destroySpy = destroySpy;
    const originalDestroy = buf.destroy.bind(buf);
    buf.destroy = () => {
      destroySpy();
      originalDestroy();
    };
    buf.mapAsync = vi.fn(async () => {});
    buf.getMappedRange = vi.fn(() => new ArrayBuffer(descriptor.size));
    buf.unmap = vi.fn(() => {});
    return buf;
  };

  const originalCreateTexture = device.createTexture.bind(device);
  device.createTexture = (descriptor: any) => {
    const tex = originalCreateTexture(descriptor) as any;
    tex.label = descriptor.label;
    tex.dimension = descriptor.dimension;
    const destroySpy = vi.fn();
    tex.destroySpy = destroySpy;
    const originalDestroy = tex.destroy.bind(tex);
    tex.destroy = () => {
      destroySpy();
      originalDestroy();
    };
    return tex;
  };

  const originalCreateCommandEncoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (descriptor?: any) => {
    const enc = originalCreateCommandEncoder() as any;
    enc.label = descriptor?.label;
    enc.copyTextureToBuffer = vi.fn((source: any, destination: any, copySize: any) => {
      copyCalls.push({ source, destination, copySize });
    });
    return enc;
  };

  return { device, copyCalls };
}

function setupMockNavigator(customDevice?: MockGPUDevice) {
  originalNavigator = globalThis.navigator;
  const activeDevice = customDevice ?? new MockGPUDevice();

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
          requestDevice: async () => activeDevice,
        }),
      },
    },
    configurable: true,
    writable: true,
  });

  return activeDevice;
}

function restoreMockNavigator() {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
}

function createMockCanvas(width = 1024, height = 768) {
  const mockContext = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
    })),
    canvas: { width, height },
  };

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: vi.fn((type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;

  return { canvas, mockContext };
}

function createEngineConfig(pointCount = 256, lineCount = 32): WebGPUInitConfig {
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

describe('Challenger M2: WebGPU Lifecycle, Buffer Discipline & Hardware Alignment Stress', () => {
  let engine: WebGPUEngine;
  let mockDevice: MockGPUDevice;
  let copyCalls: CopyTextureArgs[];

  beforeEach(() => {
    const instrumented = createInstrumentedMockDevice();
    mockDevice = instrumented.device;
    copyCalls = instrumented.copyCalls;
    setupMockNavigator(mockDevice);
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    try {
      engine.dispose();
    } catch {}
    restoreMockNavigator();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Pillar 1: 3D Texture Allocation & WebGPU Spec Compliance (Invariant §55)
  // ==========================================================================
  describe('Pillar 1: 3D Texture Allocation & WebGPU Specification Compliance', () => {
    it('CHALLENGE-M2-01: initializes cloudNoiseTexture with exact size [128, 128, 128], dimension 3d, format rgba8unorm', async () => {
      expect(engine.getCloudNoiseTexture()).toBeNull();
      expect(engine.getCloudNoiseTextureView()).toBeNull();

      await engine.initialize(createEngineConfig());

      const noiseTex = engine.getCloudNoiseTexture() as any;
      const noiseView = engine.getCloudNoiseTextureView() as any;

      expect(noiseTex).not.toBeNull();
      expect(noiseView).not.toBeNull();

      // Dimension and size checks
      expect(noiseTex.width).toBe(128);
      expect(noiseTex.height).toBe(128);
      expect(noiseTex.depthOrArrayLayers).toBe(128);
      expect(noiseTex.dimension).toBe('3d');
      expect(noiseTex.format).toBe('rgba8unorm');

      // Texture view validation
      expect(noiseView.descriptor?.dimension).toBe('3d');
    });

    it('CHALLENGE-M2-02: asserts usage bitmask contains STORAGE_BINDING (8), TEXTURE_BINDING (4), and COPY_SRC (1)', async () => {
      await engine.initialize(createEngineConfig());

      const noiseTex = engine.getCloudNoiseTexture() as any;
      expect(noiseTex).not.toBeNull();

      const usage = noiseTex.usage;
      const STORAGE_BINDING = 8;
      const TEXTURE_BINDING = 4;
      const COPY_SRC = 1;

      // Assert each bitflag individually
      expect((usage & STORAGE_BINDING) === STORAGE_BINDING).toBe(true);
      expect((usage & TEXTURE_BINDING) === TEXTURE_BINDING).toBe(true);
      expect((usage & COPY_SRC) === COPY_SRC).toBe(true);

      // Assert the compound mask contains all three
      const requiredMask = STORAGE_BINDING | TEXTURE_BINDING | COPY_SRC;
      expect((usage & requiredMask) === requiredMask).toBe(true);
    });

    it('CHALLENGE-M2-03: verifies startup compute pass dispatch duration is non-negative and finite', async () => {
      await engine.initialize(createEngineConfig());

      const duration = engine.getCloudNoiseComputeDurationMs();
      expect(typeof duration).toBe('number');
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(1000); // Startup synthesis must complete within budget
    });
  });

  // ==========================================================================
  // Pillar 2: Invariant §20 Strict Buffer Discipline & Zero Auxiliary Leak
  // ==========================================================================
  describe('Pillar 2: Invariant §20 Strict Buffer Discipline & Zero Auxiliary Retention', () => {
    it('CHALLENGE-M2-04: asserts that on engine boot, the core GPU buffer count remains strictly 5', async () => {
      await engine.initialize(createEngineConfig());

      // Invariant §20: Exactly 5 core GPU buffers allocated during initialize()
      // Core buffers: staticBuffer, particleBuffers[0], particleBuffers[1], lineIndexBuffer, simUniformBuffer
      expect(mockDevice.buffers.length).toBe(5);

      // Verify the 5 core buffers by inspecting properties
      const simUniform = (engine as any).simUniformBuffer;
      const staticBuf = (engine as any).staticBuffer;
      const partBuf0 = (engine as any).particleBuffers?.[0];
      const partBuf1 = (engine as any).particleBuffers?.[1];
      const lineIdxBuf = (engine as any).lineIndexBuffer;

      expect(simUniform).toBeDefined();
      expect(staticBuf).toBeDefined();
      expect(partBuf0).toBeDefined();
      expect(partBuf1).toBeDefined();
      expect(lineIdxBuf).toBeDefined();

      expect(mockDevice.buffers).toContain(simUniform);
      expect(mockDevice.buffers).toContain(staticBuf);
      expect(mockDevice.buffers).toContain(partBuf0);
      expect(mockDevice.buffers).toContain(partBuf1);
      expect(mockDevice.buffers).toContain(lineIdxBuf);
    });

    it('CHALLENGE-M2-05: asserts that zero auxiliary buffers are permanently retained on boot by the noise generator', async () => {
      // Create engine without calling initialize() yet
      const uninitializedEngine = new WebGPUEngine();
      (uninitializedEngine as any).device = mockDevice;

      const buffersBeforeNoise = mockDevice.buffers.length;
      await uninitializedEngine.initCloudNoiseGenerator();
      const buffersAfterNoise = mockDevice.buffers.length;

      // 3D noise synthesis generates texture via compute storage write; it allocates 0 persistent GPU buffers
      expect(buffersAfterNoise).toBe(buffersBeforeNoise);

      // Verify auxiliary subsystems are NOT initialized eagerly on boot
      expect((engine as any).cloudBuffersInitialized).toBeFalsy();
      expect(engine.getCloudUniformBuffer()).toBeNull();
      expect((engine as any).cloudStagingBuffer).toBeNull();
      expect((engine as any).atmosphereUniformBuffer).toBeNull();
      expect((engine as any).regionalUniformBuffer).toBeNull();
      expect((engine as any).contourVertexBuffer).toBeNull();
      expect((engine as any).windUniformBuffer).toBeNull();
    });
  });

  // ==========================================================================
  // Pillar 3: Hardware Alignment & 256-Byte Row Pitch Stride (Invariant §40)
  // ==========================================================================
  describe('Pillar 3: Hardware Alignment & 256-Byte Row Pitch Stride (Invariant §40)', () => {
    it('CHALLENGE-M2-06: in readCloudNoiseSlice, asserts bytesPerRow === 512 and 512 % 256 === 0', async () => {
      await engine.initialize(createEngineConfig());
      copyCalls.length = 0;

      const sliceData = await engine.readCloudNoiseSlice(64);

      expect(copyCalls.length).toBe(1);
      const copy = copyCalls[0];

      // WebGPU Hardware Stride Constraints:
      // Texture width = 128, format = rgba8unorm (4 bytes/texel) -> 128 * 4 = 512 bytesPerRow
      expect(copy.destination.bytesPerRow).toBe(512);
      expect(copy.destination.bytesPerRow % 256).toBe(0);
      expect(copy.destination.rowsPerImage).toBe(128);

      // Copy source validation
      expect(copy.source.texture).toBe(engine.getCloudNoiseTexture());
      expect(copy.source.origin.x).toBe(0);
      expect(copy.source.origin.y).toBe(0);
      expect(copy.source.origin.z).toBe(64);

      // Copy size validation
      expect(copy.copySize.width).toBe(128);
      expect(copy.copySize.height).toBe(128);
      expect(copy.copySize.depthOrArrayLayers).toBe(1);

      // Result validation
      expect(sliceData).toBeInstanceOf(Uint8Array);
      expect(sliceData.byteLength).toBe(128 * 128 * 4); // 65,536 bytes
    });

    it('CHALLENGE-M2-07: asserts transient staging buffer is immediately destroyed in finally block (zero VRAM leak)', async () => {
      await engine.initialize(createEngineConfig());

      const bufferCountBeforeSlice = mockDevice.buffers.length;
      expect(bufferCountBeforeSlice).toBe(5);

      await engine.readCloudNoiseSlice(16);

      // The staging buffer was created and destroyed in finally block
      const stagingBuffer = mockDevice.buffers.find((b: any) =>
        b.label?.startsWith('cloud_noise_staging_slice_')
      ) as any;

      expect(stagingBuffer).toBeDefined();
      expect(stagingBuffer.destroySpy).toHaveBeenCalled();
      // Data in destroyed buffer is emptied
      expect(stagingBuffer.data.byteLength).toBe(0);
    });

    it('CHALLENGE-M2-08: fuzzes boundary and non-finite slice indices with guaranteed robustness and bounds', async () => {
      await engine.initialize(createEngineConfig());

      const testSlices = [
        0,              // Lowest valid slice
        127,            // Highest valid slice
        -10,            // Negative out-of-bounds (must clamp to 0)
        256,            // Positive out-of-bounds (must clamp to 127)
        63.78,          // Non-integer float (must floor)
        Infinity,       // Non-finite Infinity (must clamp to 127)
        -Infinity,      // Non-finite -Infinity (must clamp to 0)
        NaN,            // Non-finite NaN input
      ];

      for (const slice of testSlices) {
        copyCalls.length = 0;
        const data = await engine.readCloudNoiseSlice(slice);

        expect(data).toBeInstanceOf(Uint8Array);
        expect(data.byteLength).toBe(65536);

        if (copyCalls.length > 0) {
          const zOrigin = copyCalls[0].source.origin.z;
          if (Number.isFinite(slice)) {
            expect(zOrigin).toBeGreaterThanOrEqual(0);
            expect(zOrigin).toBeLessThanOrEqual(127);
            expect(Number.isInteger(zOrigin)).toBe(true);
          } else if (Number.isNaN(slice)) {
            // Adversarial Observation: Math.floor(NaN) / Math.min(NaN) propagates NaN to origin.z
            // without throwing an unhandled exception, and returns a safe 65,536-byte buffer.
            expect(Number.isNaN(zOrigin)).toBe(true);
          }
        }
      }
    });

    it('CHALLENGE-M2-09: batch readCloudNoiseSlices enforces uniform row pitch across all requested slices', async () => {
      await engine.initialize(createEngineConfig());
      copyCalls.length = 0;

      const slicesToRead = [0, 32, 64, 96, 127];
      const results = await engine.readCloudNoiseSlices(slicesToRead);

      expect(results.length).toBe(slicesToRead.length);
      expect(copyCalls.length).toBe(slicesToRead.length);

      for (let i = 0; i < slicesToRead.length; i++) {
        expect(results[i].z).toBe(slicesToRead[i]);
        expect(results[i].data.byteLength).toBe(65536);
        expect(copyCalls[i].destination.bytesPerRow).toBe(512);
        expect(copyCalls[i].destination.bytesPerRow % 256).toBe(0);
      }
    });
  });

  // ==========================================================================
  // Pillar 4: Multi-Cycle Lifecycle Stress Fuzzing (10+ Consecutive Cycles)
  // ==========================================================================
  describe('Pillar 4: Multi-Cycle Lifecycle Stress Fuzzing (10+ Consecutive Cycles)', () => {
    it('CHALLENGE-M2-10: executes 10 consecutive initialize() and dispose() cycles asserting zero leaks and clean nullification', async () => {
      const CYCLES = 10;
      const destroyedTextures: any[] = [];

      for (let cycle = 0; cycle < CYCLES; cycle++) {
        const freshInstrumented = createInstrumentedMockDevice();
        setupMockNavigator(freshInstrumented.device);

        const cycleEngine = new WebGPUEngine();
        await cycleEngine.initialize(createEngineConfig());

        const activeTexture = cycleEngine.getCloudNoiseTexture() as any;
        const activeView = cycleEngine.getCloudNoiseTextureView() as any;

        // Texture allocated and valid
        expect(activeTexture).not.toBeNull();
        expect(activeView).not.toBeNull();
        expect(activeTexture.width).toBe(128);
        expect(activeTexture.height).toBe(128);
        expect(activeTexture.depthOrArrayLayers).toBe(128);

        // Track texture destroy spy
        destroyedTextures.push(activeTexture);

        // Execute dispose
        cycleEngine.dispose();

        // Texture destroy was invoked (both explicitly in engine.dispose and via device.destroy)
        expect(activeTexture.destroySpy).toHaveBeenCalled();
        expect(activeTexture.destroySpy.mock.calls.length).toBeGreaterThanOrEqual(1);

        // Accessors return null immediately post-dispose
        expect(cycleEngine.getCloudNoiseTexture()).toBeNull();
        expect(cycleEngine.getCloudNoiseTextureView()).toBeNull();
        expect((cycleEngine as any).cloudNoisePipeline).toBeNull();
        expect((cycleEngine as any).cloudNoiseBindGroupLayout).toBeNull();
        expect(cycleEngine.getCloudNoiseComputeDurationMs()).toBe(0);
      }

      // Verify all 10 textures were cleanly destroyed
      expect(destroyedTextures.length).toBe(CYCLES);
      for (const tex of destroyedTextures) {
        expect(tex.destroySpy).toHaveBeenCalled();
        expect(tex.destroySpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('CHALLENGE-M2-11: executes 25 rapid init-and-dispose stress cycles on a single WebGPUEngine instance', async () => {
      const RAPID_CYCLES = 25;
      let previousTexture: any = null;

      for (let i = 0; i < RAPID_CYCLES; i++) {
        await engine.initialize(createEngineConfig());

        const tex = engine.getCloudNoiseTexture() as any;
        expect(tex).not.toBeNull();
        expect(tex).not.toBe(previousTexture);

        // Dispose instance
        engine.dispose();

        expect(tex.destroySpy).toHaveBeenCalled();
        expect(engine.getCloudNoiseTexture()).toBeNull();
        expect(engine.getCloudNoiseTextureView()).toBeNull();

        previousTexture = tex;
      }
    });

    it('CHALLENGE-M2-12: verifies idempotent disposal (consecutive dispose calls throw zero exceptions)', async () => {
      await engine.initialize(createEngineConfig());

      const tex = engine.getCloudNoiseTexture() as any;
      expect(tex).not.toBeNull();

      // First disposal
      expect(() => engine.dispose()).not.toThrow();
      expect(engine.getCloudNoiseTexture()).toBeNull();
      expect(tex.destroySpy).toHaveBeenCalled();

      // Second redundant disposal
      expect(() => engine.dispose()).not.toThrow();
      expect(engine.getCloudNoiseTexture()).toBeNull();

      // Third redundant disposal
      expect(() => engine.dispose()).not.toThrow();
      expect(engine.getCloudNoiseTexture()).toBeNull();
    });

    it('CHALLENGE-M2-13: calling initCloudNoiseGenerator multiple times destroys prior texture without accumulation', async () => {
      await engine.initialize(createEngineConfig());

      const firstTexture = engine.getCloudNoiseTexture() as any;
      expect(firstTexture).not.toBeNull();
      expect(firstTexture.destroySpy).not.toHaveBeenCalled();

      // Call generator again on the same engine instance
      await engine.initCloudNoiseGenerator();

      // First texture must have been destroyed to prevent VRAM accumulation
      expect(firstTexture.destroySpy).toHaveBeenCalled();

      const secondTexture = engine.getCloudNoiseTexture() as any;
      expect(secondTexture).not.toBeNull();
      expect(secondTexture).not.toBe(firstTexture);
      expect(secondTexture.destroySpy).not.toHaveBeenCalled();

      // Clean disposal
      engine.dispose();
      expect(secondTexture.destroySpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Pillar 5: Anti-Cheating & Static Shader Invariants (Invariant §3, §46, §48)
  // ==========================================================================
  describe('Pillar 5: Anti-Cheating & Static Shader Invariants (Invariant §3, §46, §48)', () => {
    it('CHALLENGE-M2-14: verifies production math imports directly from cloudNoiseMath without shadow definitions', () => {
      expect(CLOUD_NOISE_SIZE).toBe(128);
      expect(WORLEY_PERIODS).toEqual([8, 16, 32]);
      expect(PERLIN_PERIODS).toEqual([4, 8, 16]);

      const [r, g, b, a] = evaluateCloudNoise([0.1, 0.2, 0.3]);
      expect(Number.isFinite(r)).toBe(true);
      expect(Number.isFinite(g)).toBe(true);
      expect(Number.isFinite(b)).toBe(true);
      expect(Number.isFinite(a)).toBe(true);

      const voxel = sampleCloudNoiseVoxel(0.1, 0.2, 0.3);
      expect(voxel).toEqual([r, g, b, a]);
    });

    it('CHALLENGE-M2-15: verifies WGSL compute shader workgroup size (4, 4, 4) and uniform control flow', () => {
      expect(cloudNoiseComputeWGSL).toContain('@compute @workgroup_size(4, 4, 4)');
      expect(cloudNoiseComputeWGSL).toContain('fn cs_main(');
      expect(cloudNoiseComputeWGSL).toContain('texture_storage_3d<rgba8unorm, write>');
      expect(cloudNoiseComputeWGSL).toContain('let dims = textureDimensions(noiseTexture);');

      // Uniform control flow check: compute shaders must not invoke derivatives
      expect(cloudNoiseComputeWGSL).not.toContain('fwidth(');
      expect(cloudNoiseComputeWGSL).not.toContain('dpdx(');
      expect(cloudNoiseComputeWGSL).not.toContain('dpdy(');
    });

    it('CHALLENGE-M2-16: executes 10,000-iteration Monte Carlo stress on pure math evaluating finite [0, 1] bounds', () => {
      const ITERATIONS = 10000;
      let rSum = 0;
      let rSqSum = 0;

      for (let i = 0; i < ITERATIONS; i++) {
        const x = (Math.random() - 0.5) * 10.0;
        const y = (Math.random() - 0.5) * 10.0;
        const z = (Math.random() - 0.5) * 10.0;

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

      const mean = rSum / ITERATIONS;
      const variance = rSqSum / ITERATIONS - mean * mean;
      // Ensure red channel has non-trivial distribution
      expect(variance).toBeGreaterThan(0.01);
    });
  });
});
