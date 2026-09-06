// ============================================================================
// File: src/core/paradigms/index.ts
// Architecture: Universal Substrate Registration Engine & Paradigms
// Description: Zero-dependency universal substrate engine replacing deferred legacy Three.js paradigms
// ============================================================================

export type BackendType = 'webgpu' | 'webgl2';

export interface GpuResourceHandles {
  device?: GPUDevice;
  context?: GPUCanvasContext;
  gl?: WebGL2RenderingContext;
  preferredFormat?: GPUTextureFormat;
}

export interface SubstratePipelineConfig {
  enableDepthWrite: boolean;
  enableDepthTest: boolean;
  blendMode: 'opaque' | 'additive' | 'alpha';
  cullMode: 'none' | 'front' | 'back';
  wireframeOverlay: boolean;
  resolutionScale: number;
}

export interface SubstrateUniformFrameData {
  unfurl: number;
  mode: number;
  theme: number;
  time: number;
  dt: number;
  cameraPosition: any;
  cameraCenter: any;
  viewMatrix: any;
  projectionMatrix: any;
  cursorHitPos?: any;
  cursorVel?: any;
  cursorActive?: boolean;
}

export interface IRenderParadigm {
  readonly id: string;
  readonly name: string;
  readonly backend: BackendType;
  initialize(gpu: GpuResourceHandles, config: SubstratePipelineConfig): Promise<void>;
  compileShaders(): Promise<void>;
  bindBuffers(particleBuffer: any, indexBuffer?: any): void;
  updateUniforms(frameData: SubstrateUniformFrameData): void;
  renderPass(encoderOrGl: any, targetView?: any): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export abstract class BaseRenderParadigm implements IRenderParadigm {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public readonly backend: BackendType;
  protected isInitialized = false;

  constructor(backend: BackendType = 'webgpu') {
    this.backend = backend;
  }

  public async initialize(_gpu: GpuResourceHandles, _config: SubstratePipelineConfig): Promise<void> {
    this.isInitialized = true;
  }

  public async compileShaders(): Promise<void> {}
  public bindBuffers(_particleBuffer: any, _indexBuffer?: any): void {}
  public updateUniforms(_frameData: SubstrateUniformFrameData): void {}
  public renderPass(_encoderOrGl: any, _targetView?: any): void {}
  public resize(_width: number, _height: number): void {}
  public dispose(): void {
    this.isInitialized = false;
  }
}

export class ScientificWireframeParadigm extends BaseRenderParadigm {
  public readonly id = 'scientific';
  public readonly name = 'Scientific Wireframe';
}

export class PhotorealisticTerrainParadigm extends BaseRenderParadigm {
  public readonly id = 'photorealistic';
  public readonly name = 'Photorealistic Terrain';
}

export class VoxelParadigm extends BaseRenderParadigm {
  public readonly id = 'voxel';
  public readonly name = 'Voxel Lattice';
}

export class LowPolyParadigm extends BaseRenderParadigm {
  public readonly id = 'lowpoly';
  public readonly name = 'Low Poly Manifold';
}

export class TopographicContourParadigm extends BaseRenderParadigm {
  public readonly id = 'contour';
  public readonly name = 'Topographic Contour';
}

export class AbstractSculptureParadigm extends BaseRenderParadigm {
  public readonly id = 'sculpture';
  public readonly name = 'Abstract Sculpture';
}

export class ParadigmRegistry {
  private paradigms: Map<string, IRenderParadigm> = new Map();
  private activeParadigm: IRenderParadigm | null = null;
  private gpuHandles: GpuResourceHandles | null = null;
  private currentConfig: SubstratePipelineConfig | null = null;
  private currentParticleBuffer: any = null;
  private currentIndexBuffer: any = null;

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

    const firstId = this.paradigms.has('scientific') ? 'scientific' : Array.from(this.paradigms.keys())[0];
    if (firstId) {
      this.activeParadigm = this.paradigms.get(firstId) || null;
    }
  }

  public async switchParadigm(
    paradigmId: string,
    particleBuffer?: any,
    indexBuffer?: any
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
    return performance.now() - startTime;
  }

  public render(
    frameData: SubstrateUniformFrameData,
    encoderOrGl: any,
    targetView?: any
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
