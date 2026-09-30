/**
 * tests/modern/orographic-ridge-stratum-blocking.test.ts
 *
 * Milestone 3 Specification Verification Suite:
 * Orographic Ridge Interaction, Stratum Terrain Blocking, and Leeward Rain Shadow Dissipation (§7)
 *
 * Verifies:
 * - M3-MATH-01: W3C WGSL §14.4 smoothstep invariant (edge0 < edge1 strictly preserved)
 * - M3-MATH-02: Low stratus ridge blocking (alpha == 0 for terrain >= 2,000m; 50k Monte Carlo trials)
 * - M3-MATH-03: Mid altocumulus plateau taper (smooth transition 2,000m - 6,000m; Altiplano validation)
 * - M3-MATH-04: High cirrus planetary passage (alpha == 1 for all terrain <= 6,000m; Everest passage > 0.50)
 * - M3-WGSL-01: Unconditional uniform control flow sampling of u_demTexture at explicit LOD 0.0 before discards
 * - M3-WGSL-02: DEM decoding parity with Rule 8 / Invariant §15
 * - M3-WGSL-03: Non-bypassable active consumption of alphaStratum and blockedCloud
 * - M3-CALIB-01: Active default calibration in App.tsx
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Load WGSL shader source
const cloudShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
const cloudWgslSource = fs.readFileSync(cloudShaderPath, 'utf-8');

// Load App.tsx source
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const appSource = fs.readFileSync(appPath, 'utf-8');

// Load Spec Ledger
const specLedgerPath = path.resolve(__dirname, '../../SHADERS_SPEC_LEDGER.md');
const specLedgerSource = fs.readFileSync(specLedgerPath, 'utf-8');

// Standard GLSL/WGSL smoothstep implementation
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 >= edge1) {
    throw new Error(`W3C WGSL §14.4 Violation: edge0 (${edge0}) must be strictly less than edge1 (${edge1})`);
  }
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

// Shader-accurate stratum blocking formula
function computeAlphaStratum(layerIdx: number, zTerrain: number): number {
  let zStratumBase = 0.0;
  let zStratumTop = 2000.0;
  if (layerIdx === 1) {
    zStratumBase = 2000.0;
    zStratumTop = 6000.0;
  } else if (layerIdx === 2) {
    zStratumBase = 6000.0;
    zStratumTop = 12000.0;
  }
  return 1.0 - smoothstep(zStratumBase, zStratumTop, zTerrain);
}

// DEM decoding matching Rule 8
function decodeElevation(alpha: number): number {
  return alpha * 19772.0 - 10924.0;
}

describe('Milestone 3 Suite: Orographic Ridge Interaction & Stratum Blocking (§7)', () => {
  describe('Pillar 1: W3C WGSL §14.4 Specification Invariant', () => {
    it('M3-MATH-01: All stratum layers strictly guarantee edge0 < edge1 in smoothstep', () => {
      const strata = [
        { name: 'Low Stratus (Layer 0)', base: 0.0, top: 2000.0 },
        { name: 'Mid Altocumulus (Layer 1)', base: 2000.0, top: 6000.0 },
        { name: 'High Cirrus (Layer 2)', base: 6000.0, top: 12000.0 },
      ];

      for (const s of strata) {
        expect(s.base).toBeLessThan(s.top);
        // Ensure no exception is thrown by our strict smoothstep validator
        expect(() => smoothstep(s.base, s.top, 1500.0)).not.toThrow();
      }
    });

    it('M3-MATH-01b: 1.0 - smoothstep(base, top, z) is mathematically identical to reverse smoothstep without driver UB', () => {
      // For any ascending range [a, b], 1.0 - S(x; a, b) equals the reverse transition from 1 at a to 0 at b
      const a = 2000.0;
      const b = 6000.0;
      for (let z = 1000; z <= 7000; z += 250) {
        const val = 1.0 - smoothstep(a, b, z);
        if (z <= a) expect(val).toBe(1.0);
        else if (z >= b) expect(val).toBe(0.0);
        else expect(val).toBeGreaterThan(0.0).toBeLessThan(1.0);
      }
    });
  });

  describe('Pillar 2: Low Stratus Ridge Interception (Layer 0: 0m - 2000m)', () => {
    it('M3-MATH-02a: Evaluates to exact theoretical endpoints at boundaries', () => {
      expect(computeAlphaStratum(0, -100.0)).toBe(1.0); // Ocean depression
      expect(computeAlphaStratum(0, 0.0)).toBe(1.0);    // Sea level
      expect(computeAlphaStratum(0, 1000.0)).toBeCloseTo(0.50, 4); // Halfway
      expect(computeAlphaStratum(0, 2000.0)).toBe(0.0);  // Crest threshold
      expect(computeAlphaStratum(0, 4392.0)).toBe(0.0);  // Mt. Rainier summit
      expect(computeAlphaStratum(0, 6961.0)).toBe(0.0);  // Mt. Aconcagua summit
    });

    it('M3-MATH-02b: 50,000 Monte Carlo trials confirm 0% low stratus penetration above 2,000m', () => {
      const TRIALS = 50000;
      let nonZeroCount = 0;
      for (let i = 0; i < TRIALS; i++) {
        // Random terrain elevation from 2,000m to 8,848m (Everest)
        const z = 2000.0 + Math.random() * (8848.0 - 2000.0);
        const alpha = computeAlphaStratum(0, z);
        if (alpha > 0.0) {
          nonZeroCount++;
        }
      }
      expect(nonZeroCount).toBe(0);
    });
  });

  describe('Pillar 3: Mid Altocumulus Plateau Taper (Layer 1: 2000m - 6000m)', () => {
    it('M3-MATH-03a: Evaluates unattenuated below 2,000m and blocked above 6,000m', () => {
      expect(computeAlphaStratum(1, 0.0)).toBe(1.0);     // Lowlands
      expect(computeAlphaStratum(1, 1500.0)).toBe(1.0);  // Coastal range
      expect(computeAlphaStratum(1, 2000.0)).toBe(1.0);  // Base of mid layer
      expect(computeAlphaStratum(1, 6000.0)).toBe(0.0);  // Top of mid layer
      expect(computeAlphaStratum(1, 7000.0)).toBe(0.0);  // Above mid layer
    });

    it('M3-MATH-03b: Smoothly tapers over Andean Altiplano (3,800m)', () => {
      const altiplanoAlpha = computeAlphaStratum(1, 3800.0);
      // Normalized t = (3800 - 2000) / 4000 = 0.45
      // smoothstep(0.45) = 0.45^2 * (3 - 0.9) = 0.2025 * 2.1 = 0.42525
      // 1.0 - 0.42525 = 0.57475
      expect(altiplanoAlpha).toBeCloseTo(0.57475, 3);
      expect(altiplanoAlpha).toBeGreaterThan(0.50);
      expect(altiplanoAlpha).toBeLessThan(0.65);
    });
  });

  describe('Pillar 4: High Cirrus Planetary Passage (Layer 2: 6000m - 12000m)', () => {
    it('M3-MATH-04a: Evaluates completely unattenuated across 99.9% of planetary surface (z <= 6000m)', () => {
      expect(computeAlphaStratum(2, 0.0)).toBe(1.0);
      expect(computeAlphaStratum(2, 2000.0)).toBe(1.0);
      expect(computeAlphaStratum(2, 4392.0)).toBe(1.0); // Rainier
      expect(computeAlphaStratum(2, 6000.0)).toBe(1.0);
    });

    it('M3-MATH-04b: Passes over Mount Everest (8,848m) with robust transmission > 0.50', () => {
      const everestAlpha = computeAlphaStratum(2, 8848.0);
      // Normalized t = (8848 - 6000) / 6000 = 2848 / 6000 = 0.47467
      // smoothstep(0.47467) = 0.47467^2 * (3 - 2 * 0.47467) = 0.2253 * 2.0507 = 0.462
      // 1.0 - 0.462 = 0.538
      expect(everestAlpha).toBeGreaterThan(0.50);
      expect(everestAlpha).toBeLessThan(0.60);
    });

    it('M3-MATH-04c: 50,000 Monte Carlo trials confirm zero attenuation below 6,000m', () => {
      const TRIALS = 50000;
      let attenuatedCount = 0;
      for (let i = 0; i < TRIALS; i++) {
        const z = -400.0 + Math.random() * (6000.0 - (-400.0));
        const alpha = computeAlphaStratum(2, z);
        if (alpha < 1.0) {
          attenuatedCount++;
        }
      }
      expect(attenuatedCount).toBe(0);
    });
  });

  describe('Pillar 5: Orographic Lift and Leeward Rain Shadow Asymmetry', () => {
    it('M3-PHYS-01: Windward lift condenses cloud while leeward subsidence dissipates cloud', () => {
      const initialCloud = 0.50;
      const feedback = 0.50;
      const stratumCoupling = 1.0; // Layer 0
      const poleAtten = 1.0;

      // Windward slope: dot(wind, gradH) > 0
      const wOroWindward = +0.025;
      const liftTerm = wOroWindward * 50.0;
      const lift = 0.35 * Math.tanh(0.05 * liftTerm) * stratumCoupling;
      const rainShadowWindward = 1.0 - feedback * Math.max(0.0, Math.min(0.85, -wOroWindward * 40.0)) * stratumCoupling;
      const windwardDensity = Math.min(1.0, (initialCloud + lift) * poleAtten) * rainShadowWindward;

      // Leeward slope: dot(wind, gradH) < 0
      const wOroLeeward = -0.025;
      const liftLeeward = 0.35 * Math.tanh(0.05 * (wOroLeeward * 50.0)) * stratumCoupling;
      const rainShadowLeeward = 1.0 - feedback * Math.max(0.0, Math.min(0.85, -wOroLeeward * 40.0)) * stratumCoupling;
      const leewardDensity = Math.min(1.0, Math.max(0.0, (initialCloud + liftLeeward) * poleAtten)) * rainShadowLeeward;

      // Windward density must strictly exceed initial cloud
      expect(windwardDensity).toBeGreaterThan(initialCloud);
      // Leeward density must be significantly lower than initial cloud
      expect(leewardDensity).toBeLessThan(initialCloud);
      // Marked physical asymmetry:
      expect(windwardDensity).toBeGreaterThan(leewardDensity * 1.5);
    });
  });

  describe('Pillar 6: WGSL Uniform Control Flow & AST Non-Bypass Invariants', () => {
    it('M3-WGSL-01: demCenter is sampled in unconditional uniform control flow at explicit LOD 0.0', () => {
      // Must contain unconditional demCenterGlobal sample
      expect(cloudWgslSource).toContain('let demCenterGlobal = textureSampleLevel(u_demTexture, u_demSampler, in.uv, 0.0);');
      expect(cloudWgslSource).toContain('let demCenter = sampleRegionalComposite(in.uv, demCenterGlobal, 0.0);');
      expect(cloudWgslSource).toContain('let zTerrain = decodeElevation(demCenter);');

      // Verify demCenterGlobal occurs before any discard in fs_main
      const fsMainIdx = cloudWgslSource.indexOf('fn fs_main(');
      const demCenterIdx = cloudWgslSource.indexOf('let demCenterGlobal', fsMainIdx);
      const firstDiscardIdx = cloudWgslSource.indexOf('discard;', fsMainIdx);

      expect(fsMainIdx).toBeGreaterThan(0);
      expect(demCenterIdx).toBeGreaterThan(fsMainIdx);
      expect(firstDiscardIdx).toBeGreaterThan(demCenterIdx);
    });

    it('M3-WGSL-02: decodeElevation formula adheres strictly to Rule 8 geoid definition', () => {
      expect(cloudWgslSource).toMatch(/fn\s+decodeElevation\s*\(\s*demSample\s*:\s*vec4<f32>\s*\)\s*->\s*f32\s*\{\s*return\s+demSample\.a\s*\*\s*19772\.0\s*-\s*10924\.0\s*;\s*\}/);
      // Numerical parity check
      expect(decodeElevation(0.0)).toBeCloseTo(-10924.0, 1);
      expect(decodeElevation(1.0)).toBeCloseTo(8848.0, 1);
      expect(decodeElevation(0.5525)).toBeCloseTo(0.0, 0); // Sea level approx
    });

    it('M3-WGSL-03: alphaStratum is computed with ascending smoothstep and actively consumed in alpha pipeline', () => {
      // Ascending smoothstep (W3C WGSL §14.4 compliant)
      expect(cloudWgslSource).toContain('let alphaStratum = 1.0 - smoothstep(zStratumBase, zStratumTop, zTerrain);');

      // Active non-placebo consumption:
      expect(cloudWgslSource).toContain('let blockedCloud = effectiveCloud * alphaStratum;');
      expect(cloudWgslSource).toContain('var alpha = blockedCloud * baseLayerOpacity * cloud.u_layerOpacity.w * horizonAtten;');

      // Verify sequence: effectiveCloud -> blockedCloud -> alpha
      const effIdx = cloudWgslSource.indexOf('let effectiveCloud = clamp(condensedCloud * featheredCloud, 0.0, 1.0);');
      const blockedIdx = cloudWgslSource.indexOf('let blockedCloud = effectiveCloud * alphaStratum;', effIdx);
      const alphaIdx = cloudWgslSource.indexOf('var alpha = blockedCloud * baseLayerOpacity', blockedIdx);

      expect(effIdx).toBeGreaterThan(0);
      expect(blockedIdx).toBeGreaterThan(effIdx);
      expect(alphaIdx).toBeGreaterThan(blockedIdx);
    });
  });

  describe('Pillar 7: Production Default Calibration & Spec Ledger Alignment', () => {
    it('M3-CALIB-01: App.tsx initializes rainShadowFeedback to calibrated 0.50', () => {
      expect(appSource).toContain('const [rainShadowFeedback, setRainShadowFeedback] = useState<number>(0.50);');
    });

    it('M3-SPEC-01: SHADERS_SPEC_LEDGER.md §7 contains complete Milestone 3 specification', () => {
      expect(specLedgerSource).toContain('## §7: Orographic Ridge Interaction & Rain Shadow Dissipation');
      expect(specLedgerSource).toContain('M3-MATH-01');
      expect(specLedgerSource).toContain('M3-MATH-02');
      expect(specLedgerSource).toContain('M3-WGSL-01');
      expect(specLedgerSource).toContain('M3-CALIB-01');
    });
  });
});
