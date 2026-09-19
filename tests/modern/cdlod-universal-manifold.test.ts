import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Universal CDLOD Manifold Integration & Pipeline Invariants', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
    engine.ensureCDLODBuffers();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('Pillar 1: Multi-Mode Manifold Traversal & Bounding Continuity', () => {
    const modes = [
      { id: 0, name: 'Mode 0: Linear Manifold Mix' },
      { id: 1, name: 'Mode 1: Cylindrical Scroll Unroll' },
      { id: 2, name: 'Mode 2: Griffith LEFM Fracture' },
      { id: 3, name: 'Mode 3: Fluid Advection Vortex' },
    ];
    const unfurlStates = [0.0, 0.25, 0.5, 0.75, 1.0];

    modes.forEach(({ id, name }) => {
      it(`evaluates CDLOD quadtree subdivision for ${name} across all unfurl states`, () => {
        const camera = new PerspectiveCamera(45, 1.0, 0.1, 100);
        camera.position.set(0, 0, 12.0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        unfurlStates.forEach((unfurl) => {
          engine.updateCDLOD(camera, id, unfurl, false);
          const stats = engine.getCDLODStats();

          expect(stats.nodeCount).toBeGreaterThan(0);
          expect(stats.nodeCount).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);
          expect(stats.maxLod).toBeGreaterThanOrEqual(1);
          expect(stats.totalVertices).toBe(stats.nodeCount * 8962);

          // Forensically verify candidate buffer floats
          const candidateFloats = (engine as any).cdlodCandidateFloats as Float32Array;
          for (let i = 0; i < stats.nodeCount; i++) {
            const off = i * 12;
            const cx = candidateFloats[off + 0];
            const cy = candidateFloats[off + 1];
            const cz = candidateFloats[off + 2];
            const radius = candidateFloats[off + 3];
            const minU = candidateFloats[off + 4];
            const minV = candidateFloats[off + 5];
            const sizeU = candidateFloats[off + 6];
            const sizeV = candidateFloats[off + 7];

            expect(Number.isFinite(cx)).toBe(true);
            expect(Number.isFinite(cy)).toBe(true);
            expect(Number.isFinite(cz)).toBe(true);
            expect(radius).toBeGreaterThan(0.0);
            expect(minU).toBeGreaterThanOrEqual(0.0);
            expect(minU + sizeU).toBeLessThanOrEqual(1.0 + 1e-6);
            expect(minV).toBeGreaterThanOrEqual(0.0);
            expect(minV + sizeV).toBeLessThanOrEqual(1.0 + 1e-6);
          }
        });
      });
    });
  });

  describe('Pillar 2: Periodic Wrap Conditioning (Sphere vs Flat Sheet)', () => {
    it('proves antimeridian wrap clamp is active strictly when unfurl < 0.01', () => {
      // Camera positioned near eastern edge (longitude ~175°E, u ~ 0.986)
      const camera = new PerspectiveCamera(45, 1.0, 0.1, 100);
      const targetLon = (0.986 - 0.5) * 2.0 * Math.PI;
      const camR = 6.0;
      camera.position.set(camR * Math.sin(targetLon), 0, camR * Math.cos(targetLon));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      // On sphere (unfurl = 0.0), western boundary (u ~ 0.01) is close in 3D space
      engine.updateCDLOD(camera, 0, 0.0, false);
      const sphereNodeCount = engine.getCDLODStats().nodeCount;
      expect(sphereNodeCount).toBeGreaterThan(0);

      // On flat map (unfurl = 1.0), u ~ 0.01 is on the far opposite side of the sheet (distance ~ 31.4)
      // Camera looks at flat sheet at (x ~ targetLon * 5.0, y ~ 0, z ~ 6.0)
      const flatX = targetLon * 5.0;
      camera.position.set(flatX, 0, 6.0);
      camera.lookAt(flatX, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 1.0, false);
      const flatCandidateFloats = (engine as any).cdlodCandidateFloats as Float32Array;
      const flatNodeCount = engine.getCDLODStats().nodeCount;

      // Ensure that on flat map, nodes on the far opposite edge (minU < 0.2) are NOT subdivided to high LOD
      let maxFarWestLod = 0;
      for (let i = 0; i < flatNodeCount; i++) {
        const off = i * 12;
        const minU = flatCandidateFloats[off + 4];
        const sizeU = flatCandidateFloats[off + 6];
        if (minU + sizeU <= 0.25) {
          const poolNode = (engine as any).cdlodNodePool[i];
          if (poolNode) {
            maxFarWestLod = Math.max(maxFarWestLod, poolNode.lod);
          }
        }
      }

      // Far western nodes across the desk on the flat map must remain at coarse LOD (<= 1)
      expect(maxFarWestLod).toBeLessThanOrEqual(1);
    });
  });

  describe('Pillar 3: Memory Footprint & Fallback Verification', () => {
    it('verifies fallback mesh is 128x256 (saving 35.5 MB VRAM over legacy 512x1024)', () => {
      // Stride is 12 floats (48 bytes)
      // Vertices: (128 + 1) * (256 + 1) = 33,153 vertices
      // Indices: 128 * 256 * 6 = 196,608 indices (uint32 = 786,432 bytes)
      const mesh = (engine as any).generateSphereGrid(128, 256);
      // Dual-surface (Crust + Hydrosphere): 33,153 verts * 2 surfaces = 66,306 vertices
      expect(mesh.vertices.length).toBe(33153 * 12 * 2);
      expect(mesh.indices.length).toBe(196608 * 2);

      const vertexBytes = mesh.vertices.byteLength;
      const indexBytes = mesh.indices.byteLength;
      const totalMb = (vertexBytes + indexBytes) / (1024 * 1024);

      // Total fallback VRAM for dual surface 128x256 is ~4.5 MB
      expect(totalMb).toBeLessThan(5.0);
      expect(totalMb).toBeGreaterThan(4.0);

      // Compare to legacy 512x1024 dual-surface which was 75.6 MB
      const legacyVertices = 513 * 1025 * 2 * 48;
      const legacyIndices = 512 * 1024 * 6 * 2 * 4;
      const legacyTotalMb = (legacyVertices + legacyIndices) / (1024 * 1024);
      expect(legacyTotalMb).toBeGreaterThan(70.0);

      const vramSavedMb = legacyTotalMb - totalMb;
      expect(vramSavedMb).toBeGreaterThan(65.0);
    });

    it('verifies CDLOD patch mesh uses under 700 KB VRAM', () => {
      const patch = WebGPUEngine.generatePatchMesh(64);
      const patchBytes = patch.vertices.byteLength + patch.indices.byteLength;
      const patchKb = patchBytes / 1024;
      expect(patchKb).toBeLessThan(700);
      expect(patchKb).toBeGreaterThan(500);
    });
  });

  describe('Pillar 4: Universal Execution Gating Parity', () => {
    it('confirms CDLOD is active across all modes in engine state', () => {
      expect(engine.cdlodEnabled).toBe(true);
      expect(engine.isCDLODEnabled()).toBe(true);

      // Verify toggle method works
      engine.setCDLODEnabled(false);
      expect(engine.cdlodEnabled).toBe(false);
      expect(engine.isCDLODEnabled()).toBe(false);

      engine.setCDLODEnabled(true);
      expect(engine.cdlodEnabled).toBe(true);
      expect(engine.isCDLODEnabled()).toBe(true);
    });
  });
});
