// ============================================================================
// File: scripts/fetch-or-generate-tle-starlink.ts
// CelesTrak Starlink & ISS Two-Line Element (TLE) Ingestion & Generator
// Output: public/data/tle-starlink.json
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeTLEChecksum } from '../src/core/math/sgp4';

export { computeTLEChecksum };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public/data');
const outputPath = path.join(outputDir, 'tle-starlink.json');

export interface TLERecord {
  name: string;
  line1: string;
  line2: string;
}

/**
 * Pad a string to exact length with trailing or leading spaces.
 */
function padRight(str: string, len: number): string {
  return (str + ' '.repeat(len)).substring(0, len);
}

function padLeft(str: string, len: number): string {
  return (' '.repeat(len) + str).slice(-len);
}

function padZero(str: string, len: number): string {
  return ('0'.repeat(len) + str).slice(-len);
}

/**
 * Formats orbital parameters into a valid 69-character NORAD TLE line pair.
 */
export function formatTLE(
  name: string,
  catalogNumber: number,
  designator: string,
  epochYear: number,
  epochDay: number,
  inclinationDeg: number,
  raanDeg: number,
  eccentricity: number,
  argPerigeeDeg: number,
  meanAnomalyDeg: number,
  meanMotionRevsPerDay: number,
  revNumber: number
): TLERecord {
  const catStr = padLeft(catalogNumber.toString(), 5);
  const desigStr = padRight(designator, 8);
  const epYrStr = padLeft(epochYear.toString(), 2);
  const epDayStr = padLeft(epochDay.toFixed(8), 12);

  // Line 1 template:
  // 1 NNNNNU NNNNNAAA YYDDD.DDDDDDDD +.NNNNNNNN +NNNNN-N +NNNNN-N N NNNNC
  const l1Raw = `1 ${catStr}U ${desigStr} ${epYrStr}${epDayStr}  .00005000  00000-0  10000-3 0  999`;
  const l1Pad = padRight(l1Raw, 68);
  const l1Check = computeTLEChecksum(l1Pad);
  const line1 = `${l1Pad}${l1Check}`;

  // Line 2 template:
  // 2 NNNNN III.IIII RRR.RRRR EEEEEEE PPP.PPPP MMM.MMMM NN.NNNNNNNNRRRRRC
  const incStr = padLeft(inclinationDeg.toFixed(4), 8);
  const raanStr = padLeft(raanDeg.toFixed(4), 8);
  const eccStr = padZero(Math.round(eccentricity * 1e7).toString(), 7);
  const argPStr = padLeft(argPerigeeDeg.toFixed(4), 8);
  const maStr = padLeft(meanAnomalyDeg.toFixed(4), 8);
  const mmStr = padLeft(meanMotionRevsPerDay.toFixed(8), 11);
  const revStr = padLeft(revNumber.toString(), 5);

  const l2Raw = `2 ${catStr} ${incStr} ${raanStr} ${eccStr} ${argPStr} ${maStr} ${mmStr}${revStr}`;
  const l2Pad = padRight(l2Raw, 68);
  const l2Check = computeTLEChecksum(l2Pad);
  const line2 = `${l2Pad}${l2Check}`;

  return { name, line1, line2 };
}

/**
 * Generate high-fidelity Starlink constellation & ISS TLE catalog.
 */
export function generateConstellationTLEs(): TLERecord[] {
  const satellites: TLERecord[] = [];

  // 1. Canonical International Space Station (ISS 25544)
  satellites.push({
    name: 'ISS (ZARYA)',
    line1: '1 25544U 98067A   26248.84752315  .00012456  00000+0  22485-3 0  9998',
    line2: '2 25544  51.6418 214.3294 0005824  69.2541 290.9142 15.49842106512340',
  });

  // 2. Canonical Tiangong Space Station (CSS 48274)
  satellites.push({
    name: 'TIANGONG (CSS)',
    line1: '1 48274U 21035A   26248.61420138  .00018520  00000+0  21500-3 0  9999',
    line2: '2 48274  41.4720 180.2150 0004500  85.3400 274.8200 15.62500000184208',
  });

  // 3. Starlink Constellation (Shell 1: 53.0° inclination, ~550km altitude, ~15.05 revs/day)
  // Generates 72 planes with satellites distributed in RAAN and mean anomaly
  const numPlanes = 18;
  const satsPerPlane = 4;
  let satIndex = 1;

  for (let p = 0; p < numPlanes; p++) {
    const raanDeg = (p * (360.0 / numPlanes)) % 360.0;
    for (let s = 0; s < satsPerPlane; s++) {
      const catNum = 55000 + satIndex;
      const name = `STARLINK-${padLeft(catNum.toString(), 5)}`;
      const desig = `23001${String.fromCharCode(65 + (satIndex % 26))}`;
      const meanAnomalyDeg = (s * (360.0 / satsPerPlane) + p * 15.0) % 360.0;
      const argPerigeeDeg = (p * 20.0 + s * 30.0) % 360.0;
      const eccentricity = 0.00015 + (satIndex % 5) * 0.00005;
      const inclinationDeg = 53.2 + ((satIndex % 3) - 1) * 0.15;
      const meanMotionRevsPerDay = 15.05 + ((satIndex % 4) - 2) * 0.01;

      const record = formatTLE(
        name,
        catNum,
        desig,
        26, // Epoch Year 2026
        248.5 + satIndex * 0.005, // Day of Year
        inclinationDeg,
        raanDeg,
        eccentricity,
        argPerigeeDeg,
        meanAnomalyDeg,
        meanMotionRevsPerDay,
        12340 + satIndex
      );

      satellites.push(record);
      satIndex++;
    }
  }

  return satellites;
}

