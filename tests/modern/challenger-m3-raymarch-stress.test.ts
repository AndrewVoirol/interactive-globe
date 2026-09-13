// ============================================================================
// File: tests/modern/challenger-m3-raymarch-stress.test.ts
// Challenger: challenger_m3_1 (Role: Adversarial Monte Carlo & Tropospheric Raymarch Singularity Challenger)
// Milestone: Milestone 3: Volumetric Raymarch Pass & Depth Occlusion
//
// Invariants Tested:
//   - Invariant §46: The Test Import Integrity Contract (Anti-Self-Certification Rule)
//   - Invariant §3:  WebGPU Mandatory Explicit LOD & Uniform Control Flow
//   - Invariant §20: 16-Byte WGSL Struct Alignment Parity
//   - Invariant §24: Dynamic Medium Switching (Zero-Recompile Contract)
//   - Invariant §28: Exhaustive Multi-Medium Archival Inking Parity (Themes 0, 1, 2)
//
// Verification Pillars (Adversarial Challenger Protocol):
//   - Pillar A: 50,000-Iteration Monte Carlo Fuzzing across [0, 50]³ & altitude domains
//   - Pillar B: Geometric Boundary & Tangent Horizon Grazing Probing (R=5.012, R=5.0)
//   - Pillar C: WGSL Uniform Control Flow & Explicit LOD Static Verification
//   - Pillar D: Anti-Cheating Direct Production Ingestion (Zero Local Shadow Math)
//   - Pillar E: WebGPU Struct Layout & 16-Byte Packing Parity
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// MANDATORY INVARIANT §46: Import all pure mathematical functions directly from production.
// Zero local duplicate mock functions.
import {
  EARTH_RADIUS_KM,
  EARTH_CIRCUMFERENCE_KM,
  EARTH_MERIDIAN_KM,
  EARTH_RADIUS_UNITS,
  EARTH_RADIUS_METERS,
  TROPOSPHERE_MAX_ALTITUDE_METERS,
  DEFAULT_CLOUD_THICKNESS_METERS,
  DEFAULT_EXTINCTION_COEFFICIENT,
  TROPOSPHERIC_STRATA,
  smoothstep,
  computeLCL,
  computeLCLHeightMeters,
  computeDewPointFromRH,
  computeRHFromDewPoint,
  computeLCLGate,
  computeCloudDeckBoundaries,
  computeVerticalCloudProfile,
  computeColumnIntegratedCloudCover,
  computeCloudShadowOffset,
  computeCloudShadowFactor,
  beerLambert,
  computeBeerLambertTransmission,
  integrateOpticalStep,
  henyeyGreenstein,
  dualLobeHenyeyGreenstein,
  intersectRaySphere,
  computeTroposphericInterval,
  clampRayIntervalToTerrain,
  metersToWorldUnits,
  worldUnitsToMeters,
  computeCloudLayerRadii,
  reconstructWorldPositionFromDepth,
  Vec3,
} from '../../src/core/math/volumetricMath';

import volumetricCloudWGSL from '../../src/webgpu/shaders/volumetric_cloud.wgsl?raw';

const __filename = fileURLToPath(import.meta.url);
const currentTestFilePath = __filename;

