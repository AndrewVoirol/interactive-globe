/**
 * tests/tier2/lcl-gating.test.ts
 *
 * Tier 2 Verification Suite:
 * Lifting Condensation Level (LCL) Thermodynamic Gating & DEM Coupling
 *
 * Core Verification Areas:
 * 1. Physical Model: LCL ≈ 125.0 * max(T - T_d, 0.0) meters
 * 2. Orographic Condensation Gate: smoothstep(LCL - 200, LCL, h)
 * 3. Legacy Toggle: Gating disabled evaluates to gate = 1.0 everywhere
 * 4. DEM Geoid Mathematical Parity (Invariant §15)
 * 5. WebGPU Bind Group Entries 11 & 12 and Lazy Allocation Idempotency
 * 6. Uniform Float 74 Packing (SimUniforms u_lclGating)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  computeLCL,
  computeLCLGate,
  modulatePrecipitationByLCL,
} from '../../src/core/physics/LCLThermodynamics';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

describe('Tier 2: Lifting Condensation Level (LCL) Thermodynamics', () => {
  // ==========================================================================
  // Section 1: Physical Model LCL Computation
  // ==========================================================================
  describe('Physical Formula: LCL ≈ 125.0 × max(T - T_d, 0.0)', () => {
    it('evaluates standard atmospheric conditions (25°C surface, 15°C dewpoint -> 1250m)', () => {
      expect(computeLCL(25.0, 15.0)).toBe(1250.0);
    });

    it('evaluates humid coastal conditions (20°C surface, 18°C dewpoint -> 250m)', () => {
      expect(computeLCL(20.0, 18.0)).toBe(250.0);
    });

    it('evaluates arid desert conditions (30°C surface, 5°C dewpoint -> 3125m)', () => {
      expect(computeLCL(30.0, 5.0)).toBe(3125.0);
    });

    it('evaluates saturated surface air (T == T_d -> 0m)', () => {
      expect(computeLCL(15.0, 15.0)).toBe(0.0);
      expect(computeLCL(0.0, 0.0)).toBe(0.0);
      expect(computeLCL(-10.0, -10.0)).toBe(0.0);
    });

    it('clamps supersaturated air (T < T_d) safely to 0m without negative LCL', () => {
      expect(computeLCL(10.0, 15.0)).toBe(0.0);
      expect(computeLCL(-5.0, 0.0)).toBe(0.0);
    });

    it('evaluates sub-zero temperatures with positive dewpoint depression', () => {
      // T = -5°C, T_d = -10°C => depression = 5°C => LCL = 625m
      expect(computeLCL(-5.0, -10.0)).toBe(625.0);
    });

    it('evaluates fallback texture defaults: T=15°C, T_d=10°C => 625m', () => {
      expect(computeLCL(15.0, 10.0)).toBe(625.0);
    });
  });

  // ==========================================================================
  // Section 2: Thermodynamic Orographic Condensation Gate
  // ==========================================================================
  describe('Orographic Condensation Gate: smoothstep(LCL - 200.0, LCL, h)', () => {
    const lcl = 1000.0;

    it('fully passes precipitation at or above summit elevation (h >= LCL -> gate = 1.0)', () => {
      expect(computeLCLGate(1000.0, lcl, true)).toBe(1.0);
      expect(computeLCLGate(1500.0, lcl, true)).toBe(1.0);
      expect(computeLCLGate(8848.0, lcl, true)).toBe(1.0);
    });

    it('completely suppresses condensation below the 200m lifting margin (h <= LCL - 200 -> gate = 0.0)', () => {
      expect(computeLCLGate(800.0, lcl, true)).toBe(0.0);
      expect(computeLCLGate(500.0, lcl, true)).toBe(0.0);
      expect(computeLCLGate(0.0, lcl, true)).toBe(0.0);
      expect(computeLCLGate(-500.0, lcl, true)).toBe(0.0);
    });

    it('evaluates exact midpoint of smoothstep transition (h = LCL - 100 -> gate = 0.5)', () => {
      const midGate = computeLCLGate(900.0, lcl, true);
      expect(midGate).toBeCloseTo(0.5, 6);
    });

    it('evaluates smooth cubic interpolation across the transition zone', () => {
      // At t = 0.25 (h = 850m): smoothstep(0.25) = 0.25^2 * (3 - 2*0.25) = 0.0625 * 2.5 = 0.15625
      const gate25 = computeLCLGate(850.0, lcl, true);
      expect(gate25).toBeCloseTo(0.15625, 5);

      // At t = 0.75 (h = 950m): smoothstep(0.75) = 0.75^2 * (3 - 2*0.75) = 0.5625 * 1.5 = 0.84375
      const gate75 = computeLCLGate(950.0, lcl, true);
      expect(gate75).toBeCloseTo(0.84375, 5);

      // Monotonically increasing across transition
      expect(gate75).toBeGreaterThan(gate25);
    });

    it('returns gate = 1.0 unconditionally when thermodynamic gating is disabled (legacy behavior)', () => {
      expect(computeLCLGate(0.0, lcl, false)).toBe(1.0);
      expect(computeLCLGate(500.0, lcl, false)).toBe(1.0);
      expect(computeLCLGate(799.0, lcl, false)).toBe(1.0);
      expect(computeLCLGate(1500.0, lcl, false)).toBe(1.0);
      expect(computeLCLGate(-1000.0, lcl, false)).toBe(1.0);
    });

    it('handles degenerate LCL <= 0 with summit >= 0m smoothly', () => {
      expect(computeLCLGate(100.0, 0.0, true)).toBe(1.0);
      expect(computeLCLGate(0.0, 0.0, true)).toBe(1.0);
    });
  });

  // ==========================================================================
  // Section 3: Modulated Precipitation Pipeline
  // ==========================================================================
  describe('Modulated Precipitation Output', () => {
    it('modulates raw rainfall rate by LCL gate', () => {
      const rawRain = 12.5; // mm/h
      // Summit at 1500m, LCL at 1250m (T=25, Td=15) -> Gate = 1.0 -> Precip = 12.5 mm/h
      const summitRes = modulatePrecipitationByLCL(rawRain, 1500.0, 25.0, 15.0, true);
      expect(summitRes.lclMeters).toBe(1250.0);
      expect(summitRes.lclGate).toBe(1.0);
      expect(summitRes.precipModulated).toBe(12.5);

      // Valley at 500m, LCL at 1250m -> Gate = 0.0 -> Precip = 0.0 mm/h
      const valleyRes = modulatePrecipitationByLCL(rawRain, 500.0, 25.0, 15.0, true);
      expect(valleyRes.lclGate).toBe(0.0);
      expect(valleyRes.precipModulated).toBe(0.0);

      // Mid-slope at 1150m (LCL - 100m) -> Gate = 0.5 -> Precip = 6.25 mm/h
      const slopeRes = modulatePrecipitationByLCL(rawRain, 1150.0, 25.0, 15.0, true);
      expect(slopeRes.lclGate).toBeCloseTo(0.5, 6);
      expect(slopeRes.precipModulated).toBeCloseTo(6.25, 5);
    });

    it('preserves full precipitation when gating is disabled', () => {
      const rawRain = 8.0;
      const resDisabled = modulatePrecipitationByLCL(rawRain, 100.0, 25.0, 15.0, false);
      expect(resDisabled.lclGate).toBe(1.0);
      expect(resDisabled.precipModulated).toBe(8.0);
    });

    it('evaluates extreme bathymetric depth (Marianas Trench -10,924m)', () => {
      const res = modulatePrecipitationByLCL(15.0, -10924.0, 28.0, 24.0, true);
      expect(res.lclMeters).toBe(500.0);
      expect(res.lclGate).toBe(0.0);
      expect(res.precipModulated).toBe(0.0);
    });

    it('evaluates extreme altitudinal summits (Mount Everest 8,848m) in sub-zero polar air', () => {
      // T = -35°C, T_d = -40°C => depression = 5°C => LCL = 625m
      const res = modulatePrecipitationByLCL(10.0, 8848.0, -35.0, -40.0, true);
      expect(res.lclMeters).toBe(625.0);
      expect(res.lclGate).toBe(1.0);
      expect(res.precipModulated).toBe(10.0);
    });

    it('evaluates boundary tolerances strictly at transition thresholds (LCL - 200m - eps and LCL + eps)', () => {
      const lcl = 1000.0;
      const eps = 1e-5;
      expect(computeLCLGate(800.0 - eps, lcl, true)).toBe(0.0);
      expect(computeLCLGate(800.0, lcl, true)).toBe(0.0);
      expect(computeLCLGate(1000.0, lcl, true)).toBe(1.0);
      expect(computeLCLGate(1000.0 + eps, lcl, true)).toBe(1.0);
    });

    it('survives 10,000-trial Monte Carlo fuzzing over extreme weather and topography without NaN or runaway', () => {
      for (let i = 0; i < 10000; i++) {
        const temp = -60.0 + Math.random() * 120.0; // -60°C to +60°C
        const dewpoint = -60.0 + Math.random() * 120.0;
        const elev = -11000.0 + Math.random() * 20000.0; // -11km to +9km
        const rain = Math.random() * 300.0; // 0 to 300 mm/h
        const enabled = Math.random() > 0.3;

        const res = modulatePrecipitationByLCL(rain, elev, temp, dewpoint, enabled);

        expect(Number.isFinite(res.lclMeters)).toBe(true);
        expect(res.lclMeters).toBeGreaterThanOrEqual(0.0);

        expect(Number.isFinite(res.lclGate)).toBe(true);
        expect(res.lclGate).toBeGreaterThanOrEqual(0.0);
        expect(res.lclGate).toBeLessThanOrEqual(1.0);

        expect(Number.isFinite(res.precipModulated)).toBe(true);
        expect(res.precipModulated).toBeGreaterThanOrEqual(0.0);
        expect(res.precipModulated).toBeLessThanOrEqual(rain + 1e-6);

        if (!enabled) {
          expect(res.lclGate).toBe(1.0);
          expect(res.precipModulated).toBeCloseTo(rain, 6);
        }
      }
    });
  });

  // ==========================================================================
  // Section 4: Cross-Pipeline DEM Mathematical Parity (Invariant §15)
  // ==========================================================================
  describe('Cross-Pipeline DEM Parity (Invariant §15)', () => {
    const decodeDEM = (alpha: number) => alpha * 19772.0 - 10924.0;

    it('verifies geoid elevation formula parity against crust_hydrosphere.wgsl', () => {
      // Alpha = 0.0 => Marianas Trench (-10924m)
      expect(decodeDEM(0.0)).toBe(-10924.0);

      // Alpha = 1.0 => Mount Everest Summit (8848m)
      expect(decodeDEM(1.0)).toBe(8848.0);

      // Mean Sea Level (h = 0m) => alpha = 10924 / 19772
      const seaLevelAlpha = 10924.0 / 19772.0;
      expect(decodeDEM(seaLevelAlpha)).toBeCloseTo(0.0, 8);
    });

    it('couples decoded DEM elevation directly into LCL gating', () => {
      const seaLevelAlpha = 10924.0 / 19772.0;
      const seaLevelElev = decodeDEM(seaLevelAlpha); // 0m
      const lcl = 625.0; // Default (15°C - 10°C)

      // Sea level is well below LCL - 200m (425m) -> Gate = 0.0
      expect(computeLCLGate(seaLevelElev, lcl, true)).toBe(0.0);

      // High mountain pass (elev = 2000m) is above LCL -> Gate = 1.0
      const mountainAlpha = (2000.0 + 10924.0) / 19772.0;
      const mountainElev = decodeDEM(mountainAlpha);
      expect(computeLCLGate(mountainElev, lcl, true)).toBe(1.0);
    });
  });

  // ==========================================================================
  // Section 5: Shader Static AST & Uniform Alignment (Invariants §3 & §20)
  // ==========================================================================
  describe('Shader Declarations & WGSL Uniform Invariants', () => {
    const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
    const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

    it('declares binding 11 (u_tempTexture) and binding 12 (u_dewpointTexture)', () => {
      expect(shaderSrc).toContain('@group(0) @binding(11) var u_tempTexture: texture_2d<f32>;');
      expect(shaderSrc).toContain('@group(0) @binding(12) var u_dewpointTexture: texture_2d<f32>;');
    });

    it('declares u_lclBypass (float 74) in SimUniforms struct preserving 16-byte alignment', () => {
      expect(shaderSrc).toMatch(/(?:u_lclBypass|_padPrecip0):\s*f32,\s*\/\/\s*offset\s*296/);
    });

    it('samples u_tempTexture and u_dewpointTexture unconditionally with explicit LOD 0.0 (Invariant §3)', () => {
      expect(shaderSrc).toContain('textureSampleLevel(u_tempTexture, u_precipSampler, precipUV, 0.0)');
      expect(shaderSrc).toContain('textureSampleLevel(u_dewpointTexture, u_precipSampler, precipUV, 0.0)');
    });

    it('evaluates LCL formula and gating inside fs_main', () => {
      expect(shaderSrc).toContain('let lclMeters = 125.0 * max(tempC - dewpointC, 0.0);');
      expect(shaderSrc).toContain('let lclGateRaw = smoothstep(lclMeters - 200.0, lclMeters, elevMeters);');
      expect(shaderSrc).toMatch(/let lclGate = select\(lclGateRaw, 1\.0, sim\.(?:u_lclBypass|_padPrecip0) > 0\.5\);/);
    });
  });

  // ==========================================================================
  // Section 6: WebGPUEngine Bindings & Lazy Texture Allocators
  // ==========================================================================
  describe('WebGPUEngine Bindings & Lazy Texture Allocators', () => {
    it('configures crustBindGroupLayout with entries 11 and 12', async () => {
      const mockDevice = new MockGPUDevice();
      let capturedLayoutDescriptor: any = null;
      mockDevice.createBindGroupLayout = (desc: any) => {
        if (desc.label === 'crust_bind_group_layout') {
          capturedLayoutDescriptor = desc;
        }
        return { descriptor: desc } as any;
      };

      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).particleBuffers = [
        mockDevice.createBuffer({ size: 32, usage: 0 }),
        mockDevice.createBuffer({ size: 32, usage: 0 }),
      ];
      (engine as any).staticBuffer = mockDevice.createBuffer({ size: 32, usage: 0 });
      (engine as any).simUniformBuffer = mockDevice.createBuffer({ size: 288, usage: 0 });

      await (engine as any).setupPipelines();

      expect(capturedLayoutDescriptor).not.toBeNull();
      const entries = capturedLayoutDescriptor.entries;
      expect(entries.length).toBe(15); // 0 to 14

      const entry11 = entries.find((e: any) => e.binding === 11);
      expect(entry11).toBeDefined();
      expect(entry11.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entry11.texture).toEqual({ sampleType: 'float', viewDimension: '2d' });

      const entry12 = entries.find((e: any) => e.binding === 12);
      expect(entry12).toBeDefined();
      expect(entry12.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entry12.texture).toEqual({ sampleType: 'float', viewDimension: '2d' });
    });

    it('ensures ensureTempTexture and ensureDewpointTexture allocate r16float textures idempotently with 256-byte pitch', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;

      // Ensure temperature texture
      const tempView1 = engine.ensureTempTexture();
      expect(tempView1).toBeDefined();
      expect(mockDevice.textures.length).toBe(1);
      expect(mockDevice.textures[0].format).toBe('r16float');

      // Ensure dewpoint texture
      const dewView1 = engine.ensureDewpointTexture();
      expect(dewView1).toBeDefined();
      expect(mockDevice.textures.length).toBe(2);
      expect(mockDevice.textures[1].format).toBe('r16float');

      // Verify 256-byte row pitch write for both
      expect(mockDevice.queue.writeTextureCalls.length).toBe(2);
      expect(mockDevice.queue.writeTextureCalls[0].dataLayout.bytesPerRow).toBe(256);
      expect(mockDevice.queue.writeTextureCalls[1].dataLayout.bytesPerRow).toBe(256);

      // Idempotency check: multiple calls must not re-allocate
      for (let i = 0; i < 20; i++) {
        expect(engine.ensureTempTexture()).toBe(tempView1);
        expect(engine.ensureDewpointTexture()).toBe(dewView1);
      }
      expect(mockDevice.textures.length).toBe(2);
    });

    it('updates crust uniform float 74 when toggling lclGating', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).isInitialized = true;
      (engine as any).simUniformBuffer = mockDevice.createBuffer({ size: 288, usage: 0 });
      (engine as any).crustUniformBuffer = mockDevice.createBuffer({ size: 320, usage: 0 });
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };

      // Default is true (enabled)
      expect(engine.lclGating).toBe(true);

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 0,
        dt: 0.016,
      });
      const floats = (engine as any).crustFloats as Float32Array;
      // Default: float 74 is 0.0 (gating active)
      expect(floats[74]).toBe(0.0);

      // Call updateUniforms with lclGating: false
      engine.setLclGating(false);
      expect(engine.lclGating).toBe(false);

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 0,
        dt: 0.016,
      });

      // Float 74 is u_lclGating bypass flag (1.0 = bypass / disabled)
      expect(floats[74]).toBe(1.0);

      // Toggle back to true
      engine.setLclGating(true);
      expect(engine.lclGating).toBe(true);

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 0,
        dt: 0.016,
      });
      expect(floats[74]).toBe(0.0);

      // Explicit thermodynamicGating frame param override
      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 0,
        thermodynamicGating: false,
      });
      expect(floats[74]).toBe(1.0);

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 0,
        thermodynamicGating: true,
      });
      expect(floats[74]).toBe(0.0);
    });
  });

  // ==========================================================================
  // Section 7: AtmosphereDrawer UI Component Integration
  // ==========================================================================
  describe('AtmosphereDrawer UI Component Integration', () => {
    const drawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');
    const drawerSrc = fs.readFileSync(drawerPath, 'utf8');

    it('renders Thermodynamic Gating section with default ON state and IDs', () => {
      expect(drawerSrc).toContain('Thermodynamic Gating');
      expect(drawerSrc).toContain('id="sidebar-thermodynamic-gating-on"');
      expect(drawerSrc).toContain('id="sidebar-thermodynamic-gating-off"');
      expect(drawerSrc).toContain('useState<boolean>(true)');
    });

    it('defines handleThermodynamicGatingChange and dispatches window and engine calls', () => {
      expect(drawerSrc).toContain('handleThermodynamicGatingChange');
      expect(drawerSrc).toContain('onThermodynamicGatingChange?.(enabled)');
      expect(drawerSrc).toContain('engine.setLclGating(enabled)');
    });
  });
});
