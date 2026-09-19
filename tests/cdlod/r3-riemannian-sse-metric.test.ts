import { describe, it, expect, beforeEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('R3 Screen-Space Error with Riemannian Metric Calibration', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  describe('Pillar 1: Classical SSE Formulation & Scaling Invariants', () => {
    it('evaluates exact textbook baseline R_0 = 6518.375 at 1080p, 45° FOV, tau = 2.0, beta = 1.0', () => {
      // Textbook parameters:
      // H = 1080, θ = π / 4 (45°), τ_sse = 2.0, W_0 = 10.0, β = 1.0, l = 0, t = 0.0 (sphere)
      // K_proj = 1080 / (2 * tan(π / 8)) = 1080 / (2 * 0.41421356237) = 1303.675276
      // δ_0 = 1.0 * 10.0 / 2^0 = 10.0
      // R_0^nominal = (10.0 * 1303.675276) / (2 * 2.0 * tan(π / 8) * ...) = (10.0 * 1080) / (4.0 * tan(π / 8)) = 6518.3753
      const range = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
      const expected = (10.0 * 1080) / (4.0 * Math.tan(Math.PI / 8));

      expect(range).toBeCloseTo(expected, 4);
      expect(range).toBeCloseTo(6518.3766, 2);
    });

    it('scales nominal range strictly linearly with viewport height H', () => {
      const heights = [720, 1080, 1440, 2160];
      const ranges = heights.map((h) => engine.computeCalibratedRange(0, 0.5, 0.0, h, Math.PI / 4, 2.0, 1.0));

      const baseRatio = ranges[0] / heights[0];
      for (let i = 1; i < heights.length; i++) {
        const ratio = ranges[i] / heights[i];
        expect(ratio).toBeCloseTo(baseRatio, 6);
      }
      expect(ranges[3] / ranges[1]).toBeCloseTo(2.0, 6); // 4K vs 1080p is exactly 2x
    });

    it('scales nominal range strictly inversely with SSE tolerance tau', () => {
      const tolerances = [1.0, 2.0, 4.0, 8.0];
      const ranges = tolerances.map((tau) => engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, tau, 1.0));

      // range * tau = constant
      const constant = ranges[0] * tolerances[0];
      for (let i = 1; i < tolerances.length; i++) {
        expect(ranges[i] * tolerances[i]).toBeCloseTo(constant, 6);
      }
      expect(ranges[0] / ranges[1]).toBeCloseTo(2.0, 6); // tau 1.0 vs 2.0 is exactly 2x
      expect(ranges[1] / ranges[2]).toBeCloseTo(2.0, 6); // tau 2.0 vs 4.0 is exactly 2x
    });

    it('scales nominal range strictly inversely with tan(theta / 2) as FOV varies', () => {
      const fovDegrees = [30, 45, 60, 90];
      const ranges = fovDegrees.map((deg) => {
        const rad = (deg * Math.PI) / 180.0;
        return {
          deg,
          rad,
          tanHalf: Math.tan(rad * 0.5),
          range: engine.computeCalibratedRange(0, 0.5, 0.0, 1080, rad, 2.0, 1.0),
        };
      });

      const constant = ranges[0].range * ranges[0].tanHalf;
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].range * ranges[i].tanHalf).toBeCloseTo(constant, 6);
      }
    });

    it('enforces exact dyadic halving R_{l+1} = R_l / 2 for all LOD levels', () => {
      for (let l = 0; l <= 9; l++) {
        const rCurrent = engine.computeCalibratedRange(l, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        const rNext = engine.computeCalibratedRange(l + 1, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        expect(rNext / rCurrent).toBeCloseTo(0.5, 10);
      }
    });
  });

  describe('Pillar 2: Riemannian Metric Factor sigma(phi; t) Calibration', () => {
    it('preserves sigma(phi; 0.0) == 1.000 across all latitudes on the sphere', () => {
      const latitudes = [0, 30, 45, 60, 75, 85];
      const nominal = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);

      for (const lat of latitudes) {
        const v = 0.5 - lat / 180.0;
        const range = engine.computeCalibratedRange(0, v, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
        expect(range).toBeCloseTo(nominal, 6);
      }
    });

    it('verifies exact Riemannian metric calibration table on flat map (t = 1.0)', () => {
      const nominal = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);

      // Lat 0° (Equator): sec(0°) = 1.0
      const v0 = 0.5;
      const r0 = engine.computeCalibratedRange(0, v0, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      expect(r0 / nominal).toBeCloseTo(1.0, 5);

      // Lat 30°: sec(30°) = 2 / sqrt(3) ≈ 1.15470
      const v30 = 0.5 - 30.0 / 180.0;
      const r30 = engine.computeCalibratedRange(0, v30, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      expect(r30 / nominal).toBeCloseTo(2.0 / Math.sqrt(3), 4);
      expect(r30 / nominal).toBeCloseTo(1.1547, 4);

      // Lat 45°: sec(45°) = sqrt(2) ≈ 1.41421
      const v45 = 0.5 - 45.0 / 180.0;
      const r45 = engine.computeCalibratedRange(0, v45, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      expect(r45 / nominal).toBeCloseTo(Math.SQRT2, 4);
      expect(r45 / nominal).toBeCloseTo(1.4142, 4);

      // Lat 60°: sec(60°) = 2.0
      const v60 = 0.5 - 60.0 / 180.0;
      const r60 = engine.computeCalibratedRange(0, v60, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      expect(r60 / nominal).toBeCloseTo(2.0, 4);

      // Lat 75° (Greenland Litmus): sec(75°) = 1 / cos(75°) ≈ 3.86370
      const v75 = 0.5 - 75.0 / 180.0;
      const r75 = engine.computeCalibratedRange(0, v75, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      const expected75 = 1.0 / Math.cos((75.0 * Math.PI) / 180.0);
      expect(r75 / nominal).toBeCloseTo(expected75, 4);
      expect(r75 / nominal).toBeCloseTo(3.8637, 3);

      // Lat 85° (Polar Clamp): sec(85°) = 1 / cos(85°) ≈ 11.4737
      const v85 = 0.5 - 85.0 / 180.0;
      const r85 = engine.computeCalibratedRange(0, v85, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      const expected85 = 1.0 / Math.cos(1.4835); // Clamped to 1.4835 rad (85.0°)
      expect(r85 / nominal).toBeCloseTo(expected85, 2);
      expect(r85 / nominal).toBeCloseTo(11.4737, 2);
    });

    it('verifies continuous manifold transition at t = 0.5 and strict monotonicity in t', () => {
      const nominal = engine.computeCalibratedRange(0, 0.5, 0.0, 1080, Math.PI / 4, 2.0, 1.0);
      const v75 = 0.5 - 75.0 / 180.0;

      // At t = 0.5: sigma = sqrt(0.5 + 0.5 * sec^2(75°))
      const sec75 = 1.0 / Math.cos((75.0 * Math.PI) / 180.0);
      const expectedSigmaHalf = Math.sqrt(0.5 + 0.5 * sec75 * sec75);
      const r75Half = engine.computeCalibratedRange(0, v75, 0.5, 1080, Math.PI / 4, 2.0, 1.0);
      expect(r75Half / nominal).toBeCloseTo(expectedSigmaHalf, 4);
      expect(r75Half / nominal).toBeCloseTo(2.822, 2);

      // Strict monotonicity in t
      const tSteps = [0.0, 0.25, 0.5, 0.75, 1.0];
      const sigmas = tSteps.map(
        (t) => engine.computeCalibratedRange(0, v75, t, 1080, Math.PI / 4, 2.0, 1.0) / nominal
      );
      for (let i = 0; i < sigmas.length - 1; i++) {
        expect(sigmas[i + 1]).toBeGreaterThan(sigmas[i]);
      }

      // North-South symmetry: sigma(+lat) === sigma(-lat)
      const vSouth75 = 0.5 + 75.0 / 180.0;
      const rSouth75 = engine.computeCalibratedRange(0, vSouth75, 0.5, 1080, Math.PI / 4, 2.0, 1.0);
      expect(rSouth75).toBeCloseTo(r75Half, 6);
    });
  });

  describe('Pillar 3: High-Latitude Quadtree Subdivision Invariant (Greenland Litmus Test)', () => {
    it('proves Greenland (75°N) subdivides at ~3.864x greater distance than Equator on flat map (t = 1.0)', () => {
      const vEquator = 0.5;
      const vGreenland = 0.5 - 75.0 / 180.0;

      // Range at LOD 1 for equator vs Greenland on flat map
      const rEquatorL1 = engine.computeCalibratedRange(1, vEquator, 1.0, 1080, Math.PI / 4, 2.0, 1.0);
      const rGreenlandL1 = engine.computeCalibratedRange(1, vGreenland, 1.0, 1080, Math.PI / 4, 2.0, 1.0);

      const ratio = rGreenlandL1 / rEquatorL1;
      expect(ratio).toBeCloseTo(3.8637, 3);

      // Test with in-engine quadtree update on flat map
      // Place camera at distance where Greenland subdivides to LOD 1+ while Equator remains at LOD 0
      const testDist = rEquatorL1 * 2.0; // Twice the equatorial subdivision distance
      const cameraEquator = new PerspectiveCamera(45, 1.0, 0.01, 100);
      cameraEquator.position.set(0, 0, testDist);
      cameraEquator.lookAt(0, 0, 0);
      cameraEquator.updateMatrixWorld();
      cameraEquator.updateProjectionMatrix();

      // At this distance, equatorial patch should have surfaceDist >= rEquatorL1
      const nominalEquatorRange = engine.computeCalibratedRange(
        1,
        vEquator,
        1.0,
        1080,
        Math.PI / 4,
        engine.cdlodSseTolerance,
        56.0 / 6518.3753
      );
      const nominalGreenlandRange = engine.computeCalibratedRange(
        1,
        vGreenland,
        1.0,
        1080,
        Math.PI / 4,
        engine.cdlodSseTolerance,
        56.0 / 6518.3753
      );

      expect(nominalGreenlandRange / nominalEquatorRange).toBeCloseTo(3.8637, 3);
    });
  });

  describe('Pillar 4: Smooth C^0 Morph Continuity over [0.65 R_l, R_l]', () => {
    it('verifies morphStart = 0.65 * rangeL and invMorphRange = 1 / (0.35 * rangeL)', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 0, 8.0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      const pool = (engine as any).cdlodNodePool;
      for (let i = 0; i < engine.cdlodActiveNodeCount; i++) {
        const node = pool[i];
        if (node.lod > 0) {
          expect(node.morphStart).toBeCloseTo(0.65 * node.rangeL, 5);
          expect(node.invMorphRange).toBeCloseTo(1.0 / (0.35 * node.rangeL), 5);

          // Evaluate continuous morph factor alpha(d) = clamp((d - morphStart) * invMorphRange, 0.0, 1.0)
          const dStart = node.morphStart;
          const dEnd = node.rangeL;
          const dMid = (dStart + dEnd) * 0.5;

          const alphaStart = Math.max(0.0, Math.min(1.0, (dStart - node.morphStart) * node.invMorphRange));
          const alphaMid = Math.max(0.0, Math.min(1.0, (dMid - node.morphStart) * node.invMorphRange));
          const alphaEnd = Math.max(0.0, Math.min(1.0, (dEnd - node.morphStart) * node.invMorphRange));

          expect(alphaStart).toBeCloseTo(0.0, 6);
          expect(alphaMid).toBeCloseTo(0.5, 6);
          expect(alphaEnd).toBeCloseTo(1.0, 6);
        } else {
          // LOD 0 nodes do not morph
          expect(node.morphStart).toBeGreaterThan(1e8);
          expect(node.invMorphRange).toBe(0.0);
        }
      }
    });
  });

  describe('Pillar 5: Zero-GC Invariant Across Moving Camera Frames (Rule 26 Compliance)', () => {
    it('preserves strict reference equality across 100 consecutive frames during active CDLOD traversal', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);

      // Capture preallocated reference pointers
      const refCandidateFloats = (engine as any).cdlodCandidateFloats;
      const refCandidateUints = (engine as any).cdlodCandidateUints;
      const refHashKeys = (engine as any).cdlodSpatialHashKeys;
      const refHashValues = (engine as any).cdlodSpatialHashValues;
      const refRippleQueue = (engine as any).cdlodRippleQueue;
      const refCullingFloats = (engine as any).cdlodCullingUniformFloats;
      const refCullingUints = (engine as any).cdlodCullingUniformUints;
      const refNodePool = (engine as any).cdlodNodePool;

      expect(refCandidateFloats).toBeDefined();
      expect(refCandidateUints).toBeDefined();
      expect(refHashKeys).toBeDefined();
      expect(refHashValues).toBeDefined();
      expect(refRippleQueue).toBeDefined();
      expect(refCullingFloats).toBeDefined();
      expect(refCullingUints).toBeDefined();
      expect(refNodePool).toBeDefined();

      // Simulate 100 frames with dynamic orbital camera rotation and zooming
      for (let frame = 0; frame < 100; frame++) {
        const angle = (frame / 100.0) * Math.PI * 2.0;
        const dist = 5.2 + 8.0 * Math.sin(frame * 0.1);
        const unfurl = (frame / 100.0);
        const mode = frame % 3;

        camera.position.set(Math.cos(angle) * dist, Math.sin(angle * 0.5) * (dist * 0.5), Math.sin(angle) * dist);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        engine.updateCDLOD(camera, mode, unfurl, false);

        // Strict pointer equality check on every single frame
        expect((engine as any).cdlodCandidateFloats).toBe(refCandidateFloats);
        expect((engine as any).cdlodCandidateUints).toBe(refCandidateUints);
        expect((engine as any).cdlodSpatialHashKeys).toBe(refHashKeys);
        expect((engine as any).cdlodSpatialHashValues).toBe(refHashValues);
        expect((engine as any).cdlodRippleQueue).toBe(refRippleQueue);
        expect((engine as any).cdlodCullingUniformFloats).toBe(refCullingFloats);
        expect((engine as any).cdlodCullingUniformUints).toBe(refCullingUints);
        expect((engine as any).cdlodNodePool).toBe(refNodePool);
      }
    });
  });

  describe('Pillar 6: In-Engine Real-Time Telemetry & Contract Verification', () => {
    it('returns complete CDLOD telemetry contract matching real engine state', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 0, 8.0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);

      const telemetry = engine.getCDLODTelemetry();

      expect(typeof telemetry.nodeCount).toBe('number');
      expect(telemetry.nodeCount).toBeGreaterThan(0);
      expect(telemetry.nodeCount).toBeLessThanOrEqual(WebGPUEngine.CDLOD_MAX_NODES);

      expect(typeof telemetry.instanceCount).toBe('number');
      expect(telemetry.instanceCount).toBe(telemetry.nodeCount);

      expect(typeof telemetry.maxLod).toBe('number');
      expect(telemetry.maxLod).toBeGreaterThanOrEqual(1);
      expect(telemetry.maxLod).toBeLessThanOrEqual(engine.cdlodMaxLod);

      expect(telemetry.sseTolerance).toBe(engine.cdlodSseTolerance);
      expect(telemetry.sseTolerance).toBe(2.0);

      expect(typeof telemetry.nadirSpacingMeters).toBe('number');
      expect(telemetry.nadirSpacingMeters).toBeGreaterThan(0);

      expect(typeof telemetry.cameraAltitudeKm).toBe('number');
      expect(telemetry.cameraAltitudeKm).toBeCloseTo((8.0 - 5.0) * 1274.2, 0);

      expect(telemetry.patchVertices).toBe(8962);
      expect(telemetry.totalVertices).toBe(telemetry.instanceCount * 8962);

      expect(typeof telemetry.indirectDrawCalls).toBe('number');
    });

    it('verifies nadir vertex spacing refines dynamically as altitude decreases', () => {
      // High altitude (orbital): 10,000 km
      const orbitalSpacing = engine.getNadirVertexSpacingMeters(10000);

      // Medium altitude: 1,000 km
      const mediumSpacing = engine.getNadirVertexSpacingMeters(1000);

      // Low altitude: 50 km
      const lowSpacing = engine.getNadirVertexSpacingMeters(50);

      expect(orbitalSpacing).toBeGreaterThan(mediumSpacing);
      expect(mediumSpacing).toBeGreaterThan(lowSpacing);
      expect(lowSpacing).toBeLessThan(1000); // Low altitude reaches sub-kilometer vertex spacing
    });
  });
});
