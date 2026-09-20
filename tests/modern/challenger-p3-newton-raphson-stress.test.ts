// ============================================================================
// File: tests/modern/challenger-p3-newton-raphson-stress.test.ts
// Challenger: teamwork_preview_challenger_2 (Regression & Engine Robustness Challenger)
// Mission: Phase 3 Auto-Playback Newton-Raphson Solver Stress & Boundary Audit
// Reference: useEngineState.ts, ORIGINAL_REQUEST.md §2026-09-20T07:24:49Z R2
//
// Verification Mandates:
// 1. Test invertQuintic in src/hooks/useEngineState.ts across 10,000 random target
//    alpha values in [0, 1], including exact boundaries 0.0, 1.0, negative/overshoot
//    values, and near-zero values (10^-5, 1 - 10^-5).
// 2. Verify whether Newton-Raphson converges within 4 iterations with error
//    |S_5(t) - alpha| < 10^-5, never enters an infinite loop, and never outputs NaNs.
// 3. Document numerical breakdown when derivative vanishes (f' -> 0) at endpoints.
// 4. Provide reference Halley solver oracle verifying 100% convergence.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Forward quintic smootherstep: S_5(t) = 6t^5 - 15t^4 + 10t^3
export function S5(t: number): number {
  const c = Math.max(0.0, Math.min(1.0, t));
  return c * c * c * (c * (c * 6.0 - 15.0) + 10.0);
}

export function S5_prime(t: number): number {
  return 30.0 * t * t * (t - 1.0) * (t - 1.0);
}

export function S5_double_prime(t: number): number {
  return 60.0 * t * (1.0 - t) * (1.0 - 2.0 * t);
}

// Extract production invertQuintic directly from useEngineState.ts
function getProductionInvertQuintic(): (target: number) => number {
  const hookPath = path.resolve(__dirname, '../../src/hooks/useEngineState.ts');
  const content = fs.readFileSync(hookPath, 'utf-8');
  const match = content.match(/const invertQuintic = \([^)]*\): number => \{([\s\S]*?)\n    \};/);
  if (!match) {
    throw new Error('Failed to extract invertQuintic from src/hooks/useEngineState.ts');
  }
  return new Function('target', match[1]) as (target: number) => number;
}

// Reference Halley solver with boundary cubic initial guess (Oracle)
export function invertQuinticHalleyOracle(target: number, iters = 4): number {
  if (target <= 0.0) return 0.0;
  if (target >= 1.0) return 1.0;

  // Cubic initial guess near flat boundaries where S_5'(t) -> 0
  let t = target;
  if (target <= 0.05) {
    t = Math.cbrt(target / 10.0);
  } else if (target >= 0.95) {
    t = 1.0 - Math.cbrt((1.0 - target) / 10.0);
  }

  for (let i = 0; i < iters; i++) {
    const f = S5(t) - target;
    const df = S5_prime(t);
    const d2f = S5_double_prime(t);
    const denom = 2.0 * df * df - f * d2f;
    if (Math.abs(denom) < 1e-12) break;
    const step = (2.0 * f * df) / denom;
    t = Math.max(0.0, Math.min(1.0, t - step));
  }
  return t;
}

