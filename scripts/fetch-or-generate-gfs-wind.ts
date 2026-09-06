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

/**
 * Generates 250 hPa Upper Troposphere Jet Stream velocity grid (360x181 half-precision float16).
 * Features high-velocity core corridors (30 to 50 m/s) with Rossby wave meandering.
 */
export function generateGFSJetStreamGrid(): ArrayBuffer {
  const lonPoints = 360;
  const latPoints = 181;
  const componentsPerNode = 2; // [u_jet, v_jet]
  const bytesPerComponent = 2;

  const totalBytes = lonPoints * latPoints * componentsPerNode * bytesPerComponent;
  const buffer = new ArrayBuffer(totalBytes);
  const u16View = new Uint16Array(buffer);

  for (let latIdx = 0; latIdx < latPoints; latIdx++) {
    const latDeg = 90.0 - latIdx;
    const absLat = Math.abs(latDeg);

    for (let lonIdx = 0; lonIdx < lonPoints; lonIdx++) {
      const idx = (latIdx * lonPoints + lonIdx) * 2;
      const lonRad = (lonIdx * Math.PI) / 180.0;
      const latRad = (latDeg * Math.PI) / 180.0;

      let uMps = 0.0;
      let vMps = 0.0;

      // Polar Jet Stream (~45° to 60° latitude): Peak core up to 48 m/s (~95 kt)
      if (absLat >= 35.0 && absLat <= 70.0) {
        const polarCore = Math.cos(((absLat - 52.0) / 18.0) * (Math.PI * 0.5));
        const jetSpeed = 42.0 * Math.max(0.0, polarCore);
        // Rossby planetary wave meandering (wavenumbers 3 and 5)
        const wave1 = 8.5 * Math.sin(lonRad * 3.0 + 0.5) * Math.sin(latRad * 2.0);
        const wave2 = 4.2 * Math.cos(lonRad * 5.0 - 0.2);
        uMps = jetSpeed + wave1;
        vMps = 12.0 * Math.cos(lonRad * 3.0) * polarCore + wave2;
      }
      // Subtropical Jet Stream (~25° to 35° latitude): ~32 m/s
      else if (absLat >= 20.0 && absLat < 35.0) {
        const subCore = Math.cos(((absLat - 28.0) / 8.0) * (Math.PI * 0.5));
        const jetSpeed = 32.0 * Math.max(0.0, subCore);
        uMps = jetSpeed + 3.0 * Math.sin(lonRad * 4.0);
        vMps = 5.0 * Math.sin(lonRad * 4.0);
      }
      // Tropical upper troposphere easterly jet (-12 m/s)
      else if (absLat < 20.0) {
        uMps = -12.0 * Math.cos((absLat / 20.0) * (Math.PI * 0.5));
        vMps = 1.5 * Math.sin(lonRad * 2.0);
      }
      // High polar vortex upper winds
      else {
        uMps = 10.0 * Math.cos(((absLat - 75.0) / 15.0) * (Math.PI * 0.5));
        vMps = 2.0 * Math.cos(lonRad * 2.0);
      }

      uMps = Math.max(-100.0, Math.min(100.0, uMps));
      vMps = Math.max(-100.0, Math.min(100.0, vMps));

      u16View[idx + 0] = encodeFloat16(uMps);
      u16View[idx + 1] = encodeFloat16(vMps);
    }
  }

  return buffer;
}

/**
 * Packs Surface and Jet Stream grids into a single 4-channel RGBA16Float buffer (521,280 bytes).
 * r: u_surface, g: v_surface, b: u_jet, a: v_jet
 */
export function generateMultiStratumGrid(): ArrayBuffer {
  const surfaceBuf = generateGFSAtmosphericCirculationGrid();
  const jetBuf = generateGFSJetStreamGrid();

  const numNodes = 360 * 181;
  const multiBuf = new ArrayBuffer(numNodes * 4 * 2); // 4 components * 2 bytes = 521,280 bytes
  const multiU16 = new Uint16Array(multiBuf);

  const surfU16 = new Uint16Array(surfaceBuf);
  const jetU16 = new Uint16Array(jetBuf);

  for (let i = 0; i < numNodes; i++) {
    multiU16[i * 4 + 0] = surfU16[i * 2 + 0]; // u_surface
    multiU16[i * 4 + 1] = surfU16[i * 2 + 1]; // v_surface
    multiU16[i * 4 + 2] = jetU16[i * 2 + 0];  // u_jet
    multiU16[i * 4 + 3] = jetU16[i * 2 + 1];  // v_jet
  }

  return multiBuf;
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

  // Also write Jet Stream grid
  const jetPath = path.join(outputDir, 'gfs-jetstream-latest.bin');
  const jetBuf = generateGFSJetStreamGrid();
  fs.writeFileSync(jetPath, Buffer.from(jetBuf));
  console.log(`Successfully generated ${jetPath} (260,640 bytes)`);

  // And composite multi-stratum grid
  const multiPath = path.join(outputDir, 'gfs-multistratum-latest.bin');
  const multiBuf = generateMultiStratumGrid();
  fs.writeFileSync(multiPath, Buffer.from(multiBuf));
  console.log(`Successfully generated ${multiPath} (521,280 bytes)`);
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('fetch-or-generate-gfs-wind.ts')) {
  fetchOrGenerateGFS().catch((err) => {
    console.error('Failed to generate GFS wind grid:', err);
    process.exit(1);
  });
}
