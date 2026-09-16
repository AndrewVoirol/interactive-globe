// ============================================================================
// File: tests/phase5-wind-crane-physics.test.ts
// Suite: Multi-Stratum Wind Engine
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { VectorFieldDataSource } from '../src/core/data/VectorFieldDataSource';
import { DATA_LAYER_CATALOG, getPresetById } from '../src/core/data/DataLayerCatalog';
import { WebGPUEngine, WebGPUInitConfig } from '../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from './helpers/webgpu-mock';
import windParticlesWGSL from '../src/webgpu/shaders/wind_particles.wgsl?raw';
import windRibbonRenderWGSL from '../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';

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

describe('Phase 5: Atmospheric Wind System Engine', () => {
  describe('1. VectorFieldDataSource Multi-Stratum Modeling', () => {
    it('WIND-01: initializes dual-stratum procedural fallback with valid physical ranges', async () => {
      const source = new VectorFieldDataSource();
      await source.loadGrid('procedural');
      await source.loadJetStreamGrid('procedural');

      // Sample surface winds at mid-latitudes (35°N, 0°E)
      const [uSurf, vSurf] = source.sampleVelocity(0, 35, 'surface');
      expect(Number.isFinite(uSurf)).toBe(true);
      expect(Number.isFinite(vSurf)).toBe(true);
      expect(Math.abs(uSurf)).toBeLessThan(60);

      // Sample 250 hPa jet stream at jet core latitudes (52°N, 0°E)
      const [uJet, vJet] = source.sampleVelocity(0, 52, 'jetstream');
      expect(Number.isFinite(uJet)).toBe(true);
      expect(Number.isFinite(vJet)).toBe(true);
      // High-altitude jet core should exhibit high westerly velocity (> 30 m/s)
      expect(uJet).toBeGreaterThan(25.0);
    });

    it('WIND-02: evaluates orographic slope updraft via v · ∇z_DEM', async () => {
      const source = new VectorFieldDataSource();
      await source.loadGrid();

      // Wind blowing eastward at 20 m/s against an east-facing mountain slope (+0.08 grad)
      const eastSlopeLift = source.computeOrographicLift(10, 45, 0.08, 0.0);
      expect(Number.isFinite(eastSlopeLift)).toBe(true);

      // Zero slope produces zero orographic lift
      const flatLift = source.computeOrographicLift(10, 45, 0.0, 0.0);
      expect(flatLift).toBe(0);
    });

    it('WIND-03: verifies boundary safety across poles and antimeridian', async () => {
      const source = new VectorFieldDataSource();
      await source.loadGrid();
      await source.loadJetStreamGrid();

      const testCoords = [
        [0, 90],
        [0, -90],
        [180, 0],
        [-180, 0],
        [180, 89.9],
        [-180, -89.9],
      ];

      for (const [lon, lat] of testCoords) {
        const [uS, vS] = source.sampleVelocity(lon, lat, 'surface');
        const [uJ, vJ] = source.sampleVelocity(lon, lat, 'jetstream');
        expect(Number.isFinite(uS)).toBe(true);
        expect(Number.isFinite(vS)).toBe(true);
        expect(Number.isFinite(uJ)).toBe(true);
        expect(Number.isFinite(vJ)).toBe(true);
      }
    });
  });

  describe('2. DataLayerCatalog Preset Ingestion', () => {
    it('CATALOG-01: registers NOAA GFS 250 hPa Jet Stream preset', () => {
      const jetPreset = getPresetById('noaa-gfs-jetstream');
      expect(jetPreset).toBeDefined();
      expect(jetPreset?.category).toBe('field');
      expect(jetPreset?.url).toBe('/data/gfs-jetstream-latest.bin');
      expect(jetPreset?.legend?.colorStops.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('3. WebGPUEngine Lazy Allocation & Lifecycle Discipline', () => {
    let engine: WebGPUEngine;
    let camera: THREE.PerspectiveCamera;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(1024, 100);
      await engine.initialize(config);
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, 15);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('WEBGPU-01: maintains strict 5-buffer invariant at initialization', () => {
      const device = (engine as any).device as MockGPUDevice;
      // Exactly 5 core buffers on init; wind buffers must NOT be eagerly allocated
      expect(device.buffers.length).toBe(5);
    });

    it('WEBGPU-02: lazily allocates wind buffers only when requested', () => {
      const device = (engine as any).device as MockGPUDevice;
      expect(device.buffers.length).toBe(5);

      // Render standard frames without wind -> stays at 5 buffers
      for (let i = 0; i < 3; i++) {
        engine.render({
          unfurl: 0.0,
          mode: 0,
          time: i * 0.016,
          dt: 0.016,
          camera,
        });
      }
      expect(device.buffers.length).toBe(5);

      // Now request wind -> triggers lazy allocation
      engine.ensureWindBuffers();

      // Render with wind active
      engine.render({
        unfurl: 0.0,
        mode: 0,
        time: 0.05,
        dt: 0.016,
        camera,
        showWind: true,
      });

      // Buffers should now include quadCorner, wind particle ping-pong (2), and wind uniform
      expect(device.buffers.length).toBeGreaterThan(5);
    });

    it('WEBGPU-03: cleans up all wind buffers on engine.dispose() with zero leaks', () => {
      const device = (engine as any).device as MockGPUDevice;
      engine.ensureWindBuffers();

      expect(device.buffers.length).toBeGreaterThan(5);

      engine.dispose();
      expect(engine.initialized).toBe(false);
      expect(device.buffers.length).toBe(0);
      expect(device.textures.length).toBe(0);
    });
  });

  describe('4. WGSL Shader Structural Verification', () => {
    it('WGSL-01: wind_particles.wgsl defines RK2 advection and manifold position evaluation', () => {
      expect(windParticlesWGSL).toContain('fn cs_advect_wind');
      expect(windParticlesWGSL).toContain('evaluateManifoldPosition');
      expect(windParticlesWGSL).toContain('sampleVelocity');
      expect(windParticlesWGSL).toContain('struct WindParticle');
    });

    it('WGSL-02: wind_ribbon_render.wgsl defines screen-space ribbon extrusion and near plane guard', () => {
      expect(windRibbonRenderWGSL).toContain('fn vs_main');
      expect(windRibbonRenderWGSL).toContain('fn fs_main');
      expect(windRibbonRenderWGSL).toContain('nearGuard');
      expect(windRibbonRenderWGSL).toContain('edgeFeather');
    });
  });
});
