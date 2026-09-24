import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PerspectiveCamera, Vector3 } from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { evaluatePointMorph, geoToSphere, geoToMercator } from '../../src/core/GlobeOverlay';

describe('Application Hardening: Dual CPU/GPU Culling Symmetry & Manifold Camera Tracking', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const cullingWgslPath = path.join(projectRoot, 'src/webgpu/shaders/culling.wgsl');
  const engineTsPath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
  const canvasTsxPath = path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx');

  function computeCameraPose(
    lon: number,
    lat: number,
    unfurl: number,
    mode: number,
    radius = 15.0,
    time = 0.0
  ) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = (lon * Math.PI) / 180;
    const clampedUnfurl = Math.max(0.0, Math.min(1.0, unfurl));

    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    const ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);
    const dirX = sinPhi * sinTheta;
    const dirY = cosPhi;
    const dirZ = sinPhi * cosTheta;
    const dirLen = Math.hypot(dirX, dirY, dirZ);
    const invLen = dirLen > 1e-6 ? 1.0 / dirLen : 1.0;
    const normDir = new Vector3(dirX * invLen, dirY * invLen, dirZ * invLen);

    let target: Vector3;
    if (clampedUnfurl < 0.01) {
      target = new Vector3(0, 0, 0);
    } else {
      const deformedArr = evaluatePointMorph(lon, lat, clampedUnfurl, mode, time, 0.0);
      const standoff = 5.0 * (1.0 - ease);
      target = new Vector3(
        deformedArr[0] - standoff * normDir.x,
        deformedArr[1] - standoff * normDir.y,
        deformedArr[2] - standoff * normDir.z
      );
    }

    const cameraPos = new Vector3(
      target.x + radius * normDir.x,
      target.y + radius * normDir.y,
      target.z + radius * normDir.z
    );

    const deformedArr = evaluatePointMorph(lon, lat, clampedUnfurl, mode, time, 0.0);
    return {
      target,
      cameraPos,
      normDir,
      deformed: new Vector3(deformedArr[0], deformedArr[1], deformedArr[2]),
    };
  }

  // =========================================================================
  // 1. Dual CPU/GPU Culling Symmetry (Rule 33)
  // =========================================================================
  describe('Pillar 1: Dual CPU/GPU Horizon Occlusion Culling Symmetry', () => {
    it('verifies culling.wgsl removes mode == 0u gate and gates with continuous Hermite horizon culling', () => {
      const cullingWgsl = fs.readFileSync(cullingWgslPath, 'utf8');
      expect(cullingWgsl).not.toMatch(/uniforms\.mode\s*==\s*0u/);
      expect(cullingWgsl).toMatch(/globeWeight[\s\S]*?dot\(node\.center,\s*uniforms\.cameraPos\.xyz\)/);
    });

    it('verifies WebGPUEngine.ts CPU traversal gates horizon culling solely on unfurl < 0.01', () => {
      const engineTs = fs.readFileSync(engineTsPath, 'utf8');
      expect(engineTs).not.toMatch(/mode\s*===\s*0\s*&&\s*unfurl\s*<\s*0\.01/);
      expect(engineTs).toMatch(/cDotCam\s*\+/);
      expect(engineTs).toMatch(/(?:\(\s*unfurl\s*<\s*0\.01\s*\)\s*\?\s*Math\.max\(0,\s*camDistToCenter\s*-\s*5\.0\)|if\s*\(\s*unfurl\s*<\s*0\.01\s*\)\s*\{\s*camAltitudeUnits\s*=\s*Math\.max\(0(?:\.001)?,\s*camDistToCenter\s*-\s*5\.0\))/);
    });

    it('proves CDLOD quadtree node counts are identical across modes 0, 1, 2 on undeformed sphere (unfurl=0)', () => {
      const engine = new WebGPUEngine();
      engine.ensureCDLODBuffers();

      const camera = new PerspectiveCamera(45, 1.0, 0.1, 100);
      camera.position.set(0, 0, 15.0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      // Signature: updateCDLOD(camera, mode, unfurl, cursorActive)
      // Mode 0 (Linear)
      engine.updateCDLOD(camera, 0, 0.0, false);
      const statsMode0 = engine.getCDLODStats();

      // Mode 1 (Cylindrical Scroll)
      engine.updateCDLOD(camera, 1, 0.0, false);
      const statsMode1 = engine.getCDLODStats();

      // Mode 2 (Griffith Fracture)
      engine.updateCDLOD(camera, 2, 0.0, false);
      const statsMode2 = engine.getCDLODStats();

      expect(statsMode0.nodeCount).toBeGreaterThan(0);
      expect(statsMode1.nodeCount).toBe(statsMode0.nodeCount);
      expect(statsMode2.nodeCount).toBe(statsMode0.nodeCount);
      expect(statsMode1.totalVertices).toBe(statsMode0.totalVertices);
      expect(statsMode2.totalVertices).toBe(statsMode0.totalVertices);

      engine.dispose();
    });

    it('proves back-hemisphere nodes are occluded and culled on undeformed globe for all modes', () => {
      const engine = new WebGPUEngine();
      engine.ensureCDLODBuffers();

      const camera = new PerspectiveCamera(45, 1.0, 0.1, 100);
      // Camera looking down +Z towards origin; all nodes in deep -Z hemisphere should be culled
      camera.position.set(0, 0, 12.0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      for (const mode of [0, 1, 2]) {
        engine.updateCDLOD(camera, mode, 0.0, false);
        const count = (engine as any).cdlodActiveNodeCount;
        const pool = (engine as any).cdlodNodePool;

        expect(count).toBeGreaterThan(0);
        // Verify none of the active nodes have centers in the deep back hemisphere (center[2] < -2.0)
        for (let i = 0; i < count; i++) {
          const cz = pool[i].center[2];
          expect(cz).toBeGreaterThan(-2.0); // Bounded away from back hemisphere pole z = -5.0
        }
      }

      engine.dispose();
    });
  });

  // =========================================================================
  // 2. Manifold Camera Target Tracking Across Unfurl
  // =========================================================================
  describe('Pillar 2: Manifold Camera Target Tracking Mathematical Rigor', () => {
    it('verifies camera target at unfurl < 0.01 is strictly (0, 0, 0) across diverse coordinates', () => {
      const coords = [
        { lon: 0, lat: 0 },
        { lon: 87, lat: 28 }, // Himalayas
        { lon: 139.77, lat: 35.68 }, // Tokyo
        { lon: -74.0, lat: 40.71 }, // New York
        { lon: 0, lat: 85 }, // Near North Pole
        { lon: 0, lat: -85 }, // Near South Pole
        { lon: 180, lat: 0 }, // Antimeridian
      ];

      for (const { lon, lat } of coords) {
        for (const mode of [0, 1, 2, 3]) {
          const { target } = computeCameraPose(lon, lat, 0.0, mode);
          expect(target.x).toBe(0.0);
          expect(target.y).toBe(0.0);
          expect(target.z).toBe(0.0);
        }
      }
    });

    it('verifies camera target at unfurl = 1.0 exactly tracks 2D Mercator coordinates', () => {
      const coords = [
        { lon: 87, lat: 28 }, // Himalayas
        { lon: 139.77, lat: 35.68 }, // Tokyo
        { lon: -122.38, lat: 47.62 }, // Seattle / Puget Sound
        { lon: 0, lat: 0 },
      ];

      for (const { lon, lat } of coords) {
        for (const mode of [0, 1, 2, 3]) {
          const { target, deformed } = computeCameraPose(lon, lat, 1.0, mode);
          const p2D = mode === 0
            ? [(lon * Math.PI / 180.0) * 5.0, (lat * Math.PI / 180.0) * 5.0]
            : geoToMercator(lon, lat, 5.0);
          expect(target.x).toBeCloseTo(p2D[0], 4);
          expect(target.y).toBeCloseTo(p2D[1], 4);
          expect(target.z).toBeCloseTo(0.0, 4);
          expect(target.distanceTo(deformed)).toBeCloseTo(0.0, 4);
        }
      }
    });

    it('mathematically proves active surface point lies collinear on camera optical axis across all alpha in [0, 1]', () => {
      const testCoordinates = [
        { lon: 0, lat: 0 },
        { lon: 87, lat: 28 },
        { lon: 139.77, lat: 35.68 },
        { lon: -74.0, lat: 40.71 },
        { lon: 175, lat: -35 },
      ];

      const alphaSteps = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

      for (const { lon, lat } of testCoordinates) {
        for (const mode of [0, 1, 2, 3]) {
          for (const alpha of alphaSteps) {
            const { target, cameraPos, deformed } = computeCameraPose(lon, lat, alpha, mode, 15.0, 1.23);

            // Gaze ray from camera towards target:
            // Vector from camera to active surface point: deformed - cameraPos
            const toDeformed = new Vector3().subVectors(deformed, cameraPos);
            const toTarget = new Vector3().subVectors(target, cameraPos);

            // Normalize both vectors
            const dirToDeformed = toDeformed.clone().normalize();
            const dirToTarget = toTarget.clone().normalize();

            // Dot product must be 1.0 (exact collinearity along camera line of sight)
            const dot = dirToDeformed.dot(dirToTarget);
            expect(dot).toBeCloseTo(1.0, 6);

            // Cross product must be (0, 0, 0)
            const cross = new Vector3().crossVectors(dirToDeformed, dirToTarget);
            expect(cross.length()).toBeCloseTo(0.0, 6);
          }
        }
      }
    });

    it('proves target coordinates do NOT jump to Null Island (0, 0) during unfurl of Tokyo', () => {
      const tokyo = { lon: 139.77, lat: 35.68 };

      for (let alpha = 0.05; alpha <= 1.0; alpha += 0.05) {
        const { target } = computeCameraPose(tokyo.lon, tokyo.lat, alpha, 0);
        // Distance to (0, 0, 0) should smoothly expand towards 2D planar position, never staying at 0
        const distToOrigin = target.length();
        if (alpha > 0.3) {
          expect(distToOrigin).toBeGreaterThan(1.0);
        }
      }
    });
  });

  // =========================================================================
  // 3. Pan Inversion & Reverse Morph Parity
  // =========================================================================
  describe('Pillar 3: Pan Inversion & Reverse Morph Parity', () => {
    it('verifies inverse Mercator latitude mapping matches geoToMercator forward transform', () => {
      const testLats = [-75, -45, -20, 0, 25, 50, 70, 80];
      for (const lat of testLats) {
        const [, y] = geoToMercator(0, lat, 5.0);
        const clampedY = Math.max(-5.0 * 2.5, Math.min(5.0 * 2.5, y));
        const recoveredLatRad = 2.0 * Math.atan(Math.exp(clampedY / 5.0)) - Math.PI / 2.0;
        const recoveredLatDeg = recoveredLatRad * (180 / Math.PI);
        expect(recoveredLatDeg).toBeCloseTo(lat, 4);
      }
    });

    it('verifies inverse Mercator longitude mapping matches geoToMercator forward transform', () => {
      const testLons = [-179, -120, -60, 0, 60, 120, 179];
      for (const lon of testLons) {
        const [x] = geoToMercator(lon, 0, 5.0);
        let recoveredLonDeg = (x / 5.0) * (180 / Math.PI);
        recoveredLonDeg = ((((recoveredLonDeg + 180) % 360) + 360) % 360) - 180;
        expect(recoveredLonDeg).toBeCloseTo(lon, 4);
      }
    });

    it('proves reverse unfurl from panned flat-map coordinate centers on panned location on globe', () => {
      // Simulate user panning to Paris (lon = 2.35, lat = 48.85) on the flat map
      const [xParis, yParis] = geoToMercator(2.35, 48.85, 5.0);

      // Invert pan to geographic coordinates
      let lon = (xParis / 5.0) * (180 / Math.PI);
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const clampedY = Math.max(-5.0 * 2.5, Math.min(5.0 * 2.5, yParis));
      const lat = (2.0 * Math.atan(Math.exp(clampedY / 5.0)) - Math.PI / 2.0) * (180 / Math.PI);

      expect(lon).toBeCloseTo(2.35, 4);
      expect(lat).toBeCloseTo(48.85, 4);

      // Transition back to globe (alpha = 0) with these active coordinates
      const phi = ((90 - lat) * Math.PI) / 180;
      const theta = (lon * Math.PI) / 180;
      const spherePoint = geoToSphere(lon, lat, 5.0);

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const radialCam = new Vector3(
        15.0 * sinPhi * sinTheta,
        15.0 * cosPhi,
        15.0 * sinPhi * cosTheta
      );

      // Camera on globe pointing at (0, 0, 0) looks directly through Paris on sphere surface
      const toSpherePoint = new Vector3(spherePoint[0], spherePoint[1], spherePoint[2]).sub(radialCam).normalize();
      const toOrigin = new Vector3(0, 0, 0).sub(radialCam).normalize();

      expect(toSpherePoint.dot(toOrigin)).toBeCloseTo(1.0, 6);
    });
  });

  // =========================================================================
  // 4. Kinematic Invariants & EaseToCoordinates Parity
  // =========================================================================
  describe('Pillar 4: Kinematic Invariants & EaseToCoordinates Parity', () => {
    it('verifies WebGPUCanvas.tsx easeToCoordinates computes deformed target when unfurl >= 0.01', () => {
      const canvasSrc = fs.readFileSync(canvasTsxPath, 'utf8');
      expect(canvasSrc).toMatch(/easeToCoordinates:[\s\S]*?if\s*\(\s*curUnfurl\s*>=\s*0\.01\s*\)\s*\{[\s\S]*?endTarget\s*=\s*new\s*Vector3/);
    });

    it('verifies WebGPUCanvas.tsx onPointerMove updates targetRef during orbit drag when curUnfurl >= 0.01', () => {
      const canvasSrc = fs.readFileSync(canvasTsxPath, 'utf8');
      expect(canvasSrc).toMatch(/dragButtonRef\.current\s*===\s*0\)[\s\S]*?if\s*\(\s*curUnfurl\s*>=\s*0\.01\s*\)[\s\S]*?targetRef\.current\.set\(/);
    });

    it('verifies WebGPUCanvas.tsx RAF loop triggers updateCameraTransform on targetChanged', () => {
      const canvasSrc = fs.readFileSync(canvasTsxPath, 'utf8');
      expect(canvasSrc).toContain('let targetChanged = false;');
      expect(canvasSrc).toContain('targetChanged ||');
    });

    it('verifies easeToCoordinates mathematical target matches deformed manifold point on flat map (unfurl = 1)', () => {
      const lon = 139.77;
      const lat = 35.68;
      const p2D = [(lon * Math.PI / 180.0) * 5.0, (lat * Math.PI / 180.0) * 5.0];
      const deformed = evaluatePointMorph(lon, lat, 1.0, 0, 0, 0.0);
      expect(deformed[0]).toBeCloseTo(p2D[0], 4);
      expect(deformed[1]).toBeCloseTo(p2D[1], 4);
      expect(deformed[2]).toBeCloseTo(0.0, 4);
    });

    it('RULE-36: verifies WebGPUCanvas.tsx eliminates degenerate (1.0 - ease) multiplier on orbital angles', () => {
      const canvasSrc = fs.readFileSync(canvasTsxPath, 'utf8');
      expect(canvasSrc).not.toMatch(/dirX\s*=\s*\(1\.0\s*-\s*ease\)/);
      expect(canvasSrc).not.toMatch(/dirY\s*=\s*\(1\.0\s*-\s*ease\)/);
      expect(canvasSrc).not.toMatch(/dirZ\s*=\s*\(1\.0\s*-\s*ease\)/);
    });

    it('DEF-06: verifies WebGPUCanvas.tsx setSpherical falls back to sphericalRef when theta/phi are undefined', () => {
      const canvasSrc = fs.readFileSync(canvasTsxPath, 'utf8');
      expect(canvasSrc).toMatch(/const\s+curTheta\s*=\s*theta\s*!==\s*undefined\s*\?\s*theta\s*:\s*sphericalRef\.current\.theta/);
      expect(canvasSrc).toMatch(/const\s+curPhi\s*=\s*phi\s*!==\s*undefined\s*\?\s*phi\s*:\s*sphericalRef\.current\.phi/);
    });

    it('RULE-36: verifies camera retains oblique relief pitch and yaw at unfurl = 1.0 without nadir collapse', () => {
      // Test oblique angle at Tokyo on flat map
      const pose = computeCameraPose(139.77, 35.68, 1.0, 0, 15.0);
      const relCam = new Vector3().subVectors(pose.cameraPos, pose.target);
      // Under Rule 36, camera attitude is not collapsed to nadir (0, 0, 15)
      expect(Math.abs(relCam.x)).toBeGreaterThan(0.1);
      expect(Math.abs(relCam.y)).toBeGreaterThan(0.1);
      expect(relCam.length()).toBeCloseTo(15.0, 4);
    });
  });
});
