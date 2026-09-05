// ============================================================================
// File: src/webgpu/WebGPUBenchmark.ts
// Architecture: Empirical WebGPU Benchmarking Harness for Apple Silicon M4 Pro
// Description: Measures compute dispatch times, memory allocation, and frame delivery across 100k to 16M nodes
// ============================================================================

export interface BenchmarkResult {
  nodeTier: '100k' | '1M' | '4M' | '8M' | '16M';
  nodeCount: number;
  vramAllocatedMB: number;
  avgComputePassMs: number;
  avgFrameTimeMs: number;
  estimatedFps: number;
  sustains120Fps: boolean;
  timestampQuerySupported: boolean;
}

export interface BenchmarkSuiteReport {
  timestamp: string;
  adapterInfo: {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  };
  limits: {
    maxStorageBufferBindingSizeMB: number;
    maxBufferSizeMB: number;
    maxComputeInvocationsPerWorkgroup: number;
  };
  results: BenchmarkResult[];
  recommendedDefaultTier: '100k' | '1M' | '4M' | '8M' | '16M';
}

export const NODE_TIERS: Record<'100k' | '1M' | '4M' | '8M' | '16M', number> = {
  '100k': 100_000,
  '1M': 1_000_000,
  '4M': 4_000_000,
  '8M': 8_000_000,
  '16M': 16_000_000,
};

export const NODE_TIERS_POW2: Record<'4M' | '8M' | '16M', number> = {
  '4M': 4_194_304, // 2^22
  '8M': 8_388_608, // 2^23
  '16M': 16_777_216, // 2^24
};

export class WebGPUBenchmark {
  private device: GPUDevice;
  private adapter: GPUAdapter;

  constructor(adapter: GPUAdapter, device: GPUDevice) {
    this.adapter = adapter;
    this.device = device;
  }

  public getAdapterLimits() {
    const limits = this.adapter.limits;
    return {
      maxStorageBufferBindingSizeMB: Math.round(limits.maxStorageBufferBindingSize / (1024 * 1024)),
      maxBufferSizeMB: Math.round(limits.maxBufferSize / (1024 * 1024)),
      maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
    };
  }

  public calculateSimulationVramMB(nodeCount: number, binaryUnits: boolean = true): number {
    // 32 bytes/node * 3 buffers (static + 2 ping-pong) = 96 B/node simulation VRAM
    const bytes = nodeCount * 96;
    const divisor = binaryUnits ? 1024 * 1024 : 1_000_000;
    return Number((bytes / divisor).toFixed(2));
  }

  public calculateMemoryBandwidthGBs(nodeCount: number, fps: number = 60, decoupled: boolean = false): number {
    if (decoupled && fps === 120) {
      // Decoupled 120 FPS pipeline (Frontier 5 §5.5.3):
      // Compute physics runs at 60 Hz (96 B/node * 60)
      // Render pass runs at 120 Hz (32 B/node * 120)
      const computeTraffic = nodeCount * 96 * 60;
      const renderTraffic = nodeCount * 32 * 120;
      return Number(((computeTraffic + renderTraffic) * 1e-9).toFixed(2));
    }
    // Synchronous pipeline: 96 B compute + 32 B render = 128 B/node/frame
    const totalBytesPerSec = nodeCount * 128 * fps;
    return Number((totalBytesPerSec * 1e-9).toFixed(2));
  }

  public calculateThroughput(nodeCount: number, passTimeMs: number): number {
    if (passTimeMs <= 0) return 0;
    // Returns millions of nodes per second
    const nodesPerSec = nodeCount / (passTimeMs / 1000);
    return Number((nodesPerSec / 1_000_000).toFixed(2));
  }

  public calculateBusSaturation(bandwidthGBs: number, peakBusBandwidthGBs: number = 273.0): number {
    return Number(((bandwidthGBs / peakBusBandwidthGBs) * 100).toFixed(2));
  }

  public calculateVramUsageMB(nodeCount: number): number {
    // 32 bytes/node * 3 buffers (static + 2 ping-pong) + indices
    const bytesPerNode = 32 * 3;
    const estimatedIndexBytes = nodeCount * 4 * 2; // rough line segment budget
    return Number(((nodeCount * bytesPerNode + estimatedIndexBytes) / (1024 * 1024)).toFixed(2));
  }

