// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m1-1-behavioral-bridges.test.ts
// Challenger 1: Behavioral Adversarial Verification & Window Bridge Test Suite
// Milestone 1 (Primitive Consistency - R1) of AtmosphereDrawer Precision Refactor
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AtmosphereDrawer, PrognosticModelBackend } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 1: AtmosphereDrawer Behavioral & Window Bridge Verification', () => {
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
  let mockEngine: {
    setWeatherOpticalMode: ReturnType<typeof vi.fn>;
    setLclGating: ReturnType<typeof vi.fn>;
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
    mockEngine = {
      setWeatherOpticalMode: vi.fn(),
      setLclGating: vi.fn(),
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
    delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Objective 3: TactileSwitch & __INDICATRIX_SET_CLOUD_OPTIONS__
  // ==========================================================================
  describe('Objective 3: TactileSwitch Master Toggle & Bridge Dispatches', () => {
    it('CHALLENGE-01: TactileSwitch dispatches __INDICATRIX_SET_CLOUD_OPTIONS__ with { showClouds } on toggle', async () => {
      const onShowCloudsChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            onShowCloudsChange,
          })
        );
      });

      const tactileSwitch = container.querySelector('[role="switch"]') as HTMLElement;
      expect(tactileSwitch).not.toBeNull();
      expect(tactileSwitch.getAttribute('aria-checked')).toBe('true');

      // Click to toggle OFF
      await act(async () => {
        tactileSwitch.click();
      });

      expect(onShowCloudsChange).toHaveBeenCalledWith(false);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showClouds: false });
    });

    it('CHALLENGE-02: TactileSwitch keyboard navigation (Enter and Space) toggles state and dispatches bridge', async () => {
      const onShowCloudsChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: false,
            onShowCloudsChange,
          })
        );
      });

      const tactileSwitch = container.querySelector('[role="switch"]') as HTMLElement;
      expect(tactileSwitch.getAttribute('aria-checked')).toBe('false');

      // Press Enter
      await act(async () => {
        tactileSwitch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onShowCloudsChange).toHaveBeenCalledWith(true);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showClouds: true });

      // Press Space
      await act(async () => {
        tactileSwitch.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(onShowCloudsChange).toHaveBeenCalledWith(true);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showClouds: true });
    });

    it('CHALLENGE-03: Accordion collapsing — when showClouds is false, sub-controls are unmounted', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: false,
          })
        );
      });

      // No segmented controls should be rendered when master switch is off
      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(0);

      // Re-render with showClouds: true
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
          })
        );
      });

      // Now 4 radiogroups should be present (vertical scale, thermodynamic gating, weather optical mode, prognostic model)
      const visibleGroups = container.querySelectorAll('[role="radiogroup"]');
      expect(visibleGroups.length).toBe(4);
    });
  });

  // ==========================================================================
  // Objective 2: 5 Segmented Controls & Window Bridge Dispatches
  // ==========================================================================
  describe('Objective 2: 5 Segmented Controls Window Bridge Dispatch Verification', () => {
    it('CHALLENGE-04: Vertical Scale Transfer dispatches __INDICATRIX_SET_VERTICAL_SCALE_MODE__', async () => {
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

      // Find Vertical Scale radiogroup
      // It has options "Linear (Legacy)" and "Dual-Logarithmic"
      const buttons = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      const dualLogBtn = Array.from(buttons).find((b) => b.textContent?.includes('Dual-Logarithmic'));
      expect(dualLogBtn).toBeDefined();

      await act(async () => {
        dualLogBtn?.click();
      });

      expect(onVerticalScaleModeChange).toHaveBeenCalledWith(1);
      expect(mockSetVerticalScaleMode).toHaveBeenCalledWith(1);

      // Click Linear button
      const linearBtn = Array.from(buttons).find((b) => b.textContent?.includes('Linear (Legacy)'));
      expect(linearBtn).toBeDefined();

      await act(async () => {
        linearBtn?.click();
      });

      expect(onVerticalScaleModeChange).toHaveBeenCalledWith(0);
      expect(mockSetVerticalScaleMode).toHaveBeenCalledWith(0);
    });

    it('CHALLENGE-05: Thermodynamic Gating dispatches __INDICATRIX_SET_THERMODYNAMIC_GATING__ and engine.setLclGating', async () => {
      const onThermodynamicGatingChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            thermodynamicGating: true,
            onThermodynamicGatingChange,
          })
        );
      });

      const gatingOffBtn = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-off');
      const gatingOnBtn = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-on');
      expect(gatingOffBtn).not.toBeNull();
      expect(gatingOnBtn).not.toBeNull();

      // Click OFF
      await act(async () => {
        gatingOffBtn?.click();
      });

      expect(onThermodynamicGatingChange).toHaveBeenCalledWith(false);
      expect(mockSetThermodynamicGating).toHaveBeenCalledWith(false);
      expect(mockEngine.setLclGating).toHaveBeenCalledWith(false);
      expect(mockEngine.lclGating).toBe(false);

      // Click ON
      await act(async () => {
        gatingOnBtn?.click();
      });

      expect(onThermodynamicGatingChange).toHaveBeenCalledWith(true);
      expect(mockSetThermodynamicGating).toHaveBeenCalledWith(true);
      expect(mockEngine.setLclGating).toHaveBeenCalledWith(true);
      expect(mockEngine.lclGating).toBe(true);
    });

    it('CHALLENGE-06: Weather Optical Mode dispatches __INDICATRIX_SET_WEATHER_OPTICAL_MODE__ and engine.setWeatherOpticalMode', async () => {
      const onWeatherOpticalModeChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            weatherOpticalMode: 0,
            onWeatherOpticalModeChange,
          })
        );
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      const dopplerBtn = Array.from(buttons).find((b) => b.textContent?.includes('Doppler Radar'));
      const inkWashBtn = Array.from(buttons).find((b) => b.textContent?.includes('Archival Ink Wash'));
      expect(dopplerBtn).toBeDefined();
      expect(inkWashBtn).toBeDefined();

      // Switch to Doppler Radar (1)
      await act(async () => {
        dopplerBtn?.click();
      });

      expect(onWeatherOpticalModeChange).toHaveBeenCalledWith(1);
      expect(mockSetWeatherOpticalMode).toHaveBeenCalledWith(1);
      expect(mockEngine.setWeatherOpticalMode).toHaveBeenCalledWith(1);

      // Switch back to Ink Wash (0)
      await act(async () => {
        inkWashBtn?.click();
      });

      expect(onWeatherOpticalModeChange).toHaveBeenCalledWith(0);
      expect(mockSetWeatherOpticalMode).toHaveBeenCalledWith(0);
      expect(mockEngine.setWeatherOpticalMode).toHaveBeenCalledWith(0);
    });

    it('CHALLENGE-07: Prognostic Model dispatches __INDICATRIX_SET_PROGNOSTIC_MODEL__ and toggles WeatherNext variable panel', async () => {
      const onPrognosticModelChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
            onPrognosticModelChange,
          })
        );
      });

      // Under GFS, prognostic variables radiogroup should NOT be visible
      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();

      const buttons = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      const weatherNextBtn = Array.from(buttons).find((b) => b.textContent?.includes('WeatherNext 3'));
      expect(weatherNextBtn).toBeDefined();

      // Switch to WeatherNext 3
      await act(async () => {
        weatherNextBtn?.click();
      });

      expect(onPrognosticModelChange).toHaveBeenCalledWith('weathernext3');
      expect(mockSetPrognosticModel).toHaveBeenCalledWith('weathernext3');
    });

    it('CHALLENGE-08: Prognostic Variable dispatches __INDICATRIX_SET_PROGNOSTIC_VARIABLE__ and triggers wind layer when wind selected', async () => {
      const onPrognosticVariableChange = vi.fn();
      const onTogglePlanetaryLayer = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            prognosticVariable: 'total_precipitation_1hr_mean',
            onPrognosticVariableChange,
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
      expect(onPrognosticVariableChange).toHaveBeenCalledWith('temperature_2m_mean');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('temperature_2m_mean');
      expect(onTogglePlanetaryLayer).not.toHaveBeenCalled();

      // Click Wind
      await act(async () => {
        windBtn?.click();
      });
      expect(onPrognosticVariableChange).toHaveBeenCalledWith('wind_10m_vector');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('wind_10m_vector');
      expect(onTogglePlanetaryLayer).toHaveBeenCalledWith('noaa-gfs-wind', true);

      // Click Rain
      await act(async () => {
        rainBtn?.click();
      });
      expect(onPrognosticVariableChange).toHaveBeenCalledWith('total_precipitation_1hr_mean');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('total_precipitation_1hr_mean');
    });
  });

  // ==========================================================================
  // Objective 1: State Updates, Controlled/Uncontrolled Dual Mode & Invariants
  // ==========================================================================
  describe('Objective 1: Controlled vs Uncontrolled Dual Mode & Interaction Robustness', () => {
    it('CHALLENGE-09: Uncontrolled mode operates internal state correctly and responds to user interaction', async () => {
      // Mount with NO props at all (fully uncontrolled)
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, {}));
      });

      // Initially showClouds=true, prognosticModel='gfs' (variables hidden)
      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();

      // Find WeatherNext 3 button in Prognostic Model radiogroup
      const buttons = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      const weatherNextBtn = Array.from(buttons).find((b) => b.textContent?.includes('WeatherNext 3'));
      expect(weatherNextBtn).toBeDefined();

      // Click WeatherNext 3 to switch internal state to 'weathernext3'
      await act(async () => {
        weatherNextBtn?.click();
      });

      // Now prognostic variables are mounted in uncontrolled mode
      const rainBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-rain');
      const tempBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-temp');
      expect(rainBtn).not.toBeNull();
      expect(tempBtn).not.toBeNull();
      expect(rainBtn?.getAttribute('aria-checked')).toBe('true');
      expect(tempBtn?.getAttribute('aria-checked')).toBe('false');

      // Click Temp button in uncontrolled mode
      await act(async () => {
        tempBtn?.click();
      });

      // Internal state updates: Temp should now be checked and Rain unchecked
      expect(tempBtn?.getAttribute('aria-checked')).toBe('true');
      expect(rainBtn?.getAttribute('aria-checked')).toBe('false');
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('temperature_2m_mean');
    });

    it('CHALLENGE-10: Controlled mode respects prop override and reflects outside updates', async () => {
      const renderWithModel = async (model: PrognosticModelBackend) => {
        await act(async () => {
          root.render(
            React.createElement(AtmosphereDrawer, {
              showClouds: true,
              prognosticModel: model,
            })
          );
        });
      };

      await renderWithModel('gfs');
      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();

      // Outer state switches to 'weathernext3'
      await renderWithModel('weathernext3');
      expect(container.querySelector('#sidebar-variable-rain')).not.toBeNull();

      // Outer state switches back to 'gfs'
      await renderWithModel('gfs');
      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();
    });

    it('CHALLENGE-11: Tolerates missing window bridges without runtime exceptions', async () => {
      // Remove all bridge functions
      delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
      delete (window as any).__INDICATRIX_SET_VERTICAL_SCALE_MODE__;
      delete (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__;
      delete (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__;
      delete (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__;
      delete (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__;
      delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const masterSwitch = container.querySelector('[role="switch"]') as HTMLElement;
      const tempBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-temp');
      const gatingOffBtn = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-off');

      // None of these clicks should throw
      await expect(
        act(async () => {
          masterSwitch.click();
          tempBtn?.click();
          gatingOffBtn?.click();
        })
      ).resolves.not.toThrow();
    });

    it('CHALLENGE-12: Rapid 1,000-iteration Monte Carlo stress test preserves state and call integrity', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const gatingOn = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-on');
      const gatingOff = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-off');
      const rain = container.querySelector<HTMLButtonElement>('#sidebar-variable-rain');
      const temp = container.querySelector<HTMLButtonElement>('#sidebar-variable-temp');
      const wind = container.querySelector<HTMLButtonElement>('#sidebar-variable-wind');

      const actions = [
        () => gatingOn?.click(),
        () => gatingOff?.click(),
        () => rain?.click(),
        () => temp?.click(),
        () => wind?.click(),
      ];

      await act(async () => {
        for (let i = 0; i < 1000; i++) {
          const action = actions[i % actions.length];
          action();
        }
      });

      // Verify no NaNs or undefined dispatched to bridges
      mockSetThermodynamicGating.mock.calls.forEach(([arg]) => {
        expect(typeof arg).toBe('boolean');
      });
      mockSetPrognosticVariable.mock.calls.forEach(([arg]) => {
        expect(['total_precipitation_1hr_mean', 'temperature_2m_mean', 'wind_10m_vector']).toContain(arg);
      });
    });
  });
});
