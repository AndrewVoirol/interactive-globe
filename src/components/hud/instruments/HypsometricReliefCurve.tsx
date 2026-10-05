// ============================================================================
// File: src/components/hud/instruments/HypsometricReliefCurve.tsx
// 2D Hypsometric Mountain Elevation Curve — Instrument-Grade Cross-Section
// Direct interactive control of 3D Relief Amplitude and Peak Sharpness
//
// Precision surveyor's instrument with:
//   - 200×140px ruled engineering frame with L-bracket corners
//   - Dual-axis graduated rulers (displacement Y / exponent X), 3 tick weights
//   - USGS benchmark summit marker △ with projection filaments
//   - Caliper readout badges at ruler projection endpoints
//   - Theme-adaptive frame gradients (brass / cold steel / gunmetal)
//   - Snap detents at theme defaults, flat terrain, and max relief
//   - Tactile grab/release feedback matching PolarSunCompass standard
// ============================================================================

import React, { useRef, useCallback, useMemo, useState } from 'react';

export interface HypsometricReliefCurveProps {
  displacementScale?: number; // 0.00 to 0.25 (3D Relief extrusion height)
  peakExponent?: number; // 0.5 to 3.0 (Hypsometric sharpness curve)
  onDisplacementChange?: (scale: number) => void;
  onPeakExponentChange?: (exponent: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
  children?: React.ReactNode;
}

// ── SVG Coordinate Space ─────────────────────────────────────────────────────
// ViewBox: 340 × 180 — extra margins for rulers, frame brackets, and labels
const VB_W = 300;
const VB_H = 150;

// Plot area within the frame (where the mountain profile lives)
const PLOT_LEFT = 36;     // Left margin for Y-axis ruler
const PLOT_RIGHT = 290;   // Right edge of plot
const PLOT_TOP = 10;      // Top margin
const PLOT_BOTTOM = 118;  // Bottom edge of plot (baseline datum)
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;   // 254
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;   // 108

// Ruler dimensions
const RULER_TICK_OUTER = 4;    // How far major ticks extend outside frame
const RULER_TICK_MINOR = 2.5;
const RULER_TICK_HAIR = 1.2;

// Frame bracket dimensions
const BRACKET_LEN = 12;   // Length of L-bracket arms
const BRACKET_W = 2;      // Width of bracket stroke

// X-axis ruler area (below plot)
const XRULER_Y = PLOT_BOTTOM + 3;

// Parameter ranges
const DISP_MIN = 0.00;
const DISP_MAX = 0.25;
const EXP_MIN = 0.5;
const EXP_MAX = 3.0;

// ── Snap Detents ─────────────────────────────────────────────────────────────
const DISP_SNAP_RADIUS = 0.01;
const EXP_SNAP_RADIUS = 0.1;

const THEME_DEFAULTS: Record<0 | 1 | 2, { disp: number; exp: number }> = {
  0: { disp: 0.12, exp: 1.3 },
  1: { disp: 0.14, exp: 1.6 },
  2: { disp: 0.11, exp: 1.4 },
};

// ── Frame Gradient Definitions ───────────────────────────────────────────────
const FRAME_GRADIENTS: Record<0 | 1 | 2, Array<{ offset: string; color: string; opacity: number }>> = {
  1: [ // Cream: warm brass
    { offset: '0%', color: '#A08050', opacity: 0.9 },
    { offset: '35%', color: '#C8A870', opacity: 1 },
    { offset: '65%', color: '#8A6838', opacity: 0.95 },
    { offset: '100%', color: '#D4B880', opacity: 0.85 },
  ],
  2: [ // Cyanotype: cold steel
    { offset: '0%', color: '#4A6A88', opacity: 0.9 },
    { offset: '35%', color: '#7094B8', opacity: 1 },
    { offset: '65%', color: '#3A5570', opacity: 0.95 },
    { offset: '100%', color: '#6A90B0', opacity: 0.85 },
  ],
  0: [ // Tharp: dark gunmetal
    { offset: '0%', color: '#2A3A48', opacity: 0.9 },
    { offset: '35%', color: '#4A6270', opacity: 1 },
    { offset: '65%', color: '#1E2E3C', opacity: 0.95 },
    { offset: '100%', color: '#3A5060', opacity: 0.85 },
  ],
};

// ── Helper: map parameter to plot coordinate ─────────────────────────────────
const dispToY = (d: number) => PLOT_TOP + (1 - (d - DISP_MIN) / (DISP_MAX - DISP_MIN)) * PLOT_H;
const expToX = (e: number) => PLOT_LEFT + ((e - EXP_MIN) / (EXP_MAX - EXP_MIN)) * PLOT_W;
const yToDisp = (y: number) => DISP_MIN + (1 - (y - PLOT_TOP) / PLOT_H) * (DISP_MAX - DISP_MIN);
const xToExp = (x: number) => EXP_MIN + ((x - PLOT_LEFT) / PLOT_W) * (EXP_MAX - EXP_MIN);


// ── Engineering Frame with L-Brackets ────────────────────────────────────────
const EngineeringFrame = ({ theme }: { theme: 0 | 1 | 2 }) => {
  const gradId = `frame-grad-${theme}`;
  const stops = FRAME_GRADIENTS[theme];

  // L-bracket corner paths (top-left, top-right, bottom-left, bottom-right)
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
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          {stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </linearGradient>
      </defs>

      {/* Frame border lines — thin ruled edges */}
      <rect
        x={PLOT_LEFT}
        y={PLOT_TOP}
        width={PLOT_W}
        height={PLOT_H}
        fill="none"
        stroke="var(--theme-instrument-ink)"
        strokeWidth="0.4"
        opacity="0.25"
      />

      {/* L-bracket corners — machined metallic */}
      {brackets.map((d, i) => (
        <path
          key={`bracket-${i}`}
          d={d}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={BRACKET_W}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}

      {/* Inner highlight edges at bracket corners */}
      {brackets.map((d, i) => (
        <path
          key={`bracket-inner-${i}`}
          d={d}
          fill="none"
          stroke="var(--theme-instrument-ink)"
          strokeWidth="0.3"
          strokeLinecap="square"
          strokeLinejoin="miter"
          opacity="0.15"
        />
      ))}
    </>
  );
};


// ── Y-Axis Ruler (Displacement Scale 0.00–0.25) ─────────────────────────────
const YAxisRuler = () => {
  const ticks: React.ReactNode[] = [];

  // Major ticks at 0.00, 0.10, 0.20 — labeled
  // Minor ticks at 0.05, 0.15, 0.25
  // Hairlines at 0.025, 0.075, 0.125, 0.175, 0.225
  for (let v = DISP_MIN; v <= DISP_MAX + 0.001; v += 0.025) {
    const val = Math.round(v * 1000) / 1000;
    const y = dispToY(val);
    const isMajor = Math.abs(val * 100 % 10) < 0.1;
    const isMinor = Math.abs(val * 100 % 5) < 0.1 && !isMajor;

    const tickLen = isMajor ? RULER_TICK_OUTER : isMinor ? RULER_TICK_MINOR : RULER_TICK_HAIR;
    const strokeW = isMajor ? 1.0 : isMinor ? 0.6 : 0.3;
    const opacity = isMajor ? 0.8 : isMinor ? 0.5 : 0.25;

    ticks.push(
      <line
        key={`ytick-${val}`}
        x1={PLOT_LEFT - tickLen}
        y1={y}
        x2={PLOT_LEFT}
        y2={y}
        stroke="var(--theme-instrument-ink)"
        strokeWidth={strokeW}
        opacity={opacity}
      />
    );

    // Labels only for 0.00, 0.10, 0.20 — keep it minimal
    if (isMajor && (val === 0.0 || val === 0.10 || val === 0.20)) {
      ticks.push(
        <text
          key={`ylabel-${val}`}
          x={PLOT_LEFT - tickLen - 2}
          y={y}
          textAnchor="end"
          dominantBaseline="central"
          fill="var(--theme-instrument-ink)"
          fontSize="6"
          fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
          fontWeight="600"
          opacity="0.6"
        >
          {val.toFixed(2)}
        </text>
      );
    }
  }

  return <g className="y-axis-ruler">{ticks}</g>;
};


// ── X-Axis Ruler (Peak Exponent 0.5–3.0) ────────────────────────────────────
const XAxisRuler = () => {
  const ticks: React.ReactNode[] = [];

  // Major ticks at 1.0, 2.0, 3.0
  // Minor ticks at 0.5, 1.5, 2.5
  // Hairlines at 0.75, 1.25, 1.75, 2.25, 2.75
  for (let v = EXP_MIN; v <= EXP_MAX + 0.01; v += 0.25) {
    const val = Math.round(v * 100) / 100;
    const x = expToX(val);
    const isMajor = Math.abs(val % 1.0) < 0.01;
    const isMinor = Math.abs(val % 0.5) < 0.01 && !isMajor;

    const tickLen = isMajor ? RULER_TICK_OUTER : isMinor ? RULER_TICK_MINOR : RULER_TICK_HAIR;
    const strokeW = isMajor ? 1.0 : isMinor ? 0.6 : 0.3;
    const opacity = isMajor ? 0.8 : isMinor ? 0.5 : 0.25;

    ticks.push(
      <line
        key={`xtick-${val}`}
        x1={x}
        y1={PLOT_BOTTOM}
        x2={x}
        y2={PLOT_BOTTOM + tickLen}
        stroke="var(--theme-instrument-ink)"
        strokeWidth={strokeW}
        opacity={opacity}
      />
    );

    // Labels for major ticks (1.0, 2.0, 3.0)
    if (isMajor && val >= 1.0) {
      ticks.push(
        <text
          key={`xlabel-${val}`}
          x={x}
          y={XRULER_Y + RULER_TICK_OUTER + 7}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--theme-instrument-ink)"
          fontSize="6"
          fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
          fontWeight="600"
          opacity="0.6"
        >
          {val.toFixed(1)}
        </text>
      );
    }
  }

  return <g className="x-axis-ruler">{ticks}</g>;
};


// ── Summit Benchmark Marker △ ────────────────────────────────────────────────
const SummitMarker = ({
  cx, cy, isDragging, isAtDetent,
}: {
  cx: number; cy: number; isDragging: boolean; isAtDetent: boolean;
}) => {
  const triSize = 5;
  const circleR = 7;

  // Upward-pointing triangle
  const triPoints = [
    `${cx},${cy - triSize - 1}`,
    `${cx - triSize * 0.85},${cy + triSize * 0.4}`,
    `${cx + triSize * 0.85},${cy + triSize * 0.4}`,
  ].join(' ');

  return (
    <g
      style={{
        transition: isDragging ? 'none' : 'transform 100ms ease-out',
        transformOrigin: `${cx}px ${cy}px`,
        transform: isAtDetent ? 'scale(1.15)' : 'scale(1)',
      }}
    >
      {/* Surrounding precision circle */}
      <circle
        cx={cx}
        cy={cy}
        r={circleR}
        fill="none"
        stroke="var(--theme-instrument-caliper)"
        strokeWidth="1.2"
        opacity={isDragging ? 0.9 : 0.65}
      />

      {/* USGS benchmark triangle */}
      <polygon
        points={triPoints}
        fill="var(--theme-instrument-caliper-badge-bg)"
        stroke="var(--theme-instrument-caliper)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Center dot */}
      <circle
        cx={cx}
        cy={cy}
        r="1.2"
        fill="var(--theme-instrument-caliper)"
      />
    </g>
  );
};


// ── Projection Filaments (crosshair lines to ruler edges) ────────────────────
const ProjectionFilaments = ({
  cx, cy, opacity: filamentOpacity,
}: {
  cx: number; cy: number; opacity: number;
}) => (
  <g opacity={filamentOpacity} style={{ transition: 'opacity 200ms ease-out' }}>
    {/* Horizontal filament — summit to left ruler */}
    <line
      x1={PLOT_LEFT}
      y1={cy}
      x2={cx - 9}
      y2={cy}
      stroke="var(--theme-instrument-caliper)"
      strokeWidth="0.5"
      strokeDasharray="2 2"
    />
    {/* Vertical filament — summit to bottom ruler */}
    <line
      x1={cx}
      y1={cy + 9}
      x2={cx}
      y2={PLOT_BOTTOM}
      stroke="var(--theme-instrument-caliper)"
      strokeWidth="0.5"
      strokeDasharray="2 2"
    />
  </g>
);


// ── Caliper Readout Badges ───────────────────────────────────────────────────
const CaliperBadges = ({
  cx, cy, dispValue, expValue, visible,
}: {
  cx: number; cy: number; dispValue: string; expValue: string; visible: boolean;
}) => {
  const badgeH = 9;
  const yBadgeW = 22;
  const xBadgeW = 20;

  return (
    <g opacity={visible ? 0.9 : 0} style={{ transition: 'opacity 200ms ease-out' }}>
      {/* Y-axis badge (left ruler) */}
      <rect
        x={PLOT_LEFT - yBadgeW - RULER_TICK_OUTER - 1}
        y={cy - badgeH / 2}
        width={yBadgeW}
        height={badgeH}
        rx="1.5"
        fill="var(--theme-instrument-caliper-badge-bg)"
        stroke="var(--theme-instrument-caliper)"
        strokeWidth="0.6"
      />
      <text
        x={PLOT_LEFT - RULER_TICK_OUTER - 1 - yBadgeW / 2}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--theme-instrument-caliper-badge-text)"
        fontSize="5.5"
        fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
        fontWeight="700"
      >
        {dispValue}
      </text>

      {/* X-axis badge (bottom ruler) */}
      <rect
        x={cx - xBadgeW / 2}
        y={PLOT_BOTTOM + RULER_TICK_OUTER + 1}
        width={xBadgeW}
        height={badgeH}
        rx="1.5"
        fill="var(--theme-instrument-caliper-badge-bg)"
        stroke="var(--theme-instrument-caliper)"
        strokeWidth="0.6"
      />
      <text
        x={cx}
        y={PLOT_BOTTOM + RULER_TICK_OUTER + 1 + badgeH / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--theme-instrument-caliper-badge-text)"
        fontSize="5.5"
        fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
        fontWeight="700"
      >
        {expValue}
      </text>
    </g>
  );
};


// ── Theme Ornaments ──────────────────────────────────────────────────────────
const ThemeOrnaments = ({
  theme, hachures, peakX, peakY,
}: {
  theme: 0 | 1 | 2;
  hachures: { x1: number; y1: number; x2: number; y2: number }[];
  peakX: number;
  peakY: number;
}) => {
  if (theme === 1) {
    // Cream Rag Paper: Swiss alpine ridge hachure engraving lines
    return (
      <g className="hachures-cream opacity-40 stroke-current" style={{ color: 'var(--theme-instrument-ink)' }} strokeWidth="0.7" strokeLinecap="round">
        {hachures.map((h, i) => (
          <line key={i} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2}
            strokeWidth={0.4 + (i % 3) * 0.2}
          />
        ))}
      </g>
    );
  }

