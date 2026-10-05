// ============================================================================
// File: src/components/hud/instruments/BathymetricTideGauge.tsx
// Hydrostatic Bathymetric Tide Gauge
// Direct interactive control of Sea Level Offset and Beer-Lambert Water Clarity
// ============================================================================

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { VernierSlider } from '../../ui/VernierSlider';

export interface BathymetricTideGaugeProps {
  seaLevelOffset?: number; // -150m (LGM Ice Age) to +100m (Marine Transgression)
  waterClarity?: number; // 0.10 to 1.00 (Beer-Lambert optical depth penetration)
  onSeaLevelChange?: (offset: number) => void;
  onWaterClarityChange?: (clarity: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
  children?: React.ReactNode;
}

export const BathymetricTideGauge: React.FC<BathymetricTideGaugeProps> = ({
  seaLevelOffset = 0,
  waterClarity = 0.75,
  onSeaLevelChange = () => {},
  onWaterClarityChange = () => {},
  isLight = false,
  theme = isLight ? 1 : 0,
  children,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Local state for buttery smooth UI decoupling
  const [localSeaLevel, setLocalSeaLevel] = useState(seaLevelOffset);
  const [localClarity, setLocalClarity] = useState(waterClarity);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalSeaLevel(seaLevelOffset);
    }
  }, [seaLevelOffset]);

  useEffect(() => {
    setLocalClarity(waterClarity);
  }, [waterClarity]);

  const updateFromPointer = useCallback(
    (clientY: number) => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      const normY = Math.max(0.04, Math.min(0.96, (clientY - rect.top) / rect.height));
      const bottomPct = (1 - normY) * 100;

      // Range: -150m to +100m (250m span)
      // Continuous 1m resolution for buttery-smooth drag
      const rawMeters = -150 + (bottomPct / 100) * 250;
      const clampedMeters = Math.max(-150, Math.min(100, Math.round(rawMeters)));

      setLocalSeaLevel(clampedMeters);
      onSeaLevelChange(clampedMeters);
    },
    [onSeaLevelChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic or unsupported
    }
    updateFromPointer(e.clientY);
  };

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault(); // Prevent scroll while dragging
      updateFromPointer(e.clientY);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      try {
        if (boxRef.current) boxRef.current.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [updateFromPointer]);

  const waterPct = Math.max(0, Math.min(100, ((localSeaLevel + 150) / 250) * 100));


  return (
    <div
      data-instrument="bathymetric-tide-gauge"
      className="p-2.5 rounded-[3px] border shadow-[var(--theme-shadow-ambient)] transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] space-y-2"
    >
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <span className="font-bold uppercase tracking-wider text-micro flex items-center gap-1.5 text-[var(--theme-text-accent)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)]"></span>
          Bathymetric Tide
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className="text-[var(--theme-text-secondary)]">Sea Level:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {localSeaLevel > 0 ? `+${localSeaLevel}m` : `${localSeaLevel}m`}
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Clarity:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {Math.round(localClarity * 100)}%
          </span>
        </div>
      </div>

      {/* Interactive Water Column Depth Gauge */}
      <div
        ref={boxRef}
        tabIndex={0}
        role="slider"
        aria-label="Bathymetric Sea Level Gauge"
        aria-valuemin={-150}
        aria-valuemax={100}
        aria-valuenow={localSeaLevel}
        aria-valuetext={`${localSeaLevel > 0 ? '+' : ''}${localSeaLevel}m`}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 25 : 5;
          let next = localSeaLevel;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            next = Math.min(100, localSeaLevel + step);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            next = Math.max(-150, localSeaLevel - step);
          } else if (e.key === 'PageUp') {
            e.preventDefault();
            next = Math.min(100, localSeaLevel + 20);
          } else if (e.key === 'PageDown') {
            e.preventDefault();
            next = Math.max(-150, localSeaLevel - 20);
          } else if (e.key === 'Home') {
            e.preventDefault();
            next = -150;
          } else if (e.key === 'End') {
            e.preventDefault();
            next = 100;
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            next = 0;
          }
          if (next !== localSeaLevel) {
            setLocalSeaLevel(next);
            onSeaLevelChange(next);
          }
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={() => onSeaLevelChange(0)}
        title="Drag waterline caliper vertically to raise/lower sea level (Double-click or Enter to reset to 0m, Arrow keys to nudge)"
        className={`relative w-full h-28 rounded-[2px] overflow-hidden cursor-ns-resize select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none bg-[var(--theme-instrument-viewport-bg)]`}
      >
        {/* Continental Shelf Profile — land colored, geologically shaped */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
            <defs>
              {/* Land mass: warm earth tones */}
              <linearGradient id="land-fill-tide" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme === 2 ? '#2a4a66' : theme === 0 ? '#3a4a3a' : '#b89a6a'} stopOpacity="0.5" />
                <stop offset="100%" stopColor={theme === 2 ? '#1a3040' : theme === 0 ? '#2a3828' : '#8a7050'} stopOpacity="0.35" />
              </linearGradient>
            </defs>
            {/* Continental shelf cross-section with realistic geomorphology */}
            <polygon
              points="0,100 0,20 15,22 40,28 65,35 90,42 120,55 145,68 160,80 175,88 200,93 240,96 300,98 300,100"
              fill="url(#land-fill-tide)"
            />
            {/* Subtle shelf break line for geological definition */}
            <polyline
              points="0,20 15,22 40,28 65,35 90,42 120,55 145,68 160,80 175,88 200,93 240,96 300,98"
              fill="none"
              stroke={theme === 2 ? '#4a7a9a' : theme === 0 ? '#5a8a6a' : '#8a7050'}
              strokeWidth="0.8"
              opacity="0.3"
            />
          </svg>
        </div>

        {/* Medium-Adaptive Hydrostatic Markings */}
        <div className="absolute top-1 bottom-1 right-14 w-8 pointer-events-none z-10 opacity-55">
          <svg className="w-full h-full" viewBox="0 0 40 100" preserveAspectRatio="xMidYMid meet">
            {theme === 1 ? (
              // Cream Rag Paper: Archival hydrographic tide benchmark staff with 5 calibrated 50m strata
              <g className="tide-staff-cream text-[var(--theme-instrument-ink)]">
                <rect x="16" y="2" width="8" height="96" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
                {/* 5 calibrated 50m intervals: +100m (y=2), +50m (y=21.2), 0m MSL (y=40.4), -50m (y=59.6), -100m (y=78.8), -150m LGM (y=98) */}
                <rect x="16" y="2" width="8" height="19.2" fill="currentColor" opacity="0.22" />
                <line x1="13" y1="21.2" x2="27" y2="21.2" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
                <line x1="12" y1="40.4" x2="28" y2="40.4" stroke="currentColor" strokeWidth="0.75" opacity="0.8" />
                <rect x="16" y="40.4" width="8" height="19.2" fill="currentColor" opacity="0.22" />
                <line x1="13" y1="59.6" x2="27" y2="59.6" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
                <line x1="13" y1="78.8" x2="27" y2="78.8" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
                <rect x="16" y="78.8" width="8" height="19.2" fill="currentColor" opacity="0.22" />
                <line x1="13" y1="98" x2="27" y2="98" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
              </g>
            ) : theme === 2 ? (
              // Prussian Cyanotype: Hydrostatic manometer glass tube with millimeter calibration ticks
              <g className="manometer-cyanotype text-[var(--theme-instrument-ink)]">
                <rect x="16" y="2" width="6" height="96" rx="3" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.8" />
                {Array.from({ length: 20 }).map((_, i) => (
                  <line
                    key={i}
                    x1="22"
                    y1={5 + i * 4.6}
                    x2={i % 5 === 0 ? "30" : "26"}
                    y2={5 + i * 4.6}
                    stroke="currentColor"
                    strokeWidth={i % 5 === 0 ? "0.8" : "0.4"}
                  />
                ))}
              </g>
            ) : (
              // Marie Tharp: CTD oceanographic bathymetric pressure column with dbar calibrations
              <g className="ctd-column-tharp text-[var(--theme-instrument-ink)]">
                <line x1="20" y1="0" x2="20" y2="100" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1 3" />
                {[0, 25, 50, 75, 100].map((y, i) => (
                  <g key={i}>
                    <line x1="14" y1={y} x2="26" y2={y} stroke="currentColor" strokeWidth="0.75" />
                    <circle cx="20" cy={y} r="1.5" fill="currentColor" />
                  </g>
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* Dynamic Water Volume — colored like actual ocean water with backdrop blur for refraction */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none transition-none z-20"
          style={{ 
            height: `${waterPct}%`,
            backdropFilter: `blur(${1 + (1 - localClarity) * 6}px)`,
            WebkitBackdropFilter: `blur(${1 + (1 - localClarity) * 6}px)`
          }}
        >
          <div
            className="w-full h-full"
            style={{
              background: theme === 2
                ? 'linear-gradient(to bottom, #3a8abf 0%, #1a3a5a 60%, #0d1724 100%)'
                : theme === 0
                ? 'linear-gradient(to bottom, #1a8a7a 0%, #0a4a4a 60%, #0c1219 100%)'
                : 'linear-gradient(to bottom, #4a8aaa 0%, #2a5a6a 60%, #f4ede0 100%)',
              opacity: 0.25 + localClarity * 0.55,
            }}
          />
          {/* Surface line — the waterline itself */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background: theme === 2
                ? '#70b7ff'
                : theme === 0
                ? '#00e5ff'
                : '#4a7a8a',
              opacity: 0.5 + localClarity * 0.3,
            }}
          />
        </div>

        {/* Permanent 0m Mean Sea Level Datum Line */}
        <div
          className="absolute left-0 right-0 top-[40%] h-px border-b border-dashed border-[var(--theme-text-secondary-35)] pointer-events-none z-10"
        />

        {/* Sea Level Caliper Reticle Line with Centered Precision Badge */}
        <div
          className={`absolute left-0 right-0 h-0.5 pointer-events-none z-30 bg-[var(--theme-instrument-caliper)] shadow-[0_1px_4px_rgba(0,0,0,0.4)]`}
          style={{ bottom: `${waterPct}%` }}
        >
          <div
            className={`absolute right-1.5 ${
              localSeaLevel >= 85
                ? 'top-1'
                : localSeaLevel <= -135
                ? 'bottom-0'
                : 'top-1/2 -translate-y-1/2'
            } flex items-center pointer-events-auto transition-transform cursor-ns-resize drop-shadow-md hover:scale-105 hover:drop-shadow-lg`}
          >
            {/* Machined Caliper Jaw (Grippy Handle) */}
            <div className="w-2.5 h-6 rounded-l-[2px] border-y border-l bg-[var(--theme-instrument-caliper-badge-bg)] border-[var(--theme-instrument-caliper)] flex flex-col justify-evenly py-1 px-0.5 z-10 shadow-inner">
              <div className="w-full h-px bg-[var(--theme-instrument-caliper)] opacity-50"></div>
              <div className="w-full h-px bg-[var(--theme-instrument-caliper)] opacity-50"></div>
              <div className="w-full h-px bg-[var(--theme-instrument-caliper)] opacity-50"></div>
            </div>
            {/* Digital/Analog Readout Block */}
            <div className="h-5 px-1.5 flex items-center bg-[var(--theme-instrument-caliper-badge-bg)] border border-[var(--theme-instrument-caliper)] rounded-r-[2px] -ml-px font-mono font-bold text-nano text-[var(--theme-instrument-caliper-badge-text)] shadow-inner">
              {localSeaLevel > 0 ? `+${localSeaLevel}m` : `${localSeaLevel}m`}
            </div>
          </div>
        </div>

        {/* Reference Geological Markers — EXPOSED (Above Water) */}
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{ clipPath: `inset(0 0 ${waterPct}% 0)` }}
        >
          <div
            className={`absolute left-2 top-1.5 text-nano font-mono opacity-85 text-[var(--theme-text-secondary)] ${theme === 1 ? 'drop-shadow-none' : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]'}`}
          >
            +100 m (Highstand)
          </div>
          <div
            className={`absolute left-2 top-[calc(40%+4px)] text-nano font-mono font-bold text-[var(--theme-text-accent)] ${theme === 1 ? 'drop-shadow-none' : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]'}`}
          >
            0 m (Mean Sea Level)
          </div>
          <div
            className={`absolute left-2 bottom-1.5 text-nano font-mono opacity-90 text-[var(--theme-text-secondary)] font-medium ${theme === 1 ? 'drop-shadow-none' : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]'}`}
          >
            -150 m (Glacial Maximum)
          </div>
        </div>

        {/* Reference Geological Markers — SUBMERGED (Below Water) */}
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{ clipPath: `inset(${100 - waterPct}% 0 0 0)` }}
        >
          <div
            className={`absolute left-2 top-1.5 text-nano font-mono opacity-95 ${
              theme === 1 ? 'text-[#FCF9F2] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]' : 'text-[var(--theme-text-secondary)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
            }`}
          >
            +100 m (Highstand)
          </div>
          <div
            className={`absolute left-2 top-[calc(40%+4px)] text-nano font-mono font-bold ${
              theme === 1 ? 'text-[#FCF9F2] drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]' : 'text-[var(--theme-text-accent)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]'
            }`}
          >
            0 m (Mean Sea Level)
          </div>
          <div
            className={`absolute left-2 bottom-1.5 text-nano font-mono opacity-90 text-[var(--theme-text-secondary)] font-medium ${
              theme === 1 ? 'drop-shadow-none' : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
            }`}
          >
            -150 m (Glacial Maximum)
          </div>
        </div>
      </div>

      {/* Optical Water Clarity Absorption Slider upgraded to VernierSlider */}
      <div className="mt-1.5 pt-1 border-t border-[var(--theme-card-border-50)]">
        <VernierSlider
          id="tide-gauge-water-clarity"
          label="Beer-Lambert Clarity:"
          value={localClarity}
          defaultValue={0.65}
          min={0.10}
          max={1.00}
          step={0.05}
          readout={`${Math.round(localClarity * 100)}%`}
          onChange={(val) => {
            setLocalClarity(val);
            onWaterClarityChange(val);
          }}
          showSteppers={true}
          className="!border-0 !bg-transparent !p-0.5 !shadow-none"
        />
      </div>

      {children}
    </div>
  );
};
