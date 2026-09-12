import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Adversarial Challenger Stage 1 Suite: Empirical Verification of Overture Maps GeoParquet Vectors
 * Validates public/geo-vectors.bin against Gate 1 invariants:
 * - File size in [35.0 MB, 42.0 MB]
 * - Header layout, magic 0x47564543 ('GVEC'), version 1, 16 zero-padded reserved bytes
 * - 1,130,000 vertices with zero NaNs, Infs, or negative zeros
 * - S^2 radius exact precision at 5.015 +- 1e-4
 * - Mercator clipping: |u| <= 16.0, |v| <= 16.0
 * - Antimeridian seam crossing protection (no >170 to <-170, no deltaLon > 180)
 * - Dymaxion discontinuity cuts (segment jump <= 0.85)
 */

describe('Adversarial Challenger: Overture Geo-Vectors Gate 1 Integrity', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const binPath = path.join(projectRoot, 'public', 'geo-vectors.bin');

  it('STAGE1-CHALLENGE-01: validates strict file size budget between 35.0 MB and 42.0 MB', () => {
    expect(fs.existsSync(binPath)).toBe(true);
    const stats = fs.statSync(binPath);
    const sizeBinaryMB = stats.size / (1024 * 1024);
    const sizeDecimalMB = stats.size / 1_000_000;

    expect(sizeBinaryMB).toBeGreaterThanOrEqual(35.0);
    expect(sizeBinaryMB).toBeLessThanOrEqual(42.0);
    expect(sizeDecimalMB).toBeGreaterThanOrEqual(35.0);
    expect(sizeDecimalMB).toBeLessThanOrEqual(42.0);
  });

  it('STAGE1-CHALLENGE-02: verifies 32-byte header specification and exact byte alignment', () => {
    const buf = fs.readFileSync(binPath);
    expect(buf.length).toBeGreaterThanOrEqual(32);

    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    const vertexCount = buf.readUInt32LE(8);
    const indexCount = buf.readUInt32LE(12);

    expect(magic).toBe(0x47564543); // 'GVEC'
    expect(version).toBe(1);
    expect(vertexCount).toBe(1130000);
    expect(indexCount).toBe(1130000);

    for (let i = 16; i < 32; i++) {
      expect(buf.readUInt8(i)).toBe(0);
    }

    const expectedBytes = 32 + vertexCount * 32 + indexCount * 4;
    expect(buf.length).toBe(expectedBytes);
  });

  it('STAGE1-CHALLENGE-03: probes all 1,130,000 vertices for numerical singularities, radius precision, and Mercator clipping', () => {
    const buf = fs.readFileSync(binPath);
    const vertexCount = buf.readUInt32LE(8);

    let offset = 32;
    const positions3D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 3);
    offset += vertexCount * 3 * 4;

    const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    const dymaxion2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    const vType = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount);

    let nanCount = 0;
    let infCount = 0;
    let negZeroCount = 0;
    let radiusDevCount = 0;
    let mercatorOutOfRange = 0;
    let coastCount = 0;
    let riverCount = 0;
    let invalidVType = 0;

    let minR = Infinity;
    let maxR = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      // 3D Positions
      const x = positions3D[i * 3];
      const y = positions3D[i * 3 + 1];
      const z = positions3D[i * 3 + 2];

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) infCount++;
      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) nanCount++;
      if (Object.is(x, -0) || Object.is(y, -0) || Object.is(z, -0)) negZeroCount++;

      const r = Math.hypot(x, y, z);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (Math.abs(r - 5.015) > 1e-4) radiusDevCount++;

      // 2D Mercator
      const u = target2D[i * 2];
      const v = target2D[i * 2 + 1];
      if (!Number.isFinite(u) || !Number.isFinite(v)) infCount++;
      if (Number.isNaN(u) || Number.isNaN(v)) nanCount++;
      if (Object.is(u, -0) || Object.is(v, -0)) negZeroCount++;
      if (Math.abs(u) > 16.0 || Math.abs(v) > 16.0) mercatorOutOfRange++;

      // 2D Dymaxion
      const ud = dymaxion2D[i * 2];
      const vd = dymaxion2D[i * 2 + 1];
      if (!Number.isFinite(ud) || !Number.isFinite(vd)) infCount++;
      if (Number.isNaN(ud) || Number.isNaN(vd)) nanCount++;
      if (Object.is(ud, -0) || Object.is(vd, -0)) negZeroCount++;

      // vType
      const vt = vType[i];
      if (vt === 1.0) coastCount++;
      else if (vt === 0.5) riverCount++;
      else invalidVType++;
    }

    expect(nanCount).toBe(0);
    expect(infCount).toBe(0);
    expect(negZeroCount).toBe(0);
    expect(radiusDevCount).toBe(0);
    expect(minR).toBeCloseTo(5.015, 4);
    expect(maxR).toBeCloseTo(5.015, 4);
    expect(mercatorOutOfRange).toBe(0);
    expect(invalidVType).toBe(0);
    expect(coastCount).toBe(890000);
    expect(riverCount).toBe(240000);
  });

  it('STAGE1-CHALLENGE-04: tests all 565,000 line segments for antimeridian seam crossing and Dymaxion discontinuity cuts', () => {
    const buf = fs.readFileSync(binPath);
    const vertexCount = buf.readUInt32LE(8);
    const indexCount = buf.readUInt32LE(12);

    let offset = 32;
    const positions3D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 3);
    offset += vertexCount * 3 * 4;

    const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    const dymaxion2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    offset += vertexCount * 4; // vType
    const indices = new Uint32Array(buf.buffer, buf.byteOffset + offset, indexCount);

    const segmentCount = indexCount / 2;
    let oobIndices = 0;
    let antimeridianJumpViolations = 0;
    let lonDelta180Violations = 0;
    let mercatorJumpViolations = 0;
    let dymaxionJumpViolations = 0;

    let maxDeltaLon = 0;
    let maxDeltaU = 0;
    let maxDymDist = 0;

    for (let s = 0; s < segmentCount; s++) {
      const iA = indices[s * 2];
      const iB = indices[s * 2 + 1];

      if (iA >= vertexCount || iB >= vertexCount) {
        oobIndices++;
        continue;
      }

      const xA = positions3D[iA * 3];
      const zA = positions3D[iA * 3 + 2];
      const xB = positions3D[iB * 3];
      const zB = positions3D[iB * 3 + 2];

      const lonA = Math.atan2(xA, zA) * (180 / Math.PI);
      const lonB = Math.atan2(xB, zB) * (180 / Math.PI);

      if ((lonA > 170.0 && lonB < -170.0) || (lonB > 170.0 && lonA < -170.0)) {
        antimeridianJumpViolations++;
      }

      const dLon = Math.abs(lonA - lonB);
      if (dLon > maxDeltaLon) maxDeltaLon = dLon;
      if (dLon > 180.0) lonDelta180Violations++;

      const uA = target2D[iA * 2];
      const uB = target2D[iB * 2];
      const dU = Math.abs(uA - uB);
      if (dU > maxDeltaU) maxDeltaU = dU;
      if (dU > 15.0) mercatorJumpViolations++;

      const udA = dymaxion2D[iA * 2];
      const vdA = dymaxion2D[iA * 2 + 1];
      const udB = dymaxion2D[iB * 2];
      const vdB = dymaxion2D[iB * 2 + 1];
      const dymDist = Math.hypot(udA - udB, vdA - vdB);
      if (dymDist > maxDymDist) maxDymDist = dymDist;
      if (dymDist > 0.85) dymaxionJumpViolations++;
    }

    expect(oobIndices).toBe(0);
    expect(antimeridianJumpViolations).toBe(0);
    expect(lonDelta180Violations).toBe(0);
    expect(maxDeltaLon).toBeLessThan(5.0);
    expect(mercatorJumpViolations).toBe(0);
    expect(maxDeltaU).toBeLessThan(1.0);
    expect(dymaxionJumpViolations).toBe(0);
    expect(maxDymDist).toBeLessThanOrEqual(0.85);
  });
});
