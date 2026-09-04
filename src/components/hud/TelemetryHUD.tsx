// ============================================================================
// File: src/components/hud/TelemetryHUD.tsx
// Master Composite HUD Orchestrator: UnifiedRightSidebar + DataLayerToastNotification
// Sub-components include Vectors (V), Landmarks, Tissot, Data Layers & Toasts
// Unifies system status, morph topology, and data layers with slide-out catalog
// ============================================================================

import React from 'react';
import { SimulationMode, GeodesicOverlayMode, LoadedDataInfo } from '../../types';
import { UnifiedRightSidebar } from './UnifiedRightSidebar';
import { DataLayerToastNotification, ToastMessage } from './DataLayerToastNotification';
import { DataLayerItem } from './DataLayersDrawer';
import { BlendModeType, DataLayerRenderStyle } from '../../core/data/DataLayerCatalog';

export type { DataLayerItem, ToastMessage, LoadedDataInfo };

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
  onHillshadeChangeDataLayer?: (id: string, azimuth: number, intensity: number) => void;
  onSeaLevelOffsetChangeDataLayer?: (id: string, offset: number) => void;
  onWaterClarityChangeDataLayer?: (id: string, clarity: number) => void;
  onPeakExponentChangeDataLayer?: (id: string, exponent: number) => void;
  onAmbientOcclusionChangeDataLayer?: (id: string, ao: number) => void;
  onReorderDataLayer?: (id: string, direction: 'up' | 'down') => void;
  onSelectRenderStyle?: (style: DataLayerRenderStyle) => void;
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
