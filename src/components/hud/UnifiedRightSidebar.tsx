// ============================================================================
// File: src/components/hud/UnifiedRightSidebar.tsx
// Unified Right Sidebar: Engine Status + Topology Controls + Data Layers + Slide-out Catalog
// Unmistakable active/selected visual contrast for all modes, buttons, and switches
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { ThemeManager } from '../../core/themes/ThemeManager';

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

const OpticalReticlePip: React.FC<{ active: boolean; theme?: 0 | 1 | 2 }> = ({ active, theme = 0 }) => {
  return (
    <div
      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors shadow-sm ${
        active
          ? 'border-[var(--theme-reticle-ring-active)] bg-[var(--theme-reticle-ring-active)]/20 shadow-[0_0_8px_var(--theme-reticle-ring-active)]'
          : theme === 1
          ? 'border-[#8C4820]/45 bg-[#8C4820]/5 group-hover:border-[#8C4820]'
          : theme === 2
          ? 'border-[#4F79A3]/50 bg-[#4F79A3]/10 group-hover:border-[#A5D5FF]'
          : 'border-[#7A6F5E]/60 bg-white/5 group-hover:border-[#C5A059]'
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
  isolatedStratum?: number | null;
  onIsolatedStratumChange?: (stratum: number | null, swatch?: { name: string; hex: string; depth: string } | null) => void;
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
  isCatalogOpen?: boolean;
  onCatalogOpenChange?: (open: boolean) => void;
  isSidebarOpen?: boolean;
  onSidebarOpenChange?: (open: boolean) => void;
}

export const UnifiedRightSidebar: React.FC<UnifiedRightSidebarProps> = ({
  isZenMode,
  onZenToggle,
  theme,
  onThemeToggle,
  onSelectThemeMode,
  isolatedStratum: externalIsolatedStratum,
  onIsolatedStratumChange,
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
  isCatalogOpen: externalCatalogOpen,
  onCatalogOpenChange,
  isSidebarOpen: externalSidebarOpen,
  onSidebarOpenChange,
}) => {
  const [internalSidebarOpen, setInternalSidebarOpen] = useState(true);
  const isSidebarOpen = externalSidebarOpen !== undefined ? externalSidebarOpen : internalSidebarOpen;
  const setIsSidebarOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isSidebarOpen) : val;
    if (onSidebarOpenChange) {
      onSidebarOpenChange(nextVal);
    }
    setInternalSidebarOpen(nextVal);
  };
  const [internalCatalogOpen, setInternalCatalogOpen] = useState(false);
  const isCatalogOpen = externalCatalogOpen !== undefined ? externalCatalogOpen : internalCatalogOpen;
  const setIsCatalogOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isCatalogOpen) : val;
    if (onCatalogOpenChange) {
      onCatalogOpenChange(nextVal);
    }
    setInternalCatalogOpen(nextVal);
  };
  const [internalIsolatedStratum, setInternalIsolatedStratum] = useState<number | null>(() => ThemeManager.getInstance().getIsolatedStratum());
  const isolatedStratum = externalIsolatedStratum !== undefined ? externalIsolatedStratum : internalIsolatedStratum;
  const setIsolatedStratum = (val: number | null | ((prev: number | null) => number | null)) => {
    const nextVal = typeof val === 'function' ? val(isolatedStratum) : val;
    setInternalIsolatedStratum(nextVal);
  };
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'topo' | 'vectors' | 'satellite'>('all');
  const catalogSheetRef = useRef<HTMLDivElement>(null);

  type SidebarPlate = 'all' | 'survey' | 'scene' | 'paradigms' | 'planetary' | 'layers';
  const [activePlate, setActivePlate] = useState<SidebarPlate>('all');

  const isLight = theme === 1;

  // Active Cartographic Direction (A: Architectural, B: Hybrid, C: Photoreal)
  const activeDirection: DataLayerRenderStyle =
    dataLayers.find((l) => l.visible && l.renderStyle)?.renderStyle ?? 'architectural';

  // Dynamic Tissot Indicatrix Distortion Tensor Computation (Section 1.1)
  const parsedLat = useMemo(() => {
    const match = latStr.match(/(\d+)°(?:(\d+)')?([NS])?/);
    if (!match) return 0;
    const deg = parseFloat(match[1]) + (match[2] ? parseFloat(match[2]) / 60 : 0);
    return match[3] === 'S' ? -deg : deg;
  }, [latStr]);

  const tissotTelemetry = useMemo(() => {
    const latRad = (parsedLat * Math.PI) / 180;
    const cosLat = Math.max(0.087, Math.cos(latRad));
    // Equatorial area scale factor s at phi = 0
    const eqBaseRatio = 1.0;
    const eqArea = ((1 - alpha) * 1.0 + alpha * (mode === 4 ? 1.04 : eqBaseRatio)).toFixed(3);

    // Camera latitude area scale factor s at current latitude
    const camBaseRatio =
      mode === 4
        ? 1.04
        : mode === 1
        ? 1.0 / (cosLat * cosLat)
        : mode === 0
        ? 1.0 / cosLat
        : 1.0;
    const localArea = ((1 - alpha) * 1.0 + alpha * camBaseRatio).toFixed(3);

    // Polar dilation (standard 85° Mercator limit / Dymaxion isomeric)
    const polarBaseRatio =
      mode === 4
        ? 1.041
        : mode === 1
        ? 131.6
        : mode === 0
        ? 11.5
        : mode === 3
        ? 1.0
        : 1.12;
    const polarVal = (1 - alpha) * 1.0 + alpha * polarBaseRatio;
    const polarStr =
      mode === 4
        ? `${polarVal.toFixed(3)}x`
        : mode === 1
        ? alpha < 0.01
          ? '1.000x'
          : `${polarVal.toFixed(1)}x (85° limit)`
        : `${polarVal.toFixed(2)}x`;

    return { eqArea, localArea, polarStr };
  }, [parsedLat, alpha, mode]);

  // Dynamic Volumetric Scale VRAM Memory Calculation (Section 1.2)
  const resolutionVramLabel = useMemo(() => {
    const tierConfig: Record<ResolutionTier, { verts: string; nodes: number }> = {
      '100k': { verts: '262K Verts', nodes: 262_144 },
      '1M': { verts: '1.05M Verts', nodes: 1_048_576 },
      '3M': { verts: '2.98M Verts', nodes: 2_980_000 },
      '4M': { verts: '4.19M Verts', nodes: 4_194_304 },
      '8M': { verts: '8.38M Verts', nodes: 8_388_608 },
      '16M': { verts: '16.7M Verts', nodes: 16_777_216 },
    };
    const c = tierConfig[resolution] || tierConfig['1M'];
    const mb = Math.round((c.nodes * 104) / (1024 * 1024));
    const sizeStr = mb >= 1000 ? `~${(mb / 1024).toFixed(1)}GB (est.)` : `~${mb}MB (est.)`;
    return `${c.verts} · ${sizeStr}`;
  }, [resolution]);

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
      <div className="fixed top-5 right-5 z-30 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-500 origin-top ease-out">
        <div
          className={`rounded-[3px] border shadow-2xl p-3 text-micro flex flex-col sidebar-spring-transition relative scroll-curl-lip ${
            isSidebarOpen ? 'max-h-[calc(100vh-2.5rem)]' : 'max-h-[82px] overflow-hidden'
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
          {/* --------------------------------------------------------------------- */}
          {/* Row 1: Engine Controls & System Status Bar                            */}
          {/* --------------------------------------------------------------------- */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--theme-panel-header-border)] gap-1.5">
            {/* Left Controls: Telemetry Status & Engine Config */}
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Archival Drafting Hairline Divider */}
              <div className="hidden h-3 w-px bg-[var(--theme-neatline-border)]/40 shrink-0" />
              {/* Live FPS Badge (Fixed width, cohesive gap, no layout shift) */}
              <div className="flex items-center justify-center gap-1.5 w-16 shrink-0 px-1.5 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-primary)] font-bold text-nano tabular-nums transition-colors">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    fps >= 100
                      ? 'bg-[var(--theme-text-accent)] shadow-[0_0_8px_rgba(197,160,89,0.8)]'
                      : fps >= 55
                      ? 'bg-[var(--theme-status-sage)] shadow-[0_0_8px_var(--theme-status-sage)]'
                      : 'bg-[var(--theme-status-amber)]'
                  }`}
                ></span>
                <span
                  className={`w-5 text-right tabular-nums ${
                    fps >= 100
                      ? 'text-[var(--theme-text-accent)] font-semibold'
                      : fps >= 55
                      ? 'text-[var(--theme-status-sage)] font-semibold'
                      : 'text-[var(--theme-status-amber)] font-semibold'
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
                className={`cursor-pointer px-2 py-1 rounded-[2px] text-micro font-bold border transition-all flex items-center gap-1.5 shrink-0 ${
                  backend === 'webgpu'
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                    : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-control-hover-border)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    backend === 'webgpu' ? 'bg-[var(--theme-text-accent)]' : 'bg-[var(--theme-status-sage)]'
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
                  className={`cursor-pointer px-1.5 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
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
                  className={`cursor-pointer px-1.5 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
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
                    className={`cursor-pointer px-1.5 py-0.5 rounded-[2px] text-nano font-bold transition-all ${
                      resolution === '16M'
                        ? 'bg-[var(--theme-status-amber)] text-black font-semibold shadow-sm'
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
                  className={`cursor-pointer p-1.5 rounded-[2px] border transition-all flex items-center shrink-0 ${
                    !isAudioMuted
                      ? 'border-[var(--theme-status-sage)] bg-[var(--theme-status-sage)]/15 text-[var(--theme-status-sage)] ring-1 ring-[var(--theme-status-sage)]/40 shadow-sm'
                      : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                  }`}
                >
                  {!isAudioMuted ? (
                    <svg className="w-3.5 h-3.5 text-[var(--theme-status-sage)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                aria-label={theme === 0 ? 'Switch to Cream Rag Theme' : theme === 1 ? 'Switch to Prussian Cyanotype Theme' : 'Switch to Marie Tharp Theme'}
                title={
                  theme === 0
                    ? 'Switch to Cream Rag Paper Palette (Press T)'
                    : theme === 1
                    ? 'Switch to Prussian Cyanotype Palette (Press T)'
                    : 'Switch to Marie Tharp Palette (Press T)'
                }
                className="cursor-pointer px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-control-hover-border)] text-nano font-mono tracking-tight transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
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
                    ? 'bg-[var(--theme-status-sage)] shadow-[0_0_10px_var(--theme-status-sage)]'
                    : mode === 3
                    ? 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]'
                    : mode === 2
                    ? 'bg-[var(--theme-pulse-indicator)] shadow-[0_0_10px_var(--theme-pulse-indicator)]'
                    : mode === 1
                    ? 'bg-[var(--theme-status-sage)] shadow-[0_0_8px_var(--theme-status-sage)]'
                    : 'bg-[var(--theme-status-amber)] shadow-[0_0_8px_var(--theme-status-amber)]'
                }`}
              ></span>
              {/* Medium-Adaptive Archival Cartouche Vignette Emblem */}
              <span className="shrink-0 text-[var(--theme-text-accent)] opacity-85" title="Archival Cartouche Vignette Emblem">
                {theme === 1 ? (
                  // Imhof Swiss Alpine Relief Ridge Emblem
                  <svg className="w-5 h-4" viewBox="0 0 24 16" fill="currentColor">
                    <path d="M0 16 L6 7 L9 11 L14 3 L19 10 L21 8 L24 16 Z" opacity="0.9" />
                    <line x1="14" y1="3" x2="14" y2="16" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
                    <line x1="6" y1="7" x2="6" y2="16" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
                  </svg>
                ) : theme === 2 ? (
                  // Prussian Cyanotype Architectural Drafting Protractor Emblem
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                    <circle cx="10" cy="10" r="8" strokeWidth="1" strokeDasharray="1.5 1.5" />
                    <line x1="10" y1="2" x2="10" y2="18" strokeWidth="0.75" />
                    <line x1="2" y1="10" x2="18" y2="10" strokeWidth="0.75" />
                    <circle cx="10" cy="10" r="2" fill="currentColor" />
                  </svg>
                ) : (
                  // Marie Tharp Physiographic Sonar Ridge Emblem
                  <svg className="w-5 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor">
                    <path d="M1 12 Q 6 4, 10 7 L 12 11 L 14 6 Q 18 3, 23 12" strokeWidth="1.2" />
                    <line x1="12" y1="2" x2="12" y2="15" strokeWidth="0.75" strokeDasharray="1 2" opacity="0.5" />
                  </svg>
                )}
              </span>
              <span className="cartouche-title text-title font-semibold tracking-wider uppercase text-[var(--theme-text-primary)]">
                INDICATRIX // CONTROLS
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onZenToggle}
                title="Zen Presentation Mode (Press H to hide UI)"
                className="cursor-pointer text-nano font-bold px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)] transition-all"
              >
                Zen (H)
              </button>
              <button
                onClick={() => {
                  const nextState = !isSidebarOpen;
                  setIsSidebarOpen(nextState);
                  if (!nextState) {
                    setIsCatalogOpen(false);
                  }
                }}
                className="cursor-pointer tactile-btn text-nano font-bold px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)] transition-all"
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
                    className={`px-1.5 py-1 rounded-[2px] font-bold transition-all border shrink-0 cursor-pointer ${
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
            <div className="mt-2.5 space-y-3 overflow-y-auto pr-1 flex-1 min-h-0 scroll-fade-mask pt-1 pb-3">
              {/* ================================================================= */}
              {/* PLATE 1: SURVEY & ARCHIVAL PHYSICAL MEDIUM                        */}
              {/* ================================================================= */}
              {(activePlate === 'all' || activePlate === 'survey') && (
                <div className="space-y-2.5">
                  {/* Archival Physical Medium & Mineral Swatch Ramp */}
                  <div
                    className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2.5 transition-all shadow-sm relative overflow-hidden"
                    style={theme === 0 ? { boxShadow: 'var(--theme-cathode-glow, none)' } : undefined}
                  >
                    <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-wider relative z-10">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: theme === 0 ? '#C5A059' : theme === 1 ? '#8C4820' : '#A5D5FF',
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

                    <div className="grid grid-cols-3 gap-1.5 relative z-10">
                      <button
                        onClick={() => handleSelectMedium(0)}
                        title="Marie Tharp Physiographic: Oceanic abyss, turquoise shelf, parchment continents"
                        className={`tactile-btn group cursor-pointer py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all ${
                          theme === 0
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-semibold shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        <OpticalReticlePip active={theme === 0} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-medium tracking-tight">Tharp</span>
                          <span className="text-nano uppercase font-medium tracking-tight opacity-75">Physiographic</span>
                        </div>
                      </button>

                      <button
                        onClick={() => handleSelectMedium(1)}
                        title="Cream Rag Paper: Eduard Imhof Swiss Alpine watercolor relief on 100% cotton rag"
                        className={`tactile-btn group cursor-pointer py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all ${
                          theme === 1
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-semibold shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        <OpticalReticlePip active={theme === 1} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-medium tracking-tight">Cream Rag</span>
                          <span className="text-nano uppercase font-medium tracking-tight opacity-75">Swiss Relief</span>
                        </div>
                      </button>

                      <button
                        onClick={() => handleSelectMedium(2)}
                        title="Prussian Cyanotype: Ferroprussiate blueprint & technical drafting linen"
                        className={`tactile-btn group cursor-pointer py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all ${
                          theme === 2
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-semibold shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        <OpticalReticlePip active={theme === 2} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-medium tracking-tight">Prussian</span>
                          <span className="text-nano uppercase font-medium tracking-tight opacity-75">Cyanotype</span>
                        </div>
                      </button>
                    </div>

                    {/* Tactile Watercolor Half-Pan Pigment Strip */}
                    <div className="pt-1 border-t border-[var(--theme-card-border)] space-y-1 relative z-10">
                      <div className="flex items-center justify-between text-nano uppercase tracking-wider opacity-75 font-mono">
                        <span className="text-[var(--theme-text-accent)]">
                          Hypsometric Pigment Pans
                        </span>
                        <span className="font-serif-body italic text-micro opacity-80">
                          Hand-Ground Minerals
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-1">
                        {PIGMENT_SWATCHES[theme].map((swatch, idx) => {
                          const isIsolated = isolatedStratum === idx;
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                const nextStratum = isolatedStratum === idx ? null : idx;
                                const nextSwatch = nextStratum !== null ? swatch : null;
                                setIsolatedStratum(nextStratum);
                                onIsolatedStratumChange?.(nextStratum, nextSwatch);

                                // Update global theme tokens via ThemeManager
                                ThemeManager.getInstance().setIsolatedStratum(nextStratum, nextSwatch);

                                // Dynamically tune the primary cartographic layer pipeline based on the isolated stratum
                                if (primaryLayerId) {
                                  if (nextStratum === null) {
                                    // Reset to medium defaults
                                    handleSelectMedium(theme);
                                  } else if (idx === 0) {
                                    // Abyssal Trench (-11,000m): Emphasize deep trenches & bathymetry
                                    onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, -25);
                                    onWaterClarityChangeDataLayer?.(primaryLayerId, 0.92);
                                  } else if (idx === 1) {
                                    // Shelf Break / Mid-Ocean Ridge: Highlight tectonic rift structures
                                    onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, -8);
                                    onWaterClarityChangeDataLayer?.(primaryLayerId, 0.82);
                                    onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.72);
                                  } else if (idx === 2) {
                                    // Coastal / Turquoise Bank: Maximize coastal shallow clarity
                                    onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
                                    onWaterClarityChangeDataLayer?.(primaryLayerId, 0.75);
                                  } else if (idx === 3) {
                                    // Steppe / Lowland: Balanced terrain relief
                                    onPeakExponentChangeDataLayer?.(primaryLayerId, 1.3);
                                    onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.12);
                                  } else if (idx === 4) {
                                    // Glacial / Alpine Ridge: Razor arêtes & alpine summit sharpening
                                    onPeakExponentChangeDataLayer?.(primaryLayerId, 2.0);
                                    onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.16);
                                    onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.75);
                                  }
                                }
                              }}
                              className={`pigment-pan p-1 rounded-[2px] border text-center flex flex-col items-center gap-1 transition-all shadow-sm cursor-pointer select-none ${
                                isIsolated
                                  ? 'ring-2 ring-[var(--theme-text-accent)] border-[var(--theme-control-active-border)] bg-[var(--theme-control-active-bg)]'
                                  : 'border-[var(--theme-card-border)] bg-[var(--theme-control-bg)] hover:border-[var(--theme-card-border-hover)]'
                              }`}
                              title={`${swatch.name} (${swatch.hex}) · ${swatch.depth} (Click to isolate elevation stratum)`}
                            >
                              <div
                                className="w-full h-3.5 rounded-[1px] border border-black/20 shadow-inner shrink-0"
                                style={{ backgroundColor: swatch.hex }}
                              />
                              <div className="text-nano font-serif-title line-clamp-2 h-5 flex items-center justify-center w-full tracking-tight opacity-95 leading-[1.1] text-[var(--theme-text-primary)] break-words text-center">
                                {swatch.name}
                              </div>
                              <div className="text-nano font-mono opacity-60 uppercase tracking-tighter text-[var(--theme-text-secondary)] shrink-0">
                                {swatch.depth}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Cartographic Rendering Direction Switcher (A / B / C) */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                    <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-wider">
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
                        className={`tactile-btn group cursor-pointer py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                          activeDirection === 'architectural'
                            ? 'bg-[var(--theme-direction-a-bg)] text-[var(--theme-direction-a-text)] border-[var(--theme-direction-a-border)] ring-1 ring-[var(--theme-direction-a-ring)] font-semibold shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-direction-a-border)]'
                        }`}
                      >
                        <OpticalReticlePip active={activeDirection === 'architectural'} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-medium tracking-tight">A: Relief</span>
                          <span className="text-nano uppercase font-medium tracking-tight opacity-75">Architectural</span>
                        </div>
                      </button>

                      {/* Direction B */}
                      <button
                        onClick={() => {
                          onSelectRenderStyle?.('hybrid');
                        }}
                        title="Direction B: Hydrosphere & Bathymetric Depth (Two-Surface Model: smooth sea level + Beer-Lambert depth)"
                        className={`tactile-btn group cursor-pointer py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                          activeDirection === 'hybrid'
                            ? 'bg-[var(--theme-direction-b-bg)] text-[var(--theme-direction-b-text)] border-[var(--theme-direction-b-border)] ring-1 ring-[var(--theme-direction-b-ring)] font-semibold shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-direction-b-border)]'
                        }`}
                      >
                        <OpticalReticlePip active={activeDirection === 'hybrid'} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-medium tracking-tight">B: Depth</span>
                          <span className="text-nano uppercase font-medium tracking-tight opacity-75">Hydrosphere</span>
                        </div>
                      </button>

                      {/* Direction C */}
                      <button
                        onClick={() => {
                          onSelectRenderStyle?.('photoreal');
                        }}
                        title="Direction C: NASA Blue Marble (True-color orbital photography + 3D DEM relief)"
                        className={`tactile-btn group cursor-pointer py-2 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-1 border transition-all outline-none focus:outline-none focus-visible:outline-none ${
                          activeDirection === 'photoreal'
                            ? 'bg-[var(--theme-direction-c-bg)] text-[var(--theme-direction-c-text)] border-[var(--theme-direction-c-border)] ring-1 ring-[var(--theme-direction-c-ring)] font-semibold shadow-md'
                            : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-direction-c-border)]'
                        }`}
                      >
                        <OpticalReticlePip active={activeDirection === 'photoreal'} theme={theme} />
                        <div className="flex flex-col items-center">
                          <span className="text-body font-medium tracking-tight">C: Orbital</span>
                          <span className="text-nano uppercase font-medium tracking-tight opacity-75">Photoreal</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Volumetric Node Scaling Card (100K - 16M Tiers) */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                    <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--theme-pulse-indicator)]"></span>
                        <span className="text-[var(--theme-text-primary)]">
                          Volumetric Scale
                        </span>
                      </span>
                      <span className="text-nano font-mono font-medium px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-accent)]">
                        {resolutionVramLabel}
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
                                ? theme === 1
                                  ? 'bg-[#7D4700] text-[#FDFCF9] border-[#5A3300] font-semibold shadow-sm'
                                  : 'bg-amber-500 text-black border-amber-400 font-semibold shadow-sm'
                                : 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-semibold shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                              : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
                          }`}
                        >
                          <span className="text-nano font-semibold">{tier.toUpperCase()}</span>
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
                  <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[var(--theme-pulse-indicator)] shadow-sm"></span>
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
                          className="tactile-btn cursor-pointer px-2.5 py-1 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-micro font-bold"
                        >
                          ◀
                        </button>

                        <div className="flex flex-col items-center flex-1 px-2 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-micro tracking-wider truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                mode === 0
                                  ? theme === 1
                                    ? 'bg-[#7D4700]'
                                    : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                                  : mode === 1
                                  ? 'bg-[var(--theme-status-sage)] shadow-[0_0_6px_var(--theme-status-sage)]'
                                  : mode === 2
                                  ? 'bg-[var(--theme-pulse-indicator)] shadow-[0_0_6px_var(--theme-pulse-indicator)]'
                                  : mode === 3
                                  ? theme === 1
                                    ? 'bg-[#1A4457]'
                                    : 'bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.8)]'
                                  : 'bg-[var(--theme-status-sage)] shadow-[0_0_6px_var(--theme-status-sage)]'
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
                          className="tactile-btn cursor-pointer px-2.5 py-1 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-micro font-bold"
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
                              className={`tactile-btn cursor-pointer py-1 rounded-[2px] text-nano font-mono uppercase tracking-tight text-center border transition-all ${
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
                    <div className="flex-1 min-w-0 pt-1">
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
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-semibold'
                            : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] bg-[var(--theme-control-bg)]'
                        }`}
                      >
                        Off
                      </button>
                      <button
                        onClick={() => onOverlayChange('antipodes')}
                        title="Antipodal Geodesic Connectors (Terra Cotta / Rose)"
                        className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border ${
                          activeOverlay === 'antipodes'
                            ? theme === 1
                              ? 'bg-[#8C4820] text-[#FDFCF9] border-[#6D3414] shadow-sm font-semibold ring-1 ring-[#8C4820]/40'
                              : 'bg-rose-500/35 text-rose-200 border-rose-400/80 shadow-[0_0_10px_rgba(244,63,94,0.4)] ring-1 ring-rose-400/60 font-semibold'
                            : theme === 1
                            ? 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[#8C4820] hover:border-[#8C4820]/40 bg-[var(--theme-control-bg)]'
                            : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-rose-500 hover:border-rose-400/50 bg-[var(--theme-control-bg)]'
                        }`}
                      >
                        Antipodes
                      </button>
                      <button
                        onClick={() => onOverlayChange('conveyor')}
                        title="Global Oceanic Conveyor Belt Thermohaline Circulation (Prussian Slate / Sky Blue)"
                        className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border ${
                          activeOverlay === 'conveyor'
                            ? theme === 1
                              ? 'bg-[#1A4457] text-[#FDFCF9] border-[#102D3A] shadow-sm font-semibold ring-1 ring-[#1A4457]/40'
                              : 'bg-sky-500/35 text-sky-200 border-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.4)] ring-1 ring-sky-400/60 font-semibold'
                            : theme === 1
                            ? 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[#1A4457] hover:border-[#1A4457]/40 bg-[var(--theme-control-bg)]'
                            : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-sky-500 hover:border-sky-400/50 bg-[var(--theme-control-bg)]'
                        }`}
                      >
                        Conveyor
                      </button>
                      <button
                        onClick={() => onOverlayChange('migration')}
                        title="Global Bird & Cetacean Migration Geodesic Arcs (Raw Ochre / Amber)"
                        className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border ${
                          activeOverlay === 'migration'
                            ? theme === 1
                              ? 'bg-[#7D4700] text-[#FDFCF9] border-[#5A3300] shadow-sm font-semibold ring-1 ring-[#7D4700]/40'
                              : 'bg-amber-500/35 text-amber-200 border-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.4)] ring-1 ring-amber-400/60 font-semibold'
                            : theme === 1
                            ? 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[#7D4700] hover:border-[#7D4700]/40 bg-[var(--theme-control-bg)]'
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
                          ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-semibold'
                          : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showLandmarks
                            ? 'bg-[var(--theme-status-sage)] shadow-[0_0_6px_var(--theme-status-sage)]'
                            : theme === 1 ? 'bg-[#b8ad98]' : 'bg-zinc-500/60'
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
                          ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)] font-semibold'
                          : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showTissot ? 'bg-[var(--theme-pulse-indicator)] shadow-[0_0_6px_var(--theme-pulse-indicator)]' : theme === 1 ? 'bg-[#b8ad98]' : 'bg-zinc-500/60'
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
                          ? theme === 1
                            ? 'bg-[#8C4820] text-[#FDFCF9] border-[#6D3414] shadow-sm font-semibold ring-1 ring-[#8C4820]/40'
                            : 'bg-amber-500/35 text-amber-200 border-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.4)] ring-1 ring-amber-400/60 font-semibold'
                          : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showVectors
                            ? theme === 1
                              ? 'bg-[#FDFCF9]'
                              : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                            : theme === 1 ? 'bg-[#b8ad98]' : 'bg-zinc-500/60'
                        }`}
                      ></span>
                      <span>Vectors (V)</span>
                    </button>
                  </div>

                  {/* Archival High-Touch Details (Dedicated Spaces & Overlays) */}
                  <div className="space-y-1 pt-1.5 border-t border-white/10">
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
                      <div className="flex justify-between items-center text-nano uppercase tracking-wider font-semibold">
                        <span>Distortion Tensor</span>
                        <span className="text-[var(--theme-status-sage)] font-bold">
                          {mode === 4 ? 'Isomeric (s ≈ 1.04x)' : 'Morphing Tensor'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-nano">
                        <div>
                          <span className="text-[var(--theme-text-muted)] block truncate">Eq. Area:</span>
                          <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.eqArea}x</span>
                        </div>
                        <div>
                          <span className="text-[var(--theme-text-muted)] block truncate">Local ({latStr.trim()}):</span>
                          <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.localArea}x</span>
                        </div>
                        <div>
                          <span className="text-[var(--theme-text-muted)] block truncate">Polar Dilation:</span>
                          <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.polarStr}</span>
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
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[var(--theme-card-border)]">
                    <span className="text-body font-mono tracking-widest font-semibold uppercase text-[var(--theme-text-muted)]">
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
                        className={`px-2 py-0.5 rounded-[2px] text-nano font-bold transition-all cursor-pointer ${
                          layerMode === 2
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] font-semibold shadow-sm border border-[var(--theme-control-active-border)]'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)]'
                        }`}
                      >
                        Clean Terrain
                      </button>
                      <button
                        onClick={() => onLayerModeChange?.(0)}
                        className={`px-2 py-0.5 rounded-[2px] text-nano font-bold transition-all cursor-pointer ${
                          layerMode === 0
                            ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] font-semibold shadow-sm border border-[var(--theme-control-active-border)]'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)]'
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
                      <span className="flex items-center gap-1 font-mono text-[var(--theme-status-sage)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-status-sage)]"></span>
                        Live Synced
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {/* NOAA GFS Wind Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('noaa-gfs-wind')}
                        className={`min-h-[38px] p-1.5 px-2 rounded-[2px] border transition-all text-left flex items-center justify-between gap-2 cursor-pointer ${
                          isNoaaActive
                            ? theme === 1
                              ? 'border-[#2b6b88]/60 bg-[#2b6b88]/15 text-[#1a4457] shadow-sm ring-1 ring-[#2b6b88]/40'
                              : theme === 2
                              ? 'border-[#4a729e]/80 bg-[#254263]/40 text-[#e8edf2] shadow-sm ring-1 ring-[#4a729e]/50'
                              : 'border-sky-500/60 bg-sky-500/20 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-nano truncate">NOAA Wind</span>
                          <span className="text-nano text-[var(--theme-text-muted)] truncate opacity-75">0.25° Operational</span>
                        </div>
                        <span className={`flex items-center gap-1 text-nano font-bold px-1.5 py-0.5 rounded-[2px] border shrink-0 ${
                          theme === 1
                            ? 'bg-[#2b6b88]/20 text-[#1a4457] border-[#2b6b88]/40'
                            : theme === 2
                            ? 'bg-[#3b5d82]/40 text-[#d8e6f3] border-[#4a729e]/50'
                            : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        }`}>
                          Physics Model
                        </span>
                      </button>

                      {/* Starlink Orbits Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('starlink-iss-orbits')}
                        className={`min-h-[38px] p-1.5 px-2 rounded-[2px] border transition-all text-left flex items-center justify-between gap-2 cursor-pointer ${
                          isStarlinkActive
                            ? theme === 1
                              ? 'border-[#8c4820]/60 bg-[#8c4820]/15 text-[#2b241a] shadow-sm ring-1 ring-[#8c4820]/40'
                              : theme === 2
                              ? 'border-[#4a729e]/80 bg-[#254263]/40 text-[#e8edf2] shadow-sm ring-1 ring-[#4a729e]/50'
                              : 'border-purple-500/60 bg-purple-500/20 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.25)] ring-1 ring-purple-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-nano truncate">Starlink Orbits</span>
                          <span className="text-nano text-[var(--theme-text-muted)] truncate opacity-75">CelesTrak (110 Sats as of 2026)</span>
                        </div>
                        <span className={`flex items-center gap-1 text-nano font-bold px-1.5 py-0.5 rounded-[2px] border shrink-0 ${
                          theme === 1
                            ? 'bg-[#2e6b47]/20 text-[#1b432b] border-[#2e6b47]/40'
                            : theme === 2
                            ? 'bg-[#2a5540]/40 text-[#a3e5be] border-[#387256]/50'
                            : 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40'
                        }`}>
                          <span className={`w-1 h-1 rounded-full animate-ping ${
                            theme === 1
                              ? 'bg-[#1b432b]'
                              : theme === 2
                              ? 'bg-[#a3e5be]'
                              : 'bg-[var(--theme-status-sage)]'
                          }`}></span>
                          Live
                        </span>
                      </button>

                      {/* 250 hPa Jet Stream Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('noaa-gfs-jetstream')}
                        className={`min-h-[38px] p-1.5 px-2 rounded-[2px] border transition-all text-left flex items-center justify-between gap-2 cursor-pointer ${
                          isJetstreamActive
                            ? theme === 1
                              ? 'border-[#5a4878]/60 bg-[#5a4878]/15 text-[#3d2e54] shadow-sm ring-1 ring-[#5a4878]/40'
                              : theme === 2
                              ? 'border-[#5a6e8c]/80 bg-[#273a50]/40 text-[#dbe5f0] shadow-sm ring-1 ring-[#5a6e8c]/50'
                              : 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200 shadow-[0_0_8px_rgba(99,102,241,0.25)] ring-1 ring-indigo-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-nano truncate">Jet Stream</span>
                          <span className="text-nano text-[var(--theme-text-muted)] truncate opacity-75">High-Alt Core</span>
                        </div>
                        <span className={`flex items-center gap-1 text-nano font-bold px-1.5 py-0.5 rounded-[2px] border shrink-0 ${
                          theme === 1
                            ? 'bg-[#5a4878]/20 text-[#3d2e54] border-[#5a4878]/40'
                            : theme === 2
                            ? 'bg-[#3e4f66]/40 text-[#ccd8e6] border-[#5a6e8c]/50'
                            : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        }`}>
                          250 hPa
                        </span>
                      </button>

                      {/* Origami Crane Companion Toggle */}
                      <button
                        onClick={() => handleTogglePlanetaryLayer('origami-crane-companion')}
                        className={`min-h-[38px] p-1.5 px-2 rounded-[2px] border transition-all text-left flex items-center justify-between gap-2 cursor-pointer ${
                          isCraneActive
                            ? theme === 1
                              ? 'border-[#96641e]/60 bg-[#96641e]/15 text-[#52350c] shadow-sm ring-1 ring-[#96641e]/40'
                              : theme === 2
                              ? 'border-[#8c7a52]/80 bg-[#3a3528]/40 text-[#f0e8d0] shadow-sm ring-1 ring-[#8c7a52]/50'
                              : 'border-amber-500/60 bg-amber-500/20 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/40'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-nano truncate">Origami Crane</span>
                          <span className="text-nano text-[var(--theme-text-muted)] truncate opacity-75">
                            {isCraneActive && craneTelemetry
                              ? `${craneTelemetry.alt.toLocaleString()}m • ${craneTelemetry.speed} km/h`
                              : 'Mountain Wave'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`flex items-center gap-1 text-nano font-bold px-1.5 py-0.5 rounded-[2px] border ${
                            theme === 1
                              ? 'bg-[#96641e]/20 text-[#52350c] border-[#96641e]/40'
                              : theme === 2
                              ? 'bg-[#5c4e30]/40 text-[#f5ebd2] border-[#8c7a52]/50'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}>
                            {isCraneActive && craneTelemetry
                              ? `${craneTelemetry.variometer >= 0 ? '+' : ''}${craneTelemetry.variometer} m/s`
                              : 'Soaring'}
                          </span>
                          {isCraneActive && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                (window as any).__FOCUS_CRANE__?.();
                              }}
                              className={`text-nano px-1.5 py-0.5 rounded-[2px] border font-bold tracking-wider cursor-pointer ${
                                theme === 1
                                  ? 'bg-[#96641e]/25 hover:bg-[#96641e]/40 text-[#422a08] border-[#96641e]/50'
                                  : theme === 2
                                  ? 'bg-[#5c4e30]/50 hover:bg-[#5c4e30]/70 text-[#fff5db] border-[#8c7a52]/60'
                                  : 'bg-amber-400/20 hover:bg-amber-400/40 text-amber-200 border-amber-400/40'
                              }`}
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
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[var(--theme-card-border)]">
                    <span className="text-body font-mono tracking-widest font-semibold uppercase text-[var(--theme-text-muted)]">
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
                      className={`text-nano font-semibold px-2.5 py-1 rounded-[2px] border transition-all flex items-center gap-1.5 cursor-pointer ${
                        isCatalogOpen
                          ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-md font-semibold'
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
                  <div className="space-y-2">
                    {dataLayers && dataLayers.length > 0 ? (
                      dataLayers.map((layer, idx) => {
                        const preset = getPresetById(layer.id);
                        const legend = preset?.legend;
                        const isFirst = idx === 0;
                        const isLast = idx === dataLayers.length - 1;

                        const isExpanded = expandedLayerId === layer.id;

                        return (
                          <div
                            key={layer.id}
                            className={`rounded-[2px] border flex flex-col text-micro transition-all folio-strip ${
                              layer.visible
                                ? 'bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] shadow-sm'
                                : 'bg-[var(--theme-card-bg)]/50 border-[var(--theme-card-border)]/60 text-[var(--theme-text-muted)] opacity-60'
                            }`}
                          >
                            {/* Folio Strip Header (~34px tall) */}
                            <div className="min-h-[34px] px-2 py-1.5 flex items-center justify-between gap-1.5 select-none">
                              {/* Left: Fold Chevron & Layer Details */}
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                                  className="cursor-pointer p-0.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-transform rounded-[1px]"
                                  title={isExpanded ? 'Collapse parameters' : 'Expand parameters'}
                                  aria-expanded={isExpanded}
                                >
                                  <svg
                                    className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>

                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    layer.visible
                                      ? theme === 1
                                        ? 'bg-[#2b6b88] shadow-[0_0_6px_rgba(43,107,136,0.6)]'
                                        : theme === 2
                                        ? 'bg-[#5b9dd9] shadow-[0_0_6px_rgba(91,157,217,0.6)]'
                                        : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]'
                                      : theme === 1 ? 'bg-[#b8ad98]/60' : 'bg-[var(--theme-text-muted)]'
                                  }`}
                                />

                                <span
                                  className="leading-tight break-words text-nano font-bold truncate cursor-pointer hover:text-[var(--theme-text-accent)]"
                                  title={layer.name}
                                  onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                                >
                                  {layer.name}
                                </span>

                                {layer.id === 'starlink-iss-orbits' && (
                                  <span className={`hidden sm:inline-flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] border shrink-0 ${
                                    theme === 1
                                      ? 'bg-[#2e6b47]/20 text-[#1b432b] border-[#2e6b47]/40 shadow-sm'
                                      : theme === 2
                                      ? 'bg-[#2a5540]/40 text-[#a3e5be] border-[#387256]/50 shadow-sm'
                                      : 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40 shadow-[0_0_8px_var(--theme-status-sage)]'
                                  }`}>
                                    <span className={`w-1 h-1 rounded-full animate-ping ${
                                      theme === 1 ? 'bg-[#1b432b]' : theme === 2 ? 'bg-[#a3e5be]' : 'bg-[var(--theme-status-sage)]'
                                    }`} />
                                    Live
                                  </span>
                                )}

                                {layer.id === 'noaa-gfs-wind' && (
                                  <span className={`hidden sm:inline-flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] border shrink-0 ${
                                    theme === 1
                                      ? 'bg-[#2b6b88]/20 text-[#1a4457] border-[#2b6b88]/40 shadow-sm'
                                      : theme === 2
                                      ? 'bg-[#3b5d82]/40 text-[#d8e6f3] border-[#4a729e]/50 shadow-sm'
                                      : 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                                  }`}>
                                    Physics
                                  </span>
                                )}

                                <span className="text-nano font-mono opacity-50 shrink-0">
                                  Z:{dataLayers.length - idx}
                                </span>
                              </div>

                              {/* Right: Layer Action Icons */}
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Move Up */}
                                <button
                                  disabled={isFirst}
                                  onClick={() => onReorderDataLayer?.(layer.id, 'up')}
                                  title="Move Layer Up in Z-Stack"
                                  className={`p-1 rounded-[2px] border transition-all ${
                                    isFirst
                                      ? 'opacity-25 cursor-not-allowed border-transparent text-[var(--theme-text-muted)]'
                                      : 'cursor-pointer border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
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
                                      : 'cursor-pointer border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-card-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
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
                                  className={`p-1 rounded-[2px] border transition-all cursor-pointer ${
                                    layer.visible
                                      ? theme === 1
                                        ? 'border-[#2b6b88]/60 bg-[#2b6b88]/15 text-[#1a4457] shadow-sm hover:border-[var(--theme-card-border-hover)]'
                                        : theme === 2
                                        ? 'border-[#4a729e]/80 bg-[#254263]/40 text-[#e8edf2] shadow-sm hover:border-[var(--theme-card-border-hover)]'
                                        : 'border-sky-400/80 bg-sky-500/20 text-sky-400 shadow-sm ring-1 ring-sky-400/40 hover:border-[var(--theme-card-border-hover)]'
                                      : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] hover:border-[var(--theme-card-border-hover)]'
                                  }`}
                                >
                                  {layer.visible ? (
                                    <svg className={`w-3.5 h-3.5 ${theme === 1 ? 'text-[#1a4457]' : theme === 2 ? 'text-[#d8e6f3]' : 'text-sky-500 dark:text-sky-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                  className={`p-1 rounded-[2px] border transition-all cursor-pointer hover:border-[var(--theme-card-border-hover)] ${
                                    theme === 1
                                      ? 'border-[#9c2f2f]/40 text-[#9c2f2f] hover:bg-[#9c2f2f]/15'
                                      : theme === 2
                                      ? 'border-[#d05c5c]/40 text-[#f08080] hover:bg-[#d05c5c]/20'
                                      : 'border-rose-500/30 text-rose-500 hover:bg-rose-500/20'
                                  }`}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Collapsible Folio Accordion Body */}
                            <div
                              className={`transition-all duration-150 ease-out overflow-hidden ${
                                isExpanded
                                  ? 'max-h-[600px] opacity-100 mt-1 border-t border-[var(--theme-panel-header-border)] p-2.5 pt-0 space-y-2 pointer-events-auto'
                                  : 'max-h-0 opacity-0 border-t-0 p-0 m-0 pointer-events-none'
                              }`}
                              style={{ transitionTimingFunction: 'var(--theme-spring-switch, cubic-bezier(0.34, 1.35, 0.64, 1))' }}
                            >
                                  {/* Opacity & Blend Controls */}
                                  <div className="grid grid-cols-2 gap-2 text-nano pt-1.5 items-center">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[var(--theme-text-muted)] font-semibold">Opacity:</span>
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
                                      <span className="w-7 text-right font-semibold tabular-nums">
                                        {Math.round((layer.opacity ?? 0.85) * 100)}%
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[var(--theme-text-muted)] font-semibold text-nano">Blend:</span>
                                      <SegmentedControl<BlendModeType>
                                        size="sm"
                                        value={layer.blendMode ?? preset?.defaultBlendMode ?? 0}
                                        onChange={(val) => onBlendModeChangeDataLayer?.(layer.id, val)}
                                        options={[
                                          { id: 0, label: 'Norm', title: 'Normal Blend' },
                                          { id: 1, label: 'Add', title: 'Additive Blend' },
                                          { id: 2, label: 'Mult', title: 'Multiply Blend' },
                                          { id: 3, label: 'Scrn', title: 'Screen Blend' },
                                        ]}
                                      />
                                    </div>
                                  </div>

                                {/* Terrain 3D Relief & Sun Azimuth (for Topo / Satellite / Ocean) */}
                                {(layer.category === 'topo' ||
                                  layer.category === 'satellite' ||
                                  layer.category === 'ocean' ||
                                  !!layer.renderStyle ||
                                  layer.elevationEncoding) && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/10 text-micro">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
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
                                      <span className="w-8 text-right font-bold text-[var(--theme-text-primary)] tabular-nums">
                                        {(layer.displacementScale ?? preset?.defaultDisplacementScale ?? 0.08).toFixed(2)}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
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
                                      <span className="w-8 text-right font-bold text-[var(--theme-text-primary)] tabular-nums">
                                        {Math.round(layer.sunAzimuth ?? 315)}°
                                      </span>
                                    </div>

                                    {/* Direction A: Valley Crevice Ambient Occlusion & Antialiased Contours */}
                                    {(layer.renderStyle === 'architectural' || layer.id === 'architectural-topo-relief') && (
                                      <div className="pt-1.5 border-t border-white/10 space-y-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
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
                                          <span className="w-8 text-right font-bold text-[var(--theme-text-primary)] tabular-nums">
                                            {Math.round((layer.ambientOcclusion ?? 0.65) * 100)}%
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-nano font-mono text-[var(--theme-text-muted)]">
                                          <span>Contour Filter:</span>
                                          <span className="font-bold text-[var(--theme-text-primary)]">fwidth() Anti-Aliased</span>
                                        </div>
                                      </div>
                                    )}

                                    {/* Direction B: Hydrosphere Depth, Sea Level, Clarity & Peak Exaggeration */}
                                    {(layer.renderStyle === 'hybrid' || layer.id === 'hybrid-crust-hydrosphere') && (
                                      <div className="pt-1.5 border-t border-white/10 space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
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
                                          <span className="w-8 text-right font-bold text-[var(--theme-text-primary)] tabular-nums">
                                            {(layer.seaLevelOffset ?? 0) > 0 ? `+${layer.seaLevelOffset}m` : `${layer.seaLevelOffset ?? 0}m`}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
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
                                          <span className="w-8 text-right font-bold text-[var(--theme-text-primary)] tabular-nums">
                                            {Math.round((layer.waterClarity ?? 0.75) * 100)}%
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
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
                                          <span className="w-8 text-right font-bold text-[var(--theme-text-primary)] tabular-nums">
                                            {(layer.peakExponent ?? 1.4).toFixed(1)}x
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                  {/* Color Legend Bar */}
                                  {legend && (
                                    <div className="space-y-1 pt-1 border-t border-white/10">
                                      <div className="flex items-center justify-between text-nano text-[var(--theme-text-muted)] font-bold">
                                        <span>{legend.minLabel}</span>
                                        <span className={`uppercase tracking-wider ${theme === 1 ? 'text-[#1a4457] font-semibold' : 'text-[var(--theme-accent-primary)]'}`}>{legend.unit}</span>
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
                        <span className="text-[var(--theme-status-slate)] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-status-slate)]"></span>
                          GPU Profiler
                        </span>
                        <span className="text-[var(--theme-status-sage)] font-mono">Total: {(gpuReport.totalGpuMs ?? 0).toFixed(2)}ms</span>
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
                className="mt-2 py-1 px-2.5 rounded-[2px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text-secondary)] flex items-center justify-between text-nano font-mono tracking-wider uppercase select-none shrink-0"
              >
                <span className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                  <span>
                    {theme === 1
                      ? 'Scroll Tensioned • 100% Rag'
                      : theme === 2
                      ? 'Diazo Plate • Ferroprussiate'
                      : 'Sounding Mylar • Marie Tharp'}
                  </span>
                </span>
                <span className="opacity-70 font-semibold text-[var(--theme-text-primary)]">
                  {theme === 1
                    ? '310 GSM // CALIBRATED'
                    : theme === 2
                    ? '80 GSM // CALIBRATED'
                    : '75 µm // CALIBRATED'}
                </span>
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
          className="fixed top-5 right-5 2xl:right-[26.5rem] z-40 pointer-events-auto w-96 max-w-[calc(100vw-2.5rem)] 2xl:max-w-[calc(100vw-28rem)] max-h-[calc(100vh-2.5rem)] flex flex-col font-mono select-none rounded-[3px] border backdrop-blur-2xl shadow-2xl p-4 text-micro transition-all duration-300 ease-out animate-in fade-in slide-in-from-right-4 border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg)] text-[var(--theme-text-primary)]"
        >
          {/* Catalog Sheet Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-panel-border)]">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  theme === 1
                    ? 'bg-[#8C4820]'
                    : theme === 2
                    ? 'bg-[#4fa3e3] shadow-[0_0_8px_rgba(79,163,227,0.8)]'
                    : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]'
                }`}
              />
              <div>
                <h3 className="text-micro font-semibold uppercase tracking-wider text-[var(--theme-text-primary)]">Cartographic Data Catalog</h3>
                <span className="text-nano opacity-60 text-[var(--theme-text-muted)]">
                  {DATA_LAYER_CATALOG.length} verified global datasets
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsCatalogOpen(false)}
              title="Close Catalog Sheet (Esc)"
              className="p-1.5 rounded-[2px] border transition-all cursor-pointer border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Domain Taxonomy Filter Chips */}
          <div className="flex items-center gap-1.5 pt-2 pb-2 border-b border-[var(--theme-panel-border)]">
            {(['all', 'topo', 'vectors', 'satellite'] as const).map((cat) => {
              const isSelected = catalogFilter === cat;
              const labels = {
                all: 'ALL',
                topo: 'TOPO',
                vectors: 'VECTORS',
                satellite: 'SATELLITE',
              };
              return (
                <button
                  key={cat}
                  onClick={() => setCatalogFilter(cat)}
                  className={`domain-chip cursor-pointer px-2 py-0.5 rounded-[2px] text-nano font-mono font-bold tracking-wider uppercase border transition-all ${
                    isSelected
                      ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                      : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                  }`}
                >
                  [{labels[cat]}]
                </button>
              );
            })}
          </div>

          {/* Catalog Datasets Scrollable List */}
          <div className="overflow-y-auto space-y-2.5 pr-1 mt-3 flex-1 max-h-[calc(100vh-8rem)] pb-8 scroll-fade-mask pt-1">
            {DATA_LAYER_CATALOG.filter((preset) => {
              if (catalogFilter === 'all') return true;
              if (catalogFilter === 'topo') {
                return preset.category === 'topo' || preset.category === 'ocean' || preset.category === 'point';
              }
              if (catalogFilter === 'vectors') {
                return (
                  preset.category === 'vectors' ||
                  preset.category === 'field' ||
                  preset.category === 'trajectory' ||
                  preset.category === 'point'
                );
              }
              if (catalogFilter === 'satellite') {
                return (
                  preset.category === 'satellite' ||
                  preset.category === 'night' ||
                  preset.category === 'trajectory' ||
                  preset.id === 'starlink-iss-orbits'
                );
              }
              return true;
            }).map((preset) => {
              const isAlreadyAdded = dataLayers.some((l) => l.id === preset.id);

              return (
                <div
                  key={preset.id}
                  className={`p-3 rounded-[2px] border transition-all flex flex-col gap-2 ${
                    isAlreadyAdded
                      ? 'bg-[var(--theme-control-bg)] border-[var(--theme-control-active-border)]'
                      : 'bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] hover:border-[var(--theme-card-border-hover)] text-[var(--theme-text-primary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-nano flex items-center gap-1.5">
                      {isAlreadyAdded && (
                        <span className={`w-2 h-2 rounded-full ${theme === 1 ? 'bg-[#1b432b]' : theme === 2 ? 'bg-[#8ee0b1]' : 'bg-[var(--theme-status-sage)] shadow-[0_0_6px_var(--theme-status-sage)]'}`}></span>
                      )}
                      <span>{preset.name}</span>
                      {preset.id === 'starlink-iss-orbits' && (
                        <span className={`flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] border shrink-0 ${
                          theme === 1
                            ? 'bg-[#2e6b47]/20 text-[#1b432b] border-[#2e6b47]/40 shadow-sm'
                            : theme === 2
                            ? 'bg-[#2a5540]/40 text-[#a3e5be] border-[#387256]/50 shadow-sm'
                            : 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40 shadow-[0_0_8px_var(--theme-status-sage)]'
                        }`}>
                          <span className={`w-1 h-1 rounded-full animate-ping ${
                            theme === 1 ? 'bg-[#1b432b]' : theme === 2 ? 'bg-[#a3e5be]' : 'bg-[var(--theme-status-sage)]'
                          }`}></span>
                          Live Synced
                        </span>
                      )}
                      {preset.id === 'noaa-gfs-wind' && (
                        <span className={`flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] border shrink-0 ${
                          theme === 1
                            ? 'bg-[#2b6b88]/20 text-[#1a4457] border-[#2b6b88]/40 shadow-sm'
                            : theme === 2
                            ? 'bg-[#3b5d82]/40 text-[#d8e6f3] border-[#4a729e]/50 shadow-sm'
                            : 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                        }`}>
                          Physics Model
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-nano uppercase font-bold px-1.5 py-0.5 rounded-[2px] border ${
                        theme === 1
                          ? preset.category === 'topo'
                            ? 'bg-[#2e6b47]/15 text-[#1b432b] border-[#2e6b47]/30'
                            : preset.category === 'satellite'
                            ? 'bg-[#2b6b88]/15 text-[#1a4457] border-[#2b6b88]/30'
                            : preset.category === 'vectors'
                            ? 'bg-[#96641e]/15 text-[#52350c] border-[#96641e]/30'
                            : 'bg-[#7a5a22]/15 text-[#422f0f] border-[#7a5a22]/30'
                          : theme === 2
                          ? preset.category === 'topo'
                            ? 'bg-[#2a5540]/30 text-[#8ee0b1] border-[#387256]/50'
                            : preset.category === 'satellite'
                            ? 'bg-[#2b4c6e]/30 text-[#9bc5ed] border-[#416994]/50'
                            : preset.category === 'vectors'
                            ? 'bg-[#5c4e30]/30 text-[#ecd79f] border-[#806f47]/50'
                            : 'bg-[#47576b]/30 text-[#c2d2e3] border-[#5d738c]/50'
                          : preset.category === 'topo'
                          ? 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/30'
                          : preset.category === 'satellite'
                          ? 'bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8]/30'
                          : preset.category === 'vectors'
                          ? 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30'
                          : 'bg-[#c5a059]/20 text-[#c5a059] border-[#c5a059]/30'
                      }`}
                    >
                      {preset.category}
                    </span>
                  </div>

                  <p className="text-nano leading-relaxed opacity-80 text-[var(--theme-text-muted)]">
                    {preset.details}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-white/10 text-micro">
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
                          ? theme === 1
                            ? 'bg-[#2e6b47]/15 text-[#1b432b] border-[#2e6b47]/30 cursor-default font-semibold'
                            : theme === 2
                            ? 'bg-[#2a5540]/30 text-[#8ee0b1] border-[#387256]/40 cursor-default font-semibold'
                            : 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40 cursor-default ring-1 ring-[var(--theme-status-sage)]/30 font-semibold'
                          : 'cursor-pointer bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] hover:border-[var(--theme-card-border-hover)] shadow-sm font-semibold'
                      }`}
                    >
                      {isAlreadyAdded ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-[var(--theme-status-sage)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>✓ Added to Stack</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                          </svg>
                          <span>+ Add Layer to Stack</span>
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
