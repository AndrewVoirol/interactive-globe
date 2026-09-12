// ============================================================================
// File: tests/modern/r3-atmosphere-drawer-prognostic-selector.test.ts
// Milestone 3 (R3): AtmosphereDrawer Prognostic Model Backend Selector
// Compliance: Rule 46, Invariant §4 (Single-Border), Invariant §21 (Collapsing)
// ============================================================================

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AtmosphereDrawer, AtmosphereDrawerProps } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Milestone 3 (R3) - AtmosphereDrawer Prognostic Model Selector', () => {
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
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Suite 1: Structural Rendering & Invariant §4 Enclosure Contract
  // --------------------------------------------------------------------------
  describe('1. Structural Rendering & Invariant §4 Enclosure Contract', () => {
    it('DRAWER-01: renders Prognostic Model section when showClouds is true', async () => {
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { showClouds: true }));
      });

      const text = container.textContent || '';
      expect(text).toMatch(/Prognostic Model/i);

      const buttons = Array.from(container.querySelectorAll('button'));
      const gfsBtn = buttons.find((b) => b.textContent?.includes('GFS'));
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'));

      expect(gfsBtn).toBeDefined();
      expect(wnBtn).toBeDefined();
    });

    it('DRAWER-02: strictly satisfies Invariant §4 Single-Border HUD Enclosure Contract', async () => {
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { showClouds: true }));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'));
      const card = wnBtn?.closest('.p-2.rounded-\\[3px\\].border');

      expect(card).not.toBeNull();
      expect(card!.querySelectorAll('.border-current\\/15').length).toBe(0);
      expect(card!.querySelectorAll('.inset-\\[2px\\]').length).toBe(0);
      expect(card!.className).toContain('border-[var(--theme-card-border)]');
    });

    it('DRAWER-03: applies cartographic drafting typography and button grid styling', async () => {
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { showClouds: true }));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'));
      const grid = wnBtn?.parentElement;

      expect(grid).toBeDefined();
      expect(grid!.className).toContain('grid-cols-2');
      expect(grid!.className).toContain('font-mono');
      expect(grid!.className).toContain('text-[10px]');
      expect(grid!.className).toContain('tracking-wider');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: State Toggling & Interaction Callbacks
  // --------------------------------------------------------------------------
  describe('2. State Toggling & Interaction Callbacks', () => {
    it('DRAWER-04: reflects active state classes for controlled prognosticModel prop', async () => {
      // Test GFS active
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
          } as any)
        );
      });

      let buttons = Array.from(container.querySelectorAll('button'));
      let gfsBtn = buttons.find((b) => b.textContent?.includes('GFS'));
      let wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'));

      expect(gfsBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(wnBtn?.className).not.toContain('bg-[var(--theme-control-active-bg)]');

      // Test WeatherNext active
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          } as any)
        );
      });

      buttons = Array.from(container.querySelectorAll('button'));
      gfsBtn = buttons.find((b) => b.textContent?.includes('GFS'));
      wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'));

      expect(wnBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(gfsBtn?.className).not.toContain('bg-[var(--theme-control-active-bg)]');
    });

    it('DRAWER-05: dispatches onPrognosticModelChange when buttons are clicked', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
            onPrognosticModelChange: onChange,
          } as any)
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'))!;
      const gfsBtn = buttons.find((b) => b.textContent?.includes('GFS'))!;

      await act(async () => {
        wnBtn.click();
      });
      expect(onChange).toHaveBeenCalledWith('weathernext3');

      await act(async () => {
        gfsBtn.click();
      });
      expect(onChange).toHaveBeenCalledWith('gfs');
    });

    it('DRAWER-06: dispatches to window bridge without error if hooks are defined', async () => {
      const setBridgeMock = vi.fn();
      (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__ = setBridgeMock;

      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { showClouds: true }));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'))!;

      await act(async () => {
        wnBtn.click();
      });

      expect(setBridgeMock).toHaveBeenCalledWith('weathernext3');
      delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
    });

    it('DRAWER-07: collapses Prognostic Model controls when showClouds is false (Invariant §21)', async () => {
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { showClouds: false }));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'));
      expect(wnBtn).toBeUndefined();
    });
  });
});
