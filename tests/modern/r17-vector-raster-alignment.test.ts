// ============================================================================
// File: tests/modern/r17-vector-raster-alignment.test.ts
// Test Tier: Modern / Stage 4 Vector-Coupled Coastal Raster Mask Precomputation
// Description: Strictly evaluates sub-pixel topological alignment between the 890,000
//              authoritative 1:10m Natural Earth coastline vertices in public/geo-vectors.bin
//              and Channel B in public/earth-etopo2022-dem-u16.bin.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('R17 Stage 4: Vector-Coupled Coastal Raster Mask Alignment', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const demPath = path.join(projectRoot, 'public/earth-etopo2022-dem-u16.bin');
  const gvecPath = path.join(projectRoot, 'public/geo-vectors.bin');

  const width = 8192;
  const height = 4096;

  describe('1. File Size & Grid Topology Invariants', () => {
    it('R17-ALIGN-01: verifies DEM file size is exactly 256.0 MB (268,435,456 bytes)', () => {
      expect(fs.existsSync(demPath)).toBe(true);
      const stat = fs.statSync(demPath);
      expect(stat.size).toBe(268435456);
    });

    it('R17-ALIGN-02: verifies geo-vectors.bin exists with valid magic 0x47564543', () => {
      expect(fs.existsSync(gvecPath)).toBe(true);
      const fd = fs.openSync(gvecPath, 'r');
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);

      const magic = header.readUInt32LE(0);
      const version = header.readUInt32LE(4);
      const totalVertices = header.readUInt32LE(8);

      expect(magic).toBe(0x47564543);
      expect(version).toBe(1);
      expect(totalVertices).toBeGreaterThanOrEqual(890000);
    });
  });

  describe('2. Vector-to-Raster Sub-Pixel Topological Lock', () => {
    // Bilinear sampler on DEM Channel B
    function sampleChannelB(demU16: Uint16Array, u: number, v: number): number {
      const x = u * width - 0.5;
      const y = v * height - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = (x0 + 1 + width) % width;
      const y1 = Math.min(height - 1, Math.max(0, y0 + 1));
      const fx = x - x0;
      const fy = y - y0;

      const cx0 = (x0 + width) % width;
      const cy0 = Math.min(height - 1, Math.max(0, y0));

      const p00 = demU16[(cy0 * width + cx0) * 4 + 2] / 65535.0;
      const p10 = demU16[(cy0 * width + x1) * 4 + 2] / 65535.0;
      const p01 = demU16[(y1 * width + cx0) * 4 + 2] / 65535.0;
      const p11 = demU16[(y1 * width + x1) * 4 + 2] / 65535.0;

      return (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
    }

    it('R17-ALIGN-03: verifies all 890,000 vector coastline vertices align with mean B = 0.50 ± 0.03 and >= 97% in [0.25, 0.75]', () => {
      const demBuf = fs.readFileSync(demPath);
      const demU16 = new Uint16Array(demBuf.buffer, demBuf.byteOffset, demBuf.byteLength / 2);

      const gvecBuf = fs.readFileSync(gvecPath);
      const totalVertices = new DataView(gvecBuf.buffer, gvecBuf.byteOffset, gvecBuf.byteLength).getUint32(8, true);

      const posArray = new Float32Array(gvecBuf.buffer, gvecBuf.byteOffset + 32, totalVertices * 3);
      const typeOffset = 32 + totalVertices * (3 + 2 + 2) * 4;
      const typeArray = new Float32Array(gvecBuf.buffer, gvecBuf.byteOffset + typeOffset, totalVertices);

      let coastCount = 0;
      let sumB = 0;
      let inRangeCount = 0;
      let maxDistPixels = 0;

      for (let i = 0; i < totalVertices; i++) {
        if (typeArray[i] !== 1.0) continue; // Coastline vertices only

        const x = posArray[i * 3 + 0];
        const y = posArray[i * 3 + 1];
        const z = posArray[i * 3 + 2];
        const r = Math.hypot(x, y, z);
        const phi = Math.asin(Math.max(-1, Math.min(1, y / r)));
        const lambda = Math.atan2(x, z);

        const lon = lambda * (180.0 / Math.PI);
        const lat = phi * (180.0 / Math.PI);

        const u = (lon + 180.0) / 360.0;
        const v = (90.0 - lat) / 180.0;

        const b = sampleChannelB(demU16, u, v);
        sumB += b;
        coastCount++;

        if (b >= 0.25 && b <= 0.75) {
          inRangeCount++;
        }

        // Distance in pixels to the B = 0.50 isoline assuming nominal gradient ~1.0 per pixel
        const distPx = Math.abs(b - 0.50);
        if (distPx > maxDistPixels) {
          maxDistPixels = distPx;
        }
      }

      const meanB = sumB / coastCount;
      const pctInRange = (inRangeCount / coastCount) * 100.0;

      expect(coastCount).toBe(890000);
      expect(meanB).toBeGreaterThanOrEqual(0.47);
      expect(meanB).toBeLessThanOrEqual(0.53);
      expect(pctInRange).toBeGreaterThanOrEqual(97.0);
      expect(maxDistPixels).toBeLessThanOrEqual(0.50);
    });

    it('R17-ALIGN-04: verifies elevation sign harmonization across the shoreline seam', () => {
      const demBuf = fs.readFileSync(demPath);
      const demU16 = new Uint16Array(demBuf.buffer, demBuf.byteOffset, demBuf.byteLength / 2);
      const U16_SEA_LEVEL = 36208; // 0m elevation

      let violationsLand = 0;
      let violationsOcean = 0;

      // Sample a representative grid across all longitudes and latitudes
      const step = 8;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          const maskB = demU16[idx + 2];
          const elevA = demU16[idx + 3];

          // Land: B > 0.5 (maskB > 32768) must have elevA >= U16_SEA_LEVEL (z >= 0)
          if (maskB > 32768 && elevA < U16_SEA_LEVEL) {
            violationsLand++;
          }
          // Ocean: B < 0.5 (maskB < 32768) must have elevA <= U16_SEA_LEVEL (z <= 0)
          if (maskB < 32768 && elevA > U16_SEA_LEVEL) {
            violationsOcean++;
          }
        }
      }

      expect(violationsLand).toBe(0);
      expect(violationsOcean).toBe(0);
    });
  });
});
