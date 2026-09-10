// ============================================================================
// File: scripts/adversarial-cloud-stress.ts
// Empirical Adversarial Stress Harness for GFS Cloud Data Pipeline (Milestone 1)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeFloat16, encodeFloat16 } from '../src/core/math/float16';
import {
  computeWebGPURowPitch,
  generateProceduralCloudGrids,
  GFS_CLOUD_WIDTH,
  GFS_CLOUD_HEIGHT,
  GFS_CLOUD_FILE_SIZE,
} from './fetch-or-generate-gfs-clouds';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'public/data');

interface StratumStats {
  name: string;
  filePath: string;
  fileSize: number;
  expectedSize: number;
  sizeMatches: boolean;
  totalElements: number;
  nanCount: number;
  infCount: number;
  negativeCount: number;
  greaterThanOneCount: number;
  min: number;
  max: number;
  mean: number;
  variance: number;
  stdDev: number;
  zeroCount: number;
  oneCount: number;
}

function analyzeStratum(name: string, filename: string): { stats: StratumStats; values: Float32Array } {
  const filePath = path.join(dataDir, filename);
  const stats: StratumStats = {
    name,
    filePath,
    fileSize: 0,
    expectedSize: GFS_CLOUD_FILE_SIZE,
    sizeMatches: false,
    totalElements: 0,
    nanCount: 0,
    infCount: 0,
    negativeCount: 0,
    greaterThanOneCount: 0,
    min: Infinity,
    max: -Infinity,
    mean: 0,
    variance: 0,
    stdDev: 0,
    zeroCount: 0,
    oneCount: 0,
  };

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  stats.fileSize = stat.size;
  stats.sizeMatches = stat.size === GFS_CLOUD_FILE_SIZE;

  const buf = fs.readFileSync(filePath);
  const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  stats.totalElements = u16.length;

  const values = new Float32Array(u16.length);
  let sum = 0;

  // Single-pass exhaustive decoding
  for (let i = 0; i < u16.length; i++) {
    const raw = u16[i];
    const val = decodeFloat16(raw);
    values[i] = val;

    if (Number.isNaN(val)) {
      stats.nanCount++;
      continue;
    }
    if (!Number.isFinite(val)) {
      stats.infCount++;
      continue;
    }
    if (val < 0) {
      stats.negativeCount++;
    }
    if (val > 1.000001) { // allow tiny float tolerance
      stats.greaterThanOneCount++;
    }
    if (val === 0) stats.zeroCount++;
    if (val >= 0.9999) stats.oneCount++;

    if (val < stats.min) stats.min = val;
    if (val > stats.max) stats.max = val;
    sum += val;
  }

  stats.mean = sum / stats.totalElements;

  // Second pass: variance
  let sqDiffSum = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - stats.mean;
    sqDiffSum += diff * diff;
  }
  stats.variance = sqDiffSum / stats.totalElements;
  stats.stdDev = Math.sqrt(stats.variance);

  return { stats, values };
}

function calculatePearsonCorrelation(a: Float32Array, b: Float32Array, meanA: number, meanB: number): number {
  if (a.length !== b.length) throw new Error('Array length mismatch');
  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < a.length; i++) {
    const diffA = a[i] - meanA;
    const diffB = b[i] - meanB;
    num += diffA * diffB;
    denA += diffA * diffA;
    denB += diffB * diffB;
  }

  return num / (Math.sqrt(denA) * Math.sqrt(denB));
}

