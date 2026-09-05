// ============================================================================
// File: src/core/layers/DataLayerOverlay.tsx
// Architecture: Heterogeneous Data Layer Dispatcher & Ingestion Pass Orchestrator
// Description: Routes active data layers to specialized sub-renderers
// ============================================================================

import React from 'react';
import { BlendModeType } from '../data/DataLayerCatalog';
import { RasterLayerRenderer } from './renderers/RasterLayerRenderer';
import { VectorBoundaryRenderer } from './renderers/VectorBoundaryRenderer';
import { SatelliteTrajectoryRenderer } from './renderers/SatelliteTrajectoryRenderer';
import { VectorFieldRenderer } from './renderers/VectorFieldRenderer';

import { VectorContourRenderer } from './renderers/VectorContourRenderer';

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
    case 'topo':
    case 'ocean':
    case 'thermal':
    case 'night':
    case 'satellite':
    default:
      return <RasterLayerRenderer {...props} />;
  }
};
