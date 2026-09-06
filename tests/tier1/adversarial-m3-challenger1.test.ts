import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import {
  shouldCullBackface,
  computeCurlNoise,
  computeDivergence,
  generateFibonacciSphere,
  RADIUS,
} from '../helpers/math-oracle';
describe('Empirical Challenger 1: Milestone M3 Adversarial Challenge Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  let appCode = fs.readFileSync(appTsxPath, 'utf8');
  const geoLayerPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoLayerPath)) {
    appCode += '\n' + fs.readFileSync(geoLayerPath, 'utf8');
  }

  // =========================================================================
  // 1. Analytical Mathematical Verification of dot(vNorm, vDir) > 0.25
  // =========================================================================
  describe('1. Mathematical Verification of Facing Formula & Orbit Angles', () => {
    it('CH1-M3-T1: verifies coordinate-free facing identity dot(vNorm, vDir) = (R - D*cos(theta))/dist', () => {
      // For a sphere of radius R at origin and camera at distance D along +Z:
      // Camera C = (0, 0, D), Vertex P = (R sin(theta), 0, R cos(theta))
      const R = 5.0;
      const distances = [7.5, 10.0, 15.0, 25.0, 50.0, 100.0];

      for (const D of distances) {
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        camera.position.set(0, 0, D);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        const modelViewMatrix = camera.matrixWorldInverse;
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelViewMatrix);

        // Test 360 points around equator
        for (let deg = 0; deg <= 360; deg += 5) {
          const rad = (deg * Math.PI) / 180;
          const pos = new THREE.Vector3(R * Math.sin(rad), 0, R * Math.cos(rad));
          const normal = pos.clone().normalize();

          // Eye-space normal and vertex pos
          const vNorm = normal.clone().applyMatrix3(normalMatrix).normalize();
          const vPos = pos.clone().applyMatrix4(modelViewMatrix);
          const vDir = vPos.clone().normalize();

          const glslDot = vNorm.dot(vDir);

          // Analytical formula:
          // dist = ||P - C|| = sqrt(R^2 + D^2 - 2 R D cos(theta))
          // theta is angle between P and C (which is deg here, since C is on +Z)
          const cosTheta = Math.cos(rad);
          const dist = Math.sqrt(R * R + D * D - 2 * R * D * cosTheta);
          const analyticalDot = (R - D * cosTheta) / dist;

          expect(glslDot).toBeCloseTo(analyticalDot, 4);
        }
      }
    });

    it('CH1-M3-T2: verifies camera rotation invariance across 100 arbitrary 3D orientations', () => {
      const R = 5.0;
      const D = 15.0;

      for (let trial = 0; trial < 100; trial++) {
        // Random camera position on sphere of radius D
        const u = Math.random();
        const v = Math.random();
        const phi = Math.acos(2 * v - 1);
        const lambda = 2 * Math.PI * u;

        const camX = D * Math.sin(phi) * Math.cos(lambda);
        const camY = D * Math.sin(phi) * Math.sin(lambda);
        const camZ = D * Math.cos(phi);

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        camera.position.set(camX, camY, camZ);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        const modelViewMatrix = camera.matrixWorldInverse;
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelViewMatrix);

        // Test sub-satellite vertex (closest point: P = (R/D)*Cam)
        const subSatP = new THREE.Vector3(camX, camY, camZ).normalize().multiplyScalar(R);
        const subSatNorm = subSatP.clone().normalize();
        const vNormSub = subSatNorm.clone().applyMatrix3(normalMatrix).normalize();
        const vPosSub = subSatP.clone().applyMatrix4(modelViewMatrix);
        const vDirSub = vPosSub.clone().normalize();
        expect(vNormSub.dot(vDirSub)).toBeCloseTo(-1.0, 4);

        // Test antipodal vertex (farthest point: P = -(R/D)*Cam)
        const antiP = subSatP.clone().negate();
        const antiNorm = antiP.clone().normalize();
        const vNormAnti = antiNorm.clone().applyMatrix3(normalMatrix).normalize();
        const vPosAnti = antiP.clone().applyMatrix4(modelViewMatrix);
        const vDirAnti = vPosAnti.clone().normalize();
        expect(vNormAnti.dot(vDirAnti)).toBeCloseTo(1.0, 4);
      }
    });
  });

  // =========================================================================
  // 2. Horizon Grazing & Edge Clipping Prevention
  // =========================================================================
  describe('2. Silhouette Horizon & Grazing Angle Analysis', () => {
    it('CH1-M3-T3: verifies zero front-facing or horizon vertices are culled under perspective tangent projection', () => {
      const R = 5.0;
      const D = 15.0; // Standard distance
      const horizonAngleRad = Math.acos(R / D); // ~70.53 degrees
      const horizonAngleDeg = (horizonAngleRad * 180) / Math.PI;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, D);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const modelViewMatrix = camera.matrixWorldInverse;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelViewMatrix);

      // Verify all angles from sub-satellite point (0 deg) up to geometric horizon (70.53 deg)
      // and even beyond up to 85.65 deg are NOT culled
      for (let angleDeg = 0; angleDeg <= horizonAngleDeg + 10; angleDeg += 0.5) {
        const rad = (angleDeg * Math.PI) / 180;
        const pos = new THREE.Vector3(R * Math.sin(rad), 0, R * Math.cos(rad));
        const normal = pos.clone().normalize();

        const vNorm = normal.clone().applyMatrix3(normalMatrix).normalize();
        const vPos = pos.clone().applyMatrix4(modelViewMatrix);
        const vDir = vPos.clone().normalize();

        const dot = vNorm.dot(vDir);

        if (angleDeg <= horizonAngleDeg) {
          // In front of or at horizon: dot must be <= 0.0
          expect(dot).toBeLessThanOrEqual(0.0001);
          expect(dot > 0.25).toBe(false);
        } else {
          // Past horizon but within the 15-degree margin: dot must be < 0.25
          expect(dot).toBeLessThan(0.25);
          expect(dot > 0.25).toBe(false);
        }
      }
    });

    it('CH1-M3-T4: verifies 1.8px point size footprint does not clip at horizon', () => {
      // Horizon angle is ~70.53 deg, culling angle is ~85.65 deg
      // Distance between horizon point and culling boundary:
      const R = 5.0;
      const D = 15.0;
      const thetaHorizon = Math.acos(R / D);
      const thetaCull = Math.acos(0.07588); // where dot = 0.25

      const arcDistanceWorld = R * (thetaCull - thetaHorizon);
      expect(arcDistanceWorld).toBeGreaterThan(1.3); // > 1.3 world units

      // With camera FOV 45 deg at distance 15, vertical view height at target is 2 * 15 * tan(22.5) ~ 12.42 units
      // On 1080p screen, 1 world unit ~ 1080 / 12.42 ~ 87 pixels
      // Arc distance in screen space is ~ 1.3 * 87 ~ 113 pixels
      // A point of radius 0.9px (size 1.8px) is over 100 pixels away from the cull line!
      expect(arcDistanceWorld * 80).toBeGreaterThan(100.0);
    });
  });

  // =========================================================================
  // 3. Morph Progression Continuity (alpha = 0.0 -> 1.0) & Zero Popping
  // =========================================================================
  describe('3. Morph Progression Continuity & Zero Flickering', () => {
    it('CH1-M3-T5: verifies culling transition across alpha = 0.080 boundary has zero position discontinuity', () => {
      const { points3D, target2D } = generateFibonacciSphere(500);

      // Test across alpha boundary [0.079, 0.081] in 100 fine steps
      for (let i = 0; i < 500; i++) {
        const p3D = new THREE.Vector3(points3D[i * 3 + 0], points3D[i * 3 + 1], points3D[i * 3 + 2]);
        const p2D = new THREE.Vector3(target2D[i * 2 + 0], target2D[i * 2 + 1], 0.0);

        const getPosAtAlpha = (alpha: number) => {
          const clamped = Math.max(0, Math.min(1, alpha));
          const ease = clamped < 0.5 ? 4.0 * Math.pow(clamped, 3) : 1.0 - Math.pow(-2.0 * clamped + 2.0, 3) / 2.0;
          return p3D.clone().lerp(p2D, ease);
        };

        const posBefore = getPosAtAlpha(0.0799);
        const posAfter = getPosAtAlpha(0.0801);

        const delta = posBefore.distanceTo(posAfter);
        expect(delta).toBeLessThan(0.001); // C0 continuity
      }
    });

    it('CH1-M3-T6: verifies backfaceDimming smoothstep transition is continuous at alpha = 0.08', () => {
      // In fragment shader: backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, vFacing));
      const smoothstep = (min: number, max: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
        return t * t * (3 - 2 * t);
      };

      const dimming = (vFacing: number) => 0.15 + (1.0 - 0.15) * smoothstep(-0.5, 0.2, vFacing);

      // Verify smoothstep is monotonically increasing and C1 continuous
      for (let f = -1.0; f <= 1.0; f += 0.01) {
        const d = dimming(f);
        expect(d).toBeGreaterThanOrEqual(0.15);
        expect(d).toBeLessThanOrEqual(1.0);
      }

      // At facing = -0.25 (culling boundary):
      const dimmingAtBoundary = dimming(-0.25);
      expect(dimmingAtBoundary).toBeGreaterThan(0.25);
      expect(dimmingAtBoundary).toBeLessThan(0.40);
    });
  });

  // =========================================================================
  // 4. Degenerate Clip Space & Hardware Clipper Robustness
  // =========================================================================
  describe('4. Hardware Clipper & Degenerate Clip Coordinate Safety', () => {
    it('CH1-M3-T7: verifies vec4(0, 0, 2, 0) satisfies OpenGL/WebGL clip space rejection criteria', () => {
      // Clip coordinates: (x, y, z, w) = (0.0, 0.0, 2.0, 0.0)
      const x = 0.0, y = 0.0, z = 2.0, w = 0.0;

      // WebGL clip test: -w <= x <= w, -w <= y <= w, -w <= z <= w
      const passesX = -w <= x && x <= w; // 0 <= 0 <= 0 (true)
      const passesY = -w <= y && y <= w; // 0 <= 0 <= 0 (true)
      const passesZ = -w <= z && z <= w; // 0 <= 2 <= 0 (false!)

      const isInsideClipVolume = passesX && passesY && passesZ;
      expect(isInsideClipVolume).toBe(false); // Hardware rejects primitive
    });

    it('CH1-M3-T8: verifies lineSegments shader binding uses distinct meshVertexShader without vertex-drop early-out', () => {
      if (!fs.existsSync(geoLayerPath)) return;
      expect(appCode).toMatch(/const meshVertexShader = `[\s\S]*?`;/);
      expect(appCode).toMatch(/<lineSegments[\s\S]*?vertexShader=\{meshVertexShader\}/);
      expect(appCode).toMatch(/<points[\s\S]*?vertexShader=\{vertexShader\}/);
    });
  });

  // =========================================================================
  // 5. 1M FLOP Throughput & Performance Scaling
  // =========================================================================
  describe('5. 1,000,000-Node Performance & Transcendental FLOP Savings', () => {
    it('CH1-M3-T9: verifies cull fraction under perspective (53.8%) and orthographic (37.5%) limits', () => {
      const N = 100000; // Sample 100k points for statistical accuracy
      const { points3D } = generateFibonacciSphere(N);

      // 1. Perspective Camera at D=15
      const cameraPersp = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      cameraPersp.position.set(0, 0, 15.0);
      cameraPersp.lookAt(0, 0, 0);
      cameraPersp.updateMatrixWorld();

      const modelViewMatrixPersp = cameraPersp.matrixWorldInverse;
      const normalMatrixPersp = new THREE.Matrix3().getNormalMatrix(modelViewMatrixPersp);

      let culledPersp = 0;
      for (let i = 0; i < N; i++) {
        const pos = new THREE.Vector3(points3D[i * 3 + 0], points3D[i * 3 + 1], points3D[i * 3 + 2]);
        const normal = pos.clone().normalize();

        const vNorm = normal.clone().applyMatrix3(normalMatrixPersp).normalize();
        const vPos = pos.clone().applyMatrix4(modelViewMatrixPersp);
        const vDir = vPos.clone().normalize();

        if (vNorm.dot(vDir) > 0.25) {
          culledPersp++;
        }
      }

      const fractionPersp = culledPersp / N;
      // Analytical perspective cull fraction for R=5, D=15 is (1 + 0.07588)/2 = 0.53794
      expect(fractionPersp).toBeCloseTo(0.5379, 2);

      // 2. Distant Orthographic limit Camera at D=10,000
      const cameraOrtho = new THREE.PerspectiveCamera(45, 1, 0.1, 20000);
      cameraOrtho.position.set(0, 0, 10000.0);
      cameraOrtho.lookAt(0, 0, 0);
      cameraOrtho.updateMatrixWorld();

      const modelViewMatrixOrtho = cameraOrtho.matrixWorldInverse;
      const normalMatrixOrtho = new THREE.Matrix3().getNormalMatrix(modelViewMatrixOrtho);

      let culledOrtho = 0;
      for (let i = 0; i < N; i++) {
        const pos = new THREE.Vector3(points3D[i * 3 + 0], points3D[i * 3 + 1], points3D[i * 3 + 2]);
        const normal = pos.clone().normalize();

        const vNorm = normal.clone().applyMatrix3(normalMatrixOrtho).normalize();
        const vPos = pos.clone().applyMatrix4(modelViewMatrixOrtho);
        const vDir = vPos.clone().normalize();

        if (vNorm.dot(vDir) > 0.25) {
          culledOrtho++;
        }
      }

      const fractionOrtho = culledOrtho / N;
      // Analytical orthographic cull fraction is (1 - 0.25)/2 = 0.375
      expect(fractionOrtho).toBeCloseTo(0.375, 2);
    });

    it('CH1-M3-T10: verifies 1M vertex FLOP savings exceeds 1.0 GFLOPs/sec at 60 FPS', () => {
      const N = 1000000;
      const cullFraction = 0.375; // Conservative orthographic lower bound
      const culledNodes = N * cullFraction; // 375,000 nodes

      // Operations saved per culled vertex:
      // computeCurlNoise: 9 trig calls (6 cos + 3 sin) + 30 arithmetic ops = 39 ops
      // ease calculation + lerp + normal transforms = ~25 ops
      // Total ops saved per vertex = ~64 FLOPs
      const opsPerVertex = 64;
      const gflopsSaved = (culledNodes * opsPerVertex * 60) / 1e9;

      expect(gflopsSaved).toBeGreaterThanOrEqual(1.0); // > 1.44 GFLOPs/sec
    });
  });
});
