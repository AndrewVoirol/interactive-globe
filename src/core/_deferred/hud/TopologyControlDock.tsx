// ============================================================================
// File: src/components/hud/TopologyControlDock.tsx
// Modular Floating Widget B: Top-Right Topology & Paradigm Control Dock
// ============================================================================

import React, { useState } from 'react';
import { SimulationMode, GeodesicOverlayMode } from '../../types';

export interface TopologyControlDockProps {
  isZenMode: boolean;
  onZenToggle: () => void;
  theme: 0 | 1;
  mode: SimulationMode;
  onModeChange: (m: SimulationMode) => void;
  layerMode: 0 | 1 | 2;
  onLayerModeChange: (l: 0 | 1 | 2) => void;
  cursorPhysicsEnabled: boolean;
  onCursorPhysicsToggle: (enabled: boolean) => void;
  activeOverlay: GeodesicOverlayMode;
  onOverlayChange: (o: GeodesicOverlayMode) => void;
  showLandmarks: boolean;
  onLandmarksToggle: () => void;
  showTissot: boolean;
  onTissotToggle: () => void;
  showVectors: boolean;
  onVectorsToggle: () => void;
  latStr: string;
  lonStr: string;
  mapScaleStr: string;
  onSnapCamera: (v: 'equator' | 'pole' | 'seam' | 'isometric') => void;
}

