// ============================================================================
// File: src/components/hud/instruments/CloudShadowInstrument.tsx
// Cloud Shadow Ground Projection Instrument: Raymarched Solar Ground Shadow
// Controls: Dynamic Cloud Ground Shadows (0.00 to 0.60, default 0.45, step 0.05)
// Medium-Adaptive SVG: Cream (Intaglio Hatching), Cyanotype (315° NW Ray-Trace CAD), Tharp (Optical Extinction)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useState, useCallback } from 'react';

export interface CloudShadowInstrumentProps {
  shadowIntensity?: number; // 0.00 to 0.60, default 0.45, step 0.05
  theme?: 0 | 1 | 2; // 0: Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  isLight?: boolean;
  isGfsActive?: boolean;
  onChange?: (intensity: number) => void;
  onShadowIntensityChange?: (intensity: number) => void;
  className?: string;
}

export const CloudShadowInstrument: React.FC<CloudShadowInstrumentProps> = ({
  shadowIntensity: propShadowIntensity,
  theme: propTheme,
  isLight = false,
  isGfsActive = true,
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
  // Clamped badge X position to guarantee 20px clearance and prevent boundary clipping
  const badgeX = Math.max(18, Math.min(222, caliperX));

  // Medium tokens for SVG and HUD elements
    return (
    <div
      data-instrument="cloud-shadow"
      className={`p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header */}
      <div className="flex items-start justify-between text-micro mb-1.5 font-mono">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              CLOUD SHADOW
            </span>
          </div>
          <span className="text-nano text-[var(--theme-text-muted)] truncate pl-3">
            {isGfsActive ? 'Ground Projection Ray • Global Forecast System' : 'Ground Projection Ray (Inactive)'}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1.5 pt-0.5">
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
        className={`relative w-full h-20 rounded-[2px] overflow-hidden cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none bg-[var(--theme-instrument-viewport-bg)]`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 240 60"
          preserveAspectRatio="xMidYMid meet"
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
              <line x1="0" y1="0" x2="0" y2="4" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.8" />
            </pattern>

            {/* Theme 0: Marie Tharp Volumetric Extinction Gradient */}
            <linearGradient id="tharp-extinction-grad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                style={{ stopColor: 'var(--theme-instrument-ink)' }}
                stopOpacity={0.10 + shadowIntensity * 0.45}
              />
              <stop
                offset="100%"
                style={{ stopColor: 'var(--theme-instrument-ink-secondary)' }}
                stopOpacity={0.20 + shadowIntensity * 0.85}
              />
            </linearGradient>

            {/* General Oblique Luminous Solar Ray Cast Gradient */}
            <linearGradient id="solar-beam-illumination" x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.45" />
              <stop offset="60%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.18" />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.02" />
            </linearGradient>

            {/* Shadow Projection Volume Cone Gradient */}
            <linearGradient id="solar-ray-grad" x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity={0.12 + normIntensity * 0.4} />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity={0.25 + normIntensity * 0.65} />
            </linearGradient>

            {/* Ground Shadow Umbra Surface Gradient */}
            <linearGradient id="ground-umbra-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.15" />
              <stop offset="18%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity={0.4 + normIntensity * 0.6} />
              <stop offset="82%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity={0.4 + normIntensity * 0.6} />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.15" />
            </linearGradient>

            {/* Baseline Optical Extinction Density Ramp Gradient */}
            <linearGradient id="extinction-track-ramp" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.1" />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* 1. Luminous Solar Emitter & Incoming Solar Rays (45° angle / 315° NW) */}
          <g opacity="0.85">
            {/* Luminous Sun Origin Glyph at Top-Left */}
            <circle cx="14" cy="8" r="4.5" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.5" strokeDasharray="1.5 1.5" />
            <circle cx="14" cy="8" r="2.8" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.8" />
            <circle cx="14" cy="8" r="1.3" style={{ fill: 'var(--theme-instrument-ink)' }} />
            {/* Primary Solar Rays radiating outward */}
            <line x1="14" y1="1" x2="14" y2="3" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.75" />
            <line x1="7" y1="8" x2="9" y2="8" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.75" />
            <line x1="19" y1="13" x2="23" y2="17" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.9" />

            {/* Soft Ambient Illumination Wash through the Troposphere (45° parallel beam) */}
            <polygon
              points="14,8 28,22 56,50 42,50 5,13"
              fill="url(#solar-beam-illumination)"
              opacity="0.5"
            />

            {/* Directional 45° Solar Light Rays projecting across the scene */}
            <line x1="5" y1="13" x2="42" y2="50" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" strokeDasharray="3 3" opacity="0.35" />
            <line x1="19" y1="13" x2="28" y2="22" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.85" opacity="0.7" />
            <line x1="88" y1="12" x2="98" y2="22" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.85" opacity="0.7" />
            <line x1="136" y1="14" x2="172" y2="50" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" strokeDasharray="4 3" opacity="0.35" />
            <line x1="172" y1="14" x2="208" y2="50" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" strokeDasharray="4 3" opacity="0.25" />
          </g>

          {/* 2. Terrestrial Crust Baseline Profile & Bedrock Strata */}
          <rect
            x="10"
            y="50"
            width="220"
            height="8"
            rx="0.5"
            style={{ fill: 'var(--theme-instrument-viewport-bg)', stroke: 'var(--theme-instrument-viewport-border)' }}
            strokeWidth="1.0"
            opacity="0.95"
          />
          {/* Bedrock Strata Geological Hairline */}
          <line
            x1="12"
            y1="54"
            x2="228"
            y2="54"
            style={{ stroke: 'var(--theme-instrument-viewport-border)' }}
            strokeWidth="0.5"
            strokeDasharray="6 4"
            opacity="0.35"
          />

          {/* 3. Shadow Projection Volume Cone & Ground Shadow Footprint */}
          {/* Volumetric Projection Cone from Cloud Base to Ground */}
          {shadowIntensity > 0.001 && (
            <polygon
              points="28,22 98,22 128,50 58,50"
              fill="url(#solar-ray-grad)"
              opacity={0.3 + normIntensity * 0.7}
            />
          )}

          {/* Bounding Solar Ray Projection Lines (45° angle) */}
          {/* Windward Ray: (28, 22) -> (58, 50) */}
          <line
            x1="28"
            y1="22"
            x2="58"
            y2="50"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="0.9"
            strokeDasharray="3 2"
            opacity="0.8"
          />
          {/* Leeward Ray: (98, 22) -> (128, 50) */}
          <line
            x1="98"
            y1="22"
            x2="128"
            y2="50"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="0.9"
            strokeDasharray="3 2"
            opacity="0.8"
          />

          {/* Ground Umbra Core & Penumbra on Terrestrial Surface (58 to 128) */}
          {shadowIntensity > 0.001 && (
            <g opacity={0.35 + normIntensity * 0.65}>
              {/* Surface cast shadow strip directly on terrestrial bedrock */}
              <rect
                x="58"
                y="50"
                width="70"
                height="3"
                fill="url(#ground-umbra-grad)"
              />
              {/* Dense Umbra baseline stroke directly on ground */}
              <line
                x1="58"
                y1="50"
                x2="128"
                y2="50"
                style={{ stroke: 'var(--theme-instrument-ink)' }}
                strokeWidth={1.2}
                opacity={0.6 + normIntensity * 0.4}
              />
            </g>
          )}

          {/* Ground Baseline Extinction Calibration Track (x in [30 .. 210]) */}
          <line
            x1="30"
            y1="50"
            x2="210"
            y2="50"
            stroke="url(#extinction-track-ramp)"
            strokeWidth="1.2"
          />
          {/* Minor Subdivision Ticks at each 0.05 step (15px intervals) */}
          {[45, 60, 90, 105, 135, 150, 180, 195].map((mx) => (
            <line
              key={`minor-${mx}`}
              x1={mx}
              y1="49"
              x2={mx}
              y2="51"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="0.5"
              opacity="0.4"
            />
          ))}
          {/* Major Calibration Ticks along Extinction Track: 0%, 15%, 30%, 45%, 60% */}
          {[30, 75, 120, 165, 210].map((tx) => (
            <line
              key={`major-${tx}`}
              x1={tx}
              y1="47.5"
              x2={tx}
              y2="52.5"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="0.85"
              opacity="0.75"
            />
          ))}

          {/* 4. Elevated Cloud Slab Deck (y = 12..22, x = 28..98) */}
          <path
            d="M 28 22 L 28 17 Q 28 12 36 12 Q 44 10 52 13 Q 62 9 72 13 Q 84 9 92 14 Q 98 14 98 22 Z"
            style={{ fill: 'var(--theme-instrument-viewport-bg)', stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="1.0"
            opacity="0.95"
          />
          {/* Cloud Top Solar Luminous Rim Highlight (facing 45° sun) */}
          <path
            d="M 28 17 Q 28 12 36 12 Q 44 10 52 13 Q 62 9 72 13 Q 84 9 92 14 Q 98 14 98 22"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="1.2"
            opacity="0.9"
          />
          {/* Cloud Deck Flat Condensation Base */}
          <line x1="28" y1="22" x2="98" y2="22" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="1.2" opacity="0.9" />

          {/* 5. 3-Medium Adaptive SVG Graphics Groups */}
          {theme === 1 ? (
            // Theme 1 (Cream Rag): Archival copperplate intaglio hatching
            <g className="shadow-projection-cream">
              {/* Copperplate Penumbral Hatching over Shadow Projection */}
              {shadowIntensity > 0.001 && (
                <polygon
                  points="28,22 98,22 128,50 58,50"
                  fill="url(#cream-shadow-hatch)"
                  opacity={0.35 + normIntensity * 0.65}
                />
              )}

              {/* Intaglio Crust Ticks aligned to major scale stations */}
              {[30, 75, 120, 165, 210].map((ix) => (
                <line
                  key={`intaglio-${ix}`}
                  x1={ix}
                  y1="52.5"
                  x2={ix}
                  y2="56"
                  style={{ stroke: 'var(--theme-instrument-ink)' }}
                  strokeWidth="0.6"
                  opacity="0.65"
                />
              ))}
            </g>
          ) : theme === 2 ? (
            // Theme 2 (Prussian Cyanotype): Optical Ray-Trace & CAD Division Grid
            <g className="shadow-projection-cyanotype">
              {/* 45° Solar Angle Arc at Origin (28, 22) */}
              <path
                d="M 28 22 L 40 22 A 12 12 0 0 1 36.5 30.5 Z"
                fill="none"
                style={{ stroke: 'var(--theme-instrument-ink)' }}
                strokeWidth="0.75"
                opacity="0.85"
              />

              {/* CAD Division Ticks along Baseline */}
              {[30, 60, 90, 120, 150, 180, 210].map((x) => (
                <g key={x}>
                  <line
                    x1={x}
                    y1="50"
                    x2={x}
                    y2="53"
                    style={{ stroke: 'var(--theme-instrument-ink)' }}
                    strokeWidth="0.6"
                    opacity="0.7"
                  />
                </g>
              ))}
            </g>
          ) : (
            // Theme 0 (Marie Tharp): Volumetric Optical Depth Extinction
            <g className="shadow-projection-tharp">
              {/* Volumetric Extinction Gradient Mesh */}
              {shadowIntensity > 0.001 && (
                <polygon
                  points="28,22 98,22 128,50 58,50"
                  fill="url(#tharp-extinction-grad)"
                />
              )}

              {/* Acoustic Sounding Pips along Bathymetric Margin */}
              <circle cx="70" cy="50" r="1.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.8" />
              <circle cx="100" cy="50" r="1.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.8" />
              <circle cx="130" cy="50" r="1.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.8" />
              <circle cx="160" cy="50" r="1.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.8" />
              <circle cx="190" cy="50" r="1.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.8" />
            </g>
          )}

          {/* 6. Draggable Ground Shadow Optical Extinction Caliper */}
          <g>
            {/* Caliper Vertical Hairline Indicator connecting badge bottom (y=33) to thumb top (y=45) */}
            <line
              x1={caliperX}
              y1="33"
              x2={caliperX}
              y2="45"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="1.2"
              strokeDasharray="2 2"
            />

            {/* Knurled Caliper Reticle Thumb on Baseline */}
            <rect
              x={caliperX - 5}
              y="45"
              width="10"
              height="7"
              rx="1.5"
              style={{ fill: 'var(--theme-instrument-caliper-badge-bg)', stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="1"
            />
            <line
              x1={caliperX - 2}
              y1="47"
              x2={caliperX - 2}
              y2="50"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="0.6"
            />
            <line
              x1={caliperX}
              y1="47"
              x2={caliperX}
              y2="50"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="0.6"
            />
            <line
              x1={caliperX + 2}
              y1="47"
              x2={caliperX + 2}
              y2="50"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="0.6"
            />

            {/* Floating Live Numerical Caliper Readout Badge */}
            <rect
              x={badgeX - 14}
              y="22"
              width="28"
              height="11"
              rx="2"
              style={{ fill: 'var(--theme-instrument-caliper-badge-bg)', stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="0.75"
            />
            <text
              x={badgeX}
              y="30"
              textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="7"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {Math.round(shadowIntensity * 100)}%
            </text>
          </g>
        </svg>
      </div>

      {/* Hidden input preserving DOM ID for test compatibility */}
      <input
        type="range"
        id="sidebar-shadow-intensity"
        min={0}
        max={0.60}
        step={0.05}
        value={shadowIntensity}
        onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* 4. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border-50)] opacity-80">
        <span className="truncate">OPTICAL EXTINCTION (0.00–0.60)</span>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center justify-center min-h-[22px] px-1.5 py-0.5 -my-0.5 -mr-1 rounded-[1px] font-bold hover:underline text-[var(--theme-text-accent)] cursor-pointer shrink-0 ml-1"
        >
          [RESET]
        </button>
      </div>
    </div>
  );
};

export default CloudShadowInstrument;
