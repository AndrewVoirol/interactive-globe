import React, { useState } from 'react';
import { SimulationMode, GeodesicOverlayMode } from '../../types';

export interface LoadedDataInfo {
  pointCount: number;
  lineCount: number;
  format: string;
  loadTimeMs: number;
  vramMb: number;
}

export interface TelemetryHUDProps {
  isZenMode: boolean;
  onZenToggle: () => void;
  theme: 0 | 1;
  onThemeToggle: () => void;
  backend: 'webgl2' | 'webgpu';
  onBackendChange: (b: 'webgl2' | 'webgpu') => void;
  hasWebGPU: boolean;
  resolution: '100k' | '1M';
  onResolutionChange: (r: '100k' | '1M') => void;
  layerMode: 0 | 1 | 2;
  onLayerModeChange: (l: 0 | 1 | 2) => void;
  mode: SimulationMode;
  onModeChange: (m: SimulationMode) => void;
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
  alpha: number;
  fps: number;
  latStr: string;
  lonStr: string;
  mapScaleStr: string;
  dataInfo: LoadedDataInfo;
  onSnapCamera: (v: 'equator' | 'pole' | 'seam' | 'isometric') => void;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({
  isZenMode,
  onZenToggle,
  theme,
  onThemeToggle,
  backend,
  onBackendChange,
  hasWebGPU,
  resolution,
  onResolutionChange,
  layerMode,
  onLayerModeChange,
  mode,
  onModeChange,
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
  alpha,
  fps,
  latStr,
  lonStr,
  mapScaleStr,
  dataInfo,
  onSnapCamera,
}) => {
  const [isHudOpen, setIsHudOpen] = useState(true);
  const isLight = theme === 1;

  if (isZenMode) return null;

  // Scientific metrics computation
  const RADIUS = 5.0;
  const originRadiusLinear = (RADIUS * (1.0 - alpha)).toFixed(2);
  const originRadiusScroll = RADIUS.toFixed(2);
  const sagPercent = mode === 0 ? ((1.0 - (1.0 - alpha)) * 100).toFixed(1) : '0.0';

  const tRupture = 0.18;
  const gRatio = alpha < tRupture ? alpha / tRupture : 1.0;
  const isCrackActive = alpha >= tRupture && alpha < 0.65;
  const isRelaxed = alpha >= 0.65;

  const liquefactionRatio = Math.pow(Math.sin(Math.PI * alpha), 1.15);
  const reynoldsNumber = Math.round(liquefactionRatio * 4200);
  const isTurbulent = alpha >= 0.12 && alpha < 0.88;
  const isCondensing = alpha >= 0.88;

  return (
    <div className="absolute top-4 right-4 z-20 pointer-events-auto max-w-sm w-96">
      <div
        className={`rounded-2xl border backdrop-blur-xl shadow-2xl p-4 text-xs font-mono transition-all duration-300 ${
          isLight
            ? 'bg-white/85 border-zinc-200 text-zinc-800 shadow-zinc-200/50'
            : 'bg-[#0F121A]/85 border-white/10 text-zinc-300'
        }`}
      >
        {/* HUD Header */}
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-zinc-200' : 'border-white/10'}`}>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                backend === 'webgpu'
                  ? 'bg-purple-400'
                  : isLight
                  ? 'bg-zinc-800'
                  : mode === 4
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
            <span
              className={`text-[11px] font-bold tracking-wider uppercase ${
                isLight
                  ? 'text-zinc-900'
                  : backend === 'webgpu'
                  ? 'text-purple-300'
                  : mode === 4
                  ? 'text-emerald-300'
                  : mode === 3
                  ? 'text-indigo-300'
                  : mode === 2
                  ? 'text-[#E08A6F]'
                  : mode === 1
                  ? 'text-zinc-200'
                  : 'text-amber-300'
              }`}
            >
              {backend === 'webgpu'
                ? resolution === '1M'
                  ? 'Indicatrix // 1M WebGPU (120 FPS)'
                  : 'Indicatrix // WebGPU Compute'
                : resolution === '1M'
                ? 'Indicatrix // 1M Matrix'
                : 'Indicatrix // Volumetric Matrix'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onZenToggle}
              title="Zen Presentation Mode: Hide chrome (Press H to toggle)"
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                isLight
                  ? 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:border-white/20'
              }`}
            >
              Zen
            </button>
            <button
              onClick={onThemeToggle}
              title={isLight ? 'Switch to Obsidian & Platinum' : 'Switch to Light Monochrome'}
              className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                isLight
                  ? 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  : 'border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:border-white/20'
              }`}
            >
              {isLight ? '● Light' : '○ Obsidian'}
            </button>
            <button
              onClick={() => setIsHudOpen(!isHudOpen)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                isLight
                  ? 'border-zinc-300 text-zinc-600 hover:text-zinc-900'
                  : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
              }`}
            >
              {isHudOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {isHudOpen && (
          <div className="mt-3 flex flex-col gap-3">
            {/* Cartographic Coordinate & Scale Telemetry */}
            <div
              className={`p-2 rounded-xl border text-[10px] flex items-center justify-between ${
                isLight ? 'bg-zinc-100/70 border-zinc-200 text-zinc-700' : 'bg-white/[0.03] border-white/10 text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-zinc-800' : 'bg-emerald-400'}`}></span>
                <span className="font-bold tracking-wider">{latStr} {lonStr}</span>
              </div>
              <div className="flex items-center gap-1 text-[9px]">
                <span className={isLight ? 'text-zinc-400' : 'text-zinc-500'}>SCALE</span>
                <span className={`font-semibold ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>{mapScaleStr}</span>
              </div>
            </div>

