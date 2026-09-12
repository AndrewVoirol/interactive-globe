import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const binPath = path.join(projectRoot, 'public', 'geo-vectors.bin');

console.log('================================================================');
console.log('CHALLENGER DEEP ADVERSARIAL PROBE: public/geo-vectors.bin');
console.log('================================================================');

const stats = fs.statSync(binPath);
const sizeBytes = stats.size;
const sizeMB = sizeBytes / (1024 * 1024);
const sizeDecimalMB = sizeBytes / 1_000_000;

console.log(`[Metric 1: File Size Budget]`);
console.log(`  Raw bytes: ${sizeBytes.toLocaleString()} bytes`);
console.log(`  Binary MB (MiB): ${sizeMB.toFixed(4)} MB`);
console.log(`  Decimal MB: ${sizeDecimalMB.toFixed(4)} MB`);
console.log(`  Constraint: >= 35.0 MB and <= 42.0 MB`);

const sizeBinaryPass = sizeMB >= 35.0 && sizeMB <= 42.0;
const sizeDecimalPass = sizeDecimalMB >= 35.0 && sizeDecimalMB <= 42.0;
console.log(`  Binary MB check: ${sizeBinaryPass ? 'PASS' : 'FAIL'}`);
console.log(`  Decimal MB check: ${sizeDecimalPass ? 'PASS' : 'FAIL'}`);

const buf = fs.readFileSync(binPath);

// Header check
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const vertexCount = buf.readUInt32LE(8);
const indexCount = buf.readUInt32LE(12);

console.log(`\n[Metric 2: Header & Byte Alignment]`);
console.log(`  Magic: 0x${magic.toString(16).toUpperCase()} (Expected: 0x47564543) - ${magic === 0x47564543 ? 'PASS' : 'FAIL'}`);
console.log(`  Version: ${version} (Expected: 1) - ${version === 1 ? 'PASS' : 'FAIL'}`);
console.log(`  Vertex Count: ${vertexCount.toLocaleString()}`);
console.log(`  Index Count: ${indexCount.toLocaleString()}`);

let reservedNonZero = 0;
for (let i = 16; i < 32; i++) {
  if (buf.readUInt8(i) !== 0) reservedNonZero++;
}
console.log(`  Reserved bytes zero-padded: ${reservedNonZero === 0 ? 'PASS' : 'FAIL (' + reservedNonZero + ' non-zero)'}`);

const expectedBytes = 32 + vertexCount * 32 + indexCount * 4;
console.log(`  Exact byte alignment: ${buf.length === expectedBytes ? 'PASS' : 'FAIL'}`);

// Columnar array mapping
let offset = 32;
const positions3D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 3);
offset += vertexCount * 3 * 4;

const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
offset += vertexCount * 2 * 4;

const dymaxion2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
offset += vertexCount * 2 * 4;

const vType = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount);
offset += vertexCount * 4;

const indices = new Uint32Array(buf.buffer, buf.byteOffset + offset, indexCount);

console.log(`\n[Metric 3: Numerical Singularities & 100% Vertex Probing]`);
let nanCount = 0;
let infCount = 0;
let negZeroCount = 0;
let radiusDevCount = 0;
let minR = Infinity;
let maxR = -Infinity;
let maxDevR = 0;

let mercatorOutOfRange = 0;
let minU = Infinity, maxU = -Infinity;
let minV = Infinity, maxV = -Infinity;

let dymaxionNanCount = 0;
let minDymU = Infinity, maxDymU = -Infinity;
let minDymV = Infinity, maxDymV = -Infinity;

function isNegZero(val) {
  return Object.is(val, -0);
}

for (let i = 0; i < vertexCount; i++) {
  // positions3D (x, y, z)
  for (let c = 0; c < 3; c++) {
    const val = positions3D[i * 3 + c];
    if (Number.isNaN(val)) nanCount++;
    if (!Number.isFinite(val)) infCount++;
    if (isNegZero(val)) negZeroCount++;
  }

  const x = positions3D[i * 3];
  const y = positions3D[i * 3 + 1];
  const z = positions3D[i * 3 + 2];
  const r = Math.hypot(x, y, z);
  if (r < minR) minR = r;
  if (r > maxR) maxR = r;
  const dev = Math.abs(r - 5.015);
  if (dev > maxDevR) maxDevR = dev;
  if (dev > 1e-4) radiusDevCount++;

  // target2D (u, v)
  for (let c = 0; c < 2; c++) {
    const val = target2D[i * 2 + c];
    if (Number.isNaN(val)) nanCount++;
    if (!Number.isFinite(val)) infCount++;
    if (isNegZero(val)) negZeroCount++;
  }
  const u = target2D[i * 2];
  const v = target2D[i * 2 + 1];
  if (u < minU) minU = u;
  if (u > maxU) maxU = u;
  if (v < minV) minV = v;
  if (v > maxV) maxV = v;
  if (Math.abs(u) > 16.0 || Math.abs(v) > 16.0) mercatorOutOfRange++;

  // dymaxion2D (ud, vd)
  for (let c = 0; c < 2; c++) {
    const val = dymaxion2D[i * 2 + c];
    if (Number.isNaN(val)) {
      nanCount++;
      dymaxionNanCount++;
    }
    if (!Number.isFinite(val)) infCount++;
    if (isNegZero(val)) negZeroCount++;
  }
  const ud = dymaxion2D[i * 2];
  const vd = dymaxion2D[i * 2 + 1];
  if (ud < minDymU) minDymU = ud;
  if (ud > maxDymU) maxDymU = ud;
  if (vd < minDymV) minDymV = vd;
  if (vd > maxDymV) maxDymV = vd;

  // vType
  const vt = vType[i];
  if (Number.isNaN(vt)) nanCount++;
  if (!Number.isFinite(vt)) infCount++;
  if (isNegZero(vt)) negZeroCount++;
}

