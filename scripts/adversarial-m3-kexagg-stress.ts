// ============================================================================
// Script: scripts/adversarial-m3-kexagg-stress.ts
// Challenger: challenger_m3_1 (teamwork_preview_challenger)
// Milestone: Round 14 Milestone 3 — Pitch-Adaptive Cloud Shell Separation
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHADER_PATH = path.resolve(__dirname, '../src/webgpu/shaders/cloud_shell.wgsl');

function calculateKExaggFP64(NdotV: number, atmosphericScale: number): number {
  const clampedNdotV = Math.max(0.0, Math.min(1.0, NdotV / 0.35));
  const oneMinus = 1.0 - clampedNdotV;
  return 1.0 + (atmosphericScale - 1.0) * (oneMinus * oneMinus);
}

function calculateKExaggFP32(NdotV: number, atmosphericScale: number): number {
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

function calculateStratumDamp(layerIdx: number): number {
  if (layerIdx >= 1) {
    return layerIdx === 2 ? 0.15 : 0.40;
  }
  return 0.85;
}

function runMonteCarlo() {
  console.log('================================================================');
  console.log('ADVERSARIAL STRESS TEST: k_exagg Monte Carlo Fuzzing (50,000 iterations)');
  console.log('================================================================');

  const NUM_ITERATIONS = 50_000;
  const t0 = performance.now();

  let nanCount = 0;
  let infCount = 0;
  let negativeStandoffCount = 0;
  let hierarchyViolations = 0;
  let nadirViolations = 0;
  let limbViolations = 0;

  const lowBase = 0.0010;
  const midBase = 0.0040;
  const highBase = 0.0080;

  for (let i = 0; i < NUM_ITERATIONS; i++) {
    // 1. Random pitch angle [0, pi/2] radians (0 to 90 degrees)
    const pitch = Math.random() * (Math.PI / 2);
    // 2. Random viewing angle N dot V in [-1.0, 1.0]
    const NdotV = -1.0 + Math.random() * 2.0;
    // 3. Random atmospheric scale [1.0, 12.0]
    const scale = 1.0 + Math.random() * 11.0;
    // 4. Random elevation [-10924, 8848]
    const elev = -10924.0 + Math.random() * (8848.0 + 10924.0);
    const normH = Math.max(0.0, elev) / 8848.0;
    // 5. Random camera distance [5.1, 50.0]
    const camDist = 5.1 + Math.random() * 44.9;
    const orbitT = Math.max(0.0, Math.min(1.0, (camDist - 8.0) / (25.0 - 8.0)));
    const dynamicExp = (1.0 + 0.8 * orbitT) * 1.0;
    // Production dispScale = 0.08
    const dispScale = 0.04 + Math.random() * 0.12;
    const crustDisp = Math.pow(normH, Math.max(0.5, dynamicExp)) * (dispScale * 2.8);

    // FP64 evaluation
    const k64 = calculateKExaggFP64(NdotV, scale);
    // FP32 evaluation
    const k32 = calculateKExaggFP32(NdotV, scale);

    if (Number.isNaN(k64) || Number.isNaN(k32)) nanCount++;
    if (!Number.isFinite(k64) || !Number.isFinite(k32)) infCount++;

    // Nadir invariance check
    if (NdotV >= 0.35) {
      if (Math.abs(k64 - 1.0) > 1e-12 || Math.abs(k32 - 1.0) > 1e-6) {
        nadirViolations++;
      }
    }

    // Limb expansion check
    if (NdotV <= 0.0) {
      if (Math.abs(k64 - scale) > 1e-12 || Math.abs(k32 - Math.fround(scale)) > 1e-5) {
        limbViolations++;
      }
    }

    // Strata standoffs & offsets: Production additive terrain following (cloud_shell.wgsl:220)
    const effLow = lowBase * k64;
    const effMid = midBase * k64;
    const effHigh = highBase * k64;

    const totalLow = crustDisp + effLow;
    const totalMid = crustDisp + effMid;
    const totalHigh = crustDisp + effHigh;

    if (effLow <= 0 || effMid <= 0 || effHigh <= 0 || totalLow <= crustDisp || totalMid <= crustDisp || totalHigh <= crustDisp) {
      negativeStandoffCount++;
    }

    if (!(totalLow < totalMid && totalMid < totalHigh)) {
      hierarchyViolations++;
    }
  }

  const durationMs = performance.now() - t0;

  console.log(`Completed ${NUM_ITERATIONS.toLocaleString()} iterations in ${durationMs.toFixed(2)}ms`);
  console.log(`- NaN values:                 ${nanCount}`);
  console.log(`- Infinity values:            ${infCount}`);
  console.log(`- Negative standoffs:         ${negativeStandoffCount}`);
  console.log(`- Deck hierarchy violations:  ${hierarchyViolations}`);
  console.log(`- Nadir invariance errors:    ${nadirViolations}`);
  console.log(`- Limb expansion errors:      ${limbViolations}`);

  // Derivative continuity verification
  console.log('\n--- C1 Smooth Derivative Continuity Probing at N dot V = 0.35 ---');
  const testScales = [1.0, 2.0, 4.0, 8.0, 12.0];
  let maxDerivDelta = 0;
  for (const s of testScales) {
    const eps = 1e-5;
    const kLeft = calculateKExaggFP64(0.35 - eps, s);
    const kMid = calculateKExaggFP64(0.35, s);
    const kRight = calculateKExaggFP64(0.35 + eps, s);

    const dLeft = (kMid - kLeft) / eps;
    const dRight = (kRight - kMid) / eps;
    const delta = Math.abs(dRight - dLeft);
    if (delta > maxDerivDelta) maxDerivDelta = delta;
    console.log(`Scale ${s.toFixed(1)}x: dLeft = ${dLeft.toFixed(6)}, dRight = ${dRight.toFixed(6)}, |delta| = ${delta.toExponential(3)}`);
  }

  // Shader source inspection
  console.log('\n--- WGSL Shader Source Anti-Cheating Inspection ---');
  const shaderCode = fs.readFileSync(SHADER_PATH, 'utf-8');
  const hasNdotV = /let\s+NdotV\s*=\s*clamp\(\s*dot\(\s*normal\s*,\s*vCam\s*\)\s*\/\s*0\.35\s*,\s*0\.0\s*,\s*1\.0\s*\);/.test(shaderCode);
  const hasKExagg = /let\s+k_exagg\s*=\s*1\.0\s*\+\s*\(\s*cloud\.u_atmosphericScale\s*-\s*1\.0\s*\)\s*\*\s*\(\s*\(\s*1\.0\s*-\s*NdotV\s*\)\s*\*\s*\(\s*1\.0\s*-\s*NdotV\s*\)\s*\);/.test(shaderCode);
  const hasEffStandoff = /let\s+effStandoff\s*=\s*baseStandoff\s*\*\s*k_exagg;/.test(shaderCode);
  const hasTotalOffset = /let\s+totalOffset\s*=\s*crustDisp\s*\+\s*effStandoff;/.test(shaderCode);
  const hasNoTerrainDamp = !/terrainDamp/.test(shaderCode);

  console.log(`- Shader contains NdotV formula:      ${hasNdotV ? 'PASS' : 'FAIL'}`);
  console.log(`- Shader contains k_exagg formula:    ${hasKExagg ? 'PASS' : 'FAIL'}`);
  console.log(`- Shader contains effStandoff:        ${hasEffStandoff ? 'PASS' : 'FAIL'}`);
  console.log(`- Shader contains totalOffset:        ${hasTotalOffset ? 'PASS' : 'FAIL'}`);
  console.log(`- Shader eliminates terrainDamp:      ${hasNoTerrainDamp ? 'PASS' : 'FAIL'}`);

  const passed = nanCount === 0 &&
                 infCount === 0 &&
                 negativeStandoffCount === 0 &&
                 hierarchyViolations === 0 &&
                 nadirViolations === 0 &&
                 limbViolations === 0 &&
                 maxDerivDelta < 1e-2 &&
                 hasNdotV && hasKExagg && hasEffStandoff && hasTotalOffset && hasNoTerrainDamp;

  console.log('\n================================================================');
  console.log(`VERDICT: ${passed ? 'CONFIRMED' : 'REJECTED'}`);
  console.log('================================================================');

  if (!passed) {
    process.exit(1);
  }
}

runMonteCarlo();
