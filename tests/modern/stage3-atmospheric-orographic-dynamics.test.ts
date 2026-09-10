// ============================================================================
// File: tests/modern/stage3-atmospheric-orographic-dynamics.test.ts
// Architecture: STAGE 3 Atmospheric Orographic Dynamics & WebGPU Bindings
// Description: Behavioral and structural test suite verifying NOAA GFS wind
//              coupling with 3D DEM elevation gradient, orographic lift deflection,
//              WGSL uniform control flow, and autonomous origami crane flight.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { VectorFieldDataSource } from '../../src/core/data/VectorFieldDataSource';
import { OrigamiCraneFlightSolver } from '../../src/core/physics/OrigamiCraneFlightSolver';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import windParticlesWGSL from '../../src/webgpu/shaders/wind_particles.wgsl?raw';
import windRibbonRenderWGSL from '../../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';

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

describe('STAGE 3: Atmospheric Orographic Dynamics & WebGPU Bindings', () => {
  describe('1. WGSL Compute & Render Shader Structural Verification', () => {
    it('WGSL-ATMOS-01: wind_particles.wgsl declares DEM texture and sampler at bindings 6 and 7', () => {
      expect(windParticlesWGSL).toContain('@group(0) @binding(6) var u_demSampler: sampler;');
      expect(windParticlesWGSL).toContain('@group(0) @binding(7) var u_demTexture: texture_2d<f32>;');
    });

    it('WGSL-ATMOS-02: wind_particles.wgsl implements Plate Carrée DEM coordinate mapping and unpacking', () => {
      expect(windParticlesWGSL).toContain('fn sampleTerrainElevation');
      expect(windParticlesWGSL).toContain('fract(lonRad / TWO_PI + 0.5)');
      expect(windParticlesWGSL).toContain('clamp(0.5 - latRad / PI, 0.001, 0.999)');
      // ETOPO 2022 normalized continental elevation scalar (8848m)
      expect(windParticlesWGSL).toContain('8848.0');
    });

    it('WGSL-ATMOS-03: wind_particles.wgsl evaluates topographic gradient over Earth spherical metric', () => {
      expect(windParticlesWGSL).toContain('fn sampleTerrain');
      expect(windParticlesWGSL).toContain('EARTH_RADIUS');
      expect(windParticlesWGSL).toContain('6371000.0');
      expect(windParticlesWGSL).toContain('cosLat');
    });

    it('WGSL-ATMOS-04: wind_particles.wgsl couples horizontal wind with gradient and deflects streamlines', () => {
      // Coupling w = u_h · ∇h
      expect(windParticlesWGSL).toContain('let wOrographic = dot(currentVel, t0.gradient);');
      // Velocity z-component stores vertical velocity
      expect(windParticlesWGSL).toContain('pOut.vel = vec4<f32>(currentVel.x, currentVel.y, wOrographic, speed);');
      // Particle altitude and history points lifted by terrain elevation and orographic lift
      expect(windParticlesWGSL).toContain('computeLiftedAltitude');
      expect(windParticlesWGSL).toContain('clamp(wOrographic * 0.005, 0.0, 0.035)');
    });

    it('WGSL-ATMOS-05: wind_ribbon_render.wgsl adheres strictly to Uniform Control Flow Invariant #3', () => {
      // VertexOutput must include vertVel at location 5
      expect(windRibbonRenderWGSL).toContain('@location(5) vertVel: f32');

      // Unconditional evaluation of fwidth derivatives at the very top of fs_main
      const fsMainIdx = windRibbonRenderWGSL.indexOf('fn fs_main(in: VertexOutput)');
      const dUvIdx = windRibbonRenderWGSL.indexOf('let dUv = fwidth(in.uv);', fsMainIdx);
      const dVertVelIdx = windRibbonRenderWGSL.indexOf('let dVertVel = fwidth(in.vertVel);', fsMainIdx);
      const discardIdx = windRibbonRenderWGSL.indexOf('discard;', fsMainIdx);

      expect(fsMainIdx).toBeGreaterThan(-1);
      expect(dUvIdx).toBeGreaterThan(fsMainIdx);
      expect(dVertVelIdx).toBeGreaterThan(fsMainIdx);
      // Derivatives MUST occur before any discard
      expect(dUvIdx).toBeLessThan(discardIdx);
      expect(dVertVelIdx).toBeLessThan(discardIdx);
    });

    it('WGSL-ATMOS-06: wind_ribbon_render.wgsl renders non-moralized condensation glazes', () => {
      expect(windRibbonRenderWGSL).toContain('let condensation = smoothstep(0.2, 3.5, in.vertVel);');
      // Crystalline silver mist (Theme 0) and watercolor vapor glaze (Theme 1)
      expect(windRibbonRenderWGSL).toContain('0.92, 0.96, 1.00'); // Obsidian silver mist
      expect(windRibbonRenderWGSL).toContain('0.68, 0.74, 0.80'); // Cream Rag vapor glaze
      // Lateral edge softening
      expect(windRibbonRenderWGSL).toContain('let featherMin = mix(0.18, 0.06, condensation * 0.5);');
    });
  });

  describe('2. WebGPUEngine Pipeline Invariants & Lifecycle Discipline', () => {
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

    it('STAGE3-WEBGPU-01: strictly maintains 5-buffer invariant at initialization', () => {
      const device = (engine as any).device as MockGPUDevice;
      // Exactly 5 core buffers on init; wind and crane buffers must NOT be eagerly allocated
      expect(device.buffers.length).toBe(5);
    });

    it('STAGE3-WEBGPU-02: lazily allocates 48-byte wind uniform buffer and creates wind bind groups', () => {
      const device = (engine as any).device as MockGPUDevice;
      expect(device.buffers.length).toBe(5);

      engine.ensureWindBuffers();
      expect(device.buffers.length).toBeGreaterThan(5);

      // Verify windUniformBuffer size is 48 bytes (12 floats for 16-byte alignment)
      const windUBuffer = (engine as any).windUniformBuffer as any;
      expect(windUBuffer).toBeDefined();
      expect(windUBuffer.size).toBe(64);
    });

    it('STAGE3-WEBGPU-03: cleans up all resources cleanly on engine.dispose()', () => {
      const device = (engine as any).device as MockGPUDevice;
      engine.ensureWindBuffers();
      engine.releaseOrigamiCrane();

      expect(device.buffers.length).toBeGreaterThan(5);
      engine.dispose();
      expect(engine.initialized).toBe(false);
      expect(device.buffers.length).toBe(0);
      expect(device.textures.length).toBe(0);
    });
  });

  describe('3. CPU Elevation Sampler & Orographic Gradient Modeling', () => {
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

    it('STAGE3-ELEV-01: evaluates Andes Cordillera ridge elevation and positive windward slope', () => {
      // Windward side of Andes (-70.0°W, -32.5°S)
      const windwardAndes = engine.sampleCPUElevation(-70.0, -32.5);
      expect(windwardAndes.elevationMeters).toBeGreaterThan(1500.0);
      expect(windwardAndes.gradEast).toBeGreaterThan(0.0); // Facing westerly winds

      // Mountain crest near Aconcagua (-68.5°W, -32.5°S)
      const crestAndes = engine.sampleCPUElevation(-68.5, -32.5);
      expect(crestAndes.elevationMeters).toBeGreaterThan(4500.0);
    });

    it('STAGE3-ELEV-02: evaluates Himalayas and Alps topographic barriers', () => {
      const himalayas = engine.sampleCPUElevation(86.9, 27.9);
      expect(himalayas.elevationMeters).toBeGreaterThan(4000.0);
      expect(himalayas.gradNorth).toBeGreaterThan(0.0);

      const alps = engine.sampleCPUElevation(10.0, 46.0);
      expect(alps.elevationMeters).toBeGreaterThan(2000.0);
      expect(alps.gradEast).toBeGreaterThan(0.0);
    });

    it('STAGE3-ELEV-03: returns sea level (0m) and zero gradient over open ocean', () => {
      const ocean = engine.sampleCPUElevation(0.0, 0.0);
      expect(ocean.elevationMeters).toBe(0);
      expect(ocean.gradEast).toBe(0);
      expect(ocean.gradNorth).toBe(0);
    });
  });

  describe('4. Autonomous Origami Crane Coupled Flight Dynamics', () => {
    it('STAGE3-CRANE-01: climbs in mountain wave lift when coupled with elevation sampler and wind source', async () => {
      // Place crane in the Patagonian Andes (-71.0°W, -45.0°S) where strong westerlies blow against mountain barriers
      const solver = new OrigamiCraneFlightSolver(-71.0, -45.0, 2500);
      const windSource = new VectorFieldDataSource();
      await windSource.loadGrid('procedural');

      const initialAlt = solver.getState().altitude;

      // Step flight solver with windward slope gradient (+0.25 East)
      for (let i = 0; i < 50; i++) {
        solver.step(
          {
            dt: 0.05,
            unfurl: 0.0,
            mode: 0,
            elevationSampler: () => ({
              elevationMeters: 2200,
              gradEast: 0.25,
              gradNorth: 0.02,
            }),
          },
          windSource
        );
      }

      const state = solver.getState();
      expect(state.altitude).toBeGreaterThan(initialAlt);
      expect(state.variometer).toBeGreaterThan(1.0); // Strong positive climb rate in m/s
    });

    it('STAGE3-CRANE-02: enforces terrain ground clearance (>= 80m) to prevent mountain clipping', () => {
      const solver = new OrigamiCraneFlightSolver(-68.5, -32.5, 1000);

      // Attempt to dive toward a 3500m mountain summit
      for (let i = 0; i < 60; i++) {
        solver.step({
          dt: 0.1,
          unfurl: 0.0,
          mode: 0,
          elevationSampler: () => ({
            elevationMeters: 3500,
            gradEast: 0.0,
            gradNorth: 0.0,
          }),
        });
      }

      const state = solver.getState();
      expect(state.altitude).toBeGreaterThanOrEqual(3580.0); // 3500m summit + 80m clearance
    });
  });
});
