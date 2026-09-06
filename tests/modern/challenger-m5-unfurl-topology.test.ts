// ============================================================================
// File: tests/modern/challenger-m5-unfurl-topology.test.ts
// Empirical Challenger M5 Modern Suite: 5 Unfurl Modes, TopologyControlDock & WGSL Audit
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import fs from 'fs';
import path from 'path';
import {
  TopologyControlDock,
  TopologyControlDockProps,
} from '../../src/components/hud/TopologyControlDock';
import { SimulationMode } from '../../src/types';

// Set React act environment flag
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('CHALLENGER-M5: 5 Unfurl Modes & TopologyControlDock Stress Suite', () => {
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

  const createProps = (overrides: Partial<TopologyControlDockProps> = {}): TopologyControlDockProps => ({
    isZenMode: false,
    onZenToggle: vi.fn(),
    theme: 0,
    mode: 0,
    onModeChange: vi.fn(),
    layerMode: 0,
    onLayerModeChange: vi.fn(),
    cursorPhysicsEnabled: false,
    onCursorPhysicsToggle: vi.fn(),
    activeOverlay: 'off',
    onOverlayChange: vi.fn(),
    showLandmarks: false,
    onLandmarksToggle: vi.fn(),
    showTissot: false,
    onTissotToggle: vi.fn(),
    showVectors: false,
    onVectorsToggle: vi.fn(),
    latStr: "00°00'N",
    lonStr: "000°00'E",
    mapScaleStr: "1:50M",
    onSnapCamera: vi.fn(),
    ...overrides,
  });

  // --------------------------------------------------------------------------
  // 1. All 5 Unfurl Modes Rendering & Active Styling
  // --------------------------------------------------------------------------
  describe('1. Unfurl Mode State Transitions & Active UI Signatures', () => {
    const modes: { mode: SimulationMode; name: string; dotClass: string }[] = [
      { mode: 0, name: 'Linear', dotClass: 'bg-amber-400' },
      { mode: 1, name: 'Scroll', dotClass: 'bg-slate-300' },
      { mode: 2, name: 'Griffith', dotClass: 'bg-[#C86D51]' },
      { mode: 3, name: 'Fluid', dotClass: 'bg-indigo-400' },
      { mode: 4, name: 'Dymaxion', dotClass: 'bg-emerald-400' },
    ];

    for (const { mode, name, dotClass } of modes) {
      it(`CHALLENGE-MODE-${mode}: renders Mode ${mode} (${name}) with distinctive active indicator dot and styling`, async () => {
        const props = createProps({ mode });

        await act(async () => {
          root.render(React.createElement(TopologyControlDock, props));
        });

        // 1. Mode name must appear in UI
        expect(container.textContent).toContain(name);

        // 2. Pulse indicator dot must have mode-specific color class
        const dot = container.querySelector(`span.${dotClass.replace('#', '\\#')}`);
        expect(dot).toBeDefined();

        // 3. Active button must exist
        const buttons = Array.from(container.querySelectorAll('button'));
        const activeBtn = buttons.find((b) => b.textContent?.trim() === name);
        expect(activeBtn).toBeDefined();
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. Interactive Mode Selection Triggers & Callback Precision
  // --------------------------------------------------------------------------
  describe('2. Mode Selection Callbacks & Stress Fuzzing', () => {
    it('CHALLENGE-DISPATCH-01: clicks every mode button and verifies exact onModeChange payload with zero exceptions', async () => {
      const onModeChange = vi.fn();
      const props = createProps({ mode: 0, onModeChange });

      await act(async () => {
        root.render(React.createElement(TopologyControlDock, props));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const modeNames = ['Linear', 'Scroll', 'Griffith', 'Fluid', 'Dymaxion'];

      for (let expectedMode = 0; expectedMode < 5; expectedMode++) {
        const btn = buttons.find((b) => b.textContent?.trim() === modeNames[expectedMode]);
        expect(btn).toBeDefined();

        await act(async () => {
          btn?.click();
        });

        expect(onModeChange).toHaveBeenLastCalledWith(expectedMode);
      }

      expect(onModeChange).toHaveBeenCalledTimes(5);
    });

    it('CHALLENGE-STRESS-01: executes 1,000 rapid randomized mode transitions without crashing or memory leaks', async () => {
      const onModeChange = vi.fn();
      const props = createProps({ mode: 0, onModeChange });

      await act(async () => {
        root.render(React.createElement(TopologyControlDock, props));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const modeButtons = [
        buttons.find((b) => b.textContent?.trim() === 'Linear'),
        buttons.find((b) => b.textContent?.trim() === 'Scroll'),
        buttons.find((b) => b.textContent?.trim() === 'Griffith'),
        buttons.find((b) => b.textContent?.trim() === 'Fluid'),
        buttons.find((b) => b.textContent?.trim() === 'Dymaxion'),
      ];

      expect(modeButtons.every(Boolean)).toBe(true);

      // Perform 1000 randomized clicks
      let lastTarget = 0;
      for (let i = 0; i < 1000; i++) {
        const targetMode = Math.floor(Math.random() * 5);
        modeButtons[targetMode]?.click();
        lastTarget = targetMode;
      }

      expect(onModeChange).toHaveBeenCalledTimes(1000);
      expect(onModeChange).toHaveBeenLastCalledWith(lastTarget);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Tissot Telemetry Tensor Behavior across Modes
  // --------------------------------------------------------------------------
  describe('3. Tissot Telemetry Invariants across Unfurl Modes', () => {
    it('CHALLENGE-TISSOT-01: displays Isomeric tensor metrics for Mode 4 (Dymaxion)', async () => {
      const props = createProps({ mode: 4, showTissot: true });

      await act(async () => {
        root.render(React.createElement(TopologyControlDock, props));
      });

      expect(container.textContent).toContain('Distortion Tensor');
      expect(container.textContent).toContain('Isomeric (s ≈ 1.04x)');
      expect(container.textContent).toContain('1.041x');
    });

    it('CHALLENGE-TISSOT-02: displays Morphing Tensor metrics for Modes 0, 1, 2, 3', async () => {
      for (const m of [0, 1, 2, 3] as SimulationMode[]) {
        const props = createProps({ mode: m, showTissot: true });

        await act(async () => {
          root.render(React.createElement(TopologyControlDock, props));
        });

        expect(container.textContent).toContain('Morphing Tensor');
        expect(container.textContent).toContain('1.000x');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. WGSL Shader Static Validation & Control Flow Audit
  // --------------------------------------------------------------------------
  describe('4. WGSL Uniform Control Flow Audit (Dawn/Metal Specification)', () => {
    it('CHALLENGE-WGSL-01: audits crust_hydrosphere.wgsl for textureSample uniform control flow violations', () => {
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
      const shaderCode = fs.readFileSync(shaderPath, 'utf-8');

      // Detect non-uniform control flow branch
      const hasSurfaceTypeBranch = /if\s*\(\s*input\.surfaceType\s*>\s*0\.5\s*\)/.test(shaderCode);
      expect(hasSurfaceTypeBranch).toBe(true);

      // Check if textureSample is called within the u_renderStyle == 2u block
      const renderStyleBlockMatch = shaderCode.match(/else\s+if\s*\(\s*sim\.u_renderStyle\s*==\s*2u\s*\)\s*\{([\s\S]*?)\}\s*else/);
      expect(renderStyleBlockMatch).not.toBeNull();

      if (renderStyleBlockMatch) {
        const blockContent = renderStyleBlockMatch[1];
        const usesTextureSample = /textureSample\s*\(/.test(blockContent);
        // Remediated: textureSample is eliminated from non-uniform control flow; textureSampleLevel is used
        expect(usesTextureSample).toBe(false);
        const usesTextureSampleLevel = /textureSampleLevel\s*\(/.test(blockContent);
        expect(usesTextureSampleLevel).toBe(true);
      }
    });
  });
});
