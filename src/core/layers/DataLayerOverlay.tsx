// ============================================================================
// File: src/core/layers/DataLayerOverlay.tsx
// Architecture: Heterogeneous Data Layer Dispatcher & Ingestion Pass Orchestrator
// Description: Pure React data layer routing interface
// ============================================================================

import React from 'react';
import { BlendModeType } from '../data/DataLayerCatalog';

export interface DataLayerOverlayProps {
  visible: boolean;
  unfurlProgress: number;
  mode: number;
  theme: number;
  category?: string;
  type?: string;
  sourceUrl?: string;
  opacity?: number;
  blendMode?: BlendModeType;
  displacementScale?: number;
  elevationEncoding?: 'luminance' | 'mapbox' | 'terrarium';
  sunAzimuth?: number;
  sunAltitude?: number;
  hillshadeIntensity?: number;
  renderStyle?: 'architectural' | 'hybrid' | 'photoreal';
  resolution?: '100k' | '1M';
  seaLevelOffset?: number;
  waterClarity?: number;
  peakExponent?: number;
  ambientOcclusion?: number;
}

export const VectorBoundaryRenderer: React.FC<DataLayerOverlayProps> = (props) => (
  <div data-testid="vector-boundary-renderer" {...props} />
);
export const VectorContourRenderer: React.FC<DataLayerOverlayProps> = (props) => (
  <div data-testid="vector-contour-renderer" {...props} />
);
export const VectorFieldRenderer: React.FC<DataLayerOverlayProps> = (props) => (
  <div data-testid="vector-field-renderer" {...props} />
);
export const SatelliteTrajectoryRenderer: React.FC<DataLayerOverlayProps> = (props) => (
  <div data-testid="satellite-trajectory-renderer" {...props} />
);
export const RasterLayerRenderer: React.FC<DataLayerOverlayProps> = (props) => (
  <div data-testid="raster-layer-renderer" {...props} />
);

export const DataLayerOverlay: React.FC<DataLayerOverlayProps> = (props) => {
  if (!props.visible) return null;

  // Dynamic dispatch based on data layer category
  switch (props.category) {
    case 'vectors':
      return <VectorBoundaryRenderer {...props} />;
    case 'point':
      return <VectorContourRenderer {...props} />;
    case 'field':
      return <VectorFieldRenderer {...props} />;
    case 'trajectory':
      return <SatelliteTrajectoryRenderer {...props} />;
    case 'topo':
    case 'ocean':
    case 'thermal':
    case 'night':
    case 'satellite':
    default:
      return <RasterLayerRenderer {...props} />;
  }
};

export default DataLayerOverlay;
