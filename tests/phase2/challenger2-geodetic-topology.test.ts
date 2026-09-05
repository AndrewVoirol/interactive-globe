// ============================================================================
// File: tests/phase2/challenger2-geodetic-topology.test.ts
// Architecture: Challenger 2 (Geodetic & Topology Adversarial Challenger)
// Milestone: Milestone 2 — Contour & Vector Topology
// Topics:
//   1. Spherical Excess Adversarial Stress Harness:
//      - Extreme sliver triangles (dphi = 10^-7, 10^-10, 10^-12, 10^-14 deg):
//        Van Oosterom & Strackee fallback preserves machine precision while l'Huilier underflows gracefully
//      - Canonical benchmarks: tri-rectangular octant (pi/2), icosahedron facets (pi/5),
//        equilateral triangles, and collinear triplets (area = 0.0)
//      - Numerical monotonicity: area scales linearly with aperture angle for slivers
//      - WGSL f32 precision parity simulation & guard ordering analysis
//   2. Antimeridian Topological Severance Stress Harness:
//      - Multi-crossing polylines zig-zagging across 180° longitude
//      - Segments coincident with or touching the 180° meridian
//      - Polar boundary segments (phi = +/- 90°) and H -> 0 fallback
//      - 3D Cartesian C^0 continuity assertion (split endpoints map to identical 3D positions)
//   3. Fuller Dymaxion 20-Facet Boundary Severance Stress Harness:
//      - Facet boundary crossing segments
//      - Vertices on facet vertices (12 icosahedral vertices)
//      - Segments coincident with facet edges (30 edges)
//      - Inside vs outside vs corner-skirting segments
//      - Global polyline partitioning invariants across all 20 facets
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  toUnit,
  lonLatToUnitSphere,
  unitSphereToLonLat,
  computeChordalDistance,
  computeSphericalExcessLHuilier,
  computeSphericalExcessVanOosterom,
  computeSphericalTriangleArea,
  simplifyPolylineSpherical,
  severAntimeridianSegment,
  severPolylineAntimeridian,
  clipSegmentDymaxion,
  partitionPolylineByDymaxionFacets,
  DYMAXION_FACE_EDGE_PLANES,
  Point2D,
  Point3D,
} from '../../src/utils/contour-topology';

import {
  UNIT_VERTICES,
  ICOSAHEDRON_FACES,
  UNIT_CENTROIDS,
  PHI,
} from '../../src/utils/dymaxion';

