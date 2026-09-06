import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const binPath = path.join(projectRoot, 'public', 'geo-vectors.bin');

console.log('================================================================');
console.log('ADVERSARIAL VERIFICATION HARNESS: public/geo-vectors.bin');
console.log('================================================================');

if (!fs.existsSync(binPath)) {
  console.error(`FAIL: File not found at ${binPath}`);
  process.exit(1);
}

const stats = fs.statSync(binPath);
const fileSizeMB = stats.size / (1024 * 1024);
console.log(`[1] File Existence and Size:`);
console.log(`    Path: ${binPath}`);
console.log(`    Size: ${stats.size} bytes (${fileSizeMB.toFixed(4)} MB)`);

const sizeInRange = fileSizeMB >= 35.0 && fileSizeMB <= 45.0;
console.log(`    Within ~35-45 MB range: ${sizeInRange ? 'PASS' : 'FAIL'} (${fileSizeMB.toFixed(2)} MB)`);

const buf = fs.readFileSync(binPath);

// Header check
console.log(`\n[2] 32-Byte Header Inspection:`);
if (buf.length < 32) {
  console.error(`FAIL: Buffer smaller than 32-byte header (${buf.length} bytes)`);
  process.exit(1);
}

const magic = buf.readUInt32LE(0);
const magicHex = '0x' + magic.toString(16).toUpperCase();
const magicAscii = String.fromCharCode(
  buf.readUInt8(0),
  buf.readUInt8(1),
  buf.readUInt8(2),
  buf.readUInt8(3)
);
const version = buf.readUInt32LE(4);
const vertexCount = buf.readUInt32LE(8);
const indexCount = buf.readUInt32LE(12);

console.log(`    Magic: ${magicHex} ('${magicAscii}') — ${magic === 0x47564543 ? 'PASS' : 'FAIL'}`);
console.log(`    Version: ${version} — ${version === 1 ? 'PASS' : 'FAIL'}`);
console.log(`    Vertex Count: ${vertexCount.toLocaleString()} — ${vertexCount > 1000000 ? 'PASS (> 1,000,000)' : 'FAIL'}`);
console.log(`    Index Count: ${indexCount.toLocaleString()} — ${indexCount > 1000000 ? 'PASS (> 1,000,000)' : 'FAIL'}`);

// Reserved 16 bytes
let reservedZero = true;
for (let i = 16; i < 32; i += 4) {
  if (buf.readUInt32LE(i) !== 0) {
    reservedZero = false;
  }
}
console.log(`    Reserved Bytes (16-31) Zero-Padded: ${reservedZero ? 'PASS' : 'FAIL'}`);

// Columnar array size check
const expectedBytes = 32 + vertexCount * 32 + indexCount * 4;
console.log(`\n[3] Byte Layout Integrity:`);
console.log(`    Expected bytes: 32 + ${vertexCount}*32 + ${indexCount}*4 = ${expectedBytes}`);
console.log(`    Actual bytes:   ${buf.length}`);
console.log(`    Layout Match:   ${buf.length === expectedBytes ? 'PASS' : 'FAIL'}`);

if (buf.length !== expectedBytes) {
  console.error(`FAIL: Buffer length mismatch! Expected ${expectedBytes}, got ${buf.length}`);
  process.exit(1);
}

// Slice Float32 / Uint32 arrays
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

console.log(`\n[4] Full Vertex Array Scan (100% of ${vertexCount.toLocaleString()} vertices):`);

let nanPositions = 0;
let nanTarget2D = 0;
let nanDymaxion2D = 0;
let nanVType = 0;

let minR = Infinity;
let maxR = -Infinity;
let sumR = 0;

let minU = Infinity;
let maxU = -Infinity;
let minV = Infinity;
let maxV = -Infinity;

let minDymU = Infinity;
let maxDymU = -Infinity;
let minDymV = Infinity;
let maxDymV = -Infinity;

let coastCount = 0;
let riverCount = 0;
let otherTypeCount = 0;

