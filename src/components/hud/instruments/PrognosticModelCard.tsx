// ============================================================================
// File: src/components/hud/instruments/PrognosticModelCard.tsx
// Consolidated Prognostic Model & NWP Tensor Telemetry Instrument (Requirement R5)
// Consolidates: Model Selector, Variable Selector, Zarr v3 Provenance & Lead Time Scrubber
// Medium-Adaptive SVG: Cream (Synoptic Isobars), Cyanotype (CAD Voronoi Mesh), Tharp (Baroclinic Contours)
// Invariants: §2 (Clearance), §4 (Single-Border Enclosure), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { VernierSlider } from '../../ui/VernierSlider';
import { MeteorologicalProvenance } from '../../../core/data/WeatherNextDataSource';

export type PrognosticModelBackend =
  | 'noaa-gfs'
  | 'weathernext3'
  | 'google-weathernext3'
  | 'gfs'
  | 'weathernext'
  | 'ecmwf'
  | 'off'
  | 'climatology';

export interface PrognosticModelCardProps {
  prognosticModel?: PrognosticModelBackend;
  model?: PrognosticModelBackend;
  onPrognosticModelChange?: (model: PrognosticModelBackend) => void;
  onModelChange?: (model: PrognosticModelBackend) => void;
  prognosticVariable?: string;
  variable?: string;
  onPrognosticVariableChange?: (variable: string) => void;
  onVariableChange?: (variable: string) => void;
  leadTimeHours?: number; // 0 to 240, default 24
  onLeadTimeChange?: (hours: number) => void;
  timelineMinutes?: number;
  onTimelineChange?: (minutes: number) => void;
  weatherNextDataSource?: any;
  onTogglePlanetaryLayer?: (id: string, force?: boolean) => void;
  theme?: 0 | 1 | 2; // 0: Marie Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  isLight?: boolean;
  className?: string;
  provenance?: MeteorologicalProvenance;
  windSpeedMultiplier?: number;
  onWindSpeedMultiplierChange?: (v: number) => void;
  windParticleLifetime?: number;
  onWindParticleLifetimeChange?: (v: number) => void;
  isWindActive?: boolean;
}

