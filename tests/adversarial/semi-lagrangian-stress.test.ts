/**
 * tests/adversarial/semi-lagrangian-stress.test.ts
 *
 * Adversarial Stress & Singularity Fuzzing for Semi-Lagrangian Advection
 * Pillars A & B: Large-Scale Monte Carlo Stress Fuzzing & Critical Geometric Boundary Probing
 *
 * Requirements:
 * - Exact North Pole UV (0.5, 0.0), wind (30, 0) m/s, dt = 3600s -> Must NOT produce NaN
 * - Exact South Pole UV (0.5, 1.0), wind (0, 30) m/s, dt = 3600s -> Must NOT produce NaN
 * - Antimeridian crossing: UV (0.001, 0.5), wind (-50, 0) m/s, dt = 3600s -> UV.x must wrap via fract(), stay in [0,1]
 * - Zero wind: any UV, wind (0, 0), any dt -> departure UV MUST equal arrival UV exactly
 * - 50,000 random (UV, wind, dt) combinations -> zero NaN, all output UV in [0,1]
 * - dt = 0 -> identity map for all inputs
 * - Extreme wind (200 m/s) at equator for 1 hour -> UV wraps correctly
 */

import { describe, it, expect } from 'vitest';
import {
  mapSphericalGeodesicUV,
  EARTH_RADIUS_M,
  INV_EARTH_RADIUS_M,
  PI_F32,
  INV_PI_F32,
  INV_TWO_PI_F32,
} from '../../src/core/physics/SemiLagrangianAdvection';

