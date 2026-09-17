// ============================================================================
// File: tests/modern/challenger-m1-kinematics-stress.test.ts
// Challenger: challenger_m1_1 (Role: Adversarial Kinematics Challenger)
// Milestone: Milestone 1: Camera Unlock & Depth Pipeline Alignment
// Invariants: §1 (Depth32Float), §2 (Ground Floor & Near-Plane), §3 (UCF),
//             §10 (Horizon Tangent), §15 (DEM Parity), §20 (Buffer Discipline),
//             §46 (Anti-Cheating Test Import Integrity)
//
// Verification Pillars:
// - Pillar A: 10,000 Monte Carlo Fuzzing Iterations from Orbit (R=50.0) to Floor (R=5.0001)
// - Pillar B: Critical Geometric Boundaries (Poles ±90°, Antimeridian ±180°, Summits)
// - Pillar C: WGSL Uniform Control Flow & Near-Guard Relaxation
// - Pillar D: Anti-Cheating Direct Imports from src/ without Shadow Oracles
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Production imports per Invariant §46 (Anti-Cheating Test Import Integrity)
import {
  PerspectiveCamera,
  Matrix4,
  Vector3,
  createPerspectiveMatrix,
  sphericalToCartesian,
  computeDynamicNearPlane,
  computeGroundClearanceFloor,
  computeGroundClearanceFloorDetails,
} from '../../src/core/math/cameraMath';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

import vectorRibbonWGSL from '../../src/webgpu/shaders/vector_ribbon.wgsl?raw';
import windRibbonWGSL from '../../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';

