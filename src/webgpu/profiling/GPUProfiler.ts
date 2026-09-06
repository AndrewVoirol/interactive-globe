// ============================================================================
// File: src/webgpu/profiling/GPUProfiler.ts
// Description: Non-blocking asynchronous triple-buffered GPUQuerySet timestamp profiler
// Architecture: 16-query capacity, multi-pass query pair mapping, Apple Silicon Metal SIMD32
// ============================================================================

export const PROFILER_QUERY_CAPACITY = 16;
export const QUERY_BYTES = 8; // uint64
export const PROFILER_BUFFER_SIZE = PROFILER_QUERY_CAPACITY * QUERY_BYTES; // 128 bytes

export enum ProfilerPassSlot {
  Compute = 0,     // Queries 0, 1: Particle Compute Simulation
  SwissRelief = 1, // Queries 2, 3: Swiss Relief Shading
  Lines = 2,       // Queries 4, 5: Delaunay Wireframe Lines
  Ribbons = 3,     // Queries 6, 7: Vector Line Ribbons
  Contours = 4,    // Queries 8, 9: Isoline Contours
  Points = 5,      // Queries 10, 11: Point Sprites
  Reserved1 = 6,   // Queries 12, 13
  Reserved2 = 7,   // Queries 14, 15
}

export interface KernelProfileReport {
  passName: string;
  gpuTimeNs: bigint;
  gpuTimeUs: number;
  gpuTimeMs: number;
}

export interface FrameProfileReport {
  timestamp: number;
  computeMs: number;
  renderMs: number;
  reliefMs: number;
  linesMs: number;
  ribbonsMs: number;
  contoursMs: number;
  pointsMs: number;
  totalGpuMs: number;
}

export class GPUProfiler {
  private device: GPUDevice;
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private ringBuffers: GPUBuffer[] = [];
  private ringSlotStates: ('IDLE' | 'PENDING_GPU' | 'PENDING_MAP' | 'MAPPED')[] = [];
  private ringIndex: number = 0;
  private readonly ringSize: number = 3; // Triple buffering
  private enabled: boolean = false;
  private latestReport: FrameProfileReport | null = null;
  private latestKernelReports: KernelProfileReport[] = [];

  constructor(device: GPUDevice) {
    this.device = device;
    if (device?.features?.has && device.features.has('timestamp-query') && typeof device.createQuerySet === 'function') {
      const bufferUsage = typeof GPUBufferUsage !== 'undefined'
        ? GPUBufferUsage
        : {
            MAP_READ: 0x0001,
            COPY_SRC: 0x0004,
            COPY_DST: 0x0008,
            QUERY_RESOLVE: 0x0200,
          };

      this.enabled = true;
      this.querySet = device.createQuerySet({
        type: 'timestamp',
        count: PROFILER_QUERY_CAPACITY,
      });

      this.resolveBuffer = device.createBuffer({
        size: PROFILER_BUFFER_SIZE,
        usage: bufferUsage.QUERY_RESOLVE | bufferUsage.COPY_SRC,
      });

      for (let i = 0; i < this.ringSize; i++) {
        this.ringBuffers.push(
          device.createBuffer({
            size: PROFILER_BUFFER_SIZE,
            usage: bufferUsage.MAP_READ | bufferUsage.COPY_DST,
          })
        );
        this.ringSlotStates.push('IDLE');
      }
    }
  }

  public get isSupported(): boolean {
    return this.enabled;
  }

