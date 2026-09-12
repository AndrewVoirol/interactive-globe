// ============================================================================
// File: src/components/hud/TelemetryHUD.tsx
// Master Composite HUD Orchestrator: UnifiedRightSidebar + DataLayerToastNotification
// Sub-components include Vectors (V), Landmarks, Tissot, Data Layers & Toasts
// Unifies system status, morph topology, and data layers with slide-out catalog
// ============================================================================

import React from 'react';
import { SimulationMode, GeodesicOverlayMode, LoadedDataInfo, ResolutionTier } from '../../types';
import { UnifiedRightSidebar } from './UnifiedRightSidebar';
import { DataLayerToastNotification, ToastMessage } from './DataLayerToastNotification';
import { DataLayerItem } from './DataLayersDrawer';
import { BlendModeType, DataLayerRenderStyle } from '../../core/data/DataLayerCatalog';
import { TimelineScrubberState } from './TimelineScrubber';

export type { DataLayerItem, ToastMessage, LoadedDataInfo, ResolutionTier };

export interface TelemetryHUDProps {
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
  dataInfo: LoadedDataInfo;
  onSnapCamera: (v: 'equator' | 'pole' | 'seam' | 'isometric' | 'horizon') => void;
  isAudioMuted?: boolean;
  onAudioMuteToggle?: () => void;
  dataLayers?: DataLayerItem[];
  toasts?: ToastMessage[];
  onDismissToast?: (id: string) => void;
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
  showClouds?: boolean;
  onShowCloudsChange?: (v: boolean) => void;
  showCloudLow?: boolean;
  onShowCloudLowChange?: (v: boolean) => void;
  showCloudMid?: boolean;
  onShowCloudMidChange?: (v: boolean) => void;
  showCloudHigh?: boolean;
  onShowCloudHighChange?: (v: boolean) => void;
  cloudDriftSpeed?: number;
  onCloudDriftSpeedChange?: (v: number) => void;
  cloudOpacity?: number;
  onCloudOpacityChange?: (v: number) => void;
  atmosphericScale?: number;
  onAtmosphericScaleChange?: (v: number) => void;
  shadowIntensity?: number;
  onShadowIntensityChange?: (v: number) => void;
  verticalScaleMode?: number;
  onVerticalScaleModeChange?: (v: number) => void;
  rainShadowFeedback?: number;
  onRainShadowFeedbackChange?: (v: number) => void;
  pluvialGamma?: number;
  onPluvialGammaChange?: (v: number) => void;
  weatherOpticalMode?: number;
  onWeatherOpticalModeChange?: (v: number) => void;
  thermodynamicGating?: boolean;
  onThermodynamicGatingChange?: (v: boolean) => void;
  timelineMinutes?: number;
  onTimelineChange?: (state: TimelineScrubberState) => void;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = (props) => {
  if (props.isZenMode) return null;

  return (
    <>
      {/* Unified Right Sidebar: Engine Status + Topology Controls + Data Layers + Catalog Sheet */}
      <UnifiedRightSidebar
        isZenMode={props.isZenMode}
        onZenToggle={props.onZenToggle}
        theme={props.theme}
        onThemeToggle={props.onThemeToggle}
        onSelectThemeMode={props.onSelectThemeMode}
        showSoundings={props.showSoundings}
        onSoundingsToggle={props.onSoundingsToggle}
        showTriangulation={props.showTriangulation}
        onTriangulationToggle={props.onTriangulationToggle}
        showCartouche={props.showCartouche}
        onCartoucheToggle={props.onCartoucheToggle}
        backend={props.backend}
        onBackendChange={props.onBackendChange}
        hasWebGPU={props.hasWebGPU}
        resolution={props.resolution}
        onResolutionChange={props.onResolutionChange}
        layerMode={props.layerMode}
        onLayerModeChange={props.onLayerModeChange}
        mode={props.mode}
        onModeChange={props.onModeChange}
        cursorPhysicsEnabled={props.cursorPhysicsEnabled}
        onCursorPhysicsToggle={props.onCursorPhysicsToggle}
        activeOverlay={props.activeOverlay}
        onOverlayChange={props.onOverlayChange}
        showLandmarks={props.showLandmarks}
        onLandmarksToggle={props.onLandmarksToggle}
        showTissot={props.showTissot}
        onTissotToggle={props.onTissotToggle}
        showVectors={props.showVectors}
        onVectorsToggle={props.onVectorsToggle}
        alpha={props.alpha}
        fps={props.fps}
        latStr={props.latStr}
        lonStr={props.lonStr}
        mapScaleStr={props.mapScaleStr}
        dataInfo={props.dataInfo}
        onSnapCamera={props.onSnapCamera}
        isAudioMuted={props.isAudioMuted}
        onAudioMuteToggle={props.onAudioMuteToggle}
        dataLayers={props.dataLayers}
        onAddDataLayer={props.onAddDataLayer}
        onToggleDataLayer={props.onToggleDataLayer}
        onRemoveDataLayer={props.onRemoveDataLayer}
        onOpacityChangeDataLayer={props.onOpacityChangeDataLayer}
        onBlendModeChangeDataLayer={props.onBlendModeChangeDataLayer}
        onDisplacementScaleChangeDataLayer={props.onDisplacementScaleChangeDataLayer}
        onHillshadeChangeDataLayer={props.onHillshadeChangeDataLayer}
        onSeaLevelOffsetChangeDataLayer={props.onSeaLevelOffsetChangeDataLayer}
        onWaterClarityChangeDataLayer={props.onWaterClarityChangeDataLayer}
        onPeakExponentChangeDataLayer={props.onPeakExponentChangeDataLayer}
        onAmbientOcclusionChangeDataLayer={props.onAmbientOcclusionChangeDataLayer}
        onReorderDataLayer={props.onReorderDataLayer}
        onSelectRenderStyle={props.onSelectRenderStyle}
        fractureIntensity={props.fractureIntensity}
        onFractureIntensityChange={props.onFractureIntensityChange}
        fluidVortexStrength={props.fluidVortexStrength}
        onFluidVortexStrengthChange={props.onFluidVortexStrengthChange}
        gpuReport={props.gpuReport}
        isCatalogOpen={props.isCatalogOpen}
        onCatalogOpenChange={props.onCatalogOpenChange}
        isSidebarOpen={props.isSidebarOpen}
        onSidebarOpenChange={props.onSidebarOpenChange}
        isDemoMode={props.isDemoMode}
        demoSequence={props.demoSequence}
        onToggleDemoMode={props.onToggleDemoMode}
        onSelectDemoSequence={props.onSelectDemoSequence}
        showClouds={props.showClouds}
        onShowCloudsChange={props.onShowCloudsChange}
        showCloudLow={props.showCloudLow}
        onShowCloudLowChange={props.onShowCloudLowChange}
        showCloudMid={props.showCloudMid}
        onShowCloudMidChange={props.onShowCloudMidChange}
        showCloudHigh={props.showCloudHigh}
        onShowCloudHighChange={props.onShowCloudHighChange}
        cloudDriftSpeed={props.cloudDriftSpeed}
        onCloudDriftSpeedChange={props.onCloudDriftSpeedChange}
        cloudOpacity={props.cloudOpacity}
        onCloudOpacityChange={props.onCloudOpacityChange}
        atmosphericScale={props.atmosphericScale}
        onAtmosphericScaleChange={props.onAtmosphericScaleChange}
        shadowIntensity={props.shadowIntensity}
        onShadowIntensityChange={props.onShadowIntensityChange}
        verticalScaleMode={props.verticalScaleMode}
        onVerticalScaleModeChange={props.onVerticalScaleModeChange}
        rainShadowFeedback={props.rainShadowFeedback}
        onRainShadowFeedbackChange={props.onRainShadowFeedbackChange}
        pluvialGamma={props.pluvialGamma}
        onPluvialGammaChange={props.onPluvialGammaChange}
        weatherOpticalMode={props.weatherOpticalMode}
        onWeatherOpticalModeChange={props.onWeatherOpticalModeChange}
        thermodynamicGating={props.thermodynamicGating}
        onThermodynamicGatingChange={props.onThermodynamicGatingChange}
        timelineMinutes={props.timelineMinutes}
        onTimelineChange={props.onTimelineChange}
      />

      {/* Bottom-Left Non-Intrusive Glassmorphic Toast Notification Stack */}
      <DataLayerToastNotification
        toasts={props.toasts || []}
        theme={props.theme}
        onDismissToast={props.onDismissToast}
      />
    </>
  );
};
