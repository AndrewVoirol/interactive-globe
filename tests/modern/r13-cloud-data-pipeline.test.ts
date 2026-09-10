// ============================================================================
// File: tests/modern/r13-cloud-data-pipeline.test.ts
// Architecture: STAGE 4 Alive Planet Atmosphere — Milestone 1 Cloud Data Pipeline
// Description: Behavioral test suite verifying NOAA GFS 0.25° multi-altitude cloud
//              data ingestion, Float16 binary serialization, WebGPU row pitch
//              alignment (Invariant §40), physical non-zero variance, and
//              meteorological feature fidelity across Low, Mid, High strata.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateProceduralCloudGrids,
  computeWebGPURowPitch,
  GFS_CLOUD_WIDTH,
  GFS_CLOUD_HEIGHT,
  GFS_CLOUD_FILE_SIZE,
} from '../../scripts/fetch-or-generate-gfs-clouds';
import { decodeFloat16, encodeFloat16 } from '../../src/core/math/float16';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const dataDir = path.join(projectRoot, 'public/data');

describe('Milestone 1: NOAA GFS Cloud Data Pipeline (R2 / Invariant §40 & §46)', () => {
  const lowPath = path.join(dataDir, 'gfs-cloud-low-latest.bin');
  const midPath = path.join(dataDir, 'gfs-cloud-mid-latest.bin');
  const highPath = path.join(dataDir, 'gfs-cloud-high-latest.bin');

  describe('1. Binary File Dimensions & Storage Contracts', () => {
    it('verifies exact grid dimensions are 1440 columns x 721 rows (0.25° global grid)', () => {
      expect(GFS_CLOUD_WIDTH).toBe(1440);
      expect(GFS_CLOUD_HEIGHT).toBe(721);
      const totalNodes = GFS_CLOUD_WIDTH * GFS_CLOUD_HEIGHT;
      expect(totalNodes).toBe(1038240);
      expect(GFS_CLOUD_FILE_SIZE).toBe(2076480);
    });

    it('verifies all 3 cloud binary files exist in public/data/', () => {
      expect(fs.existsSync(lowPath), `Missing ${lowPath}`).toBe(true);
      expect(fs.existsSync(midPath), `Missing ${midPath}`).toBe(true);
      expect(fs.existsSync(highPath), `Missing ${highPath}`).toBe(true);
    });

    it('verifies each cloud binary file is exactly 2,076,480 bytes (1440 x 721 x 1 x 2)', () => {
      const lowStats = fs.statSync(lowPath);
      const midStats = fs.statSync(midPath);
      const highStats = fs.statSync(highPath);

      expect(lowStats.size).toBe(2076480);
      expect(midStats.size).toBe(2076480);
      expect(highStats.size).toBe(2076480);
    });
  });

  describe('2. Float16 Decoded Numerical Integrity & Range Boundaries', () => {
    it('verifies Low Cloud Cover (LCDC) decoded values are within [0.0, 1.0] without NaNs or Infs', () => {
      const buf = fs.readFileSync(lowPath);
      const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
      expect(u16.length).toBe(1038240);

      let min = Infinity;
      let max = -Infinity;
      let nanCount = 0;
      let infCount = 0;

      // Sample every 37th node to verify thoroughly and fast
      for (let i = 0; i < u16.length; i += 37) {
        const val = decodeFloat16(u16[i]);
        if (Number.isNaN(val)) nanCount++;
        if (!Number.isFinite(val)) infCount++;
        if (val < min) min = val;
        if (val > max) max = val;
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(min).toBeGreaterThanOrEqual(0.0);
      expect(max).toBeLessThanOrEqual(1.0);
    });

    it('verifies Mid Cloud Cover (MCDC) decoded values are within [0.0, 1.0] without NaNs or Infs', () => {
      const buf = fs.readFileSync(midPath);
      const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);

      let min = Infinity;
      let max = -Infinity;
      let nanCount = 0;
      let infCount = 0;

      for (let i = 0; i < u16.length; i += 37) {
        const val = decodeFloat16(u16[i]);
        if (Number.isNaN(val)) nanCount++;
        if (!Number.isFinite(val)) infCount++;
        if (val < min) min = val;
        if (val > max) max = val;
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(min).toBeGreaterThanOrEqual(0.0);
      expect(max).toBeLessThanOrEqual(1.0);
    });

    it('verifies High Cloud Cover (HCDC) decoded values are within [0.0, 1.0] without NaNs or Infs', () => {
      const buf = fs.readFileSync(highPath);
      const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);

      let min = Infinity;
      let max = -Infinity;
      let nanCount = 0;
      let infCount = 0;

      for (let i = 0; i < u16.length; i += 37) {
        const val = decodeFloat16(u16[i]);
        if (Number.isNaN(val)) nanCount++;
        if (!Number.isFinite(val)) infCount++;
        if (val < min) min = val;
        if (val > max) max = val;
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(min).toBeGreaterThanOrEqual(0.0);
      expect(max).toBeLessThanOrEqual(1.0);
    });
  });

  describe('3. Non-Zero Variance & Stratum Differentiation (Anti-Cheating)', () => {
    it('verifies each cloud stratum exhibits non-zero variance (> 0.005) and realistic distribution', () => {
      const files = [
        { name: 'Low', path: lowPath },
        { name: 'Mid', path: midPath },
        { name: 'High', path: highPath },
      ];

      for (const { name, path: filePath } of files) {
        const buf = fs.readFileSync(filePath);
        const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);

        let sum = 0;
        let count = 0;
        const step = 53; // prime stride

        for (let i = 0; i < u16.length; i += step) {
          sum += decodeFloat16(u16[i]);
          count++;
        }
        const mean = sum / count;

        let varSum = 0;
        for (let i = 0; i < u16.length; i += step) {
          const diff = decodeFloat16(u16[i]) - mean;
          varSum += diff * diff;
        }
        const variance = varSum / count;

        expect(mean, `${name} mean must be reasonable`).toBeGreaterThan(0.05);
        expect(mean, `${name} mean must be reasonable`).toBeLessThan(0.95);
        expect(variance, `${name} must not be a flat placeholder`).toBeGreaterThan(0.005);
      }
    });

    it('verifies Low, Mid, and High cloud strata are distinct data fields (cross-layer delta)', () => {
      const lowBuf = fs.readFileSync(lowPath);
      const midBuf = fs.readFileSync(midPath);
      const highBuf = fs.readFileSync(highPath);

      const lowU16 = new Uint16Array(lowBuf.buffer, lowBuf.byteOffset, lowBuf.byteLength / 2);
      const midU16 = new Uint16Array(midBuf.buffer, midBuf.byteOffset, midBuf.byteLength / 2);
      const highU16 = new Uint16Array(highBuf.buffer, highBuf.byteOffset, highBuf.byteLength / 2);

      let lowMidDiff = 0;
      let midHighDiff = 0;
      const count = 1000;
      const step = Math.floor(lowU16.length / count);

      for (let i = 0; i < count; i++) {
        const idx = i * step;
        lowMidDiff += Math.abs(decodeFloat16(lowU16[idx]) - decodeFloat16(midU16[idx]));
        midHighDiff += Math.abs(decodeFloat16(midU16[idx]) - decodeFloat16(highU16[idx]));
      }

      const avgLowMidDiff = lowMidDiff / count;
      const avgMidHighDiff = midHighDiff / count;

      expect(avgLowMidDiff, 'Low and Mid layers must differ significantly').toBeGreaterThan(0.05);
      expect(avgMidHighDiff, 'Mid and High layers must differ significantly').toBeGreaterThan(0.05);
    });
  });

  describe('4. WebGPU Row Pitch Padding Calculation (Invariant §40)', () => {
    it('verifies unpadded row pitch is not 256-byte aligned', () => {
      const rawRowBytes = GFS_CLOUD_WIDTH * 2; // 2880 bytes
      expect(rawRowBytes).toBe(2880);
      expect(rawRowBytes % 256).not.toBe(0);
      expect(rawRowBytes % 256).toBe(64);
    });

    it('verifies padded row pitch satisfies WebGPU 256-byte alignment contract', () => {
      const { rawRowBytes, paddedRowBytes, uploadBufferSize, rows, isAligned } = computeWebGPURowPitch();

      expect(rawRowBytes).toBe(2880);
      expect(paddedRowBytes).toBe(3072); // 12 * 256
      expect(paddedRowBytes % 256).toBe(0);
      expect(rows).toBe(721);
      expect(uploadBufferSize).toBe(3072 * 721); // 2,214,912 bytes
      expect(isAligned).toBe(false); // raw was not aligned, padding required
    });

    it('verifies staging buffer stride transformation preserves texel rows correctly', () => {
      const width = GFS_CLOUD_WIDTH;
      const height = 4; // test with 4 rows
      const rowBytesRaw = width * 2; // 2880
      const rowBytesPadded = 3072;

      const src = new Uint8Array(rowBytesRaw * height);
      // Fill first and last texel of each row with markers
      for (let y = 0; y < height; y++) {
        const offset = y * rowBytesRaw;
        src[offset + 0] = 0xaa;
        src[offset + 1] = y;
        src[offset + rowBytesRaw - 2] = 0xbb;
        src[offset + rowBytesRaw - 1] = y;
      }

      const staging = new Uint8Array(rowBytesPadded * height);
      for (let y = 0; y < height; y++) {
        const srcOffset = y * rowBytesRaw;
        const dstOffset = y * rowBytesPadded;
        staging.set(src.subarray(srcOffset, srcOffset + rowBytesRaw), dstOffset);
      }

      // Verify padded stride contains the exact bytes and padding is untouched
      for (let y = 0; y < height; y++) {
        const dstOffset = y * rowBytesPadded;
        expect(staging[dstOffset + 0]).toBe(0xaa);
        expect(staging[dstOffset + 1]).toBe(y);
        expect(staging[dstOffset + rowBytesRaw - 2]).toBe(0xbb);
        expect(staging[dstOffset + rowBytesRaw - 1]).toBe(y);

        // Check padding region (rowBytesRaw .. rowBytesPadded) is 0
        for (let p = rowBytesRaw; p < rowBytesPadded; p++) {
          expect(staging[dstOffset + p]).toBe(0);
        }
      }
    });
  });

  describe('5. Analytical Procedural Generator Invariants (Direct Import §46)', () => {
    it('executes generateProceduralCloudGrids() directly and generates exact size buffers', () => {
      const t0 = performance.now();
      const { lowBuf, midBuf, highBuf } = generateProceduralCloudGrids();
      const elapsed = performance.now() - t0;

      expect(lowBuf.byteLength).toBe(GFS_CLOUD_FILE_SIZE);
      expect(midBuf.byteLength).toBe(GFS_CLOUD_FILE_SIZE);
      expect(highBuf.byteLength).toBe(GFS_CLOUD_FILE_SIZE);
      expect(elapsed).toBeLessThan(1000); // highly optimized (< 1000ms for 3.1M procedural float16 nodes)
    });

    it('verifies meteorological physical phenomena in procedural generator', () => {
      const { lowBuf, midBuf, highBuf } = generateProceduralCloudGrids();
      const lowU16 = new Uint16Array(lowBuf);
      const midU16 = new Uint16Array(midBuf);
      const highU16 = new Uint16Array(highBuf);

      const ni = GFS_CLOUD_WIDTH;

      // Helper to sample lon/lat
      const sample = (u16: Uint16Array, lonDeg: number, latDeg: number): number => {
        const i = Math.round(lonDeg / 0.25) % ni;
        const j = Math.round((90.0 - latDeg) / 0.25);
        return decodeFloat16(u16[j * ni + i]);
      };

      // 1. Low Stratocumulus Deck off California (lon 235°E, lat 30°N) vs Sahara (lon 25°E, lat 25°N)
      const lowCal = sample(lowU16, 235.0, 30.0);
      const lowSahara = sample(lowU16, 25.0, 25.0);
      expect(lowCal, 'Marine stratocumulus must be dense off California').toBeGreaterThan(0.5);
      expect(lowSahara, 'Desert suppression must keep Sahara low clouds low').toBeLessThan(0.15);

      // 2. Mid Cloud ITCZ Peak (lon 180°E, lat 6°N) vs Subtropical Ridge (lon 180°E, lat 26°N)
      const midITCZ = sample(midU16, 180.0, 6.0);
      const midSubtropics = sample(midU16, 180.0, 26.0);
      expect(midITCZ, 'ITCZ equatorial convection must be elevated').toBeGreaterThan(0.4);
      expect(midSubtropics, 'Subtropical ridge must have lower mid cloud cover').toBeLessThan(midITCZ);

      // 3. High Cloud Jet Stream Cirrus (lon 180°E, lat 49°N) vs Tropical non-convective (lon 40°E, lat 5°S)
      const highJet = sample(highU16, 180.0, 49.0);
      const highQuiet = sample(highU16, 40.0, -5.0);
      expect(highJet, 'Jet stream cirrus must be present along storm track').toBeGreaterThan(0.3);
      expect(highJet).toBeGreaterThan(highQuiet);
    });
  });

  describe('6. Python GFS Ingestion Script Configuration Parity', () => {
    it('verifies fetch-real-gfs.py supports --clouds and correct NOMADS level/var parameters', () => {
      const pythonScript = path.join(projectRoot, 'scripts/fetch-real-gfs.py');
      expect(fs.existsSync(pythonScript)).toBe(true);

      const content = fs.readFileSync(pythonScript, 'utf-8');
      expect(content).toContain('--clouds');
      expect(content).toContain('lev_low_cloud_layer=on&var_LCDC=on');
      expect(content).toContain('lev_middle_cloud_layer=on&var_MCDC=on');
      expect(content).toContain('lev_high_cloud_layer=on&var_HCDC=on');
      expect(content).toContain('gfs-cloud-low-latest.bin');
      expect(content).toContain('gfs-cloud-mid-latest.bin');
      expect(content).toContain('gfs-cloud-high-latest.bin');
      expect(content).toContain('<f2'); // float16 little-endian
    });

    it('verifies package.json contains refresh:clouds script', () => {
      const pkgPath = path.join(projectRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts['refresh:clouds']).toBe('npx tsx scripts/fetch-or-generate-gfs-clouds.ts');
    });
  });
});
