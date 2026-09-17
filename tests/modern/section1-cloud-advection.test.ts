import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import {
  catmullRom1D,
  catmullRomTricubic,
  rk2BackTrajectory3D,
  computeOrographicLift,
  computeThermodynamicCoupling,
} from '../../src/core/physics/SemiLagrangianAdvection';

describe('Section 1: Temporal Cloud Morphing & Semi-Lagrangian Vector Advection', () => {
  const advectionShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_advection.wgsl');
  const volumetricShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
  const advectionShaderSrc = fs.readFileSync(advectionShaderPath, 'utf8');
  const volumetricShaderSrc = fs.readFileSync(volumetricShaderPath, 'utf8');

  describe('1. WGSL Uniform Structure Alignment & Sizing (§1.4, Invariant §20)', () => {
    it('declares AdvectionUniforms in cloud_advection.wgsl with exact 64-byte layout', () => {
      expect(advectionShaderSrc).toContain('struct AdvectionUniforms');
      expect(advectionShaderSrc).toMatch(/u_deltaTime:\s*f32/);
      expect(advectionShaderSrc).toMatch(/u_advectionSpeed:\s*f32/);
      expect(advectionShaderSrc).toMatch(/u_condensationRate:\s*f32/);
      expect(advectionShaderSrc).toMatch(/u_evaporationRate:\s*f32/);
      expect(advectionShaderSrc).toMatch(/u_gridDimensions:\s*vec4<u32>/);
      expect(advectionShaderSrc).toMatch(/u_windAltitudeShear:\s*vec4<f32>/);
      expect(advectionShaderSrc).toMatch(/u_thresholdParams:\s*vec4<f32>/);
    });

    it('declares identical AdvectionUniforms in volumetric_cloud.wgsl at @group(1)', () => {
      expect(volumetricShaderSrc).toContain('struct AdvectionUniforms');
      expect(volumetricShaderSrc).toContain('@group(1) @binding(0) var<uniform> advection: AdvectionUniforms;');
      expect(volumetricShaderSrc).toContain('@group(1) @binding(1) var u_advectedDensityTexture: texture_3d<f32>;');
      expect(volumetricShaderSrc).toContain('@group(1) @binding(2) var u_advectedDensitySampler: sampler;');
    });

    it('preserves all @group(0) bindings in volumetric_cloud.wgsl for backward compatibility', () => {
      for (let b = 0; b <= 8; b++) {
        expect(volumetricShaderSrc).toMatch(new RegExp(`@group\\(0\\)\\s+@binding\\(${b}\\)`));
      }
    });
  });

  describe('2. Compute Architecture & Mathematical Formulations (§1.2, §1.3, Rule 4, Rule 8)', () => {
    it('uses @workgroup_size(8, 8, 4) for 3D volumetric compute dispatch', () => {
      expect(advectionShaderSrc).toMatch(/@compute\s+@workgroup_size\(8,\s*8,\s*4\)/);
    });

    it('writes to 3D storage texture with rgba8unorm format', () => {
      expect(advectionShaderSrc).toMatch(/var u_nextDensityTexture:\s*texture_storage_3d<rgba8unorm,\s*write>;/);
    });

    it('conforms strictly to geoid elevation decoding parity formula (Rule 8)', () => {
      expect(advectionShaderSrc).toContain('demSample.a * 19772.0 - 10924.0');
    });

    it('implements RK2 Semi-Lagrangian back-trajectory tracing with midpoint evaluation', () => {
      expect(advectionShaderSrc).toContain('let u0 = getAtmosphericVelocity(uvw, fDims);');
      expect(advectionShaderSrc).toContain('let xStar = backstepCoord(uvw, 0.5 * dt * u0);');
      expect(advectionShaderSrc).toContain('let uHalf = getAtmosphericVelocity(xStar, fDims);');
      expect(advectionShaderSrc).toContain('let xDep = backstepCoord(uvw, dt * uHalf);');
    });

    it('implements Catmull-Rom tricubic spline interpolation with periodic horizontal wrapping', () => {
      expect(advectionShaderSrc).toContain('fn sampleCatmullRom3D(');
      expect(advectionShaderSrc).toContain('let x0 = fract(tc0.x);');
      expect(advectionShaderSrc).toContain('let x1 = fract(tc1.x);');
      expect(advectionShaderSrc).toContain('let y0 = clamp(tc0.y, 0.001, 0.999);');
      expect(advectionShaderSrc).toContain('let y1 = clamp(tc1.y, 0.001, 0.999);');
      expect(advectionShaderSrc).toContain('let z0 = clamp(tc0.z, 0.0, 1.0);');
      expect(advectionShaderSrc).toContain('let z1 = clamp(tc1.z, 0.0, 1.0);');
    });

    it('implements thermodynamic orographic condensation source and subsidence evaporation sink', () => {
      expect(advectionShaderSrc).toContain('let sCond = uniforms.u_condensationRate * max(0.0, uDotGradH - wCrit);');
      expect(advectionShaderSrc).toContain('let sEvap = uniforms.u_evaporationRate * (1.0 - rh) * rhoStar;');
      expect(advectionShaderSrc).toContain('let rhoNew = clamp(rhoStar + dt * (sCond - sEvap), minDensity, maxDensity);');
    });

    it('uses explicit LOD 0.0 for texture sampling in compute shader', () => {
      expect(advectionShaderSrc).toContain('textureSampleLevel(u_windTexture, u_windSampler, uvw.xy, 0.0)');
      expect(advectionShaderSrc).toContain('textureSampleLevel(u_demTexture, u_demSampler,');
      expect(advectionShaderSrc).toContain('textureSampleLevel(tex, samp, vec3<f32>(coordX, coordY, coordZ), 0.0)');
    });
  });

  describe('3. Analytical Physics & Numerical Algorithms Verification (SemiLagrangianAdvection.ts)', () => {
    it('catmullRom1D strictly satisfies interpolation and partition of unity', () => {
      // Knot values
      const p0 = 0.2, p1 = 0.5, p2 = 0.8, p3 = 0.9;
      // At f = 0, must equal p1 exactly
      expect(catmullRom1D(0.0, p0, p1, p2, p3)).toBeCloseTo(p1, 6);
      // At f = 1, must equal p2 exactly
      expect(catmullRom1D(1.0, p0, p1, p2, p3)).toBeCloseTo(p2, 6);
      // Uniform constant field preserves constant value
      const c = 0.73;
      expect(catmullRom1D(0.35, c, c, c, c)).toBeCloseTo(c, 6);
    });

    it('catmullRomTricubic reconstructs uniform density volume with zero error', () => {
      const dims: [number, number, number] = [8, 8, 4];
      const vol = new Float32Array(dims[0] * dims[1] * dims[2]);
      const constValue = 0.654;
      vol.fill(constValue);

      const samples = [
        [0.1, 0.2, 0.3],
        [0.5, 0.5, 0.5],
        [0.99, 0.05, 0.9],
        [0.0, 0.99, 0.0],
      ] as [number, number, number][];

      for (const uvw of samples) {
        const result = catmullRomTricubic(vol, dims, uvw);
        expect(result).toBeCloseTo(constValue, 4);
      }
    });

    it('catmullRomTricubic exhibits exact periodic wrapping along U (longitude)', () => {
      const dims: [number, number, number] = [8, 8, 4];
      const vol = new Float32Array(dims[0] * dims[1] * dims[2]);
      // Fill with arbitrary distinct values
      for (let i = 0; i < vol.length; i++) {
        vol[i] = Math.sin(i * 0.37) * 0.5 + 0.5;
      }

      // Sample at arbitrary U and shifted U by exactly 1.0 and -1.0
      const baseSample = catmullRomTricubic(vol, dims, [0.35, 0.45, 0.6]);
      const wrappedRight = catmullRomTricubic(vol, dims, [1.35, 0.45, 0.6]);
      const wrappedLeft = catmullRomTricubic(vol, dims, [-0.65, 0.45, 0.6]);

      expect(wrappedRight).toBeCloseTo(baseSample, 5);
      expect(wrappedLeft).toBeCloseTo(baseSample, 5);
    });

    it('rk2BackTrajectory3D is identity operator under zero velocity', () => {
      const start: [number, number, number] = [0.4, 0.6, 0.3];
      const dep = rk2BackTrajectory3D(start, 60.0, () => [0, 0, 0]);
      expect(dep[0]).toBeCloseTo(start[0], 5);
      expect(dep[1]).toBeCloseTo(start[1], 5);
      expect(dep[2]).toBeCloseTo(start[2], 5);
    });

    it('rk2BackTrajectory3D accurately advects in constant velocity field', () => {
      const start: [number, number, number] = [0.5, 0.5, 0.5];
      const vel: [number, number, number] = [0.001, -0.0005, 0.002];
      const dt = 10.0;
      const dep = rk2BackTrajectory3D(start, dt, () => vel);

      // dep = start - vel * dt
      expect(dep[0]).toBeCloseTo(start[0] - vel[0] * dt, 5);
      expect(dep[1]).toBeCloseTo(start[1] - vel[1] * dt, 5);
      expect(dep[2]).toBeCloseTo(start[2] - vel[2] * dt, 5);
    });

    it('computeOrographicLift correctly evaluates dot product of wind and elevation gradient', () => {
      const windEast: [number, number] = [20.0, 0.0];
      const gradEast: [number, number] = [0.05, 0.0]; // 50m per km upslope
      const lift = computeOrographicLift(windEast, gradEast);
      expect(lift).toBeCloseTo(1.0, 5); // 20 * 0.05 = 1.0 m/s updraft

      const windCross: [number, number] = [0.0, 20.0];
      const liftCross = computeOrographicLift(windCross, gradEast);
      expect(liftCross).toBeCloseTo(0.0, 5); // Cross wind generates no lift
    });

    it('computeThermodynamicCoupling enforces lifting condensation threshold and subsidence sink', () => {
      // 1. Below threshold wCrit: no condensation
      const resultSubCrit = computeThermodynamicCoupling(
        0.2, // rhoStar
        0.05, // uDotGradH
        0.10, // wCrit (threshold is higher than lift)
        0.05, // gammaCond
        0.02, // kappaEvap
        1.0,  // 100% RH -> no evap
        10.0
      );
      expect(resultSubCrit.sCond).toBe(0.0);
      expect(resultSubCrit.rhoNew).toBeCloseTo(0.2, 5);

      // 2. Above threshold wCrit: active condensation source
      const resultSuperCrit = computeThermodynamicCoupling(
        0.2,
        0.30,
        0.10, // lift exceeds threshold by 0.20
        0.05,
        0.0,
        1.0,
        10.0
      );
      expect(resultSuperCrit.sCond).toBeCloseTo(0.05 * 0.20, 5); // 0.010
      expect(resultSuperCrit.rhoNew).toBeCloseTo(0.2 + 10.0 * 0.010, 5); // 0.30

      // 3. Dry air subsidence: evaporation sink reduces density
      const resultEvap = computeThermodynamicCoupling(
        0.5,
        0.0,
        0.10,
        0.0,
        0.05, // kappaEvap
        0.4,  // RH = 40%, 1 - RH = 0.6
        5.0
      );
      expect(resultEvap.sEvap).toBeCloseTo(0.05 * 0.6 * 0.5, 5); // 0.015
      expect(resultEvap.rhoNew).toBeCloseTo(0.5 - 5.0 * 0.015, 5); // 0.425
    });
  });

  describe('4. Engine Integration & Zero-GC Discipline (Rule 24, Rule 26)', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('preallocates 64-byte mirror buffer on engine instance', () => {
      expect((engine as any).advectionFloats.buffer).toBeInstanceOf(ArrayBuffer);
      expect((engine as any).advectionFloats.buffer.byteLength).toBe(64);
      expect((engine as any).advectionFloats).toBeInstanceOf(Float32Array);
      expect((engine as any).advectionU32).toBeInstanceOf(Uint32Array);
    });

    it('updates uniforms in-place without reallocating buffers', () => {
      (engine as any).device = {
        queue: {
          writeBuffer: vi.fn(),
        },
      };
      (engine as any).advectionUniformBuffer = {};

      const bufferBefore = (engine as any).advectionFloats.buffer;
      (engine as any).updateAdvectionUniforms({
        cloudAdvectionSpeed: 2.5,
        condensationRate: 0.08,
        evaporationRate: 0.04,
      });

      expect((engine as any).advectionFloats.buffer).toBe(bufferBefore);

      const floats = (engine as any).advectionFloats;
      const u32s = (engine as any).advectionU32;

      expect(floats[1]).toBeCloseTo(2.5, 5);  // u_advectionSpeed
      expect(floats[2]).toBeCloseTo(0.08, 5); // u_condensationRate
      expect(floats[3]).toBeCloseTo(0.04, 5); // u_evaporationRate
      expect(u32s[4]).toBe(128);    // grid width
      expect(u32s[5]).toBe(128);    // grid height
      expect(u32s[6]).toBe(32);     // grid depth
    });

    it('alternates ping-pong steps across consecutive advection dispatches', () => {
      const mockComputePass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        end: vi.fn(),
      };
      const mockCommandEncoder = {
        beginComputePass: vi.fn().mockReturnValue(mockComputePass),
      };

      (engine as any).device = {
        queue: { writeBuffer: vi.fn() },
      };
      (engine as any).cloudAdvectionComputePipeline = {};
      (engine as any).cloudAdvectionComputeBindGroups = [
        { label: 'bg0' },
        { label: 'bg1' },
      ];
      (engine as any).advectionUniformBuffer = {};

      // Step 0: pingIdx = 0
      engine.cloudAdvectionStep = 0;
      engine.dispatchCloudAdvection(mockCommandEncoder as any, {});
      expect(mockComputePass.setBindGroup).toHaveBeenLastCalledWith(0, { label: 'bg0' });
      expect(engine.cloudAdvectionStep).toBe(1);

      // Step 1: pingIdx = 1
      engine.dispatchCloudAdvection(mockCommandEncoder as any, {});
      expect(mockComputePass.setBindGroup).toHaveBeenLastCalledWith(0, { label: 'bg1' });
      expect(engine.cloudAdvectionStep).toBe(2);

      // Step 2: pingIdx = 0
      engine.dispatchCloudAdvection(mockCommandEncoder as any, {});
      expect(mockComputePass.setBindGroup).toHaveBeenLastCalledWith(0, { label: 'bg0' });
      expect(engine.cloudAdvectionStep).toBe(3);
    });

    it('respects Zero-Zombie Pass Invariant via setCloudAdvectionEnabled (Rule 24)', () => {
      expect(engine.isCloudAdvectionEnabled()).toBe(true);
      engine.setCloudAdvectionEnabled(false);
      expect(engine.isCloudAdvectionEnabled()).toBe(false);
      engine.setCloudAdvectionEnabled(true);
      expect(engine.isCloudAdvectionEnabled()).toBe(true);
    });

    it('cleans up all advection resources cleanly on engine.dispose()', () => {
      const destroyMock = vi.fn();
      (engine as any).isInitialized = true;
      (engine as any).cloudDensityTextures = [
        { destroy: destroyMock },
        { destroy: destroyMock },
      ];
      (engine as any).dummy3DDensityTexture = { destroy: destroyMock };
      (engine as any).advectionUniformBuffer = { destroy: destroyMock };

      engine.dispose();

      expect(destroyMock).toHaveBeenCalledTimes(4);
      expect((engine as any).cloudDensityTextures[0]).toBeNull();
      expect((engine as any).cloudDensityTextures[1]).toBeNull();
      expect((engine as any).dummy3DDensityTexture).toBeNull();
      expect((engine as any).advectionUniformBuffer).toBeNull();
    });
  });
});
