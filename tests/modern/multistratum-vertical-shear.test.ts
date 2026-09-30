/**
 * Multi-Stratum Vertical Wind Shear Verification Suite (Milestone 2)
 *
 * Verifies that the low boundary stratus deck (0–2 km), mid altocumulus deck (2–6 km),
 * and high cirrus deck (6–12 km) are physically decoupled and advected by distinct
 * atmospheric wind fields:
 * - Low Stratus: WeatherNext 3 10m surface wind (u_10m)
 * - Mid Altocumulus: Linearly blended wind mix(u_10m, u_250hPa, 0.40)
 * - High Cirrus: NOAA GFS 250 hPa Jet Stream wind (u_250hPa)
 *
 * Covers:
 * 1. WGSL Static Shader Audits (Rule 4 uniform control flow & stratum velocity assignment)
 * 2. WebGPUEngine Bind Group Layout & Dynamic Synchronization (Rule 56)
 * 3. Real-Data Physical Shear Verification across Calibrated Perspectives (Views 1A/B and 2A/B)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Closed-form Riemannian exponential map on S² for CPU validation
function mapSphericalGeodesicUV(
  uv: [number, number],
  velocity: [number, number],
  dt: number,
  rEarth: number = 6371000.0
): [number, number] {
  const uArr = uv[0];
  const vArr = uv[1];
  const phiA = (0.5 - vArr) * Math.PI;

  const lambdaP = (velocity[0] * dt) / rEarth;
  const phiP = (velocity[1] * dt) / rEarth;

  const sigmaSq = lambdaP * lambdaP + phiP * phiP;
  const sigma = Math.sqrt(sigmaSq);

  let sincSigma = 1.0;
  if (sigma > 1e-4) {
    sincSigma = Math.sin(sigma) / sigma;
  } else {
    sincSigma = 1.0 - sigmaSq / 6.0;
  }

  const cosSigma = Math.cos(sigma);
  const sinPhiA = Math.sin(phiA);
  const cosPhiA = Math.cos(phiA);

  const sinPhiD = Math.max(-1.0, Math.min(1.0, sincSigma * phiP * cosPhiA + cosSigma * sinPhiA));
  const phiD = Math.asin(sinPhiD);

  const y = sincSigma * lambdaP;
  const x = cosSigma * cosPhiA - sincSigma * phiP * sinPhiA;
  const deltaLambda = Math.atan2(y, x);

  let uDep = (uArr + deltaLambda / (2.0 * Math.PI) + 1.0) % 1.0;
  if (uDep < 0.0) uDep += 1.0;
  const vDep = Math.max(0.0001, Math.min(0.9999, 0.5 - phiD / Math.PI));

  return [uDep, vDep];
}

// Float16 decoder helper for binary wind grids
function decodeFloat16(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  } else if (e === 0x1f) {
    return f ? NaN : (s ? -Infinity : Infinity);
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

describe('Milestone 2: Multi-Stratum Vertical Wind Shear Verification Suite', () => {
  describe('1. WGSL Shader Static Audit (cloud_shell.wgsl)', () => {
    const cloudShellPath = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
    const cloudShellWGSL = fs.readFileSync(cloudShellPath, 'utf8');

    it('M2-WGSL-01: Declares u_jetStreamTexture at @group(0) @binding(9)', () => {
      expect(cloudShellWGSL).toContain('@group(0) @binding(9) var u_jetStreamTexture: texture_2d<f32>;');
      // Preserves u_windTexture at binding 7 and u_windSampler at binding 8
      expect(cloudShellWGSL).toContain('@group(0) @binding(7) var u_windTexture: texture_2d<f32>;');
      expect(cloudShellWGSL).toContain('@group(0) @binding(8) var u_windSampler: sampler;');
    });

    it('M2-WGSL-02: Evaluates rawJetStream unconditionally at top of fs_main (Rule 4)', () => {
      const fsMainIdx = cloudShellWGSL.indexOf('@fragment');
      expect(fsMainIdx).toBeGreaterThan(0);

      const rawWindIdx = cloudShellWGSL.indexOf('let rawWind = textureSampleLevel(u_windTexture, u_windSampler, in.uv, 0.0).xy;', fsMainIdx);
      const rawJetStreamIdx = cloudShellWGSL.indexOf('let rawJetStream = textureSampleLevel(u_jetStreamTexture, u_windSampler, in.uv, 0.0).xy;', fsMainIdx);

      expect(rawWindIdx).toBeGreaterThan(fsMainIdx);
      expect(rawJetStreamIdx).toBeGreaterThan(rawWindIdx);

      // Verify unconditional execution: must occur strictly before any discard statements
      const firstDiscardIdx = cloudShellWGSL.indexOf('discard;', fsMainIdx);
      if (firstDiscardIdx > 0) {
        expect(rawWindIdx).toBeLessThan(firstDiscardIdx);
        expect(rawJetStreamIdx).toBeLessThan(firstDiscardIdx);
      }
    });

    it('M2-WGSL-03: Implements stratum velocity assignment with 0u, 1u (mix 0.40), and 2u', () => {
      expect(cloudShellWGSL).toContain('var stratumWind: vec2<f32>;');
      expect(cloudShellWGSL).toContain('if (layerIdx == 0u) {');
      expect(cloudShellWGSL).toContain('stratumWind = activeSurfaceWind;');
      expect(cloudShellWGSL).toContain('} else if (layerIdx == 1u) {');
      expect(cloudShellWGSL).toContain('stratumWind = mix(activeSurfaceWind, activeJetWind, 0.40);');
      expect(cloudShellWGSL).toContain('stratumWind = activeJetWind;');
      expect(cloudShellWGSL).toContain('let effectiveWind = stratumWind;');
    });

    it('M2-WGSL-04: Guarantees zero-drift stability regardless of stratum', () => {
      expect(cloudShellWGSL).toContain('let effectiveSpeed = select(baseDriftSpeed * 2500.0, 0.0, baseDriftSpeed <= 0.0001);');
    });
  });

  describe('2. WebGPUEngine Bind Group Layout & Synchronization (WebGPUEngine.ts)', () => {
    const engineSrcPath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
    const engineSrc = fs.readFileSync(engineSrcPath, 'utf8');

    it('M2-ENG-01: cloudBindGroupLayout includes binding 9 for u_jetStreamTexture', () => {
      const layoutIdx = engineSrc.indexOf("label: 'cloud_shell_bind_group_layout'");
      expect(layoutIdx).toBeGreaterThan(0);

      const layoutSnippet = engineSrc.slice(layoutIdx, layoutIdx + 1500);
      expect(layoutSnippet).toContain("{ binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } }");
      expect(layoutSnippet).toContain("{ binding: 8, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }");
      expect(layoutSnippet).toContain("{ binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } }");
    });

    it('M2-ENG-02: updateCloudBindGroups binds jetView at binding 9 across all 3 strata', () => {
      const updateCloudIdx = engineSrc.indexOf('public updateCloudBindGroups(): void');
      expect(updateCloudIdx).toBeGreaterThan(0);

      const snippet = engineSrc.slice(updateCloudIdx, updateCloudIdx + 4000);
      expect(snippet).toContain('const jetView = this.jetStreamTextureView || windView;');
      expect(snippet).toContain("label: 'cloud_bg_low'");
      expect(snippet).toContain('{ binding: 9, resource: jetView }');
      expect(snippet).toContain("label: 'cloud_bg_mid'");
      expect(snippet).toContain("label: 'cloud_bg_high'");
    });

    it('M2-ENG-03: loadJetStreamTexture synchronously calls updateCloudBindGroups (Rule 56)', () => {
      const loadJetIdx = engineSrc.indexOf('public async loadJetStreamTexture(');
      expect(loadJetIdx).toBeGreaterThan(0);

      const writeTexIdx = engineSrc.indexOf('this.device.queue.writeTexture(', loadJetIdx);
      const updateCloudBgIdx = engineSrc.indexOf('this.updateCloudBindGroups();', writeTexIdx);
      const catchIdx = engineSrc.indexOf('} catch {', writeTexIdx);

      expect(updateCloudBgIdx).toBeGreaterThan(writeTexIdx);
      expect(updateCloudBgIdx).toBeLessThan(catchIdx);
    });

    it('M2-CANV-01: WebGPUCanvas loads jet stream texture whenever showClouds is active', () => {
      const canvasSrcPath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const canvasSrc = fs.readFileSync(canvasSrcPath, 'utf8');

      expect(canvasSrc).toContain('if (hasJetStream || showClouds) {');
      expect(canvasSrc).toContain("engine.loadJetStreamTexture('/data/gfs-jetstream-latest.bin')");
    });
  });

  describe('3. Physical Vertical Wind Shear Validation with Real Data Assets', () => {
    it('M2-PHYS-01: Confirms NOAA GFS 250 hPa Jet Stream asset is intact and contains high-velocity winds (> 30 m/s)', () => {
      const jetPath = path.resolve(__dirname, '../../public/data/gfs-jetstream-latest.bin');
      expect(fs.existsSync(jetPath)).toBe(true);

      const buffer = fs.readFileSync(jetPath);
      const u16 = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);

      let maxSpeed = 0;
      let countOver30 = 0;
      const totalTexels = u16.length / 2;

      for (let i = 0; i < u16.length; i += 2) {
        const u = decodeFloat16(u16[i]);
        const v = decodeFloat16(u16[i + 1]);
        const speed = Math.sqrt(u * u + v * v);
        if (speed > maxSpeed) maxSpeed = speed;
        if (speed > 30.0) countOver30++;
      }

      // Peak jet stream speed should be > 50 m/s (approx 180 km/h)
      expect(maxSpeed).toBeGreaterThan(50.0);
      // Substantial portion of globe has jet stream winds > 30 m/s
      expect(countOver30 / totalTexels).toBeGreaterThan(0.08);
    });

    it('M2-PHYS-02: Location 2 (Cascades Arc: Views 2A & 2B) exhibits strong vertical shear and speed differential', () => {
      // Cascades: 45.0°N, 121.5°W -> lon = -121.5, lat = 45.0
      // In equirectangular grid [360x181]:
      const jetPath = path.resolve(__dirname, '../../public/data/gfs-jetstream-latest.bin');
      const buffer = fs.readFileSync(jetPath);
      const u16 = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);

      const W = 360;
      const H = 181;
      const x = Math.round(((-121.5 + 180.0) / 360.0) * (W - 1));
      const y = Math.round(((90.0 - 45.0) / 180.0) * (H - 1));
      const idx = (y * W + x) * 2;

      const uJet = decodeFloat16(u16[idx]);
      const vJet = decodeFloat16(u16[idx + 1]);
      const jetSpeed = Math.sqrt(uJet * uJet + vJet * vJet);

      // Low surface wind typically ~ 5 m/s in terrain valleys
      const surfaceSpeed = 5.0;

      // Assert high jet stream velocity (> 20 m/s) and differential speed ratio (> 2.5x)
      expect(jetSpeed).toBeGreaterThan(20.0);
      expect(jetSpeed / surfaceSpeed).toBeGreaterThan(2.5);

      // Verify geodesic departure separation between Low Stratus and High Cirrus over 1800 seconds (30 mins)
      const uvCenter: [number, number] = [(-121.5 + 180.0) / 360.0, (90.0 - 45.0) / 180.0];
      const depLow = mapSphericalGeodesicUV(uvCenter, [-surfaceSpeed, 0], 1800.0);
      const depHigh = mapSphericalGeodesicUV(uvCenter, [-uJet, -vJet], 1800.0);

      const dU = Math.abs(depHigh[0] - depLow[0]);
      const dV = Math.abs(depHigh[1] - depLow[1]);
      const separation = Math.sqrt(dU * dU + dV * dV);

      // High cirrus and low stratus depart to distinctly different spherical UV coordinates
      expect(separation).toBeGreaterThan(0.001);
    });

    it('M2-PHYS-03: Mid Altocumulus stratum is mathematically bounded between Low and High velocities', () => {
      const uSurface: [number, number] = [4.0, 2.0];
      const uJet: [number, number] = [42.0, -8.0];

      const uMid: [number, number] = [
        uSurface[0] * 0.60 + uJet[0] * 0.40,
        uSurface[1] * 0.60 + uJet[1] * 0.40,
      ];

      const speedLow = Math.hypot(uSurface[0], uSurface[1]);
      const speedMid = Math.hypot(uMid[0], uMid[1]);
      const speedHigh = Math.hypot(uJet[0], uJet[1]);

      expect(speedMid).toBeGreaterThan(speedLow);
      expect(speedMid).toBeLessThan(speedHigh);
    });
  });
});
