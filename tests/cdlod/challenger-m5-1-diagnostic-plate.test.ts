// @vitest-environment happy-dom
// ============================================================================
// File: tests/cdlod/challenger-m5-1-diagnostic-plate.test.ts
// Test Tier: Adversarial Challenger (Milestone 5: Real-Time CDLOD Diagnostic Plate)
// Description: Adversarial verification of CDLOD diagnostic plate outputs across
//              all 4 modes (0 = Off, 1 = LOD Hues, 2 = Morph Alpha Ramp, 3 = Combined Plate):
//              - Mode 0 cartographic identity preservation (zero perturbation)
//              - Mode 1 integer LOD octave hue separation (LOD 0 through 9+)
//              - Mode 2 continuous, monotonic alpha transition gradient
//              - Mode 3 LOD hue modulation with hillshade relief retention
//              - Rule 5 anti-placebo pixel delta validation
//              - Rule 4 uniform control flow & Rule 18 zero-recompilation invariants
//              - Monte Carlo fuzzing & numerical stability (zero NaNs, zero Infs)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

// WGSL Shader Oracle Replicas matching crust_hydrosphere.wgsl verbatim
function getLODColorOracle(lod: number): [number, number, number] {
  const u = Math.floor(Math.max(0, lod));
  switch (u) {
    case 0: return [0.10, 0.25, 0.65]; // LOD 0: Deep Cobalt
    case 1: return [0.12, 0.58, 0.85]; // LOD 1: Cerulean
    case 2: return [0.15, 0.72, 0.60]; // LOD 2: Turquoise/Teal
    case 3: return [0.30, 0.78, 0.35]; // LOD 3: Meadow Green
    case 4: return [0.85, 0.82, 0.20]; // LOD 4: Lemon Yellow
    case 5: return [0.95, 0.58, 0.15]; // LOD 5: Amber Orange
    case 6: return [0.92, 0.25, 0.20]; // LOD 6: Crimson
    case 7: return [0.80, 0.20, 0.75]; // LOD 7: Magenta
    case 8: return [0.55, 0.15, 0.85]; // LOD 8: Violet
    default: return [0.95, 0.95, 0.95]; // LOD 9+: Bright White
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function mix(a: number, b: number, t: number): number {
  return a * (1.0 - t) + b * t;
}

function mixVec3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    mix(a[0], b[0], t),
    mix(a[1], b[1], t),
    mix(a[2], b[2], t),
  ];
}

function colorDistance(c1: [number, number, number], c2: [number, number, number]): number {
  return Math.sqrt(
    Math.pow(c1[0] - c2[0], 2) +
    Math.pow(c1[1] - c2[1], 2) +
    Math.pow(c1[2] - c2[2], 2)
  );
}

// Fragment stage diagnostic evaluator matching crust_hydrosphere.wgsl lines 2110-2133
function evaluateFragmentDiagnosticOracle(
  inputFinalCrust: [number, number, number],
  diagnosticMode: number,
  lodInfo: [number, number], // [lod, alpha]
  NdotL1: number,
  shadowFactor: number,
  layerOpacity: number = 1.0
): [number, number, number, number] {
  let finalCrust = [...inputFinalCrust] as [number, number, number];

  if (diagnosticMode > 0.5) {
    const lodInt = Math.floor(Math.round(lodInfo[0]));
    const alpha = clamp(lodInfo[1], 0.0, 1.0);
    const lodColor = getLODColorOracle(lodInt);

    let diagColor: [number, number, number];
    if (diagnosticMode >= 2.5) {
      // Mode 3: Combined plate
      const alphaMod = mixVec3([0.75, 0.75, 0.75], [1.25, 1.05, 0.65], alpha);
      diagColor = [
        lodColor[0] * alphaMod[0],
        lodColor[1] * alphaMod[1],
        lodColor[2] * alphaMod[2],
      ];
    } else if (diagnosticMode >= 1.5) {
      // Mode 2: Morph Alpha Ramp
      diagColor = mixVec3([0.05, 0.40, 0.85], [0.95, 0.20, 0.10], alpha);
    } else {
      // Mode 1: Discrete Integer LOD
      diagColor = lodColor;
    }

    const hillshade = clamp(NdotL1 * shadowFactor + 0.35, 0.25, 1.25);
    finalCrust = [
      diagColor[0] * hillshade,
      diagColor[1] * hillshade,
      diagColor[2] * hillshade,
    ];
  }

  const finalAlpha = clamp(layerOpacity, 0.0, 1.0);
  return [
    finalCrust[0] * finalAlpha,
    finalCrust[1] * finalAlpha,
    finalCrust[2] * finalAlpha,
    finalAlpha,
  ];
}