for (let i = 0; i < vertexCount; i++) {
  // positions3D
  const x = positions3D[i * 3];
  const y = positions3D[i * 3 + 1];
  const z = positions3D[i * 3 + 2];

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    nanPositions++;
  } else {
    const r = Math.hypot(x, y, z);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    sumR += r;
  }

  // target2D
  const u = target2D[i * 2];
  const v = target2D[i * 2 + 1];
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    nanTarget2D++;
  } else {
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  // dymaxion2D
  const ud = dymaxion2D[i * 2];
  const vd = dymaxion2D[i * 2 + 1];
  if (!Number.isFinite(ud) || !Number.isFinite(vd)) {
    nanDymaxion2D++;
  } else {
    if (ud < minDymU) minDymU = ud;
    if (ud > maxDymU) maxDymU = ud;
    if (vd < minDymV) minDymV = vd;
    if (vd > maxDymV) maxDymV = vd;
  }

  // vType
  const vt = vType[i];
  if (!Number.isFinite(vt)) {
    nanVType++;
  } else if (vt === 1.0) {
    coastCount++;
  } else if (vt === 0.5) {
    riverCount++;
  } else {
    otherTypeCount++;
  }
}

const meanR = sumR / (vertexCount - nanPositions);

console.log(`    positions3D NaNs/Infs: ${nanPositions} — ${nanPositions === 0 ? 'PASS' : 'FAIL'}`);
console.log(`    S^2 Radius: min=${minR.toFixed(6)}, max=${maxR.toFixed(6)}, mean=${meanR.toFixed(6)}`);
console.log(`    S^2 Radius Deviation from 5.015: ${Math.max(Math.abs(minR - 5.015), Math.abs(maxR - 5.015)).toExponential(4)} — ${Math.abs(meanR - 5.015) < 1e-4 ? 'PASS' : 'FAIL'}`);

console.log(`    target2D NaNs/Infs: ${nanTarget2D} — ${nanTarget2D === 0 ? 'PASS' : 'FAIL'}`);
console.log(`    target2D Mercator u range: [${minU.toFixed(4)}, ${maxU.toFixed(4)}] (expected approx [-15.708, 15.708])`);
console.log(`    target2D Mercator v range: [${minV.toFixed(4)}, ${maxV.toFixed(4)}] (expected approx [-15.708, 15.708])`);
const mercatorValid = minU >= -16.0 && maxU <= 16.0 && minV >= -16.0 && maxV <= 16.0;
console.log(`    Mercator bounds valid: ${mercatorValid ? 'PASS' : 'FAIL'}`);

console.log(`    dymaxion2D NaNs/Infs: ${nanDymaxion2D} — ${nanDymaxion2D === 0 ? 'PASS' : 'FAIL'}`);
console.log(`    dymaxion2D bounds: u in [${minDymU.toFixed(4)}, ${maxDymU.toFixed(4)}], v in [${minDymV.toFixed(4)}, ${maxDymV.toFixed(4)}]`);
const dymaxionValid = Math.abs(minDymU) < 100.0 && Math.abs(maxDymU) < 100.0 && Math.abs(minDymV) < 100.0 && Math.abs(maxDymV) < 100.0;
console.log(`    Dymaxion bounds valid: ${dymaxionValid ? 'PASS' : 'FAIL'}`);

console.log(`    vType: Coastlines=${coastCount.toLocaleString()} (1.0), Rivers=${riverCount.toLocaleString()} (0.5), Other=${otherTypeCount}`);
console.log(`    vType validity: ${otherTypeCount === 0 && nanVType === 0 ? 'PASS' : 'FAIL'}`);

console.log(`\n[5] Indices and Segment Adversarial Antimeridian Severance Check:`);
let oobIndices = 0;
for (let j = 0; j < indexCount; j++) {
  if (indices[j] >= vertexCount) {
    oobIndices++;
  }
}
console.log(`    Out of bounds indices: ${oobIndices} — ${oobIndices === 0 ? 'PASS' : 'FAIL'}`);

const segmentCount = indexCount / 2;
console.log(`    Total Line Segments: ${segmentCount.toLocaleString()}`);

let antimeridianViolations = 0;
let wrapLongDeltaViolations = 0;
let mercatorJumpViolations = 0;
let dymaxionJumpViolations = 0;

