// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m2-1-behavioral.test.ts
// Challenger 1: Behavioral Adversarial Verification for Milestone 2 (R2)
// Atmospheric Cross-Section Column Instrument (AtmosphericColumnInstrument)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  AtmosphericColumnInstrument,
  AtmosphericColumnInstrumentProps,
} from '../../src/components/hud/instruments/AtmosphericColumnInstrument';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 1: AtmosphericColumnInstrument Behavioral Adversarial Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  // Global window bridge mocks
  let mockSetCloudOptions: ReturnType<typeof vi.fn>;
  let mockSetAtmosphericScale: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockSetCloudOptions = vi.fn();
    mockSetAtmosphericScale = vi.fn();

    (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = mockSetCloudOptions;
    (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__ = mockSetAtmosphericScale;

    // Mock Element pointer capture API if missing in happy-dom
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = vi.fn();
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = vi.fn();
    }
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
    delete (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__;
    vi.restoreAllMocks();
  });

  // Helper to mock getBoundingClientRect for viewport
  const mockViewportRect = (viewport: HTMLElement, rect = { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 }) => {
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(rect as any);
  };

  // ==========================================================================
  // OBJECTIVE 1: POINTER CAPTURE DRAGGING & STRICT BOUNDS CLAMPING [1.0, 12.0]
  // ==========================================================================
  describe('1. Pointer Capture Dragging & Bounds Clamping [1.0, 12.0]', () => {
    it('CHALLENGE-M2-01: invokes setPointerCapture on pointerdown and releasePointerCapture on pointerup', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      const setCaptureSpy = vi.spyOn(viewport, 'setPointerCapture');
      const releaseCaptureSpy = vi.spyOn(viewport, 'releasePointerCapture');

      // Pointer down
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 42;
        downEvent.clientX = 100;
        downEvent.clientY = 150;
        viewport.dispatchEvent(downEvent);
      });

      expect(setCaptureSpy).toHaveBeenCalledWith(42);

      // Pointer up
      await act(async () => {
        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.pointerId = 42;
        upEvent.clientX = 100;
        upEvent.clientY = 150;
        viewport.dispatchEvent(upEvent);
      });

      expect(releaseCaptureSpy).toHaveBeenCalledWith(42);
    });

    it('CHALLENGE-M2-02: dragging far above top bound (clientY << rect.top) clamps strictly to 12.0', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 });

      // Pointer down at center
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 1;
        downEvent.clientX = 150;
        downEvent.clientY = 150;
        viewport.dispatchEvent(downEvent);
      });

      // Drag far beyond top (-5000px)
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 1;
        moveEvent.clientX = 150;
        moveEvent.clientY = -5000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onScaleChange).toHaveBeenCalledWith(12.0);
    });

    it('CHALLENGE-M2-03: dragging far below bottom bound (clientY >> rect.bottom) clamps strictly to 1.0', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 });

      // Pointer down
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 1;
        downEvent.clientX = 150;
        downEvent.clientY = 150;
        viewport.dispatchEvent(downEvent);
      });

      // Drag far beyond bottom (+8000px)
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 1;
        moveEvent.clientX = 150;
        moveEvent.clientY = 8000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onScaleChange).toHaveBeenCalledWith(1.0);
    });

    it('CHALLENGE-M2-04: drag threshold ignores micro-movements <= 3px', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 });

      // Pointer down at 150, 150
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 1;
        downEvent.clientX = 150;
        downEvent.clientY = 150;
        viewport.dispatchEvent(downEvent);
      });

      // Micro-move of 2px
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 1;
        moveEvent.clientX = 152;
        moveEvent.clientY = 152;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onScaleChange).not.toHaveBeenCalled();
    });

    it('CHALLENGE-M2-05: drag operation does NOT trigger stratum toggle on pointerup even if fast (< 350ms)', async () => {
      const onToggleStrata = vi.fn();
      const onScaleChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata,
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 });

      // Pointer down
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 1;
        downEvent.clientX = 150;
        downEvent.clientY = 150;
        viewport.dispatchEvent(downEvent);
      });

      // Move 20px (clearly > 3px threshold)
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 1;
        moveEvent.clientX = 150;
        moveEvent.clientY = 130;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onScaleChange).toHaveBeenCalled();

      // Fast pointerup
      await act(async () => {
        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.pointerId = 1;
        upEvent.clientX = 150;
        upEvent.clientY = 130;
        viewport.dispatchEvent(upEvent);
      });

      // Stratum toggle must NOT have been called because it was a drag, not a click
      expect(onToggleStrata).not.toHaveBeenCalled();
    });

    it('CHALLENGE-M2-06: pointercancel event cleanly terminates dragging state', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 });

      // Pointer down
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 1;
        downEvent.clientX = 150;
        downEvent.clientY = 150;
        viewport.dispatchEvent(downEvent);
      });

      // Pointer cancel
      await act(async () => {
        const cancelEvent = new Event('pointercancel', { bubbles: true }) as any;
        cancelEvent.pointerId = 1;
        viewport.dispatchEvent(cancelEvent);
      });

      // Subsequent move should not trigger scale change because dragging has stopped
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 1;
        moveEvent.clientX = 150;
        moveEvent.clientY = 50;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onScaleChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // OBJECTIVE 2: RAPID STRATA CLICKS & WINDOW BRIDGE DISPATCHES
  // ==========================================================================
  describe('2. Rapid Strata Clicks & Layer Toggles', () => {
    it('CHALLENGE-M2-07: quick click on viewport regions toggles corresponding stratum band', async () => {
      const onToggleStrata = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata,
            onAtmosphericScaleChange: vi.fn(),
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 });

      // Click high stratum: relY = (120 - 100) / 100 = 0.20 (< 0.40)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.clientX = 150;
        downEvent.clientY = 120;
        viewport.dispatchEvent(downEvent);

        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.clientX = 150;
        upEvent.clientY = 120;
        viewport.dispatchEvent(upEvent);
      });
      expect(onToggleStrata).toHaveBeenLastCalledWith('high', false);

      // Click mid stratum: relY = (155 - 100) / 100 = 0.55 (0.40 - 0.70)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.clientX = 150;
        downEvent.clientY = 155;
        viewport.dispatchEvent(downEvent);

        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.clientX = 150;
        upEvent.clientY = 155;
        viewport.dispatchEvent(upEvent);
      });
      expect(onToggleStrata).toHaveBeenLastCalledWith('mid', false);

      // Click low stratum: relY = (185 - 100) / 100 = 0.85 (>= 0.70)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.clientX = 150;
        downEvent.clientY = 185;
        viewport.dispatchEvent(downEvent);

        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.clientX = 150;
        upEvent.clientY = 185;
        viewport.dispatchEvent(upEvent);
      });
      expect(onToggleStrata).toHaveBeenLastCalledWith('low', false);
    });

    it('CHALLENGE-M2-08: dedicated strata toggle buttons toggle low, mid, high accurately', async () => {
      const onToggleStrata = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata,
            onAtmosphericScaleChange: vi.fn(),
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const lowBtn = buttons.find((b) => b.textContent?.includes('LOW 1–2 km') || b.title?.includes('Low Stratus'));
      const midBtn = buttons.find((b) => b.textContent?.includes('MID 4–6 km') || b.title?.includes('Mid Altocumulus'));
      const highBtn = buttons.find((b) => b.textContent?.includes('HIGH 10–12 km') || b.title?.includes('High Cirrus'));

      expect(lowBtn).toBeDefined();
      expect(midBtn).toBeDefined();
      expect(highBtn).toBeDefined();

      await act(async () => {
        lowBtn!.click();
      });
      expect(onToggleStrata).toHaveBeenLastCalledWith('low', false);

      await act(async () => {
        midBtn!.click();
      });
      expect(onToggleStrata).toHaveBeenLastCalledWith('mid', false);

      await act(async () => {
        highBtn!.click();
      });
      expect(onToggleStrata).toHaveBeenLastCalledWith('high', false);
    });

    it('CHALLENGE-M2-09: rapid sequential clicks in AtmosphereDrawer fire __INDICATRIX_SET_CLOUD_OPTIONS__ with strata updates', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const lowBtn = buttons.find((b) => b.title?.includes('Low Stratus'));
      const midBtn = buttons.find((b) => b.title?.includes('Mid Altocumulus'));
      const highBtn = buttons.find((b) => b.title?.includes('High Cirrus'));

      expect(lowBtn).toBeDefined();
      expect(midBtn).toBeDefined();
      expect(highBtn).toBeDefined();

      // Rapid succession toggles (50 alternating clicks)
      await act(async () => {
        for (let i = 0; i < 15; i++) {
          lowBtn!.click();
          midBtn!.click();
          highBtn!.click();
        }
      });

      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showCloudLow: false });
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showCloudMid: false });
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showCloudHigh: false });
    });
  });

  // ==========================================================================
  // OBJECTIVE 3: DOUBLE-CLICK RESET TO CALIBRATED DEFAULTS
  // ==========================================================================
  describe('3. Double-Click Reset & Default Restoration', () => {
    it('CHALLENGE-M2-10: viewport double-click restores scale 3.5, opacity 0.80, and active strata', async () => {
      const onScaleChange = vi.fn();
      const onOpacityChange = vi.fn();
      const onToggleStrata = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: false,
            showCloudMid: false,
            showCloudHigh: false,
            atmosphericScale: 10.5,
            cloudOpacity: 0.25,
            onToggleStrata,
            onAtmosphericScaleChange: onScaleChange,
            onCloudOpacityChange: onOpacityChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(onScaleChange).toHaveBeenCalledWith(3.5);
      expect(onOpacityChange).toHaveBeenCalledWith(0.80);
      expect(onToggleStrata).toHaveBeenCalledWith('low', true);
      expect(onToggleStrata).toHaveBeenCalledWith('mid', true);
      expect(onToggleStrata).toHaveBeenCalledWith('high', true);
    });

    it('CHALLENGE-M2-11: footer [RESET] button performs identical reset without viewport interaction', async () => {
      const onScaleChange = vi.fn();
      const onOpacityChange = vi.fn();
      const onToggleStrata = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: false,
            showCloudMid: true,
            showCloudHigh: false,
            atmosphericScale: 8.0,
            cloudOpacity: 0.40,
            onToggleStrata,
            onAtmosphericScaleChange: onScaleChange,
            onCloudOpacityChange: onOpacityChange,
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const resetBtn = buttons.find((b) => b.textContent?.includes('[RESET]'));
      expect(resetBtn).toBeDefined();

      await act(async () => {
        resetBtn!.click();
      });

      expect(onScaleChange).toHaveBeenCalledWith(3.5);
      expect(onOpacityChange).toHaveBeenCalledWith(0.80);
      expect(onToggleStrata).toHaveBeenCalledWith('low', true);
      expect(onToggleStrata).toHaveBeenCalledWith('high', true);
      // Mid was already true, so redundant call avoided
      expect(onToggleStrata).not.toHaveBeenCalledWith('mid', true);
    });

    it('CHALLENGE-M2-12: reset handles omitted onCloudOpacityChange gracefully without throwing', async () => {
      const onScaleChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 5.0,
            cloudOpacity: 0.50,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
            // onCloudOpacityChange intentionally undefined
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      expect(() => {
        act(() => {
          viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        });
      }).not.toThrow();

      expect(onScaleChange).toHaveBeenCalledWith(3.5);
    });
  });

  // ==========================================================================
  // OBJECTIVE 4: KEYBOARD ARROW NAVIGATION & PRECISE COARSE/FINE STEPPING
  // ==========================================================================
  describe('4. Keyboard Arrow Navigation (ArrowUp/Down, Shift, Left/Right, Home/End)', () => {
    it('CHALLENGE-M2-13: ArrowUp and ArrowDown step scale by 0.1, Shift steps by 1.0', async () => {
      const onScaleChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // ArrowUp normal (+0.1)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(3.6);

      // ArrowDown normal (-0.1)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(3.4);

      // Shift+ArrowUp coarse (+1.0)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(4.5);

      // Shift+ArrowDown coarse (-1.0)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(2.5);
    });

    it('CHALLENGE-M2-14: ArrowRight and ArrowLeft step opacity by 0.05, Shift steps by 0.10', async () => {
      const onOpacityChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: vi.fn(),
            onCloudOpacityChange: onOpacityChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // ArrowRight normal (+0.05)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenLastCalledWith(0.85);

      // ArrowLeft normal (-0.05)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenLastCalledWith(0.75);

      // Shift+ArrowRight coarse (+0.10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenLastCalledWith(0.90);

      // Shift+ArrowLeft coarse (-0.10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenLastCalledWith(0.70);
    });

    it('CHALLENGE-M2-15: Home key jumps scale to 1.0, End key jumps to 12.0', async () => {
      const onScaleChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 6.2,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(1.0);

      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(12.0);
    });

    it('CHALLENGE-M2-16: Arrow navigation strictly clamps at boundaries with Shift and normal steps', async () => {
      const onScaleChange = vi.fn();
      const onOpacityChange = vi.fn();

      // At upper boundaries (scale 11.5, opacity 0.96)
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 11.5,
            cloudOpacity: 0.96,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
            onCloudOpacityChange: onOpacityChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // Shift+ArrowUp from 11.5 clamps to 12.0
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(12.0);

      // Shift+ArrowRight from 0.96 clamps to 1.0
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenLastCalledWith(1.0);

      // Re-render at lower boundaries (scale 1.5, opacity 0.14)
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 1.5,
            cloudOpacity: 0.14,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
            onCloudOpacityChange: onOpacityChange,
          })
        );
      });

      // Shift+ArrowDown from 1.5 clamps to 1.0
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenLastCalledWith(1.0);

      // Shift+ArrowLeft from 0.14 clamps to 0.10
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenLastCalledWith(0.10);
    });
  });

  // ==========================================================================
  // OBJECTIVE 5: 3-MEDIUM ADAPTIVE SVG ARTIFACTS & CARTOGRAPHIC IDENTITY
  // ==========================================================================
  describe('5. 3-Medium Adaptive SVG Artifacts & Invariant Compliance', () => {
    it('CHALLENGE-M2-17: renders distinctive medium-adaptive SVG artifacts for Tharp, Cream, and Cyanotype', async () => {
      // Theme 0: Marie Tharp (Acoustic sounding trace, LCL inversion ceiling, sonar echoes)
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            theme: 0,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: vi.fn(),
          })
        );
      });
      expect(container.querySelector('.acoustic-trace-tharp')).not.toBeNull();
      expect(container.textContent).toContain('INVERSION CEILING (LCL)');
      expect(container.textContent).toContain('CIRRUS SHIELD');

      // Theme 1: Cream Rag (Victorian meteorological engravings, Luke Howard 1803 Latin taxonomy)
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            theme: 1,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: vi.fn(),
          })
        );
      });
      expect(container.querySelector('.strata-engraving-cream')).not.toBeNull();
      expect(container.textContent).toContain('Cirrus (10–12 km)');
      expect(container.textContent).toContain('Alto-cumulus (4–6 km)');
      expect(container.textContent).toContain('Stratus (1–2 km)');

      // Theme 2: Prussian Cyanotype (1976 Standard Atmosphere isobaric graph paper, radiosonde track)
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            theme: 2,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: vi.fn(),
          })
        );
      });
      expect(container.querySelector('.isobar-grid-cyanotype')).not.toBeNull();
      expect(container.textContent).toContain('150hPa');
      expect(container.textContent).toContain('250hPa');
      expect(container.textContent).toContain('850hPa');
      expect(container.textContent).toContain('JET / CIRRUS');
    });

    it('CHALLENGE-M2-18: satisfies Single-Border HUD Enclosure Contract and Tabular Numerals', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 4.8,
            cloudOpacity: 0.72,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: vi.fn(),
          })
        );
      });

      // Single-border enclosure
      const card = container.firstElementChild as HTMLElement;
      expect(card.classList.contains('border')).toBe(true);
      expect(card.classList.contains('rounded-[3px]')).toBe(true);

      // Invariant §4: Zero nested inner neatlines
      expect(container.querySelectorAll('.border-current\\/15').length).toBe(0);
      expect(container.querySelectorAll('.inset-\\[2px\\]').length).toBe(0);

      // Invariant: Tabular numbers on readouts
      const tabulars = container.querySelectorAll('.tabular-nums');
      expect(tabulars.length).toBeGreaterThanOrEqual(2);
      expect(container.textContent).toContain('4.8x');
      expect(container.textContent).toContain('72%');

      // WAI-ARIA slider semantics
      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport.getAttribute('aria-valuemin')).toBe('1');
      expect(viewport.getAttribute('aria-valuemax')).toBe('12');
      expect(viewport.getAttribute('aria-valuenow')).toBe('4.8');
      expect(viewport.getAttribute('tabIndex')).toBe('0');
    });
  });

  // ==========================================================================
  // OBJECTIVE 6: MONTE CARLO FUZZING & DEGENERATE INPUT RESILIENCE
  // ==========================================================================
  describe('6. Monte Carlo Fuzzing & Degenerate Input Resilience', () => {
    it('CHALLENGE-M2-19: 1,000-trial Monte Carlo pointer fuzzing confirms scale is strictly clamped in [1.0, 12.0] with zero NaNs', async () => {
      const onScaleChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.80,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 200, left: 50, right: 330, width: 280, height: 100 });

      // Start drag
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.clientX = 150;
        downEvent.clientY = 150;
        viewport.dispatchEvent(downEvent);
      });

      // 1,000 extreme random clientY coordinates from -100,000 to +100,000
      for (let i = 0; i < 1000; i++) {
        const randomY = (Math.random() - 0.5) * 200000;
        await act(async () => {
          const moveEvent = new Event('pointermove', { bubbles: true }) as any;
          moveEvent.clientX = 150;
          moveEvent.clientY = randomY;
          viewport.dispatchEvent(moveEvent);
        });

        const lastCallVal = onScaleChange.mock.calls[onScaleChange.mock.calls.length - 1][0];
        expect(Number.isFinite(lastCallVal)).toBe(true);
        expect(Number.isNaN(lastCallVal)).toBe(false);
        expect(lastCallVal).toBeGreaterThanOrEqual(1.0);
        expect(lastCallVal).toBeLessThanOrEqual(12.0);
      }
    });
  });
});
