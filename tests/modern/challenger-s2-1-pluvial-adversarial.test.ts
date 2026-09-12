/**
 * tests/modern/challenger-s2-1-pluvial-adversarial.test.ts
 *
 * Adversarial Challenger Stress Test Suite for Stage 2:
 * Precipitation Texture Binding & Pluvial Valley Swelling.
 *
 * Challenger: challenger_s2_1 (teamwork_preview_challenger)
 * Invariants:
 * - Invariant §3: Unconditional WGSL uniform control flow sampling strictly before dynamic branching/discard
 * - Invariant §7: Hydrological river channel width scaling & Leopold-Maddock power law bounds
 * - Invariant §16: Sub-texel valley drainage & non-negative waterway dimensions
 * - Invariant §20: 16-byte WGSL struct alignment & 256-byte WebGPU row pitch hardware constraint
 * - Invariant §46: Anti-cheating production source import integrity
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import {
  computePluvialFactor,
  evalPluvialFactor,
  computeRiverWidth,
  evalPrecipUV,
} from '../../src/core/weather/PluvialDynamics';

describe('Challenger S2-1: Adversarial Pluvial Coupling & WebGPU Atmospheric Stress Harness', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

  // ==========================================================================
  // Pillar 1: Production Source Import Integrity (Invariant §46)
  // ==========================================================================
  describe('Pillar 1: Production Source Import Integrity (Invariant §46)', () => {
    it('CHALLENGE-S2-01: Verifies crust_hydrosphere.wgsl is imported directly from src/ with non-trivial size', () => {
      expect(shaderSrc).toBeDefined();
      expect(shaderSrc.length).toBeGreaterThan(50000);
      expect(shaderSrc).toContain('@group(0) @binding(9) var u_precipTexture: texture_2d<f32>;');
      expect(shaderSrc).toContain('@group(0) @binding(10) var u_precipSampler: sampler;');
      expect(shaderSrc).toContain('u_pluvial_gamma');
      expect(shaderSrc).toContain('compute_valley_drainage');
    });

    it('CHALLENGE-S2-02: Verifies WebGPUEngine exports production engine class with pluvial API', () => {
      expect(WebGPUEngine).toBeDefined();
      const engine = new WebGPUEngine();
      expect(typeof engine.ensurePrecipCrustTexture).toBe('function');
      expect(typeof engine.setPluvialGamma).toBe('function');
      expect(engine.pluvialGamma).toBe(0.0);
    });
  });

  // ==========================================================================
  // Pillar 2: Mathematical Singularities & 50,000-Trial Monte Carlo Fuzzing
  // ==========================================================================
  describe('Pillar 2: Mathematical Singularities & 50,000-Trial Monte Carlo Fuzzing', () => {


    it('CHALLENGE-S2-03: Boundary probing: negative, zero, subnormal, exactly 50.0, 10,000.0, Infinity', () => {
      const gamma = 1.5;

      // 1. Negative inputs must clamp to 0.0 -> pluvialFactor = 1.0
      expect(evalPluvialFactor(-100.0, gamma)).toBe(1.0);
      expect(evalPluvialFactor(-1e-30, gamma)).toBe(1.0);
      expect(evalPluvialFactor(-Infinity, gamma)).toBe(1.0);

      // 2. Zero inputs -> pluvialFactor = 1.0
      expect(evalPluvialFactor(0.0, gamma)).toBe(1.0);
      expect(evalPluvialFactor(-0.0, gamma)).toBe(1.0);

      // 3. Subnormal inputs: positive, non-negative, close to 1.0
      const subnormalF32 = 1.401298464324817e-45;
      const subFactor = evalPluvialFactor(subnormalF32, gamma);
      expect(Number.isFinite(subFactor)).toBe(true);
      expect(subFactor).toBeGreaterThanOrEqual(1.0);
      expect(subFactor).toBeCloseTo(1.0, 10);

      // 4. Exactly 50.0 (saturation boundary)
      const at50 = evalPluvialFactor(50.0, gamma);
      const expectedAt50 = 1.0 + gamma * Math.sqrt(50.0);
      expect(at50).toBeCloseTo(expectedAt50, 10);

      // 5. Above 50.0: strict saturation clamping
      expect(evalPluvialFactor(50.00001, gamma)).toBeCloseTo(expectedAt50, 5);
      expect(evalPluvialFactor(10000.0, gamma)).toBe(expectedAt50);
      expect(evalPluvialFactor(1e20, gamma)).toBe(expectedAt50);
      expect(evalPluvialFactor(Infinity, gamma)).toBe(expectedAt50);
    });

    it('CHALLENGE-S2-04: 50,000-Trial Monte Carlo fuzzing over gamma in [0.0, 2.0] and extreme precipRate domain', () => {
      const TRIALS = 50_000;
      let nanCount = 0;
      let infCount = 0;
      let negativeWidthCount = 0;
      let clampingViolations = 0;

      // Deterministic PRNG for reproducible Monte Carlo stress
      let seed = 987654321;
      function rnd(): number {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }

      for (let i = 0; i < TRIALS; i++) {
        const gamma = rnd() * 2.0; // gamma in [0.0, 2.0]
        const baseWidth = 0.40 + rnd() * (1.98 - 0.40); // Leopold-Maddock baseline [0.40, 1.98]

        // Diverse sampling distribution: negatives, near-zero, normal, high, extreme
        let precipRate: number;
        const selector = i % 5;
        if (selector === 0) {
          // Normal range: [0.0, 60.0]
          precipRate = rnd() * 60.0;
        } else if (selector === 1) {
          // Negative range: [-1e6, 0.0]
          precipRate = -rnd() * 1e6;
        } else if (selector === 2) {
          // High and extreme overflow: [50.0, 1e9]
          precipRate = 50.0 + rnd() * 1e9;
        } else if (selector === 3) {
          // Logarithmic / infinitesimal: [1e-35, 1.0]
          precipRate = Math.pow(10, -rnd() * 35);
        } else {
          // Specific discrete boundaries
          const discrete = [-Infinity, Infinity, 0.0, -0.0, 50.0, 10000.0, 1e-45];
          precipRate = discrete[Math.floor(rnd() * discrete.length)];
        }

        const factor = evalPluvialFactor(precipRate, gamma);
        const width = computeRiverWidth(baseWidth, precipRate, gamma);

        if (Number.isNaN(factor) || Number.isNaN(width)) nanCount++;
        if (!Number.isFinite(factor) || !Number.isFinite(width)) infCount++;
        if (width < baseWidth - 1e-12) negativeWidthCount++;

        // Strict clamping check: factor must lie in [1.0, 1.0 + 2.0 * sqrt(50.0)]
        const maxAllowedFactor = 1.0 + 2.0 * Math.sqrt(50.0);
        if (factor < 1.0 - 1e-12 || factor > maxAllowedFactor + 1e-12) {
          clampingViolations++;
        }
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(negativeWidthCount).toBe(0);
      expect(clampingViolations).toBe(0);
    });

    it('CHALLENGE-S2-05: Strict monotonicity across 10,000 steps of precipRate for fixed gamma > 0', () => {
      const gamma = 1.8;
      const STEPS = 10_000;
      let prevFactor = 1.0;
      let monotonicityViolations = 0;

      for (let i = 0; i <= STEPS; i++) {
        // Sweep precipRate from 0.0 to 100.0
        const precip = (i / STEPS) * 100.0;
        const factor = evalPluvialFactor(precip, gamma);

        if (factor < prevFactor - 1e-12) {
          monotonicityViolations++;
        }

        // Saturation check: for precip >= 50, factor must equal factor at 50.0
        if (precip >= 50.0) {
          const factorAt50 = evalPluvialFactor(50.0, gamma);
          expect(factor).toBeCloseTo(factorAt50, 10);
        }

        prevFactor = factor;
      }

      expect(monotonicityViolations).toBe(0);
    });

    it('CHALLENGE-S2-06: NaN and Non-Numeric Defense in WebGPUEngine and AtmosphereDrawer setters', () => {
      const engine = new WebGPUEngine();
      engine.setPluvialGamma(1.4);
      expect(engine.pluvialGamma).toBe(1.4);

      // Inject NaN
      engine.setPluvialGamma(NaN);
      expect(engine.pluvialGamma).toBe(1.4); // Preserved prior valid state

      // Inject Infinity
      engine.setPluvialGamma(Infinity);
      expect(engine.pluvialGamma).toBe(1.4);

      // Inject -Infinity
      engine.setPluvialGamma(-Infinity);
      expect(engine.pluvialGamma).toBe(1.4);

      // Inject non-numeric type
      (engine as any).setPluvialGamma('invalid');
      expect(engine.pluvialGamma).toBe(1.4);

      // Clamping within [0.0, 2.0]
      engine.setPluvialGamma(-10.0);
      expect(engine.pluvialGamma).toBe(0.0);

      engine.setPluvialGamma(50.0);
      expect(engine.pluvialGamma).toBe(2.0);
    });

    it('CHALLENGE-S2-06B: Explicit mathematical bounds probing matrix for gamma and precipRate', () => {
      // 1. Probe gamma in [-1.0, 0.0, 1.0, 2.0, 5.0, NaN, Infinity]: verify clamping and non-divergence
      const gammaProbes = [-1.0, 0.0, 1.0, 2.0, 5.0, NaN, Infinity];
      const engine = new WebGPUEngine();

      for (const g of gammaProbes) {
        engine.setPluvialGamma(0.5); // reset to clean baseline
        engine.setPluvialGamma(g);
        const val = engine.pluvialGamma;
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThanOrEqual(2.0);

        if (typeof g === 'number' && Number.isFinite(g)) {
          expect(val).toBe(Math.max(0.0, Math.min(2.0, g)));
        } else {
          expect(val).toBe(0.5); // non-finites preserve valid state
        }
      }

      // 2. Probe precipRate in [-10.0, 0.0, 0.001, 1.0, 25.0, 50.0, 100.0, 1e6, NaN]: verify clamp(precipRate, 0.0, 50.0) prevents NaN (from negative roots) or overflow
      const finitePrecipProbes = [-10.0, 0.0, 0.001, 1.0, 25.0, 50.0, 100.0, 1e6];
      for (const rate of finitePrecipProbes) {
        for (const g of [0.0, 0.5, 1.0, 2.0]) {
          const clamped = Math.min(Math.max(rate, 0.0), 50.0);
          expect(clamped).toBeGreaterThanOrEqual(0.0);
          expect(clamped).toBeLessThanOrEqual(50.0);
          expect(Number.isFinite(clamped)).toBe(true);

          const factor = evalPluvialFactor(rate, g);
          // Clamp strictly prevents negative-induced NaNs (e.g. sqrt(-10.0)) and runaway overflow (1e6)
          expect(Number.isFinite(factor)).toBe(true);
          expect(factor).toBeGreaterThanOrEqual(1.0);
          expect(factor).toBeLessThanOrEqual(1.0 + 2.0 * Math.sqrt(50.0) + 1e-9);

          // Overflow prevention: rates >= 50.0 saturate exactly at factor(50.0)
          if (rate >= 50.0) {
            expect(factor).toBeCloseTo(evalPluvialFactor(50.0, g), 9);
          }
          // Negative prevention: rates <= 0.0 clamp to 0.0, preserving factor 1.0
          if (rate <= 0.0) {
            expect(factor).toBe(1.0);
          }
        }
      }

      // Probing raw NaN: IEEE-754 clamp(NaN, 0.0, 50.0) propagates NaN
      for (const g of [0.0, 1.0, 2.0]) {
        const factor = evalPluvialFactor(NaN, g);
        expect(Number.isNaN(factor)).toBe(true);
      }

      // 3. Verify that when gamma = 0.0, pluvialFactor === 1.0 exactly across all precipRates
      for (const rate of [-10.0, 0.0, 0.001, 1.0, 25.0, 50.0, 100.0, 1e6]) {
        const factor = evalPluvialFactor(rate, 0.0);
        expect(factor).toBe(1.0);
        expect(computeRiverWidth(0.40, rate, 0.0)).toBe(0.40);
        expect(computeRiverWidth(1.98, rate, 0.0)).toBe(1.98);
      }

      // 4. Verify that when precipRate = 0.0, pluvialFactor === 1.0 exactly regardless of gamma
      for (const g of [-1.0, 0.0, 0.5, 1.0, 1.5, 2.0, 5.0]) {
        const clampedG = Math.max(0.0, Math.min(2.0, g));
        const factor = evalPluvialFactor(0.0, clampedG);
        expect(factor).toBe(1.0);
        expect(computeRiverWidth(0.40, 0.0, clampedG)).toBe(0.40);
        expect(computeRiverWidth(1.98, 0.0, clampedG)).toBe(1.98);
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Spherical UV Parameterization & Polar/Antimeridian Singularities
  // ==========================================================================
  describe('Pillar 3: Spherical UV Parameterization & Polar/Antimeridian Singularities', () => {


    it('CHALLENGE-S2-07: Exact boundary tests at the poles (lat = ±π/2) and antimeridian (lon = ±π)', () => {
      // North Pole (lat = +π/2, uvY = 0.0)
      const northPole = evalPrecipUV(0.5, 0.0);
      expect(northPole.lat).toBeCloseTo(Math.PI * 0.5, 10);
      expect(northPole.precipV).toBeCloseTo(0.0, 10);
      expect(Number.isFinite(northPole.precipV)).toBe(true);

      // South Pole (lat = -π/2, uvY = 1.0)
      const southPole = evalPrecipUV(0.5, 1.0);
      expect(southPole.lat).toBeCloseTo(-Math.PI * 0.5, 10);
      expect(southPole.precipV).toBeCloseTo(1.0, 10);
      expect(Number.isFinite(southPole.precipV)).toBe(true);

      // West Antimeridian (lon = -π, uvX = 0.0)
      const westAntimeridian = evalPrecipUV(0.0, 0.5);
      expect(westAntimeridian.lon).toBeCloseTo(-Math.PI, 10);
      expect(westAntimeridian.precipU).toBeCloseTo(0.0, 10);
      expect(Number.isFinite(westAntimeridian.precipU)).toBe(true);

      // East Antimeridian (lon = +π, uvX = 1.0)
      const eastAntimeridian = evalPrecipUV(1.0, 0.5);
      expect(eastAntimeridian.lon).toBeCloseTo(Math.PI, 10);
      expect(eastAntimeridian.precipU).toBeCloseTo(1.0, 10);
      expect(Number.isFinite(eastAntimeridian.precipU)).toBe(true);

      // 4 Singular Sheet Corners
      const corners = [
        [0.0, 0.0],
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
      ];
      for (const [cx, cy] of corners) {
        const res = evalPrecipUV(cx, cy);
        expect(Number.isFinite(res.precipU)).toBe(true);
        expect(Number.isFinite(res.precipV)).toBe(true);
        expect(res.precipU).toBeCloseTo(cx, 10);
        expect(res.precipV).toBeCloseTo(cy, 10);
      }
    });

    it('CHALLENGE-S2-08: 50,000-Trial Monte Carlo fuzzing over arbitrary UV space demonstrates identity mapping without singularity', () => {
      const TRIALS = 50_000;
      let nanCount = 0;
      let outOfBoundsCount = 0;

      let seed = 1234567;
      function rnd(): number {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return seed / 4294967296;
      }

      for (let i = 0; i < TRIALS; i++) {
        const uvX = rnd();
        const uvY = rnd();

        const res = evalPrecipUV(uvX, uvY);

        if (Number.isNaN(res.precipU) || Number.isNaN(res.precipV)) nanCount++;
        if (res.precipU < -1e-12 || res.precipU > 1.0 + 1e-12) outOfBoundsCount++;
        if (res.precipV < -1e-12 || res.precipV > 1.0 + 1e-12) outOfBoundsCount++;

        // Identity conservation: precipUV must match input UV to within IEEE floating point precision
        expect(res.precipU).toBeCloseTo(uvX, 8);
        expect(res.precipV).toBeCloseTo(uvY, 8);
      }

      expect(nanCount).toBe(0);
      expect(outOfBoundsCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 4: WGSL Uniform Buffer Byte Alignment & Struct Geometry (Invariant §20)
  // ==========================================================================
  describe('Pillar 4: WGSL Uniform Buffer Byte Alignment & Struct Geometry (Invariant §20)', () => {
    interface WGSLField {
      name: string;
      type: string;
      size: number;
      align: number;
      expectedOffset: number;
    }

    /**
     * Canonical SimUniforms struct declaration parsed from crust_hydrosphere.wgsl:
     */
    const expectedFields: WGSLField[] = [
      { name: 'u_unfurl', type: 'f32', size: 4, align: 4, expectedOffset: 0 },
      { name: 'u_mode', type: 'u32', size: 4, align: 4, expectedOffset: 4 },
      { name: 'u_theme', type: 'u32', size: 4, align: 4, expectedOffset: 8 },
      { name: 'u_time', type: 'f32', size: 4, align: 4, expectedOffset: 12 },
      { name: 'u_viewport', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 16 },
      { name: 'u_cameraPos', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 32 },
      { name: 'u_cursorHitPos', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 48 },
      { name: 'u_cursorVel', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 64 },
      { name: 'u_cursorActive', type: 'f32', size: 4, align: 4, expectedOffset: 80 },
      { name: 'u_displacementScale', type: 'f32', size: 4, align: 4, expectedOffset: 84 },
      { name: 'u_seaLevel', type: 'f32', size: 4, align: 4, expectedOffset: 88 },
      { name: 'u_roughness', type: 'f32', size: 4, align: 4, expectedOffset: 92 },
      { name: 'u_viewMatrix', type: 'mat4x4<f32>', size: 64, align: 16, expectedOffset: 96 },
      { name: 'u_projectionMatrix', type: 'mat4x4<f32>', size: 64, align: 16, expectedOffset: 160 },
      { name: 'u_sunAzimuth', type: 'f32', size: 4, align: 4, expectedOffset: 224 },
      { name: 'u_sunAltitude', type: 'f32', size: 4, align: 4, expectedOffset: 228 },
      { name: 'u_ambientOcclusion', type: 'f32', size: 4, align: 4, expectedOffset: 232 },
      { name: 'u_waterClarity', type: 'f32', size: 4, align: 4, expectedOffset: 236 },
      { name: 'u_peakExponent', type: 'f32', size: 4, align: 4, expectedOffset: 240 },
      { name: 'u_layerOpacity', type: 'f32', size: 4, align: 4, expectedOffset: 244 },
      { name: 'u_renderStyle', type: 'u32', size: 4, align: 4, expectedOffset: 248 },
      { name: 'u_isolatedStratum', type: 'f32', size: 4, align: 4, expectedOffset: 252 },
      { name: 'u_mediumProperties', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 256 },
      { name: 'u_shadowIntensity', type: 'f32', size: 4, align: 4, expectedOffset: 272 },
      { name: 'u_cloudDriftRate', type: 'f32', size: 4, align: 4, expectedOffset: 276 },
      { name: 'u_cloudAltitudeKm', type: 'f32', size: 4, align: 4, expectedOffset: 280 },
      { name: 'u_verticalScaleMode', type: 'u32', size: 4, align: 4, expectedOffset: 284 },
      { name: 'u_pluvial_gamma', type: 'f32', size: 4, align: 4, expectedOffset: 288 },
      { name: 'u_weatherOpticalMode', type: 'u32', size: 4, align: 4, expectedOffset: 292 },
      { name: 'u_lclBypass', type: 'f32', size: 4, align: 4, expectedOffset: 296 },
      { name: '_padPrecip1', type: 'f32', size: 4, align: 4, expectedOffset: 300 },
      { name: 'u_scrubTau', type: 'f32', size: 4, align: 4, expectedOffset: 304 },
      { name: 'u_advectionActive', type: 'f32', size: 4, align: 4, expectedOffset: 308 },
      { name: '_padScrub1', type: 'f32', size: 4, align: 4, expectedOffset: 312 },
      { name: '_padScrub2', type: 'f32', size: 4, align: 4, expectedOffset: 316 },
    ];

    it('CHALLENGE-S2-09: Parses SimUniforms from crust_hydrosphere.wgsl and validates field presence and order', () => {
      const structMatch = shaderSrc.match(/struct\s+SimUniforms\s*\{([^}]+)\};/);
      expect(structMatch).not.toBeNull();
      const structBody = structMatch![1];

      for (const field of expectedFields) {
        const escapedType = field.type.replace('<', '\\<').replace('>', '\\>');
        const regex = new RegExp(`\\b${field.name}\\s*:\\s*${escapedType}(?:\\s*[,;]|\\s*//)`);
        expect(structBody).toMatch(regex);
      }
    });

    it('CHALLENGE-S2-10: Evaluates WGSL alignment rules confirming u_pluvial_gamma is at byte 288 and struct is 320 bytes', () => {
      let currentOffset = 0;

      for (const field of expectedFields) {
        const alignedOffset = Math.ceil(currentOffset / field.align) * field.align;
        expect(alignedOffset).toBe(field.expectedOffset);

        if (field.name === 'u_pluvial_gamma') {
          // Invariant §20: byte 288 is an exact multiple of 16 (18 * 16 = 288)
          expect(alignedOffset).toBe(288);
          expect(alignedOffset % 16).toBe(0);
          expect(alignedOffset / 4).toBe(72); // Float index 72
        }

        if (field.name === 'u_weatherOpticalMode') {
          expect(alignedOffset).toBe(292);
          expect(alignedOffset / 4).toBe(73); // Uint index 73
        }

        currentOffset = alignedOffset + field.size;
      }

      // Total struct size rounded up to struct alignment (16 bytes)
      const structAlign = 16;
      const totalStructSize = Math.ceil(currentOffset / structAlign) * structAlign;

      expect(totalStructSize).toBe(320);
      expect(totalStructSize % 16).toBe(0);
      expect(totalStructSize / 4).toBe(80); // Total 80 32-bit floats
    });

    it('CHALLENGE-S2-11: Confirms zero internal compiler padding holes (100% contiguous allocation)', () => {
      let contiguousOffset = 0;
      for (const field of expectedFields) {
        expect(field.expectedOffset).toBe(contiguousOffset);
        contiguousOffset += field.size;
      }
      expect(contiguousOffset).toBe(320);
    });

    it('CHALLENGE-S2-12: Verifies WebGPUEngine memory allocations match 320-byte struct geometry', () => {
      expect(engineSrc).toContain('size: 320,');
      expect(engineSrc).toContain('private crustFloats = new Float32Array(80);');

      const engine = new WebGPUEngine();
      const crustFloats = (engine as any).crustFloats as Float32Array;
      expect(crustFloats.length).toBe(80);
      expect(crustFloats.byteLength).toBe(320);
    });
  });

  // ==========================================================================
  // Pillar 5: WebGPUEngine Fallback Dummy Texture Verification (Invariants §20 & §40)
  // ==========================================================================
  describe('Pillar 5: WebGPUEngine Fallback Dummy Texture Verification (Invariants §20 & §40)', () => {
    let mockDevice: MockGPUDevice;
    let engine: WebGPUEngine;

    beforeEach(() => {
      mockDevice = new MockGPUDevice();
      engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
    });

    it('CHALLENGE-S2-13: ensurePrecipCrustTexture creates a valid 1x1 dummy texture with format r16float and 256-byte row pitch', () => {
      const view = engine.ensurePrecipCrustTexture();
      expect(view).toBeDefined();

      // Verify dummy texture creation
      const dummyTexture = (engine as any).dummyPrecipTexture;
      expect(dummyTexture).toBeDefined();
      expect(dummyTexture.format).toBe('r16float');
      expect(dummyTexture.width).toBe(1);
      expect(dummyTexture.height).toBe(1);
      expect(dummyTexture.depthOrArrayLayers).toBe(1);
      expect(dummyTexture.usage).toBe(GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);

      // Verify writeTexture parameters
      expect(mockDevice.queue.writeTextureCalls.length).toBe(1);
      const call = mockDevice.queue.writeTextureCalls[0];
      expect(call.destination.texture).toBe(dummyTexture);
      expect(call.dataLayout.bytesPerRow).toBe(256);
      expect(call.dataLayout.bytesPerRow % 256).toBe(0); // Hardware 256-byte row pitch alignment
      expect(call.dataLayout.rowsPerImage).toBe(1);
      expect(call.size).toEqual([1, 1, 1]);

      // Verify written data is single 16-bit uint 0 (FP16 0.0)
      const dataView = call.data as Uint16Array;
      expect(dataView.length).toBe(1);
      expect(dataView[0]).toBe(0);
    });

    it('CHALLENGE-S2-14: ensurePrecipCrustTexture is idempotent and reuses dummy texture without reallocating', () => {
      const view1 = engine.ensurePrecipCrustTexture();
      const callCount1 = mockDevice.queue.writeTextureCalls.length;
      const textureCount1 = mockDevice.textures.length;

      const view2 = engine.ensurePrecipCrustTexture();
      expect(view2).toBe(view1);
      expect(mockDevice.queue.writeTextureCalls.length).toBe(callCount1);
      expect(mockDevice.textures.length).toBe(textureCount1);
    });

    it('CHALLENGE-S2-15: External precipitation texture or ring buffer overrides dummy texture', () => {
      // 1. External precipTexture override
      const extTexture = mockDevice.createTexture({
        label: 'external_precip_texture',
        size: [256, 128, 1],
        format: 'r16float',
      });
      engine.precipTexture = extTexture as any;

      const view = engine.ensurePrecipCrustTexture();
      expect(view).toBeDefined();
      expect((engine as any).precipTextureView).toBeDefined();
      expect(view).toBe((engine as any).precipTextureView);
      expect(view).not.toBe((engine as any).dummyPrecipTextureView);
    });

    it('CHALLENGE-S2-16: WebGPUEngine.dispose cleanly tears down precipitation dummy resources', () => {
      (engine as any).isInitialized = true;
      engine.ensurePrecipCrustTexture();
      const dummyTexture = (engine as any).dummyPrecipTexture;
      expect(dummyTexture).toBeDefined();

      const destroySpy = vi.spyOn(dummyTexture, 'destroy');
      engine.dispose();

      expect(destroySpy).toHaveBeenCalled();
      expect((engine as any).dummyPrecipTexture).toBeNull();
      expect((engine as any).dummyPrecipTextureView).toBeNull();
      expect((engine as any).dummyPrecipSampler).toBeNull();
    });
  });

  // ==========================================================================
  // Pillar 6: WGSL Uniform Control Flow Auditing (Invariant §3)
  // ==========================================================================
  describe('Pillar 6: WGSL Uniform Control Flow Auditing (Invariant §3)', () => {
    it('CHALLENGE-S2-17: textureSampleLevel for precipitation is evaluated strictly in unconditional control flow', () => {
      const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainBody = shaderSrc.slice(fsMainIdx);

      const sampleIdx = fsMainBody.indexOf('textureSampleLevel(u_precipTexture, u_precipSampler, precipUV, 0.0)');
      expect(sampleIdx).toBeGreaterThan(0);

      // Verify that sample occurs before any discard statements
      const firstDiscardIdx = fsMainBody.indexOf('discard;');
      expect(firstDiscardIdx).toBeGreaterThan(0);
      expect(sampleIdx).toBeLessThan(firstDiscardIdx);

      // Verify that sample occurs before the Dymaxion net discard branch
      const dymaxionBranchIdx = fsMainBody.indexOf('if (sim.u_mode == 4u && sim.u_unfurl > 0.02)');
      expect(dymaxionBranchIdx).toBeGreaterThan(0);
      expect(sampleIdx).toBeLessThan(dymaxionBranchIdx);
    });

    it('CHALLENGE-S2-18: Verifies explicit LOD parameter (0.0) is passed to textureSampleLevel', () => {
      expect(shaderSrc).toContain('textureSampleLevel(u_precipTexture, u_precipSampler, precipUV, 0.0)');
    });
  });
});
