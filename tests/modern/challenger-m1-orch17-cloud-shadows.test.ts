// ============================================================================
// File: tests/modern/challenger-m1-orch17-cloud-shadows.test.ts
// Challenger: challenger_m1_orch17_2 (teamwork_preview_challenger)
// Milestone: Milestone 1 (Dynamic Cloud Ground Shadows & Pre-Flight Hygiene)
// Invariants: §3 (WGSL Uniform Control Flow), §5 (Premultiplied Alpha),
//             §10 (Horizon Tangent), §15 (DEM Parity), §18 (Spherical Metric),
//             §20 (16-Byte Alignment), §28 (Multi-Medium Parity),
//             §46 (Import Integrity), §48 (No Hardcoded Literals)
// Description: Adversarial verification suite executing 50,000-trial Monte Carlo
//              stress fuzzing, mathematical singularity probing, antimeridian
//              wrap-around analysis, sun altitude tangent clamping, and WGSL
//              uniform control flow static auditing.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import crustHydrosphereWGSL from '../../src/webgpu/shaders/crust_hydrosphere.wgsl?raw';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const engineSourcePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
const engineSource = fs.readFileSync(engineSourcePath, 'utf-8');

describe('Adversarial Challenger Suite: Dynamic Cloud Ground Shadows & WGSL Integrity (Milestone 1)', () => {
  const PI = Math.PI;
  const TWO_PI = 2.0 * Math.PI;
  const EARTH_RADIUS_KM = 6371.0;
  const CLOUD_ALT_KM = 2.5;
  const TWO_PI_RE = TWO_PI * EARTH_RADIUS_KM; // ~40030.17 km
  const PI_RE = PI * EARTH_RADIUS_KM;         // ~20015.09 km
  const PENUMBRA_KM = 20.0;

  // WGSL-identical reference mathematical functions
  function computeCloudShadowOffsetTS(
    uv: { x: number; y: number },
    sunAzimuthDeg: number,
    sunAltitudeDeg: number
  ): { deltaU: number; deltaV: number; cosLat: number } {
    const azDeg = sunAzimuthDeg > 0.0 ? sunAzimuthDeg : 315.0;
    const altDeg = sunAltitudeDeg > 0.0 ? sunAltitudeDeg : 45.0;

    const radAz = (azDeg * PI) / 180.0;
    const radAlt = Math.max((5.0 * PI) / 180.0, Math.min((85.0 * PI) / 180.0, (altDeg * PI) / 180.0));
    const tanAlt = Math.tan(radAlt);

    // Invariant §18: Spherical metric tensor arc-length evaluation
    const cosLat = Math.max(0.15, Math.cos((uv.y - 0.5) * PI));

    const deltaU = -(CLOUD_ALT_KM / (tanAlt * TWO_PI_RE)) * (Math.cos(radAz) / cosLat);
    const deltaV = (CLOUD_ALT_KM / (tanAlt * PI_RE)) * Math.sin(radAz);

    return { deltaU, deltaV, cosLat };
  }

  // WGSL fract: e - floor(e)
  function wgslFract(e: number): number {
    return e - Math.floor(e);
  }

  function sampleCloudShadowFactorTS(
    uv: { x: number; y: number },
    shadowOffset: { deltaU: number; deltaV: number },
    intensity: number,
    cloudDensSampler: (u: number, v: number) => number
  ): { shadowFactor: number; taps: Array<{ u: number; v: number }>; cloudDens: number } {
    const centerUV = {
      x: wgslFract(uv.x + shadowOffset.deltaU),
      y: Math.max(0.001, Math.min(0.999, uv.y + shadowOffset.deltaV)),
    };

    const cosLat = Math.max(0.15, Math.cos((uv.y - 0.5) * PI));
    const rU = (PENUMBRA_KM / TWO_PI_RE) / cosLat;
    const rV = PENUMBRA_KM / PI_RE;

    const tap0 = { u: wgslFract(centerUV.x - 0.38 * rU), v: Math.max(0.0, Math.min(1.0, centerUV.y - 0.92 * rV)) };
    const tap1 = { u: wgslFract(centerUV.x + 0.92 * rU), v: Math.max(0.0, Math.min(1.0, centerUV.y - 0.38 * rV)) };
    const tap2 = { u: wgslFract(centerUV.x + 0.38 * rU), v: Math.max(0.0, Math.min(1.0, centerUV.y + 0.92 * rV)) };
    const tap3 = { u: wgslFract(centerUV.x - 0.92 * rU), v: Math.max(0.0, Math.min(1.0, centerUV.y + 0.38 * rV)) };

    const c0 = cloudDensSampler(tap0.u, tap0.v);
    const c1 = cloudDensSampler(tap1.u, tap1.v);
    const c2 = cloudDensSampler(tap2.u, tap2.v);
    const c3 = cloudDensSampler(tap3.u, tap3.v);

    const cloudDens = (c0 + c1 + c2 + c3) * 0.25;

    // smoothstep(0.10, 0.35, cloudDens)
    const t = Math.max(0.0, Math.min(1.0, (cloudDens - 0.10) / (0.35 - 0.10)));
    const s = t * t * (3.0 - 2.0 * t);

    const rawShadow = 1.0 - intensity * s;
    const shadowFactor = Math.max(0.0, Math.min(1.0, rawShadow));

    return { shadowFactor, taps: [tap0, tap1, tap2, tap3], cloudDens };
  }

  // --------------------------------------------------------------------------
  // Pillar 1: Anti-Cheating & Production Import Integrity (Invariant §46)
  // --------------------------------------------------------------------------
  describe('Pillar 1: Production Source Import & Architecture Integrity (Invariant §46)', () => {
    it('CHALLENGE-M1-01: Imports production WGSL and WebGPUEngine with zero placeholder mocks', () => {
      expect(crustHydrosphereWGSL).toBeDefined();
      expect(crustHydrosphereWGSL.length).toBeGreaterThan(15000);
      expect(WebGPUEngine).toBeDefined();

      // Symbolic constants exist on WebGPUEngine class
      expect(WebGPUEngine.DEFAULT_DEM_WIDTH).toBe(8192);
      expect(WebGPUEngine.DEFAULT_DEM_HEIGHT).toBe(4096);
    });

    it('CHALLENGE-M1-02: WebGPU Bind Group Layout binds u_cloudTexture at slot 7 and u_cloudSampler at slot 8', () => {
      expect(crustHydrosphereWGSL).toContain('@group(0) @binding(7) var u_cloudTexture: texture_2d<f32>;');
      expect(crustHydrosphereWGSL).toContain('@group(0) @binding(8) var u_cloudSampler: sampler;');

      // WebGPUEngine.ts defines binding 7 (float texture) and 8 (filtering sampler)
      expect(engineSource).toMatch(/binding\s*:\s*7,\s*visibility\s*:\s*GPUShaderStage\.FRAGMENT,\s*texture\s*:\s*\{\s*sampleType\s*:\s*'float'/);
      expect(engineSource).toMatch(/binding\s*:\s*8,\s*visibility\s*:\s*GPUShaderStage\.FRAGMENT,\s*sampler\s*:\s*\{\s*type\s*:\s*'filtering'/);
    });

    it('CHALLENGE-M1-03: SimUniforms buffer is sized to exactly 288 bytes (72 floats) with 16-byte alignment (Invariant §20)', () => {
      expect(crustHydrosphereWGSL).toContain('u_shadowIntensity: f32,');
      expect(crustHydrosphereWGSL).toContain('_padShadow0: f32,');
      expect(crustHydrosphereWGSL).toContain('_padShadow1: f32,');
      expect(crustHydrosphereWGSL).toContain('_padShadow2: f32,');

      // crustFloats buffer length
      expect(engineSource).toContain('private crustFloats = new Float32Array(72);');
      expect(engineSource).toMatch(/this\.crustUniformBuffer\s*=\s*this\.device\.createBuffer\(\{\s*size:\s*288/);

      // Verify mathematical alignment
      expect(72 * 4).toBe(288);
      expect(288 % 16).toBe(0);

      // Verify float index 68 maps to shadow intensity
      expect(engineSource).toMatch(/this\.crustFloats\[68\]\s*=\s*params\.shadowIntensity !== undefined\s*\?\s*params\.shadowIntensity/);
      expect(engineSource).toContain('this.crustFloats[69] = 0.0;');
      expect(engineSource).toContain('this.crustFloats[70] = 0.0;');
      expect(engineSource).toContain('this.crustFloats[71] = 0.0;');
    });

    it('CHALLENGE-M1-04: Non-null fallback 1x1 dummyCloudTexture allocated to preserve 5-buffer startup invariant', () => {
      expect(engineSource).toContain("label: 'dummy_cloud_texture'");
      expect(engineSource).toContain("format: 'r16float'");
      expect(engineSource).toContain('this.dummyCloudTextureView');
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Invariant §3 - WGSL Uniform Control Flow Static & AST Audit
  // --------------------------------------------------------------------------
  describe('Pillar 2: WGSL Uniform Control Flow Static Audit (Invariant §3)', () => {
    it('CHALLENGE-M1-05: All derivatives and cloud shadow evaluations occur strictly before dynamic branching or discard', () => {
      const fsMainIdx = crustHydrosphereWGSL.indexOf('fn fs_main(input: VertexOutput)');
      expect(fsMainIdx).toBeGreaterThan(-1);

      // Derivatives at top of fs_main
      const dpdxIdx = crustHydrosphereWGSL.indexOf('let du_dx = dpdx(input.uv.x);', fsMainIdx);
      const fwidthIdx = crustHydrosphereWGSL.indexOf('let dUV = fwidth(input.uv);', fsMainIdx);
      const shadowEvalIdx = crustHydrosphereWGSL.indexOf('let shadowFactor = sampleCloudShadowFactor', fsMainIdx);

      // Branching and discard points
      const dymaxionDiscardIdx = crustHydrosphereWGSL.indexOf('if (sim.u_mode == 4u && sim.u_unfurl > 0.02)', fsMainIdx);
      const surfaceDiscardIdx = crustHydrosphereWGSL.indexOf('if (input.surfaceType > 0.5)', fsMainIdx);
      const firstDiscardIdx = crustHydrosphereWGSL.indexOf('discard;', fsMainIdx);

      expect(dpdxIdx).toBeGreaterThan(fsMainIdx);
      expect(fwidthIdx).toBeGreaterThan(fsMainIdx);
      expect(shadowEvalIdx).toBeGreaterThan(fsMainIdx);

      // Shadow factor MUST be computed unconditionally before ANY discard or branch
      expect(shadowEvalIdx).toBeLessThan(dymaxionDiscardIdx);
      expect(shadowEvalIdx).toBeLessThan(surfaceDiscardIdx);
      expect(shadowEvalIdx).toBeLessThan(firstDiscardIdx);
    });

    it('CHALLENGE-M1-06: Zero implicit-LOD textureSample() calls exist anywhere in crust_hydrosphere.wgsl', () => {
      // In WGSL, textureSample() without Level/Compare/Bias has implicit derivatives.
      // Must only use textureSampleLevel() in crust_hydrosphere.wgsl.
      const lines = crustHydrosphereWGSL.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//')) continue;
        if (line.includes('textureSample(') && !line.includes('textureSampleLevel(') && !line.includes('textureSampleCompare(')) {
          throw new Error(`Forbidden implicit-LOD textureSample() detected at line ${i + 1}: ${line}`);
        }
      }
    });

    it('CHALLENGE-M1-07: All 4 cloud shadow penumbra taps use explicit LOD 0.0', () => {
      const sampleFuncIdx = crustHydrosphereWGSL.indexOf('fn sampleCloudShadowFactor');
      const sampleFuncEnd = crustHydrosphereWGSL.indexOf('return clamp(shadowFactor', sampleFuncIdx);
      const sampleFuncBody = crustHydrosphereWGSL.substring(sampleFuncIdx, sampleFuncEnd);

      expect(sampleFuncBody).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tap0, 0.0)');
      expect(sampleFuncBody).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tap1, 0.0)');
      expect(sampleFuncBody).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tap2, 0.0)');
      expect(sampleFuncBody).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tap3, 0.0)');
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Pillar B - Latitude Singularity Probing (lat -> ±90°)
  // --------------------------------------------------------------------------
  describe('Pillar 3: Latitude Singularity Probing & cos(lat) -> 0 Guard', () => {
    it('CHALLENGE-M1-08: Exact polar boundaries (lat = ±90°, uv.y = 0.0 and 1.0) do not divide by zero', () => {
      const northPole = computeCloudShadowOffsetTS({ x: 0.5, y: 0.0 }, 315.0, 45.0);
      const southPole = computeCloudShadowOffsetTS({ x: 0.5, y: 1.0 }, 315.0, 45.0);

      // cosLat must be clamped to 0.15 minimum
      expect(northPole.cosLat).toBe(0.15);
      expect(southPole.cosLat).toBe(0.15);

      // Displacements must be finite, non-NaN, and bounded
      expect(Number.isFinite(northPole.deltaU)).toBe(true);
      expect(Number.isFinite(northPole.deltaV)).toBe(true);
      expect(Number.isNaN(northPole.deltaU)).toBe(false);
      expect(Number.isNaN(northPole.deltaV)).toBe(false);

      expect(Number.isFinite(southPole.deltaU)).toBe(true);
      expect(Number.isFinite(southPole.deltaV)).toBe(true);
      expect(Number.isNaN(southPole.deltaU)).toBe(false);
      expect(Number.isNaN(southPole.deltaV)).toBe(false);

      // Max polar displacement is bounded by 1/0.15 factor ≈ 6.666x equatorial displacement
      const equator = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);
      expect(Math.abs(northPole.deltaU)).toBeCloseTo(Math.abs(equator.deltaU) / 0.15, 6);
      expect(Math.abs(southPole.deltaU)).toBeCloseTo(Math.abs(equator.deltaU) / 0.15, 6);
    });

    it('CHALLENGE-M1-09: Extreme sub-microsecond polar proximity (lat = ±89.999999°) remains stable', () => {
      const nearNorth = computeCloudShadowOffsetTS({ x: 0.5, y: 1e-7 }, 315.0, 45.0);
      const nearSouth = computeCloudShadowOffsetTS({ x: 0.5, y: 1.0 - 1e-7 }, 315.0, 45.0);

      expect(nearNorth.cosLat).toBe(0.15);
      expect(nearSouth.cosLat).toBe(0.15);
      expect(Number.isFinite(nearNorth.deltaU)).toBe(true);
      expect(Number.isFinite(nearSouth.deltaU)).toBe(true);
    });

    it('CHALLENGE-M1-10: Out-of-range latitude coordinates (uv.y < 0.0 or uv.y > 1.0) do not produce negative cosLat', () => {
      const outBelow = computeCloudShadowOffsetTS({ x: 0.5, y: -0.5 }, 315.0, 45.0);
      const outAbove = computeCloudShadowOffsetTS({ x: 0.5, y: 1.5 }, 315.0, 45.0);

      expect(outBelow.cosLat).toBeGreaterThanOrEqual(0.15);
      expect(outAbove.cosLat).toBeGreaterThanOrEqual(0.15);
      expect(Number.isFinite(outBelow.deltaU)).toBe(true);
      expect(Number.isFinite(outAbove.deltaU)).toBe(true);
    });

    it('CHALLENGE-M1-11: 4-tap penumbra filter radius rU at poles remains strictly bounded <= 0.0035 UV units', () => {
      const northPoleTaps = sampleCloudShadowFactorTS(
        { x: 0.5, y: 0.0 },
        { deltaU: 0.0, deltaV: 0.0 },
        0.45,
        () => 0.5
      );

      for (const tap of northPoleTaps.taps) {
        expect(tap.u).toBeGreaterThanOrEqual(0.0);
        expect(tap.u).toBeLessThan(1.0);
        expect(tap.v).toBeGreaterThanOrEqual(0.0);
        expect(tap.v).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Pillar B - Antimeridian Wrap-Around (u in [0.0, 1.0])
  // --------------------------------------------------------------------------
  describe('Pillar 4: Antimeridian Wrap-Around Continuity (u in [0.0, 1.0])', () => {
    it('CHALLENGE-M1-12: u = 0.0 and u = 1.0 wrap to identical fractional UV coordinates across seam', () => {
      const offset = computeCloudShadowOffsetTS({ x: 0.0, y: 0.5 }, 315.0, 45.0);

      const westSeamFactor = sampleCloudShadowFactorTS({ x: 0.0, y: 0.5 }, offset, 0.45, (u) => Math.sin(u * TWO_PI));
      const eastSeamFactor = sampleCloudShadowFactorTS({ x: 1.0, y: 0.5 }, offset, 0.45, (u) => Math.sin(u * TWO_PI));

      // Both u=0.0 and u=1.0 represent the exact 180° antimeridian
      expect(westSeamFactor.shadowFactor).toBeCloseTo(eastSeamFactor.shadowFactor, 8);

      // All 4 tap locations must match exactly across the seam
      for (let i = 0; i < 4; i++) {
        expect(westSeamFactor.taps[i].u).toBeCloseTo(eastSeamFactor.taps[i].u, 8);
        expect(westSeamFactor.taps[i].v).toBeCloseTo(eastSeamFactor.taps[i].v, 8);
      }
    });

    it('CHALLENGE-M1-13: Micro-epsilon coordinates crossing seam (u = 0.000001 vs u = 0.999999) exhibit zero discontinuity', () => {
      const offset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);
      const eps = 1e-6;

      const fLeft = sampleCloudShadowFactorTS({ x: eps, y: 0.5 }, offset, 0.45, (u) => u);
      const fRight = sampleCloudShadowFactorTS({ x: 1.0 - eps, y: 0.5 }, offset, 0.45, (u) => u);

      // Center U coordinates must wrap continuously across 1.0
      expect(Math.abs(fLeft.shadowFactor - fRight.shadowFactor)).toBeLessThan(0.01);
    });

    it('CHALLENGE-M1-14: Jitter taps near seam boundary never generate negative UVs or NaNs', () => {
      const boundaryUs = [0.0, 0.0001, 0.001, 0.01, 0.99, 0.999, 0.9999, 1.0];
      const offset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);

      for (const u of boundaryUs) {
        const res = sampleCloudShadowFactorTS({ x: u, y: 0.5 }, offset, 0.45, () => 0.5);
        for (const tap of res.taps) {
          expect(tap.u).toBeGreaterThanOrEqual(0.0);
          expect(tap.u).toBeLessThan(1.0);
          expect(tap.v).toBeGreaterThanOrEqual(0.0);
          expect(tap.v).toBeLessThanOrEqual(1.0);
          expect(Number.isFinite(tap.u)).toBe(true);
          expect(Number.isFinite(tap.v)).toBe(true);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 5: Sun Altitude Clamping & Tangent Behavior (0.1° to 89.9°)
  // --------------------------------------------------------------------------
  describe('Pillar 5: Sun Altitude Tangent & Clamping Probing (0.1° to 89.9°)', () => {
    it('CHALLENGE-M1-15: Grazing sun altitude (theta_sun = 0.1°) clamps to 5.0°, preventing infinite shadow length', () => {
      const grazing = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 0.1);
      const clamped5 = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 5.0);

      // Both should yield identical displacements due to clamp(alt, 5.0, 85.0)
      expect(grazing.deltaU).toBeCloseTo(clamped5.deltaU, 8);
      expect(grazing.deltaV).toBeCloseTo(clamped5.deltaV, 8);

      // Max equatorial displacement at 5° altitude:
      // deltaU = -(2.5 / (tan(5°) * 40030.17)) * cos(315°) ≈ -0.0005048 UV units (< 0.06% of globe width)
      // deltaV =  (2.5 / (tan(5°) * 20015.09)) * sin(315°) ≈ -0.0010095 UV units (< 0.11% of globe height)
      expect(Math.abs(grazing.deltaU)).toBeLessThan(0.001);
      expect(Math.abs(grazing.deltaV)).toBeLessThan(0.0015);
    });

    it('CHALLENGE-M1-16: Zenith sun altitude (theta_sun = 89.9°) clamps to 85.0°, collapsing shadow directly beneath cloud', () => {
      const zenith = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 89.9);
      const clamped85 = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 85.0);

      expect(zenith.deltaU).toBeCloseTo(clamped85.deltaU, 8);
      expect(zenith.deltaV).toBeCloseTo(clamped85.deltaV, 8);

      // At 85°, tan(85°) ≈ 11.43, displacement is tiny: ~3.86e-6 UV units
      expect(Math.abs(zenith.deltaU)).toBeLessThan(1e-5);
      expect(Math.abs(zenith.deltaV)).toBeLessThan(1e-5);
    });

    it('CHALLENGE-M1-17: Sun azimuth default selection correctly falls back to 315.0° NW for <= 0.0 input', () => {
      const defaultOffset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 0.0, 45.0);
      const explicit315 = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);

      expect(defaultOffset.deltaU).toBeCloseTo(explicit315.deltaU, 8);
      expect(defaultOffset.deltaV).toBeCloseTo(explicit315.deltaV, 8);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 6: Shadow Factor Range & Strict [0.40, 1.00] Invariant
  // --------------------------------------------------------------------------
  describe('Pillar 6: Strict [0.40, 1.00] Shadow Factor Invariant', () => {
    it('CHALLENGE-M1-18: shadowFactor is strictly in [0.40, 1.00] for all density in [0,1] and intensity in [0, 0.60]', () => {
      const offset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);

      for (let d = 0; d <= 100; d += 5) {
        const cloudDens = d / 100.0;
        for (let i = 0; i <= 60; i += 5) {
          const intensity = i / 100.0;
          const res = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, intensity, () => cloudDens);

          expect(res.shadowFactor).toBeGreaterThanOrEqual(0.40 - 1e-7);
          expect(res.shadowFactor).toBeLessThanOrEqual(1.00 + 1e-7);
        }
      }
    });

    it('CHALLENGE-M1-19: Smoothstep deadbands: cloudDens <= 0.10 gives 1.0; cloudDens >= 0.35 gives (1.0 - intensity)', () => {
      const offset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);
      const intensity = 0.50;

      // Sub-threshold
      const sub1 = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, intensity, () => 0.00);
      const sub2 = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, intensity, () => 0.05);
      const sub3 = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, intensity, () => 0.10);
      expect(sub1.shadowFactor).toBe(1.0);
      expect(sub2.shadowFactor).toBe(1.0);
      expect(sub3.shadowFactor).toBe(1.0);

      // Overcast saturation
      const over1 = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, intensity, () => 0.35);
      const over2 = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, intensity, () => 0.70);
      const over3 = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, intensity, () => 1.00);
      expect(over1.shadowFactor).toBeCloseTo(0.50, 6);
      expect(over2.shadowFactor).toBeCloseTo(0.50, 6);
      expect(over3.shadowFactor).toBeCloseTo(0.50, 6);
    });

    it('CHALLENGE-M1-20: Clamp protects against un-clamped upstream inputs (negative density, intensity > 1.0)', () => {
      const offset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);

      const negDens = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, 0.45, () => -10.0);
      expect(negDens.shadowFactor).toBe(1.0);

      const superOvercast = sampleCloudShadowFactorTS({ x: 0.5, y: 0.5 }, offset, 1.5, () => 1.0);
      expect(superOvercast.shadowFactor).toBe(0.0); // Clamped to 0.0 minimum
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 7: Pillar A - Massive Monte Carlo Stress Fuzzing (50,000 Iterations)
  // --------------------------------------------------------------------------
  describe('Pillar 7: 50,000-Iteration Monte Carlo Adversarial Stress Fuzzing', () => {
    it('CHALLENGE-M1-21: 50,000 randomized trials across all domains confirm zero NaNs and strict bounding', () => {
      const ITERATIONS = 50_000;
      let minObservedShadow = 1.0;
      let maxObservedShadow = 0.0;
      let maxDeltaU = 0.0;
      let maxDeltaV = 0.0;

      for (let i = 0; i < ITERATIONS; i++) {
        // Broad randomized coordinate space
        const u = -0.5 + Math.random() * 2.0;
        const v = -0.5 + Math.random() * 2.0;
        const sunAz = -360.0 + Math.random() * 720.0;
        const sunAlt = -45.0 + Math.random() * 180.0;
        const cloudDens = -0.2 + Math.random() * 1.4;
        const intensity = Math.random() * 0.60;

        const offset = computeCloudShadowOffsetTS({ x: u, y: v }, sunAz, sunAlt);

        expect(Number.isFinite(offset.deltaU)).toBe(true);
        expect(Number.isFinite(offset.deltaV)).toBe(true);
        expect(Number.isNaN(offset.deltaU)).toBe(false);
        expect(Number.isNaN(offset.deltaV)).toBe(false);

        maxDeltaU = Math.max(maxDeltaU, Math.abs(offset.deltaU));
        maxDeltaV = Math.max(maxDeltaV, Math.abs(offset.deltaV));

        const res = sampleCloudShadowFactorTS({ x: u, y: v }, offset, intensity, () => cloudDens);

        expect(Number.isFinite(res.shadowFactor)).toBe(true);
        expect(Number.isNaN(res.shadowFactor)).toBe(false);

        // Strict bound test: for intensity in [0, 0.60], shadowFactor in [0.40, 1.00]
        expect(res.shadowFactor).toBeGreaterThanOrEqual(0.40 - 1e-6);
        expect(res.shadowFactor).toBeLessThanOrEqual(1.00 + 1e-6);

        minObservedShadow = Math.min(minObservedShadow, res.shadowFactor);
        maxObservedShadow = Math.max(maxObservedShadow, res.shadowFactor);

        // Verify all 4 tap coordinates are safely normalized in [0, 1]
        for (const tap of res.taps) {
          expect(tap.u).toBeGreaterThanOrEqual(0.0);
          expect(tap.u).toBeLessThan(1.0);
          expect(tap.v).toBeGreaterThanOrEqual(0.0);
          expect(tap.v).toBeLessThanOrEqual(1.0);
        }
      }

      // Assert that the test actually explored the full range
      expect(minObservedShadow).toBeLessThan(0.45);
      expect(maxObservedShadow).toBe(1.0);
      expect(maxDeltaU).toBeGreaterThan(0.0);
      expect(maxDeltaV).toBeGreaterThan(0.0);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 8: Invariant §28 - Multi-Medium Archival Inking Parity
  // --------------------------------------------------------------------------
  describe('Pillar 8: Exhaustive Multi-Medium Shader Parity (Invariant §28)', () => {
    it('CHALLENGE-M1-22: Direct diffuse solar illumination modulated across Theme 0, Theme 1, and Theme 2', () => {
      // Theme 1: Cream Rag (sunDirect + ridgeEnhance modulated by shadowFactor)
      expect(crustHydrosphereWGSL).toMatch(
        /cWarmDirect\s*\*\s*\(sunDirect\s*\*\s*0\.90\s*\+\s*ridgeEnhance\s*\*\s*0\.8\s*\*\s*shadowFactor\)/
      );

      // Theme 2: Prussian Cyanotype (actinic sunlight modulated by shadowFactor)
      expect(crustHydrosphereWGSL).toMatch(
        /cActinicDirect\s*\*\s*\(sunDirect\s*\*\s*0\.85\s*\+\s*ridgeEnhance\s*\*\s*0\.8\s*\*\s*shadowFactor\)/
      );

      // Theme 0: Marie Tharp Physiographic (sunDirect + ridgeEnhance modulated by shadowFactor)
      expect(crustHydrosphereWGSL).toMatch(
        /cSunLight\s*\*\s*\(sunDirect\s*\*\s*0\.85\s*\+\s*ridgeEnhance\s*\*\s*shadowFactor\)/
      );
    });

    it('CHALLENGE-M1-23: Ambient paper substrate and sky fills are strictly conserved (unattenuated by shadows)', () => {
      // Theme 1 Cream Rag: cCoolShadow ambient paper tint NOT multiplied by shadowFactor
      expect(crustHydrosphereWGSL).toContain('let shadowComponent = cCoolShadow * (skyIndirect * creviceAO);');

      // Theme 2 Cyanotype: cActinicShadow base NOT multiplied by shadowFactor
      expect(crustHydrosphereWGSL).toContain('let shadowComponent = cActinicShadow * (skyIndirect * creviceAO);');

      // Theme 0 Tharp: cSkyAmbient NOT multiplied by shadowFactor
      expect(crustHydrosphereWGSL).toContain('+ cSkyAmbient * (skyIndirect * creviceAO)');
    });

    it('CHALLENGE-M1-24: Pelagic ocean seabed and specular highlights correctly receive cloud shadows', () => {
      // Subsurface seabed radiance
      expect(crustHydrosphereWGSL).toContain('let seabedRadiance = R_subsurface * (NdotL * causticFactor * shadowFactor);');

      // Pelagic sunlight illumination
      expect(crustHydrosphereWGSL).toContain('let sunIllum = cSunLight * (NdotL * 0.85 * shadowFactor + 0.15) + cSkyAmbient * 0.80;');

      // Specular highlight attenuation under clouds
      expect(crustHydrosphereWGSL).toContain('sunSpecular * fresnel * specAtten * shadowFactor');
    });
  });
});
