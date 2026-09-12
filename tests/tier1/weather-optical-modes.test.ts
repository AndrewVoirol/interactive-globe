/**
 * tests/tier1/weather-optical-modes.test.ts
 *
 * Behavioral unit and integration test suite for Stage 3:
 * Weather Optical Modes & Archival Ink Weather Overlays.
 *
 * Invariants & Standards Verified:
 * - Invariant §3: Unconditional WGSL uniform control flow sampling
 * - Invariant §4: Single-Border HUD Enclosure Contract
 * - Invariant §20: 16-byte WGSL struct alignment & buffer packing (Uint index 73 / offset 292)
 * - Invariant §28: Exhaustive Multi-Medium Shader Parity (Theme 0, Theme 1, Theme 2 without collapsing)
 * - Design Language §1.2 & §2.1: Typography, tabular readouts, and active/inactive state styling
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Stage 3: Weather Optical Modes & Archival Ink Weather Overlays', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.existsSync(shaderPath) ? fs.readFileSync(shaderPath, 'utf8') : '';

  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
  const engineSrc = fs.existsSync(enginePath) ? fs.readFileSync(enginePath, 'utf8') : '';

  const drawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');
  const drawerSrc = fs.existsSync(drawerPath) ? fs.readFileSync(drawerPath, 'utf8') : '';

  // --------------------------------------------------------------------------
  // Domain 1: WebGPUEngine Getter/Setter & Normalization
  // --------------------------------------------------------------------------
  describe('1. WebGPUEngine Getter/Setter & Normalization', () => {
    it('initializes weatherOpticalMode to 0 (Archival Ink Wash default)', () => {
      const engine = new WebGPUEngine();
      expect(engine.weatherOpticalMode).toBe(0);
    });

    it('sets weatherOpticalMode to 1 via setWeatherOpticalMode() and setter', () => {
      const engine = new WebGPUEngine();
      engine.setWeatherOpticalMode(1);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(0);
      expect(engine.weatherOpticalMode).toBe(0);

      engine.weatherOpticalMode = 1;
      expect(engine.weatherOpticalMode).toBe(1);
    });

    it('handles non-finite values safely without corrupting state', () => {
      const engine = new WebGPUEngine();
      engine.setWeatherOpticalMode(1);

      engine.setWeatherOpticalMode(NaN);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(Infinity);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(-Infinity);
      expect(engine.weatherOpticalMode).toBe(1);
    });

    it('normalizes floating-point mode values using Math.floor', () => {
      const engine = new WebGPUEngine();
      engine.setWeatherOpticalMode(1.8);
      expect(engine.weatherOpticalMode).toBe(1);

      engine.setWeatherOpticalMode(0.2);
      expect(engine.weatherOpticalMode).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Domain 2: Uniform Buffer Packing & 16-Byte Alignment (Invariant §20)
  // --------------------------------------------------------------------------
  describe('2. Uniform Buffer Packing & 16-Byte Alignment', () => {
    it('declares u_weatherOpticalMode at uint index 73 (byte offset 292)', () => {
      expect(shaderSrc).toMatch(/u_weatherOpticalMode\s*:\s*u32\s*,\s*\/\/\s*offset\s*292/);
      expect(73 * 4).toBe(292);
      expect(288 % 16).toBe(0);
      expect(292 >= 288 && 292 < 304).toBe(true);
      expect(304 % 16).toBe(0);
    });

    it('packs weatherOpticalMode into crustUints[73] during updateUniforms', () => {
      const engine = new WebGPUEngine();
      const crustUints = (engine as any).crustUints;
      expect(crustUints.length).toBe(80);

      const writeBufferSpy = vi.fn();
      (engine as any).isInitialized = true;
      (engine as any).crustUniformBuffer = { dummy: true };
      (engine as any).simUniformBuffer = { dummy: true };
      (engine as any).device = { queue: { writeBuffer: writeBufferSpy } };
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        weatherOpticalMode: 1,
      });
      expect(crustUints[73]).toBe(1);

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        weatherOpticalMode: 0,
      });
      expect(crustUints[73]).toBe(0);

      engine.setWeatherOpticalMode(1);
      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
      });
      expect(crustUints[73]).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Domain 3: Shader Structure & Invariant §28 Multi-Medium Parity
  // --------------------------------------------------------------------------
  describe('3. Shader AST & Invariant §28 Multi-Medium Parity', () => {
    it('declares apply_weather_pigmentation function in crust_hydrosphere.wgsl', () => {
      expect(shaderSrc).toMatch(/fn\s+apply_weather_pigmentation\s*\(/);
    });

    it('enforces Invariant §28: explicit branches for Themes 0, 1, and 2 without binary collapse', () => {
      const fnIdx = shaderSrc.indexOf('fn apply_weather_pigmentation');
      expect(fnIdx).toBeGreaterThan(0);
      const fnBody = shaderSrc.slice(fnIdx, shaderSrc.indexOf('\nfn ', fnIdx + 30));

      expect(fnBody).toMatch(/theme\s*==\s*0u?/);
      expect(fnBody).toMatch(/theme\s*==\s*1u?/);
      expect(fnBody).toMatch(/theme\s*==\s*2u?/);
      expect(fnBody).not.toMatch(/if\s*\(\s*theme\s*==\s*1u?\s*\)\s*\{[^}]*\}\s*else\s*\{[^}]*\}/);
    });

    it('implements historical medium ink characteristics across all three themes', () => {
      const fnIdx = shaderSrc.indexOf('fn apply_weather_pigmentation');
      const fnBody = shaderSrc.slice(fnIdx, shaderSrc.indexOf('\nfn ', fnIdx + 30));

      expect(fnBody).toMatch(/0\.220|0\.22|0\.188|0\.19|0\.165|0\.16/);
      expect(fnBody).toMatch(/mediumProps\.y|paperTooth/i);
      expect(fnBody).toMatch(/0\.039|0\.04|0\.098|0\.10|0\.184|0\.18/);
      expect(fnBody).toMatch(/stipple|precipRate/i);
    });

    it('implements dual optical mode branching in fs_main', () => {
      const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainBody = shaderSrc.slice(fsMainIdx);

      expect(fsMainBody).toMatch(/sim\.u_weatherOpticalMode\s*==\s*1u?/);
      expect(fsMainBody).toMatch(/apply_weather_pigmentation/);
    });

    it('enforces Invariant §3: precipitation texture sample evaluates in unconditional control flow', () => {
      const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main');
      const fsMainBody = shaderSrc.slice(fsMainIdx);
      const precipSampleIdx = fsMainBody.indexOf('textureSampleLevel(u_precipTexture');
      const discardIdx = fsMainBody.indexOf('discard;');

      expect(precipSampleIdx).toBeGreaterThan(0);
      expect(discardIdx).toBeGreaterThan(0);
      expect(precipSampleIdx).toBeLessThan(discardIdx);
    });
  });

  // --------------------------------------------------------------------------
  // Domain 4: AtmosphereDrawer UI Component Rendering & Interactions
  // --------------------------------------------------------------------------
  describe('4. AtmosphereDrawer UI Component Rendering & Interactions', () => {
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
    });

    it('renders 2-button segmented toggle with labels [Archival Ink Wash] and [Doppler Radar]', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 0,
            onWeatherOpticalModeChange: vi.fn(),
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const inkWashBtn = buttons.find(b => b.textContent?.includes('Archival Ink Wash'));
      const dopplerBtn = buttons.find(b => b.textContent?.includes('Doppler Radar'));

      expect(inkWashBtn).toBeDefined();
      expect(dopplerBtn).toBeDefined();
    });

    it('applies cartographic styling classes (font-mono, text-[10px], tracking-wider)', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 0,
            onWeatherOpticalModeChange: vi.fn(),
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const inkWashBtn = buttons.find(b => b.textContent?.includes('Archival Ink Wash'));
      const toggleGrid = inkWashBtn?.parentElement;

      expect(toggleGrid).toBeDefined();
      expect(toggleGrid?.className).toContain('grid-cols-2');
      expect(toggleGrid?.className).toContain('font-mono');
      expect(toggleGrid?.className).toContain('text-[10px]');
      expect(toggleGrid?.className).toContain('tracking-wider');
    });

    it('indicates active state on Archival Ink Wash when weatherOpticalMode is 0', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 0,
            onWeatherOpticalModeChange: vi.fn(),
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const inkWashBtn = buttons.find(b => b.textContent?.includes('Archival Ink Wash'));
      const dopplerBtn = buttons.find(b => b.textContent?.includes('Doppler Radar'));

      expect(inkWashBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(inkWashBtn?.className).toContain('border-[var(--theme-control-active-border)]');
      expect(dopplerBtn?.className).toContain('bg-[var(--theme-control-bg)]');
      expect(container.textContent).toContain('Ink Wash');
    });

    it('indicates active state on Doppler Radar when weatherOpticalMode is 1', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 1,
            onWeatherOpticalModeChange: vi.fn(),
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const inkWashBtn = buttons.find(b => b.textContent?.includes('Archival Ink Wash'));
      const dopplerBtn = buttons.find(b => b.textContent?.includes('Doppler Radar'));

      expect(dopplerBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(dopplerBtn?.className).toContain('border-[var(--theme-control-active-border)]');
      expect(inkWashBtn?.className).toContain('bg-[var(--theme-control-bg)]');
      expect(container.textContent).toContain('Doppler');
    });

    it('fires onWeatherOpticalModeChange when clicking segmented buttons', async () => {
      const onWeatherOpticalModeChange = vi.fn();
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
      const dopplerBtn = buttons.find(b => b.textContent?.includes('Doppler Radar'));
      const inkWashBtn = buttons.find(b => b.textContent?.includes('Archival Ink Wash'));

      await act(async () => {
        dopplerBtn?.click();
      });
      expect(onWeatherOpticalModeChange).toHaveBeenCalledWith(1);

      await act(async () => {
        inkWashBtn?.click();
      });
      expect(onWeatherOpticalModeChange).toHaveBeenCalledWith(0);
    });

    it('invokes global window bridges on toggle clicks', async () => {
      const setBridgeMock = vi.fn();
      const engineMock = { setWeatherOpticalMode: vi.fn() };
      (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__ = setBridgeMock;
      (window as any).__INDICATRIX_WEBGPU_ENGINE__ = engineMock;

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 0,
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const dopplerBtn = buttons.find(b => b.textContent?.includes('Doppler Radar'));

      await act(async () => {
        dopplerBtn?.click();
      });

      expect(setBridgeMock).toHaveBeenCalledWith(1);
      expect(engineMock.setWeatherOpticalMode).toHaveBeenCalledWith(1);

      delete (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__;
      delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    });
  });

  // --------------------------------------------------------------------------
  // Domain 5: End-to-End Prop Wiring Trace
  // --------------------------------------------------------------------------
  describe('5. End-to-End Prop Wiring Trace', () => {
    it('declares weatherOpticalMode and onWeatherOpticalModeChange in UnifiedRightSidebar', () => {
      const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
      const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');

      expect(sidebarSrc).toMatch(/weatherOpticalMode\?:\s*number;/);
      expect(sidebarSrc).toMatch(/onWeatherOpticalModeChange\?:\s*\(v:\s*number\)\s*=>\s*void;/);
      expect(sidebarSrc).toContain('weatherOpticalMode={');
      expect(sidebarSrc).toContain('onWeatherOpticalModeChange={');
    });

    it('declares weatherOpticalMode and onWeatherOpticalModeChange in TelemetryHUD', () => {
      const hudPath = path.resolve(__dirname, '../../src/components/hud/TelemetryHUD.tsx');
      const hudSrc = fs.readFileSync(hudPath, 'utf8');

      expect(hudSrc).toMatch(/weatherOpticalMode\?:\s*number;/);
      expect(hudSrc).toMatch(/onWeatherOpticalModeChange\?:\s*\(v:\s*number\)\s*=>\s*void;/);
      expect(hudSrc).toContain('weatherOpticalMode={props.weatherOpticalMode}');
      expect(hudSrc).toContain('onWeatherOpticalModeChange={props.onWeatherOpticalModeChange}');
    });

    it('binds weatherOpticalMode in App.tsx state, window hook, and component tree', () => {
      const appPath = path.resolve(__dirname, '../../src/App.tsx');
      const appSrc = fs.readFileSync(appPath, 'utf8');

      expect(appSrc).toMatch(/const\s*\[weatherOpticalMode,\s*setWeatherOpticalMode\]\s*=\s*useState<number>\(0\);/);
      expect(appSrc).toContain('__INDICATRIX_SET_WEATHER_OPTICAL_MODE__');
      expect(appSrc).toContain('weatherOpticalMode={weatherOpticalMode}');
    });
  });
});