  public getComputeTimestampWrites(passIndex: number = 0): GPUComputePassTimestampWrites | undefined {
    if (!this.enabled || !this.querySet) return undefined;
    const slot = passIndex;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: slot * 2,
      endOfPassWriteIndex: slot * 2 + 1,
    };
  }

  public getRenderTimestampWrites(passIndex: number = 0): GPURenderPassTimestampWrites | undefined {
    if (!this.enabled || !this.querySet) return undefined;
    const slot = passIndex === 0 ? ProfilerPassSlot.SwissRelief : passIndex;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: slot * 2,
      endOfPassWriteIndex: slot * 2 + 1,
    };
  }

  public getPassTimestampWrites(slot: number | ProfilerPassSlot): GPUComputePassTimestampWrites | undefined {
    if (!this.enabled || !this.querySet) return undefined;
    if (slot < 0 || slot >= PROFILER_QUERY_CAPACITY / 2) return undefined;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: slot * 2,
      endOfPassWriteIndex: slot * 2 + 1,
    };
  }

  public getTimestampWrites(): GPUComputePassTimestampWrites | undefined {
    return this.getComputeTimestampWrites(0);
  }

  public resolveFrame(encoder: GPUCommandEncoder): void {
    if (!this.enabled || !this.querySet || !this.resolveBuffer) return;

    const currentSlot = this.ringIndex % this.ringSize;
    const destBuffer = this.ringBuffers[currentSlot];
    const readSlot = (this.ringIndex + 1) % this.ringSize;
    this.ringIndex++;

    if (this.ringSlotStates[currentSlot] === 'MAPPED' || this.ringSlotStates[currentSlot] === 'PENDING_MAP') {
      return;
    }

    // 1. Resolve all 16 queries into resolveBuffer
    encoder.resolveQuerySet(this.querySet, 0, PROFILER_QUERY_CAPACITY, this.resolveBuffer, 0);

    // 2. Copy resolve buffer into current staging ring buffer slot
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, destBuffer, 0, PROFILER_BUFFER_SIZE);
    this.ringSlotStates[currentSlot] = 'PENDING_GPU';

    // 3. Initiate non-blocking read for slot from 2 frames ago (in 3-slot ring: (currentSlot + 1) % 3)
    if (this.ringIndex < this.ringSize) {
      // Ring warmup
      return;
    }

    const readBuffer = this.ringBuffers[readSlot];

    if (this.ringSlotStates[readSlot] === 'PENDING_GPU') {
      this.ringSlotStates[readSlot] = 'PENDING_MAP';
      const mapMode = typeof GPUMapMode !== 'undefined' ? GPUMapMode : { READ: 0x0001, WRITE: 0x0002 };
      readBuffer.mapAsync(mapMode.READ).then(() => {
        if (this.ringSlotStates[readSlot] !== 'PENDING_MAP') return;
        this.ringSlotStates[readSlot] = 'MAPPED';
        const mappedData = readBuffer.getMappedRange().slice(0);
        readBuffer.unmap();
        this.ringSlotStates[readSlot] = 'IDLE';

        const timestamps = new BigUint64Array(mappedData);
        const getDeltaMs = (s: number): number => {
          const t0 = timestamps[s * 2];
          const t1 = timestamps[s * 2 + 1];
          if (t1 >= t0 && t0 > 0n) {
            return Number(t1 - t0) / 1_000_000;
          }
          return 0;
        };

        const computeMs = getDeltaMs(ProfilerPassSlot.Compute);
        const reliefMs = getDeltaMs(ProfilerPassSlot.SwissRelief);
        const linesMs = getDeltaMs(ProfilerPassSlot.Lines);
        const ribbonsMs = getDeltaMs(ProfilerPassSlot.Ribbons);
        const contoursMs = getDeltaMs(ProfilerPassSlot.Contours);
        const pointsMs = getDeltaMs(ProfilerPassSlot.Points);
        const renderMs = reliefMs + linesMs + ribbonsMs + contoursMs + pointsMs;

        this.latestReport = {
          timestamp: performance.now(),
          computeMs,
          renderMs,
          reliefMs,
          linesMs,
          ribbonsMs,
          contoursMs,
          pointsMs,
          totalGpuMs: computeMs + renderMs,
        };

        const passNames = [
          'Particle Compute',
          'Swiss Relief Shading',
          'Delaunay Wireframe Lines',
          'Vector Line Ribbons',
          'Isoline Contours',
          'Point Sprites',
          'Reserved 1',
          'Reserved 2',
        ];

        this.latestKernelReports = passNames.map((name, idx) => {
          const t0 = timestamps[idx * 2];
          const t1 = timestamps[idx * 2 + 1];
          const deltaNs = (t1 >= t0 && t0 > 0n) ? t1 - t0 : 0n;
          const deltaUs = Number(deltaNs) / 1000;
          return {
            passName: name,
            gpuTimeNs: deltaNs,
            gpuTimeUs: deltaUs,
            gpuTimeMs: deltaUs / 1000,
          };
        });
      }).catch(() => {
        this.ringSlotStates[readSlot] = 'IDLE';
      });
    }
  }

  public getLatestReport(): FrameProfileReport | null {
    return this.latestReport;
  }

  public getKernelReports(): KernelProfileReport[] {
    return this.latestKernelReports;
  }

  public resolveAndRecord(encoder: GPUCommandEncoder, passName: string): Promise<KernelProfileReport | null> {
    if (!this.enabled || !this.querySet || !this.resolveBuffer) {
      return Promise.resolve(null);
    }

    const currentSlot = this.ringIndex % this.ringSize;
    const destBuffer = this.ringBuffers[currentSlot];

    encoder.resolveQuerySet(this.querySet, 0, 2, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, destBuffer, 0, 16);

    const readSlot = (this.ringIndex + 1) % this.ringSize;
    const readBuffer = this.ringBuffers[readSlot];

    this.ringIndex++;

    if (this.ringIndex < this.ringSize) {
      return Promise.resolve(null);
    }

    const mapMode = typeof GPUMapMode !== 'undefined' ? GPUMapMode : { READ: 0x0001, WRITE: 0x0002 };
    return readBuffer.mapAsync(mapMode.READ).then(() => {
      const mappedData = readBuffer.getMappedRange().slice(0);
      readBuffer.unmap();

      const timestamps = new BigUint64Array(mappedData);
      const t0 = timestamps[0];
      const t1 = timestamps[1];
      const deltaNs = t1 >= t0 ? t1 - t0 : 0n;
      const deltaUs = Number(deltaNs) / 1000;
      const deltaMs = deltaUs / 1000;

      return {
        passName,
        gpuTimeNs: deltaNs,
        gpuTimeUs: deltaUs,
        gpuTimeMs: deltaMs,
      };
    }).catch(() => null);
  }

  public dispose(): void {
    if (this.querySet) {
      this.querySet.destroy();
      this.querySet = null;
    }
    if (this.resolveBuffer) {
      this.resolveBuffer.destroy();
      this.resolveBuffer = null;
    }
    for (const buf of this.ringBuffers) {
      buf.destroy();
    }
    this.ringBuffers = [];
    this.ringSlotStates = [];
    this.latestReport = null;
    this.latestKernelReports = [];
    this.enabled = false;
  }
}

