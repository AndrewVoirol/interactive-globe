#!/usr/bin/env node

/**
 * scripts/precompute-overture-vectors.ts
 * 
 * High-Resolution Vector Coastlines & Waterways Precomputation
 * Using Overture Maps GeoParquet via DuckDB + Natural Earth 10m Base
 * 
 * Ingests:
 * 1. Overture Maps GeoParquet directly from AWS S3 via DuckDB (spatial + httpfs)
 *    (s3://overturemaps-us-west-2/release/2026-08-19.0/theme=base/type=water/*)
 *    Extracts high-resolution ocean coastline boundaries (subtype = 'ocean') and major rivers (subtype = 'river' AND class = 'river').
 * 2. Natural Earth 1:10m Physical Coastlines (via world-atlas land-10m.json)
 * 3. Natural Earth 1:10m Major Rivers & Lake Centerlines
 * 4. Local ETOPO 2022 16-bit DEM (public/earth-etopo2022-dem-u16.bin) for elevation sampling & topographic densification
 * 
 * Computes:
 * - positions3D: Cartesian coordinates on sphere at R = 5.015 (sub-millimeter standoff)
 * - target2D: EPSG:3857 Web Mercator coordinates with antimeridian seam breaks
 * - dymaxion2D: Fuller 20-facet net coordinates with facet cut edge culling
 * - vType: 1.0 for Coastlines, 0.5 for Major Rivers
 * - indices: Line segment endpoint index pairs (A -> B)
 * 
 * Output:
 * public/geo-vectors.bin (Magic 0x47564543, 'GVEC', target 35.0 - 42.0 MB)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as topojson from 'topojson-client';
import { Database } from 'duckdb-async';
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

interface OvertureFeatureItem {
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number };
  geojson: string;
  vtype: number;
}

interface TargetRegion {
  name: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

const OVERTURE_REGIONS: TargetRegion[] = [
  { name: 'Hawaii Archipelago', bbox: [-161, 18, -154, 23] },
  { name: 'Japan & Mount Fuji', bbox: [128, 30, 145, 45] },
  { name: 'Cape Cod & New England', bbox: [-74, 40, -69, 44] },
  { name: 'US West Coast & Salish Sea', bbox: [-126, 32, -120, 49] },
  { name: 'UK & English Channel', bbox: [-6, 49, 2, 54] },
  { name: 'Mediterranean Basin', bbox: [-6, 35, 18, 44] },
  { name: 'Great Lakes & St. Lawrence', bbox: [-90, 41, -74, 48] }
];

async function fetchOvertureFeatures(forceFetch = false): Promise<OvertureFeatureItem[]> {
  const cacheDir = path.join(projectRoot, '.cache', 'overture');
  const cacheFile = path.join(cacheDir, 'overture-coastal-data.json');

  if (!forceFetch && fs.existsSync(cacheFile)) {
    try {
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cachedData) && cachedData.length > 0) {
        console.log(`  ✓ Loaded ${cachedData.length} cached Overture features from ${cacheFile}`);
        return cachedData;
      }
    } catch (e) {
      console.warn('  ⚠️ Failed to parse cache, re-querying Overture from S3...');
    }
  }

  console.log('  Connecting to DuckDB in-memory database with spatial + httpfs...');
  const db = await Database.create(':memory:');
  await db.exec(`
    INSTALL spatial; LOAD spatial;
    INSTALL httpfs; LOAD httpfs;
    SET s3_region = 'us-west-2';
    SET threads = 8;
  `);

  const s3Path = 's3://overturemaps-us-west-2/release/2026-08-19.0/theme=base/type=water/*';
  const overtureFeatures: OvertureFeatureItem[] = [];

  for (const region of OVERTURE_REGIONS) {
    const [minLon, minLat, maxLon, maxLat] = region.bbox;
    console.log(`  Querying Overture S3 for ${region.name} [${minLon}, ${minLat}, ${maxLon}, ${maxLat}]...`);
    const t0 = Date.now();

    try {
      // 1. Ocean Coastlines (subtype = 'ocean')
      const oceanRows = await db.all(`
        SELECT 
          bbox,
          ST_AsGeoJSON(ST_Simplify(ST_Boundary(geometry), 0.002)) as geojson,
          1.0 as vtype
        FROM read_parquet('${s3Path}')
        WHERE subtype = 'ocean'
          AND bbox.xmin >= ${minLon} AND bbox.xmax <= ${maxLon}
          AND bbox.ymin >= ${minLat} AND bbox.ymax <= ${maxLat}
      `);

      // 2. Major Rivers (subtype = 'river' AND class = 'river')
      const riverRows = await db.all(`
        SELECT 
          bbox,
          ST_AsGeoJSON(ST_Simplify(geometry, 0.003)) as geojson,
          0.5 as vtype
        FROM read_parquet('${s3Path}')
        WHERE subtype = 'river' AND class = 'river'
          AND bbox.xmin >= ${minLon} AND bbox.xmax <= ${maxLon}
          AND bbox.ymin >= ${minLat} AND bbox.ymax <= ${maxLat}
        LIMIT 300
      `);

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`    ✓ ${region.name}: ${oceanRows.length} ocean + ${riverRows.length} river features in ${elapsed}s`);

      for (const r of oceanRows as any[]) {
        if (r.geojson && r.bbox) {
          overtureFeatures.push({ bbox: r.bbox, geojson: r.geojson, vtype: 1.0 });
        }
      }
      for (const r of riverRows as any[]) {
        if (r.geojson && r.bbox) {
          overtureFeatures.push({ bbox: r.bbox, geojson: r.geojson, vtype: 0.5 });
        }
      }
    } catch (err) {
      console.warn(`    ⚠️ Failed querying region ${region.name}:`, err);
    }
  }

  // Cache to disk
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  fs.writeFileSync(cacheFile, JSON.stringify(overtureFeatures));
  console.log(`  ✓ Saved ${overtureFeatures.length} Overture features to ${cacheFile}`);

  return overtureFeatures;
}

function isTileBoundary(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number }
): boolean {
  const eps = 0.003;
  const isVert = Math.abs(lon1 - lon2) < 0.001;
  const isHoriz = Math.abs(lat1 - lat2) < 0.001;
  if (isVert && (Math.abs(lon1 - bbox.xmin) < eps || Math.abs(lon1 - bbox.xmax) < eps)) return true;
  if (isHoriz && (Math.abs(lat1 - bbox.ymin) < eps || Math.abs(lat1 - bbox.ymax) < eps)) return true;
  return false;
}

async function run() {
  console.log('================================================================');
  console.log('Precomputing Overture Maps High-Res Vectors (geo-vectors.bin)');
  console.log('================================================================');

  // Step 0: Ingest Local ETOPO 2022 DEM for Topographic Relief Sampling
  console.log('\n[1/6] Ingesting Local ETOPO 2022 DEM for Topographic Relief Sampling...');
  const demPath = path.join(projectRoot, 'public', 'earth-etopo2022-dem-u16.bin');
  let demU16: Uint16Array | null = null;
  if (fs.existsSync(demPath)) {
    const demBuf = fs.readFileSync(demPath);
    demU16 = new Uint16Array(demBuf.buffer, demBuf.byteOffset, demBuf.byteLength / 2);
    console.log(`  ✓ Loaded DEM grid: ${(demBuf.byteLength / (1024 * 1024)).toFixed(1)} MB (${demU16.length / 4} pixels)`);
  } else {
    console.warn(`  ⚠️ DEM file not found at ${demPath}, continuing with flat sea-level sampling`);
  }

  function sampleElevation(lon: number, lat: number): number {
    if (!demU16) return 0;
    const u = (lon + 180.0) / 360.0;
    const v = (90.0 - lat) / 180.0;
    const is8k = demU16.length >= 8192 * 4096 * 4;
    const W = is8k ? 8192 : 2048;
    const H = is8k ? 4096 : 1024;
    const px = Math.max(0, Math.min(W - 1, Math.floor(u * W)));
    const py = Math.max(0, Math.min(H - 1, Math.floor(v * H)));
    const idx = (py * W + px) * 4;
    const val = demU16[idx + 3]; // Channel 3: continuous signed geoid elevation
    return (val / 65535.0) * 19772.0 - 10924.0;
  }

  // Step 1: Query Overture Maps GeoParquet directly from S3 via DuckDB
  console.log('\n[2/6] Querying Overture Maps GeoParquet from S3 via DuckDB...');
  const forceFetch = process.argv.includes('--force-fetch');
  const overtureFeatures = await fetchOvertureFeatures(forceFetch);

  // Step 2: Ingest Global 1:10m Coastlines Base
  console.log('\n[3/6] Fetching Global 1:10m Coastlines TopoJSON...');
  const topoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-10m.json';
  const topoRes = await fetch(topoUrl);
  if (!topoRes.ok) throw new Error(`Failed to fetch TopoJSON: ${topoRes.statusText}`);
  const topoData = await topoRes.json();
  const coastMesh = topojson.mesh(topoData, topoData.objects.land);
  console.log(`  ✓ Loaded ${coastMesh.coordinates.length} global coastline paths`);

  // Step 3: Ingest Natural Earth 1:10m Major Rivers
  console.log('\n[4/6] Fetching Natural Earth 1:10m River Network Centerlines...');
  const riversUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson';
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

  // Step 4: Geometry Pipeline: Seam Severance, Topographic Relief Subdivision, Columnar Buffers
  console.log('\n[5/6] Processing Linework, Seam Cuts, and Topographic Relief Subdivision...');
  const positions3DList: number[] = [];
  const target2DList: number[] = [];
  const dymaxion2DList: number[] = [];
  const vTypeList: number[] = [];
  const indicesList: number[] = [];

  function emitSegment(lon1: number, lat1: number, lon2: number, lat2: number, typeValue: number) {
    // Antimeridian Seam Protection (delta lambda > pi)
    if (Math.abs(lon1 - lon2) > 180.0) return;

    // Boundary Crossing Protection (lon > 170 to lon < -170)
    if ((lon1 > 170.0 && lon2 < -170.0) || (lon2 > 170.0 && lon1 < -170.0)) return;

    const [x1, y1, z1] = toSphere(lon1, lat1);
    const [u1, v1] = toMercator(lon1, lat1);
    const [udym1, vdym1] = projectToDymaxion2D([x1, y1, z1]);

    const [x2, y2, z2] = toSphere(lon2, lat2);
    const [u2, v2] = toMercator(lon2, lat2);
    const [udym2, vdym2] = projectToDymaxion2D([x2, y2, z2]);

    // Dymaxion Net Cut Protection (facet seam limit 0.85)
    const dymDist = Math.hypot(udym1 - udym2, vdym1 - vdym2);
    if (dymDist > 0.85) return;

    // Mercator Cut Protection (|u1 - u2| <= 15.0)
    if (Math.abs(u1 - u2) > 15.0) return;

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

  function processSegment(lon1: number, lat1: number, lon2: number, lat2: number, typeValue: number) {
    if (Math.abs(lon1 - lon2) > 180.0) return;

    const dDeg = Math.hypot(lon1 - lon2, lat1 - lat2);
    const elev1 = sampleElevation(lon1, lat1);
    const elev2 = sampleElevation(lon2, lat2);
    const dElev = Math.abs(elev1 - elev2);

    // Subdivide segments traversing steep mountain topography for sub-kilometer fidelity
    if (dDeg > 0.02 && dElev > 30.0) {
      const midLon = (lon1 + lon2) * 0.5;
      const midLat = (lat1 + lat2) * 0.5;
      emitSegment(lon1, lat1, midLon, midLat, typeValue);
      emitSegment(midLon, midLat, lon2, lat2, typeValue);
    } else {
      emitSegment(lon1, lat1, lon2, lat2, typeValue);
    }
  }

  function addLineString(coords: any[], typeValue: number, bbox?: { xmin: number; xmax: number; ymin: number; ymax: number }) {
    if (!coords || coords.length < 2) return;

    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];

      // If bbox is provided, filter out artificial tile cut borders from Overture ocean boundaries
      if (bbox && isTileBoundary(lon1, lat1, lon2, lat2, bbox)) {
        continue;
      }

      processSegment(lon1, lat1, lon2, lat2, typeValue);
    }
  }

  // A. Process Global 1:10m Coastlines
  console.log('  Adding Global 1:10m Coastlines...');
  for (const seg of coastMesh.coordinates) {
    addLineString(seg, 1.0);
  }

  // B. Process Overture Maps Features (Coastlines & Waterways)
  console.log(`  Adding ${overtureFeatures.length} Overture Maps GeoParquet features...`);
  for (const item of overtureFeatures) {
    try {
      const geom = JSON.parse(item.geojson);
      if (geom.type === 'LineString') {
        addLineString(geom.coordinates, item.vtype, item.bbox);
      } else if (geom.type === 'MultiLineString') {
        for (const line of geom.coordinates) {
          addLineString(line, item.vtype, item.bbox);
        }
      }
    } catch (e) {
      // ignore parsing error
    }
  }

  // C. Process Major Rivers
  console.log('  Adding 1:10m Major River Centerlines...');
  for (const feature of riversData.features) {
    // Filter minor tributaries by scalerank <= 6 for optimal ~39MB footprint
    const rank = feature.properties?.scalerank ?? 0;
    if (rank > 6) continue;

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

  let totalVertices = positions3DList.length / 3;
  let totalIndices = indicesList.length;
  console.log(`  ✓ Initial Processed: ${totalVertices.toLocaleString()} vertices, ${(totalIndices / 2).toLocaleString()} segments`);

  // Target Budget Management: Target range is 35.0 MB to 42.0 MB (target ~38.0 - 40.5 MB)
  // File size = 32 + 36 * totalVertices
  // 35.0 MB = 1,019,448 vertices
  // 42.0 MB = 1,223,337 vertices
  // Ideal sweet spot: 1,110,000 - 1,140,000 vertices (~38.1 - 39.2 MB)
  const MAX_TARGET_VERTICES = 1_130_000;
  
  let finalPositions: number[] = positions3DList;
  let finalTarget2D: number[] = target2DList;
  let finalDymaxion2D: number[] = dymaxion2DList;
  let finalVType: number[] = vTypeList;
  let finalIndices: number[] = indicesList;

  if (totalVertices > MAX_TARGET_VERTICES) {
    console.log(`  Calibrating to fit within budget (current: ${totalVertices.toLocaleString()}, target: ${MAX_TARGET_VERTICES.toLocaleString()})...`);
    
    // Separate segments into coastlines (1.0) and rivers (0.5)
    const coastSegIndices: number[] = [];
    const riverSegIndices: number[] = [];

    const segCount = totalIndices / 2;
    for (let s = 0; s < segCount; s++) {
      const idxA = indicesList[s * 2];
      if (vTypeList[idxA] >= 0.75) {
        coastSegIndices.push(s);
      } else {
        riverSegIndices.push(s);
      }
    }

    console.log(`    Segments: ${coastSegIndices.length.toLocaleString()} coastlines, ${riverSegIndices.length.toLocaleString()} rivers`);

    // Target allocation: ~445,000 coast segments (890k vertices) + ~120,000 river segments (240k vertices) = 565,000 segments (1.13M vertices)
    const maxCoastSegs = Math.min(coastSegIndices.length, 445_000);
    const maxRiverSegs = Math.min(riverSegIndices.length, Math.floor(MAX_TARGET_VERTICES / 2) - maxCoastSegs);

    const keptSegIndices: number[] = [];
    for (let i = 0; i < maxCoastSegs; i++) {
      keptSegIndices.push(coastSegIndices[i]);
    }
    for (let i = 0; i < maxRiverSegs; i++) {
      keptSegIndices.push(riverSegIndices[i]);
    }

    console.log(`    Selected ${keptSegIndices.length.toLocaleString()} segments (${(keptSegIndices.length * 2).toLocaleString()} vertices)`);

    const prunedPos: number[] = [];
    const prunedTarget: number[] = [];
    const prunedDym: number[] = [];
    const prunedType: number[] = [];
    const prunedIdx: number[] = [];

    for (let i = 0; i < keptSegIndices.length; i++) {
      const s = keptSegIndices[i];
      const idxA = indicesList[s * 2];
      const idxB = indicesList[s * 2 + 1];

      const newIdxA = prunedPos.length / 3;
      prunedPos.push(
        positions3DList[idxA * 3],
        positions3DList[idxA * 3 + 1],
        positions3DList[idxA * 3 + 2]
      );
      prunedTarget.push(target2DList[idxA * 2], target2DList[idxA * 2 + 1]);
      prunedDym.push(dymaxion2DList[idxA * 2], dymaxion2DList[idxA * 2 + 1]);
      prunedType.push(vTypeList[idxA]);

      const newIdxB = prunedPos.length / 3;
      prunedPos.push(
        positions3DList[idxB * 3],
        positions3DList[idxB * 3 + 1],
        positions3DList[idxB * 3 + 2]
      );
      prunedTarget.push(target2DList[idxB * 2], target2DList[idxB * 2 + 1]);
      prunedDym.push(dymaxion2DList[idxB * 2], dymaxion2DList[idxB * 2 + 1]);
      prunedType.push(vTypeList[idxB]);

      prunedIdx.push(newIdxA, newIdxB);
    }

    finalPositions = prunedPos;
    finalTarget2D = prunedTarget;
    finalDymaxion2D = prunedDym;
    finalVType = prunedType;
    finalIndices = prunedIdx;
  }

  totalVertices = finalPositions.length / 3;
  totalIndices = finalIndices.length;
  console.log(`  ✓ Final Buffer Count: ${totalVertices.toLocaleString()} vertices, ${(totalIndices / 2).toLocaleString()} segments`);

  // Step 5: Serialize into Columnar Binary Buffer (0x47564543)
  console.log('\n[6/6] Packing into Columnar Binary Buffer...');
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
  const posArray = new Float32Array(finalPositions);
  Buffer.from(posArray.buffer).copy(buffer, offset);
  offset += posBytes;

  const targetArray = new Float32Array(finalTarget2D);
  Buffer.from(targetArray.buffer).copy(buffer, offset);
  offset += targetBytes;

  const dymArray = new Float32Array(finalDymaxion2D);
  Buffer.from(dymArray.buffer).copy(buffer, offset);
  offset += dymBytes;

  const typeArray = new Float32Array(finalVType);
  Buffer.from(typeArray.buffer).copy(buffer, offset);
  offset += typeBytes;

  const idxArray = new Uint32Array(finalIndices);
  Buffer.from(idxArray.buffer).copy(buffer, offset);
  offset += indexBytes;

  const outPath = path.join(projectRoot, 'public', 'geo-vectors.bin');
  fs.writeFileSync(outPath, buffer);
  const sizeMB = (buffer.length / (1024 * 1024)).toFixed(4);
  console.log(`  ✓ Successfully wrote ${outPath} (${sizeMB} MB)`);
  console.log('================================================================');
}

run().catch(err => {
  console.error('Overture vector precomputation failed:', err);
  process.exit(1);
});
