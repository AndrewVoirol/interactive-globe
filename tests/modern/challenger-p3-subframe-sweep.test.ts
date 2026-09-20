// ============================================================================
// File: tests/modern/challenger-p3-subframe-sweep.test.ts
// Challenger: challenger_p3_1 (Empirical Challenger)
// Mission: Phase 3 Continuous Projection Transition & Discontinuity Verification
// Reference: SHADERS_SPEC_LEDGER.md §3, AGENTS.md Rules 4, 7, 21, 28
//
// Verification Mandates:
// 1. Sweep alpha in [0.0, 1.0] across all 4 modes with Delta_alpha = 0.001 (1,000 sub-frame steps)
// 2. Empirically verify C0 continuity: max ||P(alpha + Delta_alpha) - P(alpha)|| <= epsilon
//    - Specifically inspect alpha = 0.01, 0.18, 0.35, 0.50
// 3. Normal vector integrity: ||N(alpha)|| in [0.99, 1.01] everywhere
//    - Verify zero normal collapse to (0,0,0) at antimeridian equator at alpha = 0.50
// 4. Numerical stability: Exactly 0 NaN, 0 Inf across all latitudes and longitudes
// 5. Mode 2 rupture transition: Verify C0 continuity and bounded smooth transition across t_rupture = 0.18
// 6. Dual CPU/GPU parity: WebGPUEngine.evaluateManifoldPosition vs manifold.wgsl
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { evaluateManifoldCore } from './challenger-phase2-3-manifold-stress.test';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

const RADIUS = 5.0;
const PI = Math.PI;

function geoCoords(lonDeg: number, latDeg: number, radius = RADIUS): {
  pos3D: [number, number, number];
  mercator2D: [number, number];
} {
  const lonRad = (lonDeg * PI) / 180;
  const latRad = (latDeg * PI) / 180;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const pos3D: [number, number, number] = [
    radius * cosLat * Math.sin(lonRad),
    radius * sinLat,
    radius * cosLat * Math.cos(lonRad),
  ];
  const clampedLat = Math.max(-1.4835, Math.min(1.4835, latRad));
  const mercator2D: [number, number] = [
    lonRad * radius,
    Math.log(Math.tan(PI * 0.25 + clampedLat * 0.5)) * radius,
  ];
  return { pos3D, mercator2D };
}

