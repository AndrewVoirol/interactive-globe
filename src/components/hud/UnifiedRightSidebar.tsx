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
import { TactileSwitch } from '../ui/TactileSwitch';
import { VernierSlider } from '../ui/VernierSlider';
import { SegmentedControl } from '../ui/SegmentedControl';
import { TactileButton } from '../ui/TactileButton';

const PIGMENT_SWATCHES: Record<0 | 1 | 2, Array<{ name: string; hex: string; depth: string }>> = {
  0: [
    { name: 'Abyssal Trench', hex: '#0f171f', depth: '-11,000m' },
    { name: 'Mid-Ocean Ridge', hex: '#22384a', depth: 'Shelf Break' },
    { name: 'Turquoise Bank', hex: '#3b788a', depth: 'Coastal' },
    { name: 'Parchment Land', hex: '#cbb692', depth: 'Steppe' },
    { name: 'Alpine Ridge', hex: '#f4ede1', depth: 'Glacial' },
  ],
  1: [
    { name: 'Marine Indigo', hex: '#263b52', depth: '-11,000m' },
    { name: 'Shelf Celadon', hex: '#77998b', depth: 'Shelf Break' },
    { name: 'Dune Ochre', hex: '#cfb588', depth: 'Coastal' },
    { name: 'Umber Foothill', hex: '#9e6d50', depth: 'Steppe' },
    { name: 'Glacial White', hex: '#fdfcf9', depth: 'Glacial' },
  ],
  2: [
    { name: 'Exposed Prussiate', hex: '#0e1824', depth: '-11,000m' },
    { name: 'Prussian Indigo', hex: '#162b42', depth: 'Shelf Break' },
    { name: 'Drafting Cobalt', hex: '#294d75', depth: 'Coastal' },
    { name: 'Washed Cerulean', hex: '#4f79a3', depth: 'Steppe' },
    { name: 'Chalk Ruling Pen', hex: '#e8edf2', depth: 'Glacial' },
  ],
};

// --- Tactile Instrument Components (Delegating to Standardized UI Primitives) ---

interface KnurledSlideSwitchProps {
  checked: boolean;
  onChange?: () => void;
  title: string;
  label: string;
  sublabel?: string;
  theme?: 0 | 1 | 2;
  isLight?: boolean;
}

const KnurledSlideSwitch: React.FC<KnurledSlideSwitchProps> = ({
  checked,
  onChange,
  title,
  label,
  sublabel,
}) => {
  return (
    <TactileSwitch
      checked={checked}
      onChange={() => onChange?.()}
      title={title}
      label={label}
      sublabel={sublabel}
    />
  );
};

interface VernierSliderWithStepperProps {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  readout: string;
  onChange?: (v: number) => void;
  theme?: 0 | 1 | 2;
  isLight?: boolean;
}

const VernierSliderWithStepper: React.FC<VernierSliderWithStepperProps> = ({
  id,
  label,
  sublabel,
  value,
  min,
  max,
  step,
  readout,
  onChange,
}) => {
  return (
    <VernierSlider
      id={id}
      label={label}
      sublabel={sublabel}
      value={value}
      min={min}
      max={max}
      step={step}
      readout={readout}
      onChange={onChange}
    />
  );
};

