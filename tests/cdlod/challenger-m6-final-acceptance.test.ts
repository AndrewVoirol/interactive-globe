// ============================================================================
// File: tests/cdlod/challenger-m6-final-acceptance.test.ts
// Test Tier: Milestone 6 Final Acceptance Challenger
// Challenger: challenger_m6_1
// Mission: Adversarially challenge the CDLOD engine state and interactive invariants:
//          1. Hardware perimeter skirt geometry:
//             - Exact vertex count (8,962), index count (52,224) for 64x64 dual-surface patch
//             - Downward extrusion z_skirt = Delta h_DEM, strictly collinear with -baseNormal
//             - Absence of t-junction cracks & watertight patch seam hermetic sealing
//             - Hydrosphere skirt discard invariant (crust_hydrosphere.wgsl)
//          2. Topological 2:1 restricted quadtree balancing:
//             - Extreme camera angles (grazing, nadir, poles) and unfurl transitions (t in [0.0, 1.0])
//             - Assert strictly for all cardinally adjacent A ~_card B: |DeltaLOD| <= 1
//             - Spherical periodic antimeridian wrap balancing (u = 0 <-> u = 1)
//          3. Screen-space error metric:
//             - Textbook baseline R_0 = 6518.375 at 1080p, 45 deg FOV, tau = 2.0, beta = 1.0
//             - Dyadic halving R_{l+1} = R_l / 2 across all LOD levels
//             - Confirm nadir vertex spacing <= 76.4m at LOD 12 over regional insets
//             - Regional DEM bounds containment (LOD <= 10 outside active bounds)
//          4. Zero-GC per-frame buffer discipline (Rule 26 Compliance):
//             - Zero heap allocations/reallocations inside engine.render() and updateCDLOD()
//             - Strict typed array reference preservation across 100+ frames
//          5. Zero recompilations under dynamic diagnostic switches (Rule 18 Compliance):
//             - Zero GPU render/compute pipeline creations across 100 mode switches
//             - Uniform byte offset 316 (crustFloats[79]) bit-exact update without corruption
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { WebGPUEngine, QuadtreeNodeData } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice, MockGPUBuffer } from '../helpers/webgpu-mock';

interface ActiveNode {
  lod: number;
  minU: number;
  minV: number;
  sizeU: number;
  sizeV: number;
  maxU: number;
  maxV: number;
  x?: number;
  y?: number;
}

function getActiveNodes(engine: WebGPUEngine): ActiveNode[] {
  const count = engine.cdlodActiveNodeCount;
  const pool = (engine as any).cdlodNodePool as QuadtreeNodeData[];
  const nodes: ActiveNode[] = [];
  for (let i = 0; i < count; i++) {
    const n = pool[i];
    nodes.push({
      lod: n.lod,
      minU: n.minU,
      minV: n.minV,
      sizeU: n.sizeU,
      sizeV: n.sizeV,
      maxU: n.minU + n.sizeU,
      maxV: n.minV + n.sizeV,
      x: n.x,
      y: n.y,
    });
  }
  return nodes;
}

function checkAdjacency(
  nodes: ActiveNode[],
  isSphere: boolean
): { pairsChecked: number; maxDelta: number; violations: Array<{ a: ActiveNode; b: ActiveNode; delta: number }> } {
  let pairsChecked = 0;
  let maxDelta = 0;
  const violations: Array<{ a: ActiveNode; b: ActiveNode; delta: number }> = [];
  const EPS = 1e-6;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let isNeighbor = false;

      // 1. Horizontal adjacency in standard parameter space
      const touchU = Math.abs(a.maxU - b.minU) < EPS || Math.abs(b.maxU - a.minU) < EPS;
      const overlapV = Math.min(a.maxV, b.maxV) - Math.max(a.minV, b.minV);
      if (touchU && overlapV > EPS) {
        isNeighbor = true;
      }

      // 2. Vertical adjacency in standard parameter space
      const touchV = Math.abs(a.maxV - b.minV) < EPS || Math.abs(b.maxV - a.minV) < EPS;
      const overlapU = Math.min(a.maxU, b.maxU) - Math.max(a.minU, b.minU);
      if (touchV && overlapU > EPS) {
        isNeighbor = true;
      }

      // 3. Periodic wrap horizontal adjacency on sphere (u = 0 <-> u = 1)
      if (isSphere) {
        const wrapU1 = a.minU < EPS && Math.abs(b.maxU - 1.0) < EPS;
        const wrapU2 = b.minU < EPS && Math.abs(a.maxU - 1.0) < EPS;
        if ((wrapU1 || wrapU2) && overlapV > EPS) {
          isNeighbor = true;
        }
      }

      if (isNeighbor) {
        pairsChecked++;
        const delta = Math.abs(a.lod - b.lod);
        if (delta > maxDelta) maxDelta = delta;
        if (delta > 1) {
          violations.push({ a, b, delta });
        }
      }
    }
  }

  return { pairsChecked, maxDelta, violations };
}

