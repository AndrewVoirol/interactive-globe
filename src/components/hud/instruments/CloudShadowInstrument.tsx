// ============================================================================
// File: src/components/hud/instruments/CloudShadowInstrument.tsx
// Cloud Shadow Ground Projection Instrument: Raymarched Solar Ground Shadow
// Controls: Dynamic Cloud Ground Shadows (0.00 to 0.60, default 0.45, step 0.05)
// Medium-Adaptive SVG: Cream (Intaglio Hatching), Cyanotype (315° NW Ray-Trace CAD), Tharp (Optical Extinction)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useState, useCallback } from 'react';
import { VernierSlider } from '../../ui/VernierSlider';

export interface CloudShadowInstrumentProps {
  shadowIntensity?: number; // 0.00 to 0.60, default 0.45, step 0.05
  theme?: 0 | 1 | 2; // 0: Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  isLight?: boolean;
  onChange?: (intensity: number) => void;
  onShadowIntensityChange?: (intensity: number) => void;
  className?: string;
}

export const CloudShadowInstrument: React.FC<CloudShadowInstrumentProps> = ({
  shadowIntensity: propShadowIntensity,
  theme: propTheme,
  isLight = false,
  onChange,
  onShadowIntensityChange,
  className = '',
}) => {
  const [internalIntensity, setInternalIntensity] = useState<number>(0.45);
  const shadowIntensity =
    propShadowIntensity !== undefined && Number.isFinite(propShadowIntensity)
      ? propShadowIntensity
      : internalIntensity;
  const theme: 0 | 1 | 2 =
    propTheme !== undefined ? propTheme : isLight ? 1 : 0;

  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handleIntensityChange = useCallback(
    (next: number) => {
      if (typeof next !== 'number' || !Number.isFinite(next)) return;
      const clamped = Math.max(0.0, Math.min(0.60, parseFloat(next.toFixed(2))));
      setInternalIntensity(clamped);
      onChange?.(clamped);
      onShadowIntensityChange?.(clamped);
    },
    [onChange, onShadowIntensityChange]
  );

  // Drag coordinate mapping:
  // Viewport width maps horizontally to shadowIntensity [0.00 .. 0.60]
  // In ViewBox (0 0 240 60), active drag span is x in [30 .. 210] (180px track)
  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const normX = Math.max(0.0, Math.min(1.0, (clientX - rect.left) / rect.width));
      const t = Math.max(0.0, Math.min(1.0, (normX - 30 / 240) / (180 / 240)));
      const raw = t * 0.60;
      const stepped = Math.round(raw / 0.05) * 0.05;
      const clamped = Math.max(0.0, Math.min(0.60, parseFloat(stepped.toFixed(2))));
      handleIntensityChange(clamped);
    },
    [handleIntensityChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Graceful fallback if pointer capture is unsupported
    }
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Graceful fallback
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.05;
      const next = Math.min(0.60, parseFloat((shadowIntensity + step).toFixed(2)));
      handleIntensityChange(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.05;
      const next = Math.max(0.0, parseFloat((shadowIntensity - step).toFixed(2)));
      handleIntensityChange(next);
    } else if (e.key === 'Home') {
      e.preventDefault();
      handleIntensityChange(0.0);
    } else if (e.key === 'End') {
      e.preventDefault();
      handleIntensityChange(0.60);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleReset();
      return;
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      const next = Math.min(0.60, parseFloat((shadowIntensity + 0.10).toFixed(2)));
      handleIntensityChange(next);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      const next = Math.max(0.0, parseFloat((shadowIntensity - 0.10).toFixed(2)));
      handleIntensityChange(next);
    }
  };

  const handleReset = () => {
    handleIntensityChange(0.45);
  };

  // Normalized fraction [0.0 .. 1.0] across [0.00 .. 0.60]
  const normIntensity = Math.max(0.0, Math.min(1.0, shadowIntensity / 0.60));
  // Caliper X position in ViewBox 0 0 240 60 (spans 30 to 210)
  const caliperX = Math.round(30 + normIntensity * 180);

  // Medium tokens for SVG and HUD elements
  const tokens =
    theme === 2
      ? {
          viewportBg: 'bg-[#0d1724]',
          viewportBorder: 'border-[#3b597a]/60',
          cloudFill: '#1a2e47',
          cloudStroke: '#4fa3e3',
          groundFill: '#0e1824',
          groundStroke: '#3b597a',
          caliperLine: '#a5d5ff',
          caliperBadgeBg: '#0e1824',
          caliperBadgeBorder: '#a5d5ff',
          caliperBadgeText: '#a5d5ff',
          rayStroke: '#4fa3e3',
          shadowFill: '#4fa3e3',
        }
      : theme === 1
      ? {
          viewportBg: 'bg-[#fdfcf9]',
          viewportBorder: 'border-[#b8ad98]/60',
          cloudFill: '#ede3d1',
          cloudStroke: '#8c4820',
          groundFill: '#f4ede0',
          groundStroke: '#8c4820',
          caliperLine: '#8c4820',
          caliperBadgeBg: '#fdfcf9',
          caliperBadgeBorder: '#8c4820',
          caliperBadgeText: '#8c4820',
          rayStroke: '#8c4820',
          shadowFill: '#8c4820',
        }
      : {
          viewportBg: 'bg-[#0c1219]',
          viewportBorder: 'border-[#3a4d61]/60',
          cloudFill: '#132230',
          cloudStroke: '#00e5ff',
          groundFill: '#0a111a',
          groundStroke: '#34d399',
          caliperLine: '#00e5ff',
          caliperBadgeBg: '#0a111a',
          caliperBadgeBorder: '#00e5ff',
          caliperBadgeText: '#00e5ff',
          rayStroke: '#00e5ff',
          shadowFill: '#34d399',
        };

  return (
    <div
      className={`p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header */}
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              CLOUD SHADOW
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Ground Projection Ray
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1">
          <span className="text-[var(--theme-text-secondary)]">Shadow:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {Math.round(shadowIntensity * 100)}%
          </span>
        </div>
      </div>

      {/* 2. Interactive SVG Viewport */}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="slider"
        aria-label="Cloud Ground Shadow Intensity Caliper"
        aria-valuemin={0.0}
        aria-valuemax={0.60}
        aria-valuenow={shadowIntensity}
        aria-valuetext={`${Math.round(shadowIntensity * 100)}% ground shadow extinction`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleReset}
        onKeyDown={handleKeyDown}
        title="Drag ground umbra caliper horizontally to adjust shadow intensity (0–60%) • Double-click to reset (45%)"
        className={`relative w-full h-20 rounded-[2px] border overflow-hidden cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${tokens.viewportBg} ${tokens.viewportBorder}`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 240 60"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Theme 1: Cream Rag Copperplate Penumbral Hatch Pattern */}
            <pattern
              id="cream-shadow-hatch"
              width="4"
              height="4"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="4" stroke="#8c4820" strokeWidth="0.8" />
            </pattern>

            {/* Theme 0: Marie Tharp Volumetric Extinction Gradient */}
            <linearGradient id="tharp-extinction-grad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="#00e5ff"
                stopOpacity={0.15 + shadowIntensity * 0.4}
              />
              <stop
                offset="100%"
                stopColor="#34d399"
                stopOpacity={0.25 + shadowIntensity * 0.75}
              />
            </linearGradient>

            {/* General Oblique Solar Ray Cast Gradient */}
            <linearGradient id="solar-ray-grad" x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0%" stopColor={tokens.rayStroke} stopOpacity="0.45" />
              <stop offset="100%" stopColor={tokens.rayStroke} stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {/* Terrestrial Crust Baseline Profile */}
          <path
            d="M 10 50 L 45 50 Q 75 48, 105 47 T 165 50 L 230 50 L 230 58 L 10 58 Z"
            fill={tokens.groundFill}
            stroke={tokens.groundStroke}
            strokeWidth="1.0"
            opacity="0.9"
          />

          {/* Elevated Cloud Slab Deck (y = 12..22, x = 24..98) */}
          <path
            d="M 28 22 L 28 17 Q 28 12 36 12 Q 44 10 52 13 Q 62 9 72 13 Q 84 9 92 14 Q 98 14 98 22 Z"
            fill={tokens.cloudFill}
            stroke={tokens.cloudStroke}
            strokeWidth="1.0"
            opacity="0.95"
          />
          <text
            x="63"
            y="18"
            textAnchor="middle"
            fill={tokens.cloudStroke}
            fontSize="5.5"
            fontFamily="monospace"
            opacity="0.85"
          >
            CIRRUS DECK (4.5 km)
          </text>

          {/* Oblique Solar Ray Cones (315° NW / 45° Solar Angle) */}
          {/* Left Solar Ray: (28, 22) -> (58, 50) */}
          <line
            x1="28"
            y1="22"
            x2="58"
            y2="50"
            stroke={tokens.rayStroke}
            strokeWidth="0.8"
            strokeDasharray="3 2"
            opacity="0.6"
          />
          {/* Right Solar Ray: (98, 22) -> (128, 50) */}
          <line
            x1="98"
            y1="22"
            x2="128"
            y2="50"
            stroke={tokens.rayStroke}
            strokeWidth="0.8"
            strokeDasharray="3 2"
            opacity="0.6"
          />

          {/* Dynamic Ground Shadow Projection Zone */}
          {shadowIntensity > 0.001 && (
            <polygon
              points={`28,22 98,22 ${Math.max(128, caliperX)},50 58,50`}
              fill="url(#solar-ray-grad)"
              opacity={normIntensity}
            />
          )}

          {/* Ground Umbra Core on Terrestrial Crust */}
          {shadowIntensity > 0.001 && (
            <rect
              x="58"
              y="48"
              width={Math.max(10, caliperX - 58)}
              height="4"
              rx="1"
              fill={tokens.shadowFill}
              fillOpacity={0.25 + normIntensity * 0.65}
            />
          )}

          {/* 3-Medium Adaptive SVG Graphics Groups */}
          {theme === 1 ? (
            // Theme 1 (Cream Rag): Archival copperplate intaglio hatching
            <g className="shadow-projection-cream">
              {/* Copperplate Penumbral Hatching over Shadow Projection */}
              {shadowIntensity > 0.001 && (
                <polygon
                  points={`28,22 98,22 ${Math.max(128, caliperX)},50 58,50`}
                  fill="url(#cream-shadow-hatch)"
                  opacity={0.35 + normIntensity * 0.65}
                />
              )}

              {/* Sol Incidence & Penumbra Annotation */}
              <text
                x="24"
                y="9"
                fill="#8c4820"
                fontSize="6.5"
                fontFamily="serif"
                fontStyle="italic"
                opacity="0.85"
              >
                Sol Incidence: 45° Intaglio Penumbra
              </text>
              <text
                x="226"
                y="47"
                textAnchor="end"
                fill="#8c4820"
                fontSize="6"
                fontFamily="monospace"
                opacity="0.75"
              >
                TERRA FIRMA
              </text>

              {/* Intaglio Crust Ticks */}
              <line x1="60" y1="52" x2="60" y2="56" stroke="#8c4820" strokeWidth="0.6" />
              <line x1="90" y1="52" x2="90" y2="56" stroke="#8c4820" strokeWidth="0.6" />
              <line x1="120" y1="52" x2="120" y2="56" stroke="#8c4820" strokeWidth="0.6" />
              <line x1="150" y1="52" x2="150" y2="56" stroke="#8c4820" strokeWidth="0.6" />
              <line x1="180" y1="52" x2="180" y2="56" stroke="#8c4820" strokeWidth="0.6" />
            </g>
          ) : theme === 2 ? (
            // Theme 2 (Prussian Cyanotype): Optical Ray-Trace & CAD Division Grid
            <g className="shadow-projection-cyanotype">
              {/* 45° Solar Angle Arc at Origin (28, 22) */}
              <path
                d="M 28 22 L 40 22 A 12 12 0 0 1 36.5 30.5 Z"
                fill="none"
                stroke="#4fa3e3"
                strokeWidth="0.75"
                opacity="0.85"
              />
              <text
                x="43"
                y="27"
                fill="#4fa3e3"
                fontSize="5.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                ∠45° [315° NW]
              </text>

              {/* Technical CAD Headers */}
              <text
                x="24"
                y="9"
                fill="#4fa3e3"
                fontSize="6.5"
                fontFamily="monospace"
                opacity="0.9"
              >
                RAY-TRACE: λ_sol = 315° / θ_alt = 45°
              </text>
              <text
                x="226"
                y="47"
                textAnchor="end"
                fill="#4fa3e3"
                fontSize="6"
                fontFamily="monospace"
                opacity="0.8"
              >
                DATUM 0.0m
              </text>

              {/* CAD Division Ticks along Baseline */}
              {[30, 60, 90, 120, 150, 180, 210].map((x) => (
                <g key={x}>
                  <line
                    x1={x}
                    y1="50"
                    x2={x}
                    y2="53"
                    stroke="#4fa3e3"
                    strokeWidth="0.6"
                    opacity="0.7"
                  />
                  <text
                    x={x}
                    y="57"
                    textAnchor="middle"
                    fill="#4fa3e3"
                    fontSize="4.5"
                    fontFamily="monospace"
                    opacity="0.6"
                  >
                    {((x - 30) / 300).toFixed(2)}
                  </text>
                </g>
              ))}
            </g>
          ) : (
            // Theme 0 (Marie Tharp): Volumetric Optical Depth Extinction
            <g className="shadow-projection-tharp">
              {/* Volumetric Extinction Gradient Mesh */}
              {shadowIntensity > 0.001 && (
                <polygon
                  points={`28,22 98,22 ${Math.max(128, caliperX)},50 58,50`}
                  fill="url(#tharp-extinction-grad)"
                />
              )}

              {/* Acoustic Sounding Pips along Bathymetric Margin */}
              <circle cx="70" cy="50" r="1.5" fill="#34d399" opacity="0.8" />
              <circle cx="100" cy="50" r="1.5" fill="#34d399" opacity="0.8" />
              <circle cx="130" cy="50" r="1.5" fill="#34d399" opacity="0.8" />
              <circle cx="160" cy="50" r="1.5" fill="#34d399" opacity="0.8" />
              <circle cx="190" cy="50" r="1.5" fill="#34d399" opacity="0.8" />

              {/* Acoustic Sounding Text */}
              <text
                x="24"
                y="9"
                fill="#00e5ff"
                fontSize="6.5"
                fontFamily="monospace"
                opacity="0.9"
              >
                OPTICAL EXTINCTION: k_ext = {(shadowIntensity * 1.67).toFixed(2)} m⁻¹
              </text>
              <text
                x="226"
                y="47"
                textAnchor="end"
                fill="#34d399"
                fontSize="6"
                fontFamily="monospace"
                opacity="0.8"
              >
                ABYSSAL FLOOR
              </text>
            </g>
          )}

          {/* Draggable Ground Shadow Umbra Caliper */}
          <g>
            {/* Caliper Vertical Hairline Indicator */}
            <line
              x1={caliperX}
              y1="24"
              x2={caliperX}
              y2="54"
              stroke={tokens.caliperLine}
              strokeWidth="1.2"
              strokeDasharray="3 2"
            />

            {/* Knurled Caliper Reticle Thumb on Baseline */}
            <rect
              x={caliperX - 5}
              y="44"
              width="10"
              height="8"
              rx="1.5"
              fill={tokens.caliperBadgeBg}
              stroke={tokens.caliperLine}
              strokeWidth="1"
            />
            <line
              x1={caliperX - 2}
              y1="46"
              x2={caliperX - 2}
              y2="50"
              stroke={tokens.caliperLine}
              strokeWidth="0.6"
            />
            <line
              x1={caliperX}
              y1="46"
              x2={caliperX}
              y2="50"
              stroke={tokens.caliperLine}
              strokeWidth="0.6"
            />
            <line
              x1={caliperX + 2}
              y1="46"
              x2={caliperX + 2}
              y2="50"
              stroke={tokens.caliperLine}
              strokeWidth="0.6"
            />

            {/* Floating Live Numerical Caliper Readout Badge */}
            <rect
              x={caliperX - 14}
              y="22"
              width="28"
              height="11"
              rx="2"
              fill={tokens.caliperBadgeBg}
              stroke={tokens.caliperBadgeBorder}
              strokeWidth="0.75"
            />
            <text
              x={caliperX}
              y="30"
              textAnchor="middle"
              fill={tokens.caliperBadgeText}
              fontSize="7"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {Math.round(shadowIntensity * 100)}%
            </text>
          </g>
        </svg>
      </div>

      {/* 3. Secondary Precision Calibration Slider & Steppers (100% Backward-Compatibility with Tests) */}
      <div className="space-y-1 pt-1 border-t border-[var(--theme-card-border)]/50">
        <VernierSlider
          id="sidebar-shadow-intensity"
          label="Shadow Intensity"
          sublabel="Dynamic Cloud Ground Shadows"
          min={0.0}
          max={0.60}
          step={0.05}
          value={shadowIntensity}
          readout={`${Math.round(shadowIntensity * 100)}%`}
          onChange={handleIntensityChange}
        />
      </div>

      {/* 4. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border)]/50 opacity-80">
        <span className="truncate">OPTICAL EXTINCTION (0.00–0.60)</span>
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

export default CloudShadowInstrument;
