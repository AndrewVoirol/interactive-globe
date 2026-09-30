// ============================================================================
// File: tests/modern/spherical-geodesic-wind.test.ts
// Milestone: Milestone 1 (True Spherical Geodesic Advection on S²)
// Authoritative Specifications:
//   - cloud_strata_wind_advection_master_roadmap.md §3.1, §4 (Milestone 1)
//   - SHADERS_SPEC_LEDGER.md §5
// Invariants:
//   - §3: Unconditional Uniform Control Flow (Rule 4)
//   - §20: Zero-GC Per-Frame Buffer Discipline (Rule 26)
//   - §46: Anti-Cheating Production Source Verification
//   - §54: Headless Camera Invariant (window.__GO)
//   - §55: Centered Continental ROI Optical Flow Protocol
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import cloudShellWGSL from '../../src/webgpu/shaders/cloud_shell.wgsl?raw';

// Exact CPU reference implementation of mapSphericalGeodesicUV from cloud_shell.wgsl
const INV_EARTH_RADIUS_M = 1.5696123e-7;
const INV_PI = 0.31830988618379067;
const INV_TWO_PI = 0.15915494309189535;

function mapSphericalGeodesicUV(
  arrivalUV: [number, number],
  windVelMps: [number, number],
  deltaTSeconds: number
): [number, number] {
  const lam_p = windVelMps[0] * (INV_EARTH_RADIUS_M * deltaTSeconds);
  const phi_p = windVelMps[1] * (INV_EARTH_RADIUS_M * deltaTSeconds);
  const sigma_sq = lam_p * lam_p + phi_p * phi_p;
  if (sigma_sq < 1e-12) {
    return [arrivalUV[0], arrivalUV[1]];
  }
  const phi_a = (0.5 - arrivalUV[1]) * Math.PI;
  const cos_phi_a = Math.cos(phi_a);
  const sin_phi_a = Math.sin(phi_a);
  const sigma = Math.sqrt(sigma_sq);
  const sinc = sigma > 1e-4 ? Math.sin(sigma) / Math.max(sigma, 1e-7) : 1.0 - sigma_sq * (1.0 / 6.0);
  const cos_sigma = Math.cos(sigma);
  const c_lam = sinc * lam_p;
  const c_phi = sinc * phi_p;
  const sin_phi_d = Math.max(-1.0, Math.min(1.0, c_phi * cos_phi_a + cos_sigma * sin_phi_a));
  const phi_d = Math.asin(sin_phi_d);
  const y = c_lam;
  const x = cos_sigma * cos_phi_a - c_phi * sin_phi_a;
  const delta_lambda = Math.atan2(y, x);

  let uv_x = (arrivalUV[0] + delta_lambda * INV_TWO_PI + 1.0) % 1.0;
  if (uv_x < 0) uv_x += 1.0;
  const uv_y = Math.max(0.0001, Math.min(0.9999, 0.5 - phi_d * INV_PI));
  return [uv_x, uv_y];
}

// Convert Equirectangular UV to 3D Cartesian coordinates on unit sphere S²
function uvToSphere(uv: [number, number]): [number, number, number] {
  const lon = (uv[0] - 0.5) * 2.0 * Math.PI;
  const lat = (0.5 - uv[1]) * Math.PI;
  return [
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon),
  ];
}

// Great-circle arc distance on unit sphere S²
function greatCircleDistance(p1: [number, number, number], p2: [number, number, number]): number {
  const dot = Math.max(-1.0, Math.min(1.0, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]));
  return Math.acos(dot);
}

