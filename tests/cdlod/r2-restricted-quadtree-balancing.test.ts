import { describe, it, expect, beforeEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine, QuadtreeNodeData } from '../../src/webgpu/WebGPUEngine';

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

export interface CandidateNode {
  lod: number;
  minU: number;
  minV: number;
  sizeU: number;
  sizeV: number;
  maxU: number;
  maxV: number;
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

export function getCandidatesFromFloats(engine: WebGPUEngine): CandidateNode[] {
  const count = engine.cdlodActiveNodeCount;
  const floats = (engine as any).cdlodCandidateFloats as Float32Array;
  const uints = (engine as any).cdlodCandidateUints as Uint32Array;
  const nodes: CandidateNode[] = [];
  for (let i = 0; i < count; i++) {
    const off = i * 12;
    const minU = floats[off + 4];
    const minV = floats[off + 5];
    const sizeU = floats[off + 6];
    const sizeV = floats[off + 7];
    const lod = uints[off + 8];
    nodes.push({
      lod,
      minU,
      minV,
      sizeU,
      sizeV,
      maxU: minU + sizeU,
      maxV: minV + sizeV,
    });
  }
  return nodes;
}

function checkAdjacency<T extends { lod: number; minU: number; minV: number; maxU: number; maxV: number }>(
  nodes: T[],
  isSphere: boolean
): { pairsChecked: number; maxDelta: number; violations: Array<{ a: T; b: T; delta: number }> } {
  let pairsChecked = 0;
  let maxDelta = 0;
  const violations: Array<{ a: T; b: T; delta: number }> = [];
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

describe('R2 Topological 2:1 Restricted Quadtree Balancing Pass', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  describe('Pillar 1: 2:1 Adjacency Invariant (Strict Zero Tolerance for DeltaLOD >= 2)', () => {
    it('verifies forall A ~card B: |LOD(A) - LOD(B)| <= 1 with steep equatorial distance gradient on sphere', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 0, 5.25); // Close zoom (~318 km altitude)
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);
      expect(nodes.length).toBeGreaterThan(0);

      const { pairsChecked, maxDelta, violations } = checkAdjacency(nodes, true);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });

    it('verifies 2:1 restriction with high-latitude grazing camera near North Pole', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 4.8, 2.0);
      camera.lookAt(0, 5.0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);
      expect(nodes.length).toBeGreaterThan(0);

      const { pairsChecked, maxDelta, violations } = checkAdjacency(nodes, true);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });

    it('verifies 2:1 restriction during continuous manifold deformation (Mode 1 Cylindrical Scroll, t = 0.5)', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(2.0, 1.5, 6.0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 1, 0.5, false);
      const nodes = getActiveNodes(engine);
      expect(nodes.length).toBeGreaterThan(0);

      const { pairsChecked, maxDelta, violations } = checkAdjacency(nodes, false);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });

    it('verifies 2:1 restriction on flat map sheet (t = 1.0) under local camera inspection', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(3.0, 2.0, 3.5);
      camera.lookAt(3.0, 2.0, 0.0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 1.0, false);
      const nodes = getActiveNodes(engine);
      expect(nodes.length).toBeGreaterThan(0);

      const { pairsChecked, maxDelta, violations } = checkAdjacency(nodes, false);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });
  });

  describe('Pillar 2: Boundary Topology (Periodic Wrap vs Neatline Severing)', () => {
    it('enforces antimeridian periodic wrap 2:1 balancing on the sphere (t < 0.01)', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      // Position directly viewing the antimeridian seam (z = -5.25)
      camera.position.set(0, 0, -5.25);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      // Find nodes touching Western seam (u = 0) and Eastern seam (u = 1)
      const westSeamNodes = nodes.filter((n) => n.minU < 1e-6);
      const eastSeamNodes = nodes.filter((n) => Math.abs(n.maxU - 1.0) < 1e-6);

      expect(westSeamNodes.length).toBeGreaterThan(0);
      expect(eastSeamNodes.length).toBeGreaterThan(0);

      // Every node on the west seam must have wrapped adjacent neighbors on the east seam differing by <= 1 LOD
      let wrapChecked = 0;
      for (const w of westSeamNodes) {
        for (const e of eastSeamNodes) {
          const overlapV = Math.min(w.maxV, e.maxV) - Math.max(w.minV, e.minV);
          if (overlapV > 1e-6) {
            wrapChecked++;
            expect(Math.abs(w.lod - e.lod)).toBeLessThanOrEqual(1);
          }
        }
      }
      expect(wrapChecked).toBeGreaterThan(0);
    });

    it('enforces physical neatline sheet edge severing on flat map (t >= 0.01)', () => {
      // Wide-angle camera focused on eastern neatline (x = 14.0, z = 3.0) with full sheet in frustum
      const camera = new PerspectiveCamera(90, 3.5, 0.01, 100);
      camera.position.set(14.0, 0, 3.0);
      camera.lookAt(14.0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 1.0, false);
      const nodes = getActiveNodes(engine);

      // Eastern boundary nodes (maxU >= 0.9) subdivide to high LOD near camera
      const eastNodes = nodes.filter((n) => n.maxU >= 0.9);
      expect(eastNodes.length).toBeGreaterThan(0);
      const maxEastLod = Math.max(...eastNodes.map((n) => n.lod));
      expect(maxEastLod).toBeGreaterThanOrEqual(4);

      // On flat map sheet (t = 1.0), the far Western boundary (minU <= 0.25) across the desk
      // is severed from the eastern neatline. It remains at coarse LOD (<= 2),
      // demonstrating that high LOD on the east neatline does NOT ripple wrap across to the west.
      const farWestNodes = nodes.filter((n) => n.minU <= 0.25);
      expect(farWestNodes.length).toBeGreaterThan(0);
      for (const w of farWestNodes) {
        expect(w.lod).toBeLessThanOrEqual(2);
      }

      // DeltaLOD across the severed neatlines is >= 2 (e.g. LOD 4 on East vs LOD 2 on West),
      // which would be an invariant violation on a sphere, but is valid on a severed flat sheet.
      expect(maxEastLod - Math.min(...farWestNodes.map((n) => n.lod))).toBeGreaterThanOrEqual(2);

      // In addition, verify that the 2:1 planar adjacency check has zero violations across the sheet
      const { violations } = checkAdjacency(nodes, false); // isSphere = false
      expect(violations).toHaveLength(0);
    });
  });

  describe('Pillar 3: Ripple Propagation & Multi-Level Cascade', () => {
    it('propagates multi-level cascade balancing when high-LOD node forces ancestor subdivision', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      // Orbital camera showing globe with multiple concentric LOD rings
      camera.position.set(0, 0, 11.0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      const maxLod = Math.max(...nodes.map((n) => n.lod));
      expect(maxLod).toBeGreaterThanOrEqual(3);

      // Verify that multiple active leaf LOD levels coexist simultaneously
      const minLod = Math.min(...nodes.map((n) => n.lod));
      expect(minLod).toBeLessThan(maxLod);

      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);

      // No active node at maxLod may directly border any active node with LOD <= maxLod - 2
      for (const n of nodes) {
        if (n.lod === maxLod) {
          for (const other of nodes) {
            if (other.lod <= maxLod - 2) {
              const touchU = Math.abs(n.maxU - other.minU) < 1e-6 || Math.abs(other.maxU - n.minU) < 1e-6;
              const overlapV = Math.min(n.maxV, other.maxV) - Math.max(n.minV, other.minV);
              const touchV = Math.abs(n.maxV - other.minV) < 1e-6 || Math.abs(other.maxV - n.minV) < 1e-6;
              const overlapU = Math.min(n.maxU, other.maxU) - Math.max(n.minU, other.minU);

              const isAdjacent = (touchU && overlapV > 1e-6) || (touchV && overlapU > 1e-6);
              expect(isAdjacent).toBe(false);
            }
          }
        }
      }
    });

    it('verifies spatial hash operations: insertion, collision resolution, removal with tombstones, and key roundtripping', () => {
      // Test key roundtripping: (lod << 25) | (y << 13) | x
      for (const lod of [0, 1, 3, 5, 8, 12]) {
        for (const y of [0, 1, 15, 255, 4095]) {
          for (const x of [0, 1, 31, 1023, 8191]) {
            const key = (lod << 25) | (y << 13) | x;
            const recX = key & 0x1fff;
            const recY = (key >>> 13) & 0xfff;
            const recLod = (key >>> 25) & 0xf;
            expect(recX).toBe(x);
            expect(recY).toBe(y);
            expect(recLod).toBe(lod);
          }
        }
      }

      // Hash operations test
      (engine as any).cdlodSpatialHashKeys.fill(-1);
      const keyA = (3 << 25) | (4 << 13) | 5;
      const keyB = (3 << 25) | (4 << 13) | 6;

      (engine as any).hashInsert(keyA, 42);
      (engine as any).hashInsert(keyB, 99);

      expect((engine as any).hashLookup(keyA)).toBe(42);
      expect((engine as any).hashLookup(keyB)).toBe(99);
      expect((engine as any).hashLookup(999999)).toBe(-1);

      // Remove keyA (tombstone)
      (engine as any).hashRemove(keyA);
      expect((engine as any).hashLookup(keyA)).toBe(-1);
      // KeyB must still be found past the tombstone
      expect((engine as any).hashLookup(keyB)).toBe(99);

      // Re-insert into tombstone slot
      const keyC = (3 << 25) | (4 << 13) | 7;
      (engine as any).hashInsert(keyC, 123);
      expect((engine as any).hashLookup(keyC)).toBe(123);
      expect((engine as any).hashLookup(keyB)).toBe(99);
    });
  });

  describe('Pillar 4: Zero-GC Invariant (Rule 26 Compliance)', () => {
    it('preserves identical typed array and pool references across 100 consecutive frames with moving camera', () => {
      const initialKeysRef = (engine as any).cdlodSpatialHashKeys;
      const initialValuesRef = (engine as any).cdlodSpatialHashValues;
      const initialQueueRef = (engine as any).cdlodRippleQueue;
      const initialCandidateFloatsRef = (engine as any).cdlodCandidateFloats;
      const initialPoolRef = (engine as any).cdlodNodePool;

      expect(initialKeysRef.length).toBe(16384);
      expect(initialValuesRef.length).toBe(16384);
      expect(initialQueueRef.length).toBe(4096);
      expect(initialCandidateFloatsRef.length).toBe(WebGPUEngine.CDLOD_MAX_NODES * 12);
      expect(initialPoolRef.length).toBe(WebGPUEngine.CDLOD_MAX_NODES);

      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);

      for (let frame = 0; frame < 100; frame++) {
        const angle = (frame / 100) * Math.PI * 2;
        const radius = 5.5 + Math.sin(frame * 0.1) * 0.3;
        camera.position.set(
          radius * Math.cos(angle),
          Math.sin(frame * 0.05) * 2.0,
          radius * Math.sin(angle)
        );
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, frame % 4, (frame % 50) / 50, frame % 2 === 0);

        // Active node count must never exceed preallocated pool bounds
        expect(engine.cdlodActiveNodeCount).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);
        expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
      }

      // Assert zero re-allocations (strict reference equality)
      expect((engine as any).cdlodSpatialHashKeys).toBe(initialKeysRef);
      expect((engine as any).cdlodSpatialHashValues).toBe(initialValuesRef);
      expect((engine as any).cdlodRippleQueue).toBe(initialQueueRef);
      expect((engine as any).cdlodCandidateFloats).toBe(initialCandidateFloatsRef);
      expect((engine as any).cdlodNodePool).toBe(initialPoolRef);
    });
  });

  describe('Pillar 5: Adversarial 500+ Randomized Camera Fuzzing & Adjacency Stress Harness', () => {
    it(
      'stress-tests 500+ randomized camera positions across grazing, nadir, high latitudes, Andes, and Himalayas with strictly ZERO instances of DeltaLOD >= 2',
      () => {
        // Deterministic PRNG (Mulberry32)
        let seed = 133742;
        function rnd(): number {
          let t = (seed += 0x6d2b79f5);
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
        let totalFramesChecked = 0;
        let totalCandidatePairsChecked = 0;
        let overallMaxDelta = 0;
        const allViolations: Array<{
          frame: number;
          desc: string;
          delta: number;
          lodA: number;
          lodB: number;
        }> = [];

        // 600 frames partitioned across 6 adversarial stress categories
        for (let frame = 0; frame < 600; frame++) {
          let desc = '';
          let mode = 0;
          let unfurl = 0.0;
          let fov = 45;
          let aspect = 1.0;
          let posX = 0, posY = 0, posZ = 15;
          let targetX = 0, targetY = 0, targetZ = 0;

          if (frame < 100) {
            // Bucket 1: Grazing angles near sphere/sheet surface
            desc = 'Grazing angle';
            mode = frame % 3;
            unfurl = mode === 0 ? 0.0 : rnd();
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
            const alt = 0.005 + rnd() * 0.12; // 6 km to 150 km altitude

            posX = p1[0] + (nx / nLen) * alt;
            posY = p1[1] + (ny / nLen) * alt;
            posZ = p1[2] + (nz / nLen) * alt;

            // Look tangentially along the surface towards p2
            const u2 = (u1 + 0.1 + rnd() * 0.3) % 1.0;
            const v2 = Math.max(0.05, Math.min(0.95, v1 + (rnd() - 0.5) * 0.3));
            const p2 = WebGPUEngine.evaluateManifoldPosition(u2, v2, mode, unfurl);
            targetX = p2[0];
            targetY = p2[1];
            targetZ = p2[2];
            fov = 30 + rnd() * 60;
          } else if (frame < 200) {
            // Bucket 2: Sub-surface and extreme nadir
            desc = 'Sub-surface nadir';
            mode = frame % 2;
            unfurl = mode === 0 ? 0.0 : rnd() * 0.5;
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
            const alt = -0.05 + rnd() * 0.1; // -60 km (sub-surface) to +60 km nadir

            posX = p1[0] + (nx / nLen) * alt;
            posY = p1[1] + (ny / nLen) * alt;
            posZ = p1[2] + (nz / nLen) * alt;

            // Look directly at p1 on the manifold
            targetX = p1[0];
            targetY = p1[1];
            targetZ = p1[2];
            fov = 45 + rnd() * 45;
          } else if (frame < 300) {
            // Bucket 3: High latitudes (Arctic & Antarctic)
            desc = 'High latitude polar';
            mode = 0;
            unfurl = rnd() < 0.2 ? 0.0 : rnd();
            const isNorth = rnd() > 0.5;
            const u1 = rnd();
            const v1 = isNorth ? 0.005 + rnd() * 0.08 : 0.915 + rnd() * 0.08;
            const p1 = WebGPUEngine.evaluateManifoldPosition(u1, v1, mode, unfurl);
            const alt = 0.05 + rnd() * 2.5;

            posX = p1[0] * (1.0 + alt / 5.0);
            posY = p1[1] * (1.0 + alt / 5.0);
            posZ = p1[2] * (1.0 + alt / 5.0);

            // Look across the pole
            const pPole = WebGPUEngine.evaluateManifoldPosition((u1 + 0.5) % 1.0, isNorth ? 0.02 : 0.98, mode, unfurl);
            targetX = pPole[0];
            targetY = pPole[1];
            targetZ = pPole[2];
            fov = 35 + rnd() * 50;
          } else if (frame < 400) {
            // Bucket 4: Steep distance gradients across Andes and Himalayas
            const isAndes = (frame % 2) === 0;
            desc = isAndes ? 'Steep gradient Andes' : 'Steep gradient Himalayas';
            mode = 0;
            unfurl = 0.0;
            // Andes: lat -20, lon -70 (u ~ 0.3055, v ~ 0.6111)
            // Himalayas: lat 28, lon 85 (u ~ 0.7361, v ~ 0.3444)
            const uBase = isAndes ? 0.3055 : 0.7361;
            const vBase = isAndes ? 0.6111 : 0.3444;
            const u1 = uBase + (rnd() - 0.5) * 0.02;
            const v1 = vBase + (rnd() - 0.5) * 0.02;
            const p1 = WebGPUEngine.evaluateManifoldPosition(u1, v1, mode, unfurl);
            const alt = 0.005 + rnd() * 0.05; // 6 km to 60 km right above mountain peak

            posX = p1[0] * (1.0 + alt / 5.0);
            posY = p1[1] * (1.0 + alt / 5.0);
            posZ = p1[2] * (1.0 + alt / 5.0);

            // Look across to distant horizon point on the globe
            const u2 = (u1 + (rnd() > 0.5 ? 0.25 : -0.25) + 1.0) % 1.0;
            const v2 = Math.max(0.1, Math.min(0.9, v1 + (rnd() - 0.5) * 0.2));
            const p2 = WebGPUEngine.evaluateManifoldPosition(u2, v2, mode, unfurl);
            targetX = p2[0];
            targetY = p2[1];
            targetZ = p2[2];
            fov = 25 + rnd() * 55;
          } else if (frame < 500) {
            // Bucket 5: Continuous manifold unroll deformations and antimeridian threshold
            desc = 'Manifold unroll & antimeridian';
            mode = 1; // Cylindrical scroll
            // Alternate around the 0.01 unroll threshold to test transition
            unfurl = frame % 2 === 0 ? 0.005 + rnd() * 0.005 : 0.01 + rnd() * 0.98;
            // Focus on antimeridian seam (u ~ 0 or u ~ 1)
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
            fov = 40 + rnd() * 40;
          } else {
            // Bucket 6: Global Monte Carlo fuzzing
            desc = 'Monte Carlo fuzzing';
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
            const alt = 0.05 + rnd() * 15.0;

            posX = p1[0] + (nx / nLen) * alt;
            posY = p1[1] + (ny / nLen) * alt;
            posZ = p1[2] + (nz / nLen) * alt;

            targetX = p1[0];
            targetY = p1[1];
            targetZ = p1[2];
            fov = 15 + rnd() * 95;
            aspect = 0.5 + rnd() * 1.5;
          }

          camera.fov = fov;
          camera.aspect = aspect;
          camera.position.set(posX, posY, posZ);
          camera.lookAt(targetX, targetY, targetZ);
          camera.updateMatrixWorld();
          camera.updateProjectionMatrix();

          engine.updateCDLOD(camera, mode, unfurl, false);

          // Iterate through active candidate nodes directly from cdlodCandidateFloats
          const candidateNodes = getCandidatesFromFloats(engine);
          expect(candidateNodes.length).toBeGreaterThan(0);
          expect(candidateNodes.length).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);

          const isSphere = unfurl < 0.01;
          const { pairsChecked, maxDelta, violations } = checkAdjacency(candidateNodes, isSphere);

          totalFramesChecked++;
          totalCandidatePairsChecked += pairsChecked;
          if (maxDelta > overallMaxDelta) {
            overallMaxDelta = maxDelta;
          }

          if (violations.length > 0) {
            for (const v of violations) {
              allViolations.push({
                frame,
                desc,
                delta: v.delta,
                lodA: v.a.lod,
                lodB: v.b.lod,
              });
            }
          }
        }

        // Assert strictly ZERO instances of DeltaLOD >= 2 across all 600 frames
        console.log({
          totalFramesChecked,
          totalCandidatePairsChecked,
          overallMaxDelta,
          violationsCount: allViolations.length,
        });

        expect(allViolations).toHaveLength(0);
        expect(overallMaxDelta).toBeLessThanOrEqual(1);
        expect(totalFramesChecked).toBe(600);
        expect(totalCandidatePairsChecked).toBeGreaterThan(1000);
      },
      30000
    );
  });
});
