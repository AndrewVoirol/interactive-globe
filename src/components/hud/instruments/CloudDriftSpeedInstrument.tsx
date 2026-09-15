// ============================================================================
// File: src/components/hud/instruments/CloudDriftSpeedInstrument.tsx
// Atmospheric Drift Chronometer: Kinematic Advection & Temporal Motion Viewport
// Controls: Cloud Drift Multiplier [0x .. 2000x] (Default 500x)
// Medium-Adaptive SVG: Cream (Robinson Anemometer), Cyanotype (Isotachs), Tharp (ADCP Doppler)
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useState, useCallback } from 'react';
import { VernierSlider } from '../../ui/VernierSlider';

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
          preserveAspectRatio="none"
        >
          {/* Base Velocity Streamline Track */}
          <line x1="20" y1="28" x2="220" y2="28" stroke={tokens.trackColor} strokeWidth="2" />
          <line
            x1="20"
            y1="28"
            x2={thumbX}
            y2="28"
            stroke={tokens.activeTrackColor}
            strokeWidth="2.5"
          />

          {/* Aerodynamic Streamline Ribbons */}
          <path
            d="M 16 20 Q 65 16 115 20 T 224 19"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.75"
            strokeDasharray="3 2"
            opacity="0.6"
          />
          <path
            d="M 16 36 Q 65 40 115 36 T 224 37"
            fill="none"
            stroke={tokens.trackColor}
            strokeWidth="0.75"
            strokeDasharray="3 2"
            opacity="0.6"
          />

          {/* Advection Direction Chevrons */}
          <path d="M 45 26 L 48 28 L 45 30" fill="none" stroke={tokens.trackColor} strokeWidth="1" />
          <path d="M 95 26 L 98 28 L 95 30" fill="none" stroke={tokens.trackColor} strokeWidth="1" />
          <path d="M 170 26 L 173 28 L 170 30" fill="none" stroke={tokens.trackColor} strokeWidth="1" />

          {/* 3. Medium-Adaptive SVG Artifacts */}
          {activeTheme === 1 ? (
            // Theme 1: Archival Cream Rag (Robinson Cup Anemometer Engraving & Beaufort Wind Scale)
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
              <text
                x="195"
                y="8"
                textAnchor="middle"
                fill="#8c4820"
                fontSize="5"
                fontFamily="monospace"
                opacity="0.8"
              >
                ROBINSON 1846
              </text>

              {/* Beaufort Wind Scale Calibration Ticks */}
              <line x1="20" y1="36" x2="20" y2="44" stroke="#8c4820" strokeWidth="0.75" />
              <line x1="70" y1="36" x2="70" y2="44" stroke="#8c4820" strokeWidth="0.75" />
              <line x1="120" y1="36" x2="120" y2="44" stroke="#8c4820" strokeWidth="0.75" />
              <line x1="220" y1="36" x2="220" y2="44" stroke="#8c4820" strokeWidth="0.75" />

              <text x="20" y="44" textAnchor="start" fill="#8c4820" fontSize="5" fontFamily="monospace" opacity="0.7">
                BF.0 CALM
              </text>
              <text x="70" y="44" textAnchor="middle" fill="#8c4820" fontSize="5" fontFamily="monospace" fontWeight="bold">
                BF.6 BREEZE
              </text>
              <text x="120" y="44" textAnchor="middle" fill="#8c4820" fontSize="5" fontFamily="monospace" opacity="0.85">
                BF.8 GALE
              </text>
              <text x="220" y="44" textAnchor="end" fill="#8c4820" fontSize="5" fontFamily="monospace" opacity="0.85">
                BF.12 STORM
              </text>
            </g>
          ) : activeTheme === 2 ? (
            // Theme 2: Prussian Cyanotype (Streamline Isotachs & CAD Knots / m/s Calibration Grid)
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

              {/* Kinematic Isotach Header */}
              <text
                x="120"
                y="8"
                textAnchor="middle"
                fill="#4fa3e3"
                fontSize="5"
                fontFamily="monospace"
                letterSpacing="0.05em"
                opacity="0.8"
              >
                ISOTACH KINEMATICS [kt / m·s⁻¹]
              </text>

              {/* CAD Calibration Markings */}
              <text x="20" y="45" textAnchor="start" fill="#a5d5ff" fontSize="5" fontFamily="monospace" opacity="0.8">
                0 kt (0 m/s)
              </text>
              <text x="70" y="45" textAnchor="middle" fill="#a5d5ff" fontSize="5" fontFamily="monospace" fontWeight="bold">
                25 kt (13 m/s)
              </text>
              <text x="120" y="45" textAnchor="middle" fill="#a5d5ff" fontSize="5" fontFamily="monospace" opacity="0.85">
                50 kt (26 m/s)
              </text>
              <text x="220" y="45" textAnchor="end" fill="#a5d5ff" fontSize="5" fontFamily="monospace" opacity="0.85">
                100 kt (51 m/s)
              </text>
            </g>
          ) : (
            // Theme 0: Marie Tharp (ADCP Acoustic Doppler Velocity Vectors & Sonar Pings)
            <g className="drift-chronometer-tharp text-[#00e5ff]">
              {/* ADCP 4-Beam Janus Acoustic Transducer Head */}
              <line x1="195" y1="10" x2="183" y2="25" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.8" />
              <line x1="195" y1="10" x2="207" y2="25" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.8" />
              <circle cx="195" cy="10" r="2" fill="#00e5ff" />

              {/* Doppler Frequency Shift Pulse Wavelets */}
              <path d="M 188 18 A 8 8 0 0 0 202 18" fill="none" stroke="#34d399" strokeWidth="0.6" opacity="0.75" />
              <path d="M 185 22 A 12 12 0 0 0 205 22" fill="none" stroke="#34d399" strokeWidth="0.6" opacity="0.5" />

              <text x="195" y="7" textAnchor="middle" fill="#00e5ff" fontSize="5" fontFamily="monospace" opacity="0.8">
                ADCP DOPPLER
              </text>

              {/* Doppler Shift Equation */}
              <text x="120" y="8" textAnchor="middle" fill="#34d399" fontSize="5" fontFamily="monospace" opacity="0.75">
                Δf = 2f₀·(v/c)·cos θ
              </text>

              {/* Oceanic Velocity Calibration */}
              <text x="20" y="45" textAnchor="start" fill="#00e5ff" fontSize="5" fontFamily="monospace" opacity="0.8">
                0 cm/s
              </text>
              <text x="70" y="45" textAnchor="middle" fill="#00e5ff" fontSize="5" fontFamily="monospace" fontWeight="bold">
                25 cm/s
              </text>
              <text x="120" y="45" textAnchor="middle" fill="#00e5ff" fontSize="5" fontFamily="monospace" opacity="0.85">
                50 cm/s
              </text>
              <text x="220" y="45" textAnchor="end" fill="#00e5ff" fontSize="5" fontFamily="monospace" opacity="0.85">
                100 cm/s
              </text>
            </g>
          )}

          {/* Speed Gradation Milestone Ticks & Labels */}
          {/* 0x Static Freeze */}
          <line x1="20" y1="36" x2="20" y2="40" stroke={tokens.trackColor} strokeWidth="1" />
          <text x="20" y="54" textAnchor="start" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.65">
            0× FREEZE
          </text>

          {/* 100x Synoptic */}
          <line x1="30" y1="36" x2="30" y2="39" stroke={tokens.trackColor} strokeWidth="0.75" />
          <text x="30" y="54" textAnchor="middle" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.5">
            100×
          </text>

          {/* 500x Time-Lapse Sweetspot Marker */}
          <line x1="70" y1="36" x2="70" y2="40" stroke={tokens.accentColor} strokeWidth="1.2" />
          <polygon points="70,39 72,41 70,43 68,41" fill={tokens.accentColor} />
          <text x="70" y="54" textAnchor="middle" fill={tokens.accentColor} fontSize="5.5" fontFamily="monospace" fontWeight="bold">
            500× TIME-LAPSE
          </text>

          {/* 1000x Gale */}
          <line x1="120" y1="36" x2="120" y2="40" stroke={tokens.trackColor} strokeWidth="1" />
          <text x="120" y="54" textAnchor="middle" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.65">
            1000× GALE
          </text>

          {/* 2000x Storm Jet */}
          <line x1="220" y1="36" x2="220" y2="40" stroke={tokens.trackColor} strokeWidth="1" />
          <text x="220" y="54" textAnchor="end" fill="currentColor" fontSize="5.5" fontFamily="monospace" opacity="0.65">
            2000× STORM
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

      {/* 3. Secondary Calibration Range Slider & Steppers (100% Backward Compatibility) */}
      <div className="space-y-1 pt-1 border-t border-[var(--theme-card-border)]/50">
        <VernierSlider
          id="sidebar-cloud-drift"
          label="Time-Lapse"
          sublabel="Drift Multiplier"
          min={0}
          max={2000}
          step={10}
          value={cloudDriftSpeed}
          readout={`${Math.round(cloudDriftSpeed)}×`}
          onChange={handleSpeedChange}
        />
      </div>

      {/* 4. Footer & Reset Action */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 pt-1 border-t border-[var(--theme-card-border)]/50 opacity-80">
        <span className="truncate">CHRONOMETRIC DRIFT (0–2000×)</span>
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

export default CloudDriftSpeedInstrument;
