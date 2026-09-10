// ============================================================================
// File: scripts/fetch-or-generate-gfs-clouds.ts
// NOAA GFS 0.25° Global Multi-Altitude Cloud Ingestion & Procedural Fallback
// Output:
//   - public/data/gfs-cloud-low-latest.bin  (1440x721 Float16, 2,076,480 bytes)
//   - public/data/gfs-cloud-mid-latest.bin  (1440x721 Float16, 2,076,480 bytes)
//   - public/data/gfs-cloud-high-latest.bin (1440x721 Float16, 2,076,480 bytes)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { encodeFloat16 } from '../src/core/math/float16';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public/data');

export const GFS_CLOUD_WIDTH = 1440;
export const GFS_CLOUD_HEIGHT = 721;
export const GFS_CLOUD_BYTES_PER_NODE = 2; // IEEE 754 half-precision float16
export const GFS_CLOUD_FILE_SIZE = GFS_CLOUD_WIDTH * GFS_CLOUD_HEIGHT * GFS_CLOUD_BYTES_PER_NODE; // 2,076,480 bytes

/**
 * Computes WebGPU row pitch alignment according to Invariant §40 (256-byte alignment).
 */
export function computeWebGPURowPitch(width = GFS_CLOUD_WIDTH, height = GFS_CLOUD_HEIGHT, bytesPerPixel = GFS_CLOUD_BYTES_PER_NODE) {
  const rawRowBytes = width * bytesPerPixel;
  const paddedRowBytes = Math.ceil(rawRowBytes / 256) * 256;
  const uploadBufferSize = paddedRowBytes * height;
  return {
    rawRowBytes,
    paddedRowBytes,
    uploadBufferSize,
    rows: height,
    isAligned: rawRowBytes % 256 === 0,
  };
}

/**
 * Generates realistic procedural multi-layer cloud fraction grids (0.25° resolution, 1440x721).
 * Features:
 *   1. Low Layer (LCDC, ~1-2 km): Marine stratocumulus decks (California, Peru, Benguela, Canaries),
 *      Roaring Forties subpolar ocean deck, and subtropical desert suppression.
 *   2. Mid Layer (MCDC, ~4-6 km): ITCZ equatorial convective band with planetary wave perturbation,
 *      and mid-latitude cyclonic storm tracks modulated by Rossby waves.
 *   3. High Layer (HCDC, ~10-12 km): Polar/subtropical jet stream cirrus filaments and
 *      Indo-Pacific Warm Pool convective outflow anvils.
 */