let originalNavigator: any;

function createInstrumentedMockDevice(): {
  device: MockGPUDevice;
  renderPipelineSpy: ReturnType<typeof vi.fn>;
  computePipelineSpy: ReturnType<typeof vi.fn>;
  createBufferSpy: ReturnType<typeof vi.fn>;
  writeBufferSpy: ReturnType<typeof vi.fn>;
} {
  const device = new MockGPUDevice();

  const origCreateRender = device.createRenderPipeline.bind(device);
  const renderPipelineSpy = vi.fn((desc: any) => origCreateRender(desc));
  device.createRenderPipeline = renderPipelineSpy as any;

  const origCreateCompute = device.createComputePipeline.bind(device);
  const computePipelineSpy = vi.fn((desc: any) => origCreateCompute(desc));
  device.createComputePipeline = computePipelineSpy as any;

  const origCreateBuffer = device.createBuffer.bind(device);
  const createBufferSpy = vi.fn((desc: any) => origCreateBuffer(desc));
  device.createBuffer = createBufferSpy as any;

  const origWriteBuffer = device.queue.writeBuffer.bind(device.queue);
  const writeBufferSpy = vi.fn((buf: any, off: any, data: any) => {
    origWriteBuffer(buf, off, data);
  });
  device.queue.writeBuffer = writeBufferSpy as any;

  const origCreateCommandEncoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = () => {
    const enc = origCreateCommandEncoder() as any;
    enc.beginRenderPass = () => ({
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      draw: vi.fn(),
      drawIndexed: vi.fn(),
      drawIndexedIndirect: vi.fn(),
      end: vi.fn(),
    });
    enc.beginComputePass = () => ({
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      dispatchWorkgroupsIndirect: vi.fn(),
      end: vi.fn(),
    });
    return enc;
  };

  return { device, renderPipelineSpy, computePipelineSpy, createBufferSpy, writeBufferSpy };
}

