// ============================================================================
// File: tests/modern/challenger-stage3-adversarial-physics.test.ts
// Architecture: STAGE 3 Empirical Adversarial Physics & Clearance Stress Suite
// Description: Adversarial generator, oracles, and stress harnesses for low-Reynolds
//              autonomous origami crane aerodynamics, extreme elevation clearance,
//              orographic variometer lift/sink regimes, and WebGPU shadow integration.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { OrigamiCraneFlightSolver, CraneState } from '../../src/core/physics/OrigamiCraneFlightSolver';
import { VectorFieldDataSource } from '../../src/core/data/VectorFieldDataSource';
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
  describe('1. Extreme Elevation Clearance & Cliff Boundary Stress', () => {
    const extremeElevations = [
      { name: 'Mount Everest', elev: 8848.0, lat: 27.9881, lon: 86.925 },
      { name: 'Aconcagua', elev: 6961.0, lat: -32.6532, lon: -70.0109 },
      { name: 'Mont Blanc', elev: 4808.0, lat: 45.8326, lon: 6.8652 },
      { name: 'Dead Sea Depression', elev: -430.0, lat: 31.5, lon: 35.5 },
      { name: 'Challenger Deep', elev: -10924.0, lat: 11.3733, lon: 142.5917 },
      { name: 'Mean Sea Level', elev: 0.0, lat: 0.0, lon: 0.0 },
    ];

    it.each(extremeElevations)(
      'CHALLENGE-ELEV-01: strictly maintains clearance >= 80m at $name ($elev m)',
      ({ elev, lon, lat }) => {
        const solver = new OrigamiCraneFlightSolver(lon, lat, elev + 200);

        // Step solver over this stationary terrain
        for (let i = 0; i < 50; i++) {
          solver.step({
            dt: 0.05,
            unfurl: 0.0,
            mode: 0,
            elevationSampler: () => ({
              elevationMeters: elev,
              gradEast: 0.0,
              gradNorth: 0.0,
            }),
          });

          const state = solver.getState();
          expect(state.clearance).toBeGreaterThanOrEqual(80.0);
          expect(state.altitude).toBeGreaterThanOrEqual(elev + 80.0);
          expect(state.terrainElevation).toBe(elev);
          expect(Number.isFinite(state.altitude)).toBe(true);
          expect(Number.isFinite(state.clearance)).toBe(true);
        }
      }
    );

    it('CHALLENGE-ELEV-02: instant cliff upward step (0m -> 8848m) clamps within 1 dt', () => {
      // Start crane at sea level with 100m clearance (alt = 100m)
      const solver = new OrigamiCraneFlightSolver(0, 0, 100);

      // Step 1: at sea level
      solver.step({
        dt: 0.05,
        unfurl: 0.0,
        mode: 0,
        elevationSampler: () => ({ elevationMeters: 0, gradEast: 0, gradNorth: 0 }),
      });
      expect(solver.getState().clearance).toBeGreaterThanOrEqual(80.0);

      // Step 2: sudden 8848m cliff appears under crane
      solver.step({
        dt: 0.05,
        unfurl: 0.0,
        mode: 0,
        elevationSampler: () => ({ elevationMeters: 8848.0, gradEast: 0, gradNorth: 0 }),
      });

      const state = solver.getState();
      // Altitude must immediately jump to >= 8848 + 80 = 8928m
      expect(state.altitude).toBeGreaterThanOrEqual(8928.0);
      expect(state.clearance).toBeGreaterThanOrEqual(80.0);
      expect(state.terrainElevation).toBe(8848.0);
    });

    it('CHALLENGE-ELEV-03: instant cliff downward step (8848m -> -10924m) preserves physical stability', () => {
      // Start crane above Everest
      const solver = new OrigamiCraneFlightSolver(86.9, 27.9, 8928);

      // Instant drop to Challenger Deep trench
      for (let i = 0; i < 20; i++) {
        solver.step({
          dt: 0.05,
          unfurl: 0.0,
          mode: 0,
          elevationSampler: () => ({ elevationMeters: -10924.0, gradEast: 0, gradNorth: 0 }),
        });

        const state = solver.getState();
        expect(state.altitude).toBeGreaterThanOrEqual(-10924.0 + 80.0);
        expect(state.clearance).toBeGreaterThanOrEqual(80.0);
        expect(Number.isFinite(state.altitude)).toBe(true);
        expect(Number.isFinite(state.variometer)).toBe(true);
      }
    });

    it('CHALLENGE-ELEV-04: extreme downward descent rate & negative pitch does not penetrate terrain', () => {
      // Crane with initial 1000m altitude
      const solver = new OrigamiCraneFlightSolver(0, 0, 1000);

      // Force high descent rate into mountain peak (elev = 950m) with zero wind
      for (let i = 0; i < 100; i++) {
        solver.step({
          dt: 0.1,
          unfurl: 0.0,
          mode: 0,
          elevationSampler: () => ({ elevationMeters: 950.0, gradEast: 0, gradNorth: 0 }),
        });

        const state = solver.getState();
        expect(state.altitude).toBeGreaterThanOrEqual(1030.0); // 950 + 80
        expect(state.clearance).toBeGreaterThanOrEqual(80.0);
      }
    });

    it('CHALLENGE-ELEV-05: 10,000 Monte Carlo terrain steps guarantee clearance >= 80.0m invariant', () => {
      const solver = new OrigamiCraneFlightSolver(0, 0, 2000);
      let minObservedClearance = Infinity;

      // Seeded-like pseudo-random generator
      let seed = 42;
      const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      for (let step = 0; step < 10000; step++) {
        const randomElev = -10924.0 + pseudoRandom() * (8848.0 - -10924.0);
        const randomGradE = (pseudoRandom() - 0.5) * 0.8;
        const randomGradN = (pseudoRandom() - 0.5) * 0.8;
        const randomDt = 0.001 + pseudoRandom() * 0.15;

        solver.step({
          dt: randomDt,
          unfurl: pseudoRandom(),
          mode: Math.floor(pseudoRandom() * 5) as any,
          elevationSampler: () => ({
            elevationMeters: randomElev,
            gradEast: randomGradE,
            gradNorth: randomGradN,
          }),
        });

        const state = solver.getState();
        if (state.clearance < minObservedClearance) {
          minObservedClearance = state.clearance;
        }

        expect(state.clearance).toBeGreaterThanOrEqual(80.0);
        expect(state.altitude).toBeGreaterThanOrEqual(state.terrainElevation + 80.0);
        expect(Number.isFinite(state.altitude)).toBe(true);
        expect(Number.isFinite(state.variometer)).toBe(true);
        expect(Number.isFinite(state.wingFlex)).toBe(true);
      }

      expect(minObservedClearance).toBeGreaterThanOrEqual(80.0);
    });
  });

  describe('2. Aerodynamic Windward Slope vs Leeward Downdraft Regimes', () => {
    it('CHALLENGE-AERO-01: windward ridge achieves variometer climb between +1.5 and +5.0 m/s when cruising', async () => {
      const windSource = new VectorFieldDataSource();
      await windSource.loadGrid('procedural');

      // Place crane in the Andes corridor (-68.5°W, -32.5°S) at altitude 5100m (above 5000m ridge crest)
      // Pure orographic lift governs without collision lookahead override
      const solver = new OrigamiCraneFlightSolver(-68.5, -32.5, 5100);

      const andesSampler = (lon: number, _lat: number) => {
        const ridgeLon = -68.5;
        const distFromRidge = lon - ridgeLon;
        const ridgeProfile = Math.exp(-Math.pow(distFromRidge / 1.4, 2));
        return {
          elevationMeters: 1500.0 + 3500.0 * ridgeProfile,
          gradEast: distFromRidge <= 0 ? 0.22 : -0.15,
          gradNorth: 0.02,
        };
      };

      solver.step(
        {
          dt: 0.05,
          unfurl: 0.0,
          mode: 0,
          elevationSampler: andesSampler,
        },
        windSource
      );

      const state = solver.getState();
      // Requirement: Variometer climb rate between +1.5 and +5.0 m/s
      expect(state.variometer).toBeGreaterThanOrEqual(1.5);
      expect(state.variometer).toBeLessThanOrEqual(5.0);
      expect(state.glideRatio).toBe(99.0); // Soaring indicator
    });

    it('CHALLENGE-AERO-02: anticipatory collision avoidance climbs up to 8.0 m/s when approaching ridge', () => {
      // Crane flying low (alt = 5000m) approaching a 5000m ridge where targetAltAhead = 5080m
      const solver = new OrigamiCraneFlightSolver(-68.5, -32.5, 5000);

      const andesSampler = () => ({
        elevationMeters: 5000.0,
        gradEast: 0.22,
        gradNorth: 0.02,
      });

      solver.step({
        dt: 0.05,
        unfurl: 0.0,
        mode: 0,
        elevationSampler: andesSampler,
      });

      const state = solver.getState();
      // Lookahead anticipatory climb clamps up to 8.0 m/s to clear mountain summits
      expect(state.variometer).toBeGreaterThanOrEqual(5.0);
      expect(state.variometer).toBeLessThanOrEqual(8.0);
    });

    it('CHALLENGE-AERO-03: leeward slope produces downdraft but maintains clearance >= 80m', async () => {
      // Leeward side of Andes (east of crest): gradEast = -0.25 (descending eastward)
      // Westerly wind against down-slope produces kinematic downdraft (w < 0)
      const solver = new OrigamiCraneFlightSolver(-67.5, -32.5, 3085); // 5m above 80m deck

      const leewardSampler = () => ({
        elevationMeters: 3000.0,
        gradEast: -0.25, // Leeward downdraft slope
        gradNorth: 0.0,
      });

      // Mock wind source with 15 m/s westerly wind
      const mockWindSource = {
        sampleVelocity: () => [15.0, 0.0] as [number, number],
      } as any;

      for (let i = 0; i < 40; i++) {
        solver.step(
          {
            dt: 0.05,
            unfurl: 0.0,
            mode: 0,
            elevationSampler: leewardSampler,
          },
          mockWindSource
        );

        const state = solver.getState();
        // Even with strong downdraft, clearance must never drop below 80m
        expect(state.clearance).toBeGreaterThanOrEqual(80.0);
        expect(state.altitude).toBeGreaterThanOrEqual(3080.0);
      }

      // After settling onto the 80m cushion, variometer is clamped to >= 0
      const finalState = solver.getState();
      expect(finalState.clearance).toBe(80.0);
      expect(finalState.variometer).toBeGreaterThanOrEqual(0.0);
    });

    it('CHALLENGE-AERO-04: still air (zero wind) produces natural glider sink rate ~1.58 m/s', () => {
      // Cruise airspeed = 15 m/s, glideRatio L/D = 9.5
      // Expected natural sink rate = 15 / 9.5 ≈ 1.5789 m/s
      const solver = new OrigamiCraneFlightSolver(0, 0, 5000);

      // Zero wind, flat terrain at sea level
      solver.step({
        dt: 0.05,
        unfurl: 0.0,
        mode: 0,
        elevationSampler: () => ({ elevationMeters: 0, gradEast: 0, gradNorth: 0 }),
      });

      const state = solver.getState();
      // Natural sink rate should be negative (sinking)
      expect(state.variometer).toBeLessThan(0);
      const expectedSink = -state.airspeed / 9.5;
      expect(state.variometer).toBeCloseTo(expectedSink, 1);
      expect(state.glideRatio).toBeCloseTo(9.5, 0);
    });

    it('CHALLENGE-AERO-05: wing-flex damped harmonic oscillator survives extreme G-load pulses', () => {
      const solver = new OrigamiCraneFlightSolver(0, 0, 3000);

      // Subject crane to alternating positive and negative extreme vertical impulses
      for (let i = 0; i < 200; i++) {
        const imp = (i % 2 === 0 ? 1 : -1) * 0.4;
        solver.step({
          dt: 0.02,
          unfurl: 0.0,
          mode: 0,
          elevationSampler: () => ({
            elevationMeters: 1000,
            gradEast: imp,
            gradNorth: 0,
          }),
        });

        const state = solver.getState();
        expect(Number.isFinite(state.wingFlex)).toBe(true);
        // Wing flex bounds in radians: [-0.15, +0.25] with oscillator overshoot staying within [-0.25, +0.35]
        expect(state.wingFlex).toBeGreaterThanOrEqual(-0.35);
        expect(state.wingFlex).toBeLessThanOrEqual(0.35);
      }
    });
  });

  describe('3. WebGPUEngine Integration & Dynamic Ground Shadow Radius Formula', () => {
    it('CHALLENGE-SHADOW-01: verifies dynamic ground shadow radius formula across all positive elevations', () => {
      const baseRadius = 5.0;
      const altScale = 0.00003;

      const positiveElevations = [
        { name: 'Sea Level', elev: 0.0, expectedR: baseRadius + 0.006 },
        { name: 'Everest (8848m)', elev: 8848.0, expectedR: baseRadius + 0.006 + 8848.0 * altScale },
        { name: 'Aconcagua (6961m)', elev: 6961.0, expectedR: baseRadius + 0.006 + 6961.0 * altScale },
        { name: 'Mont Blanc (4808m)', elev: 4808.0, expectedR: baseRadius + 0.006 + 4808.0 * altScale },
      ];

      for (const tc of positiveElevations) {
        const shadowR = baseRadius + 0.006 + Math.max(0, tc.elev) * altScale;
        expect(shadowR).toBeCloseTo(tc.expectedR, 6);

        // Crane altitude radius formula from OrigamiCraneFlightSolver.ts:
        // currentRadius = baseRadius + 0.06 + altitude * altScale
        // For positive elevations, clearance >= 80m guarantees altitude >= elev + 80m.
        // Therefore crane radius must strictly exceed shadow radius by at least 0.054 units
        const minCraneAltitude = tc.elev + 80.0;
        const minCraneRadius = baseRadius + 0.06 + minCraneAltitude * altScale;

        expect(minCraneRadius).toBeGreaterThan(shadowR);
        const deltaRadius = minCraneRadius - shadowR;
        expect(deltaRadius).toBeGreaterThanOrEqual(0.054);
      }
    });

    it('CHALLENGE-SHADOW-02: exposes sub-sea-level elevation limitation where shadow clamps at sea level', () => {
      const baseRadius = 5.0;
      const altScale = 0.00003;

      // When terrain elevation is negative (Dead Sea -430m, Challenger Deep -10924m):
      // shadowR clamps to baseRadius + 0.006 (sea level) via Math.max(0, terrainElev)
      const challengerElev = -10924.0;
      const shadowR = baseRadius + 0.006 + Math.max(0, challengerElev) * altScale;
      expect(shadowR).toBe(baseRadius + 0.006); // 5.006

      // But OrigamiCraneFlightSolver does not clamp negative altitude in radius calculation:
      const craneAltitude = challengerElev + 80.0; // -10844m
      const craneRadius = baseRadius + 0.06 + craneAltitude * altScale; // 4.73468
      // Note finding: craneRadius (4.735) < shadowR (5.006) for deep sub-sea terrain!
      expect(craneRadius).toBeLessThan(shadowR);
    });

    it('CHALLENGE-SHADOW-03: WebGPUEngine uniform buffer populates shadow position correctly', async () => {
      setupMockNavigator();
      const engine = new WebGPUEngine();
      const config = createEngineConfig(1024, 100);
      await engine.initialize(config);

      engine.releaseOrigamiCrane(-68.5, -32.5, 5200);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, 15);

      // Render 1 frame with crane active
      engine.render({
        unfurl: 0.0,
        mode: 0,
        time: 0.016,
        dt: 0.016,
        camera,
        showCrane: true,
      });

      const cf = (engine as any).craneUniformFloats as Float32Array;
      expect(cf).toBeDefined();

      // [16..18]: shadowPos (xyz on terrain/sphere)
      const shadowX = cf[16];
      const shadowY = cf[17];
      const shadowZ = cf[18];
      const shadowLen = Math.hypot(shadowX, shadowY, shadowZ);

      // Base radius is 5.0; in Andes (-68.5°W, -32.5°S), terrain elevation is ~5000m
      // shadowR = 5.0 + 0.006 + 5000 * 0.00003 = 5.156
      expect(shadowLen).toBeGreaterThan(5.0);
      expect(shadowLen).toBeLessThan(5.3);

      // Crane position length (cf[0..2]) must be strictly greater than shadow position length
      const craneLen = Math.hypot(cf[0], cf[1], cf[2]);
      expect(craneLen).toBeGreaterThan(shadowLen);
      expect(craneLen - shadowLen).toBeGreaterThanOrEqual(0.054);

      engine.dispose();
      restoreMockNavigator();
    });
  });

  describe('4. CPU Elevation Sampling Accuracy & Procedural Barrier Fallbacks', () => {
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

  describe('5. Cartographic 5-Mode Frame Orthonormality Under Extreme Deformation', () => {
    it('CHALLENGE-FRAME-01: guarantees valid frame across all 5 modes with out-of-bounds unfurl', () => {
      const solver = new OrigamiCraneFlightSolver(120.0, -45.0, 3500);

      const unfurls = [-0.2, 0.0, 0.33, 0.5, 0.75, 1.0, 1.2]; // Including clamped out-of-bounds
      const modes = [0, 1, 2, 3, 4]; // All 5 manifold topologies

      for (const mode of modes) {
        for (const unfurl of unfurls) {
          const cart = solver.computeCartographicState(unfurl, mode as any);

          // World pos must be valid and non-zero
          const posLen = Math.hypot(...cart.worldPos);
          expect(posLen).toBeGreaterThan(1.0);
          expect(Number.isFinite(posLen)).toBe(true);

          // Forward and up vectors must have unit magnitude
          const fwdLen = Math.hypot(...cart.forwardVec);
          const upLen = Math.hypot(...cart.upVec);
          const rightLen = Math.hypot(...cart.rightVec);

          expect(fwdLen).toBeCloseTo(1.0, 4);
          expect(upLen).toBeCloseTo(1.0, 4);
          // rightVec magnitude is |fwd x surfNorm| = sin(theta) which stays well above 0.85 during morphing
          expect(rightLen).toBeGreaterThan(0.85);
          expect(rightLen).toBeLessThan(1.05);

          // Normalization on GPU (via normalize(crane.u_right.xyz) in origami_crane.wgsl) is non-singular
          const normRightLen = Math.hypot(
            cart.rightVec[0] / rightLen,
            cart.rightVec[1] / rightLen,
            cart.rightVec[2] / rightLen
          );
          expect(normRightLen).toBeCloseTo(1.0, 4);

          // Up and right vectors are mathematically orthogonal (up · right == 0)
          const dotUpRight =
            cart.upVec[0] * cart.rightVec[0] +
            cart.upVec[1] * cart.rightVec[1] +
            cart.upVec[2] * cart.rightVec[2];
          expect(Math.abs(dotUpRight)).toBeLessThan(1e-4);
        }
      }
    });
  });
});
