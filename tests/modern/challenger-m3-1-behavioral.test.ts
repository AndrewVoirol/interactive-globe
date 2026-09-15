// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m3-1-behavioral.test.ts
// Challenger 1: Behavioral Adversarial Verification for Milestone 3 (R3)
// Orographic Moisture Profile Instrument (OrographicMoistureProfile)
// Invariants: Pointer capture, extreme bounds clamping, double-click reset,
// keyboard navigation, bridge dispatches, 3-medium SVG, and single-border contract.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  OrographicMoistureProfile,
  OrographicMoistureProfileProps,
} from '../../src/components/hud/instruments/OrographicMoistureProfile';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 1: OrographicMoistureProfile Behavioral Adversarial Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  // Global window bridge mocks
  let mockSetRainShadowFeedback: ReturnType<typeof vi.fn>;
  let mockSetPluvialGamma: ReturnType<typeof vi.fn>;
  let mockSetThermodynamicGating: ReturnType<typeof vi.fn>;
  let mockEngine: {
    setPluvialGamma: ReturnType<typeof vi.fn>;
    setLclGating: ReturnType<typeof vi.fn>;
    lclGating: boolean;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockSetRainShadowFeedback = vi.fn();
    mockSetPluvialGamma = vi.fn();
    mockSetThermodynamicGating = vi.fn();
    mockEngine = {
      setPluvialGamma: vi.fn(),
      setLclGating: vi.fn(),
      lclGating: true,
    };

    (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__ = mockSetRainShadowFeedback;
    (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__ = mockSetPluvialGamma;
    (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__ = mockSetThermodynamicGating;
    (window as any).__INDICATRIX_WEBGPU_ENGINE__ = mockEngine;

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
    delete (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__;
    delete (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__;
    delete (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__;
    delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    vi.restoreAllMocks();
  });

  // Helper to mock getBoundingClientRect for viewport
  const mockViewportRect = (
    viewport: HTMLElement,
    rect = { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 }
  ) => {
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(rect as any);
  };

  // ==========================================================================
  // OBJECTIVE 1: POINTER CAPTURE DRAGGING & BOUNDS CLAMPING
  // ==========================================================================
  describe('1. Pointer Capture Dragging & Strict Bounds Clamping', () => {
    it('CHALLENGE-M3-01: invokes setPointerCapture on pointerdown and releasePointerCapture on pointerup', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.25,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
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
        downEvent.pointerId = 101;
        downEvent.clientX = 100;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      expect(setCaptureSpy).toHaveBeenCalledWith(101);

      // Pointer up
      await act(async () => {
        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.pointerId = 101;
        upEvent.clientX = 100;
        upEvent.clientY = 160;
        viewport.dispatchEvent(upEvent);
      });

      expect(releaseCaptureSpy).toHaveBeenCalledWith(101);
    });

    it('CHALLENGE-M3-02: dragging windward slope far beyond top-right bounds (clientX >> 1000, clientY << -1000) clamps rainShadowFeedback strictly to 1.00', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.25,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport);

      // Pointer down on windward half (relX = (100 - 50) / 280 ≈ 0.178 < 0.52)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 1;
        downEvent.clientX = 100;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      // Move far into negative clientY (-5000px) and extreme clientX (+5000px)
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 1;
        moveEvent.clientX = 5000;
        moveEvent.clientY = -5000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onRainShadow).toHaveBeenCalled();
      const lastVal = onRainShadow.mock.calls[onRainShadow.mock.calls.length - 1][0];
      expect(lastVal).toBe(1.0);
    });

    it('CHALLENGE-M3-03: dragging windward slope far beyond bottom-left bounds (clientX << -1000, clientY >> 1000) clamps rainShadowFeedback strictly to 0.00', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.75,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport);

      // Pointer down on windward half (relX ≈ 0.178)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 2;
        downEvent.clientX = 100;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      // Move far into negative clientX (-5000px) and positive clientY (+8000px)
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 2;
        moveEvent.clientX = -5000;
        moveEvent.clientY = 8000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onRainShadow).toHaveBeenCalled();
      const lastVal = onRainShadow.mock.calls[onRainShadow.mock.calls.length - 1][0];
      expect(lastVal).toBe(0.0);
    });

    it('CHALLENGE-M3-04: dragging precipitation shaft far beyond bottom-right bounds (clientX >> 1000, clientY >> 1000) clamps pluvialGamma strictly to 2.0', async () => {
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.25,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport);

      // Pointer down on leeward/precipitation shaft half (relX = (250 - 50) / 280 ≈ 0.714 >= 0.52)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 3;
        downEvent.clientX = 250;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      // Move far into positive clientX (+8000px) and positive clientY (+8000px)
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 3;
        moveEvent.clientX = 8000;
        moveEvent.clientY = 8000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onPluvial).toHaveBeenCalled();
      const lastVal = onPluvial.mock.calls[onPluvial.mock.calls.length - 1][0];
      expect(lastVal).toBe(2.0);
    });

    it('CHALLENGE-M3-05: dragging precipitation shaft far beyond top-left bounds (clientX << -1000, clientY << -1000) clamps pluvialGamma strictly to 0.0', async () => {
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.25,
            pluvialGamma: 1.5,
            thermodynamicGating: true,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport);

      // Pointer down on precipitation shaft half (relX ≈ 0.714)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 4;
        downEvent.clientX = 250;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      // Move far into negative clientX (-5000px) and negative clientY (-5000px)
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 4;
        moveEvent.clientX = -5000;
        moveEvent.clientY = -5000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onPluvial).toHaveBeenCalled();
      const lastVal = onPluvial.mock.calls[onPluvial.mock.calls.length - 1][0];
      expect(lastVal).toBe(0.0);
    });

    it('CHALLENGE-M3-06: drag threshold ignores micro-movements <= 3px', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.25,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport);

      // Pointer down
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 5;
        downEvent.clientX = 100;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      // Micro-move of 2px
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 5;
        moveEvent.clientX = 102;
        moveEvent.clientY = 161;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onRainShadow).not.toHaveBeenCalled();
      expect(onPluvial).not.toHaveBeenCalled();
    });

    it('CHALLENGE-M3-07: Monte Carlo stress fuzzing over 2,000 random pointer coordinates verifies strict bounds and zero NaNs', async () => {
      const rainCalls: number[] = [];
      const pluvialCalls: number[] = [];

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: (v) => rainCalls.push(v),
            onPluvialGammaChange: (v) => pluvialCalls.push(v),
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport);

      // Run 2,000 iterations alternating between windward and leeward
      for (let i = 0; i < 2000; i++) {
        const isWindward = i % 2 === 0;
        const downX = isWindward ? 50 + Math.random() * 90 : 200 + Math.random() * 120;
        const downY = 100 + Math.random() * 120;

        await act(async () => {
          const downEvent = new Event('pointerdown', { bubbles: true }) as any;
          downEvent.pointerId = i;
          downEvent.clientX = downX;
          downEvent.clientY = downY;
          viewport.dispatchEvent(downEvent);
        });

        // Generate coordinate spanning extreme negatives (-10,000) to extreme positives (+10,000)
        const moveX = (Math.random() - 0.5) * 20000;
        const moveY = (Math.random() - 0.5) * 20000;

        await act(async () => {
          const moveEvent = new Event('pointermove', { bubbles: true }) as any;
          moveEvent.pointerId = i;
          moveEvent.clientX = moveX;
          moveEvent.clientY = moveY;
          viewport.dispatchEvent(moveEvent);
        });

        await act(async () => {
          const upEvent = new Event('pointerup', { bubbles: true }) as any;
          upEvent.pointerId = i;
          upEvent.clientX = moveX;
          upEvent.clientY = moveY;
          viewport.dispatchEvent(upEvent);
        });
      }

      // Assert all rain shadow calls are strictly within [0.0, 1.0] and finite
      expect(rainCalls.length).toBeGreaterThan(0);
      for (const val of rainCalls) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThanOrEqual(1.0);
      }

      // Assert all pluvial calls are strictly within [0.0, 2.0] and finite
      expect(pluvialCalls.length).toBeGreaterThan(0);
      for (const val of pluvialCalls) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThanOrEqual(2.0);
      }
    });
  });

  // ==========================================================================
  // OBJECTIVE 2: DOUBLE-CLICK RESET & FOOTER RESET
  // ==========================================================================
  describe('2. Double-Click Reset & Footer Reset Invariants', () => {
    it('CHALLENGE-M3-08: double-click on SVG viewport resets all parameters to defaults (0.0, 0.0, true)', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();
      const onGating = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.85,
            pluvialGamma: 1.7,
            thermodynamicGating: false,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
            onThermodynamicGatingChange: onGating,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      await act(async () => {
        const dblClickEvent = new MouseEvent('dblclick', { bubbles: true });
        viewport.dispatchEvent(dblClickEvent);
      });

      expect(onRainShadow).toHaveBeenCalledWith(0.0);
      expect(onPluvial).toHaveBeenCalledWith(0.0);
      expect(onGating).toHaveBeenCalledWith(true);
    });

    it('CHALLENGE-M3-09: clicking the footer [RESET] button resets all parameters to defaults', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();
      const onGating = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.90,
            pluvialGamma: 1.5,
            thermodynamicGating: false,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
            onThermodynamicGatingChange: onGating,
          })
        );
      });

      const resetButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('[RESET]')
      );
      expect(resetButton).toBeDefined();

      await act(async () => {
        resetButton!.click();
      });

      expect(onRainShadow).toHaveBeenCalledWith(0.0);
      expect(onPluvial).toHaveBeenCalledWith(0.0);
      expect(onGating).toHaveBeenCalledWith(true);
    });

    it('CHALLENGE-M3-10: single quick tap on the LCL horizon line toggles thermodynamic gating', async () => {
      const onGating = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onThermodynamicGatingChange: onGating,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 });

      // LCL line is at y = 68 inside 130 height (relY = 68/130 ≈ 0.523)
      // ClientY corresponding to relY = 0.52: 100 + 0.52 * 130 ≈ 167.6
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 10;
        downEvent.clientX = 150;
        downEvent.clientY = 167;
        viewport.dispatchEvent(downEvent);
      });

      await act(async () => {
        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.pointerId = 10;
        upEvent.clientX = 150;
        upEvent.clientY = 167;
        viewport.dispatchEvent(upEvent);
      });

      expect(onGating).toHaveBeenCalledWith(false);
    });
  });

  // ==========================================================================
  // OBJECTIVE 3: KEYBOARD ACCESSIBILITY & BOUNDARY STEPPING
  // ==========================================================================
  describe('3. Keyboard Interaction & Step Precision', () => {
    it('CHALLENGE-M3-11: ArrowRight increments rainShadowFeedback by 0.05 and clamps at 1.00', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.96,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onRainShadow).toHaveBeenCalledWith(1.0); // 0.96 + 0.05 = 1.01 -> clamped to 1.0
    });

    it('CHALLENGE-M3-12: Shift + ArrowRight increments rainShadowFeedback by 0.10', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.40,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onRainShadow).toHaveBeenCalledWith(0.50);
    });

    it('CHALLENGE-M3-13: ArrowLeft decrements rainShadowFeedback by 0.05 and clamps at 0.00', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.03,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onRainShadow).toHaveBeenCalledWith(0.0);
    });

    it('CHALLENGE-M3-14: Shift + ArrowLeft decrements rainShadowFeedback by 0.10', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.65,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onRainShadow).toHaveBeenCalledWith(0.55);
    });

    it('CHALLENGE-M3-15: ArrowUp increments pluvialGamma by 0.1 and clamps at 2.0', async () => {
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.95,
            thermodynamicGating: true,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onPluvial).toHaveBeenCalledWith(2.0);
    });

    it('CHALLENGE-M3-16: Shift + ArrowUp increments pluvialGamma by 0.5', async () => {
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 0.8,
            thermodynamicGating: true,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onPluvial).toHaveBeenCalledWith(1.3);
    });

    it('CHALLENGE-M3-17: ArrowDown decrements pluvialGamma by 0.1 and clamps at 0.0', async () => {
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 0.05,
            thermodynamicGating: true,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onPluvial).toHaveBeenCalledWith(0.0);
    });

    it('CHALLENGE-M3-18: Shift + ArrowDown decrements pluvialGamma by 0.5', async () => {
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.4,
            thermodynamicGating: true,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true });
        viewport.dispatchEvent(event);
      });

      expect(onPluvial).toHaveBeenCalledWith(0.9);
    });

    it('CHALLENGE-M3-19: "t", "T", and Space (" ") toggle thermodynamic gating', async () => {
      const onGating = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onThermodynamicGatingChange: onGating,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // Lowercase t
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      });
      expect(onGating).toHaveBeenLastCalledWith(false);

      // Uppercase T
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', bubbles: true }));
      });
      expect(onGating).toHaveBeenLastCalledWith(false);

      // Space
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(onGating).toHaveBeenLastCalledWith(false);
    });

    it('CHALLENGE-M3-20: Home resets both parameters to 0.0, and End jumps both parameters to max (1.0, 2.0)', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.45,
            pluvialGamma: 1.2,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // Home
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onRainShadow).toHaveBeenCalledWith(0.0);
      expect(onPluvial).toHaveBeenCalledWith(0.0);

      // End
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onRainShadow).toHaveBeenCalledWith(1.0);
      expect(onPluvial).toHaveBeenCalledWith(2.0);
    });
  });

  // ==========================================================================
  // OBJECTIVE 4: WINDOW BRIDGE DISPATCH VIA ATMOSPHEREDRAWER INTEGRATION
  // ==========================================================================
  describe('4. Window Bridge Dispatch in AtmosphereDrawer Integration', () => {
    it('CHALLENGE-M3-21: drag on windward slope dispatches __INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            rainShadowFeedback: 0.2,
            pluvialGamma: 0.4,
            thermodynamicGating: true,
          })
        );
      });

      const viewport = container.querySelector(
        '[aria-label="Orographic Moisture Profile and Condensation Caliper"]'
      ) as HTMLElement;
      expect(viewport).not.toBeNull();
      mockViewportRect(viewport);

      // Drag windward slope
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 11;
        downEvent.clientX = 100;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 11;
        moveEvent.clientX = 5000;
        moveEvent.clientY = -5000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(mockSetRainShadowFeedback).toHaveBeenCalledWith(1.0);
    });

    it('CHALLENGE-M3-22: drag on precipitation shaft dispatches __INDICATRIX_SET_PLUVIAL_GAMMA__ and engine.setPluvialGamma', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            rainShadowFeedback: 0.2,
            pluvialGamma: 0.4,
            thermodynamicGating: true,
          })
        );
      });

      const viewport = container.querySelector(
        '[aria-label="Orographic Moisture Profile and Condensation Caliper"]'
      ) as HTMLElement;
      mockViewportRect(viewport);

      // Drag leeward precipitation shaft
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 12;
        downEvent.clientX = 250;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 12;
        moveEvent.clientX = 8000;
        moveEvent.clientY = 8000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(mockSetPluvialGamma).toHaveBeenCalledWith(2.0);
      expect(mockEngine.setPluvialGamma).toHaveBeenCalledWith(2.0);
    });

    it('CHALLENGE-M3-23: keyboard "t" on viewport dispatches __INDICATRIX_SET_THERMODYNAMIC_GATING__ and engine.setLclGating', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            rainShadowFeedback: 0.2,
            pluvialGamma: 0.4,
            thermodynamicGating: true,
          })
        );
      });

      const viewport = container.querySelector(
        '[aria-label="Orographic Moisture Profile and Condensation Caliper"]'
      ) as HTMLElement;

      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      });

      expect(mockSetThermodynamicGating).toHaveBeenCalledWith(false);
      expect(mockEngine.setLclGating).toHaveBeenCalledWith(false);
    });

    it('CHALLENGE-M3-24: double-click reset dispatches all 3 window bridges back to defaults', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            rainShadowFeedback: 0.8,
            pluvialGamma: 1.6,
            thermodynamicGating: false,
          })
        );
      });

      const viewport = container.querySelector(
        '[aria-label="Orographic Moisture Profile and Condensation Caliper"]'
      ) as HTMLElement;

      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(mockSetRainShadowFeedback).toHaveBeenCalledWith(0.0);
      expect(mockSetPluvialGamma).toHaveBeenCalledWith(0.0);
      expect(mockEngine.setPluvialGamma).toHaveBeenCalledWith(0.0);
      expect(mockSetThermodynamicGating).toHaveBeenCalledWith(true);
      expect(mockEngine.setLclGating).toHaveBeenCalledWith(true);
    });

    it('CHALLENGE-M3-25: secondary inputs (#sidebar-rain-shadow, #sidebar-pluvial-coupling, #sidebar-thermodynamic-gating-off) remain fully wired to bridges', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            rainShadowFeedback: 0.1,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
          })
        );
      });

      // 1. Rain shadow range input
      const rainInput = container.querySelector('#sidebar-rain-shadow') as HTMLInputElement;
      expect(rainInput).not.toBeNull();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      await act(async () => {
        nativeSetter?.call(rainInput, '0.75');
        rainInput.dispatchEvent(new Event('input', { bubbles: true }));
        rainInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(mockSetRainShadowFeedback).toHaveBeenCalledWith(0.75);

      // 2. Pluvial coupling range input
      const pluvialInput = container.querySelector('#sidebar-pluvial-coupling') as HTMLInputElement;
      expect(pluvialInput).not.toBeNull();
      await act(async () => {
        nativeSetter?.call(pluvialInput, '1.8');
        pluvialInput.dispatchEvent(new Event('input', { bubbles: true }));
        pluvialInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(mockSetPluvialGamma).toHaveBeenCalledWith(1.8);
      expect(mockEngine.setPluvialGamma).toHaveBeenCalledWith(1.8);

      // 3. Thermodynamic gating off button
      const gatingOffBtn = container.querySelector(
        '#sidebar-thermodynamic-gating-off'
      ) as HTMLElement;
      expect(gatingOffBtn).not.toBeNull();
      await act(async () => {
        gatingOffBtn.click();
      });
      expect(mockSetThermodynamicGating).toHaveBeenCalledWith(false);
      expect(mockEngine.setLclGating).toHaveBeenCalledWith(false);
    });
  });

  // ==========================================================================
  // OBJECTIVE 5: 3-MEDIUM ADAPTIVE SVG ARTIFACTS & DESIGN ETHOS
  // ==========================================================================
  describe('5. Medium-Adaptive SVG Historical Inking & HUD Invariants', () => {
    it('CHALLENGE-M3-26: Theme 0 (Marie Tharp 1977) renders physiographic sounding traces and cyan/emerald tokens', async () => {
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            theme: 0,
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
          })
        );
      });

      const tharpGroup = container.querySelector('.orographic-sounding-tharp');
      expect(tharpGroup).not.toBeNull();
      expect(tharpGroup?.classList.contains('orographic-profile-tharp')).toBe(true);
      expect(container.textContent).toContain('OROGRAPHIC LIFT & INVERSION');
    });

    it('CHALLENGE-M3-27: Theme 1 (Cream Rag) renders Victorian intaglio mountain hachures and serif annotations', async () => {
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            theme: 1,
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
          })
        );
      });

      const creamGroup = container.querySelector('.orographic-engraving-cream');
      expect(creamGroup).not.toBeNull();
      expect(creamGroup?.classList.contains('orographic-profile-cream')).toBe(true);
      expect(container.textContent).toContain('Ascent (Moist)');
      expect(container.textContent).toContain('Crest (Condensation)');
      expect(container.textContent).toContain('Shadow (Arid)');
    });

    it('CHALLENGE-M3-28: Theme 2 (Prussian Cyanotype) renders CAD elevation ticks and adiabatic lapse rate isopleths', async () => {
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            theme: 2,
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
          })
        );
      });

      const cyanGroup = container.querySelector('.orographic-vector-cyanotype');
      expect(cyanGroup).not.toBeNull();
      expect(cyanGroup?.classList.contains('orographic-profile-cyanotype')).toBe(true);
      expect(container.textContent).toContain('4000m');
      expect(container.textContent).toContain('1500m');
      expect(container.textContent).toContain('500m');
      expect(container.textContent).toContain('ADIABATIC ASCENT [Γd = 9.8°C/km]');
    });

    it('CHALLENGE-M3-29: river channel stroke-width dynamically scales via Leopold-Maddock power law (w ∝ Q^0.5)', async () => {
      // Gamma = 0.0 -> riverStrokeWidth = 1.2
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            pluvialGamma: 0.0,
          })
        );
      });
      let riverLine = container.querySelector('line[x1="150"][x2="210"]') as SVGLineElement;
      const widthAt0 = parseFloat(riverLine.getAttribute('stroke-width') || '0');

      // Gamma = 2.0 -> riverStrokeWidth = 1.2 + sqrt(2.0) * 3.2 ≈ 5.72
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            pluvialGamma: 2.0,
          })
        );
      });
      riverLine = container.querySelector('line[x1="150"][x2="210"]') as SVGLineElement;
      const widthAt2 = parseFloat(riverLine.getAttribute('stroke-width') || '0');

      expect(widthAt2).toBeGreaterThan(widthAt0 * 3);
      expect(container.textContent).toContain('RIVER CHANNEL (w ∝ Q^0.5)');
    });

    it('CHALLENGE-M3-30: adheres to single-border HUD enclosure contract (zero nested inner neatlines)', async () => {
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
          })
        );
      });

      // No double neatlines or illegal nested border classes
      const forbiddenBorder15 = container.querySelectorAll('.border-current\\/15');
      const forbiddenInset2 = container.querySelectorAll('.inset-\\[2px\\]');
      expect(forbiddenBorder15.length).toBe(0);
      expect(forbiddenInset2.length).toBe(0);
    });
  });

  // ==========================================================================
  // OBJECTIVE 6: VERNIERSLIDER STEPPERS, TACTILE CONTROLS & GESTURE CANCELLATION
  // ==========================================================================
  describe('6. VernierSlider Steppers, Tactile Controls & Gesture Interruption', () => {
    it('CHALLENGE-M3-31: VernierSlider stepper buttons on Orographic Coupling increment and decrement by 0.05', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.40,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const incBtn = container.querySelector('button[title="Increase Orographic Coupling"]') as HTMLButtonElement;
      const decBtn = container.querySelector('button[title="Decrease Orographic Coupling"]') as HTMLButtonElement;

      expect(incBtn).not.toBeNull();
      expect(decBtn).not.toBeNull();

      // Click + button: 0.40 -> 0.45
      await act(async () => {
        incBtn.click();
      });
      expect(onRainShadow).toHaveBeenCalledWith(0.45);

      // Click - button: 0.40 -> 0.35
      await act(async () => {
        decBtn.click();
      });
      expect(onRainShadow).toHaveBeenCalledWith(0.35);
    });

    it('CHALLENGE-M3-32: VernierSlider steppers on Orographic Coupling disable appropriately at bounds [0.0, 1.0]', async () => {
      // At min bound 0.0
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.0,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
          })
        );
      });

      let decBtn = container.querySelector('button[title="Decrease Orographic Coupling"]') as HTMLButtonElement;
      let incBtn = container.querySelector('button[title="Increase Orographic Coupling"]') as HTMLButtonElement;
      expect(decBtn.disabled).toBe(true);
      expect(incBtn.disabled).toBe(false);

      // At max bound 1.0
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 1.0,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
          })
        );
      });

      decBtn = container.querySelector('button[title="Decrease Orographic Coupling"]') as HTMLButtonElement;
      incBtn = container.querySelector('button[title="Increase Orographic Coupling"]') as HTMLButtonElement;
      expect(decBtn.disabled).toBe(false);
      expect(incBtn.disabled).toBe(true);
    });

    it('CHALLENGE-M3-33: VernierSlider stepper buttons on Pluvial Coupling increment and decrement by 0.1', async () => {
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 0.8,
            thermodynamicGating: true,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const incBtn = container.querySelector('button[title="Increase Pluvial Coupling"]') as HTMLButtonElement;
      const decBtn = container.querySelector('button[title="Decrease Pluvial Coupling"]') as HTMLButtonElement;

      expect(incBtn).not.toBeNull();
      expect(decBtn).not.toBeNull();

      // Click + button: 0.8 -> 0.9
      await act(async () => {
        incBtn.click();
      });
      expect(onPluvial).toHaveBeenCalledWith(0.9);

      // Click - button: 0.8 -> 0.7
      await act(async () => {
        decBtn.click();
      });
      expect(onPluvial).toHaveBeenCalledWith(0.7);
    });

    it('CHALLENGE-M3-34: VernierSlider steppers on Pluvial Coupling disable appropriately at bounds [0.0, 2.0]', async () => {
      // At min bound 0.0
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 0.0,
            thermodynamicGating: true,
          })
        );
      });

      let decBtn = container.querySelector('button[title="Decrease Pluvial Coupling"]') as HTMLButtonElement;
      let incBtn = container.querySelector('button[title="Increase Pluvial Coupling"]') as HTMLButtonElement;
      expect(decBtn.disabled).toBe(true);
      expect(incBtn.disabled).toBe(false);

      // At max bound 2.0
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 2.0,
            thermodynamicGating: true,
          })
        );
      });

      decBtn = container.querySelector('button[title="Decrease Pluvial Coupling"]') as HTMLButtonElement;
      incBtn = container.querySelector('button[title="Increase Pluvial Coupling"]') as HTMLButtonElement;
      expect(decBtn.disabled).toBe(false);
      expect(incBtn.disabled).toBe(true);
    });

    it('CHALLENGE-M3-35: pointercancel releases pointer capture and safely aborts dragging without throwing', async () => {
      const onRainShadow = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.25,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport);
      const releaseSpy = vi.spyOn(viewport, 'releasePointerCapture');

      // Pointer down
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 99;
        downEvent.clientX = 100;
        downEvent.clientY = 160;
        viewport.dispatchEvent(downEvent);
      });

      // Pointer cancel (e.g. system gesture / phone call interruption)
      await act(async () => {
        const cancelEvent = new Event('pointercancel', { bubbles: true }) as any;
        cancelEvent.pointerId = 99;
        viewport.dispatchEvent(cancelEvent);
      });

      expect(releaseSpy).toHaveBeenCalledWith(99);

      // Subsequent pointermove should have no effect
      await act(async () => {
        const moveEvent = new Event('pointermove', { bubbles: true }) as any;
        moveEvent.pointerId = 99;
        moveEvent.clientX = 5000;
        moveEvent.clientY = -5000;
        viewport.dispatchEvent(moveEvent);
      });

      expect(onRainShadow).not.toHaveBeenCalled();
    });

    it('CHALLENGE-M3-36: quick tap on windward slope updates rainShadowFeedback, and quick tap on leeward shaft updates pluvialGamma', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.1,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 });

      // Tap windward mountain slope (relX = (110 - 50) / 280 = 60/280 ≈ 0.214 < 0.52, relY = (180 - 100) / 130 = 80/130 ≈ 0.615 > 0.58 so not LCL)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 50;
        downEvent.clientX = 110;
        downEvent.clientY = 180;
        viewport.dispatchEvent(downEvent);
      });

      await act(async () => {
        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.pointerId = 50;
        upEvent.clientX = 110;
        upEvent.clientY = 180;
        viewport.dispatchEvent(upEvent);
      });

      expect(onRainShadow).toHaveBeenCalled();
      expect(onRainShadow.mock.calls[0][0]).toBeGreaterThanOrEqual(0.0);
      expect(onRainShadow.mock.calls[0][0]).toBeLessThanOrEqual(1.0);

      // Tap leeward precipitation shaft (relX = (240 - 50) / 280 = 190/280 ≈ 0.678 >= 0.52, relY = 180 -> 0.615 > 0.58)
      await act(async () => {
        const downEvent = new Event('pointerdown', { bubbles: true }) as any;
        downEvent.pointerId = 51;
        downEvent.clientX = 240;
        downEvent.clientY = 180;
        viewport.dispatchEvent(downEvent);
      });

      await act(async () => {
        const upEvent = new Event('pointerup', { bubbles: true }) as any;
        upEvent.pointerId = 51;
        upEvent.clientX = 240;
        upEvent.clientY = 180;
        viewport.dispatchEvent(upEvent);
      });

      expect(onPluvial).toHaveBeenCalled();
      expect(onPluvial.mock.calls[0][0]).toBeGreaterThanOrEqual(0.0);
      expect(onPluvial.mock.calls[0][0]).toBeLessThanOrEqual(2.0);
    });
  });
});
