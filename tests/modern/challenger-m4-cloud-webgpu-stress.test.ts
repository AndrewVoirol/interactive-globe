// ============================================================================
// File: tests/modern/challenger-m4-cloud-webgpu-stress.test.ts
// Challenger: challenger_m4_1 (teamwork_preview_challenger)
// Milestone: Milestone 4 (WebGPU Engine Cloud Integration)
// Invariants:
//   - Invariant §20: 5-Core-Buffer Startup Invariant & Lazy Dynamic Allocation
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §40: WebGPU Row-Pitch 256-Byte Stride Padding (1440x2=2880 -> 3072)
//   - Invariant §46: Anti-Cheating Direct Test Import Integrity
// Description: Adversarial verification and Monte Carlo stress harness for
//              Milestone 4 WebGPU buffer arithmetic, staging buffer lifecycle,
//              CloudUniforms 16/256-byte alignment, 10,000 rapid theme hot-switches,
//              and procedural data generation stability.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice, MockGPUBuffer } from '../helpers/webgpu-mock';
import cloudShellWGSL from '../../src/webgpu/shaders/cloud_shell.wgsl?raw';

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

function createEngineConfig(pointCount = 256, lineCount = 30): WebGPUInitConfig {
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

function createStrictFrameParams(overrides: Partial<WebGPUFrameParams> = {}): WebGPUFrameParams {
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

// IEEE 754 float16 decoder for boundary testing
function decodeFloat16(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  } else if (e === 0x1f) {
    return f ? NaN : (s ? -Infinity : Infinity);
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

describe('Adversarial Challenger Suite: Milestone 4 WebGPU Engine Cloud Integration', () => {
  let engine: WebGPUEngine;

  beforeEach(async () => {
    setupMockNavigator();
    engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());
  });

  afterEach(() => {
    engine.dispose();
    restoreMockNavigator();
  });

  // ==========================================================================
  // Pillar 1: Anti-Cheating Direct Production Source Import Integrity (Invariant §46)
  // ==========================================================================
  describe('Pillar 1: Invariant §46 - Direct Production Import Integrity', () => {
    it('CHALLENGE-M4-01: Verifies WebGPUEngine and cloud_shell.wgsl imported directly from src/', () => {
      expect(WebGPUEngine).toBeDefined();
      expect(typeof WebGPUEngine).toBe('function');
      expect(cloudShellWGSL).toBeDefined();
      expect(cloudShellWGSL.length).toBeGreaterThan(6000);
      expect(cloudShellWGSL).toContain('struct CloudUniforms');
      expect(cloudShellWGSL).toContain('@vertex');
      expect(cloudShellWGSL).toContain('@fragment');
    });
  });

  // ==========================================================================
  // Pillar 2: WebGPU Row-Pitch Alignment & Staging Lifecycle (Invariant §40)
  // ==========================================================================
  describe('Pillar 2: Invariant §40 - WebGPU Row-Pitch Alignment & Staging Lifecycle', () => {
    it('CHALLENGE-M4-02: Verifies mathematical row pitch: raw 2880 bytes -> padded 3072 bytes (3072 % 256 == 0)', () => {
      const width = 1440;
      const height = 721;
      const bytesPerTexel = 2; // Float16

      const rawBytesPerRow = width * bytesPerTexel;
      expect(rawBytesPerRow).toBe(2880);
      expect(rawBytesPerRow % 256).toBe(64); // 2880 is NOT aligned to 256

      const paddedBytesPerRow = Math.ceil(rawBytesPerRow / 256) * 256;
      expect(paddedBytesPerRow).toBe(3072);
      expect(paddedBytesPerRow % 256).toBe(0); // Strictly aligned to 256
      expect(paddedBytesPerRow / 256).toBe(12);

      const totalStagingSize = paddedBytesPerRow * height;
      expect(totalStagingSize).toBe(2214912);

      // Verify engine exports match exact dimensions
      const dims = engine.cloudDimensions;
      expect(dims.width).toBe(width);
      expect(dims.height).toBe(height);
      expect(dims.rawRowPitch).toBe(rawBytesPerRow);
      expect(dims.paddedRowPitch).toBe(paddedBytesPerRow);
      expect(dims.stagingSizeBytes).toBe(totalStagingSize);
    });

    it('CHALLENGE-M4-03: Staging buffer is allocated once (2,214,912 bytes) and reused across Low, Mid, and High uploads with 0 reallocations', () => {
      const device = (engine as any).device as MockGPUDevice;
      expect(device.buffers.length).toBe(5); // 5 core buffers before cloud allocation

      engine.ensureCloudBuffers();
      expect(device.buffers.length).toBe(11); // Added: 3 cloud uniform (low, mid, high), staging, sphereVertex, sphereIndex

      const stagingBuffer = (engine as any).cloudStagingBuffer as MockGPUBuffer;
      expect(stagingBuffer).toBeDefined();
      expect(stagingBuffer.size).toBe(2214912);

      const bufferCountAfterEnsure = device.buffers.length;

      // Synthetic raw cloud data (1440 * 721 * 2 = 2,076,480 bytes)
      const rawData = new Uint16Array(1440 * 721);
      rawData.fill(0x3c00); // 1.0 in Float16

      // Upload layer 1 (low)
      engine.setCloudData('low', rawData);
      expect(device.buffers.length).toBe(bufferCountAfterEnsure);
      expect((engine as any).cloudStagingBuffer).toBe(stagingBuffer);

      // Upload layer 2 (mid)
      engine.setCloudData('mid', rawData);
      expect(device.buffers.length).toBe(bufferCountAfterEnsure);
      expect((engine as any).cloudStagingBuffer).toBe(stagingBuffer);

      // Upload layer 3 (high)
      engine.setCloudData('high', rawData);
      expect(device.buffers.length).toBe(bufferCountAfterEnsure);
      expect((engine as any).cloudStagingBuffer).toBe(stagingBuffer);
    });

    it('CHALLENGE-M4-04: Multi-cycle stress upload harness (100 randomized uploads) maintains 0 buffer reallocations', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;
      const initialBufferCount = device.buffers.length;
      const initialStagingBuffer = (engine as any).cloudStagingBuffer;

      const layers: Array<'low' | 'mid' | 'high'> = ['low', 'mid', 'high'];
      const rawData = new Uint16Array(1440 * 721);

      for (let i = 0; i < 100; i++) {
        const layer = layers[i % 3];
        rawData[0] = i; // mutate slightly
        engine.setCloudData(layer, rawData);

        expect(device.buffers.length).toBe(initialBufferCount);
        expect((engine as any).cloudStagingBuffer).toBe(initialStagingBuffer);
      }

      // Verify writeTexture parameters for the last call
      const lastCall = device.queue.writeTextureCalls[device.queue.writeTextureCalls.length - 1];
      expect(lastCall.dataLayout.bytesPerRow).toBe(3072);
      expect(lastCall.dataLayout.rowsPerImage).toBe(721);
      expect(lastCall.size).toEqual({ width: 1440, height: 721, depthOrArrayLayers: 1 });
    });

    it('CHALLENGE-M4-05: Verifies destination offset arithmetic: row r starts at r * 3072 and has 192 bytes padding', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;

      // Unique marker per row in float16
      const testData = new Uint16Array(1440 * 721);
      for (let r = 0; r < 721; r++) {
        testData[r * 1440] = r; // First texel of each row holds row number
      }

      engine.setCloudData('low', testData);

      // Find the writeBuffer call to cloudStagingBuffer
      const stagingWrites = device.queue.writeBufferCalls.filter(
        c => (c.buffer as any) === (engine as any).cloudStagingBuffer
      );
      expect(stagingWrites.length).toBeGreaterThan(0);

      const uploadedData = new Uint8Array(stagingWrites[stagingWrites.length - 1].data as ArrayBuffer);
      expect(uploadedData.byteLength).toBe(2214912);

      // Verify row offsets and padding
      for (let r = 0; r < 721; r++) {
        const rowDstOffset = r * 3072;
        const rowDataView = new DataView(uploadedData.buffer, uploadedData.byteOffset + rowDstOffset, 3072);

        // First texel is 2 bytes holding r
        const firstTexel = rowDataView.getUint16(0, true);
        expect(firstTexel).toBe(r);

        // Bytes 2880 to 3071 must be 0 (padding area: 192 bytes)
        for (let p = 2880; p < 3072; p += 32) {
          expect(rowDataView.getUint8(p)).toBe(0);
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Uniform Buffer 16/256-Byte Alignment (Invariant §24)
  // ==========================================================================
  describe('Pillar 3: Invariant §24 - Uniform Buffer 16/256-Byte Alignment', () => {
    interface UniformField {
      name: string;
      wgslType: string;
      sizeBytes: number;
      alignBytes: number;
      expectedOffset: number;
      floatIndex: number;
    }

    const expectedLayout: UniformField[] = [
      { name: 'u_unfurl', wgslType: 'f32', sizeBytes: 4, alignBytes: 4, expectedOffset: 0, floatIndex: 0 },
      { name: 'u_mode', wgslType: 'u32', sizeBytes: 4, alignBytes: 4, expectedOffset: 4, floatIndex: 1 },
      { name: 'u_theme', wgslType: 'u32', sizeBytes: 4, alignBytes: 4, expectedOffset: 8, floatIndex: 2 },
      { name: 'u_time', wgslType: 'f32', sizeBytes: 4, alignBytes: 4, expectedOffset: 12, floatIndex: 3 },
      { name: 'u_cameraPos', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 16, floatIndex: 4 },
      { name: 'u_viewport', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 32, floatIndex: 8 },
      { name: 'u_cloudDrift', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 48, floatIndex: 12 },
      { name: 'u_layerStandoff', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 64, floatIndex: 16 },
      { name: 'u_layerOpacity', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 80, floatIndex: 20 },
      { name: 'u_layerIndex', wgslType: 'u32', sizeBytes: 4, alignBytes: 4, expectedOffset: 96, floatIndex: 24 },
      { name: 'u_peakExponent', wgslType: 'f32', sizeBytes: 4, alignBytes: 4, expectedOffset: 100, floatIndex: 25 },
      { name: 'u_atmosphericScale', wgslType: 'f32', sizeBytes: 4, alignBytes: 4, expectedOffset: 104, floatIndex: 26 },
      { name: 'u_shadowIntensity', wgslType: 'f32', sizeBytes: 4, alignBytes: 4, expectedOffset: 108, floatIndex: 27 },
      { name: 'u_sunDirection', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 112, floatIndex: 28 },
      { name: 'u_mediumProperties', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 128, floatIndex: 32 },
      { name: 'u_pad', wgslType: 'vec4<f32>', sizeBytes: 16, alignBytes: 16, expectedOffset: 144, floatIndex: 36 },
      { name: 'u_viewMatrix', wgslType: 'mat4x4<f32>', sizeBytes: 64, alignBytes: 16, expectedOffset: 160, floatIndex: 40 },
      { name: 'u_projectionMatrix', wgslType: 'mat4x4<f32>', sizeBytes: 64, alignBytes: 16, expectedOffset: 224, floatIndex: 56 },
    ];

    it('CHALLENGE-M4-06: Verifies exact byte offsets for all CloudUniforms fields, confirming 288 bytes and 16-byte alignment', () => {
      let currentOffset = 0;

      for (const field of expectedLayout) {
        // Natural alignment check
        const alignedOffset = Math.ceil(currentOffset / field.alignBytes) * field.alignBytes;
        expect(alignedOffset).toBe(field.expectedOffset);
        expect(field.expectedOffset / 4).toBe(field.floatIndex);

        // 16-byte boundary check for vectors and matrices
        if (field.alignBytes === 16) {
          expect(alignedOffset % 16).toBe(0);
        }

        currentOffset = alignedOffset + field.sizeBytes;
      }

      // Final struct alignment to 16 bytes
      const structSize = Math.ceil(currentOffset / 16) * 16;
      expect(structSize).toBe(288);
      expect(structSize % 16).toBe(0);

      // Buffer size in WebGPUEngine matches 288 bytes exactly for all 3 uniform buffers
      engine.ensureCloudBuffers();
      const uniformBuffer = engine.getCloudUniformBuffer();
      expect(uniformBuffer?.size).toBe(288);
      expect(engine.cloudUniformBuffers).toBeDefined();
      expect(engine.cloudUniformBuffers?.length).toBe(3);
      for (const buf of engine.cloudUniformBuffers!) {
        expect(buf.size).toBe(288);
      }
    });

    it('CHALLENGE-M4-07: Verifies sub-range uniform update for layer indicators writes at offset 96 with size 16 (96 % 16 == 0)', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;

      // Test layer 0 (Low)
      engine.updateCloudLayerUniform(0);
      let writes = device.queue.writeBufferCalls.filter(c => (c.buffer as any) === engine.getCloudUniformBuffer());
      let lastWrite = writes[writes.length - 1];
      expect(lastWrite.bufferOffset).toBe(96);
      expect(lastWrite.bufferOffset % 16).toBe(0);
      let u32 = new Uint32Array(lastWrite.data as ArrayBuffer);
      let f32 = new Float32Array(lastWrite.data as ArrayBuffer);
      expect(u32[0]).toBe(0); // layerIdx
      expect(f32[1]).toBeCloseTo(1.4, 1); // peakExponent
      expect(f32[2]).toBeCloseTo(1.0, 1); // u_atmosphericScale default
      expect(f32[3]).toBeCloseTo(0.45, 1); // u_shadowIntensity default
      
      // Test layer 1 (Mid)
      engine.updateCloudLayerUniform(1);
      writes = device.queue.writeBufferCalls.filter(c => (c.buffer as any) === engine.getCloudUniformBuffer());
      lastWrite = writes[writes.length - 1];
      u32 = new Uint32Array(lastWrite.data as ArrayBuffer);
      f32 = new Float32Array(lastWrite.data as ArrayBuffer);
      expect(u32[0]).toBe(1); // layerIdx
      expect(f32[1]).toBeCloseTo(1.4, 1); // peakExponent
      expect(f32[2]).toBeCloseTo(1.0, 1); // u_atmosphericScale default
      expect(f32[3]).toBeCloseTo(0.45, 1); // u_shadowIntensity default

      // Test layer 2 (High)
      engine.updateCloudLayerUniform(2);
      writes = device.queue.writeBufferCalls.filter(c => (c.buffer as any) === engine.getCloudUniformBuffer());
      lastWrite = writes[writes.length - 1];
      expect(lastWrite.bufferOffset).toBe(96);
      u32 = new Uint32Array(lastWrite.data as ArrayBuffer);
      f32 = new Float32Array(lastWrite.data as ArrayBuffer);
      expect(u32[0]).toBe(2); // layerIdx
      expect(f32[1]).toBeCloseTo(1.4, 1); // peakExponent
      expect(f32[2]).toBeCloseTo(1.0, 1); // u_atmosphericScale default
      expect(f32[3]).toBeCloseTo(0.45, 1); // u_shadowIntensity default
    });

    it('CHALLENGE-M4-07B: updateCloudUniforms populates all 3 dedicated uniform buffers', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;
      const initialWrites = device.queue.writeBufferCalls.length;
      const params = createStrictFrameParams();
      engine.updateCloudUniforms(0.016, params);

      expect(engine.cloudUniformBuffers).toBeDefined();
      expect(engine.cloudUniformBuffers?.length).toBe(3);

      for (let layerIdx = 0; layerIdx < 3; layerIdx++) {
        const targetBuffer = engine.cloudUniformBuffers![layerIdx];
        const writes = device.queue.writeBufferCalls.slice(initialWrites).filter(c => (c.buffer as any) === targetBuffer);
        expect(writes.length).toBe(1);
        expect(writes[0].bufferOffset).toBe(0);
        expect((writes[0].data as ArrayBuffer).byteLength).toBe(288);
      }
    });
  });

  // ==========================================================================
  // Pillar 4: 10,000-Iteration Rapid Theme Hot-Switch Stress (Invariant §24)
  // ==========================================================================
  describe('Pillar 4: Invariant §24 - 10,000-Iteration Rapid Theme Hot-Switch Stress', () => {
    it('CHALLENGE-M4-08: Simulates 10,000 rapid theme hot-switches and parameter updates with ZERO pipeline recreations', () => {
      engine.ensureCloudBuffers();
      const device = (engine as any).device as MockGPUDevice;

      const initialPipeline = (engine as any).cloudPipeline;
      expect(initialPipeline).toBeDefined();

      // Spy on createRenderPipeline to catch any rogue compilation calls
      const createPipelineSpy = vi.spyOn(device, 'createRenderPipeline');

      let nanCount = 0;
      let infCount = 0;
      const initialBufferWriteCount = device.queue.writeBufferCalls.length;

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);

      // Execute 10,000 rapid hot-switches across Themes 0, 1, 2 with randomized parameters
      const ITERATIONS = 10_000;
      for (let i = 0; i < ITERATIONS; i++) {
        const theme = (i % 3) as 0 | 1 | 2;
        const unfurl = Math.random();
        const mode = (i % 5);
        const time = i * 0.016;
        const dt = 0.016 + (Math.random() - 0.5) * 0.004;

        // Fuzz camera position
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI;
        const r = 10.0 + Math.random() * 15.0;
        camera.position.set(r * Math.cos(phi) * Math.sin(theta), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(theta));
        camera.updateMatrixWorld();

        const params: WebGPUFrameParams = createStrictFrameParams({
          theme,
          unfurl,
          mode,
          time,
          dt,
          camera,
          cloudDriftSpeed: 0.1 + Math.random() * 4.0,
          cloudOpacity: Math.random(),
          displacementScale: 0.01 + Math.random() * 0.05,
          paperTooth: Math.random(),
        });

        engine.updateCloudUniforms(dt, params);

        // Check internal float array for NaN or Inf
        const floats = (engine as any).cloudUniformFloats as Float32Array;
        for (let j = 0; j < 64; j++) {
          if (Number.isNaN(floats[j])) nanCount++;
          if (!Number.isFinite(floats[j])) infCount++;
        }
      }

      // Assertions:
      // 1. Zero pipeline recreations
      expect(createPipelineSpy).toHaveBeenCalledTimes(0);
      expect((engine as any).cloudPipeline).toBe(initialPipeline);

      // 2. Uniform buffers were updated on every iteration (all 3 layer buffers per update)
      const finalBufferWriteCount = device.queue.writeBufferCalls.length;
      expect(finalBufferWriteCount - initialBufferWriteCount).toBe(ITERATIONS * 3);

      // 3. Zero numerical corruption across 640,000 float values checked
      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 5: Procedural Cloud Data Generation Stability (Invariant §15 / Boundary)
  // ==========================================================================
  describe('Pillar 5: Procedural Cloud Data Generation Stability', () => {
    it('CHALLENGE-M4-09: generateProceduralCloudBuffer generates exact 2,076,480-byte valid Float16 buffers with 0 NaNs and values in [0, 1]', () => {
      const layers: Array<'low' | 'mid' | 'high'> = ['low', 'mid', 'high'];

      for (const layer of layers) {
        const buffer = engine.generateProceduralCloudBuffer(layer);
        expect(buffer.byteLength).toBe(1440 * 721 * 2); // 2,076,480 bytes

        const u16 = new Uint16Array(buffer);
        expect(u16.length).toBe(1440 * 721); // 1,038,240 texels

        let nanCount = 0;
        let infCount = 0;
        let outOfRangeCount = 0;

        // Spot-check 10,000 texels
        for (let k = 0; k < 10_000; k++) {
          const idx = Math.floor(Math.random() * u16.length);
          const val = decodeFloat16(u16[idx]);

          if (Number.isNaN(val)) nanCount++;
          if (!Number.isFinite(val)) infCount++;
          if (val < -1e-5 || val > 1.00001) outOfRangeCount++;
        }

        expect(nanCount).toBe(0);
        expect(infCount).toBe(0);
        expect(outOfRangeCount).toBe(0);
      }
    });
  });

  // ==========================================================================
  // Pillar 6: Invariant §20 (Resource Destruction & Zero VRAM Leaks)
  // ==========================================================================
  describe('Pillar 6: Invariant §20 - Resource Destruction & Zero VRAM Leaks', () => {
    it('CHALLENGE-M4-10: dispose() destroys all 6 cloud buffers and 3 textures, resetting state to uninitialized', () => {
      const device = (engine as any).device as MockGPUDevice;
      const initialTextures = device.textures.length;
      engine.ensureCloudBuffers();
      expect(device.buffers.length).toBe(11);
      expect(device.textures.length).toBe(initialTextures + 3);

      engine.dispose();

      expect(engine.initialized).toBe(false);
      expect(engine.cloudBuffersInitialized).toBe(false);
      expect(engine.getCloudUniformBuffer()).toBeNull();
      expect(engine.cloudUniformBuffers).toBeNull();
      expect((engine as any).cloudStagingBuffer).toBeNull();
      expect((engine as any).cloudSphereVertexBuffer).toBeNull();
      expect((engine as any).cloudSphereIndexBuffer).toBeNull();
      expect(engine.cloudTextures.low).toBeNull();
      expect(engine.cloudTextures.mid).toBeNull();
      expect(engine.cloudTextures.high).toBeNull();
      expect((engine as any).cloudPipeline).toBeNull();
      expect((engine as any).cloudSampler).toBeNull();
      expect((engine as any).cloudBindGroups).toBeNull();
      expect(device.buffers.length).toBe(0);
      expect(device.textures.length).toBe(0);
    });
  });
});
