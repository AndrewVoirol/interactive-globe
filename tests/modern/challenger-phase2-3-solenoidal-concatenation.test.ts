// ============================================================================
// File: tests/modern/challenger-phase2-3-solenoidal-concatenation.test.ts
// Challenger: challenger_phase2_3_2 (Empirical Challenger)
// Mission: Phase 2.3 Solenoidal Vector Noise & Cross-Pass Concatenation Audit
// Reference: SHADERS_SPEC_LEDGER.md §3, AGENTS.md Rules 4, 7, 21, 28
//
// Test Domains:
// - Domain 1: Numerical Finite Differences of computeCurlNoise (div u analysis)
// - Domain 2: Exact Solenoidal Correction Oracle (div u ~ 0 verification)
// - Domain 3: 6-Pass Concatenation Static AST / Symbol Conflict Audit
// - Domain 4: Live Naga WGSL Compiler Validation across all 6 Concatenated Pipelines
// - Domain 5: Execution of audit-manifold.sh
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ----------------------------------------------------------------------------
// Mirror of current computeCurlNoise in src/webgpu/shaders/manifold.wgsl
// ----------------------------------------------------------------------------
const ROT_COLS: [number, number, number][] = [
  [0.00,  0.80,  0.60],  // Col 0
  [-0.80, 0.36, -0.48],  // Col 1
  [-0.60, -0.48, 0.64]   // Col 2
];

function matMulVec(colMatrix: [number, number, number][], v: [number, number, number]): [number, number, number] {
  return [
    colMatrix[0][0] * v[0] + colMatrix[1][0] * v[1] + colMatrix[2][0] * v[2],
    colMatrix[0][1] * v[0] + colMatrix[1][1] * v[1] + colMatrix[2][1] * v[2],
    colMatrix[0][2] * v[0] + colMatrix[1][2] * v[1] + colMatrix[2][2] * v[2]
  ];
}

const ROT_TRANSPOSE: [number, number, number][] = [
  [ROT_COLS[0][0], ROT_COLS[1][0], ROT_COLS[2][0]],
  [ROT_COLS[0][1], ROT_COLS[1][1], ROT_COLS[2][1]],
  [ROT_COLS[0][2], ROT_COLS[1][2], ROT_COLS[2][2]]
];

export function computeCurrentCurlNoise(p: [number, number, number], time: number): [number, number, number] {
  const t = time * 0.75;
  const p045: [number, number, number] = [p[0] * 0.45, p[1] * 0.45, p[2] * 0.45];
  const q1 = matMulVec(ROT_COLS, p045);

  const p095: [number, number, number] = [p[0] * 0.95, p[1] * 0.95, p[2] * 0.95];
  const q2 = matMulVec(ROT_COLS, matMulVec(ROT_COLS, p095));

  const ux = -0.55 * Math.cos(0.55 * q1[1] + t * 0.7) - 0.45 * Math.cos(0.95 * q1[2] - t * 0.5);
  const uy = -0.55 * Math.cos(0.55 * q1[2] + t * 0.9) - 0.45 * Math.cos(0.95 * q1[0] - t * 0.6);
  const uz = -0.55 * Math.cos(0.55 * q1[0] + t * 0.8) - 0.45 * Math.cos(0.95 * q1[1] - t * 0.4);

  const u2x = 0.25 * Math.sin(1.5 * q2[1] - t * 1.2);
  const u2y = 0.25 * Math.sin(1.5 * q2[2] - t * 1.1);
  const u2z = 0.25 * Math.sin(1.5 * q2[0] - t * 1.3);

  return matMulVec(ROT_COLS, [ux + u2x, uy + u2y, uz + u2z]);
}

