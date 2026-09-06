// ============================================================================
// File: src/webgpu/WebGPUEngine.ts
// Architecture: Autonomous 1,000,000-Node WebGPU Compute & Render Subsystem
// Description: Dedicated WGSL compute advection with zero-copy vertex rendering,
//              Eduard Imhof Swiss relief shading, Jerlov hydrosphere radiative transfer,
//              and screen-space anti-aliased vector ribbons on Apple Silicon M4 Pro.
// ============================================================================

import { Vector3, Vector4, PerspectiveCamera } from '../core/math/cameraMath';
import { isWebGPUSupported } from './support';
import { projectToDymaxion2D } from '../utils/dymaxion';
import { decodeContourMesh } from '../utils/contour-topology';

export { isWebGPUSupported };

import physicsSimWGSL from './shaders/physics_sim.wgsl?raw';
import pointsRenderWGSL from './shaders/points_render.wgsl?raw';
import linesRenderWGSL from './shaders/lines_render.wgsl?raw';
import swissReliefWGSL from './shaders/swiss_relief_shading.wgsl?raw';
import vectorRibbonWGSL from './shaders/vector_ribbon.wgsl?raw';
import crustHydrosphereWGSL from './shaders/crust_hydrosphere.wgsl?raw';
import demUnpackWGSL from './shaders/dem_unpack.wgsl?raw';
import windParticlesWGSL from './shaders/wind_particles.wgsl?raw';
import windRibbonRenderWGSL from './shaders/wind_ribbon_render.wgsl?raw';
import origamiCraneWGSL from './shaders/origami_crane.wgsl?raw';
import { GPUProfiler } from './profiling/GPUProfiler';
import { encodeFloat16 } from '../core/math/float16';
import { parseTLE, propagateOrbitalPosition } from '../core/math/sgp4';
import { loadNodeAssetBuffer, loadNodeAssetText } from '../utils/nodeAssetLoader';
import { OrigamiCraneFlightSolver, CraneState } from '../core/physics/OrigamiCraneFlightSolver';

export interface WebGPUInitConfig {
  canvas: HTMLCanvasElement;
  pointCount: number;
  pointsData: Float32Array;   // 3 * N (xyz)
  target2DData: Float32Array; // 2 * N (xy)
  typeData: Float32Array;     // N (vType)
  lineIndices: Uint32Array;   // 2 * M (line segment index pairs)
  dymaxion2DData?: Float32Array; // 2 * N (xy Dymaxion target)
  displacementScale?: number;
}

export interface WebGPUFrameParams {
  unfurl: number;
  mode: number;
  layerMode?: number; // 0 = Both, 1 = Points Only, 2 = Wireframe Only
  theme?: number;     // 0 = Dark Cyber, 1 = Light Monochrome
  time: number;
  dt: number;
  cursorRayOrig?: Vector3 | { x: number; y: number; z: number };
  cursorRayDir?: Vector3 | { x: number; y: number; z: number };
  cursorHitPos?: Vector3 | { x: number; y: number; z: number };
  cursorVel?: Vector4 | Vector3 | { x: number; y: number; z: number; w?: number };
  cursorActive?: boolean;
  camera: PerspectiveCamera | {
    position: { x: number; y: number; z: number };
    matrixWorldInverse: { toArray: (arr: Float32Array | number[], offset?: number) => void };
    projectionMatrix: { toArray: (arr: Float32Array | number[], offset?: number) => void };
    updateMatrixWorld?: () => void;
  };
  renderLayers?: 'both' | 'points' | 'wireframe';
  displacementScale?: number;
  hillshadeIntensity?: number;
  reliefActive?: boolean;
  showRelief?: boolean;
  showVectors?: boolean;
  showContours?: boolean;
  showSatellites?: boolean;
  showStarlink?: boolean;
  showWind?: boolean;
  showSurfaceWinds?: boolean;
  showJetStream?: boolean;
  showCrane?: boolean;
  seaLevel?: number;
  sunAzimuth?: number;
  sunAltitude?: number;
  ambientOcclusion?: number;
  waterClarity?: number;
  peakExponent?: number;
  opacity?: number;
  renderStyle?: 'architectural' | 'hybrid' | 'photoreal' | string;
  pointScaleMultiplier?: number;
  vortexStrength?: number;
  fractureIntensity?: number;
}

export class WebGPUEngine {
  private adapter: GPUAdapter | null = null;
  private profiler: GPUProfiler | null = null;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  private particleBuffers: [GPUBuffer, GPUBuffer] = [null!, null!];
  private staticBuffer!: GPUBuffer;
  private lineIndexBuffer!: GPUBuffer;
  private lineIndexCount: number = 0;
  private pointCount: number = 0;

  // Contour Mesh GPU Buffers (M2-T1)
  public contourVertexBuffer: GPUBuffer | null = null;
  public contourIndexBuffer: GPUBuffer | null = null;
  public contourSegmentBuffer: GPUBuffer | null = null;
  public contourVertexCount: number = 0;
  public contourIndexCount: number = 0;

  // Base Simulation Uniforms (256 bytes)
  private simUniformBuffer!: GPUBuffer;
  private simFloats: Float32Array = new Float32Array(64);
  private simUints: Uint32Array = new Uint32Array(this.simFloats.buffer);

  // DEM Ingestion & Textures
  private demTexture: GPUTexture | null = null;
  private demTextureView: GPUTextureView | null = null;
  private demSampler!: GPUSampler;

  // Eduard Imhof Swiss Relief Shading Pass (M1-T2)
  private reliefUniformBuffer!: GPUBuffer;
  private reliefFloats: Float32Array = new Float32Array(16);
  private reliefUints: Uint32Array = new Uint32Array(this.reliefFloats.buffer);
  private swissReliefPipeline!: GPURenderPipeline;
  private reliefBindGroupLayout!: GPUBindGroupLayout;
  private reliefBindGroup!: GPUBindGroup;

  // Vector Line Ribbon Extrusion Pipeline (M1-T4)
  private quadCornerBuffer!: GPUBuffer;
  private vectorSegmentBuffer!: GPUBuffer;
  public vectorSegmentCount: number = 0;
  private ribbonUniformBuffer!: GPUBuffer;
  private ribbonFloats: Float32Array = new Float32Array(64);
  private ribbonUints: Uint32Array = new Uint32Array(this.ribbonFloats.buffer);
  private vectorRibbonPipeline!: GPURenderPipeline;
  private ribbonBindGroupLayout!: GPUBindGroupLayout;
  private ribbonBindGroup!: GPUBindGroup;

  // Lithosphere Crust & Hydrosphere Optics Pipeline (M1-T3)
  private crustUniformBuffer!: GPUBuffer;
  public crustVertexBuffer: GPUBuffer | null = null;
  public crustIndexBuffer: GPUBuffer | null = null;
  public crustIndexCount: number = 0;
  private crustFloats = new Float32Array(64);
  private crustUints = new Uint32Array(this.crustFloats.buffer);
  private crustHydrospherePipeline!: GPURenderPipeline;
  private crustBindGroupLayout!: GPUBindGroupLayout;
  private crustBindGroup!: GPUBindGroup;

  // NASA Blue Marble & VIIRS Night Lights Draping (Feature F28)
  private orbitalTexture: GPUTexture | null = null;
  private orbitalTextureView: GPUTextureView | null = null;
  private orbitalSampler: GPUSampler | null = null;
  private orbitalTexturesLoaded: boolean = false;

  // Decoupled 4.19M VRAM Particle Spawn (Feature F31)
  private spawnPipeline: GPUComputePipeline | null = null;
  private spawnBindGroupLayout: GPUBindGroupLayout | null = null;
  private cartographicBuffersInitialized: boolean = false;
  private cachedInitConfig: {
    pointsData: Float32Array;
    target2DData: Float32Array;
    typeData: Float32Array;
    lineIndices: Uint32Array;
    initialStaticParticles: Float32Array;
  } | null = null;

  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;

  private computePipeline!: GPUComputePipeline;
  private computeBindGroupLayout!: GPUBindGroupLayout;
  private pointsRenderPipeline!: GPURenderPipeline;
  private linesRenderPipeline!: GPURenderPipeline;

  // NOAA GFS Wind Grid Texture (F34)
  private windTexture: GPUTexture | null = null;
  private windTextureView: GPUTextureView | null = null;
  private windSampler: GPUSampler | null = null;

  // CelesTrak Starlink & ISS Satellite Orbit Ribbons (F35)
  public satelliteSegmentBuffer: GPUBuffer | null = null;
  public satelliteSegmentCount: number = 0;

  // Atmospheric Wind Streamlines & Multi-Stratum Pipelines
  public readonly windParticleCount: number = 65536;
  public showSurfaceWinds: boolean = true;
  public showJetStream: boolean = true;
  public windSpeedMultiplier: number = 1.0;
  private jetStreamTexture: GPUTexture | null = null;
  private jetStreamTextureView: GPUTextureView | null = null;
  public windParticleBuffers: [GPUBuffer, GPUBuffer] | null = null;
  private windUniformBuffer: GPUBuffer | null = null;
  private windComputePipeline: GPUComputePipeline | null = null;
  private windComputeBindGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  private windRibbonPipeline: GPURenderPipeline | null = null;
  private windRibbonBindGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  private windStep: number = 0;

  // Autonomous Origami Paper Crane Soaring Engine
  public readonly craneSolver: OrigamiCraneFlightSolver = new OrigamiCraneFlightSolver();
  public isCraneActive: boolean = false;
  private craneUniformBuffer: GPUBuffer | null = null;
  private craneBindGroup: GPUBindGroup | null = null;
  private cranePipeline: GPURenderPipeline | null = null;
  private craneUniformFloats: Float32Array = new Float32Array(60);

  private computeBindGroups: [GPUBindGroup, GPUBindGroup] = [null!, null!];
  private renderBindGroup!: GPUBindGroup;

  private currentStep: number = 0;
  private isInitialized: boolean = false;
  private onDeviceLostCallback?: (info: GPUDeviceLostInfo) => void;

  public static async isSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  public get initialized(): boolean {
    return this.isInitialized;
  }

  public getAdapter(): GPUAdapter | null {
    return this.adapter;
  }

  public getProfiler(): GPUProfiler | null {
    return this.profiler;
  }

  public getDevice(): GPUDevice | null {
    return this.device;
  }

  public getDEMTexture(): GPUTexture | null {
    return this.demTexture;
  }

  public getDEMSampler(): GPUSampler | null {
    return this.demSampler;
  }

  public getCrustVertexBuffer(): GPUBuffer | null {
    return this.crustVertexBuffer;
  }

  public getCrustIndexBuffer(): GPUBuffer | null {
    return this.crustIndexBuffer;
  }

  public getCrustIndexCount(): number {
    return this.crustIndexCount;
  }

  public isOrbitalTexturesLoaded(): boolean {
    return this.orbitalTexturesLoaded;
  }

  public async init(config: WebGPUInitConfig): Promise<void> {
    return this.initialize(config);
  }

  public async initialize(config: WebGPUInitConfig): Promise<void> {
    if (this.isInitialized) {
      this.dispose();
    }

    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error('WebGPU is not supported in this environment.');
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('No appropriate GPUAdapter found.');
    }

    this.adapter = adapter;
    const requiredLimits: Record<string, number> = {};
    if (adapter.limits?.maxStorageBufferBindingSize) {
      requiredLimits.maxStorageBufferBindingSize = Math.min(
        adapter.limits.maxStorageBufferBindingSize,
        1024 * 1024 * 1024 // 1 GB
      );
    }
    if (adapter.limits?.maxBufferSize) {
      requiredLimits.maxBufferSize = Math.min(
        adapter.limits.maxBufferSize,
        1024 * 1024 * 1024 // 1 GB
      );
    }
    if (adapter.limits?.maxComputeWorkgroupStorageSize) {
      requiredLimits.maxComputeWorkgroupStorageSize = adapter.limits.maxComputeWorkgroupStorageSize;
    }
    if (adapter.limits?.maxComputeInvocationsPerWorkgroup) {
      requiredLimits.maxComputeInvocationsPerWorkgroup = adapter.limits.maxComputeInvocationsPerWorkgroup;
    }

    const requiredFeatures: GPUFeatureName[] = [];
    if (adapter.features?.has('timestamp-query')) {
      requiredFeatures.push('timestamp-query');
    }
    if (adapter.features?.has('texture-formats-tier1' as any)) {
      requiredFeatures.push('texture-formats-tier1' as any);
    }
    if (adapter.features?.has('texture-formats-tier2' as any)) {
      requiredFeatures.push('texture-formats-tier2' as any);
    }
    if (adapter.features?.has('float32-filterable' as any)) {
      requiredFeatures.push('float32-filterable' as any);
    }

    try {
      this.device = await adapter.requestDevice({
        requiredLimits,
        requiredFeatures,
      });
    } catch (err) {
      console.warn('WebGPU requestDevice failed with requiredFeatures, retrying without optional features:', err);
      this.device = await adapter.requestDevice({
        requiredLimits,
        requiredFeatures: [],
      });
    }
    this.profiler = new GPUProfiler(this.device);

    this.device.lost?.then((info) => {
      this.isInitialized = false;
      this.onDeviceLostCallback?.(info);
    }).catch(() => {});

    this.device.addEventListener?.('uncapturederror', (event: any) => {
      console.error('WebGPU Uncaptured Error:', event.error?.message || event);
    });

    this.context = config.canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      throw new Error('Failed to obtain WebGPU canvas context.');
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    this.pointCount = config.pointCount;
    this.lineIndexCount = config.lineIndices.length;

    this.updateDepthTexture(config.canvas.width || 800, config.canvas.height || 600);

