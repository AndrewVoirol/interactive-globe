// ============================================================================
// File: src/components/hud/instruments/OrographicMoistureProfile.tsx
// Orographic Moisture Profile Instrument: Adiabatic Condensation & Pluvial Coupling
// Controls: Orographic Coupling (0.00-1.00), Pluvial Coupling (0.0-2.0x), Thermodynamic Gating
// Medium-Adaptive SVG: Cream (Intaglio Hachures), Cyanotype (CAD Adiabatic Tephigram), Tharp (Physiographic Sounding)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface OrographicMoistureProfileProps {
  rainShadowFeedback?: number; // 0.00 to 1.00 (Orographic Coupling, default 0.0)
  pluvialGamma?: number; // 0.0 to 2.0 (Pluvial Coupling, default 0.0)
  thermodynamicGating?: boolean; // default true (LCL condensation gating)
  theme?: 0 | 1 | 2; // 0: Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  onRainShadowChange?: (val: number) => void;
  onPluvialGammaChange?: (val: number) => void;
  onThermodynamicGatingChange?: (enabled: boolean) => void;
  className?: string;
}

export const OrographicMoistureProfile: React.FC<OrographicMoistureProfileProps> = ({
  rainShadowFeedback = 0.0,
  pluvialGamma = 0.0,
  thermodynamicGating = true,
  theme = 0,
  onRainShadowChange,
  onPluvialGammaChange,
  onThermodynamicGatingChange,
  className = '',
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef<'rainShadow' | 'pluvial' | null>(null);
  const pointerStartPosRef = useRef({ x: 0, y: 0, time: 0 });
  const hasMovedRef = useRef(false);

  // Update logic mapped from pointer coordinates
  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const normX = Math.max(0.0, Math.min(1.0, (clientX - rect.left) / rect.width));
      const normY = Math.max(0.0, Math.min(1.0, (clientY - rect.top) / rect.height));

      if (dragModeRef.current === 'rainShadow') {
        // Windward ascent drag: maps normX in range [0.10 .. 0.50] to [0.0 .. 1.0]
        // or inverted normY [0.90 .. 0.20]
        const tX = (normX - 0.10) / (0.50 - 0.10);
        const tY = (0.90 - normY) / (0.90 - 0.20);
        // Use average or dominant displacement for natural tactile feel
        const t = Math.max(0.0, Math.min(1.0, Math.max(tX, tY)));
        const stepped = Math.round(t * 20) / 20; // 0.05 steps
        const clamped = Math.max(0.0, Math.min(1.0, parseFloat(stepped.toFixed(2))));
        onRainShadowChange?.(clamped);
      } else if (dragModeRef.current === 'pluvial') {
        // Precipitation column drag: maps vertical descent or rightward drag to [0.0 .. 2.0]
        const tY = (normY - 0.35) / (0.90 - 0.35);
        const tX = (normX - 0.50) / (0.90 - 0.50);
        const t = Math.max(0.0, Math.min(1.0, Math.max(tY, tX)));
        const raw = t * 2.0;
        const stepped = Math.round(raw * 10) / 10; // 0.1 steps
        const clamped = Math.max(0.0, Math.min(2.0, parseFloat(stepped.toFixed(1))));
        onPluvialGammaChange?.(clamped);
      }
    },
    [onRainShadowChange, onPluvialGammaChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    hasMovedRef.current = false;

    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      // Left windward mountain half (x < 0.52) controls rain shadow feedback
      // Right leeward rain shaft / valley floor (x >= 0.52) controls pluvial gamma
      dragModeRef.current = relX < 0.52 ? 'rainShadow' : 'pluvial';
    }

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if unsupported
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartPosRef.current.y);
    if (dx > 3 || dy > 3) {
      hasMovedRef.current = true;
      updateFromPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Graceful fallback
    }

    // Quick click (< 350ms and < 3px motion) toggles LCL or updates single tap position
    if (!hasMovedRef.current && Date.now() - pointerStartPosRef.current.time < 350) {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;

      // Click near LCL horizontal line (relY ≈ 0.45 .. 0.58) toggles thermodynamic gating
      if (relY >= 0.45 && relY <= 0.58) {
        onThermodynamicGatingChange?.(!thermodynamicGating);
      } else if (relX < 0.52) {
        dragModeRef.current = 'rainShadow';
        updateFromPointer(e.clientX, e.clientY);
      } else {
        dragModeRef.current = 'pluvial';
        updateFromPointer(e.clientX, e.clientY);
      }
    }
    dragModeRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.05;
      const next = Math.min(1.0, parseFloat((rainShadowFeedback + step).toFixed(2)));
      onRainShadowChange?.(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.05;
      const next = Math.max(0.0, parseFloat((rainShadowFeedback - step).toFixed(2)));
      onRainShadowChange?.(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 0.1;
      const next = Math.min(2.0, parseFloat((pluvialGamma + step).toFixed(1)));
      onPluvialGammaChange?.(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 0.1;
      const next = Math.max(0.0, parseFloat((pluvialGamma - step).toFixed(1)));
      onPluvialGammaChange?.(next);
    } else if (e.key === 't' || e.key === 'T' || e.key === ' ') {
      e.preventDefault();
      onThermodynamicGatingChange?.(!thermodynamicGating);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onRainShadowChange?.(0.0);
      onPluvialGammaChange?.(0.0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onRainShadowChange?.(1.0);
      onPluvialGammaChange?.(2.0);
    }
  };

  const handleReset = () => {
    onRainShadowChange?.(0.0);
    onPluvialGammaChange?.(0.0);
    onThermodynamicGatingChange?.(true);
  };

  // Coordinates in SVG (0 0 280 130)
  // LCL horizontal line: y = 68
  const lclY = 68;

  // Windward cloud handle coordinates:
  // rainShadowFeedback [0..1] interpolates handle from foot to peak
  const cloudThumbX = Math.round(75 + rainShadowFeedback * 55);
  const cloudThumbY = Math.round(72 - rainShadowFeedback * 32);

  // Pluvial precipitation handle coordinates:
  // pluvialGamma [0..2] interpolates vertical shaft depth
  const pluvialThumbX = 162;
  const pluvialThumbY = Math.round(70 + (pluvialGamma / 2.0) * 44);

  // Dynamic river channel width (Leopold-Maddock law w ∝ Q^0.5)
  const riverStrokeWidth = Math.max(1.0, 1.2 + Math.sqrt(Math.max(0.0, pluvialGamma)) * 3.2);

  return (
    <div
      data-instrument="orographic-moisture"
      className={`p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header */}
      <div className="flex items-start justify-between text-micro mb-1.5 font-mono">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              OROGRAPHIC MOISTURE
            </span>
          </div>
          <span className="text-nano text-[var(--theme-text-muted)] truncate pl-3">
            Adiabatic Condensation Profile
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1">
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {(rainShadowFeedback * 100).toFixed(0)}%
          </span>
          <span className="opacity-40">•</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {pluvialGamma.toFixed(1)}×
          </span>
          <span className="opacity-40">•</span>
          <span
            className={`font-bold font-mono ${
              thermodynamicGating
                ? 'text-[var(--theme-status-sage)]'
                : 'text-[var(--theme-text-muted)]'
            }`}
          >
            {thermodynamicGating ? 'LCL' : 'BYPASS'}
          </span>
        </div>
      </div>

      {/* 2. Interactive SVG Viewport */}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="slider"
        aria-label="Orographic Moisture Profile and Condensation Caliper"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={rainShadowFeedback}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleReset}
        onKeyDown={handleKeyDown}
        title="Drag windward slope to adjust coupling (0–100%) • Drag rain shaft to adjust pluvial swelling (0–2.0x) • Click LCL to toggle gating • Double-click to reset"
        className={`relative w-full h-28 rounded-[2px] overflow-hidden cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none bg-[var(--theme-instrument-viewport-bg)] border-[var(--theme-instrument-viewport-border)]`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 280 130"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Windward Moisture Gradient */}
            <linearGradient id="windward-cloud-grad" x1="0" y1="1" x2="0.6" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.15" />
              <stop offset="60%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.65" />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink-secondary)' }} stopOpacity="0.85" />
            </linearGradient>

            {/* Precipitation Column Gradient */}
            <linearGradient id="precip-shaft-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink-secondary)' }} stopOpacity="0.8" />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink-secondary)' }} stopOpacity="0.15" />
            </linearGradient>
          </defs>


          {/* Terrestrial Mountain Elevation Cross-Section */}
          <path
            d="M 16 118 L 48 118 C 76 118, 102 74, 136 36 C 140 32, 146 34, 150 40 C 174 76, 194 106, 210 118 L 270 118 L 270 128 L 16 128 Z"
            style={{
              fill: 'var(--theme-instrument-viewport-bg-center)',
              stroke: 'var(--theme-instrument-ink)'
            }}
            strokeWidth="1.2"
          />

          {/* LCL (Lifting Condensation Level) Horizon Line (Windward condensation base) */}
          <line
            x1="20"
            y1={lclY}
            x2="136"
            y2={lclY}
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth={thermodynamicGating ? '1' : '0.6'}
            strokeDasharray={thermodynamicGating ? '4 2' : '2 3'}
            opacity={thermodynamicGating ? '0.85' : '0.35'}
          />
          <text
            x="22"
            y="65"
            fontSize="5.5"
            fontFamily="var(--font-mono, monospace)"
            style={{ fill: 'var(--theme-instrument-ink)' }}
            opacity="0.8"
            fontWeight="bold"
          >
            LCL
          </text>

          {/* Windward Moist Inflow Streamlines & Sparse 'Moist' Label */}
          <path
            d="M 18 112 Q 38 108 55 96 T 100 62"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
            strokeWidth="0.8"
            strokeDasharray="3 2"
            opacity="0.7"
          />
          <path d="M 36 102 L 39 99 L 42 102" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" opacity="0.65" />
          <path d="M 68 84 L 71 81 L 74 84" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" opacity="0.75" />
          <text
            x="32"
            y="89"
            fontSize="6.5"
            fontFamily="var(--font-mono, monospace)"
            style={{ fill: 'var(--theme-instrument-ink-secondary)' }}
            opacity="0.9"
            fontWeight="bold"
          >
            Windward
          </text>
          {/* Condensation Vapor Droplet Pips */}
          <circle cx="48" cy="98" r="1.2" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.5" />
          <circle cx="74" cy="78" r="1.4" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.6" />
          <circle cx="98" cy="62" r="1.6" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} opacity="0.7" />

          {/* Dynamic Windward Condensation Cloud Deck */}
          {/* Cloud mass expands upward and along the windward face based on rainShadowFeedback */}
          <path
            d={`M 56 68 Q ${70 - rainShadowFeedback * 10} ${
              60 - rainShadowFeedback * 25
            }, ${85 + rainShadowFeedback * 15} ${52 - rainShadowFeedback * 20} Q ${
              110 + rainShadowFeedback * 15
            } ${38 - rainShadowFeedback * 16}, 138 38 Q 144 44, 138 68 L 56 68 Z`}
            fill="url(#windward-cloud-grad)"
            fillOpacity={0.15 + rainShadowFeedback * 0.72}
            style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
            strokeWidth="0.9"
            strokeDasharray="3 1"
          />

          {/* Summit Crest Condensation Cap */}
          <path
            d="M 132 38 Q 138 30 144 38"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
            strokeWidth="0.9"
            opacity="0.8"
          />

          {/* Additional Billow Arcs along Windward Ascent */}
          {rainShadowFeedback > 0.15 && (
            <path
              d={`M 68 68 Q 80 ${55 - rainShadowFeedback * 15} 96 60 Q 112 ${
                45 - rainShadowFeedback * 18
              } 130 46`}
              fill="none"
              style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
              strokeWidth="0.6"
              opacity="0.75"
            />
          )}

          {/* Vertical Rain Shaft Bracket & Precipitation Column connecting Crest to Valley Floor */}
          {/* Guide line from summit crest to caliper handle */}
          <line
            x1="162"
            y1="40"
            x2="162"
            y2={pluvialThumbY - 6.5}
            style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
            strokeWidth="0.8"
            strokeDasharray="2 3"
            opacity={0.4 + pluvialGamma * 0.3}
          />

          {/* Precipitation Shaft / Column descending from crest */}
          {pluvialGamma > 0.05 && (
            <g opacity={Math.min(1.0, 0.3 + pluvialGamma * 0.5)}>
              {/* Rain Streaks descending into valley floor */}
              {Array.from({ length: Math.min(18, Math.round(5 + pluvialGamma * 7)) }).map((_, i) => {
                const startX = 142 + i * 2.8;
                const startY = 46 + (i % 3) * 4;
                const endX = startX - 5;
                const endY = 118;
                return (
                  <line
                    key={i}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
                    strokeWidth={0.5 + pluvialGamma * 0.35}
                    strokeDasharray="2 3"
                  />
                );
              })}
            </g>
          )}

          {/* Valley Floor Hydrology: River Channel widening via Leopold-Maddock Law */}
          <line
            x1="150"
            y1="118"
            x2="210"
            y2="118"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth={riverStrokeWidth}
            strokeLinecap="round"
            className="drop-shadow-sm"
          />
          {/* River Inflow & Drainage Channel Taper */}
          <line
            x1="215"
            y1="118"
            x2="245"
            y2="118"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth={Math.max(0.8, riverStrokeWidth * 0.6)}
            strokeDasharray="4 2"
            opacity="0.7"
          />
          {/* Hydrological River Ripples */}
          <path
            d="M 158 122 Q 164 120 170 122 T 182 122"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="0.65"
            opacity={0.35 + pluvialGamma * 0.35}
          />
          <path
            d="M 186 122 Q 192 120 198 122 T 210 122"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="0.65"
            opacity={0.35 + pluvialGamma * 0.35}
          />

          {/* Leeward Foehn / Rain Shadow Subsidence Airflow & Sparse 'Arid' Label */}
          <path
            d="M 148 42 Q 175 75 205 98 T 255 112"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="0.8"
            strokeDasharray="3 2"
            opacity="0.6"
          />
          <polygon
            points="255,112 249,109 251,114"
            style={{ fill: 'var(--theme-instrument-ink)' }}
            opacity="0.7"
          />
          <path
            d="M 154 50 Q 180 80 208 102 T 248 116"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink)' }}
            strokeWidth="0.6"
            strokeDasharray="2 3"
            opacity="0.45"
          />
          <text
            x="215"
            y="89"
            fontSize="6.5"
            fontFamily="var(--font-mono, monospace)"
            style={{ fill: 'var(--theme-instrument-ink)' }}
            opacity="0.85"
            fontWeight="bold"
          >
            Rain Shadow
          </text>
          {/* Rain Shadow Arid Surface Desiccation Cues */}
          <line x1="220" y1="114" x2="228" y2="114" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" strokeDasharray="1.5 2" opacity="0.45" />
          <line x1="235" y1="115" x2="245" y2="115" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" strokeDasharray="1.5 2" opacity="0.45" />

          {/* 3-Medium Adaptive Graphic Groups */}
          {theme === 1 ? (
            // Theme 1 (Cream Rag Paper): Victorian intaglio mountain hachures & engraving
            <g className="orographic-engraving-cream orographic-profile-cream text-[var(--theme-instrument-ink)]">
              {/* Intaglio Geological Slope Hachures conforming to mountain relief */}
              {Array.from({ length: 14 }).map((_, i) => {
                const x = 54 + i * 6;
                const t = Math.max(0, Math.min(1, (x - 48) / 88));
                const mt = 1 - t;
                const yTop = Math.round(mt * mt * mt * 118 + 3 * mt * mt * t * 118 + 3 * mt * t * t * 74 + t * t * t * 36);
                return (
                  <line
                    key={i}
                    x1={x}
                    y1={yTop}
                    x2={x - 3}
                    y2={Math.min(118, yTop + 8)}
                    stroke="currentColor"
                    strokeWidth="0.5"
                    opacity="0.45"
                  />
                );
              })}
              {/* Leeward steep hachures */}
              {Array.from({ length: 9 }).map((_, i) => {
                const x = 152 + i * 6;
                const yTop = 46 + i * 8;
                return (
                  <line
                    key={`lee-${i}`}
                    x1={x}
                    y1={yTop}
                    x2={x + 3}
                    y2={Math.min(118, yTop + 7)}
                    stroke="currentColor"
                    strokeWidth="0.5"
                    opacity="0.45"
                  />
                );
              })}
            </g>
          ) : theme === 2 ? (
            // Theme 2 (Prussian Cyanotype): CAD drafting tephigram & adiabatic lapse vectors
            <g className="orographic-vector-cyanotype orographic-profile-cyanotype text-[var(--theme-instrument-ink)]">
              {/* Elevation Coordinate Grid & Isohyets */}
              <line x1="20" y1="36" x2="32" y2="36" stroke="currentColor" strokeWidth="0.6" />
              <line x1="20" y1="68" x2="32" y2="68" stroke="currentColor" strokeWidth="0.6" />
              <line x1="20" y1="96" x2="32" y2="96" stroke="currentColor" strokeWidth="0.6" />

              {/* Radiosonde Vector Wind Barbs along Ascent */}
              <line x1="38" y1="108" x2="52" y2="98" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" />
              <line x1="52" y1="98" x2="48" y2="93" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" />
              <line x1="72" y1="84" x2="86" y2="74" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" />
              <line x1="86" y1="74" x2="82" y2="69" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" />
              <line x1="106" y1="60" x2="120" y2="50" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" />
              <line x1="120" y1="50" x2="116" y2="45" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.75" />
            </g>
          ) : (
            // Theme 0 (Marie Tharp): Acoustic sounding traces & physiographic ridge contours
            <g className="orographic-sounding-tharp orographic-profile-tharp text-[var(--theme-instrument-ink)]">
              {/* Sonar Pulse Echo Rings at Mountain Summit */}
              <circle
                cx="140"
                cy="36"
                r="8"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeDasharray="2 2"
                fill="none"
                opacity="0.6"
              />
              <circle
                cx="140"
                cy="36"
                r="16"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeDasharray="3 3"
                fill="none"
                opacity="0.35"
              />

              {/* Acoustic Bathymetric Ridge Ticks */}
              {Array.from({ length: 12 }).map((_, i) => (
                <line
                  key={i}
                  x1={35 + i * 18}
                  y1="118"
                  x2={35 + i * 18}
                  y2="124"
                  style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
                  strokeWidth="0.5"
                  opacity="0.5"
                />
              ))}
            </g>
          )}

          {/* Interactive Windward Cloud Caliper Handle */}
          <g className="cursor-ew-resize">
            <circle
              cx={cloudThumbX}
              cy={cloudThumbY}
              r="7.5"
              style={{
                fill: 'var(--theme-instrument-caliper-badge-bg)',
                stroke: 'var(--theme-instrument-caliper)'
              }}
              strokeWidth="1.5"
              className="drop-shadow"
            />
            <circle cx={cloudThumbX} cy={cloudThumbY} r="2.5" style={{ fill: 'var(--theme-instrument-caliper)' }} />
            {/* Value Callout Badge */}
            <rect
              x={cloudThumbX - 38}
              y={cloudThumbY - 32}
              width="76"
              height="24"
              rx="2.5"
              style={{
                fill: 'var(--theme-instrument-caliper-badge-bg)',
                stroke: 'var(--theme-instrument-caliper)'
              }}
              strokeWidth="0.75"
              className="drop-shadow"
            />
            <text
              x={cloudThumbX}
              y={cloudThumbY - 22}
              textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="6"
              fontFamily="var(--font-mono, monospace)"
              opacity="0.7"
              fontWeight="bold"
              letterSpacing="0.05em"
            >
              CLOUD COVER
            </text>
            <text
              x={cloudThumbX}
              y={cloudThumbY - 12}
              textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="9.5"
              fontFamily="var(--font-mono, monospace)"
              fontWeight="bold"
            >
              {(rainShadowFeedback * 100).toFixed(0)}%
            </text>
          </g>

          {/* Interactive Pluvial Shaft Caliper Handle (Coupled directly to precipitation shaft & valley river) */}
          <g className="cursor-ns-resize">
            {/* Caliper bracket connecting handle to valley river */}
            <line
              x1={pluvialThumbX}
              y1={pluvialThumbY + 7.5}
              x2={pluvialThumbX}
              y2="118"
              style={{ stroke: 'var(--theme-instrument-ink-secondary)' }}
              strokeWidth="0.8"
              strokeDasharray="2 3"
              opacity={0.4 + pluvialGamma * 0.3}
            />
            <circle
              cx={pluvialThumbX}
              cy={pluvialThumbY}
              r="7.5"
              style={{
                fill: 'var(--theme-instrument-caliper-badge-bg)',
                stroke: 'var(--theme-instrument-ink-secondary)'
              }}
              strokeWidth="1.5"
              className="drop-shadow"
            />
            <circle cx={pluvialThumbX} cy={pluvialThumbY} r="2.5" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />
            {/* Value Callout Badge */}
            <rect
              x={pluvialThumbX + 11}
              y={pluvialThumbY - 12}
              width="74"
              height="24"
              rx="2.5"
              style={{
                fill: 'var(--theme-instrument-caliper-badge-bg)',
                stroke: 'var(--theme-instrument-caliper)'
              }}
              strokeWidth="0.75"
              className="drop-shadow"
            />
            <text
              x={pluvialThumbX + 48}
              y={pluvialThumbY - 2}
              textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="6"
              fontFamily="var(--font-mono, monospace)"
              opacity="0.7"
              fontWeight="bold"
              letterSpacing="0.05em"
            >
              RIVER SWELL
            </text>
            <text
              x={pluvialThumbX + 48}
              y={pluvialThumbY + 8}
              textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="9.5"
              fontFamily="var(--font-mono, monospace)"
              fontWeight="bold"
            >
              {pluvialGamma.toFixed(1)}×
            </text>
          </g>
        </svg>
      </div>

      {/* Hidden inputs preserving DOM IDs for test compatibility */}
      <input
        type="range"
        id="sidebar-rain-shadow"
        min={0}
        max={1.0}
        step={0.05}
        value={rainShadowFeedback}
        onChange={(e) => onRainShadowChange?.(parseFloat(e.target.value))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        type="range"
        id="sidebar-orographic-coupling"
        min={0}
        max={1.0}
        step={0.05}
        value={rainShadowFeedback}
        onChange={(e) => onRainShadowChange?.(parseFloat(e.target.value))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        type="range"
        id="sidebar-pluvial-coupling"
        min={0}
        max={2.0}
        step={0.1}
        value={pluvialGamma}
        onChange={(e) => onPluvialGammaChange?.(parseFloat(e.target.value))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      {/* Thermodynamic gating toggle - hidden buttons for test DOM IDs */}
      <button
        id="sidebar-thermodynamic-gating-on"
        role="radio"
        aria-checked={thermodynamicGating ? 'true' : 'false'}
        onClick={() => onThermodynamicGatingChange?.(true)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        Thermodynamic Gating
      </button>
      <button
        id="sidebar-thermodynamic-gating-off"
        role="radio"
        aria-checked={!thermodynamicGating ? 'true' : 'false'}
        onClick={() => onThermodynamicGatingChange?.(false)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        Disabled (OFF)
      </button>

      {/* 4. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border-50)] opacity-80">
        <span className="truncate font-bold tracking-wide">OROGRAPHIC COUPLING & PLUVIAL RUNOFF</span>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center justify-center min-h-[20px] px-1.5 py-0.5 rounded-[1px] font-bold hover:underline text-[var(--theme-text-accent)] cursor-pointer shrink-0 ml-1"
        >
          [RESET]
        </button>
      </div>
    </div>
  );
};

export default OrographicMoistureProfile;
