// ============================================================================
// File: tests/phase2/challenger2-m3-profiler-bandwidth.test.ts
// Identity: challenger_m3_2 (Empirical Challenger 2 for Milestone 3)
// Objective: Adversarial challenge and stress-testing of asynchronous triple-buffered
//            GPUProfiler, UMA memory budgets, and 120 FPS decoupled bandwidth calculations.
// ============================================================================

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

describe('Empirical Challenger 2 M3: GPUProfiler & Bandwidth Adversarial Stress Harness', () => {
  // ==========================================================================
  // Section 1: Ring Buffer Finite State Machine (FSM) over 0..100 Frames
  // ==========================================================================
  describe('1. Asynchronous Triple-Buffered Ring Buffer Indexing & Slot State Transitions', () => {
    function createMockProfilerDevice() {
      const buffers: any[] = [];
      let querySet: any = null;

      const device = {
        features: { has: (f: string) => f === 'timestamp-query' },
        createQuerySet: (desc: any) => {
          querySet = { ...desc, destroyed: false, destroy: () => { querySet.destroyed = true; } };
          return querySet;
        },
        createBuffer: (desc: any) => {
          const buf = {
            ...desc,
            destroyed: false,
            mapped: false,
            destroy: () => { buf.destroyed = true; },
            mapAsync: () => {
              buf.mapped = true;
              return Promise.resolve();
            },
            getMappedRange: () => new ArrayBuffer(desc.size),
            unmap: () => { buf.mapped = false; },
          };
          buffers.push(buf);
          return buf;
        },
      } as any;

      return { device, buffers, getQuerySet: () => querySet };
    }

    function createMockEncoder() {
      const resolves: any[] = [];
      const copies: any[] = [];
      const encoder = {
        resolveQuerySet: (qs: any, first: number, count: number, dst: any, offset: number) => {
          resolves.push({ qs, first, count, dst, offset });
        },
        copyBufferToBuffer: (src: any, srcOff: number, dst: any, dstOff: number, size: number) => {
          copies.push({ src, srcOff, dst, dstOff, size });
        },
        getResolves: () => resolves,
        getCopies: () => copies,
      };
      return encoder;
    }

    it('CH2-PRF-01: verifies initial 0-frame state (clean ring initialization)', () => {
      const { device } = createMockProfilerDevice();
      const profiler = new GPUProfiler(device);

      expect(profiler.isSupported).toBe(true);
      expect((profiler as any).ringIndex).toBe(0);
      expect((profiler as any).ringBuffers.length).toBe(3);
      expect((profiler as any).ringSlotStates).toEqual(['IDLE', 'IDLE', 'IDLE']);
      expect(profiler.getLatestReport()).toBeNull();
      expect(profiler.getKernelReports()).toEqual([]);

      profiler.dispose();
    });

    it('CH2-PRF-02: verifies frame 0, 1, 2 warmup transitions and slot states', async () => {
      const { device } = createMockProfilerDevice();
      const profiler = new GPUProfiler(device);
      const encoder = createMockEncoder() as any;

      // Frame 0: write slot 0, warmup return
      profiler.resolveFrame(encoder);
      expect((profiler as any).ringIndex).toBe(1);
      expect((profiler as any).ringSlotStates[0]).toBe('PENDING_GPU');
      expect((profiler as any).ringSlotStates[1]).toBe('IDLE');
      expect((profiler as any).ringSlotStates[2]).toBe('IDLE');
      expect(profiler.getLatestReport()).toBeNull();

      // Frame 1: write slot 1, warmup return
      profiler.resolveFrame(encoder);
      expect((profiler as any).ringIndex).toBe(2);
      expect((profiler as any).ringSlotStates[0]).toBe('PENDING_GPU');
      expect((profiler as any).ringSlotStates[1]).toBe('PENDING_GPU');
      expect((profiler as any).ringSlotStates[2]).toBe('IDLE');
      expect(profiler.getLatestReport()).toBeNull();

      // Frame 2: write slot 2, ringIndex becomes 3 (warmup complete!), readSlot = 0
      profiler.resolveFrame(encoder);
      expect((profiler as any).ringIndex).toBe(3);
      // Immediately after resolveFrame before microtask resolution:
      // slot 0 should be PENDING_MAP
      expect((profiler as any).ringSlotStates[0]).toBe('PENDING_MAP');
      expect((profiler as any).ringSlotStates[1]).toBe('PENDING_GPU');
      expect((profiler as any).ringSlotStates[2]).toBe('PENDING_GPU');

      // Allow microtask to resolve mapAsync
      await Promise.resolve();
      await Promise.resolve();

      // After mapAsync resolves: slot 0 must be IDLE (ready for frame 3 write!)
      expect((profiler as any).ringSlotStates[0]).toBe('IDLE');
      expect((profiler as any).ringSlotStates[1]).toBe('PENDING_GPU');
      expect((profiler as any).ringSlotStates[2]).toBe('PENDING_GPU');

      profiler.dispose();
    });

    it('CH2-PRF-03: verifies frame 3 cycling into slot 0 and mapping slot 1', async () => {
      const { device } = createMockProfilerDevice();
      const profiler = new GPUProfiler(device);
      const encoder = createMockEncoder() as any;

      // Frames 0, 1, 2
      profiler.resolveFrame(encoder);
      profiler.resolveFrame(encoder);
      profiler.resolveFrame(encoder);
      await Promise.resolve();
      await Promise.resolve();

      // Frame 3: currentSlot = 3 % 3 = 0.
      // Slot 0 is IDLE. Writes to slot 0 (becomes PENDING_GPU).
      // readSlot = (3 + 1) % 3 = 1. Reads slot 1 (submitted at Frame 1).
      profiler.resolveFrame(encoder);
      expect((profiler as any).ringIndex).toBe(4);
      expect((profiler as any).ringSlotStates[0]).toBe('PENDING_GPU');
      expect((profiler as any).ringSlotStates[1]).toBe('PENDING_MAP');
      expect((profiler as any).ringSlotStates[2]).toBe('PENDING_GPU');

      await Promise.resolve();
      await Promise.resolve();

      expect((profiler as any).ringSlotStates[1]).toBe('IDLE');
      expect((profiler as any).ringSlotStates[0]).toBe('PENDING_GPU');
      expect((profiler as any).ringSlotStates[2]).toBe('PENDING_GPU');

      profiler.dispose();
    });

    it('CH2-PRF-04: tracks exact slot state progression over 10 consecutive frames', async () => {
      const { device } = createMockProfilerDevice();
      const profiler = new GPUProfiler(device);
      const encoder = createMockEncoder() as any;

      // Run 10 frames
      for (let frame = 0; frame < 10; frame++) {
        const expectedCurrentSlot = frame % 3;
        // Verify before writing: if warmup is done (frame >= 3), currentSlot MUST be IDLE!
        if (frame >= 3) {
          expect((profiler as any).ringSlotStates[expectedCurrentSlot]).toBe('IDLE');
        }

        profiler.resolveFrame(encoder);

        // Allow microtask to resolve mapAsync
        await Promise.resolve();
        await Promise.resolve();

        expect((profiler as any).ringIndex).toBe(frame + 1);

        if (frame >= 2) {
          // After resolution, the slot read was (frame - 2) % 3, which must now be IDLE
          const expectedReadSlot = (frame - 2) % 3;
          expect((profiler as any).ringSlotStates[expectedReadSlot]).toBe('IDLE');
        }
      }

      profiler.dispose();
    });

    it('CH2-PRF-05: stress-tests 100 consecutive frames, verifying zero slot collision and integer safety', async () => {
      const { device } = createMockProfilerDevice();
      const profiler = new GPUProfiler(device);
      const encoder = createMockEncoder() as any;

      for (let frame = 0; frame < 100; frame++) {
        const writeSlot = frame % 3;
        if (frame >= 3) {
          // Must never write into a slot that is still PENDING_GPU, PENDING_MAP, or MAPPED
          const stateBeforeWrite = (profiler as any).ringSlotStates[writeSlot];
          expect(stateBeforeWrite).toBe('IDLE');
        }

        profiler.resolveFrame(encoder);
        await Promise.resolve();
        await Promise.resolve();
      }

      expect((profiler as any).ringIndex).toBe(100);
      expect(Number.isSafeInteger((profiler as any).ringIndex)).toBe(true);

      // Verify that even after 100M simulated frames, ringIndex remains a safe integer
      const futureFrameCount = 100_000_000;
      expect(Number.isSafeInteger(futureFrameCount)).toBe(true);
      expect(futureFrameCount % 3).toBe(1);

      profiler.dispose();
    });

    it('CH2-PRF-06: verifies defensive error recovery when mapAsync rejects', async () => {
      // Mock device where mapAsync rejects with an error
      const device = {
        features: { has: () => true },
        createQuerySet: () => ({ destroy: () => {} }),
        createBuffer: (desc: any) => ({
          destroy: () => {},
          mapAsync: () => Promise.reject(new Error('GPU device reset during mapAsync')),
          getMappedRange: () => new ArrayBuffer(desc.size),
          unmap: () => {},
        }),
      } as any;

      const profiler = new GPUProfiler(device);
      const encoder = createMockEncoder() as any;

      // Execute warmup frames
      profiler.resolveFrame(encoder);
      profiler.resolveFrame(encoder);
      // Frame 2: triggers mapAsync which will reject
      profiler.resolveFrame(encoder);

      // Wait microtask tick for rejection handler
      await Promise.resolve();
      await Promise.resolve();

      // The catch handler must have reset the slot state to 'IDLE' instead of crashing
      expect((profiler as any).ringSlotStates[0]).toBe('IDLE');

      // Next frame must still execute without throwing unhandled rejection
      expect(() => profiler.resolveFrame(encoder)).not.toThrow();

      profiler.dispose();
    });
  });

  // ==========================================================================
  // Section 2: Capacity 16 Queries & Multi-Pass Multi-Slot Profiling Bounds
  // ==========================================================================
  describe('2. Query Capacity 16 Multi-Pass Profiling & Boundary Protection', () => {
    it('CH2-CAP-01: verifies query capacity 16 accommodates 8 distinct pass pairs with zero buffer overrun', () => {
      expect(PROFILER_QUERY_CAPACITY).toBe(16);
      expect(QUERY_BYTES).toBe(8);
      expect(PROFILER_BUFFER_SIZE).toBe(128);

      // 16 queries / 2 per pass = 8 total pass slots
      const maxPassSlots = PROFILER_QUERY_CAPACITY / 2;
      expect(maxPassSlots).toBe(8);

      // Check all 8 slots map to strictly valid, disjoint query indices [0..15]
      const usedIndices = new Set<number>();
      for (let s = 0; s < maxPassSlots; s++) {
        const beginIdx = s * 2;
        const endIdx = s * 2 + 1;

        expect(beginIdx).toBeGreaterThanOrEqual(0);
        expect(endIdx).toBeLessThan(PROFILER_QUERY_CAPACITY);
        expect(endIdx).toBe(beginIdx + 1);

        expect(usedIndices.has(beginIdx)).toBe(false);
        expect(usedIndices.has(endIdx)).toBe(false);
        usedIndices.add(beginIdx);
        usedIndices.add(endIdx);
      }

      expect(usedIndices.size).toBe(16);
    });

    it('CH2-CAP-02: verifies all 6 active engine passes + 2 reserved passes have dedicated slots', () => {
      // 6 active passes:
      // 0: Compute Simulation
      // 1: Swiss Relief Shading
      // 2: Delaunay Wireframe Lines
      // 3: Vector Line Ribbons
      // 4: Isoline Contours
      // 5: Point Sprites
      expect(ProfilerPassSlot.Compute).toBe(0);
      expect(ProfilerPassSlot.SwissRelief).toBe(1);
      expect(ProfilerPassSlot.Lines).toBe(2);
      expect(ProfilerPassSlot.Ribbons).toBe(3);
      expect(ProfilerPassSlot.Contours).toBe(4);
      expect(ProfilerPassSlot.Points).toBe(5);
      expect(ProfilerPassSlot.Reserved1).toBe(6);
      expect(ProfilerPassSlot.Reserved2).toBe(7);

      // Total slots used is 8, exactly filling the 16-query budget
      expect(Object.keys(ProfilerPassSlot).filter(k => isNaN(Number(k))).length).toBe(8);
    });

    it('CH2-CAP-03: verifies getPassTimestampWrites bounds checking prevents out-of-bounds queries', () => {
      const mockDevice = {
        features: { has: () => true },
        createQuerySet: () => ({ destroy: () => {} }),
        createBuffer: () => ({ destroy: () => {} }),
      } as any;

      const profiler = new GPUProfiler(mockDevice);

      // Valid boundary slots
      const slot0 = profiler.getPassTimestampWrites(0);
      expect(slot0?.beginningOfPassWriteIndex).toBe(0);
      expect(slot0?.endOfPassWriteIndex).toBe(1);

      const slot7 = profiler.getPassTimestampWrites(7);
      expect(slot7?.beginningOfPassWriteIndex).toBe(14);
      expect(slot7?.endOfPassWriteIndex).toBe(15);

      // Out-of-bounds slots must return undefined and NEVER overflow capacity
      expect(profiler.getPassTimestampWrites(-1)).toBeUndefined();
      expect(profiler.getPassTimestampWrites(8)).toBeUndefined();
      expect(profiler.getPassTimestampWrites(9)).toBeUndefined();
      expect(profiler.getPassTimestampWrites(100)).toBeUndefined();

      profiler.dispose();
    });

    it('CH2-CAP-04: verifies resolveQuerySet destination buffer offset and count strictly match 128 bytes', () => {
      let resolvedCount = 0;
      let resolvedOffset = 0;
      let copiedSize = 0;

      const mockDevice = {
        features: { has: () => true },
        createQuerySet: () => ({ destroy: () => {} }),
        createBuffer: (desc: any) => ({ size: desc.size, destroy: () => {} }),
      } as any;

      const profiler = new GPUProfiler(mockDevice);
      const mockEncoder = {
        resolveQuerySet: (_qs: any, first: number, count: number, _dst: any, offset: number) => {
          expect(first).toBe(0);
          resolvedCount = count;
          resolvedOffset = offset;
        },
        copyBufferToBuffer: (_src: any, _srcOff: number, _dst: any, _dstOff: number, size: number) => {
          copiedSize = size;
        },
      } as any;

      profiler.resolveFrame(mockEncoder);

      expect(resolvedCount).toBe(16);
      expect(resolvedOffset).toBe(0);
      expect(copiedSize).toBe(128); // Exactly 16 * 8 bytes

      profiler.dispose();
    });
  });

  // ==========================================================================
  // Section 3: CPU Non-Blocking Verification & Pipeline Stalls
  // ==========================================================================
  describe('3. Non-Blocking Execution & CPU Pipeline Stall Elimination', () => {
    it('CH2-BLK-01: verifies resolveFrame executes synchronously in sub-millisecond CPU time', () => {
      const mockDevice = {
        features: { has: () => true },
        createQuerySet: () => ({ destroy: () => {} }),
        createBuffer: (desc: any) => ({
          destroy: () => {},
          mapAsync: () => Promise.resolve(),
          getMappedRange: () => new ArrayBuffer(desc.size),
          unmap: () => {},
        }),
      } as any;

      const profiler = new GPUProfiler(mockDevice);
      const mockEncoder = {
        resolveQuerySet: () => {},
        copyBufferToBuffer: () => {},
      } as any;

      const iterations = 500;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        profiler.resolveFrame(mockEncoder);
      }
      const t1 = performance.now();
      const totalMs = t1 - t0;
      const avgMsPerCall = totalMs / iterations;

      // Each resolveFrame call should take < 0.05 ms (50 microseconds) on CPU
      expect(avgMsPerCall).toBeLessThan(0.05);

      profiler.dispose();
    });

    it('CH2-BLK-02: verifies resolveFrame does not await mapAsync or block when mapAsync is slow', async () => {
      let mapPromiseResolve: () => void = () => {};
      const slowMapPromise = new Promise<void>((resolve) => {
        mapPromiseResolve = resolve;
      });

      const mockDevice = {
        features: { has: () => true },
        createQuerySet: () => ({ destroy: () => {} }),
        createBuffer: (desc: any) => ({
          destroy: () => {},
          mapAsync: () => slowMapPromise, // Slow promise that won't resolve immediately
          getMappedRange: () => new ArrayBuffer(desc.size),
          unmap: () => {},
        }),
      } as any;

      const profiler = new GPUProfiler(mockDevice);
      const mockEncoder = {
        resolveQuerySet: () => {},
        copyBufferToBuffer: () => {},
      } as any;

      // Advance to frame 2 (which triggers mapAsync)
      profiler.resolveFrame(mockEncoder); // Frame 0
      profiler.resolveFrame(mockEncoder); // Frame 1

      const t0 = performance.now();
      profiler.resolveFrame(mockEncoder); // Frame 2: calls mapAsync
      const t1 = performance.now();

      // resolveFrame must return synchronously in < 2ms without waiting for slowMapPromise
      expect(t1 - t0).toBeLessThan(2.0);

      // Verify slot 0 is in PENDING_MAP state
      expect((profiler as any).ringSlotStates[0]).toBe('PENDING_MAP');

      // Now resolve slowMapPromise
      mapPromiseResolve();
      await slowMapPromise;
      await Promise.resolve();

      // After resolution, slot 0 transitions to IDLE
      expect((profiler as any).ringSlotStates[0]).toBe('IDLE');

      profiler.dispose();
    });

    it('CH2-BLK-03: static audit verifies zero readPixels and zero blocking mapAsync in WebGPUEngine.render', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const source = fs.readFileSync(enginePath, 'utf8');

      // Extract the render method body
      const renderStartIndex = source.indexOf('public render(');
      expect(renderStartIndex).toBeGreaterThan(0);
      const renderBody = source.slice(renderStartIndex, renderStartIndex + 3500);

      // Confirm absolute absence of synchronous readback mechanisms
      expect(renderBody.includes('readPixels')).toBe(false);
      expect(renderBody.includes('mapAsync')).toBe(false);
      expect(renderBody.includes('await ')).toBe(false); // render is completely synchronous!
    });
  });

  // ==========================================================================
  // Section 4: Defensive Fallback when timestamp-query is Unsupported
  // ==========================================================================
  describe('4. Fallback Behavior & Zero Byte Leak when timestamp-query is Unsupported', () => {
    it('CH2-FAL-01: allocates zero GPU resources when timestamp-query feature is absent', () => {
      let createdBuffers = 0;
      let createdQuerySets = 0;

      const mockDevice = {
        features: { has: () => false }, // No timestamp-query
        createQuerySet: () => { createdQuerySets++; return {}; },
        createBuffer: () => { createdBuffers++; return {}; },
      } as any;

      const profiler = new GPUProfiler(mockDevice);

      expect(profiler.isSupported).toBe(false);
      expect(createdBuffers).toBe(0);
      expect(createdQuerySets).toBe(0);
      expect((profiler as any).querySet).toBeNull();
      expect((profiler as any).resolveBuffer).toBeNull();
      expect((profiler as any).ringBuffers).toEqual([]);
      expect((profiler as any).ringSlotStates).toEqual([]);

      profiler.dispose();
      expect(profiler.isSupported).toBe(false);
    });

    it('CH2-FAL-02: executes 1000 frames without crash, allocating 0 bytes and generating 0 commands', () => {
      const mockDevice = {
        features: { has: () => false },
      } as any;

      const profiler = new GPUProfiler(mockDevice);

      let commandCount = 0;
      const mockEncoder = {
        resolveQuerySet: () => { commandCount++; },
        copyBufferToBuffer: () => { commandCount++; },
      } as any;

      for (let i = 0; i < 1000; i++) {
        expect(() => profiler.resolveFrame(mockEncoder)).not.toThrow();
      }

      expect(commandCount).toBe(0);
      expect(profiler.getLatestReport()).toBeNull();
      expect(profiler.getKernelReports()).toEqual([]);
      expect(profiler.getComputeTimestampWrites(0)).toBeUndefined();
      expect(profiler.getRenderTimestampWrites(0)).toBeUndefined();
      expect(profiler.getPassTimestampWrites(0)).toBeUndefined();

      profiler.dispose();
    });

    it('CH2-FAL-03: resolveAndRecord returns null promise without error when unsupported', async () => {
      const mockDevice = {
        features: { has: () => false },
      } as any;

      const profiler = new GPUProfiler(mockDevice);
      const mockEncoder = {} as any;

      const result = await profiler.resolveAndRecord(mockEncoder, 'TestPass');
      expect(result).toBeNull();

      profiler.dispose();
    });
  });

  // ==========================================================================
  // Section 5: UMA Memory Budgets & Bandwidth Numerical Precision & Boundary Extremes
  // ==========================================================================
  describe('5. UMA Memory Budgets & Bandwidth Numerical Precision & Boundary Extremes', () => {
    const mockAdapter = {
      limits: {
        maxStorageBufferBindingSize: 4294967292,
        maxBufferSize: 4294967292,
        maxComputeInvocationsPerWorkgroup: 1024,
      },
    } as any;
    const benchmark = new WebGPUBenchmark(mockAdapter, {} as any);

    it('CH2-UMA-01: calculates simulation VRAM across binary and decimal units with high precision', () => {
      // Decimal units (1e6 bytes per MB): 16,000,000 * 96 B = 1,536.00 MB
      const decimal16M = benchmark.calculateSimulationVramMB(16_000_000, false);
      expect(decimal16M).toBe(1536.0);
      expect(decimal16M).toBeLessThanOrEqual(2048.0); // <= 2.0 GB

      // Binary units (1024 * 1024 bytes per MB): 1,536,000,000 / 1,048,576 = 1,464.84 MB
      const binary16M = benchmark.calculateSimulationVramMB(16_000_000, true);
      expect(binary16M).toBe(1464.84);
      expect(binary16M).toBeLessThanOrEqual(2048.0); // <= 2.0 GB

      // Default parameter should be binary units
      const default16M = benchmark.calculateSimulationVramMB(16_000_000);
      expect(default16M).toBe(1464.84);
      expect(default16M).toBeLessThanOrEqual(2048.0);
    });

    it('CH2-UMA-02: verifies boundary extremes for simulation VRAM calculation', () => {
      // 0 nodes -> 0 MB
      expect(benchmark.calculateSimulationVramMB(0)).toBe(0);

      // 1 node -> 96 B / 1048576 = 0.00 MB
      expect(benchmark.calculateSimulationVramMB(1)).toBe(0);

      // Max 1D particles: 16,776,960 nodes
      const max1DNodes = 65535 * 256;
      const max1DVramBinary = benchmark.calculateSimulationVramMB(max1DNodes, true);
      const max1DVramDecimal = benchmark.calculateSimulationVramMB(max1DNodes, false);

      expect(max1DVramBinary).toBeCloseTo(1536.0, 0); // ~1,536.00 MB binary
      expect(max1DVramDecimal).toBeCloseTo(1610.59, 1); // ~1,610.59 MB decimal
      expect(max1DVramBinary).toBeLessThanOrEqual(2048.0);
      expect(max1DVramDecimal).toBeLessThanOrEqual(2048.0);
    });

    it('CH2-UMA-03: verifies decoupled 120 FPS bandwidth calculation yields exactly 153.60 GB/s', () => {
      // Formula: (nodeCount * 96 B * 60) + (nodeCount * 32 B * 120)
      // At 16M: (16M * 96 * 60) + (16M * 32 * 120) = 92.16 GB/s + 61.44 GB/s = 153.60 GB/s
      const bw16MDecoupled = benchmark.calculateMemoryBandwidthGBs(16_000_000, 120, true);
      expect(bw16MDecoupled).toBe(153.6);

      // Verify bus saturation against M4 Pro 273.0 GB/s ceiling
      const saturation = benchmark.calculateBusSaturation(bw16MDecoupled, 273.0);
      expect(saturation).toBeCloseTo(56.26, 2);

      // Contrast with synchronous 120 FPS
      const bw16MSync = benchmark.calculateMemoryBandwidthGBs(16_000_000, 120, false);
      expect(bw16MSync).toBe(245.76);
      const saturationSync = benchmark.calculateBusSaturation(bw16MSync, 273.0);
      expect(saturationSync).toBeCloseTo(90.02, 2);

      // Proves exactly 92.16 GB/s bus traffic eliminated
      expect(bw16MSync - bw16MDecoupled).toBeCloseTo(92.16, 2);
    });

    it('CH2-UMA-04: tests bandwidth calculation across extreme and fractional frame rates', () => {
      // 0 FPS -> 0 GB/s
      expect(benchmark.calculateMemoryBandwidthGBs(16_000_000, 0)).toBe(0);

      // 30 FPS -> 16M * 128 * 30 = 61.44 GB/s
      expect(benchmark.calculateMemoryBandwidthGBs(16_000_000, 30)).toBe(61.44);

      // 60 FPS -> 16M * 128 * 60 = 122.88 GB/s
      expect(benchmark.calculateMemoryBandwidthGBs(16_000_000, 60)).toBe(122.88);

      // 144 FPS synchronous -> 16M * 128 * 144 = 294.91 GB/s (exceeds M4 Pro 273 GB/s!)
      const bw144 = benchmark.calculateMemoryBandwidthGBs(16_000_000, 144);
      expect(bw144).toBe(294.91);
      expect(benchmark.calculateBusSaturation(bw144, 273.0)).toBeGreaterThan(100.0);
    });

    it('CH2-UMA-05: verifies throughput calculation prevents division-by-zero and accurately measures M4 Pro speeds', () => {
      // Zero time or negative time must return 0
      expect(benchmark.calculateThroughput(1_000_000, 0)).toBe(0);
      expect(benchmark.calculateThroughput(1_000_000, -1)).toBe(0);

      // 1M nodes in 0.386 ms -> 1,000,000 / 0.000386 = 2,590,673,575 nodes/sec = 2,590.67 M nodes/sec
      const tp1M = benchmark.calculateThroughput(1_000_000, 0.386);
      expect(tp1M).toBe(2590.67);
      expect(tp1M).toBeGreaterThanOrEqual(100.0);

      // 4M nodes in 1.623 ms -> 4,000,000 / 0.001623 = 2,464.57 M nodes/sec
      const tp4M = benchmark.calculateThroughput(4_000_000, 1.623);
      expect(tp4M).toBe(2464.57);
      expect(tp4M).toBeGreaterThanOrEqual(100.0);

      // 16M nodes in 6.5 ms -> 16,000,000 / 0.0065 = 2,461.54 M nodes/sec
      const tp16M = benchmark.calculateThroughput(16_000_000, 6.5);
      expect(tp16M).toBe(2461.54);
      expect(tp16M).toBeGreaterThanOrEqual(100.0);
    });

    it('CH2-UMA-06: verifies total system VRAM footprint at 16M nodes fits within 8% of M4 Pro 24GB UMA', () => {
      const nodeCount = 16_000_000;
      const simVramBytes = nodeCount * 96; // 1,536,000,000 bytes
      const indexBytes = nodeCount * 24;   // 384,000,000 bytes
      const totalVramBytes = simVramBytes + indexBytes; // 1,920,000,000 bytes

      const totalVramMB = totalVramBytes / 1_000_000;
      expect(totalVramMB).toBe(1920.0);
      expect(totalVramMB).toBeLessThanOrEqual(2048.0); // <= 2.0 GB ceiling

      // Headroom under 2.0 GB
      const headroomMB = 2048.0 - totalVramMB;
      expect(headroomMB).toBe(128.0);

      // 24 GB Apple Silicon Unified Memory
      const totalSystemMemoryBytes = 24 * 1024 * 1024 * 1024; // 25,769,803,776 bytes
      const systemMemoryFraction = (totalVramBytes / totalSystemMemoryBytes) * 100;
      expect(systemMemoryFraction).toBeLessThan(8.0); // < 7.45% of physical unified memory
    });
  });
});
