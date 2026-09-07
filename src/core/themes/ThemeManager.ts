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
}

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
};

export const MARIE_THARP_THEME = DARK_CYBER_THEME;

export const LIGHT_MONOCHROME_THEME: ThemePalette = {
  name: 'Cream Rag Paper (Light Monochrome / Archival Parchment)',
  mode: 1,
  mediumId: 'cream',
  viewportBackground: {
    hex: '#F8FAFC',
    rgb: [248 / 255, 250 / 255, 252 / 255],
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
};

export const CREAM_RAG_THEME = LIGHT_MONOCHROME_THEME;

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
};

export type ThemeChangeListener = (theme: ThemePalette) => void;

export class ThemeManager {
  private static instance: ThemeManager;
  private currentMode: ThemeMode = 0;
  private listeners: Set<ThemeChangeListener> = new Set();

  private constructor(initialMode: ThemeMode = 0) {
    this.currentMode = initialMode;
  }

  public static getInstance(initialMode: ThemeMode = 0): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager(initialMode);
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

  public setMode(mode: ThemeMode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
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

  private notifyListeners(): void {
    const palette = this.getPalette();
    this.listeners.forEach((listener) => listener(palette));
  }
}
