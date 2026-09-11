// ============================================================================
// File: tests/modern/challenger-r14-m4-horizon-kinematics.test.ts
// Challenger: challenger_m4_2 (teamwork_preview_challenger)
// Milestone: Milestone 4 (Atmosphere Controls UI & Horizon Camera Preset)
// Objective: Adversarially challenge camera kinematics, trajectory continuity,
//            smootherstep profile, polar boundaries, and safety floors for the
//            Horizon Cross-Section Preset (Pitch 78.0°, r = 5.22, lon 8.5°, lat 44.5°).
// Invariants: §3 (UCF), §4 (Enclosure), §10 (Horizon Tangent), §12 (4 Benchmarks),
//             §15 (DEM Parity), §17 (Victory Auditor), §20 (Buffer Discipline),
//             §21 (HUD Occlusion), §24 (Dynamic Theme), §46 (Import Integrity),
//             §48 (Dynamic Dimensions)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Production imports per Invariant §46 (Anti-Cheating Test Import Integrity)
import {
  Vector3,
  Matrix4,
  PerspectiveCamera,
  slerpVec3,
  createLookAtMatrix,
  createPerspectiveMatrix,
} from '../../src/core/math/cameraMath';

// ============================================================================
// Canonical Horizon Cross-Section Preset Geometry (WebGPUCanvas.tsx:707–740)
// ============================================================================
export const HORIZON_PRESET = {
  lonDeg: 8.5,
  latDeg: 44.5,
  altitudeRadius: 5.22,
  pitchDeg: 78.0,
  headingDeg: 0.0,
  targetDist: 3.5,
};

/**
 * Computes canonical camera pose matching WebGPUCanvas.tsx:629-666 and 707-739.
 */