console.log(`  Total NaNs across all attributes: ${nanCount} - ${nanCount === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  Total Infs across all attributes: ${infCount} - ${infCount === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  Negative Zeros (-0) detected: ${negZeroCount}`);
console.log(`  S^2 Radius min: ${minR.toFixed(8)}, max: ${maxR.toFixed(8)}`);
console.log(`  Max deviation from 5.015: ${maxDevR.toExponential(4)} (Threshold: 1e-4) - ${radiusDevCount === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  Mercator U range: [${minU.toFixed(4)}, ${maxU.toFixed(4)}]`);
console.log(`  Mercator V range: [${minV.toFixed(4)}, ${maxV.toFixed(4)}]`);
console.log(`  Mercator |u|, |v| <= 16.0 check: ${mercatorOutOfRange === 0 ? 'PASS' : 'FAIL (' + mercatorOutOfRange + ' violations)'}`);
console.log(`  Dymaxion U range: [${minDymU.toFixed(4)}, ${maxDymU.toFixed(4)}]`);
console.log(`  Dymaxion V range: [${minDymV.toFixed(4)}, ${maxDymV.toFixed(4)}]`);

console.log(`\n[Metric 4: Segment Boundaries, Antimeridian & Dymaxion Discontinuity Cuts]`);
const segmentCount = indexCount / 2;
let oobCount = 0;
let antimeridian170Violations = 0;
let deltaLon180Violations = 0;
let mercatorDelta15Violations = 0;
let dymaxionDist85Violations = 0;

let maxDeltaLon = 0;
let maxDeltaU = 0;
let maxDymDist = 0;

for (let s = 0; s < segmentCount; s++) {
  const iA = indices[s * 2];
  const iB = indices[s * 2 + 1];

  if (iA >= vertexCount || iB >= vertexCount) {
    oobCount++;
    continue;
  }

  const xA = positions3D[iA * 3];
  const zA = positions3D[iA * 3 + 2];
  const xB = positions3D[iB * 3];
  const zB = positions3D[iB * 3 + 2];

  const lonA = Math.atan2(xA, zA) * (180 / Math.PI);
  const lonB = Math.atan2(xB, zB) * (180 / Math.PI);

  if ((lonA > 170.0 && lonB < -170.0) || (lonB > 170.0 && lonA < -170.0)) {
    antimeridian170Violations++;
  }

  const dLon = Math.abs(lonA - lonB);
  if (dLon > maxDeltaLon) maxDeltaLon = dLon;
  if (dLon > 180.0) deltaLon180Violations++;

  const uA = target2D[iA * 2];
  const uB = target2D[iB * 2];
  const dU = Math.abs(uA - uB);
  if (dU > maxDeltaU) maxDeltaU = dU;
  if (dU > 15.0) mercatorDelta15Violations++;

  const udA = dymaxion2D[iA * 2];
  const vdA = dymaxion2D[iA * 2 + 1];
  const udB = dymaxion2D[iB * 2];
  const vdB = dymaxion2D[iB * 2 + 1];
  const dymDist = Math.hypot(udA - udB, vdA - vdB);
  if (dymDist > maxDymDist) maxDymDist = dymDist;
  if (dymDist > 0.85) dymaxionDist85Violations++;
}

console.log(`  Indices in bounds: ${oobCount === 0 ? 'PASS' : 'FAIL (' + oobCount + ' OOB)'}`);
console.log(`  Total segments: ${segmentCount.toLocaleString()}`);
console.log(`  Antimeridian 170°/-170° violations: ${antimeridian170Violations} - ${antimeridian170Violations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  Delta lon > 180° violations: ${deltaLon180Violations} - ${deltaLon180Violations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  Max segment delta lon: ${maxDeltaLon.toFixed(4)}°`);
console.log(`  Mercator delta U > 15.0 violations: ${mercatorDelta15Violations} - ${mercatorDelta15Violations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  Max Mercator delta U: ${maxDeltaU.toFixed(4)}`);
console.log(`  Dymaxion jump > 0.85 violations: ${dymaxionDist85Violations} - ${dymaxionDist85Violations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  Max Dymaxion segment jump: ${maxDymDist.toFixed(4)} (Limit: 0.85)`);

const verdict = (
  sizeBinaryPass &&
  sizeDecimalPass &&
  magic === 0x47564543 &&
  version === 1 &&
  vertexCount === 1130000 &&
  indexCount === 1130000 &&
  reservedNonZero === 0 &&
  buf.length === expectedBytes &&
  nanCount === 0 &&
  infCount === 0 &&
  radiusDevCount === 0 &&
  mercatorOutOfRange === 0 &&
  dymaxionNanCount === 0 &&
  oobCount === 0 &&
  antimeridian170Violations === 0 &&
  deltaLon180Violations === 0 &&
  mercatorDelta15Violations === 0 &&
  dymaxionDist85Violations === 0
);

console.log('\n================================================================');
console.log(`CHALLENGER INDEPENDENT VERDICT: ${verdict ? 'APPROVE' : 'REJECT'}`);
console.log('================================================================');

if (!verdict) {
  process.exit(1);
}