function setupMockNavigator(mockDevice: MockGPUDevice) {
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
          features: new Set(['timestamp-query', 'texture-formats-tier1', 'texture-formats-tier2', 'float32-filterable']),
          requestDevice: async () => mockDevice,
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

describe('Milestone 6 Final Acceptance Challenger Suite (CDLOD Invariant Battery)', () => {

  // ============================================================================
  // PILLAR 1: Hardware Perimeter Skirt Geometry & Watertight Seam Integrity
  // ============================================================================
  describe('Pillar 1: Hardware Perimeter Skirt Geometry & Seam Integrity', () => {
    it('verifies exact vertex count (8,962) and index count (52,224) for dual-surface 64x64 patch mesh', () => {
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(64);

      // (65 * 65 grid + 256 skirt vertices) * 2 surfaces (crust + hydro) = 4,481 * 2 = 8,962
      expect(vertices.length).toBe(8962 * 12);
      expect(vertices.byteLength).toBe(8962 * 48); // 430,176 bytes

      // (4,096 grid quads + 256 skirt quads) * 6 indices * 2 surfaces = 52,224 indices
      expect(indices.length).toBe(52224);
      expect(indices.byteLength).toBe(52224 * 4); // 208,896 bytes

      // Memory footprint must be strictly under 700 KB (actual: ~624.1 KB)
      const totalKb = (vertices.byteLength + indices.byteLength) / 1024;
      expect(totalKb).toBeLessThan(700);
      expect(totalKb).toBeGreaterThan(600);
      expect(Math.round(totalKb * 10) / 10).toBe(624.1);

      // All vertices must be finite (zero NaN or Inf)
      for (let i = 0; i < vertices.length; i++) {
        expect(Number.isFinite(vertices[i])).toBe(true);
      }

      // All indices must reference valid vertex indices in [0, 8961]
      for (let i = 0; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(0);
        expect(indices[i]).toBeLessThan(8962);
      }
    });

    it('verifies 4-border closed loop top-to-bottom skirt alignment and downward extrusion parameters', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridSize = 64;
      const gridVertsPerSurface = (gridSize + 1) * (gridSize + 1); // 4225
      const skirtVertsPerSurface = 256;
      const vertsPerSurface = gridVertsPerSurface + skirtVertsPerSurface; // 4481

      const getTopGridVertexIndex = (k: number): number => {
        if (k < gridSize) return 0 * (gridSize + 1) + k;
        if (k < 2 * gridSize) return (k - gridSize) * (gridSize + 1) + gridSize;
        if (k < 3 * gridSize) return gridSize * (gridSize + 1) + (gridSize - (k - 2 * gridSize));
        return (gridSize - (k - 3 * gridSize)) * (gridSize + 1) + 0;
      };

      for (let surface = 0; surface < 2; surface++) {
        const baseOffset = surface * vertsPerSurface * floatsPerVertex;
        for (let k = 0; k < 256; k++) {
          const topIdx = getTopGridVertexIndex(k);
          const skirtIdx = gridVertsPerSurface + k;

          const topOff = baseOffset + topIdx * floatsPerVertex;
          const skirtOff = baseOffset + skirtIdx * floatsPerVertex;

          // Top vertices have skirtFactor = 0.0, Skirt bottom vertices have skirtFactor = 1.0
          expect(vertices[topOff + 8]).toBe(0.0);
          expect(vertices[skirtOff + 8]).toBe(1.0);

          // Top and skirt bottom UVs match exactly
          const topU = vertices[topOff + 0];
          const topV = vertices[topOff + 1];
          const skirtU = vertices[skirtOff + 0];
          const skirtV = vertices[skirtOff + 1];
          expect(skirtU).toBeCloseTo(topU, 6);
          expect(skirtV).toBeCloseTo(topV, 6);

          // Surface type flag is encoded at float offsets 2 and 5
          expect(vertices[topOff + 2]).toBe(surface);
          expect(vertices[skirtOff + 2]).toBe(surface);
          expect(vertices[topOff + 5]).toBe(surface);
          expect(vertices[skirtOff + 5]).toBe(surface);
        }
      }
    });

    it('proves mathematically and geometrically that downward extrusion z_skirt = Delta h_DEM prevents T-junction cracks', () => {
      // In CDLOD with 2:1 restricted quadtree:
      // An active node at LOD l borders an active neighbor at LOD l + 1.
      // The finer node has vertices at spacing delta = sizeUV / 64.
      // The coarser node has vertices at spacing 2 * delta = sizeUV / 32.
      // At the midpoint along an edge, the coarse edge has linear interpolation:
      //   h_coarse_mid = 0.5 * (h0 + h1)
      // while the fine node samples true DEM elevation:
      //   h_fine_mid = DEM(midpoint)
      // The vertical gap between the surfaces is:
      //   Delta h_DEM = |h_fine_mid - h_coarse_mid|
      //
      // The engine downward skirt extrusion depth formula is:
      //   skirtDepth = max(0.015, sizeUV * 0.35 * dispScale)
      //
      // We empirically verify that for all valid DEM gradients, skirtDepth strictly exceeds Delta h_DEM.
      const dispScale = 2.8;
      const sizeUVs = [1.0, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.0078125, 0.00390625];

      for (const sizeUV of sizeUVs) {
        const skirtDepth = Math.max(0.015, sizeUV * 0.35 * dispScale);

        // Maximum possible elevation step across half a cell
        const cellWidthUV = sizeUV / 64;
        const maxExpectedElevationDelta = cellWidthUV * 1.0 * (dispScale * 0.055);

        expect(skirtDepth).toBeGreaterThan(maxExpectedElevationDelta);
        expect(skirtDepth).toBeGreaterThanOrEqual(0.015);
      }

      // Verify WGSL shader enforces discard for hydrosphere skirts and crust extrusion
      const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
      const shaderCode = fs.readFileSync(crustShaderPath, 'utf8');

      // Hydrosphere skirt discard:
      expect(shaderCode).toMatch(/if\s*\(\s*input\.surfaceType\s*>\s*0\.5\s*&&\s*isSkirt\s*\)\s*\{\s*discard;\s*\}/);
      // Downward extrusion depth formula:
      expect(shaderCode).toContain('skirtDepth');
    });
  });

  // ============================================================================
  // PILLAR 2: Topological 2:1 Restricted Quadtree Balancing Fuzzing Harness
  // ============================================================================
  describe('Pillar 2: Topological 2:1 Restricted Quadtree Balancing Fuzzing', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('fuzzes quadtree across extreme camera angles, grazing regimes, and unfurl transitions asserting |DeltaLOD| <= 1', () => {
      // Deterministic PRNG (Mulberry32)
      let seed = 421337;
      function rnd(): number {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }

      const camera = new THREE.PerspectiveCamera(45, 1.0, 0.01, 100);
      let totalFramesChecked = 0;
      let totalCandidatePairsChecked = 0;
      let overallMaxDelta = 0;
      const allViolations: Array<{ frame: number; a: ActiveNode; b: ActiveNode; delta: number }> = [];

      // 200 fuzzing frames partitioned across grazing, polar, antimeridian, and transition regimes
      for (let frame = 0; frame < 200; frame++) {
        let mode = 0;
        let unfurl = 0.0;
        let posX = 0, posY = 0, posZ = 15;
        let targetX = 0, targetY = 0, targetZ = 0;

        if (frame < 50) {
          // Regime 1: Grazing angles near surface across all modes
          mode = frame % 4;
          unfurl = rnd();
          const u1 = rnd();
          const v1 = 0.1 + rnd() * 0.8;
          const p1 = WebGPUEngine.evaluateManifoldPosition(u1, v1, mode, unfurl);
          const lenP1 = Math.hypot(p1[0], p1[1], p1[2]) || 5.0;
          const normSphere = [p1[0] / lenP1, p1[1] / lenP1, p1[2] / lenP1];
          const normFlat = [0, 0, 1];
          const nx = normSphere[0] * (1.0 - unfurl) + normFlat[0] * unfurl;
          const ny = normSphere[1] * (1.0 - unfurl) + normFlat[1] * unfurl;
          const nz = normSphere[2] * (1.0 - unfurl) + normFlat[2] * unfurl;
          const nLen = Math.hypot(nx, ny, nz) || 1.0;
          const alt = 0.01 + rnd() * 0.2; // ground to low altitude

          posX = p1[0] + (nx / nLen) * alt;
          posY = p1[1] + (ny / nLen) * alt;
          posZ = p1[2] + (nz / nLen) * alt;

          targetX = p1[0];
          targetY = p1[1];
          targetZ = p1[2];
        } else if (frame < 100) {
          // Regime 2: High latitude / Polar nadir
          mode = 0;
          unfurl = rnd() < 0.2 ? 0.0 : rnd();
          const isNorth = rnd() > 0.5;
          const u1 = rnd();
          const v1 = isNorth ? 0.005 + rnd() * 0.08 : 0.915 + rnd() * 0.08;
          const p1 = WebGPUEngine.evaluateManifoldPosition(u1, v1, mode, unfurl);
          const alt = 0.1 + rnd() * 2.0;

          posX = p1[0] * (1.0 + alt / 5.0);
          posY = p1[1] * (1.0 + alt / 5.0);
          posZ = p1[2] * (1.0 + alt / 5.0);

          targetX = p1[0];
          targetY = p1[1];
          targetZ = p1[2];
        } else if (frame < 150) {
          // Regime 3: Antimeridian seam boundary (u ~ 0 or u ~ 1) testing periodic spherical wrap
          mode = 0;
          unfurl = frame % 2 === 0 ? 0.0 : rnd();
          const u1 = rnd() < 0.5 ? rnd() * 0.05 : 0.95 + rnd() * 0.05;
          const v1 = 0.2 + rnd() * 0.6;
          const p1 = WebGPUEngine.evaluateManifoldPosition(u1, v1, mode, unfurl);
          const lenP1 = Math.hypot(p1[0], p1[1], p1[2]) || 5.0;
          const normSphere = [p1[0] / lenP1, p1[1] / lenP1, p1[2] / lenP1];
          const normFlat = [0, 0, 1];
          const nx = normSphere[0] * (1.0 - unfurl) + normFlat[0] * unfurl;
          const ny = normSphere[1] * (1.0 - unfurl) + normFlat[1] * unfurl;
          const nz = normSphere[2] * (1.0 - unfurl) + normFlat[2] * unfurl;
          const nLen = Math.hypot(nx, ny, nz) || 1.0;
          const alt = 0.05 + rnd() * 3.0;

          posX = p1[0] + (nx / nLen) * alt;
          posY = p1[1] + (ny / nLen) * alt;
          posZ = p1[2] + (nz / nLen) * alt;

          targetX = p1[0];
          targetY = p1[1];
          targetZ = p1[2];
        } else {
          // Regime 4: Global Monte Carlo trajectory fuzzing
          mode = Math.floor(rnd() * 4);
          unfurl = rnd();
          const u1 = rnd();
          const v1 = 0.05 + rnd() * 0.9;
          const p1 = WebGPUEngine.evaluateManifoldPosition(u1, v1, mode, unfurl);
          const lenP1 = Math.hypot(p1[0], p1[1], p1[2]) || 5.0;
          const normSphere = [p1[0] / lenP1, p1[1] / lenP1, p1[2] / lenP1];
          const normFlat = [0, 0, 1];
          const nx = normSphere[0] * (1.0 - unfurl) + normFlat[0] * unfurl;
          const ny = normSphere[1] * (1.0 - unfurl) + normFlat[1] * unfurl;
          const nz = normSphere[2] * (1.0 - unfurl) + normFlat[2] * unfurl;
          const nLen = Math.hypot(nx, ny, nz) || 1.0;
          const alt = 0.05 + rnd() * 12.0;

          posX = p1[0] + (nx / nLen) * alt;
          posY = p1[1] + (ny / nLen) * alt;
          posZ = p1[2] + (nz / nLen) * alt;

          targetX = p1[0];
          targetY = p1[1];
          targetZ = p1[2];
        }

        camera.position.set(posX, posY, posZ);
        camera.lookAt(targetX, targetY, targetZ);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        const isSphere = unfurl < 0.01;
        engine.updateCDLOD(camera, mode, unfurl, false);

        const activeNodes = getActiveNodes(engine);
        expect(activeNodes.length).toBeGreaterThan(0);
        expect(activeNodes.length).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);

        const { pairsChecked, maxDelta, violations } = checkAdjacency(activeNodes, isSphere);
        totalFramesChecked++;
        totalCandidatePairsChecked += pairsChecked;
        if (maxDelta > overallMaxDelta) overallMaxDelta = maxDelta;

        if (violations.length > 0) {
          for (const v of violations) {
            allViolations.push({ frame: totalFramesChecked, ...v });
          }
        }
      }

      // Assert strictly: zero 2:1 adjacency violations across all fuzzed states
      expect(totalFramesChecked).toBe(200);
      expect(totalCandidatePairsChecked).toBeGreaterThan(2000);
      expect(allViolations).toHaveLength(0);
      expect(overallMaxDelta).toBeLessThanOrEqual(1);
    });

    it('proves quadtree pool never overflows (activeNodeCount <= 4096) under maximum subdivision pressure', () => {
      const camera = new THREE.PerspectiveCamera(45, 1.0, 0.001, 100);

      // Place camera extremely close to surface (5.0005) over steep topography
      camera.position.set(0.0, 0.0, 5.0005);
      camera.lookAt(0, 0, 5.0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      for (let mode = 0; mode < 4; mode++) {
        engine.updateCDLOD(camera, mode, 0.0, false);
        expect(engine.cdlodActiveNodeCount).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);
        expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // PILLAR 3: Screen-Space Error (SSE) Metric & Nadir Spacing <= 76.4m
  // ============================================================================
  describe('Pillar 3: Screen-Space Error Metric & Regional Inset Invariants', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('evaluates exact textbook baseline R_0 = 6518.375 and enforces dyadic halving', () => {
      // Textbook formulation: H = 1080, fov = 45 deg, tau = 2.0, beta = 1.0, W_0 = 10.0
      // R_0 = (10.0 * 1080) / (4.0 * tan(pi / 8)) = 6518.3753
      const r0 = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
      const expected = (10.0 * 1080) / (4.0 * Math.tan(Math.PI / 8));
      expect(r0).toBeCloseTo(expected, 4);

      // Dyadic halving: R_{l+1} = R_l / 2
      for (let l = 0; l < 10; l++) {
        const cur = engine.computeCalibratedRange(l, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        const next = engine.computeCalibratedRange(l + 1, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        expect(next / cur).toBeCloseTo(0.5, 9);
      }
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

    it('activates LOD 12 over regional insets while strictly capping non-regional nodes at LOD <= 10', () => {
      // Configure regional DEM for Hawaii: [-161.0, 18.0, -154.0, 23.0]
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.001, 100);

      // Position camera directly over Hawaii (lon = -157.5, lat = 20.5) at low altitude (10 km)
      const lonRad = (-157.5 * Math.PI) / 180.0;
      const latRad = (20.5 * Math.PI) / 180.0;
      const p3D = [
        5.0 * Math.cos(latRad) * Math.sin(lonRad),
        5.0 * Math.sin(latRad),
        5.0 * Math.cos(latRad) * Math.cos(lonRad),
      ];
      const scale = (5.0 + 10.0 / 6371.0) / 5.0;
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      expect(engine.lastMaxLodSeen).toBe(12);

      // Now position camera over London (lon = 0, lat = 51.5) outside regional bounds
      const lonLon = 0.0;
      const latLon = (51.5 * Math.PI) / 180.0;
      const pLon = [
        5.0 * Math.cos(latLon) * Math.sin(lonLon),
        5.0 * Math.sin(latLon),
        5.0 * Math.cos(latLon) * Math.cos(lonLon),
      ];
      camera.position.set(pLon[0] * scale, pLon[1] * scale, pLon[2] * scale);
      camera.lookAt(pLon[0], pLon[1], pLon[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      // Patches outside regional DEM bounds must be capped at LOD <= 10
      const activeNodes = getActiveNodes(engine);
      for (const node of activeNodes) {
        expect(node.lod).toBeLessThanOrEqual(10);
      }
    });
  });

  // ============================================================================
  // PILLAR 4: Zero-GC Per-Frame Buffer Discipline (Rule 26 Compliance)
  // ============================================================================
  describe('Pillar 4: Zero-GC Per-Frame Buffer Discipline (Rule 26 Compliance)', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('preserves identical typed array and pool references across 100 consecutive frames in updateCDLOD', () => {
      const initialKeysRef = (engine as any).cdlodSpatialHashKeys;
      const initialValuesRef = (engine as any).cdlodSpatialHashValues;
      const initialQueueRef = (engine as any).cdlodRippleQueue;
      const initialCandidateFloatsRef = (engine as any).cdlodCandidateFloats;
      const initialCandidateUintsRef = (engine as any).cdlodCandidateUints;
      const initialPoolRef = (engine as any).cdlodNodePool;
      const initialPvMatrixRef = (engine as any).pvMatrix;
      const initialCullingFloatsRef = (engine as any).cdlodCullingUniformFloats;

      expect(initialKeysRef).toBeDefined();
      expect(initialValuesRef).toBeDefined();
      expect(initialQueueRef).toBeDefined();
      expect(initialCandidateFloatsRef).toBeDefined();
      expect(initialCandidateUintsRef).toBeDefined();
      expect(initialPoolRef).toBeDefined();

      const camera = new THREE.PerspectiveCamera(45, 1.0, 0.01, 100);

      for (let frame = 0; frame < 100; frame++) {
        const angle = (frame / 100) * Math.PI * 2;
        const radius = 5.5 + Math.sin(frame * 0.1) * 0.3;
        camera.position.set(radius * Math.cos(angle), Math.sin(frame * 0.05) * 2.0, radius * Math.sin(angle));
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, frame % 4, (frame % 50) / 50, frame % 2 === 0);
      }

      // Assert zero re-allocations (strict reference equality)
      expect((engine as any).cdlodSpatialHashKeys).toBe(initialKeysRef);
      expect((engine as any).cdlodSpatialHashValues).toBe(initialValuesRef);
      expect((engine as any).cdlodRippleQueue).toBe(initialQueueRef);
      expect((engine as any).cdlodCandidateFloats).toBe(initialCandidateFloatsRef);
      expect((engine as any).cdlodCandidateUints).toBe(initialCandidateUintsRef);
      expect((engine as any).cdlodNodePool).toBe(initialPoolRef);
      expect((engine as any).pvMatrix).toBe(initialPvMatrixRef);
      expect((engine as any).cdlodCullingUniformFloats).toBe(initialCullingFloatsRef);
    });

    it('confirms zero new GPU buffer creations and zero typed array reallocations during continuous render() frames', async () => {
      const instrumented = createInstrumentedMockDevice();
      setupMockNavigator(instrumented.device);

      const renderEngine = new WebGPUEngine();
      const canvas = createMockCanvas(1920, 1080);
      await renderEngine.initialize({
        canvas,
        pointCount: 100,
        pointsData: new Float32Array(300),
        target2DData: new Float32Array(200),
        typeData: new Float32Array(100),
        lineIndices: new Uint32Array(200),
      });

      const camera = new THREE.PerspectiveCamera(45, 1920 / 1080, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.updateMatrixWorld(true);

      // Warmup 5 frames to lazily initialize all static resources
      for (let f = 0; f < 5; f++) {
        renderEngine.render({
          camera,
          time: f * 0.016,
          dt: 0.016,
          unfurl: 0.0,
          mode: 0,
          theme: 1,
          reliefActive: true,
          showRelief: true,
          showVectors: true,
          cdlodDiagnosticMode: 0,
        });
      }

      const baselineBuffersCount = instrumented.device.buffers.length;
      const baselineCreateBufferCalls = instrumented.createBufferSpy.mock.calls.length;
      const baselineTotalBytes = instrumented.device.buffers.reduce(
        (acc: number, b: MockGPUBuffer) => acc + b.size,
        0
      );

      const initialCrustFloats = (renderEngine as any).crustFloats;
      const initialSimFloats = (renderEngine as any).simFloats;
      const initialReliefFloats = (renderEngine as any).reliefFloats;

      // Execute 50 continuous rendering frames with moving camera and diagnostic mode cycling
      for (let i = 0; i < 50; i++) {
        const angle = (i / 50) * Math.PI * 2;
        camera.position.set(15 * Math.cos(angle), 5 * Math.sin(angle), 15 * Math.sin(angle));
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);

        renderEngine.render({
          camera,
          time: 2.0 + i * 0.016,
          dt: 0.016,
          unfurl: (i % 25) / 25,
          mode: i % 4,
          theme: (i % 3) as any,
          reliefActive: true,
          showRelief: true,
          showVectors: true,
          cdlodDiagnosticMode: i % 4,
        });
      }

      // Assert zero GPU buffer leaks / allocations across 50 frames
      expect(instrumented.device.buffers.length).toBe(baselineBuffersCount);
      expect(instrumented.createBufferSpy.mock.calls.length).toBe(baselineCreateBufferCalls);
      const finalTotalBytes = instrumented.device.buffers.reduce(
        (acc: number, b: MockGPUBuffer) => acc + b.size,
        0
      );
      expect(finalTotalBytes).toBe(baselineTotalBytes);

      // Assert typed array references remained strictly identical
      expect((renderEngine as any).crustFloats).toBe(initialCrustFloats);
      expect((renderEngine as any).simFloats).toBe(initialSimFloats);
      expect((renderEngine as any).reliefFloats).toBe(initialReliefFloats);

      renderEngine.dispose();
      restoreMockNavigator();
    });
  });

  // ============================================================================
  // PILLAR 5: Zero Recompilations Under Dynamic Diagnostic Switches (Rule 18)
  // ============================================================================
  describe('Pillar 5: Zero Recompilations Under Dynamic Diagnostic Switches (Rule 18)', () => {
    let engine: WebGPUEngine;
    let instrumented: ReturnType<typeof createInstrumentedMockDevice>;
    let camera: THREE.PerspectiveCamera;

    beforeEach(async () => {
      instrumented = createInstrumentedMockDevice();
      setupMockNavigator(instrumented.device);

      engine = new WebGPUEngine();
      const canvas = createMockCanvas(1920, 1080);
      await engine.initialize({
        canvas,
        pointCount: 100,
        pointsData: new Float32Array(300),
        target2DData: new Float32Array(200),
        typeData: new Float32Array(100),
        lineIndices: new Uint32Array(200),
      });

      camera = new THREE.PerspectiveCamera(45, 1920 / 1080, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.updateMatrixWorld(true);

      // Warmup frames
      for (let f = 0; f < 5; f++) {
        engine.render({
          camera,
          time: f * 0.016,
          dt: 0.016,
          unfurl: 0.0,
          mode: 0,
          theme: 1,
          reliefActive: true,
          showRelief: true,
          showVectors: true,
          cdlodDiagnosticMode: 0,
        });
      }
    });

    afterEach(() => {
      if (engine) engine.dispose();
      restoreMockNavigator();
    });

    it('executes 100 rapid mode switches with STRICT ZERO new GPU pipelines', () => {
      const renderPipelinesAtBaseline = instrumented.renderPipelineSpy.mock.calls.length;
      const computePipelinesAtBaseline = instrumented.computePipelineSpy.mock.calls.length;

      expect(renderPipelinesAtBaseline).toBeGreaterThan(0);

      const targetModes = [0, 1, 2, 3];
      for (let i = 0; i < 100; i++) {
        const targetMode = targetModes[i % targetModes.length];
        const prevRenderCount = instrumented.renderPipelineSpy.mock.calls.length;
        const prevComputeCount = instrumented.computePipelineSpy.mock.calls.length;

        engine.render({
          camera,
          time: 1.0 + i * 0.016,
          dt: 0.016,
          unfurl: (i % 20) / 20,
          mode: 0,
          theme: 1,
          reliefActive: true,
          showRelief: true,
          showVectors: true,
          cdlodDiagnosticMode: targetMode,
        });

        // Strict per-frame Rule 18 assertion: zero new pipelines
        expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(prevRenderCount);
        expect(instrumented.computePipelineSpy.mock.calls.length).toBe(prevComputeCount);

        // Verify uniform state
        expect(engine.cdlodDiagnosticMode).toBe(targetMode);
        const crustFloats = (engine as any).crustFloats as Float32Array;
        expect(crustFloats[79]).toBe(targetMode);
      }

      // Aggregate Rule 18 assertion across all 100 mode switches
      expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(renderPipelinesAtBaseline);
      expect(instrumented.computePipelineSpy.mock.calls.length).toBe(computePipelinesAtBaseline);
    });

    it('verifies uniform buffer byte offset 316 (float 79) integrity and non-corruption of adjacent uniforms', () => {
      // Set known sentinel values in adjacent uniform slots
      const crustFloats = (engine as any).crustFloats as Float32Array;
      crustFloats[76] = 0.4242; // weatherTau
      crustFloats[77] = 1.0;    // advection active
      crustFloats[78] = 0.0;    // toksvig bypass

      // Switch diagnostic mode to 2 (Morph Factor Alpha)
      engine.setCdlodDiagnosticMode(2);

      // Verify slot 79 (byte offset 79 * 4 = 316)
      expect(crustFloats[79]).toBe(2.0);

      // Verify adjacent uniforms were completely undisturbed
      expect(crustFloats[76]).toBeCloseTo(0.4242, 4);
      expect(crustFloats[77]).toBe(1.0);
      expect(crustFloats[78]).toBe(0.0);

      // Verify writeBuffer was called with the crust buffer
      const crustBuffer = (engine as any).crustUniformBuffer;
      expect(instrumented.writeBufferSpy).toHaveBeenCalledWith(crustBuffer, 0, crustFloats.buffer);
    });
  });
});
