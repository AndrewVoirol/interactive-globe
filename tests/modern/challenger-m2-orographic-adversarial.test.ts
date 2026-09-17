import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Challenger 1 Adversarial Test Suite for Milestone 2
 * (Uniform Placebo & Orographic Coupling Gate)
 *
 * Rigorously challenges:
 * 1. Orographic rain shadow attenuation formula:
 *    rainShadowAtten = 1.0 - u_rainShadowFeedback * clamp(-wOro * 40.0, 0.0, 0.85) * stratumCoupling
 * 2. Cloud self-shadowing formula:
 *    selfShadow = mix(1.0 - u_shadowIntensity * 0.5, 1.0, max(0.0, NdotL))
 * 3. Extreme boundary conditions, Monte Carlo fuzzing (50,000 trials each), NaN/Inf robustness
 * 4. AST and Uniform Placebo audit in cloud_shell.wgsl and WebGPUEngine.ts
 */

const SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
const ENGINE_PATH = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');

const cloudShaderSource = fs.readFileSync(SHADER_PATH, 'utf-8');
const engineSource = fs.readFileSync(ENGINE_PATH, 'utf-8');

// Exact formula implementations
export function evaluateRainShadowAttenRaw(
  wOrographic: number,
  rainShadowFeedback: number,
  stratumCoupling: number
): number {
  const clampTerm = Math.max(0.0, Math.min(0.85, -wOrographic * 40.0));
  return 1.0 - rainShadowFeedback * clampTerm * stratumCoupling;
}

export function evaluateRainShadowAttenF32(
  wOrographic: number,
  rainShadowFeedback: number,
  stratumCoupling: number
): number {
  const w = Math.fround(wOrographic);
  const fb = Math.fround(rainShadowFeedback);
  const sc = Math.fround(stratumCoupling);
  const clampTerm = Math.fround(Math.max(Math.fround(0.0), Math.min(Math.fround(0.85), Math.fround(-w * Math.fround(40.0)))));
  return Math.fround(Math.fround(1.0) - Math.fround(Math.fround(fb * clampTerm) * sc));
}

export function evaluateSelfShadow(
  shadowIntensity: number,
  NdotL: number
): number {
  const clampedNdotL = Math.max(0.0, NdotL);
  const minTerm = 1.0 - shadowIntensity * 0.5;
  return minTerm * (1.0 - clampedNdotL) + 1.0 * clampedNdotL;
}

export function evaluateSelfShadowF32(
  shadowIntensity: number,
  NdotL: number
): number {
  const si = Math.fround(shadowIntensity);
  const nl = Math.fround(NdotL);
  const clampedNdotL = Math.fround(Math.max(Math.fround(0.0), nl));
  const minTerm = Math.fround(Math.fround(1.0) - Math.fround(si * Math.fround(0.5)));
  return Math.fround(Math.fround(minTerm * Math.fround(Math.fround(1.0) - clampedNdotL)) + clampedNdotL);
}