  /**
   * Benchmarks a single compute pass on synthetic ping-pong buffers
   */
  public async benchmarkNodeTier(
    tier: '100k' | '1M' | '4M' | '8M' | '16M',
    iterations: number = 30
  ): Promise<BenchmarkResult> {
    const nodeCount = NODE_TIERS[tier];
    const bufferSize = nodeCount * 32; // 32 bytes per node

    // Check if buffer size exceeds adapter limit
    if (bufferSize > this.adapter.limits.maxStorageBufferBindingSize) {
      return {
        nodeTier: tier,
        nodeCount,
        vramAllocatedMB: this.calculateVramUsageMB(nodeCount),
        avgComputePassMs: Infinity,
        avgFrameTimeMs: Infinity,
        estimatedFps: 0,
        sustains120Fps: false,
        timestampQuerySupported: this.device.features.has('timestamp-query'),
      };
    }

    const bufferUsage = typeof GPUBufferUsage !== 'undefined'
      ? GPUBufferUsage
      : {
          STORAGE: 0x0080,
          VERTEX: 0x0020,
          UNIFORM: 0x0040,
          COPY_DST: 0x0008,
        };

    const shaderStage = typeof GPUShaderStage !== 'undefined'
      ? GPUShaderStage
      : {
          COMPUTE: 0x04,
        };

    // Allocate synthetic test buffers
    const bufIn = this.device.createBuffer({
      size: bufferSize,
      usage: bufferUsage.STORAGE | bufferUsage.COPY_DST,
    });
    const bufOut = this.device.createBuffer({
      size: bufferSize,
      usage: bufferUsage.STORAGE | bufferUsage.VERTEX,
    });
    const bufStatic = this.device.createBuffer({
      size: bufferSize,
      usage: bufferUsage.STORAGE | bufferUsage.COPY_DST,
    });
    const simUniform = this.device.createBuffer({
      size: 256,
      usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST,
    });

    const wgslShader = `
      struct SimUniforms {
        unfurl: f32,
        mode: u32,
        layerMode: u32,
        time: f32,
        cursorActive: f32,
        numParticles: u32,
        theme: u32,
        pad1: f32,
        cursorHitPos: vec4<f32>,
        cursorVel: vec4<f32>,
      };

      @group(0) @binding(0) var<uniform> u: SimUniforms;
      @group(0) @binding(1) var<storage, read> inBuf: array<vec4<f32>>;
      @group(0) @binding(2) var<storage, read_write> outBuf: array<vec4<f32>>;
      @group(0) @binding(3) var<storage, read> staticBuf: array<vec4<f32>>;

      @compute @workgroup_size(256)
      fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let i = gid.x;
        if (i >= u.numParticles) { return; }
        let p = inBuf[i * 2u];
        let s = staticBuf[i * 2u];
        let t = sin(u.time * 0.5 + f32(i) * 0.001);
        let outPos = mix(p, s, u.unfurl) + vec4<f32>(0.0, 0.0, t * 0.01, 0.0);
        outBuf[i * 2u] = outPos;
        outBuf[i * 2u + 1u] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
      }
    `;

    const shaderModule = this.device.createShaderModule({ code: wgslShader });
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: shaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: shaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: shaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: shaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    const pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      compute: { module: shaderModule, entryPoint: 'cs_main' },
    });

    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: simUniform } },
        { binding: 1, resource: { buffer: bufIn } },
        { binding: 2, resource: { buffer: bufOut } },
        { binding: 3, resource: { buffer: bufStatic } },
      ],
    });

    // Warmup
    const workgroups = Math.ceil(nodeCount / 256);
    const warmupEncoder = this.device.createCommandEncoder();
    const warmupPass = warmupEncoder.beginComputePass();
    warmupPass.setPipeline(pipeline);
    warmupPass.setBindGroup(0, bindGroup);
    warmupPass.dispatchWorkgroups(workgroups, 1, 1);
    warmupPass.end();
    this.device.queue.submit([warmupEncoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();

    // Benchmark iterations
    const times: number[] = [];
    for (let it = 0; it < iterations; it++) {
      const t0 = performance.now();
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(workgroups, 1, 1);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      await this.device.queue.onSubmittedWorkDone();
      const t1 = performance.now();
      times.push(t1 - t0);
    }

    // Cleanup test buffers
    bufIn.destroy();
    bufOut.destroy();
    bufStatic.destroy();
    simUniform.destroy();

    const avgComputePassMs = times.reduce((a, b) => a + b, 0) / times.length;
    // Estimated frame time: compute time + ~2.0ms raster overhead
    const avgFrameTimeMs = avgComputePassMs + 2.0;
    const estimatedFps = Math.min(144, Math.round(1000 / avgFrameTimeMs));
    const sustains120Fps = avgFrameTimeMs <= 8.33; // 1000ms / 120 = 8.33ms

    return {
      nodeTier: tier,
      nodeCount,
      vramAllocatedMB: this.calculateVramUsageMB(nodeCount),
      avgComputePassMs: Number(avgComputePassMs.toFixed(2)),
      avgFrameTimeMs: Number(avgFrameTimeMs.toFixed(2)),
      estimatedFps,
      sustains120Fps,
      timestampQuerySupported: this.device.features.has('timestamp-query'),
    };
  }

  public async runFullSuite(): Promise<BenchmarkSuiteReport> {
    const results: BenchmarkResult[] = [];
    const tiers: ('100k' | '1M' | '4M' | '8M' | '16M')[] = ['100k', '1M', '4M', '8M', '16M'];

    for (const tier of tiers) {
      const res = await this.benchmarkNodeTier(tier, 15);
      results.push(res);
      // If a tier cannot sustain at least 30 FPS or runs out of memory, break early
      if (res.estimatedFps < 30) {
        break;
      }
    }

    // Identify highest tier sustaining 120 FPS (frame time <= 8.33ms)
    let recommendedTier: '100k' | '1M' | '4M' | '8M' | '16M' = '1M';
    for (const res of results) {
      if (res.sustains120Fps) {
        recommendedTier = res.nodeTier;
      }
    }

    let adapterInfo = {};
    if ('requestAdapterInfo' in this.adapter) {
      try {
        adapterInfo = await (this.adapter as any).requestAdapterInfo();
      } catch {
        // Ignore fallback
      }
    }

    return {
      timestamp: new Date().toISOString(),
      adapterInfo,
      limits: this.getAdapterLimits(),
      results,
      recommendedDefaultTier: recommendedTier,
    };
  }
}
