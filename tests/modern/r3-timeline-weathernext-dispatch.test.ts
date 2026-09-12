// ============================================================================
// File: tests/modern/r3-timeline-weathernext-dispatch.test.ts
// Milestone 3 (R3): Time Scrubber setTime Dispatch & Ring Buffer Integration
// Compliance: Rule 46, Invariant §72 (Temporal Scrubber), Invariant §73 (Ring Buffer)
// ============================================================================

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import {
  TimelineScrubber,
  computeTimelineState,
  TimelineScrubberState,
} from '../../src/components/hud/TimelineScrubber';
import { WeatherNextDataSource } from '../../src/core/data/WeatherNextDataSource';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Milestone 3 (R3) - Timeline Scrubber setTime Dispatch & Ring Buffer', () => {
  let mockDevice: MockGPUDevice;
  const originalFetch = globalThis.fetch;

  const MOCK_METADATA = {
    source: 'Google DeepMind WeatherNext 3',
    model: 'weathernext_3_0_0_statistics',
    timeHorizon: {
      startHour: 0,
      endHour: 47,
      stepHours: 1,
      totalHours: 48,
    },
    validPredictionHours: Array.from({ length: 48 }, (_, i) => i),
    variables: [
      'u_component_of_wind_10m_mean',
      'v_component_of_wind_10m_mean',
      'total_precipitation_1hr_mean',
      'temperature_2m_mean',
      'dewpoint_temperature_2m_mean',
      'total_cloud_cover_mean',
    ],
  };

  function createTaggedSlice(hour: number): ArrayBuffer {
    const buf = new Uint8Array(13370624);
    buf[0] = hour & 0xff;
    buf[1] = (hour >> 8) & 0xff;
    return buf.buffer;
  }

  function readSliceHour(buffer: ArrayBuffer | Uint8Array): number {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return u8[0] | (u8[1] << 8);
  }

  beforeEach(() => {
    mockDevice = new MockGPUDevice();
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('meta.json')) {
        return {
          ok: true,
          json: async () => MOCK_METADATA,
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
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Suite 1: Mathematical Accuracy of Timeline State Computation
  // --------------------------------------------------------------------------
  describe('1. TimelineScrubber computeTimelineState Precision (§R3)', () => {
    it('TIMELINE-01: calculates exact bracketHour and tau across 48h forecast span', () => {
      // t = 0m (NOW) -> Hour 0, tau = 0.0
      expect(computeTimelineState(0, false)).toMatchObject({
        bracketHour: 0,
        tau: 0.0,
        isForecastZone: false,
      });

      // t = 90m (1.5h) -> Hour 1, tau = 0.5
      expect(computeTimelineState(90, false)).toMatchObject({
        bracketHour: 1,
        tau: 0.5,
        isForecastZone: true,
      });

      // t = 720m (+12h) -> Hour 12, tau = 0.0
      expect(computeTimelineState(720, false)).toMatchObject({
        bracketHour: 12,
        tau: 0.0,
        isForecastZone: true,
      });

      // t = 2850m (+47.5h) -> Hour 47, tau = 0.5
      expect(computeTimelineState(2850, false)).toMatchObject({
        bracketHour: 47,
        tau: 0.5,
        isForecastZone: true,
      });

      // t = 2880m (+48h terminal) -> Hour 47, tau = 1.0
      expect(computeTimelineState(2880, false)).toMatchObject({
        bracketHour: 47,
        tau: 1.0,
        isForecastZone: true,
      });
    });

    it('TIMELINE-02: clamps boundary conditions safely', () => {
      // Negative radar zone clamps to bracketHour = 0
      expect(computeTimelineState(-45, false)).toMatchObject({
        bracketHour: 0,
        isRadarZone: true,
      });

      // Overflow (>2880m) clamps to bracketHour = 47, tau = 1.0
      expect(computeTimelineState(5000, false)).toMatchObject({
        bracketHour: 47,
        tau: 1.0,
      });
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: WeatherNextDataSource setTime Behavioral Mechanics
  // --------------------------------------------------------------------------
  describe('2. WeatherNextDataSource setTime Invariants', () => {
    it('TIMELINE-03: intra-hour scrubbing causes zero network fetches and zero texture writes', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      // Stage initial hour 5
      await ds.seekHour(5);
      expect(ds.getCurrentHour()).toBe(5);

      mockDevice.queue.writeTextureCalls = [];
      const initialFetchCount = (globalThis.fetch as any).mock.calls.length;

      // Intra-hour scrubbing: tau increases from 0.1 to 0.9 within hour 5
      await ds.setTime(5, 0.2);
      await ds.setTime(5, 0.5);
      await ds.setTime(5, 0.85);

      // Invariant: Zero I/O, VRAM textures remain resident
      expect((globalThis.fetch as any).mock.calls.length).toBe(initialFetchCount);
      expect(mockDevice.queue.writeTextureCalls).toHaveLength(0);
      expect(ds.getCurrentHour()).toBe(5);
    });

    it('TIMELINE-04: sequential 1-hour advance triggers cyclic slot rotation and prefetch', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      await ds.seekHour(5);
      expect(ds.getCurrentHour()).toBe(5);

      mockDevice.queue.writeTextureCalls = [];

      // Step forward by exactly 1 hour: 5 -> 6
      await ds.setTime(6, 0.0);
      expect(ds.getCurrentHour()).toBe(6);

      // Slot 2 receives prefetch for hour 8
      const calls = mockDevice.queue.writeTextureCalls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const lastCall = calls[calls.length - 1];
      expect(readSliceHour(lastCall.data as Uint8Array)).toBe(8);
    });

    it('TIMELINE-05: non-contiguous seek triggers full 3-slot staging', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });

      await ds.seekHour(2);
      expect(ds.getCurrentHour()).toBe(2);

      mockDevice.queue.writeTextureCalls = [];

      // Jump to hour 24 (+24h)
      await ds.setTime(24, 0.0);
      expect(ds.getCurrentHour()).toBe(24);

      // Verify that textures reflect hours 24, 25, 26
      const calls = mockDevice.queue.writeTextureCalls;
      const c0 = calls.find((c) => c.destination.texture === ring.getTexture(0));
      const c1 = calls.find((c) => c.destination.texture === ring.getTexture(1));
      const c2 = calls.find((c) => c.destination.texture === ring.getTexture(2));

      expect(readSliceHour(c0!.data as Uint8Array)).toBe(24);
      expect(readSliceHour(c1!.data as Uint8Array)).toBe(25);
      expect(readSliceHour(c2!.data as Uint8Array)).toBe(26);
    });

    it('TIMELINE-06: setTime safely handles disposed data source without throwing', async () => {
      const ds = new WeatherNextDataSource();
      ds.dispose();
      await expect(ds.setTime(10, 0.5)).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: AtmosphereDrawer Event Dispatch Integration
  // --------------------------------------------------------------------------
  describe('3. AtmosphereDrawer Timeline Event Dispatch Integration', () => {
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

    it('TIMELINE-07: dispatches setTime to attached WeatherNextDataSource on time change', async () => {
      const ring = new TemporalTextureRingBuffer(mockDevice as any, 3600, 1801, 'r16float');
      const ds = new WeatherNextDataSource({ ringBuffer: ring });
      const setTimeSpy = vi.spyOn(ds, 'setTime');

      (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__ = ds;

      const onTimeChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            weatherNextDataSource: ds,
            onTimelineChange: onTimeChange,
          } as any)
        );
      });

      const scrubberState: TimelineScrubberState = {
        absoluteMinutes: 720,
        isRadarZone: false,
        isForecastZone: true,
        tau: 0.0,
        bracketHour: 12,
        isPlaying: false,
      };

      await act(async () => {
        const btn12h = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+12h'));
        if (btn12h) {
          btn12h.click();
        } else if ((window as any).__INDICATRIX_SET_TIMELINE_MINUTES__) {
          (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__(720);
        }
      });

      expect(setTimeSpy).toHaveBeenCalledWith(12, 0.0);
      expect(ds.getCurrentHour()).toBe(12);

      delete (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__;
    });

    it('TIMELINE-08: scrubber keyboard navigation triggers setTime on WeatherNextDataSource', async () => {
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

      const slider = container.querySelector('[role="slider"]');
      expect(slider).not.toBeNull();
      if (slider) {
        await act(async () => {
          slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });
        expect(setTimeSpy).toHaveBeenCalled();
      }
    });
  });
});
