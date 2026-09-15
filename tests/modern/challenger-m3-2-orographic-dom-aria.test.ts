// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m3-2-orographic-dom-aria.test.ts
// Challenger 2: DOM, ARIA & Build Verification Suite
// Milestone 3 (Orographic Moisture Profile Instrument - R3)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { OrographicMoistureProfile, OrographicMoistureProfileProps } from '../../src/components/hud/instruments/OrographicMoistureProfile';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 2: Orographic Moisture Profile DOM, ARIA & Build Verification', () => {
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
  // 1. Single-Border HUD Enclosure Contract
  // ==========================================================================
  describe('1. Single-Border HUD Enclosure Contract', () => {
    it('CHALLENGE-HUD-01: confirms zero nested inner neatlines in OrographicMoistureProfile source and rendered DOM', async () => {
      const orographicFilePath = path.resolve(__dirname, '../../src/components/hud/instruments/OrographicMoistureProfile.tsx');
      const drawerFilePath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');

      const orographicCode = fs.readFileSync(orographicFilePath, 'utf-8');
      const drawerCode = fs.readFileSync(drawerFilePath, 'utf-8');

      // Static code analysis: prohibited inner neatline tokens
      expect(orographicCode).not.toContain('border-current/15');
      expect(orographicCode).not.toContain('inset-[2px]');
      expect(drawerCode).not.toContain('border-current/15');
      expect(drawerCode).not.toContain('inset-[2px]');

      // Rendered DOM test
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.35,
            pluvialGamma: 1.2,
            thermodynamicGating: true,
            theme: 0,
          })
        );
      });

      const nestedNeatlines = container.querySelectorAll('.border-current\\/15, .inset-\\[2px\\]');
      expect(nestedNeatlines.length).toBe(0);

      // Verify card styling conforms to single-border standard
      const cardEnclosure = container.firstElementChild as HTMLElement;
      expect(cardEnclosure.className).toContain('border');
      expect(cardEnclosure.className).toContain('bg-[var(--theme-card-bg)]');
      expect(cardEnclosure.className).toContain('border-[var(--theme-card-border)]');
    });
  });

  // ==========================================================================
  // 2. Required DOM IDs & Queryability
  // ==========================================================================
  describe('2. Required DOM IDs & Queryability', () => {
    it('CHALLENGE-DOM-01: confirms all required DOM IDs exist and are queryable in OrographicMoistureProfile', async () => {
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.45,
            pluvialGamma: 1.5,
            thermodynamicGating: true,
            theme: 0,
          })
        );
      });

      // 1. Thermodynamic gating option IDs
      const gatingOn = container.querySelector('#sidebar-thermodynamic-gating-on');
      const gatingOff = container.querySelector('#sidebar-thermodynamic-gating-off');
      expect(gatingOn).not.toBeNull();
      expect(gatingOff).not.toBeNull();

      // 2. Sliders
      const rainShadowSlider = container.querySelector<HTMLInputElement>('#sidebar-rain-shadow');
      const pluvialSlider = container.querySelector<HTMLInputElement>('#sidebar-pluvial-coupling');
      expect(rainShadowSlider).not.toBeNull();
      expect(pluvialSlider).not.toBeNull();
      expect(rainShadowSlider?.type).toBe('range');
      expect(pluvialSlider?.type).toBe('range');
      expect(rainShadowSlider?.value).toBe('0.45');
      expect(pluvialSlider?.value).toBe('1.5');

      // 3. Stepper buttons
      const incOrographic = container.querySelector('button[title*="Increase Orographic"]');
      const decOrographic = container.querySelector('button[title*="Decrease Orographic"]');
      const incPluvial = container.querySelector('button[title*="Increase Pluvial"]');
      const decPluvial = container.querySelector('button[title*="Decrease Pluvial"]');

      expect(incOrographic).not.toBeNull();
      expect(decOrographic).not.toBeNull();
      expect(incPluvial).not.toBeNull();
      expect(decPluvial).not.toBeNull();
    });

    it('CHALLENGE-DOM-02: confirms all required DOM IDs exist when mounted inside AtmosphereDrawer', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            rainShadowFeedback: 0.25,
            pluvialGamma: 0.8,
            thermodynamicGating: false,
          })
        );
      });

      expect(container.querySelector('#sidebar-thermodynamic-gating-on')).not.toBeNull();
      expect(container.querySelector('#sidebar-thermodynamic-gating-off')).not.toBeNull();
      expect(container.querySelector('#sidebar-rain-shadow')).not.toBeNull();
      expect(container.querySelector('#sidebar-pluvial-coupling')).not.toBeNull();
      expect(container.querySelector('button[title*="Increase Orographic"]')).not.toBeNull();
      expect(container.querySelector('button[title*="Decrease Orographic"]')).not.toBeNull();
      expect(container.querySelector('button[title*="Increase Pluvial"]')).not.toBeNull();
      expect(container.querySelector('button[title*="Decrease Pluvial"]')).not.toBeNull();
    });
  });

  // ==========================================================================
  // 3. ARIA Semantics (radiogroup, radio, slider viewport)
  // ==========================================================================
  describe('3. ARIA Roles & Semantics Verification', () => {
    it('CHALLENGE-ARIA-01: thermodynamic gating renders role="radiogroup" with options having role="radio" and aria-checked', async () => {
      const onGatingChange = vi.fn();

      const renderWithGating = async (gating: boolean) => {
        await act(async () => {
          root.render(
            React.createElement(OrographicMoistureProfile, {
              thermodynamicGating: gating,
              onThermodynamicGatingChange: onGatingChange,
            })
          );
        });
      };

      // Test with thermodynamicGating = true
      await renderWithGating(true);
      const gatingOn = container.querySelector('#sidebar-thermodynamic-gating-on');
      const gatingOff = container.querySelector('#sidebar-thermodynamic-gating-off');
      const radiogroup = gatingOn?.closest('[role="radiogroup"]');

      expect(radiogroup).not.toBeNull();
      expect(gatingOn?.getAttribute('role')).toBe('radio');
      expect(gatingOff?.getAttribute('role')).toBe('radio');
      expect(gatingOn?.getAttribute('aria-checked')).toBe('true');
      expect(gatingOff?.getAttribute('aria-checked')).toBe('false');
      expect(gatingOn?.getAttribute('tabindex')).toBe('0');
      expect(gatingOff?.getAttribute('tabindex')).toBe('-1');

      // Click OFF
      await act(async () => {
        (gatingOff as HTMLButtonElement)?.click();
      });
      expect(onGatingChange).toHaveBeenCalledWith(false);

      // Re-render with thermodynamicGating = false
      await renderWithGating(false);
      expect(gatingOn?.getAttribute('aria-checked')).toBe('false');
      expect(gatingOff?.getAttribute('aria-checked')).toBe('true');
      expect(gatingOn?.getAttribute('tabindex')).toBe('-1');
      expect(gatingOff?.getAttribute('tabindex')).toBe('0');
    });

    it('CHALLENGE-ARIA-02: interactive SVG viewport has role="slider" with full ARIA value attributes and keyboard control', async () => {
      const onRainChange = vi.fn();
      const onPluvialChange = vi.fn();
      const onGatingChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.40,
            pluvialGamma: 1.0,
            thermodynamicGating: true,
            onRainShadowChange: onRainChange,
            onPluvialGammaChange: onPluvialChange,
            onThermodynamicGatingChange: onGatingChange,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]');
      expect(viewport).not.toBeNull();
      expect(viewport?.getAttribute('tabindex')).toBe('0');
      expect(viewport?.getAttribute('aria-valuemin')).toBe('0');
      expect(viewport?.getAttribute('aria-valuemax')).toBe('1');
      expect(viewport?.getAttribute('aria-valuenow')).toBe('0.4');
      expect(viewport?.getAttribute('aria-label')).toBe('Orographic Moisture Profile and Condensation Caliper');

      // ArrowRight increases rainShadow
      await act(async () => {
        viewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onRainChange).toHaveBeenCalledWith(0.45);

      // Shift+ArrowRight increases rainShadow by coarse step 0.10
      await act(async () => {
        viewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      });
      expect(onRainChange).toHaveBeenCalledWith(0.50);

      // ArrowLeft decreases rainShadow
      await act(async () => {
        viewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(onRainChange).toHaveBeenCalledWith(0.35);

      // ArrowUp increases pluvialGamma
      await act(async () => {
        viewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onPluvialChange).toHaveBeenCalledWith(1.1);

      // ArrowDown decreases pluvialGamma
      await act(async () => {
        viewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(onPluvialChange).toHaveBeenCalledWith(0.9);

      // 't' key toggles thermodynamic gating
      await act(async () => {
        viewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      });
      expect(onGatingChange).toHaveBeenCalledWith(false);

      // Space key toggles thermodynamic gating
      await act(async () => {
        viewport?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(onGatingChange).toHaveBeenCalledWith(false);

      // Double-click resets all values
      await act(async () => {
        viewport?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onRainChange).toHaveBeenCalledWith(0.0);
      expect(onPluvialChange).toHaveBeenCalledWith(0.0);
      expect(onGatingChange).toHaveBeenCalledWith(true);
    });
  });

  // ==========================================================================
  // 4. 3-Medium Adaptive SVG Class Artifacts
  // ==========================================================================
  describe('4. Medium-Adaptive SVG Artifacts for all 3 Themes', () => {
    it('CHALLENGE-THEME-01: renders distinct SVG artifacts across Marie Tharp (0), Cream Rag (1), and Prussian Cyanotype (2)', async () => {
      // Theme 0: Marie Tharp
      await act(async () => {
        root.render(React.createElement(OrographicMoistureProfile, { theme: 0 }));
      });
      expect(container.querySelector('.orographic-sounding-tharp')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-tharp')).not.toBeNull();
      expect(container.querySelector('.orographic-engraving-cream')).toBeNull();
      expect(container.querySelector('.orographic-vector-cyanotype')).toBeNull();

      // Theme 1: Cream Rag Paper
      await act(async () => {
        root.render(React.createElement(OrographicMoistureProfile, { theme: 1 }));
      });
      expect(container.querySelector('.orographic-engraving-cream')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-cream')).not.toBeNull();
      expect(container.querySelector('.orographic-sounding-tharp')).toBeNull();
      expect(container.querySelector('.orographic-vector-cyanotype')).toBeNull();

      // Theme 2: Prussian Cyanotype
      await act(async () => {
        root.render(React.createElement(OrographicMoistureProfile, { theme: 2 }));
      });
      expect(container.querySelector('.orographic-vector-cyanotype')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-cyanotype')).not.toBeNull();
      expect(container.querySelector('.orographic-sounding-tharp')).toBeNull();
      expect(container.querySelector('.orographic-engraving-cream')).toBeNull();
    });
  });

  // ==========================================================================
  // 5. Steppers and Range Input Interactions
  // ==========================================================================
  describe('5. Stepper Buttons and Range Inputs Interactions', () => {
    it('CHALLENGE-STEPPERS-01: clicking steppers correctly updates coupling and pluvial gamma', async () => {
      const onRainChange = vi.fn();
      const onPluvialChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.50,
            pluvialGamma: 1.0,
            onRainShadowChange: onRainChange,
            onPluvialGammaChange: onPluvialChange,
          })
        );
      });

      const incOrographic = container.querySelector<HTMLButtonElement>('button[title*="Increase Orographic"]');
      const decOrographic = container.querySelector<HTMLButtonElement>('button[title*="Decrease Orographic"]');
      const incPluvial = container.querySelector<HTMLButtonElement>('button[title*="Increase Pluvial"]');
      const decPluvial = container.querySelector<HTMLButtonElement>('button[title*="Decrease Pluvial"]');

      // Increase Orographic Coupling: 0.50 -> 0.55
      await act(async () => {
        incOrographic?.click();
      });
      expect(onRainChange).toHaveBeenCalledWith(0.55);

      // Decrease Orographic Coupling: 0.50 -> 0.45
      await act(async () => {
        decOrographic?.click();
      });
      expect(onRainChange).toHaveBeenCalledWith(0.45);

      // Increase Pluvial Coupling: 1.0 -> 1.1
      await act(async () => {
        incPluvial?.click();
      });
      expect(onPluvialChange).toHaveBeenCalledWith(1.1);

      // Decrease Pluvial Coupling: 1.0 -> 0.9
      await act(async () => {
        decPluvial?.click();
      });
      expect(onPluvialChange).toHaveBeenCalledWith(0.9);
    });

    it('CHALLENGE-SLIDERS-01: changing native range sliders dispatches parsed float values', async () => {
      const onRainChange = vi.fn();
      const onPluvialChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.20,
            pluvialGamma: 0.5,
            onRainShadowChange: onRainChange,
            onPluvialGammaChange: onPluvialChange,
          })
        );
      });

      const rainInput = container.querySelector<HTMLInputElement>('#sidebar-rain-shadow');
      const pluvialInput = container.querySelector<HTMLInputElement>('#sidebar-pluvial-coupling');

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      await act(async () => {
        if (rainInput) {
          nativeSetter?.call(rainInput, '0.75');
          rainInput.dispatchEvent(new Event('input', { bubbles: true }));
          rainInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      expect(onRainChange).toHaveBeenCalledWith(0.75);

      await act(async () => {
        if (pluvialInput) {
          nativeSetter?.call(pluvialInput, '1.8');
          pluvialInput.dispatchEvent(new Event('input', { bubbles: true }));
          pluvialInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      expect(onPluvialChange).toHaveBeenCalledWith(1.8);
    });
  });
});
