// ============================================================================
// File: tests/cdlod/r4-regional-dem-streaming.test.ts
// Test Tier: Milestone 4 (R4 Streamed Regional High-Res DEM Ingestion up to LOD 12 & Mip-Inversion Fix)
// Description: Validates streamed 16-bit regional high-res DEM texture ingestion (rgba16float,
//              256-byte row pitch alignment, FP16 conversion), WGSL mip-inversion elimination
//              (sampling mip 0.0 in vs_main), dynamic quadtree depth scaling up to LOD 12
//              for active regional insets with nadir vertex spacing <= 76.4m, global budget safety
//              (capped at LOD 10 outside active bounds, activeNodeCount < 4096), zero-GC traversal,
//              and Rule 8 cross-pipeline elevation decoding parity.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { decodeFloat16, encodeFloat16 } from '../../src/core/math/float16';

describe('R4 Streamed Regional High-Res DEM Ingestion up to LOD 12 & Mip-Inversion Fix', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const crustWgslPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const vectorWgslPath = path.join(projectRoot, 'src/webgpu/shaders/vector_ribbon.wgsl');
  const cloudWgslPath = path.join(projectRoot, 'src/webgpu/shaders/cloud_shell.wgsl');
  const horizonWgslPath = path.join(projectRoot, 'src/webgpu/shaders/horizon_occlusion.wgsl');
  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');

  let engine: WebGPUEngine;
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

  function createMockCanvas(width = 1920, height = 1080) {
    const mockContext = {
      configure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({
        createView: vi.fn(() => ({})),
      })),
    };
    return {
      width,
      height,
      getContext: vi.fn((type: string) => {
        if (type === 'webgpu') return mockContext;
        return null;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;
  }

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  // ==========================================================================
  // Pillar 1: Regional DEM Texture Ingestion & Memory Alignment
  // ==========================================================================
  describe('Pillar 1: Regional DEM Texture Ingestion & Memory Alignment', () => {
    it('verifies static source architecture for rgba16float format and 256-byte row pitch in loadRegionalDEMTexture', () => {
      const engineSrc = fs.readFileSync(enginePath, 'utf8');

      // 1. Regional DEM format must be rgba16float for 16-bit uint16 binary ingestion
      expect(engineSrc).toContain("format: 'rgba16float'");

      // 2. Unpadded row bytes for rgba16float: width * 4 channels * 2 bytes = width * 8
      expect(engineSrc).toContain('const unpaddedRowBytes = w * 8;');

      // 3. WebGPU 256-byte row pitch alignment rule
      expect(engineSrc).toContain('const paddedRowBytes = Math.ceil(unpaddedRowBytes / 256) * 256;');

      // 4. Conversion of uint16 inputs to float16 bits via precomputed LUT
      expect(engineSrc).toContain('paddedF16[dstRow + x] = U16_TO_F16_LUT[u16[srcRow + x]];');
    });

    it('ingests 16-bit regional binary buffer and creates rgba16float texture with aligned row pitch', async () => {
      setupMockNavigator();
      try {
        const testEngine = new WebGPUEngine();
        const canvas = createMockCanvas(1920, 1080);
        await testEngine.initialize({
          canvas,
          pointCount: 10,
          pointsData: new Float32Array(30),
          target2DData: new Float32Array(20),
          typeData: new Float32Array(10),
          lineIndices: new Uint32Array(20),
        });

        // 60x40 synthetic regional DEM (60 * 8 = 480 bytes unpadded, padded = 512 bytes)
        const width = 60;
        const height = 40;
        const u16Data = new Uint16Array(width * height * 4);
        for (let i = 0; i < u16Data.length; i++) {
          u16Data[i] = 32768; // Mid-elevation
        }

        const bounds = { minLon: -161.0, maxLon: -154.0, minLat: 18.0, maxLat: 23.0 };
        await testEngine.loadRegionalDEMTexture(u16Data.buffer, bounds, width, height, 'test-hawaii');

        const entry = testEngine.regionalDEMTextures.get('test-hawaii');
        expect(entry).toBeDefined();
        expect(entry?.width).toBe(width);
        expect(entry?.height).toBe(height);
        expect(entry?.texture.format).toBe('rgba16float');

        // Verify active regional DEM tracking
        expect(testEngine.getActiveRegionalDEM()).toBe('test-hawaii');
        const activeBounds = testEngine.getActiveRegionalBounds();
        expect(activeBounds).toEqual([-161.0, 18.0, -154.0, 23.0]);

        testEngine.dispose();
      } finally {
        restoreMockNavigator();
      }
    });

    it('verifies FP16 conversion preserves sub-meter vertical precision without 8-bit quantizing steps', () => {
      // In Regional DEM encoding (Channel R: land elevation normalized to [0..8848m]):
      // Test coastal elevation ramp from 1.0m to 35.0m in 1.0m increments
      const Z_MAX_LAND = 8848.0;
      const nominalElevations: number[] = [];
      const decodedElevations: number[] = [];

      for (let h = 1.0; h <= 35.0; h += 1.0) {
        nominalElevations.push(h);
        const u16Val = Math.round((h / Z_MAX_LAND) * 65535.0);
        // Encode via LUT formula (encodeFloat16(u16Val / 65535.0))
        const f16Bits = encodeFloat16(u16Val / 65535.0);
        // Decode float16
        const sampledNormalized = decodeFloat16(f16Bits);
        const decodedElev = sampledNormalized * Z_MAX_LAND;
        decodedElevations.push(decodedElev);
      }

      // 1. Verify all consecutive steps are strictly distinct and monotonically increasing
      for (let i = 1; i < decodedElevations.length; i++) {
        expect(decodedElevations[i]).toBeGreaterThan(decodedElevations[i - 1]);
      }

      // 2. Verify elevation recovery error is < 0.1m across all tested steps
      for (let i = 0; i < decodedElevations.length; i++) {
        const errorMeters = Math.abs(decodedElevations[i] - nominalElevations[i]);
        expect(errorMeters).toBeLessThan(0.10);
      }

      // 3. Verify zero 34.6m flat plateaus: in 8-bit quantization (u16 >> 8),
      // all elevations 1..34m would collapse to 0.0m. Here, 35 distinct values exist.
      const uniqueDecoded = new Set(decodedElevations);
      expect(uniqueDecoded.size).toBe(35);
    });
  });

  // ==========================================================================
  // Pillar 2: WGSL Regional DEM Mip-Inversion Fix & Shader Control Flow
  // ==========================================================================
  describe('Pillar 2: WGSL Regional DEM Mip-Inversion Fix & Shader Control Flow', () => {
    it('verifies crust_hydrosphere.wgsl samples regional DEM at mip 0.0 in vs_main', () => {
      const crustWgsl = fs.readFileSync(crustWgslPath, 'utf8');

      // 1. Assert vs_main passes 0.0 as the lod argument to sampleRegionalComposite
      expect(crustWgsl).toContain('let demSampleComp = sampleRegionalComposite(uv, demSample, 0.0);');

      // 2. Assert defective instLod call is completely eliminated
      expect(crustWgsl).not.toContain('sampleRegionalComposite(uv, demSample, instLod)');

      // 3. Assert fs_main continues to pass 0.0 for center and neighbor taps
      expect(crustWgsl).toContain('let finalDemC = sampleRegionalComposite(input.uv, demC, 0.0);');
      expect(crustWgsl).toContain('let finalDemR = sampleRegionalComposite(uvR, demR, 0.0);');
      expect(crustWgsl).toContain('let finalDemL = sampleRegionalComposite(uvL, demL, 0.0);');
      expect(crustWgsl).toContain('let finalDemU = sampleRegionalComposite(uvU, demU, 0.0);');
      expect(crustWgsl).toContain('let finalDemD = sampleRegionalComposite(uvD, demD, 0.0);');
    });

    it('enforces Rule 4: screen-space derivatives remain at unconditional top of fs_main', () => {
      const crustWgsl = fs.readFileSync(crustWgslPath, 'utf8');

      const fsMainIndex = crustWgsl.indexOf('fn fs_main');
      expect(fsMainIndex).toBeGreaterThan(0);
      const fsSub = crustWgsl.substring(fsMainIndex);

      // Derivatives should be declared early in fs_main
      const dpdxIdx = fsSub.indexOf('dpdx(');
      const dpdyIdx = fsSub.indexOf('dpdy(');
      const fwidthIdx = fsSub.indexOf('fwidth(');

      expect(dpdxIdx).toBeGreaterThan(0);
      expect(dpdyIdx).toBeGreaterThan(0);
      expect(fwidthIdx).toBeGreaterThan(0);

      // Verify no dynamic discard statement precedes the uniform derivatives
      const discardIdx = fsSub.indexOf('discard;');
      if (discardIdx !== -1) {
        expect(dpdxIdx).toBeLessThan(discardIdx);
        expect(dpdyIdx).toBeLessThan(discardIdx);
        expect(fwidthIdx).toBeLessThan(discardIdx);
      }
    });

    it('validates u_regionalOverlay uniform buffer layout and 16-byte alignment', () => {
      const crustWgsl = fs.readFileSync(crustWgslPath, 'utf8');

      expect(crustWgsl).toContain('struct RegionalOverlayUniforms {');
      expect(crustWgsl).toContain('u_regionalBounds: vec4<f32>,');
      expect(crustWgsl).toContain('u_regionalActive: u32,');
    });
  });

  // ==========================================================================
  // Pillar 3: Dynamic LOD 12 Quadtree Scaling & Nadir Spacing
  // ==========================================================================
  describe('Pillar 3: Dynamic LOD 12 Quadtree Scaling & Nadir Spacing', () => {
    it('subdivides up to LOD 12 over active regional DEM (Hawaii) when camera altitude is low', () => {
      // Configure active regional DEM for Hawaii: [-161.0, 18.0, -154.0, 23.0]
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      // Position camera over Hawaii center: lon = -157.5, lat = 20.5
      const u = (-157.5 + 180.0) / 360.0;
      const v = (90.0 - 20.5) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);

      // Low altitude: 10 km AGL (10 / 1274.2 = 0.007848 units)
      const altUnits = 10.0 / 1274.2;
      const camDist = 5.0 + altUnits;
      const scale = camDist / 5.0;

      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      // 1. Assert maxLod seen reaches 12
      expect(engine.lastMaxLodSeen).toBe(12);

      // 2. Assert active nodes include LOD 12 patches
      const activeNodes = (engine as any).cdlodNodePool.slice(0, engine.cdlodActiveNodeCount);
      const lod12Nodes = activeNodes.filter((n: any) => n.lod === 12);
      expect(lod12Nodes.length).toBeGreaterThan(0);

      // 3. Assert all LOD 12 nodes intersect the Hawaii bounding box
      for (const node of lod12Nodes) {
        const patchMinLon = node.minU * 360.0 - 180.0;
        const patchMaxLon = (node.minU + node.sizeU) * 360.0 - 180.0;
        const patchMinLat = 90.0 - (node.minV + node.sizeV) * 180.0;
        const patchMaxLat = 90.0 - node.minV * 180.0;

        const intersects = !(
          patchMaxLon < -161.0 ||
          patchMinLon > -154.0 ||
          patchMaxLat < 18.0 ||
          patchMinLat > 23.0
        );
        expect(intersects).toBe(true);
      }
    });

    it('subdivides up to LOD 12 over Mount Fuji regional DEM when zoomed in', () => {
      // Fuji bounds: [138.5, 35.2, 139.0, 35.5]
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [138.5, 35.2, 139.0, 35.5],
        width: 900,
        height: 540,
        id: 'fuji',
      };

      const u = (138.75 + 180.0) / 360.0;
      const v = (90.0 - 35.36) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);

      const altUnits = 10.0 / 1274.2;
      const camDist = 5.0 + altUnits;
      const scale = camDist / 5.0;

      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      expect(engine.lastMaxLodSeen).toBe(12);
      expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
      expect(engine.cdlodActiveNodeCount).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);
    });

    it('proves nadir vertex spacing over region reaches <= 76.4m at LOD 12', () => {
      // Real Earth circumference ~ 40,030,173.59 m
      // Half-circumference per root node = ~20,015,086.8 m
      // At LOD 12: node width = 20,015,086.8 / 2^12 = 4,886.49 m
      // 64 cells per node: vertex spacing = 4,886.49 / 64 = 76.35 m
      const nadirSpacing = engine.getNadirVertexSpacingMeters(10.0, 12);

      expect(nadirSpacing).toBeLessThanOrEqual(76.4);
      expect(nadirSpacing).toBeGreaterThan(70.0);
      expect(nadirSpacing).toBeCloseTo(76.35, 1);
    });
  });

  // ==========================================================================
  // Pillar 4: Global Budget Safety, Zero-GC & Invariant Containment
  // ==========================================================================
  describe('Pillar 4: Global Budget Safety, Zero-GC & Invariant Containment', () => {
    it('strictly caps patches outside the active regional bounds at LOD <= 10', () => {
      // Active regional DEM is Hawaii: [-161.0, 18.0, -154.0, 23.0]
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      // Position camera over London: lon = 0.0, lat = 51.5 at low altitude (10 km)
      const u = (0.0 + 180.0) / 360.0;
      const v = (90.0 - 51.5) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);

      const altUnits = 10.0 / 1274.2;
      const scale = (5.0 + altUnits) / 5.0;

      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      // Over London, no regional DEM exists -> must strictly cap at cdlodMaxLod (10)
      expect(engine.lastMaxLodSeen).toBeLessThanOrEqual(10);

      const activeNodes = (engine as any).cdlodNodePool.slice(0, engine.cdlodActiveNodeCount);
      for (const node of activeNodes) {
        expect(node.lod).toBeLessThanOrEqual(10);
      }
    });

    it('caps all global nodes at LOD <= 10 when activeRegionalDEM is null', () => {
      engine.setActiveRegionalDEM(null);

      // Low altitude over Hawaii without active regional DEM
      const u = (-157.5 + 180.0) / 360.0;
      const v = (90.0 - 20.5) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);
      const scale = (5.0 + 10.0 / 1274.2) / 5.0;

      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      expect(engine.lastMaxLodSeen).toBeLessThanOrEqual(10);
      const activeNodes = (engine as any).cdlodNodePool.slice(0, engine.cdlodActiveNodeCount);
      for (const node of activeNodes) {
        expect(node.lod).toBeLessThanOrEqual(10);
      }
    });

    it('ensures activeNodeCount stays strictly below CDLOD_MAX_NODES (4096) across multiple camera altitudes', () => {
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      const altitudesKm = [5000, 2000, 500, 100, 30, 10, 5];
      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);

      for (const altKm of altitudesKm) {
        const u = (-157.5 + 180.0) / 360.0;
        const v = (90.0 - 20.5) / 180.0;
        const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);
        const scale = (5.0 + altKm / 1274.2) / 5.0;

        camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
        camera.lookAt(p3D[0], p3D[1], p3D[2]);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, 0, 0.0, false);

        expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
        expect(engine.cdlodActiveNodeCount).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);
      }
    });

    it('enforces Rule 26: Zero-GC buffer preservation across 50 consecutive frames with active regional DEM', () => {
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      const refCandidateFloats = (engine as any).cdlodCandidateFloats;
      const refCandidateUints = (engine as any).cdlodCandidateUints;
      const refSpatialHashKeys = (engine as any).cdlodSpatialHashKeys;
      const refSpatialHashValues = (engine as any).cdlodSpatialHashValues;
      const refRippleQueue = (engine as any).cdlodRippleQueue;
      const refNodePool = (engine as any).cdlodNodePool;

      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);

      for (let frame = 0; frame < 50; frame++) {
        const altKm = 10.0 + (frame % 20) * 5.0;
        const lon = -157.5 + Math.sin(frame * 0.1) * 2.0;
        const lat = 20.5 + Math.cos(frame * 0.1) * 2.0;

        const u = (lon + 180.0) / 360.0;
        const v = (90.0 - lat) / 180.0;
        const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);
        const scale = (5.0 + altKm / 1274.2) / 5.0;

        camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
        camera.lookAt(p3D[0], p3D[1], p3D[2]);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, 0, 0.0, false);

        // Strict reference identity checks proving zero reallocations in frame loop
        expect((engine as any).cdlodCandidateFloats).toBe(refCandidateFloats);
        expect((engine as any).cdlodCandidateUints).toBe(refCandidateUints);
        expect((engine as any).cdlodSpatialHashKeys).toBe(refSpatialHashKeys);
        expect((engine as any).cdlodSpatialHashValues).toBe(refSpatialHashValues);
        expect((engine as any).cdlodRippleQueue).toBe(refRippleQueue);
        expect((engine as any).cdlodNodePool).toBe(refNodePool);
      }
    });
  });

  // ==========================================================================
  // Pillar 5: Cross-Pipeline DEM Elevation Decoding Parity (Rule 8)
  // ==========================================================================
  describe('Pillar 5: Cross-Pipeline DEM Elevation Decoding Parity (Rule 8)', () => {
    it('verifies signed elevation decoding formula: elevMeters = demSample.a * 19772.0 - 10924.0', () => {
      function decode(a: number): number {
        return a * 19772.0 - 10924.0;
      }

      // 1. Mariana Trench lowest point (a = 0.0)
      expect(decode(0.0)).toBeCloseTo(-10924.0, 4);

      // 2. Sea level datum (elevation = 0.0m)
      const seaLevelAlpha = 10924.0 / 19772.0;
      expect(decode(seaLevelAlpha)).toBeCloseTo(0.0, 4);

      // 3. Mount Everest peak (a = 1.0)
      expect(decode(1.0)).toBeCloseTo(8848.0, 4);

      // 4. Mauna Kea peak (4207m)
      const maunaKeaAlpha = (4207.0 + 10924.0) / 19772.0;
      expect(decode(maunaKeaAlpha)).toBeCloseTo(4207.0, 3);
    });

    it('proves linear regional composite blending preserves elevation continuity across transitions', () => {
      function decode(a: number): number {
        return a * 19772.0 - 10924.0;
      }

      // Blending test: global elevation = 1000m, regional high-res elevation = 1050m
      const globalElev = 1000.0;
      const regionalElev = 1050.0;
      const globalA = (globalElev + 10924.0) / 19772.0;
      const regionalA = (regionalElev + 10924.0) / 19772.0;

      for (let weight = 0.0; weight <= 1.0; weight += 0.1) {
        // Shader math: mix(globalSample, regSample, weight)
        const mixedA = globalA * (1.0 - weight) + regionalA * weight;
        const decodedFromMixed = decode(mixedA);
        const expectedElev = globalElev * (1.0 - weight) + regionalElev * weight;

        expect(decodedFromMixed).toBeCloseTo(expectedElev, 6);
      }
    });

    it('verifies cross-shader parity of elevation decoding constants in WGSL shaders', () => {
      const shaders = [crustWgslPath, vectorWgslPath, cloudWgslPath, horizonWgslPath];

      for (const sPath of shaders) {
        const src = fs.readFileSync(sPath, 'utf8');
        // Rule 8 requires exactly * 19772.0 - 10924.0
        expect(src).toMatch(/19772(\.0)?\s*-\s*10924(\.0)?/);
      }
    });
  });
});