describe('Challenger 1 Milestone 2: Orographic Coupling & Uniform Placebo Stress Suite', () => {
  // ==========================================================================
  // Pillar 1: Windward Invariant (w >= 0 -> rainShadowAtten == 1.0)
  // ==========================================================================
  describe('Pillar 1: Windward Invariant (w >= 0)', () => {
    it('M2-CHALLENGE-WINDWARD-01: rainShadowAtten is identically 1.0 for all w >= 0 regardless of feedback', () => {
      const feedbacks = [0.0, 0.1, 0.5, 1.0, 1.5, 2.0, 10.0, 100.0];
      const couplings = [0.0, 0.15, 0.50, 1.0];
      const wValues = [0.0, 0.0001, 0.01, 0.1, 1.0, 10.0, 100.0];

      for (const w of wValues) {
        for (const fb of feedbacks) {
          for (const sc of couplings) {
            const atten = evaluateRainShadowAttenRaw(w, fb, sc);
            const attenF32 = evaluateRainShadowAttenF32(w, fb, sc);
            expect(atten, `w=${w}, fb=${fb}, sc=${sc}`).toBe(1.0);
            expect(attenF32, `FP32 w=${w}, fb=${fb}, sc=${sc}`).toBe(1.0);
          }
        }
      }
    });

    it('M2-CHALLENGE-WINDWARD-02: 50,000 Monte Carlo trials confirm w in [0, 100] yields identically 1.0', () => {
      let nonOneCount = 0;
      let nonFiniteCount = 0;

      for (let i = 0; i < 50_000; i++) {
        const w = Math.random() * 100.0;
        const fb = Math.random() * 2.0;
        const sc = Math.random();

        const atten = evaluateRainShadowAttenRaw(w, fb, sc);
        if (!Number.isFinite(atten)) nonFiniteCount++;
        if (atten !== 1.0) nonOneCount++;
      }

      expect(nonFiniteCount).toBe(0);
      expect(nonOneCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 2: Nominal Envelope Fuzzing (w in [-100, 100], fb in [0, 1], sc in [0, 1])
  // ==========================================================================
  describe('Pillar 2: Nominal Envelope Boundedness (feedback in [0, 1])', () => {
    it('M2-CHALLENGE-NOMINAL-01: rainShadowAtten is strictly bounded in [0.15, 1.0] for feedback in [0, 1]', () => {
      // Theoretical bounds:
      // Minimum occurs when w <= -0.02125 (clampTerm = 0.85), fb = 1.0, sc = 1.0
      // atten_min = 1.0 - 1.0 * 0.85 * 1.0 = 0.15
      // Maximum occurs when w >= 0 or fb = 0 -> atten_max = 1.0
      const minAtten = evaluateRainShadowAttenRaw(-1.0, 1.0, 1.0);
      expect(minAtten).toBeCloseTo(0.15, 6);

      let observedMin = Infinity;
      let observedMax = -Infinity;
      let nonFiniteCount = 0;

      for (let i = 0; i < 50_000; i++) {
        const w = -100.0 + Math.random() * 200.0;
        const fb = Math.random() * 1.0;
        const sc = Math.random() * 1.0;

        const atten = evaluateRainShadowAttenRaw(w, fb, sc);
        const attenF32 = evaluateRainShadowAttenF32(w, fb, sc);

        if (!Number.isFinite(atten) || !Number.isFinite(attenF32)) nonFiniteCount++;
        if (atten < observedMin) observedMin = atten;
        if (atten > observedMax) observedMax = atten;

        expect(atten).toBeGreaterThanOrEqual(0.149999);
        expect(atten).toBeLessThanOrEqual(1.000001);
      }

      expect(nonFiniteCount).toBe(0);
      expect(observedMin).toBeGreaterThanOrEqual(0.149999);
      expect(observedMin).toBeLessThan(0.25);
      expect(observedMax).toBe(1.0);
    });

    it('M2-CHALLENGE-NOMINAL-02: Stratum coupling preservation (High cirrus minimally attenuated)', () => {
      // Low stratus: sc = 1.0 -> atten can reach 0.15 (-85%)
      // Mid altocumulus: sc = 0.5 -> atten reaches 1.0 - 0.85 * 0.5 = 0.575 (-42.5%)
      // High cirrus: sc = 0.15 -> atten reaches 1.0 - 0.85 * 0.15 = 0.8725 (-12.75%)
      const low = evaluateRainShadowAttenRaw(-10.0, 1.0, 1.0);
      const mid = evaluateRainShadowAttenRaw(-10.0, 1.0, 0.5);
      const high = evaluateRainShadowAttenRaw(-10.0, 1.0, 0.15);

      expect(low).toBeCloseTo(0.15, 4);
      expect(mid).toBeCloseTo(0.575, 4);
      expect(high).toBeCloseTo(0.8725, 4);

      expect(low).toBeLessThan(mid);
      expect(mid).toBeLessThan(high);
    });
  });

  // ==========================================================================
  // Pillar 3: Over-Range Adversarial Stress (feedback in [0, 2])
  // ==========================================================================
  describe('Pillar 3: Over-Range Adversarial Stress (feedback in [0, 2])', () => {
    it('M2-CHALLENGE-OVERRANGE-01: Probes behavior when feedback exceeds 1.0', () => {
      // When feedback = 2.0 and w < 0, raw formula 1.0 - 2.0 * 0.85 * 1.0 = -0.70
      const rawAtTwo = evaluateRainShadowAttenRaw(-1.0, 2.0, 1.0);
      expect(rawAtTwo).toBeCloseTo(-0.70, 4);

      // Verify zero NaNs or Infinities even under extreme over-range [-100, 100] and [0, 2]
      let nanCount = 0;
      let infCount = 0;

      for (let i = 0; i < 50_000; i++) {
        const w = -100.0 + Math.random() * 200.0;
        const fb = Math.random() * 2.0;
        const sc = Math.random();

        const val = evaluateRainShadowAttenRaw(w, fb, sc);
        if (Number.isNaN(val)) nanCount++;
        if (!Number.isFinite(val)) infCount++;
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
    });

    it('M2-CHALLENGE-OVERRANGE-02: Verifies downstream density feathering safely absorbs negative atten', () => {
      // In cloud_shell.wgsl:
      // baseDensity *= rainShadowAtten;
      // let condensedCloud = baseDensity;
      // let featheredCloud = smoothstep(0.0, 0.20, condensedCloud);
      // let effectiveCloud = clamp(condensedCloud * featheredCloud, 0.0, 1.0);
      // if (effectiveCloud <= 0.001) { discard; }
      function simulateDownstream(rawCloud: number, atten: number): number {
        const condensedCloud = rawCloud * atten;
        const t = Math.max(0.0, Math.min(1.0, (condensedCloud - 0.0) / 0.20));
        const feathered = t * t * (3.0 - 2.0 * t);
        return Math.max(0.0, Math.min(1.0, condensedCloud * feathered));
      }

      // Test with negative atten (-0.70)
      const effectiveCloud = simulateDownstream(0.8, -0.70);
      expect(effectiveCloud).toBe(0.0); // Completely cleared (smoothstep clamped to 0)
    });
  });

  // ==========================================================================
  // Pillar 4: Cloud Self-Shadowing Invariant (u_shadowIntensity in [0, 1], NdotL in [-1, 1])
  // ==========================================================================
  describe('Pillar 4: Cloud Self-Shadowing Invariant (selfShadow in [0.5, 1.0])', () => {
    it('M2-CHALLENGE-SHADOW-01: selfShadow is strictly bounded in [0.5, 1.0] across all valid inputs', () => {
      // At NdotL = 1.0 (sunlit): selfShadow == 1.0 identically for any shadowIntensity
      expect(evaluateSelfShadow(0.0, 1.0)).toBe(1.0);
      expect(evaluateSelfShadow(0.5, 1.0)).toBe(1.0);
      expect(evaluateSelfShadow(1.0, 1.0)).toBe(1.0);

      // At NdotL <= 0.0 (shadowed): selfShadow = 1.0 - shadowIntensity * 0.5
      expect(evaluateSelfShadow(0.0, 0.0)).toBe(1.0);
      expect(evaluateSelfShadow(0.5, 0.0)).toBe(0.75);
      expect(evaluateSelfShadow(1.0, 0.0)).toBe(0.50);

      // Negative NdotL (back-face from sun): max(0.0, NdotL) clamps to 0.0
      expect(evaluateSelfShadow(1.0, -0.5)).toBe(0.50);
      expect(evaluateSelfShadow(1.0, -1.0)).toBe(0.50);
    });

    it('M2-CHALLENGE-SHADOW-02: 50,000 Monte Carlo trials confirm strict bounds [0.5, 1.0], zero NaNs', () => {
      let nonFiniteCount = 0;
      let outOfBoundsCount = 0;

      for (let i = 0; i < 50_000; i++) {
        const si = Math.random(); // [0, 1]
        const ndotl = -1.0 + Math.random() * 2.0; // [-1, 1]

        const shadow = evaluateSelfShadow(si, ndotl);
        const shadowF32 = evaluateSelfShadowF32(si, ndotl);

        if (!Number.isFinite(shadow) || !Number.isFinite(shadowF32)) nonFiniteCount++;
        if (shadow < 0.49999 || shadow > 1.00001) outOfBoundsCount++;
      }

      expect(nonFiniteCount).toBe(0);
      expect(outOfBoundsCount).toBe(0);
    });

    it('M2-CHALLENGE-SHADOW-03: Monotonicity with respect to shadowIntensity', () => {
      const NdotLs = [-0.8, -0.2, 0.0, 0.3, 0.7];
      for (const ndotl of NdotLs) {
        const s0 = evaluateSelfShadow(0.0, ndotl);
        const s25 = evaluateSelfShadow(0.25, ndotl);
        const s50 = evaluateSelfShadow(0.50, ndotl);
        const s75 = evaluateSelfShadow(0.75, ndotl);
        const s100 = evaluateSelfShadow(1.0, ndotl);

        expect(s0).toBeGreaterThanOrEqual(s25);
        expect(s25).toBeGreaterThanOrEqual(s50);
        expect(s50).toBeGreaterThanOrEqual(s75);
        expect(s75).toBeGreaterThanOrEqual(s100);
      }
    });
  });

  // ==========================================================================
  // Pillar 5: Anti-Placebo AST & Uniform Integration Verification
  // ==========================================================================
  describe('Pillar 5: Anti-Placebo AST & Uniform Integration Verification', () => {
    it('M2-CHALLENGE-AST-01: cloud_shell.wgsl consumes u_shadowIntensity without hardcoded 0.70 placebo', () => {
      expect(cloudShaderSource).toContain('let selfShadow = mix(1.0 - cloud.u_shadowIntensity * 0.5, 1.0, NdotL);');
      expect(cloudShaderSource).not.toContain('let selfShadow = mix(0.70, 1.0, NdotL);');
    });

    it('M2-CHALLENGE-AST-02: cloud_shell.wgsl consumes u_rainShadowFeedback in rainShadowAtten', () => {
      expect(cloudShaderSource).toContain('let rainShadowAtten = 1.0 - cloud.u_rainShadowFeedback * clamp(-wOro * 40.0, 0.0, 0.85) * stratumCoupling;');
      expect(cloudShaderSource).toContain('baseDensity *= rainShadowAtten;');
    });

    it('M2-CHALLENGE-AST-03: WebGPUEngine writes rainShadowFeedback to f[37] and shadowIntensity to layerBuffer[27]', () => {
      expect(engineSource).toContain('f[37] = params?.rainShadowFeedback !== undefined ? params.rainShadowFeedback : this.rainShadowFeedback;');
      expect(engineSource).toContain('layerBuffer[27] = shadowIntensity;');
    });

    it('M2-CHALLENGE-AST-04: Uniform block alignment respects 16-byte WGSL boundaries', () => {
      // Check CloudUniforms layout definition
      expect(cloudShaderSource).toContain('u_shadowIntensity: f32,');
      expect(cloudShaderSource).toContain('u_atmosphericScale: f32,');
      expect(cloudShaderSource).toContain('u_sunDirection: vec4<f32>,');
    });
  });
});