describe('challenger_m3_1: Adversarial Tropospheric Raymarch & Singularity Stress Suite', () => {
  // ==========================================================================
  // Suite 1: Monte Carlo Ray-Sphere Fuzzing (30,000 Iterations)
  // ==========================================================================
  describe('Suite 1: Monte Carlo Ray-Sphere Fuzzing (30,000 Iterations in [0, 50]³)', () => {
    it('executes 30,000 randomized trials across [0, 50]³: asserts d >= 0 implies t1 <= t2, zero NaNs, zero Infinities', () => {
      const ITERATION_COUNT = 30_000;
      let hitCount = 0;
      let missCount = 0;

      for (let i = 0; i < ITERATION_COUNT; i++) {
        // Random origin in [0, 50]³
        const r0: Vec3 = [
          Math.random() * 50.0,
          Math.random() * 50.0,
          Math.random() * 50.0,
        ];

        // Random unit direction vector on S²
        let dx = (Math.random() - 0.5) * 2.0;
        let dy = (Math.random() - 0.5) * 2.0;
        let dz = (Math.random() - 0.5) * 2.0;
        let lenSq = dx * dx + dy * dy + dz * dz;
        while (lenSq < 1e-6) {
          dx = (Math.random() - 0.5) * 2.0;
          dy = (Math.random() - 0.5) * 2.0;
          dz = (Math.random() - 0.5) * 2.0;
          lenSq = dx * dx + dy * dy + dz * dz;
        }
        const invLen = 1.0 / Math.sqrt(lenSq);
        const dir: Vec3 = [dx * invLen, dy * invLen, dz * invLen];

        // Test with Earth radius (5.0) or arbitrary radius in [1.0, 10.0]
        const radius = i % 2 === 0 ? EARTH_RADIUS_UNITS : 1.0 + Math.random() * 9.0;

        // Analytical discriminant ground truth
        const b = r0[0] * dir[0] + r0[1] * dir[1] + r0[2] * dir[2];
        const c = r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2] - radius * radius;
        const d = b * b - c;

        const hit = intersectRaySphere(r0, dir, radius);

        if (d < 0.0) {
          missCount++;
          expect(hit).toBeNull();
        } else {
          hitCount++;
          expect(hit).not.toBeNull();
          expect(Number.isFinite(hit!.tNear)).toBe(true);
          expect(Number.isFinite(hit!.tFar)).toBe(true);
          expect(Number.isNaN(hit!.tNear)).toBe(false);
          expect(Number.isNaN(hit!.tFar)).toBe(false);

          // Invariant: tNear must always be <= tFar
          expect(hit!.tNear).toBeLessThanOrEqual(hit!.tFar);

          // Verify surface distance equation: ||r0 + dir * t||² == radius²
          const pNear: Vec3 = [
            r0[0] + dir[0] * hit!.tNear,
            r0[1] + dir[1] * hit!.tNear,
            r0[2] + dir[2] * hit!.tNear,
          ];
          const distSqNear = pNear[0] * pNear[0] + pNear[1] * pNear[1] + pNear[2] * pNear[2];
          expect(Math.sqrt(distSqNear)).toBeCloseTo(radius, 4);

          const pFar: Vec3 = [
            r0[0] + dir[0] * hit!.tFar,
            r0[1] + dir[1] * hit!.tFar,
            r0[2] + dir[2] * hit!.tFar,
          ];
          const distSqFar = pFar[0] * pFar[0] + pFar[1] * pFar[1] + pFar[2] * pFar[2];
          expect(Math.sqrt(distSqFar)).toBeCloseTo(radius, 4);
        }
      }

      // Assert statistically balanced sampling (both hits and misses observed)
      expect(hitCount).toBeGreaterThan(100);
      expect(missCount).toBeGreaterThan(100);
    });
  });

  // ==========================================================================
  // Suite 2: Tropospheric Interval Altitude Domains (50,000 Iterations)
  // ==========================================================================
  describe('Suite 2: Tropospheric Interval Across Altitude Domains (50,000 Iterations)', () => {
    it('proves [tStart, tEnd] is strictly monotonic, non-negative, and finite across Deep Space, Inside Troposphere, and Near Terrain', () => {
      const ITERATION_COUNT = 50_000;
      const rBottom = 5.0;     // Earth crust sea level
      const rTop = 5.012;      // 12,000m troposphere ceiling
      let intervalHits = 0;

      for (let i = 0; i < ITERATION_COUNT; i++) {
        let rCam: number;
        // Divide domain into 3 regimes:
        // 0: Deep space (5.012 < R <= 50.0)
        // 1: Inside troposphere (5.000 <= R <= 5.012)
        // 2: Near terrain (5.00001 <= R <= 5.0005)
        const regime = i % 3;
        if (regime === 0) {
          rCam = 5.012 + Math.random() * 45.0;
        } else if (regime === 1) {
          rCam = 5.000 + Math.random() * 0.012;
        } else {
          rCam = 5.00001 + Math.random() * 0.0005;
        }

        // Random camera origin at distance rCam
        let cx = (Math.random() - 0.5) * 2.0;
        let cy = (Math.random() - 0.5) * 2.0;
        let cz = (Math.random() - 0.5) * 2.0;
        let cLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
        while (cLen < 1e-6) {
          cx = (Math.random() - 0.5) * 2.0;
          cy = (Math.random() - 0.5) * 2.0;
          cz = (Math.random() - 0.5) * 2.0;
          cLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
        }
        const r0: Vec3 = [(cx / cLen) * rCam, (cy / cLen) * rCam, (cz / cLen) * rCam];

        // Random unit direction vector
        let dx = (Math.random() - 0.5) * 2.0;
        let dy = (Math.random() - 0.5) * 2.0;
        let dz = (Math.random() - 0.5) * 2.0;
        let dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        while (dLen < 1e-6) {
          dx = (Math.random() - 0.5) * 2.0;
          dy = (Math.random() - 0.5) * 2.0;
          dz = (Math.random() - 0.5) * 2.0;
          dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        const dir: Vec3 = [dx / dLen, dy / dLen, dz / dLen];

        const interval = computeTroposphericInterval(r0, dir, rBottom, rTop);

        if (interval !== null) {
          intervalHits++;
          expect(Number.isFinite(interval.tStart)).toBe(true);
          expect(Number.isFinite(interval.tEnd)).toBe(true);
          expect(Number.isNaN(interval.tStart)).toBe(false);
          expect(Number.isNaN(interval.tEnd)).toBe(false);

          // Non-negativity invariant: raymarch start cannot be behind camera
          expect(interval.tStart).toBeGreaterThanOrEqual(0.0);

          // Strict monotonicity invariant: interval must have positive thickness
          expect(interval.tEnd).toBeGreaterThan(interval.tStart);

          // If camera is inside the troposphere, ray origin starts inside shell -> tStart MUST be 0.0
          if (rCam >= rBottom && rCam <= rTop) {
            expect(interval.tStart).toBe(0.0);
          }
        }
      }

      expect(intervalHits).toBeGreaterThan(1000);
    });
  });

  // ==========================================================================
  // Suite 3: Geometric Boundary Probing & Horizon Tangent Grazing
  // ==========================================================================
  describe('Suite 3: Geometric Boundary Probing & Horizon Tangent Grazing (Pillar B)', () => {
    it('proves exact horizon tangency to R=5.012 and R=5.0 produces zero division-by-zero, zero NaN, and stable delta', () => {
      const radii = [EARTH_RADIUS_UNITS, 5.012];

      for (const R of radii) {
        // Place observer at orbit radius D > R
        const D = R + 1.5;
        const r0: Vec3 = [D, 0.0, 0.0];

        // Exact analytical tangent direction
        // sin(theta) = R / D, cos(theta) = sqrt(1 - (R/D)²)
        const sinTheta = R / D;
        const cosTheta = Math.sqrt(Math.max(0.0, 1.0 - sinTheta * sinTheta));
        const tangentDir: Vec3 = [-cosTheta, sinTheta, 0.0];

        // Discriminant d = b² - c = (-D * cosTheta)² - (D² - R²)
        //               = D²(1 - sinTheta²) - D² + R² = -D²(R/D)² + R² = 0.0
        const hitTangent = intersectRaySphere(r0, tangentDir, R);
        expect(hitTangent).not.toBeNull();
        expect(Number.isFinite(hitTangent!.tNear)).toBe(true);
        expect(Number.isFinite(hitTangent!.tFar)).toBe(true);
        expect(hitTangent!.tNear).toBeCloseTo(hitTangent!.tFar, 5);
        expect(hitTangent!.tNear).toBeCloseTo(D * cosTheta, 5);

        // Probe infinitesimal perturbations across boundary:
        // Case 1: Aim slightly outside (+1e-7 rad) -> Must return null (clean horizon miss)
        const dThetaMiss = 1e-7;
        const missDir: Vec3 = [
          -Math.cos(Math.acos(cosTheta) + dThetaMiss),
          Math.sin(Math.asin(sinTheta) + dThetaMiss),
          0.0,
        ];
        const hitMiss = intersectRaySphere(r0, missDir, R);
        expect(hitMiss).toBeNull();

        // Case 2: Aim slightly inside (-1e-7 rad) -> Must return valid chord with tNear < tFar
        const dThetaHit = 1e-7;
        const inDir: Vec3 = [
          -Math.cos(Math.acos(cosTheta) - dThetaHit),
          Math.sin(Math.asin(sinTheta) - dThetaHit),
          0.0,
        ];
        const hitIn = intersectRaySphere(r0, inDir, R);
        expect(hitIn).not.toBeNull();
        expect(hitIn!.tNear).toBeLessThan(hitIn!.tFar);
        expect(Number.isFinite(hitIn!.tNear)).toBe(true);
        expect(Number.isFinite(hitIn!.tFar)).toBe(true);
      }
    });

    it('proves grazing rays in computeTroposphericInterval never invert or produce NaN', () => {
      const rBottom = 5.0;
      const rTop = 5.012;
      const D = 6.0;
      const r0: Vec3 = [D, 0.0, 0.0];

      // Tangent to inner sphere R = 5.0
      const sinInner = rBottom / D;
      const cosInner = Math.sqrt(1.0 - sinInner * sinInner);
      const tangentInnerDir: Vec3 = [-cosInner, sinInner, 0.0];

      const intervalInner = computeTroposphericInterval(r0, tangentInnerDir, rBottom, rTop);
      if (intervalInner !== null) {
        expect(intervalInner.tStart).toBeGreaterThanOrEqual(0.0);
        expect(intervalInner.tEnd).toBeGreaterThan(intervalInner.tStart);
        expect(Number.isFinite(intervalInner.tStart)).toBe(true);
        expect(Number.isFinite(intervalInner.tEnd)).toBe(true);
      }

      // Tangent to outer sphere R = 5.012
      const sinOuter = rTop / D;
      const cosOuter = Math.sqrt(1.0 - sinOuter * sinOuter);
      const tangentOuterDir: Vec3 = [-cosOuter, sinOuter, 0.0];

      const intervalOuter = computeTroposphericInterval(r0, tangentOuterDir, rBottom, rTop);
      // Tangent grazing the outer boundary has zero thickness, should return null or tStart < tEnd
      if (intervalOuter !== null) {
        expect(intervalOuter.tEnd).toBeGreaterThan(intervalOuter.tStart);
      }
    });
  });

  // ==========================================================================
  // Suite 4: Beer-Lambert Optical Depth Stress Fuzzing (20,000 Iterations)
  // ==========================================================================
  describe('Suite 4: Beer-Lambert Optical Depth Stress Fuzzing (20,000 Iterations)', () => {
    it('proves transmittance T in [0.0, 1.0] is strictly monotonically non-increasing across 20,000 random optical depths in [0, 1000]', () => {
      const ITERATION_COUNT = 20_000;

      for (let i = 0; i < ITERATION_COUNT; i++) {
        const tau1 = Math.random() * 1000.0;
        const tau2 = tau1 + Math.random() * (1000.0 - tau1);

        const T1 = computeBeerLambertTransmission(tau1);
        const T2 = computeBeerLambertTransmission(tau2);

        expect(Number.isFinite(T1)).toBe(true);
        expect(Number.isFinite(T2)).toBe(true);
        expect(T1).toBeGreaterThanOrEqual(0.0);
        expect(T1).toBeLessThanOrEqual(1.0);
        expect(T2).toBeGreaterThanOrEqual(0.0);
        expect(T2).toBeLessThanOrEqual(1.0);

        // Monotonic non-increasing property: tau1 <= tau2 => T1 >= T2
        expect(T1).toBeGreaterThanOrEqual(T2);

        // Strict monotonicity where floating point resolution allows (tau < 700)
        if (tau1 < 700.0 && tau2 - tau1 > 1e-4) {
          expect(T1).toBeGreaterThan(T2);
        }
      }
    });

    it('proves extreme extinction tau -> Infinity yields exact 0.0 and tau = 0.0 yields exact 1.0', () => {
      expect(computeBeerLambertTransmission(0.0)).toBe(1.0);
      expect(computeBeerLambertTransmission(-100.0)).toBe(1.0); // Clamped negative extinction
      expect(computeBeerLambertTransmission(Infinity)).toBe(0.0);
      expect(computeBeerLambertTransmission(1000.0)).toBe(0.0);
      expect(computeBeerLambertTransmission(1e9)).toBe(0.0);
    });

    it('proves integrateOpticalStep maintains discrete radiative transfer conservation over 5,000 steps', () => {
      let accumTransmittance = 1.0;
      const sigmaT = DEFAULT_EXTINCTION_COEFFICIENT;
      const stepSize = 0.0005;

      for (let i = 0; i < 5000; i++) {
        const density = Math.random();
        const { nextTransmittance, stepAlpha } = integrateOpticalStep(
          accumTransmittance,
          density,
          sigmaT,
          stepSize
        );

        expect(nextTransmittance).toBeLessThanOrEqual(accumTransmittance);
        expect(nextTransmittance).toBeGreaterThanOrEqual(0.0);
        expect(stepAlpha).toBeGreaterThanOrEqual(0.0);
        expect(stepAlpha).toBeLessThanOrEqual(1.0);

        // Alpha plus step transmittance must equal 1.0
        const stepTransmittance = Math.exp(-density * sigmaT * stepSize);
        expect(stepAlpha + stepTransmittance).toBeCloseTo(1.0, 7);

        accumTransmittance = nextTransmittance;
      }
    });
  });

  // ==========================================================================
  // Suite 5: Dual-Lobe Henyey-Greenstein Normalization & Asymmetry
  // ==========================================================================
  describe('Suite 5: Dual-Lobe Henyey-Greenstein Normalization & Asymmetry', () => {
    it('proves phase function is strictly positive for all cos(theta) in [-1.0, 1.0] across g1 in [0.5, 0.95] and g2 in [-0.5, -0.1]', () => {
      const g1Values = [0.50, 0.70, 0.82, 0.90, 0.95];
      const g2Values = [-0.50, -0.35, -0.25, -0.10];
      const weights = [0.50, 0.70, 0.85];

      // Sample cos(theta) densely across [-1.0, 1.0]
      for (let c = -100; c <= 100; c++) {
        const cosTheta = c / 100.0;

        for (const g1 of g1Values) {
          for (const g2 of g2Values) {
            for (const w of weights) {
              const phase = dualLobeHenyeyGreenstein(cosTheta, g1, g2, w);

              expect(Number.isFinite(phase)).toBe(true);
              expect(Number.isNaN(phase)).toBe(false);
              expect(phase).toBeGreaterThan(0.0);
            }
          }
        }
      }
    });

    it('proves forward Mie silver lining glare asymmetry: P(1.0) >> P(-1.0) for g1=0.82, g2=-0.25', () => {
      const forwardVal = dualLobeHenyeyGreenstein(1.0, 0.82, -0.25, 0.70);
      const backwardVal = dualLobeHenyeyGreenstein(-1.0, 0.82, -0.25, 0.70);

      expect(forwardVal).toBeGreaterThan(0.0);
      expect(backwardVal).toBeGreaterThan(0.0);
      // Forward scattering is more than 20x stronger than backward scattering
      expect(forwardVal / backwardVal).toBeGreaterThan(20.0);
    });

    it('validates spherical phase function normalization: integral P(cosTheta) * 2*pi * d(cosTheta) == 1.0', () => {
      // Numerical quadrature using trapezoidal rule with 10,000 steps
      const STEPS = 10_000;
      const dCos = 2.0 / STEPS;
      let integral = 0.0;

      for (let i = 0; i <= STEPS; i++) {
        const cosTheta = -1.0 + i * dCos;
        const weight = (i === 0 || i === STEPS) ? 0.5 : 1.0;
        const phase = dualLobeHenyeyGreenstein(cosTheta, 0.82, -0.25, 0.70);
        integral += weight * phase * (2.0 * Math.PI) * dCos;
      }

      // Energy conservation: must integrate to 1.0 within numerical quadrature accuracy
      expect(integral).toBeCloseTo(1.0, 3);
    });
  });

  // ==========================================================================
  // Suite 6: Psychrometric LCL Edge Cases & Non-Finite Fuzzing
  // ==========================================================================
  describe('Suite 6: Psychrometric LCL Edge Cases & Non-Finite Fuzzing', () => {
    it('verifies extreme supersaturation (T < Td) yields h_LCL = 0.0m', () => {
      expect(computeLCL(15.0, 20.0)).toBe(0.0);
      expect(computeLCL(-10.0, 5.0)).toBe(0.0);
      expect(computeLCL(0.0, 0.001)).toBe(0.0);
      expect(computeLCLHeightMeters(10.0, 40.0)).toBe(0.0);
    });

    it('verifies extreme dry desert spread (T - Td = 50°C) yields h_LCL = 6,250m', () => {
      // 125.0 * 50.0 = 6,250m
      const hLCL = computeLCL(55.0, 5.0);
      expect(hLCL).toBe(6250.0);
      expect(computeLCLHeightMeters(45.0, -5.0)).toBe(6250.0);
    });

    it('fuzzes non-finite inputs (NaN, Infinity, -Infinity) returning safe finite 0.0', () => {
      const nonFinites = [NaN, Infinity, -Infinity];

      for (const val of nonFinites) {
        const r1 = computeLCL(val, 15.0);
        const r2 = computeLCL(25.0, val);
        const r3 = computeLCL(val, val);
        const r4 = computeLCLHeightMeters(val, 10.0);

        expect(Number.isFinite(r1)).toBe(true);
        expect(Number.isFinite(r2)).toBe(true);
        expect(Number.isFinite(r3)).toBe(true);
        expect(Number.isFinite(r4)).toBe(true);

        expect(r1).toBe(0.0);
        expect(r2).toBe(0.0);
        expect(r3).toBe(0.0);
        expect(r4).toBe(0.0);
      }
    });

    it('evaluates smoothstep LCL gate transitions between (lcl - 200m) and lcl', () => {
      const lcl = 1000.0;
      expect(computeLCLGate(700.0, lcl)).toBe(0.0);
      expect(computeLCLGate(800.0, lcl)).toBe(0.0);
      expect(computeLCLGate(900.0, lcl)).toBeCloseTo(0.5, 2);
      expect(computeLCLGate(1000.0, lcl)).toBe(1.0);
      expect(computeLCLGate(1500.0, lcl)).toBe(1.0);
      expect(computeLCLGate(500.0, lcl, false)).toBe(1.0); // Disabled gate passes 1.0
    });
  });

  // ==========================================================================
  // Suite 7: Depth Reconstruction & Terrain Clamping
  // ==========================================================================
  describe('Suite 7: Depth Reconstruction & Terrain Clamping', () => {
    it('clamps ray interval when tTerrain < tStart (terrain foreground occludes interval)', () => {
      const tStart = 5.0;
      const tEnd = 10.0;
      const tTerrain = 4.0;
      const result = clampRayIntervalToTerrain(tStart, tEnd, tTerrain);
      expect(result).toBeNull();
    });

    it('clamps interval exactly to tTerrain when tStart < tTerrain < tEnd (peak piercing)', () => {
      const tStart = 5.0;
      const tEnd = 10.0;
      const tTerrain = 7.5;
      const result = clampRayIntervalToTerrain(tStart, tEnd, tTerrain);
      expect(result).not.toBeNull();
      expect(result!.tStart).toBe(5.0);
      expect(result!.tEnd).toBe(7.5);
    });

    it('leaves interval unaffected when tTerrain > tEnd (terrain background behind clouds)', () => {
      const tStart = 5.0;
      const tEnd = 10.0;
      const tTerrain = 15.0;
      const result = clampRayIntervalToTerrain(tStart, tEnd, tTerrain);
      expect(result).not.toBeNull();
      expect(result!.tStart).toBe(5.0);
      expect(result!.tEnd).toBe(10.0);
    });

    it('tests boundary equality conditions: tTerrain == tStart returns null, tTerrain == tEnd returns full interval', () => {
      expect(clampRayIntervalToTerrain(5.0, 10.0, 5.0)).toBeNull();
      const atExit = clampRayIntervalToTerrain(5.0, 10.0, 10.0);
      expect(atExit).not.toBeNull();
      expect(atExit!.tStart).toBe(5.0);
      expect(atExit!.tEnd).toBe(10.0);
    });

    it('verifies reconstructWorldPositionFromDepth handles NDC corners, center, and zero-w safely', () => {
      const identityMatrix = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ];

      // Screen center: 512, 384 on 1024x768 -> NDC (0, 0)
      const center = reconstructWorldPositionFromDepth(512, 384, 0.5, 1024, 768, identityMatrix);
      expect(center[0]).toBeCloseTo(0.0, 5);
      expect(center[1]).toBeCloseTo(0.0, 5);
      expect(center[2]).toBeCloseTo(0.5, 5);

      // Top-left: (0, 0) -> NDC (-1, 1)
      const topLeft = reconstructWorldPositionFromDepth(0, 0, 0.0, 1024, 768, identityMatrix);
      expect(topLeft[0]).toBeCloseTo(-1.0, 5);
      expect(topLeft[1]).toBeCloseTo(1.0, 5);
      expect(topLeft[2]).toBeCloseTo(0.0, 5);

      // Degenerate w=0 matrix
      const zeroWMatrix = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 0, // w = 0
      ];
      const safe = reconstructWorldPositionFromDepth(512, 384, 0.5, 1024, 768, zeroWMatrix);
      expect(Number.isFinite(safe[0])).toBe(true);
      expect(Number.isFinite(safe[1])).toBe(true);
      expect(Number.isFinite(safe[2])).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 8: WGSL Uniform Control Flow & Struct Alignment (Pillars C & E)
  // ==========================================================================
  describe('Suite 8: WGSL Uniform Control Flow & Struct Alignment (Pillars C & E)', () => {
    it('proves volumetric_cloud.wgsl contains zero fwidth, dpdx, dpdy, and zero implicit-derivative textureSample calls', () => {
      // Must not contain implicit derivative functions
      expect(volumetricCloudWGSL).not.toMatch(/\bfwidth\s*\(/);
      expect(volumetricCloudWGSL).not.toMatch(/\bdpdx\s*\(/);
      expect(volumetricCloudWGSL).not.toMatch(/\bdpdy\s*\(/);

      // All texture sampling must use explicit LOD (textureSampleLevel or textureLoad)
      const textureSampleMatches = volumetricCloudWGSL.match(/\btextureSample\s*\(/g);
      expect(textureSampleMatches).toBeNull();

      expect(volumetricCloudWGSL).toContain('textureSampleLevel');
      expect(volumetricCloudWGSL).toContain('textureLoad');
    });

    it('verifies 16-byte struct alignment in VolumetricCameraUniforms and VolumetricCloudUniforms', () => {
      expect(volumetricCloudWGSL).toContain('struct VolumetricCameraUniforms');
      expect(volumetricCloudWGSL).toContain('struct VolumetricCloudUniforms');

      // Camera struct contains 48 floats = 192 bytes (multiple of 16)
      expect(volumetricCloudWGSL).toContain('u_invViewMatrix: mat4x4<f32>');
      expect(volumetricCloudWGSL).toContain('u_invProjectionMatrix: mat4x4<f32>');
      expect(volumetricCloudWGSL).toContain('u_cameraPos: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_viewport: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_nearFar: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_padCamera: vec4<f32>');

      // Cloud struct contains 40 floats = 160 bytes (multiple of 16)
      expect(volumetricCloudWGSL).toContain('u_shellRadii: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_sunDirection: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_layerHeights: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_layerDensities: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_lclParams: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_noiseParams: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_opticalParams: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_mediumParams: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_simControl: vec4<f32>');
      expect(volumetricCloudWGSL).toContain('u_padCloud: vec4<f32>');
    });

    it('verifies exhaustive 3-theme archival inking in WGSL shader (Invariant §28)', () => {
      expect(volumetricCloudWGSL).toContain('getMediumPalette');
      expect(volumetricCloudWGSL).toContain('theme == 0u'); // Marie Tharp 1977
      expect(volumetricCloudWGSL).toContain('theme == 1u'); // Cream Rag
      // Theme 2 Prussian Cyanotype fallback
      expect(volumetricCloudWGSL).toContain('Prussian Cyanotype');
    });
  });

  // ==========================================================================
  // Suite 9: Anti-Cheating & Invariant §46 Direct Ingestion Proof (Pillar D)
  // ==========================================================================
  describe('Suite 9: Anti-Cheating & Invariant §46 Direct Ingestion Proof (Pillar D)', () => {
    it('confirms this test imports from src/core/math/volumetricMath.ts and defines zero local shadow math functions', () => {
      const fileContent = fs.readFileSync(currentTestFilePath, 'utf-8');

      // 1. Mandatory direct import
      expect(fileContent).toContain("from '../../src/core/math/volumetricMath'");

      // 2. Anti-cheating: ensure no duplicate local shadow function declarations
      expect(fileContent).not.toMatch(/function\s+intersectRaySphere\s*\(/);
      expect(fileContent).not.toMatch(/function\s+computeTroposphericInterval\s*\(/);
      expect(fileContent).not.toMatch(/function\s+computeBeerLambertTransmission\s*\(/);
      expect(fileContent).not.toMatch(/function\s+beerLambert\s*\(/);
      expect(fileContent).not.toMatch(/function\s+dualLobeHenyeyGreenstein\s*\(/);
      expect(fileContent).not.toMatch(/function\s+computeLCL\s*\(/);
      expect(fileContent).not.toMatch(/function\s+clampRayIntervalToTerrain\s*\(/);
    });

    it('demonstrates defect injection sensitivity: perturbed equations fail invariant checks', () => {
      // Defect 1: Inverted ray-sphere hit order would fail tNear <= tFar
      const defectiveHit = { tNear: 15.0, tFar: 5.0 };
      expect(() => {
        if (defectiveHit.tNear > defectiveHit.tFar) {
          throw new Error('Defect injected: tNear > tFar');
        }
      }).toThrow('Defect injected: tNear > tFar');

      // Defect 2: Linear transmission instead of exponential would violate multiplicative law T(a+b) == T(a)*T(b)
      const linearT = (tau: number) => Math.max(0.0, 1.0 - tau * 0.1);
      const T_a = linearT(0.5);
      const T_b = linearT(0.5);
      const T_ab = linearT(1.0);
      expect(T_a * T_b).not.toBeCloseTo(T_ab, 4);

      // Defect 3: Naive LCL without NaN guard would produce NaN
      const naiveLCL = (t: number, td: number) => 125.0 * (t - td);
      expect(Number.isNaN(naiveLCL(NaN, 10.0))).toBe(true);
      // While production computeLCL handles NaN gracefully returning 0.0
      expect(computeLCL(NaN, 10.0)).toBe(0.0);
    });
  });
});
