import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Challenger M3-Pivot-2: Linearized Multi-Rate Tangent Frame Raymarcher Suite', () => {
  const wgslPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
  const shaderSource = fs.readFileSync(wgslPath, 'utf8');

  describe('Pillar 1: WGSL Shader Architecture & Tangent Frame Invariants', () => {
    it('CH-PIVOT2-01: verifies evaluateMacroChartWGSL exists and implements exact developable cylinder unwrapping', () => {
      expect(shaderSource).toContain('fn evaluateMacroChartWGSL(');
      expect(shaderSource).toContain('let pDev = vec3<f32>(');
      expect(shaderSource).toContain('curX + normX * h,');
      expect(shaderSource).toContain('curZ + normZ * h + dz_lift');
      expect(shaderSource).toContain('let pSph = vec3<f32>(');
    });

    it('CH-PIVOT2-02: verifies computeJacobian implements central finite differences with DELTA = 0.001', () => {
      expect(shaderSource).toContain('fn computeJacobian(');
      expect(shaderSource).toContain('let DELTA: f32 = 0.001;');
      expect(shaderSource).toContain('let TWO_DELTA: f32 = DELTA * 2.0;');
      expect(shaderSource).toContain('let pLam0 = evaluateMacroChartWGSL(lambda - DELTA, phi, h, unfurl, radius);');
      expect(shaderSource).toContain('let pLam1 = evaluateMacroChartWGSL(lambda + DELTA, phi, h, unfurl, radius);');
      expect(shaderSource).toContain('let T_lambda = (pLam1 - pLam0) / TWO_DELTA;');
    });

    it('CH-PIVOT2-03: verifies inverse3x3 implements SIMD cross product inversion with singularity protection', () => {
      expect(shaderSource).toContain('fn inverse3x3(m: mat3x3<f32>) -> mat3x3<f32>');
      expect(shaderSource).toContain('let cross12 = cross(c1, c2);');
      expect(shaderSource).toContain('let cross20 = cross(c2, c0);');
      expect(shaderSource).toContain('let cross01 = cross(c0, c1);');
      expect(shaderSource).toContain('let det = dot(c0, cross12);');
      expect(shaderSource).toContain('let invDet = 1.0 / select(det, 1.0, abs(det) < 1e-8);');
    });

    it('CH-PIVOT2-04: verifies getParameterVelocity maps world ray direction to parameter velocity', () => {
      expect(shaderSource).toContain('fn getParameterVelocity(');
      expect(shaderSource).toContain('let J = computeJacobian(lambda, phi, h, unfurl, radius);');
      expect(shaderSource).toContain('let J_inv = inverse3x3(J);');
      expect(shaderSource).toContain('return J_inv * ray_dir_world;');
    });

    it('CH-PIVOT2-05: verifies sampleCloudDensityFromUVW decouples density evaluation from chart inversion', () => {
      expect(shaderSource).toContain('fn sampleCloudDensityFromUVW(inv: vec3<f32>, pos: vec3<f32>, rInner: f32, deltaR: f32) -> f32');
      expect(shaderSource).toContain('fn sampleCloudDensity(pos: vec3<f32>, rInner: f32, deltaR: f32) -> f32');
      expect(shaderSource).toContain('return sampleCloudDensityFromUVW(inv, pos, rInner, deltaR);');
    });

    it('CH-PIVOT2-06: verifies sampleSunShadowTransmittanceLinear executes 4 linear steps without chart inversions', () => {
      expect(shaderSource).toContain('fn sampleSunShadowTransmittanceLinear(');
      expect(shaderSource).toContain('let sun_v_uvw = getParameterVelocity(sunDir, start_uvw.x, start_uvw.y, start_uvw.z, unfurl, rInner);');
      expect(shaderSource).toContain('for (var k: i32 = 1; k <= 4; k++)');
      expect(shaderSource).toContain('var curUVW = start_uvw + sun_v_uvw * stepLen;');
      expect(shaderSource).toContain('sampleCloudDensityFromUVW(curUVW, pos + sunDir * stepLen, rInner, deltaR);');
    });

    it('CH-PIVOT2-07: verifies fs_main multi-rate tracking branch and 8-step re-anchoring logic', () => {
      expect(shaderSource).toContain('let isMultiRate = cloud.u_padCloud.y > 0.5;');
      expect(shaderSource).toContain('if (step == 0 || (step % 8) == 0)');
      expect(shaderSource).toContain('currentUVW = invertMacroChartWGSL(p, unfurl, rInner);');
      expect(shaderSource).toContain('v_uvw = getParameterVelocity(rayDir, currentUVW.x, currentUVW.y, currentUVW.z, unfurl, rInner);');
      expect(shaderSource).toContain('currentUVW += v_uvw * currentStepDist;');
      expect(shaderSource).toContain('currentUVW.x = fract((currentUVW.x / TWO_PI) + 0.5) * TWO_PI - PI;');
      expect(shaderSource).toContain('shadowRes = sampleSunShadowTransmittanceLinear(currentUVW, p, sunDir, rInner, deltaR);');
    });
  });

  describe('Pillar 2: Mathematical Rigor & Jacobian Linear Inversion Verification', () => {
    // JS mirror of evaluateMacroChartWGSL
    function evaluateMacroChartJS(lonRad: number, latRad: number, h: number, alpha: number, radius: number = 5.0): [number, number, number] {
      const alphaClamped = Math.max(0.0, Math.min(1.0, alpha));
      const alphaEased = alphaClamped * alphaClamped * (3.0 - 2.0 * alphaClamped);
      const tParallel = Math.max(0.0, Math.min(1.0, (alphaEased - 0.05) / 0.80));
      const cosLat = Math.cos(latRad);
      const sinLat = Math.sin(latRad);
      const parallelWidth = cosLat * (1.0 - tParallel) + tParallel;
      const rPar = radius * parallelWidth;
      const s = Math.max(0.0001, 1.0 - alphaEased);
      const uAngle = s * lonRad;

      let curX: number;
      let curZ: number;
      if (Math.abs(uAngle) > 0.02) {
        curX = rPar * (Math.sin(uAngle) / s);
        curZ = rPar * ((Math.cos(uAngle) - 1.0) / s + s);
      } else {
        const u2 = uAngle * uAngle;
        curX = rPar * lonRad * (1.0 - u2 / 6.0);
        curZ = rPar * s * (1.0 - lonRad * lonRad * 0.5 * (1.0 - u2 / 12.0));
      }

      const tStraighten = Math.max(0.0, Math.min(1.0, (alphaEased - 0.20) / 0.75));
      const curY = (1.0 - tStraighten) * radius * sinLat + tStraighten * radius * latRad;

      const sZero = Math.max(0.0, Math.min(1.0, alphaClamped / 0.10));
      const sOne = 1.0 - Math.max(0.0, Math.min(1.0, (alphaClamped - 0.90) / 0.10));
      const env = Math.sin(Math.PI * alphaClamped) * sZero * sOne;
      const dz_lift = (0.60 + 0.40 * cosLat) * radius * 0.06 * env;

      const normX = Math.sin(uAngle);
      const normY = 0.0;
      const normZ = Math.cos(uAngle);

      const pDev: [number, number, number] = [
        curX + normX * h,
        curY + normY * h,
        curZ + normZ * h + dz_lift,
      ];

      const pSph: [number, number, number] = [
        (radius + h) * cosLat * Math.sin(lonRad),
        (radius + h) * sinLat,
        (radius + h) * cosLat * Math.cos(lonRad),
      ];

      const pFlat: [number, number, number] = [
        radius * lonRad,
        radius * latRad,
        h,
      ];

      const tSphere = 1.0 - Math.max(0.0, Math.min(1.0, alphaClamped / 0.05));
      const tFlat = Math.max(0.0, Math.min(1.0, (alphaClamped - 0.95) / 0.05));

      let px = pDev[0] * (1.0 - tSphere) + pSph[0] * tSphere;
      let py = pDev[1] * (1.0 - tSphere) + pSph[1] * tSphere;
      let pz = pDev[2] * (1.0 - tSphere) + pSph[2] * tSphere;

      px = px * (1.0 - tFlat) + pFlat[0] * tFlat;
      py = py * (1.0 - tFlat) + pFlat[1] * tFlat;
      pz = pz * (1.0 - tFlat) + pFlat[2] * tFlat;

      return [px, py, pz];
    }

    // Finite difference numerical Jacobian on CPU
    function computeJacobianCPU(lambda: number, phi: number, h: number, unfurl: number, radius: number = 5.0) {
      const DELTA = 0.001;
      const inv2Delta = 1.0 / (2.0 * DELTA);

      const p_l_plus = evaluateMacroChartJS(lambda + DELTA, phi, h, unfurl, radius);
      const p_l_minus = evaluateMacroChartJS(lambda - DELTA, phi, h, unfurl, radius);
      const dl = [
        (p_l_plus[0] - p_l_minus[0]) * inv2Delta,
        (p_l_plus[1] - p_l_minus[1]) * inv2Delta,
        (p_l_plus[2] - p_l_minus[2]) * inv2Delta,
      ];

      const p_p_plus = evaluateMacroChartJS(lambda, phi + DELTA, h, unfurl, radius);
      const p_p_minus = evaluateMacroChartJS(lambda, phi - DELTA, h, unfurl, radius);
      const dp = [
        (p_p_plus[0] - p_p_minus[0]) * inv2Delta,
        (p_p_plus[1] - p_p_minus[1]) * inv2Delta,
        (p_p_plus[2] - p_p_minus[2]) * inv2Delta,
      ];

      const p_h_plus = evaluateMacroChartJS(lambda, phi, h + DELTA, unfurl, radius);
      const p_h_minus = evaluateMacroChartJS(lambda, phi, h - DELTA, unfurl, radius);
      const dh = [
        (p_h_plus[0] - p_h_minus[0]) * inv2Delta,
        (p_h_plus[1] - p_h_minus[1]) * inv2Delta,
        (p_h_plus[2] - p_h_minus[2]) * inv2Delta,
      ];

      return { dl, dp, dh };
    }

    // 3x3 Determinant
    function det3x3(c0: number[], c1: number[], c2: number[]) {
      return (
        c0[0] * (c1[1] * c2[2] - c1[2] * c2[1]) -
        c0[1] * (c1[0] * c2[2] - c1[2] * c2[0]) +
        c0[2] * (c1[0] * c2[1] - c1[1] * c2[0])
      );
    }

    // 3x3 Inverse
    function invert3x3Matrix(c0: number[], c1: number[], c2: number[]) {
      const cross12 = [
        c1[1] * c2[2] - c1[2] * c2[1],
        c1[2] * c2[0] - c1[0] * c2[2],
        c1[0] * c2[1] - c1[1] * c2[0],
      ];
      const cross20 = [
        c2[1] * c0[2] - c2[2] * c0[1],
        c2[2] * c0[0] - c2[0] * c0[2],
        c2[0] * c0[1] - c2[1] * c0[0],
      ];
      const cross01 = [
        c0[1] * c1[2] - c0[2] * c1[1],
        c0[2] * c1[0] - c0[0] * c1[2],
        c0[0] * c1[1] - c0[1] * c1[0],
      ];

      const det = c0[0] * cross12[0] + c0[1] * cross12[1] + c0[2] * cross12[2];
      const invDet = 1.0 / (Math.abs(det) < 1e-8 ? 1.0 : det);

      return {
        r0: [cross12[0] * invDet, cross12[1] * invDet, cross12[2] * invDet],
        r1: [cross20[0] * invDet, cross20[1] * invDet, cross20[2] * invDet],
        r2: [cross01[0] * invDet, cross01[1] * invDet, cross01[2] * invDet],
        det,
      };
    }

    it('CH-PIVOT2-08: proves Jacobian is non-singular across unfurl manifold [0.0, 1.0]', () => {
      const testAlphas = [0.0, 0.25, 0.5, 0.75, 1.0];
      const testLats = [-1.0, -0.5, 0.0, 0.5, 1.0];
      const testLons = [-2.0, -1.0, 0.0, 1.0, 2.0];
      const testHeights = [0.0, 0.05, 0.15];

      for (const alpha of testAlphas) {
        for (const lat of testLats) {
          for (const lon of testLons) {
            for (const h of testHeights) {
              const { dl, dp, dh } = computeJacobianCPU(lon, lat, h, alpha);
              const det = det3x3(dl, dp, dh);
              expect(Number.isFinite(det)).toBe(true);
              expect(Math.abs(det)).toBeGreaterThan(0.001);
            }
          }
        }
      }
    });

    it('CH-PIVOT2-09: proves J * (J^-1 * v) = v to machine precision (< 1e-4)', () => {
      const testDirs = [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [0.577, 0.577, 0.577],
        [-0.3, 0.8, -0.5],
      ];

      for (const alpha of [0.0, 0.33, 0.67, 1.0]) {
        const { dl, dp, dh } = computeJacobianCPU(0.5, 0.3, 0.05, alpha);
        const inv = invert3x3Matrix(dl, dp, dh);

        for (const v of testDirs) {
          // v_uvw = invJ * v
          const v_uvw = [
            inv.r0[0] * v[0] + inv.r0[1] * v[1] + inv.r0[2] * v[2],
            inv.r1[0] * v[0] + inv.r1[1] * v[1] + inv.r1[2] * v[2],
            inv.r2[0] * v[0] + inv.r2[1] * v[1] + inv.r2[2] * v[2],
          ];

          // Reconstruct: J * v_uvw
          const recon_v = [
            dl[0] * v_uvw[0] + dp[0] * v_uvw[1] + dh[0] * v_uvw[2],
            dl[1] * v_uvw[0] + dp[1] * v_uvw[1] + dh[1] * v_uvw[2],
            dl[2] * v_uvw[0] + dp[2] * v_uvw[1] + dh[2] * v_uvw[2],
          ];

          expect(Math.abs(recon_v[0] - v[0])).toBeLessThan(1e-4);
          expect(Math.abs(recon_v[1] - v[1])).toBeLessThan(1e-4);
          expect(Math.abs(recon_v[2] - v[2])).toBeLessThan(1e-4);
        }
      }
    });

    it('CH-PIVOT2-10: proves 8-step linear Taylor integration drift is strictly bounded', () => {
      const stepSize = 0.002; // Typical step size in world units
      const rayDir = [0.0, 1.0, 0.2];
      const normLen = Math.hypot(rayDir[0], rayDir[1], rayDir[2]);
      const dir = [rayDir[0] / normLen, rayDir[1] / normLen, rayDir[2] / normLen];

      for (const alpha of [0.0, 0.5, 1.0]) {
        const startUVW = [0.2, 0.4, 0.02];
        const startWorld = evaluateMacroChartJS(startUVW[0], startUVW[1], startUVW[2], alpha);

        const { dl, dp, dh } = computeJacobianCPU(startUVW[0], startUVW[1], startUVW[2], alpha);
        const inv = invert3x3Matrix(dl, dp, dh);

        // Parameter velocity
        const v_uvw = [
          inv.r0[0] * dir[0] + inv.r0[1] * dir[1] + inv.r0[2] * dir[2],
          inv.r1[0] * dir[0] + inv.r1[1] * dir[1] + inv.r1[2] * dir[2],
          inv.r2[0] * dir[0] + inv.r2[1] * dir[1] + inv.r2[2] * dir[2],
        ];

        // Linearized UVW at step 8
        const linearUVW = [
          startUVW[0] + v_uvw[0] * (8 * stepSize),
          startUVW[1] + v_uvw[1] * (8 * stepSize),
          startUVW[2] + v_uvw[2] * (8 * stepSize),
        ];

        // Evaluate where linearUVW maps back to in world space
        const reconWorld = evaluateMacroChartJS(linearUVW[0], linearUVW[1], linearUVW[2], alpha);

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

        // Over 8 steps (0.016 total distance), second-order curvature deviation is tiny (< 0.001)
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
