// ============================================================================
// File: src/components/hud/instruments/AtmosphericColumnInstrument.tsx
// Atmospheric Cross-Section Column Instrument: Tropospheric Strata Caliper
// Controls: Calibrated Strata (Low/Mid/High), Atmospheric Scale, Cloud Opacity
// Medium-Adaptive SVG: Cream (Engravings), Cyanotype (Isobaric CAD), Tharp (Acoustic Sounding)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface AtmosphericColumnInstrumentProps {
  showCloudLow: boolean;
  showCloudMid: boolean;
  showCloudHigh: boolean;
  cloudFalseColor?: boolean;
  atmosphericScale: number; // 1.0 to 12.0, default 3.5
  cloudOpacity: number; // 0.10 to 1.00, default 0.80
  theme?: 0 | 1 | 2; // 0: Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  onToggleStrata: (stratum: 'low' | 'mid' | 'high', active: boolean) => void;
  onToggleFalseColor?: (active: boolean) => void;
  onAtmosphericScaleChange: (scale: number) => void;
  onCloudOpacityChange?: (opacity: number) => void;
  className?: string;
}

export const AtmosphericColumnInstrument: React.FC<AtmosphericColumnInstrumentProps> = ({
  showCloudLow = true,
  showCloudMid = true,
  showCloudHigh = true,
  cloudFalseColor = false,
  atmosphericScale = 3.5,
  cloudOpacity = 0.80,
  theme = 0,
  onToggleStrata,
  onToggleFalseColor,
  onAtmosphericScaleChange,
  onCloudOpacityChange,
  className = '',
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const pointerStartPosRef = useRef({ x: 0, y: 0, time: 0 });
  const hasMovedRef = useRef(false);

  // Coordinate mapping:
  // Viewport Y coordinates map inversely to atmosphericScale [1.0 .. 12.0]
  // Top of column (normY = 0.06) maps to 12.0x, bottom (normY = 0.92) maps to 1.0x
  const updateFromPointer = useCallback(
    (clientY: number) => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const normY = Math.max(0.06, Math.min(0.92, (clientY - rect.top) / rect.height));
      const t = (0.92 - normY) / (0.92 - 0.06);
      const rawScale = 1.0 + t * 11.0;
      const steppedScale = Math.round(rawScale * 10) / 10;
      const clampedScale = Math.max(1.0, Math.min(12.0, steppedScale));
      onAtmosphericScaleChange(clampedScale);
    },
    [onAtmosphericScaleChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    hasMovedRef.current = false;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if setPointerCapture is unsupported or fails
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartPosRef.current.y);
    if (dy > 3 || dx > 3) {
      hasMovedRef.current = true;
      updateFromPointer(e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Graceful fallback
    }

    // Quick click (< 350ms and no drag movement) toggles stratum band
    if (!hasMovedRef.current && Date.now() - pointerStartPosRef.current.time < 350) {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const relY = (e.clientY - rect.top) / rect.height;
      if (relY < 0.40) {
        onToggleStrata('high', !showCloudHigh);
      } else if (relY < 0.70) {
        onToggleStrata('mid', !showCloudMid);
      } else {
        onToggleStrata('low', !showCloudLow);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : 0.1;
      const next = Math.min(12.0, parseFloat((atmosphericScale + step).toFixed(1)));
      onAtmosphericScaleChange(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : 0.1;
      const next = Math.max(1.0, parseFloat((atmosphericScale - step).toFixed(1)));
      onAtmosphericScaleChange(next);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.05;
      const next = Math.min(1.0, parseFloat((cloudOpacity + step).toFixed(2)));
      onCloudOpacityChange?.(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.05;
      const next = Math.max(0.10, parseFloat((cloudOpacity - step).toFixed(2)));
      onCloudOpacityChange?.(next);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onAtmosphericScaleChange(1.0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onAtmosphericScaleChange(12.0);
    }
  };

  const handleReset = () => {
    onAtmosphericScaleChange(3.5);
    onCloudOpacityChange?.(0.80);
    if (!showCloudLow) onToggleStrata('low', true);
    if (!showCloudMid) onToggleStrata('mid', true);
    if (!showCloudHigh) onToggleStrata('high', true);
  };

  // Caliper Y coordinate in SVG viewBox (0 0 280 130)
  // Scale 1.0 -> y = 114 (surface/low base); Scale 12.0 -> y = 14 (tropopause)
  const normScale = Math.max(0, Math.min(1, (atmosphericScale - 1.0) / 11.0));
  const caliperY = Math.round(114 - normScale * 100);

  // Medium tokens for SVG and HUD elements
  const tokens = theme === 2
    ? {
        viewportBg: 'bg-[#0d1724]',
        viewportBorder: 'border-[#3b597a]/60',
        caliperLine: '#a5d5ff',
        caliperBadgeBg: '#0e1824',
        caliperBadgeBorder: '#a5d5ff',
        caliperBadgeText: '#a5d5ff',
        strataLowFill: '#1a2e47',
        strataMidFill: '#1a2e47',
        strataHighFill: '#1a2e47',
        activeStroke: '#4fa3e3',
        cloudFill: '#4fa3e3',
      }
    : theme === 1
    ? {
        viewportBg: 'bg-[#fdfcf9]',
        viewportBorder: 'border-[#b8ad98]/60',
        caliperLine: '#8c4820',
        caliperBadgeBg: '#fdfcf9',
        caliperBadgeBorder: '#8c4820',
        caliperBadgeText: '#8c4820',
        strataLowFill: '#ede3d1',
        strataMidFill: '#ede3d1',
        strataHighFill: '#ede3d1',
        activeStroke: '#8c4820',
        cloudFill: '#8c4820',
      }
    : {
        viewportBg: 'bg-[#0c1219]',
        viewportBorder: 'border-[#3a4d61]/60',
        caliperLine: '#00e5ff',
        caliperBadgeBg: '#0a111a',
        caliperBadgeBorder: '#00e5ff',
        caliperBadgeText: '#00e5ff',
        strataLowFill: '#132230',
        strataMidFill: '#132230',
        strataHighFill: '#132230',
        activeStroke: '#00e5ff',
        cloudFill: '#00e5ff',
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
              ATMOSPHERIC PROFILE
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Tropospheric Strata Column
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1">
          <span className="text-[var(--theme-text-secondary)]">Scale:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {atmosphericScale.toFixed(1)}x
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Opacity:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {Math.round(cloudOpacity * 100)}%
          </span>
        </div>
      </div>

      {/* 2. Interactive SVG Viewport */}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="slider"
        aria-label="Atmospheric Profile and Strata Column Caliper"
        aria-valuemin={1}
        aria-valuemax={12}
        aria-valuenow={atmosphericScale}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleReset}
        onKeyDown={handleKeyDown}
        title="Drag altitude caliper vertically to adjust scale (1.0–12.0x) • Click stratum to toggle layer • Double-click to reset"
        className={`relative w-full h-28 rounded-[2px] border overflow-hidden cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${tokens.viewportBg} ${tokens.viewportBorder}`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 280 130"
          preserveAspectRatio="none"
        >
          {/* Base Strata Column Bands */}
          {/* High Strata Band (Cirrus, 10–12 km) */}
          <rect
            x="42"
            y="24"
            width="230"
            height="20"
            rx="2"
            fill={tokens.strataHighFill}
            fillOpacity={showCloudHigh ? 0.35 : 0.08}
            stroke={showCloudHigh ? tokens.activeStroke : 'currentColor'}
            strokeWidth={showCloudHigh ? 0.75 : 0.3}
            strokeOpacity={showCloudHigh ? 0.8 : 0.25}
          />
          {showCloudHigh && (
            <rect
              x="42"
              y="24"
              width="230"
              height="20"
              rx="2"
              fill={tokens.cloudFill}
              fillOpacity={0.12 + cloudOpacity * 0.45}
            />
          )}

          {/* Mid Strata Band (Altocumulus, 4–6 km) */}
          <rect
            x="42"
            y="60"
            width="230"
            height="20"
            rx="2"
            fill={tokens.strataMidFill}
            fillOpacity={showCloudMid ? 0.35 : 0.08}
            stroke={showCloudMid ? tokens.activeStroke : 'currentColor'}
            strokeWidth={showCloudMid ? 0.75 : 0.3}
            strokeOpacity={showCloudMid ? 0.8 : 0.25}
          />
          {showCloudMid && (
            <rect
              x="42"
              y="60"
              width="230"
              height="20"
              rx="2"
              fill={tokens.cloudFill}
              fillOpacity={0.12 + cloudOpacity * 0.45}
            />
          )}

          {/* Low Strata Band (Stratus, 1–2 km) */}
          <rect
            x="42"
            y="94"
            width="230"
            height="20"
            rx="2"
            fill={tokens.strataLowFill}
            fillOpacity={showCloudLow ? 0.35 : 0.08}
            stroke={showCloudLow ? tokens.activeStroke : 'currentColor'}
            strokeWidth={showCloudLow ? 0.75 : 0.3}
            strokeOpacity={showCloudLow ? 0.8 : 0.25}
          />
          {showCloudLow && (
            <rect
              x="42"
              y="94"
              width="230"
              height="20"
              rx="2"
              fill={tokens.cloudFill}
              fillOpacity={0.12 + cloudOpacity * 0.45}
            />
          )}

          {/* 3-Medium Adaptive SVG Groups */}
          {theme === 1 ? (
            // Theme 1 (Cream Rag Paper): 19th-century Victorian meteorological engravings
            <g className="atmospheric-column-cream strata-engraving-cream text-[#8c4820]">
              {/* Left Altitude Scale Axis */}
              <line x1="40" y1="14" x2="40" y2="122" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="14" x2="40" y2="14" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="34" x2="40" y2="34" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="70" x2="40" y2="70" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="104" x2="40" y2="104" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="122" x2="40" y2="122" stroke="currentColor" strokeWidth="0.75" />
              <text x="31" y="17" textAnchor="end" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity="0.8">15k</text>
              <text x="31" y="37" textAnchor="end" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity="0.8">11k</text>
              <text x="31" y="73" textAnchor="end" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity="0.8">5k</text>
              <text x="31" y="107" textAnchor="end" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity="0.8">1.5k</text>
              <text x="31" y="124" textAnchor="end" fill="currentColor" fontSize="6.5" fontFamily="monospace" opacity="0.8">0m</text>

              {/* Luke Howard 1803 Latin Taxonomy Labels */}
              <text x="48" y="37" fill="#8c4820" fontSize="8" fontFamily="serif" fontStyle="italic" fontWeight="bold">
                Cirrus (10–12 km)
              </text>
              <text x="48" y="73" fill="#8c4820" fontSize="8" fontFamily="serif" fontStyle="italic" fontWeight="bold">
                Alto-cumulus (4–6 km)
              </text>
              <text x="48" y="107" fill="#8c4820" fontSize="8" fontFamily="serif" fontStyle="italic" fontWeight="bold">
                Stratus (1–2 km)
              </text>

              {/* Intaglio copperplate ruling-pen lines and hachures */}
              <path d="M 130 31 Q 160 27 195 33 T 255 31" fill="none" stroke="#8c4820" strokeWidth="0.6" strokeDasharray="2 1" opacity="0.7" />
              <path d="M 135 68 Q 150 64 165 68 Q 180 72 195 68 Q 210 64 225 68" fill="none" stroke="#8c4820" strokeWidth="0.6" opacity="0.7" />
              <path d="M 130 102 L 250 102" fill="none" stroke="#8c4820" strokeWidth="0.6" opacity="0.6" />
              <path d="M 135 106 L 245 106" fill="none" stroke="#8c4820" strokeWidth="0.6" opacity="0.6" />

              {/* Inactive stratum diagonal strikethroughs */}
              {!showCloudHigh && <line x1="42" y1="34" x2="272" y2="34" stroke="#8c4820" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />}
              {!showCloudMid && <line x1="42" y1="70" x2="272" y2="70" stroke="#8c4820" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />}
              {!showCloudLow && <line x1="42" y1="104" x2="272" y2="104" stroke="#8c4820" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />}

              {/* Earth crust baseline and intaglio geological hachures */}
              <line x1="30" y1="122" x2="272" y2="122" stroke="#8c4820" strokeWidth="1" />
              {Array.from({ length: 24 }).map((_, i) => (
                <line key={i} x1={40 + i * 10} y1="122" x2={35 + i * 10} y2="128" stroke="#8c4820" strokeWidth="0.5" opacity="0.5" />
              ))}
            </g>
          ) : theme === 2 ? (
            // Theme 2 (Prussian Cyanotype): 1976 Standard Atmosphere isobaric graph paper
            <g className="atmospheric-column-cyanotype isobar-grid-cyanotype text-[#4fa3e3]">
              {/* Isobaric level lines */}
              <line x1="40" y1="14" x2="272" y2="14" stroke="#4fa3e3" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="34" x2="272" y2="34" stroke="#4fa3e3" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="70" x2="272" y2="70" stroke="#4fa3e3" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="104" x2="272" y2="104" stroke="#4fa3e3" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="122" x2="272" y2="122" stroke="#4fa3e3" strokeWidth="0.75" />

              {/* CAD millimeter division ticks */}
              {Array.from({ length: 12 }).map((_, i) => (
                <line key={i} x1={50 + i * 18} y1="14" x2={50 + i * 18} y2="122" stroke="#4fa3e3" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.2" />
              ))}

              {/* Pressure annotations */}
              <text x="38" y="17" textAnchor="end" fill="#4fa3e3" fontSize="6.5" fontFamily="monospace" opacity="0.8">150hPa</text>
              <text x="38" y="37" textAnchor="end" fill="#4fa3e3" fontSize="6.5" fontFamily="monospace" opacity="0.8">250hPa</text>
              <text x="38" y="73" textAnchor="end" fill="#4fa3e3" fontSize="6.5" fontFamily="monospace" opacity="0.8">500hPa</text>
              <text x="38" y="107" textAnchor="end" fill="#4fa3e3" fontSize="6.5" fontFamily="monospace" opacity="0.8">850hPa</text>
              <text x="38" y="124" textAnchor="end" fill="#4fa3e3" fontSize="6.5" fontFamily="monospace" opacity="0.8">1013</text>

              {/* Radiosonde altitude tags */}
              <text x="48" y="37" fill="#a5d5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                JET / CIRRUS [250 hPa]
              </text>
              <text x="48" y="73" fill="#a5d5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                ALTOSTRATUS [500 hPa]
              </text>
              <text x="48" y="107" fill="#a5d5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                BOUNDARY STRATUS [850 hPa]
              </text>

              {/* Radiosonde Sounding Ascent Trajectory */}
              <polyline points="70,122 105,104 150,70 195,34 220,14" fill="none" stroke="#a5d5ff" strokeWidth="1" strokeDasharray="3 2" opacity="0.85" />
              <circle cx="105" cy="104" r="2" fill="#a5d5ff" />
              <circle cx="150" cy="70" r="2" fill="#a5d5ff" />
              <circle cx="195" cy="34" r="2" fill="#a5d5ff" />
            </g>
          ) : (
            // Theme 0 (Marie Tharp): Oceanographic / acoustic atmospheric sounding traces
            <g className="atmospheric-column-tharp acoustic-trace-tharp text-[#00e5ff]">
              {/* Radiosonde Temperature Lapse Rate Sounding Curve */}
              <path
                d="M 120 122 Q 100 104 125 88 Q 160 70 140 50 Q 130 34 165 14"
                fill="none"
                stroke="#00e5ff"
                strokeWidth="1.2"
                opacity="0.85"
              />

              {/* Temperature Inversion Boundary Line (LCL) */}
              <line x1="42" y1="88" x2="272" y2="88" stroke="#34d399" strokeWidth="0.8" strokeDasharray="4 2" opacity="0.8" />
              <text x="48" y="86" fill="#34d399" fontSize="6.5" fontFamily="monospace" opacity="0.9">
                ▲ INVERSION CEILING (LCL)
              </text>

              {/* Sonar Acoustic Pulse Echo Circles */}
              <circle cx="125" cy="88" r="5" stroke="#34d399" strokeWidth="0.5" strokeDasharray="1 2" fill="none" opacity="0.6" />
              <circle cx="125" cy="88" r="10" stroke="#34d399" strokeWidth="0.5" strokeDasharray="2 2" fill="none" opacity="0.4" />

              {/* Strata Designations */}
              <text x="48" y="37" fill="#00e5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                CIRRUS SHIELD (10–12 km)
              </text>
              <text x="48" y="73" fill="#00e5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                ALTOCUMULUS STRATA (4–6 km)
              </text>
              <text x="48" y="107" fill="#00e5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                MARINE BOUNDARY LAYER (1–2 km)
              </text>

              {/* Altitude Labels */}
              <text x="38" y="17" textAnchor="end" fill="#00e5ff" fontSize="6.5" fontFamily="monospace" opacity="0.8">15km</text>
              <text x="38" y="37" textAnchor="end" fill="#00e5ff" fontSize="6.5" fontFamily="monospace" opacity="0.8">12km</text>
              <text x="38" y="73" textAnchor="end" fill="#00e5ff" fontSize="6.5" fontFamily="monospace" opacity="0.8">5km</text>
              <text x="38" y="107" textAnchor="end" fill="#00e5ff" fontSize="6.5" fontFamily="monospace" opacity="0.8">1.5km</text>
              <text x="38" y="124" textAnchor="end" fill="#00e5ff" fontSize="6.5" fontFamily="monospace" opacity="0.8">0m</text>
            </g>
          )}

          {/* Draggable Troposphere Standoff Altitude Caliper */}
          <g>
            {/* Caliper Horizontal Indicator Line */}
            <line
              x1="36"
              y1={caliperY}
              x2="272"
              y2={caliperY}
              stroke={tokens.caliperLine}
              strokeWidth="1.5"
              strokeDasharray="4 2"
              className="drop-shadow-sm"
            />
            {/* Left Axis Target Triangle */}
            <polygon
              points={`36,${caliperY} 41,${caliperY - 3} 41,${caliperY + 3}`}
              fill={tokens.caliperLine}
            />
            {/* Right Caliper Standoff Reticle Badge */}
            <rect
              x="196"
              y={caliperY - 7}
              width="74"
              height="14"
              rx="2"
              fill={tokens.caliperBadgeBg}
              stroke={tokens.caliperBadgeBorder}
              strokeWidth="1"
              className="drop-shadow"
            />
            <text
              x="233"
              y={caliperY + 3.5}
              textAnchor="middle"
              fill={tokens.caliperBadgeText}
              fontSize="7.5"
              fontFamily="monospace"
              fontWeight="bold"
            >
              ▲ {atmosphericScale.toFixed(1)}x ▼
            </text>
          </g>
        </svg>
      </div>

      {/* 3. Strata Quick Layer Toggles */}
      <div className="grid grid-cols-3 gap-1 my-1">
        <button
          type="button"
          onClick={() => onToggleStrata('low', !showCloudLow)}
          className={`py-1 px-1.5 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
            showCloudLow
              ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm'
              : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] opacity-60'
          }`}
          title="Low Stratus / Fog (1–2 km altitude)"
        >
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: '#ffa026' }}
              aria-hidden="true"
            />
            <span className="font-bold text-nano">LOW</span>
          </div>
          <span className="text-nano opacity-75">1–2 km</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleStrata('mid', !showCloudMid)}
          className={`py-1 px-1.5 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
            showCloudMid
              ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm'
              : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] opacity-60'
          }`}
          title="Mid Altocumulus (4–6 km altitude)"
        >
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: '#1fd9f5' }}
              aria-hidden="true"
            />
            <span className="font-bold text-nano">MID</span>
          </div>
          <span className="text-nano opacity-75">4–6 km</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleStrata('high', !showCloudHigh)}
          className={`py-1 px-1.5 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
            showCloudHigh
              ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm'
              : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] opacity-60'
          }`}
          title="High Cirrus (10–12 km altitude)"
        >
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: '#f547e0' }}
              aria-hidden="true"
            />
            <span className="font-bold text-nano">HIGH</span>
          </div>
          <span className="text-nano opacity-75">10–12 km</span>
        </button>
      </div>

      {/* Strata Diagnostic False-Color Toggle */}
      <button
        type="button"
        id="sidebar-strata-diagnostic-toggle"
        onClick={() => onToggleFalseColor?.(!cloudFalseColor)}
        className={`w-full py-1 px-2 mb-1 rounded-[2px] border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 text-nano font-mono ${
          cloudFalseColor
            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-bold shadow-sm'
            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
        }`}
        title="Toggle multi-spectral false-color emission for tropospheric cloud strata (Amber/Cyan/Magenta)"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#ffa026' }} />
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#1fd9f5' }} />
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#f547e0' }} />
        </span>
        <span className="tracking-wider uppercase">
          {cloudFalseColor ? 'DIAGNOSTIC STRATA [ACTIVE]' : 'DIAGNOSTIC STRATA [RGB]'}
        </span>
      </button>

      {/* 4. Secondary Calibration Sliders & Steppers (100% Backward-Compatibility with Tests) */}
      <div className="space-y-1.5 pt-1 border-t border-[var(--theme-card-border)]/50">
        {/* Atmospheric Scale Precision Control */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-nano">
            <div className="flex flex-col">
              <label
                htmlFor="sidebar-atmospheric-scale"
                className="text-[var(--theme-text-primary)] font-bold uppercase tracking-wider cursor-pointer"
              >
                Atmospheric Scale
              </label>
              <span className="text-nano text-[var(--theme-text-muted)] opacity-75 font-mono">
                Troposphere Standoff Exaggeration (k_exagg)
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono">
              <span className="tabular-nums text-[var(--theme-text-accent)] font-bold">
                {atmosphericScale.toFixed(1)}x
              </span>
              <button
                type="button"
                title="Decrease Atmospheric Scale"
                onClick={() =>
                  onAtmosphericScaleChange(
                    Math.max(1.0, parseFloat((atmosphericScale - 0.1).toFixed(1)))
                  )
                }
                className="w-4 h-4 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] flex items-center justify-center text-nano font-mono cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                title="Increase Atmospheric Scale"
                onClick={() =>
                  onAtmosphericScaleChange(
                    Math.min(12.0, parseFloat((atmosphericScale + 0.1).toFixed(1)))
                  )
                }
                className="w-4 h-4 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] flex items-center justify-center text-nano font-mono cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
          <input
            id="sidebar-atmospheric-scale"
            type="range"
            min="1"
            max="12"
            step="0.1"
            value={atmosphericScale}
            onChange={(e) => onAtmosphericScaleChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-[var(--theme-control-border)] rounded appearance-none cursor-pointer accent-[var(--theme-text-accent)]"
          />
        </div>

        {/* Cloud Opacity Precision Control */}
        <div className="space-y-0.5 pt-0.5">
          <div className="flex items-center justify-between text-nano">
            <div className="flex flex-col">
              <label
                htmlFor="sidebar-cloud-opacity"
                className="text-[var(--theme-text-primary)] font-bold uppercase tracking-wider cursor-pointer"
              >
                Cloud Opacity
              </label>
              <span className="text-nano text-[var(--theme-text-muted)] opacity-75 font-mono">
                Strata Density
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono">
              <span className="tabular-nums text-[var(--theme-text-accent)] font-bold">
                {Math.round(cloudOpacity * 100)}%
              </span>
              <button
                type="button"
                title="Decrease Cloud Opacity"
                onClick={() =>
                  onCloudOpacityChange?.(
                    Math.max(0.10, parseFloat((cloudOpacity - 0.05).toFixed(2)))
                  )
                }
                className="w-4 h-4 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] flex items-center justify-center text-nano font-mono cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                title="Increase Cloud Opacity"
                onClick={() =>
                  onCloudOpacityChange?.(
                    Math.min(1.0, parseFloat((cloudOpacity + 0.05).toFixed(2)))
                  )
                }
                className="w-4 h-4 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] flex items-center justify-center text-nano font-mono cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
          <input
            id="sidebar-cloud-opacity"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={cloudOpacity}
            onChange={(e) => onCloudOpacityChange?.(parseFloat(e.target.value))}
            className="w-full h-1 bg-[var(--theme-control-border)] rounded appearance-none cursor-pointer accent-[var(--theme-text-accent)]"
          />
        </div>
      </div>

      {/* 5. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border)]/50 opacity-80">
        <span className="truncate">TROPOSPHERIC PROFILE (1.0–12.0x)</span>
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

export default AtmosphericColumnInstrument;
