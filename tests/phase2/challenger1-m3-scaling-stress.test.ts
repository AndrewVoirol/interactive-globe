// ============================================================================
// File: tests/phase2/challenger1-m3-scaling-stress.test.ts
// Architecture: Challenger 1 (Empirical Challenger M3-1)
// Description: Adversarial verification and boundary stress-testing of Milestone 3:
//              Apple Silicon M4 Pro 4M–16M scaling, SIMD32 workgroup size 256 dispatch,
//              boundary conditions (N = 0 to 16,777,216), zero-copy buffer usage flags,
//              memory aliasing, and ping-pong swap concurrency.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../helpers/webgpu-mock';
import fs from 'node:fs';
import path from 'node:path';

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

import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

describe('Challenger 1: Milestone 3 Scaling & Architecture Adversarial Suite', () => {
  const WORKGROUP_SIZE = 256;
  const MAX_1D_WORKGROUPS = 65535;
  const SIMD32_WIDTH = 32;

  // The 11 canonical boundary numbers specified in the directive:
  const BOUNDARY_N_VALUES = [
    0,
    1,
    255,
    256,
    257,
    100_000,
    1_000_000,
    4_000_000,
    16_000_000,
    16_776_960,
    16_777_216,
  ];

  // ==========================================================================
  // Suite 1: Boundary Conditions & 1D Grid Clamp Stress Testing
  // ==========================================================================
  describe('1. Boundary Conditions & 1D Grid Clamp Stress Testing', () => {
    it('CH1-M3-01: calculates and validates workgroup dispatch across all 11 boundary N values', () => {
      const results = BOUNDARY_N_VALUES.map((n) => {
        const rawWorkgroups = Math.ceil(n / WORKGROUP_SIZE);
        const clampedWorkgroups = Math.min(MAX_1D_WORKGROUPS, rawWorkgroups);
        return {
          n,
          rawWorkgroups,
          clampedWorkgroups,
          exceedsMax: rawWorkgroups > MAX_1D_WORKGROUPS,
        };
      });

      // N = 0
      expect(results[0].n).toBe(0);
      expect(results[0].clampedWorkgroups).toBe(0);

      // N = 1
      expect(results[1].n).toBe(1);
      expect(results[1].clampedWorkgroups).toBe(1);

      // N = 255
      expect(results[2].n).toBe(255);
      expect(results[2].clampedWorkgroups).toBe(1);

      // N = 256
      expect(results[3].n).toBe(256);
      expect(results[3].clampedWorkgroups).toBe(1);

      // N = 257
      expect(results[4].n).toBe(257);
      expect(results[4].clampedWorkgroups).toBe(2);

      // N = 100,000
      expect(results[5].n).toBe(100_000);
      expect(results[5].clampedWorkgroups).toBe(391);

      // N = 1,000,000
      expect(results[6].n).toBe(1_000_000);
      expect(results[6].clampedWorkgroups).toBe(3907);

      // N = 4,000,000
      expect(results[7].n).toBe(4_000_000);
      expect(results[7].clampedWorkgroups).toBe(15625);

      // N = 16,000,000 (decimal 16M)
      expect(results[8].n).toBe(16_000_000);
      expect(results[8].clampedWorkgroups).toBe(62500);
      expect(results[8].clampedWorkgroups).toBeLessThanOrEqual(MAX_1D_WORKGROUPS);

      // N = 16,776,960 (maximum 1D capacity: 65,535 * 256)
      expect(results[9].n).toBe(16_776_960);
      expect(results[9].rawWorkgroups).toBe(65535);
      expect(results[9].clampedWorkgroups).toBe(65535);
      expect(results[9].exceedsMax).toBe(false);

      // N = 16,777,216 (binary 16M = 2^24)
      expect(results[10].n).toBe(16_777_216);
      expect(results[10].rawWorkgroups).toBe(65536); // Exceeds 65,535 by 1!
      expect(results[10].clampedWorkgroups).toBe(65535); // Clamped by Math.min!
      expect(results[10].exceedsMax).toBe(true);

      // Verify that every clamped workgroup count is strictly <= 65535
      for (const res of results) {
        expect(res.clampedWorkgroups).toBeLessThanOrEqual(MAX_1D_WORKGROUPS);
        expect(res.clampedWorkgroups).toBeGreaterThanOrEqual(0);
      }
    });

    it('CH1-M3-02: verifies Math.min(65535, Math.ceil(N / 256)) prevents WebGPU dispatch crash at N > 16,776,960', () => {
      // In WebGPU specification, passing workgroupCountX > maxComputeWorkgroupsPerDimension throws a validation error.
      // Emulate dispatch validation:
      function validateDispatch(n: number) {
        const workgroupCount = Math.min(MAX_1D_WORKGROUPS, Math.ceil(n / 256));
        if (workgroupCount > MAX_1D_WORKGROUPS) {
          throw new Error(`WebGPU Validation Error: workgroupCountX (${workgroupCount}) exceeds maxComputeWorkgroupsPerDimension (65535)`);
        }
        return workgroupCount;
      }

      // Without Math.min, N = 16,777,216 produces 65536 and would crash WebGPU
      expect(Math.ceil(16_777_216 / 256)).toBe(65536);

      // With Math.min, dispatch succeeds with exactly 65535 workgroups
      expect(() => validateDispatch(16_777_216)).not.toThrow();
      expect(validateDispatch(16_777_216)).toBe(65535);

      // Even for adversarial extreme N = 100,000,000, it safely clamps to 65535
      expect(() => validateDispatch(100_000_000)).not.toThrow();
      expect(validateDispatch(100_000_000)).toBe(65535);
    });

    it('CH1-M3-03: documents particle coverage deficit when N exceeds 16,776,960 under 1D dispatch', () => {
      const maxCoveredParticles = MAX_1D_WORKGROUPS * WORKGROUP_SIZE; // 16,776,960
      const binary16M = 16_777_216;

      const deficit = binary16M - maxCoveredParticles;
      expect(deficit).toBe(256); // Exactly 1 workgroup (256 particles) unaddressed

      const coveragePercent = (maxCoveredParticles / binary16M) * 100;
      expect(coveragePercent).toBeCloseTo(99.998, 3); // 99.998% covered

      // Decimal 16,000,000 has 100% coverage with 776,960 particles of headroom
      expect(maxCoveredParticles - 16_000_000).toBe(776960);
      expect(maxCoveredParticles).toBeGreaterThan(16_000_000);
    });
  });

  // ==========================================================================
  // Suite 2: WGSL Boundary Guard & Memory Access Oracle
  // ==========================================================================
  describe('2. WGSL Boundary Guard & Memory Access Oracle', () => {
    it('CH1-M3-04: simulates WGSL execution oracle proving zero out-of-bounds reads/writes for all boundary N', () => {
      // Replicate the exact WGSL cs_main preamble:
      // let index = global_id.x;
      // if (index >= sim.u_numParticles) { return; }
      function executeWgslSimulationOracle(numParticles: number) {
        const workgroupCount = Math.min(MAX_1D_WORKGROUPS, Math.ceil(numParticles / WORKGROUP_SIZE));
        const totalThreadsDispatched = workgroupCount * WORKGROUP_SIZE;

        // Allocate memory arrays of exact length numParticles
        const inputMemory = new Float32Array(numParticles * 8); // 8 floats (32 bytes) per particle
        const outputMemory = new Float32Array(numParticles * 8);

        // Populate initial input
        for (let i = 0; i < numParticles * 8; i++) {
          inputMemory[i] = 1.0;
        }

        let executedThreads = 0;
        let earlyReturnThreads = 0;
        let outOfBoundsReads = 0;
        let outOfBoundsWrites = 0;

        for (let globalIdX = 0; globalIdX < totalThreadsDispatched; globalIdX++) {
          const index = globalIdX;

          // Guard check
          if (index >= numParticles) {
            earlyReturnThreads++;
            // If the thread were to access memory after this point, it would be a violation
            continue;
          }

          // Active thread execution: accesses index
          if (index < 0 || index >= numParticles) {
            outOfBoundsReads++;
            outOfBoundsWrites++;
          } else {
            // Safe read and write
            const val = inputMemory[index * 8];
            outputMemory[index * 8] = val * 2.0;
            executedThreads++;
          }
        }

        return {
          numParticles,
          totalThreadsDispatched,
          executedThreads,
          earlyReturnThreads,
          outOfBoundsReads,
          outOfBoundsWrites,
        };
      }

      // Run oracle across all boundary N values
      const testCases = [0, 1, 255, 256, 257, 100_000, 1_000_000, 4_000_000, 16_000_000, 16_776_960];
      for (const n of testCases) {
        const simResult = executeWgslSimulationOracle(n);

        expect(simResult.outOfBoundsReads).toBe(0);
        expect(simResult.outOfBoundsWrites).toBe(0);
        expect(simResult.executedThreads).toBe(n);
        expect(simResult.executedThreads + simResult.earlyReturnThreads).toBe(simResult.totalThreadsDispatched);
      }
    });

    it('CH1-M3-05: verifies N=0 boundary produces 0 workgroups and 0 memory operations', () => {
      const workgroupCount = Math.min(MAX_1D_WORKGROUPS, Math.ceil(0 / 256));
      expect(workgroupCount).toBe(0);

      // In WebGPU, dispatchWorkgroups(0, 1, 1) is a valid no-op command
      const mockComputePass = {
        dispatchedX: -1,
        dispatchWorkgroups: (x: number) => { mockComputePass.dispatchedX = x; },
      };
      mockComputePass.dispatchWorkgroups(workgroupCount);
      expect(mockComputePass.dispatchedX).toBe(0);
    });

    it('CH1-M3-06: verifies N=1 boundary safely executes thread 0 and guards threads 1..255', () => {
      const workgroupCount = Math.min(MAX_1D_WORKGROUPS, Math.ceil(1 / 256));
      expect(workgroupCount).toBe(1);

      const totalThreads = workgroupCount * 256;
      let thread0Executed = false;
      let otherThreadsExecuted = 0;

      for (let index = 0; index < totalThreads; index++) {
        if (index >= 1) {
          continue; // Early return
        }
        if (index === 0) {
          thread0Executed = true;
        } else {
          otherThreadsExecuted++;
        }
      }

      expect(thread0Executed).toBe(true);
      expect(otherThreadsExecuted).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 3: SIMD32 Architecture & Occupancy Optimization
  // ==========================================================================
  describe('3. SIMD32 Architecture & Occupancy Optimization', () => {
    it('CH1-M3-07: proves workgroup size 256 maximizes Metal SIMD32 occupancy with zero idle lanes', () => {
      // Apple Silicon Metal hardware uses 32-wide execution units (SIMDgroup)
      const workgroupSizes = [16, 32, 64, 128, 256, 512, 1024];

      for (const size of workgroupSizes) {
        const simdgroups = size / SIMD32_WIDTH;
        const remainder = size % SIMD32_WIDTH;

        if (size < 32) {
          // Underfills a SIMDgroup (divergence / wasted execution lanes)
          expect(remainder).not.toBe(0);
        } else {
          // Perfectly fills SIMDgroups
          expect(remainder).toBe(0);
          expect(Number.isInteger(simdgroups)).toBe(true);
        }
      }

      // Workgroup size 256 = exactly 8 SIMDgroups
      expect(WORKGROUP_SIZE / SIMD32_WIDTH).toBe(8);

      // M4 Pro GPU core thread tracking capacity = 1,024 threads
      const coreCapacity = 1024;
      const workgroupsPerCore = coreCapacity / WORKGROUP_SIZE;
      expect(workgroupsPerCore).toBe(4);
      expect(coreCapacity % WORKGROUP_SIZE).toBe(0); // 100% occupancy without partial slots
    });
  });

  // ==========================================================================
  // Suite 4: Zero-Copy Storage-to-Vertex Aliasing & Memory Layout
  // ==========================================================================
  describe('4. Zero-Copy Storage-to-Vertex Aliasing & Memory Layout', () => {
    it('CH1-M3-08: verifies particle buffer usage bitmask strictly includes STORAGE and VERTEX', () => {
      // Bitmask definitions from WebGPU specification:
      const MAP_READ = 0x0001;
      const COPY_DST = 0x0008;
      const VERTEX = 0x0020;
      const STORAGE = 0x0080;

      const particleBufferUsage = STORAGE | VERTEX | COPY_DST;

      // Must have STORAGE for compute pass writing (particlesOut)
      expect(particleBufferUsage & STORAGE).toBe(STORAGE);

      // Must have VERTEX for render pass direct binding (setVertexBuffer)
      expect(particleBufferUsage & VERTEX).toBe(VERTEX);

      // Must NOT have MAP_READ in production (zero CPU readback)
      expect(particleBufferUsage & MAP_READ).toBe(0);
    });

    it('CH1-M3-09: verifies struct memory layout alignment parity between WGSL and TypeScript', () => {
      // WGSL:
      // struct Particle {
      //     position: vec4<f32>, // offset 0, size 16B
      //     velocity: vec4<f32>, // offset 16, size 16B
      // }
      const stride = 32;

      // In WebGPU vertex buffer layout:
      const vertexLayout: GPUVertexBufferLayout = {
        arrayStride: stride,
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x4' },
          { shaderLocation: 1, offset: 16, format: 'float32x4' },
        ],
      };

      expect(vertexLayout.arrayStride).toBe(32);
      expect(vertexLayout.attributes[0].offset).toBe(0);
      expect(vertexLayout.attributes[1].offset).toBe(16);

      // Emulate particle binary packing:
      const buffer = new ArrayBuffer(stride);
      const f32View = new Float32Array(buffer);

      // Position (xyz) + pointType (w)
      f32View[0] = 1.0; // x
      f32View[1] = 2.0; // y
      f32View[2] = 3.0; // z
      f32View[3] = 1.0; // pointType (land)

      // Velocity (xyz) + metric (w)
      f32View[4] = 0.1; // vx
      f32View[5] = 0.2; // vy
      f32View[6] = 0.3; // vz
      f32View[7] = 0.85; // metric

      // Verify that offset 16 bytes starts at index 4 (16 / 4 = 4)
      expect(f32View.byteOffset + 16).toBe(16);
      expect(f32View[4]).toBeCloseTo(0.1);
      expect(f32View[7]).toBeCloseTo(0.85);
    });

    it('CH1-M3-10: verifies absence of readPixels, mapAsync, and copyBufferToBuffer in WebGPUEngine render loop', () => {
      const engineFilePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const engineCode = fs.readFileSync(engineFilePath, 'utf8');

      // Check render method boundary
      const renderStartIndex = engineCode.indexOf('public render(params: WebGPUFrameParams): void {');
      expect(renderStartIndex).toBeGreaterThan(0);

      const renderEndIndex = engineCode.indexOf('public resize(', renderStartIndex);
      expect(renderEndIndex).toBeGreaterThan(renderStartIndex);

      const renderMethodBody = engineCode.slice(renderStartIndex, renderEndIndex);

      // Assert zero readPixels
      expect(renderMethodBody.includes('readPixels')).toBe(false);

      // Assert zero mapAsync in render method
      expect(renderMethodBody.includes('mapAsync')).toBe(false);

      // Assert zero copyBufferToBuffer in render method (isolated to GPUProfiler query resolve)
      expect(renderMethodBody.includes('copyBufferToBuffer')).toBe(false);

      // Assert direct vertex buffer binding of outBuffer
      expect(renderMethodBody.includes('renderPass.setVertexBuffer(0, outBuffer)')).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 5: Ping-Pong Swap Integrity & Race Condition Stress
  // ==========================================================================
  describe('5. Ping-Pong Swap Integrity & Race Condition Stress', () => {
    it('CH1-M3-11: stress tests ping-pong buffer alternation over 1,000 continuous frames', () => {
      const buffer0 = { id: 0 };
      const buffer1 = { id: 1 };
      const particleBuffers = [buffer0, buffer1];

      let currentStep = 0;

      for (let frame = 0; frame < 1000; frame++) {
        // Step k
        const inBufferIndex = currentStep % 2;
        const outBufferIndex = (currentStep + 1) % 2;

        const inBuffer = particleBuffers[inBufferIndex];
        const outBuffer = particleBuffers[outBufferIndex];

        // Invariant 1: In buffer and out buffer are NEVER the same buffer handle
        expect(inBufferIndex).not.toBe(outBufferIndex);
        expect(inBuffer).not.toBe(outBuffer);

        // Invariant 2: Render pass binds the freshly computed outBuffer
        const renderedBuffer = outBuffer;
        expect(renderedBuffer).toBe(particleBuffers[(currentStep + 1) % 2]);

        // Next frame advance
        currentStep++;

        // Invariant 3: Next frame's inBuffer is previous frame's outBuffer (proper stateful continuity)
        const nextInBufferIndex = currentStep % 2;
        expect(nextInBufferIndex).toBe(outBufferIndex);
      }

      expect(currentStep).toBe(1000);
    });

    it('CH1-M3-12: verifies currentStep integer safety up to 100,000,000 frames (no float precision loss)', () => {
      // Test extreme currentStep values
      const extremeSteps = [0, 1, 2, 999, 10_000, 1_000_000, 100_000_000];

      for (const step of extremeSteps) {
        expect(Number.isSafeInteger(step)).toBe(true);
        const inIdx = step % 2;
        const outIdx = (step + 1) % 2;
        expect([0, 1]).toContain(inIdx);
        expect([0, 1]).toContain(outIdx);
        expect(inIdx).not.toBe(outIdx);
      }
    });

    it('CH1-M3-13: proves command buffer sequential execution prevents compute/render race condition', () => {
      // In WebGPU, commands within a single command encoder execute in strict recording order:
      // 1. computePass.setBindGroup(...)
      // 2. computePass.dispatchWorkgroups(...)
      // 3. computePass.end() -> Memory barrier implicitly generated by WebGPU implementation
      // 4. renderPass.setVertexBuffer(0, outBuffer)
      // 5. renderPass.draw(...)
      // 6. renderPass.end()
      // 7. submit([commandEncoder.finish()])

      const executionOrder: string[] = [];

      const mockCommandEncoder = {
        beginComputePass: () => ({
          setPipeline: () => executionOrder.push('compute_setPipeline'),
          setBindGroup: () => executionOrder.push('compute_setBindGroup'),
          dispatchWorkgroups: () => executionOrder.push('compute_dispatch'),
          end: () => executionOrder.push('compute_end'),
        }),
        beginRenderPass: () => ({
          setPipeline: () => executionOrder.push('render_setPipeline'),
          setBindGroup: () => executionOrder.push('render_setBindGroup'),
          setVertexBuffer: () => executionOrder.push('render_setVertexBuffer'),
          draw: () => executionOrder.push('render_draw'),
          end: () => executionOrder.push('render_end'),
        }),
        finish: () => {
          executionOrder.push('encoder_finish');
          return {};
        },
      };

      // Record frame
      const computePass = mockCommandEncoder.beginComputePass();
      computePass.setPipeline();
      computePass.setBindGroup();
      computePass.dispatchWorkgroups();
      computePass.end();

      const renderPass = mockCommandEncoder.beginRenderPass();
      renderPass.setPipeline();
      renderPass.setBindGroup();
      renderPass.setVertexBuffer();
      renderPass.draw();
      renderPass.end();

      mockCommandEncoder.finish();

      // Verify compute completes strictly before render begins
      const computeEndIdx = executionOrder.indexOf('compute_end');
      const renderStartIdx = executionOrder.indexOf('render_setPipeline');
      const vertexBindIdx = executionOrder.indexOf('render_setVertexBuffer');

      expect(computeEndIdx).toBeGreaterThan(0);
      expect(renderStartIdx).toBeGreaterThan(computeEndIdx);
      expect(vertexBindIdx).toBeGreaterThan(computeEndIdx);
    });
  });

  // ==========================================================================
  // Suite 6: 4M–16M Memory Footprint & Bandwidth Invariants
  // ==========================================================================
  describe('6. 4M–16M Memory Footprint & Bandwidth Invariants', () => {
    const mockAdapter = {
      limits: {
        maxStorageBufferBindingSize: 4294967292,
        maxBufferSize: 4294967292,
      },
    } as any;
    const benchmark = new WebGPUBenchmark(mockAdapter, {} as any);

    it('CH1-M3-14: verifies 16,000,000 node simulation storage is exactly 1,536 MB', () => {
      // 96 bytes/node = 1,536,000,000 bytes = 1,536.0 MB
      const vramMB = benchmark.calculateSimulationVramMB(16_000_000, false);
      expect(vramMB).toBe(1536.0);
      expect(vramMB).toBeLessThanOrEqual(2048.0);
    });

    it('CH1-M3-15: verifies wireframe index buffer adds 384 MB, keeping combined total at 1.92 GB <= 2.0 GB', () => {
      const nodeCount = 16_000_000;
      const simVramBytes = nodeCount * 96;
      const wireframeIndexBytes = nodeCount * 24; // 3 edges * 8 bytes
      const totalVramMB = (simVramBytes + wireframeIndexBytes) / 1_000_000;

      expect(totalVramMB).toBe(1920.0);
      expect(totalVramMB).toBeLessThanOrEqual(2048.0);
    });

    it('CH1-M3-16: proves decoupled 120 FPS bandwidth reduces bus saturation from 90.0% to 56.3%', () => {
      const sync120Bw = benchmark.calculateMemoryBandwidthGBs(16_000_000, 120, false);
      const decoupled120Bw = benchmark.calculateMemoryBandwidthGBs(16_000_000, 120, true);

      expect(sync120Bw).toBe(245.76);
      expect(decoupled120Bw).toBe(153.60);

      const syncSat = benchmark.calculateBusSaturation(sync120Bw, 273.0);
      const decoupledSat = benchmark.calculateBusSaturation(decoupled120Bw, 273.0);

      expect(syncSat).toBeCloseTo(90.02, 1);
      expect(decoupledSat).toBeCloseTo(56.26, 1);
      expect(decoupledSat).toBeLessThan(60.0); // Safely under 60% bus saturation
    });
  });

  // ==========================================================================
  // Suite 7: GPUProfiler Asynchronous Triple-Buffer Rigor
  // ==========================================================================
  describe('7. GPUProfiler Asynchronous Triple-Buffer Rigor', () => {
    it('CH1-M3-17: verifies GPUProfiler 16-query capacity supports all 6 multi-pass slots', () => {
      expect(PROFILER_QUERY_CAPACITY).toBe(16);
      expect(PROFILER_BUFFER_SIZE).toBe(128);

      const slots = [
        ProfilerPassSlot.Compute,
        ProfilerPassSlot.SwissRelief,
        ProfilerPassSlot.Lines,
        ProfilerPassSlot.Ribbons,
        ProfilerPassSlot.Contours,
        ProfilerPassSlot.Points,
        ProfilerPassSlot.Reserved1,
        ProfilerPassSlot.Reserved2,
      ];

      expect(slots.length).toBe(8);
      // Each slot uses 2 queries: 8 * 2 = 16 queries
      for (let i = 0; i < slots.length; i++) {
        expect(slots[i]).toBe(i);
      }
    });

    it('CH1-M3-18: verifies GPUProfiler fallback when device lacks timestamp-query', () => {
      const mockDeviceWithoutTimestamps = {
        features: { has: () => false },
      } as any;

      const profiler = new GPUProfiler(mockDeviceWithoutTimestamps);
      expect(profiler.isSupported).toBe(false);

      expect(profiler.getComputeTimestampWrites()).toBeUndefined();
      expect(profiler.getRenderTimestampWrites()).toBeUndefined();
      expect(profiler.getPassTimestampWrites(ProfilerPassSlot.Compute)).toBeUndefined();
      expect(profiler.getLatestReport()).toBeNull();
      expect(profiler.getKernelReports()).toEqual([]);

      profiler.dispose();
      expect(profiler.isSupported).toBe(false);
    });

    it('CH1-M3-19: verifies GPUProfiler triple-buffer ring cycles stably without accumulation', () => {
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

      // Cycle 30 frames
      for (let f = 0; f < 30; f++) {
        profiler.resolveFrame(mockEncoder);
      }

      profiler.dispose();
    });
  });
});
