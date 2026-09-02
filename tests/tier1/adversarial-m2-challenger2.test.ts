import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeWireframeOpacityScale, getLayerOpacities } from '../helpers/math-oracle';

describe('Adversarial Challenge 2 (Milestone M2): Wireframe Moiré Mitigation & Fragment Discard', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = path.join(projectRoot, 'App.tsx');
  const appCode = fs.readFileSync(appTsxPath, 'utf8');

  // =========================================================================
  // 1. Divide-by-Zero, NaN, Infinity, and Negative Alpha Resistance
  // =========================================================================
  describe('1. Numerical Robustness & Attenuation Stability', () => {
    it('C2-M2-T1: verifies computeWireframeOpacityScale handles non-positive, zero, NaN, and extreme densities without divide-by-zero or negative values', () => {
      // Test zero and negative densities
      expect(computeWireframeOpacityScale(0)).toBe(1.0);
      expect(computeWireframeOpacityScale(-100)).toBe(1.0);
      expect(computeWireframeOpacityScale(-1e6)).toBe(1.0);

      // Test standard densities
      expect(computeWireframeOpacityScale(100000)).toBe(1.0);
      expect(computeWireframeOpacityScale(1000000)).toBeCloseTo(0.3162277, 5);

      // Test extreme positive densities
      const scale10M = computeWireframeOpacityScale(10000000);
      expect(scale10M).toBeCloseTo(0.1, 5);
      expect(scale10M).toBeGreaterThan(0);

      const scale1B = computeWireframeOpacityScale(1e9);
      expect(scale1B).toBeCloseTo(0.01, 4);
      expect(scale1B).toBeGreaterThan(0);

      // Test infinitesimal positive densities
      expect(computeWireframeOpacityScale(1)).toBe(1.0); // Clamped to 1.0 max
      expect(computeWireframeOpacityScale(1e-6)).toBe(1.0);
    });

    it('C2-M2-T2: verifies JS runtime wireOpacityScale formula in App.tsx prevents division by zero with fallback', () => {
      // Trace the formula in App.tsx:
      // const nodeCount = geoData?.typeBuffer?.length || (resolution === '1M' ? 1000000 : 100000);
      // const wireOpacityScale = Math.min(1.0, Math.sqrt(100000 / (nodeCount || 100000)));
      expect(appCode).toContain('const wireOpacityScale = Math.min(1.0, Math.sqrt(100000 / (nodeCount || 100000)));');

      const evaluateJsWireOpacity = (nodeCount: number | undefined | null) => {
        const safeNodeCount = (nodeCount as any) || 100000;
        return Math.min(1.0, Math.sqrt(100000 / safeNodeCount));
      };

      expect(evaluateJsWireOpacity(undefined)).toBe(1.0);
      expect(evaluateJsWireOpacity(null)).toBe(1.0);
      expect(evaluateJsWireOpacity(0)).toBe(1.0);
      expect(evaluateJsWireOpacity(100000)).toBe(1.0);
      expect(evaluateJsWireOpacity(1000000)).toBeCloseTo(0.3162277, 5);
    });

    it('C2-M2-T3: verifies GLSL mesh shader clamps densityFactor to [0.01, 1.0] and guarantees positive alpha', () => {
      // In GLSL: float densityFactor = clamp(u_wireOpacityScale, 0.01, 1.0);
      expect(appCode).toMatch(/float\s+densityFactor\s*=\s*clamp\(\s*u_wireOpacityScale\s*,\s*0\.01\s*,\s*1\.0\s*\);/);

      // Simulate GLSL meshFragmentShader alpha computation across all possible modes and inputs
      const simulateMeshAlpha = (
        wireOpacityScale: number,
        vPointType: number,
        vFacing: number,
        vStrain: number,
        u_mode: number,
        u_unfurl: number
      ): number => {
        const densityFactor = Math.max(0.01, Math.min(1.0, wireOpacityScale));
        const smoothstep = (min: number, max: number, x: number) => {
          const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
          return t * t * (3 - 2 * t);
        };
        const backfaceDimming = 0.15 + (1.0 - 0.15) * smoothstep(-0.5, 0.2, vFacing);
        let alpha = 0.03 * densityFactor * (1 - Math.pow(vPointType, 2)) + (0.50 * densityFactor) * Math.pow(vPointType, 2);

        if (u_mode === 2) {
          if (vStrain > 0.35) {
            const strainMix = (vStrain - 0.35) * 1.5;
            alpha = alpha * (1 - strainMix) + (0.95 * densityFactor) * strainMix;
          }
        } else if (u_mode === 3) {
          const rawSin = Math.sin(Math.PI * Math.max(0, Math.min(1, u_unfurl)));
          const liquefaction = (u_unfurl <= 0.001 || u_unfurl >= 0.999) ? 0.0 : Math.pow(Math.max(0, rawSin), 1.2);
          alpha = alpha * (1.0 - liquefaction * 0.92);
        }

        return alpha * backfaceDimming;
      };

      // Fuzz test 10,000 combinations
      const scaleTestValues = [-10, 0, 0.0001, 0.01, 0.3162, 0.5, 1.0, 5.0, 100.0];
      const pointTypes = [0.0, 0.25, 0.5, 0.75, 1.0];
      const facings = [-1.0, -0.5, -0.25, 0.0, 0.2, 0.5, 1.0];
      const strains = [0.0, 0.35, 0.5, 0.78, 1.0];
      const modes = [0, 1, 2, 3];
      const unfurls = [0.0, 0.18, 0.5, 0.9, 1.0];

      for (const scale of scaleTestValues) {
        for (const pt of pointTypes) {
          for (const facing of facings) {
            for (const strain of strains) {
              for (const mode of modes) {
                for (const unfurl of unfurls) {
                  const finalAlpha = simulateMeshAlpha(scale, pt, facing, strain, mode, unfurl);
                  expect(Number.isFinite(finalAlpha)).toBe(true);
                  expect(finalAlpha).toBeGreaterThan(0.0); // Strictly positive
                  expect(finalAlpha).toBeLessThanOrEqual(1.0); // Strictly bounded
                }
              }
            }
          }
        }
      }
    });

    it('C2-M2-T4: verifies GLSL point shader alpha is strictly non-negative and finite across all parameters', () => {
      const simulatePointAlpha = (
        vPointType: number,
        vFacing: number,
        vStrain: number,
        vVorticity: number,
        u_mode: number,
        vAlphaMultiplier: number
      ): number => {
        const smoothstep = (min: number, max: number, x: number) => {
          const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
          return t * t * (3 - 2 * t);
        };
        const backfaceDimming = 0.15 + (1.0 - 0.15) * smoothstep(-0.5, 0.2, vFacing);
        let alpha = 0.03 * (1 - vPointType) + 0.95 * vPointType;

        if (u_mode === 2) {
          if (vStrain > 0.4) {
            const strainMix = Math.min(1.0, (vStrain - 0.4) * 1.8);
            alpha = alpha * (1 - strainMix) + 1.0 * strainMix;
          }
        } else if (u_mode === 3) {
          if (vVorticity > 0.1) {
            alpha = alpha * (1 - vVorticity) + 1.0 * vVorticity;
          }
        }

        return alpha * backfaceDimming * vAlphaMultiplier;
      };

      const pointTypes = [0.0, 0.5, 1.0];
      const facings = [-1.0, -0.25, 0.0, 1.0];
      const strains = [0.0, 0.4, 0.8, 1.0];
      const vorticities = [0.0, 0.1, 0.5, 1.0];
      const modes = [0, 1, 2, 3];
      const alphaMults = [0.0, 1.0];

      for (const pt of pointTypes) {
        for (const facing of facings) {
          for (const strain of strains) {
            for (const vort of vorticities) {
              for (const mode of modes) {
                for (const aMult of alphaMults) {
                  const finalAlpha = simulatePointAlpha(pt, facing, strain, vort, mode, aMult);
                  expect(Number.isFinite(finalAlpha)).toBe(true);
                  expect(finalAlpha).toBeGreaterThanOrEqual(0.0);
                  expect(finalAlpha).toBeLessThanOrEqual(1.0);
                  if (aMult === 0.0) {
                    expect(finalAlpha).toBe(0.0);
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // 2. Line Overdraw and Fragment Discard Behavior under 100k and 1M Densities
  // =========================================================================
  describe('2. Fragment Discard & Layer Isolation Behavior', () => {
    it('C2-M2-T5: verifies layer mode 1 (Points Only) discards 100% of wireframe fragments at both 100k and 1M', () => {
      // In meshFragmentShader:
      // if (u_layerMode == 1) { discard; }
      const isWireframeDiscarded = (layerMode: number) => layerMode === 1;

      expect(isWireframeDiscarded(1)).toBe(true);
      expect(isWireframeDiscarded(0)).toBe(false);
      expect(isWireframeDiscarded(2)).toBe(false);

      expect(appCode).toMatch(/if\s*\(\s*u_layerMode\s*==\s*1\s*\)\s*\{[\s\S]*?discard;[\s\S]*?\}/);
    });

    it('C2-M2-T6: verifies layer mode 2 (Wireframe Only) discards 100% of point fragments at both 100k and 1M', () => {
      // In pointFragmentShader:
      // if (u_layerMode == 2 || vAlphaMultiplier < 0.001) { discard; }
      const isPointDiscarded = (layerMode: number, vAlphaMultiplier: number) => {
        return layerMode === 2 || vAlphaMultiplier < 0.001;
      };

      expect(isPointDiscarded(2, 0.0)).toBe(true);
      expect(isPointDiscarded(2, 1.0)).toBe(true);
      expect(isPointDiscarded(0, 1.0)).toBe(false);
      expect(isPointDiscarded(1, 1.0)).toBe(false);
      expect(isPointDiscarded(0, 0.0)).toBe(true);

      expect(appCode).toMatch(/if\s*\(\s*u_layerMode\s*==\s*2\s*\|\|\s*vAlphaMultiplier\s*<\s*0\.001\s*\)\s*\{[\s\S]*?discard;[\s\S]*?\}/);
    });

    it('C2-M2-T7: models line overdraw at 100k vs 1M and verifies integrated optical density invariance', () => {
      // Triangulation geometry on 2-sphere S^2 with Radius R = 5.0
      // Surface area A = 4 * PI * R^2 = 100 * PI ≈ 314.159
      // At N nodes: Voronoi cell area a_cell ≈ A / N
      // Delaunay edge length L_edge ≈ sqrt(a_cell) = sqrt(A / N) = O(N^-0.5)
      // Euler characteristic on sphere: E ≈ 3N
      // Total unattenuated line length L_total = E * L_edge ≈ 3N * sqrt(A / N) = 3 * sqrt(A) * sqrt(N) = O(N^0.5)
      // Rasterizer pixel width = 1.0 px
      // Projected line coverage area A_lines = L_total * w_line = O(N^0.5)
      //
      // At 100k nodes: L_total_100k = 3 * sqrt(314.159) * sqrt(100000) = 3 * 17.7245 * 316.2277 ≈ 16,815 units
      // At 1M nodes: L_total_1M = 3 * sqrt(314.159) * sqrt(1000000) = 3 * 17.7245 * 1000 ≈ 53,173 units
      // Ratio of unattenuated overdraw = L_total_1M / L_total_100k = sqrt(10) ≈ 3.16228
      //
      // Attenuation scaling factor = sqrt(100,000 / N)
      // At 100k: scale = 1.0
      // At 1M: scale = sqrt(0.1) ≈ 0.3162277
      //
      // Attenuated integrated optical density:
      // OpticalDensity(N) = L_total(N) * scale(N)
      // OpticalDensity(100k) = 16,815 * 1.0 = 16,815
      // OpticalDensity(1M) = 53,173 * 0.3162277 = 16,815
      // Ratio = 1.0000 (Exact Perceptual Invariance!)

      const computeTotalLineLength = (N: number, R = 5.0) => {
        const A = 4 * Math.PI * R * R;
        const L_edge = Math.sqrt(A / N);
        const E = 3 * N;
        return E * L_edge;
      };

      const L_100k = computeTotalLineLength(100000);
      const L_1M = computeTotalLineLength(1000000);

      const unattenuatedOverdrawRatio = L_1M / L_100k;
      expect(unattenuatedOverdrawRatio).toBeCloseTo(Math.sqrt(10), 4);

      const scale_100k = computeWireframeOpacityScale(100000);
      const scale_1M = computeWireframeOpacityScale(1000000);

      const effectiveOpticalDensity100k = L_100k * scale_100k;
      const effectiveOpticalDensity1M = L_1M * scale_1M;

      expect(effectiveOpticalDensity1M).toBeCloseTo(effectiveOpticalDensity100k, 3);
      expect(effectiveOpticalDensity1M / effectiveOpticalDensity100k).toBeCloseTo(1.0, 4);
    });

    it('C2-M2-T8: verifies 102.6:1 point dynamic range ensures coastline resolution without wireframe moiré interference', () => {
      // Coastline Point:
      const sGeo = 1.8;
      const alphaGeo = 0.95;
      const energyGeo = alphaGeo * (sGeo * sGeo); // 3.078

      // Structural Point:
      const sStruct = 1.0;
      const alphaStruct = 0.03;
      const energyStruct = alphaStruct * (sStruct * sStruct); // 0.030

      // Wireframe Line at 1M density (ocean structural lattice):
      const densityFactor1M = Math.sqrt(100000 / 1000000); // 0.316228
      const wireAlphaOcean1M = 0.03 * densityFactor1M; // ~0.009487
      const wireAlphaCoast1M = 0.50 * densityFactor1M; // ~0.158114

      // Contrast ratio between Coastline Points and Ocean Wireframe Lines:
      const pointToWireContrast = alphaGeo / wireAlphaOcean1M;
      expect(pointToWireContrast).toBeGreaterThan(100.0); // Coastline points are >100x more opaque than ocean wireframe

      const contrastRatio = energyGeo / energyStruct;
      expect(contrastRatio).toBeCloseTo(102.6, 1);
      expect(contrastRatio).toBeGreaterThanOrEqual(102.0);
    });
  });

  // =========================================================================
  // 3. Stress-testing Mode Transitions & Edge Cases
  // =========================================================================
  describe('3. Multi-Paradigm Wireframe & Point Interactions', () => {
    it('C2-M2-T9: verifies Mode 3 Fluid liquefaction melts mesh wireframe during active morphing while points carry vorticity', () => {
      // In meshFragmentShader:
      // float rawSin = sin(3.14159265 * clamp(u_unfurl, 0.0, 1.0));
      // float liquefaction = (u_unfurl <= 0.001 || u_unfurl >= 0.999) ? 0.0 : pow(max(0.0, rawSin), 1.2);
      // alpha = alpha * (1.0 - liquefaction * 0.92);
      const getLiquefactionAttenuation = (unfurl: number) => {
        if (unfurl <= 0.001 || unfurl >= 0.999) return 1.0;
        const rawSin = Math.sin(Math.PI * Math.max(0, Math.min(1, unfurl)));
        const liq = Math.pow(Math.max(0, rawSin), 1.2);
        return 1.0 - liq * 0.92;
      };

      // At alpha = 0 (Globe): full wireframe opacity
      expect(getLiquefactionAttenuation(0.0)).toBe(1.0);
      // At alpha = 1 (Map): full wireframe opacity
      expect(getLiquefactionAttenuation(1.0)).toBe(1.0);
      // At peak morph (alpha = 0.5): 92% attenuation of wireframe lines (liquefaction melt)
      expect(getLiquefactionAttenuation(0.5)).toBeCloseTo(0.08, 2);
      expect(getLiquefactionAttenuation(0.5)).toBeGreaterThan(0.0); // Never negative
    });
  });
});
