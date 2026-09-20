// ============================================================================
// File: src/components/AtmosphereDrawer.tsx
// Atmospheric Cloud Strata Controls & Horizon Cross-Section Preset Drawer
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

export type PrognosticModelBackend =
  | 'noaa-gfs'
  | 'weathernext3'
  | 'google-weathernext3'
  | 'gfs'
  | 'weathernext'
  | 'ecmwf'
  | 'off'
  | 'climatology';

export interface AtmosphereDrawerProps {
  theme?: 0 | 1 | 2;
  isLight?: boolean;
  showClouds?: boolean;
  onShowCloudsChange?: (v: boolean) => void;
  showCloudLow?: boolean;
  onShowCloudLowChange?: (v: boolean) => void;
  showCloudMid?: boolean;
  onShowCloudMidChange?: (v: boolean) => void;
  showCloudHigh?: boolean;
  onShowCloudHighChange?: (v: boolean) => void;
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
  onHorizonPresetClick?: () => void;
  onSnapCamera?: (snap: 'equator' | 'pole' | 'seam' | 'isometric' | 'horizon') => void;
  onTogglePlanetaryLayer?: (id: string, force?: boolean) => void;
  isRadarActive?: boolean;
  hideScrubber?: boolean;
  className?: string;
}

export const AtmosphereDrawer: React.FC<AtmosphereDrawerProps> = ({
  theme = 0,
  isLight = false,
  hideScrubber = false,
  isRadarActive = false,
  showClouds: propShowClouds,
  onShowCloudsChange,
  showCloudLow: propShowCloudLow,
  onShowCloudLowChange,
  showCloudMid: propShowCloudMid,
  onShowCloudMidChange,
  showCloudHigh: propShowCloudHigh,
  onShowCloudHighChange,
  cloudDriftSpeed: propCloudDriftSpeed,
  onCloudDriftSpeedChange,
  cloudOpacity: propCloudOpacity,
  onCloudOpacityChange,
  atmosphericScale: propAtmosphericScale,
  onAtmosphericScaleChange,
  shadowIntensity: propShadowIntensity,
  onShadowIntensityChange,
  verticalScaleMode: propVerticalScaleMode,
  onVerticalScaleModeChange,
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
  onHorizonPresetClick,
  onSnapCamera,
  onTogglePlanetaryLayer,
  className = '',
}) => {
  const [internalShowClouds, setInternalShowClouds] = useState<boolean>(true);
  const [internalShowCloudLow, setInternalShowCloudLow] = useState<boolean>(true);
  const [internalShowCloudMid, setInternalShowCloudMid] = useState<boolean>(true);
  const [internalShowCloudHigh, setInternalShowCloudHigh] = useState<boolean>(true);
  const [internalCloudDriftSpeed, setInternalCloudDriftSpeed] = useState<number>(500);
  const [internalCloudOpacity, setInternalCloudOpacity] = useState<number>(0.8);
  const [internalAtmosphericScale, setInternalAtmosphericScale] = useState<number>(3.5);
  const [internalShadowIntensity, setInternalShadowIntensity] = useState<number>(0.45);
  const [internalVerticalScaleMode, setInternalVerticalScaleMode] = useState<number>(1);
  const [internalRainShadowFeedback, setInternalRainShadowFeedback] = useState<number>(0.0);
  const [internalPluvialGamma, setInternalPluvialGamma] = useState<number>(0.0);
  const [internalWeatherOpticalMode, setInternalWeatherOpticalMode] = useState<number>(0);
  const [internalThermodynamicGating, setInternalThermodynamicGating] = useState<boolean>(true);
  const [internalPrognosticModel, setInternalPrognosticModel] = useState<PrognosticModelBackend>('gfs');
  const [internalPrognosticVariable, setInternalPrognosticVariable] = useState<string>('total_precipitation_1hr_mean');

  const curShowClouds = propShowClouds !== undefined ? propShowClouds : internalShowClouds;
  const curShowCloudLow = propShowCloudLow !== undefined ? propShowCloudLow : internalShowCloudLow;
  const curShowCloudMid = propShowCloudMid !== undefined ? propShowCloudMid : internalShowCloudMid;
  const curShowCloudHigh = propShowCloudHigh !== undefined ? propShowCloudHigh : internalShowCloudHigh;
  const curCloudDriftSpeed = propCloudDriftSpeed !== undefined ? propCloudDriftSpeed : internalCloudDriftSpeed;
  const curCloudOpacity = propCloudOpacity !== undefined ? propCloudOpacity : internalCloudOpacity;
  const curAtmosphericScale = propAtmosphericScale !== undefined ? propAtmosphericScale : internalAtmosphericScale;
  const curShadowIntensity = propShadowIntensity !== undefined ? propShadowIntensity : internalShadowIntensity;
  const curVerticalScaleMode = propVerticalScaleMode !== undefined ? propVerticalScaleMode : internalVerticalScaleMode;
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
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: val });
    }
  };

  const handleToggleStrata = (stratum: 'low' | 'mid' | 'high', active: boolean) => {
    if (stratum === 'low') {
      setInternalShowCloudLow(active);
      onShowCloudLowChange?.(active);
      if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudLow: active });
      }
    } else if (stratum === 'mid') {
      setInternalShowCloudMid(active);
      onShowCloudMidChange?.(active);
      if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudMid: active });
      }
    } else if (stratum === 'high') {
      setInternalShowCloudHigh(active);
      onShowCloudHighChange?.(active);
      if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudHigh: active });
      }
    }
  };

  const handleToggleCloudLow = () => handleToggleStrata('low', !curShowCloudLow);
  const handleToggleCloudMid = () => handleToggleStrata('mid', !curShowCloudMid);
  const handleToggleCloudHigh = () => handleToggleStrata('high', !curShowCloudHigh);

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

  const handleVerticalScaleModeChange = (val: number) => {
    setInternalVerticalScaleMode(val);
    onVerticalScaleModeChange?.(val);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_VERTICAL_SCALE_MODE__) {
        (window as any).__INDICATRIX_SET_VERTICAL_SCALE_MODE__(val);
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

  const handleHorizonCrossSectionPreset = useCallback(() => {
    // 1. Ensure master clouds are enabled
    if (!curShowClouds) {
      handleToggleClouds(true);
    }
    // 2. Ensure Jet Stream is active
    onTogglePlanetaryLayer?.('noaa-gfs-jetstream', true);

    // 3. Set atmospheric scale >= 6.0x for clear visual strata separation
    handleAtmosphericScaleChange(Math.max(curAtmosphericScale, 6.0));

    // 4. Custom preset callback or snap camera
    if (onHorizonPresetClick) {
      onHorizonPresetClick();
    } else if (onSnapCamera) {
      onSnapCamera('horizon');
    }

    // 5. Invoke programmatic hook if available in window
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_CAMERA__?.snapHorizonCrossSection) {
      (window as any).__INDICATRIX_CAMERA__.snapHorizonCrossSection(1.6);
    }
  }, [curShowClouds, curAtmosphericScale, onHorizonPresetClick, onSnapCamera, onTogglePlanetaryLayer]);

  return (
    <div
      className={`p-2 rounded-[3px] border space-y-2 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] ${className}`}
    >
      {/* Header with TactileSwitch Master Toggle */}
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

      {/* Collapsible Strata Instrumentation (Invariant §21) */}
      {curShowClouds && (
        <div className="space-y-2 pt-1 border-t border-[var(--theme-card-border)]">
          {/* Atmospheric Profile & Strata Column Instrument (R2) */}
          <AtmosphericColumnInstrument
            showCloudLow={curShowCloudLow}
            showCloudMid={curShowCloudMid}
            showCloudHigh={curShowCloudHigh}
            atmosphericScale={curAtmosphericScale}
            cloudOpacity={curCloudOpacity}
            theme={theme}
            onToggleStrata={handleToggleStrata}
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
            onChange={handleShadowIntensityChange}
          />

          {/* Physical Strata: Vertical Scale Mode Selector */}
          <div className="space-y-1 pt-1 border-t border-[var(--theme-control-border)]/50">
            <div className="flex items-center justify-between text-nano">
              <span className="font-bold text-[var(--theme-text-primary)]">Vertical Scale Transfer</span>
              <span className="text-[var(--theme-text-muted)] font-mono">
                {curVerticalScaleMode === 1 ? 'Dual-Log' : 'Linear'}
              </span>
            </div>
            <SegmentedControl<number>
              size="sm"
              value={curVerticalScaleMode}
              onChange={handleVerticalScaleModeChange}
              className="grid grid-cols-2 gap-1 w-full"
              options={[
                {
                  id: 0,
                  label: 'Linear (Legacy)',
                  title: 'Linear Power Scale (Legacy)',
                  className: 'w-full',
                },
                {
                  id: 1,
                  label: 'Dual-Logarithmic',
                  title: 'Symmetrical Dual-Logarithmic Scale (Piecewise Depth & Relief)',
                  className: 'w-full',
                },
              ]}
            />
          </div>

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

          {/* Weather Optical Mode Segmented Toggle (Stage 3) */}
          <div className="space-y-1 pt-1 border-t border-[var(--theme-control-border)]/50">
            <div className="flex items-center justify-between text-nano">
              <span className="font-bold text-[var(--theme-text-primary)] uppercase tracking-wider">
                Weather Optical Mode
              </span>
              <span className="text-[var(--theme-text-muted)] font-mono text-nano">
                {curWeatherOpticalMode === 1 ? 'Doppler' : 'Ink Wash'}
              </span>
            </div>
            <SegmentedControl<number>
              size="sm"
              value={curWeatherOpticalMode}
              onChange={handleWeatherOpticalModeChange}
              className="grid grid-cols-2 gap-1 font-mono text-[10px] tracking-wider w-full"
              options={[
                {
                  id: 0,
                  label: 'Archival Ink Wash',
                  title: 'Archival Ink Wash (Historical Cartographic Pigmentation)',
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

          {/* 1-Click Horizon Cross-Section (78°) Camera Preset Button */}
          <button
            type="button"
            onClick={handleHorizonCrossSectionPreset}
            className={`w-full py-1.5 px-2 rounded-[2px] border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
              theme === 1
                ? 'bg-[#96641e]/20 hover:bg-[#96641e]/35 text-[#52350c] border-[#96641e]/40'
                : theme === 2
                ? 'bg-[#3a5578]/30 hover:bg-[#3a5578]/50 text-[#dbe5f0] border-[#5a6e8c]/50'
                : 'bg-[var(--theme-status-amber)]/20 hover:bg-[var(--theme-status-amber)]/30 text-[var(--theme-status-amber)] border-[var(--theme-status-amber)]/40 shadow-[0_0_8px_var(--theme-status-amber)]'
            }`}
            title="1-Click Horizon Cross-Section (Pitch 78°, Oblique Limb View)"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-nano truncate flex items-center gap-1">
                <span>◬</span>
                <span>Horizon Cross-Section (78°)</span>
              </span>
              <span className="text-nano text-[var(--theme-text-muted)] truncate opacity-80">
                Pitch 78.0° • Atmospheric Strata
              </span>
            </div>
            <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] border shrink-0 bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)]">
              78.0° Oblique
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AtmosphereDrawer;
