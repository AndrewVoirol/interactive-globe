// ============================================================================
// File: tests/modern/r17-dem-16bit-ingestion.test.ts
// Test Tier: Modern / Stage 1 True 16-Bit Texture Ingestion (rgba16float)
// Description: Validates elimination of 8-bit down-quantization fallback (u16 >> 8),
//              enforces rgba16float GPU texture format, 256-byte row pitch alignment,
//              and verifies sub-meter vertical precision (zero 34.6m flat plateaus).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { decodeFloat16, encodeFloat16 } from '../../src/core/math/float16';

describe('R17 Stage 1: True 16-Bit Texture Ingestion (rgba16float)', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

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
    };
    return {
      width,
      height,
      getContext: vi.fn((type: string) => {
        if (type === 'webgpu') return mockContext;
        return null;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;
  }

  function createEngineConfig(pointCount = 100, lineCount = 10): WebGPUInitConfig {
    const canvas = createMockCanvas(1920, 1080);
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

  beforeEach(() => {
    setupMockNavigator();
  });

  afterEach(() => {
    restoreMockNavigator();
  });

  describe('1. Static Code Analysis & Ingestion Architecture', () => {
    it('R17-INGEST-01: verifies elimination of 8-bit down-quantization (u16 >> 8) in loadDEMTexture', () => {
      // Must NOT contain the destructive 8-bit shift
      expect(engineSrc).not.toContain('u8[i] = u16[i] >> 8;');
      // Must NOT contain rgba16unorm probe
      expect(engineSrc).not.toContain("this.device.pushErrorScope('validation');");
      // Must format 16-bit DEM as rgba16float
      expect(engineSrc).toContain("format: 'rgba16float'");
      // Must preserve cpuDEMData as Uint16Array for 16-bit precision
      expect(engineSrc).toContain('this.cpuDEMData = isU16 ? new Uint16Array(urlOrBuffer) : new Uint8Array(urlOrBuffer);');
    });

    it('R17-INGEST-02: verifies 256-byte row pitch GPU memory alignment calculation', () => {
      expect(engineSrc).toContain('const rawRowBytes = m.width * 8;');
      expect(engineSrc).toContain('const paddedRowBytes = Math.ceil(rawRowBytes / 256) * 256;');
      expect(engineSrc).toContain('{ bytesPerRow: paddedRowBytes, rowsPerImage: m.height }');
    });
  });

  describe('2. Runtime Ingestion & Sub-Meter Vertical Precision', () => {
    it('R17-INGEST-03: ingests 16-bit DEM buffer and creates rgba16float GPU texture', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 10);
      await engine.initialize(config);

      // Create synthetic 2048x1024 u16 buffer (16 MB)
      const u16Buffer = new ArrayBuffer(2048 * 1024 * 4 * 2);
      await engine.loadDEMTexture(u16Buffer);

      const texture = engine.getDEMTexture();
      expect(texture).toBeDefined();
      expect(texture?.format).toBe('rgba16float');
      expect(texture?.width).toBe(2048);
      expect(texture?.height).toBe(1024);

      // Verify cpuDEMData retains 16-bit type
      expect(engine.cpuDEMData).toBeInstanceOf(Uint16Array);
      expect(engine.cpuDEMData.byteLength).toBe(u16Buffer.byteLength);

      engine.dispose();
    });

    it('R17-INGEST-04: verifies consecutive 1.0m elevation steps produce distinct, monotonically increasing values with error < 0.1m', () => {
      // In ETOPO DEM encoding:
      // Land elevation: 0m to 8848m -> channel R = round((elev / 8848.0) * 65535)
      // Test coastal elevation ramp from 1.0m to 35.0m in 1.0m increments
      const Z_MAX_LAND = 8848.0;
      const nominalElevations: number[] = [];
      const decodedElevations: number[] = [];

      for (let h = 1.0; h <= 35.0; h += 1.0) {
        nominalElevations.push(h);
        const u16Val = Math.round((h / Z_MAX_LAND) * 65535.0);
        // Encode via LUT formula (encodeFloat16(u16Val / 65535.0))
        const f16Bits = encodeFloat16(u16Val / 65535.0);
        // Decode float16
        const sampledNormalized = decodeFloat16(f16Bits);
        const decodedElev = sampledNormalized * Z_MAX_LAND;
        decodedElevations.push(decodedElev);
      }

      // 1. Verify all consecutive steps are strictly distinct and monotonically increasing
      for (let i = 1; i < decodedElevations.length; i++) {
        expect(decodedElevations[i]).toBeGreaterThan(decodedElevations[i - 1]);
      }

      // 2. Verify elevation recovery error is < 0.1m across all tested steps
      for (let i = 0; i < decodedElevations.length; i++) {
        const errorMeters = Math.abs(decodedElevations[i] - nominalElevations[i]);
        expect(errorMeters).toBeLessThan(0.10);
      }

      // 3. Verify zero 34.6m flat plateaus: in 8-bit quantization (u16 >> 8),
      // all elevations 1..34m would collapse to 0.0m. Here, 35 distinct values exist.
      const uniqueDecoded = new Set(decodedElevations);
      expect(uniqueDecoded.size).toBe(35);
    });
  });
});
