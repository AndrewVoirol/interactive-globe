// ============================================================================
// File: src/components/hud/instruments/PrognosticModelCard.tsx
// Consolidated Prognostic Model & NWP Tensor Telemetry Instrument (Requirement R5)
// Consolidates: Model Selector, Variable Selector, Zarr v3 Provenance & Lead Time Scrubber
// Medium-Adaptive SVG: Cream (Synoptic Isobars), Cyanotype (CAD Voronoi Mesh), Tharp (Baroclinic Contours)
// Invariants: §2 (Clearance), §4 (Single-Border Enclosure), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { SegmentedControl } from '../../ui/SegmentedControl';

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
}) => {
  // 1. Dual-mode state management (Controlled with internal fallback)
  const [internalModel, setInternalModel] = useState<PrognosticModelBackend>('gfs');
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
          ds.setTime(Math.min(47, clampedHours), 0.0);
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
          ds.setTime(Math.min(47, next), 0.0);
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
    if (nextVar === 'wind_10m_vector') {
      onTogglePlanetaryLayer?.('noaa-gfs-wind', true);
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

  // 6. Theme Tokens for SVG Viewport
  const tokens =
    activeTheme === 2
      ? {
          viewportBg: 'bg-[#0d1724]',
          viewportBorder: 'border-[#3b597a]/60',
          cursorColor: '#70b7ff',
          badgeBg: '#0e1824',
          textColor: '#a5d5ff',
        }
      : activeTheme === 1
      ? {
          viewportBg: 'bg-[#fdfcf9]',
          viewportBorder: 'border-[#b8ad98]/60',
          cursorColor: '#8c4820',
          badgeBg: '#fdfcf9',
          textColor: '#8c4820',
        }
      : {
          viewportBg: 'bg-[#0c1219]',
          viewportBorder: 'border-[#3a4d61]/60',
          cursorColor: '#00e5ff',
          badgeBg: '#0a111a',
          textColor: '#00e5ff',
        };

  // Caliper horizontal position in viewBox [0 0 280 110]
  const caliperX = Math.round(24 + (leadTimeHours / 240) * 232);

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
      className={`p-2 rounded-[3px] border shadow-sm transition-all space-y-2 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header */}
      <div className="flex items-center justify-between text-micro font-mono">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              PROGNOSTIC MODEL
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Numerical Weather Prediction & Tensor Telemetry
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1">
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {modelMetadata.badge}
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Lead:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-accent)]">
            T+{leadTimeHours}h
          </span>
        </div>
      </div>

      {/* 2. Interactive SVG Viewport: Synoptic Isolines, CAD Mesh & Baroclinic Wave */}
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
        className={`relative w-full h-28 rounded-[2px] border overflow-hidden cursor-ew-resize select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${tokens.viewportBg} ${tokens.viewportBorder}`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 280 110"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="prog-cyanotype-grid" width="16" height="16" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="16" y2="0" stroke="#4fa3e3" strokeWidth="0.3" strokeOpacity="0.25" />
              <line x1="0" y1="0" x2="0" y2="16" stroke="#4fa3e3" strokeWidth="0.3" strokeOpacity="0.25" />
            </pattern>
          </defs>

          {/* 3-Medium Adaptive Visual Artifacts */}
          {activeTheme === 1 ? (
            // Theme 1 (Cream Rag Paper): 19th-Century Synoptic Chart Isobar Engraving
            <g className="prognostic-model-cream text-[#8c4820]">
              {/* Victorian Chart Neatline Frame */}
              <rect x="10" y="8" width="260" height="94" fill="none" stroke="#8c4820" strokeWidth="0.5" strokeOpacity="0.4" />
              <rect x="12" y="10" width="256" height="90" fill="none" stroke="#8c4820" strokeWidth="0.25" strokeOpacity="0.2" />

              {/* Title Cartouche Inscription */}
              <text x="18" y="21" fill="#8c4820" fontSize="6" fontFamily="serif" fontStyle="italic" fontWeight="bold" opacity="0.85">
                Charta Synoptica Barometrica — Isobaræ & Gradientia
              </text>

              {/* Low Pressure Depressions with Cyclonic Isobars */}
              <circle cx="75" cy="55" r="14" fill="none" stroke="#8c4820" strokeWidth="0.75" />
              <circle cx="75" cy="55" r="26" fill="none" stroke="#8c4820" strokeWidth="0.6" strokeDasharray="3 1.5" />
              <circle cx="75" cy="55" r="38" fill="none" stroke="#8c4820" strokeWidth="0.5" strokeDasharray="4 2" />
              <text x="75" y="58" textAnchor="middle" fill="#8c4820" fontSize="10" fontFamily="serif" fontWeight="bold">
                B
              </text>
              <text x="75" y="66" textAnchor="middle" fill="#8c4820" fontSize="5" fontFamily="serif" fontStyle="italic">
                996 hPa
              </text>
              <text x="96" y="52" fill="#8c4820" fontSize="5" fontFamily="monospace" opacity="0.75">1000</text>
              <text x="106" y="44" fill="#8c4820" fontSize="5" fontFamily="monospace" opacity="0.75">1004</text>

              {/* High Pressure Anticyclone with Divergent Isobars */}
              <circle cx="210" cy="50" r="16" fill="none" stroke="#8c4820" strokeWidth="0.75" />
              <circle cx="210" cy="50" r="30" fill="none" stroke="#8c4820" strokeWidth="0.6" strokeDasharray="3 1.5" />
              <text x="210" y="53" textAnchor="middle" fill="#8c4820" fontSize="10" fontFamily="serif" fontWeight="bold">
                H
              </text>
              <text x="210" y="61" textAnchor="middle" fill="#8c4820" fontSize="5" fontFamily="serif" fontStyle="italic">
                1024 hPa
              </text>
              <text x="232" y="46" fill="#8c4820" fontSize="5" fontFamily="monospace" opacity="0.75">1020</text>

              {/* Beaufort Wind Barbs */}
              <g stroke="#8c4820" strokeWidth="0.6" fill="none">
                <line x1="50" y1="36" x2="62" y2="44" />
                <line x1="50" y1="36" x2="48" y2="40" />
                <line x1="53" y1="38" x2="51" y2="42" />

                <line x1="95" y1="72" x2="84" y2="64" />
                <line x1="95" y1="72" x2="97" y2="68" />
                <line x1="92" y1="70" x2="94" y2="66" />

                <line x1="185" y1="38" x2="175" y2="45" />
                <line x1="185" y1="38" x2="187" y2="42" />
                <line x1="230" y1="65" x2="242" y2="58" />
                <line x1="230" y1="65" x2="228" y2="61" />
              </g>

              {/* Frontal Boundary Incline Line with Intaglio Teeth */}
              <path d="M 125 15 Q 135 50 155 100" fill="none" stroke="#8c4820" strokeWidth="1" />
              <polygon points="128,30 134,34 130,37" fill="#8c4820" />
              <polygon points="135,55 141,59 137,62" fill="#8c4820" />
              <polygon points="144,80 150,84 146,87" fill="#8c4820" />

              {/* Bottom Chronometric Horizon Axis */}
              <line x1="24" y1="98" x2="256" y2="98" stroke="#8c4820" strokeWidth="0.75" />
              {[0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240].map((h, i) => {
                const tx = 24 + (h / 240) * 232;
                return (
                  <g key={h}>
                    <line x1={tx} y1="95" x2={tx} y2="98" stroke="#8c4820" strokeWidth="0.6" />
                    {i % 2 === 0 && (
                      <text x={tx} y="105" textAnchor="middle" fill="#8c4820" fontSize="5.5" fontFamily="monospace">
                        +{h}h
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ) : activeTheme === 2 ? (
            // Theme 2 (Prussian Cyanotype): CAD Computational Mesh & Tensor Lattice
            <g className="prognostic-model-cyanotype text-[#4fa3e3]">
              {/* CAD Background Grid */}
              <rect x="0" y="0" width="280" height="110" fill="url(#prog-cyanotype-grid)" />

              {/* Zarr v3 Chunk Boundary Partitions */}
              <line x1="90" y1="12" x2="90" y2="96" stroke="#4fa3e3" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.6" />
              <line x1="180" y1="12" x2="180" y2="96" stroke="#4fa3e3" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.6" />
              <line x1="16" y1="54" x2="264" y2="54" stroke="#4fa3e3" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.6" />

              <text x="20" y="22" fill="#4fa3e3" fontSize="6" fontFamily="monospace" opacity="0.8">
                CHUNK [0, 0] • 256×256
              </text>
              <text x="100" y="22" fill="#4fa3e3" fontSize="6" fontFamily="monospace" opacity="0.8">
                CHUNK [0, 1] • 256×256
              </text>
              <text x="190" y="22" fill="#4fa3e3" fontSize="6" fontFamily="monospace" opacity="0.8">
                CHUNK [0, 2] • 256×256
              </text>

              {/* Icosahedral-Hexagonal Voronoi Nodes & Connections */}
              <g stroke="#4fa3e3" strokeWidth="0.5" fill="none" opacity="0.7">
                <polygon points="45,40 55,34 65,40 65,52 55,58 45,52" />
                <polygon points="65,40 75,34 85,40 85,52 75,58 65,52" />
                <polygon points="55,58 65,52 75,58 75,70 65,76 55,70" />

                <polygon points="135,40 145,34 155,40 155,52 145,58 135,52" />
                <polygon points="155,40 165,34 175,40 175,52 165,58 155,52" />
                <polygon points="145,58 155,52 165,58 165,70 155,76 145,70" />

                <polygon points="215,40 225,34 235,40 235,52 225,58 215,52" />
              </g>

              {/* Node Vertex Dots */}
              {[
                [45, 40], [55, 34], [65, 40], [75, 34], [85, 40],
                [135, 40], [145, 34], [155, 40], [165, 34], [175, 40],
                [215, 40], [225, 34], [235, 40]
              ].map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="1.5" fill="#a5d5ff" />
              ))}

              {/* Tensor Metadata Inscriptions */}
              <text x="20" y="88" fill="#a5d5ff" fontSize="6.5" fontFamily="monospace" fontWeight="bold">
                TENSOR: [B=1, T=24, C=6, H=1801, W=3600] FP16
              </text>
              <text x="20" y="96" fill="#4fa3e3" fontSize="5.5" fontFamily="monospace" opacity="0.8">
                SPECTRAL: Tco1279 / N640 • ROW PITCH: 7424 BYTES (256-BYTE ALIGNED)
              </text>

              {/* Bottom Lead Time Scale */}
              <line x1="24" y1="100" x2="256" y2="100" stroke="#4fa3e3" strokeWidth="0.75" />
              {[0, 48, 96, 144, 192, 240].map((h) => {
                const tx = 24 + (h / 240) * 232;
                return (
                  <g key={h}>
                    <line x1={tx} y1="97" x2={tx} y2="100" stroke="#a5d5ff" strokeWidth="0.75" />
                    <text x={tx} y="107" textAnchor="middle" fill="#a5d5ff" fontSize="5.5" fontFamily="monospace">
                      +{h}h
                    </text>
                  </g>
                );
              })}
            </g>
          ) : (
            // Theme 0 (Marie Tharp): Baroclinic Fluid Contours & Heat Flux Streamlines
            <g className="prognostic-model-tharp text-[#00e5ff]">
              {/* Baroclinic Undulating Rossby Wave Flow Streamlines */}
              <path
                d="M 12 40 Q 55 15 95 45 T 180 40 T 268 35"
                fill="none"
                stroke="#00e5ff"
                strokeWidth="1.2"
                opacity="0.85"
              />
              <path
                d="M 12 55 Q 55 30 95 60 T 180 55 T 268 50"
                fill="none"
                stroke="#00e5ff"
                strokeWidth="0.8"
                opacity="0.6"
              />
              <path
                d="M 12 70 Q 55 45 95 75 T 180 70 T 268 65"
                fill="none"
                stroke="#00e5ff"
                strokeWidth="0.6"
                opacity="0.4"
              />

              {/* Oceanic Heat Flux Divergence Streamlines with Emerald Chevrons */}
              <path
                d="M 40 85 Q 85 70 120 45"
                fill="none"
                stroke="#34d399"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
              <path
                d="M 140 85 Q 185 70 220 45"
                fill="none"
                stroke="#34d399"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
              <polyline points="75,76 80,74 76,70" fill="none" stroke="#34d399" strokeWidth="1" />
              <polyline points="175,76 180,74 176,70" fill="none" stroke="#34d399" strokeWidth="1" />

              {/* Oceanographic Sounding Telemetry Inscriptions */}
              <text x="18" y="20" fill="#00e5ff" fontSize="6.5" fontFamily="monospace" fontWeight="bold">
                BAROCLINIC FLOW • Rossby Wave: λ = 4200 km
              </text>
              <text x="18" y="28" fill="#34d399" fontSize="6" fontFamily="monospace" opacity="0.9">
                OCEANIC HEAT FLUX: Q_net = +142 W/m² • Sea Surface Boundary Layer
              </text>

              {/* Radiosonde Sounding Ascent Trace */}
              <polyline points="230,88 240,65 248,45 255,25" fill="none" stroke="#34d399" strokeWidth="0.75" strokeDasharray="2 2" />
              <circle cx="240" cy="65" r="2" fill="#34d399" />
              <circle cx="248" cy="45" r="2" fill="#34d399" />
              <circle cx="255" cy="25" r="2" fill="#34d399" />

              {/* Bottom Horizon Track */}
              <line x1="24" y1="98" x2="256" y2="98" stroke="#00e5ff" strokeWidth="0.75" />
              {[0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240].map((h, i) => {
                const tx = 24 + (h / 240) * 232;
                return (
                  <g key={h}>
                    <line x1={tx} y1="95" x2={tx} y2="98" stroke="#00e5ff" strokeWidth="0.6" />
                    {i % 2 === 0 && (
                      <text x={tx} y="106" textAnchor="middle" fill="#00e5ff" fontSize="5.5" fontFamily="monospace">
                        +{h}h
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* Interactive Lead-Time Caliper Indicator Cursor */}
          <g>
            {/* Vertical Caliper Guideline */}
            <line
              x1={caliperX}
              y1="10"
              x2={caliperX}
              y2="98"
              stroke={tokens.cursorColor}
              strokeWidth="1.2"
              strokeDasharray="3 1.5"
            />

            {/* Top Indicator Pip */}
            <polygon
              points={`${caliperX - 3},10 ${caliperX + 3},10 ${caliperX},15`}
              fill={tokens.cursorColor}
            />

            {/* Bottom Caliper Diamond */}
            <polygon
              points={`${caliperX},94 ${caliperX + 4},98 ${caliperX},102 ${caliperX - 4},98`}
              fill={tokens.cursorColor}
            />

            {/* Floating Readout Badge */}
            <rect
              x={Math.max(16, Math.min(214, caliperX - 32))}
              y="44"
              width="64"
              height="16"
              rx="2"
              fill={tokens.badgeBg}
              stroke={tokens.cursorColor}
              strokeWidth="0.75"
              fillOpacity="0.92"
            />
            <text
              x={Math.max(16, Math.min(214, caliperX - 32)) + 32}
              y="55"
              textAnchor="middle"
              fill={tokens.textColor}
              fontSize="7.5"
              fontFamily="monospace"
              fontWeight="bold"
            >
              T+{leadTimeHours}h
            </text>
          </g>
        </svg>
      </div>

      {/* 3. SegmentedControl for Model Selection (4 Discrete NWP/AI Backends) */}
      <div className="space-y-1 pt-1 border-t border-[var(--theme-control-border)]/50">
        <div className="flex items-center justify-between text-nano font-mono">
          <span className="font-bold text-[var(--theme-text-primary)] uppercase tracking-wider">
            Prognostic Model
          </span>
          <span className="text-[var(--theme-text-muted)] text-nano">
            {modelMetadata.name} ({modelMetadata.res})
          </span>
        </div>
        <SegmentedControl<PrognosticModelBackend>
          size="sm"
          value={normalizedModel}
          onChange={handleModelSelect}
          className="grid grid-cols-2 sm:grid-cols-4 gap-1 font-mono text-[10px] tracking-wider w-full"
          options={[
            {
              id: 'ecmwf',
              domId: 'sidebar-model-ecmwf',
              label: 'ECMWF IFS',
              sublabel: '9km Spectral',
              title: 'ECMWF IFS HRES (Global Spectral 9km Numerical Weather Prediction)',
              className: 'w-full',
            },
            {
              id: 'gfs',
              domId: 'sidebar-model-gfs',
              label: 'NOAA GFS',
              sublabel: '13km FV3',
              title: 'NOAA GFS FV3 (Finite-Volume Cubed-Sphere 13km / 0.25° NWP)',
              className: 'w-full',
            },
            {
              id: 'weathernext3',
              domId: 'sidebar-model-weathernext',
              label: 'WeatherNext AI',
              sublabel: 'DeepMind WeatherNext 3',
              title: 'Google DeepMind WeatherNext 3 (0.1° / 10km Graph Neural Tensor / Zarr v3)',
              className: 'w-full',
            },
            {
              id: 'off',
              domId: 'sidebar-model-off',
              label: 'Climatology',
              sublabel: 'Baseline Off',
              title: 'Off / Climatology Baseline (Empirical Atmospheric Mean State)',
              className: 'w-full',
            },
          ]}
        />
      </div>

      {/* 4. SegmentedControl for Variable Selection (Conditional on Model Activity) */}
      {isWeatherNext && (
        <div className="space-y-1 pt-1 border-t border-[var(--theme-control-border)]/50">
          <div className="flex items-center justify-between text-nano font-mono">
            <span className="font-bold text-[var(--theme-text-primary)] uppercase tracking-wider">
              Prognostic Variable
            </span>
            <span className="text-[var(--theme-text-muted)] text-nano">
              {normalizedVariable === 'wind_10m_vector'
                ? 'IVT (10m Wind)'
                : normalizedVariable === 'temperature_2m_mean'
                ? 'CAPE (2m Temp)'
                : normalizedVariable === 'geopotential_500hpa'
                ? 'Z500 (500 hPa)'
                : 'TCWV (Rain)'}
            </span>
          </div>
          <SegmentedControl<string>
            size="sm"
            value={normalizedVariable}
            onChange={handleVariableSelect}
            className="grid grid-cols-2 sm:grid-cols-4 gap-1 font-mono text-[10px] tracking-wider w-full"
            options={[
              {
                id: 'total_precipitation_1hr_mean',
                domId: 'sidebar-variable-rain',
                label: 'TCWV',
                sublabel: 'Rain',
                title: 'Total Column Water Vapor & 1hr Precipitation (TCWV / mm/hr)',
                className: 'w-full',
              },
              {
                id: 'temperature_2m_mean',
                domId: 'sidebar-variable-temp',
                label: 'CAPE',
                sublabel: 'Temp',
                title: 'Convective Available Potential Energy & 2m Ambient Temperature (°C / J/kg)',
                className: 'w-full',
              },
              {
                id: 'wind_10m_vector',
                domId: 'sidebar-variable-wind',
                label: 'IVT',
                sublabel: '10m Wind',
                title: 'Integrated Vapor Transport & 10m Wind Velocity Vector Field (rg16float)',
                className: 'w-full',
              },
              {
                id: 'geopotential_500hpa',
                domId: 'sidebar-variable-z500',
                label: 'Z500',
                sublabel: '500 hPa',
                title: 'Geopotential Height Z500 (Mid-Tropospheric Steering Flow)',
                className: 'w-full',
              },
            ]}
          />
        </div>
      )}

      {/* 5. Integrated Data Provenance & WeatherNext Zarr v3 Telemetry */}
      {isWeatherNext && (
        <div className="p-1.5 rounded-[2px] border border-[var(--theme-control-border)]/60 bg-[var(--theme-control-bg)]/40 space-y-1 font-mono text-nano text-[var(--theme-text-muted)]">
          {/* Top Status Banner */}
          <div className="flex items-center justify-between">
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
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 border-t border-[var(--theme-control-border)]/30 text-[9px] opacity-85">
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Resolution:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">0.1° (~10 km)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Chunk Spec:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">256×256 FP16</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Cycle:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">00Z Hybrid</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-text-secondary)]">Ensemble Spread:</span>
              <span className="font-bold text-[var(--theme-text-primary)]">±0.42 m/s</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono pt-1 border-t border-[var(--theme-card-border)]/50 opacity-80">
        <span className="truncate">
          {modelMetadata.name.toUpperCase()} (T+0h .. T+240h)
        </span>
        <button
          type="button"
          onClick={handleReset}
          className="font-bold hover:underline text-[var(--theme-text-accent)] cursor-pointer shrink-0 ml-1"
        >
          [RESET]
        </button>
      </div>
    </div>
  );
};

export default PrognosticModelCard;
