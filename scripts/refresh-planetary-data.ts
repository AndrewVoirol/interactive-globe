// ============================================================================
// File: scripts/refresh-planetary-data.ts
// Automated Planetary Data Ingestion & Refresh Orchestrator
// Updates:
//   1. public/data/gfs-wind-latest.bin (NOAA GFS Surface Wind Velocity Grid)
//   2. public/data/tle-starlink.json (CelesTrak Starlink & ISS TLE Ephemeris)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchOrGenerateGFS } from './fetch-or-generate-gfs-wind';
import { fetchOrGenerateTLE } from './fetch-or-generate-tle-starlink';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export async function refreshAllPlanetaryData(): Promise<{ gfsBytes: number; tleSatellites: number }> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Starting automated planetary data refresh...`);

  // 1. Refresh NOAA GFS Wind Grid
  console.log('--- Step 1/2: Ingesting NOAA GFS 1.0° Wind Velocity Field ---');
  await fetchOrGenerateGFS();
  const gfsPath = path.join(projectRoot, 'public/data/gfs-wind-latest.bin');
  const gfsStats = fs.statSync(gfsPath);
  console.log(`[OK] GFS Wind Grid: ${gfsStats.size} bytes written to ${gfsPath}`);

  // 2. Refresh CelesTrak Starlink & ISS TLEs
  console.log('--- Step 2/2: Ingesting CelesTrak Starlink & ISS TLE Constellation ---');
  await fetchOrGenerateTLE();
  const tlePath = path.join(projectRoot, 'public/data/tle-starlink.json');
  const tleData = JSON.parse(fs.readFileSync(tlePath, 'utf8'));
  console.log(`[OK] Starlink/ISS TLEs: ${tleData.length} satellites written to ${tlePath}`);

  console.log(`[${new Date().toISOString()}] Automated planetary data refresh complete.`);
  return {
    gfsBytes: gfsStats.size,
    tleSatellites: tleData.length,
  };
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('refresh-planetary-data.ts')) {
  refreshAllPlanetaryData().catch((err) => {
    console.error('Planetary data refresh failed:', err);
    process.exit(1);
  });
}
