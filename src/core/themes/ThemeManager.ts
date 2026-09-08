/**
 * Indicatrix Engine — Theme Manager & Color Palette Standard Enforcement
 * 
 * Enforces Dark Cyber (Theme 0) and Light Monochrome (Theme 1) color palettes
 * with listener subscription pattern and theme configuration getters.
 * Conforms strictly to design-language.md Section 1.2.
 */

export type ThemeMode = 0 | 1 | 2; // 0 = Marie Tharp (Dark Abyssal), 1 = Cream Rag Paper (Archival Light), 2 = Prussian Cyanotype (Blueprint)
export type ArchivalMediumId = 'tharp' | 'cream' | 'cyanotype';

export interface ElementThemeSpec {
  hex: string;
  rgb: [number, number, number]; // Normalized float [0.0, 1.0]
  alpha: number;
}

export interface DirectionStyleSpec {
  bg: string;
  border: string;
  text: string;
  ring: string;
}

export interface UIThemeTokens {
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textAccent: string;
  textInverse: string;

  // Surfaces & Panels
  panelBg: string;
  panelBorder: string;
  panelHeaderBorder: string;
  cardBg: string;
  cardBorder: string;
  cardBorderHover: string;
  neatlineBorder: string;
  neatlineAccent: string;

  // Buttons & Controls
  controlBg: string;
  controlBorder: string;
  controlText: string;
  controlHoverBg: string;
  controlHoverText: string;
  controlHoverBorder: string;
  controlActiveBg: string;
  controlActiveBorder: string;
  controlActiveText: string;
  controlActiveRing: string;

  // Semantic Mineral Status Tokens
  statusSage: string;
  statusSlate: string;
  statusAmber: string;

  // Switches & Knurled Toggles
  switchTrackBg: string;
  switchTrackBorder: string;
  switchTrackActiveBg: string;
  switchTrackActiveBorder: string;
  switchThumbBg: string;
  switchThumbBorder: string;
  switchThumbText: string;
  switchThumbActiveBg: string;
  switchThumbActiveBorder: string;
  switchThumbActiveText: string;
  knurlRidge: string;

  // Sliders & Verniers
  sliderTrackBg: string;
  sliderTrackFill: string;
  sliderThumbBg: string;
  sliderThumbBorder: string;
  sliderTickColor: string;
  stepperBtnBg: string;
  stepperBtnBorder: string;
  stepperBtnText: string;
  stepperBtnHoverBg: string;

  // Direction Accents (A: Relief, B: Depth, C: Orbital)
  directionA: DirectionStyleSpec;
  directionB: DirectionStyleSpec;
  directionC: DirectionStyleSpec;

  // Indicators & Optical Reticle
  reticlePipActive: string;
  reticleRingActive: string;
  pulseIndicator: string;

  // Typography Hierarchy & Thematic Personality
  fontCartouche: string;
  fontTelemetry: string;
  fontBody: string;
  cartoucheTracking: string;
  cartoucheTransform: string;
}

export interface ThemePalette {
  name: string;
  mode: ThemeMode;
  mediumId: ArchivalMediumId;
  viewportBackground: ElementThemeSpec;
  hudSurface: ElementThemeSpec;
  hudBorder: ElementThemeSpec;
  geographicCoastlines: ElementThemeSpec;
  structuralOceanNodes: ElementThemeSpec;
  geographicWireframe: ElementThemeSpec;
  structuralWireframe: ElementThemeSpec;
  ui: UIThemeTokens;
  activePigment?: { name: string; hex: string; depth: string } | null;
  isolatedStratum?: number | null;
}