export function generateProceduralCloudGrids(): {
  lowBuf: ArrayBuffer;
  midBuf: ArrayBuffer;
  highBuf: ArrayBuffer;
} {
  const ni = GFS_CLOUD_WIDTH;
  const nj = GFS_CLOUD_HEIGHT;
  const totalBytes = GFS_CLOUD_FILE_SIZE;

  const lowBuf = new ArrayBuffer(totalBytes);
  const midBuf = new ArrayBuffer(totalBytes);
  const highBuf = new ArrayBuffer(totalBytes);

  const lowU16 = new Uint16Array(lowBuf);
  const midU16 = new Uint16Array(midBuf);
  const highU16 = new Uint16Array(highBuf);

  for (let j = 0; j < nj; j++) {
    const latDeg = 90.0 - j * 0.25; // 90° down to -90°
    const latRad = (latDeg * Math.PI) / 180.0;
    const absLat = Math.abs(latDeg);
    const cosLat = Math.max(0.04, Math.cos(latRad));

    // Precalculate latitude-only terms
    let baseLowBelt = 0.05;
    if (latDeg <= -40.0 && latDeg >= -68.0) {
      baseLowBelt += 0.65 * Math.max(0, Math.cos(((latDeg - -54.0) / 14.0) * (Math.PI * 0.5)));
    } else if (latDeg >= 40.0 && latDeg <= 68.0) {
      baseLowBelt += 0.50 * Math.max(0, Math.cos(((latDeg - 54.0) / 14.0) * (Math.PI * 0.5)));
    }

    const dLatCal = latDeg - 30.0;
    const isNearCal = Math.abs(dLatCal) < 22.0;

    const dLatPeru = latDeg - -18.0;
    const isNearPeru = Math.abs(dLatPeru) < 25.0;

    const dLatBeng = latDeg - -20.0;
    const isNearBeng = Math.abs(dLatBeng) < 20.0;

    const dLatCan = latDeg - 28.0;
    const isNearCan = Math.abs(dLatCan) < 18.0;

    const isSaharaLat = latDeg >= 14.0 && latDeg <= 32.0;
    const isAusLat = latDeg >= -30.0 && latDeg <= -18.0;
    const isAtacamaLat = latDeg >= -28.0 && latDeg <= -18.0;

    const isITCZLat = latDeg >= -2.0 && latDeg <= 14.0;
    const isJetLat = absLat >= 28.0 && absLat <= 68.0;
    const isWarmPoolLat = latDeg >= -12.0 && latDeg <= 18.0;
    const warmPoolLatFactor = isWarmPoolLat ? Math.cos((latDeg / 18.0) * (Math.PI * 0.5)) : 0;

    const latPhaseLow = latRad * 9.0;
    const latPhaseMid = latRad * 5.0;
    const latPhaseHigh = latRad * 12.0;

    for (let i = 0; i < ni; i++) {
      const idx = j * ni + i;
      const lonDeg = i * 0.25; // 0° to 359.75°
      const lonRad = (lonDeg * Math.PI) / 180.0;

      // ----------------------------------------------------------------------
      // 1. Low Clouds (LCDC, ~1-2 km): Stratus, marine stratocumulus, fog
      // ----------------------------------------------------------------------
      let lowF = baseLowBelt;

      // Marine stratocumulus banks over cold upwelling currents:
      if (isNearCal) {
        const distCal = Math.hypot((lonDeg - 235.0) * cosLat, dLatCal);
        if (distCal < 22.0) lowF += 0.70 * Math.exp((-distCal * distCal) / 150.0);
      }

      if (isNearPeru) {
        const distPeru = Math.hypot((lonDeg - 285.0) * cosLat, dLatPeru);
        if (distPeru < 25.0) lowF += 0.75 * Math.exp((-distPeru * distPeru) / 180.0);
      }

      if (isNearBeng) {
        const distBeng = Math.hypot((lonDeg - 10.0) * cosLat, dLatBeng);
        if (distBeng < 20.0) lowF += 0.70 * Math.exp((-distBeng * distBeng) / 140.0);
      }

      if (isNearCan) {
        const distCan = Math.hypot((lonDeg - 340.0) * cosLat, dLatCan);
        if (distCan < 18.0) lowF += 0.60 * Math.exp((-distCan * distCan) / 120.0);
      }

      // Subtropical high subsidence / desert low cloud suppression
      if (isSaharaLat && lonDeg >= 0.0 && lonDeg <= 58.0) {
        lowF *= 0.15;
      } else if (isAusLat && lonDeg >= 115.0 && lonDeg <= 145.0) {
        lowF *= 0.18;
      } else if (isAtacamaLat && lonDeg >= 288.0 && lonDeg <= 293.0) {
        lowF *= 0.15;
      }

      // High-frequency cellular cumulus texture
      const lowRipple = 0.07 * Math.sin(lonRad * 14.0 * cosLat + latPhaseLow);
      lowF = Math.max(0.0, Math.min(1.0, lowF + lowRipple));

      // ----------------------------------------------------------------------
      // 2. Mid Clouds (MCDC, ~4-6 km): Altocumulus, storm tracks, ITCZ
      // ----------------------------------------------------------------------
      let midF = 0.08;

      // Intertropical Convergence Zone (ITCZ) equatorial convective belt (~2°S to 12°N)
      if (isITCZLat) {
        const itczWave = 3.5 * Math.sin(lonRad * 3.0 + 0.4);
        const itczProfile = Math.cos(((latDeg - (6.0 + itczWave)) / 7.5) * (Math.PI * 0.5));
        midF += 0.55 * Math.max(0, itczProfile);
      }

      // Mid-latitude storm tracks with planetary Rossby wave meanders
      const rossbyNorth = 48.0 + 8.0 * Math.sin(lonRad * 4.0 + 0.5);
      const distStormN = Math.abs(latDeg - rossbyNorth);
      if (distStormN < 20.0) {
        midF += 0.60 * Math.cos((distStormN / 20.0) * (Math.PI * 0.5));
      }

      const rossbySouth = -50.0 + 7.0 * Math.sin(lonRad * 5.0 - 0.3);
      const distStormS = Math.abs(latDeg - rossbySouth);
      if (distStormS < 20.0) {
        midF += 0.65 * Math.cos((distStormS / 20.0) * (Math.PI * 0.5));
      }

      // Frontal spiral modulation
      const midSpiral = 0.09 * Math.sin(lonRad * 7.0 + latPhaseMid);
      midF = Math.max(0.0, Math.min(1.0, midF + midSpiral));

      // ----------------------------------------------------------------------
      // 3. High Clouds (HCDC, ~10-12 km): Cirrus filaments, convective anvils
      // ----------------------------------------------------------------------
      let highF = 0.05;

      // Jet stream cirrus corridors (30° to 65° latitude)
      if (isJetLat) {
        const jetAxis = (latDeg > 0 ? 49.0 : -51.0) + 6.5 * Math.sin(lonRad * 4.0 + 0.2);
        const jetDist = Math.abs(latDeg - jetAxis);
        if (jetDist < 16.0) {
          const jetCirrus = Math.cos((jetDist / 16.0) * (Math.PI * 0.5));
          const wisps = 0.14 * Math.sin(lonRad * 16.0 + latRad * 6.0);
          highF += 0.52 * Math.max(0, jetCirrus) + wisps;
        }
      }

      // Indo-Pacific Warm Pool tropical cirrostratus outflow (95°E-165°E, 12°S-18°N)
      if (isWarmPoolLat && lonDeg >= 95.0 && lonDeg <= 165.0) {
        highF += 0.45 * Math.sin(((lonDeg - 95.0) / 70.0) * Math.PI) * warmPoolLatFactor;
      }

      // High-frequency fibrous wisps
      const highWisps = 0.06 * Math.sin(lonRad * 22.0 + latPhaseHigh);
      highF = Math.max(0.0, Math.min(1.0, highF + highWisps));

      // Encode IEEE 754 half-precision float16 little-endian
      lowU16[idx] = encodeFloat16(lowF);
      midU16[idx] = encodeFloat16(midF);
      highU16[idx] = encodeFloat16(highF);
    }
  }

  return { lowBuf, midBuf, highBuf };
}

