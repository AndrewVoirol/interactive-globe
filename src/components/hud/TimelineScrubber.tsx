// ============================================================================
// File: src/components/hud/TimelineScrubber.tsx
// Atmospheric Chronology & Temporal Scrubber
// Dual-zone horizontal scrubber bridging past Doppler radar mosaics (-60m..0)
// and Google DeepMind WeatherNext 3 prognostic forecasts (0..+48h)
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export interface TimelineScrubberState {
  absoluteMinutes: number;    // -60 to +2880
  isRadarZone: boolean;       // true if < 0 (past radar data)
  isForecastZone: boolean;    // true if > 0 (WeatherNext forecast)
  tau: number;                // 0.0-1.0 interpolation within current hour bracket
  bracketHour: number;        // Which forecast hour bracket (0-47)
  isPlaying: boolean;
}

export interface TimelineScrubberProps {
  onTimeChange?: (state: TimelineScrubberState) => void;
  className?: string;
  initialMinutes?: number;
  value?: number;
  initialPlaying?: boolean;
  initialSpeed?: 1 | 2 | 5 | 10;
  disabled?: boolean;
}

// Proportional allocation: 20% of track for -60m..0 (radar), 80% for 0..+48h (forecast)
export const RADAR_FRACTION = 0.20;

/**
 * Computes the normalized track position u in [0, 1] for a given absolute minute (-60 to +2880)
 */
export function minutesToTrackPosition(minutes: number): number {
  if (isNaN(minutes)) return RADAR_FRACTION;
  const m = Math.max(-60, Math.min(2880, minutes));
  if (m <= 0) {
    // [-60, 0] -> [0, RADAR_FRACTION]
    return ((m + 60) / 60) * RADAR_FRACTION;
  } else {
    // [0, 2880] -> [RADAR_FRACTION, 1.0]
    return RADAR_FRACTION + (m / 2880) * (1.0 - RADAR_FRACTION);
  }
}

/**
 * Computes absolute minutes (-60 to +2880) from normalized track position u in [0, 1]
 */
export function trackPositionToMinutes(u: number): number {
  if (isNaN(u)) return 0;
  const clampedU = Math.max(0, Math.min(1, u));
  let m: number;
  if (clampedU <= RADAR_FRACTION) {
    m = -60 + (clampedU / RADAR_FRACTION) * 60;
  } else {
    m = ((clampedU - RADAR_FRACTION) / (1.0 - RADAR_FRACTION)) * 2880;
  }
  // Clean IEEE-754 precision artifacts (e.g. 0.6 - 0.2 = 0.39999999999999997)
  return Math.round(m * 10000) / 10000;
}

/**
 * Computes the full TimelineScrubberState given minutes and playback status
 */
export function computeTimelineState(minutes: number, isPlaying: boolean): TimelineScrubberState {
  const safeMinutes = isNaN(minutes) ? 0 : minutes;
  const rounded = Math.round(safeMinutes * 10000) / 10000;
  const clamped = Math.max(-60, Math.min(2880, rounded));
  const isRadarZone = clamped < 0;
  const isForecastZone = clamped > 0;

  let bracketHour = 0;
  let tau = 0.0;

  if (clamped >= 0) {
    const totalHours = clamped / 60;
    if (totalHours >= 48) {
      bracketHour = 47;
      tau = 1.0;
    } else {
      bracketHour = Math.min(47, Math.floor(totalHours));
      tau = Math.max(0.0, Math.min(1.0, totalHours - bracketHour));
    }
  } else {
    // Radar zone [-60, 0]: frame tau represents interpolation across the 1-hour radar window
    bracketHour = 0;
    tau = Math.max(0.0, Math.min(1.0, (clamped + 60) / 60));
  }

  return {
    absoluteMinutes: clamped,
    isRadarZone,
    isForecastZone,
    tau,
    bracketHour,
    isPlaying: Boolean(isPlaying),
  };
}

const SPEED_OPTIONS: { id: 1 | 2 | 5 | 10; label: string }[] = [
  { id: 1, label: '1×' },
  { id: 2, label: '2×' },
  { id: 5, label: '5×' },
  { id: 10, label: '10×' },
];

