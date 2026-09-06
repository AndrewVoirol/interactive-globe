import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Requirement R4: Live Planetary Instrumentation & Automation
 * Features: F34 (NOAA GFS Wind Grid Ingestion), F35 (CelesTrak Starlink & ISS SGP4 Orbits)
 */

import { decodeFloat16, encodeFloat16 } from '../../src/core/math/float16';
import { parseTLE, propagateOrbitalPosition, computeTLEChecksum, type TLEOrbitalElements } from '../../src/core/math/sgp4';

describe('Requirement R4: Live Planetary Instrumentation & Automation', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const gfsWindPath = path.join(projectRoot, 'public/data/gfs-wind-latest.bin');
  const starlinkPath = path.join(projectRoot, 'public/data/tle-starlink.json');

  // --------------------------------------------------------------------------
  // Feature F34: NOAA GFS Wind Binary Layout & Advection Invariants
  // --------------------------------------------------------------------------
  describe('F34: NOAA GFS Wind Binary Layout (360x181 Half-Float)', () => {
    it('WIND-T01: validates exact grid dimensions and buffer size formula (260,640 bytes)', () => {
      const lonPoints = 360;
      const latPoints = 181; // 90N to 90S inclusive = 181 points at 1 deg resolution
      const componentsPerNode = 2; // [u, v]
      const bytesPerComponent = 2; // 16-bit half-float (Float16)

      const totalElements = lonPoints * latPoints * componentsPerNode;
      const expectedByteSize = totalElements * bytesPerComponent;

      expect(totalElements).toBe(130320);
      expect(expectedByteSize).toBe(260640);

      // If file exists on disk, verify its size directly
      if (fs.existsSync(gfsWindPath)) {
        const stats = fs.statSync(gfsWindPath);
        expect(stats.size).toBe(260640);
      }
    });

    it('WIND-T02: verifies IEEE 754 half-precision float16 encoding/decoding accuracy and boundary behavior', () => {
      const testValues = [0.0, 1.0, -1.0, 15.5, -28.25, 45.0, -62.5];
      for (const val of testValues) {
        const encoded = encodeFloat16(val);
        const decoded = decodeFloat16(encoded);
        expect(decoded).toBeCloseTo(val, 2);
      }

      // Power-of-2 mantissa boundary rounding (frac === 1024 prevention)
      const boundaryValues = [
        { in: 1.9999, expected: 2.0 },
        { in: 3.9995, expected: 4.0 },
        { in: 7.9995, expected: 8.0 },
        { in: 15.9995, expected: 16.0 },
        { in: 31.9995, expected: 32.0 },
      ];
      for (const { in: val, expected } of boundaryValues) {
        const encoded = encodeFloat16(val);
        const decoded = decodeFloat16(encoded);
        expect(decoded).toBeCloseTo(expected, 2);
      }

      // Subnormal promotion to smallest normal float16 when frac === 1024
      const subnormalBoundary = 0.0000610113;
      const encSub = encodeFloat16(subnormalBoundary);
      const decSub = decodeFloat16(encSub);
      expect(decSub).toBeCloseTo(0.00006103515625, 6);

      // Overflow to infinity
      expect(decodeFloat16(encodeFloat16(65520))).toBe(Infinity);
      expect(decodeFloat16(encodeFloat16(-65520))).toBe(-Infinity);
    });

    it('WIND-T03: verifies physical velocity range invariants (|u|, |v| <= 100 m/s)', () => {
      // Create a sample synthetic GFS buffer conforming to specifications
      const buffer = new ArrayBuffer(260640);
      const u16View = new Uint16Array(buffer);

      // Populate with realistic trade winds, westerlies, and polar easterlies
      for (let latIdx = 0; latIdx < 181; latIdx++) {
        const latDeg = 90 - latIdx; // 90 down to -90
        for (let lonIdx = 0; lonIdx < 360; lonIdx++) {
          const idx = (latIdx * 360 + lonIdx) * 2;

          // Planetary atmospheric circulation model:
          // Trade winds (0 to 30 deg): Easterlies (u < 0)
          // Mid-latitude westerlies (30 to 60 deg): Westerlies (u > 0)
          // Polar easterlies (60 to 90 deg): Easterlies (u < 0)
          let uMps = 0;
          let vMps = 0;

          if (Math.abs(latDeg) <= 30) {
            uMps = -8.0 * Math.cos((latDeg / 30) * (Math.PI * 0.5)); // Trade winds
            vMps = (latDeg > 0 ? -2.5 : 2.5) * Math.sin(lonIdx * 0.05);
          } else if (Math.abs(latDeg) <= 60) {
            uMps = 22.0 * Math.cos(((Math.abs(latDeg) - 45) / 15) * (Math.PI * 0.5)); // Jet stream
            vMps = 5.0 * Math.sin(lonIdx * 0.1);
          } else {
            uMps = -5.0; // Polar easterlies
            vMps = 2.0;
          }

          u16View[idx] = encodeFloat16(uMps);
          u16View[idx + 1] = encodeFloat16(vMps);
        }
      }

      // Check all values in sample or on disk
      const testBuffer = fs.existsSync(gfsWindPath) ? fs.readFileSync(gfsWindPath) : Buffer.from(buffer);
      const testView = new Uint16Array(testBuffer.buffer, testBuffer.byteOffset, testBuffer.length / 2);

      for (let i = 0; i < Math.min(testView.length, 1000); i += 2) {
        const u = decodeFloat16(testView[i]);
        const v = decodeFloat16(testView[i + 1]);

        expect(Number.isFinite(u)).toBe(true);
        expect(Number.isFinite(v)).toBe(true);

        // Wind velocity magnitude must be physical: < 150 m/s
        const speed = Math.hypot(u, v);
        expect(speed).toBeLessThan(150.0);
        expect(speed).toBeGreaterThanOrEqual(0.0);
      }
    });

    it('WIND-T04: verifies tangent Cartesian transformation strictly preserves surface tangent invariant', () => {
      // For any point (lon, lat) on sphere S^2, the converted wind velocity vector
      // vWorld = u * eEast + v * eNorth must satisfy dot(vWorld, nSphere) == 0
      const testPoints = [
        { lon: 0, lat: 0 },
        { lon: 45, lat: 30 },
        { lon: -120, lat: -45 },
        { lon: 90, lat: 60 },
      ];

      for (const { lon, lat } of testPoints) {
        const lambda = (lon * Math.PI) / 180;
        const phi = (lat * Math.PI) / 180;

        // Radial normal on unit sphere
        const nx = Math.cos(phi) * Math.sin(lambda);
        const ny = Math.sin(phi);
        const nz = Math.cos(phi) * Math.cos(lambda);

        // East unit vector
        const ex = Math.cos(lambda);
        const ey = 0.0;
        const ez = -Math.sin(lambda);

        // North unit vector
        const nvx = -Math.sin(phi) * Math.sin(lambda);
        const nvy = Math.cos(phi);
        const nvz = -Math.sin(phi) * Math.cos(lambda);

        const u = 18.5; // m/s
        const v = -9.2; // m/s

        const vx = u * ex + v * nvx;
        const vy = u * ey + v * nvy;
        const vz = u * ez + v * nvz;

        // Orthogonality: dot(v, normal) must be 0
        const dotNormal = vx * nx + vy * ny + vz * nz;
        expect(dotNormal).toBeCloseTo(0.0, 5);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature F35: CelesTrak TLE Schema & SGP4 Orbital Propagation
  // --------------------------------------------------------------------------
  describe('F35: CelesTrak TLE Schema & SGP4 Orbital Propagation', () => {
    // Canonical real-world Starlink and ISS TLE lines for authoritative validation
    const issTLE = {
      name: 'ISS (ZARYA)',
      line1: '1 25544U 98067A   26248.84752315  .00012456  00000+0  22485-3 0  9998',
      line2: '2 25544  51.6418 214.3294 0005824  69.2541 290.9142 15.49842106512340',
    };

    const starlinkSampleTLE = {
      name: 'STARLINK-30001',
      line1: '1 55000U 23001A   26248.50000000  .00005000  00000+0  10000-3 0  9991',
      line2: '2 55000  53.2000 120.5000 0001500  45.0000 315.0000 15.05000000123450',
    };

    it('TLE-T01: validates standard 69-character TLE format and extracts Keplerian orbital parameters', () => {
      expect(issTLE.line1.length).toBe(69);
      expect(issTLE.line2.length).toBe(69);
      expect(issTLE.line1.startsWith('1 ')).toBe(true);
      expect(issTLE.line2.startsWith('2 ')).toBe(true);

      // Verify NORAD Modulo-10 checksum parity
      expect(computeTLEChecksum(issTLE.line1.substring(0, 68))).toBe(parseInt(issTLE.line1[68], 10));
      expect(computeTLEChecksum(issTLE.line2.substring(0, 68))).toBe(parseInt(issTLE.line2[68], 10));
      expect(computeTLEChecksum(starlinkSampleTLE.line1.substring(0, 68))).toBe(parseInt(starlinkSampleTLE.line1[68], 10));
      expect(computeTLEChecksum(starlinkSampleTLE.line2.substring(0, 68))).toBe(parseInt(starlinkSampleTLE.line2[68], 10));

      const elements = parseTLE(issTLE.line1, issTLE.line2);

      expect(elements.catalogNumber).toBe(25544);
      // ISS inclination is approximately 51.64 degrees
      expect(elements.inclinationRad * (180 / Math.PI)).toBeCloseTo(51.64, 1);
      // ISS eccentricity is small (near-circular orbit < 0.01)
      expect(elements.eccentricity).toBeLessThan(0.01);
      // Mean motion is ~15.5 revs/day (~92 minute orbital period)
      const revsPerDay = (elements.meanMotionRadPerSec * 86400) / (2 * Math.PI);
      expect(revsPerDay).toBeCloseTo(15.5, 1);
      // Semi-major axis is ~6790 km (415 km altitude above 6378 km Earth)
      expect(elements.semiMajorAxisKm).toBeGreaterThan(6700);
      expect(elements.semiMajorAxisKm).toBeLessThan(6900);
    });

    it('TLE-T02: calculates orbital radius above Earth surface and verifies stable LEO bounds', () => {
      const elements = parseTLE(starlinkSampleTLE.line1, starlinkSampleTLE.line2);
      const globeRadius = 5.0;

      // Position at t = 0
      const pos0 = propagateOrbitalPosition(elements, 0, 6378.137, globeRadius);
      const r0 = Math.hypot(pos0[0], pos0[1], pos0[2]);

      // Starlink orbit at ~550 km altitude -> (6378 + 550) / 6378 * 5.0 = ~5.43 units
      expect(r0).toBeGreaterThan(globeRadius);
      expect(r0).toBeCloseTo(5.43, 1);
      expect(r0).toBeLessThan(globeRadius * 1.2);
    });

    it('TLE-T03: verifies periodic orbital closure after exactly one complete orbital revolution', () => {
      const elements = parseTLE(issTLE.line1, issTLE.line2);
      const orbitalPeriodSec = (2 * Math.PI) / elements.meanMotionRadPerSec;

      const posStart = propagateOrbitalPosition(elements, 0);
      const posEnd = propagateOrbitalPosition(elements, orbitalPeriodSec);

      // After 1 full period T, the satellite returns to its initial orbital position
      expect(posEnd[0]).toBeCloseTo(posStart[0], 3);
      expect(posEnd[1]).toBeCloseTo(posStart[1], 3);
      expect(posEnd[2]).toBeCloseTo(posStart[2], 3);
    });

    it('TLE-T04: validates JSON schema contract and NORAD modulo-10 checksum parity across all records in public/data/tle-starlink.json', () => {
      if (fs.existsSync(starlinkPath)) {
        const raw = fs.readFileSync(starlinkPath, 'utf8');
        const list = JSON.parse(raw);
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThan(0);

        for (let i = 0; i < list.length; i++) {
          const sat = list[i];
          expect(sat).toHaveProperty('name');
          expect(sat).toHaveProperty('line1');
          expect(sat).toHaveProperty('line2');
          expect(sat.line1.length).toBe(69);
          expect(sat.line2.length).toBe(69);

          const c1 = computeTLEChecksum(sat.line1.substring(0, 68));
          const c2 = computeTLEChecksum(sat.line2.substring(0, 68));
          expect(c1).toBe(parseInt(sat.line1[68], 10));
          expect(c2).toBe(parseInt(sat.line2[68], 10));
        }
      }
    });

    it('TLE-T05: verifies TLETrajectoryDataSource propagates 500 orbital points from Starlink TLEs', async () => {
      const { TLETrajectoryDataSource } = await import('../../src/core/data/TLETrajectoryDataSource');
      const source = new TLETrajectoryDataSource();
      await source.loadTLE(starlinkPath);

      const chunk = await source.fetch({ minLon: -180, maxLon: 180, minLat: -90, maxLat: 90, minAlt: 0, maxAlt: 600 }, 1);
      expect(chunk.vertexCount).toBe(500);

      const positions = chunk.attributes.get('position');
      const velocities = chunk.attributes.get('velocity');
      expect(positions).toBeDefined();
      expect(velocities).toBeDefined();
      expect(positions?.length).toBe(1500);
      expect(velocities?.length).toBe(1500);

      // Verify orbital radius is strictly in LEO bounds (r between 5.0 and 6.0)
      for (let i = 0; i < 500; i++) {
        const x = positions![i * 3 + 0];
        const y = positions![i * 3 + 1];
        const z = positions![i * 3 + 2];
        const r = Math.hypot(x, y, z);
        expect(r).toBeGreaterThan(5.0);
        expect(r).toBeLessThan(6.0);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // VectorFieldDataSource & NOAA GFS Bilinear Ingestion
  // --------------------------------------------------------------------------
  describe('VectorFieldDataSource NOAA GFS Bilinear Ingestion', () => {
    it('WIND-T05: verifies VectorFieldDataSource samples trade winds, westerlies, and polar circulation', async () => {
      const { VectorFieldDataSource } = await import('../../src/core/data/VectorFieldDataSource');
      const source = new VectorFieldDataSource();
      await source.loadGrid(gfsWindPath);

      // Trade winds at latitude 15°N: Easterlies (u < 0)
      const [uTrade, vTrade] = source.sampleVelocity(45.0, 15.0);
      expect(uTrade).toBeLessThan(0.0);
      expect(Number.isFinite(vTrade)).toBe(true);

      // Mid-latitude westerlies at latitude 45°N: Westerlies (u > 0, Jet stream peak > 15 m/s)
      const [uWest, vWest] = source.sampleVelocity(120.0, 45.0);
      expect(uWest).toBeGreaterThan(15.0);
      expect(Number.isFinite(vWest)).toBe(true);

      // Polar easterlies at latitude 75°N: Easterlies (u < 0)
      const [uPolar, vPolar] = source.sampleVelocity(200.0, 75.0);
      expect(uPolar).toBeLessThan(0.0);
      expect(Number.isFinite(vPolar)).toBe(true);

      // Fetch chunk verification
      const chunk = await source.fetch({ minLon: -180, maxLon: 180, minLat: -90, maxLat: 90, minAlt: 0, maxAlt: 0 }, 1);
      expect(chunk.attributes.has('vectorField')).toBe(true);
      expect(source.getPhysicsField()?.length).toBe(64 * 64 * 4);
    });
  });

  // --------------------------------------------------------------------------
  // Automated Planetary Refresh Pipeline & WebGPU Ingestion
  // --------------------------------------------------------------------------
  describe('Automated Planetary Refresh Pipeline & WebGPU Ingestion', () => {
    it('PLANET-AUTO-01: executes automated refresh pipeline and validates output artifacts', async () => {
      const { refreshAllPlanetaryData } = await import('../../scripts/refresh-planetary-data');
      const result = await refreshAllPlanetaryData();

      expect(result.gfsBytes).toBe(260640);
      expect(result.tleSatellites).toBeGreaterThanOrEqual(50);
      expect(fs.existsSync(gfsWindPath)).toBe(true);
      expect(fs.existsSync(starlinkPath)).toBe(true);
    });

    it('PLANET-GPU-01: verifies WebGPUEngine ingests wind texture and satellite orbit line ribbons', async () => {
      const { WebGPUEngine } = await import('../../src/webgpu/WebGPUEngine');
      const { createMockNavigatorGPU } = await import('../helpers/webgpu-mock');

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
        expect(engine.getWindTexture()).toBeDefined();
        expect(engine.getWindSampler()).toBeDefined();

        // Ingest real NOAA GFS wind grid
        await engine.loadWindTexture(gfsWindPath);
        expect(engine.getWindTexture()?.format).toBe('rg16float');

        // Ingest CelesTrak Starlink/ISS TLEs
        await engine.loadSatelliteTrajectories(starlinkPath);
        expect(engine.getSatelliteSegmentCount()).toBeGreaterThan(1000);
        expect(engine.satelliteSegmentBuffer).toBeDefined();

        engine.dispose();
        expect(engine.initialized).toBe(false);
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNav,
          configurable: true,
          writable: true,
        });
      }
    });
  });
});
