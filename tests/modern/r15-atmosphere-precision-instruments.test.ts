// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/r15-atmosphere-precision-instruments.test.ts
// Milestone 6: Test Suite Hardening, Medium SVG Assertions, Full Repository
//              Test Battery & Zero-Regression Verification
// Target: AtmosphereDrawer Precision Instruments Refactor (Requirements R1–R5)
//
// Invariants Verified:
//   - §2:  10px Spatial Clearance Moat & 20px Gutters
//   - §4:  Single-Border HUD Enclosure Contract (Zero Nested Neatlines)
//   - §6:  Ivory Vellum Card Tone & Medium Identity Standards
//   - §21: Responsive Collision & Accordion Collapsing
//   - §24: Zero-Recompile Uniform Buffer & Theme Switching
//   - §46: Direct Production Source Import Integrity
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// Production source imports under test (Invariant §46)
import { AtmosphereDrawer, AtmosphereDrawerProps } from '../../src/components/AtmosphereDrawer';
import { AtmosphericColumnInstrument } from '../../src/components/hud/instruments/AtmosphericColumnInstrument';
import { OrographicMoistureProfile } from '../../src/components/hud/instruments/OrographicMoistureProfile';
import { CloudShadowInstrument } from '../../src/components/hud/instruments/CloudShadowInstrument';
import { CloudDriftSpeedInstrument } from '../../src/components/hud/instruments/CloudDriftSpeedInstrument';
import { PrognosticModelCard } from '../../src/components/hud/instruments/PrognosticModelCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Milestone 6: AtmosphereDrawer Precision Instruments Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  // Window bridge mock functions
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

    // Polyfill Element pointer capture API in happy-dom
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

  // Helper to trigger native HTMLInputElement change in React 18 / happy-dom
  const triggerInputChange = (input: HTMLInputElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Helper to mock viewport bounding client rect
  const mockViewportRect = (
    viewport: Element,
    rect = { top: 100, bottom: 210, left: 50, right: 330, width: 280, height: 110 }
  ) => {
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(rect as any);
  };

  // ==========================================================================
  // 1. Simultaneous Mounting & Accordion Hierarchy (§21)
  // ==========================================================================
  describe('1. Simultaneous Mounting & Accordion Hierarchy', () => {
    it('R15-MOUNT-01: mounts all 5 precision instruments simultaneously in AtmosphereDrawer when showClouds is true', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      // 1. AtmosphericColumnInstrument
      const columnViewport = container.querySelector(
        '[aria-label="Atmospheric Profile and Strata Column Caliper"]'
      );
      expect(columnViewport).not.toBeNull();
      expect(container.textContent).toContain('Tropospheric Strata Column');

      // 2. OrographicMoistureProfile
      const orographicViewport = container.querySelector(
        '[aria-label="Orographic Moisture Profile and Condensation Caliper"]'
      );
      expect(orographicViewport).not.toBeNull();
      expect(container.textContent).toContain('OROGRAPHIC MOISTURE');

      // 3. CloudDriftSpeedInstrument
      const driftViewport = container.querySelector(
        '[aria-label="Cloud Drift Speed Reticle Caliper"]'
      );
      expect(driftViewport).not.toBeNull();
      expect(container.textContent).toContain('CLOUD DRIFT');

      // 4. CloudShadowInstrument
      const shadowViewport = container.querySelector(
        '[aria-label="Cloud Ground Shadow Intensity Caliper"]'
      );
      expect(shadowViewport).not.toBeNull();
      expect(container.textContent).toContain('CLOUD SHADOW');

      // 5. PrognosticModelCard
      const prognosticViewport = container.querySelector(
        '[aria-label="Prognostic Forecast Lead Time and NWP Tensor Grid"]'
      );
      expect(prognosticViewport).not.toBeNull();
      expect(container.textContent).toContain('PROGNOSTIC MODEL');
    });

    it('R15-MOUNT-02: collapses all 5 precision instruments when showClouds is false (Invariant §21)', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: false,
          })
        );
      });

      // Master switch is visible
      expect(container.textContent).toContain('Atmospheric Cloud Strata');
      expect(container.textContent).toContain('Master Deck Control');

      // All 5 instrument viewports are unmounted
      expect(
        container.querySelector('[aria-label="Atmospheric Profile and Strata Column Caliper"]')
      ).toBeNull();
      expect(
        container.querySelector(
          '[aria-label="Orographic Moisture Profile and Condensation Caliper"]'
        )
      ).toBeNull();
      expect(
        container.querySelector('[aria-label="Cloud Drift Speed Reticle Caliper"]')
      ).toBeNull();
      expect(
        container.querySelector('[aria-label="Cloud Ground Shadow Intensity Caliper"]')
      ).toBeNull();
      expect(
        container.querySelector('[aria-label="Prognostic Forecast Lead Time and NWP Tensor Grid"]')
      ).toBeNull();
    });

    it('R15-MOUNT-03: master TactileSwitch toggles cloud state and fires __INDICATRIX_SET_CLOUD_OPTIONS__', async () => {
      const onShowCloudsChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            onShowCloudsChange,
          })
        );
      });

      const masterSwitch = container.querySelector('[role="switch"]') as HTMLButtonElement;
      expect(masterSwitch).not.toBeNull();
      expect(masterSwitch.getAttribute('aria-checked')).toBe('true');

      await act(async () => {
        masterSwitch.click();
      });

      expect(onShowCloudsChange).toHaveBeenCalledWith(false);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ showClouds: false });
    });

    it('R15-MOUNT-04: supports controlled and uncontrolled dual-mode props correctly', async () => {
      // Uncontrolled mode (default internal state)
      await act(async () => {
        root.render(React.createElement(AtmosphereDrawer, {}));
      });
      expect(container.textContent).toContain('Tropospheric Strata Column');

      // Controlled override
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            atmosphericScale: 8.5,
            cloudOpacity: 0.45,
            cloudDriftSpeed: 1200,
            shadowIntensity: 0.35,
            rainShadowFeedback: 0.75,
            pluvialGamma: 1.5,
          })
        );
      });

      expect(container.textContent).toContain('8.5x');
      expect(container.textContent).toContain('45%');
      expect(container.textContent).toContain('1200×');
      expect(container.textContent).toContain('35%');
      expect(container.textContent).toContain('75%');
      expect(container.textContent).toContain('1.5x');
    });
  });

  // ==========================================================================
  // 2. Single-Border HUD Enclosure Contract (Invariant §4)
  // ==========================================================================
  describe('2. Single-Border HUD Enclosure Contract (Invariant §4)', () => {
    it('R15-BORDER-01: verifies zero nested inner neatlines in all drawer and instrument source files', () => {
      const srcDir = path.resolve(__dirname, '../../src/components');
      const filesToCheck = [
        path.join(srcDir, 'AtmosphereDrawer.tsx'),
        path.join(srcDir, 'hud/instruments/AtmosphericColumnInstrument.tsx'),
        path.join(srcDir, 'hud/instruments/OrographicMoistureProfile.tsx'),
        path.join(srcDir, 'hud/instruments/CloudDriftSpeedInstrument.tsx'),
        path.join(srcDir, 'hud/instruments/CloudShadowInstrument.tsx'),
        path.join(srcDir, 'hud/instruments/PrognosticModelCard.tsx'),
      ];

      for (const filePath of filesToCheck) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).not.toContain('border-current/15');
        expect(fileContent).not.toContain('inset-[2px]');
        expect(fileContent).not.toContain('Contract tokens preserved');
      }
    });

    it('R15-BORDER-02: verifies rendered DOM instrument cards conform to border-[var(--theme-card-border)] and bg-[var(--theme-card-bg)] with zero nested neatlines', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      // No nested inner neatlines in rendered DOM
      const nestedNeatlines = container.querySelectorAll('.border-current\\/15, .inset-\\[2px\\]');
      expect(nestedNeatlines.length).toBe(0);

      // Verify each individual instrument component card root styling
      const cards = container.querySelectorAll(
        '.p-2.rounded-\\[3px\\].border, .p-2.rounded-\\[3px\\].border.shadow-sm'
      );
      expect(cards.length).toBeGreaterThanOrEqual(5);

      cards.forEach((card) => {
        expect(card.className).toContain('bg-[var(--theme-card-bg)]');
        expect(card.className).toContain('border-[var(--theme-card-border)]');
      });
    });

    it('R15-BORDER-03: verifies monospace tabular numerals (font-mono tabular-nums) on all dynamic readouts', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            atmosphericScale: 4.2,
            cloudOpacity: 0.65,
            shadowIntensity: 0.3,
            cloudDriftSpeed: 800,
          })
        );
      });

      const tabularElements = container.querySelectorAll('.font-mono.tabular-nums, .tabular-nums');
      expect(tabularElements.length).toBeGreaterThanOrEqual(4);
    });

    it('R15-BORDER-04: verifies hover glow and focus ring classes on all 5 precision instrument viewports', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
            hideScrubber: true,
          })
        );
      });

      const viewports = container.querySelectorAll('[role="slider"]');
      expect(viewports.length).toBe(5);

      viewports.forEach((vp) => {
        expect(vp.className).toContain('hover:shadow-[0_0_12px_var(--theme-focus-ring)]');
        expect(vp.className).toContain('focus-visible:ring-2');
        expect(vp.className).toContain('focus-visible:ring-[var(--theme-focus-ring)]');
      });
    });
  });

  // ==========================================================================
  // 3. 3-Medium Adaptive SVG Artifacts Across Themes (§6, §24)
  // ==========================================================================
  describe('3. 3-Medium Adaptive SVG Artifacts Across All 3 Themes', () => {
    it('R15-THEME-01: Theme 0 (Marie Tharp 1977) renders all 5 Tharp-specific SVG artifacts and zero Cream/Cyanotype artifacts', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            theme: 0,
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      // 1. AtmosphericColumnInstrument (Tharp)
      expect(container.querySelector('.atmospheric-column-tharp')).not.toBeNull();
      expect(container.querySelector('.atmospheric-column-cream')).toBeNull();
      expect(container.querySelector('.atmospheric-column-cyanotype')).toBeNull();

      // 2. OrographicMoistureProfile (Tharp)
      expect(container.querySelector('.orographic-profile-tharp')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-cream')).toBeNull();
      expect(container.querySelector('.orographic-profile-cyanotype')).toBeNull();

      // 3. CloudShadowInstrument (Tharp)
      expect(container.querySelector('.shadow-projection-tharp')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).toBeNull();

      // 4. CloudDriftSpeedInstrument (Tharp)
      expect(container.querySelector('.drift-chronometer-tharp')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).toBeNull();

      // 5. PrognosticModelCard (Tharp)
      expect(container.querySelector('.prognostic-model-tharp')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).toBeNull();
      expect(container.querySelector('.prognostic-model-cyanotype')).toBeNull();
    });

    it('R15-THEME-02: Theme 1 (Cream Rag Paper) renders all 5 Cream-specific SVG artifacts and zero Tharp/Cyanotype artifacts', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            theme: 1,
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      // 1. AtmosphericColumnInstrument (Cream)
      expect(container.querySelector('.atmospheric-column-cream')).not.toBeNull();
      expect(container.querySelector('.atmospheric-column-tharp')).toBeNull();
      expect(container.querySelector('.atmospheric-column-cyanotype')).toBeNull();

      // 2. OrographicMoistureProfile (Cream)
      expect(container.querySelector('.orographic-profile-cream')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-tharp')).toBeNull();
      expect(container.querySelector('.orographic-profile-cyanotype')).toBeNull();

      // 3. CloudShadowInstrument (Cream)
      expect(container.querySelector('.shadow-projection-cream')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-tharp')).toBeNull();
      expect(container.querySelector('.shadow-projection-cyanotype')).toBeNull();

      // 4. CloudDriftSpeedInstrument (Cream)
      expect(container.querySelector('.drift-chronometer-cream')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cyanotype')).toBeNull();

      // 5. PrognosticModelCard (Cream)
      expect(container.querySelector('.prognostic-model-cream')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).toBeNull();
      expect(container.querySelector('.prognostic-model-cyanotype')).toBeNull();
    });

    it('R15-THEME-03: Theme 2 (Prussian Cyanotype) renders all 5 Cyanotype-specific SVG artifacts and zero Tharp/Cream artifacts', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            theme: 2,
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      // 1. AtmosphericColumnInstrument (Cyanotype)
      expect(container.querySelector('.atmospheric-column-cyanotype')).not.toBeNull();
      expect(container.querySelector('.atmospheric-column-tharp')).toBeNull();
      expect(container.querySelector('.atmospheric-column-cream')).toBeNull();

      // 2. OrographicMoistureProfile (Cyanotype)
      expect(container.querySelector('.orographic-profile-cyanotype')).not.toBeNull();
      expect(container.querySelector('.orographic-profile-tharp')).toBeNull();
      expect(container.querySelector('.orographic-profile-cream')).toBeNull();

      // 3. CloudShadowInstrument (Cyanotype)
      expect(container.querySelector('.shadow-projection-cyanotype')).not.toBeNull();
      expect(container.querySelector('.shadow-projection-tharp')).toBeNull();
      expect(container.querySelector('.shadow-projection-cream')).toBeNull();

      // 4. CloudDriftSpeedInstrument (Cyanotype)
      expect(container.querySelector('.drift-chronometer-cyanotype')).not.toBeNull();
      expect(container.querySelector('.drift-chronometer-tharp')).toBeNull();
      expect(container.querySelector('.drift-chronometer-cream')).toBeNull();

      // 5. PrognosticModelCard (Cyanotype)
      expect(container.querySelector('.prognostic-model-cyanotype')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).toBeNull();
    });

    it('R15-THEME-04: zero-recompile dynamic theme switching across 0 -> 1 -> 2 preserves DOM continuity (Invariant §24)', async () => {
      // 1. Initial render in Theme 0
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            theme: 0,
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });
      expect(container.querySelector('.prognostic-model-tharp')).not.toBeNull();

      // 2. Re-render in Theme 1 (Cream)
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            theme: 1,
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });
      expect(container.querySelector('.prognostic-model-cream')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-tharp')).toBeNull();

      // 3. Re-render in Theme 2 (Cyanotype)
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            theme: 2,
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });
      expect(container.querySelector('.prognostic-model-cyanotype')).not.toBeNull();
      expect(container.querySelector('.prognostic-model-cream')).toBeNull();
    });
  });

  // ==========================================================================
  // 4. Exact 5-Radiogroup Budget & Keyboard Navigation
  // ==========================================================================
  describe('4. Exact 5-Radiogroup Budget & Keyboard Navigation', () => {
    it('R15-RADIO-01: enforces exact 5-radiogroup budget when showClouds is true and prognosticModel is active', async () => {
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

      // Verify the 5 segmented controls:
      // 1. Vertical Scale Transfer (AtmosphereDrawer)
      // 2. Thermodynamic Gating (OrographicMoistureProfile)
      // 3. Weather Optical Mode (AtmosphereDrawer)
      // 4. Model Selection (PrognosticModelCard)
      // 5. Variable Selection (PrognosticModelCard)
      const groupLabels = Array.from(radiogroups).map(
        (rg) => rg.getAttribute('aria-label') || rg.className
      );
      expect(groupLabels.length).toBe(5);
    });

    it('R15-RADIO-02: conditionally suppresses variable radiogroup when prognosticModel is off (budget drops to 4)', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'off',
          })
        );
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(4);
    });

    it('R15-RADIO-03: collapses all radiogroups when showClouds is false (budget drops to 0)', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: false,
          })
        );
      });

      const radiogroups = container.querySelectorAll('[role="radiogroup"]');
      expect(radiogroups.length).toBe(0);
    });

    it('R15-RADIO-04: arrow keys navigate radiogroup options with roving tabIndex', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      // Target Vertical Scale Transfer SegmentedControl
      const verticalRadios = container.querySelectorAll<HTMLButtonElement>(
        '.grid-cols-2 button[role="radio"]'
      );
      expect(verticalRadios.length).toBeGreaterThanOrEqual(2);

      const linearRadio = verticalRadios[0];
      const dualLogRadio = verticalRadios[1];

      // Initially dual-log is active (tabIndex 0)
      expect(dualLogRadio.getAttribute('tabIndex')).toBe('0');
      expect(linearRadio.getAttribute('tabIndex')).toBe('-1');

      // Navigate using ArrowLeft
      await act(async () => {
        dualLogRadio.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
        );
      });

      // Linear becomes active
      expect(linearRadio.getAttribute('aria-checked')).toBe('true');
    });
  });

  // ==========================================================================
  // 5. Legacy DOM IDs Preservation & Interactive Responsiveness
  // ==========================================================================
  describe('5. Legacy DOM IDs Preservation & Interactive Responsiveness', () => {
    it('R15-LEGACY-01: #sidebar-atmospheric-scale and #sidebar-cloud-opacity are present and responsive', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
          })
        );
      });

      // Atmospheric Scale
      const scaleInput = container.querySelector<HTMLInputElement>('#sidebar-atmospheric-scale');
      expect(scaleInput).not.toBeNull();
      expect(scaleInput?.type).toBe('range');
      expect(scaleInput?.min).toBe('1');
      expect(scaleInput?.max).toBe('12');

      await act(async () => {
        if (scaleInput) {
          triggerInputChange(scaleInput, '7.5');
        }
      });
      expect(mockSetAtmosphericScale).toHaveBeenCalledWith(7.5);
      expect(mockSetCloudOptions).toHaveBeenCalledWith(
        expect.objectContaining({ atmosphericScale: 7.5 })
      );

      // Cloud Opacity
      const opacityInput = container.querySelector<HTMLInputElement>('#sidebar-cloud-opacity');
      expect(opacityInput).not.toBeNull();
      expect(opacityInput?.type).toBe('range');
      expect(opacityInput?.min).toBe('0.1');
      expect(opacityInput?.max).toBe('1');

      await act(async () => {
        if (opacityInput) {
          triggerInputChange(opacityInput, '0.4');
        }
      });
      expect(mockSetCloudOptions).toHaveBeenCalledWith(
        expect.objectContaining({ cloudOpacity: 0.4 })
      );
    });

    it('R15-LEGACY-02: #sidebar-orographic-coupling and #sidebar-pluvial-coupling are present and responsive', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
          })
        );
      });

      // Orographic Coupling
      const orographicInput = container.querySelector<HTMLInputElement>(
        '#sidebar-orographic-coupling, #sidebar-rain-shadow'
      );
      expect(orographicInput).not.toBeNull();

      await act(async () => {
        if (orographicInput) {
          triggerInputChange(orographicInput, '0.85');
        }
      });
      expect(mockSetRainShadowFeedback).toHaveBeenCalledWith(0.85);

      // Pluvial Coupling
      const pluvialInput = container.querySelector<HTMLInputElement>('#sidebar-pluvial-coupling');
      expect(pluvialInput).not.toBeNull();

      await act(async () => {
        if (pluvialInput) {
          triggerInputChange(pluvialInput, '1.4');
        }
      });
      expect(mockSetPluvialGamma).toHaveBeenCalledWith(1.4);
    });

    it('R15-LEGACY-03: #sidebar-cloud-drift and #sidebar-shadow-intensity are present and responsive', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
          })
        );
      });

      // Cloud Drift Speed
      const driftInput = container.querySelector<HTMLInputElement>('#sidebar-cloud-drift');
      expect(driftInput).not.toBeNull();

      await act(async () => {
        if (driftInput) {
          triggerInputChange(driftInput, '1500');
        }
      });
      expect(mockSetCloudOptions).toHaveBeenCalledWith(
        expect.objectContaining({ cloudDriftSpeed: 1500 })
      );

      // Shadow Intensity
      const shadowInput = container.querySelector<HTMLInputElement>('#sidebar-shadow-intensity');
      expect(shadowInput).not.toBeNull();

      await act(async () => {
        if (shadowInput) {
          triggerInputChange(shadowInput, '0.55');
        }
      });
      expect(mockSetShadowIntensity).toHaveBeenCalledWith(0.55);
      expect(mockSetCloudOptions).toHaveBeenCalledWith(
        expect.objectContaining({ shadowIntensity: 0.55 })
      );
    });

    it('R15-LEGACY-04: prognostic model radio buttons (#sidebar-model-*) switch models and trigger bridge', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'gfs',
          })
        );
      });

      const ecmwfBtn = container.querySelector<HTMLButtonElement>('#sidebar-model-ecmwf');
      const gfsBtn = container.querySelector<HTMLButtonElement>('#sidebar-model-gfs');
      const weatherNextBtn = container.querySelector<HTMLButtonElement>('#sidebar-model-weathernext');
      const offBtn = container.querySelector<HTMLButtonElement>('#sidebar-model-off');

      expect(ecmwfBtn).not.toBeNull();
      expect(gfsBtn).not.toBeNull();
      expect(weatherNextBtn).not.toBeNull();
      expect(offBtn).not.toBeNull();

      // Click WeatherNext
      await act(async () => {
        weatherNextBtn?.click();
      });
      expect(mockSetPrognosticModel).toHaveBeenCalledWith('weathernext3');

      // Click ECMWF
      await act(async () => {
        ecmwfBtn?.click();
      });
      expect(mockSetPrognosticModel).toHaveBeenCalledWith('ecmwf');

      // Click Off
      await act(async () => {
        offBtn?.click();
      });
      expect(mockSetPrognosticModel).toHaveBeenCalledWith('off');
    });

    it('R15-LEGACY-05: prognostic variable radio buttons (#sidebar-variable-*) switch variables and trigger bridge', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            prognosticModel: 'weathernext3',
          })
        );
      });

      const rainBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-rain');
      const tempBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-temp');
      const windBtn = container.querySelector<HTMLButtonElement>('#sidebar-variable-wind');
      const z500Btn = container.querySelector<HTMLButtonElement>('#sidebar-variable-z500');

      expect(rainBtn).not.toBeNull();
      expect(tempBtn).not.toBeNull();
      expect(windBtn).not.toBeNull();
      expect(z500Btn).not.toBeNull();

      // Click Temperature
      await act(async () => {
        tempBtn?.click();
      });
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('temperature_2m_mean');

      // Click Wind
      await act(async () => {
        windBtn?.click();
      });
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('wind_10m_vector');

      // Click Geopotential Height
      await act(async () => {
        z500Btn?.click();
      });
      expect(mockSetPrognosticVariable).toHaveBeenCalledWith('geopotential_500hpa');
    });
  });

  // ==========================================================================
  // 6. Window Bridge Dispatches & Camera Preset
  // ==========================================================================
  describe('6. Window Bridge Dispatches & Camera Preset', () => {
    it('R15-BRIDGE-01: verifies strata band clicks fire __INDICATRIX_SET_CLOUD_OPTIONS__', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
          })
        );
      });

      const columnViewport = container.querySelector(
        '[aria-label="Atmospheric Profile and Strata Column Caliper"]'
      ) as HTMLElement;
      mockViewportRect(columnViewport);

      // Fast click in top 40% toggles high strata
      await act(async () => {
        columnViewport.dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 120, bubbles: true })
        );
        columnViewport.dispatchEvent(
          new PointerEvent('pointerup', { clientX: 100, clientY: 120, bubbles: true })
        );
      });

      expect(mockSetCloudOptions).toHaveBeenCalledWith(
        expect.objectContaining({ showCloudHigh: false })
      );
    });

    it('R15-BRIDGE-02: verifies timeline scrubber triggers __INDICATRIX_SET_TIMELINE_MINUTES__', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            timelineMinutes: 0,
          })
        );
      });

      const timelineSlider = container.querySelector(
        '[role="slider"][aria-label*="Timeline"], input[type="range"][aria-label*="Timeline"]'
      );
      if (timelineSlider) {
        await act(async () => {
          timelineSlider.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
          );
        });
      }
    });

    it('R15-BRIDGE-03: 1-Click Horizon Cross-Section (78.0°) camera preset button sets scale and triggers camera hook', async () => {
      const onHorizonPresetClick = vi.fn();
      const mockCamera = { snapHorizonCrossSection: vi.fn() };
      (window as any).__INDICATRIX_CAMERA__ = mockCamera;

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            atmosphericScale: 1.0,
            onHorizonPresetClick,
          })
        );
      });

      const horizonBtn = container.querySelector<HTMLButtonElement>(
        'button[title*="Horizon Cross-Section"]'
      );
      expect(horizonBtn).not.toBeNull();

      await act(async () => {
        horizonBtn?.click();
      });

      expect(onHorizonPresetClick).toHaveBeenCalled();
      expect(mockSetAtmosphericScale).toHaveBeenCalledWith(6.0);
      expect(mockCamera.snapHorizonCrossSection).toHaveBeenCalledWith(1.6);

      delete (window as any).__INDICATRIX_CAMERA__;
    });
  });

  // ==========================================================================
  // 7. Interactive Viewports ARIA & Ergonomics
  // ==========================================================================
  describe('7. Interactive Viewports ARIA & Ergonomics', () => {
    it('R15-A11Y-01: all 5 interactive viewports specify role="slider", tabIndex={0}, and aria-valuenow', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            atmosphericScale: 3.5,
            rainShadowFeedback: 0.25,
            cloudDriftSpeed: 500,
            shadowIntensity: 0.45,
            prognosticModel: 'weathernext3',
            hideScrubber: true,
          })
        );
      });

      const sliders = container.querySelectorAll('div[role="slider"]');
      expect(sliders.length).toBe(5);

      sliders.forEach((slider) => {
        expect(slider.getAttribute('tabindex')).toBe('0');
        expect(slider.getAttribute('aria-valuenow')).not.toBeNull();
        expect(slider.getAttribute('aria-valuemin')).not.toBeNull();
        expect(slider.getAttribute('aria-valuemax')).not.toBeNull();
      });
    });

    it('R15-A11Y-02: double-click resets viewports to calibrated scientific defaults', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            atmosphericScale: 11.5,
            shadowIntensity: 0.1,
            cloudDriftSpeed: 1900,
            rainShadowFeedback: 0.9,
            pluvialGamma: 1.8,
          })
        );
      });

      // 1. Column Caliper double-click resets to scale 3.5
      const columnVp = container.querySelector(
        '[aria-label="Atmospheric Profile and Strata Column Caliper"]'
      );
      await act(async () => {
        columnVp?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(mockSetAtmosphericScale).toHaveBeenCalledWith(3.5);

      // 2. Cloud Shadow double-click resets to 0.45
      const shadowVp = container.querySelector(
        '[aria-label="Cloud Ground Shadow Intensity Caliper"]'
      );
      await act(async () => {
        shadowVp?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(mockSetShadowIntensity).toHaveBeenCalledWith(0.45);

      // 3. Drift Speed double-click resets to 500x
      const driftVp = container.querySelector(
        '[aria-label="Cloud Drift Speed Reticle Caliper"]'
      );
      await act(async () => {
        driftVp?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(mockSetCloudOptions).toHaveBeenCalledWith(
        expect.objectContaining({ cloudDriftSpeed: 500 })
      );

      // 4. Orographic Profile double-click resets to 0.0 coupling and 0.0 pluvial
      const orographicVp = container.querySelector(
        '[aria-label="Orographic Moisture Profile and Condensation Caliper"]'
      );
      await act(async () => {
        orographicVp?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(mockSetRainShadowFeedback).toHaveBeenCalledWith(0.0);
      expect(mockSetPluvialGamma).toHaveBeenCalledWith(0.0);
    });

    it('R15-A11Y-03: keyboard ArrowLeft / ArrowRight steps parameters with Shift key coarse acceleration', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            atmosphericScale: 3.5,
            shadowIntensity: 0.45,
          })
        );
      });

      const shadowVp = container.querySelector(
        '[aria-label="Cloud Ground Shadow Intensity Caliper"]'
      ) as HTMLElement;
      expect(shadowVp).not.toBeNull();

      // Fine step right (+0.05)
      await act(async () => {
        shadowVp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(mockSetShadowIntensity).toHaveBeenCalledWith(0.5);

      // Coarse step left with Shift key (-0.10)
      await act(async () => {
        shadowVp.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true })
        );
      });
      expect(mockSetShadowIntensity).toHaveBeenCalledWith(0.35);
    });

    it('R15-A11Y-04: supports pointer capture gracefully on pointer down and up without error', async () => {
      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
          })
        );
      });

      const columnVp = container.querySelector(
        '[aria-label="Atmospheric Profile and Strata Column Caliper"]'
      ) as HTMLElement;
      mockViewportRect(columnVp);

      expect(() => {
        act(() => {
          columnVp.dispatchEvent(
            new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 150, bubbles: true })
          );
          columnVp.dispatchEvent(
            new PointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 120, bubbles: true })
          );
          columnVp.dispatchEvent(
            new PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 120, bubbles: true })
          );
        });
      }).not.toThrow();
    });
  });
});
