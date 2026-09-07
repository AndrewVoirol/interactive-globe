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
    <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 z-10 pointer-events-none font-mono select-none">
      <div
        className={`flex items-center gap-3 px-5 py-2 rounded-[3px] shadow-2xl pointer-events-auto border transition-colors relative scroll-curl-lip ${
          theme === 1
            ? 'paper-cream border-[#cfc4af] text-[#2b2b2b] shadow-2xl shadow-[#d8cfbc]/50'
            : theme === 2
            ? 'paper-cyanotype border-[#2a435e] text-[#e8edf2] shadow-2xl shadow-[#071320]/80'
            : 'paper-tharp border-[#333e4d] text-[#f0ede6] shadow-2xl shadow-[#080d12]/80'
        }`}
      >
        {/* Subtle Inner Drafting Neatline Rule */}
        <div
          className={`pointer-events-none absolute inset-[2.5px] rounded-[2px] border ${
            theme === 1
              ? 'border-[#cfc4af]/40'
              : theme === 2
              ? 'border-[#3b597a]/30'
              : 'border-white/5'
          }`}
        />

        {/* Play/Pause Toggle */}
        <button
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause Morph (Space)' : 'Play Auto-Morph Loop (Space)'}
          className={`tactile-btn w-7 h-7 rounded-[2px] flex items-center justify-center transition-all shrink-0 border z-10 ${
            isPlaying
              ? theme === 1
                ? 'bg-[#2b241a] text-[#fdfcf9] border-[#2b241a]'
                : theme === 2
                ? 'bg-[#254263] text-[#f5f8fc] border-[#4a729e]'
                : 'bg-[#22384a] text-[#f0ede6] border-[#3b788a]'
              : theme === 1
              ? 'bg-[#eee5d0] text-[#4a3b32] border-[#d8cfbc] hover:bg-[#eae0d2]'
              : theme === 2
              ? 'bg-[#162a42] text-[#9fcbf9] border-[#263c54] hover:bg-[#1a3352]'
              : 'bg-[#1b2b3a] text-[#c5a059] border-[#333e4d] hover:bg-[#22384a]'
          }`}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Playback Speed Multiplier */}
        <button
          onClick={onToggleSpeed}
          title="Toggle Auto-Morph Speed"
          className={`tactile-btn text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] border transition-colors tabular-nums shrink-0 z-10 ${
            theme === 1
              ? 'border-[#d8cfbc] bg-[#f4eee1] text-[#4a3b32] hover:bg-[#ede3d4]'
              : theme === 2
              ? 'border-[#263c54] bg-[#101c2b] text-[#8ea4bd] hover:text-[#e8edf2]'
              : 'border-[#333e4d] bg-[#0f161f] text-[#a2998a] hover:text-[#f0ede6]'
          }`}
        >
          {playbackSpeed}x
        </button>

        {/* Quick Snap to Globe (G) */}
        <button
          onClick={() => onGlideToAlpha(0.0)}
          title="Smooth glide to Spherical Globe (Press G)"
          className={`tactile-btn text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] transition-all shrink-0 border z-10 ${
            alpha < 0.03
              ? theme === 1
                ? 'bg-[#2b241a] text-[#fdfcf9] border-[#2b241a] shadow-sm'
                : theme === 2
                ? 'bg-[#254263] text-[#f5f8fc] border-[#4a729e] shadow-sm ring-1 ring-[#c5a059]/40 font-extrabold'
                : 'bg-[#22384a] text-[#f0ede6] border-[#3b788a] shadow-sm ring-1 ring-[#c5a059]/40 font-extrabold'
              : theme === 1
              ? 'border-[#d8cfbc] bg-[#f4eee1]/60 text-[#5a4f3e] hover:bg-[#ede3d4]'
              : theme === 2
              ? 'border-[#263c54] bg-[#101c2b]/60 text-[#8ea4bd] hover:text-[#e8edf2]'
              : 'border-[#333e4d] bg-[#0f161f]/60 text-[#a2998a] hover:text-[#f0ede6]'
          }`}
        >
          <span>Globe</span>
          <kbd
            className={`text-[8px] px-1 py-0.5 rounded-[1px] font-normal ${
              alpha < 0.03
                ? theme === 1
                  ? 'bg-white/20 text-[#fdfcf9]'
                  : 'bg-black/30 text-[#f5f8fc]'
                : theme === 1
                ? 'bg-[#eae0d2] text-[#5a4f3e]'
                : 'bg-white/10 text-current'
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
          className={`tactile-btn text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] transition-all shrink-0 border z-10 ${
            alpha > 0.97
              ? theme === 1
                ? 'bg-[#2b241a] text-[#fdfcf9] border-[#2b241a] shadow-sm'
                : theme === 2
                ? 'bg-[#254263] text-[#f5f8fc] border-[#4a729e] shadow-sm ring-1 ring-[#c5a059]/40 font-extrabold'
                : 'bg-[#22384a] text-[#f0ede6] border-[#3b788a] shadow-sm ring-1 ring-[#c5a059]/40 font-extrabold'
              : theme === 1
              ? 'border-[#d8cfbc] bg-[#f4eee1]/60 text-[#5a4f3e] hover:bg-[#ede3d4]'
              : theme === 2
              ? 'border-[#263c54] bg-[#101c2b]/60 text-[#8ea4bd] hover:text-[#e8edf2]'
              : 'border-[#333e4d] bg-[#0f161f]/60 text-[#a2998a] hover:text-[#f0ede6]'
          }`}
        >
          <span>Map</span>
          <kbd
            className={`text-[8px] px-1 py-0.5 rounded-[1px] font-normal ${
              alpha > 0.97
                ? theme === 1
                  ? 'bg-white/20 text-[#fdfcf9]'
                  : 'bg-black/30 text-[#f5f8fc]'
                : theme === 1
                ? 'bg-[#eae0d2] text-[#5a4f3e]'
                : 'bg-white/10 text-current'
            }`}
          >
            M
          </kbd>
        </button>

        <span
          className={`text-[9px] tabular-nums pl-2 border-l min-w-[3.25rem] text-right shrink-0 z-10 ${
            theme === 1
              ? 'text-[#7d715d] border-[#d8cfbc]'
              : theme === 2
              ? 'text-[#8ea4bd] border-[#263c54]'
              : 'text-[#a2998a] border-[#333e4d]'
          }`}
        >
          {alpha.toFixed(3)}
        </span>
      </div>

      {/* Legacy shortcut reference for contract compatibility: B: Backend */}
      <div
        className={`text-[9px] tracking-wide font-mono px-3 py-1 rounded-[2px] border backdrop-blur-md transition-colors z-20 pointer-events-none ${
          isLight
            ? 'text-zinc-900 bg-white/95 border-zinc-300 shadow-md font-semibold'
            : 'text-zinc-200 bg-black/60 border-white/15 shadow-md font-medium'
        }`}
      >
        Space: Play/Pause • G: Globe • M: Map • D: Style (A/B/C) • V: Vectors • 1-5: Paradigms • T: Theme • H: Zen
      </div>
    </div>
  );
};
