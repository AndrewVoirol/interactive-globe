// ============================================================================
// File: src/components/hud/UnifiedRightSidebar.tsx
// Unified Right Sidebar: Engine Status + Topology Controls + Data Layers + Slide-out Catalog
// Clean, minimal, scannable HUD dock (Modular Shell)
// ============================================================================

import React, { useState } from 'react';
import { SimulationMode, GeodesicOverlayMode, LoadedDataInfo, ResolutionTier } from '../../types';
import { BlendModeType, getPresetById, DataLayerRenderStyle } from '../../core/data/DataLayerCatalog';
import { ThemeManager } from '../../core/themes/ThemeManager';
import { PrognosticModelBackend, isWeatherNextModel } from '../AtmosphereDrawer';
export type { PrognosticModelBackend };
export { isWeatherNextModel };
import { type TimelineScrubberState } from './TimelineScrubber';
import type { MeteorologicalProvenance } from '../../core/data/WeatherNextDataSource';
import { CrustHydrosphereTab } from './tabs/CrustHydrosphereTab';
import { AtmosphereTab } from './tabs/AtmosphereTab';
import { KinematicsTab } from './tabs/KinematicsTab';
import { DataLayersTab } from './tabs/DataLayersTab';
import { InspectionTab } from './tabs/InspectionTab';
import { CatalogSheet } from './tabs/CatalogSheet';
import { SidebarTelemetry } from './tabs/SidebarTelemetry';
import { VernierSlider } from '../ui/VernierSlider';

export * from './legacy/SystemStatusPill';
export * from './legacy/TopologyControlDock';
export * from './legacy/DataLayersDrawer';

export interface DataLayerItem {
  id: string; name: string; category?: string; type: string; details: string; visible: boolean;
  opacity?: number; blendMode?: BlendModeType; displacementScale?: number;
  elevationEncoding?: 'luminance' | 'mapbox' | 'terrarium';
  sunAzimuth?: number; sunAltitude?: number; hillshadeIntensity?: number; url?: string;
  renderStyle?: 'architectural' | 'hybrid' | 'photoreal';
  seaLevelOffset?: number; waterClarity?: number; peakExponent?: number;
  ambientOcclusion?: number; paperTooth?: number; unsupported?: boolean; unsupportedReason?: string;
}

