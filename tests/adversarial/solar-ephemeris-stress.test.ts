/**
 * tests/adversarial/solar-ephemeris-stress.test.ts
 *
 * Adversarial Challenger Stress Suite for SolarEphemeris (Pillar A & Pillar B).
 * Enforces:
 * 1. 50,000 random UTC timestamps spanning 1970-2030
 * 2. Strict physical and mathematical invariants across all samples:
 *    - declination ∈ [-23.45°, +23.45°]
 *    - sun vector is unit length (‖v‖ = 1.0 ± 1e-6)
 *    - subsolar longitude ∈ [-180°, +180°]
 *    - Zero NaN, Infinity, or unnormalized vectors
 * 3. Exact temporal boundary probing:
 *    - Leap year boundaries (Feb 29)
 *    - Year transitions (Dec 31 23:59:59.999 → Jan 1 00:00:00)
 *    - Unix epoch edge (Jan 1 1970 00:00:00 UTC)
 */

import { describe, it, expect } from 'vitest';
import { getSolarPosition } from '../../src/core/astronomy/SolarEphemeris';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MAX_DECLINATION_RAD = 23.45 * DEG_TO_RAD;

describe('Adversarial Challenger: Solar Ephemeris Stress Suite', () => {
  it('Pillar A: Monte Carlo fuzzing over 50,000 random UTC timestamps spanning 1970-2030', () => {
    // 1970-01-01 00:00:00 UTC to 2030-12-31 23:59:59 UTC
    const startEpochMs = Date.UTC(1970, 0, 1, 0, 0, 0, 0);
    const endEpochMs = Date.UTC(2030, 11, 31, 23, 59, 59, 999);
    const timeSpanMs = endEpochMs - startEpochMs;

    const ITERATIONS = 50_000;
    const t0 = performance.now();

    for (let i = 0; i < ITERATIONS; i++) {
      const randomMs = startEpochMs + Math.random() * timeSpanMs;
      const pos = getSolarPosition(randomMs);

      // 1. No NaN or Infinity in any output field
      if (
        !Number.isFinite(pos.declination) ||
        !Number.isFinite(pos.subsolarLon) ||
        !Number.isFinite(pos.sunVector[0]) ||
        !Number.isFinite(pos.sunVector[1]) ||
        !Number.isFinite(pos.sunVector[2])
      ) {
        throw new Error(
          `Non-finite value detected at epoch ${randomMs}: ${JSON.stringify(pos)}`
        );
      }

      // 2. Declination ∈ [-23.45°, +23.45°]
      if (Math.abs(pos.declination) > MAX_DECLINATION_RAD + 1e-6) {
        throw new Error(
          `Declination out of bounds (${pos.declination * RAD_TO_DEG}°) at epoch ${randomMs}`
        );
      }

      // 3. Subsolar longitude ∈ [-180°, +180°] (i.e. [-π, +π] radians)
      if (Math.abs(pos.subsolarLon) > Math.PI + 1e-6) {
        throw new Error(
          `Subsolar longitude out of bounds (${pos.subsolarLon * RAD_TO_DEG}°) at epoch ${randomMs}`
        );
      }

      // 4. Sun vector is unit length (‖v‖ = 1.0 ± 1e-6)
      const [x, y, z] = pos.sunVector;
      const len = Math.hypot(x, y, z);
      if (Math.abs(len - 1.0) > 1e-6) {
        throw new Error(
          `Sun vector not unit length (‖v‖ = ${len}) at epoch ${randomMs}`
        );
      }
    }

    const elapsed = performance.now() - t0;
    expect(elapsed).toBeGreaterThan(0);
  });

  it('Pillar B: Unix epoch edge (Jan 1 1970 00:00:00 UTC)', () => {
    const epoch0 = 0; // Jan 1 1970 00:00:00 UTC
    const pos = getSolarPosition(epoch0);

    expect(Number.isFinite(pos.declination)).toBe(true);
    expect(Number.isFinite(pos.subsolarLon)).toBe(true);
    expect(Number.isFinite(pos.sunVector[0])).toBe(true);
    expect(Number.isFinite(pos.sunVector[1])).toBe(true);
    expect(Number.isFinite(pos.sunVector[2])).toBe(true);

    // At 00:00:00 UTC, subsolar longitude is at 180° or -180° (antimeridian)
    const subsolarLonDeg = pos.subsolarLon * RAD_TO_DEG;
    expect(Math.abs(Math.abs(subsolarLonDeg) - 180)).toBeLessThan(1e-4);

    // Declination in early January is negative (Southern Hemisphere summer)
    const declinationDeg = pos.declination * RAD_TO_DEG;
    expect(declinationDeg).toBeLessThan(-20.0);
    expect(declinationDeg).toBeGreaterThan(-23.45);

    // Sun vector unit length
    const len = Math.hypot(...pos.sunVector);
    expect(len).toBeCloseTo(1.0, 6);
  });

  it('Pillar B: Leap year boundaries (Feb 28 → Feb 29 → Mar 1 across 1972, 2000, 2020, 2024, 2028)', () => {
    const leapYears = [1972, 1980, 2000, 2004, 2020, 2024, 2028];

    for (const year of leapYears) {
      // Test Feb 28 23:59:59
      const feb28 = Date.UTC(year, 1, 28, 23, 59, 59);
      // Test Feb 29 00:00:00
      const feb29Start = Date.UTC(year, 1, 29, 0, 0, 0);
      // Test Feb 29 12:00:00 (solar noon at prime meridian)
      const feb29Noon = Date.UTC(year, 1, 29, 12, 0, 0);
      // Test Feb 29 23:59:59.999
      const feb29End = Date.UTC(year, 1, 29, 23, 59, 59, 999);
      // Test Mar 1 00:00:00
      const mar1Start = Date.UTC(year, 2, 1, 0, 0, 0);

      const timestamps = [feb28, feb29Start, feb29Noon, feb29End, mar1Start];

      for (const ts of timestamps) {
        const pos = getSolarPosition(ts);

        expect(Number.isFinite(pos.declination)).toBe(true);
        expect(Number.isFinite(pos.subsolarLon)).toBe(true);
        expect(Number.isFinite(pos.sunVector[0])).toBe(true);
        expect(Number.isFinite(pos.sunVector[1])).toBe(true);
        expect(Number.isFinite(pos.sunVector[2])).toBe(true);

        const len = Math.hypot(...pos.sunVector);
        expect(Math.abs(len - 1.0)).toBeLessThan(1e-6);

        expect(Math.abs(pos.declination)).toBeLessThanOrEqual(MAX_DECLINATION_RAD);
        expect(Math.abs(pos.subsolarLon)).toBeLessThanOrEqual(Math.PI + 1e-6);
      }

      // At Feb 29 solar noon (12:00:00 UTC), subsolar longitude must be 0°
      const noonPos = getSolarPosition(feb29Noon);
      expect(noonPos.subsolarLon).toBeCloseTo(0.0, 5);
      // Declination late February is climbing towards equator (approx -8° to -7°)
      const decDeg = noonPos.declination * RAD_TO_DEG;
      expect(decDeg).toBeGreaterThan(-10.0);
      expect(decDeg).toBeLessThan(-6.0);
    }
  });

  it('Pillar B: Year transitions (Dec 31 23:59:59.999 → Jan 1 00:00:00.000 across 1970-2030)', () => {
    for (let year = 1970; year <= 2029; year++) {
      const dec31End = Date.UTC(year, 11, 31, 23, 59, 59, 999);
      const jan1Start = Date.UTC(year + 1, 0, 1, 0, 0, 0, 0);

      const posDec31 = getSolarPosition(dec31End);
      const posJan1 = getSolarPosition(jan1Start);

      // Verify finite and bounded
      expect(Math.hypot(...posDec31.sunVector)).toBeCloseTo(1.0, 6);
      expect(Math.hypot(...posJan1.sunVector)).toBeCloseTo(1.0, 6);

      expect(Math.abs(posDec31.declination)).toBeLessThanOrEqual(MAX_DECLINATION_RAD);
      expect(Math.abs(posJan1.declination)).toBeLessThanOrEqual(MAX_DECLINATION_RAD);

      // Declination around Dec 31 / Jan 1 must be near winter solstice (~ -23°)
      const dec31Deg = posDec31.declination * RAD_TO_DEG;
      const jan1Deg = posJan1.declination * RAD_TO_DEG;

      expect(dec31Deg).toBeLessThan(-22.5);
      expect(dec31Deg).toBeGreaterThan(-23.45);
      expect(jan1Deg).toBeLessThan(-22.5);
      expect(jan1Deg).toBeGreaterThan(-23.45);

      // Continuity across year transition: discrete day step change is bounded by 0.15°
      expect(Math.abs(jan1Deg - dec31Deg)).toBeLessThan(0.15);
    }
  });

  it('Pillar B: Solstices and Equinoxes astronomical sanity checks', () => {
    // Summer Solstice ~June 21 noon UTC
    const summerSolstice = Date.UTC(2024, 5, 21, 12, 0, 0);
    const summerPos = getSolarPosition(summerSolstice);
    expect(summerPos.declination * RAD_TO_DEG).toBeGreaterThan(23.0);
    expect(summerPos.declination * RAD_TO_DEG).toBeLessThanOrEqual(23.45);
    expect(summerPos.subsolarLon).toBeCloseTo(0.0, 5); // Noon UTC -> 0° longitude

    // Winter Solstice ~Dec 21 noon UTC
    const winterSolstice = Date.UTC(2024, 11, 21, 12, 0, 0);
    const winterPos = getSolarPosition(winterSolstice);
    expect(winterPos.declination * RAD_TO_DEG).toBeLessThan(-23.0);
    expect(winterPos.declination * RAD_TO_DEG).toBeGreaterThanOrEqual(-23.45);
    expect(winterPos.subsolarLon).toBeCloseTo(0.0, 5);

    // Spring Equinox ~March 20 noon UTC
    const springEquinox = Date.UTC(2024, 2, 20, 12, 0, 0);
    const springPos = getSolarPosition(springEquinox);
    expect(Math.abs(springPos.declination * RAD_TO_DEG)).toBeLessThan(1.5);

    // Autumn Equinox ~Sept 22 noon UTC
    const autumnEquinox = Date.UTC(2024, 8, 22, 12, 0, 0);
    const autumnPos = getSolarPosition(autumnEquinox);
    expect(Math.abs(autumnPos.declination * RAD_TO_DEG)).toBeLessThan(1.5);
  });

  it('Pillar B: Adversarial non-finite and extreme inputs defensive fallback', () => {
    const edgeCases = [NaN, Infinity, -Infinity, -1e15, 1e16];

    for (const edge of edgeCases) {
      const pos = getSolarPosition(edge);
      expect(Number.isFinite(pos.declination)).toBe(true);
      expect(Number.isFinite(pos.subsolarLon)).toBe(true);
      expect(Number.isFinite(pos.sunVector[0])).toBe(true);
      expect(Number.isFinite(pos.sunVector[1])).toBe(true);
      expect(Number.isFinite(pos.sunVector[2])).toBe(true);
      const len = Math.hypot(...pos.sunVector);
      expect(Math.abs(len - 1.0)).toBeLessThan(1e-5);
    }
  });
});