let maxDeltaLon = 0;
let maxMercatorDeltaU = 0;
let maxDymDist = 0;

for (let s = 0; s < segmentCount; s++) {
  const idxA = indices[s * 2];
  const idxB = indices[s * 2 + 1];

  const xA = positions3D[idxA * 3];
  const yA = positions3D[idxA * 3 + 1];
  const zA = positions3D[idxA * 3 + 2];

  const xB = positions3D[idxB * 3];
  const yB = positions3D[idxB * 3 + 1];
  const zB = positions3D[idxB * 3 + 2];

  // Longitude in degrees: atan2(x, z) * 180 / PI
  const lonA = Math.atan2(xA, zA) * (180.0 / Math.PI);
  const lonB = Math.atan2(xB, zB) * (180.0 / Math.PI);

  // Check requirement 3: no segments connect longitude > 170 deg to longitude < -170 deg
  if ((lonA > 170.0 && lonB < -170.0) || (lonB > 170.0 && lonA < -170.0)) {
    antimeridianViolations++;
    if (antimeridianViolations <= 5) {
      console.warn(`    VIOLATION at segment ${s}: lonA=${lonA.toFixed(2)}, lonB=${lonB.toFixed(2)}`);
    }
  }

  const dLon = Math.abs(lonA - lonB);
  if (dLon > maxDeltaLon) maxDeltaLon = dLon;
  if (dLon > 180.0) {
    wrapLongDeltaViolations++;
  }

  // Mercator delta U
  const uA = target2D[idxA * 2];
  const uB = target2D[idxB * 2];
  const deltaU = Math.abs(uA - uB);
  if (deltaU > maxMercatorDeltaU) maxMercatorDeltaU = deltaU;
  if (deltaU > 15.0) {
    mercatorJumpViolations++;
  }

  // Dymaxion jump
  const udA = dymaxion2D[idxA * 2];
  const vdA = dymaxion2D[idxA * 2 + 1];
  const udB = dymaxion2D[idxB * 2];
  const vdB = dymaxion2D[idxB * 2 + 1];
  const dymDist = Math.hypot(udA - udB, vdA - vdB);
  if (dymDist > maxDymDist) maxDymDist = dymDist;
  if (dymDist > 0.85) {
    dymaxionJumpViolations++;
  }
}

console.log(`    Antimeridian Jump (>170° to <-170°) Violations: ${antimeridianViolations} — ${antimeridianViolations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`    Longitude Delta > 180° Violations: ${wrapLongDeltaViolations} — ${wrapLongDeltaViolations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`    Max Longitude Delta across all segments: ${maxDeltaLon.toFixed(4)}°`);
console.log(`    Mercator Delta U > 15.0 Violations: ${mercatorJumpViolations} — ${mercatorJumpViolations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`    Max Mercator Delta U: ${maxMercatorDeltaU.toFixed(4)} (threshold: 15.0)`);
console.log(`    Dymaxion Jump > 0.85 Violations: ${dymaxionJumpViolations} — ${dymaxionJumpViolations === 0 ? 'PASS' : 'FAIL'}`);
console.log(`    Max Dymaxion Segment Distance: ${maxDymDist.toFixed(4)} (threshold: 0.85)`);

const overallPass = (
  sizeInRange &&
  magic === 0x47564543 &&
  version === 1 &&
  vertexCount > 1000000 &&
  indexCount > 1000000 &&
  reservedZero &&
  buf.length === expectedBytes &&
  nanPositions === 0 &&
  Math.abs(meanR - 5.015) < 1e-4 &&
  nanTarget2D === 0 &&
  mercatorValid &&
  nanDymaxion2D === 0 &&
  dymaxionValid &&
  otherTypeCount === 0 &&
  oobIndices === 0 &&
  antimeridianViolations === 0 &&
  wrapLongDeltaViolations === 0 &&
  mercatorJumpViolations === 0 &&
  dymaxionJumpViolations === 0
);

console.log('\n================================================================');
console.log(`FINAL VERDICT: ${overallPass ? 'APPROVE' : 'CHALLENGE_FAILED'}`);
console.log('================================================================');

if (!overallPass) {
  process.exit(1);
}
