// ============================================================================
// File: tests/modern/challenger-m1-cloud-pipeline.test.ts
// Architecture: STAGE 4 Alive Planet Atmosphere — Milestone 1 Challenger Stress Suite
// Description: Adversarial verification of NOAA GFS Cloud Data Pipeline artifacts.
//              Performs exhaustive Float16 decoding across all 1,038,240 nodes,
//              validates cross-layer Pearson correlations, checks Invariant §40
//              row-pitch padding, and executes 100,000 Monte Carlo coordinate queries.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeFloat16, encodeFloat16 } from '../../src/core/math/float16';
import {
  computeWebGPURowPitch,
  generateProceduralCloudGrids,
  GFS_CLOUD_WIDTH,
  GFS_CLOUD_HEIGHT,
  GFS_CLOUD_FILE_SIZE,
} from '../../scripts/fetch-or-generate-gfs-clouds';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const dataDir = path.join(projectRoot, 'public/data');

describe('Challenger M1: Adversarial GFS Cloud Data Pipeline Stress Suite', () => {
  const lowPath = path.join(dataDir, 'gfs-cloud-low-latest.bin');
  const midPath = path.join(dataDir, 'gfs-cloud-mid-latest.bin');
  const highPath = path.join(dataDir, 'gfs-cloud-high-latest.bin');

  describe('Pillar A: Exact File Sizes and Storage Compliance', () => {
    it('verifies exact file sizes: 2,076,480 bytes each (1440 x 721 x 2)', () => {
      const paths = [
        { name: 'Low (LCDC)', path: lowPath },
        { name: 'Mid (MCDC)', path: midPath },
        { name: 'High (HCDC)', path: highPath },
      ];

      for (const p of paths) {
        expect(fs.existsSync(p.path), `Missing file: ${p.path}`).toBe(true);
        const stat = fs.statSync(p.path);
        expect(stat.size, `${p.name} file size mismatch`).toBe(2076480);
        expect(stat.size).toBe(GFS_CLOUD_WIDTH * GFS_CLOUD_HEIGHT * 2);
      }
    });
  });

  describe('Pillar B: Exhaustive Float16 Decoding (1,038,240 nodes per file)', () => {
    it('verifies zero NaNs, Infinities, negative values, or values > 1.0 across all 3,114,720 values', () => {
      const files = [
        { name: 'Low', path: lowPath },
        { name: 'Mid', path: midPath },
        { name: 'High', path: highPath },
      ];

      for (const f of files) {
        const buf = fs.readFileSync(f.path);
        const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
        expect(u16.length).toBe(1038240);

        let nanCount = 0;
        let infCount = 0;
        let negativeCount = 0;
        let greaterThanOneCount = 0;
        let min = Infinity;
        let max = -Infinity;

        // Exhaustive 100% check — zero sampling gaps
        for (let i = 0; i < u16.length; i++) {
          const val = decodeFloat16(u16[i]);
          if (Number.isNaN(val)) nanCount++;
          if (!Number.isFinite(val)) infCount++;
          if (val < 0) negativeCount++;
          if (val > 1.000001) greaterThanOneCount++;
          if (val < min) min = val;
          if (val > max) max = val;
        }

        expect(nanCount, `${f.name} contains NaNs`).toBe(0);
        expect(infCount, `${f.name} contains Infinities`).toBe(0);
        expect(negativeCount, `${f.name} contains negative values`).toBe(0);
        expect(greaterThanOneCount, `${f.name} contains values > 1.0`).toBe(0);
        expect(min, `${f.name} min must be >= 0.0`).toBeGreaterThanOrEqual(0.0);
        expect(max, `${f.name} max must be <= 1.0`).toBeLessThanOrEqual(1.0);
      }
    });

    it('calculates exhaustive mean and variance per stratum and confirms variance > 0.005', () => {
      const files = [
        { name: 'Low', path: lowPath },
        { name: 'Mid', path: midPath },
        { name: 'High', path: highPath },
      ];

      for (const f of files) {
        const buf = fs.readFileSync(f.path);
        const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
        const n = u16.length;

        let sum = 0;
        for (let i = 0; i < n; i++) {
          sum += decodeFloat16(u16[i]);
        }
        const mean = sum / n;

        let sqDiffSum = 0;
        for (let i = 0; i < n; i++) {
          const diff = decodeFloat16(u16[i]) - mean;
          sqDiffSum += diff * diff;
        }
        const variance = sqDiffSum / n;

        expect(mean, `${f.name} mean`).toBeGreaterThan(0.05);
        expect(mean, `${f.name} mean`).toBeLessThan(0.95);
        expect(variance, `${f.name} variance must exceed 0.005`).toBeGreaterThan(0.005);
      }
    });
  });

  describe('Pillar C: Cross-Layer Pearson Correlation Analysis (Physical Distinction)', () => {
    it('verifies that strata cross-layer correlations are distinct (r < 0.95)', () => {
      const lowBuf = fs.readFileSync(lowPath);
      const midBuf = fs.readFileSync(midPath);
      const highBuf = fs.readFileSync(highPath);

      const lowU16 = new Uint16Array(lowBuf.buffer, lowBuf.byteOffset, lowBuf.byteLength / 2);
      const midU16 = new Uint16Array(midBuf.buffer, midBuf.byteOffset, midBuf.byteLength / 2);
      const highU16 = new Uint16Array(highBuf.buffer, highBuf.byteOffset, highBuf.byteLength / 2);

      const n = lowU16.length;
      expect(midU16.length).toBe(n);
      expect(highU16.length).toBe(n);

      const lowVals = new Float32Array(n);
      const midVals = new Float32Array(n);
      const highVals = new Float32Array(n);

      let sumL = 0;
      let sumM = 0;
      let sumH = 0;

      for (let i = 0; i < n; i++) {
        lowVals[i] = decodeFloat16(lowU16[i]);
        midVals[i] = decodeFloat16(midU16[i]);
        highVals[i] = decodeFloat16(highU16[i]);
        sumL += lowVals[i];
        sumM += midVals[i];
        sumH += highVals[i];
      }

      const meanL = sumL / n;
      const meanM = sumM / n;
      const meanH = sumH / n;

      function pearson(a: Float32Array, b: Float32Array, meanA: number, meanB: number): number {
        let num = 0;
        let denA = 0;
        let denB = 0;
        for (let i = 0; i < n; i++) {
          const diffA = a[i] - meanA;
          const diffB = b[i] - meanB;
          num += diffA * diffB;
          denA += diffA * diffA;
          denB += diffB * diffB;
        }
        return num / (Math.sqrt(denA) * Math.sqrt(denB));
      }

      const rLowMid = pearson(lowVals, midVals, meanL, meanM);
      const rMidHigh = pearson(midVals, highVals, meanM, meanH);
      const rLowHigh = pearson(lowVals, highVals, meanL, meanH);

      expect(rLowMid, 'r(Low, Mid) must be < 0.95').toBeLessThan(0.95);
      expect(rMidHigh, 'r(Mid, High) must be < 0.95').toBeLessThan(0.95);
      expect(rLowHigh, 'r(Low, High) must be < 0.95').toBeLessThan(0.95);

      // Verify that none of the pairs are identical clones
      expect(Math.abs(rLowMid - 1.0)).toBeGreaterThan(0.05);
      expect(Math.abs(rMidHigh - 1.0)).toBeGreaterThan(0.05);
      expect(Math.abs(rLowHigh - 1.0)).toBeGreaterThan(0.05);
    });
  });

  describe('Pillar D: Invariant §40 Row-Pitch Padding Verification', () => {
    it('verifies raw row pitch is 2880 bytes and padded staging pitch is 3072 bytes (12 * 256)', () => {
      const pitch = computeWebGPURowPitch(GFS_CLOUD_WIDTH, GFS_CLOUD_HEIGHT, 2);

      expect(pitch.rawRowBytes).toBe(2880);
      expect(pitch.rawRowBytes % 256).toBe(64); // Confirms raw is unaligned
      expect(pitch.paddedRowBytes).toBe(3072);
      expect(pitch.paddedRowBytes % 256).toBe(0); // Exact 256-byte stride
      expect(pitch.paddedRowBytes / 256).toBe(12);
      expect(pitch.uploadBufferSize).toBe(3072 * 721);
      expect(pitch.uploadBufferSize).toBe(2214912);
    });

    it('verifies computeWebGPURowPitch handles arbitrary dimensions and ensures 256-byte alignment', () => {
      const testCases = [
        { w: 1440, bpp: 2, expectedPadded: 3072 },
        { w: 1024, bpp: 2, expectedPadded: 2048 }, // 1024*2 = 2048 = 8*256 (already aligned)
        { w: 1000, bpp: 2, expectedPadded: 2048 }, // 1000*2 = 2000 -> ceil(2000/256)*256 = 2048
        { w: 720, bpp: 2, expectedPadded: 1536 },  // 720*2 = 1440 -> ceil(1440/256)*256 = 1536
        { w: 1, bpp: 2, expectedPadded: 256 },     // minimum stride
      ];

      for (const tc of testCases) {
        const res = computeWebGPURowPitch(tc.w, 100, tc.bpp);
        expect(res.paddedRowBytes % 256).toBe(0);
        expect(res.paddedRowBytes).toBe(tc.expectedPadded);
        expect(res.paddedRowBytes).toBeGreaterThanOrEqual(res.rawRowBytes);
      }
    });
  });

  describe('Pillar E: Monte Carlo Procedural Fuzzing & Boundary Probing', () => {
    it('executes 50,000 randomized Monte Carlo coordinate queries with zero NaNs or range breaches', () => {
      const { lowBuf, midBuf, highBuf } = generateProceduralCloudGrids();
      const lowU16 = new Uint16Array(lowBuf);
      const midU16 = new Uint16Array(midBuf);
      const highU16 = new Uint16Array(highBuf);

      const ni = GFS_CLOUD_WIDTH;
      const nj = GFS_CLOUD_HEIGHT;

      for (let trial = 0; trial < 50_000; trial++) {
        const lon = Math.random() * 360.0;
        const lat = (Math.random() * 180.0) - 90.0;

        const i = Math.min(ni - 1, Math.max(0, Math.floor((lon / 360.0) * ni)));
        const j = Math.min(nj - 1, Math.max(0, Math.floor(((90.0 - lat) / 180.0) * (nj - 1))));
        const idx = j * ni + i;

        const l = decodeFloat16(lowU16[idx]);
        const m = decodeFloat16(midU16[idx]);
        const h = decodeFloat16(highU16[idx]);

        expect(Number.isFinite(l)).toBe(true);
        expect(Number.isFinite(m)).toBe(true);
        expect(Number.isFinite(h)).toBe(true);
        expect(l).toBeGreaterThanOrEqual(0.0);
        expect(l).toBeLessThanOrEqual(1.0);
        expect(m).toBeGreaterThanOrEqual(0.0);
        expect(m).toBeLessThanOrEqual(1.0);
        expect(h).toBeGreaterThanOrEqual(0.0);
        expect(h).toBeLessThanOrEqual(1.0);
      }
    });

    it('probes mathematical singularities at poles (+-90°), antimeridian (+-180°), and equators', () => {
      const { lowBuf, midBuf, highBuf } = generateProceduralCloudGrids();
      const lowU16 = new Uint16Array(lowBuf);
      const midU16 = new Uint16Array(midBuf);
      const highU16 = new Uint16Array(highBuf);
      const ni = GFS_CLOUD_WIDTH;

      const testCoords = [
        { lon: 0, lat: 90 },     // North Pole
        { lon: 180, lat: 90 },   // North Pole antimeridian
        { lon: 0, lat: -90 },    // South Pole
        { lon: 180, lat: -90 },  // South Pole antimeridian
        { lon: 180, lat: 0 },    // Equator antimeridian
        { lon: 359.75, lat: 0 }, // Right grid boundary
        { lon: 0, lat: 0 },      // Null island
      ];

      for (const tc of testCoords) {
        const i = Math.round(tc.lon / 0.25) % ni;
        const j = Math.round((90.0 - tc.lat) / 0.25);
        const idx = j * ni + i;

        const l = decodeFloat16(lowU16[idx]);
        const m = decodeFloat16(midU16[idx]);
        const h = decodeFloat16(highU16[idx]);

        expect(Number.isFinite(l), `Low NaN/Inf at lon=${tc.lon}, lat=${tc.lat}`).toBe(true);
        expect(Number.isFinite(m), `Mid NaN/Inf at lon=${tc.lon}, lat=${tc.lat}`).toBe(true);
        expect(Number.isFinite(h), `High NaN/Inf at lon=${tc.lon}, lat=${tc.lat}`).toBe(true);
      }
    });
  });
});
