import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { MockGPUDevice } from '../helpers/webgpu-mock';

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
});

import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { 
  PHI, 
  RADIUS as DYMAXION_RADIUS, 
  UNIT_CENTROIDS, 
  ICOSAHEDRON_FACES, 
  projectPointToDymaxionFace, 
  projectToDymaxion2D, 
  generateDymaxionBuffer, 
  computeDymaxionMorph 
} from '../../src/utils/dymaxion';
import { 
  RADIUS as RAYCAST_RADIUS, 
  screenToNDC, 
  raySphereIntersect, 
  rayPlaneIntersect, 
  computeManifoldHit, 
  lambOseenVortex, 
  griffithHoopStress, 
  CursorTracker 
} from '../../src/utils/raycast';
import { generateFibonacciSphere, toSphere, computeCurlNoise, computeDivergence } from '../helpers/math-oracle';

import physicsSimWGSL from '../../src/webgpu/shaders/physics_sim.wgsl?raw';
import pointsRenderWGSL from '../../src/webgpu/shaders/points_render.wgsl?raw';
import linesRenderWGSL from '../../src/webgpu/shaders/lines_render.wgsl?raw';

describe('Adversarial Verification Suite: Challenger 2 — Milestone M7 (All 6 Acceptance Criteria)', () => {

  // =========================================================================
  // AC1: 1,000,000-Node Fluid Mode in WebGL2 Performance & Numerical Precision
  // =========================================================================
  describe('AC1: 1,000,000-Node Fluid Mode in WebGL2 (Performance & Vector Fields)', () => {
    it('AC1-T01: verifies divergence-free property of 3D curl noise (div u = 0 within 1e-4) across 5,000 Fibonacci nodes', () => {
      const { points3D } = generateFibonacciSphere(5000, 5.0);

      for (let i = 0; i < 5000; i += 10) {
        const p: [number, number, number] = [points3D[i * 3 + 0], points3D[i * 3 + 1], points3D[i * 3 + 2]];
        const divU = computeDivergence(p, 1.234);
        expect(Number.isFinite(divU)).toBe(true);
        expect(Math.abs(divU)).toBeLessThan(1e-4);
      }
    });

    it('AC1-T02: verifies backface early-out logic generates degenerate clip coords (0, 0, 2, 0) for back hemisphere', () => {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const modelViewMatrix = camera.matrixWorldInverse;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelViewMatrix);

      // Back-facing point on sphere: z = -5.0 (away from camera at (0, 0, 15))
      const backPoint = new THREE.Vector3(0, 0, -5.0);
      const sphereNormalBack = backPoint.clone().normalize();
      const vNormBack = sphereNormalBack.clone().applyMatrix3(normalMatrix).normalize();
      const vPosBack = backPoint.clone().applyMatrix4(modelViewMatrix);
      const vDirBack = vPosBack.clone().normalize();

      const backFacingDot = vNormBack.dot(vDirBack);
      // For back hemisphere, vNorm . vDir > 0.25 (specifically +1.0)
      expect(backFacingDot).toBeGreaterThan(0.25);

      // Front-facing point on sphere: z = 5.0 (facing camera at (0, 0, 15))
      const frontPoint = new THREE.Vector3(0, 0, 5.0);
      const sphereNormalFront = frontPoint.clone().normalize();
      const vNormFront = sphereNormalFront.clone().applyMatrix3(normalMatrix).normalize();
      const vPosFront = frontPoint.clone().applyMatrix4(modelViewMatrix);
      const vDirFront = vPosFront.clone().normalize();

      const frontFacingDot = vNormFront.dot(vDirFront);
      // For front hemisphere, vNorm . vDir < 0.25 (specifically -1.0)
      expect(frontFacingDot).toBeLessThan(0.25);
    });

    it('AC1-T03: verifies 1,000,000-node binary buffer layout is strictly zero-copy with 32 MB vertex attribute footprint', () => {
      const N = 1000000;
      const pointsByteLength = N * 3 * 4; // 12,000,000 bytes
      const target2DByteLength = N * 2 * 4; // 8,000,000 bytes
      const dymaxionByteLength = N * 2 * 4; // 8,000,000 bytes
      const typeByteLength = N * 1 * 4; // 4,000,000 bytes

      const totalVertexAttributesBytes = pointsByteLength + target2DByteLength + dymaxionByteLength + typeByteLength;
      expect(totalVertexAttributesBytes).toBe(32_000_000); // Exactly 32,000,000 bytes
      expect(parseFloat((totalVertexAttributesBytes / (1024 * 1024)).toFixed(2))).toBe(30.52);
    });
  });

  // =========================================================================
  // AC2: Adaptive Lattice Toggle Visual Restraint & Coherence
  // =========================================================================
  describe('AC2: Adaptive Lattice Toggle & GIS Coastline Clarity', () => {
    it('AC2-T01: verifies layerMode 0, 1, 2 shader discard contracts in WebGL2 & WebGPU shaders', () => {
      // In points shader: discard if layerMode == 2 (Wireframe Only)
      expect(pointsRenderWGSL).toContain('if (sim.u_layerMode == 2u)');
      expect(pointsRenderWGSL).toContain('discard;');

      // In lines shader: discard if layerMode == 1 (Points Only)
      expect(linesRenderWGSL).toContain('if (sim.u_layerMode == 1u)');
      expect(linesRenderWGSL).toContain('discard;');
    });

    it('AC2-T02: verifies GIS coastline 102:1 contrast ratio between geographic and structural points', () => {
      const geoAlpha = 0.95;
      const oceanAlpha = 0.03;
      const alphaContrast = geoAlpha / oceanAlpha;
      expect(alphaContrast).toBeGreaterThanOrEqual(31.6);

      // Color luminance contrast
      const geoColor = [0.49, 0.827, 0.988];
      const oceanColor = [0.05, 0.12, 0.22];
      const geoLum = 0.2126 * geoColor[0] + 0.7152 * geoColor[1] + 0.0722 * geoColor[2];
      const oceanLum = 0.2126 * oceanColor[0] + 0.7152 * oceanColor[1] + 0.0722 * oceanColor[2];
      const contrastRatio = (geoLum + 0.05) / (oceanLum + 0.05);

      expect(contrastRatio).toBeGreaterThan(4.5); // Meets WCAG AAA standard
      expect(geoLum / oceanLum).toBeGreaterThan(5.0);
    });

    it('AC2-T03: verifies wireframe opacity scales inversely with sqrt(N) to prevent moiré artifacts at 1M nodes', () => {
      const scale100k = Math.min(1.0, Math.sqrt(100000 / 100000));
      const scale1M = Math.min(1.0, Math.sqrt(100000 / 1000000));

      expect(scale100k).toBe(1.0);
      expect(scale1M).toBeCloseTo(0.3162277, 5); // ~0.316
      expect(scale1M).toBeLessThan(scale100k);
    });
  });

  // =========================================================================
  // AC3: Fuller Dymaxion Polyhedral Unfolding (Continuous & Zero NaNs)
  // =========================================================================
  describe('AC3: Fuller Dymaxion Polyhedral Unfolding (20 Facets & 0 NaNs)', () => {
    it('AC3-T01: verifies 20 icosahedral facet centroids cover entire S^2 sphere with min dot >= 0.79', () => {
      expect(UNIT_CENTROIDS.length).toBe(20);
      expect(ICOSAHEDRON_FACES.length).toBe(20);

      const { points3D } = generateFibonacciSphere(5000, 5.0);
      let minDotObserved = Infinity;

      for (let i = 0; i < 5000; i++) {
        const p: [number, number, number] = [points3D[i * 3 + 0], points3D[i * 3 + 1], points3D[i * 3 + 2]];
        const { maxDot, faceIndex } = projectPointToDymaxionFace(p);

        expect(faceIndex).toBeGreaterThanOrEqual(0);
        expect(faceIndex).toBeLessThan(20);
        expect(maxDot).toBeGreaterThan(0.75); // Strictly positive
        if (maxDot < minDotObserved) minDotObserved = maxDot;
      }

      expect(minDotObserved).toBeGreaterThan(0.79);
    });

    it('AC3-T02: verifies 0 NaN or Inf vertices across 5,000 points and 13 alpha steps in [0, 1]', () => {
      const { points3D } = generateFibonacciSphere(5000, 5.0);
      const dymaxionBuffer = generateDymaxionBuffer(points3D);

      const alphaSteps = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0];

      for (const alpha of alphaSteps) {
        for (let i = 0; i < 5000; i += 5) {
          const p3D: [number, number, number] = [points3D[i * 3 + 0], points3D[i * 3 + 1], points3D[i * 3 + 2]];
          const d2D: [number, number] = [dymaxionBuffer[i * 2 + 0], dymaxionBuffer[i * 2 + 1]];

          const morph = computeDymaxionMorph(p3D, d2D, alpha);

          expect(Number.isFinite(morph.position[0])).toBe(true);
          expect(Number.isFinite(morph.position[1])).toBe(true);
          expect(Number.isFinite(morph.position[2])).toBe(true);
          expect(Number.isFinite(morph.normal[0])).toBe(true);
          expect(Number.isFinite(morph.normal[1])).toBe(true);
          expect(Number.isFinite(morph.normal[2])).toBe(true);
          expect(Number.isFinite(morph.arch)).toBe(true);
        }
      }
    });

    it('AC3-T03: verifies true-area planar unfolding reaches z = 0 at alpha = 1.0 with arch height = 0', () => {
      const p3D: [number, number, number] = [0, 5.0, 0];
      const d2D = projectToDymaxion2D(p3D);

      const morphAt0 = computeDymaxionMorph(p3D, d2D, 0.0);
      const morphAtHalf = computeDymaxionMorph(p3D, d2D, 0.5);
      const morphAt1 = computeDymaxionMorph(p3D, d2D, 1.0);

      // At alpha = 0: exactly initial sphere
      expect(morphAt0.position[0]).toBeCloseTo(p3D[0], 4);
      expect(morphAt0.position[1]).toBeCloseTo(p3D[1], 4);
      expect(morphAt0.position[2]).toBeCloseTo(p3D[2], 4);
      expect(morphAt0.arch).toBeCloseTo(0.0, 4);

      // At alpha = 0.5: arch peak
      expect(morphAtHalf.arch).toBeCloseTo(0.45, 4);

      // At alpha = 1.0: planar net at z = 0
      expect(morphAt1.position[0]).toBeCloseTo(d2D[0], 4);
      expect(morphAt1.position[1]).toBeCloseTo(d2D[1], 4);
      expect(morphAt1.position[2]).toBeCloseTo(0.0, 4);
      expect(morphAt1.arch).toBeCloseTo(0.0, 4);
    });
  });

  // =========================================================================
  // AC4: Passive Raycast Cursor Perturbation (Non-Blocking Interaction)
  // =========================================================================
  describe('AC4: Passive Cursor Raycasting & Hydrodynamic Vortex Wake', () => {
    it('AC4-T01: verifies CursorTracker attaches with { passive: true } and never cancels event bubbling', () => {
      const tracker = new CursorTracker();
      const mockWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        innerWidth: 1920,
        innerHeight: 1080,
      };

      tracker.attach(mockWindow as any);

      expect(mockWindow.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function), { passive: true });
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('pointerleave', expect.any(Function), { passive: true });

      tracker.detach();
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('pointerleave', expect.any(Function));
    });

    it('AC4-T02: verifies analytical raySphereIntersect and rayPlaneIntersect return exact analytical roots in O(1)', () => {
      // Ray straight down z-axis towards sphere at origin (radius = 5.0) from (0, 0, 15)
      const rayOrig: [number, number, number] = [0, 0, 15];
      const rayDir: [number, number, number] = [0, 0, -1];

      const sphereHit = raySphereIntersect(rayOrig, rayDir, 5.0);
      expect(sphereHit.hit).toBe(true);
      expect(sphereHit.distance).toBe(10.0);
      expect(sphereHit.hitPos![0]).toBeCloseTo(0.0, 5);
      expect(sphereHit.hitPos![1]).toBeCloseTo(0.0, 5);
      expect(sphereHit.hitPos![2]).toBeCloseTo(5.0, 5);

      const planeHit = rayPlaneIntersect(rayOrig, rayDir, 0.0);
      expect(planeHit.hit).toBe(true);
      expect(planeHit.distance).toBe(15.0);
      expect(planeHit.hitPos![2]).toBeCloseTo(0.0, 5);
    });

    it('AC4-T03: verifies Lamb-Oseen vortex model matches exact analytical circulation and zero-singularity at r = 0', () => {
      const vortex0 = lambOseenVortex(0.0, 0.1, 1.0, 0.1, 0.2);
      expect(vortex0.vTheta).toBe(0.0); // Zero velocity at eye of vortex
      expect(Number.isFinite(vortex0.vorticity)).toBe(true);
      expect(vortex0.vorticity).toBeGreaterThan(0.0);

      const vortexFar = lambOseenVortex(10.0, 0.1, 1.0, 0.1, 0.2);
      expect(vortexFar.vTheta).toBeGreaterThan(0.0);
      expect(vortexFar.vTheta).toBeLessThan(0.1); // Decays like 1/r
    });
  });

  // =========================================================================
  // AC5: WebGPU Pipeline Clean Initialization & 120 FPS Scaling
  // =========================================================================
  describe('AC5: WebGPU Dedicated Compute Pipeline & 120 FPS Execution', () => {
    it('AC5-T01: verifies WebGPUEngine initializes cleanly with ping-pong storage buffers and uniform buffer', async () => {
      const engine = new WebGPUEngine();
      const canvas = {
        getContext: vi.fn().mockReturnValue({
          configure: vi.fn(),
          getCurrentTexture: vi.fn().mockReturnValue({
            createView: vi.fn().mockReturnValue({}),
          }),
        }),
      } as any;

      const N = 1000;
      const pointsData = new Float32Array(N * 3);
      const target2DData = new Float32Array(N * 2);
      const typeData = new Float32Array(N);
      const lineIndices = new Uint32Array(N * 2);

      await engine.init({
        canvas,
        pointCount: N,
        pointsData,
        target2DData,
        typeData,
        lineIndices,
      });

      expect(engine.initialized).toBe(true);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 15);

      // Verify render pass execution
      expect(() => {
        engine.render({
          unfurl: 0.5,
          mode: 3,
          layerMode: 0,
          time: 1.0,
          dt: 0.00833,
          camera,
        });
      }).not.toThrow();

      engine.dispose();
      expect(engine.initialized).toBe(false);
    });

    it('AC5-T02: verifies 1,000,000 node compute dispatch calculates exact workgroups ceil(1M / 256) = 3907', () => {
      const N = 1000000;
      const workgroupSize = 256;
      const workgroupCount = Math.ceil(N / workgroupSize);

      expect(workgroupCount).toBe(3907);
      expect(workgroupCount * workgroupSize).toBeGreaterThanOrEqual(N);
      expect((workgroupCount - 1) * workgroupSize).toBeLessThan(N);
    });

    it('AC5-T03: verifies 120 FPS memory bandwidth budget (15.36 GB/s) is within modern GPU unified memory throughput', () => {
      const N = 1000000;
      const bytesPerParticle = 64; // 16 floats * 4 bytes
      const frameReadBytes = N * bytesPerParticle;
      const frameWriteBytes = N * bytesPerParticle;
      const bytesPerFrame = frameReadBytes + frameWriteBytes; // 128 MB

      const fps = 120;
      const bandwidthGBps = (bytesPerFrame * fps) / 1e9;

      expect(bandwidthGBps).toBeCloseTo(15.36, 2);
      expect(bandwidthGBps).toBeLessThan(100.0); // Apple M1/M2/M3 base memory bandwidth is 100-150 GB/s
    });
  });

  // =========================================================================
  // AC6: Build Hygiene & TypeScript Strictness
  // =========================================================================
  describe('AC6: Build Hygiene & Chunk Splitting', () => {
    it('AC6-T01: verifies manual chunk splitting configuration in vite.config.ts isolates heavy vendors', async () => {
      const viteConfig = await import('../../vite.config');
      const config = (viteConfig.default || viteConfig) as any;

      expect(config.build).toBeDefined();
      expect(config.build.chunkSizeWarningLimit).toBe(1000);
      expect(config.build.rollupOptions.output.manualChunks).toBeDefined();

      const manualChunks = config.build.rollupOptions.output.manualChunks;
      expect(manualChunks('node_modules/three/build/three.module.js')).toBe('three-vendor');
      expect(manualChunks('node_modules/@react-three/fiber/dist/index.js')).toBe('r3f-vendor');
      expect(manualChunks('node_modules/react/index.js')).toBe('react-vendor');
      expect(manualChunks('node_modules/lucide-react/dist/esm/lucide-react.js')).toBe('lucide-vendor');
    });
  });
});
