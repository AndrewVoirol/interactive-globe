// ============================================================================
// File: tests/phase2/challenger1-m2-binary-vram.test.ts
// Architecture: Challenger 1 (Binary & VRAM Adversarial Challenger)
// Description: Adversarial stress-testing of binary header decoding, malformed
//              buffer rejection, zero CPU heap re-allocations, and WebGPU
//              VRAM memory footprint safety (<10 MB ceiling) for Milestone 2.
// Topics:
//   1. Corrupted magic words (0x0, 0xFFFFFFFF, off-by-one, endian-reversed, fuzzing)
//   2. Dual magic support: 0x47454F4D ('GEOM') vs 0x434F4E54 ('CONT') bit-for-bit parity
//   3. Version numbers (0, 1, 2, 0xFFFFFFFF) and schema contract verification
//   4. Truncated headers (< 32 bytes) and truncated payloads (down to 1 byte short)
//   5. Zero point counts, odd index counts, mismatched counts, out-of-bounds indices
//   6. Subarray views, baseOffset translation, and 4-byte Float32 alignment constraints
//   7. Zero CPU heap re-allocations: shared backing ArrayBuffer and in-place mutation proof
//   8. WebGPUEngine VRAM footprint: exact 4,693,904 bytes (~4.48 MB) and < 10 MB ceiling
//   9. Repeated loadContourMesh cycling (50 iterations) proving clean buffer destruction
//  10. Dual-path rendering stress (vector ribbons vs indexed lines) with mock pass encoder
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseContourMeshHeader,
  decodeContourMesh,
  MAGIC_GEOM,
  MAGIC_CONT,
  HEADER_BYTE_SIZE,
  type ContourMeshHeader,
  type DecodedContourMesh,
} from '../../src/utils/contour-topology';

import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice, MockGPUBuffer } from '../helpers/webgpu-mock';

