export type SimulationMode = 0 | 1 | 2 | 3 | 4; // 0 = Linear, 1 = Scroll, 2 = Griffith, 3 = Fluid, 4 = Dymaxion
export type LayerMode = 0 | 1 | 2; // 0 = Both, 1 = Points Only, 2 = Wireframe Only
export type GeodesicOverlayMode = 'off' | 'antipodes' | 'conveyor' | 'migration';
export type ResolutionTier = '100k' | '1M';
export type ExtendedResolutionTier = '100k' | '1M' | '4M' | '8M' | '16M';

export interface LoadedDataInfo {
  pointCount: number;
  lineCount: number;
  format: string;
  loadTimeMs: number;
  vramMb: number;
}

export interface DymaxionProjectionResult {
  faceIndex: number;
  maxDot: number;
  gnomonicPos: [number, number, number];
  dymaxion2D: [number, number];
}
