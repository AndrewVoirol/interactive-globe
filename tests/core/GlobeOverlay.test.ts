import { describe, it, expect } from 'vitest';
import {
  evaluatePointMorph,
  geoToSphere,
  geoToMercator,
  RADIUS,
  LANDMARK_ANCHORS,
} from '../../src/core/GlobeOverlay';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('GlobeOverlay: CPU/GPU Manifold Parity for Fracture and Fluid Modes', () => {
  const DEG2RAD = Math.PI / 180.0;

  describe('Mode 2: Griffith LEFM Fracture Manifold Parity', () => {
    it('OVERLAY-01: Mode 2 uses cylindrical unroll manifold instead of linear chord interpolation', () => {
      // In linear chord mix, at alpha=0.5, Greenwich (lon=0, lat=0) would be:
      // p3D = [0, 0, 5], p2D = [0, 0, 0.015]
      // mix(p3D, p2D, 0.5) = [0, 0, 2.5075] -> radius = 2.5075 (severely chord-collapsed)
      // In cylindrical unroll:
      // at lon=0, lat=0: lambda=0, uAngle=0, r_phi=5.0
      // baseX = 0, baseZ = r_phi * s = 5.0 * (1 - unrollProg)
      const pLinearChordZ = 0.5 * 5.0 + 0.5 * 0.015; // ~2.5075

      const ptMorph = evaluatePointMorph(0.0, 0.0, 0.5, 2, 0.0, 0.0);
      // Mode 2 with unrollProg = smoothstep(0.18, 1.0, 0.5) = 0.390...
      // baseZ = 5.0 * (1.0 - 0.390) = ~3.05
      // This is substantially different from linear chord interpolation
      expect(ptMorph[2]).toBeGreaterThan(pLinearChordZ + 0.2);
    });

    it('OVERLAY-02: Mode 2 produces close geometric parity with WebGPUEngine.evaluateManifoldPosition', () => {
      // Test across multiple latitudes and longitudes away from the tearing antimeridian seam
      const testCoordinates = [
        { lon: 0.0, lat: 0.0 },
        { lon: 30.0, lat: 45.0 },
        { lon: -60.0, lat: -20.0 },
        { lon: 90.0, lat: 10.0 },
      ];

      const alphas = [0.10, 0.30, 0.50, 0.80];

      for (const coord of testCoordinates) {
        const u = coord.lon / 360.0 + 0.5;
        const v = 0.5 - coord.lat / 180.0;

        for (const alpha of alphas) {
          const cpuPt = evaluatePointMorph(coord.lon, coord.lat, alpha, 2, 0.0, 0.0);
          const gpuPt = WebGPUEngine.evaluateManifoldPosition(u, v, 2, alpha, RADIUS, 0.0);

          // For front hemisphere (away from antimeridian crack dynamics),
          // positions must match with high fidelity
          const dist = Math.hypot(
            cpuPt[0] - gpuPt[0],
            cpuPt[1] - gpuPt[1],
            cpuPt[2] - gpuPt[2]
          );
          expect(dist).toBeLessThan(0.15);
        }
      }
    });

    it('OVERLAY-03: Mode 2 adheres to tRupture = 0.15 threshold with elastic hoop strain', () => {
      // For alpha <= 0.15, unrollProg is 0.0, sphere expands under elastic hoop strain
      const ptPre1 = evaluatePointMorph(0.0, 0.0, 0.05, 2, 0.0, 0.0);
      const ptPre2 = evaluatePointMorph(0.0, 0.0, 0.15, 2, 0.0, 0.0);

      // In pre-rupture on front hemisphere (lon=0, lat=0), radius expands by 0.06 * RADIUS * (alpha / 0.15)
      expect(ptPre1[2]).toBeCloseTo(RADIUS + 0.06 * RADIUS * (0.05 / 0.15), 2);
      expect(ptPre2[2]).toBeCloseTo(RADIUS + 0.06 * RADIUS, 2);

      // For alpha > 0.15, unrollProg > 0, so baseZ decreases toward 0
      const ptPost = evaluatePointMorph(0.0, 0.0, 0.50, 2, 0.0, 0.0);
      expect(ptPost[2]).toBeLessThan(RADIUS - 0.5);
    });
  });

  describe('Mode 3: Fluid Vortex Advection Ballooning Displacement Parity', () => {
    it('OVERLAY-04: Mode 3 includes orbital swelling ballooning displacement (+2.5 sin(pi * alpha))', () => {
      // At alpha = 0.50, balloonAmp = 2.5 * sin(0.5 * PI) = 2.5
      // Linear base chord at lon=0, lat=0 is [0, 0, 2.5]
      // With ballooning displacement: swelledBasePos = [0, 0, 2.5 + 2.5] = [0, 0, 5.0]
      const ptMorph = evaluatePointMorph(0.0, 0.0, 0.5, 3, 0.0, 0.0);
      const radiusAtMid = Math.hypot(ptMorph[0], ptMorph[1], ptMorph[2]);

      // Mid-unfurl planetary radius must be >= 4.25 to prevent camera focus clipping and marker submersion
      expect(radiusAtMid).toBeGreaterThanOrEqual(4.25);
    });

    it('OVERLAY-05: Mode 3 ballooning preserves surface distance across landmark anchors at alpha=0.5', () => {
      for (const anchor of LANDMARK_ANCHORS) {
        const pt = evaluatePointMorph(anchor.lon, anchor.lat, 0.5, 3, 0.0, 0.0);
        const r = Math.hypot(pt[0], pt[1], pt[2]);
        // All landmarks must remain on exterior surface (r >= 3.5 even with curl advection)
        expect(r).toBeGreaterThan(3.5);
      }
    });

    it('OVERLAY-06: Mode 3 converges to exact Mercator datum at alpha = 1.0 without lateral shift', () => {
      const p2D = geoToMercator(0.0, 0.0, RADIUS);
      const ptFinal = evaluatePointMorph(0.0, 0.0, 1.0, 3, 0.0, 0.0);

      // At alpha = 1.0, rawSin = sin(PI) = 0, so balloonAmp = 0, basePos = p2D
      // Must exactly equal p2D without any lateral surfaceNormal offset
      expect(ptFinal[0]).toBeCloseTo(p2D[0], 4);
      expect(ptFinal[1]).toBeCloseTo(p2D[1], 4);
      expect(ptFinal[2]).toBeCloseTo(0.0, 4);
    });
  });

  describe('Boundary Conditions & Finite Numeric Safety', () => {
    it('OVERLAY-07: returns finite numbers for all modes at alpha in {0.0, 0.3, 0.7, 1.0}', () => {
      const modes = [0, 1, 2, 3];
      const alphas = [0.0, 0.3, 0.7, 1.0];

      for (const m of modes) {
        for (const a of alphas) {
          for (const anchor of LANDMARK_ANCHORS) {
            const pt = evaluatePointMorph(anchor.lon, anchor.lat, a, m, 1.23, 0.05);
            expect(Number.isFinite(pt[0])).toBe(true);
            expect(Number.isFinite(pt[1])).toBe(true);
            expect(Number.isFinite(pt[2])).toBe(true);
          }
        }
      }
    });
  });
});