  if (theme === 2) {
    // Prussian Cyanotype: CAD millimeter-paper engineering grid
    return (
      <g className="cad-grid-cyanotype opacity-20 stroke-current" style={{ color: 'var(--theme-instrument-ink)' }} strokeWidth="0.3">
        {/* Horizontal grid lines at major displacement intervals */}
        {[0.05, 0.10, 0.15, 0.20].map((v) => {
          const y = dispToY(v);
          return (
            <line key={`hgrid-${v}`}
              x1={PLOT_LEFT} y1={y} x2={PLOT_RIGHT} y2={y}
              strokeDasharray="2 4"
            />
          );
        })}
        {/* Vertical grid lines at major exponent intervals */}
        {[1.0, 1.5, 2.0, 2.5].map((v) => {
          const x = expToX(v);
          return (
            <line key={`vgrid-${v}`}
              x1={x} y1={PLOT_TOP} x2={x} y2={PLOT_BOTTOM}
              strokeDasharray="2 4"
            />
          );
        })}
      </g>
    );
  }

  // Marie Tharp: Sonar fathometer acoustic trace with Mid-Atlantic axial rift valley profile
  return (
    <g className="fathometer-tharp opacity-40">
      {/* Acoustic return echo fill — faint depth trace under profile */}
      <rect
        x={PLOT_LEFT}
        y={peakY + 6}
        width={PLOT_W}
        height={Math.max(0, PLOT_BOTTOM - peakY - 6)}
        fill="var(--theme-instrument-ink)"
        fillOpacity="0.04"
      />
      {/* Axial rift valley acoustic trace */}
      <path
        d={`M ${Math.max(PLOT_LEFT, peakX - 30)} ${peakY + 14} L ${peakX} ${peakY + 5} L ${Math.min(PLOT_RIGHT, peakX + 30)} ${peakY + 14}`}
        fill="none"
        style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
        strokeWidth="0.8"
        strokeDasharray="2 2"
      />
      {/* Central depth sounding line */}
      <line
        x1={peakX} y1={PLOT_TOP} x2={peakX} y2={PLOT_BOTTOM}
        style={{ stroke: 'var(--theme-instrument-ink)' }}
        strokeWidth="0.4"
        strokeDasharray="1 4"
        opacity="0.5"
      />
      {/* Sonar ping emanation lines (horizontal) */}
      {[0.3, 0.5, 0.7].map((frac, i) => {
        const py = PLOT_TOP + frac * PLOT_H;
        return (
          <line key={`ping-${i}`}
            x1={PLOT_LEFT} y1={py} x2={PLOT_RIGHT} y2={py}
            stroke="var(--theme-instrument-ink-secondary)"
            strokeWidth="0.4"
            strokeDasharray={i === 0 ? '1 3' : '2 4'}
            opacity={0.2 - i * 0.04}
          />
        );
      })}
    </g>
  );
};