const OpticalReticlePip: React.FC<{ active: boolean; theme?: 0 | 1 | 2 }> = ({ active }) => {
  return (
    <div
      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors shadow-sm ${
        active
          ? 'border-[var(--theme-reticle-ring-active)] bg-[var(--theme-reticle-ring-active)]/20 shadow-[0_0_8px_var(--theme-reticle-ring-active)]'
          : 'border-current/30 bg-transparent opacity-50'
      }`}
    >
      <span
        className={`reticle-pip w-1.5 h-1.5 rounded-full transition-transform ${
          active
            ? 'scale-100 opacity-100 bg-[var(--theme-reticle-pip-active)]'
            : 'scale-0 opacity-0 bg-transparent'
        }`}
      />
    </div>
  );
};

export interface UnifiedRightSidebarProps {
  isZenMode: boolean;
  onZenToggle: () => void;
  theme: 0 | 1 | 2;
  onThemeToggle: () => void;
  onSelectThemeMode?: (mode: 0 | 1 | 2) => void;
  showSoundings?: boolean;
  onSoundingsToggle?: () => void;
  showTriangulation?: boolean;
  onTriangulationToggle?: () => void;
  showCartouche?: boolean;
  onCartoucheToggle?: () => void;
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
  onSelectThemeMode,
  showSoundings = true,
  onSoundingsToggle,
  showTriangulation = false,
  onTriangulationToggle,
  showCartouche = true,
  onCartoucheToggle,
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

  type SidebarPlate = 'all' | 'survey' | 'scene' | 'paradigms' | 'planetary' | 'layers';
  const [activePlate, setActivePlate] = useState<SidebarPlate>('all');

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

  // Auto-tune optimal cartographic settings when switching physical mediums
  const handleSelectMedium = (targetMode: 0 | 1 | 2) => {
    if (onSelectThemeMode) {
      onSelectThemeMode(targetMode);
    } else {
      if (theme !== targetMode) onThemeToggle();
    }
    if (primaryLayerId) {
      if (targetMode === 1) {
        // Cream Cotton Rag (Swiss Alpine Relief: Imhof NW sweetspot & razor arêtes)
        onHillshadeChangeDataLayer?.(primaryLayerId, 315, 0.70, 45);
        onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.14);
        onPeakExponentChangeDataLayer?.(primaryLayerId, 1.6);
        onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.65);
        onWaterClarityChangeDataLayer?.(primaryLayerId, 0.70);
        onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
      } else if (targetMode === 2) {
        // Prussian Cyanotype (Ferroprussiate Blueprint: high-contrast draft hachure)
        onHillshadeChangeDataLayer?.(primaryLayerId, 315, 0.65, 50);
        onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.11);
        onPeakExponentChangeDataLayer?.(primaryLayerId, 1.4);
        onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.75);
        onWaterClarityChangeDataLayer?.(primaryLayerId, 0.60);
        onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
      } else {
        // Marie Tharp (Physiographic Ocean Floor: deep abyssal clarity & rift lineaments)
        onHillshadeChangeDataLayer?.(primaryLayerId, 300, 0.60, 40);
        onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.12);
        onPeakExponentChangeDataLayer?.(primaryLayerId, 1.3);
        onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.60);
        onWaterClarityChangeDataLayer?.(primaryLayerId, 0.85);
        onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
      }
    }
  };

  // Auto-close catalog if user presses Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCatalogOpen) {
        setIsCatalogOpen(false);
      }
    };
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCatalogOpen]);

  // Planetary instrumentation layer state
  const noaaLayer = dataLayers.find((l) => l.id === 'noaa-gfs-wind');
  const isNoaaActive = noaaLayer ? noaaLayer.visible : false;

  const starlinkLayer = dataLayers.find((l) => l.id === 'starlink-iss-orbits');
  const isStarlinkActive = starlinkLayer ? starlinkLayer.visible : false;

  const jetstreamLayer = dataLayers.find((l) => l.id === 'noaa-gfs-jetstream');
  const isJetstreamActive = jetstreamLayer ? jetstreamLayer.visible : false;

  const craneLayer = dataLayers.find((l) => l.id === 'origami-crane-companion');
  const isCraneActive = craneLayer ? craneLayer.visible : false;

  const [craneTelemetry, setCraneTelemetry] = useState<{
    alt: number;
    speed: number;
    variometer: number;
  } | null>(null);

  useEffect(() => {
    if (!isCraneActive) {
      setCraneTelemetry(null);
      return;
    }
    const interval = setInterval(() => {
      const engine = (window as any).__WEBGPU_ENGINE__;
      if (engine && typeof engine.getCraneState === 'function') {
        const s = engine.getCraneState();
        if (s) {
          setCraneTelemetry({
            alt: Math.round(s.altitude),
            speed: Math.round(s.airspeed * 3.6),
            variometer: Number(s.variometer.toFixed(1)),
          });
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isCraneActive]);

  const handleTogglePlanetaryLayer = (
    id: 'noaa-gfs-wind' | 'starlink-iss-orbits' | 'noaa-gfs-jetstream' | 'origami-crane-companion'
  ) => {
    const existing = dataLayers.find((l) => l.id === id);
    if (existing) {
      onToggleDataLayer?.(id);
    } else {
      const preset = getPresetById(id);
      if (preset && onAddDataLayer) {
        onAddDataLayer({
          id: preset.id,
          name: preset.name,
          category: preset.category,
          type: preset.type,
          details: preset.details,
          visible: true,
          opacity: preset.defaultOpacity,
          blendMode: preset.defaultBlendMode,
          url: preset.url,
        });
      }
    }
  };

  if (isZenMode) return null;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. Primary Unified Right Sidebar Dock                                     */}
      {/* ========================================================================= */}
      <div className="fixed top-4 right-4 z-20 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-500 origin-top ease-out">
        <div
          className={`rounded-[3px] border shadow-2xl p-3 text-xs flex flex-col sidebar-spring-transition relative scroll-curl-lip ${
            isSidebarOpen ? 'max-h-[calc(100vh-2rem)]' : 'max-h-[82px] overflow-hidden'
          } ${
            theme === 1
              ? 'paper-cream border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] shadow-2xl shadow-[#d8cfbc]/40'
              : theme === 2
              ? 'paper-cyanotype border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] shadow-2xl shadow-[#071320]/80'
              : 'paper-tharp border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] shadow-2xl shadow-[#080d12]/80'
          }`}
          style={{
            fontFamily: 'var(--theme-font-telemetry)',
          }}
        >
          {/* Subtle Inner Drafting Neatline Rule */}
          <div className="pointer-events-none absolute inset-1 rounded-[2px] border border-[var(--theme-neatline-border)] opacity-30" />

          {/* --------------------------------------------------------------------- */}
          {/* Row 1: Engine Controls & System Status Bar                            */}
          {/* --------------------------------------------------------------------- */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--theme-panel-header-border)] gap-1.5">
            {/* Left Controls: Telemetry Status & Engine Config */}
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Live FPS Badge (Fixed width, cohesive gap, no layout shift) */}
              <div className="flex items-center justify-center gap-1.5 w-16 shrink-0 px-1.5 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-primary)] font-bold text-nano tabular-nums transition-colors">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    fps >= 100
                      ? 'bg-[var(--theme-text-accent)] shadow-[0_0_8px_rgba(197,160,89,0.8)]'
                      : fps >= 55
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                      : 'bg-amber-400'
                  }`}
                ></span>
                <span
                  className={`w-5 text-right tabular-nums ${
                    fps >= 100
                      ? 'text-[var(--theme-text-accent)] font-extrabold'
                      : fps >= 55
                      ? 'text-emerald-500 font-extrabold'
                      : 'text-amber-500 font-extrabold'
                  }`}
                >
                  {fps}
                </span>
                <span className="text-nano font-normal opacity-60">FPS</span>
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
                className={`px-2 py-1 rounded-[2px] text-micro font-bold border transition-all flex items-center gap-1.5 shrink-0 ${
                  backend === 'webgpu'
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                    : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-control-hover-border)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    backend === 'webgpu' ? 'bg-[var(--theme-text-accent)] animate-pulse' : 'bg-emerald-400'
                  }`}
                ></span>
                <span>{backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}</span>
                <span className="text-nano opacity-60 font-normal">⇄</span>
              </button>

              {/* Grid Resolution Switch */}
              <div className="flex items-center rounded-[2px] p-0.5 border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] shrink-0 gap-0.5">
                <button
                  onClick={() => onResolutionChange('100k')}
                  title="100,000 Fibonacci Nodes (High Performance)"
                  className={`px-1.5 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
                    resolution === '100k'
                      ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-sm'
                      : 'text-[var(--theme-control-text)] hover:text-[var(--theme-control-hover-text)] hover:bg-[var(--theme-control-hover-bg)]'
                  }`}
                >
                  100K
                </button>
                <button
                  onClick={() => onResolutionChange('1M')}
                  title="1,000,000 Volumetric Grid Nodes (Standard Resolution)"
                  className={`px-1.5 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
                    resolution === '1M'
                      ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-sm'
                      : 'text-[var(--theme-control-text)] hover:text-[var(--theme-control-hover-text)] hover:bg-[var(--theme-control-hover-bg)]'
                  }`}
                >
                  1M
                </button>
                {resolution !== '100k' && resolution !== '1M' && (
                  <button
                    onClick={() => onResolutionChange(resolution)}
                    title={`${resolution.toUpperCase()} Volumetric Nodes (Active)`}
                    className={`px-1.5 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
                      resolution === '16M'
                        ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                        : 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-sm'
                    }`}
                  >
                    {resolution.toUpperCase()}
                  </button>
                )}
              </div>
            </div>

            {/* Right Controls: Audio & Theme Toggles */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Audio Synthesizer Mute/Unmute */}
              {onAudioMuteToggle && (
                <button
                  onClick={onAudioMuteToggle}
                  title={
                    isAudioMuted
                      ? 'Web Audio Synthesizer: Muted (Click to Unmute)'
                      : 'Web Audio Synthesizer: Active (Click to Mute)'
                  }
                  className={`p-1.5 rounded-[2px] border transition-all flex items-center shrink-0 ${
                    !isAudioMuted
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40 shadow-sm'
                      : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
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

              {/* Archival Physical Medium Cycle (Tharp / Cream / Cyanotype) */}
              <button
                onClick={onThemeToggle}
                aria-label={theme === 1 ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
                title={
                  theme === 1
                    ? 'Switch to Dark Cyber Palette (Press T)'
                    : theme === 2
                    ? 'Switch to Light Monochrome Palette (Press T)'
                    : 'Switch to Light Monochrome Palette (Press T)'
                }
                className="px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-control-hover-border)] text-nano font-mono tracking-tight transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 bg-[var(--theme-pulse-indicator)] shadow-[0_0_6px_var(--theme-pulse-indicator)]"
                />
                <span className="font-bold text-nano uppercase tracking-wider text-[var(--theme-text-primary)]">
                  {theme === 0 ? 'Tharp' : theme === 1 ? 'Cream' : 'Cyanotype'}
                </span>
              </button>
            </div>
          </div>

          {/* --------------------------------------------------------------------- */}
          {/* Row 2: Title & Primary Window Controls                                */}
          {/* --------------------------------------------------------------------- */}
          <div className="flex items-center justify-between py-2 border-b border-[var(--theme-panel-header-border)]">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  mode === 4
                    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                    : mode === 3
                    ? 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]'
                    : mode === 2
                    ? 'bg-[var(--theme-pulse-indicator)] shadow-[0_0_10px_var(--theme-pulse-indicator)]'
                    : mode === 1
                    ? 'bg-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.8)]'
                    : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                } animate-pulse`}
              ></span>
              <span className="cartouche-title text-title font-black tracking-wider uppercase text-[var(--theme-text-primary)]">
                INDICATRIX // CONTROLS
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onZenToggle}
                title="Zen Presentation Mode (Press H to hide UI)"
                className="text-nano font-bold px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] transition-all"
              >
                Zen (H)
              </button>
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="tactile-btn text-nano font-bold px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] transition-all"
                title={isSidebarOpen ? 'Roll up drafting panel' : 'Unfurl drafting panel'}
              >
                {isSidebarOpen ? 'Roll Up' : 'Unfurl'}
              </button>
            </div>
          </div>

          {/* --------------------------------------------------------------------- */}
          {/* Expandable Scroll Drawer (Animated Roll-Up & Unfurl Spring Mechanics) */}
          {/* --------------------------------------------------------------------- */}
          <div
            className={`sidebar-spring-transition flex flex-col flex-1 min-h-0 overflow-hidden ${
              isSidebarOpen
                ? 'opacity-100 max-h-[calc(100vh-8.5rem)] mt-1'
                : 'opacity-0 max-h-0 pointer-events-none'
            }`}
          >
            {/* Row 3: Drafting Plate Navigation Strip */}
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--theme-panel-header-border)] gap-1 text-nano font-mono uppercase tracking-wider overflow-x-auto scrollbar-none shrink-0">
              {(
                [
                  { id: 'all', label: 'ALL' },
                  { id: 'survey', label: 'SURVEY' },
                  { id: 'scene', label: 'SCENE' },
                  { id: 'paradigms', label: 'PARADIGMS' },
                  { id: 'planetary', label: 'PLANETARY' },
                  { id: 'layers', label: 'LAYERS' },
                ] as const
              ).map((tab) => {
                const isActive = activePlate === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActivePlate(tab.id)}
                    className={`px-1.5 py-1 rounded-[2px] font-bold transition-all border shrink-0 ${
                      isActive
                        ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                        : 'border-transparent text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Main Body (Expandable) */}
            <div className="mt-2.5 space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
              {/* ================================================================= */}
              {/* PLATE 1: SURVEY & ARCHIVAL PHYSICAL MEDIUM                        */}
              {/* ================================================================= */}
              {(activePlate === 'all' || activePlate === 'survey') && (
                <div className="space-y-2.5">
                  {/* Archival Physical Medium & Mineral Swatch Ramp */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2.5 transition-all shadow-sm">
                    <div className="flex items-center justify-between text-micro font-extrabold uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{
                            backgroundColor: theme === 0 ? '#00e5ff' : theme === 1 ? '#bf6540' : '#4fa3e3',
                            boxShadow: theme === 0 ? '0 0 8px rgba(0,229,255,0.8)' : theme === 2 ? '0 0 8px rgba(79,163,227,0.8)' : 'none',
                          }}
                        />
                        <span className="text-[var(--theme-text-primary)]">
                          Physical Medium
                        </span>
                      </span>
                      <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-accent)]">
                        {theme === 0 ? 'Marie Tharp' : theme === 1 ? '100% Cotton Rag' : 'Ferroprussiate'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => handleSelectMedium(0)}
                        title="Marie Tharp Physiographic: Oceanic abyss, turquoise shelf, parchment continents"
                        className={`tactile-btn py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all ${
                          theme === 0
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-black shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                        }`}
                      >
                        <OpticalReticlePip active={theme === 0} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-black tracking-tight">Tharp</span>
                          <span className="text-nano uppercase font-bold tracking-tight opacity-75">Physiographic</span>
                        </div>
                      </button>

                      <button
                        onClick={() => handleSelectMedium(1)}
                        title="Cream Rag Paper: Eduard Imhof Swiss Alpine watercolor relief on 100% cotton rag"
                        className={`tactile-btn py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all ${
                          theme === 1
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-black shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                        }`}
                      >
                        <OpticalReticlePip active={theme === 1} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-black tracking-tight">Cream Rag</span>
                          <span className="text-nano uppercase font-bold tracking-tight opacity-75">Swiss Relief</span>
                        </div>
                      </button>

                      <button
                        onClick={() => handleSelectMedium(2)}
                        title="Prussian Cyanotype: Ferroprussiate blueprint & technical drafting linen"
                        className={`tactile-btn py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all ${
                          theme === 2
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-black shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                        }`}
                      >
                        <OpticalReticlePip active={theme === 2} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-black tracking-tight">Prussian</span>
                          <span className="text-nano uppercase font-bold tracking-tight opacity-75">Cyanotype</span>
                        </div>
                      </button>
                    </div>

                    {/* Tactile Watercolor Half-Pan Pigment Strip */}
                    <div className="pt-1 border-t border-[var(--theme-card-border)] space-y-1">
                      <div className="flex items-center justify-between text-nano uppercase tracking-wider opacity-75 font-mono">
                        <span className="text-[var(--theme-text-accent)]">
                          Hypsometric Pigment Pans
                        </span>
                        <span className="font-serif-body italic text-micro opacity-80">
                          Hand-Ground Minerals
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-1">
                        {PIGMENT_SWATCHES[theme].map((swatch, idx) => (
                          <div
                            key={idx}
                            className="p-1 rounded-[2px] border border-[var(--theme-card-border)] bg-[var(--theme-control-bg)] text-center flex flex-col items-center gap-1 transition-all shadow-sm"
                            title={`${swatch.name} (${swatch.hex}) · ${swatch.depth}`}
                          >
                            <div
                              className="w-full h-3.5 rounded-[1px] border border-black/20 shadow-inner"
                              style={{ backgroundColor: swatch.hex }}
                            />
                            <div className="text-nano font-serif-title truncate w-full tracking-tight opacity-90 leading-tight text-[var(--theme-text-primary)]">
                              {swatch.name}
                            </div>
                            <div className="text-nano font-mono opacity-60 uppercase tracking-tighter text-[var(--theme-text-secondary)]">
                              {swatch.depth}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Cartographic Rendering Direction Switcher (A / B / C) */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                    <div className="flex items-center justify-between text-micro font-extrabold uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-text-accent)]" />
                        <span className="text-[var(--theme-text-primary)]">Cartographic Style</span>
                      </span>
                      <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-accent)]">
                        {activeDirection === 'architectural'
                          ? 'A: Relief'
                          : activeDirection === 'hybrid'
                          ? 'B: Depth'
                          : 'C: Orbital'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Direction A */}
                      <button
                        onClick={() => {
                          onSelectRenderStyle?.('architectural');
                        }}
                        title="Direction A: Architectural Topographic Relief (Monochrome Eduard Imhof hillshading & dual-tier isocontours)"
                        className={`tactile-btn py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                          activeDirection === 'architectural'
                            ? 'bg-[var(--theme-direction-a-bg)] text-[var(--theme-direction-a-text)] border-[var(--theme-direction-a-border)] ring-1 ring-[var(--theme-direction-a-ring)] font-black shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-direction-a-border)]'
                        }`}
                      >
                        <OpticalReticlePip active={activeDirection === 'architectural'} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-black tracking-tight">A: Relief</span>
                          <span className="text-nano uppercase font-bold tracking-tight opacity-75">Architectural</span>
                        </div>
                      </button>

                      {/* Direction B */}
                      <button
                        onClick={() => {
                          onSelectRenderStyle?.('hybrid');
                        }}
                        title="Direction B: Hydrosphere & Bathymetric Depth (Two-Surface Model: smooth sea level + Beer-Lambert depth)"
                        className={`tactile-btn py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                          activeDirection === 'hybrid'
                            ? 'bg-[var(--theme-direction-b-bg)] text-[var(--theme-direction-b-text)] border-[var(--theme-direction-b-border)] ring-1 ring-[var(--theme-direction-b-ring)] font-black shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-direction-b-border)]'
                        }`}
                      >
                        <OpticalReticlePip active={activeDirection === 'hybrid'} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-black tracking-tight">B: Depth</span>
                          <span className="text-nano uppercase font-bold tracking-tight opacity-75">Hydrosphere</span>
                        </div>
                      </button>

                      {/* Direction C */}
                      <button
                        onClick={() => {
                          onSelectRenderStyle?.('photoreal');
                        }}
                        title="Direction C: NASA Blue Marble (True-color orbital photography + 3D DEM relief)"
                        className={`tactile-btn py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                          activeDirection === 'photoreal'
                            ? 'bg-[var(--theme-direction-c-bg)] text-[var(--theme-direction-c-text)] border-[var(--theme-direction-c-border)] ring-1 ring-[var(--theme-direction-c-ring)] font-black shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-direction-c-border)]'
                        }`}
                      >
                        <OpticalReticlePip active={activeDirection === 'photoreal'} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-black tracking-tight">C: Orbital</span>
                          <span className="text-nano uppercase font-bold tracking-tight opacity-75">Photoreal</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Volumetric Node Scaling Card (100K - 16M Tiers) */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                    <div className="flex items-center justify-between text-micro font-extrabold uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--theme-pulse-indicator)]"></span>
                        <span className="text-[var(--theme-text-primary)]">
                          Volumetric Scale
                        </span>
                      </span>
                      <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-accent)]">
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
                          className={`py-1.5 px-0.5 rounded-[2px] text-center flex flex-col items-center justify-center border transition-all ${
                            resolution === tier
                              ? tier === '16M'
                                ? 'bg-amber-500 text-black border-amber-400 font-extrabold shadow-sm'
                                : 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-extrabold shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                              : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                          }`}
                        >
                          <span className="text-nano font-black">{tier.toUpperCase()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* PLATE 2: DEDICATED DIRECT SCENE CONTROLS (WebGPU Uniforms)         */}
              {/* ================================================================= */}
              {(activePlate === 'all' || activePlate === 'scene') && (
                <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                  <div className="flex items-center justify-between text-micro font-extrabold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[var(--theme-pulse-indicator)] shadow-sm animate-pulse"></span>
                      <span className="text-[var(--theme-text-primary)]">Scene Controls</span>
                    </span>
                    <span className="text-nano font-mono text-[var(--theme-text-accent)] font-bold">
                      Direct WebGPU Uniforms
                    </span>
                  </div>

                  <div className="space-y-2 text-micro">
                    {/* Instrument 1: 2D Polar Sun Compass (Sun Azimuth: 0-360°, Sun Alt: 10-85°) */}
                    <PolarSunCompass
                      theme={theme}
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
                      theme={theme}
                      displacementScale={primaryLayer?.displacementScale ?? 0.08}
                      peakExponent={primaryLayer?.peakExponent ?? 1.4}
                      onDisplacementChange={(scale) => onDisplacementScaleChangeDataLayer?.(primaryLayerId, scale)}
                      onPeakExponentChange={(exponent) => onPeakExponentChangeDataLayer?.(primaryLayerId, exponent)}
                      isLight={isLight}
                    />

                    {/* Instrument 3: Hydrostatic Bathymetric Tide Gauge (Sea Level: -150m to +100m, Clarity: 10%-100%) */}
                    <BathymetricTideGauge
                      theme={theme}
                      seaLevelOffset={primaryLayer?.seaLevelOffset ?? 0}
                      waterClarity={primaryLayer?.waterClarity ?? 0.75}
                      onSeaLevelChange={(offset) => onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, offset)}
                      onWaterClarityChange={(clarity) => onWaterClarityChangeDataLayer?.(primaryLayerId, clarity)}
                      isLight={isLight}
                    />

                    {/* Crevice AO (Vernier Slider & Precision Stepper) */}
                    <div className="pt-1">
                      <VernierSliderWithStepper
                        id="sidebar-crevice-ao"
                        label="Crevice AO"
                        sublabel="Ambient Occlusion"
                        value={primaryLayer?.ambientOcclusion ?? 0.65}
                        min={0.0}
                        max={1.0}
                        step={0.05}
                        readout={`${Math.round((primaryLayer?.ambientOcclusion ?? 0.65) * 100)}%`}
                        onChange={(v) => onAmbientOcclusionChangeDataLayer?.(primaryLayerId, v)}
                        theme={theme}
                        isLight={isLight}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* PLATE 3: MORPH PARADIGMS, PHYSICS & OVERLAYS                      */}
              {/* ================================================================= */}
              {(activePlate === 'all' || activePlate === 'paradigms') && (
                <div className="space-y-2.5">
                  {/* Morph Paradigms (Modes 0–4) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                        Morph Paradigm (1–5)
                      </span>
                      <span className="text-nano font-mono opacity-60 text-[var(--theme-text-muted)]">Active: Mode {mode + 1}</span>
                    </div>

                    {/* Compact Rotary Vernier Stepper for Paradigms 0-4 */}
                    <div className="p-1.5 rounded-[2px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text-primary)] shadow-sm">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => onModeChange(((mode + 4) % 5) as SimulationMode)}
                          title="Previous Simulation Paradigm (or press 1-5)"
                          className="tactile-btn px-2.5 py-1 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-micro font-bold"
                        >
                          ◀
                        </button>

                        <div className="flex flex-col items-center flex-1 px-2 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-micro tracking-wider truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                mode === 0
                                  ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                                  : mode === 1
                                  ? 'bg-slate-300 shadow-[0_0_6px_rgba(203,213,225,0.8)]'
                                  : mode === 2
                                  ? 'bg-[var(--theme-pulse-indicator)] shadow-[0_0_6px_var(--theme-pulse-indicator)]'
                                  : mode === 3
                                  ? 'bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.8)]'
                                  : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                              }`}
                            />
                            <span className="text-[var(--theme-text-accent)]">
                              {mode === 0 && '1: LINEAR DILATION'}
                              {mode === 1 && '2: CYLINDER UNROLL'}
                              {mode === 2 && '3: GRIFFITH RUPTURE'}
                              {mode === 3 && '4: FLUID VORTEX'}
                              {mode === 4 && '5: DYMAXION NET'}
                            </span>
                          </div>
                          <span className="text-nano opacity-60 font-mono truncate text-[var(--theme-text-secondary)]">
                            {mode === 0 && 'Spherical-to-Planar Linear Mix · [Key 1]'}
                            {mode === 1 && 'Mercator Longitudinal Seam Unroll · [Key 2]'}
                            {mode === 2 && 'Antimeridian LEFM Fracture · [Key 3]'}
                            {mode === 3 && 'Navier-Stokes Hydrodynamic Advection · [Key 4]'}
                            {mode === 4 && 'Fuller 20-Facet Icosahedral Net · [Key 5]'}
                          </span>
                        </div>

                        <button
                          onClick={() => onModeChange(((mode + 1) % 5) as SimulationMode)}
                          title="Next Simulation Paradigm (or press 1-5)"
                          className="tactile-btn px-2.5 py-1 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-micro font-bold"
                        >
                          ▶
                        </button>
                      </div>

                      {/* Vernier Detent Quick-Index Pips (Linear, Scroll, Fracture, Fluid, Dymaxion) */}
                      <div className="grid grid-cols-5 gap-1 mt-1.5 pt-1.5 border-t border-[var(--theme-card-border)]">
                        {([
                          { id: 0, label: 'Linear', title: 'Mode 1: Linear Dilation (Press 1)' },
                          { id: 1, label: 'Scroll', title: 'Mode 2: Cylinder Unroll / Scroll (Press 2)' },
                          { id: 2, label: 'Fracture', title: 'Mode 3: Griffith Rupture / Fracture (Press 3)' },
                          { id: 3, label: 'Fluid', title: 'Mode 4: Fluid Vortex Advection (Press 4)' },
                          { id: 4, label: 'Dymaxion', title: 'Mode 5: Fuller Dymaxion Net (Press 5)' },
                        ] as const).map((m) => {
                          const isSel = mode === m.id;
                          return (
                            <button
                              key={m.id}
                              onClick={() => onModeChange(m.id as SimulationMode)}
                              title={m.title}
                              className={`tactile-btn py-1 rounded-[2px] text-nano font-mono uppercase tracking-tight text-center border transition-all ${
                                isSel
                                  ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-bold shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                                  : 'border-transparent text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* View Mode & Cursor Dynamics */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Layer Mode (Both, Points, Wireframe) */}
                    <SegmentedControl
                      size="sm"
                      value={layerMode}
                      onChange={(val) => onLayerModeChange(val as 0 | 1 | 2)}
                      options={[
                        { id: 0, label: 'Both', title: 'Display both point cloud and wireframe lattice' },
                        { id: 1, label: 'Points', title: 'Points Only: disable wireframe lattice' },
                        { id: 2, label: 'Wireframe', title: 'Wireframe Only: disable point vertices' },
                      ]}
                    />

                    {/* Cursor Physics Knurled Slide Switch */}
                    <div className="w-full pt-1">
                      <KnurledSlideSwitch
                        checked={cursorPhysicsEnabled}
                        onChange={() => onCursorPhysicsToggle(!cursorPhysicsEnabled)}
                        title="Toggle interactive raycast cursor dynamic physics & vortex forces"
                        label="Cursor Physics"
                        sublabel="Dynamic Vector Forces"
                        theme={theme}
                        isLight={isLight}
                      />
                    </div>
                  </div>

                  {/* Contextual Physical Simulation Parameters (Mode 2 / Mode 3) */}
                  {mode === 2 && (
                    <VernierSliderWithStepper
                      id="sidebar-fracture-intensity"
                      label="Fracture Intensity"
                      sublabel="Griffith LEFM Crack Propagation"
                      value={fractureIntensity ?? 1.0}
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      readout={`${(fractureIntensity ?? 1.0).toFixed(2)}x`}
                      onChange={(v) => onFractureIntensityChange?.(v)}
                      theme={theme}
                      isLight={isLight}
                    />
                  )}

                  {mode === 3 && (
                    <VernierSliderWithStepper
                      id="sidebar-vortex-strength"
                      label="Vortex Swirl Strength"
                      sublabel="Turbulent Lamb-Oseen Advection"
                      value={fluidVortexStrength ?? 1.0}
                      min={0.2}
                      max={3.0}
                      step={0.05}
                      readout={`${(fluidVortexStrength ?? 1.0).toFixed(2)}x`}
                      onChange={(v) => onFluidVortexStrengthChange?.(v)}
                      theme={theme}
                      isLight={isLight}
                    />
                  )}

                  {/* Geodesic Arcs & Overlays */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
                        Geodesic Arcs & Overlays
                      </span>
                      <span className="text-nano font-mono text-[var(--theme-text-muted)] opacity-80">
                        {activeOverlay === 'off' ? 'Disabled' : activeOverlay}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => onOverlayChange('off')}
                        className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border ${
                          activeOverlay === 'off'
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-extrabold'
                            : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] bg-[var(--theme-control-bg)]'
                        }`}
                      >
                        Off
                      </button>
                      <button
                        onClick={() => onOverlayChange('antipodes')}
                        title="Antipodal Geodesic Connectors (Red/Rose)"
                        className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border ${
                          activeOverlay === 'antipodes'
                            ? isLight
                              ? 'bg-rose-600 text-white border-rose-700 shadow-md font-extrabold ring-1 ring-rose-400'
                              : 'bg-rose-500/35 text-rose-200 border-rose-400/80 shadow-[0_0_10px_rgba(244,63,94,0.4)] ring-1 ring-rose-400/60 font-extrabold'
                            : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-rose-500 hover:border-rose-400/50 bg-[var(--theme-control-bg)]'
                        }`}
                      >
                        Antipodes
                      </button>
                      <button
                        onClick={() => onOverlayChange('conveyor')}
                        title="Global Oceanic Conveyor Belt Thermohaline Circulation (Sky Blue)"
                        className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border ${
                          activeOverlay === 'conveyor'
                            ? isLight
                              ? 'bg-sky-600 text-white border-sky-700 shadow-md font-extrabold ring-1 ring-sky-400'
                              : 'bg-sky-500/35 text-sky-200 border-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.4)] ring-1 ring-sky-400/60 font-extrabold'
                            : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-sky-500 hover:border-sky-400/50 bg-[var(--theme-control-bg)]'
                        }`}
                      >
                        Conveyor
                      </button>
                      <button
                        onClick={() => onOverlayChange('migration')}
                        title="Global Bird & Cetacean Migration Geodesic Arcs (Amber)"
                        className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border ${
                          activeOverlay === 'migration'
                            ? isLight
                              ? 'bg-amber-600 text-white border-amber-700 shadow-md font-extrabold ring-1 ring-amber-400'
                              : 'bg-amber-500/35 text-amber-200 border-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.4)] ring-1 ring-amber-400/60 font-extrabold'
                            : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-amber-500 hover:border-amber-400/50 bg-[var(--theme-control-bg)]'
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
                      className={`py-1.5 px-1 rounded-[2px] text-micro font-bold border transition-all text-center flex items-center justify-center gap-1.5 ${
                        showLandmarks
                          ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-extrabold'
                          : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showLandmarks
                            ? isLight
                              ? 'bg-emerald-500 animate-pulse'
                              : 'bg-emerald-400 animate-pulse'
                            : 'bg-zinc-500'
                        }`}
                      ></span>
                      <span>Landmarks</span>
                    </button>

                    {/* Tissot Indicatrix */}
                    <button
                      onClick={onTissotToggle}
                      title="Toggle Tissot Indicatrix Ellipses (Deformation Tensors)"
                      className={`py-1.5 px-1 rounded-[2px] text-micro font-bold border transition-all text-center flex items-center justify-center gap-1.5 ${
                        showTissot
                          ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)] font-extrabold'
                          : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showTissot ? 'bg-[var(--theme-pulse-indicator)] shadow-[0_0_6px_var(--theme-pulse-indicator)]' : 'bg-zinc-500'
                        }`}
                      ></span>
                      <span>Tissot</span>
                    </button>

                    {/* Vectors (V) */}
                    <button
                      onClick={onVectorsToggle}
                      title="Toggle Vector Coastlines & Rivers (Press V)"
                      className={`py-1.5 px-1 rounded-[2px] text-micro font-bold border transition-all text-center flex items-center justify-center gap-1.5 ${
                        showVectors
                          ? isLight
                            ? 'bg-amber-600 text-white border-amber-700 shadow-md font-extrabold ring-1 ring-amber-400'
                            : 'bg-amber-500/35 text-amber-200 border-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.4)] ring-1 ring-amber-400/60 font-extrabold'
                          : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
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

                  {/* Archival High-Touch Details (Dedicated Spaces & Overlays) */}
                  <div className="space-y-1 pt-1.5 border-t border-white/5">
                    <div className="flex items-center justify-between text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
                      <span>Archival Detail Overlays</span>
                      <span className="text-nano font-mono opacity-80">Cartographic Taxonomy</span>
                    </div>
                    <div className="space-y-1.5">
                      {/* Bathymetric Soundings */}
                      <KnurledSlideSwitch
                        checked={showSoundings}
                        onChange={onSoundingsToggle}
                        title="Toggle Bathymetric Spot Soundings (Ocean basin depths & historic fathom soundings)"
                        label="Soundings"
                        sublabel="Ocean Basin Fathom Depths"
                        theme={theme}
                        isLight={isLight}
                      />

                      {/* Triangulation Sightlines */}
                      <KnurledSlideSwitch
                        checked={showTriangulation}
                        onChange={onTriangulationToggle}
                        title="Toggle Geodetic Triangulation Sightlines & Survey Benchmarks"
                        label="Triangulation"
                        sublabel="Geodetic Survey Benchmarks"
                        theme={theme}
                        isLight={isLight}
                      />

                      {/* Title Cartouche */}
                      <KnurledSlideSwitch
                        checked={showCartouche}
                        onChange={onCartoucheToggle}
                        title="Toggle Archival Survey Title Cartouche & Scale Ratio"
                        label="Cartouche"
                        sublabel="Archival Seal & Projection Spec"
                        theme={theme}
                        isLight={isLight}
                      />
                    </div>
                  </div>

                  {/* Camera Target Snaps */}
                  <div className="space-y-1">
                    <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
                      Camera Target Snap
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-nano font-bold">
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
                            className="py-1 rounded-[2px] border transition-all border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] hover:bg-[var(--theme-card-bg)]"
                          >
                            {labels[snapKey]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tissot Distortion Metrics (when Tissot is active) */}
                  {showTissot && (
                    <div className="p-2.5 rounded-[2px] border text-micro space-y-1.5 tabular-nums bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]">
                      <div className="flex justify-between items-center text-nano uppercase tracking-wider font-bold">
                        <span>Distortion Tensor</span>
                        <span className="text-emerald-500 dark:text-emerald-400 font-extrabold">
                          {mode === 4 ? 'Isomeric (s ≈ 1.04x)' : 'Morphing Tensor'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-nano">
                        <div>
                          <span className="text-[var(--theme-text-muted)] block">Equatorial Area:</span>
                          <span className="font-bold">1.000x</span>
                        </div>
                        <div>
                          <span className="text-[var(--theme-text-muted)] block">Polar Dilation:</span>
                          <span className="font-bold">{mode === 4 ? '1.041x' : '1.000x'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* Plate 4: Planetary Instrumentation & Base Lattice                          */}
              {/* ========================================================================= */}
              {(activePlate === 'all' || activePlate === 'planetary') && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-black/10 dark:border-white/10">
                    <span className="text-body font-mono tracking-widest font-black uppercase text-zinc-500">
                      PLATE IV • PLANETARY INSTRUMENTATION
                    </span>
                  </div>

                  {/* Surface Clarity: Point Lattice Suppression Pill */}
                  <div className="flex items-center justify-between p-1.5 rounded-[2px] border text-micro bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]">
                    <span className="font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider text-nano">
                      Base Lattice:
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onLayerModeChange?.(2)}
                        className={`px-2 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
                          layerMode === 2
                            ? 'bg-emerald-500 text-black font-extrabold shadow-sm'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        Clean Terrain
                      </button>
                      <button
                        onClick={() => onLayerModeChange?.(0)}
                        className={`px-2 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
                          layerMode === 0
                            ? 'bg-sky-500 text-black font-extrabold shadow-sm'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        + Node Cloud
                      </button>
                    </div>
                  </div>

                  {/* Planetary Instrumentation: Dedicated Live Synced Toggles */}
                  <div className="p-2 rounded-[3px] border space-y-1.5 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)]">
                    <div className="flex items-center justify-between text-nano font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                      <span>Planetary Instrumentation</span>
                      <span className="flex items-center gap-1 text-emerald-400 font-mono animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        Live Synced
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {/* NOAA GFS Wind Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('noaa-gfs-wind')}
                        className={`p-1.5 rounded-[2px] border transition-all text-left flex flex-col justify-between gap-1 ${
                          isNoaaActive
                            ? 'border-sky-500/60 bg-sky-500/20 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-nano truncate">NOAA Wind</span>
                          <span className="flex items-center gap-1 text-nano font-bold px-1 py-0.5 rounded-[2px] bg-sky-500/20 text-sky-300 border border-sky-500/40">
                            Physics Model
                          </span>
                        </div>
                        <span className="text-nano text-[var(--theme-text-muted)] truncate">0.25° Operational</span>
                      </button>

                      {/* Starlink Orbits Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('starlink-iss-orbits')}
                        className={`p-1.5 rounded-[2px] border transition-all text-left flex flex-col justify-between gap-1 ${
                          isStarlinkActive
                            ? theme === 1
                              ? 'border-[#8c4820]/60 bg-[#8c4820]/15 text-[#2b241a] shadow-sm'
                              : theme === 2
                              ? 'border-[#4a729e]/80 bg-[#254263]/40 text-[#e8edf2] shadow-sm'
                              : 'border-purple-500/60 bg-purple-500/20 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.25)] ring-1 ring-purple-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-nano truncate">Starlink Orbits</span>
                          <span className="flex items-center gap-1 text-nano font-bold px-1 py-0.5 rounded-[2px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping"></span>
                            Live
                          </span>
                        </div>
                        <span className="text-nano text-[var(--theme-text-muted)] truncate">CelesTrak (110 Sats)</span>
                      </button>

                      {/* 250 hPa Jet Stream Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('noaa-gfs-jetstream')}
                        className={`p-1.5 rounded-[2px] border transition-all text-left flex flex-col justify-between gap-1 ${
                          isJetstreamActive
                            ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200 shadow-[0_0_8px_rgba(99,102,241,0.25)] ring-1 ring-indigo-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-nano truncate">Jet Stream</span>
                          <span className="flex items-center gap-1 text-nano font-bold px-1 py-0.5 rounded-[2px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            250 hPa
                          </span>
                        </div>
                        <span className="text-nano text-[var(--theme-text-muted)] truncate">High-Alt Core</span>
                      </button>

                      {/* Origami Crane Companion Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('origami-crane-companion')}
                        className={`p-1.5 rounded-[2px] border transition-all text-left flex flex-col justify-between gap-1 ${
                          isCraneActive
                            ? 'border-amber-500/60 bg-amber-500/20 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-nano truncate">Origami Crane</span>
                          <span className="flex items-center gap-1 text-nano font-bold px-1 py-0.5 rounded-[2px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {isCraneActive && craneTelemetry
                              ? `${craneTelemetry.variometer >= 0 ? '+' : ''}${craneTelemetry.variometer} m/s`
                              : 'Soaring'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full text-nano text-[var(--theme-text-muted)]">
                          <span className="truncate">
                            {isCraneActive && craneTelemetry
                              ? `${craneTelemetry.alt.toLocaleString()}m • ${craneTelemetry.speed} km/h`
                              : 'Mountain Wave'}
                          </span>
                          {isCraneActive && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                (window as any).__FOCUS_CRANE__?.();
                              }}
                              className="text-nano px-1 py-0.2 rounded-[2px] bg-amber-400/20 hover:bg-amber-400/40 text-amber-200 border border-amber-400/40 font-bold tracking-wider"
                              title="Focus Camera on Crane"
                            >
                              FOCUS
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* Plate 5: Cartographic Datasets & Layer Stack                              */}
              {/* ========================================================================= */}
              {(activePlate === 'all' || activePlate === 'layers') && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-black/10 dark:border-white/10">
                    <span className="text-body font-mono tracking-widest font-black uppercase text-zinc-500">
                      PLATE V • CARTOGRAPHIC DATASETS & LAYERS
                    </span>
                  </div>

                  {/* Data Layers Header Action */}
                  <div className="flex items-center justify-between">
                    <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
                      Active Datasets ({dataLayers.length})
                    </span>

                    <button
                      onClick={() => setIsCatalogOpen(!isCatalogOpen)}
                      className={`text-nano font-extrabold px-2.5 py-1 rounded-[2px] border transition-all flex items-center gap-1.5 ${
                        isCatalogOpen
                          ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-md font-extrabold'
                          : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>{isCatalogOpen ? 'Close Catalog' : '+ Catalog'}</span>
                    </button>
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
                            className={`p-2.5 rounded-[2px] border flex flex-col gap-2 text-micro transition-all ${
                              layer.visible
                                ? 'bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] shadow-sm'
                                : 'bg-[var(--theme-card-bg)]/50 border-[var(--theme-card-border)]/60 text-[var(--theme-text-muted)] opacity-60'
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
                                  <span className="leading-tight break-words text-nano font-bold" title={layer.name}>
                                    {layer.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 ml-4">
                                  {layer.id === 'starlink-iss-orbits' && (
                                    <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-[2px] border bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse shrink-0">
                                      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping"></span>
                                      Live Synced
                                    </span>
                                  )}
                                  {layer.id === 'noaa-gfs-wind' && (
                                    <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-[2px] border bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.4)] shrink-0">
                                      Physics Model
                                    </span>
                                  )}
                                  {layer.renderStyle && (
                                    <span className="text-nano uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-[2px] border bg-sky-500/15 text-sky-500 dark:text-sky-300 border-sky-500/30">
                                      {layer.renderStyle}
                                    </span>
                                  )}
                                  <span className="text-nano font-mono opacity-60">
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
                                  className={`p-1 rounded-[2px] border transition-all ${
                                    isFirst
                                      ? 'opacity-25 cursor-not-allowed border-transparent text-[var(--theme-text-muted)]'
                                      : 'border-[var(--theme-control-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
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
                                  className={`p-1 rounded-[2px] border transition-all ${
                                    isLast
                                      ? 'opacity-25 cursor-not-allowed border-transparent text-[var(--theme-text-muted)]'
                                      : 'border-[var(--theme-control-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
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
                                  className={`p-1 rounded-[2px] border transition-all ${
                                    layer.visible
                                      ? 'border-sky-400/80 bg-sky-500/20 text-sky-400 shadow-sm ring-1 ring-sky-400/40'
                                      : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] hover:border-[var(--theme-card-border-hover)]'
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
                                  className="p-1 rounded-[2px] border border-rose-500/30 text-rose-500 hover:bg-rose-500/20 transition-all"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Opacity & Blend Controls */}
                            <div className="grid grid-cols-2 gap-2 text-nano">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[var(--theme-text-muted)] font-bold">Opacity:</span>
                                <input
                                  id={`sidebar-opacity-${layer.id}`}
                                  name={`opacity-${layer.id}`}
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={layer.opacity ?? 0.85}
                                  onChange={(e) => onOpacityChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                  className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
                                />
                                <span className="w-7 text-right font-bold tabular-nums">
                                  {Math.round((layer.opacity ?? 0.85) * 100)}%
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-[var(--theme-text-muted)] font-bold">Blend:</span>
                                <select
                                  id={`sidebar-blend-${layer.id}`}
                                  name={`blend-${layer.id}`}
                                  value={layer.blendMode ?? preset?.defaultBlendMode ?? 0}
                                  onChange={(e) =>
                                    onBlendModeChangeDataLayer?.(layer.id, parseInt(e.target.value) as BlendModeType)
                                  }
                                  className="w-full py-0.5 px-1 rounded-[2px] text-nano font-bold border bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-text-primary)]"
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
                              <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-micro">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-500 dark:text-emerald-400 font-bold text-nano uppercase tracking-wider">
                                    3D Relief:
                                  </span>
                                  <input
                                    id={`sidebar-relief-${layer.id}`}
                                    name={`displacementScale-${layer.id}`}
                                    type="range"
                                    min="0"
                                    max="0.50"
                                    step="0.01"
                                    value={layer.displacementScale ?? preset?.defaultDisplacementScale ?? 0.08}
                                    onChange={(e) =>
                                      onDisplacementScaleChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                    }
                                    className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
                                  />
                                  <span className="w-8 text-right font-bold text-emerald-500 dark:text-emerald-300 tabular-nums">
                                    {(layer.displacementScale ?? preset?.defaultDisplacementScale ?? 0.08).toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-amber-500 dark:text-amber-400 font-bold text-nano uppercase tracking-wider">
                                    Sun Azimuth:
                                  </span>
                                  <input
                                    id={`sidebar-azimuth-${layer.id}`}
                                    name={`sunAzimuth-${layer.id}`}
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
                                    className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
                                  />
                                  <span className="w-8 text-right font-bold text-amber-500 dark:text-amber-300 tabular-nums">
                                    {Math.round(layer.sunAzimuth ?? 315)}°
                                  </span>
                                </div>

                                {/* Direction A: Valley Crevice Ambient Occlusion & Antialiased Contours */}
                                {(layer.renderStyle === 'architectural' || layer.id === 'architectural-topo-relief') && (
                                  <div className="pt-1.5 border-t border-white/5 space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-zinc-500 dark:text-zinc-400 font-bold text-nano uppercase tracking-wider">
                                        Crevice AO:
                                      </span>
                                      <input
                                        id={`sidebar-layer-ao-${layer.id}`}
                                        name={`layerAo-${layer.id}`}
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={layer.ambientOcclusion ?? 0.65}
                                        onChange={(e) =>
                                          onAmbientOcclusionChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
                                      />
                                      <span className="w-8 text-right font-bold text-zinc-500 dark:text-zinc-300 tabular-nums">
                                        {Math.round((layer.ambientOcclusion ?? 0.65) * 100)}%
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-nano text-emerald-500 dark:text-emerald-400 font-mono">
                                      <span>Contour Filter:</span>
                                      <span className="font-bold">fwidth() Anti-Aliased</span>
                                    </div>
                                  </div>
                                )}

                                {/* Direction B: Hydrosphere Depth, Sea Level, Clarity & Peak Exaggeration */}
                                {(layer.renderStyle === 'hybrid' || layer.id === 'hybrid-crust-hydrosphere') && (
                                  <div className="pt-1.5 border-t border-white/5 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-cyan-500 dark:text-cyan-400 font-bold text-nano uppercase tracking-wider">
                                        Sea Level:
                                      </span>
                                      <input
                                        id={`sidebar-layer-sealevel-${layer.id}`}
                                        name={`layerSeaLevel-${layer.id}`}
                                        type="range"
                                        min="-150"
                                        max="100"
                                        step="5"
                                        value={layer.seaLevelOffset ?? 0}
                                        onChange={(e) =>
                                          onSeaLevelOffsetChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
                                      />
                                      <span className="w-8 text-right font-bold text-cyan-500 dark:text-cyan-300 tabular-nums">
                                        {(layer.seaLevelOffset ?? 0) > 0 ? `+${layer.seaLevelOffset}m` : `${layer.seaLevelOffset ?? 0}m`}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sky-500 dark:text-sky-400 font-bold text-nano uppercase tracking-wider">
                                        Clarity:
                                      </span>
                                      <input
                                        id={`sidebar-layer-clarity-${layer.id}`}
                                        name={`layerClarity-${layer.id}`}
                                        type="range"
                                        min="0.10"
                                        max="1.00"
                                        step="0.05"
                                        value={layer.waterClarity ?? 0.75}
                                        onChange={(e) =>
                                          onWaterClarityChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
                                      />
                                      <span className="w-8 text-right font-bold text-sky-500 dark:text-sky-300 tabular-nums">
                                        {Math.round((layer.waterClarity ?? 0.75) * 100)}%
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <span className="text-amber-500 dark:text-amber-400 font-bold text-nano uppercase tracking-wider">
                                        Peak Sharp:
                                      </span>
                                      <input
                                        id={`sidebar-layer-peaksharp-${layer.id}`}
                                        name={`layerPeakSharp-${layer.id}`}
                                        type="range"
                                        min="1.0"
                                        max="2.0"
                                        step="0.1"
                                        value={layer.peakExponent ?? 1.4}
                                        onChange={(e) =>
                                          onPeakExponentChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                                        }
                                        className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
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
                                <div className="flex items-center justify-between text-nano text-zinc-400 font-bold">
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
                      <div className="p-4 rounded-[2px] border text-micro text-center italic border-[var(--theme-card-border)] text-[var(--theme-text-muted)] bg-[var(--theme-card-bg)]/40">
                        No active cartographic data layers. Click [+ Catalog] to browse and add datasets.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Telemetry Footer */}
              <div className="pt-2 border-t border-[var(--theme-card-border)] text-nano grid grid-cols-2 gap-2 tabular-nums text-[var(--theme-text-secondary)]">
                <div>
                  <span className="block text-nano uppercase font-bold tracking-wider opacity-60">
                    Center Coordinate
                  </span>
                  <span className="font-bold text-[var(--theme-text-primary)]">
                    {latStr} {lonStr}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-nano uppercase font-bold tracking-wider opacity-60">
                    Nominal Scale
                  </span>
                  <span className="font-bold text-[var(--theme-text-primary)]">{mapScaleStr}</span>
                </div>
                {backend === 'webgpu' && gpuReport && (
                  <div className="col-span-2 pt-1.5 mt-0.5 border-t border-[var(--theme-card-border)] flex flex-col gap-1 text-nano text-[var(--theme-text-secondary)]">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-sky-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                        GPU Profiler
                      </span>
                      <span className="text-emerald-400 font-mono">Total: {(gpuReport.totalGpuMs ?? 0).toFixed(2)}ms</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 font-mono opacity-80 text-nano">
                      <span>Sim: {(gpuReport.computeMs ?? 0).toFixed(2)}ms</span>
                      <span>Relief: {(gpuReport.reliefMs ?? 0).toFixed(2)}ms</span>
                      <span>Lines: {(gpuReport.linesMs ?? 0).toFixed(2)}ms</span>
                      <span>Contours: {(gpuReport.contoursMs ?? 0).toFixed(2)}ms</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Parchment Scroll Tension Weight & Curl Lip Bar */}
            <div
              className="mt-2 -mx-3 -mb-3 py-1 px-3 rounded-b-[2px] border-t border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text-secondary)] flex items-center justify-between text-nano font-mono tracking-wider uppercase select-none shrink-0"
            >
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                <span>Scroll Tensioned • 100% Rag</span>
              </span>
              <span className="opacity-50">1:50,000,000</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. Smooth Secondary Slide-Out Catalog Sheet (Docked to Left of Sidebar)   */}
      {/* ========================================================================= */}
      {isCatalogOpen && (
        <div
          ref={catalogSheetRef}
          className="fixed top-4 right-[25.5rem] z-30 pointer-events-auto w-96 max-w-[calc(100vw-27rem)] max-h-[calc(100vh-2rem)] flex flex-col font-mono select-none rounded-[3px] border backdrop-blur-2xl shadow-2xl p-4 text-micro transition-all duration-300 ease-out animate-in fade-in slide-in-from-right-4 border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg)] text-[var(--theme-text-primary)]"
        >
          {/* Catalog Sheet Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-panel-border)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse"></span>
              <div>
                <h3 className="text-micro font-black uppercase tracking-wider text-[var(--theme-text-primary)]">Cartographic Data Catalog</h3>
                <span className="text-nano opacity-60 text-[var(--theme-text-muted)]">
                  {DATA_LAYER_CATALOG.length} verified global datasets
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsCatalogOpen(false)}
              title="Close Catalog Sheet (Esc)"
              className="p-1.5 rounded-[2px] border transition-all border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]"
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
                  className={`p-3 rounded-[2px] border transition-all flex flex-col gap-2 ${
                    isAlreadyAdded
                      ? 'bg-[var(--theme-control-bg)] border-emerald-500/30'
                      : 'bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] hover:border-[var(--theme-card-border-hover)] hover:bg-[var(--theme-card-bg)] text-[var(--theme-text-primary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-nano flex items-center gap-1.5">
                      {isAlreadyAdded && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                      )}
                      <span>{preset.name}</span>
                      {preset.id === 'starlink-iss-orbits' && (
                        <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-[2px] border bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse shrink-0">
                          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping"></span>
                          Live Synced
                        </span>
                      )}
                      {preset.id === 'noaa-gfs-wind' && (
                        <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-[2px] border bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.4)] shrink-0">
                          Physics Model
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-nano uppercase font-bold px-1.5 py-0.5 rounded-[2px] border ${
                        preset.category === 'topo'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                          : preset.category === 'satellite'
                          ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/30'
                          : preset.category === 'vectors'
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30'
                          : 'bg-[#c5a059]/20 text-[#c5a059] border-[#c5a059]/30'
                      }`}
                    >
                      {preset.category}
                    </span>
                  </div>

                  <p className="text-nano leading-relaxed opacity-80 text-[var(--theme-text-muted)]">
                    {preset.details}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-micro">
                    <span className="opacity-60 truncate max-w-[200px]" title={preset.attribution}>
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
                      className={`px-3 py-1.5 rounded-[2px] text-nano font-bold border transition-all flex items-center gap-1.5 ${
                        isAlreadyAdded
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 cursor-default ring-1 ring-emerald-500/30 font-extrabold'
                          : 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] hover:opacity-90 shadow-sm font-extrabold'
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
