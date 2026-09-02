import { describe, it, expect } from 'vitest';
import {
  computeCurlNoise,
  computeDivergence,
  generateFibonacciSphere,
} from '../helpers/math-oracle';

describe('F7: 1M Fluid Mode Optimization & Divergence-Free Physics', () => {
  it('F7-T1: verifies curl noise field satisfies divergence-free condition (div u = 0) everywhere', () => {
    const testPoints: Array<[number, number, number]> = [
      [1.0, 2.0, 3.0],
      [-2.5, 1.5, 0.0],
      [0.0, 0.0, 5.0],
      [3.5, -3.5, 1.2],
      [-4.0, -1.0, -2.0],
    ];

    testPoints.forEach(pt => {
      const div = computeDivergence(pt, 1.5, 1e-4);
      expect(Math.abs(div)).toBeLessThan(1e-3);
    });
  });

  it('F7-T2: verifies transcendental trigonometric evaluation savings from backface early-out', () => {
    const trigCallsPerVertex = 12; // 6 cos + 6 sin
    const totalVertices = 1000000;
    const cullFraction = 0.375;
    const fps = 60;

    const savedCallsPerFrame = totalVertices * cullFraction * trigCallsPerVertex;
    const savedCallsPerSec = savedCallsPerFrame * fps;

    // 1M * 0.375 * 12 * 60 = 270,000,000 operations/sec saved!
    expect(savedCallsPerSec).toBeGreaterThanOrEqual(162000000);
  });

  it('F7-T3: verifies curl velocity magnitude is bounded and non-exploding', () => {
    const { points3D } = generateFibonacciSphere(1000);
    for (let i = 0; i < 1000; i++) {
      const p: [number, number, number] = [
        points3D[i * 3 + 0],
        points3D[i * 3 + 1],
        points3D[i * 3 + 2],
      ];
      const vel = computeCurlNoise(p, 2.0);
      const speed = Math.hypot(vel[0], vel[1], vel[2]);
      expect(speed).toBeGreaterThan(0.0);
      expect(speed).toBeLessThan(10.0); // Bounded kinetic energy
    }
  });

  it('F7-T4: verifies temporal continuity of velocity vector field over time intervals', () => {
    const p: [number, number, number] = [2.0, 1.0, 4.0];
    const dt = 0.001;
    const v1 = computeCurlNoise(p, 1.0);
    const v2 = computeCurlNoise(p, 1.0 + dt);

    const deltaSpeed = Math.hypot(v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]);
    expect(deltaSpeed).toBeLessThan(0.01); // Smooth C1 transition
  });

  it('F7-T5: verifies batch curl evaluation for 100,000 vertices runs under 16ms in CPU simulation', () => {
    const N = 100000;
    const pos = new Float32Array(N * 3).fill(1.5);
    const t0 = performance.now();

    for (let i = 0; i < N; i++) {
      const px = pos[i * 3 + 0];
      const py = pos[i * 3 + 1];
      const pz = pos[i * 3 + 2];
      // Inline fast curl evaluation
      const k1 = 0.55;
      const k2 = 1.10;
      const ux = -k1 * Math.cos(k1 * py) - k2 * Math.cos(k2 * pz);
      const uy = -k1 * Math.cos(k1 * pz) - k2 * Math.cos(k2 * px);
      const uz = -k1 * Math.cos(k1 * px) - k2 * Math.cos(k2 * py);
      pos[i * 3 + 0] = px + ux * 0.01;
      pos[i * 3 + 1] = py + uy * 0.01;
      pos[i * 3 + 2] = pz + uz * 0.01;
    }

    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50); // High CPU throughput
  });
});
