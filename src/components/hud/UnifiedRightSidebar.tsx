// ============================================================================
// File: src/components/hud/UnifiedRightSidebar.tsx
// Unified Right Sidebar: Engine Status + Topology Controls + Data Layers + Slide-out Catalog
// Clean, minimal, scannable HUD dock
// ============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SimulationMode, GeodesicOverlayMode, LoadedDataInfo, ResolutionTier } from '../../types';
import { DATA_LAYER_CATALOG, BlendModeType, getPresetById, DataLayerRenderStyle } from '../../core/data/DataLayerCatalog';
import { DataLayerItem } from './DataLayersDrawer';
import { PolarSunCompass } from './instruments/PolarSunCompass';
import { HypsometricReliefCurve } from './instruments/HypsometricReliefCurve';
import { BathymetricTideGauge } from './instruments/BathymetricTideGauge';
import { TactileSwitch } from '../ui/TactileSwitch';
import { VernierSlider } from '../ui/VernierSlider';
import { SegmentedControl } from '../ui/SegmentedControl';
import { TactileSelect } from '../ui/TactileSelect';
import { ThemeManager } from '../../core/themes/ThemeManager';
import { AtmosphereDrawer, PrognosticModelBackend } from '../AtmosphereDrawer';
export type { PrognosticModelBackend };
import { TimelineScrubber, type TimelineScrubberState } from './TimelineScrubber';
import { CuratorsColophon } from './CuratorsColophon';

const PIGMENT_SWATCHES: Record<0 | 1 | 2, Array<{ hex: string; depth: string }>> = {
  0: [{ hex: '#0f171f', depth: '-11,000m' }, { hex: '#22384a', depth: 'Shelf Break' }, { hex: '#3b788a', depth: 'Coastal' }, { hex: '#cbb692', depth: 'Steppe' }, { hex: '#f4ede1', depth: 'Glacial' }],
  1: [{ hex: '#263b52', depth: '-11,000m' }, { hex: '#77998b', depth: 'Shelf Break' }, { hex: '#cfb588', depth: 'Coastal' }, { hex: '#9e6d50', depth: 'Steppe' }, { hex: '#fdfcf9', depth: 'Glacial' }],
  2: [{ hex: '#0e1824', depth: '-11,000m' }, { hex: '#162b42', depth: 'Shelf Break' }, { hex: '#294d75', depth: 'Coastal' }, { hex: '#4f79a3', depth: 'Steppe' }, { hex: '#e8edf2', depth: 'Glacial' }],
};

