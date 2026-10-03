import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  WeatherNextDataSource,
  WEATHERNEXT_GRID_SPEC,
  WeatherNextMeta,
} from '../../src/core/data/WeatherNextDataSource';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';

const STAGED_PROGNOSTIC_VARIABLES = [
  'u_component_of_wind_10m_mean',
  'v_component_of_wind_10m_mean',
  'total_precipitation_1hr_mean',
  'temperature_2m_mean',
  'dewpoint_temperature_2m_mean',
  'total_cloud_cover_mean',
] as const;

// Mock WebGPU device and queue for ring buffer tests
function createMockGPUDevice() {
  const writeTextureCalls: Array<{
    destination: { texture: any; origin?: any };
    data: BufferSource;
    dataLayout: { offset?: number; bytesPerRow?: number; rowsPerImage?: number };
    size: any;
  }> = [];

  const mockDevice = {
    createTexture: vi.fn().mockImplementation((desc: any) => ({
      width: desc.size.width || desc.size[0] || 3600,
      height: desc.size.height || desc.size[1] || 1801,
      format: desc.format,
      usage: desc.usage,
      destroy: vi.fn(),
      label: desc.label,
      createView: vi.fn().mockReturnValue({ label: 'mock-texture-view' }),
    })),
    createSampler: vi.fn().mockReturnValue({ label: 'mock-sampler' }),
    createBindGroup: vi.fn().mockReturnValue({ label: 'mock-bindgroup' }),
    queue: {
      writeTexture: vi.fn().mockImplementation((dest, data, layout, size) => {
        writeTextureCalls.push({ destination: dest, data, dataLayout: layout, size });
      }),
      writeBuffer: vi.fn(),
      writeTextureCalls,
    },
  };

  return mockDevice;
}

const PADDED_VECTOR_SLICE_BYTES = 14592 * 1801; // 26,280,192 bytes (256-byte aligned hardware row pitch)

function createSyntheticSlice(variable: string, hour: number, isPadded: boolean = true): ArrayBuffer {
  const isVector = variable === 'wind_10m_vector';
  const byteLength = isVector
    ? (isPadded ? PADDED_VECTOR_SLICE_BYTES : 3600 * 1801 * 4)
    : (isPadded ? WEATHERNEXT_GRID_SPEC.paddedSliceBytes : 3600 * 1801 * 2);

  const buffer = new ArrayBuffer(byteLength);
  const u8 = new Uint8Array(buffer);
  // Stamp sentinel hour tag in first 4 bytes
  u8[0] = hour & 0xff;
  u8[1] = (hour >> 8) & 0xff;
  u8[2] = isVector ? 0xfe : 0xaa;
  u8[3] = isPadded ? 0x01 : 0x00;
  return buffer;
}

