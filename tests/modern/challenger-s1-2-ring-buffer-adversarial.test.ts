/**
 * tests/modern/challenger-s1-2-ring-buffer-adversarial.test.ts
 *
 * Adversarial Challenger 2 Stress Test Suite for TemporalTextureRingBuffer.
 *
 * Directives:
 * 1. Non-standard & Prime Dimensions:
 *    - Widths: 1, 3, 17, 33, 127, 255, 257, 1441, 4097
 *    - Formats: r8unorm, r16float, r32float, rgba8unorm, rgba16float
 *    - Strict verification of 256-byte row pitch multiples (Invariant §20 & §40).
 * 2. Varied Buffer Views:
 *    - ArrayBuffer, Float32Array, Uint16Array, Uint8Array
 *    - Subarray views with non-zero byte offsets
 *    - WebGPU specification oracle check: dataLayout.offset + requiredBytesInCopy <= byteSize
 *    - Detection of double-offsetting and out-of-bounds layout hazards.
 * 3. Edge Cases & Lifecycle Robustness:
 *    - Rapid advance without upload (50,000 iterations)
 *    - Interleaved uploads and advances (sliding window simulation)
 *    - Double disposal idempotency & post-disposal defense
 *    - Invalid slot indices (-1, 3, 1.5, NaN, null, undefined)
 *    - Sub-unit / fractional dimension probing (0 < width < 1)
 */

import { describe, it, expect, vi } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import {
  TemporalTextureRingBuffer,
  getTextureFormatBytesPerPixel,
} from '../../src/webgpu/TemporalTextureRingBuffer';

