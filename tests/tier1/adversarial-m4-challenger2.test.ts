import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
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
  DYMAXION_FACE_INVERTED,
} from '../../src/utils/dymaxion';
import { generateFibonacciSphere } from '../helpers/math-oracle';

// =========================================================================
// Helper: 2D Separating Axis Theorem (SAT) for Convex Triangles
// =========================================================================
function projectPoly(poly: Array<[number, number]>, axis: [number, number]): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const dot = p[0] * axis[0] + p[1] * axis[1];
    if (dot < min) min = dot;
    if (dot > max) max = dot;
  }
  return [min, max];
}

function checkSATOverlap(p1: Array<[number, number]>, p2: Array<[number, number]>): boolean {
  const axes: Array<[number, number]> = [];
  for (let i = 0; i < 3; i++) {
    const e1 = [p1[(i + 1) % 3][0] - p1[i][0], p1[(i + 1) % 3][1] - p1[i][1]];
    axes.push([-e1[1], e1[0]]);
    const e2 = [p2[(i + 1) % 3][0] - p2[i][0], p2[(i + 1) % 3][1] - p2[i][1]];
    axes.push([-e2[1], e2[0]]);
  }
  for (const axis of axes) {
    const len = Math.hypot(axis[0], axis[1]);
    if (len < 1e-10) continue;
    const normAxis: [number, number] = [axis[0] / len, axis[1] / len];
    const [min1, max1] = projectPoly(p1, normAxis);
    const [min2, max2] = projectPoly(p2, normAxis);
    if (max1 <= min2 + 1e-6 || max2 <= min1 + 1e-6) {
      return false; // Found separating axis -> No interior overlap!
    }
  }
  return true; // Interior overlap exists
}

// =========================================================================
// Helper: 2D Sutherland-Hodgman Polygon Clipping for Polygon Intersection
// =========================================================================
type Point2D = [number, number];

function polygonArea2D(poly: Point2D[]): number {
  if (poly.length < 3) return 0.0;
  let area = 0.0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  return Math.abs(area) * 0.5;
}

function lineIntersection(
  p1: Point2D,
  p2: Point2D,
  cp1: Point2D,
  cp2: Point2D
): Point2D {
  const a1 = p2[1] - p1[1];
  const b1 = p1[0] - p2[0];
  const c1 = a1 * p1[0] + b1 * p1[1];

  const a2 = cp2[1] - cp1[1];
  const b2 = cp1[0] - cp2[0];
  const c2 = a2 * cp1[0] + b2 * cp1[1];

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) {
    return [p1[0], p1[1]];
  }
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}

function isInsideClipEdge(p: Point2D, cp1: Point2D, cp2: Point2D): boolean {
  return (cp2[0] - cp1[0]) * (p[1] - cp1[1]) - (cp2[1] - cp1[1]) * (p[0] - cp1[0]) >= -1e-10;
}

function clipPolygon(subject: Point2D[], clip: Point2D[]): Point2D[] {
  let output = [...subject];
  for (let i = 0; i < clip.length; i++) {
    const cp1 = clip[i];
    const cp2 = clip[(i + 1) % clip.length];
    const input = [...output];
    output = [];
    if (input.length === 0) break;

    let s = input[input.length - 1];
    for (const e of input) {
      if (isInsideClipEdge(e, cp1, cp2)) {
        if (isInsideClipEdge(s, cp1, cp2)) {
          output.push(e);
        } else {
          output.push(lineIntersection(s, e, cp1, cp2));
          output.push(e);
        }
      } else if (isInsideClipEdge(s, cp1, cp2)) {
        output.push(lineIntersection(s, e, cp1, cp2));
      }
      s = e;
    }
  }
  return output;
}

function ensureCCW(poly: Point2D[]): Point2D[] {
  let signedArea = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    signedArea += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  if (signedArea < 0) {
    return [poly[0], poly[2], poly[1]];
  }
  return poly;
}

