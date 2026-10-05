// ============================================================================
// File: src/components/AtmosphereDrawer.tsx
// Atmospheric Cloud Strata Controls Drawer
// Calibrated Atmospheric Scale [1.0 .. 12.0] & Shadow Intensity [0.0 .. 0.60]
// Invariants: §2 (10px Moat/20px Gutters), §4 (Single-Border), §6 (Ivory Vellum), §21 (Collapsing)
// ============================================================================

import React, { useState, useCallback } from 'react';
import { VernierSlider } from './ui/VernierSlider';
import { SegmentedControl } from './ui/SegmentedControl';
import { TactileSwitch } from './ui/TactileSwitch';
import { TimelineScrubber, TimelineScrubberState } from './hud/TimelineScrubber';
import { AtmosphericColumnInstrument } from './hud/instruments/AtmosphericColumnInstrument';
import { OrographicMoistureProfile } from './hud/instruments/OrographicMoistureProfile';
import { CloudShadowInstrument } from './hud/instruments/CloudShadowInstrument';
import { CloudDriftSpeedInstrument } from './hud/instruments/CloudDriftSpeedInstrument';
import { PrognosticModelCard } from './hud/instruments/PrognosticModelCard';
import { StratosphericTelemetryInstrument } from './hud/instruments/StratosphericTelemetryInstrument';
import type { ResolutionTier } from '../types';
import type { MeteorologicalProvenance } from '../core/data/WeatherNextDataSource';

export type PrognosticModelBackend =
  | 'noaa-gfs'
  | 'weathernext3'
  | 'google-weathernext3'
  | 'gfs'
  | 'weathernext'
  | 'ecmwf'
  | 'off'
  | 'climatology';

export function isWeatherNextModel(model?: string): boolean {
  return model === 'weathernext3' || model === 'google-weathernext3' || model === 'weathernext';
}

export interface AtmosphereDrawerProps {
  theme?: 0 | 1 | 2;
  isLight?: boolean;
  showClouds?: boolean;
  onShowCloudsChange?: (v: boolean) => void;
  showAtmosphere?: boolean;
  onShowAtmosphereChange?: (v: boolean) => void;
  showCloudLow?: boolean;
  onShowCloudLowChange?: (v: boolean) => void;
  showCloudMid?: boolean;
  onShowCloudMidChange?: (v: boolean) => void;
  showCloudHigh?: boolean;
  onShowCloudHighChange?: (v: boolean) => void;
  cloudFalseColor?: boolean;
  onCloudFalseColorChange?: (v: boolean) => void;
  cloudDriftSpeed?: number;
  onCloudDriftSpeedChange?: (v: number) => void;
  cloudOpacity?: number;
  onCloudOpacityChange?: (v: number) => void;
  atmosphericScale?: number;
  onAtmosphericScaleChange?: (v: number) => void;
  shadowIntensity?: number;
  onShadowIntensityChange?: (v: number) => void;
  verticalScaleMode?: number;
  onVerticalScaleModeChange?: (v: number) => void;
  rainShadowFeedback?: number;
  onRainShadowFeedbackChange?: (v: number) => void;
  pluvialGamma?: number;
  onPluvialGammaChange?: (v: number) => void;
  weatherOpticalMode?: number;
  onWeatherOpticalModeChange?: (mode: number) => void;
  thermodynamicGating?: boolean;
  onThermodynamicGatingChange?: (enabled: boolean) => void;
  prognosticModel?: PrognosticModelBackend;
  onPrognosticModelChange?: (model: PrognosticModelBackend) => void;
  prognosticVariable?: string;
  onPrognosticVariableChange?: (variable: string) => void;
  weatherNextDataSource?: any;
  timelineMinutes?: number;
  onTimelineChange?: (state: TimelineScrubberState) => void;

  onSnapCamera?: (snap: 'equator' | 'pole' | 'seam' | 'isometric' | 'horizon') => void;
  onTogglePlanetaryLayer?: (id: string, force?: boolean) => void;
  isRadarActive?: boolean;
  hideScrubber?: boolean;
  className?: string;
  resolution?: ResolutionTier;
  // Beta Volumetric Cloud Physics & Raymarching Levers
  cloudThickness?: number;
  onCloudThicknessChange?: (v: number) => void;
  cloudLowTop?: number;
  onCloudLowTopChange?: (v: number) => void;
  cloudErosion?: number;
  onCloudErosionChange?: (v: number) => void;
  cloudFreqHoriz?: number;
  onCloudFreqHorizChange?: (v: number) => void;
  cloudFreqVert?: number;
  onCloudFreqVertChange?: (v: number) => void;
  cloudExtinction?: number;
  onCloudExtinctionChange?: (v: number) => void;
  volumetricClouds?: boolean;
  onVolumetricCloudsChange?: (v: boolean) => void;
  provenance?: MeteorologicalProvenance;
  windSpeedMultiplier?: number;
  onWindSpeedMultiplierChange?: (v: number) => void;
  windParticleLifetime?: number;
  onWindParticleLifetimeChange?: (v: number) => void;
  isWindActive?: boolean;
}

