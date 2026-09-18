export * from './src/types';
export type SimulationMode = 0 | 1 | 2 | 3; // 0 = Linear, 1 = Scroll, 2 = Griffith, 3 = Fluid
export type LayerMode = 0 | 1 | 2; // 0 = Both, 1 = Points Only, 2 = Wireframe Only
export type GeodesicOverlayMode = 'off' | 'antipodes' | 'conveyor' | 'migration';

export interface LoadedDataInfo {
  pointCount: number;
  lineCount: number;
  format: string;
  loadTimeMs: number;
  vramMb: number;
}
