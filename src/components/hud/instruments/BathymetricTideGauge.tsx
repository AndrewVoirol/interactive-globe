// ============================================================================
// File: src/components/hud/instruments/BathymetricTideGauge.tsx
// Precision Horizontal Manometer — Hydrostatic Bathymetric Tide Gauge
// Direct interactive control of Sea Level Offset and Beer-Lambert Water Clarity
//
// Precision surveyor's instrument with:
//   - 320×140 SVG viewBox with L-bracket engineering frame
//   - Continental shelf bathymetric cross-section profile
//   - Graduated depth ruler (left, 3 tick weights) and clarity ruler (right)
//   - Unified caliper with dual-readout badge (vertical = sea level, badge ⇔ = clarity)
//   - Meniscus-style waterline with surface tension curve
//   - Theme-adaptive ornaments (tide staff / manometer tube / CTD column)
//   - Metallic frame gradients (brass / cold steel / gunmetal)
// ============================================================================

import React, { useRef, useCallback, useMemo, useState, useId } from 'react';
import { VernierSlider } from '../../ui/VernierSlider';

// ── SVG Coordinate Space ─────────────────────────────────────────────────────
// ViewBox: 320 × 140 — landscape format matching HypsometricReliefCurve proportions
const VB_W = 320;
const VB_H = 140;
const PLOT_LEFT = 40;
const PLOT_RIGHT = 290;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 118;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;  // 250
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;  // 106
const BRACKET_LEN = 12;
const BRACKET_W = 2;

// ── Depth Scales ─────────────────────────────────────────────────────────────
// Interactive caliper range (unchanged from original)
const CALIPER_DEPTH_MIN = -150;  // LGM
const CALIPER_DEPTH_MAX = 100;   // Marine Transgression
const CALIPER_SPAN = CALIPER_DEPTH_MAX - CALIPER_DEPTH_MIN; // 250m

// Visual profile extends deeper for geological context
const PROFILE_DEPTH_MIN = -4500;
const PROFILE_DEPTH_MAX = 150;

// ── Frame Gradient Colors (matching PolarSunCompass + HypsometricReliefCurve) ─
const FRAME_GRADIENTS: Record<0 | 1 | 2, Array<{ offset: string; color: string; opacity: number }>> = {
  1: [ // Cream: Warm brass
    { offset: '0%', color: '#A08050', opacity: 0.9 },
    { offset: '35%', color: '#C8A870', opacity: 1 },
    { offset: '65%', color: '#8A6838', opacity: 0.95 },
    { offset: '100%', color: '#D4B880', opacity: 0.85 },
  ],
  2: [ // Prussian: Cold steel
    { offset: '0%', color: '#4A6A88', opacity: 0.9 },
    { offset: '35%', color: '#7094B8', opacity: 1 },
    { offset: '65%', color: '#3A5570', opacity: 0.95 },
    { offset: '100%', color: '#6A90B0', opacity: 0.85 },
  ],
  0: [ // Tharp: Dark gunmetal
    { offset: '0%', color: '#2A3A48', opacity: 0.9 },
    { offset: '35%', color: '#4A6270', opacity: 1 },
    { offset: '65%', color: '#1E2E3C', opacity: 0.95 },
    { offset: '100%', color: '#3A5060', opacity: 0.85 },
  ],
};

