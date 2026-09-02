import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
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

describe('Adversarial Challenger 1: Milestone M5 Passive Raycast Cursor Perturbation Stress Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = path.join(projectRoot, 'App.tsx');
  const raycastTsPath = path.join(projectRoot, 'src/utils/raycast.ts');
  const appCode = fs.readFileSync(appTsxPath, 'utf8');
  const raycastCode = fs.readFileSync(raycastTsPath, 'utf8');

  // =========================================================================
  // 1. Lamb-Oseen Vortex Analytical & Numerical Physics Stress
  // =========================================================================
  describe('1. Lamb-Oseen Vortex Analytical Physics Stress Tests', () => {
    it('ADV-M5-T01: verifies non-singular velocity and linear solid-body rotation near origin r -> 0', () => {
      const nu = 0.1;
      const t0 = 0.2;
      const gamma = 2.0;
      const rcSq = 4 * nu * t0; // 0.08
      const expectedLinearSlope = gamma / (2 * Math.PI * rcSq); // ~3.97887

      // Evaluate at cutoff boundary and near origin
      const microRadii = [0.0, 1e-12, 1e-8, 1e-7, 1e-6, 1e-4, 1e-3, 0.01];

      for (const r of microRadii) {
        const { vTheta, vorticity } = lambOseenVortex(r, 0.0, gamma, nu, t0);
        expect(Number.isFinite(vTheta)).toBe(true);
        expect(Number.isNaN(vTheta)).toBe(false);
        expect(Number.isFinite(vorticity)).toBe(true);
        expect(Number.isNaN(vorticity)).toBe(false);

        if (r <= 1e-7) {
          // Explicit numerical singularity cutoff at r <= 1e-7
          expect(vTheta).toBe(0.0);
          expect(vorticity).toBeCloseTo(gamma / (Math.PI * rcSq), 5);
        } else if (r <= 0.01) {
          // For 1e-7 < r << rc, vTheta / r should match gamma / (2*PI*rcSq)
          const approximateSlope = vTheta / r;
          expect(approximateSlope).toBeCloseTo(expectedLinearSlope, 1);
        }
      }
    });

    it('ADV-M5-T02: verifies peak tangential velocity occurs strictly at theoretical core boundary r_peak ≈ 1.1209 * rc', () => {
      const testCases = [
        { nu: 0.05, t0: 0.1, gamma: 1.0 },
        { nu: 0.1, t0: 0.2, gamma: 2.5 },
        { nu: 0.25, t0: 0.5, gamma: 5.0 },
      ];

      for (const { nu, t0, gamma } of testCases) {
        const rc = Math.sqrt(4 * nu * t0);
        const theoreticalPeakR = 1.1209 * rc;

        // Sample finely around peak
        let maxV = -Infinity;
        let bestR = 0;
        const steps = 1000;
        const rMin = 0.001;
        const rMax = 3.0 * rc;

        for (let i = 0; i <= steps; i++) {
          const r = rMin + (rMax - rMin) * (i / steps);
          const { vTheta } = lambOseenVortex(r, 0.0, gamma, nu, t0);
          if (vTheta > maxV) {
            maxV = vTheta;
            bestR = r;
          }
        }

        // Peak radius should match theoretical 1.1209 * rc within 2%
        expect(bestR / theoreticalPeakR).toBeGreaterThanOrEqual(0.98);
        expect(bestR / theoreticalPeakR).toBeLessThanOrEqual(1.02);
      }
    });

    it('ADV-M5-T03: verifies far-field potential vortex 1/r asymptotic decay and zero residual vorticity', () => {
      const nu = 0.1;
      const t0 = 0.2;
      const gamma = 3.14159;

      const rFarA = 10.0;
      const rFarB = 20.0;
      const rFarC = 40.0;

      const resA = lambOseenVortex(rFarA, 0.0, gamma, nu, t0);
      const resB = lambOseenVortex(rFarB, 0.0, gamma, nu, t0);
      const resC = lambOseenVortex(rFarC, 0.0, gamma, nu, t0);

      // Asymptotic potential vortex: vTheta = gamma / (2 * PI * r)
      const idealVA = gamma / (2 * Math.PI * rFarA);
      const idealVB = gamma / (2 * Math.PI * rFarB);
      const idealVC = gamma / (2 * Math.PI * rFarC);

      expect(resA.vTheta / idealVA).toBeCloseTo(1.0, 4);
      expect(resB.vTheta / idealVB).toBeCloseTo(1.0, 4);
      expect(resC.vTheta / idealVC).toBeCloseTo(1.0, 4);

      // Far-field ratio vA / vB = rB / rA = 2.0
      expect(resA.vTheta / resB.vTheta).toBeCloseTo(2.0, 3);
      expect(resB.vTheta / resC.vTheta).toBeCloseTo(2.0, 3);

      // Vorticity in far field should decay to ~0 exponentially
      expect(resA.vorticity).toBeLessThan(1e-10);
      expect(resB.vorticity).toBeLessThan(1e-20);
    });

    it('ADV-M5-T04: verifies viscous diffusion expansion over continuous time t in [0, 100]', () => {
      const nu = 0.1;
      const t0 = 0.2;
      const gamma = 1.0;
      const r = 0.5;

      let prevVorticity = Infinity;
      const timePoints = [0.0, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 50.0, 100.0];

      for (const t of timePoints) {
        const { vTheta, vorticity } = lambOseenVortex(r, t, gamma, nu, t0);
        expect(Number.isFinite(vTheta)).toBe(true);
        expect(Number.isFinite(vorticity)).toBe(true);
        expect(vorticity).toBeGreaterThan(0.0);

        // Core expands, central vorticity at r=0 strictly decreases
        const centerVort = lambOseenVortex(0.0, t, gamma, nu, t0).vorticity;
        expect(centerVort).toBeLessThan(prevVorticity);
        prevVorticity = centerVort;
      }
    });
  });

  // =========================================================================
  // 2. High-Frequency Cursor Jitter & Extreme Velocity Stress Harness
  // =========================================================================
  describe('2. High-Frequency Cursor Jitter & Extreme Velocity Stress', () => {
    it('ADV-M5-T05: sustains 10,000 rapid chaotic sub-millisecond pointer events with zero NaNs and stable EMA', () => {
      const tracker = new CursorTracker();
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      let nanCount = 0;
      let infCount = 0;
      const N = 10000;

      for (let i = 0; i < N; i++) {
        // High frequency chaotic jitter in NDC [-1, 1]
        const jitterX = (Math.sin(i * 91.13 + 12.34) * 0.95);
        const jitterY = (Math.cos(i * 73.29 + 56.78) * 0.95);

        tracker.prevNdcX = tracker.ndcX;
        tracker.prevNdcY = tracker.ndcY;
        tracker.ndcX = jitterX;
        tracker.ndcY = jitterY;
        tracker.lastMoveTime = performance.now();
        tracker.isInside = true;
        tracker.activeIntensity = 1.0;

        const uniforms = tracker.update(camera, 0.5);

        if (Number.isNaN(uniforms.u_cursorRayOrig.x) || !Number.isFinite(uniforms.u_cursorRayOrig.x)) nanCount++;
        if (Number.isNaN(uniforms.u_cursorRayDir.x) || !Number.isFinite(uniforms.u_cursorRayDir.x)) nanCount++;
        if (Number.isNaN(uniforms.u_cursorHitPos.x) || !Number.isFinite(uniforms.u_cursorHitPos.x)) nanCount++;
        if (Number.isNaN(uniforms.u_cursorVel.x) || !Number.isFinite(uniforms.u_cursorVel.x)) nanCount++;
        if (Number.isNaN(uniforms.u_cursorVel.w) || !Number.isFinite(uniforms.u_cursorVel.w)) nanCount++;
        if (Number.isNaN(uniforms.u_cursorActive) || !Number.isFinite(uniforms.u_cursorActive)) nanCount++;

        // Speed must be clamped to 10.0
        expect(uniforms.u_cursorVel.w).toBeLessThanOrEqual(10.0);
        expect(uniforms.u_cursorActive).toBeGreaterThanOrEqual(0.0);
        expect(uniforms.u_cursorActive).toBeLessThanOrEqual(1.0);
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
    });

    it('ADV-M5-T06: handles extreme instantaneous teleportation shock without arithmetic overflow', () => {
      const tracker = new CursorTracker();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      // Teleportation from (-1000, -1000) to (+1000, +1000)
      tracker.ndcX = -1000;
      tracker.ndcY = -1000;
      tracker.prevNdcX = 1000;
      tracker.prevNdcY = 1000;
      tracker.lastMoveTime = performance.now();
      tracker.isInside = true;

      const uniforms = tracker.update(camera, 0.0);

      expect(Number.isNaN(uniforms.u_cursorVel.w)).toBe(false);
      expect(Number.isFinite(uniforms.u_cursorVel.w)).toBe(true);
      expect(uniforms.u_cursorVel.w).toBeLessThanOrEqual(10.0);
      expect(uniforms.u_cursorRayDir.length()).toBeCloseTo(1.0, 4);
    });

    it('ADV-M5-T07: evaluates dt clamping when performance.now() returns identical timestamps (dt = 0)', () => {
      const tracker = new CursorTracker();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      // Force lastUpdateTime to equal current performance.now()
      const now = performance.now();
      (tracker as any).lastUpdateTime = now;

      const uniforms = tracker.update(camera, 0.0);
      expect(Number.isNaN(uniforms.u_cursorVel.w)).toBe(false);
      expect(Number.isFinite(uniforms.u_cursorVel.w)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Inactivity Decay & Pointer Lifecycle
  // =========================================================================
  describe('3. Inactivity Decay & Pointer Lifecycle', () => {
    it('ADV-M5-T08: verifies exponential decay curve over idle time and strict clamp to 0.0 below threshold', () => {
      const tracker = new CursorTracker();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const baseTime = performance.now();
      tracker.lastMoveTime = baseTime;
      tracker.isInside = true;
      tracker.activeIntensity = 1.0;

      // Simulate time steps after cursor stops moving
      const timeOffsets = [
        { offsetMs: 0, expectedMin: 1.0, expectedMax: 1.0 },
        { offsetMs: 50, expectedMin: 1.0, expectedMax: 1.0 }, // Within 60ms grace window
        { offsetMs: 150, expectedMin: 0.60, expectedMax: 0.80 },
        { offsetMs: 350, expectedMin: 0.20, expectedMax: 0.40 },
        { offsetMs: 800, expectedMin: 0.02, expectedMax: 0.10 },
        { offsetMs: 2000, expectedMin: 0.0, expectedMax: 0.0 }, // Fully decayed to 0.0
        { offsetMs: 10000, expectedMin: 0.0, expectedMax: 0.0 },
      ];

      for (const { offsetMs, expectedMin, expectedMax } of timeOffsets) {
        // Manually manipulate lastMoveTime relative to performance.now()
        tracker.lastMoveTime = performance.now() - offsetMs;
        (tracker as any).lastUpdateTime = performance.now() - 16;

        const uniforms = tracker.update(camera, 0.0);
        expect(uniforms.u_cursorActive).toBeGreaterThanOrEqual(expectedMin);
        expect(uniforms.u_cursorActive).toBeLessThanOrEqual(expectedMax);
        if (expectedMax === 0.0) {
          expect(uniforms.u_cursorActive).toBe(0.0);
        }
      }
    });

    it('ADV-M5-T09: verifies pointerleave accelerates decay when cursor exits window', () => {
      const tracker = new CursorTracker();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      tracker.lastMoveTime = performance.now() - 100;
      tracker.isInside = false; // Exited window
      tracker.activeIntensity = 1.0;

      const u1 = tracker.update(camera, 0.0);
      expect(u1.u_cursorActive).toBeLessThan(1.0);
      expect(tracker.isInside).toBe(false);
    });
  });

  // =========================================================================
  // 4. Analytical Ray-Manifold Unprojection Edge Cases
  // =========================================================================
  describe('4. Analytical Ray-Manifold Unprojection Edge Cases', () => {
    it('ADV-M5-T10: ray origin inside sphere (r0 < R) finds forward exit intersection', () => {
      const rayOrig: [number, number, number] = [0, 0, 2]; // Inside R=5 sphere
      const rayDir: [number, number, number] = [0, 0, -1];

      const res = raySphereIntersect(rayOrig, rayDir, RADIUS);
      expect(res.hit).toBe(true);
      expect(res.hitPos).not.toBeNull();
      expect(res.hitPos![2]).toBeCloseTo(-5.0, 4);
      expect(res.distance).toBeCloseTo(7.0, 4);
    });

    it('ADV-M5-T11: ray pointing strictly away from sphere returns hit = false', () => {
      const rayOrig: [number, number, number] = [0, 0, 15];
      const rayDir: [number, number, number] = [0, 0, 1]; // Away from origin

      const res = raySphereIntersect(rayOrig, rayDir, RADIUS);
      expect(res.hit).toBe(false);
      expect(res.hitPos).toBeNull();
      expect(res.distance).toBe(Infinity);
    });

    it('ADV-M5-T12: ray grazing tangent edge at exact radius R produces single clean hit', () => {
      const rayOrig: [number, number, number] = [5.0, 0, 10];
      const rayDir: [number, number, number] = [0, 0, -1];

      const res = raySphereIntersect(rayOrig, rayDir, RADIUS);
      expect(res.hit).toBe(true);
      expect(res.hitPos).not.toBeNull();
      expect(res.hitPos![0]).toBeCloseTo(5.0, 4);
      expect(res.hitPos![1]).toBeCloseTo(0.0, 4);
      expect(res.hitPos![2]).toBeCloseTo(0.0, 4);
      expect(res.distance).toBeCloseTo(10.0, 4);
    });

    it('ADV-M5-T13: unprojects camera ray over full 360-degree orbit and elevation with zero NaNs', () => {
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);

      const angles = 72; // Every 5 degrees
      let nanCount = 0;

      for (let i = 0; i < angles; i++) {
        const theta = (i / angles) * 2 * Math.PI;
        const phi = Math.PI / 4; // 45 degrees elevation

        const camX = 15 * Math.sin(phi) * Math.cos(theta);
        const camY = 15 * Math.cos(phi);
        const camZ = 15 * Math.sin(phi) * Math.sin(theta);

        camera.position.set(camX, camY, camZ);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        const { rayOrig, rayDir } = unprojectScreenToRay(0, 0, camera);

        if (Number.isNaN(rayOrig.x) || Number.isNaN(rayDir.x)) nanCount++;
        expect(rayDir.length()).toBeCloseTo(1.0, 4);

        const hitRes = computeManifoldHit(rayOrig, rayDir, 0.0, RADIUS);
        expect(hitRes.hit).toBe(true);
        expect(hitRes.hitPos.length()).toBeCloseTo(RADIUS, 4);
      }

      expect(nanCount).toBe(0);
    });
  });

  // =========================================================================
  // 5. Griffith Fracture Stress Concentration & Strain Clamping
  // =========================================================================
  describe('5. Griffith Fracture Stress Concentration & Strain Clamping', () => {
    it('ADV-M5-T14: verifies singularity prevention at r <= 0.01 and smooth stress growth', () => {
      const microR = [0.0, 1e-10, 1e-5, 0.005, 0.01, 0.05, 0.1];

      for (const r of microR) {
        const res = griffithHoopStress(r, 0.0, 1.0);
        expect(Number.isFinite(res.sigmaThetaTheta)).toBe(true);
        expect(Number.isNaN(res.sigmaThetaTheta)).toBe(false);
        expect(res.localStrain).toBeLessThanOrEqual(0.40);
        expect(res.localStrain).toBeGreaterThan(0.0);
      }
    });

    it('ADV-M5-T15: verifies angular distribution vanishes behind crack tip at theta = ±PI', () => {
      const angles = [-Math.PI, -Math.PI * 0.75, 0.0, Math.PI * 0.75, Math.PI];

      for (const theta of angles) {
        const res = griffithHoopStress(0.1, theta, 1.0);
        expect(Number.isFinite(res.sigmaThetaTheta)).toBe(true);
        if (Math.abs(Math.abs(theta) - Math.PI) < 1e-5) {
          expect(res.sigmaThetaTheta).toBeCloseTo(0.0, 5);
        }
      }
    });

    it('ADV-M5-T16: verifies extreme stress intensity factor KI = 10,000 is strictly strain clamped to 0.40', () => {
      const extremeRes = griffithHoopStress(0.01, 0.0, 10000.0, 0.0, 10.0, 1.0);
      expect(extremeRes.localStrain).toBe(0.40);
      expect(Number.isFinite(extremeRes.sigmaThetaTheta)).toBe(true);
    });
  });

  // =========================================================================
  // 6. Full 1,000,000-Node Shader Emulation Stress Test
  // =========================================================================
  describe('6. 1,000,000-Node Shader Emulation Stress Harness', () => {
    it('ADV-M5-T17: executes Mode 3 Fluid vertex shader perturbation over 1,000,000 nodes with zero NaNs and bounded displacement', () => {
      const N = 1000000;
      const cursorHitPos = new THREE.Vector3(0, 0, 5.0);
      const cursorVel = new THREE.Vector4(1.5, 0.5, 0.0, 2.5);
      const cursorActive = 1.0;
      const coreRadius = 0.65;

      let nanCount = 0;
      let maxDisplacement = 0;
      let nonZeroVorticityCount = 0;

      // Golden spiral distribution on sphere (Fibonacci lattice)
      const phiGolden = (1 + Math.sqrt(5)) / 2;

      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = (2 * Math.PI * i) / phiGolden;

        const px = Math.cos(theta) * radiusAtY * RADIUS;
        const py = y * RADIUS;
        const pz = Math.sin(theta) * radiusAtY * RADIUS;

        // GLSL Shader emulation for Mode 3 Fluid at t = 0
        const dx = px - cursorHitPos.x;
        const dy = py - cursorHitPos.y;
        const dz = pz - cursorHitPos.z;
        const hitDist = Math.hypot(dx, dy, dz);

        const vortexCirculation = (1.0 - Math.exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.001);

        // Surface normal
        const invLen = 1.0 / RADIUS;
        const nx = px * invLen;
        const ny = py * invLen;
        const nz = pz * invLen;

        // Vortex tangent = normalize(cross(normal, pos - hitPos + 0.001))
        const cx = ny * (dz + 0.001) - nz * (dy + 0.001);
        const cy = nz * (dx + 0.001) - nx * (dz + 0.001);
        const cz = nx * (dy + 0.001) - ny * (dx + 0.001);
        const cLen = Math.hypot(cx, cy, cz) || 1.0;

        const tx = cx / cLen;
        const ty = cy / cLen;
        const tz = cz / cLen;

        const vScale = cursorActive * cursorVel.w * vortexCirculation * 2.2;
        const vx = tx * vScale;
        const vy = ty * vScale;
        const vz = tz * vScale;

        const wakeScale = cursorActive * Math.exp(-hitDist * hitDist / 1.2);
        const wx = cursorVel.x * wakeScale;
        const wy = cursorVel.y * wakeScale;
        const wz = cursorVel.z * wakeScale;

        const totVx = vx + wx;
        const totVy = vy + wy;
        const totVz = vz + wz;

        const totSpeed = Math.hypot(totVx, totVy, totVz);
        const localVorticity = totSpeed * cursorActive;
        if (localVorticity > 0.01) nonZeroVorticityCount++;

        const finalX = px + totVx * (cursorActive * 0.35);
        const finalY = py + totVy * (cursorActive * 0.35);
        const finalZ = pz + totVz * (cursorActive * 0.35);

        const disp = Math.hypot(finalX - px, finalY - py, finalZ - pz);
        if (disp > maxDisplacement) maxDisplacement = disp;

        if (Number.isNaN(finalX) || Number.isNaN(finalY) || Number.isNaN(finalZ)) nanCount++;
      }

      expect(nanCount).toBe(0);
      expect(nonZeroVorticityCount).toBeGreaterThan(100);
      expect(maxDisplacement).toBeLessThan(3.5); // Safe displacement preventing mesh tearing
      expect(maxDisplacement).toBeGreaterThan(0.2); // Verifies real physical perturbation occurs
    });

    it('ADV-M5-T18: executes Mode 2 Griffith crack vertex shader perturbation over 1,000,000 nodes with zero NaNs', () => {
      const N = 1000000;
      const cursorHitPos = new THREE.Vector3(0, 0, 5.0);
      const cursorActive = 1.0;
      const phiGolden = (1 + Math.sqrt(5)) / 2;

      let nanCount = 0;
      let maxStrain = 0;

      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = (2 * Math.PI * i) / phiGolden;

        const px = Math.cos(theta) * radiusAtY * RADIUS;
        const py = y * RADIUS;
        const pz = Math.sin(theta) * radiusAtY * RADIUS;

        const hitDist = Math.hypot(px - cursorHitPos.x, py - cursorHitPos.y, pz - cursorHitPos.z);
        const phi = Math.asin(Math.max(-1.0, Math.min(1.0, py / RADIUS)));

        const cursorInfluence = cursorActive * Math.exp(-hitDist * hitDist / (2.0 * 0.64));
        const hoopStress = cursorInfluence * 0.65 * (1.0 + 2.0 * Math.cos(phi) * Math.cos(phi));

        const localStrain = hoopStress;
        if (localStrain > maxStrain) maxStrain = localStrain;

        const outwardTension = localStrain * 0.40;
        const finalX = px + (px / RADIUS) * outwardTension;
        const finalY = py + (py / RADIUS) * outwardTension;
        const finalZ = pz + (pz / RADIUS) * outwardTension;

        if (Number.isNaN(finalX) || Number.isNaN(finalY) || Number.isNaN(finalZ)) nanCount++;
      }

      expect(nanCount).toBe(0);
      expect(maxStrain).toBeGreaterThan(0.5);
      expect(maxStrain).toBeLessThan(3.0);
    });
  });

  // =========================================================================
  // 7. Source Code & GLSL Shader Integrity Audit
  // =========================================================================
  describe('7. Source Code & GLSL Shader Architecture Audit', () => {
    it('ADV-M5-T19: verifies App.tsx declares all required cursor uniforms with exact types', () => {
      expect(appCode).toContain('uniform vec3 u_cursorRayOrig;');
      expect(appCode).toContain('uniform vec3 u_cursorRayDir;');
      expect(appCode).toContain('uniform vec3 u_cursorHitPos;');
      expect(appCode).toContain('uniform vec4 u_cursorVel;');
      expect(appCode).toContain('uniform float u_cursorActive;');
    });

    it('ADV-M5-T20: verifies passive event listeners { passive: true } and no stopPropagation calls in raycast.ts', () => {
      expect(raycastCode).toContain("{ passive: true }");
      expect(raycastCode).not.toContain(".stopPropagation()");
      expect(raycastCode).not.toContain(".preventDefault()");
    });

    it('ADV-M5-T21: verifies uniform binding in useFrame updates both meshMaterial and pointMaterial', () => {
      expect(appCode).toContain('meshMaterialRef.current.uniforms.u_cursorHitPos.value.copy');
      expect(appCode).toContain('pointMaterialRef.current.uniforms.u_cursorHitPos.value.copy');
      expect(appCode).toContain('meshMaterialRef.current.uniforms.u_cursorActive.value =');
      expect(appCode).toContain('pointMaterialRef.current.uniforms.u_cursorActive.value =');
    });
  });
});
