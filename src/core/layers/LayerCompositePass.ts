// ============================================================================
// File: src/core/layers/LayerCompositePass.ts
// Architecture: Multi-Pass Pipeline Compositor
// Description: Executes depth pre-pass, base geometry, vector overlays, atmosphere & tone mapping
// ============================================================================

import { IGlobeLayer, LayerRenderContext } from './IGlobeLayer';

export type CompositePassStage = 
  | 'depth-prepass' 
  | 'base-geometry' 
  | 'vector-overlays' 
  | 'volumetric-atmosphere' 
  | 'tone-mapping';

export interface PassStageConfig {
  stage: CompositePassStage;
  minOrder: number;
  maxOrder: number;
}

export class LayerCompositePass {
  private stages: PassStageConfig[] = [
    { stage: 'depth-prepass', minOrder: -100, maxOrder: -1 },
    { stage: 'base-geometry', minOrder: 0, maxOrder: 49 },
    { stage: 'vector-overlays', minOrder: 50, maxOrder: 79 },
    { stage: 'volumetric-atmosphere', minOrder: 80, maxOrder: 99 },
    { stage: 'tone-mapping', minOrder: 100, maxOrder: 999 },
  ];

  public executeMultiPass(layers: IGlobeLayer[], ctx: LayerRenderContext): void {
    // 1. Sort active layers by z-index order
    const activeLayers = layers
      .filter((layer) => layer.visible && layer.opacity >= 0.001)
      .sort((a, b) => a.order - b.order);

    // 2. Iterate composite pass stages
    for (const stageConfig of this.stages) {
      const stageLayers = activeLayers.filter(
        (layer) => layer.order >= stageConfig.minOrder && layer.order <= stageConfig.maxOrder
      );

      for (const layer of stageLayers) {
        layer.update(ctx.frameData);
        layer.render(ctx);
      }
    }
  }
}
