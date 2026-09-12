// ============================================================================
// File: scripts/fetch-live-radar.ts
// Live Doppler Radar Nowcasting Ingestion Script
// Source: RainViewer Public API (https://api.rainviewer.com/public/weather-maps.json)
// Packs a rolling 12-frame loop of global radar composite tiles into a single
// binary Float16 texture atlas (<= 2 MB) and JSON metadata.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';
import { encodeFloat16 } from '../src/core/math/float16';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const defaultOutputDir = path.join(projectRoot, 'public/data');

export const RAINVIEWER_API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
export const RADAR_FRAME_COUNT = 12;
export const RADAR_TILE_WIDTH = 256;
export const RADAR_TILE_HEIGHT = 256;
export const RADAR_BYTES_PER_PIXEL = 2; // Float16
export const RADAR_FRAME_BYTES = RADAR_TILE_WIDTH * RADAR_TILE_HEIGHT * RADAR_BYTES_PER_PIXEL; // 131,072 bytes
export const RADAR_TOTAL_BYTES = RADAR_FRAME_COUNT * RADAR_FRAME_BYTES; // 1,572,864 bytes (~1.5 MB <= 2 MB)

export interface RainViewerFrame {
  time: number;
  path: string;
}

export interface RainViewerManifest {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: RainViewerFrame[];
    nowcast: RainViewerFrame[];
  };
  satellite?: {
    infrared: any[];
  };
}

export interface RadarLoopMetadata {
  source: string;
  generatedAt: string;
  frameCount: number;
  frameIntervalMinutes: number;
  timeRangeMinutes: [number, number];
  width: number;
  height: number;
  bytesPerPixel: number;
  format: string;
  unit: string;
  fileSizeBytes: number;
  timestamps: number[];
  frameTimesUTC: string[];
}

/**
 * Decodes RainViewer color palette RGBA values to radar reflectivity in dBZ.
 * Follows the standard meteorological radar reflectivity tiers:
 * - Alpha < 10: Clear / No precipitation (0.0 dBZ)
 * - Deep Blue / Navy: Very light drizzle (~5 to 14 dBZ)
 * - Cyan / Blue: Light rain (~14 to 26 dBZ)
 * - Yellow: Moderate rain (~26 to 38 dBZ)
 * - Orange: Heavy rain (~38 to 44 dBZ)
 * - Red / Dark Red: Severe rain / downpour (~44 to 55 dBZ)
 * - Magenta / Purple: Severe convective storm (~55 to 65 dBZ)
 * - White: Extreme hail / severe core (>= 65 to 70 dBZ)
 * - Khaki / Ochre (alpha < 250): Snow / mixed precipitation (~15 to 25 dBZ)
 */
export function decodeColorToReflectivity(r: number, g: number, b: number, a: number): number {
  if (a < 10) return 0.0;

  // Extreme / Hail / White core
  if (r > 240 && g > 240 && b > 240) return 70.0;

  // Magenta / Purple (severe thunderstorm)
  if (r > 200 && b > 200 && g < 180) {
    return 60.0 + Math.min(5.0, (r - 200) / 11.0);
  }

  // Dark Red (high convective core)
  if (r > 80 && r < 190 && g < 50 && b < 50) return 52.0;

  // Pure Red (very heavy rain)
  if (r >= 190 && g < 60 && b < 50) return 46.0;

  // Orange / Red-orange (heavy rain)
  if (r > 200 && g >= 50 && g < 170 && b < 50) {
    return 38.0 + (1.0 - (g - 50) / 120.0) * 6.0;
  }

  // Yellow (moderate rain)
  if (r > 200 && g >= 170 && b < 60) {
    return 28.0 + ((255 - g) / 85.0) * 8.0;
  }

  // Cyan / Bright Blue (light rain)
  if (b > 180 && g > 150 && r < 160) {
    return 20.0 + ((g - 150) / 105.0) * 6.0;
  }

  // Medium Blue (drizzle to light rain)
  if (b > 150 && g > 80 && r < 100) {
    return 14.0 + ((g - 80) / 70.0) * 6.0;
  }

  // Deep Blue / Navy (faint drizzle trace)
  if (b > 60 && g <= 80 && r < 80) {
    return 8.0 + ((b - 60) / 195.0) * 6.0;
  }

  // Snow / mixed precip (partially transparent brownish-ochre tones)
  if (a < 250 && Math.abs(r - g) < 35 && b < r) {
    return 15.0 + (a / 255.0) * 10.0;
  }

  // General fallback for any remaining non-transparent colored pixels
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return 10.0 + (luminance / 255.0) * 35.0;
}

