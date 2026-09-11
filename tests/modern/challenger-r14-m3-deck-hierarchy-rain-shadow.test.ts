// ============================================================================
// File: tests/modern/challenger-r14-m3-deck-hierarchy-rain-shadow.test.ts
// Challenger: challenger_m3_it2_2 (teamwork_preview_challenger)
// Milestone: Milestone 3 Iteration 2 (Cloud Shell Vertex Displacement & Stratum Separation)
// Objective: Adversarially probe cloud deck hierarchy preservation, subterranean clearance,
//            and orographic rain shadow dynamics across the entire planetary surface.
// Invariants: §3 (UCF), §5 (Premultiplied Alpha), §10 (Horizon Tangent),
//             §15 (DEM Parity), §20 (Buffer Discipline), §24 (Dynamic Theme),
//             §28 (Theme Parity), §46 (Import Integrity)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
const ENGINE_PATH = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
const WORKER_TEST_PATH = path.resolve(__dirname, '../webgpu/r14-m3-pitch-adaptive-clouds.test.ts');

const cloudShaderSource = fs.readFileSync(SHADER_PATH, 'utf-8');
const engineSource = fs.readFileSync(ENGINE_PATH, 'utf-8');
const workerTestSource = fs.readFileSync(WORKER_TEST_PATH, 'utf-8');

// ============================================================================
// Exact Shader Model Evaluators (Extracted verbatim from cloud_shell.wgsl)
// ============================================================================

/**
 * Pitch-adaptive standoff exaggeration k_exagg (cloud_shell.wgsl:213–216)
 * k_exagg = 1.0 + (u_atmosphericScale - 1.0) * ((1.0 - clamp(dot(normal, vCam) / 0.35, 0.0, 1.0))^2)
 */
export function evaluateKExagg(NdotV: number, atmosphericScale: number): number {
  const clampedNdotV = Math.max(0.0, Math.min(1.0, NdotV / 0.35));
  const oneMinus = 1.0 - clampedNdotV;
  return 1.0 + (atmosphericScale - 1.0) * (oneMinus * oneMinus);
}

/**
 * Crust elevation displacement (cloud_shell.wgsl:201-210)
 * Invariant §15 DEM Parity: pow(normH, max(0.5, dynamicExp)) * (dispScale * 2.8) * poleAtten
 */
export function evaluateCrustDisp(
  elevMeters: number,
  dispScale: number = 0.08,
  dynamicExp: number = 1.4,
  poleAtten: number = 1.0
): number {
  const normH = Math.max(0.0, elevMeters) / 8848.0;
  return Math.pow(normH, Math.max(0.5, dynamicExp)) * (dispScale * 2.8) * poleAtten;
}

/**
 * Cloud vertex displacement offset (cloud_shell.wgsl:194–220)
 * Production code: totalOffset = crustDisp + effStandoff
 */
export function evaluateCloudOffset(
  layerIdx: number, // 0 = Low (~0.0010), 1 = Mid (~0.0040), 2 = High (~0.0080)
  elevMeters: number,
  atmosphericScale: number = 1.0,
  NdotV: number = 0.5, // nadir default
  dispScale: number = 0.08, // production WebGPUEngine default
  orbitT: number = 0.5,
  peakExponent: number = 1.4,
  poleDist: number = 0.3 // typical mid-latitude
): {
  baseStandoff: number;
  kExagg: number;
  effStandoff: number;
  crustDisp: number;
  totalOffset: number;
} {
  // Standoff values from lines 194-198 of cloud_shell.wgsl
  let baseStandoff = 0.0010;
  if (layerIdx === 1) {
    baseStandoff = 0.0040;
  } else if (layerIdx === 2) {
    baseStandoff = 0.0080;
  }

  const dynamicExp = (1.0 + 0.8 * orbitT) * (Math.max(0.5, peakExponent) / 1.4);
  const poleAtten = 1.0 - Math.max(0.0, Math.min(1.0, (poleDist - 0.85) / (0.98 - 0.85)));
  const crustDisp = evaluateCrustDisp(elevMeters, dispScale, dynamicExp, poleAtten);

  // lines 213-216: pitch-adaptive standoff
  const kExagg = evaluateKExagg(NdotV, atmosphericScale);
  const effStandoff = baseStandoff * kExagg;

  // Remediated line 220: let totalOffset = crustDisp + effStandoff;
  // Strictly additive terrain-following displacement guaranteeing:
  // 1. z_low < z_mid < z_high everywhere
  // 2. z_layer > crustDisp everywhere (zero subterranean penetration)
  const totalOffset = crustDisp + effStandoff;

  return { baseStandoff, kExagg, effStandoff, crustDisp, totalOffset };
}

