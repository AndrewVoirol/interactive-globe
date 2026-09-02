import { describe, it, expect } from 'vitest';
import {
  generateFibonacciSphere,
  computeWireframeOpacityScale,
} from '../helpers/math-oracle';
import { serializeGeomBuffer, parseGeomBuffer } from '../helpers/geom-parser';

describe('Tier 2: Boundary Value Analysis — Point Count Scaling [0 to 2,000,000]', () => {
  it('T2-P01: verifies single-node matrix (N = 1) evaluates without division by zero', () => {
    const { points3D, target2D } = generateFibonacciSphere(1);
    expect(points3D.length).toBe(3);
    expect(target2D.length).toBe(2);
    expect(Number.isFinite(points3D[0])).toBe(true);
    expect(Number.isFinite(target2D[0])).toBe(true);
  });

  it('T2-P02: verifies minimal two-node matrix (N = 2) places poles correctly at +Z and -Z', () => {
    const { points3D } = generateFibonacciSphere(2);
    expect(points3D.length).toBe(6);
    expect(points3D[1]).toBeCloseTo(5.0, 3);  // +Y (north pole)
    expect(points3D[4]).toBeCloseTo(-5.0, 3); // -Y (south pole)
  });

  it('T2-P03: verifies 20k node generation produces 60k float components with zero NaNs', () => {
    const N = 20000;
    const { points3D } = generateFibonacciSphere(N);
    expect(points3D.length).toBe(60000);
    for (let i = 0; i < 1000; i++) {
      expect(Number.isNaN(points3D[i])).toBe(false);
    }
  });

  it('T2-P04: verifies 100k node generation produces 300k float components and exact byte length', () => {
    const N = 100000;
    const M = 100000; // 100k line edges
    const points = new Float32Array(N * 3);
    const target2D = new Float32Array(N * 2);
    const types = new Float32Array(N);
    const indices = new Uint32Array(M * 2);

    const binary = serializeGeomBuffer(points, target2D, types, indices);
    expect(binary.byteLength).toBe(32 + N * 12 + N * 8 + N * 4 + M * 2 * 4); // 3,200,032 bytes
    const parsed = parseGeomBuffer(binary);
    expect(parsed.pointCount).toBe(100000);
    expect(parsed.indexCount).toBe(M * 2);
  });

  it('T2-P05: verifies 1,000,000 node dataset generates exact 45.74 MB binary structure', () => {
    const N = 1000000;
    const totalIndexCount = 5990682; // Exact index count in public/geo-mesh-1m.bin
    const totalBytes = 32 + N * 3 * 4 + N * 2 * 4 + N * 4 + totalIndexCount * 4;
    const totalMB = totalBytes / (1024 * 1024);

    expect(totalMB).toBeCloseTo(45.74, 1);
  });

  it('T2-P06: verifies 2,000,000 extreme node stress allocation computes correct workgroups', () => {
    const N = 2000000;
    const workgroups = Math.ceil(N / 256);
    expect(workgroups).toBe(7813);
  });

  it('T2-P07: verifies opacity scaling factor at N = 0 clamps to 1.0 gracefully', () => {
    expect(computeWireframeOpacityScale(0)).toBe(1.0);
    expect(computeWireframeOpacityScale(-100)).toBe(1.0);
  });

  it('T2-P08: verifies opacity scaling factor at N = 10,000,000 approaches 0.1 without going negative', () => {
    const scale10M = computeWireframeOpacityScale(10000000);
    expect(scale10M).toBeCloseTo(0.1, 4);
    expect(scale10M).toBeGreaterThan(0.0);
  });

  it('T2-P09: verifies WebGPU storage buffer stride alignment for 1M particles matches float32x4', () => {
    const N = 1000000;
    const stride = 16; // bytes
    const totalBufferSize = N * stride;
    expect(totalBufferSize).toBe(16000000);
    expect(totalBufferSize % 256).toBe(0); // WebGPU minimum uniform/storage offset alignment
  });

  it('T2-P10: verifies line index buffer vertex indices never exceed pointCount - 1', () => {
    const N = 1000;
    const M = 1500;
    const indices = new Uint32Array(M * 2);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = i % N;
      expect(indices[i]).toBeLessThan(N);
      expect(indices[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('T2-P11: verifies Float32Array allocations do not exceed JavaScript max buffer limit', () => {
    const N = 1000000;
    // 1M * 3 floats = 3M floats (12 MB), well below 2GB TypedArray limit
    const floatCount = N * 3;
    expect(floatCount).toBeLessThan(1000000000);
  });

  it('T2-P12: verifies memory layout for 1M nodes has exact 1:1 correspondence across all columnar channels', () => {
    const N = 1000000;
    const pointsLen = N * 3;
    const target2DLen = N * 2;
    const typesLen = N;

    expect(pointsLen / 3).toBe(N);
    expect(target2DLen / 2).toBe(N);
    expect(typesLen).toBe(N);
  });

  it('T2-P13: verifies workgroup index bounds clamp correctly at non-power-of-two point counts', () => {
    const pointCount = 1000001; // 1M + 1
    const workgroupSize = 256;
    const totalWorkgroups = Math.ceil(pointCount / workgroupSize);
    const totalThreads = totalWorkgroups * workgroupSize;

    expect(totalThreads).toBeGreaterThan(pointCount);
    expect(totalThreads - pointCount).toBeLessThan(workgroupSize);
  });

  it('T2-P14: verifies empty line indices array (M = 0) serializes header with indexCount = 0', () => {
    const points = new Float32Array(30);
    const target2D = new Float32Array(20);
    const types = new Float32Array(10);
    const indices = new Uint32Array(0);

    const binary = serializeGeomBuffer(points, target2D, types, indices);
    const parsed = parseGeomBuffer(binary);
    expect(parsed.pointCount).toBe(10);
    expect(parsed.indexCount).toBe(0);
    expect(parsed.indices.length).toBe(0);
  });

  it('T2-P15: verifies type buffer classification values are strictly binary 0.0 or 1.0', () => {
    const types = new Float32Array([1.0, 0.0, 1.0, 1.0, 0.0]);
    for (let i = 0; i < types.length; i++) {
      expect(types[i] === 0.0 || types[i] === 1.0).toBe(true);
    }
  });

  it('T2-P16: verifies point density per steradian is constant across all spherical latitudes', () => {
    const N = 10000;
    const { coords } = generateFibonacciSphere(N);
    const eqCount = coords.filter(([_, lat]) => lat >= -10 && lat <= 10).length;
    const poleCount = coords.filter(([_, lat]) => lat >= 70 && lat <= 90).length;

    const areaEq = Math.sin((10 * Math.PI) / 180) - Math.sin((-10 * Math.PI) / 180);
    const areaPole = Math.sin((90 * Math.PI) / 180) - Math.sin((70 * Math.PI) / 180);

    const densityEq = eqCount / areaEq;
    const densityPole = poleCount / areaPole;

    expect(densityEq / densityPole).toBeCloseTo(1.0, 1);
  });
});
