// ============================================================================
// File: src/components/hud/UnifiedRightSidebar.tsx
// Unified Right Sidebar: Engine Status + Topology Controls + Data Layers + Slide-out Catalog
// Unmistakable active/selected visual contrast for all modes, buttons, and switches
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { SimulationMode, GeodesicOverlayMode, LoadedDataInfo, ResolutionTier } from '../../types';
import { DATA_LAYER_CATALOG, BlendModeType, getPresetById, DataLayerRenderStyle } from '../../core/data/DataLayerCatalog';
import { DataLayerItem } from './DataLayersDrawer';
import { Sun, Moon } from 'lucide-react';
import { PolarSunCompass } from './instruments/PolarSunCompass';
import { HypsometricReliefCurve } from './instruments/HypsometricReliefCurve';
import { BathymetricTideGauge } from './instruments/BathymetricTideGauge';

export interface UnifiedRightSidebarProps {
  isZenMode: boolean;
  onZenToggle: () => void;
  theme: 0 | 1;
  onThemeToggle: () => void;
  backend: 'webgl2' | 'webgpu';
  onBackendChange: (b: 'webgl2' | 'webgpu') => void;
  hasWebGPU: boolean;
  resolution: ResolutionTier;
  onResolutionChange: (r: ResolutionTier) => void;
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
  dataInfo?: LoadedDataInfo;
  onSnapCamera: (v: 'equator' | 'pole' | 'seam' | 'isometric') => void;
  isAudioMuted?: boolean;
  onAudioMuteToggle?: () => void;
  dataLayers?: DataLayerItem[];
  onAddDataLayer?: (layer: DataLayerItem) => void;
  onToggleDataLayer?: (id: string) => void;
  onRemoveDataLayer?: (id: string) => void;
  onOpacityChangeDataLayer?: (id: string, opacity: number) => void;
  onBlendModeChangeDataLayer?: (id: string, blendMode: BlendModeType) => void;
  onDisplacementScaleChangeDataLayer?: (id: string, scale: number) => void;
  onHillshadeChangeDataLayer?: (id: string, azimuth: number, intensity: number, altitude?: number) => void;
  onSeaLevelOffsetChangeDataLayer?: (id: string, offset: number) => void;
  onWaterClarityChangeDataLayer?: (id: string, clarity: number) => void;
  onPeakExponentChangeDataLayer?: (id: string, exponent: number) => void;
  onAmbientOcclusionChangeDataLayer?: (id: string, ao: number) => void;
  onReorderDataLayer?: (id: string, direction: 'up' | 'down') => void;
  onSelectRenderStyle?: (style: DataLayerRenderStyle) => void;
  fractureIntensity?: number;
  onFractureIntensityChange?: (v: number) => void;
  fluidVortexStrength?: number;
  onFluidVortexStrengthChange?: (v: number) => void;
  gpuReport?: any;
}