export interface BathymetricTideGaugeProps {
  seaLevelOffset?: number; // -150m (LGM Ice Age) to +100m (Marine Transgression)
  waterClarity?: number; // 0.10 to 1.00 (Beer-Lambert optical depth penetration)
  onSeaLevelChange?: (offset: number) => void;
  onWaterClarityChange?: (clarity: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
  children?: React.ReactNode;
}

// ── Depth-to-Y conversion ────────────────────────────────────────────────────
const depthToY = (depthM: number): number => {
  const t = (depthM - CALIPER_DEPTH_MIN) / CALIPER_SPAN;
  return PLOT_BOTTOM - t * PLOT_H;
};

// Profile depth to Y (wider range for continental shelf)
const profileDepthToY = (depthM: number): number => {
  const t = (depthM - PROFILE_DEPTH_MIN) / (PROFILE_DEPTH_MAX - PROFILE_DEPTH_MIN);
  return PLOT_BOTTOM - t * PLOT_H;
};

// ── L-Bracket Frame ──────────────────────────────────────────────────────────
const LBracketFrame: React.FC<{ gradientId: string }> = ({ gradientId }) => {
  const brackets = [
    // Top-left
    `M ${PLOT_LEFT} ${PLOT_TOP + BRACKET_LEN} L ${PLOT_LEFT} ${PLOT_TOP} L ${PLOT_LEFT + BRACKET_LEN} ${PLOT_TOP}`,
    // Top-right
    `M ${PLOT_RIGHT - BRACKET_LEN} ${PLOT_TOP} L ${PLOT_RIGHT} ${PLOT_TOP} L ${PLOT_RIGHT} ${PLOT_TOP + BRACKET_LEN}`,
    // Bottom-left
    `M ${PLOT_LEFT} ${PLOT_BOTTOM - BRACKET_LEN} L ${PLOT_LEFT} ${PLOT_BOTTOM} L ${PLOT_LEFT + BRACKET_LEN} ${PLOT_BOTTOM}`,
    // Bottom-right
    `M ${PLOT_RIGHT - BRACKET_LEN} ${PLOT_BOTTOM} L ${PLOT_RIGHT} ${PLOT_BOTTOM} L ${PLOT_RIGHT} ${PLOT_BOTTOM - BRACKET_LEN}`,
  ];

  return (
    <g className="l-bracket-frame">
      {/* Thin ruled border */}
      <rect
        x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_W} height={PLOT_H}
        fill="none" stroke="var(--theme-instrument-ink)" strokeWidth="0.4" opacity="0.25"
      />
      {/* Metallic gradient L-brackets */}
      {brackets.map((d, i) => (
        <path
          key={`bracket-${i}`} d={d} fill="none"
          stroke={`url(#${gradientId})`} strokeWidth={BRACKET_W}
          strokeLinecap="square" strokeLinejoin="miter"
        />
      ))}
      {/* Inner highlight at reduced opacity */}
      {brackets.map((d, i) => (
        <path
          key={`bracket-hi-${i}`} d={d} fill="none"
          stroke="var(--theme-instrument-ink)" strokeWidth="0.3" opacity="0.15"
        />
      ))}
    </g>
  );
};

// ── Depth Ruler (Left Side) ──────────────────────────────────────────────────
const DepthRuler: React.FC = () => {
  const ticks: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];

  // Generate ticks from -150m to +100m
  for (let depth = CALIPER_DEPTH_MIN; depth <= CALIPER_DEPTH_MAX; depth += 5) {
    const y = depthToY(depth);
    const isMajor = depth % 50 === 0;
    const isMinor = depth % 25 === 0;
    const tickLen = isMajor ? 4 : isMinor ? 2.5 : 1.2;
    const strokeW = isMajor ? 1.0 : isMinor ? 0.6 : 0.3;
    const opacity = isMajor ? 0.8 : isMinor ? 0.5 : 0.25;

    ticks.push(
      <line
        key={`dtick-${depth}`}
        x1={PLOT_LEFT - tickLen} y1={y} x2={PLOT_LEFT} y2={y}
        stroke="var(--theme-instrument-ink)" strokeWidth={strokeW} opacity={opacity}
      />
    );

    // Labels at major ticks
    if (isMajor) {
      labels.push(
        <text
          key={`dlabel-${depth}`}
          x={PLOT_LEFT - tickLen - 1.5} y={y + 2}
          fill="var(--theme-instrument-ink)"
          fontSize="5.5" fontWeight="600" textAnchor="end"
          fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
          opacity="0.6"
        >
          {depth > 0 ? `+${depth}` : `${depth}`}
        </text>
      );
    }
  }

  return <g className="depth-ruler">{ticks}{labels}</g>;
};