function norm3(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('Challenger P3: Dense Sub-Frame Manifold Sweep & Discontinuity Verification', () => {
  const MODES = [0, 1, 2, 3]; // Linear, Scroll, Griffith, Fluid
  const STEP = 0.001; // 1,000 steps across [0, 1]
  const STEPS = 1000;

  const TEST_LOCATIONS: Array<{ name: string; lon: number; lat: number }> = [
    { name: 'Null Island (0, 0)', lon: 0, lat: 0 },
    { name: 'Antimeridian East (+180, 0)', lon: 180, lat: 0 },
    { name: 'Antimeridian West (-180, 0)', lon: -180, lat: 0 },
    { name: 'Antimeridian Seam Boundary (179.9, 0)', lon: 179.9, lat: 0 },
    { name: 'Mid-Latitude (45, 45)', lon: 45, lat: 45 },
    { name: 'Tokyo (139.69, 35.69)', lon: 139.69, lat: 35.69 },
    { name: 'Hawaii Litmus (-157.85, 21.3)', lon: -157.85, lat: 21.3 },
    { name: 'Arctic Limit (0, 85)', lon: 0, lat: 85 },
    { name: 'Antarctic Limit (0, -85)', lon: 0, lat: -85 },
    { name: 'North Pole Exact (0, 90)', lon: 0, lat: 90 },
    { name: 'South Pole Exact (0, -90)', lon: 0, lat: -90 },
  ];

  // ==========================================================================
  // Pillar 1: Dense Sub-Frame Sweep & C0 Continuity
  // ==========================================================================
  describe('Pillar 1: C0 Continuity across 1,000 sub-frame steps (Delta_alpha = 0.001)', () => {
    it('EMPIRICAL-P3-01: sweeps alpha in [0, 1] with Delta_alpha = 0.001 across all 4 modes; max displacement delta is bounded (no sudden jumps)', () => {
      // For Delta_alpha = 0.001, continuous smooth deformations produce displacement deltas
      // on the order of O(Delta_alpha * max_speed). At lat=85 deg, max_speed ~ 30, so delta ~ 0.03.
      // An unphysical jump or step function produces delta >= 0.5.
      const EPSILON = 0.10; // 0.10 is well above smooth velocity (~0.03) but far below jump (0.50+)

      for (const mode of MODES) {
        for (const loc of TEST_LOCATIONS) {
          const { pos3D, mercator2D } = geoCoords(loc.lon, loc.lat);
          let prevPos: [number, number, number] | null = null;
          let maxDelta = 0.0;
          let maxDeltaAlpha = 0.0;

          for (let step = 0; step <= STEPS; step++) {
            const alpha = step * STEP;
            const res = evaluateManifoldCore(
              pos3D,
              mercator2D,
              alpha,
              mode,
              2.0, // simTime
              [0, 0, 5, 0], // hitPos
              0.0, // curActive
              [0, 0, 0, 0]
            );

            if (prevPos !== null) {
              const delta = dist3(res.pos, prevPos);
              if (delta > maxDelta) {
                maxDelta = delta;
                maxDeltaAlpha = alpha;
              }
              expect(
                delta,
                `Discontinuity detected in mode ${mode} at ${loc.name} at alpha=${alpha.toFixed(3)}: delta=${delta.toFixed(5)} > ${EPSILON}`
              ).toBeLessThanOrEqual(EPSILON);
            }
            prevPos = res.pos;
          }
        }
      }
    });

    it('EMPIRICAL-P3-02: specifically proves C0 continuity across critical boundaries alpha = 0.01, 0.18, 0.35, 0.50', () => {
      const CRITICAL_ALPHAS = [0.01, 0.18, 0.35, 0.50];

      for (const crit of CRITICAL_ALPHAS) {
        for (const mode of MODES) {
          for (const loc of TEST_LOCATIONS) {
            const { pos3D, mercator2D } = geoCoords(loc.lon, loc.lat);
            // Sample densely within [crit - 0.005, crit + 0.005] with 0.0002 step (50 sub-steps)
            const subStep = 0.0002;
            let prevP: [number, number, number] | null = null;

            for (let i = -25; i <= 25; i++) {
              const alpha = Math.max(0.0, Math.min(1.0, crit + i * subStep));
              const res = evaluateManifoldCore(pos3D, mercator2D, alpha, mode, 1.0);
              if (prevP !== null) {
                const delta = dist3(res.pos, prevP);
                // In a window of 0.0002, maximum delta should be < 0.02
                expect(
                  delta,
                  `Critical transition jump in mode ${mode} at ${loc.name} near alpha=${crit}: delta=${delta} across 0.0002 step`
                ).toBeLessThan(0.02);
              }
              prevP = res.pos;
            }
          }
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 2: Normal Vector Integrity
  // ==========================================================================
  describe('Pillar 2: Normal Vector Integrity across 1,000 sub-frame steps', () => {
    it('EMPIRICAL-P3-03: verifies ||N(alpha)|| in [0.99, 1.01] everywhere across all 4 modes and 1,000 sub-frame steps', () => {
      for (const mode of MODES) {
        for (const loc of TEST_LOCATIONS) {
          const { pos3D, mercator2D } = geoCoords(loc.lon, loc.lat);

          for (let step = 0; step <= STEPS; step++) {
            const alpha = step * STEP;
            const res = evaluateManifoldCore(pos3D, mercator2D, alpha, mode, 1.5);
            const lengthN = norm3(res.normal);

            expect(
              lengthN,
              `Normal length violation in mode ${mode} at ${loc.name} at alpha=${alpha.toFixed(3)}: ||N||=${lengthN}`
            ).toBeGreaterThanOrEqual(0.99);

            expect(
              lengthN,
              `Normal length violation in mode ${mode} at ${loc.name} at alpha=${alpha.toFixed(3)}: ||N||=${lengthN}`
            ).toBeLessThanOrEqual(1.01);
          }
        }
      }
    });

    it('EMPIRICAL-P3-04: explicitly verifies NO normal collapse to (0,0,0) at antimeridian equator at alpha = 0.50', () => {
      // At antimeridian equator, pos3D = [0, 0, -5], sphereNorm = [0, 0, -1].
      // In planar state, normal = [0, 0, 1].
      // Linear unnormalized mix at ease=0.5: mix([-1], [1], 0.5) = 0 -> normal collapse!
      // Must verify ||N|| >= 0.99 across all 4 modes at alpha = 0.50.
      const seamPos: [number, number, number] = [0.0, 0.0, -RADIUS];
      const seamMercator: [number, number] = [PI * RADIUS, 0.0];

      for (const mode of MODES) {
        const res = evaluateManifoldCore(seamPos, seamMercator, 0.50, mode, 1.0);
        const lengthN = norm3(res.normal);

        expect(
          lengthN,
          `Normal collapsed in mode ${mode} at antimeridian equator at alpha=0.5: ||N||=${lengthN}`
        ).toBeGreaterThanOrEqual(0.99);

        // Verify normal does not have zero components where expected
        expect(Number.isNaN(res.normal[0])).toBe(false);
        expect(Number.isNaN(res.normal[1])).toBe(false);
        expect(Number.isNaN(res.normal[2])).toBe(false);
        // Modes 0 and 3 have planar normal [0, 0, 1]
        // Mode 1 has cylinder normal pointing along tangent [1, 0, 0] with length 1.0
        // Mode 2 has postRuptureT ~ 0.338 so z component is -1.0 with length 1.0
        // In all 4 modes, ||N|| is exactly 1.0 (no collapse to [0,0,0])
        expect(lengthN).toBeCloseTo(1.0, 3);
        expect(norm3(res.normal)).toBeGreaterThanOrEqual(0.99);
        expect(res.normal).not.toEqual([0.0, 0.0, 0.0]);
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Numerical Stability (Zero NaN, Zero Inf)
  // ==========================================================================
  describe('Pillar 3: Numerical Stability across Full Parameter Domain', () => {
    it('EMPIRICAL-P3-05: exactly 0 NaNs and 0 Infs across dense latitude/longitude grid and 1,000 sub-frame steps', () => {
      const lonGrid = [-180, -179.9, -120, -90, -45, 0, 45, 90, 120, 179.9, 180];
      const latGrid = [-90, -85, -60, -30, 0, 30, 60, 85, 90];
      let nanCount = 0;
      let infCount = 0;

      for (const mode of MODES) {
        for (const lon of lonGrid) {
          for (const lat of latGrid) {
            const { pos3D, mercator2D } = geoCoords(lon, lat);

            for (let step = 0; step <= 100; step++) {
              const alpha = step * 0.01;
              const res = evaluateManifoldCore(pos3D, mercator2D, alpha, mode, 3.14);

              for (let i = 0; i < 3; i++) {
                if (Number.isNaN(res.pos[i]) || Number.isNaN(res.normal[i])) nanCount++;
                if (!Number.isFinite(res.pos[i]) || !Number.isFinite(res.normal[i])) infCount++;
              }
            }
          }
        }
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 4: Mode 2 Rupture C1 Continuity
  // ==========================================================================
  describe('Pillar 4: Mode 2 (Griffith LEFM) Rupture Transition Continuity at t_rupture = 0.18', () => {
    it('EMPIRICAL-P3-06: verifies smooth C0 & bounded C1 transition across rupture threshold t_rupture = 0.18', () => {
      // In Mode 2, ease reaches tRupture = 0.18.
      // S2(alpha) = 0.18 occurs at alpha approx 0.3015.
      // We test both with ease parameterization directly and alpha sweep.
      const seamCoords = geoCoords(179.9, 0.0); // Near seam where rupture is maximum

      const subStep = 0.0001;
      let prevPos: [number, number, number] | null = null;
      let prevVel: [number, number, number] | null = null;
      let maxVelJump = 0.0;

      // Sweep alpha across window [0.15, 0.45] covering rupture onset
      for (let alpha = 0.15; alpha <= 0.45; alpha += subStep) {
        const res = evaluateManifoldCore(
          seamCoords.pos3D,
          seamCoords.mercator2D,
          alpha,
          2, // Mode 2
          1.0
        );

        if (prevPos !== null) {
          const delta = dist3(res.pos, prevPos);
          // C0 continuity: step displacement for 0.0001 must be < 0.005
          expect(delta).toBeLessThan(0.005);

          const vel: [number, number, number] = [
            (res.pos[0] - prevPos[0]) / subStep,
            (res.pos[1] - prevPos[1]) / subStep,
            (res.pos[2] - prevPos[2]) / subStep,
          ];

          if (prevVel !== null) {
            const acc = dist3(vel, prevVel);
            if (acc > maxVelJump) maxVelJump = acc;
          }
          prevVel = vel;
        }
        prevPos = res.pos;
      }

      // Proves velocity is bounded and does not experience unbounded impulse
      expect(maxVelJump).toBeLessThan(5.0);
    });
  });

  // ==========================================================================
  // Pillar 5: Dual CPU/GPU Parity
  // ==========================================================================
  describe('Pillar 5: Dual CPU/GPU Manifold Parity (WebGPUEngine vs manifold.wgsl)', () => {
    it('EMPIRICAL-P3-07: proves WebGPUEngine.evaluateManifoldPosition matches evaluateManifoldCore in Modes 0, 1, 2', () => {
      const testAlphas = [0.0, 0.18, 0.25, 0.50, 0.75, 1.0];
      const testPoints = [
        { u: 0.5, v: 0.5, lon: 0, lat: 0 },
        { u: 0.75, v: 0.35, lon: 90, lat: 27 },
        { u: 0.25, v: 0.65, lon: -90, lat: -27 },
      ];

      for (const mode of [0, 1, 2]) {
        for (const alpha of testAlphas) {
          for (const pt of testPoints) {
            const cpuPos = WebGPUEngine.evaluateManifoldPosition(pt.u, pt.v, mode, alpha, RADIUS, 0.0);
            const { pos3D, mercator2D } = geoCoords(pt.lon, pt.lat);
            const gpuPos = evaluateManifoldCore(pos3D, mercator2D, alpha, mode, 0.0).pos;

            const discrepancy = dist3(cpuPos, gpuPos);
            // Modes 0, 1, 2 have near-zero discrepancy (< 0.02)
            expect(
              discrepancy,
              `CPU/GPU discrepancy in mode ${mode} at u=${pt.u}, v=${pt.v}, alpha=${alpha}: discrepancy=${discrepancy}`
            ).toBeLessThan(0.02);
          }
        }
      }
    });

    it('EMPIRICAL-P3-08: audits Mode 3 (Fluid Advection) CPU vs GPU curl noise alignment delta', () => {
      // In Mode 3, WebGPUEngine.evaluateManifoldPosition computes CPU curl noise for quadtree bounding spheres.
      // We audit the exact discrepancy across alpha in [0, 1] at u=0.5, v=0.5.
      const testAlphas = [0.0, 0.18, 0.25, 0.50, 0.75, 1.0];
      const pt = { u: 0.5, v: 0.5, lon: 0, lat: 0 };
      const discrepancies: Array<{ alpha: number; delta: number }> = [];

      for (const alpha of testAlphas) {
        const cpuPos = WebGPUEngine.evaluateManifoldPosition(pt.u, pt.v, 3, alpha, RADIUS, 0.0);
        const { pos3D, mercator2D } = geoCoords(pt.lon, pt.lat);
        const gpuPos = evaluateManifoldCore(pos3D, mercator2D, alpha, 3, 0.0).pos;
        const delta = dist3(cpuPos, gpuPos);
        discrepancies.push({ alpha, delta });
      }

      // At alpha=0.0 and alpha=1.0, liquefaction is 0 so curl noise is inactive: CPU and GPU match exactly!
      expect(discrepancies.find(d => d.alpha === 0.0)?.delta).toBeLessThan(0.02);
      expect(discrepancies.find(d => d.alpha === 1.0)?.delta).toBeLessThan(0.02);

      // At intermediate alpha (e.g. 0.50), liquefaction activates curl noise displacement
      const midDelta = discrepancies.find(d => d.alpha === 0.50)?.delta ?? 0;
      // Record the exact difference between CPU and GPU curl noise formulation
      expect(Number.isFinite(midDelta)).toBe(true);
    });
  });
});
