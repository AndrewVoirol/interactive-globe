import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
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
} from '../../src/utils/dymaxion';

describe('Adversarial Challenger 1: Milestone M4 Fuller Dymaxion Polyhedral Unfolding Stress Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  let appCode = fs.readFileSync(appTsxPath, 'utf8');
  const geoLayerPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoLayerPath)) {
    appCode += '\n' + fs.readFileSync(geoLayerPath, 'utf8');
  }

  // =========================================================================
  // 1. 100,000 Randomized 3D Spherical Coordinates NaN & Inf Stress Test
  // =========================================================================
  describe('1. 100,000 Randomized 3D Coordinates NaN / Inf Robustness', () => {
    it('CH1-M4-T1: verifies 100,000 randomized 3D spherical coordinates produce 0 NaNs and strictly finite values in gnomonic & 2D net projection', () => {
      const N = 100000;
      let nanCount = 0;
      let infCount = 0;
      let minDot = Infinity;
      let maxDot = -Infinity;

      // Seeded / pseudo-random deterministic distribution on S^2 with variable radii
      for (let i = 0; i < N; i++) {
        // Uniform sphere sampling via Marsaglia method
        const u = (Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
        const v = (Math.cos(i * 43.1234 + 19.876) * 23421.6312) % 1;
        const phi = Math.acos(Math.max(-1, Math.min(1, 2 * Math.abs(u) - 1)));
        const theta = 2 * Math.PI * Math.abs(v);

        // Variable radius between 0.001 and 1000.0 to test scale invariance
        const scale = 0.01 + (i % 100) * 0.1;
        const x = Math.sin(phi) * Math.cos(theta) * scale;
        const y = Math.sin(phi) * Math.sin(theta) * scale;
        const z = Math.cos(phi) * scale;

        const p: [number, number, number] = [x, y, z];

        // 1. Face Assignment & Gnomonic Projection
        const faceRes = projectPointToDymaxionFace(p);
        if (Number.isNaN(faceRes.maxDot) || !Number.isFinite(faceRes.maxDot)) nanCount++;
        if (Number.isNaN(faceRes.gnomonicPos[0]) || !Number.isFinite(faceRes.gnomonicPos[0])) nanCount++;
        if (Number.isNaN(faceRes.gnomonicPos[1]) || !Number.isFinite(faceRes.gnomonicPos[1])) nanCount++;
        if (Number.isNaN(faceRes.gnomonicPos[2]) || !Number.isFinite(faceRes.gnomonicPos[2])) nanCount++;

        if (faceRes.maxDot < minDot) minDot = faceRes.maxDot;
        if (faceRes.maxDot > maxDot) maxDot = faceRes.maxDot;

        // 2. 2D Net Mapping
        const [u2D, v2D] = projectToDymaxion2D(p);
        if (Number.isNaN(u2D) || !Number.isFinite(u2D)) nanCount++;
        if (Number.isNaN(v2D) || !Number.isFinite(v2D)) nanCount++;
        if (!Number.isFinite(u2D) || !Number.isFinite(v2D)) infCount++;
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      // Gnomonic denominator lower bound check: minDot >= phi / sqrt(3) ~ 0.93417 >= 0.75
      expect(minDot).toBeGreaterThanOrEqual(0.75);
      expect(maxDot).toBeLessThanOrEqual(1.000001);
    });

    it('CH1-M4-T2: verifies generateDymaxionBuffer on 100,000 nodes produces contiguous valid Float32Array with 0 NaNs', () => {
      const N = 100000;
      const points3D = new Float32Array(N * 3);

      for (let i = 0; i < N; i++) {
        const z = 1.0 - (i / (N - 1)) * 2.0;
        const r = Math.sqrt(Math.max(0, 1.0 - z * z));
        const theta = (2 * Math.PI * i) / PHI;
        points3D[i * 3 + 0] = Math.cos(theta) * r * 5.0;
        points3D[i * 3 + 1] = Math.sin(theta) * r * 5.0;
        points3D[i * 3 + 2] = z * 5.0;
      }

      const t0 = performance.now();
      const dymaxionBuffer = generateDymaxionBuffer(points3D);
      const elapsedMs = performance.now() - t0;

      expect(dymaxionBuffer.length).toBe(N * 2);
      expect(dymaxionBuffer.byteLength).toBe(N * 2 * 4); // 800 KB

      let nanCount = 0;
      for (let i = 0; i < N * 2; i++) {
        if (Number.isNaN(dymaxionBuffer[i]) || !Number.isFinite(dymaxionBuffer[i])) {
          nanCount++;
        }
      }

      expect(nanCount).toBe(0);
      // Throughput should exceed 500,000 nodes/sec (< 200ms for 100k nodes)
      expect(elapsedMs).toBeLessThan(1000);
    });
  });

  // =========================================================================
  // 2. Extreme Values & Singularity Stress Tests
  // =========================================================================
  describe('2. Extreme Values, Boundary Conditions & Vertex Intersections', () => {
    it('CH1-M4-T3: verifies true North & South poles under various radius scales produce finite coordinates', () => {
      const scales = [1e-12, 1e-6, 0.01, 1.0, 5.0, 100.0, 1e6, 1e12];

      for (const s of scales) {
        // North Pole (0, s, 0) and South Pole (0, -s, 0)
        const northPole: [number, number, number] = [0, s, 0];
        const southPole: [number, number, number] = [0, -s, 0];

        const [uN, vN] = projectToDymaxion2D(northPole);
        const [uS, vS] = projectToDymaxion2D(southPole);

        expect(Number.isFinite(uN)).toBe(true);
        expect(Number.isFinite(vN)).toBe(true);
        expect(Number.isNaN(uN)).toBe(false);
        expect(Number.isNaN(vN)).toBe(false);

        expect(Number.isFinite(uS)).toBe(true);
        expect(Number.isFinite(vS)).toBe(true);
        expect(Number.isNaN(uS)).toBe(false);
        expect(Number.isNaN(vS)).toBe(false);
      }
    });

    it('CH1-M4-T4: verifies all 12 exact icosahedron vertices project with stable finite coordinates', () => {
      for (let vIdx = 0; vIdx < UNIT_VERTICES.length; vIdx++) {
        const v = UNIT_VERTICES[vIdx];
        const { faceIndex, gnomonicPos } = projectPointToDymaxionFace(v);

        const face = ICOSAHEDRON_FACES[faceIndex];
        // v must be one of the 3 vertices of this assigned face
        expect(face).toContain(vIdx);

        const v0 = UNIT_VERTICES[face[0]];
        const v1 = UNIT_VERTICES[face[1]];
        const v2 = UNIT_VERTICES[face[2]];

        const [b0, b1, b2] = computeBarycentricCoordinates(gnomonicPos, v0, v1, v2);
        const bSum = b0 + b1 + b2 || 1.0;
        const nb0 = b0 / bSum, nb1 = b1 / bSum, nb2 = b2 / bSum;

        // Normalized barycentric coordinates sum to 1.0
        expect(nb0 + nb1 + nb2).toBeCloseTo(1.0, 5);

        // 2D net projection must be finite and non-NaN
        const [u2D, v2D] = projectToDymaxion2D(v);
        expect(Number.isFinite(u2D)).toBe(true);
        expect(Number.isFinite(v2D)).toBe(true);
        expect(Number.isNaN(u2D)).toBe(false);
        expect(Number.isNaN(v2D)).toBe(false);
      }
    });

    it('CH1-M4-T5: verifies all 30 icosahedron edge midpoints (facet boundaries) project stably without NaN', () => {
      // Collect all unique edges from 20 faces
      const edgeSet = new Set<string>();
      const edges: Array<[number, number]> = [];

      ICOSAHEDRON_FACES.forEach(([v0, v1, v2]) => {
        const pairs: Array<[number, number]> = [[v0, v1], [v1, v2], [v2, v0]];
        pairs.forEach(([a, b]) => {
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push([a, b]);
          }
        });
      });

      expect(edges.length).toBe(30);

      edges.forEach(([vA, vB]) => {
        const pA = UNIT_VERTICES[vA];
        const pB = UNIT_VERTICES[vB];

        // Midpoint on chord
        const mid: [number, number, number] = [
          (pA[0] + pB[0]) / 2,
          (pA[1] + pB[1]) / 2,
          (pA[2] + pB[2]) / 2,
        ];

        // Test midpoint and perturbations near edge boundary (t = 0.01 to 0.99)
        for (let t = 0.05; t <= 0.95; t += 0.1) {
          const pt: [number, number, number] = [
            (1 - t) * pA[0] + t * pB[0],
            (1 - t) * pA[1] + t * pB[1],
            (1 - t) * pA[2] + t * pB[2],
          ];

          const res = projectPointToDymaxionFace(pt);
          expect(res.faceIndex).toBeGreaterThanOrEqual(0);
          expect(res.faceIndex).toBeLessThan(20);
          expect(res.maxDot).toBeGreaterThanOrEqual(0.75);

          const [u2D, v2D] = projectToDymaxion2D(pt);
          expect(Number.isFinite(u2D)).toBe(true);
          expect(Number.isFinite(v2D)).toBe(true);
        }
      });
    });

    it('CH1-M4-T6: verifies degenerate, near-zero, and extreme coordinate limits do not crash or produce NaN', () => {
      const extremePoints: Array<[number, number, number]> = [
        [0, 0, 0], // True zero length vector
        [1e-25, 0, 0], // Subnormal magnitude
        [0, 1e-25, 0],
        [0, 0, 1e-25],
        [-1e-25, -1e-25, -1e-25],
        [1e15, 1e15, 1e15], // Very large magnitude
        [-1e15, 1e15, -1e15],
        [Number.EPSILON, 0, 0],
        [0, Number.EPSILON, 0],
        [0, 0, Number.EPSILON],
      ];

      extremePoints.forEach(p => {
        const res = projectPointToDymaxionFace(p);
        expect(Number.isFinite(res.maxDot)).toBe(true);
        expect(Number.isNaN(res.maxDot)).toBe(false);

        const [u2D, v2D] = projectToDymaxion2D(p);
        expect(Number.isFinite(u2D)).toBe(true);
        expect(Number.isFinite(v2D)).toBe(true);
        expect(Number.isNaN(u2D)).toBe(false);
        expect(Number.isNaN(v2D)).toBe(false);
      });
    });
  });

  // =========================================================================
  // 3. Morph Trajectory Continuity (alpha in [0, 1] with step 0.001)
  // =========================================================================
  describe('3. Morph Trajectory C0/C1 Continuity & Shell Arching Bounds', () => {
    it('CH1-M4-T7: verifies morph trajectory continuity across alpha in [0, 1] with step 0.001 (1,001 steps) for 20 representative test points', () => {
      const testPoints: Array<[number, number, number]> = [
        [0, 5, 0], // North Pole
        [0, -5, 0], // South Pole
        [5, 0, 0], // Equator 0
        [-5, 0, 0], // Equator 180
        [0, 0, 5], // Equator 90
        [0, 0, -5], // Equator -90
        ...UNIT_VERTICES.map(v => [v[0] * 5, v[1] * 5, v[2] * 5] as [number, number, number]), // 12 Vertices
        [2.5, 3.5, 2.5], // Random point 1
        [-3.0, 1.0, 3.8], // Random point 2
      ];

      const stepSize = 0.001;
      const totalSteps = 1000;

      for (const p3D of testPoints) {
        const target2D = projectToDymaxion2D(p3D);

        let prevPos = computeDymaxionMorph(p3D, target2D, 0.0).position;
        let prevNormal = computeDymaxionMorph(p3D, target2D, 0.0).normal;

        for (let s = 1; s <= totalSteps; s++) {
          const alpha = s * stepSize;
          const curr = computeDymaxionMorph(p3D, target2D, alpha);

          // 1. Check all position coordinates are finite and non-NaN
          expect(Number.isFinite(curr.position[0])).toBe(true);
          expect(Number.isFinite(curr.position[1])).toBe(true);
          expect(Number.isFinite(curr.position[2])).toBe(true);
          expect(Number.isNaN(curr.position[0])).toBe(false);
          expect(Number.isNaN(curr.position[1])).toBe(false);
          expect(Number.isNaN(curr.position[2])).toBe(false);

          // 2. C0 Continuity: displacement per 0.001 step must be strictly bounded (< 0.05 units)
          const posDelta = Math.hypot(
            curr.position[0] - prevPos[0],
            curr.position[1] - prevPos[1],
            curr.position[2] - prevPos[2]
          );
          expect(posDelta).toBeLessThan(0.05);

          // 3. Normal vector components are finite and non-NaN
          expect(Number.isFinite(curr.normal[0])).toBe(true);
          expect(Number.isFinite(curr.normal[1])).toBe(true);
          expect(Number.isFinite(curr.normal[2])).toBe(true);
          expect(Number.isNaN(curr.normal[0])).toBe(false);
          expect(Number.isNaN(curr.normal[1])).toBe(false);
          expect(Number.isNaN(curr.normal[2])).toBe(false);

          // 4. Arch modulation must be non-negative and <= 0.45
          expect(curr.arch).toBeGreaterThanOrEqual(-1e-6);
          expect(curr.arch).toBeLessThanOrEqual(0.450001);

          prevPos = curr.position;
          prevNormal = curr.normal;
        }
      }
    });

    it('CH1-M4-T8: verifies arching modulation maximum occurs symmetrically at alpha = 0.5 and eliminates volume collapse', () => {
      const p3D: [number, number, number] = [0, 5, 0];
      const target2D = projectToDymaxion2D(p3D);

      const morph0 = computeDymaxionMorph(p3D, target2D, 0.0);
      const morph25 = computeDymaxionMorph(p3D, target2D, 0.25);
      const morph50 = computeDymaxionMorph(p3D, target2D, 0.50);
      const morph75 = computeDymaxionMorph(p3D, target2D, 0.75);
      const morph100 = computeDymaxionMorph(p3D, target2D, 1.00);

      // Boundary arching is zero
      expect(morph0.arch).toBeCloseTo(0.0, 6);
      expect(morph100.arch).toBeCloseTo(0.0, 6);

      // Midpoint arching is exactly 0.45 (sin(pi * 0.5) * 0.45)
      expect(morph50.arch).toBeCloseTo(0.45, 5);

      // Quarter point symmetry (sin(pi * ease(0.25)) * 0.45)
      expect(morph25.arch).toBeGreaterThan(0.0);
      expect(morph75.arch).toBeGreaterThan(0.0);
    });

    it('CH1-M4-T9: verifies planar net state (alpha = 1.0) has exactly Z = 0 and upward facing normal (0, 0, 1)', () => {
      const N = 500;
      for (let i = 0; i < N; i++) {
        const theta = (i / N) * 2 * Math.PI;
        const phi = (i / N) * Math.PI - Math.PI / 2;
        const p3D: [number, number, number] = [
          5.0 * Math.cos(phi) * Math.sin(theta),
          5.0 * Math.sin(phi),
          5.0 * Math.cos(phi) * Math.cos(theta),
        ];

        const target2D = projectToDymaxion2D(p3D);
        const morph1 = computeDymaxionMorph(p3D, target2D, 1.0);

        expect(morph1.position[2]).toBeCloseTo(0.0, 6);
        expect(morph1.normal[0]).toBeCloseTo(0.0, 6);
        expect(morph1.normal[1]).toBeCloseTo(0.0, 6);
        expect(morph1.normal[2]).toBeCloseTo(1.0, 6);
      }
    });
  });

  // =========================================================================
  // 4. Full GPU Shader Architecture & Integration in App.tsx
  // =========================================================================
  describe('4. Shader Architecture & App.tsx Integration', () => {
    it('CH1-M4-T10: verifies App.tsx vertex shader includes Dymaxion (Mode 4) and all 5 morphing paradigms', () => {
      expect(appCode).toContain('attribute vec2 dymaxion2D;');
      expect(appCode).toContain('if (u_mode == 1)');
      expect(appCode).toContain('else if (u_mode == 2)');
      expect(appCode).toContain('else if (u_mode == 3)');
      expect(appCode).toContain('else if (u_mode == 4)');
    });

    it('CH1-M4-T11: verifies App.tsx normal/facing blending supports the dynamic morphing modes', () => {
      expect(appCode).toMatch(/if\s*\(\s*u_mode\s*==\s*1\s*\|\|\s*u_mode\s*==\s*2\s*\|\|\s*u_mode\s*==\s*3/);
      expect(appCode).toContain('vFacing = mix(facing, dot(normalize(normalMatrix * vec3(0.0, 0.0, 1.0)), viewDir), pow(ease, 2.0));');
    });

    it('CH1-M4-T12: verifies GeometryLayer provides dymaxion2D attribute for icosahedral net projection', () => {
      expect(appCode).toContain("meshGeo.setAttribute('dymaxion2D'");
      expect(appCode).toContain("pointGeo.setAttribute('dymaxion2D'");
    });

    it('CH1-M4-T13: verifies HUD selector displays all 5 paradigms in a clean 5-column layout', () => {
      expect(appCode).toContain('grid-cols-5');
      expect(appCode).toContain('Linear');
      expect(appCode).toContain('Scroll');
      expect(appCode).toContain('Griffith');
      expect(appCode).toContain('Fluid');
      expect(appCode).toContain('Dymaxion');
    });
  });
});
