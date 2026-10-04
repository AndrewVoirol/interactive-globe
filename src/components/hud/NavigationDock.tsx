import React, { useRef, useCallback, useEffect } from 'react';
import { CurvatureUnfurlSextant } from './instruments/CurvatureUnfurlSextant';
import { SimulationMode } from '../../types';

export interface NavigationDockProps {
  isZenMode: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  onToggleSpeed: () => void;
  alpha: number;
  onAlphaChange: (val: number) => void;
  onGlideToAlpha: (target: number) => void;
  theme: 0 | 1 | 2;
  activeDirection?: 'architectural' | 'hybrid' | 'photoreal' | null;
  onSelectRenderStyle?: (style: 'architectural' | 'hybrid' | 'photoreal') => void;
  mode?: SimulationMode;
  onGlideToMode?: (mode: SimulationMode) => void;
  onModeChange?: (mode: SimulationMode) => void;
  onSelectMode?: (mode: SimulationMode) => void;
  onCancelGlide?: () => void;
  isSidebarOpen?: boolean;
}

const PROJECTION_MODES: Array<{ id: SimulationMode; label: string }> = [
  { id: 0, label: 'Linear' },
  { id: 1, label: 'Scroll' },
  { id: 2, label: 'Fracture' },
  { id: 3, label: 'Fluid' },
];

