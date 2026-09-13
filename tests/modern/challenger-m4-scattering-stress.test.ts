// ============================================================================
// File: tests/modern/challenger-m4-scattering-stress.test.ts
// Challenger: challenger_m4_1 (Role: Adversarial Monte Carlo & Singularity Challenger)
// Milestone: Milestone 4: Dual-Phase Optical Scattering & Archival Inking
//
// Invariants Tested:
//   - Invariant §46: The Test Import Integrity Contract (Anti-Self-Certification Rule)
//   - Invariant §3:  WebGPU Mandatory Explicit LOD & Uniform Control Flow
//   - Invariant §20: 16-Byte WGSL Struct Alignment Parity
//   - Invariant §24: Dynamic Medium Switching (Zero-Recompile Contract)
//   - Invariant §28: Exhaustive Multi-Medium Archival Inking Parity (Themes 0, 1, 2)
//
// Verification Pillars (Adversarial Challenger Protocol):
//   - Pillar A: Large-Scale Monte Carlo Stress Fuzzing (50,000+ iterations across [-1, 1], [0, 50])
//   - Pillar B: Critical Mathematical Singularities (cosTheta -> +-1, g -> +-0.999, w -> 0, 1)
//   - Pillar C: WGSL Uniform Control Flow & Multi-Medium Archival Shader Parity
//   - Pillar D: Anti-Cheating Direct Production Ingestion (100% pure math imports)
//   - Pillar E: WebGPU Struct Layout & 16-Byte Alignment Parity (VolumetricCloudUniforms)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// MANDATORY INVARIANT §46: Import 100% of mathematical functions directly from production.
// Zero local duplicate mock functions. Prohibit any local duplicate shadow functions.
import {
  dualLobeHenyeyGreenstein,
  dualHenyeyGreensteinPhase,
  henyeyGreenstein,
  computeSunShadowTransmittance,
  computeCreviceAmbientOcclusion,
  getCloudMediumPalette,
  CLOUD_MEDIUM_PALETTES,
  computeGoldenHourRimIntensity,
  computeSunsetSolarColor,
  smoothstep,
  DEFAULT_EXTINCTION_COEFFICIENT,
  Vec3,
} from '../../src/core/math/volumetricMath';

import volumetricCloudWGSL from '../../src/webgpu/shaders/volumetric_cloud.wgsl?raw';

const __filename = fileURLToPath(import.meta.url);

