// ============================================================================
// File: src/components/hud/instruments/CloudDriftSpeedInstrument.tsx
// Atmospheric Drift Chronometer: Kinematic Advection & Temporal Motion Viewport
// Controls: Cloud Drift Multiplier [0x .. 2000x] (Default 500x)
// Medium-Adaptive SVG: Cream (Robinson Anemometer), Cyanotype (Isotachs), Tharp (ADCP Doppler)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useState, useCallback } from 'react';

export interface CloudDriftSpeedInstrumentProps {
  cloudDriftSpeed?: number; // 0 to 2000x, default 500
  theme?: 0 | 1 | 2; // 0: Marie Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  isLight?: boolean;
  onChange?: (speed: number) => void;
  onCloudDriftSpeedChange?: (speed: number) => void;
  className?: string;
}

export const CloudDriftSpeedInstrument: React.FC<CloudDriftSpeedInstrumentProps> = ({
  cloudDriftSpeed: propCloudDriftSpeed,
  theme: propTheme,
  isLight = false,
  onChange,
  onCloudDriftSpeedChange,
  className = '',
}) => {
  const [internalSpeed, setInternalSpeed] = useState<number>(500);
  const cloudDriftSpeed =
    propCloudDriftSpeed !== undefined && Number.isFinite(propCloudDriftSpeed)
      ? propCloudDriftSpeed
      : internalSpeed;
  const activeTheme: 0 | 1 | 2 =
    propTheme !== undefined ? propTheme : isLight ? 1 : 0;

  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handleSpeedChange = useCallback(
    (next: number) => {
      if (typeof next !== 'number' || !Number.isFinite(next)) return;
      const clamped = Math.max(0, Math.min(2000, next));
      setInternalSpeed(clamped);
      onChange?.(clamped);
      onCloudDriftSpeedChange?.(clamped);
    },
    [onChange, onCloudDriftSpeedChange]
  );

  // Linear coordinate mapping across active span: x in [20, 220] inside 240 viewBox
  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const padFrac = 20 / 240;
      const activeSpanFrac = (220 - 20) / 240;

      const t = Math.max(0, Math.min(1, (normX - padFrac) / activeSpanFrac));
      const rawSpeed = t * 2000;
      const steppedSpeed = Math.round(rawSpeed / 10) * 10;
      const clampedSpeed = Math.max(0, Math.min(2000, steppedSpeed));

      handleSpeedChange(clampedSpeed);
    },
    [handleSpeedChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Graceful fallback
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
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      delta = e.shiftKey ? 100 : 10;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      delta = e.shiftKey ? -100 : -10;
    } else if (e.key === 'Home') {
      e.preventDefault();
      handleSpeedChange(0);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      handleSpeedChange(2000);
      return;
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      handleSpeedChange(Math.min(2000, cloudDriftSpeed + 100));
      return;
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      handleSpeedChange(Math.max(0, cloudDriftSpeed - 100));
      return;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSpeedChange(500);
      return;
    }

    if (delta !== 0) {
      e.preventDefault();
      const next = Math.max(0, Math.min(2000, Math.round(cloudDriftSpeed + delta)));
      handleSpeedChange(next);
    }
  };

  const handleReset = () => {
    handleSpeedChange(500);
  };

  // Reticle coordinate calculation
  const normSpeed = Math.max(0, Math.min(2000, cloudDriftSpeed)) / 2000;
  const thumbX = Math.round(20 + normSpeed * 200);
  const badgeX = Math.max(16, Math.min(224, thumbX));

  // Medium tokens for SVG and HUD elements
    return (
    <div
      data-instrument="cloud-drift-speed"
      className={`p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header */}
      <div className="flex items-start justify-between text-micro mb-1.5 font-mono">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              CLOUD DRIFT
            </span>
          </div>
          <span className="text-nano text-[var(--theme-text-muted)] truncate pl-3">
            Kinematic Temporal Motion
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1.5 pt-0.5">
          <span className="text-[var(--theme-text-secondary)]">Velocity:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {Math.round(cloudDriftSpeed)}×
          </span>
        </div>
      </div>

      {/* 2. Interactive SVG Viewport */}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="slider"
        aria-label="Cloud Drift Speed Reticle Caliper"
        aria-valuemin={0}
        aria-valuemax={2000}
        aria-valuenow={cloudDriftSpeed}
        aria-valuetext={`${Math.round(cloudDriftSpeed)}× temporal drift velocity`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleReset}
        onKeyDown={handleKeyDown}
        title="Drag chronometric reticle horizontally to adjust drift speed (0–2000×) • Double-click to reset (500×) • Arrow keys / Shift to step"
        className={`relative w-full h-20 rounded-[2px] overflow-hidden cursor-ew-resize select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none bg-[var(--theme-instrument-viewport-bg)]`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 240 60"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="drift-active-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.3" />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="1" />
            </linearGradient>
            <linearGradient id="streamline-glow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.05" />
              <stop offset="50%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.35" />
              <stop offset="100%" style={{ stopColor: 'var(--theme-instrument-ink)' }} stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* 1. Calm / Stillness Anchor at 0x (Left) */}
          <g opacity="0.6">
            <path
              d="M 10 28 Q 10 24 14 24 Q 16 20 20 20 Q 24 20 26 23 Q 29 23 29 28 Z"
              style={{ fill: 'var(--theme-instrument-ink)', stroke: 'var(--theme-instrument-ink)' }}
              fillOpacity="0.18"
              strokeWidth="0.8"
            />
            <line x1="8" y1="31" x2="31" y2="31" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25" strokeWidth="0.6" opacity="0.4" />
            <line x1="12" y1="33" x2="27" y2="33" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25" strokeWidth="0.5" opacity="0.25" />
          </g>

          {/* 2. Dynamic Aerodynamic Streamline Field (Venturi Effect) */}
          {/* Upper Streamline Ribbon */}
          <path
            d="M 32 18 C 80 12, 160 22, 226 22"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25"
            strokeWidth="0.75"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <path
            d="M 32 18 C 80 12, 160 22, 226 22"
            fill="none"
            stroke="url(#streamline-glow-grad)"
            strokeWidth="0.85"
            strokeDasharray="8 3"
            opacity="0.7"
          />

          {/* Lower Streamline Ribbon */}
          <path
            d="M 32 38 C 80 44, 160 34, 226 34"
            fill="none"
            style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25"
            strokeWidth="0.75"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <path
            d="M 32 38 C 80 44, 160 34, 226 34"
            fill="none"
            stroke="url(#streamline-glow-grad)"
            strokeWidth="0.85"
            strokeDasharray="8 3"
            opacity="0.7"
          />

          {/* High-Velocity Speed Streaks in Gale/Storm Zone */}
          <line x1="130" y1="24" x2="224" y2="24" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25" strokeWidth="0.6" strokeDasharray="12 4" opacity="0.55" />
          <line x1="140" y1="32" x2="224" y2="32" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25" strokeWidth="0.6" strokeDasharray="10 3" opacity="0.55" />

          {/* Graduated Kinetic Wind Chevrons */}
          <g opacity="0.75">
            {/* 250x (x=45): 1 chevron */}
            <path d="M 43 26 L 46 28 L 43 30" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25" strokeWidth="0.8" opacity="0.5" />
            {/* 750x (x=95): 2 chevrons */}
            <path d="M 92 25 L 95 28 L 92 31 M 96 25 L 99 28 L 96 31" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.9" opacity="0.65" />
            {/* 1250x (x=145): 3 chevrons */}
            <path d="M 139 24 L 143 28 L 139 32 M 144 24 L 148 28 L 144 32 M 149 24 L 153 28 L 149 32" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="1.0" opacity="0.8" />
            {/* 1750x (x=195): 4 chevrons */}
            <path d="M 186 23 L 190 28 L 186 33 M 191 23 L 195 28 L 191 33 M 196 23 L 200 28 L 196 33 M 201 23 L 205 28 L 201 33" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="1.2" opacity="0.9" />
          </g>

          {/* 3. Base Advection Track with Graduation Ticks */}
          <line x1="20" y1="28" x2="220" y2="28" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25" strokeWidth="1.8" />
          {[40, 60, 80, 100, 120, 140, 160, 180, 200].map((tx) => (
            <line
              key={tx}
              x1={tx}
              y1="26"
              x2={tx}
              y2="30"
              style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.25"
              strokeWidth="0.75"
              opacity="0.6"
            />
          ))}
          {/* Active Colored Progress Track up to Caliper Thumb */}
          <line
            x1="20"
            y1="28"
            x2={thumbX}
            y2="28"
            stroke="url(#drift-active-line-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* 4. High-Velocity Sheared Storm Cloud at 2000x End */}
          <g opacity="0.75">
            <path
              d="M 212 28 C 214 23 220 22 225 24 C 228 21 232 23 234 28 Z"
              style={{ fill: 'var(--theme-instrument-ink)', stroke: 'var(--theme-instrument-ink)' }}
              fillOpacity="0.25"
              strokeWidth="0.8"
            />
            <line x1="202" y1="26" x2="211" y2="26" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.75" strokeDasharray="3 1" />
            <line x1="205" y1="28" x2="211" y2="28" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.85" />
            <line x1="204" y1="30" x2="211" y2="30" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.75" strokeDasharray="2 1" />
          </g>

          {/* 5. Medium-Adaptive SVG Graphic Vignettes */}
          {activeTheme === 1 ? (
            // Theme 1: Archival Cream Rag (Robinson Cup Anemometer Engraving)
            <g className="drift-chronometer-cream text-[var(--theme-instrument-ink)]">
              <line x1="202" y1="0" x2="210" y2="0" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="1.5" />
              <line x1="206" y1="0" x2="206" y2="17" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.9" />
              <line x1="203" y1="15" x2="209" y2="15" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="1.2" />
              <line x1="196" y1="10" x2="216" y2="10" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.7" />
              <path
                d="M 196 7.5 A 2.5 2.5 0 0 0 196 12.5 Z"
                style={{ fill: 'var(--theme-instrument-ink)', stroke: 'var(--theme-instrument-ink)' }}
                fillOpacity="0.3"
                strokeWidth="0.65"
              />
              <path
                d="M 216 7.5 A 2.5 2.5 0 0 1 216 12.5 Z"
                style={{ fill: 'var(--theme-instrument-ink)', stroke: 'var(--theme-instrument-ink)' }}
                fillOpacity="0.8"
                strokeWidth="0.65"
              />
              <path d="M 197 4 Q 206 1 215 4" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.5" strokeDasharray="1.5 1.5" opacity="0.65" />
            </g>
          ) : activeTheme === 2 ? (
            // Theme 2: Prussian Cyanotype (CAD Velocity Boundary Layer Profile)
            <g className="drift-chronometer-cyanotype text-[var(--theme-instrument-ink)]">
              <path d="M 206 5 Q 212 5 214 10 T 215 25" fill="none" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.8" opacity="0.8" />
              <line x1="206" y1="20" x2="214.5" y2="20" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" />
              <polygon points="214.5,20 212.5,19 212.5,21" style={{ fill: 'var(--theme-instrument-ink)' }} />
              <line x1="206" y1="15" x2="213.5" y2="15" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" />
              <polygon points="213.5,15 211.5,14 211.5,16" style={{ fill: 'var(--theme-instrument-ink)' }} />
              <line x1="206" y1="10" x2="211" y2="10" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" />
              <polygon points="211,10 209,9 209,11" style={{ fill: 'var(--theme-instrument-ink)' }} />
              <line x1="206" y1="5" x2="208" y2="5" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.6" />
              <line x1="206" y1="3" x2="206" y2="27" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.8" strokeDasharray="4 2" opacity="0.75" />
            </g>
          ) : (
            // Theme 0: Marie Tharp (Acoustic Doppler Velocity Wavelets)
            <g className="drift-chronometer-tharp text-[var(--theme-instrument-ink)]">
              <line x1="206" y1="0" x2="206" y2="12" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="1.2" opacity="0.7" />
              <polygon points="203,12 209,12 207,14 205,14" style={{ fill: 'var(--theme-instrument-ink)' }} opacity="0.9" />
              <line x1="205" y1="14" x2="196" y2="25" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
              <line x1="207" y1="14" x2="216" y2="25" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
              <path d="M 199 18 A 6 6 0 0 0 213 18" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.8" opacity="0.8" />
              <path d="M 195 22 A 10 10 0 0 0 217 22" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.6" opacity="0.6" />
              <path d="M 191 26 A 14 14 0 0 0 221 26" fill="none" style={{ stroke: 'var(--theme-instrument-ink-secondary)' }} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4" />
            </g>
          )}

          {/* 6. Milestone Ticks & Labels */}
          {/* 0x (Calm) */}
          <line x1="20" y1="36" x2="20" y2="42" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.35" strokeWidth="1" />
          <text x="20" y="52" textAnchor="start" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.75">
            0×
          </text>
          {/* 500x Default Sweetspot */}
          <line x1="70" y1="36" x2="70" y2="42" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeWidth="1" />
          <text x="70" y="52" textAnchor="middle" style={{ fill: 'var(--theme-instrument-ink)' }} fontSize="5.5" fontFamily="monospace" fontWeight="bold">
            500×
          </text>
          {/* 1000x */}
          <line x1="120" y1="36" x2="120" y2="40" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.35" strokeWidth="0.75" />
          <text x="120" y="52" textAnchor="middle" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.6">
            1000×
          </text>
          {/* 1500x */}
          <line x1="170" y1="36" x2="170" y2="40" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.35" strokeWidth="0.75" />
          <text x="170" y="52" textAnchor="middle" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.6">
            1500×
          </text>
          {/* 2000x Storm Max */}
          <line x1="220" y1="36" x2="220" y2="42" style={{ stroke: 'var(--theme-instrument-ink)' }} strokeOpacity="0.35" strokeWidth="1" />
          <text x="220" y="52" textAnchor="end" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.75">
            2000×
          </text>

          {/* 7. Draggable Chronometric Reticle Caliper */}
          <g>
            {/* Upper Stem (Badge to Diamond) */}
            <line
              x1={thumbX}
              y1="13"
              x2={thumbX}
              y2="22"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="1.2"
            />
            {/* Lower Stem (Diamond to Ticks) */}
            <line
              x1={thumbX}
              y1="34"
              x2={thumbX}
              y2="36"
              style={{ stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="1.2"
            />

            {/* Central Diamond Lens Reticle - Hollow */}
            <polygon
              points={`${thumbX},22 ${thumbX + 5},28 ${thumbX},34 ${thumbX - 5},28`}
              style={{ fill: 'var(--theme-instrument-viewport-bg)', stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="1.2"
            />
            {/* Inner Precision Crosshair */}
            <line x1={thumbX - 2.5} y1="28" x2={thumbX + 2.5} y2="28" style={{ stroke: 'var(--theme-instrument-caliper)' }} strokeWidth="0.8" />
            <line x1={thumbX} y1="25.5" x2={thumbX} y2="30.5" style={{ stroke: 'var(--theme-instrument-caliper)' }} strokeWidth="0.8" />

            {/* Floating Readout Flag Badge */}
            <rect
              x={badgeX - 15}
              y="3"
              width="30"
              height="10"
              rx="1.5"
              style={{ fill: 'var(--theme-instrument-caliper-badge-bg)', stroke: 'var(--theme-instrument-caliper)' }}
              strokeWidth="0.8"
            />
            <text
              x={badgeX}
              y="10.5"
              textAnchor="middle"
              style={{ fill: 'var(--theme-instrument-caliper-badge-text)' }}
              fontSize="6"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {Math.round(cloudDriftSpeed)}×
            </text>
          </g>
        </svg>
      </div>

      {/* Hidden input preserving DOM ID for test compatibility */}
      <input
        type="range"
        id="sidebar-cloud-drift"
        min={0}
        max={2000}
        step={10}
        value={cloudDriftSpeed}
        onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* 4. Footer & Reset Action (Unabbreviated) */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border-50)] opacity-80">
        <span className="truncate">CLOUD DRIFT VELOCITY (0× to 2000×)</span>
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

export default CloudDriftSpeedInstrument;
