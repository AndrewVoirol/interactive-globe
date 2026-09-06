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
  theme: 0 | 1;
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
        className={`flex items-center gap-3 px-5 py-2 rounded-full backdrop-blur-xl shadow-2xl pointer-events-auto border transition-colors ${
          isLight
            ? 'bg-white/85 border-[#E2E8F0] text-zinc-800 shadow-zinc-300/50'
            : 'bg-[#0F121A]/85 border-white/10 text-zinc-200 shadow-black/60'
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
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors tabular-nums ${
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
            className={`text-[8px] px-1 py-0.2 rounded font-normal ${
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

        {/* Gaussian Curvature Unfurl Sextant Arc */}
        <CurvatureUnfurlSextant
          alpha={alpha}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={onGlideToAlpha}
          mode={mode}
          isLight={isLight}
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
            className={`text-[8px] px-1 py-0.2 rounded font-normal ${
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
          className={`text-[9px] tabular-nums pl-2 border-l min-w-[3.25rem] text-right ${
            isLight ? 'text-zinc-600 border-zinc-200' : 'text-zinc-400 border-white/10'
          }`}
        >
          {alpha.toFixed(3)}
        </span>

        {/* Direction Switcher (Directions A / B / C) */}
        {onSelectRenderStyle && (
          <div className={`flex items-center gap-1 pl-2 border-l ${isLight ? 'border-zinc-200' : 'border-white/10'}`}>
            <span className={`text-[9px] uppercase tracking-wider font-semibold mr-1 hidden sm:inline ${
              isLight ? 'text-zinc-400' : 'text-zinc-500'
            }`}>
              Style:
            </span>
            <button
              onClick={() => onSelectRenderStyle('architectural')}
              title="Direction A: Architectural Topo-Relief (Press 7)"
              className={`text-[9px] font-bold px-2 py-1 rounded-full transition-all flex items-center gap-1 outline-none focus:outline-none focus-visible:outline-none ${
                activeDirection === 'architectural'
                  ? isLight
                    ? 'bg-zinc-900 text-white shadow-sm font-extrabold'
                    : 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm font-extrabold'
                  : isLight
                  ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                  : 'text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>A</span>
              <span className="opacity-75 font-normal hidden md:inline">Relief</span>
            </button>
            <button
              onClick={() => onSelectRenderStyle('hybrid')}
              title="Direction B: Hydrosphere Dual-Surface Bathymetry (Press 8)"
              className={`text-[9px] font-bold px-2 py-1 rounded-full transition-all flex items-center gap-1 outline-none focus:outline-none focus-visible:outline-none ${
                activeDirection === 'hybrid'
                  ? isLight
                    ? 'bg-cyan-600 text-white shadow-sm font-extrabold'
                    : 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 shadow-sm font-extrabold'
                  : isLight
                  ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                  : 'text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>B</span>
              <span className="opacity-75 font-normal hidden md:inline">Depth</span>
            </button>
            <button
              onClick={() => onSelectRenderStyle('photoreal')}
              title="Direction C: NASA Blue Marble Orbital Photorealism (Press 9)"
              className={`text-[9px] font-bold px-2 py-1 rounded-full transition-all flex items-center gap-1 outline-none focus:outline-none focus-visible:outline-none ${
                activeDirection === 'photoreal'
                  ? isLight
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'bg-blue-500/25 text-blue-300 border border-blue-400/40 shadow-sm font-extrabold'
                  : isLight
                  ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                  : 'text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>C</span>
              <span className="opacity-75 font-normal hidden md:inline">Orbital</span>
            </button>
          </div>
        )}
      </div>

      <div
        className={`text-[9px] tracking-wide font-mono px-3 py-1 rounded-full backdrop-blur-md transition-colors z-20 pointer-events-none ${
          isLight
            ? 'text-zinc-900 bg-white/95 border border-zinc-300 shadow-md font-semibold'
            : 'text-zinc-200 bg-black/60 border border-white/15 shadow-md font-medium'
        }`}
      >
        Space: Play/Pause • G: Globe • M: Map • D: Style (A/B/C) • V: Vectors • B: Backend • 1-5: Paradigms • T: Theme • H: Zen
      </div>
    </div>
  );
};
