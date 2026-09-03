import { EngineStateHook } from '../hooks/useEngineState';

export interface IndicatrixEngineDevTools {
  getState: () => any;
  setAlpha: (alpha: number) => void;
  setMode: (mode: any) => void;
  setLayerMode: (layerMode: any) => void;
  setResolution: (res: any) => void;
  setBackend: (backend: any) => void;
  setTheme: (theme: any) => void;
  setShowVectors: (show: boolean) => void;
  setCursorPhysicsEnabled: (enabled: boolean) => void;
}

declare global {
  interface Window {
    __INDICATRIX_ENGINE__?: IndicatrixEngineDevTools;
    setAlpha?: (alpha: number) => void;
    setMode?: (mode: any) => void;
    setLayerMode?: (layerMode: any) => void;
    setResolution?: (res: any) => void;
    setBackend?: (backend: any) => void;
    setTheme?: (theme: any) => void;
    theme?: number;
    setShowVectors?: (show: boolean) => void;
    setCursorPhysicsEnabled?: (enabled: boolean) => void;
    backend?: string;
  }
}

export function registerDevToolsAPI(state: EngineStateHook): void {
  if (typeof window === 'undefined') return;

  const devTools: IndicatrixEngineDevTools = {
    getState: () => ({
      alpha: state.alpha,
      mode: state.mode,
      layerMode: state.layerMode,
      backend: state.backend,
      theme: state.theme,
      resolution: state.resolution,
      activeOverlay: state.activeOverlay,
      showVectors: state.showVectors,
      cursorPhysicsEnabled: state.cursorPhysicsEnabled,
    }),
    setAlpha: state.setAlpha,
    setMode: state.setMode,
    setLayerMode: state.setLayerMode,
    setResolution: state.setResolution,
    setBackend: state.setBackend,
    setTheme: state.setTheme,
    setShowVectors: state.setShowVectors,
    setCursorPhysicsEnabled: state.setCursorPhysicsEnabled,
  };

  window.__INDICATRIX_ENGINE__ = devTools;

  // Backwards compatible aliases
  window.setAlpha = state.setAlpha;
  window.setMode = state.setMode;
  window.setLayerMode = state.setLayerMode;
  window.setResolution = state.setResolution;
  window.setBackend = state.setBackend;
  window.setTheme = state.setTheme;
  window.theme = state.theme;
  window.setShowVectors = state.setShowVectors;
  window.setCursorPhysicsEnabled = state.setCursorPhysicsEnabled;
  window.backend = state.backend;
}