/**
 * Main ingestion / generation entrypoint.
 * Attempts live NOAA GFS NOMADS ingestion via scripts/fetch-real-gfs.py --clouds.
 * If live ingestion fails, gracefully executes analytical procedural generation.
 */
export async function fetchOrGenerateGFSClouds(): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lowPath = path.join(outputDir, 'gfs-cloud-low-latest.bin');
  const midPath = path.join(outputDir, 'gfs-cloud-mid-latest.bin');
  const highPath = path.join(outputDir, 'gfs-cloud-high-latest.bin');

  // 1. Attempt live ingestion from NOAA NOMADS via fetch-real-gfs.py --clouds
  const pythonScript = path.join(projectRoot, 'scripts/fetch-real-gfs.py');
  if (fs.existsSync(pythonScript)) {
    try {
      console.log('Attempting live NOAA GFS cloud ingestion from NOMADS (LCDC, MCDC, HCDC)...');
      execSync(`uv run --with eccodes,numpy python3 "${pythonScript}" --clouds`, {
        cwd: projectRoot,
        stdio: 'inherit',
        timeout: 60000,
      });

      if (
        fs.existsSync(lowPath) && fs.statSync(lowPath).size === GFS_CLOUD_FILE_SIZE &&
        fs.existsSync(midPath) && fs.statSync(midPath).size === GFS_CLOUD_FILE_SIZE &&
        fs.existsSync(highPath) && fs.statSync(highPath).size === GFS_CLOUD_FILE_SIZE
      ) {
        console.log('[OK] Live NOAA GFS cloud fraction grids successfully ingested.');
        return;
      }
    } catch (err: any) {
      console.warn('Live NOAA GFS cloud ingestion failed or timed out; engaging analytical procedural fallback:', err?.message || err);
    }
  }

  // 2. Analytical atmospheric multi-layer cloud fallback
  console.log('Generating procedural NOAA GFS 0.25° multi-layer cloud fraction grids...');
  const t0 = Date.now();
  const { lowBuf, midBuf, highBuf } = generateProceduralCloudGrids();
  const durationMs = Date.now() - t0;

  fs.writeFileSync(lowPath, Buffer.from(lowBuf));
  fs.writeFileSync(midPath, Buffer.from(midBuf));
  fs.writeFileSync(highPath, Buffer.from(highBuf));

  console.log(`[OK] Successfully generated cloud grids in ${durationMs}ms:`);
  console.log(`  - Low:  ${lowPath} (${fs.statSync(lowPath).size.toLocaleString()} bytes)`);
  console.log(`  - Mid:  ${midPath} (${fs.statSync(midPath).size.toLocaleString()} bytes)`);
  console.log(`  - High: ${highPath} (${fs.statSync(highPath).size.toLocaleString()} bytes)`);
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('fetch-or-generate-gfs-clouds.ts')) {
  fetchOrGenerateGFSClouds().catch((err) => {
    console.error('Failed to generate GFS cloud grids:', err);
    process.exit(1);
  });
}
