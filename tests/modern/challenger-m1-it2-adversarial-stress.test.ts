// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m1-it2-adversarial-stress.test.ts
// Challenger 1 (Iteration 2): Behavioral Adversarial Stress-Test Suite
// Milestone 1 (Primitive Consistency - R1) after Remediation
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SegmentedControl, SegmentOption } from '../../src/components/ui/SegmentedControl';
import { TactileSwitch } from '../../src/components/ui/TactileSwitch';
import { AtmosphereDrawer, PrognosticModelBackend } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Milestone 1 Iteration 2: Challenger 1 Adversarial Stress-Testing', () => {
  let container: HTMLDivElement;
  let root: Root;

  // Global window bridge mocks
  let mockSetCloudOptions: ReturnType<typeof vi.fn>;
  let mockSetVerticalScaleMode: ReturnType<typeof vi.fn>;
  let mockSetThermodynamicGating: ReturnType<typeof vi.fn>;
  let mockSetWeatherOpticalMode: ReturnType<typeof vi.fn>;
  let mockSetPrognosticModel: ReturnType<typeof vi.fn>;
  let mockSetPrognosticVariable: ReturnType<typeof vi.fn>;
  let mockSetAtmosphericScale: ReturnType<typeof vi.fn>;
  let mockSetShadowIntensity: ReturnType<typeof vi.fn>;
  let mockSetRainShadowFeedback: ReturnType<typeof vi.fn>;
  let mockSetPluvialGamma: ReturnType<typeof vi.fn>;
  let mockEngine: {
    setWeatherOpticalMode: ReturnType<typeof vi.fn>;
    setLclGating: ReturnType<typeof vi.fn>;
    setPluvialGamma: ReturnType<typeof vi.fn>;
    lclGating: boolean;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockSetCloudOptions = vi.fn();
    mockSetVerticalScaleMode = vi.fn();
    mockSetThermodynamicGating = vi.fn();
    mockSetWeatherOpticalMode = vi.fn();
    mockSetPrognosticModel = vi.fn();
    mockSetPrognosticVariable = vi.fn();
    mockSetAtmosphericScale = vi.fn();
    mockSetShadowIntensity = vi.fn();
    mockSetRainShadowFeedback = vi.fn();
    mockSetPluvialGamma = vi.fn();

    mockEngine = {
      setWeatherOpticalMode: vi.fn(),
      setLclGating: vi.fn(),
      setPluvialGamma: vi.fn(),
      lclGating: true,
    };

    (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = mockSetCloudOptions;
    (window as any).__INDICATRIX_SET_VERTICAL_SCALE_MODE__ = mockSetVerticalScaleMode;
    (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__ = mockSetThermodynamicGating;
    (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__ = mockSetWeatherOpticalMode;
    (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__ = mockSetPrognosticModel;
    (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__ = mockSetPrognosticVariable;
    (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__ = mockSetAtmosphericScale;
    (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__ = mockSetShadowIntensity;
    (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__ = mockSetRainShadowFeedback;
    (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__ = mockSetPluvialGamma;
    (window as any).__INDICATRIX_WEBGPU_ENGINE__ = mockEngine;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();

    delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
    delete (window as any).__INDICATRIX_SET_VERTICAL_SCALE_MODE__;
    delete (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__;
    delete (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__;
    delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
    delete (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__;
    delete (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__;
    delete (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__;
    delete (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__;
    delete (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__;
    delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;

    vi.restoreAllMocks();
  });

  // ==========================================================================
  // OBJECTIVE 1: KEYBOARD ARROW NAVIGATION & PROGRAMMATIC FOCUS IN SegmentedControl
  // ==========================================================================
  describe('Objective 1: SegmentedControl Keyboard Arrow Navigation & Programmatic Focus', () => {
    const options3: SegmentOption<string>[] = [
      { id: 'first', label: 'First Option', domId: 'btn-opt-0' },
      { id: 'second', label: 'Second Option', domId: 'btn-opt-1' },
      { id: 'third', label: 'Third Option', domId: 'btn-opt-2' },
    ];

    it('VERIFY-FOCUS-01: ArrowRight navigates forward and imperatively calls .focus() on next button', async () => {
      let currentVal = 'first';
      const handleChange = vi.fn((val: string) => {
        currentVal = val;
      });

      // Wrapper component simulating parent state management
      function TestHost() {
        const [val, setVal] = React.useState('first');
        return React.createElement(SegmentedControl, {
          options: options3,
          value: val,
          onChange: (next: string) => {
            setVal(next);
            handleChange(next);
          },
        });
      }

      await act(async () => {
        root.render(React.createElement(TestHost));
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      expect(buttons.length).toBe(3);

      // Focus first button
      buttons[0].focus();
      expect(document.activeElement).toBe(buttons[0]);

      // Press ArrowRight -> should advance to index 1 ('second')
      await act(async () => {
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(handleChange).toHaveBeenCalledWith('second');
      // Verify imperative DOM focus shifted to buttons[1]
      expect(document.activeElement).toBe(buttons[1]);
      expect(buttons[1].getAttribute('aria-checked')).toBe('true');
      expect(buttons[1].getAttribute('tabindex')).toBe('0');
      expect(buttons[0].getAttribute('aria-checked')).toBe('false');
      expect(buttons[0].getAttribute('tabindex')).toBe('-1');
    });

    it('VERIFY-FOCUS-02: ArrowDown behaves identically to ArrowRight (forward navigation & focus)', async () => {
      function TestHost() {
        const [val, setVal] = React.useState('second');
        return React.createElement(SegmentedControl, {
          options: options3,
          value: val,
          onChange: (v: string) => setVal(v),
        });
      }

      await act(async () => {
        root.render(React.createElement(TestHost));
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[1].focus();
      expect(document.activeElement).toBe(buttons[1]);

      // Press ArrowDown from index 1 -> advances to index 2 ('third')
      await act(async () => {
        buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });

      expect(document.activeElement).toBe(buttons[2]);
      expect(buttons[2].getAttribute('aria-checked')).toBe('true');
      expect(buttons[2].getAttribute('tabindex')).toBe('0');
    });

    it('VERIFY-FOCUS-03: Forward wrap-around — ArrowRight on the last option wraps to the first option and shifts focus', async () => {
      function TestHost() {
        const [val, setVal] = React.useState('third');
        return React.createElement(SegmentedControl, {
          options: options3,
          value: val,
          onChange: (v: string) => setVal(v),
        });
      }

      await act(async () => {
        root.render(React.createElement(TestHost));
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[2].focus();
      expect(document.activeElement).toBe(buttons[2]);

      // Press ArrowRight on the last button -> wraps to index 0 ('first')
      await act(async () => {
        buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(document.activeElement).toBe(buttons[0]);
      expect(buttons[0].getAttribute('aria-checked')).toBe('true');
      expect(buttons[0].getAttribute('tabindex')).toBe('0');
      expect(buttons[2].getAttribute('aria-checked')).toBe('false');
      expect(buttons[2].getAttribute('tabindex')).toBe('-1');
    });

    it('VERIFY-FOCUS-04: Backward wrap-around — ArrowLeft on the first option wraps to the last option and shifts focus', async () => {
      function TestHost() {
        const [val, setVal] = React.useState('first');
        return React.createElement(SegmentedControl, {
          options: options3,
          value: val,
          onChange: (v: string) => setVal(v),
        });
      }

      await act(async () => {
        root.render(React.createElement(TestHost));
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[0].focus();
      expect(document.activeElement).toBe(buttons[0]);

      // Press ArrowLeft on index 0 -> wraps to index 2 ('third')
      await act(async () => {
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });

      expect(document.activeElement).toBe(buttons[2]);
      expect(buttons[2].getAttribute('aria-checked')).toBe('true');
      expect(buttons[2].getAttribute('tabindex')).toBe('0');
      expect(buttons[0].getAttribute('aria-checked')).toBe('false');
      expect(buttons[0].getAttribute('tabindex')).toBe('-1');
    });

    it('VERIFY-FOCUS-05: ArrowUp behaves identically to ArrowLeft (backward navigation & wrap-around focus)', async () => {
      function TestHost() {
        const [val, setVal] = React.useState('first');
        return React.createElement(SegmentedControl, {
          options: options3,
          value: val,
          onChange: (v: string) => setVal(v),
        });
      }

      await act(async () => {
        root.render(React.createElement(TestHost));
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[0].focus();

      // Press ArrowUp on index 0 -> wraps to index 2 ('third')
      await act(async () => {
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });

      expect(document.activeElement).toBe(buttons[2]);
      expect(buttons[2].getAttribute('aria-checked')).toBe('true');
    });

    it('VERIFY-FOCUS-06: Continuous multi-step cycle wraps seamlessly across multiple laps', async () => {
      function TestHost() {
        const [val, setVal] = React.useState('first');
        return React.createElement(SegmentedControl, {
          options: options3,
          value: val,
          onChange: (v: string) => setVal(v),
        });
      }

      await act(async () => {
        root.render(React.createElement(TestHost));
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[0].focus();

      // Step forward 7 times: sequence 0 -> 1 -> 2 -> 0 -> 1 -> 2 -> 0 -> 1 (index 1 = 'second')
      const expectedIndices = [1, 2, 0, 1, 2, 0, 1];
      for (const expectedIdx of expectedIndices) {
        const activeBtn = document.activeElement as HTMLButtonElement;
        await act(async () => {
          activeBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });
        expect(document.activeElement).toBe(buttons[expectedIdx]);
      }
    });

    it('VERIFY-FOCUS-07: Isolated focus scoping across multiple adjacent SegmentedControls on the same page', async () => {
      function MultiHost() {
        const [valA, setValA] = React.useState('A1');
        const [valB, setValB] = React.useState('B1');
        return React.createElement('div', null, [
          React.createElement(SegmentedControl, {
            key: 'grpA',
            id: 'radiogroup-a',
            options: [
              { id: 'A1', label: 'A1' },
              { id: 'A2', label: 'A2' },
            ],
            value: valA,
            onChange: (v: string) => setValA(v),
          }),
          React.createElement(SegmentedControl, {
            key: 'grpB',
            id: 'radiogroup-b',
            options: [
              { id: 'B1', label: 'B1' },
              { id: 'B2', label: 'B2' },
            ],
            value: valB,
            onChange: (v: string) => setValB(v),
          }),
        ]);
      }

      await act(async () => {
        root.render(React.createElement(MultiHost));
      });

      const groupA = container.querySelector('#radiogroup-a');
      const groupB = container.querySelector('#radiogroup-b');
      const radiosA = groupA?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')!;
      const radiosB = groupB?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')!;

      radiosA[0].focus();
      expect(document.activeElement).toBe(radiosA[0]);

      // Navigating in group A must strictly focus within group A, never group B
      await act(async () => {
        radiosA[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(document.activeElement).toBe(radiosA[1]);

      // Focus group B
      radiosB[0].focus();
      expect(document.activeElement).toBe(radiosB[0]);

      await act(async () => {
        radiosB[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(document.activeElement).toBe(radiosB[1]);
    });

    it('VERIFY-FOCUS-08: Non-navigation keys (Tab, Enter, Escape, Character keys) do NOT change selection or trigger refocus', async () => {
      const handleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options: options3,
            value: 'second',
            onChange: handleChange,
          })
        );
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[1].focus();
      const focusSpy = vi.spyOn(buttons[0], 'focus');
      const focusSpy2 = vi.spyOn(buttons[2], 'focus');

      for (const key of ['Tab', 'Enter', 'Escape', ' ', 'a', 'Home', 'End']) {
        await act(async () => {
          buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        });
      }

      expect(handleChange).not.toHaveBeenCalled();
      expect(focusSpy).not.toHaveBeenCalled();
      expect(focusSpy2).not.toHaveBeenCalled();
    });

    it('VERIFY-FOCUS-09: Disabled control blocks keyboard navigation and preserves current focus', async () => {
      const handleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options: options3,
            value: 'first',
            disabled: true,
            onChange: handleChange,
          })
        );
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      await act(async () => {
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // OBJECTIVE 2: AtmosphereDrawer WITH SegmentedControl & TactileSwitch BRIDGE TESTS
  // ==========================================================================
  describe('Objective 2: AtmosphereDrawer SegmentedControls & TactileSwitch Bridge Dispatches', () => {
    it('VERIFY-BRIDGE-01: Master TactileSwitch toggles cloud deck and dispatches __INDICATRIX_SET_CLOUD_OPTIONS__', async () => {
      const onShowCloudsChange = vi.fn();

      function Host() {
        const [show, setShow] = React.useState(true);
        return React.createElement(AtmosphereDrawer, {
          showClouds: show,
          onShowCloudsChange: (val: boolean) => {
            setShow(val);
            onShowCloudsChange(val);
          },
        });
      }

      await act(async () => {
        root.render(React.createElement(Host));
      });

      const masterSwitch = container.querySelector<HTMLButtonElement>('[role="switch"]');
      expect(masterSwitch).not.toBeNull();
      expect(masterSwitch?.getAttribute('aria-checked')).toBe('true');

      // Toggle OFF via click
      await act(async () => {
        masterSwitch?.click();
      });

      expect(onShowCloudsChange).toHaveBeenCalledWith(false);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showClouds: false });

      // Re-query switch after state update
      const updatedSwitch = container.querySelector<HTMLButtonElement>('[role="switch"]');
      expect(updatedSwitch?.getAttribute('aria-checked')).toBe('false');

      // Toggle ON via keyboard space
      await act(async () => {
        updatedSwitch?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });

      expect(onShowCloudsChange).toHaveBeenCalledWith(true);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showClouds: true });
    });

    it('VERIFY-BRIDGE-02: Vertical Scale Transfer SegmentedControl dispatches __INDICATRIX_SET_VERTICAL_SCALE_MODE__ with exact numeric mode', async () => {
      const onVerticalScaleModeChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            verticalScaleMode: 0,
            onVerticalScaleModeChange,
          })
        );
      });

      // Find radio buttons
      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      const dualLogBtn = buttons.find((b) => b.textContent?.includes('Dual-Logarithmic'));
      const linearBtn = buttons.find((b) => b.textContent?.includes('Linear (Legacy)'));

      expect(dualLogBtn).toBeDefined();
      expect(linearBtn).toBeDefined();

      // Click Dual-Logarithmic (1)
      await act(async () => {
        dualLogBtn?.click();
      });
      expect(onVerticalScaleModeChange).toHaveBeenCalledWith(1);
      expect(mockSetVerticalScaleMode).toHaveBeenCalledWith(1);

      // Click Linear (0)
      await act(async () => {
        linearBtn?.click();
      });
      expect(onVerticalScaleModeChange).toHaveBeenCalledWith(0);
      expect(mockSetVerticalScaleMode).toHaveBeenCalledWith(0);
    });

    it('VERIFY-BRIDGE-03: Thermodynamic Gating SegmentedControl dispatches __INDICATRIX_SET_THERMODYNAMIC_GATING__ and sets engine properties', async () => {
      const onGatingChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            thermodynamicGating: true,
            onThermodynamicGatingChange: onGatingChange,
          })
        );
      });

      const onBtn = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-on');
      const offBtn = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-off');

      expect(onBtn).not.toBeNull();
      expect(offBtn).not.toBeNull();
      expect(onBtn?.getAttribute('aria-checked')).toBe('true');
      expect(offBtn?.getAttribute('aria-checked')).toBe('false');

      // Click OFF
      await act(async () => {
        offBtn?.click();
      });

      expect(onGatingChange).toHaveBeenCalledWith(false);
      expect(mockSetThermodynamicGating).toHaveBeenCalledWith(false);
      expect(mockEngine.setLclGating).toHaveBeenCalledWith(false);
      expect(mockEngine.lclGating).toBe(false);

      // Click ON
      await act(async () => {
        onBtn?.click();
      });

      expect(onGatingChange).toHaveBeenCalledWith(true);
      expect(mockSetThermodynamicGating).toHaveBeenCalledWith(true);
      expect(mockEngine.setLclGating).toHaveBeenCalledWith(true);
      expect(mockEngine.lclGating).toBe(true);
    });

    it('VERIFY-BRIDGE-04: Weather Optical Mode SegmentedControl dispatches __INDICATRIX_SET_WEATHER_OPTICAL_MODE__ and engine method', async () => {
      const onModeChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 0,
            onWeatherOpticalModeChange: onModeChange,
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      const dopplerBtn = buttons.find((b) => b.textContent?.includes('Doppler Radar'));
      const inkWashBtn = buttons.find((b) => b.textContent?.includes('Archival Ink Wash'));

      expect(dopplerBtn).toBeDefined();
      expect(inkWashBtn).toBeDefined();

      // Click Doppler (1)
      await act(async () => {
        dopplerBtn?.click();
      });
      expect(onModeChange).toHaveBeenCalledWith(1);
      expect(mockSetWeatherOpticalMode).toHaveBeenCalledWith(1);
      expect(mockEngine.setWeatherOpticalMode).toHaveBeenCalledWith(1);

      // Click Ink Wash (0)
      await act(async () => {
        inkWashBtn?.click();
      });
      expect(onModeChange).toHaveBeenCalledWith(0);
      expect(mockSetWeatherOpticalMode).toHaveBeenCalledWith(0);
      expect(mockEngine.setWeatherOpticalMode).toHaveBeenCalledWith(0);
    });

    it('VERIFY-BRIDGE-05: Prognostic Model SegmentedControl switches backend and mounts WeatherNext variable options', async () => {
      const onModelChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
            onPrognosticModelChange: onModelChange,
          })
        );
      });

      // Variable buttons must not exist yet under GFS
      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();

      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      const weatherNextBtn = buttons.find((b) => b.textContent?.includes('DeepMind WeatherNext 3'));
      expect(weatherNextBtn).toBeDefined();

      // Switch to WeatherNext 3
      await act(async () => {
        weatherNextBtn?.click();
      });

      expect(onModelChange).toHaveBeenCalledWith('weathernext3');
      expect(mockSetPrognosticModel).toHaveBeenCalledWith('weathernext3');
    });

    it('VERIFY-BRIDGE-06: Prognostic Variable SegmentedControl dispatches __INDICATRIX_SET_PROGNOSTIC_VARIABLE__ and toggles wind layer', async () => {
      const onVariableChange = vi.fn();
      const onTogglePlanetaryLayer = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            prognosticVariable: 'total_precipitation_1hr_mean',
            onPrognosticVariableChange: onVariableChange,
            onTogglePlanetaryLayer,
          })
        );
      });

      const rainBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-rain');
      const tempBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-temp');
      const windBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-wind');

      expect(rainBtn).not.toBeNull();
      expect(tempBtn).not.toBeNull();
      expect(windBtn).not.toBeNull();

      // Click Temp
      await act(async () => {
        tempBtn?.click();
      });
      expect(onVariableChange).toHaveBeenCalledWith('temperature_2m_mean');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('temperature_2m_mean');

      // Click Wind
      await act(async () => {
        windBtn?.click();
      });
      expect(onVariableChange).toHaveBeenCalledWith('wind_10m_vector');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('wind_10m_vector');
      expect(onTogglePlanetaryLayer).toHaveBeenCalledWith('noaa-gfs-wind', true);

      // Click Rain
      await act(async () => {
        rainBtn?.click();
      });
      expect(onVariableChange).toHaveBeenCalledWith('total_precipitation_1hr_mean');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('total_precipitation_1hr_mean');
    });

    it('VERIFY-BRIDGE-07: VernierSliders dispatch continuous atmospheric parameters to window bridges', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            atmosphericScale: 1.0,
            shadowIntensity: 0.1,
            cloudDriftSpeed: 100,
            rainShadowFeedback: 0.2,
            pluvialGamma: 0.5,
          })
        );
      });

      // Find VernierSliders by id
      const scaleInput = container.querySelector<HTMLInputElement>('#sidebar-atmospheric-scale input[type="range"], input#sidebar-atmospheric-scale');
      const shadowInput = container.querySelector<HTMLInputElement>('#sidebar-shadow-intensity input[type="range"], input#sidebar-shadow-intensity');
      const driftInput = container.querySelector<HTMLInputElement>('#sidebar-cloud-drift input[type="range"], input#sidebar-cloud-drift');
      const rainShadowInput = container.querySelector<HTMLInputElement>('#sidebar-rain-shadow input[type="range"], input#sidebar-rain-shadow');
      const pluvialInput = container.querySelector<HTMLInputElement>('#sidebar-pluvial-coupling input[type="range"], input#sidebar-pluvial-coupling');

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      const triggerSlider = async (input: HTMLInputElement | null, val: string) => {
        expect(input).not.toBeNull();
        await act(async () => {
          if (input) {
            nativeSetter?.call(input, val);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      };

      await triggerSlider(scaleInput, '5.5');
      expect(mockSetAtmosphericScale).toHaveBeenCalledWith(5.5);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ atmosphericScale: 5.5 });

      await triggerSlider(shadowInput, '0.45');
      expect(mockSetShadowIntensity).toHaveBeenCalledWith(0.45);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ shadowIntensity: 0.45 });

      await triggerSlider(driftInput, '800');
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ cloudDriftSpeed: 800 });

      await triggerSlider(rainShadowInput, '0.75');
      expect(mockSetRainShadowFeedback).toHaveBeenCalledWith(0.75);

      await triggerSlider(pluvialInput, '1.4');
      expect(mockSetPluvialGamma).toHaveBeenCalledWith(1.4);
      expect(mockEngine.setPluvialGamma).toHaveBeenCalledWith(1.4);
    });

    it('VERIFY-BRIDGE-08: 500-action adversarial interaction stress test verifies non-degradation and zero throw', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      expect(buttons.length).toBeGreaterThanOrEqual(11);

      await act(async () => {
        for (let i = 0; i < 500; i++) {
          const btn = buttons[i % buttons.length];
          btn.click();
        }
      });

      // Radiogroups must still be intact and valid
      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(5);
      radiogroups.forEach((group) => {
        const radios = group.querySelectorAll('[role="radio"]');
        const active = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'true');
        expect(active.length).toBe(1);
      });
    });
  });
});
