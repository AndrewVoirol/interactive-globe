// ============================================================================
// File: tests/phase2/crust-hydrosphere-dual-surface.test.ts
// Architecture: Dual-Surface Lithosphere Crust & Liquid Hydrosphere Verification
// Description: Unit and integration tests for the 3D tessellated sphere grid,
//              dual-surface partitioning, WebGPU buffer allocation, uniform serialization,
//              and elimination of the 2D NDC fullscreen wallpaper quad.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

let originalNavigator: any;

function setupMockNavigator() {
  originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
        requestAdapter: async () => ({
          limits: {
            maxStorageBufferBindingSize: 1024 * 1024 * 1024,
            maxBufferSize: 1024 * 1024 * 1024,
            maxComputeWorkgroupStorageSize: 32768,
            maxComputeInvocationsPerWorkgroup: 1024,
          },
          features: new Set(['timestamp-query']),
          requestDevice: async () => new MockGPUDevice(),
        }),
      },
    },
    configurable: true,
    writable: true,
  });
}

function restoreMockNavigator() {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
}

function createEngineConfig(pointCount = 100, lineCount = 50): WebGPUInitConfig {
  const pointsData = new Float32Array(pointCount * 3);
  const target2DData = new Float32Array(pointCount * 2);
  const typeData = new Float32Array(pointCount);
  const lineIndices = new Uint32Array(lineCount * 2);

  for (let i = 0; i < pointCount; i++) {
    pointsData[i * 3 + 0] = Math.sin(i);
    pointsData[i * 3 + 1] = Math.cos(i);
    pointsData[i * 3 + 2] = 5.0;
    target2DData[i * 2 + 0] = i * 0.1;
    target2DData[i * 2 + 1] = i * 0.2;
    typeData[i] = i % 2;
  }

  for (let j = 0; j < lineCount * 2; j++) {
    lineIndices[j] = j % pointCount;
  }

  const canvas = {
    width: 800,
    height: 600,
    getContext: () => ({
      configure: () => {},
      getCurrentTexture: () => ({
        createView: () => ({}),
      }),
    }),
  } as any as HTMLCanvasElement;

  return { canvas, pointCount, pointsData, target2DData, typeData, lineIndices };
}