/**
 * Maximum latitude for Web Mercator (EPSG:3857) projection in degrees.
 * At arctan(sinh(pi)), latitude is ~85.0511287798°.
 */
export const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798;

/**
 * Converts an Equirectangular row index y (0 at 90°N to height-1 at 90°S)
 * into the corresponding Web Mercator source row index (0 to height-1).
 * Returns -1 if the latitude is outside Web Mercator coverage (polar caps).
 */
export function equirectYToMercatorY(
  yEquirect: number,
  height: number = RADAR_TILE_HEIGHT
): number {
  const lat = 90.0 - ((yEquirect + 0.5) / height) * 180.0;
  if (Math.abs(lat) >= WEB_MERCATOR_MAX_LATITUDE) {
    return -1;
  }
  const phiRad = (lat * Math.PI) / 180.0;
  const yNorm = 0.5 - Math.log(Math.tan(Math.PI / 4 + phiRad / 2)) / (2 * Math.PI);
  const srcY = Math.round(yNorm * height - 0.5);
  return Math.max(0, Math.min(height - 1, srcY));
}

/**
 * Converts a 256x256 PNG image buffer into a Float16 ArrayBuffer of reflectivity values.
 * By default reprojects from Web Mercator (EPSG:3857) to Equirectangular (EPSG:4326)
 * to align perfectly with the 3D planetary manifold and shader UV coordinates.
 */
export async function decodeRadarTileToFloat16(
  imageBuffer: Buffer | ArrayBuffer,
  width = RADAR_TILE_WIDTH,
  height = RADAR_TILE_HEIGHT,
  reprojectMercator = true
): Promise<ArrayBuffer> {
  const buf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
  const img = await loadImage(buf);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  const outBuffer = new ArrayBuffer(width * height * RADAR_BYTES_PER_PIXEL);
  const outView = new Uint16Array(outBuffer);

  if (reprojectMercator) {
    // Precompute Mercator source row for each Equirectangular target row
    const mercatorSourceY = new Int32Array(height);
    for (let y = 0; y < height; y++) {
      mercatorSourceY[y] = equirectYToMercatorY(y, height);
    }

    const zeroF16 = encodeFloat16(0.0);

    for (let y = 0; y < height; y++) {
      const srcY = mercatorSourceY[y];
      const targetRowOffset = y * width;

      if (srcY < 0) {
        // Polar cap beyond Web Mercator: clear echo (0 dBZ)
        for (let x = 0; x < width; x++) {
          outView[targetRowOffset + x] = zeroF16;
        }
      } else {
        const srcRowOffset = srcY * width * 4;
        for (let x = 0; x < width; x++) {
          const px = srcRowOffset + x * 4;
          const r = pixels[px];
          const g = pixels[px + 1];
          const b = pixels[px + 2];
          const a = pixels[px + 3];

          const dbz = decodeColorToReflectivity(r, g, b, a);
          outView[targetRowOffset + x] = encodeFloat16(dbz);
        }
      }
    }
  } else {
    for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      const dbz = decodeColorToReflectivity(r, g, b, a);
      outView[p] = encodeFloat16(dbz);
    }
  }

  return outBuffer;
}

/**
 * Generates a realistic synthetic global radar frame (256x256 Float16) as a resilient offline fallback.
 * Simulates active precipitation bands: ITCZ equatorial convection, mid-latitude cyclonic cold fronts,
 * and coastal orographic rain shadows.
 */
