// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m5-hud-integrity.test.ts
// Architecture: STAGE 4 Alive Planet Atmosphere — Milestone 5 Challenger
// Adversarial Challenger Suite: HUD Integration, State Fuzzing & Invariant Auditing
// Invariants Tested: §2 (Single-Border HUD Enclosure), §6 (HUD Optical Hierarchy),
// §21 (Dynamic Cascading & Occlusion), §24 (Uniform-Buffer Driven), §46 (Test Import Integrity)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Invariant §46: Strict Direct Imports from production src/
import { useEngineState } from '../../src/hooks/useEngineState';
import { DATA_LAYER_CATALOG, getPresetById } from '../../src/core/layers/DataLayerCatalog';
import { DATA_LAYER_CATALOG as CANONICAL_CATALOG } from '../../src/core/data/DataLayerCatalog';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { UnifiedRightSidebar as ReExportedSidebar } from '../../src/components/UnifiedRightSidebar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger M5: Adversarial HUD Integration & State Integrity Suite', () => {
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

  // --------------------------------------------------------------------------
  // Pillar A: Monte Carlo Fuzzing & State Boundary Stress
  // --------------------------------------------------------------------------
  describe('Pillar A: Monte Carlo Fuzzing & Boundary Stress (10,000 Iterations)', () => {
    it('CHALLENGE-M5-01: executes 10,000 randomized Monte Carlo mutator trials on drift speed and opacity', async () => {
      const state = await mountEngineState();

      for (let i = 0; i < 10000; i++) {
        // Pseudo-random unbounded floats including negative and large numbers
        const rawSpeed = (Math.random() - 0.5) * 20.0;
        const rawOpacity = (Math.random() - 0.5) * 10.0;

        await act(async () => {
          state.setCloudDriftSpeed(rawSpeed);
          state.setCloudOpacity(rawOpacity);
        });

        const curSpeed = latestEngineState!.cloudDriftSpeed;
        const curOpacity = latestEngineState!.cloudOpacity;

        expect(Number.isFinite(curSpeed)).toBe(true);
        expect(curSpeed).toBeGreaterThanOrEqual(0.0);
        expect(curSpeed).toBeLessThanOrEqual(3.0);

        expect(Number.isFinite(curOpacity)).toBe(true);
        expect(curOpacity).toBeGreaterThanOrEqual(0.1);
        expect(curOpacity).toBeLessThanOrEqual(1.0);
      }
    });

    it('CHALLENGE-M5-02: executes 10,000 randomized batch updates via setCloudOptions without state corruption', async () => {
      const state = await mountEngineState();

      for (let i = 0; i < 10000; i++) {
        const randClouds = Math.random() > 0.5;
        const randLow = Math.random() > 0.5;
        const randMid = Math.random() > 0.5;
        const randHigh = Math.random() > 0.5;
        const randSpeed = (Math.random() - 0.5) * 50.0;
        const randOpacity = (Math.random() - 0.5) * 10.0;

        await act(async () => {
          state.setCloudOptions({
            showClouds: randClouds,
            showCloudLow: randLow,
            showCloudMid: randMid,
            showCloudHigh: randHigh,
            cloudDriftSpeed: randSpeed,
            cloudOpacity: randOpacity,
          });
        });

        const s = latestEngineState!;
        expect(s.showClouds).toBe(randClouds);
        expect(s.showCloudLow).toBe(randLow);
        expect(s.showCloudMid).toBe(randMid);
        expect(s.showCloudHigh).toBe(randHigh);

        expect(Number.isFinite(s.cloudDriftSpeed)).toBe(true);
        expect(s.cloudDriftSpeed).toBeGreaterThanOrEqual(0.0);
        expect(s.cloudDriftSpeed).toBeLessThanOrEqual(3.0);

        expect(Number.isFinite(s.cloudOpacity)).toBe(true);
        expect(s.cloudOpacity).toBeGreaterThanOrEqual(0.1);
        expect(s.cloudOpacity).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar B: Global Window Synchronization & Bidirectional Control
  // --------------------------------------------------------------------------
  describe('Pillar B: Global Window Synchronization Invariants', () => {
    it('CHALLENGE-M5-03: verifies window.__INDICATRIX_CLOUD_STATE__ synchronizes on state changes', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudOptions({
          showClouds: true,
          showCloudLow: false,
          showCloudMid: true,
          showCloudHigh: false,
          cloudDriftSpeed: 2.5,
          cloudOpacity: 0.85,
        });
      });

      const winState = (window as any).__INDICATRIX_CLOUD_STATE__;
      expect(winState).toBeDefined();
      expect(winState.showClouds).toBe(true);
      expect(winState.showCloudLow).toBe(false);
      expect(winState.showCloudMid).toBe(true);
      expect(winState.showCloudHigh).toBe(false);
      expect(winState.cloudDriftSpeed).toBe(2.5);
      expect(winState.cloudOpacity).toBe(0.85);
    });

    it('CHALLENGE-M5-04: verifies window.__INDICATRIX_SET_CLOUD_OPTIONS__ updates hook state externally', async () => {
      await mountEngineState();

      const extMutator = (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
      expect(typeof extMutator).toBe('function');

      await act(async () => {
        extMutator({
          showClouds: false,
          cloudDriftSpeed: 0.5,
          cloudOpacity: 0.35,
        });
      });

      expect(latestEngineState!.showClouds).toBe(false);
      expect(latestEngineState!.cloudDriftSpeed).toBe(0.5);
      expect(latestEngineState!.cloudOpacity).toBe(0.35);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar C: Layout Architecture & Single-Border Enclosure Contract (Invariant §2)
  // --------------------------------------------------------------------------
  describe('Pillar C: Layout Invariants & Single-Border Enclosure Contract (§2, §6, §21)', () => {
    it('CHALLENGE-M5-05: verifies Atmospheric Cloud Strata card conforms to single-border contract (§2)', async () => {
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ showClouds: true })));
      });

      const span = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent === 'Atmospheric Cloud Strata'
      );
      expect(span).toBeDefined();

      const card = span!.closest('.p-2.rounded-\\[3px\\].border');
      expect(card).not.toBeNull();

      // Exactly one perimeter border: border border-[var(--theme-card-border)]
      expect(card!.classList.contains('border')).toBe(true);
      // Must NOT contain nested neatlines or inner boxes
      expect(card!.querySelectorAll('.inset-1').length).toBe(0);
      expect(card!.querySelectorAll('.inset-\\[2px\\]').length).toBe(0);
      expect(card!.querySelectorAll('.border-current\\/15').length).toBe(0);
    });

    it('CHALLENGE-M5-06: verifies master deck toggle collapses sub-strata controls without residual DOM artifacts', async () => {
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ showClouds: false })));
      });

      // Sub-strata buttons and Vernier sliders must NOT be present when showClouds is false
      expect(container.querySelector('button[title*="Low Stratus"]')).toBeNull();
      expect(container.querySelector('button[title*="Mid Altocumulus"]')).toBeNull();
      expect(container.querySelector('button[title*="High Cirrus"]')).toBeNull();
      expect(container.querySelector('#sidebar-cloud-drift')).toBeNull();
      expect(container.querySelector('#sidebar-cloud-opacity')).toBeNull();
    });

    it('CHALLENGE-M5-07: verifies master deck toggle renders all 3 altitude layers and Vernier controls when active', async () => {
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ showClouds: true })));
      });

      const lowBtn = container.querySelector('button[title*="Low Stratus"]');
      const midBtn = container.querySelector('button[title*="Mid Altocumulus"]');
      const highBtn = container.querySelector('button[title*="High Cirrus"]');
      const driftSlider = container.querySelector('#sidebar-cloud-drift');
      const opacitySlider = container.querySelector('#sidebar-cloud-opacity');

      expect(lowBtn).not.toBeNull();
      expect(midBtn).not.toBeNull();
      expect(highBtn).not.toBeNull();
      expect(driftSlider).not.toBeNull();
      expect(opacitySlider).not.toBeNull();

      // Verify layer altitude sublabels
      expect(lowBtn!.textContent).toContain('1–2 km');
      expect(midBtn!.textContent).toContain('4–6 km');
      expect(highBtn!.textContent).toContain('10–12 km');
    });
  });

  // --------------------------------------------------------------------------
  // Pillar D: DataLayerCatalog Parity & Dual Export Integrity
  // --------------------------------------------------------------------------
  describe('Pillar D: DataLayerCatalog & Invariant §46 Direct Import Integrity', () => {
    it('CHALLENGE-M5-08: verifies catalog preset conforms to NOAA GFS Cloud Shell interface contract', () => {
      const preset = getPresetById('noaa-gfs-clouds');
      expect(preset).toBeDefined();
      expect(preset!.id).toBe('noaa-gfs-clouds');
      expect(preset!.category).toBe('atmospheric-clouds');
      expect(preset!.type).toBe('Multi-Altitude Cloud Shells');
      expect(preset!.url).toBe('/data/gfs-cloud-low-latest.bin');
      expect(preset!.defaultOpacity).toBe(0.80);
      expect(preset!.defaultBlendMode).toBe(0);
      expect(preset!.legend.unit).toBe('Cloud Fraction (GFS)');
      expect(preset!.legend.colorStops.length).toBeGreaterThanOrEqual(3);
    });

    it('CHALLENGE-M5-09: confirms zero mock implementations — all imports resolve from src/', () => {
      expect(DATA_LAYER_CATALOG).toStrictEqual(CANONICAL_CATALOG);
      expect(UnifiedRightSidebar).toBeDefined();
      expect(ReExportedSidebar).toBeDefined();
      expect(useEngineState).toBeDefined();
    });
  });
});
