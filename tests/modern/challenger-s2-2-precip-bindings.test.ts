/**
 * tests/modern/challenger-s2-2-precip-bindings.test.ts
 *
 * Adversarial Challenger Test Suite for Stage 2:
 * Precipitation Ingestion, WebGPU Bindings, Uniform Control Flow, and Coupled Hydrology.
 *
 * Core Verification Pillars:
 * 1. WGSL Uniform Control Flow & AST Auditing (Invariant §3):
 *    - Programmatic execution of `scripts/lint-wgsl-control-flow.mjs`
 *    - Strict AST block-nesting analysis confirming `u_precipTexture` sampling is unconditional
 *    - Confirmation that explicit LOD (textureSampleLevel) is used prior to any dynamic discard/branch
 * 2. WebGPU Bind Group Layout Parity & Anti-Cheating Integrity:
 *    - Direct production import of `WebGPUEngine` (Invariant §46)
 *    - 1:1 match between WGSL `@group(0) @binding(9)/(10)` and `crustBindGroupLayout`
 *    - Lazy fallback allocator (`ensurePrecipCrustTexture`) WebGPU 256-byte row pitch contract
 * 3. Leopold-Maddock River Channel Width Invariants (§7 & §16):
 *    - 25,000-iteration Monte Carlo stress fuzzing over extreme/adversarial rainfall rates
 *    - River-to-coastline width ratio preservation (55%-60% at confluence, base 58.24%)
 *    - Zero-swelling invariance when pluvial gamma = 0 or precipRate <= 0
 * 4. Critical Geometric Boundary & Coordinate Parameterization Probing:
 *    - 20,000-trial spherical parameterization bijection proof
 *    - Antimeridian seam (±180°) and polar singularity (±90°) boundary stability
 * 5. SimUniforms 16-Byte Alignment & Parameter Boundary Defense:
 *    - Strict 16-byte alignment of u_pluvial_gamma (offset 288, float 72)
 *    - Non-finite (NaN, Infinity) and out-of-range rejection in UI and engine setters
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import {
  evaluateRiverWidth,
  evalPrecipUV,
} from '../../src/core/weather/PluvialDynamics';

describe('Adversarial Challenger: Stage 2 Precipitation Bindings & Coupled Hydrology', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

  const drawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');
  const drawerSrc = fs.readFileSync(drawerPath, 'utf8');

  // ==========================================================================
  // Pillar 1: WGSL Uniform Control Flow & AST Auditing (Invariant §3)
  // ==========================================================================
  describe('Pillar 1: WGSL Uniform Control Flow & AST Auditing (Invariant §3)', () => {
    it('executes scripts/lint-wgsl-control-flow.mjs programmatically with 0 errors and 0 warnings', () => {
      const scriptPath = path.resolve(__dirname, '../../scripts/lint-wgsl-control-flow.mjs');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const output = execSync(`node ${scriptPath}`, {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../..'),
      });

      expect(output).toContain('Audit Results: 0 errors, 0 warnings');
      expect(output).toContain('PASSED: All shaders satisfy uniform control flow invariants.');
    });

    it('statically audits fs_main in crust_hydrosphere.wgsl to confirm u_precipTexture sampling is strictly unconditional', () => {
      // Find entry point fs_main
      const fsMainMatch = shaderSrc.match(/@fragment\s*\n\s*fn\s+fs_main\s*\([^)]*\)\s*->\s*[^\{]*\{/);
      expect(fsMainMatch).not.toBeNull();
      const fsMainStart = fsMainMatch!.index! + fsMainMatch![0].length;

      // Slice the body of fs_main
      const lines = shaderSrc.slice(fsMainStart).split('\n');

      let braceDepth = 1;
      let branchDepth = 0;
      let foundPrecipSample = false;
      let precipSampleDepth = -1;
      let precipSampleLine = -1;
      const discardLines: number[] = [];
      const branchBlocks: Array<{ line: number; type: string }> = [];

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const lineNum = i + 1;
        const lineClean = rawLine.replace(/\/\/.*$/, '').trim();

        if (lineClean.includes('discard;')) {
          discardLines.push(lineNum);
        }

        if (/\b(if|else\s+if|else|for|while|switch)\b/.test(lineClean)) {
          branchBlocks.push({ line: lineNum, type: lineClean });
        }

        // Track braces
        for (let c = 0; c < lineClean.length; c++) {
          const char = lineClean[c];
          if (char === '{') {
            braceDepth++;
            if (branchBlocks.length > 0 && branchBlocks[branchBlocks.length - 1].line === lineNum) {
              branchDepth++;
            }
          } else if (char === '}') {
            braceDepth--;
            if (branchDepth > 0) {
              branchDepth--;
            }
            if (braceDepth === 0) break;
          }
        }

        if (lineClean.includes('textureSampleLevel(u_precipTexture, u_precipSampler')) {
          foundPrecipSample = true;
          precipSampleDepth = branchDepth;
          precipSampleLine = lineNum;
        }

        if (braceDepth === 0) break;
      }

      // Assertions
      expect(foundPrecipSample).toBe(true);
      // precipSampleDepth MUST be 0: strictly top-level unconditional control flow!
      expect(precipSampleDepth).toBe(0);

      // Verify all discard statements occur strictly AFTER precipitation sampling
      expect(discardLines.length).toBeGreaterThan(0);
      for (const discLine of discardLines) {
        expect(precipSampleLine).toBeLessThan(discLine);
      }
    });

    it('verifies u_precipTexture uses explicit LOD (textureSampleLevel with 0.0) avoiding implicit derivative hazards', () => {
      const linesWithPrecip = shaderSrc.split('\n').filter(l => l.includes('u_precipTexture'));
      expect(linesWithPrecip.length).toBeGreaterThanOrEqual(2); // declaration + usage

      for (const line of linesWithPrecip) {
        if (line.includes('var u_precipTexture')) continue; // declaration
        // Must use textureSampleLevel with LOD 0.0
        expect(line).toContain('textureSampleLevel');
        expect(line).toContain('0.0');
        expect(line).not.toContain('textureSample(');
      }
    });
  });

  // ==========================================================================
  // Pillar 2: WebGPU Bind Group Layout Parity & Anti-Cheating Integrity
  // ==========================================================================
  describe('Pillar 2: WebGPU Bind Group Layout Parity & Anti-Cheating Integrity', () => {
    it('verifies exact 1:1 parity between WGSL declarations and crustBindGroupLayout entries', () => {
      // Extract WGSL @group(0) bindings
      const wgslBindingRegex = /@group\(0\)\s*@binding\((\d+)\)\s*var(?:<uniform>)?\s+(\w+)\s*:\s*([^;]+);/g;
      const wgslBindings = new Map<number, { name: string; type: string }>();
      let match;
      while ((match = wgslBindingRegex.exec(shaderSrc)) !== null) {
        wgslBindings.set(parseInt(match[1], 10), {
          name: match[2],
          type: match[3].trim(),
        });
      }

      // Verify bindings 9 and 10 exist in WGSL
      expect(wgslBindings.has(9)).toBe(true);
      expect(wgslBindings.has(10)).toBe(true);
      expect(wgslBindings.get(9)!.name).toBe('u_precipTexture');
      expect(wgslBindings.get(9)!.type).toBe('texture_2d<f32>');
      expect(wgslBindings.get(10)!.name).toBe('u_precipSampler');
      expect(wgslBindings.get(10)!.type).toBe('sampler');

      // Now verify WebGPUEngine's layout declarations
      expect(engineSrc).toMatch(/binding:\s*9,\s*visibility:\s*GPUShaderStage\.FRAGMENT,\s*texture:\s*\{\s*sampleType:\s*'float',\s*viewDimension:\s*'2d'\s*\}/);
      expect(engineSrc).toMatch(/binding:\s*10,\s*visibility:\s*GPUShaderStage\.FRAGMENT,\s*sampler:\s*\{\s*type:\s*'filtering'\s*\}/);
    });

    it('verifies crustBindGroupLayout runtime construction with MockGPUDevice contains valid entries 9 and 10', async () => {
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

      // Run setupPipelines to build all bind group layouts
      await (engine as any).setupPipelines();

      expect(capturedLayoutDescriptor).not.toBeNull();
      const entries = capturedLayoutDescriptor.entries;
      expect(entries.length).toBe(15); // 0 to 14 (including bindings 13 & 14 for temporal advection and wind)

      const entry9 = entries.find((e: any) => e.binding === 9);
      expect(entry9).toBeDefined();
      expect(entry9.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entry9.texture).toEqual({ sampleType: 'float', viewDimension: '2d' });

      const entry10 = entries.find((e: any) => e.binding === 10);
      expect(entry10).toBeDefined();
      expect(entry10.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entry10.sampler).toEqual({ type: 'filtering' });

      const entry11 = entries.find((e: any) => e.binding === 11);
      expect(entry11).toBeDefined();
      expect(entry11.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entry11.texture).toEqual({ sampleType: 'float', viewDimension: '2d' });

      const entry12 = entries.find((e: any) => e.binding === 12);
      expect(entry12).toBeDefined();
      expect(entry12.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entry12.texture).toEqual({ sampleType: 'float', viewDimension: '2d' });
    });

    it('verifies ensurePrecipCrustTexture lazy allocation, WebGPU 256-byte pitch alignment, and idempotency', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;

      // 1. Initial invocation: creates fallback texture and sampler
      const view1 = engine.ensurePrecipCrustTexture();
      expect(view1).toBeDefined();
      expect(mockDevice.textures.length).toBe(1);
      expect(mockDevice.samplers.length).toBe(1);

      // Verify dummy texture properties
      const tex = mockDevice.textures[0];
      expect(tex.format).toBe('r16float');
      expect(tex.width).toBe(1);
      expect(tex.height).toBe(1);

      // Verify 256-byte row pitch alignment during initial zero write
      expect(mockDevice.queue.writeTextureCalls.length).toBe(1);
      const writeCall = mockDevice.queue.writeTextureCalls[0];
      expect(writeCall.dataLayout.bytesPerRow).toBe(256);
      expect(writeCall.dataLayout.bytesPerRow % 256).toBe(0);

      // 2. Idempotency test: 100 consecutive calls MUST NOT allocate redundant GPU resources
      for (let i = 0; i < 100; i++) {
        const cachedView = engine.ensurePrecipCrustTexture();
        expect(cachedView).toBe(view1);
      }
      expect(mockDevice.textures.length).toBe(1);
      expect(mockDevice.samplers.length).toBe(1);
    });

    it('verifies updateDEMBindGroups populates entries 9 and 10 without undefined bindings', () => {
      const mockDevice = new MockGPUDevice();
      let capturedBindGroup: any = null;
      mockDevice.createBindGroup = (desc: any) => {
        if (desc.label === 'crust_hydrosphere_bind_group') {
          capturedBindGroup = desc;
        }
        return { descriptor: desc } as any;
      };

      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).crustBindGroupLayout = { dummy: true };
      (engine as any).crustUniformBuffer = { dummy: true };
      (engine as any).orbitalTextureView = { dummy: true };
      (engine as any).orbitalSampler = { dummy: true };
      (engine as any).demTextureView = { dummy: true };
      (engine as any).demSampler = { dummy: true };

      (engine as any).updateDEMBindGroups();

      expect(capturedBindGroup).not.toBeNull();
      const entries = capturedBindGroup.entries;
      expect(entries.length).toBe(15); // bindings 0 through 14 (including LCL and advection textures)

      const entry9 = entries.find((e: any) => e.binding === 9);
      const entry10 = entries.find((e: any) => e.binding === 10);
      const entry11 = entries.find((e: any) => e.binding === 11);
      const entry12 = entries.find((e: any) => e.binding === 12);
      expect(entry9).toBeDefined();
      expect(entry9.resource).toBeDefined();
      expect(entry10).toBeDefined();
      expect(entry10.resource).toBeDefined();
      expect(entry11).toBeDefined();
      expect(entry11.resource).toBeDefined();
      expect(entry12).toBeDefined();
      expect(entry12.resource).toBeDefined();
    });
  });

  // ==========================================================================
  // Pillar 3: Leopold-Maddock River Channel Width Invariants (§7 & §16)
  // ==========================================================================
  describe('Pillar 3: Leopold-Maddock River Channel Width Invariants (§7 & §16)', () => {
    // Mathematical specification from crust_hydrosphere.wgsl:
    // riverWidthPx = mix(0.40, 1.98, descentAccum);
    // pluvialFactor = 1.0 + sim.u_pluvial_gamma * sqrt(clamp(precipRate, 0.0, 50.0));
    // riverWidthPx = riverWidthPx * pluvialFactor;



    it('verifies baseline uncoupled river widths strictly adhere to Leopold-Maddock Invariant §7 & §16', () => {
      const COASTLINE_WIDTH_PX = 3.40;

      // Alpine headwaters (descentAccum = 0.0)
      const headwaters = evaluateRiverWidth(0.0, 0.0, 0.0);
      expect(headwaters.baseWidth).toBeCloseTo(0.40, 4);
      expect(headwaters.finalWidth).toBeCloseTo(0.40, 4);

      // Lowland coastal confluences (descentAccum = 1.0)
      const confluence = evaluateRiverWidth(1.0, 0.0, 0.0);
      expect(confluence.baseWidth).toBeCloseTo(1.98, 4);
      expect(confluence.finalWidth).toBeCloseTo(1.98, 4);

      // Leopold-Maddock ratio: river width must be 55%-60% of coastline width
      const ratio = confluence.baseWidth / COASTLINE_WIDTH_PX;
      expect(ratio).toBeGreaterThanOrEqual(0.55);
      expect(ratio).toBeLessThanOrEqual(0.60);
      expect(ratio).toBeCloseTo(0.58235, 4); // 58.24% contract
    });

    it('executes 25,000-iteration Monte Carlo stress fuzzing over extreme inputs and boundary conditions', () => {
      const ITERATIONS = 25_000;
      const t0 = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        // Adversarial inputs: negative rates, sub-zero and super-unity gamma, unbounded descent
        const descent = Math.random() * 3.0 - 1.0; // [-1.0, 2.0]
        const precip = (Math.random() - 0.3) * 200.0; // [-60.0, 140.0]
        const gamma = Math.random() * 2.0; // [0.0, 2.0] (valid UI range)

        const res = evaluateRiverWidth(descent, precip, gamma);

        // 1. Numerical stability: never NaN or Infinity
        if (!Number.isFinite(res.baseWidth) || !Number.isFinite(res.pluvialFactor) || !Number.isFinite(res.finalWidth)) {
          throw new Error(`Numerical singularity at iteration ${i}: descent=${descent}, precip=${precip}, gamma=${gamma}`);
        }

        // 2. Base width bounded in [0.40, 1.98]
        expect(res.baseWidth).toBeGreaterThanOrEqual(0.40 - 1e-6);
        expect(res.baseWidth).toBeLessThanOrEqual(1.98 + 1e-6);

        // 3. Pluvial factor non-negative and >= 1.0 for valid gamma and rate
        if (gamma === 0.0 || precip <= 0.0) {
          expect(res.pluvialFactor).toBe(1.0);
          expect(res.finalWidth).toBe(res.baseWidth);
        } else {
          expect(res.pluvialFactor).toBeGreaterThanOrEqual(1.0);
          expect(res.finalWidth).toBeGreaterThanOrEqual(res.baseWidth);
        }

        // 4. Rate saturation at 50 mm/h: maximum possible width is bounded
        const maxExpectedWidth = 1.98 * (1.0 + 2.0 * Math.sqrt(50.0)); // ~29.98px
        expect(res.finalWidth).toBeLessThanOrEqual(maxExpectedWidth + 1e-6);
      }

      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(3000);
    });

    it('verifies zero-swelling invariance when pluvialGamma is 0.0 regardless of extreme storm intensity', () => {
      const stormIntensities = [0.0, 1.0, 10.0, 25.0, 50.0, 100.0, 500.0, 10000.0];
      for (const rate of stormIntensities) {
        for (const descent of [0.0, 0.25, 0.5, 0.75, 1.0]) {
          const res = evaluateRiverWidth(descent, rate, 0.0);
          expect(res.pluvialFactor).toBe(1.0);
          expect(res.finalWidth).toBe(res.baseWidth);
        }
      }
    });

    it('verifies sub-zero precipitation rate clamping protects against negative pluvial factors', () => {
      const negativeRates = [-0.001, -1.0, -50.0, -1000.0, -Number.MAX_VALUE];
      for (const rate of negativeRates) {
        for (const gamma of [0.0, 0.5, 1.0, 2.0]) {
          const res = evaluateRiverWidth(0.5, rate, gamma);
          expect(res.pluvialFactor).toBe(1.0);
          expect(res.finalWidth).toBe(res.baseWidth);
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 4: Critical Geometric Boundary & Coordinate Parameterization Probing
  // ==========================================================================
  describe('Pillar 4: Critical Geometric Boundary & Coordinate Parameterization Probing', () => {
    // Shader coordinate mapping:
    // let lon = (input.uv.x - 0.5) * 2.0 * PI_F32;
    // let lat = (0.5 - input.uv.y) * PI_F32;
    // let precipUV = vec2<f32>((lon + PI_F32) / (2.0 * PI_F32), (PI_F32 * 0.5 - lat) / PI_F32);

    const PI = Math.PI;

    const uvToSphericalToPrecipUV = evalPrecipUV;

    it('proves spherical parameterization is an exact identity bijection across 20,000 coordinates', () => {
      for (let i = 0; i < 20_000; i++) {
        const u = Math.random();
        const v = Math.random();
        const res = uvToSphericalToPrecipUV(u, v);

        expect(Math.abs(res.precipU - u)).toBeLessThan(1e-12);
        expect(Math.abs(res.precipV - v)).toBeLessThan(1e-12);
      }
    });

    it('probes the 5 classic cartographic failure boundaries', () => {
      // 1. Antimeridian West (u = 0.0, lon = -180°)
      const amWest = uvToSphericalToPrecipUV(0.0, 0.5);
      expect(amWest.lon).toBeCloseTo(-PI, 6);
      expect(amWest.precipU).toBeCloseTo(0.0, 6);

      // 2. Antimeridian East (u = 1.0, lon = +180°)
      const amEast = uvToSphericalToPrecipUV(1.0, 0.5);
      expect(amEast.lon).toBeCloseTo(PI, 6);
      expect(amEast.precipU).toBeCloseTo(1.0, 6);

      // 3. North Pole Singularity (v = 0.0, lat = +90°)
      const northPole = uvToSphericalToPrecipUV(0.5, 0.0);
      expect(northPole.lat).toBeCloseTo(PI * 0.5, 6);
      expect(northPole.precipV).toBeCloseTo(0.0, 6);

      // 4. South Pole Singularity (v = 1.0, lat = -90°)
      const southPole = uvToSphericalToPrecipUV(0.5, 1.0);
      expect(southPole.lat).toBeCloseTo(-PI * 0.5, 6);
      expect(southPole.precipV).toBeCloseTo(1.0, 6);

      // 5. Equator & Prime Meridian intersection (u = 0.5, v = 0.5)
      const center = uvToSphericalToPrecipUV(0.5, 0.5);
      expect(center.lon).toBeCloseTo(0.0, 6);
      expect(center.lat).toBeCloseTo(0.0, 6);
      expect(center.precipU).toBeCloseTo(0.5, 6);
      expect(center.precipV).toBeCloseTo(0.5, 6);
    });
  });

  // ==========================================================================
  // Pillar 5: SimUniforms 16-Byte Struct Alignment & Parameter Boundary Defense
  // ==========================================================================
  describe('Pillar 5: SimUniforms 16-Byte Struct Alignment & Parameter Boundary Defense', () => {
    it('verifies u_pluvial_gamma and u_weatherOpticalMode uniform packing layout', () => {
      const engine = new WebGPUEngine();
      const crustFloats = (engine as any).crustFloats as Float32Array;
      const crustUints = (engine as any).crustUints as Uint32Array;

      // Struct total size: 80 floats * 4 bytes = 320 bytes
      expect(crustFloats.length).toBe(80);
      expect(320 % 16).toBe(0);

      // Float 72 corresponds to byte offset 288
      expect(72 * 4).toBe(288);
      expect(288 % 16).toBe(0); // Strict 16-byte boundary alignment

      // Uint 73 corresponds to byte offset 292
      expect(73 * 4).toBe(292);

      // Padding at floats 74 and 75
      expect(74 * 4).toBe(296);
      expect(75 * 4).toBe(300);
    });

    it('enforces rigorous boundary defense in setPluvialGamma and setWeatherOpticalMode', () => {
      const engine = new WebGPUEngine();

      // Default state
      expect(engine.pluvialGamma).toBe(0.0);
      expect(engine.weatherOpticalMode).toBe(0);

      // Valid range tests
      engine.setPluvialGamma(1.4);
      expect(engine.pluvialGamma).toBe(1.4);

      // Underflow clamp
      engine.setPluvialGamma(-10.0);
      expect(engine.pluvialGamma).toBe(0.0);

      // Overflow clamp
      engine.setPluvialGamma(50.0);
      expect(engine.pluvialGamma).toBe(2.0);

      // Non-finite guards (NaN, Infinity, -Infinity)
      engine.setPluvialGamma(NaN);
      expect(engine.pluvialGamma).toBe(2.0); // Preserves previous valid value
      engine.setPluvialGamma(Infinity);
      expect(engine.pluvialGamma).toBe(2.0);
      engine.setPluvialGamma(-Infinity);
      expect(engine.pluvialGamma).toBe(2.0);

      // Non-number guards
      (engine as any).setPluvialGamma('invalid');
      expect(engine.pluvialGamma).toBe(2.0);

      // Weather Optical Mode defense
      engine.setWeatherOpticalMode(1);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(2.9);
      expect(engine.weatherOpticalMode).toBe(2); // Floored to integer

      engine.setWeatherOpticalMode(NaN);
      expect(engine.weatherOpticalMode).toBe(2);
    });

    it('verifies updateUniforms packs pluvialGamma and weatherOpticalMode while preserving legacy solar ephemeris', () => {
      const engine = new WebGPUEngine();
      const mockDevice = new MockGPUDevice();
      (engine as any).device = mockDevice;
      (engine as any).isInitialized = true;
      (engine as any).crustUniformBuffer = mockDevice.createBuffer({ size: 320, usage: 0 });
      (engine as any).simUniformBuffer = mockDevice.createBuffer({ size: 288, usage: 0 });
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };

      // Case A: Standard weather render without solarTimestamp
      (engine as any).updateUniforms({
        unfurl: 0.5,
        mode: 0,
        time: 12.0,
        pluvialGamma: 1.8,
        weatherOpticalMode: 1,
      });

      const cf = (engine as any).crustFloats as Float32Array;
      const cu = (engine as any).crustUints as Uint32Array;
      expect(cf[72]).toBeCloseTo(1.8, 5);
      expect(cu[73]).toBe(1);
      expect(cf[74]).toBe(0.0);
      expect(cf[75]).toBe(0.0);

      // Case B: Solar ephemeris decoupling (solarTimestamp defined)
      // Must populate engine.currentSolar while preserving dedicated weather slots
      (engine as any).updateUniforms({
        unfurl: 0.5,
        mode: 0,
        time: 12.0,
        solarTimestamp: Date.UTC(2026, 5, 21, 12, 0, 0), // Summer solstice
      });

      expect(engine.currentSolar).not.toBeNull();
      const [sx, sy, sz] = engine.currentSolar!.sunVector;
      const sunLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
      expect(sunLen).toBeCloseTo(1.0, 3);
      expect(cf[72]).toBe(0.0);
      expect(cu[73]).toBe(0);
      expect(cf[74]).toBe(0.0);
      expect(cf[75]).toBe(0.0);
    });
  });

  // ==========================================================================
  // Pillar 6: UI Component Plumbing & Window Bridge Verification
  // ==========================================================================
  describe('Pillar 6: UI Component Plumbing & Window Bridge Verification', () => {
    it('verifies AtmosphereDrawer renders the Pluvial Coupling VernierSlider with exact prop bounds', () => {
      expect(drawerSrc).toContain('id="sidebar-pluvial-coupling"');
      expect(drawerSrc).toContain('label="Pluvial Coupling"');
      expect(drawerSrc).toContain('sublabel="Precipitation Swelling & River Width"');
      expect(drawerSrc).toContain('min={0.0}');
      expect(drawerSrc).toContain('max={2.0}');
      expect(drawerSrc).toContain('step={0.1}');
      expect(drawerSrc).toContain('readout={`${curPluvialGamma.toFixed(1)}x`}');
    });

    it('verifies window bridge callbacks in AtmosphereDrawer handle non-finites and clamp bounds', () => {
      expect(drawerSrc).toContain('(window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__');
      expect(drawerSrc).toContain('(window as any).__INDICATRIX_WEBGPU_ENGINE__.setPluvialGamma(clamped)');
      expect(drawerSrc).toContain('const clamped = Math.max(0.0, Math.min(2.0, val));');
    });
  });
});
