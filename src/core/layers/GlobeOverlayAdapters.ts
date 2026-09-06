// ============================================================================
// File: src/core/layers/GlobeOverlayAdapters.ts
// Architecture: Overlay Adapters implementing IGlobeLayer
// Description: Inert skeleton adapters for GlobeOverlay, VectorOverlay, and GeodesicOverlay.
// ============================================================================

import { IGlobeLayer, LayerRenderContext, LayerBlendMode } from './IGlobeLayer';
import { SubstrateUniformFrameData } from '../paradigms';

export class BaseGlobeOverlayLayer implements IGlobeLayer {
  public readonly id = 'base-globe-overlay';
  public readonly name = 'Base Cartographic Globe Overlay';
  public order = 10;
  public opacity = 1.0;
  public visible = true;
  public blendMode: LayerBlendMode = 'opaque';

  public async onAdd(_context: { device?: GPUDevice; gl?: WebGL2RenderingContext }): Promise<void> {}
  public async onRemove(): Promise<void> {}
  public update(_frameData: SubstrateUniformFrameData): void {}
  public render(_ctx: LayerRenderContext): void {}
  public dispose(): void {}
}

export class VectorOverlayPluginLayer implements IGlobeLayer {
  public readonly id = 'vector-overlay-layer';
  public readonly name = 'Vector Map Boundaries Overlay';
  public order = 50;
  public opacity = 1.0;
  public visible = true;
  public blendMode: LayerBlendMode = 'alpha';

  public async onAdd(_context: { device?: GPUDevice; gl?: WebGL2RenderingContext }): Promise<void> {}
  public async onRemove(): Promise<void> {}
  public update(_frameData: SubstrateUniformFrameData): void {}
  public render(_ctx: LayerRenderContext): void {}
  public dispose(): void {}
}

export class GeodesicOverlayPluginLayer implements IGlobeLayer {
  public readonly id = 'geodesic-overlay-layer';
  public readonly name = 'Geodesic Arcs & Tissot Indicatrix Overlay';
  public order = 60;
  public opacity = 1.0;
  public visible = true;
  public blendMode: LayerBlendMode = 'additive';

  public async onAdd(_context: { device?: GPUDevice; gl?: WebGL2RenderingContext }): Promise<void> {}
  public async onRemove(): Promise<void> {}
  public update(_frameData: SubstrateUniformFrameData): void {}
  public render(_ctx: LayerRenderContext): void {}
  public dispose(): void {}
}
