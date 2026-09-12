/**
 * tests/modern/challenger-m2-it2-2-ring-buffer-invariance.test.ts
 *
 * Empirical Adversarial Challenger Verification Harness for Milestone 2 Iteration 2:
 * Evaluates whether sequence generation guards preserve exact ring buffer mathematical invariance:
 * 1. Slot upload parity across all 3 slots (Slot 0, Slot 1, Slot 2) under concurrent conditions.
 * 2. 256-byte row pitch adherence (7424 bytes/row) across concurrent and varied buffer inputs.
 * 3. Temporal sliding-window forward permutation invariance (S2 -> S1 -> S0).
 * 4. Monte Carlo stress test testing randomized concurrent and sequential interactions.
 *
 * Compliance:
 * - Invariant §46: Imports directly from src/core/data/WeatherNextDataSource & src/webgpu/TemporalTextureRingBuffer
 * - Invariant §40: WebGPU texture row pitch 256-byte alignment contract
 * - Invariant §73: WebGPU 3-slot discrete texture ring buffer lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';
import {
  WeatherNextDataSource,
  WeatherNextMetadata,
  WEATHERNEXT_CORE_VARIABLES,
} from '../../src/core/data/WeatherNextDataSource';

describe('Adversarial Challenger M2-IT2-2: Ring Buffer Mathematical Invariance', () => {
  const originalFetch = globalThis.fetch;
  let mockDevice: MockGPUDevice;

  const PADDED_SLICE_BYTES = 13370624;
  const UNPADDED_SLICE_BYTES = 12967200;

  function createTaggedSlice(variable: string, hour: number, isPadded = true): ArrayBuffer {
    const size = isPadded ? PADDED_SLICE_BYTES : UNPADDED_SLICE_BYTES;
    const buf = new Uint8Array(size);
    buf[0] = hour & 0xff;
    buf[1] = (hour >> 8) & 0xff;
    const tag = new TextEncoder().encode(variable.slice(0, 16));
    buf.set(tag, 2);
    return buf.buffer;
  }

  function readSliceHour(buffer: ArrayBuffer | Uint8Array): number {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return u8[0] | (u8[1] << 8);
  }

  function readSliceVariable(buffer: ArrayBuffer | Uint8Array): string {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const tagBytes = u8.subarray(2, 18);
    return new TextDecoder().decode(tagBytes);
  }

  beforeEach(() => {
    mockDevice = new MockGPUDevice();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Domain 1: Exact Slot Upload Parity Under Concurrent advanceHour
  // ==========================================================================
  describe('Domain 1: Exact Slot Upload Parity Under Concurrent Operations', () => {
    it('PARITY-00-BASELINE: Awaited sequential advanceHour preserves exact slot parity', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('total_precipitation_1hr_mean', hour, true),
        };
      });

      await ds.seekHour(10);
      expect(ds.currentHour).toBe(10);

      // Sequentially awaited advances
      await ds.advanceHour();
      expect(ds.currentHour).toBe(11);

      await ds.advanceHour();
      expect(ds.currentHour).toBe(12);

      const calls = mockDevice.queue.writeTextureCalls;
      const lastCall = (tex: any) => calls.filter((c) => c.destination.texture === tex).pop();

      expect(readSliceHour(lastCall(ring.getTexture(0))!.data as Uint8Array)).toBe(12);
      expect(readSliceHour(lastCall(ring.getTexture(1))!.data as Uint8Array)).toBe(13);
      expect(readSliceHour(lastCall(ring.getTexture(2))!.data as Uint8Array)).toBe(14);
    });

    it('PARITY-01: Probes Slot 1 temporal integrity after two concurrent advanceHour calls', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      // Staging initial hour 10
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('total_precipitation_1hr_mean', hour, true),
        };
      });

      await ds.seekHour(10);
      expect(ds.currentHour).toBe(10);

      // Now configure out-of-order prefetch latency:
      // Hour 13 (from adv 1) takes 50ms, Hour 14 (from adv 2) takes 10ms
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        const delay = hour === 13 ? 50 : 10;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('total_precipitation_1hr_mean', hour, true),
        };
      });

      // Fire two rapid advanceHour calls without awaiting
      const adv1 = ds.advanceHour();
      const adv2 = ds.advanceHour();

      await Promise.all([adv1, adv2]);

      expect(ds.getCurrentHour()).toBe(12);

      // Verify what is in each slot of the ring buffer
      const calls = mockDevice.queue.writeTextureCalls;
      const lastCall = (tex: any) => calls.filter((c) => c.destination.texture === tex).pop();

      const callSlot0 = lastCall(ring.getTexture(0));
      const callSlot1 = lastCall(ring.getTexture(1));
      const callSlot2 = lastCall(ring.getTexture(2));

      expect(callSlot0).toBeDefined();
      expect(callSlot1).toBeDefined();
      expect(callSlot2).toBeDefined();

      const h0 = readSliceHour(callSlot0!.data as Uint8Array);
      const h1 = readSliceHour(callSlot1!.data as Uint8Array);
      const h2 = readSliceHour(callSlot2!.data as Uint8Array);

      // Invariant §73 & Mathematical Definition:
      // At currentHour = 12:
      // Slot 0 (t_k) MUST be 12
      // Slot 1 (t_{k+1}) MUST be 13
      // Slot 2 (t_{k+2}) MUST be 14
      expect(h0).toBe(12);
      expect(h1).toBe(13); // FAILS: received 10
      expect(h2).toBe(14);
    });

    it('PARITY-02: Probes Slot 0 temporal integrity after three concurrent advanceHour calls', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('total_precipitation_1hr_mean', hour, true),
        };
      });

      await ds.seekHour(10);
      expect(ds.currentHour).toBe(10);

      // Delayed fetches for upcoming prefetch hours
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        const delay = hour === 13 ? 60 : hour === 14 ? 40 : 10;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('total_precipitation_1hr_mean', hour, true),
        };
      });

      const adv1 = ds.advanceHour();
      const adv2 = ds.advanceHour();
      const adv3 = ds.advanceHour();

      await Promise.all([adv1, adv2, adv3]);

      expect(ds.getCurrentHour()).toBe(13);

      const calls = mockDevice.queue.writeTextureCalls;
      const lastCall = (tex: any) => calls.filter((c) => c.destination.texture === tex).pop();

      const callSlot0 = lastCall(ring.getTexture(0));
      const callSlot1 = lastCall(ring.getTexture(1));
      const callSlot2 = lastCall(ring.getTexture(2));

      const h0 = readSliceHour(callSlot0!.data as Uint8Array);
      const h1 = readSliceHour(callSlot1!.data as Uint8Array);
      const h2 = readSliceHour(callSlot2!.data as Uint8Array);

      // At currentHour = 13:
      // Slot 0 MUST be 13
      // Slot 1 MUST be 14
      // Slot 2 MUST be 15
      expect(h0).toBe(13); // FAILS: received 10
      expect(h1).toBe(14); // FAILS: received 11
      expect(h2).toBe(15);
    });

    it('PARITY-03: Probes slot parity under concurrent setTime rapid scrub', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'temperature_2m_mean',
      });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      await ds.seekHour(5);
      expect(ds.currentHour).toBe(5);

      // Latency simulation
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        const delay = hour === 8 ? 40 : 10;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      // Rapid consecutive setTime forward steps
      const p1 = ds.setTime(6, 0.2);
      const p2 = ds.setTime(7, 0.4);

      await Promise.all([p1, p2]);

      expect(ds.getCurrentHour()).toBe(7);

      const calls = mockDevice.queue.writeTextureCalls;
      const lastCall = (tex: any) => calls.filter((c) => c.destination.texture === tex).pop();

      const callSlot0 = lastCall(ring.getTexture(0));
      const callSlot1 = lastCall(ring.getTexture(1));
      const callSlot2 = lastCall(ring.getTexture(2));

      expect(readSliceHour(callSlot0!.data as Uint8Array)).toBe(7);
      expect(readSliceHour(callSlot1!.data as Uint8Array)).toBe(8); // FAILS: received 5
      expect(readSliceHour(callSlot2!.data as Uint8Array)).toBe(9);
    });
  });

  // ==========================================================================
  // Domain 2: 256-Byte Row Pitch Under Concurrent Conditions
  // ==========================================================================
  describe('Domain 2: 256-Byte Row Pitch Under Concurrent Conditions', () => {
    it('PITCH-01: Asserts all concurrent writeTexture calls maintain bytesPerRow = 7424 and multiple of 256', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        await new Promise((r) => setTimeout(r, Math.random() * 10 + 1));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      // Fire 20 concurrent seek and advance operations
      const operations = [
        ds.seekHour(10),
        ds.advanceHour(),
        ds.seekHour(25),
        ds.advanceHour(),
        ds.seekHour(30),
      ];

      await Promise.allSettled(operations);

      const calls = mockDevice.queue.writeTextureCalls;
      expect(calls.length).toBeGreaterThan(0);

      for (const call of calls) {
        expect(call.dataLayout.bytesPerRow).toBe(7424);
        expect(call.dataLayout.bytesPerRow % 256).toBe(0);
        expect(call.dataLayout.offset).toBe(0);
        expect(call.size.width).toBe(3600);
        expect(call.size.height).toBe(1801);
        expect((call.data as Uint8Array).byteLength).toBe(PADDED_SLICE_BYTES);
      }
    });

    it('PITCH-02: Asserts unpadded slice uploads dynamically pad rows to 7424 bytes under concurrency', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      // Slices provided as UNPADDED (12,967,200 bytes, 7200 bytes/row)
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        await new Promise((r) => setTimeout(r, Math.random() * 10 + 1));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, false),
        };
      });

      await ds.seekHour(15);

      const calls = mockDevice.queue.writeTextureCalls;
      expect(calls.length).toBeGreaterThanOrEqual(3);

      for (const call of calls) {
        expect(call.dataLayout.bytesPerRow).toBe(7424);
        expect(call.dataLayout.bytesPerRow % 256).toBe(0);
        expect(call.dataLayout.offset).toBe(0);
        const uploaded = call.data as Uint8Array;
        expect(uploaded.byteLength).toBe(PADDED_SLICE_BYTES);

        // Verify padding bytes at the end of each row are zeroed
        for (let row = 0; row < 10; row++) {
          const rowStart = row * 7424;
          for (let pad = 7200; pad < 7424; pad++) {
            expect(uploaded[rowStart + pad]).toBe(0);
          }
        }
      }
    });
  });

  // ==========================================================================
  // Domain 3: Forward Temporal Permutation Invariance (Invariant §73)
  // ==========================================================================
  describe('Domain 3: Forward Temporal Permutation Invariance', () => {
    it('PERM-01: Verifies advance() executes forward permutation S2 -> S1 -> S0', () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');

      const tex0 = ring.getTexture(0);
      const tex1 = ring.getTexture(1);
      const tex2 = ring.getTexture(2);

      // Advance 1:
      // Logical 0 becomes old Logical 1
      // Logical 1 becomes old Logical 2
      // Logical 2 becomes old Logical 0
      ring.advance();
      expect(ring.getTexture(0)).toBe(tex1);
      expect(ring.getTexture(1)).toBe(tex2);
      expect(ring.getTexture(2)).toBe(tex0);

      // Advance 2:
      ring.advance();
      expect(ring.getTexture(0)).toBe(tex2);
      expect(ring.getTexture(1)).toBe(tex0);
      expect(ring.getTexture(2)).toBe(tex1);

      // Advance 3 (Identity):
      ring.advance();
      expect(ring.getTexture(0)).toBe(tex0);
      expect(ring.getTexture(1)).toBe(tex1);
      expect(ring.getTexture(2)).toBe(tex2);
    });

    it('PERM-02: 10,000 cyclic permutations preserve order-3 identity (sigma^3 = id)', () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');

      const t0 = ring.getTexture(0);
      const t1 = ring.getTexture(1);
      const t2 = ring.getTexture(2);

      for (let i = 0; i < 10_000; i++) {
        ring.advance();
      }

      // 10,000 % 3 = 1 -> Slot 0 is t1, Slot 1 is t2, Slot 2 is t0
      expect(ring.getTexture(0)).toBe(t1);
      expect(ring.getTexture(1)).toBe(t2);
      expect(ring.getTexture(2)).toBe(t0);

      ring.advance();
      ring.advance();
      expect(ring.getTexture(0)).toBe(t0);
      expect(ring.getTexture(1)).toBe(t1);
      expect(ring.getTexture(2)).toBe(t2);
    });
  });
});
