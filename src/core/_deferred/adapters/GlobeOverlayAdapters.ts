// ============================================================================
// File: src/core/_deferred/adapters/GlobeOverlayAdapters.ts
// Architecture: Overlay Adapters implementing IGlobeLayer (DEFERRED)
// Description: Inert skeleton adapters for GlobeOverlay, VectorOverlay, and GeodesicOverlay.
// Status: Deferred — Live rendering utilizes dedicated React Three Fiber components directly.
// ============================================================================

import * as THREE from 'three';
import { IGlobeLayer, LayerRenderContext, LayerBlendMode } from '../../layers/IGlobeLayer';
import { SubstrateUniformFrameData } from '../paradigms/IRenderParadigm';

export class BaseGlobeOverlayLayer implements IGlobeLayer {
  public readonly id = 'base-globe-overlay';
  public readonly name = 'Base Cartographic Globe Overlay';
  public order = 10;
  public opacity = 1.0;
  public visible = true;
  public blendMode: LayerBlendMode = 'opaque';

  public async onAdd(context: { device?: GPUDevice; gl?: WebGL2RenderingContext }): Promise<void> {}
  public async onRemove(): Promise<void> {}
  public update(frameData: SubstrateUniformFrameData): void {}
  public render(ctx: LayerRenderContext): void {}
  public dispose(): void {}
}

export class VectorOverlayPluginLayer implements IGlobeLayer {
  public readonly id = 'vector-overlay-layer';
  public readonly name = 'Vector Map Boundaries Overlay';
  public order = 50;
  public opacity = 1.0;
  public visible = true;
  public blendMode: LayerBlendMode = 'alpha';

  public async onAdd(context: { device?: GPUDevice; gl?: WebGL2RenderingContext }): Promise<void> {}
  public async onRemove(): Promise<void> {}
  public update(frameData: SubstrateUniformFrameData): void {}
  public render(ctx: LayerRenderContext): void {}
  public dispose(): void {}
}

export class GeodesicOverlayPluginLayer implements IGlobeLayer {
  public readonly id = 'geodesic-overlay-layer';
  public readonly name = 'Geodesic Arcs & Tissot Indicatrix Overlay';
  public order = 60;
  public opacity = 1.0;
  public visible = true;
  public blendMode: LayerBlendMode = 'additive';

  public async onAdd(context: { device?: GPUDevice; gl?: WebGL2RenderingContext }): Promise<void> {}
  public async onRemove(): Promise<void> {}
  public update(frameData: SubstrateUniformFrameData): void {}
  public render(ctx: LayerRenderContext): void {}
  public dispose(): void {}
}
