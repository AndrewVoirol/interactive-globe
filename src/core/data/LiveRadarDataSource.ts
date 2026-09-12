// ============================================================================
// File: src/core/data/LiveRadarDataSource.ts
// Architecture: Heterogeneous Data Ingestion Architecture & WebGPU Ring Buffer Driver
// Source: RainViewer Live Doppler Radar Nowcasting Pipeline
// Description: Streams rolling 12-frame global radar loop into WebGPU textures
// with dynamic timeline scrubber indexing (-60m to 0m) and graceful fallback.
// ============================================================================

import {
  IDataSource,
  DataSourceCategory,
  BoundingBox3D,
  SpatialDataChunk,
} from './IDataSource';
import {
  TemporalTextureRingBuffer,
  TemporalSlot,
} from '../../webgpu/TemporalTextureRingBuffer';
import {
  loadNodeAssetBuffer,
  loadNodeAssetText,
} from '../../utils/nodeAssetLoader';

export const RADAR_TILE_WIDTH = 256;
export const RADAR_TILE_HEIGHT = 256;
export const RADAR_FRAME_COUNT = 12;
export const RADAR_BYTES_PER_TEXEL = 2; // Float16
export const RADAR_FRAME_BYTE_LENGTH = RADAR_TILE_WIDTH * RADAR_TILE_HEIGHT * RADAR_BYTES_PER_TEXEL; // 131,072 bytes
export const RADAR_LOOP_BYTE_LENGTH = RADAR_FRAME_COUNT * RADAR_FRAME_BYTE_LENGTH; // 1,572,864 bytes

export interface LiveRadarMetadata {
  source: string;
  generatedAt: string;
  frameCount: number;
  frameIntervalMinutes: number;
  timeRangeMinutes: [number, number];
  width: number;
  height: number;
  bytesPerPixel: number;
  format: string;
  unit: string;
  fileSizeBytes: number;
  timestamps: number[];
  frameTimesUTC: string[];
}

export type FrameSelectionMode = 'normalized' | 'interval' | 'auto';

export interface LiveRadarDataSourceOptions {
  id?: string;
  dataPath?: string;
  metaPath?: string;
  width?: number;
  height?: number;
  frameCount?: number;
  frameSelectionMode?: FrameSelectionMode;
  ringBuffer?: TemporalTextureRingBuffer | null;
  autoLoad?: boolean;
}

export class LiveRadarDataSource implements IDataSource<LiveRadarMetadata> {
  public readonly id: string;
  public readonly type: DataSourceCategory = 'field';
  public readonly isStreaming: boolean = false;

  public readonly width: number;
  public readonly height: number;
  public readonly frameCount: number;
  public readonly bytesPerTexel: number = RADAR_BYTES_PER_TEXEL;
  public readonly frameByteLength: number;
  public readonly loopByteLength: number;

  public readonly dataPath: string;
  public readonly metaPath: string;

  private frameSelectionMode: FrameSelectionMode;
  private packedBuffer: ArrayBuffer | null = null;
  private frames: ArrayBuffer[] = [];
  private metadata: LiveRadarMetadata | null = null;
  private emptyFrameBuffer: ArrayBuffer;

  private currentMinutes: number = 0;
  private currentFrameIndex: number = 0;
  private nextFrameIndex: number = 0;
  private interpolationTau: number = 0.0;

  private ringBuffer: TemporalTextureRingBuffer | null = null;
  private isDisposed: boolean = false;

  constructor(options: LiveRadarDataSourceOptions = {}) {
    this.id = options.id ?? 'live-doppler-radar';
    this.width = options.width ?? RADAR_TILE_WIDTH;
    this.height = options.height ?? RADAR_TILE_HEIGHT;
    this.frameCount = options.frameCount ?? RADAR_FRAME_COUNT;
    this.frameByteLength = this.width * this.height * this.bytesPerTexel;
    this.loopByteLength = this.frameCount * this.frameByteLength;

    this.dataPath = options.dataPath ?? '/data/radar-loop-latest.bin';
    this.metaPath = options.metaPath ?? '/data/radar-loop-meta.json';
    this.frameSelectionMode = options.frameSelectionMode ?? 'auto';

    // Pre-allocate zeroed transparent frame for graceful fallback
    this.emptyFrameBuffer = new ArrayBuffer(this.frameByteLength);

    if (options.ringBuffer) {
      this.bindRingBuffer(options.ringBuffer);
    }

    // Set initial frame selection at minute 0 (NOW)
    this.setAbsoluteMinutes(0);

    if (options.autoLoad !== false) {
      this.load().catch((err) => {
        console.warn(`[LiveRadarDataSource] Optional initial load deferred:`, err);
      });
    }
  }