// ----------------------------------------------------------------------------
// Mathematically corrected truly solenoidal curl noise:
// Uses transpose(rot) for the contravariant return vector mapping
// ----------------------------------------------------------------------------
export function computeCorrectedSolenoidalNoise(p: [number, number, number], time: number): [number, number, number] {
  const t = time * 0.75;
  const p045: [number, number, number] = [p[0] * 0.45, p[1] * 0.45, p[2] * 0.45];
  const q1 = matMulVec(ROT_COLS, p045);

  const p095: [number, number, number] = [p[0] * 0.95, p[1] * 0.95, p[2] * 0.95];
  const q2 = matMulVec(ROT_COLS, matMulVec(ROT_COLS, p095));

  const ux = -0.55 * Math.cos(0.55 * q1[1] + t * 0.7) - 0.45 * Math.cos(0.95 * q1[2] - t * 0.5);
  const uy = -0.55 * Math.cos(0.55 * q1[2] + t * 0.9) - 0.45 * Math.cos(0.95 * q1[0] - t * 0.6);
  const uz = -0.55 * Math.cos(0.55 * q1[0] + t * 0.8) - 0.45 * Math.cos(0.95 * q1[1] - t * 0.4);

  const u2x = 0.25 * Math.sin(1.5 * q2[1] - t * 1.2);
  const u2y = 0.25 * Math.sin(1.5 * q2[2] - t * 1.1);
  const u2z = 0.25 * Math.sin(1.5 * q2[0] - t * 1.3);

  const out1 = matMulVec(ROT_TRANSPOSE, [ux, uy, uz]);
  const out2 = matMulVec(ROT_TRANSPOSE, matMulVec(ROT_TRANSPOSE, [u2x, u2y, u2z]));

  return [out1[0] + out2[0], out1[1] + out2[1], out1[2] + out2[2]];
}

function calculateDivergence(
  fn: (p: [number, number, number], t: number) => [number, number, number],
  p: [number, number, number],
  time: number,
  h = 1e-4
): number {
  const v_xp = fn([p[0] + h, p[1], p[2]], time);
  const v_xm = fn([p[0] - h, p[1], p[2]], time);
  const v_yp = fn([p[0], p[1] + h, p[2]], time);
  const v_ym = fn([p[0], p[1] - h, p[2]], time);
  const v_zp = fn([p[0], p[1], p[2] + h], time);
  const v_zm = fn([p[0], p[1], p[2] - h], time);

  const dux_dx = (v_xp[0] - v_xm[0]) / (2 * h);
  const duy_dy = (v_yp[1] - v_ym[1]) / (2 * h);
  const duz_dz = (v_zp[2] - v_zm[2]) / (2 * h);

  return dux_dx + duy_dy + duz_dz;
}