describe('Challenger S1-2: TemporalTextureRingBuffer Adversarial Probing', () => {
  // ==========================================================================
  // Section 1: Non-Standard & Prime Dimensions Multi-Format Matrix
  // ==========================================================================
  describe('Section 1: Non-Standard & Prime Dimensions Multi-Format Matrix', () => {
    const targetWidths = [1, 3, 17, 33, 127, 255, 257, 1441, 4097];
    const targetFormats: GPUTextureFormat[] = [
      'r8unorm',
      'r16float',
      'r32float',
      'rgba8unorm',
      'rgba16float',
    ];

    it.each(
      targetWidths.flatMap((width) =>
        targetFormats.map((format) => ({ width, format }))
      )
    )(
      'guarantees bytesPerRow is an exact multiple of 256 for width=$width and format=$format',
      ({ width, format }) => {
        const device = new MockGPUDevice();
        const height = 7; // prime height
        const ring = new TemporalTextureRingBuffer(device as any, width, height, format);

        const bpp = getTextureFormatBytesPerPixel(format);
        const expectedRawRowBytes = width * bpp;
        const expectedBytesPerRow = Math.ceil(expectedRawRowBytes / 256) * 256;

        expect(ring.bytesPerPixel).toBe(bpp);
        expect(ring.rawRowBytes).toBe(expectedRawRowBytes);
        expect(ring.bytesPerRow).toBe(expectedBytesPerRow);

        // Invariant §40: WebGPU requires bytesPerRow to be a strict multiple of 256
        expect(ring.bytesPerRow % 256).toBe(0);
        expect(ring.bytesPerRow).toBeGreaterThanOrEqual(ring.rawRowBytes);
        expect(ring.bytesPerRow - ring.rawRowBytes).toBeLessThan(256);
      }
    );

    it.each(targetWidths)(
      'verifies row-by-row data upload and padding fidelity for width=%i with r16float format',
      (width) => {
        const device = new MockGPUDevice();
        const height = 5;
        const format: GPUTextureFormat = 'r16float';
        const ring = new TemporalTextureRingBuffer(device as any, width, height, format);

        const rawRowBytes = width * 2;
        const totalRawBytes = rawRowBytes * height;
        const srcData = new Uint8Array(totalRawBytes);

        // Fill each row with unique byte pattern
        for (let r = 0; r < height; r++) {
          const rowVal = ((r + 1) * 37) & 0xff;
          srcData.fill(rowVal, r * rawRowBytes, (r + 1) * rawRowBytes);
        }

        ring.uploadSlice(0, srcData.buffer);

        expect(device.queue.writeTextureCalls.length).toBe(1);
        const call = device.queue.writeTextureCalls[0];
        expect(call.dataLayout.bytesPerRow).toBe(ring.bytesPerRow);
        expect(call.dataLayout.bytesPerRow % 256).toBe(0);
        expect(call.size.width).toBe(width);
        expect(call.size.height).toBe(height);

        const uploaded = call.data as Uint8Array;
        expect(uploaded.byteLength).toBe(ring.bytesPerRow * height);

        // Validate that each row's data is at the exact destination stride
        for (let r = 0; r < height; r++) {
          const expectedVal = ((r + 1) * 37) & 0xff;
          const rowOffset = r * ring.bytesPerRow;
          expect(uploaded[rowOffset]).toBe(expectedVal);
          expect(uploaded[rowOffset + rawRowBytes - 1]).toBe(expectedVal);

          // If padded, verify padding bytes are 0
          if (ring.bytesPerRow > rawRowBytes) {
            for (let p = rawRowBytes; p < ring.bytesPerRow; p++) {
              expect(uploaded[rowOffset + p]).toBe(0);
            }
          }
        }
      }
    );
  });

  // ==========================================================================
  // Section 2: Varied Buffer Views & Subarray Offset Validation
  // ==========================================================================
  describe('Section 2: Varied Buffer Views & Subarray Offset Validation', () => {
    it('accepts raw ArrayBuffer directly', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 64, 16, 'rgba8unorm');

      const buf = new ArrayBuffer(64 * 16 * 4);
      new Uint8Array(buf).fill(0x7f);

      ring.uploadSlice(1, buf);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];
      expect(call.destination.texture).toBe(ring.getTexture(1));
      expect(call.data.byteLength).toBe(64 * 16 * 4);
    });

    it('accepts Float32Array view directly for r32float format', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 32, 32, 'r32float');

      const floats = new Float32Array(32 * 32);
      floats.fill(3.14159);

      ring.uploadSlice(0, floats);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];
      expect(call.destination.texture).toBe(ring.getTexture(0));
    });

    it('accepts Uint16Array view directly for r16float format', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 128, 64, 'r16float');

      const u16 = new Uint16Array(128 * 64);
      u16.fill(0x3c00); // 1.0 in FP16

      ring.uploadSlice(2, u16);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];
      expect(call.destination.texture).toBe(ring.getTexture(2));
    });

    it('accepts Uint8Array view directly for r8unorm format', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 256, 128, 'r8unorm');

      const u8 = new Uint8Array(256 * 128);
      u8.fill(200);

      ring.uploadSlice(0, u8);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];
      expect(call.destination.texture).toBe(ring.getTexture(0));
    });

    /**
     * CRITICAL ADVERSARIAL ORACLE TEST:
     * WebGPU Specification §11.2.6 & §19.2:
     * In writeTexture(destination, data, dataLayout, size):
     * - `data` is an ArrayBuffer or ArrayBufferView.
     * - `dataLayout.offset` is the offset, in bytes, from the beginning of `data`
     *   to the start of the image content within `data`.
     * - WebGPU requires: `dataLayout.offset + requiredBytesInCopy <= data.byteLength`.
     *
     * HAZARD AUDIT:
     * If caller provides a subarray view `new Float32Array(parentBuffer, byteOffset, length)`:
     * - The slice length is `length * 4` bytes.
     * - In `TemporalTextureRingBuffer.uploadSlice`, line 240 specifies: `offset: uploadData.byteOffset`.
     * - When `bytesPerRow === rawRowBytes` (natural alignment) or buffer is pre-padded,
     *   `uploadData` is `srcBytes`, whose `.byteOffset` equals `data.byteOffset`.
     * - Passing `offset: uploadData.byteOffset` instructs WebGPU to start reading `byteOffset` bytes
     *   INTO the already-offset subarray!
     * - This leads to:
     *   1. Out-of-bounds validation error: `byteOffset + requiredBytes > uploadData.byteLength`.
     *   2. Double-offsetting: reading `2 * byteOffset` bytes into the underlying parent buffer.
     */
    /**
     * CRITICAL ADVERSARIAL ORACLE TEST:
     * WebGPU Specification §11.2.6 & §19.2:
     * In writeTexture(destination, data, dataLayout, size):
     * - `data` is an ArrayBuffer or ArrayBufferView.
     * - `dataLayout.offset` is the offset, in bytes, from the beginning of `data`
     *   to the start of the image content within `data`.
     * - WebGPU requires: `dataLayout.offset + requiredBytesInCopy <= data.byteLength`.
     *
     * Remediated contract:
     * When callers provide a subarray view `new TypedArray(parentBuffer, byteOffset, length)`,
     * `dataLayout.offset` MUST be strictly 0, since `data` passed to `writeTexture` is already
     * the sub-view. Passing a non-zero offset would cause double-offsetting or out-of-bounds violations.
     */
    it.each([128, 256, 512, 1024, 4096])(
      'adversarially probes subarray views with arbitrary non-zero byteOffset=%i for natural alignment',
      (byteOffset) => {
        const device = new MockGPUDevice();
        // Natural 256-byte alignment: 64 width * 4 bytes/px (rgba8unorm) = 256 rawRowBytes, bytesPerRow = 256
        const width = 64;
        const height = 4;
        const ring = new TemporalTextureRingBuffer(device as any, width, height, 'rgba8unorm');

        const rawBytes = width * height * 4; // 1024 bytes
        const parentBuffer = new ArrayBuffer(byteOffset + rawBytes + 1024);

        // Fill parent buffer with recognizable pattern
        const parentView = new Uint8Array(parentBuffer);
        for (let i = 0; i < parentView.length; i++) {
          parentView[i] = (i & 0xff);
        }

        // Create a subarray view with arbitrary non-zero byteOffset
        const subView = new Uint8Array(parentBuffer, byteOffset, rawBytes);

        ring.uploadSlice(0, subView);

        expect(device.queue.writeTextureCalls.length).toBe(1);
        const call = device.queue.writeTextureCalls[0];

        const uploadedData = call.data as Uint8Array;
        const dataLayout = call.dataLayout;
        const requiredBytesInCopy = ring.bytesPerRow * (height - 1) + ring.rawRowBytes; // 1024

        // 1. dataLayout.offset must be strictly 0 to prevent double-offsetting
        expect(dataLayout.offset).toBe(0);

        // 2. data length must match the slice length
        expect(uploadedData.byteLength).toBe(rawBytes);

        // 3. WebGPU spec check: dataLayout.offset + requiredBytesInCopy <= uploadedData.byteLength
        expect(dataLayout.offset + requiredBytesInCopy).toBeLessThanOrEqual(uploadedData.byteLength);

        // 4. Data content integrity: uploadedData starts with the exact bytes from subView, not shifted
        expect(uploadedData[0]).toBe(parentView[byteOffset]);
        expect(uploadedData[rawBytes - 1]).toBe(parentView[byteOffset + rawBytes - 1]);
      }
    );

    it.each([128, 256, 512, 1024, 4096])(
      'adversarially probes subarray views with arbitrary non-zero byteOffset=%i for unaligned dimensions requiring row padding',
      (byteOffset) => {
        const device = new MockGPUDevice();
        // Unaligned: 33 width * 2 bytes/px (r16float) = 66 rawRowBytes, bytesPerRow = 256
        const width = 33;
        const height = 3;
        const ring = new TemporalTextureRingBuffer(device as any, width, height, 'r16float');

        const rawBytes = ring.rawRowBytes * height; // 66 * 3 = 198 bytes
        const parentBuffer = new ArrayBuffer(byteOffset + rawBytes + 512);

        const parentView = new Uint8Array(parentBuffer);
        for (let i = 0; i < parentView.length; i++) {
          parentView[i] = ((i + 13) & 0xff);
        }

        const subView = new Uint8Array(parentBuffer, byteOffset, rawBytes);

        ring.uploadSlice(1, subView);

        expect(device.queue.writeTextureCalls.length).toBe(1);
        const call = device.queue.writeTextureCalls[0];

        const uploadedData = call.data as Uint8Array;
        const dataLayout = call.dataLayout;
        const requiredBytesInCopy = ring.bytesPerRow * (height - 1) + ring.rawRowBytes; // 256 * 2 + 66 = 578

        // Strict 0 offset
        expect(dataLayout.offset).toBe(0);
        expect(uploadedData.byteLength).toBe(ring.bytesPerRow * height);
        expect(dataLayout.offset + requiredBytesInCopy).toBeLessThanOrEqual(uploadedData.byteLength);

        // Verify padded row content starts with the exact subView data for each row
        for (let r = 0; r < height; r++) {
          const expectedFirstByte = parentView[byteOffset + r * ring.rawRowBytes];
          const actualFirstByte = uploadedData[r * ring.bytesPerRow];
          expect(actualFirstByte).toBe(expectedFirstByte);
        }
      }
    );

    it.each([128, 256, 512, 1024, 4096])(
      'adversarially probes pre-padded subarray views with arbitrary non-zero byteOffset=%i',
      (byteOffset) => {
        const device = new MockGPUDevice();
        // Unaligned: 30 width * 4 bytes/px (rgba8unorm) = 120 rawRowBytes, bytesPerRow = 256
        const width = 30;
        const height = 2;
        const ring = new TemporalTextureRingBuffer(device as any, width, height, 'rgba8unorm');

        const totalPaddedBytes = ring.bytesPerRow * height; // 256 * 2 = 512 bytes
        const parentBuffer = new ArrayBuffer(byteOffset + totalPaddedBytes + 256);

        const parentView = new Uint8Array(parentBuffer);
        for (let i = 0; i < parentView.length; i++) {
          parentView[i] = ((i + 71) & 0xff);
        }

        const prePaddedSubView = new Uint8Array(parentBuffer, byteOffset, totalPaddedBytes);

        ring.uploadSlice(2, prePaddedSubView);

        expect(device.queue.writeTextureCalls.length).toBe(1);
        const call = device.queue.writeTextureCalls[0];

        const uploadedData = call.data as Uint8Array;
        const dataLayout = call.dataLayout;
        const requiredBytesInCopy = ring.bytesPerRow * (height - 1) + ring.rawRowBytes; // 256 * 1 + 120 = 376

        expect(dataLayout.offset).toBe(0);
        expect(uploadedData.byteLength).toBe(totalPaddedBytes);
        expect(dataLayout.offset + requiredBytesInCopy).toBeLessThanOrEqual(uploadedData.byteLength);
        expect(uploadedData[0]).toBe(parentView[byteOffset]);
      }
    );
  });

  // ==========================================================================
  // Section 3: Edge Cases & Lifecycle Robustness
  // ==========================================================================
  describe('Section 3: Edge Cases & Lifecycle Robustness', () => {
    it('executes 50,000 rapid advance() calls without upload with zero allocations or state drift', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 128, 128, 'r16float');

      const initialT0 = ring.getTexture(0);
      const initialT1 = ring.getTexture(1);
      const initialT2 = ring.getTexture(2);

      const count = 50_000;
      for (let i = 0; i < count; i++) {
        ring.advance();
      }

      // 50,000 % 3 = 2 -> Slot 0 is initialT2, Slot 1 is initialT0, Slot 2 is initialT1
      expect(ring.getTexture(0)).toBe(initialT2);
      expect(ring.getTexture(1)).toBe(initialT0);
      expect(ring.getTexture(2)).toBe(initialT1);

      // Advance 1 more to reach 50,001 (multiple of 3) -> strict identity
      ring.advance();
      expect(ring.getTexture(0)).toBe(initialT0);
      expect(ring.getTexture(1)).toBe(initialT1);
      expect(ring.getTexture(2)).toBe(initialT2);

      // Zero new texture allocations
      expect(device.textures.length).toBe(3);
    });

    it('interleaves uploads and advances simulating streaming weather frames over 1,500 steps', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');

      const dummySlice = new Uint8Array(64 * 64 * 2);

      for (let step = 0; step < 1_500; step++) {
        // Upload to staging Slot 2
        ring.uploadSlice(2, dummySlice);
        const lastCall = device.queue.writeTextureCalls[device.queue.writeTextureCalls.length - 1];
        expect(lastCall.destination.texture).toBe(ring.getTexture(2));

        // Advance to next frame
        ring.advance();
      }

      expect(device.queue.writeTextureCalls.length).toBe(1_500);
      expect(device.textures.length).toBe(3);
    });

    it('demonstrates double disposal idempotency without throwing or double-destroying', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 128, 128, 'r16float');

      const t0 = ring.getTexture(0);
      const spy0 = vi.spyOn(t0, 'destroy');

      ring.dispose();
      expect(ring.disposed).toBe(true);
      expect(spy0).toHaveBeenCalledTimes(1);

      // Subsequent dispose calls must be no-ops
      expect(() => {
        ring.dispose();
        ring.dispose();
        ring.dispose();
      }).not.toThrow();

      expect(spy0).toHaveBeenCalledTimes(1);
    });

    it('throws RangeError for all invalid slot indices across getTexture, getTextureView, and uploadSlice', () => {
      const device = new MockGPUDevice();
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'rgba8unorm');
      const dummy = new Uint8Array(64 * 64 * 4);

      const invalidSlots = [-1, 3, 4, 1.5, NaN, null, undefined] as any[];

      for (const slot of invalidSlots) {
        expect(() => ring.getTexture(slot)).toThrow(RangeError);
        expect(() => ring.getTextureView(slot)).toThrow(RangeError);
        expect(() => ring.uploadSlice(slot, dummy)).toThrow(RangeError);
      }
    });

    it('verifies sub-unit and invalid dimension fuzzing: throws RangeError for [0.5, 0.99, 0.001, 1e-9, 0, -1, NaN, Infinity, -Infinity]', () => {
      const device = new MockGPUDevice();
      const invalidValues = [0.5, 0.99, 0.001, 1e-9, 0, -1, -100, NaN, Infinity, -Infinity];

      for (const val of invalidValues) {
        // Invalid width
        expect(() => new TemporalTextureRingBuffer(device as any, val, 100, 'r16float')).toThrow(RangeError);
        // Invalid height
        expect(() => new TemporalTextureRingBuffer(device as any, 100, val, 'r16float')).toThrow(RangeError);
        // Both invalid
        expect(() => new TemporalTextureRingBuffer(device as any, val, val, 'r16float')).toThrow(RangeError);
      }

      // Zero dangling texture allocations when constructor rejects dimensions
      expect(device.textures.length).toBe(0);
    });

    it('verifies valid fractional values >= 1: [1.5, 100.8, 1440.2] floor cleanly without errors and maintain WebGPU invariants', () => {
      const testCases = [
        { rawWidth: 1.5, rawHeight: 2.7, expectedW: 1, expectedH: 2, format: 'r16float' as GPUTextureFormat },
        { rawWidth: 100.8, rawHeight: 50.9, expectedW: 100, expectedH: 50, format: 'rgba8unorm' as GPUTextureFormat },
        { rawWidth: 1440.2, rawHeight: 721.6, expectedW: 1440, expectedH: 721, format: 'r16float' as GPUTextureFormat },
      ];

      for (const tc of testCases) {
        const device = new MockGPUDevice();
        const ring = new TemporalTextureRingBuffer(device as any, tc.rawWidth, tc.rawHeight, tc.format);

        // Verify integer flooring
        expect(ring.width).toBe(tc.expectedW);
        expect(ring.height).toBe(tc.expectedH);

        const bpp = getTextureFormatBytesPerPixel(tc.format);
        const expectedRawRowBytes = tc.expectedW * bpp;
        const expectedBytesPerRow = Math.ceil(expectedRawRowBytes / 256) * 256;

        expect(ring.rawRowBytes).toBe(expectedRawRowBytes);
        expect(ring.bytesPerRow).toBe(expectedBytesPerRow);
        expect(ring.bytesPerRow % 256).toBe(0);

        // Verify GPUTexture descriptor dimensions match floored values
        expect(device.textures.length).toBe(3);
        for (const tex of device.textures) {
          expect(tex.width).toBe(tc.expectedW);
          expect(tex.height).toBe(tc.expectedH);
        }

        // Verify data upload with floored dimensions succeeds without error
        const sliceData = new Uint8Array(expectedRawRowBytes * tc.expectedH);
        sliceData.fill(0x5a);

        expect(() => ring.uploadSlice(0, sliceData.buffer)).not.toThrow();

        const call = device.queue.writeTextureCalls[device.queue.writeTextureCalls.length - 1];
        expect(call.destination.texture).toBe(ring.getTexture(0));
        expect(call.size.width).toBe(tc.expectedW);
        expect(call.size.height).toBe(tc.expectedH);
        expect(call.dataLayout.bytesPerRow).toBe(expectedBytesPerRow);

        ring.dispose();
      }
    });
  });
});
