// ============================================================================
// File: tests/modern/schneider-cumulus-parity.test.ts
// Purpose: Mathematical Verification & Monte Carlo Fuzzing for Schneider 2015
//          Convective Cumulus Density Pipeline & Spherical Anisotropic Coordinates
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  remap,
  cumulusHeightProfile,
  sphericalNoiseCoord,
  schneiderDensityRemap,
  type Vec3,
} from '../../src/core/math/volumetricMath';

describe('Schneider 2015 Spherical Convective Cumulus Pure Math Parity', () => {
  describe('remap()', () => {
    it('accurately remaps values linearly between input and output ranges', () => {
      expect(remap(0.5, 0.0, 1.0, 0.0, 10.0)).toBeCloseTo(5.0, 5);
      expect(remap(0.2, 0.0, 1.0, 10.0, 20.0)).toBeCloseTo(12.0, 5);
    });

    it('clamps values below inMin to outMin and above inMax to outMax', () => {
      expect(remap(-0.5, 0.0, 1.0, 0.0, 1.0)).toBe(0.0);
      expect(remap(1.5, 0.0, 1.0, 0.0, 1.0)).toBe(1.0);
    });

    it('gracefully handles division-by-zero when inMin === inMax', () => {
      expect(() => remap(0.5, 0.5, 0.5, 0.0, 1.0)).not.toThrow();
      const val = remap(0.5, 0.5, 0.5, 0.0, 1.0);
      expect(Number.isFinite(val)).toBe(true);
    });
  });

  describe('cumulusHeightProfile()', () => {
    const lowBottom = 0.04;
    const lowTop = 0.16;

    it('returns strict zero below lowBottom and above lowTop', () => {
      expect(cumulusHeightProfile(0.0, lowBottom, lowTop)).toBe(0.0);
      expect(cumulusHeightProfile(0.039, lowBottom, lowTop)).toBe(0.0);
      expect(cumulusHeightProfile(lowBottom, lowBottom, lowTop)).toBe(0.0);
      expect(cumulusHeightProfile(lowTop, lowBottom, lowTop)).toBe(0.0);
      expect(cumulusHeightProfile(0.20, lowBottom, lowTop)).toBe(0.0);
    });

    it('rises rapidly in the lower 20% of the stratum (flat cloud base)', () => {
      const z10 = lowBottom + 0.10 * (lowTop - lowBottom);
      const z20 = lowBottom + 0.20 * (lowTop - lowBottom);
      const val10 = cumulusHeightProfile(z10, lowBottom, lowTop);
      const val20 = cumulusHeightProfile(z20, lowBottom, lowTop);

      expect(val10).toBeGreaterThan(0.0);
      expect(val20).toBeGreaterThan(val10);
      expect(val20).toBeGreaterThan(0.80); // Rapid condensation rise
    });

    it('exhibits convective buoyancy expansion in the upper stratum', () => {
      const z30 = lowBottom + 0.30 * (lowTop - lowBottom);
      const z60 = lowBottom + 0.60 * (lowTop - lowBottom);
      const val30 = cumulusHeightProfile(z30, lowBottom, lowTop);
      const val60 = cumulusHeightProfile(z60, lowBottom, lowTop);

      expect(val30).toBeGreaterThan(0.70);
      expect(val60).toBeGreaterThan(0.40); // Convective anvil spread keeps upper body wide
    });
  });

  describe('sphericalNoiseCoord()', () => {
    it('traverses exactly freqVert periods vertically across the troposphere shell', () => {
      const pos: Vec3 = [0.0, 5.0, 0.0]; // North pole
      const freqHoriz = 28.0;
      const freqVert = 5.5;

      const coordBase = sphericalNoiseCoord(pos, 0.0, freqHoriz, freqVert, 0.0);
      const coordTop = sphericalNoiseCoord(pos, 1.0, freqHoriz, freqVert, 0.0);

      const dy = coordTop[1] - coordBase[1];
      expect(dy).toBeCloseTo(freqVert, 5);
    });

    it('handles poles and arbitrary unit vectors without NaNs', () => {
      const northPole: Vec3 = [0.0, 5.0, 0.0];
      const southPole: Vec3 = [0.0, -5.0, 0.0];
      const equator: Vec3 = [5.0, 0.0, 0.0];

      for (const pos of [northPole, southPole, equator]) {
        const coord = sphericalNoiseCoord(pos, 0.5, 28.0, 5.5, 10.0);
        expect(Number.isFinite(coord[0])).toBe(true);
        expect(Number.isFinite(coord[1])).toBe(true);
        expect(Number.isFinite(coord[2])).toBe(true);
      }
    });
  });

  describe('schneiderDensityRemap()', () => {
    it('enforces Clear Skies Invariant: returns 0.0 when coverage is 0.0', () => {
      expect(schneiderDensityRemap(0.8, 0.0, 1.0)).toBe(0.0);
      expect(schneiderDensityRemap(1.0, 0.0005, 1.0)).toBe(0.0);
    });

    it('preserves base noise when coverage is 1.0 and erosion is 0.0', () => {
      expect(schneiderDensityRemap(0.75, 1.0, 1.0, 0.0, 0.0)).toBeCloseTo(0.75, 3);
      expect(schneiderDensityRemap(0.35, 1.0, 1.0, 0.0, 0.0)).toBeCloseTo(0.35, 3);
    });

    it('carves low noise values when coverage is moderate (dynamic threshold)', () => {
      // With coverage 0.5, threshold is clamp(1.0 - 0.5 * 1.35, 0.0, 0.85) = 0.325.
      // Base noise 0.2 should be carved to 0.0.
      expect(schneiderDensityRemap(0.2, 0.5, 1.0)).toBe(0.0);
      // Base noise 0.75 should remap to (0.75 - 0.325) / 0.675 ≈ 0.630
      expect(schneiderDensityRemap(0.75, 0.5, 1.0)).toBeCloseTo(0.630, 2);
    });

    it('erodes cloud boundary non-destructively with altitude modulation', () => {
      const baseDense = 0.8;
      const coverage = 0.8;
      const profile = 1.0;
      const worley = 0.6;
      const erosionStr = 0.4;

      const densityAtBase = schneiderDensityRemap(baseDense, coverage, profile, worley, erosionStr, 0.05);
      const densityAtTop = schneiderDensityRemap(baseDense, coverage, profile, worley, erosionStr, 0.95);

      // Top should have stronger erosion than flat base
      expect(densityAtBase).toBeGreaterThan(densityAtTop);
      expect(densityAtTop).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('Monte Carlo Fuzzing Invariant (10,000 trials)', () => {
    it('guarantees density output is strictly finite and bounded in [0.0, 1.0]', () => {
      for (let i = 0; i < 10000; i++) {
        const baseNoise = Math.random();
        const coverage = Math.random();
        const profile = Math.random();
        const worley = Math.random();
        const erosionStr = Math.random();
        const zNorm = Math.random();

        const density = schneiderDensityRemap(baseNoise, coverage, profile, worley, erosionStr, zNorm);

        expect(Number.isFinite(density)).toBe(true);
        expect(density).toBeGreaterThanOrEqual(0.0);
        expect(density).toBeLessThanOrEqual(1.0);
      }
    });
  });
});