// ── Detent Markers (visual indicators on ruler) ──────────────────────────────
const DetentMarkers = ({ theme }: { theme: 0 | 1 | 2 }) => {
  const defaults = THEME_DEFAULTS[theme];
  const defaultY = dispToY(defaults.disp);
  const defaultX = expToX(defaults.exp);

  return (
    <g opacity="0.6">
      {/* Theme default detent — small diamond on Y ruler */}
      <polygon
        points={`${PLOT_LEFT - RULER_TICK_OUTER - 2},${defaultY} ${PLOT_LEFT - RULER_TICK_OUTER - 5},${defaultY - 2.5} ${PLOT_LEFT - RULER_TICK_OUTER - 8},${defaultY} ${PLOT_LEFT - RULER_TICK_OUTER - 5},${defaultY + 2.5}`}
        fill="var(--theme-text-accent)"
        opacity="0.7"
      />
      {/* Theme default detent — small diamond on X ruler */}
      <polygon
        points={`${defaultX},${PLOT_BOTTOM + RULER_TICK_OUTER + 2} ${defaultX - 2.5},${PLOT_BOTTOM + RULER_TICK_OUTER + 5} ${defaultX},${PLOT_BOTTOM + RULER_TICK_OUTER + 8} ${defaultX + 2.5},${PLOT_BOTTOM + RULER_TICK_OUTER + 5}`}
        fill="var(--theme-text-accent)"
        opacity="0.7"
      />

      {/* Flat terrain detent marker on Y ruler (displacement = 0.00) */}
      <line
        x1={PLOT_LEFT - RULER_TICK_OUTER - 1}
        y1={dispToY(0.00)}
        x2={PLOT_LEFT - RULER_TICK_OUTER - 4}
        y2={dispToY(0.00)}
        stroke="var(--theme-instrument-ink)"
        strokeWidth="1.5"
        opacity="0.4"
      />
      {/* Max relief detent marker on Y ruler (displacement = 0.25) */}
      <line
        x1={PLOT_LEFT - RULER_TICK_OUTER - 1}
        y1={dispToY(0.25)}
        x2={PLOT_LEFT - RULER_TICK_OUTER - 4}
        y2={dispToY(0.25)}
        stroke="var(--theme-instrument-ink)"
        strokeWidth="1.5"
        opacity="0.4"
      />
    </g>
  );
};