export function generateSyntheticRadarFrame(
  frameIndex: number,
  totalFrames = RADAR_FRAME_COUNT,
  width = RADAR_TILE_WIDTH,
  height = RADAR_TILE_HEIGHT
): ArrayBuffer {
  const outBuffer = new ArrayBuffer(width * height * RADAR_BYTES_PER_PIXEL);
  const outView = new Uint16Array(outBuffer);

  const timePhase = (frameIndex / totalFrames) * Math.PI * 2;

  for (let y = 0; y < height; y++) {
    const lat = 90.0 - (y / height) * 180.0;
    const latRad = (lat * Math.PI) / 180.0;

    for (let x = 0; x < width; x++) {
      const lon = (x / width) * 360.0 - 180.0;
      const lonRad = (lon * Math.PI) / 180.0;

      let dbz = 0.0;

      // 1. Equatorial Intertropical Convergence Zone (ITCZ) rain cells
      if (Math.abs(lat) < 12.0) {
        const wave = Math.sin(lonRad * 6.0 + timePhase) * Math.cos(latRad * 8.0);
        if (wave > 0.45) {
          dbz = Math.max(dbz, 25.0 + (wave - 0.45) * 60.0);
        }
      }

      // 2. Mid-latitude storm track fronts (40°N to 55°N and 40°S to 55°S)
      if ((lat >= 35 && lat <= 58) || (lat <= -35 && lat >= -58)) {
        const wave = Math.sin(lonRad * 4.0 - timePhase * 1.5 + latRad * 3.0);
        if (wave > 0.6) {
          dbz = Math.max(dbz, 30.0 + (wave - 0.6) * 55.0);
        }
      }

      // 3. Isolated convective cells
      const cell = Math.sin(lonRad * 12.0 + timePhase) * Math.cos(latRad * 14.0 - timePhase * 0.5);
      if (cell > 0.82) {
        dbz = Math.max(dbz, 45.0 + (cell - 0.82) * 80.0);
      }

      const clampedDbz = Math.min(70.0, Math.max(0.0, dbz));
      outView[y * width + x] = encodeFloat16(clampedDbz);
    }
  }

  return outBuffer;
}

/**
 * Queries the RainViewer public API for weather map metadata.
 */
export async function fetchRainViewerManifest(
  apiUrl = RAINVIEWER_API_URL
): Promise<RainViewerManifest> {
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Indicatrix-Engine-Doppler-Radar-Ingest/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`RainViewer API request failed: HTTP ${response.status} ${response.statusText}`);
  }

  const manifest = (await response.json()) as RainViewerManifest;
  if (!manifest || !manifest.radar || !Array.isArray(manifest.radar.past)) {
    throw new Error('Invalid RainViewer API response structure: missing radar.past array');
  }

  return manifest;
}

export interface FetchLiveRadarOptions {
  dryRun?: boolean;
  outputDir?: string;
  apiUrl?: string;
  useFallbackOnNetworkError?: boolean;
}

export interface FetchLiveRadarResult {
  success: boolean;
  dryRun: boolean;
  frameCount: number;
  timestamps: number[];
  binaryPath?: string;
  metadataPath?: string;
  bytesWritten?: number;
  usedFallback?: boolean;
}

/**
 * Main pipeline function to fetch, decode, and pack the live radar loop.
 */
