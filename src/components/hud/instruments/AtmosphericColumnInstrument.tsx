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

  return (
    <div
      data-instrument="atmospheric-column"
      className={`p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header */}
      <div className="flex items-start justify-between text-micro mb-1.5 font-mono">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              ATMOSPHERIC PROFILE
            </span>
          </div>
          <span className="text-nano text-[var(--theme-text-muted)] truncate pl-3">
            Tropospheric Strata Column
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1 pt-0.5">
          <span className="text-[var(--theme-text-secondary)]">Standoff:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {atmosphericScale.toFixed(1)}×
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
        className={`relative w-full h-36 sm:h-40 rounded-[2px] overflow-hidden cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none bg-[var(--theme-instrument-viewport-bg)] border-[var(--theme-instrument-viewport-border)]`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 280 130"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Base Strata Column Bands (Period Compliant - No Muddy Fills) */}
          <rect
            x="42" y="18" width="230" height="26" rx="2"
            style={{ fill: showCloudHigh ? (cloudFalseColor ? 'var(--theme-instrument-strata-high)' : 'currentColor') : 'transparent', stroke: showCloudHigh ? (cloudFalseColor ? 'var(--theme-instrument-strata-high)' : 'var(--theme-instrument-ink)') : 'currentColor' }}
            fillOpacity={showCloudHigh ? (0.04 + cloudOpacity * 0.16) : 0}
            strokeWidth={showCloudHigh ? 0.75 : 0.5} strokeDasharray={showCloudHigh ? 'none' : '4 4'} strokeOpacity={showCloudHigh ? 0.8 : 0.3}
          />
          <rect
            x="42" y="54" width="230" height="26" rx="2"
            style={{ fill: showCloudMid ? (cloudFalseColor ? 'var(--theme-instrument-strata-mid)' : 'currentColor') : 'transparent', stroke: showCloudMid ? (cloudFalseColor ? 'var(--theme-instrument-strata-mid)' : 'var(--theme-instrument-ink)') : 'currentColor' }}
            fillOpacity={showCloudMid ? (0.04 + cloudOpacity * 0.16) : 0}
            strokeWidth={showCloudMid ? 0.75 : 0.5} strokeDasharray={showCloudMid ? 'none' : '4 4'} strokeOpacity={showCloudMid ? 0.8 : 0.3}
          />
          <rect
            x="42" y="90" width="230" height="26" rx="2"
            style={{ fill: showCloudLow ? (cloudFalseColor ? 'var(--theme-instrument-strata-low)' : 'currentColor') : 'transparent', stroke: showCloudLow ? (cloudFalseColor ? 'var(--theme-instrument-strata-low)' : 'var(--theme-instrument-ink)') : 'currentColor' }}
            fillOpacity={showCloudLow ? (0.04 + cloudOpacity * 0.16) : 0}
            strokeWidth={showCloudLow ? 0.75 : 0.5} strokeDasharray={showCloudLow ? 'none' : '4 4'} strokeOpacity={showCloudLow ? 0.8 : 0.3}
          />

          {/* Theme-specific Background/Inner Graphics (Drawn under Caliper) */}
          {theme === 1 ? (
            <g className="atmospheric-column-cream strata-engraving-cream text-[var(--theme-instrument-ink)]">
              {/* Left Altitude Scale Axis */}
              <line x1="40" y1="14" x2="40" y2="122" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="14" x2="40" y2="14" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="34" x2="40" y2="34" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="70" x2="40" y2="70" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="104" x2="40" y2="104" stroke="currentColor" strokeWidth="0.75" />
              <line x1="34" y1="122" x2="40" y2="122" stroke="currentColor" strokeWidth="0.75" />
              <g style={{ paintOrder: 'stroke', stroke: 'var(--theme-instrument-viewport-bg)', strokeWidth: '4px', strokeLinejoin: 'round' }}>
                <text x="31" y="17" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">15 km</text>
                <text x="31" y="34" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">11 km</text>
                <text x="31" y="70" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">5 km</text>
                <text x="31" y="106" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">1.5 km</text>
                <text x="31" y="124" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">0 m</text>
              </g>

              {/* Earth crust baseline and hachures */}
              <line x1="40" y1="122" x2="272" y2="122" stroke="currentColor" strokeWidth="1" />
              {Array.from({ length: 24 }).map((_, i) => (
                <line key={i} x1={40 + i * 10} y1="122" x2={35 + i * 10} y2="128" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
              ))}

              {/* High Layer Hachures */}
              <g style={{ opacity: showCloudHigh ? 1.0 : 0.0, transition: 'opacity 0.2s' }}>
                <path d="M 130 28 Q 160 24 195 30 T 255 28" fill="none" style={{ stroke: cloudFalseColor ? "var(--theme-instrument-strata-high)" : "currentColor" }} strokeWidth="0.6" strokeDasharray="2 1" opacity="0.7" />
                <path d="M 155 32 Q 185 27 220 33 T 260 30" fill="none" style={{ stroke: cloudFalseColor ? "var(--theme-instrument-strata-high)" : "currentColor" }} strokeWidth="0.4" strokeDasharray="3 2" opacity="0.45" />
              </g>
              {/* Mid Layer Hachures */}
              <g style={{ opacity: showCloudMid ? 1.0 : 0.0, transition: 'opacity 0.2s' }}>
                <path d="M 135 65 Q 150 61 165 65 Q 180 69 195 65 Q 210 61 225 65" fill="none" style={{ stroke: cloudFalseColor ? "var(--theme-instrument-strata-mid)" : "currentColor" }} strokeWidth="0.6" opacity="0.7" />
                <path d="M 140 69 Q 155 65 170 69 Q 185 73 200 69 Q 215 65 230 69" fill="none" style={{ stroke: cloudFalseColor ? "var(--theme-instrument-strata-mid)" : "currentColor" }} strokeWidth="0.4" opacity="0.45" />
              </g>
              {/* Low Layer Hachures */}
              <g style={{ opacity: showCloudLow ? 1.0 : 0.0, transition: 'opacity 0.2s' }}>
                <path d="M 48 100 L 260 100" fill="none" style={{ stroke: cloudFalseColor ? "var(--theme-instrument-strata-low)" : "currentColor" }} strokeWidth="0.6" opacity="0.6" />
                <path d="M 48 104 L 255 104" fill="none" style={{ stroke: cloudFalseColor ? "var(--theme-instrument-strata-low)" : "currentColor" }} strokeWidth="0.6" opacity="0.6" />
              </g>
            </g>
          ) : theme === 2 ? (
            <g className="atmospheric-column-cyanotype isobar-grid-cyanotype text-[var(--theme-instrument-ink)]">
              {/* Isobaric level lines */}
              <line x1="40" y1="14" x2="272" y2="14" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="34" x2="272" y2="34" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="70" x2="272" y2="70" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="104" x2="272" y2="104" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
              <line x1="40" y1="122" x2="272" y2="122" stroke="currentColor" strokeWidth="0.75" />
              {/* CAD millimeter division ticks */}
              {Array.from({ length: 12 }).map((_, i) => (
                <line key={i} x1={50 + i * 18} y1="14" x2={50 + i * 18} y2="122" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.2" />
              ))}
              <g style={{ paintOrder: 'stroke', stroke: 'var(--theme-instrument-viewport-bg)', strokeWidth: '4px', strokeLinejoin: 'round' }}>
                <text x="38" y="17" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">150hPa</text>
                <text x="38" y="34" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">250hPa</text>
                <text x="38" y="70" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">500hPa</text>
                <text x="38" y="106" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">850hPa</text>
                <text x="38" y="124" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">1013</text>
              </g>
              <g style={{ opacity: showCloudHigh ? 1.0 : 0.0, transition: 'opacity 0.2s' }}>
                <circle cx="195" cy="31" r="2" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />
              </g>
              <g style={{ opacity: showCloudMid ? 1.0 : 0.0, transition: 'opacity 0.2s' }}>
                <circle cx="150" cy="67" r="2" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />
              </g>
              <g style={{ opacity: showCloudLow ? 1.0 : 0.0, transition: 'opacity 0.2s' }}>
                <circle cx="105" cy="103" r="2" style={{ fill: 'var(--theme-instrument-ink-secondary)' }} />
              </g>
              <polyline points="70,122 105,103 150,67 195,31 220,14" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="1" strokeDasharray="3 2" opacity="0.85" />
            </g>
          ) : (
            <g className="atmospheric-column-tharp acoustic-trace-tharp text-[var(--theme-instrument-ink)]">
              {/* Left Altitude Scale Axis — Acoustic Sounding Grid */}
              <line x1="40" y1="14" x2="40" y2="122" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
              <line x1="34" y1="14" x2="40" y2="14" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
              <line x1="34" y1="34" x2="40" y2="34" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
              <line x1="34" y1="70" x2="40" y2="70" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
              <line x1="34" y1="104" x2="40" y2="104" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
              <line x1="34" y1="122" x2="40" y2="122" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
              {/* Horizontal Echo-Sonar Grid Lines */}
              <line x1="40" y1="14" x2="272" y2="14" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 4" opacity="0.25" />
              <line x1="40" y1="34" x2="272" y2="34" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 4" opacity="0.25" />
              <line x1="40" y1="70" x2="272" y2="70" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 4" opacity="0.25" />
              <line x1="40" y1="104" x2="272" y2="104" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 4" opacity="0.25" />
              {/* Altitude Labels with viewport-bg knockout stroke */}
              <g style={{ paintOrder: 'stroke', stroke: 'var(--theme-instrument-viewport-bg)', strokeWidth: '4px', strokeLinejoin: 'round' }}>
                <text x="31" y="17" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">15 km</text>
                <text x="31" y="37" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">11 km</text>
                <text x="31" y="73" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">5 km</text>
                <text x="31" y="107" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">1.5 km</text>
                <text x="31" y="124" textAnchor="end" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="monospace" opacity="0.8">0 m</text>
              </g>
              {/* Radiosonde Temperature Curve */}
              <path d="M 120 122 Q 100 104 125 88 Q 160 70 140 50 Q 130 34 165 14" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.85" />
              {/* Temperature Inversion Boundary Line (LCL) */}
              <line x1="42" y1="88" x2="272" y2="88" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.8" strokeDasharray="4 2" opacity="0.8" />
              <text x="48" y="86" style={{ fill: 'var(--theme-instrument-ink-secondary)', paintOrder: 'stroke', stroke: 'var(--theme-instrument-viewport-bg)', strokeWidth: '4px', strokeLinejoin: 'round' }} fontSize="6.5" fontFamily="monospace" opacity="0.9">▲ LCL CEILING</text>
              {/* Sonar Acoustic Pulse Echo Circles */}
              <circle cx="125" cy="88" r="5" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.5" strokeDasharray="1 2" fill="none" opacity="0.6" />
              <circle cx="125" cy="88" r="10" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.5" strokeDasharray="2 2" fill="none" opacity="0.4" />
            </g>
          )}

          {/* Draggable Troposphere Standoff Altitude Caliper (Drawn Before Text Labels) */}
          <g>
            {/* Caliper Horizontal Indicator Line */}
            <line
              x1="45" y1={caliperY} x2="196" y2={caliperY}
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="1.5" strokeDasharray="4 2" className="drop-shadow-sm"
            />
            {/* Left Axis Target Triangle */}
            <polygon
              points={`40,${caliperY} 45,${caliperY - 3} 45,${caliperY + 3}`}
              style={{ fill: 'var(--theme-instrument-caliper)' }}
            />
            {/* Right Caliper Standoff Reticle Badge */}
            <rect
              x="196" y={caliperY - 7} width="76" height="14" rx="2"
              style={{ fill: 'var(--theme-instrument-caliper-badge-bg)', stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="1" className="drop-shadow"
            />
            <text
              x="234" y={caliperY + 3.5} textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="9" fontFamily="monospace" fontWeight="bold"
            >
              {theme === 1 ? '△' : '▲'} {atmosphericScale.toFixed(1)}× {theme === 1 ? '▽' : '▼'}
            </text>
          </g>

          {/* Theme-Specific Text Labels (Drawn ON TOP of Caliper to create cutout) */}
          {theme === 1 ? (
            <g style={{ paintOrder: 'stroke', stroke: 'var(--theme-instrument-viewport-bg)', strokeWidth: '4px', strokeLinejoin: 'round' }}>
              <text x="48" y="34" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-high)" : "currentColor" }} fontSize="10" fontFamily="serif" fontStyle="italic" fontWeight="bold">Cirrus (10–12 km)</text>
              <text x="48" y="70" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-mid)" : "currentColor" }} fontSize="10" fontFamily="serif" fontStyle="italic" fontWeight="bold">Alto-cumulus (4–6 km)</text>
              <text x="48" y="106" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-low)" : "currentColor" }} fontSize="10" fontFamily="serif" fontStyle="italic" fontWeight="bold">Stratus (1–2 km)</text>
            </g>
          ) : theme === 2 ? (
            <g style={{ paintOrder: 'stroke', stroke: 'var(--theme-instrument-viewport-bg)', strokeWidth: '4px', strokeLinejoin: 'round' }}>
              <text x="48" y="34" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-high)" : "var(--theme-instrument-ink-secondary)" }} fontSize="9" fontFamily="monospace" fontWeight="bold">JET / CIRRUS [250 hPa]</text>
              <text x="48" y="70" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-mid)" : "var(--theme-instrument-ink-secondary)" }} fontSize="9" fontFamily="monospace" fontWeight="bold">ALTOSTRATUS [500 hPa]</text>
              <text x="48" y="106" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-low)" : "var(--theme-instrument-ink-secondary)" }} fontSize="9" fontFamily="monospace" fontWeight="bold">STRATUS [850 hPa]</text>
            </g>
          ) : (
            <g style={{ paintOrder: 'stroke', stroke: 'var(--theme-instrument-viewport-bg)', strokeWidth: '4px', strokeLinejoin: 'round' }}>
              <text x="48" y="34" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-high)" : "currentColor" }} fontSize="9" fontFamily="monospace" fontWeight="bold">CIRRUS (10–12 km)</text>
              <text x="48" y="70" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-mid)" : "currentColor" }} fontSize="9" fontFamily="monospace" fontWeight="bold">ALTOCUMULUS (4–6 km)</text>
              <text x="48" y="106" style={{ fill: cloudFalseColor ? "var(--theme-instrument-strata-low)" : "currentColor" }} fontSize="9" fontFamily="monospace" fontWeight="bold">MARINE LAYER (1–2 km)</text>
            </g>
          )}
        </svg>
      </div>

      {/* Strata Diagnostic False-Color Toggle */}
      <button
        type="button"
        id="sidebar-strata-diagnostic-toggle"
        onClick={() => onToggleFalseColor?.(!cloudFalseColor)}
        className={`tactile-press w-full py-1 px-2 my-1.5 rounded-[2px] border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 text-nano font-mono ${
          cloudFalseColor ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-bold shadow-sm' : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
        }`}
        title="Toggle multi-spectral false-color emission for tropospheric cloud strata (Amber/Cyan/Magenta)"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-instrument-strata-low)' }} />
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-instrument-strata-mid)' }} />
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-instrument-strata-high)' }} />
        </span>
        <span className="tracking-wider uppercase">
          {cloudFalseColor ? 'DIAGNOSTIC STRATA [ACTIVE]' : 'DIAGNOSTIC STRATA [RGB]'}
        </span>
      </button>

      {/* 4. Secondary Calibration Sliders & Steppers (100% Backward-Compatibility with Tests) */}
      <div className="space-y-1.5 pt-1.5 border-t border-[var(--theme-card-border-50)]">
        {/* Horizon Standoff Precision Control */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-nano">
            <label
              htmlFor="sidebar-atmospheric-scale"
              onDoubleClick={handleReset}
              title="Vertical cloud strata standoff exaggeration (1.0× to 12.0×) — Double-click to reset (3.5×)"
              className="text-[var(--theme-text-primary)] font-bold uppercase tracking-wider cursor-pointer"
            >
              Atmospheric Scale
            </label>
            <div className="flex items-center gap-1 font-mono">
              <span
                onDoubleClick={handleReset}
                title="Double-click to reset (3.5×)"
                className="tabular-nums text-[var(--theme-text-accent)] font-bold cursor-pointer hover:underline"
              >
                {atmosphericScale.toFixed(1)}×
              </span>
              <button
                type="button"
                title="Decrease Horizon Standoff"
                onClick={() =>
                  onAtmosphericScaleChange(
                    Math.max(1.0, parseFloat((atmosphericScale - 0.1).toFixed(1)))
                  )
                }
                className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                title="Increase Horizon Standoff"
                onClick={() =>
                  onAtmosphericScaleChange(
                    Math.min(12.0, parseFloat((atmosphericScale + 0.1).toFixed(1)))
                  )
                }
                className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors cursor-pointer"
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
            aria-label="Horizon Standoff"
            onDoubleClick={handleReset}
            onChange={(e) => onAtmosphericScaleChange(parseFloat(e.target.value))}
            className="w-full slider-archival cursor-pointer h-1 rounded-[1px] block"
          />
        </div>

        {/* Cloud Opacity Precision Control */}
        <div className="space-y-0.5 pt-0.5">
          <div className="flex items-center justify-between text-nano">
            <label
              htmlFor="sidebar-cloud-opacity"
              onDoubleClick={handleReset}
              title="Cloud layer opacity (10% to 100%) — Double-click to reset (80%)"
              className="text-[var(--theme-text-primary)] font-bold uppercase tracking-wider cursor-pointer"
            >
              Cloud Opacity
            </label>
            <div className="flex items-center gap-1 font-mono">
              <span
                onDoubleClick={handleReset}
                title="Double-click to reset (80%)"
                className="tabular-nums text-[var(--theme-text-accent)] font-bold cursor-pointer hover:underline"
              >
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
                className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors cursor-pointer"
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
                className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors cursor-pointer"
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
            aria-label="Cloud Opacity"
            onDoubleClick={handleReset}
            onChange={(e) => onCloudOpacityChange?.(parseFloat(e.target.value))}
            className="w-full slider-archival cursor-pointer h-1 rounded-[1px] block"
          />
        </div>
      </div>

      {/* 5. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border-50)] opacity-80">
        <span className="truncate">TROPOSPHERIC PROFILE (1.0–12.0×)</span>
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

export default AtmosphericColumnInstrument;