export const NavigationDock: React.FC<NavigationDockProps> = ({
  isZenMode,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onToggleSpeed,
  alpha,
  onAlphaChange,
  onGlideToAlpha,
  theme,
  activeDirection,
  onSelectRenderStyle,
  mode = 0,
  onGlideToMode,
  onModeChange,
  onSelectMode,
  onCancelGlide,
  isSidebarOpen = false,
}) => {
  const isLight = theme === 1;
  const glideRafRef = useRef<number | null>(null);
  const inFlightTargetModeRef = useRef<SimulationMode | null>(null);
  const targetRestoreAlphaRef = useRef<number | null>(null);
  const emittedAlphasRef = useRef<number[]>([]);

  const cancelGlide = useCallback(() => {
    if (glideRafRef.current !== null) {
      cancelAnimationFrame(glideRafRef.current);
      glideRafRef.current = null;
    }
    inFlightTargetModeRef.current = null;
    targetRestoreAlphaRef.current = null;
    emittedAlphasRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cancelGlide();
    };
  }, [cancelGlide]);

  useEffect(() => {
    // If mode changed externally, cancel any in-flight glide
    if (inFlightTargetModeRef.current !== null && inFlightTargetModeRef.current !== mode) {
      cancelGlide();
    }
  }, [mode, cancelGlide]);

  useEffect(() => {
    // If playback started, cancel any in-flight glide
    if (isPlaying) {
      cancelGlide();
    }
  }, [isPlaying, cancelGlide]);

  useEffect(() => {
    // If alpha was updated externally during glide (not by NavigationDock's own RAF), cancel glide
    if (glideRafRef.current !== null && emittedAlphasRef.current.length > 0) {
      const matchIdx = emittedAlphasRef.current.findIndex(
        (val) => Math.abs(val - alpha) < 0.001
      );
      if (matchIdx !== -1) {
        emittedAlphasRef.current.splice(0, matchIdx + 1);
      } else {
        cancelGlide();
      }
    }
  }, [alpha, cancelGlide]);

  if (isZenMode) return null;

  const handleSelectMode = (newMode: SimulationMode) => {
    // Clicking active mode pill is a no-op
    if (newMode === mode && inFlightTargetModeRef.current === null) {
      return;
    }
    if (newMode === inFlightTargetModeRef.current) {
      return;
    }

    if (isPlaying) {
      onTogglePlay();
    }

    if (onGlideToMode) {
      onGlideToMode(newMode);
      onModeChange?.(newMode);
      onSelectMode?.(newMode);
      return;
    }

    // Determine the restore target alpha.
    // If a glide is already in progress, preserve the original resting restore target!
    const restoreAlpha = targetRestoreAlphaRef.current !== null ? targetRestoreAlphaRef.current : alpha;

    if (glideRafRef.current !== null) {
      cancelAnimationFrame(glideRafRef.current);
      glideRafRef.current = null;
    }

    // If resting alpha <= 0.05, switch immediately without glide
    if (restoreAlpha <= 0.05) {
      inFlightTargetModeRef.current = null;
      targetRestoreAlphaRef.current = null;
      emittedAlphasRef.current = [];
      onModeChange?.(newMode);
      onSelectMode?.(newMode);
      return;
    }

    // Auto-glide sequence:
    // 1. Smoothly glide alpha to 0.00 (Globe) over 250ms using cubic ease-in
    // 2. Switch mode uniform at alpha = 0.00 (topologies identical sphere)
    // 3. Smoothly restore alpha to prior value over 350ms using cubic ease-out
    inFlightTargetModeRef.current = newMode;
    targetRestoreAlphaRef.current = restoreAlpha;
    emittedAlphasRef.current = [alpha];

    const startAlpha = alpha;
    const phase1Duration = 250;
    const phase2Duration = 350;
    const totalDuration = phase1Duration + phase2Duration;
    const startTime = performance.now();
    let modeSwitched = false;

    const animate = (now: number) => {
      const elapsed = now - startTime;

      if (elapsed < phase1Duration) {
        // Phase 1: Smoothly glide alpha to 0.00 over 250ms using cubic ease-in
        const p = Math.min(1.0, Math.max(0.0, elapsed / phase1Duration));
        const easeIn = p * p * p;
        const curAlpha = Math.max(0.0, startAlpha * (1.0 - easeIn));
        const alphaToEmit = parseFloat(curAlpha.toFixed(4));
        emittedAlphasRef.current.push(alphaToEmit);
        if (emittedAlphasRef.current.length > 50) emittedAlphasRef.current.shift();
        onAlphaChange(alphaToEmit);
        glideRafRef.current = requestAnimationFrame(animate);
      } else {
        if (!modeSwitched) {
          // Switch mode uniform at alpha = 0.00
          emittedAlphasRef.current.push(0.0);
          if (emittedAlphasRef.current.length > 50) emittedAlphasRef.current.shift();
          onAlphaChange(0.0);
          onModeChange?.(newMode);
          onSelectMode?.(newMode);
          modeSwitched = true;
        }

        if (elapsed < totalDuration) {
          // Phase 2: Smoothly restore alpha to prior value over 350ms using cubic ease-out
          const p = Math.min(1.0, Math.max(0.0, (elapsed - phase1Duration) / phase2Duration));
          const easeOut = 1.0 - Math.pow(1.0 - p, 3);
          const curAlpha = Math.min(restoreAlpha, restoreAlpha * easeOut);
          const alphaToEmit = parseFloat(curAlpha.toFixed(4));
          emittedAlphasRef.current.push(alphaToEmit);
          if (emittedAlphasRef.current.length > 50) emittedAlphasRef.current.shift();
          onAlphaChange(alphaToEmit);
          glideRafRef.current = requestAnimationFrame(animate);
        } else {
          // Finalize: restore prior alpha
          const finalAlpha = parseFloat(restoreAlpha.toFixed(4));
          emittedAlphasRef.current = [];
          onAlphaChange(finalAlpha);
          glideRafRef.current = null;
          inFlightTargetModeRef.current = null;
          targetRestoreAlphaRef.current = null;
        }
      }
    };

    glideRafRef.current = requestAnimationFrame(animate);
  };

  return (
    <div
      className={`absolute bottom-8 left-0 flex flex-col items-center gap-2.5 z-20 pointer-events-none font-mono select-none transition-all duration-300 ${
        isSidebarOpen ? 'right-0 md:right-[404px]' : 'right-0'
      }`}
      style={{ fontFamily: 'var(--theme-font-telemetry)' }}
    >
      <div
        className={`flex items-center gap-3 px-5 pt-2.5 pb-7 rounded-[3px] shadow-2xl pointer-events-auto border transition-colors relative scroll-curl-lip max-w-[calc(100vw-2.5rem)] overflow-x-auto scrollbar-none bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] ${
          theme === 1 ? 'paper-cream-panel' : theme === 2 ? 'paper-cyanotype' : 'paper-tharp'
        }`}
      >
        {/* 4-Segment Projection Mode Selector (Single Authoritative Switch) */}
        <div
          role="radiogroup"
          aria-label="Projection Mode Selector"
          className={`flex items-center rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] p-0.5 shrink-0 z-10 text-nano font-mono ${
            theme === 1 ? 'paper-cream-panel' : theme === 2 ? 'paper-cyanotype' : 'paper-tharp'
          }`}
          style={{
            backgroundColor: theme === 1 ? 'rgba(252, 249, 242, 0.94)' : undefined,
          }}
        >
          {PROJECTION_MODES.map((m) => {
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => handleSelectMode(m.id)}
                title={`Switch to ${m.label} Projection Mode (${m.id + 1})`}
                className={`tactile-btn px-2.5 py-0.5 rounded-[1px] transition-all uppercase tracking-wider font-semibold ${
                  isActive
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] shadow-sm font-bold ring-1 ring-[var(--theme-control-active-ring)]'
                    : 'text-[var(--theme-control-text)] hover:text-[var(--theme-control-hover-text)] hover:bg-[var(--theme-control-hover-bg)]'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Archival Drafting Hairline Divider */}
        <div className="h-4 w-px shrink-0 z-10" style={{ backgroundColor: 'var(--theme-neatline-border)', opacity: 0.45 }} />

        {/* Play/Pause Toggle */}
        <button
          onClick={() => {
            cancelGlide();
            onTogglePlay();
          }}
          title={isPlaying ? 'Pause Continuous Unfurl Loop (Space)' : 'Play Continuous Unfurl Loop (Space)'}
          className={`tactile-btn w-7 h-7 rounded-[2px] flex items-center justify-center transition-all shrink-0 border z-10 ${
            isPlaying
              ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-semibold'
              : 'bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] border-[var(--theme-control-border)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
          }`}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Playback Speed Multiplier */}
        <button
          onClick={() => {
            cancelGlide();
            onToggleSpeed();
          }}
          title={`Playback time-lapse speed multiplier (${playbackSpeed.toFixed(1)}×)`}
          className="tactile-btn text-micro font-medium px-1.5 py-0.5 rounded-[2px] border transition-colors tabular-nums shrink-0 z-10 bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]"
        >
          {playbackSpeed.toFixed(1)}×
        </button>

        {/* Archival Drafting Hairline Divider */}
        <div className="h-4 w-px shrink-0 z-10" style={{ backgroundColor: 'var(--theme-neatline-border)', opacity: 0.45 }} />

        {/* Quick Snap to Globe (G) */}
        <button
          onClick={() => {
            cancelGlide();
            onGlideToAlpha(0.0);
          }}
          title="Glide camera and manifold to closed Riemannian sphere (Press G)"
          className={`tactile-btn text-body font-semibold uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] transition-all shrink-0 border z-10 ${
            alpha < 0.03
              ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)] font-semibold'
              : 'bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] border-[var(--theme-control-border)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
          }`}
        >
          <span>Globe</span>
          <kbd
            className={`text-nano px-1 py-0.5 rounded-[1px] font-normal ${
              alpha < 0.03
                ? 'bg-black/25 text-[var(--theme-control-active-text)]'
                : 'bg-black/10 text-current'
            }`}
          >
            G
          </kbd>
        </button>

        {/* Gaussian Curvature Unfurl Sextant Arc */}
        <div className="shrink-0 z-10 hidden sm:flex">
          <CurvatureUnfurlSextant
            alpha={alpha}
            onAlphaChange={(val) => {
              cancelGlide();
              onCancelGlide?.();
              onAlphaChange(val);
            }}
            onGlideToAlpha={(target) => {
              cancelGlide();
              onCancelGlide?.();
              onGlideToAlpha(target);
            }}
            onCancelGlide={() => {
              cancelGlide();
              onCancelGlide?.();
            }}
            mode={mode}
            theme={theme}
            isLight={isLight}
          />
        </div>

        {/* Quick Snap to Map (M) */}
        <button
          onClick={() => {
            cancelGlide();
            onGlideToAlpha(1.0);
          }}
          title="Glide camera and manifold to planar map (Press M)"
          className={`tactile-btn text-body font-semibold uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] transition-all shrink-0 border z-10 ${
            alpha > 0.97
              ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)] font-semibold'
              : 'bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] border-[var(--theme-control-border)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
          }`}
        >
          <span>Map</span>
          <kbd
            className={`text-nano px-1 py-0.5 rounded-[1px] font-normal ${
              alpha > 0.97
                ? 'bg-black/25 text-[var(--theme-control-active-text)]'
                : 'bg-black/10 text-current'
            }`}
          >
            M
          </kbd>
        </button>

        {/* Archival Drafting Hairline Divider */}
        <div className="h-4 w-px shrink-0 z-10 border-[var(--theme-card-border)]" style={{ backgroundColor: 'var(--theme-neatline-border)', opacity: 0.45 }} />

        <span className="text-micro tabular-nums text-[var(--theme-text-secondary)] min-w-[3.25rem] text-right shrink-0 z-10">
          {alpha.toFixed(3)}
        </span>
      </div>

    </div>
  );
};