describe('Challenger 2: Solenoidal Vector Noise & Concatenation Suite (Phase 2.3)', () => {
  const SHADERS_DIR = path.resolve(__dirname, '../../src/webgpu/shaders');
  const CONCATENATED_SHADERS = [
    'wind_particles.wgsl',
    'physics_sim.wgsl',
    'vector_ribbon.wgsl',
    'crust_hydrosphere.wgsl',
    'cloud_shell.wgsl',
    'atmosphere_scatter.wgsl'
  ];

  // =========================================================================
  // Domain 1: Numerical Finite Differences of Current computeCurlNoise
  // =========================================================================
  describe('Domain 1: Empirical Divergence Audit of Current computeCurlNoise', () => {
    it('C2-CURL-01: empirically documents non-zero divergence in current implementation due to R vs R^T transformation mismatch', () => {
      let maxDivergence = 0;
      let nonZeroCount = 0;
      const SAMPLES = 1000;

      for (let i = 0; i < SAMPLES; i++) {
        const p: [number, number, number] = [
          (Math.sin(i * 0.17) * 8.0),
          (Math.cos(i * 0.31) * 8.0),
          (Math.sin(i * 0.73) * 8.0)
        ];
        const time = (i * 0.05) % 10.0;
        const div = Math.abs(calculateDivergence(computeCurrentCurlNoise, p, time));
        if (div > maxDivergence) maxDivergence = div;
        if (div > 1e-3) nonZeroCount++;
      }

      // Empirical challenger finding: The current computeCurlNoise in manifold.wgsl has non-zero divergence
      // reaching up to ~0.88 because the coordinate rotation R is not inverted upon output (R^T)
      expect(maxDivergence).toBeGreaterThan(0.5);
      expect(nonZeroCount).toBeGreaterThan(900);
    });
  });

  // =========================================================================
  // Domain 2: Exact Solenoidal Correction Oracle (div u ~ 0 verification)
  // =========================================================================
  describe('Domain 2: Mathematically Corrected Solenoidal Formulation', () => {
    it('C2-CURL-02: verifies that corrected formulation achieves div u == 0 (< 1e-4) across 5,000 random 3D points', () => {
      let maxCorrectedDivergence = 0;
      const SAMPLES = 5000;

      for (let i = 0; i < SAMPLES; i++) {
        const p: [number, number, number] = [
          (Math.sin(i * 1.37) * 15.0),
          (Math.cos(i * 2.11) * 15.0),
          (Math.sin(i * 0.93) * 15.0)
        ];
        const time = (i * 0.13) % 20.0;
        const div = Math.abs(calculateDivergence(computeCorrectedSolenoidalNoise, p, time, 1e-5));
        if (div > maxCorrectedDivergence) maxCorrectedDivergence = div;
      }

      // The corrected formulation satisfies div u = 0 to within numerical finite difference truncation error (< 1e-5)
      expect(maxCorrectedDivergence).toBeLessThan(1e-4);
    });

    it('C2-CURL-03: verifies corrected solenoidal formulation at extreme coordinates (origin and 1000 radius)', () => {
      const originDiv = Math.abs(calculateDivergence(computeCorrectedSolenoidalNoise, [0, 0, 0], 1.0, 1e-5));
      expect(originDiv).toBeLessThan(1e-4);

      const extremeDiv = Math.abs(calculateDivergence(computeCorrectedSolenoidalNoise, [1000, 1000, 1000], 50.0, 1e-5));
      expect(extremeDiv).toBeLessThan(1e-4);
    });
  });

  // =========================================================================
  // Domain 3: 6-Pass Concatenation Static AST / Symbol Conflict Audit
  // =========================================================================
  describe('Domain 3: Cross-Pass Concatenation & Symbol Uniqueness Audit', () => {
    const manifoldContent = fs.readFileSync(path.join(SHADERS_DIR, 'manifold.wgsl'), 'utf8');

    it('C2-CONCAT-01: verifies manifold.wgsl exports exactly PI, RADIUS, computeCurlNoise, DeformedVertex, evaluateManifoldCore', () => {
      expect(manifoldContent).toContain('const PI: f32 = 3.14159265358979;');
      expect(manifoldContent).toContain('const RADIUS: f32 = 5.0;');
      expect(manifoldContent).toContain('fn computeCurlNoise');
      expect(manifoldContent).toContain('struct DeformedVertex');
      expect(manifoldContent).toContain('fn evaluateManifoldCore');
      expect(manifoldContent).toContain('let rotT = transpose(rot);');
    });

    it.each(CONCATENATED_SHADERS)('C2-CONCAT-02: verifies %s contains ZERO duplicate declarations of manifold symbols', (shaderName) => {
      const shaderContent = fs.readFileSync(path.join(SHADERS_DIR, shaderName), 'utf8');

      // Check no duplicate fn computeCurlNoise
      const curlMatches = shaderContent.match(/fn\s+computeCurlNoise\b/g);
      expect(curlMatches, `${shaderName} redeclares computeCurlNoise`).toBeNull();

      // Check no duplicate evaluateManifold / evaluateManifoldCore
      const evalMatches = shaderContent.match(/fn\s+evaluateManifoldCore\b/g);
      expect(evalMatches, `${shaderName} redeclares evaluateManifoldCore`).toBeNull();

      const evalManifoldMatches = shaderContent.match(/fn\s+evaluateManifold\b/g);
      expect(evalManifoldMatches, `${shaderName} redeclares evaluateManifold`).toBeNull();

      // Check no duplicate struct DeformedVertex
      const structMatches = shaderContent.match(/struct\s+DeformedVertex\b/g);
      expect(structMatches, `${shaderName} redeclares DeformedVertex`).toBeNull();

      // Check no duplicate global const PI (matching manifold.wgsl declaration)
      const piMatches = shaderContent.match(/^\s*const\s+PI\s*:\s*f32\b/gm);
      expect(piMatches, `${shaderName} redeclares const PI: f32`).toBeNull();

      // Check no duplicate global const RADIUS
      const radiusMatches = shaderContent.match(/^\s*const\s+RADIUS\s*:\s*f32\b/gm);
      expect(radiusMatches, `${shaderName} redeclares const RADIUS: f32`).toBeNull();
    });

    it('C2-CONCAT-03: verifies WebGPUEngine.ts contains exactly 6 manifoldWGSL pipeline concatenations', () => {
      const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const engineContent = fs.readFileSync(enginePath, 'utf8');

      const matches = engineContent.match(/manifoldWGSL\s*\+\s*'\\n'\s*\+\s*\w+WGSL/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(6);

      expect(engineContent).toContain("manifoldWGSL + '\\n' + windParticlesWGSL");
      expect(engineContent).toContain("manifoldWGSL + '\\n' + physicsSimWGSL");
      expect(engineContent).toContain("manifoldWGSL + '\\n' + vectorRibbonWGSL");
      expect(engineContent).toContain("manifoldWGSL + '\\n' + crustHydrosphereWGSL");
      expect(engineContent).toContain("manifoldWGSL + '\\n' + cloudShellWGSL");
      expect(engineContent).toContain("manifoldWGSL + '\\n' + atmosphereScatterWGSL");
    });
  });

  // =========================================================================
  // Domain 4: Live Naga WGSL Compiler Validation across all 6 Concatenated Pipelines
  // =========================================================================
  describe('Domain 4: Live Naga WGSL Compiler Validation', () => {
    const manifoldContent = fs.readFileSync(path.join(SHADERS_DIR, 'manifold.wgsl'), 'utf8');
    const nagaPath = '/Users/andrewvoirol/.cargo/bin/naga';
    const hasNaga = fs.existsSync(nagaPath);

    it.each(CONCATENATED_SHADERS)('C2-NAGA-01: compiles concatenated %s cleanly through Naga validator', (shaderName) => {
      if (!hasNaga) {
        console.warn('Naga binary not present; skipping live compiler validation.');
        return;
      }

      const shaderContent = fs.readFileSync(path.join(SHADERS_DIR, shaderName), 'utf8');
      const fullCode = manifoldContent + '\n' + shaderContent;

      const tmpFile = path.join('/tmp', `naga_test_${shaderName}`);
      fs.writeFileSync(tmpFile, fullCode, 'utf8');

      try {
        const out = execSync(`"${nagaPath}" "${tmpFile}"`, { encoding: 'utf8' });
        expect(out).toContain('Validation successful');
      } finally {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      }
    });
  });

  // =========================================================================
  // Domain 5: Execution of audit-manifold.sh
  // =========================================================================
  describe('Domain 5: Shader Pipeline Audit Script Gating', () => {
    it('C2-AUDIT-01: bash .agents/skills/shader-pipeline/scripts/audit-manifold.sh exits 0', () => {
      const scriptPath = path.resolve(__dirname, '../../.agents/skills/shader-pipeline/scripts/audit-manifold.sh');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const result = execSync(`bash "${scriptPath}"`, {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
      });

      expect(result).toContain('Exactly 1 definition found');
      expect(result).toContain('manifold.wgsl');
    });
  });
});
