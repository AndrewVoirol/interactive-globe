import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Challenger M1.1 — Empirical Patch Geometry, Winding & Topology Harness', () => {
  const cullingWgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/culling.wgsl');
  const crustWgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const engineTsPath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');

  // --------------------------------------------------------------------------
  // Pillar 1: Empirical Winding Direction & Normal Vector Geometry
  // --------------------------------------------------------------------------
  describe('Pillar 1: Empirical Winding Direction & Outward Normal Vectors', () => {
    it('computes exact 3D normal vectors for all 1,024 skirt triangles and proves outward orientation', () => {
      const gridSize = 64;
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(gridSize);
      const floatsPerVertex = 12;
      const gridVertsPerSurface = (gridSize + 1) * (gridSize + 1); // 4,225
      const skirtVertsPerSurface = gridSize * 4; // 256
      const vertsPerSurface = gridVertsPerSurface + skirtVertsPerSurface; // 4,481
      const gridQuadsPerSurface = gridSize * gridSize; // 4,096
      const gridIndicesPerSurface = gridQuadsPerSurface * 6; // 24,576
      const skirtQuadsPerSurface = skirtVertsPerSurface; // 256
      const indicesPerSurface = gridIndicesPerSurface + skirtQuadsPerSurface * 6; // 26,112

      // Helper to extract (u, v, z) for any vertex index.
      // Top vertices (grid) have z = 0; bottom vertices (skirt) have z = -1 (downward extrusion).
      const getVertexPos3D = (idx: number): [number, number, number] => {
        const off = idx * floatsPerVertex;
        const u = vertices[off + 0];
        const v = vertices[off + 1];
        const skirtFactor = vertices[off + 8];
        const z = skirtFactor > 0.5 ? -1.0 : 0.0;
        return [u, v, z];
      };

      // Helper to compute cross product (b - a) x (c - a)
      const computeNormal = (
        p0: [number, number, number],
        p1: [number, number, number],
        p2: [number, number, number]
      ): [number, number, number] => {
        const v1: [number, number, number] = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const v2: [number, number, number] = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const nx = v1[1] * v2[2] - v1[2] * v2[1];
        const ny = v1[2] * v2[0] - v1[0] * v2[2];
        const nz = v1[0] * v2[1] - v1[1] * v2[0];
        return [nx, ny, nz];
      };

      for (let surface = 0; surface < 2; surface++) {
        const skirtIndexStart = surface * indicesPerSurface + gridIndicesPerSurface;

        for (let k = 0; k < skirtQuadsPerSurface; k++) {
          const quadIndexOffset = skirtIndexStart + k * 6;

          // Triangle 1: (Tk, Sk, Tnext)
          const t1_i0 = indices[quadIndexOffset + 0];
          const t1_i1 = indices[quadIndexOffset + 1];
          const t1_i2 = indices[quadIndexOffset + 2];

          // Triangle 2: (Tnext, Sk, Snext)
          const t2_i0 = indices[quadIndexOffset + 3];
          const t2_i1 = indices[quadIndexOffset + 4];
          const t2_i2 = indices[quadIndexOffset + 5];

          const p1_0 = getVertexPos3D(t1_i0);
          const p1_1 = getVertexPos3D(t1_i1);
          const p1_2 = getVertexPos3D(t1_i2);

          const p2_0 = getVertexPos3D(t2_i0);
          const p2_1 = getVertexPos3D(t2_i1);
          const p2_2 = getVertexPos3D(t2_i2);

          const n1 = computeNormal(p1_0, p1_1, p1_2);
          const n2 = computeNormal(p2_0, p2_1, p2_2);

          // Non-degeneracy check: area of triangle must be strictly positive
          const len1 = Math.hypot(n1[0], n1[1], n1[2]);
          const len2 = Math.hypot(n2[0], n2[1], n2[2]);
          expect(len1).toBeGreaterThan(0.001);
          expect(len2).toBeGreaterThan(0.001);

          // Planar check: normal must lie strictly in the (u, v) plane (nz === 0)
          expect(Math.abs(n1[2])).toBeCloseTo(0.0, 6);
          expect(Math.abs(n2[2])).toBeCloseTo(0.0, 6);

          if (k < 64) {
            // South border (v = 0): outward normal must point in -v (ny < 0, nx == 0)
            expect(n1[1]).toBeLessThan(0.0);
            expect(n2[1]).toBeLessThan(0.0);
            expect(Math.abs(n1[0])).toBeCloseTo(0.0, 6);
            expect(Math.abs(n2[0])).toBeCloseTo(0.0, 6);
          } else if (k < 128) {
            // East border (u = 1): outward normal must point in +u (nx > 0, ny == 0)
            expect(n1[0]).toBeGreaterThan(0.0);
            expect(n2[0]).toBeGreaterThan(0.0);
            expect(Math.abs(n1[1])).toBeCloseTo(0.0, 6);
            expect(Math.abs(n2[1])).toBeCloseTo(0.0, 6);
          } else if (k < 192) {
            // North border (v = 1): outward normal must point in +v (ny > 0, nx == 0)
            expect(n1[1]).toBeGreaterThan(0.0);
            expect(n2[1]).toBeGreaterThan(0.0);
            expect(Math.abs(n1[0])).toBeCloseTo(0.0, 6);
            expect(Math.abs(n2[0])).toBeCloseTo(0.0, 6);
          } else {
            // West border (u = 0): outward normal must point in -u (nx < 0, ny == 0)
            expect(n1[0]).toBeLessThan(0.0);
            expect(n2[0]).toBeLessThan(0.0);
            expect(Math.abs(n1[1])).toBeCloseTo(0.0, 6);
            expect(Math.abs(n2[1])).toBeCloseTo(0.0, 6);
          }
        }
      }
    });

    it('proves CCW front-facing winding when observed from outside looking into each skirt face', () => {
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;

      // Project onto face 2D coordinate system: (tangent, upward)
      // Any CCW polygon in 2D has signed area > 0: sum((x_i * y_{i+1} - x_{i+1} * y_i)) > 0.
      for (let surface = 0; surface < 2; surface++) {
        const skirtIndexStart = surface * 26112 + 24576;

        for (let k = 0; k < 256; k++) {
          const quadIndexOffset = skirtIndexStart + k * 6;

          // For each triangle, get 2D coordinates in the face frame (s = perimeter distance, z = elevation)
          const getFaceCoords = (idx: number): [number, number] => {
            const off = idx * floatsPerVertex;
            const u = vertices[off + 0];
            const v = vertices[off + 1];
            const z = vertices[off + 8] > 0.5 ? -1.0 : 0.0;
            let s = 0;
            if (k < 64) {
              s = u; // South travels +u
            } else if (k < 128) {
              s = v; // East travels +v
            } else if (k < 192) {
              s = 1.0 - u; // North travels -u
            } else {
              s = 1.0 - v; // West travels -v
            }
            return [s, z];
          };

          const t1_pts = [
            getFaceCoords(indices[quadIndexOffset + 0]),
            getFaceCoords(indices[quadIndexOffset + 1]),
            getFaceCoords(indices[quadIndexOffset + 2]),
          ];

          const t2_pts = [
            getFaceCoords(indices[quadIndexOffset + 3]),
            getFaceCoords(indices[quadIndexOffset + 4]),
            getFaceCoords(indices[quadIndexOffset + 5]),
          ];

          const signedArea2D = (pts: [number, number][]): number => {
            return (
              (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) -
              (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0])
            );
          };

          // In standard face view (s to right, z upwards), outward CCW triangles have signedArea2D > 0
          expect(signedArea2D(t1_pts)).toBeGreaterThan(0.0);
          expect(signedArea2D(t2_pts)).toBeGreaterThan(0.0);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Corner Topology, Watertightness & Manifold Integrity
  // --------------------------------------------------------------------------
  describe('Pillar 2: Corner Topology & Topological Watertightness', () => {
    it('proves that all 4 corner skirt vertices are shared with zero duplicate floating vertices', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridVertsPerSurface = 65 * 65; // 4,225
      const skirtVertsPerSurface = 256;
      const vertsPerSurface = gridVertsPerSurface + skirtVertsPerSurface;

      for (let surface = 0; surface < 2; surface++) {
        const skirtBase = (surface * vertsPerSurface + gridVertsPerSurface) * floatsPerVertex;

        // Exact 4 corner skirt bottom vertices
        const corner0 = [vertices[skirtBase + 0 * floatsPerVertex + 0], vertices[skirtBase + 0 * floatsPerVertex + 1]];
        const corner1 = [vertices[skirtBase + 64 * floatsPerVertex + 0], vertices[skirtBase + 64 * floatsPerVertex + 1]];
        const corner2 = [vertices[skirtBase + 128 * floatsPerVertex + 0], vertices[skirtBase + 128 * floatsPerVertex + 1]];
        const corner3 = [vertices[skirtBase + 192 * floatsPerVertex + 0], vertices[skirtBase + 192 * floatsPerVertex + 1]];

        expect(corner0).toEqual([0.0, 0.0]);
        expect(corner1).toEqual([1.0, 0.0]);
        expect(corner2).toEqual([1.0, 1.0]);
        expect(corner3).toEqual([0.0, 1.0]);

        // Verify uniqueness of all 256 skirt bottom vertices (zero duplicates)
        const skirtPoints = new Set<string>();
        for (let k = 0; k < 256; k++) {
          const off = skirtBase + k * floatsPerVertex;
          const u = vertices[off + 0].toFixed(6);
          const v = vertices[off + 1].toFixed(6);
          const key = `${u},${v}`;
          expect(skirtPoints.has(key)).toBe(false); // No duplicate vertex allowed!
          skirtPoints.add(key);
        }
        expect(skirtPoints.size).toBe(256);
      }
    });

    it('proves 2-manifold disk topology: every interior edge shared by exactly 2 triangles, exactly 256 boundary edges', () => {
      const { indices } = WebGPUEngine.generatePatchMesh(64);
      const indicesPerSurface = 26112;

      for (let surface = 0; surface < 2; surface++) {
        const startIdx = surface * indicesPerSurface;
        const endIdx = startIdx + indicesPerSurface;

        // Edge incidence map: canonical undirected edge -> count of incident triangles
        const edgeCount = new Map<string, number>();

        const addEdge = (v0: number, v1: number) => {
          const minV = Math.min(v0, v1);
          const maxV = Math.max(v0, v1);
          const key = `${minV}-${maxV}`;
          edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        };

        const triangleCount = indicesPerSurface / 3; // 8,704 triangles per surface
        for (let t = 0; t < triangleCount; t++) {
          const i0 = indices[startIdx + t * 3 + 0];
          const i1 = indices[startIdx + t * 3 + 1];
          const i2 = indices[startIdx + t * 3 + 2];

          addEdge(i0, i1);
          addEdge(i1, i2);
          addEdge(i2, i0);
        }

        let boundaryEdgeCount = 0;
        let interiorEdgeCount = 0;
        let nonManifoldEdgeCount = 0;

        for (const count of Array.from(edgeCount.values())) {
          if (count === 1) {
            boundaryEdgeCount++;
          } else if (count === 2) {
            interiorEdgeCount++;
          } else {
            nonManifoldEdgeCount++;
          }
        }

        // 1. Manifold condition: zero non-manifold edges (> 2 triangles)
        expect(nonManifoldEdgeCount).toBe(0);

        // 2. Watertight perimeter: boundary edge count MUST be EXACTLY 256 (the bottom skirt perimeter loop)
        // All grid boundary edges are interior edges because they are stitched to the top of the skirt!
        expect(boundaryEdgeCount).toBe(256);

        // 3. Total unique edges: grid (12,416) + skirt new edges (768) = 13,184
        const totalEdges = edgeCount.size;
        expect(totalEdges).toBe(13184);

        // 4. Euler characteristic check: χ = V - E + F = 1 (topological disk with single boundary loop)
        const V = 4481;
        const E = totalEdges;
        const F = triangleCount; // 8,704
        const chi = V - E + F;
        expect(chi).toBe(1);
      }
    });

    it('confirms every skirt bottom vertex touches exactly 3 triangles and every quad shares lateral seam', () => {
      const { indices } = WebGPUEngine.generatePatchMesh(64);
      const gridIndicesPerSurface = 24576;
      const skirtQuads = 256;
      const floatsPerVertex = 12;
      const gridVerts = 4225;

      for (let surface = 0; surface < 2; surface++) {
        const skirtBaseIndex = surface * 26112 + gridIndicesPerSurface;
        const skirtBaseVertex = surface * 4481 + gridVerts;

        // Count incident triangles for each skirt bottom vertex
        const skirtVertIncidentCount = new Array(256).fill(0);

        for (let k = 0; k < skirtQuads; k++) {
          const offset = skirtBaseIndex + k * 6;

          // Check that quad k shares its lateral edge (Tnext, Snext) with quad (k+1)'s (Tk, Sk)
          const nextK = (k + 1) % skirtQuads;
          const nextOffset = skirtBaseIndex + nextK * 6;

          const quadK_Tnext = indices[offset + 2]; // triangle 1 Tnext
          const quadK_Snext = indices[offset + 5]; // triangle 2 Snext

          const nextQuad_Tk = indices[nextOffset + 0]; // next quad Tk
          const nextQuad_Sk = indices[nextOffset + 1]; // next quad Sk

          expect(quadK_Tnext).toBe(nextQuad_Tk);
          expect(quadK_Snext).toBe(nextQuad_Sk);

          // Track skirt vertex usage
          const Sk = indices[offset + 1] - skirtBaseVertex;
          const Snext = indices[offset + 5] - skirtBaseVertex;
          skirtVertIncidentCount[Sk] += 2; // used in Tk, Sk, Tnext AND Tnext, Sk, Snext
          skirtVertIncidentCount[Snext] += 1; // used as Snext in Tnext, Sk, Snext
        }

        // Each skirt bottom vertex must be referenced in exactly 3 triangles
        for (let k = 0; k < 256; k++) {
          expect(skirtVertIncidentCount[k]).toBe(3);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Attribute Integrity & Memory Layout
  // --------------------------------------------------------------------------
  describe('Pillar 3: Attribute Integrity & Memory Layout Contract', () => {
    it('verifies all 107,544 floats are finite with 0 NaNs and 0 Infinities', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      expect(vertices.length).toBe(107544);

      let nanCount = 0;
      let infCount = 0;
      let denormalCount = 0;

      for (let i = 0; i < vertices.length; i++) {
        const val = vertices[i];
        if (Number.isNaN(val)) nanCount++;
        if (!Number.isFinite(val)) infCount++;
        if (val !== 0.0 && Math.abs(val) < 1e-38) denormalCount++;
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(denormalCount).toBe(0);
    });

    it('verifies dualSurfaceLayout 48-byte stride contract across all 8,962 vertices', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const totalVerts = vertices.length / floatsPerVertex;
      expect(totalVerts).toBe(8962);

      const gridVertsPerSurface = 4225;
      const skirtVertsPerSurface = 256;
      const vertsPerSurface = 4481;

      for (let i = 0; i < totalVerts; i++) {
        const off = i * floatsPerVertex;
        const u = vertices[off + 0];
        const v = vertices[off + 1];
        const posZ = vertices[off + 2];
        const uvX = vertices[off + 3];
        const uvY = vertices[off + 4];
        const surfaceType = vertices[off + 5];
        const targetX = vertices[off + 6];
        const targetY = vertices[off + 7];
        const skirtFactor = vertices[off + 8];
        const pad0 = vertices[off + 9];
        const pad1 = vertices[off + 10];
        const pad2 = vertices[off + 11];

        const isSurface1 = i >= vertsPerSurface;
        const expectedSurface = isSurface1 ? 1.0 : 0.0;
        const localIndex = i % vertsPerSurface;
        const isSkirt = localIndex >= gridVertsPerSurface;
        const expectedSkirtFactor = isSkirt ? 1.0 : 0.0;

        expect(u).toBeGreaterThanOrEqual(0.0);
        expect(u).toBeLessThanOrEqual(1.0);
        expect(v).toBeGreaterThanOrEqual(0.0);
        expect(v).toBeLessThanOrEqual(1.0);

        expect(posZ).toBe(expectedSurface);
        expect(uvX).toBe(u);
        expect(uvY).toBe(v);
        expect(surfaceType).toBe(expectedSurface);
        expect(targetX).toBe(u);
        expect(targetY).toBe(v);
        expect(skirtFactor).toBe(expectedSkirtFactor);

        expect(pad0).toBe(0.0);
        expect(pad1).toBe(0.0);
        expect(pad2).toBe(0.0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Exact VRAM Sizing & 16-Byte Hardware Alignment
  // --------------------------------------------------------------------------
  describe('Pillar 4: Exact VRAM Allocation & Hardware Alignment', () => {
    it('verifies exact byte size and GPU 16-byte alignment compliance', () => {
      const { vertices, indices } = WebGPUEngine.generatePatchMesh(64);

      // Vertex buffer: 8,962 * 48 bytes = 430,176 bytes
      expect(vertices.byteLength).toBe(430176);
      expect(vertices.byteLength % 48).toBe(0); // Multiple of stride
      expect(vertices.byteLength % 16).toBe(0); // WebGPU 16-byte alignment

      // Index buffer: 52,224 * 4 bytes = 208,896 bytes
      expect(indices.byteLength).toBe(208896);
      expect(indices.byteLength % 4).toBe(0); // Multiple of Uint32
      expect(indices.byteLength % 16).toBe(0); // WebGPU 16-byte alignment

      // Total VRAM budget: < 700 KB
      const totalVramBytes = vertices.byteLength + indices.byteLength;
      expect(totalVramBytes).toBe(639072);
      const totalVramKb = totalVramBytes / 1024;
      expect(totalVramKb).toBeCloseTo(624.09375, 4);
      expect(totalVramKb).toBeLessThan(700.0);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 5: Multi-Resolution Generative Fuzzing & Invariance
  // --------------------------------------------------------------------------
  describe('Pillar 5: Generative Fuzzing & Invariance across Resolutions', () => {
    const testResolutions = [8, 16, 32, 64, 128];

    testResolutions.forEach((N) => {
      it(`verifies topology, closed loop and Euler characteristic for gridSize = ${N}`, () => {
        const { vertices, indices } = WebGPUEngine.generatePatchMesh(N);
        const gridVerts = (N + 1) * (N + 1);
        const skirtVerts = N * 4;
        const vertsPerSurface = gridVerts + skirtVerts;
        const totalVerts = vertsPerSurface * 2;
        const totalFloats = totalVerts * 12;

        const gridQuads = N * N;
        const skirtQuads = N * 4;
        const indicesPerSurface = (gridQuads + skirtQuads) * 6;
        const totalIndices = indicesPerSurface * 2;

        expect(vertices.length).toBe(totalFloats);
        expect(indices.length).toBe(totalIndices);

        // Check finite floats
        for (let i = 0; i < vertices.length; i++) {
          expect(Number.isFinite(vertices[i])).toBe(true);
        }

        // Check index range
        for (let i = 0; i < indices.length; i++) {
          expect(indices[i]).toBeGreaterThanOrEqual(0);
          expect(indices[i]).toBeLessThan(totalVerts);
        }

        // Boundary edge count per surface must be exactly N * 4
        const edgeCount = new Map<string, number>();
        const addEdge = (v0: number, v1: number) => {
          const minV = Math.min(v0, v1);
          const maxV = Math.max(v0, v1);
          const key = `${minV}-${maxV}`;
          edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        };

        for (let t = 0; t < indicesPerSurface / 3; t++) {
          addEdge(indices[t * 3 + 0], indices[t * 3 + 1]);
          addEdge(indices[t * 3 + 1], indices[t * 3 + 2]);
          addEdge(indices[t * 3 + 2], indices[t * 3 + 0]);
        }

        let boundaryEdges = 0;
        for (const count of Array.from(edgeCount.values())) {
          if (count === 1) boundaryEdges++;
          expect(count).toBeLessThanOrEqual(2); // strictly manifold
        }
        expect(boundaryEdges).toBe(N * 4);

        // Euler characteristic
        const V = vertsPerSurface;
        const E = edgeCount.size;
        const F = indicesPerSurface / 3;
        expect(V - E + F).toBe(1);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 6: Cross-Pipeline Integration & Shader Invariants
  // --------------------------------------------------------------------------
  describe('Pillar 6: Cross-Pipeline Integration & Shader Invariants', () => {
    it('verifies culling.wgsl indirectCmd.indexCount matches exact patch indices (52224u)', () => {
      const code = fs.readFileSync(cullingWgslPath, 'utf8');
      expect(code).toMatch(/indirectCmd\.indexCount\s*=\s*52224u;/);
    });

    it('verifies WebGPUEngine.ts cdlodIndirectInitFloats matches 52224', () => {
      const code = fs.readFileSync(engineTsPath, 'utf8');
      expect(code).toContain('new Uint32Array([52224, 0, 0, 0, 0])');
    });

    it('verifies WebGPUEngine.ts patchVertexCount default is 8962', () => {
      const code = fs.readFileSync(engineTsPath, 'utf8');
      expect(code).toContain('public patchVertexCount: number = 8962;');
    });

    it('verifies crust_hydrosphere.wgsl applies skirtDepth displacement to crust and discards water skirts', () => {
      const code = fs.readFileSync(crustWgslPath, 'utf8');
      // Downward displacement along baseNormal for crust skirts
      expect(code).toContain('let skirtFactor = input.target2D.z;');
      expect(code).toContain('let isCrust = inSurfaceType < 0.5;');
      expect(code).toContain('let skirtDepth = select(0.0, max(0.015, inst.sizeUV.y * 0.35 * dispScale), isCrust && skirtFactor > 0.0);');
      expect(code).toContain('let worldP = basePos + baseNormal * (normalDisplacement - skirtDepth);');

      // Hydrosphere skirt fragments discarded
      expect(code).toContain('let isSkirt = input.skirtFactor > 0.5;');
      expect(code).toContain('if (input.surfaceType > 0.5 && isSkirt) {');
      expect(code).toContain('discard;');
    });
  });
});
