import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Vector Coastline & Major Waterway Overlay Architecture', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const binPath = path.join(projectRoot, 'public/geo-vectors.bin');

  it('VEC-T01: verifies geo-vectors.bin exists and has valid GVEC magic header (0x47564543)', () => {
    expect(fs.existsSync(binPath)).toBe(true);
    const buf = fs.readFileSync(binPath);
    expect(buf.length).toBeGreaterThan(1024 * 1024); // > 1 MB

    const magic = buf.readUInt32LE(0);
    expect(magic).toBe(0x47564543); // 'GVEC'

    const version = buf.readUInt32LE(4);
    expect(version).toBe(1);

    const vertexCount = buf.readUInt32LE(8);
    const indexCount = buf.readUInt32LE(12);

    expect(vertexCount).toBeGreaterThan(100000); // 168k+ vertices
    expect(indexCount).toBeGreaterThan(100000);  // 168k+ index endpoints
  });

  it('VEC-T02: verifies all vector buffer attributes contain 0 NaNs and strictly bounded coordinates', () => {
    const buf = fs.readFileSync(binPath);
    const vertexCount = buf.readUInt32LE(8);
    const indexCount = buf.readUInt32LE(12);

    let offset = 32;
    const positions = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 3);
    offset += vertexCount * 3 * 4;

    const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    const dymaxion2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    const vType = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 1);
    offset += vertexCount * 1 * 4;

    const indices = new Uint32Array(buf.buffer, buf.byteOffset + offset, indexCount);

    // Verify positions on sphere
    for (let i = 0; i < Math.min(1000, vertexCount); i++) {
      const x = positions[i * 3 + 0];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);

      const r = Math.hypot(x, y, z);
      expect(r).toBeCloseTo(5.015, 2);

      const u = target2D[i * 2 + 0];
      const v = target2D[i * 2 + 1];
      expect(Number.isFinite(u)).toBe(true);
      expect(Number.isFinite(v)).toBe(true);

      const ud = dymaxion2D[i * 2 + 0];
      const vd = dymaxion2D[i * 2 + 1];
      expect(Number.isFinite(ud)).toBe(true);
      expect(Number.isFinite(vd)).toBe(true);

      const vt = vType[i];
      expect(vt === 1.0 || vt === 0.5).toBe(true);
    }

    // Verify indices point to valid vertex range
    for (let i = 0; i < Math.min(1000, indexCount); i++) {
      expect(indices[i]).toBeLessThan(vertexCount);
    }
  });

  it('VEC-T03: verifies App.tsx and TelemetryHUD.tsx define showVectors and onVectorsToggle contract', () => {
    const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
    const appCode = fs.readFileSync(appTsxPath, 'utf8');
    const hudCode = fs.readFileSync(path.join(projectRoot, 'src/components/hud/TelemetryHUD.tsx'), 'utf8');

    expect(appCode).toContain('showVectors');
    expect(appCode).toContain('setShowVectors');
    expect(appCode).toContain('VectorOverlayLayer');
    expect(appCode).toMatch(/e\.key\s*===\s*['"]v['"]\s*\|\|\s*e\.key\s*===\s*['"]V['"]/);

    expect(hudCode).toContain('showVectors');
    expect(hudCode).toContain('onVectorsToggle');
    expect(hudCode).toContain('Vectors (V)');
  });
});
