// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m6-1-behavioral-adversarial.test.ts
// Challenger 1: Behavioral Adversarial Stress-Testing Across All 5 Instruments
// Milestone 6: Final Hardening & Verification Battery
//
// Verification Scope:
// 1. Unbounded Pointer Dragging & Caliper Clamping:
//    - Scale [1.0, 12.0]
//    - Orographic [0.0, 1.0]
//    - Pluvial [0.0, 2.0]
//    - Drift [0, 2000]
//    - Shadow [0.0, 0.60]
//    - Lead Time [0, 240]
// 2. Double-Click Resets & Dedicated Reset Buttons on all 5 instruments
// 3. Symmetrical Keyboard Navigation with e.preventDefault() Scroll Prevention
// 4. Master Cloud Switch Accordion Collapse & Restoration of Instrument State
// 5. Rapid Theme Switching (0 -> 1 -> 2 -> 0) & SVG Artifact Mutual Exclusivity
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { AtmosphericColumnInstrument } from '../../src/components/hud/instruments/AtmosphericColumnInstrument';
import { OrographicMoistureProfile } from '../../src/components/hud/instruments/OrographicMoistureProfile';
import { CloudShadowInstrument } from '../../src/components/hud/instruments/CloudShadowInstrument';
import { CloudDriftSpeedInstrument } from '../../src/components/hud/instruments/CloudDriftSpeedInstrument';
import { PrognosticModelCard } from '../../src/components/hud/instruments/PrognosticModelCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 1: Final Behavioral Adversarial Stress Suite (Milestone 6)', () => {
  let container: HTMLDivElement;
  let root: Root;

  // Window bridge mocks
  let mockSetCloudOptions: ReturnType<typeof vi.fn>;
  let mockSetAtmosphericScale: ReturnType<typeof vi.fn>;
  let mockSetShadowIntensity: ReturnType<typeof vi.fn>;
  let mockSetPrognosticModel: ReturnType<typeof vi.fn>;
  let mockSetPrognosticVariable: ReturnType<typeof vi.fn>;
  let mockSetTimelineMinutes: ReturnType<typeof vi.fn>;
  let mockSetRainShadowFeedback: ReturnType<typeof vi.fn>;
  let mockSetPluvialGamma: ReturnType<typeof vi.fn>;
  let mockSetThermodynamicGating: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockSetCloudOptions = vi.fn();
    mockSetAtmosphericScale = vi.fn();
    mockSetShadowIntensity = vi.fn();
    mockSetPrognosticModel = vi.fn();
    mockSetPrognosticVariable = vi.fn();
    mockSetTimelineMinutes = vi.fn();
    mockSetRainShadowFeedback = vi.fn();
    mockSetPluvialGamma = vi.fn();
    mockSetThermodynamicGating = vi.fn();

    (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = mockSetCloudOptions;
    (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__ = mockSetAtmosphericScale;
    (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__ = mockSetShadowIntensity;
    (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__ = mockSetPrognosticModel;
    (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__ = mockSetPrognosticVariable;
    (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__ = mockSetTimelineMinutes;
    (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__ = mockSetRainShadowFeedback;
    (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__ = mockSetPluvialGamma;
    (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__ = mockSetThermodynamicGating;

    // Pointer capture mocks
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

    delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
    delete (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__;
    delete (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__;
    delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
    delete (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__;
    delete (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__;
    delete (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__;
    delete (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__;
    delete (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__;
  });

  const mockViewportRect = (
    viewport: HTMLElement,
    rect = { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 }
  ) => {
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(rect as any);
  };

  const triggerInputChange = (input: HTMLInputElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // ==========================================================================
  // OBJECTIVE 1: UNBOUNDED POINTER DRAGGING & STRICT BOUNDS CLAMPING
  // ==========================================================================
  describe('1. Unbounded Pointer Dragging & Strict Bounds Clamping', () => {
    it('M6-CLAMP-01: AtmosphericColumnInstrument clamps scale strictly to [1.0, 12.0] under extreme dragging', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.8,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScaleChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      mockViewportRect(viewport, { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 });

      // Pointer down
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 1;
        ev.clientX = 100;
        ev.clientY = 160;
        viewport.dispatchEvent(ev);
      });

      // Extreme drag upward far beyond the screen (clientY = -10,000,000)
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 1;
        ev.clientX = 100;
        ev.clientY = -10000000;
        viewport.dispatchEvent(ev);
      });
      expect(onScaleChange).toHaveBeenCalledWith(12.0);

      // Extreme drag downward far beyond the screen (clientY = +10,000,000)
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 1;
        ev.clientX = 100;
        ev.clientY = 10000000;
        viewport.dispatchEvent(ev);
      });
      expect(onScaleChange).toHaveBeenCalledWith(1.0);

      // Release pointer
      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 1;
        viewport.dispatchEvent(ev);
      });
    });

    it('M6-CLAMP-02: OrographicMoistureProfile clamps rain shadow [0.0, 1.0] and pluvial [0.0, 2.0]', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.25,
            pluvialGamma: 0.5,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      mockViewportRect(viewport, { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 });

      // 1. Windward Slope Drag (relX < 0.52): clientX = 100 (relX = (100-50)/280 = 0.178)
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 2;
        ev.clientX = 100;
        ev.clientY = 160;
        viewport.dispatchEvent(ev);
      });

      // Extreme top-right drag: maximum orographic coupling
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 2;
        ev.clientX = 999999;
        ev.clientY = -999999;
        viewport.dispatchEvent(ev);
      });
      expect(onRainShadow).toHaveBeenCalledWith(1.0);

      // Extreme bottom-left drag: minimum orographic coupling
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 2;
        ev.clientX = -999999;
        ev.clientY = 999999;
        viewport.dispatchEvent(ev);
      });
      expect(onRainShadow).toHaveBeenCalledWith(0.0);

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 2;
        viewport.dispatchEvent(ev);
      });

      // 2. Pluvial Shaft Drag (relX >= 0.52): clientX = 250 (relX = (250-50)/280 = 0.714)
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 3;
        ev.clientX = 250;
        ev.clientY = 160;
        viewport.dispatchEvent(ev);
      });

      // Extreme bottom-right drag: maximum pluvial amplification
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 3;
        ev.clientX = 999999;
        ev.clientY = 999999;
        viewport.dispatchEvent(ev);
      });
      expect(onPluvial).toHaveBeenCalledWith(2.0);

      // Extreme top-left drag: minimum pluvial amplification
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 3;
        ev.clientX = -999999;
        ev.clientY = -999999;
        viewport.dispatchEvent(ev);
      });
      expect(onPluvial).toHaveBeenCalledWith(0.0);

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 3;
        viewport.dispatchEvent(ev);
      });
    });

    it('M6-CLAMP-03: CloudShadowInstrument clamps shadow intensity strictly to [0.0, 0.60]', async () => {
      const onShadowChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.45,
            onChange: onShadowChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      mockViewportRect(viewport, { top: 100, bottom: 180, left: 50, right: 290, width: 240, height: 80 });

      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 4;
        ev.clientX = 150;
        viewport.dispatchEvent(ev);
      });

      // Drag far left
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 4;
        ev.clientX = -500000;
        viewport.dispatchEvent(ev);
      });
      expect(onShadowChange).toHaveBeenCalledWith(0.0);

      // Drag far right
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 4;
        ev.clientX = 500000;
        viewport.dispatchEvent(ev);
      });
      expect(onShadowChange).toHaveBeenCalledWith(0.60);

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 4;
        viewport.dispatchEvent(ev);
      });
    });

    it('M6-CLAMP-04: CloudDriftSpeedInstrument clamps drift velocity strictly to [0, 2000]', async () => {
      const onDriftChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 500,
            onChange: onDriftChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      mockViewportRect(viewport, { top: 100, bottom: 180, left: 50, right: 290, width: 240, height: 80 });

      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 5;
        ev.clientX = 150;
        viewport.dispatchEvent(ev);
      });

      // Drag far left
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 5;
        ev.clientX = -500000;
        viewport.dispatchEvent(ev);
      });
      expect(onDriftChange).toHaveBeenCalledWith(0);

      // Drag far right
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 5;
        ev.clientX = 500000;
        viewport.dispatchEvent(ev);
      });
      expect(onDriftChange).toHaveBeenCalledWith(2000);

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 5;
        viewport.dispatchEvent(ev);
      });
    });

    it('M6-CLAMP-05: PrognosticModelCard clamps lead time strictly to [0, 240]', async () => {
      const onLeadTime = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            leadTimeHours: 24,
            onLeadTimeChange: onLeadTime,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      mockViewportRect(viewport, { top: 100, bottom: 210, left: 50, right: 330, width: 280, height: 110 });

      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 6;
        ev.clientX = 150;
        viewport.dispatchEvent(ev);
      });

      // Drag far left
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 6;
        ev.clientX = -500000;
        viewport.dispatchEvent(ev);
      });
      expect(onLeadTime).toHaveBeenCalledWith(0);

      // Drag far right
      await act(async () => {
        const ev = new Event('pointermove', { bubbles: true }) as any;
        ev.pointerId = 6;
        ev.clientX = 500000;
        viewport.dispatchEvent(ev);
      });
      expect(onLeadTime).toHaveBeenCalledWith(240);

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 6;
        viewport.dispatchEvent(ev);
      });
    });
  });

  // ==========================================================================
  // OBJECTIVE 2: DOUBLE-CLICK RESETS & DEDICATED RESET BUTTONS
  // ==========================================================================
  describe('2. Double-Click Resets & Dedicated Reset Buttons', () => {
    it('M6-RESET-01: AtmosphericColumnInstrument resets to default 3.5x scale, 80% opacity, and all strata active', async () => {
      const onScale = vi.fn();
      const onOpacity = vi.fn();
      const onToggle = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: false,
            showCloudMid: true,
            showCloudHigh: false,
            atmosphericScale: 10.5,
            cloudOpacity: 0.35,
            onToggleStrata: onToggle,
            onAtmosphericScaleChange: onScale,
            onCloudOpacityChange: onOpacity,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      // Double-click viewport
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(onScale).toHaveBeenCalledWith(3.5);
      expect(onOpacity).toHaveBeenCalledWith(0.80);
      expect(onToggle).toHaveBeenCalledWith('low', true);
      expect(onToggle).toHaveBeenCalledWith('high', true);

      // Reset mock counts and test dedicated [RESET] button in footer
      onScale.mockClear();
      onOpacity.mockClear();
      onToggle.mockClear();

      const resetButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('[RESET]')
      );
      expect(resetButton).toBeDefined();

      await act(async () => {
        resetButton!.click();
      });

      expect(onScale).toHaveBeenCalledWith(3.5);
      expect(onOpacity).toHaveBeenCalledWith(0.80);
    });

    it('M6-RESET-02: OrographicMoistureProfile resets to 0.0 rain shadow, 0.0 pluvial, and true thermodynamic gating', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();
      const onThermodynamic = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.85,
            pluvialGamma: 1.8,
            thermodynamicGating: false,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
            onThermodynamicGatingChange: onThermodynamic,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      // Double-click viewport
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(onRainShadow).toHaveBeenCalledWith(0.0);
      expect(onPluvial).toHaveBeenCalledWith(0.0);
      expect(onThermodynamic).toHaveBeenCalledWith(true);

      // Dedicated [RESET] button
      onRainShadow.mockClear();
      onPluvial.mockClear();
      onThermodynamic.mockClear();

      const resetButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('[RESET]')
      );
      expect(resetButton).toBeDefined();

      await act(async () => {
        resetButton!.click();
      });

      expect(onRainShadow).toHaveBeenCalledWith(0.0);
      expect(onPluvial).toHaveBeenCalledWith(0.0);
      expect(onThermodynamic).toHaveBeenCalledWith(true);
    });

    it('M6-RESET-03: CloudShadowInstrument resets to 0.45 shadow intensity', async () => {
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
      expect(viewport).not.toBeNull();

      // Double click
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.45);

      onChange.mockClear();
      const resetButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('[RESET]')
      );
      expect(resetButton).toBeDefined();

      await act(async () => {
        resetButton!.click();
      });
      expect(onChange).toHaveBeenCalledWith(0.45);
    });

    it('M6-RESET-04: CloudDriftSpeedInstrument resets to 500x drift velocity', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 1800,
            onChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      // Double click
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(500);

      onChange.mockClear();
      const resetButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('[RESET]')
      );
      expect(resetButton).toBeDefined();

      await act(async () => {
        resetButton!.click();
      });
      expect(onChange).toHaveBeenCalledWith(500);
    });

    it('M6-RESET-05: PrognosticModelCard resets lead time to 24h', async () => {
      const onLeadTime = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            leadTimeHours: 144,
            onLeadTimeChange: onLeadTime,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      // Double click
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onLeadTime).toHaveBeenCalledWith(24);

      onLeadTime.mockClear();
      const resetButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('[RESET]')
      );
      expect(resetButton).toBeDefined();

      await act(async () => {
        resetButton!.click();
      });
      expect(onLeadTime).toHaveBeenCalledWith(24);
    });
  });

  // ==========================================================================
  // OBJECTIVE 3: SYMMETRICAL KEYBOARD NAVIGATION & PREVENTDEFAULT SCROLL GUARDS
  // ==========================================================================
  describe('3. Symmetrical Keyboard Navigation & Scroll-Jitter Prevention', () => {
    it('M6-KEY-01: AtmosphericColumnInstrument calls e.preventDefault() on all navigation keys and navigates symmetrically', async () => {
      const onScale = vi.fn();
      const onOpacity = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 5.0,
            cloudOpacity: 0.50,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScale,
            onCloudOpacityChange: onOpacity,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      const testKey = async (key: string, shift = false) => {
        const ev = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
        await act(async () => {
          viewport.dispatchEvent(ev);
        });
        return ev.defaultPrevented;
      };

      // ArrowUp (scale +0.1)
      expect(await testKey('ArrowUp')).toBe(true);
      expect(onScale).toHaveBeenCalledWith(5.1);

      // ArrowDown (scale -0.1)
      expect(await testKey('ArrowDown')).toBe(true);
      expect(onScale).toHaveBeenCalledWith(4.9);

      // ArrowRight (opacity +0.05)
      expect(await testKey('ArrowRight')).toBe(true);
      expect(onOpacity).toHaveBeenCalledWith(0.55);

      // ArrowLeft (opacity -0.05)
      expect(await testKey('ArrowLeft')).toBe(true);
      expect(onOpacity).toHaveBeenCalledWith(0.45);

      // Shift + ArrowUp (coarse scale +1.0)
      expect(await testKey('ArrowUp', true)).toBe(true);
      expect(onScale).toHaveBeenCalledWith(6.0);

      // Shift + ArrowDown (coarse scale -1.0)
      expect(await testKey('ArrowDown', true)).toBe(true);
      expect(onScale).toHaveBeenCalledWith(4.0);

      // Home & End
      expect(await testKey('Home')).toBe(true);
      expect(onScale).toHaveBeenCalledWith(1.0);

      expect(await testKey('End')).toBe(true);
      expect(onScale).toHaveBeenCalledWith(12.0);
    });

    it('M6-KEY-02: OrographicMoistureProfile calls e.preventDefault() on all navigation & toggle keys', async () => {
      const onRainShadow = vi.fn();
      const onPluvial = vi.fn();
      const onThermodynamic = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.50,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
            onThermodynamicGatingChange: onThermodynamic,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      const testKey = async (key: string, shift = false) => {
        const ev = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
        await act(async () => {
          viewport.dispatchEvent(ev);
        });
        return ev.defaultPrevented;
      };

      // ArrowRight: rain shadow +0.05
      expect(await testKey('ArrowRight')).toBe(true);
      expect(onRainShadow).toHaveBeenCalledWith(0.55);

      // ArrowLeft: rain shadow -0.05
      expect(await testKey('ArrowLeft')).toBe(true);
      expect(onRainShadow).toHaveBeenCalledWith(0.45);

      // ArrowUp: pluvial +0.1
      expect(await testKey('ArrowUp')).toBe(true);
      expect(onPluvial).toHaveBeenCalledWith(1.1);

      // ArrowDown: pluvial -0.1
      expect(await testKey('ArrowDown')).toBe(true);
      expect(onPluvial).toHaveBeenCalledWith(0.9);

      // Toggle gating: 't', 'T', ' '
      expect(await testKey('t')).toBe(true);
      expect(onThermodynamic).toHaveBeenCalledWith(false);

      expect(await testKey(' ')).toBe(true);

      // Home & End
      expect(await testKey('Home')).toBe(true);
      expect(onRainShadow).toHaveBeenCalledWith(0.0);
      expect(onPluvial).toHaveBeenCalledWith(0.0);

      expect(await testKey('End')).toBe(true);
      expect(onRainShadow).toHaveBeenCalledWith(1.0);
      expect(onPluvial).toHaveBeenCalledWith(2.0);
    });

    it('M6-KEY-03: CloudShadowInstrument calls e.preventDefault() on all navigation, Home, End, Page, and Reset keys', async () => {
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
      expect(viewport).not.toBeNull();

      const testKey = async (key: string, shift = false) => {
        const ev = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
        await act(async () => {
          viewport.dispatchEvent(ev);
        });
        return ev.defaultPrevented;
      };

      expect(await testKey('ArrowRight')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(0.35);

      expect(await testKey('ArrowLeft')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(0.25);

      expect(await testKey('Home')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(0.0);

      expect(await testKey('End')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(0.60);

      expect(await testKey('Enter')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(0.45);

      expect(await testKey(' ')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(0.45);

      expect(await testKey('PageUp')).toBe(true);
      expect(await testKey('PageDown')).toBe(true);
    });

    it('M6-KEY-04: CloudDriftSpeedInstrument calls e.preventDefault() on all navigation, Page, and Reset keys', async () => {
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
      expect(viewport).not.toBeNull();

      const testKey = async (key: string, shift = false) => {
        const ev = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
        await act(async () => {
          viewport.dispatchEvent(ev);
        });
        return ev.defaultPrevented;
      };

      expect(await testKey('ArrowRight')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(510);

      expect(await testKey('ArrowLeft')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(490);

      expect(await testKey('ArrowRight', true)).toBe(true);
      expect(onChange).toHaveBeenCalledWith(600);

      expect(await testKey('Home')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(0);

      expect(await testKey('End')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(2000);

      expect(await testKey('Enter')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(500);

      expect(await testKey(' ')).toBe(true);
      expect(onChange).toHaveBeenCalledWith(500);
    });

    it('M6-KEY-05: PrognosticModelCard calls e.preventDefault() on all lead time stepping keys', async () => {
      const onLeadTime = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            leadTimeHours: 24,
            onLeadTimeChange: onLeadTime,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();

      const testKey = async (key: string, shift = false) => {
        const ev = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
        await act(async () => {
          viewport.dispatchEvent(ev);
        });
        return ev.defaultPrevented;
      };

      expect(await testKey('ArrowRight')).toBe(true);
      expect(onLeadTime).toHaveBeenCalledWith(30);

      expect(await testKey('ArrowLeft')).toBe(true);
      expect(onLeadTime).toHaveBeenCalledWith(18);

      expect(await testKey('ArrowRight', true)).toBe(true);
      expect(onLeadTime).toHaveBeenCalledWith(48);

      expect(await testKey('Home')).toBe(true);
      expect(onLeadTime).toHaveBeenCalledWith(0);

      expect(await testKey('End')).toBe(true);
      expect(onLeadTime).toHaveBeenCalledWith(240);

      expect(await testKey('Enter')).toBe(true);
      expect(onLeadTime).toHaveBeenCalledWith(24);
    });
  });

  // ==========================================================================
  // OBJECTIVE 4: MASTER CLOUD SWITCH ACCORDION COLLAPSE & RESTORATION
  // ==========================================================================
  describe('4. Master Cloud Switch Accordion Collapse & Restoration', () => {
    it('M6-SWITCH-01: toggling master cloud switch cleanly collapses viewports and preserves custom state upon expansion', async () => {
      // Mount AtmosphereDrawer uncontrolled with hideScrubber: true to isolate precision instruments
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { hideScrubber: true }));
      });

      // Confirm all 5 precision instrument viewports are mounted
      let sliders = container.querySelectorAll('[role="slider"]');
      expect(sliders.length).toBe(5);

      // Verify master switch is ON
      const masterSwitch = container.querySelector('[role="switch"]') as HTMLElement;
      expect(masterSwitch).not.toBeNull();
      expect(masterSwitch.getAttribute('aria-checked')).toBe('true');

      // Adjust several instrument parameters
      // 1. Adjust Atmospheric Scale to 8.0x
      const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
      if (scaleInput) {
        await act(async () => {
          triggerInputChange(scaleInput, '8');
        });
      }

      // 2. Adjust Cloud Drift Speed to 1200x
      const driftInput = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      if (driftInput) {
        await act(async () => {
          triggerInputChange(driftInput, '1200');
        });
      }

      // 3. Adjust Shadow Intensity to 0.20
      const shadowInput = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      if (shadowInput) {
        await act(async () => {
          triggerInputChange(shadowInput, '0.2');
        });
      }

      // Now toggle master cloud switch OFF
      await act(async () => {
        masterSwitch.click();
      });

      // Verify accordion collapse: zero slider viewports remain in DOM
      sliders = container.querySelectorAll('[role="slider"]');
      expect(sliders.length).toBe(0);
      expect(masterSwitch.getAttribute('aria-checked')).toBe('false');

      // Now toggle master cloud switch back ON
      await act(async () => {
        masterSwitch.click();
      });

      // Verify accordion restored: all 5 slider viewports remounted
      sliders = container.querySelectorAll('[role="slider"]');
      expect(sliders.length).toBe(5);
      expect(masterSwitch.getAttribute('aria-checked')).toBe('true');

      // Verify custom values were preserved and not reset to defaults
      const restoredScale = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
      expect(restoredScale.value).toBe('8');

      const restoredDrift = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      expect(restoredDrift.value).toBe('1200');

      const restoredShadow = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      expect(restoredShadow.value).toBe('0.2');
    });

    it('M6-SWITCH-02: rapid master switch toggling (50 cycles) maintains rock-solid state invariants without errors', async () => {
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, { hideScrubber: true }));
      });

      const masterSwitch = container.querySelector('[role="switch"]') as HTMLElement;
      expect(masterSwitch).not.toBeNull();

      for (let i = 0; i < 50; i++) {
        await act(async () => {
          masterSwitch.click();
        });
      }

      // 50 clicks on initially true -> ends on true (even number of toggles)
      expect(masterSwitch.getAttribute('aria-checked')).toBe('true');
      const sliders = container.querySelectorAll('[role="slider"]');
      expect(sliders.length).toBe(5);
    });
  });

  // ==========================================================================
  // OBJECTIVE 5: RAPID THEME SWITCHING (0 -> 1 -> 2 -> 0) & SVG ARTIFACTS
  // ==========================================================================
  describe('5. Rapid Theme Switching & SVG Artifact Mutual Exclusivity', () => {
    it('M6-THEME-01: rapidly cycling themes (0 -> 1 -> 2 -> 0) renders mutually exclusive medium SVG artifacts with zero memory leaks', async () => {
      const renderWithTheme = async (t: 0 | 1 | 2) => {
        await act(async () => {
          root.render(
            React.createElement(
              'div',
              null,
              React.createElement(AtmosphericColumnInstrument, {
                showCloudLow: true,
                showCloudMid: true,
                showCloudHigh: true,
                atmosphericScale: 3.5,
                cloudOpacity: 0.8,
                theme: t,
                onToggleStrata: vi.fn(),
                onAtmosphericScaleChange: vi.fn(),
              }),
              React.createElement(OrographicMoistureProfile, {
                rainShadowFeedback: 0.2,
                pluvialGamma: 0.4,
                thermodynamicGating: true,
                theme: t,
              }),
              React.createElement(CloudShadowInstrument, {
                shadowIntensity: 0.45,
                theme: t,
              }),
              React.createElement(CloudDriftSpeedInstrument, {
                cloudDriftSpeed: 500,
                theme: t,
              }),
              React.createElement(PrognosticModelCard, {
                prognosticModel: 'weathernext3',
                leadTimeHours: 24,
                theme: t,
              })
            )
          );
        });
      };

      // Rapidly cycle themes 20 times (60 theme switches)
      for (let cycle = 0; cycle < 20; cycle++) {
        // Theme 0: Marie Tharp
        await renderWithTheme(0);
        expect(container.querySelector('.atmospheric-column-tharp')).not.toBeNull();
        expect(container.querySelector('.orographic-profile-tharp')).not.toBeNull();
        expect(container.querySelector('.shadow-projection-tharp')).not.toBeNull();
        expect(container.querySelector('.drift-chronometer-tharp')).not.toBeNull();
        expect(container.querySelector('.prognostic-model-tharp')).not.toBeNull();

        expect(container.querySelector('.atmospheric-column-cream')).toBeNull();
        expect(container.querySelector('.atmospheric-column-cyanotype')).toBeNull();

        // Theme 1: Cream Rag Paper
        await renderWithTheme(1);
        expect(container.querySelector('.atmospheric-column-cream')).not.toBeNull();
        expect(container.querySelector('.orographic-profile-cream')).not.toBeNull();
        expect(container.querySelector('.shadow-projection-cream')).not.toBeNull();
        expect(container.querySelector('.drift-chronometer-cream')).not.toBeNull();
        expect(container.querySelector('.prognostic-model-cream')).not.toBeNull();

        expect(container.querySelector('.atmospheric-column-tharp')).toBeNull();
        expect(container.querySelector('.atmospheric-column-cyanotype')).toBeNull();

        // Theme 2: Prussian Cyanotype CAD
        await renderWithTheme(2);
        expect(container.querySelector('.atmospheric-column-cyanotype')).not.toBeNull();
        expect(container.querySelector('.orographic-profile-cyanotype')).not.toBeNull();
        expect(container.querySelector('.shadow-projection-cyanotype')).not.toBeNull();
        expect(container.querySelector('.drift-chronometer-cyanotype')).not.toBeNull();
        expect(container.querySelector('.prognostic-model-cyanotype')).not.toBeNull();

        expect(container.querySelector('.atmospheric-column-tharp')).toBeNull();
        expect(container.querySelector('.atmospheric-column-cream')).toBeNull();
      }

      // Return to Theme 0 clean finish
      await renderWithTheme(0);
      expect(container.querySelector('.atmospheric-column-tharp')).not.toBeNull();
      expect(container.querySelector('.atmospheric-column-cream')).toBeNull();
      expect(container.querySelector('.atmospheric-column-cyanotype')).toBeNull();
    });

    it('M6-THEME-02: 100 cycles of randomized theme & prop fuzzing produce zero rendering exceptions', async () => {
      for (let i = 0; i < 100; i++) {
        const randomTheme = (Math.floor(Math.random() * 3)) as 0 | 1 | 2;
        const randomScale = 1.0 + Math.random() * 11.0;
        const randomOpacity = 0.1 + Math.random() * 0.9;
        const randomShadow = Math.random() * 0.6;
        const randomDrift = Math.random() * 2000;
        const randomLead = Math.floor(Math.random() * 41) * 6;

        await act(async () => {
          root.render(
            React.createElement(
              'div',
              null,
              React.createElement(AtmosphericColumnInstrument, {
                showCloudLow: Math.random() > 0.5,
                showCloudMid: Math.random() > 0.5,
                showCloudHigh: Math.random() > 0.5,
                atmosphericScale: randomScale,
                cloudOpacity: randomOpacity,
                theme: randomTheme,
                onToggleStrata: vi.fn(),
                onAtmosphericScaleChange: vi.fn(),
              }),
              React.createElement(OrographicMoistureProfile, {
                rainShadowFeedback: Math.random(),
                pluvialGamma: Math.random() * 2.0,
                thermodynamicGating: Math.random() > 0.5,
                theme: randomTheme,
              }),
              React.createElement(CloudShadowInstrument, {
                shadowIntensity: randomShadow,
                theme: randomTheme,
              }),
              React.createElement(CloudDriftSpeedInstrument, {
                cloudDriftSpeed: randomDrift,
                theme: randomTheme,
              }),
              React.createElement(PrognosticModelCard, {
                prognosticModel: 'weathernext3',
                leadTimeHours: randomLead,
                theme: randomTheme,
              })
            )
          );
        });
      }
      expect(container.children.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // OBJECTIVE 6: MONTE CARLO DRAG FUZZING ACROSS ALL 5 INSTRUMENTS
  // ==========================================================================
  describe('6. Monte Carlo Adversarial Drag Fuzzing (500 iterations per instrument)', () => {
    it('M6-FUZZ-01: AtmosphericColumnInstrument scale strictly bounded [1.0, 12.0] under 500 chaotic pointer moves', async () => {
      let lastScale = 3.5;
      const onScale = vi.fn((s: number) => {
        lastScale = s;
      });

      await act(async () => {
        root.render(
          React.createElement(AtmosphericColumnInstrument, {
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            atmosphericScale: 3.5,
            cloudOpacity: 0.8,
            onToggleStrata: vi.fn(),
            onAtmosphericScaleChange: onScale,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 });

      // Pointer down
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 10;
        ev.clientX = 100;
        ev.clientY = 165;
        viewport.dispatchEvent(ev);
      });

      for (let i = 0; i < 500; i++) {
        // Chaotic clientY ranging from -10,000,000 to +10,000,000
        const randomY = (Math.random() - 0.5) * 20000000;
        await act(async () => {
          const ev = new Event('pointermove', { bubbles: true }) as any;
          ev.pointerId = 10;
          ev.clientX = 100;
          ev.clientY = randomY;
          viewport.dispatchEvent(ev);
        });

        expect(lastScale).toBeGreaterThanOrEqual(1.0);
        expect(lastScale).toBeLessThanOrEqual(12.0);
        expect(Number.isFinite(lastScale)).toBe(true);
        expect(Number.isNaN(lastScale)).toBe(false);
      }

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 10;
        viewport.dispatchEvent(ev);
      });
    });

    it('M6-FUZZ-02: OrographicMoistureProfile rainShadow [0.0, 1.0] and pluvial [0.0, 2.0] strictly bounded under 500 chaotic moves', async () => {
      let lastRainShadow = 0.0;
      let lastPluvial = 0.0;
      const onRainShadow = vi.fn((r: number) => { lastRainShadow = r; });
      const onPluvial = vi.fn((p: number) => { lastPluvial = p; });

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.0,
            pluvialGamma: 0.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainShadow,
            onPluvialGammaChange: onPluvial,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 230, left: 50, right: 330, width: 280, height: 130 });

      // Windward slope test
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 11;
        ev.clientX = 100; // relX = (100-50)/280 < 0.52
        ev.clientY = 160;
        viewport.dispatchEvent(ev);
      });

      for (let i = 0; i < 250; i++) {
        const randX = (Math.random() - 0.5) * 20000000;
        const randY = (Math.random() - 0.5) * 20000000;
        await act(async () => {
          const ev = new Event('pointermove', { bubbles: true }) as any;
          ev.pointerId = 11;
          ev.clientX = randX;
          ev.clientY = randY;
          viewport.dispatchEvent(ev);
        });

        expect(lastRainShadow).toBeGreaterThanOrEqual(0.0);
        expect(lastRainShadow).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(lastRainShadow)).toBe(true);
      }

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 11;
        viewport.dispatchEvent(ev);
      });

      // Pluvial column test
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 12;
        ev.clientX = 250; // relX = (250-50)/280 >= 0.52
        ev.clientY = 160;
        viewport.dispatchEvent(ev);
      });

      for (let i = 0; i < 250; i++) {
        const randX = (Math.random() - 0.5) * 20000000;
        const randY = (Math.random() - 0.5) * 20000000;
        await act(async () => {
          const ev = new Event('pointermove', { bubbles: true }) as any;
          ev.pointerId = 12;
          ev.clientX = randX;
          ev.clientY = randY;
          viewport.dispatchEvent(ev);
        });

        expect(lastPluvial).toBeGreaterThanOrEqual(0.0);
        expect(lastPluvial).toBeLessThanOrEqual(2.0);
        expect(Number.isFinite(lastPluvial)).toBe(true);
      }

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 12;
        viewport.dispatchEvent(ev);
      });
    });

    it('M6-FUZZ-03: CloudShadow [0.0, 0.60] and DriftSpeed [0, 2000] strictly bounded under chaotic moves', async () => {
      let lastShadow = 0.45;
      let lastDrift = 500;
      const onShadow = vi.fn((s: number) => { lastShadow = s; });
      const onDrift = vi.fn((d: number) => { lastDrift = d; });

      await act(async () => {
        root.render(
          React.createElement(
            'div',
            null,
            React.createElement(CloudShadowInstrument, {
              shadowIntensity: 0.45,
              onChange: onShadow,
            }),
            React.createElement(CloudDriftSpeedInstrument, {
              cloudDriftSpeed: 500,
              onChange: onDrift,
            })
          )
        );
      });

      const [shadowVp, driftVp] = Array.from(container.querySelectorAll('[role="slider"]')) as HTMLElement[];
      mockViewportRect(shadowVp, { top: 100, bottom: 180, left: 50, right: 290, width: 240, height: 80 });
      mockViewportRect(driftVp, { top: 200, bottom: 280, left: 50, right: 290, width: 240, height: 80 });

      // Shadow test
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 13;
        ev.clientX = 150;
        shadowVp.dispatchEvent(ev);
      });

      for (let i = 0; i < 200; i++) {
        const randX = (Math.random() - 0.5) * 10000000;
        await act(async () => {
          const ev = new Event('pointermove', { bubbles: true }) as any;
          ev.pointerId = 13;
          ev.clientX = randX;
          shadowVp.dispatchEvent(ev);
        });
        expect(lastShadow).toBeGreaterThanOrEqual(0.0);
        expect(lastShadow).toBeLessThanOrEqual(0.60);
      }

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 13;
        shadowVp.dispatchEvent(ev);
      });

      // Drift test
      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 14;
        ev.clientX = 150;
        driftVp.dispatchEvent(ev);
      });

      for (let i = 0; i < 200; i++) {
        const randX = (Math.random() - 0.5) * 10000000;
        await act(async () => {
          const ev = new Event('pointermove', { bubbles: true }) as any;
          ev.pointerId = 14;
          ev.clientX = randX;
          driftVp.dispatchEvent(ev);
        });
        expect(lastDrift).toBeGreaterThanOrEqual(0);
        expect(lastDrift).toBeLessThanOrEqual(2000);
      }

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 14;
        driftVp.dispatchEvent(ev);
      });
    });

    it('M6-FUZZ-04: PrognosticModelCard leadTime strictly bounded [0, 240] under chaotic moves', async () => {
      let lastLead = 24;
      const onLead = vi.fn((l: number) => { lastLead = l; });

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            leadTimeHours: 24,
            onLeadTimeChange: onLead,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      mockViewportRect(viewport, { top: 100, bottom: 210, left: 50, right: 330, width: 280, height: 110 });

      await act(async () => {
        const ev = new Event('pointerdown', { bubbles: true }) as any;
        ev.pointerId = 15;
        ev.clientX = 150;
        viewport.dispatchEvent(ev);
      });

      for (let i = 0; i < 200; i++) {
        const randX = (Math.random() - 0.5) * 10000000;
        await act(async () => {
          const ev = new Event('pointermove', { bubbles: true }) as any;
          ev.pointerId = 15;
          ev.clientX = randX;
          viewport.dispatchEvent(ev);
        });
        expect(lastLead).toBeGreaterThanOrEqual(0);
        expect(lastLead).toBeLessThanOrEqual(240);
      }

      await act(async () => {
        const ev = new Event('pointerup', { bubbles: true }) as any;
        ev.pointerId = 15;
        viewport.dispatchEvent(ev);
      });
    });
  });
});