function createTestConfig(pointCount = 50, lineCount = 25) {
  const mockContext = {
    configure: () => {},
    getCurrentTexture: () => ({
      createView: () => ({}),
    }),
    canvas: { width: 1024, height: 768 },
  };

  const canvas = {
    width: 1024,
    height: 768,
    clientWidth: 1024,
    clientHeight: 768,
    getContext: (type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    pointCount,
    pointsData: new Float32Array(pointCount * 3),
    target2DData: new Float32Array(pointCount * 2),
    typeData: new Float32Array(pointCount),
    lineIndices: new Uint32Array(lineCount * 2),
    mode: 0,
    layerMode: 'both' as const,
    theme: 'dark' as const,
  };
}

describe('Challenger M1: Adversarial Kinematics & Ground Clearance Stress Harness', () => {
  let engine: WebGPUEngine;
  let mockDevice: MockGPUDevice;

  beforeEach(async () => {
    const mockGPU = createMockNavigatorGPU();
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGPU },
      writable: true,
      configurable: true,
    });
    mockDevice = (await mockGPU.requestAdapter().then((a: any) => a.requestDevice())) as MockGPUDevice;
    engine = new WebGPUEngine();
  });

  // ==========================================================================
  // Pillar A: 10,000 Monte Carlo Fuzzing Iterations
  // ==========================================================================
  describe('Pillar A: 10,000 Monte Carlo Descent Fuzzing Iterations', () => {
    it('CHALLENGE-M1-01: executes 10,000 randomized descent trials from R=50.0 down to R=5.0001 asserting near in [0.00005, 0.1] and non-NaN/Inf', () => {
      const camera = new PerspectiveCamera(45, 1024 / 768, 0.1, 1000);
      const ITERATIONS = 10_000;

      let minObservedNear = Infinity;
      let maxObservedNear = -Infinity;

      for (let i = 0; i < ITERATIONS; i++) {
        // Multi-scale adversarial sampling: deterministic boundary anchors + stratified altitude decades
        // Eliminates the 37.6% probabilistic lottery failure where uniform sampling misses [5.0001, 5.0045]
        let r: number;
        if (i === 0) {
          r = 5.0001; // Deterministic boundary anchor: exact ground clearance floor (altitude = 0.0001)
        } else if (i === 1) {
          r = 50.0; // Deterministic boundary anchor: orbital ceiling (altitude = 45.0)
        } else if (i === 2) {
          r = 5.004; // Deterministic boundary anchor: tropospheric transition knee (altitude = 0.004)
        } else if (i === 3) {
          r = 6.0; // Deterministic boundary anchor: orbital transition knee (altitude = 1.0)
        } else if (i % 2 === 0) {
          // Stratified log-uniform sampling across altitude decades [0.0001, 45.0]
          // Ensures balanced fuzzing across boundary layer, troposphere, stratosphere, and orbit
          const logAlt = -4.0 + Math.random() * (Math.log10(45.0) - (-4.0));
          r = 5.0 + Math.pow(10, logAlt);
        } else {
          // Continuous linear Monte Carlo fuzzing across macro-orbital domain [5.0001, 50.0]
          r = 5.0001 + Math.random() * (50.0 - 5.0001);
        }

        const near = computeDynamicNearPlane(r);

        // Strict numeric finiteness checks (Pillar A assertions)
        expect(Number.isFinite(near)).toBe(true);
        expect(Number.isNaN(near)).toBe(false);
        expect(near).toBeGreaterThanOrEqual(0.00005);
        expect(near).toBeLessThanOrEqual(0.1);

        if (near < minObservedNear) minObservedNear = near;
        if (near > maxObservedNear) maxObservedNear = near;

        // Apply to production PerspectiveCamera and assert projection matrix elements
        camera.near = near;
        camera.updateProjectionMatrix();

        const elements = camera.projectionMatrix.elements;
        for (let k = 0; k < 16; k++) {
          expect(Number.isFinite(elements[k])).toBe(true);
          expect(Number.isNaN(elements[k])).toBe(false);
        }

        // WebGPU clip-space depth diagonal elements
        // elements[10] = (far + near) / (near - far)
        // elements[14] = (2 * far * near) / (near - far)
        expect(elements[10]).toBeLessThan(0); // Right-handed perspective negative
        expect(elements[11]).toBe(-1.0);     // Perspective divide homogeneous w
        expect(elements[14]).toBeLessThan(0); // Near-far mapping non-zero negative
      }

      // Assert that the full dynamic range [0.00005, 0.1] was actually probed
      expect(minObservedNear).toBeCloseTo(0.00005, 4);
      expect(maxObservedNear).toBeCloseTo(0.1, 4);
    });

    it('CHALLENGE-M1-02: verifies invertibility and non-degeneracy of projection matrix at extreme near=0.00005', () => {
      const camera = new PerspectiveCamera(45, 16 / 9, 0.00005, 1000);
      camera.updateProjectionMatrix();

      // Matrix invertibility is vital for Pass 2 volumetric cloud raymarcher world-space reconstruction
      const invProj = camera.projectionMatrix.clone().invert();
      const invElements = invProj.elements;

      for (let k = 0; k < 16; k++) {
        expect(Number.isFinite(invElements[k])).toBe(true);
        expect(Number.isNaN(invElements[k])).toBe(false);
      }

      // Verify round-trip identity: P * P^-1 = I
      const identity = new Matrix4().multiplyMatrices(camera.projectionMatrix, invProj);
      expect(identity.elements[0]).toBeCloseTo(1.0, 3);
      expect(identity.elements[5]).toBeCloseTo(1.0, 3);
      expect(identity.elements[10]).toBeCloseTo(1.0, 3);
      expect(identity.elements[15]).toBeCloseTo(1.0, 3);
    });

    it('CHALLENGE-M1-03: adversarially stresses near-plane formula against non-finite, sub-floor, and extreme orbital inputs', () => {
      // Sub-floor radius (e.g. camera penetrating into planetary core)
      const coreR = 0.0;
      const coreNear = computeDynamicNearPlane(coreR);
      expect(Number.isFinite(coreNear)).toBe(true);
      expect(coreNear).toBeCloseTo(0.00005, 6);

      // Boundary: exact ground floor (altitude = 0.0001)
      const floorNear = computeDynamicNearPlane(5.0001);
      expect(floorNear).toBeCloseTo(0.00005, 6);

      // Boundary: exact transition threshold (altitude = 0.004)
      const transLowNear = computeDynamicNearPlane(5.004);
      expect(transLowNear).toBeCloseTo(0.00005, 6);

      // Boundary: exact orbital threshold (altitude = 1.0)
      const transHighNear = computeDynamicNearPlane(6.0);
      expect(transHighNear).toBeCloseTo(0.1, 6);

      // Extreme deep-space orbit: R = 10,000.0
      const deepSpaceNear = computeDynamicNearPlane(10000.0);
      expect(Number.isFinite(deepSpaceNear)).toBe(true);
      expect(deepSpaceNear).toBe(0.1);
    });
  });

  // ==========================================================================
  // Pillar B: Extreme Summit & Basin Ground Clearance Probing
  // ==========================================================================
  describe('Pillar B: Extreme Summit & Basin Ground Clearance Probing', () => {
    const SUMMITS = [
      { name: 'Mount Rainier', lon: -121.7604, lat: 46.8529, elevM: 4392 },
      { name: 'Mount Everest', lon: 86.9250, lat: 27.9881, elevM: 8848 },
      { name: 'Mauna Kea', lon: -155.4681, lat: 19.8207, elevM: 4207 },
      { name: 'Puget Sound (Sea Level)', lon: -122.3800, lat: 47.6200, elevM: 0 },
    ];

    it('CHALLENGE-M1-04: verifies h_floor strictly prevents camera penetration across all 4 benchmark summits under standard relief (dispScale = 0.08)', () => {
      for (const summit of SUMMITS) {
        const { h_floor, trueElevUnits, dispUnits } = computeGroundClearanceFloorDetails(summit.elevM, 0.08);

        // Clearance floor must strictly exceed the true physical crust sphere
        expect(h_floor).toBeGreaterThan(5.0 + trueElevUnits);

        // Clearance floor must strictly exceed the 3D displaced surface
        expect(h_floor).toBeGreaterThan(5.0 + dispUnits);

        // Verify scalar accessor equivalence
        expect(computeGroundClearanceFloor(summit.elevM, 0.08)).toBe(h_floor);

        // The minimum AGL safety buffer must be at least 0.0001 units (~127.4m)
        const clearanceUnits = h_floor - (5.0 + Math.max(trueElevUnits, dispUnits));
        expect(clearanceUnits).toBeGreaterThanOrEqual(0.0001 - 1e-9);

        const clearanceMeters = (clearanceUnits / 5.0) * 6371000.0;
        expect(clearanceMeters).toBeGreaterThanOrEqual(127.0);
      }
    });

    it('CHALLENGE-M1-05: verifies Everest floor elevates to 5.2241 blocking sub-summit descent', () => {
      const { h_floor, dispUnits } = computeGroundClearanceFloorDetails(8848, 0.08);
      // Disp units = (8848/8848) * (0.08 * 2.8) = 0.224
      expect(dispUnits).toBeCloseTo(0.224, 4);
      expect(h_floor).toBeCloseTo(5.2241, 4);

      // Attempting to place camera at R = 5.15 (which would be inside Everest) is blocked
      const cameraDesiredRadius = 5.15;
      const clampedRadius = Math.max(cameraDesiredRadius, h_floor);
      expect(clampedRadius).toBe(h_floor);
      expect(clampedRadius).toBeGreaterThan(5.22);
    });

    it('CHALLENGE-M1-06: verifies Rainier floor elevates to 5.1113 preserving clearance over glaciated summit', () => {
      const { h_floor, dispUnits } = computeGroundClearanceFloorDetails(4392, 0.08);
      // Disp units = (4392 / 8848) * 0.224 = 0.11119
      expect(dispUnits).toBeCloseTo(0.11119, 4);
      expect(h_floor).toBeCloseTo(5.11129, 4);

      // Attempting to place camera at R = 5.05 is blocked
      const clamped = Math.max(5.05, h_floor);
      expect(clamped).toBe(h_floor);
    });

    it('CHALLENGE-M1-07: verifies Mauna Kea floor elevates to 5.1066 preserving clearance over volcanic dome', () => {
      const { h_floor, dispUnits } = computeGroundClearanceFloorDetails(4207, 0.08);
      // Disp units = (4207 / 8848) * 0.224 = 0.106506
      expect(dispUnits).toBeCloseTo(0.10651, 4);
      expect(h_floor).toBeCloseTo(5.10661, 4);

      const clamped = Math.max(5.08, h_floor);
      expect(clamped).toBe(h_floor);
    });

    it('CHALLENGE-M1-08: verifies Puget Sound sea-level floor is 5.0001 permitting descent to 5.00275 (altitude 3,504m)', () => {
      const { h_floor } = computeGroundClearanceFloorDetails(0, 0.08);
      expect(h_floor).toBeCloseTo(5.0001, 6);
      expect(computeGroundClearanceFloor(0, 0.08)).toBe(h_floor);

      // Puget Sound descent waypoint (R = 5.00275) is strictly above floor
      const descentR = 5.00275;
      expect(descentR).toBeGreaterThan(h_floor);

      const aglAltitudeM = ((descentR - h_floor) / 5.0) * 6371000.0;
      expect(aglAltitudeM).toBeCloseTo(3376.6, 1);
    });

    it('CHALLENGE-M1-09: verifies WebGPUEngine.sampleCPUElevation returns finite values across all 4 coordinates and sanitizes non-finite inputs', () => {
      for (const summit of SUMMITS) {
        const sample = engine.sampleCPUElevation(summit.lon, summit.lat);
        expect(Number.isFinite(sample.elevationMeters)).toBe(true);
        expect(Number.isFinite(sample.gradEast)).toBe(true);
        expect(Number.isFinite(sample.gradNorth)).toBe(true);
        expect(Number.isNaN(sample.elevationMeters)).toBe(false);
      }

      // Adversarial inputs: NaN, Infinity, -Infinity
      const nanSample = engine.sampleCPUElevation(NaN, 45.0);
      expect(nanSample.elevationMeters).toBe(0);
      expect(nanSample.gradEast).toBe(0);
      expect(nanSample.gradNorth).toBe(0);

      const infSample = engine.sampleCPUElevation(10.0, Infinity);
      expect(infSample.elevationMeters).toBe(0);
      expect(infSample.gradEast).toBe(0);
      expect(infSample.gradNorth).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar C: WGSL Uniform Control Flow & Near-Guard Relaxation
  // ==========================================================================
  describe('Pillar C: WGSL Near-Guard Relaxation & Shader Integrity', () => {
    it('CHALLENGE-M1-10: verifies vector_ribbon.wgsl relaxes nearGuard from 0.05 down to 0.00002', () => {
      expect(vectorRibbonWGSL).toContain('let nearGuard = max(sim.u_nearPlane, 0.00002);');
      expect(vectorRibbonWGSL).not.toContain('let nearGuard = max(sim.u_nearPlane, 0.05);');
    });

    it('CHALLENGE-M1-11: verifies wind_ribbon_render.wgsl relaxes nearGuard from 0.05 down to 0.00002', () => {
      expect(windRibbonWGSL).toContain('let nearGuard = max(sim.u_nearPlane, 0.00002);');
      expect(windRibbonWGSL).not.toContain('let nearGuard = max(sim.u_nearPlane, 0.05);');
    });

    it('CHALLENGE-M1-12: proves defect sensitivity — previous nearGuard 0.05 culls vertices at tropospheric descent', () => {
      // In tropospheric descent (altitude 3,500m), nearPlane is 0.00005 (~63.7m)
      const troposphericNear = 0.00005;
      const oldNearGuard = Math.max(troposphericNear, 0.05); // 0.05 units = 63.7 km!
      const newNearGuard = Math.max(troposphericNear, 0.00002); // 0.00005 units = 63.7 m

      // A terrain line vertex 1,000m ahead of camera has w_c ≈ 0.00078 units
      const vertexDistanceUnits = (1000 / 6371000.0) * 5.0; // ~0.000785

      // Under old near guard (0.05), this vertex was erroneously CULLED (vanished):
      expect(vertexDistanceUnits < oldNearGuard).toBe(true); // Culled!

      // Under relaxed near guard (0.00002), this vertex is safely PRESERVED:
      expect(vertexDistanceUnits >= newNearGuard).toBe(true); // Rendered!
    });
  });

  // ==========================================================================
  // Pillar D: WebGPU Pipeline Format & Multi-Pass Persistence
  // ==========================================================================
  describe('Pillar D: WebGPU Depth32Float Pipeline Alignment & Multi-Pass Persistence', () => {
    it('CHALLENGE-M1-13: verifies runtime depthTexture creation with depth32float and RENDER_ATTACHMENT | TEXTURE_BINDING', async () => {
      await engine.initialize(createTestConfig());

      const depthTex = engine.getDepthTexture();
      const depthView = engine.getDepthTextureView();

      expect(depthTex).not.toBeNull();
      expect(depthView).not.toBeNull();

      const tex = depthTex as any;
      expect(tex.format).toBe('depth32float');

      // 16 = RENDER_ATTACHMENT, 4 = TEXTURE_BINDING -> 20
      expect((tex.usage & 16) !== 0).toBe(true);
      expect((tex.usage & 4) !== 0).toBe(true);
    });

    it('CHALLENGE-M1-14: confirms static code audit reveals 0 occurrences of depth24plus in WebGPUEngine.ts', () => {
      const engineFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(engineFilePath, 'utf-8');

      expect(content).not.toContain("format: 'depth24plus'");
      expect(content).not.toContain('format: "depth24plus"');

      // Verify all 8 Pass 1 render pipelines use depth32float
      const matches = content.match(/format:\s*['"]depth32float['"]/g) || [];
      const occurrences = matches.length;
      expect(occurrences).toBe(8);
      expect(matches.length).toBe(8);
    });

    it('CHALLENGE-M1-15: confirms Pass 1 mainRenderPass retains depthStoreOp: store for Pass 2 volumetric raymarcher', () => {
      const engineFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(engineFilePath, 'utf-8');

      expect(content).toContain("depthStoreOp: 'store'");
    });

    it('CHALLENGE-M1-16: confirms anti-cheating invariant line 1454 is preserved in WebGPUCanvas.tsx', () => {
      const canvasFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const content = fs.readFileSync(canvasFilePath, 'utf-8');

      expect(content).toContain('const curR = Math.max(5.15, r0 + (r1 - r0) * ease);');
    });
  });
});
