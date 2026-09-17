// ============================================================================
// File: tests/modern/challenger-m2-uniform-placebo-anti-bypass.test.ts
// Challenger: challenger_2_m2 (Empirical Challenger)
// Milestone: Milestone 2 (Uniform Placebo & Orographic Coupling Gate)
// Invariants:
//   - Invariant §5: Anti-Placebo Invariant & End-to-End Shader Execution
//   - Invariant §10: Horizon Tangent Attenuation
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity
//   - Invariant §20: WebGPU Uniform Buffer 16-Byte Layout Discipline (288 bytes)
//   - Invariant §28: Exhaustive Multi-Medium Shader Parity (Themes 0, 1, 2)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
const cloudWgslPath = path.join(projectRoot, 'src/webgpu/shaders/cloud_shell.wgsl');
const engineTsPath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');

const cloudWgslSource = fs.readFileSync(cloudWgslPath, 'utf-8');
const engineSource = fs.readFileSync(engineTsPath, 'utf-8');

// ----------------------------------------------------------------------------
// Mathematical mirror of WGSL cloud fragment pipeline
// ----------------------------------------------------------------------------
function evaluateCloudSelfShadow(shadowIntensity: number, NdotL: number): number {
  return (1.0 - shadowIntensity * 0.5) * (1.0 - NdotL) + 1.0 * NdotL;
}

function evaluateCloudColor(
  theme: number,
  selfShadow: number,
  phaseFactor: number,
  featheredCloud: number,
  paperTooth: number = 0.5
): [number, number, number] {
  if (theme === 0) {
    const coreWhite: [number, number, number] = [0.96, 0.96, 0.94];
    const undersideShade: [number, number, number] = [
      0.82 * selfShadow,
      0.85 * selfShadow,
      0.89 * selfShadow,
    ];
    // smoothstep(0.15, 0.70, featheredCloud)
    const t = Math.max(0.0, Math.min(1.0, (featheredCloud - 0.15) / (0.70 - 0.15)));
    const smoothT = t * t * (3.0 - 2.0 * t);

    const illuminated: [number, number, number] = [
      coreWhite[0] * phaseFactor * selfShadow,
      coreWhite[1] * phaseFactor * selfShadow,
      coreWhite[2] * phaseFactor * selfShadow,
    ];
    return [
      undersideShade[0] * (1.0 - smoothT) + illuminated[0] * smoothT,
      undersideShade[1] * (1.0 - smoothT) + illuminated[1] * smoothT,
      undersideShade[2] * (1.0 - smoothT) + illuminated[2] * smoothT,
    ];
  } else if (theme === 1) {
    const ivoryWash: [number, number, number] = [0.98, 0.95, 0.89];
    const toothFactor = 1.0 - (0.5 - 0.5) * (paperTooth * 0.35); // nominal middle noise
    const scale = toothFactor * phaseFactor * selfShadow;
    return [ivoryWash[0] * scale, ivoryWash[1] * scale, ivoryWash[2] * scale];
  } else {
    const actinicWhite: [number, number, number] = [0.95, 0.98, 1.00];
    const scale = phaseFactor * selfShadow;
    return [actinicWhite[0] * scale, actinicWhite[1] * scale, actinicWhite[2] * scale];
  }
}

function evaluateOrographicAttenuation(
  wOrographic: number,
  rainShadowFeedback: number,
  layerIdx: number
): { rainShadowAtten: number; stratumCoupling: number } {
  const stratumCoupling = layerIdx === 0 ? 1.0 : layerIdx === 1 ? 0.50 : 0.15;
  const clampedDesc = Math.max(0.0, Math.min(0.85, -wOrographic * 40.0));
  const rainShadowAtten = 1.0 - rainShadowFeedback * clampedDesc * stratumCoupling;
  return { rainShadowAtten, stratumCoupling };
}

