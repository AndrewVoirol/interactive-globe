import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  RADIUS,
  screenToNDC,
  raySphereIntersect,
  rayPlaneIntersect,
  unprojectScreenToRay,
  computeManifoldHit,
  lambOseenVortex,
  griffithHoopStress,
  CursorTracker,
} from '../../src/utils/raycast';

describe('Milestone M5: Comprehensive Cursor Raycasting & Physics Perturbation Test Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Screen-to-NDC Coordinate Mapping
  // --------------------------------------------------------------------------
  describe('Screen-to-NDC Transformations', () => {
    it('M5-T01: converts screen corners and center accurately to NDC [-1, 1]', () => {
      const W = 1920;
      const H = 1080;

      const center = screenToNDC(960, 540, W, H);
      expect(center.ndcX).toBeCloseTo(0.0, 5);
      expect(center.ndcY).toBeCloseTo(0.0, 5);

      const topLeft = screenToNDC(0, 0, W, H);
      expect(topLeft.ndcX).toBeCloseTo(-1.0, 5);
      expect(topLeft.ndcY).toBeCloseTo(1.0, 5);

      const bottomRight = screenToNDC(1920, 1080, W, H);
      expect(bottomRight.ndcX).toBeCloseTo(1.0, 5);
      expect(bottomRight.ndcY).toBeCloseTo(-1.0, 5);
    });

    it('M5-T02: safely handles 0 or negative viewport dimensions without NaN', () => {
      const result = screenToNDC(100, 100, 0, 0);
      expect(Number.isNaN(result.ndcX)).toBe(false);
      expect(Number.isNaN(result.ndcY)).toBe(false);
      expect(Number.isFinite(result.ndcX)).toBe(true);
      expect(Number.isFinite(result.ndcY)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Analytical Manifold Raycasting
  // --------------------------------------------------------------------------
  describe('Analytical Ray-Manifold Intersections', () => {
    it('M5-T03: solves ray-sphere intersection with front-facing normal', () => {
      const rayOrig: [number, number, number] = [0, 0, 15];
      const rayDir: [number, number, number] = [0, 0, -1];

      const res = raySphereIntersect(rayOrig, rayDir, RADIUS);
      expect(res.hit).toBe(true);
      expect(res.distance).toBeCloseTo(10.0, 5);
      expect(res.hitPos).not.toBeNull();
      expect(res.hitPos![0]).toBeCloseTo(0.0, 5);
      expect(res.hitPos![1]).toBeCloseTo(0.0, 5);
      expect(res.hitPos![2]).toBeCloseTo(5.0, 5);
    });

    it('M5-T04: solves ray-plane intersection for 2D map net at Z = 0', () => {
      const rayOrig: [number, number, number] = [3, 4, 10];
      const rayDir: [number, number, number] = [0, 0, -1];

      const res = rayPlaneIntersect(rayOrig, rayDir, 0.0);
      expect(res.hit).toBe(true);
      expect(res.distance).toBeCloseTo(10.0, 5);
      expect(res.hitPos).not.toBeNull();
      expect(res.hitPos![0]).toBeCloseTo(3.0, 5);
      expect(res.hitPos![1]).toBeCloseTo(4.0, 5);
      expect(res.hitPos![2]).toBeCloseTo(0.0, 5);
    });

    it('M5-T05: handles ray parallel to 2D plane without division by zero', () => {
      const rayOrig: [number, number, number] = [0, 0, 10];
      const rayDir: [number, number, number] = [1, 0, 0]; // Parallel to Z=0 plane

      const res = rayPlaneIntersect(rayOrig, rayDir, 0.0);
      expect(res.hit).toBe(false);
      expect(res.hitPos).toBeNull();
      expect(res.distance).toBe(Infinity);
    });

    it('M5-T06: unprojects screen NDC into camera world ray accurately', () => {
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const { rayOrig, rayDir } = unprojectScreenToRay(0, 0, camera);
      expect(rayOrig.x).toBeCloseTo(0, 4);
      expect(rayOrig.y).toBeCloseTo(0, 4);
      expect(rayOrig.z).toBeCloseTo(15, 4);

      expect(rayDir.x).toBeCloseTo(0, 4);
      expect(rayDir.y).toBeCloseTo(0, 4);
      expect(rayDir.z).toBeCloseTo(-1, 4);
      expect(rayDir.length()).toBeCloseTo(1.0, 5);
    });

    it('M5-T07: computes smooth continuous manifold hit across alpha in [0, 1]', () => {
      const rayOrig = new THREE.Vector3(0, 0, 15);
      const rayDir = new THREE.Vector3(0, 0, -1);

      for (let i = 0; i <= 20; i++) {
        const alpha = i / 20;
        const { hitPos, distance } = computeManifoldHit(rayOrig, rayDir, alpha, RADIUS);

        expect(Number.isFinite(hitPos.x)).toBe(true);
        expect(Number.isFinite(hitPos.y)).toBe(true);
        expect(Number.isFinite(hitPos.z)).toBe(true);
        expect(Number.isFinite(distance)).toBe(true);
        expect(Number.isNaN(hitPos.z)).toBe(false);

        if (alpha === 0) {
          expect(hitPos.z).toBeCloseTo(5.0, 4);
        } else if (alpha === 1) {
          expect(hitPos.z).toBeCloseTo(0.0, 4);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Lamb-Oseen Rotational Fluid Vortex (Mode 3)
  // --------------------------------------------------------------------------
  describe('Mode 3 Fluid Lamb-Oseen Vortex Wake', () => {
    it('M5-T08: evaluates finite vorticity and zero tangential velocity at r = 0', () => {
      const { vTheta, vorticity } = lambOseenVortex(0.0, 0.0, 2.5);
      expect(vTheta).toBe(0.0);
      expect(Number.isFinite(vorticity)).toBe(true);
      expect(vorticity).toBeGreaterThan(0.0);
    });

    it('M5-T09: demonstrates 1/r potential vortex asymptotic decay in far field', () => {
      const r1 = 4.0;
      const r2 = 8.0;
      const v1 = lambOseenVortex(r1, 0.0, 1.0).vTheta;
      const v2 = lambOseenVortex(r2, 0.0, 1.0).vTheta;

      expect(v1 / v2).toBeCloseTo(2.0, 1);
    });

    it('M5-T10: vorticity diffuses outward and decays monotonically over time', () => {
      const r = 0.2;
      const v0 = lambOseenVortex(r, 0.0, 1.0).vorticity;
      const v1 = lambOseenVortex(r, 0.5, 1.0).vorticity;
      const v2 = lambOseenVortex(r, 2.0, 1.0).vorticity;

      expect(v0).toBeGreaterThan(v1);
      expect(v1).toBeGreaterThan(v2);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Griffith Tensile Hoop Stress Concentration (Mode 2)
  // --------------------------------------------------------------------------
  describe('Mode 2 Griffith Tensile Hoop Stress', () => {
    it('M5-T11: concentrates stress inversely with sqrt(r) along crack front', () => {
      const sNear = griffithHoopStress(0.02, 0.0, 1.0).sigmaThetaTheta;
      const sFar = griffithHoopStress(0.08, 0.0, 1.0).sigmaThetaTheta;

      expect(sNear / sFar).toBeCloseTo(2.0, 1);
    });

    it('M5-T12: cursor proximity amplifies effective KI and hoop stress', () => {
      const sBase = griffithHoopStress(0.1, 0.0, 1.0, Infinity).sigmaThetaTheta;
      const sProbed = griffithHoopStress(0.1, 0.0, 1.0, 0.0, 1.5, 1.0).sigmaThetaTheta;

      expect(sProbed / sBase).toBeCloseTo(2.5, 3);
    });

    it('M5-T13: guarantees local strain is strictly clamped to [0.0, 0.40]', () => {
      const sExtreme = griffithHoopStress(1e-6, 0.0, 500.0);
      expect(sExtreme.localStrain).toBeLessThanOrEqual(0.40);
      expect(sExtreme.localStrain).toBeGreaterThan(0.0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Stateful CursorTracker Lifecycle & OrbitControls Non-Interference
  // --------------------------------------------------------------------------
  describe('CursorTracker Lifecycle & Non-Blocking State', () => {
    it('M5-T14: initializes with default uniforms and zero NaN values', () => {
      const tracker = new CursorTracker();
      const uniforms = tracker.getUniforms();

      expect(uniforms.u_cursorRayOrig.z).toBeCloseTo(15, 1);
      expect(uniforms.u_cursorRayDir.z).toBeCloseTo(-1, 1);
      expect(uniforms.u_cursorHitPos.z).toBeCloseTo(5, 1);
      expect(uniforms.u_cursorActive).toBe(0.0);
      expect(uniforms.u_cursorVel.w).toBe(0.0);
    });

    it('M5-T15: updates ray and hit coordinates under camera rotation', () => {
      const tracker = new CursorTracker();
      tracker.ndcX = 0;
      tracker.ndcY = 0;
      tracker.activeIntensity = 1.0;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(15, 0, 0); // Along +X axis
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const uniforms = tracker.update(camera, 0.0);

      expect(uniforms.u_cursorRayOrig.x).toBeCloseTo(15, 4);
      expect(uniforms.u_cursorRayDir.x).toBeCloseTo(-1, 4);
      expect(uniforms.u_cursorHitPos.x).toBeCloseTo(5.0, 4);
      expect(uniforms.u_cursorHitPos.y).toBeCloseTo(0.0, 4);
      expect(uniforms.u_cursorHitPos.z).toBeCloseTo(0.0, 4);
    });

    it('M5-T16: attaches and detaches event listeners cleanly without memory leaks', () => {
      const tracker = new CursorTracker();
      const listeners: Record<string, Function> = {};

      const mockTarget = {
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = fn;
        },
        removeEventListener: (event: string) => {
          delete listeners[event];
        },
      } as unknown as Window;

      tracker.attach(mockTarget);
      expect(listeners['pointermove']).toBeDefined();
      expect(listeners['pointerleave']).toBeDefined();

      tracker.detach();
      expect(listeners['pointermove']).toBeUndefined();
      expect(listeners['pointerleave']).toBeUndefined();
    });
  });
});
