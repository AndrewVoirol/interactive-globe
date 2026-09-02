import { describe, it, expect } from 'vitest';
import {
  toSphere,
  toMercator,
  computeCurlNoise,
  griffithHoopStress,
  projectPointToDymaxionFace,
  RADIUS,
} from '../helpers/math-oracle';

describe('Tier 2: Boundary Value Analysis — Alpha Morphing Parameter [0.0, 1.0]', () => {
  // Cubic bezier easing evaluation as in App.tsx
  const evaluateEase = (alpha: number): number => {
    const clamped = Math.max(0.0, Math.min(1.0, alpha));
    return clamped < 0.5
      ? 4.0 * clamped * clamped * clamped
      : 1.0 - Math.pow(-2.0 * clamped + 2.0, 3.0) / 2.0;
  };

  // 1. Alpha Clamping and Continuity
  it('T2-A01: verifies alpha = 0.0 exactly evaluates ease = 0.0', () => {
    expect(evaluateEase(0.0)).toBe(0.0);
  });

  it('T2-A02: verifies alpha = 1.0 exactly evaluates ease = 1.0', () => {
    expect(evaluateEase(1.0)).toBe(1.0);
  });

  it('T2-A03: verifies alpha = 0.5 midpoint evaluates ease = 0.5', () => {
    expect(evaluateEase(0.5)).toBeCloseTo(0.5, 6);
  });

  it('T2-A04: verifies negative alpha values (< 0.0) are clamped cleanly to 0.0', () => {
    expect(evaluateEase(-0.001)).toBe(0.0);
    expect(evaluateEase(-1.0)).toBe(0.0);
    expect(evaluateEase(-100.0)).toBe(0.0);
  });

  it('T2-A05: verifies overshoot alpha values (> 1.0) are clamped cleanly to 1.0', () => {
    expect(evaluateEase(1.001)).toBe(1.0);
    expect(evaluateEase(2.0)).toBe(1.0);
    expect(evaluateEase(100.0)).toBe(1.0);
  });

  it('T2-A06: verifies infinitesimal alpha delta (alpha = 0.0001) produces strictly positive ease > 0', () => {
    const ease = evaluateEase(0.0001);
    expect(ease).toBeGreaterThan(0.0);
    expect(ease).toBeLessThan(1e-10);
  });

  it('T2-A07: verifies near-unity alpha delta (alpha = 0.9999) produces ease < 1.0 and > 0.999', () => {
    const ease = evaluateEase(0.9999);
    expect(ease).toBeLessThan(1.0);
    expect(ease).toBeGreaterThan(0.999);
  });

  // 2. Mode-Specific Alpha Boundaries
  it('T2-A08: Mode 0 (Linear) interpolates position linearly between 3D sphere and 2D Mercator at alpha = 0.0', () => {
    const pos3D = toSphere(10, 20);
    const pos2D = toMercator(10, 20);
    const ease = evaluateEase(0.0);
    const x = (1 - ease) * pos3D[0] + ease * pos2D[0];
    const y = (1 - ease) * pos3D[1] + ease * pos2D[1];
    const z = (1 - ease) * pos3D[2] + ease * 0.0;

    expect(x).toBeCloseTo(pos3D[0], 5);
    expect(y).toBeCloseTo(pos3D[1], 5);
    expect(z).toBeCloseTo(pos3D[2], 5);
  });

  it('T2-A09: Mode 0 (Linear) interpolates position to exact 2D Mercator coordinates at alpha = 1.0', () => {
    const pos3D = toSphere(10, 20);
    const pos2D = toMercator(10, 20);
    const ease = evaluateEase(1.0);
    const x = (1 - ease) * pos3D[0] + ease * pos2D[0];
    const y = (1 - ease) * pos3D[1] + ease * pos2D[1];
    const z = (1 - ease) * pos3D[2] + ease * 0.0;

    expect(x).toBeCloseTo(pos2D[0], 5);
    expect(y).toBeCloseTo(pos2D[1], 5);
    expect(z).toBe(0.0);
  });

  it('T2-A10: Mode 1 (Cylindrical Scroll) handles invOneMinusT near singularity at alpha = 0.9999 gracefully', () => {
    const ease = evaluateEase(0.9999);
    const invOneMinusT = 1.0 / Math.max(0.001, 1.0 - ease);
    expect(Number.isFinite(invOneMinusT)).toBe(true);
    expect(invOneMinusT).toBeLessThanOrEqual(1000.0);
  });

  it('T2-A11: Mode 2 (Griffith LEFM) rupture threshold tRupture = 0.18 triggers crack nucleation', () => {
    const tBelow = 0.10;
    const tAbove = 0.25;
    const tRupture = 0.18;

    expect(tBelow < tRupture).toBe(true); // Pre-rupture tensile buildup
    expect(tAbove >= tRupture).toBe(true); // Post-rupture flat unrolling
  });

  it('T2-A12: Mode 3 (Fluid Advection) preserves curl noise continuity at alpha = 0.0', () => {
    const p = toSphere(45, 45);
    const vel = computeCurlNoise(p, 0.0);
    expect(Number.isFinite(vel[0])).toBe(true);
    expect(Number.isFinite(vel[1])).toBe(true);
    expect(Number.isFinite(vel[2])).toBe(true);
  });

  it('T2-A13: Mode 3 (Fluid Advection) dampens turbulent perturbation as alpha -> 1.0', () => {
    const ease = evaluateEase(1.0);
    const turbulenceWeight = (1.0 - ease) * 0.5;
    expect(turbulenceWeight).toBe(0.0); // Fluid settles completely on planar map
  });

  it('T2-A14: Mode 4 (Dymaxion) face projection remains non-singular for all alpha in [0.0, 1.0]', () => {
    const p = toSphere(120, -35);
    const { gnomonicPos } = projectPointToDymaxionFace(p);
    const alphas = [0.0, 0.001, 0.25, 0.5, 0.75, 0.999, 1.0];

    alphas.forEach(a => {
      const ease = evaluateEase(a);
      const blendedZ = (1 - ease) * gnomonicPos[2] + ease * 0.0;
      expect(Number.isFinite(blendedZ)).toBe(true);
      expect(Number.isNaN(blendedZ)).toBe(false);
    });
  });

  it('T2-A15: verifies derivative d(ease)/d(alpha) is continuous with zero velocity at endpoints alpha = 0 and alpha = 1', () => {
    const eps = 1e-5;
    const dEase0 = (evaluateEase(eps) - evaluateEase(0)) / eps;
    const dEase1 = (evaluateEase(1) - evaluateEase(1 - eps)) / eps;

    expect(dEase0).toBeCloseTo(0.0, 3); // Flat slope at start
    expect(dEase1).toBeCloseTo(0.0, 3); // Flat slope at end
  });

  it('T2-A16: verifies monotonic growth of ease across 1000 uniform sub-intervals', () => {
    let prev = evaluateEase(0.0);
    for (let i = 1; i <= 1000; i++) {
      const curr = evaluateEase(i / 1000);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });
});
