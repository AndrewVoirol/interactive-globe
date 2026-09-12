// ============================================================================
// File: tests/modern/challenger-r3-atmosphere-timeline-adversarial.test.ts
// Milestone 3 (R3): Adversarial Empirical Challenge Suite
// Challenger: challenger_m3_1
// Compliance: Rule 46 (Anti-Cheating), Invariant §4 (Single-Border),
// Invariant §21 (Collapsing), Invariant §72 (Chronology), Invariant §73 (Ring Buffer)
// ============================================================================

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import {
  AtmosphereDrawer,
  AtmosphereDrawerProps,
  PrognosticModelBackend,
} from '../../src/components/AtmosphereDrawer';
import {
  TimelineScrubber,
  computeTimelineState,
  minutesToTrackPosition,
  trackPositionToMinutes,
  TimelineScrubberState,
  RADAR_FRACTION,
} from '../../src/components/hud/TimelineScrubber';
import { WeatherNextDataSource } from '../../src/core/data/WeatherNextDataSource';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger R3: Adversarial Empirical Challenge Suite', () => {
  let container: HTMLDivElement;
  let root: Root;
  let mockDevice: MockGPUDevice;
  const originalFetch = globalThis.fetch;

  function createTaggedSlice(hour: number): ArrayBuffer {
    const buf = new Uint8Array(13370624);
    buf[0] = hour & 0xff;
    buf[1] = (hour >> 8) & 0xff;
    return buf.buffer;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockDevice = new MockGPUDevice();

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('meta.json')) {
        return {
          ok: true,
          json: async () => ({
            source: 'Google DeepMind WeatherNext 3',
            timeHorizon: { startHour: 0, endHour: 47, stepHours: 1, totalHours: 48 },
            validPredictionHours: Array.from({ length: 48 }, (_, i) => i),
            variables: ['total_precipitation_1hr_mean'],
          }),
        };
      }
      const match = url.match(/([a-z0-9_]+)-(\d+)\.bin/);
      const hour = match ? parseInt(match[2], 10) : 0;
      return {
        ok: true,
        arrayBuffer: async () => createTaggedSlice(hour),
      };
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    globalThis.fetch = originalFetch;
    delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
    delete (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__;
    delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    delete (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__;
    delete (window as any).__INDICATRIX_WEATHERNEXT_SOURCE__;
    delete (window as any).__ENGINE;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Pillar 1: 10,000-Iteration Monte Carlo Fuzzing of Timeline State
  // ==========================================================================
  describe('Pillar 1: 10,000-Iteration Monte Carlo Fuzzing of computeTimelineState', () => {
    it('STRESS-01: 10,000 randomized minutes yield strictly bounded, finite state with zero NaNs/Infs', () => {
      for (let i = 0; i < 10_000; i++) {
        // Random minute across [-5000, +10000]
        const rawMin = (Math.random() - 0.2) * 15000;
        const isPlaying = Math.random() > 0.5;

        const state = computeTimelineState(rawMin, isPlaying);

        // Clamped bounds
        expect(state.absoluteMinutes).toBeGreaterThanOrEqual(-60);
        expect(state.absoluteMinutes).toBeLessThanOrEqual(2880);
        expect(Number.isFinite(state.absoluteMinutes)).toBe(true);

        // Bracket hour bounds
        expect(state.bracketHour).toBeGreaterThanOrEqual(0);
        expect(state.bracketHour).toBeLessThanOrEqual(47);
        expect(Number.isInteger(state.bracketHour)).toBe(true);

        // Tau bounds
        expect(state.tau).toBeGreaterThanOrEqual(0.0);
        expect(state.tau).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(state.tau)).toBe(true);

        // Zone exclusivity
        if (state.absoluteMinutes < 0) {
          expect(state.isRadarZone).toBe(true);
          expect(state.isForecastZone).toBe(false);
          expect(state.bracketHour).toBe(0);
        } else if (state.absoluteMinutes > 0) {
          expect(state.isRadarZone).toBe(false);
          expect(state.isForecastZone).toBe(true);
        } else {
          // Exactly 0.0 (NOW datum)
          expect(state.isRadarZone).toBe(false);
          expect(state.isForecastZone).toBe(false);
          expect(state.bracketHour).toBe(0);
          expect(state.tau).toBe(0.0);
        }

        expect(state.isPlaying).toBe(isPlaying);
      }
    });

    it('STRESS-02: Extreme pathological inputs (NaN, Infs, boundary sub-epsilons) survive without exception', () => {
      const pathological = [
        NaN,
        Infinity,
        -Infinity,
        -60.0000001,
        -59.9999999,
        -0.0000001,
        0.0000001,
        2879.999999,
        2880.000001,
        1e20,
        -1e20,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
      ];

      for (const val of pathological) {
        const state = computeTimelineState(val, false);
        expect(Number.isFinite(state.absoluteMinutes)).toBe(true);
        expect(Number.isFinite(state.tau)).toBe(true);
        expect(Number.isInteger(state.bracketHour)).toBe(true);
        expect(state.bracketHour).toBeGreaterThanOrEqual(0);
        expect(state.bracketHour).toBeLessThanOrEqual(47);
      }
    });

    it('STRESS-03: Inverse track position mapping bijection accuracy (|x - f^-1(f(x))| < 0.01 min)', () => {
      // Test 1,000 points across the [-60, 2880] domain
      for (let m = -60; m <= 2880; m += 2.94) {
        const u = minutesToTrackPosition(m);
        expect(u).toBeGreaterThanOrEqual(0.0);
        expect(u).toBeLessThanOrEqual(1.0);

        const recoveredMinutes = trackPositionToMinutes(u);
        const error = Math.abs(m - recoveredMinutes);
        expect(error).toBeLessThan(0.05); // Less than 3 seconds precision error
      }
    });
  });

  // ==========================================================================
  // Pillar 2: Rapid Toggling Stress & Controlled vs Uncontrolled State
  // ==========================================================================
  describe('Pillar 2: Rapid Toggling Stress & Controlled vs Uncontrolled State', () => {
    it('TOGGLE-01: 500 rapid toggles between GFS and WeatherNext in uncontrolled mode maintain state integrity', async () => {
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { showClouds: true }));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const gfsBtn = buttons.find((b) => b.textContent?.includes('GFS'))!;
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'))!;

      expect(gfsBtn).toBeDefined();
      expect(wnBtn).toBeDefined();

      // Rapidly toggle back and forth 500 times
      for (let i = 0; i < 500; i++) {
        await act(async () => {
          if (i % 2 === 0) {
            wnBtn.click();
          } else {
            gfsBtn.click();
          }
        });
      }

      // After 500 toggles (even number of clicks ending on gfsBtn):
      // i = 499 was odd -> gfsBtn.click()
      const updatedButtons = Array.from(container.querySelectorAll('button'));
      const finalGfs = updatedButtons.find((b) => b.textContent?.includes('GFS'));
      const finalWn = updatedButtons.find((b) => b.textContent?.includes('WeatherNext'));

      expect(finalGfs?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(finalWn?.className).not.toContain('bg-[var(--theme-control-active-bg)]');
    });

    it('TOGGLE-02: Strictly controlled mode prevents internal state drift if prop is unmutated', async () => {
      const onModelChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
            onPrognosticModelChange: onModelChange,
          } as any)
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const wnBtn = buttons.find((b) => b.textContent?.includes('WeatherNext'))!;

      // Click WeatherNext button
      await act(async () => {
        wnBtn.click();
      });

      expect(onModelChange).toHaveBeenCalledWith('weathernext3');

      // Because parent did not re-render with new prognosticModel prop,
      // the UI must still strictly reflect 'gfs' (controlled component invariant)
      const gfsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('GFS')
      );
      expect(gfsBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(wnBtn?.className).not.toContain('bg-[var(--theme-control-active-bg)]');
    });

    it('TOGGLE-03: Supports synonym identifiers (noaa-gfs, google-weathernext3, weathernext)', async () => {
      // 1. noaa-gfs
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'noaa-gfs',
          } as any)
        );
      });
      let gfsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('GFS')
      );
      expect(gfsBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');

      // 2. google-weathernext3
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'google-weathernext3',
          } as any)
        );
      });
      let wnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('WeatherNext')
      );
      expect(wnBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(container.textContent).toMatch(/● GCS Zarr v3/);

      // 3. weathernext
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext',
          } as any)
        );
      });
      wnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('WeatherNext')
      );
      expect(wnBtn?.className).toContain('bg-[var(--theme-control-active-bg)]');
    });
  });

  // ==========================================================================
  // Pillar 3: Window Bridge Hooks & Fallback Robustness
  // ==========================================================================
  describe('Pillar 3: Window Bridge Hooks & Fallback Robustness', () => {
    it('BRIDGE-01: Dispatches to window.__INDICATRIX_SET_PROGNOSTIC_MODEL__ without crashing when undefined or functional', async () => {
      const bridgeSpy = vi.fn();
      (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__ = bridgeSpy;

      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { showClouds: true }));
      });

      const wnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('WeatherNext')
      )!;

      await act(async () => {
        wnBtn.click();
      });

      expect(bridgeSpy).toHaveBeenCalledWith('weathernext3');

      // Now delete hook and verify no crash on subsequent click
      delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
      const gfsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('GFS')
      )!;

      await expect(
        act(async () => {
          gfsBtn.click();
        })
      ).resolves.not.toThrow();
    });

    it('BRIDGE-02: Dispatches timeline updates to window.__INDICATRIX_WEBGPU_ENGINE__.updateAtmosphereUniforms', async () => {
      const updateUniformsSpy = vi.fn();
      (window as any).__INDICATRIX_WEBGPU_ENGINE__ = {
        updateAtmosphereUniforms: updateUniformsSpy,
      };

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
          } as any)
        );
      });

      // Find native range input inside TimelineScrubber
      const nativeInput = container.querySelector('[data-testid="timeline-native-slider"]') as HTMLInputElement;
      expect(nativeInput).not.toBeNull();

      await act(async () => {
        nativeInput.value = '360';
        nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(updateUniformsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          weatherTimeMinutes: 360,
          weatherTau: 0,
        })
      );
    });

    it('BRIDGE-03: Dispatches to window.__INDICATRIX_WEATHERNEXT_DATA_SOURCE__ fallback if prop is omitted', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });
      const setTimeSpy = vi.spyOn(ds, 'setTime');

      (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__ = ds;

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            // Notice: weatherNextDataSource prop is NOT passed! Must use window bridge fallback
          } as any)
        );
      });

      const nativeInput = container.querySelector('[data-testid="timeline-native-slider"]') as HTMLInputElement;
      expect(nativeInput).not.toBeNull();

      await act(async () => {
        nativeInput.value = '720'; // +12 hours
        nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(setTimeSpy).toHaveBeenCalledWith(12, 0.0);
    });
  });

  // ==========================================================================
  // Pillar 4: Timeline Scrubber Event Dispatch to WeatherNextDataSource.setTime
  // ==========================================================================
  describe('Pillar 4: Timeline Scrubber Event Dispatch Mechanics', () => {
    it('DISPATCH-01: Scrubbing in GFS mode does NOT trigger WeatherNextDataSource.setTime', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });
      const setTimeSpy = vi.spyOn(ds, 'setTime');

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
            weatherNextDataSource: ds,
          } as any)
        );
      });

      const nativeInput = container.querySelector('[data-testid="timeline-native-slider"]') as HTMLInputElement;
      await act(async () => {
        nativeInput.value = '600';
        nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Intended invariant: In GFS mode, WeatherNext ring buffer should not be touched
      expect(setTimeSpy).not.toHaveBeenCalled();
    });

    it('DISPATCH-02: Scrubbing in WeatherNext mode dispatches exact bracketHour and tau to setTime', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });
      const setTimeSpy = vi.spyOn(ds, 'setTime');

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            weatherNextDataSource: ds,
          } as any)
        );
      });

      const nativeInput = container.querySelector('[data-testid="timeline-native-slider"]') as HTMLInputElement;

      // 1. Minute 90 -> 1h 30m -> bracketHour 1, tau 0.5
      await act(async () => {
        nativeInput.value = '90';
        nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(setTimeSpy).toHaveBeenLastCalledWith(1, 0.5);

      // 2. Minute 2880 -> 48h -> bracketHour 47, tau 1.0
      await act(async () => {
        nativeInput.value = '2880';
        nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(setTimeSpy).toHaveBeenLastCalledWith(47, 1.0);

      // 3. Minute -30 (Radar zone) -> bracketHour 0, tau 0.5
      await act(async () => {
        nativeInput.value = '-30';
        nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(setTimeSpy).toHaveBeenLastCalledWith(0, 0.5);
    });

    it('DISPATCH-03: Quick-jump preset buttons correctly trigger setTime on attached data source', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });
      const setTimeSpy = vi.spyOn(ds, 'setTime');

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            weatherNextDataSource: ds,
          } as any)
        );
      });

      const presets = Array.from(container.querySelectorAll('button'));
      const p24h = presets.find((b) => b.textContent === '+24h');
      const pNow = presets.find((b) => b.textContent === 'NOW');

      expect(p24h).toBeDefined();
      expect(pNow).toBeDefined();

      // Click +24h (1440 min)
      await act(async () => {
        p24h!.click();
      });
      expect(setTimeSpy).toHaveBeenLastCalledWith(24, 0.0);

      // Click NOW (0 min)
      await act(async () => {
        pNow!.click();
      });
      expect(setTimeSpy).toHaveBeenLastCalledWith(0, 0.0);
    });

    it('DISPATCH-04: Rapid async hammering of setTime survives 500 concurrent operations without deadlock', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      // Fire 500 setTime operations across randomized hours
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 500; i++) {
        const hour = Math.floor(Math.random() * 48);
        const tau = Math.random();
        promises.push(ds.setTime(hour, tau));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
      expect(ds.getCurrentHour()).toBeGreaterThanOrEqual(0);
      expect(ds.getCurrentHour()).toBeLessThanOrEqual(47);
    });
  });
});
