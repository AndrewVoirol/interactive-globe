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
  const badgeX = Math.max(22, Math.min(218, thumbX));

  // Medium tokens for SVG and HUD elements
  const tokens =
    activeTheme === 2
      ? {
          viewportBg: 'bg-[#0d1724]',
          viewportBorder: 'border-[#3b597a]/60',
          reticleFill: '#0e1824',
          reticleStroke: '#a5d5ff',
          accentColor: '#4fa3e3',
          trackColor: 'rgba(79, 163, 227, 0.25)',
          activeTrackColor: '#4fa3e3',
        }
      : activeTheme === 1
      ? {
          viewportBg: 'bg-[#fdfcf9]',
          viewportBorder: 'border-[#b8ad98]/60',
          reticleFill: '#fdfcf9',
          reticleStroke: '#8c4820',
          accentColor: '#8c4820',
          trackColor: 'rgba(140, 72, 32, 0.20)',
          activeTrackColor: '#8c4820',
        }
      : {
          viewportBg: 'bg-[#0c1219]',
          viewportBorder: 'border-[#3a4d61]/60',
          reticleFill: '#0a111a',
          reticleStroke: '#00e5ff',
          accentColor: '#00e5ff',
          trackColor: 'rgba(0, 229, 255, 0.20)',
          activeTrackColor: '#00e5ff',
        };

  return (
    <div
      data-instrument="cloud-drift-speed"
      className={`p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
    >
      {/* 1. Status Header */}
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              CLOUD DRIFT
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate" title="Kinematic Temporal Motion">
              Cloud Advection Velocity
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1">
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
        className={`relative w-full h-20 rounded-[2px] border overflow-hidden cursor-ew-resize select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${tokens.viewportBg} ${tokens.viewportBorder}`}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 240 60"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="drift-active-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={tokens.activeTrackColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={tokens.activeTrackColor} stopOpacity="1" />
            </linearGradient>
            <linearGradient id="streamline-glow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={tokens.accentColor} stopOpacity="0.05" />
              <stop offset="50%" stopColor={tokens.accentColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={tokens.accentColor} stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* 1. Calm / Stillness Anchor at 0x (Left) */}
          <g opacity="0.6">
            {/* Soft, resting cumulus cloud glyph */}
            <path
              d="M 10 28 Q 10 24 14 24 Q 16 20 20 20 Q 24 20 26 23 Q 29 23 29 28 Z"
              fill={tokens.accentColor}
              fillOpacity="0.18"
              stroke={tokens.accentColor}
              strokeWidth="0.8"
            />
            {/* Faint calm water/air reflection lines */}
            <line x1="8" y1="31" x2="31" y2="31" stroke={tokens.trackColor} strokeWidth="0.6" opacity="0.4" />
            <line x1="12" y1="33" x2="27" y2="33" stroke={tokens.trackColor} strokeWidth="0.5" opacity="0.25" />
          </g>

          {/* 2. Dynamic Aerodynamic Streamline Field (Accelerating from left to right) */}
          {/* Upper Streamline Ribbon */}
          <path
            d="M 32 18 Q 70 14 110 18 T 175 16 T 226 15"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.75"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <path
            d="M 115 14 C 145 13, 185 13, 226 12"
            fill="none"
            stroke="url(#streamline-glow-grad)"
            strokeWidth="0.85"
            strokeDasharray="8 3"
            opacity="0.7"
          />

          {/* Lower Streamline Ribbon */}
          <path
            d="M 32 38 Q 70 42 110 38 T 175 40 T 226 41"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.75"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <path
            d="M 115 42 C 145 43, 185 43, 226 44"
            fill="none"
            stroke="url(#streamline-glow-grad)"
            strokeWidth="0.85"
            strokeDasharray="8 3"
            opacity="0.7"
          />

          {/* High-Velocity Speed Streaks in Gale/Storm Zone (120 to 226) */}
          <line x1="130" y1="21" x2="224" y2="21" stroke={tokens.trackColor} strokeWidth="0.6" strokeDasharray="12 4" opacity="0.55" />
          <line x1="140" y1="35" x2="224" y2="35" stroke={tokens.trackColor} strokeWidth="0.6" strokeDasharray="10 3" opacity="0.55" />

          {/* Graduated Kinetic Wind Chevrons (> to >> to >>> indicating acceleration) */}
          <g opacity="0.75">
            {/* Gentle 250x chevron */}
            <path d="M 44 26 L 47 28 L 44 30" fill="none" stroke={tokens.trackColor} strokeWidth="0.8" opacity="0.5" />
            {/* Moderate 750x double chevrons */}
            <path d="M 94 25.5 L 97 28 L 94 30.5 M 99 25.5 L 102 28 L 99 30.5" fill="none" stroke={tokens.accentColor} strokeWidth="0.9" opacity="0.65" />
            {/* Brisk 1250x chevrons */}
            <path d="M 142 25 L 146 28 L 142 31 M 147 25 L 151 28 L 147 31" fill="none" stroke={tokens.accentColor} strokeWidth="1.1" opacity="0.8" />
            {/* Gale/Storm 1750x triple chevrons */}
            <path d="M 188 24.5 L 192 28 L 188 31.5 M 193 24.5 L 197 28 L 193 31.5 M 198 24.5 L 202 28 L 198 31.5" fill="none" stroke={tokens.accentColor} strokeWidth="1.2" opacity="0.9" />
          </g>

          {/* 3. Base Advection Track with Graduation Ticks */}
          <line x1="20" y1="28" x2="220" y2="28" stroke={tokens.trackColor} strokeWidth="1.8" />
          {[40, 60, 80, 100, 120, 140, 160, 180, 200].map((tx) => (
            <line
              key={tx}
              x1={tx}
              y1="26"
              x2={tx}
              y2="30"
              stroke={tokens.trackColor}
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
          />

          {/* 4. High-Velocity Sheared Storm Cloud at 2000x End */}
          <g opacity="0.75">
            {/* Aerodynamically swept cirrus / storm cloud head */}
            <path
              d="M 212 28 C 214 23 220 22 225 24 C 228 21 232 23 234 28 Z"
              fill={tokens.accentColor}
              fillOpacity="0.25"
              stroke={tokens.accentColor}
              strokeWidth="0.8"
            />
            {/* Horizontal wind shear tail filaments */}
            <line x1="202" y1="26" x2="211" y2="26" stroke={tokens.accentColor} strokeWidth="0.75" strokeDasharray="3 1" />
            <line x1="205" y1="28" x2="211" y2="28" stroke={tokens.accentColor} strokeWidth="0.85" />
            <line x1="204" y1="30" x2="211" y2="30" stroke={tokens.accentColor} strokeWidth="0.75" strokeDasharray="2 1" />
          </g>

          {/* 5. Medium-Adaptive SVG Graphic Vignettes */}
          {activeTheme === 1 ? (
            // Theme 1: Archival Cream Rag (Robinson Cup Anemometer Engraving)
            <g className="drift-chronometer-cream text-[#8c4820]">
              {/* Central Anemometer Spindle */}
              <line x1="206" y1="7" x2="206" y2="23" stroke="#8c4820" strokeWidth="0.9" />
              <polygon points="204,23 208,23 206,25" fill="#8c4820" />
              {/* Horizontal Crossarms */}
              <line x1="198" y1="12" x2="214" y2="12" stroke="#8c4820" strokeWidth="0.7" />
              {/* Hemispherical Anemometer Cups */}
              <path
                d="M 198 9.5 A 2.5 2.5 0 0 0 198 14.5 Z"
                fill="#8c4820"
                fillOpacity="0.5"
                stroke="#8c4820"
                strokeWidth="0.65"
              />
              <path
                d="M 214 9.5 A 2.5 2.5 0 0 1 214 14.5 Z"
                fill="#8c4820"
                fillOpacity="0.7"
                stroke="#8c4820"
                strokeWidth="0.65"
              />
              {/* Rotational Intaglio Arc */}
              <path d="M 199 7 Q 206 5 213 7" fill="none" stroke="#8c4820" strokeWidth="0.5" strokeDasharray="1.5 1.5" opacity="0.65" />
            </g>
          ) : activeTheme === 2 ? (
            // Theme 2: Prussian Cyanotype (CAD Velocity Isotachs)
            <g className="drift-chronometer-cyanotype text-[#4fa3e3]">
              {/* Technical Isotach Curvature Lines */}
              <path
                d="M 20 16 C 70 12, 130 18, 220 13"
                fill="none"
                stroke="#4fa3e3"
                strokeWidth="0.8"
                strokeDasharray="4 2"
                opacity="0.8"
              />
              <path
                d="M 20 40 C 70 44, 130 36, 220 43"
                fill="none"
                stroke="#4fa3e3"
                strokeWidth="0.8"
                strokeDasharray="4 2"
                opacity="0.8"
              />
              {/* CAD Division Graduation Crosshairs */}
              <line x1="70" y1="13" x2="70" y2="17" stroke="#4fa3e3" strokeWidth="0.6" opacity="0.75" />
              <line x1="140" y1="14" x2="140" y2="18" stroke="#4fa3e3" strokeWidth="0.6" opacity="0.75" />
              <line x1="190" y1="12" x2="190" y2="16" stroke="#4fa3e3" strokeWidth="0.6" opacity="0.75" />
            </g>
          ) : (
            // Theme 0: Marie Tharp (Acoustic Doppler Velocity Wavelets)
            <g className="drift-chronometer-tharp text-[#00e5ff]">
              {/* Transducer Origin Emitter */}
              <circle cx="206" cy="12" r="1.8" fill="#00e5ff" />
              <line x1="206" y1="12" x2="198" y2="23" stroke="#00e5ff" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.8" />
              <line x1="206" y1="12" x2="214" y2="23" stroke="#00e5ff" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.8" />
              {/* Concentric Doppler Acoustic Wavelets */}
              <path d="M 200 17 A 6 6 0 0 0 212 17" fill="none" stroke="#34d399" strokeWidth="0.65" opacity="0.8" />
              <path d="M 197 20 A 9 9 0 0 0 215 20" fill="none" stroke="#34d399" strokeWidth="0.55" opacity="0.6" />
              <path d="M 194 23 A 12 12 0 0 0 218 23" fill="none" stroke="#34d399" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.45" />
            </g>
          )}

          {/* 6. Milestone Ticks & Labels (Strictly 3 Ticks: 0x, 500x, 2000x) */}
          {/* 0x (Calm) */}
          <line x1="20" y1="36" x2="20" y2="42" stroke={tokens.trackColor} strokeWidth="1" />
          <text x="20" y="52" textAnchor="start" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.75">
            0×
          </text>

          {/* 500x Default Sweetspot */}
          <line x1="70" y1="36" x2="70" y2="42" stroke={tokens.accentColor} strokeWidth="1.2" />
          <polygon points="70,41 72,43 70,45 68,43" fill={tokens.accentColor} />
          <text x="70" y="52" textAnchor="middle" fill={tokens.accentColor} fontSize="5.5" fontFamily="monospace" fontWeight="bold">
            500×
          </text>

          {/* 2000x Storm Max */}
          <line x1="220" y1="36" x2="220" y2="42" stroke={tokens.trackColor} strokeWidth="1" />
          <text x="220" y="52" textAnchor="end" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.75">
            2000×
          </text>

          {/* 7. Draggable Chronometric Reticle Caliper */}
          <g>
            {/* Vertical Hairline Crosshair */}
            <line
              x1={thumbX}
              y1="7"
              x2={thumbX}
              y2="49"
              stroke={tokens.reticleStroke}
              strokeWidth="1.2"
            />

            {/* Central Diamond Lens Reticle */}
            <polygon
              points={`${thumbX},22 ${thumbX + 5},28 ${thumbX},34 ${thumbX - 5},28`}
              fill={tokens.reticleFill}
              stroke={tokens.reticleStroke}
              strokeWidth="1.5"
            />
            <circle cx={thumbX} cy="28" r="1.5" fill={tokens.reticleStroke} />

            {/* Floating Readout Flag Badge */}
            <rect
              x={badgeX - 15}
              y="3"
              width="30"
              height="10"
              rx="1.5"
              fill={tokens.reticleFill}
              stroke={tokens.reticleStroke}
              strokeWidth="0.8"
            />
            <text
              x={badgeX}
              y="10.5"
              textAnchor="middle"
              fill={tokens.reticleStroke}
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
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border)]/50 opacity-80">
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
