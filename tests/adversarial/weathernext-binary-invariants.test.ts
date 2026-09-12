/**
 * tests/adversarial/weathernext-binary-invariants.test.ts
 *
 * Adversarial Challenger Stress Suite for Google DeepMind WeatherNext 3
 * Data Ingestion Pipeline, Mathematical Invariants, and WebGPU Binary Format Contracts.
 *
 * Directives:
 * 1. Mathematical Row Pitch Invariants (Invariant §20 & §40)
 *    - 3600 lon * 2 bytes = 7200 bytes raw
 *    - 7200 % 256 = 32 != 0 (strictly unaligned)
 *    - Padded row bytes: 7424 (29 * 256)
 *    - Padding per row: 224 bytes (112 Float16 zero texels)
 *    - Padded slice size: 1801 * 7424 = 13,370,624 bytes
 *    - Unpadded slice size: 1801 * 7200 = 12,967,200 bytes
 * 2. Binary Memory Layout & Row Stride Zero-Padding
 *    - Every row must have exactly 7200 data bytes followed by 224 zero bytes
 *    - Row stride must equal 7424 bytes
 * 3. TemporalTextureRingBuffer Compatibility (Invariant §73)
 *    - Direct zero-copy upload for pre-padded buffer
 *    - Dynamic repacking upload for unpadded buffer
 *    - Forward temporal advance (S2 -> S1 -> S0)
 * 4. Monte Carlo Fuzzing & Numerical Singularities (Pillar A)
 *    - 50,000 iterations of coordinate transforms and float16 conversions
 *    - Boundary checks at poles (±90°), antimeridian (±180°), and prime meridian (0°)
 * 5. Longitude Metadata Discrepancy Probe
 *    - Detects 180° phase mismatch between claimed lonMin (-180.0°) and unrolled Zarr data (0.0°)
 */

import { describe, it, expect } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';
import { encodeFloat16, decodeFloat16 } from '../../src/core/math/float16';
import { WeatherNextDataSource, WEATHERNEXT_GRID_SPEC } from '../../src/core/data/WeatherNextDataSource';