export async function fetchLiveRadarLoop(
  options: FetchLiveRadarOptions = {}
): Promise<FetchLiveRadarResult> {
  const dryRun = Boolean(options.dryRun);
  const outputDir = options.outputDir || defaultOutputDir;
  const apiUrl = options.apiUrl || RAINVIEWER_API_URL;
  const useFallback = options.useFallbackOnNetworkError !== false;

  console.log('[Live Radar] Querying RainViewer public API at:', apiUrl);

  let manifest: RainViewerManifest | null = null;
  try {
    manifest = await fetchRainViewerManifest(apiUrl);
  } catch (err) {
    console.warn('[Live Radar] Network fetch failed:', err);
    if (dryRun || !useFallback) {
      throw err;
    }
  }

  // Determine selected rolling 12-frame window
  let selectedFrames: RainViewerFrame[] = [];
  if (manifest && manifest.radar.past.length > 0) {
    selectedFrames = manifest.radar.past.slice(-RADAR_FRAME_COUNT);
  }

  // If API had fewer than 12 frames or was unreachable in fallback mode, synthesize timestamps
  const timestamps: number[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  for (let i = 0; i < RADAR_FRAME_COUNT; i++) {
    if (i < selectedFrames.length) {
      timestamps.push(selectedFrames[i].time);
    } else {
      // 10-minute intervals backward from now
      const minutesAgo = (RADAR_FRAME_COUNT - 1 - i) * 10;
      timestamps.push(nowSec - minutesAgo * 60);
    }
  }

  // Handle dry-run mode
  if (dryRun) {
    console.log(`[Live Radar] Dry-run query completed successfully.`);
    console.log(`[Live Radar] Available radar timestamps (rolling ${timestamps.length}-frame loop):`);
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const iso = new Date(ts * 1000).toISOString();
      const pathInfo = selectedFrames[i]?.path || '(synthetic)';
      console.log(`  Frame ${(i + 1).toString().padStart(2, '0')}/${timestamps.length}: ${ts} (${iso}) -> ${pathInfo}`);
    }
    console.log('[Live Radar] Dry-run active: Zero bytes written to filesystem.');
    return {
      success: true,
      dryRun: true,
      frameCount: timestamps.length,
      timestamps,
    };
  }

  // Prepare destination directories
  fs.mkdirSync(outputDir, { recursive: true });
  const binaryPath = path.join(outputDir, 'radar-loop-latest.bin');
  const metadataPath = path.join(outputDir, 'radar-loop-meta.json');

  const packedBuffer = new ArrayBuffer(RADAR_TOTAL_BYTES);
  const packedBytes = new Uint8Array(packedBuffer);

  let usedFallback = false;

  // Download and decode frames
  if (manifest && selectedFrames.length === RADAR_FRAME_COUNT) {
    console.log(`[Live Radar] Downloading and decoding ${RADAR_FRAME_COUNT} radar composite frames...`);
    for (let i = 0; i < selectedFrames.length; i++) {
      const frame = selectedFrames[i];
      // Tile URL: host + path + /size/z/x/y/color/options.png
      const tileUrl = `${manifest.host}${frame.path}/${RADAR_TILE_WIDTH}/0/0/0/2/0_0.png`;
      try {
        const res = await fetch(tileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        const frameF16 = await decodeRadarTileToFloat16(arrayBuf);
        packedBytes.set(new Uint8Array(frameF16), i * RADAR_FRAME_BYTES);
        console.log(`  [OK] Frame ${i + 1}/${RADAR_FRAME_COUNT} (${frame.time}) downloaded & decoded.`);
      } catch (e) {
        console.warn(`  [WARN] Failed to fetch frame ${i + 1} (${tileUrl}), falling back to synthetic frame.`);
        const synth = generateSyntheticRadarFrame(i);
        packedBytes.set(new Uint8Array(synth), i * RADAR_FRAME_BYTES);
        usedFallback = true;
      }
    }
  } else {
    console.log(`[Live Radar] RainViewer live tiles unavailable; generating procedural radar fallback loop.`);
    for (let i = 0; i < RADAR_FRAME_COUNT; i++) {
      const synth = generateSyntheticRadarFrame(i);
      packedBytes.set(new Uint8Array(synth), i * RADAR_FRAME_BYTES);
    }
    usedFallback = true;
  }

  // Write packed binary texture atlas
  fs.writeFileSync(binaryPath, Buffer.from(packedBuffer));
  const stat = fs.statSync(binaryPath);
  console.log(`[Live Radar] Written ${stat.size} bytes to ${binaryPath} (target <= 2 MB, actual: ${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

  // Write metadata JSON
  const timeSpanMinutes = (timestamps.length > 1)
    ? Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60)
    : (RADAR_FRAME_COUNT - 1) * 10;

  const meta: RadarLoopMetadata = {
    source: 'RainViewer API (https://api.rainviewer.com/public/weather-maps.json)',
    generatedAt: new Date().toISOString(),
    frameCount: RADAR_FRAME_COUNT,
    frameIntervalMinutes: 10,
    timeRangeMinutes: [-timeSpanMinutes, 0],
    width: RADAR_TILE_WIDTH,
    height: RADAR_TILE_HEIGHT,
    bytesPerPixel: RADAR_BYTES_PER_PIXEL,
    format: 'r16float',
    unit: 'dBZ',
    fileSizeBytes: stat.size,
    timestamps,
    frameTimesUTC: timestamps.map((t) => new Date(t * 1000).toISOString()),
  };

  fs.writeFileSync(metadataPath, JSON.stringify(meta, null, 2), 'utf8');
  console.log(`[Live Radar] Written metadata to ${metadataPath}`);

  return {
    success: true,
    dryRun: false,
    frameCount: RADAR_FRAME_COUNT,
    timestamps,
    binaryPath,
    metadataPath,
    bytesWritten: stat.size,
    usedFallback,
  };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('fetch-live-radar.ts')) {
  const isDryRun = process.argv.includes('--dry-run');
  fetchLiveRadarLoop({ dryRun: isDryRun })
    .then((result) => {
      console.log(`[Live Radar] Execution complete. Success: ${result.success}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Live Radar] Fatal error:', err);
      process.exit(1);
    });
}
