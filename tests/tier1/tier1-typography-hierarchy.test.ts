// @vitest-environment happy-dom
// ============================================================================
// File: tests/tier1/tier1-typography-hierarchy.test.ts
// Tier 1 Validation: 4-Tier Typographic Scale & Archival Thematic Personality
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import tailwindConfig from '../../tailwind.config.js';
import {
  ThemeManager,
  DARK_CYBER_UI_TOKENS,
  LIGHT_MONOCHROME_UI_TOKENS,
  PRUSSIAN_CYANOTYPE_UI_TOKENS,
} from '../../src/core/themes';
import {
  TactileSwitch,
  VernierSlider,
  SegmentedControl,
  TactileButton,
} from '../../src/components/ui';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Bite 3: Typographic Hierarchy & Scale Enforcement', () => {
  let themeMgr: ThemeManager;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    themeMgr = ThemeManager.getInstance(0);
    themeMgr.setMode(0);

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

  describe('Tailwind Typographic Configuration', () => {
    it('defines semantic 4-tier font sizes (title, body, micro, nano)', () => {
      const fontSize = tailwindConfig.theme?.extend?.fontSize as Record<
        string,
        [string, { lineHeight: string; letterSpacing: string }]
      >;
      expect(fontSize).toBeDefined();

      expect(fontSize.nano[0]).toBe('8px');
      expect(fontSize.nano[1].lineHeight).toBe('10px');

      expect(fontSize.micro[0]).toBe('9px');
      expect(fontSize.micro[1].lineHeight).toBe('12px');

      expect(fontSize.body[0]).toBe('10px');
      expect(fontSize.body[1].lineHeight).toBe('13px');

      expect(fontSize.title[0]).toBe('11px');
      expect(fontSize.title[1].lineHeight).toBe('14px');
    });

    it('defines semantic font families for cartouche, monospace drafting, and body sans', () => {
      const fontFamily = tailwindConfig.theme?.extend?.fontFamily as Record<string, string[]>;
      expect(fontFamily).toBeDefined();

      expect(fontFamily.sans[0]).toBe('Inter');
      expect(fontFamily.mono[0]).toBe('"IBM Plex Mono"');
      expect(fontFamily.cartouche[0]).toBe('Cinzel');
      expect(fontFamily['serif-body'][0]).toBe('"Cormorant Garamond"');
      expect(fontFamily['serif-book'][0]).toBe('Newsreader');
    });
  });

  describe('Theme Personality & Typographic Tokens', () => {
    it('provides theme-specific typography parameters for all three themes', () => {
      const themes = [
        { name: 'Dark Cyber', tokens: DARK_CYBER_UI_TOKENS, expectedTracking: '0.12em' },
        { name: 'Cream Rag', tokens: LIGHT_MONOCHROME_UI_TOKENS, expectedTracking: '0.10em' },
        { name: 'Prussian Cyanotype', tokens: PRUSSIAN_CYANOTYPE_UI_TOKENS, expectedTracking: '0.16em' },
      ];

      for (const { name, tokens, expectedTracking } of themes) {
        expect(tokens.fontCartouche, `${name} must define fontCartouche`).toBeTruthy();
        expect(tokens.fontTelemetry, `${name} must define fontTelemetry`).toContain('IBM Plex Mono');
        expect(tokens.fontBody, `${name} must define fontBody`).toContain('Inter');
        expect(tokens.cartoucheTracking, `${name} must define cartoucheTracking`).toBe(expectedTracking);
        expect(tokens.cartoucheTransform, `${name} must define cartoucheTransform`).toBe('uppercase');
      }
    });

    it('injects typography CSS variables via applyCSSVariables', () => {
      const mockStyle: Record<string, string> = {};
      const mockElement = {
        attributes: {} as Record<string, string>,
        setAttribute: (k: string, v: string) => {
          mockElement.attributes[k] = v;
        },
        style: {
          setProperty: (prop: string, val: string) => {
            mockStyle[prop] = val;
          },
        },
      } as unknown as HTMLElement;

      // Test Theme 2: Prussian Cyanotype (architectural drafting tracking)
      themeMgr.setMode(2);
      themeMgr.applyCSSVariables(mockElement);

      expect((mockElement as any).attributes['data-theme']).toBe('cyanotype');
      expect(mockStyle['--theme-font-cartouche']).toContain('Cinzel');
      expect(mockStyle['--theme-font-telemetry']).toContain('IBM Plex Mono');
      expect(mockStyle['--theme-tracking-cartouche']).toBe('0.16em');
      expect(mockStyle['--theme-transform-cartouche']).toBe('uppercase');
    });
  });

  describe('Micro-Controls Typographic Scale Binding', () => {
    it('TactileSwitch binds semantic text-body for label and text-nano for sublabel', async () => {
      await act(async () => {
        root.render(
          React.createElement(TactileSwitch, {
            checked: false,
            label: 'Tissot Indicatrix',
            sublabel: 'Deformation Ellipses',
          })
        );
      });

      const labelEl = container.querySelector('.text-body');
      expect(labelEl).not.toBeNull();
      expect(labelEl?.textContent).toBe('Tissot Indicatrix');

      const sublabelEl = container.querySelector('.text-nano');
      expect(sublabelEl).not.toBeNull();
      expect(sublabelEl?.textContent).toBe('Deformation Ellipses');
    });

    it('VernierSlider binds semantic text-body, text-micro, and text-nano', async () => {
      await act(async () => {
        root.render(
          React.createElement(VernierSlider, {
            id: 'test-slider',
            label: 'Shear Modulus',
            sublabel: 'LEFM G_c',
            value: 1.5,
            min: 0,
            max: 5,
            step: 0.1,
          })
        );
      });

      // Label uses text-body
      const labelEl = container.querySelector('label.text-body');
      expect(labelEl).not.toBeNull();

      // Sublabel uses text-nano
      const sublabelEl = container.querySelector('span.text-nano');
      expect(sublabelEl).not.toBeNull();

      // Readout uses text-body with monospace
      const readoutEl = container.querySelector('span.text-body.font-mono');
      expect(readoutEl).not.toBeNull();
      expect(readoutEl?.textContent).toBe('1.5');
    });

    it('SegmentedControl respects size="sm" (text-nano) and size="md" (text-micro)', async () => {
      const options = [
        { id: 'webgpu', label: 'WebGPU', sublabel: 'WGSL' },
        { id: 'webgl2', label: 'WebGL2', sublabel: 'GLSL' },
      ];

      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options,
            value: 'webgpu',
            onChange: () => {},
            size: 'sm',
          })
        );
      });
      expect(container.querySelector('button.text-nano')).not.toBeNull();

      await act(async () => {
        root.render(
          React.createElement(SegmentedControl, {
            options,
            value: 'webgpu',
            onChange: () => {},
            size: 'md',
          })
        );
      });
      expect(container.querySelector('button.text-micro')).not.toBeNull();
    });

    it('TactileButton renders with semantic scale matching size prop', async () => {
      await act(async () => {
        root.render(
          React.createElement(TactileButton, { size: 'sm' }, 'Small Action')
        );
      });
      expect(container.querySelector('button.text-micro')).not.toBeNull();

      await act(async () => {
        root.render(
          React.createElement(TactileButton, { size: 'md' }, 'Medium Action')
        );
      });
      expect(container.querySelector('button.text-body')).not.toBeNull();

      await act(async () => {
        root.render(
          React.createElement(TactileButton, { size: 'lg' }, 'Large Action')
        );
      });
      expect(container.querySelector('button.text-title')).not.toBeNull();
    });
  });
});
