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
}

export const DataLayerOverlay: React.FC<DataLayerOverlayProps> = (props) => {
  if (!props.visible) return null;

  // Primary Cartographic Raster Overlay Pass
  return <RasterLayerRenderer {...props} />;
};
