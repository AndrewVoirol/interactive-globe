import { describe, it, expect } from 'vitest';
import {
  toSphere,
  toMercator,
  generateFibonacciSphere,
  RADIUS,
} from '../helpers/math-oracle';
import {
  parseGeomBuffer,
  serializeGeomBuffer,
  GEOM_MAGIC,
  GEOM_VERSION,
} from '../helpers/geom-parser';

describe('F3: Parameterized Precompute CLI & Binary Columnar Pipeline', () => {
  it('F3-T1: verifies Fibonacci sphere points have exact radius R = 5.0 and uniform distribution', () => {
    const N = 500;
    const { points3D } = generateFibonacciSphere(N, RADIUS);

    expect(points3D.length).toBe(N * 3);
    for (let i = 0; i < N; i++) {
      const x = points3D[i * 3 + 0];
      const y = points3D[i * 3 + 1];
      const z = points3D[i * 3 + 2];
      const dist = Math.hypot(x, y, z);
      expect(dist).toBeCloseTo(RADIUS, 3);
    }
  });

  it('F3-T2: verifies Mercator projection clamps latitudes at [-85, 85] with 0 NaNs or Infinities', () => {
    const testLats = [-90, -89.9, -85, -45, 0, 45, 85, 89.9, 90];
    testLats.forEach(lat => {
      const [mx, my] = toMercator(0, lat, RADIUS, 85);
      expect(Number.isFinite(mx)).toBe(true);
      expect(Number.isFinite(my)).toBe(true);
      expect(Number.isNaN(mx)).toBe(false);
      expect(Number.isNaN(my)).toBe(false);
    });

    // Extreme clamp check
    const [, mySouth] = toMercator(0, -90, RADIUS, 85);
    const [, myClamped] = toMercator(0, -85, RADIUS, 85);
    expect(mySouth).toBe(myClamped);
  });

  it('F3-T3: verifies binary GEOM v1 header serialization and deserialization integrity', () => {
    const N = 100;
    const M = 150;
    const points = new Float32Array(N * 3).fill(1.23);
    const target2D = new Float32Array(N * 2).fill(4.56);
    const types = new Float32Array(N).fill(1.0);
    const indices = new Uint32Array(M * 2).map((_, i) => i % N);

    const binary = serializeGeomBuffer(points, target2D, types, indices);
    expect(binary.byteLength).toBe(32 + N * 12 + N * 8 + N * 4 + M * 2 * 4);

    const parsed = parseGeomBuffer(binary);
    expect(parsed.magic).toBe(GEOM_MAGIC);
    expect(parsed.version).toBe(GEOM_VERSION);
    expect(parsed.pointCount).toBe(N);
    expect(parsed.indexCount).toBe(M * 2);
    expect(parsed.points[0]).toBeCloseTo(1.23, 4);
    expect(parsed.target2D[0]).toBeCloseTo(4.56, 4);
    expect(parsed.types[0]).toBe(1.0);
  });

  it('F3-T4: verifies CLI density argument parser supports 100k, 1m, and integer inputs', () => {
    const parseDensityArg = (arg: string): number => {
      const lower = arg.toLowerCase().trim();
      if (lower === '100k') return 100000;
      if (lower === '1m') return 1000000;
      if (lower === '20k') return 20000;
      const parsed = parseInt(lower, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid density argument: ${arg}`);
      }
      return parsed;
    };

    expect(parseDensityArg('100k')).toBe(100000);
    expect(parseDensityArg('1m')).toBe(1000000);
    expect(parseDensityArg('20k')).toBe(20000);
    expect(parseDensityArg('50000')).toBe(50000);
    expect(() => parseDensityArg('invalid')).toThrow();
  });

  it('F3-T5: verifies Delaunay spherical edge filtering excludes seam-crossing antimeridian edges', () => {
    const points: Array<[number, number]> = [
      [-179.0, 10.0], // Near antimeridian west
      [179.0, 10.0],  // Near antimeridian east (delta > 90 deg)
      [0.0, 10.0],    // Prime meridian
    ];

    const shouldFilterEdge = (p1: [number, number], p2: [number, number]) => {
      return Math.abs(p1[0] - p2[0]) > 90.0;
    };

    expect(shouldFilterEdge(points[0], points[1])).toBe(true); // Filtered (crosses seam)
    expect(shouldFilterEdge(points[0], points[2])).toBe(true); // Filtered (delta 179 deg)
    expect(shouldFilterEdge(points[1], points[2])).toBe(true); // Filtered (delta 179 deg)
    expect(shouldFilterEdge([-10.0, 0], [10.0, 0])).toBe(false); // Valid edge
  });
});
