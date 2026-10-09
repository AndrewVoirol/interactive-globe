import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GeoTIFFDataSource, GeoTIFFMetadata } from '../../src/core/data/GeoTIFFDataSource';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { BoundingBox3D } from '../../src/core/data/IDataSource';

function createSyntheticCOG(width = 512, height = 512, tileW = 256, tileH = 256) {
  const tileBytes = tileW * tileH * 4; // float32
  const tilesAcross = Math.ceil(width / tileW);
  const tilesDown = Math.ceil(height / tileH);
  const totalTiles = tilesAcross * tilesDown;

  // Header (8 bytes) + IFD (2 + 10 * 12 + 4 = 126 bytes) + Offsets & Counts arrays
  const offsetsArrayPtr = 256;
  const countsArrayPtr = offsetsArrayPtr + totalTiles * 4;
  const tileDataPtr = 1024;

  const totalSize = tileDataPtr + totalTiles * tileBytes;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // Header: 'II' (0x4949), 42, IFD0 at offset 8
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  // IFD0 entries
  let p = 8;
  const numEntries = 10;
  view.setUint16(p, numEntries, true);
  p += 2;

  function writeTag(tag: number, type: number, count: number, valOrOffset: number) {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    view.setUint32(p + 8, valOrOffset, true);
    p += 12;
  }

  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 1, 32); // BitsPerSample
  writeTag(259, 3, 1, 1); // Compression (1 = none)
  writeTag(277, 3, 1, 1); // SamplesPerPixel
  writeTag(322, 4, 1, tileW); // TileWidth
  writeTag(323, 4, 1, tileH); // TileLength
  writeTag(324, 4, totalTiles, offsetsArrayPtr); // TileOffsets
  writeTag(325, 4, totalTiles, countsArrayPtr); // TileByteCounts
  writeTag(339, 3, 1, 3); // SampleFormat (3 = float)
  view.setUint32(p, 0, true); // Next IFD

  // Populate TileOffsets and TileByteCounts
  for (let t = 0; t < totalTiles; t++) {
    view.setUint32(offsetsArrayPtr + t * 4, tileDataPtr + t * tileBytes, true);
    view.setUint32(countsArrayPtr + t * 4, tileBytes, true);

    // Fill tile with distinctive elevation value
    const floatView = new Float32Array(buf.buffer, tileDataPtr + t * tileBytes, tileW * tileH);
    for (let i = 0; i < floatView.length; i++) {
      floatView[i] = 100.0 * (t + 1) + (i % tileW);
    }
  }

  return buf;
}

