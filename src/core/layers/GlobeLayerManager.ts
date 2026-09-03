// ============================================================================
// File: src/core/layers/GlobeLayerManager.ts
// Architecture: Plugin Layer Lifecycle & Propagation Manager
// Description: Central manager for z-ordering, uniforms, and layer lifecycle
// ============================================================================

import { IGlobeLayer, LayerRenderContext } from './IGlobeLayer';
import { LayerCompositePass } from './LayerCompositePass';
import { SubstrateUniformFrameData } from '../paradigms/IRenderParadigm';

export class GlobeLayerManager {
  private layers: Map<string, IGlobeLayer> = new Map();
  private sortedLayers: IGlobeLayer[] = [];
  private compositor = new LayerCompositePass();
  private engineContext: { device?: GPUDevice; gl?: WebGL2RenderingContext } = {};

  public setEngineContext(context: { device?: GPUDevice; gl?: WebGL2RenderingContext }): void {
    this.engineContext = context;
  }

  public async addLayer(layer: IGlobeLayer): Promise<void> {
    if (this.layers.has(layer.id)) {
      await this.removeLayer(layer.id);
    }
    this.layers.set(layer.id, layer);
    await layer.onAdd(this.engineContext);
    this.reorder();
  }

  public async removeLayer(layerId: string): Promise<boolean> {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    await layer.onRemove();
    layer.dispose();
    this.layers.delete(layerId);
    this.reorder();
    return true;
  }

  public getLayer<T extends IGlobeLayer = IGlobeLayer>(layerId: string): T | undefined {
    return this.layers.get(layerId) as T | undefined;
  }

  public hasLayer(layerId: string): boolean {
    return this.layers.has(layerId);
  }

  public toggleLayerVisibility(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    layer.visible = !layer.visible;
    return true;
  }

  public setLayerOpacity(layerId: string, opacity: number): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    layer.opacity = Math.max(0, Math.min(1, opacity));
    return true;
  }

  public setLayerBlendMode(layerId: string, blendMode: IGlobeLayer['blendMode']): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    layer.blendMode = blendMode;
    return true;
  }

  public setLayerOrder(layerId: string, order: number): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    layer.order = order;
    this.reorder();
    return true;
  }

  public getAllLayers(): IGlobeLayer[] {
    return [...this.sortedLayers];
  }

  public reorder(): void {
    this.sortedLayers = Array.from(this.layers.values()).sort((a, b) => a.order - b.order);
  }

  public updateAll(frameData: SubstrateUniformFrameData): void {
    for (const layer of this.sortedLayers) {
      if (layer.visible && layer.opacity >= 0.001) {
        layer.update(frameData);
      }
    }
  }

  public renderComposite(ctx: LayerRenderContext): void {
    this.compositor.executeMultiPass(this.sortedLayers, ctx);
  }

  public async clear(): Promise<void> {
    for (const layer of this.layers.values()) {
      await layer.onRemove();
      layer.dispose();
    }
    this.layers.clear();
    this.sortedLayers = [];
  }
}