    // ========================================================================
    // 1. DEM Ingestion Sampler & Default 2x2 Synchronous Placeholder Texture (M1-T1)
    // ========================================================================
    this.demSampler = this.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'clamp-to-edge',
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 4,
    });

    // Default 2x2 placeholder texture (rgba8unorm)
    this.demTexture = this.device.createTexture({
      size: [2, 2, 1],
      format: 'rgba8unorm',
      usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
    });
    // [R=landElev, G=oceanDepth, B=landFraction, A=signedElevation]
    const placeholderTexels = new Uint8Array([
      0, 128, 0, 128,   0, 128, 0, 128,
      0, 128, 0, 128,   0, 128, 0, 128,
    ]);
    this.device.queue.writeTexture(
      { texture: this.demTexture },
      placeholderTexels,
      { bytesPerRow: 8, rowsPerImage: 2 },
      [2, 2, 1]
    );
    this.demTextureView = this.demTexture.createView();

    // ========================================================================
    // 1b. NASA Blue Marble & VIIRS Night Lights 2-Layer Texture Array (F28)
    // ========================================================================
    this.orbitalSampler = this.device.createSampler({
      label: 'orbital_sampler',
      addressModeU: 'repeat',
      addressModeV: 'clamp-to-edge',
      minFilter: 'linear',
      magFilter: 'linear',
    });

    // Default procedural 2-layer texture array (Layer 0: Day Blue Marble, Layer 1: Night Lights)
    const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
    const orbW = isTestEnv ? 512 : 1024;
    const orbH = isTestEnv ? 256 : 512;
    this.orbitalTexture = this.device.createTexture({
      label: 'nasa_orbital_texture_array_procedural',
      size: [orbW, orbH, 2],
      format: 'rgba8unorm',
      usage: (typeof GPUTextureUsage !== 'undefined'
        ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT)
        : (4 | 8 | 16)),
    });

    const dayTexels = new Uint8Array(orbW * orbH * 4);
    const nightTexels = new Uint8Array(orbW * orbH * 4);

    for (let y = 0; y < orbH; y++) {
      const lat = 90.0 - (y / orbH) * 180.0;
      const absLat = Math.abs(lat);
      const iceT = Math.max(0.0, Math.min(1.0, (absLat - 70.0) / 16.0));
      for (let x = 0; x < orbW; x++) {
        const idx = (y * orbW + x) * 4;

        // Smooth base: deep oceanic navy blending cleanly into polar ice
        const oceanR = 12;
        const oceanG = 34;
        const oceanB = 72;
        const iceR = 228;
        const iceG = 238;
        const iceB = 250;

        dayTexels[idx + 0] = Math.round(oceanR + (iceR - oceanR) * iceT);
        dayTexels[idx + 1] = Math.round(oceanG + (iceG - oceanG) * iceT);
        dayTexels[idx + 2] = Math.round(oceanB + (iceB - oceanB) * iceT);
        dayTexels[idx + 3] = 255;

        // Clean darkness for procedural night layer (no hard yellow bounding boxes)
        nightTexels[idx + 0] = 0;
        nightTexels[idx + 1] = 0;
        nightTexels[idx + 2] = 0;
        nightTexels[idx + 3] = 255;
      }
    }

    this.device.queue.writeTexture(
      { texture: this.orbitalTexture, origin: [0, 0, 0] },
      dayTexels,
      { bytesPerRow: orbW * 4, rowsPerImage: orbH },
      [orbW, orbH, 1]
    );

    this.device.queue.writeTexture(
      { texture: this.orbitalTexture, origin: [0, 0, 1] },
      nightTexels,
      { bytesPerRow: orbW * 4, rowsPerImage: orbH },
      [orbW, orbH, 1]
    );

    this.orbitalTextureView = this.orbitalTexture.createView({
      dimension: '2d-array',
      baseArrayLayer: 0,
      arrayLayerCount: 2,
    });

    // ========================================================================
    // 1c. NOAA GFS Wind Grid Texture (360x181 Half-Precision Float16) (F34)
    // ========================================================================
    this.windSampler = this.device.createSampler({
      label: 'wind_sampler',
      addressModeU: 'repeat',
      addressModeV: 'clamp-to-edge',
      minFilter: 'linear',
      magFilter: 'linear',
    });

    const windW = 360;
    const windH = 181;
    this.windTexture = this.device.createTexture({
      label: 'wind_velocity_texture',
      size: [windW, windH, 1],
      format: 'rg16float',
      usage: (typeof GPUTextureUsage !== 'undefined'
        ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST)
        : (4 | 8)),
    });
    this.windTextureView = this.windTexture.createView();

    // Populate procedural circulation fallback into windTexture initially
    const rowBytesRaw = windW * 4; // 360 * 2 components * 2 bytes = 1440 bytes
    const rowBytesPadded = Math.ceil(rowBytesRaw / 256) * 256; // 1536 bytes
    const paddedWindData = new Uint8Array(rowBytesPadded * windH);

    for (let y = 0; y < windH; y++) {
      const latDeg = 90.0 - y;
      const absLat = Math.abs(latDeg);
      const rowOffset = y * rowBytesPadded;
      const rowU16 = new Uint16Array(paddedWindData.buffer, paddedWindData.byteOffset + rowOffset, windW * 2);

      for (let x = 0; x < windW; x++) {
        let uMps = 0;
        let vMps = 0;

        if (absLat <= 30.0) {
          uMps = -8.0 * Math.cos((absLat / 30.0) * (Math.PI * 0.5));
          vMps = (latDeg > 0 ? -2.5 : 2.5) * Math.sin(x * 0.05);
        } else if (absLat <= 60.0) {
          uMps = 22.0 * Math.cos(((absLat - 45.0) / 15.0) * (Math.PI * 0.5));
          vMps = 5.0 * Math.sin(x * 0.1);
        } else {
          uMps = -5.0;
          vMps = 2.0;
        }

        rowU16[x * 2 + 0] = encodeFloat16(uMps);
        rowU16[x * 2 + 1] = encodeFloat16(vMps);
      }
    }

    try {
      this.device.queue.writeTexture(
        { texture: this.windTexture },
        paddedWindData,
        { bytesPerRow: rowBytesPadded, rowsPerImage: windH },
        [windW, windH, 1]
      );
    } catch {
      // Mock environment guard
    }

    // ========================================================================
    // 2. Pack Dynamic & Static Particle Buffers (Zero-Copy 32-Byte Stride)
    // ========================================================================
    const particleFloatCount = this.pointCount * 8;
    const initialParticles = new Float32Array(particleFloatCount);
    const initialStaticParticles = new Float32Array(particleFloatCount);

    for (let i = 0; i < this.pointCount; i++) {
      const pBase = i * 8;
      const sBase = i * 8;

      // position (xyz) + pointType (w)
      initialParticles[pBase + 0] = config.pointsData[i * 3 + 0];
      initialParticles[pBase + 1] = config.pointsData[i * 3 + 1];
      initialParticles[pBase + 2] = config.pointsData[i * 3 + 2];
      initialParticles[pBase + 3] = config.typeData[i];

      // velocity (xyz) + metric (w)
      initialParticles[pBase + 4] = 0.0;
      initialParticles[pBase + 5] = 0.0;
      initialParticles[pBase + 6] = 0.0;
      initialParticles[pBase + 7] = 0.0;

      // rest_sphere (xyz) + rest_radius (w)
      initialStaticParticles[sBase + 0] = config.pointsData[i * 3 + 0];
      initialStaticParticles[sBase + 1] = config.pointsData[i * 3 + 1];
      initialStaticParticles[sBase + 2] = config.pointsData[i * 3 + 2];
      initialStaticParticles[sBase + 3] = 5.0;

      // rest_map (xy: Mercator 2D, zw: Dymaxion 2D)
      initialStaticParticles[sBase + 4] = config.target2DData[i * 2 + 0];
      initialStaticParticles[sBase + 5] = config.target2DData[i * 2 + 1];
      if (config.dymaxion2DData) {
        initialStaticParticles[sBase + 6] = config.dymaxion2DData[i * 2 + 0];
        initialStaticParticles[sBase + 7] = config.dymaxion2DData[i * 2 + 1];
      } else {
        const [dymU, dymV] = projectToDymaxion2D([
          config.pointsData[i * 3 + 0],
          config.pointsData[i * 3 + 1],
          config.pointsData[i * 3 + 2]
        ]);
        initialStaticParticles[sBase + 6] = dymU;
        initialStaticParticles[sBase + 7] = dymV;
      }
    }

    // Dedicated Static GPU Storage Buffer
    this.staticBuffer = this.device.createBuffer({
      size: initialStaticParticles.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      this.staticBuffer,
      0,
      initialStaticParticles.buffer,
      initialStaticParticles.byteOffset,
      initialStaticParticles.byteLength
    );

    const bufferByteSize = initialParticles.byteLength;

    // Ping-Pong Storage Buffers (Buffer 0 & Buffer 1)
    this.particleBuffers[0] = this.device.createBuffer({
      size: bufferByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.particleBuffers[0], 0, initialParticles.buffer, initialParticles.byteOffset, initialParticles.byteLength);

    this.particleBuffers[1] = this.device.createBuffer({
      size: bufferByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.particleBuffers[1], 0, initialParticles.buffer, initialParticles.byteOffset, initialParticles.byteLength);

    // Index Buffer for Line Segments
    this.lineIndexBuffer = this.device.createBuffer({
      size: config.lineIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      this.lineIndexBuffer,
      0,
      config.lineIndices.buffer,
      config.lineIndices.byteOffset,
      config.lineIndices.byteLength
    );

    // Sim Uniform Buffer (256 bytes, 16-byte aligned)
    this.simUniformBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.cartographicBuffersInitialized = false;
    this.cachedInitConfig = {
      pointsData: config.pointsData,
      target2DData: config.target2DData,
      typeData: config.typeData,
      lineIndices: config.lineIndices,
      initialStaticParticles,
    };

    // Setup Pipelines & BindGroups
    await this.setupPipelines();
    this.updateDEMBindGroups();

    this.currentStep = 0;
    this.isInitialized = true;
  }

  /**
   * Generates a 3D tessellated spherical grid for dual-surface lithosphere crust and liquid hydrosphere.
   * Vertex layout: stride 48 bytes (12 floats per vertex):
   *   [0..2]  position: float32x3 (3D Cartesian on sphere of RADIUS = 5.0)
   *   [3..4]  uv: float32x2 (u: [0..1] longitude, v: [0..1] latitude)
   *   [5]     surfaceType: float32 (0.0 = Crust, 1.0 = Liquid Hydrosphere)
   *   [6..9]  target2D: float32x4 (xy: Mercator 2D, zw: Dymaxion/Planar 2D)
   *   [10..11] padding: float32x2
   * Dual-surface mesh includes Surface 0 (Crust, surfaceType=0.0) and Surface 1 (Hydrosphere, surfaceType=1.0).
   */
  public generateSphereGrid(
    latSegments = 128,
    lonSegments = 256
  ): { vertices: Float32Array; indices: Uint32Array } {
    const RADIUS = 5.0;
    const vertsPerSurface = (latSegments + 1) * (lonSegments + 1);
    const totalVertices = vertsPerSurface * 2;
    const floatsPerVertex = 12;
    const vertices = new Float32Array(totalVertices * floatsPerVertex);

    const quadsPerSurface = latSegments * lonSegments;
    const indicesPerSurface = quadsPerSurface * 6;
    const totalIndices = indicesPerSurface * 2;
    const indices = new Uint32Array(totalIndices);

    // Populate Vertices
    for (let surface = 0; surface < 2; surface++) {
      const surfaceType = surface === 0 ? 0.0 : 1.0;
      const baseVertexOffset = surface * vertsPerSurface;

      for (let lat = 0; lat <= latSegments; lat++) {
        // v = 0.0 is North Pole (top row of DEM), v = 1.0 is South Pole (bottom row of DEM)
        const latFraction = lat / latSegments;
        const v = 1.0 - latFraction;
        // phi from -PI/2 (South Pole) to +PI/2 (North Pole)
        const phi = (latFraction - 0.5) * Math.PI;
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        // Mercator Y with safety clamping to prevent infinity at poles
        const clampedPhi = Math.max(-1.4835, Math.min(1.4835, phi));
        const mercatorY = Math.log(Math.tan(Math.PI * 0.25 + clampedPhi * 0.5)) * RADIUS;

        for (let lon = 0; lon <= lonSegments; lon++) {
          const u = lon / lonSegments;
          // lambda from -PI to +PI
          const lambda = (u - 0.5) * (2.0 * Math.PI);
          const sinLambda = Math.sin(lambda);
          const cosLambda = Math.cos(lambda);

          const mercatorX = lambda * RADIUS;

          // 3D Cartesian coordinates on sphere
          // Matches shader: lambda = atan2(pos.x, pos.z), phi = asin(pos.y / R)
          const x = RADIUS * cosPhi * sinLambda;
          const y = RADIUS * sinPhi;
          const z = RADIUS * cosPhi * cosLambda;

          const vertIndex = baseVertexOffset + lat * (lonSegments + 1) + lon;
          const offset = vertIndex * floatsPerVertex;

          vertices[offset + 0] = x;
          vertices[offset + 1] = y;
          vertices[offset + 2] = z;
          vertices[offset + 3] = u;
          vertices[offset + 4] = v;
          vertices[offset + 5] = surfaceType;
          vertices[offset + 6] = mercatorX;
          vertices[offset + 7] = mercatorY;
          const [dymX, dymY] = projectToDymaxion2D([x, y, z]);
          vertices[offset + 8] = dymX;
          vertices[offset + 9] = dymY;
          vertices[offset + 10] = 0.0; // padding
          vertices[offset + 11] = 0.0; // padding
        }
      }

      // Populate Indices
      const baseIndexOffset = surface * indicesPerSurface;
      let indexPtr = baseIndexOffset;

      for (let lat = 0; lat < latSegments; lat++) {
        for (let lon = 0; lon < lonSegments; lon++) {
          const row1 = baseVertexOffset + lat * (lonSegments + 1);
          const row2 = baseVertexOffset + (lat + 1) * (lonSegments + 1);

          const i0 = row1 + lon;
          const i1 = row1 + lon + 1;
          const i2 = row2 + lon;
          const i3 = row2 + lon + 1;

          // Outward-facing counter-clockwise triangles
          indices[indexPtr++] = i0;
          indices[indexPtr++] = i1;
          indices[indexPtr++] = i2;

          indices[indexPtr++] = i2;
          indices[indexPtr++] = i1;
          indices[indexPtr++] = i3;
        }
      }
    }

    return { vertices, indices };
  }

  /**
   * Rebuilds the dual-surface lithosphere and hydrosphere sphere grid dynamically at the specified resolution.
   */
  public rebuildSphereMesh(
    latSegments = 512,
    lonSegments = 1024
  ): { vertexCount: number; triangleCount: number; memoryBytes: number } {
    if (!this.device) {
      throw new Error('Device not initialized');
    }
    const sphereMesh = this.generateSphereGrid(latSegments, lonSegments);
    this.crustIndexCount = sphereMesh.indices.length;

    if (this.crustVertexBuffer) {
      this.crustVertexBuffer.destroy();
    }
    this.crustVertexBuffer = this.device.createBuffer({
      label: `crust_vertex_buffer_${latSegments}x${lonSegments}`,
      size: sphereMesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.crustVertexBuffer, 0, sphereMesh.vertices.buffer);

    if (this.crustIndexBuffer) {
      this.crustIndexBuffer.destroy();
    }
    this.crustIndexBuffer = this.device.createBuffer({
      label: `crust_index_buffer_${latSegments}x${lonSegments}`,
      size: sphereMesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.crustIndexBuffer, 0, sphereMesh.indices.buffer);

    const memoryBytes = sphereMesh.vertices.byteLength + sphereMesh.indices.byteLength;
    return {
      vertexCount: sphereMesh.vertices.length / 12,
      triangleCount: sphereMesh.indices.length / 3,
      memoryBytes,
    };
  }

  public ensureCartographicBuffers(): void {
    if (!this.device || this.cartographicBuffersInitialized) return;
    this.cartographicBuffersInitialized = true;

    // 1. Swiss Relief Shading Uniform Buffer (64 bytes, 16-byte aligned) (M1-T2)
    this.reliefUniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 2. Vector Line Ribbon Buffers & Quad Geometry (32 bytes) (M1-T4)
    // Static quad corner buffer: [0,-1], [0,1], [1,-1], [1,1] (32 bytes)
    const quadCorners = new Float32Array([
      0.0, -1.0,
      0.0,  1.0,
      1.0, -1.0,
      1.0,  1.0,
    ]);
    this.quadCornerBuffer = this.device.createBuffer({
      size: quadCorners.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.quadCornerBuffer, 0, quadCorners.buffer);

    // Ingest coastline boundary segments (initial synchronous fallback)
    if (!this.vectorSegmentBuffer || this.vectorSegmentCount === 0) {
      const cfg = this.cachedInitConfig;
      const boundaryPairs: number[] = [];
      if (cfg && cfg.lineIndices && cfg.typeData) {
        for (let k = 0; k < cfg.lineIndices.length; k += 2) {
          const idxA = cfg.lineIndices[k + 0];
          const idxB = cfg.lineIndices[k + 1];
          if ((cfg.typeData[idxA] > 0.5) !== (cfg.typeData[idxB] > 0.5)) {
            boundaryPairs.push(idxA, idxB);
          }
        }
      }

      const segCount = Math.floor(boundaryPairs.length / 2);
      this.vectorSegmentCount = segCount;
      const segFloats = new Float32Array(Math.max(1, segCount) * 16);

      for (let k = 0; k < segCount; k++) {
        const idxA = boundaryPairs[k * 2 + 0];
        const idxB = boundaryPairs[k * 2 + 1];
        const base = k * 16;

        segFloats[base + 0] = cfg!.pointsData[idxA * 3 + 0];
        segFloats[base + 1] = cfg!.pointsData[idxA * 3 + 1];
        segFloats[base + 2] = cfg!.pointsData[idxA * 3 + 2];
        segFloats[base + 3] = cfg!.typeData[idxA];

        segFloats[base + 4] = cfg!.target2DData[idxA * 2 + 0];
        segFloats[base + 5] = cfg!.target2DData[idxA * 2 + 1];
        segFloats[base + 6] = cfg!.initialStaticParticles[idxA * 8 + 6];
        segFloats[base + 7] = cfg!.initialStaticParticles[idxA * 8 + 7];

        segFloats[base + 8] = cfg!.pointsData[idxB * 3 + 0];
        segFloats[base + 9] = cfg!.pointsData[idxB * 3 + 1];
        segFloats[base + 10] = cfg!.pointsData[idxB * 3 + 2];
        segFloats[base + 11] = cfg!.typeData[idxB];

        segFloats[base + 12] = cfg!.target2DData[idxB * 2 + 0];
        segFloats[base + 13] = cfg!.target2DData[idxB * 2 + 1];
        segFloats[base + 14] = cfg!.initialStaticParticles[idxB * 8 + 6];
        segFloats[base + 15] = cfg!.initialStaticParticles[idxB * 8 + 7];
      }

      if (this.vectorSegmentBuffer) {
        this.vectorSegmentBuffer.destroy();
      }
      this.vectorSegmentBuffer = this.device.createBuffer({
        size: segFloats.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(this.vectorSegmentBuffer, 0, segFloats.buffer);
    }

    if (!this.ribbonUniformBuffer) {
      this.ribbonUniformBuffer = this.device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    // Asynchronously fetch high-precision vector boundaries and rivers from /geo-vectors.bin
    const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined' && !isTestEnv && this.vectorSegmentCount === 0) {
      this.loadVectorData('/geo-vectors.bin').catch(() => {});
    }

    // 3. Lithosphere Crust & Hydrosphere Uniform Buffer (256 bytes) (M1-T3)
    this.crustUniformBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 4. Dual-Surface Lithosphere Crust & Liquid Hydrosphere 3D Sphere Grid Buffers
    // Test environment uses lightweight 128x256; live production engine uses 512x1024 (1M triangles)
    const [defLat, defLon] = isTestEnv ? [128, 256] : [512, 1024];
    this.rebuildSphereMesh(defLat, defLon);

    this.updateDEMBindGroups();
  }

  public ensureWindBuffers(): void {
    if (!this.device || this.windBuffersInitialized) return;
    this.windBuffersInitialized = true;

    // Ensure quadCornerBuffer is available for wind ribbons
    if (!this.quadCornerBuffer) {
      const quadCorners = new Float32Array([
        0.0, -1.0,
        0.0,  1.0,
        1.0, -1.0,
        1.0,  1.0,
      ]);
      try {
        this.quadCornerBuffer = this.device.createBuffer({
          size: quadCorners.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.quadCornerBuffer, 0, quadCorners.buffer);
      } catch {}
    }

    // Ensure ribbonUniformBuffer is available for wind ribbons
    if (!this.ribbonUniformBuffer) {
      try {
        this.ribbonUniformBuffer = this.device.createBuffer({
          label: 'vector_ribbon_uniform_buffer',
          size: 240,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
      } catch {}
    }

    // 1. Jet Stream Texture (rg16float)
    if (!this.jetStreamTexture) {
      const windW = 360;
      const windH = 181;
      const rowBytesRaw = windW * 4;
      const rowBytesPadded = Math.ceil(rowBytesRaw / 256) * 256;
      const paddedJetData = new Uint8Array(rowBytesPadded * windH);

      for (let y = 0; y < windH; y++) {
        const latDeg = 90.0 - y;
        const absLat = Math.abs(latDeg);
        const rowOffset = y * rowBytesPadded;
        const rowU16 = new Uint16Array(paddedJetData.buffer, paddedJetData.byteOffset + rowOffset, windW * 2);

        for (let x = 0; x < windW; x++) {
          let uMps = 0;
          let vMps = 0;
          const lonRad = (x * Math.PI) / 180.0;

          if (absLat >= 35 && absLat <= 70) {
            const core = Math.cos(((absLat - 52) / 18) * (Math.PI * 0.5));
            uMps = 42.0 * Math.max(0, core) + 8.0 * Math.sin(lonRad * 3.0);
            vMps = 12.0 * Math.cos(lonRad * 3.0) * core;
          } else if (absLat >= 20 && absLat < 35) {
            const core = Math.cos(((absLat - 28) / 8) * (Math.PI * 0.5));
            uMps = 32.0 * Math.max(0, core);
            vMps = 4.0 * Math.sin(lonRad * 4.0);
          } else {
            uMps = -10.0 * Math.cos((absLat / 20) * (Math.PI * 0.5));
            vMps = 1.0;
          }

          rowU16[x * 2 + 0] = encodeFloat16(uMps);
          rowU16[x * 2 + 1] = encodeFloat16(vMps);
        }
      }

      try {
        this.jetStreamTexture = this.device.createTexture({
          label: 'jetstream_velocity_texture',
          size: [windW, windH, 1],
          format: 'rg16float',
          usage:
            typeof GPUTextureUsage !== 'undefined'
              ? GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
              : 4 | 8,
        });
        this.jetStreamTextureView = this.jetStreamTexture.createView();
        this.device.queue.writeTexture(
          { texture: this.jetStreamTexture },
          paddedJetData,
          { bytesPerRow: rowBytesPadded, rowsPerImage: windH },
          [windW, windH, 1]
        );
      } catch {}
    }

    // 2. Wind Particle Buffers (65,536 particles * 96 bytes)
    const windBufferSize = this.windParticleCount * 96;
    const initialWindData = new Float32Array(this.windParticleCount * 24);

    for (let i = 0; i < this.windParticleCount; i++) {
      const isJet = i >= this.windParticleCount / 2;
      const lon = (Math.random() * 2.0 - 1.0) * Math.PI;
      const lat = isJet
        ? (Math.random() > 0.5 ? 1 : -1) * (Math.PI * (0.22 + Math.random() * 0.20))
        : (Math.random() * 2.0 - 1.0) * (Math.PI * 0.46);
      const alt = isJet ? 0.22 : 0.04;
      const age = Math.random();

      const idx = i * 24;
      initialWindData[idx + 0] = lon;
      initialWindData[idx + 1] = lat;
      initialWindData[idx + 2] = alt;
      initialWindData[idx + 3] = age;

      const r = 5.0 + alt;
      const x = r * Math.cos(lat) * Math.sin(lon);
      const y = r * Math.sin(lat);
      const z = r * Math.cos(lat) * Math.cos(lon);

      initialWindData[idx + 8] = x; initialWindData[idx + 9] = y; initialWindData[idx + 10] = z; initialWindData[idx + 11] = 1.0;
      initialWindData[idx + 12] = x; initialWindData[idx + 13] = y; initialWindData[idx + 14] = z; initialWindData[idx + 15] = 0.75;
      initialWindData[idx + 16] = x; initialWindData[idx + 17] = y; initialWindData[idx + 18] = z; initialWindData[idx + 19] = 0.50;
      initialWindData[idx + 20] = x; initialWindData[idx + 21] = y; initialWindData[idx + 22] = z; initialWindData[idx + 23] = 0.25;
    }

    try {
      this.windParticleBuffers = [
        this.device.createBuffer({
          label: 'wind_particles_A',
          size: windBufferSize,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
        this.device.createBuffer({
          label: 'wind_particles_B',
          size: windBufferSize,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
      ];
      this.device.queue.writeBuffer(this.windParticleBuffers[0], 0, initialWindData.buffer);
      this.device.queue.writeBuffer(this.windParticleBuffers[1], 0, initialWindData.buffer);

      this.windUniformBuffer = this.device.createBuffer({
        label: 'wind_uniform_buffer',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.craneUniformBuffer = this.device.createBuffer({
        label: 'crane_uniform_buffer',
        size: 240,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.updateWindBindGroups();
    } catch {}
  }

  private updateWindBindGroups(): void {
    if (!this.device || !this.windParticleBuffers || !this.windUniformBuffer || !this.windTextureView || !this.jetStreamTextureView) return;

    try {
      const windComputeShaderModule = this.device.createShaderModule({
        label: 'wind_particles_compute',
        code: windParticlesWGSL,
      });

      const windComputeBindGroupLayout = this.device.createBindGroupLayout({
        label: 'wind_compute_bind_group_layout',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: {} },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: {} },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, texture: {} },
        ],
      });

      const windComputePipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [windComputeBindGroupLayout],
      });

      this.windComputePipeline = this.device.createComputePipeline({
        label: 'wind_compute_pipeline',
        layout: windComputePipelineLayout,
        compute: {
          module: windComputeShaderModule,
          entryPoint: 'cs_advect_wind',
        },
      });

      this.windComputeBindGroups = [
        this.device.createBindGroup({
          label: 'wind_compute_bg_0_to_1',
          layout: windComputeBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.windUniformBuffer } },
            { binding: 1, resource: { buffer: this.windParticleBuffers[0] } },
            { binding: 2, resource: { buffer: this.windParticleBuffers[1] } },
            { binding: 3, resource: this.windSampler! },
            { binding: 4, resource: this.windTextureView! },
            { binding: 5, resource: this.jetStreamTextureView! },
          ],
        }),
        this.device.createBindGroup({
          label: 'wind_compute_bg_1_to_0',
          layout: windComputeBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.windUniformBuffer } },
            { binding: 1, resource: { buffer: this.windParticleBuffers[1] } },
            { binding: 2, resource: { buffer: this.windParticleBuffers[0] } },
            { binding: 3, resource: this.windSampler! },
            { binding: 4, resource: this.windTextureView! },
            { binding: 5, resource: this.jetStreamTextureView! },
          ],
        }),
      ];

      // Wind Ribbon Render Pipeline
      const windRibbonShaderModule = this.device.createShaderModule({
        label: 'wind_ribbon_render',
        code: windRibbonRenderWGSL,
      });

      const windRibbonBindGroupLayout = this.device.createBindGroupLayout({
        label: 'wind_ribbon_bind_group_layout',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        ],
      });

      const windRibbonPipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [windRibbonBindGroupLayout],
      });

      const windQuadCornerLayout: GPUVertexBufferLayout = {
        arrayStride: 8,
        stepMode: 'vertex',
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
      };

      this.windRibbonPipeline = this.device.createRenderPipeline({
        label: 'wind_ribbon_pipeline',
        layout: windRibbonPipelineLayout,
        vertex: {
          module: windRibbonShaderModule,
          entryPoint: 'vs_main',
          buffers: [windQuadCornerLayout],
        },
        fragment: {
          module: windRibbonShaderModule,
          entryPoint: 'fs_main',
          targets: [
            {
              format: this.format,
              blend: {
                color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              },
            },
          ],
        },
        depthStencil: {
          depthWriteEnabled: false,
          depthCompare: 'always',
          format: 'depth24plus',
        },
        primitive: {
          topology: 'triangle-strip',
          cullMode: 'none',
        },
      });

      this.windRibbonBindGroups = [
        this.device.createBindGroup({
          label: 'wind_ribbon_bg_0',
          layout: windRibbonBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.ribbonUniformBuffer } },
            { binding: 1, resource: { buffer: this.windParticleBuffers[0] } },
          ],
        }),
        this.device.createBindGroup({
          label: 'wind_ribbon_bg_1',
          layout: windRibbonBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.ribbonUniformBuffer } },
            { binding: 1, resource: { buffer: this.windParticleBuffers[1] } },
          ],
        }),
      ];

      // Origami Crane Render Pipeline
      if (this.craneUniformBuffer) {
        const craneShaderModule = this.device.createShaderModule({
          label: 'origami_crane_shader',
          code: origamiCraneWGSL,
        });

        const craneBindGroupLayout = this.device.createBindGroupLayout({
          label: 'crane_bind_group_layout',
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          ],
        });

        const cranePipelineLayout = this.device.createPipelineLayout({
          bindGroupLayouts: [craneBindGroupLayout],
        });

        this.cranePipeline = this.device.createRenderPipeline({
          label: 'origami_crane_pipeline',
          layout: cranePipelineLayout,
          vertex: {
            module: craneShaderModule,
            entryPoint: 'vs_main',
            buffers: [],
          },
          fragment: {
            module: craneShaderModule,
            entryPoint: 'fs_main',
            targets: [
              {
                format: this.format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
              },
            ],
          },
          depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'always',
            format: 'depth24plus',
          },
          primitive: {
            topology: 'triangle-list',
            cullMode: 'none',
          },
        });

        this.craneBindGroup = this.device.createBindGroup({
          label: 'crane_bind_group',
          layout: craneBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.craneUniformBuffer } },
          ],
        });
      }
    } catch {}
  }

  private updateDEMBindGroups(): void {
    if (!this.device || !this.demTextureView || !this.demSampler) return;

    // Relief Shading BindGroup
    if (this.reliefBindGroupLayout && this.reliefUniformBuffer) {
      this.reliefBindGroup = this.device.createBindGroup({
        label: 'swiss_relief_bind_group',
        layout: this.reliefBindGroupLayout,
        entries: [
          { binding: 0, resource: this.demTextureView },
          { binding: 1, resource: this.demSampler },
          { binding: 2, resource: { buffer: this.reliefUniformBuffer } },
        ],
      });
    }

    // Vector Ribbon BindGroup
    if (this.ribbonBindGroupLayout && this.ribbonUniformBuffer) {
      this.ribbonBindGroup = this.device.createBindGroup({
        label: 'vector_ribbon_bind_group',
        layout: this.ribbonBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.ribbonUniformBuffer } },
          { binding: 1, resource: this.demTextureView },
          { binding: 2, resource: this.demSampler },
        ],
      });
    }

    // Crust / Hydrosphere BindGroup
    if (this.crustBindGroupLayout && this.crustUniformBuffer && this.orbitalTextureView && this.orbitalSampler) {
      this.crustBindGroup = this.device.createBindGroup({
        label: 'crust_hydrosphere_bind_group',
        layout: this.crustBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.crustUniformBuffer } },
          { binding: 1, resource: this.demTextureView },
          { binding: 2, resource: this.demSampler },
          { binding: 3, resource: this.orbitalTextureView },
          { binding: 4, resource: this.orbitalSampler },
        ],
      });
    }
  }

  public async loadOrbitalTextures(
    dayImage: ImageBitmap | HTMLImageElement | string,
    nightImage: ImageBitmap | HTMLImageElement | string
  ): Promise<void> {
    if (!this.device || !this.isInitialized) return;

    try {
      let daySource: ImageBitmap | HTMLImageElement;
      let nightSource: ImageBitmap | HTMLImageElement;

      if (typeof dayImage === 'string') {
        if (typeof fetch !== 'undefined' && typeof createImageBitmap !== 'undefined') {
          const res = await fetch(dayImage);
          const blob = await res.blob();
          daySource = await createImageBitmap(blob);
        } else if (typeof Image !== 'undefined') {
          daySource = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dayImage as string;
          });
        } else {
          return;
        }
      } else {
        daySource = dayImage;
      }

      if (typeof nightImage === 'string') {
        if (typeof fetch !== 'undefined' && typeof createImageBitmap !== 'undefined') {
          const res = await fetch(nightImage);
          const blob = await res.blob();
          nightSource = await createImageBitmap(blob);
        } else if (typeof Image !== 'undefined') {
          nightSource = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = nightImage as string;
          });
        } else {
          return;
        }
      } else {
        nightSource = nightImage;
      }

      const width = (daySource as any).width || 4096;
      const height = (daySource as any).height || 2048;

      if (this.orbitalTexture) {
        this.orbitalTexture.destroy();
      }

      this.orbitalTexture = this.device.createTexture({
        label: 'nasa_orbital_texture_array_4k',
        size: [width, height, 2],
        format: 'rgba8unorm',
        usage: (typeof GPUTextureUsage !== 'undefined'
          ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT)
          : (4 | 8 | 16)),
      });

      this.device.queue.copyExternalImageToTexture(
        { source: daySource },
        { texture: this.orbitalTexture, origin: [0, 0, 0] },
        [width, height]
      );

      this.device.queue.copyExternalImageToTexture(
        { source: nightSource },
        { texture: this.orbitalTexture, origin: [0, 0, 1] },
        [width, height]
      );

      this.orbitalTextureView = this.orbitalTexture.createView({
        dimension: '2d-array',
        baseArrayLayer: 0,
        arrayLayerCount: 2,
      });

      this.updateDEMBindGroups();
      this.orbitalTexturesLoaded = true;
    } catch (err) {
      console.warn('[WebGPUEngine] loadOrbitalTextures warning:', err);
    }
  }

  /**
   * Procedural VRAM Boot Compute Pass (Feature F31)
   * Spawns up to 4.19M particles directly in GPU memory using the Fibonacci sphere spiral algorithm.
   * Decouples dynamic particle simulation from terrain mesh resolution (up to 16.78M vertices).
   * Allocates 0 MB on CPU heap and transfers 0 MB across network.
   */
  public async spawnParticlesInVRAM(nodeCount: number = 4194304): Promise<void> {
    if (!this.device || !this.isInitialized) return;

    // Bound node count to 4.19M (16,384 workgroups) to remain strictly within WebGPU 1D dispatch limits (<= 65,535)
    const count = Math.min(4194304, Math.max(1024, nodeCount));
    const bufferByteSize = count * 32;

    // Reallocate VRAM storage buffers
    if (this.particleBuffers[0]) this.particleBuffers[0].destroy();
    if (this.particleBuffers[1]) this.particleBuffers[1].destroy();
    if (this.staticBuffer) this.staticBuffer.destroy();

    this.particleBuffers[0] = this.device.createBuffer({
      label: 'particle_buffer_0_vram',
      size: bufferByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.particleBuffers[1] = this.device.createBuffer({
      label: 'particle_buffer_1_vram',
      size: bufferByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.staticBuffer = this.device.createBuffer({
      label: 'static_particle_buffer_vram',
      size: bufferByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    if (!this.spawnPipeline) {
      const spawnWGSL = `
        struct Particle {
            position: vec4<f32>,
            velocity: vec4<f32>,
        };
        struct StaticParticle {
            rest_sphere: vec4<f32>,
            rest_map: vec4<f32>,
        };
        struct SpawnUniforms {
            u_numParticles: u32,
            u_radius: f32,
            u_pad1: f32,
            u_pad2: f32,
        };
        @group(0) @binding(0) var<uniform> sim: SpawnUniforms;
        @group(0) @binding(1) var<storage, read_write> particlesOut: array<Particle>;
        @group(0) @binding(2) var<storage, read_write> staticParticles: array<StaticParticle>;
        @group(0) @binding(3) var u_demTexture: texture_2d<f32>;
        @group(0) @binding(4) var u_demSampler: sampler;

        const PI: f32 = 3.14159265358979323846;
        const PHI: f32 = 1.618033988749895;

        @compute @workgroup_size(256, 1, 1)
        fn cs_spawn(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let i = global_id.x;
            if (i >= sim.u_numParticles) { return; }

            let N = f32(sim.u_numParticles);
            let fi = f32(i);

            let y = 1.0 - (2.0 * fi + 1.0) / N;
            let r = sqrt(max(0.0, 1.0 - y * y));
            let theta = 2.0 * PI * fi * (1.0 - 1.0 / PHI);

            let R = sim.u_radius;
            let p3D = vec3<f32>(r * cos(theta) * R, y * R, r * sin(theta) * R);

            let lambda = atan2(p3D.x, p3D.z);
            let lat = asin(clamp(p3D.y / R, -0.9998, 0.9998));
            let targetX = lambda * R;
            let clampedLat = clamp(lat, -1.4835, 1.4835);
            let targetY = log(tan(PI * 0.25 + clampedLat * 0.5)) * R;

            let uv = vec2<f32>(lambda / (2.0 * PI) + 0.5, 0.5 - lat / PI);
            let demSample = textureSampleLevel(u_demTexture, u_demSampler, uv, 0.0);
            let isLand = select(0.0, 1.0, demSample.a * 19772.0 - 10924.0 > 0.0);

            var p: Particle;
            p.position = vec4<f32>(p3D, isLand);
            p.velocity = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            particlesOut[i] = p;

            var sp: StaticParticle;
            sp.rest_sphere = vec4<f32>(p3D, R);
            sp.rest_map = vec4<f32>(targetX, targetY, targetX, targetY);
            staticParticles[i] = sp;
        }
      `;

      this.spawnBindGroupLayout = this.device.createBindGroupLayout({
        label: 'spawn_bind_group_layout',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: {} },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, sampler: {} },
        ],
      });

      const spawnPipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [this.spawnBindGroupLayout],
      });

      const spawnShaderModule = this.device.createShaderModule({
        label: 'spawn_particles_shader',
        code: spawnWGSL,
      });

      this.spawnPipeline = this.device.createComputePipeline({
        label: 'spawn_particles_pipeline',
        layout: spawnPipelineLayout,
        compute: {
          module: spawnShaderModule,
          entryPoint: 'cs_spawn',
        },
      });
    }

    const spawnUniformBuf = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sUints = new Uint32Array([count, 0, 0, 0]);
    const sFloats = new Float32Array(sUints.buffer);
    sFloats[1] = 5.0; // RADIUS
    this.device.queue.writeBuffer(spawnUniformBuf, 0, sUints.buffer);

    const spawnBindGroup0 = this.device.createBindGroup({
      label: 'spawn_bind_group_0',
      layout: this.spawnBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: spawnUniformBuf } },
        { binding: 1, resource: { buffer: this.particleBuffers[0] } },
        { binding: 2, resource: { buffer: this.staticBuffer } },
        { binding: 3, resource: this.demTextureView! },
        { binding: 4, resource: this.demSampler! },
      ],
    });

    const spawnBindGroup1 = this.device.createBindGroup({
      label: 'spawn_bind_group_1',
      layout: this.spawnBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: spawnUniformBuf } },
        { binding: 1, resource: { buffer: this.particleBuffers[1] } },
        { binding: 2, resource: { buffer: this.staticBuffer } },
        { binding: 3, resource: this.demTextureView! },
        { binding: 4, resource: this.demSampler! },
      ],
    });

    const workgroupCount = Math.ceil(count / 256);
    const commandEncoder = this.device.createCommandEncoder({ label: 'spawn_particles_encoder' });
    const computePass = commandEncoder.beginComputePass({ label: 'spawn_particles_pass' });
    computePass.setPipeline(this.spawnPipeline);
    computePass.setBindGroup(0, spawnBindGroup0);
    computePass.dispatchWorkgroups(workgroupCount, 1, 1);
    computePass.setBindGroup(0, spawnBindGroup1);
    computePass.dispatchWorkgroups(workgroupCount, 1, 1);
    computePass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    this.pointCount = count;

    if (this.computePipeline && this.simUniformBuffer) {
      const compLayout = (this.computePipeline?.getBindGroupLayout
        ? this.computePipeline.getBindGroupLayout(0)
        : this.computeBindGroupLayout) || this.computeBindGroupLayout;

      this.computeBindGroups[0] = this.device.createBindGroup({
        label: 'compute_ping_bind_group',
        layout: compLayout,
        entries: [
          { binding: 0, resource: { buffer: this.simUniformBuffer } },
          { binding: 1, resource: { buffer: this.particleBuffers[0] } },
          { binding: 2, resource: { buffer: this.particleBuffers[1] } },
          { binding: 3, resource: { buffer: this.staticBuffer } },
          { binding: 4, resource: this.windTextureView! },
          { binding: 5, resource: this.windSampler! },
        ],
      });

      this.computeBindGroups[1] = this.device.createBindGroup({
        label: 'compute_pong_bind_group',
        layout: compLayout,
        entries: [
          { binding: 0, resource: { buffer: this.simUniformBuffer } },
          { binding: 1, resource: { buffer: this.particleBuffers[1] } },
          { binding: 2, resource: { buffer: this.particleBuffers[0] } },
          { binding: 3, resource: { buffer: this.staticBuffer } },
          { binding: 4, resource: this.windTextureView! },
          { binding: 5, resource: this.windSampler! },
        ],
      });
    }
  }

  public async spawnParticlesOnGPU(nodeCount: number = 4194304): Promise<void> {
    return this.spawnParticlesInVRAM(nodeCount);
  }

  public async loadDEMTexture(urlOrBuffer: string | ArrayBuffer): Promise<void> {
    if (!this.device || !this.isInitialized) return;
    this.ensureCartographicBuffers();

    try {
      if (typeof urlOrBuffer === 'string') {
        let buffer: ArrayBuffer | null = null;
        try {
          const res = await fetch(urlOrBuffer);
          if (res.ok) {
            buffer = await res.arrayBuffer();
          }
        } catch {
          // If primary .bin fetch fails, attempt fallback to .webp
          if (urlOrBuffer.endsWith('.bin')) {
            const fallbackUrl = urlOrBuffer.replace('-u16.bin', '.webp');
            try {
              const res2 = await fetch(fallbackUrl);
              if (res2.ok) {
                buffer = await res2.arrayBuffer();
              }
            } catch {
              // Fallback failure handled below
            }
          }
        }

        if (buffer && buffer.byteLength > 0) {
          if (!this.device || !this.isInitialized) return;
          await this.loadDEMTexture(buffer);
        }
        return;
      }

      // Buffer ingestion with full mipmap pyramid generation
      if (!this.device || !this.isInitialized) return;
      const byteLength = urlOrBuffer.byteLength;
      const oldTexture = this.demTexture;
      if (byteLength === 16777216) {
        // Full-range 16-bit uint16 texture (2048 x 1024 x 4 x 2 bytes = 16 MB)
        const u16 = new Uint16Array(urlOrBuffer);
        let loaded = false;
        if (typeof (this.device as any).pushErrorScope === 'function') {
          // Real browser environment: verify if rgba16unorm can be sampled with linear filtering
          try {
            this.device.pushErrorScope('validation');
            const testTex = this.device.createTexture({
              size: [1, 1, 1],
              format: 'rgba16unorm',
              usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
            });
            const testBgl = this.device.createBindGroupLayout({
              entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: 'float' },
              }],
            });
            this.device.createBindGroup({
              layout: testBgl,
              entries: [{ binding: 0, resource: testTex.createView() }],
            });
            testTex.destroy();
            const validationErr = await this.device.popErrorScope();
            if (!validationErr) {
              const mips16 = this.generateMipsRGBA16(u16, 2048, 1024);
              const newTexture = this.device.createTexture({
                size: [2048, 1024, 1],
                mipLevelCount: mips16.length,
                format: 'rgba16unorm',
                usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
              });
              for (let level = 0; level < mips16.length; level++) {
                const m = mips16[level];
                this.device.queue.writeTexture(
                  { texture: newTexture, mipLevel: level },
                  m.data,
                  { bytesPerRow: m.width * 8, rowsPerImage: m.height },
                  [m.width, m.height, 1]
                );
              }
              this.demTexture = newTexture;
              this.demTextureView = this.demTexture.createView();
              if (oldTexture) oldTexture.destroy();
              this.updateDEMBindGroups();
              loaded = true;
            }
          } catch {
            loaded = false;
          }
        } else {
          // Mock test environment (Vitest)
          try {
            const mips16 = this.generateMipsRGBA16(u16, 2048, 1024);
            const newTexture = this.device.createTexture({
              size: [2048, 1024, 1],
              mipLevelCount: mips16.length,
              format: 'rgba16unorm',
              usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
            });
            for (let level = 0; level < mips16.length; level++) {
              const m = mips16[level];
              this.device.queue.writeTexture(
                { texture: newTexture, mipLevel: level },
                m.data,
                { bytesPerRow: m.width * 8, rowsPerImage: m.height },
                [m.width, m.height, 1]
              );
            }
            this.demTexture = newTexture;
            this.demTextureView = this.demTexture.createView();
            if (oldTexture) oldTexture.destroy();
            this.updateDEMBindGroups();
            loaded = true;
          } catch {}
        }

        if (!loaded) {
          // Graceful downsample 16-bit uint16 to 8-bit rgba8unorm if tier1 is unavailable
          const u8 = new Uint8Array(2048 * 1024 * 4);
          for (let i = 0; i < u16.length; i++) {
            u8[i] = u16[i] >> 8;
          }
          const mips8 = this.generateMipsRGBA8(u8, 2048, 1024);
          const newTexture = this.device.createTexture({
            size: [2048, 1024, 1],
            mipLevelCount: mips8.length,
            format: 'rgba8unorm',
            usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
          });
          for (let level = 0; level < mips8.length; level++) {
            const m = mips8[level];
            this.device.queue.writeTexture(
              { texture: newTexture, mipLevel: level },
              m.data,
              { bytesPerRow: m.width * 4, rowsPerImage: m.height },
              [m.width, m.height, 1]
            );
          }
          this.demTexture = newTexture;
          this.demTextureView = this.demTexture.createView();
          if (oldTexture) oldTexture.destroy();
          this.updateDEMBindGroups();
        }
      } else if (byteLength > 0) {
        // Fallback 8-bit texture ingestion or test mock buffer
        const width = 2048;
        const height = 1024;
        const u8 = new Uint8Array(urlOrBuffer);
        const mips8 = this.generateMipsRGBA8(u8.length >= width * height * 4 ? u8 : new Uint8Array(width * height * 4), width, height);
        const newTexture = this.device.createTexture({
          size: [width, height, 1],
          mipLevelCount: mips8.length,
          format: 'rgba8unorm',
          usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
        });

        for (let level = 0; level < mips8.length; level++) {
          const m = mips8[level];
          this.device.queue.writeTexture(
            { texture: newTexture, mipLevel: level },
            m.data,
            { bytesPerRow: m.width * 4, rowsPerImage: m.height },
            [m.width, m.height, 1]
          );
        }
        this.demTexture = newTexture;
        this.demTextureView = this.demTexture.createView();
        if (oldTexture) oldTexture.destroy();
        this.updateDEMBindGroups();
      }
    } catch (err) {
      console.warn('WebGPUEngine.loadDEMTexture encountered non-fatal error; retaining fallback texture:', err);
    }
  }

  private generateMipsRGBA8(
    src: Uint8Array,
    baseWidth: number,
    baseHeight: number
  ): Array<{ data: Uint8Array; width: number; height: number }> {
    const mips: Array<{ data: Uint8Array; width: number; height: number }> = [
      { data: src, width: baseWidth, height: baseHeight },
    ];
    let curW = baseWidth;
    let curH = baseHeight;
    let curData = src;

    while (curW > 1 || curH > 1) {
      const nextW = Math.max(1, curW >> 1);
      const nextH = Math.max(1, curH >> 1);
      const nextData = new Uint8Array(nextW * nextH * 4);

      for (let y = 0; y < nextH; y++) {
        const srcY0 = y * 2;
        const srcY1 = Math.min(srcY0 + 1, curH - 1);
        for (let x = 0; x < nextW; x++) {
          const srcX0 = x * 2;
          const srcX1 = Math.min(srcX0 + 1, curW - 1);

          const i00 = (srcY0 * curW + srcX0) * 4;
          const i10 = (srcY0 * curW + srcX1) * 4;
          const i01 = (srcY1 * curW + srcX0) * 4;
          const i11 = (srcY1 * curW + srcX1) * 4;

          const dstIdx = (y * nextW + x) * 4;
          for (let c = 0; c < 4; c++) {
            const p00 = curData[i00 + c];
            const p10 = curData[i10 + c];
            const p01 = curData[i01 + c];
            const p11 = curData[i11 + c];
            const mean = (p00 + p10 + p01 + p11) * 0.25;
            const maxVal = Math.max(p00, p10, p01, p11);
            nextData[dstIdx + c] = Math.min(255, Math.round(0.4 * mean + 0.6 * maxVal));
          }
        }
      }
      mips.push({ data: nextData, width: nextW, height: nextH });
      curW = nextW;
      curH = nextH;
      curData = nextData;
    }
    return mips;
  }

  private generateMipsRGBA16(
    src: Uint16Array,
    baseWidth: number,
    baseHeight: number
  ): Array<{ data: Uint16Array; width: number; height: number }> {
    const mips: Array<{ data: Uint16Array; width: number; height: number }> = [
      { data: src, width: baseWidth, height: baseHeight },
    ];
    let curW = baseWidth;
    let curH = baseHeight;
    let curData = src;

    while (curW > 1 || curH > 1) {
      const nextW = Math.max(1, curW >> 1);
      const nextH = Math.max(1, curH >> 1);
      const nextData = new Uint16Array(nextW * nextH * 4);

      for (let y = 0; y < nextH; y++) {
        const srcY0 = y * 2;
        const srcY1 = Math.min(srcY0 + 1, curH - 1);
        for (let x = 0; x < nextW; x++) {
          const srcX0 = x * 2;
          const srcX1 = Math.min(srcX0 + 1, curW - 1);

          const i00 = (srcY0 * curW + srcX0) * 4;
          const i10 = (srcY0 * curW + srcX1) * 4;
          const i01 = (srcY1 * curW + srcX0) * 4;
          const i11 = (srcY1 * curW + srcX1) * 4;

          const dstIdx = (y * nextW + x) * 4;
          for (let c = 0; c < 4; c++) {
            const p00 = curData[i00 + c];
            const p10 = curData[i10 + c];
            const p01 = curData[i01 + c];
            const p11 = curData[i11 + c];
            const mean = (p00 + p10 + p01 + p11) * 0.25;
            const maxVal = Math.max(p00, p10, p01, p11);
            nextData[dstIdx + c] = Math.min(65535, Math.round(0.4 * mean + 0.6 * maxVal));
          }
        }
      }
      mips.push({ data: nextData, width: nextW, height: nextH });
      curW = nextW;
      curH = nextH;
      curData = nextData;
    }
    return mips;
  }

  public async loadVectorData(urlOrBuffer: string | ArrayBuffer): Promise<void> {
    if (!this.device || !this.isInitialized) return;
    this.ensureCartographicBuffers();
    try {
      let arrayBuffer: ArrayBuffer;
      if (typeof urlOrBuffer === 'string') {
        const res = await fetch(urlOrBuffer);
        if (!res.ok) return;
        arrayBuffer = await res.arrayBuffer();
      } else {
        arrayBuffer = urlOrBuffer;
      }

      if (!this.device || !this.isInitialized) return;

      const view = new DataView(arrayBuffer);
      const magic = view.getUint32(0, true);
      if (magic !== 0x47564543) {
        return; // 'GVEC'
      }

      const vertexCount = view.getUint32(8, true);
      const indexCount = view.getUint32(12, true);
      const segCount = Math.floor(indexCount / 2);

      let offset = 32;
      const positions = new Float32Array(arrayBuffer, offset, vertexCount * 3);
      offset += vertexCount * 3 * 4;

      const target2D = new Float32Array(arrayBuffer, offset, vertexCount * 2);
      offset += vertexCount * 2 * 4;

      const dymaxion2D = new Float32Array(arrayBuffer, offset, vertexCount * 2);
      offset += vertexCount * 2 * 4;

      const vType = new Float32Array(arrayBuffer, offset, vertexCount * 1);
      offset += vertexCount * 1 * 4;

      const indices = new Uint32Array(arrayBuffer, offset, indexCount);

      const segFloats = new Float32Array(segCount * 16);
      for (let k = 0; k < segCount; k++) {
        const idxA = indices[k * 2 + 0];
        const idxB = indices[k * 2 + 1];
        const base = k * 16;

        segFloats[base + 0] = positions[idxA * 3 + 0];
        segFloats[base + 1] = positions[idxA * 3 + 1];
        segFloats[base + 2] = positions[idxA * 3 + 2];
        segFloats[base + 3] = vType[idxA];

        segFloats[base + 4] = target2D[idxA * 2 + 0];
        segFloats[base + 5] = target2D[idxA * 2 + 1];
        segFloats[base + 6] = dymaxion2D[idxA * 2 + 0];
        segFloats[base + 7] = dymaxion2D[idxA * 2 + 1];

        segFloats[base + 8] = positions[idxB * 3 + 0];
        segFloats[base + 9] = positions[idxB * 3 + 1];
        segFloats[base + 10] = positions[idxB * 3 + 2];
        segFloats[base + 11] = vType[idxB];

        segFloats[base + 12] = target2D[idxB * 2 + 0];
        segFloats[base + 13] = target2D[idxB * 2 + 1];
        segFloats[base + 14] = dymaxion2D[idxB * 2 + 0];
        segFloats[base + 15] = dymaxion2D[idxB * 2 + 1];
      }

      this.vectorSegmentCount = segCount;
      if (this.vectorSegmentBuffer) {
        this.vectorSegmentBuffer.destroy();
      }
      this.vectorSegmentBuffer = this.device.createBuffer({
        size: segFloats.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(this.vectorSegmentBuffer, 0, segFloats.buffer);
    } catch (err) {
      if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
        console.warn('WebGPUEngine.loadVectorData error:', err);
      }
    }
  }

  /**
   * Ingests precomputed binary contour mesh with zero CPU heap re-allocations (M2-T1).
   * Allocates GPU storage and index buffers (contourVertexBuffer, contourIndexBuffer, contourSegmentBuffer)
   * via device.queue.writeBuffer() with total VRAM overhead under 10 MB (~4.48 MB).
   */
  public async loadContourMesh(urlOrBuffer: string | ArrayBuffer): Promise<void> {
    if (!this.device || !this.isInitialized) return;
    this.ensureCartographicBuffers();
    try {
      let arrayBuffer: ArrayBuffer;
      if (typeof urlOrBuffer === 'string') {
        const res = await fetch(urlOrBuffer);
        if (!res.ok) return;
        arrayBuffer = await res.arrayBuffer();
      } else {
        arrayBuffer = urlOrBuffer;
      }

      if (!this.device || !this.isInitialized) return;

      const mesh = decodeContourMesh(arrayBuffer);
      this.contourVertexCount = mesh.header.pointCount;
      this.contourIndexCount = mesh.header.indexCount;

      // Destroy previous contour buffers if already allocated
      if (this.contourVertexBuffer) {
        this.contourVertexBuffer.destroy();
        this.contourVertexBuffer = null;
      }
      if (this.contourIndexBuffer) {
        this.contourIndexBuffer.destroy();
        this.contourIndexBuffer = null;
      }
      if (this.contourSegmentBuffer) {
        this.contourSegmentBuffer.destroy();
        this.contourSegmentBuffer = null;
      }

      // 1. Index Buffer: indexCount * 4 bytes (276,112 bytes for 69,028 uint32s)
      const indexByteLength = this.contourIndexCount * 4;
      this.contourIndexBuffer = this.device.createBuffer({
        size: indexByteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      });
      // Direct zero-copy write from arrayBuffer:
      this.device.queue.writeBuffer(
        this.contourIndexBuffer,
        0,
        mesh.lineIndices.buffer,
        mesh.lineIndices.byteOffset,
        indexByteLength
      );

      // 2. Vertex Buffer (32-byte stride: pos3D xyz + type w, target2D xy + dymaxion2D zw):
      // 69,028 * 32 = 2,208,896 bytes (~2.11 MB)
      const vertByteLength = this.contourVertexCount * 32;
      this.contourVertexBuffer = this.device.createBuffer({
        size: vertByteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });

      const vertFloats = new Float32Array(this.contourVertexCount * 8);
      for (let i = 0; i < this.contourVertexCount; i++) {
        const base = i * 8;
        vertFloats[base + 0] = mesh.positions3D[i * 3 + 0];
        vertFloats[base + 1] = mesh.positions3D[i * 3 + 1];
        vertFloats[base + 2] = mesh.positions3D[i * 3 + 2];
        vertFloats[base + 3] = mesh.typeData[i];

        vertFloats[base + 4] = mesh.target2D[i * 2 + 0];
        vertFloats[base + 5] = mesh.target2D[i * 2 + 1];
        vertFloats[base + 6] = mesh.dymaxion2D[i * 2 + 0];
        vertFloats[base + 7] = mesh.dymaxion2D[i * 2 + 1];
      }
      this.device.queue.writeBuffer(this.contourVertexBuffer, 0, vertFloats.buffer);

      // 3. Segment Buffer (for Vector Ribbon Extrusion: 64 bytes per segment):
      // 34,514 * 64 = 2,208,896 bytes (~2.11 MB)
      const segCount = Math.floor(this.contourIndexCount / 2);
      const segByteLength = segCount * 64;
      this.contourSegmentBuffer = this.device.createBuffer({
        size: segByteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      const segFloats = new Float32Array(segCount * 16);
      for (let k = 0; k < segCount; k++) {
        const idxA = mesh.lineIndices[k * 2 + 0];
        const idxB = mesh.lineIndices[k * 2 + 1];
        const base = k * 16;

        segFloats[base + 0] = mesh.positions3D[idxA * 3 + 0];
        segFloats[base + 1] = mesh.positions3D[idxA * 3 + 1];
        segFloats[base + 2] = mesh.positions3D[idxA * 3 + 2];
        segFloats[base + 3] = mesh.typeData[idxA];

        segFloats[base + 4] = mesh.target2D[idxA * 2 + 0];
        segFloats[base + 5] = mesh.target2D[idxA * 2 + 1];
        segFloats[base + 6] = mesh.dymaxion2D[idxA * 2 + 0];
        segFloats[base + 7] = mesh.dymaxion2D[idxA * 2 + 1];

        segFloats[base + 8] = mesh.positions3D[idxB * 3 + 0];
        segFloats[base + 9] = mesh.positions3D[idxB * 3 + 1];
        segFloats[base + 10] = mesh.positions3D[idxB * 3 + 2];
        segFloats[base + 11] = mesh.typeData[idxB];

        segFloats[base + 12] = mesh.target2D[idxB * 2 + 0];
        segFloats[base + 13] = mesh.target2D[idxB * 2 + 1];
        segFloats[base + 14] = mesh.dymaxion2D[idxB * 2 + 0];
        segFloats[base + 15] = mesh.dymaxion2D[idxB * 2 + 1];
      }
      this.device.queue.writeBuffer(this.contourSegmentBuffer, 0, segFloats.buffer);
    } catch (err) {
      if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
        console.warn('WebGPUEngine.loadContourMesh error:', err);
      }
    }
  }

  /**
   * Renders the loaded contour mesh lines using either vector ribbon extrusion or indexed lines.
   */
  public renderContours(passEncoder: GPURenderPassEncoder): void {
    if (
      this.contourSegmentBuffer &&
      this.vectorRibbonPipeline &&
      this.ribbonBindGroup &&
      this.quadCornerBuffer
    ) {
      passEncoder.setPipeline(this.vectorRibbonPipeline);
      passEncoder.setBindGroup(0, this.ribbonBindGroup);
      passEncoder.setVertexBuffer(0, this.quadCornerBuffer);
      passEncoder.setVertexBuffer(1, this.contourSegmentBuffer);
      passEncoder.draw(4, Math.floor(this.contourIndexCount / 2), 0, 0);
    } else if (
      this.contourVertexBuffer &&
      this.contourIndexBuffer &&
      this.linesRenderPipeline &&
      this.renderBindGroup
    ) {
      passEncoder.setPipeline(this.linesRenderPipeline);
      passEncoder.setBindGroup(0, this.renderBindGroup);
      passEncoder.setVertexBuffer(0, this.contourVertexBuffer);
      passEncoder.setIndexBuffer(this.contourIndexBuffer, 'uint32');
      passEncoder.drawIndexed(this.contourIndexCount);
    }
  }

  /**
   * Loads the NOAA GFS 1.0° wind velocity grid into a 2D float texture (F34).
   */
  public async loadWindTexture(urlOrBuffer: string | ArrayBuffer = '/data/gfs-wind-latest.bin'): Promise<void> {
    if (!this.device || !this.isInitialized) return;

    let buffer: ArrayBuffer | null = null;
    if (urlOrBuffer instanceof ArrayBuffer) {
      buffer = urlOrBuffer;
    } else if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(urlOrBuffer);
        if (res.ok) {
          buffer = await res.arrayBuffer();
        }
      } catch {
        // Fallback below
      }
    }

    if (!buffer && typeof process !== 'undefined' && process.versions?.node) {
      buffer = await loadNodeAssetBuffer(typeof urlOrBuffer === 'string' ? urlOrBuffer : 'public/data/gfs-wind-latest.bin');
    }

    if (!buffer) return;

    const windW = 360;
    const windH = 181;
    const rowBytesRaw = windW * 4; // 1440
    const rowBytesPadded = Math.ceil(rowBytesRaw / 256) * 256; // 1536
    const padded = new Uint8Array(rowBytesPadded * windH);

    const srcU8 = new Uint8Array(buffer);
    for (let y = 0; y < windH; y++) {
      const srcOffset = y * rowBytesRaw;
      const dstOffset = y * rowBytesPadded;
      padded.set(srcU8.subarray(srcOffset, srcOffset + rowBytesRaw), dstOffset);
    }

    if (!this.windTexture) {
      this.windTexture = this.device.createTexture({
        label: 'wind_velocity_texture',
        size: [windW, windH, 1],
        format: 'rg16float',
        usage: (typeof GPUTextureUsage !== 'undefined'
          ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST)
          : (4 | 8)),
      });
      this.windTextureView = this.windTexture.createView();
    }

    try {
      this.device.queue.writeTexture(
        { texture: this.windTexture },
        padded,
        { bytesPerRow: rowBytesPadded, rowsPerImage: windH },
        [windW, windH, 1]
      );
      this.updateWindBindGroups();
    } catch {
      // Mock environment guard
    }
  }

  /**
   * Loads CelesTrak Starlink & ISS TLE records and generates GPU vector line ribbon segments (F35).
   */
  public async loadSatelliteTrajectories(
    urlOrData: string | Array<{ name: string; line1: string; line2: string }> = '/data/tle-starlink.json'
  ): Promise<void> {
    if (!this.device || !this.isInitialized) return;

    let records: Array<{ name: string; line1: string; line2: string }> | null = null;
    if (Array.isArray(urlOrData)) {
      records = urlOrData;
    } else if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(urlOrData);
        if (res.ok) {
          records = await res.json();
        }
      } catch {
        // Fallback
      }
    }

    if (!records && typeof process !== 'undefined' && process.versions?.node) {
      const text = await loadNodeAssetText(typeof urlOrData === 'string' ? urlOrData : 'public/data/tle-starlink.json');
      if (text) {
        try {
          records = JSON.parse(text);
        } catch {
          // Fallback
        }
      }
    }

    if (!records || records.length === 0) return;

    const pointsPerOrbit = 64;
    const totalSegments = records.length * pointsPerOrbit;
    const segFloats = new Float32Array(totalSegments * 16);

    let segIndex = 0;
    for (const record of records) {
      const elements = parseTLE(record.line1, record.line2);
      const periodSec = (2 * Math.PI) / elements.meanMotionRadPerSec;

      for (let i = 0; i < pointsPerOrbit; i++) {
        const tA = (i / pointsPerOrbit) * periodSec;
        const tB = (((i + 1) % pointsPerOrbit) / pointsPerOrbit) * periodSec;

        const posA = propagateOrbitalPosition(elements, tA, 6378.137, 5.0);
        const posB = propagateOrbitalPosition(elements, tB, 6378.137, 5.0);

        const lonA = Math.atan2(posA[0], posA[2]);
        const latA = Math.asin(Math.max(-0.999, Math.min(0.999, posA[1] / 5.0)));
        const target2DA = [lonA * (5.0 / Math.PI), latA * (5.0 / (Math.PI * 0.5))];

        const lonB = Math.atan2(posB[0], posB[2]);
        const latB = Math.asin(Math.max(-0.999, Math.min(0.999, posB[1] / 5.0)));
        const target2DB = [lonB * (5.0 / Math.PI), latB * (5.0 / (Math.PI * 0.5))];

        // Antimeridian Orbit Ribbon Severance:
        // When crossing the 180° antimeridian (|lonB - lonA| > Math.PI),
        // sever the segment to eliminate diagonal screen streaks across the flat map.
        if (Math.abs(lonB - lonA) > Math.PI) {
          continue;
        }

        const base = segIndex * 16;
        segFloats[base + 0] = posA[0];
        segFloats[base + 1] = posA[1];
        segFloats[base + 2] = posA[2];
        segFloats[base + 3] = 0.8; // Satellite ribbon type
        segFloats[base + 4] = target2DA[0];
        segFloats[base + 5] = target2DA[1];
        segFloats[base + 6] = target2DA[0];
        segFloats[base + 7] = target2DA[1];

        segFloats[base + 8] = posB[0];
        segFloats[base + 9] = posB[1];
        segFloats[base + 10] = posB[2];
        segFloats[base + 11] = 0.8;
        segFloats[base + 12] = target2DB[0];
        segFloats[base + 13] = target2DB[1];
        segFloats[base + 14] = target2DB[0];
        segFloats[base + 15] = target2DB[1];

        segIndex++;
      }
    }

    if (this.satelliteSegmentBuffer) {
      this.satelliteSegmentBuffer.destroy();
      this.satelliteSegmentBuffer = null;
    }

    this.satelliteSegmentCount = segIndex;
    const byteLength = this.satelliteSegmentCount * 64;
    try {
      this.satelliteSegmentBuffer = this.device.createBuffer({
        label: 'satellite_orbit_ribbon_buffer',
        size: byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(this.satelliteSegmentBuffer, 0, segFloats.buffer, 0, byteLength);
    } catch {
      // Mock environment guard
    }
  }

  /**
   * Renders the satellite orbit line ribbons using the screen-space vector ribbon pipeline.
   */
  public renderSatelliteOrbits(passEncoder: GPURenderPassEncoder): void {
    if (
      this.satelliteSegmentCount > 0 &&
      this.satelliteSegmentBuffer &&
      this.vectorRibbonPipeline &&
      this.ribbonBindGroup &&
      this.quadCornerBuffer
    ) {
      passEncoder.setPipeline(this.vectorRibbonPipeline);
      passEncoder.setBindGroup(0, this.ribbonBindGroup);
      passEncoder.setVertexBuffer(0, this.quadCornerBuffer);
      passEncoder.setVertexBuffer(1, this.satelliteSegmentBuffer);
      passEncoder.draw(4, this.satelliteSegmentCount, 0, 0);
    }
  }

  public getWindTexture(): GPUTexture | null {
    return this.windTexture;
  }

  public getWindSampler(): GPUSampler | null {
    return this.windSampler;
  }

  public getSatelliteSegmentCount(): number {
    return this.satelliteSegmentCount;
  }

  public getJetStreamTexture(): GPUTexture | null {
    return this.jetStreamTexture;
  }

  public async loadJetStreamTexture(
    urlOrBuffer: string | ArrayBuffer = '/data/gfs-jetstream-latest.bin'
  ): Promise<void> {
    if (!this.device || !this.isInitialized) return;

    let buffer: ArrayBuffer | null = null;
    if (urlOrBuffer instanceof ArrayBuffer) {
      buffer = urlOrBuffer;
    } else if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(urlOrBuffer);
        if (res.ok) buffer = await res.arrayBuffer();
      } catch {
        // Fallback
      }
    }

    if (!buffer && typeof process !== 'undefined' && process.versions?.node) {
      buffer = await loadNodeAssetBuffer(
        typeof urlOrBuffer === 'string' ? urlOrBuffer : 'public/data/gfs-jetstream-latest.bin'
      );
    }

    if (!buffer) return;

    const windW = 360;
    const windH = 181;
    const rowBytesRaw = windW * 4;
    const rowBytesPadded = Math.ceil(rowBytesRaw / 256) * 256;
    const padded = new Uint8Array(rowBytesPadded * windH);

    const srcU8 = new Uint8Array(buffer);
    for (let y = 0; y < windH; y++) {
      const srcOffset = y * rowBytesRaw;
      const dstOffset = y * rowBytesPadded;
      padded.set(srcU8.subarray(srcOffset, srcOffset + rowBytesRaw), dstOffset);
    }

    if (!this.jetStreamTexture) {
      this.jetStreamTexture = this.device.createTexture({
        label: 'jetstream_velocity_texture',
        size: [windW, windH, 1],
        format: 'rg16float',
        usage:
          typeof GPUTextureUsage !== 'undefined'
            ? GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
            : 4 | 8,
      });
      this.jetStreamTextureView = this.jetStreamTexture.createView();
    }

    try {
      this.device.queue.writeTexture(
        { texture: this.jetStreamTexture },
        padded,
        { bytesPerRow: rowBytesPadded, rowsPerImage: windH },
        [windW, windH, 1]
      );
      this.updateWindBindGroups();
    } catch {
      // Mock guard
    }
  }

  public renderWindRibbons(passEncoder: GPURenderPassEncoder): void {
    if (
      !this.windRibbonPipeline ||
      !this.windRibbonBindGroups ||
      !this.quadCornerBuffer
    )
      return;

    const activeBg = this.windRibbonBindGroups[(this.windStep + 1) % 2];
    if (!activeBg) return;

    passEncoder.setPipeline(this.windRibbonPipeline);
    passEncoder.setBindGroup(0, activeBg);
    passEncoder.setVertexBuffer(0, this.quadCornerBuffer);
    passEncoder.draw(4, this.windParticleCount * 3, 0, 0);
  }

  public renderOrigamiCrane(
    passEncoder: GPURenderPassEncoder,
    _params: WebGPUFrameParams
  ): void {
    if (!this.cranePipeline || !this.craneBindGroup || !this.craneUniformBuffer)
      return;

    // Single 84-vertex draw call: vertices 0..41 render the ground shadow; 42..83 render the origami crane geometry
    passEncoder.setPipeline(this.cranePipeline);
    passEncoder.setBindGroup(0, this.craneBindGroup);
    passEncoder.draw(84, 1, 0, 0);
  }

  public releaseOrigamiCrane(
    lon?: number,
    lat?: number,
    altMeters?: number
  ): void {
    this.ensureWindBuffers();
    this.isCraneActive = true;
    if (lon !== undefined && lat !== undefined) {
      this.craneSolver.reset(lon, lat, altMeters ?? 2500);
    } else {
      this.craneSolver.reset(-68.5, -32.5, 2500); // Default: Andes Cordillera wave
    }
  }

  public getCraneState(): CraneState {
    return this.craneSolver.getState();
  }

  public toggleSurfaceWinds(show?: boolean): boolean {
    this.showSurfaceWinds =
      show !== undefined ? show : !this.showSurfaceWinds;
    if (this.showSurfaceWinds) {
      this.ensureWindBuffers();
    }
    return this.showSurfaceWinds;
  }

  public toggleJetStream(show?: boolean): boolean {
    this.showJetStream = show !== undefined ? show : !this.showJetStream;
    if (this.showJetStream) {
      this.ensureWindBuffers();
    }
    return this.showJetStream;
  }

  public setWindSpeedMultiplier(multiplier: number): void {
    this.windSpeedMultiplier = Math.max(0.1, Math.min(10.0, multiplier));
  }

  private updateDepthTexture(width: number, height: number): void {
    if (this.depthTexture) {
      this.depthTexture.destroy();
      this.depthTexture = null;
      this.depthTextureView = null;
    }
    if (!this.device || typeof this.device.createTexture !== 'function') return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    try {
      this.depthTexture = this.device.createTexture({
        size: [w, h],
        format: 'depth24plus',
        usage: typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.RENDER_ATTACHMENT : 16,
      });
      this.depthTextureView = this.depthTexture.createView();
    } catch {
      // Mock environment guard
    }
  }

  private async setupPipelines(): Promise<void> {
    // 1. Create Shader Modules
    const computeShaderModule = this.device.createShaderModule({
      label: 'physics_sim_compute',
      code: physicsSimWGSL,
    });

    const pointsShaderModule = this.device.createShaderModule({
      label: 'points_render',
      code: pointsRenderWGSL,
    });

    const linesShaderModule = this.device.createShaderModule({
      label: 'lines_render',
      code: linesRenderWGSL,
    });

    const swissReliefShaderModule = this.device.createShaderModule({
      label: 'swiss_relief_shading',
      code: swissReliefWGSL,
    });

    const vectorRibbonShaderModule = this.device.createShaderModule({
      label: 'vector_ribbon',
      code: vectorRibbonWGSL,
    });

    const crustHydrosphereShaderModule = this.device.createShaderModule({
      label: 'crust_hydrosphere',
      code: crustHydrosphereWGSL,
    });

    // 2. Bind Group Layouts
    this.computeBindGroupLayout = this.device.createBindGroupLayout({
      label: 'compute_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: {} },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, sampler: {} },
      ],
    });

    const renderBindGroupLayout = this.device.createBindGroupLayout({
      label: 'render_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.reliefBindGroupLayout = this.device.createBindGroupLayout({
      label: 'relief_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.ribbonBindGroupLayout = this.device.createBindGroupLayout({
      label: 'ribbon_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, texture: {} },
        { binding: 2, visibility: GPUShaderStage.VERTEX, sampler: {} },
      ],
    });

    this.crustBindGroupLayout = this.device.createBindGroupLayout({
      label: 'crust_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '2d-array' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    // 3. Compute Pipeline
    const computePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.computeBindGroupLayout],
    });

    this.computePipeline = this.device.createComputePipeline({
      label: 'physics_sim_pipeline',
      layout: computePipelineLayout,
      compute: {
        module: computeShaderModule,
        entryPoint: 'cs_main',
      },
    });

    // 4. Compute Ping-Pong Bind Groups
    this.computeBindGroups[0] = this.device.createBindGroup({
      label: 'compute_bind_group_0_to_1',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffers[0] } },
        { binding: 2, resource: { buffer: this.particleBuffers[1] } },
        { binding: 3, resource: { buffer: this.staticBuffer } },
        { binding: 4, resource: this.windTextureView! },
        { binding: 5, resource: this.windSampler! },
      ],
    });

    this.computeBindGroups[1] = this.device.createBindGroup({
      label: 'compute_bind_group_1_to_0',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffers[1] } },
        { binding: 2, resource: { buffer: this.particleBuffers[0] } },
        { binding: 3, resource: { buffer: this.staticBuffer } },
        { binding: 4, resource: this.windTextureView! },
        { binding: 5, resource: this.windSampler! },
      ],
    });

    // 5. Render Bind Group
    this.renderBindGroup = this.device.createBindGroup({
      label: 'render_bind_group',
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
      ],
    });

    // 6. Common Vertex Buffer Layout (32-byte particle stride, zero-copy)
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 32,
      stepMode: 'vertex',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x4' },
        { shaderLocation: 1, offset: 16, format: 'float32x4' },
      ],
    };

    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout],
    });

    // 7. Points Render Pipeline with Depth Stencil
    this.pointsRenderPipeline = this.device.createRenderPipeline({
      label: 'points_render_pipeline',
      layout: renderPipelineLayout,
      vertex: {
        module: pointsShaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: pointsShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
      primitive: {
        topology: 'point-list',
        cullMode: 'none',
      },
    });

    // 8. Lines Render Pipeline with Depth Stencil
    this.linesRenderPipeline = this.device.createRenderPipeline({
      label: 'lines_render_pipeline',
      layout: renderPipelineLayout,
      vertex: {
        module: linesShaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: linesShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
      primitive: {
        topology: 'line-list',
        cullMode: 'none',
      },
    });

    // 9. Eduard Imhof Swiss Relief Shading Render Pipeline (M1-T2)
    const reliefPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.reliefBindGroupLayout],
    });

    this.swissReliefPipeline = this.device.createRenderPipeline({
      label: 'swiss_relief_pipeline',
      layout: reliefPipelineLayout,
      vertex: {
        module: swissReliefShaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: swissReliefShaderModule,
        entryPoint: 'fs_swiss_relief',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'always',
        format: 'depth24plus',
      },
      primitive: {
        topology: 'triangle-strip',
        cullMode: 'none',
      },
    });

    // 10. Screen-Space Anti-Aliased Vector Line Ribbon Pipeline (M1-T4)
    const ribbonPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.ribbonBindGroupLayout],
    });

    const quadCornerLayout: GPUVertexBufferLayout = {
      arrayStride: 8,
      stepMode: 'vertex',
      attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
    };

    const vectorSegmentLayout: GPUVertexBufferLayout = {
      arrayStride: 64,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 1, offset: 0, format: 'float32x4' },  // posA_3d
        { shaderLocation: 2, offset: 16, format: 'float32x4' }, // posA_target2d
        { shaderLocation: 3, offset: 32, format: 'float32x4' }, // posB_3d
        { shaderLocation: 4, offset: 48, format: 'float32x4' }, // posB_target2d
      ],
    };

    this.vectorRibbonPipeline = this.device.createRenderPipeline({
      label: 'vector_ribbon_pipeline',
      layout: ribbonPipelineLayout,
      vertex: {
        module: vectorRibbonShaderModule,
        entryPoint: 'vs_main',
        buffers: [quadCornerLayout, vectorSegmentLayout],
      },
      fragment: {
        module: vectorRibbonShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
      primitive: {
        topology: 'triangle-strip',
        cullMode: 'none',
      },
    });

    // 11. Dual-Surface Lithosphere Crust & Hydrosphere Pipeline (M1-T3)
    const crustPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.crustBindGroupLayout],
    });

    const dualSurfaceLayout: GPUVertexBufferLayout = {
      arrayStride: 48,
      stepMode: 'vertex',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
        { shaderLocation: 1, offset: 12, format: 'float32x2' }, // uv
        { shaderLocation: 2, offset: 20, format: 'float32' },   // surfaceType
        { shaderLocation: 3, offset: 24, format: 'float32x4' }, // target2D
      ],
    };

    this.crustHydrospherePipeline = this.device.createRenderPipeline({
      label: 'crust_hydrosphere_pipeline',
      layout: crustPipelineLayout,
      vertex: {
        module: crustHydrosphereShaderModule,
        entryPoint: 'vs_main',
        buffers: [dualSurfaceLayout],
      },
      fragment: {
        module: crustHydrosphereShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
    });

    // 12. Atmospheric Wind Compute & Ribbon Pipelines
    try {
      if (this.windParticleBuffers && this.windUniformBuffer && this.windTextureView && this.jetStreamTextureView) {
        const windComputeShaderModule = this.device.createShaderModule({
          label: 'wind_particles_compute',
          code: windParticlesWGSL,
        });

        const windComputeBindGroupLayout = this.device.createBindGroupLayout({
          label: 'wind_compute_bind_group_layout',
          entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: {} },
            { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: {} },
            { binding: 5, visibility: GPUShaderStage.COMPUTE, texture: {} },
          ],
        });

        const windComputePipelineLayout = this.device.createPipelineLayout({
          bindGroupLayouts: [windComputeBindGroupLayout],
        });

        this.windComputePipeline = this.device.createComputePipeline({
          label: 'wind_compute_pipeline',
          layout: windComputePipelineLayout,
          compute: {
            module: windComputeShaderModule,
            entryPoint: 'cs_advect_wind',
          },
        });

        this.windComputeBindGroups = [
          this.device.createBindGroup({
            label: 'wind_compute_bg_0_to_1',
            layout: windComputeBindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: this.windUniformBuffer } },
              { binding: 1, resource: { buffer: this.windParticleBuffers[0] } },
              { binding: 2, resource: { buffer: this.windParticleBuffers[1] } },
              { binding: 3, resource: this.windSampler! },
              { binding: 4, resource: this.windTextureView! },
              { binding: 5, resource: this.jetStreamTextureView! },
            ],
          }),
          this.device.createBindGroup({
            label: 'wind_compute_bg_1_to_0',
            layout: windComputeBindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: this.windUniformBuffer } },
              { binding: 1, resource: { buffer: this.windParticleBuffers[1] } },
              { binding: 2, resource: { buffer: this.windParticleBuffers[0] } },
              { binding: 3, resource: this.windSampler! },
              { binding: 4, resource: this.windTextureView! },
              { binding: 5, resource: this.jetStreamTextureView! },
            ],
          }),
        ];

        // Wind Ribbon Render Pipeline
        const windRibbonShaderModule = this.device.createShaderModule({
          label: 'wind_ribbon_render',
          code: windRibbonRenderWGSL,
        });

        const windRibbonBindGroupLayout = this.device.createBindGroupLayout({
          label: 'wind_ribbon_bind_group_layout',
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          ],
        });

        const windRibbonPipelineLayout = this.device.createPipelineLayout({
          bindGroupLayouts: [windRibbonBindGroupLayout],
        });

        const windQuadCornerLayout: GPUVertexBufferLayout = {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
          ],
        };

        this.windRibbonPipeline = this.device.createRenderPipeline({
          label: 'wind_ribbon_pipeline',
          layout: windRibbonPipelineLayout,
          vertex: {
            module: windRibbonShaderModule,
            entryPoint: 'vs_main',
            buffers: [windQuadCornerLayout],
          },
          fragment: {
            module: windRibbonShaderModule,
            entryPoint: 'fs_main',
            targets: [
              {
                format: this.format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
              },
            ],
          },
          depthStencil: {
            depthWriteEnabled: false,
            depthCompare: 'always',
            format: 'depth24plus',
          },
          primitive: {
            topology: 'triangle-strip',
            cullMode: 'none',
          },
        });

        this.windRibbonBindGroups = [
          this.device.createBindGroup({
            label: 'wind_ribbon_bg_0',
            layout: windRibbonBindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: this.ribbonUniformBuffer } },
              { binding: 1, resource: { buffer: this.windParticleBuffers[0] } },
            ],
          }),
          this.device.createBindGroup({
            label: 'wind_ribbon_bg_1',
            layout: windRibbonBindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: this.ribbonUniformBuffer } },
              { binding: 1, resource: { buffer: this.windParticleBuffers[1] } },
            ],
          }),
        ];
      }
    } catch {
      // Mock environment guard
    }

    // 13. Autonomous Origami Paper Crane Pipeline
    try {
      if (this.craneUniformBuffer) {
        const craneShaderModule = this.device.createShaderModule({
          label: 'origami_crane_shader',
          code: origamiCraneWGSL,
        });

        const craneBindGroupLayout = this.device.createBindGroupLayout({
          label: 'crane_bind_group_layout',
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          ],
        });

        const cranePipelineLayout = this.device.createPipelineLayout({
          bindGroupLayouts: [craneBindGroupLayout],
        });

        this.cranePipeline = this.device.createRenderPipeline({
          label: 'origami_crane_pipeline',
          layout: cranePipelineLayout,
          vertex: {
            module: craneShaderModule,
            entryPoint: 'vs_main',
            buffers: [],
          },
          fragment: {
            module: craneShaderModule,
            entryPoint: 'fs_main',
            targets: [
              {
                format: this.format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
              },
            ],
          },
          depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'always',
            format: 'depth24plus',
          },
          primitive: {
            topology: 'triangle-list',
            cullMode: 'none',
          },
        });

        this.craneBindGroup = this.device.createBindGroup({
          label: 'crane_bind_group',
          layout: craneBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.craneUniformBuffer } },
          ],
        });
      }
    } catch {
      // Mock environment guard
    }
  }

  public updateUniforms(params: WebGPUFrameParams): void {
    if (!this.isInitialized || !this.simUniformBuffer) return;

    const simFloats = this.simFloats;
    const simUints = this.simUints;

    const layerMode = params.layerMode !== undefined ? params.layerMode : (
      params.renderLayers === 'points' ? 1 : params.renderLayers === 'wireframe' ? 2 : 0
    );

    // [0..3]: unfurl, mode, layerMode, time
    simFloats[0] = params.unfurl;
    simUints[1] = params.mode;
    simUints[2] = layerMode;
    simFloats[3] = params.time;

    // [4..7]: cursorActive, numParticles, theme, vortexStrength
    simFloats[4] = params.cursorActive ? 1.0 : 0.0;
    simUints[5] = this.pointCount;
    simUints[6] = params.theme !== undefined ? params.theme : 0;
    simFloats[7] = params.vortexStrength ?? 1.0;

    // [8..11]: cursorHitPos (xyz) + fractureIntensity (w)
    if (params.cursorHitPos) {
      simFloats[8] = params.cursorHitPos.x;
      simFloats[9] = params.cursorHitPos.y;
      simFloats[10] = params.cursorHitPos.z;
    } else {
      simFloats[8] = 0.0;
      simFloats[9] = 0.0;
      simFloats[10] = 0.0;
    }
    simFloats[11] = params.fractureIntensity ?? 1.0;

    // [12..15]: cursorVel (xyz) + speed (w)
    if (params.cursorVel) {
      simFloats[12] = params.cursorVel.x;
      simFloats[13] = params.cursorVel.y;
      simFloats[14] = params.cursorVel.z;
      const speed = 'w' in params.cursorVel ? params.cursorVel.w : Math.hypot(params.cursorVel.x, params.cursorVel.y, params.cursorVel.z);
      simFloats[15] = speed;
    } else {
      simFloats[12] = 0.0;
      simFloats[13] = 0.0;
      simFloats[14] = 0.0;
      simFloats[15] = 0.0;
    }

    // [16..31]: viewMatrix (16 floats)
    params.camera.updateMatrixWorld();
    params.camera.matrixWorldInverse.toArray(simFloats, 16);

    // [32..47]: projectionMatrix (16 floats)
    params.camera.projectionMatrix.toArray(simFloats, 32);

    // [48..51]: cameraPos (xyz) + pad
    simFloats[48] = params.camera.position.x;
    simFloats[49] = params.camera.position.y;
    simFloats[50] = params.camera.position.z;
    simFloats[51] = 1.0;

    this.device.queue.writeBuffer(this.simUniformBuffer, 0, simFloats.buffer);

    // ------------------------------------------------------------------------
    // Swiss Relief Shading Uniforms (M1-T2) (48 bytes, padded to 64 bytes)
    // ------------------------------------------------------------------------
    if (this.reliefUniformBuffer) {
      const rf = this.reliefFloats;
      const ru = this.reliefUints;
      rf[0] = params.sunAzimuth !== undefined ? params.sunAzimuth : 315.0;
      rf[1] = params.sunAltitude !== undefined ? params.sunAltitude : 45.0;
      rf[2] = (params.sunAzimuth !== undefined ? params.sunAzimuth : 315.0) - 90.0;
      rf[3] = (params.sunAltitude !== undefined ? params.sunAltitude : 45.0) * 0.65;
      rf[4] = params.displacementScale !== undefined ? params.displacementScale : 0.08;
      rf[5] = params.hillshadeIntensity !== undefined ? params.hillshadeIntensity : 1.0;
      rf[6] = 1.0 / 2048.0; // u_texelWidth
      rf[7] = 1.0 / 1024.0; // u_texelHeight
      rf[8] = 0.65; // rock cliff exposure factor (u_rockCliffStrength: 0.0 - 1.0)
      rf[9] = params.ambientOcclusion !== undefined ? params.ambientOcclusion : 0.50;
      rf[10] = 0.40; // aerial perspective
      ru[11] = params.theme !== undefined ? params.theme : 0;
      this.device.queue.writeBuffer(this.reliefUniformBuffer, 0, rf.buffer);
    }

    // ------------------------------------------------------------------------
    // Vector Ribbon Uniforms (M1-T4) (240 bytes, padded to 256 bytes)
    // ------------------------------------------------------------------------
    if (this.ribbonUniformBuffer) {
      const ribF = this.ribbonFloats;
      const ribU = this.ribbonUints;
      ribF[0] = params.unfurl;
      ribU[1] = params.mode;
      ribU[2] = params.theme !== undefined ? params.theme : 0;
      ribF[3] = params.time;

      const vpWidth = this.context.canvas?.width || 800;
      const vpHeight = this.context.canvas?.height || 600;
      ribF[4] = vpWidth;
      ribF[5] = vpHeight;
      ribF[6] = 1.0 / vpWidth;
      ribF[7] = 1.0 / vpHeight;

      // cameraPos
      ribF[8] = params.camera.position.x;
      ribF[9] = params.camera.position.y;
      ribF[10] = params.camera.position.z;
      ribF[11] = 1.0;

      // cursorHitPos
      if (params.cursorHitPos) {
        ribF[12] = params.cursorHitPos.x;
        ribF[13] = params.cursorHitPos.y;
        ribF[14] = params.cursorHitPos.z;
      } else {
        ribF[12] = 0.0; ribF[13] = 0.0; ribF[14] = 0.0;
      }
      ribF[15] = 0.0;

      // cursorVel
      if (params.cursorVel) {
        ribF[16] = params.cursorVel.x;
        ribF[17] = params.cursorVel.y;
        ribF[18] = params.cursorVel.z;
        ribF[19] = 'w' in params.cursorVel ? params.cursorVel.w : Math.hypot(params.cursorVel.x, params.cursorVel.y, params.cursorVel.z);
      } else {
        ribF[16] = 0.0; ribF[17] = 0.0; ribF[18] = 0.0; ribF[19] = 0.0;
      }

      ribF[20] = params.cursorActive ? 1.0 : 0.0;
      ribF[21] = params.displacementScale !== undefined ? params.displacementScale : 0.08;
      ribF[22] = 0.85; // u_halfWidthPx (nominal hairline half-width)
      ribF[23] = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1.0 : 1.0, 3.0); // u_dpr
      ribF[24] = 0.1; // u_nearPlane
      ribF[25] = 0.0; ribF[26] = 0.0; ribF[27] = 0.0; // padding

      // u_viewMatrix (offset 112 = 28 floats)
      params.camera.matrixWorldInverse.toArray(ribF, 28);

      // u_projectionMatrix (offset 176 = 44 floats)
      params.camera.projectionMatrix.toArray(ribF, 44);

      this.device.queue.writeBuffer(this.ribbonUniformBuffer, 0, ribF.buffer);
    }

    // ------------------------------------------------------------------------
    // Dual-Surface Lithosphere Crust & Hydrosphere Uniforms (M1-T3) (224 bytes, padded to 256 bytes)
    // ------------------------------------------------------------------------
    if (this.crustUniformBuffer) {
      const cf = this.crustFloats;
      const cu = this.crustUints;

      cf[0] = params.unfurl;
      cu[1] = params.mode;
      cu[2] = params.theme !== undefined ? params.theme : 0;
      cf[3] = params.time;

      const vpWidth = this.context.canvas?.width || 800;
      const vpHeight = this.context.canvas?.height || 600;
      cf[4] = vpWidth;
      cf[5] = vpHeight;
      cf[6] = 1.0 / vpWidth;
      cf[7] = 1.0 / vpHeight;

      // cameraPos (floats 8..11)
      cf[8] = params.camera.position.x;
      cf[9] = params.camera.position.y;
      cf[10] = params.camera.position.z;
      cf[11] = 1.0;

      // cursorHitPos (floats 12..15)
      if (params.cursorHitPos) {
        cf[12] = params.cursorHitPos.x;
        cf[13] = params.cursorHitPos.y;
        cf[14] = params.cursorHitPos.z;
      } else {
        cf[12] = 0.0; cf[13] = 0.0; cf[14] = 0.0;
      }
      cf[15] = 0.0;

      // cursorVel (floats 16..19)
      if (params.cursorVel) {
        cf[16] = params.cursorVel.x;
        cf[17] = params.cursorVel.y;
        cf[18] = params.cursorVel.z;
        const speed = 'w' in params.cursorVel ? params.cursorVel.w : Math.hypot(params.cursorVel.x, params.cursorVel.y, params.cursorVel.z);
        cf[19] = speed;
      } else {
        cf[16] = 0.0; cf[17] = 0.0; cf[18] = 0.0; cf[19] = 0.0;
      }

      cf[20] = params.cursorActive ? 1.0 : 0.0;
      cf[21] = params.displacementScale !== undefined ? params.displacementScale : 0.08;
      cf[22] = params.seaLevel !== undefined ? params.seaLevel : 0.0;
      cf[23] = 0.04; // u_roughness

      // u_viewMatrix (offset 96 = 24 floats)
      params.camera.matrixWorldInverse.toArray(cf, 24);

      // u_projectionMatrix (offset 160 = 40 floats)
      params.camera.projectionMatrix.toArray(cf, 40);

      // Extended Cartographic UI Controls (floats 56..63, offsets 224..252)
      cf[56] = params.sunAzimuth !== undefined ? params.sunAzimuth : 315.0;
      cf[57] = params.sunAltitude !== undefined ? params.sunAltitude : 45.0;
      cf[58] = params.ambientOcclusion !== undefined ? params.ambientOcclusion : 0.65;
      cf[59] = params.waterClarity !== undefined ? params.waterClarity : 0.75;
      cf[60] = params.peakExponent !== undefined ? params.peakExponent : 1.4;
      cf[61] = params.opacity !== undefined ? params.opacity : 1.0;

      let styleCode = 0; // 0 = Architectural / Relief
      if (params.renderStyle === 'hybrid' || params.renderStyle === 'depth') {
        styleCode = 1;
      } else if (params.renderStyle === 'photoreal' || params.renderStyle === 'orbital') {
        styleCode = 2;
      }
      cu[62] = styleCode;
      cf[63] = 0.0; // padding

      this.device.queue.writeBuffer(this.crustUniformBuffer, 0, cf.buffer);
    }

    // ------------------------------------------------------------------------
    // Wind Simulation Uniforms (32 bytes)
    // ------------------------------------------------------------------------
    if (this.windUniformBuffer) {
      const showSurf = params.showSurfaceWinds !== undefined ? (params.showSurfaceWinds ? 1.0 : 0.0) : (this.showSurfaceWinds ? 1.0 : 0.0);
      const showJet = params.showJetStream !== undefined ? (params.showJetStream ? 1.0 : 0.0) : (this.showJetStream ? 1.0 : 0.0);
      const windU = new Float32Array(8);
      const windU32 = new Uint32Array(windU.buffer);
      windU[0] = params.unfurl;
      windU32[1] = params.mode;
      windU[2] = params.time;
      windU[3] = params.dt;
      windU32[4] = this.windParticleCount;
      windU[5] = this.windSpeedMultiplier;
      windU[6] = showSurf;
      windU[7] = showJet;
      this.device.queue.writeBuffer(this.windUniformBuffer, 0, windU.buffer);
    }

    // ------------------------------------------------------------------------
    // Autonomous Origami Paper Crane Uniforms (240 bytes)
    // ------------------------------------------------------------------------
    if ((this.isCraneActive || params.showCrane) && this.craneUniformBuffer) {
      this.craneSolver.step({
        dt: params.dt,
        unfurl: params.unfurl,
        mode: params.mode as any,
      });

      const cart = this.craneSolver.computeCartographicState(params.unfurl, params.mode as any);
      const state = this.craneSolver.getState();
      const cf = this.craneUniformFloats;

      // [0..3]: worldPos (xyz) + wingFlex (w)
      cf[0] = cart.worldPos[0];
      cf[1] = cart.worldPos[1];
      cf[2] = cart.worldPos[2];
      cf[3] = state.wingFlex;

      // [4..7]: forward (xyz) + airspeed (w)
      cf[4] = cart.forwardVec[0];
      cf[5] = cart.forwardVec[1];
      cf[6] = cart.forwardVec[2];
      cf[7] = state.airspeed;

      // [8..11]: up (xyz) + variometer (w)
      cf[8] = cart.upVec[0];
      cf[9] = cart.upVec[1];
      cf[10] = cart.upVec[2];
      cf[11] = state.variometer;

      // [12..15]: right (xyz) + roll (w)
      cf[12] = cart.rightVec[0];
      cf[13] = cart.rightVec[1];
      cf[14] = cart.rightVec[2];
      cf[15] = state.roll;

      // [16..19]: shadowPos (xyz on terrain/sphere) + altitude (w)
      const normLen = Math.hypot(cart.worldPos[0], cart.worldPos[1], cart.worldPos[2]) || 1.0;
      const shadowR = 5.004;
      cf[16] = (cart.worldPos[0] / normLen) * shadowR;
      cf[17] = (cart.worldPos[1] / normLen) * shadowR;
      cf[18] = (cart.worldPos[2] / normLen) * shadowR;
      cf[19] = state.altitude;

      // [20..35]: viewMatrix
      params.camera.updateMatrixWorld?.();
      params.camera.matrixWorldInverse.toArray(cf, 20);

      // [36..51]: projectionMatrix
      params.camera.projectionMatrix.toArray(cf, 36);

      // [52..55]: cameraPos
      cf[52] = params.camera.position.x;
      cf[53] = params.camera.position.y;
      cf[54] = params.camera.position.z;
      cf[55] = 1.0;

      // [56..59]: theme, isShadowPass, unfurl, pad1
      const cu = new Uint32Array(cf.buffer, cf.byteOffset, 60);
      cu[56] = params.theme !== undefined ? params.theme : 0;
      cu[57] = 0;
      cf[58] = params.unfurl;
      cf[59] = 0.0;

      this.device.queue.writeBuffer(this.craneUniformBuffer, 0, cf.buffer);
    }
  }

  public render(params: WebGPUFrameParams): void {
    if (!this.isInitialized) return;

    // Ensure depth texture matches current canvas dimensions
    const canvasWidth = this.context.canvas?.width || 800;
    const canvasHeight = this.context.canvas?.height || 600;
    if (!this.depthTexture || this.depthTexture.width !== canvasWidth || this.depthTexture.height !== canvasHeight) {
      this.updateDepthTexture(canvasWidth, canvasHeight);
    }

    // 1. Ensure cartographic buffers if relief or vectors are active
    if (params.reliefActive || params.showRelief || params.showVectors) {
      this.ensureCartographicBuffers();
    }

    // 1b. Ensure wind and origami crane buffers lazily on-demand
    if (
      params.showWind ||
      params.showSurfaceWinds ||
      params.showJetStream ||
      params.showCrane ||
      this.isCraneActive
    ) {
      this.ensureWindBuffers();
    }

    // 2. Update Sim, Relief, Ribbon, Wind, and Crane Uniforms
    this.updateUniforms(params);

    // 2. Begin Frame Command Encoding
    const commandEncoder = this.device.createCommandEncoder();

    // Pass 1: Compute Simulation Pass
    const computePass = commandEncoder.beginComputePass({
      timestampWrites: this.profiler?.getComputeTimestampWrites(0),
    });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroups[this.currentStep % 2]);
    const workgroupCount = Math.min(65535, Math.ceil(this.pointCount / 256));
    computePass.dispatchWorkgroups(workgroupCount, 1, 1);

    // Pass 1b: Atmospheric Wind Particle Advection Compute Dispatch
    const showSurf = params.showSurfaceWinds !== undefined ? params.showSurfaceWinds : this.showSurfaceWinds;
    const showJet = params.showJetStream !== undefined ? params.showJetStream : this.showJetStream;
    if (
      this.windComputePipeline &&
      this.windComputeBindGroups &&
      params.showWind !== false &&
      (showSurf || showJet)
    ) {
      computePass.setPipeline(this.windComputePipeline);
      computePass.setBindGroup(0, this.windComputeBindGroups[this.windStep % 2]);
      const windWgCount = Math.min(65535, Math.ceil(this.windParticleCount / 256));
      computePass.dispatchWorkgroups(windWgCount, 1, 1);
    }
    computePass.end();

    // Pass 2: Consolidated Single Render Pass (TBDR on-chip optimization)
    const outBuffer = this.particleBuffers[(this.currentStep + 1) % 2];
    const layerMode = params.layerMode !== undefined ? params.layerMode : (
      params.renderLayers === 'points' ? 1 : params.renderLayers === 'wireframe' ? 2 : 0
    );

    const isLight = params.theme === 1;
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: isLight
            ? { r: 0.973, g: 0.980, b: 0.988, a: 1.0 } // #F8FAFC archival paper
            : { r: 0.008, g: 0.016, b: 0.031, a: 1.0 }, // #020408 obsidian
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: this.depthTextureView
        ? {
            view: this.depthTextureView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          }
        : undefined,
      timestampWrites: this.profiler?.getRenderTimestampWrites(0),
    });

    // 1. Dual-Surface Lithosphere Crust & Liquid Hydrosphere (M1-T3)
    // 3D tessellated sphere grid with Jerlov radiative transfer, Kubelka-Munk reflectance & micro-ripples
    if (
      (params.reliefActive || params.showRelief) &&
      this.crustHydrospherePipeline &&
      this.crustBindGroup &&
      this.crustVertexBuffer &&
      this.crustIndexBuffer &&
      this.crustIndexCount > 0
    ) {
      renderPass.setPipeline(this.crustHydrospherePipeline);
      renderPass.setBindGroup(0, this.crustBindGroup);
      renderPass.setVertexBuffer(0, this.crustVertexBuffer);
      renderPass.setIndexBuffer(this.crustIndexBuffer, 'uint32');
      const indexCountToDraw = (params.renderStyle === 'architectural' || params.renderStyle === 'photoreal')
        ? Math.floor(this.crustIndexCount / 2)
        : this.crustIndexCount;
      renderPass.drawIndexed(indexCountToDraw);
    }

    // 2. Render Wireframe Lines
    // In photoreal orbital mode, suppress default wireframe lines so water bodies do not have a floating wireframe net
    const showLines = params.renderStyle === 'photoreal'
      ? layerMode === 2 // Only if explicitly set to wireframe-only
      : (layerMode === 0 || layerMode === 2);

    if (showLines) {
      renderPass.setPipeline(this.linesRenderPipeline);
      renderPass.setBindGroup(0, this.renderBindGroup);
      renderPass.setVertexBuffer(0, outBuffer);
      renderPass.setIndexBuffer(this.lineIndexBuffer, 'uint32');
      renderPass.drawIndexed(this.lineIndexCount);
    }

    // 3. Render Screen-Space Anti-Aliased Vector Line Ribbons (M1-T4)
    if (
      params.showVectors &&
      this.vectorSegmentCount > 0 &&
      this.vectorRibbonPipeline &&
      this.ribbonBindGroup &&
      this.quadCornerBuffer &&
      this.vectorSegmentBuffer
    ) {
      renderPass.setPipeline(this.vectorRibbonPipeline);
      renderPass.setBindGroup(0, this.ribbonBindGroup);
      renderPass.setVertexBuffer(0, this.quadCornerBuffer);
      renderPass.setVertexBuffer(1, this.vectorSegmentBuffer);
      renderPass.draw(4, this.vectorSegmentCount, 0, 0);
    }

    // 3b. Render Isoline Contours (M2-T1)
    if (params.showContours && this.contourIndexCount > 0) {
      this.renderContours(renderPass);
    }

    // 3c. Render Satellite Orbit Line Ribbons (F35)
    if (
      (params.showSatellites || params.showStarlink) &&
      this.satelliteSegmentCount > 0
    ) {
      this.renderSatelliteOrbits(renderPass);
    }

    // 3d. Render Atmospheric Wind Streamline Ribbons
    if (
      params.showWind !== false &&
      (showSurf || showJet) &&
      this.windRibbonPipeline &&
      this.windRibbonBindGroups &&
      this.quadCornerBuffer
    ) {
      this.renderWindRibbons(renderPass);
    }

    // 3e. Render Autonomous Origami Paper Crane & Ground Shadow
    if (
      (this.isCraneActive || params.showCrane) &&
      this.cranePipeline &&
      this.craneBindGroup &&
      this.craneUniformBuffer
    ) {
      this.renderOrigamiCrane(renderPass, params);
    }

    // 4. Render Point Sprites
    if (layerMode === 0 || layerMode === 1) {
      renderPass.setPipeline(this.pointsRenderPipeline);
      renderPass.setBindGroup(0, this.renderBindGroup);
      renderPass.setVertexBuffer(0, outBuffer);
      renderPass.draw(this.pointCount);
    }

    renderPass.end();

    // Resolve Profiler Frame Queries (Non-blocking async triple-buffered)
    this.profiler?.resolveFrame(commandEncoder);

    // Submit Commands to GPU Queue
    this.device.queue.submit([commandEncoder.finish()]);

    // Swap Ping-Pong Step
    this.currentStep++;
    this.windStep++;
  }

  public resize(width: number, height: number): void {
    if (!this.isInitialized || !this.context) return;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });
    this.updateDepthTexture(width, height);
  }

  public onDeviceLost(callback: (info: GPUDeviceLostInfo) => void): void {
    this.onDeviceLostCallback = callback;
  }

  public dispose(): void {
    if (!this.isInitialized) return;
    this.onDeviceLostCallback = undefined;
    this.profiler?.dispose();
    this.profiler = null;
    this.particleBuffers[0]?.destroy();
    this.particleBuffers[1]?.destroy();
    this.particleBuffers = [null!, null!];
    this.staticBuffer?.destroy();
    this.staticBuffer = null!;
    this.lineIndexBuffer?.destroy();
    this.lineIndexBuffer = null!;
    this.simUniformBuffer?.destroy();
    this.simUniformBuffer = null!;
    this.reliefUniformBuffer?.destroy();
    this.reliefUniformBuffer = null!;
    this.quadCornerBuffer?.destroy();
    this.quadCornerBuffer = null!;
    this.vectorSegmentBuffer?.destroy();
    this.vectorSegmentBuffer = null!;
    this.vectorSegmentCount = 0;
    this.ribbonUniformBuffer?.destroy();
    this.ribbonUniformBuffer = null!;
    this.crustUniformBuffer?.destroy();
    this.crustUniformBuffer = null!;
    this.crustVertexBuffer?.destroy();
    this.crustVertexBuffer = null;
    this.crustIndexBuffer?.destroy();
    this.crustIndexBuffer = null;
    this.crustIndexCount = 0;
    this.contourVertexBuffer?.destroy();
    this.contourVertexBuffer = null;
    this.contourIndexBuffer?.destroy();
    this.contourIndexBuffer = null;
    this.contourSegmentBuffer?.destroy();
    this.contourSegmentBuffer = null;
    this.contourVertexCount = 0;
    this.contourIndexCount = 0;
    this.demTexture?.destroy();
    this.demTexture = null;
    this.demTextureView = null;
    this.orbitalTexture?.destroy();
    this.orbitalTexture = null;
    this.orbitalTextureView = null;
    this.orbitalSampler = null;
    this.spawnPipeline = null;
    this.spawnBindGroupLayout = null;
    this.depthTexture?.destroy();
    this.depthTexture = null;
    this.depthTextureView = null;
    this.reliefBindGroup = null!;
    this.ribbonBindGroup = null!;
    this.crustBindGroup = null!;
    this.renderBindGroup = null!;
    this.computeBindGroups = [null!, null!];
    this.satelliteSegmentBuffer?.destroy();
    this.satelliteSegmentBuffer = null;
    this.satelliteSegmentCount = 0;
    this.windTexture?.destroy();
    this.windTexture = null;
    this.windTextureView = null;
    this.windSampler = null;
    this.jetStreamTexture?.destroy();
    this.jetStreamTexture = null;
    this.jetStreamTextureView = null;
    if (this.windParticleBuffers) {
      this.windParticleBuffers[0]?.destroy();
      this.windParticleBuffers[1]?.destroy();
      this.windParticleBuffers = null;
    }
    this.windUniformBuffer?.destroy();
    this.windUniformBuffer = null;
    this.craneUniformBuffer?.destroy();
    this.craneUniformBuffer = null;
    this.windComputePipeline = null;
    this.windComputeBindGroups = null;
    this.windRibbonPipeline = null;
    this.windRibbonBindGroups = null;
    this.cranePipeline = null;
    this.craneBindGroup = null;
    this.device?.destroy?.();
    this.isInitialized = false;
  }
}