  /**
   * Returns whether the data source has been cleanly disposed.
   */
  public get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Returns whether valid radar loop frames are loaded into memory.
   */
  public isLoaded(): boolean {
    return this.frames.length > 0;
  }

  /**
   * Returns current metadata descriptor or null if not yet loaded.
   */
  public get meta(): LiveRadarMetadata | null {
    return this.metadata;
  }

  /**
   * Returns an all-zero transparent frame buffer for graceful fallback.
   */
  public getEmptyFrame(): ArrayBuffer {
    return this.emptyFrameBuffer;
  }

  /**
   * Loads the packed radar loop binary and associated metadata.
   * Handles graceful fallback if files are missing or network requests fail.
   */
  public async load(customDataPath?: string, customMetaPath?: string): Promise<boolean> {
    if (this.isDisposed) {
      throw new Error('Cannot call load() on a disposed LiveRadarDataSource');
    }

    const dataUrl = customDataPath ?? this.dataPath;
    const metaUrl = customMetaPath ?? this.metaPath;

    // 1. Fetch metadata (best-effort, non-blocking)
    try {
      const metaText = await this.fetchText(metaUrl);
      if (metaText) {
        this.metadata = JSON.parse(metaText) as LiveRadarMetadata;
      }
    } catch {
      // Metadata load is optional; proceed to binary
    }

    // 2. Fetch binary buffer
    try {
      const buf = await this.fetchBuffer(dataUrl);
      if (!buf || buf.byteLength < this.frameByteLength) {
        console.warn(
          `[LiveRadarDataSource] Insufficient buffer length (${buf ? buf.byteLength : 0} bytes). Using empty fallback.`
        );
        this.packedBuffer = null;
        this.frames = [];
        return false;
      }

      this.packedBuffer = buf;
      this.frames = [];

      const availableFrames = Math.min(
        this.frameCount,
        Math.floor(buf.byteLength / this.frameByteLength)
      );

      for (let i = 0; i < availableFrames; i++) {
        const frameOffset = i * this.frameByteLength;
        const frameSlice = buf.slice(frameOffset, frameOffset + this.frameByteLength);
        this.frames.push(frameSlice);
      }

      // Re-evaluate frame selection with newly loaded frames
      this.setAbsoluteMinutes(this.currentMinutes);

      // Upload to bound ring buffer if present
      if (this.ringBuffer && !this.ringBuffer.disposed) {
        this.uploadToRingBuffer();
      }

      return true;
    } catch (err) {
      console.warn(`[LiveRadarDataSource] Failed to load binary radar loop from ${dataUrl}:`, err);
      this.packedBuffer = null;
      this.frames = [];
      return false;
    }
  }

