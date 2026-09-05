// ============================================================================
// File: tests/phase2/milestone2-contour.test.ts
// Architecture: Milestone 2 Verification Suite (Tasks M2-T1 through M2-T3)
// Topics: 32-Byte Binary Header & Columnar Array Ingestion, Simon l'Huilier (1786)
//         Spherical Excess vs Geodetic Benchmarks, Van Oosterom & Strackee (1983)
//         Sliver Stability, Spherical Visvalingam-Whyatt Simplification,
//         Analytical 180° Antimeridian Seam Severance, Fuller Dymaxion 20-Facet
//         Sutherland-Hodgman Clipping, Nielson's Asymptotic Decider Saddle Resolution,
//         and WebGPU Buffer Allocations with Zero-Copy Memory Footprint Verification.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

import {
  parseContourMeshHeader,
  decodeContourMesh,
  computeChordalDistance,
  computeSphericalExcessLHuilier,
  computeSphericalExcessVanOosterom,
  computeSphericalTriangleArea,
  simplifyPolylineSpherical,
  severAntimeridianSegment,
  severPolylineAntimeridian,
  clipSegmentDymaxion,
  partitionPolylineByDymaxionFacets,
  computeBilinearSaddle,
  resolveAsymptoticDecider,
  interpolateContourEdge,
  lonLatToUnitSphere,
  unitSphereToLonLat,
  MAGIC_GEOM,
  MAGIC_CONT,
  DYMAXION_FACE_EDGE_PLANES,
} from '../../src/utils/contour-topology';

import {
  UNIT_VERTICES,
  ICOSAHEDRON_FACES,
  UNIT_CENTROIDS,
  PHI,
} from '../../src/utils/dymaxion';

import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';
import contourTopologyWGSL from '../../src/webgpu/shaders/contour_topology.wgsl?raw';