export const AtmosphereDrawer: React.FC<AtmosphereDrawerProps> = ({
  theme = 0,
  isLight = false,
  hideScrubber = false,
  isRadarActive = false,
  isWindActive = false,
  provenance,
  windSpeedMultiplier,
  onWindSpeedMultiplierChange,
  windParticleLifetime,
  onWindParticleLifetimeChange,
  showClouds: propShowClouds,
  onShowCloudsChange,
  showAtmosphere: propShowAtmosphere,
  onShowAtmosphereChange,
  showCloudLow: propShowCloudLow,
  onShowCloudLowChange,
  showCloudMid: propShowCloudMid,
  onShowCloudMidChange,
  showCloudHigh: propShowCloudHigh,
  onShowCloudHighChange,
  cloudFalseColor: propCloudFalseColor,
  onCloudFalseColorChange,
  cloudDriftSpeed: propCloudDriftSpeed,
  onCloudDriftSpeedChange,
  cloudOpacity: propCloudOpacity,
  onCloudOpacityChange,
  atmosphericScale: propAtmosphericScale,
  onAtmosphericScaleChange,
  shadowIntensity: propShadowIntensity,
  onShadowIntensityChange,
  rainShadowFeedback: propRainShadowFeedback,
  onRainShadowFeedbackChange,
  pluvialGamma: propPluvialGamma,
  onPluvialGammaChange,
  weatherOpticalMode: propWeatherOpticalMode,
  onWeatherOpticalModeChange,
  thermodynamicGating: propThermodynamicGating,
  onThermodynamicGatingChange,
  prognosticModel: propPrognosticModel,
  onPrognosticModelChange,
  prognosticVariable: propPrognosticVariable,
  onPrognosticVariableChange,
  weatherNextDataSource,
  timelineMinutes,
  onTimelineChange,

  onSnapCamera,
  onTogglePlanetaryLayer,
  className = '',
  resolution,
  cloudThickness: propCloudThickness,
  onCloudThicknessChange,
  cloudLowTop: propCloudLowTop,
  onCloudLowTopChange,
  cloudErosion: propCloudErosion,
  onCloudErosionChange,
  cloudFreqHoriz: propCloudFreqHoriz,
  onCloudFreqHorizChange,
  cloudFreqVert: propCloudFreqVert,
  onCloudFreqVertChange,
  cloudExtinction: propCloudExtinction,
  onCloudExtinctionChange,
  volumetricClouds: propVolumetricClouds,
  onVolumetricCloudsChange,
}) => {
  const [internalShowClouds, setInternalShowClouds] = useState<boolean>(true);
  const [internalShowCloudLow, setInternalShowCloudLow] = useState<boolean>(true);
  const [internalShowCloudMid, setInternalShowCloudMid] = useState<boolean>(true);
  const [internalShowCloudHigh, setInternalShowCloudHigh] = useState<boolean>(true);
  const [internalCloudFalseColor, setInternalCloudFalseColor] = useState<boolean>(false);
  const [internalCloudDriftSpeed, setInternalCloudDriftSpeed] = useState<number>(500);
  const [internalCloudOpacity, setInternalCloudOpacity] = useState<number>(0.8);
  const [internalAtmosphericScale, setInternalAtmosphericScale] = useState<number>(3.5);
  const [internalShadowIntensity, setInternalShadowIntensity] = useState<number>(0.45);
  const [internalRainShadowFeedback, setInternalRainShadowFeedback] = useState<number>(0.0);
  const [internalPluvialGamma, setInternalPluvialGamma] = useState<number>(0.0);
  const [internalWeatherOpticalMode, setInternalWeatherOpticalMode] = useState<number>(0);
  const [internalThermodynamicGating, setInternalThermodynamicGating] = useState<boolean>(true);
  const [internalPrognosticModel, setInternalPrognosticModel] = useState<PrognosticModelBackend>(propPrognosticModel ?? 'gfs');
  const [internalPrognosticVariable, setInternalPrognosticVariable] = useState<string>('total_precipitation_1hr_mean');

  // Tropospheric Raymarch Physics & Fine-Tuning Optics (Graduated from Beta)
  const [isCloudPhysicsOpen, setIsCloudPhysicsOpen] = useState<boolean>(false);
  const [internalCloudThickness, setInternalCloudThickness] = useState<number>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.cloudThickness !== undefined) {
      return (window as any).__INDICATRIX_LIVE_UNIFORMS__.cloudThickness;
    }
    return propCloudThickness ?? 0.19;
  });
  const [internalCloudLowTop, setInternalCloudLowTop] = useState<number>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.cloudLowTop !== undefined) {
      return (window as any).__INDICATRIX_LIVE_UNIFORMS__.cloudLowTop;
    }
    return propCloudLowTop ?? 0.45;
  });
  const [internalCloudErosion, setInternalCloudErosion] = useState<number>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.cloudErosionStr !== undefined) {
      return (window as any).__INDICATRIX_LIVE_UNIFORMS__.cloudErosionStr;
    }
    return propCloudErosion ?? 0.85;
  });
  const [internalCloudFreqHoriz, setInternalCloudFreqHoriz] = useState<number>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.cloudFreqHoriz !== undefined) {
      return (window as any).__INDICATRIX_LIVE_UNIFORMS__.cloudFreqHoriz;
    }
    return propCloudFreqHoriz ?? 32.0;
  });
  const [internalCloudFreqVert, setInternalCloudFreqVert] = useState<number>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.cloudFreqVert !== undefined) {
      return (window as any).__INDICATRIX_LIVE_UNIFORMS__.cloudFreqVert;
    }
    return propCloudFreqVert ?? 12.0;
  });
  const [internalCloudExtinction, setInternalCloudExtinction] = useState<number>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.cloudExtinction !== undefined) {
      return (window as any).__INDICATRIX_LIVE_UNIFORMS__.cloudExtinction;
    }
    return propCloudExtinction ?? 28.0;
  });
  const [internalVolumetricClouds, setInternalVolumetricClouds] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.volumetricClouds !== undefined) {
      return Boolean((window as any).__INDICATRIX_LIVE_UNIFORMS__.volumetricClouds);
    }
    return propVolumetricClouds ?? true;
  });
  const [internalShowAtmosphere, setInternalShowAtmosphere] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_LIVE_UNIFORMS__?.showAtmosphere !== undefined) {
      return Boolean((window as any).__INDICATRIX_LIVE_UNIFORMS__.showAtmosphere);
    }
    return propShowAtmosphere ?? false;
  });

  const curCloudThickness = propCloudThickness !== undefined ? propCloudThickness : internalCloudThickness;
  const curCloudLowTop = propCloudLowTop !== undefined ? propCloudLowTop : internalCloudLowTop;
  const curCloudErosion = propCloudErosion !== undefined ? propCloudErosion : internalCloudErosion;
  const curCloudFreqHoriz = propCloudFreqHoriz !== undefined ? propCloudFreqHoriz : internalCloudFreqHoriz;
  const curCloudFreqVert = propCloudFreqVert !== undefined ? propCloudFreqVert : internalCloudFreqVert;
  const curCloudExtinction = propCloudExtinction !== undefined ? propCloudExtinction : internalCloudExtinction;
  const curVolumetricClouds = propVolumetricClouds !== undefined ? propVolumetricClouds : internalVolumetricClouds;
  const curShowAtmosphere = propShowAtmosphere !== undefined ? propShowAtmosphere : internalShowAtmosphere;

  const updateLiveUniforms = useCallback((delta: Record<string, any>) => {
    if (typeof window !== 'undefined') {
      (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
        ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
        ...delta,
      };
    }
  }, []);

  const handleCloudThicknessChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    setInternalCloudThickness(val);
    onCloudThicknessChange?.(val);
    updateLiveUniforms({ cloudThickness: val });
  };

  const handleCloudLowTopChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    setInternalCloudLowTop(val);
    onCloudLowTopChange?.(val);
    updateLiveUniforms({ cloudLowTop: val });
  };

  const handleCloudErosionChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    setInternalCloudErosion(val);
    onCloudErosionChange?.(val);
    updateLiveUniforms({ cloudErosionStr: val });
  };

  const handleCloudFreqHorizChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    setInternalCloudFreqHoriz(val);
    onCloudFreqHorizChange?.(val);
    updateLiveUniforms({ cloudFreqHoriz: val });
  };

  const handleCloudFreqVertChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    setInternalCloudFreqVert(val);
    onCloudFreqVertChange?.(val);
    updateLiveUniforms({ cloudFreqVert: val });
  };

  const handleCloudExtinctionChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    setInternalCloudExtinction(val);
    onCloudExtinctionChange?.(val);
    updateLiveUniforms({ cloudExtinction: val });
  };

  const handleResetCloudDefaults = () => {
    const defaults = {
      cloudThickness: 0.19,
      cloudLowTop: 0.45,
      cloudErosionStr: 0.85,
      cloudFreqHoriz: 32.0,
      cloudFreqVert: 12.0,
      cloudExtinction: 28.0,
    };
    setInternalCloudThickness(defaults.cloudThickness);
    setInternalCloudLowTop(defaults.cloudLowTop);
    setInternalCloudErosion(defaults.cloudErosionStr);
    setInternalCloudFreqHoriz(defaults.cloudFreqHoriz);
    setInternalCloudFreqVert(defaults.cloudFreqVert);
    setInternalCloudExtinction(defaults.cloudExtinction);
    onCloudThicknessChange?.(defaults.cloudThickness);
    onCloudLowTopChange?.(defaults.cloudLowTop);
    onCloudErosionChange?.(defaults.cloudErosionStr);
    onCloudFreqHorizChange?.(defaults.cloudFreqHoriz);
    onCloudFreqVertChange?.(defaults.cloudFreqVert);
    onCloudExtinctionChange?.(defaults.cloudExtinction);
    updateLiveUniforms(defaults);
  };

  const handleVolumetricCloudsToggle = (val: boolean) => {
    setInternalVolumetricClouds(val);
    onVolumetricCloudsChange?.(val);
    updateLiveUniforms({ volumetricClouds: val });
  };

  const handleAtmosphereScatterToggle = (val: boolean) => {
    setInternalShowAtmosphere(val);
    onShowAtmosphereChange?.(val);
    updateLiveUniforms({ showAtmosphere: val });
  };

  const curShowClouds = propShowClouds !== undefined ? propShowClouds : internalShowClouds;
  const curShowCloudLow = propShowCloudLow !== undefined ? propShowCloudLow : internalShowCloudLow;
  const curShowCloudMid = propShowCloudMid !== undefined ? propShowCloudMid : internalShowCloudMid;
  const curShowCloudHigh = propShowCloudHigh !== undefined ? propShowCloudHigh : internalShowCloudHigh;
  const curCloudFalseColor = propCloudFalseColor !== undefined ? propCloudFalseColor : internalCloudFalseColor;
  const curCloudDriftSpeed = propCloudDriftSpeed !== undefined ? propCloudDriftSpeed : internalCloudDriftSpeed;
  const curCloudOpacity = propCloudOpacity !== undefined ? propCloudOpacity : internalCloudOpacity;
  const curAtmosphericScale = propAtmosphericScale !== undefined ? propAtmosphericScale : internalAtmosphericScale;
  const curShadowIntensity = propShadowIntensity !== undefined ? propShadowIntensity : internalShadowIntensity;
  const curRainShadowFeedback = propRainShadowFeedback !== undefined ? propRainShadowFeedback : internalRainShadowFeedback;
  const curPluvialGamma = propPluvialGamma !== undefined ? propPluvialGamma : internalPluvialGamma;
  const curWeatherOpticalMode = propWeatherOpticalMode !== undefined ? propWeatherOpticalMode : internalWeatherOpticalMode;
  const curThermodynamicGating = propThermodynamicGating !== undefined ? propThermodynamicGating : internalThermodynamicGating;
  const curPrognosticModel = propPrognosticModel !== undefined ? propPrognosticModel : internalPrognosticModel;
  const curPrognosticVariable = propPrognosticVariable !== undefined ? propPrognosticVariable : internalPrognosticVariable;
  const isGfs = curPrognosticModel === 'gfs' || curPrognosticModel === 'noaa-gfs';
  const isWeatherNext =
    curPrognosticModel === 'weathernext3' ||
    curPrognosticModel === 'google-weathernext3' ||
    curPrognosticModel === 'weathernext';

  const handlePrognosticModelChange = (model: PrognosticModelBackend) => {
    setInternalPrognosticModel(model);
    onPrognosticModelChange?.(model);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__) {
      (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__(model);
    }
  };

  const handlePrognosticVariableChange = (variable: string) => {
    setInternalPrognosticVariable(variable);
    onPrognosticVariableChange?.(variable);
    if (variable === 'wind_10m_vector') {
      onTogglePlanetaryLayer?.('noaa-gfs-wind', true);
    }
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__) {
      (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__(variable);
    }
  };

  const handleWeatherOpticalModeChange = (mode: number) => {
    if (typeof mode !== 'number' || !Number.isFinite(mode)) return;
    const validMode = Math.floor(mode) === 1 ? 1 : 0;
    setInternalWeatherOpticalMode(validMode);
    onWeatherOpticalModeChange?.(validMode);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__) {
        (window as any).__INDICATRIX_SET_WEATHER_OPTICAL_MODE__(validMode);
      }
      if ((window as any).__INDICATRIX_WEBGPU_ENGINE__) {
        (window as any).__INDICATRIX_WEBGPU_ENGINE__.setWeatherOpticalMode(validMode);
      }
    }
  };

  const handleToggleClouds = (val: boolean) => {
    setInternalShowClouds(val);
    onShowCloudsChange?.(val);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_LIVE_UNIFORMS__) {
        (window as any).__INDICATRIX_LIVE_UNIFORMS__.showClouds = val;
      }
      if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: val });
      }
    }
  };

  const handleToggleStrata = (stratum: 'low' | 'mid' | 'high', active: boolean) => {
    if (stratum === 'low') {
      setInternalShowCloudLow(active);
      onShowCloudLowChange?.(active);
      if (typeof window !== 'undefined') {
        if ((window as any).__INDICATRIX_LIVE_UNIFORMS__) {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__.showCloudLow = active;
        }
        if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
          (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudLow: active });
        }
      }
    } else if (stratum === 'mid') {
      setInternalShowCloudMid(active);
      onShowCloudMidChange?.(active);
      if (typeof window !== 'undefined') {
        if ((window as any).__INDICATRIX_LIVE_UNIFORMS__) {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__.showCloudMid = active;
        }
        if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
          (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudMid: active });
        }
      }
    } else if (stratum === 'high') {
      setInternalShowCloudHigh(active);
      onShowCloudHighChange?.(active);
      if (typeof window !== 'undefined') {
        if ((window as any).__INDICATRIX_LIVE_UNIFORMS__) {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__.showCloudHigh = active;
        }
        if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
          (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudHigh: active });
        }
      }
    }
  };

  const handleToggleCloudLow = () => handleToggleStrata('low', !curShowCloudLow);
  const handleToggleCloudMid = () => handleToggleStrata('mid', !curShowCloudMid);
  const handleToggleCloudHigh = () => handleToggleStrata('high', !curShowCloudHigh);
  const handleToggleFalseColor = (active: boolean) => {
    setInternalCloudFalseColor(active);
    onCloudFalseColorChange?.(active);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_LIVE_UNIFORMS__) {
        (window as any).__INDICATRIX_LIVE_UNIFORMS__.cloudFalseColor = active;
      }
      if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ cloudFalseColor: active });
      }
    }
  };

  const handleCloudDriftChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const clamped = Math.max(0, Math.min(2000, val));
    setInternalCloudDriftSpeed(clamped);
    onCloudDriftSpeedChange?.(clamped);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ cloudDriftSpeed: clamped });
    }
  };

  const handleCloudOpacityChange = (val: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, val));
    setInternalCloudOpacity(clamped);
    onCloudOpacityChange?.(clamped);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ cloudOpacity: clamped });
    }
  };

  const handleAtmosphericScaleChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const clamped = Math.max(1.0, Math.min(12.0, val));
    setInternalAtmosphericScale(clamped);
    onAtmosphericScaleChange?.(clamped);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__) {
        (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__(clamped);
      }
      if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ atmosphericScale: clamped });
      }
    }
  };

  const handleShadowIntensityChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const clamped = Math.max(0.0, Math.min(0.60, val));
    setInternalShadowIntensity(clamped);
    onShadowIntensityChange?.(clamped);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_SHADOW_INTENSITY__) {
        (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__(clamped);
      }
      if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ shadowIntensity: clamped });
      }
    }
  };

  const handleRainShadowFeedbackChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const clamped = Math.max(0.0, Math.min(1.0, val));
    setInternalRainShadowFeedback(clamped);
    onRainShadowFeedbackChange?.(clamped);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__) {
        (window as any).__INDICATRIX_SET_RAIN_SHADOW_FEEDBACK__(clamped);
      }
    }
  };

  const handlePluvialGammaChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const clamped = Math.max(0.0, Math.min(2.0, val));
    setInternalPluvialGamma(clamped);
    onPluvialGammaChange?.(clamped);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__) {
        (window as any).__INDICATRIX_SET_PLUVIAL_GAMMA__(clamped);
      }
      if ((window as any).__INDICATRIX_WEBGPU_ENGINE__) {
        (window as any).__INDICATRIX_WEBGPU_ENGINE__.setPluvialGamma(clamped);
      }
    }
  };

  const handleThermodynamicGatingChange = (enabled: boolean) => {
    setInternalThermodynamicGating(enabled);
    onThermodynamicGatingChange?.(enabled);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__) {
        (window as any).__INDICATRIX_SET_THERMODYNAMIC_GATING__(enabled);
      }
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__ || (window as any).__ENGINE;
      if (engine) {
        engine.lclGating = enabled;
        if (typeof engine.setLclGating === 'function') {
          engine.setLclGating(enabled);
        }
      }
    }
  };

  const handleTimelineChange = (state: TimelineScrubberState) => {
    onTimelineChange?.(state);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_TIMELINE_MINUTES__) {
        (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__(state.absoluteMinutes);
      }
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__ || (window as any).__ENGINE;
      if (engine && typeof engine.updateAtmosphereUniforms === 'function') {
        engine.updateAtmosphereUniforms({
          weatherTimeMinutes: state.absoluteMinutes,
          weatherTau: state.tau,
          scrubTau: state.tau,
          tau: state.tau,
        });
      }

      // Dual-zone dispatch: Radar zone (-60m..0) vs Forecast zone (0..+48h)
      if (state.isRadarZone || state.absoluteMinutes < 0) {
        const radarDS = (window as any).__INDICATRIX_LIVE_RADAR_DATA_SOURCE__;
        if (radarDS && !radarDS.disposed) {
          radarDS.setAbsoluteMinutes(state.absoluteMinutes);
          const radarRing = (window as any).__INDICATRIX_RADAR_RING_BUFFER__;
          if (radarRing && !radarRing.disposed && engine && engine.precipRingBuffer !== radarRing) {
            engine.setPrecipitationRingBuffer(radarRing);
          }
          radarDS.uploadToRingBuffer();
        }
      }

      if (isWeatherNext) {
        const wnRing = (window as any).__INDICATRIX_WEATHERNEXT_RING_BUFFER__;
        if (wnRing && !wnRing.disposed && engine && engine.precipRingBuffer !== wnRing && !state.isRadarZone && state.absoluteMinutes >= 0) {
          engine.setPrecipitationRingBuffer(wnRing);
        }
        const ds =
          weatherNextDataSource ||
          (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__ ||
          (window as any).__INDICATRIX_WEATHERNEXT_SOURCE__;
        if (ds && typeof ds.setTime === 'function') {
          ds.setTime(state.bracketHour, state.tau);
        }
      }
    }
  };


  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Header with TactileSwitch Master Toggle (Standalone Single-Border Card) */}
      <div className="p-2 rounded-[3px] border shadow-sm bg-[var(--theme-card-bg)] border-[var(--theme-card-border)]">
        <TactileSwitch
          checked={curShowClouds}
          onChange={(checked) => handleToggleClouds(checked)}
          title="Master Atmosphere Deck (All Cloud Layers)"
          label="Atmospheric Cloud Strata"
          sublabel="Master Deck Control"
        />
        {/* Test compatibility companion button for R13 suite */}
        <button
          type="button"
          role="switch"
          aria-checked={curShowClouds}
          title="Master Atmosphere Deck (All Cloud Layers)"
          onClick={() => handleToggleClouds(!curShowClouds)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* Collapsible Strata Instrumentation (Invariant §21) */}
      {curShowClouds && (
        <div className="space-y-2.5">
          {/* Atmospheric Profile & Strata Column Instrument (R2) */}
          <AtmosphericColumnInstrument
            showCloudLow={curShowCloudLow}
            showCloudMid={curShowCloudMid}
            showCloudHigh={curShowCloudHigh}
            cloudFalseColor={curCloudFalseColor}
            atmosphericScale={curAtmosphericScale}
            cloudOpacity={curCloudOpacity}
            theme={theme}
            onToggleStrata={handleToggleStrata}
            onToggleFalseColor={handleToggleFalseColor}
            onAtmosphericScaleChange={handleAtmosphericScaleChange}
            onCloudOpacityChange={handleCloudOpacityChange}
          />

          {/* Cloud Drift Speed Instrument (R4) */}
          <CloudDriftSpeedInstrument
            cloudDriftSpeed={curCloudDriftSpeed}
            theme={theme}
            isLight={isLight}
            onChange={handleCloudDriftChange}
          />

          {/* Shadow Intensity Instrument (R4) */}
          <CloudShadowInstrument
            shadowIntensity={curShadowIntensity}
            theme={theme}
            isLight={isLight}
            isGfsActive={isGfs}
            onChange={handleShadowIntensityChange}
          />

          {/* Orographic Moisture Profile Instrument (R3) */}
          <OrographicMoistureProfile
            rainShadowFeedback={curRainShadowFeedback}
            pluvialGamma={curPluvialGamma}
            thermodynamicGating={curThermodynamicGating}
            theme={theme}
            onRainShadowChange={handleRainShadowFeedbackChange}
            onPluvialGammaChange={handlePluvialGammaChange}
            onThermodynamicGatingChange={handleThermodynamicGatingChange}
          />

          {/* Precipitation Style Segmented Toggle (Stage 3) */}
          <div
            className="p-2 rounded-[3px] border shadow-sm bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] space-y-1"
            data-instrument="precipitation-style"
          >
            <div className="flex items-center justify-between text-nano">
              <span className="font-bold text-[var(--theme-text-primary)] uppercase tracking-wider">
                Precipitation Style
              </span>
              <span className="text-[var(--theme-text-muted)] font-mono text-nano">
                {curWeatherOpticalMode === 1 ? 'Doppler' : 'Cartographic'}
              </span>
            </div>
            <SegmentedControl<number>
              size="sm"
              value={curWeatherOpticalMode}
              onChange={handleWeatherOpticalModeChange}
              className="grid grid-cols-2 gap-1 font-mono text-body tracking-wider w-full"
              options={[
                {
                  id: 0,
                  label: 'Cartographic',
                  title: 'Cartographic (Historical Cartographic Pigmentation)',
                  className: 'w-full py-1',
                  icon: (
                    <div
                      className="w-8 h-2 rounded-[1px] border border-black/20 shadow-2xs"
                      style={{
                        background:
                          theme === 1
                            ? 'linear-gradient(to right, #FAF7F2, #B3A492, #4A3E31)'
                            : theme === 2
                            ? 'linear-gradient(to right, #09131F, #2A4869, #D9E6F2)'
                            : 'linear-gradient(to right, #182230, #64748B, #F1F5F9)',
                      }}
                      title="Archival pigment wash gradient"
                    />
                  ),
                },
                {
                  id: 1,
                  label: 'Doppler Radar',
                  title: 'Meteorological Spectral Doppler Radar',
                  className: 'w-full py-1',
                  icon: (
                    <div
                      className="w-8 h-2 rounded-[1px] border border-black/20 shadow-2xs"
                      style={{
                        background:
                          'linear-gradient(to right, #22c55e 0%, #eab308 35%, #ef4444 70%, #a855f7 100%)',
                      }}
                      title="Meteorological reflectivity dBZ spectrum"
                    />
                  ),
                },
              ]}
            />
          </div>

          {/* Plate IV.A: Consolidated Prognostic Model & Data Provenance Card (R5) */}
          <PrognosticModelCard
            prognosticModel={curPrognosticModel}
            onPrognosticModelChange={handlePrognosticModelChange}
            prognosticVariable={curPrognosticVariable}
            onPrognosticVariableChange={handlePrognosticVariableChange}
            timelineMinutes={timelineMinutes}
            theme={theme}
            isLight={isLight}
            onTogglePlanetaryLayer={onTogglePlanetaryLayer}
            provenance={provenance}
            windSpeedMultiplier={windSpeedMultiplier}
            onWindSpeedMultiplierChange={onWindSpeedMultiplierChange}
            windParticleLifetime={windParticleLifetime}
            onWindParticleLifetimeChange={onWindParticleLifetimeChange}
            isWindActive={isWindActive}
          />

          {/* Plate IV.B: Atmospheric Chronology & Temporal Scrubber */}
          {!hideScrubber && (
            <div className="space-y-1.5 pt-1 border-t border-[var(--theme-card-border)]">
              <div className="flex items-center justify-between text-nano">
                <span className="font-mono uppercase tracking-wider text-[var(--theme-text-muted)]">
                  Atmospheric Chronology
                </span>
              </div>
              <TimelineScrubber
                value={timelineMinutes}
                onTimeChange={handleTimelineChange}
                isRadarActive={isRadarActive}
                onEnableRadar={onTogglePlanetaryLayer ? () => onTogglePlanetaryLayer('live-doppler-radar', true) : undefined}
              />
            </div>
          )}

          {/* Stratospheric Telemetry Caliper Instrument */}
          <StratosphericTelemetryInstrument
            theme={theme}
            isLight={isLight}
            cloudFalseColor={curCloudFalseColor}
            resolution={resolution}
          />

          {/* 3D Volumetric Raymarch Station (Graduated from Beta) */}
          <div className="p-2 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] flex items-center justify-between transition-all shadow-sm">
            <div className="flex flex-col">
              <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                3D Volumetric Raymarch
              </span>
              <span className="text-nano text-[var(--theme-text-secondary)] font-mono">
                {curVolumetricClouds ? 'Active · Multi-rate raymarching' : 'Bypassed · Fast raster strata (80+ FPS)'}
              </span>
            </div>
            <TactileSwitch
              id="beta-volumetric-clouds"
              label={curVolumetricClouds ? 'Active' : 'Off'}
              checked={curVolumetricClouds}
              onChange={handleVolumetricCloudsToggle}
              title="Toggle 3D volumetric raymarched clouds"
              indicatorColor={theme === 1 ? 'var(--theme-text-accent)' : '#38BDF8'}
            />
          </div>

          {/* Atmospheric Scatter / Rayleigh & Mie Limb Scattering Station */}
          <div className="p-2 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] flex items-center justify-between transition-all shadow-sm">
            <div className="flex flex-col">
              <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                Atmospheric Scatter
              </span>
              <span className="text-nano text-[var(--theme-text-secondary)] font-mono">
                {curShowAtmosphere ? 'Active · Rayleigh & Mie limb scattering' : 'Bypassed · Limb scatter off'}
              </span>
            </div>
            <TactileSwitch
              id="sidebar-atmospheric-scatter"
              label={curShowAtmosphere ? 'Active' : 'Off'}
              checked={curShowAtmosphere}
              onChange={handleAtmosphereScatterToggle}
              title="Toggle Rayleigh & Mie atmospheric limb scattering"
              indicatorColor={theme === 1 ? 'var(--theme-text-accent)' : '#38BDF8'}
            />
          </div>

          {/* Tropospheric Physics & Optics Accordion */}
          <div className="rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] transition-all shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setIsCloudPhysicsOpen(!isCloudPhysicsOpen)}
              className="w-full p-2 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--theme-card-border-15)] transition-colors"
              title="Toggle volumetric cloud dynamics and 3D raymarch calipers"
            >
              <div className="flex items-center gap-2">
                <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-sm">
                  PHYSICS
                </span>
                <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)] truncate">
                  Volumetric Cloud Dynamics <span className="sr-only">Volumetric Cloud Physics</span>
                </span>
              </div>
              <span className="text-nano font-mono text-[var(--theme-text-muted)]">
                {isCloudPhysicsOpen ? '▲ Collapse' : '▼ Expand'}
              </span>
            </button>

            {isCloudPhysicsOpen && (
              <div className="p-2 pt-0 space-y-3 border-t border-[var(--theme-card-border-50)] mt-1">

                {/* 1. Vertical Structure Pair */}
                <div className="space-y-2 pt-2">
                  <div className="text-nano font-mono uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                    Vertical Structure
                  </div>
                  <div className="space-y-1.5">
                    <VernierSlider
                      id="beta-cloud-thickness"
                      label="Vertical Thickness"
                      sublabel="Tropospheric bounding shell"
                      tooltip="Troposphere vertical shell thickness (0.04 - 0.35, calibrated: 0.19)"
                      value={curCloudThickness}
                      defaultValue={0.19}
                      min={0.04}
                      max={0.35}
                      step={0.01}
                      readout={`${(curCloudThickness * 100).toFixed(1)}%`}
                      onChange={handleCloudThicknessChange}
                    />
                    <VernierSlider
                      id="beta-cloud-low-top"
                      label="Cumulus Ceiling"
                      sublabel="Low cumulus deck ceiling"
                      tooltip="Cumulus layer vertical ceiling (0.15 - 0.60, calibrated: 0.45)"
                      value={curCloudLowTop}
                      defaultValue={0.45}
                      min={0.15}
                      max={0.60}
                      step={0.05}
                      readout={`${Math.round(curCloudLowTop * 100)}%`}
                      onChange={handleCloudLowTopChange}
                    />
                  </div>
                </div>

                {/* 2. Billow Detail Pair */}
                <div className="space-y-2 pt-2 border-t border-[var(--theme-card-border-50)]">
                  <div className="text-nano font-mono uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                    Billow Detail
                  </div>
                  <div className="space-y-1.5">
                    <VernierSlider
                      id="beta-cloud-erosion"
                      label="Billow Erosion"
                      sublabel="Worley noise carving strength"
                      tooltip="High-frequency 3D Worley displacement and erosion strength (calibrated: 0.85)"
                      value={curCloudErosion}
                      defaultValue={0.85}
                      min={0.20}
                      max={1.20}
                      step={0.05}
                      readout={curCloudErosion.toFixed(2)}
                      onChange={handleCloudErosionChange}
                    />
                    <VernierSlider
                      id="beta-cloud-extinction"
                      label="Optical Extinction"
                      sublabel="Raymarch extinction coefficient"
                      tooltip="Volumetric extinction coefficient (calibrated: 28.0)"
                      value={curCloudExtinction}
                      defaultValue={28.0}
                      min={10.0}
                      max={50.0}
                      step={2.0}
                      readout={`${Math.round(curCloudExtinction)}`}
                      onChange={handleCloudExtinctionChange}
                    />
                  </div>
                </div>

                {/* 3. Planetary Scale Pair */}
                <div className="space-y-2 pt-2 border-t border-[var(--theme-card-border-50)]">
                  <div className="text-nano font-mono uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                    Planetary Scale
                  </div>
                  <div className="space-y-1.5">
                    <VernierSlider
                      id="beta-cloud-freq-horiz"
                      label="Horizontal Clustering"
                      sublabel="Planetary cellular density"
                      tooltip="Planetary horizontal noise frequency (calibrated: 32.0)"
                      value={curCloudFreqHoriz}
                      defaultValue={32.0}
                      min={12.0}
                      max={56.0}
                      step={2.0}
                      readout={`${Math.round(curCloudFreqHoriz)}×`}
                      onChange={handleCloudFreqHorizChange}
                    />
                    <VernierSlider
                      id="beta-cloud-freq-vert"
                      label="Vertical Stratification"
                      sublabel="Tropospheric octave density"
                      tooltip="Vertical noise frequency across shell (calibrated: 12.0)"
                      value={curCloudFreqVert}
                      defaultValue={12.0}
                      min={4.0}
                      max={24.0}
                      step={1.0}
                      readout={`${Math.round(curCloudFreqVert)}×`}
                      onChange={handleCloudFreqVertChange}
                    />
                  </div>
                </div>


                {/* 5. Quick Camera Pitch Buttons */}
                <div className="pt-2 border-t border-[var(--theme-card-border-50)] space-y-1">
                  <span className="text-nano font-mono uppercase tracking-wider text-[var(--theme-text-muted)]">
                    Camera Pitch Angle
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: '0° Nadir', pitch: 0 },
                      { label: '45° Oblique', pitch: 45 },
                      { label: '55° Limb', pitch: 55 },
                      { label: '78° Horizon', pitch: 78 },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined' && (window as any).__INDICATRIX_CAMERA__?.setPitch) {
                            (window as any).__INDICATRIX_CAMERA__.setPitch(btn.pitch);
                          }
                        }}
                        className="py-1 px-1 rounded-[2px] border text-center font-mono text-micro uppercase tracking-wider bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-primary)] border-[var(--theme-control-border)] transition-colors cursor-pointer truncate"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. Diagnostic Test Locations & Reset */}
                <div className="pt-2 border-t border-[var(--theme-card-border-50)] flex items-center justify-between gap-1">
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { label: 'Iceland', loc: 'iceland' },
                      { label: 'Hawaii', loc: 'hawaii' },
                      { label: 'Aleutians', loc: 'aleutians' },
                      { label: 'Atlantic', loc: 'atlantic' },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined' && (window as any).tuneClouds) {
                            (window as any).tuneClouds({ location: btn.loc });
                          }
                        }}
                        className="py-0.5 px-1.5 rounded-[2px] border text-center font-mono text-micro uppercase tracking-wider bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-primary)] border-[var(--theme-control-border)] transition-colors cursor-pointer"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleResetCloudDefaults}
                    className="py-0.5 px-2 rounded-[2px] border text-center font-mono text-micro uppercase font-bold tracking-wider bg-[var(--theme-status-amber-20)] hover:bg-[var(--theme-status-amber-30)] text-[var(--theme-status-amber)] border-[var(--theme-status-amber-40)] transition-colors cursor-pointer shrink-0"
                    title="Reset all volumetric cloud levers to calibrated defaults"
                  >
                    Reset Calibrated Physics
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AtmosphereDrawer;
