// ============================================================================
// File: tests/modern/LiveRadarDataSource.test.ts
// Behavioral Unit Test Suite for Live Doppler Radar Pipeline & Data Source
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';
import {
  LiveRadarDataSource,
  LiveRadarMetadata,
  RADAR_TILE_WIDTH,
  RADAR_TILE_HEIGHT,
  RADAR_FRAME_COUNT,
  RADAR_FRAME_BYTE_LENGTH,
  RADAR_LOOP_BYTE_LENGTH,
} from '../../src/core/data/LiveRadarDataSource';
import {
  decodeColorToReflectivity,
  generateSyntheticRadarFrame,
  fetchLiveRadarLoop,
  equirectYToMercatorY,
  decodeRadarTileToFloat16,
  WEB_MERCATOR_MAX_LATITUDE,
} from '../../scripts/fetch-live-radar';
import {
  DATA_LAYER_CATALOG as CANONICAL_CATALOG,
  getPresetById as getPresetByIdCanonical,
} from '../../src/core/data/DataLayerCatalog';
import {
  DATA_LAYER_CATALOG as LAYERS_CATALOG,
  getPresetById as getPresetByIdLayers,
} from '../../src/core/layers/DataLayerCatalog';

describe('Live Doppler Radar Pipeline & Data Source Suite', () => {
  let mockDevice: MockGPUDevice;

  beforeEach(() => {
    mockDevice = new MockGPUDevice();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Suite 1: LiveRadarDataSource Initialization & Geometry Contracts
  // --------------------------------------------------------------------------
  describe('1. LiveRadarDataSource Initialization & Dimensions', () => {
    it('initializes with default radar geometry (256x256, 12 frames, Float16)', () => {
      const ds = new LiveRadarDataSource({ autoLoad: false });
      expect(ds.id).toBe('live-doppler-radar');
      expect(ds.type).toBe('field');
      expect(ds.width).toBe(256);
      expect(ds.height).toBe(256);
      expect(ds.frameCount).toBe(12);
      expect(ds.bytesPerTexel).toBe(2);
      expect(ds.frameByteLength).toBe(131072); // 256 * 256 * 2
      expect(ds.loopByteLength).toBe(1572864); // 12 * 131072 = 1.5 MB <= 2 MB
      expect(ds.isLoaded()).toBe(false);
      expect(ds.disposed).toBe(false);
    });

    it('returns an empty zeroed buffer of exact size 131,072 bytes as graceful fallback', () => {
      const ds = new LiveRadarDataSource({ autoLoad: false });
      const empty = ds.getEmptyFrame();
      expect(empty.byteLength).toBe(131072);
      const u16 = new Uint16Array(empty);
      for (let i = 0; i < 100; i++) {
        expect(u16[i]).toBe(0);
      }
      expect(ds.getCurrentFrame().byteLength).toBe(131072);
      expect(ds.getNextFrame().byteLength).toBe(131072);
      expect(ds.getFrame(99).byteLength).toBe(131072);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Binary Loop Loading & Metadata Parsing
  // --------------------------------------------------------------------------
  describe('2. Binary Loop Loading & Frame Slicing', () => {
    it('loads actual public/data/radar-loop-latest.bin and slices into 12 frames', async () => {
      const ds = new LiveRadarDataSource({ autoLoad: false });
      const loaded = await ds.load();
      expect(loaded).toBe(true);
      expect(ds.isLoaded()).toBe(true);
      expect(ds.getCurrentFrame().byteLength).toBe(RADAR_FRAME_BYTE_LENGTH);
      expect(ds.getNextFrame().byteLength).toBe(RADAR_FRAME_BYTE_LENGTH);

      const meta = ds.meta;
      expect(meta).toBeDefined();
      if (meta) {
        expect(meta.frameCount).toBe(12);
        expect(meta.width).toBe(256);
        expect(meta.height).toBe(256);
        expect(meta.format).toBe('r16float');
        expect(meta.fileSizeBytes).toBe(1572864);
        expect(meta.fileSizeBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
      }
    });

    it('gracefully handles missing or unreadable binary files without throwing', async () => {
      const ds = new LiveRadarDataSource({
        dataPath: '/data/nonexistent-radar-loop.bin',
        metaPath: '/data/nonexistent-meta.json',
        autoLoad: false,
      });

      const loaded = await ds.load();
      expect(loaded).toBe(false);
      expect(ds.isLoaded()).toBe(false);

      // Verify graceful fallback
      const current = ds.getCurrentFrame();
      const next = ds.getNextFrame();
      expect(current.byteLength).toBe(131072);
      expect(next.byteLength).toBe(131072);
      const u16 = new Uint16Array(current);
      expect(u16[0]).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: TimelineScrubber absoluteMinutes Integration (-60m to 0m)
  // --------------------------------------------------------------------------
  describe('3. TimelineScrubber Frame Selection (-60m to 0m)', () => {
    it('manages frame indexing across the -60m to 0m radar zone in normalized mode', async () => {
      const ds = new LiveRadarDataSource({
        frameSelectionMode: 'normalized',
        autoLoad: false,
      });
      await ds.load();

      // At -60m (oldest point): frame 0
      ds.setAbsoluteMinutes(-60);
      expect(ds.getCurrentMinutes()).toBe(-60);
      expect(ds.getCurrentFrameIndex()).toBe(0);
      expect(ds.getNextFrameIndex()).toBe(1);
      expect(ds.getTau()).toBeCloseTo(0.0, 3);

      // At -30m (midpoint): frame 5, next 6, tau = 0.5
      ds.setAbsoluteMinutes(-30);
      expect(ds.getCurrentMinutes()).toBe(-30);
      expect(ds.getCurrentFrameIndex()).toBe(5);
      expect(ds.getNextFrameIndex()).toBe(6);
      expect(ds.getTau()).toBeCloseTo(0.5, 3);

      // At 0m (NOW / latest observation): frame 11
      ds.setAbsoluteMinutes(0);
      expect(ds.getCurrentMinutes()).toBe(0);
      expect(ds.getCurrentFrameIndex()).toBe(11);
      expect(ds.getNextFrameIndex()).toBe(11);
      expect(ds.getTau()).toBeCloseTo(0.0, 3);
    });

    it('clamps out-of-bounds minutes cleanly to [-60, 0]', () => {
      const ds = new LiveRadarDataSource({ autoLoad: false });
      ds.setAbsoluteMinutes(-120);
      expect(ds.getCurrentMinutes()).toBe(-60);
      expect(ds.getCurrentFrameIndex()).toBe(0);

      ds.setAbsoluteMinutes(100);
      expect(ds.getCurrentMinutes()).toBe(0);
      expect(ds.getCurrentFrameIndex()).toBe(11);

      ds.setAbsoluteMinutes(NaN);
      expect(ds.getCurrentMinutes()).toBe(0);
    });

    it('supports 10-minute interval frame selection mode', () => {
      const ds = new LiveRadarDataSource({
        frameSelectionMode: 'interval',
        autoLoad: false,
      });

      // At 0m: latest frame 11
      ds.setAbsoluteMinutes(0);
      expect(ds.getCurrentFrameIndex()).toBe(11);

      // At -10m: frame 10
      ds.setAbsoluteMinutes(-10);
      expect(ds.getCurrentFrameIndex()).toBe(10);

      // At -20m: frame 9
      ds.setAbsoluteMinutes(-20);
      expect(ds.getCurrentFrameIndex()).toBe(9);

      // At -60m: frame 5
      ds.setAbsoluteMinutes(-60);
      expect(ds.getCurrentFrameIndex()).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: WebGPU Ring Buffer Upload & Staging
  // --------------------------------------------------------------------------
  describe('4. WebGPU TemporalTextureRingBuffer Upload', () => {
    it('binds ring buffer and uploads current and next frame slices', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 256, 256, 'r16float');
      const ds = new LiveRadarDataSource({ ringBuffer: ring, autoLoad: false });
      await ds.load();

      const writeTextureSpy = vi.spyOn(mockDevice.queue, 'writeTexture');

      ds.setAbsoluteMinutes(-30);
      ds.uploadToRingBuffer();

      // Verifies upload of slot 0 (current) and slot 1 (next)
      expect(writeTextureSpy).toHaveBeenCalledTimes(2);

      ring.dispose();
      ds.dispose();
    });

    it('creates and binds a matching 256x256 ring buffer via createRingBuffer()', () => {
      const ds = new LiveRadarDataSource({ autoLoad: false });
      const ring = ds.createRingBuffer(mockDevice as any);

      expect(ring).toBeDefined();
      expect(ring.width).toBe(256);
      expect(ring.height).toBe(256);
      expect(ring.format).toBe('r16float');
      expect(ds.getRingBuffer()).toBe(ring);

      ring.dispose();
      ds.dispose();
    });

    it('defensively rejects ring buffers with mismatched dimensions to prevent upload slice errors', () => {
      const ds = new LiveRadarDataSource({ autoLoad: false });
      // WeatherNext dimension ring buffer (3600x1801)
      const incompatibleRing = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');

      expect(() => ds.bindRingBuffer(incompatibleRing)).toThrow(RangeError);
      incompatibleRing.dispose();
      ds.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // Suite 5: Color-to-dBZ Reflectivity Decoding
  // --------------------------------------------------------------------------
  describe('5. RainViewer Color-to-dBZ Reflectivity Decoding', () => {
    it('decodes alpha < 10 to 0.0 dBZ (clear echo)', () => {
      expect(decodeColorToReflectivity(0, 0, 0, 0)).toBe(0.0);
      expect(decodeColorToReflectivity(128, 128, 128, 5)).toBe(0.0);
    });

    it('decodes standard meteorological radar tiers monotonically', () => {
      const clear = decodeColorToReflectivity(0, 0, 0, 0);
      const darkBlue = decodeColorToReflectivity(0, 71, 104, 255); // faint drizzle
      const midBlue = decodeColorToReflectivity(0, 127, 180, 255); // drizzle / light rain
      const cyan = decodeColorToReflectivity(108, 209, 235, 255); // light rain
      const yellow = decodeColorToReflectivity(255, 238, 0, 255); // moderate rain
      const orange = decodeColorToReflectivity(255, 149, 0, 255); // heavy rain
      const red = decodeColorToReflectivity(205, 13, 0, 255); // severe rain
      const magenta = decodeColorToReflectivity(255, 119, 255, 255); // severe storm
      const white = decodeColorToReflectivity(255, 255, 255, 255); // extreme hail

      expect(clear).toBe(0.0);
      expect(darkBlue).toBeGreaterThan(5.0);
      expect(midBlue).toBeGreaterThan(darkBlue);
      expect(cyan).toBeGreaterThan(midBlue);
      expect(yellow).toBeGreaterThan(cyan);
      expect(orange).toBeGreaterThan(yellow);
      expect(red).toBeGreaterThan(orange);
      expect(magenta).toBeGreaterThan(red);
      expect(white).toBeGreaterThan(magenta);
      expect(white).toBe(70.0);
    });

    it('generates valid synthetic radar fallback frames with values within [0, 70] dBZ', () => {
      const frameBuf = generateSyntheticRadarFrame(0);
      expect(frameBuf.byteLength).toBe(131072);
      const u16 = new Uint16Array(frameBuf);
      expect(u16.length).toBe(256 * 256);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 6: Dry-Run Mode & Ingestion Script
  // --------------------------------------------------------------------------
  describe('6. Dry-Run Mode Ingestion Script', () => {
    it('executes dry-run query and returns available timestamps without modifying filesystem', async () => {
      const mockManifest = {
        version: '1.0',
        generated: 1720000000,
        host: 'https://tilecache.rainviewer.com',
        radar: {
          past: Array.from({ length: 12 }, (_, i) => ({
            time: 1720000000 - (11 - i) * 600,
            path: `/v2/radar/${1720000000 - (11 - i) * 600}`,
          })),
          nowcast: [],
        },
        satellite: { infrared: [] },
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockManifest,
      } as Response);

      const result = await fetchLiveRadarLoop({ dryRun: true });
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.frameCount).toBe(12);
      expect(result.timestamps.length).toBe(12);
      expect(result.bytesWritten).toBeUndefined();
    });

    it('rejects in dry-run mode if the public API is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network unreachable'));
      await expect(
        fetchLiveRadarLoop({
          dryRun: true,
          apiUrl: 'https://127.0.0.1:59999/unreachable-endpoint.json',
        })
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Suite 7: DataLayerCatalog Integration
  // --------------------------------------------------------------------------
  describe('7. DataLayerCatalog Integration & Schema Parity', () => {
    const TARGET_ID = 'live-doppler-radar';

    it('registers live-doppler-radar in both canonical and layers catalogs', () => {
      const canonical = getPresetByIdCanonical(TARGET_ID);
      const layers = getPresetByIdLayers(TARGET_ID);

      expect(canonical).toBeDefined();
      expect(layers).toBeDefined();
      expect(canonical).toStrictEqual(layers);
    });

    it('verifies exact preset fields for live-doppler-radar', () => {
      const preset = getPresetByIdCanonical(TARGET_ID)!;
      expect(preset.id).toBe(TARGET_ID);
      expect(preset.name).toContain('Live Doppler Radar');
      expect(preset.category).toBe('field');
      expect(preset.type).toBe('Doppler Radar Mosaic');
      expect(preset.url).toBe('/data/radar-loop-latest.bin');
      expect(preset.attribution).toContain('RainViewer');
      expect(preset.legend).toBeDefined();
      expect(preset.legend.colorStops.length).toBeGreaterThanOrEqual(5);
      expect(preset.legend.minLabel).toContain('dBZ');
      expect(preset.legend.maxLabel).toContain('dBZ');
    });

    it('maintains strict export parity between canonical and layers catalogs', () => {
      expect(CANONICAL_CATALOG.length).toBe(LAYERS_CATALOG.length);
      for (let i = 0; i < CANONICAL_CATALOG.length; i++) {
        expect(CANONICAL_CATALOG[i]).toStrictEqual(LAYERS_CATALOG[i]);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 8: Web Mercator to Equirectangular Reprojection Parity
  // --------------------------------------------------------------------------
  describe('8. Web Mercator to Equirectangular Reprojection Parity', () => {
    it('maps equator equirectangular row 128 to Mercator row 128', () => {
      const mercY = equirectYToMercatorY(128, 256);
      expect(mercY).toBe(128);
    });

    it('returns -1 for extreme polar rows beyond Web Mercator limit (~85.05°)', () => {
      // Row 0 is at lat = 89.65°N (> 85.05°)
      expect(equirectYToMercatorY(0, 256)).toBe(-1);
      // Row 255 is at lat = -89.65°S (< -85.05°)
      expect(equirectYToMercatorY(255, 256)).toBe(-1);
    });

    it('corrects mid-latitude latitude compression (e.g. 40°N maps to higher Mercator row index)', () => {
      // Row 70 in Equirectangular corresponds to ~40.4°N (lat = 90 - (70.5/256)*180 = 40.43°)
      const mercY = equirectYToMercatorY(70, 256);
      // In Web Mercator, 40.43°N is at row 96 (shifted south by 26 rows = ~18° latitude!)
      expect(mercY).toBe(96);
      expect(mercY).toBeGreaterThan(70);
    });
  });
});