export const DARK_CYBER_UI_TOKENS: UIThemeTokens = {
  textPrimary: '#F0EDE6',
  textSecondary: '#A2998A',
  textMuted: '#686257',
  textAccent: '#C5A059',
  textInverse: '#0C1219',

  panelBg: 'rgba(15, 22, 31, 0.90)',
  panelBorder: '#333E4D',
  panelHeaderBorder: 'rgba(255, 255, 255, 0.10)',
  cardBg: 'rgba(16, 23, 33, 0.70)',
  cardBorder: 'rgba(51, 62, 77, 0.80)',
  cardBorderHover: '#415164',
  neatlineBorder: 'rgba(122, 111, 94, 0.80)',
  neatlineAccent: '#C5A059',

  controlBg: 'rgba(27, 43, 58, 0.60)',
  controlBorder: '#333E4D',
  controlText: '#A2998A',
  controlHoverBg: '#22384A',
  controlHoverText: '#F0EDE6',
  controlHoverBorder: '#3B788A',
  controlActiveBg: '#22384A',
  controlActiveBorder: '#3B788A',
  controlActiveText: '#F0EDE6',
  controlActiveRing: 'rgba(197, 160, 89, 0.40)',

  statusSage: '#34D399',
  statusSlate: '#4FD1C5',
  statusAmber: '#F59E0B',

  switchTrackBg: 'rgba(10, 17, 26, 0.80)',
  switchTrackBorder: 'rgba(255, 255, 255, 0.15)',
  switchTrackActiveBg: '#1A3848',
  switchTrackActiveBorder: '#3B788A',
  switchThumbBg: '#4A5568',
  switchThumbBorder: '#2D3748',
  switchThumbText: '#A0AEC0',
  switchThumbActiveBg: '#C5A059',
  switchThumbActiveBorder: '#E2C37E',
  switchThumbActiveText: '#0C1219',
  knurlRidge: 'currentColor',

  sliderTrackBg: 'rgba(140, 150, 165, 0.25)',
  sliderTrackFill: '#C5A059',
  sliderThumbBg: '#C5A059',
  sliderThumbBorder: '#7C6230',
  sliderTickColor: 'rgba(240, 237, 230, 0.25)',
  stepperBtnBg: 'rgba(255, 255, 255, 0.05)',
  stepperBtnBorder: 'rgba(255, 255, 255, 0.15)',
  stepperBtnText: '#C5A059',
  stepperBtnHoverBg: 'rgba(255, 255, 255, 0.12)',

  directionA: { bg: '#1B2B3A', border: '#3B788A', text: '#F0EDE6', ring: 'rgba(59, 120, 138, 0.5)' },
  directionB: { bg: '#102A38', border: '#3B8B9B', text: '#8CE2F2', ring: 'rgba(59, 139, 155, 0.5)' },
  directionC: { bg: '#122538', border: '#3B6B9B', text: '#8CB8F2', ring: 'rgba(59, 107, 155, 0.5)' },

  reticlePipActive: '#C5A059',
  reticleRingActive: '#3B788A',
  pulseIndicator: '#C5A059',

  fontCartouche: "'Cinzel', 'Times New Roman', serif",
  fontTelemetry: "'IBM Plex Mono', 'Courier New', monospace",
  fontBody: "'Inter', system-ui, sans-serif",
  cartoucheTracking: '0.12em',
  cartoucheTransform: 'uppercase',
};

export const DARK_CYBER_THEME: ThemePalette = {
  name: 'Marie Tharp Physiographic (Dark Cyber / Abyssal Obsidian)',
  mode: 0,
  mediumId: 'tharp',
  viewportBackground: {
    hex: '#090B10',
    rgb: [9 / 255, 11 / 255, 16 / 255],
    alpha: 1.0,
  },
  hudSurface: {
    hex: '#0F121A',
    rgb: [15 / 255, 18 / 255, 26 / 255],
    alpha: 0.85,
  },
  hudBorder: {
    hex: '#FFFFFF',
    rgb: [1.0, 1.0, 1.0],
    alpha: 0.1,
  },
  geographicCoastlines: {
    hex: '#EAE6DE',
    rgb: [234 / 255, 230 / 255, 222 / 255],
    alpha: 0.95,
  },
  structuralOceanNodes: {
    hex: '#1E2633',
    rgb: [30 / 255, 38 / 255, 51 / 255],
    alpha: 0.03,
  },
  geographicWireframe: {
    hex: '#596B85',
    rgb: [89 / 255, 107 / 255, 133 / 255],
    alpha: 0.45,
  },
  structuralWireframe: {
    hex: '#242E3D',
    rgb: [36 / 255, 46 / 255, 61 / 255],
    alpha: 0.025,
  },
  ui: DARK_CYBER_UI_TOKENS,
};

export const MARIE_THARP_THEME = DARK_CYBER_THEME;

