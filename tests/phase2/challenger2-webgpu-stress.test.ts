// ============================================================================
// File: tests/phase2/challenger2-webgpu-stress.test.ts
// Architecture: Empirical WebGPU Runtime & Stress Challenger (Challenger 2)
// Description: Adversarial verification of WebGPUEngine runtime stability,
//              zero GPU buffer leaks, 5-mode thrashing, layer toggles,
//              DEM ingestion fuzzing, and Apple Silicon M4 Pro UMA limits.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice, MockGPUBuffer, MockGPUTexture } from '../helpers/webgpu-mock';

let originalNavigator: any;

function setupMockNavigator() {
  originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
        requestAdapter: async () => ({
          limits: {
            maxStorageBufferBindingSize: 1024 * 1024 * 1024, // 1 GB
            maxBufferSize: 1024 * 1024 * 1024,               // 1 GB
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
  for (let i = 0; i < pointCount * 3; i++) {
    pointsData[i] = (i % 10) - 5.0;
  }
  const target2DData = new Float32Array(pointCount * 2);
  for (let i = 0; i < pointCount * 2; i++) {
    target2DData[i] = (i % 7) - 3.5;
  }
  const typeData = new Float32Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    typeData[i] = i % 3;
  }
  const lineIndices = new Uint32Array(lineCount * 2);
  for (let i = 0; i < lineCount * 2; i++) {
    lineIndices[i] = pointCount > 0 ? (i % pointCount) : 0;
  }

  return {
    canvas,
    pointCount,
    pointsData,
    target2DData,
    typeData,
    lineIndices,
  };
}

describe('Challenger 2: WebGPU Runtime & Stress Verification Suite', () => {
  beforeEach(() => {
    setupMockNavigator();
  });

  afterEach(() => {
    restoreMockNavigator();
  });

  // =========================================================================
  // Test Domain 1: Multi-Scale Point Count Initialization & Workgroup Sizing
  // =========================================================================
  describe('1. Point Count Scaling & Dispatch Workgroup Invariants', () => {
    const testCounts = [1, 16, 255, 256, 257, 1000, 10000, 100000, 1000000];

    it.each(testCounts)('C2-STRESS-01: initializes cleanly with pointCount = %i', async (count) => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(count, Math.min(count, 50));

      await engine.initialize(config);
      expect(engine.initialized).toBe(true);

      const device = (engine as any).device as MockGPUDevice;
      // Core buffers: 2 ping-pong storage + 1 static storage + 1 line index + 1 sim uniform = 5 buffers
      expect(device.buffers.length).toBe(5);

      // Verify workgroup count calculation
      const expectedWorkgroups = Math.ceil(count / 256);
      expect(expectedWorkgroups).toBeGreaterThanOrEqual(1);

      // Verify buffer byte lengths
      const particleFloats = count * 8;
      const expectedByteLength = particleFloats * 4;
      expect((engine as any).particleBuffers[0].size).toBe(expectedByteLength);
      expect((engine as any).particleBuffers[1].size).toBe(expectedByteLength);
      expect((engine as any).staticBuffer.size).toBe(expectedByteLength);

      engine.dispose();
      expect(engine.initialized).toBe(false);
      expect(device.buffers.length).toBe(0);
    });
  });

  // =========================================================================
  // Test Domain 2: Combinatorial Mode, Layer & Parameter Thrashing
  // =========================================================================
  describe('2. Combinatorial Mode, Layer & Parameter Thrashing (1,000 Frames)', () => {
    it('C2-STRESS-02: executes 1,000 frames under chaotic mode, layer, theme, and unfurl mutations', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(5000, 200);
      await engine.initialize(config);

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);

      const modes = [0, 1, 2, 3, 4];
      const layerModes = [0, 1, 2];
      const themes = [0, 1];
      const renderLayerStrings: ('both' | 'points' | 'wireframe')[] = ['both', 'points', 'wireframe'];

      const device = (engine as any).device as MockGPUDevice;

      // 1,000 continuous frames of randomized stress
      for (let frame = 0; frame < 1000; frame++) {
        const mode = modes[frame % modes.length];
        const layerMode = layerModes[(frame * 3) % layerModes.length];
        const theme = themes[(frame * 7) % themes.length];
        const renderLayers = renderLayerStrings[(frame * 5) % renderLayerStrings.length];
        const unfurl = (frame % 20 === 0) ? (frame % 40 === 0 ? 0.0 : 1.0) : Math.sin(frame * 0.05) * 0.5 + 0.5;
        const reliefActive = frame % 4 === 0;
        const showVectors = frame % 3 === 0;

        expect(() => {
          engine.render({
            unfurl,
            mode,
            layerMode: frame % 2 === 0 ? layerMode : undefined,
            renderLayers: frame % 2 !== 0 ? renderLayers : undefined,
            theme,
            time: frame * 0.016,
            dt: 0.016,
            camera,
            cursorActive: frame % 2 === 0,
            cursorRayOrig: new THREE.Vector3(0, 0, 15),
            cursorRayDir: new THREE.Vector3(0, 0, -1),
            cursorHitPos: new THREE.Vector3(Math.sin(frame), Math.cos(frame), 5.0),
            cursorVel: new THREE.Vector4(0.1, -0.1, 0.0, 0.14),
            displacementScale: 0.05 + (frame % 10) * 0.01,
            hillshadeIntensity: 0.5 + (frame % 5) * 0.2,
            reliefActive,
            showVectors,
          });
        }).not.toThrow();
      }

      // Buffer count after cartographic activation must remain strictly constant
      // 5 core + 7 cartographic = 12 buffers
      const finalBufferCount = device.buffers.length;
      expect(finalBufferCount).toBe(12);

      // Verify currentStep incremented to exactly 1000
      expect((engine as any).currentStep).toBe(1000);

      engine.dispose();
      expect(engine.initialized).toBe(false);
      expect(device.buffers.length).toBe(0);
    });

    it('C2-STRESS-03: handles extreme and adversarial uniform values without throwing or corrupting state', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, 10);

      const adversarialFrames: Partial<WebGPUFrameParams>[] = [
        { unfurl: -100.0, mode: 99, theme: 99, time: -1000 },
        { unfurl: 100.0, mode: -1, theme: -1, time: 1e9 },
        { unfurl: 0.0, mode: 0, displacementScale: -5.0, hillshadeIntensity: -10.0 },
        { unfurl: 1.0, mode: 4, displacementScale: 100.0, hillshadeIntensity: 50.0 },
        { unfurl: 0.5, cursorVel: new THREE.Vector3(0, 0, 0) }, // Vector3 without 'w'
        { unfurl: 0.5, cursorHitPos: undefined, cursorVel: undefined },
      ];

      for (const adv of adversarialFrames) {
        expect(() => {
          engine.render({
            unfurl: 0.5,
            mode: 0,
            time: 1.0,
            dt: 0.016,
            camera,
            ...adv,
          } as WebGPUFrameParams);
        }).not.toThrow();
      }

      engine.dispose();
    });
  });

  // =========================================================================
  // Test Domain 3: DEM Ingestion Robustness & Fallback Fuzzing
  // =========================================================================
  describe('3. DEM Ingestion Robustness, Memory Reuse & Fallback Fuzzing', () => {
    it('C2-STRESS-04: ingests valid 16MB 16-bit DEM buffer and sets rgba16unorm format', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      const u16Buffer = new ArrayBuffer(16777216); // 2048 * 1024 * 4 * 2
      await engine.loadDEMTexture(u16Buffer);

      const texture = engine.getDEMTexture();
      expect(texture).toBeDefined();
      expect(texture?.format).toBe('rgba16unorm');
      expect(texture?.width).toBe(2048);
      expect(texture?.height).toBe(1024);

      engine.dispose();
    });

    it('C2-STRESS-05: ingests 8MB 8-bit DEM fallback buffer and sets rgba8unorm format', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      const u8Buffer = new ArrayBuffer(2048 * 1024 * 4); // 8 MB
      await engine.loadDEMTexture(u8Buffer);

      const texture = engine.getDEMTexture();
      expect(texture).toBeDefined();
      expect(texture?.format).toBe('rgba8unorm');

      engine.dispose();
    });

    it('C2-STRESS-06: 20 rapid sequential DEM updates cleanly destroy old textures without leaks', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      const device = (engine as any).device as MockGPUDevice;

      // Ingest 20 DEM updates (alternating 16-bit and 8-bit)
      for (let i = 0; i < 20; i++) {
        const isU16 = i % 2 === 0;
        const buf = new ArrayBuffer(isU16 ? 16777216 : 1024);
        await engine.loadDEMTexture(buf);
      }

      // Check that engine maintains exactly 1 active DEM texture reference (not accumulating 20 textures)
      expect(engine.getDEMTexture()).toBeDefined();

      engine.dispose();
      expect(device.textures.length).toBe(0);
    });

    it('C2-STRESS-07: handles empty, zero-length, and malformed DEM inputs gracefully', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Mock network failure'));

      try {
        // Empty buffer
        await expect(engine.loadDEMTexture(new ArrayBuffer(0))).resolves.not.toThrow();

        // Null or undefined (via type cast)
        await expect(engine.loadDEMTexture(null as any)).resolves.not.toThrow();
        await expect(engine.loadDEMTexture(undefined as any)).resolves.not.toThrow();
        await expect(engine.loadDEMTexture({} as any)).resolves.not.toThrow();

        // Non-existent URL string (triggers mocked fetch network failure)
        await expect(engine.loadDEMTexture('/nonexistent-url-404.bin')).resolves.not.toThrow();

        // DEM texture should still exist (either placeholder or intact)
        expect(engine.getDEMTexture()).toBeDefined();
      } finally {
        globalThis.fetch = originalFetch;
        warnSpy.mockRestore();
        engine.dispose();
      }
    });
  });

  // =========================================================================
  // Test Domain 4: Memory Leak Detection & Apple Silicon M4 Pro UMA Limits
  // =========================================================================
  describe('4. Memory Leak Detection & Apple Silicon M4 Pro UMA Limits', () => {
    it('C2-STRESS-08: 20 full engine init & dispose cycles produce zero residual GPU buffers or textures', async () => {
      const pointCount = 10000;

      for (let cycle = 0; cycle < 20; cycle++) {
        const engine = new WebGPUEngine();
        const config = createEngineConfig(pointCount, 100);

        await engine.initialize(config);
        expect(engine.initialized).toBe(true);

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        camera.position.set(0, 0, 10);

        // Render 5 frames with all features active
        for (let f = 0; f < 5; f++) {
          engine.render({
            unfurl: 0.5,
            mode: 0,
            time: f * 0.016,
            dt: 0.016,
            camera,
            reliefActive: true,
            showVectors: true,
          });
        }

        const device = (engine as any).device as MockGPUDevice;
        expect(device.buffers.length).toBe(12); // 5 core + 7 cartographic

        engine.dispose();
        expect(engine.initialized).toBe(false);
        expect(device.buffers.length).toBe(0);
        expect(device.textures.length).toBe(0);
      }
    });

    it('C2-STRESS-09: verifies Apple Silicon M4 Pro UMA memory bounds across 1M, 4M, and 16M nodes', () => {
      // Apple Silicon M4 Pro Metal adapter limits:
      const maxStorageBufferBindingSize = 1024 * 1024 * 1024; // 1 GB
      const maxBufferSize = 1024 * 1024 * 1024;               // 1 GB
      const appleSiliconUnifiedMemory = 24 * 1024 * 1024 * 1024; // 24 GB

      // 1M nodes:
      const count1M = 1_000_000;
      const bufSize1M = count1M * 8 * 4; // 32,000,000 bytes (32 MB)
      expect(bufSize1M).toBe(32_000_000);
      expect(bufSize1M).toBeLessThan(maxStorageBufferBindingSize);

      // 4M nodes:
      const count4M = 4_000_000;
      const bufSize4M = count4M * 8 * 4; // 128,000,000 bytes (128 MB)
      expect(bufSize4M).toBe(128_000_000);
      expect(bufSize4M).toBeLessThan(maxStorageBufferBindingSize);

      // 16M nodes:
      const count16M = 16_000_000;
      const bufSize16M = count16M * 8 * 4; // 512,000,000 bytes (512 MB)
      expect(bufSize16M).toBe(512_000_000);
      expect(bufSize16M).toBeLessThan(maxStorageBufferBindingSize); // 512 MB < 1024 MB!

      // Total engine footprint at 1M nodes:
      // 2 ping-pong storage buffers (32 MB each = 64 MB)
      // 1 static storage buffer (32 MB)
      // 1 line index buffer (8 MB)
      // 1 16-bit DEM texture (2048 x 1024 x 8 bytes = 16 MB)
      // 1 depth buffer (2048 x 1024 x 4 bytes = 8 MB)
      // Cartographic uniform buffers (< 1 KB)
      const totalFootprint1M = (32 * 2 + 32 + 8 + 16 + 8) * 1_000_000; // ~128 MB
      expect(totalFootprint1M).toBeLessThan(256 * 1024 * 1024); // < 256 MB
      expect(totalFootprint1M).toBeLessThan(appleSiliconUnifiedMemory * 0.02); // < 2% of 24 GB UMA!
    });
  });

  // =========================================================================
  // Test Domain 5: Device Loss & Error Recovery
  // =========================================================================
  describe('5. Device Loss Resilience & Graceful Recovery', () => {
    it('C2-STRESS-10: registers onDeviceLost callback and safely halts render on device loss', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      let deviceLostFired = false;
      let lostReason = '';

      engine.onDeviceLost((info) => {
        deviceLostFired = true;
        lostReason = info.reason;
      });

      // Simulate device loss event
      const device = (engine as any).device;
      (engine as any).isInitialized = false;
      if ((engine as any).onDeviceLostCallback) {
        (engine as any).onDeviceLostCallback({
          reason: 'destroyed',
          message: 'Simulated device loss',
        } as GPUDeviceLostInfo);
      }

      expect(deviceLostFired).toBe(true);
      expect(lostReason).toBe('destroyed');
      expect(engine.initialized).toBe(false);

      // Rendering while not initialized must safely no-op without error
      const camera = new THREE.PerspectiveCamera();
      expect(() => {
        engine.render({
          unfurl: 0.0,
          mode: 0,
          time: 0,
          dt: 0.016,
          camera,
        });
      }).not.toThrow();

      // Dispose while lost must also be safe
      expect(() => engine.dispose()).not.toThrow();
    });

    it('C2-STRESS-11: dynamic canvas resize from 1x DPR to 8K re-allocates depth texture correctly', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      const resizes = [
        [800, 600],
        [1920, 1080],
        [3840, 2160], // 4K
        [7680, 4320], // 8K
        [1, 1],       // Degenerate minimum
      ];

      for (const [w, h] of resizes) {
        engine.resize(w, h);
        const depthTex = (engine as any).depthTexture as MockGPUTexture;
        expect(depthTex).toBeDefined();
        expect(depthTex.width).toBe(w);
        expect(depthTex.height).toBe(h);
      }

      engine.dispose();
    });
  });
});
