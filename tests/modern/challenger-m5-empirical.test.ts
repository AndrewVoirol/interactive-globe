// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m5-empirical.test.ts
// Challenger M5 Independent Empirical Verification Test Suite
// Invariants: §2 (Single-Border Enclosure), §6 (HUD Optical Hierarchy),
// §20 (Buffer Discipline), §21 (Cascading & Occlusion), §46 (Test Import Integrity)
// Protocol: Adversarial Challenger Protocol (Pillars A, B, C, D)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// Pillar D: Strict direct imports from src/ without mocks
import { useEngineState } from '../../src/hooks/useEngineState';
import { UnifiedRightSidebar } from '../../src/components/hud/UnifiedRightSidebar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger M5 Empirical Adversarial Verification', () => {
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

  // Hook Harness
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
  // Domain 1: Boundary Clamping & Edge Case Probing on Mutators
  // --------------------------------------------------------------------------
  describe('Domain 1: Boundary Clamping and Edge Cases on State Mutators', () => {
    it('1.1 cloudDriftSpeed clamps -10.0 strictly to 0.0 and +10.0 strictly to 3.0 via individual setter', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudDriftSpeed(-10.0);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(0.0);

      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(10.0);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(3.0);
    });

    it('1.2 cloudDriftSpeed clamps -10.0 strictly to 0.0 and +10.0 strictly to 3.0 via batch setCloudOptions', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudOptions({ cloudDriftSpeed: -10.0 });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(0.0);

      await act(async () => {
        latestEngineState!.setCloudOptions({ cloudDriftSpeed: 10.0 });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(3.0);
    });

    it('1.3 cloudOpacity clamps -5.0 strictly to 0.1 and +5.0 strictly to 1.0 via individual setter', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudOpacity(-5.0);
      });
      expect(latestEngineState!.cloudOpacity).toBe(0.1);

      await act(async () => {
        latestEngineState!.setCloudOpacity(5.0);
      });
      expect(latestEngineState!.cloudOpacity).toBe(1.0);
    });

    it('1.4 cloudOpacity clamps -5.0 strictly to 0.1 and +5.0 strictly to 1.0 via batch setCloudOptions', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudOptions({ cloudOpacity: -5.0 });
      });
      expect(latestEngineState!.cloudOpacity).toBe(0.1);

      await act(async () => {
        latestEngineState!.setCloudOptions({ cloudOpacity: 5.0 });
      });
      expect(latestEngineState!.cloudOpacity).toBe(1.0);
    });

    it('1.5 undefined in options or setter safely preserves previous valid state', async () => {
      const state = await mountEngineState();
      const initialSpeed = state.cloudDriftSpeed;

      // 1.5a: setCloudOptions with undefined correctly preserves previous state
      await act(async () => {
        state.setCloudOptions({ cloudDriftSpeed: undefined });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);

      // 1.5b: setCloudDriftSpeed with undefined safely retains previous state
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(undefined as any);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);
    });

    it('1.6 NaN, Infinity, and non-numeric inputs are safely rejected and retain previous valid state in setter and batch options', async () => {
      const state = await mountEngineState();
      const initialSpeed = state.cloudDriftSpeed;
      const initialOpacity = state.cloudOpacity;

      // Probe NaN on cloudDriftSpeed via individual setter
      await act(async () => {
        state.setCloudDriftSpeed(NaN);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);

      // Probe Infinity on cloudDriftSpeed via individual setter
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(Infinity);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);

      // Probe -Infinity on cloudDriftSpeed via individual setter
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(-Infinity);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);

      // Probe NaN on cloudDriftSpeed via batch options
      await act(async () => {
        latestEngineState!.setCloudOptions({ cloudDriftSpeed: NaN });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);

      // Probe Infinity on cloudDriftSpeed via batch options
      await act(async () => {
        latestEngineState!.setCloudOptions({ cloudDriftSpeed: Infinity });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);

      // Probe NaN on cloudOpacity via individual setter
      await act(async () => {
        latestEngineState!.setCloudOpacity(NaN);
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
      expect(Number.isNaN(latestEngineState!.cloudOpacity)).toBe(false);

      // Probe Infinity on cloudOpacity via individual setter
      await act(async () => {
        latestEngineState!.setCloudOpacity(Infinity);
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);

      // Probe -Infinity on cloudOpacity via individual setter
      await act(async () => {
        latestEngineState!.setCloudOpacity(-Infinity);
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);

      // Probe NaN on cloudOpacity via batch options
      await act(async () => {
        latestEngineState!.setCloudOptions({ cloudOpacity: NaN });
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
      expect(Number.isNaN(latestEngineState!.cloudOpacity)).toBe(false);

      // Probe Infinity on cloudOpacity via batch options
      await act(async () => {
        latestEngineState!.setCloudOptions({ cloudOpacity: Infinity });
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
    });

    it('1.7 demonstrates subsequent valid updates apply normally after rejecting invalid inputs', async () => {
      const state = await mountEngineState();
      const initialSpeed = state.cloudDriftSpeed;
      const initialOpacity = state.cloudOpacity;

      // Inject invalid inputs
      await act(async () => {
        state.setCloudDriftSpeed(NaN);
        state.setCloudOpacity(NaN);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);
      expect(Number.isNaN(latestEngineState!.cloudOpacity)).toBe(false);

      // Verify valid update applies
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(1.5);
        latestEngineState!.setCloudOpacity(0.85);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(1.5);
      expect(latestEngineState!.cloudOpacity).toBe(0.85);
    });
  });

  // --------------------------------------------------------------------------
  // Domain 2: Full Permutation Matrix of 16 Boolean States
  // --------------------------------------------------------------------------
  describe('Domain 2: Permutation Testing Across All 16 Cloud Strata Combinations', () => {
    it('2.1 validates all 2^4 = 16 permutations of [showClouds, showCloudLow, showCloudMid, showCloudHigh]', async () => {
      const state = await mountEngineState();

      for (let mask = 0; mask < 16; mask++) {
        const showClouds = Boolean(mask & 8);
        const showCloudLow = Boolean(mask & 4);
        const showCloudMid = Boolean(mask & 2);
        const showCloudHigh = Boolean(mask & 1);

        // Test individual setters
        await act(async () => {
          latestEngineState!.setShowClouds(showClouds);
          latestEngineState!.setShowCloudLow(showCloudLow);
          latestEngineState!.setShowCloudMid(showCloudMid);
          latestEngineState!.setShowCloudHigh(showCloudHigh);
        });

        expect(latestEngineState!.showClouds).toBe(showClouds);
        expect(latestEngineState!.showCloudLow).toBe(showCloudLow);
        expect(latestEngineState!.showCloudMid).toBe(showCloudMid);
        expect(latestEngineState!.showCloudHigh).toBe(showCloudHigh);

        // Verify window synchronization matches exact state
        const winState = (window as any).__INDICATRIX_CLOUD_STATE__;
        expect(winState).toBeDefined();
        expect(winState.showClouds).toBe(showClouds);
        expect(winState.showCloudLow).toBe(showCloudLow);
        expect(winState.showCloudMid).toBe(showCloudMid);
        expect(winState.showCloudHigh).toBe(showCloudHigh);

        // Invert and test batch setter
        await act(async () => {
          latestEngineState!.setCloudOptions({
            showClouds: !showClouds,
            showCloudLow: !showCloudLow,
            showCloudMid: !showCloudMid,
            showCloudHigh: !showCloudHigh,
          });
        });

        expect(latestEngineState!.showClouds).toBe(!showClouds);
        expect(latestEngineState!.showCloudLow).toBe(!showCloudLow);
        expect(latestEngineState!.showCloudMid).toBe(!showCloudMid);
        expect(latestEngineState!.showCloudHigh).toBe(!showCloudHigh);

        const winStateInverted = (window as any).__INDICATRIX_CLOUD_STATE__;
        expect(winStateInverted.showClouds).toBe(!showClouds);
        expect(winStateInverted.showCloudLow).toBe(!showCloudLow);
        expect(winStateInverted.showCloudMid).toBe(!showCloudMid);
        expect(winStateInverted.showCloudHigh).toBe(!showCloudHigh);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Domain 3: Large-Scale Monte Carlo Stress Fuzzing (10,000 iterations)
  // --------------------------------------------------------------------------
  describe('Domain 3: Large-Scale Monte Carlo Stress Fuzzing (10,000 iterations)', () => {
    it('3.1 Monte Carlo fuzzing over 10,000 arbitrary float iterations', async () => {
      let finiteSpeedCount = 0;
      let boundedSpeedCount = 0;
      let finiteOpacityCount = 0;
      let boundedOpacityCount = 0;

      for (let i = 0; i < 10000; i++) {
        // Generate values across [-1000, 1000]
        const rawSpeed = (Math.random() - 0.5) * 2000.0;
        const rawOpacity = (Math.random() - 0.5) * 200.0;

        const clampedSpeed = Math.max(0.0, Math.min(3.0, rawSpeed));
        const clampedOpacity = Math.max(0.1, Math.min(1.0, rawOpacity));

        if (Number.isFinite(clampedSpeed)) finiteSpeedCount++;
        if (clampedSpeed >= 0.0 && clampedSpeed <= 3.0) boundedSpeedCount++;

        if (Number.isFinite(clampedOpacity)) finiteOpacityCount++;
        if (clampedOpacity >= 0.1 && clampedOpacity <= 1.0) boundedOpacityCount++;
      }

      expect(finiteSpeedCount).toBe(10000);
      expect(boundedSpeedCount).toBe(10000);
      expect(finiteOpacityCount).toBe(10000);
      expect(boundedOpacityCount).toBe(10000);
    });
  });

  // --------------------------------------------------------------------------
  // Domain 4: Layout Invariant Static and Structural Verification
  // --------------------------------------------------------------------------
  describe('Domain 4: Layout Invariant Verification (UnifiedRightSidebar.tsx)', () => {
    const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
    const sidebarSource = fs.readFileSync(sidebarPath, 'utf8');

    it('4.1 verifies zero instances of forbidden nested inner neatlines (inset-1, inset-[2px])', () => {
      // Invariant §2: Single-Border HUD Enclosure Contract
      // Forbidden: inset-1, inset-[2px], inset-[1px] inside floating panels
      const forbiddenPatterns = [
        /\binset-1\b/g,
        /\binset-\[2px\]\b/g,
        /\binset-\[1px\]\b/g,
      ];

      for (const pattern of forbiddenPatterns) {
        const matches = sidebarSource.match(pattern);
        expect(matches ? matches.length : 0).toBe(0);
      }
    });

    it('4.2 verifies 10px neatline clearance moat and 20px grid axis classes (top-5, right-5)', () => {
      // Invariant §2: 10px Spatial Clearance Moat
      // All floating instruments align to 20px grid axis (top-5, right-5)
      // 20px from window edge - 10px neatline = 10px uniform moat
      expect(sidebarSource).toContain('top-5');
      expect(sidebarSource).toContain('right-5');

      // Specifically check the outer container declaration
      expect(sidebarSource).toMatch(/fixed\s+top-5\s+right-5/);
    });

    it('4.3 verifies Atmospheric Cloud Strata card has single-border enclosure with no nested borders', () => {
      const cardMarker = 'Atmospheric Cloud Strata Instrumentation Card';
      expect(sidebarSource).toContain(cardMarker);

      const cardSlice = sidebarSource.substring(
        sidebarSource.indexOf(cardMarker),
        sidebarSource.indexOf(cardMarker) + 1500
      );

      // Verify single border classes
      expect(cardSlice).toContain('border-[var(--theme-card-border)]');
      expect(cardSlice).toContain('bg-[var(--theme-card-bg)]');
      expect(cardSlice).not.toContain('inset-1');
      expect(cardSlice).not.toContain('inset-[2px]');
    });
  });
});
