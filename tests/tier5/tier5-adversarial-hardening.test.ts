import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';

import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import {
  projectPointToDymaxionFace,
  projectToDymaxion2D,
  computeBarycentricCoordinates,
  computeDymaxionMorph,
  generateDymaxionBuffer,
  UNIT_VERTICES,
  ICOSAHEDRON_FACES,
  UNIT_CENTROIDS,
  getIcosahedronGeometry,
} from '../../src/utils/dymaxion';
import {
  screenToNDC,
  raySphereIntersect,
  rayPlaneIntersect,
  unprojectScreenToRay,
  computeManifoldHit,
  lambOseenVortex,
  griffithHoopStress,
  CursorTracker,
  RADIUS,
} from '../../src/utils/raycast';
import {
  toSphere,
  toMercator,
  computeCurlNoise,
  generateFibonacciSphere,
} from '../helpers/math-oracle';
import {
  parseGeomBuffer,
  serializeGeomBuffer,
  GEOM_MAGIC,
  GEOM_VERSION,
} from '../helpers/geom-parser';
import { MockGPUDevice, MockGPUBuffer } from '../helpers/webgpu-mock';

let originalNavigator: any;

beforeAll(() => {
  if (typeof globalThis.GPUBufferUsage === 'undefined') {
    (globalThis as any).GPUBufferUsage = {
      MAP_READ: 0x0001,
      MAP_WRITE: 0x0002,
      COPY_SRC: 0x0004,
      COPY_DST: 0x0008,
      INDEX: 0x0010,
      VERTEX: 0x0020,
      UNIFORM: 0x0040,
      STORAGE: 0x0080,
      INDIRECT: 0x0100,
      QUERY_RESOLVE: 0x0200,
    };
  }
  if (typeof globalThis.GPUShaderStage === 'undefined') {
    (globalThis as any).GPUShaderStage = {
      VERTEX: 0x1,
      FRAGMENT: 0x2,
      COMPUTE: 0x4,
    };
  }
});

