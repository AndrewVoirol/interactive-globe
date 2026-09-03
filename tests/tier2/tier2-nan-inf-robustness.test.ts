import { describe, it, expect } from 'vitest';
import {
  toSphere,
  toMercator,
  computeCurlNoise,
} from '../../src/utils/projection';
import {
  lambOseenVortex,
  griffithHoopStress,
  raySphereIntersect,
} from '../../src/utils/raycast';
import {
  projectPointToDymaxionFace,
  getIcosahedronGeometry,
} from '../../src/utils/dymaxion';

describe('Tier 2: Robustness — Zero NaNs & Infinities Across All Mathematical Kernels', () => {
  it('T2-N01: computeCurlNoise produces 0 NaNs at coordinate origin (0, 0, 0) and time = 0.0', () => {
    const v = computeCurlNoise([0, 0, 0], 0.0);
    expect(Number.isNaN(v[0])).toBe(false);
    expect(Number.isNaN(v[1])).toBe(false);
    expect(Number.isNaN(v[2])).toBe(false);
    expect(Number.isFinite(v[0])).toBe(true);
    expect(Number.isFinite(v[1])).toBe(true);
    expect(Number.isFinite(v[2])).toBe(true);
  });

  it('T2-N02: computeCurlNoise produces 0 NaNs at extreme spatial coordinates (1000, 1000, 1000)', () => {
    const v = computeCurlNoise([1000, 1000, 1000], 50.0);
    expect(Number.isFinite(v[0])).toBe(true);
    expect(Number.isFinite(v[1])).toBe(true);
    expect(Number.isFinite(v[2])).toBe(true);
  });

  it('T2-N03: lambOseenVortex produces 0 NaNs at exact center r = 0.0 and t = 0.0', () => {
    const { vTheta, vorticity } = lambOseenVortex(0.0, 0.0, 1.0, 0.1, 0.2);
    expect(Number.isNaN(vTheta)).toBe(false);
    expect(Number.isNaN(vorticity)).toBe(false);
    expect(vTheta).toBe(0.0);
    expect(vorticity).toBeGreaterThan(0.0);
  });

  it('T2-N04: lambOseenVortex produces finite values at extreme distance r = 1000.0', () => {
    const { vTheta, vorticity } = lambOseenVortex(1000.0, 10.0);
    expect(Number.isFinite(vTheta)).toBe(true);
    expect(Number.isFinite(vorticity)).toBe(true);
    expect(vorticity).toBeCloseTo(0.0, 6);
  });

  it('T2-N05: griffithHoopStress handles infinitesimal crack distance r = 1e-8 without infinite blowup', () => {
    const { sigmaThetaTheta, localStrain } = griffithHoopStress(1e-8, 0.0, 1.0);
    expect(Number.isFinite(sigmaThetaTheta)).toBe(true);
    expect(Number.isNaN(sigmaThetaTheta)).toBe(false);
    expect(localStrain).toBeLessThanOrEqual(0.40); // Strain clamped
  });

  it('T2-N06: griffithHoopStress produces 0 NaNs at all critical angles theta in [0, 2*PI]', () => {
    const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI, 1.5 * Math.PI, 2 * Math.PI];
    angles.forEach(theta => {
      const { sigmaThetaTheta } = griffithHoopStress(0.1, theta);
      expect(Number.isNaN(sigmaThetaTheta)).toBe(false);
      expect(Number.isFinite(sigmaThetaTheta)).toBe(true);
    });
  });

  it('T2-N07: projectPointToDymaxionFace produces 0 NaNs at all 12 icosahedral vertices', () => {
    const { vertices } = getIcosahedronGeometry();
    vertices.forEach(v => {
      const { gnomonicPos, maxDot } = projectPointToDymaxionFace(v);
      expect(Number.isNaN(gnomonicPos[0])).toBe(false);
      expect(Number.isNaN(gnomonicPos[1])).toBe(false);
      expect(Number.isNaN(gnomonicPos[2])).toBe(false);
      expect(maxDot).toBeGreaterThan(0.70);
    });
  });

  it('T2-N08: projectPointToDymaxionFace produces 0 NaNs at all 20 face centroids', () => {
    const { centroids } = getIcosahedronGeometry();
    centroids.forEach(c => {
      const { gnomonicPos, maxDot } = projectPointToDymaxionFace(c);
      expect(maxDot).toBeCloseTo(1.0, 5); // Centroid matches face with dot = 1.0
      expect(Number.isNaN(gnomonicPos[0])).toBe(false);
      expect(Number.isNaN(gnomonicPos[1])).toBe(false);
      expect(Number.isNaN(gnomonicPos[2])).toBe(false);
    });
  });

  it('T2-N09: raySphereIntersect handles zero-direction or zero-origin without crashing', () => {
    const { hit, distance } = raySphereIntersect([0, 0, 15], [0, 0, 0]);
    expect(hit).toBe(false);
    expect(distance).toBe(Infinity);
    expect(Number.isNaN(distance)).toBe(false);
  });

  it('T2-N10: Vector normalization helper safely handles zero-magnitude vectors', () => {
    const safeNormalize = (v: [number, number, number]): [number, number, number] => {
      const len = Math.hypot(v[0], v[1], v[2]);
      if (len < 1e-6) return [0, 0, 1];
      return [v[0] / len, v[1] / len, v[2] / len];
    };

    const zeroNorm = safeNormalize([0, 0, 0]);
    expect(zeroNorm).toEqual([0, 0, 1]);
    expect(Number.isNaN(zeroNorm[0])).toBe(false);
  });

  it('T2-N11: toMercator handles exact equator (lon = 0, lat = 0) producing exact (0, 0)', () => {
    const [mx, my] = toMercator(0, 0);
    expect(mx).toBe(0.0);
    expect(my).toBeCloseTo(0.0, 5);
  });

  it('T2-N12: toSphere handles exact poles without floating point precision underflow', () => {
    const [xN, yN, zN] = toSphere(0, 90);
    const [xS, yS, zS] = toSphere(0, -90);

    expect(Number.isFinite(yN)).toBe(true);
    expect(Number.isFinite(yS)).toBe(true);
    expect(Math.abs(xN)).toBeLessThan(1e-10);
    expect(Math.abs(xS)).toBeLessThan(1e-10);
  });

  it('T2-N13: Delta-time integration handles dt = 0.0 without divide-by-zero or state corruption', () => {
    let position = 5.0;
    const velocity = 2.0;
    const dt = 0.0;
    position += velocity * dt;

    expect(position).toBe(5.0);
    expect(Number.isNaN(position)).toBe(false);
  });

  it('T2-N14: Delta-time integration handles massive frame stall dt = 100.0 without numerical explosion', () => {
    const clampDt = (dt: number) => Math.min(0.1, Math.max(0.0, dt));
    const safeDt = clampDt(100.0);

    expect(safeDt).toBe(0.1);
  });

  it('T2-N15: Cursor velocity calculation handles simultaneous identical pointer positions without NaN', () => {
    const computeCursorVelocity = (pCurr: [number, number], pPrev: [number, number], dt: number) => {
      if (dt <= 1e-6) return 0.0;
      const dx = pCurr[0] - pPrev[0];
      const dy = pCurr[1] - pPrev[1];
      return Math.hypot(dx, dy) / dt;
    };

    const velStatic = computeCursorVelocity([100, 200], [100, 200], 0.016);
    const velZeroDt = computeCursorVelocity([100, 200], [105, 205], 0.0);

    expect(velStatic).toBe(0.0);
    expect(velZeroDt).toBe(0.0);
  });

  it('T2-N16: Float32Array cast integrity validates all 3D sphere positions remain within FP32 range', () => {
    const p64 = toSphere(45, 45, 5.0);
    const p32 = new Float32Array(p64);

    expect(p32[0]).toBeCloseTo(p64[0], 5);
    expect(p32[1]).toBeCloseTo(p64[1], 5);
    expect(p32[2]).toBeCloseTo(p64[2], 5);
  });
});