const QUICK_JUMP_PRESETS = [
  { label: '-60m', minutes: -60, title: 'Oldest Doppler Radar Frame (-60 min)' },
  { label: '-30m', minutes: -30, title: 'Doppler Radar (-30 min)' },
  { label: 'NOW', minutes: 0, title: 'Observation Datum (NOW)', isDatum: true },
  { label: '+12h', minutes: 720, title: 'WeatherNext Forecast (+12 Hours)' },
  { label: '+24h', minutes: 1440, title: 'WeatherNext Forecast (+24 Hours)' },
  { label: '+48h', minutes: 2880, title: 'WeatherNext Forecast Horizon (+48 Hours)' },
];

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  onTimeChange,
  className = '',
  initialMinutes = 0,
  value,
  initialPlaying = false,
  initialSpeed = 1,
  disabled = false,
}) => {
  const [internalMinutes, setInternalMinutes] = useState<number>(initialMinutes);
  const [isPlaying, setIsPlaying] = useState<boolean>(initialPlaying);
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10>(initialSpeed);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  // Synchronized refs for smooth requestAnimationFrame loop
  const minutesRef = useRef<number>(value !== undefined ? value : internalMinutes);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const speedRef = useRef<1 | 2 | 5 | 10>(speed);
  const onTimeChangeRef = useRef(onTimeChange);

  const currentMinutes = value !== undefined ? value : internalMinutes;
  minutesRef.current = currentMinutes;
  isPlayingRef.current = isPlaying;
  speedRef.current = speed;
  onTimeChangeRef.current = onTimeChange;

  const emitTimeChange = useCallback((min: number, playing: boolean) => {
    const state = computeTimelineState(min, playing);
    onTimeChangeRef.current?.(state);
  }, []);

  const updateMinutes = useCallback(
    (newMinutes: number) => {
      const safeMinutes = Number.isFinite(newMinutes) ? newMinutes : 0;
      const clamped = Math.max(-60, Math.min(2880, safeMinutes));
      if (value === undefined) {
        setInternalMinutes(clamped);
      }
      minutesRef.current = clamped;
      emitTimeChange(clamped, isPlayingRef.current);
    },
    [value, emitTimeChange]
  );

  // 120 FPS requestAnimationFrame animation loop (decoupled from value updates to prevent frame drops)
  useEffect(() => {
    if (!isPlaying) return;

    let lastTimestamp: number | null = null;
    let animationFrameId: number;

    // Base speed: 120 minutes per second at 1x multiplier (~24.5s for entire 48h cycle)
    const BASE_MINUTES_PER_SECOND = 120;

    const frame = (timestamp: number) => {
      if (lastTimestamp !== null) {
        const dtSec = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
        const deltaMinutes = BASE_MINUTES_PER_SECOND * speedRef.current * dtSec;
        let next = minutesRef.current + deltaMinutes;

        // Loop seamlessly within [-60, 2880]
        if (next > 2880) {
          next = -60 + ((next - 2880) % 2940);
        }

        minutesRef.current = next;
        if (value === undefined) {
          setInternalMinutes(next);
        }
        onTimeChangeRef.current?.(computeTimelineState(next, true));
      }
      lastTimestamp = timestamp;
      animationFrameId = requestAnimationFrame(frame);
    };

    animationFrameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying]);

  const togglePlayback = useCallback(() => {
    if (disabled) return;
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    isPlayingRef.current = nextPlaying;
    emitTimeChange(minutesRef.current, nextPlaying);
  }, [disabled, isPlaying, emitTimeChange]);

  const handlePointerCoord = useCallback(
    (clientX: number) => {
      if (!trackRef.current || disabled) return;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const u = relX / rect.width;
      const calculatedMinutes = trackPositionToMinutes(u);
      updateMinutes(calculatedMinutes);
    },
    [disabled, updateMinutes]
  );

  // Window-level pointer tracking for unbroken dragging outside element boundary
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        handlePointerCoord(e.clientX);
      }
    };
    const handleGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [handlePointerCoord]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    isDraggingRef.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if setPointerCapture is unsupported
    }
    handlePointerCoord(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || disabled) return;
    handlePointerCoord(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore if releasePointerCapture is unsupported
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const isSteppingLeft = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
    const isRadar = currentMinutes < 0 || (currentMinutes === 0 && isSteppingLeft);
    const fineStep = isRadar ? 1 : 15;
    const coarseStep = isRadar ? 10 : 60;
    const step = e.shiftKey ? fineStep : coarseStep;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      updateMinutes(currentMinutes - step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      updateMinutes(currentMinutes + step);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      updateMinutes(currentMinutes - 360); // -6 hours
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      updateMinutes(currentMinutes + 360); // +6 hours
    } else if (e.key === 'Home') {
      e.preventDefault();
      updateMinutes(-60);
    } else if (e.key === 'End') {
      e.preventDefault();
      updateMinutes(2880);
    } else if (e.key === '0' || e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      updateMinutes(0);
    } else if (e.key === ' ') {
      e.preventDefault();
      togglePlayback();
    }
  };

  const handleStepperNudge = (dir: -1 | 1) => {
    if (disabled) return;
    let step = 60;
    if (currentMinutes < 0 || (currentMinutes === 0 && dir === -1)) {
      step = 10;
    }
    updateMinutes(currentMinutes + dir * step);
  };

  const thumbPositionPct = useMemo(() => {
    return minutesToTrackPosition(currentMinutes) * 100;
  }, [currentMinutes]);

  // Readout telemetry formatting
  const readout = useMemo(() => {
    const safeMin = Number.isFinite(currentMinutes) ? currentMinutes : 0;
    const rounded = Math.round(safeMin);
    if (rounded < 0) {
      const absMin = Math.abs(rounded);
      const frameIdx = Math.max(1, Math.min(6, Math.floor((60 + rounded) / 10) + 1));
      return {
        badge: 'PAST RADAR',
        badgeColor: 'border-[var(--theme-status-sage,#34d399)]/40 text-[var(--theme-status-sage,#34d399)] bg-[var(--theme-status-sage,#34d399)]/10',
        primary: `-${absMin}m`,
        secondary: `Frame ${frameIdx}/6 • Past Mosaic`,
        zoneText: 'Radar Mosaic (-60m)',
      };
    } else if (rounded === 0) {
      return {
        badge: 'DATUM',
        badgeColor: 'border-[var(--theme-text-accent)] text-[var(--theme-text-accent)] bg-[var(--theme-text-accent)]/10',
        primary: 'NOW',
        secondary: 'Observation Datum (T+00:00)',
        zoneText: 'Observation Datum',
      };
    } else {
      const totalHours = rounded / 60;
      const bracketHour = Math.min(47, Math.floor(totalHours));
      const m = rounded % 60;
      const tau = (m / 60).toFixed(2);
      const hoursStr = m === 0 ? `+${Math.floor(totalHours)}h` : `+${Math.floor(totalHours)}h ${m}m`;
      return {
        badge: 'WEATHERNEXT 3',
        badgeColor: 'border-[var(--theme-status-slate,#4fd1c5)]/40 text-[var(--theme-status-slate,#4fd1c5)] bg-[var(--theme-status-slate,#4fd1c5)]/10',
        primary: hoursStr,
        secondary: `Bracket H${bracketHour}..${bracketHour + 1} • τ=${tau}`,
        zoneText: 'WeatherNext Forecast (+48h)',
      };
    }
  }, [currentMinutes]);

  return (
    <div
      className={`p-3 rounded-[2px] border border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg)] text-[var(--theme-text-primary)] select-none space-y-2.5 transition-colors ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {/* -------------------------------------------------------------------- */}
      {/* 1. Header: Title, Telemetry & Fine-increment Steppers                */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-2 text-micro font-mono">
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold uppercase tracking-wider text-[var(--theme-text-primary)] truncate text-body">
              Chronometric Scrubber
            </span>
            <span
              className={`text-nano font-bold uppercase px-1.5 py-0.2 rounded-[1px] border shrink-0 ${readout.badgeColor}`}
            >
              {readout.badge}
            </span>
          </div>
          <span className="text-nano opacity-70 text-[var(--theme-text-secondary)] truncate hidden sm:inline">
            {readout.secondary}
          </span>
        </div>

        {/* Value readout and Steppers */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleStepperNudge(-1)}
            disabled={disabled || currentMinutes <= -60}
            title="Step backward (-10m radar or -1h forecast)"
            className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors"
          >
            -
          </button>

          <span className="font-mono font-bold tabular-nums text-body min-w-[48px] text-center text-[var(--theme-text-accent)] px-1 py-0.5 rounded-[1px] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)]">
            {readout.primary}
          </span>

          <button
            type="button"
            onClick={() => handleStepperNudge(1)}
            disabled={disabled || currentMinutes >= 2880}
            title="Step forward (+10m radar or +1h forecast)"
            className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. Dual-Zone Horizon Labels Header                                   */}
      {/* -------------------------------------------------------------------- */}
      <div className="relative h-4 text-nano font-mono text-[var(--theme-text-secondary)] px-0.5">
        <div className="absolute left-0.5 top-0 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-status-sage,#34d399)] shrink-0" />
          <span className="uppercase tracking-tight hidden sm:inline">-60m Radar</span>
          <span className="uppercase tracking-tight sm:hidden">-60m</span>
        </div>

        <div className="absolute right-0.5 top-0 flex items-center justify-end gap-1">
          <span className="uppercase tracking-tight hidden sm:inline">+48h WeatherNext Forecast</span>
          <span className="uppercase tracking-tight sm:hidden">+48h</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-status-slate,#4fd1c5)] shrink-0" />
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 3. Dual-Zone Horizontal Slider Track                                 */}
      {/* -------------------------------------------------------------------- */}
      <div className="relative pt-4 pb-1">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Atmospheric Timeline Scrubber"
          aria-valuemin={-60}
          aria-valuemax={2880}
          aria-valuenow={Math.round(currentMinutes)}
          aria-valuetext={`${readout.badge} ${readout.primary}`}
          data-testid="timeline-scrubber-track"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          className={`relative w-full h-8 rounded-[2px] border flex items-center cursor-pointer select-none touch-none bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-text-accent)] ${
            isHovered ? 'border-[var(--theme-card-border-hover)]' : ''
          }`}
        >
          {/* Left Zone: Past Radar (-60m to NOW, 20% width) */}
          <div
            className="h-full bg-[var(--theme-status-sage,#34d399)]/10 relative overflow-hidden border-r border-dashed border-[var(--theme-text-accent)]/50"
            style={{ width: `${RADAR_FRACTION * 100}%` }}
          >
            {/* 10-minute tick marks in Radar Zone */}
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const tickPct = (i / 6) * 100;
              return (
                <div
                  key={`radar-tick-${i}`}
                  className="absolute top-0 bottom-0 border-l border-[var(--theme-status-sage,#34d399)]/20 pointer-events-none"
                  style={{ left: `${tickPct}%` }}
                >
                  <span className="absolute bottom-0.5 left-0.5 text-[7px] font-mono text-[var(--theme-status-sage,#34d399)]/60 hidden sm:inline">
                    -{60 - i * 10}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right Zone: Forecast (NOW to +48h, 80% width) */}
          <div
            className="h-full bg-[var(--theme-status-slate,#4fd1c5)]/5 relative overflow-hidden flex-1"
          >
            {/* Hourly & Major ticks in Forecast Zone */}
            {[6, 12, 18, 24, 30, 36, 42, 48].map((h) => {
              const tickPct = (h / 48) * 100;
              const isEnd = h === 48;
              return (
                <div
                  key={`forecast-major-tick-${h}`}
                  className="absolute top-0 bottom-0 border-l border-[var(--theme-control-border)] pointer-events-none"
                  style={{ left: `${tickPct}%` }}
                >
                  <span
                    className={`absolute bottom-0.5 text-[7px] font-mono text-[var(--theme-text-secondary)] opacity-60 hidden sm:inline ${
                      isEnd ? 'right-0.5' : 'left-0.5'
                    }`}
                  >
                    +{h}h
                  </span>
                </div>
              );
            })}

            {/* Fine hourly ticks using theme-adaptive tick token */}
            {Array.from({ length: 48 }).map((_, idx) => {
              if (idx % 6 === 0) return null;
              const tickPct = (idx / 48) * 100;
              return (
                <div
                  key={`forecast-minor-tick-${idx}`}
                  className="absolute top-1 bottom-1 w-[1px] pointer-events-none"
                  style={{ left: `${tickPct}%`, backgroundColor: 'var(--theme-slider-tick, rgba(240, 237, 230, 0.25))' }}
                />
              );
            })}
          </div>

          {/* Prominent NOW Hairline Divider with Label */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-[var(--theme-text-accent)] shadow-[0_0_8px_var(--theme-text-accent)] z-10 pointer-events-none"
            style={{ left: `${RADAR_FRACTION * 100}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[var(--theme-text-accent)] rotate-45" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[var(--theme-text-accent)] rotate-45" />
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1 py-0.2 rounded-[1px] bg-[var(--theme-panel-bg)] border border-[var(--theme-text-accent)] text-[var(--theme-text-accent)] text-[8px] font-mono font-bold uppercase tracking-wider leading-none shadow-xs">
              NOW
            </div>
          </div>

          {/* Reticle Thumb Indicator */}
          <div
            className="absolute top-0 bottom-0 -translate-x-1/2 flex items-center justify-center pointer-events-none z-20"
            style={{ left: `${thumbPositionPct}%` }}
          >
            <div className="w-2.5 h-7 rounded-[1px] bg-[var(--theme-slider-thumb-bg,#c5a059)] border border-[var(--theme-slider-thumb-border,#7c6230)] shadow-[0_1px_4px_rgba(0,0,0,0.5)] flex items-center justify-center">
              <div className="w-[1px] h-3.5 bg-black/40" />
            </div>
          </div>
        </div>

        {/* Accessible Range Input for Automated Tests (tabIndex=-1 and aria-hidden to prevent duplicate A11y tree node) */}
        <input
          type="range"
          min={-60}
          max={2880}
          step={1}
          value={Math.round(currentMinutes)}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (Number.isFinite(val)) updateMinutes(val);
          }}
          onInput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            if (Number.isFinite(val)) updateMinutes(val);
          }}
          data-testid="timeline-native-slider"
          className="sr-only"
        />
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 4. Controls Dock: Play/Pause, Loop Status & Playback Speed Selector   */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--theme-panel-border)]/50">
        {/* Play/Pause & Reset to Datum */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlayback}
            disabled={disabled}
            aria-label={isPlaying ? 'Pause timeline animation' : 'Play timeline animation'}
            className={`tactile-btn font-mono font-bold text-nano px-2 py-1 rounded-[2px] border transition-all flex items-center gap-1.5 ${
              isPlaying
                ? 'bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)] ring-1 ring-[var(--theme-control-active-ring)] shadow-xs'
                : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)]'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 text-[var(--theme-text-accent)]" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-[var(--theme-text-accent)]" />
                <span>PLAY</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => updateMinutes(0)}
            disabled={disabled || currentMinutes === 0}
            title="Reset to NOW observation datum (T+00:00)"
            className="tactile-btn font-mono font-bold text-nano px-1.5 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] flex items-center gap-1 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">DATUM</span>
          </button>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1">
          <span className="text-nano font-mono text-[var(--theme-text-secondary)] opacity-80 hidden sm:inline mr-0.5">
            SPEED:
          </span>
          <div className="inline-flex items-center p-0.5 rounded-[2px] border bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] gap-0.5">
            {SPEED_OPTIONS.map((opt) => {
              const isSelected = speed === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setSpeed(opt.id);
                    speedRef.current = opt.id;
                  }}
                  className={`tactile-btn font-mono font-bold text-nano px-1.5 py-0.5 rounded-[1px] transition-all ${
                    isSelected
                      ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-xs'
                      : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)] border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 5. Quick-Jump Presets Bar                                            */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-1 pt-0.5">
        {QUICK_JUMP_PRESETS.map((preset) => {
          const isActive = Math.abs(currentMinutes - preset.minutes) < 3;
          return (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              title={preset.title}
              onClick={() => updateMinutes(preset.minutes)}
              className={`tactile-btn text-nano font-mono font-bold px-1.5 py-0.5 rounded-[1px] border transition-all flex-1 text-center truncate ${
                isActive
                  ? 'bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-text-accent)] shadow-xs font-semibold'
                  : 'bg-[var(--theme-control-bg)]/60 border-[var(--theme-control-border)]/60 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)]'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