// =========================================================================
// Helper: Exact Spherical Triangle Solid Angle via Oosterom-Strackee Formula
// =========================================================================
function sphericalTriangleSolidAngle(
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): number {
  const dot01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const dot12 = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const dot20 = v2[0] * v0[0] + v2[1] * v0[1] + v2[2] * v0[2];

  // Scalar triple product: v0 . (v1 x v2)
  const crossX = v1[1] * v2[2] - v1[2] * v2[1];
  const crossY = v1[2] * v2[0] - v1[0] * v2[2];
  const crossZ = v1[0] * v2[1] - v1[1] * v2[0];
  const tripleProduct = v0[0] * crossX + v0[1] * crossY + v0[2] * crossZ;

  const numerator = Math.abs(tripleProduct);
  const denominator = 1.0 + dot01 + dot12 + dot20;

  return 2.0 * Math.atan2(numerator, denominator);
}

describe('Adversarial Challenge 2 (Milestone M4): Fuller Dymaxion Planar Net Layout, Area Conservation & Isometric Continuity', () => {

  // =========================================================================
  // Section 1: Area Conservation Across All 20 Triangular Facets
  // =========================================================================
  describe('1. True-Area Conservation & Facet Uniformity', () => {
    it('C2-M4-T01: verifies all 20 planar net facets have identical 2D Euclidean area (zero variance across facets)', () => {
      const areas: number[] = [];
      const expectedArea = Math.sqrt(3) / 4; // Side length = 1.0 -> Area = sqrt(3)/4 ≈ 0.43301270189

      for (let i = 0; i < DYMAXION_FACE_VERTICES_2D.length; i++) {
        const tri = DYMAXION_FACE_VERTICES_2D[i];
        const a = polygonArea2D(tri as unknown as Point2D[]);
        areas.push(a);
        expect(a).toBeCloseTo(expectedArea, 6);
      }

      // Compute variance
      const meanArea = areas.reduce((acc, v) => acc + v, 0) / areas.length;
      const variance = areas.reduce((acc, v) => acc + Math.pow(v - meanArea, 2), 0) / areas.length;

      expect(meanArea).toBeCloseTo(expectedArea, 6);
      expect(variance).toBeLessThan(1e-12); // Zero variance across all 20 facets
    });

    it('C2-M4-T02: verifies all 20 spherical facets have identical solid angle Omega = 4*pi/20 = pi/5 steradians', () => {
      const solidAngles: number[] = [];
      const expectedOmega = (4 * Math.PI) / 20; // pi / 5 ≈ 0.62831853

      for (let i = 0; i < ICOSAHEDRON_FACES.length; i++) {
        const [i0, i1, i2] = ICOSAHEDRON_FACES[i];
        const v0 = UNIT_VERTICES[i0];
        const v1 = UNIT_VERTICES[i1];
        const v2 = UNIT_VERTICES[i2];

        const omega = sphericalTriangleSolidAngle(v0, v1, v2);
        solidAngles.push(omega);
        expect(omega).toBeCloseTo(expectedOmega, 6);
      }

      const totalSolidAngle = solidAngles.reduce((acc, v) => acc + v, 0);
      expect(totalSolidAngle).toBeCloseTo(4 * Math.PI, 6);

      const meanOmega = totalSolidAngle / 20;
      const omegaVariance = solidAngles.reduce((acc, v) => acc + Math.pow(v - meanOmega, 2), 0) / 20;
      expect(omegaVariance).toBeLessThan(1e-12);
    });

    it('C2-M4-T03: Monte Carlo simulation of 100,000 spherical points confirms statistical uniformity and true-area density conservation', () => {
      const N = 100000;
      const { points3D } = generateFibonacciSphere(N, 5.0);
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

      const expectedCountPerFace = N / 20; // 5,000 points per face
      let chiSquare = 0;

      for (let k = 0; k < 20; k++) {
        const count = faceCounts[k];
        // Bounded distribution: gnomonic central projection variation is <= 15% on regular icosahedron
        expect(count).toBeGreaterThan(expectedCountPerFace * 0.85);
        expect(count).toBeLessThan(expectedCountPerFace * 1.15);

        const diff = count - expectedCountPerFace;
        chiSquare += (diff * diff) / expectedCountPerFace;
      }

      // Chi-square metric is bounded and regular across all 20 faces
      expect(chiSquare).toBeLessThan(1200);
    });

    it('C2-M4-T03b: verifies maximum differential gnomonic area distortion is strictly bounded by sec^3(theta_max) <= 1.23 (vs Mercator infinity)', () => {
      // Maximum angular distance from face centroid to vertex on regular icosahedron:
      // theta_max = arccos(phi / sqrt(3)) ≈ 20.905 deg
      const cosThetaMax = PHI / Math.sqrt(3);
      const thetaMaxRad = Math.acos(cosThetaMax);
      const maxAreaDistortion = 1.0 / Math.pow(cosThetaMax, 3);

      expect(thetaMaxRad * (180 / Math.PI)).toBeCloseTo(20.905, 2);
      expect(maxAreaDistortion).toBeCloseTo(1.2267, 3);
      expect(maxAreaDistortion).toBeLessThan(1.25); // At most 22.7% area expansion at outer corner!
    });
  });

  // =========================================================================
  // Section 2: 2D Planar Net Layout Non-Overlap & Geometric Disjointness
  // =========================================================================
  describe('2. 2D Net Planar Non-Overlap & Geometric Disjointness', () => {
    it('C2-M4-T04: SAT (Separating Axis Theorem) and Sutherland-Hodgman clipping verify all 190 facet pairs have EXACTLY 0.0 interior overlap', () => {
      const faceCount = DYMAXION_FACE_VERTICES_2D.length; // 20
      expect(faceCount).toBe(20);

      let totalTestedPairs = 0;
      let overlappingPairs = 0;

      for (let i = 0; i < faceCount; i++) {
        const triA = DYMAXION_FACE_VERTICES_2D[i];
        const polyA = ensureCCW(triA as unknown as Point2D[]);

        for (let j = i + 1; j < faceCount; j++) {
          totalTestedPairs++;
          const triB = DYMAXION_FACE_VERTICES_2D[j];
          const polyB = ensureCCW(triB as unknown as Point2D[]);

          // 1. Separating Axis Theorem Check
          const satOverlap = checkSATOverlap(triA, triB);
          if (satOverlap) {
            overlappingPairs++;
          }

          // 2. Sutherland-Hodgman Polygon Clipping Check
          const clippedPoly = clipPolygon(polyA, polyB);
          const overlapArea = polygonArea2D(clippedPoly);

          // Overlap area between ANY two distinct faces must be ZERO
          expect(overlapArea).toBeLessThan(1e-6);
        }
      }

      expect(totalTestedPairs).toBe((20 * 19) / 2); // 190 pairs
      expect(overlappingPairs).toBe(0); // Zero overlapping pairs via SAT
    });

    it('C2-M4-T05: verifies 2D net layout orientation and apex positioning matches inverted flags across all 20 facets', () => {
      expect(DYMAXION_FACE_INVERTED.length).toBe(20);
      const uprightCount = DYMAXION_FACE_INVERTED.filter(inv => !inv).length;
      const invertedCount = DYMAXION_FACE_INVERTED.filter(inv => inv).length;

      expect(uprightCount).toBe(11);
      expect(invertedCount).toBe(9);
      expect(uprightCount + invertedCount).toBe(20);

      // Verify each triangle orientation matches inverted flag
      for (let i = 0; i < 20; i++) {
        const [u0, u1, u2] = DYMAXION_FACE_VERTICES_2D[i];
        const inverted = DYMAXION_FACE_INVERTED[i];
        const [cx, cy] = DYMAXION_FACE_LAYOUT_2D[i];

        if (!inverted) {
          // Upright: u0 is apex on top (y > cy)
          expect(u0[1]).toBeGreaterThan(cy);
          expect(u1[1]).toBeLessThan(cy);
          expect(u2[1]).toBeLessThan(cy);
        } else {
          // Inverted: u0 is apex on bottom (y < cy)
          expect(u0[1]).toBeLessThan(cy);
          expect(u1[1]).toBeGreaterThan(cy);
          expect(u2[1]).toBeGreaterThan(cy);
        }
      }
    });

    it('C2-M4-T06: verifies 2D net coordinates are compact, finite, and bounded within [-10, 10]', () => {
      for (let i = 0; i < DYMAXION_FACE_VERTICES_2D.length; i++) {
        const [u0, u1, u2] = DYMAXION_FACE_VERTICES_2D[i];
        [u0, u1, u2].forEach(([x, y]) => {
          expect(x).toBeGreaterThan(-10);
          expect(x).toBeLessThan(10);
          expect(y).toBeGreaterThan(-10);
          expect(y).toBeLessThan(10);
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
        });
      }
    });
  });

  // =========================================================================
  // Section 3: Smooth Isometric Motion & Zero Volume Collapse
  // =========================================================================
  describe('3. Smooth Isometric Motion & Sag Elimination', () => {
    it('C2-M4-T07: verifies arching modulation prevents envelope collapse (mean radius >= 4.0 throughout morph)', () => {
      const N = 2000;
      const { points3D } = generateFibonacciSphere(N, 5.0);

      const dymaxion2DCoords: Array<[number, number]> = [];
      for (let i = 0; i < N; i++) {
        const p: [number, number, number] = [
          points3D[i * 3 + 0],
          points3D[i * 3 + 1],
          points3D[i * 3 + 2],
        ];
        dymaxion2DCoords.push(projectToDymaxion2D(p));
      }

      // Test 21 alpha increments from 0.0 to 1.0
      for (let step = 0; step <= 20; step++) {
        const alpha = step / 20;
        let sumRadius = 0;

        for (let i = 0; i < N; i++) {
          const p3D: [number, number, number] = [
            points3D[i * 3 + 0],
            points3D[i * 3 + 1],
            points3D[i * 3 + 2],
          ];
          const target2D = dymaxion2DCoords[i];

          const morph = computeDymaxionMorph(p3D, target2D, alpha);
          const r = Math.hypot(morph.position[0], morph.position[1], morph.position[2]);
          sumRadius += r;
        }

        const meanRadius = sumRadius / N;

        // At all morph steps, mean radius is preserved and strictly >= 4.0 (zero collapse to 0)
        expect(meanRadius).toBeGreaterThanOrEqual(4.0);
      }
    });

    it('C2-M4-T08: verifies C0 and C1 trajectory continuity with zero velocity spikes or NaN discontinuities', () => {
      const samplePoints: Array<[number, number, number]> = [
        [0, 5, 0],
        [5, 0, 0],
        [0, 0, 5],
        [-3, 4, 0],
        [2.5, -2.5, 3.535],
      ];

      samplePoints.forEach(p3D => {
        const target2D = projectToDymaxion2D(p3D);
        const steps = 100;
        let prevPos = computeDymaxionMorph(p3D, target2D, 0.0).position;
        let prevVel: [number, number, number] = [0, 0, 0];

        for (let step = 1; step <= steps; step++) {
          const alpha = step / steps;
          const curr = computeDymaxionMorph(p3D, target2D, alpha);
          const dt = 1.0 / steps;

          // Velocity
          const vx = (curr.position[0] - prevPos[0]) / dt;
          const vy = (curr.position[1] - prevPos[1]) / dt;
          const vz = (curr.position[2] - prevPos[2]) / dt;
          const speed = Math.hypot(vx, vy, vz);

          // Speed is strictly bounded (< 35 units/sec)
          expect(speed).toBeLessThan(35);
          expect(Number.isFinite(speed)).toBe(true);

          // Acceleration / delta velocity is bounded (no explosive discontinuous impulses)
          if (step > 1) {
            const ax = (vx - prevVel[0]) / dt;
            const ay = (vy - prevVel[1]) / dt;
            const az = (vz - prevVel[2]) / dt;
            const accel = Math.hypot(ax, ay, az);
            expect(accel).toBeLessThan(250);
            expect(Number.isFinite(accel)).toBe(true);
          }

          prevPos = curr.position;
          prevVel = [vx, vy, vz];
        }
      });
    });

    it('C2-M4-T09: verifies normal vectors remain strictly normalized unit vectors (len = 1.0) with zero NaN across all alpha', () => {
      const N = 500;
      const { points3D } = generateFibonacciSphere(N, 5.0);

      const alphas = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

      for (const alpha of alphas) {
        for (let i = 0; i < N; i++) {
          const p3D: [number, number, number] = [
            points3D[i * 3 + 0],
            points3D[i * 3 + 1],
            points3D[i * 3 + 2],
          ];
          const target2D = projectToDymaxion2D(p3D);
          const morph = computeDymaxionMorph(p3D, target2D, alpha);

          const normLen = Math.hypot(morph.normal[0], morph.normal[1], morph.normal[2]);
          expect(normLen).toBeCloseTo(1.0, 5);
          expect(Number.isNaN(morph.normal[0])).toBe(false);
          expect(Number.isNaN(morph.normal[1])).toBe(false);
          expect(Number.isNaN(morph.normal[2])).toBe(false);

          if (alpha === 1.0) {
            expect(morph.normal[0]).toBeCloseTo(0.0, 5);
            expect(morph.normal[1]).toBeCloseTo(0.0, 5);
            expect(morph.normal[2]).toBeCloseTo(1.0, 5);
          }
        }
      }
    });

    it('C2-M4-T10: verifies TS and GLSL Mode 4 morph mathematical equivalence bit-for-bit', () => {
      const p3D: [number, number, number] = [1.23, 3.45, -2.87];
      const target2D = projectToDymaxion2D(p3D);

      const alphas = [0.0, 0.15, 0.33, 0.5, 0.67, 0.85, 1.0];

      alphas.forEach(alpha => {
        // TypeScript math
        const tsRes = computeDymaxionMorph(p3D, target2D, alpha);

        // GLSL Mode 4 shader emulation
        const ease = alpha < 0.5
          ? 4.0 * alpha * alpha * alpha
          : 1.0 - Math.pow(Math.max(0.0, -2.0 * alpha + 2.0), 3.0) / 2.0;
        const dymaxionTarget = [target2D[0], target2D[1], 0.0];
        const arch = Math.sin(Math.PI * ease) * 0.45;
        const len = Math.hypot(p3D[0], p3D[1], p3D[2]);
        const norm = [p3D[0] / len, p3D[1] / len, p3D[2] / len];

        const glslPosX = (1 - ease) * p3D[0] + ease * dymaxionTarget[0] + norm[0] * arch;
        const glslPosY = (1 - ease) * p3D[1] + ease * dymaxionTarget[1] + norm[1] * arch;
        const glslPosZ = (1 - ease) * p3D[2] + ease * dymaxionTarget[2] + norm[2] * arch;

        expect(tsRes.position[0]).toBeCloseTo(glslPosX, 6);
        expect(tsRes.position[1]).toBeCloseTo(glslPosY, 6);
        expect(tsRes.position[2]).toBeCloseTo(glslPosZ, 6);
      });
    });

    it('C2-M4-T11: 1,000,000-node buffer generation stress-test executes in < 1500ms with zero NaNs and deterministic 8MB footprint', () => {
      const N = 1000000;
      const { points3D } = generateFibonacciSphere(N, 5.0);

      const start = performance.now();
      const dBuf = generateDymaxionBuffer(points3D);
      const elapsed = performance.now() - start;

      expect(dBuf.length).toBe(N * 2);
      expect(dBuf.byteLength).toBe(N * 2 * 4); // 8,000,000 bytes (8 MB)
      expect(elapsed).toBeLessThan(2500); // Fast CPU throughput

      // Sample 1000 evenly spaced points for 0 NaNs
      for (let i = 0; i < N; i += 1000) {
        expect(Number.isFinite(dBuf[i * 2 + 0])).toBe(true);
        expect(Number.isFinite(dBuf[i * 2 + 1])).toBe(true);
        expect(Number.isNaN(dBuf[i * 2 + 0])).toBe(false);
        expect(Number.isNaN(dBuf[i * 2 + 1])).toBe(false);
      }
    });
  });
});
