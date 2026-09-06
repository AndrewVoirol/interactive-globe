// ============================================================================
// File: tests/phase5-wind-crane-physics.test.ts
// Suite: Multi-Stratum Wind & Autonomous Origami Paper Crane Flight Engine
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { VectorFieldDataSource } from '../src/core/data/VectorFieldDataSource';
import { OrigamiCraneFlightSolver } from '../src/core/physics/OrigamiCraneFlightSolver';
import { DATA_LAYER_CATALOG, getPresetById } from '../src/core/data/DataLayerCatalog';
import { WebGPUEngine, WebGPUInitConfig } from '../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from './helpers/webgpu-mock';
import windParticlesWGSL from '../src/webgpu/shaders/wind_particles.wgsl?raw';
import windRibbonRenderWGSL from '../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';
import origamiCraneWGSL from '../src/webgpu/shaders/origami_crane.wgsl?raw';

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
    lineCount,
    pointsData,
    target2DData,
    typeData,
    lineIndices,
    resolution: '1M',
  };
}

describe('Phase 5: Atmospheric Wind System & Autonomous Origami Crane Engine', () => {
  describe('1. VectorFieldDataSource Multi-Stratum Modeling', () => {
    it('WIND-01: initializes dual-stratum procedural fallback with valid physical ranges', async () => {
      const source = new VectorFieldDataSource();
      await source.loadGrid();
      await source.loadJetStreamGrid();

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

  describe('2. OrigamiCraneFlightSolver Aerodynamic Dynamics', () => {
    it('CRANE-01: initializes with trim airspeed and realistic soaring parameters', () => {
      const solver = new OrigamiCraneFlightSolver(-68.5, -32.5, 2500);
      const state = solver.getState();

      expect(state.lon).toBe(-68.5);
      expect(state.lat).toBe(-32.5);
      expect(state.altitude).toBe(2500);
      expect(state.airspeed).toBeGreaterThanOrEqual(12.0);
      expect(state.airspeed).toBeLessThanOrEqual(20.0);
      expect(state.wingFlex).toBe(0);
      expect(state.isAirborne).toBe(true);
      expect(state.currentStratum).toBe('surface');
    });

    it('CRANE-02: climbs when encountering mountain wave ridge lift and banks into turns', async () => {
      // Place crane in the Patagonian Andes (-71.0°W, -45.0°S) where 22 m/s westerlies blow against ridges
      const solver = new OrigamiCraneFlightSolver(-71.0, -45.0, 2500);
      const source = new VectorFieldDataSource();
      await source.loadGrid();

      const initialAlt = solver.getState().altitude;

      // Simulate 40 steps with mountain ridge slope (+0.25 East)
      for (let i = 0; i < 40; i++) {
        solver.step(
          {
            dt: 0.05,
            unfurl: 0.0,
            mode: 0,
            elevationSampler: () => ({
              elevationMeters: 1800,
              gradEast: 0.25, // Windward ridge
              gradNorth: 0.02,
            }),
          },
          source
        );
      }

      const endState = solver.getState();
      expect(endState.altitude).toBeGreaterThan(initialAlt);
      expect(endState.variometer).toBeGreaterThan(0);
      expect(Number.isFinite(endState.roll)).toBe(true);
      expect(Number.isFinite(endState.heading)).toBe(true);
    });

    it('CRANE-03: enforces minimum ground clearance above mountain terrain', () => {
      const solver = new OrigamiCraneFlightSolver(0, 0, 500);

      // Simulate diving/sinking toward a 1500m mountain peak
      for (let i = 0; i < 50; i++) {
        solver.step({
          dt: 0.1,
          unfurl: 0.0,
          mode: 0,
          elevationSampler: () => ({
            elevationMeters: 1500,
            gradEast: 0.0,
            gradNorth: 0.0,
          }),
        });
      }

      const state = solver.getState();
      // Altitude must never be lower than terrain elevation + min clearance (80m)
      expect(state.altitude).toBeGreaterThanOrEqual(1580);
    });

    it('CRANE-04: wing-flex damped oscillator responds to load factor without divergence', () => {
      const solver = new OrigamiCraneFlightSolver(0, 0, 3000);

      for (let i = 0; i < 100; i++) {
        solver.step({
          dt: 0.02,
          unfurl: 0.0,
          mode: 0,
        });

        const state = solver.getState();
        expect(Number.isFinite(state.wingFlex)).toBe(true);
        expect(state.wingFlex).toBeGreaterThanOrEqual(-0.25);
        expect(state.wingFlex).toBeLessThanOrEqual(0.35);
      }
    });

    it('CRANE-05: computes orthonormal cartographic frame across all 5 morphing paradigms', () => {
      const solver = new OrigamiCraneFlightSolver(45.0, 30.0, 4000);

      for (let mode = 0; mode <= 4; mode++) {
        for (let unfurl = 0.0; unfurl <= 1.0; unfurl += 0.25) {
          const cart = solver.computeCartographicState(unfurl, mode as any);

          // World position must be strictly finite and non-zero
          expect(Number.isFinite(cart.worldPos[0])).toBe(true);
          expect(Number.isFinite(cart.worldPos[1])).toBe(true);
          expect(Number.isFinite(cart.worldPos[2])).toBe(true);
          const posLen = Math.hypot(...cart.worldPos);
          expect(posLen).toBeGreaterThan(1.0);

          // Orientation vectors must be valid
          expect(Number.isFinite(cart.forwardVec[0])).toBe(true);
          expect(Number.isFinite(cart.upVec[0])).toBe(true);
          expect(Number.isFinite(cart.rightVec[0])).toBe(true);

          // Dot product between forward and right should be near zero (orthonormal)
          const dotFwdRight =
            cart.forwardVec[0] * cart.rightVec[0] +
            cart.forwardVec[1] * cart.rightVec[1] +
            cart.forwardVec[2] * cart.rightVec[2];
          expect(Math.abs(dotFwdRight)).toBeLessThan(0.05);
        }
      }
    });
  });

  describe('3. DataLayerCatalog Preset Ingestion', () => {
    it('CATALOG-01: registers NOAA GFS 250 hPa Jet Stream preset', () => {
      const jetPreset = getPresetById('noaa-gfs-jetstream');
      expect(jetPreset).toBeDefined();
      expect(jetPreset?.category).toBe('field');
      expect(jetPreset?.url).toBe('/data/gfs-jetstream-latest.bin');
      expect(jetPreset?.legend?.colorStops.length).toBeGreaterThanOrEqual(4);
    });

    it('CATALOG-02: registers Origami Soaring Crane companion preset', () => {
      const cranePreset = getPresetById('origami-crane-companion');
      expect(cranePreset).toBeDefined();
      expect(cranePreset?.category).toBe('vectors');
      expect(cranePreset?.type).toBe('companion');
    });
  });

  describe('4. WebGPUEngine Lazy Allocation & Lifecycle Discipline', () => {
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
      // Exactly 5 core buffers on init; wind and crane buffers must NOT be eagerly allocated
      expect(device.buffers.length).toBe(5);
    });

    it('WEBGPU-02: lazily allocates wind and crane buffers only when requested', () => {
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

      // Now request origami crane -> triggers lazy allocation
      engine.releaseOrigamiCrane(-68.5, -32.5, 3000);
      expect((engine as any).isCraneActive).toBe(true);

      // Render with crane active
      engine.render({
        unfurl: 0.0,
        mode: 0,
        time: 0.05,
        dt: 0.016,
        camera,
        showCrane: true,
      });

      // Buffers should now include quadCorner, wind particle ping-pong (2), wind uniform, and crane uniform
      expect(device.buffers.length).toBeGreaterThan(5);
    });

    it('WEBGPU-03: cleans up all wind and crane buffers on engine.dispose() with zero leaks', () => {
      const device = (engine as any).device as MockGPUDevice;
      engine.releaseOrigamiCrane();
      engine.ensureWindBuffers();

      expect(device.buffers.length).toBeGreaterThan(5);

      engine.dispose();
      expect(engine.initialized).toBe(false);
      expect(device.buffers.length).toBe(0);
      expect(device.textures.length).toBe(0);
    });
  });

  describe('5. WGSL Shader Structural Verification', () => {
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

    it('WGSL-03: origami_crane.wgsl defines 14-facet paper geometry and Imhof NW sun lighting', () => {
      expect(origamiCraneWGSL).toContain('getCraneVertex');
      expect(origamiCraneWGSL).toContain('sunDir');
      expect(origamiCraneWGSL).toContain('isShadow');
      expect(origamiCraneWGSL).toContain('CraneUniforms');
    });
  });
});