// ── Clarity Ruler (Right Side) ───────────────────────────────────────────────
const ClarityRuler: React.FC<{ waterClarity: number }> = ({ waterClarity }) => {
  const ticks: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];

  // Generate ticks from 10% to 100%
  for (let pct = 10; pct <= 100; pct += 5) {
    const t = (pct - 10) / 90; // 0 to 1
    const y = PLOT_BOTTOM - t * PLOT_H;
    const isMajor = pct % 25 === 0;
    const isMinor = pct % 10 === 0;
    const tickLen = isMajor ? 4 : isMinor ? 2.5 : 1.2;
    const strokeW = isMajor ? 1.0 : isMinor ? 0.6 : 0.3;
    const opacity = isMajor ? 0.8 : isMinor ? 0.5 : 0.25;

    ticks.push(
      <line
        key={`ctick-${pct}`}
        x1={PLOT_RIGHT} y1={y} x2={PLOT_RIGHT + tickLen} y2={y}
        stroke="var(--theme-instrument-ink)" strokeWidth={strokeW} opacity={opacity}
      />
    );

    if (isMajor) {
      labels.push(
        <text
          key={`clabel-${pct}`}
          x={PLOT_RIGHT + tickLen + 1.5} y={y + 2}
          fill="var(--theme-instrument-ink)"
          fontSize="5" fontWeight="600" textAnchor="start"
          fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
          opacity="0.55"
        >
          {pct}%
        </text>
      );
    }
  }

  // Clarity indicator line
  const clarityT = (waterClarity * 100 - 10) / 90;
  const clarityY = PLOT_BOTTOM - clarityT * PLOT_H;

  return (
    <g className="clarity-ruler">
      {ticks}{labels}
      {/* Small clarity indicator arrow */}
      <polygon
        points={`${PLOT_RIGHT + 1},${clarityY} ${PLOT_RIGHT + 4},${clarityY - 1.5} ${PLOT_RIGHT + 4},${clarityY + 1.5}`}
        fill="var(--theme-instrument-caliper)" opacity="0.7"
      />
    </g>
  );
};

// ── Continental Shelf Bathymetric Profile ─────────────────────────────────────
const ContinentalProfile: React.FC = () => {
  // Continental Shelf cross-section from coastal plain to abyssal plain
  // Rendered within the caliper range (-150m to +100m) with geological accuracy
  const profilePoints = [
    { x: 0.00, depth: 40 },      // Coastal plain above sea level
    { x: 0.05, depth: 25 },      // Shore approach
    { x: 0.10, depth: 5 },       // Shoreline
    { x: 0.15, depth: -15 },     // Inner continental shelf
    { x: 0.22, depth: -35 },     // Mid shelf
    { x: 0.30, depth: -55 },     // Outer shelf
    { x: 0.38, depth: -85 },     // Shelf edge
    { x: 0.42, depth: -120 },    // Shelf break (steep)
    { x: 0.46, depth: -145 },    // Upper continental slope
    { x: 0.52, depth: -150 },    // Bottom of interactive range
    { x: 0.60, depth: -150 },    // Continues at bottom
    { x: 0.70, depth: -148 },    // Gentle abyssal approach
    { x: 0.80, depth: -150 },    // Abyssal plain region
    { x: 0.90, depth: -150 },    // Deep flat
    { x: 1.00, depth: -150 },    // Right edge
  ];

  const pathPoints = profilePoints.map(({ x, depth }) => {
    const clampedDepth = Math.max(CALIPER_DEPTH_MIN, Math.min(CALIPER_DEPTH_MAX, depth));
    return `${PLOT_LEFT + x * PLOT_W},${depthToY(clampedDepth)}`;
  });

  const profilePath = `M ${pathPoints.join(' L ')} L ${PLOT_RIGHT},${PLOT_BOTTOM} L ${PLOT_LEFT},${PLOT_BOTTOM} Z`;

  return (
    <path
      d={profilePath}
      fill="var(--theme-instrument-ink)"
      opacity="0.08"
      stroke="var(--theme-instrument-ink)"
      strokeWidth="0.6"
      strokeOpacity="0.25"
      className="continental-shelf-profile"
    />
  );
};

