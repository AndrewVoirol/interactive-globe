import { describe, it, expect, beforeEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine, QuadtreeNodeData } from '../../src/webgpu/WebGPUEngine';

interface CandidateNode {
  lod: number;
  minU: number;
  minV: number;
  sizeU: number;
  sizeV: number;
  maxU: number;
  maxV: number;
}

function getCandidatesFromFloats(engine: WebGPUEngine): CandidateNode[] {
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

function checkAdjacency(
  nodes: CandidateNode[],
  isSphere: boolean
): { pairsChecked: number; maxDelta: number; violations: Array<{ a: CandidateNode; b: CandidateNode; delta: number }> } {
  let pairsChecked = 0;
  let maxDelta = 0;
  const violations: Array<{ a: CandidateNode; b: CandidateNode; delta: number }> = [];
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

describe('Challenger M3.1: High-Latitude Empirical Scaling & Riemannian Metric Challenger', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  describe('Challenge 1: Numerical Calibration Matrix & Latitudinal Metric Scaling Oracle', () => {
    const latitudes = [
      { name: 'Equator', deg: 0, v: 0.5, flatFactor: 1.0, midFactor: 1.0 },
      { name: 'Himalayas / Cairo', deg: 30, v: 0.5 - 30.0 / 180.0, flatFactor: 2.0 / Math.sqrt(3), midFactor: Math.sqrt(0.5 + 0.5 * (4.0 / 3.0)) },
      { name: 'Swiss Alps / Bordeaux', deg: 45, v: 0.5 - 45.0 / 180.0, flatFactor: Math.SQRT2, midFactor: Math.sqrt(0.5 + 0.5 * 2.0) },
      { name: 'Oslo / Alaska', deg: 60, v: 0.5 - 60.0 / 180.0, flatFactor: 2.0, midFactor: Math.sqrt(0.5 + 0.5 * 4.0) },
      { name: 'Greenland / Svalbard', deg: 75, v: 0.5 - 75.0 / 180.0, flatFactor: 1.0 / Math.cos((75.0 * Math.PI) / 180.0), midFactor: Math.sqrt(0.5 + 0.5 * Math.pow(1.0 / Math.cos((75.0 * Math.PI) / 180.0), 2)) },
      { name: 'Polar Clamp Boundary', deg: 85, v: 0.5 - 85.0 / 180.0, flatFactor: 1.0 / Math.cos(1.4835), midFactor: Math.sqrt(0.5 + 0.5 * Math.pow(1.0 / Math.cos(1.4835), 2)) },
    ];

    it('empirically measures switching distance on Sphere (t = 0.0): distance ratio across all latitudes is strictly 1.000 (tol <= 1e-4)', () => {
      const equatorialDist = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);

      for (const item of latitudes) {
        const northDist = engine.computeCalibratedRange(0, item.v, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        const northRatio = northDist / equatorialDist;
        expect(Math.abs(northRatio - 1.0)).toBeLessThanOrEqual(1e-4);
        expect(northRatio).toBeCloseTo(1.0, 4);

        // Southern hemisphere symmetry
        const southV = 0.5 + item.deg / 180.0;
        const southDist = engine.computeCalibratedRange(0, southV, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        const southRatio = southDist / equatorialDist;
        expect(Math.abs(southRatio - 1.0)).toBeLessThanOrEqual(1e-4);
        expect(southRatio).toBeCloseTo(1.0, 4);
      }
    });

    it('empirically verifies on Flat Map (t = 1.0): Greenland (75°N) switching distance is ~3.864x of Equator', () => {
      const equatorialDist = engine.computeCalibratedRange(0, 0.5, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      const greenlandV = 0.5 - 75.0 / 180.0;
      const greenlandDist = engine.computeCalibratedRange(0, greenlandV, 1.0, 1080, Math.PI / 4, 2.0, 1.0);

      const ratio = greenlandDist / equatorialDist;
      expect(ratio).toBeCloseTo(3.8637, 3);
      expect(ratio).toBeGreaterThan(3.86);
      expect(ratio).toBeLessThan(3.87);
    });

    it('empirically verifies polar clamp at 85° caps metric factor at ~11.474x with zero NaN, Infinity, or crash', () => {
      const equatorialDist = engine.computeCalibratedRange(0, 0.5, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      const v85 = 0.5 - 85.0 / 180.0;
      const polarClampDist = engine.computeCalibratedRange(0, v85, 1.0, 1080, Math.PI / 4, 2.0, 1.0);

      const ratio85 = polarClampDist / equatorialDist;
      expect(ratio85).toBeCloseTo(11.4737, 2);
      expect(Number.isFinite(polarClampDist)).toBe(true);
      expect(polarClampDist).toBeGreaterThan(0);
      expect(Number.isNaN(polarClampDist)).toBe(false);

      // Beyond 85°: 88°, 89.9°, 90° (exact pole)
      const extremeLats = [86, 88, 89.5, 89.99, 90.0, -90.0];
      for (const deg of extremeLats) {
        const v = 0.5 - deg / 180.0;
        const dist = engine.computeCalibratedRange(0, v, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
        expect(Number.isFinite(dist)).toBe(true);
        expect(Number.isNaN(dist)).toBe(false);
        expect(dist).toBeGreaterThan(0);

        // Clamped ratio must match the 85.0° clamp (~11.4737) and NOT explode to infinity
        const extremeRatio = dist / equatorialDist;
        expect(extremeRatio).toBeCloseTo(11.4737, 2);
      }
    });

    it('empirically verifies entire Survey Calibration Matrix across all 6 latitudes at t = 0.0, 0.5, 1.0', () => {
      const nominalEquatorSphere = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);

      for (const row of latitudes) {
        // Sphere (t = 0.0)
        const distSphere = engine.computeCalibratedRange(0, row.v, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        expect(distSphere / nominalEquatorSphere).toBeCloseTo(1.000, 3);

        // Mid-unfurl (t = 0.5)
        const distMid = engine.computeCalibratedRange(0, row.v, 0.5, 1080, Math.PI / 4, 2.0, 1.0);
        expect(distMid / nominalEquatorSphere).toBeCloseTo(row.midFactor, 3);

        // Flat Map (t = 1.0)
        const distFlat = engine.computeCalibratedRange(0, row.v, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
        expect(distFlat / nominalEquatorSphere).toBeCloseTo(row.flatFactor, 3);
      }
    });

    it('verifies strict monotonicity of metric factor sigma(phi; t) as unfurl t increases for phi > 0', () => {
      const nominal = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
      const testV = 0.5 - 60.0 / 180.0; // 60°N

      const steps = 20;
      let prevDist = 0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const dist = engine.computeCalibratedRange(0, testV, t, 1080, Math.PI / 4, 2.0, 1.0);
        if (i > 0) {
          expect(dist).toBeGreaterThan(prevDist);
        }
        prevDist = dist;
      }
      expect(prevDist / nominal).toBeCloseTo(2.0, 4); // At t = 1.0, sec(60°) = 2.0
    });
  });

  describe('Challenge 2: In-Engine Dynamic Scaling Behavior (Equator vs Greenland Litmus)', () => {
    it('verifies that in-engine nominal range scaling preserves 3.864x ratio at all LOD octaves (l = 0..8)', () => {
      const vEquator = 0.5;
      const vGreenland = 0.5 - 75.0 / 180.0;

      for (let lod = 0; lod <= 8; lod++) {
        const rEquator = engine.computeCalibratedRange(lod, vEquator, 1.0, 1080, Math.PI / 4, 2.0, 56.0 / 6518.3753);
        const rGreenland = engine.computeCalibratedRange(lod, vGreenland, 1.0, 1080, Math.PI / 4, 2.0, 56.0 / 6518.3753);

        expect(rGreenland / rEquator).toBeCloseTo(3.8637, 3);
        // Also verify dyadic halving
        if (lod > 0) {
          const rGreenlandPrev = engine.computeCalibratedRange(lod - 1, vGreenland, 1.0, 1080, Math.PI / 4, 2.0, 56.0 / 6518.3753);
          expect(rGreenland / rGreenlandPrev).toBeCloseTo(0.5, 6);
        }
      }
    });

    it('verifies in-engine quadtree updates generate deeper LOD patches over Greenland than Equator from identical camera altitude on Flat Map', () => {
      // Create camera looking down at flat map (Mode 0, unfurl = 1.0)
      // Camera 1: Looking nadir at Equator (0° lon, 0° lat) => x=0, y=0, z=7.0
      const cameraEquator = new PerspectiveCamera(45, 1.0, 0.01, 100);
      cameraEquator.position.set(0, 0, 7.0);
      cameraEquator.lookAt(0, 0, 0);
      cameraEquator.updateMatrixWorld();
      cameraEquator.updateProjectionMatrix();

      engine.updateCDLOD(cameraEquator, 0, 1.0, false);
      const equatorCandidates = getCandidatesFromFloats(engine);
      const equatorCenterNodes = equatorCandidates.filter((n) => n.minV <= 0.5 && n.maxV >= 0.5);
      const maxEquatorLod = Math.max(...equatorCenterNodes.map((n) => n.lod));

      // Camera 2: Looking nadir at Greenland (lat 75°N, lon -40°W) on flat map
      // On flat map: Mercator y = log(tan(PI/4 + lat/2)) * R
      // For lat = 75° (1.309 rad), y = log(tan(PI/4 + 0.6545)) * 5.0 ≈ 10.32
      const greenlandY = Math.log(Math.tan(Math.PI * 0.25 + (75.0 * Math.PI) / 360.0)) * 5.0;
      const greenlandX = ((-40.0 * Math.PI) / 180.0) * 5.0;

      const cameraGreenland = new PerspectiveCamera(45, 1.0, 0.01, 100);
      cameraGreenland.position.set(greenlandX, greenlandY, 7.0);
      cameraGreenland.lookAt(greenlandX, greenlandY, 0);
      cameraGreenland.updateMatrixWorld();
      cameraGreenland.updateProjectionMatrix();

      engine.updateCDLOD(cameraGreenland, 0, 1.0, false);
      const greenlandCandidates = getCandidatesFromFloats(engine);
      const greenlandNodes = greenlandCandidates.filter((n) => n.minV <= 0.5 - 75.0 / 180.0 && n.maxV >= 0.5 - 75.0 / 180.0);
      const maxGreenlandLod = Math.max(...greenlandNodes.map((n) => n.lod));

      // Due to 3.864x metric range expansion, Greenland subdivides significantly deeper at the same camera distance
      expect(maxGreenlandLod).toBeGreaterThan(maxEquatorLod);
      expect(maxGreenlandLod - maxEquatorLod).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Challenge 3: Adversarial 2:1 Quadtree Balancing Under Active Metric Stretch (|DeltaLOD| <= 1)', () => {
    it('proves 2:1 restriction holds across the steep 11.47x metric stretch gradient when camera skims Arctic Horizon on Flat Map', () => {
      // Position camera high over Arctic looking southward across the entire northern hemisphere
      // Arctic polar clamp has ~11.474x stretch while Equator has 1.0x stretch.
      const camera = new PerspectiveCamera(60, 1.0, 0.01, 100);
      // y = 10.0 (near 75°N-80°N), z = 3.5, looking towards y = 0
      camera.position.set(0, 10.0, 3.5);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 1.0, false);
      const candidates = getCandidatesFromFloats(engine);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);

      const { pairsChecked, maxDelta, violations } = checkAdjacency(candidates, false);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });

    it('proves 2:1 restriction holds when camera views Antarctic Edge from South Pole on Flat Map', () => {
      const camera = new PerspectiveCamera(60, 1.0, 0.01, 100);
      camera.position.set(0, -10.0, 3.5);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 1.0, false);
      const candidates = getCandidatesFromFloats(engine);
      expect(candidates.length).toBeGreaterThan(0);

      const { pairsChecked, maxDelta, violations } = checkAdjacency(candidates, false);
      expect(pairsChecked).toBeGreaterThan(0);
      expect(violations).toHaveLength(0);
      expect(maxDelta).toBeLessThanOrEqual(1);
    });

    it('proves 2:1 restriction holds across 10 altitude steps during continuous zoom into Svalbard (80°N) under Mode 1 Cylindrical Unfurl (t = 0.5)', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      const altitudes = [15.0, 12.0, 9.0, 6.0, 4.0, 2.5, 1.5, 0.8, 0.4, 0.2];

      for (let step = 0; step < altitudes.length; step++) {
        const alt = altitudes[step];
        const svalbardPos = WebGPUEngine.evaluateManifoldPosition(0.55, 0.5 - 80.0 / 180.0, 1, 0.5);
        camera.position.set(svalbardPos[0], svalbardPos[1], svalbardPos[2] + alt);
        camera.lookAt(svalbardPos[0], svalbardPos[1], svalbardPos[2]);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, 1, 0.5, false);
        const candidates = getCandidatesFromFloats(engine);
        expect(candidates.length).toBeGreaterThan(0);

        const { pairsChecked, maxDelta, violations } = checkAdjacency(candidates, false);
        expect(violations).toHaveLength(0);
        expect(maxDelta).toBeLessThanOrEqual(1);
      }
    });

    it('proves 2:1 restriction holds across a 50-step latitudinal camera sweep from -85° to +85° on Flat Map', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      let totalPairsChecked = 0;
      let worstDelta = 0;

      for (let i = 0; i <= 50; i++) {
        const latDeg = -85 + (i / 50) * 170; // Sweep from -85° to +85°
        const latRad = (latDeg * Math.PI) / 180.0;
        const clampedLat = Math.max(-1.4835, Math.min(1.4835, latRad));
        const mercatorY = Math.log(Math.tan(Math.PI * 0.25 + clampedLat * 0.5)) * 5.0;

        camera.position.set(0, mercatorY, 4.5);
        camera.lookAt(0, mercatorY, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, 0, 1.0, false);
        const candidates = getCandidatesFromFloats(engine);
        expect(candidates.length).toBeGreaterThan(0);

        const { pairsChecked, maxDelta, violations } = checkAdjacency(candidates, false);
        totalPairsChecked += pairsChecked;
        if (maxDelta > worstDelta) worstDelta = maxDelta;

        if (violations.length > 0) {
          console.error(`Violation at lat ${latDeg.toFixed(1)}°:`, violations);
        }
        expect(violations).toHaveLength(0);
        expect(maxDelta).toBeLessThanOrEqual(1);
      }

      expect(totalPairsChecked).toBeGreaterThan(500);
      expect(worstDelta).toBeLessThanOrEqual(1);
    });
  });

  describe('Challenge 4: Robustness against Abnormal Inputs & Edge Cases', () => {
    it('handles out-of-range midV gracefully (clamping lat to ±85° and preventing division by zero)', () => {
      const abnormalVs = [-1.0, -0.5, 0.0, 1.0, 1.5, 2.0];
      for (const v of abnormalVs) {
        const range = engine.computeCalibratedRange(0, v, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
        expect(Number.isFinite(range)).toBe(true);
        expect(Number.isNaN(range)).toBe(false);
        expect(range).toBeGreaterThan(0);
      }
    });

    it('handles out-of-range unfurl gracefully (clamping t to [0, 1])', () => {
      const rangeUnder = engine.computeCalibratedRange(0, 0.5, -0.5, 1080, Math.PI / 4, 2.0, 1.0);
      const rangeSphere = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
      expect(rangeUnder).toBeCloseTo(rangeSphere, 6);

      const rangeOver = engine.computeCalibratedRange(0, 0.5, 1.5, 1080, Math.PI / 4, 2.0, 1.0);
      const rangeFlat = engine.computeCalibratedRange(0, 0.5, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      expect(rangeOver).toBeCloseTo(rangeFlat, 6);
    });

    it('handles negative or zero LOD gracefully without crash', () => {
      const rNeg = engine.computeCalibratedRange(-2, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
      const rZero = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
      expect(rNeg).toBeCloseTo(rZero, 6); // Max(0, lod) protects against negative LOD
    });
  });
});
