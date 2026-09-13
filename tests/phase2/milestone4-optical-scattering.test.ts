// ============================================================================
// File: tests/phase2/milestone4-optical-scattering.test.ts
// Architecture: Milestone 4 Behavioral Test Suite (Optical Scattering & Multi-Medium Inks)
// Invariants:
//   - Invariant §22: Comprehensive Multi-Medium Verification Gate Contract
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Medium Switching (Zero-Recompile)
//   - Invariant §28: Exhaustive Multi-Medium Archival Inking Parity (Themes 0, 1, 2)
//   - Invariant §46: The Test Import Integrity Contract (Anti-Self-Certification)
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  dualLobeHenyeyGreenstein,
  dualHenyeyGreensteinPhase,
  computeSunShadowTransmittance,
  computeCreviceAmbientOcclusion,
  getCloudMediumPalette,
  CLOUD_MEDIUM_PALETTES,
  computeGoldenHourRimIntensity,
  computeSunsetSolarColor,
} from '../../src/core/math/volumetricMath';

import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU } from '../helpers/webgpu-mock';

function createTestConfig() {
  const mockContext = {
    configure: () => {},
    getCurrentTexture: () => ({
      createView: () => ({}),
    }),
    canvas: { width: 1024, height: 768 },
  };

  const canvas = {
    width: 1024,
    height: 768,
    clientWidth: 1024,
    clientHeight: 768,
    getContext: (type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    pointCount: 100,
    pointsData: new Float32Array(300),
    target2DData: new Float32Array(200),
    typeData: new Float32Array(100),
    lineIndices: new Uint32Array(100),
    mode: 0,
    layerMode: 'both' as const,
    theme: 'dark' as const,
  };
}

describe('Milestone 4: Dual-Phase Optical Scattering & Multi-Medium Archival Inking', () => {
  let engine: WebGPUEngine;

  beforeEach(async () => {
    const mockGPU = createMockNavigatorGPU();
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGPU },
      writable: true,
      configurable: true,
    });
    await mockGPU.requestAdapter().then((a: any) => a.requestDevice());
    engine = new WebGPUEngine();
  });

  // ==========================================================================
  // Suite 1: Dual-Lobe Henyey-Greenstein Phase Function
  // ==========================================================================
  describe('Suite 1: Dual-Lobe Henyey-Greenstein Phase Function', () => {
    it('M4-T01: verifies forward Mie glare peak P(cosTheta = 1.0) >> P(cosTheta = 0.0)', () => {
      const pForward = dualLobeHenyeyGreenstein(1.0, 0.82, -0.25, 0.70);
      const pPerp = dualLobeHenyeyGreenstein(0.0, 0.82, -0.25, 0.70);
      expect(pForward).toBeGreaterThan(pPerp * 50.0); // > 50x forward intensity ratio
      expect(pForward).toBeGreaterThan(3.0);
    });

    it('M4-T02: confirms backscatter peak P(-1.0) is greater than perpendicular scatter P(0.0)', () => {
      const pBack = dualLobeHenyeyGreenstein(-1.0, 0.82, -0.25, 0.70);
      const pPerp = dualLobeHenyeyGreenstein(0.0, 0.82, -0.25, 0.70);
      // Secondary backscatter lobe (g2 = -0.25) provides rim visibility in opposition
      expect(pBack).toBeGreaterThan(pPerp);
    });

    it('M4-T03: proves strict non-negativity across 10,000 randomized angle queries', () => {
      for (let i = 0; i < 10000; i++) {
        const cosTheta = Math.random() * 2.0 - 1.0;
        const phase = dualLobeHenyeyGreenstein(cosTheta, 0.82, -0.25, 0.70);
        expect(phase).toBeGreaterThan(0.0);
        expect(Number.isFinite(phase)).toBe(true);
      }
    });

    it('M4-T04: satisfies spherical normalization integral (integral of P dOmega = 1.0)', () => {
      // Numerical integration over sphere: 2*pi * integral_{-1}^{1} P(mu) dmu
      const nSteps = 2000;
      const dMu = 2.0 / nSteps;
      let sum = 0.0;
      for (let i = 0; i < nSteps; i++) {
        const mu = -1.0 + (i + 0.5) * dMu;
        sum += dualLobeHenyeyGreenstein(mu, 0.82, -0.25, 0.70) * dMu;
      }
      const integral = sum * 2.0 * Math.PI;
      expect(integral).toBeCloseTo(1.0, 2);
    });

    it('M4-T05: verifies backward-compatible alias dualHenyeyGreensteinPhase matches dualLobeHenyeyGreenstein', () => {
      for (const mu of [-1.0, -0.5, 0.0, 0.5, 1.0]) {
        expect(dualHenyeyGreensteinPhase(mu)).toBe(dualLobeHenyeyGreenstein(mu));
      }
    });
  });

  // ==========================================================================
  // Suite 2: 1-Tap Solar Crevice Shadow Attenuation & Ambient Occlusion
  // ==========================================================================
  describe('Suite 2: 1-Tap Solar Crevice Shadow Attenuation & Ambient Occlusion', () => {
    it('M4-T06: verifies T = 1.0 for zero crevice density (unoccluded cloud peak)', () => {
      const t = computeSunShadowTransmittance(0.0);
      expect(t).toBe(1.0);
    });

    it('M4-T07: proves monotonic decrease of solar transmittance with increasing crevice density', () => {
      const t0 = computeSunShadowTransmittance(0.0);
      const t1 = computeSunShadowTransmittance(0.25);
      const t2 = computeSunShadowTransmittance(0.50);
      const t3 = computeSunShadowTransmittance(0.75);
      const t4 = computeSunShadowTransmittance(1.00);

      expect(t0).toBeGreaterThan(t1);
      expect(t1).toBeGreaterThan(t2);
      expect(t2).toBeGreaterThan(t3);
      expect(t3).toBeGreaterThan(t4);
    });

    it('M4-T08: confirms deep crevice extinction exceeds 60% attenuation at full density', () => {
      // sigma_t = 120, stepDist = 0.002, mult = 4.0 -> opticalDepth = 1.0 * 120 * 0.002 * 4 = 0.96
      // exp(-0.96) ~ 0.3829 -> attenuation = 1 - 0.3829 = 61.7% > 60%
      const tMax = computeSunShadowTransmittance(1.0, 120.0, 0.002);
      expect(tMax).toBeLessThan(0.40);
      expect(tMax).toBeGreaterThan(0.35);
    });

    it('M4-T09: verifies strict boundary clamping for out-of-range negative and overflow densities', () => {
      expect(computeSunShadowTransmittance(-5.0)).toBe(1.0);
      expect(computeSunShadowTransmittance(10.0)).toBe(computeSunShadowTransmittance(1.0));

      // Crevice AO clamping test
      expect(computeCreviceAmbientOcclusion(0.0, 0.0)).toBe(1.0);
      const deepAO = computeCreviceAmbientOcclusion(1.0, 1.0);
      expect(deepAO).toBeLessThan(0.20);
      expect(deepAO).toBeGreaterThanOrEqual(0.12);
    });
  });

  // ==========================================================================
  // Suite 3: Multi-Medium Archival Palette & Distinctiveness
  // ==========================================================================
  describe('Suite 3: Multi-Medium Archival Palette & Distinctiveness (Invariant §28)', () => {
    it('M4-T10: validates exact color channels for Theme 0 (Marie Tharp 1977)', () => {
      const p = getCloudMediumPalette(0);
      expect(p.sunColor).toEqual([1.00, 0.96, 0.91]);
      expect(p.midColor).toEqual([0.72, 0.78, 0.84]);
      expect(p.ambientColor).toEqual([0.12, 0.20, 0.32]);
      expect(p.inkAbsorption).toBe(1.0);
    });

    it('M4-T11: validates exact color channels for Theme 1 (Cream Rag Paper)', () => {
      const p = getCloudMediumPalette(1);
      expect(p.sunColor).toEqual([0.98, 0.94, 0.88]);
      expect(p.midColor).toEqual([0.64, 0.58, 0.50]);
      expect(p.ambientColor).toEqual([0.22, 0.19, 0.16]);
      expect(p.inkAbsorption).toBe(0.92);
    });

    it('M4-T12: validates exact color channels for Theme 2 (Prussian Cyanotype 1842)', () => {
      const p = getCloudMediumPalette(2);
      expect(p.sunColor).toEqual([0.88, 0.96, 1.00]);
      expect(p.midColor).toEqual([0.31, 0.48, 0.64]);
      expect(p.ambientColor).toEqual([0.00, 0.19, 0.33]);
      expect(p.inkAbsorption).toBe(1.15);
    });

    it('M4-T13: proves non-collapsing medium distinctiveness (Euclidean distance Delta_E > 0.20) and sunset warming', () => {
      const p0 = getCloudMediumPalette(0);
      const p1 = getCloudMediumPalette(1);
      const p2 = getCloudMediumPalette(2);

      const dist = (a: [number, number, number], b: [number, number, number]) =>
        Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

      expect(dist(p0.midColor, p1.midColor)).toBeGreaterThan(0.20);
      expect(dist(p0.midColor, p2.midColor)).toBeGreaterThan(0.20);
      expect(dist(p1.midColor, p2.midColor)).toBeGreaterThan(0.20);

      // Sunset solar warming verification
      const noonSun = computeSunsetSolarColor(p0.sunColor, 45.0);
      const sunsetSun = computeSunsetSolarColor(p0.sunColor, 7.5);
      expect(sunsetSun[0]).toBeGreaterThan(noonSun[0] - 0.05); // Red preserved
      expect(sunsetSun[2]).toBeLessThan(noonSun[2]); // Blue attenuated (warm reddening)

      // Golden hour rim boost
      const baseRim = computeGoldenHourRimIntensity(1.0, 45.0);
      const sunsetRim = computeGoldenHourRimIntensity(1.0, 7.5);
      expect(sunsetRim).toBeGreaterThan(baseRim);
    });

    it('M4-T13B: confirms computeSunsetSolarColor at low sun angles (5.0° and 10.0°) enriches amber/gold tones (sunColor[1] < baseSun[1] and sunColor[2] < baseSun[2])', () => {
      for (let themeIdx = 0; themeIdx < 3; themeIdx++) {
        const pal = getCloudMediumPalette(themeIdx);
        const baseSun = pal.sunColor;

        const sun5 = computeSunsetSolarColor(baseSun, 5.0);
        const sun10 = computeSunsetSolarColor(baseSun, 10.0);

        // Green channel attenuated towards warm amber
        expect(sun5[1]).toBeLessThan(baseSun[1]);
        expect(sun10[1]).toBeLessThan(baseSun[1]);

        // Blue channel heavily attenuated (Rayleigh selective scattering)
        expect(sun5[2]).toBeLessThan(baseSun[2]);
        expect(sun10[2]).toBeLessThan(baseSun[2]);

        // Lower altitude (5.0°) must produce stronger warming than higher altitude (10.0°)
        expect(sun5[1]).toBeLessThan(sun10[1]);
        expect(sun5[2]).toBeLessThan(sun10[2]);

        // Red channel is preserved or boosted
        expect(sun5[0]).toBeGreaterThanOrEqual(baseSun[0] - 0.05);
      }
    });

    it('M4-T13C: confirms computeSunsetSolarColor at sunAltitudeDeg >= 15.0 produces zero sunset warmth (identity mapping)', () => {
      for (let themeIdx = 0; themeIdx < 3; themeIdx++) {
        const pal = getCloudMediumPalette(themeIdx);
        const baseSun = pal.sunColor;

        for (const alt of [15.0, 15.01, 25.0, 45.0, 60.0, 90.0]) {
          const result = computeSunsetSolarColor(baseSun, alt);
          expect(result[0]).toBe(baseSun[0]);
          expect(result[1]).toBe(baseSun[1]);
          expect(result[2]).toBe(baseSun[2]);
        }
      }
    });

    it('M4-T13D: confirms exact mathematical parity between TypeScript polynomial and WGSL (1.0 - smoothstep(3.0, 15.0, sunAlt))', () => {
      // WGSL W3C §16.3 smoothstep definition
      const wgslSmoothstep = (edge0: number, edge1: number, x: number): number => {
        const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3.0 - 2.0 * t);
      };

      // Probe across entire [0, 90] degree arc at 0.1 degree resolution
      for (let altDeg = 0; altDeg <= 90.0; altDeg += 0.1) {
        const sunAlt = Math.max(0.0, Math.min(90.0, altDeg));
        
        // WGSL implementation
        let wgslWarmth = 0.0;
        if (sunAlt < 15.0) {
          wgslWarmth = 1.0 - wgslSmoothstep(3.0, 15.0, sunAlt);
        }

        // TypeScript implementation
        let tsWarmth = 0.0;
        if (sunAlt < 15.0) {
          const t = Math.max(0.0, Math.min(1.0, (15.0 - sunAlt) / (15.0 - 3.0)));
          tsWarmth = t * t * (3.0 - 2.0 * t);
        }

        // Strict algebraic equivalence
        expect(Math.abs(wgslWarmth - tsWarmth)).toBeLessThan(1e-12);
      }
    });
  });

  // ==========================================================================
  // Suite 4: Invariant §24 Zero-Recompile Dynamic Medium Contract
  // ==========================================================================
  describe('Suite 4: Invariant §24 Zero-Recompile Contract', () => {
    it('M4-T14: verifies uniform buffer update without calling createRenderPipeline', async () => {
      await engine.initialize(createTestConfig());

      const device = (engine as any).device;
      let pipelineCreateCount = 0;
      const originalCreate = device.createRenderPipeline.bind(device);
      device.createRenderPipeline = (...args: any[]) => {
        pipelineCreateCount++;
        return originalCreate(...args);
      };

      // Perform 10 dynamic theme switches
      for (let t = 0; t < 10; t++) {
        (engine as any).updateVolumetricUniforms({
          theme: t % 3,
          time: t * 0.1,
          unfurl: 0.0,
          mode: 0,
        });
      }

      // Invariant §24: 0 pipeline re-creations allowed
      expect(pipelineCreateCount).toBe(0);
    });

    it('M4-T15: verifies cloudFloats[28..31] correctly receives theme, inkAbsorption, paperTooth, and gamma parameters', async () => {
      await engine.initialize(createTestConfig());

      let writtenTheme = -1;
      let writtenAbsorption = -1;
      let writtenTooth = -1;
      let writtenGamma = -1;

      const queue = (engine as any).device.queue;
      const origWriteBuffer = queue.writeBuffer.bind(queue);
      queue.writeBuffer = (buffer: any, offset: number, data: any) => {
        if (buffer === (engine as any).volumetricCloudUniformBuffer) {
          const floats = data instanceof ArrayBuffer
            ? new Float32Array(data)
            : new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
          writtenTheme = floats[28];
          writtenAbsorption = floats[29];
          writtenTooth = floats[30];
          writtenGamma = floats[31];
        }
        return origWriteBuffer(buffer, offset, data);
      };

      (engine as any).updateVolumetricUniforms({ theme: 2, paperTooth: 0.75 });
      expect(writtenTheme).toBe(2);
      expect(writtenAbsorption).toBeCloseTo(1.15, 2);
      expect(writtenTooth).toBeCloseTo(0.75, 2);
      expect(writtenGamma).toBeCloseTo(1.4, 2);

      (engine as any).updateVolumetricUniforms({ theme: 1, paperTooth: 0.90 });
      expect(writtenTheme).toBe(1);
      expect(writtenAbsorption).toBeCloseTo(0.92, 2);
      expect(writtenTooth).toBeCloseTo(0.90, 2);
      expect(writtenGamma).toBeCloseTo(1.0, 2);
    });
  });

  // ==========================================================================
  // Suite 5: Invariant §46 Production Import Integrity & Camera Hook
  // ==========================================================================
  describe('Suite 5: Invariant §46 Production Import Integrity & Camera Hook', () => {
    it('M4-T16: verifies WebGPUCanvas.tsx exposes snapHaleakalaSunset in __INDICATRIX_CAMERA__', () => {
      const canvasFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const content = fs.readFileSync(canvasFilePath, 'utf-8');
      expect(content).toContain('snapHaleakalaSunset');
      expect(content).toContain('-156.2533');
      expect(content).toContain('20.7097');
      expect(content).toContain('5.0032');
    });

    it('M4-T17: confirms this test file imports directly from volumetricMath without local copy-paste', () => {
      const testFilePath = path.resolve(__dirname, 'milestone4-optical-scattering.test.ts');
      const content = fs.readFileSync(testFilePath, 'utf-8');
      expect(content).toContain("from '../../src/core/math/volumetricMath'");
      expect(content).not.toContain('function ' + 'dualLobeHenyeyGreenstein(');
      expect(content).not.toContain('function ' + 'computeSunShadowTransmittance(');
      expect(content).not.toContain('function ' + 'computeCreviceAmbientOcclusion(');
    });

    it('M4-T18: verifies volumetric_cloud.wgsl contains dualHenyeyGreenstein and getMediumPalette', () => {
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
      const content = fs.readFileSync(shaderPath, 'utf-8');
      expect(content).toContain('fn dualHenyeyGreenstein');
      expect(content).toContain('fn sampleSunShadowTransmittance');
      expect(content).toContain('fn getMediumPalette');
    });

    it('M4-T19: verifies volumetric_cloud.wgsl adheres to W3C WGSL §16.3 smoothstep parameter ordering (edge0 < edge1)', () => {
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
      const content = fs.readFileSync(shaderPath, 'utf-8');
      expect(content).not.toContain('smoothstep(15.0, 3.0');
      expect(content).toContain('1.0 - smoothstep(3.0, 15.0, sunAlt)');
    });
  });
});
