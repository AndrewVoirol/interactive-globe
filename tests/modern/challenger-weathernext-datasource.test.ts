/**
 * tests/modern/challenger-weathernext-datasource.test.ts
 *
 * Adversarial Challenger Empirical Stress-Test Suite for WeatherNextDataSource.
 * Probes:
 * 1. Concurrent / interleaved seekHour calls (rapid scrubbing race conditions).
 * 2. Cache eviction under high load (FIFO capacity, churn, memory stability).
 * 3. Thundering herd protection (massive concurrency on identical slices & cleanout on failure).
 * 4. Network failure recovery and boundary hour conditions (hours 0, 46, 47, -1, 48, NaN, corrupt slices).
 *
 * Compliance:
 * - Invariant §46: Imports directly from src/core/data/WeatherNextDataSource & src/webgpu/TemporalTextureRingBuffer
 * - Rule 46: Real execution of production entry points, zero shadow duplicate functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';
import {
  WeatherNextDataSource,
  WeatherNextMetadata,
  WEATHERNEXT_CORE_VARIABLES,
} from '../../src/core/data/WeatherNextDataSource';

describe('Adversarial Challenge: WeatherNextDataSource', () => {
  const originalFetch = globalThis.fetch;
  let mockDevice: MockGPUDevice;

  const PADDED_SLICE_BYTES = 13370624;
  const UNPADDED_SLICE_BYTES = 12967200;

  const MOCK_METADATA: WeatherNextMetadata = {
    source: 'Google DeepMind WeatherNext 3',
    model: 'weathernext_3_0_0_statistics',
    dataset: 'gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/2026_to_present/',
    forecastInitTimestamp: '2026-09-11T18:00:00Z',
    forecastRunCycle: '20260911_18hr_01_preds',
    ingestedAtUTC: '2026-09-12T00:00:00Z',
    billingProject: 'antigravity-agent-1765655548',
    gridDimensions: {
      width: 3600,
      height: 1801,
      lonPoints: 3600,
      latPoints: 1801,
      resolutionDeg: 0.1,
      latMin: -90.0,
      latMax: 90.0,
      lonMin: -180.0,
      lonMax: 179.9,
    },
    timeHorizon: {
      startHour: 0,
      endHour: 47,
      stepHours: 1,
      totalHours: 48,
    },
    validPredictionHours: Array.from({ length: 48 }, (_, i) => i),
    variables: [...WEATHERNEXT_CORE_VARIABLES],
    variableMetadata: {
      temperature_2m_mean: { units: 'K', longName: '2m Ambient Surface Temperature' },
      total_precipitation_1hr_mean: { units: 'kg/m^2', longName: 'Accumulated Precipitation Rate' },
    },
    textureEncoding: {
      format: 'r16float',
      bytesPerTexel: 2,
      rawRowBytes: 7200,
      paddedRowBytes: 7424,
      paddingBytesPerRow: 224,
      isPrePadded: true,
      sliceByteLength: 12967200,
      paddedSliceByteLength: 13370624,
    },
    filePattern: '/data/weathernext/{variable}-{hour}.bin',
  };

  /**
   * Generates a synthetic pre-padded slice tagged with variable hash and hour.
   */
  function createTaggedSlice(variable: string, hour: number, isPadded = true): ArrayBuffer {
    const size = isPadded ? PADDED_SLICE_BYTES : UNPADDED_SLICE_BYTES;
    const buf = new Uint8Array(size);
    // Tag hour in first 2 bytes
    buf[0] = hour & 0xff;
    buf[1] = (hour >> 8) & 0xff;
    // Tag variable identity in next bytes
    const tag = new TextEncoder().encode(variable.slice(0, 16));
    buf.set(tag, 2);
    return buf.buffer;
  }

  function readSliceHour(buffer: ArrayBuffer | Uint8Array): number {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return u8[0] | (u8[1] << 8);
  }

  beforeEach(() => {
    mockDevice = new MockGPUDevice();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Concurrent / Interleaved seekHour & Rapid Scrubbing
  // ==========================================================================
  describe('Suite 1: Concurrent / Interleaved seekHour & Rapid Scrubbing Race Conditions', () => {
    it('ADV-SEEK-01: Rapid Scrubbing Burst (50 concurrent seekHour calls with randomized latency)', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      // Mock fetch with artificial random delay between 1ms and 20ms
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const variable = match ? match[1] : 'total_precipitation_1hr_mean';
        const hour = match ? parseInt(match[2], 10) : 0;
        const delay = Math.floor(Math.random() * 15) + 1;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice(variable, hour, true),
        };
      });

      // Rapidly fire 50 seekHour calls mimicking erratic timeline scrubber dragging
      const targetHours = [
        3, 8, 14, 2, 29, 35, 11, 40, 5, 22,
        17, 31, 6, 45, 19, 28, 4, 33, 12, 38,
        7, 24, 15, 41, 9, 26, 18, 36, 1, 23,
        13, 30, 10, 44, 16, 27, 21, 39, 0, 34,
        8, 25, 14, 42, 20, 37, 2, 32, 11, 42, // Final seek is hour 42
      ];

      const promises = targetHours.map((h) => ds.seekHour(h, 'total_precipitation_1hr_mean'));
      await Promise.allSettled(promises);

      // Current hour must strictly match the final requested seekHour (42)
      expect(ds.getCurrentHour()).toBe(42);

      // Verify that the uploads on the ring buffer reflect hour 42, 43, 44
      // Inspect writeTextureCalls targeting ring slots
      const calls = mockDevice.queue.writeTextureCalls;
      expect(calls.length).toBeGreaterThanOrEqual(3);

      // Find the last upload for each slot texture
      const tex0 = ring.getTexture(0);
      const tex1 = ring.getTexture(1);
      const tex2 = ring.getTexture(2);

      const lastCallSlot0 = calls.filter((c) => c.destination.texture === tex0).pop();
      const lastCallSlot1 = calls.filter((c) => c.destination.texture === tex1).pop();
      const lastCallSlot2 = calls.filter((c) => c.destination.texture === tex2).pop();

      expect(lastCallSlot0).toBeDefined();
      expect(lastCallSlot1).toBeDefined();
      expect(lastCallSlot2).toBeDefined();

      expect(readSliceHour(lastCallSlot0!.data as Uint8Array)).toBe(42);
      expect(readSliceHour(lastCallSlot1!.data as Uint8Array)).toBe(43);
      expect(readSliceHour(lastCallSlot2!.data as Uint8Array)).toBe(44);
    });

    it('ADV-SEEK-02: Latency Inversion Race (earlier seek slow, later seek fast)', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const variable = match ? match[1] : 'total_precipitation_1hr_mean';
        const hour = match ? parseInt(match[2], 10) : 0;
        // Hour 5 takes 40ms, hour 20 takes 5ms
        const delay = hour >= 5 && hour <= 7 ? 40 : 5;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice(variable, hour, true),
        };
      });

      // Seek 5 launched first (slow)
      const seek5 = ds.seekHour(5, 'temperature_2m_mean');
      // Seek 20 launched immediately after (fast)
      const seek20 = ds.seekHour(20, 'temperature_2m_mean');

      await Promise.all([seek5, seek20]);

      // State must be hour 20
      expect(ds.getCurrentHour()).toBe(20);

      const tex0 = ring.getTexture(0);
      const calls = mockDevice.queue.writeTextureCalls;
      const lastCallSlot0 = calls.filter((c) => c.destination.texture === tex0).pop();

      // Slot 0 MUST be hour 20, never overwritten by the late-resolving hour 5
      expect(readSliceHour(lastCallSlot0!.data as Uint8Array)).toBe(20);
    });

    it('ADV-SEEK-03: Variable switch race under latency inversion', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const variable = match ? match[1] : 'dewpoint_temperature_2m_mean';
        const hour = match ? parseInt(match[2], 10) : 0;
        // dewpoint is slow (40ms), wind is fast (5ms)
        const delay = variable === 'dewpoint_temperature_2m_mean' ? 40 : 5;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice(variable, hour, true),
        };
      });

      const p1 = ds.seekHour(10, 'dewpoint_temperature_2m_mean');
      const p2 = ds.seekHour(25, 'u_component_of_wind_10m_mean');

      await Promise.all([p1, p2]);

      expect(ds.getCurrentHour()).toBe(25);
      expect(ds.getActiveVariable()).toBe('u_component_of_wind_10m_mean');

      const tex0 = ring.getTexture(0);
      const lastCall = mockDevice.queue.writeTextureCalls
        .filter((c) => c.destination.texture === tex0)
        .pop();

      expect(readSliceHour(lastCall!.data as Uint8Array)).toBe(25);
    });

    it('ADV-SEEK-04: Stale failure in obsolete seekHour does not break newer seekHour', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        if (hour === 1 || hour === 2 || hour === 3) {
          // Obsolete seekHour(1) fails with network error
          await new Promise((r) => setTimeout(r, 20));
          return { ok: false, status: 500, statusText: 'Server Error' };
        }
        await new Promise((r) => setTimeout(r, 5));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      const p1 = ds.seekHour(1, 'temperature_2m_mean');
      const p2 = ds.seekHour(15, 'temperature_2m_mean');

      const [res1, res2] = await Promise.allSettled([p1, p2]);

      expect(res1.status).toBe('rejected');
      expect(res2.status).toBe('fulfilled');
      expect(ds.getCurrentHour()).toBe(15);
    });

    it('ADV-SEEK-05: advanceHour prefetch race condition check with subsequent seekHour', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      // Initial seek to hour 10
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

      // Now set up fetch where prefetch (hour 13) has a delay of 50ms,
      // but seekHour(30) (hours 30, 31, 32) takes only 5ms.
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        const delay = hour === 13 ? 50 : 5;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('total_precipitation_1hr_mean', hour, true),
        };
      });

      // 1. Trigger advanceHour() (advances to 11, starts prefetch for 13 with 50ms delay)
      const advancePromise = ds.advanceHour();

      // 2. User scrubs to hour 30 while advanceHour is fetching prefetch
      await new Promise((r) => setTimeout(r, 10)); // wait 10ms
      const seekPromise = ds.seekHour(30);

      await Promise.all([advancePromise, seekPromise]);

      // After both settle, ds.currentHour MUST be 30
      expect(ds.getCurrentHour()).toBe(30);

      // Inspect Slot 2 texture:
      // Does Slot 2 contain slice 32 (from seekHour 30) or did the delayed advanceHour
      // overwrite Slot 2 with slice 13?
      const tex2 = ring.getTexture(2);
      const callsForTex2 = mockDevice.queue.writeTextureCalls.filter(
        (c) => c.destination.texture === tex2
      );
      const lastCallSlot2 = callsForTex2[callsForTex2.length - 1];

      // Verification: Slot 2 must be hour 32!
      const finalHourInSlot2 = readSliceHour(lastCallSlot2.data as Uint8Array);
      expect(finalHourInSlot2).toBe(32);
    });

    it('ADV-SEEK-07: advanceHour prefetch does not contaminate ring buffer after setActiveVariable', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      // Initial seek to hour 10 with precipitation
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const variable = match ? match[1] : 'total_precipitation_1hr_mean';
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice(variable, hour, true),
        };
      });

      await ds.seekHour(10, 'total_precipitation_1hr_mean');

      // Now prefetch for advanceHour has 50ms delay
      // but setActiveVariable('u_component_of_wind_10m_mean') takes 5ms
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const variable = match ? match[1] : 'total_precipitation_1hr_mean';
        const hour = match ? parseInt(match[2], 10) : 0;
        const delay = variable === 'total_precipitation_1hr_mean' && hour === 13 ? 50 : 5;
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice(variable, hour, true),
        };
      });

      const advancePromise = ds.advanceHour();

      // User switches to wind variable shortly after
      await new Promise((r) => setTimeout(r, 10));
      const varSwitchPromise = ds.setActiveVariable('u_component_of_wind_10m_mean');

      await Promise.all([advancePromise, varSwitchPromise]);

      expect(ds.getActiveVariable()).toBe('u_component_of_wind_10m_mean');

      // Check slot 2: must contain wind data, NOT precipitation!
      const tex2 = ring.getTexture(2);
      const callsForTex2 = mockDevice.queue.writeTextureCalls.filter(
        (c) => c.destination.texture === tex2
      );
      const lastCallSlot2 = callsForTex2[callsForTex2.length - 1];

      // Read variable tag from bytes 2..10
      const tagBytes = (lastCallSlot2.data as Uint8Array).subarray(2, 18);
      const tagStr = new TextDecoder().decode(tagBytes);

      expect(tagStr).toContain('u_component_of_w');
    });

    it('ADV-SEEK-08: Consecutive rapid advanceHour calls do not corrupt Slot 2 under out-of-order prefetch resolution', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      // Initial seek to hour 10
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

      // Now call advanceHour twice in rapid succession:
      // Call 1: advance to 11, prefetches hour 13 (takes 50ms)
      // Call 2: advance to 12, prefetches hour 14 (takes 10ms)
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

      const adv1 = ds.advanceHour();
      const adv2 = ds.advanceHour();

      await Promise.all([adv1, adv2]);

      expect(ds.getCurrentHour()).toBe(12);

      // Check slot 2: must contain hour 14 (from call 2), NOT hour 13 (from call 1)!
      const tex2 = ring.getTexture(2);
      const callsForTex2 = mockDevice.queue.writeTextureCalls.filter(
        (c) => c.destination.texture === tex2
      );
      const lastCallSlot2 = callsForTex2[callsForTex2.length - 1];

      const finalHourInSlot2 = readSliceHour(lastCallSlot2.data as Uint8Array);
      expect(finalHourInSlot2).toBe(14);
    });

    it('ADV-SEEK-06: Disposal during in-flight seekHour bursts executes cleanly', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', 0, true),
        };
      });

      const promises = [
        ds.seekHour(2),
        ds.seekHour(5),
        ds.seekHour(10),
      ];

      // Dispose while requests in flight
      await new Promise((r) => setTimeout(r, 5));
      ds.dispose();

      expect(ds.disposed).toBe(true);
      expect(ring.disposed).toBe(true);

      // All in-flight promises must settle without crashing
      await expect(Promise.allSettled(promises)).resolves.toBeDefined();
    });
  });

  // ==========================================================================
  // Suite 2: Cache Eviction Under High Load
  // ==========================================================================
  describe('Suite 2: Cache Eviction Under High Load', () => {
    it('ADV-CACHE-01: Strict FIFO Eviction Capacity under 50-slice Churn', async () => {
      const maxCached = 6;
      const ds = new WeatherNextDataSource({ maxCachedSlices: maxCached });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      // Sequentially fetch 30 unique slices (hours 0 to 29)
      for (let h = 0; h < 30; h++) {
        await ds.getSlice('temperature_2m_mean', h);
        const cacheSize = (ds as any).sliceCache.size;
        expect(cacheSize).toBeLessThanOrEqual(maxCached);
      }

      // Final cache size must be exactly maxCached
      expect((ds as any).sliceCache.size).toBe(maxCached);

      // Oldest slices (0..23) must have been evicted; newest (24..29) retained
      for (let h = 0; h < 24; h++) {
        expect((ds as any).sliceCache.has(`temperature_2m_mean-${h}`)).toBe(false);
      }
      for (let h = 24; h < 30; h++) {
        expect((ds as any).sliceCache.has(`temperature_2m_mean-${h}`)).toBe(true);
      }
    });

    it('ADV-CACHE-02: Evicted Slice triggers Cache Miss and re-fetches from network', async () => {
      const ds = new WeatherNextDataSource({ maxCachedSlices: 3 });
      let fetchCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchCount++;
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      // Fetch hours 0, 1, 2
      await ds.getSlice('temperature_2m_mean', 0);
      await ds.getSlice('temperature_2m_mean', 1);
      await ds.getSlice('temperature_2m_mean', 2);
      expect(fetchCount).toBe(3);

      // Fetch hour 3 -> evicts hour 0
      await ds.getSlice('temperature_2m_mean', 3);
      expect(fetchCount).toBe(4);
      expect((ds as any).sliceCache.has('temperature_2m_mean-0')).toBe(false);

      // Request hour 1 -> in cache, zero fetch
      await ds.getSlice('temperature_2m_mean', 1);
      expect(fetchCount).toBe(4);

      // Request hour 0 again -> evicted, triggers fetch
      await ds.getSlice('temperature_2m_mean', 0);
      expect(fetchCount).toBe(5);
    });

    it('ADV-CACHE-03: Single-Entry Extreme Cache (maxCachedSlices: 1)', async () => {
      const ds = new WeatherNextDataSource({ maxCachedSlices: 1 });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      await ds.getSlice('temperature_2m_mean', 0);
      expect((ds as any).sliceCache.size).toBe(1);
      expect((ds as any).sliceCache.has('temperature_2m_mean-0')).toBe(true);

      await ds.getSlice('temperature_2m_mean', 1);
      expect((ds as any).sliceCache.size).toBe(1);
      expect((ds as any).sliceCache.has('temperature_2m_mean-0')).toBe(false);
      expect((ds as any).sliceCache.has('temperature_2m_mean-1')).toBe(true);
    });

    it('ADV-CACHE-04: High-Load Multi-Variable Churn (6 variables x 20 hours)', async () => {
      const maxCapacity = 12;
      const ds = new WeatherNextDataSource({ maxCachedSlices: maxCapacity });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const variable = match ? match[1] : 'total_precipitation_1hr_mean';
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice(variable, hour, true),
        };
      });

      // Interleave fetches across all 6 core variables for hours 0..19 (120 fetches)
      for (let h = 0; h < 20; h++) {
        for (const v of WEATHERNEXT_CORE_VARIABLES) {
          await ds.getSlice(v, h);
        }
      }

      expect((ds as any).sliceCache.size).toBe(maxCapacity);
    });

    it('ADV-CACHE-05: Concurrent requests exceeding cache capacity remain strictly bounded', async () => {
      const maxCapacity = 4;
      const ds = new WeatherNextDataSource({ maxCachedSlices: maxCapacity });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        await new Promise((r) => setTimeout(r, Math.random() * 10 + 1));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      // Fire 30 distinct hour requests concurrently
      const promises = Array.from({ length: 30 }, (_, h) =>
        ds.getSlice('temperature_2m_mean', h)
      );

      await Promise.all(promises);

      expect((ds as any).sliceCache.size).toBeLessThanOrEqual(maxCapacity);
    });

    it('ADV-CACHE-06: clearCache() cleans all resident buffers and pending maps', async () => {
      const ds = new WeatherNextDataSource({ maxCachedSlices: 10 });

      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', 0, true),
      }));

      await ds.getSlice('temperature_2m_mean', 0);
      await ds.getSlice('temperature_2m_mean', 1);
      expect((ds as any).sliceCache.size).toBe(2);

      ds.clearCache();
      expect((ds as any).sliceCache.size).toBe(0);
      expect((ds as any).pendingRequests.size).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 3: Thundering Herd Protection
  // ==========================================================================
  describe('Suite 3: Thundering Herd Protection', () => {
    it('ADV-HERD-01: 100 concurrent requests for identical slice invoke fetch exactly ONCE', async () => {
      let networkCalls = 0;
      const syntheticBuffer = createTaggedSlice('temperature_2m_mean', 12, true);

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        networkCalls++;
        await new Promise((r) => setTimeout(r, 20)); // simulated latency
        return {
          ok: true,
          arrayBuffer: async () => syntheticBuffer,
        };
      });

      const ds = new WeatherNextDataSource();

      // Fire 100 callers concurrently
      const callers = Array.from({ length: 100 }, () =>
        ds.getSlice('temperature_2m_mean', 12)
      );

      const results = await Promise.all(callers);

      // Network fetch must be called exactly 1 time
      expect(networkCalls).toBe(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // All 100 callers must receive the exact identical ArrayBuffer instance
      for (const res of results) {
        expect(res).toBe(syntheticBuffer);
      }
    });

    it('ADV-HERD-02: Matrix Thundering Herd (10 distinct slices x 20 callers = 200 concurrent requests)', async () => {
      let networkCalls = 0;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        networkCalls++;
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const variable = match ? match[1] : 'temperature_2m_mean';
        const hour = match ? parseInt(match[2], 10) : 0;
        await new Promise((r) => setTimeout(r, 15));
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice(variable, hour, true),
        };
      });

      const ds = new WeatherNextDataSource();

      // 10 distinct slices (hours 0..9)
      // 20 callers each -> 200 total callers
      const allPromises: Promise<ArrayBuffer>[] = [];
      for (let h = 0; h < 10; h++) {
        for (let c = 0; c < 20; c++) {
          allPromises.push(ds.getSlice('temperature_2m_mean', h));
        }
      }

      const results = await Promise.all(allPromises);

      // Network fetch must be called exactly 10 times (1 per unique slice)
      expect(networkCalls).toBe(10);
      expect(results).toHaveLength(200);

      // Verify each caller got the correct slice
      for (let i = 0; i < 200; i++) {
        const expectedHour = Math.floor(i / 20);
        expect(readSliceHour(results[i])).toBe(expectedHour);
      }
    });

    it('ADV-HERD-03: Thundering herd network rejection cleanly purges pendingRequests and allows retry', async () => {
      let networkCalls = 0;

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        networkCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return { ok: false, status: 504, statusText: 'Gateway Timeout' };
      });

      const ds = new WeatherNextDataSource();

      // 50 concurrent callers request the same failing slice
      const callers = Array.from({ length: 50 }, () =>
        ds.getSlice('total_precipitation_1hr_mean', 5)
      );

      const results = await Promise.allSettled(callers);

      // Exactly 1 network call attempted
      expect(networkCalls).toBe(1);

      // All 50 callers rejected
      for (const res of results) {
        expect(res.status).toBe('rejected');
      }

      // Pending map must be completely clean (not poisoned with rejected promise)
      expect((ds as any).pendingRequests.has('total_precipitation_1hr_mean-5')).toBe(false);
      expect((ds as any).sliceCache.has('total_precipitation_1hr_mean-5')).toBe(false);

      // Immediate retry with recovered network must succeed and initiate a NEW fetch
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        networkCalls++;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('total_precipitation_1hr_mean', 5, true),
        };
      });

      const retryRes = await ds.getSlice('total_precipitation_1hr_mean', 5);
      expect(retryRes).toBeDefined();
      expect(readSliceHour(retryRes)).toBe(5);
      expect(networkCalls).toBe(2);
    });
  });

  // ==========================================================================
  // Suite 4: Network Failure Recovery & Boundary Hour Conditions
  // ==========================================================================
  describe('Suite 4: Network Failure Recovery & Boundary Hour Conditions', () => {
    it('ADV-BOUND-01: Boundary Hour 0 stages hours 0, 1, 2 without negative indexing', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      const requestedHours: number[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        requestedHours.push(hour);
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      await ds.seekHour(0, 'temperature_2m_mean');

      expect(ds.getCurrentHour()).toBe(0);
      expect(requestedHours.sort()).toEqual([0, 1, 2]);

      const tex0 = ring.getTexture(0);
      const tex1 = ring.getTexture(1);
      const tex2 = ring.getTexture(2);

      const calls = mockDevice.queue.writeTextureCalls;
      const c0 = calls.find((c) => c.destination.texture === tex0);
      const c1 = calls.find((c) => c.destination.texture === tex1);
      const c2 = calls.find((c) => c.destination.texture === tex2);

      expect(readSliceHour(c0!.data as Uint8Array)).toBe(0);
      expect(readSliceHour(c1!.data as Uint8Array)).toBe(1);
      expect(readSliceHour(c2!.data as Uint8Array)).toBe(2);
    });

    it('ADV-BOUND-02: Boundary Hour 46 clamps prefetch to 47 and does not request 48', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      const requestedUrls: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrls.push(url);
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        if (hour > 47) {
          throw new Error(`Out of bounds network request: ${url}`);
        }
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      await ds.seekHour(46, 'temperature_2m_mean');

      expect(ds.getCurrentHour()).toBe(46);
      expect(requestedUrls.some((u) => u.includes('-48.bin'))).toBe(false);

      const tex0 = ring.getTexture(0);
      const tex1 = ring.getTexture(1);
      const tex2 = ring.getTexture(2);

      const calls = mockDevice.queue.writeTextureCalls;
      const c0 = calls.find((c) => c.destination.texture === tex0);
      const c1 = calls.find((c) => c.destination.texture === tex1);
      const c2 = calls.find((c) => c.destination.texture === tex2);

      expect(readSliceHour(c0!.data as Uint8Array)).toBe(46);
      expect(readSliceHour(c1!.data as Uint8Array)).toBe(47);
      expect(readSliceHour(c2!.data as Uint8Array)).toBe(47); // Clamped
    });

    it('ADV-BOUND-03: Boundary Hour 47 terminal staging clamps all 3 slots to hour 47', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      let fetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchCount++;
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      await ds.seekHour(47, 'temperature_2m_mean');

      expect(ds.getCurrentHour()).toBe(47);
      // Hour 47 fetched only ONCE because all 3 slots ask for hour 47 and deduplicate
      expect(fetchCount).toBe(1);

      const tex0 = ring.getTexture(0);
      const tex1 = ring.getTexture(1);
      const tex2 = ring.getTexture(2);

      const calls = mockDevice.queue.writeTextureCalls;
      const c0 = calls.find((c) => c.destination.texture === tex0);
      const c1 = calls.find((c) => c.destination.texture === tex1);
      const c2 = calls.find((c) => c.destination.texture === tex2);

      expect(readSliceHour(c0!.data as Uint8Array)).toBe(47);
      expect(readSliceHour(c1!.data as Uint8Array)).toBe(47);
      expect(readSliceHour(c2!.data as Uint8Array)).toBe(47);
    });

    it('ADV-BOUND-04: Out-of-bounds hours in seekHour clamp safely without throwing', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      // Negative hours clamp to 0
      await ds.seekHour(-1);
      expect(ds.getCurrentHour()).toBe(0);

      await ds.seekHour(-100);
      expect(ds.getCurrentHour()).toBe(0);

      // Oversized hours clamp to 47
      await ds.seekHour(48);
      expect(ds.getCurrentHour()).toBe(47);

      await ds.seekHour(1000);
      expect(ds.getCurrentHour()).toBe(47);

      // Fractional hour floors
      await ds.seekHour(12.9);
      expect(ds.getCurrentHour()).toBe(12);
    });

    it('ADV-BOUND-05: Out-of-bounds hours in getSlice throw RangeError strictly', async () => {
      const ds = new WeatherNextDataSource();

      await expect(ds.getSlice('temperature_2m_mean', -1)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', -99)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', 48)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', 100)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', 1.5)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', NaN)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', Infinity)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', -Infinity)).rejects.toThrow(RangeError);
    });

    it('ADV-BOUND-06: setTime clamps out-of-bounds hours and handles boundary tau progression', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', hour, true),
        };
      });

      await ds.setTime(-5, 0.5);
      expect(ds.getCurrentHour()).toBe(0);

      await ds.setTime(55, 0.5);
      expect(ds.getCurrentHour()).toBe(47);

      // Intra-hour at boundary hour 47
      mockDevice.queue.writeTextureCalls = [];
      await ds.setTime(47, 0.9);
      expect(mockDevice.queue.writeTextureCalls).toHaveLength(0);
    });

    it('ADV-BOUND-07: Network failure recovery allows subsequent seekHour retry to succeed', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      let shouldFail = true;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        if (shouldFail) {
          throw new TypeError('Network connection reset');
        }
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', 5, true),
        };
      });

      // First two calls fail
      shouldFail = true;
      await expect(ds.seekHour(5)).rejects.toThrow(/Network connection reset/);
      await expect(ds.seekHour(5)).rejects.toThrow(/Network connection reset/);

      // Network recovers -> third call succeeds
      shouldFail = false;
      await expect(ds.seekHour(5)).resolves.not.toThrow();
      expect(ds.getCurrentHour()).toBe(5);
    });

    it('ADV-BOUND-08: Corrupted slice payload does not poison cache and allows clean retry', async () => {
      const ds = new WeatherNextDataSource();
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Truncated buffer (1024 bytes vs required 12,967,200)
          return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(1024),
          };
        }
        return {
          ok: true,
          arrayBuffer: async () => createTaggedSlice('temperature_2m_mean', 0, true),
        };
      });

      // First call throws due to insufficient length
      await expect(ds.getSlice('temperature_2m_mean', 0)).rejects.toThrow(
        /Insufficient data length/i
      );

      // Cache must not contain corrupted buffer
      expect((ds as any).sliceCache.has('temperature_2m_mean-0')).toBe(false);

      // Second call with valid data succeeds
      const validBuf = await ds.getSlice('temperature_2m_mean', 0);
      expect(validBuf.byteLength).toBe(PADDED_SLICE_BYTES);
    });
  });
});
