import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Adversarial Challenger M2 Suite: Empirical Verification of public/geo-vectors.bin
 * Evaluates binary structure, header magic, 100% vertex & index arrays, and antimeridian severance.
 */

describe('Adversarial Challenger M2: public/geo-vectors.bin Verification', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const binPath = path.join(projectRoot, 'public', 'geo-vectors.bin');

  it('CHALLENGE-01: verifies asset existence, exact byte size within ~35-45 MB range, and 32-byte header magic', () => {
    expect(fs.existsSync(binPath)).toBe(true);
    const stats = fs.statSync(binPath);
    const sizeMB = stats.size / (1024 * 1024);

    expect(sizeMB).toBeGreaterThanOrEqual(35.0);
    expect(sizeMB).toBeLessThanOrEqual(45.0);

    const buf = fs.readFileSync(binPath);
    expect(buf.length).toBeGreaterThanOrEqual(32);

    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    const vertexCount = buf.readUInt32LE(8);
    const indexCount = buf.readUInt32LE(12);

    expect(magic).toBe(0x47564543); // 'GVEC'
    expect(version).toBe(1);
    expect(vertexCount).toBeGreaterThan(1000000);
    expect(indexCount).toBeGreaterThan(1000000);
    expect(indexCount % 2).toBe(0);

    // Verify 16 reserved zero bytes
    for (let i = 16; i < 32; i += 4) {
      expect(buf.readUInt32LE(i)).toBe(0);
    }

    // Verify byte layout: 32 + vertexCount * 32 + indexCount * 4
    const expectedBytes = 32 + vertexCount * 32 + indexCount * 4;
    expect(buf.length).toBe(expectedBytes);
  });

  it('CHALLENGE-02: parses binary arrays and verifies 100% vertex coordinates on S^2, Mercator, and Dymaxion', () => {
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

    let nanPositions = 0;
    let radiusDeviations = 0;
    let nanTarget2D = 0;
    let outOfBoundsMercator = 0;
    let nanDymaxion2D = 0;
    let outOfBoundsDymaxion = 0;
    let coastCount = 0;
    let riverCount = 0;
    let unexpectedVType = 0;

    let minR = Infinity;
    let maxR = -Infinity;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      const x = positions3D[i * 3];
      const y = positions3D[i * 3 + 1];
      const z = positions3D[i * 3 + 2];

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        nanPositions++;
      } else {
        const r = Math.hypot(x, y, z);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (Math.abs(r - 5.015) > 1e-4) {
          radiusDeviations++;
        }
      }

      const u = target2D[i * 2];
      const v = target2D[i * 2 + 1];
      if (!Number.isFinite(u) || !Number.isFinite(v)) {
        nanTarget2D++;
      } else {
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
        if (Math.abs(u) > Math.PI * 5.0 + 0.01 || Math.abs(v) > 16.0) {
          outOfBoundsMercator++;
        }
      }

      const ud = dymaxion2D[i * 2];
      const vd = dymaxion2D[i * 2 + 1];
      if (!Number.isFinite(ud) || !Number.isFinite(vd)) {
        nanDymaxion2D++;
      } else {
        if (Math.abs(ud) > 50.0 || Math.abs(vd) > 50.0) {
          outOfBoundsDymaxion++;
        }
      }

      const vt = vType[i];
      if (vt === 1.0) coastCount++;
      else if (vt === 0.5) riverCount++;
      else unexpectedVType++;
    }

    expect(nanPositions).toBe(0);
    expect(radiusDeviations).toBe(0);
    expect(minR).toBeCloseTo(5.015, 4);
    expect(maxR).toBeCloseTo(5.015, 4);

    expect(nanTarget2D).toBe(0);
    expect(outOfBoundsMercator).toBe(0);
    expect(minU).toBeGreaterThanOrEqual(-15.8);
    expect(maxU).toBeLessThanOrEqual(15.8);
    expect(minV).toBeGreaterThanOrEqual(-15.8);
    expect(maxV).toBeLessThanOrEqual(15.8);

    expect(nanDymaxion2D).toBe(0);
    expect(outOfBoundsDymaxion).toBe(0);

    expect(unexpectedVType).toBe(0);
    expect(coastCount).toBe(877630);
    expect(riverCount).toBe(253808);
    expect(coastCount + riverCount).toBe(vertexCount);
  });

  it('CHALLENGE-03: exhaustively checks all segments for antimeridian seam severance and Mercator jump bounds', () => {
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

    offset += vertexCount * 4; // skip vType
    const indices = new Uint32Array(buf.buffer, buf.byteOffset + offset, indexCount);

    const segmentCount = indexCount / 2;
    let oobIndices = 0;
    let antimeridianCrossings = 0;
    let lonWrapViolations = 0;
    let mercatorJumpViolations = 0;
    let dymaxionJumpViolations = 0;

    let maxDeltaLon = 0;
    let maxDeltaU = 0;
    let maxDymDist = 0;

    for (let s = 0; s < segmentCount; s++) {
      const idxA = indices[s * 2];
      const idxB = indices[s * 2 + 1];

      if (idxA >= vertexCount || idxB >= vertexCount) {
        oobIndices++;
        continue;
      }

      const xA = positions3D[idxA * 3];
      const zA = positions3D[idxA * 3 + 2];
      const xB = positions3D[idxB * 3];
      const zB = positions3D[idxB * 3 + 2];

      const lonA = Math.atan2(xA, zA) * (180.0 / Math.PI);
      const lonB = Math.atan2(xB, zB) * (180.0 / Math.PI);

      // Rule: No segment connects lon > 170 to lon < -170
      if ((lonA > 170.0 && lonB < -170.0) || (lonB > 170.0 && lonA < -170.0)) {
        antimeridianCrossings++;
      }

      const deltaLon = Math.abs(lonA - lonB);
      if (deltaLon > maxDeltaLon) maxDeltaLon = deltaLon;
      if (deltaLon > 180.0) {
        lonWrapViolations++;
      }

      const uA = target2D[idxA * 2];
      const uB = target2D[idxB * 2];
      const deltaU = Math.abs(uA - uB);
      if (deltaU > maxDeltaU) maxDeltaU = deltaU;
      if (deltaU > 15.0) {
        mercatorJumpViolations++;
      }

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

    expect(oobIndices).toBe(0);
    expect(antimeridianCrossings).toBe(0);
    expect(lonWrapViolations).toBe(0);
    expect(mercatorJumpViolations).toBe(0);
    expect(dymaxionJumpViolations).toBe(0);

    expect(maxDeltaLon).toBeLessThan(5.0); // Actual: 1.3577°
    expect(maxDeltaU).toBeLessThan(1.0);    // Actual: 0.1185
    expect(maxDymDist).toBeLessThanOrEqual(0.85); // Actual: 0.8167
  });
});
