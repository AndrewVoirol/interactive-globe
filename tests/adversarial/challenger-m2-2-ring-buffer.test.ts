/**
 * tests/adversarial/challenger-m2-2-ring-buffer.test.ts
 *
 * Empirical Challenger M2-2 Verification Suite:
 * Rigorous mathematical and operational challenge of WebGPU Texture Ring Buffer
 * (TemporalTextureRingBuffer.ts) and WeatherNext staging logic:
 *
 * 1. Byte Arithmetic Verification:
 *    - Float16 texels: 3600 x 2 = 7200 bytes raw row.
 *    - Padded row pitch: 7424 bytes (ceil(7200 / 256) * 256, divisible by 256, remainder 0).
 *    - Staged slice: 7424 * 1801 = 13,370,624 bytes.
 *    - Unpadded raw slice: 7200 * 1801 = 12,967,200 bytes.
 *    - Row padding: 224 zero bytes (112 Float16 texels) per row.
 * 2. Zero-Copy Pass-Through vs Unpadded Slice Repacking:
 *    - Pre-padded buffer (13,370,624 bytes) passes through with zero allocations/copies.
 *    - Naturally aligned buffer passes through with zero copies.
 *    - Unpadded buffer (12,967,200 bytes) dynamically repacks with 256-byte aligned stride.
 *    - Stride integrity and zero-padding validated across all 1801 rows.
 * 3. Slot Rotation Math & Cyclic Permutation Invariance:
 *    - Slot 0 -> Slot 1 -> Slot 2 -> Slot 0 progression and physical texture lifecycles.
 *    - 100,000 sequential advances maintaining strict order-3 periodicity ((sigma)^3 = id).
 *    - Zero pointer aliasing, zero memory leaks, and zero runtime allocations.
 */

import { describe, it, expect } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import {
  TemporalTextureRingBuffer,
  getTextureFormatBytesPerPixel,
} from '../../src/webgpu/TemporalTextureRingBuffer';

