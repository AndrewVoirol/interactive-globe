/**
 * Indicatrix Engine — Theme Manager & Color Palette Standard Enforcement
 * 
 * Enforces Dark Cyber (Theme 0) and Light Monochrome (Theme 1) color palettes
 * with listener subscription pattern and theme configuration getters.
 * Conforms strictly to design-language.md Section 1.2.
 */

export type ThemeMode = 0 | 1; // 0 = Dark Cyber (Obsidian), 1 = Light Monochrome

export interface ElementThemeSpec {
  hex: string;
  rgb: [number, number, number]; // Normalized float [0.0, 1.0]
  alpha: number;
}

export interface ThemePalette {
  name: string;
  mode: ThemeMode;
  viewportBackground: ElementThemeSpec;
  hudSurface: ElementThemeSpec;
  hudBorder: ElementThemeSpec;
  geographicCoastlines: ElementThemeSpec;
  structuralOceanNodes: ElementThemeSpec;
  geographicWireframe: ElementThemeSpec;
  structuralWireframe: ElementThemeSpec;
}

export const DARK_CYBER_THEME: ThemePalette = {
  name: 'Dark Cyber (Obsidian & Celestial Platinum)',
  mode: 0,
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

export const LIGHT_MONOCHROME_THEME: ThemePalette = {
  name: 'Light Monochrome (Architectural Graphite & Archival Paper)',
  mode: 1,
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

  public getPalette(): ThemePalette {
    return this.currentMode === 1 ? LIGHT_MONOCHROME_THEME : DARK_CYBER_THEME;
  }

  public setMode(mode: ThemeMode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.notifyListeners();
    }
  }

  public toggleTheme(): ThemeMode {
    const nextMode: ThemeMode = this.currentMode === 0 ? 1 : 0;
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
