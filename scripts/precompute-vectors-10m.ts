#!/usr/bin/env node

/**
 * scripts/precompute-vectors-10m.ts
 * High-Resolution (10m / GSHHG) Vector Coastlines & Waterways Precomputation
 * 
 * Ingests:
 * 1. World Atlas 10m / 50m Coastlines TopoJSON
 * 2. Natural Earth 10m Coastlines & Major River Centerlines
 * 
 * Computes:
 * - positions3D: Cartesian coordinates on sphere at R = 5.015 (sub-millimeter standoff above crust)
 * - target2D: EPSG:3857 Web Mercator coordinates with antimeridian seam breaks
 * - dymaxion2D: Fuller 20-facet net coordinates with facet cut edge culling
 * - vType: 1.0 for Coastlines, 0.5 for Major Rivers
 * - indices: Line segment endpoint index pairs (A -> B)
 * 
 * Packs into public/geo-vectors.bin (Magic 0x47564543, 'GVEC')
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as topojson from 'topojson-client';
import { projectToDymaxion2D } from '../src/utils/dymaxion';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const RADIUS_SPHERE = 5.015;
const RADIUS_MERCATOR = 5.0;
const MAX_LAT = 85.0511287798066;

function toSphere(lon: number, lat: number, r = RADIUS_SPHERE): [number, number, number] {
  const lambda = lon * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  return [
    r * Math.cos(phi) * Math.sin(lambda),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(lambda)
  ];
}

function toMercator(lon: number, lat: number): [number, number] {
  const lambda = lon * (Math.PI / 180);
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const phi = clampedLat * (Math.PI / 180);
  const x = lambda * RADIUS_MERCATOR;
  const y = RADIUS_MERCATOR * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
}

async function run() {
  console.log('================================================================');
  console.log('Precomputing High-Res Vector Outlines (geo-vectors.bin)');
  console.log('================================================================');

  // Step 1: Fetch Coastlines
  console.log('\n[1/4] Fetching High-Resolution Land TopoJSON...');
  // Try 50m / 10m CDN sources
  const topoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
  const topoRes = await fetch(topoUrl);
  if (!topoRes.ok) throw new Error(`Failed to fetch TopoJSON: ${topoRes.statusText}`);
  const topoData = await topoRes.json();
  const coastMesh = topojson.mesh(topoData, topoData.objects.land);
  console.log(`  ✓ Loaded ${coastMesh.coordinates.length} coastline paths`);

  // Step 2: Fetch Major Rivers
  console.log('\n[2/4] Fetching Major River Network Centerlines...');
  const riversUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson';
  let riversData: any = { features: [] };
  try {
    const riversRes = await fetch(riversUrl);
    if (riversRes.ok) {
      riversData = await riversRes.json();
      console.log(`  ✓ Loaded ${riversData.features.length} river features`);
    }
  } catch (e) {
    console.warn('  ⚠️ River fetch failed, continuing with coastlines only');
  }

  // Step 3: Process Line Segments with Antimeridian Seam Protection
  console.log('\n[3/4] Processing Geometry & Topological Seam Severance...');
  const positions3DList: number[] = [];
  const target2DList: number[] = [];
  const dymaxion2DList: number[] = [];
  const vTypeList: number[] = [];
  const indicesList: number[] = [];

  function addLineString(coords: any[], typeValue: number) {
    if (!coords || coords.length < 2) return;

    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];

      // Antimeridian Seam Protection
      if (Math.abs(lon1 - lon2) > 180.0) continue;

      const [x1, y1, z1] = toSphere(lon1, lat1);
      const [u1, v1] = toMercator(lon1, lat1);
      const [udym1, vdym1] = projectToDymaxion2D([x1, y1, z1]);

      const [x2, y2, z2] = toSphere(lon2, lat2);
      const [u2, v2] = toMercator(lon2, lat2);
      const [udym2, vdym2] = projectToDymaxion2D([x2, y2, z2]);

      // Dymaxion Net Cut Protection
      const dymDist = Math.hypot(udym1 - udym2, vdym1 - vdym2);
      if (dymDist > 0.85) continue;

      // Mercator Cut Protection
      if (Math.abs(u1 - u2) > 15.0) continue;

      const idxStart = positions3DList.length / 3;

      positions3DList.push(x1, y1, z1);
      target2DList.push(u1, v1);
      dymaxion2DList.push(udym1, vdym1);
      vTypeList.push(typeValue);

      positions3DList.push(x2, y2, z2);
      target2DList.push(u2, v2);
      dymaxion2DList.push(udym2, vdym2);
      vTypeList.push(typeValue);

      indicesList.push(idxStart, idxStart + 1);
    }
  }

  for (const seg of coastMesh.coordinates) {
    addLineString(seg, 1.0);
  }

  for (const feature of riversData.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === 'LineString') {
      addLineString(geom.coordinates, 0.5);
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        addLineString(line, 0.5);
      }
    }
  }

  const totalVertices = positions3DList.length / 3;
  const totalIndices = indicesList.length;
  console.log(`  ✓ Total Processed: ${totalVertices.toLocaleString()} vertices, ${(totalIndices / 2).toLocaleString()} line segments`);

  // Step 4: Serialize into Binary Buffer (0x47564543)
  console.log('\n[4/4] Packing into Columnar Binary Buffer...');
  const HEADER_SIZE = 32;
  const posBytes = totalVertices * 3 * 4;
  const targetBytes = totalVertices * 2 * 4;
  const dymBytes = totalVertices * 2 * 4;
  const typeBytes = totalVertices * 1 * 4;
  const indexBytes = totalIndices * 4;

  const totalBytes = HEADER_SIZE + posBytes + targetBytes + dymBytes + typeBytes + indexBytes;
  const buffer = Buffer.alloc(totalBytes);

  buffer.writeUInt32LE(0x47564543, 0); // Magic 'GVEC'
  buffer.writeUInt32LE(1, 4);          // Version
  buffer.writeUInt32LE(totalVertices, 8);
  buffer.writeUInt32LE(totalIndices, 12);
  buffer.writeUInt32LE(0, 16);
  buffer.writeUInt32LE(0, 20);
  buffer.writeUInt32LE(0, 24);
  buffer.writeUInt32LE(0, 28);

  let offset = HEADER_SIZE;
  const posArray = new Float32Array(positions3DList);
  Buffer.from(posArray.buffer).copy(buffer, offset);
  offset += posBytes;

  const targetArray = new Float32Array(target2DList);
  Buffer.from(targetArray.buffer).copy(buffer, offset);
  offset += targetBytes;

  const dymArray = new Float32Array(dymaxion2DList);
  Buffer.from(dymArray.buffer).copy(buffer, offset);
  offset += dymBytes;

  const typeArray = new Float32Array(vTypeList);
  Buffer.from(typeArray.buffer).copy(buffer, offset);
  offset += typeBytes;

  const idxArray = new Uint32Array(indicesList);
  Buffer.from(idxArray.buffer).copy(buffer, offset);
  offset += indexBytes;

  const outPath = path.join(projectRoot, 'public', 'geo-vectors.bin');
  fs.writeFileSync(outPath, buffer);
  console.log(`  ✓ Successfully wrote ${outPath} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('================================================================');
}

run().catch(err => {
  console.error('Vector precomputation failed:', err);
  process.exit(1);
});