describe('Milestone 1: True Spherical Geodesic Advection on S²', () => {

  describe('1. Closed-Form Exponential Map & Mathematical Singularity Tests', () => {
    it('M1-MATH-01: Zero velocity or zero deltaT is an exact identity mapping', () => {
      const uvs: [number, number][] = [
        [0.5, 0.5], // Equator, prime meridian
        [0.2, 0.3], // Mid-latitudes
        [0.8, 0.8], // Southern ocean
        [0.5, 0.001], // Near North Pole
        [0.5, 0.999], // Near South Pole
      ];

      for (const uv of uvs) {
        const resZeroDt = mapSphericalGeodesicUV(uv, [25.0, -15.0], 0.0);
        expect(resZeroDt[0]).toBeCloseTo(uv[0], 6);
        expect(resZeroDt[1]).toBeCloseTo(uv[1], 6);

        const resZeroVel = mapSphericalGeodesicUV(uv, [0.0, 0.0], 3600.0);
        expect(resZeroVel[0]).toBeCloseTo(uv[0], 6);
        expect(resZeroVel[1]).toBeCloseTo(uv[1], 6);
      }
    });

    it('M1-MATH-02: Preserves metric geodesic arc distance across 10,000 Monte Carlo trials', () => {
      // 10,000 randomized points and velocity vectors
      const TRIALS = 10000;
      let maxError = 0;

      for (let i = 0; i < TRIALS; i++) {
        // Random UV (excluding extreme singularities within 0.01 of poles)
        const u = Math.random();
        const v = 0.05 + Math.random() * 0.90;
        const uv: [number, number] = [u, v];

        // Random wind speed [0..80 m/s] and direction
        const speed = Math.random() * 80.0;
        const angle = Math.random() * 2.0 * Math.PI;
        const wind: [number, number] = [speed * Math.cos(angle), speed * Math.sin(angle)];

        // Delta t up to 4 hours (14400s)
        const dt = (Math.random() - 0.5) * 14400.0;

        const advectedUV = mapSphericalGeodesicUV(uv, wind, dt);

        const pArrival = uvToSphere(uv);
        const pDeparted = uvToSphere(advectedUV);

        const measuredArc = greatCircleDistance(pArrival, pDeparted);
        const theoreticalArc = Math.abs(speed * dt * INV_EARTH_RADIUS_M);

        const error = Math.abs(measuredArc - theoreticalArc);
        if (error > maxError) maxError = error;

        // Geodesic distance must match theoretical arc length within numerical precision
        expect(error).toBeLessThan(1e-4);
      }
      expect(maxError).toBeLessThan(1e-4);
    });

    it('M1-MATH-03: Seamlessly handles 180° antimeridian wrapping without discontinuity', () => {
      // Point at 179.9°E (u ≈ 0.9997), blowing eastward
      const uvNearEdge: [number, number] = [0.9997, 0.5];
      const windEast: [number, number] = [40.0, 0.0];
      const dt = 3600.0; // 1 hour at 40 m/s = 144 km ≈ 1.3° displacement

      const advected = mapSphericalGeodesicUV(uvNearEdge, windEast, dt);
      // Must wrap smoothly to western hemisphere (u in [0.0, 0.02])
      expect(advected[0]).toBeGreaterThanOrEqual(0.0);
      expect(advected[0]).toBeLessThan(0.02);
      expect(advected[1]).toBeCloseTo(0.5, 4);
    });

    it('M1-MATH-04: High polar stability at +/-89.9° latitude without NaN or infinities', () => {
      const northPoleUV: [number, number] = [0.5, 0.0005]; // ~89.9°N
      const southPoleUV: [number, number] = [0.5, 0.9995]; // ~89.9°S
      const wind: [number, number] = [30.0, 20.0];

      const resNorth = mapSphericalGeodesicUV(northPoleUV, wind, 1800.0);
      expect(Number.isFinite(resNorth[0])).toBe(true);
      expect(Number.isFinite(resNorth[1])).toBe(true);
      expect(resNorth[1]).toBeGreaterThanOrEqual(0.0001);
      expect(resNorth[1]).toBeLessThanOrEqual(0.9999);

      const resSouth = mapSphericalGeodesicUV(southPoleUV, wind, 1800.0);
      expect(Number.isFinite(resSouth[0])).toBe(true);
      expect(Number.isFinite(resSouth[1])).toBe(true);
      expect(resSouth[1]).toBeGreaterThanOrEqual(0.0001);
      expect(resSouth[1]).toBeLessThanOrEqual(0.9999);
    });
  });

  describe('2. WGSL Shader Static Audit (cloud_shell.wgsl)', () => {
    it('M1-WGSL-01: Contains closed-form mapSphericalGeodesicUV with Riemannian exponential map', () => {
      expect(cloudShellWGSL).toContain('fn mapSphericalGeodesicUV(');
      expect(cloudShellWGSL).toContain('let lam_p = windVelMps.x * (INV_EARTH_RADIUS_M * deltaTSeconds);');
      expect(cloudShellWGSL).toContain('let phi_p = windVelMps.y * (INV_EARTH_RADIUS_M * deltaTSeconds);');
      expect(cloudShellWGSL).toContain('let sin_phi_d = clamp(c_phi * cos_phi_a + cos_sigma * sin_phi_a, -1.0, 1.0);');
      expect(cloudShellWGSL).toContain('let delta_lambda = atan2(y, x);');
    });

    it('M1-WGSL-02: Evaluates rawWind unconditionally at top of fs_main before discards (Rule 4)', () => {
      const fsMainIdx = cloudShellWGSL.indexOf('fn fs_main(in: VertexOutput)');
      const rawWindIdx = cloudShellWGSL.indexOf('let rawWind = textureSampleLevel(u_windTexture, u_windSampler, in.uv, 0.0).xy;', fsMainIdx);
      const firstDiscardIdx = cloudShellWGSL.indexOf('discard;', fsMainIdx);

      expect(rawWindIdx).toBeGreaterThan(fsMainIdx);
      expect(rawWindIdx).toBeLessThan(firstDiscardIdx);
    });

    it('M1-WGSL-03: Implements dual-phase cyclic blending with T_CYCLE = 16.0s', () => {
      expect(cloudShellWGSL).toContain('const T_CYCLE: f32 = 16.0;');
      expect(cloudShellWGSL).toContain('let tNorm = cloud.u_time / T_CYCLE;');
      expect(cloudShellWGSL).toContain('let phase0 = fract(tNorm);');
      expect(cloudShellWGSL).toContain('let phase1 = fract(tNorm + 0.5);');
      expect(cloudShellWGSL).toContain('let sampleUV = mapSphericalGeodesicUV(in.uv, -effectiveWind, dt0);');
      expect(cloudShellWGSL).toContain('let sampleUV1 = mapSphericalGeodesicUV(in.uv, -effectiveWind, dt1);');
      expect(cloudShellWGSL).toContain('let blendWeight = 2.0 * abs(phase0 - 0.5);');
      expect(cloudShellWGSL).toContain('let rawCloud = mix(c0, c1, blendWeight);');
    });

    it('M1-WGSL-04: Guarantees zero-drift invariant when baseDriftSpeed <= 0.0001', () => {
      expect(cloudShellWGSL).toContain('let effectiveSpeed = select(baseDriftSpeed * 2500.0, 0.0, baseDriftSpeed <= 0.0001);');
    });
  });

  describe('3. WebGPUEngine Bind Group Wiring & Zero-Dropping Synchronization', () => {
    it('M1-ENG-01: loadWindTexture calls this.updateCloudBindGroups() on texture creation', () => {
      const engineSrcPath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const engineSrc = fs.readFileSync(engineSrcPath, 'utf8');

      const loadWindIdx = engineSrc.indexOf('public async loadWindTexture(urlOrBuffer: string | ArrayBuffer');
      expect(loadWindIdx).toBeGreaterThan(0);

      const writeTexIdx = engineSrc.indexOf('this.device.queue.writeTexture(', loadWindIdx);
      const updateCloudBgIdx = engineSrc.indexOf('this.updateCloudBindGroups();', writeTexIdx);
      const catchIdx = engineSrc.indexOf('} catch {', writeTexIdx);

      expect(updateCloudBgIdx).toBeGreaterThan(writeTexIdx);
      expect(updateCloudBgIdx).toBeLessThan(catchIdx);
    });

    it('M1-ENG-02: updateCloudBindGroups binds windView at binding 7', () => {
      const engineSrcPath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const engineSrc = fs.readFileSync(engineSrcPath, 'utf8');

      const updateCloudIdx = engineSrc.indexOf('public updateCloudBindGroups(): void');
      expect(updateCloudIdx).toBeGreaterThan(0);

      const binding7Snippet = engineSrc.slice(updateCloudIdx, updateCloudIdx + 2000);
      expect(binding7Snippet).toContain('binding: 7, resource: windView');
      expect(binding7Snippet).toContain('binding: 8, resource: windSamp');
    });
  });

  describe('4. Authoritative Benchmark Perspectives & window.__GO Registration (Roadmap §2.2)', () => {
    it('M1-CAM-01: WebGPUCanvas registers window.__GO with all 4 calibrated benchmark views', () => {
      const canvasSrcPath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const canvasSrc = fs.readFileSync(canvasSrcPath, 'utf8');

      expect(canvasSrc).toContain('(window as any).__GO = {');
      // View 1A: South America Synoptic Nadir (-61°W, -15°S, R=7.8, pitch=0, hdg=0)
      expect(canvasSrc).toContain('loc1_synoptic: () => (window as any).__INDICATRIX_CAMERA__?.setObliqueView(-61.0, -15.0, 7.8, 0.0, 0.0)');
      // View 1B: Andes Spine Oblique (-68°W, -18°S, R=6.8, pitch=32, hdg=345)
      expect(canvasSrc).toContain('loc1_oblique:  () => (window as any).__INDICATRIX_CAMERA__?.setObliqueView(-68.0, -18.0, 6.8, 32.0, 345.0)');
      // View 2A: PNW Synoptic Nadir (-122°W, 46.5°N, R=6.8, pitch=0, hdg=0)
      expect(canvasSrc).toContain('loc2_synoptic: () => (window as any).__INDICATRIX_CAMERA__?.setObliqueView(-122.0, 46.5, 6.8, 0.0, 0.0)');
      // View 2B: Cascades Oblique (-121.5°W, 45.0°N, R=6.8, pitch=30, hdg=345)
      expect(canvasSrc).toContain('loc2_oblique:  () => (window as any).__INDICATRIX_CAMERA__?.setObliqueView(-121.5, 45.0, 6.8, 30.0, 345.0)');
    });

    it('M1-CAM-02: DevToolsAPI declares __GO interface on Window', () => {
      const devToolsSrcPath = path.resolve(__dirname, '../../src/core/DevToolsAPI.ts');
      const devToolsSrc = fs.readFileSync(devToolsSrcPath, 'utf8');

      expect(devToolsSrc).toContain('__GO?: {');
      expect(devToolsSrc).toContain('loc1_synoptic: () => void;');
      expect(devToolsSrc).toContain('loc1_oblique: () => void;');
      expect(devToolsSrc).toContain('loc2_synoptic: () => void;');
      expect(devToolsSrc).toContain('loc2_oblique: () => void;');
    });
  });
});