export interface UnifiedRightSidebarProps {
  isZenMode: boolean; onZenToggle: () => void;
  theme: 0 | 1 | 2; onThemeToggle: () => void; onSelectThemeMode?: (mode: 0 | 1 | 2) => void;
  isolatedStratum?: number | null;
  onIsolatedStratumChange?: (stratum: number | null, swatch?: { hex: string; depth: string } | null) => void;
  showSoundings?: boolean; onSoundingsToggle?: () => void; showTriangulation?: boolean; onTriangulationToggle?: () => void; showCartouche?: boolean; onCartoucheToggle?: () => void;
  backend: 'webgl2' | 'webgpu'; onBackendChange: (b: 'webgl2' | 'webgpu') => void; hasWebGPU: boolean;
  resolution: ResolutionTier; onResolutionChange: (r: ResolutionTier) => void;
  layerMode: 0 | 1 | 2; onLayerModeChange: (l: 0 | 1 | 2) => void;
  mode: SimulationMode; onModeChange: (m: SimulationMode) => void;
  cursorPhysicsEnabled?: boolean; onCursorPhysicsToggle: (enabled: boolean) => void;
  activeOverlay: GeodesicOverlayMode; onOverlayChange: (o: GeodesicOverlayMode) => void;
  showLandmarks: boolean; onLandmarksToggle: () => void; showTissot: boolean; onTissotToggle: () => void; showVectors: boolean; onVectorsToggle: () => void;
  alpha: number; fps: number; latStr: string; lonStr: string; mapScaleStr: string; cameraPosition?: [number, number, number]; dataInfo?: LoadedDataInfo;
  onSnapCamera: (v: 'equator' | 'pole' | 'seam' | 'isometric' | 'horizon') => void;
  dataLayers?: DataLayerItem[]; onAddDataLayer?: (layer: DataLayerItem) => void;
  onToggleDataLayer?: (id: string) => void; onRemoveDataLayer?: (id: string) => void;
  onOpacityChangeDataLayer?: (id: string, opacity: number) => void; onBlendModeChangeDataLayer?: (id: string, blendMode: BlendModeType) => void;
  onDisplacementScaleChangeDataLayer?: (id: string, scale: number) => void;
  onHillshadeChangeDataLayer?: (id: string, azimuth: number, intensity: number, altitude?: number) => void;
  onSeaLevelOffsetChangeDataLayer?: (id: string, offset: number) => void; onWaterClarityChangeDataLayer?: (id: string, clarity: number) => void;
  onPeakExponentChangeDataLayer?: (id: string, exponent: number) => void; onAmbientOcclusionChangeDataLayer?: (id: string, ao: number) => void;
  onPaperToothChangeDataLayer?: (id: string, tooth: number) => void; onReorderDataLayer?: (id: string, direction: 'up' | 'down') => void;
  onSelectRenderStyle?: (style: DataLayerRenderStyle) => void;
  fractureIntensity?: number; onFractureIntensityChange?: (v: number) => void; fluidVortexStrength?: number; onFluidVortexStrengthChange?: (v: number) => void; gpuReport?: any;
  isCatalogOpen?: boolean; onCatalogOpenChange?: (open: boolean) => void; isSidebarOpen?: boolean; onSidebarOpenChange?: (open: boolean) => void;
  isDemoMode?: boolean; demoSequence?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji';
  onToggleDemoMode?: (seq?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => void; onSelectDemoSequence?: (seq: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => void;
  showClouds?: boolean; onShowCloudsChange?: (v: boolean) => void;
  showAtmosphere?: boolean; onShowAtmosphereChange?: (v: boolean) => void;
  showCloudLow?: boolean; onShowCloudLowChange?: (v: boolean) => void; showCloudMid?: boolean; onShowCloudMidChange?: (v: boolean) => void; showCloudHigh?: boolean; onShowCloudHighChange?: (v: boolean) => void;
  cloudFalseColor?: boolean; onCloudFalseColorChange?: (v: boolean) => void; volumetricClouds?: boolean; onVolumetricCloudsChange?: (v: boolean) => void;
  cloudDriftSpeed?: number; onCloudDriftSpeedChange?: (v: number) => void; cloudOpacity?: number; onCloudOpacityChange?: (v: number) => void; cloudThickness?: number; onCloudThicknessChange?: (v: number) => void;
  cloudLowTop?: number; onCloudLowTopChange?: (v: number) => void; cloudErosion?: number; onCloudErosionChange?: (v: number) => void;
  cloudFreqHoriz?: number; onCloudFreqHorizChange?: (v: number) => void; cloudFreqVert?: number; onCloudFreqVertChange?: (v: number) => void;
  cloudExtinction?: number; onCloudExtinctionChange?: (v: number) => void; atmosphericScale?: number; onAtmosphericScaleChange?: (v: number) => void;
  shadowIntensity?: number; onShadowIntensityChange?: (v: number) => void; verticalScaleMode?: number; onVerticalScaleModeChange?: (v: number) => void;
  rainShadowFeedback?: number; onRainShadowFeedbackChange?: (v: number) => void; pluvialGamma?: number; onPluvialGammaChange?: (v: number) => void;
  weatherOpticalMode?: number; onWeatherOpticalModeChange?: (v: number) => void; thermodynamicGating?: boolean; onThermodynamicGatingChange?: (v: boolean) => void;
  prognosticModel?: PrognosticModelBackend; onPrognosticModelChange?: (model: PrognosticModelBackend) => void;
  prognosticVariable?: string; onPrognosticVariableChange?: (variable: string) => void;
  timelineMinutes?: number; onTimelineChange?: (state: TimelineScrubberState) => void;
  purityMode?: boolean;
  onPurityModeToggle?: () => void;
  cdlodEnabled?: boolean; onCdlodToggle?: (enabled: boolean) => void;
  cdlodDiagnosticMode?: number; onCdlodDiagnosticModeChange?: (mode: number) => void; setCdlodDiagnosticMode?: (mode: number) => void;
  provenance?: MeteorologicalProvenance;
  windSpeedMultiplier?: number; onWindSpeedMultiplierChange?: (v: number) => void; windParticleLifetime?: number; onWindParticleLifetimeChange?: (v: number) => void;
  onTogglePlanetaryLayer?: (id: string, force?: boolean) => void;
  terrainShadows?: boolean; onTerrainShadowsToggle?: () => void; onTerrainShadowsChange?: (enabled: boolean) => void;
  penumbraSoftness?: number; onPenumbraSoftnessChange?: (softness: number) => void;
  geomorphicHydrology?: boolean; onGeomorphicHydrologyToggle?: () => void; onGeomorphicHydrologyChange?: (enabled: boolean) => void;
  pluvialDischargeCoupling?: number; onPluvialDischargeCouplingChange?: (val: number) => void;
  bedrockIncision?: number; onBedrockIncisionChange?: (val: number) => void;
}

export const UnifiedRightSidebar: React.FC<UnifiedRightSidebarProps> = (props) => {
  const {
    isZenMode, onZenToggle, theme, onThemeToggle, onSelectThemeMode,
    isolatedStratum: externalIsolatedStratum, onIsolatedStratumChange,
    showSoundings = false, onSoundingsToggle, showTriangulation = false, onTriangulationToggle,
    backend, resolution, onResolutionChange, layerMode, onLayerModeChange,
    mode, cursorPhysicsEnabled = false, onCursorPhysicsToggle, prognosticModel, onPrognosticModelChange,
    prognosticVariable, onPrognosticVariableChange, activeOverlay, onOverlayChange,
    showLandmarks, onLandmarksToggle, showTissot, onTissotToggle, showVectors, onVectorsToggle,
    alpha, fps, latStr, lonStr, mapScaleStr, cameraPosition, onSnapCamera,
    dataLayers = [], onAddDataLayer, onToggleDataLayer, onRemoveDataLayer,
    onOpacityChangeDataLayer, onDisplacementScaleChangeDataLayer, onHillshadeChangeDataLayer,
    onSeaLevelOffsetChangeDataLayer, onWaterClarityChangeDataLayer, onPeakExponentChangeDataLayer,
    onAmbientOcclusionChangeDataLayer, onPaperToothChangeDataLayer, fractureIntensity = 1.0,
    onFractureIntensityChange, fluidVortexStrength = 1.0, onFluidVortexStrengthChange, gpuReport,
    isCatalogOpen: externalCatalogOpen, onCatalogOpenChange, isSidebarOpen: externalSidebarOpen,
    onSidebarOpenChange, isDemoMode = false, demoSequence = 'hawaii', onToggleDemoMode, onSelectDemoSequence,
    showClouds: propShowClouds, onShowCloudsChange, showAtmosphere: propShowAtmosphere, onShowAtmosphereChange,
    showCloudLow: propShowCloudLow, onShowCloudLowChange, showCloudMid: propShowCloudMid, onShowCloudMidChange,
    showCloudHigh: propShowCloudHigh, onShowCloudHighChange, cloudFalseColor: propCloudFalseColor,
    onCloudFalseColorChange, volumetricClouds: propVolumetricClouds, onVolumetricCloudsChange,
    cloudDriftSpeed: propCloudDriftSpeed, onCloudDriftSpeedChange, cloudOpacity: propCloudOpacity,
    onCloudOpacityChange, cloudThickness: propCloudThickness, onCloudThicknessChange,
    cloudLowTop: propCloudLowTop, onCloudLowTopChange, cloudErosion: propCloudErosion, onCloudErosionChange,
    cloudFreqHoriz: propCloudFreqHoriz, onCloudFreqHorizChange, cloudFreqVert: propCloudFreqVert,
    onCloudFreqVertChange, cloudExtinction: propCloudExtinction, onCloudExtinctionChange,
    atmosphericScale: propAtmosphericScale, onAtmosphericScaleChange, shadowIntensity: propShadowIntensity,
    onShadowIntensityChange, verticalScaleMode: propVerticalScaleMode, onVerticalScaleModeChange,
    rainShadowFeedback: propRainShadowFeedback, onRainShadowFeedbackChange, pluvialGamma: propPluvialGamma,
    onPluvialGammaChange, weatherOpticalMode: propWeatherOpticalMode, onWeatherOpticalModeChange,
    thermodynamicGating: propThermodynamicGating, onThermodynamicGatingChange, timelineMinutes, onTimelineChange,
    purityMode = false, onPurityModeToggle, cdlodEnabled = true, onCdlodToggle,
    cdlodDiagnosticMode: cdlodDiagnosticModeProp, onCdlodDiagnosticModeChange, setCdlodDiagnosticMode,
    provenance, windSpeedMultiplier, onWindSpeedMultiplierChange, windParticleLifetime, onWindParticleLifetimeChange,
    onTogglePlanetaryLayer: propTogglePlanetaryLayer, terrainShadows: propTerrainShadows,
    onTerrainShadowsToggle, onTerrainShadowsChange, penumbraSoftness: propPenumbraSoftness,
    onPenumbraSoftnessChange, geomorphicHydrology: propGeomorphicHydrology, onGeomorphicHydrologyToggle,
    onGeomorphicHydrologyChange, pluvialDischargeCoupling: propPluvialDischargeCoupling,
    onPluvialDischargeCouplingChange, bedrockIncision: propBedrockIncision, onBedrockIncisionChange,
  } = props;

  const handleToggleClouds = (val: boolean) => {
    onShowCloudsChange?.(val);
    if (val && onVolumetricCloudsChange && propVolumetricClouds !== true) onVolumetricCloudsChange(true);
    const isGfs = prognosticModel === 'gfs' || prognosticModel === 'noaa-gfs';
    const cloudLayer = dataLayers.find((l) => l.id === 'noaa-gfs-clouds');
    const wnLayer = dataLayers.find((l) => l.id === 'google-weathernext3');
    if (!val) {
      if (cloudLayer?.visible) onToggleDataLayer?.('noaa-gfs-clouds');
      if (wnLayer?.visible) onToggleDataLayer?.('google-weathernext3');
    } else if (isGfs) {
      if (cloudLayer) { if (!cloudLayer.visible) onToggleDataLayer?.('noaa-gfs-clouds'); }
      else if (onAddDataLayer) {
        const p = getPresetById('noaa-gfs-clouds');
        if (p) onAddDataLayer({ id: p.id, name: p.name, category: p.category, type: p.type, details: p.details, visible: true, opacity: p.defaultOpacity, blendMode: p.defaultBlendMode, url: p.url });
      }
    } else {
      if (wnLayer) { if (!wnLayer.visible) onToggleDataLayer?.('google-weathernext3'); }
      else if (onAddDataLayer) {
        const p = getPresetById('google-weathernext3');
        if (p) onAddDataLayer({ id: p.id, name: p.name, category: p.category, type: p.type, details: p.details, visible: true, opacity: p.defaultOpacity, blendMode: p.defaultBlendMode, url: p.url });
      }
    }
  };

  const [internalSidebarOpen, setInternalSidebarOpen] = useState(true);
  const isSidebarOpen = externalSidebarOpen !== undefined ? externalSidebarOpen : internalSidebarOpen;
  const setIsSidebarOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isSidebarOpen) : val;
    onSidebarOpenChange?.(nextVal); setInternalSidebarOpen(nextVal);
  };

