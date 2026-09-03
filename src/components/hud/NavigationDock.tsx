import React from 'react';

export interface NavigationDockProps {
  isZenMode: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  onToggleSpeed: () => void;
  alpha: number;
  onAlphaChange: (val: number) => void;
  onGlideToAlpha: (target: number) => void;
  theme: 0 | 1;
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
}) => {
  const isLight = theme === 1;

  if (isZenMode) return null;

  return (
    <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 z-10 pointer-events-none">
      <div
        className={`flex items-center gap-3 px-5 py-2.5 rounded-full backdrop-blur-xl shadow-2xl pointer-events-auto border transition-colors ${
          isLight
            ? 'bg-white/95 border-zinc-200 text-zinc-800 shadow-zinc-300/50'
            : 'bg-[#0F121A]/90 border-white/10 text-zinc-200'
        }`}
      >
        {/* Play/Pause Toggle */}
        <button
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause Morph (Space)' : 'Play Auto-Morph Loop (Space)'}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
            isPlaying
              ? isLight
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-black font-bold'
              : isLight
              ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              : 'bg-white/10 text-zinc-300 hover:bg-white/20'
          }`}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Playback Speed Multiplier */}
        <button
          onClick={onToggleSpeed}
          title="Toggle Auto-Morph Speed"
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
            isLight
              ? 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'
              : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
          }`}
        >
          {playbackSpeed}x
        </button>

        {/* Quick Snap to Globe (G) */}
        <button
          onClick={() => onGlideToAlpha(0.0)}
          title="Smooth glide to Spherical Globe (Press G)"
          className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
            alpha < 0.03
              ? isLight
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white text-black shadow-md font-extrabold'
              : isLight
              ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <span>Globe</span>
          <kbd
            className={`text-[8px] px-1 py-0.2 rounded font-mono font-normal ${
              alpha < 0.03
                ? isLight
                  ? 'bg-zinc-800 text-white'
                  : 'bg-black/20 text-black'
                : isLight
                ? 'bg-zinc-200 text-zinc-600'
                : 'bg-white/10 text-zinc-400'
            }`}
          >
            G
          </kbd>
        </button>

        {/* Unfurl Scrubbing Slider */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={alpha}
          onChange={(e) => onAlphaChange(parseFloat(e.target.value))}
          className={`w-44 sm:w-64 h-1.5 rounded-lg appearance-none cursor-pointer transition-colors ${
            isLight
              ? 'bg-zinc-200 accent-zinc-900 hover:bg-zinc-300'
              : 'bg-white/10 accent-[#EAE6DF] hover:bg-white/20'
          }`}
        />

        {/* Quick Snap to Map (M) */}
        <button
          onClick={() => onGlideToAlpha(1.0)}
          title="Smooth glide to Planar Map (Press M)"
          className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
            alpha > 0.97
              ? isLight
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white text-black shadow-md font-extrabold'
              : isLight
              ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <span>Map</span>
          <kbd
            className={`text-[8px] px-1 py-0.2 rounded font-mono font-normal ${
              alpha > 0.97
                ? isLight
                  ? 'bg-zinc-800 text-white'
                  : 'bg-black/20 text-black'
                : isLight
                ? 'bg-zinc-200 text-zinc-600'
                : 'bg-white/10 text-zinc-400'
            }`}
          >
            M
          </kbd>
        </button>

        <span
          className={`text-[9px] font-mono pl-2 border-l min-w-[3rem] ${
            isLight ? 'text-zinc-600 border-zinc-200' : 'text-zinc-400 border-white/10'
          }`}
        >
          {alpha.toFixed(3)}
        </span>
      </div>

      <div className="text-[9px] tracking-wide text-zinc-500 pointer-events-none">
        Space: Play/Pause • G: Globe • M: Map • V: Vectors • H: Zen Mode • 1-5: Paradigms • T: Theme • Drag/Scroll: Orbit
      </div>
    </div>
  );
};
