// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m1-2-aria-dom.test.ts
// Challenger 2: DOM, Accessibility & ARIA Semantics Verification Suite
// Milestone 1 (Primitive Consistency - R1) of AtmosphereDrawer Precision Refactor
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { BathymetricTideGauge } from '../../src/components/hud/instruments/BathymetricTideGauge';
import { SegmentedControl } from '../../src/components/ui/SegmentedControl';
import { TactileSwitch } from '../../src/components/ui/TactileSwitch';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 2: DOM, Accessibility & ARIA Semantics Verification', () => {
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
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. ARIA Semantics & Keyboard Navigation on SegmentedControl
  // ==========================================================================
  describe('1. SegmentedControl ARIA Semantics & Keyboard Navigation', () => {
    it('CHALLENGE-ARIA-01: container has role="radiogroup" and options have role="radio"', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options: [
              { id: 'opt1', label: 'Option 1' },
              { id: 'opt2', label: 'Option 2' },
              { id: 'opt3', label: 'Option 3' },
            ],
            value: 'opt2',
            onChange,
            'aria-label': 'Test Radiogroup',
          })
        );
      });

      const radiogroup = container.querySelector('[role="radiogroup"]');
      expect(radiogroup).not.toBeNull();
      expect(radiogroup?.getAttribute('aria-label')).toBe('Test Radiogroup');

      const radios = container.querySelectorAll('[role="radio"]');
      expect(radios.length).toBe(3);

      // Check aria-checked and roving tabindex
      expect(radios[0].getAttribute('aria-checked')).toBe('false');
      expect(radios[0].getAttribute('tabindex')).toBe('-1');

      expect(radios[1].getAttribute('aria-checked')).toBe('true');
      expect(radios[1].getAttribute('tabindex')).toBe('0');

      expect(radios[2].getAttribute('aria-checked')).toBe('false');
      expect(radios[2].getAttribute('tabindex')).toBe('-1');
    });

    it('CHALLENGE-ARIA-02: keyboard navigation (ArrowRight / ArrowLeft / ArrowDown / ArrowUp) cycles selection', async () => {
      let currentValue = 'alpha';
      const handleChange = vi.fn((val: string) => {
        currentValue = val;
      });

      const renderControl = async (val: string) => {
        await act(async () => {
          root.render(
            React.createElement(SegmentedControl, {
              options: [
                { id: 'alpha', label: 'Alpha' },
                { id: 'beta', label: 'Beta' },
                { id: 'gamma', label: 'Gamma' },
              ],
              value: val,
              onChange: handleChange,
            })
          );
        });
      };

      await renderControl(currentValue);

      const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      expect(radios.length).toBe(3);

      // Focus on active radio and press ArrowRight -> should select 'beta'
      radios[0].focus();
      await act(async () => {
        radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(handleChange).toHaveBeenCalledWith('beta');

      // Update rendered value to 'beta'
      await renderControl('beta');
      const updatedRadios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');

      // Press ArrowDown -> should select 'gamma'
      await act(async () => {
        updatedRadios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(handleChange).toHaveBeenCalledWith('gamma');

      // Wrap-around forward: ArrowRight from 'gamma' -> selects 'alpha'
      await renderControl('gamma');
      const gammaRadios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      await act(async () => {
        gammaRadios[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(handleChange).toHaveBeenCalledWith('alpha');

      // Wrap-around backward: ArrowLeft from 'alpha' -> selects 'gamma'
      await renderControl('alpha');
      const alphaRadios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      await act(async () => {
        alphaRadios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(handleChange).toHaveBeenCalledWith('gamma');
    });

    it('CHALLENGE-ARIA-03: supports boolean types without type coercion bugs', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(SegmentedControl<boolean>, {
            options: [
              { id: true, label: 'ON', domId: 'btn-bool-true' },
              { id: false, label: 'OFF', domId: 'btn-bool-false' },
            ],
            value: false,
            onChange,
          })
        );
      });

      const btnTrue = container.querySelector('#btn-bool-true');
      const btnFalse = container.querySelector('#btn-bool-false');
      expect(btnTrue?.getAttribute('aria-checked')).toBe('false');
      expect(btnFalse?.getAttribute('aria-checked')).toBe('true');

      await act(async () => {
        (btnTrue as HTMLButtonElement)?.click();
      });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('CHALLENGE-ARIA-04: enforces disabled state accessibility and suppresses interactions', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options: [
              { id: '1', label: 'One' },
              { id: '2', label: 'Two' },
            ],
            value: '1',
            disabled: true,
            onChange,
          })
        );
      });

      const radiogroup = container.querySelector('[role="radiogroup"]');
      expect(radiogroup?.getAttribute('aria-disabled')).toBe('true');

      const buttons = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      expect(buttons[0].disabled).toBe(true);
      expect(buttons[1].disabled).toBe(true);

      // Attempt click on disabled button
      await act(async () => {
        buttons[1].click();
      });
      expect(onChange).not.toHaveBeenCalled();

      // Attempt keyboard event on disabled button
      await act(async () => {
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. ARIA Semantics & Keyboard Navigation on TactileSwitch
  // ==========================================================================
  describe('2. TactileSwitch ARIA Semantics & Keyboard Navigation', () => {
    it('CHALLENGE-ARIA-05: TactileSwitch renders role="switch", aria-checked, and handles clicks & keys', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TactileSwitch, {
            checked: true,
            onChange,
            label: 'Master Switch',
            sublabel: 'Master Deck Control',
          })
        );
      });

      const switchEl = container.querySelector('[role="switch"]');
      expect(switchEl).not.toBeNull();
      expect(switchEl?.getAttribute('aria-checked')).toBe('true');
      expect(switchEl?.getAttribute('tabindex')).toBe('0');

      // Click toggles state
      await act(async () => {
        switchEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(false);

      // Space key toggles state
      await act(async () => {
        switchEl?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(false);

      // Enter key toggles state
      await act(async () => {
        switchEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it('CHALLENGE-ARIA-06: TactileSwitch respects disabled state', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TactileSwitch, {
            checked: false,
            disabled: true,
            onChange,
            label: 'Disabled Switch',
          })
        );
      });

      const switchEl = container.querySelector('[role="switch"]');
      expect(switchEl?.getAttribute('aria-disabled')).toBe('true');
      expect(switchEl?.getAttribute('tabindex')).toBe('-1');

      await act(async () => {
        switchEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        switchEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. AtmosphereDrawer ARIA & DOM ID Verification
  // ==========================================================================
  describe('3. AtmosphereDrawer ARIA Semantics & Required DOM IDs', () => {
    it('CHALLENGE-DOM-01: Master Cloud Deck uses TactileSwitch with role="switch"', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
          })
        );
      });

      const masterSwitch = container.querySelector('[role="switch"]');
      expect(masterSwitch).not.toBeNull();
      expect(masterSwitch?.textContent).toContain('Atmospheric Cloud Strata');
      expect(masterSwitch?.textContent).toContain('Master Deck Control');
      expect(masterSwitch?.getAttribute('aria-checked')).toBe('true');
    });

    it('CHALLENGE-DOM-02: All 5 segmented groups in AtmosphereDrawer use role="radiogroup" with role="radio" options', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            verticalScaleMode: 1,
            thermodynamicGating: true,
            weatherOpticalMode: 0,
            prognosticVariable: 'total_precipitation_1hr_mean',
          })
        );
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      // When showClouds is true and prognosticModel is 'weathernext3', all 5 groups must be rendered:
      // 1. Vertical Scale Transfer
      // 2. Thermodynamic Gating
      // 3. Weather Optical Mode
      // 4. Prognostic Model
      // 5. Prognostic Variable
      expect(radiogroups.length).toBe(5);

      radiogroups.forEach((group) => {
        const radios = group.querySelectorAll('[role="radio"]');
        expect(radios.length).toBeGreaterThanOrEqual(2);

        // Invariant: Exactly one option must have aria-checked="true"
        const checkedRadios = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'true');
        expect(checkedRadios.length).toBe(1);

        // The remaining options must have aria-checked="false"
        const uncheckedRadios = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'false');
        expect(uncheckedRadios.length).toBe(radios.length - 1);
      });
    });

    it('CHALLENGE-DOM-03: Verifies all test-required DOM IDs are intact and findable', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            thermodynamicGating: true,
          })
        );
      });

      // Required IDs:
      // #sidebar-variable-rain
      // #sidebar-variable-temp
      // #sidebar-variable-wind
      // #sidebar-thermodynamic-gating-on
      // #sidebar-thermodynamic-gating-off
      const rainBtn = container.querySelector('#sidebar-variable-rain');
      const tempBtn = container.querySelector('#sidebar-variable-temp');
      const windBtn = container.querySelector('#sidebar-variable-wind');
      const gatingOnBtn = container.querySelector('#sidebar-thermodynamic-gating-on');
      const gatingOffBtn = container.querySelector('#sidebar-thermodynamic-gating-off');

      expect(rainBtn).not.toBeNull();
      expect(tempBtn).not.toBeNull();
      expect(windBtn).not.toBeNull();
      expect(gatingOnBtn).not.toBeNull();
      expect(gatingOffBtn).not.toBeNull();

      // All buttons must have role="radio"
      expect(rainBtn?.getAttribute('role')).toBe('radio');
      expect(tempBtn?.getAttribute('role')).toBe('radio');
      expect(windBtn?.getAttribute('role')).toBe('radio');
      expect(gatingOnBtn?.getAttribute('role')).toBe('radio');
      expect(gatingOffBtn?.getAttribute('role')).toBe('radio');

      // Initial active state check
      expect(rainBtn?.getAttribute('aria-checked')).toBe('true');
      expect(tempBtn?.getAttribute('aria-checked')).toBe('false');
      expect(windBtn?.getAttribute('aria-checked')).toBe('false');
      expect(gatingOnBtn?.getAttribute('aria-checked')).toBe('true');
      expect(gatingOffBtn?.getAttribute('aria-checked')).toBe('false');
    });

    it('CHALLENGE-DOM-04: Clicking DOM IDs updates aria-checked and triggers callbacks', async () => {
      const onVariableChange = vi.fn();
      const onGatingChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            onPrognosticVariableChange: onVariableChange,
            onThermodynamicGatingChange: onGatingChange,
          })
        );
      });

      // Click Temperature variable
      const tempBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-temp');
      expect(tempBtn).not.toBeNull();
      await act(async () => {
        tempBtn?.click();
      });

      expect(onVariableChange).toHaveBeenCalledWith('temperature_2m_mean');
      expect(tempBtn?.getAttribute('aria-checked')).toBe('true');

      // Click Wind variable
      const windBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-wind');
      expect(windBtn).not.toBeNull();
      await act(async () => {
        windBtn?.click();
      });

      expect(onVariableChange).toHaveBeenCalledWith('wind_10m_vector');
      expect(windBtn?.getAttribute('aria-checked')).toBe('true');
      expect(tempBtn?.getAttribute('aria-checked')).toBe('false');

      // Click Gating OFF
      const gatingOffBtn = container.querySelector<HTMLButtonElement>('#sidebar-thermodynamic-gating-off');
      expect(gatingOffBtn).not.toBeNull();
      await act(async () => {
        gatingOffBtn?.click();
      });

      expect(onGatingChange).toHaveBeenCalledWith(false);
      expect(gatingOffBtn?.getAttribute('aria-checked')).toBe('true');

      const gatingOnBtn = container.querySelector('#sidebar-thermodynamic-gating-on');
      expect(gatingOnBtn?.getAttribute('aria-checked')).toBe('false');
    });

    it('CHALLENGE-DOM-05: Fuzzing rapid mode switching maintains strict 1-active ARIA invariant across all 5 groups', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(5);

      // Perform 50 randomized toggle clicks across all radio buttons
      const allRadios = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      expect(allRadios.length).toBeGreaterThanOrEqual(11);

      for (let trial = 0; trial < 50; trial++) {
        const randomIndex = Math.floor(Math.random() * allRadios.length);
        const radio = allRadios[randomIndex];
        await act(async () => {
          radio.click();
        });
      }

      // Re-verify that every radiogroup maintains exactly one aria-checked="true"
      const currentRadiogroups = container.querySelectorAll('[role="radiogroup"]');
      currentRadiogroups.forEach((group) => {
        const radios = group.querySelectorAll('[role="radio"]');
        const checked = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'true');
        expect(checked.length).toBe(1);
      });
    });
  });

  // ==========================================================================
  // 4. BathymetricTideGauge #tide-gauge-water-clarity DOM ID & VernierSlider
  // ==========================================================================
  describe('4. BathymetricTideGauge #tide-gauge-water-clarity Verification', () => {
    it('CHALLENGE-DOM-06: #tide-gauge-water-clarity exists, binds waterClarity, and uses VernierSlider', async () => {
      const onClarityChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(BathymetricTideGauge, {
            waterClarity: 0.65,
            onWaterClarityChange: onClarityChange,
          })
        );
      });

      const clarityEl = container.querySelector('#tide-gauge-water-clarity');
      expect(clarityEl).not.toBeNull();

      // Check that it displays the readout '65%'
      expect(container.textContent).toContain('Beer-Lambert Clarity:');
      expect(container.textContent).toContain('65%');

      // Check if it has an interactive input or slider element
      const sliderInput = container.querySelector<HTMLInputElement>('#tide-gauge-water-clarity input[type="range"], input#tide-gauge-water-clarity');
      expect(sliderInput).not.toBeNull();
      expect(sliderInput?.value).toBe('0.65');

      // Trigger change via native setter
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      await act(async () => {
        if (sliderInput) {
          nativeInputValueSetter?.call(sliderInput, '0.80');
          sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
          sliderInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      expect(onClarityChange).toHaveBeenCalledWith(0.8);
    });
  });
});
