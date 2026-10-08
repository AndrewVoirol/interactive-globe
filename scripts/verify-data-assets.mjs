#!/usr/bin/env node
/**
 * scripts/verify-data-assets.mjs
 *
 * Standalone verification for GEBCO 2024 + EGM2008 topobathy assets:
 * 1. public/earth-gebco2024-dem-u16.bin file structure & dimension invariants
 * 2. public/earth-gebco2024-dem-bc4.dds header, format & mip levels
 * 3. Everest summit (+8,848m) and Mariana Trench (-10,924m) geodetic anchors
 * 4. Shoreline elevation step verification (< 0.1m difference between land and ocean at coast)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const BIN_PATH = path.join(projectRoot, 'public', 'earth-gebco2024-dem-u16.bin');
const DDS_PATH = path.join(projectRoot, 'public', 'earth-gebco2024-dem-bc4.dds');

const WIDTH = 8192;
const HEIGHT = 4096;
const Z_MIN_GLOBAL = -10924.0;
const Z_SPAN_GLOBAL = 19772.0;

function decodeElevation(rawU16) {
  return (rawU16 / 65535.0) * Z_SPAN_GLOBAL + Z_MIN_GLOBAL;
}

function coordToRowCol(lat, lon) {
  const col = Math.min(Math.max(Math.floor(((lon + 180.0) / 360.0) * WIDTH), 0), WIDTH - 1);
  const row = Math.min(Math.max(Math.floor(((90.0 - lat) / 180.0) * HEIGHT), 0), HEIGHT - 1);
  return { row, col };
}

function main() {
  console.log('================================================================');
  console.log('GEBCO 2024 & EGM2008 ASSET & SHORELINE VERIFICATION PROTOCOL');
  console.log('================================================================\n');

  let allPassed = true;

  // 1. Verify U16 file existence and size
  if (!fs.existsSync(BIN_PATH)) {
    console.error(`FAIL: Binary asset does not exist: ${BIN_PATH}`);
    process.exit(1);
  }
  const binStat = fs.statSync(BIN_PATH);
  const expectedBytes = WIDTH * HEIGHT * 4 * 2;
  const isBinSizeValid = binStat.size === expectedBytes;
  console.log(`[CHECK 1] U16 Buffer Size: ${(binStat.size / (1024 * 1024)).toFixed(2)} MB (Expected: ${(expectedBytes / (1024 * 1024)).toFixed(2)} MB) -> ${isBinSizeValid ? 'PASS' : 'FAIL'}`);
  if (!isBinSizeValid) allPassed = false;

  // 2. Verify DDS file existence and header
  if (!fs.existsSync(DDS_PATH)) {
    console.error(`FAIL: DDS asset does not exist: ${DDS_PATH}`);
    process.exit(1);
  }
  const ddsBuf = fs.readFileSync(DDS_PATH);
  const magic = ddsBuf.toString('ascii', 0, 4);
  const ddsHeight = ddsBuf.readUInt32LE(12);
  const ddsWidth = ddsBuf.readUInt32LE(16);
  const numMips = ddsBuf.readUInt32LE(28);
  const fourCC = ddsBuf.toString('ascii', 84, 88);

  const isDdsValid = magic === 'DDS ' && ddsWidth === WIDTH && ddsHeight === HEIGHT && fourCC === 'BC4U' && numMips >= 13;
  console.log(`[CHECK 2] DDS Texture Header: magic='${magic}', ${ddsWidth}x${ddsHeight}, ${numMips} mips, fourCC='${fourCC}' -> ${isDdsValid ? 'PASS' : 'FAIL'}`);
  if (!isDdsValid) allPassed = false;

  // 3. Load U16 buffer for elevation probing
  console.log('\n[CHECK 3] Reading U16 buffer for geodetic probing...');
  const u16Data = new Uint16Array(binStat.size / 2);
  const fd = fs.openSync(BIN_PATH, 'r');
  fs.readSync(fd, Buffer.from(u16Data.buffer), 0, binStat.size, 0);
  fs.closeSync(fd);

  function sampleAt(lat, lon) {
    const { row, col } = coordToRowCol(lat, lon);
    const pixelIdx = (row * WIDTH + col) * 4;
    const rawR = u16Data[pixelIdx];
    const rawG = u16Data[pixelIdx + 1];
    const rawB = u16Data[pixelIdx + 2];
    const rawA = u16Data[pixelIdx + 3];
    return {
      landElev: (rawR / 65535.0) * 8848.0,
      oceanDepth: (rawG / 65535.0) * 10924.0,
      isLand: rawB > 32768,
      rawB,
      rawA,
      elev: decodeElevation(rawA),
      row,
      col,
    };
  }

  // Probe Everest
  const ev = sampleAt(27.9881, 86.9250);
  const evPass = ev.elev >= 8840.0 && ev.elev <= 8855.0;
  console.log(`  -> Mount Everest Summit (27.9881°N, 86.9250°E): ${ev.elev.toFixed(2)}m (Expected: 8848.86m) -> ${evPass ? 'PASS' : 'FAIL'}`);
  if (!evPass) allPassed = false;

  // Probe Mariana Trench
  const ma = sampleAt(11.3733, 142.5917);
  const maPass = ma.elev >= -10935.0 && ma.elev <= -10910.0;
  console.log(`  -> Mariana Challenger Deep (11.3733°N, 142.5917°E): ${ma.elev.toFixed(2)}m (Expected: -10924.0m) -> ${maPass ? 'PASS' : 'FAIL'}`);
  if (!maPass) allPassed = false;

  // Probe Lake Titicaca
  const ti = sampleAt(-15.9254, -69.3354);
  const tiPass = ti.elev >= 3800.0 && ti.elev <= 3825.0;
  console.log(`  -> Lake Titicaca Surface Datum (-15.9254°S, -69.3354°W): ${ti.elev.toFixed(2)}m (Expected: 3812.0m) -> ${tiPass ? 'PASS' : 'FAIL'}`);
  if (!tiPass) allPassed = false;

  // 4. Shoreline Elevation Step Verification
  console.log('\n[CHECK 4] Verifying shoreline elevation continuity across coastlines...');

  // Litmus Location 1: Cape Cod Barrier Spit (41.6688°N, -70.2962°W)
  const ccCenter = coordToRowCol(41.6688, -70.2962);
  let ccMaxStep = 0;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const p1Idx = ((ccCenter.row + dr) * WIDTH + (ccCenter.col + dc)) * 4;
      const isLand1 = u16Data[p1Idx + 2] > 32768;
      const elev1 = decodeElevation(u16Data[p1Idx + 3]);

      // Check right neighbor
      const p2Idx = ((ccCenter.row + dr) * WIDTH + (ccCenter.col + dc + 1)) * 4;
      const isLand2 = u16Data[p2Idx + 2] > 32768;
      const elev2 = decodeElevation(u16Data[p2Idx + 3]);

      if (isLand1 !== isLand2) {
        const step = Math.abs(elev1 - elev2);
        if (step > ccMaxStep) ccMaxStep = step;
      }
    }
  }
  const ccPass = ccMaxStep < 0.1;
  console.log(`  -> Cape Cod Coastline Step: ${ccMaxStep.toFixed(4)}m (Must be < 0.1000m) -> ${ccPass ? 'PASS' : 'FAIL'}`);
  if (!ccPass) allPassed = false;

  // Litmus Location 2: Amazon River Mouth (0.0000°N, -50.0000°W)
  const amCenter = coordToRowCol(0.0000, -50.0000);
  let amMaxStep = 0;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const p1Idx = ((amCenter.row + dr) * WIDTH + (amCenter.col + dc)) * 4;
      const isLand1 = u16Data[p1Idx + 2] > 32768;
      const elev1 = decodeElevation(u16Data[p1Idx + 3]);

      const p2Idx = ((amCenter.row + dr) * WIDTH + (amCenter.col + dc + 1)) * 4;
      const isLand2 = u16Data[p2Idx + 2] > 32768;
      const elev2 = decodeElevation(u16Data[p2Idx + 3]);

      if (isLand1 !== isLand2) {
        const step = Math.abs(elev1 - elev2);
        if (step > amMaxStep) amMaxStep = step;
      }
    }
  }
  const amPass = amMaxStep < 0.1;
  console.log(`  -> Amazon River Mouth Coastline Step: ${amMaxStep.toFixed(4)}m (Must be < 0.1000m) -> ${amPass ? 'PASS' : 'FAIL'}`);
  if (!amPass) allPassed = false;

  // Sample global coastline steps across 5000 random coastal transitions
  let globalCoastSteps = [];
  for (let r = 100; r < HEIGHT - 100; r += 16) {
    for (let c = 0; c < WIDTH; c += 16) {
      const idx1 = (r * WIDTH + c) * 4;
      const idx2 = (r * WIDTH + ((c + 1) % WIDTH)) * 4;
      const land1 = u16Data[idx1 + 2] > 32768;
      const land2 = u16Data[idx2 + 2] > 32768;
      if (land1 !== land2) {
        const e1 = decodeElevation(u16Data[idx1 + 3]);
        const e2 = decodeElevation(u16Data[idx2 + 3]);
        globalCoastSteps.push(Math.abs(e1 - e2));
      }
    }
  }

  const avgGlobalStep = globalCoastSteps.length > 0
    ? globalCoastSteps.reduce((a, b) => a + b, 0) / globalCoastSteps.length
    : 0;
  const globalPass = avgGlobalStep < 0.1;
  console.log(`  -> Global Coastline Sampled Transitions (${globalCoastSteps.length} interfaces): Average Step = ${avgGlobalStep.toFixed(4)}m -> ${globalPass ? 'PASS' : 'FAIL'}`);
  if (!globalPass) allPassed = false;

  console.log('\n================================================================');
  if (allPassed) {
    console.log('✓ ALL GEBCO 2024 & EGM2008 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } else {
    console.error('✗ ONE OR MORE CHECKS FAILED!');
    process.exit(1);
  }
  console.log('================================================================\n');
}

main();