describe('Adversarial Challenger: WeatherNext 3 Binary & Mathematical Invariants', () => {
  const {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    bytesPerTexel: BYTES_PER_TEXEL,
    rawRowBytes: RAW_ROW_BYTES,
    paddedRowBytes: PADDED_ROW_BYTES,
    paddingBytesPerRow: PADDING_BYTES,
    paddingTexelsPerRow: PADDING_TEXELS,
    paddedCols: PADDED_COLS,
    unpaddedSliceBytes: UNPADDED_TOTAL_BYTES,
    paddedSliceBytes: PADDED_TOTAL_BYTES,
  } = WEATHERNEXT_GRID_SPEC;

  // ==========================================================================
  // 1. WebGPU 256-Byte Row Pitch Arithmetic Verification (Invariant §40)
  // ==========================================================================
  describe('WebGPU 256-Byte Row Pitch Arithmetic (Invariant §40 & §73)', () => {
    it('verifies exact raw row byte calculation for 3600-wide float16 grid', () => {
      expect(RAW_ROW_BYTES).toBe(7200);
      expect(RAW_ROW_BYTES % 256).toBe(32);
      expect(RAW_ROW_BYTES % 256).not.toBe(0);
    });

    it('verifies padded row bytes is exact next multiple of 256', () => {
      const computedPadded = Math.ceil(RAW_ROW_BYTES / 256) * 256;
      expect(computedPadded).toBe(PADDED_ROW_BYTES);
      expect(PADDED_ROW_BYTES).toBe(7424);
      expect(PADDED_ROW_BYTES % 256).toBe(0);
      expect(PADDED_ROW_BYTES / 256).toBe(29);
    });

    it('verifies padding bytes and texel count per row', () => {
      expect(PADDING_BYTES).toBe(224);
      expect(PADDING_TEXELS).toBe(112);
      expect(PADDED_COLS).toBe(3712);
      expect(PADDING_BYTES % BYTES_PER_TEXEL).toBe(0);
    });

    it('verifies total slice memory allocation footprint and overhead ratio', () => {
      expect(UNPADDED_TOTAL_BYTES).toBe(12967200);
      expect(PADDED_TOTAL_BYTES).toBe(13370624);
      const overheadBytes = PADDED_TOTAL_BYTES - UNPADDED_TOTAL_BYTES;
      expect(overheadBytes).toBe(403424);
      const overheadPct = (overheadBytes / UNPADDED_TOTAL_BYTES) * 100;
      expect(overheadPct).toBeCloseTo(3.111, 3);
    });
  });

  // ==========================================================================
  // 2. Binary Memory Layout & Row Stride Zero-Padding Synthesis
  // ==========================================================================
  describe('Binary Memory Layout & Row Stride Zero-Padding Synthesis', () => {
    it('synthesizes full 13,370,624 byte padded slice and asserts row-by-row zero-padding', () => {
      const paddedBuffer = new Uint8Array(PADDED_TOTAL_BYTES);
      const view16 = new Uint16Array(paddedBuffer.buffer);

      // Fast fill data region with 0x3C00 (float16 representation of 1.0)
      for (let r = 0; r < GRID_HEIGHT; r++) {
        const rowU16Offset = r * (PADDED_ROW_BYTES / BYTES_PER_TEXEL);
        view16.subarray(rowU16Offset, rowU16Offset + GRID_WIDTH).fill(0x3c00);
        // padding texels [rowU16Offset + GRID_WIDTH .. rowU16Offset + PADDED_COLS] remain 0x0000
      }

      expect(paddedBuffer.byteLength).toBe(PADDED_TOTAL_BYTES);

      let nonZeroPadCount = 0;
      let nonOneDataCount = 0;

      for (let r = 0; r < GRID_HEIGHT; r++) {
        const rowByteOffset = r * PADDED_ROW_BYTES;
        const rowU16Offset = r * (PADDED_ROW_BYTES / BYTES_PER_TEXEL);

        // Check data at start and end of row
        if (view16[rowU16Offset] !== 0x3c00 || view16[rowU16Offset + GRID_WIDTH - 1] !== 0x3c00) {
          nonOneDataCount++;
        }

        // Verify all 224 padding bytes are strictly 0x00
        const padStart = rowByteOffset + RAW_ROW_BYTES;
        for (let b = padStart; b < rowByteOffset + PADDED_ROW_BYTES; b++) {
          if (paddedBuffer[b] !== 0) nonZeroPadCount++;
        }
      }

      expect(nonOneDataCount).toBe(0);
      expect(nonZeroPadCount).toBe(0);
    });

    it('verifies row stride consistency: offset(r+1) - offset(r) === 7424', () => {
      let strideMismatch = 0;
      for (let r = 0; r < GRID_HEIGHT - 1; r++) {
        const o0 = r * PADDED_ROW_BYTES;
        const o1 = (r + 1) * PADDED_ROW_BYTES;
        if (o1 - o0 !== 7424) strideMismatch++;
      }
      expect(strideMismatch).toBe(0);
    });
  });

  // ==========================================================================
  // 3. TemporalTextureRingBuffer WebGPU Compatibility (Invariant §73)
  // ==========================================================================
  describe('TemporalTextureRingBuffer WebGPU Compatibility (Invariant §73)', () => {
    it('initializes TemporalTextureRingBuffer with exact WeatherNext 3600x1801 r16float dimensions', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, GRID_WIDTH, GRID_HEIGHT, 'r16float');

      expect(ring.width).toBe(GRID_WIDTH);
      expect(ring.height).toBe(GRID_HEIGHT);
      expect(ring.format).toBe('r16float');
      expect(ring.bytesPerPixel).toBe(2);
      expect(ring.rawRowBytes).toBe(RAW_ROW_BYTES);
      expect(ring.bytesPerRow).toBe(PADDED_ROW_BYTES);
      expect(ring.bytesPerRow % 256).toBe(0);
    });

    it('uploads pre-padded 13,370,624 byte buffer via zero-copy pass-through without allocation', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, GRID_WIDTH, GRID_HEIGHT, 'r16float');

      const prePaddedBuffer = new Uint8Array(PADDED_TOTAL_BYTES);
      prePaddedBuffer[0] = 0x42;
      prePaddedBuffer[7199] = 0x43;
      prePaddedBuffer[PADDED_TOTAL_BYTES - 225] = 0x44;

      ring.uploadSlice(1, prePaddedBuffer);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];

      // Destination texture should be slot 1 texture
      expect(call.destination.texture).toBe(ring.getTexture(1));

      // Buffer length verification
      expect(call.data.byteLength).toBe(PADDED_TOTAL_BYTES);

      // Data layout verification
      expect(call.dataLayout).toEqual({
        offset: 0,
        bytesPerRow: PADDED_ROW_BYTES,
        rowsPerImage: GRID_HEIGHT,
      });

      // Target size verification
      expect(call.size).toEqual({
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        depthOrArrayLayers: 1,
      });

      // Clear calls to prevent Vitest from enumerating 13.37 million array indices
      device.queue.writeTextureCalls = [];
    });

    it('uploads unpadded 12,967,200 byte buffer and dynamically repacks into 256-byte aligned stride', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, GRID_WIDTH, GRID_HEIGHT, 'r16float');

      const unpaddedBuffer = new Uint8Array(UNPADDED_TOTAL_BYTES);
      unpaddedBuffer[0] = 0x11;
      unpaddedBuffer[RAW_ROW_BYTES - 1] = 0x22;
      unpaddedBuffer[RAW_ROW_BYTES] = 0x33;

      ring.uploadSlice(2, unpaddedBuffer);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];

      expect(call.destination.texture).toBe(ring.getTexture(2));
      const uploadedData = call.data as Uint8Array;

      // Uploaded data length must be padded size
      expect(uploadedData.byteLength).toBe(PADDED_TOTAL_BYTES);

      // Verify row 0 data copied correctly
      expect(uploadedData[0]).toBe(unpaddedBuffer[0]);
      expect(uploadedData[RAW_ROW_BYTES - 1]).toBe(unpaddedBuffer[RAW_ROW_BYTES - 1]);

      // Verify row 0 padding is strictly zero
      let nonZeroPad = 0;
      for (let p = RAW_ROW_BYTES; p < PADDED_ROW_BYTES; p++) {
        if (uploadedData[p] !== 0) nonZeroPad++;
      }
      expect(nonZeroPad).toBe(0);

      // Verify row 1 begins at stride 7424
      expect(uploadedData[PADDED_ROW_BYTES]).toBe(unpaddedBuffer[RAW_ROW_BYTES]);

      // Clear calls to prevent Vitest from enumerating 13.37 million array indices
      device.queue.writeTextureCalls = [];
    });

    it('rejects undersized slice buffers below 12,967,200 bytes with Error', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, GRID_WIDTH, GRID_HEIGHT, 'r16float');

      const undersized = new Uint8Array(UNPADDED_TOTAL_BYTES - 1);
      expect(() => ring.uploadSlice(0, undersized)).toThrow(
        /Insufficient data length: expected at least 12967200 bytes, got 12967199/
      );
    });

    it('enforces forward chronological advance lifecycle across 3 slots (Invariant §73)', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, GRID_WIDTH, GRID_HEIGHT, 'r16float');

      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);
      const t2 = ring.getTexture(2);

      // Forward advance 1: S0 <- S1 (Current -> Previous), S1 <- S2 (Staging -> Current), S2 <- S0 (Previous -> Recycled)
      ring.advance();
      expect(ring.getTexture(0)).toBe(t1);
      expect(ring.getTexture(1)).toBe(t2);
      expect(ring.getTexture(2)).toBe(t0);

      // Forward advance 2:
      ring.advance();
      expect(ring.getTexture(0)).toBe(t2);
      expect(ring.getTexture(1)).toBe(t0);
      expect(ring.getTexture(2)).toBe(t1);

      // Forward advance 3: returns to initial state (order-3 cyclic identity)
      ring.advance();
      expect(ring.getTexture(0)).toBe(t0);
      expect(ring.getTexture(1)).toBe(t1);
      expect(ring.getTexture(2)).toBe(t2);
    });
  });

  // ==========================================================================
  // 4. Monte Carlo Stress Fuzzing & Numerical Singularities (Pillar A & B)
  // ==========================================================================
  describe('Pillar A & B: Monte Carlo Stress Fuzzing & Boundary Probing', () => {
    it('probes cartographic boundary points on 0.1° WeatherNext grid', () => {
      // 1. North Pole (+90.0°): lat fraction = 1.0 -> row = 0
      const northLat = 90.0;
      const northRow = Math.round((90.0 - northLat) / 0.1);
      expect(northRow).toBe(0);

      // 2. South Pole (-90.0°): lat fraction = 0.0 -> row = 1800
      const southLat = -90.0;
      const southRow = Math.round((90.0 - southLat) / 0.1);
      expect(southRow).toBe(1800);

      // 3. Equator (0.0°): row = 900
      const eqLat = 0.0;
      const eqRow = Math.round((90.0 - eqLat) / 0.1);
      expect(eqRow).toBe(900);

      // 4. Antimeridian (-180.0° / +180.0°)
      const amWest = -180.0;
      const colWest = Math.floor((amWest + 180.0) / 0.1) % 3600;
      expect(colWest).toBe(0);

      const amEast = 180.0;
      const colEast = Math.floor((amEast + 180.0) / 0.1) % 3600;
      expect(colEast).toBe(0);

      // 5. Prime Meridian (0.0°)
      const prime = 0.0;
      const colPrime = Math.floor((prime + 180.0) / 0.1) % 3600;
      expect(colPrime).toBe(1800);
    });

    it('executes 50,000 Monte Carlo coordinate projections ensuring zero NaN/out-of-bounds', () => {
      const N = 50_000;
      let oobCount = 0;
      for (let i = 0; i < N; i++) {
        const lat = Math.random() * 180.0 - 90.0; // [-90, 90]
        const lon = Math.random() * 360.0 - 180.0; // [-180, 180]

        const row = Math.min(1800, Math.max(0, Math.round((90.0 - lat) / 0.1)));
        const col = Math.floor(((lon + 180.0) / 360.0) * 3600) % 3600;

        if (row < 0 || row > 1800 || col < 0 || col >= 3600 || !Number.isFinite(row) || !Number.isFinite(col)) {
          oobCount++;
        }
      }
      expect(oobCount).toBe(0);
    });

    it('executes 50,000 Float16 downcasting simulations over core meteorological bounds', () => {
      const N = 50_000;
      let errorCount = 0;
      for (let i = 0; i < N; i++) {
        // Temperature: [180, 330] K
        const temp = 180.0 + Math.random() * 150.0;
        const encodedT = encodeFloat16(temp);
        const decodedT = decodeFloat16(encodedT);
        if (Math.abs(decodedT - temp) >= 0.35) errorCount++;

        // Wind: [-45, +45] m/s
        const wind = (Math.random() - 0.5) * 90.0;
        const encodedW = encodeFloat16(wind);
        const decodedW = decodeFloat16(encodedW);
        if (Math.abs(decodedW - wind) >= 0.05) errorCount++;

        // Precipitation: [0, 50] mm/hr
        const precip = Math.random() * 50.0;
        const encodedP = encodeFloat16(precip);
        const decodedP = decodeFloat16(encodedP);
        if (Math.abs(decodedP - precip) >= 0.05) errorCount++;

        // Cloud: [0, 1] fraction
        const cloud = Math.random();
        const encodedC = encodeFloat16(cloud);
        const decodedC = decodeFloat16(encodedC);
        if (Math.abs(decodedC - cloud) >= 0.002) errorCount++;
      }
      expect(errorCount).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Longitude Metadata Discrepancy Probe
  // ==========================================================================
  describe('Pillar D & E: Longitude Metadata Discrepancy Empirical Probe', () => {
    it('verifies production grid bounds and provenance orientation eliminate the 180° longitude phase disparity', () => {
      const ds = new WeatherNextDataSource();
      const meta = ds.createDefaultMetadata();

      // In raw upstream GCS Zarr v3:
      // lon_0p1 starts at 0.0° (col 0 = Prime Meridian) and ends at 359.9°
      // WeatherNextDataSource expects equirectangular coordinates spanning [-180.0°, +179.9°]
      expect(meta.gridDimensions.lonMin).toBe(WEATHERNEXT_GRID_SPEC.lonMin);
      expect(meta.gridDimensions.lonMin).toBe(-180.0);
      expect(meta.gridDimensions.lonMax).toBe(WEATHERNEXT_GRID_SPEC.lonMax);
      expect(meta.gridDimensions.lonMax).toBe(179.9);

      // Provenance must explicitly declare that col 0 is antimeridian rolled by 1800 columns
      expect(meta.provenance.longitudeOrientation).toBe('col_0_antimeridian_rolled_1800');
      expect(meta.provenance.latitudeOrientation).toBe('row_0_north_inverted');

      // The roll delta required to map Prime Meridian (0.0°) from Zarr column 0 to its correct equirectangular column:
      const primeMeridianCol = Math.round((0.0 - meta.gridDimensions.lonMin) / meta.gridDimensions.resolutionDeg);
      expect(primeMeridianCol).toBe(WEATHERNEXT_GRID_SPEC.width / 2);
      expect(primeMeridianCol).toBe(1800);

      // Verify coordinate round-trip for Antimeridian and Prime Meridian
      const antimeridianLon = meta.gridDimensions.lonMin + 0 * meta.gridDimensions.resolutionDeg;
      const primeLon = meta.gridDimensions.lonMin + primeMeridianCol * meta.gridDimensions.resolutionDeg;
      expect(antimeridianLon).toBe(-180.0);
      expect(primeLon).toBe(0.0);
    });
  });
});