export interface UnifiedRightSidebarProps {
  isZenMode: boolean;
  onZenToggle: () => void;
  theme: 0 | 1 | 2;
  onThemeToggle: () => void;
  onSelectThemeMode?: (mode: 0 | 1 | 2) => void;
  isolatedStratum?: number | null;
  onIsolatedStratumChange?: (stratum: number | null, swatch?: { hex: string; depth: string } | null) => void;
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
  cameraPosition?: [number, number, number];
  dataInfo?: LoadedDataInfo;
  onSnapCamera: (v: 'equator' | 'pole' | 'seam' | 'isometric' | 'horizon') => void;
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
  onPaperToothChangeDataLayer?: (id: string, tooth: number) => void;
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
  isDemoMode?: boolean;
  demoSequence?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji';
  onToggleDemoMode?: (seq?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => void;
  onSelectDemoSequence?: (seq: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => void;
  showClouds?: boolean; onShowCloudsChange?: (v: boolean) => void;
  showCloudLow?: boolean; onShowCloudLowChange?: (v: boolean) => void;
  showCloudMid?: boolean; onShowCloudMidChange?: (v: boolean) => void;
  showCloudHigh?: boolean; onShowCloudHighChange?: (v: boolean) => void;
  cloudDriftSpeed?: number; onCloudDriftSpeedChange?: (v: number) => void;
  cloudOpacity?: number; onCloudOpacityChange?: (v: number) => void;
  atmosphericScale?: number; onAtmosphericScaleChange?: (v: number) => void;
  shadowIntensity?: number; onShadowIntensityChange?: (v: number) => void;
  verticalScaleMode?: number; onVerticalScaleModeChange?: (v: number) => void;
  rainShadowFeedback?: number; onRainShadowFeedbackChange?: (v: number) => void;
  pluvialGamma?: number; onPluvialGammaChange?: (v: number) => void;
  weatherOpticalMode?: number; onWeatherOpticalModeChange?: (v: number) => void;
  thermodynamicGating?: boolean; onThermodynamicGatingChange?: (v: boolean) => void;
  prognosticModel?: PrognosticModelBackend; onPrognosticModelChange?: (model: PrognosticModelBackend) => void;
  prognosticVariable?: string; onPrognosticVariableChange?: (variable: string) => void;
  timelineMinutes?: number; onTimelineChange?: (state: TimelineScrubberState) => void;
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
  prognosticModel,
  onPrognosticModelChange,
  prognosticVariable,
  onPrognosticVariableChange,
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
  cameraPosition,
  dataInfo,
  onSnapCamera,
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
  onPaperToothChangeDataLayer,
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
  isDemoMode = false,
  demoSequence = 'hawaii',
  onToggleDemoMode,
  onSelectDemoSequence,
  showClouds: propShowClouds, onShowCloudsChange,
  showCloudLow: propShowCloudLow, onShowCloudLowChange,
  showCloudMid: propShowCloudMid, onShowCloudMidChange,
  showCloudHigh: propShowCloudHigh, onShowCloudHighChange,
  cloudDriftSpeed: propCloudDriftSpeed, onCloudDriftSpeedChange,
  cloudOpacity: propCloudOpacity, onCloudOpacityChange,
  atmosphericScale: propAtmosphericScale, onAtmosphericScaleChange,
  shadowIntensity: propShadowIntensity, onShadowIntensityChange,
  verticalScaleMode: propVerticalScaleMode, onVerticalScaleModeChange,
  rainShadowFeedback: propRainShadowFeedback, onRainShadowFeedbackChange,
  pluvialGamma: propPluvialGamma, onPluvialGammaChange,
  weatherOpticalMode: propWeatherOpticalMode, onWeatherOpticalModeChange,
  thermodynamicGating: propThermodynamicGating, onThermodynamicGatingChange,
  timelineMinutes, onTimelineChange,
}) => {
  const handleToggleClouds = (val: boolean) => {
    onShowCloudsChange?.(val);
    const cloudLayer = dataLayers.find((l) => l.id === 'noaa-gfs-clouds');
    if (cloudLayer) {
      if (cloudLayer.visible !== val) onToggleDataLayer?.('noaa-gfs-clouds');
    } else if (val && onAddDataLayer) {
      const preset = getPresetById('noaa-gfs-clouds');
      if (preset) {
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

  const [internalSidebarOpen, setInternalSidebarOpen] = useState(true);
  const isSidebarOpen = externalSidebarOpen !== undefined ? externalSidebarOpen : internalSidebarOpen;
  const setIsSidebarOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isSidebarOpen) : val;
    onSidebarOpenChange?.(nextVal);
    setInternalSidebarOpen(nextVal);
  };

  const [internalCatalogOpen, setInternalCatalogOpen] = useState(false);
  const isCatalogOpen = externalCatalogOpen !== undefined ? externalCatalogOpen : internalCatalogOpen;
  const setIsCatalogOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isCatalogOpen) : val;
    onCatalogOpenChange?.(nextVal);
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

  type SidebarPlate = 'scene' | 'data';
  const [activePlate, setActivePlate] = useState<SidebarPlate>('scene');
  const [isBetaOpen, setIsBetaOpen] = useState(true);
  const [activeSnap, setActiveSnap] = useState<'equator' | 'pole' | 'seam' | 'isometric' | 'horizon' | null>(null);

  const isLight = theme === 1;

  const attitudeReadout = useMemo(() => {
    const pos = cameraPosition || [0, 0, 15];
    const [x, y, z] = pos;
    const r = Math.sqrt(x * x + y * y + z * z);
    const alt = r > 0.001 ? r.toFixed(1) : '15.0';
    let pitch = (Math.asin(Math.max(-1, Math.min(1, y / (r || 1)))) * (180 / Math.PI)).toFixed(1);
    if (pitch === '-0.0') pitch = '0.0';
    let yaw = (Math.atan2(x, z) * (180 / Math.PI)).toFixed(1);
    if (yaw === '-0.0') yaw = '0.0';
    return `PITCH: ${pitch}° · YAW: ${yaw}° · ALT: ${alt} R`;
  }, [cameraPosition]);

  const PROJECTION_MODES = [
    { id: 0, roman: 'I', label: 'Linear' },
    { id: 1, roman: 'II', label: 'Scroll' },
    { id: 2, roman: 'III', label: 'Fracture' },
    { id: 3, roman: 'IV', label: 'Fluid' },
    { id: 4, roman: 'V', label: 'Dymaxion' },
  ] as const;

  const DEMO_PRESETS = [
    { id: 'hawaii', label: 'Hawaii', coordinates: "19°49'N 155°28'W", description: 'Volcanic hotspot & ocean trench' },
    { id: 'cape-cod', label: 'Cape Cod', coordinates: "41°54'N 70°03'W", description: 'Coastal spit & moraine barrier' },
    { id: 'grand-canyon', label: 'Grand Canyon', coordinates: "36°06'N 112°06'W", description: 'Riparian orogeny & canyon incision' },
    { id: 'fuji', label: 'Mount Fuji', coordinates: "35°21'N 138°43'E", description: 'Stratovolcano & caldera relief' },
  ] as const;

  const activeDirection: DataLayerRenderStyle =
    dataLayers.find((l) => l.visible && l.renderStyle)?.renderStyle ?? 'architectural';

  const parsedLat = useMemo(() => {
    if (!latStr) return 0;
    const match = latStr.match(/(\d+)°(?:(\d+)['\u2032])?([NS])?/);
    if (!match) return 0;
    const deg = parseFloat(match[1]) + (match[2] ? parseFloat(match[2]) / 60 : 0);
    return match[3] === 'S' ? -deg : deg;
  }, [latStr]);

  const tissotTelemetry = useMemo(() => {
    const latRad = (parsedLat * Math.PI) / 180;
    const cosLat = Math.max(0.087, Math.cos(latRad));
    const eqArea = ((1 - alpha) * 1.0 + alpha * (mode === 4 ? 1.04 : 1.0)).toFixed(3);

    const camBaseRatio =
      mode === 4
        ? 1.04
        : mode === 1
        ? 1.0 / (cosLat * cosLat)
        : mode === 0
        ? 1.0 / cosLat
        : 1.0;
    const localArea = ((1 - alpha) * 1.0 + alpha * camBaseRatio).toFixed(3);

    const polarBaseRatio =
      mode === 4 ? 1.041 : mode === 1 ? 131.6 : mode === 0 ? 11.5 : mode === 3 ? 1.0 : 1.12;
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

  const getStratumBadge = useCallback(
    (category?: string) => {
      const cat = (category || '').toLowerCase();
      const isTopo = cat.includes('topo') || cat.includes('relief') || cat.includes('elevation');
      const isOcean = cat.includes('ocean') || cat.includes('hydro') || cat.includes('bathymetry');
      const isAtmo = cat.includes('atmo') || cat.includes('weather') || cat.includes('cloud') || cat.includes('wind') || cat.includes('radar');
      const isVect = cat.includes('vector') || cat.includes('boundary') || cat.includes('graticule');
      const isOrbit = cat.includes('orbit') || cat.includes('satellite') || cat.includes('trajectory');

      if (theme === 1) {
        // Theme 1 (Cream Rag): Archival intaglio inks
        if (isTopo) return { border: '#8C4820', bg: 'rgba(140, 72, 32, 0.12)', text: '#8C4820', label: 'TOPO' };
        if (isOcean) return { border: '#1A4457', bg: 'rgba(26, 68, 87, 0.12)', text: '#1A4457', label: 'HYDRO' };
        if (isAtmo) return { border: '#2B6B88', bg: 'rgba(43, 107, 136, 0.12)', text: '#1E536B', label: 'ATMO' };
        if (isVect) return { border: '#7D4700', bg: 'rgba(125, 71, 0, 0.12)', text: '#7D4700', label: 'VECT' };
        if (isOrbit) return { border: '#5A3E28', bg: 'rgba(90, 62, 40, 0.12)', text: '#5A3E28', label: 'ORBIT' };
        return { border: '#605A52', bg: 'rgba(96, 90, 82, 0.12)', text: '#605A52', label: 'DATA' };
      } else if (theme === 2) {
        // Theme 2 (Prussian Cyanotype): Cold photochemical blues & ice white
        if (isTopo) return { border: '#5C82A6', bg: 'rgba(92, 130, 166, 0.20)', text: '#B8D0E8', label: 'TOPO' };
        if (isOcean) return { border: '#3B6B99', bg: 'rgba(59, 107, 153, 0.25)', text: '#9FC2E4', label: 'HYDRO' };
        if (isAtmo) return { border: '#38BDF8', bg: 'rgba(56, 189, 248, 0.20)', text: '#BAE6FD', label: 'ATMO' };
        if (isVect) return { border: '#7DD3FC', bg: 'rgba(125, 211, 252, 0.20)', text: '#E0F2FE', label: 'VECT' };
        if (isOrbit) return { border: '#60A5FA', bg: 'rgba(96, 165, 250, 0.20)', text: '#DBEAFE', label: 'ORBIT' };
        return { border: '#4A729E', bg: 'rgba(74, 114, 158, 0.20)', text: '#CADDF0', label: 'DATA' };
      } else {
        // Theme 0 (Marie Tharp / Cyber): Physiographic earth & ocean tones
        if (isTopo) return { border: '#C86D51', bg: 'rgba(200, 109, 81, 0.20)', text: '#FDBA74', label: 'TOPO' };
        if (isOcean) return { border: '#10B981', bg: 'rgba(16, 185, 129, 0.20)', text: '#6EE7B7', label: 'HYDRO' };
        if (isAtmo) return { border: '#38BDF8', bg: 'rgba(56, 189, 248, 0.20)', text: '#7DD3FC', label: 'ATMO' };
        if (isVect) return { border: '#F59E0B', bg: 'rgba(245, 158, 11, 0.20)', text: '#FCD34D', label: 'VECT' };
        if (isOrbit) return { border: '#A855F7', bg: 'rgba(168, 85, 247, 0.20)', text: '#D8B4FE', label: 'ORBIT' };
        return { border: '#94A3B8', bg: 'rgba(148, 163, 184, 0.20)', text: '#CBD5E1', label: 'DATA' };
      }
    },
    [theme]
  );

  const primaryLayer =
    dataLayers.find(
      (l) => l.visible && (l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'topography')
    ) || dataLayers[0];
  const primaryLayerId =
    primaryLayer?.id || (activeDirection === 'hybrid' ? 'hybrid-crust-hydrosphere' : 'architectural-topo-relief');

  const applyMediumCalibration = (targetMode: 0 | 1 | 2) => {
    if (!primaryLayerId) return;
    if (targetMode === 1) {
      onHillshadeChangeDataLayer?.(primaryLayerId, 315, 0.70, 45);
      onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.14);
      onPeakExponentChangeDataLayer?.(primaryLayerId, 1.6);
      onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.65);
      onWaterClarityChangeDataLayer?.(primaryLayerId, 0.70);
      onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
      onPaperToothChangeDataLayer?.(primaryLayerId, 0.40);
    } else if (targetMode === 2) {
      onHillshadeChangeDataLayer?.(primaryLayerId, 315, 0.65, 50);
      onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.11);
      onPeakExponentChangeDataLayer?.(primaryLayerId, 1.4);
      onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.75);
      onWaterClarityChangeDataLayer?.(primaryLayerId, 0.60);
      onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
    } else {
      onHillshadeChangeDataLayer?.(primaryLayerId, 300, 0.60, 40);
      onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.12);
      onPeakExponentChangeDataLayer?.(primaryLayerId, 1.3);
      onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.60);
      onWaterClarityChangeDataLayer?.(primaryLayerId, 0.85);
      onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
    }
  };

