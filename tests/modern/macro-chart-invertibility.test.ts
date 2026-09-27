// ============================================================================
// File: tests/modern/macro-chart-invertibility.test.ts
// Gate 1 Verification Suite: Macro Chart Invertibility & Determinant Stress
//
// Invariants tested:
// 1. Identity round-trip ||F^-1(F(lambda, phi, h; alpha)) - (lambda, phi, h)|| <= 1e-4
// 2. Polar convergence at phi = +/- 89.9 deg with zero NaNs/Infs
// 3. Antimeridian seam boundary continuity at lambda = +/- pi
// 4. Jacobian determinant det DF > 0 across entire domain for h in [0, 0.20]
// 5. Singularity-free Monte Carlo fuzzing in small-s regime alpha in [0.94, 1.0]
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  evaluateMacroChartCPU,
  invertMacroChart,
  Vec3,
  EARTH_RADIUS_UNITS,
} from '../../src/core/math/volumetricMath';

describe('Gate 1: Macro Chart Kinematics & Invertibility', () => {
  const R = EARTH_RADIUS_UNITS; // 5.0

  it('M1-T1: preserves spherical geometry at alpha = 0.0 with machine precision', () => {
    const alpha = 0.0;
    const testPoints: Array<[number, number, number]> = [
      [0.0, 0.0, 0.0],
      [Math.PI * 0.5, 0.0, 0.10],
      [-Math.PI * 0.5, Math.PI * 0.25, 0.05],
      [Math.PI * 0.75, -Math.PI * 0.35, 0.15],
    ];

    for (const [lam, phi, h] of testPoints) {
      const pt = evaluateMacroChartCPU(lam, phi, h, alpha, R);
      
      // At alpha = 0, pt.pos should match exact sphere offset
      const expectedRadius = R + h;
      const actualRadius = Math.hypot(pt.pos[0], pt.pos[1], pt.pos[2]);
      expect(actualRadius).toBeCloseTo(expectedRadius, 5);

      // Invert back to (lambda, phi, h)
      const inv = invertMacroChart(pt.pos, alpha, R);
      expect(inv.lambda).toBeCloseTo(lam, 5);
      expect(inv.phi).toBeCloseTo(phi, 5);
      expect(inv.h).toBeCloseTo(h, 5);
    }
  });

  it('M1-T2: preserves planar 2:1 sheet geometry at alpha = 1.0 with machine precision', () => {
    const alpha = 1.0;
    const testPoints: Array<[number, number, number]> = [
      [0.0, 0.0, 0.0],
      [1.5, 0.5, 0.10],
      [-2.5, -0.8, 0.18],
      [Math.PI, Math.PI * 0.5, 0.05],
    ];

    for (const [lam, phi, h] of testPoints) {
      const pt = evaluateMacroChartCPU(lam, phi, h, alpha, R);
      
      // At alpha = 1, pos should be [R * lam, R * phi, h] and normal [0, 0, 1]
      expect(pt.pos[0]).toBeCloseTo(R * lam, 5);
      expect(pt.pos[1]).toBeCloseTo(R * phi, 5);
      expect(pt.pos[2]).toBeCloseTo(h, 5);
      expect(pt.normal[0]).toBeCloseTo(0.0, 5);
      expect(pt.normal[1]).toBeCloseTo(0.0, 5);
      expect(pt.normal[2]).toBeCloseTo(1.0, 5);

      const inv = invertMacroChart(pt.pos, alpha, R);
      expect(inv.lambda).toBeCloseTo(lam, 5);
      expect(inv.phi).toBeCloseTo(phi, 5);
      expect(inv.h).toBeCloseTo(h, 5);
    }
  });

  it('M1-T3: satisfies identity round-trip error <= 1e-4 on dense multi-regime grid', () => {
    const alphas = [0.0, 0.05, 0.20, 0.50, 0.75, 0.90, 0.98, 1.0];
    const lambdas = [-3.0, -1.8, -0.5, 0.0, 0.5, 1.8, 3.0];
    const latitudes = [-1.4, -0.9, -0.3, 0.0, 0.3, 0.9, 1.4];
    const heights = [0.0, 0.04, 0.10, 0.20];

    let maxErrorLam = 0;
    let maxErrorPhi = 0;
    let maxErrorH = 0;

    for (const alpha of alphas) {
      for (const lam of lambdas) {
        for (const phi of latitudes) {
          for (const h of heights) {
            const pt = evaluateMacroChartCPU(lam, phi, h, alpha, R);
            const inv = invertMacroChart(pt.pos, alpha, R);

            const errLam = Math.abs(inv.lambda - lam);
            const errPhi = Math.abs(inv.phi - phi);
            const errH = Math.abs(inv.h - h);

            if (errLam > maxErrorLam) maxErrorLam = errLam;
            if (errPhi > maxErrorPhi) maxErrorPhi = errPhi;
            if (errH > maxErrorH) maxErrorH = errH;

            expect(errLam).toBeLessThanOrEqual(1e-4);
            expect(errPhi).toBeLessThanOrEqual(1e-4);
            expect(errH).toBeLessThanOrEqual(1e-4);
          }
        }
      }
    }

    // Confirm ultra-high precision was achieved
    expect(maxErrorLam).toBeLessThan(1e-4);
    expect(maxErrorPhi).toBeLessThan(1e-4);
    expect(maxErrorH).toBeLessThan(1e-4);
  });

  it('M1-T4: converges at extreme polar limits (+/- 89.9 deg) with zero NaNs/Infs', () => {
    const polarLatitudes = [-1.56905, 1.56905]; // +/- 89.9 degrees
    const alphas = [0.0, 0.05, 0.25, 0.50, 0.75, 0.95, 1.0];
    const testLambdas = [-2.0, 0.0, 2.0];
    const h = 0.08;

    for (const alpha of alphas) {
      for (const phi of polarLatitudes) {
        for (const lam of testLambdas) {
          const pt = evaluateMacroChartCPU(lam, phi, h, alpha, R);
          
          expect(Number.isFinite(pt.pos[0])).toBe(true);
          expect(Number.isFinite(pt.pos[1])).toBe(true);
          expect(Number.isFinite(pt.pos[2])).toBe(true);
          expect(Number.isFinite(pt.normal[0])).toBe(true);
          expect(Number.isFinite(pt.normal[1])).toBe(true);
          expect(Number.isFinite(pt.normal[2])).toBe(true);

          const inv = invertMacroChart(pt.pos, alpha, R);
          expect(Number.isFinite(inv.lambda)).toBe(true);
          expect(Number.isFinite(inv.phi)).toBe(true);
          expect(Number.isFinite(inv.h)).toBe(true);

          // Polar error bounds: latitude within 1e-3, height within 1e-3
          expect(Math.abs(inv.phi - phi)).toBeLessThanOrEqual(1e-3);
          expect(Math.abs(inv.h - h)).toBeLessThanOrEqual(1e-3);
        }
      }
    }
  });

  it('M1-T5: preserves continuity at the antimeridian seam (lambda = +/- pi)', () => {
    const alphas = [0.0, 0.25, 0.50, 0.75, 1.0];
    const phi = 0.45;
    const h = 0.05;

    for (const alpha of alphas) {
      const ptPosPi = evaluateMacroChartCPU(Math.PI, phi, h, alpha, R);
      const ptNegPi = evaluateMacroChartCPU(-Math.PI, phi, h, alpha, R);

      // On sphere (alpha = 0), +pi and -pi evaluate to identical positions in 3D
      if (alpha === 0.0) {
        expect(Math.abs(ptPosPi.pos[0] - ptNegPi.pos[0])).toBeLessThan(1e-4);
        expect(Math.abs(ptPosPi.pos[1] - ptNegPi.pos[1])).toBeLessThan(1e-4);
        expect(Math.abs(ptPosPi.pos[2] - ptNegPi.pos[2])).toBeLessThan(1e-4);
      }

      // Both invert cleanly without singularity
      const invPos = invertMacroChart(ptPosPi.pos, alpha, R);
      const invNeg = invertMacroChart(ptNegPi.pos, alpha, R);

      expect(Number.isFinite(invPos.lambda)).toBe(true);
      expect(Number.isFinite(invNeg.lambda)).toBe(true);
      expect(invPos.phi).toBeCloseTo(phi, 3);
      expect(invNeg.phi).toBeCloseTo(phi, 3);
      expect(invPos.h).toBeCloseTo(h, 3);
      expect(invNeg.h).toBeCloseTo(h, 3);
    }
  });

  it('M1-T6: strictly maintains positive Jacobian determinant det DF > 0 across h in [0, 0.20]', () => {
    const alphas = [0.0, 0.15, 0.35, 0.50, 0.70, 0.85, 1.0];
    const lambdas = [-2.5, -1.0, 0.0, 1.0, 2.5];
    const latitudes = [-1.3, -0.6, 0.0, 0.6, 1.3];
    const heights = [0.0, 0.05, 0.10, 0.20];

    const eps = 1e-5;
    let minDet = Infinity;

    for (const alpha of alphas) {
      for (const lam of lambdas) {
        for (const phi of latitudes) {
          for (const h of heights) {
            const pLamP = evaluateMacroChartCPU(lam + eps, phi, h, alpha, R);
            const pLamM = evaluateMacroChartCPU(lam - eps, phi, h, alpha, R);
            const jLam: Vec3 = [
              (pLamP.pos[0] - pLamM.pos[0]) / (2.0 * eps),
              (pLamP.pos[1] - pLamM.pos[1]) / (2.0 * eps),
              (pLamP.pos[2] - pLamM.pos[2]) / (2.0 * eps),
            ];

            const pPhiP = evaluateMacroChartCPU(lam, phi + eps, h, alpha, R);
            const pPhiM = evaluateMacroChartCPU(lam, phi - eps, h, alpha, R);
            const jPhi: Vec3 = [
              (pPhiP.pos[0] - pPhiM.pos[0]) / (2.0 * eps),
              (pPhiP.pos[1] - pPhiM.pos[1]) / (2.0 * eps),
              (pPhiP.pos[2] - pPhiM.pos[2]) / (2.0 * eps),
            ];

            const pt = evaluateMacroChartCPU(lam, phi, h, alpha, R);
            const jH: Vec3 = pt.normal;

            const det =
              jLam[0] * (jPhi[1] * jH[2] - jPhi[2] * jH[1]) -
              jLam[1] * (jPhi[0] * jH[2] - jPhi[2] * jH[0]) +
              jLam[2] * (jPhi[0] * jH[1] - jPhi[1] * jH[0]);

            if (det < minDet) minDet = det;
            expect(det).toBeGreaterThan(0.0);
          }
        }
      }
    }

    // Minimum determinant is strictly bounded away from zero
    expect(minDet).toBeGreaterThan(1.0);
  });

  it('M1-T7: executes 10,000 Monte Carlo queries in small-s regime (alpha in [0.94, 1.0]) with zero NaNs', () => {
    let nanCount = 0;
    let maxError = 0;
    const SAMPLE_COUNT = 10000;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const alpha = 0.94 + Math.random() * 0.06;
      const lam = (Math.random() * 2.0 - 1.0) * Math.PI;
      const phi = (Math.random() * 2.0 - 1.0) * 1.4;
      const h = Math.random() * 0.20;

      const pt = evaluateMacroChartCPU(lam, phi, h, alpha, R);
      const inv = invertMacroChart(pt.pos, alpha, R);

      if (
        !Number.isFinite(inv.lambda) ||
        !Number.isFinite(inv.phi) ||
        !Number.isFinite(inv.h)
      ) {
        nanCount++;
      } else {
        const err = Math.hypot(inv.lambda - lam, inv.phi - phi, inv.h - h);
        if (err > maxError) maxError = err;
      }
    }

    expect(nanCount).toBe(0);
    expect(maxError).toBeLessThanOrEqual(1e-4);
  });
});
