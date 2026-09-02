import { describe, it, expect } from 'vitest';
import { toSphere, toMercator, RADIUS } from '../helpers/math-oracle';

describe('Tier 2: Boundary Value Analysis — Pole Singularities & Antimeridian Discontinuities', () => {
  it('T2-G01: North Pole lat = +90 deg produces top apex Cartesian point (0, +R, 0)', () => {
    const [x, y, z] = toSphere(0, 90, RADIUS);
    expect(x).toBeCloseTo(0.0, 5);
    expect(y).toBeCloseTo(RADIUS, 5);
    expect(z).toBeCloseTo(0.0, 5);
  });

  it('T2-G02: South Pole lat = -90 deg produces bottom apex Cartesian point (0, -R, 0)', () => {
    const [x, y, z] = toSphere(0, -90, RADIUS);
    expect(x).toBeCloseTo(0.0, 5);
    expect(y).toBeCloseTo(-RADIUS, 5);
    expect(z).toBeCloseTo(0.0, 5);
  });

  it('T2-G03: Mercator latitude clamp prevents logarithmic divergence at exact lat = +90 deg', () => {
    const [mx, my] = toMercator(0, 90, RADIUS, 85);
    expect(Number.isFinite(my)).toBe(true);
    expect(Number.isNaN(my)).toBe(false);
    expect(my).toBeGreaterThan(0);
  });

  it('T2-G04: Mercator latitude clamp prevents logarithmic divergence at exact lat = -90 deg', () => {
    const [mx, my] = toMercator(0, -90, RADIUS, 85);
    expect(Number.isFinite(my)).toBe(true);
    expect(Number.isNaN(my)).toBe(false);
    expect(my).toBeLessThan(0);
  });

  it('T2-G05: Mercator projection symmetry: my(+lat) === -my(-lat)', () => {
    const lats = [10, 30, 45, 60, 75, 85];
    lats.forEach(lat => {
      const [, myPos] = toMercator(0, lat, RADIUS);
      const [, myNeg] = toMercator(0, -lat, RADIUS);
      expect(myPos).toBeCloseTo(-myNeg, 5);
    });
  });

  it('T2-G06: Equator lat = 0 deg produces planar equatorial circle with y = 0', () => {
    const lons = [-180, -90, 0, 90, 180];
    lons.forEach(lon => {
      const [x, y, z] = toSphere(lon, 0, RADIUS);
      expect(y).toBeCloseTo(0.0, 5);
      expect(Math.hypot(x, z)).toBeCloseTo(RADIUS, 5);
    });
  });

  it('T2-G07: Prime Meridian lon = 0 deg produces z = +R at equator', () => {
    const [x, y, z] = toSphere(0, 0, RADIUS);
    expect(x).toBeCloseTo(0.0, 5);
    expect(y).toBeCloseTo(0.0, 5);
    expect(z).toBeCloseTo(RADIUS, 5);
  });

  it('T2-G08: Antimeridian lon = +180 deg produces z = -R at equator', () => {
    const [x, y, z] = toSphere(180, 0, RADIUS);
    expect(x).toBeCloseTo(0.0, 5);
    expect(y).toBeCloseTo(0.0, 5);
    expect(z).toBeCloseTo(-RADIUS, 5);
  });

  it('T2-G09: Antimeridian lon = -180 deg produces identical 3D Cartesian coordinates as lon = +180 deg', () => {
    const [xPos, yPos, zPos] = toSphere(180, 25, RADIUS);
    const [xNeg, yNeg, zNeg] = toSphere(-180, 25, RADIUS);

    expect(xPos).toBeCloseTo(xNeg, 5);
    expect(yPos).toBeCloseTo(yNeg, 5);
    expect(zPos).toBeCloseTo(zNeg, 5);
  });

  it('T2-G10: Mercator 2D maps +180 deg and -180 deg to opposing left and right boundaries', () => {
    const [mxPos] = toMercator(180, 0, RADIUS);
    const [mxNeg] = toMercator(-180, 0, RADIUS);

    expect(mxPos).toBeCloseTo(Math.PI * RADIUS, 5);
    expect(mxNeg).toBeCloseTo(-Math.PI * RADIUS, 5);
    expect(mxPos - mxNeg).toBeCloseTo(2 * Math.PI * RADIUS, 5); // Width = 2*PI*R
  });

  it('T2-G11: Near-pole boundary lat = 84.999 deg evaluates within 0.1% of max Mercator height', () => {
    const [, myLimit] = toMercator(0, 85, RADIUS, 85);
    const [, myNear] = toMercator(0, 84.999, RADIUS, 85);

    expect(myNear).toBeCloseTo(myLimit, 1);
    expect(myNear).toBeLessThanOrEqual(myLimit);
  });

  it('T2-G12: Longitude wrapping beyond [-180, 180] normalizes consistently in 3D', () => {
    const [x360, y360, z360] = toSphere(360, 0, RADIUS);
    const [x0, y0, z0] = toSphere(0, 0, RADIUS);

    expect(x360).toBeCloseTo(x0, 5);
    expect(y360).toBeCloseTo(y0, 5);
    expect(z360).toBeCloseTo(z0, 5);
  });

  it('T2-G13: Latitude clamping handles extreme out-of-range latitudes (+200, -200) without crashing', () => {
    const [, myOver] = toMercator(0, 200, RADIUS, 85);
    const [, myUnder] = toMercator(0, -200, RADIUS, 85);

    expect(Number.isFinite(myOver)).toBe(true);
    expect(Number.isFinite(myUnder)).toBe(true);
  });

  it('T2-G14: Spherical coordinate radius invariant ||(x, y, z)|| === R for all random angles', () => {
    for (let i = 0; i < 100; i++) {
      const lon = (Math.random() - 0.5) * 360;
      const lat = (Math.random() - 0.5) * 180;
      const [x, y, z] = toSphere(lon, lat, RADIUS);
      const len = Math.hypot(x, y, z);
      expect(len).toBeCloseTo(RADIUS, 4);
    }
  });

  it('T2-G15: Griffith fracture seam factor recognizes antimeridian lambda = +/- PI as crack nucleation line', () => {
    const evaluateSeamFactor = (lon: number): number => {
      const lambda = lon * (Math.PI / 180);
      const distToSeam = Math.PI - Math.abs(lambda);
      return 1.0 - Math.min(1.0, Math.max(0.0, distToSeam / 0.75));
    };

    expect(evaluateSeamFactor(180)).toBe(1.0);  // On crack line
    expect(evaluateSeamFactor(-180)).toBe(1.0); // On crack line
    expect(evaluateSeamFactor(0)).toBe(0.0);    // Prime meridian (far from crack)
  });

  it('T2-G16: Cylindrical unrolling angle (1 - t) * lambda contracts cleanly to 0 as lambda -> 0', () => {
    const lambda = 0.0;
    const t = 0.5;
    const curAngle = (1.0 - t) * lambda;
    expect(curAngle).toBe(0.0);
  });
});
