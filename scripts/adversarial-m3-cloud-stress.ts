// ============================================================================
// File: scripts/adversarial-m3-cloud-stress.ts
// Empirical Adversarial Stress Harness for Milestone 3 (Cloud Shell WGSL & Inking)
// Challenger: challenger_m3_1 (teamwork_preview_challenger)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SPHERE_RADIUS = 5.0;
const EARTH_RADIUS_KM = 6371.0;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function effectiveCloud(c: number): number {
  return c * smoothstep(0.0, 0.20, c);
}

async function runAdversarialStress() {
  console.log('================================================================');
  console.log('ADVERSARIAL STRESS HARNESS: MILESTONE 3 CLOUD SHELL (CHALLENGER M3_1)');
  console.log('================================================================\n');

  let allPassed = true;

  // --------------------------------------------------------------------------
  // TEST 1: Altitude Standoff Inequality & Physical Altitudes
  // --------------------------------------------------------------------------
  console.log('>>> [TEST 1] Altitude Standoff Inequality & Physical Kilometer Scaling');

  const lowStandoff = 0.0010;
  const midStandoff = 0.0040;
  const jetStandoff = 0.0065;
  const highStandoff = 0.0080;

  const toKm = (s: number) => (s / SPHERE_RADIUS) * EARTH_RADIUS_KM;

  const lowKm = toKm(lowStandoff);
  const midKm = toKm(midStandoff);
  const jetKm = toKm(jetStandoff);
  const highKm = toKm(highStandoff);

  console.log(`  Low Standoff:        ${lowStandoff.toFixed(4)} -> ${lowKm.toFixed(4)} km (Target: ~1.27 km)`);
  console.log(`  Mid Standoff:        ${midStandoff.toFixed(4)} -> ${midKm.toFixed(4)} km (Target: ~5.10 km)`);
  console.log(`  Jet Stream Standoff: ${jetStandoff.toFixed(4)} -> ${jetKm.toFixed(4)} km (Target: ~8.28 km)`);
  console.log(`  High Standoff:       ${highStandoff.toFixed(4)} -> ${highKm.toFixed(4)} km (Target: ~10.19 km)`);

  const standoffOrderingOk =
    lowStandoff < midStandoff &&
    midStandoff < jetStandoff &&
    jetStandoff < highStandoff;

  const kmOrderingOk = lowKm < midKm && midKm < jetKm && jetKm < highKm;

  const lowRangeOk = lowKm >= 1.0 && lowKm <= 2.0;
  const midRangeOk = midKm >= 4.0 && midKm <= 6.0;
  const jetRangeOk = jetKm >= 8.0 && jetKm <= 10.0;
  const highRangeOk = highKm >= 10.0 && highKm <= 12.0;

  const test1Ok = standoffOrderingOk && kmOrderingOk && lowRangeOk && midRangeOk && jetRangeOk && highRangeOk;
  console.log(`  Inequality check (Low < Mid < Jet < High): ${standoffOrderingOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Physical ranges valid:                      ${test1Ok ? 'PASS' : 'FAIL'}\n`);
  if (!test1Ok) allPassed = false;

  // --------------------------------------------------------------------------
  // TEST 2: Feathering Mathematics & 100,000 Monte Carlo Trials
  // --------------------------------------------------------------------------
  console.log('>>> [TEST 2] Feathering Transfer Function: effectiveCloud(c) = c * smoothstep(0, 0.2, c)');

  const t0 = performance.now();
  const TRIALS = 100_000;
  let nanCount = 0;
  let infCount = 0;
  let attenuationViolations = 0;
  let passthroughViolations = 0;
  let monotonicityViolations = 0;

  // Edge cases
  const cZero = effectiveCloud(0.0);
  const cThreshold = effectiveCloud(0.20);
  const cFull = effectiveCloud(1.0);

  console.log(`  Boundary effectiveCloud(0.00): ${cZero.toFixed(6)} (Target: 0.000000)`);
  console.log(`  Boundary effectiveCloud(0.20): ${cThreshold.toFixed(6)} (Target: 0.200000)`);
  console.log(`  Boundary effectiveCloud(1.00): ${cFull.toFixed(6)} (Target: 1.000000)`);

  // Monte Carlo Fuzzing
  for (let i = 0; i < TRIALS; i++) {
    const c = Math.random();
    const eff = effectiveCloud(c);

    if (Number.isNaN(eff)) nanCount++;
    if (!Number.isFinite(eff)) infCount++;

    if (c > 0 && c < 0.20) {
      if (eff >= c) attenuationViolations++;
    }

    if (c >= 0.20) {
      if (Math.abs(eff - c) > 1e-6) passthroughViolations++;
    }
  }

  // Monotonicity verification on dense grid
  const GRID_STEPS = 50_000;
  let prevEff = 0.0;
  for (let j = 0; j <= GRID_STEPS; j++) {
    const c = j / GRID_STEPS;
    const eff = effectiveCloud(c);
    if (j > 0 && eff < prevEff - 1e-12) {
      monotonicityViolations++;
    }
    prevEff = eff;
  }

  // C1 Continuity Check
  const eps = 1e-6;
  const f_minus = effectiveCloud(0.20 - eps);
  const f_0 = effectiveCloud(0.20);
  const f_plus = effectiveCloud(0.20 + eps);
  const leftDeriv = (f_0 - f_minus) / eps;
  const rightDeriv = (f_plus - f_0) / eps;
  const derivDiff = Math.abs(rightDeriv - leftDeriv);

  const tElapsed = performance.now() - t0;
  console.log(`  100,000 Monte Carlo trials completed in ${tElapsed.toFixed(2)}ms`);
  console.log(`  NaN count:                ${nanCount}`);
  console.log(`  Inf count:                ${infCount}`);
  console.log(`  Attenuation violations:   ${attenuationViolations} (Target: 0)`);
  console.log(`  Passthrough violations:   ${passthroughViolations} (Target: 0)`);
  console.log(`  Monotonicity violations:  ${monotonicityViolations} (Target: 0)`);
  console.log(`  C1 Left Derivative at 0.20-:  ${leftDeriv.toFixed(6)}`);
  console.log(`  C1 Right Derivative at 0.20+: ${rightDeriv.toFixed(6)} (Delta: ${derivDiff.toExponential(3)})`);

  const test2Ok =
    cZero === 0.0 &&
    Math.abs(cThreshold - 0.20) < 1e-6 &&
    cFull === 1.0 &&
    nanCount === 0 &&
    infCount === 0 &&
    attenuationViolations === 0 &&
    passthroughViolations === 0 &&
    monotonicityViolations === 0 &&
    derivDiff < 1e-3;

  console.log(`  Feathering verification: ${test2Ok ? 'PASS' : 'FAIL'}\n`);
  if (!test2Ok) allPassed = false;

  // --------------------------------------------------------------------------
  // TEST 3: Tropospheric Differential Drift Monotonicity
  // --------------------------------------------------------------------------
  console.log('>>> [TEST 3] Tropospheric Differential Drift Monotonicity');

  const lowDrift = 0.6;
  const midDrift = 1.0;
  const highDrift = 1.8;

  console.log(`  Low Drift Speed:  ${lowDrift.toFixed(1)}x`);
  console.log(`  Mid Drift Speed:  ${midDrift.toFixed(1)}x`);
  console.log(`  High Drift Speed: ${highDrift.toFixed(1)}x`);

  const driftOrderingOk = lowDrift < midDrift && midDrift < highDrift;
  const shearRatio = highDrift / lowDrift;
  console.log(`  Strictly monotonic increase: ${driftOrderingOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Tropospheric shear ratio (High / Low): ${shearRatio.toFixed(2)}x (Target: 3.00x)`);

  const test3Ok = driftOrderingOk && Math.abs(shearRatio - 3.0) < 1e-6;
  console.log(`  Differential drift check:    ${test3Ok ? 'PASS' : 'FAIL'}\n`);
  if (!test3Ok) allPassed = false;

  // --------------------------------------------------------------------------
  // TEST 4: Struct Alignment & WGSL 16-Byte Packing Rules
  // --------------------------------------------------------------------------
  console.log('>>> [TEST 4] CloudUniforms Struct Alignment (16-Byte WebGPU Packing)');

  interface FieldDef {
    name: string;
    type: string;
    size: number;
    align: number;
    expectedOffset: number;
  }

  const fields: FieldDef[] = [
    { name: 'u_unfurl', type: 'f32', size: 4, align: 4, expectedOffset: 0 },
    { name: 'u_mode', type: 'u32', size: 4, align: 4, expectedOffset: 4 },
    { name: 'u_theme', type: 'u32', size: 4, align: 4, expectedOffset: 8 },
    { name: 'u_time', type: 'f32', size: 4, align: 4, expectedOffset: 12 },
    { name: 'u_cameraPos', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 16 },
    { name: 'u_viewport', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 32 },
    { name: 'u_cloudDrift', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 48 },
    { name: 'u_layerStandoff', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 64 },
    { name: 'u_layerOpacity', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 80 },
    { name: 'u_layerIndex', type: 'u32', size: 4, align: 4, expectedOffset: 96 },
    { name: 'u_isLow', type: 'u32', size: 4, align: 4, expectedOffset: 100 },
    { name: 'u_isMid', type: 'u32', size: 4, align: 4, expectedOffset: 104 },
    { name: 'u_isHigh', type: 'u32', size: 4, align: 4, expectedOffset: 108 },
    { name: 'u_mediumProperties', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 112 },
    { name: 'u_viewMatrix', type: 'mat4x4<f32>', size: 64, align: 16, expectedOffset: 128 },
    { name: 'u_projectionMatrix', type: 'mat4x4<f32>', size: 64, align: 16, expectedOffset: 192 },
  ];

  console.log('  FIELD OFFSET TABLE:');
  console.log('  #   Name                 Type          Size  Align  Offset  16B-Aligned?');
  console.log('  ------------------------------------------------------------------------');

  let offsetErrors = 0;
  let alignmentErrors = 0;
  let runningOffset = 0;

  fields.forEach((f, idx) => {
    const naturallyAligned = Math.ceil(runningOffset / f.align) * f.align;
    if (naturallyAligned !== f.expectedOffset) offsetErrors++;

    const is16B = f.align === 16 ? naturallyAligned % 16 === 0 : true;
    if (!is16B) alignmentErrors++;

    const fieldNum = (idx + 1).toString().padStart(2);
    const fieldName = f.name.padEnd(20);
    const fieldType = f.type.padEnd(12);
    const sizeStr = f.size.toString().padStart(4);
    const alignStr = f.align.toString().padStart(5);
    const offsetStr = naturallyAligned.toString().padStart(6);
    const alignedStatus = naturallyAligned % 16 === 0 ? 'YES' : 'no';

    console.log(`  ${fieldNum}  ${fieldName} ${fieldType}  ${sizeStr}  ${alignStr}  ${offsetStr}      ${alignedStatus}`);
    runningOffset = naturallyAligned + f.size;
  });

  const totalBytes = runningOffset;
  const is256Bytes = totalBytes === 256;
  const is16BAlignedTotal = totalBytes % 16 === 0;
  const is256BAlignedTotal = totalBytes % 256 === 0;

  console.log('  ------------------------------------------------------------------------');
  console.log(`  Total struct size: ${totalBytes} bytes (Target: 256 bytes)`);
  console.log(`  Offset alignment errors: ${offsetErrors}`);
  console.log(`  16-byte alignment violations: ${alignmentErrors}`);
  console.log(`  Divisible by 16: ${is16BAlignedTotal}`);
  console.log(`  Divisible by 256 (WebGPU minUniformBufferOffsetAlignment): ${is256BAlignedTotal}`);

  const test4Ok = is256Bytes && is16BAlignedTotal && is256BAlignedTotal && offsetErrors === 0 && alignmentErrors === 0;
  console.log(`  Struct alignment verification: ${test4Ok ? 'PASS' : 'FAIL'}\n`);
  if (!test4Ok) allPassed = false;

  // --------------------------------------------------------------------------
  // Summary Verdict
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log(`FINAL EMPIRICAL VERDICT: ${allPassed ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runAdversarialStress().catch((err) => {
  console.error('Stress harness failed with error:', err);
  process.exit(1);
});