  const handleSelectMedium = (targetMode: 0 | 1 | 2) => {
    if (onSelectThemeMode) {
      onSelectThemeMode(targetMode);
    } else if (theme !== targetMode) {
      onThemeToggle();
    }
    applyMediumCalibration(targetMode);
  };

  const handleHeaderThemeToggle = () => {
    const nextTheme = ((theme + 1) % 3) as 0 | 1 | 2;
    onThemeToggle();
    applyMediumCalibration(nextTheme);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCatalogOpen) setIsCatalogOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCatalogOpen]);

  const handleTogglePlanetaryLayer = (id: string, force?: boolean) => {
    const existing = dataLayers.find((l) => l.id === id);
    if (existing) {
      if (force === true && existing.visible) return;
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

  const isNoaaActive = dataLayers.some((l) => l.id === 'noaa-gfs-wind' && l.visible);
  const isRadarActive = dataLayers.some((l) => l.id === 'live-doppler-radar' && l.visible);

  const handleSelectGeodesicFeed = useCallback(
    (feed: GeodesicOverlayMode) => {
      onOverlayChange?.(feed);
      if (typeof window !== 'undefined') {
        const camDev = (window as any).__INDICATRIX_CAMERA__;
        if (feed === 'conveyor') {
          if (camDev?.easeToCoordinates) {
            camDev.easeToCoordinates(-165, 10, 14.0, 1.4);
          } else if (camDev?.lookAtCoordinates) {
            camDev.lookAtCoordinates(-165, 10, 14.0);
          }
        } else if (feed === 'migration') {
          if (camDev?.easeToCoordinates) {
            camDev.easeToCoordinates(-175, 15, 14.0, 1.4);
          } else if (camDev?.lookAtCoordinates) {
            camDev.lookAtCoordinates(-175, 15, 14.0);
          }
        } else if (feed === 'antipodes') {
          if (camDev?.easeToCoordinates) {
            camDev.easeToCoordinates(-65, 0, 14.0, 1.4);
          } else if (camDev?.lookAtCoordinates) {
            camDev.lookAtCoordinates(-65, 0, 14.0);
          }
        }
      }
    },
    [onOverlayChange]
  );

  const handleEnableRadar = useCallback(() => {
    const existing = dataLayers.find((l) => l.id === 'live-doppler-radar');
    if (existing) {
      if (!existing.visible && onToggleDataLayer) {
        onToggleDataLayer('live-doppler-radar');
      }
    } else if (onAddDataLayer) {
      const preset = getPresetById('live-doppler-radar');
      if (preset) {
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
    }
  }, [dataLayers, onToggleDataLayer, onAddDataLayer]);

  if (isZenMode) return null;

  return (
    <>
      <div className="fixed top-5 right-5 z-30 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-500 origin-top ease-out">
        <div
          className={`rounded-[3px] border shadow-2xl p-3 text-micro flex flex-col sidebar-spring-transition relative scroll-curl-lip font-telemetry ${
            isSidebarOpen ? 'max-h-[calc(100vh-2.5rem)]' : 'max-h-[82px] overflow-hidden'
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
          <div className="py-2 border-b border-[var(--theme-panel-header-border)] space-y-1.5">
            <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-wider">
              <span className="text-[var(--theme-text-primary)]">Medium Substrate</span>
              <button
                onClick={handleHeaderThemeToggle}
                aria-label={theme === 0 ? 'Switch to Cream Rag' : theme === 1 ? 'Switch to Prussian Cyanotype' : 'Switch to Marie Tharp'}
                title={
                  theme === 0
                    ? 'Switch to Cream Rag (Press T)'
                    : theme === 1
                    ? 'Switch to Prussian Cyanotype (Press T)'
                    : 'Switch to Marie Tharp (Press T)'
                }
                className="cursor-pointer text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-accent)] hover:border-[var(--theme-control-active-border)] transition-all"
              >
                {theme === 0 ? 'Tharp ⇄' : theme === 1 ? 'Cream ⇄' : 'Prussian ⇄'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 0, title: 'Tharp', sub: 'Physiographic' },
                { id: 1, title: 'Cream Rag', sub: 'Swiss Relief' },
                { id: 2, title: 'Prussian', sub: 'Cyanotype' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMedium(m.id as 0 | 1 | 2)}
                  aria-pressed={theme === m.id}
                  className={`tactile-btn group cursor-pointer py-1.5 px-1 rounded-[2px] text-center flex flex-col items-center justify-center gap-0.5 border transition-all ${
                    theme === m.id
                      ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] ring-1 ring-[var(--theme-control-active-ring)] font-semibold shadow-md'
                      : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                  }`}
                >
                  <span className="text-body font-medium tracking-tight">{m.title}</span>
                  <span className="text-nano uppercase font-medium tracking-tight opacity-75">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Expandable Scroll Drawer */}
          <div
            id="sidebar-drawer"
            className={`sidebar-spring-transition flex flex-col flex-1 min-h-0 overflow-hidden ${
              isSidebarOpen ? 'opacity-100 max-h-[calc(100vh-8.5rem)] mt-1' : 'opacity-0 max-h-0 pointer-events-none'
            }`}
          >
            {/* 2 Consolidated Tabs: SCENE and DATA */}
            <div role="tablist" aria-label="Sidebar Sections" className="flex items-center justify-between py-1.5 border-b border-[var(--theme-panel-header-border)] gap-1 text-nano font-mono uppercase tracking-wider overflow-x-auto scrollbar-none shrink-0">
              {(
                [
                  { id: 'scene', label: 'SCENE' },
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
                    className={`flex-1 py-1 rounded-[2px] font-bold transition-all border shrink-0 cursor-pointer text-center ${
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
              {/* TAB 1: SCENE */}
              <div
                id="sidebar-panel-scene"
                role="tabpanel"
                aria-labelledby="sidebar-tab-scene"
                className={activePlate === 'scene' ? 'space-y-2.5' : 'hidden'}
              >
                <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
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

                  <HypsometricReliefCurve
                    theme={theme}
                    displacementScale={primaryLayer?.displacementScale ?? 0.08}
                    peakExponent={primaryLayer?.peakExponent ?? 1.4}
                    onDisplacementChange={(scale) => onDisplacementScaleChangeDataLayer?.(primaryLayerId, scale)}
                    onPeakExponentChange={(exponent) => onPeakExponentChangeDataLayer?.(primaryLayerId, exponent)}
                    isLight={isLight}
                  />

                  <BathymetricTideGauge
                    theme={theme}
                    seaLevelOffset={primaryLayer?.seaLevelOffset ?? 0}
                    waterClarity={primaryLayer?.waterClarity ?? 0.75}
                    onSeaLevelChange={(offset) => onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, offset)}
                    onWaterClarityChange={(clarity) => onWaterClarityChangeDataLayer?.(primaryLayerId, clarity)}
                    isLight={isLight}
                  />

                  {/* Elevation Stratum Filter */}
                  <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-1">
                    <div className="flex items-center justify-between text-nano font-medium text-[var(--theme-text-secondary)]">
                      <span className="uppercase tracking-wider">Hypsometric Strata</span>
                      {isolatedStratum !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsolatedStratum(null);
                            onIsolatedStratumChange?.(null, null);
                            ThemeManager.getInstance().setIsolatedStratum(null, null);
                            if (primaryLayerId) {
                              handleSelectMedium(theme);
                            }
                          }}
                          className="cursor-pointer text-nano text-[var(--theme-text-accent)] hover:underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1" role="group" aria-label="Hypsometric stratum pigment pans">
                      {PIGMENT_SWATCHES[theme].map((swatch, idx) => {
                        const isIsolated = isolatedStratum === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const nextStratum = isolatedStratum === idx ? null : idx;
                              const nextSwatch = nextStratum !== null ? swatch : null;
                              setIsolatedStratum(nextStratum);
                              onIsolatedStratumChange?.(nextStratum, nextSwatch);
                              ThemeManager.getInstance().setIsolatedStratum(nextStratum, nextSwatch);

                              if (primaryLayerId) {
                                if (nextStratum === null) {
                                  handleSelectMedium(theme);
                                } else if (idx === 0) {
                                  onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, -25);
                                  onWaterClarityChangeDataLayer?.(primaryLayerId, 0.92);
                                } else if (idx === 1) {
                                  onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, -8);
                                  onWaterClarityChangeDataLayer?.(primaryLayerId, 0.82);
                                  onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.72);
                                } else if (idx === 2) {
                                  onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
                                  onWaterClarityChangeDataLayer?.(primaryLayerId, 0.75);
                                } else if (idx === 3) {
                                  onPeakExponentChangeDataLayer?.(primaryLayerId, 1.3);
                                  onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.12);
                                } else if (idx === 4) {
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
                            title={`${swatch.depth} (${swatch.hex})`}
                            aria-label={`Isolate ${swatch.depth} stratum (${swatch.hex})`}
                            aria-pressed={isIsolated}
                          >
                            <div
                              className="w-full h-3.5 rounded-[1px] border border-black/20 shadow-inner shrink-0"
                              style={{ backgroundColor: swatch.hex }}
                            />
                            <div className="text-nano font-mono opacity-80 uppercase tracking-tighter text-[var(--theme-text-secondary)] shrink-0 truncate w-full text-center">
                              {swatch.depth}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                    <div className="pt-1">
                      <VernierSlider
                        id="sidebar-crevice-ao"
                        label="Crevice Depth"
                        sublabel="Darkens concave ravines and canyon floors via DEM surface curvature"
                        tooltip="Darkens concave ravines and canyon floors via DEM surface curvature"
                        value={primaryLayer?.ambientOcclusion ?? 0.65}
                        min={0.0}
                        max={1.0}
                        step={0.05}
                        readout={`${Math.round((primaryLayer?.ambientOcclusion ?? 0.65) * 100)}%`}
                        onChange={(v) => onAmbientOcclusionChangeDataLayer?.(primaryLayerId, v)}
                      />
                    </div>
                  </div>

                  {/* 1. Manifold Strata Station */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                        Manifold Strata
                      </div>
                      <span className="text-nano font-mono opacity-60 text-[var(--theme-text-muted)]">
                        {layerMode === 0 ? '0 · Composite' : layerMode === 1 ? '1 · Stipple' : '2 · Lattice'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      {([
                        { id: 0, label: 'Composite', glyph: '⛶', title: '0: Composite — Combined stipple nodes and wireframe lattice' },
                        { id: 1, label: 'Stipple', glyph: '•', title: '1: Stipple — Discrete point sounding matrix only' },
                        { id: 2, label: 'Lattice', glyph: '◇', title: '2: Lattice — Triangulated Delaunay wireframe mesh only' },
                      ] as const).map((s) => {
                        const isActive = layerMode === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onLayerModeChange(s.id as 0 | 1 | 2)}
                            title={s.title}
                            aria-pressed={isActive}
                            className={`tactile-btn cursor-pointer py-1.5 px-1 rounded-[2px] text-nano font-mono uppercase tracking-tight text-center border transition-all flex flex-col items-center gap-0.5 ${
                              isActive
                                ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-bold shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                                : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                            }`}
                          >
                            <span className="text-micro leading-none opacity-70" aria-hidden="true">{s.glyph}</span>
                            <span className="truncate w-full">{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Projection Manifold Station with Archival Parchment Strip */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                        Projection
                      </span>
                      <span className="text-nano font-mono opacity-60 text-[var(--theme-text-muted)]">Mode {mode + 1}</span>
                    </div>

                    {/* Archival Parchment Strip for 5 Modes */}
                    <div className="relative p-0.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] shadow-inner overflow-hidden select-none">
                      <div
                        className="absolute top-0.5 bottom-0.5 rounded-[2px] transition-all duration-300 ease-out pointer-events-none bg-[var(--theme-control-active-bg)] border border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)]"
                        style={{
                          left: `calc(${mode * 20}% + 2px)`,
                          width: `calc(20% - 4px)`,
                        }}
                      />

                      <div className="relative grid grid-cols-5 z-10">
                        {PROJECTION_MODES.map((m) => {
                          const isActive = mode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => onModeChange(m.id as SimulationMode)}
                              aria-pressed={isActive}
                              className={`tactile-btn cursor-pointer py-1.5 px-0.5 rounded-[2px] text-nano font-mono uppercase tracking-tight text-center transition-all ${
                                isActive
                                  ? 'text-[var(--theme-control-active-text)] font-bold'
                                  : 'text-[var(--theme-control-text)] hover:text-[var(--theme-control-hover-text)]'
                              }`}
                              title={`${m.roman} · ${m.label} Projection`}
                            >
                              <span className="opacity-60 block text-nano">{m.roman}</span>
                              <span className="truncate block font-semibold">{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {mode === 2 && (
                      <div className="pt-1">
                        <VernierSlider
                          id="sidebar-fracture-intensity"
                          label="Fracture"
                          value={fractureIntensity ?? 1.0}
                          min={0.5}
                          max={2.5}
                          step={0.05}
                          readout={`${(fractureIntensity ?? 1.0).toFixed(2)}x`}
                          onChange={(v) => onFractureIntensityChange?.(v)}
                        />
                      </div>
                    )}

                    {mode === 3 && (
                      <div className="pt-1">
                        <VernierSlider
                          id="sidebar-vortex-strength"
                          label="Vortex"
                          value={fluidVortexStrength ?? 1.0}
                          min={0.2}
                          max={3.0}
                          step={0.05}
                          readout={`${(fluidVortexStrength ?? 1.0).toFixed(2)}x`}
                          onChange={(v) => onFluidVortexStrengthChange?.(v)}
                        />
                      </div>
                    )}

                    {/* Distortion Indicatrix (Tissot) Docked Directly in Projection Card */}
                    <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                            Distortion Indicatrix
                          </span>
                          <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                            Tissot deformation ellipses
                          </span>
                        </div>
                        <TactileSwitch
                          checked={showTissot}
                          onChange={onTissotToggle}
                          title="Toggle Tissot Distortion Indicatrix Ellipses"
                          label={showTissot ? 'Active' : 'Off'}
                        />
                      </div>

                      {showTissot && (
                        <div className="p-2 rounded-[2px] border text-micro space-y-1.5 tabular-nums bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]">
                          <div className="flex justify-between items-center text-nano uppercase tracking-wider font-semibold">
                            <span>Distortion Metric</span>
                            <span className="text-[var(--theme-status-sage)] font-bold">
                              {mode === 4 ? 'Isomeric (s ≈ 1.04x)' : 'Morphing'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-nano font-mono">
                            <div>
                              <span className="text-[var(--theme-text-muted)] block truncate text-nano uppercase">Eq. Area:</span>
                              <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.eqArea}x</span>
                            </div>
                            <div>
                              <span className="text-[var(--theme-text-muted)] block truncate text-nano uppercase">Local ({latStr.trim()}):</span>
                              <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.localArea}x</span>
                            </div>
                            <div>
                              <span className="text-[var(--theme-text-muted)] block truncate text-nano uppercase">Polar Dilation:</span>
                              <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.polarStr}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Spatial Vantage & Cinematics Station */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                        Spatial Vantage & Cinematics
                      </div>
                      <span className="text-nano font-mono opacity-60 text-[var(--theme-text-muted)]">
                        Kinematics
                      </span>
                    </div>

                    {/* Attitude Readout: Monospace coordinate strip */}
                    <div className="px-2 py-1 rounded-[2px] bg-[var(--theme-control-bg)] border border-[var(--theme-control-border)] text-nano font-mono tracking-wider text-center text-[var(--theme-text-accent)] tabular-nums font-semibold">
                      {attitudeReadout}
                    </div>

                    {/* 5 Presets with Cartographic Glyphs & Active State Highlighting */}
                    <div className="grid grid-cols-5 gap-1 text-nano font-bold">
                      {([
                        { key: 'equator', label: 'Equator', glyph: '⊝' },
                        { key: 'pole', label: 'Pole', glyph: '⊙' },
                        { key: 'seam', label: 'Seam', glyph: '⦶' },
                        { key: 'isometric', label: 'Iso', glyph: '◬' },
                        { key: 'horizon', label: 'Horizon', glyph: '☵' },
                      ] as const).map((snap) => {
                        const isSnapActive = activeSnap === snap.key;
                        return (
                          <button
                            key={snap.key}
                            type="button"
                            onClick={() => {
                              setActiveSnap(snap.key);
                              onSnapCamera(snap.key);
                            }}
                            data-glyph={snap.glyph}
                            aria-pressed={isSnapActive}
                            title={`${snap.label} (${snap.glyph})`}
                            className={`py-1.5 px-0.5 rounded-[2px] border transition-all cursor-pointer text-center truncate select-none flex flex-col items-center justify-center before:content-[attr(data-glyph)] before:block before:text-micro before:leading-none before:opacity-75 before:mb-0.5 ${
                              isSnapActive
                                ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-semibold ring-1 ring-[var(--theme-control-active-ring)]'
                                : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] hover:bg-[var(--theme-card-bg)]'
                            }`}
                          >
                            <span>{snap.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Flyover Tour / Demo Mode */}
                    <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                            Flyover Tour
                          </span>
                          <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                            Cinematic orbital & regional insets
                          </span>
                        </div>
                        <TactileSwitch
                          checked={Boolean(isDemoMode)}
                          onChange={() => onToggleDemoMode?.(demoSequence)}
                          title="Toggle Continuous Cinematics & Regional Insets Tour"
                          label={isDemoMode ? 'Active' : 'Off'}
                        />
                      </div>

                      <TactileSelect
                        id="sidebar-demo-sequence"
                        value={demoSequence || 'hawaii'}
                        ariaLabel="Demo Sequence Preset"
                        disabled={!isDemoMode}
                        onChange={(val) => onSelectDemoSequence?.(val as any)}
                        options={DEMO_PRESETS}
                      />
                    </div>
                  </div>

                  {/* 4. Vector Ink Station */}
                  <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] flex items-center justify-between transition-all shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                        Vectors (V)
                      </span>
                      <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                        Coastlines & graticule linework
                      </span>
                    </div>
                    <TactileSwitch
                      checked={showVectors}
                      onChange={onVectorsToggle}
                      title="Toggle Coastline & Boundary Vectors (Press V)"
                      label={showVectors ? 'Active' : 'Off'}
                    />
                  </div>

                  {/* 5. Collapsible Experimental / Beta Section */}
                  <div className="rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] transition-all shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsBetaOpen(!isBetaOpen)}
                      className="w-full p-2.5 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--theme-card-border)]/15 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-amber-500/20 text-amber-500 border border-amber-500/30">
                          BETA
                        </span>
                        <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                          Experimental & Diagnostics
                        </span>
                      </div>
                      <span className="text-nano font-mono text-[var(--theme-text-muted)]">
                        {isBetaOpen ? '▲ Collapse' : '▼ Expand'}
                      </span>
                    </button>
                    {isBetaOpen && (
                      <div className="p-2.5 pt-0 space-y-3 border-t border-[var(--theme-card-border)]/50 mt-1">
                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex flex-col">
                              <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                                Cursor Physics
                              </span>
                              <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                                Fluid advection wake & Griffith stress
                              </span>
                            </div>
                            <TactileSwitch
                              checked={cursorPhysicsEnabled}
                              onChange={() => onCursorPhysicsToggle(!cursorPhysicsEnabled)}
                              title="Toggle cursor physics"
                              label="Cursor Physics"
                            />
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[var(--theme-card-border)]/50">
                          <div className={`transition-opacity ${theme === 1 ? 'opacity-100' : 'opacity-70'}`}>
                            <VernierSlider
                              id="sidebar-paper-tooth"
                              label="Paper Grain"
                              sublabel={theme !== 1 ? '(Cream Rag only)' : 'Simulates physical cellulose fiber roughness of 310 GSM cotton rag paper'}
                              tooltip="Simulates physical cellulose fiber roughness of 310 GSM cotton rag paper"
                              value={primaryLayer?.paperTooth ?? 0.40}
                              min={0.0}
                              max={1.0}
                              step={0.05}
                              readout={`${Math.round((primaryLayer?.paperTooth ?? 0.40) * 100)}%`}
                              onChange={(v) => onPaperToothChangeDataLayer?.(primaryLayerId, v)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              {/* TAB 2: DATA */}
              <div
                id="sidebar-panel-data"
                role="tabpanel"
                aria-labelledby="sidebar-tab-data"
                className={activePlate === 'data' ? 'space-y-2.5' : 'hidden'}
              >
                {/* Layers Header */}
                <div className="flex items-center justify-between">
                  <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
                    Layers ({dataLayers.length})
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
                    (() => {
                      const isRasterLayer = (l: DataLayerItem) =>
                        !!(l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'satellite' || l.category === 'night');
                      const activeRasterId = dataLayers.find((l) => l.visible && isRasterLayer(l))?.id;

                      return dataLayers.map((layer, idx) => {
                        const preset = getPresetById(layer.id);
                        const legend = preset?.legend;
                        const isFirst = idx === 0;
                        const isLast = idx === dataLayers.length - 1;
                        const isExpanded = expandedLayerId === layer.id;
                        const isRaster = isRasterLayer(layer);
                        const isPrimaryRaster = isRaster && layer.id === activeRasterId && layer.visible;
                        const isShadowedRaster = isRaster && layer.visible && !isPrimaryRaster;

                        const stratum = getStratumBadge(preset?.category || layer.category);

                        return (
                          <div
                            key={layer.id}
                            className={`rounded-[2px] border flex flex-col text-micro transition-all folio-strip ${
                              layer.visible
                                ? 'bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] shadow-sm'
                                : 'bg-[var(--theme-card-bg)]/50 border-[var(--theme-card-border)]/60 text-[var(--theme-text-muted)] opacity-60'
                            }`}
                            style={
                              layer.visible
                                ? { borderLeftWidth: '3px', borderLeftColor: stratum.border }
                                : undefined
                            }
                          >
                            <div className="min-h-[34px] px-2 py-1.5 flex items-start justify-between gap-1.5 select-none">
                              <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                                  className="cursor-pointer p-0.5 pt-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-transform rounded-[1px]"
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

                                <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                                  <span
                                    className="text-nano font-mono font-bold px-1 py-0.2 rounded-[1px] border shrink-0 uppercase tracking-wider select-none"
                                    style={{
                                      borderColor: stratum.border,
                                      backgroundColor: stratum.bg,
                                      color: stratum.text,
                                    }}
                                    title={`Stratum Category: ${preset?.category || layer.category || 'data'}`}
                                  >
                                    {stratum.label}
                                  </span>

                                  <span
                                    className="leading-tight break-words text-nano font-bold cursor-pointer hover:text-[var(--theme-text-accent)]"
                                    title={layer.name}
                                    onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                                  >
                                    {layer.name}
                                  </span>

                                  {legend?.colorStops && legend.colorStops.length > 0 && (
                                    <div
                                      className="h-1.5 w-6 rounded-[1px] border border-black/20 shadow-2xs shrink-0 self-center opacity-90 hover:opacity-100 transition-opacity"
                                      style={{
                                        background: `linear-gradient(to right, ${legend.colorStops.join(', ')})`,
                                      }}
                                      title={`Pigment Preview: ${legend.minLabel || ''} → ${legend.maxLabel || ''} (${legend.unit || ''})`}
                                    />
                                  )}

                                  {isPrimaryRaster && (
                                    <span className="text-nano font-mono px-1 py-0.2 rounded border bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40 font-semibold" title="Active Base Raster rendered on planetary crust">
                                      (Active Raster)
                                    </span>
                                  )}
                                  {isShadowedRaster && (
                                    <span className="text-nano font-mono px-1 py-0.2 rounded border bg-amber-500/20 text-amber-300 border-amber-500/40" title="This raster dataset is occluded by a higher active raster layer in the Z-order stack">
                                      (Shadowed by higher raster layer)
                                    </span>
                                  )}
                                  {preset?.unsupported && (
                                    <span className="text-nano font-mono px-1 py-0.2 rounded border bg-rose-500/20 text-rose-300 border-rose-500/40">
                                      [UNSUPPORTED]
                                    </span>
                                  )}
                                </div>

                                <span className="text-nano font-mono opacity-50 shrink-0 self-start pt-0.5">
                                  Z:{dataLayers.length - idx}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                <button
                                  disabled={isFirst}
                                  onClick={() => onReorderDataLayer?.(layer.id, 'up')}
                                  title="Move Layer Up"
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

                                <button
                                  disabled={isLast}
                                  onClick={() => onReorderDataLayer?.(layer.id, 'down')}
                                  title="Move Layer Down"
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

                            <div
                              className={`transition-all duration-150 ease-out overflow-hidden ${
                                isExpanded
                                  ? 'max-h-[600px] opacity-100 mt-1 border-t border-[var(--theme-panel-header-border)] p-2.5 pt-0 space-y-2 pointer-events-auto'
                                  : 'max-h-0 opacity-0 border-t-0 p-0 m-0 pointer-events-none'
                              }`}
                              style={{ transitionTimingFunction: 'var(--theme-spring-switch, cubic-bezier(0.34, 1.35, 0.64, 1))' }}
                            >
                              <div className="flex items-center gap-1.5 text-nano pt-1.5">
                                <span className="text-[var(--theme-text-secondary)] font-bold text-nano uppercase tracking-wider">Opacity:</span>
                                <input
                                  id={`sidebar-opacity-${layer.id}`}
                                  name={`opacity-${layer.id}`}
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={layer.opacity ?? 0.85}
                                  onChange={(e) => onOpacityChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                  className="flex-1 slider-archival cursor-pointer h-1 rounded-[1px]"
                                />
                                <span className="w-8 text-right font-semibold tabular-nums text-[var(--theme-text-primary)]">
                                  {Math.round((layer.opacity ?? 0.85) * 100)}%
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-1 pt-1 text-nano">
                                <span className="text-[var(--theme-text-secondary)] font-bold text-nano uppercase tracking-wider">Blend:</span>
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

                              {(layer.renderStyle === 'architectural' || layer.id === 'architectural-topo-relief') && (
                                <div className="pt-1.5 border-t border-white/10 space-y-1 text-micro">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
                                      AO:
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
                                </div>
                              )}

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
                      });
                    })()
                  ) : (
                    <div className="p-4 rounded-[2px] border text-micro text-center italic border-[var(--theme-card-border)] text-[var(--theme-text-muted)] bg-[var(--theme-card-bg)]/40">
                      No active layers. Use + Catalog to add datasets.
                    </div>
                  )}
                </div>

                <TimelineScrubber
                  value={timelineMinutes}
                  onTimeChange={onTimelineChange}
                  isRadarActive={isRadarActive}
                  onEnableRadar={handleEnableRadar}
                  className="border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] !p-2.5 rounded-[3px]"
                />

                {/* Atmospheric Cloud Strata Instrumentation Card */}
                <AtmosphereDrawer
                  className="border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]"
                  theme={theme}
                  isLight={isLight}
                  hideScrubber={true}
                  isRadarActive={isRadarActive}
                  showClouds={propShowClouds}
                  onShowCloudsChange={handleToggleClouds}
                  showCloudLow={propShowCloudLow} onShowCloudLowChange={onShowCloudLowChange}
                  showCloudMid={propShowCloudMid} onShowCloudMidChange={onShowCloudMidChange}
                  showCloudHigh={propShowCloudHigh} onShowCloudHighChange={onShowCloudHighChange}
                  cloudDriftSpeed={propCloudDriftSpeed} onCloudDriftSpeedChange={onCloudDriftSpeedChange}
                  cloudOpacity={propCloudOpacity} onCloudOpacityChange={onCloudOpacityChange}
                  atmosphericScale={propAtmosphericScale} onAtmosphericScaleChange={onAtmosphericScaleChange}
                  shadowIntensity={propShadowIntensity} onShadowIntensityChange={onShadowIntensityChange}
                  verticalScaleMode={propVerticalScaleMode} onVerticalScaleModeChange={onVerticalScaleModeChange}
                  rainShadowFeedback={propRainShadowFeedback} onRainShadowFeedbackChange={onRainShadowFeedbackChange}
                  pluvialGamma={propPluvialGamma} onPluvialGammaChange={onPluvialGammaChange}
                  weatherOpticalMode={propWeatherOpticalMode} onWeatherOpticalModeChange={onWeatherOpticalModeChange}
                  thermodynamicGating={propThermodynamicGating} onThermodynamicGatingChange={onThermodynamicGatingChange}
                  prognosticModel={prognosticModel} onPrognosticModelChange={onPrognosticModelChange}
                  prognosticVariable={prognosticVariable} onPrognosticVariableChange={onPrognosticVariableChange}
                  timelineMinutes={timelineMinutes} onTimelineChange={onTimelineChange}
                  onSnapCamera={onSnapCamera}
                  onTogglePlanetaryLayer={handleTogglePlanetaryLayer}
                />

                {/* Global Geodesic Feeds Card */}
                <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2.5 transition-all shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
                      Global Geodesic Feeds
                    </div>
                    <span className="text-nano font-mono text-[var(--theme-text-muted)] opacity-80">
                      {activeOverlay === 'off' ? 'Off' : activeOverlay}
                    </span>
                  </div>

                  {/* Thematic Overlays (Antipodes, Conveyor, Migration) */}
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelectGeodesicFeed('off')}
                      className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
                        activeOverlay === 'off'
                          ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-semibold'
                          : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] bg-[var(--theme-control-bg)]'
                      }`}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectGeodesicFeed('antipodes')}
                      title="Antipodal Geodesic Connectors"
                      className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
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
                      type="button"
                      onClick={() => handleSelectGeodesicFeed('conveyor')}
                      title="Global Oceanic Conveyor Belt"
                      className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
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
                      type="button"
                      onClick={() => handleSelectGeodesicFeed('migration')}
                      title="Great Circle Migration"
                      className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
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

                  {/* Geodetic Survey Feeds: Soundings, Triangulation, Landmarks */}
                  <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-1.5">
                    <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
                      Geodetic Survey Feeds
                    </div>
                    <div className="space-y-1.5 pt-0.5">
                      <TactileSwitch
                        checked={showSoundings}
                        onChange={onSoundingsToggle}
                        title="Toggle Soundings"
                        label="Soundings"
                        sublabel="Marine bathymetric depth matrix"
                        indicatorColor={theme === 1 ? '#1A4457' : theme === 2 ? '#38BDF8' : '#10B981'}
                      />
                      <TactileSwitch
                        checked={showTriangulation}
                        onChange={onTriangulationToggle}
                        title="Toggle Triangulation"
                        label="Triangulation"
                        sublabel="Geodetic Delaunay survey baseline"
                        indicatorColor={theme === 1 ? '#9C2F2F' : '#F43F5E'}
                      />
                      <TactileSwitch
                        checked={showLandmarks}
                        onChange={onLandmarksToggle}
                        title="Toggle Landmarks"
                        label="Landmarks"
                        sublabel="Astronomical observatories & promontories"
                        indicatorColor={theme === 1 ? '#7D4700' : theme === 2 ? '#60A5FA' : '#F59E0B'}
                      />
                    </div>
                  </div>
                </div>

                {/* Archival Footer Colophon */}
                <CuratorsColophon
                  theme={theme}
                  mode={mode}
                  alpha={alpha}
                  isWeatherActive={Boolean(propShowClouds || isNoaaActive)}
                  isRadarActive={isRadarActive}
                />
              </div>
            </div>

            {/* Telemetry Footer */}
            <div className="pt-2 border-t border-[var(--theme-card-border)] text-nano space-y-2 shrink-0">
              {/* Compact Resolution Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-nano font-mono">
                  <span className="uppercase font-bold tracking-wider opacity-60">Resolution</span>
                  <span className="text-[var(--theme-text-accent)] font-medium">{resolutionVramLabel}</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {(['100k', '1M', '3M', '4M', '8M', '16M'] as ResolutionTier[]).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => onResolutionChange(tier)}
                      aria-pressed={resolution === tier}
                      aria-label={`Resolution tier ${tier.toUpperCase()}`}
                      className={`py-1 px-0.5 rounded-[2px] text-center flex flex-col items-center justify-center border transition-all cursor-pointer font-mono ${
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

              {/* Coordinates & Scale */}
              <div className="grid grid-cols-2 gap-2 tabular-nums text-[var(--theme-text-secondary)]">
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
              </div>

              {/* GPU Profiler with Embedded FPS Badge */}
              <div className="pt-1.5 mt-0.5 border-t border-[var(--theme-card-border)] flex flex-col gap-1 text-nano text-[var(--theme-text-secondary)]">
                <div className="flex items-center justify-between font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--theme-status-slate)] flex items-center gap-1">
                      GPU Profiler
                    </span>
                    {/* FPS Badge (Moved from Header) */}
                    <div
                      title={`Rendering Frame Rate: ${fps} FPS`}
                      aria-label={`Rendering Frame Rate: ${fps} FPS`}
                      className="flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] font-bold text-nano tabular-nums transition-colors"
                    >
                      <span
                        className={`w-5 text-right tabular-nums font-semibold ${
                          fps >= 100
                            ? 'text-[var(--theme-text-accent)]'
                            : fps >= 55
                            ? 'text-[var(--theme-status-sage)]'
                            : 'text-[var(--theme-status-amber)]'
                        }`}
                      >
                        {fps}
                      </span>
                      <span className="text-nano font-normal opacity-60">FPS</span>
                    </div>
                  </div>
                  {backend === 'webgpu' && gpuReport && (
                    <span className="text-[var(--theme-status-sage)] font-mono">Total: {(gpuReport.totalGpuMs ?? 0).toFixed(2)}ms</span>
                  )}
                </div>
                {backend === 'webgpu' && gpuReport && (
                  <div className="grid grid-cols-4 gap-1 font-mono opacity-80 text-nano">
                    <span>Sim: {(gpuReport.computeMs ?? 0).toFixed(2)}ms</span>
                    <span>Relief: {(gpuReport.reliefMs ?? 0).toFixed(2)}ms</span>
                    <span>Lines: {(gpuReport.linesMs ?? 0).toFixed(2)}ms</span>
                    <span>Contours: {(gpuReport.contoursMs ?? 0).toFixed(2)}ms</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-Out Catalog Sheet */}
      {isCatalogOpen && (
        <div
          ref={catalogSheetRef}
          className="fixed top-5 right-5 2xl:right-[26.5rem] z-40 pointer-events-auto w-96 max-w-[calc(100vw-2.5rem)] 2xl:max-w-[calc(100vw-28rem)] max-h-[calc(100vh-2.5rem)] 2xl:max-h-[calc(100vh-8.5rem)] flex flex-col font-mono select-none rounded-[3px] border backdrop-blur-2xl shadow-2xl p-4 text-micro transition-all duration-300 ease-out animate-in fade-in slide-in-from-right-4 border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg)] text-[var(--theme-text-primary)]"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-panel-border)]">
            <div>
              <h3 className="text-micro font-semibold uppercase tracking-wider text-[var(--theme-text-primary)]">Catalog</h3>
              <span className="text-nano opacity-60 text-[var(--theme-text-muted)]">
                {DATA_LAYER_CATALOG.length} datasets
              </span>
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

          <div className="overflow-y-auto space-y-2.5 pr-1 mt-3 flex-1 max-h-[calc(100vh-8rem)] pb-8 scroll-fade-mask pt-1">
            {DATA_LAYER_CATALOG.filter((preset) => {
              if (catalogFilter === 'all') return true;
              if (catalogFilter === 'topo') {
                return preset.category === 'topo' || preset.category === 'ocean' || preset.category === 'point';
              }
              if (catalogFilter === 'vectors') {
                return preset.category === 'vectors' || preset.category === 'field' || preset.category === 'trajectory' || preset.category === 'point';
              }
              if (catalogFilter === 'satellite') {
                return preset.category === 'satellite' || preset.category === 'night' || preset.category === 'trajectory' || preset.id === 'starlink-iss-orbits';
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-nano flex items-center gap-1.5">
                        <span>{preset.name}</span>
                      </span>
                      {preset.unsupported && (
                        <span className="flex items-center gap-1 text-nano uppercase font-bold px-1.5 py-0.5 rounded border bg-amber-500/20 text-amber-300 border-amber-500/40">
                          [UNSUPPORTED: Requires XYZ Tile Pipeline]
                        </span>
                      )}
                    </div>
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

                  <div className="flex items-center justify-between pt-1 border-t border-white/10 text-micro gap-2">
                    <span className="opacity-60 text-nano leading-tight break-words flex-1" title={preset.attribution}>
                      {preset.attribution}
                    </span>

                    <button
                      disabled={isAlreadyAdded || preset.unsupported}
                      title={preset.unsupported ? 'Requires XYZ Tile Pipeline (Unsupported)' : isAlreadyAdded ? 'Layer already added to stack' : 'Add layer to stack'}
                      onClick={() => {
                        if (preset.unsupported) return;
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
                        if (preset.id === 'noaa-gfs-clouds') {
                          onShowCloudsChange?.(true);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-[2px] text-nano font-bold border transition-all flex items-center gap-1.5 ${
                        preset.unsupported
                          ? 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-400 border-zinc-700'
                          : isAlreadyAdded
                          ? theme === 1
                            ? 'bg-[#2e6b47]/15 text-[#1b432b] border-[#2e6b47]/30 cursor-default font-semibold'
                            : theme === 2
                            ? 'bg-[#2a5540]/30 text-[#8ee0b1] border-[#387256]/40 cursor-default font-semibold'
                            : 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40 cursor-default ring-1 ring-[var(--theme-status-sage)]/30 font-semibold'
                          : 'cursor-pointer bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] hover:border-[var(--theme-card-border-hover)] shadow-sm font-semibold'
                      }`}
                    >
                      {preset.unsupported ? (
                        <span>Unsupported</span>
                      ) : isAlreadyAdded ? (
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