// ── Theme-Adaptive Ornaments ─────────────────────────────────────────────────
const ThemeOrnaments: React.FC<{ theme: 0 | 1 | 2 }> = ({ theme }) => {
  if (theme === 1) {
    // Cream Rag: Archival hydrographic tide benchmark staff with calibrated strata
    return (
      <g className="tide-staff-cream" opacity="0.35">
        {/* Vertical ruled staff */}
        <rect
          x={PLOT_LEFT + PLOT_W * 0.85} y={PLOT_TOP + 2}
          width="6" height={PLOT_H - 4}
          fill="none" stroke="currentColor" strokeWidth="0.5"
        />
        {/* Alternating filled/unfilled 25m strata bands */}
        {[0, 2, 4].map((i) => {
          const bandTop = depthToY(CALIPER_DEPTH_MAX - i * 50);
          const bandBot = depthToY(CALIPER_DEPTH_MAX - (i + 1) * 50);
          return (
            <rect
              key={`staff-band-${i}`}
              x={PLOT_LEFT + PLOT_W * 0.85} y={bandTop}
              width="6" height={bandBot - bandTop}
              fill="currentColor" opacity="0.2"
            />
          );
        })}
        {/* Horizontal sounding lines at 25m intervals */}
        {Array.from({ length: 11 }).map((_, i) => {
          const depth = CALIPER_DEPTH_MIN + i * 25;
          const y = depthToY(depth);
          return (
            <line
              key={`sounding-${i}`}
              x1={PLOT_LEFT + PLOT_W * 0.82} y1={y}
              x2={PLOT_LEFT + PLOT_W * 0.93} y2={y}
              stroke="currentColor" strokeWidth={depth === 0 ? 0.8 : 0.4}
              opacity={depth === 0 ? 0.6 : 0.35}
            />
          );
        })}
        {/* Anchor symbol at MSL datum */}
        <circle
          cx={PLOT_LEFT + PLOT_W * 0.88} cy={depthToY(0)}
          r="2" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5"
        />
      </g>
    );
  }

  if (theme === 2) {
    // Prussian Cyanotype: Precision manometer tube with millimeter calibration
    return (
      <g className="manometer-cyanotype" opacity="0.4">
        {/* Capsule-shaped inner tube outline */}
        <rect
          x={PLOT_LEFT + PLOT_W * 0.82} y={PLOT_TOP + 4}
          width="8" height={PLOT_H - 8}
          rx="4" fill="none"
          stroke="currentColor" strokeWidth="0.75"
        />
        {/* Fine millimeter calibration ticks inside tube */}
        {Array.from({ length: 25 }).map((_, i) => {
          const t = i / 24;
          const y = PLOT_TOP + 6 + t * (PLOT_H - 12);
          const isMajor = i % 6 === 0;
          return (
            <line
              key={`mm-${i}`}
              x1={PLOT_LEFT + PLOT_W * 0.90}
              y1={y}
              x2={PLOT_LEFT + PLOT_W * 0.90 + (isMajor ? 8 : 4)}
              y2={y}
              stroke="currentColor"
              strokeWidth={isMajor ? 0.6 : 0.3}
            />
          );
        })}
        {/* Precision center dot */}
        <circle
          cx={PLOT_LEFT + PLOT_W * 0.86} cy={PLOT_TOP + PLOT_H / 2}
          r="1" fill="currentColor" opacity="0.5"
        />
      </g>
    );
  }

  // Marie Tharp: CTD oceanographic bathymetric pressure column with dbar calibrations
  return (
    <g className="ctd-column-tharp" opacity="0.40">
      {/* Vertical sounding wire */}
      <line
        x1={PLOT_LEFT + PLOT_W * 0.86} y1={PLOT_TOP + 2}
        x2={PLOT_LEFT + PLOT_W * 0.86} y2={PLOT_BOTTOM - 2}
        stroke="currentColor" strokeWidth="0.75" strokeDasharray="1 3"
      />
      {/* Pressure calibration circles at depth intervals */}
      {[0, 0.25, 0.5, 0.75, 1.0].map((t, i) => {
        const y = PLOT_TOP + 4 + t * (PLOT_H - 8);
        return (
          <g key={`ctd-${i}`}>
            <line
              x1={PLOT_LEFT + PLOT_W * 0.82} y1={y}
              x2={PLOT_LEFT + PLOT_W * 0.90} y2={y}
              stroke="currentColor" strokeWidth="0.75"
            />
            <circle
              cx={PLOT_LEFT + PLOT_W * 0.86} cy={y}
              r="1.5" fill="currentColor"
            />
          </g>
        );
      })}
      {/* Sonar ping arcs at shelf break depth region */}
      {[6, 10, 14].map((r, i) => (
        <path
          key={`ping-${i}`}
          d={`M ${PLOT_LEFT + PLOT_W * 0.86 - r} ${depthToY(-85)}
              A ${r} ${r} 0 0 1 ${PLOT_LEFT + PLOT_W * 0.86 + r} ${depthToY(-85)}`}
          fill="none" stroke="currentColor" strokeWidth="0.4"
          opacity={0.3 - i * 0.08}
        />
      ))}
    </g>
  );
};