export const UnifiedRightSidebar: React.FC<UnifiedRightSidebarProps> = ({
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
  isAudioMuted = true,
  onAudioMuteToggle,
  dataLayers = [],
  onAddDataLayer,
  onToggleDataLayer,
  onRemoveDataLayer,
  onOpacityChangeDataLayer,
  onBlendModeChangeDataLayer,
  onDisplacementScaleChangeDataLayer,
  onHillshadeChangeDataLayer,
  onSeaLevelOffsetChangeDataLayer,
  onWaterClarityChangeDataLayer,
  onPeakExponentChangeDataLayer,
  onAmbientOcclusionChangeDataLayer,
  onReorderDataLayer,
  onSelectRenderStyle,
  fractureIntensity = 1.0,
  onFractureIntensityChange,
  fluidVortexStrength = 1.0,
  onFluidVortexStrengthChange,
  gpuReport,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const catalogSheetRef = useRef<HTMLDivElement>(null);

  const isLight = theme === 1;

  // Active Cartographic Direction (A: Architectural, B: Hybrid, C: Photoreal)
  const activeDirection: DataLayerRenderStyle =
    dataLayers.find((l) => l.visible && l.renderStyle)?.renderStyle ?? 'architectural';

  // Primary active dataset layer for direct scene controls
  const primaryLayer =
    dataLayers.find(
      (l) => l.visible && (l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'topography')
    ) || dataLayers[0];
  const primaryLayerId =
    primaryLayer?.id || (activeDirection === 'hybrid' ? 'hybrid-crust-hydrosphere' : 'architectural-topo-relief');

  // Auto-close catalog if user presses Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCatalogOpen) {
        setIsCatalogOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCatalogOpen]);

  if (isZenMode) return null;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. Primary Unified Right Sidebar Dock                                     */}
      {/* ========================================================================= */}
      <div className="fixed top-4 right-4 z-20 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-300 ease-out">
        <div
          className={`rounded-2xl border backdrop-blur-xl shadow-2xl p-3.5 text-xs max-h-[calc(100vh-2rem)] flex flex-col transition-all duration-300 ${
            isLight
              ? 'bg-white/95 border-zinc-300/90 text-zinc-800 shadow-zinc-300/60'
              : 'bg-[#0F121A]/95 border-white/15 text-zinc-200 shadow-black/80'
          }`}
        >
          {/* --------------------------------------------------------------------- */}
          {/* Row 1: Engine Controls & System Status Bar                            */}
          {/* --------------------------------------------------------------------- */}
          <div
            className={`flex items-center justify-between pb-2.5 border-b gap-1 ${
              isLight ? 'border-zinc-200' : 'border-white/10'
            }`}
          >
            {/* Live FPS Badge (Fixed width, cohesive gap, no layout shift) */}
            <div
              className={`flex items-center justify-center gap-1.5 w-16 shrink-0 px-1.5 py-1 rounded-lg border font-bold text-[10px] tabular-nums transition-colors ${
                isLight
                  ? 'bg-zinc-100/90 border-zinc-200 text-zinc-900'
                  : 'bg-black/30 border-white/10 text-zinc-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  fps >= 100
                    ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)] animate-pulse'
                    : fps >= 55
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                    : 'bg-amber-400'
                }`}
              ></span>
              <span
                className={`w-5 text-right tabular-nums ${
                  fps >= 100
                    ? 'text-purple-400 font-extrabold'
                    : fps >= 55
                    ? 'text-emerald-500 font-extrabold'
                    : 'text-amber-500 font-extrabold'
                }`}
              >
                {fps}
              </span>
              <span className="text-[8px] font-normal opacity-60">FPS</span>
            </div>

            {/* Backend Toggle (WebGL2 vs WebGPU) */}
            <button
              onClick={() => onBackendChange(backend === 'webgpu' ? 'webgl2' : 'webgpu')}
              disabled={!hasWebGPU && backend === 'webgl2'}
              title={
                !hasWebGPU
                  ? 'WebGPU not available on this hardware'
                  : backend === 'webgpu'
                  ? 'Active Engine: WebGPU WGSL Compute'
                  : 'Active Engine: WebGL2 Fallback'
              }
              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5 shrink-0 ${
                backend === 'webgpu'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.4)] ring-1 ring-purple-400/50'
                  : isLight
                  ? 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200 hover:border-zinc-400'
                  : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:border-white/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  backend === 'webgpu' ? 'bg-white animate-pulse' : 'bg-emerald-400'
                }`}
              ></span>
              <span>{backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}</span>
              <span className="text-[9px] opacity-60 font-normal">⇄</span>
            </button>

            {/* Grid Resolution Switch (100K - 16M Tiers) */}
            <div
              className={`flex items-center rounded-lg p-0.5 border shrink-0 gap-0.5 ${
                isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-black/40 border-white/10'
              }`}
            >
              {(['100k', '1M', '3M', '4M', '8M', '16M'] as ResolutionTier[]).map((tier) => (
                <button
                  key={tier}
                  onClick={() => onResolutionChange(tier)}
                  title={`${tier.toUpperCase()} Volumetric Nodes`}
                  className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold transition-all ${
                    resolution === tier
                      ? tier === '16M'
                        ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                        : tier === '1M' || tier === '4M'
                        ? 'bg-purple-600 text-white font-extrabold shadow-[0_0_8px_rgba(168,85,247,0.5)]'
                        : isLight
                        ? 'bg-zinc-900 text-white shadow-sm ring-1 ring-zinc-900'
                        : 'bg-white text-zinc-950 font-extrabold shadow-sm'
                      : isLight
                      ? 'text-zinc-500 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tier.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Audio Synthesizer Mute/Unmute */}
            {onAudioMuteToggle && (
              <button
                onClick={onAudioMuteToggle}
                title={
                  isAudioMuted
                    ? 'Web Audio Synthesizer: Muted (Click to Unmute)'
                    : 'Web Audio Synthesizer: Active (Click to Mute)'
                }
                className={`p-1.5 rounded-lg border transition-all flex items-center shrink-0 ${
                  !isAudioMuted
                    ? isLight
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500 shadow-sm'
                      : 'border-emerald-400 bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/50 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
                    : isLight
                    ? 'border-zinc-300 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
                    : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:border-white/25'
                }`}
              >
                {!isAudioMuted ? (
                  <svg className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.314M11 5L6 9H2v6h4l5 4V5z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
              </button>
            )}

            {/* Theme Toggle (Light / Dark) */}
            <button
              onClick={onThemeToggle}
              aria-label={isLight ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
              title={isLight ? 'Switch to Dark Cyber Palette (Press T)' : 'Switch to Light Monochrome Palette (Press T)'}
              className={`p-1.5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                isLight
                  ? 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 hover:border-zinc-400 shadow-sm'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-amber-300 hover:bg-white/10 hover:border-white/25'
              }`}
            >
              {isLight ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* --------------------------------------------------------------------- */}
          {/* Row 2: Title & Primary Window Controls                                */}
          {/* --------------------------------------------------------------------- */}
          <div
            className={`flex items-center justify-between py-2 border-b ${
              isLight ? 'border-zinc-200' : 'border-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  mode === 4
                    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                    : mode === 3
                    ? 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]'
                    : mode === 2
                    ? 'bg-[#C86D51] shadow-[0_0_10px_rgba(200,109,81,0.8)]'
                    : mode === 1
                    ? 'bg-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.8)]'
                    : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                } animate-pulse`}
              ></span>
              <span
                className={`text-[11px] font-black tracking-wider uppercase ${
                  isLight ? 'text-zinc-900' : 'text-zinc-100'
                }`}
              >
                INDICATRIX // CONTROLS
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onZenToggle}
                title="Zen Presentation Mode (Press H to hide UI)"
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                  isLight
                    ? 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:border-white/30'
                }`}
              >
                Zen (H)
              </button>
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                  isLight
                    ? 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                    : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
                }`}
              >
                {isSidebarOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>

          {/* --------------------------------------------------------------------- */}
          {/* Main Body (Expandable)                                                */}
          {/* --------------------------------------------------------------------- */}
          {isSidebarOpen && (
            <div className="mt-2.5 space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
              {/* Cartographic Rendering Direction Switcher (A / B / C) - Always Visible */}
              <div
                className={`p-2.5 rounded-xl border space-y-2 transition-all ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-200 shadow-sm'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse"></span>
                    <span className={isLight ? 'text-zinc-700' : 'text-zinc-300'}>Cartographic Style</span>
                  </span>
                  <span
                    className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                      isLight
                        ? 'bg-zinc-200 text-zinc-800 border-zinc-300'
                        : 'bg-white/10 text-sky-300 border-white/15'
                    }`}
                  >
                    {activeDirection === 'architectural'
                      ? 'Direction A (Relief)'
                      : activeDirection === 'hybrid'
                      ? 'Direction B (Depth)'
                      : 'Direction C (Orbital)'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {/* Direction A */}
                  <button
                    onClick={() => {
                      onSelectRenderStyle?.('architectural');
                    }}
                    title="Direction A: Architectural Topographic Relief (Monochrome Eduard Imhof hillshading & dual-tier isocontours)"
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center justify-center gap-0.5 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                      activeDirection === 'architectural'
                        ? isLight
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-md ring-1 ring-zinc-900 font-black'
                          : 'bg-white text-zinc-950 border-white shadow-[0_0_12px_rgba(255,255,255,0.4)] ring-1 ring-white/60 font-black'
                        : isLight
                        ? 'bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 hover:bg-zinc-100'
                        : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-white hover:border-white/25 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-[10px] font-black tracking-tight">A: Relief</span>
                    <span className="text-[7px] uppercase font-bold tracking-tight opacity-75">Architectural</span>
                  </button>

                  {/* Direction B */}
                  <button
                    onClick={() => {
                      onSelectRenderStyle?.('hybrid');
                    }}
                    title="Direction B: Hydrosphere & Bathymetric Depth (Two-Surface Model: smooth sea level + Beer-Lambert depth)"
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center justify-center gap-0.5 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                      activeDirection === 'hybrid'
                        ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.6)] ring-1 ring-cyan-300 font-black'
                        : isLight
                        ? 'bg-white border-zinc-200 text-zinc-600 hover:text-cyan-700 hover:border-cyan-300 hover:bg-cyan-50'
                        : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-500/5'
                    }`}
                  >
                    <span className="text-[10px] font-black tracking-tight">B: Depth</span>
                    <span className="text-[7px] uppercase font-bold tracking-tight opacity-75">Hydrosphere</span>
                  </button>

                  {/* Direction C */}
                  <button
                    onClick={() => {
                      onSelectRenderStyle?.('photoreal');
                    }}
                    title="Direction C: NASA Blue Marble (True-color orbital photography + 3D DEM relief)"
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center justify-center gap-0.5 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                      activeDirection === 'photoreal'
                        ? 'bg-sky-500 text-black border-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.6)] ring-1 ring-sky-300 font-black'
                        : isLight
                        ? 'bg-white border-zinc-200 text-zinc-600 hover:text-sky-700 hover:border-sky-300 hover:bg-sky-50'
                        : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-sky-300 hover:border-sky-500/40 hover:bg-sky-500/5'
                    }`}
                  >
                    <span className="text-[10px] font-black tracking-tight">C: Orbital</span>
                    <span className="text-[7px] uppercase font-bold tracking-tight opacity-75">Photoreal</span>
                  </button>
                </div>
              </div>

              {/* Volumetric Node Scaling Card (100K - 16M Tiers) */}
              <div
                className={`p-2.5 rounded-xl border space-y-2 transition-all ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-200 shadow-sm'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)] animate-pulse"></span>
                    <span className={isLight ? 'text-zinc-700' : 'text-zinc-300'}>Volumetric Scale</span>
                  </span>
                  <span
                    className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                      resolution === '16M'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : isLight
                        ? 'bg-zinc-200 text-zinc-800 border-zinc-300'
                        : 'bg-white/10 text-purple-300 border-white/15'
                    }`}
                  >
                    {resolution === '100k'
                      ? '262K Verts · ~12MB'
                      : resolution === '1M'
                      ? '1.05M Verts · ~118MB'
                      : resolution === '3M'
                      ? '2.98M Verts · ~340MB'
                      : resolution === '4M'
                      ? '4.19M Verts · ~475MB'
                      : resolution === '8M'
                      ? '8.38M Verts · ~950MB'
                      : '16.7M Verts · ~1.5GB'}
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1">
                  {(['100k', '1M', '3M', '4M', '8M', '16M'] as ResolutionTier[]).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => onResolutionChange(tier)}
                      className={`py-1.5 px-0.5 rounded-lg text-center flex flex-col items-center justify-center border transition-all ${
                        resolution === tier
                          ? tier === '16M'
                            ? 'bg-amber-500 text-black border-amber-400 font-extrabold shadow-sm'
                            : tier === '1M' || tier === '4M'
                            ? 'bg-purple-600 text-white border-purple-400 font-extrabold shadow-[0_0_8px_rgba(168,85,247,0.5)]'
                            : isLight
                            ? 'bg-zinc-900 text-white border-zinc-900 font-black'
                            : 'bg-white text-zinc-950 border-white font-black'
                          : isLight
                          ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                          : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="text-[9px] font-black">{tier.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dedicated Direct Scene Controls (Always Exposed & Wired to WebGPU Uniforms) */}
              <div
                className={`p-2.5 rounded-xl border space-y-2 transition-all ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-200 shadow-sm'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></span>
                    <span className={isLight ? 'text-zinc-700' : 'text-zinc-300'}>Scene Controls</span>
                  </span>
                  <span className="text-[8px] font-mono text-emerald-500 dark:text-emerald-400 font-bold">
                    Direct WebGPU Uniforms
                  </span>
                </div>

                <div className="space-y-2 text-[9px]">
                  {/* Instrument 1: 2D Polar Sun Compass (Sun Azimuth: 0-360°, Sun Alt: 10-85°) */}
                  <PolarSunCompass
                    azimuth={primaryLayer?.sunAzimuth ?? 315}
                    altitude={primaryLayer?.sunAltitude ?? 45}
                    onChange={(azimuth, altitude) =>
                      onHillshadeChangeDataLayer?.(
                        primaryLayerId,
                        azimuth,
                        primaryLayer?.hillshadeIntensity ?? 0.65,
                        altitude
                      )
                    }
                    isLight={isLight}
                  />

                  {/* Instrument 2: 2D Hypsometric Mountain Elevation Curve (3D Relief & Peak Sharp: 0.5x-3.0x) */}
                  <HypsometricReliefCurve
                    displacementScale={primaryLayer?.displacementScale ?? 0.08}
                    peakExponent={primaryLayer?.peakExponent ?? 1.4}
                    onDisplacementChange={(scale) => onDisplacementScaleChangeDataLayer?.(primaryLayerId, scale)}
                    onPeakExponentChange={(exponent) => onPeakExponentChangeDataLayer?.(primaryLayerId, exponent)}
                    isLight={isLight}
                  />

                  {/* Instrument 3: Hydrostatic Bathymetric Tide Gauge (Sea Level: -150m to +100m, Clarity: 10%-100%) */}
                  <BathymetricTideGauge
                    seaLevelOffset={primaryLayer?.seaLevelOffset ?? 0}
                    waterClarity={primaryLayer?.waterClarity ?? 0.75}
                    onSeaLevelChange={(offset) => onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, offset)}
                    onWaterClarityChange={(clarity) => onWaterClarityChangeDataLayer?.(primaryLayerId, clarity)}
                    isLight={isLight}
                  />

                  {/* Crevice AO (Ambient Occlusion: 0%-100%) */}
                  <div className="flex items-center gap-1.5 pt-1 px-1">
                    <span className="w-20 text-zinc-500 dark:text-zinc-400 font-bold text-[8px] uppercase tracking-wider flex-shrink-0">
                      Crevice AO:
                    </span>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={primaryLayer?.ambientOcclusion ?? 0.65}
                      onChange={(e) => onAmbientOcclusionChangeDataLayer?.(primaryLayerId, parseFloat(e.target.value))}
                      className="w-full accent-zinc-400 cursor-pointer h-1 rounded"
                    />
                    <span className="w-10 text-right font-bold text-zinc-500 dark:text-zinc-300 tabular-nums flex-shrink-0">
                      {Math.round((primaryLayer?.ambientOcclusion ?? 0.65) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Morph Paradigms (Modes 0–4) */}
              <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Morph Paradigm (1–5)
                      </span>
                      <span className="text-[9px] font-mono opacity-50">Active: Mode {mode + 1}</span>
                    </div>

                    <div className="grid grid-cols-5 gap-1">
                      {/* Mode 0: Linear */}
                      <button
                        onClick={() => onModeChange(0)}
                        title="Mode 1 (Linear): Standard Spherical-to-Planar Linear Mix"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex flex-col items-center gap-0.5 border ${
                          mode === 0
                            ? isLight
                              ? 'bg-amber-500 text-white border-amber-600 shadow-md font-extrabold ring-1 ring-amber-400'
                              : 'bg-amber-500/30 text-amber-200 border-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.3)] ring-1 ring-amber-400/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-amber-700 hover:border-amber-300 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-amber-300 hover:border-white/25 bg-white/[0.02]'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {mode === 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse"></span>}
                          <span>Linear</span>
                        </span>
                        <kbd className="text-[7px] opacity-70">1</kbd>
                      </button>

                      {/* Mode 1: Scroll */}
                      <button
                        onClick={() => onModeChange(1)}
                        title="Mode 2 (Scroll): Cylindrical Unrolling along Mercator Longitudinal Seam"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex flex-col items-center gap-0.5 border ${
                          mode === 1
                            ? isLight
                              ? 'bg-slate-700 text-white border-slate-800 shadow-md font-extrabold ring-1 ring-slate-500'
                              : 'bg-slate-300/35 text-slate-100 border-slate-300/80 shadow-[0_0_10px_rgba(203,213,225,0.3)] ring-1 ring-slate-300/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-slate-800 hover:border-slate-300 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-slate-200 hover:border-white/25 bg-white/[0.02]'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {mode === 1 && <span className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse"></span>}
                          <span>Scroll</span>
                        </span>
                        <kbd className="text-[7px] opacity-70">2</kbd>
                      </button>

                      {/* Mode 2: Griffith */}
                      <button
                        onClick={() => onModeChange(2)}
                        title="Mode 3 (Griffith): Linear Elastic Fracture Mechanics Rupture along Antimeridian"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex flex-col items-center gap-0.5 border ${
                          mode === 2
                            ? isLight
                              ? 'bg-[#C86D51] text-white border-[#B05B41] shadow-md font-extrabold ring-1 ring-[#E08A6F]'
                              : 'bg-[#C86D51]/40 text-[#FFAE96] border-[#C86D51]/80 shadow-[0_0_10px_rgba(200,109,81,0.4)] ring-1 ring-[#C86D51]/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-[#C86D51] hover:border-[#C86D51]/30 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-[#E08A6F] hover:border-white/25 bg-white/[0.02]'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {mode === 2 && <span className="w-1.5 h-1.5 rounded-full bg-[#FFAE96] animate-pulse"></span>}
                          <span>Griffith</span>
                        </span>
                        <kbd className="text-[7px] opacity-70">3</kbd>
                      </button>

                      {/* Mode 3: Fluid */}
                      <button
                        onClick={() => onModeChange(3)}
                        title="Mode 4 (Fluid): Hydrodynamic Liquefaction & Navier-Stokes Turbulent Flow"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex flex-col items-center gap-0.5 border ${
                          mode === 3
                            ? isLight
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-md font-extrabold ring-1 ring-indigo-400'
                              : 'bg-indigo-500/35 text-indigo-200 border-indigo-400/80 shadow-[0_0_10px_rgba(129,140,248,0.4)] ring-1 ring-indigo-400/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:border-indigo-300 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-indigo-300 hover:border-white/25 bg-white/[0.02]'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {mode === 3 && <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse"></span>}
                          <span>Fluid</span>
                        </span>
                        <kbd className="text-[7px] opacity-70">4</kbd>
                      </button>

                      {/* Mode 4: Dymaxion */}
                      <button
                        onClick={() => onModeChange(4)}
                        title="Mode 5 (Dymaxion): Buckminster Fuller 20-Facet Icosahedral Unfolding"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center flex flex-col items-center gap-0.5 border ${
                          mode === 4
                            ? isLight
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-md font-extrabold ring-1 ring-emerald-400'
                              : 'bg-emerald-500/35 text-emerald-200 border-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.4)] ring-1 ring-emerald-400/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-emerald-600 hover:border-emerald-300 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-emerald-300 hover:border-white/25 bg-white/[0.02]'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {mode === 4 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>}
                          <span>Dymaxion</span>
                        </span>
                        <kbd className="text-[7px] opacity-70">5</kbd>
                      </button>
                    </div>
                  </div>

                  {/* View Mode & Cursor Dynamics */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Layer Mode (Both, Points, Wire) */}
                    <div
                      className={`flex items-center rounded-lg p-0.5 border ${
                        isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-black/40 border-white/10'
                      }`}
                    >
                      <button
                        onClick={() => onLayerModeChange(0)}
                        title="Display both point cloud and wireframe lattice"
                        className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all ${
                          layerMode === 0
                            ? isLight
                              ? 'bg-zinc-900 text-white shadow-sm font-extrabold'
                              : 'bg-white text-zinc-950 shadow-sm font-black'
                            : isLight
                            ? 'text-zinc-500 hover:text-zinc-900'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Both
                      </button>
                      <button
                        onClick={() => onLayerModeChange(1)}
                        title="Points Only: disable wireframe lattice"
                        className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all ${
                          layerMode === 1
                            ? isLight
                              ? 'bg-zinc-900 text-white shadow-sm font-extrabold'
                              : 'bg-white text-zinc-950 shadow-sm font-black'
                            : isLight
                            ? 'text-zinc-500 hover:text-zinc-900'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Points
                      </button>
                      <button
                        onClick={() => onLayerModeChange(2)}
                        title="Wireframe Only: disable point vertices"
                        className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all ${
                          layerMode === 2
                            ? isLight
                              ? 'bg-zinc-900 text-white shadow-sm font-extrabold'
                              : 'bg-white text-zinc-950 shadow-sm font-black'
                            : isLight
                            ? 'text-zinc-500 hover:text-zinc-900'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Wire
                      </button>
                    </div>

                    {/* Cursor Physics Toggle */}
                    <button
                      onClick={() => onCursorPhysicsToggle(!cursorPhysicsEnabled)}
                      title="Toggle interactive raycast cursor dynamic physics & vortex forces"
                      className={`py-1 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5 ${
                        cursorPhysicsEnabled
                          ? isLight
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-1 ring-emerald-400 font-extrabold'
                            : 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-[0_0_10px_rgba(52,211,153,0.3)] ring-1 ring-emerald-400/50 font-extrabold'
                          : isLight
                          ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:text-zinc-800'
                          : 'bg-white/[0.02] border-white/10 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          cursorPhysicsEnabled
                            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse'
                            : 'bg-zinc-500'
                        }`}
                      ></span>
                      <span>Cursor Physics</span>
                    </button>
                  </div>

                  {/* Contextual Physical Simulation Parameters (Mode 2 / Mode 3) */}
                  {mode === 2 && (
                    <div className={`p-2 rounded-xl border flex flex-col gap-1.5 transition-all ${
                      isLight ? 'bg-zinc-100/80 border-zinc-200' : 'bg-white/[0.02] border-white/10'
                    }`}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold flex items-center gap-1.5 text-[#C86D51]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#C86D51] animate-pulse"></span>
                          Fracture Intensity
                        </span>
                        <span className="font-mono font-bold opacity-80">{(fractureIntensity ?? 1.0).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.5"
                        step="0.05"
                        value={fractureIntensity ?? 1.0}
                        onChange={(e) => onFractureIntensityChange?.(parseFloat(e.target.value))}
                        className="w-full accent-[#C86D51] h-1 bg-zinc-700/50 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}

                  {mode === 3 && (
                    <div className={`p-2 rounded-xl border flex flex-col gap-1.5 transition-all ${
                      isLight ? 'bg-zinc-100/80 border-zinc-200' : 'bg-white/[0.02] border-white/10'
                    }`}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold flex items-center gap-1.5 text-indigo-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                          Vortex Swirl Strength
                        </span>
                        <span className="font-mono font-bold opacity-80">{(fluidVortexStrength ?? 1.0).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="3.0"
                        step="0.05"
                        value={fluidVortexStrength ?? 1.0}
                        onChange={(e) => onFluidVortexStrengthChange?.(parseFloat(e.target.value))}
                        className="w-full accent-indigo-500 h-1 bg-zinc-700/50 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Geodesic Arcs & Overlays */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Geodesic Arcs & Overlays
                      </span>
                      <span className="text-[9px] font-mono opacity-50">
                        {activeOverlay === 'off' ? 'Disabled' : activeOverlay}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => onOverlayChange('off')}
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center border ${
                          activeOverlay === 'off'
                            ? isLight
                              ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm font-extrabold'
                              : 'bg-white text-zinc-950 border-white shadow-sm font-black'
                            : isLight
                            ? 'border-zinc-200 text-zinc-500 hover:text-zinc-900 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-zinc-200 bg-white/[0.02]'
                        }`}
                      >
                        Off
                      </button>
                      <button
                        onClick={() => onOverlayChange('antipodes')}
                        title="Antipodal Geodesic Connectors (Red/Rose)"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center border ${
                          activeOverlay === 'antipodes'
                            ? isLight
                              ? 'bg-rose-600 text-white border-rose-700 shadow-md font-extrabold ring-1 ring-rose-400'
                              : 'bg-rose-500/35 text-rose-200 border-rose-400/80 shadow-[0_0_10px_rgba(244,63,94,0.4)] ring-1 ring-rose-400/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-rose-600 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-rose-300 bg-white/[0.02]'
                        }`}
                      >
                        Antipodes
                      </button>
                      <button
                        onClick={() => onOverlayChange('conveyor')}
                        title="Global Oceanic Conveyor Belt Thermohaline Circulation (Sky Blue)"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center border ${
                          activeOverlay === 'conveyor'
                            ? isLight
                              ? 'bg-sky-600 text-white border-sky-700 shadow-md font-extrabold ring-1 ring-sky-400'
                              : 'bg-sky-500/35 text-sky-200 border-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.4)] ring-1 ring-sky-400/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-sky-600 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-sky-300 bg-white/[0.02]'
                        }`}
                      >
                        Conveyor
                      </button>
                      <button
                        onClick={() => onOverlayChange('migration')}
                        title="Global Bird & Cetacean Migration Geodesic Arcs (Amber)"
                        className={`py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all text-center border ${
                          activeOverlay === 'migration'
                            ? isLight
                              ? 'bg-amber-600 text-white border-amber-700 shadow-md font-extrabold ring-1 ring-amber-400'
                              : 'bg-amber-500/35 text-amber-200 border-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.4)] ring-1 ring-amber-400/60 font-extrabold'
                            : isLight
                            ? 'border-zinc-200 text-zinc-600 hover:text-amber-600 bg-zinc-50'
                            : 'border-white/10 text-zinc-400 hover:text-amber-300 bg-white/[0.02]'
                        }`}
                      >
                        Migration
                      </button>
                    </div>
                  </div>

                  {/* Cartographic Features (Landmarks, Tissot, Vectors) */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Landmarks */}
                    <button
                      onClick={onLandmarksToggle}
                      title="Toggle Major World Geographical Landmarks"
                      className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1.5 ${
                        showLandmarks
                          ? isLight
                            ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm font-extrabold ring-1 ring-zinc-700'
                            : 'bg-white text-zinc-950 border-white shadow-sm font-black'
                          : isLight
                          ? 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-800'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showLandmarks
                            ? isLight
                              ? 'bg-emerald-400 animate-pulse'
                              : 'bg-emerald-600 animate-pulse'
                            : 'bg-zinc-500'
                        }`}
                      ></span>
                      <span>Landmarks</span>
                    </button>

                    {/* Tissot Indicatrix */}
                    <button
                      onClick={onTissotToggle}
                      title="Toggle Tissot Indicatrix Ellipses (Deformation Tensors)"
                      className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1.5 ${
                        showTissot
                          ? isLight
                            ? 'bg-purple-700 text-white border-purple-800 shadow-md font-extrabold ring-1 ring-purple-400'
                            : 'bg-purple-600/40 text-purple-200 border-purple-400/80 shadow-[0_0_10px_rgba(192,132,252,0.4)] ring-1 ring-purple-400/60 font-extrabold'
                          : isLight
                          ? 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-800'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showTissot ? 'bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)] animate-pulse' : 'bg-zinc-500'
                        }`}
                      ></span>
                      <span>Tissot</span>
                    </button>

                    {/* Vectors (V) */}
                    <button
                      onClick={onVectorsToggle}
                      title="Toggle Vector Coastlines & Rivers (Press V)"
                      className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all text-center flex items-center justify-center gap-1.5 ${
                        showVectors
                          ? isLight
                            ? 'bg-amber-600 text-white border-amber-700 shadow-md font-extrabold ring-1 ring-amber-400'
                            : 'bg-amber-500/35 text-amber-200 border-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.4)] ring-1 ring-amber-400/60 font-extrabold'
                          : isLight
                          ? 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-800'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showVectors ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] animate-pulse' : 'bg-zinc-500'
                        }`}
                      ></span>
                      <span>Vectors (V)</span>
                    </button>
                  </div>

                  {/* Camera Target Snaps */}
                  <div className="space-y-1">
                    <div className={`text-[9px] uppercase font-bold tracking-wider ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      Camera Target Snap
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[9px] font-bold">
                      {(['equator', 'pole', 'seam', 'isometric'] as const).map((snapKey) => {
                        const labels = {
                          equator: 'Equator',
                          pole: 'North Pole',
                          seam: 'Seam (0°)',
                          isometric: 'Isometric',
                        };
                        return (
                          <button
                            key={snapKey}
                            onClick={() => onSnapCamera(snapKey)}
                            className={`py-1 rounded border transition-all ${
                              isLight
                                ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                : 'bg-white/5 hover:bg-white/15 border-white/10 text-zinc-300 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {labels[snapKey]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tissot Distortion Metrics (when Tissot is active) */}
                  {showTissot && (
                    <div
                      className={`p-2.5 rounded-xl border text-[10px] space-y-1.5 tabular-nums ${
                        isLight
                          ? 'bg-purple-50/80 border-purple-200 text-zinc-800'
                          : 'bg-purple-950/25 border-purple-500/40 text-purple-200'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold">
                        <span>Distortion Tensor</span>
                        <span className="text-emerald-500 dark:text-emerald-400 font-extrabold">
                          {mode === 4 ? 'Isomeric (s ≈ 1.04x)' : 'Morphing Tensor'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div>
                          <span className="text-zinc-500 block">Equatorial Area:</span>
                          <span className="font-bold">1.000x</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Polar Dilation:</span>
                          <span className="font-bold">{mode === 4 ? '1.041x' : '1.000x'}</span>
                        </div>
                      </div>
                    </div>
                  )}

              {/* Active Datasets & Catalog Controls */}
              <div
                className={`space-y-3 pt-2 border-t ${
                  isLight ? 'border-zinc-200' : 'border-white/10'
                }`}
              >
                  {/* Data Layers Header Action */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      Active Datasets ({dataLayers.length})
                    </span>

                    <button
                      onClick={() => setIsCatalogOpen(!isCatalogOpen)}
                      className={`text-[9px] font-extrabold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                        isCatalogOpen
                          ? isLight
                            ? 'bg-sky-600 text-white border-sky-700 shadow-md ring-1 ring-sky-400'
                            : 'bg-sky-500 text-black border-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.5)] ring-1 ring-sky-300'
                          : isLight
                          ? 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:border-sky-400'
                          : 'border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/30 hover:border-sky-400'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>{isCatalogOpen ? 'Close Catalog' : '+ Catalog'}</span>
                    </button>
                  </div>

                  {/* Surface Clarity: Point Lattice Suppression Pill */}
                  <div className={`flex items-center justify-between p-1.5 rounded-lg border text-[9px] ${
                    isLight ? 'bg-zinc-100/80 border-zinc-200 text-zinc-700' : 'bg-white/[0.03] border-white/10 text-zinc-300'
                  }`}>
                    <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[8px]">Base Lattice:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onLayerModeChange?.(2)}
                        className={`px-2 py-0.5 rounded text-[8px] font-bold transition-all ${
                          layerMode === 2
                            ? 'bg-emerald-500 text-black font-extrabold shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Clean Terrain
                      </button>
                      <button
                        onClick={() => onLayerModeChange?.(0)}
                        className={`px-2 py-0.5 rounded text-[8px] font-bold transition-all ${
                          layerMode === 0
                            ? 'bg-sky-500 text-black font-extrabold shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        + Node Cloud
                      </button>
                    </div>
                  </div>

                  {/* Active Layers Stack */}
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                    {dataLayers && dataLayers.length > 0 ? (
                      dataLayers.map((layer, idx) => {
                        const preset = getPresetById(layer.id);
                        const legend = preset?.legend;
                        const isFirst = idx === 0;
                        const isLast = idx === dataLayers.length - 1;

                        return (
                          <div
                            key={layer.id}
                            className={`p-2.5 rounded-xl border flex flex-col gap-2 text-[10px] transition-all ${
                              layer.visible
                                ? isLight
                                  ? 'bg-zinc-50 border-zinc-300 text-zinc-800 shadow-sm'
                                  : 'bg-white/[0.04] border-white/15 text-zinc-200'
                                : isLight
                                ? 'bg-zinc-100/50 border-zinc-200 text-zinc-400 opacity-60'
                                : 'bg-white/[0.01] border-white/5 text-zinc-500 opacity-50'
                            }`}
                          >
                            {/* Layer Item Header */}
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <span
                                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                      layer.visible
                                        ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse'
                                        : 'bg-zinc-500'
                                    }`}
                                  ></span>
                                  <span className="leading-tight break-words text-[11px]" title={layer.name}>
                                    {layer.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 ml-4">
                                  {layer.renderStyle && (
                                    <span className="text-[7px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border bg-sky-500/15 text-sky-500 dark:text-sky-300 border-sky-500/30">
                                      {layer.renderStyle}
                                    </span>
                                  )}
                                  <span className="text-[8px] font-mono opacity-60">
                                    Z:{dataLayers.length - idx}
                                  </span>
                                </div>
                              </div>

                              {/* Layer Action Icons */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* Move Up */}
                                <button
                                  disabled={isFirst}
                                  onClick={() => onReorderDataLayer?.(layer.id, 'up')}
                                  title="Move Layer Up in Z-Stack"
                                  className={`p-1 rounded-lg border transition-all ${
                                    isFirst
                                      ? 'opacity-25 cursor-not-allowed border-transparent text-zinc-500'
                                      : isLight
                                      ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                                      : 'border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white'
                                  }`}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                                  </svg>
                                </button>

                                {/* Move Down */}
                                <button
                                  disabled={isLast}
                                  onClick={() => onReorderDataLayer?.(layer.id, 'down')}
                                  title="Move Layer Down in Z-Stack"
                                  className={`p-1 rounded-lg border transition-all ${
                                    isLast
                                      ? 'opacity-25 cursor-not-allowed border-transparent text-zinc-500'
                                      : isLight
                                      ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                                      : 'border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white'
                                  }`}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>

                                {/* Visibility Toggle */}
                                <button
                                  onClick={() => onToggleDataLayer?.(layer.id)}
                                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                                  className={`p-1 rounded-lg border transition-all ${
                                    layer.visible
                                      ? isLight
                                        ? 'border-sky-400 bg-sky-100 text-sky-900 ring-1 ring-sky-400 shadow-sm'
                                        : 'border-sky-400 bg-sky-500/30 text-sky-200 ring-1 ring-sky-400/50 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                                      : isLight
                                      ? 'border-zinc-300 text-zinc-400 hover:text-zinc-700'
                                      : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                                  }`}
                                >
                                  {layer.visible ? (
                                    <svg className="w-3.5 h-3.5 text-sky-500 dark:text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 0111.122 1.937C20.268 9.057 16.478 12 12 12c-1.18 0-2.304-.2-3.344-.563M3 3l18 18" />
                                    </svg>
                                  )}
                                </button>

                                {/* Delete Layer */}
                                <button
                                  onClick={() => onRemoveDataLayer?.(layer.id)}
                                  title="Remove layer"
                                  className="p-1 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/20 transition-all"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Opacity & Blend Controls */}
                            <div className="grid grid-cols-2 gap-2 text-[9px]">
                              <div className="flex items-center gap-1.5">
                                <span className="text-zinc-500 font-bold">Opacity:</span>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={layer.opacity ?? 0.85}
                                  onChange={(e) => onOpacityChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                  className="w-full accent-sky-400 cursor-pointer h-1 rounded"
                                />
                                <span className="w-7 text-right font-bold tabular-nums">
                                  {Math.round((layer.opacity ?? 0.85) * 100)}%
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-zinc-500 font-bold">Blend:</span>
                                <select
                                  value={layer.blendMode ?? preset?.defaultBlendMode ?? 0}
                                  onChange={(e) =>
                                    onBlendModeChangeDataLayer?.(layer.id, parseInt(e.target.value) as BlendModeType)
                                  }
                                  className={`w-full py-0.5 px-1 rounded text-[9px] font-bold border ${
                                    isLight
                                      ? 'bg-white border-zinc-300 text-zinc-800'
                                      : 'bg-black/50 border-white/20 text-zinc-200'
                                  }`}
                                >
                                  <option value={0}>Normal</option>
                                  <option value={1}>Additive</option>
                                  <option value={2}>Multiply</option>
                                  <option value={3}>Screen</option>
                                </select>
                              </div>
                            </div>

                            {/* Terrain 3D Relief & Sun Azimuth (for Topo / Satellite / Ocean) */}
                            {(layer.category === 'topo' ||
                              layer.category === 'satellite' ||
                              layer.category === 'ocean' ||
                              !!layer.renderStyle ||
                              layer.elevationEncoding) && (
                              <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-[9px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-500 dark:text-emerald-400 font-bold text-[8px] uppercase tracking-wider">
                                    3D Relief:
                                  </span>
                                  <input
                                    type="range"
                                    min="0"
                                    max="0.50"
                                    step="0.01"
                                    value={layer.displacementScale ?? preset?.defaultDisplacementScale ?? 0.08}
                                    onChange={(e) =>
                                      onDisplacementScaleChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                    }
                                    className="w-full accent-emerald-400 cursor-pointer h-1 rounded"
                                  />
                                  <span className="w-8 text-right font-bold text-emerald-500 dark:text-emerald-300 tabular-nums">
                                    {(layer.displacementScale ?? preset?.defaultDisplacementScale ?? 0.08).toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-amber-500 dark:text-amber-400 font-bold text-[8px] uppercase tracking-wider">
                                    Sun Azimuth:
                                  </span>
                                  <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    step="5"
                                    value={layer.sunAzimuth ?? 315}
                                    onChange={(e) =>
                                      onHillshadeChangeDataLayer?.(
                                        layer.id,
                                        parseFloat(e.target.value),
                                        layer.hillshadeIntensity ?? 0.65
                                      )
                                    }
                                    className="w-full accent-amber-400 cursor-pointer h-1 rounded"
                                  />
                                  <span className="w-8 text-right font-bold text-amber-500 dark:text-amber-300 tabular-nums">
                                    {Math.round(layer.sunAzimuth ?? 315)}°
                                  </span>
                                </div>

                                {/* Direction A: Valley Crevice Ambient Occlusion & Antialiased Contours */}
                                {(layer.renderStyle === 'architectural' || layer.id === 'architectural-topo-relief') && (
                                  <div className="pt-1.5 border-t border-white/5 space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-zinc-500 dark:text-zinc-400 font-bold text-[8px] uppercase tracking-wider">
                                        Crevice AO:
                                      </span>
                                      <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={layer.ambientOcclusion ?? 0.65}
                                        onChange={(e) =>
                                          onAmbientOcclusionChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full accent-zinc-400 cursor-pointer h-1 rounded"
                                      />
                                      <span className="w-8 text-right font-bold text-zinc-500 dark:text-zinc-300 tabular-nums">
                                        {Math.round((layer.ambientOcclusion ?? 0.65) * 100)}%
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[8px] text-emerald-500 dark:text-emerald-400 font-mono">
                                      <span>Contour Filter:</span>
                                      <span className="font-bold">fwidth() Anti-Aliased</span>
                                    </div>
                                  </div>
                                )}

                                {/* Direction B: Hydrosphere Depth, Sea Level, Clarity & Peak Exaggeration */}
                                {(layer.renderStyle === 'hybrid' || layer.id === 'hybrid-crust-hydrosphere') && (
                                  <div className="pt-1.5 border-t border-white/5 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-cyan-500 dark:text-cyan-400 font-bold text-[8px] uppercase tracking-wider">
                                        Sea Level:
                                      </span>
                                      <input
                                        type="range"
                                        min="-150"
                                        max="100"
                                        step="5"
                                        value={layer.seaLevelOffset ?? 0}
                                        onChange={(e) =>
                                          onSeaLevelOffsetChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full accent-cyan-400 cursor-pointer h-1 rounded"
                                      />
                                      <span className="w-8 text-right font-bold text-cyan-500 dark:text-cyan-300 tabular-nums">
                                        {(layer.seaLevelOffset ?? 0) > 0 ? `+${layer.seaLevelOffset}m` : `${layer.seaLevelOffset ?? 0}m`}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sky-500 dark:text-sky-400 font-bold text-[8px] uppercase tracking-wider">
                                        Clarity:
                                      </span>
                                      <input
                                        type="range"
                                        min="0.10"
                                        max="1.00"
                                        step="0.05"
                                        value={layer.waterClarity ?? 0.75}
                                        onChange={(e) =>
                                          onWaterClarityChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full accent-sky-400 cursor-pointer h-1 rounded"
                                      />
                                      <span className="w-8 text-right font-bold text-sky-500 dark:text-sky-300 tabular-nums">
                                        {Math.round((layer.waterClarity ?? 0.75) * 100)}%
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <span className="text-amber-500 dark:text-amber-400 font-bold text-[8px] uppercase tracking-wider">
                                        Peak Sharp:
                                      </span>
                                      <input
                                        type="range"
                                        min="1.0"
                                        max="2.0"
                                        step="0.1"
                                        value={layer.peakExponent ?? 1.4}
                                        onChange={(e) =>
                                          onPeakExponentChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full accent-amber-400 cursor-pointer h-1 rounded"
                                      />
                                      <span className="w-8 text-right font-bold text-amber-500 dark:text-amber-300 tabular-nums">
                                        {(layer.peakExponent ?? 1.4).toFixed(1)}x
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Color Legend Bar */}
                            {legend && (
                              <div className="space-y-1 pt-1 border-t border-white/5">
                                <div className="flex items-center justify-between text-[8px] text-zinc-400 font-bold">
                                  <span>{legend.minLabel}</span>
                                  <span className="text-sky-400 uppercase tracking-wider">{legend.unit}</span>
                                  <span>{legend.maxLabel}</span>
                                </div>
                                <div
                                  className="h-1.5 rounded-full w-full border border-white/10 shadow-inner"
                                  style={{
                                    background: `linear-gradient(to right, ${legend.colorStops.join(', ')})`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div
                        className={`p-4 rounded-xl border text-[10px] text-center italic ${
                          isLight ? 'border-zinc-200 text-zinc-400 bg-zinc-50' : 'border-white/10 text-zinc-500 bg-white/[0.01]'
                        }`}
                      >
                        No active cartographic data layers. Click [+ Catalog] to browse and add datasets.
                      </div>
                    )}
                  </div>
                </div>

                {/* Telemetry Footer */}
                <div
                  className={`pt-2 border-t text-[9px] grid grid-cols-2 gap-2 tabular-nums ${
                    isLight ? 'border-zinc-200 text-zinc-600' : 'border-white/10 text-zinc-400'
                  }`}
                >
                  <div>
                    <span className="block text-[8px] uppercase font-bold tracking-wider opacity-60">
                      Center Coordinate
                    </span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      {latStr} {lonStr}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] uppercase font-bold tracking-wider opacity-60">
                      Nominal Scale
                    </span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{mapScaleStr}</span>
                  </div>
                  {backend === 'webgpu' && gpuReport && (
                    <div className={`col-span-2 pt-1.5 mt-0.5 border-t flex flex-col gap-1 text-[8px] ${
                      isLight ? 'border-zinc-200/80 text-zinc-600' : 'border-white/10 text-zinc-400'
                    }`}>
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-sky-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                          GPU Profiler
                        </span>
                        <span className="text-emerald-400 font-mono">Total: {(gpuReport.totalGpuMs ?? 0).toFixed(2)}ms</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 font-mono opacity-80 text-[7.5px]">
                        <span>Sim: {(gpuReport.computeMs ?? 0).toFixed(2)}ms</span>
                        <span>Relief: {(gpuReport.reliefMs ?? 0).toFixed(2)}ms</span>
                        <span>Lines: {(gpuReport.linesMs ?? 0).toFixed(2)}ms</span>
                        <span>Contours: {(gpuReport.contoursMs ?? 0).toFixed(2)}ms</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. Smooth Secondary Slide-Out Catalog Sheet (Docked to Left of Sidebar)   */}
      {/* ========================================================================= */}
      {isCatalogOpen && (
        <div
          ref={catalogSheetRef}
          className={`fixed top-4 right-[25.5rem] z-30 pointer-events-auto w-96 max-w-[calc(100vw-27rem)] max-h-[calc(100vh-2rem)] flex flex-col font-mono select-none rounded-2xl border backdrop-blur-2xl shadow-2xl p-4 text-xs transition-all duration-300 ease-out animate-in fade-in slide-in-from-right-4 ${
            isLight
              ? 'bg-white/95 border-zinc-300/90 text-zinc-900 shadow-zinc-400/50'
              : 'bg-[#0F121A]/95 border-white/20 text-zinc-100 shadow-black/90'
          }`}
        >
          {/* Catalog Sheet Header */}
          <div
            className={`flex items-center justify-between pb-3 border-b ${
              isLight ? 'border-zinc-200' : 'border-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse"></span>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider">Cartographic Data Catalog</h3>
                <span className="text-[9px] text-zinc-500">
                  {DATA_LAYER_CATALOG.length} verified global datasets
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsCatalogOpen(false)}
              title="Close Catalog Sheet (Esc)"
              className={`p-1.5 rounded-lg border transition-all ${
                isLight
                  ? 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Catalog Datasets Scrollable List */}
          <div className="overflow-y-auto space-y-2.5 pr-1 mt-3 flex-1 max-h-[calc(100vh-8rem)] pb-8">
            {DATA_LAYER_CATALOG.map((preset) => {
              const isAlreadyAdded = dataLayers.some((l) => l.id === preset.id);

              return (
                <div
                  key={preset.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                    isAlreadyAdded
                      ? isLight
                        ? 'bg-emerald-50/50 border-emerald-300 shadow-sm'
                        : 'bg-emerald-950/15 border-emerald-500/30'
                      : isLight
                      ? 'bg-zinc-50 border-zinc-200 hover:border-sky-400 hover:bg-zinc-100/60'
                      : 'bg-white/[0.03] border-white/10 hover:border-sky-400/50 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      {isAlreadyAdded && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                      )}
                      <span>{preset.name}</span>
                    </span>
                    <span
                      className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                        preset.category === 'topo'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                          : preset.category === 'satellite'
                          ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/30'
                          : preset.category === 'vectors'
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30'
                          : 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30'
                      }`}
                    >
                      {preset.category}
                    </span>
                  </div>

                  <p className={`text-[10px] leading-relaxed ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {preset.details}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px]">
                    <span className="text-zinc-500 truncate max-w-[200px]" title={preset.attribution}>
                      {preset.attribution}
                    </span>

                    <button
                      disabled={isAlreadyAdded}
                      onClick={() => {
                        if (onAddDataLayer) {
                          onAddDataLayer({
                            id: preset.id,
                            name: preset.name,
                            category: preset.category,
                            type: preset.type,
                            details: preset.details,
                            visible: true,
                            opacity: preset.defaultOpacity,
                            blendMode: preset.defaultBlendMode,
                            displacementScale: preset.defaultDisplacementScale,
                            elevationEncoding: preset.elevationEncoding,
                            sunAzimuth: 315,
                            sunAltitude: 45,
                            hillshadeIntensity: 0.65,
                            url: preset.url,
                            renderStyle: preset.renderStyle,
                          });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-bold border transition-all flex items-center gap-1.5 ${
                        isAlreadyAdded
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 cursor-default ring-1 ring-emerald-500/30 font-extrabold'
                          : isLight
                          ? 'bg-sky-600 text-white border-sky-700 hover:bg-sky-700 shadow-sm font-extrabold'
                          : 'bg-sky-500/25 text-sky-200 border-sky-400/60 hover:bg-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.3)] font-extrabold'
                      }`}
                    >
                      {isAlreadyAdded ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Added ✓</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Add Layer</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