/**
 * Orographic windward boost and leeward rain shadow evaluator (cloud_shell.wgsl:313–320)
 * deltaH = (elevEast - elevWest) / 8848.0;
 * windwardBoost = clamp(deltaH * 3.5, 0.0, 0.35);
 * leewardShadow = clamp(-deltaH * 4.0, 0.0, 0.70);
 * stratumCoupling = select(1.0, select(0.50, 0.15, layerIdx == 2u), layerIdx >= 1u);
 * orographicFactor = 1.0 + (windwardBoost - leewardShadow) * stratumCoupling;
 */
export function evaluateOrographicEffect(
  elevEast: number,
  elevWest: number,
  layerIdx: number
): {
  deltaH: number;
  windwardBoost: number;
  leewardShadow: number;
  stratumCoupling: number;
  orographicFactor: number;
} {
  const deltaH = (elevEast - elevWest) / 8848.0;
  const windwardBoost = Math.max(0.0, Math.min(0.35, deltaH * 3.5));
  const leewardShadow = Math.max(0.0, Math.min(0.70, -deltaH * 4.0));
  const stratumCoupling = layerIdx >= 1 ? (layerIdx === 2 ? 0.15 : 0.50) : 1.0;
  const orographicFactor = 1.0 + (windwardBoost - leewardShadow) * stratumCoupling;

  return { deltaH, windwardBoost, leewardShadow, stratumCoupling, orographicFactor };
}

/**
 * 2D wind-coupled orographic condensation and dissolution evaluator (RFC Mechanic 4)
 * w = u · ∇h = u * dh/dx + v * dh/dy
 * condensedCloud = clamp(rawCloud + 0.35 * tanh(0.05 * w * 50.0) * stratumCoupling, 0.0, 1.0)
 */
export function evaluate2DOrographicCondensation(
  windVel: [number, number],
  gradH: [number, number],
  rawCloud: number,
  layerIdx: number
): {
  wOrographic: number;
  orographicLift: number;
  condensedCloud: number;
} {
  const wOrographic = windVel[0] * gradH[0] + windVel[1] * gradH[1];
  const stratumCoupling = layerIdx >= 1 ? (layerIdx === 2 ? 0.15 : 0.50) : 1.0;
  const orographicLift = 0.35 * Math.tanh(0.05 * wOrographic * 50.0) * stratumCoupling;
  const condensedCloud = Math.max(0.0, Math.min(1.0, rawCloud + orographicLift));
  return { wOrographic, orographicLift, condensedCloud };
}

