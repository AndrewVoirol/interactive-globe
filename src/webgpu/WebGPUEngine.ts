// ============================================================================
// File: src/webgpu/WebGPUEngine.ts
// Architecture: Autonomous 1,000,000-Node WebGPU Compute & Render Subsystem
// Description: Dedicated WGSL compute advection with zero-copy vertex rendering,
//              Eduard Imhof Swiss relief shading, Jerlov hydrosphere radiative transfer,
//              and screen-space anti-aliased vector ribbons on Apple Silicon M4 Pro.
// ============================================================================

import * as THREE from 'three';
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
import { GPUProfiler } from './profiling/GPUProfiler';

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
  cursorRayOrig?: THREE.Vector3;
  cursorRayDir?: THREE.Vector3;
  cursorHitPos?: THREE.Vector3;
  cursorVel?: THREE.Vector3 | THREE.Vector4;
  cursorActive?: boolean;
  camera: THREE.PerspectiveCamera | THREE.Camera;
  renderLayers?: 'both' | 'points' | 'wireframe';
  displacementScale?: number;
  hillshadeIntensity?: number;
  reliefActive?: boolean;
  showRelief?: boolean;
  showVectors?: boolean;
  showContours?: boolean;
  seaLevel?: number;
  sunAzimuth?: number;
  sunAltitude?: number;
  ambientOcclusion?: number;
  waterClarity?: number;
  peakExponent?: number;
  opacity?: number;
  renderStyle?: 'architectural' | 'hybrid' | 'photoreal' | string;
  pointScaleMultiplier?: number;
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
  private pointsRenderPipeline!: GPURenderPipeline;
  private linesRenderPipeline!: GPURenderPipeline;

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
    if (this.crustBindGroupLayout && this.crustUniformBuffer) {
      this.crustBindGroup = this.device.createBindGroup({
        label: 'crust_hydrosphere_bind_group',
        layout: this.crustBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.crustUniformBuffer } },
          { binding: 1, resource: this.demTextureView },
          { binding: 2, resource: this.demSampler },
        ],
      });
    }
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

      // Buffer ingestion
      if (!this.device || !this.isInitialized) return;
      const byteLength = urlOrBuffer.byteLength;
      const oldTexture = this.demTexture;
      if (byteLength === 16777216) {
        // Full-range 16-bit uint16 texture (2048 x 1024 x 4 x 2 bytes = 16 MB)
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
              const newTexture = this.device.createTexture({
                size: [2048, 1024, 1],
                format: 'rgba16unorm',
                usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
              });
              this.device.queue.writeTexture(
                { texture: newTexture },
                urlOrBuffer,
                { bytesPerRow: 2048 * 8, rowsPerImage: 1024 },
                [2048, 1024, 1]
              );
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
            const newTexture = this.device.createTexture({
              size: [2048, 1024, 1],
              format: 'rgba16unorm',
              usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
            });
            this.device.queue.writeTexture(
              { texture: newTexture },
              urlOrBuffer,
              { bytesPerRow: 2048 * 8, rowsPerImage: 1024 },
              [2048, 1024, 1]
            );
            this.demTexture = newTexture;
            this.demTextureView = this.demTexture.createView();
            if (oldTexture) oldTexture.destroy();
            this.updateDEMBindGroups();
            loaded = true;
          } catch {}
        }

        if (!loaded) {
          // Graceful downsample 16-bit uint16 to 8-bit rgba8unorm if tier1 is unavailable
          const u16 = new Uint16Array(urlOrBuffer);
          const u8 = new Uint8Array(2048 * 1024 * 4);
          for (let i = 0; i < u16.length; i++) {
            u8[i] = u16[i] >> 8;
          }
          const newTexture = this.device.createTexture({
            size: [2048, 1024, 1],
            format: 'rgba8unorm',
            usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
          });
          this.device.queue.writeTexture(
            { texture: newTexture },
            u8,
            { bytesPerRow: 2048 * 4, rowsPerImage: 1024 },
            [2048, 1024, 1]
          );
          this.demTexture = newTexture;
          this.demTextureView = this.demTexture.createView();
          if (oldTexture) oldTexture.destroy();
          this.updateDEMBindGroups();
        }
      } else if (byteLength > 0) {
        // Fallback 8-bit texture ingestion or test mock buffer
        const width = 2048;
        const height = 1024;
        const newTexture = this.device.createTexture({
          size: [width, height, 1],
          format: 'rgba8unorm',
          usage: (typeof GPUTextureUsage !== 'undefined' ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) : (4 | 8)),
        });

        this.device.queue.writeTexture(
          { texture: newTexture },
          urlOrBuffer,
          { bytesPerRow: width * 4, rowsPerImage: height },
          [width, height, 1]
        );
        this.demTexture = newTexture;
        this.demTextureView = this.demTexture.createView();
        if (oldTexture) oldTexture.destroy();
        this.updateDEMBindGroups();
      }
    } catch (err) {
      console.warn('WebGPUEngine.loadDEMTexture encountered non-fatal error; retaining fallback texture:', err);
    }
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
    const computeBindGroupLayout = this.device.createBindGroupLayout({
      label: 'compute_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
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
      ],
    });

    // 3. Compute Pipeline
    const computePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
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
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffers[0] } },
        { binding: 2, resource: { buffer: this.particleBuffers[1] } },
        { binding: 3, resource: { buffer: this.staticBuffer } },
      ],
    });

    this.computeBindGroups[1] = this.device.createBindGroup({
      label: 'compute_bind_group_1_to_0',
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffers[1] } },
        { binding: 2, resource: { buffer: this.particleBuffers[0] } },
        { binding: 3, resource: { buffer: this.staticBuffer } },
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

    // [4..7]: cursorActive, numParticles, theme, pad1
    simFloats[4] = params.cursorActive ? 1.0 : 0.0;
    simUints[5] = this.pointCount;
    simUints[6] = params.theme !== undefined ? params.theme : 0;
    simFloats[7] = 0.0;

    // [8..11]: cursorHitPos
    if (params.cursorHitPos) {
      simFloats[8] = params.cursorHitPos.x;
      simFloats[9] = params.cursorHitPos.y;
      simFloats[10] = params.cursorHitPos.z;
    } else {
      simFloats[8] = 0.0;
      simFloats[9] = 0.0;
      simFloats[10] = 0.0;
    }
    simFloats[11] = 0.0;

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
      rf[0] = 315.0; // Primary NW azimuth
      rf[1] = 45.0;  // Primary altitude
      rf[2] = 225.0; // Fill SW azimuth
      rf[3] = 35.0;  // Fill altitude
      rf[4] = params.displacementScale !== undefined ? params.displacementScale : 0.08;
      rf[5] = params.hillshadeIntensity !== undefined ? params.hillshadeIntensity : 1.0;
      rf[6] = 1.0 / 2048.0; // u_texelWidth
      rf[7] = 1.0 / 1024.0; // u_texelHeight
      rf[8] = 0.65; // rock cliff exposure factor
      rf[9] = 0.50; // ambient occlusion
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
      ribF[22] = 0.35; // u_halfWidthPx (nominal hairline half-width)
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

    // 2. Update Sim, Relief, and Ribbon Uniforms
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
      const indexCountToDraw = params.renderStyle === 'architectural'
        ? Math.floor(this.crustIndexCount / 2)
        : this.crustIndexCount;
      renderPass.drawIndexed(indexCountToDraw);
    }

    // 2. Render Wireframe Lines
    if (layerMode === 0 || layerMode === 2) {
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
    this.staticBuffer?.destroy();
    this.lineIndexBuffer?.destroy();
    this.simUniformBuffer?.destroy();
    this.reliefUniformBuffer?.destroy();
    this.quadCornerBuffer?.destroy();
    this.vectorSegmentBuffer?.destroy();
    this.ribbonUniformBuffer?.destroy();
    this.crustUniformBuffer?.destroy();
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
    this.depthTexture?.destroy();
    this.depthTexture = null;
    this.depthTextureView = null;
    this.cartographicBuffersInitialized = false;
    this.cachedInitConfig = null;
    this.device?.destroy?.();
    this.isInitialized = false;
  }
}
