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
    });
  });

  // ==========================================================================
  // 3. ARIA Semantics (radiogroup, radio, slider viewport)
  // ==========================================================================
  describe('3. ARIA Roles & Semantics Verification', () => {
    it('CHALLENGE-ARIA-01: thermodynamic gating hidden buttons preserve DOM IDs and dispatch changes', async () => {
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

      expect(gatingOn).not.toBeNull();
      expect(gatingOff).not.toBeNull();

      // Click OFF
      await act(async () => {
        (gatingOff as HTMLButtonElement)?.click();
      });
      expect(onGatingChange).toHaveBeenCalledWith(false);

      // Click ON
      await act(async () => {
        (gatingOn as HTMLButtonElement)?.click();
      });
      expect(onGatingChange).toHaveBeenCalledWith(true);
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
  // 5. Range Input Interactions
  // ==========================================================================
  describe('5. Range Inputs Interactions', () => {

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

  // ==========================================================================
  // 6. Layout, Typography & Visual Collision Regression Guards
  // ==========================================================================
  describe('6. Layout, Typography & Visual Collision Regression Guards', () => {
    it('CHALLENGE-REGRESS-01: confirms caliper value callout badges maintain positive clearance moats (zero collision)', async () => {
      const orographicFilePath = path.resolve(__dirname, '../../src/components/hud/instruments/OrographicMoistureProfile.tsx');
      const orographicCode = fs.readFileSync(orographicFilePath, 'utf-8');

      // 1. Windward badge must have at least 2.5px clearance above circle thumb (y <= cloudThumbY - 20)
      expect(orographicCode).toMatch(/y=\{cloudThumbY\s*-\s*2[1-9]\}/);
      expect(orographicCode).not.toContain('y={cloudThumbY - 18}');

      // 2. Pluvial badge must have at least 3.5px clearance to right of circle thumb (x >= pluvialThumbX + 10)
      expect(orographicCode).toMatch(/x=\{pluvialThumbX\s*\+\s*1[0-9]\}/);
      expect(orographicCode).not.toContain('x={pluvialThumbX + 8}');

      // 3. Vertical guide line stops before caliper circle (y2 <= pluvialThumbY - 6.5) to prevent moire overlap
      expect(orographicCode).toContain('y2={pluvialThumbY - 6.5}');

      // 4. Redundant baseline line cutting through mountain bedrock is eliminated
      expect(orographicCode).not.toContain('<line\n            x1="16"\n            y1="118"\n            x2="270"\n            y2="118"');
    });

    it('CHALLENGE-REGRESS-02: confirms spelled-out labels, tokenized font stack, and balanced header layout', async () => {
      await act(async () => {
        root.render(
          React.createElement(OrographicMoistureProfile, {
            rainShadowFeedback: 0.5,
            pluvialGamma: 0.0,
            thermodynamicGating: true,
            theme: 1,
          })
        );
      });

      // 1. Spelled-out footer title (no raw developer parameter bounds)
      const footerText = container.querySelector('.border-t')?.textContent;
      expect(footerText).toContain('OROGRAPHIC COUPLING & PLUVIAL RUNOFF');
      expect(footerText).not.toContain('(0.0–1.0 / 0.0–2.0×)');

      // 2. Header has balanced flex justify-between layout without orphaned pipe separator
      const header = container.querySelector('.text-micro');
      expect(header?.className).toContain('justify-between');
      expect(header?.textContent).toContain('OROGRAPHIC MOISTURE');
      expect(header?.textContent).toContain('Adiabatic Condensation Profile');
      expect(header?.textContent).toContain('50%');
      expect(header?.textContent).toContain('0.0×');
      expect(header?.textContent).toContain('LCL');
      expect(header?.querySelector('.ml-auto')?.textContent).not.toBe('|');

      // 3. SVG text elements use tokenized monospace font stack
      const svgTexts = Array.from(container.querySelectorAll('svg text'));
      for (const t of svgTexts) {
        expect(t.getAttribute('font-family')).toBe('var(--font-mono, monospace)');
      }
    });
  });
});