  /**
   * Manages frame selection based on the TimelineScrubber's absoluteMinutes value (radar zone: -60m to 0m).
   */
  public setAbsoluteMinutes(minutes: number): void {
    const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
    this.currentMinutes = Math.max(-60, Math.min(0, safeMinutes));

    const numFrames = this.frames.length > 0 ? this.frames.length : this.frameCount;
    if (numFrames <= 1) {
      this.currentFrameIndex = 0;
      this.nextFrameIndex = 0;
      this.interpolationTau = 0.0;
      return;
    }

    const mode = this.resolveSelectionMode();

    if (mode === 'interval') {
      // 10-minute step backward from 0 (NOW = index numFrames - 1)
      const intervalMinutes = this.metadata?.frameIntervalMinutes ?? 10;
      const continuousOffset = this.currentMinutes / intervalMinutes; // e.g. -60m -> -6.0
      const continuousIndex = (numFrames - 1) + continuousOffset; // e.g. 11 + (-6) = 5.0
      const clampedIndex = Math.max(0, Math.min(numFrames - 1, continuousIndex));

      this.currentFrameIndex = Math.floor(clampedIndex);
      this.nextFrameIndex = Math.min(numFrames - 1, this.currentFrameIndex + 1);
      this.interpolationTau = clampedIndex - this.currentFrameIndex;
    } else {
      // Normalized span mode: maps [-60m, 0m] across all available frames [0, numFrames - 1]
      const u = (this.currentMinutes + 60) / 60; // 0.0 at -60m -> 1.0 at 0m
      const continuousIndex = u * (numFrames - 1);
      const clampedIndex = Math.max(0, Math.min(numFrames - 1, continuousIndex));

      this.currentFrameIndex = Math.floor(clampedIndex);
      this.nextFrameIndex = Math.min(numFrames - 1, this.currentFrameIndex + 1);
      this.interpolationTau = clampedIndex - this.currentFrameIndex;
    }
  }

  /**
   * Alias for setAbsoluteMinutes().
   */
  public setTime(minutes: number): void {
    this.setAbsoluteMinutes(minutes);
  }

  /**
   * Returns current active frame ArrayBuffer.
   * If data is unavailable, gracefully returns an all-zero transparent buffer.
   */
  public getCurrentFrame(): ArrayBuffer {
    if (this.frames.length === 0) {
      return this.emptyFrameBuffer;
    }
    const idx = Math.max(0, Math.min(this.frames.length - 1, this.currentFrameIndex));
    return this.frames[idx] || this.emptyFrameBuffer;
  }

  /**
   * Returns next frame ArrayBuffer for temporal interpolation.
   * If data is unavailable, gracefully returns an all-zero transparent buffer.
   */
  public getNextFrame(): ArrayBuffer {
    if (this.frames.length === 0) {
      return this.emptyFrameBuffer;
    }
    const idx = Math.max(0, Math.min(this.frames.length - 1, this.nextFrameIndex));
    return this.frames[idx] || this.emptyFrameBuffer;
  }

  /**
   * Returns specific frame by index.
   */
  public getFrame(index: number): ArrayBuffer {
    if (this.frames.length === 0 || index < 0 || index >= this.frames.length) {
      return this.emptyFrameBuffer;
    }
    return this.frames[index];
  }

  /**
   * Returns current frame index.
   */
  public getCurrentFrameIndex(): number {
    return this.currentFrameIndex;
  }

  /**
   * Returns next frame index.
   */
  public getNextFrameIndex(): number {
    return this.nextFrameIndex;
  }

  /**
   * Returns current intra-frame interpolation factor tau in [0.0, 1.0].
   */
  public getTau(): number {
    return this.interpolationTau;
  }

  /**
   * Alias for getTau().
   */
  public getInterpolationFactor(): number {
    return this.interpolationTau;
  }

  /**
   * Returns current absolute minutes in [-60, 0].
   */
  public getCurrentMinutes(): number {
    return this.currentMinutes;
  }

  /**
   * Binds an active WebGPU TemporalTextureRingBuffer to the data source.
   */
  public bindRingBuffer(ringBuffer: TemporalTextureRingBuffer): void {
    if (!ringBuffer || ringBuffer.disposed) {
      throw new Error('Cannot bind a null or disposed TemporalTextureRingBuffer');
    }
    if (ringBuffer.width !== this.width || ringBuffer.height !== this.height) {
      throw new RangeError(
        `Ring buffer dimensions (${ringBuffer.width}x${ringBuffer.height}) do not match radar tile dimensions (${this.width}x${this.height})`
      );
    }
    this.ringBuffer = ringBuffer;
  }

  /**
   * Creates and binds a WebGPU TemporalTextureRingBuffer tailored to radar tile geometry (256x256 r16float).
   */
  public createRingBuffer(device: GPUDevice): TemporalTextureRingBuffer {
    if (!device) {
      throw new Error('createRingBuffer requires a valid GPUDevice');
    }
    const ring = new TemporalTextureRingBuffer(device, this.width, this.height, 'r16float');
    this.bindRingBuffer(ring);
    return ring;
  }

