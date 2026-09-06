import { describe, it, expect } from 'vitest';
import {
  Vector3,
  Vector4,
  Matrix4,
  PerspectiveCamera,
  sphericalToCartesian,
  cartesianToSpherical,
  createLookAtMatrix,
  createPerspectiveMatrix,
  unprojectScreenRay,
  projectPoint,
  slerpVec3,
} from '../../src/core/math/cameraMath';
import {
  NativeInertialCameraController,
  DEFAULT_DAMPING_FACTOR,
} from '../../src/components/canvas/KinematicCameraController';

describe('Phase 3: Zero-Dependency Camera Linear Algebra & Kinematics', () => {
  // --------------------------------------------------------------------------
  // 1. Spherical <-> Cartesian Coordinate Conversions & Roundtrip Precision
  // --------------------------------------------------------------------------
  describe('Spherical to Cartesian conversions & precision', () => {
    it('accurately projects cardinal spherical coordinates onto Cartesian axes', () => {
      const radius = 15;

      // Prime meridian at equator (phi = PI/2, theta = 0) -> [0, 0, 15]
      const equator = sphericalToCartesian(radius, Math.PI / 2, 0);
      expect(equator[0]).toBeCloseTo(0, 5);
      expect(equator[1]).toBeCloseTo(0, 5);
      expect(equator[2]).toBeCloseTo(radius, 5);

      // North pole (phi = 0, theta = 0) -> [0, 15, 0]
      const northPole = sphericalToCartesian(radius, 0, 0);
      expect(northPole[0]).toBeCloseTo(0, 5);
      expect(northPole[1]).toBeCloseTo(radius, 5);
      expect(northPole[2]).toBeCloseTo(0, 5);

      // South pole (phi = PI, theta = 0) -> [0, -15, 0]
      const southPole = sphericalToCartesian(radius, Math.PI, 0);
      expect(southPole[0]).toBeCloseTo(0, 5);
      expect(southPole[1]).toBeCloseTo(-radius, 5);
      expect(southPole[2]).toBeCloseTo(0, 5);

      // 90° East equator (phi = PI/2, theta = PI/2) -> [15, 0, 0]
      const east = sphericalToCartesian(radius, Math.PI / 2, Math.PI / 2);
      expect(east[0]).toBeCloseTo(radius, 5);
      expect(east[1]).toBeCloseTo(0, 5);
      expect(east[2]).toBeCloseTo(0, 5);

      // Antimeridian (phi = PI/2, theta = PI) -> [0, 0, -15]
      const antimeridian = sphericalToCartesian(radius, Math.PI / 2, Math.PI);
      expect(antimeridian[0]).toBeCloseTo(0, 5);
      expect(antimeridian[1]).toBeCloseTo(0, 5);
      expect(antimeridian[2]).toBeCloseTo(-radius, 5);
    });

    it('preserves precision (< 1e-5) in spherical <-> cartesian roundtrips across all quadrants', () => {
      const radii = [6.0, 15.0, 30.0, 50.0];
      const phis = [0.05, 0.4, Math.PI / 4, Math.PI / 2, 2.2, Math.PI - 0.05];
      const thetas = [-Math.PI * 0.8, -Math.PI / 2, -0.3, 0, 0.3, Math.PI / 2, Math.PI * 0.8];

      for (const r of radii) {
        for (const phi of phis) {
          for (const theta of thetas) {
            const cart = sphericalToCartesian(r, phi, theta);
            const recovered = cartesianToSpherical(cart[0], cart[1], cart[2]);

            expect(Math.abs(recovered.radius - r)).toBeLessThan(1e-5);
            expect(Math.abs(recovered.phi - phi)).toBeLessThan(1e-5);
            expect(Math.abs(recovered.theta - theta)).toBeLessThan(1e-5);
          }
        }
      }
    });

    it('handles zero radius and extreme boundary values gracefully without producing NaN or Inf', () => {
      const zeroCart = sphericalToCartesian(0, 0, 0);
      expect(Number.isFinite(zeroCart[0])).toBe(true);
      expect(Number.isFinite(zeroCart[1])).toBe(true);
      expect(Number.isFinite(zeroCart[2])).toBe(true);
      expect(zeroCart[0]).toBe(0);
      expect(zeroCart[1]).toBe(0);
      expect(zeroCart[2]).toBe(0);

      const zeroSph = cartesianToSpherical(0, 0, 0);
      expect(zeroSph.radius).toBe(0);
      expect(Number.isFinite(zeroSph.phi)).toBe(true);
      expect(Number.isFinite(zeroSph.theta)).toBe(true);
      expect(Number.isNaN(zeroSph.phi)).toBe(false);
      expect(Number.isNaN(zeroSph.theta)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. View Matrix: createLookAtMatrix
  // --------------------------------------------------------------------------
  describe('View Matrix (createLookAtMatrix)', () => {
    it('constructs a valid orthonormal 4x4 matrix for standard camera configuration', () => {
      const eye = [0, 0, 15];
      const target = [0, 0, 0];
      const up = [0, 1, 0];

      const m = createLookAtMatrix(eye, target, up);
      expect(m.length).toBe(16);

      // Row basis vectors
      const xBasis = [m[0], m[4], m[8]];
      const yBasis = [m[1], m[5], m[9]];
      const zBasis = [m[2], m[6], m[10]];

      // Norm of basis vectors must be 1.0
      expect(Math.hypot(xBasis[0], xBasis[1], xBasis[2])).toBeCloseTo(1.0, 5);
      expect(Math.hypot(yBasis[0], yBasis[1], yBasis[2])).toBeCloseTo(1.0, 5);
      expect(Math.hypot(zBasis[0], zBasis[1], zBasis[2])).toBeCloseTo(1.0, 5);

      // Dot products must be 0 (orthogonality)
      const dotXY = xBasis[0] * yBasis[0] + xBasis[1] * yBasis[1] + xBasis[2] * yBasis[2];
      const dotXZ = xBasis[0] * zBasis[0] + xBasis[1] * zBasis[1] + xBasis[2] * zBasis[2];
      const dotYZ = yBasis[0] * zBasis[0] + yBasis[1] * zBasis[1] + yBasis[2] * zBasis[2];

      expect(dotXY).toBeCloseTo(0.0, 5);
      expect(dotXZ).toBeCloseTo(0.0, 5);
      expect(dotYZ).toBeCloseTo(0.0, 5);

      // Translation in view space
      expect(m[14]).toBeCloseTo(-15.0, 5);
      expect(m[15]).toBe(1.0);
    });

    it('recovers cleanly when eye and up are collinear without crashing or generating NaN', () => {
      // Eye at North Pole looking down at origin with up vector along +Y
      const eye = [0, 15, 0];
      const target = [0, 0, 0];
      const up = [0, 1, 0];

      const m = createLookAtMatrix(eye, target, up);
      for (let i = 0; i < 16; i++) {
        expect(Number.isFinite(m[i])).toBe(true);
        expect(Number.isNaN(m[i])).toBe(false);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Perspective Matrix: createPerspectiveMatrix
  // --------------------------------------------------------------------------
  describe('Perspective Matrix (createPerspectiveMatrix)', () => {
    it('constructs correct projection parameters for FOV, aspect, and near/far clip planes', () => {
      const fovRad = (45.0 * Math.PI) / 180.0;
      const aspect = 16.0 / 9.0;
      const near = 0.1;
      const far = 1000.0;

      const m = createPerspectiveMatrix(fovRad, aspect, near, far);
      const expectedFocal = 1.0 / Math.tan(fovRad / 2.0);

      expect(m[0]).toBeCloseTo(expectedFocal / aspect, 5);
      expect(m[5]).toBeCloseTo(expectedFocal, 5);
      expect(m[11]).toBe(-1.0);
      expect(m[15]).toBe(0.0);

      expect(Number.isFinite(m[10])).toBe(true);
      expect(Number.isFinite(m[14])).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Ray Unprojection & Screen Point Projection
  // --------------------------------------------------------------------------
  describe('Ray Unprojection & Point Projection', () => {
    it('unprojects screen coordinates into normalized world-space rays originating at camera', () => {
      const eye: [number, number, number] = [0, 0, 15];
      const target: [number, number, number] = [0, 0, 0];
      const up: [number, number, number] = [0, 1, 0];

      const view = createLookAtMatrix(eye, target, up);
      const proj = createPerspectiveMatrix((45 * Math.PI) / 180, 1.0, 0.1, 1000);

      // Unproject screen center (0, 0)
      const rayCenter = unprojectScreenRay(0, 0, view, proj, eye);

      expect(rayCenter.rayOrig[0]).toBeCloseTo(0, 5);
      expect(rayCenter.rayOrig[1]).toBeCloseTo(0, 5);
      expect(rayCenter.rayOrig[2]).toBeCloseTo(15, 5);

      // Center ray should point down -Z axis
      expect(rayCenter.rayDir[0]).toBeCloseTo(0, 5);
      expect(rayCenter.rayDir[1]).toBeCloseTo(0, 5);
      expect(rayCenter.rayDir[2]).toBeCloseTo(-1, 5);

      // Norm of direction must be 1.0
      const dirLen = Math.hypot(rayCenter.rayDir[0], rayCenter.rayDir[1], rayCenter.rayDir[2]);
      expect(dirLen).toBeCloseTo(1.0, 5);
    });

    it('projects world points accurately into viewport pixel coordinates and detects occlusion', () => {
      const eye = [0, 0, 10];
      const target = [0, 0, 0];
      const up = [0, 1, 0];

      const view = createLookAtMatrix(eye, target, up);
      const proj = createPerspectiveMatrix((45 * Math.PI) / 180, 1.0, 0.1, 100);

      // Target at origin in front of camera
      const frontPt = projectPoint([0, 0, 0], view, proj, 800, 600);
      expect(frontPt.x).toBeCloseTo(400, 1);
      expect(frontPt.y).toBeCloseTo(300, 1);
      expect(frontPt.visible).toBe(true);

      // Point behind camera (z = 20 > eye.z = 10)
      const behindPt = projectPoint([0, 0, 20], view, proj, 800, 600);
      expect(behindPt.visible).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Native Inertial Camera Controller Momentum Decay
  // --------------------------------------------------------------------------
  describe('NativeInertialCameraController momentum decay', () => {
    it('applies 0.05 exponential velocity decay matching Drei OrbitControls glide', () => {
      const controller = new NativeInertialCameraController({ dampingFactor: DEFAULT_DAMPING_FACTOR });
      expect(controller.dampingFactor).toBe(0.05);

      // Inject initial angular velocities
      controller.velTheta = 0.1;
      controller.velPhi = 0.05;
      controller.velRadius = -0.2;

      // Single frame update (dt = 1/60)
      const moved = controller.update(1 / 60);
      expect(moved).toBe(true);

      // Expect velocity to decay by (1 - 0.05) = 0.95
      expect(controller.velTheta).toBeCloseTo(0.1 * 0.95, 5);
      expect(controller.velPhi).toBeCloseTo(0.05 * 0.95, 5);
      expect(controller.velRadius).toBeCloseTo(-0.2 * 0.95, 5);
    });

    it('smoothly glides to rest over 60 frames (~1 second) and zeros out near threshold', () => {
      const controller = new NativeInertialCameraController({ dampingFactor: 0.05 });
      controller.velTheta = 1.0;

      for (let i = 0; i < 60; i++) {
        controller.update(1 / 60);
      }

      // After 60 frames, velocity should be around 0.95^60 ~= 0.046
      expect(controller.velTheta).toBeCloseTo(Math.pow(0.95, 60), 4);
      expect(controller.velTheta).toBeLessThan(0.05);

      // Run frames until it halts completely (decaying below 1e-6 threshold)
      for (let i = 0; i < 300; i++) {
        controller.update(1 / 60);
      }

      expect(controller.velTheta).toBe(0);
      expect(controller.update(1 / 60)).toBe(false);
    });

    it('clamps pitch angle phi to prevent gimbal lock at exact poles', () => {
      const controller = new NativeInertialCameraController();
      controller.phi = 0.05;
      controller.velPhi = -0.1; // pushing past north pole

      controller.update(1 / 60);
      expect(controller.phi).toBeGreaterThanOrEqual(0.001);

      controller.phi = Math.PI - 0.05;
      controller.velPhi = 0.1; // pushing past south pole

      controller.update(1 / 60);
      expect(controller.phi).toBeLessThanOrEqual(Math.PI - 0.001);
    });

    it('clamps zoom radius between minRadius and maxRadius', () => {
      const controller = new NativeInertialCameraController();
      controller.radius = controller.minRadius + 0.1;
      controller.velRadius = -1.0;

      controller.update(1 / 60);
      expect(controller.radius).toBe(controller.minRadius);

      controller.radius = controller.maxRadius - 0.1;
      controller.velRadius = 5.0;

      controller.update(1 / 60);
      expect(controller.radius).toBe(controller.maxRadius);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Vector3, Matrix4 & Slerp Mechanics
  // --------------------------------------------------------------------------
  describe('Vector3, Matrix4 & Slerp functionality', () => {
    it('performs Vector3 arithmetic, cross product, and normalization', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);

      const cross = new Vector3().crossVectors(a, b);
      expect(cross.x).toBe(0);
      expect(cross.y).toBe(0);
      expect(cross.z).toBe(1);

      const len = new Vector3(3, 4, 0).length();
      expect(len).toBe(5);

      const norm = new Vector3(0, 10, 0).normalize();
      expect(norm.y).toBe(1);
    });

    it('computes Matrix4 matrix inverse and verifies M * M^-1 = Identity', () => {
      const m = new Matrix4();
      m.lookAt(new Vector3(2, 3, 5), new Vector3(0, 0, 0), new Vector3(0, 1, 0));

      const mInv = m.clone().invert();
      const identityTest = new Matrix4().multiplyMatrices(m, mInv);

      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const idx = row + col * 4;
          const expected = row === col ? 1.0 : 0.0;
          expect(identityTest.elements[idx]).toBeCloseTo(expected, 4);
        }
      }
    });

    it('interpolates vectors along great circles via slerpVec3', () => {
      const p1: [number, number, number] = [1, 0, 0];
      const p2: [number, number, number] = [0, 1, 0];

      // Midpoint at t = 0.5
      const mid = slerpVec3(p1, p2, 0.5);
      expect(mid[0]).toBeCloseTo(Math.SQRT1_2, 5);
      expect(mid[1]).toBeCloseTo(Math.SQRT1_2, 5);
      expect(mid[2]).toBeCloseTo(0, 5);

      const len = Math.hypot(mid[0], mid[1], mid[2]);
      expect(len).toBeCloseTo(1.0, 5);
    });
  });
});