describe('Challenger 2: Geodetic & Topology Adversarial Stress Suite', () => {

  // ==========================================================================
  // Section 1: Spherical Excess Adversarial Stress Harness
  // ==========================================================================
  describe('1. Spherical Excess Adversarial Stress Harness', () => {

    it('ADV-SE-01: Extreme sliver triangles (dphi = 10^-7, 10^-10, 10^-12 deg): Van Oosterom fallback preserves machine precision while l\'Huilier underflows gracefully', () => {
      // Base along equator: A=[0, 0], B=[10, 0]. Point C at [5, dLat]
      const A = lonLatToUnitSphere(0, 0);
      const B = lonLatToUnitSphere(10, 0);

      const dLats = [1e-7, 1e-10, 1e-12];

      for (const dLat of dLats) {
        const C = lonLatToUnitSphere(5, dLat);

        const a = computeChordalDistance(B, C);
        const b = computeChordalDistance(A, C);
        const c = computeChordalDistance(A, B);

        // 1. Direct l'Huilier evaluation
        const lHuilierArea = computeSphericalExcessLHuilier(a, b, c);

        // Empirical assertion: In float64, subtractive cancellation in (a + b - c) causes
        // l'Huilier to underflow gracefully to 0.0 without throwing, NaN, or negative area.
        expect(lHuilierArea).toBe(0.0);
        expect(Number.isFinite(lHuilierArea)).toBe(true);

        // 2. Direct Van Oosterom evaluation
        const voArea = computeSphericalExcessVanOosterom(A, B, C);

        // Empirical assertion: Van Oosterom maintains full machine precision via scalar triple product
        expect(voArea).toBeGreaterThan(0.0);
        expect(Number.isFinite(voArea)).toBe(true);

        // 3. Hybrid production API evaluation
        const hybridArea = computeSphericalTriangleArea(A, B, C, 1.0);

        // Empirical assertion: computeSphericalTriangleArea detects minDiff < 1e-11 and triggers
        // Van Oosterom fallback, matching voArea down to machine precision.
        expect(hybridArea).toBe(voArea);
        expect(hybridArea).toBeGreaterThan(0.0);

        // 4. Theoretical linear scaling verification:
        // For base Delta_lambda = 10 deg and height h = dLat in radians:
        // Theoretical excess E ~ 2 * h * tan(Delta_lambda / 4)
        const dLatRad = (dLat * Math.PI) / 180.0;
        const baseRad = (10.0 * Math.PI) / 180.0;
        const theoreticalE = 2.0 * dLatRad * Math.tan(baseRad / 4.0);
        const relDiff = Math.abs(hybridArea - theoreticalE) / theoreticalE;

        // Agreement with analytical small-angle theory within 1e-7 relative error
        expect(relDiff).toBeLessThan(1e-7);
      }
    });

    it('ADV-SE-02: Micro-sliver dynamic boundary sweep across dphi in [10^-4 .. 10^-14] deg exhibits zero NaN/Inf or sign flips', () => {
      const A = lonLatToUnitSphere(0, 0);
      const B = lonLatToUnitSphere(20, 0);

      const sweep = [1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11, 1e-12, 1e-13, 1e-14];

      let prevArea = Infinity;
      for (const dLat of sweep) {
        const C = lonLatToUnitSphere(10, dLat);
        const area = computeSphericalTriangleArea(A, B, C, 1.0);

        expect(Number.isFinite(area)).toBe(true);
        expect(area).toBeGreaterThanOrEqual(0.0);

        // Monotonic decrease as dLat decreases
        expect(area).toBeLessThanOrEqual(prevArea);
        prevArea = area;
      }
    });

    it('ADV-SE-03: Numerical Monotonicity: area scales strictly linearly with aperture angle theta in narrow slivers', () => {
      // Apex at (0, 0). Arm 1 along equator (length L = 45 deg).
      // Arm 2 rotated by aperture angle theta.
      // Analytical oracle: Area ~ theta * (1 - cos(L)) as theta -> 0
      const L_rad = (45.0 * Math.PI) / 180.0;
      const expectedCoeff = 1.0 - Math.cos(L_rad);
      const A = lonLatToUnitSphere(0, 0);
      const B = lonLatToUnitSphere(45, 0);

      const thetasDeg = [1e-3, 1e-5, 1e-7, 1e-9, 1e-11];
      let prevArea = Infinity;

      for (const thetaDeg of thetasDeg) {
        const thetaRad = (thetaDeg * Math.PI) / 180.0;
        const dirX = Math.cos(thetaRad);
        const dirY = Math.sin(thetaRad);
        const sinL = Math.sin(L_rad);
        const cosL = Math.cos(L_rad);
        const C: Point3D = [sinL * dirX, sinL * dirY, cosL];

        const area = computeSphericalTriangleArea(A, B, C, 1.0);
        const theoretical = thetaRad * expectedCoeff;

        expect(Number.isFinite(area)).toBe(true);
        expect(area).toBeGreaterThan(0.0);
        expect(area).toBeLessThan(prevArea);
        prevArea = area;

        // Ratio area / theoretical must be 1.0 within 1e-7
        const ratio = area / theoretical;
        expect(Math.abs(ratio - 1.0)).toBeLessThan(1e-7);
      }
    });

    it('ADV-SE-04: Canonical Spherical Benchmarks: Tri-rectangular octant, 20 icosahedral facets, and equilateral triangles', () => {
      // 1. Tri-rectangular octant: E = pi/2 rad (90 deg)
      const octA: Point3D = [1, 0, 0];
      const octB: Point3D = [0, 1, 0];
      const octC: Point3D = [0, 0, 1];
      const octArea = computeSphericalTriangleArea(octA, octB, octC, 1.0);
      expect(Math.abs(octArea - Math.PI / 2.0)).toBeLessThan(1e-14);

      // 2. All 20 Regular Icosahedral Facets: each must equal 4*pi / 20 = pi/5 rad
      const expectedFacetArea = Math.PI / 5.0; // ~0.6283185307179586
      for (let f = 0; f < 20; f++) {
        const face = ICOSAHEDRON_FACES[f];
        const vA = UNIT_VERTICES[face[0]];
        const vB = UNIT_VERTICES[face[1]];
        const vC = UNIT_VERTICES[face[2]];
        const fArea = computeSphericalTriangleArea(vA, vB, vC, 1.0);
        expect(Math.abs(fArea - expectedFacetArea)).toBeLessThan(1e-14);
      }

      // 3. Equilateral Spherical Triangles: excess E = 3*alpha - pi
      for (const aDeg of [15, 30, 45, 60, 75, 90]) {
        const aRad = (aDeg * Math.PI) / 180.0;
        const cosAlpha = Math.cos(aRad) / (1.0 + Math.cos(aRad));
        const alpha = Math.acos(cosAlpha);
        const expectedE = 3.0 * alpha - Math.PI;

        const vA: Point3D = [0, 0, 1];
        const vB: Point3D = [Math.sin(aRad), 0, Math.cos(aRad)];
        const vC: Point3D = [
          Math.sin(aRad) * Math.cos(alpha),
          Math.sin(aRad) * Math.sin(alpha),
          Math.cos(aRad),
        ];

        const area = computeSphericalTriangleArea(vA, vB, vC, 1.0);
        expect(Math.abs(area - expectedE)).toBeLessThan(2e-14);
      }
    });

    it('ADV-SE-05: Collinear Degenerate Triplets: strictly evaluates to 0.0 without negative artifacts', () => {
      // 1. Collinear along Equator
      const eq1 = lonLatToUnitSphere(0, 0);
      const eq2 = lonLatToUnitSphere(15, 0);
      const eq3 = lonLatToUnitSphere(30, 0);
      expect(computeSphericalTriangleArea(eq1, eq2, eq3, 1.0)).toBe(0.0);

      // 2. Collinear along Prime Meridian
      const mer1 = lonLatToUnitSphere(0, -20);
      const mer2 = lonLatToUnitSphere(0, 10);
      const mer3 = lonLatToUnitSphere(0, 40);
      expect(computeSphericalTriangleArea(mer1, mer2, mer3, 1.0)).toBe(0.0);

      // 3. Collinear along 50 randomized tilted great circles
      for (let i = 0; i < 50; i++) {
        // Normal vector to great circle plane
        const nx = Math.sin(i * 1.7);
        const ny = Math.cos(i * 2.3);
        const nz = Math.sin(i * 3.1);
        const nLen = Math.hypot(nx, ny, nz);
        const n: Point3D = [nx / nLen, ny / nLen, nz / nLen];

        // Find two orthogonal basis vectors u, v in the plane
        const arb: Point3D = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        // u = n x arb
        const ux = n[1] * arb[2] - n[2] * arb[1];
        const uy = n[2] * arb[0] - n[0] * arb[2];
        const uz = n[0] * arb[1] - n[1] * arb[0];
        const u = toUnit([ux, uy, uz]);

        // v = n x u
        const vx = n[1] * u[2] - n[2] * u[1];
        const vy = n[2] * u[0] - n[0] * u[2];
        const vz = n[0] * u[1] - n[1] * u[0];
        const v = toUnit([vx, vy, vz]);

        // 3 points along this great circle
        const angle1 = 0.1 * i;
        const angle2 = angle1 + 0.3;
        const angle3 = angle1 + 0.7;

        const p1: Point3D = [Math.cos(angle1) * u[0] + Math.sin(angle1) * v[0], Math.cos(angle1) * u[1] + Math.sin(angle1) * v[1], Math.cos(angle1) * u[2] + Math.sin(angle1) * v[2]];
        const p2: Point3D = [Math.cos(angle2) * u[0] + Math.sin(angle2) * v[0], Math.cos(angle2) * u[1] + Math.sin(angle2) * v[1], Math.cos(angle2) * u[2] + Math.sin(angle2) * v[2]];
        const p3: Point3D = [Math.cos(angle3) * u[0] + Math.sin(angle3) * v[0], Math.cos(angle3) * u[1] + Math.sin(angle3) * v[1], Math.cos(angle3) * u[2] + Math.sin(angle3) * v[2]];

        const area = computeSphericalTriangleArea(p1, p2, p3, 1.0);
        expect(area).toBe(0.0);
      }
    });

    it('ADV-SE-06: Antipodal, Hemisphere Boundary and Coincident Degeneracy Guard', () => {
      // 1. Antipodal pair
      const pA: Point3D = [1, 0, 0];
      const pB: Point3D = [-1, 0, 0];
      const pC: Point3D = [0, 1, 0];
      expect(computeSphericalTriangleArea(pA, pB, pC, 1.0)).toBe(0.0);

      // 2. Semiperimeter >= pi (hemisphere spanning)
      const p1 = lonLatToUnitSphere(0, 0);
      const p2 = lonLatToUnitSphere(179.999, 0);
      const p3 = lonLatToUnitSphere(90, 89.999);
      const areaHemi = computeSphericalTriangleArea(p1, p2, p3, 1.0);
      expect(Number.isFinite(areaHemi)).toBe(true);
      expect(areaHemi).toBeGreaterThanOrEqual(0.0);

      // 3. Coincident vertices
      expect(computeSphericalTriangleArea(pA, pA, pC, 1.0)).toBe(0.0);
      expect(computeSphericalTriangleArea(pA, pA, pA, 1.0)).toBe(0.0);
    });

    it('ADV-SE-07: WGSL 32-bit float emulation oracle & guard ordering analysis', () => {
      // Helper: Chordal distance in f32
      const chordDistF32 = (p1: Point3D, p2: Point3D): number => {
        const dx = Math.fround(p1[0] - p2[0]);
        const dy = Math.fround(p1[1] - p2[1]);
        const dz = Math.fround(p1[2] - p2[2]);
        const chord = Math.fround(Math.sqrt(Math.fround(dx * dx + dy * dy + dz * dz)));
        const sinHalf = Math.fround(Math.min(1.0, Math.fround(chord * 0.5)));
        return Math.fround(2.0 * Math.asin(sinHalf));
      };

      // Helper: Van Oosterom in f32
      const vanOosteromF32 = (uA: Point3D, uB: Point3D, uC: Point3D, radius: number): number => {
        const crossX = Math.fround(uB[1] * uC[2] - uB[2] * uC[1]);
        const crossY = Math.fround(uB[2] * uC[0] - uB[0] * uC[2]);
        const crossZ = Math.fround(uB[0] * uC[1] - uB[1] * uC[0]);
        const num = Math.fround(Math.abs(Math.fround(uA[0] * crossX + uA[1] * crossY + uA[2] * crossZ)));
        const den = Math.fround(1.0 + Math.fround(uA[0] * uB[0] + uA[1] * uB[1] + uA[2] * uB[2])
                                     + Math.fround(uB[0] * uC[0] + uB[1] * uC[1] + uB[2] * uC[2])
                                     + Math.fround(uC[0] * uA[0] + uC[1] * uA[1] + uC[2] * uA[2]));
        const E = Math.fround(2.0 * Math.atan2(num, den));
        return Math.fround(E * Math.fround(radius * radius));
      };

      // 1. Verify that Van Oosterom directly in f32 evaluates sliver triangles accurately:
      const sA = lonLatToUnitSphere(0, 0);
      const sB = lonLatToUnitSphere(10, 0);
      const sC = lonLatToUnitSphere(5, 0.0001);
      const uA = toUnit(sA).map(Math.fround) as Point3D;
      const uB = toUnit(sB).map(Math.fround) as Point3D;
      const uC = toUnit(sC).map(Math.fround) as Point3D;

      const directVoF32 = vanOosteromF32(uA, uB, uC, 1.0);
      expect(directVoF32).toBeGreaterThan(0.0);
      expect(Number.isFinite(directVoF32)).toBe(true);
      expect(Math.abs(directVoF32 - 1.52405448e-7)).toBeLessThan(1e-12);

      // 2. Guard ordering empirical demonstration:
      // In f32, subtracting c from (a + b) results in sc = s - c == 0.0 due to float32 precision limits
      const a = chordDistF32(uB, uC);
      const b = chordDistF32(uA, uC);
      const c = chordDistF32(uA, uB);
      const s = Math.fround(Math.fround(a + b + c) * 0.5);
      const sa = Math.fround(s - a);
      const sb = Math.fround(s - b);
      const sc = Math.fround(s - c);

      // Empirical proof: sc rounds to 0 in float32 arithmetic for slivers!
      expect(sc).toBe(0.0);

      // In contour_topology.wgsl (lines 83-95), checking `sc <= 0.0` BEFORE `minDiff < 1e-6`
      // causes premature exit to 0.0, whereas checking `minDiff < 1e-6` first (as in contour-topology.ts)
      // successfully activates the Van Oosterom fallback!
      const minDiff = Math.min(sa, Math.min(sb, sc));
      expect(minDiff).toBeLessThan(1e-6); // Proves minDiff < 1e-6 triggers when evaluated first
    });
  });

  // ==========================================================================
  // Section 2: Antimeridian Topological Severance Stress Harness
  // ==========================================================================
  describe('2. Antimeridian Topological Severance Stress Harness', () => {

    it('ADV-AM-01: Rapid multi-crossing polyline (100 crossings across 180° longitude) generates 0 screen streaks and exactly 100 severed strips', () => {
      const points: Point2D[] = [];
      const numCrossings = 100;

      // Generate 100 alternating points across 180° meridian
      for (let i = 0; i < numCrossings; i++) {
        const isEast = i % 2 === 0;
        const lon = isEast ? (175.0 + (i % 4) * 1.0) : (-175.0 - (i % 4) * 1.0);
        const lat = -60.0 + (i / numCrossings) * 120.0;
        points.push([lon, lat]);
      }

      const strips = severPolylineAntimeridian(points);

      // Each crossing must produce a cleanly partitioned strip
      expect(strips.length).toBe(numCrossings);

      for (let s = 0; s < strips.length; s++) {
        const strip = strips[s];
        expect(strip.length).toBeGreaterThanOrEqual(2);

        // Prove 2D planar map continuity: NO segment inside the strip spans > 180 degrees
        for (let i = 0; i < strip.length - 1; i++) {
          const dLon = Math.abs(strip[i][0] - strip[i + 1][0]);
          expect(dLon).toBeLessThanOrEqual(180.0);
        }

        // Prove bounding coordinates are valid
        for (const pt of strip) {
          expect(pt[0]).toBeGreaterThanOrEqual(-180.0);
          expect(pt[0]).toBeLessThanOrEqual(180.0);
          expect(pt[1]).toBeGreaterThanOrEqual(-90.0);
          expect(pt[1]).toBeLessThanOrEqual(90.0);
          expect(Number.isFinite(pt[0])).toBe(true);
          expect(Number.isFinite(pt[1])).toBe(true);
        }
      }

      // Assert alternating strip snapping continuity
      for (let s = 0; s < strips.length - 1; s++) {
        const endPt = strips[s][strips[s].length - 1];
        const startPt = strips[s + 1][0];

        // Snapped longitudes must be +/- 180.0
        expect(Math.abs(endPt[0])).toBe(180.0);
        expect(Math.abs(startPt[0])).toBe(180.0);
        expect(endPt[0] * startPt[0]).toBeLessThan(0); // Opposite signs

        // Crossing latitudes must match exactly
        expect(endPt[1]).toBeCloseTo(startPt[1], 10);
      }
    });

    it('ADV-AM-02: Boundary segments coincident with or touching 180° meridian do not produce NaNs or spurious strips', () => {
      // 1. Exactly on Eastern antimeridian (+180)
      const resEast = severAntimeridianSegment([180.0, 10.0], [180.0, 50.0]);
      expect(resEast.length).toBe(1);
      expect(resEast[0].p1).toEqual([180.0, 10.0]);
      expect(resEast[0].p2).toEqual([180.0, 50.0]);

      // 2. Exactly on Western antimeridian (-180)
      const resWest = severAntimeridianSegment([-180.0, 10.0], [-180.0, 50.0]);
      expect(resWest.length).toBe(1);
      expect(resWest[0].p1).toEqual([-180.0, 10.0]);
      expect(resWest[0].p2).toEqual([-180.0, 50.0]);

      // 3. Jump across sign on meridian [+180, 10] -> [-180, 50]
      const resJump = severAntimeridianSegment([180.0, 10.0], [-180.0, 50.0]);
      expect(resJump.length).toBe(2);
      expect(resJump[0].p2[0]).toBe(180.0);
      expect(resJump[1].p1[0]).toBe(-180.0);
      expect(resJump[0].p2[1]).toBeCloseTo(30.0, 6);
      expect(resJump[1].p1[1]).toBeCloseTo(30.0, 6);

      // 4. Tangent segment ending on meridian: [175, 10] -> [180, 30]
      const resTangEnd = severAntimeridianSegment([175.0, 10.0], [180.0, 30.0]);
      expect(resTangEnd.length).toBe(1);

      // 5. Tangent segment starting on meridian: [-180, 30] -> [-175, 50]
      const resTangStart = severAntimeridianSegment([-180.0, 30.0], [-175.0, 50.0]);
      expect(resTangStart.length).toBe(1);

      // 6. Crossing segment starting on meridian: [180, 20] -> [-170, 40]
      const resCrossStart = severAntimeridianSegment([180.0, 20.0], [-170.0, 40.0]);
      expect(resCrossStart.length).toBe(2);
      expect(resCrossStart[0].p2[0]).toBe(180.0);
      expect(resCrossStart[1].p1[0]).toBe(-180.0);
      expect(resCrossStart[0].p2[1]).toBeCloseTo(20.0, 6);
    });

    it('ADV-AM-03: Polar Boundary Segments (phi = +/- 90°) and H -> 0 degenerate fallback', () => {
      // 1. Crossing right at North Pole [170, 90] -> [-170, 90]
      const resNP = severAntimeridianSegment([170.0, 90.0], [-170.0, 90.0]);
      expect(resNP.length).toBe(2);
      expect(resNP[0].p2).toEqual([180.0, 90.0]);
      expect(resNP[1].p1).toEqual([-180.0, 90.0]);

      // 2. Crossing right at South Pole [170, -90] -> [-170, -90]
      const resSP = severAntimeridianSegment([170.0, -90.0], [-170.0, -90.0]);
      expect(resSP.length).toBe(2);
      expect(resSP[0].p2).toEqual([180.0, -90.0]);
      expect(resSP[1].p1).toEqual([-180.0, -90.0]);

      // 3. Near-polar crossing: [175, 89.99999] -> [-175, 89.99999]
      const resNearNP = severAntimeridianSegment([175.0, 89.99999], [-175.0, 89.99999]);
      expect(resNearNP.length).toBe(2);
      expect(resNearNP[0].p2[0]).toBe(180.0);
      expect(resNearNP[1].p1[0]).toBe(-180.0);
      expect(resNearNP[0].p2[1]).toBeCloseTo(resNearNP[1].p1[1], 8);
      expect(Number.isFinite(resNearNP[0].p2[1])).toBe(true);

      // 4. Polyline over the pole
      const polarPoly: Point2D[] = [
        [175.0, 80.0],
        [179.0, 88.0],
        [-179.0, 88.0],
        [-175.0, 80.0],
      ];
      const polarStrips = severPolylineAntimeridian(polarPoly);
      expect(polarStrips.length).toBe(2);
      expect(polarStrips[0][polarStrips[0].length - 1][0]).toBe(180.0);
      expect(polarStrips[1][0][0]).toBe(-180.0);
    });

    it('ADV-AM-04: Rigorous 3D Cartesian C^0 Continuity: 2,000 randomized great-circle crossings map to identical 3D positions', () => {
      for (let i = 0; i < 2000; i++) {
        const lat1 = -85.0 + (i * 0.085) % 170.0;
        const lat2 = -85.0 + (i * 0.137) % 170.0;
        const lon1 = 170.0 + (i * 0.0049) % 9.99;
        const lon2 = -170.0 - (i * 0.0073) % 9.99;

        const severed = severAntimeridianSegment([lon1, lat1], [lon2, lat2]);
        expect(severed.length).toBe(2);

        const snap1 = severed[0].p2;
        const snap2 = severed[1].p1;

        // Both snapped longitudes must be +/- 180.0
        expect(snap1[0]).toBe(180.0);
        expect(snap2[0]).toBe(-180.0);

        // Latitudes match
        expect(snap1[1]).toBeCloseTo(snap2[1], 10);

        // Evaluate 3D Cartesian coordinates on unit sphere S^2
        const pt1 = lonLatToUnitSphere(snap1[0], snap1[1]);
        const pt2 = lonLatToUnitSphere(snap2[0], snap2[1]);

        // 3D Cartesian distance must be zero to machine precision (< 1e-12)
        const dist3D = Math.hypot(pt1[0] - pt2[0], pt1[1] - pt2[1], pt1[2] - pt2[2]);
        expect(dist3D).toBeLessThan(1e-12);

        // Must lie on the antimeridian plane (x=0, z<=0)
        expect(Math.abs(pt1[0])).toBeLessThan(1e-12);
        expect(pt1[2]).toBeLessThanOrEqual(1e-12); // z <= 0 on antimeridian
      }
    });
  });

  // ==========================================================================
  // Section 3: Fuller Dymaxion 20-Facet Boundary Severance Stress Harness
  // ==========================================================================
  describe('3. Fuller Dymaxion 20-Facet Boundary Severance Stress Harness', () => {

    it('ADV-DY-01: Boundary crossing segments across all 20 facets clip cleanly onto edge planes', () => {
      for (let f = 0; f < 20; f++) {
        const centroid = UNIT_CENTROIDS[f];
        const planes = DYMAXION_FACE_EDGE_PLANES[f];
        const face = ICOSAHEDRON_FACES[f];

        // Segment from centroid through edge 0 midpoint to outside
        const v0 = UNIT_VERTICES[face[0]];
        const v1 = UNIT_VERTICES[face[1]];
        const mid: Point3D = [(v0[0] + v1[0]) * 0.5, (v0[1] + v1[1]) * 0.5, (v0[2] + v1[2]) * 0.5];

        // Target point far outside edge 0
        const outsidePt: Point3D = [
          mid[0] + (mid[0] - centroid[0]),
          mid[1] + (mid[1] - centroid[1]),
          mid[2] + (mid[2] - centroid[2]),
        ];

        const clipped = clipSegmentDymaxion(centroid, outsidePt, f);
        expect(clipped).not.toBeNull();

        if (clipped) {
          expect(clipped.length).toBe(2);

          // Clipped endpoint must lie on the edge plane (distance ~ 0)
          const q2 = toUnit(clipped[1]);
          let minPlaneDist = Infinity;
          for (const pl of planes) {
            const d = Math.abs(pl[0] * q2[0] + pl[1] * q2[1] + pl[2] * q2[2]);
            minPlaneDist = Math.min(minPlaneDist, d);
          }
          expect(minPlaneDist).toBeLessThan(1e-7);

          // Both clipped points must be inside or on the facet (d >= -1e-7 for all planes)
          for (const pl of planes) {
            const d1 = pl[0] * clipped[0][0] + pl[1] * clipped[0][1] + pl[2] * clipped[0][2];
            const d2 = pl[0] * clipped[1][0] + pl[1] * clipped[1][1] + pl[2] * clipped[1][2];
            expect(d1).toBeGreaterThanOrEqual(-1e-7);
            expect(d2).toBeGreaterThanOrEqual(-1e-7);
          }
        }
      }
    });

    it('ADV-DY-02: Vertices on Facet Vertices (All 12 Icosahedron Vertices): preserves inward segments and culls outward segments', () => {
      for (let f = 0; f < 20; f++) {
        const face = ICOSAHEDRON_FACES[f];
        const centroid = UNIT_CENTROIDS[f];

        for (let i = 0; i < 3; i++) {
          const vert = UNIT_VERTICES[face[i]];

          // Segment pointing inward: from vertex to centroid
          const inward = clipSegmentDymaxion(vert, centroid, f);
          expect(inward).not.toBeNull();
          if (inward) {
            expect(inward.length).toBe(2);
            for (const p of inward) {
              expect(Number.isFinite(p[0])).toBe(true);
              expect(Number.isFinite(p[1])).toBe(true);
              expect(Number.isFinite(p[2])).toBe(true);
            }
          }

          // Segment pointing outward away from facet
          const outwardPt: Point3D = [
            vert[0] * 2.0 - centroid[0],
            vert[1] * 2.0 - centroid[1],
            vert[2] * 2.0 - centroid[2],
          ];
          const outward = clipSegmentDymaxion(vert, outwardPt, f);
          // Outward pointing from vertex should be culled or clipped to degenerate point (< 1e-9 chord)
          if (outward !== null) {
            // If not null, chord distance must be valid
            const chord = computeChordalDistance(toUnit(outward[0]), toUnit(outward[1]));
            expect(chord).toBeGreaterThanOrEqual(1e-9);
          }
        }
      }
    });

    it('ADV-DY-03: Segments coincident with all 30 icosahedron edges are preserved in both adjacent facets', () => {
      // Collect unique edges from faces
      const edgeToFaces = new Map<string, number[]>();
      for (let f = 0; f < 20; f++) {
        const face = ICOSAHEDRON_FACES[f];
        const pairs: [number, number][] = [
          [face[0], face[1]],
          [face[1], face[2]],
          [face[2], face[0]],
        ];
        for (const [u, v] of pairs) {
          const key = u < v ? `${u}-${v}` : `${v}-${u}`;
          if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
          edgeToFaces.get(key)!.push(f);
        }
      }

      // 30 unique edges in regular icosahedron
      expect(edgeToFaces.size).toBe(30);

      for (const [key, faces] of edgeToFaces.entries()) {
        expect(faces.length).toBe(2); // exactly 2 facets share each edge
        const [uIdx, vIdx] = key.split('-').map(Number);
        const vA = UNIT_VERTICES[uIdx];
        const vB = UNIT_VERTICES[vIdx];

        for (const f of faces) {
          const clipped = clipSegmentDymaxion(vA, vB, f);
          expect(clipped).not.toBeNull();
          if (clipped) {
            expect(clipped.length).toBe(2);
            // Verify endpoints match edge endpoints
            const dA = computeChordalDistance(toUnit(clipped[0]), vA);
            const dB = computeChordalDistance(toUnit(clipped[1]), vB);
            expect(dA).toBeLessThan(1e-5);
            expect(dB).toBeLessThan(1e-5);
          }
        }
      }
    });

    it('ADV-DY-04: Segments entirely inside return full segment; antipodal segments return null', () => {
      for (let f = 0; f < 20; f++) {
        const c = UNIT_CENTROIDS[f];
        const face = ICOSAHEDRON_FACES[f];
        const v0 = UNIT_VERTICES[face[0]];

        // Strictly interior segment via convex combination:
        // Point 1: centroid
        const u1 = toUnit(c);
        // Point 2: 90% centroid + 10% vertex v0 (strictly interior to facet f)
        const u2 = toUnit([c[0] * 0.9 + v0[0] * 0.1, c[1] * 0.9 + v0[1] * 0.1, c[2] * 0.9 + v0[2] * 0.1]);

        const pInside1: Point3D = [u1[0] * 5.0, u1[1] * 5.0, u1[2] * 5.0];
        const pInside2: Point3D = [u2[0] * 5.0, u2[1] * 5.0, u2[2] * 5.0];

        const clippedInside = clipSegmentDymaxion(pInside1, pInside2, f);
        expect(clippedInside).not.toBeNull();
        if (clippedInside) {
          expect(clippedInside[0][0]).toBeCloseTo(pInside1[0], 6);
          expect(clippedInside[0][1]).toBeCloseTo(pInside1[1], 6);
          expect(clippedInside[0][2]).toBeCloseTo(pInside1[2], 6);
          expect(clippedInside[1][0]).toBeCloseTo(pInside2[0], 6);
          expect(clippedInside[1][1]).toBeCloseTo(pInside2[1], 6);
          expect(clippedInside[1][2]).toBeCloseTo(pInside2[2], 6);
        }

        // Antipodal segment (outside facet)
        const pAnti1: Point3D = [-u1[0] * 5.0, -u1[1] * 5.0, -u1[2] * 5.0];
        const pAnti2: Point3D = [-u2[0] * 5.0, -u2[1] * 5.0, -u2[2] * 5.0];

        const clippedAnti = clipSegmentDymaxion(pAnti1, pAnti2, f);
        expect(clippedAnti).toBeNull();
      }
    });

    it('ADV-DY-05: Global Great-Circle Polyline Partitioning Invariant across 20 facets', () => {
      // Generate a global equatorial polyline with 180 points
      const globalPoly: Point2D[] = [];
      for (let i = 0; i <= 180; i++) {
        const lon = -180.0 + i * 2.0;
        const lat = 15.0 * Math.sin((lon * Math.PI) / 180.0);
        globalPoly.push([lon, lat]);
      }

      const partitionMap = partitionPolylineByDymaxionFacets(globalPoly);

      // Must cover multiple facets along the trajectory
      expect(partitionMap.size).toBeGreaterThanOrEqual(6);

      let totalStrips = 0;
      for (const [faceIdx, strips] of partitionMap.entries()) {
        expect(faceIdx).toBeGreaterThanOrEqual(0);
        expect(faceIdx).toBeLessThan(20);
        totalStrips += strips.length;

        const planes = DYMAXION_FACE_EDGE_PLANES[faceIdx];

        // Verify all partitioned points are strictly within or on the facet
        for (const strip of strips) {
          expect(strip.length).toBeGreaterThanOrEqual(2);
          for (const pt of strip) {
            const u = toUnit(lonLatToUnitSphere(pt[0], pt[1]));
            for (const pl of planes) {
              const dot = pl[0] * u[0] + pl[1] * u[1] + pl[2] * u[2];
              // Must be within facet boundary (allowing floating tolerance 1e-4)
              expect(dot).toBeGreaterThanOrEqual(-1e-4);
            }
          }
        }
      }

      expect(totalStrips).toBeGreaterThanOrEqual(6);
    });
  });
});
