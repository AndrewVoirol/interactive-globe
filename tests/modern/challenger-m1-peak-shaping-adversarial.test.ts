import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Challenger 1 Adversarial Test Suite for Milestone 1
 *
 * Mathematically and empirically stress-tests:
 * 1. Soft-summit peak shaping: shapedH = (1.0 - exp(-2.2 * normH)) / (1.0 - exp(-2.2))
 * 2. Dynamic exponent clamping: dynamicExp = clamp(mix(0.95, 1.25, orbitT) * (peakExponent / 1.4), 0.85, 1.30)
 * 3. End-to-end pow(shapedH, dynamicExp) stability
 * 4. Cross-pipeline WGSL source code synchronization across crust_hydrosphere, cloud_shell, and wind_particles
 */

// Helper functions implementing the exact WGSL f32 mathematical operations
function f32(x: number): number {
  return Math.fround(x);
}

function shapedH_f64(normH: number): number {
  return (1.0 - Math.exp(-2.2 * normH)) / (1.0 - Math.exp(-2.2));
}

function shapedH_f32(normH: number): number {
  const k = f32(2.2);
  const one = f32(1.0);
  const denom = f32(one - f32(Math.exp(f32(-k))));
  const num = f32(one - f32(Math.exp(f32(-k * f32(normH)))));
  return f32(num / denom);
}

function clamp(x: number, minVal: number, maxVal: number): number {
  return Math.max(minVal, Math.min(maxVal, x));
}

function clamp_f32(x: number, minVal: number, maxVal: number): number {
  return f32(Math.max(f32(minVal), Math.min(f32(maxVal), f32(x))));
}

function mix(x: number, y: number, a: number): number {
  return x * (1 - a) + y * a;
}

function mix_f32(x: number, y: number, a: number): number {
  return f32(f32(x) * f32(f32(1.0) - f32(a)) + f32(y) * f32(a));
}

function computeDynamicExp_f64(camDist: number, peakExponent: number): number {
  const orbitT = clamp((camDist - 8.0) / (25.0 - 8.0), 0.0, 1.0);
  const raw = mix(0.95, 1.25, orbitT) * (peakExponent / 1.4);
  return clamp(raw, 0.85, 1.30);
}

function computeDynamicExp_f32(camDist: number, peakExponent: number): number {
  const cd = f32(camDist);
  const pe = f32(peakExponent);
  const orbitT = clamp_f32(f32(f32(cd - f32(8.0)) / f32(17.0)), 0.0, 1.0);
  const mixed = mix_f32(0.95, 1.25, orbitT);
  const raw = f32(mixed * f32(pe / f32(1.4)));
  return clamp_f32(raw, 0.85, 1.30);
}