describe('Milestone 12: WeatherNext 3 Prognostic Ingestion & Rolling Cache Pipeline', () => {
  const dataDir = path.resolve(__dirname, '../../public/data/weathernext');
  const metaPath = path.join(dataDir, 'meta.json');

  // ==========================================================================
  // Suite 1: Task M12-T1 - CLI Ingestion & Manifest Verification (Task OPS-WN3-1)
  // ==========================================================================
  describe('Task M12-T1: WeatherNext 3 Staging & Manifest Invariant Validation', () => {
    it('M12-INGEST-01: meta.json exists with valid forecastInitTimestamp and 12-hour horizon', () => {
      expect(fs.existsSync(metaPath)).toBe(true);
      const raw = fs.readFileSync(metaPath, 'utf-8');
      const meta = JSON.parse(raw);

      expect(meta.forecastInitTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(meta.forecastRunCycle).toBe('20261002_19hr_01_preds');
      expect(meta.timeHorizon).toBeDefined();
      expect(meta.timeHorizon.startHour).toBe(0);
      expect(meta.timeHorizon.endHour).toBe(11);
      expect(meta.timeHorizon.stepHours).toBe(1);
      expect(meta.timeHorizon.totalHours).toBe(12);
      expect(meta.validPredictionHours).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('M12-INGEST-02: grid dimensions match 0.1° global cartographic standard (3600 x 1801)', () => {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.gridDimensions.width).toBe(3600);
      expect(meta.gridDimensions.height).toBe(1801);
      expect(meta.gridDimensions.lonPoints).toBe(3600);
      expect(meta.gridDimensions.latPoints).toBe(1801);
      expect(meta.gridDimensions.resolutionDeg).toBe(0.1);
      expect(meta.gridDimensions.latMin).toBe(-90);
      expect(meta.gridDimensions.latMax).toBe(90);
      expect(meta.gridDimensions.lonMin).toBe(-180);
      expect(meta.gridDimensions.lonMax).toBe(179.9);
    });

    it('M12-INGEST-03: hardware texture encoding conforms to Invariant §40 (256-byte aligned row pitch)', () => {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.textureEncoding.format).toBe('r16float');
      expect(meta.textureEncoding.bytesPerTexel).toBe(2);
      expect(meta.textureEncoding.rawRowBytes).toBe(7200);
      expect(meta.textureEncoding.paddedRowBytes).toBe(7424);
      expect(meta.textureEncoding.paddingBytesPerRow).toBe(224);
      expect(meta.textureEncoding.isPrePadded).toBe(true);
      expect(meta.textureEncoding.paddedSliceByteLength).toBe(13370624);

      // Verify row pitch mathematical alignment
      expect(meta.textureEncoding.paddedRowBytes % 256).toBe(0);
      expect(meta.textureEncoding.paddedRowBytes).toBeGreaterThanOrEqual(meta.textureEncoding.rawRowBytes);
      expect(meta.textureEncoding.paddedSliceByteLength).toBe(7424 * 1801);

      // Verify vector encoding
      expect(meta.vectorTextureEncoding.format).toBe('rg16float');
      expect(meta.vectorTextureEncoding.bytesPerTexel).toBe(4);
      expect(meta.vectorTextureEncoding.rawRowBytes).toBe(14400);
      expect(meta.vectorTextureEncoding.paddedRowBytes).toBe(14592);
      expect(meta.vectorTextureEncoding.paddedRowBytes % 256).toBe(0);
      expect(meta.vectorTextureEncoding.paddedSliceByteLength).toBe(26280192);
    });

    it('M12-INGEST-04: all 6 core prognostic variables are declared in the manifest', () => {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(Array.isArray(meta.variables)).toBe(true);

      for (const coreVar of STAGED_PROGNOSTIC_VARIABLES) {
        expect(meta.variables).toContain(coreVar);
        const metaEntry = meta.variableMetadata[coreVar];
        expect(metaEntry).toBeDefined();
        expect(metaEntry.longName).toBeDefined();
        expect(metaEntry.units).toBeDefined();
      }
    });

    it('M12-INGEST-05: disk verification of all 72 scalar slices and 12 interleaved vector slices', () => {
      // 6 core variables x 12 hours = 72 scalar slices
      for (const v of STAGED_PROGNOSTIC_VARIABLES) {
        for (let h = 0; h < 12; h++) {
          const filePath = path.join(dataDir, `${v}-${h}.bin`);
          expect(fs.existsSync(filePath)).toBe(true);
          const stat = fs.statSync(filePath);
          expect(stat.size).toBe(13370624);
        }
      }

      // 12 interleaved vector slices for wind_10m_vector
      for (let h = 0; h < 12; h++) {
        const filePath = path.join(dataDir, `wind_10m_vector-${h}.bin`);
        expect(fs.existsSync(filePath)).toBe(true);
        const stat = fs.statSync(filePath);
        expect(stat.size).toBe(26280192); // 14592 * 1801 bytes
      }
    });
  });

  // ==========================================================================
  // Suite 2: Task M12-T2 - Directional Rolling Pre-Warming Cache (Task OPS-WN3-2)
  // ==========================================================================
  describe('Task M12-T2: Directional Rolling Pre-Warming Cache (±2h Window)', () => {
    let mockDevice: ReturnType<typeof createMockGPUDevice>;
    let ringBuffer: TemporalTextureRingBuffer;

    beforeEach(() => {
      mockDevice = createMockGPUDevice();
      ringBuffer = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('M12-PREWARM-01: computes directional target ordering correctly for forward and backward scrub', () => {
      const ds = new WeatherNextDataSource({ ringBuffer });

      // Forward scrubbing from hour 4: prioritizes upcoming hours (+1, +2, then -1, -2)
      const forwardTargets = ds.getPrewarmTargets(4, 1);
      expect(forwardTargets).toEqual([5, 6, 3, 2]);

      // Backward scrubbing from hour 4: prioritizes past hours (-1, -2, then +1, +2)
      const backwardTargets = ds.getPrewarmTargets(4, -1);
      expect(backwardTargets).toEqual([3, 2, 5, 6]);

      // Stationary (dir = 0) defaults to forward priority
      const stationaryTargets = ds.getPrewarmTargets(4, 0);
      expect(stationaryTargets).toEqual([5, 6, 3, 2]);
    });

    it('M12-PREWARM-02: clamps prewarm targets safely at boundary hours 0 and 11', () => {
      const ds = new WeatherNextDataSource({ ringBuffer });
      // Staged metadata with 12 hours (0..11)
      ds.metadata = {
        forecastInitTimestamp: '2026-10-02T19:00:00Z',
        timeHorizon: { startHour: 0, endHour: 11, stepHours: 1, totalHours: 12 },
        validPredictionHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        gridDimensions: { width: 3600, height: 1801, resolutionDeg: 0.1, latMin: -90, latMax: 90, lonMin: -180, lonMax: 180, lonPoints: 3600, latPoints: 1801 },
        textureEncoding: { format: 'r16float', bytesPerTexel: 2, rawRowBytes: 7200, paddedRowBytes: 7424, paddingBytesPerRow: 224, isPrePadded: true, sliceByteLength: 12967200, paddedSliceByteLength: 13370624 },
        variables: [] as any,
      };

      // At hour 0, backward targets cannot go negative
      const targets0 = ds.getPrewarmTargets(0, 1);
      expect(targets0).toEqual([1, 2]);

      // At hour 11, forward targets cannot exceed 11
      const targets11 = ds.getPrewarmTargets(11, -1);
      expect(targets11).toEqual([10, 9]);
    });

    it('M12-PREWARM-03: scrubbing forward triggers prewarm fetches for adjacent hours into sliceCache', async () => {
      const ds = new WeatherNextDataSource({ ringBuffer });
      const fetchedHours: number[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        fetchedHours.push(hour);
        return {
          ok: true,
          arrayBuffer: async () => createSyntheticSlice('temperature_2m_mean', hour, true),
        };
      });

      // Seek initially to hour 2
      await ds.seekHour(2, 'temperature_2m_mean');
      fetchedHours.length = 0; // Clear seek fetches

      // Scrub forward to hour 3
      await ds.setTime(3, 0.0);

      // Verify that directional pre-warming requested adjacent forward slices (+1, +2 -> 4, 5)
      expect(ds.isSliceCached('temperature_2m_mean', 4)).toBe(true);
      expect(ds.isSliceCached('temperature_2m_mean', 5)).toBe(true);
      expect(ds.getScrubDirection()).toBe(1);
    });

    it('M12-PREWARM-04: scrubbing backward triggers prewarm fetches for preceding hours', async () => {
      const ds = new WeatherNextDataSource({ ringBuffer });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createSyntheticSlice('temperature_2m_mean', hour, true),
        };
      });

      // Seek initially to hour 8
      await ds.seekHour(8, 'temperature_2m_mean');

      // Scrub backward to hour 7
      await ds.setTime(7, 0.0);

      expect(ds.getScrubDirection()).toBe(-1);
      // Preceding hours 6 and 5 must be resident in cache
      expect(ds.isSliceCached('temperature_2m_mean', 6)).toBe(true);
      expect(ds.isSliceCached('temperature_2m_mean', 5)).toBe(true);
    });

    it('M12-PREWARM-05: cache hits avoid redundant network requests', async () => {
      const ds = new WeatherNextDataSource({ ringBuffer });
      let fetchCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchCount++;
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createSyntheticSlice('total_precipitation_1hr_mean', hour, true),
        };
      });

      await ds.seekHour(2, 'total_precipitation_1hr_mean');
      const countAfterSeek = fetchCount;

      // Manually trigger prewarm for hour 2: targets [3, 4, 1, 0]
      ds.prewarmWindow(2, 1, 'total_precipitation_1hr_mean');
      await new Promise((r) => setTimeout(r, 10));

      const countAfterPrewarm = fetchCount;
      expect(countAfterPrewarm).toBeGreaterThan(countAfterSeek);

      // Trigger prewarm again with identical parameters: zero additional network fetches
      ds.prewarmWindow(2, 1, 'total_precipitation_1hr_mean');
      await new Promise((r) => setTimeout(r, 10));

      expect(fetchCount).toBe(countAfterPrewarm);
    });
  });

  // ==========================================================================
  // Suite 3: Task M12-T2 - Idle Keyframe Prefetcher (1.5s Debounce)
  // ==========================================================================
  describe('Task M12-T2: Idle Keyframe Prefetcher (1.5s Debounce & Synoptic Anchors)', () => {
    let mockDevice: ReturnType<typeof createMockGPUDevice>;
    let ringBuffer: TemporalTextureRingBuffer;

    beforeEach(() => {
      vi.useFakeTimers();
      mockDevice = createMockGPUDevice();
      ringBuffer = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('M12-IDLE-01: rapid scrubbing under 1.5s debounces timer and delays prefetching', async () => {
      const ds = new WeatherNextDataSource({ ringBuffer, idlePrefetchDelayMs: 1500 });
      const prefetchSpy = vi.spyOn(ds, 'prefetchIdleKeyframes');

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        arrayBuffer: async () => createSyntheticSlice('temperature_2m_mean', 0, true),
      }));

      // Rapid scrubbing simulation (events every 400ms)
      await ds.setTime(0, 0.1);
      vi.advanceTimersByTime(400);

      await ds.setTime(0, 0.4);
      vi.advanceTimersByTime(400);

      await ds.setTime(0, 0.7);
      vi.advanceTimersByTime(400);

      await ds.setTime(1, 0.0);
      vi.advanceTimersByTime(400);

      // Total time elapsed: 1600ms, but no single quiet period was >= 1500ms
      expect(prefetchSpy).not.toHaveBeenCalled();

      // Now scrubber remains idle for full 1500ms
      vi.advanceTimersByTime(1500);

      expect(prefetchSpy).toHaveBeenCalledTimes(1);
    });

    it('M12-IDLE-02: idle stationary scrubber triggers background prefetch for +6h and +12h synoptic anchors', async () => {
      const ds = new WeatherNextDataSource({
        ringBuffer,
        idlePrefetchDelayMs: 1500,
        defaultVariable: 'temperature_2m_mean',
      });
      const fetchedUrls: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchedUrls.push(url);
        const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
        const hour = match ? parseInt(match[2], 10) : 0;
        return {
          ok: true,
          arrayBuffer: async () => createSyntheticSlice('temperature_2m_mean', hour, true),
        };
      });

      // Set time to hour 2
      await ds.setTime(2, 0.0);
      fetchedUrls.length = 0;

      // Elapse 1500ms idle threshold
      await vi.advanceTimersByTimeAsync(1500);

      // Synoptic anchors: 2 + 6 = 8, 2 + 12 = 14
      expect(ds.isSliceCached('temperature_2m_mean', 8)).toBe(true);
      expect(ds.isSliceCached('temperature_2m_mean', 14)).toBe(true);
    });

    it('M12-IDLE-03: disposal cleanly cancels active idle prefetch timer', async () => {
      const ds = new WeatherNextDataSource({ ringBuffer, idlePrefetchDelayMs: 1500 });
      const prefetchSpy = vi.spyOn(ds, 'prefetchIdleKeyframes');

      await ds.setTime(2, 0.0);

      // Advance partially: 800ms
      await vi.advanceTimersByTimeAsync(800);

      // Dispose while timer is still armed
      ds.dispose();

      // Advance remaining time past 1500ms
      await vi.advanceTimersByTimeAsync(1000);

      expect(prefetchSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Suite 4: Task M12-T3 & M12-T4 - Provenance Telemetry & Zero-GC Parity
  // ==========================================================================
  describe('Task M12-T3 & M12-T4: Provenance Telemetry & Zero-GC Buffer Parity', () => {
    let mockDevice: ReturnType<typeof createMockGPUDevice>;
    let ringBuffer: TemporalTextureRingBuffer;

    beforeEach(() => {
      mockDevice = createMockGPUDevice();
      ringBuffer = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
    });

    it('M12-PROV-01: getProvenance reflects exact cycle timestamp, valid time (T+kh), and model name', () => {
      const ds = new WeatherNextDataSource({ ringBuffer });
      ds.metadata = {
        forecastInitTimestamp: '2026-10-02T19:00:00Z',
        source: 'Google DeepMind WeatherNext 3',
        model: 'WeatherNext-3-Prognostic',
        timeHorizon: { startHour: 0, endHour: 11, stepHours: 1, totalHours: 12 },
        validPredictionHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        gridDimensions: { width: 3600, height: 1801, resolutionDeg: 0.1, latMin: -90, latMax: 90, lonMin: -180, lonMax: 180, lonPoints: 3600, latPoints: 1801 },
        textureEncoding: { format: 'r16float', bytesPerTexel: 2, rawRowBytes: 7200, paddedRowBytes: 7424, paddingBytesPerRow: 224, isPrePadded: true, sliceByteLength: 12967200, paddedSliceByteLength: 13370624 },
        variables: [] as any,
      };

      ds.currentHour = 5;
      const prov = ds.getProvenance(0.42);

      expect(prov.modelName).toBe('Google DeepMind WeatherNext 3');
      expect(prov.runTimestamp).toBe('2026-10-02T19:00:00Z');
      expect(prov.validTimestamp).toBe('2026-10-03T00:00:00.000Z'); // 19h + 5h = 00h next day
      expect(prov.forecastHour).toBe(5);
      expect(prov.spatialResolutionDeg).toBe(0.1);
      expect(prov.temporalBlendTau).toBeCloseTo(0.42);
      expect(prov.activeSlotIndex).toBe(0); // tau < 0.5
    });

    it('M12-ZERO-GC-01: prewarmTargets tracking array is preallocated and mutated in-place', () => {
      const ds = new WeatherNextDataSource({ ringBuffer });
      const internalTargets = (ds as any).prewarmTargets;

      expect(Array.isArray(internalTargets)).toBe(true);
      expect(internalTargets.length).toBe(4);

      // Trigger prewarm targets calculation
      const snapshot = ds.getPrewarmTargets(3, 1);
      expect(snapshot).toEqual([4, 5, 2, 1]);

      // Internal array reference remains unchanged (Zero-GC)
      expect((ds as any).prewarmTargets).toBe(internalTargets);
    });

    it('M12-RING-01: prepareSliceForRing extracts scalar speed slice from rg16float wind vector', () => {
      const ds = new WeatherNextDataSource({ ringBuffer });
      const vectorSlice = createSyntheticSlice('wind_10m_vector', 0, true);
      expect(vectorSlice.byteLength).toBe(PADDED_VECTOR_SLICE_BYTES);

      // Private prepareSliceForRing invocation via any
      const adapted = (ds as any).prepareSliceForRing(vectorSlice, 'wind_10m_vector');
      expect(adapted.byteLength).toBe(WEATHERNEXT_GRID_SPEC.paddedSliceBytes); // 13,370,624 bytes
    });
  });
});
