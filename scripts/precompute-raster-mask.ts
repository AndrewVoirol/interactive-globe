#!/usr/bin/env node

/**
 * scripts/precompute-raster-mask.ts
 * Stage 4: Vector-Coupled Coastal Raster Mask Precomputation
 * 
 * Ingests authoritative 1:10m Natural Earth coastline geometry,
 * rasterizes polygon coverage into Channel B of an 8192 x 4096 grid,
 * re-packs public/earth-etopo2022-dem-u16.bin (preserving the 256.0 MB size invariant),
 * and harmonizes elevation signs across the shoreline seam (z >= 0 where B > 0.5, z <= 0 where B < 0.5).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as topojson from 'topojson-client';
import { createCanvas } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function run() {
  console.log('================================================================');
  console.log('Precomputing Vector-Coupled Coastal Raster Mask (Stage 4)');
  console.log('================================================================');

  const width = 8192;
  const height = 4096;

  // 1. Fetch or load cached Natural Earth 1:10m Land TopoJSON
  const cachePath = path.join(projectRoot, 'data', 'land-10m.json');
  let topoData: any;
  if (fs.existsSync(cachePath)) {
    console.log('[1/5] Loading cached land-10m.json...');
    topoData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } else {
    console.log('[1/5] Fetching Natural Earth 1:10m land TopoJSON...');
    const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-10m.json');
    if (!res.ok) throw new Error(`Failed to fetch land-10m.json: ${res.statusText}`);
    topoData = await res.json();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(topoData));
  }

  const landFeature = topojson.feature(topoData, topoData.objects.land as any) as any;
  const coastMesh = topojson.mesh(topoData, topoData.objects.land as any) as any;

  // 2. Rasterize polygon coverage onto 8192x4096 canvas
  console.log('[2/5] Rasterizing land polygons onto 8192x4096 canvas...');
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (const poly of landFeature.features[0].geometry.coordinates) {
    for (const ring of poly) {
      if (!ring.length) continue;
      ctx.moveTo((ring[0][0] + 180) / 360 * width, (90 - ring[0][1]) / 180 * height);
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo((ring[i][0] + 180) / 360 * width, (90 - ring[i][1]) / 180 * height);
      }
      ctx.closePath();
    }
  }
  ctx.fill('evenodd');

  // Stroke with 0.55 opacity along vector coastlines to ensure sub-pixel topological lock
  console.log('[3/5] Stroking coastline boundaries for sub-pixel vector alignment...');
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const seg of coastMesh.coordinates) {
    if (!seg.length) continue;
    ctx.moveTo((seg[0][0] + 180) / 360 * width, (90 - seg[0][1]) / 180 * height);
    for (let i = 1; i < seg.length; i++) {
      ctx.lineTo((seg[i][0] + 180) / 360 * width, (90 - seg[i][1]) / 180 * height);
    }
  }
  ctx.stroke();

  const maskImg = ctx.getImageData(0, 0, width, height).data;

  // 3. Load public/earth-etopo2022-dem-u16.bin
  console.log('[4/5] Ingesting and re-packing public/earth-etopo2022-dem-u16.bin...');
  const demPath = path.join(projectRoot, 'public', 'earth-etopo2022-dem-u16.bin');
  if (!fs.existsSync(demPath)) {
    throw new Error(`DEM file not found at ${demPath}`);
  }

  const demBuf = fs.readFileSync(demPath);
  const expectedBytes = width * height * 4 * 2;
  if (demBuf.byteLength !== expectedBytes) {
    throw new Error(`DEM byte length ${demBuf.byteLength} !== expected ${expectedBytes}`);
  }

  const demU16 = new Uint16Array(demBuf.buffer, demBuf.byteOffset, demBuf.byteLength / 2);
  const U16_SEA_LEVEL = Math.round((10924.0 / 19772.0) * 65535.0); // 36208

  let harmonizedLand = 0;
  let harmonizedOcean = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const pixelIdx = y * width + x;
      const idx = rowOffset + x * 4;

      const maskByte = maskImg[pixelIdx * 4]; // 0..255
      const maskU16 = Math.round((maskByte / 255.0) * 65535.0);

      // Re-pack Channel B (Channel 2)
      demU16[idx + 2] = maskU16;

      // Harmonize elevation signs across shoreline seam
      const isLand = maskByte > 127; // B > 0.5
      const currentA = demU16[idx + 3];

      if (isLand && currentA < U16_SEA_LEVEL) {
        // Land pixel with negative elevation: harmonize to at least sea level (0m)
        demU16[idx + 3] = U16_SEA_LEVEL;
        demU16[idx + 1] = 0; // ocean depth = 0 on land
        harmonizedLand++;
      } else if (!isLand && currentA > U16_SEA_LEVEL) {
        // Ocean pixel with positive elevation: harmonize to at most sea level (0m)
        demU16[idx + 3] = U16_SEA_LEVEL;
        demU16[idx + 0] = 0; // land elevation = 0 in ocean
        harmonizedOcean++;
      }
    }
  }

  console.log(`  ✓ Harmonized ${harmonizedLand.toLocaleString()} sub-zero land pixels to sea level`);
  console.log(`  ✓ Harmonized ${harmonizedOcean.toLocaleString()} supra-zero ocean pixels to sea level`);

  // Write re-packed binary file
  fs.writeFileSync(demPath, Buffer.from(demU16.buffer, demU16.byteOffset, demU16.byteLength));
  const finalStat = fs.statSync(demPath);
  console.log(`  ✓ Written ${demPath} (${(finalStat.size / (1024 * 1024)).toFixed(1)} MB, ${finalStat.size} bytes)`);

  if (finalStat.size !== 268435456) {
    throw new Error(`Size invariant violation: got ${finalStat.size}, expected 268435456 bytes`);
  }

  console.log('[5/5] Alignment Precomputation Complete.');
  console.log('================================================================');
}

run().catch(err => {
  console.error('Raster mask precomputation failed:', err);
  process.exit(1);
});