describe('Cloud-Optimized GeoTIFF (COG) Regional Streaming Pipeline', () => {
  const hawaiiBounds: BoundingBox3D = {
    minLon: -161.0,
    maxLon: -154.0,
    minLat: 18.0,
    maxLat: 23.0,
    minAlt: 0,
    maxAlt: 4200,
  };

  // ==========================================================================
  // Section 1: GeoTIFFDataSource Architecture & URL Normalization
  // ==========================================================================
  describe('1. GeoTIFFDataSource Architecture & Normalization', () => {
    it('initializes with streaming raster category and standard 256x256 dimensions', () => {
      const source = new GeoTIFFDataSource('hawaii-cog');
      expect(source.id).toBe('hawaii-cog');
      expect(source.type).toBe('raster');
      expect(source.isStreaming).toBe(true);
      expect(source.isConnected).toBe(false);
      expect(source.getCachedTileCount()).toBe(0);
    });

    it('normalizes regional identifiers into standard /regional/{region}.cog.tif paths', () => {
      const source = new GeoTIFFDataSource();
      expect(source.normalizeUrl('hawaii')).toBe('/regional/hawaii.cog.tif');
      expect(source.normalizeUrl('capecod')).toBe('/regional/capecod.cog.tif');
      expect(source.normalizeUrl('dem-grand-canyon-30m')).toBe('/regional/dem-grand-canyon-30m.cog.tif');
      expect(source.normalizeUrl('/regional/fuji.cog.tif')).toBe('/regional/fuji.cog.tif');
      expect(source.normalizeUrl('https://example.com/cog/alps.cog.tif')).toBe('https://example.com/cog/alps.cog.tif');
    });
  });

  // ==========================================================================
  // Section 2: HTTP Range-Request Header & Tile Ingestion
  // ==========================================================================
  describe('2. HTTP Range-Request Header & Tile Ingestion', () => {
    it('parses TIFF header and extracts tile geometry and byte offsets correctly', () => {
      const syntheticCOG = createSyntheticCOG(512, 512, 256, 256);
      const source = new GeoTIFFDataSource();
      const parsed = source.parseTIFFHeaderAndIFD(syntheticCOG.buffer);

      expect(parsed).not.toBeNull();
      expect(parsed?.metadata.width).toBe(512);
      expect(parsed?.metadata.height).toBe(512);
      expect(parsed?.metadata.tileWidth).toBe(256);
      expect(parsed?.metadata.tileHeight).toBe(256);
      expect(parsed?.metadata.tilesAcross).toBe(2);
      expect(parsed?.metadata.tilesDown).toBe(2);
      expect(parsed?.tileOffsets).toHaveLength(4);
      expect(parsed?.tileByteCounts).toHaveLength(4);
      expect(parsed?.tileByteCounts[0]).toBe(256 * 256 * 4);
    });

    it('reads individual 256x256 tile using HTTP Range header without reading full array', async () => {
      const syntheticCOG = createSyntheticCOG(512, 512, 256, 256);
      const rangeRequests: string[] = [];

      // Intercept fetch to track HTTP Range headers
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const rangeHeader = (init?.headers as any)?.Range || (init?.headers as any)?.range || '';
        if (rangeHeader) {
          rangeRequests.push(rangeHeader);
          const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = parseInt(match[2], 10);
            const slice = syntheticCOG.buffer.slice(start, end + 1);
            return new Response(slice, {
              status: 206,
              statusText: 'Partial Content',
              headers: { 'Content-Range': `bytes ${start}-${end}/${syntheticCOG.byteLength}` },
            });
          }
        }
        return new Response(syntheticCOG.buffer, { status: 200 });
      });

      try {
        const source = new GeoTIFFDataSource('hawaii-test', '/regional/hawaii.cog.tif');
        const connected = await source.connect('/regional/hawaii.cog.tif');
        expect(connected).toBe(true);

        // Header query sent Range: bytes=0-65535
        expect(rangeRequests.length).toBeGreaterThan(0);
        expect(rangeRequests[0]).toBe('bytes=0-65535');

        // Now query tile (1, 0)
        rangeRequests.length = 0;
        const tileData = await source.fetchTile(1, 0, 0);

        // Assert exact HTTP Range request was sent for tile (1, 0)
        expect(rangeRequests).toHaveLength(1);
        expect(rangeRequests[0]).toMatch(/^bytes=\d+-\d+$/);

        // Verify tile dimensions: 256x256 = 65,536 elements
        expect(tileData).toHaveLength(256 * 256);
        // Tile index 1 should have base elevation around 200m
        expect(tileData[0]).toBeCloseTo(200.0, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('caches queried 256x256 tiles so repeated queries produce zero network requests', async () => {
      const syntheticCOG = createSyntheticCOG(512, 512, 256, 256);
      let fetchCallCount = 0;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        fetchCallCount++;
        const rangeHeader = (init?.headers as any)?.Range || '';
        const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = parseInt(match[2], 10);
          return new Response(syntheticCOG.buffer.slice(start, end + 1), { status: 206 });
        }
        return new Response(syntheticCOG.buffer, { status: 200 });
      });

      try {
        const source = new GeoTIFFDataSource('hawaii-test');
        await source.connect('/regional/hawaii.cog.tif');
        const countAfterConnect = fetchCallCount;

        // Tile (0, 0) is not cached initially
        expect(source.isTileCached(0, 0, 0)).toBe(false);

        // 1st Fetch: un-cached -> queries range
        const tile1 = await source.fetchTile(0, 0, 0);
        expect(source.isTileCached(0, 0, 0)).toBe(true);
        expect(source.getCachedTileCount()).toBe(1);
        expect(fetchCallCount).toBe(countAfterConnect + 1);

        // 2nd Fetch: cached -> returns in-memory without network request
        const tile2 = await source.fetchTile(0, 0, 0);
        expect(fetchCallCount).toBe(countAfterConnect + 1); // NO NEW FETCH
        expect(tile1).toBe(tile2); // Strict reference equality
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('strictly fails and returns false on HTTP 404 without activating procedural fallback', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      });

      try {
        const source = new GeoTIFFDataSource('hawaii-404');
        const connected = await source.connect('/regional/missing.cog.tif');
        expect(connected).toBe(false);
        expect(source.isConnected).toBe(false);
        expect(source.metadata).toBeNull();
        await expect(source.fetchTile(0, 0, 0)).rejects.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('activates procedural synthetic metadata for explicit mock:// endpoints', async () => {
      const source = new GeoTIFFDataSource('mock-cog');
      const connected = await source.connect('mock://hawaii.cog.tif');
      expect(connected).toBe(true);
      expect(source.isConnected).toBe(true);
      expect(source.metadata?.width).toBe(256);
      const tile = await source.fetchTile(0, 0, 0);
      expect(tile).toHaveLength(256 * 256);
    });
  });

  // ==========================================================================
  // Section 3: WebGPUEngine Integration & Dynamic Inset Streaming
  // ==========================================================================
  describe('3. WebGPUEngine Integration & Dynamic Inset Streaming', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('verifies engine exposes initialized GeoTIFFDataSource instance', () => {
      expect(engine.geoTIFFDataSource).toBeDefined();
      expect(engine.geoTIFFDataSource).toBeInstanceOf(GeoTIFFDataSource);
      expect(engine.geoTIFFDataSource.isStreaming).toBe(true);
    });

    it('checks cache status via isRegionalTileCached before issuing query', () => {
      const bounds = { minLon: -160.0, maxLon: -155.0, minLat: 19.0, maxLat: 22.0 };
      expect(engine.isRegionalTileCached(bounds, 10)).toBe(false);
    });

    it('streams regional COG tile and activates 256x256 rgba16float regional overlay', async () => {
      const bounds = { minLon: -160.0, maxLon: -155.0, minLat: 19.0, maxLat: 22.0 };
      const syntheticCOG = createSyntheticCOG(512, 512, 256, 256);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const rangeHeader = (init?.headers as any)?.Range || '';
        const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = parseInt(match[2], 10);
          return new Response(syntheticCOG.buffer.slice(start, end + 1), { status: 206 });
        }
        return new Response(syntheticCOG.buffer, { status: 200 });
      });

      try {
        // Mock GPUDevice
        const mockTextureView = {} as any;
        const mockTexture = {
          format: 'rgba16float',
          createView: vi.fn().mockReturnValue(mockTextureView),
          destroy: vi.fn(),
        } as any;
        const mockBuffer = { destroy: vi.fn() } as any;

        (engine as any).device = {
          createTexture: vi.fn().mockReturnValue(mockTexture),
          createBuffer: vi.fn().mockReturnValue(mockBuffer),
          createBindGroup: vi.fn().mockReturnValue({}),
          queue: {
            writeTexture: vi.fn(),
            writeBuffer: vi.fn(),
          },
        };
        (engine as any).isInitialized = true;

        // Stream regional tile
        const success = await engine.streamRegionalCOGTile('hawaii', bounds, 10);
        expect(success).toBe(true);

        // Verify regional DEM texture was registered with 256x256 dimensions
        const entry = engine.getRegionalDEMTexture('hawaii');
        expect(entry).not.toBeNull();
        expect(entry?.width).toBe(256);
        expect(entry?.height).toBe(256);
        expect(entry?.id).toBe('hawaii');

        // Verify active regional DEM tracking
        expect(engine.getActiveRegionalDEM()).toBe('hawaii');
        expect(engine.getActiveRegionalBounds()).toEqual([-160.0, 19.0, -155.0, 22.0]);
        expect(engine.hasActiveRegionalDEM).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('loadRegionalDEMTexture routes .cog.tif paths to streamRegionalCOGTile automatically', async () => {
      const bounds = { minLon: -70.5, maxLon: -69.5, minLat: 41.5, maxLat: 42.5 };
      const streamSpy = vi.spyOn(engine, 'streamRegionalCOGTile').mockResolvedValue(true);

      await engine.loadRegionalDEMTexture('/regional/capecod.cog.tif', bounds, 2048, 2048, 'capecod');

      expect(streamSpy).toHaveBeenCalledTimes(1);
      expect(streamSpy).toHaveBeenCalledWith('capecod', bounds, 10, '/regional/capecod.cog.tif');
    });
  });

  // ==========================================================================
  // Section 4: GDAL COG Conversion Script CLI Validation
  // ==========================================================================
  describe('4. GDAL COG Conversion Script (scripts/convert-regional-to-cog.sh)', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/convert-regional-to-cog.sh');

    it('verifies script exists, is executable, and contains required GDAL flags', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
      const stat = fs.statSync(scriptPath);
      // Executable bit check
      expect(stat.mode & 0o111).toBeGreaterThan(0);

      const content = fs.readFileSync(scriptPath, 'utf8');
      expect(content).toContain('gdal_translate');
      expect(content).toContain('-of COG');
      expect(content).toContain('-co COMPRESS=DEFLATE');
      expect(content).toContain('-co BLOCKSIZE');
      expect(content).toContain('-co OVERVIEWS=AUTO');
    });

    it('executes --help cleanly with zero exit code and documents tile pyramid options', () => {
      const output = execSync(`${scriptPath} --help`, { encoding: 'utf8' });
      expect(output).toContain('Usage:');
      expect(output).toContain('convert-regional-to-cog.sh');
      expect(output).toContain('Cloud-Optimized GeoTIFF');
      expect(output).toContain('blocksize');
      expect(output).toContain('256');
    });

    it('exits with error code 1 when input GeoTIFF does not exist', () => {
      expect(() => {
        execSync(`${scriptPath} /nonexistent/dem.tif`, { encoding: 'utf8', stdio: 'pipe' });
      }).toThrow();
    });
  });
});
