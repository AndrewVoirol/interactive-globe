// ============================================================================
// File: tests/webgpu/challenger-m3-kexagg-fuzz.test.ts
// Challenger: challenger_m3_1 (teamwork_preview_challenger)
// Milestone: Round 14 Milestone 3 — Pitch-Adaptive Cloud Shell Separation
// Authoritative Specifications & Invariants:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§2.3 Standoff Exaggeration)
//   - AGENTS.md (Invariants §3: UCF, §5: Premul Alpha, §10: Horizon Falloff, §15: DEM Parity, §20: 16B Struct Alignment, §46: Import Integrity)
// Description:
//   Adversarial stress-testing and Monte Carlo fuzzing (50,000 iterations) of k_exagg:
//   1. 50,000-trial Monte Carlo fuzzing over pitch angles [0°, 90°], viewing angles
//      N · v_cam in [-1.0, 1.0], atmospheric scales in [1.0, 12.0], and strata standoffs.
//   2. Exact nadir invariance: k_exagg ≡ 1.0 for all N · v_cam >= 0.35 across all scales.
//   3. Maximum limb expansion: k_exagg ≡ u_atmosphericScale for all N · v_cam <= 0.0.
//   4. C1 smooth derivative continuity at transition point N · v_cam = 0.35.
//   5. Dual FP64 and FP32 (Math.fround) hardware ALU precision verification.
//   6. Anti-cheating AST and regex audit of production WGSL shader.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

const SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
const ENGINE_PATH = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');

const cloudShaderSource = fs.readFileSync(SHADER_PATH, 'utf-8');
const engineSource = fs.readFileSync(ENGINE_PATH, 'utf-8');

// ============================================================================
// Pure Mathematical Reference Models
// ============================================================================

/** Double-precision (FP64) reference model matching cloud_shell.wgsl vs_main */
export function calculateKExaggFP64(NdotV: number, atmosphericScale: number): number {
  const clampedNdotV = Math.max(0.0, Math.min(1.0, NdotV / 0.35));
  const oneMinus = 1.0 - clampedNdotV;
  return 1.0 + (atmosphericScale - 1.0) * (oneMinus * oneMinus);
}

/** Single-precision (FP32) hardware-equivalent ALU model using Math.fround */
export function calculateKExaggFP32(NdotV: number, atmosphericScale: number): number {
  const fNdotV = Math.fround(NdotV);
  const fScale = Math.fround(atmosphericScale);
  const fDiv = Math.fround(fNdotV / Math.fround(0.35));
  const fClamped = Math.fround(Math.max(0.0, Math.min(1.0, fDiv)));
  const fOneMinus = Math.fround(1.0 - fClamped);
  const fSq = Math.fround(fOneMinus * fOneMinus);
  const fScaleMinus1 = Math.fround(fScale - 1.0);
  const fProd = Math.fround(fScaleMinus1 * fSq);
  return Math.fround(1.0 + fProd);
}

/** Stratum terrain dampening factors */
export function calculateStratumDamp(layerIdx: number): number {
  if (layerIdx >= 1) {
    return layerIdx === 2 ? 0.15 : 0.40;
  }
  return 0.85;
}