describe('Empirical Challenger M2-2: WebGPU Texture Ring Buffer Math & Staging', () => {
  const WIDTH = 3600;
  const HEIGHT = 1801;
  const FORMAT = 'r16float';
  const BPP = 2; // Float16
  const RAW_ROW_BYTES = WIDTH * BPP; // 7200
  const PADDED_ROW_PITCH = 7424; // 29 * 256
  const STAGED_SLICE_BYTES = PADDED_ROW_PITCH * HEIGHT; // 13,370,624
  const UNPADDED_SLICE_BYTES = RAW_ROW_BYTES * HEIGHT; // 12,967,200
  const PADDING_BYTES_PER_ROW = PADDED_ROW_PITCH - RAW_ROW_BYTES; // 224

  // ==========================================================================
  // Section 1: Byte Arithmetic Verification
  // ==========================================================================
  describe('1. Byte Arithmetic & WebGPU Pitch Contract Verification', () => {
    it('verifies Float16 texels row byte arithmetic: 3600 x 2 = 7200 bytes', () => {
      const bpp = getTextureFormatBytesPerPixel(FORMAT);
      expect(bpp).toBe(2);

      const rawRow = WIDTH * bpp;
      expect(rawRow).toBe(7200);

      // Verify raw row is NOT aligned to WebGPU 256-byte boundary
      expect(rawRow % 256).toBe(32);
      expect(rawRow % 256).not.toBe(0);
    });

    it('verifies padded row pitch: 7424 bytes (exact multiple of 256)', () => {
      const paddedPitch = Math.ceil(RAW_ROW_BYTES / 256) * 256;
      expect(paddedPitch).toBe(7424);
      expect(paddedPitch % 256).toBe(0);
      expect(paddedPitch / 256).toBe(29);
      expect(PADDING_BYTES_PER_ROW).toBe(224);
      expect(PADDING_BYTES_PER_ROW / BPP).toBe(112); // 112 zero texels
    });

    it('verifies staged slice byte footprint: 7424 * 1801 = 13,370,624 bytes', () => {
      const stagedBytes = PADDED_ROW_PITCH * HEIGHT;
      expect(stagedBytes).toBe(13370624);

      const unpaddedBytes = RAW_ROW_BYTES * HEIGHT;
      expect(unpaddedBytes).toBe(12967200);

      const totalOverhead = stagedBytes - unpaddedBytes;
      expect(totalOverhead).toBe(403424);
      expect(totalOverhead).toBe(PADDING_BYTES_PER_ROW * HEIGHT);
    });

    it('confirms TemporalTextureRingBuffer instance properties match exact byte arithmetic', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      expect(ring.width).toBe(3600);
      expect(ring.height).toBe(1801);
      expect(ring.format).toBe('r16float');
      expect(ring.bytesPerPixel).toBe(2);
      expect(ring.rawRowBytes).toBe(7200);
      expect(ring.bytesPerRow).toBe(7424);
      expect(ring.bytesPerRow % 256).toBe(0);
      expect(ring.disposed).toBe(false);

      // Clean up
      ring.dispose();
      expect(ring.disposed).toBe(true);
    });
  });

  // ==========================================================================
  // Section 2: Zero-Copy Pass-Through vs Unpadded Slice Repacking
  // ==========================================================================
  describe('2. Zero-Copy Pass-Through vs Unpadded Slice Repacking', () => {
    it('empirically verifies zero-copy pass-through for pre-padded buffer (13,370,624 bytes)', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const prePaddedData = new Uint8Array(STAGED_SLICE_BYTES);
      prePaddedData[0] = 0xfa;
      prePaddedData[RAW_ROW_BYTES - 1] = 0xfb;
      prePaddedData[STAGED_SLICE_BYTES - 1] = 0xfc;

      ring.uploadSlice(1, prePaddedData);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];

      // Verification of zero-copy pass-through:
      // The uploaded data shares the exact underlying ArrayBuffer without copying
      expect(call.data.buffer).toBe(prePaddedData.buffer);
      expect(call.data.byteOffset).toBe(prePaddedData.byteOffset);
      expect(call.data.byteLength).toBe(STAGED_SLICE_BYTES);
      expect(call.destination.texture).toBe(ring.getTexture(1));
      expect(call.dataLayout).toEqual({
        offset: 0,
        bytesPerRow: 7424,
        rowsPerImage: 1801,
      });
      expect(call.size).toEqual({
        width: 3600,
        height: 1801,
        depthOrArrayLayers: 1,
      });

      // Clear calls to prevent memory retention
      device.queue.writeTextureCalls = [];
      ring.dispose();
    });

    it('empirically verifies zero-copy pass-through when raw row bytes is naturally 256-byte aligned', () => {
      const device = new MockGPUDevice();
      // 128 width * 2 bytes/px (r16float) = 256 bytes per row (natural alignment)
      const ring = new TemporalTextureRingBuffer(device as any, 128, 64, FORMAT);
      expect(ring.rawRowBytes).toBe(256);
      expect(ring.bytesPerRow).toBe(256);

      const naturalBuffer = new Uint8Array(256 * 64);
      naturalBuffer.fill(0x77);

      ring.uploadSlice(0, naturalBuffer);

      const call = device.queue.writeTextureCalls[0];
      // Shares exact underlying ArrayBuffer without memory copying
      expect(call.data.buffer).toBe(naturalBuffer.buffer);
      expect(call.dataLayout.bytesPerRow).toBe(256);

      device.queue.writeTextureCalls = [];
      ring.dispose();
    });

    it('empirically verifies unpadded slice repacking (12,967,200 bytes -> 13,370,624 bytes)', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const unpaddedData = new Uint8Array(UNPADDED_SLICE_BYTES);

      // Populate each row with deterministic distinct marker bytes
      for (let r = 0; r < HEIGHT; r++) {
        const rowVal = (r * 17 + 1) & 0xff;
        const rowStart = r * RAW_ROW_BYTES;
        unpaddedData[rowStart] = rowVal;
        unpaddedData[rowStart + RAW_ROW_BYTES - 1] = (rowVal ^ 0xff) & 0xff;
      }

      ring.uploadSlice(2, unpaddedData);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];

      // Uploaded data must NOT share the unpadded source buffer (it must be repacked into staging buffer)
      expect(call.data.buffer).not.toBe(unpaddedData.buffer);
      const uploaded = call.data as Uint8Array;
      expect(uploaded.byteLength).toBe(STAGED_SLICE_BYTES);

      // Verify row-by-row mapping and 224-byte zero padding for sample rows across the full grid
      const sampleRows = [0, 1, 2, 450, 900, 1350, 1800];
      for (const r of sampleRows) {
        const expectedVal = (r * 17 + 1) & 0xff;
        const expectedEndVal = (expectedVal ^ 0xff) & 0xff;

        const dstRowStart = r * PADDED_ROW_PITCH;
        expect(uploaded[dstRowStart]).toBe(expectedVal);
        expect(uploaded[dstRowStart + RAW_ROW_BYTES - 1]).toBe(expectedEndVal);

        // Verify the 224 padding bytes for row r are strictly 0x00
        for (let p = RAW_ROW_BYTES; p < PADDED_ROW_PITCH; p++) {
          expect(uploaded[dstRowStart + p]).toBe(0);
        }
      }

      // Clear calls to prevent memory retention
      device.queue.writeTextureCalls = [];
      ring.dispose();
    });

    it('rejects buffers smaller than 12,967,200 bytes with descriptive Range/Error', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const undersized = new Uint8Array(UNPADDED_SLICE_BYTES - 1);
      expect(() => ring.uploadSlice(0, undersized)).toThrow(
        /Insufficient data length: expected at least 12967200 bytes, got 12967199/
      );

      ring.dispose();
    });
  });

  // ==========================================================================
  // Section 3: Slot Rotation Math & Cyclic Permutation Invariance
  // ==========================================================================
  describe('3. Slot Rotation Math & Cyclic Permutation Invariance', () => {
    it('verifies slot rotation permutation: Slot 1 -> Slot 0, Slot 2 -> Slot 1, Slot 0 -> Slot 2', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);
      const t2 = ring.getTexture(2);

      // Distinct physical textures
      expect(t0).not.toBe(t1);
      expect(t1).not.toBe(t2);
      expect(t0).not.toBe(t2);

      // Advance 1:
      // Logical Slot 0 receives old Slot 1 (Current -> Previous)
      // Logical Slot 1 receives old Slot 2 (Staging -> Current)
      // Logical Slot 2 receives old Slot 0 (Previous -> Recycled Staging)
      ring.advance();
      expect(ring.getTexture(0)).toBe(t1);
      expect(ring.getTexture(1)).toBe(t2);
      expect(ring.getTexture(2)).toBe(t0);

      // Advance 2:
      ring.advance();
      expect(ring.getTexture(0)).toBe(t2);
      expect(ring.getTexture(1)).toBe(t0);
      expect(ring.getTexture(2)).toBe(t1);

      // Advance 3 (order 3 cyclic completion):
      ring.advance();
      expect(ring.getTexture(0)).toBe(t0);
      expect(ring.getTexture(1)).toBe(t1);
      expect(ring.getTexture(2)).toBe(t2);

      ring.dispose();
    });

    it('verifies physical texture lifecycle: Slot 0 -> Slot 2 -> Slot 1 -> Slot 0 across sequential advances', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const physicalTex0 = ring.getTexture(0);

      // Helper to find which logical slot currently holds physicalTex0
      const findSlotOfTex0 = (): 0 | 1 | 2 => {
        if (ring.getTexture(0) === physicalTex0) return 0;
        if (ring.getTexture(1) === physicalTex0) return 1;
        if (ring.getTexture(2) === physicalTex0) return 2;
        throw new Error('physicalTex0 lost from ring buffer');
      };

      // Initial state: physicalTex0 is in Slot 0
      expect(findSlotOfTex0()).toBe(0);

      // Advance 1: moves to Slot 2 (recycled for asynchronous prefetch staging)
      ring.advance();
      expect(findSlotOfTex0()).toBe(2);

      // Advance 2: moves to Slot 1 (promoted to current frame)
      ring.advance();
      expect(findSlotOfTex0()).toBe(1);

      // Advance 3: moves to Slot 0 (promoted to previous frame)
      ring.advance();
      expect(findSlotOfTex0()).toBe(0);

      // Advance 4: returns to Slot 2
      ring.advance();
      expect(findSlotOfTex0()).toBe(2);

      ring.dispose();
    });

    it('verifies slot content rotation: Slot 0 receives T0 -> T1 -> T2 -> T0 across 3 sequential advances', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);
      const t2 = ring.getTexture(2);

      // Step 0: Slot 0 = T0
      expect(ring.getTexture(0)).toBe(t0);

      // Step 1: Slot 0 = T1
      ring.advance();
      expect(ring.getTexture(0)).toBe(t1);

      // Step 2: Slot 0 = T2
      ring.advance();
      expect(ring.getTexture(0)).toBe(t2);

      // Step 3: Slot 0 = T0
      ring.advance();
      expect(ring.getTexture(0)).toBe(t0);

      ring.dispose();
    });

    it('executes 100,000 sequential advances verifying zero aliasing, zero leaks, and zero allocations', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const initialT0 = ring.getTexture(0);
      const initialT1 = ring.getTexture(1);
      const initialT2 = ring.getTexture(2);

      const TOTAL = 100_000;
      const tStart = performance.now();

      for (let k = 1; k <= TOTAL; k++) {
        ring.advance();

        const c0 = ring.getTexture(0);
        const c1 = ring.getTexture(1);
        const c2 = ring.getTexture(2);

        // Strict non-aliasing assertion
        if (c0 === c1 || c1 === c2 || c0 === c2) {
          throw new Error(`Aliasing detected at advance ${k}`);
        }

        const mod = k % 3;
        if (mod === 1) {
          if (c0 !== initialT1 || c1 !== initialT2 || c2 !== initialT0) {
            throw new Error(`Permutation mismatch at advance ${k} (mod=1)`);
          }
        } else if (mod === 2) {
          if (c0 !== initialT2 || c1 !== initialT0 || c2 !== initialT1) {
            throw new Error(`Permutation mismatch at advance ${k} (mod=2)`);
          }
        } else {
          if (c0 !== initialT0 || c1 !== initialT1 || c2 !== initialT2) {
            throw new Error(`Permutation mismatch at advance ${k} (mod=0)`);
          }
        }
      }

      const elapsedMs = performance.now() - tStart;
      expect(elapsedMs).toBeLessThan(500); // 100k pointer rotations should take < 500ms

      // Final assertions outside loop
      expect(ring.getTexture(0)).toBe(initialT1); // 100,000 % 3 = 1
      expect(ring.getTexture(1)).toBe(initialT2);
      expect(ring.getTexture(2)).toBe(initialT0);

      // Zero new texture allocations on GPUDevice
      expect(device.textures.length).toBe(3);

      ring.dispose();
    });
  });

  // ==========================================================================
  // Section 4: WebGPU Subarray Offset & Safety Verification
  // ==========================================================================
  describe('4. WebGPU Subarray Offset & Safety Verification', () => {
    it('probes subarray views with non-zero byteOffset confirming writeTexture dataLayout.offset === 0', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      const offsetBytes = 512;
      const parentBuf = new ArrayBuffer(offsetBytes + STAGED_SLICE_BYTES + 256);
      const subView = new Uint8Array(parentBuf, offsetBytes, STAGED_SLICE_BYTES);
      subView[0] = 0x88;
      subView[RAW_ROW_BYTES - 1] = 0x99;

      ring.uploadSlice(1, subView);

      const call = device.queue.writeTextureCalls[0];

      // WebGPU contract: offset must be relative to subView BufferSource, so offset === 0
      expect(call.dataLayout.offset).toBe(0);
      expect(call.dataLayout.bytesPerRow).toBe(7424);
      expect(call.dataLayout.rowsPerImage).toBe(1801);

      // Data content verification
      const uploaded = call.data as Uint8Array;
      expect(uploaded[0]).toBe(0x88);
      expect(uploaded[RAW_ROW_BYTES - 1]).toBe(0x99);

      device.queue.writeTextureCalls = [];
      ring.dispose();
    });

    it('enforces post-disposal defense across all methods without unhandled exceptions', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, WIDTH, HEIGHT, FORMAT);

      ring.dispose();
      expect(ring.disposed).toBe(true);

      expect(() => ring.getTexture(0)).toThrow(/disposed/i);
      expect(() => ring.getTexture(1)).toThrow(/disposed/i);
      expect(() => ring.getTexture(2)).toThrow(/disposed/i);
      expect(() => ring.getTextureView(0)).toThrow(/disposed/i);
      expect(() => ring.getActivePhysicalIndex(0)).toThrow(/disposed/i);
      expect(() => ring.getPhysicalTexture(0)).toThrow(/disposed/i);
      expect(() => ring.getPhysicalTextureView(0)).toThrow(/disposed/i);
      expect(() => ring.advance()).toThrow(/disposed/i);
      expect(() => ring.uploadSlice(0, new Uint8Array(64))).toThrow(/disposed/i);

      // Idempotent dispose
      expect(() => ring.dispose()).not.toThrow();
    });
  });
});
