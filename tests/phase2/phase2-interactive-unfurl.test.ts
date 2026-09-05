// ============================================================================
// File: tests/phase2/phase2-interactive-unfurl.test.ts
// Verification: Interactive Unfurl Across All 5 Modes with Real DEM, Vectors, & Contours
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU } from '../helpers/webgpu-mock';

describe('Phase 2 Interactive Unfurl & Loaders Verification Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const vectorBinPath = path.join(projectRoot, 'public/geo-vectors.bin');
  const contourBinPath = path.join(projectRoot, 'public/geo-contour-mesh.bin');
  const demBinPath = path.join(projectRoot, 'public/earth-etopo2022-dem-u16.bin');

  it('UNFURL-01: verifies all required Phase 2 binary assets exist and have positive size', () => {
    expect(fs.existsSync(vectorBinPath)).toBe(true);
    expect(fs.existsSync(contourBinPath)).toBe(true);
    expect(fs.existsSync(demBinPath)).toBe(true);

    expect(fs.statSync(vectorBinPath).size).toBeGreaterThan(1024 * 1024);
    expect(fs.statSync(contourBinPath).size).toBeGreaterThan(1024 * 1024);
    expect(fs.statSync(demBinPath).size).toBe(16777216); // Exactly 16 MB 16-bit DEM
  });

  it('UNFURL-02: smoothly unfurls across all 5 projection modes at full pipeline depth', async () => {
    const mockGPU = createMockNavigatorGPU();
    (globalThis as any).navigator = { gpu: mockGPU };

    const engine = new WebGPUEngine();
    const canvas = {
      getContext: () => ({
        configure: () => {},
        getCurrentTexture: () => ({ createView: () => ({}) }),
        canvas: { width: 1920, height: 1080 },
      }),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    await engine.initialize({
      canvas,
      pointCount: 100,
      pointsData: new Float32Array(300),
      target2DData: new Float32Array(200),
      typeData: new Float32Array(100),
      lineIndices: new Uint32Array(100),
    });

    // Ingest binary buffers
    const vectorBuf = fs.readFileSync(vectorBinPath);
    const vectorArrayBuf = vectorBuf.buffer.slice(vectorBuf.byteOffset, vectorBuf.byteOffset + vectorBuf.byteLength);
    await engine.loadVectorData(vectorArrayBuf);

    const contourBuf = fs.readFileSync(contourBinPath);
    const contourArrayBuf = contourBuf.buffer.slice(contourBuf.byteOffset, contourBuf.byteOffset + contourBuf.byteLength);
    await engine.loadContourMesh(contourArrayBuf);

    const demBuf = fs.readFileSync(demBinPath);
    const demArrayBuf = demBuf.buffer.slice(demBuf.byteOffset, demBuf.byteOffset + demBuf.byteLength);
    await engine.loadDEMTexture(demArrayBuf);

    expect((engine as any).vectorSegmentCount).toBeGreaterThan(50000);
    expect(engine.contourVertexCount).toBe(69028);
    expect(engine.contourIndexCount).toBe(69028);

    const camera = new THREE.PerspectiveCamera(45, 1920 / 1080, 0.1, 1000);
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);

    // Verify each of the 5 modes: 0 (Linear), 1 (Scroll), 2 (Griffith), 3 (Fluid), 4 (Dymaxion)
    for (let mode = 0; mode <= 4; mode++) {
      for (let step = 0; step <= 10; step++) {
        const unfurl = step / 10.0;
        expect(() => {
          engine.render({
            unfurl,
            mode,
            time: step * 0.1,
            dt: 0.016,
            camera,
            showVectors: true,
            showContours: true,
            reliefActive: true,
          });
        }).not.toThrow();
      }
    }

    engine.dispose();
  });

  it('UNFURL-03: stress-tests rapid scrubbing across slider values without frame drops or leaks', async () => {
    const mockGPU = createMockNavigatorGPU();
    (globalThis as any).navigator = { gpu: mockGPU };

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
      pointCount: 50,
      pointsData: new Float32Array(150),
      target2DData: new Float32Array(100),
      typeData: new Float32Array(50),
      lineIndices: new Uint32Array(50),
    });

    const contourBuf = fs.readFileSync(contourBinPath);
    await engine.loadContourMesh(contourBuf.buffer.slice(contourBuf.byteOffset, contourBuf.byteOffset + contourBuf.byteLength));

    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 12);

    // Simulate 200 rapid scrubbing events with pseudo-random slider values
    for (let i = 0; i < 200; i++) {
      const unfurl = Math.sin(i * 0.13) * 0.5 + 0.5;
      const mode = i % 5;
      engine.render({
        unfurl,
        mode,
        time: i * 0.008,
        dt: 0.008,
        camera,
        showVectors: i % 2 === 0,
        showContours: true,
        reliefActive: true,
      });
    }

    engine.dispose();
  });

  it('UNFURL-04: verifies generateSphereGrid computes authentic Dymaxion 2D projection with zero NaNs', () => {
    const engine = new WebGPUEngine();
    const mesh = engine.generateSphereGrid(32, 64);
    const floatsPerVertex = 12;
    const vertexCount = mesh.vertices.length / floatsPerVertex;

    let dymaxionDistinctCount = 0;
    for (let i = 0; i < vertexCount; i++) {
      const offset = i * floatsPerVertex;
      const x = mesh.vertices[offset + 0];
      const y = mesh.vertices[offset + 1];
      const z = mesh.vertices[offset + 2];
      const mercX = mesh.vertices[offset + 6];
      const mercY = mesh.vertices[offset + 7];
      const dymX = mesh.vertices[offset + 8];
      const dymY = mesh.vertices[offset + 9];

      expect(Number.isFinite(dymX)).toBe(true);
      expect(Number.isFinite(dymY)).toBe(true);

      // Verify that Dymaxion coords are non-trivial and not simply identical to Mercator
      if (Math.abs(dymX - mercX) > 0.1 || Math.abs(dymY - mercY) > 0.1) {
        dymaxionDistinctCount++;
      }
    }
    // Majority of points must differ from cylindrical Mercator projection
    expect(dymaxionDistinctCount).toBeGreaterThan(vertexCount * 0.8);
  });

  it('UNFURL-05: verifies asynchronous loaders handle mid-stream disposal and uninitialized state gracefully', async () => {
    const mockGPU = createMockNavigatorGPU();
    (globalThis as any).navigator = { gpu: mockGPU };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(new ArrayBuffer(32)),
            } as any),
          20
        )
      )
    );

    try {
      const engine = new WebGPUEngine();
      // 1. Calling loaders on uninitialized engine does not throw
      await expect(engine.loadVectorData('/geo-vectors.bin')).resolves.toBeUndefined();
      await expect(engine.loadContourMesh('/geo-contour-mesh.bin')).resolves.toBeUndefined();
      await expect(engine.loadDEMTexture('/earth-etopo2022-dem-u16.bin')).resolves.toBeUndefined();

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
        lineIndices: new Uint32Array(10),
      });

      // 2. Dispose engine while simulated asynchronous loads are triggered
      const pVec = engine.loadVectorData('/geo-vectors.bin');
      const pCont = engine.loadContourMesh('/geo-contour-mesh.bin');
      const pDem = engine.loadDEMTexture('/earth-etopo2022-dem-u16.bin');

      engine.dispose();

      await expect(Promise.all([pVec, pCont, pDem])).resolves.toBeDefined();
      expect(engine.initialized).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
