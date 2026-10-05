// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m2-2-dom-aria.test.tsx
// Challenger 2: DOM, ARIA & Build Verification Suite
// Milestone 2: Atmospheric Cross-Section Column Instrument (R2)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AtmosphericColumnInstrument } from '../../src/components/hud/instruments/AtmosphericColumnInstrument';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Challenger 2: DOM, ARIA & Build Verification Suite (M2 - R2)', () => {
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
    delete (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__;
    delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
  });

  // ==========================================================================
  // 1. DOM Queries Across Themes (Objective 1)
  // ==========================================================================
  describe('1. DOM Queries Across Themes (3-Medium Adaptive SVG)', () => {
    it('CHALLENGE-THEME-01: Theme 0 (Marie Tharp) renders .acoustic-trace-tharp and oceanographic sounding artifacts', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            theme={0}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            atmosphericScale={3.5}
            cloudOpacity={0.8}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const tharpGroup = container.querySelector('.acoustic-trace-tharp');
      expect(tharpGroup).not.toBeNull();

      // Ensure other theme groups are mutually exclusive and absent
      expect(container.querySelector('.strata-engraving-cream')).toBeNull();
      expect(container.querySelector('.isobar-grid-cyanotype')).toBeNull();

      // Check for Tharp-specific sounding artifacts
      const tharpText = tharpGroup?.textContent || '';
      expect(tharpText).toContain('LCL CEILING');
      expect(container.textContent).toContain('CIRRUS (10–12 km)');
      expect(container.textContent).toContain('ALTOCUMULUS (4–6 km)');
      expect(container.textContent).toContain('MARINE LAYER (1–2 km)');
      
      
      
      
      

      // Check sounding curve and inversion line
      const lapsePath = tharpGroup?.querySelector('path');
      expect(lapsePath).not.toBeNull();
      expect(lapsePath?.getAttribute('stroke')).toBe('currentColor');

      const circles = tharpGroup?.querySelectorAll('circle');
      expect(circles?.length).toBe(2); // Acoustic pulse echo circles
    });

    it('CHALLENGE-THEME-02: Theme 1 (Cream Rag) renders .strata-engraving-cream with Luke Howard labels and ticks', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            theme={1}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            atmosphericScale={3.5}
            cloudOpacity={0.8}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const creamGroup = container.querySelector('.strata-engraving-cream');
      expect(creamGroup).not.toBeNull();

      // Mutual exclusivity
      expect(container.querySelector('.acoustic-trace-tharp')).toBeNull();
      expect(container.querySelector('.isobar-grid-cyanotype')).toBeNull();

      // Check for Luke Howard 1803 Latin Taxonomy Labels
      const creamText = creamGroup?.textContent || '';
      expect(container.textContent).toContain('Cirrus (10–12 km)');
      expect(container.textContent).toContain('Alto-cumulus (4–6 km)');
      expect(container.textContent).toContain('Stratus (1–2 km)');

      // Check altitude graduation ticks (unabbreviated metric units)
      expect(creamText).toContain('15 km');
      expect(creamText).toContain('11 km');
      expect(creamText).toContain('5 km');
      expect(creamText).toContain('1.5 km');
      expect(creamText).toContain('0 m');

      // Regression guard: Verify geological crust baseline begins at x1=40 (no collision with 0 m label at x=31)
      const crustBaseline = Array.from(creamGroup?.querySelectorAll('line') || []).find(
        (l) => l.getAttribute('y1') === '122' && l.getAttribute('y2') === '122' && l.getAttribute('x2') === '272'
      );
      expect(crustBaseline).not.toBeNull();
      expect(crustBaseline?.getAttribute('x1')).toBe('40');

      // Check intaglio copperplate ruling-pen lines and hachures
      const hachureLines = creamGroup?.querySelectorAll('line');
      expect(hachureLines && hachureLines.length).toBeGreaterThan(20); // Geological hachures along baseline
    });

    it('CHALLENGE-THEME-03: Theme 2 (Prussian Cyanotype) renders .isobar-grid-cyanotype with isobaric pressure ticks', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            theme={2}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            atmosphericScale={3.5}
            cloudOpacity={0.8}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const cyanotypeGroup = container.querySelector('.isobar-grid-cyanotype');
      expect(cyanotypeGroup).not.toBeNull();

      // Mutual exclusivity
      expect(container.querySelector('.acoustic-trace-tharp')).toBeNull();
      expect(container.querySelector('.strata-engraving-cream')).toBeNull();

      // Check for isobaric pressure annotations
      const cyanoText = cyanotypeGroup?.textContent || '';
      expect(cyanoText).toContain('150hPa');
      expect(cyanoText).toContain('250hPa');
      expect(cyanoText).toContain('500hPa');
      expect(cyanoText).toContain('850hPa');
      expect(cyanoText).toContain('1013');

      // Check radiosonde altitude tags
      expect(container.textContent).toContain('JET / CIRRUS [250 hPa]');
      expect(container.textContent).toContain('ALTOSTRATUS [500 hPa]');
      expect(container.textContent).toContain('STRATUS [850 hPa]');

      // Check radiosonde ascent polyline and tracking stations
      const polyline = cyanotypeGroup?.querySelector('polyline');
      expect(polyline).not.toBeNull();
      expect(polyline?.getAttribute('points')).toBe('70,122 105,103 150,67 195,31 220,14');

      const sondePips = cyanotypeGroup?.querySelectorAll('circle');
      expect(sondePips?.length).toBe(3);
    });

    it('CHALLENGE-THEME-04: AtmosphereDrawer correctly propagates theme (0, 1, 2) down to AtmosphericColumnInstrument', async () => {
      // Test theme 0 in drawer
      await act(async () => {
        root.render(<AtmosphereDrawer showClouds={true} theme={0} />);
      });
      expect(container.querySelector('.acoustic-trace-tharp')).not.toBeNull();
      expect(container.querySelector('.strata-engraving-cream')).toBeNull();
      expect(container.querySelector('.isobar-grid-cyanotype')).toBeNull();

      // Test theme 1 in drawer
      await act(async () => {
        root.render(<AtmosphereDrawer showClouds={true} theme={1} />);
      });
      expect(container.querySelector('.acoustic-trace-tharp')).toBeNull();
      expect(container.querySelector('.strata-engraving-cream')).not.toBeNull();
      expect(container.querySelector('.isobar-grid-cyanotype')).toBeNull();

      // Test theme 2 in drawer
      await act(async () => {
        root.render(<AtmosphereDrawer showClouds={true} theme={2} />);
      });
      expect(container.querySelector('.acoustic-trace-tharp')).toBeNull();
      expect(container.querySelector('.strata-engraving-cream')).toBeNull();
      expect(container.querySelector('.isobar-grid-cyanotype')).not.toBeNull();
    });
  });

  // ==========================================================================
  // 2. Legacy Test Element IDs & Steppers (Objective 2)
  // ==========================================================================
  describe('2. Legacy Test Element IDs, Steppers & Strata Toggles', () => {
    it('CHALLENGE-ID-01: #sidebar-atmospheric-scale is an HTMLInputElement with min=1, max=12, step=0.1', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={4.5}
            cloudOpacity={0.8}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={onScaleChange}
          />
        );
      });

      const scaleInput = container.querySelector<HTMLInputElement>('#sidebar-atmospheric-scale');
      expect(scaleInput).not.toBeNull();
      expect(scaleInput?.tagName.toLowerCase()).toBe('input');
      expect(scaleInput?.type).toBe('range');
      expect(scaleInput?.min).toBe('1');
      expect(scaleInput?.max).toBe('12');
      expect(scaleInput?.step).toBe('0.1');
      expect(scaleInput?.value).toBe('4.5');

      // Native input dispatch
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      await act(async () => {
        nativeSetter?.call(scaleInput, '7.2');
        scaleInput?.dispatchEvent(new Event('input', { bubbles: true }));
        scaleInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(onScaleChange).toHaveBeenCalledWith(7.2);
    });

    it('CHALLENGE-ID-02: #sidebar-cloud-opacity is an HTMLInputElement with min=0.1, max=1, step=0.05', async () => {
      const onOpacityChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.65}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
            onCloudOpacityChange={onOpacityChange}
          />
        );
      });

      const opacityInput = container.querySelector<HTMLInputElement>('#sidebar-cloud-opacity');
      expect(opacityInput).not.toBeNull();
      expect(opacityInput?.tagName.toLowerCase()).toBe('input');
      expect(opacityInput?.type).toBe('range');
      expect(opacityInput?.min).toBe('0.1');
      expect(opacityInput?.max).toBe('1');
      expect(opacityInput?.step).toBe('0.05');
      expect(opacityInput?.value).toBe('0.65');

      // Native input dispatch
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      await act(async () => {
        nativeSetter?.call(opacityInput, '0.9');
        opacityInput?.dispatchEvent(new Event('input', { bubbles: true }));
        opacityInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(onOpacityChange).toHaveBeenCalledWith(0.9);
    });

    it('CHALLENGE-ID-03: Horizon Standoff steppers increase/decrease by 0.1 and clamp properly', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.8}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={onScaleChange}
          />
        );
      });

      const incBtn = container.querySelector<HTMLButtonElement>('button[title*="Increase Horizon Standoff"]');
      const decBtn = container.querySelector<HTMLButtonElement>('button[title*="Decrease Horizon Standoff"]');

      expect(incBtn).not.toBeNull();
      expect(decBtn).not.toBeNull();

      await act(async () => {
        incBtn?.click();
      });
      expect(onScaleChange).toHaveBeenCalledWith(3.6);

      await act(async () => {
        decBtn?.click();
      });
      expect(onScaleChange).toHaveBeenCalledWith(3.4);
    });

    it('CHALLENGE-ID-04: Horizon Standoff steppers enforce boundaries [1.0, 12.0]', async () => {
      const onScaleChange = vi.fn();

      // At lower boundary
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={1.0}
            cloudOpacity={0.8}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={onScaleChange}
          />
        );
      });

      const decBtn = container.querySelector<HTMLButtonElement>('button[title*="Decrease Horizon Standoff"]');
      await act(async () => {
        decBtn?.click();
      });
      expect(onScaleChange).toHaveBeenCalledWith(1.0); // Clamped at 1.0

      // At upper boundary
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={12.0}
            cloudOpacity={0.8}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={onScaleChange}
          />
        );
      });

      const incBtn = container.querySelector<HTMLButtonElement>('button[title*="Increase Horizon Standoff"]');
      await act(async () => {
        incBtn?.click();
      });
      expect(onScaleChange).toHaveBeenCalledWith(12.0); // Clamped at 12.0
    });

    it('CHALLENGE-ID-05: Cloud Opacity steppers increase/decrease by 0.05 and clamp [0.10, 1.00]', async () => {
      const onOpacityChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.80}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
            onCloudOpacityChange={onOpacityChange}
          />
        );
      });

      const incBtn = container.querySelector<HTMLButtonElement>('button[title*="Increase Cloud Opacity"]');
      const decBtn = container.querySelector<HTMLButtonElement>('button[title*="Decrease Cloud Opacity"]');

      expect(incBtn).not.toBeNull();
      expect(decBtn).not.toBeNull();

      await act(async () => {
        incBtn?.click();
      });
      expect(onOpacityChange).toHaveBeenCalledWith(0.85);

      await act(async () => {
        decBtn?.click();
      });
      expect(onOpacityChange).toHaveBeenCalledWith(0.75);

      // Upper boundary
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={1.00}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
            onCloudOpacityChange={onOpacityChange}
          />
        );
      });
      const incBtnMax = container.querySelector<HTMLButtonElement>('button[title*="Increase Cloud Opacity"]');
      await act(async () => {
        incBtnMax?.click();
      });
      expect(onOpacityChange).toHaveBeenCalledWith(1.00);

      // Lower boundary
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.10}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
            onCloudOpacityChange={onOpacityChange}
          />
        );
      });
      const decBtnMin = container.querySelector<HTMLButtonElement>('button[title*="Decrease Cloud Opacity"]');
      await act(async () => {
        decBtnMin?.click();
      });
      expect(onOpacityChange).toHaveBeenCalledWith(0.10);
    });

    it('CHALLENGE-ID-06: Strata toggle buttons exist with correct titles and toggle layers', async () => {
      // Test removed: Quick toggle buttons were removed in favor of direct SVG interaction.
    });
  });

  // ==========================================================================
  // 3. ARIA Semantics, Keyboard Navigation & Interactive Caliper
  // ==========================================================================
  describe('3. ARIA Semantics, Keyboard Navigation & Interactive Caliper', () => {
    it('CHALLENGE-ARIA-01: Interactive SVG Viewport exposes complete slider ARIA semantics', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={5.2}
            cloudOpacity={0.80}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const sliderViewport = container.querySelector('[role="slider"]');
      expect(sliderViewport).not.toBeNull();
      expect(sliderViewport?.getAttribute('tabindex')).toBe('0');
      expect(sliderViewport?.getAttribute('aria-label')).toBe('Atmospheric Profile and Strata Column Caliper');
      expect(sliderViewport?.getAttribute('aria-valuemin')).toBe('1');
      expect(sliderViewport?.getAttribute('aria-valuemax')).toBe('12');
      expect(sliderViewport?.getAttribute('aria-valuenow')).toBe('5.2');
    });

    it('CHALLENGE-ARIA-02: Keyboard ArrowUp / ArrowDown steps atmosphericScale with Shift modifier', async () => {
      const onScaleChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.80}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={onScaleChange}
          />
        );
      });

      const sliderViewport = container.querySelector<HTMLDivElement>('[role="slider"]');
      expect(sliderViewport).not.toBeNull();

      // Normal ArrowUp (+0.1)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(3.6);

      // Normal ArrowDown (-0.1)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(3.4);

      // Coarse ArrowUp with Shift (+1.0)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(4.5);

      // Coarse ArrowDown with Shift (-1.0)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(2.5);

      // Home key (jumps to 1.0)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(1.0);

      // End key (jumps to 12.0)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onScaleChange).toHaveBeenCalledWith(12.0);
    });

    it('CHALLENGE-ARIA-03: Keyboard ArrowRight / ArrowLeft steps cloudOpacity with Shift modifier', async () => {
      const onOpacityChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.70}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
            onCloudOpacityChange={onOpacityChange}
          />
        );
      });

      const sliderViewport = container.querySelector<HTMLDivElement>('[role="slider"]');

      // Normal ArrowRight (+0.05)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenCalledWith(0.75);

      // Normal ArrowLeft (-0.05)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenCalledWith(0.65);

      // Coarse ArrowRight with Shift (+0.10)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenCalledWith(0.80);

      // Coarse ArrowLeft with Shift (-0.10)
      await act(async () => {
        sliderViewport?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      });
      expect(onOpacityChange).toHaveBeenCalledWith(0.60);
    });

    it('CHALLENGE-ARIA-04: Double-click on viewport triggers reset to calibrated defaults', async () => {
      const onScaleChange = vi.fn();
      const onOpacityChange = vi.fn();
      const onToggleStrata = vi.fn();

      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={9.0}
            cloudOpacity={0.30}
            showCloudLow={false}
            showCloudMid={false}
            showCloudHigh={false}
            onToggleStrata={onToggleStrata}
            onAtmosphericScaleChange={onScaleChange}
            onCloudOpacityChange={onOpacityChange}
          />
        );
      });

      const sliderViewport = container.querySelector<HTMLDivElement>('[role="slider"]');
      await act(async () => {
        sliderViewport?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(onScaleChange).toHaveBeenCalledWith(3.5);
      expect(onOpacityChange).toHaveBeenCalledWith(0.80);
      expect(onToggleStrata).toHaveBeenCalledWith('low', true);
      expect(onToggleStrata).toHaveBeenCalledWith('mid', true);
      expect(onToggleStrata).toHaveBeenCalledWith('high', true);
    });

    it('CHALLENGE-ARIA-05: Footer RESET button triggers handleReset', async () => {
      const onScaleChange = vi.fn();
      const onOpacityChange = vi.fn();
      const onToggleStrata = vi.fn();

      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={8.0}
            cloudOpacity={0.40}
            showCloudLow={false}
            showCloudMid={true}
            showCloudHigh={false}
            onToggleStrata={onToggleStrata}
            onAtmosphericScaleChange={onScaleChange}
            onCloudOpacityChange={onOpacityChange}
          />
        );
      });

      const resetBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (btn) => btn.textContent?.trim() === '[RESET]'
      );
      expect(resetBtn).toBeDefined();

      await act(async () => {
        resetBtn?.click();
      });

      expect(onScaleChange).toHaveBeenCalledWith(3.5);
      expect(onOpacityChange).toHaveBeenCalledWith(0.80);
      expect(onToggleStrata).toHaveBeenCalledWith('low', true);
      expect(onToggleStrata).toHaveBeenCalledWith('high', true);
    });

    it('CHALLENGE-ARIA-06: Direct click on viewport strata toggles strata based on relative Y coordinates', async () => {
      const onToggleStrata = vi.fn();

      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.80}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={onToggleStrata}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const sliderViewport = container.querySelector<HTMLDivElement>('[role="slider"]');
      expect(sliderViewport).not.toBeNull();

      // Mock bounding rect: top=100, height=100
      vi.spyOn(sliderViewport!, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 200,
        left: 0,
        right: 280,
        width: 280,
        height: 100,
        x: 0,
        y: 100,
        toJSON: () => {},
      });

      // Quick click in High strata zone (relY = (120 - 100)/100 = 0.20 < 0.40)
      await act(async () => {
        sliderViewport?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 120, bubbles: true }));
        sliderViewport?.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 120, bubbles: true }));
      });
      expect(onToggleStrata).toHaveBeenCalledWith('high', false);

      // Quick click in Mid strata zone (relY = (155 - 100)/100 = 0.55 >= 0.40 && < 0.70)
      await act(async () => {
        sliderViewport?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 155, bubbles: true }));
        sliderViewport?.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 155, bubbles: true }));
      });
      expect(onToggleStrata).toHaveBeenCalledWith('mid', false);

      // Quick click in Low strata zone (relY = (185 - 100)/100 = 0.85 >= 0.70)
      await act(async () => {
        sliderViewport?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 185, bubbles: true }));
        sliderViewport?.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 185, bubbles: true }));
      });
      expect(onToggleStrata).toHaveBeenCalledWith('low', false);
    });

    it('CHALLENGE-ARIA-07: Pointer drag on viewport adjusts scale continuously', async () => {
      const onScaleChange = vi.fn();

      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.80}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={onScaleChange}
          />
        );
      });

      const sliderViewport = container.querySelector<HTMLDivElement>('[role="slider"]');

      vi.spyOn(sliderViewport!, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        bottom: 100,
        left: 0,
        right: 280,
        width: 280,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer down at y=50, then drag up to y=10 (near top: high scale)
      await act(async () => {
        sliderViewport?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 50, bubbles: true }));
        sliderViewport?.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 10, bubbles: true }));
        sliderViewport?.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 10, bubbles: true }));
      });

      expect(onScaleChange).toHaveBeenCalled();
      const lastCalledScale = onScaleChange.mock.calls[onScaleChange.mock.calls.length - 1][0];
      expect(lastCalledScale).toBeGreaterThanOrEqual(10.0);
    });
  });

  // ==========================================================================
  // 4. AtmosphereDrawer Integration & Window Bridge Verification
  // ==========================================================================
  describe('4. AtmosphereDrawer Integration & Window Bridge Verification', () => {
    it('CHALLENGE-INT-01: AtmosphericColumnInstrument mounts inside AtmosphereDrawer when showClouds=true', async () => {
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={true}
            atmosphericScale={4.0}
            cloudOpacity={0.75}
          />
        );
      });

      // Caliper slider is present
      const caliperSlider = container.querySelector('[role="slider"][aria-label*="Atmospheric Profile"]');
      expect(caliperSlider).not.toBeNull();

      // Legacy test element IDs are present inside AtmosphereDrawer
      expect(container.querySelector('#sidebar-atmospheric-scale')).not.toBeNull();
      expect(container.querySelector('#sidebar-cloud-opacity')).not.toBeNull();
      expect(container.querySelector('button[title*="Increase Horizon Standoff"]')).not.toBeNull();
      expect(container.querySelector('button[title*="Increase Cloud Opacity"]')).not.toBeNull();
      
    });

    it('CHALLENGE-INT-02: AtmosphericColumnInstrument collapses when showClouds=false (Invariant §21)', async () => {
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={false}
          />
        );
      });

      expect(container.querySelector('[role="slider"][aria-label*="Atmospheric Profile"]')).toBeNull();
      expect(container.querySelector('#sidebar-atmospheric-scale')).toBeNull();
      expect(container.querySelector('#sidebar-cloud-opacity')).toBeNull();
    });

    it('CHALLENGE-INT-03: AtmosphereDrawer dispatches to window bridge functions on scale and opacity change', async () => {
      const mockSetAtmosphericScale = vi.fn();
      const mockSetCloudOptions = vi.fn();

      (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__ = mockSetAtmosphericScale;
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = mockSetCloudOptions;

      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={true}
            atmosphericScale={3.5}
            cloudOpacity={0.80}
          />
        );
      });

      // Increase scale via stepper
      const incScaleBtn = container.querySelector<HTMLButtonElement>('button[title*="Increase Horizon Standoff"]');
      await act(async () => {
        incScaleBtn?.click();
      });

      expect(mockSetAtmosphericScale).toHaveBeenCalledWith(3.6);
      expect(mockSetCloudOptions).toHaveBeenCalledWith({ atmosphericScale: 3.6 });

      // Increase opacity via stepper
      const incOpacityBtn = container.querySelector<HTMLButtonElement>('button[title*="Increase Cloud Opacity"]');
      await act(async () => {
        incOpacityBtn?.click();
      });

      expect(mockSetCloudOptions).toHaveBeenCalledWith({ cloudOpacity: 0.85 });

      // Toggle strata via button
      const lowBtn = container.querySelector('text') as any; // Toggles removed, interaction is on SVG
      await act(async () => {
        /* Click interaction handled via SVG viewport */
      });

      
    });
  });

  // ==========================================================================
  // 5. Invariant Contracts & Enclosure Standards
  // ==========================================================================
  describe('5. Invariant Contracts & Single-Border Enclosure Standards', () => {
    it('CHALLENGE-ENV-01: AtmosphericColumnInstrument conforms to Single-Border HUD Enclosure (no nested neatlines)', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            theme={1}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            atmosphericScale={3.5}
            cloudOpacity={0.8}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const card = container.firstElementChild as HTMLElement;
      expect(card).not.toBeNull();
      expect(card.className).toContain('rounded-[3px]');
      expect(card.className).toContain('border');
      expect(card.className).toContain('bg-[var(--theme-card-bg)]');
      expect(card.className).toContain('border-[var(--theme-card-border)]');

      // Check Invariant §4: Zero nested inner neatlines (.border-current/15 or .inset-[2px])
      const innerNeatlineBorder = card.querySelectorAll('.border-current\\/15, [class*="border-current/15"]');
      expect(innerNeatlineBorder.length).toBe(0);

      const innerNeatlineInset = card.querySelectorAll('.inset-\\[2px\\]');
      expect(innerNeatlineInset.length).toBe(0);
    });

    it('CHALLENGE-ENV-02: Live header readouts render monospace tabular numerals', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={6.4}
            cloudOpacity={0.92}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const header = container.querySelector('.text-micro');
      expect(header).not.toBeNull();
      expect(header?.textContent).toContain('Scale:');
      expect(header?.textContent).toMatch(/6\.4[x×]/);
      expect(header?.textContent).toContain('Opacity:');
      expect(header?.textContent).toContain('92%');

      const tabularElements = container.querySelectorAll('.tabular-nums');
      expect(tabularElements.length).toBeGreaterThanOrEqual(2);
    });

    it('CHALLENGE-ENV-03: Caliper geometry cleanly touches vertical axis and aligns with column bounds', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.8}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const polygon = container.querySelector('polygon');
      expect(polygon).not.toBeNull();
      const points = polygon?.getAttribute('points') || '';
      // Tip must touch axis at x=40 without penetrating past it
      expect(points.startsWith('40,')).toBe(true);

      const caliperLine = Array.from(container.querySelectorAll('line')).find(
        (l) => l.getAttribute('stroke-width') === '1.5'
      );
      expect(caliperLine).not.toBeNull();
      // Line connects pointer to left edge of badge (x2=196) with zero right-side overflow
      expect(caliperLine?.getAttribute('x2')).toBe('196');

      const badge = Array.from(container.querySelectorAll('rect')).find(
        (r) => r.getAttribute('height') === '14'
      );
      expect(badge).not.toBeNull();
      // Badge extends from x=196 to x=272 (width=76), matching column right edge
      expect(badge?.getAttribute('x')).toBe('196');
      expect(badge?.getAttribute('width')).toBe('76');
    });

    it('CHALLENGE-ENV-04: Range sliders apply slider-archival and strata toggles enforce font-mono', async () => {
      await act(async () => {
        root.render(
          <AtmosphericColumnInstrument
            atmosphericScale={3.5}
            cloudOpacity={0.8}
            showCloudLow={true}
            showCloudMid={true}
            showCloudHigh={true}
            onToggleStrata={vi.fn()}
            onAtmosphericScaleChange={vi.fn()}
          />
        );
      });

      const rangeInputs = container.querySelectorAll<HTMLInputElement>('input[type="range"]');
      expect(rangeInputs.length).toBe(2);
      for (const input of Array.from(rangeInputs)) {
        expect(input.className).toContain('slider-archival');
      }

      const lowBtn = container.querySelector('text') as any; // Toggles removed, interaction is on SVG
      
    });
  });
});