export const TopologyControlDock: React.FC<TopologyControlDockProps> = ({
  isZenMode,
  onZenToggle,
  theme,
  mode,
  onModeChange,
  layerMode,
  onLayerModeChange,
  cursorPhysicsEnabled,
  onCursorPhysicsToggle,
  activeOverlay,
  onOverlayChange,
  showLandmarks,
  onLandmarksToggle,
  showTissot,
  onTissotToggle,
  showVectors,
  onVectorsToggle,
  latStr,
  lonStr,
  mapScaleStr,
  onSnapCamera,
}) => {
  const [isDockOpen, setIsDockOpen] = useState(true);
  const isLight = theme === 1;

  if (isZenMode) return null;

  return (
    <div className="fixed top-4 right-4 z-20 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-300 ease-out">
      <div
        className={`rounded-2xl border backdrop-blur-xl shadow-2xl p-4 text-xs transition-all duration-300 ${
          isLight
            ? 'bg-white/90 border-zinc-200/80 text-zinc-800 shadow-zinc-200/50'
            : 'bg-[#0F121A]/90 border-white/10 text-zinc-300 shadow-black/60'
        }`}
      >
        {/* Dock Header */}
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-zinc-200' : 'border-white/10'}`}>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                mode === 4
                  ? 'bg-emerald-400'
                  : mode === 3
                  ? 'bg-indigo-400'
                  : mode === 2
                  ? 'bg-[#C86D51]'
                  : mode === 1
                  ? 'bg-slate-300'
                  : 'bg-amber-400'
              } animate-pulse`}
            ></span>
            <span className={`text-[11px] font-bold tracking-wider uppercase ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>
              INDICATRIX // TOPOLOGY CONTROL
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onZenToggle}
              title="Zen Presentation Mode (Press H)"
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                isLight
                  ? 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              Zen
            </button>
            <button
              onClick={() => setIsDockOpen(!isDockOpen)}
              className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                isLight
                  ? 'border-zinc-300 text-zinc-600 hover:text-zinc-900'
                  : 'border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              {isDockOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {isDockOpen && (
          <div className="mt-3 space-y-3">
            {/* Simulation Paradigms (Modes 0–4) */}
            <div className="space-y-1.5">
              <div className={`text-[10px] uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Morph Paradigm (1–5)
              </div>
              <div className="grid grid-cols-5 gap-1">
                <button
                  onClick={() => onModeChange(0)}
                  title="Mode 0: Standard Linear Spherical-to-Planar Interpolation"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    mode === 0
                      ? isLight
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-amber-500/30 text-amber-200 border border-amber-500/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-amber-600'
                      : 'text-zinc-400 hover:text-amber-300'
                  }`}
                >
                  Linear
                </button>
                <button
                  onClick={() => onModeChange(1)}
                  title="Mode 1: Cylindrical Unrolling along Mercator Longitudinal Seam"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    mode === 1
                      ? isLight
                        ? 'bg-slate-700 text-white shadow-sm'
                        : 'bg-slate-300/30 text-slate-100 border border-slate-400/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-slate-800'
                      : 'text-zinc-400 hover:text-slate-200'
                  }`}
                >
                  Scroll
                </button>
                <button
                  onClick={() => onModeChange(2)}
                  title="Mode 2: Griffith Linear Elastic Fracture Mechanics Rupture"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    mode === 2
                      ? isLight
                        ? 'bg-[#C86D51] text-white shadow-sm'
                        : 'bg-[#C86D51]/30 text-[#E08A6F] border border-[#C86D51]/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-[#C86D51]'
                      : 'text-zinc-400 hover:text-[#E08A6F]'
                  }`}
                >
                  Griffith
                </button>
                <button
                  onClick={() => onModeChange(3)}
                  title="Mode 3: Hydrodynamic Liquefaction & Navier-Stokes Turbulent Flow"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    mode === 3
                      ? isLight
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-indigo-600'
                      : 'text-zinc-400 hover:text-indigo-300'
                  }`}
                >
                  Fluid
                </button>
                <button
                  onClick={() => onModeChange(4)}
                  title="Mode 4: Buckminster Fuller Dymaxion 20-Facet Icosahedral Unfolding"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    mode === 4
                      ? isLight
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-emerald-600'
                      : 'text-zinc-400 hover:text-emerald-300'
                  }`}
                >
                  Dymaxion
                </button>
              </div>
            </div>

            {/* View Mode & Cursor Dynamics */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5 border border-white/5">
                <button
                  onClick={() => onLayerModeChange(0)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                    layerMode === 0 ? (isLight ? 'bg-zinc-900 text-white' : 'bg-white/20 text-white') : 'text-zinc-400'
                  }`}
                >
                  Both
                </button>
                <button
                  onClick={() => onLayerModeChange(1)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                    layerMode === 1 ? (isLight ? 'bg-zinc-900 text-white' : 'bg-white/20 text-white') : 'text-zinc-400'
                  }`}
                >
                  Points
                </button>
                <button
                  onClick={() => onLayerModeChange(2)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                    layerMode === 2 ? (isLight ? 'bg-zinc-900 text-white' : 'bg-white/20 text-white') : 'text-zinc-400'
                  }`}
                >
                  Wire
                </button>
              </div>

              <button
                onClick={() => onCursorPhysicsToggle(!cursorPhysicsEnabled)}
                className={`py-1 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5 ${
                  cursorPhysicsEnabled
                    ? isLight
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : isLight
                    ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:text-zinc-800'
                    : 'bg-white/[0.02] border-white/10 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cursorPhysicsEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}></span>
                <span>Cursor Physics</span>
              </button>
            </div>

            {/* Geodesic & Overlay Modes */}
            <div className="space-y-1.5">
              <div className={`text-[10px] uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Geodesic Arcs & Overlays
              </div>
              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => onOverlayChange('off')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'off' ? (isLight ? 'bg-zinc-800 text-white' : 'bg-white/20 text-white') : 'text-zinc-400'
                  }`}
                >
                  Off
                </button>
                <button
                  onClick={() => onOverlayChange('antipodes')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'antipodes' ? (isLight ? 'bg-rose-600 text-white' : 'bg-rose-500/25 text-rose-300') : 'text-zinc-400'
                  }`}
                >
                  Antipodes
                </button>
                <button
                  onClick={() => onOverlayChange('conveyor')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'conveyor' ? (isLight ? 'bg-sky-600 text-white' : 'bg-sky-500/25 text-sky-300') : 'text-zinc-400'
                  }`}
                >
                  Conveyor
                </button>
                <button
                  onClick={() => onOverlayChange('migration')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'migration' ? (isLight ? 'bg-amber-600 text-white' : 'bg-amber-500/25 text-amber-300') : 'text-zinc-400'
                  }`}
                >
                  Migration
                </button>
              </div>
            </div>

            {/* Cartographic Features & Camera Snaps */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={onLandmarksToggle}
                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1 ${
                  showLandmarks ? (isLight ? 'bg-zinc-900 text-white' : 'bg-white/15 text-white') : 'text-zinc-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showLandmarks ? 'bg-emerald-400' : 'bg-zinc-600'}`}></span>
                <span>Landmarks</span>
              </button>
              <button
                onClick={onTissotToggle}
                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1 ${
                  showTissot ? (isLight ? 'bg-purple-700 text-white' : 'bg-purple-500/25 text-purple-200') : 'text-zinc-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showTissot ? 'bg-purple-400 animate-pulse' : 'bg-zinc-600'}`}></span>
                <span>Tissot</span>
              </button>
              <button
                onClick={onVectorsToggle}
                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1 ${
                  showVectors ? (isLight ? 'bg-zinc-900 text-white' : 'bg-white/20 text-white') : 'text-zinc-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showVectors ? 'bg-amber-400' : 'bg-zinc-600'}`}></span>
                <span>Vectors (V)</span>
              </button>
            </div>

            {/* Camera Snaps */}
            <div className="space-y-1">
              <div className={`text-[9px] uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>Camera Target Snap</div>
              <div className="grid grid-cols-4 gap-1 text-[9px] font-bold">
                <button onClick={() => onSnapCamera('equator')} className="py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10">Equator</button>
                <button onClick={() => onSnapCamera('pole')} className="py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10">North Pole</button>
                <button onClick={() => onSnapCamera('seam')} className="py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10">Seam (0°)</button>
                <button onClick={() => onSnapCamera('isometric')} className="py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10">Isometric</button>
              </div>
            </div>

            {/* Tissot Telemetry */}
            {showTissot && (
              <div className={`p-2.5 rounded-xl border text-[10px] space-y-1.5 tabular-nums ${isLight ? 'bg-purple-50/70 border-purple-200 text-zinc-800' : 'bg-purple-950/20 border-purple-500/30 text-purple-200'}`}>
                <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold">
                  <span>Distortion Tensor</span>
                  <span className="text-emerald-400">{mode === 4 ? 'Isomeric (s ≈ 1.04x)' : 'Morphing Tensor'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px]">
                  <div><span className="text-zinc-500 block">Equatorial Area:</span><span>1.000x</span></div>
                  <div><span className="text-zinc-500 block">Polar Dilation:</span><span>{mode === 4 ? '1.041x' : '1.000x'}</span></div>
                </div>
              </div>
            )}

            {/* Telemetry Footer */}
            <div className={`pt-2 border-t text-[9px] grid grid-cols-2 gap-2 tabular-nums ${isLight ? 'border-zinc-200 text-zinc-500' : 'border-white/10 text-zinc-400'}`}>
              <div><span className="block text-[8px] uppercase tracking-wider text-zinc-500">Center Coordinate</span><span className="font-bold">{latStr} {lonStr}</span></div>
              <div className="text-right"><span className="block text-[8px] uppercase tracking-wider text-zinc-500">Nominal Scale</span><span className="font-bold">{mapScaleStr}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