describe('Challenger Suite M3-IT2: Deck Hierarchy Preservation, Subterranean Clearance & Rain Shadows', () => {
  // ==========================================================================
  // Pillar 1: Planetary Elevation Probing Across Critical Landforms
  // ==========================================================================
  describe('Pillar 1: Planetary Elevation Probing Across Critical Landforms', () => {
    const PROBE_POINTS = [
      { name: 'Mount Everest (Summit)', elev: 8848.0 },
      { name: 'Andes / Aconcagua', elev: 6961.0 },
      { name: 'Tibetan Plateau', elev: 5000.0 },
      { name: 'Alps / Mont Blanc', elev: 4808.0 },
      { name: 'Sea Level', elev: 0.0 },
      { name: 'Dead Sea (Depression)', elev: -430.0 },
      { name: 'Mariana Trench (Abyssal Deep)', elev: -10924.0 },
    ];

    for (const point of PROBE_POINTS) {
      it(`CHALLENGE-DECK-PROBE: ${point.name} (${point.elev}m) preserves strict hierarchy and surface clearance`, () => {
        const low = evaluateCloudOffset(0, point.elev, 1.0, 0.5, 0.08);
        const mid = evaluateCloudOffset(1, point.elev, 1.0, 0.5, 0.08);
        const high = evaluateCloudOffset(2, point.elev, 1.0, 0.5, 0.08);

        // a) Strict vertical hierarchy: z_low < z_mid < z_high
        expect(low.totalOffset, `${point.name} Low < Mid`).toBeLessThan(mid.totalOffset);
        expect(mid.totalOffset, `${point.name} Mid < High`).toBeLessThan(high.totalOffset);

        // Minimum stratum separations
        expect(mid.totalOffset - low.totalOffset, `${point.name} Mid-Low gap`).toBeCloseTo(0.0030 * low.kExagg, 4);
        expect(high.totalOffset - mid.totalOffset, `${point.name} High-Mid gap`).toBeCloseTo(0.0040 * low.kExagg, 4);

        // b) Surface clearance: z_layer > crustDisp everywhere (0 subterranean penetrations)
        expect(low.totalOffset, `${point.name} Low > crustDisp`).toBeGreaterThan(low.crustDisp);
        expect(mid.totalOffset, `${point.name} Mid > crustDisp`).toBeGreaterThan(mid.crustDisp);
        expect(high.totalOffset, `${point.name} High > crustDisp`).toBeGreaterThan(high.crustDisp);

        expect(low.totalOffset - low.crustDisp).toBeCloseTo(low.effStandoff, 6);
        expect(mid.totalOffset - mid.crustDisp).toBeCloseTo(mid.effStandoff, 6);
        expect(high.totalOffset - high.crustDisp).toBeCloseTo(high.effStandoff, 6);
      });
    }

    it('CHALLENGE-DECK-GRAZING: Verifies Mount Everest under extreme 12.0x limb scaling and grazing angles', () => {
      const everestElev = 8848.0;
      // Grazing angle (NdotV = 0.0) with maximum atmospheric scale (12.0)
      const low = evaluateCloudOffset(0, everestElev, 12.0, 0.0, 0.08);
      const mid = evaluateCloudOffset(1, everestElev, 12.0, 0.0, 0.08);
      const high = evaluateCloudOffset(2, everestElev, 12.0, 0.0, 0.08);

      expect(low.kExagg).toBeCloseTo(12.0, 4);
      expect(low.effStandoff).toBeCloseTo(0.0120, 4);
      expect(mid.effStandoff).toBeCloseTo(0.0480, 4);
      expect(high.effStandoff).toBeCloseTo(0.0960, 4);

      expect(low.totalOffset).toBeLessThan(mid.totalOffset);
      expect(mid.totalOffset).toBeLessThan(high.totalOffset);

      // Gaps expand 12x: mid-low gap is 0.0360, high-mid gap is 0.0480
      expect(mid.totalOffset - low.totalOffset).toBeCloseTo(0.0360, 4);
      expect(high.totalOffset - mid.totalOffset).toBeCloseTo(0.0480, 4);

      // Surface clearances
      expect(low.totalOffset).toBeGreaterThan(low.crustDisp);
      expect(mid.totalOffset).toBeGreaterThan(mid.crustDisp);
      expect(high.totalOffset).toBeGreaterThan(high.crustDisp);
    });
  });

  // ==========================================================================
  // Pillar 2: 50,000-Iteration Monte Carlo Stress Testing
  // ==========================================================================
  describe('Pillar 2: 50,000-Iteration Monte Carlo Stress Testing', () => {
    it('CHALLENGE-MONTE-CARLO-50K: 50,000 trials confirm 0 inversions and 0 subterranean penetrations', () => {
      let inversionCount = 0;
      let subterraneanCount = 0;
      let nonFiniteCount = 0;
      const totalTrials = 50_000;

      for (let i = 0; i < totalTrials; i++) {
        // Elevation across full planet range [-10,924m to +8,848m]
        const elev = -10924.0 + Math.random() * (8848.0 + 10924.0);
        // Pitch / viewing angle NdotV [-1.0 to 1.0]
        const NdotV = -1.0 + Math.random() * 2.0;
        // Atmospheric scale [1.0 to 12.0]
        const scale = 1.0 + Math.random() * 11.0;
        // Displacement scale variation around production default 0.08 [0.04 to 0.16]
        const dispScale = 0.04 + Math.random() * 0.12;
        // Camera distance orbitT [0.0 to 1.0]
        const orbitT = Math.random();
        // Peak exponent [0.8 to 2.2]
        const peakExp = 0.8 + Math.random() * 1.4;
        // Pole distance [0.0 to 1.0]
        const poleDist = Math.random();

        const low = evaluateCloudOffset(0, elev, scale, NdotV, dispScale, orbitT, peakExp, poleDist);
        const mid = evaluateCloudOffset(1, elev, scale, NdotV, dispScale, orbitT, peakExp, poleDist);
        const high = evaluateCloudOffset(2, elev, scale, NdotV, dispScale, orbitT, peakExp, poleDist);

        if (!Number.isFinite(low.totalOffset) || !Number.isFinite(mid.totalOffset) || !Number.isFinite(high.totalOffset)) {
          nonFiniteCount++;
        }

        // Check vertical hierarchy inversion
        if (low.totalOffset >= mid.totalOffset || mid.totalOffset >= high.totalOffset) {
          inversionCount++;
        }

        // Check subterranean penetration below crustDisp
        if (low.totalOffset <= low.crustDisp || mid.totalOffset <= mid.crustDisp || high.totalOffset <= high.crustDisp) {
          subterraneanCount++;
        }
      }

      console.log(`[Monte Carlo 50,000] Inversions: ${inversionCount}, Subterranean: ${subterraneanCount}, Non-Finite: ${nonFiniteCount}`);

      expect(nonFiniteCount).toBe(0);
      expect(inversionCount).toBe(0);
      expect(subterraneanCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 3: Orographic Rain Shadow Dynamics Verification
  // ==========================================================================
  describe('Pillar 3: Orographic Rain Shadow Dynamics Verification', () => {
    it('CHALLENGE-ORO-01: Po Valley downwind of Alps achieves expected -70% thinning', () => {
      // Western Alps crest: ~3500m, Po Valley (Turin/Milan): ~150m
      const elevWest = 3500.0;
      const elevEast = 150.0;
      const effect = evaluateOrographicEffect(elevEast, elevWest, 0); // Low stratus

      console.log(`[Po Valley Rain Shadow] deltaH: ${effect.deltaH.toFixed(4)}, leewardShadow: ${effect.leewardShadow.toFixed(4)}, factor: ${effect.orographicFactor.toFixed(4)}`);

      expect(effect.deltaH).toBeLessThan(0);
      expect(effect.leewardShadow).toBeCloseTo(0.70, 2); // Maxed out leeward shadow
      expect(effect.windwardBoost).toBe(0.0);
      // Low cloud experiences 70% thinning (factor = 1.0 - 0.70 = 0.30)
      expect(effect.orographicFactor).toBeCloseTo(0.30, 2);
    });

    it('CHALLENGE-ORO-02: Great Basin downwind of Sierra Nevada achieves expected -70% thinning', () => {
      // Sierra Nevada crest: ~3200m, Great Basin floor (Nevada): ~1200m
      const elevWest = 3200.0;
      const elevEast = 1200.0;
      const effect = evaluateOrographicEffect(elevEast, elevWest, 0);

      console.log(`[Great Basin Rain Shadow] deltaH: ${effect.deltaH.toFixed(4)}, leewardShadow: ${effect.leewardShadow.toFixed(4)}, factor: ${effect.orographicFactor.toFixed(4)}`);

      expect(effect.deltaH).toBeLessThan(0);
      expect(effect.leewardShadow).toBeCloseTo(0.70, 2);
      expect(effect.orographicFactor).toBeCloseTo(0.30, 2);
    });

    it('CHALLENGE-ORO-03: Stratum coupling attenuates rain shadow at higher cloud decks', () => {
      const elevWest = 3500.0;
      const elevEast = 150.0;
      const low = evaluateOrographicEffect(elevEast, elevWest, 0);
      const mid = evaluateOrographicEffect(elevEast, elevWest, 1);
      const high = evaluateOrographicEffect(elevEast, elevWest, 2);

      // Low: 1.0 - 0.70 * 1.00 = 0.30 (-70%)
      expect(low.orographicFactor).toBeCloseTo(0.30, 2);
      // Mid: 1.0 - 0.70 * 0.50 = 0.65 (-35%)
      expect(mid.orographicFactor).toBeCloseTo(0.65, 2);
      // High: 1.0 - 0.70 * 0.15 = 0.895 (-10.5%)
      expect(high.orographicFactor).toBeCloseTo(0.895, 3);
    });

    it('CHALLENGE-ORO-04: Monte Carlo 50,000 trials confirm orographic factor is strictly non-negative and finite', () => {
      for (let i = 0; i < 50_000; i++) {
        const elevE = -10924.0 + Math.random() * (8848.0 + 10924.0);
        const elevW = -10924.0 + Math.random() * (8848.0 + 10924.0);
        const layer = Math.floor(Math.random() * 3);

        const { orographicFactor } = evaluateOrographicEffect(elevE, elevW, layer);

        expect(Number.isFinite(orographicFactor)).toBe(true);
        expect(Number.isNaN(orographicFactor)).toBe(false);
        // Minimum factor is 1.0 - 0.70 * 1.0 = 0.30
        expect(orographicFactor).toBeGreaterThanOrEqual(0.30);
        // Maximum factor is 1.0 + 0.35 * 1.0 = 1.35
        expect(orographicFactor).toBeLessThanOrEqual(1.35);
      }
    });

    it('CHALLENGE-ORO-05: Tropical easterly trade winds across Andes induce windward condensation & leeward rain shadow', () => {
      // Trade winds blow from East to West: u = -12 m/s, v = 0 m/s
      const tradeWind: [number, number] = [-12.0, 0.0];
      // Eastern Amazonian slope of Andes: terrain rises to the West (dh/dx < 0)
      // Since wind is blowing West (u < 0) and dh/dx < 0, w = u * dh/dx > 0 (windward lift!)
      const amazonSlopeGrad: [number, number] = [-0.05, 0.0];
      const windward = evaluate2DOrographicCondensation(tradeWind, amazonSlopeGrad, 0.20, 0);
      expect(windward.wOrographic).toBeGreaterThan(0);
      expect(windward.condensedCloud).toBeGreaterThan(0.20);

      // Western Pacific coastal slope: terrain drops toward ocean to the West (dh/dx > 0)
      // w = u * dh/dx < 0 (Atacama leeward rain shadow dissolution!)
      const atacamaSlopeGrad: [number, number] = [0.05, 0.0];
      const leeward = evaluate2DOrographicCondensation(tradeWind, atacamaSlopeGrad, 0.20, 0);
      expect(leeward.wOrographic).toBeLessThan(0);
      expect(leeward.condensedCloud).toBeLessThan(0.20);
    });

    it('CHALLENGE-ORO-06: Mid-latitude westerlies across Alps induce French windward lift & Po Valley rain shadow', () => {
      // Mid-latitude westerlies: u = +15 m/s, v = 0 m/s
      const westerly: [number, number] = [15.0, 0.0];
      // Western French Alps slope: terrain rises to the East (dh/dx > 0)
      // w = 15.0 * 0.06 = +0.90 m/s (strong lift!)
      const frenchSlopeGrad: [number, number] = [0.06, 0.0];
      const windward = evaluate2DOrographicCondensation(westerly, frenchSlopeGrad, 0.15, 0);
      expect(windward.wOrographic).toBeGreaterThan(0);
      expect(windward.condensedCloud).toBeGreaterThan(0.15);

      // Eastern Po Valley leeward descent: terrain drops to the East (dh/dx < 0)
      // w = 15.0 * (-0.06) = -0.90 m/s (rain shadow dissolution!)
      const poSlopeGrad: [number, number] = [-0.06, 0.0];
      const leeward = evaluate2DOrographicCondensation(westerly, poSlopeGrad, 0.35, 0);
      expect(leeward.wOrographic).toBeLessThan(0);
      expect(leeward.condensedCloud).toBeLessThan(0.35);
    });

    it('CHALLENGE-ORO-07: Indian summer monsoon southerly flow across Himalayas induces massive southern lift', () => {
      // South Asian Monsoon: u = +4 m/s, v = +18 m/s (strong northward flow)
      const monsoonWind: [number, number] = [4.0, 18.0];
      // Southern Himalayan barrier (Nepal): terrain rises sharply to the North (dh/dy > 0)
      // w = v * dh/dy > 0 (extreme orographic lift!)
      const nepalSlopeGrad: [number, number] = [0.0, 0.08];
      const windward = evaluate2DOrographicCondensation(monsoonWind, nepalSlopeGrad, 0.10, 0);
      expect(windward.wOrographic).toBeGreaterThan(1.0);
      expect(windward.condensedCloud).toBeGreaterThan(0.35);

      // Northern Tibetan Plateau leeward side: terrain drops northward (dh/dy < 0)
      const tibetSlopeGrad: [number, number] = [0.0, -0.05];
      const leeward = evaluate2DOrographicCondensation(monsoonWind, tibetSlopeGrad, 0.30, 0);
      expect(leeward.wOrographic).toBeLessThan(0);
      expect(leeward.condensedCloud).toBeLessThan(0.30);
    });
  });

  // ==========================================================================
  // Pillar 4: Anti-Cheating & Shader AST Audit (Invariant §46, Rule 46)
  // ==========================================================================
  describe('Pillar 4: Anti-Cheating & Shader AST Audit (Invariant §46, Rule 46)', () => {
    it('CHALLENGE-AUDIT-01: Verifies terrainDamp is completely purged from cloud_shell.wgsl', () => {
      // Must not contain any terrain dampening variable or select expression
      expect(cloudShaderSource).not.toMatch(/terrainDamp/);
      expect(cloudShaderSource).not.toMatch(/select\(0\.85,\s*select\(0\.40,\s*0\.15/);
    });

    it('CHALLENGE-AUDIT-02: Verifies cloud_shell.wgsl executes unified additive terrain following', () => {
      // Line 220 in cloud_shell.wgsl: let totalOffset = crustDisp + effStandoff;
      expect(cloudShaderSource).toMatch(/let\s+totalOffset\s*=\s*crustDisp\s*\+\s*effStandoff\s*;/);
    });

    it('CHALLENGE-AUDIT-03: Verifies worker test and production engine share identical dispScale = 0.08', () => {
      const match = workerTestSource.match(/dispScale:\s*number\s*=\s*([0-9.]+)/);
      expect(match).not.toBeNull();
      const testDefaultDispScale = parseFloat(match![1]);

      const engineMatch = engineSource.match(/params\?\.displacementScale\s*\?\?\s*([0-9.]+)/);
      expect(engineMatch).not.toBeNull();
      const productionDispScale = parseFloat(engineMatch![1]);

      expect(testDefaultDispScale).toBe(0.08);
      expect(productionDispScale).toBe(0.08);
      expect(productionDispScale / testDefaultDispScale).toBe(1.0);
    });

    it('CHALLENGE-AUDIT-04: Verifies Invariant §15 DEM decoding parity in cloud_shell.wgsl', () => {
      // demSample.a * 19772.0 - 10924.0
      expect(cloudShaderSource).toMatch(/demSample\.a\s*\*\s*19772\.0\s*-\s*10924\.0/);
    });
  });
});
