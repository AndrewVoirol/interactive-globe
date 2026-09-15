// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m6-2-empirical-dom-aria.test.tsx
// Empirical Verification Suite by Challenger 2 (challenger_m6_2)
// Exhaustive DOM, ARIA, Keyboard, and Legacy Bridge Testing for Milestone 6
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { AtmosphereDrawer, AtmosphereDrawerProps } from '../../src/components/AtmosphereDrawer';
import { AtmosphericColumnInstrument } from '../../src/components/hud/instruments/AtmosphericColumnInstrument';
import { OrographicMoistureProfile } from '../../src/components/hud/instruments/OrographicMoistureProfile';
import { CloudShadowInstrument } from '../../src/components/hud/instruments/CloudShadowInstrument';
import { CloudDriftSpeedInstrument } from '../../src/components/hud/instruments/CloudDriftSpeedInstrument';
import { PrognosticModelCard } from '../../src/components/hud/instruments/PrognosticModelCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 2 Empirical Verification: Milestone 6 DOM & ARIA', () => {
  let container: HTMLDivElement;
  let root: Root;

  // Window bridge mocks
  let mockSetCloudOptions: ReturnType<typeof vi.fn>;
  let mockSetAtmosphericScale: ReturnType<typeof vi.fn>;
  let mockSetShadowIntensity: ReturnType<typeof vi.fn>;
  let mockSetPrognosticModel: ReturnType<typeof vi.fn>;
  let mockSetPrognosticVariable: ReturnType<typeof vi.fn>;
  let mockSetTimelineMinutes: ReturnType<typeof vi.fn>;
  let mockSetWeatherOpticalMode: ReturnType<typeof vi.fn>;
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
    mockSetWeatherOpticalMode = vi.fn();
    mockSetRainShadowFeedback = vi.fn();
    mockSetPluvialGamma = vi.fn();
    mockSetThermodynamicGating = vi.fn();

    (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = mockSetCloudOptions;
    (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__ = mockSetAtmosphericScale;
    (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__ = mockSetShadowIntensity;
    (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__ = mockSetPrognosticModel;
    (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__ = mockSetPrognosticVariable;
    (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__ = mockSetTimelineMinutes;
    (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__ = mockSetWeatherOpticalMode;
    (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__ = mockSetRainShadowFeedback;
    (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__ = mockSetPluvialGamma;
    (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__ = mockSetThermodynamicGating;

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
    delete (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__;
    delete (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__;
    delete (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__;
    delete (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__;
  });

  const triggerInputChange = (input: HTMLInputElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const renderDrawer = async (props: Partial<AtmosphereDrawerProps> = {}) => {
    await act(async () => {
      root.render(<AtmosphereDrawer {...props} />);
    });
  };

  // --------------------------------------------------------------------------
  // Objective 1: Verification of Legacy DOM IDs
  // --------------------------------------------------------------------------
  describe('Objective 1: Legacy DOM IDs across AtmosphereDrawer and instruments', () => {
    it('verifies all 14 legacy DOM IDs exist when showClouds is true and prognosticModel is weathernext3', async () => {
      await renderDrawer({
        showClouds: true,
        prognosticModel: 'weathernext3',
      });

      const expectedIds = [
        'sidebar-atmospheric-scale',
        'sidebar-cloud-opacity',
        'sidebar-orographic-coupling',
        'sidebar-pluvial-coupling',
        'sidebar-cloud-drift',
        'sidebar-shadow-intensity',
        'sidebar-model-ecmwf',
        'sidebar-model-gfs',
        'sidebar-model-weathernext',
        'sidebar-model-off',
        'sidebar-variable-rain',
        'sidebar-variable-temp',
        'sidebar-variable-wind',
        'sidebar-variable-z500',
      ];

      for (const id of expectedIds) {
        const el = container.querySelector(`#${id}`);
        expect(el, `Expected element #${id} to exist in rendered DOM`).not.toBeNull();
      }
    });

    it('verifies #sidebar-atmospheric-scale updates value and fires bridge callback', async () => {
      const onAtmosphericScaleChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        onAtmosphericScaleChange,
      });

      const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
      expect(scaleInput).not.toBeNull();

      await act(async () => {
        triggerInputChange(scaleInput, '7.2');
      });

      expect(onAtmosphericScaleChange).toHaveBeenCalledWith(7.2);
      expect(mockSetAtmosphericScale).toHaveBeenCalledWith(7.2);
      expect(mockSetCloudOptions).toHaveBeenCalledWith(expect.objectContaining({ atmosphericScale: 7.2 }));
    });

    it('verifies #sidebar-cloud-opacity updates value and fires bridge callback', async () => {
      const onCloudOpacityChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        onCloudOpacityChange,
      });

      const opacityInput = container.querySelector('#sidebar-cloud-opacity') as HTMLInputElement;
      expect(opacityInput).not.toBeNull();

      await act(async () => {
        triggerInputChange(opacityInput, '0.45');
      });

      expect(onCloudOpacityChange).toHaveBeenCalledWith(0.45);
      expect(mockSetCloudOptions).toHaveBeenCalledWith(expect.objectContaining({ cloudOpacity: 0.45 }));
    });

    it('verifies #sidebar-orographic-coupling updates value and fires bridge callback', async () => {
      const onRainShadowFeedbackChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        onRainShadowFeedbackChange,
      });

      const orographicInput = container.querySelector('#sidebar-orographic-coupling') as HTMLInputElement;
      expect(orographicInput).not.toBeNull();

      await act(async () => {
        triggerInputChange(orographicInput, '0.75');
      });

      expect(onRainShadowFeedbackChange).toHaveBeenCalledWith(0.75);
      expect(mockSetRainShadowFeedback).toHaveBeenCalledWith(0.75);
    });

    it('verifies #sidebar-pluvial-coupling updates value and fires bridge callback', async () => {
      const onPluvialGammaChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        onPluvialGammaChange,
      });

      const pluvialInput = container.querySelector('#sidebar-pluvial-coupling') as HTMLInputElement;
      expect(pluvialInput).not.toBeNull();

      await act(async () => {
        triggerInputChange(pluvialInput, '1.8');
      });

      expect(onPluvialGammaChange).toHaveBeenCalledWith(1.8);
      expect(mockSetPluvialGamma).toHaveBeenCalledWith(1.8);
    });

    it('verifies #sidebar-cloud-drift updates value and fires bridge callback', async () => {
      const onCloudDriftSpeedChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        onCloudDriftSpeedChange,
      });

      const driftInput = container.querySelector('#sidebar-cloud-drift') as HTMLInputElement;
      expect(driftInput).not.toBeNull();

      await act(async () => {
        triggerInputChange(driftInput, '1200');
      });

      expect(onCloudDriftSpeedChange).toHaveBeenCalledWith(1200);
      expect(mockSetCloudOptions).toHaveBeenCalledWith(expect.objectContaining({ cloudDriftSpeed: 1200 }));
    });

    it('verifies #sidebar-shadow-intensity updates value and fires bridge callback', async () => {
      const onShadowIntensityChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        onShadowIntensityChange,
      });

      const shadowInput = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      expect(shadowInput).not.toBeNull();

      await act(async () => {
        triggerInputChange(shadowInput, '0.25');
      });

      expect(onShadowIntensityChange).toHaveBeenCalledWith(0.25);
      expect(mockSetShadowIntensity).toHaveBeenCalledWith(0.25);
      expect(mockSetCloudOptions).toHaveBeenCalledWith(expect.objectContaining({ shadowIntensity: 0.25 }));
    });

    it('verifies #sidebar-model-* switches prognostic models and triggers callbacks', async () => {
      const onPrognosticModelChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        prognosticModel: 'gfs',
        onPrognosticModelChange,
      });

      const btnEcmwf = container.querySelector('#sidebar-model-ecmwf') as HTMLButtonElement;
      const btnGfs = container.querySelector('#sidebar-model-gfs') as HTMLButtonElement;
      const btnWn = container.querySelector('#sidebar-model-weathernext') as HTMLButtonElement;
      const btnOff = container.querySelector('#sidebar-model-off') as HTMLButtonElement;

      expect(btnEcmwf).not.toBeNull();
      expect(btnGfs).not.toBeNull();
      expect(btnWn).not.toBeNull();
      expect(btnOff).not.toBeNull();

      expect(btnGfs.getAttribute('aria-checked')).toBe('true');
      expect(btnEcmwf.getAttribute('aria-checked')).toBe('false');

      await act(async () => {
        btnEcmwf.click();
      });

      expect(onPrognosticModelChange).toHaveBeenCalledWith('ecmwf');
      expect(mockSetPrognosticModel).toHaveBeenCalledWith('ecmwf');

      await act(async () => {
        btnWn.click();
      });

      expect(onPrognosticModelChange).toHaveBeenCalledWith('weathernext3');
      expect(mockSetPrognosticModel).toHaveBeenCalledWith('weathernext3');
    });

    it('verifies #sidebar-variable-* switches prognostic variables and triggers callbacks', async () => {
      const onPrognosticVariableChange = vi.fn();
      await renderDrawer({
        showClouds: true,
        prognosticModel: 'weathernext3',
        prognosticVariable: 'total_precipitation_1hr_mean',
        onPrognosticVariableChange,
      });

      const btnRain = container.querySelector('#sidebar-variable-rain') as HTMLButtonElement;
      const btnTemp = container.querySelector('#sidebar-variable-temp') as HTMLButtonElement;
      const btnWind = container.querySelector('#sidebar-variable-wind') as HTMLButtonElement;
      const btnZ500 = container.querySelector('#sidebar-variable-z500') as HTMLButtonElement;

      expect(btnRain).not.toBeNull();
      expect(btnTemp).not.toBeNull();
      expect(btnWind).not.toBeNull();
      expect(btnZ500).not.toBeNull();

      expect(btnRain.getAttribute('aria-checked')).toBe('true');

      await act(async () => {
        btnTemp.click();
      });

      expect(onPrognosticVariableChange).toHaveBeenCalledWith('temperature_2m_mean');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('temperature_2m_mean');

      await act(async () => {
        btnWind.click();
      });

      expect(onPrognosticVariableChange).toHaveBeenCalledWith('wind_10m_vector');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('wind_10m_vector');
    });

    it('verifies prognostic variables are unmounted when model is off', async () => {
      await renderDrawer({
        showClouds: true,
        prognosticModel: 'off',
      });

      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();
      expect(container.querySelector('#sidebar-variable-temp')).toBeNull();
      expect(container.querySelector('#sidebar-variable-wind')).toBeNull();
      expect(container.querySelector('#sidebar-variable-z500')).toBeNull();
    });

    it('verifies all instruments and legacy IDs unmount when showClouds is false', async () => {
      await renderDrawer({
        showClouds: false,
      });

      expect(container.querySelector('#sidebar-atmospheric-scale')).toBeNull();
      expect(container.querySelector('#sidebar-cloud-opacity')).toBeNull();
      expect(container.querySelector('#sidebar-orographic-coupling')).toBeNull();
      expect(container.querySelector('#sidebar-pluvial-coupling')).toBeNull();
      expect(container.querySelector('#sidebar-cloud-drift')).toBeNull();
      expect(container.querySelector('#sidebar-shadow-intensity')).toBeNull();
      expect(container.querySelector('#sidebar-model-gfs')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Objective 2: Verification of ARIA Semantics
  // --------------------------------------------------------------------------
  describe('Objective 2: ARIA Semantics, Radiogroups, Roving Tabindex & Sliders', () => {
    it('verifies exactly 5 radiogroups when clouds active and NWP active (WeatherNext)', async () => {
      await renderDrawer({
        showClouds: true,
        prognosticModel: 'weathernext3',
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(5);
    });

    it('verifies exactly 4 radiogroups when clouds active and NWP model is off', async () => {
      await renderDrawer({
        showClouds: true,
        prognosticModel: 'off',
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(4);
    });

    it('verifies exactly 0 radiogroups when clouds are inactive (collapsed)', async () => {
      await renderDrawer({
        showClouds: false,
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(0);
    });

    it('verifies roving tabindex and aria-checked states across all radiogroups', async () => {
      await renderDrawer({
        showClouds: true,
        prognosticModel: 'weathernext3',
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      radiogroups.forEach((group, groupIdx) => {
        const radios = group.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        expect(radios.length).toBeGreaterThan(1);

        const checkedRadios = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'true');
        const tabZeroRadios = Array.from(radios).filter((r) => r.getAttribute('tabindex') === '0');

        expect(checkedRadios.length, `Group ${groupIdx} must have exactly one aria-checked="true"`).toBe(1);
        expect(tabZeroRadios.length, `Group ${groupIdx} must have exactly one tabIndex="0"`).toBe(1);
        expect(checkedRadios[0]).toBe(tabZeroRadios[0]);

        const uncheckedRadios = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'false');
        uncheckedRadios.forEach((r) => {
          expect(r.getAttribute('tabindex')).toBe('-1');
        });
      });
    });

    it('verifies keyboard arrow navigation roving tabindex in an uncontrolled radiogroup', async () => {
      // In uncontrolled mode, state updates internally upon arrow key
      const StatefulWrapper: React.FC = () => {
        const [model, setModel] = useState<'gfs' | 'weathernext3' | 'ecmwf' | 'off'>('weathernext3');
        return (
          <AtmosphereDrawer
            showClouds={true}
            prognosticModel={model}
            onPrognosticModelChange={(m) => setModel(m as any)}
          />
        );
      };

      await act(async () => {
        root.render(<StatefulWrapper />);
      });

      const btnWn = container.querySelector('#sidebar-model-weathernext') as HTMLButtonElement;
      expect(btnWn.getAttribute('aria-checked')).toBe('true');
      expect(btnWn.getAttribute('tabindex')).toBe('0');

      // Dispatch ArrowRight from btnWn -> next option is btnOff
      await act(async () => {
        btnWn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      const btnOff = container.querySelector('#sidebar-model-off') as HTMLButtonElement;
      expect(btnOff.getAttribute('aria-checked')).toBe('true');
      expect(btnOff.getAttribute('tabindex')).toBe('0');

      const btnWnAfter = container.querySelector('#sidebar-model-weathernext') as HTMLButtonElement;
      expect(btnWnAfter.getAttribute('aria-checked')).toBe('false');
      expect(btnWnAfter.getAttribute('tabindex')).toBe('-1');
    });

    it('verifies slider semantics (role="slider", valuenow, valuemin, valuemax, tabIndex=0) on all 5 precision instrument viewports', async () => {
      await renderDrawer({
        showClouds: true,
        hideScrubber: true, // Focus strictly on the 5 precision instruments
        prognosticModel: 'weathernext3',
        atmosphericScale: 4.2,
        rainShadowFeedback: 0.35,
        cloudDriftSpeed: 750,
        shadowIntensity: 0.50,
        timelineMinutes: 48 * 60,
      });

      const sliders = container.querySelectorAll('div[role="slider"]');
      // Exactly 5 precision instrument viewports when scrubber is hidden
      expect(sliders.length).toBe(5);

      sliders.forEach((slider, idx) => {
        expect(slider.getAttribute('tabindex'), `Slider ${idx} must have tabIndex="0"`).toBe('0');
        expect(slider.getAttribute('aria-label'), `Slider ${idx} must have aria-label`).toBeTruthy();

        const min = parseFloat(slider.getAttribute('aria-valuemin') || '');
        const max = parseFloat(slider.getAttribute('aria-valuemax') || '');
        const now = parseFloat(slider.getAttribute('aria-valuenow') || '');

        expect(Number.isFinite(min), `Slider ${idx} min is finite`).toBe(true);
        expect(Number.isFinite(max), `Slider ${idx} max is finite`).toBe(true);
        expect(Number.isFinite(now), `Slider ${idx} now is finite`).toBe(true);
        expect(now).toBeGreaterThanOrEqual(min);
        expect(now).toBeLessThanOrEqual(max);
      });
    });

    it('verifies keyboard arrow stepping and reset on AtmosphericColumnInstrument viewport', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            atmosphericScale={3.5}
            cloudOpacity={0.80}
            onToggleStrata={() => {}}
            onAtmosphericScaleChange={onScaleChange}
          />
        );
      });

      const viewport = container.querySelector('div[role="slider"]') as HTMLDivElement;
      expect(viewport).not.toBeNull();

      // ArrowUp increments by 0.1
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(3.6);

      // Shift + ArrowUp increments by 1.0
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(4.5);

      // Home sets to min (1.0)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(1.0);

      // End sets to max (12.0)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(12.0);

      // Double-click resets to default 3.5
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(3.5);
    });

    it('verifies keyboard stepping and reset on OrographicMoistureProfile viewport', async () => {
      const onRainShadowChange = vi.fn();
      const onPluvialChange = vi.fn();
      const onThermodynamicGatingChange = vi.fn();

      await act(async () => {
        root.render(
          <OrographicMoistureProfile
            rainShadowFeedback={0.20}
            pluvialGamma={0.4}
            thermodynamicGating={true}
            onRainShadowChange={onRainShadowChange}
            onPluvialGammaChange={onPluvialChange}
            onThermodynamicGatingChange={onThermodynamicGatingChange}
          />
        );
      });

      const viewport = container.querySelector('div[role="slider"]') as HTMLDivElement;
      expect(viewport).not.toBeNull();

      // ArrowRight increases coupling by 0.05
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onRainShadowChange).toHaveBeenCalledWith(0.25);

      // ArrowUp increases pluvial by 0.1
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onPluvialChange).toHaveBeenCalledWith(0.5);

      // 't' toggles thermodynamic gating
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      });
      expect(onThermodynamicGatingChange).toHaveBeenCalledWith(false);

      // Double-click resets
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onRainShadowChange).toHaveBeenCalledWith(0.0);
      expect(onPluvialChange).toHaveBeenCalledWith(0.0);
      expect(onThermodynamicGatingChange).toHaveBeenCalledWith(true);
    });

    it('verifies keyboard stepping and reset on CloudDriftSpeedInstrument viewport', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          <CloudDriftSpeedInstrument
            cloudDriftSpeed={500}
            onChange={onChange}
          />
        );
      });

      const viewport = container.querySelector('div[role="slider"]') as HTMLDivElement;
      expect(viewport).not.toBeNull();

      // ArrowRight increases by 10
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(510);

      // Shift + ArrowRight increases by 100
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(600);

      // End sets to max (2000)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(2000);

      // Double click resets to 500
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(500);
    });

    it('verifies keyboard stepping and reset on CloudShadowInstrument viewport', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          <CloudShadowInstrument
            shadowIntensity={0.45}
            onChange={onChange}
          />
        );
      });

      const viewport = container.querySelector('div[role="slider"]') as HTMLDivElement;
      expect(viewport).not.toBeNull();

      // ArrowRight increases by 0.05
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.50);

      // Home sets to min (0.0)
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.0);

      // Double click resets to 0.45
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(0.45);
    });

    it('verifies keyboard stepping and reset on PrognosticModelCard viewport', async () => {
      const onLeadTimeChange = vi.fn();
      await act(async () => {
        root.render(
          <PrognosticModelCard
            leadTimeHours={24}
            onLeadTimeChange={onLeadTimeChange}
          />
        );
      });

      const viewport = container.querySelector('div[role="slider"]') as HTMLDivElement;
      expect(viewport).not.toBeNull();

      // ArrowRight increases by 6 hours
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(30);

      // Shift + ArrowRight increases by 24 hours
      await act(async () => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(48);

      // Double-click resets to 24
      await act(async () => {
        viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(24);
    });
  });

  // --------------------------------------------------------------------------
  // Objective 3 & 4: Stress & Multi-Medium Assertions
  // --------------------------------------------------------------------------
  describe('Medium-Adaptive SVG Artifacts and HUD Compliance', () => {
    it('renders distinct medium-adaptive SVG classes across all 3 themes', async () => {
      // Theme 0: Marie Tharp
      await renderDrawer({ theme: 0, showClouds: true, prognosticModel: 'weathernext3' });
      expect(container.querySelector('.atmospheric-column-tharp')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-tharp')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-tharp')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).not.toBeNull();

      // Theme 1: Cream Rag
      await renderDrawer({ theme: 1, showClouds: true, prognosticModel: 'weathernext3' });
      expect(container.querySelector('.atmospheric-column-cream')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-cream')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).not.toBeNull();

      // Theme 2: Prussian Cyanotype
      await renderDrawer({ theme: 2, showClouds: true, prognosticModel: 'weathernext3' });
      expect(container.querySelector('.atmospheric-column-cyanotype')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-cyanotype')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-cyanotype')).not.toBeNull();
    });

    it('enforces single-border HUD enclosure contract (zero nested neatlines)', async () => {
      await renderDrawer({ showClouds: true });
      expect(container.querySelectorAll('.border-current\\/15').length).toBe(0);
      expect(container.querySelectorAll('.inset-\\[2px\\]').length).toBe(0);
    });
  });
});
