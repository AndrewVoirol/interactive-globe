// ============================================================================
// File: tests/modern/r13-cloud-engine-integration.test.ts
// Architecture: Milestone 4: WebGPU Engine Cloud Integration
// Invariants:
//   - Invariant §20: 5 Core Buffers Startup Invariant & Lazy Dynamic Buffer Discipline
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §40: Row-Pitch 256-Byte Stride Padding (1440x2=2880 -> 3072 bytes)
//   - Invariant §46: Anti-Cheating Direct Test Import Integrity
//   - Invariant §48: Dynamic Texture Dimensions (No Hardcoded 8192/4096 Literals)
// Description: Behavioral and structural test suite verifying WebGPUEngine
//              cloud integration, lazy buffer allocation, staging buffer upload,
//              render pass interleaving, and zero-leak resource disposal.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
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

function createMockCanvas(width = 1920, height = 1080) {
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

function createEngineConfig(pointCount: number, lineCount = 100): WebGPUInitConfig {
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

function createFrameParams(overrides: Partial<WebGPUFrameParams> = {}): WebGPUFrameParams {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);

  return {
    camera,
    unfurl: 0.0,
    mode: 0,
    theme: 0,
    dt: 0.016,
    time: 1.0,
    showWind: true,
    showSurfaceWinds: true,
    showJetStream: true,
    showClouds: true,
    showCloudLow: true,
    showCloudMid: true,
    showCloudHigh: true,
    ...overrides,
  };
}

describe('Milestone 4: WebGPU Engine Cloud Integration Suite', () => {
  // ==========================================================================
  // Dimension 1: Invariant §20 (5 Core Buffers Startup & Lazy Allocation)
  // ==========================================================================
  describe('Dimension 1: Invariant §20 (5 Core Buffers Startup & Lazy Allocation)', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('M4-INIT-01: strictly maintains exactly 5 core buffers at initialization', () => {
      const device = (engine as any).device as MockGPUDevice;
      // Exactly 5 core buffers on init; cloud buffers must NOT be eagerly allocated
      expect(device.buffers.length).toBe(5);
      expect((engine as any).cloudBuffersInitialized).toBe(false);
      expect(engine.getCloudUniformBuffer()).toBeNull();
      expect((engine as any).cloudStagingBuffer).toBeNull();
      expect(engine.cloudTextures.low).toBeNull();
      expect(engine.cloudTextures.mid).toBeNull();
      expect(engine.cloudTextures.high).toBeNull();
    });

    it('M4-INIT-02: ensureCloudBuffers lazily allocates cloudUniformBuffer (288 bytes) and staging buffer (2,214,912 bytes)', () => {
      const device = (engine as any).device as MockGPUDevice;
      expect(device.buffers.length).toBe(5);

      engine.ensureCloudBuffers();

      // Buffers increased by: 3x dedicated cloudUniformBuffers (low, mid, high), cloudStagingBuffer, cloudSphereVertexBuffer, cloudSphereIndexBuffer
      expect(device.buffers.length).toBe(11);
      expect((engine as any).cloudBuffersInitialized).toBe(true);

      const cloudUBuffer = engine.getCloudUniformBuffer();
      expect(cloudUBuffer).toBeDefined();
      expect(cloudUBuffer?.size).toBe(288);

      const stagingBuffer = (engine as any).cloudStagingBuffer;
      expect(stagingBuffer).toBeDefined();
      expect(stagingBuffer.size).toBe(2214912);

      // Textures: 3 r16float cloud textures allocated
      expect(engine.cloudTextures.low).toBeDefined();
      expect(engine.cloudTextures.mid).toBeDefined();
      expect(engine.cloudTextures.high).toBeDefined();
      expect(engine.cloudTextures.low?.format).toBe('r16float');
      expect(engine.cloudTextures.low?.width).toBe(1440);
      expect(engine.cloudTextures.low?.height).toBe(721);
    });

    it('M4-INIT-03: subsequent calls to ensureCloudBuffers are idempotent', () => {
      const device = (engine as any).device as MockGPUDevice;
      engine.ensureCloudBuffers();
      const bufferCountAfterFirst = device.buffers.length;
      const textureCountAfterFirst = device.textures.length;

      // Call ensureCloudBuffers multiple times
      engine.ensureCloudBuffers();
      engine.ensureCloudBuffers();

      expect(device.buffers.length).toBe(bufferCountAfterFirst);
      expect(device.textures.length).toBe(textureCountAfterFirst);
    });

    it('M4-INIT-04: dispose() cleanly destroys all cloud buffers and textures with zero leaks', () => {
      const device = (engine as any).device as MockGPUDevice;
      engine.ensureCloudBuffers();
      expect(device.buffers.length).toBeGreaterThan(5);

      engine.dispose();

      expect(engine.initialized).toBe(false);
      expect((engine as any).cloudBuffersInitialized).toBe(false);
      expect(engine.getCloudUniformBuffer()).toBeNull();
      expect((engine as any).cloudStagingBuffer).toBeNull();
      expect(engine.cloudTextures.low).toBeNull();
      expect(device.buffers.length).toBe(0);
      expect(device.textures.length).toBe(0);
    });
  });

  // ==========================================================================
  // Dimension 2: Invariant §40 (Row-Pitch 256-Byte Stride & Staging Buffer)
  // ==========================================================================
  describe('Dimension 2: Invariant §40 (Row-Pitch 256-Byte Stride & Staging Buffer)', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('M4-STRIDE-01: calculates 3072 row pitch (12 x 256) and 2,214,912 staging buffer size', () => {
      const width = 1440;
      const height = 721;
      const bytesPerTexel = 2; // Float16
      const unpaddedRowPitch = width * bytesPerTexel; // 2880 bytes

      expect(unpaddedRowPitch).toBe(2880);
      expect(unpaddedRowPitch % 256).not.toBe(0); // 2880 is not 256-byte aligned

      const paddedRowPitch = Math.ceil(unpaddedRowPitch / 256) * 256;
      expect(paddedRowPitch).toBe(3072);
      expect(paddedRowPitch % 256).toBe(0);
      expect(paddedRowPitch / 256).toBe(12);

      const totalStagingBytes = paddedRowPitch * height;
      expect(totalStagingBytes).toBe(2214912);
    });

    it('M4-STRIDE-02: setCloudData uploads padded rows using queue.writeTexture with bytesPerRow: 3072', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;

      // Create a mock Float16 binary array (1440 * 721 = 1,038,240 half-floats = 2,076,480 bytes)
      const mockRawData = new Uint16Array(1440 * 721);
      mockRawData.fill(0x3c00); // 1.0 in IEEE 754 float16

      engine.setCloudData('low', mockRawData);

      expect(device.queue.writeTextureCalls.length).toBeGreaterThan(0);
      const lastCall = device.queue.writeTextureCalls[device.queue.writeTextureCalls.length - 1];
      expect(lastCall.dataLayout.bytesPerRow).toBe(3072);
      expect(lastCall.dataLayout.rowsPerImage).toBe(721);
      expect(lastCall.size.width).toBe(1440);
      expect(lastCall.size.height).toBe(721);
    });

    it('M4-STRIDE-03: staging buffer is reused across low, mid, and high layer uploads without reallocation', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;
      const initialBufferCount = device.buffers.length;

      const mockData = new Uint16Array(1440 * 721);
      engine.setCloudData('low', mockData);
      engine.setCloudData('mid', mockData);
      engine.setCloudData('high', mockData);

      // Buffer count must not increase (staging buffer reused)
      expect(device.buffers.length).toBe(initialBufferCount);
    });
  });

  // ==========================================================================
  // Dimension 3: Invariant §24 (Uniform-Buffer-Driven Dynamic Theme Switching)
  // ==========================================================================
  describe('Dimension 3: Invariant §24 (Uniform-Buffer-Driven Dynamic Theme Switching)', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('M4-THEME-01: theme switching writes to uniform buffer without pipeline recreation', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;

      const initialPipeline = (engine as any).cloudPipeline;
      expect(initialPipeline).toBeDefined();

      const initialWriteCount = device.queue.writeBufferCalls.length;

      // Update uniforms for Theme 0 (Marie Tharp)
      engine.updateCloudUniforms(0.016, createFrameParams({ theme: 0 }));
      const writeCountTheme0 = device.queue.writeBufferCalls.length;
      expect(writeCountTheme0).toBeGreaterThan(initialWriteCount);
      expect((engine as any).cloudPipeline).toBe(initialPipeline); // Zero recompile

      // Update uniforms for Theme 1 (Cream Rag)
      engine.updateCloudUniforms(0.016, createFrameParams({ theme: 1 }));
      const writeCountTheme1 = device.queue.writeBufferCalls.length;
      expect(writeCountTheme1).toBeGreaterThan(writeCountTheme0);
      expect((engine as any).cloudPipeline).toBe(initialPipeline); // Zero recompile

      // Update uniforms for Theme 2 (Prussian Cyanotype)
      engine.updateCloudUniforms(0.016, createFrameParams({ theme: 2 }));
      const writeCountTheme2 = device.queue.writeBufferCalls.length;
      expect(writeCountTheme2).toBeGreaterThan(writeCountTheme1);
      expect((engine as any).cloudPipeline).toBe(initialPipeline); // Zero recompile
    });

    it('M4-THEME-02: verifies 16-byte alignment and packing in CloudUniforms', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;

      engine.updateCloudUniforms(0.016, createFrameParams({
        theme: 1,
        unfurl: 0.5,
        cloudDriftSpeed: 1.2,
        cloudOpacity: 0.85,
      }));

      // Find the last writeBuffer call targeting cloudUniformBuffer
      const cloudBuffer = engine.getCloudUniformBuffer();
      const cloudWrites = device.queue.writeBufferCalls.filter(c => (c.buffer as unknown) === cloudBuffer);
      expect(cloudWrites.length).toBeGreaterThan(0);

      const lastWrite = cloudWrites[cloudWrites.length - 1];
      const f32 = new Float32Array(lastWrite.data as ArrayBuffer);
      const u32 = new Uint32Array(lastWrite.data as ArrayBuffer);

      // Floats 0..3: scalars
      expect(f32[0]).toBeCloseTo(0.5); // u_unfurl
      expect(u32[2]).toBe(1);          // u_theme (1 = Cream Rag)

      // Floats 12..15: u_cloudDrift
      expect(f32[12]).toBeCloseTo(0.6); // lowDrift
      expect(f32[13]).toBeCloseTo(1.0); // midDrift
      expect(f32[14]).toBeCloseTo(1.8); // highDrift
      expect(f32[15]).toBeCloseTo(1.2); // baseDriftSpeed

      // Floats 16..19: u_layerStandoff
      expect(f32[16]).toBeCloseTo(0.0010); // low standoff
      expect(f32[17]).toBeCloseTo(0.0040); // mid standoff
      expect(f32[18]).toBeCloseTo(0.0080); // high standoff

      // Floats 20..23: u_layerOpacity
      expect(f32[20]).toBeCloseTo(0.70); // low opacity
      expect(f32[21]).toBeCloseTo(0.50); // mid opacity
      expect(f32[22]).toBeCloseTo(0.30); // high opacity
      expect(f32[23]).toBeCloseTo(0.85); // master globalOpacity
    });
  });

  // ==========================================================================
  // Dimension 4: Invariant §46 & §48 (Integrity & Dynamic Dimensions)
  // ==========================================================================
  describe('Dimension 4: Invariant §46 & §48 (Integrity & Dynamic Dimensions)', () => {
    it('M4-INTEG-01: WebGPUEngine is imported directly from source without mock facades', () => {
      expect(WebGPUEngine).toBeDefined();
      expect(typeof WebGPUEngine).toBe('function');
      const engine = new WebGPUEngine();
      expect(engine.initialized).toBe(false);
      expect(typeof engine.ensureCloudBuffers).toBe('function');
      expect(typeof engine.loadAllCloudLayers).toBe('function');
      expect(typeof engine.setCloudData).toBe('function');
    });

    it('M4-INTEG-02: dynamic cloud dimensions default to 1440x721', () => {
      const engine = new WebGPUEngine();
      const dims = engine.cloudDimensions;
      expect(dims.width).toBe(1440);
      expect(dims.height).toBe(721);
      expect(dims.rawRowPitch).toBe(2880);
      expect(dims.paddedRowPitch).toBe(3072);
      expect(dims.stagingSizeBytes).toBe(2214912);
    });
  });

  // ==========================================================================
  // Dimension 5: Render Pass Sequence & Interleaving
  // ==========================================================================
  describe('Dimension 5: Render Pass Sequence & Interleaving', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('M4-PASS-01: render pass executes interleaved sequence (Surface Winds -> Cloud Low -> Cloud Mid -> Jet Stream -> Cloud High)', () => {
      engine.ensureWindBuffers();
      engine.ensureCloudBuffers();

      const passCalls: string[] = [];

      // Spy on render methods
      vi.spyOn(engine, 'renderSurfaceWindRibbons').mockImplementation(() => {
        passCalls.push('SurfaceWinds');
      });
      vi.spyOn(engine, 'renderJetStreamRibbons').mockImplementation(() => {
        passCalls.push('JetStream');
      });
      vi.spyOn(engine, 'renderCloudLayer').mockImplementation((_encoder, layer) => {
        passCalls.push(`Cloud_${layer}`);
      });

      engine.render(createFrameParams({
        showWind: true,
        showSurfaceWinds: true,
        showJetStream: true,
        showClouds: true,
        showCloudLow: true,
        showCloudMid: true,
        showCloudHigh: true,
      }));

      expect(passCalls).toEqual([
        'SurfaceWinds',
        'Cloud_low',
        'Cloud_mid',
        'JetStream',
        'Cloud_high',
      ]);
    });

    it('M4-PASS-02: toggling individual cloud layers skips corresponding draw call cleanly', () => {
      engine.ensureWindBuffers();
      engine.ensureCloudBuffers();

      const passCalls: string[] = [];

      vi.spyOn(engine, 'renderSurfaceWindRibbons').mockImplementation(() => {
        passCalls.push('SurfaceWinds');
      });
      vi.spyOn(engine, 'renderJetStreamRibbons').mockImplementation(() => {
        passCalls.push('JetStream');
      });
      vi.spyOn(engine, 'renderCloudLayer').mockImplementation((_encoder, layer) => {
        passCalls.push(`Cloud_${layer}`);
      });

      // Disable Mid clouds and Jet Stream
      engine.render(createFrameParams({
        showWind: true,
        showSurfaceWinds: true,
        showJetStream: false,
        showClouds: true,
        showCloudLow: true,
        showCloudMid: false,
        showCloudHigh: true,
      }));

      expect(passCalls).toEqual([
        'SurfaceWinds',
        'Cloud_low',
        'Cloud_high',
      ]);
    });

    it('M4-PASS-03: turning showClouds: false skips all cloud draw calls', () => {
      engine.ensureWindBuffers();
      engine.ensureCloudBuffers();

      const passCalls: string[] = [];

      vi.spyOn(engine, 'renderSurfaceWindRibbons').mockImplementation(() => {
        passCalls.push('SurfaceWinds');
      });
      vi.spyOn(engine, 'renderJetStreamRibbons').mockImplementation(() => {
        passCalls.push('JetStream');
      });
      vi.spyOn(engine, 'renderCloudLayer').mockImplementation((_encoder, layer) => {
        passCalls.push(`Cloud_${layer}`);
      });

      engine.render(createFrameParams({
        showWind: true,
        showSurfaceWinds: true,
        showJetStream: true,
        showClouds: false,
      }));

      expect(passCalls).toEqual([
        'SurfaceWinds',
        'JetStream',
      ]);
    });
  });

  // ==========================================================================
  // Dimension 6: Cloud Layer Data Ingestion & Fallbacks
  // ==========================================================================
  describe('Dimension 6: Cloud Layer Data Ingestion & Fallbacks', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('M4-DATA-01: loadCloudData ingests provided ArrayBuffer directly', async () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;

      // 1440 * 721 * 2 = 2,076,480 bytes
      const testBuffer = new ArrayBuffer(1440 * 721 * 2);
      await engine.loadCloudData('low', testBuffer);

      expect(device.queue.writeTextureCalls.length).toBeGreaterThan(0);
      const call = device.queue.writeTextureCalls[device.queue.writeTextureCalls.length - 1];
      expect(call.destination.texture).toBe(engine.cloudTextures.low);
    });

    it('M4-DATA-02: setCloudOptions updates cloud state and drift parameters', () => {
      engine.setCloudOptions({
        enabled: true,
        driftSpeed: 2.5,
        opacity: 0.65,
        showLow: true,
        showMid: false,
        showHigh: true,
      });

      const options = engine.cloudOptions;
      expect(options.enabled).toBe(true);
      expect(options.driftSpeed).toBe(2.5);
      expect(options.opacity).toBe(0.65);
      expect(options.showLow).toBe(true);
      expect(options.showMid).toBe(false);
      expect(options.showHigh).toBe(true);
    });
  });
});
