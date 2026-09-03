// ============================================================================
// File: src/webgpu/WebGPUEngine.ts
// Architecture: Autonomous 1,000,000-Node WebGPU Compute & Render Subsystem
// Description: Dedicated WGSL compute advection with zero-copy vertex rendering
// ============================================================================

import * as THREE from 'three';
import { isWebGPUSupported } from './support';
import { projectToDymaxion2D } from '../utils/dymaxion';

export { isWebGPUSupported };

import physicsSimWGSL from './shaders/physics_sim.wgsl?raw';
import pointsRenderWGSL from './shaders/points_render.wgsl?raw';
import linesRenderWGSL from './shaders/lines_render.wgsl?raw';

export interface WebGPUInitConfig {
  canvas: HTMLCanvasElement;
  pointCount: number;
  pointsData: Float32Array;   // 3 * N (xyz)
  target2DData: Float32Array; // 2 * N (xy)
  typeData: Float32Array;     // N (vType)
  lineIndices: Uint32Array;   // 2 * M (line segment index pairs)
  dymaxion2DData?: Float32Array; // 2 * N (xy Dymaxion target)
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
}

export class WebGPUEngine {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  private particleBuffers: [GPUBuffer, GPUBuffer] = [null!, null!];
  private lineIndexBuffer!: GPUBuffer;
  private lineIndexCount: number = 0;
  private pointCount: number = 0;

  private simUniformBuffer!: GPUBuffer;

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

    this.device = await adapter.requestDevice();

    this.device.lost?.then((info) => {
      this.isInitialized = false;
      this.onDeviceLostCallback?.(info);
    }).catch(() => {});

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

    // 1. Pack and Upload Interleaved Particle Buffer (64 bytes / node = 16 floats / node)
    const particleFloatCount = this.pointCount * 16;
    const initialParticles = new Float32Array(particleFloatCount);

    for (let i = 0; i < this.pointCount; i++) {
      const base = i * 16;
      // position (xyz) + pointType (w)
      initialParticles[base + 0] = config.pointsData[i * 3 + 0];
      initialParticles[base + 1] = config.pointsData[i * 3 + 1];
      initialParticles[base + 2] = config.pointsData[i * 3 + 2];
      initialParticles[base + 3] = config.typeData[i];

      // velocity (xyz) + metric (w)
      initialParticles[base + 4] = 0.0;
      initialParticles[base + 5] = 0.0;
      initialParticles[base + 6] = 0.0;
      initialParticles[base + 7] = 0.0;

      // rest_sphere (xyz) + rest_radius (w)
      initialParticles[base + 8] = config.pointsData[i * 3 + 0];
      initialParticles[base + 9] = config.pointsData[i * 3 + 1];
      initialParticles[base + 10] = config.pointsData[i * 3 + 2];
      initialParticles[base + 11] = 5.0;

      // rest_map (xy: Mercator 2D, zw: Dymaxion 2D)
      initialParticles[base + 12] = config.target2DData[i * 2 + 0];
      initialParticles[base + 13] = config.target2DData[i * 2 + 1];
      if (config.dymaxion2DData) {
        initialParticles[base + 14] = config.dymaxion2DData[i * 2 + 0];
        initialParticles[base + 15] = config.dymaxion2DData[i * 2 + 1];
      } else {
        const [dymU, dymV] = projectToDymaxion2D([
          config.pointsData[i * 3 + 0],
          config.pointsData[i * 3 + 1],
          config.pointsData[i * 3 + 2]
        ]);
        initialParticles[base + 14] = dymU;
        initialParticles[base + 15] = dymV;
      }
    }

    const bufferByteSize = initialParticles.byteLength;

    // Create Ping-Pong Storage Buffers (Buffer A & Buffer B)
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

    // 2. Index Buffer for Line Segments (Must use exact byteOffset and byteLength to prevent ArrayBuffer overflow)
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

    // 3. Sim Uniform Buffer (256 bytes, 16-byte aligned)
    this.simUniformBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 4. Setup Pipelines & BindGroups
    await this.setupPipelines();
    this.currentStep = 0;
    this.isInitialized = true;
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

