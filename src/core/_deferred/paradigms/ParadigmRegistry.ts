// ============================================================================
// File: src/core/paradigms/ParadigmRegistry.ts
// Architecture: Universal Substrate Registration Engine
// Description: Pre-caches pipelines and handles <16ms zero-copy hot switching
// ============================================================================

import {
  IRenderParadigm,
  GpuResourceHandles,
  SubstratePipelineConfig,
  SubstrateUniformFrameData
} from './IRenderParadigm';

export class ParadigmRegistry {
  private paradigms: Map<string, IRenderParadigm> = new Map();
  private activeParadigm: IRenderParadigm | null = null;
  private gpuHandles: GpuResourceHandles | null = null;
  private currentConfig: SubstratePipelineConfig | null = null;
  private currentParticleBuffer: GPUBuffer | WebGLBuffer | null = null;
  private currentIndexBuffer: GPUBuffer | WebGLBuffer | null = null;
  private switchTimestamp: number = 0;

  public registerParadigm(paradigm: IRenderParadigm): void {
    this.paradigms.set(paradigm.id, paradigm);
  }

  public getParadigm(id: string): IRenderParadigm | undefined {
    return this.paradigms.get(id);
  }

  public getActiveParadigm(): IRenderParadigm | null {
    return this.activeParadigm;
  }

  public getRegisteredIds(): string[] {
    return Array.from(this.paradigms.keys());
  }

  public async initialize(gpu: GpuResourceHandles, defaultConfig: SubstratePipelineConfig): Promise<void> {
    this.gpuHandles = gpu;
    this.currentConfig = defaultConfig;

    for (const paradigm of this.paradigms.values()) {
      await paradigm.initialize(gpu, defaultConfig);
      await paradigm.compileShaders();
    }

    // Default active paradigm to scientific if present, or first registered
    const firstId = this.paradigms.has('scientific') ? 'scientific' : Array.from(this.paradigms.keys())[0];
    if (firstId) {
      this.activeParadigm = this.paradigms.get(firstId) || null;
    }
  }

  /**
   * Hot-switch substrate in <16ms with zero VRAM reallocations
   */
  public async switchParadigm(
    paradigmId: string,
    particleBuffer?: GPUBuffer | WebGLBuffer,
    indexBuffer?: GPUBuffer | WebGLBuffer
  ): Promise<number> {
    const startTime = performance.now();
    const nextParadigm = this.paradigms.get(paradigmId);

    if (!nextParadigm) {
      throw new Error(`ParadigmRegistry: Paradigm '${paradigmId}' is not registered.`);
    }

    if (particleBuffer) {
      this.currentParticleBuffer = particleBuffer;
    }
    if (indexBuffer !== undefined) {
      this.currentIndexBuffer = indexBuffer;
    }

    if (this.activeParadigm?.id === nextParadigm.id && this.currentParticleBuffer) {
      this.activeParadigm.bindBuffers(this.currentParticleBuffer, this.currentIndexBuffer || undefined);
      return performance.now() - startTime;
    }

    if (this.currentParticleBuffer) {
      nextParadigm.bindBuffers(this.currentParticleBuffer, this.currentIndexBuffer || undefined);
    }

    this.activeParadigm = nextParadigm;
    this.switchTimestamp = performance.now();
    const switchDuration = this.switchTimestamp - startTime;
    return switchDuration;
  }

  public render(
    frameData: SubstrateUniformFrameData,
    encoderOrGl: GPUCommandEncoder | WebGL2RenderingContext,
    targetView?: GPUTextureView
  ): void {
    if (!this.activeParadigm) return;
    this.activeParadigm.updateUniforms(frameData);
    this.activeParadigm.renderPass(encoderOrGl, targetView);
  }

  public resize(width: number, height: number): void {
    for (const paradigm of this.paradigms.values()) {
      paradigm.resize(width, height);
    }
  }

  public dispose(): void {
    for (const paradigm of this.paradigms.values()) {
      paradigm.dispose();
    }
    this.paradigms.clear();
    this.activeParadigm = null;
    this.gpuHandles = null;
    this.currentParticleBuffer = null;
    this.currentIndexBuffer = null;
  }
}
