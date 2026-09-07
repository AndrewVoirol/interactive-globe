// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TactileSwitch } from '../../src/components/ui/TactileSwitch';
import { VernierSlider } from '../../src/components/ui/VernierSlider';
import { SegmentedControl } from '../../src/components/ui/SegmentedControl';
import { TactileButton } from '../../src/components/ui/TactileButton';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Bite 2: Standardized Micro-Controls Library', () => {
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

  describe('1. TactileSwitch', () => {
    it('renders with correct switch role, label, and checked status', async () => {
      await act(async () => {
        root.render(
          React.createElement(TactileSwitch, {
            checked: true,
            label: 'Bathymetric Soundings',
            sublabel: 'Ocean Fathoms',
          })
        );
      });

      const el = container.querySelector('[role="switch"]');
      expect(el).not.toBeNull();
      expect(el?.getAttribute('aria-checked')).toBe('true');
      expect(container.textContent).toContain('Bathymetric Soundings');
      expect(container.textContent).toContain('Ocean Fathoms');
    });

    it('toggles state on click and keyboard Enter/Space', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TactileSwitch, {
            checked: false,
            onChange,
            label: 'Cursor Physics',
          })
        );
      });

      const el = container.querySelector('[role="switch"]') as HTMLElement;
      act(() => {
        el.click();
      });
      expect(onChange).toHaveBeenCalledWith(true);

      act(() => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('does not fire onChange when disabled', async () => {
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

      const el = container.querySelector('[role="switch"]') as HTMLElement;
      act(() => {
        el.click();
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('2. VernierSlider', () => {
    it('renders range input with steppers, readout, and label', async () => {
      await act(async () => {
        root.render(
          React.createElement(VernierSlider, {
            id: 'test-slider',
            label: 'Fracture Intensity',
            value: 1.25,
            min: 0,
            max: 2,
            step: 0.05,
            readout: '1.25x',
          })
        );
      });

      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('1.25');
      expect(container.textContent).toContain('Fracture Intensity');
      expect(container.textContent).toContain('1.25x');
    });

    it('steps value down and up using stepper buttons', async () => {
      const onChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(VernierSlider, {
            id: 'stepper-slider',
            label: 'Sea Level',
            value: 0,
            min: -150,
            max: 100,
            step: 5,
            onChange,
          })
        );
      });

      const buttons = container.querySelectorAll('button');
      const minusBtn = buttons[0];
      const plusBtn = buttons[1];

      act(() => {
        minusBtn.click();
      });
      expect(onChange).toHaveBeenCalledWith(-5);

      act(() => {
        plusBtn.click();
      });
      expect(onChange).toHaveBeenCalledWith(5);
    });
  });

  describe('3. SegmentedControl', () => {
    it('renders radio group options and marks active selection', async () => {
      const options = [
        { id: '100k', label: '100K' },
        { id: '1M', label: '1M' },
        { id: '16M', label: '16M' },
      ];

      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options,
            value: '1M',
            onChange: vi.fn(),
          })
        );
      });

      const radios = container.querySelectorAll('[role="radio"]');
      expect(radios.length).toBe(3);
      expect(radios[1].getAttribute('aria-checked')).toBe('true');
      expect(radios[0].getAttribute('aria-checked')).toBe('false');
    });

    it('fires onChange when radio is clicked', async () => {
      const onChange = vi.fn();
      const options = [
        { id: 0, label: 'Linear' },
        { id: 1, label: 'Scroll' },
      ];

      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options,
            value: 0,
            onChange,
          })
        );
      });

      const radios = container.querySelectorAll('[role="radio"]');
      act(() => {
        (radios[1] as HTMLElement).click();
      });
      expect(onChange).toHaveBeenCalledWith(1);
    });
  });

  describe('4. TactileButton', () => {
    it('renders with tactile feedback classes and fires onClick', async () => {
      const onClick = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(
            TactileButton,
            {
              variant: 'primary',
              active: true,
              onClick,
            },
            'Globe'
          )
        );
      });

      const btn = container.querySelector('button') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.className).toContain('tactile-btn');
      expect(btn.textContent).toContain('Globe');

      act(() => {
        btn.click();
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
