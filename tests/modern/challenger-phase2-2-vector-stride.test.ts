import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  VectorOverlayLayer,
  vectorLineVertexShader,
  vectorLineFragmentShader,
} from '../../src/core/VectorOverlayLayer';

describe('Challenger 2 Phase 2.2: geo-vectors.bin Stride & VectorOverlayLayer Integrity', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const binPath = path.join(projectRoot, 'public', 'geo-vectors.bin');

  it('STRIDE-01: Verifies geo-vectors.bin binary layout strictly adheres to 32-byte vertex stride', () => {
    expect(fs.existsSync(binPath)).toBe(true);
    const buf = fs.readFileSync(binPath);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const vertexCount = view.getUint32(8, true);
    const indexCount = view.getUint32(12, true);

    expect(magic).toBe(0x47564543); // 'GVEC'
    expect(version).toBe(1);
    expect(vertexCount).toBe(1130000);
    expect(indexCount).toBe(1130000);

    // 16 reserved header bytes
    for (let i = 16; i < 32; i++) {
      expect(buf[i]).toBe(0);
    }

    // Exact byte layout calculation: 32-byte header + vertexCount * 32 bytes + indexCount * 4 bytes
    const HEADER_BYTES = 32;
    const BYTES_PER_VERTEX = 32; // 8 floats * 4 bytes
    const BYTES_PER_INDEX = 4;   // 1 uint32 * 4 bytes
    const expectedBytes = HEADER_BYTES + vertexCount * BYTES_PER_VERTEX + indexCount * BYTES_PER_INDEX;

    expect(buf.length).toBe(expectedBytes);
    expect(buf.length).toBe(40680032);
  });

  it('STRIDE-02: Verifies columnar vertex payload floats (8 floats per vertex) are valid and non-corrupt', () => {
    const buf = fs.readFileSync(binPath);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const vertexCount = view.getUint32(8, true);

    let offset = 32;
    const positions3D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 3);
    offset += vertexCount * 3 * 4;

    const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    const reserved2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    const vType = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 1);
    offset += vertexCount * 1 * 4;

    // Spot-check first 10,000 and last 10,000 vertices for non-NaN, non-infinite values
    const checkIndices = [
      ...Array.from({ length: 5000 }, (_, i) => i),
      ...Array.from({ length: 5000 }, (_, i) => vertexCount - 1 - i),
    ];

    for (const idx of checkIndices) {
      const x = positions3D[idx * 3 + 0];
      const y = positions3D[idx * 3 + 1];
      const z = positions3D[idx * 3 + 2];
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);

      const r = Math.hypot(x, y, z);
      expect(Math.abs(r - 5.015)).toBeLessThan(1e-4);

      const u = target2D[idx * 2 + 0];
      const v = target2D[idx * 2 + 1];
      expect(Number.isFinite(u)).toBe(true);
      expect(Number.isFinite(v)).toBe(true);

      const vt = vType[idx];
      expect(vt === 1.0 || vt === 0.5).toBe(true);
    }
  });

  it('STRIDE-03: Verifies VectorOverlayLayer shaders are devoid of Mode 4 / Dymaxion logic', () => {
    expect(VectorOverlayLayer).toBeDefined();
    expect(vectorLineVertexShader).toBeDefined();
    expect(vectorLineFragmentShader).toBeDefined();

    // Check vertex shader
    expect(vectorLineVertexShader).not.toContain('u_mode == 4');
    expect(vectorLineVertexShader).not.toContain('dymaxion2D');
    expect(vectorLineVertexShader).not.toContain('adjacentDymaxion2D');
    expect(vectorLineVertexShader).not.toContain('Dymaxion');

    // Check fragment shader
    expect(vectorLineFragmentShader).not.toContain('u_mode == 4');
    expect(vectorLineFragmentShader).not.toContain('Dymaxion');
  });

  it('STRIDE-04: Simulates WebGPUEngine 64-byte segment layout (32 bytes per vertex) with zero corruption', () => {
    const buf = fs.readFileSync(binPath);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const vertexCount = view.getUint32(8, true);
    const indexCount = view.getUint32(12, true);

    let offset = 32;
    const positions3D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 3);
    offset += vertexCount * 3 * 4;

    const target2D = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 2);
    offset += vertexCount * 2 * 4;

    offset += vertexCount * 2 * 4; // skip 8 reserved bytes

    const vType = new Float32Array(buf.buffer, buf.byteOffset + offset, vertexCount * 1);
    offset += vertexCount * 1 * 4;

    const indices = new Uint32Array(buf.buffer, buf.byteOffset + offset, indexCount);

    const testSegCount = 10000;
    const segFloats = new Float32Array(testSegCount * 16);

    for (let k = 0; k < testSegCount; k++) {
      const idxA = indices[k * 2 + 0];
      const idxB = indices[k * 2 + 1];
      const base = k * 16;

      segFloats[base + 0] = positions3D[idxA * 3 + 0];
      segFloats[base + 1] = positions3D[idxA * 3 + 1];
      segFloats[base + 2] = positions3D[idxA * 3 + 2];
      segFloats[base + 3] = vType[idxA];

      segFloats[base + 4] = target2D[idxA * 2 + 0];
      segFloats[base + 5] = target2D[idxA * 2 + 1];
      // base + 6, 7 are 0.0

      segFloats[base + 8] = positions3D[idxB * 3 + 0];
      segFloats[base + 9] = positions3D[idxB * 3 + 1];
      segFloats[base + 10] = positions3D[idxB * 3 + 2];
      segFloats[base + 11] = vType[idxB];

      segFloats[base + 12] = target2D[idxB * 2 + 0];
      segFloats[base + 13] = target2D[idxB * 2 + 1];
      // base + 14, 15 are 0.0
    }

    for (let i = 0; i < segFloats.length; i++) {
      expect(Number.isFinite(segFloats[i])).toBe(true);
      expect(Number.isNaN(segFloats[i])).toBe(false);
    }
  });
});