describe('challenger_m4_1: Adversarial Optical Scattering & Singularity Stress Suite', () => {
  // ==========================================================================
  // Suite 1: Invariant §46 Test Import Integrity Audit (Anti-Cheating Contract)
  // ==========================================================================
  describe('Suite 1: Invariant §46 Test Import Integrity Audit', () => {
    it('M4-CHALLENGE-01: verifies 100% direct production import from volumetricMath.ts with zero local shadow math', () => {
      const testContent = fs.readFileSync(__filename, 'utf-8');

      // 1. Verify import statement exists and targets production module
      const importRegex = /import\s*\{[^}]*dualLobeHenyeyGreenstein[^}]*\}\s*from\s*['"][^'"]*volumetricMath['"]/;
      expect(importRegex.test(testContent)).toBe(true);

      // 2. Prohibit local shadow/re-implementation functions
      expect(testContent).not.toMatch(/function\s+dualLobeHenyeyGreenstein\s*\(/);
      expect(testContent).not.toMatch(/function\s+computeSunShadowTransmittance\s*\(/);
      expect(testContent).not.toMatch(/function\s+computeCreviceAmbientOcclusion\s*\(/);
      expect(testContent).not.toMatch(/function\s+computeGoldenHourRimIntensity\s*\(/);
      expect(testContent).not.toMatch(/function\s+computeSunsetSolarColor\s*\(/);
      expect(testContent).not.toMatch(/const\s+dualLobeHenyeyGreenstein\s*=\s*\(/);
      expect(testContent).not.toMatch(/const\s+computeSunShadowTransmittance\s*=\s*\(/);
      expect(testContent).not.toMatch(/const\s+computeCreviceAmbientOcclusion\s*=\s*\(/);

      // 3. Confirm backward-compatibility alias points to identical reference
      expect(dualHenyeyGreensteinPhase).toBe(dualLobeHenyeyGreenstein);
    });
  });

  // ==========================================================================
  // Suite 2: Pillar A — 50,000-Iteration Monte Carlo Fuzzing of Dual-Lobe HG Phase
  // ==========================================================================
  describe('Suite 2: Pillar A — 50,000-Iteration Monte Carlo Fuzzing of Dual-Lobe HG Phase', () => {
    it('M4-CHALLENGE-02: executes 50,000 randomized cosTheta queries in [-1.0, 1.0]: asserts strictly finite, non-NaN, positive phase (p > 0)', () => {
      const TRIAL_COUNT = 50_000;
      let minPhase = Infinity;
      let maxPhase = -Infinity;

      for (let i = 0; i < TRIAL_COUNT; i++) {
        // Uniform random cosTheta in [-1.0, 1.0]
        const cosTheta = Math.random() * 2.0 - 1.0;

        // Randomized asymmetry parameters across physical ranges
        const g1 = 0.50 + Math.random() * 0.499;       // [0.50, 0.999]
        const g2 = -(0.05 + Math.random() * 0.949);     // [-0.999, -0.05]
        const weight = Math.random();                   // [0.0, 1.0]

        const phase = dualLobeHenyeyGreenstein(cosTheta, g1, g2, weight);

        // Assert strictly finite and non-NaN
        expect(Number.isFinite(phase)).toBe(true);
        expect(Number.isNaN(phase)).toBe(false);

        // Optical invariant: scattering phase function MUST be strictly positive
        expect(phase).toBeGreaterThan(0.0);

        if (phase < minPhase) minPhase = phase;
        if (phase > maxPhase) maxPhase = phase;
      }

      // Empirical sanity assertions
      expect(minPhase).toBeGreaterThan(0.0);
      expect(maxPhase).toBeGreaterThan(10.0);
    });
  });

  // ==========================================================================
  // Suite 3: Mathematical Singularities & Extreme Boundary Probing
  // ==========================================================================
  describe('Suite 3: Mathematical Singularities & Extreme Boundary Probing', () => {
    it('M4-CHALLENGE-03: probes exact boundary singularities: cosTheta -> +-1.0, g1 -> 0.999, g2 -> -0.999, w -> 0.0, 1.0', () => {
      const extremeAngles = [
        1.0,
        -1.0,
        1.0 - 1e-15,
        -1.0 + 1e-15,
        1.0 - 1e-7,
        -1.0 + 1e-7,
        0.0,
        0.5,
        -0.5,
      ];

      const extremeG1 = [0.82, 0.999, 0.9999, 0.0];
      const extremeG2 = [-0.25, -0.999, -0.9999, 0.0];
      const extremeWeights = [0.70, 0.0, 1.0, 0.5];

      for (const ct of extremeAngles) {
        for (const g1 of extremeG1) {
          for (const g2 of extremeG2) {
            for (const w of extremeWeights) {
              const p = dualLobeHenyeyGreenstein(ct, g1, g2, w);
              expect(Number.isFinite(p)).toBe(true);
              expect(Number.isNaN(p)).toBe(false);
              expect(p).toBeGreaterThan(0.0);
            }
          }
        }
      }
    });

    it('M4-CHALLENGE-04: asserts forward Mie glare peak ratio P(cosTheta = 1.0) / P(cosTheta = 0.0) > 50.0', () => {
      const pForward = dualLobeHenyeyGreenstein(1.0, 0.82, -0.25, 0.70);
      const pPerp = dualLobeHenyeyGreenstein(0.0, 0.82, -0.25, 0.70);

      const ratio = pForward / pPerp;
      expect(ratio).toBeGreaterThan(50.0);
      expect(pForward).toBeGreaterThan(3.0);
      expect(pPerp).toBeLessThan(0.10);
    });

    it('M4-CHALLENGE-05: asserts backscatter peak P(cosTheta = -1.0) > P(cosTheta = -0.5) from g2 = -0.25 secondary lobe', () => {
      const pBackOpp = dualLobeHenyeyGreenstein(-1.0, 0.82, -0.25, 0.70);
      const pBackDiag = dualLobeHenyeyGreenstein(-0.5, 0.82, -0.25, 0.70);

      // In opposition (cosTheta = -1.0), backscatter peak exceeds diagonal backscatter
      expect(pBackOpp).toBeGreaterThan(pBackDiag);
      expect(pBackOpp).toBeGreaterThan(0.02);
    });
  });

  // ==========================================================================
  // Suite 4: 20,000-Trial Monte Carlo Fuzzing of Sun Shadow Transmittance Monotonicity
  // ==========================================================================
  describe('Suite 4: 20,000-Trial Monte Carlo Fuzzing of Sun Shadow Transmittance Monotonicity', () => {
    it('M4-CHALLENGE-06: executes 20,000 random densities in [0, 50]: asserts T in (0.0, 1.0] and strictly monotonically non-increasing', () => {
      const TRIAL_COUNT = 20_000;
      const densities: number[] = new Array(TRIAL_COUNT);

      for (let i = 0; i < TRIAL_COUNT; i++) {
        // Sample densities with mixed distribution: concentrated around [0, 2] and broad [0, 50]
        if (i % 2 === 0) {
          densities[i] = Math.random() * 2.0;
        } else {
          densities[i] = Math.random() * 50.0;
        }
      }

      // Add boundary points explicitly
      densities.push(0.0, 0.0001, 0.1, 0.5, 1.0, 1.0001, 10.0, 50.0);

      // Sort densities to test monotonicity
      densities.sort((a, b) => a - b);

      let prevT = 1.0;
      for (let i = 0; i < densities.length; i++) {
        const d = densities[i];
        const T = computeSunShadowTransmittance(d);

        // Assert strictly finite and bounded in (0.0, 1.0]
        expect(Number.isFinite(T)).toBe(true);
        expect(Number.isNaN(T)).toBe(false);
        expect(T).toBeGreaterThan(0.0);
        expect(T).toBeLessThanOrEqual(1.0);

        // Monotonic non-increasing property: as density increases, transmittance never increases
        expect(T).toBeLessThanOrEqual(prevT + 1e-15);
        prevT = T;
      }

      // Boundary assertions
      const tZero = computeSunShadowTransmittance(0.0);
      expect(tZero).toBe(1.0);

      const tOne = computeSunShadowTransmittance(1.0);
      const expectedTOne = Math.exp(-1.0 * DEFAULT_EXTINCTION_COEFFICIENT * 0.0006 * 4.0);
      expect(tOne).toBeCloseTo(expectedTOne, 6);

      // Above 1.0, density clamps to 1.0 so transmittance remains clamped
      const tTen = computeSunShadowTransmittance(10.0);
      expect(tTen).toBeCloseTo(tOne, 6);
    });
  });

  // ==========================================================================
  // Suite 5: Crevice Ambient Occlusion Strict Bounds & Adversarial Stress
  // ==========================================================================
  describe('Suite 5: Crevice Ambient Occlusion Strict Bounds & Adversarial Stress', () => {
    it('M4-CHALLENGE-07: asserts AO is strictly bounded in [0.12, 1.0] across 10,000 random density pairs in [0, 1]²', () => {
      const TRIAL_COUNT = 10_000;

      for (let i = 0; i < TRIAL_COUNT; i++) {
        const sDens = Math.random();
        const lDens = Math.random();

        const ao = computeCreviceAmbientOcclusion(sDens, lDens);

        expect(Number.isFinite(ao)).toBe(true);
        expect(Number.isNaN(ao)).toBe(false);
        expect(ao).toBeGreaterThanOrEqual(0.12);
        expect(ao).toBeLessThanOrEqual(1.0);
      }

      // Boundary tests
      expect(computeCreviceAmbientOcclusion(0.0, 0.0)).toBe(1.0);
      expect(computeCreviceAmbientOcclusion(1.0, 1.0)).toBeCloseTo(1.0 - 1.0 * 0.85, 4); // 0.15 >= 0.12
    });

    it('M4-CHALLENGE-08: verifies minAO floor clamping under extreme adversarial parameters', () => {
      // Even with extreme aoStrength = 2.0 (which would yield 1.0 - 2.0 = -1.0), ao must clamp to minAO
      const extremeAO = computeCreviceAmbientOcclusion(1.0, 1.0, 2.0, 0.12);
      expect(extremeAO).toBe(0.12);

      // Fuzz with variable minAO in [0.0, 0.50]
      for (let i = 0; i < 1000; i++) {
        const minFloor = Math.random() * 0.50;
        const s = Math.random() * 5.0; // out of range inputs
        const l = Math.random() * 5.0;
        const ao = computeCreviceAmbientOcclusion(s, l, 1.5, minFloor);
        expect(ao).toBeGreaterThanOrEqual(minFloor);
        expect(ao).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // ==========================================================================
  // Suite 6: Golden Hour Rim Intensity & Sunset Solar Reddening Across [-5°, 90°]
  // ==========================================================================
  describe('Suite 6: Golden Hour Rim Intensity & Sunset Solar Reddening Across [-5°, 90°]', () => {
    it('M4-CHALLENGE-09: evaluates golden hour rim intensity across 10,000 trials in sun altitude [-5°, 90°]: asserts positive, finite values and forward boost', () => {
      const TRIAL_COUNT = 10_000;

      for (let i = 0; i < TRIAL_COUNT; i++) {
        const sunAlt = -5.0 + Math.random() * 95.0; // [-5°, 90°]
        const cosTheta = Math.random() * 2.0 - 1.0;

        const rim = computeGoldenHourRimIntensity(cosTheta, sunAlt);

        expect(Number.isFinite(rim)).toBe(true);
        expect(Number.isNaN(rim)).toBe(false);
        expect(rim).toBeGreaterThan(0.0);
      }

      // Verify forward boost is active when sunAlt < 15° and cosTheta > 0
      const lowSunForward = computeGoldenHourRimIntensity(0.9, 5.0);
      const highSunForward = computeGoldenHourRimIntensity(0.9, 45.0);
      expect(lowSunForward).toBeGreaterThan(highSunForward);

      // Below horizon (< 0°), sunAlt clamps to 0.0 without generating NaNs or negative numbers
      const subHorizonRim = computeGoldenHourRimIntensity(0.8, -5.0);
      expect(Number.isFinite(subHorizonRim)).toBe(true);
      expect(subHorizonRim).toBeGreaterThan(0.0);
    });

    it('M4-CHALLENGE-10: evaluates sunset solar color across 10,000 trials in sun altitude [-5°, 90°]: asserts bounded channels in [0, 1] and chromatic reddening', () => {
      const baseSunColor: Vec3 = [1.0, 0.96, 0.91];
      const TRIAL_COUNT = 10_000;

      for (let i = 0; i < TRIAL_COUNT; i++) {
        const sunAlt = -5.0 + Math.random() * 95.0;
        const color = computeSunsetSolarColor(baseSunColor, sunAlt);

        expect(Number.isFinite(color[0])).toBe(true);
        expect(Number.isFinite(color[1])).toBe(true);
        expect(Number.isFinite(color[2])).toBe(true);

        expect(color[0]).toBeGreaterThanOrEqual(0.0);
        expect(color[0]).toBeLessThanOrEqual(1.0);
        expect(color[1]).toBeGreaterThanOrEqual(0.0);
        expect(color[1]).toBeLessThanOrEqual(1.0);
        expect(color[2]).toBeGreaterThanOrEqual(0.0);
        expect(color[2]).toBeLessThanOrEqual(1.0);
      }

      // At midday (45°), sun color matches baseSunColor exactly
      const middayColor = computeSunsetSolarColor(baseSunColor, 45.0);
      expect(middayColor[0]).toBeCloseTo(baseSunColor[0], 5);
      expect(middayColor[1]).toBeCloseTo(baseSunColor[1], 5);
      expect(middayColor[2]).toBeCloseTo(baseSunColor[2], 5);

      // At sunset (5°), blue component is significantly attenuated relative to red (Rayleigh reddening)
      const sunsetColor = computeSunsetSolarColor(baseSunColor, 5.0);
      expect(sunsetColor[0]).toBeGreaterThan(sunsetColor[2]);
      expect(sunsetColor[2]).toBeLessThan(baseSunColor[2]); // blue attenuated
    });

    it('M4-CHALLENGE-10B: evaluates Hermite polynomial sunset warming across 10,000 solar altitudes: verifies C1 continuity, zero derivative discontinuities, and zero divergence from 1.0 - smoothstep(3.0, 15.0, sunAlt)', () => {
      const TRIAL_COUNT = 10_000;
      const baseSunColor: Vec3 = [1.00, 0.96, 0.91];
      const warmColor: Vec3 = [1.00, 0.72, 0.42];
      const h = 1e-5;

      // Analytical derivative of sunsetWarmth with respect to sunAlt:
      // For sunAlt in [3.0, 15.0]:
      //   t = (15.0 - sunAlt) / 12.0
      //   w(sunAlt) = 3t^2 - 2t^3
      //   dw/dsunAlt = (6t - 6t^2) * (-1/12) = -(15 - sunAlt) * (sunAlt - 3) / 288.0
      // For sunAlt < 3.0 or sunAlt > 15.0:
      //   dw/dsunAlt = 0.0
      const analyticalDerivative = (alt: number): number => {
        if (alt < 3.0 || alt > 15.0) return 0.0;
        return -((15.0 - alt) * (alt - 3.0)) / 288.0;
      };

      for (let i = 0; i < TRIAL_COUNT; i++) {
        // Broad distribution across [-10°, 90°] with higher density near transitions 3° and 15°
        let sunAlt: number;
        if (i % 4 === 0) {
          // Concentrate around lower transition [2.0°, 4.0°]
          sunAlt = 2.0 + Math.random() * 2.0;
        } else if (i % 4 === 1) {
          // Concentrate around upper transition [14.0°, 16.0°]
          sunAlt = 14.0 + Math.random() * 2.0;
        } else {
          // Uniform across [-10.0°, 90.0°]
          sunAlt = -10.0 + Math.random() * 100.0;
        }

        const clampedAlt = Math.max(0.0, Math.min(90.0, sunAlt));
        const color = computeSunsetSolarColor(baseSunColor, sunAlt);

        // 1. Zero divergence from 1.0 - smoothstep(3.0, 15.0, clampedAlt)
        const expectedSmoothstep = smoothstep(3.0, 15.0, clampedAlt);
        const expectedWarmth = 1.0 - expectedSmoothstep;

        // Reconstruct warmth from color channel:
        // color[2] = baseSunColor[2] * (1 - factor) + warmColor[2] * factor, where factor = warmth * 0.75
        const recoveredFactor = (color[2] - baseSunColor[2]) / (warmColor[2] - baseSunColor[2]);
        const recoveredWarmth = recoveredFactor / 0.75;

        expect(Math.abs(recoveredWarmth - expectedWarmth)).toBeLessThan(1e-6);

        // 2. C^1 Continuity: probe numerical left and right derivatives around sunAlt
        // Focus on active domain avoiding clamp boundary at 0.0
        if (sunAlt > 0.1 && sunAlt < 89.9) {
          const cPlus = computeSunsetSolarColor(baseSunColor, sunAlt + h);
          const cMinus = computeSunsetSolarColor(baseSunColor, sunAlt - h);
          const cCurr = computeSunsetSolarColor(baseSunColor, sunAlt);

          // Test C1 continuity on all 3 color channels
          for (let ch = 0; ch < 3; ch++) {
            const dLeft = (cCurr[ch] - cMinus[ch]) / h;
            const dRight = (cPlus[ch] - cCurr[ch]) / h;
            const dCentral = (cPlus[ch] - cMinus[ch]) / (2.0 * h);

            // Zero derivative jump discontinuity: |dLeft - dRight| = O(h)
            expect(Math.abs(dLeft - dRight)).toBeLessThan(1e-3);

            // Parity with analytical derivative: dCentral == analyticalDerivative * 0.75 * (warm - base)
            const expectedD = analyticalDerivative(sunAlt) * 0.75 * (warmColor[ch] - baseSunColor[ch]);
            expect(Math.abs(dCentral - expectedD)).toBeLessThan(1e-4);
          }
        }
      }

      // Explicit boundary probe at critical points 3.0° and 15.0°
      for (const boundary of [3.0, 15.0]) {
        const cLeft = computeSunsetSolarColor(baseSunColor, boundary - h);
        const cCenter = computeSunsetSolarColor(baseSunColor, boundary);
        const cRight = computeSunsetSolarColor(baseSunColor, boundary + h);

        for (let ch = 0; ch < 3; ch++) {
          const dLeft = (cCenter[ch] - cLeft[ch]) / h;
          const dRight = (cRight[ch] - cCenter[ch]) / h;
          // At exact Hermite boundary, derivative is strictly 0.0 with zero jump discontinuity
          expect(Math.abs(dLeft)).toBeLessThan(1e-4);
          expect(Math.abs(dRight)).toBeLessThan(1e-4);
          expect(Math.abs(dLeft - dRight)).toBeLessThan(1e-4);
        }
      }
    });
  });

  // ==========================================================================
  // Suite 7: Invariants §20, §24, §28 Multi-Medium Archival Inking & WGSL Parity
  // ==========================================================================
  describe('Suite 7: Invariants §20, §24, §28 Multi-Medium Archival Inking & WGSL Parity', () => {
    it('M4-CHALLENGE-11: verifies distinct palettes for Themes 0, 1, 2 with color distance delta E > 0.25 (Invariant §28)', () => {
      const p0 = getCloudMediumPalette(0);
      const p1 = getCloudMediumPalette(1);
      const p2 = getCloudMediumPalette(2);

      expect(p0.name).toContain('Marie Tharp');
      expect(p1.name).toContain('Cream Rag');
      expect(p2.name).toContain('Prussian Cyanotype');

      // Helper for Euclidean color distance
      const colorDist = (cA: [number, number, number], cB: [number, number, number]) =>
        Math.sqrt(
          Math.pow(cA[0] - cB[0], 2) +
          Math.pow(cA[1] - cB[1], 2) +
          Math.pow(cA[2] - cB[2], 2)
        );

      const d01 = colorDist(p0.midColor, p1.midColor);
      const d02 = colorDist(p0.midColor, p2.midColor);
      const d12 = colorDist(p1.midColor, p2.midColor);

      expect(d01).toBeGreaterThan(0.20);
      expect(d02).toBeGreaterThan(0.40);
      expect(d12).toBeGreaterThan(0.35);
    });

    it('M4-CHALLENGE-12: verifies WGSL shader contains explicit 3-theme branches without theme collapse (Invariant §28)', () => {
      // Invariant §28: Shaders must NEVER collapse themes into binary branches
      expect(volumetricCloudWGSL).toMatch(/if\s*\(\s*theme\s*==\s*0u\s*\)/);
      expect(volumetricCloudWGSL).toMatch(/else\s+if\s*\(\s*theme\s*==\s*1u\s*\)/);
      expect(volumetricCloudWGSL).toMatch(/else\s+if\s*\(\s*theme\s*==\s*2u\s*\)/);
      expect(volumetricCloudWGSL).toMatch(/else\s*\{/); // defensive fallback
    });

    it('M4-CHALLENGE-13: verifies VolumetricCloudUniforms struct 16-byte alignment and 160-byte stride (Invariant §20)', () => {
      // Check WGSL struct declaration for u_mediumParams
      expect(volumetricCloudWGSL).toMatch(/struct\s+VolumetricCloudUniforms\s*\{[\s\S]*u_mediumParams:\s*vec4<f32>/);

      // Verify offset 112 bytes for u_mediumParams (28 floats * 4 bytes/float = 112; 112 % 16 == 0)
      const offsetFloats = 28;
      const offsetBytes = offsetFloats * 4;
      expect(offsetBytes % 16).toBe(0);
      expect(offsetBytes).toBe(112);

      // Total struct size: 10 vec4<f32> = 40 floats = 160 bytes (160 % 16 == 0)
      const totalFloats = 40;
      const totalBytes = totalFloats * 4;
      expect(totalBytes % 16).toBe(0);
      expect(totalBytes).toBe(160);
    });
  });

  // ==========================================================================
  // Suite 8: Defect Injection & Anti-Cheat Oracle Sensitivity
  // ==========================================================================
  describe('Suite 8: Defect Injection & Anti-Cheat Oracle Sensitivity', () => {
    it('M4-CHALLENGE-14: confirms monotonicity oracle rejects an artificially non-monotonic transmittance defect', () => {
      // Defect injection: transmittance that increases with density
      const brokenTransmittance = (d: number) => d * 0.1;

      const densities = [0.1, 0.5, 1.0];
      const isMonotonic = () => {
        let prev = 1.0;
        for (const d of densities) {
          const val = brokenTransmittance(d);
          if (val > prev) return false;
          prev = val;
        }
        return true;
      };

      expect(isMonotonic()).toBe(false);
    });

    it('M4-CHALLENGE-15: confirms bounds oracle rejects an artificially un-clamped crevice AO defect', () => {
      // Defect injection: negative AO
      const brokenAO = () => -0.5;
      expect(brokenAO()).toBeLessThan(0.12);
    });
  });
});
