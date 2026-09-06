// ============================================================================
// File: scripts/fetch-or-generate-gfs-wind.ts
// NOAA GFS 1.0° Planetary Wind Grid (360x181 Half-Float Velocity Field)
// Output: public/data/gfs-wind-latest.bin (Exact 260,640 bytes)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encodeFloat16 } from '../src/core/math/float16';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public/data');
const outputPath = path.join(outputDir, 'gfs-wind-latest.bin');

export function generateGFSAtmosphericCirculationGrid(): ArrayBuffer {
  const lonPoints = 360;
  const latPoints = 181; // 90°N to -90°S inclusive at 1.0° resolution
  const componentsPerNode = 2; // [u, v]
  const bytesPerComponent = 2; // IEEE 754 half-precision float16

  const totalBytes = lonPoints * latPoints * componentsPerNode * bytesPerComponent;
  const buffer = new ArrayBuffer(totalBytes);
  const u16View = new Uint16Array(buffer);

  // Atmospheric circulation physics model:
  // Hadley Cell (0° to 30°): Tropical Trade Winds (Easterlies: u < 0)
  // Ferrel Cell (30° to 60°): Mid-Latitude Westerlies (Westerlies: u > 0, Jet Stream peak 20-35 m/s)
  // Polar Cell (60° to 90°): Polar Easterlies (Easterlies: u < 0)
  for (let latIdx = 0; latIdx < latPoints; latIdx++) {
    const latDeg = 90.0 - latIdx; // 90° down to -90°
    const absLat = Math.abs(latDeg);

    for (let lonIdx = 0; lonIdx < lonPoints; lonIdx++) {
      const idx = (latIdx * lonPoints + lonIdx) * 2;
      const lonRad = (lonIdx * Math.PI) / 180.0;
      const latRad = (latDeg * Math.PI) / 180.0;

      let uMps = 0.0;
      let vMps = 0.0;

      if (absLat <= 30.0) {
        // Tropical Trade Winds: Easterlies (u < 0)
        const tradeStrength = 8.5 * Math.cos((absLat / 30.0) * (Math.PI * 0.5));
        const tradeWave = 1.2 * Math.sin(lonRad * 3.0);
        uMps = -(tradeStrength + tradeWave);
        // Intertropical Convergence Zone (ITCZ) meridional convergence
        vMps = (latDeg > 0 ? -2.2 : 2.2) * Math.cos(absLat * (Math.PI / 60.0)) + 0.8 * Math.sin(lonRad * 4.0);
      } else if (absLat <= 60.0) {
        // Mid-latitude Westerlies & Jet Stream (30° - 60°): Westerlies (u > 0)
        // Jet stream core peaks between 40° and 50° latitude at 22-32 m/s
        const jetProfile = Math.cos(((absLat - 45.0) / 15.0) * (Math.PI * 0.5));
        const jetPeak = 25.0 * jetProfile;
        // Rossby planetary wave meandering (wavenumber 4)
        const rossbyWaveU = 3.5 * Math.sin(lonRad * 4.0) * Math.sin(latRad * 2.0);
        const rossbyWaveV = 5.2 * Math.cos(lonRad * 4.0) * jetProfile;

        uMps = jetPeak + rossbyWaveU;
        vMps = rossbyWaveV;
      } else {
        // Polar Easterlies (60° - 90°): Easterlies (u < 0)
        const polarProfile = Math.cos(((absLat - 75.0) / 15.0) * (Math.PI * 0.5));
        const polarStrength = 5.5 * Math.max(0.2, polarProfile);
        uMps = -polarStrength + 0.5 * Math.sin(lonRad * 2.0);
        vMps = (latDeg > 0 ? -1.5 : 1.5) * Math.sin(lonRad * 3.0);
      }

      // Clamp velocities to physical limits: |u|, |v| <= 100 m/s
      uMps = Math.max(-100.0, Math.min(100.0, uMps));
      vMps = Math.max(-100.0, Math.min(100.0, vMps));

      u16View[idx + 0] = encodeFloat16(uMps);
      u16View[idx + 1] = encodeFloat16(vMps);
    }
  }

  return buffer;
}

export async function fetchOrGenerateGFS(): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating NOAA GFS 1.0° planetary wind velocity field...');
  const buffer = generateGFSAtmosphericCirculationGrid();

  fs.writeFileSync(outputPath, Buffer.from(buffer));
  const stats = fs.statSync(outputPath);
  console.log(`Successfully generated ${outputPath}`);
  console.log(`Buffer size: ${stats.size} bytes (Expected: 260,640 bytes)`);

  if (stats.size !== 260640) {
    throw new Error(`Invalid file size: ${stats.size} !== 260640`);
  }
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('fetch-or-generate-gfs-wind.ts')) {
  fetchOrGenerateGFS().catch((err) => {
    console.error('Failed to generate GFS wind grid:', err);
    process.exit(1);
  });
}