            {/* Engine Backend Selector (WebGL2 vs WebGPU) */}
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <span>Engine Backend</span>
                <span className={`font-bold ${isLight ? (backend === 'webgpu' ? 'text-purple-700' : 'text-zinc-900') : (backend === 'webgpu' ? 'text-purple-300' : 'text-zinc-200')}`}>
                  {backend === 'webgpu' ? 'WebGPU (120 FPS Compute)' : 'WebGL2 (Rasterizer)'}
                </span>
              </div>
              <div className={`grid grid-cols-2 gap-1 p-1 rounded-xl border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-white/[0.03] border-white/10'}`}>
                <button
                  onClick={() => onBackendChange('webgl2')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    backend === 'webgl2'
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-white/15 text-white border border-white/20 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  WebGL2
                </button>
                <button
                  onClick={() => {
                    if (hasWebGPU) onBackendChange('webgpu');
                  }}
                  disabled={!hasWebGPU}
                  title={hasWebGPU ? 'Dedicated WGSL Compute Pipeline' : 'WebGPU Unsupported on this device/browser'}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    backend === 'webgpu'
                      ? isLight
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-sm'
                      : hasWebGPU
                      ? isLight
                        ? 'text-zinc-600 hover:text-purple-700'
                        : 'text-zinc-400 hover:text-purple-300'
                      : 'text-zinc-600 cursor-not-allowed opacity-40'
                  }`}
                >
                  WebGPU {hasWebGPU ? '(120 FPS)' : '(N/A)'}
                </button>
              </div>
            </div>

            {/* Matrix Resolution Selector (100k vs 1M) */}
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <span>Matrix Density</span>
                <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-emerald-400'}`}>{resolution} Nodes</span>
              </div>
              <div className={`grid grid-cols-2 gap-1 p-1 rounded-xl border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-white/[0.03] border-white/10'}`}>
                <button
                  onClick={() => onResolutionChange('100k')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    resolution === '100k'
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-white/15 text-white border border-white/20 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  100,000 Nodes
                </button>
                <button
                  onClick={() => onResolutionChange('1M')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    resolution === '1M'
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  1,000,000 Nodes
                </button>
              </div>
            </div>

            {/* Display Layer Selector */}
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <span>Display Layer</span>
                <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>
                  {layerMode === 0 ? 'Both' : layerMode === 1 ? 'Points Only' : 'Wireframe Only'}
                </span>
              </div>
              <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-white/[0.03] border-white/10'}`}>
                <button
                  onClick={() => onLayerModeChange(0)}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    layerMode === 0
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-white/15 text-white border border-white/20 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Both
                </button>
                <button
                  onClick={() => onLayerModeChange(1)}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    layerMode === 1
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-white/15 text-white border border-white/20 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Points
                </button>
                <button
                  onClick={() => onLayerModeChange(2)}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    layerMode === 2
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-white/15 text-white border border-white/20 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Wireframe
                </button>
              </div>
            </div>

            {/* Cursor Interaction Toggle */}
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <span>Cursor Interaction</span>
                <span className={`font-bold ${cursorPhysicsEnabled ? (isLight ? 'text-purple-700' : 'text-purple-300') : 'text-zinc-500'}`}>
                  {cursorPhysicsEnabled ? 'Active (Experimental)' : 'Off (Smooth Scrub)'}
                </span>
              </div>
              <div className={`grid grid-cols-2 gap-1 p-1 rounded-xl border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-white/[0.03] border-white/10'}`}>
                <button
                  onClick={() => onCursorPhysicsToggle(false)}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    !cursorPhysicsEnabled
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-white/15 text-white border border-white/20 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Off (Default)
                </button>
                <button
                  onClick={() => onCursorPhysicsToggle(true)}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                    cursorPhysicsEnabled
                      ? isLight
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-sm'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  On (Tactile)
                </button>
              </div>
            </div>

            {/* Geodesic & Cartographic Overlays */}
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <span>Geodesic Arcs</span>
                <span className={`font-bold ${activeOverlay !== 'off' ? (isLight ? 'text-sky-700' : 'text-sky-300') : 'text-zinc-500'}`}>
                  {activeOverlay === 'antipodes' ? 'Antipodal Bridges' : activeOverlay === 'conveyor' ? 'Ocean Conveyor' : activeOverlay === 'migration' ? 'Pelagic Migrations' : 'Off'}
                </span>
              </div>
              <div className={`grid grid-cols-4 gap-1 p-1 rounded-xl border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-white/[0.03] border-white/10'}`}>
                <button
                  onClick={() => onOverlayChange('off')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'off'
                      ? isLight
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                        : 'bg-white/15 text-white border border-white/20'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Off
                </button>
                <button
                  onClick={() => onOverlayChange('antipodes')}
                  title="Antipodal pairs through Earth's core"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'antipodes'
                      ? isLight
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-rose-600'
                      : 'text-zinc-400 hover:text-rose-300'
                  }`}
                >
                  Antipodes
                </button>
                <button
                  onClick={() => onOverlayChange('conveyor')}
                  title="Thermohaline Deep Ocean Circulation"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'conveyor'
                      ? isLight
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-sky-500/25 text-sky-300 border border-sky-500/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-sky-600'
                      : 'text-zinc-400 hover:text-sky-300'
                  }`}
                >
                  Conveyor
                </button>
                <button
                  onClick={() => onOverlayChange('migration')}
                  title="11,000 km Non-stop Pelagic Migration"
                  className={`py-1 px-1 rounded-lg text-[9px] font-bold transition-all text-center ${
                    activeOverlay === 'migration'
                      ? isLight
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                      : isLight
                      ? 'text-zinc-600 hover:text-amber-600'
                      : 'text-zinc-400 hover:text-amber-300'
                  }`}
                >
                  Migration
                </button>
              </div>
            </div>

            {/* Cartographic Features: Landmarks, Tissot, and Vectors */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={onLandmarksToggle}
                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1 ${
                  showLandmarks
                    ? isLight
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                      : 'bg-white/15 text-white border-white/20 shadow-sm'
                    : isLight
                    ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                    : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showLandmarks ? 'bg-emerald-400' : 'bg-zinc-600'}`}></span>
                <span>Landmarks</span>
              </button>
              <button
                onClick={onTissotToggle}
                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1 ${
                  showTissot
                    ? isLight
                      ? 'bg-purple-700 text-white border-purple-700 shadow-sm'
                      : 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-sm'
                    : isLight
                    ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-purple-700'
                    : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-purple-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showTissot ? 'bg-purple-400 animate-pulse' : 'bg-zinc-600'}`}></span>
                <span>Tissot</span>
              </button>
              <button
                onClick={onVectorsToggle}
                title="Toggle High-Precision Vector Coastlines & Waterways (Press V)"
                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1 ${
                  showVectors
                    ? isLight
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                      : 'bg-white/20 text-white border-white/30 shadow-sm font-extrabold'
                    : isLight
                    ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                    : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showVectors ? 'bg-amber-400' : 'bg-zinc-600'}`}></span>
                <span>Vectors (V)</span>
              </button>
            </div>

            {/* Tissot Indicatrix Live Deformation Telemetry */}
            {showTissot && (
              <div
                className={`p-2.5 rounded-xl border font-mono text-[10px] space-y-1.5 transition-all ${
                  isLight ? 'bg-purple-50/70 border-purple-200 text-zinc-800' : 'bg-purple-950/20 border-purple-500/30 text-purple-200'
                }`}
              >
                <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Distortion Metric Tensor
                  </span>
                  <span className={mode === 4 ? 'text-emerald-400' : 'text-amber-400'}>
                    {mode === 4 ? 'Isomeric (s ≈ 1.04x)' : mode === 1 ? 'Conformal Polar Dilation' : 'Morphing Tensor'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px]">
                  <div>
                    <span className="text-zinc-500 block">Equatorial Area (0°):</span>
                    <span className="font-bold text-emerald-400">s = 1.00x (Preserved)</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Polar Dilation (60°N):</span>
                    <span className={`font-bold ${mode === 4 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {mode === 4 ? 's = 1.04x (Preserved)' : `s = ${(1.0 + alpha * 3.0).toFixed(2)}x (Expanded)`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 5-Way Simulation Paradigm Selector */}
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1.5 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <span>Simulation Paradigm</span>
                <span
                  className={`font-bold ${
                    isLight
                      ? 'text-zinc-900'
                      : mode === 4
                      ? 'text-emerald-400'
                      : mode === 3
                      ? 'text-indigo-400'
                      : mode === 2
                      ? 'text-[#E08A6F]'
                      : mode === 1
                      ? 'text-zinc-200'
                      : 'text-amber-400'
                  }`}
                >
                  {mode === 4 ? 'Fuller Dymaxion' : mode === 3 ? 'Fluid Flow' : mode === 2 ? 'Griffith LEFM' : mode === 1 ? 'Cylindrical Scroll' : 'Linear Mix'}
                </span>
              </div>
              <div className={`grid grid-cols-5 gap-1 p-1 rounded-xl border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-white/[0.03] border-white/10'}`}>
                {(['Linear', 'Scroll', 'Griffith', 'Fluid', 'Dymaxion'] as const).map((name, idx) => (
                  <button
                    key={name}
                    onClick={() => onModeChange(idx as SimulationMode)}
                    className={`py-1.5 px-0.5 rounded-lg text-[9px] font-bold tracking-tight transition-all text-center ${
                      mode === idx
                        ? isLight
                          ? 'bg-white text-zinc-900 shadow-sm border border-zinc-300'
                          : 'bg-white/20 text-white border border-white/30 shadow-sm'
                        : isLight
                        ? 'text-zinc-600 hover:text-zinc-900'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Metric Card based on Active Paradigm */}
            {mode === 4 ? (
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/10'}`}>
                <div className="flex justify-between items-center text-[10px]">
                  <span className={isLight ? 'text-zinc-600' : 'text-zinc-400'}>Icosahedral Hinge Unfolding:</span>
                  <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                    {alpha < 0.05 ? 'Closed Polyhedron (0°)' : alpha > 0.95 ? 'Planar Net (41.8°)' : `Hinging (${(alpha * 41.81).toFixed(1)}°)`}
                  </span>
                </div>
                <div className={`w-full h-1.5 rounded-full mt-2 overflow-hidden ${isLight ? 'bg-zinc-200' : 'bg-white/10'}`}>
                  <div
                    className="h-full transition-all duration-150 bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400"
                    style={{ width: `${alpha * 100}%` }}
                  ></div>
                </div>
                <div className={`text-[9px] mt-1.5 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  <span>Buckminster Fuller Net: 20 Facets</span>
                  <span className="font-semibold text-emerald-400">Distortion &lt; 1.05x</span>
                </div>
              </div>
            ) : mode === 3 ? (
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/10'}`}>
                <div className="flex justify-between items-center text-[10px]">
                  <span className={isLight ? 'text-zinc-600' : 'text-zinc-400'}>Hydrodynamic Flow (Re):</span>
                  <span className={`font-bold ${isLight ? 'text-zinc-900' : isCondensing ? 'text-emerald-400' : isTurbulent ? 'text-indigo-400 animate-pulse' : 'text-zinc-300'}`}>
                    {isCondensing ? 'Planar Freeze (Re → 0)' : isTurbulent ? `Turbulent (Re ≈ ${reynoldsNumber})` : 'Solid Crystal (Re ≈ 0)'}
                  </span>
                </div>
                <div className={`w-full h-1.5 rounded-full mt-2 overflow-hidden ${isLight ? 'bg-zinc-200' : 'bg-white/10'}`}>
                  <div
                    className="h-full transition-all duration-150 bg-indigo-500"
                    style={{ width: isCondensing ? '100%' : `${liquefactionRatio * 100}%` }}
                  ></div>
                </div>
                <div className={`text-[9px] mt-1.5 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  <span>Field: 3D Curl-Noise (div u = 0)</span>
                  <span>{isTurbulent ? 'Vortices Active' : isCondensing ? 'Laminarizing' : 'Quiescent'}</span>
                </div>
              </div>
            ) : mode === 2 ? (
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/10'}`}>
                <div className="flex justify-between items-center text-[10px]">
                  <span className={isLight ? 'text-zinc-600' : 'text-zinc-400'}>Griffith Energy Release:</span>
                  <span className={`font-bold ${isLight ? 'text-zinc-900' : isRelaxed ? 'text-emerald-400' : isCrackActive ? 'text-[#C86D51] animate-pulse' : 'text-amber-400'}`}>
                    {isRelaxed ? 'Relaxed (G/Gc ≈ 0)' : isCrackActive ? 'G ≥ Gc (Rupture Active)' : `Pre-Strain (G/Gc = ${gRatio.toFixed(2)})`}
                  </span>
                </div>
                <div className={`w-full h-1.5 rounded-full mt-2 overflow-hidden ${isLight ? 'bg-zinc-200' : 'bg-white/10'}`}>
                  <div
                    className="h-full transition-all duration-150 bg-[#C86D51]"
                    style={{ width: isRelaxed ? '100%' : `${gRatio * 100}%` }}
                  ></div>
                </div>
                <div className={`text-[9px] mt-1.5 flex justify-between ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  <span>Seam: Antimeridian (180°)</span>
                  <span>{isCrackActive ? 'Acoustic Flutter' : isRelaxed ? 'Conformal Sheet' : 'Tensile Tension'}</span>
                </div>
              </div>
            ) : (
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/10'}`}>
                <div className="flex justify-between items-center text-[10px]">
                  <span className={isLight ? 'text-zinc-600' : 'text-zinc-400'}>Radial Volume Collapse:</span>
                  <span className={`font-bold ${isLight ? 'text-zinc-900' : mode === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {mode === 0 ? `-${sagPercent}% Sag (R = ${originRadiusLinear})` : `0.0% Sag (R ≡ ${originRadiusScroll})`}
                  </span>
                </div>
                <div className={`w-full h-1.5 rounded-full mt-2 overflow-hidden ${isLight ? 'bg-zinc-200' : 'bg-white/10'}`}>
                  <div
                    className="h-full transition-all duration-200 bg-white/40"
                    style={{ width: mode === 0 ? `${(1.0 - alpha) * 100}%` : '100%' }}
                  ></div>
                </div>
              </div>
            )}

            {/* Buffer & VRAM Telemetry */}
            <div className={`p-2 rounded-xl border text-[10px] flex flex-col gap-1 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/10'}`}>
              <div className="flex justify-between">
                <span className="text-zinc-500">Payload Format:</span>
                <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-emerald-400'}`}>{dataInfo.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Buffer Load Time:</span>
                <span className="font-mono">{dataInfo.loadTimeMs} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">VRAM Allocation:</span>
                <span className="font-mono font-bold text-zinc-200">{dataInfo.vramMb} MB</span>
              </div>
            </div>

            {/* Live Framerate & Vertices */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className={`p-2 rounded-xl border flex flex-col ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/10'}`}>
                <span className="text-zinc-500">Live Framerate</span>
                <span className={`text-base font-bold mt-0.5 ${fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                  {fps} <span className="text-[10px] font-normal text-zinc-500">FPS</span>
                </span>
              </div>
              <div className={`p-2 rounded-xl border flex flex-col ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/10'}`}>
                <span className="text-zinc-500">Point Vertices</span>
                <span className="text-base font-bold mt-0.5 flex items-baseline gap-1 text-zinc-200">
                  {dataInfo.pointCount.toLocaleString()}
                  <span className="text-[9px] font-normal text-zinc-500">1x</span>
                </span>
                <span className="text-[8px] text-zinc-500">RTC Precision Active</span>
              </div>
            </div>

            {/* Viewport Camera Snaps */}
            <div>
              <span className="text-[10px] block mb-1.5 uppercase tracking-wider text-zinc-500">Inspect Topology</span>
              <div className="grid grid-cols-4 gap-1">
                {(['equator', 'seam', 'pole', 'isometric'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => onSnapCamera(view)}
                    className={`py-1 px-1 rounded-lg text-[9px] transition-colors text-center border ${
                      isLight
                        ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-700'
                        : 'bg-white/[0.03] hover:bg-white/10 border-white/10 text-zinc-300'
                    }`}
                  >
                    {view === 'equator' ? 'Equator' : view === 'seam' ? 'Seam 180°' : view === 'pole' ? 'North Pole' : 'Perspective'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
