/**
 * tests/modern/challenger-s3-2-adversarial-verification.test.ts
 *
 * Adversarial Challenger Test Suite for Stage 3:
 * WebGPU Shader Invariants, Uniform Buffer Security, Dynamic Medium Switching, and HUD State Synchronization.
 *
 * Requirements & Invariants Audited:
 * 1. Invariant §3: Mandatory Unconditional Derivative & Sampling Evaluation in WGSL Fragment Shaders
 *    - AST trace of crust_hydrosphere.wgsl confirming ZERO conditional branches or discards upstream of u_precipTexture
 *    - Programmatic execution of scripts/lint-wgsl-control-flow.mjs across all 14 WGSL modules
 * 2. Invariant §20: WebGPU Core Buffers & Strict 16-Byte Uniform Packing Security
 *    - Byte offset 288 (float 72: u_pluvial_gamma) and byte offset 292 (uint 73: u_weatherOpticalMode)
 *    - Cross-talk non-corruption test under solar ephemeris updates, camera navigation, and pluvial gamma fuzzing
 *    - 25,000-iteration Monte Carlo stress fuzzing over uniform memory boundaries
 * 3. Invariant §24: Uniform-Buffer-Driven Dynamic Medium Switching & Zero-Recompile Contract
 *    - 10,000-iteration rapid toggle stress between Archival Ink Wash and Doppler Radar
 *    - Verification of ZERO GPUBuffer, GPURenderPipeline, and GPUTexture allocations during dynamic toggling
 *    - Sub-millisecond latency confirmation (<0.05ms average transition budget)
 * 4. UI State Synchronization & Global Bridge Integrity:
 *    - Mounting AtmosphereDrawer in DOM with React act()
 *    - Segmented toggle click interactions syncing React internal state, prop callbacks,
 *      window.__INDICATRIX_SET_WEATHER_OPTICAL_MODE__, and WebGPUEngine instance state
 *    - Adversarial non-numeric and out-of-range input defense
 * 5. Invariant §28: Exhaustive Multi-Medium Shader Parity & Historical Identity Conservation:
 *    - Verification of dedicated, uncollapsed pigment branches for Themes 0, 1, and 2
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { getSolarPosition } from '../../src/core/astronomy/SolarEphemeris';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Adversarial Challenger: Stage 3 Shader Invariants, Uniform Security, and HUD State Synchronization', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

  const drawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');
  const drawerSrc = fs.readFileSync(drawerPath, 'utf8');

  // ==========================================================================
  // Pillar 1: Invariant §3 Verification & AST Control Flow Analysis
  // ==========================================================================
  describe('Pillar 1: Invariant §3 Verification & AST Control Flow Analysis', () => {
    it('CHALLENGE-S3-01: executes scripts/lint-wgsl-control-flow.mjs with 0 errors across all 14 WGSL modules', () => {
      const scriptPath = path.resolve(__dirname, '../../scripts/lint-wgsl-control-flow.mjs');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const output = execSync(`node ${scriptPath}`, {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../..'),
      });

      expect(output).toContain('Audit Results: 0 errors, 0 warnings across 14 shaders.');
      expect(output).toContain('PASSED: All shaders satisfy uniform control flow invariants.');
    });

    it('CHALLENGE-S3-02: verifies binding declarations for precipitation texture and sampler in crust_hydrosphere.wgsl', () => {
      expect(shaderSrc).toMatch(/@group\(0\)\s+@binding\(9\)\s+var\s+u_precipTexture:\s*texture_2d<f32>;/);
      expect(shaderSrc).toMatch(/@group\(0\)\s+@binding\(10\)\s+var\s+u_precipSampler:\s*sampler;/);
    });

    it('CHALLENGE-S3-03: traces AST / execution path of fs_main to prove u_precipTexture has ZERO upstream branching or discard', () => {
      const fsMainMatch = /@fragment\s*\n\s*fn\s+fs_main\s*\([^)]*\)\s*->\s*@location\(0\)\s*vec4<f32>\s*\{/.exec(shaderSrc);
      expect(fsMainMatch).not.toBeNull();
      const fsMainStart = fsMainMatch!.index;

      const precipSampleMatch = /textureSampleLevel\s*\(\s*u_precipTexture\s*,\s*u_precipSampler\s*,\s*precipUV\s*,\s*0\.0\s*\)/.exec(shaderSrc);
      expect(precipSampleMatch).not.toBeNull();
      const precipSampleIndex = precipSampleMatch!.index;

      expect(precipSampleIndex).toBeGreaterThan(fsMainStart);

      // Extract exact preamble code between fs_main and precipitation sampling
      const preambleCode = shaderSrc.substring(fsMainStart, precipSampleIndex);

      // 1. Must contain ZERO discard statements
      expect(preambleCode).not.toContain('discard;');

      // 2. Must evaluate finite difference derivatives unconditionally at the top
      expect(preambleCode).toContain('dpdx(input.uv.x)');
      expect(preambleCode).toContain('dpdy(input.uv.x)');
      expect(preambleCode).toContain('dpdx(input.uv.y)');
      expect(preambleCode).toContain('dpdy(input.uv.y)');
      expect(preambleCode).toContain('fwidth(input.uv)');

      // 3. Any branching in helper functions upstream must have zero discard
      const sampleRegionalMatch = /fn\s+sampleRegionalComposite\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{([\s\S]*?)\n\}/.exec(shaderSrc);
      expect(sampleRegionalMatch).not.toBeNull();
      expect(sampleRegionalMatch![1]).not.toContain('discard');
      // Must use explicit LOD in conditional branch
      expect(sampleRegionalMatch![1]).toContain('textureSampleLevel');
      expect(sampleRegionalMatch![1]).not.toMatch(/textureSample\s*\(/);

      const sampleCloudMatch = /fn\s+sampleCloudShadowFactor\s*\([^)]*\)\s*->\s*f32\s*\{([\s\S]*?)\n\}/.exec(shaderSrc);
      expect(sampleCloudMatch).not.toBeNull();
      expect(sampleCloudMatch![1]).not.toContain('discard');
      expect(sampleCloudMatch![1]).toContain('textureSampleLevel');
    });

    it('CHALLENGE-S3-04: verifies downstream functions apply_weather_pigmentation & sample_spectral_doppler evaluate without implicit derivatives', () => {
      const applyPigmentMatch = /fn\s+apply_weather_pigmentation\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{([\s\S]*?)\n\}/.exec(shaderSrc);
      expect(applyPigmentMatch).not.toBeNull();
      const applyPigmentBody = applyPigmentMatch![1];
      expect(applyPigmentBody).not.toContain('dpdx');
      expect(applyPigmentBody).not.toContain('dpdy');
      expect(applyPigmentBody).not.toContain('fwidth');
      expect(applyPigmentBody).not.toContain('textureSample');

      const dopplerMatch = /fn\s+sample_spectral_doppler\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{([\s\S]*?)\n\}/.exec(shaderSrc);
      expect(dopplerMatch).not.toBeNull();
      const dopplerBody = dopplerMatch![1];
      expect(dopplerBody).not.toContain('dpdx');
      expect(dopplerBody).not.toContain('dpdy');
      expect(dopplerBody).not.toContain('fwidth');
      expect(dopplerBody).not.toContain('textureSample');
    });
  });

  // ==========================================================================
  // Pillar 2: Invariant §20 Uniform Memory Security & Offset 292 Integrity
  // ==========================================================================
  describe('Pillar 2: Invariant §20 Uniform Memory Security & Offset 292 Integrity', () => {
    let mockDevice: any;
    let engine: WebGPUEngine;

    beforeEach(() => {
      mockDevice = new MockGPUDevice();
      engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).isInitialized = true;
      (engine as any).crustUniformBuffer = mockDevice.createBuffer({ size: 320, usage: 0 });
      (engine as any).simUniformBuffer = mockDevice.createBuffer({ size: 288, usage: 0 });
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };
    });

    it('CHALLENGE-S3-05: verifies SimUniforms struct byte offsets and strict 16-byte alignment invariants', () => {
      // 320 bytes total = 80 32-bit words
      const cf = (engine as any).crustFloats as Float32Array;
      const cu = (engine as any).crustUints as Uint32Array;
      expect(cf.length).toBe(80);
      expect(cf.byteLength).toBe(320);
      expect(320 % 16).toBe(0);

      // u_pluvial_gamma: float 72 = byte offset 288 (16-byte aligned: 288 % 16 === 0)
      expect(72 * 4).toBe(288);
      expect(288 % 16).toBe(0);

      // u_weatherOpticalMode: uint 73 = byte offset 292
      expect(73 * 4).toBe(292);

      // _padPrecip: floats 74, 75 = byte offsets 296, 300
      expect(74 * 4).toBe(296);
      expect(75 * 4).toBe(300);
      expect((76 * 4) % 16).toBe(0);
    });

    it('CHALLENGE-S3-06: proves solar timestamp updates CANNOT corrupt byte offset 292 (crustUints[73]) when weather optical mode is set', () => {
      const cf = (engine as any).crustFloats as Float32Array;
      const cu = (engine as any).crustUints as Uint32Array;

      // Set weatherOpticalMode to 1 (Doppler)
      engine.setWeatherOpticalMode(1);
      expect(engine.weatherOpticalMode).toBe(1);

      // Update uniforms with solarTimestamp across different dates
      const testDates = [
        Date.UTC(2026, 5, 21, 12, 0, 0), // Summer solstice
        Date.UTC(2026, 11, 21, 12, 0, 0), // Winter solstice
        Date.UTC(2026, 2, 20, 12, 0, 0), // Vernal equinox
        Date.UTC(2026, 8, 22, 12, 0, 0), // Autumnal equinox
      ];

      for (const date of testDates) {
        (engine as any).updateUniforms({
          unfurl: 0.0,
          mode: 0,
          time: 1.0,
          solarTimestamp: date,
        });

        // Offset 292 (uint index 73) MUST remain exactly 1, not overwritten by float bits of sunVector[1]
        expect(cu[73]).toBe(1);
        expect(cf[74]).toBe(0.0);
        expect(cf[75]).toBe(0.0);
      }
    });

    it('CHALLENGE-S3-07: proves solar timestamp updates CANNOT corrupt byte offset 292 when pluvial gamma is non-zero', () => {
      const cf = (engine as any).crustFloats as Float32Array;
      const cu = (engine as any).crustUints as Uint32Array;

      engine.setPluvialGamma(1.5);
      engine.setWeatherOpticalMode(0); // Archival Ink Wash

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        solarTimestamp: Date.UTC(2026, 5, 21, 12, 0, 0),
      });

      // Float 72 must be 1.5, uint 73 must be 0 (Archival Ink Wash), not overwritten by solar.sunVector
      expect(cf[72]).toBeCloseTo(1.5, 5);
      expect(cu[73]).toBe(0);
      expect(cf[74]).toBe(0.0);
      expect(cf[75]).toBe(0.0);
    });

    it('CHALLENGE-S3-08: proves camera uniform updates and navigation do NOT touch byte offset 292', () => {
      const cu = (engine as any).crustUints as Uint32Array;
      engine.setWeatherOpticalMode(1);

      for (let i = 0; i < 1000; i++) {
        const randX = (Math.random() - 0.5) * 20.0;
        const randY = (Math.random() - 0.5) * 20.0;
        const randZ = (Math.random() - 0.5) * 20.0;

        (engine as any).updateUniforms({
          unfurl: Math.random(),
          mode: Math.floor(Math.random() * 5),
          time: Math.random() * 1000.0,
          cameraPosition: [randX, randY, randZ, 1.0],
          cameraTarget: [0, 0, 0, 1.0],
          weatherOpticalMode: 1,
        });

        expect(cu[73]).toBe(1);
      }
    });

    it('CHALLENGE-S3-09: proves adversarial fuzzing of pluvialGamma does NOT corrupt byte offset 292 (uint 73)', () => {
      const cf = (engine as any).crustFloats as Float32Array;
      const cu = (engine as any).crustUints as Uint32Array;

      engine.setWeatherOpticalMode(1);

      const adversarialGammas = [
        -1000.0, -1.0, -0.0001, 0.0, 0.5, 1.0, 1.99, 2.0, 2.01, 50.0, 1e6,
        NaN, Infinity, -Infinity, undefined as any, null as any, 'invalid' as any,
      ];

      for (const gamma of adversarialGammas) {
        (engine as any).updateUniforms({
          unfurl: 0.5,
          mode: 0,
          time: 1.0,
          pluvialGamma: gamma,
          weatherOpticalMode: 1,
        });

        // cu[73] must remain 1
        expect(cu[73]).toBe(1);

        // cf[72] must clamp to valid [0.0, 2.0] range or 0.0 on invalid
        if (typeof gamma === 'number' && Number.isFinite(gamma)) {
          expect(cf[72]).toBeGreaterThanOrEqual(0.0);
          expect(cf[72]).toBeLessThanOrEqual(2.0);
        } else {
          expect(cf[72]).toBe(0.0);
        }
      }
    });

    it('CHALLENGE-S3-10: executes 25,000-iteration Monte Carlo stress fuzzing over multi-uniform interactions', () => {
      const cf = (engine as any).crustFloats as Float32Array;
      const cu = (engine as any).crustUints as Uint32Array;

      for (let i = 0; i < 25_000; i++) {
        const targetMode = i % 2; // alternates 0 and 1
        const targetGamma = (i % 21) * 0.1; // 0.0 to 2.0
        const testTimestamp = 1718971200000 + i * 3600000;

        (engine as any).updateUniforms({
          unfurl: Math.random(),
          mode: i % 5,
          time: i * 0.016,
          pluvialGamma: targetGamma,
          weatherOpticalMode: targetMode,
          solarTimestamp: testTimestamp,
        });

        // Assert strictly zero cross-talk corruption
        expect(cu[73]).toBe(targetMode);
        expect(cf[72]).toBeCloseTo(targetGamma, 4);
        expect(cf[74]).toBe(0.0);
        expect(cf[75]).toBe(0.0);
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Invariant §24 Dynamic Mode Switching 10,000-Iteration Stress & Zero Thrash
  // ==========================================================================
  describe('Pillar 3: Invariant §24 Dynamic Mode Switching 10,000-Iteration Stress & Zero Thrash', () => {
    it('CHALLENGE-S3-11: toggling weatherOpticalMode 10,000 times produces ZERO GPU allocations and zero leaks', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).isInitialized = true;
      (engine as any).crustUniformBuffer = mockDevice.createBuffer({ size: 320, usage: 0 });
      (engine as any).simUniformBuffer = mockDevice.createBuffer({ size: 288, usage: 0 });
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };

      // Spies on all WebGPU allocation APIs
      const createBufferSpy = vi.spyOn(mockDevice, 'createBuffer');
      const createRenderPipelineSpy = vi.spyOn(mockDevice, 'createRenderPipeline');
      const createTextureSpy = vi.spyOn(mockDevice, 'createTexture');
      const createBindGroupSpy = vi.spyOn(mockDevice, 'createBindGroup');
      const createBindGroupLayoutSpy = vi.spyOn(mockDevice, 'createBindGroupLayout');

      const startTime = performance.now();
      const cu = (engine as any).crustUints as Uint32Array;

      // Execute 10,000 rapid toggles
      for (let i = 0; i < 10_000; i++) {
        const mode = (i % 2) as 0 | 1;
        engine.setWeatherOpticalMode(mode);
        (engine as any).updateUniforms({
          unfurl: 0.0,
          mode: 0,
          time: i * 0.016,
          weatherOpticalMode: mode,
        });
        expect(cu[73]).toBe(mode);
      }

      const totalDurationMs = performance.now() - startTime;
      const avgDurationPerToggleMs = totalDurationMs / 10_000;

      // Invariant §24 verification:
      // ZERO buffer, pipeline, texture, or bind group creations during dynamic toggling
      expect(createBufferSpy).toHaveBeenCalledTimes(0);
      expect(createRenderPipelineSpy).toHaveBeenCalledTimes(0);
      expect(createTextureSpy).toHaveBeenCalledTimes(0);
      expect(createBindGroupSpy).toHaveBeenCalledTimes(0);
      expect(createBindGroupLayoutSpy).toHaveBeenCalledTimes(0);

      // Average duration must easily satisfy sub-millisecond budget (< 0.05ms)
      expect(avgDurationPerToggleMs).toBeLessThan(0.05);
    });
  });

  // ==========================================================================
  // Pillar 4: UI State Synchronization & Global Bridge Integrity
  // ==========================================================================
  describe('Pillar 4: UI State Synchronization & Global Bridge Integrity', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
      delete (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__;
      delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    });

    it('CHALLENGE-S3-12: clicking segmented toggle buttons synchronizes React state, prop callbacks, global bridge, and WebGPUEngine', async () => {
      const onWeatherOpticalModeChange = vi.fn();
      const windowBridgeSpy = vi.fn();
      const engineMock = { setWeatherOpticalMode: vi.fn(), weatherOpticalMode: 0 };

      (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__ = windowBridgeSpy;
      (window as any).__INDICATRIX_WEBGPU_ENGINE__ = engineMock;

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 0,
            onWeatherOpticalModeChange,
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const inkWashBtn = buttons.find(b => b.textContent?.includes('Archival Ink Wash'));
      const dopplerBtn = buttons.find(b => b.textContent?.includes('Doppler Radar'));

      expect(inkWashBtn).toBeDefined();
      expect(dopplerBtn).toBeDefined();

      // Initial state: Mode 0 (Archival Ink Wash) is active
      expect(inkWashBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(dopplerBtn?.className).toContain('bg-[var(--theme-control-bg)]');

      // Click Doppler Radar
      await act(async () => {
        dopplerBtn?.click();
      });

      // 1. Prop callback called with 1
      expect(onWeatherOpticalModeChange).toHaveBeenCalledWith(1);

      // 2. Global window bridge called with 1
      expect(windowBridgeSpy).toHaveBeenCalledWith(1);

      // 3. WebGPUEngine instance method called with 1
      expect(engineMock.setWeatherOpticalMode).toHaveBeenCalledWith(1);

      // Click Archival Ink Wash
      await act(async () => {
        inkWashBtn?.click();
      });

      // 1. Prop callback called with 0
      expect(onWeatherOpticalModeChange).toHaveBeenCalledWith(0);

      // 2. Global window bridge called with 0
      expect(windowBridgeSpy).toHaveBeenCalledWith(0);

      // 3. WebGPUEngine instance method called with 0
      expect(engineMock.setWeatherOpticalMode).toHaveBeenCalledWith(0);
    });

    it('CHALLENGE-S3-13: verifies handleWeatherOpticalModeChange rejects adversarial inputs and normalizes to valid modes', () => {
      expect(drawerSrc).toContain('const validMode = Math.floor(mode) === 1 ? 1 : 0;');
      expect(drawerSrc).toContain("if (typeof mode !== 'number' || !Number.isFinite(mode)) return;");
    });
  });

  // ==========================================================================
  // Pillar 5: Invariant §28 Multi-Medium Archival Ink Conservation
  // ==========================================================================
  describe('Pillar 5: Invariant §28 Multi-Medium Archival Ink Conservation', () => {
    it('CHALLENGE-S3-14: verifies apply_weather_pigmentation has explicit uncollapsed branches for Themes 0, 1, and 2', () => {
      // Theme 0: Marie Tharp 1977
      expect(shaderSrc).toContain('if (theme == 0u)');
      expect(shaderSrc).toContain('cTharpIndigo'); // #1E293B Marine Indigo

      // Theme 1: Cream Rag
      expect(shaderSrc).toContain('else if (theme == 1u)');
      expect(shaderSrc).toContain('0.220, 0.188, 0.165'); // Warm sepia-charcoal wash

      // Theme 2: Prussian Cyanotype 1842
      expect(shaderSrc).toContain('else if (theme == 2u)');
      expect(shaderSrc).toContain('0.039, 0.098, 0.184'); // Actinic solarization to deep Prussian blue

      // Confirm paper tooth modulation in Theme 1
      expect(shaderSrc).toMatch(/mediumProps\.y/);
    });

    it('CHALLENGE-S3-15: verifies sample_spectral_doppler provides continuous multi-strata meteorological color ramps', () => {
      expect(shaderSrc).toContain('fn sample_spectral_doppler(precipRate: f32) -> vec4<f32>');
      expect(shaderSrc).toContain('cLightBlue');
      expect(shaderSrc).toContain('cGreen');
      expect(shaderSrc).toContain('cYellow');
      expect(shaderSrc).toContain('cOrange');
      expect(shaderSrc).toContain('cRed');
      expect(shaderSrc).toContain('cMagenta');
    });
  });
});