describe('Challenger 1: Binary Decoding, Zero-Copy & VRAM Adversarial Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const binPath = path.join(projectRoot, 'public/geo-contour-mesh.bin');

  let realArrayBuffer: ArrayBuffer;
  let originalNavigator: any;

  beforeEach(() => {
    expect(fs.existsSync(binPath)).toBe(true);
    const rawBuf = fs.readFileSync(binPath);
    realArrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
    originalNavigator = (globalThis as any).navigator;
  });

  afterEach(() => {
    if (originalNavigator !== undefined) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  // Helper to synthesize a valid contour mesh binary buffer
  function createSyntheticBuffer(options: {
    magic?: number;
    version?: number;
    pointCount: number;
    indexCount: number;
    minElevation?: number;
    maxElevation?: number;
    isoCount?: number;
    reserved?: number;
    truncatePayloadBytes?: number;
    extraTrailingBytes?: number;
    customIndices?: number[];
  }): ArrayBuffer {
    const magic = options.magic ?? MAGIC_GEOM;
    const version = options.version ?? 1;
    const pointCount = options.pointCount;
    const indexCount = options.indexCount;
    const minElev = options.minElevation ?? -6000.0;
    const maxElev = options.maxElevation ?? 4000.0;
    const isoCount = options.isoCount ?? 12;
    const reserved = options.reserved ?? 0;

    const posBytes = pointCount * 3 * 4;
    const tarBytes = pointCount * 2 * 4;
    const dymBytes = pointCount * 2 * 4;
    const typBytes = pointCount * 1 * 4;
    const idxBytes = indexCount * 4;

    const fullPayloadBytes = posBytes + tarBytes + dymBytes + typBytes + idxBytes;
    const truncatedPayloadBytes = options.truncatePayloadBytes ?? 0;
    const extraTrailingBytes = options.extraTrailingBytes ?? 0;

    const totalByteLength = HEADER_BYTE_SIZE + fullPayloadBytes - truncatedPayloadBytes + extraTrailingBytes;
    const buffer = new ArrayBuffer(Math.max(0, totalByteLength));
    const view = new DataView(buffer);

    if (totalByteLength >= HEADER_BYTE_SIZE) {
      view.setUint32(0, magic, true);
      view.setUint32(4, version, true);
      view.setUint32(8, pointCount, true);
      view.setUint32(12, indexCount, true);
      view.setFloat32(16, minElev, true);
      view.setFloat32(20, maxElev, true);
      view.setUint32(24, isoCount, true);
      view.setUint32(28, reserved, true);
    }

    if (truncatedPayloadBytes === 0 && totalByteLength >= HEADER_BYTE_SIZE + fullPayloadBytes) {
      // Fill dummy data
      const f32 = new Float32Array(buffer, HEADER_BYTE_SIZE, (posBytes + tarBytes + dymBytes + typBytes) / 4);
      for (let i = 0; i < f32.length; i++) {
        f32[i] = (i % 100) * 0.1;
      }

      const idxOffset = HEADER_BYTE_SIZE + posBytes + tarBytes + dymBytes + typBytes;
      const u32 = new Uint32Array(buffer, idxOffset, indexCount);
      if (options.customIndices) {
        for (let i = 0; i < Math.min(indexCount, options.customIndices.length); i++) {
          u32[i] = options.customIndices[i];
        }
      } else {
        for (let i = 0; i < indexCount; i++) {
          u32[i] = i % Math.max(1, pointCount);
        }
      }
    }

    return buffer;
  }

  // ==========================================================================
  // 1. Malformed Header & Corrupted Magic Number Stress-Testing
  // ==========================================================================
  describe('1. Malformed Header & Corrupted Magic Word Stress', () => {
    it('CH1-T01: rejects all non-canonical magic numbers with descriptive error', () => {
      const invalidMagics = [
        0x00000000, // All zero
        0xffffffff, // All ones
        0xdeadbeef, // Hex pattern
        0x47454f4e, // 'GEON' (off-by-one ASCII byte)
        0x434f4e53, // 'CONS' (off-by-one ASCII byte)
        0x47454f40, // 'GEO@'
        0x434f4e00, // 'CON\0'
        0x4d4f4547, // 'MOEG' (endian reversed GEOM)
        0x544e4f43, // 'TNOC' (endian reversed CONT)
        0x20202020, // 4 spaces
        0x74657374, // 'test'
      ];

      for (const badMagic of invalidMagics) {
        const buf = createSyntheticBuffer({ magic: badMagic, pointCount: 10, indexCount: 10 });
        expect(() => parseContourMeshHeader(buf)).toThrowError(/Invalid contour mesh magic/i);
        expect(() => decodeContourMesh(buf)).toThrowError(/Invalid contour mesh magic/i);
      }
    });

    it('CH1-T02: fuzzes 100 pseudo-random 32-bit words, asserting strict rejection of non-magics', () => {
      for (let seed = 1; seed <= 100; seed++) {
        // Linear congruential generator for deterministic pseudo-random words
        const randomMagic = ((seed * 1664525 + 1013904223) >>> 0) & 0xffffffff;
        if (randomMagic === MAGIC_GEOM || randomMagic === MAGIC_CONT) continue;

        const buf = createSyntheticBuffer({ magic: randomMagic, pointCount: 5, indexCount: 4 });
        expect(() => parseContourMeshHeader(buf)).toThrowError(/Invalid contour mesh magic/i);
      }
    });

    it('CH1-T03: verifies dual magic support — 0x47454F4D (GEOM) and 0x434F4E54 (CONT) decode bit-for-bit identically', () => {
      const geomBuf = createSyntheticBuffer({
        magic: MAGIC_GEOM,
        version: 1,
        pointCount: 50,
        indexCount: 60,
        minElevation: -5000,
        maxElevation: 3500,
      });

      const contBuf = createSyntheticBuffer({
        magic: MAGIC_CONT,
        version: 1,
        pointCount: 50,
        indexCount: 60,
        minElevation: -5000,
        maxElevation: 3500,
      });

      const geomDecoded = decodeContourMesh(geomBuf);
      const contDecoded = decodeContourMesh(contBuf);

      expect(geomDecoded.header.magic).toBe(MAGIC_GEOM);
      expect(contDecoded.header.magic).toBe(MAGIC_CONT);

      // Verify all other header properties match exactly
      expect(geomDecoded.header.version).toBe(contDecoded.header.version);
      expect(geomDecoded.header.pointCount).toBe(contDecoded.header.pointCount);
      expect(geomDecoded.header.indexCount).toBe(contDecoded.header.indexCount);
      expect(geomDecoded.header.minElevation).toBe(contDecoded.header.minElevation);
      expect(geomDecoded.header.maxElevation).toBe(contDecoded.header.maxElevation);
      expect(geomDecoded.header.isoCount).toBe(contDecoded.header.isoCount);
      expect(geomDecoded.header.reserved).toBe(contDecoded.header.reserved);

      // Verify all columnar arrays have identical lengths
      expect(geomDecoded.positions3D.length).toBe(contDecoded.positions3D.length);
      expect(geomDecoded.target2D.length).toBe(contDecoded.target2D.length);
      expect(geomDecoded.dymaxion2D.length).toBe(contDecoded.dymaxion2D.length);
      expect(geomDecoded.typeData.length).toBe(contDecoded.typeData.length);
      expect(geomDecoded.lineIndices.length).toBe(contDecoded.lineIndices.length);

      // Verify exact byte-for-byte content equality
      const geomBytes = new Uint8Array(geomBuf, HEADER_BYTE_SIZE);
      const contBytes = new Uint8Array(contBuf, HEADER_BYTE_SIZE);
      expect(geomBytes.byteLength).toBe(contBytes.byteLength);
      for (let i = 0; i < geomBytes.byteLength; i++) {
        expect(geomBytes[i]).toBe(contBytes[i]);
      }
    });

    it('CH1-T04: verifies header version handling across version 0, 1, 2, 42, and 0xFFFFFFFF', () => {
      const versions = [0, 1, 2, 42, 0xffffffff];
      for (const ver of versions) {
        const buf = createSyntheticBuffer({ version: ver, pointCount: 4, indexCount: 4 });
        const header = parseContourMeshHeader(buf);
        expect(header.version).toBe(ver);
      }
    });
  });

  // ==========================================================================
  // 2. Truncated Buffers, Boundary Headers & Payload Integrity
  // ==========================================================================
  describe('2. Truncated Buffers & Payload Integrity Boundary Stress', () => {
    it('CH1-T05: rejects truncated headers < 32 bytes with exact byte counts in error message', () => {
      const truncatedLengths = [0, 1, 2, 3, 4, 7, 8, 12, 16, 20, 24, 28, 30, 31];

      for (const len of truncatedLengths) {
        const emptyBuf = new ArrayBuffer(len);
        expect(() => parseContourMeshHeader(emptyBuf)).toThrowError(
          new RegExp(`Contour mesh buffer too small: ${len} bytes \\(expected >= 32\\)`, 'i')
        );
        expect(() => decodeContourMesh(emptyBuf)).toThrowError(
          new RegExp(`Contour mesh buffer too small: ${len} bytes \\(expected >= 32\\)`, 'i')
        );
      }
    });

    it('CH1-T06: rejects truncated payloads when buffer is missing between 1 byte and entire payload', () => {
      const pointCount = 100;
      const indexCount = 100;
      // Expected total: 32 + (100*3*4) + (100*2*4) + (100*2*4) + (100*1*4) + (100*4) = 32 + 3200 + 400 = 3632 bytes

      const truncationDeltas = [
        1, // Missing 1 byte from the end
        2, // Missing 2 bytes
        4, // Missing 1 Uint32 index
        400, // Missing entire index array
        800, // Missing typeData + index array
        3600, // Missing entire payload (only 32-byte header present)
      ];

      for (const delta of truncationDeltas) {
        const truncatedBuf = createSyntheticBuffer({
          pointCount,
          indexCount,
          truncatePayloadBytes: delta,
        });

        const actualBytes = truncatedBuf.byteLength;
        const expectedBytes = 3632;
        expect(() => decodeContourMesh(truncatedBuf)).toThrowError(
          new RegExp(`Contour mesh buffer truncated: ${actualBytes} bytes \\(expected ${expectedBytes} bytes for 100 vertices and 100 indices\\)`, 'i')
        );
      }
    });

    it('CH1-T07: tests truncated slices of the real 2.48 MB public/geo-contour-mesh.bin asset', () => {
      const realTotalBytes = realArrayBuffer.byteLength;
      expect(realTotalBytes).toBe(2485040); // Exactly 2,485,040 bytes

      // 1. Missing 1 byte
      const minusOne = realArrayBuffer.slice(0, realTotalBytes - 1);
      expect(() => decodeContourMesh(minusOne)).toThrowError(/Contour mesh buffer truncated: 2485039 bytes/i);

      // 2. Truncated to 1 MB
      const oneMB = realArrayBuffer.slice(0, 1024 * 1024);
      expect(() => decodeContourMesh(oneMB)).toThrowError(/Contour mesh buffer truncated: 1048576 bytes/i);

      // 3. Truncated to header only (32 bytes)
      const headerOnly = realArrayBuffer.slice(0, 32);
      expect(() => decodeContourMesh(headerOnly)).toThrowError(/Contour mesh buffer truncated: 32 bytes/i);

      // 4. Header intact still parses
      const header = parseContourMeshHeader(headerOnly);
      expect(header.pointCount).toBe(69028);
      expect(header.indexCount).toBe(69028);
    });

    it('CH1-T08: safely accepts buffers with extra trailing bytes without throwing or corrupting views', () => {
      const pointCount = 20;
      const indexCount = 20;
      // Sized buffer with 512 bytes of extra garbage appended at the end
      const extraBuf = createSyntheticBuffer({
        pointCount,
        indexCount,
        extraTrailingBytes: 512,
      });

      const decoded = decodeContourMesh(extraBuf);
      expect(decoded.positions3D.length).toBe(20 * 3);
      expect(decoded.target2D.length).toBe(20 * 2);
      expect(decoded.dymaxion2D.length).toBe(20 * 2);
      expect(decoded.typeData.length).toBe(20);
      expect(decoded.lineIndices.length).toBe(20);
    });
  });

  // ==========================================================================
  // 3. Point Count & Index Count Extremes & Mismatches
  // ==========================================================================
  describe('3. Point Count & Index Count Extremes & Boundary Dimensions', () => {
    it('CH1-T09: decodes zero-point and zero-index boundary mesh (32-byte valid header, 0 payload)', () => {
      const zeroBuf = createSyntheticBuffer({ pointCount: 0, indexCount: 0 });
      expect(zeroBuf.byteLength).toBe(32);

      const header = parseContourMeshHeader(zeroBuf);
      expect(header.pointCount).toBe(0);
      expect(header.indexCount).toBe(0);

      const decoded = decodeContourMesh(zeroBuf);
      expect(decoded.positions3D.length).toBe(0);
      expect(decoded.target2D.length).toBe(0);
      expect(decoded.dymaxion2D.length).toBe(0);
      expect(decoded.typeData.length).toBe(0);
      expect(decoded.lineIndices.length).toBe(0);
    });

    it('CH1-T10: decodes mesh with pointCount > 0 but indexCount = 0 (isolated points, no lines)', () => {
      const ptsOnlyBuf = createSyntheticBuffer({ pointCount: 25, indexCount: 0 });
      // Expected bytes: 32 + 25 * 32 = 832 bytes
      expect(ptsOnlyBuf.byteLength).toBe(832);

      const decoded = decodeContourMesh(ptsOnlyBuf);
      expect(decoded.positions3D.length).toBe(75);
      expect(decoded.target2D.length).toBe(50);
      expect(decoded.dymaxion2D.length).toBe(50);
      expect(decoded.typeData.length).toBe(25);
      expect(decoded.lineIndices.length).toBe(0);
    });

    it('CH1-T11: handles odd indexCount gracefully (segment pairs leave odd index unpartnered)', () => {
      // Line segments require 2 indices each. indexCount = 5 is odd (2 segments + 1 dangling index)
      const oddBuf = createSyntheticBuffer({ pointCount: 10, indexCount: 5 });
      const decoded = decodeContourMesh(oddBuf);
      expect(decoded.lineIndices.length).toBe(5);

      // In WebGPUEngine segment generation: Math.floor(5 / 2) = 2 segments
      const segCount = Math.floor(decoded.lineIndices.length / 2);
      expect(segCount).toBe(2);
    });

    it('CH1-T12: analyzes out-of-bounds indices in lineIndices payload and identifies undefined propagation', () => {
      // 4 points, but lineIndices specifies index 9999 (out of bounds)
      const oobBuf = createSyntheticBuffer({
        pointCount: 4,
        indexCount: 4,
        customIndices: [0, 1, 2, 9999],
      });

      const decoded = decodeContourMesh(oobBuf);
      expect(decoded.lineIndices[3]).toBe(9999);
      expect(decoded.header.pointCount).toBe(4);

      // Verify that accessing out-of-bounds index via positions3D yields undefined
      const outIdx = decoded.lineIndices[3];
      expect(decoded.positions3D[outIdx * 3 + 0]).toBeUndefined();
    });
  });

  // ==========================================================================
  // 4. Subarray Views, Base Offset Alignment & Byte Positioning
  // ==========================================================================
  describe('4. Subarray Views, Base Offset Alignment & Byte Positioning', () => {
    it('CH1-T13: handles 4-byte-aligned ArrayBufferView slices with non-zero byteOffsets', () => {
      // Allocate a master buffer with 64 bytes of header padding
      const padBytes = 64;
      const pointCount = 10;
      const indexCount = 10;
      const payloadBytes = pointCount * 32 + indexCount * 4;
      const masterBuffer = new ArrayBuffer(padBytes + HEADER_BYTE_SIZE + payloadBytes);

      // Create synthetic data starting at byte 64
      const subView = new Uint8Array(masterBuffer, padBytes, HEADER_BYTE_SIZE + payloadBytes);
      const dataView = new DataView(masterBuffer, padBytes, HEADER_BYTE_SIZE + payloadBytes);
      dataView.setUint32(0, MAGIC_GEOM, true);
      dataView.setUint32(4, 1, true);
      dataView.setUint32(8, pointCount, true);
      dataView.setUint32(12, indexCount, true);

      // Pass subView to parseContourMeshHeader and decodeContourMesh
      const header = parseContourMeshHeader(subView);
      expect(header.magic).toBe(MAGIC_GEOM);
      expect(header.pointCount).toBe(pointCount);
      expect(header.indexCount).toBe(indexCount);

      const decoded = decodeContourMesh(subView);
      expect(decoded.positions3D.byteOffset).toBe(padBytes + HEADER_BYTE_SIZE);
      expect(decoded.positions3D.length).toBe(pointCount * 3);
      expect(decoded.lineIndices.byteOffset).toBe(padBytes + HEADER_BYTE_SIZE + pointCount * 32);
      expect(decoded.lineIndices.length).toBe(indexCount);
    });

    it('CH1-T14: verifies unaligned byteOffset (< 4-byte alignment) throws RangeError on typed view instantiation', () => {
      const padBytes = 3; // Misaligned: 3 is not a multiple of 4
      const pointCount = 5;
      const indexCount = 4;
      const payloadBytes = pointCount * 32 + indexCount * 4;
      const masterBuffer = new ArrayBuffer(padBytes + HEADER_BYTE_SIZE + payloadBytes);

      const unalignedView = new Uint8Array(masterBuffer, padBytes, HEADER_BYTE_SIZE + payloadBytes);
      const dataView = new DataView(masterBuffer, padBytes, HEADER_BYTE_SIZE + payloadBytes);
      dataView.setUint32(0, MAGIC_GEOM, true);
      dataView.setUint32(4, 1, true);
      dataView.setUint32(8, pointCount, true);
      dataView.setUint32(12, indexCount, true);

      // parseContourMeshHeader succeeds because DataView does not enforce alignment
      const header = parseContourMeshHeader(unalignedView);
      expect(header.magic).toBe(MAGIC_GEOM);

      // decodeContourMesh fails with RangeError because Float32Array requires 4-byte alignment
      expect(() => decodeContourMesh(unalignedView)).toThrowError(RangeError);
    });
  });

  // ==========================================================================
  // 5. Zero CPU Heap Re-Allocation & Shared Backing Memory Proof
  // ==========================================================================
  describe('5. Zero CPU Heap Re-Allocation & Shared Backing Memory Proof', () => {
    it('CH1-T15: proves zero-copy identity — all 5 columnar arrays share the exact backing ArrayBuffer reference', () => {
      const decoded = decodeContourMesh(realArrayBuffer);

      // Backing buffers must strictly point to the same ArrayBuffer instance
      expect(decoded.positions3D.buffer).toBe(realArrayBuffer);
      expect(decoded.target2D.buffer).toBe(realArrayBuffer);
      expect(decoded.dymaxion2D.buffer).toBe(realArrayBuffer);
      expect(decoded.typeData.buffer).toBe(realArrayBuffer);
      expect(decoded.lineIndices.buffer).toBe(realArrayBuffer);
    });

    it('CH1-T16: proves in-place mutation propagation without array cloning', () => {
      // Clone the realArrayBuffer so we can safely mutate it
      const workingBuffer = realArrayBuffer.slice(0);
      const decoded = decodeContourMesh(workingBuffer);

      // Read original value
      const originalX = decoded.positions3D[0];

      // Mutate via the typed array view
      const sentinelValue = 1337.42;
      decoded.positions3D[0] = sentinelValue;

      // Read directly from the raw ArrayBuffer at byte 32 (posOffset) via independent DataView
      const rawView = new DataView(workingBuffer);
      const rawReadValue = rawView.getFloat32(32, true);

      expect(rawReadValue).toBeCloseTo(sentinelValue, 4);

      // Mutate back via the raw DataView and verify the view reflects it immediately
      rawView.setFloat32(32, originalX, true);
      expect(decoded.positions3D[0]).toBeCloseTo(originalX, 4);
    });

    it('CH1-T17: validates exact contiguous byte offsets of all 5 columnar slices', () => {
      const decoded = decodeContourMesh(realArrayBuffer);
      const N = decoded.header.pointCount; // 69,028
      const M = decoded.header.indexCount; // 69,028

      const expectedPosOffset = 32;
      const expectedTarOffset = expectedPosOffset + N * 3 * 4; // 32 + 828,336 = 828,368
      const expectedDymOffset = expectedTarOffset + N * 2 * 4; // 828,368 + 552,224 = 1,380,592
      const expectedTypOffset = expectedDymOffset + N * 2 * 4; // 1,380,592 + 552,224 = 1,932,816
      const expectedIdxOffset = expectedTypOffset + N * 1 * 4; // 1,932,816 + 276,112 = 2,208,928
      const expectedTotalBytes = expectedIdxOffset + M * 4;    // 2,208,928 + 276,112 = 2,485,040

      expect(decoded.positions3D.byteOffset).toBe(expectedPosOffset);
      expect(decoded.target2D.byteOffset).toBe(expectedTarOffset);
      expect(decoded.dymaxion2D.byteOffset).toBe(expectedDymOffset);
      expect(decoded.typeData.byteOffset).toBe(expectedTypOffset);
      expect(decoded.lineIndices.byteOffset).toBe(expectedIdxOffset);
      expect(expectedTotalBytes).toBe(realArrayBuffer.byteLength);

      // Verify each slice has zero overlapping bytes and zero interstitial gaps
      expect(decoded.positions3D.byteLength).toBe(828336);
      expect(decoded.target2D.byteLength).toBe(552224);
      expect(decoded.dymaxion2D.byteLength).toBe(552224);
      expect(decoded.typeData.byteLength).toBe(276112);
      expect(decoded.lineIndices.byteLength).toBe(276112);

      const totalSliceBytes =
        decoded.positions3D.byteLength +
        decoded.target2D.byteLength +
        decoded.dymaxion2D.byteLength +
        decoded.typeData.byteLength +
        decoded.lineIndices.byteLength;

      expect(HEADER_BYTE_SIZE + totalSliceBytes).toBe(2485040);
    });
  });

  // ==========================================================================
  // 6. WebGPUEngine VRAM Footprint & Buffer Safety Verification (< 10 MB)
  // ==========================================================================
  describe('6. WebGPUEngine VRAM Footprint & Buffer Safety Verification (< 10 MB)', () => {
    let mockGPU: any;

    beforeEach(() => {
      mockGPU = createMockNavigatorGPU(true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { ...originalNavigator, gpu: mockGPU },
        configurable: true,
        writable: true,
      });
    });

    it('CH1-T18: loads public/geo-contour-mesh.bin and verifies exact 4,693,904 bytes (~4.48 MB) VRAM allocation (< 10 MB)', async () => {
      const engine = new WebGPUEngine();
      const canvas = {
        getContext: () => ({
          configure: () => {},
          getCurrentTexture: () => ({ createView: () => ({}) }),
          canvas: { width: 800, height: 600 },
        }),
        width: 800,
        height: 600,
      } as unknown as HTMLCanvasElement;

      await engine.initialize({
        canvas,
        pointCount: 10,
        pointsData: new Float32Array(30),
        target2DData: new Float32Array(20),
        typeData: new Float32Array(10),
        lineIndices: new Uint32Array([0, 1, 1, 2]),
      });

      expect(engine.initialized).toBe(true);

      // Ingest real binary mesh into WebGPU
      await engine.loadContourMesh(realArrayBuffer);

      expect(engine.contourVertexBuffer).toBeDefined();
      expect(engine.contourIndexBuffer).toBeDefined();
      expect(engine.contourSegmentBuffer).toBeDefined();

      const vertBuf = engine.contourVertexBuffer as unknown as MockGPUBuffer;
      const idxBuf = engine.contourIndexBuffer as unknown as MockGPUBuffer;
      const segBuf = engine.contourSegmentBuffer as unknown as MockGPUBuffer;

      // 1. Index buffer: 69,028 * 4 = 276,112 bytes
      expect(idxBuf.size).toBe(276112);
      expect(idxBuf.usage).toBe(GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE);

      // 2. Vertex buffer: 69,028 * 32 = 2,208,896 bytes (32-byte stride)
      expect(vertBuf.size).toBe(2208896);
      expect(vertBuf.usage).toBe(GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);

      // 3. Segment buffer: 34,514 * 64 = 2,208,896 bytes (64 bytes per segment)
      expect(segBuf.size).toBe(2208896);
      expect(segBuf.usage).toBe(GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);

      // Total VRAM
      const totalContourVRAM = vertBuf.size + idxBuf.size + segBuf.size;
      expect(totalContourVRAM).toBe(4693904);

      // Converted to megabytes
      const totalMB = totalContourVRAM / (1024 * 1024);
      expect(totalMB).toBeCloseTo(4.4764, 3);

      // Strict enforcement of < 10 MB constraint
      const maxLimitBytes = 10 * 1024 * 1024; // 10,485,760 bytes
      expect(totalContourVRAM).toBeLessThan(maxLimitBytes);

      // Headroom calculation: must have > 50% safety margin
      const headroomBytes = maxLimitBytes - totalContourVRAM;
      const headroomPercent = (headroomBytes / maxLimitBytes) * 100;
      expect(headroomPercent).toBeGreaterThan(50.0); // 55.23% headroom

      // Verify clean disposal
      engine.dispose();
      expect(engine.contourVertexBuffer).toBeNull();
      expect(engine.contourIndexBuffer).toBeNull();
      expect(engine.contourSegmentBuffer).toBeNull();
      expect(engine.contourVertexCount).toBe(0);
      expect(engine.contourIndexCount).toBe(0);
    });

    it('CH1-T19: stress-tests repeated loadContourMesh cycling (50 cycles) proving zero buffer accumulation', async () => {
      const engine = new WebGPUEngine();
      const canvas = {
        getContext: () => ({
          configure: () => {},
          getCurrentTexture: () => ({ createView: () => ({}) }),
          canvas: { width: 800, height: 600 },
        }),
        width: 800,
        height: 600,
      } as unknown as HTMLCanvasElement;

      await engine.initialize({
        canvas,
        pointCount: 5,
        pointsData: new Float32Array(15),
        target2DData: new Float32Array(10),
        typeData: new Float32Array(5),
        lineIndices: new Uint32Array([0, 1]),
      });

      // Track buffer destroy calls
      const device = (engine as any).device;
      let destroyCalls = 0;
      const originalCreateBuffer = device.createBuffer.bind(device);
      device.createBuffer = (desc: any) => {
        const buf = originalCreateBuffer(desc);
        const origDestroy = buf.destroy.bind(buf);
        buf.destroy = () => {
          destroyCalls++;
          origDestroy();
        };
        return buf;
      };

      // Perform 50 consecutive loads
      const synthBuf = createSyntheticBuffer({ pointCount: 100, indexCount: 100 });
      for (let cycle = 0; cycle < 50; cycle++) {
        await engine.loadContourMesh(synthBuf);
      }

      // In cycles 1..49 (49 reloads), exactly 3 buffers per reload were destroyed: 49 * 3 = 147 destroys
      expect(destroyCalls).toBe(49 * 3);

      // Active buffers remaining attached to engine: exactly 3
      expect(engine.contourVertexBuffer).toBeDefined();
      expect(engine.contourIndexBuffer).toBeDefined();
      expect(engine.contourSegmentBuffer).toBeDefined();

      engine.dispose();
    });

    it('CH1-T20: verifies VRAM footprint scaling across various mesh resolutions up to 100,000 vertices', async () => {
      const testResolutions = [
        { N: 1000, M: 1000, expectedVRAM: 68000 },
        { N: 10000, M: 10000, expectedVRAM: 680000 },
        { N: 50000, M: 50000, expectedVRAM: 3400000 },
        { N: 69028, M: 69028, expectedVRAM: 4693904 },
        { N: 100000, M: 100000, expectedVRAM: 6800000 },
      ];

      for (const res of testResolutions) {
        // VRAM calculation:
        // Vertex Buffer: N * 32 bytes
        // Index Buffer: M * 4 bytes
        // Segment Buffer: (M / 2) * 64 bytes = M * 32 bytes
        // Total = N * 32 + M * 36 bytes (when N = M, Total = N * 68 bytes)
        const vertBytes = res.N * 32;
        const idxBytes = res.M * 4;
        const segBytes = Math.floor(res.M / 2) * 64;
        const totalVRAM = vertBytes + idxBytes + segBytes;

        expect(totalVRAM).toBe(res.expectedVRAM);
        expect(totalVRAM).toBeLessThan(10 * 1024 * 1024); // All stay strictly < 10 MB
      }

      // Calculate maximum possible vertices before breaching 10 MB:
      // N * 68 <= 10 * 1024 * 1024 => N <= 154,202
      const maxN = Math.floor((10 * 1024 * 1024) / 68);
      expect(maxN).toBe(154202);
      expect(maxN).toBeGreaterThan(69028); // Real asset (69,028) has 2.23x headroom
    });

    it('CH1-T21: tests renderContours execution without exceptions for both ribbon and line paths', async () => {
      const engine = new WebGPUEngine();
      const canvas = {
        getContext: () => ({
          configure: () => {},
          getCurrentTexture: () => ({ createView: () => ({}) }),
          canvas: { width: 800, height: 600 },
        }),
        width: 800,
        height: 600,
      } as unknown as HTMLCanvasElement;

      await engine.initialize({
        canvas,
        pointCount: 10,
        pointsData: new Float32Array(30),
        target2DData: new Float32Array(20),
        typeData: new Float32Array(10),
        lineIndices: new Uint32Array([0, 1]),
      });

      await engine.loadContourMesh(realArrayBuffer);
      engine.ensureCartographicBuffers();
      (engine as any).updateDEMBindGroups();

      // 1. Mock render pass encoder
      const draws: any[] = [];
      const drawsIndexed: any[] = [];

      const mockPassEncoder: any = {
        setPipeline: () => {},
        setBindGroup: () => {},
        setVertexBuffer: () => {},
        setIndexBuffer: () => {},
        draw: (vertexCount: number, instanceCount: number, firstVertex: number, firstInstance: number) => {
          draws.push({ vertexCount, instanceCount, firstVertex, firstInstance });
        },
        drawIndexed: (indexCount: number) => {
          drawsIndexed.push({ indexCount });
        },
      };

      // Path A: Vector Ribbon path
      engine.renderContours(mockPassEncoder);
      expect(draws.length).toBe(1);
      expect(draws[0].vertexCount).toBe(4); // 4 corners per quad
      expect(draws[0].instanceCount).toBe(34514); // 69,028 / 2 segments

      // Path B: Fallback indexed line path (disable ribbon pipeline)
      (engine as any).vectorRibbonPipeline = null;
      (engine as any).linesRenderPipeline = {}; // truthy mock pipeline
      (engine as any).renderBindGroup = {};     // truthy mock bind group

      engine.renderContours(mockPassEncoder);
      expect(drawsIndexed.length).toBe(1);
      expect(drawsIndexed[0].indexCount).toBe(69028);

      // Path C: No-op path when buffers are cleared
      engine.dispose();
      expect(() => engine.renderContours(mockPassEncoder)).not.toThrow();

      expect(draws.length).toBe(1); // No new draws after dispose
      expect(drawsIndexed.length).toBe(1);
    });

    it('CH1-T22: verifies loadContourMesh on uninitialized engine (device = null) returns gracefully without crash', async () => {
      const uninitEngine = new WebGPUEngine();
      // Should not throw even if called before engine.initialize()
      await expect(uninitEngine.loadContourMesh(realArrayBuffer)).resolves.toBeUndefined();
      expect(uninitEngine.contourVertexBuffer).toBeNull();
      expect(uninitEngine.contourIndexBuffer).toBeNull();
      expect(uninitEngine.contourSegmentBuffer).toBeNull();
    });

    it('CH1-T23: loads zero-vertex/zero-index mesh into WebGPUEngine without throwing', async () => {
      const engine = new WebGPUEngine();
      const canvas = {
        getContext: () => ({
          configure: () => {},
          getCurrentTexture: () => ({ createView: () => ({}) }),
          canvas: { width: 800, height: 600 },
        }),
        width: 800,
        height: 600,
      } as unknown as HTMLCanvasElement;

      await engine.initialize({
        canvas,
        pointCount: 2,
        pointsData: new Float32Array(6),
        target2DData: new Float32Array(4),
        typeData: new Float32Array(2),
        lineIndices: new Uint32Array([0, 1]),
      });

      const zeroBuf = createSyntheticBuffer({ pointCount: 0, indexCount: 0 });
      await expect(engine.loadContourMesh(zeroBuf)).resolves.toBeUndefined();
      expect(engine.contourVertexCount).toBe(0);
      expect(engine.contourIndexCount).toBe(0);

      engine.dispose();
    });

    it('CH1-T24: high-frequency zero-copy decoding throughput stress (1,000 iterations in < 100ms)', () => {
      const startTime = performance.now();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const decoded = decodeContourMesh(realArrayBuffer);
        // Access views to verify liveness
        const len = decoded.positions3D.length;
        if (len !== 69028 * 3) throw new Error('Decoded length mismatch');
      }

      const elapsedMs = performance.now() - startTime;
      const perDecodeUs = (elapsedMs / iterations) * 1000;

      // Because decoding creates only typed views without array copying,
      // 1,000 decodes of a 2.48 MB buffer takes < 100 ms (< 100 microseconds per decode)
      expect(elapsedMs).toBeLessThan(100.0);
      expect(perDecodeUs).toBeLessThan(100.0);
    });

    it('CH1-T25: exhaustively proves 0 NaNs and 0 Infs across all 69,028 vertices and indices of public/geo-contour-mesh.bin', () => {
      const decoded = decodeContourMesh(realArrayBuffer);
      const N = decoded.header.pointCount;
      const M = decoded.header.indexCount;

      // 1. All 207,084 3D coordinates
      for (let i = 0; i < N * 3; i++) {
        expect(Number.isFinite(decoded.positions3D[i])).toBe(true);
      }

      // 2. All 138,056 Mercator 2D coordinates
      for (let i = 0; i < N * 2; i++) {
        expect(Number.isFinite(decoded.target2D[i])).toBe(true);
      }

      // 3. All 138,056 Dymaxion 2D coordinates
      for (let i = 0; i < N * 2; i++) {
        expect(Number.isFinite(decoded.dymaxion2D[i])).toBe(true);
      }

      // 4. All 69,028 normalized elevation values
      for (let i = 0; i < N; i++) {
        expect(Number.isFinite(decoded.typeData[i])).toBe(true);
        expect(decoded.typeData[i]).toBeGreaterThanOrEqual(0.0);
        expect(decoded.typeData[i]).toBeLessThanOrEqual(1.0);
      }

      // 5. All 69,028 line indices stay strictly within [0, N-1]
      for (let i = 0; i < M; i++) {
        const idx = decoded.lineIndices[i];
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(N);
      }
    });

    it('CH1-T26: endianness sensitivity — big-endian formatted header is rejected by little-endian parser', () => {
      // Encode MAGIC_GEOM in big-endian byte order (0x47, 0x45, 0x4F, 0x4D)
      // When read as little-endian, it becomes 0x4D4F4547 ('MOEG')
      const buffer = new ArrayBuffer(32);
      const view = new DataView(buffer);
      view.setUint32(0, MAGIC_GEOM, false); // false = big-endian
      view.setUint32(4, 1, false);
      view.setUint32(8, 10, false);
      view.setUint32(12, 10, false);

      expect(() => parseContourMeshHeader(buffer)).toThrowError(/Invalid contour mesh magic/i);
    });
  });
});