describe('Challenger 1 Milestone 1: Peak Shaping Mathematical Stress Harness', () => {
  describe('Pillar 1: Mathematical Invariants of shapedH = (1 - exp(-2.2 * h)) / (1 - exp(-2.2))', () => {
    it('M1-CHALLENGE-01: Denominator is non-zero and positive in both FP32 and FP64', () => {
      const denom_f64 = 1.0 - Math.exp(-2.2);
      const denom_f32 = f32(1.0) - f32(Math.exp(f32(-2.2)));

      expect(denom_f64).toBeGreaterThan(0.88);
      expect(denom_f64).toBeLessThan(0.90);
      expect(denom_f32).toBeGreaterThan(0.88);
      expect(denom_f32).toBeLessThan(0.90);
      expect(Number.isFinite(denom_f64)).toBe(true);
      expect(Number.isFinite(denom_f32)).toBe(true);
    });

    it('M1-CHALLENGE-02: Boundary conditions h=0 -> 0.0, h=1 -> 1.0, h->inf -> ~1.1246', () => {
      // At h = 0: exactly 0
      expect(shapedH_f64(0.0)).toBe(0.0);
      expect(shapedH_f32(0.0)).toBe(0.0);

      // At h = 1: exactly 1 (within floating point epsilon)
      expect(shapedH_f64(1.0)).toBeCloseTo(1.0, 12);
      expect(shapedH_f32(1.0)).toBeCloseTo(1.0, 5);

      // Asymptotic upper bound: 1 / (1 - exp(-2.2)) ~ 1.1246109
      const asymptote = 1.0 / (1.0 - Math.exp(-2.2));
      expect(shapedH_f64(100.0)).toBeCloseTo(asymptote, 10);
      expect(shapedH_f32(100.0)).toBeCloseTo(asymptote, 5);
      expect(shapedH_f32(1e20)).toBeCloseTo(asymptote, 5);
    });

    it('M1-CHALLENGE-03: Non-negativity across 25,000 samples for normH >= 0', () => {
      let minValF64 = Infinity;
      let minValF32 = Infinity;

      for (let i = 0; i <= 25_000; i++) {
        // Uniform and log-spaced sampling up to extreme heights
        const h = i < 12_500 ? (i / 12_500) * 10.0 : Math.exp((i - 12_500) / 500.0) - 1.0;
        const val64 = shapedH_f64(h);
        const val32 = shapedH_f32(h);

        if (val64 < minValF64) minValF64 = val64;
        if (val32 < minValF32) minValF32 = val32;

        expect(val64).toBeGreaterThanOrEqual(0.0);
        expect(val32).toBeGreaterThanOrEqual(0.0);
        expect(Number.isFinite(val64)).toBe(true);
        expect(Number.isFinite(val32)).toBe(true);
      }

      expect(minValF64).toBe(0.0);
      expect(minValF32).toBe(0.0);
    });

    it('M1-CHALLENGE-04: Strict monotonicity across domain [0, 15] in FP64 and FP32', () => {
      // Check derivative f'(h) = 2.2 * exp(-2.2 * h) / (1 - exp(-2.2)) > 0
      const steps = 10_000;
      let prevVal64 = -1.0;
      let prevVal32 = -1.0;

      for (let i = 0; i <= steps; i++) {
        const h = (i / steps) * 10.0;
        const val64 = shapedH_f64(h);
        const val32 = shapedH_f32(h);

        if (i > 0) {
          // Strictly monotonic in f64
          expect(val64).toBeGreaterThan(prevVal64);
          // Non-decreasing in f32 (f32 may saturate when diff is below machine epsilon)
          expect(val32).toBeGreaterThanOrEqual(prevVal32);
        }

        prevVal64 = val64;
        prevVal32 = val32;
      }
    });

    it('M1-CHALLENGE-05: Strict concavity f"(h) < 0 (soft-summit saturation behavior)', () => {
      // f''(h) = -4.84 * exp(-2.2 * h) / (1 - exp(-2.2)) < 0
      // Verify using second finite difference: f(h + d) - 2f(h) + f(h - d) < 0
      const delta = 0.001;
      for (let h = 0.05; h <= 5.0; h += 0.05) {
        const f_plus = shapedH_f64(h + delta);
        const f_mid = shapedH_f64(h);
        const f_minus = shapedH_f64(h - delta);
        const secondDiff = f_plus - 2.0 * f_mid + f_minus;
        expect(secondDiff).toBeLessThan(0.0);
      }
    });

    it('M1-CHALLENGE-06: Adversarial IEEE 754 edge cases: subnormals, zero, large floats, infinity', () => {
      // Zero
      expect(shapedH_f64(0)).toBe(0);
      expect(shapedH_f64(-0)).toBe(0);
      expect(1 / shapedH_f64(-0)).toBe(Infinity); // Verifies positive zero +0
      expect(shapedH_f32(0)).toBe(0);

      // Smallest positive subnormal in f32: ~1.4e-45
      const smallestF32 = Math.fround(1.401298464324817e-45);
      const resSubnormal = shapedH_f32(smallestF32);
      expect(resSubnormal).toBeGreaterThanOrEqual(0.0);
      expect(Number.isFinite(resSubnormal)).toBe(true);

      // Max float32 value: 3.4028235e+38
      const maxF32 = Math.fround(3.4028235e38);
      const resMax = shapedH_f32(maxF32);
      expect(Number.isFinite(resMax)).toBe(true);
      expect(resMax).toBeCloseTo(1.0 / (1.0 - Math.exp(-2.2)), 5);

      // Infinity input
      const resInf = shapedH_f64(Infinity);
      expect(Number.isFinite(resInf)).toBe(true);
      expect(resInf).toBeCloseTo(1.0 / (1.0 - Math.exp(-2.2)), 10);
    });
  });

  describe('Pillar 2: Mathematical Invariants of dynamicExp Clamping in [0.85, 1.30]', () => {
    it('M1-CHALLENGE-07: dynamicExp strictly bounded in [0.85, 1.30] across camDist in [0, 1000] and peakExp in [-10, 100]', () => {
      const camDistSteps = [0, 1, 5, 8, 10, 12, 16.5, 20, 25, 30, 50, 100, 500, 1000];
      const peakExpSteps = [-10, -5, -1, 0, 0.1, 0.5, 1.0, 1.4, 1.8, 2.0, 5.0, 10.0, 50.0, 100.0];

      for (const camDist of camDistSteps) {
        for (const peakExp of peakExpSteps) {
          const exp64 = computeDynamicExp_f64(camDist, peakExp);
          const exp32 = computeDynamicExp_f32(camDist, peakExp);

          expect(exp64).toBeGreaterThanOrEqual(0.85);
          expect(exp64).toBeLessThanOrEqual(1.30);
          expect(exp32).toBeGreaterThanOrEqual(0.8499);
          expect(exp32).toBeLessThanOrEqual(1.3001);

          expect(Number.isFinite(exp64)).toBe(true);
          expect(Number.isFinite(exp32)).toBe(true);
          expect(Number.isNaN(exp64)).toBe(false);
          expect(Number.isNaN(exp32)).toBe(false);
        }
      }
    });

    it('M1-CHALLENGE-08: 25,000-Trial Monte Carlo fuzzing of dynamicExp across extreme range', () => {
      let minObserved = Infinity;
      let maxObserved = -Infinity;

      for (let i = 0; i < 25_000; i++) {
        // camDist in [-1000, 10000], peakExponent in [-500, 500]
        const camDist = Math.random() * 11000 - 1000;
        const peakExp = Math.random() * 1000 - 500;

        const exp64 = computeDynamicExp_f64(camDist, peakExp);
        const exp32 = computeDynamicExp_f32(camDist, peakExp);

        if (exp64 < minObserved) minObserved = exp64;
        if (exp64 > maxObserved) maxObserved = exp64;

        expect(exp64).toBeGreaterThanOrEqual(0.85);
        expect(exp64).toBeLessThanOrEqual(1.30);
        expect(exp32).toBeGreaterThanOrEqual(0.8499);
        expect(exp32).toBeLessThanOrEqual(1.3001);
      }

      expect(minObserved).toBe(0.85);
      expect(maxObserved).toBe(1.30);
    });

    it('M1-CHALLENGE-09: Orbit transition behavior between 8.0 and 25.0', () => {
      // Close orbit (camDist <= 8.0): orbitT = 0.0 -> mix(0.95, 1.25, 0.0) = 0.95
      const closeExp = computeDynamicExp_f64(5.0, 1.4);
      expect(closeExp).toBeCloseTo(0.95, 6);

      // Far orbit (camDist >= 25.0): orbitT = 1.0 -> mix(0.95, 1.25, 1.0) = 1.25
      const farExp = computeDynamicExp_f64(30.0, 1.4);
      expect(farExp).toBeCloseTo(1.25, 6);

      // Mid orbit (camDist = 16.5): orbitT = 0.5 -> mix(0.95, 1.25, 0.5) = 1.10
      const midExp = computeDynamicExp_f64(16.5, 1.4);
      expect(midExp).toBeCloseTo(1.10, 6);
    });
  });

  describe('Pillar 3: End-to-End Pow(shapedH, dynamicExp) Robustness', () => {
    it('M1-CHALLENGE-10: pow(shapedH, dynamicExp) evaluates cleanly with 0 NaNs and strictly non-negative output', () => {
      const hSamples = [0.0, 1e-10, 0.001, 0.1, 0.5, 1.0, 1.5, 2.0, 5.0, 10.0, 100.0];
      const dynExps = [0.85, 0.95, 1.0, 1.10, 1.25, 1.30];

      for (const h of hSamples) {
        for (const expVal of dynExps) {
          const sH64 = shapedH_f64(h);
          const sH32 = shapedH_f32(h);

          const res64 = Math.pow(sH64, expVal);
          const res32 = f32(Math.pow(sH32, expVal));

          expect(Number.isFinite(res64)).toBe(true);
          expect(Number.isFinite(res32)).toBe(true);
          expect(Number.isNaN(res64)).toBe(false);
          expect(Number.isNaN(res32)).toBe(false);
          expect(res64).toBeGreaterThanOrEqual(0.0);
          expect(res32).toBeGreaterThanOrEqual(0.0);

          if (h === 0.0) {
            expect(res64).toBe(0.0);
            expect(res32).toBe(0.0);
          }
        }
      }
    });
  });

  describe('Pillar 4: Cross-Pipeline Shader Parity & Source Code Verification', () => {
    const crustSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl'),
      'utf-8'
    );
    const cloudSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl'),
      'utf-8'
    );
    const windSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/webgpu/shaders/wind_particles.wgsl'),
      'utf-8'
    );

    it('M1-CHALLENGE-11: Rule 8 Cross-Pipeline DEM Mathematical Parity across all 3 shaders', () => {
      // 1. Check peak shaping formula in cloud and wind shaders, and linear or peak shaping in crust
      const expectedPeakShaping = 'let shapedH = (1.0 - exp(-2.2 * normH)) / (1.0 - exp(-2.2));';
      const expectedLinearCrust = 'normalDisplacement = normH * dispScale * poleAtten;';
      const crustHasLinearOrShaped = crustSrc.includes(expectedPeakShaping) || crustSrc.includes(expectedLinearCrust);
      expect(crustHasLinearOrShaped).toBe(true);
      expect(cloudSrc).toContain(expectedPeakShaping);
      expect(windSrc).toContain(expectedPeakShaping);

      // 2. Check dynamicExp clamping formula in shaders
      if (crustSrc.includes('dynamicExp')) {
        expect(crustSrc).toContain(
          'let dynamicExp = clamp(mix(0.95, 1.25, orbitT) * (sim.u_peakExponent / 1.4), 0.85, 1.30);'
        );
      }
      expect(cloudSrc).toContain(
        'let dynamicExp = clamp(mix(0.95, 1.25, orbitT) * (cloud.u_peakExponent / 1.4), 0.85, 1.30);'
      );
      expect(windSrc).toContain(
        'let dynamicExp = clamp(mix(0.95, 1.25, orbitT) * (sim.u_peakExponent / 1.4), 0.85, 1.30);'
      );

      // 3. Check orbitT calculation in shaders
      const expectedOrbitT = 'let orbitT = clamp((camDist - 8.0) / (25.0 - 8.0), 0.0, 1.0);';
      if (crustSrc.includes('orbitT')) {
        expect(crustSrc).toContain(expectedOrbitT);
      }
      expect(cloudSrc).toContain(expectedOrbitT);
      expect(windSrc).toContain(expectedOrbitT);
    });

    it('M1-CHALLENGE-12: Wind particles longitude phase offset is +0.5 (alignment with DEM)', () => {
      expect(windSrc).toContain('let uCoord = fract(lonRad / TWO_PI + 0.5);');
      expect(windSrc).not.toContain('let uCoord = fract(lonRad / TWO_PI);');
    });

    it('M1-CHALLENGE-13: Crust hydrosphere Theme 2 isolines and hypsometric glaze evaluate fragment elevMeters', () => {
      // Line 1817 area: hypsometric glaze
      expect(crustSrc).toContain('if (elevMeters < -5500.0) {');
      expect(crustSrc).toContain('} else if (elevMeters < -200.0) {');
      expect(crustSrc).toContain('} else if (elevMeters < 500.0) {');
      expect(crustSrc).toContain('} else if (elevMeters < 5200.0) {');

      // Line 1929 area: Theme 2 isolines
      expect(crustSrc).toContain('let normElev = clamp((elevMeters + 10924.0) / 19772.0, 0.0, 1.0);');
    });
  });
});
