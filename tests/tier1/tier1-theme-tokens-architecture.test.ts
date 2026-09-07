import { describe, it, expect, beforeEach } from 'vitest';
import {
  ThemeManager,
  DARK_CYBER_THEME,
  LIGHT_MONOCHROME_THEME,
  PRUSSIAN_CYANOTYPE_THEME,
  DARK_CYBER_UI_TOKENS,
  LIGHT_MONOCHROME_UI_TOKENS,
  PRUSSIAN_CYANOTYPE_UI_TOKENS,
  UIThemeTokens,
} from '../../src/core/themes';

describe('Bite 1: Theme Token Architecture & Palette Expansion', () => {
  let themeMgr: ThemeManager;

  beforeEach(() => {
    themeMgr = ThemeManager.getInstance(0);
    themeMgr.setMode(0);
  });

  it('verifies UI tokens schema completeness across all three themes', () => {
    const requiredStringKeys: (keyof Omit<UIThemeTokens, 'directionA' | 'directionB' | 'directionC'>)[] = [
      'textPrimary',
      'textSecondary',
      'textMuted',
      'textAccent',
      'textInverse',
      'panelBg',
      'panelBorder',
      'panelHeaderBorder',
      'cardBg',
      'cardBorder',
      'neatlineBorder',
      'neatlineAccent',
      'controlBg',
      'controlBorder',
      'controlText',
      'controlHoverBg',
      'controlHoverText',
      'controlHoverBorder',
      'controlActiveBg',
      'controlActiveBorder',
      'controlActiveText',
      'controlActiveRing',
      'switchTrackBg',
      'switchTrackBorder',
      'switchTrackActiveBg',
      'switchTrackActiveBorder',
      'switchThumbBg',
      'switchThumbBorder',
      'switchThumbText',
      'switchThumbActiveBg',
      'switchThumbActiveBorder',
      'switchThumbActiveText',
      'knurlRidge',
      'sliderTrackBg',
      'sliderTrackFill',
      'sliderThumbBg',
      'sliderThumbBorder',
      'sliderTickColor',
      'stepperBtnBg',
      'stepperBtnBorder',
      'stepperBtnText',
      'stepperBtnHoverBg',
      'reticlePipActive',
      'reticleRingActive',
      'pulseIndicator',
      'fontCartouche',
      'fontTelemetry',
      'fontBody',
      'cartoucheTracking',
      'cartoucheTransform',
    ];

    const themes = [
      { name: 'Dark Cyber', tokens: DARK_CYBER_UI_TOKENS },
      { name: 'Cream Rag', tokens: LIGHT_MONOCHROME_UI_TOKENS },
      { name: 'Prussian Cyanotype', tokens: PRUSSIAN_CYANOTYPE_UI_TOKENS },
    ];

    for (const { name, tokens } of themes) {
      for (const key of requiredStringKeys) {
        expect(tokens[key], `${name} token ${key} must be defined and non-empty`).toBeTruthy();
        expect(typeof tokens[key]).toBe('string');
      }

      for (const dir of ['directionA', 'directionB', 'directionC'] as const) {
        expect(tokens[dir].bg, `${name} ${dir}.bg must be defined`).toBeTruthy();
        expect(tokens[dir].border, `${name} ${dir}.border must be defined`).toBeTruthy();
        expect(tokens[dir].text, `${name} ${dir}.text must be defined`).toBeTruthy();
        expect(tokens[dir].ring, `${name} ${dir}.ring must be defined`).toBeTruthy();
      }
    }
  });

  it('verifies medium-specific mineral pigments and avoids neon bleed in Cream theme', () => {
    // Theme 1 Cream Rag must use organic mineral tones, not neon cyan/blue
    expect(LIGHT_MONOCHROME_UI_TOKENS.textAccent).toBe('#8C4820'); // Copper / terracotta
    expect(LIGHT_MONOCHROME_UI_TOKENS.directionB.bg).toBe('#77998B'); // Alpine Celadon (not neon cyan)
    expect(LIGHT_MONOCHROME_UI_TOKENS.directionB.bg).not.toBe('#06B6D4');
    expect(LIGHT_MONOCHROME_UI_TOKENS.directionC.bg).toBe('#9E6D50'); // Umber (not sky blue)

    // Theme 0 Dark Cyber must use Marie Tharp antique brass
    expect(DARK_CYBER_UI_TOKENS.textAccent).toBe('#C5A059');
    expect(DARK_CYBER_UI_TOKENS.sliderThumbBg).toBe('#C5A059');

    // Theme 2 Prussian Cyanotype must use blueprint indigo & cerulean
    expect(PRUSSIAN_CYANOTYPE_UI_TOKENS.textPrimary).toBe('#E8EDF2');
    expect(PRUSSIAN_CYANOTYPE_UI_TOKENS.panelBg).toContain('18, 32, 48');
  });

  it('verifies ThemeManager returns active ui tokens when switching modes', () => {
    expect(themeMgr.getPalette().ui.textAccent).toBe('#C5A059');

    themeMgr.setMode(1);
    expect(themeMgr.getPalette().ui.textAccent).toBe('#8C4820');
    expect(themeMgr.getPalette().ui.textPrimary).toBe('#2B241A');

    themeMgr.setMediumId('cyanotype');
    expect(themeMgr.getPalette().mode).toBe(2);
    expect(themeMgr.getPalette().ui.textPrimary).toBe('#E8EDF2');
    expect(themeMgr.getPalette().ui.panelBorder).toBe('#263C54');
  });

  it('verifies applyCSSVariables injects expected CSS properties into target element', () => {
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

    themeMgr.setMode(1);
    themeMgr.applyCSSVariables(mockElement);

    expect((mockElement as any).attributes['data-theme']).toBe('cream');
    expect(mockStyle['--theme-text-primary']).toBe('#2B241A');
    expect(mockStyle['--theme-text-accent']).toBe('#8C4820');
    expect(mockStyle['--theme-control-active-bg']).toBe('#2B241A');
    expect(mockStyle['--theme-slider-thumb-bg']).toBe('#8C4820');
    expect(mockStyle['--theme-direction-b-bg']).toBe('#77998B');
    expect(mockStyle['--theme-font-cartouche']).toContain('Cinzel');
    expect(mockStyle['--theme-tracking-cartouche']).toBe('0.10em');
  });

  it('verifies backward compatibility with existing 3D shader uniforms', () => {
    const palette = themeMgr.getPalette();
    expect(palette.viewportBackground.hex).toBe('#090B10');
    expect(palette.geographicCoastlines.hex).toBe('#EAE6DE');
    expect(palette.structuralOceanNodes.hex).toBe('#1E2633');
    expect(palette.geographicWireframe.hex).toBe('#596B85');
    expect(palette.structuralWireframe.hex).toBe('#242E3D');
  });
});
