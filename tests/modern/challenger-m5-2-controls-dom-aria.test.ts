// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m5-2-controls-dom-aria.test.ts
// Challenger 2: DOM, ARIA, Medium-Adaptive SVG Artifacts & Invariant Standards
// Milestone 5: Prognostic Model Consolidation Card & AtmosphereDrawer Integration (Requirement R5)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { PrognosticModelCard } from '../../src/components/hud/instruments/PrognosticModelCard';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 2: Milestone 5 DOM, ARIA & Medium Artifact Verification', () => {
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
    it('M5-DOM-01: confirms zero nested inner neatlines in component source files', () => {
      const cardPath = path.resolve(__dirname, '../../src/components/hud/instruments/PrognosticModelCard.tsx');
      const drawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');

      const cardCode = fs.readFileSync(cardPath, 'utf-8');
      const drawerCode = fs.readFileSync(drawerPath, 'utf-8');

      expect(cardCode).not.toContain('border-current/15');
      expect(cardCode).not.toContain('inset-[2px]');
      expect(drawerCode).not.toContain('border-current/15');
      expect(drawerCode).not.toContain('inset-[2px]');
    });

    it('M5-DOM-02: rendered PrognosticModelCard conforms strictly to single-border enclosure with theme tokens', async () => {
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { prognosticModel: 'weathernext3' }));
      });

      const nestedNeatlines = container.querySelectorAll('.border-current\\/15, .inset-\\[2px\\]');
      expect(nestedNeatlines.length).toBe(0);

      const card = container.querySelector('.p-2.rounded-\\[3px\\].border');
      expect(card).not.toBeNull();
      expect(card?.className).toContain('bg-[var(--theme-card-bg)]');
      expect(card?.className).toContain('border-[var(--theme-card-border)]');
      expect(card?.className).toContain('text-[var(--theme-text-primary)]');
    });
  });

  // ==========================================================================
  // 2. 3-Medium Adaptive SVG Artifacts Across Themes
  // ==========================================================================
  describe('2. 3-Medium Adaptive SVG Artifacts Across Themes', () => {
    it('M5-DOM-03: Theme 0 (Marie Tharp 1977) renders .prognostic-model-tharp and baroclinic flow artifacts', async () => {
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { theme: 0 }));
      });

      expect(container.querySelector('.prognostic-model-tharp')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).toBeNull();
      expect(container.querySelector('.prognostic-model-cyanotype')).toBeNull();

      expect(container.textContent).toContain('BAROCLINIC FLOW');
      expect(container.textContent).toContain('Rossby Wave');
      expect(container.textContent).toContain('OCEANIC HEAT FLUX');
      expect(container.textContent).toContain('Sea Surface Boundary Layer');
    });

    it('M5-DOM-04: Theme 1 (Cream Rag 310 GSM) renders .prognostic-model-cream and Victorian isobar engravings', async () => {
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { theme: 1 }));
      });

      expect(container.querySelector('.prognostic-model-cream')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).toBeNull();
      expect(container.querySelector('.prognostic-model-cyanotype')).toBeNull();

      expect(container.textContent).toContain('Charta Synoptica Barometrica');
      expect(container.textContent).toContain('996 hPa');
      expect(container.textContent).toContain('1024 hPa');

      // Check for intaglio teeth on cold front
      const intaglioTeeth = container.querySelectorAll('.prognostic-model-cream polygon');
      expect(intaglioTeeth.length).toBeGreaterThanOrEqual(3);
    });

    it('M5-DOM-05: Theme 2 (Prussian Cyanotype 1842) renders .prognostic-model-cyanotype and CAD Voronoi mesh', async () => {
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { theme: 2 }));
      });

      expect(container.querySelector('.prognostic-model-cyanotype')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).toBeNull();

      expect(container.textContent).toContain('CHUNK [0, 0]');
      expect(container.textContent).toContain('CHUNK [0, 1]');
      expect(container.textContent).toContain('CHUNK [0, 2]');
      expect(container.textContent).toContain('TENSOR: [B=1, T=24, C=6, H=1801, W=3600] FP16');
      expect(container.textContent).toContain('ROW PITCH: 7424 BYTES (256-BYTE ALIGNED)');
    });
  });

  // ==========================================================================
  // 3. Model & Variable DOM IDs and ARIA Semantics
  // ==========================================================================
  describe('3. Model & Variable DOM IDs and ARIA Semantics', () => {
    it('M5-DOM-06: verifies model backend DOM IDs and radiogroup attributes', async () => {
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { prognosticModel: 'gfs' }));
      });

      const ecmwfBtn = container.querySelector('#sidebar-model-ecmwf');
      const gfsBtn = container.querySelector('#sidebar-model-gfs');
      const wnBtn = container.querySelector('#sidebar-model-weathernext');
      const offBtn = container.querySelector('#sidebar-model-off');

      expect(ecmwfBtn).not.toBeNull();
      expect(gfsBtn).not.toBeNull();
      expect(wnBtn).not.toBeNull();
      expect(offBtn).not.toBeNull();

      expect(ecmwfBtn?.getAttribute('role')).toBe('radio');
      expect(gfsBtn?.getAttribute('role')).toBe('radio');
      expect(wnBtn?.getAttribute('role')).toBe('radio');
      expect(offBtn?.getAttribute('role')).toBe('radio');

      expect(gfsBtn?.getAttribute('aria-checked')).toBe('true');
      expect(gfsBtn?.getAttribute('tabindex')).toBe('0');
      expect(ecmwfBtn?.getAttribute('aria-checked')).toBe('false');
      expect(wnBtn?.getAttribute('aria-checked')).toBe('false');
      expect(offBtn?.getAttribute('aria-checked')).toBe('false');
    });

    it('M5-DOM-07: verifies conditional rendering of variable DOM IDs under WeatherNext AI', async () => {
      // 1. Inactive under GFS
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { prognosticModel: 'gfs' }));
      });
      expect(container.querySelector('#sidebar-variable-rain')).toBeNull();
      expect(container.querySelector('#sidebar-variable-temp')).toBeNull();
      expect(container.querySelector('#sidebar-variable-wind')).toBeNull();
      expect(container.querySelector('#sidebar-variable-z500')).toBeNull();

      // 2. Active under WeatherNext AI
      await act(async () => {
        root.render(React.createElement(PrognosticModelCard, { prognosticModel: 'weathernext3' }));
      });

      const rainBtn = container.querySelector('#sidebar-variable-rain');
      const tempBtn = container.querySelector('#sidebar-variable-temp');
      const windBtn = container.querySelector('#sidebar-variable-wind');
      const z500Btn = container.querySelector('#sidebar-variable-z500');

      expect(rainBtn).not.toBeNull();
      expect(tempBtn).not.toBeNull();
      expect(windBtn).not.toBeNull();
      expect(z500Btn).not.toBeNull();

      expect(rainBtn?.getAttribute('role')).toBe('radio');
      expect(tempBtn?.getAttribute('role')).toBe('radio');
      expect(windBtn?.getAttribute('role')).toBe('radio');
      expect(z500Btn?.getAttribute('role')).toBe('radio');

      // Default variable is total_precipitation_1hr_mean (rain)
      expect(rainBtn?.getAttribute('aria-checked')).toBe('true');
      expect(tempBtn?.getAttribute('aria-checked')).toBe('false');
      expect(windBtn?.getAttribute('aria-checked')).toBe('false');
      expect(z500Btn?.getAttribute('aria-checked')).toBe('false');
    });

    it('M5-DOM-08: selecting #sidebar-variable-wind triggers planetary layer toggle for noaa-gfs-wind', async () => {
      const onToggleLayer = vi.fn();
      const onVariableChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            onTogglePlanetaryLayer: onToggleLayer,
            onPrognosticVariableChange: onVariableChange,
          })
        );
      });

      const windBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-wind');
      expect(windBtn).not.toBeNull();

      await act(async () => {
        windBtn?.click();
      });

      expect(onVariableChange).toHaveBeenCalledWith('wind_10m_vector');
      expect(onToggleLayer).toHaveBeenCalledWith('noaa-gfs-wind', true);
    });
  });

  // ==========================================================================
  // 4. Data Provenance & Zarr v3 Telemetry
  // ==========================================================================
  describe('4. Data Provenance & Zarr v3 Telemetry', () => {
    it('M5-DOM-09: verifies telemetry provenance text matching /● GCS Zarr v3/ and 3-Slot Ring Buffer', async () => {
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            leadTimeHours: 48,
          })
        );
      });

      expect(container.textContent).toMatch(/● GCS Zarr v3/);
      expect(container.textContent).toContain('3-Slot Ring Buffer');
      expect(container.textContent).toContain('+48h Forecast');
      expect(container.textContent).toContain('Resolution:');
      expect(container.textContent).toContain('0.1° (~10 km)');
      expect(container.textContent).toContain('Chunk Spec:');
      expect(container.textContent).toContain('256×256 FP16');
      expect(container.textContent).toContain('Cycle:');
      expect(container.textContent).toContain('00Z Hybrid');
      expect(container.textContent).toContain('Ensemble Spread:');
      expect(container.textContent).toContain('±0.42 m/s');
    });

    it('M5-DOM-10: displays 0h Analysis when leadTimeHours is 0', async () => {
      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            prognosticModel: 'weathernext3',
            leadTimeHours: 0,
          })
        );
      });

      expect(container.textContent).toContain('0h Analysis');
    });
  });

  // ==========================================================================
  // 5. AtmosphereDrawer Radiogroup Budget (Exact 5 Groups)
  // ==========================================================================
  describe('5. AtmosphereDrawer Exact 5-Radiogroup Budget', () => {
    it('M5-DOM-11: verifies exactly 5 radiogroups in AtmosphereDrawer when showClouds is true and model is weathernext3', async () => {
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

      radiogroups.forEach((group) => {
        const radios = group.querySelectorAll('[role="radio"]');
        expect(radios.length).toBeGreaterThanOrEqual(2);

        // Invariant: Exactly one option must have aria-checked="true"
        const checkedRadios = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'true');
        expect(checkedRadios.length).toBe(1);

        const uncheckedRadios = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'false');
        expect(uncheckedRadios.length).toBe(radios.length - 1);
      });
    });

    it('M5-DOM-12: verifies exactly 4 radiogroups in AtmosphereDrawer when prognosticModel is gfs', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
          })
        );
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(4);
    });
  });

  // ==========================================================================
  // 6. Interactive Viewport & Keyboard Stepping
  // ==========================================================================
  describe('6. Interactive Viewport & Keyboard Accessibility', () => {
    it('M5-DOM-13: slider viewport has valid ARIA slider attributes and responds to keyboard steps', async () => {
      const onLeadTimeChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            onLeadTimeChange,
          })
        );
      });

      const slider = container.querySelector('[role="slider"]');
      expect(slider).not.toBeNull();
      expect(slider?.getAttribute('aria-valuemin')).toBe('0');
      expect(slider?.getAttribute('aria-valuemax')).toBe('240');
      expect(slider?.getAttribute('aria-valuenow')).toBe('24');
      expect(slider?.getAttribute('tabindex')).toBe('0');

      // ArrowRight increases by 6h
      await act(async () => {
        slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(30);

      // ArrowRight + Shift increases by 24h
      await act(async () => {
        slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(54);

      // ArrowLeft decreases by 6h
      await act(async () => {
        slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(48);

      // Home jumps to 0h
      await act(async () => {
        slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(0);

      // End jumps to 240h
      await act(async () => {
        slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(240);

      // Space or Enter resets to 24h
      await act(async () => {
        slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(24);
    });

    it('M5-DOM-14: double-click and reset button restore lead time to 24h default', async () => {
      const onLeadTimeChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(PrognosticModelCard, {
            leadTimeHours: 120,
            onLeadTimeChange,
          })
        );
      });

      const slider = container.querySelector('[role="slider"]');
      await act(async () => {
        slider?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(24);

      const resetBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('[RESET]'));
      expect(resetBtn).toBeDefined();
      await act(async () => {
        resetBtn?.click();
      });
      expect(onLeadTimeChange).toHaveBeenCalledWith(24);
    });
  });

  // ==========================================================================
  // 7. Adversarial Fuzzing & Rapid Interaction
  // ==========================================================================
  describe('7. Adversarial Fuzzing & Rapid State Switching', () => {
    it('M5-DOM-15: 100 randomized model and variable selections maintain ARIA invariants', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const radios = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      expect(radios.length).toBeGreaterThanOrEqual(14);

      for (let trial = 0; trial < 100; trial++) {
        const randomRadio = radios[Math.floor(Math.random() * radios.length)];
        await act(async () => {
          randomRadio.click();
        });
      }

      // Re-verify that every active radiogroup has exactly one radio with aria-checked="true"
      const activeGroups = container.querySelectorAll('[role="radiogroup"]');
      activeGroups.forEach((group) => {
        const groupRadios = group.querySelectorAll('[role="radio"]');
        const checked = Array.from(groupRadios).filter((r) => r.getAttribute('aria-checked') === 'true');
        expect(checked.length).toBe(1);
      });
    });
  });
});
