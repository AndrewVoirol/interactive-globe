#!/usr/bin/env node

/**
 * Unified Continuous Volumetric Matrix Precomputation CLI
 * 
 * Generates scientific-grade spherical Fibonacci lattices with rasterized Canvas 2D
 * TopoJSON land/ocean classification and nearest-neighbor lattice edge triangulation.
 * Outputs zero-copy columnar binary buffers (0x47454F4D schema) and/or JSON fallback files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';
import { createCanvas } from 'canvas';

const RADIUS = 5.0;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const MAX_LAT = 85.0511287798066; // EPSG:3857 Web Mercator limit

const toSphere = (lon, lat) => {
  const lambda = lon * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  return [
    RADIUS * Math.cos(phi) * Math.sin(lambda),
    RADIUS * Math.sin(phi),
    RADIUS * Math.cos(phi) * Math.cos(lambda)
  ];
};

const toMercator = (lon, lat) => {
  const lambda = lon * (Math.PI / 180);
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const phi = clampedLat * (Math.PI / 180);
  const x = lambda * RADIUS;
  const y = RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
};

function parseDensity(arg) {
  if (arg === undefined || arg === null || arg === '') {
    throw new Error(`Invalid density: empty value. Use 100k, 1m, or a positive integer.`);
  }
  const lower = String(arg).toLowerCase().trim();
  if (lower === '100k') return 100000;
  if (lower === '1m') return 1000000;
  if (lower === '20k') return 20000;
  if (lower === '500k') return 500000;
  if (lower.endsWith('k')) {
    const num = parseFloat(lower.slice(0, -1));
    if (isNaN(num) || num <= 0) {
      throw new Error(`Invalid density: "${arg}". Use 100k, 1m, or a positive integer.`);
    }
    return Math.round(num * 1000);
  }
  if (lower.endsWith('m')) {
    const num = parseFloat(lower.slice(0, -1));
    if (isNaN(num) || num <= 0) {
      throw new Error(`Invalid density: "${arg}". Use 100k, 1m, or a positive integer.`);
    }
    return Math.round(num * 1000000);
  }
  const parsed = parseInt(lower, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid density: "${arg}". Use 100k, 1m, or a positive integer.`);
  }
  return parsed;
}

function getFibonacciOffsets(N) {
  // Fibonacci sequence lookup
  const fibs = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946];
  const target = Math.sqrt(N);
  
  // Specific optimized triples for standard benchmarks
  if (N >= 900000) return [610, 987, 1597];
  if (N >= 80000) return [233, 377, 610];
  if (N >= 15000) return [89, 144, 233];

  let idx = 0;
  while (idx < fibs.length - 1 && fibs[idx] < target) {
    idx++;
  }
  const start = Math.max(0, idx - 1);
  return fibs.slice(start, start + 3);
}

function printUsage() {
  console.log(`
Usage: node scripts/precompute.js [options]

Options:
  -d, --density <val>  Point count: 100k, 1m, 20k, or numeric integer (default: 100k)
  -f, --format <val>   Output format: bin, json, both (default: bin)
  -o, --out <path>     Output directory or target file path (default: public)
  -h, --help           Show this help message

Examples:
  node scripts/precompute.js --density 100k --format both
  node scripts/precompute.js --density 1m --format bin --out public/
  node scripts/precompute.js --density 50000 --format bin --out public/custom-mesh.bin
`);
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let density = 100000;
  let format = 'bin';
  let outPath = 'public';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    } else if (arg === '-d' || arg === '--density') {
      density = parseDensity(args[++i]);
    } else if (arg === '-f' || arg === '--format') {
      const f = (args[++i] || '').toLowerCase();
      if (!['bin', 'json', 'both'].includes(f)) {
        throw new Error(`Invalid format "${f}". Allowed: bin, json, both`);
      }
      format = f;
    } else if (arg === '-o' || arg === '--out') {
      outPath = args[++i];
    } else if (arg.startsWith('--density=')) {
      density = parseDensity(arg.split('=')[1]);
    } else if (arg.startsWith('--format=')) {
      const f = (arg.split('=')[1] || '').toLowerCase();
      if (!['bin', 'json', 'both'].includes(f)) {
        throw new Error(`Invalid format "${f}". Allowed: bin, json, both`);
      }
      format = f;
    } else if (arg.startsWith('--out=')) {
      outPath = arg.split('=')[1] || outPath;
    } else {
      console.warn(`Unknown option: ${arg}`);
    }
  }

  return { density, format, outPath };
}

async function run() {
  const { density: TOTAL_POINTS, format, outPath } = parseCliArgs();
  
  const densityTag = TOTAL_POINTS >= 1000000 
    ? `${(TOTAL_POINTS / 1000000).toFixed(0)}m` 
    : `${Math.round(TOTAL_POINTS / 1000)}k`;

  console.log(`================================================================`);
  console.log(`Continuous Volumetric Matrix Precomputation Engine`);
  console.log(`Density: ${TOTAL_POINTS.toLocaleString()} nodes (${densityTag}) | Format: ${format} | Output: ${outPath}`);
  console.log(`================================================================`);
  
  console.time('Total Execution Time');

  // Step 1: Land Mask Rasterization
  console.log('\n[1/4] Fetching TopoJSON & Rasterizing Land Mask (4096x2048)...');
  console.time('Rasterization');
  const topoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
  const data50 = await fetch(topoUrl).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch TopoJSON: ${r.statusText}`);
    return r.json();
  });
  const landFeature = topojson.feature(data50, data50.objects.land);

  const W = 4096, H = 2048;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  const projection = d3.geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const pathGen = d3.geoPath(projection, ctx);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  pathGen(landFeature);
  ctx.fill();

  const imgData = ctx.getImageData(0, 0, W, H).data;
  console.timeEnd('Rasterization');
  console.log(`  ✓ 4096x2048 Equirectangular land mask generated.`);

  // Step 2: Fibonacci Lattice Generation & Sampling
  console.log(`\n[2/4] Generating ${TOTAL_POINTS.toLocaleString()} Fibonacci Nodes & Classifying...`);
  console.time('Node Generation');
  const allLonLat = new Float32Array(TOTAL_POINTS * 2);
  const pointsArray = new Float32Array(TOTAL_POINTS * 3);
  const target2DArray = new Float32Array(TOTAL_POINTS * 2);
  const typeArray = new Float32Array(TOTAL_POINTS);

  let landCount = 0;
  for (let i = 0; i < TOTAL_POINTS; i++) {
    const z = 1 - (i / (TOTAL_POINTS - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = 2 * Math.PI * i / GOLDEN_RATIO;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    const lat = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI);
    const lon = Math.atan2(y, x) * (180 / Math.PI);

    allLonLat[i * 2] = lon;
    allLonLat[i * 2 + 1] = lat;

    const s = toSphere(lon, lat);
    pointsArray[i * 3] = s[0];
    pointsArray[i * 3 + 1] = s[1];
    pointsArray[i * 3 + 2] = s[2];

    const m = toMercator(lon, lat);
    target2DArray[i * 2] = m[0];
    target2DArray[i * 2 + 1] = m[1];

    // O(1) Rasterized land classification
    const px = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)));
    const py = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
    const isLand = imgData[(py * W + px) * 4] > 128 ? 1.0 : 0.0;
    typeArray[i] = isLand;
    if (isLand > 0.5) landCount++;
  }
  console.timeEnd('Node Generation');
  console.log(`  ✓ Classified ${landCount.toLocaleString()} land nodes (${(landCount / TOTAL_POINTS * 100).toFixed(1)}%).`);

  // Step 3: Fibonacci Lattice Edge Triangulation
  console.log('\n[3/4] Triangulating Spherical Lattice Topology...');
  console.time('Lattice Triangulation');
  const offsets = getFibonacciOffsets(TOTAL_POINTS);
  console.log(`  Fibonacci offsets for N=${TOTAL_POINTS.toLocaleString()}: [${offsets.join(', ')}]`);
  
  const lineIndices = [];
  for (let i = 0; i < TOTAL_POINTS; i++) {
    const lonA = allLonLat[i * 2];
    for (let o = 0; o < offsets.length; o++) {
      const j = i + offsets[o];
      if (j >= TOTAL_POINTS) continue;
      const lonB = allLonLat[j * 2];
      // Antimeridian seam culling (cull edges crossing 2D map cut)
      if (Math.abs(lonA - lonB) > 180) continue;
      lineIndices.push(i, j);
    }
  }
  const lineIndicesArray = new Uint32Array(lineIndices);
  console.timeEnd('Lattice Triangulation');
  console.log(`  ✓ Generated ${(lineIndicesArray.length / 2).toLocaleString()} lattice edges (${lineIndicesArray.length.toLocaleString()} indices).`);

  // Step 4: Serialization / Export
  console.log('\n[4/4] Writing Output Files...');
  
  // Resolve base directory and filenames
  let baseDir = outPath;
  let customBinName = null;
  let customJsonName = null;

  if (fs.existsSync(outPath) && fs.statSync(outPath).isDirectory()) {
    baseDir = outPath;
  } else if (outPath.endsWith('.bin') || outPath.endsWith('.json')) {
    baseDir = path.dirname(outPath);
    if (outPath.endsWith('.bin')) customBinName = path.basename(outPath);
    if (outPath.endsWith('.json')) customJsonName = path.basename(outPath);
  } else {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const defaultBinName = customBinName || `geo-mesh-${densityTag}.bin`;
  const defaultJsonName = customJsonName || `geo-mesh-${densityTag}.json`;

  // Write Binary Buffer (0x47454F4D schema)
  if (format === 'bin' || format === 'both') {
    console.time('Binary Packing');
    const headerSize = 32;
    const pBytes = TOTAL_POINTS * 3 * 4;
    const tBytes = TOTAL_POINTS * 2 * 4;
    const typBytes = TOTAL_POINTS * 1 * 4;
    const iBytes = lineIndicesArray.byteLength;
    const totalBytes = headerSize + pBytes + tBytes + typBytes + iBytes;

    const binBuffer = Buffer.alloc(totalBytes);
    // Header (32 bytes)
    binBuffer.writeUInt32LE(0x47454F4D, 0); // 'GEOM'
    binBuffer.writeUInt32LE(1, 4);          // version 1
    binBuffer.writeUInt32LE(TOTAL_POINTS, 8);
    binBuffer.writeUInt32LE(lineIndicesArray.length, 12);

    const pOffset = headerSize;
    const tOffset = pOffset + pBytes;
    const typOffset = tOffset + tBytes;
    const iOffset = typOffset + typBytes;

    binBuffer.writeUInt32LE(pOffset, 16);
    binBuffer.writeUInt32LE(tOffset, 20);
    binBuffer.writeUInt32LE(typOffset, 24);
    binBuffer.writeUInt32LE(iOffset, 28);

    // Body: zero-copy copy of typed arrays
    Buffer.from(pointsArray.buffer).copy(binBuffer, pOffset);
    Buffer.from(target2DArray.buffer).copy(binBuffer, tOffset);
    Buffer.from(typeArray.buffer).copy(binBuffer, typOffset);
    Buffer.from(lineIndicesArray.buffer).copy(binBuffer, iOffset);

    const targetBinFile = path.join(baseDir, defaultBinName);
    fs.writeFileSync(targetBinFile, binBuffer);
    console.timeEnd('Binary Packing');
    console.log(`  ✓ Packed binary columnar buffer: ${targetBinFile} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  }

  // Write JSON Buffer
  if (format === 'json' || format === 'both') {
    console.time('JSON Serialization');
    const targetJsonFile = path.join(baseDir, defaultJsonName);
    const jsonPayload = {
      pointsBuffer: Array.from(pointsArray),
      target2DBuffer: Array.from(target2DArray),
      typeBuffer: Array.from(typeArray),
      lineIndices: Array.from(lineIndicesArray)
    };
    fs.writeFileSync(targetJsonFile, JSON.stringify(jsonPayload));
    console.timeEnd('JSON Serialization');
    const jsonSizeMb = (fs.statSync(targetJsonFile).size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ JSON fallback: ${targetJsonFile} (${jsonSizeMb} MB)`);
  }

  console.log('\n================================================================');
  console.timeEnd('Total Execution Time');
  console.log(`Precomputation complete! Ready for WebGL2 / WebGPU ingestion.`);
  console.log(`================================================================`);
}

// Direct execution
run().catch(err => {
  console.error('\n[Error] Precomputation failed:', err);
  process.exit(1);
});
