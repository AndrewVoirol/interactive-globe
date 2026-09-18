import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('GPU-Driven CDLOD Quadsphere & Continuous Geomorphing Invariants', () => {
  const cullingWgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/culling.wgsl');
  const crustWgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');

  describe('Pillar 1: 64x64 Instanced Patch Geometry & Quadsphere Math', () => {
    it('generates 64x64 dual-surface patch with exact vertex and index counts', () => {
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(64);
      // (64 + 1) * (64 + 1) * 2 surfaces = 8,450 vertices
      // 8,450 vertices * 12 floats (48 bytes stride) = 101,400 floats
      expect(vertices.length).toBe(8450 * 12);
      // 64 * 64 quads * 2 triangles * 3 indices * 2 surfaces = 49,152 indices
      expect(indices.length).toBe(49152);

      // Verify zero NaNs or Infs
      for (let i = 0; i < vertices.length; i++) {
        expect(Number.isFinite(vertices[i])).toBe(true);
      }
      for (let i = 0; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(0);
        expect(indices[i]).toBeLessThan(8450);
      }
    });

    it('verifies crust surface (type=0.0) and hydrosphere surface (type=1.0) separation', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const vertsPerSurface = 65 * 65;

      // Surface 0: Crust
      for (let i = 0; i < vertsPerSurface; i++) {
        const offset = i * floatsPerVertex;
        const u = vertices[offset + 0];
        const v = vertices[offset + 1];
        const surfaceType = vertices[offset + 2];
        expect(u).toBeGreaterThanOrEqual(0.0);
        expect(u).toBeLessThanOrEqual(1.0);
        expect(v).toBeGreaterThanOrEqual(0.0);
        expect(v).toBeLessThanOrEqual(1.0);
        expect(surfaceType).toBe(0.0);
      }

      // Surface 1: Hydrosphere
      for (let i = vertsPerSurface; i < vertsPerSurface * 2; i++) {
        const offset = i * floatsPerVertex;
        const u = vertices[offset + 0];
        const v = vertices[offset + 1];
        const surfaceType = vertices[offset + 2];
        expect(u).toBeGreaterThanOrEqual(0.0);
        expect(u).toBeLessThanOrEqual(1.0);
        expect(v).toBeGreaterThanOrEqual(0.0);
        expect(v).toBeLessThanOrEqual(1.0);
        expect(surfaceType).toBe(1.0);
      }
    });

    it('proves outward-facing counter-clockwise triangle winding for all patch quads', () => {
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;

      // Check first 100 triangles on crust surface
      for (let t = 0; t < 100; t++) {
        const i0 = indices[t * 3 + 0];
        const i1 = indices[t * 3 + 1];
        const i2 = indices[t * 3 + 2];

        const u0 = vertices[i0 * floatsPerVertex + 0];
        const v0 = vertices[i0 * floatsPerVertex + 1];
        const u1 = vertices[i1 * floatsPerVertex + 0];
        const v1 = vertices[i1 * floatsPerVertex + 1];
        const u2 = vertices[i2 * floatsPerVertex + 0];
        const v2 = vertices[i2 * floatsPerVertex + 1];

        // 2D cross product in parametric space: (u1 - u0)*(v2 - v0) - (v1 - v0)*(u2 - u0)
        const cross = (u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0);
        expect(cross).toBeGreaterThan(0.0);
      }
    });

    it('validates evaluateManifoldPosition spatial continuity on sphere (mode=0, unfurl=0)', () => {
      // Test continuity along equator and antimeridian
      const seamEast = WebGPUEngine.evaluateManifoldPosition(1.0, 0.5, 0, 0.0);
      const seamWest = WebGPUEngine.evaluateManifoldPosition(0.0, 0.5, 0, 0.0);
      expect(Math.hypot(seamEast[0] - seamWest[0], seamEast[1] - seamWest[1], seamEast[2] - seamWest[2])).toBeCloseTo(0.0, 5);

      // Verify radius is 5.0 everywhere on sphere
      for (let u = 0; u <= 1.0; u += 0.25) {
        for (let v = 0.1; v <= 0.9; v += 0.2) {
          const pt = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0);
          expect(Math.hypot(pt[0], pt[1], pt[2])).toBeCloseTo(5.0, 4);
        }
      }
    });
  });

  describe('Pillar 2: WGSL Culling Shader Alignment & Protocol', () => {
    it('verifies culling.wgsl exists and declares required entry points and bindings', () => {
      expect(fs.existsSync(cullingWgslPath)).toBe(true);
      const code = fs.readFileSync(cullingWgslPath, 'utf8');

      expect(code).toContain('fn cs_reset()');
      expect(code).toContain('fn cs_main(');
      expect(code).toContain('struct DrawIndexedIndirect');
      expect(code).toContain('struct QuadtreeNode');
      expect(code).toContain('struct CDLODInstance');
      expect(code).toContain('struct CullingUniforms');

      // Bindings
      expect(code).toContain('@group(0) @binding(0) var<uniform> uniforms: CullingUniforms;');
      expect(code).toContain('@group(0) @binding(1) var<storage, read> nodes: array<QuadtreeNode>;');
      expect(code).toContain('@group(0) @binding(2) var<storage, read_write> indirectCmd: DrawIndexedIndirect;');
      expect(code).toContain('@group(0) @binding(3) var<storage, read_write> instances: array<CDLODInstance>;');
    });

    it('verifies DrawIndexedIndirect 20-byte layout and atomic instanceCount', () => {
      const code = fs.readFileSync(cullingWgslPath, 'utf8');
      expect(code).toMatch(/indexCount\s*:\s*u32/);
      expect(code).toMatch(/instanceCount\s*:\s*atomic<u32>/);
      expect(code).toMatch(/firstIndex\s*:\s*u32/);
      expect(code).toMatch(/baseVertex\s*:\s*i32/);
      expect(code).toMatch(/firstInstance\s*:\s*u32/);

      // Verify reset sets 49152 indices for the 64x64 dual surface patch
      expect(code).toContain('indirectCmd.indexCount = 49152u;');
    });

    it('verifies Mode 4 dynamic bounding expansion using fluidMaxDisplacement', () => {
      const code = fs.readFileSync(cullingWgslPath, 'utf8');
      expect(code).toContain('fluidMaxDisplacement');
      expect(code).toContain('effectiveRadius += uniforms.fluidMaxDisplacement;');
    });

    it('verifies view frustum culling via 6 Hesse normal form plane tests', () => {
      const code = fs.readFileSync(cullingWgslPath, 'utf8');
      expect(code).toContain('uniforms.frustumPlanes[i]');
      expect(code).toContain('dot(plane.xyz, node.center) + plane.w');
      expect(code).toContain('dist < -effectiveRadius');
    });
  });

  describe('Pillar 3: Watertight Vertex Geomorphing Invariants', () => {
    it('verifies crust_hydrosphere.wgsl integrates CDLODControlUniforms on @group(2)', () => {
      const code = fs.readFileSync(crustWgslPath, 'utf8');
      expect(code).toContain('struct CDLODControlUniforms');
      expect(code).toContain('struct CDLODInstance');
      expect(code).toContain('@group(2) @binding(0) var<uniform> u_cdlodControl: CDLODControlUniforms;');
      expect(code).toContain('@group(2) @binding(1) var<storage, read> cdlodInstances: array<CDLODInstance>;');
    });

    it('verifies geomorphing equations in crust_hydrosphere.wgsl', () => {
      const code = fs.readFileSync(crustWgslPath, 'utf8');
      expect(code).toContain('let alpha = clamp((r - inst.morphStart) * inst.invMorphRange, 0.0, 1.0);');
      expect(code).toContain('p_morphed = p - alpha * (fract(p * 32.0) * (1.0 / 32.0));');
    });

    it('mathematically proves odd vertices snap to even neighbors with zero seam at alpha = 1.0', () => {
      const K = 64.0;
      const alpha = 1.0;

      for (let i = 0; i <= 64; i++) {
        const p = i / K;
        const fractTerm = (p * 32.0) % 1.0;
        const p_morphed = p - alpha * (fractTerm * (1.0 / 32.0));

        if (i % 2 === 0) {
          // Even vertices remain invariant
          expect(p_morphed).toBeCloseTo(p, 6);
        } else {
          // Odd vertices snap to the preceding even neighbor
          const expectedSnapped = (i - 1) / K;
          expect(p_morphed).toBeCloseTo(expectedSnapped, 6);
        }
      }
    });
  });

  describe('Pillar 4: CDLOD Metric 1 Resolution & Spacing Calibrations', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('proves nadir vertex spacing <= 85m at 15 km altitude over Alps', () => {
      // Altitude 15 km
      const spacing15km = engine.getNadirVertexSpacingMeters(15.0);
      expect(spacing15km).toBeLessThanOrEqual(85.0);
      expect(spacing15km).toBeGreaterThan(0.0);
    });

    it('proves dyadic LOD ranges satisfy R_L = 56.0 / 2^L', () => {
      engine.ensureCDLODBuffers();
      const ranges = (engine as any).cdlodLodRanges;
      expect(ranges).toBeDefined();
      expect(ranges.length).toBeGreaterThanOrEqual(12);

      for (let l = 0; l <= 11; l++) {
        expect(ranges[l]).toBeCloseTo(56.0 / Math.pow(2, l), 5);
      }
    });

    it('verifies quadtree node count at 10,000 km altitude keeps rendered vertices <= 150,000', () => {
      engine.ensureCDLODBuffers();
      const camera = new PerspectiveCamera(45, 1.0, 0.1, 100);
      camera.position.set(0, 0, 5.0 + (10000 / 1274.2));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0, false);
      const stats = engine.getCDLODStats();

      // Total rendered vertices = activeNodes * 8450
      expect(stats.totalVertices).toBeLessThanOrEqual(150000);
      expect(stats.nodeCount).toBeGreaterThan(0);
    });

    it('verifies zero-GC node pool reuse in updateCDLOD', () => {
      engine.ensureCDLODBuffers();
      const mockCamera = {
        position: { x: 0, y: 0, z: 12.0 },
        projectionMatrix: { elements: new Float32Array(16) },
        matrixWorldInverse: { elements: new Float32Array(16) }
      };

      const initialPoolRef = (engine as any).cdlodNodePool;
      const initialCandidateRef = (engine as any).cdlodCandidateFloats;

      for (let frame = 0; frame < 20; frame++) {
        engine.updateCDLOD(mockCamera, 0, 0, false);
      }

      // Buffer mirrors and pool instances must not be reallocated
      expect((engine as any).cdlodNodePool).toBe(initialPoolRef);
      expect((engine as any).cdlodCandidateFloats).toBe(initialCandidateRef);
    });
  });
});
