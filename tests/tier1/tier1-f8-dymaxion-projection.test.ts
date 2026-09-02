import { describe, it, expect } from 'vitest';
import {
  getIcosahedronGeometry,
  projectPointToDymaxionFace,
  generateFibonacciSphere,
  PHI,
} from '../helpers/math-oracle';

describe('F8: Fuller Dymaxion 20-Facet Projection & 0-NaN Guarantee', () => {
  it('F8-T1: verifies regular icosahedron has 12 vertices, 20 triangular faces, and golden ratio proportions', () => {
    const { vertices, faces } = getIcosahedronGeometry();
    expect(vertices.length).toBe(12);
    expect(faces.length).toBe(20);

    // Each vertex must lie on unit sphere
    vertices.forEach(v => {
      const len = Math.hypot(v[0], v[1], v[2]);
      expect(len).toBeCloseTo(1.0, 5);
    });

    // Golden ratio constant
    expect(PHI).toBeCloseTo(1.6180339887, 5);
  });

  it('F8-T2: verifies all 20 face centroids are normalized unit vectors', () => {
    const { centroids } = getIcosahedronGeometry();
    expect(centroids.length).toBe(20);
    centroids.forEach(c => {
      const len = Math.hypot(c[0], c[1], c[2]);
      expect(len).toBeCloseTo(1.0, 5);
    });
  });

  it('F8-T3: verifies projection of all Fibonacci sphere points produces 0 NaNs across all coordinates', () => {
    const { points3D } = generateFibonacciSphere(1000);
    for (let i = 0; i < 1000; i++) {
      const p: [number, number, number] = [
        points3D[i * 3 + 0],
        points3D[i * 3 + 1],
        points3D[i * 3 + 2],
      ];
      const { faceIndex, maxDot, gnomonicPos } = projectPointToDymaxionFace(p);

      expect(faceIndex).toBeGreaterThanOrEqual(0);
      expect(faceIndex).toBeLessThan(20);
      expect(maxDot).toBeGreaterThan(0.70); // min dot product is ~0.7946

      expect(Number.isNaN(gnomonicPos[0])).toBe(false);
      expect(Number.isNaN(gnomonicPos[1])).toBe(false);
      expect(Number.isNaN(gnomonicPos[2])).toBe(false);
      expect(Number.isFinite(gnomonicPos[0])).toBe(true);
      expect(Number.isFinite(gnomonicPos[1])).toBe(true);
      expect(Number.isFinite(gnomonicPos[2])).toBe(true);
    }
  });

  it('F8-T4: verifies gnomonic projection denominator is strictly positive and non-zero', () => {
    const testPoints: Array<[number, number, number]> = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ];

    testPoints.forEach(pt => {
      const { maxDot } = projectPointToDymaxionFace(pt);
      expect(maxDot).toBeGreaterThanOrEqual(0.75);
    });
  });

  it('F8-T5: verifies all 20 faces receive a balanced distribution of spherical points', () => {
    const N = 2000;
    const { points3D } = generateFibonacciSphere(N);
    const faceCounts = new Array(20).fill(0);

    for (let i = 0; i < N; i++) {
      const p: [number, number, number] = [
        points3D[i * 3 + 0],
        points3D[i * 3 + 1],
        points3D[i * 3 + 2],
      ];
      const { faceIndex } = projectPointToDymaxionFace(p);
      faceCounts[faceIndex]++;
    }

    const expectedPerFace = N / 20; // 100
    faceCounts.forEach(count => {
      // Uniform area distribution across 20 faces within 25% deviation
      expect(count).toBeGreaterThan(expectedPerFace * 0.75);
      expect(count).toBeLessThan(expectedPerFace * 1.25);
    });
  });
});
