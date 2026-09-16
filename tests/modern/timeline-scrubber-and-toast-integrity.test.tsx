// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/timeline-scrubber-and-toast-integrity.test.tsx
// Verification suite for:
// 1. WebGPUEngine timeline offset sync across crust, volumetric clouds, and wind uniforms
// 2. DataLayerToastNotification per-item dismissal timer lifecycle during re-renders
// 3. DataLayerCatalog supported vs unsupported layer gating
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { DataLayerToastNotification, ToastMessage } from '../../src/components/hud/DataLayerToastNotification';
import { DATA_LAYER_CATALOG, getPresetById } from '../../src/core/data/DataLayerCatalog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Timeline Scrubber & Toast Notification Integrity', () => {
  describe('1. WebGPUEngine Timeline Offset Synchronization', () => {
    it('TIMELINE-01: updates simFloats[3] (crust sim.u_time) with timelineMinutes * 60s offset', () => {
      const engine = new WebGPUEngine();
      (engine as any).isInitialized = true;
      (engine as any).simUniformBuffer = { label: 'mock_sim_buf' };

      const writtenBuffers: { buffer: any; offset: number; data: Float32Array }[] = [];
      (engine as any).device = {
        queue: {
          writeBuffer: (buf: any, off: number, dataBuffer: ArrayBuffer) => {
            writtenBuffers.push({
              buffer: buf,
              offset: off,
              data: new Float32Array(dataBuffer.slice(0)),
            });
          },
        },
      };

      // 12 hours ahead = 720 minutes = 43,200 seconds
      engine.updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 15.0,
        dt: 0.016,
        timelineMinutes: 720,
      } as any);

      // simFloats[3] must equal 15.0 + 43200.0 = 43215.0
      expect((engine as any).simFloats[3]).toBeCloseTo(43215.0, 3);

      // Verify the buffer written to device matches
      const simWrite = writtenBuffers.find((w) => w.buffer === (engine as any).simUniformBuffer);
      expect(simWrite).toBeDefined();
      expect(simWrite!.data[3]).toBeCloseTo(43215.0, 3);
    });

    it('TIMELINE-02: updates volumetric cloudFloats[32] with timelineMinutes * 60s offset', () => {
      const engine = new WebGPUEngine();
      (engine as any).volumetricCameraUniformBuffer = { label: 'cam_buf' };
      (engine as any).volumetricCloudUniformBuffer = { label: 'cloud_buf' };

      const writtenBuffers: { buffer: any; offset: number; data: Float32Array }[] = [];
      (engine as any).device = {
        queue: {
          writeBuffer: (buf: any, off: number, dataBuffer: ArrayBuffer) => {
            writtenBuffers.push({
              buffer: buf,
              offset: off,
              data: new Float32Array(dataBuffer.slice(0)),
            });
          },
        },
      };

      // 24 hours ahead = 1440 minutes = 86,400 seconds
      engine.updateVolumetricUniforms({
        time: 25.0,
        timelineMinutes: 1440,
        unfurl: 0.0,
        mode: 0,
      } as any);

      const cloudWrite = writtenBuffers.find((w) => w.buffer === (engine as any).volumetricCloudUniformBuffer);
      expect(cloudWrite).toBeDefined();
      // cloudFloats[32] drives cloud.u_simControl.x (drift time)
      expect(cloudWrite!.data[32]).toBeCloseTo(25.0 + 86400.0, 3);
    });

    it('TIMELINE-03: supports negative timeline offsets for radar zone (-30m)', () => {
      const engine = new WebGPUEngine();
      (engine as any).isInitialized = true;
      (engine as any).simUniformBuffer = { label: 'mock_sim_buf' };
      (engine as any).device = {
        queue: {
          writeBuffer: () => {},
        },
      };

      // -30 minutes = -1800 seconds
      engine.updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 2000.0,
        dt: 0.016,
        timelineMinutes: -30,
      } as any);

      expect((engine as any).simFloats[3]).toBeCloseTo(2000.0 - 1800.0, 3);
    });
  });

  describe('2. DataLayerToastNotification Lifecycle & Auto-Dismissal', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      vi.useFakeTimers();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      vi.useRealTimers();
    });

    it('TOAST-01: auto-dismisses toast after duration even when component re-renders repeatedly', async () => {
      const dismissMock = vi.fn();
      const testToast: ToastMessage = {
        id: 'toast-rapid-rerender',
        type: 'info',
        title: 'Dataset Loaded',
        message: 'Loaded successfully',
      };

      // Component that triggers continuous re-renders (simulating frame renders)
      let triggerRerender: () => void = () => {};
      const TestHost = () => {
        const [, setTick] = useState(0);
        triggerRerender = () => setTick((t) => t + 1);
        return (
          <DataLayerToastNotification
            toasts={[testToast]}
            theme={0}
            onDismissToast={dismissMock}
          />
        );
      };

      await act(async () => {
        root.render(<TestHost />);
      });

      expect(container.textContent).toContain('Dataset Loaded');

      // Simulate 10 frequent frame re-renders during the 3.5s window
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          vi.advanceTimersByTime(200);
          triggerRerender();
        });
      }

      // At this point, 2000ms has elapsed. Toast should still be visible, dismissMock not called yet
      expect(dismissMock).not.toHaveBeenCalled();

      // Advance past 3500ms total
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      // The toast MUST have dismissed because timer was NOT reset on each re-render
      expect(dismissMock).toHaveBeenCalledTimes(1);
      expect(dismissMock).toHaveBeenCalledWith('toast-rapid-rerender');
    });

    it('TOAST-02: enforces 5000ms duration for error toasts', async () => {
      const dismissMock = vi.fn();
      const errorToast: ToastMessage = {
        id: 'toast-cors-error',
        type: 'error',
        title: 'CORS Warning',
        message: 'Cross-origin block',
      };

      await act(async () => {
        root.render(
          <DataLayerToastNotification
            toasts={[errorToast]}
            theme={1}
            onDismissToast={dismissMock}
          />
        );
      });

      expect(container.textContent).toContain('CORS Warning');

      // Advance by 3600ms (standard toasts dismiss here, but error toasts must persist)
      await act(async () => {
        vi.advanceTimersByTime(3600);
      });
      expect(dismissMock).not.toHaveBeenCalled();

      // Advance past 5000ms
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(dismissMock).toHaveBeenCalledWith('toast-cors-error');
    });

    it('TOAST-03: caps visible toasts to maximum 3 items', async () => {
      const toasts: ToastMessage[] = [
        { id: '1', type: 'info', title: 'Toast 1' },
        { id: '2', type: 'info', title: 'Toast 2' },
        { id: '3', type: 'info', title: 'Toast 3' },
        { id: '4', type: 'info', title: 'Toast 4' },
        { id: '5', type: 'info', title: 'Toast 5' },
      ];

      await act(async () => {
        root.render(
          <DataLayerToastNotification
            toasts={toasts}
            theme={2}
            onDismissToast={vi.fn()}
          />
        );
      });

      // Toasts 1 and 2 must be pruned; 3, 4, 5 must be visible
      expect(container.textContent).not.toContain('Toast 1');
      expect(container.textContent).not.toContain('Toast 2');
      expect(container.textContent).toContain('Toast 3');
      expect(container.textContent).toContain('Toast 4');
      expect(container.textContent).toContain('Toast 5');
    });
  });

  describe('3. DataLayerCatalog Parity', () => {
    it('CATALOG-01: flags the 5 XYZ tile pyramids as unsupported', () => {
      const unsupportedIds = [
        'esri-world-imagery',
        'global-bathymetry-ocean',
        'usgs-topo-map',
        'nasa-city-lights',
        'osm-topo-terrain',
      ];

      for (const id of unsupportedIds) {
        const preset = getPresetById(id);
        expect(preset).toBeDefined();
        expect(preset?.unsupported).toBe(true);
        expect(preset?.unsupportedReason).toContain('XYZ Tile Pipeline');
      }
    });

    it('CATALOG-02: supported engine datasets remain active and not unsupported', () => {
      const supportedIds = [
        'hybrid-crust-hydrosphere',
        'global-dem-crust',
        'noaa-gfs-wind',
        'noaa-gfs-clouds',
        'live-doppler-radar',
        'starlink-iss-orbits',
        'origami-crane-companion',
      ];

      for (const id of supportedIds) {
        const preset = getPresetById(id);
        expect(preset).toBeDefined();
        expect(preset?.unsupported).toBeFalsy();
      }
    });
  });
});