  const [internalCatalogOpen, setInternalCatalogOpen] = useState(false);
  const isCatalogOpen = externalCatalogOpen !== undefined ? externalCatalogOpen : internalCatalogOpen;
  const setIsCatalogOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isCatalogOpen) : val;
    onCatalogOpenChange?.(nextVal); setInternalCatalogOpen(nextVal);
  };

  const [internalIsolatedStratum, setInternalIsolatedStratum] = useState<number | null>(() => ThemeManager.getInstance().getIsolatedStratum());
  const isolatedStratum = externalIsolatedStratum !== undefined ? externalIsolatedStratum : internalIsolatedStratum;
  const setIsolatedStratum = (val: number | null | ((prev: number | null) => number | null)) => {
    const nextVal = typeof val === 'function' ? val(isolatedStratum) : val;
    setInternalIsolatedStratum(nextVal);
  };

  type SidebarPlate = 'cartography' | 'atmosphere' | 'kinematics' | 'data';
  const [activePlate, setActivePlate] = useState<SidebarPlate>('cartography');
  const isLight = theme === 1;

  const primaryLayer = dataLayers.find((l) => l.visible && (l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'topography')) || dataLayers[0];
  const primaryLayerId = primaryLayer?.id || (layerMode === 0 ? 'hybrid-crust-hydrosphere' : 'architectural-topo-relief');

  const applyMediumCalibration = (targetMode: 0 | 1 | 2) => {
    if (!primaryLayerId) return;
    if (targetMode === 1) {
      onHillshadeChangeDataLayer?.(primaryLayerId, 315, 0.70, 45); onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.14);
      onPeakExponentChangeDataLayer?.(primaryLayerId, 1.6); onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.65);
      onWaterClarityChangeDataLayer?.(primaryLayerId, 0.70); onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
      onPaperToothChangeDataLayer?.(primaryLayerId, 0.40);
    } else if (targetMode === 2) {
      onHillshadeChangeDataLayer?.(primaryLayerId, 315, 0.65, 50); onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.11);
      onPeakExponentChangeDataLayer?.(primaryLayerId, 1.4); onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.75);
      onWaterClarityChangeDataLayer?.(primaryLayerId, 0.60); onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
    } else {
      onHillshadeChangeDataLayer?.(primaryLayerId, 300, 0.60, 40); onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.12);
      onPeakExponentChangeDataLayer?.(primaryLayerId, 1.3); onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.60);
      onWaterClarityChangeDataLayer?.(primaryLayerId, 0.85); onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
    }
  };

  const handleSelectMedium = (targetMode: 0 | 1 | 2) => {
    if (onSelectThemeMode) onSelectThemeMode(targetMode);
    else if (theme !== targetMode) onThemeToggle();
    applyMediumCalibration(targetMode);
  };

  const handleHeaderThemeToggle = () => {
    const nextTheme = ((theme + 1) % 3) as 0 | 1 | 2;
    onThemeToggle(); applyMediumCalibration(nextTheme);
  };

  const handleTogglePlanetaryLayer = (id: string, force?: boolean) => {
    if (propTogglePlanetaryLayer) { propTogglePlanetaryLayer(id, force); return; }
    const existing = dataLayers.find((l) => l.id === id);
    if (existing) {
      if (force === true && existing.visible) return;
      onToggleDataLayer?.(id);
    } else {
      const preset = getPresetById(id);
      if (preset && onAddDataLayer) {
        onAddDataLayer({ id: preset.id, name: preset.name, category: preset.category, type: preset.type, details: preset.details, visible: true, opacity: preset.defaultOpacity, blendMode: preset.defaultBlendMode, url: preset.url });
      }
    }
  };

  const isNoaaActive = dataLayers.some((l) => l.id === 'noaa-gfs-wind' && l.visible);
  const isRadarActive = dataLayers.some((l) => l.id === 'live-doppler-radar' && l.visible);
  const isWindActive = prognosticVariable === 'wind_10m_vector' || prognosticVariable === 'ivt' || dataLayers.some((l) => (l.id.includes('wind') || l.id === 'noaa-gfs-wind') && l.visible);

  const handleEnableRadar = () => {
    const existing = dataLayers.find((l) => l.id === 'live-doppler-radar');
    if (existing) {
      if (!existing.visible && onToggleDataLayer) onToggleDataLayer('live-doppler-radar');
    } else if (onAddDataLayer) {
      const preset = getPresetById('live-doppler-radar');
      if (preset) {
        onAddDataLayer({
          id: preset.id, name: preset.name, category: preset.category, type: preset.type, details: preset.details, visible: true,
          opacity: preset.defaultOpacity, blendMode: preset.defaultBlendMode, displacementScale: preset.defaultDisplacementScale,
          elevationEncoding: preset.elevationEncoding, sunAzimuth: 315, sunAltitude: 45, hillshadeIntensity: 0.65, url: preset.url, renderStyle: preset.renderStyle,
        });
      }
    }
  };

  if (isZenMode) return null;

  return (
    <>
      <div className="fixed top-5 right-5 z-30 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-500 origin-top ease-out">
        <div
          className={`rounded-[3px] border shadow-2xl p-3 text-micro flex flex-col sidebar-spring-transition relative scroll-curl-lip font-telemetry ${
            isSidebarOpen ? 'max-h-[calc(100vh-2.5rem)]' : 'max-h-[144px] overflow-hidden'
          } ${
            theme === 1
              ? 'paper-cream-panel border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] shadow-2xl shadow-[#d8cfbc]/40'
              : theme === 2
              ? 'paper-cyanotype border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] shadow-2xl shadow-[#071320]/80'
              : 'paper-tharp border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] shadow-2xl shadow-[#080d12]/80'
          }`}
        >
          {/* Header Row 1: Title & Window Controls */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--theme-panel-header-border)]">
            <span className="cartouche-title text-title font-semibold tracking-wider uppercase text-[var(--theme-text-primary)]">
              INDICATRIX // CONTROLS
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onZenToggle}
                title="Zen Mode (Press H)"
                className="cursor-pointer text-nano font-bold px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)] transition-all"
              >
                Zen (H)
              </button>
              <button
                onClick={() => {
                  const nextState = !isSidebarOpen;
                  setIsSidebarOpen(nextState);
                  if (!nextState) setIsCatalogOpen(false);
                }}
                className="cursor-pointer tactile-btn text-nano font-bold px-2 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)] transition-all"
                title={isSidebarOpen ? 'Roll Up' : 'Unfurl'}
              >
                {isSidebarOpen ? 'Roll Up' : 'Unfurl'}
              </button>
            </div>
          </div>

          {/* Header Row 2: Persistent Medium Substrate Switcher */}
          <div className={`py-2 space-y-1.5 ${isSidebarOpen ? 'border-b border-[var(--theme-panel-header-border)]' : ''}`}>
            <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-wider">
              <span className="text-[var(--theme-text-primary)]">Medium Substrate</span>
              <button
                onClick={handleHeaderThemeToggle}
                aria-label={theme === 0 ? 'Switch to Cream Rag' : theme === 1 ? 'Switch to Prussian Cyanotype' : 'Switch to Marie Tharp'}
                title={theme === 0 ? 'Switch to Cream Rag (Press T)' : theme === 1 ? 'Switch to Prussian Cyanotype (Press T)' : 'Switch to Marie Tharp (Press T)'}
                className="cursor-pointer text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-accent)] hover:border-[var(--theme-control-active-border)] transition-all"
              >
                {theme === 0 ? 'Tharp ⇄' : theme === 1 ? 'Cream ⇄' : 'Prussian ⇄'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: 0, title: 'Tharp', sub: 'Physiographic' },
                { id: 1, title: 'Cream Rag', sub: 'Swiss Relief' },
                { id: 2, title: 'Prussian', sub: 'Cyanotype' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    handleSelectMedium(m.id as 0 | 1 | 2);
                    if (purityMode && onPurityModeToggle) onPurityModeToggle();
                  }}
                  aria-pressed={theme === m.id && !purityMode}
                  className={`tactile-btn group cursor-pointer py-1.5 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-0.5 border transition-all ${
                    theme === m.id && !purityMode
                      ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-semibold shadow-md'
                      : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                  }`}
                >
                  <span className="text-body font-medium tracking-tight">{m.title}</span>
                  <span className="text-nano uppercase font-medium tracking-tight opacity-75">{m.sub}</span>
                </button>
              ))}
              {/* 4th Medium: Purity / Raw DEM — shows the mathematical machinery */}
              <button
                onClick={() => onPurityModeToggle?.()}
                aria-pressed={Boolean(purityMode)}
                className={`tactile-btn group cursor-pointer py-1.5 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-0.5 border transition-all ${
                  purityMode
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-semibold shadow-md'
                    : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                }`}
                title="Raw DEM — pure mathematical substrate, zero atmosphere/water"
              >
                <span className="text-body font-medium tracking-tight">Purity</span>
                <span className="text-nano uppercase font-medium tracking-tight opacity-75">Raw DEM</span>
              </button>
            </div>
            {/* Paper Substrate — medium grain control (always visible with medium switcher) */}
            <VernierSlider
              id="sidebar-paper-tooth"
              label="Paper Grain"
              sublabel={
                theme === 1
                  ? '310 GSM cotton rag cellulose roughness'
                  : theme === 2
                  ? 'Drafting linen warp & weft weave'
                  : '1977 physiographic board tooth'
              }
              tooltip={
                theme === 1
                  ? 'Simulates physical micro-texture and cellulose fiber roughness of 310 GSM archival cotton rag paper'
                  : theme === 2
                  ? 'Simulates structured blueprint drafting linen weave with orthogonal warp and weft fibers'
                  : 'Simulates 1977 Marie Tharp physiographic illustration board tooth and stipple relief'
              }
              value={primaryLayer?.paperTooth ?? 0.40}
              min={0.0}
              max={1.0}
              step={0.05}
              defaultValue={0.40}
              readout={`${Math.round((primaryLayer?.paperTooth ?? 0.40) * 100)}%`}
              onChange={(v) => onPaperToothChangeDataLayer?.(primaryLayerId, v)}
              className="!border-0 !bg-transparent !p-0 !shadow-none"
            />
          </div>

          {/* Expandable Scroll Drawer */}
          <div
            id="sidebar-drawer"
            className={`sidebar-spring-transition flex flex-col flex-1 min-h-0 overflow-hidden ${
              isSidebarOpen ? 'opacity-100 max-h-[calc(100vh-8.5rem)] mt-1' : 'opacity-0 max-h-0 pointer-events-none'
            }`}
          >
            {/* 4 Consolidated Plates: CARTOGRAPHY, ATMOSPHERE, KINEMATICS, DATA */}
            <div role="tablist" aria-label="Sidebar Sections" className="grid grid-cols-4 py-1.5 border-b border-[var(--theme-panel-header-border)] gap-1 text-nano font-mono uppercase tracking-wider overflow-x-auto scrollbar-none shrink-0">
              {(
                [
                  { id: 'cartography', label: 'CARTOGRAPHY' },
                  { id: 'atmosphere', label: 'ATMOSPHERE' },
                  { id: 'kinematics', label: 'KINEMATICS' },
                  { id: 'data', label: 'DATA' },
                ] as const
              ).map((tab) => {
                const isActive = activePlate === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    id={`sidebar-tab-${tab.id}`}
                    aria-selected={isActive}
                    aria-controls={`sidebar-panel-${tab.id}`}
                    onClick={() => setActivePlate(tab.id)}
                    className={`py-1 px-0.5 rounded-[2px] font-bold transition-all border shrink-0 cursor-pointer text-center truncate ${
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

            {/* Main Content Area */}
            <div className="mt-2.5 space-y-3 overflow-y-auto pr-1 flex-1 min-h-0 scroll-fade-mask pt-1 pb-3">
              {/* TAB 1: CARTOGRAPHY */}
              <div
                id="sidebar-panel-cartography"
                role="tabpanel"
                aria-labelledby="sidebar-tab-cartography"
                className={activePlate === 'cartography' ? 'space-y-2.5' : 'hidden'}
              >
                <CrustHydrosphereTab
                  theme={theme} isLight={isLight} primaryLayer={primaryLayer} primaryLayerId={primaryLayerId}
                  onHillshadeChangeDataLayer={onHillshadeChangeDataLayer} onDisplacementScaleChangeDataLayer={onDisplacementScaleChangeDataLayer}
                  onPeakExponentChangeDataLayer={onPeakExponentChangeDataLayer} onAmbientOcclusionChangeDataLayer={onAmbientOcclusionChangeDataLayer}
                  onSeaLevelOffsetChangeDataLayer={onSeaLevelOffsetChangeDataLayer} onWaterClarityChangeDataLayer={onWaterClarityChangeDataLayer}
                  onPaperToothChangeDataLayer={onPaperToothChangeDataLayer} isolatedStratum={isolatedStratum} setIsolatedStratum={setIsolatedStratum}
                  onIsolatedStratumChange={onIsolatedStratumChange} applyMediumCalibration={applyMediumCalibration}
                  layerMode={layerMode} onLayerModeChange={onLayerModeChange} showVectors={showVectors} onVectorsToggle={onVectorsToggle}
                  showSoundings={showSoundings} onSoundingsToggle={onSoundingsToggle} showTriangulation={showTriangulation} onTriangulationToggle={onTriangulationToggle}
                  showLandmarks={showLandmarks} onLandmarksToggle={onLandmarksToggle} propShowClouds={propShowClouds} handleToggleClouds={handleToggleClouds}
                  terrainShadows={propTerrainShadows} onTerrainShadowsToggle={onTerrainShadowsToggle} onTerrainShadowsChange={onTerrainShadowsChange}
                  penumbraSoftness={propPenumbraSoftness} onPenumbraSoftnessChange={onPenumbraSoftnessChange} geomorphicHydrology={propGeomorphicHydrology}
                  onGeomorphicHydrologyToggle={onGeomorphicHydrologyToggle} onGeomorphicHydrologyChange={onGeomorphicHydrologyChange}
                  pluvialDischargeCoupling={propPluvialDischargeCoupling} onPluvialDischargeCouplingChange={onPluvialDischargeCouplingChange}
                  bedrockIncision={propBedrockIncision} onBedrockIncisionChange={onBedrockIncisionChange}
                />
              </div>

              {/* TAB 2: ATMOSPHERE */}
              <div
                id="sidebar-panel-atmosphere"
                role="tabpanel"
                aria-labelledby="sidebar-tab-atmosphere"
                className={activePlate === 'atmosphere' ? 'space-y-2.5' : 'hidden'}
              >
                <AtmosphereTab
                  theme={theme} isLight={isLight} resolution={resolution} timelineMinutes={timelineMinutes} onTimelineChange={onTimelineChange}
                  isRadarActive={isRadarActive} handleEnableRadar={handleEnableRadar} propShowClouds={propShowClouds} handleToggleClouds={handleToggleClouds}
                  propShowAtmosphere={propShowAtmosphere} onShowAtmosphereChange={onShowAtmosphereChange} propShowCloudLow={propShowCloudLow}
                  onShowCloudLowChange={onShowCloudLowChange} propShowCloudMid={propShowCloudMid} onShowCloudMidChange={onShowCloudMidChange}
                  propShowCloudHigh={propShowCloudHigh} onShowCloudHighChange={onShowCloudHighChange} propCloudFalseColor={propCloudFalseColor}
                  onCloudFalseColorChange={onCloudFalseColorChange} propVolumetricClouds={propVolumetricClouds} onVolumetricCloudsChange={onVolumetricCloudsChange}
                  propCloudDriftSpeed={propCloudDriftSpeed} onCloudDriftSpeedChange={onCloudDriftSpeedChange} propCloudOpacity={propCloudOpacity}
                  onCloudOpacityChange={onCloudOpacityChange} propCloudThickness={propCloudThickness} onCloudThicknessChange={onCloudThicknessChange}
                  propCloudLowTop={propCloudLowTop} onCloudLowTopChange={onCloudLowTopChange} propCloudErosion={propCloudErosion} onCloudErosionChange={onCloudErosionChange}
                  propCloudFreqHoriz={propCloudFreqHoriz} onCloudFreqHorizChange={onCloudFreqHorizChange} propCloudFreqVert={propCloudFreqVert}
                  onCloudFreqVertChange={onCloudFreqVertChange} propCloudExtinction={propCloudExtinction} onCloudExtinctionChange={onCloudExtinctionChange}
                  propAtmosphericScale={propAtmosphericScale} onAtmosphericScaleChange={onAtmosphericScaleChange} propShadowIntensity={propShadowIntensity}
                  onShadowIntensityChange={onShadowIntensityChange} propVerticalScaleMode={propVerticalScaleMode} onVerticalScaleModeChange={onVerticalScaleModeChange}
                  propRainShadowFeedback={propRainShadowFeedback} onRainShadowFeedbackChange={onRainShadowFeedbackChange} propPluvialGamma={propPluvialGamma}
                  onPluvialGammaChange={onPluvialGammaChange} weatherOpticalMode={propWeatherOpticalMode} onWeatherOpticalModeChange={onWeatherOpticalModeChange}
                  propThermodynamicGating={propThermodynamicGating} onThermodynamicGatingChange={onThermodynamicGatingChange} prognosticModel={prognosticModel}
                  onPrognosticModelChange={onPrognosticModelChange} prognosticVariable={prognosticVariable} onPrognosticVariableChange={onPrognosticVariableChange}
                  onSnapCamera={onSnapCamera} handleTogglePlanetaryLayer={handleTogglePlanetaryLayer} provenance={provenance} windSpeedMultiplier={windSpeedMultiplier}
                  onWindSpeedMultiplierChange={onWindSpeedMultiplierChange} windParticleLifetime={windParticleLifetime} onWindParticleLifetimeChange={onWindParticleLifetimeChange}
                  isWindActive={isWindActive}
                />
              </div>

              {/* TAB 3: KINEMATICS */}
              <div
                id="sidebar-panel-kinematics"
                role="tabpanel"
                aria-labelledby="sidebar-tab-kinematics"
                className={activePlate === 'kinematics' ? 'space-y-2.5' : 'hidden'}
              >
                <KinematicsTab
                  theme={theme} mode={mode} alpha={alpha} latStr={latStr}
                  cameraPosition={cameraPosition} onSnapCamera={onSnapCamera}
                  isDemoMode={isDemoMode} demoSequence={demoSequence}
                  onToggleDemoMode={onToggleDemoMode} onSelectDemoSequence={onSelectDemoSequence}
                  fractureIntensity={fractureIntensity} onFractureIntensityChange={onFractureIntensityChange}
                  fluidVortexStrength={fluidVortexStrength} onFluidVortexStrengthChange={onFluidVortexStrengthChange}
                  showTissot={showTissot} onTissotToggle={onTissotToggle}
                  activeOverlay={activeOverlay} onOverlayChange={onOverlayChange}
                />
              </div>

              {/* TAB 4: DATA */}
              <div
                id="sidebar-panel-data"
                role="tabpanel"
                aria-labelledby="sidebar-tab-data"
                className={activePlate === 'data' ? 'space-y-2.5' : 'hidden'}
              >
                <DataLayersTab
                  theme={theme} mode={mode} alpha={alpha} dataLayers={dataLayers}
                  isCatalogOpen={isCatalogOpen} setIsCatalogOpen={setIsCatalogOpen}
                  onToggleDataLayer={onToggleDataLayer} onRemoveDataLayer={onRemoveDataLayer}
                  onOpacityChangeDataLayer={onOpacityChangeDataLayer}
                  onAmbientOcclusionChangeDataLayer={onAmbientOcclusionChangeDataLayer}
                  propShowClouds={propShowClouds} isNoaaActive={isNoaaActive} isRadarActive={isRadarActive}
                />
                <InspectionTab
                  theme={theme} purityMode={purityMode} onPurityModeToggle={onPurityModeToggle}
                  cdlodEnabled={cdlodEnabled} onCdlodToggle={onCdlodToggle}
                  cursorPhysicsEnabled={cursorPhysicsEnabled} onCursorPhysicsToggle={onCursorPhysicsToggle}
                  cdlodDiagnosticMode={cdlodDiagnosticModeProp} onCdlodDiagnosticModeChange={onCdlodDiagnosticModeChange}
                  setCdlodDiagnosticMode={setCdlodDiagnosticMode}
                />
              </div>
            </div>

            {/* Telemetry Footer */}
            <SidebarTelemetry
              theme={theme} resolution={resolution} onResolutionChange={onResolutionChange}
              latStr={latStr} lonStr={lonStr} mapScaleStr={mapScaleStr}
              fps={fps} backend={backend} gpuReport={gpuReport}
            />
          </div>
        </div>
      </div>

      {/* Slide-Out Catalog Sheet */}
      <CatalogSheet
        isCatalogOpen={isCatalogOpen} setIsCatalogOpen={setIsCatalogOpen}
        theme={theme} dataLayers={dataLayers} onAddDataLayer={onAddDataLayer}
        onShowCloudsChange={onShowCloudsChange}
      />
    </>
  );
};
