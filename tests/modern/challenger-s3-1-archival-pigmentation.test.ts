// ============================================================================
// File: tests/modern/challenger-s3-1-archival-pigmentation.test.ts
// Challenger: challenger_s3_1 (Empirical Adversarial Verification)
// Pillars:
//   - Pillar A: Large-Scale Monte Carlo Stress Fuzzing (50,000 iterations)
//   - Pillar B: Critical Mathematical & Degenerate Boundary Probing
//   - Pillar C: Multi-Medium Parity & Invariant §28 Conservation
//   - Pillar D: Anti-Cheating Direct Test Import Integrity (Rule 46)
// Targets:
//   - Stage 3: Weather Optical Modes & Archival Ink Weather Overlays
// Invariants Tested:
//   - Invariant §3: Unconditional Uniform Control Flow Sampling
//   - Invariant §20: 16-Byte WGSL Struct Alignment & Float/Uint Packing
//   - Invariant §28: Exhaustive Multi-Medium Shader Parity (Zero Theme Collapsing)
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

import {
  hashPaper2D,
  apply_weather_pigmentation,
  sample_spectral_doppler,
} from '../../src/core/weather/ArchivalPigmentation';

describe('Challenger S3-1: Archival Pigmentation & Weather Optical Modes Adversarial Suite', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  // ==========================================================================
  // Pillar B: Mathematical Bounds & Degenerate Value Fuzzing
  // ==========================================================================
  describe('Pillar B: Mathematical Bounds & Degenerate Fuzzing', () => {
    const testPrecipValues = [
      -100.0,
      -1e-6,
      0.0,
      0.001,
      0.05,
      0.1,
      1.0,
      25.0,
      50.0,
      100.0,
      1e6,
      Infinity,
    ];

    const themes = [0, 1, 2, 3]; // Themes 0, 1, 2 plus fallback
    const mediumProps: [number, number, number, number] = [0.0, 1.0, 1.0, 1.0];
    const baseColor: [number, number, number, number] = [0.5, 0.5, 0.5, 1.0];

    it('probes apply_weather_pigmentation across extreme values: produces zero NaNs, zero Infinities, bounded in [0.0, 1.0]', () => {
      for (const precipRate of testPrecipValues) {
        for (const theme of themes) {
          const rgba = apply_weather_pigmentation(precipRate, theme, mediumProps, baseColor);

          // All 4 components must be finite and within [0.0, 1.0]
          for (let i = 0; i < 4; i++) {
            expect(Number.isFinite(rgba[i])).toBe(true);
            expect(Number.isNaN(rgba[i])).toBe(false);
            expect(rgba[i]).toBeGreaterThanOrEqual(0.0);
            expect(rgba[i]).toBeLessThanOrEqual(1.0);
          }

          // Values <= 0.05 must yield exact transparent zero overlay
          if (precipRate <= 0.05) {
            expect(rgba[0]).toBe(0.0);
            expect(rgba[1]).toBe(0.0);
            expect(rgba[2]).toBe(0.0);
            expect(rgba[3]).toBe(0.0);
          } else {
            // Values > 0.05 must have non-zero alpha
            expect(rgba[3]).toBeGreaterThan(0.0);
          }
        }
      }
    });

    it('probes sample_spectral_doppler across extreme values: produces zero NaNs, zero Infinities, bounded in [0.0, 1.0]', () => {
      for (const precipRate of testPrecipValues) {
        const rgba = sample_spectral_doppler(precipRate);

        for (let i = 0; i < 4; i++) {
          expect(Number.isFinite(rgba[i])).toBe(true);
          expect(Number.isNaN(rgba[i])).toBe(false);
          expect(rgba[i]).toBeGreaterThanOrEqual(0.0);
          expect(rgba[i]).toBeLessThanOrEqual(1.0);
        }

        // Radar noise cutoff: rates < 0.1 mm/h must return exact zero RGBA
        if (precipRate < 0.1) {
          expect(rgba[0]).toBe(0.0);
          expect(rgba[1]).toBe(0.0);
          expect(rgba[2]).toBe(0.0);
          expect(rgba[3]).toBe(0.0);
        } else {
          expect(rgba[3]).toBeGreaterThanOrEqual(0.40);
        }
      }
    });

    it('adversarially probes unshielded raw NaN propagation in shader mathematical formulation', () => {
      // Direct raw NaN probe: IEEE-754 clamp(NaN) produces NaN in JavaScript
      const rgbaTharp = apply_weather_pigmentation(NaN, 0, mediumProps, baseColor);
      const rgbaCream = apply_weather_pigmentation(NaN, 1, mediumProps, baseColor);
      const rgbaCyan = apply_weather_pigmentation(NaN, 2, mediumProps, baseColor);
      const rgbaDoppler = sample_spectral_doppler(NaN);

      // Documenting exact mathematical behavior: raw NaN input propagates into alpha or RGBA
      expect(Number.isNaN(rgbaTharp[3])).toBe(true);
      expect(Number.isNaN(rgbaCream[3])).toBe(true);
      expect(Number.isNaN(rgbaCyan[3])).toBe(true);
      expect(Number.isNaN(rgbaDoppler[0])).toBe(true);
      expect(Number.isNaN(rgbaDoppler[3])).toBe(true);
    });
  });

  // ==========================================================================
  // Pillar B2: WebGPUEngine setWeatherOpticalMode Input Defense
  // ==========================================================================
  describe('Pillar B2: WebGPUEngine.setWeatherOpticalMode Input Defense', () => {
    it('sets valid integer modes 0 and 1 correctly', () => {
      const engine = new WebGPUEngine();
      expect(engine.weatherOpticalMode).toBe(0);

      engine.setWeatherOpticalMode(1);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(0);
      expect(engine.weatherOpticalMode).toBe(0);
    });

    it('normalizes floating-point mode inputs via Math.floor', () => {
      const engine = new WebGPUEngine();
      engine.setWeatherOpticalMode(1.8);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(0.2);
      expect(engine.weatherOpticalMode).toBe(0);

      engine.setWeatherOpticalMode(2.9);
      expect(engine.weatherOpticalMode).toBe(2);
    });

    it('defensively preserves previous state when passed invalid numbers (NaN, Infinity, -Infinity)', () => {
      const engine = new WebGPUEngine();
      engine.setWeatherOpticalMode(1);

      engine.setWeatherOpticalMode(NaN);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(Infinity);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(-Infinity);
      expect(engine.weatherOpticalMode).toBe(1);
    });

    it('defensively preserves previous state when passed non-number types (strings, null, undefined, objects)', () => {
      const engine = new WebGPUEngine();
      engine.setWeatherOpticalMode(0);

      (engine as any).setWeatherOpticalMode('1');
      expect(engine.weatherOpticalMode).toBe(0);

      (engine as any).setWeatherOpticalMode('invalid');
      expect(engine.weatherOpticalMode).toBe(0);

      (engine as any).setWeatherOpticalMode(null);
      expect(engine.weatherOpticalMode).toBe(0);

      (engine as any).setWeatherOpticalMode(undefined);
      expect(engine.weatherOpticalMode).toBe(0);

      (engine as any).setWeatherOpticalMode({ mode: 1 });
      expect(engine.weatherOpticalMode).toBe(0);
    });

    it('probes negative values in setWeatherOpticalMode and documents uint32 buffer behavior', () => {
      const engine = new WebGPUEngine();
      // Negative input: Math.floor(-1) = -1
      engine.setWeatherOpticalMode(-1);
      expect(engine.weatherOpticalMode).toBe(-1);

      // Verify uniform packing in updateUniforms
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
      });

      const crustUints = (engine as any).crustUints as Uint32Array;
      // In Uint32Array, -1 wraps to 4294967295 (0xFFFFFFFF)
      expect(crustUints[73]).toBe(4294967295);

      // In WGSL, sim.u_weatherOpticalMode != 1u safely falls back to Archival Ink Wash branch
    });
  });

  // ==========================================================================
  // Pillar A & C: Multi-Medium Parity — 50,000-Iteration Monte Carlo Stress Test
  // ==========================================================================
  describe('Pillar A & C: Invariant §28 Multi-Medium Parity — 50,000-Iteration Monte Carlo', () => {
    it('executes 50,000 randomized iterations comparing Theme 0, Theme 1, and Theme 2 with zero theme collapsing', () => {
      const NUM_ITERATIONS = 50_000;

      let zeroCollapseCount = 0;
      let minDistance01 = Infinity;
      let minDistance02 = Infinity;
      let minDistance12 = Infinity;

      for (let i = 0; i < NUM_ITERATIONS; i++) {
        // Active precipitation rates: 0.051 to 100.0 mm/h
        const precipRate = 0.051 + Math.random() * 99.949;

        // Random medium properties
        const mediumProps: [number, number, number, number] = [
          Math.random(),              // x
          0.2 + Math.random() * 1.6,  // y: paper tooth [0.2, 1.8]
          0.4 + Math.random() * 2.1,  // z: cyanotype exposure gamma [0.4, 2.5]
          0.1 + Math.random() * 1.9,  // w: stipple density [0.1, 2.0]
        ];

        // Random base color
        const baseColor: [number, number, number, number] = [
          Math.random(),
          Math.random(),
          Math.random(),
          1.0,
        ];

        const out0 = apply_weather_pigmentation(precipRate, 0, mediumProps, baseColor);
        const out1 = apply_weather_pigmentation(precipRate, 1, mediumProps, baseColor);
        const out2 = apply_weather_pigmentation(precipRate, 2, mediumProps, baseColor);

        // 1. All outputs must be finite and within [0.0, 1.0]
        for (let c = 0; c < 4; c++) {
          expect(Number.isFinite(out0[c])).toBe(true);
          expect(Number.isFinite(out1[c])).toBe(true);
          expect(Number.isFinite(out2[c])).toBe(true);
          expect(out0[c]).toBeGreaterThanOrEqual(0.0);
          expect(out0[c]).toBeLessThanOrEqual(1.0);
          expect(out1[c]).toBeGreaterThanOrEqual(0.0);
          expect(out1[c]).toBeLessThanOrEqual(1.0);
          expect(out2[c]).toBeGreaterThanOrEqual(0.0);
          expect(out2[c]).toBeLessThanOrEqual(1.0);
        }

        // 2. All active themes must have positive alpha
        expect(out0[3]).toBeGreaterThan(0.0);
        expect(out1[3]).toBeGreaterThan(0.0);
        expect(out2[3]).toBeGreaterThan(0.0);

        // 3. Euclidean RGB distance verification (Zero Theme Collapsing)
        const d01 = Math.hypot(out0[0] - out1[0], out0[1] - out1[1], out0[2] - out1[2]);
        const d02 = Math.hypot(out0[0] - out2[0], out0[1] - out2[1], out0[2] - out2[2]);
        const d12 = Math.hypot(out1[0] - out2[0], out1[1] - out2[1], out1[2] - out2[2]);

        // Distinct colors: Euclidean distance must exceed minimum threshold
        expect(d01).toBeGreaterThan(0.05);
        expect(d02).toBeGreaterThan(0.05);
        expect(d12).toBeGreaterThan(0.05);

        if (d01 < minDistance01) minDistance01 = d01;
        if (d02 < minDistance02) minDistance02 = d02;
        if (d12 < minDistance12) minDistance12 = d12;

        zeroCollapseCount++;
      }

      expect(zeroCollapseCount).toBe(NUM_ITERATIONS);
      expect(minDistance01).toBeGreaterThan(0.10); // Minimum Tharp vs Cream distance
      expect(minDistance02).toBeGreaterThan(0.10); // Minimum Tharp vs Cyanotype distance
      expect(minDistance12).toBeGreaterThan(0.18); // Minimum Cream vs Cyanotype distance
    });
  });

  // ==========================================================================
  // Pillar C: Spectral Doppler Color Ramp Progression & Monotonicity
  // ==========================================================================
  describe('Pillar C: Spectral Doppler Color Ramp Progression & Monotonicity', () => {
    it('verifies monotonic alpha progression from 0.40 at threshold up to 0.95 at saturation', () => {
      const probeRates = [0.1, 0.5, 1.0, 2.0, 2.5, 5.0, 7.5, 10.0, 15.0, 20.0, 30.0, 40.0, 50.0];
      let prevAlpha = 0.0;

      for (const rate of probeRates) {
        const rgba = sample_spectral_doppler(rate);
        expect(rgba[3]).toBeGreaterThanOrEqual(prevAlpha);
        expect(rgba[3]).toBeGreaterThanOrEqual(0.40);
        expect(rgba[3]).toBeLessThanOrEqual(0.95);
        prevAlpha = rgba[3];
      }
    });

    it('verifies correct color tiers across the meteorological radar spectrum', () => {
      // Tier 1: 0.1 mm/h (Drizzle light blue)
      const t1 = sample_spectral_doppler(0.1);
      expect(t1[0]).toBeCloseTo(0.20, 2);
      expect(t1[1]).toBeCloseTo(0.48, 2);
      expect(t1[2]).toBeCloseTo(0.80, 2);
      expect(t1[3]).toBeCloseTo(0.40, 2);

      // Tier 2: 1.0 mm/h (Light rain cyan-blue)
      const t2 = sample_spectral_doppler(1.0);
      expect(t2[0]).toBeCloseTo(0.25, 2);
      expect(t2[1]).toBeCloseTo(0.60, 2);
      expect(t2[2]).toBeCloseTo(1.00, 2);
      expect(t2[3]).toBeCloseTo(0.65, 2);

      // Tier 3: 2.5 mm/h (Moderate rain green)
      const t3 = sample_spectral_doppler(2.5);
      expect(t3[0]).toBeCloseTo(0.00, 2);
      expect(t3[1]).toBeCloseTo(0.78, 2);
      expect(t3[2]).toBeCloseTo(0.20, 2);
      expect(t3[3]).toBeCloseTo(0.75, 2);

      // Tier 4: 7.5 mm/h (Moderate-heavy yellow)
      const t4 = sample_spectral_doppler(7.5);
      expect(t4[0]).toBeCloseTo(1.00, 2);
      expect(t4[1]).toBeCloseTo(0.85, 2);
      expect(t4[2]).toBeCloseTo(0.00, 2);
      expect(t4[3]).toBeCloseTo(0.80, 2);

      // Tier 5: 15.0 mm/h (Heavy orange)
      const t5 = sample_spectral_doppler(15.0);
      expect(t5[0]).toBeCloseTo(1.00, 2);
      expect(t5[1]).toBeCloseTo(0.47, 2);
      expect(t5[2]).toBeCloseTo(0.00, 2);
      expect(t5[3]).toBeCloseTo(0.85, 2);

      // Tier 6: 30.0 mm/h (Severe convective red)
      const t6 = sample_spectral_doppler(30.0);
      expect(t6[0]).toBeCloseTo(0.90, 2);
      expect(t6[1]).toBeCloseTo(0.00, 2);
      expect(t6[2]).toBeCloseTo(0.00, 2);
      expect(t6[3]).toBeCloseTo(0.90, 2);

      // Tier 7: >= 50.0 mm/h (Extreme / hail core magenta)
      const t7 = sample_spectral_doppler(50.0);
      expect(t7[0]).toBeCloseTo(0.78, 2);
      expect(t7[1]).toBeCloseTo(0.00, 2);
      expect(t7[2]).toBeCloseTo(0.78, 2);
      expect(t7[3]).toBeCloseTo(0.95, 2);
    });
  });

  // ==========================================================================
  // Pillar D: Anti-Cheating Production Module Import & WGSL Static AST Audit
  // ==========================================================================
  describe('Pillar D: WGSL Shader Static AST & Alignment Audit', () => {
    it('verifies Invariant §3: u_precipTexture sampling is unconditional before any discard', () => {
      const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainBody = shaderSrc.slice(fsMainIdx);

      const precipSampleIdx = fsMainBody.indexOf('textureSampleLevel(u_precipTexture, u_precipSampler, precipUV, 0.0)');
      const discardIdx = fsMainBody.indexOf('discard;');

      expect(precipSampleIdx).toBeGreaterThan(0);
      expect(discardIdx).toBeGreaterThan(0);
      expect(precipSampleIdx).toBeLessThan(discardIdx);
    });

    it('verifies Invariant §20: SimUniforms 16-byte struct alignment at offset 288 and 292', () => {
      expect(shaderSrc).toContain('u_pluvial_gamma: f32, // offset 288 (float 72)');
      expect(shaderSrc).toContain('u_weatherOpticalMode: u32, // offset 292 (uint 73)');
      expect(shaderSrc).toMatch(/(?:u_lclBypass|_padPrecip0):\s*f32,\s*\/\/\s*offset\s*296/);
      expect(shaderSrc).toContain('_padPrecip1: f32, // offset 300 (float 75)');
    });

    it('verifies Invariant §28: apply_weather_pigmentation contains explicit branches for Theme 0, Theme 1, and Theme 2', () => {
      const fnIdx = shaderSrc.indexOf('fn apply_weather_pigmentation');
      expect(fnIdx).toBeGreaterThan(0);
      const fnBody = shaderSrc.slice(fnIdx, shaderSrc.indexOf('\nfn sample_spectral_doppler', fnIdx));

      expect(fnBody).toContain('if (theme == 0u)');
      expect(fnBody).toContain('else if (theme == 1u)');
      expect(fnBody).toContain('else if (theme == 2u)');
      expect(fnBody).toContain('else {');

      // Theme 0: Marie Tharp Marine Indigo
      expect(fnBody).toContain('vec3<f32>(0.118, 0.161, 0.231)');
      // Theme 1: Cream Rag Sepia-Charcoal
      expect(fnBody).toContain('vec4<f32>(0.220, 0.188, 0.165, alpha)');
      // Theme 2: Prussian Blue
      expect(fnBody).toContain('vec4<f32>(0.039, 0.098, 0.184, alpha)');
    });
  });
});