describe('Dual-Surface Lithosphere Crust & Liquid Hydrosphere (M1-T3)', () => {
  beforeEach(() => {
    setupMockNavigator();
  });

  afterEach(() => {
    restoreMockNavigator();
  });

  describe('1. 3D Tessellated Spherical Grid Mathematics', () => {
    it('DUAL-01: generateSphereGrid produces correct vertex and index counts for specified lat/lon resolution', () => {
      const engine = new WebGPUEngine();
      const latSegments = 32;
      const lonSegments = 64;
      const mesh = engine.generateSphereGrid(latSegments, lonSegments);

      const vertsPerSurface = (latSegments + 1) * (lonSegments + 1);
      const expectedVertexCount = vertsPerSurface * 2;
      const expectedFloatCount = expectedVertexCount * 12;

      const quadsPerSurface = latSegments * lonSegments;
      const expectedIndexCount = quadsPerSurface * 6 * 2;

      expect(mesh.vertices.length).toBe(expectedFloatCount);
      expect(mesh.indices.length).toBe(expectedIndexCount);
    });

    it('DUAL-02: strictly partitions surfaceType (0.0 for crust, 1.0 for hydrosphere)', () => {
      const engine = new WebGPUEngine();
      const latSegments = 16;
      const lonSegments = 32;
      const mesh = engine.generateSphereGrid(latSegments, lonSegments);
      const vertsPerSurface = (latSegments + 1) * (lonSegments + 1);

      // Verify Crust surface (first half) has surfaceType === 0.0
      for (let i = 0; i < vertsPerSurface; i++) {
        const surfaceType = mesh.vertices[i * 12 + 5];
        expect(surfaceType).toBe(0.0);
      }

      // Verify Liquid Hydrosphere surface (second half) has surfaceType === 1.0
      for (let i = vertsPerSurface; i < vertsPerSurface * 2; i++) {
        const surfaceType = mesh.vertices[i * 12 + 5];
        expect(surfaceType).toBe(1.0);
      }
    });

    it('DUAL-03: preserves spherical invariant radius R = 5.0 across all vertices', () => {
      const engine = new WebGPUEngine();
      const mesh = engine.generateSphereGrid(16, 32);
      const totalVertices = mesh.vertices.length / 12;

      for (let i = 0; i < totalVertices; i++) {
        const x = mesh.vertices[i * 12 + 0];
        const y = mesh.vertices[i * 12 + 1];
        const z = mesh.vertices[i * 12 + 2];
        const r = Math.hypot(x, y, z);
        expect(r).toBeCloseTo(5.0, 4);
      }
    });

    it('DUAL-04: guarantees zero NaNs or Infs across all positions, UVs, target2D, and indices', () => {
      const engine = new WebGPUEngine();
      const mesh = engine.generateSphereGrid(32, 64);

      for (let i = 0; i < mesh.vertices.length; i++) {
        expect(Number.isFinite(mesh.vertices[i])).toBe(true);
      }

      for (let j = 0; j < mesh.indices.length; j++) {
        expect(Number.isInteger(mesh.indices[j])).toBe(true);
        expect(mesh.indices[j]).toBeGreaterThanOrEqual(0);
        expect(mesh.indices[j]).toBeLessThan(mesh.vertices.length / 12);
      }
    });
  });

  describe('2. GPU Buffer Allocation and Uniform Serialization', () => {
    it('DUAL-05: allocates crust vertex and index buffers when cartographic buffers are initialized', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 50);
      await engine.initialize(config);

      expect(engine.getCrustVertexBuffer()).toBeNull();
      expect(engine.getCrustIndexBuffer()).toBeNull();
      expect(engine.getCrustIndexCount()).toBe(0);

      engine.ensureCartographicBuffers();

      const vertexBuffer = engine.getCrustVertexBuffer();
      const indexBuffer = engine.getCrustIndexBuffer();
      const indexCount = engine.getCrustIndexCount();

      expect(vertexBuffer).not.toBeNull();
      expect(indexBuffer).not.toBeNull();
      expect(indexCount).toBeGreaterThan(0);

      // Default resolution 128x256 produces 128*256*6*2 = 393,216 indices
      expect(indexCount).toBe(128 * 256 * 6 * 2);

      engine.dispose();
    });

    it('DUAL-06: serializes viewMatrix, projectionMatrix, cameraPos, and seaLevel into crustUniformBuffer', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 50);
      await engine.initialize(config);
      engine.ensureCartographicBuffers();

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
      camera.position.set(2, 3, 10);
      camera.lookAt(0, 0, 0);

      const device = (engine as any).device as MockGPUDevice;
      device.queue.writeBufferCalls = [];

      engine.updateUniforms({
        unfurl: 0.75,
        mode: 3,
        theme: 1,
        time: 4.2,
        dt: 0.016,
        camera,
        displacementScale: 0.15,
        seaLevel: 125.0,
      });

      // Find writeBuffer call targeting crustUniformBuffer
      const crustBuf = (engine as any).crustUniformBuffer;
      const crustCall = device.queue.writeBufferCalls.find((call) => call.buffer === crustBuf);
      expect(crustCall).toBeDefined();

      const floats = new Float32Array(crustCall!.data as ArrayBuffer);
      const uints = new Uint32Array(crustCall!.data as ArrayBuffer);

      // Verify fields
      expect(floats[0]).toBeCloseTo(0.75, 4); // unfurl
      expect(uints[1]).toBe(3);               // mode
      expect(uints[2]).toBe(1);               // theme
      expect(floats[3]).toBeCloseTo(4.2, 4);  // time
      expect(floats[8]).toBeCloseTo(2.0, 4);  // cameraPos.x
      expect(floats[9]).toBeCloseTo(3.0, 4);  // cameraPos.y
      expect(floats[10]).toBeCloseTo(10.0, 4);// cameraPos.z
      expect(floats[21]).toBeCloseTo(0.15, 4);// displacementScale
      expect(floats[22]).toBeCloseTo(125.0, 4);// seaLevel

      engine.dispose();
    });
  });

  describe('3. Render Pass Execution and 2D Quad Elimination', () => {
    it('DUAL-07: binds crustHydrospherePipeline and executes drawIndexed during render when reliefActive is true', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 50);
      await engine.initialize(config);

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);

      const device = (engine as any).device as MockGPUDevice;
      const setPipelineCalls: any[] = [];
      const drawIndexedCalls: any[] = [];
      const drawCalls: any[] = [];

      const origCreateCommandEncoder = device.createCommandEncoder.bind(device);
      device.createCommandEncoder = () => {
        const enc = origCreateCommandEncoder();
        const origBeginRenderPass = enc.beginRenderPass.bind(enc);
        enc.beginRenderPass = (desc: any) => {
          const pass = origBeginRenderPass(desc);
          const origSetPipeline = pass.setPipeline.bind(pass);
          const origDrawIndexed = pass.drawIndexed.bind(pass);
          const origDraw = pass.draw.bind(pass);

          pass.setPipeline = (pipe: any) => {
            setPipelineCalls.push(pipe);
            return origSetPipeline(pipe);
          };
          pass.drawIndexed = (...args: any[]) => {
            drawIndexedCalls.push(args);
            return origDrawIndexed(...args);
          };
          pass.draw = (...args: any[]) => {
            drawCalls.push(args);
            return origDraw(...args);
          };
          return pass;
        };
        return enc;
      };

      engine.render({
        unfurl: 0.5,
        mode: 0,
        time: 1.0,
        dt: 0.016,
        camera,
        reliefActive: true,
      });

      // 1. Verify crustHydrospherePipeline was set
      const crustPipeline = (engine as any).crustHydrospherePipeline;
      expect(setPipelineCalls).toContain(crustPipeline);

      // 2. Verify drawIndexed was called with engine.crustIndexCount
      const expectedCount = engine.getCrustIndexCount();
      const matchedDrawIndexed = drawIndexedCalls.find(([count]) => count === expectedCount);
      expect(matchedDrawIndexed).toBeDefined();

      // 3. Verify swissReliefPipeline 2D flat quad draw(4) was NOT called
      const swissPipeline = (engine as any).swissReliefPipeline;
      expect(setPipelineCalls).not.toContain(swissPipeline);

      engine.dispose();
    });

    it('DUAL-08: cleanly destroys crust vertex and index buffers in dispose()', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig(100, 50);
      await engine.initialize(config);
      engine.ensureCartographicBuffers();

      const vertexBuffer = engine.getCrustVertexBuffer();
      const indexBuffer = engine.getCrustIndexBuffer();
      expect(vertexBuffer).not.toBeNull();
      expect(indexBuffer).not.toBeNull();

      engine.dispose();

      expect(engine.getCrustVertexBuffer()).toBeNull();
      expect(engine.getCrustIndexBuffer()).toBeNull();
      expect(engine.getCrustIndexCount()).toBe(0);
      expect(engine.initialized).toBe(false);
    });
  });
});