async function runAdversarialCloudStress() {
  console.log('================================================================');
  console.log('ADVERSARIAL STRESS HARNESS: GFS CLOUD DATA PIPELINE (MILESTONE 1)');
  console.log('================================================================\n');

  // Test 1: Stratum Analysis & Exhaustive Float16 Decoding
  console.log('>>> Running Test 1: Exhaustive Float16 Decoding (1,038,240 nodes x 3 files)...');
  const t0 = performance.now();
  const low = analyzeStratum('Low (LCDC)', 'gfs-cloud-low-latest.bin');
  const mid = analyzeStratum('Mid (MCDC)', 'gfs-cloud-mid-latest.bin');
  const high = analyzeStratum('High (HCDC)', 'gfs-cloud-high-latest.bin');
  const decodeElapsed = performance.now() - t0;
  console.log(`Completed exhaustive decoding of 3,114,720 values in ${decodeElapsed.toFixed(2)}ms\n`);

  const strata = [low.stats, mid.stats, high.stats];

  console.log('--- EMPIRICAL STRATUM METRICS ---');
  for (const s of strata) {
    console.log(`Stratum: ${s.name}`);
    console.log(`  File size: ${s.fileSize.toLocaleString()} bytes (Expected: ${s.expectedSize.toLocaleString()}) -> MATCH: ${s.sizeMatches}`);
    console.log(`  Total elements: ${s.totalElements.toLocaleString()}`);
    console.log(`  NaNs: ${s.nanCount}, Infs: ${s.infCount}, Negatives: ${s.negativeCount}, >1.0: ${s.greaterThanOneCount}`);
    console.log(`  Min: ${s.min.toFixed(6)}, Max: ${s.max.toFixed(6)}, Mean: ${s.mean.toFixed(6)}`);
    console.log(`  Variance: ${s.variance.toFixed(6)} (Target > 0.005: ${s.variance > 0.005 ? 'PASS' : 'FAIL'}), StdDev: ${s.stdDev.toFixed(6)}`);
    console.log(`  Zeros: ${s.zeroCount.toLocaleString()}, Ones: ${s.oneCount.toLocaleString()}\n`);
  }

  // Test 2: Cross-Layer Pearson Correlation Matrix
  console.log('>>> Running Test 2: Cross-Layer Pearson Correlation Analysis...');
  const t1 = performance.now();
  const rLowMid = calculatePearsonCorrelation(low.values, mid.values, low.stats.mean, mid.stats.mean);
  const rMidHigh = calculatePearsonCorrelation(mid.values, high.values, mid.stats.mean, high.stats.mean);
  const rLowHigh = calculatePearsonCorrelation(low.values, high.values, low.stats.mean, high.stats.mean);
  const corrElapsed = performance.now() - t1;
  console.log(`Completed full 3-way correlation over 1,038,240 pairs in ${corrElapsed.toFixed(2)}ms\n`);

  console.log('--- CROSS-LAYER CORRELATION MATRIX ---');
  console.log(`  r(Low, Mid):   ${rLowMid.toFixed(6)} (Target < 0.95: ${rLowMid < 0.95 ? 'PASS' : 'FAIL'})`);
  console.log(`  r(Mid, High):  ${rMidHigh.toFixed(6)} (Target < 0.95: ${rMidHigh < 0.95 ? 'PASS' : 'FAIL'})`);
  console.log(`  r(Low, High):  ${rLowHigh.toFixed(6)} (Target < 0.95: ${rLowHigh < 0.95 ? 'PASS' : 'FAIL'})\n`);

  // Test 3: Invariant §40 Row-Pitch Padding Verification
  console.log('>>> Running Test 3: Invariant §40 WebGPU Row-Pitch Padding Verification...');
  const pitch = computeWebGPURowPitch();
  console.log(`  Raw row bytes:      ${pitch.rawRowBytes} bytes (${GFS_CLOUD_WIDTH} x 2)`);
  console.log(`  Divisible by 256?   ${pitch.rawRowBytes % 256 === 0} (${pitch.rawRowBytes} % 256 = ${pitch.rawRowBytes % 256})`);
  console.log(`  Padded row bytes:   ${pitch.paddedRowBytes} bytes (${pitch.paddedRowBytes / 256} x 256)`);
  console.log(`  Divisible by 256?   ${pitch.paddedRowBytes % 256 === 0}`);
  console.log(`  Upload buffer size: ${pitch.uploadBufferSize.toLocaleString()} bytes (${pitch.paddedRowBytes} x ${pitch.rows})`);
  console.log(`  Raw unpadded size:  ${(pitch.rawRowBytes * pitch.rows).toLocaleString()} bytes`);
  console.log(`  Padding overhead:   ${(pitch.uploadBufferSize - pitch.rawRowBytes * pitch.rows).toLocaleString()} bytes (${(((pitch.uploadBufferSize / (pitch.rawRowBytes * pitch.rows)) - 1) * 100).toFixed(2)}%)\n`);

  // Test 4: Monte Carlo Procedural Fuzzing (100,000 randomized trials)
  console.log('>>> Running Test 4: Monte Carlo Procedural Fuzzing (100,000 trials)...');
  const t2 = performance.now();
  const { lowBuf, midBuf, highBuf } = generateProceduralCloudGrids();
  const lowU16 = new Uint16Array(lowBuf);
  const midU16 = new Uint16Array(midBuf);
  const highU16 = new Uint16Array(highBuf);

  let mcFailures = 0;
  const numTrials = 100_000;
  for (let t = 0; t < numTrials; t++) {
    const lonDeg = Math.random() * 360.0;
    const latDeg = (Math.random() * 180.0) - 90.0;
    const i = Math.floor((lonDeg / 360.0) * GFS_CLOUD_WIDTH) % GFS_CLOUD_WIDTH;
    const j = Math.floor(((90.0 - latDeg) / 180.0) * (GFS_CLOUD_HEIGHT - 1));
    const idx = j * GFS_CLOUD_WIDTH + i;

    const valLow = decodeFloat16(lowU16[idx]);
    const valMid = decodeFloat16(midU16[idx]);
    const valHigh = decodeFloat16(highU16[idx]);

    if (!Number.isFinite(valLow) || valLow < 0 || valLow > 1.0) mcFailures++;
    if (!Number.isFinite(valMid) || valMid < 0 || valMid > 1.0) mcFailures++;
    if (!Number.isFinite(valHigh) || valHigh < 0 || valHigh > 1.0) mcFailures++;
  }
  const mcElapsed = performance.now() - t2;
  console.log(`Completed 100,000 Monte Carlo coordinate queries in ${mcElapsed.toFixed(2)}ms with ${mcFailures} boundary/NaN failures (Target: 0: ${mcFailures === 0 ? 'PASS' : 'FAIL'})\n`);

  // Test 5: Pole & Antimeridian Singularities
  console.log('>>> Running Test 5: Boundary & Singularity Probing (Poles & Antimeridian)...');
  const criticalPoints = [
    { desc: 'North Pole', lon: 0.0, lat: 90.0 },
    { desc: 'South Pole', lon: 0.0, lat: -90.0 },
    { desc: 'Equator Prime Meridian', lon: 0.0, lat: 0.0 },
    { desc: 'Equator Antimeridian', lon: 180.0, lat: 0.0 },
    { desc: 'Antimeridian East Edge', lon: 359.75, lat: 0.0 },
    { desc: 'North Pole Antimeridian', lon: 180.0, lat: 90.0 },
    { desc: 'South Pole Antimeridian', lon: 180.0, lat: -90.0 },
    { desc: 'California Stratocumulus', lon: 235.0, lat: 30.0 },
    { desc: 'Peru Stratocumulus', lon: 285.0, lat: -18.0 },
    { desc: 'Sahara Desert Suppression', lon: 25.0, lat: 25.0 },
    { desc: 'Pacific ITCZ Convection', lon: 180.0, lat: 6.0 },
    { desc: 'Northern Jet Stream Cirrus', lon: 180.0, lat: 49.0 },
    { desc: 'Southern Jet Stream Cirrus', lon: 180.0, lat: -51.0 },
  ];

  for (const cp of criticalPoints) {
    const i = Math.round(cp.lon / 0.25) % GFS_CLOUD_WIDTH;
    const j = Math.round((90.0 - cp.lat) / 0.25);
    const idx = j * GFS_CLOUD_WIDTH + i;
    const l = decodeFloat16(lowU16[idx]);
    const m = decodeFloat16(midU16[idx]);
    const h = decodeFloat16(highU16[idx]);

    const ok = Number.isFinite(l) && Number.isFinite(m) && Number.isFinite(h) &&
               l >= 0 && l <= 1.0 && m >= 0 && m <= 1.0 && h >= 0 && h <= 1.0;
    console.log(`  ${cp.desc.padEnd(28)} (lon: ${cp.lon.toFixed(2).padStart(6)}, lat: ${cp.lat.toFixed(2).padStart(6)}): Low=${l.toFixed(4)}, Mid=${m.toFixed(4)}, High=${h.toFixed(4)} [${ok ? 'OK' : 'FAIL'}]`);
  }

  // Summary Verdict
  const allSizesOk = strata.every((s) => s.sizeMatches);
  const allBoundsOk = strata.every((s) => s.nanCount === 0 && s.infCount === 0 && s.negativeCount === 0 && s.greaterThanOneCount === 0);
  const allVariancesOk = strata.every((s) => s.variance > 0.005);
  const allCorrOk = rLowMid < 0.95 && rMidHigh < 0.95 && rLowHigh < 0.95;
  const pitchOk = pitch.paddedRowBytes === 3072 && pitch.paddedRowBytes % 256 === 0;
  const mcOk = mcFailures === 0;

  const passed = allSizesOk && allBoundsOk && allVariancesOk && allCorrOk && pitchOk && mcOk;

  console.log('\n================================================================');
  console.log(`FINAL EMPIRICAL VERDICT: ${passed ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('================================================================');
}

runAdversarialCloudStress().catch((err) => {
  console.error('Adversarial stress harness failed with error:', err);
  process.exit(1);
});
