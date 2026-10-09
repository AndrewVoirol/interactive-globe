import { EngineStateHook } from '../hooks/useEngineState';
import { runComprehensiveProfilingSuite } from '../webgpu/profiling/runComprehensiveProfilingSuite';

export interface ProvenanceTelemetryData {
  baseDataset: string;
  insetDataset: string;
  verticalDatum: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  groundElevationMeters: number;
  waterDepthMeters: number;
}

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
  getActiveRegionalDEM?: () => string | null;
  getProvenanceTelemetry?: () => ProvenanceTelemetryData;
  updateProvenanceTelemetry?: (data: Partial<ProvenanceTelemetryData>) => ProvenanceTelemetryData;
  subscribeProvenanceTelemetry?: (cb: (data: ProvenanceTelemetryData) => void) => () => void;
}

export interface IndicatrixCameraDevTools {
  snapHorizonCrossSection?: (altitude?: number) => void;
  setObliqueView?: (lonDeg: number, latDeg: number, altitudeRadius: number, pitchDeg: number, headingDeg: number) => void;
  lookAtCoordinates?: (lonDeg: number, latDeg: number, zoomRadius?: number, target?: [number, number, number]) => void;
  easeToCoordinates?: (lonDeg: number, latDeg: number, zoomRadius?: number, durationSec?: number) => void;
  [key: string]: any;
}

export interface IndicatrixWeatherDiagnostics {
  prognosticModel?: string;
  prognosticVariable?: string;
  timelineMinutes?: number;
  weatherNext?: any;
  radar?: any;
  engine?: any;
  [key: string]: any;
}

declare global {
  interface Window {
    __INDICATRIX_ENGINE__?: IndicatrixEngineDevTools;
    __INDICATRIX_PROVENANCE_TELEMETRY__?: ProvenanceTelemetryData;
    __INDICATRIX_WEBGPU_ENGINE__?: any;
    __ENGINE?: any;
    __WEBGPU_ENGINE__?: any;
    __WHIMSICAL_MANAGER__?: any;
    __MANIFOLD_PINCH_CONTROLLER__?: any;
    __INDICATRIX_WEATHERNEXT_DATA_SOURCE__?: any;
    __INDICATRIX_WEATHERNEXT_SOURCE__?: any;
    __INDICATRIX_WEATHERNEXT_RING_BUFFER__?: any;
    __INDICATRIX_LIVE_RADAR_DATA_SOURCE__?: any;
    __INDICATRIX_RADAR_RING_BUFFER__?: any;
    __INDICATRIX_WEATHER_DIAGNOSTICS__?: IndicatrixWeatherDiagnostics;
    __INDICATRIX_CAMERA__?: IndicatrixCameraDevTools;
    __INDICATRIX_CAMERA_OBJECT__?: any;
    __INDICATRIX_TRAJECTORY__?: any;
    __GO?: {
      loc1_synoptic: () => void;
      loc1_oblique: () => void;
      loc2_synoptic: () => void;
      loc2_oblique: () => void;
    };
    __INDICATRIX_CLOUD_STATE__?: any;
    __INDICATRIX_SET_CLOUD_OPTIONS__?: (opts: any) => void;
    __INDICATRIX_ANIM_ALPHA__?: number;
    __INDICATRIX_SET_ATMOSPHERIC_SCALE__?: (valOrFn: any) => void;
    __INDICATRIX_SET_SHADOW_INTENSITY__?: (valOrFn: any) => void;
    __INDICATRIX_SET_VERTICAL_SCALE_MODE__?: (valOrFn: any) => void;
    __INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__?: (valOrFn: any) => void;
    __INDICATRIX_SET_PLUVIAL_GAMMA__?: (valOrFn: any) => void;
    __INDICATRIX_SET_WEATHER_OPTICAL_MODE__?: (valOrFn: any) => void;
    __INDICATRIX_SET_TIMELINE_MINUTES__?: (valOrFn: any) => void;
    __INDICATRIX_SET_PROGNOSTIC_VARIABLE__?: (variable: string) => void;
    __INDICATRIX_SET_PROGNOSTIC_MODEL__?: (model: any) => void;
    __INDICATRIX_SET_THERMODYNAMIC_GATING__?: (enabled: boolean) => void;
    __INDICATRIX_SET_RADAR_INTENSITY_EXPONENT__?: (val: number) => void;
    __INDICATRIX_SET_RADAR_ADVECTION_ENABLED__?: (val: boolean) => void;
    __INDICATRIX_SET_RADAR_DECAY_RATE__?: (val: number) => void;
    __INDICATRIX_SET_RAIN_ATTENUATION__?: (val: number) => void;
    __INDICATRIX_SET_TERRAIN_SHADOWS__?: (enabled: boolean) => void;
    __INDICATRIX_LIVE_UNIFORMS__?: any;
    __INDICATRIX_LIVE_PROPS__?: any;
    __INDICATRIX_THEME__?: any;
    __INDICATRIX_NOISE_DEBUG__?: any;
    __INDICATRIX_WHIMSICAL__?: any;
    __INDICATRIX_PINCH__?: any;

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


export const DEFAULT_PROVENANCE_TELEMETRY: ProvenanceTelemetryData = {
  baseDataset: 'GEBCO 2024 / FABDEM Bare-Earth (15 arc-sec / 30m)',
  insetDataset: 'None (Global Topobathy)',
  verticalDatum: 'WGS84 Ellipsoidal / EGM2008 Geoid Corrected',
  latitude: 0,
  longitude: 0,
  altitudeMeters: 12742000,
  groundElevationMeters: 0,
  waterDepthMeters: 0,
};

type ProvenanceListener = (data: ProvenanceTelemetryData) => void;
const provenanceListeners = new Set<ProvenanceListener>();
let currentProvenanceData: ProvenanceTelemetryData = { ...DEFAULT_PROVENANCE_TELEMETRY };

export function updateProvenanceTelemetry(data: Partial<ProvenanceTelemetryData>): ProvenanceTelemetryData {
  currentProvenanceData = { ...currentProvenanceData, ...data };
  if (typeof window !== 'undefined') {
    (window as any).__INDICATRIX_PROVENANCE_TELEMETRY__ = currentProvenanceData;
  }
  for (const listener of provenanceListeners) {
    try {
      listener(currentProvenanceData);
    } catch (err) {
      console.warn('Error in provenance telemetry listener:', err);
    }
  }
  return currentProvenanceData;
}

export function getProvenanceTelemetry(): ProvenanceTelemetryData {
  return currentProvenanceData;
}

export function subscribeProvenanceTelemetry(listener: ProvenanceListener): () => void {
  provenanceListeners.add(listener);
  try {
    listener(currentProvenanceData);
  } catch {}
  return () => {
    provenanceListeners.delete(listener);
  };
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
    getProvenanceTelemetry,
    updateProvenanceTelemetry,
    subscribeProvenanceTelemetry,
  };

  window.__INDICATRIX_ENGINE__ = devTools;
  (window as any).__INDICATRIX_PROVENANCE_TELEMETRY__ = currentProvenanceData;

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
  window.setCdlodDiagnosticMode = state.setCdlodDiagnosticMode;
  window.backend = state.backend;
  (window as any).runComprehensiveProfilingSuite = runComprehensiveProfilingSuite;
}
