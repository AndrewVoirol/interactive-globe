import { describe, it, expect } from 'vitest';
import {
  PHI,
  RADIUS,
  getIcosahedronGeometry,
  projectPointToDymaxionFace,
  computeBarycentricCoordinates,
  projectToDymaxion2D,
  generateDymaxionBuffer,
  computeDymaxionMorph,
  UNIT_VERTICES,
  UNIT_CENTROIDS,
  ICOSAHEDRON_FACES,
  DYMAXION_FACE_LAYOUT_2D,
  DYMAXION_FACE_VERTICES_2D,
} from '../../src/utils/dymaxion';
import { generateFibonacciSphere } from '../helpers/math-oracle';

describe('Milestone M4: Comprehensive Fuller Dymaxion Polyhedral Unfolding Suite', () => {
  describe('1. Canonical Icosahedron Topology & Geometry', () => {
    it('M4-T01: verifies Golden Ratio constant PHI satisfies x^2 - x - 1 = 0', () => {
      expect(PHI).toBeCloseTo((1 + Math.sqrt(5)) / 2, 8);
      expect(PHI * PHI - PHI - 1).toBeCloseTo(0.0, 8);
    });

    it('M4-T02: verifies 12 vertices lie on unit sphere and have correct Euclidean distance relations', () => {
      expect(UNIT_VERTICES.length).toBe(12);
      UNIT_VERTICES.forEach(v => {
        const len = Math.hypot(v[0], v[1], v[2]);
        expect(len).toBeCloseTo(1.0, 6);
      });

      // Regular icosahedron edge length a = 2 / sqrt(1 + PHI^2)
      const expectedEdge = 2 / Math.sqrt(1 + PHI * PHI);
      const edge0_11 = Math.hypot(
        UNIT_VERTICES[0][0] - UNIT_VERTICES[11][0],
        UNIT_VERTICES[0][1] - UNIT_VERTICES[11][1],
        UNIT_VERTICES[0][2] - UNIT_VERTICES[11][2]
      );
      expect(edge0_11).toBeCloseTo(expectedEdge, 5);
    });

    it('M4-T03: verifies all 20 faces have valid vertex indices in [0, 11] and distinct vertices', () => {
      expect(ICOSAHEDRON_FACES.length).toBe(20);
      ICOSAHEDRON_FACES.forEach(([v0, v1, v2]) => {
        expect(v0).toBeGreaterThanOrEqual(0);
        expect(v0).toBeLessThan(12);
        expect(v1).toBeGreaterThanOrEqual(0);
        expect(v1).toBeLessThan(12);
        expect(v2).toBeGreaterThanOrEqual(0);
        expect(v2).toBeLessThan(12);
        expect(v0 !== v1 && v1 !== v2 && v0 !== v2).toBe(true);
      });
    });

    it('M4-T04: verifies all 20 face centroids are outward unit normals with inradius ~ 0.79465', () => {
      expect(UNIT_CENTROIDS.length).toBe(20);
      UNIT_CENTROIDS.forEach(c => {
        const len = Math.hypot(c[0], c[1], c[2]);
        expect(len).toBeCloseTo(1.0, 6);
      });

      const geo = getIcosahedronGeometry(5.0);
      expect(geo.inradius).toBeCloseTo(5.0 * 0.79465447, 4);
      expect(geo.edgeLength).toBeCloseTo(5.0 * 1.05146222, 4);
    });
  });

  describe('2. Gnomonic Projection & Barycentric Interpolation', () => {
    it('M4-T05: verifies projectPointToDymaxionFace guarantees maxDot >= 0.75 and 0 NaNs for 10,000 Fibonacci nodes', () => {
      const N = 10000;
      const { points3D } = generateFibonacciSphere(N, 5.0);

      for (let i = 0; i < N; i++) {
        const p: [number, number, number] = [
          points3D[i * 3 + 0],
          points3D[i * 3 + 1],
          points3D[i * 3 + 2],
        ];
        const res = projectPointToDymaxionFace(p);

        expect(res.faceIndex).toBeGreaterThanOrEqual(0);
        expect(res.faceIndex).toBeLessThan(20);
        expect(res.maxDot).toBeGreaterThanOrEqual(0.75);
        expect(Number.isFinite(res.gnomonicPos[0])).toBe(true);
        expect(Number.isFinite(res.gnomonicPos[1])).toBe(true);
        expect(Number.isFinite(res.gnomonicPos[2])).toBe(true);
        expect(Number.isNaN(res.gnomonicPos[0])).toBe(false);
        expect(Number.isNaN(res.gnomonicPos[1])).toBe(false);
        expect(Number.isNaN(res.gnomonicPos[2])).toBe(false);
      }
    });

    it('M4-T06: verifies computeBarycentricCoordinates sums to 1.0 with non-negative weights for face interior points', () => {
      const face0 = ICOSAHEDRON_FACES[0];
      const v0 = UNIT_VERTICES[face0[0]];
      const v1 = UNIT_VERTICES[face0[1]];
      const v2 = UNIT_VERTICES[face0[2]];

      // Centroid point
      const c = UNIT_CENTROIDS[0];
      const bCentroid = computeBarycentricCoordinates(c, v0, v1, v2);
      expect(bCentroid[0] + bCentroid[1] + bCentroid[2]).toBeCloseTo(1.0, 5);
      expect(bCentroid[0]).toBeCloseTo(1 / 3, 4);
      expect(bCentroid[1]).toBeCloseTo(1 / 3, 4);
      expect(bCentroid[2]).toBeCloseTo(1 / 3, 4);

      // Vertex point v0
      const bV0 = computeBarycentricCoordinates(v0, v0, v1, v2);
      expect(bV0[0]).toBeCloseTo(1.0, 4);
      expect(bV0[1]).toBeCloseTo(0.0, 4);
      expect(bV0[2]).toBeCloseTo(0.0, 4);
    });
  });

  describe('3. Planar Net Projection & Buffer Generation', () => {
    it('M4-T07: verifies projectToDymaxion2D generates bounded finite 2D coordinates across all spherical coordinates', () => {
      const testCoordinates: Array<[number, number, number]> = [
        [0, 5, 0],   // North pole
        [0, -5, 0],  // South pole
        [5, 0, 0],   // Equator 0 deg
        [-5, 0, 0],  // Equator 180 deg
        [0, 0, 5],   // Equator 90 deg
        [0, 0, -5],  // Equator -90 deg
      ];

      testCoordinates.forEach(pt => {
        const [u, v] = projectToDymaxion2D(pt);
        expect(Number.isFinite(u)).toBe(true);
        expect(Number.isFinite(v)).toBe(true);
        expect(Number.isNaN(u)).toBe(false);
        expect(Number.isNaN(v)).toBe(false);
      });
    });

    it('M4-T08: verifies generateDymaxionBuffer generates complete Float32Array matching node count', () => {
      const N = 500;
      const { points3D } = generateFibonacciSphere(N, 5.0);
      const dymaxionBuffer = generateDymaxionBuffer(points3D);

      expect(dymaxionBuffer.length).toBe(N * 2);
      for (let i = 0; i < N * 2; i++) {
        expect(Number.isFinite(dymaxionBuffer[i])).toBe(true);
        expect(Number.isNaN(dymaxionBuffer[i])).toBe(false);
      }
    });

    it('M4-T09: verifies 20 2D face layouts are defined with 3 vertices each', () => {
      expect(DYMAXION_FACE_LAYOUT_2D.length).toBe(20);
      expect(DYMAXION_FACE_VERTICES_2D.length).toBe(20);

      DYMAXION_FACE_VERTICES_2D.forEach(([u0, u1, u2]) => {
        expect(u0.length).toBe(2);
        expect(u1.length).toBe(2);
        expect(u2.length).toBe(2);

        // Verify each face is an equilateral triangle in 2D
        const d01 = Math.hypot(u0[0] - u1[0], u0[1] - u1[1]);
        const d12 = Math.hypot(u1[0] - u2[0], u1[1] - u2[1]);
        const d20 = Math.hypot(u2[0] - u0[0], u2[1] - u0[1]);

        expect(d01).toBeCloseTo(1.0, 5);
        expect(d12).toBeCloseTo(1.0, 5);
        expect(d20).toBeCloseTo(1.0, 5);
      });
    });
  });

  describe('4. Continuous Morphing & Arching Shell Modulation', () => {
    it('M4-T10: verifies computeDymaxionMorph at alpha = 0 matches 3D spherical position with zero arch', () => {
      const p3D: [number, number, number] = [0, 5, 0];
      const target2D = projectToDymaxion2D(p3D);
      const morph0 = computeDymaxionMorph(p3D, target2D, 0.0);

      expect(morph0.position[0]).toBeCloseTo(p3D[0], 5);
      expect(morph0.position[1]).toBeCloseTo(p3D[1], 5);
      expect(morph0.position[2]).toBeCloseTo(p3D[2], 5);
      expect(morph0.arch).toBeCloseTo(0.0, 5);
    });

    it('M4-T11: verifies computeDymaxionMorph at alpha = 1.0 lies completely in Z = 0 plane with normal = (0, 0, 1)', () => {
      const p3D: [number, number, number] = [3, 4, 0];
      const target2D = projectToDymaxion2D(p3D);
      const morph1 = computeDymaxionMorph(p3D, target2D, 1.0);

      expect(morph1.position[0]).toBeCloseTo(target2D[0], 5);
      expect(morph1.position[1]).toBeCloseTo(target2D[1], 5);
      expect(morph1.position[2]).toBeCloseTo(0.0, 5);
      expect(morph1.normal[0]).toBeCloseTo(0.0, 5);
      expect(morph1.normal[1]).toBeCloseTo(0.0, 5);
      expect(morph1.normal[2]).toBeCloseTo(1.0, 5);
      expect(morph1.arch).toBeCloseTo(0.0, 5);
    });

    it('M4-T12: verifies arching modulation peaks at alpha = 0.5 preventing volume collapse', () => {
      const p3D: [number, number, number] = [0, 5, 0];
      const target2D = projectToDymaxion2D(p3D);
      const morphMid = computeDymaxionMorph(p3D, target2D, 0.5);

      expect(morphMid.arch).toBeCloseTo(0.45, 3);
      expect(morphMid.position[1]).toBeGreaterThan(2.5); // Remains expanded outward
    });

    it('M4-T13: verifies smooth C0/C1 continuity across 100 morphing steps from 0.0 to 1.0', () => {
      const p3D: [number, number, number] = [2.5, 3.5, 2.5];
      const target2D = projectToDymaxion2D(p3D);

      let prevPos = computeDymaxionMorph(p3D, target2D, 0.0).position;
      for (let step = 1; step <= 100; step++) {
        const alpha = step / 100;
        const curr = computeDymaxionMorph(p3D, target2D, alpha);
        const dist = Math.hypot(
          curr.position[0] - prevPos[0],
          curr.position[1] - prevPos[1],
          curr.position[2] - prevPos[2]
        );
        expect(dist).toBeLessThan(0.3); // Continuous trajectory without jumps
        expect(Number.isFinite(curr.position[0])).toBe(true);
        expect(Number.isFinite(curr.position[1])).toBe(true);
        expect(Number.isFinite(curr.position[2])).toBe(true);
        prevPos = curr.position;
      }
    });
  });
});