// ── Datum Markers ────────────────────────────────────────────────────────────
const DatumMarkers: React.FC<{ seaLevelOffset: number }> = ({ seaLevelOffset }) => {
  const mslY = depthToY(0);
  const highstandY = depthToY(100);
  const lgmY = depthToY(-150);

  return (
    <g className="datum-markers" fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)">
      {/* +100m (Highstand) — top */}
      <text
        x={PLOT_LEFT + 3} y={highstandY + 3.5}
        fill="var(--theme-text-secondary)" fontSize="5" opacity={seaLevelOffset >= 80 ? 0.35 : 0.7}
      >
        +100 m (Highstand)
      </text>

      {/* 0m (Mean Sea Level) — prominent datum */}
      <line
        x1={PLOT_LEFT} y1={mslY} x2={PLOT_RIGHT} y2={mslY}
        stroke="var(--theme-text-secondary-35)" strokeWidth="0.5" strokeDasharray="3 2"
      />
      <text
        x={PLOT_LEFT + 3} y={mslY + 3.5}
        fill="var(--theme-text-accent)" fontSize="5.5" fontWeight="700"
      >
        0 m (Mean Sea Level)
      </text>

      {/* -150m (Glacial Maximum) — bottom of interactive range */}
      <text
        x={PLOT_LEFT + 3} y={lgmY - 2}
        fill="var(--theme-text-secondary)" fontSize="5" fontWeight="500"
        opacity={seaLevelOffset <= -135 ? 0.35 : 0.75}
      >
        -150 m (Glacial Maximum)
      </text>
    </g>
  );
};

// ── Projection Filaments ─────────────────────────────────────────────────────
const ProjectionFilaments: React.FC<{ caliperY: number }> = ({ caliperY }) => (
  <g className="projection-filaments">
    {/* Horizontal filament to left ruler */}
    <line
      x1={PLOT_LEFT - 5} y1={caliperY} x2={PLOT_LEFT} y2={caliperY}
      stroke="var(--theme-instrument-caliper)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5"
    />
    {/* Horizontal filament to right ruler */}
    <line
      x1={PLOT_RIGHT} y1={caliperY} x2={PLOT_RIGHT + 5} y2={caliperY}
      stroke="var(--theme-instrument-caliper)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5"
    />
  </g>
);

