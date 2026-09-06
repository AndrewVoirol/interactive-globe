import { describe, it, expect } from 'vitest';
import {
  Vector3,
  Vector4,
  Quaternion,
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

// Seeded pseudorandom generator for deterministic, reproducible stress tests
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Adversarial Stress Suite: Pure ES6 Camera Linear Algebra & Kinematics', () => {
  // ==========================================================================
  // Domain 1: Singularity & Boundary Stress Testing
  // ==========================================================================
  describe('Domain 1: Singularities & Extreme Boundary Conditions', () => {
    it('North and South Pole singularities (phi = 0, phi = PI)', () => {
      const thetas = [-Math.PI, -Math.PI / 2, -0.01, 0, 0.01, Math.PI / 2, Math.PI];
      const radii = [0.1, 1.0, 15.0, 1000.0];

      for (const r of radii) {
        for (const theta of thetas) {
          // North pole: phi = 0
          const np = sphericalToCartesian(r, 0, theta);
          expect(np[0]).toBeCloseTo(0, 5);
          expect(np[1]).toBeCloseTo(r, 5);
          expect(np[2]).toBeCloseTo(0, 5);

          const npRecovered = cartesianToSpherical(np[0], np[1], np[2]);
          expect(npRecovered.radius).toBeCloseTo(r, 5);
          expect(npRecovered.phi).toBeCloseTo(0, 5);
          expect(Number.isFinite(npRecovered.theta)).toBe(true);

          // South pole: phi = Math.PI
          const sp = sphericalToCartesian(r, Math.PI, theta);
          expect(sp[0]).toBeCloseTo(0, 5);
          expect(sp[1]).toBeCloseTo(-r, 5);
          expect(sp[2]).toBeCloseTo(0, 5);

          const spRecovered = cartesianToSpherical(sp[0], sp[1], sp[2]);
          expect(spRecovered.radius).toBeCloseTo(r, 5);
          expect(spRecovered.phi).toBeCloseTo(Math.PI, 5);
          expect(Number.isFinite(spRecovered.theta)).toBe(true);
        }
      }
    });

    it('handles near-pole boundaries (phi = 1e-12, phi = PI - 1e-12) without underflow or NaN', () => {
      const epsilons = [1e-4, 1e-7, 1e-10, 1e-12];
      const r = 15.0;

      for (const eps of epsilons) {
        // Near north pole
        const np = sphericalToCartesian(r, eps, 0.5);
        expect(Number.isFinite(np[0])).toBe(true);
        expect(Number.isFinite(np[1])).toBe(true);
        expect(Number.isFinite(np[2])).toBe(true);
        expect(np[1]).toBeCloseTo(r, 5);

        const npSph = cartesianToSpherical(np[0], np[1], np[2]);
        expect(npSph.radius).toBeCloseTo(r, 5);
        expect(npSph.phi).toBeCloseTo(eps, 5);

        // Near south pole
        const sp = sphericalToCartesian(r, Math.PI - eps, 0.5);
        expect(Number.isFinite(sp[0])).toBe(true);
        expect(Number.isFinite(sp[1])).toBe(true);
        expect(Number.isFinite(sp[2])).toBe(true);
        expect(sp[1]).toBeCloseTo(-r, 5);

        const spSph = cartesianToSpherical(sp[0], sp[1], sp[2]);
        expect(spSph.radius).toBeCloseTo(r, 5);
        expect(spSph.phi).toBeCloseTo(Math.PI - eps, 5);
      }
    });

    it('evaluates zero radius without generating NaN or Infinity', () => {
      const zeroCart = sphericalToCartesian(0, 1.2, 0.8);
      expect(zeroCart[0]).toBe(0);
      expect(zeroCart[1]).toBe(0);
      expect(zeroCart[2]).toBe(0);

      const zeroSph = cartesianToSpherical(0, 0, 0);
      expect(zeroSph.radius).toBe(0);
      expect(zeroSph.phi).toBe(0);
      expect(zeroSph.theta).toBe(0);
      expect(Number.isNaN(zeroSph.phi)).toBe(false);
      expect(Number.isNaN(zeroSph.theta)).toBe(false);
    });

    it('handles LookAt collinear singularities without crashing', () => {
      // Singularity 1: Eye at North Pole looking down at origin with standard up [0, 1, 0]
      const eyeNorth = [0, 15, 0];
      const target = [0, 0, 0];
      const up = [0, 1, 0];
      const mNorth = createLookAtMatrix(eyeNorth, target, up);

      for (let i = 0; i < 16; i++) {
        expect(Number.isFinite(mNorth[i])).toBe(true);
        expect(Number.isNaN(mNorth[i])).toBe(false);
      }

      // Singularity 2: Eye at South Pole looking up at origin
      const eyeSouth = [0, -15, 0];
      const mSouth = createLookAtMatrix(eyeSouth, target, up);
      for (let i = 0; i < 16; i++) {
        expect(Number.isFinite(mSouth[i])).toBe(true);
        expect(Number.isNaN(mSouth[i])).toBe(false);
      }

      // Singularity 3: Zero-distance camera (eye === target)
      const mZeroDist = createLookAtMatrix([0, 0, 0], [0, 0, 0], [0, 1, 0]);
      for (let i = 0; i < 16; i++) {
        expect(Number.isFinite(mZeroDist[i])).toBe(true);
        expect(Number.isNaN(mZeroDist[i])).toBe(false);
      }
    });

    it('handles Vector3 normalization of degenerate zero vectors', () => {
      const vZero = new Vector3(0, 0, 0).normalize();
      expect(vZero.x).toBe(0);
      expect(vZero.y).toBe(0);
      expect(vZero.z).toBe(0);
      expect(Number.isNaN(vZero.x)).toBe(false);

      const vTiny = new Vector3(1e-15, 1e-15, 1e-15).normalize();
      expect(vTiny.x).toBe(0);
      expect(vTiny.y).toBe(0);
      expect(vTiny.z).toBe(0);
    });

    it('Matrix4 inversion handles singular degenerate matrices by falling back to identity', () => {
      const zeroMatrix = new Matrix4();
      zeroMatrix.elements.fill(0);

      zeroMatrix.invert();
      // Should fall back to identity matrix
      expect(zeroMatrix.elements[0]).toBe(1);
      expect(zeroMatrix.elements[5]).toBe(1);
      expect(zeroMatrix.elements[10]).toBe(1);
      expect(zeroMatrix.elements[15]).toBe(1);
      expect(zeroMatrix.elements[1]).toBe(0);
    });
  });

  // ==========================================================================
  // Domain 2: 10,000 Random Angle Coordinate Roundtrip Stress Test
  // ==========================================================================
  describe('Domain 2: 10,000 Random Angle Coordinate Roundtrips', () => {
    const rng = mulberry32(0x1337c0de);

    it('completes 10,000 spherical -> cartesian -> spherical roundtrips with sub-millimeter precision', () => {
      const N = 10000;
      let maxDeltaRadius = 0;
      let maxDeltaPhi = 0;
      let maxDeltaTheta = 0;

      for (let i = 0; i < N; i++) {
        // Radius between 0.1 and 1000.0
        const r = 0.1 + rng() * 999.9;
        // Phi strictly away from exact 0 and PI where theta is degenerate
        const phi = 0.001 + rng() * (Math.PI - 0.002);
        // Theta uniformly between -PI and PI
        const theta = -Math.PI + rng() * (2 * Math.PI);

        const cart = sphericalToCartesian(r, phi, theta);

        expect(Number.isFinite(cart[0])).toBe(true);
        expect(Number.isFinite(cart[1])).toBe(true);
        expect(Number.isFinite(cart[2])).toBe(true);

        const recovered = cartesianToSpherical(cart[0], cart[1], cart[2]);

        const deltaR = Math.abs(recovered.radius - r);
        const deltaPhi = Math.abs(recovered.phi - phi);

        // Circular angular difference for theta
        let deltaTheta = Math.abs(recovered.theta - theta);
        if (deltaTheta > Math.PI) {
          deltaTheta = Math.abs(deltaTheta - 2 * Math.PI);
        }

        if (deltaR > maxDeltaRadius) maxDeltaRadius = deltaR;
        if (deltaPhi > maxDeltaPhi) maxDeltaPhi = deltaPhi;
        if (deltaTheta > maxDeltaTheta) maxDeltaTheta = deltaTheta;

        expect(deltaR / r).toBeLessThan(1e-5);
        expect(deltaPhi).toBeLessThan(1e-5);
        expect(deltaTheta).toBeLessThan(1e-4);
      }

      expect(maxDeltaRadius).toBeLessThan(0.01);
      expect(maxDeltaPhi).toBeLessThan(1e-5);
      expect(maxDeltaTheta).toBeLessThan(1e-4);
    });

    it('completes 10,000 cartesian -> spherical -> cartesian roundtrips with < 1e-4 relative error', () => {
      const N = 10000;
      let maxRelError = 0;

      for (let i = 0; i < N; i++) {
        // Sample points across a 3D box [-500, 500]^3
        const x = (rng() * 2 - 1) * 500;
        const y = (rng() * 2 - 1) * 500;
        const z = (rng() * 2 - 1) * 500;

        const origLen = Math.hypot(x, y, z);
        if (origLen < 0.01) continue; // Skip near-zero singularity

        const sph = cartesianToSpherical(x, y, z);
        const recCart = sphericalToCartesian(sph.radius, sph.phi, sph.theta);

        const dist = Math.hypot(recCart[0] - x, recCart[1] - y, recCart[2] - z);
        const relError = dist / origLen;

        if (relError > maxRelError) maxRelError = relError;
        expect(relError).toBeLessThan(1e-5);
      }

      expect(maxRelError).toBeLessThan(1e-5);
    });
  });

  // ==========================================================================
  // Domain 3: Matrix Invertibility, LookAt Orthogonality & Projection Bounds
  // ==========================================================================
  describe('Domain 3: Linear Algebra, Invertibility & Projection Bounds', () => {
    const rng = mulberry32(0xdeadbeef);

    it('enforces LookAt orthonormality (basis norm = 1, mutual dot = 0, det = 1) across 1,000 random poses', () => {
      const N = 1000;

      for (let i = 0; i < N; i++) {
        // Sample eye on sphere r in [6, 50]
        const phi = 0.05 + rng() * (Math.PI - 0.1);
        const theta = (rng() * 2 - 1) * Math.PI;
        const r = 6.0 + rng() * 44.0;
        const eye = sphericalToCartesian(r, phi, theta);

        // Target near origin
        const target = [(rng() - 0.5) * 2, (rng() - 0.5) * 2, (rng() - 0.5) * 2];
        const up = [0, 1, 0];

        const m = createLookAtMatrix(eye, target, up);

        // Basis vectors are rows in column-major view matrix:
        // row 0: xAxis, row 1: yAxis, row 2: zAxis
        const x0 = m[0], x1 = m[4], x2 = m[8];
        const y0 = m[1], y1 = m[5], y2 = m[9];
        const z0 = m[2], z1 = m[6], z2 = m[10];

        const lenX = Math.hypot(x0, x1, x2);
        const lenY = Math.hypot(y0, y1, y2);
        const lenZ = Math.hypot(z0, z1, z2);

        expect(lenX).toBeCloseTo(1.0, 4);
        expect(lenY).toBeCloseTo(1.0, 4);
        expect(lenZ).toBeCloseTo(1.0, 4);

        // Mutual orthogonality (dot products must be 0)
        const dotXY = x0 * y0 + x1 * y1 + x2 * y2;
        const dotXZ = x0 * z0 + x1 * z1 + x2 * z2;
        const dotYZ = y0 * z0 + y1 * z1 + y2 * z2;

        expect(Math.abs(dotXY)).toBeLessThan(1e-4);
        expect(Math.abs(dotXZ)).toBeLessThan(1e-4);
        expect(Math.abs(dotYZ)).toBeLessThan(1e-4);

        // Right-handed basis cross product: X x Y = Z
        const crossZ0 = x1 * y2 - x2 * y1;
        const crossZ1 = x2 * y0 - x0 * y2;
        const crossZ2 = x0 * y1 - x1 * y0;

        expect(crossZ0).toBeCloseTo(z0, 4);
        expect(crossZ1).toBeCloseTo(z1, 4);
        expect(crossZ2).toBeCloseTo(z2, 4);
      }
    });

    it('guarantees matrix invertibility and roundtrip identity M * M^-1 = I for view matrices', () => {
      const N = 500;

      for (let i = 0; i < N; i++) {
        const eye = [
          (rng() * 2 - 1) * 30,
          1.0 + rng() * 20, // keep Y non-zero
          (rng() * 2 - 1) * 30,
        ];
        const target = [(rng() - 0.5) * 4, (rng() - 0.5) * 4, (rng() - 0.5) * 4];
        const up = [0, 1, 0];

        const m = new Matrix4();
        m.elements.set(createLookAtMatrix(eye, target, up));

        const mInv = m.clone().invert();
        const ident = new Matrix4().multiplyMatrices(m, mInv);

        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 4; col++) {
            const idx = row + col * 4;
            const expected = row === col ? 1.0 : 0.0;
            expect(ident.elements[idx]).toBeCloseTo(expected, 3);
          }
        }
      }
    });

    it('validates perspective projection near/far clipping bounds and screen projection', () => {
      const fovs = [30, 45, 60, 90];
      const aspects = [1.0, 16 / 9, 4 / 3, 21 / 9];
      const near = 0.1;
      const far = 1000.0;

      for (const fov of fovs) {
        for (const aspect of aspects) {
          const fovRad = (fov * Math.PI) / 180;
          const pMat = createPerspectiveMatrix(fovRad, aspect, near, far);
          const vMat = createLookAtMatrix([0, 0, 10], [0, 0, 0], [0, 1, 0]);

          // Point on near plane (z = 10 - 0.1 = 9.9)
          const nearPt = projectPoint([0, 0, 9.9], vMat, pMat, 1920, 1080);
          expect(nearPt.visible).toBe(true);
          expect(nearPt.z).toBeCloseTo(-1.0, 3);

          // Point well within far plane (z = 10 - 999.0 = -989.0, 99.9% of far distance)
          const farPt = projectPoint([0, 0, -989.0], vMat, pMat, 1920, 1080);
          expect(farPt.visible).toBe(true);
          expect(farPt.z).toBeCloseTo(1.0, 1);

          // Point at exact mathematical far plane boundary (z = 10 - 1000 = -990)
          // Documents Float32Array precision overshoot where z_ndc exceeds 1.0 by ~1.3e-8
          const exactFarPt = projectPoint([0, 0, -990.0], vMat, pMat, 1920, 1080);
          expect(exactFarPt.z).toBeCloseTo(1.0, 5);
          // With 1e-6 epsilon tolerance in projectPoint, single-precision float overshoot is accepted
          expect(exactFarPt.z).toBeGreaterThan(1.0);
          expect(exactFarPt.visible).toBe(true); // Verified: epsilon tolerance accepts boundary float overshoot

          // Point strictly behind camera (z = 15 > camera z = 10)
          const behindPt = projectPoint([0, 0, 15], vMat, pMat, 1920, 1080);
          expect(behindPt.visible).toBe(false);

          // Point strictly beyond far plane (z = -1005 < far z = -990)
          const beyondFarPt = projectPoint([0, 0, -1005], vMat, pMat, 1920, 1080);
          expect(beyondFarPt.visible).toBe(false);
        }
      }
    });

    it('unprojectScreenRay roundtrips screen corners back through camera projection without distortion', () => {
      const eye: [number, number, number] = [0, 0, 15];
      const target: [number, number, number] = [0, 0, 0];
      const up: [number, number, number] = [0, 1, 0];
      const view = createLookAtMatrix(eye, target, up);
      const proj = createPerspectiveMatrix((45 * Math.PI) / 180, 16 / 9, 0.1, 1000);

      const ndcCoords = [
        [0, 0],       // Center
        [-1, -1],     // Bottom-left
        [1, -1],      // Bottom-right
        [-1, 1],      // Top-left
        [1, 1],       // Top-right
        [0.5, -0.75], // Arbitrary internal
      ];

      for (const [ndcX, ndcY] of ndcCoords) {
        const ray = unprojectScreenRay(ndcX, ndcY, view, proj, eye);

        // Origin matches eye
        expect(ray.rayOrig[0]).toBeCloseTo(0, 5);
        expect(ray.rayOrig[1]).toBeCloseTo(0, 5);
        expect(ray.rayOrig[2]).toBeCloseTo(15, 5);

        // Ray direction is unit vector
        const dirLen = Math.hypot(ray.rayDir[0], ray.rayDir[1], ray.rayDir[2]);
        expect(dirLen).toBeCloseTo(1.0, 5);

        // Point along ray at distance d = 10 (which is in front of near plane and before far plane)
        const d = 10.0;
        const testWorldPt: [number, number, number] = [
          ray.rayOrig[0] + ray.rayDir[0] * d,
          ray.rayOrig[1] + ray.rayDir[1] * d,
          ray.rayOrig[2] + ray.rayDir[2] * d,
        ];

        // Project point to NDC (viewportWidth = 2, viewportHeight = 2 with center offset)
        // projectPoint returns screen pixels in [0, width], [0, height]
        const projected = projectPoint(testWorldPt, view, proj, 2, 2);
        // Convert screen (x in [0, 2], y in [0, 2]) back to NDC:
        // screenX = (ndcX + 1) * 0.5 * 2 = ndcX + 1 -> ndcX = screenX - 1
        // screenY = (1 - ndcY) * 0.5 * 2 = 1 - ndcY -> ndcY = 1 - screenY
        const recNdcX = projected.x - 1;
        const recNdcY = 1 - projected.y;

        expect(recNdcX).toBeCloseTo(ndcX, 3);
        expect(recNdcY).toBeCloseTo(ndcY, 3);
        expect(projected.visible).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Domain 4: Kinematic Damping & Exponential Decay Convergence
  // ==========================================================================
  describe('Domain 4: Inertial Momentum Damping Decay Convergence', () => {
    it('exponential velocity decay strictly converges to zero without NaN or divergence', () => {
      const controller = new NativeInertialCameraController({ dampingFactor: DEFAULT_DAMPING_FACTOR });
      expect(controller.dampingFactor).toBe(0.05);

      // Inject high velocities
      controller.velTheta = 5.0;
      controller.velPhi = -3.0;
      controller.velRadius = 10.0;
      controller.velPanX = 2.0;
      controller.velPanY = -1.5;

      let prevVelMag = Math.hypot(
        controller.velTheta,
        controller.velPhi,
        controller.velRadius,
        controller.velPanX,
        controller.velPanY
      );

      let steps = 0;
      const maxSteps = 500;

      while (controller.update(1 / 60) && steps < maxSteps) {
        steps++;
        const currentVelMag = Math.hypot(
          controller.velTheta,
          controller.velPhi,
          controller.velRadius,
          controller.velPanX,
          controller.velPanY
        );

        // Velocity magnitude must decrease monotonically
        expect(currentVelMag).toBeLessThanOrEqual(prevVelMag);
        expect(Number.isFinite(currentVelMag)).toBe(true);
        expect(Number.isNaN(currentVelMag)).toBe(false);

        prevVelMag = currentVelMag;
      }

      // Controller must reach complete rest (all velocities 0) within < 350 frames
      expect(steps).toBeLessThan(350);
      expect(controller.velTheta).toBe(0);
      expect(controller.velPhi).toBe(0);
      expect(controller.velRadius).toBe(0);
      expect(controller.velPanX).toBe(0);
      expect(controller.velPanY).toBe(0);
      expect(controller.update(1 / 60)).toBe(false);
    });

    it('survives extreme frame time variations (dt = 0, 1/240, 1/120, 1.0, 10.0s) without exploding', () => {
      const deltaTimes = [
        0,           // paused frame
        1 / 240,     // 240 FPS
        1 / 120,     // 120 FPS
        1 / 60,      // 60 FPS
        1 / 30,      // 30 FPS
        0.1,         // 100ms lag spike
        1.0,         // 1-second hitch
        10.0,        // 10-second tab suspension
      ];

      for (const dt of deltaTimes) {
        const controller = new NativeInertialCameraController({ dampingFactor: 0.05 });
        controller.velTheta = 1.0;
        controller.velPhi = 0.5;

        const moved = controller.update(dt);
        expect(Number.isFinite(controller.theta)).toBe(true);
        expect(Number.isFinite(controller.phi)).toBe(true);
        expect(Number.isFinite(controller.velTheta)).toBe(true);
        expect(Number.isFinite(controller.velPhi)).toBe(true);
        expect(Number.isNaN(controller.velTheta)).toBe(false);
        expect(Number.isNaN(controller.velPhi)).toBe(false);

        // Velocity must not increase
        expect(Math.abs(controller.velTheta)).toBeLessThanOrEqual(1.0);
        expect(Math.abs(controller.velPhi)).toBeLessThanOrEqual(0.5);
      }
    });

    it('enforces rigorous boundary clamping on phi and radius during extreme kinetic impulses', () => {
      const controller = new NativeInertialCameraController();

      // Huge negative impulse pushing phi towards negative infinity (past North Pole)
      controller.phi = 0.5;
      controller.velPhi = -100.0;
      controller.update(1 / 60);
      expect(controller.phi).toBe(0.001); // Clamped at 0.001

      // Huge positive impulse pushing phi towards infinity (past South Pole)
      controller.phi = 2.5;
      controller.velPhi = 100.0;
      controller.update(1 / 60);
      expect(controller.phi).toBe(Math.PI - 0.001); // Clamped at PI - 0.001

      // Huge negative zoom impulse pushing radius below minRadius
      controller.radius = 10.0;
      controller.velRadius = -100.0;
      controller.update(1 / 60);
      expect(controller.radius).toBe(controller.minRadius);

      // Huge positive zoom impulse pushing radius above maxRadius
      controller.radius = 40.0;
      controller.velRadius = 100.0;
      controller.update(1 / 60);
      expect(controller.radius).toBe(controller.maxRadius);
    });
  });

  // ==========================================================================
  // Domain 5: Slerp Spherical Interpolation Edge Cases
  // ==========================================================================
  describe('Domain 5: Slerp Spherical Interpolation Edge Cases', () => {
    it('handles identical and nearly identical vectors without division by zero', () => {
      const p1: [number, number, number] = [0, 1, 0];
      const p2: [number, number, number] = [0, 1, 0];

      const res = slerpVec3(p1, p2, 0.5);
      expect(res[0]).toBeCloseTo(0, 5);
      expect(res[1]).toBeCloseTo(1, 5);
      expect(res[2]).toBeCloseTo(0, 5);

      // Perturbation < 1e-7
      const pNear: [number, number, number] = [1e-8, 1, 0];
      const resNear = slerpVec3(p1, pNear, 0.3);
      expect(Number.isFinite(resNear[0])).toBe(true);
      expect(Number.isFinite(resNear[1])).toBe(true);
      expect(Number.isFinite(resNear[2])).toBe(true);
      expect(resNear[1]).toBeCloseTo(1, 4);
    });

    it('interpolates great circles across 90-degree orthogonal vectors with constant unit length', () => {
      const p1: [number, number, number] = [1, 0, 0];
      const p2: [number, number, number] = [0, 0, 1];

      for (let step = 0; step <= 10; step++) {
        const t = step / 10;
        const pt = slerpVec3(p1, p2, t);
        const len = Math.hypot(pt[0], pt[1], pt[2]);
        expect(len).toBeCloseTo(1.0, 5);

        // Expected angle is t * PI/2
        const expectedAngle = (t * Math.PI) / 2;
        expect(pt[0]).toBeCloseTo(Math.cos(expectedAngle), 4);
        expect(pt[2]).toBeCloseTo(Math.sin(expectedAngle), 4);
      }
    });

    it('documents antipodal slerp collapse: slerpVec3 midpoint between opposite poles collapses to [0, 0, 0]', () => {
      // Antipodal points on unit sphere
      const north: [number, number, number] = [0, 1, 0];
      const south: [number, number, number] = [0, -1, 0];

      // At t = 0.5, because sin(omega) = sin(PI) < 1e-6, code falls back to normalized lerp
      // lerp([0,1,0], [0,-1,0], 0.5) = [0,0,0], and normalize([0,0,0]) = [0,0,0]
      const midpoint = slerpVec3(north, south, 0.5);
      expect(midpoint[0]).toBe(0);
      expect(midpoint[1]).toBe(0);
      expect(midpoint[2]).toBe(0);
      // Length is 0 instead of 1.0 (singularity on antipodal great circles)
      expect(Math.hypot(midpoint[0], midpoint[1], midpoint[2])).toBe(0);
    });
  });

  // ==========================================================================
  // Domain 6: Damping Discrepancies & Collinear Orthogonality Edge Cases
  // ==========================================================================
  describe('Domain 6: Refresh Rate Sensitivity & LookAt Collinear Degeneracy', () => {
    it('quantifies 120Hz vs 60Hz kinetic glide acceleration due to Math.max(1, dt*60)', () => {
      // At 60 FPS, dt = 1/60 -> decay factor = (1 - 0.05)^1 = 0.95
      const c60 = new NativeInertialCameraController({ dampingFactor: 0.05 });
      c60.velTheta = 1.0;
      for (let i = 0; i < 60; i++) c60.update(1 / 60);

      // At 120 FPS, dt = 1/120 -> Math.max(1, 0.5) clamps exponent to 1.0 -> decay factor per frame is still 0.95
      // Over 120 frames (1 second elapsed), velocity drops by 0.95^120 instead of 0.95^60
      const c120 = new NativeInertialCameraController({ dampingFactor: 0.05 });
      c120.velTheta = 1.0;
      for (let i = 0; i < 120; i++) c120.update(1 / 120);

      // After 1 second: 60 FPS has ~0.046 rad/s, 120 FPS has ~0.0021 rad/s (~21x faster halt)
      expect(c60.velTheta).toBeCloseTo(0.0461, 3);
      expect(c120.velTheta).toBeCloseTo(0.00212, 4);
      expect(c120.velTheta / c60.velTheta).toBeCloseTo(0.0461, 3);
    });

    it('documents collinear X LookAt singularity: eye and target collinear with up along X yields singular matrix', () => {
      // eye = [10, 0, 0], target = [0, 0, 0], up = [1, 0, 0]
      const m = createLookAtMatrix([10, 0, 0], [0, 0, 0], [1, 0, 0]);

      // Row 1 (yAxis basis) becomes entirely zero due to cross product cancellation
      expect(m[1]).toBe(0);
      expect(m[5]).toBe(0);
      expect(m[9]).toBe(0);
      expect(Math.abs(m[13])).toBe(0);

      // Matrix4 invert on this degenerate matrix detects det === 0 and safely falls back to identity
      const mat = new Matrix4();
      mat.elements.set(m);
      mat.invert();
      expect(mat.elements[0]).toBe(1);
      expect(mat.elements[5]).toBe(1);
      expect(mat.elements[10]).toBe(1);
      expect(mat.elements[15]).toBe(1);
    });

    it('handles NaN and Infinity inputs gracefully across all vector and spherical operations', () => {
      // Vector3 normalize with NaN: length is NaN, len > 1e-12 is false -> falls back to [0, 0, 0]
      const vNaN = new Vector3(NaN, 0, 0).normalize();
      expect(vNaN.x).toBe(0);
      expect(vNaN.y).toBe(0);
      expect(vNaN.z).toBe(0);

      // Vector3 normalize with Infinity: length is Infinity, 1/len is 0, Infinity * 0 yields NaN
      const vInf = new Vector3(Infinity, 0, 0).normalize();
      expect(Number.isNaN(vInf.x)).toBe(true);

      // sphericalToCartesian with NaN radius yields NaN coordinates
      const cartNaN = sphericalToCartesian(NaN, 1.0, 1.0);
      expect(Number.isNaN(cartNaN[0])).toBe(true);

      // cartesianToSpherical with NaN coordinates: propagates NaN across radius, phi, theta
      const sphNaN = cartesianToSpherical(NaN, 0, 0);
      expect(Number.isNaN(sphNaN.radius)).toBe(true);
      expect(Number.isNaN(sphNaN.phi)).toBe(true);
      expect(Number.isNaN(sphNaN.theta)).toBe(true);
    });
  });
});
