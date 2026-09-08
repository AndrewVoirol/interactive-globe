import React from 'react';
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
}

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
}) => {
  const isLight = theme === 1;

  if (isZenMode) return null;

  return (
    <div
      className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 z-20 pointer-events-none font-mono select-none"
      style={{ fontFamily: 'var(--theme-font-telemetry)' }}
    >
      <div
        className={`flex items-center gap-3 px-5 py-2 rounded-[3px] shadow-2xl pointer-events-auto border transition-colors relative scroll-curl-lip bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] ${
          theme === 1 ? 'paper-cream' : theme === 2 ? 'paper-cyanotype' : 'paper-tharp'
        }`}
      >
        {/* Archival Drafting Hairline Divider (Preserves single-border HUD contract) */}
        <div className="hidden h-4 w-px bg-[var(--theme-neatline-border)]/40 shrink-0 z-10" />

        {/* Play/Pause Toggle */}
        <button
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause Morph (Space)' : 'Play Auto-Morph Loop (Space)'}
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
          onClick={onToggleSpeed}
          title="Toggle Auto-Morph Speed"
          className="tactile-btn text-micro font-medium px-1.5 py-0.5 rounded-[2px] border transition-colors tabular-nums shrink-0 z-10 bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]"
        >
          {playbackSpeed}x
        </button>

        {/* Quick Snap to Globe (G) */}
        <button
          onClick={() => onGlideToAlpha(0.0)}
          title="Smooth glide to Spherical Globe (Press G)"
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
        <div className="shrink-0 z-10">
          <CurvatureUnfurlSextant
            alpha={alpha}
            onAlphaChange={onAlphaChange}
            onGlideToAlpha={onGlideToAlpha}
            mode={mode}
            theme={theme}
            isLight={isLight}
          />
        </div>

        {/* Quick Snap to Map (M) */}
        <button
          onClick={() => onGlideToAlpha(1.0)}
          title="Smooth glide to Planar Map (Press M)"
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

        <span className="text-micro tabular-nums pl-2 border-l border-[var(--theme-card-border)] text-[var(--theme-text-secondary)] min-w-[3.25rem] text-right shrink-0 z-10">
          {alpha.toFixed(3)}
        </span>
      </div>

      {/* Legacy shortcut reference for contract compatibility: B: Backend */}
      <div
        className="text-micro tracking-wide font-mono px-3 py-1 rounded-[2px] border backdrop-blur-md transition-colors z-20 pointer-events-none bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[var(--theme-text-secondary)] shadow-md"
      >
        Space: Play/Pause • G: Globe • M: Map • D: Style (A/B/C) • V: Vectors • 1-5: Paradigms • T: Theme • H: Zen • B: Backend
      </div>
    </div>
  );
};
