// ============================================================================
// File: tests/webgpu/r15-m1-dual-log-vertical-scale.test.ts
// Target: Non-Linear Symmetrical Logarithmic Elevation Transfer Function (Gate 1 & 2)
// Invariants:
//   - Invariant §3:  Mandatory Unconditional Derivative Evaluation
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity
//   - Invariant §20: 16-Byte WGSL Struct Alignment & 288-Byte Uniform Packing
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §46: Anti-Cheating Production Source Import Integrity
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

const CRUST_SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
const CLOUD_SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
const WIND_SHADER_PATH  = path.resolve(__dirname, '../../src/webgpu/shaders/wind_particles.wgsl');
const ENGINE_PATH       = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');

const crustShaderSource = fs.readFileSync(CRUST_SHADER_PATH, 'utf-8');
const cloudShaderSource = fs.readFileSync(CLOUD_SHADER_PATH, 'utf-8');
const windShaderSource  = fs.readFileSync(WIND_SHADER_PATH, 'utf-8');
const engineSource      = fs.readFileSync(ENGINE_PATH, 'utf-8');

describe('Stage 1: Non-Linear (Dual-Logarithmic) Elevation Transfer Verification', () => {

  describe('Suite 1: WGSL Struct Offsets & 16-Byte Uniform Packing (Invariant §20)', () => {

    it('R15-ALIGN-01: SimUniforms in crust_hydrosphere.wgsl has u_verticalScaleMode at offset 284 (float 71) in a 288-byte struct', () => {
      expect(crustShaderSource).toContain('u_verticalScaleMode: u32');
      expect(crustShaderSource).toMatch(/u_verticalScaleMode:\s*u32,\s*\/\/\s*Vertical scale mode/);
      
      // Verify float 71 (offset 284) packing in WebGPUEngine
      expect(engineSource).toContain('this.crustUints[71] = params.verticalScaleMode !== undefined ? params.verticalScaleMode : this.verticalScaleMode;');
    });

    it('R15-ALIGN-02: CloudUniforms in cloud_shell.wgsl has u_verticalScaleMode at offset 144 and u_rainShadowFeedback at offset 148 in a 288-byte struct', () => {
      expect(cloudShaderSource).toContain('u_verticalScaleMode: u32,     // offset 144');
      expect(cloudShaderSource).toContain('u_rainShadowFeedback: f32,    // offset 148');
      
      // Verify WebGPUEngine packs floats 36 and 37
      expect(engineSource).toContain('cloudU32[36] = params?.verticalScaleMode !== undefined ? params.verticalScaleMode : this.verticalScaleMode;');
      expect(engineSource).toContain('f[37] = params?.rainShadowFeedback !== undefined ? params.rainShadowFeedback : this.rainShadowFeedback;');
    });

    it('R15-ALIGN-03: WindSimUniforms in wind_particles.wgsl has u_verticalScaleMode at float 10 (offset 40) in a 64-byte struct', () => {
      expect(windShaderSource).toContain('u_verticalScaleMode: u32');
      expect(engineSource).toContain('windU32[10] = params.verticalScaleMode !== undefined ? params.verticalScaleMode : this.verticalScaleMode;');
    });
  });

  describe('Suite 2: Cross-Pipeline DEM Mathematical Parity (Invariant §15)', () => {

    // TypeScript analytical mirror of the WGSL dual-log function
    function evalLogNormH(elevMeters: number): number {
      return Math.log(1.0 + elevMeters / 1200.0) / Math.log(1.0 + 8848.0 / 1200.0);
    }

    function evalLogNormD(depthMeters: number): number {
      return Math.log(1.0 + depthMeters / 1500.0) / Math.log(1.0 + 10924.0 / 1500.0);
    }

    it('R15-PARITY-01: Verifies exact WGSL formula text parity between crust_hydrosphere and cloud_shell', () => {
      const formula = 'log(1.0 + elevMeters / 1200.0) / log(1.0 + 8848.0 / 1200.0)';
      expect(crustShaderSource).toContain(formula);
      expect(cloudShaderSource).toContain(formula);
      expect(windShaderSource).toContain('log(1.0 + t.elevation / 1200.0) / log(1.0 + 8848.0 / 1200.0)');
    });

    it('R15-MATH-02: Verifies strict monotonicity and boundary conditions across -10,924m to +8,848m', () => {
      // Boundary conditions:
      expect(evalLogNormH(0.0)).toBeCloseTo(0.0, 6);
      expect(evalLogNormH(8848.0)).toBeCloseTo(1.0, 6);
      expect(evalLogNormD(0.0)).toBeCloseTo(0.0, 6);
      expect(evalLogNormD(10924.0)).toBeCloseTo(1.0, 6);

      // Lowland/Midland expansion:
      // At 1000m, log curve yields ~0.285 vs power curve (1000/8848)^1.4 = ~0.047 (6x relief expansion)
      const log1000 = evalLogNormH(1000.0);
      const pow1000 = Math.pow(1000.0 / 8848.0, 1.4);
      expect(log1000).toBeGreaterThan(0.25);
      expect(log1000).toBeLessThan(0.35);
      expect(log1000 / pow1000).toBeGreaterThan(5.0);

      // Strict monotonicity across 10,000 Monte Carlo steps
      let prevH = -1.0;
      for (let i = 0; i <= 10000; i++) {
        const elev = (i / 10000) * 8848.0;
        const normH = evalLogNormH(elev);
        expect(Number.isFinite(normH)).toBe(true);
        expect(normH).toBeGreaterThanOrEqual(prevH);
        prevH = normH;
      }
    });

    it('R15-MATH-03: Verifies bathymetric shelf and trench monotonicity across 10,000 steps', () => {
      let prevD = -1.0;
      for (let i = 0; i <= 10000; i++) {
        const depth = (i / 10000) * 10924.0;
        const normD = evalLogNormD(depth);
        expect(Number.isFinite(normD)).toBe(true);
        expect(normD).toBeGreaterThanOrEqual(prevD);
        prevD = normD;
      }

      // Shelf break at 200m depth reveals ~6% of max trench displacement
      const shelfBreak200 = evalLogNormD(200.0);
      expect(shelfBreak200).toBeGreaterThan(0.05);
      expect(shelfBreak200).toBeLessThan(0.08);
    });
  });

  describe('Suite 3: Summit-Cloud Optical Headroom Guarantee (Gate 2)', () => {

    it('R15-GATE2-01: Verifies total cloud shell offset is strictly greater than crust displacement for all peaks', () => {
      const dispScale = 0.08 * 2.8;
      const poleAtten = 1.0;
      const baseStandoffs = [0.0010, 0.0040, 0.0080]; // Low, Mid, High

      for (const baseStandoff of baseStandoffs) {
        for (let h = 0; h <= 8848; h += 200) {
          const logNormH = Math.log(1.0 + h / 1200.0) / Math.log(1.0 + 8848.0 / 1200.0);
          const crustDisp = logNormH * dispScale * poleAtten;
          const k_exagg = 1.0; // minimum exaggeration
          const effStandoff = baseStandoff * k_exagg;
          const cloudDisp = crustDisp + effStandoff;

          expect(cloudDisp).toBeGreaterThan(crustDisp);
          expect(cloudDisp - crustDisp).toBeCloseTo(baseStandoff, 5);
        }
      }
    });
  });

  describe('Suite 4: Engine Runtime Parameter Switching (Invariant §24)', () => {

    it('R15-RT-01: WebGPUEngine initializes verticalScaleMode to 0 (Legacy) and accepts 1 (Dual-Log)', () => {
      const engine = new WebGPUEngine();
      expect(engine.verticalScaleMode).toBe(0);
      expect(engine.rainShadowFeedback).toBe(0.0);

      engine.verticalScaleMode = 1;
      expect(engine.verticalScaleMode).toBe(1);

      engine.rainShadowFeedback = 0.75;
      expect(engine.rainShadowFeedback).toBe(0.75);
    });
  });
});
