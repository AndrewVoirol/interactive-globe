// ============================================================================
// File: src/core/GeodesicOverlayLayer.tsx
// Component: GeodesicOverlayLayer
// Description: Pure React decoupled geodesic overlay layer
// ============================================================================

import React from 'react';

export interface GeodesicOverlayLayerProps {
  unfurlProgress: number;
  mode: number;
  activeOverlay: 'off' | 'antipodes' | 'conveyor' | 'migration';
  showLandmarks: boolean;
  showTissot: boolean;
  theme: number; // 0 = Dark, 1 = Light
  startTime?: number;
}

export const GeodesicOverlayLayer: React.FC<GeodesicOverlayLayerProps> = ({
  activeOverlay,
  showLandmarks,
  showTissot,
}) => {
  if (activeOverlay === 'off' && !showLandmarks && !showTissot) return null;

  return (
    <div
      data-testid="geodesic-overlay-layer"
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  );
};

export default GeodesicOverlayLayer;
