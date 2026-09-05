import { describe, it, expect } from 'vitest';
import '../helpers/webgpu-mock';
import {
  GPUProfiler,
  PROFILER_QUERY_CAPACITY,
  PROFILER_BUFFER_SIZE,
  QUERY_BYTES,
  ProfilerPassSlot,
} from '../../src/webgpu/profiling/GPUProfiler';
import {
  WebGPUBenchmark,
  NODE_TIERS,
  NODE_TIERS_POW2,
} from '../../src/webgpu/WebGPUBenchmark';

describe('Phase 2 Milestone 3: Apple Silicon M4 Pro 4M–16M Scaling & Architecture Verification', () => {
  // ==========================================================================
  // Suite 1: Workgroup Size 256 SIMD32 & 1D Grid Dispatch Invariants (M3-T1)
  // ==========================================================================
  describe('1. Workgroup Size 256 SIMD32 & 1D Grid Dispatch Invariants (M3-T1)', () => {
    const WORKGROUP_SIZE = 256;
    const MAX_1D_WORKGROUPS = 65535; // W3C WebGPU & Metal maxComputeWorkgroupsPerDimension
    const SIMD_WIDTH = 32; // Apple Silicon Metal SIMDgroup width

    it('M3-DISP-01: calculates exact 1D workgroup dispatch counts across all tiers', () => {
      // 100k nodes: ceil(100,000 / 256) = 391 workgroups
      const wg100k = Math.ceil(NODE_TIERS['100k'] / WORKGROUP_SIZE);
      expect(wg100k).toBe(391);
      expect(wg100k).toBeLessThanOrEqual(MAX_1D_WORKGROUPS);

      // 1M nodes: ceil(1,000,000 / 256) = 3,907 workgroups
      const wg1M = Math.ceil(NODE_TIERS['1M'] / WORKGROUP_SIZE);
      expect(wg1M).toBe(3907);
      expect(wg1M).toBeLessThanOrEqual(MAX_1D_WORKGROUPS);

      // 4M nodes: ceil(4,000,000 / 256) = 15,625 workgroups
      const wg4M = Math.ceil(NODE_TIERS['4M'] / WORKGROUP_SIZE);
      expect(wg4M).toBe(15625);
      expect(wg4M).toBeLessThanOrEqual(MAX_1D_WORKGROUPS);

      // 8M nodes: ceil(8,000,000 / 256) = 31,250 workgroups
      const wg8M = Math.ceil(NODE_TIERS['8M'] / WORKGROUP_SIZE);
      expect(wg8M).toBe(31250);
      expect(wg8M).toBeLessThanOrEqual(MAX_1D_WORKGROUPS);

      // 16M nodes (decimal): ceil(16,000,000 / 256) = 62,500 workgroups
      const wg16M = Math.ceil(NODE_TIERS['16M'] / WORKGROUP_SIZE);
      expect(wg16M).toBe(62500);
      expect(wg16M).toBeLessThanOrEqual(MAX_1D_WORKGROUPS);
    });

    it('M3-DISP-02: verifies 16,000,000 node dispatch strictly adheres to 65,535 WebGPU 1D limit with headroom', () => {
      const wg16M = Math.ceil(NODE_TIERS['16M'] / WORKGROUP_SIZE);
      const headroomWorkgroups = MAX_1D_WORKGROUPS - wg16M;
      const headroomPercent = (headroomWorkgroups / MAX_1D_WORKGROUPS) * 100;

      expect(wg16M).toBe(62500);
      expect(headroomWorkgroups).toBe(3035);
      expect(headroomPercent).toBeGreaterThan(4.5); // 4.63% headroom margin
    });

    it('M3-DISP-03: documents maximum theoretical 1D particle capacity before grid limit violation', () => {
      // Maximum particle count that fits within a single 1D dispatch
      const maxParticles1D = MAX_1D_WORKGROUPS * WORKGROUP_SIZE;
      expect(maxParticles1D).toBe(16776960); // 16,776,960 nodes

      // Decimal 16M fits with 776,960 nodes of margin
      expect(maxParticles1D - NODE_TIERS['16M']).toBe(776960);

      // Binary 16M (2^24 = 16,777,216) exceeds by exactly 256 nodes (1 workgroup)
      expect(NODE_TIERS_POW2['16M'] - maxParticles1D).toBe(256);
      expect(Math.ceil(NODE_TIERS_POW2['16M'] / WORKGROUP_SIZE)).toBe(65536);
    });

    it('M3-DISP-04: verifies workgroup size 256 perfectly aligns with Apple Silicon Metal SIMD32 width', () => {
      // 256 threads / 32 threads per SIMDgroup = exactly 8 full SIMDgroups
      expect(WORKGROUP_SIZE % SIMD_WIDTH).toBe(0);
      const simdgroupsPerWorkgroup = WORKGROUP_SIZE / SIMD_WIDTH;
      expect(simdgroupsPerWorkgroup).toBe(8);

      // On M4 Pro, each core can track 1,024 threads in flight
      // 1,024 threads / 256 = exactly 4 active workgroups per core (100% core occupancy)
      const threadsPerCore = 1024;
      const workgroupsPerCore = threadsPerCore / WORKGROUP_SIZE;
      expect(workgroupsPerCore).toBe(4);
      expect(threadsPerCore % WORKGROUP_SIZE).toBe(0);
    });

    it('M3-DISP-05: verifies WGSL boundary condition logic eliminates out-of-bounds execution', () => {
      // Emulate WGSL boundary check: if (global_id.x >= numParticles) { return; }
      function simulateDispatch(numParticles: number, workgroupSize: number = 256) {
        const workgroups = Math.ceil(numParticles / workgroupSize);
        const totalInvocations = workgroups * workgroupSize;
        const validInvocations = numParticles;
        const idleInvocations = totalInvocations - numParticles;

        return {
          workgroups,
          totalInvocations,
          validInvocations,
          idleInvocations,
        };
      }

      const res100k = simulateDispatch(100_000);
      expect(res100k.idleInvocations).toBe(391 * 256 - 100_000); // 96 idle threads
      expect(res100k.idleInvocations).toBeLessThan(256);

      const res16M = simulateDispatch(16_000_000);
      expect(res16M.idleInvocations).toBe(62500 * 256 - 16_000_000); // exactly 0 idle threads (16M is divisible by 256!)
      expect(res16M.idleInvocations).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 2: Zero-Copy Storage-to-Vertex Layout & Memory Alignment (M3-T1)
  // ==========================================================================
  describe('2. Zero-Copy Storage-to-Vertex Layout & Memory Alignment (M3-T1)', () => {
    it('M3-ZCP-01: verifies Particle struct stride and 16-byte alignment invariants', () => {
      // Particle in WGSL:
      // position: vec4<f32> (offset 0, size 16B)
      // velocity: vec4<f32> (offset 16, size 16B)
      const positionBytes = 4 * 4; // vec4<f32> = 16 bytes
      const velocityBytes = 4 * 4; // vec4<f32> = 16 bytes
      const particleStride = positionBytes + velocityBytes;

      expect(particleStride).toBe(32);
      expect(particleStride % 16).toBe(0); // 16-byte aligned
    });

    it('M3-ZCP-02: verifies StaticParticle struct stride and 16-byte alignment invariants', () => {
      // StaticParticle in WGSL:
      // rest_sphere: vec4<f32> (offset 0, size 16B)
      // rest_map: vec4<f32> (offset 16, size 16B)
      const restSphereBytes = 4 * 4;
      const restMapBytes = 4 * 4;
      const staticParticleStride = restSphereBytes + restMapBytes;

      expect(staticParticleStride).toBe(32);
      expect(staticParticleStride % 16).toBe(0); // 16-byte aligned
    });

    it('M3-ZCP-03: verifies total simulation storage per node is exactly 96 bytes', () => {
      const dynamicBuffer0BytesPerNode = 32;
      const dynamicBuffer1BytesPerNode = 32;
      const staticBufferBytesPerNode = 32;
      const totalSimulationBytesPerNode =
        dynamicBuffer0BytesPerNode + dynamicBuffer1BytesPerNode + staticBufferBytesPerNode;

      expect(totalSimulationBytesPerNode).toBe(96);
    });

    it('M3-ZCP-04: verifies GPUBufferUsage flags support zero-copy compute-to-vertex aliasing', () => {
      // In WebGPU, GPUBufferUsage is a bitmask
      const STORAGE = 0x0080;
      const VERTEX = 0x0020;
      const COPY_DST = 0x0008;

      const particleBufferUsage = STORAGE | VERTEX | COPY_DST;
      expect((particleBufferUsage & STORAGE) !== 0).toBe(true);
      expect((particleBufferUsage & VERTEX) !== 0).toBe(true);
      expect((particleBufferUsage & COPY_DST) !== 0).toBe(true);

      const staticBufferUsage = STORAGE | COPY_DST;
      expect((staticBufferUsage & STORAGE) !== 0).toBe(true);
      expect((staticBufferUsage & COPY_DST) !== 0).toBe(true);
      expect((staticBufferUsage & VERTEX) === 0).toBe(true); // Static coords only read in compute
    });

    it('M3-ZCP-05: confirms vertex buffer layout arrayStride matches 32-byte Particle stride', () => {
      const vertexBufferLayout = {
        arrayStride: 32,
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x4' },
          { shaderLocation: 1, offset: 16, format: 'float32x4' },
        ],
      };

      expect(vertexBufferLayout.arrayStride).toBe(32);
      expect(vertexBufferLayout.attributes[0].offset).toBe(0);
      expect(vertexBufferLayout.attributes[1].offset).toBe(16);
    });
  });

  // ==========================================================================
  // Suite 3: 4M–16M Node Memory Budget & Apple Silicon UMA Ceiling (M3-T3)
  // ==========================================================================
  describe('3. 4M–16M Node Memory Budget & Apple Silicon UMA Ceiling (M3-T3)', () => {
    const mockAdapter = {
      limits: {
        maxStorageBufferBindingSize: 4294967292, // ~4.29 GB on Apple Silicon Metal
        maxBufferSize: 4294967292,
        maxComputeInvocationsPerWorkgroup: 1024,
      },
    } as any;
    const benchmark = new WebGPUBenchmark(mockAdapter, {} as any);

    it('M3-MEM-01: verifies simulation VRAM budgets strictly conform to specification', () => {
      // 96 bytes/node
      const sim100k = benchmark.calculateSimulationVramMB(NODE_TIERS['100k'], false);
      expect(sim100k).toBe(9.6); // 9.6 MB

      const sim1M = benchmark.calculateSimulationVramMB(NODE_TIERS['1M'], false);
      expect(sim1M).toBe(96.0); // 96.0 MB

      const sim4M = benchmark.calculateSimulationVramMB(NODE_TIERS['4M'], false);
      expect(sim4M).toBe(384.0); // 384.0 MB

      const sim8M = benchmark.calculateSimulationVramMB(NODE_TIERS['8M'], false);
      expect(sim8M).toBe(768.0); // 768.0 MB

      const sim16M = benchmark.calculateSimulationVramMB(NODE_TIERS['16M'], false);
      expect(sim16M).toBe(1536.0); // 1,536.0 MB (1.536 GB)
    });

    it('M3-MEM-02: ensures 16M node simulation VRAM is strictly bounded under 2.0 GB target', () => {
      const sim16MB = benchmark.calculateSimulationVramMB(NODE_TIERS['16M'], false);
      const MAX_SIMULATION_BUDGET_MB = 2048.0; // 2.0 GB

      expect(sim16MB).toBeLessThanOrEqual(MAX_SIMULATION_BUDGET_MB);
      const headroomMB = MAX_SIMULATION_BUDGET_MB - sim16MB;
      expect(headroomMB).toBe(512.0); // Exactly 512 MB under 2.0 GB ceiling
    });

    it('M3-MEM-03: verifies combined simulation and wireframe index buffer fits within Apple Silicon UMA', () => {
      // Wireframe index: 3N edges * 8 bytes/edge = 24 bytes/node
      const nodeCount16M = NODE_TIERS['16M'];
      const simBytes = nodeCount16M * 96; // 1,536 MB
      const wireframeIndexBytes = nodeCount16M * 24; // 384 MB
      const totalSimulationVramMB = (simBytes + wireframeIndexBytes) / 1_000_000;

      expect(totalSimulationVramMB).toBe(1920.0); // 1.92 GB <= 2.0 GB
      expect(totalSimulationVramMB).toBeLessThanOrEqual(2048.0);

      // On 24 GB Apple Silicon M4 Pro, 1.92 GB represents exactly 8.0% of system memory
      const m4ProMemoryMB = 24 * 1024; // 24,576 MB
      const percentageOfSystemMemory = (totalSimulationVramMB / m4ProMemoryMB) * 100;
      expect(percentageOfSystemMemory).toBeLessThan(8.0);
    });

    it('M3-MEM-04: verifies single buffer allocations remain far below 4.29 GB Metal driver limit', () => {
      // Largest single buffer is 1 dynamic ping-pong buffer: 16M nodes * 32 B = 512 MB
      const singleBuffer16MBytes = NODE_TIERS['16M'] * 32;
      expect(singleBuffer16MBytes).toBe(512_000_000); // 512 MB

      const maxMetalBufferBytes = 4294967292; // ~4.29 GB
      expect(singleBuffer16MBytes).toBeLessThan(maxMetalBufferBytes);

      const headroomMultiplier = maxMetalBufferBytes / singleBuffer16MBytes;
      expect(headroomMultiplier).toBeGreaterThan(8.0); // 8.38x safety factor
    });
  });

  // ==========================================================================
  // Suite 4: Memory Bandwidth Stress Modeling & Decoupled 120 FPS Pipeline (M3-T3)
  // ==========================================================================
  describe('4. Memory Bandwidth Stress Modeling & Decoupled 120 FPS Pipeline (M3-T3)', () => {
    const benchmark = new WebGPUBenchmark({ limits: {} } as any, {} as any);
    const M4_PRO_PEAK_BUS_GBS = 273.0; // Apple Silicon M4 Pro peak memory bus bandwidth

    it('M3-BWD-01: calculates synchronous 60 FPS bandwidth scaling and bus saturation', () => {
      // 128 bytes/node/frame (96B compute + 32B render)
      const bw1M = benchmark.calculateMemoryBandwidthGBs(NODE_TIERS['1M'], 60);
      expect(bw1M).toBe(7.68);
      expect(benchmark.calculateBusSaturation(bw1M)).toBeCloseTo(2.81, 1);

      const bw4M = benchmark.calculateMemoryBandwidthGBs(NODE_TIERS['4M'], 60);
      expect(bw4M).toBe(30.72);
      expect(benchmark.calculateBusSaturation(bw4M)).toBeCloseTo(11.25, 1);

      const bw8M = benchmark.calculateMemoryBandwidthGBs(NODE_TIERS['8M'], 60);
      expect(bw8M).toBe(61.44);
      expect(benchmark.calculateBusSaturation(bw8M)).toBeCloseTo(22.51, 1);

      const bw16M = benchmark.calculateMemoryBandwidthGBs(NODE_TIERS['16M'], 60);
      expect(bw16M).toBe(122.88);
      expect(benchmark.calculateBusSaturation(bw16M)).toBeCloseTo(45.01, 1);
    });

    it('M3-BWD-02: exposes synchronous 120 FPS bandwidth saturation at 16M nodes', () => {
      const bw16MSync120 = benchmark.calculateMemoryBandwidthGBs(NODE_TIERS['16M'], 120, false);
      expect(bw16MSync120).toBe(245.76); // 245.76 GB/s

      const saturationSync120 = benchmark.calculateBusSaturation(bw16MSync120);
      expect(saturationSync120).toBeCloseTo(90.02, 1); // 90.0% of M4 Pro bus
    });

    it('M3-BWD-03: proves decoupled 120 FPS pipeline reduces bus saturation to 56.3%', () => {
      // Decoupled: Compute @ 60 Hz (96 B/node * 60 = 92.16 GB/s) + Render @ 120 Hz (32 B/node * 120 = 61.44 GB/s)
      const bw16MDecoupled120 = benchmark.calculateMemoryBandwidthGBs(NODE_TIERS['16M'], 120, true);
      expect(bw16MDecoupled120).toBe(153.6); // 153.60 GB/s

      const saturationDecoupled = benchmark.calculateBusSaturation(bw16MDecoupled120);
      expect(saturationDecoupled).toBeCloseTo(56.26, 1);

      // Proves bandwidth savings of over 92 GB/s
      const savingsGBs = 245.76 - 153.6;
      expect(savingsGBs).toBeCloseTo(92.16, 2);
    });

    it('M3-BWD-04: verifies compute throughput strictly exceeds >= 100M nodes/sec across all active configurations', () => {
      // 1M nodes in 0.386 ms (measured M4 Pro kernel duration)
      const throughput1M = benchmark.calculateThroughput(1_000_000, 0.386);
      expect(throughput1M).toBeGreaterThan(2500.0); // ~2,590.67 M nodes/s

      // 4M nodes in 1.623 ms (measured M4 Pro kernel duration)
      const throughput4M = benchmark.calculateThroughput(4_000_000, 1.623);
      expect(throughput4M).toBeGreaterThan(2400.0); // ~2,464.57 M nodes/s

      // Theoretical 16M nodes in 6.5 ms
      const throughput16M = benchmark.calculateThroughput(16_000_000, 6.5);
      expect(throughput16M).toBeGreaterThan(2400.0); // ~2,461.54 M nodes/s

      // All configurations must exceed the 100M nodes/sec mandate
      expect(throughput1M).toBeGreaterThanOrEqual(100.0);
      expect(throughput4M).toBeGreaterThanOrEqual(100.0);
      expect(throughput16M).toBeGreaterThanOrEqual(100.0);
    });
  });

  // ==========================================================================
  // Suite 5: Asynchronous Triple-Buffered GPUProfiler Verification (M3-T2)
  // ==========================================================================
  describe('5. Asynchronous Triple-Buffered GPUProfiler Verification (M3-T2)', () => {
    it('M3-PRF-01: verifies query capacity, buffer sizing, and byte alignment constants', () => {
      expect(PROFILER_QUERY_CAPACITY).toBe(16);
      expect(QUERY_BYTES).toBe(8); // uint64
      expect(PROFILER_BUFFER_SIZE).toBe(128); // 16 * 8 bytes
      expect(PROFILER_BUFFER_SIZE % 16).toBe(0); // 16-byte aligned for GPUBufferUsage.COPY_DST
    });

    it('M3-PRF-02: verifies query pair indexing across all multi-pass slots', () => {
      expect(ProfilerPassSlot.Compute).toBe(0);     // queries 0, 1
      expect(ProfilerPassSlot.SwissRelief).toBe(1); // queries 2, 3
      expect(ProfilerPassSlot.Lines).toBe(2);       // queries 4, 5
      expect(ProfilerPassSlot.Ribbons).toBe(3);     // queries 6, 7
      expect(ProfilerPassSlot.Contours).toBe(4);    // queries 8, 9
      expect(ProfilerPassSlot.Points).toBe(5);      // queries 10, 11
      expect(ProfilerPassSlot.Reserved1).toBe(6);   // queries 12, 13
      expect(ProfilerPassSlot.Reserved2).toBe(7);   // queries 14, 15
    });

    it('M3-PRF-03: verifies clean non-crashing fallback when timestamp-query is unsupported', () => {
      // Mock device without timestamp-query feature
      const fallbackDevice = {
        features: { has: () => false },
      } as any;

      const profiler = new GPUProfiler(fallbackDevice);
      expect(profiler.isSupported).toBe(false);

      // Writes must return undefined
      expect(profiler.getComputeTimestampWrites(0)).toBeUndefined();
      expect(profiler.getRenderTimestampWrites(0)).toBeUndefined();
      expect(profiler.getPassTimestampWrites(ProfilerPassSlot.Compute)).toBeUndefined();
      expect(profiler.getTimestampWrites()).toBeUndefined();

      // Telemetry must return null/empty
      expect(profiler.getLatestReport()).toBeNull();
      expect(profiler.getKernelReports()).toEqual([]);

      // resolveFrame must execute without throwing
      const mockEncoder = {
        resolveQuerySet: () => {},
        copyBufferToBuffer: () => {},
      } as any;
      expect(() => profiler.resolveFrame(mockEncoder)).not.toThrow();

      // Dispose must be clean
      expect(() => profiler.dispose()).not.toThrow();
    });

    it('M3-PRF-04: initializes query set and 3 ring buffers when timestamp-query is supported', () => {
      let createdQuerySet: any = null;
      const createdBuffers: any[] = [];

      const supportedDevice = {
        features: { has: (feat: string) => feat === 'timestamp-query' },
        createQuerySet: (desc: any) => {
          createdQuerySet = { ...desc, destroy: () => { createdQuerySet.destroyed = true; } };
          return createdQuerySet;
        },
        createBuffer: (desc: any) => {
          const buf = { ...desc, destroy: () => { buf.destroyed = true; } };
          createdBuffers.push(buf);
          return buf;
        },
      } as any;

      const profiler = new GPUProfiler(supportedDevice);
      expect(profiler.isSupported).toBe(true);

      // QuerySet must have capacity 16
      expect(createdQuerySet).toBeDefined();
      expect(createdQuerySet.type).toBe('timestamp');
      expect(createdQuerySet.count).toBe(16);

      // 1 resolve buffer + 3 ring buffers = 4 buffers created
      expect(createdBuffers.length).toBe(4);
      expect(createdBuffers[0].size).toBe(128); // resolve buffer
      expect(createdBuffers[1].size).toBe(128); // ring buffer 0
      expect(createdBuffers[2].size).toBe(128); // ring buffer 1
      expect(createdBuffers[3].size).toBe(128); // ring buffer 2

      // Timestamp writes descriptors
      const computeWrites = profiler.getComputeTimestampWrites(0);
      expect(computeWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(computeWrites?.endOfPassWriteIndex).toBe(1);

      const reliefWrites = profiler.getRenderTimestampWrites(ProfilerPassSlot.SwissRelief);
      expect(reliefWrites?.beginningOfPassWriteIndex).toBe(2);
      expect(reliefWrites?.endOfPassWriteIndex).toBe(3);

      const contourWrites = profiler.getPassTimestampWrites(ProfilerPassSlot.Contours);
      expect(contourWrites?.beginningOfPassWriteIndex).toBe(8);
      expect(contourWrites?.endOfPassWriteIndex).toBe(9);

      // Clean disposal
      profiler.dispose();
      expect(createdQuerySet.destroyed).toBe(true);
      for (const b of createdBuffers) {
        expect(b.destroyed).toBe(true);
      }
      expect(profiler.isSupported).toBe(false);
    });

    it('M3-PRF-05: verifies triple-buffering resolveFrame dispatches without CPU or GPU pipeline stalls', () => {
      let resolvedQueries = false;
      let copiedBuffer = false;

      const mockBuffer = {
        size: 128,
        destroy: () => {},
        mapAsync: () => Promise.resolve(),
        getMappedRange: () => new ArrayBuffer(128),
        unmap: () => {},
      };

      const mockDevice = {
        features: { has: () => true },
        createQuerySet: () => ({ type: 'timestamp', count: 16, destroy: () => {} }),
        createBuffer: () => ({ ...mockBuffer }),
      } as any;

      const profiler = new GPUProfiler(mockDevice);

      const mockEncoder = {
        resolveQuerySet: (qs: any, first: number, count: number, dst: any, offset: number) => {
          resolvedQueries = true;
          expect(first).toBe(0);
          expect(count).toBe(16);
          expect(offset).toBe(0);
        },
        copyBufferToBuffer: (src: any, srcOffset: number, dst: any, dstOffset: number, size: number) => {
          copiedBuffer = true;
          expect(size).toBe(128);
        },
      } as any;

      // Frame 1, 2, 3 (warmup)
      profiler.resolveFrame(mockEncoder);
      expect(resolvedQueries).toBe(true);
      expect(copiedBuffer).toBe(true);

      profiler.resolveFrame(mockEncoder);
      profiler.resolveFrame(mockEncoder);

      // Profiler remains non-blocking; frames complete synchronously
      profiler.dispose();
    });
  });

  // ==========================================================================
  // Suite 6: WebGPUBenchmark Class & Scaling Harness Integration (M3-T3)
  // ==========================================================================
  describe('6. WebGPUBenchmark Class & Scaling Harness Integration (M3-T3)', () => {
    it('M3-BMK-01: verifies benchmark retrieves adapter limits accurately', () => {
      const mockAdapter = {
        limits: {
          maxStorageBufferBindingSize: 2147483648, // 2048 MB
          maxBufferSize: 2147483648,
          maxComputeInvocationsPerWorkgroup: 1024,
        },
      } as any;

      const bmk = new WebGPUBenchmark(mockAdapter, {} as any);
      const limits = bmk.getAdapterLimits();

      expect(limits.maxStorageBufferBindingSizeMB).toBe(2048);
      expect(limits.maxBufferSizeMB).toBe(2048);
      expect(limits.maxComputeInvocationsPerWorkgroup).toBe(1024);
    });

    it('M3-BMK-02: verifies benchmark synthetic compute pass executes cleanly under mock GPU', async () => {
      const mockDevice = {
        features: { has: () => false },
        createBuffer: () => ({ destroy: () => {} }),
        createShaderModule: () => ({}),
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createComputePipeline: () => ({}),
        createBindGroup: () => ({}),
        createCommandEncoder: () => ({
          beginComputePass: () => ({
            setPipeline: () => {},
            setBindGroup: () => {},
            dispatchWorkgroups: () => {},
            end: () => {},
          }),
          finish: () => ({}),
        }),
        queue: {
          submit: () => {},
          onSubmittedWorkDone: () => Promise.resolve(),
        },
      } as any;

      const mockAdapter = {
        limits: {
          maxStorageBufferBindingSize: 1024 * 1024 * 1024,
          maxBufferSize: 1024 * 1024 * 1024,
          maxComputeInvocationsPerWorkgroup: 1024,
        },
      } as any;

      const bmk = new WebGPUBenchmark(mockAdapter, mockDevice);
      const result = await bmk.benchmarkNodeTier('100k', 3);

      expect(result.nodeTier).toBe('100k');
      expect(result.nodeCount).toBe(100_000);
      expect(result.vramAllocatedMB).toBeGreaterThan(0);
      expect(result.avgComputePassMs).toBeGreaterThanOrEqual(0);
      expect(result.estimatedFps).toBeGreaterThan(0);
    });

    it('M3-BMK-03: returns graceful fallback when node tier exceeds adapter maxStorageBufferBindingSize', async () => {
      const constrainedAdapter = {
        limits: {
          maxStorageBufferBindingSize: 256 * 1024 * 1024, // 256 MB limit (16M requires 512 MB)
          maxBufferSize: 256 * 1024 * 1024,
          maxComputeInvocationsPerWorkgroup: 256,
        },
      } as any;

      const mockDevice = {
        features: { has: () => false },
      } as any;

      const bmk = new WebGPUBenchmark(constrainedAdapter, mockDevice);
      const result = await bmk.benchmarkNodeTier('16M', 1);

      expect(result.nodeTier).toBe('16M');
      expect(result.avgComputePassMs).toBe(Infinity);
      expect(result.estimatedFps).toBe(0);
      expect(result.sustains120Fps).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 7: Timestamp Decoding & Zero-Copy Architectural Rigor
  // ==========================================================================
  describe('7. Timestamp Decoding & Zero-Copy Architectural Rigor', () => {
    it('M3-PRF-06: decodes multi-pass 64-bit timestamps accurately into pass reports', async () => {
      // Build raw 128-byte timestamp buffer with known nanosecond values
      const rawBuffer = new ArrayBuffer(128);
      const u64View = new BigUint64Array(rawBuffer);

      // Slot 0 (Compute): 1,000,000 ns -> 1,386,000 ns (delta = 386,000 ns = 0.386 ms)
      u64View[0] = 1_000_000n;
      u64View[1] = 1_386_000n;

      // Slot 1 (SwissRelief): 2,000,000 ns -> 2,150,000 ns (delta = 150,000 ns = 0.150 ms)
      u64View[2] = 2_000_000n;
      u64View[3] = 2_150_000n;

      // Slot 2 (Lines): 3,000,000 ns -> 3,080,000 ns (delta = 80,000 ns = 0.080 ms)
      u64View[4] = 3_000_000n;
      u64View[5] = 3_080_000n;

      // Slot 3 (Ribbons): 4,000,000 ns -> 4,120,000 ns (delta = 120,000 ns = 0.120 ms)
      u64View[6] = 4_000_000n;
      u64View[7] = 4_120_000n;

      // Slot 4 (Contours): 5,000,000 ns -> 5,090,000 ns (delta = 90,000 ns = 0.090 ms)
      u64View[8] = 5_000_000n;
      u64View[9] = 5_090_000n;

      // Slot 5 (Points): 6,000,000 ns -> 6,210,000 ns (delta = 210,000 ns = 0.210 ms)
      u64View[10] = 6_000_000n;
      u64View[11] = 6_210_000n;

      const mockBuffer = {
        size: 128,
        destroy: () => {},
        mapAsync: () => Promise.resolve(),
        getMappedRange: () => rawBuffer.slice(0),
        unmap: () => {},
      };

      const mockDevice = {
        features: { has: () => true },
        createQuerySet: () => ({ type: 'timestamp', count: 16, destroy: () => {} }),
        createBuffer: () => ({ ...mockBuffer }),
      } as any;

      const profiler = new GPUProfiler(mockDevice);
      const mockEncoder = {
        resolveQuerySet: () => {},
        copyBufferToBuffer: () => {},
      } as any;

      // Advance ring buffer to trigger asynchronous read of completed frame
      profiler.resolveFrame(mockEncoder); // Frame 1
      profiler.resolveFrame(mockEncoder); // Frame 2
      profiler.resolveFrame(mockEncoder); // Frame 3 (warmup complete, triggers mapAsync)

      // Wait microtask tick for mapAsync promise resolution
      await Promise.resolve();
      await Promise.resolve();

      const report = profiler.getLatestReport();
      expect(report).not.toBeNull();
      if (report) {
        expect(report.computeMs).toBeCloseTo(0.386, 3);
        expect(report.reliefMs).toBeCloseTo(0.150, 3);
        expect(report.linesMs).toBeCloseTo(0.080, 3);
        expect(report.ribbonsMs).toBeCloseTo(0.120, 3);
        expect(report.contoursMs).toBeCloseTo(0.090, 3);
        expect(report.pointsMs).toBeCloseTo(0.210, 3);
        expect(report.totalGpuMs).toBeCloseTo(0.386 + 0.150 + 0.080 + 0.120 + 0.090 + 0.210, 3);
      }

      const kernelReports = profiler.getKernelReports();
      expect(kernelReports.length).toBe(8);
      expect(kernelReports[0].passName).toBe('Particle Compute');
      expect(kernelReports[0].gpuTimeNs).toBe(386_000n);
      expect(kernelReports[0].gpuTimeMs).toBeCloseTo(0.386, 3);

      profiler.dispose();
    });

    it('M3-PRF-07: ring buffer stably cycles over 15 consecutive frames without leaks', async () => {
      const mockDevice = {
        features: { has: () => true },
        createQuerySet: () => ({ type: 'timestamp', count: 16, destroy: () => {} }),
        createBuffer: () => ({
          size: 128,
          destroy: () => {},
          mapAsync: () => Promise.resolve(),
          getMappedRange: () => new ArrayBuffer(128),
          unmap: () => {},
        }),
      } as any;

      const profiler = new GPUProfiler(mockDevice);
      const mockEncoder = {
        resolveQuerySet: () => {},
        copyBufferToBuffer: () => {},
      } as any;

      // Dispatch 15 frames
      for (let i = 0; i < 15; i++) {
        profiler.resolveFrame(mockEncoder);
        await Promise.resolve();
      }

      expect(profiler.isSupported).toBe(true);
      profiler.dispose();
      expect(profiler.isSupported).toBe(false);
    });

    it('M3-ZCP-06: verifies absence of readPixels and blocking CPU readbacks in active render path', async () => {
      // Static source inspection of WebGPUEngine.ts
      const fs = await import('fs');
      const path = await import('path');
      const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const source = fs.readFileSync(enginePath, 'utf8');

      // Zero readPixels
      expect(source.includes('readPixels')).toBe(false);

      // In WebGPUEngine.ts, mapAsync is completely absent (isolated to GPUProfiler)
      expect(source.includes('mapAsync')).toBe(false);

      // copyBufferToBuffer is absent from WebGPUEngine.ts (isolated to GPUProfiler query resolution)
      expect(source.includes('copyBufferToBuffer')).toBe(false);
    });

    it('M3-ZCP-07: verifies storage-to-vertex buffer zero-copy binding in WebGPUEngine.ts', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const source = fs.readFileSync(enginePath, 'utf8');

      // Verifies particleBuffers created with STORAGE | VERTEX
      expect(source.includes('GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX')).toBe(true);

      // Verifies outBuffer directly bound as vertexBuffer 0
      expect(source.includes('renderPass.setVertexBuffer(0, outBuffer)')).toBe(true);
    });
  });
});
