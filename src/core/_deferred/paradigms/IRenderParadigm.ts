// ============================================================================
// File: src/core/paradigms/IRenderParadigm.ts
// Description: Universal Rendering Substrate Interface Contract & Core Types
// ============================================================================

import * as THREE from 'three';

export type BackendType = 'webgpu' | 'webgl2';

export interface GpuResourceHandles {
  device?: GPUDevice;
  context?: GPUCanvasContext;
  gl?: WebGL2RenderingContext;
  preferredFormat?: GPUTextureFormat;
}

export interface SubstrateUniformFrameData {
  unfurl: number;                    // Morph progress [0.0..1.0]
  mode: number;                      // Simulation mode index (0..4)
  theme: number;                     // 0 = Dark Cyber, 1 = Light Monochrome
  time: number;                      // Total elapsed time in seconds
  dt: number;                        // Frame delta time in seconds
  cameraPosition: THREE.Vector3;     // Absolute world camera position
  cameraCenter: THREE.Vector3;       // Camera-Relative RTC origin
  viewMatrix: THREE.Matrix4;         // 4x4 View matrix
  projectionMatrix: THREE.Matrix4;   // 4x4 Projection matrix
  cursorHitPos?: THREE.Vector3;      // Intersected surface hit position
  cursorVel?: THREE.Vector4 | THREE.Vector3; // Cursor velocity (xyz) + speed (w)
  cursorActive?: boolean;            // Interaction state flag
}

export interface SubstratePipelineConfig {
  enableDepthWrite: boolean;
  enableDepthTest: boolean;
  blendMode: 'opaque' | 'alpha' | 'additive' | 'multiply';
  cullMode: 'none' | 'front' | 'back';
  wireframeOverlay: boolean;
  resolutionScale: number;           // DPR scaling factor [0.5..2.0]
  customDefines?: Record<string, string | number>;
}

export interface IRenderParadigm {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly backend: BackendType;

  /**
   * One-time allocation of GPU buffers, textures, and pipelines
   */
  initialize(gpu: GpuResourceHandles, config: SubstratePipelineConfig): Promise<void>;

  /**
   * Dynamically inject WGSL/GLSL code modules and recompile pipelines
   */
  compileShaders(customShaderChunks?: Record<string, string>): Promise<void>;

  /**
   * Bind GPU vertex, storage, and index buffers into active pipeline execution
   */
  bindBuffers(particleBuffer: GPUBuffer | WebGLBuffer, indexBuffer?: GPUBuffer | WebGLBuffer): void;

  /**
   * Upload per-frame uniforms to GPU uniform buffers
   */
  updateUniforms(frameData: SubstrateUniformFrameData): void;

  /**
   * Record pass commands into WebGPU CommandEncoder or execute WebGL2 draw calls
   */
  renderPass(
    commandEncoderOrGl: GPUCommandEncoder | WebGL2RenderingContext,
    targetView?: GPUTextureView
  ): void;

  /**
   * Viewport resize event handling
   */
  resize(width: number, height: number): void;

  /**
   * Free all allocated GPU textures, pipelines, and buffers cleanly
   */
  dispose(): void;
}