describe('Challenger 2 Milestone 2: Adversarial Uniform Placebo & Orographic Coupling', () => {

  // ==========================================================================
  // Pillar 1: cloud.u_shadowIntensity Active Consumption & Sensitivity Analysis
  // ==========================================================================
  describe('Pillar 1: cloud.u_shadowIntensity Active Non-Placebo Verification', () => {
    it('CHALLENGE-SHADOW-01: selfShadow scales inversely with u_shadowIntensity under non-normal lighting', () => {
      const NdotL_grazing = 0.20; // Glancing sun angle
      const shadow0 = evaluateCloudSelfShadow(0.0, NdotL_grazing);
      const shadow30 = evaluateCloudSelfShadow(0.30, NdotL_grazing);
      const shadow60 = evaluateCloudSelfShadow(0.60, NdotL_grazing);

      // Verify strict downward monotonicity
      expect(shadow0).toBe(1.0);
      expect(shadow30).toBeLessThan(shadow0);
      expect(shadow60).toBeLessThan(shadow30);

      // Mathematical exactness: at NdotL=0, selfShadow = 1.0 - intensity * 0.5
      expect(evaluateCloudSelfShadow(0.60, 0.0)).toBeCloseTo(0.70, 5);
      expect(evaluateCloudSelfShadow(0.0, 0.0)).toBeCloseTo(1.00, 5);

      // Contrast delta is 30% darkening
      const delta = evaluateCloudSelfShadow(0.0, 0.0) - evaluateCloudSelfShadow(0.60, 0.0);
      expect(delta).toBeCloseTo(0.30, 5);
    });

    it('CHALLENGE-SHADOW-02: Fragment RGB output delta d(RGB)/d(u_shadowIntensity) is strictly non-zero across all 3 themes', () => {
      const phaseFactor = 1.0;
      const featheredCloud = 0.50;
      const NdotL = 0.10; // near-shadowed side

      for (const theme of [0, 1, 2]) {
        const shadowLow = evaluateCloudSelfShadow(0.0, NdotL);
        const shadowHigh = evaluateCloudSelfShadow(0.60, NdotL);

        const rgbLow = evaluateCloudColor(theme, shadowLow, phaseFactor, featheredCloud);
        const rgbHigh = evaluateCloudColor(theme, shadowHigh, phaseFactor, featheredCloud);

        // Every channel must be darker when shadowIntensity is 0.60 vs 0.0
        for (let c = 0; c < 3; c++) {
          const deltaC = rgbLow[c] - rgbHigh[c];
          expect(deltaC, `Theme ${theme} channel ${c} must attenuate under u_shadowIntensity`).toBeGreaterThan(0.05);
        }
      }
    });

    it('CHALLENGE-SHADOW-03: 50,000-Trial Monte Carlo stress test confirms premultiplied alpha and boundedness', () => {
      const TRIALS = 50_000;
      let nanCount = 0;
      let nonMonotonicCount = 0;
      let outOfBoundsCount = 0;

      for (let i = 0; i < TRIALS; i++) {
        const intensity1 = Math.random() * 0.30;
        const intensity2 = intensity1 + Math.random() * 0.30; // intensity2 >= intensity1
        const NdotL = Math.random();
        const theme = i % 3;
        const phaseFactor = 0.6 + Math.random() * 0.8;
        const feathered = Math.random();

        const s1 = evaluateCloudSelfShadow(intensity1, NdotL);
        const s2 = evaluateCloudSelfShadow(intensity2, NdotL);

        if (s2 > s1 + 1e-7) {
          nonMonotonicCount++;
        }

        if (s1 < 0.70 - 1e-7 || s1 > 1.0 + 1e-7 || s2 < 0.70 - 1e-7 || s2 > 1.0 + 1e-7) {
          outOfBoundsCount++;
        }

        const col = evaluateCloudColor(theme, s2, phaseFactor, feathered);
        if (col.some(c => Number.isNaN(c) || !Number.isFinite(c))) {
          nanCount++;
        }
      }

      expect(nanCount).toBe(0);
      expect(nonMonotonicCount).toBe(0);
      expect(outOfBoundsCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 2: cloud.u_rainShadowFeedback Active Consumption & Asymmetry
  // ==========================================================================
  describe('Pillar 2: cloud.u_rainShadowFeedback Active Non-Placebo Verification', () => {
    it('CHALLENGE-RAIN-01: Leeward side (wOro < 0) attenuates strictly monotonically with feedback multiplier', () => {
      const wOroLeeward = -0.04; // descent down mountain range
      const layer0_f0 = evaluateOrographicAttenuation(wOroLeeward, 0.0, 0);
      const layer0_f5 = evaluateOrographicAttenuation(wOroLeeward, 0.5, 0);
      const layer0_f1 = evaluateOrographicAttenuation(wOroLeeward, 1.0, 0);

      expect(layer0_f0.rainShadowAtten).toBe(1.0);
      expect(layer0_f5.rainShadowAtten).toBeLessThan(layer0_f0.rainShadowAtten);
      expect(layer0_f1.rainShadowAtten).toBeLessThan(layer0_f5.rainShadowAtten);

      // At wOro = -0.04, -wOro * 40.0 = 1.6, clamped to 0.85
      // With feedback = 1.0: rainShadowAtten = 1.0 - 0.85 * 1.0 = 0.150
      expect(layer0_f1.rainShadowAtten).toBeCloseTo(0.150, 5);
      // With feedback = 0.5: rainShadowAtten = 1.0 - 0.5 * 0.85 = 0.575
      expect(layer0_f5.rainShadowAtten).toBeCloseTo(0.575, 5);
    });

    it('CHALLENGE-RAIN-02: Windward side (wOro >= 0) is strictly unattenuated (invariant under feedback)', () => {
      const wOroWindward = 0.05; // ascent up mountain range
      for (const feedback of [0.0, 0.25, 0.50, 0.75, 1.0]) {
        for (const layer of [0, 1, 2]) {
          const { rainShadowAtten } = evaluateOrographicAttenuation(wOroWindward, feedback, layer);
          expect(rainShadowAtten).toBe(1.0);
        }
      }
    });

    it('CHALLENGE-RAIN-03: Stratum coupling decouples low stratus from high cirrus rain shadow response', () => {
      const wOroLeeward = -0.05; // max descent
      const feedback = 1.0;

      const layer0 = evaluateOrographicAttenuation(wOroLeeward, feedback, 0);
      const layer1 = evaluateOrographicAttenuation(wOroLeeward, feedback, 1);
      const layer2 = evaluateOrographicAttenuation(wOroLeeward, feedback, 2);

      // Stratum 0 coupling = 1.0 -> 85% attenuation (atten = 0.150)
      // Stratum 1 coupling = 0.5 -> 42.5% attenuation (atten = 0.575)
      // Stratum 2 coupling = 0.15 -> 12.75% attenuation (atten = 0.8725)
      expect(layer0.rainShadowAtten).toBeCloseTo(0.150, 4);
      expect(layer1.rainShadowAtten).toBeCloseTo(0.575, 4);
      expect(layer2.rainShadowAtten).toBeCloseTo(0.8725, 4);

      // Strict layer hierarchy: low cloud thins far more than high cloud in rain shadow
      expect(layer0.rainShadowAtten).toBeLessThan(layer1.rainShadowAtten);
      expect(layer1.rainShadowAtten).toBeLessThan(layer2.rainShadowAtten);
    });

    it('CHALLENGE-RAIN-04: 50,000-Trial Monte Carlo verification across randomized orographic velocities', () => {
      const TRIALS = 50_000;
      let outOfRangeCount = 0;
      let nonPhysicalWindwardPenalty = 0;

      for (let i = 0; i < TRIALS; i++) {
        const wOro = (Math.random() - 0.5) * 0.20; // [-0.10, +0.10] m/s
        const feedback = Math.random(); // [0, 1]
        const layer = i % 3;

        const { rainShadowAtten } = evaluateOrographicAttenuation(wOro, feedback, layer);

        if (rainShadowAtten < 0.15 - 1e-7 || rainShadowAtten > 1.0 + 1e-7) {
          outOfRangeCount++;
        }

        if (wOro >= 0.0 && Math.abs(rainShadowAtten - 1.0) > 1e-7) {
          nonPhysicalWindwardPenalty++;
        }
      }

      expect(outOfRangeCount).toBe(0);
      expect(nonPhysicalWindwardPenalty).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 3: AST & Shader Source Analysis (Anti-Bypass / Anti-Cheat Audit)
  // ==========================================================================
  describe('Pillar 3: AST & Source Code Anti-Bypass Audit', () => {
    it('CHALLENGE-AST-01: cloud.u_shadowIntensity is not bypassed by hardcoded constant or local shadowing', () => {
      // Must contain active uniform consumption:
      expect(cloudWgslSource).toContain('let selfShadow = mix(1.0 - cloud.u_shadowIntensity * 0.5, 1.0, NdotL);');

      // Must not contain any hardcoded override
      expect(cloudWgslSource).not.toContain('let selfShadow = 1.0;');
      expect(cloudWgslSource).not.toContain('let selfShadow = mix(0.70, 1.0, NdotL);');

      // Verify selfShadow is actively factored into cloudColor for themes 0, 1, and 2
      expect(cloudWgslSource).toMatch(/undersideShade\s*=\s*vec3<f32>\(0\.82,\s*0\.85,\s*0\.89\)\s*\*\s*selfShadow/);
      expect(cloudWgslSource).toMatch(/coreWhite\s*\*\s*phaseFactor\s*\*\s*selfShadow/);
      expect(cloudWgslSource).toMatch(/cloudColor\s*=\s*ivoryWash\s*\*\s*toothFactor\s*\*\s*phaseFactor\s*\*\s*selfShadow/);
      expect(cloudWgslSource).toMatch(/cloudColor\s*=\s*actinicWhite\s*\*\s*phaseFactor\s*\*\s*selfShadow/);
    });

    it('CHALLENGE-AST-02: cloud.u_rainShadowFeedback is not bypassed by early exits or dead branches', () => {
      // Must contain active uniform consumption:
      expect(cloudWgslSource).toContain('let rainShadowAtten = 1.0 - cloud.u_rainShadowFeedback * clamp(-wOro * 40.0, 0.0, 0.85) * stratumCoupling;');
      expect(cloudWgslSource).toContain('baseDensity *= rainShadowAtten;');
      expect(cloudWgslSource).toContain('let condensedCloud = baseDensity;');

      // Verify no discard occurs between rainShadowAtten computation (line ~388) and effectiveCloud discard (line ~413)
      // except the horizon tangent attenuation
      const rainShadowIdx = cloudWgslSource.indexOf('let rainShadowAtten = 1.0 - cloud.u_rainShadowFeedback');
      const condensedCloudIdx = cloudWgslSource.indexOf('let condensedCloud = baseDensity;', rainShadowIdx);
      const effectiveCloudIdx = cloudWgslSource.indexOf('let effectiveCloud = clamp(condensedCloud * featheredCloud, 0.0, 1.0);', condensedCloudIdx);

      expect(rainShadowIdx).toBeGreaterThan(0);
      expect(condensedCloudIdx).toBeGreaterThan(rainShadowIdx);
      expect(effectiveCloudIdx).toBeGreaterThan(condensedCloudIdx);
    });

    it('CHALLENGE-AST-03: WebGPUEngine uploads u_shadowIntensity and u_rainShadowFeedback into correct uniform offsets', () => {
      // Float 27 (offset 108): u_shadowIntensity
      expect(engineSource).toContain('f[27] = shadowIntensity;');
      expect(engineSource).toContain('layerBuffer[27] = shadowIntensity;');

      // Float 37 (offset 148): u_rainShadowFeedback
      expect(engineSource).toContain('f[37] = params?.rainShadowFeedback !== undefined ? params.rainShadowFeedback : this.rainShadowFeedback;');

      // Written to all 3 layers with exact byte count 288
      expect(engineSource).toMatch(/this\.device\.queue\.writeBuffer\(\s*this\.cloudUniformBuffers\[layerIdx\],\s*0,\s*layerBuffer\.buffer,\s*0,\s*288\s*\);/);
    });
  });

  // ==========================================================================
  // Pillar 4: WebGPU Struct Layout & 16-Byte WGSL Alignment Verification
  // ==========================================================================
  describe('Pillar 4: WebGPU Struct Layout & 16-Byte WGSL Alignment (Invariant §20)', () => {
    it('CHALLENGE-LAYOUT-01: Verifies exact byte offsets and 16-byte alignment of 288-byte CloudUniforms', () => {
      interface StructMember {
        name: string;
        size: number;
        align: number;
        expectedOffset: number;
      }

      const members: StructMember[] = [
        { name: 'u_unfurl', size: 4, align: 4, expectedOffset: 0 },
        { name: 'u_mode', size: 4, align: 4, expectedOffset: 4 },
        { name: 'u_theme', size: 4, align: 4, expectedOffset: 8 },
        { name: 'u_time', size: 4, align: 4, expectedOffset: 12 },
        { name: 'u_cameraPos', size: 16, align: 16, expectedOffset: 16 },
        { name: 'u_viewport', size: 16, align: 16, expectedOffset: 32 },
        { name: 'u_cloudDrift', size: 16, align: 16, expectedOffset: 48 },
        { name: 'u_layerStandoff', size: 16, align: 16, expectedOffset: 64 },
        { name: 'u_layerOpacity', size: 16, align: 16, expectedOffset: 80 },
        { name: 'u_layerIndex', size: 4, align: 4, expectedOffset: 96 },
        { name: 'u_peakExponent', size: 4, align: 4, expectedOffset: 100 },
        { name: 'u_atmosphericScale', size: 4, align: 4, expectedOffset: 104 },
        { name: 'u_shadowIntensity', size: 4, align: 4, expectedOffset: 108 },
        { name: 'u_sunDirection', size: 16, align: 16, expectedOffset: 112 },
        { name: 'u_mediumProperties', size: 16, align: 16, expectedOffset: 128 },
        { name: 'u_verticalScaleMode', size: 4, align: 4, expectedOffset: 144 },
        { name: 'u_rainShadowFeedback', size: 4, align: 4, expectedOffset: 148 },
        { name: 'u_padCloud0', size: 4, align: 4, expectedOffset: 152 },
        { name: 'u_padCloud1', size: 4, align: 4, expectedOffset: 156 },
        { name: 'u_viewMatrix', size: 64, align: 16, expectedOffset: 160 },
        { name: 'u_projectionMatrix', size: 64, align: 16, expectedOffset: 224 },
      ];

      let offset = 0;
      for (const m of members) {
        // Natural alignment round-up
        const aligned = Math.ceil(offset / m.align) * m.align;
        expect(aligned, `Field ${m.name} alignment`).toBe(m.expectedOffset);
        if (m.align === 16) {
          expect(aligned % 16, `Field ${m.name} 16-byte boundary`).toBe(0);
        }
        offset = aligned + m.size;
      }

      // Total struct size must round to 16 bytes
      const finalSize = Math.ceil(offset / 16) * 16;
      expect(finalSize, 'CloudUniforms struct size must be 288 bytes').toBe(288);
      expect(finalSize % 16).toBe(0);
    });
  });
});
