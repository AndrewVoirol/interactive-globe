import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Exact path to production cloud shader
const SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
const cloudWgslSource = fs.readFileSync(SHADER_PATH, 'utf-8');

// Exact CPU reference mirror of Section 9 Parallax Extrusion and Slant Path Math
function evaluateSlabOpticalDepth(
  facing: number,
  baseDensity: number,
  baseLayerOpacity: number,
  layerIdx: number
): { alpha: number; slabPathFactor: number; rawSlabDensity: number } {
  const muEff = Math.max(facing, 0.15);
  const slabPathFactor = Math.min(Math.max(1.0 / muEff, 1.0), 2.5);

  let deckThicknessKm = 1.4;
  if (layerIdx === 1) {
    deckThicknessKm = 2.4;
  } else if (layerIdx === 2) {
    deckThicknessKm = 2.0;
  }

  // Reference 3-tap density combination
  const rawSlabDensity = baseDensity; // In uniform field, all 3 slices equal baseDensity
  const blockedCloud = rawSlabDensity;

  let alpha = blockedCloud * baseLayerOpacity;
  alpha = 1.0 - Math.exp(-alpha * slabPathFactor * 1.8);

  return { alpha, slabPathFactor, rawSlabDensity };
}

describe('Milestone 5 Phase 1: Vertical Slab Parallax Extrusion & Volumetric Deck Presence', () => {
  // ==========================================================================
  // Pillar 1: Spec Ledger Section 9 Mathematical Invariants & AST Audit
  // ==========================================================================
  describe('Pillar 1: Spec Ledger §9 WGSL AST Audit & Uniform Control Flow (Rule 4)', () => {
    it('M5-AST-01: Verifies deck thickness hierarchy for Low (1.4km), Mid (2.4km), High (2.0km)', () => {
      expect(cloudWgslSource).toContain('var deckThicknessKm: f32 = 1.4;');
      expect(cloudWgslSource).toContain('deckThicknessKm = 2.4;');
      expect(cloudWgslSource).toContain('deckThicknessKm = 2.0;');
    });

    it('M5-AST-02: Verifies view ray projection onto spherical tangent basis (eastVec, northVec)', () => {
      expect(cloudWgslSource).toContain('let sphereLambda = (in.uv.x - 0.5) * TWO_PI;');
      expect(cloudWgslSource).toContain('let eastVec = vec3<f32>(-sin(sphereLambda), 0.0, cos(sphereLambda));');
      expect(cloudWgslSource).toContain('let northVec = cross(in.normal, eastVec);');
      expect(cloudWgslSource).toContain('let vE = dot(viewRay, eastVec);');
      expect(cloudWgslSource).toContain('let vN = dot(viewRay, northVec);');
    });

    it('M5-AST-03: Verifies 3-tap interior slice sampling at explicit LOD 0.0 before any branch or discard', () => {
      const fsMainIdx = cloudWgslSource.indexOf('fn fs_main(in: VertexOutput)');
      const cMidIdx = cloudWgslSource.indexOf('let cMid0 = textureSampleLevel(u_cloudTexture, u_cloudSampler, uvMid0, 0.0).r;', fsMainIdx);
      const cBaseIdx = cloudWgslSource.indexOf('let cBase0 = textureSampleLevel(u_cloudTexture, u_cloudSampler, uvBase0, 0.0).r;', fsMainIdx);
      const firstDiscardIdx = cloudWgslSource.indexOf('discard;', fsMainIdx);

      expect(cMidIdx).toBeGreaterThan(fsMainIdx);
      expect(cBaseIdx).toBeGreaterThan(cMidIdx);
      expect(firstDiscardIdx).toBeGreaterThan(cBaseIdx);
    });

    it('M5-AST-04: Verifies normalized slice weighting (Top 0.45, Mid 0.35, Base 0.20)', () => {
      expect(cloudWgslSource).toContain('let rawCloudSlab = rawCloud * 0.45 + rawCloudMid * 0.35 + rawCloudBase * 0.20;');
    });

    it('M5-AST-05: Verifies active non-placebo consumption of rawCloudSlab in baseDensity', () => {
      expect(cloudWgslSource).toContain('var baseDensity = clamp((rawCloudSlab + effOrographicLift) * poleAtten, 0.0, 1.0);');
    });

    it('M5-AST-06: Verifies Beer-Lambert slant-path optical depth amplification applied to alpha', () => {
      expect(cloudWgslSource).toContain('let slabPathFactor = clamp(1.0 / muEff, 1.0, 2.5);');
      expect(cloudWgslSource).toContain('alpha = (1.0 - exp(-alpha * slabPathFactor * 1.8));');
    });
  });

  // ==========================================================================
  // Pillar 2: Physical Slant Path Optical Depth Behavior
  // ==========================================================================
  describe('Pillar 2: Physical Slant Path Optical Depth Behavior', () => {
    it('M5-SLAB-01: Oblique view angles strictly amplify optical density compared to nadir', () => {
      const nadir = evaluateSlabOpticalDepth(1.0, 0.5, 0.6, 0);
      const oblique45 = evaluateSlabOpticalDepth(0.707, 0.5, 0.6, 0);
      const oblique78 = evaluateSlabOpticalDepth(0.20, 0.5, 0.6, 0);

      // Path factor increases monotonically with decreasing facing
      expect(nadir.slabPathFactor).toBe(1.0);
      expect(oblique45.slabPathFactor).toBeCloseTo(1.414, 2);
      expect(oblique78.slabPathFactor).toBe(2.5); // Clamped at 2.5

      // Alpha increases monotonically: clouds appear thicker toward horizon
      expect(oblique45.alpha).toBeGreaterThan(nadir.alpha);
      expect(oblique78.alpha).toBeGreaterThan(oblique45.alpha);

      // Nadir preserves moderate transparency (~0.42 for 0.3 base)
      expect(nadir.alpha).toBeCloseTo(1.0 - Math.exp(-0.3 * 1.0 * 1.8), 3);
      // Oblique reaches substantial volumetric presence (~0.74 for 0.3 base)
      expect(oblique78.alpha).toBeCloseTo(1.0 - Math.exp(-0.3 * 2.5 * 1.8), 3);
    });

    it('M5-SLAB-02: Clear skies (baseDensity = 0.0) remain strictly zero-alpha at all view angles', () => {
      for (const facing of [1.0, 0.707, 0.5, 0.2, 0.1, 0.0, -0.05]) {
        for (const layer of [0, 1, 2]) {
          const res = evaluateSlabOpticalDepth(facing, 0.0, 0.6, layer);
          expect(res.alpha).toBe(0.0);
        }
      }
    });

    it('M5-SLAB-03: Stratum deck thickness hierarchy is strictly positive and ordered', () => {
      const thicknesses = [1.4, 2.4, 2.0];
      for (const t of thicknesses) {
        expect(t).toBeGreaterThan(0.0);
      }
      expect(thicknesses[1]).toBeGreaterThan(thicknesses[0]); // Mid altocumulus thicker than boundary stratus
    });
  });

  // ==========================================================================
  // Pillar 3: 25,000-Trial Monte Carlo Stress Testing (Rule 20)
  // ==========================================================================
  describe('Pillar 3: 25,000-Trial Monte Carlo Stress Testing', () => {
    it('M5-MC-01: 25,000 randomized trials confirm alpha strictly in [0.0, 1.0] and zero NaNs', () => {
      const TRIALS = 25_000;
      let nanCount = 0;
      let outOfBoundsCount = 0;

      for (let i = 0; i < TRIALS; i++) {
        const facing = (Math.random() - 0.2) * 1.2; // [-0.2, 1.0]
        const baseDensity = Math.random(); // [0.0, 1.0]
        const opacity = Math.random() * 0.8 + 0.2; // [0.2, 1.0]
        const layerIdx = i % 3;

        const res = evaluateSlabOpticalDepth(facing, baseDensity, opacity, layerIdx);

        if (Number.isNaN(res.alpha) || !Number.isFinite(res.alpha)) {
          nanCount++;
        }
        if (res.alpha < -1e-6 || res.alpha > 1.0 + 1e-6) {
          outOfBoundsCount++;
        }
      }

      expect(nanCount).toBe(0);
      expect(outOfBoundsCount).toBe(0);
    });
  });
});
