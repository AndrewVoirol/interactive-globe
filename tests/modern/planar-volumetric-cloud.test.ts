// ============================================================================
// File: tests/modern/planar-volumetric-cloud.test.ts
// Unit Tests for 2D Planar & Unfurled Map Volumetric Cloud Raymarching Math
// Tests analytical slab intersections, coordinate mapping, and noise scaling.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  intersectRaySlab,
  computePlanarTroposphericInterval,
  mapPlanarCoordinates,
  computePlanarNoiseCoord,
  clampRayIntervalToTerrain,
  invertMacroChart,
  TroposphericInterval,
  Vec3,
} from '../../src/core/math/volumetricMath';

describe('Planar Tropospheric Slab Raymarching Pure Math', () => {
  const RADIUS = 5.0;
  const DELTA_Z = 0.19;
  const X_HALF = Math.PI * RADIUS; // ~15.707963
  const Y_HALF = 0.5 * Math.PI * RADIUS; // ~7.853982

  const slabMin: Vec3 = [-X_HALF, -Y_HALF, 0.0];
  const slabMax: Vec3 = [X_HALF, Y_HALF, DELTA_Z];

  describe('intersectRaySlab', () => {
    it('accurately intersects a ray looking straight down from above the slab', () => {
      // Camera at (0, 0, 10.0), looking down (0, 0, -1)
      const r0: Vec3 = [0.0, 0.0, 10.0];
      const dir: Vec3 = [0.0, 0.0, -1.0];

      const hit = intersectRaySlab(r0, dir, slabMin, slabMax);
      expect(hit).not.toBeNull();
      if (hit) {
        // Enters at z = DELTA_Z (t = 10.0 - 0.19 = 9.81)
        expect(hit.tNear).toBeCloseTo(9.81, 4);
        // Exits at z = 0.0 (t = 10.0)
        expect(hit.tFar).toBeCloseTo(10.0, 4);
      }
    });

    it('accurately intersects a ray looking at an oblique 45-degree angle', () => {
      // Camera at (0, -10.0, 10.0), dir normalized towards (0, 0, 0) -> (0, 1/sqrt(2), -1/sqrt(2))
      const invSqrt2 = 1.0 / Math.SQRT2;
      const r0: Vec3 = [0.0, -10.0, 10.0];
      const dir: Vec3 = [0.0, invSqrt2, -invSqrt2];

      const hit = intersectRaySlab(r0, dir, slabMin, slabMax);
      expect(hit).not.toBeNull();
      if (hit) {
        expect(hit.tNear).toBeGreaterThan(0.0);
        expect(hit.tFar).toBeGreaterThan(hit.tNear);
      }
    });

    it('accurately computes interval when camera is inside the slab', () => {
      // Camera at (0, 0, 0.095) - halfway up in the cloud slab
      const r0: Vec3 = [0.0, 0.0, 0.095];
      const dir: Vec3 = [0.0, 0.0, -1.0]; // Looking down at the ground

      const hit = intersectRaySlab(r0, dir, slabMin, slabMax);
      expect(hit).not.toBeNull();
      if (hit) {
        // Behind the ray is z = DELTA_Z, so tNear is negative (-0.095)
        expect(hit.tNear).toBeLessThan(0.0);
        // In front is z = 0, so tFar is positive (0.095)
        expect(hit.tFar).toBeCloseTo(0.095, 4);
      }

      // computePlanarTroposphericInterval clamps tStart to 0.0
      const interval = computePlanarTroposphericInterval(r0, dir, slabMin, slabMax);
      expect(interval).not.toBeNull();
      if (interval) {
        expect(interval.tStart).toBe(0.0);
        expect(interval.tEnd).toBeCloseTo(0.095, 4);
      }
    });

    it('returns null when the ray points away from the slab', () => {
      // Camera at (0, 0, 10.0), looking UP away from the slab (0, 0, 1)
      const r0: Vec3 = [0.0, 0.0, 10.0];
      const dir: Vec3 = [0.0, 0.0, 1.0];

      const hit = intersectRaySlab(r0, dir, slabMin, slabMax);
      expect(hit).toBeNull();

      const interval = computePlanarTroposphericInterval(r0, dir, slabMin, slabMax);
      expect(interval).toBeNull();
    });

    it('returns null when the ray misses the slab horizontally', () => {
      // Camera far to the right outside map bounds (X = 30.0, Z = 10.0), looking straight down
      const r0: Vec3 = [30.0, 0.0, 10.0];
      const dir: Vec3 = [0.0, 0.0, -1.0];

      const hit = intersectRaySlab(r0, dir, slabMin, slabMax);
      expect(hit).toBeNull();
    });

    it('protects against division by zero for axis-aligned parallel rays', () => {
      // Ray parallel to the Z plane: dir = (1, 0, 0)
      const r0: Vec3 = [-20.0, 0.0, 0.10];
      const dir: Vec3 = [1.0, 0.0, 0.0];

      const hit = intersectRaySlab(r0, dir, slabMin, slabMax);
      expect(hit).not.toBeNull();
      if (hit) {
        expect(hit.tNear).toBeCloseTo(20.0 - X_HALF, 3);
        expect(hit.tFar).toBeCloseTo(20.0 + X_HALF, 3);
      }
    });
  });

  describe('mapPlanarCoordinates', () => {
    it('correctly maps center of map sheet in Mode 0 (Equirectangular)', () => {
      const pos: Vec3 = [0.0, 0.0, 0.095]; // Mid-altitude at equator/prime meridian
      const coords = mapPlanarCoordinates(pos, RADIUS, DELTA_Z, 0);

      expect(coords.u).toBeCloseTo(0.5, 4);
      expect(coords.v).toBeCloseTo(0.5, 4);
      expect(coords.hNorm).toBeCloseTo(0.5, 4);
    });

    it('correctly maps extremes in Mode 0', () => {
      // Top-left corner: Longitude -pi*R, Latitude +0.5*pi*R, Ground Z = 0
      const posTopLeft: Vec3 = [-X_HALF, Y_HALF, 0.0];
      const coordsTL = mapPlanarCoordinates(posTopLeft, RADIUS, DELTA_Z, 0);

      expect(coordsTL.u).toBeCloseTo(0.0, 4);
      expect(coordsTL.v).toBeCloseTo(0.001, 3); // Clamped near 0.0
      expect(coordsTL.hNorm).toBe(0.0);

      // Bottom-right corner: Longitude +pi*R, Latitude -0.5*pi*R, Tropopause Z = DELTA_Z
      const posBottomRight: Vec3 = [X_HALF, -Y_HALF, DELTA_Z];
      const coordsBR = mapPlanarCoordinates(posBottomRight, RADIUS, DELTA_Z, 0);

      // u wraps at 1.0 -> fract(1.0) = 0.0 or close to 1.0
      expect(coordsBR.v).toBeCloseTo(0.999, 3);
      expect(coordsBR.hNorm).toBe(1.0);
    });

    it('correctly maps Mode 1 (Mercator) coordinates', () => {
      // Equator is y = 0
      const posEquator: Vec3 = [0.0, 0.0, 0.0];
      const coordsEq = mapPlanarCoordinates(posEquator, RADIUS, DELTA_Z, 1);
      expect(coordsEq.v).toBeCloseTo(0.5, 3);

      // Moderate northern latitude
      const posY: Vec3 = [0.0, 2.0, 0.0];
      const coordsY = mapPlanarCoordinates(posY, RADIUS, DELTA_Z, 1);
      expect(coordsY.v).toBeLessThan(0.5); // Northern hemisphere is v < 0.5
      expect(coordsY.v).toBeGreaterThan(0.0);

      // High northern latitude (+85 deg Mercator limit: y = ~3.12865 * RADIUS)
      const posHighNorth: Vec3 = [0.0, 3.12865 * RADIUS, 0.0];
      const coordsHN = mapPlanarCoordinates(posHighNorth, RADIUS, DELTA_Z, 1);
      expect(coordsHN.v).toBeLessThan(0.10);
      expect(coordsHN.v).toBeGreaterThan(0.001);

      // High southern latitude (-85 deg Mercator limit: y = ~ -3.12865 * RADIUS)
      const posHighSouth: Vec3 = [0.0, -3.12865 * RADIUS, 0.0];
      const coordsHS = mapPlanarCoordinates(posHighSouth, RADIUS, DELTA_Z, 1);
      expect(coordsHS.v).toBeGreaterThan(0.90);
      expect(coordsHS.v).toBeLessThan(0.999);
    });

    it('validates Mercator slab bounding box covers up to 3.13 * RADIUS without clipping', () => {
      const mercatorHalfH = 3.13 * RADIUS;
      const mercatorSlabMin: Vec3 = [-X_HALF, -mercatorHalfH, 0.0];
      const mercatorSlabMax: Vec3 = [X_HALF, mercatorHalfH, DELTA_Z];

      // Ray looking at high-latitude point (e.g. Alaska/Scandinavia at y = 14.0)
      const r0: Vec3 = [0.0, 14.0, 10.0];
      const dir: Vec3 = [0.0, 0.0, -1.0];
      const interval = computePlanarTroposphericInterval(r0, dir, mercatorSlabMin, mercatorSlabMax);
      expect(interval).not.toBeNull();
      if (interval) {
        expect(interval.tStart).toBeCloseTo(10.0 - DELTA_Z, 4);
        expect(interval.tEnd).toBeCloseTo(10.0, 4);
      }
    });
  });

  describe('computePlanarNoiseCoord', () => {
    it('applies isotropic horizontal aspect scaling (ny = v * freqHoriz * 0.5)', () => {
      const u = 0.5;
      const v = 0.5;
      const hNorm = 0.5;
      const freqHoriz = 32.0;
      const freqVert = 12.0;
      const timeDrift = 10.0;

      const coord = computePlanarNoiseCoord(u, v, hNorm, freqHoriz, freqVert, timeDrift);

      // nx = 0.5 * 32.0 + 10.0 * 0.10 = 16.0 + 1.0 = 17.0
      expect(coord[0]).toBeCloseTo(17.0, 4);
      // ny = 0.5 * (32.0 * 0.5) = 8.0
      expect(coord[1]).toBeCloseTo(8.0, 4);
      // nz = 0.5 * 12.0 + 10.0 * 0.05 = 6.0 + 0.5 = 6.5
      expect(coord[2]).toBeCloseTo(6.5, 4);
    });
  });

  describe('Terrain Depth Clamping Parity', () => {
    it('clips planar raymarch interval to terrain distance', () => {
      const r0: Vec3 = [0.0, 0.0, 10.0];
      const dir: Vec3 = [0.0, 0.0, -1.0];
      const interval = computePlanarTroposphericInterval(r0, dir, slabMin, slabMax);
      expect(interval).not.toBeNull();
      if (interval) {
        // Enters at tStart = 9.81, exits at tEnd = 10.0
        // Suppose terrain elevation is at z = 0.05 (distance t = 9.95)
        const tTerrain = 9.95;
        const clamped = clampRayIntervalToTerrain(interval.tStart, interval.tEnd, tTerrain);
        expect(clamped).not.toBeNull();
        if (clamped) {
          expect(clamped.tStart).toBeCloseTo(interval.tStart, 4);
          expect(clamped.tEnd).toBeCloseTo(9.95, 4);
        }
      }
    });

    it('discards interval if terrain is in front of the troposphere slab', () => {
      const interval: TroposphericInterval = { tStart: 9.81, tEnd: 10.0 };
      // Terrain closer than tStart (e.g. huge mountain peaking above slab, or foreground object)
      const tTerrain = 9.50;
      const clamped = clampRayIntervalToTerrain(interval.tStart, interval.tEnd, tTerrain);
      expect(clamped).toBeNull();
    });
  });

  // ==========================================================================
  // Suite: Closed-Form Analytical Inversion & WGSL Continuous Unwrapping
  // ==========================================================================
  describe('Closed-Form Analytical Inversion & WGSL Continuous Unwrapping', () => {
    it('invertMacroChart produces finite, continuous coordinates across intermediate unfurl', () => {
      const testPoints: Vec3[] = [
        [0.0, 0.0, 5.0],
        [2.5, 1.2, 4.0],
        [-3.0, -2.0, 3.5],
        [0.0, 4.0, 2.0],
        [1.0, -4.5, 1.5],
      ];

      const unfurls = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

      for (const p of testPoints) {
        for (const u of unfurls) {
          const inv = invertMacroChart(p, u, 5.0);
          expect(Number.isFinite(inv.lambda)).toBe(true);
          expect(Number.isFinite(inv.phi)).toBe(true);
          expect(Number.isFinite(inv.h)).toBe(true);
          expect(inv.phi).toBeGreaterThanOrEqual(-Math.PI * 0.5 - 1e-4);
          expect(inv.phi).toBeLessThanOrEqual(Math.PI * 0.5 + 1e-4);
        }
      }
    });

    it('volumetric_cloud.wgsl implements invertMacroChartWGSL and eliminates binary isPlanar branching', () => {
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
      expect(fs.existsSync(shaderPath)).toBe(true);
      const wgsl = fs.readFileSync(shaderPath, 'utf-8');

      // 1. Must define invertMacroChartWGSL
      expect(wgsl).toContain('fn invertMacroChartWGSL(pos: vec3<f32>, unfurl: f32, radius: f32) -> vec3<f32>');
      expect(wgsl).toContain('let s = max(0.0001, 1.0 - alphaEased);');
      expect(wgsl).toContain('let Cz = rPar * (s - 1.0 / sDiv);');
      expect(wgsl).toContain('let lambdaDev = atan2(px, dz) / sDiv;');

      // 2. sampleCloudDensity must invoke invertMacroChartWGSL
      expect(wgsl).toContain('let inv = invertMacroChartWGSL(p, unfurl, rInner);');
      expect(wgsl).toContain('let hNorm = clamp(inv.z / deltaR, 0.0, 1.0);');

      // 3. Must NOT have binary isPlanar = unfurl >= 0.50 branch in fs_main
      expect(wgsl).not.toContain('let isPlanar = unfurl >= 0.50;');
      expect(wgsl).not.toContain('if (isPlanar) {');
    });
  });
});