export const LIGHT_MONOCHROME_UI_TOKENS: UIThemeTokens = {
  textPrimary: '#2B241A',
  textSecondary: '#7D715D',
  textMuted: '#7A6E5A',
  textAccent: '#8C4820',
  textInverse: '#FDFCF9',

  panelBg: 'rgba(252, 249, 242, 0.94)',
  panelBorder: '#CFC4AF',
  panelHeaderBorder: 'rgba(184, 173, 152, 0.60)',
  cardBg: 'rgba(244, 237, 224, 0.85)',
  cardBorder: '#D8CFBC',
  cardBorderHover: '#B8AD98',
  neatlineBorder: '#B8AD98',
  neatlineAccent: '#8C4820',

  controlBg: 'rgba(244, 238, 225, 0.70)',
  controlBorder: '#D8CFBC',
  controlText: '#5A4F3E',
  controlHoverBg: '#EDE3D4',
  controlHoverText: '#2B241A',
  controlHoverBorder: '#B8AD98',
  controlActiveBg: '#2B241A',
  controlActiveBorder: '#8C4820',
  controlActiveText: '#FDFCF9',
  controlActiveRing: 'rgba(140, 72, 32, 0.40)',

  statusSage: '#1B432B',
  statusSlate: '#1A4457',
  statusAmber: '#7D4700',

  switchTrackBg: '#E2D7C3',
  switchTrackBorder: '#C8B9A6',
  switchTrackActiveBg: '#C8B9A6',
  switchTrackActiveBorder: '#8C4820',
  switchThumbBg: '#FDFCF9',
  switchThumbBorder: '#C8B9A6',
  switchThumbText: '#7D715D',
  switchThumbActiveBg: '#8C4820',
  switchThumbActiveBorder: '#5A2C10',
  switchThumbActiveText: '#FDFCF9',
  knurlRidge: 'currentColor',

  sliderTrackBg: 'rgba(184, 173, 152, 0.40)',
  sliderTrackFill: '#8C4820',
  sliderThumbBg: '#8C4820',
  sliderThumbBorder: '#5A2C10',
  sliderTickColor: 'rgba(43, 36, 26, 0.25)',
  stepperBtnBg: '#F4EEE1',
  stepperBtnBorder: '#D8CFBC',
  stepperBtnText: '#8C4820',
  stepperBtnHoverBg: '#EDE3D4',

  directionA: { bg: '#2B241A', border: '#2B241A', text: '#FDFCF9', ring: 'rgba(43, 36, 26, 0.4)' },
  directionB: { bg: '#77998B', border: '#587A6C', text: '#FDFCF9', ring: 'rgba(119, 153, 139, 0.4)' },
  directionC: { bg: '#9E6D50', border: '#7D4F35', text: '#FDFCF9', ring: 'rgba(158, 109, 80, 0.4)' },

  reticlePipActive: '#8C4820',
  reticleRingActive: '#8C4820',
  pulseIndicator: '#8C4820',

  fontCartouche: "'Cinzel', 'Cormorant Garamond', 'Times New Roman', serif",
  fontTelemetry: "'IBM Plex Mono', 'Courier New', monospace",
  fontBody: "'Inter', system-ui, sans-serif",
  cartoucheTracking: '0.10em',
  cartoucheTransform: 'uppercase',
};

export const LIGHT_MONOCHROME_THEME: ThemePalette = {
  name: 'Cream Rag Paper (Light Monochrome / Archival Parchment)',
  mode: 1,
  mediumId: 'cream',
  viewportBackground: {
    hex: '#F3ECE0',
    rgb: [243 / 255, 236 / 255, 224 / 255],
    alpha: 1.0,
  },
  hudSurface: {
    hex: '#FFFFFF',
    rgb: [1.0, 1.0, 1.0],
    alpha: 0.85,
  },
  hudBorder: {
    hex: '#E2E8F0',
    rgb: [226 / 255, 232 / 255, 240 / 255],
    alpha: 1.0,
  },
  geographicCoastlines: {
    hex: '#14171C',
    rgb: [20 / 255, 23 / 255, 28 / 255],
    alpha: 0.95,
  },
  structuralOceanNodes: {
    hex: '#D1D5DB',
    rgb: [209 / 255, 213 / 255, 219 / 255],
    alpha: 0.12,
  },
  geographicWireframe: {
    hex: '#A0A6B0',
    rgb: [160 / 255, 166 / 255, 176 / 255],
    alpha: 0.4,
  },
  structuralWireframe: {
    hex: '#DCDFE4',
    rgb: [220 / 255, 223 / 255, 228 / 255],
    alpha: 0.04,
  },
  ui: LIGHT_MONOCHROME_UI_TOKENS,
};

export const CREAM_RAG_THEME = LIGHT_MONOCHROME_THEME;

