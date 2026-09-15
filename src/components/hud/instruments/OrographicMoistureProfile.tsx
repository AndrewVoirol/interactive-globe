// ============================================================================
// File: src/components/hud/instruments/OrographicMoistureProfile.tsx
// Orographic Moisture Profile Instrument: Adiabatic Condensation & Pluvial Coupling
// Controls: Orographic Coupling (0.00-1.00), Pluvial Coupling (0.0-2.0x), Thermodynamic Gating
// Medium-Adaptive SVG: Cream (Intaglio Hachures), Cyanotype (CAD Adiabatic Tephigram), Tharp (Physiographic Sounding)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useCallback } from 'react';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { VernierSlider } from '../../ui/VernierSlider';

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

  // Medium color tokens
  const tokens = theme === 2
    ? {
        viewportBg: 'bg-[#0d1724]',
        viewportBorder: 'border-[#3b597a]/60',
        mountainFill: '#101c2c',
        mountainStroke: '#4fa3e3',
        cloudFill: '#4fa3e3',
        cloudStroke: '#a5d5ff',
        rainStroke: '#70b7ff',
        riverStroke: '#4fa3e3',
        lclLine: '#4fa3e3',
        caliperLine: '#a5d5ff',
        caliperBadgeBg: '#0e1824',
        caliperBadgeBorder: '#a5d5ff',
        caliperBadgeText: '#a5d5ff',
        hachureColor: '#4fa3e3',
      }
    : theme === 1
    ? {
        viewportBg: 'bg-[#fdfcf9]',
        viewportBorder: 'border-[#b8ad98]/60',
        mountainFill: '#f2eae0',
        mountainStroke: '#8c4820',
        cloudFill: '#d9c7b0',
        cloudStroke: '#8c4820',
        rainStroke: '#8c4820',
        riverStroke: '#8c4820',
        lclLine: '#8c4820',
        caliperLine: '#8c4820',
        caliperBadgeBg: '#fdfcf9',
        caliperBadgeBorder: '#8c4820',
        caliperBadgeText: '#8c4820',
        hachureColor: '#8c4820',
      }
    : {
        viewportBg: 'bg-[#0c1219]',
        viewportBorder: 'border-[#3a4d61]/60',
        mountainFill: '#111e29',
        mountainStroke: '#00e5ff',
        cloudFill: '#163140',
        cloudStroke: '#00e5ff',
        rainStroke: '#34d399',
        riverStroke: '#00e5ff',
        lclLine: '#34d399',
        caliperLine: '#00e5ff',
        caliperBadgeBg: '#0a111a',
        caliperBadgeBorder: '#00e5ff',
        caliperBadgeText: '#00e5ff',
        hachureColor: '#00e5ff',
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
              OROGRAPHIC MOISTURE
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Adiabatic Condensation Profile
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1">
          <span className="text-[var(--theme-text-secondary)]">Coupling:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {(rainShadowFeedback * 100).toFixed(0)}%
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Pluvial:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {pluvialGamma.toFixed(1)}x
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">LCL:</span>
          <span
            className={`font-bold font-mono ${
              thermodynamicGating
                ? 'text-[var(--theme-status-sage)]'
                : 'text-[var(--theme-text-muted)]'
            }`}
          >
            {thermodynamicGating ? 'ACTIVE' : 'BYPASS'}
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
        className={`relative w-full h-28 rounded-[2px] border overflow-hidden cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${tokens.viewportBg} ${tokens.viewportBorder}`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 280 130"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Windward Moisture Gradient */}
            <linearGradient id="windward-cloud-grad" x1="0" y1="1" x2="0.6" y2="0">
              <stop offset="0%" stopColor={tokens.cloudFill} stopOpacity="0.15" />
              <stop offset="60%" stopColor={tokens.cloudFill} stopOpacity="0.65" />
              <stop offset="100%" stopColor={tokens.cloudStroke} stopOpacity="0.85" />
            </linearGradient>

            {/* Precipitation Column Gradient */}
            <linearGradient id="precip-shaft-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tokens.rainStroke} stopOpacity="0.8" />
              <stop offset="100%" stopColor={tokens.rainStroke} stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Background Earth Baseline & Sea Level */}
          <line
            x1="16"
            y1="118"
            x2="270"
            y2="118"
            stroke={tokens.mountainStroke}
            strokeWidth="0.75"
            opacity="0.6"
          />

          {/* Terrestrial Mountain Elevation Cross-Section */}
          <path
            d="M 16 118 L 48 118 C 76 118, 102 74, 136 36 C 140 32, 146 34, 150 40 C 174 76, 194 106, 210 118 L 270 118 L 270 128 L 16 128 Z"
            fill={tokens.mountainFill}
            stroke={tokens.mountainStroke}
            strokeWidth="1.2"
          />

          {/* LCL (Lifting Condensation Level) Horizon Line */}
          <line
            x1="20"
            y1={lclY}
            x2="265"
            y2={lclY}
            stroke={tokens.lclLine}
            strokeWidth={thermodynamicGating ? '1' : '0.6'}
            strokeDasharray={thermodynamicGating ? '4 2' : '2 3'}
            opacity={thermodynamicGating ? '0.85' : '0.35'}
          />
          <text
            x="24"
            y={lclY - 3}
            fill={tokens.lclLine}
            fontSize="6.5"
            fontFamily="monospace"
            opacity={thermodynamicGating ? '0.9' : '0.45'}
          >
            {thermodynamicGating
              ? '▲ LCL CONDENSATION BASE (z ≈ 125m × ΔT)'
              : '┄ LCL GATING BYPASS (UNCONDITIONAL)'}
          </text>

          {/* Dynamic Windward Condensation Cloud Deck */}
          {/* Cloud mass expands upward and along the windward face based on rainShadowFeedback */}
          <path
            d={`M 56 68 Q ${70 - rainShadowFeedback * 10} ${
              60 - rainShadowFeedback * 25
            }, ${85 + rainShadowFeedback * 15} ${52 - rainShadowFeedback * 20} Q ${
              110 + rainShadowFeedback * 15
            } ${38 - rainShadowFeedback * 16}, 138 38 L 138 68 Z`}
            fill="url(#windward-cloud-grad)"
            fillOpacity={0.12 + rainShadowFeedback * 0.72}
            stroke={tokens.cloudStroke}
            strokeWidth="0.8"
            strokeDasharray="3 1"
          />

          {/* Additional Billow Arcs along Windward Ascent */}
          {rainShadowFeedback > 0.15 && (
            <path
              d={`M 68 68 Q 80 ${55 - rainShadowFeedback * 15} 96 60 Q 112 ${
                45 - rainShadowFeedback * 18
              } 130 46`}
              fill="none"
              stroke={tokens.cloudStroke}
              strokeWidth="0.6"
              opacity="0.75"
            />
          )}

          {/* Precipitation Shaft / Column descending from crest */}
          {pluvialGamma > 0.05 && (
            <g opacity={Math.min(1.0, 0.25 + pluvialGamma * 0.5)}>
              {/* Rain Streaks */}
              {Array.from({ length: Math.min(18, Math.round(5 + pluvialGamma * 7)) }).map((_, i) => {
                const startX = 138 + i * 2.8;
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
                    stroke={tokens.rainStroke}
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
            stroke={tokens.riverStroke}
            strokeWidth={riverStrokeWidth}
            strokeLinecap="round"
            className="drop-shadow-sm"
          />
          {pluvialGamma > 0.3 && (
            <text
              x="180"
              y="126"
              textAnchor="middle"
              fill={tokens.riverStroke}
              fontSize="6"
              fontFamily="monospace"
              opacity="0.85"
            >
              RIVER CHANNEL (w ∝ Q^0.5)
            </text>
          )}

          {/* Leeward Foehn / Rain Shadow Subsidence Airflow */}
          <path
            d="M 148 42 Q 175 75 205 98 T 255 112"
            fill="none"
            stroke={tokens.mountainStroke}
            strokeWidth="0.75"
            strokeDasharray="3 2"
            opacity="0.55"
          />
          <polygon
            points="255,112 249,109 251,114"
            fill={tokens.mountainStroke}
            opacity="0.65"
          />
          <text
            x="220"
            y="94"
            fill={tokens.mountainStroke}
            fontSize="6.5"
            fontFamily="monospace"
            opacity="0.75"
          >
            RAIN SHADOW ➔
          </text>
          <text
            x="220"
            y="102"
            fill={tokens.mountainStroke}
            fontSize="5.5"
            fontFamily="monospace"
            opacity="0.55"
          >
            Dry Adiabatic Warming
          </text>

          {/* 3-Medium Adaptive Graphic Groups */}
          {theme === 1 ? (
            // Theme 1 (Cream Rag Paper): Victorian intaglio mountain hachures & engraving
            <g className="orographic-engraving-cream orographic-profile-cream text-[#8c4820]">
              {/* Intaglio Geological Slope Hachures */}
              {Array.from({ length: 14 }).map((_, i) => {
                const x = 54 + i * 6;
                const yTop = 118 - (x - 48) * 0.95;
                return (
                  <line
                    key={i}
                    x1={x}
                    y1={yTop}
                    x2={x - 3}
                    y2={Math.min(118, yTop + 8)}
                    stroke="#8c4820"
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
                    stroke="#8c4820"
                    strokeWidth="0.5"
                    opacity="0.45"
                  />
                );
              })}

              {/* Classical Cartographic Text Annotations */}
              <text
                x="30"
                y="32"
                fill="#8c4820"
                fontSize="7.5"
                fontFamily="serif"
                fontStyle="italic"
                fontWeight="bold"
              >
                Ascent (Moist)
              </text>
              <text
                x="145"
                y="28"
                fill="#8c4820"
                fontSize="7.5"
                fontFamily="serif"
                fontStyle="italic"
                fontWeight="bold"
              >
                Crest (Condensation)
              </text>
              <text
                x="220"
                y="32"
                fill="#8c4820"
                fontSize="7.5"
                fontFamily="serif"
                fontStyle="italic"
                fontWeight="bold"
              >
                Shadow (Arid)
              </text>
            </g>
          ) : theme === 2 ? (
            // Theme 2 (Prussian Cyanotype): CAD drafting tephigram & adiabatic lapse vectors
            <g className="orographic-vector-cyanotype orographic-profile-cyanotype text-[#4fa3e3]">
              {/* Elevation Coordinate Grid & Isohyets */}
              <line x1="20" y1="36" x2="32" y2="36" stroke="#4fa3e3" strokeWidth="0.6" />
              <line x1="20" y1="68" x2="32" y2="68" stroke="#4fa3e3" strokeWidth="0.6" />
              <line x1="20" y1="96" x2="32" y2="96" stroke="#4fa3e3" strokeWidth="0.6" />
              <text x="18" y="38" textAnchor="end" fill="#4fa3e3" fontSize="6" fontFamily="monospace">
                4000m
              </text>
              <text x="18" y="70" textAnchor="end" fill="#4fa3e3" fontSize="6" fontFamily="monospace">
                1500m
              </text>
              <text x="18" y="98" textAnchor="end" fill="#4fa3e3" fontSize="6" fontFamily="monospace">
                500m
              </text>

              {/* Radiosonde Vector Wind Barbs along Ascent */}
              <line x1="38" y1="108" x2="52" y2="98" stroke="#a5d5ff" strokeWidth="0.75" />
              <line x1="52" y1="98" x2="48" y2="93" stroke="#a5d5ff" strokeWidth="0.75" />
              <line x1="72" y1="84" x2="86" y2="74" stroke="#a5d5ff" strokeWidth="0.75" />
              <line x1="86" y1="74" x2="82" y2="69" stroke="#a5d5ff" strokeWidth="0.75" />
              <line x1="106" y1="60" x2="120" y2="50" stroke="#a5d5ff" strokeWidth="0.75" />
              <line x1="120" y1="50" x2="116" y2="45" stroke="#a5d5ff" strokeWidth="0.75" />

              <text x="36" y="24" fill="#a5d5ff" fontSize="7" fontFamily="monospace" fontWeight="bold">
                ADIABATIC ASCENT [Γd = 9.8°C/km]
              </text>
            </g>
          ) : (
            // Theme 0 (Marie Tharp): Acoustic sounding traces & physiographic ridge contours
            <g className="orographic-sounding-tharp orographic-profile-tharp text-[#00e5ff]">
              {/* Sonar Pulse Echo Rings at Mountain Summit */}
              <circle
                cx="140"
                cy="36"
                r="8"
                stroke="#00e5ff"
                strokeWidth="0.5"
                strokeDasharray="2 2"
                fill="none"
                opacity="0.6"
              />
              <circle
                cx="140"
                cy="36"
                r="16"
                stroke="#00e5ff"
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
                  stroke="#34d399"
                  strokeWidth="0.5"
                  opacity="0.5"
                />
              ))}

              <text x="36" y="24" fill="#00e5ff" fontSize="7" fontFamily="monospace" fontWeight="bold">
                OROGRAPHIC LIFT & INVERSION
              </text>
            </g>
          )}

          {/* Interactive Windward Cloud Caliper Handle */}
          <g className="cursor-ew-resize">
            <circle
              cx={cloudThumbX}
              cy={cloudThumbY}
              r="6.5"
              fill={tokens.caliperBadgeBg}
              stroke={tokens.caliperLine}
              strokeWidth="1.5"
              className="drop-shadow"
            />
            <circle cx={cloudThumbX} cy={cloudThumbY} r="2.5" fill={tokens.caliperLine} />
            {/* Value Callout Badge */}
            <rect
              x={cloudThumbX - 22}
              y={cloudThumbY - 18}
              width="44"
              height="12"
              rx="2"
              fill={tokens.caliperBadgeBg}
              stroke={tokens.caliperBadgeBorder}
              strokeWidth="0.75"
              className="drop-shadow"
            />
            <text
              x={cloudThumbX}
              y={cloudThumbY - 9.5}
              textAnchor="middle"
              fill={tokens.caliperBadgeText}
              fontSize="7"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {(rainShadowFeedback * 100).toFixed(0)}%
            </text>
          </g>

          {/* Interactive Pluvial Shaft Caliper Handle */}
          <g className="cursor-ns-resize">
            <circle
              cx={pluvialThumbX}
              cy={pluvialThumbY}
              r="6.5"
              fill={tokens.caliperBadgeBg}
              stroke={tokens.rainStroke}
              strokeWidth="1.5"
              className="drop-shadow"
            />
            <circle cx={pluvialThumbX} cy={pluvialThumbY} r="2.5" fill={tokens.rainStroke} />
            {/* Value Callout Badge */}
            <rect
              x={pluvialThumbX + 8}
              y={pluvialThumbY - 6}
              width="36"
              height="12"
              rx="2"
              fill={tokens.caliperBadgeBg}
              stroke={tokens.caliperBadgeBorder}
              strokeWidth="0.75"
              className="drop-shadow"
            />
            <text
              x={pluvialThumbX + 26}
              y={pluvialThumbY + 2.5}
              textAnchor="middle"
              fill={tokens.caliperBadgeText}
              fontSize="7"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {pluvialGamma.toFixed(1)}x
            </text>
          </g>
        </svg>
      </div>

      {/* 3. Secondary Calibration Sliders & Steppers (100% Backward-Compatibility with Tests) */}
      <div className="space-y-1.5 pt-1 border-t border-[var(--theme-card-border)]/50">
        {/* Orographic Coupling Slider */}
        <VernierSlider
          id="sidebar-rain-shadow"
          label="Orographic Coupling"
          sublabel="Windward Condensation & Rain Shadows"
          min={0.0}
          max={1.0}
          step={0.05}
          value={rainShadowFeedback}
          readout={`${Math.round(rainShadowFeedback * 100)}%`}
          onChange={(val) => onRainShadowChange?.(val)}
        />
        {/* Companion input for legacy #sidebar-orographic-coupling DOM ID */}
        <input
          type="range"
          id="sidebar-orographic-coupling"
          min={0.0}
          max={1.0}
          step={0.05}
          value={rainShadowFeedback}
          onChange={(e) => onRainShadowChange?.(parseFloat(e.target.value))}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        {/* Pluvial Coupling Slider */}
        <VernierSlider
          id="sidebar-pluvial-coupling"
          label="Pluvial Coupling"
          sublabel="Precipitation Swelling & River Width"
          min={0.0}
          max={2.0}
          step={0.1}
          value={pluvialGamma}
          readout={`${pluvialGamma.toFixed(1)}x`}
          onChange={(val) => onPluvialGammaChange?.(val)}
        />

        {/* Thermodynamic Gating SegmentedControl */}
        <div className="space-y-1 pt-1 border-t border-[var(--theme-control-border)]/50">
          <div className="flex items-center justify-between text-nano">
            <span className="font-bold text-[var(--theme-text-primary)] uppercase tracking-wider">
              Thermodynamic Gating
            </span>
            <span className="text-[var(--theme-text-muted)] font-mono text-nano">
              {thermodynamicGating ? 'LCL ON' : 'OFF'}
            </span>
          </div>
          <SegmentedControl<boolean>
            size="sm"
            value={thermodynamicGating}
            onChange={(enabled) => onThermodynamicGatingChange?.(enabled)}
            className="grid grid-cols-2 gap-1 font-mono text-[10px] tracking-wider w-full"
            options={[
              {
                id: true,
                domId: 'sidebar-thermodynamic-gating-on',
                label: 'Thermodynamic Gating',
                title:
                  'Thermodynamic Gating Active (LCL ≈ 125m × (T - Td)): Air must reach condensation altitude',
                className: 'w-full',
              },
              {
                id: false,
                domId: 'sidebar-thermodynamic-gating-off',
                label: 'Disabled (OFF)',
                title:
                  'Thermodynamic Gating Disabled: Legacy unconditional precipitation amplification (1.0x)',
                className: 'w-full',
              },
            ]}
          />
        </div>
      </div>

      {/* 4. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border)]/50 opacity-80">
        <span className="truncate">OROGRAPHIC PROFILE (0.0–1.0 / 0.0–2.0x)</span>
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

export default OrographicMoistureProfile;
