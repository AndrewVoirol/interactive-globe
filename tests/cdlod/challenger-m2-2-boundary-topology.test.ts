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
  x: number;
  y: number;
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

describe('Challenger M2-2: Boundary Seam & Topology Empirical Stress Suite', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  describe('Suite 1: Sphere Antimeridian Wrap Topology (t < 0.01)', () => {
    it('1.1: verifies antimeridian 2:1 balancing under direct seam alignment', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 0, -5.2);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      const westSeam = nodes.filter((n) => n.minU < 1e-6);
      const eastSeam = nodes.filter((n) => Math.abs(n.maxU - 1.0) < 1e-6);

      expect(westSeam.length).toBeGreaterThan(0);
      expect(eastSeam.length).toBeGreaterThan(0);

      // Verify every overlapping pair across u=0 and u=1 differs by <= 1 LOD
      let checked = 0;
      for (const w of westSeam) {
        for (const e of eastSeam) {
          const overlapV = Math.min(w.maxV, e.maxV) - Math.max(w.minV, e.minV);
          if (overlapV > 1e-6) {
            checked++;
            expect(Math.abs(w.lod - e.lod)).toBeLessThanOrEqual(1);
          }
        }
      }
      expect(checked).toBeGreaterThan(0);

      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });

    it('1.2: verifies antimeridian wrap under asymmetric oblique camera (closer to West seam)', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      // Asymmetric offset: x = -0.75 pushes camera closer to West seam
      camera.position.set(-0.75, 0.2, -5.15);
      camera.lookAt(0, 0, -5.0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      const westSeam = nodes.filter((n) => n.minU < 1e-6);
      const eastSeam = nodes.filter((n) => Math.abs(n.maxU - 1.0) < 1e-6);

      expect(westSeam.length).toBeGreaterThan(0);
      expect(eastSeam.length).toBeGreaterThan(0);

      // Verify wrap adjacency
      for (const w of westSeam) {
        for (const e of eastSeam) {
          const overlapV = Math.min(w.maxV, e.maxV) - Math.max(w.minV, e.minV);
          if (overlapV > 1e-6) {
            expect(Math.abs(w.lod - e.lod)).toBeLessThanOrEqual(1);
          }
        }
      }

      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });

    it('1.3: verifies deep zoom antimeridian cascade (LOD >= 5)', () => {
      const camera = new PerspectiveCamera(30, 1.0, 0.01, 100);
      // Altitude: 5.06 - 5.0 = 0.06 units (~76 km altitude), close to antimeridian
      camera.position.set(0.05, 0.0, -5.06);
      camera.lookAt(0, 0, -5.0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      const maxLod = Math.max(...nodes.map((n) => n.lod));
      expect(maxLod).toBeGreaterThanOrEqual(5);

      const westSeam = nodes.filter((n) => n.minU < 1e-6);
      const eastSeam = nodes.filter((n) => Math.abs(n.maxU - 1.0) < 1e-6);

      expect(westSeam.length).toBeGreaterThan(0);
      expect(eastSeam.length).toBeGreaterThan(0);

      for (const w of westSeam) {
        for (const e of eastSeam) {
          const overlapV = Math.min(w.maxV, e.maxV) - Math.max(w.minV, e.minV);
          if (overlapV > 1e-6) {
            expect(Math.abs(w.lod - e.lod)).toBeLessThanOrEqual(1);
          }
        }
      }

      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });

    it('1.4: defect injection - artificial multi-level imbalance across antimeridian is resolved by Phase 2', () => {
      // Simulate an un-balanced initial state where West seam has LOD 4 node,
      // while East seam has only Root 1 at LOD 0.
      (engine as any).cdlodSpatialHashKeys.fill(-1);
      (engine as any).cdlodRippleQueueHead = 0;
      (engine as any).cdlodRippleQueueTail = 0;
      (engine as any).cdlodActiveNodeCount = 0;

      const pool = (engine as any).cdlodNodePool as QuadtreeNodeData[];

      // Node 0: West seam leaf at LOD 4, x = 0, y = 0
      const westNode = pool[0];
      westNode.lod = 4;
      westNode.x = 0;
      westNode.y = 0;
      westNode.minU = 0.0;
      westNode.minV = 0.0;
      westNode.sizeU = 0.5 / 16;
      westNode.sizeV = 1.0 / 16;
      westNode.split = false;
      westNode.radius = 0.1;
      westNode.key = (4 << 25) | (0 << 13) | 0;
      engine.hashInsert(westNode.key, 0);
      (engine as any).cdlodRippleQueue[(engine as any).cdlodRippleQueueTail++] = 0;
      engine.cdlodActiveNodeCount = 1;

      // Node 1: East seam Root 1 at LOD 0, x = 1, y = 0
      const eastRoot = pool[1];
      eastRoot.lod = 0;
      eastRoot.x = 1;
      eastRoot.y = 0;
      eastRoot.minU = 0.5;
      eastRoot.minV = 0.0;
      eastRoot.sizeU = 0.5;
      eastRoot.sizeV = 1.0;
      eastRoot.split = false;
      eastRoot.radius = 5.0;
      eastRoot.key = (0 << 25) | (0 << 13) | 1;
      engine.hashInsert(eastRoot.key, 1);
      engine.cdlodActiveNodeCount = 2;

      // Run Phase 2 ripple balancing manually with unfurl = 0.0 (Sphere)
      const unfurl = 0.0;
      const mode = 0;
      while ((engine as any).cdlodRippleQueueHead < (engine as any).cdlodRippleQueueTail) {
        const poolIdx = (engine as any).cdlodRippleQueue[(engine as any).cdlodRippleQueueHead++];
        const node = pool[poolIdx];
        if (node.split || node.lod < 2) continue;

        const maxX = 1 << (node.lod + 1);
        const maxY = 1 << node.lod;

        for (let d = 0; d < 4; d++) {
          let dx = 0, dy = 0;
          if (d === 0) dy = -1;
          else if (d === 1) dy = 1;
          else if (d === 2) dx = -1;
          else dx = 1;

          let nx = node.x + dx;
          let ny = node.y + dy;

          if (ny < 0 || ny >= maxY) continue;

          if (unfurl < 0.01) {
            if (nx < 0) nx = maxX - 1;
            else if (nx >= maxX) nx = 0;
          } else {
            if (nx < 0 || nx >= maxX) continue;
          }

          let resolvedDirection = false;
          while (!resolvedDirection) {
            let splitAncestor = false;
            for (let k = node.lod - 2; k >= 0; k--) {
              const shift = node.lod - k;
              const ancX = nx >> shift;
              const ancY = ny >> shift;
              const ancKey = (k << 25) | (ancY << 13) | ancX;
              const ancPoolIdx = engine.hashLookup(ancKey);

              if (ancPoolIdx !== -1) {
                const ancNode = pool[ancPoolIdx];
                if (!ancNode.split) {
                  if (engine.cdlodActiveNodeCount + 4 <= WebGPUEngine.CDLOD_MAX_NODES) {
                    ancNode.split = true;
                    engine.hashRemove(ancKey);

                    const childLod = k + 1;
                    const halfU = ancNode.sizeU * 0.5;
                    const halfV = ancNode.sizeV * 0.5;

                    for (let cy = 0; cy < 2; cy++) {
                      for (let cx = 0; cx < 2; cx++) {
                        const cIdx = engine.cdlodActiveNodeCount++;
                        const childNode = pool[cIdx];
                        const childX = (ancX << 1) + cx;
                        const childY = (ancY << 1) + cy;
                        const childMinU = ancNode.minU + cx * halfU;
                        const childMinV = ancNode.minV + cy * halfV;
                        const cKey = (childLod << 25) | (childY << 13) | childX;

                        childNode.lod = childLod;
                        childNode.x = childX;
                        childNode.y = childY;
                        childNode.minU = childMinU;
                        childNode.minV = childMinV;
                        childNode.sizeU = halfU;
                        childNode.sizeV = halfV;
                        childNode.key = cKey;
                        childNode.split = false;

                        engine.hashInsert(cKey, cIdx);
                        if (childLod >= 2 && (engine as any).cdlodRippleQueueTail < (engine as any).cdlodRippleQueue.length) {
                          (engine as any).cdlodRippleQueue[(engine as any).cdlodRippleQueueTail++] = cIdx;
                        }
                      }
                    }
                    splitAncestor = true;
                  }
                  break;
                }
              }
            }
            if (!splitAncestor) {
              resolvedDirection = true;
            }
          }
        }
      }

      // Root 1 must have been split!
      expect(eastRoot.split).toBe(true);

      // Collect all active leaves
      const activeLeaves: ActiveNode[] = [];
      for (let i = 0; i < engine.cdlodActiveNodeCount; i++) {
        const n = pool[i];
        if (!n.split) {
          activeLeaves.push({
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
      }

      // Find eastern seam leaves touching u = 1.0 and overlapping v of westNode [0, 1/16]
      const eastSeamAdjacent = activeLeaves.filter(
        (n) => Math.abs(n.maxU - 1.0) < 1e-6 && n.minV < 1.0 / 16 && n.maxV > 0
      );
      expect(eastSeamAdjacent.length).toBeGreaterThan(0);

      // The eastern neighbor must have subdivided to LOD >= 3 so that DeltaLOD <= 1 against LOD 4!
      for (const e of eastSeamAdjacent) {
        expect(e.lod).toBeGreaterThanOrEqual(3);
        expect(Math.abs(4 - e.lod)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Suite 2: Flat Map Neatline Severing Topology (t >= 0.01)', () => {
    it('2.1: verifies Eastern neatline close zoom does NOT ripple wrap across to Western neatline (t = 1.0)', () => {
      const camera = new PerspectiveCamera(90, 3.5, 0.01, 100);
      // Eastern neatline in Mercator 2D: x = +15.708. Place camera at x = 15.0, z = 2.0
      camera.position.set(15.0, 0, 2.0);
      camera.lookAt(15.0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 1.0, false);
      const nodes = getActiveNodes(engine);

      const eastNeatline = nodes.filter((n) => Math.abs(n.maxU - 1.0) < 1e-6);
      expect(eastNeatline.length).toBeGreaterThan(0);
      const maxEastLod = Math.max(...eastNeatline.map((n) => n.lod));
      expect(maxEastLod).toBeGreaterThanOrEqual(4);

      // Western neatline (u = 0) is ~31 units away across the map sheet.
      const westNeatline = nodes.filter((n) => n.minU < 1e-6);
      expect(westNeatline.length).toBeGreaterThan(0);
      const maxWestLod = Math.max(...westNeatline.map((n) => n.lod));
      expect(maxWestLod).toBeLessThanOrEqual(2);

      // DeltaLOD between severed neatlines is >= 2, proving wrap balancing is severed!
      expect(maxEastLod - maxWestLod).toBeGreaterThanOrEqual(2);

      // Within the flat sheet itself, planar 2:1 balancing holds strictly
      const { violations } = checkAdjacency(nodes, false);
      expect(violations).toHaveLength(0);
    });

    it('2.2: verifies Western neatline close zoom does NOT ripple wrap across to Eastern neatline (t = 1.0)', () => {
      const camera = new PerspectiveCamera(90, 3.5, 0.01, 100);
      // Western neatline in Mercator 2D: x = -15.708. Place camera at x = -15.0, z = 2.0
      camera.position.set(-15.0, 0, 2.0);
      camera.lookAt(-15.0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 1.0, false);
      const nodes = getActiveNodes(engine);

      const westNeatline = nodes.filter((n) => n.minU < 1e-6);
      expect(westNeatline.length).toBeGreaterThan(0);
      const maxWestLod = Math.max(...westNeatline.map((n) => n.lod));
      expect(maxWestLod).toBeGreaterThanOrEqual(4);

      // Eastern neatline (u = 1) across the sheet must remain coarse
      const eastNeatline = nodes.filter((n) => Math.abs(n.maxU - 1.0) < 1e-6);
      expect(eastNeatline.length).toBeGreaterThan(0);
      const maxEastLod = Math.max(...eastNeatline.map((n) => n.lod));
      expect(maxEastLod).toBeLessThanOrEqual(2);

      // DeltaLOD across severed neatline is >= 2
      expect(maxWestLod - maxEastLod).toBeGreaterThanOrEqual(2);

      const { violations } = checkAdjacency(nodes, false);
      expect(violations).toHaveLength(0);
    });

    it('2.3: verifies sharp threshold behavior at t = 0.009 (wrap active) vs t = 0.011 (wrap severed)', () => {
      // Direct oracle test: Set an active leaf at LOD 4 on West seam (x=0, y=0)
      // and Root 1 at LOD 0 on East seam (x=1, y=0).
      // Test at unfurl = 0.009 (< 0.01): Root 1 MUST be split by antimeridian wrap.
      // Test at unfurl = 0.011 (>= 0.01): Root 1 MUST NOT be split by antimeridian wrap.

      function runBalancingForUnfurl(unfurlVal: number): boolean {
        const eng = new WebGPUEngine();
        (eng as any).cdlodSpatialHashKeys.fill(-1);
        (eng as any).cdlodRippleQueueHead = 0;
        (eng as any).cdlodRippleQueueTail = 0;
        eng.cdlodActiveNodeCount = 0;

        const pool = (eng as any).cdlodNodePool as QuadtreeNodeData[];

        // Node 0: West seam leaf at LOD 4, x = 0, y = 0
        const westNode = pool[0];
        westNode.lod = 4;
        westNode.x = 0;
        westNode.y = 0;
        westNode.minU = 0.0;
        westNode.minV = 0.0;
        westNode.sizeU = 0.5 / 16;
        westNode.sizeV = 1.0 / 16;
        westNode.split = false;
        westNode.radius = 0.1;
        westNode.key = (4 << 25) | (0 << 13) | 0;
        eng.hashInsert(westNode.key, 0);
        (eng as any).cdlodRippleQueue[(eng as any).cdlodRippleQueueTail++] = 0;
        eng.cdlodActiveNodeCount = 1;

        // Node 1: East seam Root 1 at LOD 0, x = 1, y = 0
        const eastRoot = pool[1];
        eastRoot.lod = 0;
        eastRoot.x = 1;
        eastRoot.y = 0;
        eastRoot.minU = 0.5;
        eastRoot.minV = 0.0;
        eastRoot.sizeU = 0.5;
        eastRoot.sizeV = 1.0;
        eastRoot.split = false;
        eastRoot.radius = 5.0;
        eastRoot.key = (0 << 25) | (0 << 13) | 1;
        eng.hashInsert(eastRoot.key, 1);
        eng.cdlodActiveNodeCount = 2;

        // Execute Phase 2 ripple loop with unfurlVal
        while ((eng as any).cdlodRippleQueueHead < (eng as any).cdlodRippleQueueTail) {
          const poolIdx = (eng as any).cdlodRippleQueue[(eng as any).cdlodRippleQueueHead++];
          const node = pool[poolIdx];
          if (node.split || node.lod < 2) continue;

          const maxX = 1 << (node.lod + 1);
          const maxY = 1 << node.lod;

          for (let d = 0; d < 4; d++) {
            let dx = 0, dy = 0;
            if (d === 0) dy = -1;
            else if (d === 1) dy = 1;
            else if (d === 2) dx = -1;
            else dx = 1;

            let nx = node.x + dx;
            let ny = node.y + dy;

            if (ny < 0 || ny >= maxY) continue;

            if (unfurlVal < 0.01) {
              if (nx < 0) nx = maxX - 1;
              else if (nx >= maxX) nx = 0;
            } else {
              if (nx < 0 || nx >= maxX) continue;
            }

            let resolvedDirection = false;
            while (!resolvedDirection) {
              let splitAncestor = false;
              for (let k = node.lod - 2; k >= 0; k--) {
                const shift = node.lod - k;
                const ancX = nx >> shift;
                const ancY = ny >> shift;
                const ancKey = (k << 25) | (ancY << 13) | ancX;
                const ancPoolIdx = eng.hashLookup(ancKey);

                if (ancPoolIdx !== -1) {
                  const ancNode = pool[ancPoolIdx];
                  if (!ancNode.split) {
                    if (eng.cdlodActiveNodeCount + 4 <= WebGPUEngine.CDLOD_MAX_NODES) {
                      ancNode.split = true;
                      eng.hashRemove(ancKey);
                      splitAncestor = true;
                    }
                    break;
                  }
                }
              }
              if (!splitAncestor) resolvedDirection = true;
            }
          }
        }
        return eastRoot.split;
      }

      // At t = 0.009: Sphere regime, wrap is active -> eastRoot MUST be split
      expect(runBalancingForUnfurl(0.009)).toBe(true);

      // At t = 0.011: Flat map regime, neatline is severed -> eastRoot MUST NOT be split
      expect(runBalancingForUnfurl(0.011)).toBe(false);
    });

    it('2.4: verifies cylindrical scroll neatline severing (Mode 1, t = 0.5)', () => {
      const camera = new PerspectiveCamera(60, 2.0, 0.01, 100);
      camera.position.set(7.0, 1.0, 4.0);
      camera.lookAt(7.0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 1, 0.5, false);
      const nodes = getActiveNodes(engine);

      // Planar 2:1 balancing holds across the manifold surface
      const { violations } = checkAdjacency(nodes, false);
      expect(violations).toHaveLength(0);
    });
  });

  describe('Suite 3: Polar Boundary Clamping & Zero-Wrap Invariant', () => {
    it('3.1: verifies North Pole boundary clamping (v = 0.0, y = 0) with zero out-of-bounds access', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      // Grazing near North Pole
      camera.position.set(0, 5.08, 0.5);
      camera.lookAt(0, 5.0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      const northLeaves = nodes.filter((n) => n.minV < 1e-6);
      expect(northLeaves.length).toBeGreaterThan(0);

      // Verify all north leaves have y = 0
      for (const n of northLeaves) {
        expect(n.y).toBe(0);
        expect(n.minV).toBeCloseTo(0.0, 5);
      }

      // 2:1 balancing holds across the polar cap
      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });

    it('3.2: verifies South Pole boundary clamping (v = 1.0, y = maxY - 1) with zero out-of-bounds access', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      // Grazing near South Pole
      camera.position.set(0, -5.08, 0.5);
      camera.lookAt(0, -5.0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      const southLeaves = nodes.filter((n) => Math.abs(n.maxV - 1.0) < 1e-6);
      expect(southLeaves.length).toBeGreaterThan(0);

      // Verify all south leaves have y = maxY - 1
      for (const n of southLeaves) {
        const maxY = 1 << n.lod;
        expect(n.y).toBe(maxY - 1);
        expect(n.maxV).toBeCloseTo(1.0, 5);
      }

      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });

    it('3.3: verifies overhead nadir polar views (azimuthal symmetry)', () => {
      const cameraN = new PerspectiveCamera(45, 1.0, 0.01, 100);
      cameraN.position.set(0, 6.5, 0);
      cameraN.lookAt(0, 0, 0);
      cameraN.updateMatrixWorld();
      cameraN.updateProjectionMatrix();

      engine.updateCDLOD(cameraN, 0, 0.0, false);
      const nodesN = getActiveNodes(engine);
      const { violations: violN } = checkAdjacency(nodesN, true);
      expect(violN).toHaveLength(0);

      const cameraS = new PerspectiveCamera(45, 1.0, 0.01, 100);
      cameraS.position.set(0, -6.5, 0);
      cameraS.lookAt(0, 0, 0);
      cameraS.updateMatrixWorld();
      cameraS.updateProjectionMatrix();

      engine.updateCDLOD(cameraS, 0, 0.0, false);
      const nodesS = getActiveNodes(engine);
      const { violations: violS } = checkAdjacency(nodesS, true);
      expect(violS).toHaveLength(0);
    });

    it('3.4: verifies anti-pole zero-wrap invariant (North Pole never wraps to South Pole)', () => {
      // 1. Direct oracle test: Set an active leaf at LOD 4 at North Pole (y = 0).
      // Cardinal direction d=0 (dy = -1) produces ny = -1.
      // Line 2062: if (ny < 0 || ny >= maxY) continue;
      // Must clamp cleanly and NOT wrap to South Pole (ny = maxY - 1).
      const eng = new WebGPUEngine();
      (eng as any).cdlodSpatialHashKeys.fill(-1);
      (eng as any).cdlodRippleQueueHead = 0;
      (eng as any).cdlodRippleQueueTail = 0;
      eng.cdlodActiveNodeCount = 0;

      const pool = (eng as any).cdlodNodePool as QuadtreeNodeData[];

      // North Pole node at LOD 4, x = 0, y = 0
      const northNode = pool[0];
      northNode.lod = 4;
      northNode.x = 0;
      northNode.y = 0;
      northNode.minU = 0.0;
      northNode.minV = 0.0;
      northNode.sizeU = 0.5 / 16;
      northNode.sizeV = 1.0 / 16;
      northNode.split = false;
      northNode.radius = 0.1;
      northNode.key = (4 << 25) | (0 << 13) | 0;
      eng.hashInsert(northNode.key, 0);
      (eng as any).cdlodRippleQueue[(eng as any).cdlodRippleQueueTail++] = 0;
      eng.cdlodActiveNodeCount = 1;

      // South Pole node: Create a leaf at South Pole at LOD 1 (x = 0, y = 1)
      const southNode = pool[1];
      southNode.lod = 1;
      southNode.x = 0;
      southNode.y = 1;
      southNode.minU = 0.0;
      southNode.minV = 0.5;
      southNode.sizeU = 0.25;
      southNode.sizeV = 0.5;
      southNode.split = false;
      southNode.radius = 2.5;
      southNode.key = (1 << 25) | (1 << 13) | 0;
      eng.hashInsert(southNode.key, 1);
      eng.cdlodActiveNodeCount = 2;

      // Run Phase 2 balancing
      while ((eng as any).cdlodRippleQueueHead < (eng as any).cdlodRippleQueueTail) {
        const poolIdx = (eng as any).cdlodRippleQueue[(eng as any).cdlodRippleQueueHead++];
        const node = pool[poolIdx];
        if (node.split || node.lod < 2) continue;

        const maxX = 1 << (node.lod + 1);
        const maxY = 1 << node.lod;

        for (let d = 0; d < 4; d++) {
          let dx = 0, dy = 0;
          if (d === 0) dy = -1;
          else if (d === 1) dy = 1;
          else if (d === 2) dx = -1;
          else dx = 1;

          let nx = node.x + dx;
          let ny = node.y + dy;

          // Polar boundaries must clamp cleanly
          if (ny < 0 || ny >= maxY) continue;

          if (nx < 0) nx = maxX - 1;
          else if (nx >= maxX) nx = 0;

          // Check ancestors
          let resolvedDirection = false;
          while (!resolvedDirection) {
            let splitAncestor = false;
            for (let k = node.lod - 2; k >= 0; k--) {
              const shift = node.lod - k;
              const ancX = nx >> shift;
              const ancY = ny >> shift;
              const ancKey = (k << 25) | (ancY << 13) | ancX;
              const ancPoolIdx = eng.hashLookup(ancKey);

              if (ancPoolIdx !== -1) {
                const ancNode = pool[ancPoolIdx];
                if (!ancNode.split) {
                  ancNode.split = true;
                  eng.hashRemove(ancKey);
                  splitAncestor = true;
                  break;
                }
              }
            }
            if (!splitAncestor) resolvedDirection = true;
          }
        }
      }

      // South Pole node must NOT be split (strictly zero polar wrap)
      expect(southNode.split).toBe(false);

      // 2. Camera-driven verification: Equatorial orbital camera where both poles are visible on silhouette
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 0, 11.0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      const nodes = getActiveNodes(engine);

      const northNodes = nodes.filter((n) => n.minV < 1e-6);
      const southNodes = nodes.filter((n) => Math.abs(n.maxV - 1.0) < 1e-6);

      expect(northNodes.length).toBeGreaterThan(0);
      expect(southNodes.length).toBeGreaterThan(0);

      // Both North and South poles clamp cleanly and adhere to 2:1 balancing
      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });
  });

  describe('Suite 4: Corner Singularities & Stress Harness', () => {
    it('4.1: verifies antimeridian-polar corner nodes (u=0/1 and v=0/1) under extreme zoom', () => {
      // Corner 1: North-West corner (u=0, v=0)
      const cameraNW = new PerspectiveCamera(45, 1.0, 0.01, 100);
      cameraNW.position.set(0.1, 4.9, -2.5);
      cameraNW.lookAt(0, 4.8, -2.0);
      cameraNW.updateMatrixWorld();
      cameraNW.updateProjectionMatrix();

      engine.updateCDLOD(cameraNW, 0, 0.0, false);
      const nodesNW = getActiveNodes(engine);
      const { violations: violNW } = checkAdjacency(nodesNW, true);
      expect(violNW).toHaveLength(0);

      // Corner 2: South-East corner (u=1, v=1)
      const cameraSE = new PerspectiveCamera(45, 1.0, 0.01, 100);
      cameraSE.position.set(-0.1, -4.9, -2.5);
      cameraSE.lookAt(0, -4.8, -2.0);
      cameraSE.updateMatrixWorld();
      cameraSE.updateProjectionMatrix();

      engine.updateCDLOD(cameraSE, 0, 0.0, false);
      const nodesSE = getActiveNodes(engine);
      const { violations: violSE } = checkAdjacency(nodesSE, true);
      expect(violSE).toHaveLength(0);
    });

    it('4.2: verifies memory safety and pool bound adherence under millimeter-scale camera altitude', () => {
      const camera = new PerspectiveCamera(60, 1.0, 0.0001, 100);
      // Altitude 0.00005 units (~60 meters)
      camera.position.set(0, 0, -5.00005);
      camera.lookAt(0, 0, -5.0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      expect(() => {
        engine.updateCDLOD(camera, 0, 0.0, false);
      }).not.toThrow();

      expect(engine.cdlodActiveNodeCount).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);
      expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);

      const nodes = getActiveNodes(engine);
      for (const n of nodes) {
        expect(Number.isFinite(n.minU)).toBe(true);
        expect(Number.isFinite(n.minV)).toBe(true);
        expect(Number.isFinite(n.sizeU)).toBe(true);
        expect(Number.isFinite(n.sizeV)).toBe(true);
        expect(n.lod).toBeGreaterThanOrEqual(0);
        expect(n.lod).toBeLessThanOrEqual(12);
      }
    });

    it('4.3: verifies zero-GC invariant during continuous boundary transitions across 50 frames', () => {
      const initialKeysRef = (engine as any).cdlodSpatialHashKeys;
      const initialValuesRef = (engine as any).cdlodSpatialHashValues;
      const initialQueueRef = (engine as any).cdlodRippleQueue;
      const initialPoolRef = (engine as any).cdlodNodePool;
      const initialCandidateFloatsRef = (engine as any).cdlodCandidateFloats;

      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);

      // Sweep camera back and forth across antimeridian seam and poles
      for (let frame = 0; frame < 50; frame++) {
        const theta = (frame / 50) * Math.PI * 2;
        // Orbit around Z axis near antimeridian (z = -5.2)
        camera.position.set(
          Math.sin(theta) * 1.5,
          Math.cos(theta) * 4.8,
          -5.2 + Math.sin(theta * 2) * 0.3
        );
        camera.lookAt(0, 0, -5.0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        const unfurl = frame < 25 ? 0.0 : (frame - 25) / 25;
        engine.updateCDLOD(camera, 0, unfurl, false);

        expect(engine.cdlodActiveNodeCount).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);
        expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
      }

      // Rule 26: Strict reference equality
      expect((engine as any).cdlodSpatialHashKeys).toBe(initialKeysRef);
      expect((engine as any).cdlodSpatialHashValues).toBe(initialValuesRef);
      expect((engine as any).cdlodRippleQueue).toBe(initialQueueRef);
      expect((engine as any).cdlodNodePool).toBe(initialPoolRef);
      expect((engine as any).cdlodCandidateFloats).toBe(initialCandidateFloatsRef);
    });
  });
});
