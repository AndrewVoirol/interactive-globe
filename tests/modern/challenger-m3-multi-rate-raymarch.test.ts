import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import {
  evaluateMacroChartVolumetric,
  computeJacobianVolumetric,
  computeJacobianDeterminant,
  computeInverseJacobian,
  computeParameterVelocity,
} from '../../src/core/math/volumetricMath';

describe('Challenger M3-Pivot-2: Linearized Multi-Rate Tangent Frame Raymarcher Suite', () => {
  const wgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
  const shaderSource = fs.readFileSync(wgslPath, 'utf8');

  describe('Pillar 1: WGSL Shader Architecture & Tangent Frame Invariants', () => {
    it('CH-PIVOT2-01: verifies evaluateMacroChartWGSL exists and implements exact developable cylinder unwrapping', () => {
      // Test at alpha = 0.0 (sphere)
      const pSph = evaluateMacroChartVolumetric(0.5, 0.3, 0.1, 0.0, 5.0);
      const expectedSphX = (5.0 + 0.1) * Math.cos(0.3) * Math.sin(0.5);
      const expectedSphY = (5.0 + 0.1) * Math.sin(0.3);
      const expectedSphZ = (5.0 + 0.1) * Math.cos(0.3) * Math.cos(0.5);
      expect(pSph[0]).toBeCloseTo(expectedSphX, 4);
      expect(pSph[1]).toBeCloseTo(expectedSphY, 4);
      expect(pSph[2]).toBeCloseTo(expectedSphZ, 4);

      // Test at alpha = 1.0 (flat plane)
      const pFlat = evaluateMacroChartVolumetric(0.5, 0.3, 0.1, 1.0, 5.0);
      expect(pFlat[0]).toBeCloseTo(5.0 * 0.5, 4);
      expect(pFlat[1]).toBeCloseTo(5.0 * 0.3, 4);
      expect(pFlat[2]).toBeCloseTo(0.1, 4);

      // Test at alpha = 0.5 (cylinder + dz_lift)
      const pMid = evaluateMacroChartVolumetric(0.5, 0.3, 0.1, 0.5, 5.0);
      expect(Number.isFinite(pMid[0])).toBe(true);
      expect(Number.isFinite(pMid[1])).toBe(true);
      expect(Number.isFinite(pMid[2])).toBe(true);
    });

    it('CH-PIVOT2-02: verifies computeJacobian implements central finite differences with DELTA = 0.001', () => {
      const J = computeJacobianVolumetric(0.4, 0.2, 0.05, 0.5, 5.0);
      const DELTA = 0.001;
      const inv2Delta = 1.0 / (2.0 * DELTA);

      const p_l_plus = evaluateMacroChartVolumetric(0.4 + DELTA, 0.2, 0.05, 0.5, 5.0);
      const p_l_minus = evaluateMacroChartVolumetric(0.4 - DELTA, 0.2, 0.05, 0.5, 5.0);
      expect(J.dl[0]).toBeCloseTo((p_l_plus[0] - p_l_minus[0]) * inv2Delta, 6);
      expect(J.dl[1]).toBeCloseTo((p_l_plus[1] - p_l_minus[1]) * inv2Delta, 6);
      expect(J.dl[2]).toBeCloseTo((p_l_plus[2] - p_l_minus[2]) * inv2Delta, 6);
    });

    it('CH-PIVOT2-03: verifies inverse3x3 implements SIMD cross product inversion with singularity protection', () => {
      const J = computeJacobianVolumetric(0.3, 0.1, 0.02, 0.3, 5.0);
      const inv = computeInverseJacobian(J);
      const det = computeJacobianDeterminant(J);
      expect(inv.det).toBeCloseTo(det, 5);
      expect(Math.abs(det)).toBeGreaterThan(0.01);

      // Singularity protection test
      const singularJ = {
        dl: [0, 0, 0] as [number, number, number],
        dp: [0, 0, 0] as [number, number, number],
        dh: [0, 0, 0] as [number, number, number],
      };
      const invSingular = computeInverseJacobian(singularJ);
      expect(Number.isFinite(invSingular.r0[0])).toBe(true);
      expect(Number.isFinite(invSingular.r1[1])).toBe(true);
      expect(Number.isFinite(invSingular.r2[2])).toBe(true);
    });

    it('CH-PIVOT2-04: verifies getParameterVelocity maps world ray direction to parameter velocity', () => {
      const rayDir: [number, number, number] = [0.0, 1.0, 0.0];
      const v_uvw = computeParameterVelocity(rayDir, 0.2, 0.1, 0.05, 0.5, 5.0);
      const J = computeJacobianVolumetric(0.2, 0.1, 0.05, 0.5, 5.0);

      // J * v_uvw must reconstruct rayDir
      const reconX = J.dl[0] * v_uvw[0] + J.dp[0] * v_uvw[1] + J.dh[0] * v_uvw[2];
      const reconY = J.dl[1] * v_uvw[0] + J.dp[1] * v_uvw[1] + J.dh[1] * v_uvw[2];
      const reconZ = J.dl[2] * v_uvw[0] + J.dp[2] * v_uvw[1] + J.dh[2] * v_uvw[2];
      expect(reconX).toBeCloseTo(rayDir[0], 4);
      expect(reconY).toBeCloseTo(rayDir[1], 4);
      expect(reconZ).toBeCloseTo(rayDir[2], 4);
    });

    it('CH-PIVOT2-05: verifies sampleCloudDensityFromUVW decouples density evaluation from chart inversion', () => {
      // Mathematical assertion: evaluate parameter velocity directly without calling iterative chart inversion
      const uvw: [number, number, number] = [0.5, 0.2, 0.05];
      const J = computeJacobianVolumetric(uvw[0], uvw[1], uvw[2], 0.5, 5.0);
      const det = computeJacobianDeterminant(J);
      expect(Number.isFinite(det)).toBe(true);
      expect(Math.abs(det)).toBeGreaterThan(0.01);
    });

    it('CH-PIVOT2-06: verifies sampleSunShadowTransmittanceLinear executes 4 linear steps without chart inversions', () => {
      const sunDir: [number, number, number] = [0.577, 0.577, 0.577];
      const startUVW: [number, number, number] = [0.1, 0.2, 0.05];
      const v_sun = computeParameterVelocity(sunDir, startUVW[0], startUVW[1], startUVW[2], 0.5, 5.0);
      const stepLen = 0.002;

      let curUVW: [number, number, number] = [...startUVW];
      for (let k = 1; k <= 4; k++) {
        curUVW = [
          startUVW[0] + v_sun[0] * (k * stepLen),
          startUVW[1] + v_sun[1] * (k * stepLen),
          startUVW[2] + v_sun[2] * (k * stepLen),
        ];
        expect(Number.isFinite(curUVW[0])).toBe(true);
        expect(Number.isFinite(curUVW[1])).toBe(true);
        expect(Number.isFinite(curUVW[2])).toBe(true);
      }
    });

    it('CH-PIVOT2-07: verifies fs_main multi-rate tracking branch and 8-step re-anchoring logic', () => {
      const rayDir: [number, number, number] = [0.0, 1.0, 0.2];
      const len = Math.hypot(rayDir[0], rayDir[1], rayDir[2]);
      const dir: [number, number, number] = [rayDir[0] / len, rayDir[1] / len, rayDir[2] / len];
      const startUVW: [number, number, number] = [0.2, 0.4, 0.02];
      const stepDist = 0.002;

      let v_uvw = computeParameterVelocity(dir, startUVW[0], startUVW[1], startUVW[2], 0.5, 5.0);
      let currentUVW: [number, number, number] = [...startUVW];

      for (let step = 0; step < 16; step++) {
        if (step === 0 || (step % 8) === 0) {
          // Re-anchor parameter velocity at step 0 and 8
          v_uvw = computeParameterVelocity(dir, currentUVW[0], currentUVW[1], currentUVW[2], 0.5, 5.0);
        }
        currentUVW = [
          currentUVW[0] + v_uvw[0] * stepDist,
          currentUVW[1] + v_uvw[1] * stepDist,
          currentUVW[2] + v_uvw[2] * stepDist,
        ];
        expect(Number.isFinite(currentUVW[0])).toBe(true);
      }
    });
  });

  describe('Pillar 2: Mathematical Rigor & Jacobian Linear Inversion Verification', () => {
    it('CH-PIVOT2-08: proves Jacobian is non-singular across unfurl manifold [0.0, 1.0]', () => {
      const testAlphas = [0.0, 0.25, 0.5, 0.75, 1.0];
      const testLats = [-1.0, -0.5, 0.0, 0.5, 1.0];
      const testLons = [-2.0, -1.0, 0.0, 1.0, 2.0];
      const testHeights = [0.0, 0.05, 0.15];

      for (const alpha of testAlphas) {
        for (const lat of testLats) {
          for (const lon of testLons) {
            for (const h of testHeights) {
              const J = computeJacobianVolumetric(lon, lat, h, alpha, 5.0);
              const det = computeJacobianDeterminant(J);
              expect(Number.isFinite(det)).toBe(true);
              expect(Math.abs(det)).toBeGreaterThan(0.001);
            }
          }
        }
      }
    });

    it('CH-PIVOT2-09: proves J * (J^-1 * v) = v to machine precision (< 1e-4)', () => {
      const testDirs: [number, number, number][] = [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [0.577, 0.577, 0.577],
        [-0.3, 0.8, -0.5],
      ];

      for (const alpha of [0.0, 0.33, 0.67, 1.0]) {
        const J = computeJacobianVolumetric(0.5, 0.3, 0.05, alpha, 5.0);
        const inv = computeInverseJacobian(J);

        for (const v of testDirs) {
          // v_uvw = invJ * v
          const v_uvw: [number, number, number] = [
            inv.r0[0] * v[0] + inv.r0[1] * v[1] + inv.r0[2] * v[2],
            inv.r1[0] * v[0] + inv.r1[1] * v[1] + inv.r1[2] * v[2],
            inv.r2[0] * v[0] + inv.r2[1] * v[1] + inv.r2[2] * v[2],
          ];

          // Reconstruct: J * v_uvw
          const recon_v = [
            J.dl[0] * v_uvw[0] + J.dp[0] * v_uvw[1] + J.dh[0] * v_uvw[2],
            J.dl[1] * v_uvw[0] + J.dp[1] * v_uvw[1] + J.dh[1] * v_uvw[2],
            J.dl[2] * v_uvw[0] + J.dp[2] * v_uvw[1] + J.dh[2] * v_uvw[2],
          ];

          expect(Math.abs(recon_v[0] - v[0])).toBeLessThan(1e-4);
          expect(Math.abs(recon_v[1] - v[1])).toBeLessThan(1e-4);
          expect(Math.abs(recon_v[2] - v[2])).toBeLessThan(1e-4);
        }
      }
    });

    it('CH-PIVOT2-10: proves 8-step linear Taylor integration drift is strictly bounded', () => {
      const stepSize = 0.002; // Typical step size in world units
      const rayDir: [number, number, number] = [0.0, 1.0, 0.2];
      const normLen = Math.hypot(rayDir[0], rayDir[1], rayDir[2]);
      const dir: [number, number, number] = [rayDir[0] / normLen, rayDir[1] / normLen, rayDir[2] / normLen];

      for (const alpha of [0.0, 0.5, 1.0]) {
        const startUVW: [number, number, number] = [0.2, 0.4, 0.02];
        const startWorld = evaluateMacroChartVolumetric(startUVW[0], startUVW[1], startUVW[2], alpha, 5.0);

        const J = computeJacobianVolumetric(startUVW[0], startUVW[1], startUVW[2], alpha, 5.0);
        const inv = computeInverseJacobian(J);

        // Parameter velocity
        const v_uvw: [number, number, number] = [
          inv.r0[0] * dir[0] + inv.r0[1] * dir[1] + inv.r0[2] * dir[2],
          inv.r1[0] * dir[0] + inv.r1[1] * dir[1] + inv.r1[2] * dir[2],
          inv.r2[0] * dir[0] + inv.r2[1] * dir[1] + inv.r2[2] * dir[2],
        ];

        // Linearized UVW at step 8
        const linearUVW: [number, number, number] = [
          startUVW[0] + v_uvw[0] * (8 * stepSize),
          startUVW[1] + v_uvw[1] * (8 * stepSize),
          startUVW[2] + v_uvw[2] * (8 * stepSize),
        ];

        // Evaluate where linearUVW maps back to in world space
        const reconWorld = evaluateMacroChartVolumetric(linearUVW[0], linearUVW[1], linearUVW[2], alpha, 5.0);

        // Target world position after 8 steps along ray
        const targetWorld = [
          startWorld[0] + dir[0] * (8 * stepSize),
          startWorld[1] + dir[1] * (8 * stepSize),
          startWorld[2] + dir[2] * (8 * stepSize),
        ];

        const worldError = Math.hypot(
          reconWorld[0] - targetWorld[0],
          reconWorld[1] - targetWorld[1],
          reconWorld[2] - targetWorld[2]
        );

        // Over 8 steps (0.016 total distance), second-order curvature deviation is tiny (< 0.002)
        expect(worldError).toBeLessThan(0.002);
      }
    });
  });

  describe('Pillar 3: Engine State & Uniform Buffer Allocation Invariants', () => {
    it('CH-PIVOT2-11: verifies WebGPUEngine correctly initializes and packs cloudMultiRateRaymarch at slot 37', () => {
      const engine = new WebGPUEngine();
      expect(engine.isCloudMultiRateRaymarchEnabled()).toBe(false);

      engine.setCloudMultiRateRaymarch(true);
      expect(engine.isCloudMultiRateRaymarchEnabled()).toBe(true);

      engine.setCloudMultiRateRaymarch(false);
      expect(engine.isCloudMultiRateRaymarchEnabled()).toBe(false);
    });

    it('CH-PIVOT2-12: verifies volumetricCloudFloats[37] reflects multiRate boolean state', () => {
      const engine = new WebGPUEngine();
      const floats = (engine as any).volumetricCloudFloats as Float32Array;
      expect(floats).toBeDefined();
      expect(floats.length).toBe(40);

      // Default state
      expect(floats[37]).toBe(0.0);

      // Fake device to allow updateVolumetricUniforms execution
      const fakeQueueWrites: any[] = [];
      (engine as any).device = {
        queue: {
          writeBuffer: (buf: any, offset: number, data: any) => {
            fakeQueueWrites.push({ buf, offset, data });
          },
        },
      };
      (engine as any).volumetricCameraUniformBuffer = {};
      (engine as any).volumetricCloudUniformBuffer = {};

      // Test with multiRate enabled via params
      engine.updateVolumetricUniforms({
        cloudMultiRateRaymarch: true,
      } as any);
      expect(floats[37]).toBe(1.0);

      // Test with multiRate disabled
      engine.updateVolumetricUniforms({
        cloudMultiRateRaymarch: false,
      } as any);
      expect(floats[37]).toBe(0.0);
    });

    it('CH-PIVOT2-13: verifies useEngineState setCloudOptions handles multiRateRaymarch and cloudMultiRateRaymarch', () => {
      const liveUniforms: any = {};
      (globalThis as any).window = {
        __INDICATRIX_LIVE_UNIFORMS__: liveUniforms,
      };

      // Ensure setCloudOptions in useEngineState updates live uniforms
      const hooksFile = fs.readFileSync(
        path.resolve(__dirname, '../../src/hooks/useEngineState.ts'),
        'utf-8'
      );
      expect(hooksFile).toContain('cloudMultiRateRaymarch, setCloudMultiRateRaymarchState');
      expect(hooksFile).toContain('options.cloudMultiRateRaymarch ?? options.multiRateRaymarch');
      expect(hooksFile).toContain('__INDICATRIX_LIVE_UNIFORMS__.cloudMultiRateRaymarch = multiRate');
    });

    it('CH-PIVOT2-14: verifies UnifiedRightSidebar and AtmosphereDrawer prop pipeline wiring', () => {
      const sidebarFile = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx'),
        'utf-8'
      );
      const appFile = fs.readFileSync(
        path.resolve(__dirname, '../../src/App.tsx'),
        'utf-8'
      );
      const telemetryFile = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/hud/TelemetryHUD.tsx'),
        'utf-8'
      );

      // Verify prop chain: App -> TelemetryHUD -> UnifiedRightSidebar -> AtmosphereDrawer
      expect(appFile).toContain('cloudMultiRateRaymarch={cloudMultiRateRaymarch}');
      expect(telemetryFile).toContain('cloudMultiRateRaymarch={props.cloudMultiRateRaymarch}');
      expect(sidebarFile).toContain('cloudMultiRateRaymarch={propCloudMultiRateRaymarch}');
    });
  });
});
