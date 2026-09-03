#!/usr/bin/env node

/**
 * Precomputation script for High-Resolution Vector Coastlines & Major Waterways
 * 
 * Fetches:
 * 1. World Atlas 50m TopoJSON land mesh (continuous continental & island coastlines)
 * 2. Natural Earth 50m major river & lake centerlines
 * 
 * Computes:
 * - positions3D: 3D Cartesian coordinates on sphere at R = 5.015 (elevated to avoid z-fighting)
 * - target2D: EPSG:3857 Web Mercator 2D coordinates with antimeridian break detection
 * - dymaxion2D: Buckminster Fuller 20-facet icosahedral net 2D projection
 * - vType: 1.0 for Coastline, 0.5 for Major River / Waterway
 * - indices: Line segment pairs (A -> B)
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

function toSphere(lon, lat, r = RADIUS_SPHERE) {
  const lambda = lon * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  return [
    r * Math.cos(phi) * Math.sin(lambda),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(lambda)
  ];
}

function toMercator(lon, lat) {
  const lambda = lon * (Math.PI / 180);
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const phi = clampedLat * (Math.PI / 180);
  const x = lambda * RADIUS_MERCATOR;
  const y = RADIUS_MERCATOR * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
}

async function run() {
  console.log('================================================================');
  console.log('Precomputing Vector Coastlines & Waterways (geo-vectors.bin)');
  console.log('================================================================');

  // Step 1: Fetch TopoJSON Coastlines
  console.log('\n[1/4] Fetching World Atlas 50m Land TopoJSON...');
  const topoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
  const topoRes = await fetch(topoUrl);
  if (!topoRes.ok) throw new Error(`Failed to fetch TopoJSON: ${topoRes.statusText}`);
  const topoData = await topoRes.json();
  const coastMesh = topojson.mesh(topoData, topoData.objects.land);
  console.log(`  ✓ Loaded ${coastMesh.coordinates.length} coastline polyline paths`);

  // Step 2: Fetch Natural Earth 50m Rivers
  console.log('\n[2/4] Fetching Natural Earth 50m Major Rivers...');
  const riversUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson';
  const riversRes = await fetch(riversUrl);
  if (!riversRes.ok) throw new Error(`Failed to fetch Rivers GeoJSON: ${riversRes.statusText}`);
  const riversData = await riversRes.json();
  console.log(`  ✓ Loaded ${riversData.features.length} river features`);

  // Step 3: Process Line Segments with Antimeridian Seam Protection
  console.log('\n[3/4] Processing Geometry & Antimeridian Clipping...');
  
  const positions3DList = [];
  const target2DList = [];
  const dymaxion2DList = [];
  const vTypeList = [];
  const indicesList = [];

  function addLineString(coords, typeValue) {
    if (!coords || coords.length < 2) return;

    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];

      // Antimeridian Seam Protection: Never draw line across the 180° jump
      if (Math.abs(lon1 - lon2) > 180) continue;

      // Compute 3D and 2D projections
      const [x1, y1, z1] = toSphere(lon1, lat1);
      const [u1, v1] = toMercator(lon1, lat1);
      const [udym1, vdym1] = projectToDymaxion2D([x1, y1, z1]);

      const [x2, y2, z2] = toSphere(lon2, lat2);
      const [u2, v2] = toMercator(lon2, lat2);
      const [udym2, vdym2] = projectToDymaxion2D([x2, y2, z2]);

      // Dymaxion Net Cut Protection: Never connect across severed facet boundaries
      const dymDist = Math.hypot(udym1 - udym2, vdym1 - vdym2);
      if (dymDist > 0.85) continue;

      // Mercator Cut Protection: Never connect across antimeridian edge
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

  // Add coastlines (type = 1.0)
  for (const seg of coastMesh.coordinates) {
    addLineString(seg, 1.0);
  }
  const coastVertexCount = positions3DList.length / 3;
  console.log(`  ✓ Coastlines: ${coastVertexCount} vertices, ${indicesList.length / 2} line segments`);

  // Add rivers (type = 0.5)
  const prevSegments = indicesList.length / 2;
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
  const riverSegments = indicesList.length / 2 - prevSegments;
  const totalVertices = positions3DList.length / 3;
  const totalIndices = indicesList.length;
  console.log(`  ✓ Rivers: ${riverSegments} line segments`);
  console.log(`  ✓ Total Combined: ${totalVertices} vertices, ${totalIndices / 2} segments`);

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

  // Magic 'GVEC' = 0x47564543 (little-endian: 0x43, 0x45, 0x56, 0x47)
  buffer.writeUInt32LE(0x47564543, 0); // Magic
  buffer.writeUInt32LE(1, 4);          // Version
  buffer.writeUInt32LE(totalVertices, 8);
  buffer.writeUInt32LE(totalIndices, 12);
  buffer.writeUInt32LE(0, 16);         // Reserved
  buffer.writeUInt32LE(0, 20);
  buffer.writeUInt32LE(0, 24);
  buffer.writeUInt32LE(0, 28);

  let offset = HEADER_SIZE;

  // positions3D
  const posArray = new Float32Array(positions3DList);
  Buffer.from(posArray.buffer).copy(buffer, offset);
  offset += posBytes;

  // target2D
  const targetArray = new Float32Array(target2DList);
  Buffer.from(targetArray.buffer).copy(buffer, offset);
  offset += targetBytes;

  // dymaxion2D
  const dymArray = new Float32Array(dymaxion2DList);
  Buffer.from(dymArray.buffer).copy(buffer, offset);
  offset += dymBytes;

  // vType
  const typeArray = new Float32Array(vTypeList);
  Buffer.from(typeArray.buffer).copy(buffer, offset);
  offset += typeBytes;

  // indices
  const idxArray = new Uint32Array(indicesList);
  Buffer.from(idxArray.buffer).copy(buffer, offset);
  offset += indexBytes;

  const outPath = path.join(projectRoot, 'public', 'geo-vectors.bin');
  fs.writeFileSync(outPath, buffer);
  const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
  console.log(`  ✓ Written to: ${outPath} (${sizeMb} MB)`);
  console.log('================================================================');
}

run().catch(err => {
  console.error('Vector precomputation failed:', err);
  process.exit(1);
});