export const PrognosticModelCard: React.FC<PrognosticModelCardProps> = ({
  prognosticModel: propModel,
  model: propModelAlias,
  onPrognosticModelChange,
  onModelChange,
  prognosticVariable: propVariable,
  variable: propVariableAlias,
  onPrognosticVariableChange,
  onVariableChange,
  leadTimeHours: propLeadTimeHours,
  onLeadTimeChange,
  timelineMinutes,
  onTimelineChange,
  weatherNextDataSource,
  onTogglePlanetaryLayer,
  theme: propTheme,
  isLight = false,
  className = '',
  provenance,
  windSpeedMultiplier: propWindSpeed,
  onWindSpeedMultiplierChange,
  windParticleLifetime: propWindLifetime,
  onWindParticleLifetimeChange,
  isWindActive = false,
}) => {
  // 1. Dual-mode state management (Controlled with internal fallback)
  const [internalModel, setInternalModel] = useState<PrognosticModelBackend>('weathernext3');
  const [internalVariable, setInternalVariable] = useState<string>('total_precipitation_1hr_mean');
  const [internalLeadTime, setInternalLeadTime] = useState<number>(24);

  const rawModel =
    propModel !== undefined
      ? propModel
      : propModelAlias !== undefined
      ? propModelAlias
      : internalModel;

  const rawVariable =
    propVariable !== undefined
      ? propVariable
      : propVariableAlias !== undefined
      ? propVariableAlias
      : internalVariable;

  // Calculate lead time from prop, timelineMinutes, or internal state
  const leadTimeHours = useMemo(() => {
    if (propLeadTimeHours !== undefined && Number.isFinite(propLeadTimeHours)) {
      return Math.max(0, Math.min(240, Math.round(propLeadTimeHours / 6) * 6));
    }
    if (timelineMinutes !== undefined && Number.isFinite(timelineMinutes)) {
      if (timelineMinutes <= 0) return 0;
      return Math.max(0, Math.min(240, Math.floor(timelineMinutes / 60)));
    }
    return internalLeadTime;
  }, [propLeadTimeHours, timelineMinutes, internalLeadTime]);

  const activeTheme: 0 | 1 | 2 =
    propTheme !== undefined ? propTheme : isLight ? 1 : 0;

  // 2. Model Normalization & Synonyms
  const normalizedModel = useMemo<PrognosticModelBackend>(() => {
    if (rawModel === 'google-weathernext3' || rawModel === 'weathernext' || rawModel === 'weathernext3') {
      return 'weathernext3';
    }
    if (rawModel === 'noaa-gfs' || rawModel === 'gfs') {
      return 'gfs';
    }
    if (rawModel === 'ecmwf') return 'ecmwf';
    if (rawModel === 'off' || rawModel === 'climatology') return 'off';
    return 'gfs';
  }, [rawModel]);

  const isWeatherNext = normalizedModel === 'weathernext3';

  // 3. Variable Normalization & Synonyms
  const normalizedVariable = useMemo<string>(() => {
    if (rawVariable === 'tcwv' || rawVariable === 'total_precipitation_1hr_mean') {
      return 'total_precipitation_1hr_mean';
    }
    if (rawVariable === 'cape' || rawVariable === 'temperature_2m_mean') {
      return 'temperature_2m_mean';
    }
    if (rawVariable === 'ivt' || rawVariable === 'wind_10m_vector') {
      return 'wind_10m_vector';
    }
    if (rawVariable === 'z500' || rawVariable === 'geopotential_500hpa') {
      return 'geopotential_500hpa';
    }
    return rawVariable || 'total_precipitation_1hr_mean';
  }, [rawVariable]);

  // Decoupled Wind Dynamics Visibility: active when wind variable is selected OR wind layer active
  const isWindVariable =
    normalizedVariable === 'wind_10m_vector' ||
    normalizedVariable === 'ivt' ||
    normalizedVariable.toLowerCase().includes('wind');

  const showWindDynamics =
    (normalizedModel !== 'off' && (isWindVariable || Boolean(isWindActive))) ||
    Boolean(isWindActive);

  // Wind Advection Dynamics State & Direct Zero-Placebo Dispatch
  const [internalWindSpeed, setInternalWindSpeed] = useState<number>(1.0);
  const curWindSpeed = propWindSpeed !== undefined ? propWindSpeed : internalWindSpeed;
  const handleWindSpeedChange = useCallback(
    (val: number) => {
      setInternalWindSpeed(val);
      onWindSpeedMultiplierChange?.(val);
      if (typeof window !== 'undefined') {
        if (typeof (window as any).__INDICATRIX_SET_WIND_SPEED_MULTIPLIER__ === 'function') {
          (window as any).__INDICATRIX_SET_WIND_SPEED_MULTIPLIER__(val);
        }
        const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__ || (window as any).__ENGINE;
        if (engine && typeof engine.setWindSpeedMultiplier === 'function') {
          engine.setWindSpeedMultiplier(val);
        }
      }
    },
    [onWindSpeedMultiplierChange]
  );

  const [internalWindLifetime, setInternalWindLifetime] = useState<number>(6.0);
  const curWindLifetime = propWindLifetime !== undefined ? propWindLifetime : internalWindLifetime;
  const handleWindLifetimeChange = useCallback(
    (val: number) => {
      setInternalWindLifetime(val);
      onWindParticleLifetimeChange?.(val);
      if (typeof window !== 'undefined') {
        if (typeof (window as any).__INDICATRIX_SET_WIND_PARTICLE_LIFETIME__ === 'function') {
          (window as any).__INDICATRIX_SET_WIND_PARTICLE_LIFETIME__(val);
        }
        const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__ || (window as any).__ENGINE;
        if (engine && typeof engine.setWindParticleLifetime === 'function') {
          engine.setWindParticleLifetime(val);
        }
      }
    },
    [onWindParticleLifetimeChange]
  );

  // 4. Interactive Viewport & Drag Caliper Logic
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateLeadTimeFromPointer = useCallback(
    (clientX: number) => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // Caliper active track: x in [24, 256] within 280 viewBox
      const trackMin = 24 / 280;
      const trackSpan = (256 - 24) / 280;
      const trackNorm = Math.max(0, Math.min(1, (normX - trackMin) / trackSpan));

      const rawHours = trackNorm * 240;
      const steppedHours = Math.round(rawHours / 6) * 6; // 6-hour forecast interval steps
      const clampedHours = Math.max(0, Math.min(240, steppedHours));

      setInternalLeadTime(clampedHours);
      onLeadTimeChange?.(clampedHours);
      onTimelineChange?.(clampedHours * 60);

      // Window bridge and attached data source dispatch
      if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__) {
        (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__(clampedHours * 60);
      }
      if (isWeatherNext) {
        const ds = weatherNextDataSource || (typeof window !== 'undefined' && (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__);
        if (ds && typeof ds.setTime === 'function') {
          ds.setTime(clampedHours, 0.0);
        }
      }
    },
    [isWeatherNext, weatherNextDataSource, onLeadTimeChange, onTimelineChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Graceful fallback
    }
    updateLeadTimeFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateLeadTimeFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Graceful fallback
    }
  };

  const handleReset = () => {
    setInternalLeadTime(24);
    onLeadTimeChange?.(24);
    onTimelineChange?.(24 * 60);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__) {
      (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__(24 * 60);
    }
    if (isWeatherNext) {
      const ds = weatherNextDataSource || (typeof window !== 'undefined' && (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__);
      if (ds && typeof ds.setTime === 'function') {
        ds.setTime(24, 0.0);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    let delta = 0;
    if (e.key === 'ArrowRight') {
      delta = e.shiftKey ? 24 : 6;
    } else if (e.key === 'ArrowLeft') {
      delta = e.shiftKey ? -24 : -6;
    } else if (e.key === 'ArrowUp') {
      delta = 24;
    } else if (e.key === 'ArrowDown') {
      delta = -24;
    } else if (e.key === 'Home') {
      delta = -leadTimeHours;
    } else if (e.key === 'End') {
      delta = 240 - leadTimeHours;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleReset();
      return;
    }

    if (delta !== 0) {
      e.preventDefault();
      const next = Math.max(0, Math.min(240, leadTimeHours + delta));
      setInternalLeadTime(next);
      onLeadTimeChange?.(next);
      onTimelineChange?.(next * 60);
      if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__) {
        (window as any).__INDICATRIX_SET_TIMELINE_MINUTES__(next * 60);
      }
      if (isWeatherNext) {
        const ds = weatherNextDataSource || (typeof window !== 'undefined' && (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__);
        if (ds && typeof ds.setTime === 'function') {
          ds.setTime(next, 0.0);
        }
      }
    }
  };

  // 5. Model & Variable Change Dispatchers
  const handleModelSelect = (nextModel: PrognosticModelBackend) => {
    setInternalModel(nextModel);
    onPrognosticModelChange?.(nextModel);
    onModelChange?.(nextModel);
    if (
      !onPrognosticModelChange &&
      !onModelChange &&
      typeof window !== 'undefined' &&
      (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__
    ) {
      (window as any).__INDICATRIX_SET_PROGNOSTIC_MODEL__(nextModel);
    }
  };

  const handleVariableSelect = (nextVar: string) => {
    setInternalVariable(nextVar);
    onPrognosticVariableChange?.(nextVar);
    onVariableChange?.(nextVar);
    if (nextVar === 'wind_10m_vector' || nextVar === 'ivt') {
      onTogglePlanetaryLayer?.('noaa-gfs-wind', true);
      if (typeof window !== 'undefined') {
        const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__ || {};
        live.showSurfaceWinds = true;
        live.showWind = true;
        (window as any).__INDICATRIX_LIVE_UNIFORMS__ = live;
      }
    }
    if (
      !onPrognosticVariableChange &&
      !onVariableChange &&
      typeof window !== 'undefined' &&
      (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__
    ) {
      (window as any).__INDICATRIX_SET_PROGNOSTIC_VARIABLE__(nextVar);
    }
  };

  // Caliper horizontal position in viewBox [0 0 280 110]
  const t = leadTimeHours / 240;
  const caliperX = Math.round(24 + t * 232);

  // Model resolution and specification badges
  const modelMetadata = useMemo(() => {
    switch (normalizedModel) {
      case 'weathernext3':
        return { name: 'WeatherNext AI', res: '0.1° / 10km', tensor: 'GraphCast GNN / Zarr v3', badge: '0.1° AI' };
      case 'ecmwf':
        return { name: 'ECMWF IFS', res: '9km HRES', tensor: 'Spectral Tco1279 / L137', badge: '9km IFS' };
      case 'gfs':
        return { name: 'NOAA GFS', res: '13km / 0.25°', tensor: 'Finite-Volume Cubed-Sphere', badge: '0.25° GFS' };
      case 'off':
      default:
        return { name: 'Climatology', res: '1.0° Normal', tensor: 'ERA5 30-Yr Climatology', badge: '1.0° CLIM' };
    }
  }, [normalizedModel]);

  return (
    <div
      data-instrument="prognostic-model"
      className={`p-2 rounded-[3px] border shadow-sm transition-all space-y-3 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header & Lead Time */}
      <div className="flex items-start justify-between text-micro font-mono border-b border-[var(--theme-card-border-50)] pb-2 mb-2">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              PROGNOSTIC MODEL
            </span>
          </div>
          <span className="text-nano text-[var(--theme-text-muted)] truncate pl-3" title="Numerical Weather Prediction & Tensor Telemetry">
            NWP & Tensor Telemetry
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-nano shrink-0">
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)] pt-0.5">
            {modelMetadata.badge}
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Lead:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-accent)] text-micro bg-[var(--theme-instrument-caliper-badge-bg)] text-[var(--theme-instrument-caliper-badge-text)] px-1 rounded-[1px]">
            T+{leadTimeHours}h
          </span>
        </div>
      </div>

      {/* 2. Controls: Model & Variable */}
      <div className="space-y-2.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-nano font-mono px-0.5">
            <span className="font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider">
              Simulation Engine
            </span>
            <span className="text-[var(--theme-text-muted)] text-nano">
              {modelMetadata.name} ({modelMetadata.res})
            </span>
          </div>
          <SegmentedControl<PrognosticModelBackend>
            size="sm"
            value={normalizedModel}
            onChange={handleModelSelect}
            className="grid grid-cols-2 gap-1 w-full"
            options={[
              {
                id: 'weathernext3',
                domId: 'sidebar-model-weathernext',
                label: 'WeatherNext 3',
                sublabel: 'Graph Neural Net',
                title: 'Google DeepMind WeatherNext 3',
                className: 'w-full',
              },
              {
                id: 'gfs',
                domId: 'sidebar-model-gfs',
                label: 'NOAA GFS',
                sublabel: 'Finite-Volume',
                title: 'NOAA GFS FV3',
                className: 'w-full',
              },
              {
                id: 'ecmwf',
                domId: 'sidebar-model-ecmwf',
                label: 'ECMWF IFS',
                sublabel: 'Spectral HRES',
                title: 'ECMWF IFS',
                className: 'w-full',
              },
              {
                id: 'off',
                domId: 'sidebar-model-off',
                label: 'Climatology',
                sublabel: 'Empirical Mean',
                title: 'Climatology Baseline',
                className: 'w-full',
              },
            ]}
          />
        </div>

        {isWeatherNext && (
          <div className="space-y-1 pt-1 border-t border-[var(--theme-card-border-30)]">
            <div className="flex items-center justify-between text-nano font-mono px-0.5 pt-0.5">
              <span className="font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider">
                Prognostic Variable
              </span>
              <span className="text-[var(--theme-text-muted)] text-nano">
                {normalizedVariable === 'wind_10m_vector'
                  ? '10m Velocity Vector'
                  : normalizedVariable === 'temperature_2m_mean'
                  ? '2m Ambient Surface'
                  : normalizedVariable === 'geopotential_500hpa'
                  ? '500hPa Geopotential'
                  : 'Total Column Water'}
              </span>
            </div>
            <SegmentedControl<string>
              size="sm"
              value={normalizedVariable}
              onChange={handleVariableSelect}
              className="grid grid-cols-4 gap-1 w-full"
              options={[
                {
                  id: 'total_precipitation_1hr_mean',
                  domId: 'sidebar-variable-rain',
                  label: 'Rain',
                  sublabel: 'Column',
                  title: 'Total Column Precipitation',
                  className: 'w-full',
                },
                {
                  id: 'temperature_2m_mean',
                  domId: 'sidebar-variable-temp',
                  label: 'Temp',
                  sublabel: '2m Sfc',
                  title: '2m Surface Temperature',
                  className: 'w-full',
                },
                {
                  id: 'wind_10m_vector',
                  domId: 'sidebar-variable-wind',
                  label: 'Wind',
                  sublabel: '10m Vec',
                  title: '10m Wind Velocity Vector',
                  className: 'w-full',
                },
                {
                  id: 'geopotential_500hpa',
                  domId: 'sidebar-variable-z500',
                  label: 'Height',
                  sublabel: '500hPa',
                  title: '500 hPa Geopotential Height',
                  className: 'w-full',
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* 3. Interactive SVG Viewport */}
      <div className="space-y-1 pt-1 border-t border-[var(--theme-card-border-30)] mt-2.5">
        <div className="flex items-center justify-between text-nano font-mono px-0.5">
          <span className="font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider">
            Lead Time Scrubber
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="text-[var(--theme-text-accent)] hover:underline cursor-pointer"
          >
            [RESET]
          </button>
        </div>
        <div
          ref={viewportRef}
          tabIndex={0}
          role="slider"
          aria-label="Prognostic Forecast Lead Time and NWP Tensor Grid"
          aria-valuemin={0}
          aria-valuemax={240}
          aria-valuenow={leadTimeHours}
          aria-valuetext={`+${leadTimeHours}h Forecast Lead Time`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleReset}
          onKeyDown={handleKeyDown}
          title="Drag lead time cursor horizontally (T+0h to T+240h) • Arrow keys step • Double-click to reset"
          className={`relative w-full h-36 rounded-[2px] overflow-hidden cursor-ew-resize select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none bg-[var(--theme-instrument-viewport-bg)] border-[var(--theme-instrument-viewport-border)]`}
        >
          <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 280 140"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern id="prog-cyanotype-grid" width="20" height="20" patternUnits="userSpaceOnUse" x={-t * 40}>
              <line x1="0" y1="0" x2="20" y2="0" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.4" strokeOpacity="0.2" />
              <line x1="0" y1="0" x2="0" y2="20" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.4" strokeOpacity="0.2" />
            </pattern>
            <linearGradient id="fade-edges" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--theme-instrument-viewport-bg)" stopOpacity="1" />
              <stop offset="10%" stopColor="var(--theme-instrument-viewport-bg)" stopOpacity="0" />
              <stop offset="90%" stopColor="var(--theme-instrument-viewport-bg)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--theme-instrument-viewport-bg)" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Background Strata */}
          {activeTheme === 2 && (
            <rect x="0" y="0" width="280" height="140" fill="url(#prog-cyanotype-grid)" />
          )}

          {/* Caliper Vertical Guideline */}
          <line
            x1={caliperX}
            y1="22"
            x2={caliperX}
            y2="115"
            style={{ stroke: 'var(--theme-instrument-caliper)' }}
            strokeWidth="1.2"
            strokeDasharray="4 2"
            opacity="0.8"
          />

          {/* 3-Medium Adaptive Visual Artifacts */}
          {activeTheme === 1 ? (
            // Theme 1 (Cream Rag Paper): 19th-Century Synoptic Chart Isobar Engraving
            <g className="prognostic-model-cream text-[var(--theme-instrument-ink)]">
              
              {/* Dynamic Components */}
              <g transform={`translate(${t * 50}, 0)`}>
                {/* Low Pressure Cyclonic Isobars */}
                <circle cx="75" cy="70" r="16" fill="none" stroke="currentColor" strokeWidth="0.8" />
                <circle cx="75" cy="70" r="32" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="3 2" />
                <circle cx="75" cy="70" r="48" fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="5 3" />
                <text x="75" y="74" textAnchor="middle" fill="currentColor" fontSize="12" fontFamily="serif" fontWeight="bold">B</text>
                <text x="75" y="83" textAnchor="middle" fill="currentColor" fontSize="5.5" fontFamily="serif" fontStyle="italic">996 hPa</text>
                <text x="100" y="66" fill="currentColor" fontSize="5" fontFamily="monospace" opacity="0.8" paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">1000</text>
                <text x="115" y="55" fill="currentColor" fontSize="5" fontFamily="monospace" opacity="0.8" paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">1004</text>
                
                {/* Wind Barbs */}
                <g stroke="currentColor" strokeWidth="0.6" fill="none">
                  <line x1="45" y1="45" x2="60" y2="55" />
                  <line x1="45" y1="45" x2="43" y2="50" />
                  <line x1="49" y1="47" x2="47" y2="52" />
                  <line x1="100" y1="90" x2="85" y2="80" />
                  <line x1="100" y1="90" x2="102" y2="85" />
                </g>
              </g>

              <g transform={`translate(${-t * 30}, ${t * 15})`}>
                {/* High Pressure Anticyclonic Isobars */}
                <circle cx="210" cy="65" r="20" fill="none" stroke="currentColor" strokeWidth="0.8" />
                <circle cx="210" cy="65" r="40" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="4 2" />
                <text x="210" y="69" textAnchor="middle" fill="currentColor" fontSize="12" fontFamily="serif" fontWeight="bold">H</text>
                <text x="210" y="78" textAnchor="middle" fill="currentColor" fontSize="5.5" fontFamily="serif" fontStyle="italic">1024 hPa</text>
                <text x="238" y="58" fill="currentColor" fontSize="5" fontFamily="monospace" opacity="0.8" paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">1020</text>
                
                {/* Wind Barbs */}
                <g stroke="currentColor" strokeWidth="0.6" fill="none">
                  <line x1="180" y1="45" x2="195" y2="55" />
                  <line x1="180" y1="45" x2="182" y2="50" />
                  <line x1="235" y1="85" x2="220" y2="75" />
                  <line x1="235" y1="85" x2="233" y2="80" />
                </g>
              </g>

              <g transform={`translate(${t * 70}, 0)`}>
                {/* Frontal Boundary */}
                <path d="M 130 25 Q 140 65 155 115" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <polygon points="133,40 141,45 135,49" fill="currentColor" />
                <polygon points="138,70 146,75 140,79" fill="currentColor" />
                <polygon points="146,100 154,105 148,109" fill="currentColor" />
              </g>

              {/* Static Labels */}
              <text
                x="24"
                y="108"
                fill="currentColor"
                fontSize="6.5"
                fontFamily="serif"
                fontStyle="italic"
                fontWeight="bold"
                opacity="0.6"
                paintOrder="stroke"
                style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }}
                strokeWidth="3"
              >
                Charta Synoptica Barometrica
              </text>
            </g>
          ) : activeTheme === 2 ? (
            // Theme 2 (Prussian Cyanotype): CAD Computational Mesh & Tensor Lattice
            <g className="prognostic-model-cyanotype text-[var(--theme-instrument-ink)]">
              {/* Chunk Boundaries */}
              <line x1="100" y1="25" x2="100" y2="115" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" />
              <line x1="180" y1="25" x2="180" y2="115" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" />
              <line x1="16" y1="70" x2="264" y2="70" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" />

              {/* Dynamic Chunk Highlights */}
              <g transform={`translate(${-t * 10}, 0)`}>
                <text x="24" y="35" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity={leadTimeHours < 80 ? 1 : 0.4} paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  CHUNK [0, 0] • 256×256
                </text>
                <text x="106" y="35" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity={leadTimeHours >= 80 && leadTimeHours < 160 ? 1 : 0.4} paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  CHUNK [0, 1] • 256×256
                </text>
                <text x="186" y="35" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity={leadTimeHours >= 160 ? 1 : 0.4} paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  CHUNK [0, 2] • 256×256
                </text>

                {/* Voronoi Mesh */}
                <g stroke="currentColor" strokeWidth="0.6" fill="none" opacity="0.75">
                  {/* Left Cluster */}
                  <polygon points="45,50 55,42 65,50 65,65 55,73 45,65" />
                  <polygon points="65,50 75,42 85,50 85,65 75,73 65,65" />
                  <polygon points="55,73 65,65 75,73 75,88 65,96 55,88" />
                  
                  {/* Middle Cluster */}
                  <polygon points="125,50 135,42 145,50 145,65 135,73 125,65" />
                  <polygon points="145,50 155,42 165,50 165,65 155,73 145,65" />
                  <polygon points="135,73 145,65 155,73 155,88 145,96 135,88" />

                  {/* Right Cluster */}
                  <polygon points="205,50 215,42 225,50 225,65 215,73 205,65" />
                  <polygon points="225,50 235,42 245,50 245,65 235,73 225,65" />
                </g>

                {/* Mesh Nodes */}
                {[
                  [45, 50], [55, 42], [65, 50], [75, 42], [85, 50],
                  [125, 50], [135, 42], [145, 50], [155, 42], [165, 50],
                  [205, 50], [215, 42], [225, 50], [235, 42], [245, 50]
                ].map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="2" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />
                ))}
              </g>

              {/* Static Metadata */}
              <text x="256" y="99" textAnchor="end" style={{ fill: 'var(--theme-instrument-ink-secondary)', stroke: 'var(--theme-instrument-caliper-badge-bg)' }} fontSize="6.5" fontFamily="monospace" fontWeight="bold" paintOrder="stroke" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                TENSOR: [B=1, T=24, C=6] FP16
              </text>
              <text x="256" y="108" textAnchor="end" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.7" paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                Tco1279 / N640 • 7424B ROW PITCH
              </text>
            </g>
          ) : (
            // Theme 0 (Marie Tharp): Baroclinic Fluid Contours & Heat Flux Streamlines
            <g className="prognostic-model-tharp text-[var(--theme-instrument-ink)]">
              {/* Dynamic Flow */}
              <g transform={`translate(${-t * 120}, 0)`}>
                {/* Rossby Waves */}
                <path
                  d="M -50 55 Q 55 25 95 60 T 180 55 T 380 50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  opacity="0.85"
                />
                <path
                  d="M -50 75 Q 55 45 95 80 T 180 75 T 380 70"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.0"
                  opacity="0.6"
                />
                <path
                  d="M -50 95 Q 55 65 95 100 T 180 95 T 380 90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.8"
                  opacity="0.4"
                />

                {/* Heat Flux Vectors */}
                <path d="M 40 100 Q 85 80 120 50" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1.2" strokeDasharray="5 3" />
                <path d="M 160 100 Q 205 80 240 50" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1.2" strokeDasharray="5 3" />
                <path d="M 280 100 Q 325 80 360 50" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1.2" strokeDasharray="5 3" />
                
                <polyline points="75,88 82,85 76,79" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1.2" />
                <polyline points="195,88 202,85 196,79" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1.2" />
                <polyline points="315,88 322,85 316,79" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1.2" />
              </g>

              {/* Sounding Trace */}
              <polyline points="230,110 240,80 248,55 255,30" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1" strokeDasharray="3 2" opacity="0.8" />
              <circle cx="240" cy="80" r="2.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />
              <circle cx="248" cy="55" r="2.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />
              <circle cx="255" cy="30" r="2.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />

              {/* Static Annotations (Moved out of caliper path) */}
              <text x="24" y="100" fill="currentColor" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity="0.9" paintOrder="stroke" style={{ stroke: 'var(--theme-instrument-caliper-badge-bg)' }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                BAROCLINIC • Rossby λ = 4200 km
              </text>
              <text x="24" y="108" style={{ fill: 'var(--theme-instrument-ink-secondary)', stroke: 'var(--theme-instrument-caliper-badge-bg)' }} fontSize="6.5" fontFamily="monospace" opacity="0.8" paintOrder="stroke" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                OCEANIC FLUX: Q = +142 W/m²
              </text>
            </g>
          )}

          {/* Timeline Axis (Always at bottom) */}
          <line x1="24" y1="115" x2="256" y2="115" stroke="currentColor" strokeWidth="1" opacity="0.8" />
          {[0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240].map((h) => {
            const tx = 24 + (h / 240) * 232;
            const isMilestone = h % 48 === 0;
            return (
              <g key={h}>
                <line x1={tx} y1={isMilestone ? "110" : "112"} x2={tx} y2="115" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth={isMilestone ? "1" : "0.5"} />
                {isMilestone && (
                  <text x={tx} y="125" textAnchor="middle" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} fontSize="6.5" fontFamily="monospace" fontWeight="bold">
                    +{h}h
                  </text>
                )}
              </g>
            );
          })}

          {/* Interactive Lead-Time Caliper Flag (Always at top, separated from data) */}
          <g>
            <rect
              x={caliperX - 22}
              y="4"
              width="44"
              height="16"
              rx="3"
              style={{
                fill: 'var(--theme-instrument-caliper-badge-bg)',
                stroke: 'var(--theme-instrument-caliper)'
              }}
              strokeWidth="1"
              fillOpacity="1"
              className="drop-shadow"
            />
            <text
              x={caliperX}
              y="15"
              textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="7.5"
              fontFamily="monospace"
              fontWeight="bold"
            >
              T+{leadTimeHours}h
            </text>

            {/* Bottom Caliper Diamond */}
            <polygon
              points={`${caliperX},112 ${caliperX + 4},116 ${caliperX},120 ${caliperX - 4},116`}
              style={{ fill: 'var(--theme-instrument-caliper)' }}
            />
          </g>

          {/* Vignette overlay to fade out edges if they overflow */}
          <rect x="0" y="0" width="280" height="140" fill="url(#fade-edges)" className="pointer-events-none" />
        </svg>
        </div>
      </div>

      {/* 4. Lagrangian Advection Dynamics */}
      {showWindDynamics && (
        <div className="space-y-1.5 pt-1.5 border-t border-[var(--theme-card-border-30)]">
          <div className="flex items-center justify-between text-nano font-mono px-0.5">
            <span className="font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider">
              Lagrangian Advection
            </span>
            <span className="text-[var(--theme-text-muted)] text-nano uppercase tracking-widest font-mono">
              Geodesic RK2
            </span>
          </div>
          <VernierSlider
            id="wind-speed-multiplier-slider"
            label="Speed Multiplier"
            sublabel="Eulerian flow magnitude"
            value={curWindSpeed}
            defaultValue={1.0}
            min={0.1}
            max={10.0}
            step={0.1}
            unit="×"
            readout={`${curWindSpeed.toFixed(1)}×`}
            onChange={handleWindSpeedChange}
          />
          <VernierSlider
            id="wind-particle-lifetime-slider"
            label="Particle Lifetime"
            sublabel="Lagrangian decay"
            value={curWindLifetime}
            defaultValue={6.0}
            min={0.5}
            max={20.0}
            step={0.5}
            unit="s"
            readout={`${curWindLifetime.toFixed(1)}s`}
            onChange={handleWindLifetimeChange}
          />
        </div>
      )}

      {/* 5. Integrated Data Provenance */}
      {isWeatherNext && (
        <div className="p-2 rounded-[2px] border border-[var(--theme-control-border-60)] bg-[var(--theme-control-bg-40)] space-y-1.5 font-mono text-nano text-[var(--theme-text-muted)] mt-1.5">
          {/* Top Status Banner */}
          <div className="flex items-center justify-between border-b border-[var(--theme-control-border-30)] pb-1.5 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--theme-status-sage)] font-bold">● GCS Zarr v3</span>
              <span>•</span>
              <span>3-Slot Ring Buffer</span>
            </div>
            <span className="font-bold text-[var(--theme-text-primary)]">
              {leadTimeHours > 0 ? `+${leadTimeHours}h Forecast` : '0h Analysis'}
            </span>
          </div>

          {/* Detailed Provenance Metadata Grid */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-micro opacity-85">
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Resolution:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">
                {provenance ? `${provenance.spatialResolutionDeg}° (~10 km)` : '0.1° (~10 km)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Chunk Spec:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">256×256 FP16</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Cycle:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">
                {provenance?.runTimestamp ? (provenance.runTimestamp.includes('T') ? provenance.runTimestamp.slice(11, 13) + 'Z Hybrid' : provenance.runTimestamp) : '00Z Hybrid'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Ensemble Spread:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">±0.42 m/s</span>
            </div>
            {provenance && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--theme-text-secondary)]">Temporal Blend:</span>
                  <span className="font-bold text-[var(--theme-text-primary)]">
                    τ={provenance.temporalBlendTau.toFixed(2)} (Slot {provenance.activeSlotIndex})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--theme-text-secondary)]">Valid Prediction:</span>
                  <span className="font-bold text-[var(--theme-text-primary)] truncate max-w-[85px]" title={provenance.validTimestamp}>
                    {provenance.validTimestamp.includes('T') ? provenance.validTimestamp.slice(11, 16) + 'Z' : provenance.validTimestamp}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrognosticModelCard;