export const PRUSSIAN_CYANOTYPE_UI_TOKENS: UIThemeTokens = {
  textPrimary: '#E8EDF2',
  textSecondary: '#8EA4BD',
  textMuted: '#6B94BD',
  textAccent: '#A5D5FF',
  textInverse: '#0C1520',

  panelBg: 'rgba(18, 32, 48, 0.92)',
  panelBorder: '#263C54',
  panelHeaderBorder: 'rgba(79, 121, 163, 0.40)',
  cardBg: 'rgba(15, 28, 43, 0.85)',
  cardBorder: '#263C54',
  cardBorderHover: '#3B597A',
  neatlineBorder: 'rgba(59, 89, 122, 0.70)',
  neatlineAccent: '#A5D5FF',

  controlBg: 'rgba(16, 28, 43, 0.65)',
  controlBorder: '#263C54',
  controlText: '#8EA4BD',
  controlHoverBg: '#152A40',
  controlHoverText: '#E8EDF2',
  controlHoverBorder: '#4F79A3',
  controlActiveBg: '#203A57',
  controlActiveBorder: '#4F79A3',
  controlActiveText: '#E8EDF2',
  controlActiveRing: 'rgba(165, 213, 255, 0.40)',

  statusSage: '#4FA3E3',
  statusSlate: '#6B94BD',
  statusAmber: '#E2C37E',

  switchTrackBg: '#0D1724',
  switchTrackBorder: '#263C54',
  switchTrackActiveBg: '#203A57',
  switchTrackActiveBorder: '#4F79A3',
  switchThumbBg: '#1A2F47',
  switchThumbBorder: '#263C54',
  switchThumbText: '#8EA4BD',
  switchThumbActiveBg: '#E8EDF2',
  switchThumbActiveBorder: '#4F79A3',
  switchThumbActiveText: '#0C1520',
  knurlRidge: 'currentColor',

  sliderTrackBg: 'rgba(79, 121, 163, 0.30)',
  sliderTrackFill: '#4F79A3',
  sliderThumbBg: '#E8EDF2',
  sliderThumbBorder: '#4F79A3',
  sliderTickColor: 'rgba(232, 237, 242, 0.25)',
  stepperBtnBg: '#101C2B',
  stepperBtnBorder: '#263C54',
  stepperBtnText: '#A5D5FF',
  stepperBtnHoverBg: '#162B42',

  directionA: { bg: '#203A57', border: '#4F79A3', text: '#E8EDF2', ring: 'rgba(79, 121, 163, 0.5)' },
  directionB: { bg: '#162B42', border: '#386B99', text: '#A5D5FF', ring: 'rgba(56, 107, 153, 0.5)' },
  directionC: { bg: '#102236', border: '#294C6F', text: '#8EC5FC', ring: 'rgba(41, 76, 111, 0.5)' },

  reticlePipActive: '#A5D5FF',
  reticleRingActive: '#4F79A3',
  pulseIndicator: '#4F79A3',

  fontCartouche: "'Cinzel', 'IBM Plex Mono', monospace",
  fontTelemetry: "'IBM Plex Mono', 'Courier New', monospace",
  fontBody: "'Inter', system-ui, sans-serif",
  cartoucheTracking: '0.16em',
  cartoucheTransform: 'uppercase',
};

export const PRUSSIAN_CYANOTYPE_THEME: ThemePalette = {
  name: 'Prussian Cyanotype (Ferroprussiate Blueprint & Drafting Linen)',
  mode: 2,
  mediumId: 'cyanotype',
  viewportBackground: {
    hex: '#101C2B',
    rgb: [16 / 255, 28 / 255, 43 / 255],
    alpha: 1.0,
  },
  hudSurface: {
    hex: '#122030',
    rgb: [18 / 255, 32 / 255, 48 / 255],
    alpha: 0.90,
  },
  hudBorder: {
    hex: '#3B597A',
    rgb: [59 / 255, 89 / 255, 122 / 255],
    alpha: 0.65,
  },
  geographicCoastlines: {
    hex: '#FFFFFF',
    rgb: [1.0, 1.0, 1.0],
    alpha: 0.98,
  },
  structuralOceanNodes: {
    hex: '#294D75',
    rgb: [41 / 255, 77 / 255, 117 / 255],
    alpha: 0.15,
  },
  geographicWireframe: {
    hex: '#8EA4BD',
    rgb: [142 / 255, 164 / 255, 189 / 255],
    alpha: 0.40,
  },
  structuralWireframe: {
    hex: '#31567D',
    rgb: [49 / 255, 86 / 255, 125 / 255],
    alpha: 0.05,
  },
  ui: PRUSSIAN_CYANOTYPE_UI_TOKENS,
};

export type ThemeChangeListener = (theme: ThemePalette) => void;

