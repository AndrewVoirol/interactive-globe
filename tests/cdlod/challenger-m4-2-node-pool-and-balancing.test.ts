// ============================================================================
// File: tests/cdlod/challenger-m4-2-node-pool-and-balancing.test.ts
// Test Tier: Milestone 4 Challenger (Node Pool Budget & Quadtree Fuzzing Challenger)
// Description: Empirically challenges node pool capacity (CDLOD_MAX_NODES = 4096)
//              and 2:1 restricted quadtree balancing (|DeltaLOD| <= 1) under regional
//              zoom (Hawaii, Mount Fuji, Alps) down to ground altitudes (15 km, 10 km, 5 km).
//              Fuzzes camera trajectories intersecting regional boundaries.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

describe('Challenger M4-2: Node Pool Budget & Quadtree Balancing Invariant Stress Suite', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  // ==========================================================================
  // Suite 1: Ground Altitude Zoom Stress (Hawaii, Mount Fuji, Alps @ 15km, 10km, 5km)
  // ==========================================================================
  describe('Suite 1: Ground Altitude Zoom Stress (Hawaii, Mount Fuji, Alps)', () => {
    const testRegions = [
      {
        name: 'Hawaii',
        id: 'hawaii',
        bounds: [-161.0, 18.0, -154.0, 23.0] as [number, number, number, number],
        centerLon: -157.5,
        centerLat: 20.5,
        width: 5400,
        height: 3600,
      },
      {
        name: 'Mount Fuji',
        id: 'fuji',
        bounds: [138.5, 35.2, 139.0, 35.5] as [number, number, number, number],
        centerLon: 138.73,
        centerLat: 35.36,
        width: 900,
        height: 540,
      },
      {
        name: 'Alps',
        id: 'alps',
        bounds: [5.0, 45.0, 15.0, 48.0] as [number, number, number, number],
        centerLon: 10.0,
        centerLat: 46.5,
        width: 3000,
        height: 1500,
      },
    ];

    const altitudesKm = [15.0, 10.0, 5.0, 2.0, 1.0];

    for (const region of testRegions) {
      for (const altKm of altitudesKm) {
        it(`evaluates ${region.name} at ${altKm} km altitude: leaf node count < 4096 and 2:1 balancing holds`, () => {
          engine.activeRegionalDEM = {
            texture: {} as any,
            view: {} as any,
            bounds: region.bounds,
            width: region.width,
            height: region.height,
            id: region.id,
          };

          const u = (region.centerLon + 180.0) / 360.0;
          const v = (90.0 - region.centerLat) / 180.0;
          const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);

          const altUnits = altKm / 1274.2;
          const scale = (5.0 + altUnits) / 5.0;

          const camera = new PerspectiveCamera(50, 1.0, 0.001, 100);
          camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
          camera.lookAt(p3D[0], p3D[1], p3D[2]);
          camera.updateMatrixWorld();
          camera.updateProjectionMatrix();

          engine.updateCDLOD(camera, 0, 0.0, false);

          const activeCount = engine.cdlodActiveNodeCount;
          expect(activeCount).toBeGreaterThan(0);
          // Strict invariant: active leaf nodes must remain within CDLOD_MAX_NODES (4096)
          expect(activeCount).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);

          // If close enough, LOD 12 must be engaged inside the regional DEM
          if (altKm <= 10.0) {
            expect(engine.lastMaxLodSeen).toBe(12);
          }

          const nodes = getActiveNodes(engine);
          expect(nodes.length).toBe(activeCount);

          const { pairsChecked, maxDelta, violations } = checkAdjacency(nodes, true);
          expect(pairsChecked).toBeGreaterThan(0);
          expect(violations).toHaveLength(0);
          expect(maxDelta).toBeLessThanOrEqual(1);
        });
      }
    }
  });

  // ==========================================================================
  // Suite 2: Oblique Grazing Angles & Wide-FOV Horizon Scenarios
  // ==========================================================================
  describe('Suite 2: Oblique Grazing Angles & Wide-FOV Horizon Scenarios', () => {
    it('stresses oblique viewing angle over Hawaii at 5km altitude with wide FOV (80 degrees)', () => {
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      const u = (-157.5 + 180.0) / 360.0;
      const v = (90.0 - 20.5) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);

      const altUnits = 5.0 / 1274.2;
      const scale = (5.0 + altUnits) / 5.0;

      // Look tangentially toward California (lon -120, lat 34)
      const uTgt = (-120.0 + 180.0) / 360.0;
      const vTgt = (90.0 - 34.0) / 180.0;
      const pTgt = WebGPUEngine.evaluateManifoldPosition(uTgt, vTgt, 0, 0.0, 5.0);

      const camera = new PerspectiveCamera(80, 16 / 9, 0.001, 100);
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(pTgt[0], pTgt[1], pTgt[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
      expect(engine.cdlodActiveNodeCount).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);

      const nodes = getActiveNodes(engine);
      const { pairsChecked, maxDelta, violations } = checkAdjacency(nodes, true);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });

    it('stresses ultra-wide FOV (110 degrees) at 5km altitude centered directly on regional boundary edge', () => {
      // Fuji boundary edge: minLon = 138.5, maxLon = 139.0
      // Position camera right at lon = 138.5, lat = 35.36 (exact western edge of regional DEM)
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [138.5, 35.2, 139.0, 35.5],
        width: 900,
        height: 540,
        id: 'fuji',
      };

      const edgeLon = 138.5;
      const edgeLat = 35.36;
      const u = (edgeLon + 180.0) / 360.0;
      const v = (90.0 - edgeLat) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);

      const altUnits = 5.0 / 1274.2;
      const scale = (5.0 + altUnits) / 5.0;

      const camera = new PerspectiveCamera(110, 1.0, 0.001, 100);
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
      expect(engine.cdlodActiveNodeCount).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);

      const nodes = getActiveNodes(engine);
      const { pairsChecked, maxDelta, violations } = checkAdjacency(nodes, true);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });

  });

  // ==========================================================================
  // Suite 3: Adversarial Camera Trajectory Fuzzing Across Regional Boundaries
  // ==========================================================================
  describe('Suite 3: Adversarial Camera Trajectory Fuzzing Across Regional Boundaries', () => {
    it(
      'fuzzes 300 camera steps along boundary-crossing paths for Hawaii, Fuji, and Alps with strictly zero 2:1 balancing violations',
      () => {
        let seed = 987654321;
        function rnd(): number {
          let t = (seed += 0x6d2b79f5);
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        const regions = [
          {
            bounds: [-161.0, 18.0, -154.0, 23.0] as [number, number, number, number],
            id: 'hawaii',
            width: 5400,
            height: 3600,
          },
          {
            bounds: [138.5, 35.2, 139.0, 35.5] as [number, number, number, number],
            id: 'fuji',
            width: 900,
            height: 540,
          },
          {
            bounds: [5.0, 45.0, 15.0, 48.0] as [number, number, number, number],
            id: 'alps',
            width: 3000,
            height: 1500,
          },
        ];

        const camera = new PerspectiveCamera(50, 1.0, 0.001, 100);
        let totalSteps = 0;
        let totalPairs = 0;
        let overallMaxDelta = 0;
        let maxNodeCountSeen = 0;
        const violations: Array<{ step: number; delta: number; lodA: number; lodB: number; region: string }> = [];

        // 3 regions x 100 steps each = 300 steps
        for (const reg of regions) {
          engine.activeRegionalDEM = {
            texture: {} as any,
            view: {} as any,
            bounds: reg.bounds,
            width: reg.width,
            height: reg.height,
            id: reg.id,
          };

          const [minLon, minLat, maxLon, maxLat] = reg.bounds;
          const spanLon = maxLon - minLon;
          const spanLat = maxLat - minLat;

          for (let step = 0; step < 100; step++) {
            // Traverse from outside (boundary - 1.5*span) to inside to outside (boundary + 1.5*span)
            // with randomized zig-zags crossing all 4 edges (West, East, South, North)
            const t = step / 100;
            const edgeChoice = step % 4;
            let lon = 0;
            let lat = 0;

            if (edgeChoice === 0) {
              // Crossing West boundary (minLon)
              lon = minLon + (t * 3.0 - 1.5) * spanLon * 0.5;
              lat = minLat + rnd() * spanLat;
            } else if (edgeChoice === 1) {
              // Crossing East boundary (maxLon)
              lon = maxLon + (t * 3.0 - 1.5) * spanLon * 0.5;
              lat = minLat + rnd() * spanLat;
            } else if (edgeChoice === 2) {
              // Crossing South boundary (minLat)
              lon = minLon + rnd() * spanLon;
              lat = minLat + (t * 3.0 - 1.5) * spanLat * 0.5;
            } else {
              // Crossing North boundary (maxLat)
              lon = minLon + rnd() * spanLon;
              lat = maxLat + (t * 3.0 - 1.5) * spanLat * 0.5;
            }

            // Altitudes from 4 km to 80 km
            const altKm = 4.0 + rnd() * 76.0;
            const altUnits = altKm / 1274.2;

            const u = (lon + 180.0) / 360.0;
            const v = (90.0 - lat) / 180.0;
            const mode = 0;
            const unfurl = 0.0;

            const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, mode, unfurl, 5.0);
            const lenP = Math.hypot(p3D[0], p3D[1], p3D[2]) || 5.0;
            const normSphere = [p3D[0] / lenP, p3D[1] / lenP, p3D[2] / lenP];
            const normFlat = [0, 0, 1];
            const nx = normSphere[0] * (1.0 - unfurl) + normFlat[0] * unfurl;
            const ny = normSphere[1] * (1.0 - unfurl) + normFlat[1] * unfurl;
            const nz = normSphere[2] * (1.0 - unfurl) + normFlat[2] * unfurl;
            const nLen = Math.hypot(nx, ny, nz) || 1.0;

            const camX = p3D[0] + (nx / nLen) * altUnits;
            const camY = p3D[1] + (ny / nLen) * altUnits;
            const camZ = p3D[2] + (nz / nLen) * altUnits;

            // Randomized look-at: either nadir or tilted toward regional center
            const centerU = ((minLon + maxLon) * 0.5 + 180.0) / 360.0;
            const centerV = (90.0 - (minLat + maxLat) * 0.5) / 180.0;
            const pCenter = WebGPUEngine.evaluateManifoldPosition(centerU, centerV, mode, unfurl, 5.0);

            const lookAtCenter = rnd() > 0.5;
            const tgt = lookAtCenter ? pCenter : p3D;

            camera.fov = 35 + rnd() * 45;
            camera.aspect = 0.8 + rnd() * 0.8;
            camera.position.set(camX, camY, camZ);
            camera.lookAt(tgt[0], tgt[1], tgt[2]);
            camera.updateMatrixWorld();
            camera.updateProjectionMatrix();

            engine.updateCDLOD(camera, mode, unfurl, false);

            const count = engine.cdlodActiveNodeCount;
            if (count > maxNodeCountSeen) maxNodeCountSeen = count;

            if (count >= WebGPUEngine.CDLOD_MAX_NODES) {
              console.log(`[CHALLENGE HIT] Step ${step}, Region ${reg.id}, altKm ${altKm}, count ${count}, maxLod ${engine.lastMaxLodSeen}, mode ${mode}, unfurl ${unfurl}, fov ${camera.fov}`);
              const nodes = getActiveNodes(engine);
              const lodDist: Record<number, number> = {};
              for (const n of nodes) {
                lodDist[n.lod] = (lodDist[n.lod] || 0) + 1;
              }
              console.log('LOD distribution:', lodDist);
            }

            const nodes = getActiveNodes(engine);
            const isSphere = unfurl < 0.01;
            const { pairsChecked, maxDelta, violations: stepViolations } = checkAdjacency(nodes, isSphere);

            totalSteps++;
            totalPairs += pairsChecked;
            if (maxDelta > overallMaxDelta) overallMaxDelta = maxDelta;

            for (const v of stepViolations) {
              violations.push({
                step,
                delta: v.delta,
                lodA: v.a.lod,
                lodB: v.b.lod,
                region: reg.id,
              });
            }
          }
        }

        console.log({
          totalSteps,
          totalPairs,
          overallMaxDelta,
          maxNodeCountSeen,
          violationsCount: violations.length,
        });

        expect(totalSteps).toBe(300);
        expect(totalPairs).toBeGreaterThan(10000);
        expect(maxNodeCountSeen).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);
        expect(violations).toHaveLength(0);
        expect(overallMaxDelta).toBeLessThanOrEqual(1);
      },
      30000
    );
  });

  // ==========================================================================
  // Suite 4: Node Pool Capacity Under Worst-Case Stress (Wide-Angle Low Altitude)
  // ==========================================================================
  describe('Suite 4: Node Pool Capacity Under Worst-Case Stress', () => {
    it('verifies node pool never exhausts 4096 capacity under ultra-wide angle 120-degree nadir and oblique at 3km', () => {
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      const camera = new PerspectiveCamera(120, 2.0, 0.001, 100);
      const u = (-157.5 + 180.0) / 360.0;
      const v = (90.0 - 20.5) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);
      const altUnits = 3.0 / 1274.2; // 3 km altitude!
      const scale = (5.0 + altUnits) / 5.0;

      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      // Node count must comfortably stay below 4096
      expect(engine.cdlodActiveNodeCount).toBeGreaterThan(0);
      expect(engine.cdlodActiveNodeCount).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);
      expect(engine.lastMaxLodSeen).toBe(12);

      const nodes = getActiveNodes(engine);
      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });

    it('verifies dynamic bounds release restores global LOD 10 cap and keeps node pool bounded', () => {
      // Step 1: Set active regional DEM
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      const u = (-157.5 + 180.0) / 360.0;
      const v = (90.0 - 20.5) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, 0, 0.0, 5.0);
      const scale = (5.0 + 5.0 / 1274.2) / 5.0;

      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);
      camera.position.set(p3D[0] * scale, p3D[1] * scale, p3D[2] * scale);
      camera.lookAt(p3D[0], p3D[1], p3D[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      expect(engine.lastMaxLodSeen).toBe(12);

      // Step 2: Release regional DEM
      engine.setActiveRegionalDEM(null);
      expect(engine.getActiveRegionalBounds()).toBeNull();

      engine.updateCDLOD(camera, 0, 0.0, false);
      expect(engine.lastMaxLodSeen).toBeLessThanOrEqual(10);
      expect(engine.cdlodActiveNodeCount).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);

      const nodes = getActiveNodes(engine);
      for (const n of nodes) {
        expect(n.lod).toBeLessThanOrEqual(10);
      }
      const { violations } = checkAdjacency(nodes, true);
      expect(violations).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Suite 5: Defect Reproduction — Node Pool Budget Exhaustion (4096) & 2:1 Balancing Breakdown
  // ==========================================================================
  describe('Suite 5: Defect Reproduction — Node Pool Budget Exhaustion (4096) & 2:1 Balancing Breakdown', () => {
    it('empirically demonstrates that under manifold unrolling (unfurl = 0.5), boundary crossing maintains healthy bounded node pool and 2:1 balancing', () => {
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [-161.0, 18.0, -154.0, 23.0],
        width: 5400,
        height: 3600,
        id: 'hawaii',
      };

      // Camera positioned near western edge of Hawaii (lon ~ -158.65, lat ~ 20.7, alt ~ 9.9 km, unfurl = 0.5)
      const lon = -158.6505932409782;
      const lat = 20.7;
      const altKm = 9.924452284350991;
      const altUnits = altKm / 1274.2;
      const mode = 2;
      const unfurl = 0.5;

      const u = (lon + 180.0) / 360.0;
      const v = (90.0 - lat) / 180.0;
      const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, mode, unfurl, 5.0);
      const lenP = Math.hypot(p3D[0], p3D[1], p3D[2]) || 5.0;
      const normSphere = [p3D[0] / lenP, p3D[1] / lenP, p3D[2] / lenP];
      const normFlat = [0, 0, 1];
      const nx = normSphere[0] * (1.0 - unfurl) + normFlat[0] * unfurl;
      const ny = normSphere[1] * (1.0 - unfurl) + normFlat[1] * unfurl;
      const nz = normSphere[2] * (1.0 - unfurl) + normFlat[2] * unfurl;
      const nLen = Math.hypot(nx, ny, nz) || 1.0;

      const camX = p3D[0] + (nx / nLen) * altUnits;
      const camY = p3D[1] + (ny / nLen) * altUnits;
      const camZ = p3D[2] + (nz / nLen) * altUnits;

      const centerU = ((-161.0 + -154.0) * 0.5 + 180.0) / 360.0;
      const centerV = (90.0 - (18.0 + 23.0) * 0.5) / 180.0;
      const pCenter = WebGPUEngine.evaluateManifoldPosition(centerU, centerV, mode, unfurl, 5.0);

      const camera = new PerspectiveCamera(75.819, 1.196, 0.001, 100);
      camera.position.set(camX, camY, camZ);
      camera.lookAt(pCenter[0], pCenter[1], pCenter[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, mode, unfurl, false);

      const count = engine.cdlodActiveNodeCount;
      const nodes = getActiveNodes(engine);
      const { maxDelta, violations } = checkAdjacency(nodes, false);

      // Verified post-fix:
      // 1. Node pool remains healthy and well below maximum budget limit
      expect(count).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);
      expect(count).toBeGreaterThan(50);
      // 2. Ripple balancing pass succeeds with zero violations
      expect(maxDelta).toBeLessThanOrEqual(1);
      expect(violations.length).toBe(0);
    });

    it(
      'enforces 2:1 balancing invariant across regional boundary under manifold unrolling',
      () => {
        engine.activeRegionalDEM = {
          texture: {} as any,
          view: {} as any,
          bounds: [-161.0, 18.0, -154.0, 23.0],
          width: 5400,
          height: 3600,
          id: 'hawaii',
        };

        const lon = -158.6505932409782;
        const lat = 20.7;
        const altKm = 9.924452284350991;
        const altUnits = altKm / 1274.2;
        const mode = 2;
        const unfurl = 0.5;

        const u = (lon + 180.0) / 360.0;
        const v = (90.0 - lat) / 180.0;
        const p3D = WebGPUEngine.evaluateManifoldPosition(u, v, mode, unfurl, 5.0);
        const lenP = Math.hypot(p3D[0], p3D[1], p3D[2]) || 5.0;
        const normSphere = [p3D[0] / lenP, p3D[1] / lenP, p3D[2] / lenP];
        const normFlat = [0, 0, 1];
        const nx = normSphere[0] * (1.0 - unfurl) + normFlat[0] * unfurl;
        const ny = normSphere[1] * (1.0 - unfurl) + normFlat[1] * unfurl;
        const nz = normSphere[2] * (1.0 - unfurl) + normFlat[2] * unfurl;
        const nLen = Math.hypot(nx, ny, nz) || 1.0;

        const camX = p3D[0] + (nx / nLen) * altUnits;
        const camY = p3D[1] + (ny / nLen) * altUnits;
        const camZ = p3D[2] + (nz / nLen) * altUnits;

        const centerU = ((-161.0 + -154.0) * 0.5 + 180.0) / 360.0;
        const centerV = (90.0 - (18.0 + 23.0) * 0.5) / 180.0;
        const pCenter = WebGPUEngine.evaluateManifoldPosition(centerU, centerV, mode, unfurl, 5.0);

        const camera = new PerspectiveCamera(75.819, 1.196, 0.001, 100);
        camera.position.set(camX, camY, camZ);
        camera.lookAt(pCenter[0], pCenter[1], pCenter[2]);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, mode, unfurl, false);

        const count = engine.cdlodActiveNodeCount;
        const nodes = getActiveNodes(engine);
        const { maxDelta, violations } = checkAdjacency(nodes, false);
        const violationsCount = violations.length;

        // Required Target Invariant:
        expect(count).toBeLessThan(WebGPUEngine.CDLOD_MAX_NODES);
        expect(violationsCount).toBe(0);
        expect(maxDelta).toBeLessThanOrEqual(1);
      }
    );
  });
});