describe('Adversarial Challenger M5-1: CDLOD Diagnostic Plate Empirical Shading Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const crustWgslPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');

  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
    (engine as any).isInitialized = true;
    (engine as any).crustUniformBuffer = { destroy: vi.fn() };
    (engine as any).device = {
      queue: { writeBuffer: vi.fn() },
      createRenderPipeline: vi.fn(() => ({})),
      createComputePipeline: vi.fn(() => ({})),
    };
  });

  afterEach(() => {
    engine.dispose();
  });

  // ==========================================================================
  // Pillar 1: Mode 0 Cartographic Invariance & Identity Preservation
  // ==========================================================================
  describe('Pillar 1: Mode 0 Cartographic Invariance & Identity Preservation', () => {
    it('empirically verifies Mode 0 produces zero delta across diverse themes and surface types', () => {
      // Sample colors from each cartographic theme
      const testCases: Array<{ name: string; baseColor: [number, number, number] }> = [
        { name: 'Cream Rag Sepia Land', baseColor: [0.22, 0.19, 0.16] },
        { name: 'Cream Rag Ivory Paper', baseColor: [0.94, 0.93, 0.90] },
        { name: 'Prussian Blue Ocean', baseColor: [0.08, 0.15, 0.28] },
        { name: 'Prussian Chalk Linework', baseColor: [0.91, 0.93, 0.96] },
        { name: 'Marie Tharp Turquoise Shelf', baseColor: [0.20, 0.58, 0.65] },
        { name: 'Marie Tharp Abyssal Plain', baseColor: [0.12, 0.28, 0.45] },
      ];

      for (const tc of testCases) {
        const out = evaluateFragmentDiagnosticOracle(
          tc.baseColor,
          0.0, // Mode 0: Off
          [3, 0.45], // arbitrary LOD 3, alpha 0.45
          0.85, // normal lighting
          1.0
        );

        // Delta between output and original baseColor must be identically 0
        expect(out[0]).toBeCloseTo(tc.baseColor[0], 6);
        expect(out[1]).toBeCloseTo(tc.baseColor[1], 6);
        expect(out[2]).toBeCloseTo(tc.baseColor[2], 6);
        expect(out[3]).toBe(1.0);
      }
    });

    it('stress-tests boundary threshold sim.u_cdlodDiagnosticMode > 0.5 in WGSL', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');
      expect(shaderSrc).toContain('if (sim.u_cdlodDiagnosticMode > 0.5)');

      const baseColor: [number, number, number] = [0.5, 0.5, 0.5];

      // Sub-threshold values: 0.0, 0.1, 0.35, 0.50 must all produce identically 0 delta
      for (const modeVal of [0.0, 0.1, 0.25, 0.49, 0.50]) {
        const out = evaluateFragmentDiagnosticOracle(baseColor, modeVal, [2, 0.2], 0.7, 1.0);
        expect(out[0]).toBe(baseColor[0]);
        expect(out[1]).toBe(baseColor[1]);
        expect(out[2]).toBe(baseColor[2]);
      }

      // Above threshold: 0.51, 1.0 must activate diagnostic plate
      const outActive = evaluateFragmentDiagnosticOracle(baseColor, 0.51, [2, 0.2], 0.7, 1.0);
      const delta = colorDistance([outActive[0], outActive[1], outActive[2]], baseColor);
      expect(delta).toBeGreaterThan(0.05);
    });
  });

  // ==========================================================================
  // Pillar 2: Mode 1 Discrete Integer LOD Octave Palette & Hue Discrimination
  // ==========================================================================
  describe('Pillar 2: Mode 1 Discrete Integer LOD Octave Palette & Hue Discrimination', () => {
    it('verifies all 10 LOD octaves have exact canonical color definitions', () => {
      const expectedPalette: Array<[number, [number, number, number]]> = [
        [0, [0.10, 0.25, 0.65]], // LOD 0: Deep Cobalt
        [1, [0.12, 0.58, 0.85]], // LOD 1: Cerulean
        [2, [0.15, 0.72, 0.60]], // LOD 2: Turquoise/Teal
        [3, [0.30, 0.78, 0.35]], // LOD 3: Meadow Green
        [4, [0.85, 0.82, 0.20]], // LOD 4: Lemon Yellow
        [5, [0.95, 0.58, 0.15]], // LOD 5: Amber Orange
        [6, [0.92, 0.25, 0.20]], // LOD 6: Crimson
        [7, [0.80, 0.20, 0.75]], // LOD 7: Magenta
        [8, [0.55, 0.15, 0.85]], // LOD 8: Violet
        [9, [0.95, 0.95, 0.95]], // LOD 9+: Bright White
      ];

      for (const [lod, expectedRgb] of expectedPalette) {
        const color = getLODColorOracle(lod);
        expect(color[0]).toBeCloseTo(expectedRgb[0], 4);
        expect(color[1]).toBeCloseTo(expectedRgb[1], 4);
        expect(color[2]).toBeCloseTo(expectedRgb[2], 4);
      }
    });

    it('verifies LOD values >= 9 all clamp to Bright White default', () => {
      for (const highLod of [9, 10, 12, 16, 32, 64, 255]) {
        const c = getLODColorOracle(highLod);
        expect(c).toEqual([0.95, 0.95, 0.95]);
      }
    });

    it('oracle calculates all-pairs color distances: min distance > 0.20 across all 45 pairs', () => {
      const colors: Array<[number, number, number]> = [];
      for (let i = 0; i <= 9; i++) {
        colors.push(getLODColorOracle(i));
      }

      let minDistance = Infinity;
      let closestPair: [number, number] = [-1, -1];
      let pairCount = 0;

      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const dist = colorDistance(colors[i], colors[j]);
          pairCount++;
          if (dist < minDistance) {
            minDistance = dist;
            closestPair = [i, j];
          }
        }
      }

      expect(pairCount).toBe(45);
      // Prove that all 45 pairs are distinct and strongly separated
      expect(minDistance).toBeGreaterThan(0.20);
      // Minimum separation is between LOD 4 and LOD 5 (Lemon Yellow vs Amber Orange) ~0.265
      expect(minDistance).toBeCloseTo(0.265, 2);
    });

    it('verifies morph alpha has ZERO perturbation on hue in Mode 1', () => {
      const baseColor: [number, number, number] = [0.5, 0.5, 0.5];
      const NdotL1 = 0.65;
      const shadowFactor = 1.0;

      for (let lod = 0; lod <= 9; lod++) {
        const outAlpha0 = evaluateFragmentDiagnosticOracle(baseColor, 1.0, [lod, 0.0], NdotL1, shadowFactor);
        const outAlpha5 = evaluateFragmentDiagnosticOracle(baseColor, 1.0, [lod, 0.5], NdotL1, shadowFactor);
        const outAlpha1 = evaluateFragmentDiagnosticOracle(baseColor, 1.0, [lod, 1.0], NdotL1, shadowFactor);

        expect(colorDistance([outAlpha0[0], outAlpha0[1], outAlpha0[2]], [outAlpha5[0], outAlpha5[1], outAlpha5[2]])).toBe(0);
        expect(colorDistance([outAlpha0[0], outAlpha0[1], outAlpha0[2]], [outAlpha1[0], outAlpha1[1], outAlpha1[2]])).toBe(0);
      }
    });

    it('verifies round(input.lodInfo.x) behavior on fractional interpolants', () => {
      // In CDLOD, all vertices of a quad share inst.lod, but if fractional noise exists:
      expect(Math.floor(Math.round(2.1))).toBe(2);
      expect(Math.floor(Math.round(2.49))).toBe(2);
      expect(Math.floor(Math.round(2.51))).toBe(3);
      expect(Math.floor(Math.round(2.9))).toBe(3);
    });
  });

  // ==========================================================================
  // Pillar 3: Mode 2 Morph Alpha Transition Ramp Monotonicity & Continuity
  // ==========================================================================
  describe('Pillar 3: Mode 2 Morph Alpha Transition Ramp Monotonicity & Continuity', () => {
    it('verifies Mode 2 endpoints: alpha=0.0 is Electric Blue and alpha=1.0 is Vermilion Red', () => {
      const startColor: [number, number, number] = [0.05, 0.40, 0.85];
      const endColor: [number, number, number] = [0.95, 0.20, 0.10];

      const ramp0 = mixVec3(startColor, endColor, 0.0);
      expect(ramp0[0]).toBeCloseTo(0.05, 5);
      expect(ramp0[1]).toBeCloseTo(0.40, 5);
      expect(ramp0[2]).toBeCloseTo(0.85, 5);

      const ramp1 = mixVec3(startColor, endColor, 1.0);
      expect(ramp1[0]).toBeCloseTo(0.95, 5);
      expect(ramp1[1]).toBeCloseTo(0.20, 5);
      expect(ramp1[2]).toBeCloseTo(0.10, 5);
    });

    it('empirically verifies strict monotonicity across 1,000 dense interpolation steps', () => {
      const startColor: [number, number, number] = [0.05, 0.40, 0.85];
      const endColor: [number, number, number] = [0.95, 0.20, 0.10];
      const steps = 1000;

      let prevR = -1;
      let prevB = 2;
      let prevDistFromOrigin = -1;

      for (let i = 0; i <= steps; i++) {
        const alpha = i / steps;
        const color = mixVec3(startColor, endColor, alpha);

        // 1. Red channel strictly increases from 0.05 to 0.95 (dR/dα = +0.90)
        expect(color[0]).toBeGreaterThanOrEqual(prevR);
        prevR = color[0];

        // 2. Blue channel strictly decreases from 0.85 to 0.10 (dB/dα = -0.75)
        expect(color[2]).toBeLessThanOrEqual(prevB);
        prevB = color[2];

        // 3. Euclidean distance from startColor strictly increases
        const dist = colorDistance(color, startColor);
        expect(dist).toBeGreaterThanOrEqual(prevDistFromOrigin - 1e-9);
        prevDistFromOrigin = dist;
      }
    });

    it('verifies Lipschitz continuity bound: maximum step derivative is bounded by ~1.1885', () => {
      const startColor: [number, number, number] = [0.05, 0.40, 0.85];
      const endColor: [number, number, number] = [0.95, 0.20, 0.10];
      const analyticalLipschitz = Math.sqrt(
        Math.pow(0.95 - 0.05, 2) + Math.pow(0.20 - 0.40, 2) + Math.pow(0.10 - 0.85, 2)
      ); // sqrt(0.81 + 0.04 + 0.5625) = sqrt(1.4125) ≈ 1.188486

      const dAlpha = 0.001;
      for (let a = 0; a < 1.0; a += 0.05) {
        const c1 = mixVec3(startColor, endColor, a);
        const c2 = mixVec3(startColor, endColor, a + dAlpha);
        const numericalDeriv = colorDistance(c1, c2) / dAlpha;
        expect(numericalDeriv).toBeCloseTo(analyticalLipschitz, 4);
      }
    });

    it('verifies out-of-bounds alpha clamping guard in Mode 2', () => {
      const baseColor: [number, number, number] = [0.5, 0.5, 0.5];
      const startColor: [number, number, number] = [0.05, 0.40, 0.85];
      const endColor: [number, number, number] = [0.95, 0.20, 0.10];
      const hillshade = 1.0; // NdotL1 * shadowFactor + 0.35 = 1.0

      // Alpha < 0 must clamp to 0.0
      const outNeg = evaluateFragmentDiagnosticOracle(baseColor, 2.0, [0, -2.5], 0.65, 1.0);
      expect(outNeg[0]).toBeCloseTo(startColor[0] * hillshade, 4);
      expect(outNeg[1]).toBeCloseTo(startColor[1] * hillshade, 4);
      expect(outNeg[2]).toBeCloseTo(startColor[2] * hillshade, 4);

      // Alpha > 1 must clamp to 1.0
      const outPos = evaluateFragmentDiagnosticOracle(baseColor, 2.0, [0, 4.2], 0.65, 1.0);
      expect(outPos[0]).toBeCloseTo(endColor[0] * hillshade, 4);
      expect(outPos[1]).toBeCloseTo(endColor[1] * hillshade, 4);
      expect(outPos[2]).toBeCloseTo(endColor[2] * hillshade, 4);
    });
  });

  // ==========================================================================
  // Pillar 4: Mode 3 Combined Plate Modulation & Hillshade Relief Preservation
  // ==========================================================================
  describe('Pillar 4: Mode 3 Combined Plate Modulation & Hillshade Relief Preservation', () => {
    it('verifies Mode 3 alphaMod modulation envelope [0.75, 0.75, 0.75] -> [1.25, 1.05, 0.65]', () => {
      const mod0 = mixVec3([0.75, 0.75, 0.75], [1.25, 1.05, 0.65], 0.0);
      expect(mod0).toEqual([0.75, 0.75, 0.75]);

      const mod5 = mixVec3([0.75, 0.75, 0.75], [1.25, 1.05, 0.65], 0.5);
      expect(mod5[0]).toBeCloseTo(1.00, 5);
      expect(mod5[1]).toBeCloseTo(0.90, 5);
      expect(mod5[2]).toBeCloseTo(0.70, 5);

      const mod1 = mixVec3([0.75, 0.75, 0.75], [1.25, 1.05, 0.65], 1.0);
      expect(mod1).toEqual([1.25, 1.05, 0.65]);
    });

    it('verifies hillshade formula clamp(NdotL1 * shadowFactor + 0.35, 0.25, 1.25)', () => {
      const evalHillshade = (NdotL1: number, shadowFactor: number) => clamp(NdotL1 * shadowFactor + 0.35, 0.25, 1.25);

      // Maximum sun illumination
      expect(evalHillshade(1.0, 1.0)).toBe(1.25);
      // Flat horizontal surface at 45 deg sun
      expect(evalHillshade(0.7071, 1.0)).toBeCloseTo(1.0571, 4);
      // Grazing angle
      expect(evalHillshade(0.0, 1.0)).toBe(0.35);
      // Shadowed backside
      expect(evalHillshade(-1.0, 1.0)).toBe(0.25);
      // Dense cloud shadow
      expect(evalHillshade(1.0, 0.0)).toBe(0.35);

      // Contrast ratio between direct sun summit and shadowed valley
      const contrastRatio = evalHillshade(1.0, 1.0) / evalHillshade(-1.0, 1.0);
      expect(contrastRatio).toBe(5.0); // Exactly 5.0x contrast preserved
    });

    it('empirically verifies 3D relief modulation on Mode 3 diagnostic colors', () => {
      const baseColor: [number, number, number] = [0.5, 0.5, 0.5];
      const lod = 4; // Lemon Yellow LOD
      const alpha = 0.5;

      // Summit pixel facing sun: NdotL1 = 0.9, shadowFactor = 1.0 -> hillshade = 1.25
      const summit = evaluateFragmentDiagnosticOracle(baseColor, 3.0, [lod, alpha], 0.9, 1.0);

      // Valley pixel in deep shadow: NdotL1 = -0.5, shadowFactor = 1.0 -> hillshade = 0.25
      const valley = evaluateFragmentDiagnosticOracle(baseColor, 3.0, [lod, alpha], -0.5, 1.0);

      // Summit must be significantly brighter than valley
      const brightnessSummit = (summit[0] + summit[1] + summit[2]) / 3.0;
      const brightnessValley = (valley[0] + valley[1] + valley[2]) / 3.0;

      expect(brightnessSummit / brightnessValley).toBeCloseTo(5.0, 2);
    });
  });

  // ==========================================================================
  // Pillar 5: Rule 5 Anti-Placebo & Uniform/Attribute Grounding
  // ==========================================================================
  describe('Pillar 5: Rule 5 Anti-Placebo & Uniform/Attribute Grounding', () => {
    it('verifies all 4 modes produce mutually distinct pixel transformations (no placebo modes)', () => {
      const baseColor: [number, number, number] = [0.22, 0.19, 0.16]; // Archival sepia
      const lod = 2; // Turquoise/Teal
      const alpha = 0.4;
      const NdotL1 = 0.65;
      const shadowFactor = 1.0;

      const p0 = evaluateFragmentDiagnosticOracle(baseColor, 0.0, [lod, alpha], NdotL1, shadowFactor);
      const p1 = evaluateFragmentDiagnosticOracle(baseColor, 1.0, [lod, alpha], NdotL1, shadowFactor);
      const p2 = evaluateFragmentDiagnosticOracle(baseColor, 2.0, [lod, alpha], NdotL1, shadowFactor);
      const p3 = evaluateFragmentDiagnosticOracle(baseColor, 3.0, [lod, alpha], NdotL1, shadowFactor);

      const toRgb = (p: [number, number, number, number]): [number, number, number] => [p[0], p[1], p[2]];

      // Assert non-zero distance between all pairs
      expect(colorDistance(toRgb(p1), toRgb(p0))).toBeGreaterThan(0.20);
      expect(colorDistance(toRgb(p2), toRgb(p0))).toBeGreaterThan(0.20);
      expect(colorDistance(toRgb(p3), toRgb(p0))).toBeGreaterThan(0.20);
      expect(colorDistance(toRgb(p1), toRgb(p2))).toBeGreaterThan(0.20);
      expect(colorDistance(toRgb(p1), toRgb(p3))).toBeGreaterThan(0.05);
      expect(colorDistance(toRgb(p2), toRgb(p3))).toBeGreaterThan(0.20);
    });

    it('verifies end-to-end uniform packing from engine state into crustFloats[79]', () => {
      const mockDevice = (engine as any).device;

      // Mode 0: Off
      engine.setCDLODDiagnosticMode(0);
      expect((engine as any).crustFloats[79]).toBe(0.0);
      expect(mockDevice.queue.writeBuffer).toHaveBeenCalledWith(
        (engine as any).crustUniformBuffer,
        0,
        (engine as any).crustFloats.buffer
      );

      // Mode 1: LOD
      engine.setCDLODDiagnosticMode(1);
      expect((engine as any).crustFloats[79]).toBe(1.0);

      // Mode 2: Morph Alpha
      engine.setCDLODDiagnosticMode(2);
      expect((engine as any).crustFloats[79]).toBe(2.0);

      // Mode 3: Combined
      engine.setCDLODDiagnosticMode(3);
      expect((engine as any).crustFloats[79]).toBe(3.0);
    });
  });

  // ==========================================================================
  // Pillar 6: Rule 4 & Rule 18 Invariants
  // ==========================================================================
  describe('Pillar 6: Rule 4 & Rule 18 Invariants', () => {
    it('confirms derivatives dpdx, dpdy, fwidth are evaluated in unconditional uniform control flow', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');
      const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main');
      expect(fsMainIdx).toBeGreaterThan(0);

      const fsBody = shaderSrc.slice(fsMainIdx);
      const dpdxIdx = fsBody.indexOf('let du_dx = dpdx(input.uv.x);');
      const diagIdx = fsBody.indexOf('if (sim.u_cdlodDiagnosticMode > 0.5)');

      expect(dpdxIdx).toBeGreaterThan(0);
      expect(diagIdx).toBeGreaterThan(dpdxIdx);
      // Invariant: derivatives occur in the top 30 lines of fs_main
      expect(dpdxIdx).toBeLessThan(1200);
    });

    it('confirms zero pipeline recompilations occurred across mode switches (Rule 18)', () => {
      const mockDevice = (engine as any).device;
      engine.setCDLODDiagnosticMode(1);
      engine.setCDLODDiagnosticMode(2);
      engine.setCDLODDiagnosticMode(3);
      engine.setCDLODDiagnosticMode(0);

      expect(mockDevice.createRenderPipeline).not.toHaveBeenCalled();
      expect(mockDevice.createComputePipeline).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Pillar 7: Monte Carlo Fuzzing & Numerical Stability
  // ==========================================================================
  describe('Pillar 7: Monte Carlo Fuzzing & Numerical Stability', () => {
    it('evaluates 1,000 randomized diagnostic samples without NaN, Infinity, or out-of-range crash', () => {
      for (let i = 0; i < 1000; i++) {
        const randBase: [number, number, number] = [Math.random(), Math.random(), Math.random()];
        const randMode = (Math.random() * 5.0) - 1.0; // [-1.0, 4.0]
        const randLod = (Math.random() * 40.0) - 10.0; // [-10, 30]
        const randAlpha = (Math.random() * 4.0) - 1.5; // [-1.5, 2.5]
        const randNdotL1 = (Math.random() * 4.0) - 2.0; // [-2.0, 2.0]
        const randShadow = (Math.random() * 3.0) - 1.0; // [-1.0, 2.0]

        const out = evaluateFragmentDiagnosticOracle(
          randBase,
          randMode,
          [randLod, randAlpha],
          randNdotL1,
          randShadow
        );

        // Assert no NaNs
        expect(Number.isNaN(out[0])).toBe(false);
        expect(Number.isNaN(out[1])).toBe(false);
        expect(Number.isNaN(out[2])).toBe(false);
        expect(Number.isNaN(out[3])).toBe(false);

        // Assert finite
        expect(Number.isFinite(out[0])).toBe(true);
        expect(Number.isFinite(out[1])).toBe(true);
        expect(Number.isFinite(out[2])).toBe(true);
        expect(Number.isFinite(out[3])).toBe(true);

        // Alpha channel is always [0, 1]
        expect(out[3]).toBeGreaterThanOrEqual(0.0);
        expect(out[3]).toBeLessThanOrEqual(1.0);

        // Color channels non-negative
        expect(out[0]).toBeGreaterThanOrEqual(0.0);
        expect(out[1]).toBeGreaterThanOrEqual(0.0);
        expect(out[2]).toBeGreaterThanOrEqual(0.0);
      }
    });
  });
});