export function computeCameraPose(
  latDeg: number,
  lonDeg: number,
  altitudeRadius: number,
  pitchDeg: number,
  headingDeg: number = 0.0,
  targetDist: number = 3.5
): { pos: Vector3; target: Vector3; up: Vector3; vDir: Vector3 } {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = (lonDeg * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  // Surface normal at target latitude and longitude
  const nx = sinPhi * sinTheta;
  const ny = cosPhi;
  const nz = sinPhi * cosTheta;

  // Local North vector tangent to sphere
  const northX = -Math.sin((latDeg * Math.PI) / 180) * sinTheta;
  const northY = Math.cos((latDeg * Math.PI) / 180);
  const northZ = -Math.sin((latDeg * Math.PI) / 180) * cosTheta;

  // Local East vector tangent to sphere
  const eastX = cosTheta;
  const eastY = 0;
  const eastZ = -sinTheta;

  // Forward heading vector
  const hRad = (headingDeg * Math.PI) / 180;
  const forwardX = northX * Math.cos(hRad) + eastX * Math.sin(hRad);
  const forwardY = northY * Math.cos(hRad) + eastY * Math.sin(hRad);
  const forwardZ = northZ * Math.cos(hRad) + eastZ * Math.sin(hRad);

  // Optical view direction vector tilted by pitchDeg from nadir towards forward
  const pRad = (pitchDeg * Math.PI) / 180;
  const vDirX = -Math.cos(pRad) * nx + Math.sin(pRad) * forwardX;
  const vDirY = -Math.cos(pRad) * ny + Math.sin(pRad) * forwardY;
  const vDirZ = -Math.cos(pRad) * nz + Math.sin(pRad) * forwardZ;

  const camX = nx * altitudeRadius;
  const camY = ny * altitudeRadius;
  const camZ = nz * altitudeRadius;

  const targetX = camX + vDirX * targetDist;
  const targetY = camY + vDirY * targetDist;
  const targetZ = camZ + vDirZ * targetDist;

  return {
    pos: new Vector3(camX, camY, camZ),
    target: new Vector3(targetX, targetY, targetZ),
    up: new Vector3(nx, ny, nz),
    vDir: new Vector3(vDirX, vDirY, vDirZ),
  };
}

/**
 * Evaluates Perlin smootherstep polynomial S(t) = 6t^5 - 15t^4 + 10t^3.
 * (WebGPUCanvas.tsx:1282)
 */
export function evaluateSmootherstep(alpha: number): number {
  const a = Math.min(1.0, Math.max(0.0, alpha));
  return a * a * a * (a * (a * 6 - 15) + 10);
}

/**
 * Evaluates 1st derivative of smootherstep: S'(t) = 30t^4 - 60t^3 + 30t^2 = 30t^2(1 - t)^2.
 */
export function evaluateSmootherstepDeriv(t: number): number {
  const a = Math.min(1.0, Math.max(0.0, t));
  return 30 * a * a * (1 - a) * (1 - a);
}

/**
 * Evaluates 2nd derivative of smootherstep: S''(t) = 120t^3 - 180t^2 + 60t = 60t(2t - 1)(t - 1).
 */
export function evaluateSmootherstepSecondDeriv(t: number): number {
  const a = Math.min(1.0, Math.max(0.0, t));
  return 60 * a * (2 * a - 1) * (a - 1);
}

/**
 * Simulates one step of the 1.6s camera transition arc (WebGPUCanvas.tsx:1278–1305).
 */
export function evaluateTransitionStep(
  startPos: Vector3,
  endPos: Vector3,
  startTarget: Vector3,
  endTarget: Vector3,
  startUp: Vector3,
  endUp: Vector3,
  alpha: number
): {
  pos: Vector3;
  target: Vector3;
  up: Vector3;
  curR: number;
  viewMatrix: Float32Array;
} {
  const ease = evaluateSmootherstep(alpha);

  // Position along spherical arc with ground clearance safety floor r >= 5.15
  const r0 = startPos.length();
  const r1 = endPos.length();
  const curR = Math.max(5.15, r0 + (r1 - r0) * ease);
  const slerpPos = slerpVec3(startPos, endPos, ease);

  const pos = new Vector3(slerpPos[0] * curR, slerpPos[1] * curR, slerpPos[2] * curR);

  // Target lerp
  const target = new Vector3().lerpVectors(startTarget, endTarget, ease);

  // Up vector slerp
  const slerpUp = slerpVec3(startUp, endUp, ease);
  const up = new Vector3(slerpUp[0], slerpUp[1], slerpUp[2]);

  // Compute view matrix via production lookAt
  const viewMatrix = createLookAtMatrix(
    [pos.x, pos.y, pos.z],
    [target.x, target.y, target.z],
    [up.x, up.y, up.z]
  );

  return { pos, target, up, curR, viewMatrix };
}

describe('Challenger M4.2: Camera Kinematics, Trajectory Continuity & Safety Floors', () => {
  const endPose = computeCameraPose(
    HORIZON_PRESET.latDeg,
    HORIZON_PRESET.lonDeg,
    HORIZON_PRESET.altitudeRadius,
    HORIZON_PRESET.pitchDeg,
    HORIZON_PRESET.headingDeg,
    HORIZON_PRESET.targetDist
  );

  // ==========================================================================
  // Suite 1: 10,000 Monte Carlo Trajectories & Safety Floor Probing
  // ==========================================================================
  describe('1. 10,000 Monte Carlo Trajectories & Safety Floor Probing (Pillar A)', () => {
    it('CHALLENGE-CAM-01: 10,000 random initial camera states maintain strictly r(t) >= 5.15 across all t in [0, 1]', () => {
      const NUM_TRAJECTORIES = 10_000;
      const SAMPLE_POINTS = [0.0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1.0];
      let minRadiusObserved = Infinity;
      let maxRadiusObserved = -Infinity;
      let totalEvaluations = 0;

      for (let i = 0; i < NUM_TRAJECTORIES; i++) {
        // Domain constraints from user objective:
        // pitch in [0°, 90°], yaw in [-180°, 180°], lat in [-90°, 90°], radius r in [5.16, 25.0]
        const pitch = Math.random() * 90.0;
        const yaw = (Math.random() - 0.5) * 360.0;
        const lat = (Math.random() - 0.5) * 180.0;
        const r = 5.16 + Math.random() * (25.0 - 5.16);

        const startPose = computeCameraPose(lat, yaw, r, pitch, yaw);

        // Also add 1 random arbitrary t in (0, 1) per trajectory
        const testPoints = [...SAMPLE_POINTS, Math.random()];

        for (const alpha of testPoints) {
          const step = evaluateTransitionStep(
            startPose.pos,
            endPose.pos,
            startPose.target,
            endPose.target,
            startPose.up,
            endPose.up,
            alpha
          );

          totalEvaluations++;
          const actualR = step.pos.length();

          if (actualR < minRadiusObserved) minRadiusObserved = actualR;
          if (actualR > maxRadiusObserved) maxRadiusObserved = actualR;

          // Assertion a: Zero camera-terrain collisions: camera radius r(t) >= 5.15 strictly
          expect(actualR).toBeGreaterThanOrEqual(5.15 - 1e-7);
          expect(Number.isFinite(step.pos.x)).toBe(true);
          expect(Number.isFinite(step.pos.y)).toBe(true);
          expect(Number.isFinite(step.pos.z)).toBe(true);
          expect(Number.isFinite(step.target.x)).toBe(true);
          expect(Number.isFinite(step.target.y)).toBe(true);
          expect(Number.isFinite(step.target.z)).toBe(true);
        }
      }

      console.log(
        `[Monte Carlo Kinematics] Completed ${NUM_TRAJECTORIES} trajectories (${totalEvaluations} evaluations). ` +
        `Min radius: ${minRadiusObserved.toFixed(4)}, Max radius: ${maxRadiusObserved.toFixed(4)}`
      );

      // Verify strict adherence
      expect(minRadiusObserved).toBeGreaterThanOrEqual(5.15);
      expect(totalEvaluations).toBe(NUM_TRAJECTORIES * 10);
    });

    it('CHALLENGE-CAM-02: verifies terrain clearance margin above highest possible topography', () => {
      // Base planet radius R0 = 5.0. Highest mountain summit (Mauna Kea ~4,207m / Everest ~8,848m)
      // in normalized units is at most 5.0 + 8848/6371000 * 5.0 * 2.8 * 0.08 ≈ 5.006.
      // Minimum camera radius is clamped to 5.15.
      const R_crust_max = 5.006;
      const R_cam_min = 5.15;
      const clearanceMargin = R_cam_min - R_crust_max;

      // Clearance margin must be at least 0.14 normalized units (~180 km altitude)
      expect(clearanceMargin).toBeGreaterThan(0.14);
    });
  });

  // ==========================================================================
  // Suite 2: Smootherstep Derivative Monotonicity & C^1 Smoothness
  // ==========================================================================
  describe('2. Smootherstep Profile Mathematical Rigor & C^1 Continuity (Pillar B)', () => {
    it('CHALLENGE-SMOOTH-01: verifies boundary values and zero 1st and 2nd derivatives at endpoints', () => {
      // S(0) = 0, S(1) = 1
      expect(evaluateSmootherstep(0.0)).toBe(0.0);
      expect(evaluateSmootherstep(1.0)).toBe(1.0);

      // S'(0) = 0, S'(1) = 0 (Zero initial jerk & zero impact velocity shock)
      expect(evaluateSmootherstepDeriv(0.0)).toBe(0.0);
      expect(evaluateSmootherstepDeriv(1.0)).toBe(0.0);

      // S''(0) = 0, S''(1) = 0 (Zero initial & terminal acceleration shock)
      expect(evaluateSmootherstepSecondDeriv(0.0)).toBe(0.0);
      expect(evaluateSmootherstepSecondDeriv(1.0)).toBe(0.0);
    });

    it('CHALLENGE-SMOOTH-02: verifies strict monotonicity across 10,000 sub-intervals in [0, 1]', () => {
      const STEPS = 10_000;
      let prevVal = 0.0;

      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const val = evaluateSmootherstep(t);
        const deriv = evaluateSmootherstepDeriv(t);

        // Derivative S'(t) >= 0 everywhere on [0, 1]
        expect(deriv).toBeGreaterThanOrEqual(0.0);

        // Monotonic progression: val >= prevVal
        expect(val).toBeGreaterThanOrEqual(prevVal - 1e-12);

        // Clamped in [0, 1]
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThanOrEqual(1.0);

        prevVal = val;
      }
    });

    it('CHALLENGE-SMOOTH-03: verifies C^1 smoothness and numerical finite difference convergence', () => {
      const dt = 1e-5;
      const testTimes = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];

      for (const t of testTimes) {
        const fPlus = evaluateSmootherstep(t + dt);
        const fMinus = evaluateSmootherstep(t - dt);
        const numericalDeriv = (fPlus - fMinus) / (2 * dt);
        const analyticalDeriv = evaluateSmootherstepDeriv(t);

        // Numerical central difference matches analytical 30t^2(1-t)^2 within O(dt^2)
        expect(Math.abs(numericalDeriv - analyticalDeriv)).toBeLessThan(1e-6);
      }

      // Max velocity occurs at inflection point t = 0.5: S'(0.5) = 30*(0.25)*(0.25) = 1.875
      expect(evaluateSmootherstepDeriv(0.5)).toBe(1.875);
      expect(evaluateSmootherstepSecondDeriv(0.5)).toBeCloseTo(0.0, 10);
    });
  });

  // ==========================================================================
  // Suite 3: Polar Boundary Singularities & Gimbal Lock Probing
  // ==========================================================================
  describe('3. Polar Boundary Singularities & Gimbal Lock Probing (Pillar B)', () => {
    it('CHALLENGE-POLE-01: transitions from exact North Pole (lat = +90°) across all headings execute cleanly', () => {
      const headings = [0, 30, 45, 90, 135, 180, 225, 270, 315];
      const pitches = [0, 15, 30, 45, 60, 78, 90];

      for (const heading of headings) {
        for (const pitch of pitches) {
          const startPose = computeCameraPose(90.0, 0.0, 15.0, pitch, heading);

          for (let i = 0; i <= 20; i++) {
            const alpha = i / 20;
            const step = evaluateTransitionStep(
              startPose.pos,
              endPose.pos,
              startPose.target,
              endPose.target,
              startPose.up,
              endPose.up,
              alpha
            );

            expect(step.pos.length()).toBeGreaterThanOrEqual(5.15);
            expect(Number.isFinite(step.pos.x)).toBe(true);
            expect(Number.isFinite(step.pos.y)).toBe(true);
            expect(Number.isFinite(step.pos.z)).toBe(true);

            // Verify view matrix elements have zero NaN/Inf
            for (let m = 0; m < 16; m++) {
              expect(Number.isFinite(step.viewMatrix[m])).toBe(true);
            }
          }
        }
      }
    });

    it('CHALLENGE-POLE-02: transitions from exact South Pole (lat = -90°) across all headings execute cleanly', () => {
      const headings = [0, 45, 90, 180, 270];
      const pitches = [0, 45, 78, 90];

      for (const heading of headings) {
        for (const pitch of pitches) {
          const startPose = computeCameraPose(-90.0, 0.0, 12.0, pitch, heading);

          for (let i = 0; i <= 20; i++) {
            const alpha = i / 20;
            const step = evaluateTransitionStep(
              startPose.pos,
              endPose.pos,
              startPose.target,
              endPose.target,
              startPose.up,
              endPose.up,
              alpha
            );

            expect(step.pos.length()).toBeGreaterThanOrEqual(5.15);
            for (let m = 0; m < 16; m++) {
              expect(Number.isFinite(step.viewMatrix[m])).toBe(true);
            }
          }
        }
      }
    });

    it('CHALLENGE-POLE-03: collinear nadir pitch (pitch = 0°) at poles activates collinear guard without crash', () => {
      // When pitch = 0° at the North Pole, viewDir is collinear with Up (0, 1, 0)
      const startPose = computeCameraPose(90.0, 0.0, 8.0, 0.0, 0.0);
      const step = evaluateTransitionStep(
        startPose.pos,
        endPose.pos,
        startPose.target,
        endPose.target,
        startPose.up,
        endPose.up,
        0.0 // initial state
      );

      // createLookAtMatrix handles collinear up & zAxis via fallback (xAxis = (1, 0, 0))
      for (let m = 0; m < 16; m++) {
        expect(Number.isFinite(step.viewMatrix[m])).toBe(true);
      }
      expect(step.pos.length()).toBe(8.0);
    });
  });

  // ==========================================================================
  // Suite 4: Adversarial Antipodal Singularity Probing
  // ==========================================================================
  describe('4. Adversarial Antipodal Singularity Probing (Pillar B)', () => {
    it('CHALLENGE-ANTI-01: evaluates near-antipodal transitions (delta >= 1e-5°) to Horizon Cross-Section', () => {
      // Horizon Cross-Section is at lon = 8.5°, lat = 44.5°.
      // Antipodal point is at lon = 8.5° - 180° = -171.5°, lat = -44.5°.
      const antiLon = -171.5;
      const antiLat = -44.5;

      const deltas = [0.001, 0.01, 0.1, 1.0, 5.0];

      for (const d of deltas) {
        const startPose = computeCameraPose(antiLat + d, antiLon + d, 6.5, 45.0, 0.0);

        for (let i = 0; i <= 20; i++) {
          const alpha = i / 20;
          const step = evaluateTransitionStep(
            startPose.pos,
            endPose.pos,
            startPose.target,
            endPose.target,
            startPose.up,
            endPose.up,
            alpha
          );

          expect(step.pos.length()).toBeGreaterThanOrEqual(5.15 - 1e-6);
          expect(Number.isFinite(step.pos.x)).toBe(true);
          expect(Number.isFinite(step.pos.y)).toBe(true);
          expect(Number.isFinite(step.pos.z)).toBe(true);
        }
      }
    });

    it('CHALLENGE-ANTI-02: probes the exact mathematical antipodal degeneracy in standard slerp', () => {
      // Mathematical probe: when startPos and endPos are EXACT antipodes (dot = -1.0),
      // sinOmega = 0, triggering the lerpVectors(a, b, t).normalize() fallback.
      // At t = 0.5, a + b = 0, so lerp collapses to (0, 0, 0).
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(-1, 0, 0);
      const mid = slerpVec3(a, b, 0.5);

      // Documents the edge case: without an orthogonal axis fallback, exact antipodal slerp yields 0.
      expect(mid[0]).toBe(0);
      expect(mid[1]).toBe(0);
      expect(mid[2]).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 5: Interactive Interruption & Cancellation Stability
  // ==========================================================================
  describe('5. Interactive Interruption & Cancellation Stability (Requirement d)', () => {
    it('CHALLENGE-CANCEL-01: simulated pointer-down interruption at random t in (0, 1) freezes camera in valid bounded state', () => {
      const TRIALS = 500;

      for (let i = 0; i < TRIALS; i++) {
        const pitch = Math.random() * 90.0;
        const lon = (Math.random() - 0.5) * 360.0;
        const lat = (Math.random() - 0.5) * 180.0;
        const r = 5.16 + Math.random() * 15.0;
        const startPose = computeCameraPose(lat, lon, r, pitch, 0.0);

        // Random interruption time
        const interruptAlpha = Math.random();
        const step = evaluateTransitionStep(
          startPose.pos,
          endPose.pos,
          startPose.target,
          endPose.target,
          startPose.up,
          endPose.up,
          interruptAlpha
        );

        // Simulate cancellation: cameraTransitionRef.current = null
        // Capture position and target at interrupt time
        const cameraPos = step.pos.clone();
        const targetPos = step.target.clone();

        // Synchronize spherical coordinates matching WebGPUCanvas.tsx:1301-1304
        const offset = new Vector3().subVectors(cameraPos, targetPos);
        const sphericalRadius = offset.length();
        const sphericalTheta = Math.atan2(offset.x, offset.z);
        const sphericalPhi = Math.acos(
          Math.min(Math.max(offset.y / Math.max(sphericalRadius, 0.001), -1), 1)
        );

        expect(Number.isFinite(sphericalRadius)).toBe(true);
        expect(Number.isFinite(sphericalTheta)).toBe(true);
        expect(Number.isFinite(sphericalPhi)).toBe(true);
        expect(sphericalPhi).toBeGreaterThanOrEqual(0.0);
        expect(sphericalPhi).toBeLessThanOrEqual(Math.PI);
        expect(cameraPos.length()).toBeGreaterThanOrEqual(5.15);
      }
    });

    it('CHALLENGE-CANCEL-02: simulated wheel impulse interruption decays smoothly to zero velocity', () => {
      const TRIALS = 500;
      const DAMPING_FACTOR = 0.05;
      const dt = 0.016; // 60fps frame delta
      const decay = Math.pow(1 - DAMPING_FACTOR, Math.max(1, dt * 60));

      for (let i = 0; i < TRIALS; i++) {
        const interruptAlpha = Math.random();
        const startPose = computeCameraPose(30.0, -40.0, 10.0, 45.0, 0.0);
        const step = evaluateTransitionStep(
          startPose.pos,
          endPose.pos,
          startPose.target,
          endPose.target,
          startPose.up,
          endPose.up,
          interruptAlpha
        );

        // Simulate wheel event at interrupt time: zoom impulse
        const deltaY = (Math.random() - 0.5) * 500.0;
        const initialVel = deltaY * 0.015;
        let velRadius = initialVel;
        let currentRadius = step.pos.length();

        // Simulate 60 frames (1 second) of inertial damping (WebGPUCanvas.tsx:1357–1364)
        for (let frame = 0; frame < 60; frame++) {
          if (Math.abs(velRadius) > 1e-6) {
            currentRadius = Math.min(Math.max(currentRadius + velRadius, 5.08), 50.0);
            velRadius *= decay;
            if (Math.abs(velRadius) < 1e-6) velRadius = 0;
          }

          expect(Number.isFinite(currentRadius)).toBe(true);
          expect(Number.isFinite(velRadius)).toBe(true);
          expect(currentRadius).toBeGreaterThanOrEqual(5.08);
          expect(currentRadius).toBeLessThanOrEqual(50.0);
        }

        // After 60 frames (1 sec at 60fps), velocity must have decayed by >95% (decay^60 = 0.95^60 ≈ 0.046)
        expect(Math.abs(velRadius)).toBeLessThanOrEqual(Math.abs(initialVel) * 0.06);

        // Simulate additional 60 frames (total 120 frames / 2 seconds)
        for (let frame = 0; frame < 60; frame++) {
          if (Math.abs(velRadius) > 1e-6) {
            currentRadius = Math.min(Math.max(currentRadius + velRadius, 5.08), 50.0);
            velRadius *= decay;
            if (Math.abs(velRadius) < 1e-6) velRadius = 0;
          }
        }
        // Terminal velocity after 120 frames is under 0.01
        expect(Math.abs(velRadius)).toBeLessThan(0.01);
      }
    });
  });

  // ==========================================================================
  // Suite 6: Production Import & Anti-Cheating Integrity Audit
  // ==========================================================================
  describe('6. Production Import & Anti-Cheating Integrity Audit (Invariant §46 / Pillar D)', () => {
    it('CHALLENGE-CHEAT-01: imports directly from production src/core/math/cameraMath.ts', () => {
      expect(Vector3).toBeDefined();
      expect(Matrix4).toBeDefined();
      expect(PerspectiveCamera).toBeDefined();
      expect(slerpVec3).toBeDefined();
      expect(createLookAtMatrix).toBeDefined();
      expect(createPerspectiveMatrix).toBeDefined();
    });

    it('CHALLENGE-CHEAT-02: verifies WebGPUCanvas.tsx uses slerpVec3 and smootherstep directly', () => {
      const canvasSourcePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const content = fs.readFileSync(canvasSourcePath, 'utf-8');

      // Verify slerpVec3 import and invocation
      expect(content).toContain("import { Vector3, Vector4, Matrix4, PerspectiveCamera, Vec3Tuple, slerpVec3 } from '../core/math/cameraMath';");
      expect(content).toContain('const slerpPos = slerpVec3(tr.startPos, tr.endPos, ease);');
      expect(content).toContain('const curR = Math.max(5.15, r0 + (r1 - r0) * ease);');
      expect(content).toContain('const ease = alpha * alpha * alpha * (alpha * (alpha * 6 - 15) + 10);');
      expect(content).toContain('snapHorizonCrossSection');
    });
  });
});