    // 2. Bind Group Layouts
    const computeBindGroupLayout = this.device.createBindGroupLayout({
      label: 'compute_bind_group_layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
      ],
    });

    const renderBindGroupLayout = this.device.createBindGroupLayout({
      label: 'render_bind_group_layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
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
      ],
    });

    this.computeBindGroups[1] = this.device.createBindGroup({
      label: 'compute_bind_group_1_to_0',
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffers[1] } },
        { binding: 2, resource: { buffer: this.particleBuffers[0] } },
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

    // 6. Common Vertex Buffer Layout (64-byte particle stride, zero-copy)
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 64,
      stepMode: 'vertex',
      attributes: [
        {
          shaderLocation: 0,
          offset: 0,
          format: 'float32x4', // position (xyz) + pointType (w)
        },
        {
          shaderLocation: 1,
          offset: 16,
          format: 'float32x4', // velocity (xyz) + metric (w)
        },
        {
          shaderLocation: 2,
          offset: 32,
          format: 'float32x4', // rest_sphere (xyz) + radius (w)
        },
        {
          shaderLocation: 3,
          offset: 48,
          format: 'float32x4', // rest_map (xy: target2D, zw: dymaxion2D)
        },
      ],
    };

    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout],
    });

    // 7. Points Render Pipeline
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
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'point-list',
        cullMode: 'none',
      },
    });

    // 8. Lines Render Pipeline
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
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'line-list',
        cullMode: 'none',
      },
    });
  }

  public updateUniforms(params: WebGPUFrameParams): void {
    if (!this.isInitialized || !this.simUniformBuffer) return;

    const simFloats = new Float32Array(64);
    const simUints = new Uint32Array(simFloats.buffer);

    const layerMode = params.layerMode !== undefined ? params.layerMode : (
      params.renderLayers === 'points' ? 1 : params.renderLayers === 'wireframe' ? 2 : 0
    );

    // [0..3]: unfurl, mode, layerMode, time
    simFloats[0] = params.unfurl;
    simUints[1] = params.mode;
    simUints[2] = layerMode;
    simFloats[3] = params.time;

    // [4..7]: dt, cursorActive, numParticles, pad1
    simFloats[4] = params.dt;
    simFloats[5] = params.cursorActive ? 1.0 : 0.0;
    simUints[6] = this.pointCount;
    simUints[7] = params.theme !== undefined ? params.theme : 0; // 0 = Dark, 1 = Light Monochrome

    // [8..11]: cursorRayOrig
    if (params.cursorRayOrig) {
      simFloats[8] = params.cursorRayOrig.x;
      simFloats[9] = params.cursorRayOrig.y;
      simFloats[10] = params.cursorRayOrig.z;
    }
    simFloats[11] = 0.0;

    // [12..15]: cursorRayDir
    if (params.cursorRayDir) {
      simFloats[12] = params.cursorRayDir.x;
      simFloats[13] = params.cursorRayDir.y;
      simFloats[14] = params.cursorRayDir.z;
    }
    simFloats[15] = 0.0;

    // [16..19]: cursorHitPos
    if (params.cursorHitPos) {
      simFloats[16] = params.cursorHitPos.x;
      simFloats[17] = params.cursorHitPos.y;
      simFloats[18] = params.cursorHitPos.z;
    }
    simFloats[19] = 0.0;

    // [20..23]: cursorVel (xyz) + speed (w)
    if (params.cursorVel) {
      simFloats[20] = params.cursorVel.x;
      simFloats[21] = params.cursorVel.y;
      simFloats[22] = params.cursorVel.z;
      const speed = 'w' in params.cursorVel ? params.cursorVel.w : Math.hypot(params.cursorVel.x, params.cursorVel.y, params.cursorVel.z);
      simFloats[23] = speed;
    } else {
      simFloats[20] = 0.0;
      simFloats[21] = 0.0;
      simFloats[22] = 0.0;
      simFloats[23] = 0.0;
    }

    // [24..39]: viewMatrix (16 floats)
    params.camera.updateMatrixWorld();
    params.camera.matrixWorldInverse.toArray(simFloats, 24);

    // [40..55]: projectionMatrix (16 floats)
    params.camera.projectionMatrix.toArray(simFloats, 40);

    // [56..59]: cameraPos (xyz) + pad
    simFloats[56] = params.camera.position.x;
    simFloats[57] = params.camera.position.y;
    simFloats[58] = params.camera.position.z;
    simFloats[59] = 1.0;

    this.device.queue.writeBuffer(this.simUniformBuffer, 0, simFloats.buffer);
  }

  public render(params: WebGPUFrameParams): void {
    if (!this.isInitialized) return;

    // 1. Update Sim Uniforms
    this.updateUniforms(params);

    // 2. Begin Frame Command Encoding
    const commandEncoder = this.device.createCommandEncoder();

    // Pass 1: Compute Simulation Pass
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroups[this.currentStep % 2]);
    const workgroupCount = Math.ceil(this.pointCount / 256);
    computePass.dispatchWorkgroups(workgroupCount, 1, 1);
    computePass.end();

    // Pass 2: Zero-Copy Render Pass
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
    });

    renderPass.setBindGroup(0, this.renderBindGroup);

    // Render Wireframe Lines
    if (layerMode === 0 || layerMode === 2) {
      renderPass.setPipeline(this.linesRenderPipeline);
      renderPass.setVertexBuffer(0, outBuffer);
      renderPass.setIndexBuffer(this.lineIndexBuffer, 'uint32');
      renderPass.drawIndexed(this.lineIndexCount);
    }

    // Render Point Sprites
    if (layerMode === 0 || layerMode === 1) {
      renderPass.setPipeline(this.pointsRenderPipeline);
      renderPass.setVertexBuffer(0, outBuffer);
      renderPass.draw(this.pointCount);
    }

    renderPass.end();

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
  }

  public onDeviceLost(callback: (info: GPUDeviceLostInfo) => void): void {
    this.onDeviceLostCallback = callback;
  }

  public dispose(): void {
    if (!this.isInitialized) return;
    this.onDeviceLostCallback = undefined;
    this.particleBuffers[0]?.destroy();
    this.particleBuffers[1]?.destroy();
    this.lineIndexBuffer?.destroy();
    this.simUniformBuffer?.destroy();
    this.device?.destroy?.();
    this.isInitialized = false;
  }
}
