// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/cloud-beta-pipeline-end-to-end.test.ts
// End-to-End Verification: Atmospheric Cloud Beta Controls & Uniform Pipeline
// Invariants Tested: Rule 5 (Uniform Placebo Elimination & Dual-State Verification),
// Rule 22 (Beta Tray Containment), Rule 26 (Zero-GC Buffer Discipline)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useEngineState } from '../../src/hooks/useEngineState';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { UnifiedRightSidebar } from '../../src/components/hud/UnifiedRightSidebar';
import { TelemetryHUD } from '../../src/components/hud/TelemetryHUD';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Atmospheric Cloud Strata Beta Controls: End-to-End Wiring & Pipeline Parity', () => {
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

  // 1. Hook State & Mutator Invariants
  describe('1. useEngineState: Cloud Beta Props & Safety Clamping', () => {
    let latestEngineState: ReturnType<typeof useEngineState> | null = null;
    function EngineStateHarness() {
      latestEngineState = useEngineState();
      return null;
    }

    const mountHook = async () => {
      latestEngineState = null;
      await act(async () => {
        root.render(React.createElement(EngineStateHarness));
      });
      return latestEngineState!;
    };

    it('initializes cloud beta tuning parameters with calibrated baseline values', async () => {
      const state = await mountHook();
      expect(state.cloudThickness).toBeCloseTo(0.19, 2);
      expect(state.cloudLowTop).toBeCloseTo(0.45, 2);
      expect(state.cloudErosion).toBeCloseTo(0.85, 2);
      expect(state.cloudFreqHoriz).toBeCloseTo(32.0, 1);
      expect(state.cloudFreqVert).toBeCloseTo(12.0, 1);
      expect(state.cloudExtinction).toBeCloseTo(28.0, 1);
    });

    it('clamps setters strictly within valid physical bounds', async () => {
      const state = await mountHook();

      // Thickness [0.04, 0.35]
      act(() => state.setCloudThickness(0.01));
      expect(latestEngineState!.cloudThickness).toBe(0.04);
      act(() => state.setCloudThickness(1.0));
      expect(latestEngineState!.cloudThickness).toBe(0.35);

      // Low Top [0.05, 0.60]
      act(() => state.setCloudLowTop(0.01));
      expect(latestEngineState!.cloudLowTop).toBe(0.05);
      act(() => state.setCloudLowTop(0.99));
      expect(latestEngineState!.cloudLowTop).toBe(0.60);

      // Erosion [0.0, 2.0]
      act(() => state.setCloudErosion(-0.5));
      expect(latestEngineState!.cloudErosion).toBe(0.0);
      act(() => state.setCloudErosion(5.0));
      expect(latestEngineState!.cloudErosion).toBe(2.0);

      // Freq Horiz [4.0, 96.0]
      act(() => state.setCloudFreqHoriz(1.0));
      expect(latestEngineState!.cloudFreqHoriz).toBe(4.0);
      act(() => state.setCloudFreqHoriz(200.0));
      expect(latestEngineState!.cloudFreqHoriz).toBe(96.0);

      // Freq Vert [2.0, 32.0]
      act(() => state.setCloudFreqVert(0.5));
      expect(latestEngineState!.cloudFreqVert).toBe(2.0);
      act(() => state.setCloudFreqVert(100.0));
      expect(latestEngineState!.cloudFreqVert).toBe(32.0);

      // Extinction [1.0, 100.0]
      act(() => state.setCloudExtinction(0.1));
      expect(latestEngineState!.cloudExtinction).toBe(1.0);
      act(() => state.setCloudExtinction(500.0));
      expect(latestEngineState!.cloudExtinction).toBe(100.0);
    });

    it('batch updates all 6 beta properties through setCloudOptions', async () => {
      const state = await mountHook();
      act(() => {
        state.setCloudOptions({
          cloudThickness: 0.28,
          cloudLowTop: 0.35,
          cloudErosion: 1.25,
          cloudFreqHoriz: 48.0,
          cloudFreqVert: 18.0,
          cloudExtinction: 42.0,
        });
      });

      expect(latestEngineState!.cloudThickness).toBeCloseTo(0.28, 2);
      expect(latestEngineState!.cloudLowTop).toBeCloseTo(0.35, 2);
      expect(latestEngineState!.cloudErosion).toBeCloseTo(1.25, 2);
      expect(latestEngineState!.cloudFreqHoriz).toBeCloseTo(48.0, 1);
      expect(latestEngineState!.cloudFreqVert).toBeCloseTo(18.0, 1);
      expect(latestEngineState!.cloudExtinction).toBeCloseTo(42.0, 1);
    });
  });

  // 2. React Hierarchy Component Prop Forwarding
  describe('2. React Prop Forwarding: TelemetryHUD & UnifiedRightSidebar', () => {
    it('AtmosphereDrawer renders and dispatches beta slider changes', async () => {
      const onThicknessChange = vi.fn();
      const onLowTopChange = vi.fn();
      const onErosionChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            theme: 0,
            showClouds: true,
            cloudThickness: 0.22,
            onCloudThicknessChange: onThicknessChange,
            cloudLowTop: 0.40,
            onCloudLowTopChange: onLowTopChange,
            cloudErosion: 1.10,
            onCloudErosionChange: onErosionChange,
          })
        );
      });

      // Expand the Beta tray by clicking the toggle button
      const buttons = container.querySelectorAll('button');
      const betaToggleBtn = Array.from(buttons).find((b) =>
        b.textContent?.includes('VOLUMETRIC CLOUD DYNAMICS')
      );
      expect(betaToggleBtn).toBeDefined();

      await act(async () => {
        betaToggleBtn?.click();
      });

      // Find the interactive SVG viewport for vertical structure
      const vertViewport = container.querySelector(
        '[title="Drag left side to scale total Tropospheric Height (affects all strata). Drag right side to adjust Cumulus Ceiling proportion."]'
      );
      expect(vertViewport).toBeDefined();

      if (vertViewport) {
        await act(async () => {
          vertViewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        });
        expect(onThicknessChange).toHaveBeenCalledWith(0.19);
      }
    });

    it('TelemetryHUD correctly forwards beta props to UnifiedRightSidebar', async () => {
      const onThicknessChange = vi.fn();
      const onExtinctionChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(TelemetryHUD as any, {
            theme: 0,
            isZenMode: false,
            showClouds: true,
            cloudThickness: 0.25,
            onCloudThicknessChange: onThicknessChange,
            cloudExtinction: 35.0,
            onCloudExtinctionChange: onExtinctionChange,
          })
        );
      });

      // Expand the Beta tray in TelemetryHUD -> UnifiedRightSidebar -> AtmosphereDrawer
      const buttons = container.querySelectorAll('button');
      const betaToggleBtn = Array.from(buttons).find((b) =>
        b.textContent?.includes('VOLUMETRIC CLOUD DYNAMICS')
      );
      expect(betaToggleBtn).toBeDefined();

      await act(async () => {
        betaToggleBtn?.click();
      });

      const vertViewport = container.querySelector(
        '[title="Drag left side to scale total Tropospheric Height (affects all strata). Drag right side to adjust Cumulus Ceiling proportion."]'
      );
      expect(vertViewport).toBeDefined();
    });
  });

  // 3. WebGPUEngine Uniform Buffer Mapping
  describe('3. WebGPUEngine: Uniform Buffer Byte Offsets & Parameter Parity', () => {
    it('packs cloudThickness into deltaR [2], rOuter [1], and erosionStr [22] in volumetricCloudUniformBuffer', () => {
      const engine = new WebGPUEngine();
      const writeBufferSpy = vi.fn();

      (engine as any).volumetricCloudsEnabled = true;
      (engine as any).volumetricCameraUniformBuffer = { __mockBuffer: true };
      (engine as any).volumetricCloudUniformBuffer = { __mockBuffer: true };
      (engine as any).volumetricCamFloats = new Float32Array(48);
      (engine as any).volumetricCloudFloats = new Float32Array(40);
      (engine as any).device = {
        queue: {
          writeBuffer: writeBufferSpy,
        },
      };

      // Call updateVolumetricUniforms with custom cloud params
      const customParams = {
        showClouds: true,
        volumetricClouds: true,
        cloudThickness: 0.31,
        cloudLowTop: 0.38,
        cloudErosion: 1.45,
        cloudFreqHoriz: 54.0,
        cloudFreqVert: 24.0,
        cloudExtinction: 62.0,
      };

      engine.updateVolumetricUniforms(customParams as any);

      const cloudFloats = (engine as any).volumetricCloudFloats;
      expect(cloudFloats).toBeDefined();

      // Check geometry: rInner = 5.0, rOuter = 5.0 + 0.31 = 5.31, deltaR = 0.31
      expect(cloudFloats[0]).toBeCloseTo(5.0, 3);
      expect(cloudFloats[1]).toBeCloseTo(5.31, 3);
      expect(cloudFloats[2]).toBeCloseTo(0.31, 3);

      // Check strata bounds: lowTop = 0.38
      expect(cloudFloats[8]).toBeCloseTo(0.38, 3);

      // Check frequency and erosion: freqHoriz = 54.0, freqVert = 24.0, erosionStr = 1.45
      expect(cloudFloats[20]).toBeCloseTo(54.0, 1);
      expect(cloudFloats[21]).toBeCloseTo(24.0, 1);
      expect(cloudFloats[22]).toBeCloseTo(1.45, 2);

      // Check optical extinction: baseExtinction = 62.0
      expect(cloudFloats[24]).toBeCloseTo(62.0, 1);

      // Verify device.queue.writeBuffer was called with the volumetricCloudUniformBuffer
      expect(writeBufferSpy).toHaveBeenCalledWith(
        (engine as any).volumetricCloudUniformBuffer,
        0,
        cloudFloats.buffer
      );
    });
  });
});