  /**
   * Returns the currently bound TemporalTextureRingBuffer or null.
   */
  public getRingBuffer(): TemporalTextureRingBuffer | null {
    return this.ringBuffer;
  }

  /**
   * Uploads current and next frame slices into the bound WebGPU ring buffer:
   * Slot 0: current frame (t_k)
   * Slot 1: next frame (t_{k+1})
   */
  public uploadToRingBuffer(): void {
    if (!this.ringBuffer || this.ringBuffer.disposed) {
      return;
    }

    const currentFrame = this.getCurrentFrame();
    const nextFrame = this.getNextFrame();

    this.ringBuffer.uploadSlice(0, currentFrame);
    this.ringBuffer.uploadSlice(1, nextFrame);
  }

  /**
   * Conformance with IDataSource interface: fetch spatial data chunk.
   */
  public async fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<LiveRadarMetadata>> {
    return {
      chunkId: `radar_${this.currentFrameIndex}_${this.currentMinutes}m`,
      bounds,
      vertexCount: 0,
      attributes: new Map<string, Float32Array | Uint32Array>(),
      meta: this.metadata || {
        source: 'RainViewer Live Doppler Radar',
        generatedAt: new Date().toISOString(),
        frameCount: this.frameCount,
        frameIntervalMinutes: 10,
        timeRangeMinutes: [-60, 0],
        width: this.width,
        height: this.height,
        bytesPerPixel: this.bytesPerTexel,
        format: 'r16float',
        unit: 'dBZ',
        fileSizeBytes: this.loopByteLength,
        timestamps: [],
        frameTimesUTC: [],
      },
    };
  }

  /**
   * Conformance with IDataSource: returns null as textures are managed through ring buffers.
   */
  public toGPUBinding(): GPUBuffer | WebGLBuffer | null {
    return null;
  }

  /**
   * Releases allocated frame arrays and buffers cleanly.
   */
  public async disconnect(): Promise<void> {
    this.dispose();
  }

  /**
   * Disposes the data source and clears memory.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.packedBuffer = null;
    this.frames = [];
    this.ringBuffer = null;
  }

  private resolveSelectionMode(): 'normalized' | 'interval' {
    if (this.frameSelectionMode === 'interval') return 'interval';
    if (this.frameSelectionMode === 'normalized') return 'normalized';

    // Auto resolution: if metadata indicates timeRangeMinutes is [-60, 0], use normalized span
    if (
      this.metadata?.timeRangeMinutes &&
      this.metadata.timeRangeMinutes[0] === -60 &&
      this.metadata.timeRangeMinutes[1] === 0
    ) {
      return 'normalized';
    }

    return 'normalized';
  }

  private async fetchBuffer(url: string): Promise<ArrayBuffer | null> {
    const isMock = typeof globalThis.fetch === 'function' && Boolean((globalThis.fetch as any).mock);
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

    // In Node / test environment without active fetch mock, prioritize local asset loading
    if (isNode && !isMock) {
      const nodeBuf = await loadNodeAssetBuffer(url);
      if (nodeBuf !== null) {
        return nodeBuf;
      }
      // If it is a relative path in Node and not an absolute URL, don't attempt network fetch
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return null;
      }
    }

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(url);
        if (res.ok) {
          return await res.arrayBuffer();
        }
      } catch {
        // Fall back to Node asset loader
      }
    }

    return await loadNodeAssetBuffer(url);
  }

  private async fetchText(url: string): Promise<string | null> {
    const isMock = typeof globalThis.fetch === 'function' && Boolean((globalThis.fetch as any).mock);
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

    // In Node / test environment without active fetch mock, prioritize local asset loading
    if (isNode && !isMock) {
      const nodeText = await loadNodeAssetText(url);
      if (nodeText !== null) {
        return nodeText;
      }
      // If it is a relative path in Node and not an absolute URL, don't attempt network fetch
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return null;
      }
    }

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(url);
        if (res.ok) {
          return await res.text();
        }
      } catch {
        // Fall back to Node asset loader
      }
    }

    return await loadNodeAssetText(url);
  }
}
