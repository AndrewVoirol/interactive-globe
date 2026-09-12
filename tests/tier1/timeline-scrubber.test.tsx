// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  TimelineScrubber,
  computeTimelineState,
  minutesToTrackPosition,
  trackPositionToMinutes,
  RADAR_FRACTION,
} from '../../src/components/hud/TimelineScrubber';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Atmospheric TimelineScrubber Component', () => {
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

  describe('1. Mathematical & Dual-Zone Projection Invariants', () => {
    it('computes timeline state correctly in the past radar zone (< 0)', () => {
      const stateMinus60 = computeTimelineState(-60, false);
      expect(stateMinus60.absoluteMinutes).toBe(-60);
      expect(stateMinus60.isRadarZone).toBe(true);
      expect(stateMinus60.isForecastZone).toBe(false);
      expect(stateMinus60.bracketHour).toBe(0);
      expect(stateMinus60.tau).toBe(0.0);

      const stateMinus30 = computeTimelineState(-30, false);
      expect(stateMinus30.absoluteMinutes).toBe(-30);
      expect(stateMinus30.isRadarZone).toBe(true);
      expect(stateMinus30.isForecastZone).toBe(false);
      expect(stateMinus30.bracketHour).toBe(0);
      expect(stateMinus30.tau).toBeCloseTo(0.5);
    });

    it('computes timeline state correctly at the NOW observation datum (0)', () => {
      const stateNow = computeTimelineState(0, false);
      expect(stateNow.absoluteMinutes).toBe(0);
      expect(stateNow.isRadarZone).toBe(false);
      expect(stateNow.isForecastZone).toBe(false);
      expect(stateNow.bracketHour).toBe(0);
      expect(stateNow.tau).toBe(0.0);
    });

    it('computes timeline state correctly in the WeatherNext forecast zone (> 0)', () => {
      // 30 min: Hour 0, tau = 0.5
      const state30m = computeTimelineState(30, false);
      expect(state30m.absoluteMinutes).toBe(30);
      expect(state30m.isRadarZone).toBe(false);
      expect(state30m.isForecastZone).toBe(true);
      expect(state30m.bracketHour).toBe(0);
      expect(state30m.tau).toBeCloseTo(0.5);

      // 60 min: Hour 1, tau = 0.0
      const state1h = computeTimelineState(60, false);
      expect(state1h.absoluteMinutes).toBe(60);
      expect(state1h.isRadarZone).toBe(false);
      expect(state1h.isForecastZone).toBe(true);
      expect(state1h.bracketHour).toBe(1);
      expect(state1h.tau).toBe(0.0);

      // 90 min: Hour 1, tau = 0.5
      const state90m = computeTimelineState(90, false);
      expect(state90m.bracketHour).toBe(1);
      expect(state90m.tau).toBeCloseTo(0.5);

      // 2880 min (48h): Hour 47, tau = 1.0
      const state48h = computeTimelineState(2880, false);
      expect(state48h.absoluteMinutes).toBe(2880);
      expect(state48h.bracketHour).toBe(47);
      expect(state48h.tau).toBe(1.0);
    });

    it('clamps boundary out-of-range values gracefully', () => {
      const below = computeTimelineState(-200, false);
      expect(below.absoluteMinutes).toBe(-60);

      const above = computeTimelineState(5000, false);
      expect(above.absoluteMinutes).toBe(2880);
      expect(above.bracketHour).toBe(47);
      expect(above.tau).toBe(1.0);
    });

    it('safely handles NaN, Infinity, and non-numeric inputs without crashing', () => {
      const nanState = computeTimelineState(NaN, false);
      expect(nanState.absoluteMinutes).toBe(0);
      expect(nanState.isRadarZone).toBe(false);
      expect(nanState.isForecastZone).toBe(false);
      expect(nanState.tau).toBe(0.0);
      expect(nanState.bracketHour).toBe(0);

      expect(minutesToTrackPosition(NaN)).toBe(RADAR_FRACTION);
      expect(trackPositionToMinutes(NaN)).toBe(0);

      const posInf = computeTimelineState(Infinity, false);
      expect(posInf.absoluteMinutes).toBe(2880);
      expect(posInf.bracketHour).toBe(47);
      expect(posInf.tau).toBe(1.0);

      const negInf = computeTimelineState(-Infinity, false);
      expect(negInf.absoluteMinutes).toBe(-60);
      expect(negInf.isRadarZone).toBe(true);
    });

    it('maintains strict monotonic tau and bracketHour continuity across hour boundaries', () => {
      // Just before hour 1 (59.9999m): must remain in bracket 0 with tau very close to 1.0, not jump to 0.0 prematurely
      const state59m = computeTimelineState(59.9999, false);
      expect(state59m.bracketHour).toBe(0);
      expect(state59m.tau).toBeGreaterThan(0.999);
      expect(state59m.tau).toBeLessThanOrEqual(1.0);

      // Exactly at hour 1 (60.0m): transitions cleanly to bracket 1 with tau 0.0
      const state60m = computeTimelineState(60, false);
      expect(state60m.bracketHour).toBe(1);
      expect(state60m.tau).toBe(0.0);

      // Just before hour 24 (1439.9999m): remains in bracket 23
      const state23h = computeTimelineState(1439.9999, false);
      expect(state23h.bracketHour).toBe(23);
      expect(state23h.tau).toBeGreaterThan(0.999);

      // At hour 24 (1440m): bracket 24, tau 0.0
      const state24h = computeTimelineState(1440, false);
      expect(state24h.bracketHour).toBe(24);
      expect(state24h.tau).toBe(0.0);
    });

    it('preserves exact roundtrip fidelity between track position and minutes', () => {
      const testCases = [-60, -45, -30, -10, 0, 60, 180, 720, 1440, 2880];
      for (const min of testCases) {
        const u = minutesToTrackPosition(min);
        expect(u).toBeGreaterThanOrEqual(0.0);
        expect(u).toBeLessThanOrEqual(1.0);
        const reconstructed = trackPositionToMinutes(u);
        expect(reconstructed).toBeCloseTo(min, 3);
      }
    });

    it('aligns the NOW datum exactly at the RADAR_FRACTION boundary', () => {
      expect(minutesToTrackPosition(0)).toBe(RADAR_FRACTION);
      expect(trackPositionToMinutes(RADAR_FRACTION)).toBe(0);
    });
  });

  describe('2. DOM Rendering & Accessibility Tree', () => {
    it('renders the dual-zone slider track with role="slider" and single-border enclosure', async () => {
      await act(async () => {
        root.render(React.createElement(TimelineScrubber, { initialMinutes: 0 }));
      });

      const track = container.querySelector('[role="slider"]');
      expect(track).not.toBeNull();
      expect(track?.getAttribute('aria-valuemin')).toBe('-60');
      expect(track?.getAttribute('aria-valuemax')).toBe('2880');
      expect(track?.getAttribute('aria-valuenow')).toBe('0');
      expect(track?.getAttribute('aria-label')).toBe('Atmospheric Timeline Scrubber');

      // Verify single-border panel enclosure
      const panel = container.firstElementChild as HTMLElement;
      expect(panel.className).toContain('border');
      expect(panel.className).toContain('border-[var(--theme-panel-border)]');
      expect(panel.className).toContain('bg-[var(--theme-panel-bg)]');
    });

    it('renders dual-zone markers (-60m radar and +48h forecast)', async () => {
      await act(async () => {
        root.render(React.createElement(TimelineScrubber, { initialMinutes: 0 }));
      });

      expect(container.textContent).toContain('Chronometric Scrubber');
      expect(container.textContent).toContain('-60m');
      expect(container.textContent).toContain('NOW');
      expect(container.textContent).toContain('+48h');
    });

    it('synchronizes the accessible native range input for test automation', async () => {
      await act(async () => {
        root.render(React.createElement(TimelineScrubber, { initialMinutes: 120 }));
      });

      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.min).toBe('-60');
      expect(input.max).toBe('2880');
      expect(input.value).toBe('120');
      // Hidden native input must not duplicate the slider in the accessibility tree or keyboard tab order
      expect(input.tabIndex).toBe(-1);
      expect(input.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders a prominent NOW hairline marker with dedicated attached label badge', async () => {
      await act(async () => {
        root.render(React.createElement(TimelineScrubber, { initialMinutes: 0 }));
      });

      // The prominent hairline is at RADAR_FRACTION (20%) with a dedicated NOW badge
      const nowBadge = Array.from(container.querySelectorAll('div')).find(
        (el) => el.textContent?.trim() === 'NOW' && el.className.includes('uppercase')
      );
      expect(nowBadge).toBeDefined();

      // Major tick +48h label must be anchored with right-0.5 to avoid overflow-hidden clipping
      const tick48h = Array.from(container.querySelectorAll('span')).find(
        (el) => el.textContent?.trim() === '+48h' && el.className.includes('right-0.5')
      );
      expect(tick48h).toBeDefined();
    });
  });

  describe('3. Output Callback on Value Changes', () => {
    function simulateSliderChange(input: HTMLInputElement, value: string) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    it('emits correct state when native slider input changes to forecast time (+120m)', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            onTimeChange,
          })
        );
      });

      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input).not.toBeNull();

      await act(async () => {
        simulateSliderChange(input, '120');
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 120,
          isRadarZone: false,
          isForecastZone: true,
          bracketHour: 2,
          tau: 0.0,
          isPlaying: false,
        })
      );
    });

    it('emits correct state when native slider input changes to radar time (-30m)', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            onTimeChange,
          })
        );
      });

      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      await act(async () => {
        simulateSliderChange(input, '-30');
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: -30,
          isRadarZone: true,
          isForecastZone: false,
          bracketHour: 0,
          tau: 0.5,
          isPlaying: false,
        })
      );
    });

    it('handles keyboard navigation on the slider track including stepping into radar zone', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            onTimeChange,
          })
        );
      });

      const track = container.querySelector('[role="slider"]') as HTMLElement;

      // ArrowLeft from 0 must step into radar zone by 10 minutes (-10m), NOT jump by 60 minutes to -60m
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: -10,
          isRadarZone: true,
          isForecastZone: false,
          bracketHour: 0,
        })
      );

      // ArrowRight from -10m steps back to NOW (0m)
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 0,
          isRadarZone: false,
          isForecastZone: false,
        })
      );

      // Shift + ArrowLeft from 0 fine-steps by 1 minute (-1m)
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: -1,
          isRadarZone: true,
        })
      );

      // ArrowRight increases by 60 min in forecast zone (from -1 + 10 = +9, then + 60 = +69)
      // First reset to 0
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
      });
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 60,
          isForecastZone: true,
          bracketHour: 1,
        })
      );

      // Home key resets to -60m
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: -60,
          isRadarZone: true,
        })
      );

      // End key jumps to 2880m
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 2880,
          bracketHour: 47,
          tau: 1.0,
        })
      );

      // '0' or 'n' key jumps back to NOW datum (0)
      await act(async () => {
        track.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 0,
          isRadarZone: false,
          isForecastZone: false,
        })
      );
    });

    it('updates time on pointer down and dragging across dual-zone track', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            onTimeChange,
          })
        );
      });

      const track = container.querySelector('[role="slider"]') as HTMLElement;
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 1000,
        height: 32,
        right: 1000,
        bottom: 32,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer down at x=100 (10% of track, which is halfway through 20% radar zone -> -30m)
      await act(async () => {
        track.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: -30,
          isRadarZone: true,
          tau: 0.5,
        })
      );

      // Pointer move to x=600 (60% of track, which is 50% through 80% forecast zone -> +24h = 1440m)
      await act(async () => {
        track.dispatchEvent(new PointerEvent('pointermove', { clientX: 600, bubbles: true }));
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 1440,
          isForecastZone: true,
          bracketHour: 24,
        })
      );
    });

    it('supports controlled mode via value prop', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            value: 360,
            onTimeChange,
          })
        );
      });

      const track = container.querySelector('[role="slider"]');
      expect(track?.getAttribute('aria-valuenow')).toBe('360');
      expect(container.textContent).toContain('+6h');
    });
  });

  describe('4. Quick-Jump Presets & Vernier Steppers', () => {
    it('jumps directly to designated presets when preset buttons are clicked', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            onTimeChange,
          })
        );
      });

      // Click -60m preset
      const minus60Btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '-60m'
      );
      expect(minus60Btn).toBeDefined();

      await act(async () => {
        minus60Btn?.click();
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: -60,
          isRadarZone: true,
        })
      );

      // Click +24h preset
      const plus24Btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '+24h'
      );
      expect(plus24Btn).toBeDefined();

      await act(async () => {
        plus24Btn?.click();
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 1440,
          isForecastZone: true,
          bracketHour: 24,
        })
      );
    });

    it('nudges time backward and forward with vernier steppers', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            onTimeChange,
          })
        );
      });

      const stepMinusBtn = container.querySelector('button[title*="Step backward"]') as HTMLButtonElement;
      const stepPlusBtn = container.querySelector('button[title*="Step forward"]') as HTMLButtonElement;

      expect(stepMinusBtn).not.toBeNull();
      expect(stepPlusBtn).not.toBeNull();

      // Step backward from 0 -> -10m in radar
      await act(async () => {
        stepMinusBtn.click();
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: -10,
          isRadarZone: true,
        })
      );

      // Step forward from -10m -> 0m
      await act(async () => {
        stepPlusBtn.click();
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          absoluteMinutes: 0,
        })
      );
    });
  });

  describe('5. Playback & Speed Controls', () => {
    it('toggles playback status on play button click', async () => {
      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            initialPlaying: false,
            onTimeChange,
          })
        );
      });

      const playBtn = container.querySelector('button[aria-label*="Play timeline"]') as HTMLButtonElement;
      expect(playBtn).not.toBeNull();
      expect(playBtn.textContent).toContain('PLAY');

      await act(async () => {
        playBtn.click();
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlaying: true,
        })
      );

      // Now button should be PAUSE
      const pauseBtn = container.querySelector('button[aria-label*="Pause timeline"]') as HTMLButtonElement;
      expect(pauseBtn).not.toBeNull();
      expect(pauseBtn.textContent).toContain('PAUSE');

      await act(async () => {
        pauseBtn.click();
      });

      expect(onTimeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlaying: false,
        })
      );
    });

    it('renders and switches playback speed multipliers (1×, 2×, 5×, 10×)', async () => {
      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            initialMinutes: 0,
            initialSpeed: 1,
          })
        );
      });

      const speed5Btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '5×'
      );
      expect(speed5Btn).toBeDefined();

      await act(async () => {
        speed5Btn?.click();
      });

      expect(speed5Btn?.className).toContain('bg-[var(--theme-control-active-bg)]');
    });

    it('advances continuously in controlled mode across RAF frames without loop restart stutter', async () => {
      vi.useFakeTimers();
      let capturedMinutes = 0;
      const onTimeChange = vi.fn((state) => {
        capturedMinutes = state.absoluteMinutes;
      });

      await act(async () => {
        root.render(
          React.createElement(TimelineScrubber, {
            value: capturedMinutes,
            initialPlaying: true,
            onTimeChange,
          })
        );
      });

      // Advance timers by 200ms (multiple animation frames)
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Scrubber should have progressed past 0 in controlled mode
      expect(onTimeChange).toHaveBeenCalled();
      expect(capturedMinutes).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });
});