// ── Detent Markers ───────────────────────────────────────────────────────────
const DetentMarkers: React.FC = () => {
  const mslY = depthToY(0);
  return (
    <g className="detent-markers">
      {/* Diamond detent at 0m MSL on left ruler */}
      <polygon
        points={`${PLOT_LEFT - 6},${mslY} ${PLOT_LEFT - 3.5},${mslY - 2.5} ${PLOT_LEFT - 1},${mslY} ${PLOT_LEFT - 3.5},${mslY + 2.5}`}
        fill="var(--theme-text-accent)" opacity="0.6"
      />
    </g>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export const BathymetricTideGauge: React.FC<BathymetricTideGaugeProps> = ({
  seaLevelOffset = 0,
  waterClarity = 0.75,
  onSeaLevelChange = () => {},
  onWaterClarityChange = () => {},
  isLight = false,
  theme = isLight ? 1 : 0,
  children,
}) => {
  const uid = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const isDraggingViewport = useRef(false);
  const isDraggingBadge = useRef(false);
  const lastBadgeClientX = useRef(0);
  const [isHovered, setIsHovered] = useState(false);

  const gradientId = `frame-grad-tide-${uid.replace(/:/g, '')}`;
  const waterGradientId = `water-grad-${uid.replace(/:/g, '')}`;
  const gradientStops = FRAME_GRADIENTS[theme];

  // ── Sea Level pointer handling (vertical drag on viewport) ─────────────
  const updateSeaLevelFromPointer = useCallback(
    (clientY: number) => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      const normY = Math.max(0.04, Math.min(0.96, (clientY - rect.top) / rect.height));
      const bottomPct = (1 - normY) * 100;

      // Range: -150m to +100m (250m span), Step: 5m
      const rawMeters = -150 + (bottomPct / 100) * 250;
      const steppedMeters = Math.round(rawMeters / 5) * 5;
      const clampedMeters = Math.max(-150, Math.min(100, steppedMeters));

      onSeaLevelChange(clampedMeters);
    },
    [onSeaLevelChange]
  );

  const handleViewportPointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingViewport.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* Ignore if synthetic or unsupported */ }
    updateSeaLevelFromPointer(e.clientY);
  }, [updateSeaLevelFromPointer]);

  const handleViewportPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingViewport.current) return;
    updateSeaLevelFromPointer(e.clientY);
  }, [updateSeaLevelFromPointer]);

  const handleViewportPointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingViewport.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* Ignore */ }
  }, []);

  // ── Clarity badge horizontal drag handling ─────────────────────────────
  const handleBadgeDragStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); // Prevent viewport drag
    isDraggingBadge.current = true;
    lastBadgeClientX.current = e.clientX;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* Ignore */ }
  }, []);

  const handleBadgeDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingBadge.current) return;
    const dx = e.clientX - lastBadgeClientX.current;
    // ~200px full drag = 0.90 clarity range (0.10 to 1.00)
    const clarityDelta = (dx / 200) * 0.90;
    const next = Math.max(0.10, Math.min(1.00, waterClarity + clarityDelta));
    const stepped = Math.round(next * 20) / 20; // step 0.05
    onWaterClarityChange(parseFloat(stepped.toFixed(2)));
    lastBadgeClientX.current = e.clientX;
  }, [waterClarity, onWaterClarityChange]);

  const handleBadgeDragEnd = useCallback((e: React.PointerEvent) => {
    isDraggingBadge.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* Ignore */ }
  }, []);

  // ── Computed positions ─────────────────────────────────────────────────
  const caliperY = depthToY(seaLevelOffset);
  const waterPct = Math.max(0, Math.min(100, ((seaLevelOffset - CALIPER_DEPTH_MIN) / CALIPER_SPAN) * 100));
  // Caliper position as percentage of viewport height (from top)
  const caliperTopPct = 100 - waterPct;

  return (
    <div
      data-instrument="bathymetric-tide-gauge"
      className="p-2.5 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] space-y-2"
    >
      {/* Header Row: Title & Live Readout */}
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <span className="font-bold uppercase tracking-wider text-micro flex items-center gap-1.5 text-[var(--theme-text-accent)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)]"></span>
          Bathymetric Tide
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className="text-[var(--theme-text-secondary)]">Sea Level:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {seaLevelOffset > 0 ? `+${seaLevelOffset}m` : `${seaLevelOffset}m`}
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Clarity:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {Math.round(waterClarity * 100)}%
          </span>
        </div>
      </div>

      {/* Interactive Manometer Viewport */}
      <div
        ref={boxRef}
        tabIndex={0}
        role="slider"
        aria-label="Bathymetric Sea Level Gauge"
        aria-valuemin={-150}
        aria-valuemax={100}
        aria-valuenow={seaLevelOffset}
        aria-valuetext={`${seaLevelOffset > 0 ? '+' : ''}${seaLevelOffset}m`}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 25 : 5;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onSeaLevelChange(Math.min(100, seaLevelOffset + step));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onSeaLevelChange(Math.max(-150, seaLevelOffset - step));
          } else if (e.key === 'PageUp') {
            e.preventDefault();
            onSeaLevelChange(Math.min(100, seaLevelOffset + 20));
          } else if (e.key === 'PageDown') {
            e.preventDefault();
            onSeaLevelChange(Math.max(-150, seaLevelOffset - 20));
          } else if (e.key === 'Home') {
            e.preventDefault();
            onSeaLevelChange(-150);
          } else if (e.key === 'End') {
            e.preventDefault();
            onSeaLevelChange(100);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSeaLevelChange(0);
          }
        }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        onDoubleClick={() => onSeaLevelChange(0)}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        title="Drag waterline caliper vertically to raise/lower sea level (Double-click or Enter to reset to 0m, Arrow keys to nudge)"
        className={`relative w-full h-28 rounded-[2px] overflow-hidden cursor-ns-resize select-none touch-none shadow-inner transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none bg-[var(--theme-instrument-viewport-bg)] ${
          isHovered ? 'shadow-[0_0_12px_var(--theme-focus-ring)]' : ''
        }`}
        style={{ touchAction: 'none' }}
      >
        {/* SVG Instrument Overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Frame gradient */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {gradientStops.map((stop, i) => (
                <stop
                  key={i} offset={stop.offset}
                  stopColor={stop.color} stopOpacity={stop.opacity}
                />
              ))}
            </linearGradient>

            {/* Water volume gradient */}
            <linearGradient id={waterGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--theme-instrument-ink-secondary)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--theme-instrument-viewport-bg)" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Continental Shelf Profile (background) */}
          <ContinentalProfile />

          {/* Theme-Adaptive Ornaments */}
          <ThemeOrnaments theme={theme} />

          {/* Dynamic Water Volume */}
          <rect
            x={PLOT_LEFT + 0.5} y={caliperY}
            width={PLOT_W - 1} height={Math.max(0, PLOT_BOTTOM - caliperY)}
            fill={`url(#${waterGradientId})`}
            opacity={0.3 + waterClarity * 0.5}
          />

          {/* Meniscus surface tension curve */}
          {caliperY > PLOT_TOP + 2 && caliperY < PLOT_BOTTOM - 2 && (
            <path
              d={`M ${PLOT_LEFT + 1} ${caliperY}
                  Q ${PLOT_LEFT + 10} ${caliperY - 1.8} ${PLOT_LEFT + 20} ${caliperY}
                  L ${PLOT_RIGHT - 20} ${caliperY}
                  Q ${PLOT_RIGHT - 10} ${caliperY - 1.8} ${PLOT_RIGHT - 1} ${caliperY}`}
              fill="none"
              stroke="var(--theme-instrument-caliper)"
              strokeWidth="0.5" opacity="0.45"
            />
          )}

          {/* Waterline Caliper */}
          <line
            x1={PLOT_LEFT} y1={caliperY}
            x2={PLOT_RIGHT} y2={caliperY}
            stroke="var(--theme-instrument-caliper)"
            strokeWidth="1.5" strokeLinecap="round"
          />

          {/* Projection Filaments */}
          <ProjectionFilaments caliperY={caliperY} />

          {/* Datum Markers */}
          <DatumMarkers seaLevelOffset={seaLevelOffset} />

          {/* Detent Markers */}
          <DetentMarkers />

          {/* Graduated Rulers */}
          <DepthRuler />
          <ClarityRuler waterClarity={waterClarity} />

          {/* L-Bracket Frame (rendered on top for visual crispness) */}
          <LBracketFrame gradientId={gradientId} />
        </svg>

        {/* Caliper Badge (DOM overlay for pointer interaction) */}
        <div
          ref={badgeRef}
          className={`absolute pointer-events-auto cursor-ew-resize px-1.5 py-px rounded-[2px] border font-mono font-bold text-nano shadow-sm transition-transform select-none touch-none
            bg-[var(--theme-instrument-caliper-badge-bg)]
            border-[var(--theme-instrument-caliper)]
            text-[var(--theme-instrument-caliper-badge-text)]
            ${seaLevelOffset >= 85
              ? 'top-auto bottom-[4%]'
              : seaLevelOffset <= -135
              ? 'top-[4%] bottom-auto'
              : 'top-1/2 -translate-y-1/2'
            }`}
          style={{
            left: '50%',
            transform: `translateX(-50%)${seaLevelOffset >= 85 || seaLevelOffset <= -135 ? '' : ' translateY(-50%)'}`,
            top: seaLevelOffset >= 85 ? 'auto' : seaLevelOffset <= -135 ? '4%' : `${caliperTopPct}%`,
            bottom: seaLevelOffset >= 85 ? '4%' : 'auto',
          }}
          onPointerDown={handleBadgeDragStart}
          onPointerMove={handleBadgeDragMove}
          onPointerUp={handleBadgeDragEnd}
          onPointerCancel={handleBadgeDragEnd}
          onDoubleClick={(e) => { e.stopPropagation(); onWaterClarityChange(0.65); }}
          title="Drag horizontally ⇔ to adjust water clarity (Double-click to reset clarity)"
        >
          ◄ {seaLevelOffset > 0 ? `+${seaLevelOffset}m` : `${seaLevelOffset}m`}
          <span className="opacity-40 mx-0.5">⇔</span>
          {Math.round(waterClarity * 100)}% ►
        </div>
      </div>

      {/* Footer: Instruction + Reset */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 px-1 opacity-75">
        <span className="text-[var(--theme-text-secondary)]">
          Drag ↕ sea level · Badge ⇔ clarity
        </span>
        <button
          type="button"
          onClick={() => { onSeaLevelChange(0); onWaterClarityChange(0.65); }}
          className="inline-flex items-center justify-center min-h-[22px] px-1.5 py-0.5 -my-0.5 -mr-1 rounded-[1px] font-bold hover:underline text-[var(--theme-text-accent)] cursor-pointer"
        >
          Reset
        </button>
      </div>

      {/* Beer-Lambert Optical Clarity Absorption Slider (preserved for test compat) */}
      <div className="mt-1.5 pt-1 border-t border-[var(--theme-card-border-50)]">
        <VernierSlider
          id="tide-gauge-water-clarity"
          label="Beer-Lambert Clarity:"
          value={waterClarity}
          defaultValue={0.65}
          min={0.10}
          max={1.00}
          step={0.05}
          readout={`${Math.round(waterClarity * 100)}%`}
          onChange={onWaterClarityChange}
          showSteppers={true}
          className="!border-0 !bg-transparent !p-0.5 !shadow-none"
        />
      </div>

      {children}
    </div>
  );
};
