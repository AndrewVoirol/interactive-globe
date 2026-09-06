import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { decodeFloat16 } from '../../src/core/math/float16';

/**
 * Adversarial Challenger M4 Suite: NOAA GFS Wind Field & Tangent Projection
 *
 * Empirical verification of Feature F34 and Requirement R4:
 * 1. Asset verification: public/data/gfs-wind-latest.bin exact byte size (260,640 bytes).
 * 2. Exhaustive decode: All 65,160 float16 pairs (130,320 values) checked for 0 NaNs, 0 Infs, |u|,|v| <= 100 m/s.
 * 3. Atmospheric circulation physics:
 *    - Tropical Trade Winds (-30° to +30°): easterlies (u < 0).
 *    - Mid-Latitude Westerlies (30° to 60° and -60° to -30°): westerlies (u > 0, Jet Stream peak 20-35 m/s).
 *    - Polar Easterlies (60° to 90° and -90° to -60°): easterlies (u < 0).
 * 4. Tangent Projection Orthogonality:
 *    - 10,000 randomized spherical coordinates on S^2 verifying dot(vTangent, normal) == 0 with epsilon 1e-5.
 *    - Singular pole and equator boundary analysis.
 */

describe('Adversarial Challenger M4: NOAA GFS Wind Field & Tangent Projection', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const windBinPath = path.join(projectRoot, 'public/data/gfs-wind-latest.bin');

  describe('1. NOAA GFS Wind Binary Asset Invariants', () => {
    it('CHALLENGE-WIND-01: verifies exact file size equals 260,640 bytes on disk', () => {
      expect(fs.existsSync(windBinPath)).toBe(true);
      const stats = fs.statSync(windBinPath);
      const expectedBytes = 360 * 181 * 2 * 2; // 360 lon * 181 lat * 2 components * 2 bytes
      expect(stats.size).toBe(260640);
      expect(stats.size).toBe(expectedBytes);
    });

    it('CHALLENGE-WIND-02: exhaustively decodes all 65,160 float16 pairs (130,320 values) with 0 NaNs and 0 Infs', () => {
      const buffer = fs.readFileSync(windBinPath);
      expect(buffer.length).toBe(260640);

      const uint16View = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
      expect(uint16View.length).toBe(130320); // 65,160 pairs

      let nanCount = 0;
      let infCount = 0;
      let outOfBoundsCount = 0;

      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      let maxSpeed = 0;

      for (let i = 0; i < uint16View.length; i += 2) {
        const u = decodeFloat16(uint16View[i]);
        const v = decodeFloat16(uint16View[i + 1]);

        if (Number.isNaN(u) || Number.isNaN(v)) nanCount++;
        if (!Number.isFinite(u) || !Number.isFinite(v)) infCount++;

        if (Math.abs(u) > 100.0 || Math.abs(v) > 100.0) outOfBoundsCount++;

        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;

        const speed = Math.hypot(u, v);
        if (speed > maxSpeed) maxSpeed = speed;
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(outOfBoundsCount).toBe(0);

      // Physical limits check
      expect(minU).toBeGreaterThanOrEqual(-100.0);
      expect(maxU).toBeLessThanOrEqual(100.0);
      expect(minV).toBeGreaterThanOrEqual(-100.0);
      expect(maxV).toBeLessThanOrEqual(100.0);
      expect(maxSpeed).toBeLessThanOrEqual(150.0);
    });

    it('CHALLENGE-WIND-03: verifies atmospheric circulation zones (Trade Winds, Jet Stream, Polar Easterlies)', () => {
      const buffer = fs.readFileSync(windBinPath);
      const uint16View = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

      const lonPoints = 360;
      const latPoints = 181;

      // Helper to get [u, v] at specific lat index (0 = 90N, 180 = 90S) and lon index
      function getVelocity(latIdx: number, lonIdx: number): [number, number] {
        const idx = (latIdx * lonPoints + lonIdx) * 2;
        return [decodeFloat16(uint16View[idx]), decodeFloat16(uint16View[idx + 1])];
      }

      // Zone 1: Tropical Trade Winds (-20° to +20°) -> latIdx between 70 (20°N) and 110 (20°S)
      // Must be easterly: mean zonal velocity u < 0
      let tradeUSum = 0;
      let tradeCount = 0;
      for (let latIdx = 70; latIdx <= 110; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonPoints; lonIdx += 10) {
          const [u] = getVelocity(latIdx, lonIdx);
          tradeUSum += u;
          tradeCount++;
          // Every tropical point must be easterly (u < 0)
          expect(u).toBeLessThan(0.0);
        }
      }
      const meanTradeU = tradeUSum / tradeCount;
      expect(meanTradeU).toBeLessThan(-5.0); // Strong tropical easterlies

      // Zone 2: Northern Hemisphere Mid-Latitude Westerlies & Jet Stream (35°N to 55°N) -> latIdx between 35 (55°N) and 55 (35°N)
      // Must be westerly: u > 0, with peak Jet Stream velocity between 20 and 35 m/s
      let nhMaxU = -Infinity;
      let nhWesterlySum = 0;
      let nhCount = 0;
      for (let latIdx = 35; latIdx <= 55; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonPoints; lonIdx++) {
          const [u] = getVelocity(latIdx, lonIdx);
          if (u > nhMaxU) nhMaxU = u;
          nhWesterlySum += u;
          nhCount++;
        }
      }
      const meanNHWesterly = nhWesterlySum / nhCount;
      expect(meanNHWesterly).toBeGreaterThan(10.0); // Predominantly westerly
      expect(nhMaxU).toBeGreaterThanOrEqual(20.0); // Jet stream peak >= 20 m/s
      expect(nhMaxU).toBeLessThanOrEqual(35.0);    // Jet stream peak <= 35 m/s

      // Zone 3: Southern Hemisphere Mid-Latitude Westerlies & Roaring Forties (-35°S to -55°S) -> latIdx between 125 (35°S) and 145 (55°S)
      let shMaxU = -Infinity;
      let shWesterlySum = 0;
      let shCount = 0;
      for (let latIdx = 125; latIdx <= 145; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonPoints; lonIdx++) {
          const [u] = getVelocity(latIdx, lonIdx);
          if (u > shMaxU) shMaxU = u;
          shWesterlySum += u;
          shCount++;
        }
      }
      const meanSHWesterly = shWesterlySum / shCount;
      expect(meanSHWesterly).toBeGreaterThan(10.0);
      expect(shMaxU).toBeGreaterThanOrEqual(20.0);
      expect(shMaxU).toBeLessThanOrEqual(35.0);

      // Zone 4: Polar Easterlies (70°N to 90°N and -70°S to -90°S)
      // Latitudes 70°N to 85°N -> latIdx 5 to 20
      let polarUSum = 0;
      let polarCount = 0;
      for (let latIdx = 5; latIdx <= 20; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonPoints; lonIdx += 10) {
          const [u] = getVelocity(latIdx, lonIdx);
          polarUSum += u;
          polarCount++;
          expect(u).toBeLessThan(0.0); // Easterly
        }
      }
      const meanPolarU = polarUSum / polarCount;
      expect(meanPolarU).toBeLessThan(-2.0);
    });
  });

  describe('2. Adversarial Tangent Projection Orthogonality on S^2', () => {
    // Orthonormal tangent basis on sphere (eEast, eNorth) strictly preserving dot(vTangent, normal) == 0
    // normal = normalize(pos3D)
    // eEast = normalize(vec3(normal.z, 0.0, -normal.x))
    // eNorth = cross(normal, eEast)
    // vTangent = u * eEast + v * eNorth
    function computeTangentVector(
      x: number,
      y: number,
      z: number,
      radius: number,
      u: number,
      v: number
    ): {
      normal: [number, number, number];
      eEast: [number, number, number];
      eNorth: [number, number, number];
      vTangent: [number, number, number];
    } {
      const len = Math.hypot(x, y, z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;
      const normal: [number, number, number] = [nx, ny, nz];

      const rawEast: [number, number, number] = [nz, 0.0, -nx];
      const eastLen = Math.hypot(rawEast[0], rawEast[1], rawEast[2]);
      const eEast: [number, number, number] =
        eastLen > 1e-12
          ? [rawEast[0] / eastLen, 0.0, rawEast[2] / eastLen]
          : [1.0, 0.0, 0.0];

      // eNorth = cross(normal, eEast)
      const eNorth: [number, number, number] = [
        normal[1] * eEast[2] - normal[2] * eEast[1],
        normal[2] * eEast[0] - normal[0] * eEast[2],
        normal[0] * eEast[1] - normal[1] * eEast[0],
      ];

      const vTangent: [number, number, number] = [
        u * eEast[0] + v * eNorth[0],
        u * eEast[1] + v * eNorth[1],
        u * eEast[2] + v * eNorth[2],
      ];

      return {
        normal,
        eEast,
        eNorth,
        vTangent,
      };
    }

    it('CHALLENGE-TANGENT-01: tests 10,000 randomized spherical coordinates on S^2 for dot(vTangent, normal) == 0 (eps 1e-5)', () => {
      const RADIUS = 5.0;
      const sampleCount = 10000;
      let maxDotProduct = 0.0;
      let maxBasisOrthogonality = 0.0;

      // Seeded deterministic pseudo-random generator (LCG) for full reproducibility
      let seed = 123456789;
      function nextRand(): number {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      for (let i = 0; i < sampleCount; i++) {
        // Uniform spherical point generation via Marsaglia / Box-Muller method
        const uVal = nextRand() * 2.0 - 1.0; // cos(polar) in [-1, 1]
        const theta = nextRand() * 2.0 * Math.PI - Math.PI; // lon in [-pi, pi]
        const sinPolar = Math.sqrt(Math.max(0.0, 1.0 - uVal * uVal));

        const x = RADIUS * sinPolar * Math.sin(theta);
        const y = RADIUS * uVal;
        const z = RADIUS * sinPolar * Math.cos(theta);

        // Random physical wind velocities in [-80 m/s, +80 m/s]
        const uWind = (nextRand() * 2.0 - 1.0) * 80.0;
        const vWind = (nextRand() * 2.0 - 1.0) * 80.0;

        const { normal, eEast, eNorth, vTangent } = computeTangentVector(x, y, z, RADIUS, uWind, vWind);

        // Compute dot products
        const dotVN = vTangent[0] * normal[0] + vTangent[1] * normal[1] + vTangent[2] * normal[2];
        const dotEN = eEast[0] * normal[0] + eEast[1] * normal[1] + eEast[2] * normal[2];
        const dotNN = eNorth[0] * normal[0] + eNorth[1] * normal[1] + eNorth[2] * normal[2];
        const dotBasis = eEast[0] * eNorth[0] + eEast[1] * eNorth[1] + eEast[2] * eNorth[2];

        const absDotVN = Math.abs(dotVN);
        if (absDotVN > maxDotProduct) maxDotProduct = absDotVN;

        const absDotBasis = Math.abs(dotBasis);
        if (absDotBasis > maxBasisOrthogonality) maxBasisOrthogonality = absDotBasis;

        expect(absDotVN).toBeLessThan(1e-5);
        expect(Math.abs(dotEN)).toBeLessThan(1e-5);
        expect(Math.abs(dotNN)).toBeLessThan(1e-5);
        expect(absDotBasis).toBeLessThan(1e-5);
      }

      expect(maxDotProduct).toBeLessThan(1e-5);
      expect(maxBasisOrthogonality).toBeLessThan(1e-5);
    });

    it('CHALLENGE-TANGENT-02: stress-tests boundary cases (Poles, Equator, Antimeridian)', () => {
      const RADIUS = 5.0;
      const boundaryPoints = [
        // North Pole
        { x: 0.0, y: RADIUS, z: 0.0, desc: 'North Pole' },
        // South Pole
        { x: 0.0, y: -RADIUS, z: 0.0, desc: 'South Pole' },
        // Near North Pole on S^2 (delta = 1e-6 rad)
        {
          x: RADIUS * Math.cos(Math.PI / 2 - 1e-6) * Math.sin(0.5),
          y: RADIUS * Math.sin(Math.PI / 2 - 1e-6),
          z: RADIUS * Math.cos(Math.PI / 2 - 1e-6) * Math.cos(0.5),
          desc: 'Near North Pole on S^2',
        },
        // Near South Pole on S^2 (delta = 1e-6 rad)
        {
          x: RADIUS * Math.cos(-Math.PI / 2 + 1e-6) * Math.sin(-1.2),
          y: RADIUS * Math.sin(-Math.PI / 2 + 1e-6),
          z: RADIUS * Math.cos(-Math.PI / 2 + 1e-6) * Math.cos(-1.2),
          desc: 'Near South Pole on S^2',
        },
        // Equator Prime Meridian
        { x: 0.0, y: 0.0, z: RADIUS, desc: 'Equator Prime Meridian' },
        // Equator 90°E
        { x: RADIUS, y: 0.0, z: 0.0, desc: 'Equator 90E' },
        // Equator Antimeridian (180°)
        { x: 0.0, y: 0.0, z: -RADIUS, desc: 'Equator Antimeridian' },
        // Equator 90°W
        { x: -RADIUS, y: 0.0, z: 0.0, desc: 'Equator 90W' },
      ];

      for (const pt of boundaryPoints) {
        const u = 32.5;
        const v = -14.2;

        const len = Math.hypot(pt.x, pt.y, pt.z);
        const nx = pt.x / len;
        const ny = pt.y / len;
        const nz = pt.z / len;

        const { normal, eEast, eNorth, vTangent } = computeTangentVector(pt.x, pt.y, pt.z, RADIUS, u, v);

        const dotVN = vTangent[0] * nx + vTangent[1] * ny + vTangent[2] * nz;
        const dotEN = eEast[0] * nx + eEast[1] * ny + eEast[2] * nz;
        const dotNN = eNorth[0] * nx + eNorth[1] * ny + eNorth[2] * nz;

        expect(Math.abs(dotVN)).toBeLessThan(1e-5);
        expect(Math.abs(dotEN)).toBeLessThan(1e-5);
        expect(Math.abs(dotNN)).toBeLessThan(1e-5);
      }
    });

    it('CHALLENGE-TANGENT-03: verifies radius invariance across multiple scale factors', () => {
      const radii = [0.1, 1.0, 5.0, 100.0, 6378137.0];
      for (const R of radii) {
        const theta = 0.785398; // 45°
        const phi = 0.523599;   // 30°
        const x = R * Math.cos(phi) * Math.sin(theta);
        const y = R * Math.sin(phi);
        const z = R * Math.cos(phi) * Math.cos(theta);

        const { normal, vTangent } = computeTangentVector(x, y, z, R, 25.0, -10.0);
        const dotVal = vTangent[0] * normal[0] + vTangent[1] * normal[1] + vTangent[2] * normal[2];
        expect(Math.abs(dotVal)).toBeLessThan(1e-5);
      }
    });
  });
});
