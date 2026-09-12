/**
 * tests/tier2/semi-lagrangian-advection.test.ts
 *
 * Tier 2 Verification Suite:
 * Riemannian Exponential Map & Spherical Geodesic Semi-Lagrangian Advection on S²
 *
 * Invariants Tested:
 * - Invariant §3: Unconditional WGSL uniform control flow sampling
 * - Invariant §18: Spherical metric arc-length evaluation on S²
 * - Invariant §20: 16-byte WGSL struct alignment & buffer discipline
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

import {
  mapSphericalGeodesicUV,
  EARTH_RADIUS_M,
  INV_EARTH_RADIUS_M,
  PI_F32,
  INV_PI_F32,
  INV_TWO_PI_F32,
} from '../../src/core/physics/SemiLagrangianAdvection';

export { mapSphericalGeodesicUV };

describe('Tier 2: Semi-Lagrangian Advection on S² Manifold', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  it('T2-ADV-01: Equator 30 m/s eastward wind for 1 hour produces UV displacement approx 0.00270', () => {
    const arrivalUV: [number, number] = [0.5, 0.5]; // Lat 0, Lon 0
    const wind: [number, number] = [30.0, 0.0]; // 30 m/s eastward
    const deltaT = 3600.0; // 1 hour

    const departureUV = mapSphericalGeodesicUV(arrivalUV, wind, deltaT);
    const deltaU = departureUV[0] - arrivalUV[0];

    // Theoretical: 30 * 3600 / (2 * pi * 6371000) = 108000 / 40030173.59 = 0.00269796... approx 0.00270
    expect(deltaU).toBeCloseTo(0.00270, 4);
    // Equator eastward wind stays on equator
    expect(departureUV[1]).toBeCloseTo(0.5, 5);
  });

  it('T2-ADV-02: 85°N geodesic curvature curves off latitude parallel (S² corrected Δλ ≈ 11.01° vs flat 11.14°, lat dips to ≈ 84.91°)', () => {
    const arrivalLatDeg = 85.0;
    const arrivalUV: [number, number] = [0.5, 0.5 - arrivalLatDeg / 180.0]; // y = 0.02777778
    const wind: [number, number] = [30.0, 0.0]; // 30 m/s east
    const deltaT = 3600.0; // 1 hour

    const departureUV = mapSphericalGeodesicUV(arrivalUV, wind, deltaT);

    // Departure latitude dips off the 85° parallel due to great-circle curvature
    const departureLatDeg = (0.5 - departureUV[1]) * 180.0;
    expect(departureLatDeg).toBeCloseTo(84.91, 1);

    // S² corrected longitude shift:
    const deltaLonDeg = (departureUV[0] - arrivalUV[0]) * 360.0;
    expect(deltaLonDeg).toBeCloseTo(11.01, 1);

    // Flat-earth approximation would overestimate longitude shift:
    // dLon = (30 * 3600) / (R * cos(85°)) * (180 / pi) ≈ 11.144°
    const flatLonDeg = ((30.0 * 3600.0) / (EARTH_RADIUS_M * Math.cos(arrivalLatDeg * Math.PI / 180.0))) * (180.0 / Math.PI);
    expect(flatLonDeg).toBeCloseTo(11.14, 1);
    expect(Math.abs(deltaLonDeg - flatLonDeg)).toBeGreaterThan(0.1);
  });

  it('T2-ADV-03: Zero wind condition acts as mathematical identity operator [arrivalUV] === [departureUV]', () => {
    const testPoints: [number, number][] = [
      [0.0, 0.5],
      [0.25, 0.1],
      [0.5, 0.5],
      [0.75, 0.9],
      [0.999, 0.5],
      [0.123, 0.789],
    ];

    for (const pt of testPoints) {
      const dep = mapSphericalGeodesicUV(pt, [0.0, 0.0], 3600.0);
      expect(dep[0]).toBeCloseTo(pt[0], 5);
      expect(dep[1]).toBeCloseTo(pt[1], 5);
    }
  });

  it('T2-ADV-04: Exact pole coordinates (90°N, 90°S) do not produce NaN or singular values', () => {
    const northPole: [number, number] = [0.5, 0.0];
    const southPole: [number, number] = [0.5, 1.0];
    const wind: [number, number] = [35.0, -15.0];
    const deltaT = 1800.0;

    const depNorth = mapSphericalGeodesicUV(northPole, wind, deltaT);
    expect(Number.isNaN(depNorth[0])).toBe(false);
    expect(Number.isNaN(depNorth[1])).toBe(false);
    expect(Number.isFinite(depNorth[0])).toBe(true);
    expect(Number.isFinite(depNorth[1])).toBe(true);
    expect(depNorth[0]).toBeGreaterThanOrEqual(0.0);
    expect(depNorth[0]).toBeLessThanOrEqual(1.0);
    expect(depNorth[1]).toBeGreaterThanOrEqual(0.0001);
    expect(depNorth[1]).toBeLessThanOrEqual(0.9999);

    const depSouth = mapSphericalGeodesicUV(southPole, wind, deltaT);
    expect(Number.isNaN(depSouth[0])).toBe(false);
    expect(Number.isNaN(depSouth[1])).toBe(false);
    expect(Number.isFinite(depSouth[0])).toBe(true);
    expect(Number.isFinite(depSouth[1])).toBe(true);
    expect(depSouth[0]).toBeGreaterThanOrEqual(0.0);
    expect(depSouth[0]).toBeLessThanOrEqual(1.0);
    expect(depSouth[1]).toBeGreaterThanOrEqual(0.0001);
    expect(depSouth[1]).toBeLessThanOrEqual(0.9999);
  });

  it('T2-ADV-05: 50,000-trial Monte Carlo fuzzing over arbitrary coordinates, winds [-100, 100] m/s, deltaT [0, 86400]s guarantees zero NaN and valid UV range', () => {
    const trials = 50_000;
    let nanCount = 0;
    let outOfBoundsCount = 0;

    for (let i = 0; i < trials; i++) {
      const u = Math.random();
      const v = Math.random();
      const wx = (Math.random() * 2 - 1) * 100.0;
      const wy = (Math.random() * 2 - 1) * 100.0;
      const dt = Math.random() * 86400.0;

      const [resU, resV] = mapSphericalGeodesicUV([u, v], [wx, wy], dt);

      if (Number.isNaN(resU) || Number.isNaN(resV) || !Number.isFinite(resU) || !Number.isFinite(resV)) {
        nanCount++;
      }
      if (resU < 0.0 || resU > 1.0 || resV < 0.0001 || resV > 0.9999) {
        outOfBoundsCount++;
      }
    }

    expect(nanCount).toBe(0);
    expect(outOfBoundsCount).toBe(0);
  });

  it('T2-ADV-06: Static WGSL inspection verifies mapSphericalGeodesicUV, u_scrubTau at offset 304, and unconditional sampling before discard', () => {
    // 1. mapSphericalGeodesicUV defined before fs_main
    const funcIdx = shaderSrc.indexOf('fn mapSphericalGeodesicUV(');
    const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main');
    expect(funcIdx).toBeGreaterThan(0);
    expect(fsMainIdx).toBeGreaterThan(0);
    expect(funcIdx).toBeLessThan(fsMainIdx);

    // 2. Constants defined
    expect(shaderSrc).toContain('const EARTH_RADIUS_M: f32 = 6371000.0;');
    expect(shaderSrc).toContain('const INV_EARTH_RADIUS_M: f32 = 1.5696123e-7;');

    // 3. u_scrubTau declared at offset 304 (float 76)
    expect(shaderSrc).toMatch(/u_scrubTau\s*:\s*f32\s*,\s*\/\/\s*offset\s*304\s*\(float\s*76\)/);
    expect(shaderSrc).toMatch(/(?:u_advectionActive|_padScrub0)\s*:\s*f32/);
    expect(shaderSrc).toMatch(/_padScrub1\s*:\s*f32/);
    expect(shaderSrc).toMatch(/_padScrub2\s*:\s*f32/);

    // Alignment math: 304 is divisible by 16 (19 * 16), padded to 320 (20 * 16)
    expect(304 % 16).toBe(0);
    expect(320 % 16).toBe(0);

    // 4. Unconditional sampling in fs_main before discard
    const fsMainBody = shaderSrc.slice(fsMainIdx);
    const discardIdx = fsMainBody.indexOf('discard;');
    const samplePrecipIdx = fsMainBody.indexOf('textureSampleLevel(u_precipTexture');
    const scrubTauIdx = fsMainBody.indexOf('sim.u_scrubTau');

    expect(discardIdx).toBeGreaterThan(0);
    expect(samplePrecipIdx).toBeGreaterThan(0);
    expect(scrubTauIdx).toBeGreaterThan(0);
    expect(samplePrecipIdx).toBeLessThan(discardIdx);
    expect(scrubTauIdx).toBeLessThan(discardIdx);
  });

  it('T2-ADV-07: Runtime uniform verification in WebGPUEngine packs scrubTau into crustFloats[76]', () => {
    const engine = new WebGPUEngine();
    const crustFloats = (engine as any).crustFloats;
    expect(crustFloats.buffer.byteLength).toBe(320);

    // Setter and getter
    engine.scrubTau = 0.72;
    expect(engine.scrubTau).toBeCloseTo(0.72, 5);

    // updateAtmosphereUniforms updates scrubTau
    engine.updateAtmosphereUniforms({ scrubTau: 0.88 });
    expect(engine.scrubTau).toBeCloseTo(0.88, 5);

    // Mock GPU writeBuffer to test updateUniforms
    const writeBufferSpy = vi.fn();
    (engine as any).isInitialized = true;
    (engine as any).crustUniformBuffer = { dummy: true };
    (engine as any).simUniformBuffer = { dummy: true };
    (engine as any).device = { queue: { writeBuffer: writeBufferSpy } };
    (engine as any).context = { canvas: { width: 1920, height: 1080 } };

    (engine as any).updateUniforms({
      unfurl: 0.0,
      mode: 0,
      time: 1.0,
      scrubTau: 0.45,
    });

    expect(crustFloats[76]).toBeCloseTo(0.45, 5);
    expect(crustFloats[77]).toBe(0.0);
    expect(crustFloats[78]).toBe(0.0);
    expect(crustFloats[79]).toBe(0.0);

    // Verify that subsequent frame render with camera (where params.scrubTau is omitted)
    // uploads the full 320-byte buffer and preserves scrubTau
    engine.scrubTau = 0.65;
    writeBufferSpy.mockClear();
    (engine as any).updateUniforms({
      unfurl: 0.0,
      mode: 0,
      time: 2.0,
      camera: { position: { x: 0, y: 0, z: 10 } },
    });
    expect(crustFloats[76]).toBeCloseTo(0.65, 5);
    const crustCall = writeBufferSpy.mock.calls.find((c: any[]) => c[0] === (engine as any).crustUniformBuffer);
    expect(crustCall).toBeDefined();
    expect(crustCall[2].byteLength).toBe(320);
  });
});
