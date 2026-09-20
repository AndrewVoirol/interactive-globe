import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('R1 Hardware Perimeter Skirt Generation (Watertight Patch Seams)', () => {
  const cullingWgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/culling.wgsl');
  const crustWgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');

  describe('Pillar 1: Patch Mesh Geometry Accounting & VRAM Footprint', () => {
    it('generates exact 8,962 vertices and 52,224 indices for 64x64 dual-surface patch', () => {
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(64);

      // (65 * 65 grid + 256 skirt) * 2 surfaces = 4,481 * 2 = 8,962 vertices
      // 8,962 vertices * 12 floats (48 bytes stride) = 107,544 floats
      expect(vertices.length).toBe(8962 * 12);
      expect(vertices.byteLength).toBe(8962 * 48); // 430,176 bytes

      // (4,096 grid quads + 256 skirt quads) * 6 indices * 2 surfaces = 26,112 * 2 = 52,224 indices
      expect(indices.length).toBe(52224);
      expect(indices.byteLength).toBe(52224 * 4); // 208,896 bytes

      // All vertices must be finite (zero NaN / Inf)
      for (let i = 0; i < vertices.length; i++) {
        expect(Number.isFinite(vertices[i])).toBe(true);
      }

      // All indices must reference valid vertices within [0, 8961]
      for (let i = 0; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(0);
        expect(indices[i]).toBeLessThan(8962);
      }
    });

    it('verifies patch VRAM footprint is strictly under 700 KB (actual ~624.1 KB)', () => {
      const patch = WebGPUEngine.generatePatchMesh(64);
      const totalBytes = patch.vertices.byteLength + patch.indices.byteLength;
      const totalKb = totalBytes / 1024;

      // 430,176 B (vertices) + 208,896 B (indices) = 639,072 B ≈ 624.09 KB
      expect(totalKb).toBeLessThan(700);
      expect(totalKb).toBeGreaterThan(600);
      expect(Math.round(totalKb * 10) / 10).toBe(624.1);
    });
  });

  describe('Pillar 2: 4-Border Closed Loop, Corner Sharing & Boundary Rim Conformance', () => {
    it('verifies continuous closed loop and corner sharing across 256 skirt bottom vertices', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridVertsPerSurface = 65 * 65; // 4,225
      const skirtVertsPerSurface = 64 * 4; // 256
      const vertsPerSurface = gridVertsPerSurface + skirtVertsPerSurface; // 4,481

      for (let surface = 0; surface < 2; surface++) {
        const baseOffset = (surface * vertsPerSurface + gridVertsPerSurface) * floatsPerVertex;

        // South border: k in [0..63], v = 0, u in [0, 1]
        for (let k = 0; k < 64; k++) {
          const off = baseOffset + k * floatsPerVertex;
          const u = vertices[off + 0];
          const v = vertices[off + 1];
          const skirtFactor = vertices[off + 8];

          expect(v).toBeCloseTo(0.0, 6);
          expect(u).toBeCloseTo(k / 64, 6);
          expect(skirtFactor).toBe(1.0);
        }

        // East border: k in [64..127], u = 1, v in [0, 1]
        for (let k = 64; k < 128; k++) {
          const step = k - 64;
          const off = baseOffset + k * floatsPerVertex;
          const u = vertices[off + 0];
          const v = vertices[off + 1];
          const skirtFactor = vertices[off + 8];

          expect(u).toBeCloseTo(1.0, 6);
          expect(v).toBeCloseTo(step / 64, 6);
          expect(skirtFactor).toBe(1.0);
        }

        // Corner 1 sharing: vertex k = 64 starts East border at (1, 0), matching end of South border
        const corner1Off = baseOffset + 64 * floatsPerVertex;
        expect(vertices[corner1Off + 0]).toBeCloseTo(1.0, 6);
        expect(vertices[corner1Off + 1]).toBeCloseTo(0.0, 6);

        // North border: k in [128..191], v = 1, u in [1, 0]
        for (let k = 128; k < 192; k++) {
          const step = k - 128;
          const off = baseOffset + k * floatsPerVertex;
          const u = vertices[off + 0];
          const v = vertices[off + 1];
          const skirtFactor = vertices[off + 8];

          expect(v).toBeCloseTo(1.0, 6);
          expect(u).toBeCloseTo(1.0 - step / 64, 6);
          expect(skirtFactor).toBe(1.0);
        }

        // Corner 2 sharing: vertex k = 128 starts North border at (1, 1), matching end of East border
        const corner2Off = baseOffset + 128 * floatsPerVertex;
        expect(vertices[corner2Off + 0]).toBeCloseTo(1.0, 6);
        expect(vertices[corner2Off + 1]).toBeCloseTo(1.0, 6);

        // West border: k in [192..255], u = 0, v in [1, 0]
        for (let k = 192; k < 256; k++) {
          const step = k - 192;
          const off = baseOffset + k * floatsPerVertex;
          const u = vertices[off + 0];
          const v = vertices[off + 1];
          const skirtFactor = vertices[off + 8];

          expect(u).toBeCloseTo(0.0, 6);
          expect(v).toBeCloseTo(1.0 - step / 64, 6);
          expect(skirtFactor).toBe(1.0);
        }

        // Corner 3 sharing: vertex k = 192 starts West border at (0, 1), matching end of North border
        const corner3Off = baseOffset + 192 * floatsPerVertex;
        expect(vertices[corner3Off + 0]).toBeCloseTo(0.0, 6);
        expect(vertices[corner3Off + 1]).toBeCloseTo(1.0, 6);

        // Corner 0 sharing: end of West connects back to start of South at (0, 0)
        const corner0Off = baseOffset + 0 * floatsPerVertex;
        expect(vertices[corner0Off + 0]).toBeCloseTo(0.0, 6);
        expect(vertices[corner0Off + 1]).toBeCloseTo(0.0, 6);
      }
    });

    it('verifies skirt bottom vertices share identical (u, v) with boundary rim (zero texture stretch)', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridVertsPerSurface = 65 * 65;
      const vertsPerSurface = gridVertsPerSurface + 256;

      for (let surface = 0; surface < 2; surface++) {
        // Check that all 4,225 grid vertices have skirtFactor === 0.0
        for (let i = 0; i < gridVertsPerSurface; i++) {
          const off = (surface * vertsPerSurface + i) * floatsPerVertex;
          expect(vertices[off + 8]).toBe(0.0);
        }

        // Check that all 256 skirt bottom vertices have skirtFactor === 1.0 and identical uv === position.xy
        for (let k = 0; k < 256; k++) {
          const off = (surface * vertsPerSurface + gridVertsPerSurface + k) * floatsPerVertex;
          const posX = vertices[off + 0];
          const posY = vertices[off + 1];
          const uvX = vertices[off + 3];
          const uvY = vertices[off + 4];
          const targetX = vertices[off + 6];
          const targetY = vertices[off + 7];
          const skirtFactor = vertices[off + 8];

          expect(uvX).toBe(posX);
          expect(uvY).toBe(posY);
          expect(targetX).toBe(posX);
          expect(targetY).toBe(posY);
          expect(skirtFactor).toBe(1.0);
        }
      }
    });
  });

  describe('Pillar 3: Outward-Facing Counter-Clockwise Triangle Winding', () => {
    it('proves outward-facing counter-clockwise triangle winding for all 256 skirt quads', () => {
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridQuadsPerSurface = 64 * 64; // 4,096
      const gridIndicesPerSurface = gridQuadsPerSurface * 6; // 24,576
      const indicesPerSurface = gridIndicesPerSurface + 256 * 6; // 26,112

      for (let surface = 0; surface < 2; surface++) {
        const skirtIndexStart = surface * indicesPerSurface + gridIndicesPerSurface;

        for (let k = 0; k < 256; k++) {
          const quadIndexOffset = skirtIndexStart + k * 6;

          // Triangle 1: (Tk, Sk, Tnext)
          const t1_0 = indices[quadIndexOffset + 0];
          const t1_1 = indices[quadIndexOffset + 1];
          const t1_2 = indices[quadIndexOffset + 2];

          // Triangle 2: (Tnext, Sk, Snext)
          const t2_0 = indices[quadIndexOffset + 3];
          const t2_1 = indices[quadIndexOffset + 4];
          const t2_2 = indices[quadIndexOffset + 5];

          // Reconstruct 3D points where z = 0 for top (grid) and z = -1 for bottom (skirt)
          const p = (idx: number) => {
            const off = idx * floatsPerVertex;
            const u = vertices[off + 0];
            const v = vertices[off + 1];
            const skirtFactor = vertices[off + 8];
            const z = skirtFactor > 0.5 ? -1.0 : 0.0;
            return [u, v, z] as [number, number, number];
          };

          const normalOf = (i0: number, i1: number, i2: number) => {
            const a = p(i0);
            const b = p(i1);
            const c = p(i2);
            // v1 = b - a, v2 = c - a
            const v1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const v2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            // n = v1 x v2
            const nx = v1[1] * v2[2] - v1[2] * v2[1];
            const ny = v1[2] * v2[0] - v1[0] * v2[2];
            const nz = v1[0] * v2[1] - v1[1] * v2[0];
            return [nx, ny, nz] as [number, number, number];
          };

          const n1 = normalOf(t1_0, t1_1, t1_2);
          const n2 = normalOf(t2_0, t2_1, t2_2);

          if (k < 64) {
            // South border (v = 0): outward normal must point in -v direction (ny < 0)
            expect(n1[1]).toBeLessThan(0.0);
            expect(n2[1]).toBeLessThan(0.0);
          } else if (k < 128) {
            // East border (u = 1): outward normal must point in +u direction (nx > 0)
            expect(n1[0]).toBeGreaterThan(0.0);
            expect(n2[0]).toBeGreaterThan(0.0);
          } else if (k < 192) {
            // North border (v = 1): outward normal must point in +v direction (ny > 0)
            expect(n1[1]).toBeGreaterThan(0.0);
            expect(n2[1]).toBeGreaterThan(0.0);
          } else {
            // West border (u = 0): outward normal must point in -u direction (nx < 0)
            expect(n1[0]).toBeLessThan(0.0);
            expect(n2[0]).toBeLessThan(0.0);
          }
        }
      }
    });
  });

  describe('Pillar 4: Shader Source Verification & Indirect Draw Command Alignment', () => {
    it('verifies culling.wgsl indirectCmd.indexCount is set to 52224u in cs_reset', () => {
      expect(fs.existsSync(cullingWgslPath)).toBe(true);
      const code = fs.readFileSync(cullingWgslPath, 'utf8');
      expect(code).toContain('indirectCmd.indexCount = 52224u;');
    });

    it('verifies crust_hydrosphere.wgsl reads skirtFactor and applies skirtDepth displacement', () => {
      expect(fs.existsSync(crustWgslPath)).toBe(true);
      const code = fs.readFileSync(crustWgslPath, 'utf8');

      // Vertex output declaration includes skirtFactor
      expect(code).toContain('@location(6) skirtFactor: f32,');

      // Vertex shader reads target2D.z as skirtFactor
      expect(code).toContain('let skirtFactor = input.target2D.z;');

      // Downward displacement along -baseNormal
      expect(code).toContain('let abyssalDrop = max(0.02, dispScale * 1.05 + 0.015);');
      expect(code).toContain('let skirtDepth = select(0.0, max(abyssalDrop, inst.sizeUV.y * 0.35 * dispScale), isCrust && skirtFactor > 0.0);');
      expect(code).toContain('let worldP = basePos + baseNormal * (normalDisplacement - skirtDepth);');

      // Passes skirtFactor to fragment shader
      expect(code).toContain('output.skirtFactor = skirtFactor;');

      // Fragment shader discards water skirt fragments to prevent vertical glass walls
      expect(code).toContain('let isSkirt = input.skirtFactor > 0.5;');
      expect(code).toContain('if (input.surfaceType > 0.5 && isSkirt) {');
      expect(code).toContain('discard;');
    });
  });
});