/**
 * Parses raw 3-line TLE format text into TLERecord array.
 */
export function parseTLEText(rawText: string, maxRecords = 120): TLERecord[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const records: TLERecord[] = [];

  for (let i = 0; i + 2 < lines.length && records.length < maxRecords; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    const isDebris = name.includes('DEB') || name.includes('R/B') || name.includes('COOLING');
    if (!isDebris && line1.startsWith('1 ') && line2.startsWith('2 ') && line1.length === 69 && line2.length === 69) {
      const c1 = computeTLEChecksum(line1.substring(0, 68));
      const c2 = computeTLEChecksum(line2.substring(0, 68));
      if (parseInt(line1[68], 10) === c1 && parseInt(line2[68], 10) === c2) {
        records.push({ name, line1, line2 });
      }
    }
  }

  return records;
}

export async function fetchOrGenerateTLE(): Promise<TLERecord[]> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let satellites: TLERecord[] = [];

  try {
    console.log('Fetching live CelesTrak active TLE ephemeris...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // 1. Fetch space stations (ISS & Tiangong)
    const stationsRes = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle', {
      signal: controller.signal,
      headers: { 'User-Agent': 'Indicatrix-Cartography/1.0' },
    });
    let stations: TLERecord[] = [];
    if (stationsRes.ok) {
      const text = await stationsRes.text();
      stations = parseTLEText(text, 10);
    }

    // 2. Fetch active Starlink constellation
    const starlinkRes = await fetch('https://celestrak.org/NORAD/elements/gp.php?NAME=STARLINK&FORMAT=tle', {
      signal: controller.signal,
      headers: { 'User-Agent': 'Indicatrix-Cartography/1.0' },
    });
    let starlinks: TLERecord[] = [];
    if (starlinkRes.ok) {
      const text = await starlinkRes.text();
      starlinks = parseTLEText(text, 100);
    }

    clearTimeout(timeout);

    if (stations.length > 0 || starlinks.length > 0) {
      satellites = [...stations, ...starlinks];
      console.log(`Successfully fetched ${satellites.length} real active satellites (${stations.length} stations, ${starlinks.length} Starlink) from CelesTrak.`);
    }
  } catch (err: any) {
    console.warn('CelesTrak live fetch failed or timed out; falling back:', err?.message || err);
  }

  // If live fetch was empty or failed, try existing file or fall back
  if (satellites.length === 0) {
    if (fs.existsSync(outputPath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        if (Array.isArray(cached) && cached.length > 0) {
          console.log(`Retaining ${cached.length} previously cached CelesTrak records.`);
          return cached;
        }
      } catch {}
    }
    satellites = generateConstellationTLEs();
  }

  // Validate format and checksum parity of all records
  for (const item of satellites) {
    if (item.line1.length !== 69 || item.line2.length !== 69) {
      throw new Error(`Invalid TLE length for ${item.name}: line1=${item.line1.length}, line2=${item.line2.length}`);
    }
    if (parseInt(item.line1[68], 10) !== computeTLEChecksum(item.line1.substring(0, 68))) {
      throw new Error(`Invalid line 1 checksum for ${item.name}`);
    }
    if (parseInt(item.line2[68], 10) !== computeTLEChecksum(item.line2.substring(0, 68))) {
      throw new Error(`Invalid line 2 checksum for ${item.name}`);
    }
  }

  const jsonContent = JSON.stringify(satellites, null, 2);
  fs.writeFileSync(outputPath, jsonContent, 'utf8');

  console.log(`Successfully written ${outputPath}`);
  console.log(`Total satellites: ${satellites.length} records`);
  return satellites;
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('fetch-or-generate-tle-starlink.ts')) {
  fetchOrGenerateTLE().catch((err) => {
    console.error('Failed to process TLE records:', err);
    process.exit(1);
  });
}

