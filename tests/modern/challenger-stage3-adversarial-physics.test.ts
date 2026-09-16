// ============================================================================
// File: tests/modern/challenger-stage3-adversarial-physics.test.ts
// Architecture: STAGE 3 Empirical Adversarial Physics & Clearance Stress Suite
// Description: Adversarial generator, oracles, and stress harnesses for
//              extreme elevation clearance, CPU DEM sampling, and procedural fallbacks.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGPUEngine, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
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

describe('STAGE 3 Challenger: Physics Aerodynamics & Clearance Stress', () => {
  describe('CPU Elevation Sampling Accuracy & Procedural Barrier Fallbacks', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(1024, 100);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('CHALLENGE-CPU-01: Central Andes ridge fallback accurately resolves crest and slope asymmetry', () => {
      // Andes domain: lonDeg in [-74.0, -64.0], latDeg in [-56.0, 12.0], ridge at -68.5°W
      // Crest at -68.5°W:
      const crest = engine.sampleCPUElevation(-68.5, -32.5);
      expect(crest.elevationMeters).toBeCloseTo(5000.0, 0); // 1500 + 3500 * exp(0) = 5000
      expect(crest.gradEast).toBe(0.22);

      // Windward side (West of crest, -70.0°W):
      const windward = engine.sampleCPUElevation(-70.0, -32.5);
      expect(windward.elevationMeters).toBeGreaterThan(1500.0);
      expect(windward.elevationMeters).toBeLessThan(crest.elevationMeters);
      expect(windward.gradEast).toBe(0.22); // Positive windward slope facing westerlies

      // Leeward side (East of crest, -67.0°W):
      const leeward = engine.sampleCPUElevation(-67.0, -32.5);
      expect(leeward.elevationMeters).toBeGreaterThan(1500.0);
      expect(leeward.elevationMeters).toBeLessThan(crest.elevationMeters);
      expect(leeward.gradEast).toBe(-0.15); // Negative leeward slope

      // Beyond Andes domain (e.g. -60.0°W, -32.5°S): falls back to 0
      const beyond = engine.sampleCPUElevation(-60.0, -32.5);
      expect(beyond.elevationMeters).toBe(0);
      expect(beyond.gradEast).toBe(0);
      expect(beyond.gradNorth).toBe(0);
    });

    it('CHALLENGE-CPU-02: Bilinear vs Nearest-Neighbor CPU DEM behavior analysis', () => {
      // When cpuDEMData is present, test sampling resolution and derivatives
      // Create synthetic 2048x1024 DEM buffer (Uint8Array)
      const W = 2048;
      const H = 1024;
      const syntheticBuffer = new ArrayBuffer(W * H * 4);
      const u8 = new Uint8Array(syntheticBuffer);

      // Write a high-elevation mountain at pixel (px=1000, py=500)
      // RGBA: R = elevation (0..255), B = land mask (> 115)
      const idx = (500 * W + 1000) * 4;
      u8[idx] = 200; // elevation ~ (200 / 255) * 8848 = 6939m
      u8[idx + 2] = 255; // Land mask = true

      (engine as any).cpuDEMData = u8;

      // Sample directly at pixel center
      const lon = (1000 / W) * 360.0 - 180.0;
      const lat = (0.5 - 500 / H) * 180.0;
      const sample = engine.sampleCPUElevation(lon, lat);

      expect(sample.elevationMeters).toBeGreaterThan(6000.0);
      expect(Number.isFinite(sample.gradEast)).toBe(true);
      expect(Number.isFinite(sample.gradNorth)).toBe(true);

      // Clean up
      (engine as any).cpuDEMData = null;
    });

    it('CHALLENGE-CPU-03: Boundary safety across antimeridian and polar singularities', () => {
      const boundaryPoints = [
        { lon: 180.0, lat: 0.0 },
        { lon: -180.0, lat: 0.0 },
        { lon: 0.0, lat: 90.0 },
        { lon: 0.0, lat: -90.0 },
        { lon: 179.99, lat: 89.99 },
        { lon: -179.99, lat: -89.99 },
        { lon: 540.0, lat: 0.0 }, // Wrapped > 360
        { lon: -540.0, lat: 0.0 }, // Wrapped < -360
      ];

      for (const pt of boundaryPoints) {
        const sample = engine.sampleCPUElevation(pt.lon, pt.lat);
        expect(Number.isFinite(sample.elevationMeters)).toBe(true);
        expect(Number.isFinite(sample.gradEast)).toBe(true);
        expect(Number.isFinite(sample.gradNorth)).toBe(true);
      }
    });
  });
});
