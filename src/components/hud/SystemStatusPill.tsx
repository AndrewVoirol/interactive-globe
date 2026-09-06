// ============================================================================
// File: src/components/hud/SystemStatusPill.tsx
// Modular Floating Widget A: Top-Left System & Execution Status Pill
// ============================================================================

import React from 'react';
import { ResolutionTier } from '../../types';

export interface SystemStatusPillProps {
  fps: number;
  backend: 'webgl2' | 'webgpu';
  onBackendChange: (b: 'webgl2' | 'webgpu') => void;
  hasWebGPU: boolean;
  resolution: ResolutionTier;
  onResolutionChange: (r: ResolutionTier) => void;
  theme: 0 | 1;
  onThemeToggle: () => void;
  isAudioMuted?: boolean;
  onAudioMuteToggle?: () => void;
  particleNodes?: '1.05M' | '4.19M' | number;
  isHighDensityNodes?: boolean;
}

export const TERRAIN_VERTICES: Record<ResolutionTier, string> = {
  '100k': '264K Verts',
  '1M': '1.05M Verts',
  '3M': '2.99M Verts',
  '4M': '4.20M Verts',
  '8M': '8.40M Verts',
  '16M': '16.78M Verts',
};

export const SystemStatusPill: React.FC<SystemStatusPillProps> = ({
  fps,
  backend,
  onBackendChange,
  hasWebGPU,
  resolution,
  onResolutionChange,
  theme,
  onThemeToggle,
  isAudioMuted = true,
  onAudioMuteToggle,
  particleNodes,
  isHighDensityNodes,
}) => {
  const isLight = theme === 1;

  const terrainVerts = TERRAIN_VERTICES[resolution] || '1.05M Verts';
  const computeNodes =
    particleNodes !== undefined
      ? typeof particleNodes === 'number'
        ? particleNodes >= 4000000
          ? '4.19M Nodes'
          : '1.05M Nodes'
        : String(particleNodes).includes('Nodes')
        ? String(particleNodes)
        : `${particleNodes} Nodes`
      : isHighDensityNodes || resolution === '4M' || resolution === '8M' || resolution === '16M'
      ? '4.19M Nodes'
      : '1.05M Nodes';

  return (
    <div className="fixed top-4 left-4 z-20 pointer-events-auto font-mono select-none transition-all duration-300 ease-out">
      <div
        className={`rounded-2xl border backdrop-blur-xl shadow-xl px-3.5 py-2 text-xs flex items-center gap-2.5 transition-all duration-300 ${
          isLight
            ? 'bg-white/90 border-zinc-200/80 text-zinc-800 shadow-zinc-200/50'
            : 'bg-[#0F121A]/90 border-white/10 text-zinc-300 shadow-black/60'
        }`}
      >
        {/* Live FPS Badge */}
        <div className="flex items-center gap-1.5 font-bold pr-2 border-r border-white/10">
          <span
            className={`w-2 h-2 rounded-full ${
              fps >= 100 ? 'bg-purple-400 animate-pulse' : fps >= 55 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          ></span>
          <span className={fps >= 100 ? 'text-purple-400 font-bold' : fps >= 55 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
            {fps} FPS
          </span>
        </div>

        {/* Dedicated WebGPU Instrument Badge (Retiring WebGL2 Switcher) */}
        <div
          title="Active Instrument: WebGPU WGSL Compute & Rendering"
          className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-purple-500/50 bg-purple-600/30 text-purple-200 flex items-center gap-1.5 shadow-[0_0_8px_rgba(168,85,247,0.3)] select-none shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
          <span>WebGPU</span>
        </div>

        {/* 3D Terrain Vertex Count & Active Particle Compute Nodes Telemetry */}
        <div
          className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-[9px] font-mono shrink-0 ${
            isLight ? 'bg-zinc-100 border-zinc-200 text-zinc-700' : 'bg-black/30 border-white/5 text-zinc-300'
          }`}
        >
          <span className="flex items-center gap-1" title="Dual-surface 3D terrain vertex mesh density">
            <span className="opacity-60 text-[8px] uppercase">Mesh:</span>
            <span className="text-purple-400 dark:text-purple-300 font-bold">{terrainVerts}</span>
          </span>
          <span className="text-white/20 font-light">|</span>
          <span className="flex items-center gap-1" title="Active WebGPU particle compute nodes">
            <span className="opacity-60 text-[8px] uppercase">Sim:</span>
            <span className="text-cyan-400 dark:text-cyan-300 font-bold">{computeNodes}</span>
          </span>
        </div>

        {/* Grid Resolution Switch */}
        <div className="flex items-center bg-black/20 rounded-lg p-0.5 border border-white/5 gap-0.5">
          {(['100k', '1M', '3M', '4M', '8M', '16M'] as ResolutionTier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => onResolutionChange(tier)}
              className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold transition-all ${
                resolution === tier
                  ? tier === '16M'
                    ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                    : tier === '1M' || tier === '4M'
                    ? 'bg-purple-600 text-white font-extrabold shadow-sm'
                    : isLight
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white/20 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tier.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Audio Mute Switch */}
        {onAudioMuteToggle && (
          <button
            onClick={onAudioMuteToggle}
            title={isAudioMuted ? 'Unmute Web Audio Synthesizer' : 'Mute Web Audio Synthesizer'}
            className={`p-1.5 rounded-lg border transition-all flex items-center ${
              !isAudioMuted
                ? isLight
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                  : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : isLight
                ? 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            {!isAudioMuted ? (
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.314M11 5L6 9H2v6h4l5 4V5z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
        )}

        {/* Theme Switch */}
        <button
          onClick={onThemeToggle}
          title={isLight ? 'Switch to Dark Cyber' : 'Switch to Light Monochrome'}
          className={`p-1.5 rounded-lg border transition-all flex items-center ${
            isLight
              ? 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
              : 'border-white/10 bg-white/5 text-zinc-300 hover:text-white'
          }`}
        >
          {isLight ? (
            <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 2.78a1 1 0 011.415 0l.707.707a1 1 0 01-1.414 1.415l-.707-.707a1 1 0 010-1.415zM17 9a1 1 0 100 2h1a1 1 0 100-2h-1zm-2.78 6.22a1 1 0 010 1.415l-.707.707a1 1 0 01-1.415-1.414l.707-.707a1 1 0 011.414 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.56 14.78a1 1 0 01-1.415 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1zm2.78-6.22a1 1 0 011.415 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.415z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-sky-300" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};