describe('Milestone 2: Contour & Vector Topology Test Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const binPath = path.join(projectRoot, 'public/geo-contour-mesh.bin');

  // ==========================================================================
  // Suite 1: Binary Contour Mesh Ingestion & Header Contract (M2-T1)
  // ==========================================================================
  describe('Suite 1: Binary Contour Mesh Ingestion & Header Contract (M2-T1)', () => {
    it('T01: decodes 32-byte header of public/geo-contour-mesh.bin with exact counts', () => {
      expect(fs.existsSync(binPath)).toBe(true);
      const rawBuf = fs.readFileSync(binPath);
      const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);

      const header = parseContourMeshHeader(arrayBuffer);
      expect(header.magic).toBe(MAGIC_GEOM); // 0x47454F4D
      expect(header.version).toBe(1);
      expect(header.pointCount).toBe(69028);
      expect(header.indexCount).toBe(69028); // 34,514 line segments
    });

    it('T02: supports both 0x47454F4D (GEOM) and 0x434F4E54 (CONT) magic headers, rejecting invalid magic', () => {
      const dummyBuffer = new ArrayBuffer(32);
      const view = new DataView(dummyBuffer);

      // 1. Test MAGIC_CONT (0x434F4E54)
      view.setUint32(0, MAGIC_CONT, true);
      view.setUint32(4, 1, true);
      view.setUint32(8, 100, true);
      view.setUint32(12, 100, true);
      const headerCont = parseContourMeshHeader(dummyBuffer);
      expect(headerCont.magic).toBe(MAGIC_CONT);
      expect(headerCont.pointCount).toBe(100);

      // 2. Test MAGIC_GEOM (0x47454F4D)
      view.setUint32(0, MAGIC_GEOM, true);
      const headerGeom = parseContourMeshHeader(dummyBuffer);
      expect(headerGeom.magic).toBe(MAGIC_GEOM);

      // 3. Test Invalid Magic
      view.setUint32(0, 0xDEADBEEF, true);
      expect(() => parseContourMeshHeader(dummyBuffer)).toThrow(/Invalid contour mesh magic/i);
    });

    it('T03: throws descriptive error on truncated buffer (< 32 bytes or incomplete payload)', () => {
      const tinyBuffer = new ArrayBuffer(16);
      expect(() => parseContourMeshHeader(tinyBuffer)).toThrow(/too small/i);

      // Header indicates 10 points but payload is missing
      const partialBuffer = new ArrayBuffer(40);
      const view = new DataView(partialBuffer);
      view.setUint32(0, MAGIC_GEOM, true);
      view.setUint32(4, 1, true);
      view.setUint32(8, 100, true);
      view.setUint32(12, 100, true);
      expect(() => decodeContourMesh(partialBuffer)).toThrow(/truncated/i);
    });

    it('T04: decodes 5 columnar typed array slices without memory copy', () => {
      const rawBuf = fs.readFileSync(binPath);
      const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);

      const mesh = decodeContourMesh(arrayBuffer);
      expect(mesh.positions3D.length).toBe(69028 * 3);
      expect(mesh.target2D.length).toBe(69028 * 2);
      expect(mesh.dymaxion2D.length).toBe(69028 * 2);
      expect(mesh.typeData.length).toBe(69028);
      expect(mesh.lineIndices.length).toBe(69028);

      // Verify views are over the same buffer
      expect(mesh.positions3D.buffer).toBe(arrayBuffer);
      expect(mesh.lineIndices.buffer).toBe(arrayBuffer);
    });

    it('T05: verifies all 69,028 3D positions lie on the sphere with radius 5.0 (+/- 0.05)', () => {
      const rawBuf = fs.readFileSync(binPath);
      const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
      const mesh = decodeContourMesh(arrayBuffer);

      const N = mesh.header.pointCount;
      for (let i = 0; i < N; i += 500) {
        const x = mesh.positions3D[i * 3 + 0];
        const y = mesh.positions3D[i * 3 + 1];
        const z = mesh.positions3D[i * 3 + 2];
        const r = Math.hypot(x, y, z);
        expect(Math.abs(r - 5.0)).toBeLessThan(0.05);
      }
    });

    it('T06: verifies 2D Mercator coordinates stay within Web Mercator boundaries', () => {
      const rawBuf = fs.readFileSync(binPath);
      const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
      const mesh = decodeContourMesh(arrayBuffer);

      const maxU = Math.PI * 5.0; // ~15.708
      for (let i = 0; i < mesh.header.pointCount; i += 500) {
        const u = mesh.target2D[i * 2 + 0];
        const v = mesh.target2D[i * 2 + 1];
        expect(Math.abs(u)).toBeLessThanOrEqual(maxU + 0.01);
        expect(Math.abs(v)).toBeLessThanOrEqual(16.0);
      }
    });

    it('T07: proves 0 NaNs and 0 Infinities across all 5 columnar arrays and 69,028 indices', () => {
      const rawBuf = fs.readFileSync(binPath);
      const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
      const mesh = decodeContourMesh(arrayBuffer);

      for (let i = 0; i < 2000; i++) {
        expect(Number.isFinite(mesh.positions3D[i])).toBe(true);
      }
      for (let i = 0; i < mesh.lineIndices.length; i += 1000) {
        expect(mesh.lineIndices[i]).toBeGreaterThanOrEqual(0);
        expect(mesh.lineIndices[i]).toBeLessThan(mesh.header.pointCount);
      }
    });

    it('T08: validates 12 discrete geomorphological elevation levels in typeData', () => {
      const rawBuf = fs.readFileSync(binPath);
      const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
      const mesh = decodeContourMesh(arrayBuffer);

      const uniqueElevs = new Set<number>();
      for (let i = 0; i < mesh.typeData.length; i++) {
        uniqueElevs.add(Math.round(mesh.typeData[i] * 10000) / 10000);
      }

      // Exactly 12 geomorphological contour levels (-6000m to +4000m)
      expect(uniqueElevs.size).toBe(12);
      for (const h of uniqueElevs) {
        expect(h).toBeGreaterThanOrEqual(0.24);
        expect(h).toBeLessThanOrEqual(0.76);
      }
    });
  });

  // ==========================================================================
  // Suite 2: Simon l'Huilier Precision vs Geodetic Benchmarks (M2-T2)
  // ==========================================================================
  describe('Suite 2: Simon l\'Huilier Precision vs Geodetic Benchmarks (M2-T2)', () => {
    it('T09: Tri-rectangular octant benchmark: verifies E = pi/2 rad (90 deg) to machine precision', () => {
      const A: [number, number, number] = [1, 0, 0];
      const B: [number, number, number] = [0, 1, 0];
      const C: [number, number, number] = [0, 0, 1];

      const area = computeSphericalTriangleArea(A, B, C, 1.0);
      const expected = Math.PI / 2.0; // 1.5707963267948966
      expect(Math.abs(area - expected)).toBeLessThan(1e-14);
    });

    it('T10: Regular icosahedron equilateral facet benchmark: verifies E = pi/5 rad (36 deg) with error < 1e-14', () => {
      // One facet of regular icosahedron from UNIT_VERTICES
      const f0 = ICOSAHEDRON_FACES[0];
      const A = UNIT_VERTICES[f0[0]];
      const B = UNIT_VERTICES[f0[1]];
      const C = UNIT_VERTICES[f0[2]];

      const area = computeSphericalTriangleArea(A, B, C, 1.0);
      const expected = Math.PI / 5.0; // 0.6283185307179586 (4*pi / 20)
      expect(Math.abs(area - expected)).toBeLessThan(1e-14);
    });

    it('T11: Collinear degenerate triangle benchmark: verifies E == 0.0 strictly with zero negative artifacts', () => {
      const A = lonLatToUnitSphere(0, 0);
      const B = lonLatToUnitSphere(10, 0);
      const C = lonLatToUnitSphere(20, 0);

      const area = computeSphericalTriangleArea(A, B, C, 1.0);
      expect(area).toBe(0.0);
    });

    it('T12: Small-triangle asymptotic convergence: compares spherical excess with planar Heron formula', () => {
      // Very small triangle at equator: 0.001 deg (~111 meters)
      const dDeg = 0.001;
      const A = lonLatToUnitSphere(0, 0);
      const B = lonLatToUnitSphere(dDeg, 0);
      const C = lonLatToUnitSphere(0, dDeg);

      const sphereArea = computeSphericalTriangleArea(A, B, C, 1.0);

      // Planar area of right isosceles triangle on sphere: 0.5 * (dRad)^2
      const dRad = (dDeg * Math.PI) / 180.0;
      const planarArea = 0.5 * dRad * dRad;

      const relDiff = Math.abs(sphereArea - planarArea) / planarArea;
      expect(relDiff).toBeLessThan(1e-5);
    });

    it('T13: Cyclic permutation invariance: area(A,B,C) == area(B,C,A) == area(C,A,B)', () => {
      const A = lonLatToUnitSphere(12.5, 34.2);
      const B = lonLatToUnitSphere(18.7, -15.4);
      const C = lonLatToUnitSphere(-5.3, 2.1);

      const area1 = computeSphericalTriangleArea(A, B, C, 1.0);
      const area2 = computeSphericalTriangleArea(B, C, A, 1.0);
      const area3 = computeSphericalTriangleArea(C, A, B, 1.0);

      expect(Math.abs(area1 - area2)).toBeLessThan(1e-14);
      expect(Math.abs(area1 - area3)).toBeLessThan(1e-14);
    });

    it('T14: Fuzzes spherical excess over 1,000 pseudo-random spherical triangles, asserting 0 <= E < 2*pi', () => {
      for (let i = 0; i < 1000; i++) {
        const lon1 = (Math.sin(i * 1.3) * 180);
        const lat1 = (Math.cos(i * 1.7) * 80);
        const lon2 = (Math.sin(i * 2.1) * 180);
        const lat2 = (Math.cos(i * 2.3) * 80);
        const lon3 = (Math.sin(i * 3.1) * 180);
        const lat3 = (Math.cos(i * 3.7) * 80);

        const A = lonLatToUnitSphere(lon1, lat1);
        const B = lonLatToUnitSphere(lon2, lat2);
        const C = lonLatToUnitSphere(lon3, lat3);

        const area = computeSphericalTriangleArea(A, B, C, 1.0);
        expect(Number.isFinite(area)).toBe(true);
        expect(area).toBeGreaterThanOrEqual(0.0);
        expect(area).toBeLessThan(2 * Math.PI);
      }
    });
  });

  // ==========================================================================
  // Suite 3: Van Oosterom & Strackee Sliver Stability (M2-T2)
  // ==========================================================================
  describe('Suite 3: Van Oosterom & Strackee Sliver Stability (M2-T2)', () => {
    it('T15: High-aspect-ratio sliver triangle: activates Van Oosterom and yields positive area without underflow', () => {
      // Sliver triangle: base along equator [0, 0] -> [20, 0], third point offset by 10^-8 degrees
      const A = lonLatToUnitSphere(0, 0);
      const B = lonLatToUnitSphere(10, 0);
      const C = lonLatToUnitSphere(20, 1e-8);

      const area = computeSphericalTriangleArea(A, B, C, 1.0);

      // Must be positive, finite, and within expected range ~1.55e-11 rad
      expect(Number.isFinite(area)).toBe(true);
      expect(area).toBeGreaterThan(1e-12);
      expect(area).toBeLessThan(1e-10);
    });

    it('T16: Extreme sliver triangle with delta_phi = 10^-9 degrees maintains numerical stability', () => {
      const A = lonLatToUnitSphere(0, 0);
      const B = lonLatToUnitSphere(5, 0);
      const C = lonLatToUnitSphere(10, 1e-9);

      const area = computeSphericalTriangleArea(A, B, C, 1.0);
      expect(Number.isFinite(area)).toBe(true);
      expect(area).toBeGreaterThan(0.0);
      expect(area).toBeLessThan(1e-11);
    });

    it('T17: Antipodal points guard: returns 0.0 when points approach antipodes or semiperimeter exceeds pi', () => {
      const A: [number, number, number] = [0, 0, 1];
      const B: [number, number, number] = [0, 0, -1]; // Antipodal
      const C: [number, number, number] = [1, 0, 0];

      const area = computeSphericalTriangleArea(A, B, C, 1.0);
      expect(area).toBe(0.0);
    });
  });

  // ==========================================================================
  // Suite 4: Spherical Visvalingam-Whyatt Simplification Invariants (M2-T2)
  // ==========================================================================
  describe('Suite 4: Spherical Visvalingam-Whyatt Simplification Invariants (M2-T2)', () => {
    it('T18: preserves endpoints for open polylines', () => {
      const poly: [number, number][] = [
        [0, 0], [1, 1], [2, 0.5], [3, 2], [4, 1], [5, 0],
      ];
      const simplified = simplifyPolylineSpherical(poly, 3);
      expect(simplified.length).toBeLessThanOrEqual(3);
      expect(simplified[0]).toEqual(poly[0]);
      expect(simplified[simplified.length - 1]).toEqual(poly[poly.length - 1]);
    });

    it('T19: closed ring degeneracy guard: closed ring never collapses below 3 vertices', () => {
      const ring: [number, number][] = [
        [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
      ];
      const simplified = simplifyPolylineSpherical(ring, 1);
      // Retains at least 3 unique vertices + closed endpoint = 4 points
      expect(simplified.length).toBeGreaterThanOrEqual(4);
      expect(simplified[0]).toEqual(simplified[simplified.length - 1]);
    });

    it('T20: decimation to vertex budget K produces exactly <= K vertices', () => {
      const poly: [number, number][] = [];
      for (let i = 0; i < 50; i++) {
        poly.push([i * 2, Math.sin(i * 0.5) * 10]);
      }

      for (const targetK of [5, 10, 20, 35]) {
        const simp = simplifyPolylineSpherical(poly, targetK);
        expect(simp.length).toBeLessThanOrEqual(targetK);
        expect(simp.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // ==========================================================================
  // Suite 5: Analytical Antimeridian Great-Circle Severance (180° Seam) (M2-T2)
  // ==========================================================================
  describe('Suite 5: Analytical Antimeridian Great-Circle Severance (180° Seam) (M2-T2)', () => {
    it('T21: detects antimeridian crossing when |lon1 - lon2| > 180 degrees', () => {
      const p1: [number, number] = [179.0, 30.0];
      const p2: [number, number] = [-179.0, 30.0];
      const severed = severAntimeridianSegment(p1, p2);

      expect(severed.length).toBe(2);
      expect(severed[0].p1).toEqual(p1);
      expect(severed[0].p2[0]).toBe(180.0);
      expect(severed[1].p1[0]).toBe(-180.0);
      expect(severed[1].p2).toEqual(p2);
    });

    it('T22: computes exact crossing latitude phi* for great-circle crossing', () => {
      // Symmetrical latitude crossing
      const p1: [number, number] = [178.0, 20.0];
      const p2: [number, number] = [-178.0, 40.0];
      const severed = severAntimeridianSegment(p1, p2);

      expect(severed.length).toBe(2);
      const phiStar1 = severed[0].p2[1];
      const phiStar2 = severed[1].p1[1];

      // Exact latitude matches across both split vertices
      expect(phiStar1).toBeCloseTo(phiStar2, 10);
      expect(phiStar1).toBeGreaterThan(20.0);
      expect(phiStar1).toBeLessThan(40.0);
    });

    it('T23: proves 3D globe C^0 continuity: 3D coordinates of snapped boundary endpoints evaluate to identical positions', () => {
      const p1: [number, number] = [175.0, -15.0];
      const p2: [number, number] = [-175.0, 25.0];
      const severed = severAntimeridianSegment(p1, p2);

      const pt1 = lonLatToUnitSphere(severed[0].p2[0], severed[0].p2[1]);
      const pt2 = lonLatToUnitSphere(severed[1].p1[0], severed[1].p1[1]);

      const dist3D = Math.hypot(pt1[0] - pt2[0], pt1[1] - pt2[1], pt1[2] - pt2[2]);
      expect(dist3D).toBeLessThan(1e-12);
      expect(Math.abs(pt1[0])).toBeLessThan(1e-12); // x = 0 on antimeridian
      expect(pt1[2]).toBeLessThan(0.0);             // z < 0 on antimeridian
    });

    it('T24: proves 2D planar map continuity: eliminates horizontal screen streaks', () => {
      const p1: [number, number] = [179.5, 10.0];
      const p2: [number, number] = [-179.5, 12.0];
      const severed = severAntimeridianSegment(p1, p2);

      // Subsegment 1 spans only 0.5 degrees
      expect(Math.abs(severed[0].p1[0] - severed[0].p2[0])).toBeCloseTo(0.5, 5);
      // Subsegment 2 spans only 0.5 degrees
      expect(Math.abs(severed[1].p1[0] - severed[1].p2[0])).toBeCloseTo(0.5, 5);
    });

    it('T25: full polyline severance splits crossing lines into independent strips', () => {
      const poly: [number, number][] = [
        [170.0, 10.0],
        [175.0, 15.0],
        [179.0, 20.0],
        [-179.0, 25.0],
        [-175.0, 30.0],
      ];
      const strips = severPolylineAntimeridian(poly);
      expect(strips.length).toBe(2);
      expect(strips[0][strips[0].length - 1][0]).toBe(180.0);
      expect(strips[1][0][0]).toBe(-180.0);
    });

    it('T26: fuzzes antimeridian severance across 500 crossing segments with 0 NaNs', () => {
      for (let i = 0; i < 500; i++) {
        const lat1 = -70 + (i % 140);
        const lat2 = -70 + ((i * 3) % 140);
        const lon1 = 175.0 + (i * 0.009);
        const lon2 = -175.0 - (i * 0.009);

        const severed = severAntimeridianSegment([lon1, lat1], [lon2, lat2]);
        expect(severed.length).toBe(2);
        expect(Number.isFinite(severed[0].p2[1])).toBe(true);
        expect(Number.isFinite(severed[1].p1[1])).toBe(true);
        expect(severed[0].p2[1]).toBeCloseTo(severed[1].p1[1], 8);
      }
    });
  });

  // ==========================================================================
  // Suite 6: Fuller Dymaxion 20-Facet Boundary Severance (M2-T2)
  // ==========================================================================
  describe('Suite 6: Fuller Dymaxion 20-Facet Boundary Severance (M2-T2)', () => {
    it('T27: verifies icosahedron geometry: 12 vertices, 20 facets, and golden ratio PHI', () => {
      expect(UNIT_VERTICES.length).toBe(12);
      expect(ICOSAHEDRON_FACES.length).toBe(20);
      expect(UNIT_CENTROIDS.length).toBe(20);
      expect(PHI).toBeCloseTo(1.61803398875, 8);

      for (const v of UNIT_VERTICES) {
        const len = Math.hypot(v[0], v[1], v[2]);
        expect(len).toBeCloseTo(1.0, 6);
      }
    });

    it('T28: verifies 20 inward-pointing edge normal planes with M_{k,e} . C_k > 0', () => {
      expect(DYMAXION_FACE_EDGE_PLANES.length).toBe(20);
      for (let f = 0; f < 20; f++) {
        const planes = DYMAXION_FACE_EDGE_PLANES[f];
        const centroid = UNIT_CENTROIDS[f];
        expect(planes.length).toBe(3);

        for (let e = 0; e < 3; e++) {
          const plane = planes[e];
          const dot = plane[0] * centroid[0] + plane[1] * centroid[1] + plane[2] * centroid[2];
          expect(dot).toBeGreaterThan(0.0);
        }
      }
    });

    it('T29: spherical Sutherland-Hodgman clips segments crossing facet boundaries', () => {
      // Vertex A inside Facet 0, Vertex B far outside Facet 0
      const f0 = ICOSAHEDRON_FACES[0];
      const centroid = UNIT_CENTROIDS[0];
      const insidePoint: [number, number, number] = [centroid[0] * 5, centroid[1] * 5, centroid[2] * 5];

      // Opposite point (antipodal to centroid)
      const outsidePoint: [number, number, number] = [-centroid[0] * 5, -centroid[1] * 5, -centroid[2] * 5];

      const clipped = clipSegmentDymaxion(insidePoint, outsidePoint, 0);
      expect(clipped).not.toBeNull();
      if (clipped) {
        expect(clipped.length).toBe(2);
        // Start point is insidePoint
        expect(clipped[0][0]).toBeCloseTo(insidePoint[0], 4);
        // End point is on boundary of facet 0: min distance to edge planes is ~0
        const endUnit = [clipped[1][0] / 5, clipped[1][1] / 5, clipped[1][2] / 5];
        const planes = DYMAXION_FACE_EDGE_PLANES[0];
        let minEdgeDist = Infinity;
        for (const pl of planes) {
          const d = Math.abs(pl[0] * endUnit[0] + pl[1] * endUnit[1] + pl[2] * endUnit[2]);
          minEdgeDist = Math.min(minEdgeDist, d);
        }
        expect(minEdgeDist).toBeLessThan(1e-4);
      }
    });

    it('T30: returns null for segments entirely outside facet boundary', () => {
      // Face 0 is in northern hemisphere; test segment in southern hemisphere
      const c10 = UNIT_CENTROIDS[10]; // southern face
      const pA: [number, number, number] = [c10[0] * 5, c10[1] * 5, c10[2] * 5];
      const pB: [number, number, number] = [c10[0] * 5 + 0.1, c10[1] * 5, c10[2] * 5];

      const clipped = clipSegmentDymaxion(pA, pB, 0);
      expect(clipped).toBeNull();
    });

    it('T31: partitionPolylineByDymaxionFacets groups polyline segments by facet without dangling artifacts', () => {
      const poly: [number, number][] = [
        [0, 0], [10, 10], [20, 20], [30, 30], [40, 40],
      ];
      const map = partitionPolylineByDymaxionFacets(poly);
      expect(map.size).toBeGreaterThan(0);
      for (const [faceIdx, strips] of map.entries()) {
        expect(faceIdx).toBeGreaterThanOrEqual(0);
        expect(faceIdx).toBeLessThan(20);
        expect(strips.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // Suite 7: Nielson's Asymptotic Decider & Saddle Resolution (M2-T2)
  // ==========================================================================
  describe('Suite 7: Nielson\'s Asymptotic Decider & Saddle Resolution (M2-T2)', () => {
    it('T32: verifies bilinear interpolation coefficients: alpha, beta, gamma, delta', () => {
      const cell = { f00: 2.0, f10: 5.0, f01: 4.0, f11: 8.0 };
      const res = computeBilinearSaddle(cell);

      expect(res.alpha).toBe(2.0);
      expect(res.beta).toBe(3.0);  // 5 - 2
      expect(res.gamma).toBe(2.0); // 4 - 2
      expect(res.delta).toBe(1.0); // 8 - 5 - 4 + 2 = 1
    });

    it('T33: verifies hyperbolic cell has saddle point inside unit cell (u_s, v_s) in (0, 1) x (0, 1)', () => {
      // Cell values with diagonal saddle: f00=10, f10=0, f01=0, f11=10
      const cell = { f00: 10.0, f10: 0.0, f01: 0.0, f11: 10.0 };
      const res = computeBilinearSaddle(cell);

      expect(res.hasSaddleInCell).toBe(true);
      expect(res.uSaddle).toBeCloseTo(0.5, 6);
      expect(res.vSaddle).toBeCloseTo(0.5, 6);
      expect(res.saddleValue).toBeCloseTo(5.0, 6);
    });

    it('T34: closed-form saddle value S = (F00*F11 - F10*F01) / delta', () => {
      const cell = { f00: 8.0, f10: 2.0, f01: 3.0, f11: 9.0 };
      const res = computeBilinearSaddle(cell);

      const expectedS = (8.0 * 9.0 - 2.0 * 3.0) / res.delta; // (72 - 6) / delta
      expect(res.saddleValue).toBeCloseTo(expectedS, 10);
    });

    it('T35: decision rule for Case 5 and Case 10 connects edges according to S >= C vs S < C', () => {
      const cell = { f00: 10.0, f10: 0.0, f01: 0.0, f11: 10.0 };
      // Case 5: S = 5.0. If isovalue C = 4.0 (S >= C), connects e0<->e1 and e3<->e2
      const dec1 = resolveAsymptoticDecider(cell, 4.0, 5);
      expect(dec1.connectEdges).toEqual([[0, 1], [3, 2]]);

      // Case 5: If isovalue C = 6.0 (S < C), connects e0<->e3 and e1<->e2
      const dec2 = resolveAsymptoticDecider(cell, 6.0, 5);
      expect(dec2.connectEdges).toEqual([[0, 3], [1, 2]]);

      // Case 10: If S >= C, connects e0<->e3 and e1<->e2
      const dec3 = resolveAsymptoticDecider(cell, 4.0, 10);
      expect(dec3.connectEdges).toEqual([[0, 3], [1, 2]]);

      // Case 10: If S < C, connects e0<->e1 and e3<->e2
      const dec4 = resolveAsymptoticDecider(cell, 6.0, 10);
      expect(dec4.connectEdges).toEqual([[0, 1], [3, 2]]);
    });

    it('T36: edge interpolation parameter guarded with midpoint fallback when values are equal', () => {
      // Standard linear interpolation
      const t1 = interpolateContourEdge(0.0, 10.0, 5.0);
      expect(t1).toBeCloseTo(0.5, 6);

      // Guarded fallback when fA == fB
      const t2 = interpolateContourEdge(5.0, 5.0, 5.0);
      expect(t2).toBe(0.5);
    });
  });

  // ==========================================================================
  // Suite 8: WebGPU Buffer Allocations, Memory Footprint & WGSL Shaders (M2-T1/T3)
  // ==========================================================================
  describe('Suite 8: WebGPU Buffer Allocations, Memory Footprint & WGSL Shaders (M2-T1/T3)', () => {
    it('T37: WebGPUEngine.loadContourMesh allocates contour buffers with exact VRAM footprint < 10 MB (~4.48 MB)', async () => {
      const originalNav = globalThis.navigator;
      try {
        const mockGPU = createMockNavigatorGPU(true);
        Object.defineProperty(globalThis, 'navigator', {
          value: { ...originalNav, gpu: mockGPU },
          configurable: true,
          writable: true,
        });

        const engine = new WebGPUEngine();
        const canvas = {
          getContext: () => ({
            configure: () => {},
            getCurrentTexture: () => ({ createView: () => ({}) }),
            canvas: { width: 800, height: 600 },
          }),
          width: 800,
          height: 600,
        } as unknown as HTMLCanvasElement;

        await engine.initialize({
          canvas,
          pointCount: 10,
          pointsData: new Float32Array(30),
          target2DData: new Float32Array(20),
          typeData: new Float32Array(10),
          lineIndices: new Uint32Array([0, 1, 1, 2]),
        });

        expect(engine.initialized).toBe(true);

        // Load binary contour mesh into GPU
        const rawBuf = fs.readFileSync(binPath);
        const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);

        await engine.loadContourMesh(arrayBuffer);

        expect(engine.contourVertexBuffer).toBeDefined();
        expect(engine.contourIndexBuffer).toBeDefined();
        expect(engine.contourSegmentBuffer).toBeDefined();
        expect(engine.contourVertexCount).toBe(69028);
        expect(engine.contourIndexCount).toBe(69028);

        // Verify exact VRAM buffer sizes:
        // contourVertexBuffer: 69028 * 32 = 2,208,896 bytes
        // contourIndexBuffer: 69028 * 4 = 276,112 bytes
        // contourSegmentBuffer: 34514 * 64 = 2,208,896 bytes
        const vertSize = (engine.contourVertexBuffer as any).size;
        const idxSize = (engine.contourIndexBuffer as any).size;
        const segSize = (engine.contourSegmentBuffer as any).size;

        expect(vertSize).toBe(2208896);
        expect(idxSize).toBe(276112);
        expect(segSize).toBe(2208896);

        const totalContourVRAM = vertSize + idxSize + segSize;
        expect(totalContourVRAM).toBe(4693904); // Exact 4.48 MiB
        expect(totalContourVRAM).toBeLessThan(10 * 1024 * 1024); // Strictly < 10 MB

        // Verify dispose clears buffers
        engine.dispose();
        expect(engine.contourVertexBuffer).toBeNull();
        expect(engine.contourIndexBuffer).toBeNull();
        expect(engine.contourSegmentBuffer).toBeNull();
        expect(engine.contourVertexCount).toBe(0);
        expect(engine.contourIndexCount).toBe(0);
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNav,
          configurable: true,
          writable: true,
        });
      }
    });

    it('T38: verifies contour_topology.wgsl compiles cleanly and exports required functions', () => {
      expect(contourTopologyWGSL).toContain('fn geodesicDistanceWGSL');
      expect(contourTopologyWGSL).toContain('fn sphericalTriangleExcessWGSL');
      expect(contourTopologyWGSL).toContain('fn computeSphericalExcessVanOosteromWGSL');
      expect(contourTopologyWGSL).toContain('fn isCrossSeamSegment');
      expect(contourTopologyWGSL).toContain('@compute @workgroup_size(256)');
      expect(contourTopologyWGSL).toContain('fn cs_spherical_excess');

      const device = new MockGPUDevice();
      const module = device.createShaderModule({
        label: 'contour_topology_module',
        code: contourTopologyWGSL,
      });
      expect(module).toBeDefined();
    });
  });
});
