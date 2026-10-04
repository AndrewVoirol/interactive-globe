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
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Kinematic Temporal Motion
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
              <stop offset="0%" stopColor={tokens.activeTrackColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={tokens.activeTrackColor} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Calm Stillness Anchor at 0x (Left) */}
          <g opacity="0.45">
            <path
              d="M 14 26 a 3 3 0 0 1 5 -1.5 a 4 4 0 0 1 6 0.5 a 3 3 0 0 1 3 2.5 l -14 0 z"
              fill={tokens.accentColor}
              fillOpacity="0.2"
              stroke={tokens.accentColor}
              strokeWidth="0.7"
            />
          </g>

          {/* Base Velocity Streamline Track with Chronometric Ticks */}
          <line x1="20" y1="28" x2="220" y2="28" stroke={tokens.trackColor} strokeWidth="2" />
          {[40, 60, 80, 100, 120, 140, 160, 180, 200].map((tx) => (
            <line
              key={tx}
              x1={tx}
              y1="26.5"
              x2={tx}
              y2="29.5"
              stroke={tokens.trackColor}
              strokeWidth="0.75"
              opacity="0.6"
            />
          ))}
          <line
            x1="20"
            y1="28"
            x2={thumbX}
            y2="28"
            stroke="url(#drift-active-line-grad)"
            strokeWidth="2.5"
          />

          {/* Aerodynamic Streamline Ribbons (Accelerating from left to right) */}
          <path
            d="M 28 19 Q 70 14 115 19 T 226 16"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.75"
            strokeDasharray="4 2"
            opacity="0.65"
          />
          <path
            d="M 125 13 L 226 12"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.65"
            strokeDasharray="6 3"
            opacity="0.45"
          />
          <path
            d="M 28 37 Q 70 42 115 37 T 226 40"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.75"
            strokeDasharray="4 2"
            opacity="0.65"
          />
          <path
            d="M 125 43 L 226 44"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.65"
            strokeDasharray="6 3"
            opacity="0.45"
          />

          {/* High-Velocity Sheared Cloud Silhouette at Storm End (2000x) */}
          <g opacity="0.6">
            <path
              d="M 210 24 c 2 -2 5 -2.5 8 -1 c 3 1.5 5 1.5 8 1.5 l -16 0 z"
              fill={tokens.accentColor}
              fillOpacity="0.25"
              stroke={tokens.accentColor}
              strokeWidth="0.7"
            />
            <line x1="198" y1="23.5" x2="207" y2="23.5" stroke={tokens.accentColor} strokeWidth="0.6" strokeDasharray="2 1" />
            <line x1="202" y1="25" x2="208" y2="25" stroke={tokens.accentColor} strokeWidth="0.6" strokeDasharray="2 1" />
          </g>

          {/* Graduated Velocity Advection Chevrons (calm -> moderate -> gale) */}
          <path d="M 46 26.5 L 49 28 L 46 29.5" fill="none" stroke={tokens.trackColor} strokeWidth="0.8" opacity="0.6" />
          <path d="M 88 26 L 91 28 L 88 30 M 93 26 L 96 28 L 93 30" fill="none" stroke={tokens.trackColor} strokeWidth="0.9" opacity="0.7" />
          <path d="M 134 25.5 L 138 28 L 134 30.5 M 140 25.5 L 144 28 L 140 30.5" fill="none" stroke={tokens.trackColor} strokeWidth="1.1" opacity="0.85" />
          <path d="M 174 25 L 178 28 L 174 31 M 179 25 L 183 28 L 179 31 M 184 25 L 188 28 L 184 31" fill="none" stroke={tokens.trackColor} strokeWidth="1.2" opacity="0.9" />

          {/* 3. Medium-Adaptive SVG Artifacts */}
          {activeTheme === 1 ? (
            // Theme 1: Archival Cream Rag (Robinson Cup Anemometer Engraving)
            <g className="drift-chronometer-cream text-[#8c4820]">
              {/* Robinson 3-Cup Anemometer Engraving */}
              <line x1="195" y1="10" x2="195" y2="34" stroke="#8c4820" strokeWidth="1" />
              <path d="M 193 34 L 197 34 L 195 37 Z" fill="#8c4820" />
              <line x1="184" y1="16" x2="206" y2="16" stroke="#8c4820" strokeWidth="0.8" />
              {/* Anemometer Cups */}
              <path
                d="M 184 13 A 3.5 3.5 0 0 0 184 19 Z"
                fill="#8c4820"
                fillOpacity="0.45"
                stroke="#8c4820"
                strokeWidth="0.75"
              />
              <ellipse
                cx="195"
                cy="15"
                rx="3"
                ry="1.8"
                fill="#8c4820"
                fillOpacity="0.25"
                stroke="#8c4820"
                strokeWidth="0.6"
              />
              <path
                d="M 206 13 A 3.5 3.5 0 0 1 206 19 Z"
                fill="#8c4820"
                fillOpacity="0.6"
                stroke="#8c4820"
                strokeWidth="0.75"
              />
              <ellipse
                cx="195"
                cy="16"
                rx="11"
                ry="3"
                fill="none"
                stroke="#8c4820"
                strokeWidth="0.5"
                strokeDasharray="1.5 1.5"
                opacity="0.6"
              />
              {/* Rotational Anemometer Archival Intaglio Arc */}
              <path d="M 180 8 Q 195 5 210 8" fill="none" stroke="#8c4820" strokeWidth="0.6" strokeDasharray="1.5 2" opacity="0.6" />
            </g>
          ) : activeTheme === 2 ? (
            // Theme 2: Prussian Cyanotype (Streamline Isotachs)
            <g className="drift-chronometer-cyanotype text-[#4fa3e3]">
              {/* Streamline Isotachs */}
              <path
                d="M 20 16 C 70 12, 130 18, 220 13"
                fill="none"
                stroke="#4fa3e3"
                strokeWidth="0.8"
                strokeDasharray="3 2"
                opacity="0.75"
              />
              <path
                d="M 20 40 C 70 43, 130 37, 220 42"
                fill="none"
                stroke="#4fa3e3"
                strokeWidth="0.8"
                strokeDasharray="3 2"
                opacity="0.75"
              />
              {/* Blueprint Isotach Graduation Cross-Ticks */}
              <line x1="80" y1="13" x2="80" y2="17" stroke="#4fa3e3" strokeWidth="0.6" opacity="0.7" />
              <line x1="140" y1="15" x2="140" y2="19" stroke="#4fa3e3" strokeWidth="0.6" opacity="0.7" />
              <line x1="190" y1="12" x2="190" y2="16" stroke="#4fa3e3" strokeWidth="0.6" opacity="0.7" />
            </g>
          ) : (
            // Theme 0: Marie Tharp (ADCP Acoustic Doppler Velocity Vectors)
            <g className="drift-chronometer-tharp text-[#00e5ff]">
              {/* ADCP 4-Beam Janus Acoustic Transducer Head */}
              <line x1="195" y1="10" x2="183" y2="25" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.8" />
              <line x1="195" y1="10" x2="207" y2="25" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.8" />
              <circle cx="195" cy="10" r="2" fill="#00e5ff" />

              {/* Doppler Frequency Shift Pulse Wavelets */}
              <path d="M 188 18 A 8 8 0 0 0 202 18" fill="none" stroke="#34d399" strokeWidth="0.6" opacity="0.75" />
              <path d="M 185 22 A 12 12 0 0 0 205 22" fill="none" stroke="#34d399" strokeWidth="0.6" opacity="0.5" />
              <path d="M 182 26 A 16 16 0 0 0 208 26" fill="none" stroke="#34d399" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4" />
            </g>
          )}

          {/* Speed Gradation Milestone Ticks & Labels */}
          {/* 0x */}
          <line x1="20" y1="36" x2="20" y2="42" stroke={tokens.trackColor} strokeWidth="1" />
          <text x="20" y="52" textAnchor="start" fill="currentColor" fontSize="5" fontFamily="monospace" opacity="0.6">
            0×
          </text>

          {/* 500x Default Sweetspot */}
          <line x1="70" y1="36" x2="70" y2="42" stroke={tokens.accentColor} strokeWidth="1.2" />
          <polygon points="70,41 72,43 70,45 68,43" fill={tokens.accentColor} />
          <text x="70" y="52" textAnchor="middle" fill={tokens.accentColor} fontSize="5" fontFamily="monospace" fontWeight="bold">
            500×
          </text>

          {/* 2000x Max */}
          <line x1="220" y1="36" x2="220" y2="42" stroke={tokens.trackColor} strokeWidth="1" />
          <text x="220" y="52" textAnchor="end" fill="currentColor" fontSize="5" fontFamily="monospace" opacity="0.6">
            2000×
          </text>

          {/* Draggable Chronometric Reticle Caliper */}
          <g>
            {/* Vertical Crosshair Line */}
            <line
              x1={thumbX}
              y1="8"
              x2={thumbX}
              y2="48"
              stroke={tokens.reticleStroke}
              strokeWidth="1.2"
            />

            {/* Reticle Central Diamond Lens */}
            <polygon
              points={`${thumbX},22 ${thumbX + 5},28 ${thumbX},34 ${thumbX - 5},28`}
              fill={tokens.reticleFill}
              stroke={tokens.reticleStroke}
              strokeWidth="1.5"
            />
            <circle cx={thumbX} cy="28" r="1.5" fill={tokens.reticleStroke} />

            {/* Floating Readout Flag / Caliper Badge */}
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

      {/* 4. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border)]/50 opacity-80">
        <span className="truncate">CHRONOMETRIC DRIFT (0–2000×)</span>
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
