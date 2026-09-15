// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m4-1-behavioral.test.ts
// Challenger 1: Behavioral, Pointer Capture, Keyboard & Window Bridge Test Suite
// Milestone 4: Shadow Intensity and Cloud Drift Speed Controls (Requirement R4)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CloudShadowInstrument } from '../../src/components/hud/instruments/CloudShadowInstrument';
import { CloudDriftSpeedInstrument } from '../../src/components/hud/instruments/CloudDriftSpeedInstrument';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 1: Milestone 4 Behavioral & Precision Control Tests', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Mock window bridge globals
    (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = vi.fn();
    (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__ = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
    delete (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__;
  });

  // ==========================================================================
  // 1. CloudShadowInstrument Behavioral Tests
  // ==========================================================================
  describe('1. CloudShadowInstrument Behavioral Tests', () => {
    it('M4-BEH-01: renders default shadow intensity 0.45 and formats 45%', async () => {
      await act(async () => {
        root.render(React.createElement(CloudShadowInstrument, {}));
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      expect(viewport.getAttribute('aria-valuenow')).toBe('0.45');
      expect(container.textContent).toContain('45%');
      expect(container.textContent).toContain('CLOUD SHADOW');
      expect(container.textContent).toContain('Ground Projection Ray');
    });

    it('M4-BEH-02: keyboard navigation ArrowLeft / ArrowRight steps by 0.05, Shift by 0.10', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.45,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      // Step right
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.5);

      // Coarse step right with Shift
      await act(async () => {
        viewport.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
        );
      });
      expect(onChange).toHaveBeenCalledWith(0.55);

      // Step left
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.4);

      // Home and End
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.0);

      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.6);
    });

    it('M4-BEH-03: double click and footer reset button restore default 0.45', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.15,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.45);

      const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('[RESET]')
      );
      expect(resetBtn).not.toBeNull();
      await act(async () => {
        resetBtn?.click();
      });
      expect(onChange).toHaveBeenCalledWith(0.45);
    });

    it('M4-BEH-04: pointer drag maps clientX to clamped [0.00, 0.60] in 0.05 increments', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.45,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      // Mock getBoundingClientRect
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer down at mid-track (clientX = 120 -> normX = 0.5)
      // t = (0.5 - 30/240) / (180/240) = (0.5 - 0.125) / 0.75 = 0.375 / 0.75 = 0.5
      // raw = 0.5 * 0.60 = 0.30
      await act(async () => {
        const event = new PointerEvent('pointerdown', { clientX: 120, pointerId: 1, bubbles: true });
        viewport.dispatchEvent(event);
      });
      expect(onChange).toHaveBeenCalledWith(0.3);

      // Drag to left edge (clientX = 10 -> normX = 10/240 < 30/240 -> t = 0)
      await act(async () => {
        const event = new PointerEvent('pointermove', { clientX: 10, pointerId: 1, bubbles: true });
        viewport.dispatchEvent(event);
      });
      expect(onChange).toHaveBeenCalledWith(0.0);

      // Drag to far right (clientX = 300 -> clamped to 0.60)
      await act(async () => {
        const event = new PointerEvent('pointermove', { clientX: 300, pointerId: 1, bubbles: true });
        viewport.dispatchEvent(event);
      });
      expect(onChange).toHaveBeenCalledWith(0.6);
    });

    it('M4-BEH-04B: pointer drag far beyond bounds (negative -5000px, positive +5000px) strictly clamps [0.00, 0.60]', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.45,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 50,
        top: 100,
        width: 240,
        height: 80,
        right: 290,
        bottom: 180,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      // Pointer down
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 170, pointerId: 1, bubbles: true }));
      });

      // Drag to extreme negative coordinates
      for (const clientX of [-5000, -2000, -500, -10, 0]) {
        await act(async () => {
          viewport.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId: 1, bubbles: true }));
        });
        expect(onChange).toHaveBeenLastCalledWith(0.0);
      }

      // Drag to extreme positive coordinates
      for (const clientX of [500, 1000, 2000, 5000, 100000]) {
        await act(async () => {
          viewport.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId: 1, bubbles: true }));
        });
        expect(onChange).toHaveBeenLastCalledWith(0.60);
      }
    });

    it('M4-BEH-04C: ArrowUp / ArrowDown and PageUp / PageDown navigation on CloudShadowInstrument', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.30,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // ArrowUp (+0.05)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.35);

      // ArrowUp with Shift (+0.10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.40);

      // ArrowDown (-0.05)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.25);

      // ArrowDown with Shift (-0.10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.20);

      // PageUp (+0.10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.40);

      // PageDown (-0.10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.20);
    });

    it('M4-BEH-04D: pointer lifecycle edge cases (pointermove without drag, pointercancel, pointer capture failure, zero width)', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.45,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // 1. Pointer move without pointerdown should be ignored
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, pointerId: 1, bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();

      // 2. Pointer capture throws exception - should not crash
      viewport.setPointerCapture = vi.fn().mockImplementation(() => {
        throw new DOMException('InvalidPointerId', 'InvalidPointerId');
      });
      viewport.releasePointerCapture = vi.fn().mockImplementation(() => {
        throw new DOMException('InvalidPointerId', 'InvalidPointerId');
      });

      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, pointerId: 1, bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.3);

      // 3. Pointer cancel ends drag
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
      });

      onChange.mockClear();
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, pointerId: 1, bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();

      // 4. Zero width getBoundingClientRect
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerId: 2, bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. CloudDriftSpeedInstrument Behavioral Tests
  // ==========================================================================
  describe('2. CloudDriftSpeedInstrument Behavioral Tests', () => {
    it('M4-BEH-05: renders default drift speed 500x and formats 500×', async () => {
      await act(async () => {
        root.render(React.createElement(CloudDriftSpeedInstrument, {}));
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      expect(viewport.getAttribute('aria-valuenow')).toBe('500');
      expect(container.textContent).toContain('500×');
      expect(container.textContent).toContain('CLOUD DRIFT');
      expect(container.textContent).toContain('Kinematic Temporal Motion');
    });

    it('M4-BEH-06: keyboard navigation ArrowLeft / ArrowRight steps by 10, Shift by 100', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 500,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // Step right
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(510);

      // Coarse step right with Shift
      await act(async () => {
        viewport.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
        );
      });
      expect(onChange).toHaveBeenCalledWith(600);

      // Step left
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(490);

      // Home and End
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0);

      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(2000);

      // Enter resets to 500
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(500);
    });

    it('M4-BEH-07: double click and footer reset button restore default 500x', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 1200,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(500);

      const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('[RESET]')
      );
      expect(resetBtn).not.toBeNull();
      await act(async () => {
        resetBtn?.click();
      });
      expect(onChange).toHaveBeenCalledWith(500);
    });

    it('M4-BEH-08: pointer drag maps clientX to clamped [0, 2000] in 10-unit increments', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 500,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Mid-track: clientX = 120 -> normX = 0.5
      // padFrac = 20/240, activeFrac = 200/240
      // t = (0.5 - 20/240) / (200/240) = (120 - 20) / 200 = 0.5
      // speed = 0.5 * 2000 = 1000
      await act(async () => {
        const event = new PointerEvent('pointerdown', { clientX: 120, pointerId: 1, bubbles: true });
        viewport.dispatchEvent(event);
      });
      expect(onChange).toHaveBeenCalledWith(1000);

      // Far left
      await act(async () => {
        const event = new PointerEvent('pointermove', { clientX: 5, pointerId: 1, bubbles: true });
        viewport.dispatchEvent(event);
      });
      expect(onChange).toHaveBeenCalledWith(0);

      // Far right
      await act(async () => {
        const event = new PointerEvent('pointermove', { clientX: 300, pointerId: 1, bubbles: true });
        viewport.dispatchEvent(event);
      });
      expect(onChange).toHaveBeenCalledWith(2000);
    });

    it('M4-BEH-08B: pointer drag far beyond bounds (negative -5000px, positive +5000px) strictly clamps [0, 2000]', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 500,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 50,
        top: 100,
        width: 240,
        height: 80,
        right: 290,
        bottom: 180,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      // Pointer down
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 170, pointerId: 1, bubbles: true }));
      });

      // Drag to extreme negative coordinates
      for (const clientX of [-5000, -2000, -500, -10, 0]) {
        await act(async () => {
          viewport.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId: 1, bubbles: true }));
        });
        expect(onChange).toHaveBeenLastCalledWith(0);
      }

      // Drag to extreme positive coordinates
      for (const clientX of [500, 1000, 2000, 5000, 100000]) {
        await act(async () => {
          viewport.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId: 1, bubbles: true }));
        });
        expect(onChange).toHaveBeenLastCalledWith(2000);
      }
    });

    it('M4-BEH-08C: ArrowUp / ArrowDown keyboard stepping (+10, -10, with Shift +100, -100)', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 500,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // ArrowUp (+10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(510);

      // ArrowUp with Shift (+100)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(600);

      // ArrowDown (-10)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(490);

      // ArrowDown with Shift (-100)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(400);
    });

    it('M4-BEH-08D: Space key resets drift speed to default 500', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 1500,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(500);
    });

    it('M4-BEH-08E: pointer lifecycle edge cases on CloudDriftSpeedInstrument (pointermove without drag, pointercancel, pointer capture failure, zero width)', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 500,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // 1. Pointer move without pointerdown should be ignored
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, pointerId: 1, bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();

      // 2. Pointer capture throws exception - should not crash
      viewport.setPointerCapture = vi.fn().mockImplementation(() => {
        throw new DOMException('InvalidPointerId', 'InvalidPointerId');
      });
      viewport.releasePointerCapture = vi.fn().mockImplementation(() => {
        throw new DOMException('InvalidPointerId', 'InvalidPointerId');
      });

      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, pointerId: 1, bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(1000);

      // 3. Pointer cancel ends drag
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
      });

      onChange.mockClear();
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, pointerId: 1, bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();

      // 4. Zero width getBoundingClientRect
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerId: 2, bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('M4-BEH-09: ignores non-finite numbers (NaN, Infinity)', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 500,
            onChange,
          })
        );
      });

      const driftInput = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      expect(driftInput).not.toBeNull();

      await act(async () => {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: { value: 'NaN' }, writable: false });
        driftInput.dispatchEvent(event);
      });
      expect(onChange).not.toHaveBeenCalled();

      await act(async () => {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: { value: 'Infinity' }, writable: false });
        driftInput.dispatchEvent(event);
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('M4-BEH-09B: non-finite fuzzing: passing NaN, Infinity, -Infinity, null, undefined does not crash either instrument', async () => {
      const onShadowChange = vi.fn();
      const onDriftChange = vi.fn();

      const nonFinitePayloads = [NaN, Infinity, -Infinity, null, undefined, 'garbage', {}, []];

      for (const badVal of nonFinitePayloads) {
        expect(() => {
          act(() => {
            root.render(
              React.createElement(
                'div',
                null,
                React.createElement(CloudShadowInstrument, {
                  shadowIntensity: badVal as any,
                  onChange: onShadowChange,
                }),
                React.createElement(CloudDriftSpeedInstrument, {
                  cloudDriftSpeed: badVal as any,
                  onChange: onDriftChange,
                })
              )
            );
          });
        }).not.toThrow();
      }
    });
  });

  // ==========================================================================
  // 3. AtmosphereDrawer Integration & Adversarial Stress Tests
  // ==========================================================================
  describe('3. AtmosphereDrawer Integration & Adversarial Stress Tests', () => {
    it('M4-BEH-10: mounts both instruments inside AtmosphereDrawer and propagates changes to callbacks and bridge', async () => {
      const onShadowChange = vi.fn();
      const onDriftChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            shadowIntensity: 0.45,
            cloudDriftSpeed: 500,
            onShadowIntensityChange: onShadowChange,
            onCloudDriftSpeedChange: onDriftChange,
          })
        );
      });

      // Confirm both instruments exist
      const shadowSlider = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      const driftSlider = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      expect(shadowSlider).not.toBeNull();
      expect(driftSlider).not.toBeNull();

      // Adjust shadow intensity
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      await act(async () => {
        nativeSetter?.call(shadowSlider, '0.55');
        shadowSlider.dispatchEvent(new Event('input', { bubbles: true }));
        shadowSlider.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(onShadowChange).toHaveBeenCalledWith(0.55);
      expect((window as any).__INDICATRIX_SET_SHADOW_INTENSITY__).toHaveBeenCalledWith(0.55);
      expect((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__).toHaveBeenCalledWith({
        shadowIntensity: 0.55,
      });

      // Adjust drift speed
      await act(async () => {
        nativeSetter?.call(driftSlider, '750');
        driftSlider.dispatchEvent(new Event('input', { bubbles: true }));
        driftSlider.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(onDriftChange).toHaveBeenCalledWith(750);
      expect((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__).toHaveBeenCalledWith({
        cloudDriftSpeed: 750,
      });
    });

    it('M4-BEH-11: collapses both instruments when master showClouds is false', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: false,
          })
        );
      });

      expect(container.querySelector('#sidebar-shadow-intensity')).toBeNull();
      expect(container.querySelector('#sidebar-cloud-drift')).toBeNull();
    });

    it('M4-BEH-12: dragging SVG viewports directly inside AtmosphereDrawer dispatches to window bridge', async () => {
      const onShadowChange = vi.fn();
      const onDriftChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            shadowIntensity: 0.45,
            cloudDriftSpeed: 500,
            onShadowIntensityChange: onShadowChange,
            onCloudDriftSpeedChange: onDriftChange,
          })
        );
      });

      const viewports = container.querySelectorAll('[role="slider"]');
      // viewports contains [AtmosphericColumn, CloudDriftSpeed, CloudShadow, Orographic...]
      const driftViewport = Array.from(viewports).find((v) =>
        v.getAttribute('aria-label')?.includes('Cloud Drift')
      ) as HTMLElement;
      const shadowViewport = Array.from(viewports).find((v) =>
        v.getAttribute('aria-label')?.includes('Cloud Ground Shadow')
      ) as HTMLElement;

      expect(driftViewport).not.toBeNull();
      expect(shadowViewport).not.toBeNull();

      vi.spyOn(driftViewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      vi.spyOn(shadowViewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Drag drift viewport to 1000x
      await act(async () => {
        driftViewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, pointerId: 1, bubbles: true }));
      });
      expect(onDriftChange).toHaveBeenCalledWith(1000);
      expect((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__).toHaveBeenCalledWith(
        expect.objectContaining({ cloudDriftSpeed: 1000 })
      );

      // Drag shadow viewport to 0.30
      await act(async () => {
        shadowViewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, pointerId: 2, bubbles: true }));
      });
      expect(onShadowChange).toHaveBeenCalledWith(0.3);
      expect((window as any).__INDICATRIX_SET_SHADOW_INTENSITY__).toHaveBeenCalledWith(0.3);
      expect((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__).toHaveBeenCalledWith(
        expect.objectContaining({ shadowIntensity: 0.3 })
      );
    });

    it('M4-BEH-13: functions cleanly when window bridge dispatchers are undefined', async () => {
      delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
      delete (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__;

      const onShadowChange = vi.fn();
      const onDriftChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            shadowIntensity: 0.45,
            cloudDriftSpeed: 500,
            onShadowIntensityChange: onShadowChange,
            onCloudDriftSpeedChange: onDriftChange,
          })
        );
      });

      const shadowSlider = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      expect(() => {
        act(() => {
          nativeSetter?.call(shadowSlider, '0.50');
          shadowSlider.dispatchEvent(new Event('input', { bubbles: true }));
          shadowSlider.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }).not.toThrow();
      expect(onShadowChange).toHaveBeenCalledWith(0.50);
    });

    it('M4-BEH-14: Monte Carlo stress fuzzing: 500 interleaved random actions maintain bounded finite invariants', async () => {
      const shadowHistory: number[] = [];
      const driftHistory: number[] = [];

      await act(async () => {
        root.render(
          React.createElement(
            'div',
            null,
            React.createElement(CloudShadowInstrument, {
              shadowIntensity: 0.45,
              onChange: (v) => shadowHistory.push(v),
            }),
            React.createElement(CloudDriftSpeedInstrument, {
              cloudDriftSpeed: 500,
              onChange: (v) => driftHistory.push(v),
            })
          )
        );
      });

      const sliders = container.querySelectorAll('[role="slider"]');
      const shadowViewport = sliders[0] as HTMLElement;
      const driftViewport = sliders[1] as HTMLElement;

      vi.spyOn(shadowViewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      vi.spyOn(driftViewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        right: 240,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '];

      for (let i = 0; i < 500; i++) {
        const actionType = Math.floor(Math.random() * 4);
        const targetInstrument = Math.random() > 0.5 ? shadowViewport : driftViewport;

        await act(async () => {
          if (actionType === 0) {
            // Pointer drag with extreme random clientX
            const randomX = (Math.random() - 0.5) * 10000;
            targetInstrument.dispatchEvent(new PointerEvent('pointerdown', { clientX: randomX, pointerId: 1, bubbles: true }));
            targetInstrument.dispatchEvent(new PointerEvent('pointermove', { clientX: randomX + 50, pointerId: 1, bubbles: true }));
            targetInstrument.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
          } else if (actionType === 1) {
            // Random keydown with random shiftKey
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            const shiftKey = Math.random() > 0.5;
            targetInstrument.dispatchEvent(new KeyboardEvent('keydown', { key: randomKey, shiftKey, bubbles: true }));
          } else if (actionType === 2) {
            // Double click reset
            targetInstrument.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          } else {
            // Pointer cancel
            targetInstrument.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
          }
        });
      }

      // Assert all recorded shadow values are finite and in [0.0, 0.60]
      expect(shadowHistory.length).toBeGreaterThan(0);
      for (const val of shadowHistory) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThanOrEqual(0.60);
      }

      // Assert all recorded drift values are finite and in [0, 2000]
      expect(driftHistory.length).toBeGreaterThan(0);
      for (const val of driftHistory) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(2000);
      }
    });

    it('M4-BEH-15: Enter / Space key resets both instruments to default values (0.45 and 500)', async () => {
      const shadowOnChange = vi.fn();
      const driftOnChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(
            'div',
            null,
            React.createElement(CloudShadowInstrument, {
              shadowIntensity: 0.20,
              onChange: shadowOnChange,
            }),
            React.createElement(CloudDriftSpeedInstrument, {
              cloudDriftSpeed: 1200,
              onChange: driftOnChange,
            })
          )
        );
      });

      const sliders = container.querySelectorAll('[role="slider"]');
      const shadowViewport = sliders[0] as HTMLElement;
      const driftViewport = sliders[1] as HTMLElement;

      // 1. CloudDriftSpeedInstrument: Enter key resets to 500
      const driftEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      await act(async () => {
        driftViewport.dispatchEvent(driftEnter);
      });
      expect(driftOnChange).toHaveBeenCalledWith(500);
      expect(driftEnter.defaultPrevented).toBe(true);

      // 2. CloudDriftSpeedInstrument: Space key resets to 500
      driftOnChange.mockClear();
      const driftSpace = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      await act(async () => {
        driftViewport.dispatchEvent(driftSpace);
      });
      expect(driftOnChange).toHaveBeenCalledWith(500);
      expect(driftSpace.defaultPrevented).toBe(true);

      // 3. CloudShadowInstrument: Enter key resets to 0.45
      const shadowEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      await act(async () => {
        shadowViewport.dispatchEvent(shadowEnter);
      });
      expect(shadowOnChange).toHaveBeenCalledWith(0.45);
      expect(shadowEnter.defaultPrevented).toBe(true);

      // 4. CloudShadowInstrument: Space key resets to 0.45
      shadowOnChange.mockClear();
      const shadowSpace = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      await act(async () => {
        shadowViewport.dispatchEvent(shadowSpace);
      });
      expect(shadowOnChange).toHaveBeenCalledWith(0.45);
      expect(shadowSpace.defaultPrevented).toBe(true);
    });
  });
});