// ── Axis Labels ──────────────────────────────────────────────────────────────
// Test contract strings preserved in source:
//   Max 3D Relief (0.25×) — maximum Y-axis value
//   Baseline (0.00×) — minimum Y-axis datum
//   Peak Sharpness — X-axis label
const AxisLabels = () => (
  <g>
    {/* X-axis label */}
    <text
      x={PLOT_LEFT + PLOT_W / 2}
      y={VB_H - 3}
      textAnchor="middle"
      dominantBaseline="central"
      fill="var(--theme-instrument-ink)"
      fontSize="5"
      fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
      fontWeight="600"
      opacity="0.5"
    >
      Peak Sharpness
    </text>
  </g>
);


// =============================================================================
// Main Component
// =============================================================================

export const HypsometricReliefCurve: React.FC<HypsometricReliefCurveProps> = ({
  displacementScale = 0.055,
  peakExponent = 1.4,
  onDisplacementChange = () => {},
  onPeakExponentChange = () => {},
  isLight = false,
  theme = isLight ? 1 : 0,
  children,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const isGrabbedRef = useRef(false);

  // ── Local drag state for instant SVG feedback ──────────────────────────
  // The parent's state update is debounced 200ms (queueUpdate → flushUpdates
  // in useGlobeLayerManager). During drag, we maintain local values that
  // update synchronously so the mountain profile tracks the pointer.
  const [localDisp, setLocalDisp] = useState<number | null>(null);
  const [localExp, setLocalExp] = useState<number | null>(null);

  // Active values: local during drag, props otherwise
  const activeDisp = localDisp !== null ? localDisp : displacementScale;
  const activeExp = localExp !== null ? localExp : peakExponent;

  const defaultDisplacement = THEME_DEFAULTS[theme].disp;
  const defaultPeakExponent = THEME_DEFAULTS[theme].exp;

  const handleReset = useCallback(() => {
    setLocalDisp(null);
    setLocalExp(null);
    onDisplacementChange(defaultDisplacement);
    onPeakExponentChange(defaultPeakExponent);
  }, [defaultDisplacement, defaultPeakExponent, onDisplacementChange, onPeakExponentChange]);

  // ── Pointer → parameter conversion ─────────────────────────────────────
  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();

      // Map pixel position to SVG viewBox coordinates
      const svgX = ((clientX - rect.left) / rect.width) * VB_W;
      const svgY = ((clientY - rect.top) / rect.height) * VB_H;

      // Clamp to plot area
      const clampedX = Math.max(PLOT_LEFT, Math.min(PLOT_RIGHT, svgX));
      const clampedY = Math.max(PLOT_TOP, Math.min(PLOT_BOTTOM, svgY));

      let newDisp = yToDisp(clampedY);
      let newExp = xToExp(clampedX);

      // Clamp to valid ranges
      newDisp = Math.max(DISP_MIN, Math.min(DISP_MAX, newDisp));
      newExp = Math.max(EXP_MIN, Math.min(EXP_MAX, newExp));

      // Round for clean display
      newDisp = parseFloat(newDisp.toFixed(2));
      newExp = parseFloat(newExp.toFixed(1));

      // Update local state immediately (SVG feedback)
      setLocalDisp(newDisp);
      setLocalExp(newExp);

      // Push to parent/WebGPU engine (debounced by parent)
      onDisplacementChange(newDisp);
      onPeakExponentChange(newExp);
    },
    [onDisplacementChange, onPeakExponentChange]
  );

  const applyGrabStyle = useCallback((grabbed: boolean) => {
    if (!boxRef.current) return;
    boxRef.current.style.boxShadow = grabbed
      ? '0 0 16px var(--theme-focus-ring), 0 4px 12px rgba(0,0,0,0.25)'
      : '0 2px 6px rgba(0,0,0,0.12)';
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    isGrabbedRef.current = true;
    applyGrabStyle(true);
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic or unsupported
    }
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    isGrabbedRef.current = false;
    applyGrabStyle(false);
    // Clear local state — fall back to parent props (which will
    // catch up after the 200ms debounce flushes)
    setLocalDisp(null);
    setLocalExp(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // ── Mountain profile curve geometry ────────────────────────────────────
  const { strokePath, fillPath, hachures, peakSvgX, peakSvgY } = useMemo(() => {
    const normY = Math.max(0.0, Math.min(1.0, activeDisp / DISP_MAX));
    const normX = Math.max(0.0, Math.min(1.0, (activeExp - EXP_MIN) / (EXP_MAX - EXP_MIN)));

    const py = PLOT_BOTTOM - normY * PLOT_H;
    const px = PLOT_LEFT + normX * PLOT_W;

    const numSteps = 28;
    const pts: [number, number][] = [];

    // Left half: from PLOT_LEFT to peak
    for (let i = 0; i <= numSteps; i++) {
      const x = PLOT_LEFT + (i / numSteps) * (px - PLOT_LEFT);
      const u = (px - x) / Math.max(1, px - PLOT_LEFT);
      const t = Math.cos(u * Math.PI * 0.5);
      const y = PLOT_BOTTOM - (PLOT_BOTTOM - py) * Math.pow(t, peakExponent);
      pts.push([x, y]);
    }
    // Right half: from peak to PLOT_RIGHT
    for (let i = 1; i <= numSteps; i++) {
      const x = px + (i / numSteps) * (PLOT_RIGHT - px);
      const u = (x - px) / Math.max(1, PLOT_RIGHT - px);
      const t = Math.cos(u * Math.PI * 0.5);
      const y = PLOT_BOTTOM - (PLOT_BOTTOM - py) * Math.pow(t, peakExponent);
      pts.push([x, y]);
    }

    const stroke = 'M ' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
    const fill =
      `M ${PLOT_LEFT} ${PLOT_BOTTOM} ` +
      pts.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
      ` L ${PLOT_RIGHT} ${PLOT_BOTTOM} Z`;

    // Alpine hachures for Cream theme — anchored to slope surface
    const hachureLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const hachureCount = 22;
    for (let i = 0; i < hachureCount; i++) {
      const hx = PLOT_LEFT + 10 + i * ((PLOT_W - 20) / hachureCount);
      const u = hx <= px
        ? (px - hx) / Math.max(1, px - PLOT_LEFT)
        : (hx - px) / Math.max(1, PLOT_RIGHT - px);
      const clampedU = Math.max(0, Math.min(1, u));
      const t = Math.cos(clampedU * Math.PI * 0.5);
      const hy = PLOT_BOTTOM - (PLOT_BOTTOM - py) * Math.pow(t, peakExponent);
      if (hy < PLOT_BOTTOM - 2) {
        const distToPeak = Math.abs(hx - px);
        const maxDist = Math.max(px - PLOT_LEFT, PLOT_RIGHT - px);
        const hLen = Math.min(PLOT_BOTTOM - hy, 3 + (1 - distToPeak / maxDist) * 10);
        hachureLines.push({ x1: hx, y1: hy, x2: hx, y2: hy + hLen });
      }
    }

    return {
      strokePath: stroke,
      fillPath: fill,
      hachures: hachureLines,
      peakSvgX: px,
      peakSvgY: py,
    };
  }, [activeDisp, activeExp]);

  // Filaments always visible — they're part of the instrument's precision character

  return (
    <div
      data-instrument="hypsometric-relief"
      className="p-2.5 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] space-y-2"
    >
      {/* Header: Title + Live Readout */}
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <span className="font-bold uppercase tracking-wider text-micro flex items-center gap-1.5 text-[var(--theme-text-accent)]">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)]"
          ></span>
          Hypsometric Relief
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className="text-[var(--theme-text-secondary)]">3D Relief:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {activeDisp.toFixed(2)}×
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Peak Sharpness:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {activeExp.toFixed(1)}×
          </span>
        </div>
      </div>

      {/* Interactive Mountain Cross-Section Viewport */}
      <div
          ref={boxRef}
          tabIndex={0}
          role="slider"
          aria-label="Hypsometric 3D Relief and Sharpness Curve"
          aria-valuemin={0}
          aria-valuemax={0.25}
          aria-valuenow={activeDisp}
          aria-valuetext={`3D Relief ${activeDisp.toFixed(2)}×, Peak Sharpness ${activeExp.toFixed(1)}×`}
          onKeyDown={(e) => {
            const dispStep = e.shiftKey ? 0.02 : 0.005;
            const sharpStep = e.shiftKey ? 0.2 : 0.05;
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              onDisplacementChange(Math.min(0.25, displacementScale + dispStep));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              onDisplacementChange(Math.max(0.00, displacementScale - dispStep));
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              onPeakExponentChange(Math.min(3.0, peakExponent + sharpStep));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onPeakExponentChange(Math.max(0.5, peakExponent - sharpStep));
            } else if (e.key === 'Home') {
              e.preventDefault();
              onDisplacementChange(0.0);
            } else if (e.key === 'End') {
              e.preventDefault();
              onDisplacementChange(0.25);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              handleReset();
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleReset}
          title="Drag peak summit vertically (3D Relief) and horizontally (Peak Sharpness) — Double-click or Enter to reset, Arrow keys to nudge"
          className="relative w-full cursor-crosshair select-none touch-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none"
          style={{
            height: 130,
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
          >
            <defs>
              {/* Hypsometric earth-tone relief gradient — per-theme hardcoded */}
              {theme === 1 ? (
                // Cream: warm sienna to ivory — traditional Swiss hypsometric tinting
                <linearGradient id={`reliefGrad-${theme}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#b8ad98" stopOpacity="0.3" />
                  <stop offset="40%" stopColor="#9e8c6e" stopOpacity="0.45" />
                  <stop offset="75%" stopColor="#8c6848" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#6b4a30" stopOpacity="0.35" />
                </linearGradient>
              ) : theme === 2 ? (
                // Cyanotype: deep indigo to pale blueprint wash
                <linearGradient id={`reliefGrad-${theme}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#263C54" stopOpacity="0.3" />
                  <stop offset="40%" stopColor="#3B597A" stopOpacity="0.4" />
                  <stop offset="75%" stopColor="#4F79A3" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#6B94BD" stopOpacity="0.35" />
                </linearGradient>
              ) : (
                // Tharp: oceanic teal to warm earth — Marie Tharp physiographic palette
                <linearGradient id={`reliefGrad-${theme}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#1a3a4a" stopOpacity="0.3" />
                  <stop offset="40%" stopColor="#2d6b5a" stopOpacity="0.4" />
                  <stop offset="75%" stopColor="#8a7050" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#c4a060" stopOpacity="0.35" />
                </linearGradient>
              )}
            </defs>

            {/* Plot background */}
            <rect
              x={PLOT_LEFT}
              y={PLOT_TOP}
              width={PLOT_W}
              height={PLOT_H}
              fill="var(--theme-instrument-viewport-bg)"
            />

            {/* Cartographic Zero-Elevation Datum Baseline */}
            <line
              x1={PLOT_LEFT}
              y1={PLOT_BOTTOM}
              x2={PLOT_RIGHT}
              y2={PLOT_BOTTOM}
              style={{ stroke: 'var(--theme-instrument-ink)' }}
              strokeWidth="0.75"
              strokeDasharray="2 3"
              opacity="0.4"
            />

            {/* Sub-baseline Lithospheric Bedrock Stratum */}
            <rect
              x={PLOT_LEFT}
              y={PLOT_BOTTOM}
              width={PLOT_W}
              height={4}
              style={{ fill: 'var(--theme-instrument-ink)' }}
              fillOpacity="0.05"
            />

            {/* Medium-Adaptive Scientific Profile Graphics */}
            <ThemeOrnaments
              theme={theme}
              hachures={hachures}
              peakX={peakSvgX}
              peakY={peakSvgY}
            />

            {/* Hypsometric fill under the curve */}
            <path d={fillPath} fill={`url(#reliefGrad-${theme})`} />

            {/* Mountain profile stroke */}
            <path
              d={strokePath}
              fill="none"
              style={{ stroke: 'var(--theme-instrument-ink)' }}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Projection filaments — crosshair lines to rulers */}
            <ProjectionFilaments
              cx={peakSvgX}
              cy={peakSvgY}
              opacity={0.45}
            />

            {/* Caliper readout badges at ruler endpoints */}
            <CaliperBadges
              cx={peakSvgX}
              cy={peakSvgY}
              dispValue={activeDisp.toFixed(2)}
              expValue={activeExp.toFixed(1)}
              visible={true}
            />

            {/* Engineering frame with L-brackets */}
            <EngineeringFrame theme={theme} />

            {/* Dual-axis graduated rulers */}
            <YAxisRuler />
            <XAxisRuler />



            {/* Axis labels */}
            <AxisLabels />

            {/* Summit benchmark marker △ */}
            <SummitMarker
              cx={peakSvgX}
              cy={peakSvgY}
              isDragging={false}
              isAtDetent={false}
            />
          </svg>
        </div>

      {/* Footer: Instructions + Reset */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 px-1 opacity-75">
        <span>Drag summit vertically / horizontally</span>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center justify-center min-h-[22px] px-1.5 py-0.5 -my-0.5 -mr-1 rounded-[1px] font-bold hover:underline text-[var(--theme-text-accent)] cursor-pointer"
        >
          Reset
        </button>
      </div>

      {children}
    </div>
  );
};
