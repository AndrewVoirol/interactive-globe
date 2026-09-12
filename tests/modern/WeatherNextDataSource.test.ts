/**
 * tests/modern/WeatherNextDataSource.test.ts
 *
 * Comprehensive behavioral unit test suite for WeatherNextDataSource (Milestone 2 Gate).
 * Validates:
 * 1. Loading & parsing of meta.json metadata schema
 * 2. On-demand binary slice fetching & in-memory caching
 * 3. TemporalTextureRingBuffer integration & 3-slot staging (Slot 0, Slot 1, Slot 2)
 * 4. WebGPU 256-byte row pitch compliance (7424 bytes/row vs 7200 raw bytes)
 * 5. Chronological advance, cyclic slot rotation, and background prefetching
 * 6. Error handling for invalid hours, missing files, network failures, and lifecycle disposal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';
import {
  WeatherNextDataSource,
  WeatherNextMetadata,
} from '../../src/core/data/WeatherNextDataSource';

describe('WeatherNextDataSource Unit Test Suite', () => {
  const originalFetch = globalThis.fetch;
  let mockDevice: MockGPUDevice;

  // Canonical mock metadata matching scripts/fetch-weathernext3.py
  const MOCK_METADATA: WeatherNextMetadata = {
    source: 'Google DeepMind WeatherNext 3',
    model: 'weathernext_3_0_0_statistics',
    dataset:
      'gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/2026_to_present/',
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
    variables: [
      'u_component_of_wind_10m_mean',
      'v_component_of_wind_10m_mean',
      'total_precipitation_1hr_mean',
      'temperature_2m_mean',
      'dewpoint_temperature_2m_mean',
      'total_cloud_cover_mean',
    ],
    variableMetadata: {
      temperature_2m_mean: { units: '°C', longName: '2m Ambient Surface Temperature' },
      total_precipitation_1hr_mean: {
        units: 'kg/m^2',
        longName: 'Accumulated Precipitation Rate',
      },
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
    provenance: {
      chunkShape: [1, 1801, 3600],
      sourceDtype: 'float32',
      outputDtype: 'float16',
      latitudeOrientation: 'row_0_north_inverted',
      longitudeOrientation: 'col_0_antimeridian_rolled_1800',
    },
  };

  const PADDED_SLICE_BYTES = 13370624;
  const UNPADDED_SLICE_BYTES = 12967200;

  /**
   * Helper to generate a deterministic synthetic slice buffer.
   */
  function createSyntheticSlice(isPadded: boolean, markerByte: number = 0x42): ArrayBuffer {
    const size = isPadded ? PADDED_SLICE_BYTES : UNPADDED_SLICE_BYTES;
    const buf = new Uint8Array(size);
    buf.fill(markerByte, 0, Math.min(1024, size));
    return buf.buffer;
  }

  beforeEach(() => {
    mockDevice = new MockGPUDevice();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Pillar 1: Metadata Ingestion & Parsing (meta.json)
  // ==========================================================================
  describe('Pillar 1: Metadata Ingestion & Parsing (meta.json)', () => {
    it('loads and parses meta.json successfully with full type compliance', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_METADATA,
      } as any);

      const ds = new WeatherNextDataSource();
      const meta = await ds.loadMetadata();

      expect(globalThis.fetch).toHaveBeenCalledWith('/data/weathernext/meta.json');
      expect(meta).toBeDefined();
      expect(meta.source).toBe('Google DeepMind WeatherNext 3');
      expect(meta.gridDimensions.width).toBe(3600);
      expect(meta.gridDimensions.height).toBe(1801);
      expect(meta.gridDimensions.resolutionDeg).toBe(0.1);
      expect(meta.timeHorizon.totalHours).toBe(48);
      expect(meta.validPredictionHours.length).toBe(48);
      expect(meta.textureEncoding.paddedRowBytes).toBe(7424);
      expect(meta.textureEncoding.rawRowBytes).toBe(7200);
      expect(meta.variables).toHaveLength(6);
      expect(ds.metadata).toEqual(meta);
    });

    it('supports custom metadata URL endpoint override', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_METADATA,
      } as any);

      const ds = new WeatherNextDataSource({ metaUrl: '/custom/weathernext/custom-meta.json' });
      await ds.loadMetadata();

      expect(globalThis.fetch).toHaveBeenCalledWith('/custom/weathernext/custom-meta.json');
    });

    it('caches parsed metadata so subsequent loadMetadata calls do not re-fetch', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_METADATA,
      } as any);
      globalThis.fetch = fetchSpy;

      const ds = new WeatherNextDataSource();
      await ds.loadMetadata();
      const secondMeta = await ds.loadMetadata();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(secondMeta).toEqual(MOCK_METADATA);
    });
  });

  // ==========================================================================
  // Pillar 2: Binary Slice Ingestion & In-Memory Caching (getSlice)
  // ==========================================================================
  describe('Pillar 2: Binary Slice Ingestion & In-Memory Caching (getSlice)', () => {
    it('fetches binary slice on demand from filePattern and returns ArrayBuffer', async () => {
      const slicePayload = createSyntheticSlice(true, 0x55);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => slicePayload,
      } as any);

      const ds = new WeatherNextDataSource();
      const result = await ds.getSlice('temperature_2m_mean', 0);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/data/weathernext/temperature_2m_mean-0.bin'
      );
      expect(result).toBe(slicePayload);
      expect(result.byteLength).toBe(PADDED_SLICE_BYTES);
    });

    it('in-memory caching: subsequent getSlice for same variable and hour returns cached buffer with 0 network calls', async () => {
      const slicePayload = createSyntheticSlice(true, 0x77);
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => slicePayload,
      } as any);
      globalThis.fetch = fetchSpy;

      const ds = new WeatherNextDataSource();
      const r1 = await ds.getSlice('total_precipitation_1hr_mean', 5);
      const r2 = await ds.getSlice('total_precipitation_1hr_mean', 5);
      const r3 = await ds.getSlice('total_precipitation_1hr_mean', 5);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(r1).toBe(slicePayload);
      expect(r2).toBe(slicePayload);
      expect(r3).toBe(slicePayload);
    });

    it('fetches and caches independent slices for distinct variables and hours', async () => {
      const sliceA = createSyntheticSlice(true, 0x01);
      const sliceB = createSyntheticSlice(true, 0x02);
      const sliceC = createSyntheticSlice(true, 0x03);

      const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('u_component') && url.includes('-0.bin'))
          return { ok: true, arrayBuffer: async () => sliceA };
        if (url.includes('v_component') && url.includes('-0.bin'))
          return { ok: true, arrayBuffer: async () => sliceB };
        if (url.includes('u_component') && url.includes('-1.bin'))
          return { ok: true, arrayBuffer: async () => sliceC };
        throw new Error(`Unexpected URL ${url}`);
      });
      globalThis.fetch = fetchSpy;

      const ds = new WeatherNextDataSource();
      const a = await ds.getSlice('u_component_of_wind_10m_mean', 0);
      const b = await ds.getSlice('v_component_of_wind_10m_mean', 0);
      const c = await ds.getSlice('u_component_of_wind_10m_mean', 1);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(a).toBe(sliceA);
      expect(b).toBe(sliceB);
      expect(c).toBe(sliceC);

      // Re-request all three: must be 100% cache hits
      await ds.getSlice('u_component_of_wind_10m_mean', 0);
      await ds.getSlice('v_component_of_wind_10m_mean', 0);
      await ds.getSlice('u_component_of_wind_10m_mean', 1);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('clearCache() flushes in-memory cache and triggers re-fetch on next call', async () => {
      const slicePayload = createSyntheticSlice(true, 0x99);
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => slicePayload,
      } as any);
      globalThis.fetch = fetchSpy;

      const ds = new WeatherNextDataSource();
      await ds.getSlice('total_cloud_cover_mean', 2);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      ds.clearCache();

      await ds.getSlice('total_cloud_cover_mean', 2);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('anti-thundering herd: concurrent requests for identical slice collapse into single in-flight fetch', async () => {
      const slicePayload = createSyntheticSlice(true, 0xaa);
      let resolvePromise: (val: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const fetchSpy = vi.fn().mockImplementation(() => delayedPromise);
      globalThis.fetch = fetchSpy;

      const ds = new WeatherNextDataSource();
      const p1 = ds.getSlice('temperature_2m_mean', 8);
      const p2 = ds.getSlice('temperature_2m_mean', 8);

      resolvePromise!({
        ok: true,
        status: 200,
        arrayBuffer: async () => slicePayload,
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(r1).toBe(slicePayload);
      expect(r2).toBe(slicePayload);
    });
  });

  // ==========================================================================
  // Pillar 3: TemporalTextureRingBuffer Integration & Staging Lifecycle
  // ==========================================================================
  describe('Pillar 3: TemporalTextureRingBuffer Integration & Staging Lifecycle', () => {
    it('binds TemporalTextureRingBuffer and verifies dimensions match WeatherNext grid (3600x1801, r16float)', () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource();
      ds.bindRingBuffer(ring);

      expect(ds.ringBuffer).toBe(ring);
      expect(ring.width).toBe(3600);
      expect(ring.height).toBe(1801);
      expect(ring.format).toBe('r16float');
      expect(ring.bytesPerRow).toBe(7424);
    });

    it('rejects invalid ring buffer binding with descriptive errors', () => {
      const ds = new WeatherNextDataSource();
      expect(() => ds.bindRingBuffer(null as any)).toThrow(/Cannot bind a null/i);

      const disposedRing = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      disposedRing.dispose();
      expect(() => ds.bindRingBuffer(disposedRing)).toThrow(/Cannot bind a null or disposed/i);

      const wrongDimensions = new TemporalTextureRingBuffer(mockDevice as any, 1024, 512, 'r16float');
      expect(() => ds.bindRingBuffer(wrongDimensions)).toThrow(RangeError);

      const wrongFormat = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'rgba8unorm');
      expect(() => ds.bindRingBuffer(wrongFormat)).toThrow(TypeError);
    });

    it('seekHour(k) stages Slot 0 (t_k), Slot 1 (t_{k+1}), and Slot 2 (t_{k+2})', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      const sliceH10 = createSyntheticSlice(true, 0x10);
      const sliceH11 = createSyntheticSlice(true, 0x11);
      const sliceH12 = createSyntheticSlice(true, 0x12);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('-10.bin')) return { ok: true, arrayBuffer: async () => sliceH10 };
        if (url.includes('-11.bin')) return { ok: true, arrayBuffer: async () => sliceH11 };
        if (url.includes('-12.bin')) return { ok: true, arrayBuffer: async () => sliceH12 };
        throw new Error(`Unexpected URL ${url}`);
      });

      await ds.seekHour(10);

      expect(mockDevice.queue.writeTextureCalls).toHaveLength(3);
      expect(mockDevice.queue.writeTextureCalls[0].destination.texture).toBe(ring.getTexture(0));
      expect(mockDevice.queue.writeTextureCalls[1].destination.texture).toBe(ring.getTexture(1));
      expect(mockDevice.queue.writeTextureCalls[2].destination.texture).toBe(ring.getTexture(2));
      expect(ds.currentHour).toBe(10);

      // Memory cleanup for Vitest report serialization
      mockDevice.queue.writeTextureCalls = [];
    });

    it('seekHour at forecast horizon boundary (hour 46 and 47) clamps staging without out-of-bounds fetch', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      const sliceH46 = createSyntheticSlice(true, 0x46);
      const sliceH47 = createSyntheticSlice(true, 0x47);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('-46.bin')) return { ok: true, arrayBuffer: async () => sliceH46 };
        if (url.includes('-47.bin')) return { ok: true, arrayBuffer: async () => sliceH47 };
        throw new Error(`Out of bounds fetch attempted: ${url}`);
      });

      // Hour 46: Slot 0 = 46, Slot 1 = 47, Slot 2 = clamped to 47
      await expect(ds.seekHour(46, 'temperature_2m_mean')).resolves.not.toThrow();
      expect(ds.currentHour).toBe(46);

      mockDevice.queue.writeTextureCalls = [];
    });
  });

  // ==========================================================================
  // Pillar 4: WebGPU 256-Byte Row Pitch Compliance (Invariant §40 & §73)
  // ==========================================================================
  describe('Pillar 4: WebGPU 256-Byte Row Pitch Compliance (Invariant §40 & §73)', () => {
    it('uploads pre-padded 13,370,624 byte Float16 slice with exact 7424-byte stride', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      const prePaddedSlice = createSyntheticSlice(true, 0x7a);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => prePaddedSlice,
      } as any);

      await ds.seekHour(0, 'temperature_2m_mean');

      const call = mockDevice.queue.writeTextureCalls[0];
      expect(call).toBeDefined();
      expect(call.dataLayout.bytesPerRow).toBe(7424);
      expect(call.dataLayout.bytesPerRow % 256).toBe(0);
      expect(call.dataLayout.rowsPerImage).toBe(1801);
      expect(call.size).toEqual({ width: 3600, height: 1801, depthOrArrayLayers: 1 });

      mockDevice.queue.writeTextureCalls = [];
    });

    it('uploads unpadded 12,967,200 byte Float16 slice and dynamically repacks to 7424 bytes/row with 224 zero padding bytes', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      const unpaddedSlice = new Uint8Array(UNPADDED_SLICE_BYTES);
      // Mark row 0 with 0x33
      unpaddedSlice.subarray(0, 7200).fill(0x33);
      // Mark row 1 with 0x44
      unpaddedSlice.subarray(7200, 14400).fill(0x44);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => unpaddedSlice.buffer,
      } as any);

      await ds.seekHour(0, 'u_component_of_wind_10m_mean');

      const call = mockDevice.queue.writeTextureCalls[0];
      expect(call).toBeDefined();
      const uploaded = call.data as Uint8Array;
      expect(uploaded.byteLength).toBe(PADDED_SLICE_BYTES);

      // Verify row 0 data preserved
      expect(uploaded[0]).toBe(0x33);
      expect(uploaded[7199]).toBe(0x33);

      // Verify row 0 padding [7200..7423] is strictly 0x00
      let nonZeroPaddingCount = 0;
      for (let b = 7200; b < 7424; b++) {
        if (uploaded[b] !== 0) nonZeroPaddingCount++;
      }
      expect(nonZeroPaddingCount).toBe(0);

      // Verify row 1 starts at offset 7424
      expect(uploaded[7424]).toBe(0x44);
      expect(uploaded[7424 + 7199]).toBe(0x44);

      mockDevice.queue.writeTextureCalls = [];
    });

    it('rejects undersized slice buffer below 12,967,200 bytes with Error', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      const corruptSlice = new ArrayBuffer(5000); // severely undersized
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => corruptSlice,
      } as any);

      await expect(ds.seekHour(0, 'temperature_2m_mean')).rejects.toThrow(
        /Insufficient data length/i
      );
    });
  });

  // ==========================================================================
  // Pillar 5: Chronological Advance, Slot Rotation & Background Prefetch
  // ==========================================================================
  describe('Pillar 5: Chronological Advance, Slot Rotation & Background Prefetch', () => {
    it('advanceHour() calls ringBuffer.advance() and prefetches hour (currentHour + 2) into recycled Slot 2', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'total_precipitation_1hr_mean',
      });

      const sliceH0 = createSyntheticSlice(true, 0x00);
      const sliceH1 = createSyntheticSlice(true, 0x01);
      const sliceH2 = createSyntheticSlice(true, 0x02);
      const sliceH3 = createSyntheticSlice(true, 0x03);

      const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('-0.bin')) return { ok: true, arrayBuffer: async () => sliceH0 };
        if (url.includes('-1.bin')) return { ok: true, arrayBuffer: async () => sliceH1 };
        if (url.includes('-2.bin')) return { ok: true, arrayBuffer: async () => sliceH2 };
        if (url.includes('-3.bin')) return { ok: true, arrayBuffer: async () => sliceH3 };
        throw new Error(`Unexpected URL ${url}`);
      });
      globalThis.fetch = fetchSpy;

      // 1. Initial seek to hour 0 -> stages 0, 1, 2
      await ds.seekHour(0);
      const initialTex0 = ring.getTexture(0);
      const initialTex1 = ring.getTexture(1);
      const initialTex2 = ring.getTexture(2);
      mockDevice.queue.writeTextureCalls = [];

      // 2. Advance to hour 1
      await ds.advanceHour();

      // Verify currentHour incremented
      expect(ds.currentHour).toBe(1);

      // Verify ring buffer slot rotation:
      // Logical Slot 0 now has initialTex1 (hour 1)
      // Logical Slot 1 now has initialTex2 (hour 2)
      // Logical Slot 2 now has initialTex0 (recycled)
      expect(ring.getTexture(0)).toBe(initialTex1);
      expect(ring.getTexture(1)).toBe(initialTex2);
      expect(ring.getTexture(2)).toBe(initialTex0);

      // Verify asynchronous background prefetch fetched hour 3 and uploaded to Slot 2
      expect(fetchSpy).toHaveBeenCalledWith(
        '/data/weathernext/total_precipitation_1hr_mean-3.bin'
      );
      expect(mockDevice.queue.writeTextureCalls).toHaveLength(1);
      expect(mockDevice.queue.writeTextureCalls[0].destination.texture).toBe(initialTex0);

      mockDevice.queue.writeTextureCalls = [];
    });

    it('simulates 12 continuous hourly advances verifying streaming stability with zero GPU reallocations', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({
        ringBuffer: ring,
        defaultVariable: 'temperature_2m_mean',
      });

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return { ok: true, arrayBuffer: async () => createSyntheticSlice(true, 0x11) };
      });

      await ds.seekHour(0);
      mockDevice.queue.writeTextureCalls = [];

      for (let h = 1; h <= 12; h++) {
        await ds.advanceHour();
        expect(ds.currentHour).toBe(h);
      }

      // Exactly 3 GPU textures allocated on GPUDevice from start to finish
      expect(mockDevice.textures).toHaveLength(3);
      mockDevice.queue.writeTextureCalls = [];
    });

    it('setTime(bracketHour, tau) handles intra-hour, sequential step, and non-contiguous seek', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return { ok: true, arrayBuffer: async () => createSyntheticSlice(true, 0x22) };
      });

      // Initial seek to hour 5
      await ds.seekHour(5);
      expect(ds.currentHour).toBe(5);
      mockDevice.queue.writeTextureCalls = [];

      // 1. Intra-hour (bracketHour 5, tau changes from 0.0 to 0.7) -> zero uploads
      await ds.setTime(5, 0.7);
      expect(mockDevice.queue.writeTextureCalls).toHaveLength(0);
      expect(ds.currentHour).toBe(5);

      // 2. Sequential advance to hour 6 -> 1 prefetch upload
      await ds.setTime(6, 0.0);
      expect(ds.currentHour).toBe(6);
      expect(mockDevice.queue.writeTextureCalls).toHaveLength(1);
      mockDevice.queue.writeTextureCalls = [];

      // 3. Non-contiguous jump to hour 20 -> 3 uploads (seekHour)
      await ds.setTime(20, 0.5);
      expect(ds.currentHour).toBe(20);
      expect(mockDevice.queue.writeTextureCalls).toHaveLength(3);
      mockDevice.queue.writeTextureCalls = [];
    });
  });

  // ==========================================================================
  // Pillar 6: Error Handling, Resilience & Disposal
  // ==========================================================================
  describe('Pillar 6: Error Handling, Resilience & Disposal', () => {
    it('loadMetadata() throws descriptive Error on HTTP 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as any);

      const ds = new WeatherNextDataSource();
      await expect(ds.loadMetadata()).rejects.toThrow(/Failed to fetch metadata.*404/i);
    });

    it('loadMetadata() throws Error on network fetch rejection', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const ds = new WeatherNextDataSource();
      await expect(ds.loadMetadata()).rejects.toThrow(/Failed to fetch/i);
    });

    it('loadMetadata() throws Error on malformed JSON payload', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      } as any);

      const ds = new WeatherNextDataSource();
      await expect(ds.loadMetadata()).rejects.toThrow(/SyntaxError|JSON/i);
    });

    it('getSlice() throws RangeError for out-of-bounds or non-integer hours', async () => {
      const ds = new WeatherNextDataSource();
      await expect(ds.getSlice('temperature_2m_mean', -1)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', 48)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', 1.5)).rejects.toThrow(RangeError);
      await expect(ds.getSlice('temperature_2m_mean', NaN)).rejects.toThrow(RangeError);
    });

    it('getSlice() throws Error for unsupported variable name', async () => {
      const ds = new WeatherNextDataSource();
      await expect(ds.getSlice('nonexistent_variable_field', 0)).rejects.toThrow(
        /Unsupported variable|Invalid variable/i
      );
    });

    it('getSlice() does not poison cache on HTTP network failure', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, status: 500, statusText: 'Internal Server Error' };
        }
        return { ok: true, arrayBuffer: async () => createSyntheticSlice(true, 0xbb) };
      });

      const ds = new WeatherNextDataSource();
      // First attempt fails
      await expect(ds.getSlice('dewpoint_temperature_2m_mean', 0)).rejects.toThrow(/500/);

      // Second attempt succeeds — verified that cache was not poisoned with empty/null
      const result = await ds.getSlice('dewpoint_temperature_2m_mean', 0);
      expect(result).toBeDefined();
      expect(result.byteLength).toBe(PADDED_SLICE_BYTES);
      expect(callCount).toBe(2);
    });

    it('seekHour and advanceHour throw Error if ringBuffer is not bound', async () => {
      const ds = new WeatherNextDataSource(); // No ringBuffer
      await expect(ds.seekHour(0, 'temperature_2m_mean')).rejects.toThrow(
        /TemporalTextureRingBuffer not bound/i
      );
      await expect(ds.advanceHour()).rejects.toThrow(
        /TemporalTextureRingBuffer not bound/i
      );
    });

    it('setActiveVariable changes active variable and re-stages buffer if ring is bound', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        return { ok: true, arrayBuffer: async () => createSyntheticSlice(true, 0x33) };
      });

      await ds.seekHour(2, 'temperature_2m_mean');
      expect(ds.getActiveVariable()).toBe('temperature_2m_mean');
      mockDevice.queue.writeTextureCalls = [];

      await ds.setActiveVariable('u_component_of_wind_10m_mean');
      expect(ds.getActiveVariable()).toBe('u_component_of_wind_10m_mean');
      expect(ds.currentVariable).toBe('u_component_of_wind_10m_mean');
      expect(mockDevice.queue.writeTextureCalls).toHaveLength(3);
      mockDevice.queue.writeTextureCalls = [];
    });

    it('IDataSource compliance: fetch and toGPUBinding return expected contracts', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_METADATA,
      } as any);

      const ds = new WeatherNextDataSource();
      expect(ds.id).toBe('google-weathernext3');
      expect(ds.type).toBe('field');
      expect(ds.isStreaming).toBe(true);

      const chunk = await ds.fetch(
        { minLon: -180, maxLon: 180, minLat: -90, maxLat: 90, minAlt: 0, maxAlt: 0 },
        0
      );
      expect(chunk.chunkId).toContain('weathernext-');
      expect(chunk.vertexCount).toBe(3600 * 1801);
      expect(chunk.meta).toBeDefined();

      expect(ds.toGPUBinding()).toBeNull();
      await expect(ds.disconnect()).resolves.not.toThrow();
    });

    it('dispose() cleanly releases resources and rejects subsequent operations', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      ds.dispose();
      expect(ds.disposed).toBe(true);
      expect(ring.disposed).toBe(true);

      await expect(ds.loadMetadata()).rejects.toThrow(/disposed/i);
      await expect(ds.getSlice('temperature_2m_mean', 0)).rejects.toThrow(/disposed/i);
      await expect(ds.seekHour(0)).rejects.toThrow(/disposed/i);
      await expect(ds.advanceHour()).rejects.toThrow(/disposed/i);
      await expect(ds.setActiveVariable('temperature_2m_mean')).rejects.toThrow(/disposed/i);
    });

    it('verifies getVRAMFootprintBytes enforces single-stream ring buffer budget under 194 MB', () => {
      const dsUnbound = new WeatherNextDataSource();
      expect(dsUnbound.getVRAMFootprintBytes()).toBe(0);

      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const dsBound = new WeatherNextDataSource({ ringBuffer: ring });

      // 3 slots * 13,370,624 bytes (padded) = 40,111,872 bytes
      const vramBytes = dsBound.getVRAMFootprintBytes();
      expect(vramBytes).toBe(40111872);

      // Invariant §68/§73: Must be strictly below 194 MB budget ceiling (203,423,744 bytes)
      const budgetCeilingBytes = 194 * 1024 * 1024;
      expect(vramBytes).toBeLessThan(budgetCeilingBytes);

      const headroomBytes = budgetCeilingBytes - vramBytes;
      const headroomMB = headroomBytes / (1024 * 1024);
      expect(headroomMB).toBeGreaterThan(153.0); // ~153.89 MB headroom

      dsBound.dispose();
      expect(dsBound.getVRAMFootprintBytes()).toBe(0);
    });

    it('verifies createDefaultMetadata produces physically valid temperature (°C) and grid bounds', () => {
      const ds = new WeatherNextDataSource();
      const meta = ds.createDefaultMetadata();

      expect(meta.source).toBe('Google DeepMind WeatherNext 3');
      expect(meta.variableMetadata.temperature_2m_mean?.units).toBe('°C');
      expect(meta.variableMetadata.dewpoint_temperature_2m_mean?.units).toBe('°C');
      expect(meta.gridDimensions.width).toBe(3600);
      expect(meta.gridDimensions.height).toBe(1801);
      expect(meta.textureEncoding.isPrePadded).toBe(true);
      expect(meta.textureEncoding.paddedRowBytes).toBe(7424);
    });
  });
});
