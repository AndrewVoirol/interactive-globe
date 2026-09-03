// ============================================================================
// File: src/core/layers/IGlobeLayer.ts
// Architecture: Composable Plugin Layer Architecture Interface
// Description: Multi-pass compositing layer contract and rendering contexts
// ============================================================================

import * as THREE from 'three';
import { SubstrateUniformFrameData } from '../paradigms/IRenderParadigm';

export interface LayerRenderContext {
  device?: GPUDevice;
  commandEncoder?: GPUCommandEncoder;
  gl?: WebGL2RenderingContext;
  renderPassDescriptor?: GPURenderPassDescriptor;
  viewportWidth: number;
  viewportHeight: number;
  camera: THREE.Camera;
  frameData: SubstrateUniformFrameData;
}

export type LayerBlendMode = 'opaque' | 'alpha' | 'additive' | 'screen' | 'multiply';

export interface IGlobeLayer {
  readonly id: string;
  readonly name: string;
  order: number;                    // Rendering z-index sorting order (0 = background)
  opacity: number;                  // Global layer opacity [0.0..1.0]
  visible: boolean;                 // Layer visibility flag
  blendMode: LayerBlendMode;

  /**
   * Triggered when layer is attached to the engine
   */
  onAdd(engineContext: { device?: GPUDevice; gl?: WebGL2RenderingContext }): Promise<void>;

  /**
   * Triggered when layer is detached
   */
  onRemove(): Promise<void>;

  /**
   * Per-frame CPU-side state update logic
   */
  update(frameData: SubstrateUniformFrameData): void;

  /**
   * Record GPU draw commands into active render pass
   */
  render(ctx: LayerRenderContext): void;

  /**
   * Free GPU resources allocated by this layer
   */
  dispose(): void;
}