describe('Challenger P3: Auto-Playback Newton-Raphson Solver Stress Test', () => {
  const invertQuintic = getProductionInvertQuintic();

  // ==========================================================================
  // Pillar 1: Boundary Conditions & Overshoot Clamping
  // ==========================================================================
  describe('Pillar 1: Exact Boundaries & Clamping Invariants', () => {
    it('EMPIRICAL-NR-01: exactly clamps target <= 0.0 to 0.0 and target >= 1.0 to 1.0', () => {
      expect(invertQuintic(0.0)).toBe(0.0);
      expect(invertQuintic(1.0)).toBe(1.0);
      expect(invertQuintic(-0.001)).toBe(0.0);
      expect(invertQuintic(-1.0)).toBe(0.0);
      expect(invertQuintic(-100.0)).toBe(0.0);
      expect(invertQuintic(1.001)).toBe(1.0);
      expect(invertQuintic(1.5)).toBe(1.0);
      expect(invertQuintic(100.0)).toBe(1.0);
    });

    it('EMPIRICAL-NR-02: symmetric midpoint target = 0.5 returns exact 0.5 with 0 error', () => {
      const t = invertQuintic(0.5);
      expect(t).toBe(0.5);
      expect(Math.abs(S5(t) - 0.5)).toBe(0.0);
    });
  });

  // ==========================================================================
  // Pillar 2: Numerical Stability (Zero NaN, Zero Inf, Bounded Loop)
  // ==========================================================================
  describe('Pillar 2: Numerical Stability across 10,000 Monte Carlo Iterations', () => {
    it('EMPIRICAL-NR-03: generates exactly 0 NaNs and 0 Infs across 10,000 random alpha samples in [0, 1]', () => {
      let nanCount = 0;
      let infCount = 0;
      let outOfBoundsCount = 0;

      for (let i = 0; i < 10_000; i++) {
        const target = Math.random();
        const t = invertQuintic(target);

        if (Number.isNaN(t)) nanCount++;
        if (!Number.isFinite(t)) infCount++;
        if (t < 0.0 || t > 1.0) outOfBoundsCount++;
      }

      expect(nanCount, 'Zero NaNs permitted from invertQuintic').toBe(0);
      expect(infCount, 'Zero Infs permitted from invertQuintic').toBe(0);
      expect(outOfBoundsCount, 'Outputs must be bounded strictly in [0, 1]').toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 3: Empirical Audit of Remediated Halley Convergence vs Requirements
  // ==========================================================================
  describe('Pillar 3: Convergence Precision & Remediated Halley Verification', () => {
    it('EMPIRICAL-NR-04: verifies 0 failures (0.00% fail rate) across 10,000 Monte Carlo samples with error < 10^-6', () => {
      let failCount = 0;
      let maxError = 0.0;
      const N = 10_000;

      for (let i = 0; i < N; i++) {
        const target = Math.random();
        const t = invertQuintic(target);
        const err = Math.abs(S5(t) - target);

        if (err > maxError) {
          maxError = err;
        }
        if (err >= 1e-6) {
          failCount++;
        }
      }

      // Record empirical metrics
      const failRatePct = (failCount / N) * 100;

      expect(failCount, `Production Halley solver fail count must be 0 (got ${failCount})`).toBe(0);
      expect(failRatePct, `Production Halley solver fail rate must be 0.00% (got ${failRatePct}%)`).toBe(0);
      expect(maxError, `Production Halley solver max error must be < 10^-6 (got ${maxError})`).toBeLessThan(1e-6);
    });

    it('EMPIRICAL-NR-05: verifies clean convergence without overshoot for boundary targets 0.001 and 0.99 (error < 10^-6)', () => {
      // Near 0: target = 0.001
      const tLow = invertQuintic(0.001);
      const errLow = Math.abs(S5(tLow) - 0.001);

      // Near 1: target = 0.99
      const tHigh = invertQuintic(0.99);
      const errHigh = Math.abs(S5(tHigh) - 0.99);

      expect(Number.isFinite(tLow)).toBe(true);
      expect(Number.isFinite(tHigh)).toBe(true);
      expect(errLow, `Error at target 0.001 must be < 10^-6 (got ${errLow})`).toBeLessThan(1e-6);
      expect(errHigh, `Error at target 0.99 must be < 10^-6 (got ${errHigh})`).toBeLessThan(1e-6);
      expect(tLow).toBeGreaterThan(0.0);
      expect(tHigh).toBeLessThan(1.0);
    });

    it('EMPIRICAL-NR-06: tests near-zero limits 10^-5 and 1 - 10^-5 converge cleanly (error < 10^-6)', () => {
      const eps = 1e-5;
      const tNearZero = invertQuintic(eps);
      const tNearOne = invertQuintic(1.0 - eps);

      expect(Number.isNaN(tNearZero)).toBe(false);
      expect(Number.isNaN(tNearOne)).toBe(false);
      expect(tNearZero).toBeGreaterThanOrEqual(0.0);
      expect(tNearOne).toBeLessThanOrEqual(1.0);

      const errNearZero = Math.abs(S5(tNearZero) - eps);
      const errNearOne = Math.abs(S5(tNearOne) - (1.0 - eps));
      expect(errNearZero, `Error at 1e-5 must be < 10^-6 (got ${errNearZero})`).toBeLessThan(1e-6);
      expect(errNearOne, `Error at 1 - 1e-5 must be < 10^-6 (got ${errNearOne})`).toBeLessThan(1e-6);
    });
  });

  // ==========================================================================
  // Pillar 4: Halley Solver Oracle Verification
  // ==========================================================================
  describe('Pillar 4: Halley Reference Solver Oracle (Zero-Failure Target)', () => {
    it('EMPIRICAL-NR-07: proves Halley solver achieves 0 failures (< 10^-5) across 10,000 samples in 4 iterations', () => {
      let failCount = 0;
      let maxError = 0.0;
      const N = 10_000;

      for (let i = 0; i < N; i++) {
        const target = Math.random();
        const t = invertQuinticHalleyOracle(target, 4);
        const err = Math.abs(S5(t) - target);

        if (err > maxError) {
          maxError = err;
        }
        if (err >= 1e-5) {
          failCount++;
        }
      }

      // Halley solver achieves near machine-precision convergence:
      expect(failCount).toBe(0);
      expect(maxError).toBeLessThan(1e-8);
    });

    it('EMPIRICAL-NR-08: proves Halley solver converges on target = 0.001, 0.01, 0.99, 10^-5, 1 - 10^-5 with error < 10^-8', () => {
      const testCases = [1e-5, 0.001, 0.01, 0.05, 0.95, 0.99, 0.999, 1.0 - 1e-5];

      for (const target of testCases) {
        const t = invertQuinticHalleyOracle(target, 4);
        const err = Math.abs(S5(t) - target);
        expect(err, `Halley solver error at target=${target}`).toBeLessThan(1e-8);
      }
    });
  });
});
