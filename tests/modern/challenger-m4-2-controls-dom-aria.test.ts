// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m4-2-controls-dom-aria.test.ts
// Challenger 2: DOM, ARIA, Medium-Adaptive SVG Artifacts & Invariant Standards
// Milestone 4: Shadow Intensity and Cloud Drift Speed Controls (Requirement R4)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { CloudShadowInstrument } from '../../src/components/hud/instruments/CloudShadowInstrument';
import { CloudDriftSpeedInstrument } from '../../src/components/hud/instruments/CloudDriftSpeedInstrument';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 2: Milestone 4 DOM, ARIA & Medium Artifact Verification', () => {
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
    it('M4-DOM-01: confirms zero nested inner neatlines in component source files', () => {
      const shadowPath = path.resolve(__dirname, '../../src/components/hud/instruments/CloudShadowInstrument.tsx');
      const driftPath = path.resolve(__dirname, '../../src/components/hud/instruments/CloudDriftSpeedInstrument.tsx');
      const drawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');

      const shadowCode = fs.readFileSync(shadowPath, 'utf-8');
      const driftCode = fs.readFileSync(driftPath, 'utf-8');
      const drawerCode = fs.readFileSync(drawerPath, 'utf-8');

      expect(shadowCode).not.toContain('border-current/15');
      expect(shadowCode).not.toContain('inset-[2px]');
      expect(driftCode).not.toContain('border-current/15');
      expect(driftCode).not.toContain('inset-[2px]');
      expect(drawerCode).not.toContain('border-current/15');
      expect(drawerCode).not.toContain('inset-[2px]');
    });

    it('M4-DOM-02: rendered DOM cards conform strictly to single-border enclosure with theme tokens', async () => {
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow' }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift' }),
          ])
        );
      });

      const nestedNeatlines = container.querySelectorAll('.border-current\\/15, .inset-\\[2px\\]');
      expect(nestedNeatlines.length).toBe(0);

      const cards = container.querySelectorAll('.rounded-\\[3px\\].border');
      expect(cards.length).toBe(2);
      cards.forEach((card) => {
        expect(card.className).toContain('bg-[var(--theme-card-bg)]');
        expect(card.className).toContain('border-[var(--theme-card-border)]');
      });
    });
  });

  // ==========================================================================
  // 2. 3-Medium Adaptive SVG Artifacts Across Themes
  // ==========================================================================
  describe('2. 3-Medium Adaptive SVG Artifacts', () => {
    it('M4-DOM-03: CloudShadowInstrument renders distinct SVG artifacts across all 3 themes', async () => {
      // Theme 0 (Marie Tharp)
      await act(async () => {
        root.render(React.createElement(CloudShadowInstrument, { theme: 0 }));
      });
      expect(container.querySelector('.shadow-projection-tharp')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).toBeNull();
      expect(container.querySelector('linearGradient#tharp-extinction-grad')).not.toBeNull();
      expect(container.textContent).toContain('OPTICAL EXTINCTION');
      expect(container.textContent).toContain('ABYSSAL FLOOR');

      // Theme 1 (Cream Rag)
      await act(async () => {
        root.render(React.createElement(CloudShadowInstrument, { theme: 1 }));
      });
      expect(container.querySelector('.shadow-projection-cream')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-tharp')).toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).toBeNull();
      expect(container.querySelector('pattern#cream-shadow-hatch')).not.toBeNull();
      expect(container.textContent).toContain('Sol Incidence: 45° Intaglio Penumbra');
      expect(container.textContent).toContain('TERRA FIRMA');

      // Theme 2 (Prussian Cyanotype)
      await act(async () => {
        root.render(React.createElement(CloudShadowInstrument, { theme: 2 }));
      });
      expect(container.querySelector('.shadow-projection-cyanotype')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).toBeNull();
      expect(container.querySelector('.shadow-projection-tharp')).toBeNull();
      expect(container.textContent).toContain('∠45° [315° NW]');
      expect(container.textContent).toContain('RAY-TRACE: λ_sol = 315° / θ_alt = 45°');
      expect(container.textContent).toContain('DATUM 0.0m');
    });

    it('M4-DOM-04: CloudDriftSpeedInstrument renders distinct SVG artifacts across all 3 themes', async () => {
      // Theme 0 (Marie Tharp)
      await act(async () => {
        root.render(React.createElement(CloudDriftSpeedInstrument, { theme: 0 }));
      });
      expect(container.querySelector('.drift-chronometer-tharp')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).toBeNull();
      expect(container.textContent).toContain('ADCP DOPPLER');
      expect(container.textContent).toContain('Δf = 2f₀·(v/c)·cos θ');

      // Theme 1 (Cream Rag)
      await act(async () => {
        root.render(React.createElement(CloudDriftSpeedInstrument, { theme: 1 }));
      });
      expect(container.querySelector('.drift-chronometer-cream')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).toBeNull();
      expect(container.textContent).toContain('ROBINSON 1846');
      expect(container.textContent).toContain('BF.0 CALM');
      expect(container.textContent).toContain('BF.12 STORM');

      // Theme 2 (Prussian Cyanotype)
      await act(async () => {
        root.render(React.createElement(CloudDriftSpeedInstrument, { theme: 2 }));
      });
      expect(container.querySelector('.drift-chronometer-cyanotype')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).toBeNull();
      expect(container.textContent).toContain('ISOTACH KINEMATICS');
      expect(container.textContent).toContain('0 kt (0 m/s)');
      expect(container.textContent).toContain('100 kt (51 m/s)');
    });
  });

  // ==========================================================================
  // 3. ARIA & Accessibility Compliance
  // ==========================================================================
  describe('3. ARIA & Accessibility Compliance', () => {
    it('M4-DOM-05: CloudShadowInstrument adheres to ARIA slider specification', async () => {
      await act(async () => {
        root.render(
          React.createElement(CloudShadowInstrument, {
            shadowIntensity: 0.35,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      expect(viewport.tabIndex).toBe(0);
      expect(viewport.getAttribute('aria-label')).toBe('Cloud Ground Shadow Intensity Caliper');
      expect(viewport.getAttribute('aria-valuemin')).toBe('0');
      expect(viewport.getAttribute('aria-valuemax')).toBe('0.6');
      expect(viewport.getAttribute('aria-valuenow')).toBe('0.35');
      expect(viewport.getAttribute('aria-valuetext')).toBe('35% ground shadow extinction');
      expect(viewport.className).toContain('hover:shadow-[0_0_12px_var(--theme-focus-ring)]');
      expect(viewport.className).toContain('focus-visible:ring-2');
    });

    it('M4-DOM-06: CloudDriftSpeedInstrument adheres to ARIA slider specification', async () => {
      await act(async () => {
        root.render(
          React.createElement(CloudDriftSpeedInstrument, {
            cloudDriftSpeed: 750,
          })
        );
      });

      const viewport = container.querySelector('[role="slider"]') as HTMLElement;
      expect(viewport).not.toBeNull();
      expect(viewport.tabIndex).toBe(0);
      expect(viewport.getAttribute('aria-label')).toBe('Cloud Drift Speed Reticle Caliper');
      expect(viewport.getAttribute('aria-valuemin')).toBe('0');
      expect(viewport.getAttribute('aria-valuemax')).toBe('2000');
      expect(viewport.getAttribute('aria-valuenow')).toBe('750');
      expect(viewport.getAttribute('aria-valuetext')).toBe('750× temporal drift velocity');
      expect(viewport.className).toContain('hover:shadow-[0_0_12px_var(--theme-focus-ring)]');
      expect(viewport.className).toContain('focus-visible:ring-2');
    });
  });

  // ==========================================================================
  // 4. Required DOM IDs & Queryability
  // ==========================================================================
  describe('4. Required DOM IDs & Queryability', () => {
    it('M4-DOM-07: confirms required DOM IDs exist and have correct range attributes', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            shadowIntensity: 0.45,
            cloudDriftSpeed: 500,
          })
        );
      });

      const shadowInput = container.querySelector<HTMLInputElement>('#sidebar-shadow-intensity');
      const driftInput = container.querySelector<HTMLInputElement>('#sidebar-cloud-drift');

      expect(shadowInput).not.toBeNull();
      expect(driftInput).not.toBeNull();

      expect(shadowInput?.type).toBe('range');
      expect(shadowInput?.min).toBe('0');
      expect(shadowInput?.max).toBe('0.6');
      expect(shadowInput?.step).toBe('0.05');
      expect(shadowInput?.value).toBe('0.45');

      expect(driftInput?.type).toBe('range');
      expect(driftInput?.min).toBe('0');
      expect(driftInput?.max).toBe('2000');
      expect(driftInput?.step).toBe('10');
      expect(driftInput?.value).toBe('500');

      // Monospace tabular-nums readouts
      const tabularElements = container.querySelectorAll('.tabular-nums.font-mono, .font-mono.tabular-nums');
      expect(tabularElements.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 5. Dynamic Theme Switching & State Mutation Invariants
  // ==========================================================================
  describe('5. Dynamic Theme Switching & State Mutation Invariants', () => {
    it('M4-DOM-08: dynamically transitions across themes (0 -> 1 -> 2 -> 0) without element residual leaks', async () => {
      // Mount with Theme 0 (Marie Tharp)
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', theme: 0 }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', theme: 0 }),
          ])
        );
      });
      expect(container.querySelector('.shadow-projection-tharp')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).toBeNull();

      // Switch to Theme 1 (Cream Rag)
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', theme: 1 }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', theme: 1 }),
          ])
        );
      });
      expect(container.querySelector('.shadow-projection-cream')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-tharp')).toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).toBeNull();

      // Switch to Theme 2 (Prussian Cyanotype)
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', theme: 2 }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', theme: 2 }),
          ])
        );
      });
      expect(container.querySelector('.shadow-projection-cyanotype')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).toBeNull();
      expect(container.querySelector('.shadow-projection-tharp')).toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).toBeNull();

      // Cycle back to Theme 0 (Marie Tharp)
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', theme: 0 }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', theme: 0 }),
          ])
        );
      });
      expect(container.querySelector('.shadow-projection-tharp')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).toBeNull();
    });

    it('M4-DOM-09: resolves theme fallback from isLight prop when theme is undefined', async () => {
      // isLight: true -> theme 1 (Cream Rag)
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', isLight: true }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', isLight: true }),
          ])
        );
      });
      expect(container.querySelector('.shadow-projection-cream')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).not.toBeNull();

      // isLight: false -> theme 0 (Marie Tharp)
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', isLight: false }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', isLight: false }),
          ])
        );
      });
      expect(container.querySelector('.shadow-projection-tharp')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).not.toBeNull();
    });

    it('M4-DOM-10: ARIA attributes and readouts react synchronously to dynamic value updates', async () => {
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', shadowIntensity: 0.10 }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', cloudDriftSpeed: 100 }),
          ])
        );
      });

      const shadowSlider = container.querySelectorAll('[role="slider"]')[0] as HTMLElement;
      const driftSlider = container.querySelectorAll('[role="slider"]')[1] as HTMLElement;

      expect(shadowSlider.getAttribute('aria-valuenow')).toBe('0.1');
      expect(shadowSlider.getAttribute('aria-valuetext')).toBe('10% ground shadow extinction');
      expect(driftSlider.getAttribute('aria-valuenow')).toBe('100');
      expect(driftSlider.getAttribute('aria-valuetext')).toBe('100× temporal drift velocity');

      // Update to maximum values
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', shadowIntensity: 0.60 }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', cloudDriftSpeed: 2000 }),
          ])
        );
      });

      expect(shadowSlider.getAttribute('aria-valuenow')).toBe('0.6');
      expect(shadowSlider.getAttribute('aria-valuetext')).toBe('60% ground shadow extinction');
      expect(driftSlider.getAttribute('aria-valuenow')).toBe('2000');
      expect(driftSlider.getAttribute('aria-valuetext')).toBe('2000× temporal drift velocity');

      // Update to 0 values
      await act(async () => {
        root.render(
          React.createElement('div', null, [
            React.createElement(CloudShadowInstrument, { key: 'shadow', shadowIntensity: 0.0 }),
            React.createElement(CloudDriftSpeedInstrument, { key: 'drift', cloudDriftSpeed: 0 }),
          ])
        );
      });

      expect(shadowSlider.getAttribute('aria-valuenow')).toBe('0');
      expect(shadowSlider.getAttribute('aria-valuetext')).toBe('0% ground shadow extinction');
      expect(driftSlider.getAttribute('aria-valuenow')).toBe('0');
      expect(driftSlider.getAttribute('aria-valuetext')).toBe('0× temporal drift velocity');
    });

    it('M4-DOM-11: guarantees zero console error or warning during repeated lifecycle mounts and theme switches', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let t = 0; t <= 2; t++) {
        await act(async () => {
          root.render(
            React.createElement('div', null, [
              React.createElement(CloudShadowInstrument, { key: `shadow-${t}`, theme: t as 0 | 1 | 2 }),
              React.createElement(CloudDriftSpeedInstrument, { key: `drift-${t}`, theme: t as 0 | 1 | 2 }),
            ])
          );
        });
      }

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });
});