export class ThemeManager {
  private static instance: ThemeManager;
  private currentMode: ThemeMode = 0;
  private listeners: Set<ThemeChangeListener> = new Set();
  private isolatedStratum: number | null = null;
  private activePigment: { name: string; hex: string; depth: string } | null = null;

  private constructor(initialMode: ThemeMode = 0) {
    this.currentMode = initialMode;
  }

  public static getInstance(initialMode: ThemeMode = 0): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager(initialMode);
      ThemeManager.instance.applyCSSVariables();
    }
    return ThemeManager.instance;
  }

  public getMode(): ThemeMode {
    return this.currentMode;
  }

  public getMediumId(): ArchivalMediumId {
    if (this.currentMode === 2) return 'cyanotype';
    if (this.currentMode === 1) return 'cream';
    return 'tharp';
  }

  public getPalette(): ThemePalette {
    if (this.currentMode === 2) return PRUSSIAN_CYANOTYPE_THEME;
    if (this.currentMode === 1) return LIGHT_MONOCHROME_THEME;
    return DARK_CYBER_THEME;
  }

  public getIsolatedStratum(): number | null {
    return this.isolatedStratum;
  }

  public getActivePigment(): { name: string; hex: string; depth: string } | null {
    return this.activePigment;
  }

  public setIsolatedStratum(
    stratum: number | null,
    swatch?: { name: string; hex: string; depth: string } | null
  ): void {
    this.isolatedStratum = stratum;
    this.activePigment = swatch ?? null;
    if (typeof document !== 'undefined' && document.documentElement) {
      if (swatch) {
        document.documentElement.style.setProperty('--theme-active-pigment', swatch.hex);
        document.documentElement.style.setProperty('--theme-text-accent', swatch.hex);
      } else {
        const defaultAccent = this.getPalette().ui.textAccent;
        document.documentElement.style.removeProperty('--theme-active-pigment');
        document.documentElement.style.setProperty('--theme-text-accent', defaultAccent);
      }
    }
    this.notifyListeners();
  }

  public setMode(mode: ThemeMode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.isolatedStratum = null;
      this.activePigment = null;
      this.notifyListeners();
    }
  }

  public setMediumId(id: ArchivalMediumId): void {
    const modeMap: Record<ArchivalMediumId, ThemeMode> = {
      tharp: 0,
      cream: 1,
      cyanotype: 2,
    };
    this.setMode(modeMap[id]);
  }

  public toggleTheme(): ThemeMode {
    const nextMode: ThemeMode = ((this.currentMode + 1) % 3) as ThemeMode;
    this.setMode(nextMode);
    return nextMode;
  }

  public subscribe(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    // Call immediately with current state
    listener(this.getPalette());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public applyCSSVariables(rootElement?: HTMLElement): void {
    if (typeof document === 'undefined') return;
    const target = rootElement || document.documentElement;
    if (!target || !target.style) return;

    const palette = this.getPalette();
    const ui = palette.ui;

    target.setAttribute('data-theme', palette.mediumId);

    target.style.setProperty('--theme-text-primary', ui.textPrimary);
    target.style.setProperty('--theme-text-secondary', ui.textSecondary);
    target.style.setProperty('--theme-text-muted', ui.textMuted);
    if (this.activePigment) {
      target.style.setProperty('--theme-active-pigment', this.activePigment.hex);
      target.style.setProperty('--theme-text-accent', this.activePigment.hex);
    } else {
      if (typeof target.style.removeProperty === 'function') {
        target.style.removeProperty('--theme-active-pigment');
      }
      target.style.setProperty('--theme-text-accent', ui.textAccent);
    }
    target.style.setProperty('--theme-text-inverse', ui.textInverse);

    target.style.setProperty('--theme-panel-bg', ui.panelBg);
    target.style.setProperty('--theme-panel-border', ui.panelBorder);
    target.style.setProperty('--theme-panel-header-border', ui.panelHeaderBorder);
    target.style.setProperty('--theme-card-bg', ui.cardBg);
    target.style.setProperty('--theme-card-border', ui.cardBorder);
    target.style.setProperty('--theme-card-border-hover', ui.cardBorderHover);
    target.style.setProperty('--theme-neatline-border', ui.neatlineBorder);
    target.style.setProperty('--theme-neatline-accent', ui.neatlineAccent);

    target.style.setProperty('--theme-control-bg', ui.controlBg);
    target.style.setProperty('--theme-control-border', ui.controlBorder);
    target.style.setProperty('--theme-control-text', ui.controlText);
    target.style.setProperty('--theme-control-hover-bg', ui.controlHoverBg);
    target.style.setProperty('--theme-control-hover-text', ui.controlHoverText);
    target.style.setProperty('--theme-control-hover-border', ui.controlHoverBorder);
    target.style.setProperty('--theme-control-active-bg', ui.controlActiveBg);
    target.style.setProperty('--theme-control-active-border', ui.controlActiveBorder);
    target.style.setProperty('--theme-control-active-text', ui.controlActiveText);
    target.style.setProperty('--theme-control-active-ring', ui.controlActiveRing);

    target.style.setProperty('--theme-status-sage', ui.statusSage);
    target.style.setProperty('--theme-status-slate', ui.statusSlate);
    target.style.setProperty('--theme-status-amber', ui.statusAmber);

    target.style.setProperty('--theme-switch-track-bg', ui.switchTrackBg);
    target.style.setProperty('--theme-switch-track-border', ui.switchTrackBorder);
    target.style.setProperty('--theme-switch-track-active-bg', ui.switchTrackActiveBg);
    target.style.setProperty('--theme-switch-track-active-border', ui.switchTrackActiveBorder);
    target.style.setProperty('--theme-switch-thumb-bg', ui.switchThumbBg);
    target.style.setProperty('--theme-switch-thumb-border', ui.switchThumbBorder);
    target.style.setProperty('--theme-switch-thumb-text', ui.switchThumbText);
    target.style.setProperty('--theme-switch-thumb-active-bg', ui.switchThumbActiveBg);
    target.style.setProperty('--theme-switch-thumb-active-border', ui.switchThumbActiveBorder);
    target.style.setProperty('--theme-switch-thumb-active-text', ui.switchThumbActiveText);
    target.style.setProperty('--theme-knurl-ridge', ui.knurlRidge);

    target.style.setProperty('--theme-slider-track-bg', ui.sliderTrackBg);
    target.style.setProperty('--theme-slider-track-fill', ui.sliderTrackFill);
    target.style.setProperty('--theme-slider-thumb-bg', ui.sliderThumbBg);
    target.style.setProperty('--theme-slider-thumb-border', ui.sliderThumbBorder);
    target.style.setProperty('--theme-slider-tick', ui.sliderTickColor);
    target.style.setProperty('--theme-stepper-btn-bg', ui.stepperBtnBg);
    target.style.setProperty('--theme-stepper-btn-border', ui.stepperBtnBorder);
    target.style.setProperty('--theme-stepper-btn-text', ui.stepperBtnText);
    target.style.setProperty('--theme-stepper-btn-hover-bg', ui.stepperBtnHoverBg);

    target.style.setProperty('--theme-direction-a-bg', ui.directionA.bg);
    target.style.setProperty('--theme-direction-a-border', ui.directionA.border);
    target.style.setProperty('--theme-direction-a-text', ui.directionA.text);
    target.style.setProperty('--theme-direction-a-ring', ui.directionA.ring);

    target.style.setProperty('--theme-direction-b-bg', ui.directionB.bg);
    target.style.setProperty('--theme-direction-b-border', ui.directionB.border);
    target.style.setProperty('--theme-direction-b-text', ui.directionB.text);
    target.style.setProperty('--theme-direction-b-ring', ui.directionB.ring);

    target.style.setProperty('--theme-direction-c-bg', ui.directionC.bg);
    target.style.setProperty('--theme-direction-c-border', ui.directionC.border);
    target.style.setProperty('--theme-direction-c-text', ui.directionC.text);
    target.style.setProperty('--theme-direction-c-ring', ui.directionC.ring);

    target.style.setProperty('--theme-reticle-pip-active', ui.reticlePipActive);
    target.style.setProperty('--theme-reticle-ring-active', ui.reticleRingActive);
    target.style.setProperty('--theme-pulse-indicator', ui.pulseIndicator);

    target.style.setProperty('--theme-font-cartouche', ui.fontCartouche);
    target.style.setProperty('--theme-font-telemetry', ui.fontTelemetry);
    target.style.setProperty('--theme-font-body', ui.fontBody);
    target.style.setProperty('--theme-tracking-cartouche', ui.cartoucheTracking);
    target.style.setProperty('--theme-transform-cartouche', ui.cartoucheTransform);
  }

  private notifyListeners(): void {
    const palette = this.getPalette();
    this.applyCSSVariables();
    this.listeners.forEach((listener) => listener(palette));
  }
}
