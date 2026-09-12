/**
 * tests/tier1/ring-buffer.test.ts
 *
 * Behavioral unit test suite for TemporalTextureRingBuffer.
 * Validates:
 * - 3-cycle rotation invariance (order 3 cyclic permutation)
 * - Zero-copy pointer manipulation
 * - Data upload integrity and slot mapping across rotations
 * - WebGPU 256-byte row pitch alignment constraints (Invariant §20 and §40)
 * - Resource disposal and post-disposal defense
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import {
  TemporalTextureRingBuffer,
  getTextureFormatBytesPerPixel,
} from '../../src/webgpu/TemporalTextureRingBuffer';

describe('Stage 1: TemporalTextureRingBuffer Behavioral Unit Tests', () => {
  let device: MockGPUDevice;

  beforeEach(() => {
    device = new MockGPUDevice();
  });

  // ==========================================================================
  // Suite 1: Construction & Texture Resource Initialization
  // ==========================================================================
  describe('Suite 1: Construction & Texture Resource Initialization', () => {
    it('allocates exactly 3 distinct GPUTexture instances upon construction', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 512, 256, 'r16float');

      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);
      const t2 = ring.getTexture(2);

      // Verify all three textures are defined
      expect(t0).toBeDefined();
      expect(t1).toBeDefined();
      expect(t2).toBeDefined();

      // Verify reference inequality (distinct GPU resources)
      expect(t0).not.toBe(t1);
      expect(t1).not.toBe(t2);
      expect(t0).not.toBe(t2);

      // Verify device created exactly 3 textures
      expect(device.textures.length).toBe(3);
    });

    it('exposes dimension, format, and device properties correctly', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 1024, 512, 'rgba8unorm');

      expect(ring.width).toBe(1024);
      expect(ring.height).toBe(512);
      expect(ring.format).toBe('rgba8unorm');
      expect(ring.device).toBe(device);
      expect(ring.bytesPerPixel).toBe(4);
      expect(ring.rawRowBytes).toBe(4096);
      expect(ring.bytesPerRow).toBe(4096);
      expect(ring.disposed).toBe(false);
    });

    it('configures GPUTexture descriptors with correct usage flags and size', () => {
      new TemporalTextureRingBuffer(device as any, 800, 400, 'r32float');

      for (const tex of device.textures) {
        expect(tex.width).toBe(800);
        expect(tex.height).toBe(400);
        expect(tex.format).toBe('r32float');
        // GPUTextureUsage.TEXTURE_BINDING (4) | GPUTextureUsage.COPY_DST (2) = 6
        expect(tex.usage & 0x04).toBe(0x04);
        expect(tex.usage & 0x02).toBe(0x02);
      }
    });

    it('throws RangeError when initialized with non-positive dimensions', () => {
      expect(() => new TemporalTextureRingBuffer(device as any, 0, 100, 'r16float')).toThrow(RangeError);
      expect(() => new TemporalTextureRingBuffer(device as any, 100, -5, 'r16float')).toThrow(RangeError);
      expect(() => new TemporalTextureRingBuffer(device as any, NaN, 100, 'r16float')).toThrow(RangeError);
    });

    it('throws RangeError when initialized with sub-unit fractional dimensions (< 1)', () => {
      expect(() => new TemporalTextureRingBuffer(device as any, 0.5, 100, 'r16float')).toThrow(RangeError);
      expect(() => new TemporalTextureRingBuffer(device as any, 100, 0.5, 'r16float')).toThrow(RangeError);
      expect(() => new TemporalTextureRingBuffer(device as any, 0.99, 100, 'r16float')).toThrow(RangeError);
      expect(() => new TemporalTextureRingBuffer(device as any, 100, 0.99, 'r16float')).toThrow(RangeError);
      expect(() => new TemporalTextureRingBuffer(device as any, 0.001, 100, 'r16float')).toThrow(RangeError);
    });

    it('correctly floors fractional dimensions >= 1 without throwing', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 100.7, 50.2, 'rgba8unorm');
      expect(ring.width).toBe(100);
      expect(ring.height).toBe(50);
      expect(ring.rawRowBytes).toBe(400);
      expect(ring.bytesPerRow).toBe(512);
    });

    it('throws Error when initialized without a valid GPUDevice', () => {
      expect(() => new TemporalTextureRingBuffer(null as any, 100, 100, 'r16float')).toThrow(/GPUDevice/i);
    });
  });

  // ==========================================================================
  // Suite 2: Cyclic 3-Slot Permutation Mathematics & 3-Cycle Invariance
  // ==========================================================================
  describe('Suite 2: Cyclic 3-Slot Permutation & 3-Cycle Invariance', () => {
    it('executes exact permutation: Slot 1 -> Slot 0, Slot 2 -> Slot 1, Slot 0 -> Slot 2', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 256, 256, 'r16float');

      const initialT0 = ring.getTexture(0);
      const initialT1 = ring.getTexture(1);
      const initialT2 = ring.getTexture(2);

      // Advance 1 step: Staging (Slot 2) -> Current (Slot 1), Current (Slot 1) -> Previous (Slot 0), Previous (Slot 0) -> Staging (Slot 2)
      ring.advance();

      // Logical Slot 0 receives old Slot 1 (Current -> Previous)
      expect(ring.getTexture(0)).toBe(initialT1);
      // Logical Slot 1 receives old Slot 2 (Staging -> Current)
      expect(ring.getTexture(1)).toBe(initialT2);
      // Logical Slot 2 receives old Slot 0 (Previous -> Staging)
      expect(ring.getTexture(2)).toBe(initialT0);
    });

    it('executes 2nd advance: Slot 0 gets T2, Slot 1 gets T0, Slot 2 gets T1', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 256, 256, 'r16float');

      const initialT0 = ring.getTexture(0);
      const initialT1 = ring.getTexture(1);
      const initialT2 = ring.getTexture(2);

      ring.advance(); // step 1
      ring.advance(); // step 2

      expect(ring.getTexture(0)).toBe(initialT2);
      expect(ring.getTexture(1)).toBe(initialT0);
      expect(ring.getTexture(2)).toBe(initialT1);
    });

    it('verifies 3-cycle rotation invariance: 3rd advance returns to exact initial assignment', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 256, 256, 'r16float');

      const initialT0 = ring.getTexture(0);
      const initialT1 = ring.getTexture(1);
      const initialT2 = ring.getTexture(2);

      ring.advance(); // 1
      ring.advance(); // 2
      ring.advance(); // 3 (order 3 cyclic completion)

      expect(ring.getTexture(0)).toBe(initialT0);
      expect(ring.getTexture(1)).toBe(initialT1);
      expect(ring.getTexture(2)).toBe(initialT2);
    });

    it('maintains modular invariance over 300 consecutive rotations with zero drift', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 128, 128, 'rgba8unorm');

      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);
      const t2 = ring.getTexture(2);

      const permutationSequence = [
        [t0, t1, t2], // 0 advances
        [t1, t2, t0], // 1 advance
        [t2, t0, t1], // 2 advances
      ];

      for (let i = 1; i <= 300; i++) {
        ring.advance();
        const expected = permutationSequence[i % 3];
        expect(ring.getTexture(0)).toBe(expected[0]);
        expect(ring.getTexture(1)).toBe(expected[1]);
        expect(ring.getTexture(2)).toBe(expected[2]);
      }
    });

    it('performs advance() with zero texture allocations', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');
      const initialTextureCount = device.textures.length;

      for (let i = 0; i < 50; i++) {
        ring.advance();
      }

      // No new textures allocated on device
      expect(device.textures.length).toBe(initialTextureCount);
    });
  });

  // ==========================================================================
  // Suite 3: Data Upload Integrity & Slot Mapping Across Rotations
  // ==========================================================================
  describe('Suite 3: Data Upload Integrity Across Rotations', () => {
    it('uploadSlice writes to the physical texture currently mapped to the target logical slot', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'rgba8unorm');
      const targetT2 = ring.getTexture(2);

      const testData = new Uint8Array(64 * 64 * 4);
      testData.fill(42);

      ring.uploadSlice(2, testData.buffer);

      const calls = device.queue.writeTextureCalls;
      expect(calls.length).toBe(1);
      expect(calls[0].destination.texture).toBe(targetT2);
      expect(calls[0].size.width).toBe(64);
      expect(calls[0].size.height).toBe(64);
    });

    it('uploadSlice across rotations writes to the newly rotated staging texture', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'rgba8unorm');
      const initialT0 = ring.getTexture(0);
      const initialT1 = ring.getTexture(1);
      const initialT2 = ring.getTexture(2);

      // Initial upload to staging (Slot 2 -> initialT2)
      const data1 = new Uint8Array(64 * 64 * 4);
      ring.uploadSlice(2, data1.buffer);
      expect(device.queue.writeTextureCalls[0].destination.texture).toBe(initialT2);

      // Advance: Slot 2 is now initialT0 (Previous (Slot 0) recycles to Staging (Slot 2))
      ring.advance();
      expect(ring.getTexture(2)).toBe(initialT0);

      // Next upload to staging (Slot 2 -> initialT0)
      const data2 = new Uint8Array(64 * 64 * 4);
      ring.uploadSlice(2, data2.buffer);

      expect(device.queue.writeTextureCalls.length).toBe(2);
      expect(device.queue.writeTextureCalls[1].destination.texture).toBe(initialT0);
    });

    it('supports uploading directly to slots 0 and 1', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'rgba8unorm');
      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);

      const dummy = new Uint8Array(64 * 64 * 4);
      ring.uploadSlice(0, dummy.buffer);
      ring.uploadSlice(1, dummy.buffer);

      const calls = device.queue.writeTextureCalls;
      expect(calls.length).toBe(2);
      expect(calls[0].destination.texture).toBe(t0);
      expect(calls[1].destination.texture).toBe(t1);
    });

    it('accepts ArrayBufferView directly as upload source', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'rgba8unorm');
      const view = new Uint32Array(64 * 64);
      view.fill(0xdeadbeef);

      ring.uploadSlice(0, view);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      expect(device.queue.writeTextureCalls[0].destination.texture).toBe(ring.getTexture(0));
    });

    it('creates texture view via getTextureView()', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'rgba8unorm');
      const view0 = ring.getTextureView(0);
      expect(view0).toBeDefined();
    });

    it('uploads from ArrayBufferView subarray with non-zero byteOffset with offset: 0 in writeTexture dataLayout', () => {
      // Natural 256-byte alignment: 64 width * 4 bytes/px (rgba8unorm) = 256 bytes per row
      const ring = new TemporalTextureRingBuffer(device as any, 64, 4, 'rgba8unorm');
      expect(ring.bytesPerRow).toBe(256);
      expect(ring.rawRowBytes).toBe(256);

      const payloadBytes = 64 * 4 * 4; // 1024 bytes
      const byteOffset = 512;
      const parentBuffer = new ArrayBuffer(payloadBytes + byteOffset + 256);

      // Pre-fill parent buffer with sentinel 0xFF to detect accidental out-of-bounds reads
      new Uint8Array(parentBuffer).fill(0xff);

      // Create subarray view with non-zero byteOffset
      const subView = new Uint8Array(parentBuffer, byteOffset, payloadBytes);
      for (let i = 0; i < payloadBytes; i++) {
        subView[i] = (i * 13 + 7) & 0xff;
      }

      ring.uploadSlice(0, subView);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];

      // Destination texture check
      expect(call.destination.texture).toBe(ring.getTexture(0));

      // CRITICAL WebGPU §11.2.6 & §19.2 verification:
      // dataLayout.offset is relative to the start of the `data` BufferSource (subView[0]).
      // Passing offset: 0 guarantees dataLayout.offset + requiredBytes <= uploadData.byteLength.
      expect(call.dataLayout.offset).toBe(0);
      expect(call.dataLayout.bytesPerRow).toBe(256);
      expect(call.dataLayout.rowsPerImage).toBe(4);

      // Spec inequality check: layout.offset + requiredBytesInCopy <= byteSize
      const requiredBytesInCopy = 256 * (4 - 1) + 256; // 1024
      const uploadData = call.data as Uint8Array;
      expect(uploadData.byteLength).toBe(1024);
      expect(call.dataLayout.offset + requiredBytesInCopy <= uploadData.byteLength).toBe(true);

      // Data fidelity verification: first, middle, last bytes must match subView
      expect(uploadData[0]).toBe(subView[0]);
      expect(uploadData[511]).toBe(subView[511]);
      expect(uploadData[1023]).toBe(subView[1023]);
    });

    it('uploads from unaligned ArrayBufferView subarray with non-zero byteOffset with correct row padding and offset: 0', () => {
      // Unaligned: 100 width * 2 bytes/px (r16float) = 200 rawRowBytes, bytesPerRow = 256
      const ring = new TemporalTextureRingBuffer(device as any, 100, 4, 'r16float');
      expect(ring.rawRowBytes).toBe(200);
      expect(ring.bytesPerRow).toBe(256);

      const rawBytes = 100 * 4 * 2; // 800 bytes
      const byteOffset = 384; // non-zero byte offset
      const parentBuffer = new ArrayBuffer(rawBytes + byteOffset + 512);

      const subView = new Uint8Array(parentBuffer, byteOffset, rawBytes);
      for (let row = 0; row < 4; row++) {
        subView.fill(row + 42, row * 200, (row + 1) * 200);
      }

      ring.uploadSlice(1, subView);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];

      expect(call.dataLayout.offset).toBe(0);
      expect(call.dataLayout.bytesPerRow).toBe(256);
      expect(call.dataLayout.rowsPerImage).toBe(4);

      const uploaded = call.data as Uint8Array;
      expect(uploaded.byteLength).toBe(256 * 4); // 1024 padded

      for (let row = 0; row < 4; row++) {
        const dstStart = row * 256;
        expect(uploaded[dstStart]).toBe(row + 42);
        expect(uploaded[dstStart + 199]).toBe(row + 42);
        for (let pad = 200; pad < 256; pad++) {
          expect(uploaded[dstStart + pad]).toBe(0);
        }
      }
    });

    it('uploads from Float32Array subarray with non-zero byteOffset representing multi-slice stream', () => {
      // 64 width * 4 bytes/px (r32float) = 256 rawRowBytes, bytesPerRow = 256
      const ring = new TemporalTextureRingBuffer(device as any, 64, 2, 'r32float');
      const floatsPerSlice = 64 * 2; // 128 floats = 512 bytes
      const parent = new Float32Array(floatsPerSlice * 4); // 4 slices

      // Slice at frame index 2 (byte offset = 2 * 512 = 1024 bytes)
      const byteOffset = 1024;
      const slice2 = new Float32Array(parent.buffer, byteOffset, floatsPerSlice);
      slice2.fill(137.5);

      ring.uploadSlice(2, slice2);

      expect(device.queue.writeTextureCalls.length).toBe(1);
      const call = device.queue.writeTextureCalls[0];

      expect(call.dataLayout.offset).toBe(0);
      const uploadedBytes = call.data as Uint8Array;
      const uploadedFloats = new Float32Array(
        uploadedBytes.buffer,
        uploadedBytes.byteOffset,
        uploadedBytes.byteLength / 4
      );
      expect(uploadedFloats[0]).toBeCloseTo(137.5);
      expect(uploadedFloats[floatsPerSlice - 1]).toBeCloseTo(137.5);
    });
  });

  // ==========================================================================
  // Suite 4: WebGPU 256-Byte Row Pitch Compliance (Invariant §20 & §40)
  // ==========================================================================
  describe('Suite 4: WebGPU 256-Byte Row Pitch Alignment (Invariant §20 & §40)', () => {
    it('verifies 256-byte row pitch for width=1440 and format=r16float (3072 bytesPerRow)', () => {
      // 1440 width * 2 bytes/px = 2880 bytes
      // Math.ceil(2880 / 256) * 256 = 12 * 256 = 3072 bytes
      const ring = new TemporalTextureRingBuffer(device as any, 1440, 721, 'r16float');

      expect(ring.bytesPerPixel).toBe(2);
      expect(ring.rawRowBytes).toBe(2880);
      expect(ring.bytesPerRow).toBe(3072);
      expect(ring.bytesPerRow % 256).toBe(0);

      // Create unpadded source buffer (1440 * 721 * 2 = 2,076,480 bytes)
      const rawBytes = new Uint8Array(1440 * 721 * 2);
      rawBytes.fill(123);

      ring.uploadSlice(0, rawBytes.buffer);

      const call = device.queue.writeTextureCalls[0];
      expect(call.dataLayout.bytesPerRow).toBe(3072);
      expect(call.dataLayout.rowsPerImage).toBe(721);
      expect(call.size.width).toBe(1440);
      expect(call.size.height).toBe(721);
      expect(call.size.depthOrArrayLayers).toBe(1);

      // Verify that padded buffer of size 3072 * 721 = 2,214,912 was uploaded
      const uploadedData = call.data as Uint8Array;
      expect(uploadedData.byteLength).toBe(3072 * 721);
      expect(uploadedData[0]).toBe(123);
      expect(uploadedData[2879]).toBe(123); // end of row 0 raw data
    });

    it('passes unpadded data directly when raw row bytes is already a multiple of 256', () => {
      // 256 width * 4 bytes/px (rgba8unorm) = 1024 bytes (1024 % 256 === 0)
      const ring = new TemporalTextureRingBuffer(device as any, 256, 10, 'rgba8unorm');

      expect(ring.rawRowBytes).toBe(1024);
      expect(ring.bytesPerRow).toBe(1024);

      const rawBytes = 256 * 10 * 4;
      const data = new Uint8Array(rawBytes);
      data.fill(99);

      ring.uploadSlice(0, data.buffer);

      const call = device.queue.writeTextureCalls[0];
      expect(call.dataLayout.bytesPerRow).toBe(1024);
      expect(call.dataLayout.bytesPerRow % 256).toBe(0);
      expect(call.dataLayout.rowsPerImage).toBe(10);
    });

    it('correctly pads arbitrary unaligned dimensions row-by-row', () => {
      // 100 width * 2 bytes/px (r16float) = 200 bytes
      // Padded row bytes = ceil(200 / 256) * 256 = 256 bytes
      const ring = new TemporalTextureRingBuffer(device as any, 100, 4, 'r16float');

      const rawBytes = 100 * 4 * 2; // 800 bytes
      const src = new Uint8Array(rawBytes);
      for (let y = 0; y < 4; y++) {
        src.fill(y + 1, y * 200, (y + 1) * 200);
      }

      ring.uploadSlice(0, src.buffer);

      const call = device.queue.writeTextureCalls[0];
      expect(call.dataLayout.bytesPerRow).toBe(256);
      expect(call.dataLayout.bytesPerRow % 256).toBe(0);

      const writtenData = call.data as Uint8Array;
      expect(writtenData.byteLength).toBe(256 * 4); // 1024 bytes

      // Verify row data content and stride offset
      for (let y = 0; y < 4; y++) {
        expect(writtenData[y * 256]).toBe(y + 1);
        expect(writtenData[y * 256 + 199]).toBe(y + 1);
      }
    });

    it('recognizes pre-padded buffers supplied by caller without double-padding', () => {
      // 100 width * 2 bytes/px = 200 raw, padded = 256
      const ring = new TemporalTextureRingBuffer(device as any, 100, 4, 'r16float');

      const prePadded = new Uint8Array(256 * 4);
      prePadded.fill(77);

      ring.uploadSlice(0, prePadded.buffer);

      const call = device.queue.writeTextureCalls[0];
      expect(call.dataLayout.bytesPerRow).toBe(256);
      expect(call.data.byteLength).toBe(1024);
    });

    it('throws when incoming data buffer is smaller than required raw dimensions', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 100, 10, 'r16float');
      // Required: 100 * 10 * 2 = 2000 bytes
      const tooSmall = new Uint8Array(1500);

      expect(() => ring.uploadSlice(0, tooSmall.buffer)).toThrow(/insufficient/i);
    });
  });

  // ==========================================================================
  // Suite 5: Resource Disposal & Idempotency
  // ==========================================================================
  describe('Suite 5: Resource Disposal & Idempotency', () => {
    it('calls destroy() on all 3 GPUTexture instances upon dispose()', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 128, 128, 'r16float');

      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);
      const t2 = ring.getTexture(2);

      const spy0 = vi.spyOn(t0, 'destroy');
      const spy1 = vi.spyOn(t1, 'destroy');
      const spy2 = vi.spyOn(t2, 'destroy');

      ring.dispose();

      expect(spy0).toHaveBeenCalledTimes(1);
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(ring.disposed).toBe(true);
    });

    it('is idempotent: calling dispose() multiple times does not throw or re-destroy', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 128, 128, 'r16float');

      const t0 = ring.getTexture(0);
      const spy0 = vi.spyOn(t0, 'destroy');

      expect(() => {
        ring.dispose();
        ring.dispose();
        ring.dispose();
      }).not.toThrow();

      expect(spy0).toHaveBeenCalledTimes(1);
      expect(ring.disposed).toBe(true);
    });

    it('throws explicit errors when calling methods after disposal', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');
      ring.dispose();

      expect(() => ring.getTexture(0)).toThrow(/disposed/i);
      expect(() => ring.getTextureView(0)).toThrow(/disposed/i);
      expect(() => ring.getActivePhysicalIndex(0)).toThrow(/disposed/i);
      expect(() => ring.getPhysicalTexture(0)).toThrow(/disposed/i);
      expect(() => ring.getPhysicalTextureView(0)).toThrow(/disposed/i);
      expect(() => ring.advance()).toThrow(/disposed/i);
      expect(() => ring.uploadSlice(0, new ArrayBuffer(64 * 64 * 2))).toThrow(/disposed/i);
    });
  });

  // ==========================================================================
  // Suite 6: Defensive Guard Rails & Format Support
  // ==========================================================================
  describe('Suite 6: Defensive Guard Rails & Format Support', () => {
    it('throws RangeError when querying invalid slot indices', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');

      expect(() => ring.getTexture(-1 as any)).toThrow(RangeError);
      expect(() => ring.getTexture(3 as any)).toThrow(RangeError);
      expect(() => ring.getTexture(1.5 as any)).toThrow(RangeError);
    });

    it('throws RangeError when uploading to invalid slot indices', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');
      const buf = new ArrayBuffer(64 * 64 * 2);

      expect(() => ring.uploadSlice(-1 as any, buf)).toThrow(RangeError);
      expect(() => ring.uploadSlice(3 as any, buf)).toThrow(RangeError);
    });

    it('resolves bytes-per-pixel correctly across all standard WebGPU formats', () => {
      expect(getTextureFormatBytesPerPixel('r8unorm')).toBe(1);
      expect(getTextureFormatBytesPerPixel('r8uint')).toBe(1);
      expect(getTextureFormatBytesPerPixel('r16float')).toBe(2);
      expect(getTextureFormatBytesPerPixel('rg8unorm')).toBe(2);
      expect(getTextureFormatBytesPerPixel('rgba8unorm')).toBe(4);
      expect(getTextureFormatBytesPerPixel('r32float')).toBe(4);
      expect(getTextureFormatBytesPerPixel('rg16float')).toBe(4);
      expect(getTextureFormatBytesPerPixel('rgba16float')).toBe(8);
      expect(getTextureFormatBytesPerPixel('rg32float')).toBe(8);
      expect(getTextureFormatBytesPerPixel('rgba32float')).toBe(16);
    });

    it('queries physical textures and pre-cached physical views directly across advance rotations', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');
      const p0 = ring.getPhysicalTexture(0);
      const p1 = ring.getPhysicalTexture(1);
      const p2 = ring.getPhysicalTexture(2);
      expect(p0).toBe(ring.getTexture(0));
      expect(p1).toBe(ring.getTexture(1));
      expect(p2).toBe(ring.getTexture(2));

      // Advance ring buffer
      ring.advance();
      // Physical textures remain unchanging across rotations
      expect(ring.getPhysicalTexture(0)).toBe(p0);
      expect(ring.getPhysicalTexture(1)).toBe(p1);
      expect(ring.getPhysicalTexture(2)).toBe(p2);
      // Logical slot 0 now points to physical texture 1
      expect(ring.getTexture(0)).toBe(p1);
      expect(ring.getActivePhysicalIndex(0)).toBe(1);
      expect(ring.getActivePhysicalIndex(1)).toBe(2);
      expect(ring.getActivePhysicalIndex(2)).toBe(0);

      // Pre-cached views are stable and idempotent
      const v0 = ring.getPhysicalTextureView(0);
      const v1 = ring.getPhysicalTextureView(1);
      const v2 = ring.getPhysicalTextureView(2);
      expect(ring.getPhysicalTextureView(0)).toBe(v0);
      expect(ring.getPhysicalTextureView(1)).toBe(v1);
      expect(ring.getPhysicalTextureView(2)).toBe(v2);
    });

    it('throws RangeError for out-of-range physical indices and active slot queries', () => {
      const ring = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');
      expect(() => ring.getActivePhysicalIndex(-1 as any)).toThrow(RangeError);
      expect(() => ring.getActivePhysicalIndex(3 as any)).toThrow(RangeError);
      expect(() => ring.getPhysicalTexture(-1 as any)).toThrow(RangeError);
      expect(() => ring.getPhysicalTexture(3 as any)).toThrow(RangeError);
      expect(() => ring.getPhysicalTextureView(-1 as any)).toThrow(RangeError);
      expect(() => ring.getPhysicalTextureView(3 as any)).toThrow(RangeError);
    });
  });
});
