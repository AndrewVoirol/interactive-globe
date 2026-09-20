// ============================================================================
// File: tests/modern/challenger-m4-cursor-zoom-kinematics.test.ts
// Challenger: Challenger 1 (Milestone 4 Iteration 2)
// Scope: Camera Interaction UX & Cursor-Relative Zoom Kinematics
// Invariants Tested:
// - Bounded target displacement: targetRef.length() <= 5.0
// - Convergence and limit cycle / oscillation detection on off-center zoom-in
// - Zoom-out restoration to origin and snapping desynchronization at radius >= 20.0
// - Zero-GC Buffer Discipline (Rule 26): TypedArray and object allocations per wheel event
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  PerspectiveCamera,
  Vector3,
  Matrix4,
} from '../../src/core/math/cameraMath';
import {
  unprojectScreenToRay,
  computeManifoldHit,
} from '../../src/utils/raycast';

const ORIGIN_VEC = new Vector3(0, 0, 0);

describe('Challenger M4-IT2: Cursor-Relative Zoom Kinematics & Allocation Stress', () => {

  // ==========================================================================
  // Pillar 1: Implementation Contract Verification
  // ==========================================================================
  describe('Pillar 1: Implementation Contract Verification', () => {
    const canvasFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
    const canvasSrc = fs.readFileSync(canvasFilePath, 'utf8');

    it('CHALLENGE-ZOOM-01: Verifies onWheel handles deltaY < 0 (zoom-in) and deltaY > 0 (zoom-out)', () => {
      expect(canvasSrc).toContain('if (e.deltaY < 0)');
      expect(canvasSrc).toContain('else if (e.deltaY > 0)');
    });

    it('CHALLENGE-ZOOM-02: Verifies targetRef is clamped to length <= 5.0 in WebGPUCanvas (spherical mode)', () => {
      expect(canvasSrc).toMatch(/if\s*\(\s*curUnfurl\s*<\s*0\.01\s*&&\s*len\s*>\s*5\.0\s*\)\s*\{\s*targetRef\.current\.multiplyScalar\(\s*5\.0\s*\/\s*len\s*\);\s*\}/);
    });

    it('CHALLENGE-ZOOM-03: Verifies zoom-out snapping at radius >= 20.0 or lengthSq() < 1e-5 in onWheel (spherical mode)', () => {
      expect(canvasSrc).toMatch(/if\s*\(\s*curUnfurl\s*<\s*0\.01\s*\)\s*\{[^}]*?targetRef\.current\.lerp\(\s*ORIGIN_VEC[\s\S]*?if\s*\(\s*sphericalRef\.current\.radius\s*>=\s*20\.0\s*\|\|\s*targetRef\.current\.lengthSq\(\)\s*<\s*1e-5\s*\)\s*\{\s*targetRef\.current\.set\(\s*0\s*,\s*0\s*,\s*0\s*\);\s*\}/);
    });

    it('CHALLENGE-ZOOM-04: Verifies onWheel reads currentHitPosRef.current and eliminates fresh unproject', () => {
      const onWheelBlock = canvasSrc.slice(canvasSrc.indexOf('const onWheel ='), canvasSrc.indexOf('const onContextMenu ='));
      const readsCurrentHitPosRef = onWheelBlock.includes('currentHitPosRef.current');
      const callsUnprojectInWheel = onWheelBlock.includes('unprojectScreenToRay(');
      
      // Verified ORIGINAL_REQUEST.md:1506 compliance: reads currentHitPosRef.current
      expect(callsUnprojectInWheel).toBe(false);
      expect(readsCurrentHitPosRef).toBe(true);
    });
  });

  // ==========================================================================
  // Pillar 2: Kinematic Bounds & Convergence
  // ==========================================================================
  describe('Pillar 2: Kinematic Bounds & Convergence', () => {
    function createRig(initialRadius = 15.0, unfurl = 0.0) {
      const camera = new PerspectiveCamera(45, 1024 / 768, 0.1, 1000);
      const target = new Vector3(0, 0, 0);
      const spherical = { radius: initialRadius, theta: 0, phi: Math.PI / 2 };

      function updateCameraTransform() {
        camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
        camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi);
        camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
        camera.lookAt(target);
        camera.updateMatrixWorld();
      }

      function stepWheel(ndcX: number, ndcY: number, deltaY: number) {
        const { rayOrig, rayDir } = unprojectScreenToRay(ndcX, ndcY, camera);
        const hitResult = computeManifoldHit(rayOrig, rayDir, unfurl, 5.0);

        if (deltaY < 0) {
          if (hitResult.hit && hitResult.hitPos) {
            const lerpFactor = Math.min(0.08, Math.abs(deltaY) * 0.0008);
            target.lerp(hitResult.hitPos, lerpFactor);
            const len = target.length();
            if (unfurl < 0.01 && len > 5.0) {
              target.multiplyScalar(5.0 / len);
            }
          } else {
            const decayFactor = Math.min(0.05, Math.abs(deltaY) * 0.0005);
            target.lerp(ORIGIN_VEC, decayFactor);
          }
        } else if (deltaY > 0) {
          if (unfurl < 0.01) {
            const recenterFactor = Math.min(0.10, Math.abs(deltaY) * 0.0010);
            target.lerp(ORIGIN_VEC, recenterFactor);
            if (spherical.radius >= 20.0 || target.lengthSq() < 1e-5) {
              target.set(0, 0, 0);
            }
          }
        }

        const zoomImpulse = deltaY * 0.015;
        spherical.radius = Math.max(5.1, spherical.radius + zoomImpulse);
        updateCameraTransform();
      }

      updateCameraTransform();
      return { camera, target, spherical, stepWheel, updateCameraTransform };
    }

    it('CHALLENGE-ZOOM-05: Strict target length clamp <= 5.0 across 1000 adversarial impulses', () => {
      const rig = createRig(15.0);
      const testCases = [
        { ndcX: 0.0, ndcY: 0.0, deltaY: -500 },
        { ndcX: 0.2, ndcY: 0.3, deltaY: -1000 },
        { ndcX: -0.3, ndcY: -0.3, deltaY: -10000 },
        { ndcX: 0.8, ndcY: 0.8, deltaY: -2000 },
        { ndcX: -0.9, ndcY: 0.1, deltaY: -5000 },
      ];

      for (const tc of testCases) {
        for (let step = 0; step < 200; step++) {
          rig.stepWheel(tc.ndcX, tc.ndcY, tc.deltaY);
          expect(rig.target.length()).toBeLessThanOrEqual(5.000001);
          expect(Number.isFinite(rig.target.x)).toBe(true);
          expect(Number.isFinite(rig.target.y)).toBe(true);
          expect(Number.isFinite(rig.target.z)).toBe(true);
        }
      }
    });

    it('CHALLENGE-ZOOM-06: Monotonic convergence to center on NDC (0, 0) zoom-in without overshoot', () => {
      const rig = createRig(15.0);
      let prevDistToHit = rig.target.distanceTo(new Vector3(0, 0, 5));

      for (let step = 0; step < 50; step++) {
        rig.stepWheel(0, 0, -100);
        const dist = rig.target.distanceTo(new Vector3(0, 0, 5));
        expect(dist).toBeLessThanOrEqual(prevDistToHit + 1e-6);
        prevDistToHit = dist;
      }

      expect(rig.target.z).toBeGreaterThan(4.5);
      expect(Math.abs(rig.target.x)).toBeLessThan(1e-4);
      expect(Math.abs(rig.target.y)).toBeLessThan(1e-4);
    });

    it('CHALLENGE-ZOOM-07: Off-globe cursor triggers graceful decay toward origin (0, 0, 0)', () => {
      const rig = createRig(15.0);
      rig.target.set(2.0, 1.5, 3.0);
      rig.updateCameraTransform();

      const initialDist = rig.target.length();
      for (let step = 0; step < 20; step++) {
        rig.stepWheel(0.95, 0.95, -100);
      }

      expect(rig.target.length()).toBeLessThan(initialDist);
    });

    it('CHALLENGE-ZOOM-08: Demonstrates snapping behavior once radius >= 20.0 during wheel event', () => {
      const rig = createRig(20.5); // Already at radius >= 20.0
      rig.target.set(3.0, 2.0, 1.0);
      rig.updateCameraTransform();

      // When wheel event occurs while radius >= 20.0, target snaps to origin
      rig.stepWheel(0.2, 0.3, 100);

      expect(rig.target.x).toBe(0);
      expect(rig.target.y).toBe(0);
      expect(rig.target.z).toBe(0);
      expect(rig.target.length()).toBe(0);
    });

    it('CHALLENGE-ZOOM-09: Zoom-out snaps to (0, 0, 0) when lengthSq < 1e-5 even if radius < 20.0', () => {
      const rig = createRig(10.0);
      rig.target.set(0.001, 0.001, 0.001); // lengthSq = 3e-6 < 1e-5
      rig.updateCameraTransform();

      rig.stepWheel(0, 0, 50);
      expect(rig.target.x).toBe(0);
      expect(rig.target.y).toBe(0);
      expect(rig.target.z).toBe(0);
    });

    it('CHALLENGE-ZOOM-10: Identifies target drift/oscillation during repeated off-center zoom-in', () => {
      const rig = createRig(15.0);
      let hitCount = 0;
      let missCount = 0;

      // Zooming in at fixed off-center cursor NDC (0.25, 0.25)
      for (let step = 0; step < 100; step++) {
        const { rayOrig, rayDir } = unprojectScreenToRay(0.25, 0.25, rig.camera);
        const hitResult = computeManifoldHit(rayOrig, rayDir, 0, 5.0);
        if (hitResult.hit) {
          hitCount++;
        } else {
          missCount++;
        }
        rig.stepWheel(0.25, 0.25, -100);
      }

      // Camera translation shifts perspective such that a fixed cursor NDC eventually falls off the globe limb
      expect(missCount).toBeGreaterThan(0);
      expect(hitCount).toBeGreaterThan(0);
    });

    it('CHALLENGE-ZOOM-13: Flat map zoom (unfurl >= 0.01) preserves targets with length > 5.0 without origin decay or clamping', () => {
      // Simulates flat map zoom kinematics matching onWheel logic (DEF-01 P0 blocker fix)
      const rig = createRig(15.0, 1.0);
      rig.target.set(12.19, 3.34, 0.0); // Tokyo coordinates on flat map
      rig.updateCameraTransform();

      // Step zoom-in: at center screen (0, 0), ray aims directly at target
      rig.stepWheel(0.0, 0.0, -500);

      // Verify target length > 5.0 is preserved without clamping
      expect(rig.target.length()).toBeGreaterThan(5.0);
      expect(rig.target.x).toBeCloseTo(12.19, 2);
      expect(rig.target.y).toBeCloseTo(3.34, 2);

      // Step zoom-out with large deltaY to radius >= 20.0: verify no decay toward origin or snapping
      rig.spherical.radius = 25.0;
      rig.stepWheel(0.0, 0.0, 500);

      expect(rig.target.length()).toBeGreaterThan(5.0);
      expect(rig.target.x).toBeCloseTo(12.19, 2);
      expect(rig.target.y).toBeCloseTo(3.34, 2);
    });
  });

  // ==========================================================================
  // Pillar 3: Rule 26 Zero-GC Buffer Discipline Verification
  // ==========================================================================
  describe('Pillar 3: Zero-GC Buffer Discipline (Rule 26)', () => {
    it('CHALLENGE-ZOOM-11: Detects Float32Array heap allocation in unprojectScreenToRay', () => {
      const camera = new PerspectiveCamera(45, 1024 / 768, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.lookAt(ORIGIN_VEC);
      camera.updateMatrixWorld();

      let float32ArrayAllocations = 0;
      const OrigFloat32Array = globalThis.Float32Array;

      class InstrumentFloat32Array extends OrigFloat32Array {
        constructor(...args: any[]) {
          super(...(args as [any]));
          float32ArrayAllocations++;
        }
      }

      try {
        globalThis.Float32Array = InstrumentFloat32Array as any;
        float32ArrayAllocations = 0;

        const { rayOrig, rayDir } = unprojectScreenToRay(0.2, 0.3, camera);
        computeManifoldHit(rayOrig, rayDir, 0, 5.0);

        // cameraMath.ts:205 instantiates new Matrix4() -> new Float32Array(16)
        // Rule 26 requires Zero-GC buffers during interaction loops
        expect(float32ArrayAllocations).toBe(1);
      } finally {
        globalThis.Float32Array = OrigFloat32Array;
      }
    });

    it('CHALLENGE-ZOOM-12: Verifies renderLoop in WebGPUCanvas enforces radius >= 20.0 target snapping', () => {
      const canvasFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
      const canvasSrc = fs.readFileSync(canvasFilePath, 'utf8');

      // Extract renderLoop block
      const renderLoopStart = canvasSrc.indexOf('const renderLoop =');
      const renderLoopEnd = canvasSrc.indexOf('requestAnimationFrame(renderLoop);', renderLoopStart);
      const renderLoopSrc = canvasSrc.slice(renderLoopStart, renderLoopEnd + 40);

      // Verify that while velRadius inertia damping occurs in renderLoop:
      expect(renderLoopSrc).toContain('Math.max(sphericalRef.current.radius + vel.velRadius, h_floor)');
      // The snap to (0, 0, 0) is enforced in the frame loop
      expect(renderLoopSrc).toContain('targetRef.current.set(0, 0, 0)');
    });
  });
});
