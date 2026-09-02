import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';
import { createCanvas } from 'canvas';

const RADIUS = 5.0;
const TOTAL_POINTS = 1000000;
const goldenRatio = (1 + Math.sqrt(5)) / 2;
const MAX_LAT = 85.0511287798066;

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

async function precompute1M() {
    console.log('=== High-Performance 1,000,000-Node Matrix Generator ===');
    console.time('Total 1M Precomputation');

    console.log('1. Fetching TopoJSON & Rasterizing High-Res Land Mask (4096x2048)...');
    const data50 = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json());
    const landFeature = topojson.feature(data50, data50.objects.land);

    const W = 4096, H = 2048;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const projection = d3.geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
    const path = d3.geoPath(projection, ctx);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    path(landFeature);
    ctx.fill();

    const imgData = ctx.getImageData(0, 0, W, H).data;

    console.log('2. Generating 1,000,000 Fibonacci Nodes & Sampling Land Mask...');
    console.time('Node Generation');
    const allLonLat = new Float32Array(TOTAL_POINTS * 2);
    const pointsArray = new Float32Array(TOTAL_POINTS * 3);
    const target2DArray = new Float32Array(TOTAL_POINTS * 2);
    const typeArray = new Float32Array(TOTAL_POINTS);

    let landCount = 0;
    for (let i = 0; i < TOTAL_POINTS; i++) {
        const z = 1 - (i / (TOTAL_POINTS - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const theta = 2 * Math.PI * i / goldenRatio;
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        const lat = Math.asin(z) * (180 / Math.PI);
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

        // Sample land mask
        const px = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)));
        const py = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
        const isLand = imgData[(py * W + px) * 4] > 128 ? 1.0 : 0.0;
        typeArray[i] = isLand;
        if (isLand > 0.5) landCount++;
    }
    console.timeEnd('Node Generation');
    console.log(`Classified ${landCount.toLocaleString()} land nodes (${(landCount/TOTAL_POINTS*100).toFixed(1)}%).`);

    console.log('3. Triangulating 1M Fibonacci Lattice Topology...');
    console.time('Lattice Triangulation');
    // Fibonacci nearest neighbor offsets for N = 1,000,000
    const offsets = [610, 987, 1597];
    const lineIndices = [];

    for (let i = 0; i < TOTAL_POINTS; i++) {
        const lonA = allLonLat[i * 2];
        for (let o = 0; o < offsets.length; o++) {
            const j = i + offsets[o];
            if (j >= TOTAL_POINTS) continue;
            const lonB = allLonLat[j * 2];
            // True Antimeridian Seam Culling: cull only edges crossing 2D map boundary
            if (Math.abs(lonA - lonB) > 180) continue;
            lineIndices.push(i, j);
        }
    }
    const lineIndicesArray = new Uint32Array(lineIndices);
    console.timeEnd('Lattice Triangulation');
    console.log(`Generated ${(lineIndicesArray.length / 2).toLocaleString()} lattice edges (${lineIndicesArray.length.toLocaleString()} indices).`);

    console.log('4. Packing Binary Columnar Buffer (public/geo-mesh-1m.bin)...');
    console.time('Binary Packing');
    const headerSize = 32;
    const pBytes = TOTAL_POINTS * 3 * 4;
    const tBytes = TOTAL_POINTS * 2 * 4;
    const typBytes = TOTAL_POINTS * 1 * 4;
    const iBytes = lineIndicesArray.byteLength;
    const totalBytes = headerSize + pBytes + tBytes + typBytes + iBytes;

    const binBuffer = Buffer.alloc(totalBytes);
    // Header
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

    // Body
    Buffer.from(pointsArray.buffer).copy(binBuffer, pOffset);
    Buffer.from(target2DArray.buffer).copy(binBuffer, tOffset);
    Buffer.from(typeArray.buffer).copy(binBuffer, typOffset);
    Buffer.from(lineIndicesArray.buffer).copy(binBuffer, iOffset);

    fs.writeFileSync('public/geo-mesh-1m.bin', binBuffer);
    console.timeEnd('Binary Packing');
    console.log(`Wrote public/geo-mesh-1m.bin: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.timeEnd('Total 1M Precomputation');
}

precompute1M().catch(console.error);
