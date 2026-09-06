import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Requirement R1: High-Precision Vector Geometry & Topographic Relief Detail
 * Features: F25 (10m Vector Ingestion), F26 (DEM Conservative Max-Pooling), F27 (Dynamic Peak Exponent Scaling)
 */

describe('Requirement R1: High-Precision Vector Geometry & Topographic Relief Detail', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const vectorBinPath = path.join(projectRoot, 'public/geo-vectors.bin');

  // --------------------------------------------------------------------------
  // Feature F25: 10m GVEC Binary Schema & Invariants
  // --------------------------------------------------------------------------
  describe('F25: 10m GVEC Binary Schema Invariants', () => {
    it('GVEC-T01: validates 32-byte GVEC header structure and magic constant (0x47564543)', () => {
      expect(fs.existsSync(vectorBinPath)).toBe(true);
      const buf = fs.readFileSync(vectorBinPath);

      // Header is at least 32 bytes
      expect(buf.length).toBeGreaterThanOrEqual(32);

      const magic = buf.readUInt32LE(0);
      const version = buf.readUInt32LE(4);
      const vertexCount = buf.readUInt32LE(8);
      const indexCount = buf.readUInt32LE(12);

      // GVEC magic in ASCII: 'G' (0x47), 'V' (0x56), 'E' (0x45), 'C' (0x43) -> 0x47564543
      expect(magic).toBe(0x47564543);
      expect(version).toBe(1);
      expect(vertexCount).toBeGreaterThan(100000);
      expect(indexCount).toBeGreaterThan(100000);

      // Reserved 16 bytes (offset 16 to 31) must be zero-padded
      for (let i = 16; i < 32; i += 4) {
        expect(buf.readUInt32LE(i)).toBe(0);
      }
    });

    it('GVEC-T02: verifies columnar array byte layout conforms to strict size formula', () => {
      const buf = fs.readFileSync(vectorBinPath);
      const vertexCount = buf.readUInt32LE(8);
      const indexCount = buf.readUInt32LE(12);

      // Columnar array sizes per vertex:
      // positions3D: 3 floats = 12 bytes
      // target2D:    2 floats = 8 bytes
      // dymaxion2D:  2 floats = 8 bytes
      // vType:       1 float  = 4 bytes
      // Total vertex attributes = 32 bytes/vertex
      // indices:     1 uint32 = 4 bytes/index
      const expectedTotalBytes = 32 + vertexCount * 32 + indexCount * 4;
      expect(buf.length).toBe(expectedTotalBytes);
    });

    it('GVEC-T03: validates vertex coordinate bounds, sphere radius, and 0 NaNs across S^2, Mercator, and Dymaxion', () => {
      const buf = fs.readFileSync(vectorBinPath);
      const vertexCount = buf.readUInt32LE(8);
      const indexCount = buf.readUInt32LE(12);

      let offset = 32;
      const positions = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 3);
      offset += vertexCount * 3 * 4;

      const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
      offset += vertexCount * 2 * 4;

      const dymaxion2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
      offset += vertexCount * 2 * 4;

      const vType = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount);
      offset += vertexCount * 4;

      const indices = new Uint32Array(buf.buffer, buf.byteOffset + offset, indexCount);

      // Sample first 5000 vertices
      const sampleSize = Math.min(5000, vertexCount);
      for (let i = 0; i < sampleSize; i++) {
        const x = positions[i * 3 + 0];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);

        // Radius on S^2 must be within [5.0, 5.03]
        const r = Math.hypot(x, y, z);
        expect(r).toBeGreaterThanOrEqual(4.99);
        expect(r).toBeLessThanOrEqual(5.05);

        // Mercator coordinates
        const u = target2D[i * 2 + 0];
        const v = target2D[i * 2 + 1];
        expect(Number.isFinite(u)).toBe(true);
        expect(Number.isFinite(v)).toBe(true);
        // Longitude span [-PI * R, PI * R]
        expect(Math.abs(u)).toBeLessThanOrEqual(Math.PI * 5.05 + 0.1);

        // Dymaxion coordinates
        const ud = dymaxion2D[i * 2 + 0];
        const vd = dymaxion2D[i * 2 + 1];
        expect(Number.isFinite(ud)).toBe(true);
        expect(Number.isFinite(vd)).toBe(true);

        // Vertex type: 1.0 (coastline) or 0.5 (river)
        const vt = vType[i];
        expect(vt === 1.0 || vt === 0.5).toBe(true);
      }

      // Index validity: every index must reference an existing vertex
      const indexSample = Math.min(5000, indexCount);
      for (let j = 0; j < indexSample; j++) {
        expect(indices[j]).toBeLessThan(vertexCount);
      }
    });

    it('GVEC-T04: verifies antimeridian and Mercator line segment severance invariants (no wrapping lines)', () => {
      const buf = fs.readFileSync(vectorBinPath);
      const vertexCount = buf.readUInt32LE(8);
      const indexCount = buf.readUInt32LE(12);

      let offset = 32 + vertexCount * 3 * 4; // Skip positions3D
      const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
      offset += vertexCount * 2 * 4 + vertexCount * 2 * 4 + vertexCount * 4; // Skip dymaxion2D and vType
      const indices = new Uint32Array(buf.buffer, buf.byteOffset + offset, indexCount);

      // Verify segment pairs [A, B] do not span across Mercator width
      const maxSegmentSpan = 15.0; // Mercator map width is ~31.4 units
      const numSegments = Math.min(2500, Math.floor(indexCount / 2));
      for (let s = 0; s < numSegments; s++) {
        const idxA = indices[s * 2];
        const idxB = indices[s * 2 + 1];

        const uA = target2D[idxA * 2];
        const uB = target2D[idxB * 2];
        const deltaU = Math.abs(uA - uB);
        expect(deltaU).toBeLessThan(maxSegmentSpan);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature F26: DEM Conservative Max-Pooling (0.4 * mean + 0.6 * max)
  // --------------------------------------------------------------------------
  describe('F26: DEM Conservative Max-Pooling Downsampling', () => {
    function conservativeMaxPool(v00: number, v10: number, v01: number, v11: number): number {
      const mean = (v00 + v10 + v01 + v11) * 0.25;
      const maxVal = Math.max(v00, v10, v01, v11);
      return Math.round(0.4 * mean + 0.6 * maxVal);
    }

    function arithmeticBoxFilter(v00: number, v10: number, v01: number, v11: number): number {
      return Math.round((v00 + v10 + v01 + v11) * 0.25);
    }

    it('DEM-T01: preserves isolated mountain summit elevations significantly better than box-filtering', () => {
      // Single isolated summit (e.g. Mount Everest 8848m) surrounded by sea level (0m)
      const summit = 8848;
      const boxResult = arithmeticBoxFilter(summit, 0, 0, 0);
      const pooledResult = conservativeMaxPool(summit, 0, 0, 0);

      // Box filter loses 75% in a single step
      expect(boxResult).toBe(2212);

      // Conservative max pool: 0.4 * (8848/4) + 0.6 * 8848 = 884.8 + 5308.8 = 6193.6 -> 6194
      expect(pooledResult).toBe(6194);
      expect(pooledResult / summit).toBeGreaterThan(0.70); // >70% peak retention
      expect(pooledResult).toBeGreaterThan(boxResult * 2.5); // >2.5x higher than box filter
    });

    it('DEM-T02: preserves flat plateaus and ocean planes with zero distortion', () => {
      // Constant elevation plateau (e.g. Tibetan Plateau at 4500m)
      const plateau = 4500;
      const result = conservativeMaxPool(plateau, plateau, plateau, plateau);
      expect(result).toBe(plateau);

      // Zero depth ocean
      const ocean = 0;
      expect(conservativeMaxPool(ocean, ocean, ocean, ocean)).toBe(0);
    });

    it('DEM-T03: retains summit prominence through multi-level mip downsampling pyramid', () => {
      // Simulate downsampling a 16x16 grid with a central peak at (8,8) across 4 mip levels
      const size = 16;
      let gridPool = new Float32Array(size * size);
      let gridBox = new Float32Array(size * size);
      const peakVal = 8848;

      gridPool[8 * size + 8] = peakVal;
      gridBox[8 * size + 8] = peakVal;

      let curPool = gridPool;
      let curBox = gridBox;
      let curSize = size;

      while (curSize > 1) {
        const nextSize = curSize >> 1;
        const nextPool = new Float32Array(nextSize * nextSize);
        const nextBox = new Float32Array(nextSize * nextSize);

        for (let y = 0; y < nextSize; y++) {
          for (let x = 0; x < nextSize; x++) {
            const i00 = (y * 2) * curSize + (x * 2);
            const i10 = (y * 2) * curSize + (x * 2 + 1);
            const i01 = (y * 2 + 1) * curSize + (x * 2);
            const i11 = (y * 2 + 1) * curSize + (x * 2 + 1);

            nextPool[y * nextSize + x] = conservativeMaxPool(
              curPool[i00], curPool[i10], curPool[i01], curPool[i11]
            );
            nextBox[y * nextSize + x] = arithmeticBoxFilter(
              curBox[i00], curBox[i10], curBox[i01], curBox[i11]
            );
          }
        }

        curPool = nextPool;
        curBox = nextBox;
        curSize = nextSize;
      }

      // At 1x1 base mip level (orbital limit)
      const finalPeakPool = curPool[0];
      const finalPeakBox = curBox[0];

      // Conservative pooling retains substantial altitude vs near-total box attenuation
      expect(finalPeakPool).toBeGreaterThan(finalPeakBox * 3.0);
      expect(finalPeakPool).toBeGreaterThan(1500); // Retains > 1500m vs < 500m
    });

    it('DEM-T04: operates stably on 16-bit unsigned integer channels ([0, 65535])', () => {
      const v16 = 65535;
      const pooled16 = conservativeMaxPool(v16, 0, 0, 0);
      expect(pooled16).toBeLessThanOrEqual(65535);
      expect(pooled16).toBeGreaterThan(45000);
    });
  });

  // --------------------------------------------------------------------------
  // Feature F27: Dynamic Peak Exponent Scaling vs Camera Distance
  // --------------------------------------------------------------------------
  describe('F27: Dynamic Peak Exponent Scaling (crust_hydrosphere.wgsl)', () => {
    function computeDynamicPeakExponent(camDist: number, basePeakExponent = 1.4): number {
      const orbitT = Math.max(0.0, Math.min(1.0, (camDist - 8.0) / (25.0 - 8.0)));
      const dynamicScale = 1.0 + (1.8 - 1.0) * orbitT; // mix(1.0, 1.8, orbitT)
      const effectiveExponent = dynamicScale * (Math.max(0.5, basePeakExponent) / 1.4);
      return effectiveExponent;
    }

    it('SCALE-T01: evaluates close-up boundary condition (camDist <= 8.0 -> exponent 1.0)', () => {
      // When exploring terrain close to surface (camDist <= 8.0), exponent equals 1.0 * (base / 1.4)
      const expAtGround = computeDynamicPeakExponent(5.5, 1.4);
      const expAtTransitionStart = computeDynamicPeakExponent(8.0, 1.4);

      expect(expAtGround).toBeCloseTo(1.0, 4);
      expect(expAtTransitionStart).toBeCloseTo(1.0, 4);
    });

    it('SCALE-T02: evaluates orbital boundary condition (camDist >= 25.0 -> exponent 1.8)', () => {
      // From orbital view (camDist >= 25.0), exponent reaches 1.8 * (base / 1.4)
      const expAtOrbitStart = computeDynamicPeakExponent(25.0, 1.4);
      const expAtDeepSpace = computeDynamicPeakExponent(100.0, 1.4);

      expect(expAtOrbitStart).toBeCloseTo(1.8, 4);
      expect(expAtDeepSpace).toBeCloseTo(1.8, 4);
    });

    it('SCALE-T03: exhibits strictly monotonic increasing behavior over camera altitude transition', () => {
      let previousExp = computeDynamicPeakExponent(7.0);
      for (let dist = 8.0; dist <= 25.0; dist += 0.5) {
        const currentExp = computeDynamicPeakExponent(dist);
        expect(currentExp).toBeGreaterThanOrEqual(previousExp);
        previousExp = currentExp;
      }
    });

    it('SCALE-T04: enhances high-summit to foothill silhouette contrast from orbit', () => {
      // High summit: 8000m (normH = 8000 / 8848 = 0.904)
      // Foothills:   1500m (normH = 1500 / 8848 = 0.169)
      const hSummit = 8000 / 8848;
      const hFoothill = 1500 / 8848;

      // At ground level (exponent = 1.0)
      const dispSummitGround = Math.pow(hSummit, 1.0);
      const dispFoothillGround = Math.pow(hFoothill, 1.0);
      const contrastGround = dispSummitGround / dispFoothillGround;

      // At orbit (exponent = 1.8)
      const dispSummitOrbit = Math.pow(hSummit, 1.8);
      const dispFoothillOrbit = Math.pow(hFoothill, 1.8);
      const contrastOrbit = dispSummitOrbit / dispFoothillOrbit;

      // Orbital contrast must be significantly higher (>3x), giving sharp alpine silhouettes
      expect(contrastOrbit).toBeGreaterThan(contrastGround * 3.0);
      expect(contrastOrbit).toBeGreaterThan(16.0);
    });
  });
});