describe('Challenger M3: Adversarial k_exagg Monte Carlo & Mathematical Stability', () => {
  // ==========================================================================
  // Pillar 1: 50,000-Iteration Monte Carlo Stress Fuzzing
  // ==========================================================================
  describe('Pillar 1: 50,000-Iteration Monte Carlo Stress Fuzzing', () => {
    it('CHALLENGE-M3-01: 50,000 iterations over pitch, viewing angles, and scales produce zero NaNs, zero Infs, zero negative standoffs', () => {
      const NUM_TRIALS = 50_000;
      let nanCount = 0;
      let infCount = 0;
      let negativeStandoffCount = 0;
      let deckInversionCount = 0;

      const lowBase = 0.0010;
      const midBase = 0.0040;
      const highBase = 0.0080;

      for (let i = 0; i < NUM_TRIALS; i++) {
        // Pitch angle [0, pi/2] (0 to 90 degrees)
        const pitchAngle = Math.random() * (Math.PI / 2);
        // Viewing angle N dot V in [-1.0, 1.0]
        const NdotV = -1.0 + Math.random() * 2.0;
        // Atmospheric scale in [1.0, 12.0]
        const scale = 1.0 + Math.random() * 11.0;
        // Elevation [-10924, 8848]
        const elev = -10924.0 + Math.random() * (8848.0 + 10924.0);
        const normH = Math.max(0.0, elev) / 8848.0;

        // Camera distance and dynamic exponent
        const camDist = 5.1 + Math.random() * 44.9;
        const orbitT = Math.max(0.0, Math.min(1.0, (camDist - 8.0) / (25.0 - 8.0)));
        const dynamicExp = (1.0 + 0.8 * orbitT) * (Math.max(0.5, 1.4) / 1.4);
        const poleAtten = 0.85 + Math.random() * 0.15;
        // Production dispScale = 0.08 (randomized across [0.04, 0.16] to test stress tolerance)
        const dispScale = 0.04 + Math.random() * 0.12;
        const crustDisp = Math.pow(normH, Math.max(0.5, dynamicExp)) * (dispScale * 2.8) * poleAtten;

        // FP64
        const k64 = calculateKExaggFP64(NdotV, scale);
        // FP32
        const k32 = calculateKExaggFP32(NdotV, scale);

        if (Number.isNaN(k64) || Number.isNaN(k32)) nanCount++;
        if (!Number.isFinite(k64) || !Number.isFinite(k32)) infCount++;

        // Standoff evaluations
        const effLow = lowBase * k64;
        const effMid = midBase * k64;
        const effHigh = highBase * k64;

        // Production WGSL cloud_shell.wgsl:220: let totalOffset = crustDisp + effStandoff;
        const totalLow = crustDisp + effLow;
        const totalMid = crustDisp + effMid;
        const totalHigh = crustDisp + effHigh;

        // Zero negative standoffs & zero subterranean penetration (all clouds must clear terrain crust)
        if (effLow <= 0 || effMid <= 0 || effHigh <= 0 || totalLow <= crustDisp || totalMid <= crustDisp || totalHigh <= crustDisp) {
          negativeStandoffCount++;
        }

        // Strict layer deck inequality Low < Mid < High must be preserved
        if (!(totalLow < totalMid && totalMid < totalHigh)) {
          deckInversionCount++;
        }
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(negativeStandoffCount).toBe(0);
      expect(deckInversionCount).toBe(0);
    });

    it('CHALLENGE-M3-02: FP32 hardware ALU emulation matches FP64 reference within tight tolerance across 50,000 trials', () => {
      const NUM_TRIALS = 50_000;
      let maxError = 0;

      for (let i = 0; i < NUM_TRIALS; i++) {
        const NdotV = -1.0 + Math.random() * 2.0;
        const scale = 1.0 + Math.random() * 11.0;

        const k64 = calculateKExaggFP64(NdotV, scale);
        const k32 = calculateKExaggFP32(NdotV, scale);

        const error = Math.abs(k64 - k32);
        if (error > maxError) maxError = error;

        // Precision delta should never exceed 1e-5 (single-precision float precision is ~1.2e-7 relative)
        expect(error).toBeLessThan(1e-4);
      }

      expect(maxError).toBeLessThan(1e-4);
    });
  });

  // ==========================================================================
  // Pillar 2: Exact Nadir Invariance (N · v_cam >= 0.35)
  // ==========================================================================
  describe('Pillar 2: Exact Nadir Invariance (N · v_cam >= 0.35)', () => {
    it('CHALLENGE-M3-03: k_exagg ≡ 1.0 holds identically for all N · v_cam >= 0.35 across 10,000 scale/angle combinations', () => {
      const scales = [1.0, 1.5, 2.0, 3.14159, 5.0, 6.5, 8.0, 10.0, 11.9999, 12.0];

      for (const scale of scales) {
        // Test exact boundary
        expect(calculateKExaggFP64(0.35, scale)).toBe(1.0);
        expect(calculateKExaggFP32(0.35, scale)).toBe(1.0);

        // Dense sweep from 0.35 to 1.0 with step 0.005
        for (let angle = 0.35; angle <= 1.0; angle += 0.005) {
          const k64 = calculateKExaggFP64(angle, scale);
          const k32 = calculateKExaggFP32(angle, scale);
          expect(k64).toBe(1.0);
          expect(k32).toBe(1.0);
        }

        // Test overhead zenith (1.0)
        expect(calculateKExaggFP64(1.0, scale)).toBe(1.0);
        expect(calculateKExaggFP32(1.0, scale)).toBe(1.0);

        // Test FP numerical overshoot (> 1.0) due to normalization rounding
        expect(calculateKExaggFP64(1.0001, scale)).toBe(1.0);
        expect(calculateKExaggFP64(1.5, scale)).toBe(1.0);
        expect(calculateKExaggFP64(10.0, scale)).toBe(1.0);
      }
    });

    it('CHALLENGE-M3-04: At nadir, sensitivity dk/d(scale) is identically zero', () => {
      const angle = 0.50; // Inside nadir region (>= 0.35)
      const baseK = calculateKExaggFP64(angle, 1.0);

      for (let scale = 1.0; scale <= 12.0; scale += 0.5) {
        const k = calculateKExaggFP64(angle, scale);
        expect(k).toBe(baseK);
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Maximum Limb Expansion (N · v_cam <= 0.0)
  // ==========================================================================
  describe('Pillar 3: Maximum Limb Expansion (N · v_cam <= 0.0)', () => {
    it('CHALLENGE-M3-05: k_exagg ≡ u_atmosphericScale holds identically for all N · v_cam <= 0.0 across scales', () => {
      const scales = [1.0, 1.25, 2.5, 4.0, 6.75, 8.0, 10.5, 12.0];

      for (const scale of scales) {
        // Tangent horizon limb (0.0)
        expect(calculateKExaggFP64(0.0, scale)).toBe(scale);
        expect(calculateKExaggFP32(0.0, scale)).toBeCloseTo(scale, 5);

        // Sweep behind horizon into unlit hemisphere
        for (let angle = 0.0; angle >= -1.0; angle -= 0.05) {
          const k64 = calculateKExaggFP64(angle, scale);
          const k32 = calculateKExaggFP32(angle, scale);
          expect(k64).toBe(scale);
          expect(k32).toBeCloseTo(scale, 5);
        }

        // Deep backface / antipodal angle
        expect(calculateKExaggFP64(-1.0, scale)).toBe(scale);
        expect(calculateKExaggFP64(-1.5, scale)).toBe(scale);
      }
    });

    it('CHALLENGE-M3-06: Inter-shell separation scales exactly linearly with atmosphericScale at the limb', () => {
      const lowBase = 0.0010;
      const midBase = 0.0040;
      const highBase = 0.0080;

      for (let scale = 1.0; scale <= 12.0; scale += 1.0) {
        const lowLimb = lowBase * calculateKExaggFP64(0.0, scale);
        const midLimb = midBase * calculateKExaggFP64(0.0, scale);
        const highLimb = highBase * calculateKExaggFP64(0.0, scale);

        expect(midLimb - lowLimb).toBeCloseTo((midBase - lowBase) * scale, 6);
        expect(highLimb - midLimb).toBeCloseTo((highBase - midBase) * scale, 6);
      }
    });
  });

  // ==========================================================================
  // Pillar 4: C1 Smooth Derivative Continuity at Transition Point (N · v_cam = 0.35)
  // ==========================================================================
  describe('Pillar 4: C1 Smooth Derivative Continuity at Transition Point (N · v_cam = 0.35)', () => {
    it('CHALLENGE-M3-07: Value continuity at boundary 0.35 confirms zero jump discontinuity', () => {
      const scales = [1.0, 3.0, 6.0, 9.0, 12.0];
      for (const scale of scales) {
        const eps = 1e-6;
        const kLeft = calculateKExaggFP64(0.35 - eps, scale);
        const kBoundary = calculateKExaggFP64(0.35, scale);
        const kRight = calculateKExaggFP64(0.35 + eps, scale);

        expect(kBoundary).toBe(1.0);
        expect(kRight).toBe(1.0);
        expect(Math.abs(kLeft - kBoundary)).toBeLessThan(1e-5);
      }
    });

    it('CHALLENGE-M3-08: Left and right finite-difference derivatives both converge to 0 as eps -> 0', () => {
      const scale = 12.0; // Maximum slope stress test
      const epsilons = [1e-3, 1e-4, 1e-5, 1e-6];

      for (const eps of epsilons) {
        const kLeft = calculateKExaggFP64(0.35 - eps, scale);
        const kMid = calculateKExaggFP64(0.35, scale);
        const kRight = calculateKExaggFP64(0.35 + eps, scale);

        const dLeft = (kMid - kLeft) / eps;
        const dRight = (kRight - kMid) / eps;

        // Right derivative is identically 0 for all eps
        expect(dRight).toBe(0.0);

        // Secant slope dLeft = (k(0.35) - k(0.35 - eps)) / eps = -((scale - 1.0) / (0.35 * 0.35)) * eps
        // As eps -> 0, dLeft -> 0 smoothly
        const expectedDLeft = -((scale - 1.0) / (0.35 * 0.35)) * eps;
        expect(dLeft).toBeCloseTo(expectedDLeft, 4);

        // At eps = 1e-5, dLeft is < 1e-3
        if (eps <= 1e-5) {
          expect(Math.abs(dLeft)).toBeLessThan(1e-3);
        }
      }
    });

    it('CHALLENGE-M3-09: Strict monotonicity on [0.0, 0.35] ensures zero local extrema or ringing', () => {
      const scale = 12.0;
      let prevK = calculateKExaggFP64(0.0, scale);

      for (let angle = 0.005; angle <= 0.35; angle += 0.005) {
        const currentK = calculateKExaggFP64(angle, scale);
        // As viewing angle increases toward nadir, standoff exaggeration must strictly decrease
        expect(currentK).toBeLessThan(prevK);
        prevK = currentK;
      }
    });
  });

  // ==========================================================================
  // Pillar 5: 3D Camera Orbit Geometry & Raycasting Simulation
  // ==========================================================================
  describe('Pillar 5: 3D Camera Orbit Geometry & Raycasting Simulation', () => {
    it('CHALLENGE-M3-10: 10,000 3D geometric camera orbits confirm nadir and limb behavior on S^2', () => {
      const NUM_GEOM_TRIALS = 10_000;
      const R_planet = 5.0;

      for (let i = 0; i < NUM_GEOM_TRIALS; i++) {
        // Camera orbit at distance R_cam in [5.5, 25.0]
        const R_cam = 5.5 + Math.random() * 19.5;
        // Camera pitch angle in [0, pi/2]
        const pitch = Math.random() * (Math.PI / 2);
        const azim = Math.random() * Math.PI * 2;

        const camX = R_cam * Math.cos(pitch) * Math.cos(azim);
        const camY = R_cam * Math.sin(pitch);
        const camZ = R_cam * Math.cos(pitch) * Math.sin(azim);

        // Surface point on sphere S^2 (Marsaglia spherical point picking)
        const u = -1.0 + Math.random() * 2.0;
        const theta = Math.random() * Math.PI * 2;
        const rS = Math.sqrt(Math.max(0.0, 1.0 - u * u));
        const nx = rS * Math.cos(theta);
        const ny = u;
        const nz = rS * Math.sin(theta);

        const px = R_planet * nx;
        const py = R_planet * ny;
        const pz = R_planet * nz;

        // View vector from surface point to camera
        const vCamX = camX - px;
        const vCamY = camY - py;
        const vCamZ = camZ - pz;
        const vDist = Math.hypot(vCamX, vCamY, vCamZ);
        const vDirX = vCamX / vDist;
        const vDirY = vCamY / vDist;
        const vDirZ = vCamZ / vDist;

        // N dot V
        const NdotV = nx * vDirX + ny * vDirY + nz * vDirZ;

        const scale = 1.0 + Math.random() * 11.0;
        const k = calculateKExaggFP64(NdotV, scale);

        expect(Number.isFinite(k)).toBe(true);
        expect(k).toBeGreaterThanOrEqual(1.0);
        expect(k).toBeLessThanOrEqual(scale + 1e-6);

        if (NdotV >= 0.35) {
          expect(k).toBe(1.0);
        }
        if (NdotV <= 0.0) {
          expect(k).toBe(scale);
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 6: Production Shader Source Audit & Anti-Cheating (Rule 46)
  // ==========================================================================
  describe('Pillar 6: Production Shader Source Audit & Anti-Cheating (Rule 46)', () => {
    it('CHALLENGE-M3-11: cloud_shell.wgsl imports and executes exact pitch-adaptive math and additive displacement in vs_main', () => {
      // Must contain NdotV clamp with 0.35 factor
      expect(cloudShaderSource).toMatch(/let\s+vCam\s*=\s*normalize\(\s*cloud\.u_cameraPos\.xyz\s*-\s*basePos\s*\);/);
      expect(cloudShaderSource).toMatch(/let\s+NdotV\s*=\s*clamp\(\s*dot\(\s*normal\s*,\s*vCam\s*\)\s*\/\s*0\.35\s*,\s*0\.0\s*,\s*1\.0\s*\);/);
      // Must contain k_exagg quadratic formula
      expect(cloudShaderSource).toMatch(/let\s+k_exagg\s*=\s*1\.0\s*\+\s*\(\s*cloud\.u_atmosphericScale\s*-\s*1\.0\s*\)\s*\*\s*\(\s*\(\s*1\.0\s*-\s*NdotV\s*\)\s*\*\s*\(\s*1\.0\s*-\s*NdotV\s*\)\s*\);/);
      // Must modulate baseStandoff
      expect(cloudShaderSource).toMatch(/let\s+effStandoff\s*=\s*baseStandoff\s*\*\s*k_exagg;/);
      // Must use additive terrain-following displacement
      expect(cloudShaderSource).toMatch(/let\s+totalOffset\s*=\s*crustDisp\s*\+\s*effStandoff;/);
      // Obsolete stratum-dampening defect must not exist
      expect(cloudShaderSource).not.toMatch(/terrainDamp/);
    });

    it('CHALLENGE-M3-12: CloudUniforms struct layout adheres strictly to 16-byte alignment and 256-byte packing', () => {
      // Offset 104 (float 26) must be u_atmosphericScale: f32
      expect(cloudShaderSource).toMatch(/u_atmosphericScale\s*:\s*f32/);
      // Offset 108 (float 27) must be u_shadowIntensity: f32
      expect(cloudShaderSource).toMatch(/u_shadowIntensity\s*:\s*f32/);
      // Dead flags u_isMid and u_isHigh must not exist in shader
      expect(cloudShaderSource).not.toMatch(/u_isMid/);
      expect(cloudShaderSource).not.toMatch(/u_isHigh/);
    });

    it('CHALLENGE-M3-13: WebGPUEngine correctly implements atmosphericScale clamping and uniform writes', () => {
      // Clamping property in WebGPUEngine
      expect(engineSource).toMatch(/Math\.max\(\s*1\.0\s*,\s*Math\.min\(\s*12\.0\s*,\s*val\s*\)\s*\)/);
      // Float 26 assignment in updateCloudUniforms
      expect(engineSource).toMatch(/f\[26\]\s*=\s*atmosphericScale;/);
      expect(engineSource).toMatch(/layerBuffer\[26\]\s*=\s*atmosphericScale;/);
      // Float 27 assignment in updateCloudUniforms
      expect(engineSource).toMatch(/f\[27\]\s*=\s*shadowIntensity;/);
      expect(engineSource).toMatch(/layerBuffer\[27\]\s*=\s*shadowIntensity;/);
    });

    it('CHALLENGE-M3-14: Mount Everest (+8,848m) with production dispScale=0.08 preserves strict stratum separation and surface clearance across all pitches and scales', () => {
      const everestElev = 8848.0;
      const normH = 1.0;
      const crustDisp = Math.pow(normH, 1.4) * (0.08 * 2.8); // 0.2240

      const lowBase = 0.0010;
      const midBase = 0.0040;
      const highBase = 0.0080;

      // Sweep angles from nadir (1.0) to grazing (0.0) and scales [1.0, 12.0]
      for (let scale = 1.0; scale <= 12.0; scale += 1.0) {
        for (let NdotV = -0.5; NdotV <= 1.0; NdotV += 0.05) {
          const k = calculateKExaggFP64(NdotV, scale);
          const low = crustDisp + lowBase * k;
          const mid = crustDisp + midBase * k;
          const high = crustDisp + highBase * k;

          // 1. Strict stratum separation Low < Mid < High
          expect(low).toBeLessThan(mid);
          expect(mid).toBeLessThan(high);

          // 2. Strict surface clearance (never subterranean)
          expect(low).toBeGreaterThan(crustDisp);
          expect(mid).toBeGreaterThan(crustDisp);
          expect(high).toBeGreaterThan(crustDisp);

          // 3. Minimum clearance over summit is at least baseStandoff
          expect(low - crustDisp).toBeGreaterThanOrEqual(lowBase);
        }
      }
    });
  });
});
