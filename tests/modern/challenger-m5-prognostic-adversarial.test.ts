// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m5-prognostic-adversarial.test.ts
// Challenger 1: Behavioral Adversarial Stress-Testing for Milestone 5 (Requirement R5)
// Components: PrognosticModelCard & AtmosphereDrawer Integration
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import {
  PrognosticModelCard,
  PrognosticModelCardProps,
  PrognosticModelBackend,
} from '../../src/components/hud/instruments/PrognosticModelCard';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 1: Milestone 5 PrognosticModelCard Behavioral Adversarial Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Provide Element.prototype.setPointerCapture and releasePointerCapture if absent in happy-dom
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
    vi.restoreAllMocks();
    delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
    delete (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__;
    delete (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__;
    delete (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__;
  });

  // ==========================================================================
  // Pillar 1: Pointer Drag & Pointer Capture Stress-Testing
  // ==========================================================================
  describe('1. Pointer Drag & Pointer Capture Stress-Testing', () => {
    it('M5-DRAG-01: clamps lead time strictly in [0, 240] in 6h increments during active drag', async () => {
      const onLeadTimeChange = vi.fn();
      const onTimelineChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            onLeadTimeChange,
            onTimelineChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 50,
        width: 280,
        height: 110,
        right: 380,
        bottom: 160,
        x: 100,
        y: 50,
        toJSON: () => {},
      });

      // Pointer down at mid-track:
      // rect.left = 100, width = 280
      // clientX = 100 + 140 = 240 -> normX = 140/280 = 0.5
      // trackNorm = (0.5 - 24/280) / (232/280) = (140 - 24) / 232 = 116 / 232 = 0.5
      // rawHours = 0.5 * 240 = 120
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 240, pointerId: 1, bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(120);
      expect(onTimelineChange).toHaveBeenCalledWith(7200);

      // Drag to a spot corresponding to 18h:
      // trackNorm = 18 / 240 = 0.075
      // normX = 24/280 + 0.075 * (232/280) = (24 + 17.4) / 280 = 41.4 / 280
      // clientX = 100 + 41.4 = 141.4
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 141.4, pointerId: 1, bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenLastCalledWith(18);
      expect(onTimelineChange).toHaveBeenLastCalledWith(18 * 60);

      // Drag to intermediate step (e.g. 19.5h -> stepped to 18h or 24h)
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 143, pointerId: 1, bubbles: true }));
      });
      const lastCalled = onLeadTimeChange.mock.calls[onLeadTimeChange.mock.calls.length - 1][0];
      expect(lastCalled % 6).toBe(0);
      expect(lastCalled).toBeGreaterThanOrEqual(0);
      expect(lastCalled).toBeLessThanOrEqual(240);

      // End drag
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerup', { clientX: 143, pointerId: 1, bubbles: true }));
      });
    });

    it('M5-DRAG-02: dragging far beyond bounds (negative -2000px, > +2000px) strictly clamps to 0h and 240h', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            onLeadTimeChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 280,
        height: 110,
        right: 280,
        bottom: 110,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer down to activate drag
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerId: 1, bubbles: true }));
      });

      // Extreme negative coordinates
      const extremeNegatives = [-5000, -2000, -1000, -500, -50, -1];
      for (const clientX of extremeNegatives) {
        await act(async () => {
          viewport.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId: 1, bubbles: true }));
        });
        expect(onLeadTimeChange).toHaveBeenLastCalledWith(0);
      }

      // Extreme positive coordinates
      const extremePositives = [281, 500, 1000, 2000, 5000, 50000];
      for (const clientX of extremePositives) {
        await act(async () => {
          viewport.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId: 1, bubbles: true }));
        });
        expect(onLeadTimeChange).toHaveBeenLastCalledWith(240);
      }

      // Pointer up release
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerup', { clientX: 50000, pointerId: 1, bubbles: true }));
      });
    });

    it('M5-DRAG-03: invokes pointer capture on pointerdown and releases on pointerup / pointercancel', async () => {
      const setCaptureSpy = vi.spyOn(Element.prototype, 'setPointerCapture');
      const releaseCaptureSpy = vi.spyOn(Element.prototype, 'releasePointerCapture');

      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, {}));
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 280,
        height: 110,
        right: 280,
        bottom: 110,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer down triggers capture
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 140, pointerId: 42, bubbles: true }));
      });
      expect(setCaptureSpy).toHaveBeenCalledWith(42);

      // Pointer up releases capture
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerup', { clientX: 140, pointerId: 42, bubbles: true }));
      });
      expect(releaseCaptureSpy).toHaveBeenCalledWith(42);

      // Pointer cancel also releases capture
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 140, pointerId: 99, bubbles: true }));
      });
      expect(setCaptureSpy).toHaveBeenCalledWith(99);

      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointercancel', { clientX: 140, pointerId: 99, bubbles: true }));
      });
      expect(releaseCaptureSpy).toHaveBeenCalledWith(99);
    });

    it('M5-DRAG-04: ignores pointermove when pointer is not down (isDragging = false)', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { onLeadTimeChange }));
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 280,
        height: 110,
        right: 280,
        bottom: 110,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Move without pointerdown
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, pointerId: 1, bubbles: true }));
      });
      expect(onLeadTimeChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Pillar 2: Double-Click & Footer Reset Behaviors
  // ==========================================================================
  describe('2. Double-Click & Footer Reset Behaviors', () => {
    it('M5-RESET-01: double-clicking the interactive viewport resets lead time to 24h', async () => {
      const onLeadTimeChange = vi.fn();
      const onTimelineChange = vi.fn();
      const bridgeTimelineSpy = vi.fn();
      (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__ = bridgeTimelineSpy;

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 120,
            onLeadTimeChange,
            onTimelineChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport.getAttribute('aria-valuenow')).toBe('120');

      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(onLeadTimeChange).toHaveBeenCalledWith(24);
      expect(onTimelineChange).toHaveBeenCalledWith(1440);
      expect(bridgeTimelineSpy).toHaveBeenCalledWith(1440);
    });

    it('M5-RESET-02: clicking the [RESET] button in footer restores default 24h', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 180,
            onLeadTimeChange,
          })
        );
      });

      const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('[RESET]')
      );
      expect(resetBtn).toBeDefined();

      await act(async () => {
        resetBtn?.click();
      });

      expect(onLeadTimeChange).toHaveBeenCalledWith(24);
    });

    it('M5-RESET-03: resets attached WeatherNextDataSource to hour 24 if WeatherNext is active', async () => {
      const mockSetTime = vi.fn();
      const mockDataSource = { setTime: mockSetTime };

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            weatherNextDataSource: mockDataSource,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(mockSetTime).toHaveBeenCalledWith(24, 0.0);
    });
  });

  // ==========================================================================
  // Pillar 3: Keyboard Navigation & Scroll-Lock Prevention
  // ==========================================================================
  describe('3. Keyboard Navigation & Scroll-Lock Prevention', () => {
    it('M5-KEY-01: ArrowRight (+6h) and ArrowLeft (-6h) step correctly and call preventDefault', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 24,
            onLeadTimeChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // ArrowRight: 24 + 6 = 30
      const rightEv = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true, bubbles: true });
      const preventDefaultSpy = vi.spyOn(rightEv, 'preventDefault');
      await act(async () => {
        viewport.dispatchEvent(rightEv);
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(30);
      expect(preventDefaultSpy).toHaveBeenCalled();

      // ArrowLeft: 24 - 6 = 18
      const leftEv = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true, bubbles: true });
      const preventLeftSpy = vi.spyOn(leftEv, 'preventDefault');
      await act(async () => {
        viewport.dispatchEvent(leftEv);
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(18);
      expect(preventLeftSpy).toHaveBeenCalled();
    });

    it('M5-KEY-02: Shift + Arrow keys and ArrowUp/Down step by 24h coarse increments', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 24,
            onLeadTimeChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // Shift + ArrowRight: 24 + 24 = 48
      await act(async () => {
        viewport.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, cancelable: true, bubbles: true })
        );
      });
      expect(onLeadTimeChange).toHaveBeenLastCalledWith(48);

      // Shift + ArrowLeft: 24 - 24 = 0
      await act(async () => {
        viewport.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, cancelable: true, bubbles: true })
        );
      });
      expect(onLeadTimeChange).toHaveBeenLastCalledWith(0);

      // ArrowUp: 24 + 24 = 48
      await act(async () => {
        viewport.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true, bubbles: true })
        );
      });
      expect(onLeadTimeChange).toHaveBeenLastCalledWith(48);

      // ArrowDown: 24 - 24 = 0
      await act(async () => {
        viewport.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true })
        );
      });
      expect(onLeadTimeChange).toHaveBeenLastCalledWith(0);
    });

    it('M5-KEY-03: Home sets 0h, End sets 240h, Enter and Space reset to 24h', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 72,
            onLeadTimeChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      // Home -> 0h
      const homeEv = new KeyboardEvent('keydown', { key: 'Home', cancelable: true, bubbles: true });
      const preventHomeSpy = vi.spyOn(homeEv, 'preventDefault');
      await act(async () => {
        viewport.dispatchEvent(homeEv);
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(0);
      expect(preventHomeSpy).toHaveBeenCalled();

      // End -> 240h
      const endEv = new KeyboardEvent('keydown', { key: 'End', cancelable: true, bubbles: true });
      const preventEndSpy = vi.spyOn(endEv, 'preventDefault');
      await act(async () => {
        viewport.dispatchEvent(endEv);
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(240);
      expect(preventEndSpy).toHaveBeenCalled();

      // Enter -> resets to 24h
      const enterEv = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
      const preventEnterSpy = vi.spyOn(enterEv, 'preventDefault');
      await act(async () => {
        viewport.dispatchEvent(enterEv);
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(24);
      expect(preventEnterSpy).toHaveBeenCalled();

      // Space -> resets to 24h
      const spaceEv = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true });
      const preventSpaceSpy = vi.spyOn(spaceEv, 'preventDefault');
      await act(async () => {
        viewport.dispatchEvent(spaceEv);
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(24);
      expect(preventSpaceSpy).toHaveBeenCalled();
    });

    it('M5-KEY-04: does not preventDefault or alter state on non-navigation keys (Tab, Escape, etc.)', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 24,
            onLeadTimeChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      for (const key of ['Tab', 'Escape', 'a', 'F5', 'Control']) {
        const ev = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
        const spy = vi.spyOn(ev, 'preventDefault');
        await act(async () => {
          viewport.dispatchEvent(ev);
        });
        expect(spy).not.toHaveBeenCalled();
        expect(onLeadTimeChange).not.toHaveBeenCalled();
      }
    });

    it('M5-KEY-05: clamps at extremes when navigating beyond 0h or 240h', async () => {
      const onLeadTimeChange = vi.fn();

      // Start at 0h
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 0,
            onLeadTimeChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;

      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true, bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenLastCalledWith(0);

      // Re-render at 240h
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 240,
            onLeadTimeChange,
          })
        );
      });

      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true, bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenLastCalledWith(240);
    });
  });

  // ==========================================================================
  // Pillar 4: Model Switching & Conditional Telemetry Visibility
  // ==========================================================================
  describe('4. Model Switching & Conditional Telemetry Visibility', () => {
    it('M5-MOD-01: switches cleanly between ecmwf, gfs, weathernext3, and off', async () => {
      const onModelChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            onPrognosticModelChange: onModelChange,
          })
        );
      });

      const ecmwfBtn = container.querySelector('#sidebar-model-ecmwf') as HTMLButtonElement;
      const gfsBtn = container.querySelector('#sidebar-model-gfs') as HTMLButtonElement;
      const wnBtn = container.querySelector('#sidebar-model-weathernext') as HTMLButtonElement;
      const offBtn = container.querySelector('#sidebar-model-off') as HTMLButtonElement;

      expect(ecmwfBtn).not.toBeNull();
      expect(gfsBtn).not.toBeNull();
      expect(wnBtn).not.toBeNull();
      expect(offBtn).not.toBeNull();

      // Click ECMWF
      await act(async () => {
        ecmwfBtn.click();
      });
      expect(onModelChange).toHaveBeenCalledWith('ecmwf');

      // Click WeatherNext
      await act(async () => {
        wnBtn.click();
      });
      expect(onModelChange).toHaveBeenCalledWith('weathernext3');

      // Click GFS
      await act(async () => {
        gfsBtn.click();
      });
      expect(onModelChange).toHaveBeenCalledWith('gfs');

      // Click Off / Climatology
      await act(async () => {
        offBtn.click();
      });
      expect(onModelChange).toHaveBeenCalledWith('off');
    });

    it('M5-MOD-02: variable panel and Zarr v3 telemetry conditionally render ONLY when WeatherNext is active', async () => {
      // 1. Initial GFS (default): variable panel and Zarr telemetry must NOT exist
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'gfs',
          })
        );
      });

      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();
      expect(container.querySelector('#sidebar-variable-temp')).toBeNull();
      expect(container.querySelector('#sidebar-variable-wind')).toBeNull();
      expect(container.textContent).not.toContain('● GCS Zarr v3');
      expect(container.textContent).not.toContain('3-Slot Ring Buffer');

      // 2. Switch to WeatherNext: variable panel and Zarr telemetry MUST exist
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
          })
        );
      });

      expect(container.querySelector('#sidebar-variable-rain')).not.toBeNull();
      expect(container.querySelector('#sidebar-variable-temp')).not.toBeNull();
      expect(container.querySelector('#sidebar-variable-wind')).not.toBeNull();
      expect(container.textContent).toContain('● GCS Zarr v3');
      expect(container.textContent).toContain('3-Slot Ring Buffer');

      // 3. Switch to ECMWF: variable panel and Zarr telemetry must disappear
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'ecmwf',
          })
        );
      });

      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();
      expect(container.textContent).not.toContain('● GCS Zarr v3');

      // 4. Switch to Off / Climatology: variable panel must disappear
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'off',
          })
        );
      });

      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();
      expect(container.textContent).not.toContain('● GCS Zarr v3');
    });

    it('M5-MOD-03: accepts model synonym aliases (google-weathernext3, weathernext, noaa-gfs, climatology)', async () => {
      // Alias 'google-weathernext3'
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'google-weathernext3' as any,
          })
        );
      });
      expect(container.querySelector('#sidebar-variable-rain')).not.toBeNull();
      expect(container.textContent).toContain('0.1° AI');

      // Alias 'weathernext'
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext' as any,
          })
        );
      });
      expect(container.querySelector('#sidebar-variable-rain')).not.toBeNull();

      // Alias 'noaa-gfs'
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'noaa-gfs' as any,
          })
        );
      });
      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();
      expect(container.textContent).toContain('0.25° GFS');

      // Alias 'climatology'
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'climatology' as any,
          })
        );
      });
      expect(container.textContent).toContain('1.0° CLIM');
    });
  });

  // ==========================================================================
  // Pillar 5: Variable Switching & Planetary Layer Activation
  // ==========================================================================
  describe('5. Variable Switching & Planetary Layer Activation', () => {
    it('M5-VAR-01: clicking #sidebar-variable-wind activates noaa-gfs-wind planetary layer', async () => {
      const onVarChange = vi.fn();
      const onTogglePlanetaryLayer = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            onPrognosticVariableChange: onVarChange,
            onTogglePlanetaryLayer,
          })
        );
      });

      const windBtn = container.querySelector('#sidebar-variable-wind') as HTMLButtonElement;
      expect(windBtn).not.toBeNull();

      await act(async () => {
        windBtn.click();
      });

      expect(onVarChange).toHaveBeenCalledWith('wind_10m_vector');
      expect(onTogglePlanetaryLayer).toHaveBeenCalledWith('noaa-gfs-wind', true);
    });

    it('M5-VAR-02: clicking non-wind variables (rain, temp, z500) does NOT trigger wind planetary layer', async () => {
      const onVarChange = vi.fn();
      const onTogglePlanetaryLayer = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            onPrognosticVariableChange: onVarChange,
            onTogglePlanetaryLayer,
          })
        );
      });

      const rainBtn = container.querySelector('#sidebar-variable-rain') as HTMLButtonElement;
      const tempBtn = container.querySelector('#sidebar-variable-temp') as HTMLButtonElement;
      const z500Btn = container.querySelector('#sidebar-variable-z500') as HTMLButtonElement;

      // Click Rain
      await act(async () => {
        rainBtn.click();
      });
      expect(onVarChange).toHaveBeenCalledWith('total_precipitation_1hr_mean');
      expect(onTogglePlanetaryLayer).not.toHaveBeenCalled();

      // Click Temp
      await act(async () => {
        tempBtn.click();
      });
      expect(onVarChange).toHaveBeenCalledWith('temperature_2m_mean');
      expect(onTogglePlanetaryLayer).not.toHaveBeenCalled();

      // Click Z500
      await act(async () => {
        z500Btn.click();
      });
      expect(onVarChange).toHaveBeenCalledWith('geopotential_500hpa');
      expect(onTogglePlanetaryLayer).not.toHaveBeenCalled();
    });

    it('M5-VAR-03: recognizes variable synonym aliases (tcwv, cape, ivt, z500)', async () => {
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            prognosticVariable: 'tcwv',
          })
        );
      });
      const rainBtn = container.querySelector('#sidebar-variable-rain');
      expect(rainBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            prognosticVariable: 'cape',
          })
        );
      });
      const tempBtn = container.querySelector('#sidebar-variable-temp');
      expect(tempBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            prognosticVariable: 'ivt',
          })
        );
      });
      const windBtn = container.querySelector('#sidebar-variable-wind');
      expect(windBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            prognosticVariable: 'z500',
          })
        );
      });
      const z500Btn = container.querySelector('#sidebar-variable-z500');
      expect(z500Btn?.className).toContain('bg-[var(--theme-control-active-bg)]');
    });
  });

  // ==========================================================================
  // Pillar 6: Window Bridge Dispatches
  // ==========================================================================
  describe('6. Window Bridge Dispatches', () => {
    it('M5-BRG-01: dispatches to (window).__INDICATRIX_SET_PROGNOSTIC_MODEL__ in uncontrolled mode', async () => {
      const bridgeModelSpy = vi.fn();
      (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__ = bridgeModelSpy;

      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, {}));
      });

      const wnBtn = container.querySelector('#sidebar-model-weathernext') as HTMLButtonElement;
      await act(async () => {
        wnBtn.click();
      });

      expect(bridgeModelSpy).toHaveBeenCalledWith('weathernext3');
    });

    it('M5-BRG-02: dispatches to (window).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__ in uncontrolled mode', async () => {
      const bridgeVarSpy = vi.fn();
      (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__ = bridgeVarSpy;

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
          })
        );
      });

      const tempBtn = container.querySelector('#sidebar-variable-temp') as HTMLButtonElement;
      await act(async () => {
        tempBtn.click();
      });

      expect(bridgeVarSpy).toHaveBeenCalledWith('temperature_2m_mean');
    });

    it('M5-BRG-03: dispatches to (window).__INDICATRIX_SET_TIMELINE_MINUTES__ when lead time scrubs', async () => {
      const bridgeTimelineSpy = vi.fn();
      (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__ = bridgeTimelineSpy;

      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, {}));
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 280,
        height: 110,
        right: 280,
        bottom: 110,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer down at x=24 (leadTime=0h)
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 24, pointerId: 1, bubbles: true }));
      });
      expect(bridgeTimelineSpy).toHaveBeenCalledWith(0);

      // Pointer move to x=256 (leadTime=240h)
      await act(async () => {
        viewport.dispatchEvent(new PointerEvent('pointermove', { clientX: 256, pointerId: 1, bubbles: true }));
      });
      expect(bridgeTimelineSpy).toHaveBeenCalledWith(240 * 60);
    });

    it('M5-BRG-04: executes cleanly when window bridges are undefined without throwing', async () => {
      delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
      delete (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__;
      delete (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__;

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 280,
        height: 110,
        right: 280,
        bottom: 110,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      expect(() => {
        act(() => {
          viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 140, pointerId: 1, bubbles: true }));
          const tempBtn = container.querySelector('#sidebar-variable-temp') as HTMLButtonElement;
          tempBtn?.click();
          const gfsBtn = container.querySelector('#sidebar-model-gfs') as HTMLButtonElement;
          gfsBtn?.click();
        });
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Pillar 7: Non-Finite Robustness & Adversarial Fuzzing
  // ==========================================================================
  describe('7. Non-Finite Robustness & Adversarial Fuzzing', () => {
    it('M5-FUZZ-01: handles non-finite leadTimeHours (NaN, Infinity, -Infinity, null, undefined) gracefully without crashing', async () => {
      const nonFiniteValues = [NaN, Infinity, -Infinity, null as any, undefined, -100, 99999];

      for (const val of nonFiniteValues) {
        expect(() => {
          act(() => {
            root.render(
              React.createElement(PrognosticModelCard, {
                leadTimeHours: val,
              })
            );
          });
        }).not.toThrow();

        const viewport = container.querySelector('[role="slider"]');
        expect(viewport).not.toBeNull();
        const ariaVal = Number(viewport?.getAttribute('aria-valuenow'));
        expect(Number.isFinite(ariaVal)).toBe(true);
        expect(ariaVal).toBeGreaterThanOrEqual(0);
        expect(ariaVal).toBeLessThanOrEqual(240);
      }
    });

    it('M5-FUZZ-02: handles non-finite timelineMinutes (NaN, Infinity, -Infinity, null, undefined) gracefully', async () => {
      const nonFiniteMinutes = [NaN, Infinity, -Infinity, null as any, undefined, -3600, 1000000];

      for (const min of nonFiniteMinutes) {
        expect(() => {
          act(() => {
            root.render(
              React.createElement(PrognosticModelCard, {
                timelineMinutes: min,
              })
            );
          });
        }).not.toThrow();

        const viewport = container.querySelector('[role="slider"]');
        expect(viewport).not.toBeNull();
        const ariaVal = Number(viewport?.getAttribute('aria-valuenow'));
        expect(Number.isFinite(ariaVal)).toBe(true);
      }
    });

    it('M5-FUZZ-03: handles invalid / corrupted model and variable strings gracefully', async () => {
      const corruptModels = [
        null as any,
        undefined,
        NaN as any,
        '',
        'INVALID_MODEL_404',
        '__proto__',
        {} as any,
        12345 as any,
      ];

      for (const m of corruptModels) {
        expect(() => {
          act(() => {
            root.render(
              React.createElement(PrognosticModelCard, {
                prognosticModel: m,
              })
            );
          });
        }).not.toThrow();

        expect(container.textContent).toContain('PROGNOSTIC MODEL');
      }
    });

    it('M5-FUZZ-04: handles malformed weatherNextDataSource (null, undefined, invalid setTime)', async () => {
      const malformedSources = [
        null,
        undefined,
        {},
        { setTime: null },
        { setTime: 'not-a-function' },
        { setTime: () => {} },
      ];

      for (const ds of malformedSources) {
        expect(() => {
          act(() => {
            root.render(
              React.createElement(PrognosticModelCard, {
                prognosticModel: 'weathernext3',
                weatherNextDataSource: ds as any,
              })
            );
          });
        }).not.toThrow();

        const viewport = container.querySelector('[role="slider"]') as HTMLElement;
        expect(() => {
          act(() => {
            viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          });
        }).not.toThrow();
      }
    });

    it('M5-FUZZ-05: 1,000 rapid Monte Carlo cycles of randomized props maintain rock-solid stability', async () => {
      const models: PrognosticModelBackend[] = ['gfs', 'weathernext3', 'ecmwf', 'off', 'google-weathernext3', 'noaa-gfs'];
      const variables = ['tcwv', 'cape', 'ivt', 'z500', 'total_precipitation_1hr_mean', 'temperature_2m_mean', 'wind_10m_vector', 'geopotential_500hpa', 'unknown'];
      const themes: (0 | 1 | 2)[] = [0, 1, 2];

      for (let i = 0; i < 1000; i++) {
        const randModel = models[i % models.length];
        const randVar = variables[i % variables.length];
        const randTheme = themes[i % themes.length];
        const randLead = (Math.random() - 0.2) * 350;
        const randMin = (Math.random() - 0.1) * 20000;

        expect(() => {
          act(() => {
            root.render(
              React.createElement(PrognosticModelCard, {
                prognosticModel: randModel,
                prognosticVariable: randVar,
                leadTimeHours: randLead,
                timelineMinutes: randMin,
                theme: randTheme,
              })
            );
          });
        }).not.toThrow();
      }

      const viewport = container.querySelector('[role="slider"]');
      expect(viewport).not.toBeNull();
    });
  });

  // ==========================================================================
  // Pillar 8: AtmosphereDrawer Full Integration & ARIA Contracts
  // ==========================================================================
  describe('8. AtmosphereDrawer Full Integration & ARIA Contracts', () => {
    it('M5-INT-01: mounts PrognosticModelCard inside AtmosphereDrawer when showClouds is true', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
          })
        );
      });

      expect(container.textContent).toContain('PROGNOSTIC MODEL');
      expect(container.textContent).toContain('Numerical Weather Prediction & Tensor Telemetry');
      expect(container.querySelector('#sidebar-model-gfs')).not.toBeNull();
      expect(container.querySelector('#sidebar-model-weathernext')).not.toBeNull();
    });

    it('M5-INT-02: verifies exactly 5 radiogroups in AtmosphereDrawer when WeatherNext is active', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(5);
    });

    it('M5-INT-03: verifies exactly 4 radiogroups in AtmosphereDrawer when GFS is active', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
          })
        );
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(4);
    });

    it('M5-INT-04: verifies Single-Border HUD Enclosure Contract in rendered AtmosphereDrawer cards', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const wnBtn = container.querySelector('#sidebar-model-weathernext');
      const card = wnBtn?.closest('.p-2.rounded-\\[3px\\].border');
      expect(card).not.toBeNull();

      expect(card!.querySelectorAll('.border-current\\/15').length).toBe(0);
      expect(card!.querySelectorAll('.inset-\\[2px\\]').length).toBe(0);
      expect(card!.className).toContain('border-[var(--theme-card-border)]');
      expect(card!.className).toContain('bg-[var(--theme-card-bg)]');
    });

    it('M5-INT-05: verifies 3-medium adaptive SVG artifacts across Themes 0, 1, and 2', async () => {
      // Theme 0: Marie Tharp (Baroclinic contours & heat flux streamlines)
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            theme: 0,
          })
        );
      });
      expect(container.querySelector('.prognostic-model-tharp')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).toBeNull();
      expect(container.querySelector('.prognostic-model-cyanotype')).toBeNull();

      // Theme 1: Cream Rag Paper (Victorian synoptic isobar engraving)
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            theme: 1,
          })
        );
      });
      expect(container.querySelector('.prognostic-model-cream')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).toBeNull();
      expect(container.querySelector('.prognostic-model-cyanotype')).toBeNull();

      // Theme 2: Prussian Cyanotype (CAD Voronoi mesh & tensor telemetry)
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            theme: 2,
          })
        );
      });
      expect(container.querySelector('.prognostic-model-cyanotype')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).toBeNull();
    });
  });
});