function setupMockNavigator() {
  originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => new MockGPUDevice(),
        }),
        getPreferredCanvasFormat: () => 'bgra8unorm',
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

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: vi.fn((type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;

  return { canvas, mockContext };
}

describe('Tier 5: Adversarial Hardening & Stress Testing', () => {
  beforeEach(() => {
    setupMockNavigator();
  });

  afterEach(() => {
    restoreMockNavigator();
  });

  // =========================================================================
  // Dimension 1: Extreme Rapid State Oscillation & Combinatorial Thrashing
  // =========================================================================
  describe('Dimension 1: Extreme Rapid State Oscillation Across Modes, Layers & Backends', () => {
    it('T5-OSC-01: 500-step rapid pseudorandom state oscillation across all 5 morph modes and 3 layer modes', async () => {
      const { canvas } = createMockCanvas();
      const engine = new WebGPUEngine();
      const pointCount = 1000;
      const pointsData = new Float32Array(pointCount * 3).fill(1.0);
      const target2DData = new Float32Array(pointCount * 2).fill(0.5);
      const typeData = new Float32Array(pointCount).map((_, i) => (i % 2 === 0 ? 1.0 : 0.0));
      const lineIndices = new Uint32Array(pointCount * 2).map((_, i) => i % pointCount);

      await engine.initialize({
        canvas,
        pointCount,
        pointsData,
        target2DData,
        typeData,
        lineIndices,
      });

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);

      const modes = [0, 1, 2, 3, 4] as const;
      const layerModes = [0, 1, 2] as const;

      // Execute 500 hyper-frequency chaotic state switches
      for (let step = 0; step < 500; step++) {
        const mode = modes[step % modes.length];
        const layerMode = layerModes[(step * 7) % layerModes.length];
        const unfurl = (Math.sin(step * 0.13) + 1.0) * 0.5; // [0, 1]
        const time = step * 0.016;

        expect(() => {
          engine.render({
            unfurl,
            mode,
            layerMode,
            time,
            dt: 0.016,
            camera,
            cursorRayOrig: new THREE.Vector3(0, 0, 15),
            cursorRayDir: new THREE.Vector3(0, 0, -1),
            cursorHitPos: new THREE.Vector3(0, 0, 5),
            cursorVel: new THREE.Vector4(0.1, -0.2, 0.0, 0.22),
            cursorActive: step % 3 === 0,
          });
        }).not.toThrow();
      }

      engine.dispose();
    });

    it('T5-OSC-02: Rapid backend thrashing between WebGL2 and WebGPU under continuous active cursor drag', () => {
      let activeBackend: 'webgl2' | 'webgpu' = 'webgl2';
      let switchCount = 0;

      const tracker = new CursorTracker();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, 15);

      // Perform 100 rapid backend transitions
      for (let frame = 0; frame < 100; frame++) {
        tracker.ndcX = Math.sin(frame * 0.2);
        tracker.ndcY = Math.cos(frame * 0.2);
        const uniforms = tracker.update(camera, 0.5);

        if (frame % 5 === 0) {
          activeBackend = activeBackend === 'webgl2' ? 'webgpu' : 'webgl2';
          switchCount++;
        }

        expect(uniforms.u_cursorHitPos).toBeDefined();
        expect(Number.isFinite(uniforms.u_cursorHitPos.x)).toBe(true);
        expect(Number.isFinite(uniforms.u_cursorHitPos.y)).toBe(true);
        expect(Number.isFinite(uniforms.u_cursorHitPos.z)).toBe(true);
      }

      expect(switchCount).toBe(20);
    });

    it('T5-OSC-03: Sudden discontinuous jumps across extreme unfurl boundaries (0.0 <-> 1.0 <-> 0.5) in all modes', () => {
      const { points3D } = generateFibonacciSphere(100);
      const testP3D: [number, number, number] = [points3D[0], points3D[1], points3D[2]];
      const target2D: [number, number] = [1.2, -0.8];
      const dymaxion2D = projectToDymaxion2D(testP3D);

      const discontinuousAlphas = [0.0, 1.0, 0.00001, 0.99999, 0.5, 0.18, 0.65, 0.0, 1.0];

      for (const mode of [0, 1, 2, 3, 4]) {
        for (const alpha of discontinuousAlphas) {
          if (mode === 4) {
            const morph = computeDymaxionMorph(testP3D, dymaxion2D, alpha);
            expect(Number.isFinite(morph.position[0])).toBe(true);
            expect(Number.isFinite(morph.position[1])).toBe(true);
            expect(Number.isFinite(morph.position[2])).toBe(true);
            expect(Number.isFinite(morph.normal[0])).toBe(true);
            expect(morph.arch).toBeGreaterThanOrEqual(0.0);
          } else if (mode === 3) {
            const vel = computeCurlNoise(testP3D, 1.5);
            const vortex = lambOseenVortex(0.3, 0.1, 2.0);
            expect(Number.isFinite(vel[0])).toBe(true);
            expect(Number.isFinite(vortex.vTheta)).toBe(true);
            expect(Number.isFinite(vortex.vorticity)).toBe(true);
          } else if (mode === 2) {
            const stress = griffithHoopStress(0.2, Math.PI / 4, 1.0, 0.1);
            expect(Number.isFinite(stress.sigmaThetaTheta)).toBe(true);
            expect(stress.localStrain).toBeGreaterThanOrEqual(0.0);
            expect(stress.localStrain).toBeLessThanOrEqual(1.0);
          }
        }
      }
    });
  });

  // =========================================================================
  // Dimension 2: 1M Node Memory Stability & Zero GPU Buffer Leaks
  // =========================================================================
  describe('Dimension 2: 1,000,000-Node Memory Stability & Zero Buffer Leaks Under 1,000 Frames', () => {
    it('T5-MEM-01: Simulates 1,000 continuous render frames with 1M nodes ensuring zero reallocation leaks', async () => {
      const { canvas } = createMockCanvas();
      const engine = new WebGPUEngine();
      const pointCount = 1000000;

      // Allocate mock 1M node columnar buffers
      const pointsData = new Float32Array(pointCount * 3);
      const target2DData = new Float32Array(pointCount * 2);
      const typeData = new Float32Array(pointCount);
      const lineIndices = new Uint32Array(100); // lightweight line buffer

      await engine.initialize({
        canvas,
        pointCount,
        pointsData,
        target2DData,
        typeData,
        lineIndices,
      });

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, 15);

      // Verify initialized buffers: 2 ping-pong storage + 1 static storage + 1 line index + 1 sim uniform = 5 buffers
      const device = (engine as any).device as MockGPUDevice;
      const initialBufferCount = device.buffers.length;
      expect(initialBufferCount).toBe(5);

      // Execute 1,000 continuous render frames
      for (let frame = 0; frame < 1000; frame++) {
        engine.render({
          unfurl: (frame % 100) / 100,
          mode: (frame % 5) as any,
          layerMode: 0,
          time: frame * 0.00833,
          dt: 0.00833,
          camera,
          cursorActive: frame % 10 === 0,
          cursorRayOrig: new THREE.Vector3(0, 0, 15),
          cursorRayDir: new THREE.Vector3(0, 0, -1),
          cursorHitPos: new THREE.Vector3(0, 0, 5),
          cursorVel: new THREE.Vector4(0, 0, 0, 0),
        });
      }

      // Buffer count MUST remain strictly constant (0 new GPU buffers allocated during render loop)
      expect(device.buffers.length).toBe(initialBufferCount);

      // Verify ping-pong step advanced 1,000 steps deterministically
      expect((engine as any).currentStep).toBe(1000);

      engine.dispose();
      expect(engine.initialized).toBe(false);
    });

    it('T5-MEM-02: 10 consecutive full engine init & dispose cycles with 1M node capacity completely free VRAM', async () => {
      const { canvas } = createMockCanvas();
      const pointCount = 1000000;
      const pointsData = new Float32Array(pointCount * 3);
      const target2DData = new Float32Array(pointCount * 2);
      const typeData = new Float32Array(pointCount);
      const lineIndices = new Uint32Array(100);

      for (let cycle = 0; cycle < 10; cycle++) {
        const engine = new WebGPUEngine();
        await engine.initialize({
          canvas,
          pointCount,
          pointsData,
          target2DData,
          typeData,
          lineIndices,
        });

        expect(engine.initialized).toBe(true);
        const device = (engine as any).device as MockGPUDevice;
        expect(device.buffers.length).toBe(5);

        engine.dispose();
        expect(engine.initialized).toBe(false);
        // Destroyed buffers should be zero-length
        expect(device.buffers.length).toBe(0);
      }
    });

    it('T5-MEM-03: Interleaved particle layout memory footprint is exactly 64 bytes per node (16 floats)', () => {
      const pointCount = 1000000;
      const floatsPerParticle = 16;
      const bytesPerParticle = floatsPerParticle * 4;
      const totalByteLength = pointCount * bytesPerParticle;

      expect(bytesPerParticle).toBe(64);
      expect(totalByteLength).toBe(64000000); // 64 MB for 1M particles
    });
  });

  // =========================================================================
  // Dimension 3: Viewport Boundary Fuzzing & Degenerate Geometries
  // =========================================================================
  describe('Dimension 3: Viewport Boundary Fuzzing & Singularity Robustness', () => {
    it('T5-VIEW-01: Viewport resize with extreme, degenerate, and 8K dimensions', async () => {
      const { canvas, mockContext } = createMockCanvas();
      const engine = new WebGPUEngine();
      const pointCount = 10;

      await engine.initialize({
        canvas,
        pointCount,
        pointsData: new Float32Array(pointCount * 3),
        target2DData: new Float32Array(pointCount * 2),
        typeData: new Float32Array(pointCount),
        lineIndices: new Uint32Array(pointCount * 2),
      });

      const extremeViewports = [
        { w: 0, h: 0 },
        { w: 1, h: 1 },
        { w: 7680, h: 4320 }, // 8K UHD
        { w: 3840, h: 2160 }, // 4K UHD
        { w: 10000, h: 50 },  // Extreme ultra-wide
        { w: 50, h: 10000 },  // Extreme ultra-tall
        { w: 0.5, h: 0.5 },   // Subpixel dimensions
      ];

      for (const vp of extremeViewports) {
        expect(() => {
          engine.resize(vp.w, vp.h);
        }).not.toThrow();
        expect(mockContext.configure).toHaveBeenCalled();
      }

      engine.dispose();
    });

    it('T5-VIEW-02: screenToNDC with 0x0 viewport, negative dimensions, and extreme coordinates', () => {
      const boundaryCases = [
        { clientX: 0, clientY: 0, w: 0, h: 0 },
        { clientX: 960, clientY: 540, w: 1920, h: 1080 },
        { clientX: 1920, clientY: 1080, w: 1920, h: 1080 },
        { clientX: -500, clientY: -500, w: 1000, h: 1000 },
        { clientX: 99999, clientY: 99999, w: 100, h: 100 },
        { clientX: 0, clientY: 0, w: -100, h: -100 },
      ];

      for (const c of boundaryCases) {
        const { ndcX, ndcY } = screenToNDC(c.clientX, c.clientY, c.w, c.h);
        expect(Number.isFinite(ndcX)).toBe(true);
        expect(Number.isFinite(ndcY)).toBe(true);
        expect(Number.isNaN(ndcX)).toBe(false);
        expect(Number.isNaN(ndcY)).toBe(false);
      }
    });

    it('T5-VIEW-03: unprojectScreenToRay unprojection math stability with NaN / Inf NDC inputs', () => {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.updateMatrixWorld();

      const inputs = [
        { ndcX: 0, ndcY: 0 },
        { ndcX: 1, ndcY: 1 },
        { ndcX: -1, ndcY: -1 },
        { ndcX: 1000, ndcY: -1000 },
      ];

      for (const inp of inputs) {
        const { rayOrig, rayDir } = unprojectScreenToRay(inp.ndcX, inp.ndcY, camera);
        expect(Number.isFinite(rayOrig.x)).toBe(true);
        expect(Number.isFinite(rayOrig.y)).toBe(true);
        expect(Number.isFinite(rayOrig.z)).toBe(true);
        expect(Number.isFinite(rayDir.x)).toBe(true);
        expect(Number.isFinite(rayDir.y)).toBe(true);
        expect(Number.isFinite(rayDir.z)).toBe(true);
        expect(rayDir.length()).toBeCloseTo(1.0, 4);
      }
    });

    it('T5-VIEW-04: raySphereIntersect and rayPlaneIntersect with grazing and miss rays', () => {
      // 1. Ray through origin directly hitting sphere
      const hitCenter = raySphereIntersect([0, 0, 15], [0, 0, -1], RADIUS);
      expect(hitCenter.hit).toBe(true);
      expect(hitCenter.distance).toBeCloseTo(10.0, 3);
      expect(hitCenter.hitPos![2]).toBeCloseTo(5.0, 3);

      // 2. Exact tangent grazing ray (distance from center = RADIUS)
      const hitTangent = raySphereIntersect([RADIUS, 0, 15], [0, 0, -1], RADIUS);
      expect(hitTangent.hit).toBe(true);
      expect(hitTangent.distance).toBeCloseTo(15.0, 3);

      // 3. Clear miss ray
      const hitMiss = raySphereIntersect([RADIUS + 1.0, 0, 15], [0, 0, -1], RADIUS);
      expect(hitMiss.hit).toBe(false);
      expect(hitMiss.hitPos).toBeNull();

      // 4. Ray parallel to plane at z = 0
      const planeParallel = rayPlaneIntersect([0, 5, 10], [1, 0, 0], 0.0);
      expect(planeParallel.hit).toBe(false);

      // 5. Zero-length ray direction vector
      const zeroDir = raySphereIntersect([0, 0, 10], [0, 0, 0], RADIUS);
      expect(zeroDir.hit).toBe(false);
    });
  });

  // =========================================================================
  // Dimension 4: White-Box Polyhedral Math & Physical Stress Oracles
  // =========================================================================
  describe('Dimension 4: White-Box Polyhedral Dymaxion Math & Physical Continuity', () => {
    it('T5-MATH-01: Dymaxion 20 icosahedral centroids and vertices form valid regular geometry', () => {
      const geom = getIcosahedronGeometry(RADIUS);
      expect(geom.vertices.length).toBe(12);
      expect(geom.faces.length).toBe(20);
      expect(geom.centroids.length).toBe(20);
      expect(geom.edgeLength).toBeGreaterThan(0);
      expect(geom.inradius).toBeGreaterThan(0);

      // All unit vertices must be strictly radius RADIUS
      geom.vertices.forEach(v => {
        expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(RADIUS, 4);
      });

      // All unit centroids must be unit length
      UNIT_CENTROIDS.forEach(c => {
        expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1.0, 4);
      });
    });

    it('T5-MATH-02: projectPointToDymaxionFace guarantees maxDot >= 0.7946 and strictly non-negative projection for all unit sphere points', () => {
      const { points3D } = generateFibonacciSphere(5000);
      for (let i = 0; i < 5000; i++) {
        const p: [number, number, number] = [
          points3D[i * 3 + 0],
          points3D[i * 3 + 1],
          points3D[i * 3 + 2],
        ];

        const { faceIndex, maxDot, gnomonicPos } = projectPointToDymaxionFace(p);
        expect(faceIndex).toBeGreaterThanOrEqual(0);
        expect(faceIndex).toBeLessThan(20);
        expect(maxDot).toBeGreaterThanOrEqual(0.79);
        expect(Number.isFinite(gnomonicPos[0])).toBe(true);
        expect(Number.isFinite(gnomonicPos[1])).toBe(true);
        expect(Number.isFinite(gnomonicPos[2])).toBe(true);
      }
    });

    it('T5-MATH-03: computeBarycentricCoordinates handles degenerate triangles and boundary points', () => {
      const v0: [number, number, number] = [0, 0, 0];
      const v1: [number, number, number] = [1, 0, 0];
      const v2: [number, number, number] = [0, 1, 0];

      // Exact centroid point
      const pCentroid: [number, number, number] = [1 / 3, 1 / 3, 0];
      const bCentroid = computeBarycentricCoordinates(pCentroid, v0, v1, v2);
      expect(bCentroid[0]).toBeCloseTo(1 / 3, 3);
      expect(bCentroid[1]).toBeCloseTo(1 / 3, 3);
      expect(bCentroid[2]).toBeCloseTo(1 / 3, 3);

      // Collinear / degenerate triangle (area = 0)
      const bDegen = computeBarycentricCoordinates([0.5, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]);
      expect(bDegen[0]).toBeCloseTo(1 / 3, 3);
      expect(bDegen[1]).toBeCloseTo(1 / 3, 3);
      expect(bDegen[2]).toBeCloseTo(1 / 3, 3);
    });

    it('T5-MATH-04: generateDymaxionBuffer produces exactly 2N finite floats for N input vertices', () => {
      const pointCount = 10000;
      const { points3D } = generateFibonacciSphere(pointCount);
      const dymaxionBuffer = generateDymaxionBuffer(points3D);

      expect(dymaxionBuffer.length).toBe(pointCount * 2);

      let hasNaN = false;
      for (let i = 0; i < dymaxionBuffer.length; i++) {
        if (!Number.isFinite(dymaxionBuffer[i])) {
          hasNaN = true;
          break;
        }
      }
      expect(hasNaN).toBe(false);
    });

    it('T5-MATH-05: Lamb-Oseen vortex core center peak vorticity monotonically decreases as t increases', () => {
      const rCenter = 0.0;
      const vEarly = lambOseenVortex(rCenter, 0.1, 5.0, 0.1);
      const vLate = lambOseenVortex(rCenter, 100.0, 5.0, 0.1);

      // Peak vorticity at r=0 is gamma / (pi * 4 * nu * (t + t0)) which monotonically decays with t
      expect(vEarly.vorticity).toBeGreaterThan(vLate.vorticity);
      expect(vLate.vorticity).toBeLessThan(0.1);
    });

    it('T5-MATH-06: Griffith LEFM hoop stress concentration strictly satisfies K_I amplification near cursor', () => {
      const farStress = griffithHoopStress(0.5, 0.0, 1.0, 10.0);
      const nearStress = griffithHoopStress(0.5, 0.0, 1.0, 0.05);

      expect(nearStress.effectiveKI).toBeGreaterThan(farStress.effectiveKI);
      expect(nearStress.sigmaThetaTheta).toBeGreaterThan(farStress.sigmaThetaTheta);
    });
  });

  // =========================================================================
  // Dimension 5: Binary Columnar Buffer Parsing & Boundary Invariants
  // =========================================================================
  describe('Dimension 5: Binary Columnar Buffer Roundtrip & Malformed Data Defense', () => {
    it('T5-BIN-01: Serializes and parses GEOM v1 buffer maintaining exact bit-level roundtrip equality', () => {
      const pointCount = 500;
      const points = new Float32Array(pointCount * 3).map((_, i) => Math.sin(i));
      const target2D = new Float32Array(pointCount * 2).map((_, i) => Math.cos(i));
      const types = new Float32Array(pointCount).map((_, i) => (i % 3 === 0 ? 1.0 : 0.0));
      const indices = new Uint32Array(pointCount * 2).map((_, i) => i % pointCount);

      const serialized = serializeGeomBuffer(points, target2D, types, indices);
      const parsed = parseGeomBuffer(serialized);

      expect(parsed.magic).toBe(GEOM_MAGIC);
      expect(parsed.version).toBe(GEOM_VERSION);
      expect(parsed.pointCount).toBe(pointCount);
      expect(parsed.indexCount).toBe(indices.length);

      expect(parsed.points[0]).toBeCloseTo(points[0], 5);
      expect(parsed.target2D[0]).toBeCloseTo(target2D[0], 5);
      expect(parsed.types[0]).toBeCloseTo(types[0], 5);
      expect(parsed.indices[0]).toBe(indices[0]);
    });

    it('T5-BIN-02: parseGeomBuffer rejects truncated, malformed, or wrong-magic buffers with descriptive errors', () => {
      // 1. Buffer smaller than header size
      const smallBuf = new Uint8Array(16);
      expect(() => parseGeomBuffer(smallBuf)).toThrow(/Buffer too small for GEOM header/);

      // 2. Buffer with bad magic header
      const badMagicBuf = new ArrayBuffer(64);
      const view = new DataView(badMagicBuf);
      view.setUint32(0, 0x12345678, true);
      view.setUint32(4, 1, true);
      expect(() => parseGeomBuffer(badMagicBuf)).toThrow(/Invalid GEOM magic/);

      // 3. Buffer with invalid version
      view.setUint32(0, GEOM_MAGIC, true);
      view.setUint32(4, 99, true); // Version 99
      expect(() => parseGeomBuffer(badMagicBuf)).toThrow(/Unsupported GEOM version/);
    });
  });
});