describe('Adversarial Stress Suite: Semi-Lagrangian Advection on S²', () => {
  // Test 1: Exact North Pole
  it('ADV-SL-01: Exact North Pole UV (0.5, 0.0), wind (30, 0) m/s, dt = 3600s -> Must NOT produce NaN', () => {
    const northPoleUV: [number, number] = [0.5, 0.0];
    const wind: [number, number] = [30.0, 0.0];
    const dt = 3600.0;

    const [u, v] = mapSphericalGeodesicUV(northPoleUV, wind, dt);

    expect(Number.isNaN(u)).toBe(false);
    expect(Number.isNaN(v)).toBe(false);
    expect(Number.isFinite(u)).toBe(true);
    expect(Number.isFinite(v)).toBe(true);
    expect(u).toBeGreaterThanOrEqual(0.0);
    expect(u).toBeLessThanOrEqual(1.0);
    expect(v).toBeGreaterThanOrEqual(0.0);
    expect(v).toBeLessThanOrEqual(1.0);
  });

  // Test 2: Exact South Pole
  it('ADV-SL-02: Exact South Pole UV (0.5, 1.0), wind (0, 30) m/s, dt = 3600s -> Must NOT produce NaN', () => {
    const southPoleUV: [number, number] = [0.5, 1.0];
    const wind: [number, number] = [0.0, 30.0];
    const dt = 3600.0;

    const [u, v] = mapSphericalGeodesicUV(southPoleUV, wind, dt);

    expect(Number.isNaN(u)).toBe(false);
    expect(Number.isNaN(v)).toBe(false);
    expect(Number.isFinite(u)).toBe(true);
    expect(Number.isFinite(v)).toBe(true);
    expect(u).toBeGreaterThanOrEqual(0.0);
    expect(u).toBeLessThanOrEqual(1.0);
    expect(v).toBeGreaterThanOrEqual(0.0);
    expect(v).toBeLessThanOrEqual(1.0);
  });

  // Test 3: Antimeridian crossing
  it('ADV-SL-03: Antimeridian crossing: UV (0.001, 0.5), wind (-50, 0) m/s, dt = 3600s -> UV.x must wrap via fract(), stay in [0,1]', () => {
    const nearAntimeridianUV: [number, number] = [0.001, 0.5];
    const westwardWind: [number, number] = [-50.0, 0.0];
    const dt = 3600.0;

    const [u, v] = mapSphericalGeodesicUV(nearAntimeridianUV, westwardWind, dt);

    expect(Number.isNaN(u)).toBe(false);
    expect(Number.isNaN(v)).toBe(false);
    expect(Number.isFinite(u)).toBe(true);
    expect(Number.isFinite(v)).toBe(true);
    // Negative displacement from 0.001 must wrap around the 1.0 antimeridian seam
    expect(u).toBeGreaterThanOrEqual(0.0);
    expect(u).toBeLessThanOrEqual(1.0);
    expect(u).toBeGreaterThan(0.9); // Should wrap into western hemisphere (approx 0.9965)
    expect(v).toBeCloseTo(0.5, 4); // Stays on equator
  });

  // Test 4: Zero wind acts as identity operator
  it('ADV-SL-04: Zero wind: any UV, wind (0, 0), any dt -> departure UV MUST equal arrival UV exactly', () => {
    const testPoints: [number, number][] = [
      [0.5, 0.5],
      [0.1, 0.2],
      [0.85, 0.75],
      [0.001, 0.5],
      [0.999, 0.5],
      [0.25, 0.1],
      [0.75, 0.9],
      [0.42, 0.58],
    ];
    const dts = [0, 1.0, 60.0, 1800.0, 3600.0, 86400.0];

    for (const pt of testPoints) {
      for (const dt of dts) {
        const [u, v] = mapSphericalGeodesicUV(pt, [0.0, 0.0], dt);
        expect(u).toBeCloseTo(pt[0], 5);
        expect(v).toBeCloseTo(pt[1], 5);
      }
    }
  });

  // Test 5: 50,000 random (UV, wind, dt) combinations
  it('ADV-SL-05: 50,000 random (UV, wind, dt) combinations -> zero NaN, all output UV in [0,1]', () => {
    let nanCount = 0;
    let outOfBoundsCount = 0;
    const N = 50_000;

    for (let i = 0; i < N; i++) {
      const u = Math.random();
      const v = Math.random();
      const wx = (Math.random() * 2.0 - 1.0) * 150.0; // [-150, 150] m/s
      const wy = (Math.random() * 2.0 - 1.0) * 150.0; // [-150, 150] m/s
      const dt = Math.random() * 86400.0; // [0, 24h]

      const [resU, resV] = mapSphericalGeodesicUV([u, v], [wx, wy], dt);

      if (Number.isNaN(resU) || Number.isNaN(resV) || !Number.isFinite(resU) || !Number.isFinite(resV)) {
        nanCount++;
      }
      if (resU < 0.0 || resU > 1.0 || resV < 0.0 || resV > 1.0) {
        outOfBoundsCount++;
      }
    }

    expect(nanCount).toBe(0);
    expect(outOfBoundsCount).toBe(0);
  });

  // Test 6: dt = 0 -> identity map for all inputs
  it('ADV-SL-06: dt = 0 -> identity map for all inputs', () => {
    const testPoints: [number, number][] = [
      [0.5, 0.5],
      [0.05, 0.95],
      [0.95, 0.05],
      [0.314, 0.628],
      [0.1, 0.1],
      [0.9, 0.9],
    ];
    const winds: [number, number][] = [
      [100.0, 50.0],
      [-80.0, -120.0],
      [0.0, 200.0],
      [-150.0, 0.0],
    ];

    for (const pt of testPoints) {
      for (const wind of winds) {
        const [u, v] = mapSphericalGeodesicUV(pt, wind, 0.0);
        expect(u).toBeCloseTo(pt[0], 6);
        expect(v).toBeCloseTo(pt[1], 6);
      }
    }
  });

  // Test 7: Extreme wind (200 m/s) at equator for 1 hour -> UV wraps correctly
  it('ADV-SL-07: Extreme wind (200 m/s) at equator for 1 hour -> UV wraps correctly', () => {
    const arrivalUV: [number, number] = [0.5, 0.5];
    const extremeEastWind: [number, number] = [200.0, 0.0];
    const dt = 3600.0;

    const [uEast, vEast] = mapSphericalGeodesicUV(arrivalUV, extremeEastWind, dt);

    // Theoretical deltaU = 200 * 3600 / (2 * PI * 6371000) = 720000 / 40030173.59 = 0.01798648...
    expect(uEast).toBeCloseTo(0.5 + 0.017986, 4);
    expect(vEast).toBeCloseTo(0.5, 5);
    expect(uEast).toBeGreaterThanOrEqual(0.0);
    expect(uEast).toBeLessThanOrEqual(1.0);

    // Now test extreme westward wind wrapping across 0.0 -> 1.0 seam
    const nearAntimeridianUV: [number, number] = [0.005, 0.5];
    const extremeWestWind: [number, number] = [-200.0, 0.0];

    const [uWest, vWest] = mapSphericalGeodesicUV(nearAntimeridianUV, extremeWestWind, dt);

    // 0.005 - 0.017986 = -0.012986 -> wraps to 1.0 - 0.012986 = 0.987014
    expect(uWest).toBeCloseTo(0.987014, 4);
    expect(vWest).toBeCloseTo(0.5, 5);
    expect(uWest).toBeGreaterThanOrEqual(0.0);
    expect(uWest).toBeLessThanOrEqual(1.0);
  });
});
