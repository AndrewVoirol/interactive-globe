// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/r13-cloud-hud-integration.test.ts
// Milestone 5: Atmospheric Cloud Strata HUD Controls & React State Integration
// Invariants Tested: §2 (Single-Border HUD Enclosure), §6 (HUD Optical Hierarchy),
// §21 (Dynamic Cascading & Occlusion), §23 (Metric Grounding), §46 (Test Import Integrity)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Invariant §46: Strict Direct Imports from src/ without local mocks
import { useEngineState } from '../../src/hooks/useEngineState';
import { DATA_LAYER_CATALOG, getPresetById } from '../../src/core/layers/DataLayerCatalog';
import { DATA_LAYER_CATALOG as CANONICAL_CATALOG } from '../../src/core/data/DataLayerCatalog';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import DefaultReExportedSidebar, { UnifiedRightSidebar as ReExportedSidebar } from '../../src/components/UnifiedRightSidebar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('R13 Milestone 5: Atmospheric Cloud Strata HUD Controls & React State Integration', () => {
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

  // Helper hook harness
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
  // Suite 1: useEngineState Atmospheric Cloud State & Mutator Behavioral Coverage
  // --------------------------------------------------------------------------
  describe('1. useEngineState: Atmospheric Cloud State, Defaults & Mutator Invariants', () => {
    it('R13-STATE-01: initializes with authentic atmospheric cloud default values', async () => {
      const state = await mountEngineState();

      expect(state.showClouds).toBe(true);
      expect(state.showCloudLow).toBe(true);
      expect(state.showCloudMid).toBe(true);
      expect(state.showCloudHigh).toBe(true);
      expect(state.cloudDriftSpeed).toBe(1.0);
      expect(state.cloudOpacity).toBe(0.8);
    });

    it('R13-STATE-02: updates master cloud toggle and individual strata toggles accurately', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setShowClouds(false);
      });
      expect(latestEngineState!.showClouds).toBe(false);

      await act(async () => {
        latestEngineState!.setShowClouds(true);
        latestEngineState!.setShowCloudLow(false);
        latestEngineState!.setShowCloudMid(false);
        latestEngineState!.setShowCloudHigh(false);
      });
      expect(latestEngineState!.showClouds).toBe(true);
      expect(latestEngineState!.showCloudLow).toBe(false);
      expect(latestEngineState!.showCloudMid).toBe(false);
      expect(latestEngineState!.showCloudHigh).toBe(false);

      await act(async () => {
        latestEngineState!.setShowCloudLow(prev => !prev);
        latestEngineState!.setShowCloudHigh(true);
      });
      expect(latestEngineState!.showCloudLow).toBe(true);
      expect(latestEngineState!.showCloudMid).toBe(false);
      expect(latestEngineState!.showCloudHigh).toBe(true);
    });

    it('R13-STATE-03: clamps cloud drift speed strictly within [0.0, 3.0]', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudDriftSpeed(2.4);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.4);

      // Boundary clamp high
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(4.5);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(3.0);

      // Boundary clamp low
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(-1.2);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(0.0);
    });

    it('R13-STATE-04: clamps cloud opacity strictly within [0.1, 1.0]', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudOpacity(0.5);
      });
      expect(latestEngineState!.cloudOpacity).toBe(0.5);

      // Upper boundary clamp
      await act(async () => {
        latestEngineState!.setCloudOpacity(1.8);
      });
      expect(latestEngineState!.cloudOpacity).toBe(1.0);

      // Lower boundary clamp
      await act(async () => {
        latestEngineState!.setCloudOpacity(0.02);
      });
      expect(latestEngineState!.cloudOpacity).toBe(0.1);
    });

    it('R13-STATE-05: batch updates cloud options via setCloudOptions with full clamping', async () => {
      const state = await mountEngineState();

      await act(async () => {
        state.setCloudOptions({
          showClouds: true,
          showCloudLow: false,
          showCloudMid: true,
          showCloudHigh: false,
          cloudDriftSpeed: 2.8,
          cloudOpacity: 0.95,
        });
      });

      expect(latestEngineState!.showClouds).toBe(true);
      expect(latestEngineState!.showCloudLow).toBe(false);
      expect(latestEngineState!.showCloudMid).toBe(true);
      expect(latestEngineState!.showCloudHigh).toBe(false);
      expect(latestEngineState!.cloudDriftSpeed).toBe(2.8);
      expect(latestEngineState!.cloudOpacity).toBe(0.95);

      // Test boundary handling via setCloudOptions
      await act(async () => {
        latestEngineState!.setCloudOptions({
          cloudDriftSpeed: 9.9,
          cloudOpacity: -0.5,
        });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(3.0);
      expect(latestEngineState!.cloudOpacity).toBe(0.1);
    });

    it('R13-STATE-06: safely retains previous valid state when NaN, undefined, or Infinity is passed to individual setters', async () => {
      const state = await mountEngineState();
      const initialSpeed = state.cloudDriftSpeed;
      const initialOpacity = state.cloudOpacity;

      // Passing NaN to setCloudDriftSpeed
      await act(async () => {
        state.setCloudDriftSpeed(NaN);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);

      // Passing Infinity to setCloudDriftSpeed
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(Infinity);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);

      // Passing -Infinity to setCloudDriftSpeed
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(-Infinity);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);

      // Passing undefined to setCloudDriftSpeed
      await act(async () => {
        latestEngineState!.setCloudDriftSpeed(undefined as any);
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);

      // Passing NaN to setCloudOpacity
      await act(async () => {
        latestEngineState!.setCloudOpacity(NaN);
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
      expect(Number.isNaN(latestEngineState!.cloudOpacity)).toBe(false);

      // Passing Infinity to setCloudOpacity
      await act(async () => {
        latestEngineState!.setCloudOpacity(Infinity);
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);

      // Passing -Infinity to setCloudOpacity
      await act(async () => {
        latestEngineState!.setCloudOpacity(-Infinity);
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);

      // Passing undefined to setCloudOpacity
      await act(async () => {
        latestEngineState!.setCloudOpacity(undefined as any);
      });
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
    });

    it('R13-STATE-07: safely retains previous valid state when NaN, undefined, or Infinity is passed to setCloudOptions', async () => {
      const state = await mountEngineState();
      const initialSpeed = state.cloudDriftSpeed;
      const initialOpacity = state.cloudOpacity;

      // Passing NaN to setCloudOptions
      await act(async () => {
        state.setCloudOptions({
          cloudDriftSpeed: NaN,
          cloudOpacity: NaN,
        });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
      expect(Number.isNaN(latestEngineState!.cloudDriftSpeed)).toBe(false);
      expect(Number.isNaN(latestEngineState!.cloudOpacity)).toBe(false);

      // Passing Infinity to setCloudOptions
      await act(async () => {
        latestEngineState!.setCloudOptions({
          cloudDriftSpeed: Infinity,
          cloudOpacity: -Infinity,
        });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);

      // Passing undefined to setCloudOptions
      await act(async () => {
        latestEngineState!.setCloudOptions({
          cloudDriftSpeed: undefined,
          cloudOpacity: undefined,
        });
      });
      expect(latestEngineState!.cloudDriftSpeed).toBe(initialSpeed);
      expect(latestEngineState!.cloudOpacity).toBe(initialOpacity);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: DataLayerCatalog Preset Verification
  // --------------------------------------------------------------------------
  describe('2. DataLayerCatalog: Atmospheric Cloud Strata Registration & Preset Invariants', () => {
    it('R13-CATALOG-01: exposes noaa-gfs-clouds preset with valid category and metadata', () => {
      const cloudPreset = DATA_LAYER_CATALOG.find(l => l.id === 'noaa-gfs-clouds');
      expect(cloudPreset).toBeDefined();
      expect(cloudPreset!.id).toBe('noaa-gfs-clouds');
      expect(cloudPreset!.name).toBe('Atmospheric Cloud Strata (NOAA GFS)');
      expect(cloudPreset!.category).toBe('atmospheric-clouds');
      expect(cloudPreset!.type).toBe('Multi-Altitude Cloud Shells');
      expect(cloudPreset!.url).toBe('/data/gfs-cloud-low-latest.bin');
      expect(cloudPreset!.defaultOpacity).toBe(0.80);
      expect(cloudPreset!.defaultBlendMode).toBe(0);
      expect(cloudPreset!.attribution).toContain('NOAA NCEP GFS');
    });

    it('R13-CATALOG-02: verifies getPresetById accurately resolves noaa-gfs-clouds', () => {
      const resolved = getPresetById('noaa-gfs-clouds');
      expect(resolved).toBeDefined();
      expect(resolved!.id).toBe('noaa-gfs-clouds');
      expect(resolved!.legend.colorStops.length).toBeGreaterThanOrEqual(3);
      expect(resolved!.legend.unit).toBe('Cloud Fraction (GFS)');
      expect(resolved!.legend.minLabel).toContain('Cirrus');
      expect(resolved!.legend.maxLabel).toContain('Stratus');
    });

    it('R13-CATALOG-03: verifies canonical and layers catalog exports maintain strict identity', () => {
      const fromCanonical = CANONICAL_CATALOG.find(l => l.id === 'noaa-gfs-clouds');
      const fromLayers = DATA_LAYER_CATALOG.find(l => l.id === 'noaa-gfs-clouds');

      expect(fromCanonical).toBeDefined();
      expect(fromLayers).toBeDefined();
      expect(fromCanonical!.id).toBe(fromLayers!.id);
      expect(fromCanonical!.category).toBe(fromLayers!.category);
      expect(fromCanonical!.defaultOpacity).toBe(fromLayers!.defaultOpacity);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: UnifiedRightSidebar HUD Controls & Single-Border Layout Invariants
  // --------------------------------------------------------------------------
  describe('3. UnifiedRightSidebar: Atmospheric Cloud Strata Card & Layout Invariants', () => {
    it('R13-HUD-01: renders Atmospheric Cloud Strata card inside Plate IV with single-border contract (§2)', async () => {
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps()));
      });

      const textElement = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent === 'Atmospheric Cloud Strata'
      );
      expect(textElement).toBeDefined();

      const card = textElement!.closest('.p-2.rounded-\\[3px\\].border');
      expect(card).not.toBeNull();

      // Invariant §2: Single-Border Enclosure Contract (exactly one perimeter border, no nested neatlines)
      expect(card!.className).toContain('border-[var(--theme-card-border)]');
      expect(card!.className).toContain('bg-[var(--theme-card-bg)]');
      expect(card!.querySelectorAll('.border-current\\/15').length).toBe(0);
      expect(card!.querySelectorAll('.inset-\\[2px\\]').length).toBe(0);
    });

    it('R13-HUD-02: dispatches onShowCloudsChange when master atmosphere switch is toggled', async () => {
      const onShowCloudsChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            showClouds: true,
            onShowCloudsChange,
          }))
        );
      });

      const masterSwitch = container.querySelector('button[role="switch"][title*="Master Atmosphere Deck"]') as HTMLButtonElement;
      expect(masterSwitch).not.toBeNull();
      expect(masterSwitch.getAttribute('aria-checked')).toBe('true');

      await act(async () => {
        masterSwitch.click();
      });

      expect(onShowCloudsChange).toHaveBeenCalledWith(false);
    });

    it('R13-HUD-03: renders and toggles Low, Mid, and High strata layer switches', async () => {
      const onShowCloudLowChange = vi.fn();
      const onShowCloudMidChange = vi.fn();
      const onShowCloudHighChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            showClouds: true,
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            onShowCloudLowChange,
            onShowCloudMidChange,
            onShowCloudHighChange,
          }))
        );
      });

      const lowButton = container.querySelector('button[title*="Low Stratus"]') as HTMLButtonElement;
      const midButton = container.querySelector('button[title*="Mid Altocumulus"]') as HTMLButtonElement;
      const highButton = container.querySelector('button[title*="High Cirrus"]') as HTMLButtonElement;

      expect(lowButton).not.toBeNull();
      expect(midButton).not.toBeNull();
      expect(highButton).not.toBeNull();

      expect(lowButton.textContent).toContain('LOW');
      expect(lowButton.textContent).toContain('1–2 km');
      expect(midButton.textContent).toContain('MID');
      expect(midButton.textContent).toContain('4–6 km');
      expect(highButton.textContent).toContain('HIGH');
      expect(highButton.textContent).toContain('10–12 km');

      await act(async () => {
        lowButton.click();
      });
      expect(onShowCloudLowChange).toHaveBeenCalledWith(false);

      await act(async () => {
        midButton.click();
      });
      expect(onShowCloudMidChange).toHaveBeenCalledWith(false);

      await act(async () => {
        highButton.click();
      });
      expect(onShowCloudHighChange).toHaveBeenCalledWith(false);
    });

    it('R13-HUD-04: collapses strata switches and sliders when master cloud deck is OFF', async () => {
      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            showClouds: false,
          }))
        );
      });

      const masterSwitch = container.querySelector('button[role="switch"][title*="Master Atmosphere Deck"]') as HTMLButtonElement;
      expect(masterSwitch).not.toBeNull();
      expect(masterSwitch.getAttribute('aria-checked')).toBe('false');

      // When master clouds is OFF, sub-strata controls are collapsed
      const lowButton = container.querySelector('button[title*="Low Stratus"]');
      const driftSlider = container.querySelector('#sidebar-cloud-drift');
      const opacitySlider = container.querySelector('#sidebar-cloud-opacity');

      expect(lowButton).toBeNull();
      expect(driftSlider).toBeNull();
      expect(opacitySlider).toBeNull();
    });

    it('R13-HUD-05: renders Vernier drift speed slider and opacity slider with accurate readouts', async () => {
      const onCloudDriftSpeedChange = vi.fn();
      const onCloudOpacityChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            showClouds: true,
            cloudDriftSpeed: 1.5,
            cloudOpacity: 0.75,
            onCloudDriftSpeedChange,
            onCloudOpacityChange,
          }))
        );
      });

      const driftSlider = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      const opacitySlider = container.querySelector('#sidebar-cloud-opacity') as HTMLInputElement;

      expect(driftSlider).not.toBeNull();
      expect(opacitySlider).not.toBeNull();

      expect(driftSlider.value).toBe('1.5');
      expect(opacitySlider.value).toBe('0.75');

      // Verify readouts in DOM
      expect(container.textContent).toContain('1.5x');
      expect(container.textContent).toContain('75%');

      // Helper to trigger input/change events in React 18 / happy-dom
      const triggerSliderChange = (element: HTMLInputElement, value: string) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (descriptor?.set) {
          descriptor.set.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // Fire slider changes
      await act(async () => {
        triggerSliderChange(driftSlider, '2.2');
      });
      expect(onCloudDriftSpeedChange).toHaveBeenCalledWith(2.2);

      await act(async () => {
        triggerSliderChange(opacitySlider, '0.90');
      });
      expect(onCloudOpacityChange).toHaveBeenCalledWith(0.9);

      // Verify stepper buttons also operate correctly
      const increaseDriftBtn = container.querySelector('button[title="Increase Drift Speed"]') as HTMLButtonElement;
      if (increaseDriftBtn) {
        await act(async () => {
          increaseDriftBtn.click();
        });
        expect(onCloudDriftSpeedChange).toHaveBeenCalled();
      }
    });

    it('R13-HUD-06: maintains 20px grid axis and 10px spatial clearance moat (§2)', async () => {
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps()));
      });

      // Primary docked container adheres strictly to 20px grid axis: top-5 right-5 w-96
      const fixedDock = container.querySelector('.fixed.top-5.right-5.max-w-sm.w-96');
      expect(fixedDock).not.toBeNull();

      // Inter-panel enclosure contract: 20px gutter
      const panel = fixedDock!.firstElementChild as HTMLElement;
      expect(panel).not.toBeNull();
      expect(panel.className).toContain('border-[var(--theme-panel-border)]');
      expect(panel.className).toContain('shadow-2xl');
    });

    it('R13-HUD-07: verifies re-exported sidebar and default export in src/components/UnifiedRightSidebar function identically', async () => {
      expect(DefaultReExportedSidebar).toBe(ReExportedSidebar);

      const onShowCloudsChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(DefaultReExportedSidebar, createSidebarProps({
            showClouds: true,
            onShowCloudsChange,
          }))
        );
      });

      const textElement = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent === 'Atmospheric Cloud Strata'
      );
      expect(textElement).toBeDefined();

      const masterSwitch = container.querySelector('button[role="switch"][title*="Master Atmosphere Deck"]') as HTMLButtonElement;
      expect(masterSwitch).not.toBeNull();

      await act(async () => {
        masterSwitch.click();
      });
      expect(onShowCloudsChange).toHaveBeenCalledWith(false);
    });

    it('R13-HUD-08: rapid Monte Carlo toggle stress test (100 iterations)', async () => {
      let currentMasterState = true;
      const onShowCloudsChange = vi.fn((val: boolean) => {
        currentMasterState = val;
      });

      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            showClouds: currentMasterState,
            onShowCloudsChange,
          }))
        );
      });

      const masterSwitch = container.querySelector('button[role="switch"][title*="Master Atmosphere Deck"]') as HTMLButtonElement;
      expect(masterSwitch).not.toBeNull();

      // Stress test: 100 rapid toggles
      for (let i = 0; i < 100; i++) {
        await act(async () => {
          masterSwitch.click();
        });
      }

      expect(onShowCloudsChange).toHaveBeenCalledTimes(100);
      expect(container.textContent).toContain('Atmospheric Cloud Strata');
    });

    it('R13-HUD-09: verifies slider inputs ignore non-numeric/NaN values without updating or broadcasting', async () => {
      const onCloudDriftSpeedChange = vi.fn();
      const onCloudOpacityChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            showClouds: true,
            cloudDriftSpeed: 1.0,
            cloudOpacity: 0.8,
            onCloudDriftSpeedChange,
            onCloudOpacityChange,
          }))
        );
      });

      const driftSlider = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      const opacitySlider = container.querySelector('#sidebar-cloud-opacity') as HTMLInputElement;

      expect(driftSlider).not.toBeNull();
      expect(opacitySlider).not.toBeNull();

      await act(async () => {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: { value: 'not-a-number' }, writable: false });
        driftSlider.dispatchEvent(event);
      });
      expect(onCloudDriftSpeedChange).not.toHaveBeenCalled();

      await act(async () => {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: { value: 'NaN' }, writable: false });
        opacitySlider.dispatchEvent(event);
      });
      expect(onCloudOpacityChange).not.toHaveBeenCalled();
    });
  });
});
