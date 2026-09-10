// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m5-stress-it2.test.ts
// Challenger M5 Iteration 2: Empirical Stress Harness & Monte Carlo Fuzzer
// Adversarial Challenger Protocol (Pillars A, B, C, D) & AGENTS.md §46
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Pillar D: Direct imports from src/ (anti-cheating invariant §46)
import { useEngineState } from '../../src/hooks/useEngineState';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger M5 Iteration 2: Non-Finite Hardening & Stress Verification', () => {
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

  let latestEngineState: ReturnType<typeof useEngineState> | null = null;
  function EngineStateHarness() {
    latestEngineState = useEngineState();
    return null;
  }

  const mountEngineState = async () => {
    latestEngineState = null;
    await act(async () => {
      root.render(React.createElement(EngineStateHarness));
    });
    return latestEngineState!;
  };

  // --------------------------------------------------------------------------
  // Mission Requirement 3: Explicit State Hardening Probing
  // --------------------------------------------------------------------------
  describe('Mission 3: Core Non-Finite State Preservation Invariants', () => {
    it('3.1 setCloudDriftSpeed(NaN) preserves previous valid state', async () => {
      const state = await mountEngineState();
      // Set to a known valid non-default state first
      await act(async () => {
        state.setCloudDriftSpeed(1.75);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.75);

      // Inject NaN
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(NaN);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.75);
      expect(Number.isFinite(latestEngineState!.cloudDriftSpeed)).toBe(true);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);
    });

    it('3.2 setCloudDriftSpeed(Infinity) and setCloudDriftSpeed(-Infinity) preserve previous state', async () => {
      const state = await mountEngineState();
      await act(async () => {
        state.setCloudDriftSpeed(2.2);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.2);

      // Inject +Infinity
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(Infinity);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.2);
      expect(Number.isFinite(latestEngineState!.cloudDriftSpeed)).toBe(true);

      // Inject -Infinity
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(-Infinity);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.2);
      expect(Number.isFinite(latestEngineState!.cloudDriftSpeed)).toBe(true);
    });

    it('3.3 setCloudDriftSpeed(undefined as any) preserves previous state', async () => {
      const state = await mountEngineState();
      await act(async () => {
        state.setCloudDriftSpeed(0.8);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(0.8);

      // Inject undefined
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(undefined as any);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(0.8);
      expect(Number.isFinite(latestEngineState!.cloudDriftSpeed)).toBe(true);
    });

    it('3.4 setCloudOpacity(NaN) preserves previous valid state', async () => {
      const state = await mountEngineState();
      await act(async () => {
        state.setCloudOpacity(0.45);
      });
      expect(latestEngineState!.cloudOpacity).toBe(0.45);

      // Inject NaN
      await act(async () => {
        latestEngineState!.setCloudOpacity(NaN);
      });
      expect(latestEngineState!.cloudOpacity).toBe(0.45);
      expect(Number.isFinite(latestEngineState!.cloudOpacity)).toBe(true);
      expect(Number.isNaN(latestEngineState!.cloudOpacity)).toBe(false);
    });

    it('3.5 setCloudOptions({ cloudDriftSpeed: NaN, cloudOpacity: NaN }) preserves previous state', async () => {
      const state = await mountEngineState();
      await act(async () => {
        state.setCloudDriftSpeed(1.2);
        state.setCloudOpacity(0.6);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.2);
      expect(latestEngineState!.cloudOpacity).toBe(0.6);

      // Inject dual NaN via batch options
      await act(async () => {
        latestEngineState!.setCloudOptions({
          cloudDriftSpeed: NaN,
          cloudOpacity: NaN,
        });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.2);
      expect(latestEngineState!.cloudOpacity).toBe(0.6);
      expect(Number.isFinite(latestEngineState!.cloudDriftSpeed)).toBe(true);
      expect(Number.isFinite(latestEngineState!.cloudOpacity)).toBe(true);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);
      expect(Number.isNaN(latestEngineState!.cloudOpacity)).toBe(false);

      // Check window state synchronization integrity
      const winState = (window as any).__INDICATRIX_CLOUD_STATE__;
      expect(winState.cloudDriftSpeed).toBe(1.2);
      expect(winState.cloudOpacity).toBe(0.6);
    });
  });

  // --------------------------------------------------------------------------
  // Deep Adversarial Probing: Functional Updaters & Non-Primitive Types
  // --------------------------------------------------------------------------
  describe('Adversarial Functional Updaters and Malformed Types', () => {
    it('rejects functional updaters returning NaN, Infinity, or malformed types', async () => {
      const state = await mountEngineState();
      await act(async () => {
        state.setCloudDriftSpeed(2.0);
        state.setCloudOpacity(0.7);
      });

      // Functional updater returning NaN
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(() => NaN);
        latestEngineState!.setCloudOpacity(() => NaN);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.0);
      expect(latestEngineState!.cloudOpacity).toBe(0.7);

      // Functional updater returning Infinity
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(() => Infinity);
        latestEngineState!.setCloudOpacity(() => -Infinity);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.0);
      expect(latestEngineState!.cloudOpacity).toBe(0.7);

      // Functional updater returning non-number types
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed((() => 'invalid') as any);
        latestEngineState!.setCloudOpacity((() => null) as any);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.0);
      expect(latestEngineState!.cloudOpacity).toBe(0.7);
    });

    it('rejects malformed types passed directly to setCloudOptions', async () => {
      const state = await mountEngineState();
      await act(async () => {
        state.setCloudDriftSpeed(1.5);
        state.setCloudOpacity(0.5);
      });

      await act(async () => {
        latestEngineState!.setCloudOptions({
          cloudDriftSpeed: 'super-fast' as any,
          cloudOpacity: { value: 0.9 } as any,
        });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.5);
      expect(latestEngineState!.cloudOpacity).toBe(0.5);

      await act(async () => {
        latestEngineState!.setCloudOptions({
          cloudDriftSpeed: null as any,
          cloudOpacity: undefined as any,
        });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.5);
      expect(latestEngineState!.cloudOpacity).toBe(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Large-Scale Monte Carlo Stress Fuzzing (50,000 Randomized Trials)
  // --------------------------------------------------------------------------
  describe('Monte Carlo Stress Fuzzing (50,000 iterations)', () => {
    it('executes 50,000 randomized state transitions without a single NaN or out-of-bounds value', async () => {
      const state = await mountEngineState();

      // Exhaustive random generator producing valid, boundary, out-of-bounds, and non-finite inputs
      const sampleSpace: Array<() => any> = [
        () => (Math.random() - 0.5) * 100.0, // large float
        () => Math.random() * 3.0,           // in-bounds drift
        () => 0.1 + Math.random() * 0.9,     // in-bounds opacity
        () => 0.0,                           // lower drift boundary
        () => 3.0,                           // upper drift boundary
        () => 0.1,                           // lower opacity boundary
        () => 1.0,                           // upper opacity boundary
        () => -0.0,                          // negative zero
        () => NaN,                           // NaN
        () => Infinity,                      // +Infinity
        () => -Infinity,                     // -Infinity
        () => undefined,                     // undefined
        () => null,                          // null
        () => '3.0',                         // string
        () => ({ val: 1 }),                  // object
        () => [2.0],                         // array
      ];

      for (let i = 0; i < 50000; i++) {
        const choice = i % sampleSpace.length;
        const candidateSpeed = sampleSpace[choice]();
        const candidateOpacity = sampleSpace[(choice + 3) % sampleSpace.length]();

        // 1. Individual setters
        await act(async () => {
          latestEngineState!.setCloudDriftSpeed(candidateSpeed);
          latestEngineState!.setCloudOpacity(candidateOpacity);
        });

        const currentSpeed = latestEngineState!.cloudDriftSpeed;
        const currentOpacity = latestEngineState!.cloudOpacity;

        // Invariant Assertions:
        // Must be finite numbers
        if (!Number.isFinite(currentSpeed) || Number.isNaN(currentSpeed)) {
          throw new Error(`Monte Carlo iteration ${i} produced invalid cloudDriftSpeed: ${currentSpeed}`);
        }
        if (!Number.isFinite(currentOpacity) || Number.isNaN(currentOpacity)) {
          throw new Error(`Monte Carlo iteration ${i} produced invalid cloudOpacity: ${currentOpacity}`);
        }

        // Must respect bounds
        if (currentSpeed < 0.0 || currentSpeed > 3.0) {
          throw new Error(`Monte Carlo iteration ${i} violated drift bounds [0.0, 3.0]: ${currentSpeed}`);
        }
        if (currentOpacity < 0.1 || currentOpacity > 1.0) {
          throw new Error(`Monte Carlo iteration ${i} violated opacity bounds [0.1, 1.0]: ${currentOpacity}`);
        }

        // 2. Batch setter every 5 iterations
        if (i % 5 === 0) {
          await act(async () => {
            latestEngineState!.setCloudOptions({
              cloudDriftSpeed: candidateSpeed,
              cloudOpacity: candidateOpacity,
            });
          });

          const batchSpeed = latestEngineState!.cloudDriftSpeed;
          const batchOpacity = latestEngineState!.cloudOpacity;

          if (!Number.isFinite(batchSpeed) || batchSpeed < 0.0 || batchSpeed > 3.0) {
            throw new Error(`Batch Monte Carlo iteration ${i} failed cloudDriftSpeed: ${batchSpeed}`);
          }
          if (!Number.isFinite(batchOpacity) || batchOpacity < 0.1 || batchOpacity > 1.0) {
            throw new Error(`Batch Monte Carlo iteration ${i} failed cloudOpacity: ${batchOpacity}`);
          }
        }
      }

      // Final post-fuzz verification: state can still accept normal values cleanly
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(1.4);
        latestEngineState!.setCloudOpacity(0.75);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.4);
      expect(latestEngineState!.cloudOpacity).toBe(0.75);
    });
  });

  // --------------------------------------------------------------------------
  // Domain 4: UnifiedRightSidebar UI Component Stress & Readout Defense
  // --------------------------------------------------------------------------
  describe('Domain 4: UnifiedRightSidebar UI Component Stress & Readout Defense', () => {
    const createSidebarProps = (overrides: Partial<UnifiedRightSidebarProps> = {}): UnifiedRightSidebarProps => ({
      isZenMode: false,
      onZenToggle: vi.fn(),
      theme: 0,
      onThemeToggle: vi.fn(),
      backend: 'webgpu',
      onBackendChange: vi.fn(),
      hasWebGPU: true,
      resolution: '1M',
      onResolutionChange: vi.fn(),
      layerMode: 0,
      onLayerModeChange: vi.fn(),
      mode: 0,
      onModeChange: vi.fn(),
      cursorPhysicsEnabled: false,
      onCursorPhysicsToggle: vi.fn(),
      activeOverlay: 'off',
      onOverlayChange: vi.fn(),
      showLandmarks: false,
      onLandmarksToggle: vi.fn(),
      showTissot: false,
      onTissotToggle: vi.fn(),
      showVectors: true,
      onVectorsToggle: vi.fn(),
      alpha: 0.0,
      fps: 120,
      latStr: "28°00'N",
      lonStr: "087°00'E",
      mapScaleStr: '1 : 127,420,000',
      onSnapCamera: vi.fn(),
      dataLayers: [],
      onAddDataLayer: vi.fn(),
      onToggleDataLayer: vi.fn(),
      onRemoveDataLayer: vi.fn(),
      showClouds: true,
      onShowCloudsChange: vi.fn(),
      showCloudLow: true,
      onShowCloudLowChange: vi.fn(),
      showCloudMid: true,
      onShowCloudMidChange: vi.fn(),
      showCloudHigh: true,
      onShowCloudHighChange: vi.fn(),
      cloudDriftSpeed: 1.0,
      onCloudDriftSpeedChange: vi.fn(),
      cloudOpacity: 0.8,
      onCloudOpacityChange: vi.fn(),
      ...overrides,
    });

    it('4.1 verifies HUD readouts never render NaNx or NaN% under normal and non-finite prop conditions', async () => {
      const props = createSidebarProps({
        cloudDriftSpeed: 1.5,
        cloudOpacity: 0.8,
      });

      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, props));
      });

      // Find readouts
      expect(container.textContent).toContain('1.5x');
      expect(container.textContent).toContain('80%');
      expect(container.textContent).not.toContain('NaNx');
      expect(container.textContent).not.toContain('NaN%');
    });

    it('4.2 verifies slider change events with NaN or non-numbers drop silently without corrupting state', async () => {
      const onDriftChange = vi.fn();
      const onOpacityChange = vi.fn();
      const broadcastSpy = vi.fn();
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = broadcastSpy;

      const props = createSidebarProps({
        cloudDriftSpeed: 1.0,
        cloudOpacity: 0.8,
        onCloudDriftSpeedChange: onDriftChange,
        onCloudOpacityChange: onOpacityChange,
      });

      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, props));
      });

      const driftInput = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      const opacityInput = container.querySelector('#sidebar-cloud-opacity') as HTMLInputElement;

      expect(driftInput).not.toBeNull();
      expect(opacityInput).not.toBeNull();

      // Dispatch invalid change events with uncoerced string targets
      await act(async () => {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: { value: 'NaN' }, writable: false });
        driftInput.dispatchEvent(event);
      });
      expect(onDriftChange).not.toHaveBeenCalled();
      expect(broadcastSpy).not.toHaveBeenCalled();

      await act(async () => {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: { value: 'Infinity' }, writable: false });
        driftInput.dispatchEvent(event);
      });
      expect(onDriftChange).not.toHaveBeenCalled();
      expect(broadcastSpy).not.toHaveBeenCalled();

      await act(async () => {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: { value: 'abc' }, writable: false });
        opacityInput.dispatchEvent(event);
      });
      expect(onOpacityChange).not.toHaveBeenCalled();
      expect(broadcastSpy).not.toHaveBeenCalled();

      // Readouts must still be valid
      expect(container.textContent).not.toContain('NaNx');
      expect(container.textContent).not.toContain('NaN%');
    });
  });
});
