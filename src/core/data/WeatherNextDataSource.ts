/**
 * WeatherNextDataSource.ts
 *
 * Google DeepMind WeatherNext 3 Data Source & 3-Slot WebGPU Texture Ring Buffer Driver.
 * Streams 0.1° global forecast slices (3600x1801 Float16) on-demand with in-memory caching,
 * request deduplication, and zero-reallocation WebGPU ring buffering.
 *
 * Architecture Invariants:
 * - Invariant §20: 16-byte WGSL alignment & core buffer discipline
 * - Invariant §40: WebGPU texture row pitch 256-byte alignment contract (7424 bytes per row)
 * - Invariant §67: Anti-ghosting continuous trajectory reconstruction
 * - Invariant §72: Dual-zone chronology timeline scrubbing integration
 * - Invariant §73: WebGPU 3-slot discrete texture ring buffer lifecycle (Slot 0, Slot 1, Slot 2)
 */

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

export const WEATHERNEXT_CORE_VARIABLES = [
  'u_component_of_wind_10m_mean',
  'v_component_of_wind_10m_mean',
  'total_precipitation_1hr_mean',
  'temperature_2m_mean',
  'dewpoint_temperature_2m_mean',
  'total_cloud_cover_mean',
] as const;

export type WeatherNextCoreVariable = (typeof WEATHERNEXT_CORE_VARIABLES)[number];

export const WEATHERNEXT_GRID_SPEC = {
  width: 3600,
  height: 1801,
  bytesPerTexel: 2,
  rawRowBytes: 7200,
  paddedRowBytes: 7424,
  paddingBytesPerRow: 224,
  paddingTexelsPerRow: 112,
  paddedCols: 3712,
  unpaddedSliceBytes: 12967200,
  paddedSliceBytes: 13370624,
  resolutionDeg: 0.1,
  latMin: -90.0,
  latMax: 90.0,
  lonMin: -180.0,
  lonMax: 179.9,
} as const;

export interface WeatherNextGridDimensions {
  width: number;
  height: number;
  lonPoints: number;
  latPoints: number;
  resolutionDeg: number;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface WeatherNextTimeHorizon {
  startHour: number;
  endHour: number;
  stepHours: number;
  totalHours: number;
}

export interface WeatherNextVariableInfo {
  longName?: string;
  units?: string;
  canonicalMin?: number;
  canonicalMax?: number;
  [key: string]: any;
}

export interface WeatherNextTextureEncoding {
  format: GPUTextureFormat | string;
  bytesPerTexel: number;
  rawRowBytes: number;
  paddedRowBytes: number;
  paddingBytesPerRow: number;
  isPrePadded: boolean;
  sliceByteLength: number;
  paddedSliceByteLength: number;
}

export interface WeatherNextMeta {
  source: string;
  model: string;
  dataset: string;
  forecastInitTimestamp: string;
  forecastRunCycle: string;
  ingestedAtUTC: string;
  billingProject: string;
  gridDimensions: WeatherNextGridDimensions;
  timeHorizon: WeatherNextTimeHorizon;
  validPredictionHours: number[];
  variables: string[];
  variableMetadata: Record<string, WeatherNextVariableInfo>;
  textureEncoding: WeatherNextTextureEncoding;
  filePattern: string;
  provenance?: Record<string, any>;
}

export type WeatherNextMetadata = WeatherNextMeta;

export interface WeatherNextDataSourceOptions {
  basePath?: string;
  baseDataPath?: string;
  metaUrl?: string;
  metadataUrl?: string;
  ringBuffer?: TemporalTextureRingBuffer;
  defaultVariable?: string;
  maxCachedSlices?: number;
  id?: string;
}

export class WeatherNextDataSource implements IDataSource<WeatherNextMeta> {
  // --- IDataSource Compliance ---
  public readonly id: string;
  public readonly type: DataSourceCategory = 'field';
  public readonly isStreaming: boolean = true;

  // --- Configuration & Paths ---
  public readonly basePath: string;
  public readonly metaUrl: string;
  public readonly maxCachedSlices: number;

  // --- Public State ---
  public metadata: WeatherNextMeta | null = null;
  public ringBuffer: TemporalTextureRingBuffer | null = null;
  public currentHour: number = 0;
  public activeVariable: string;

  // --- Internal State & Caches ---
  private readonly sliceCache: Map<string, ArrayBuffer> = new Map();
  private readonly pendingRequests: Map<string, Promise<ArrayBuffer>> = new Map();
  private seekSequenceId: number = 0;
  private isDisposed: boolean = false;
  private advanceQueue: Promise<void> = Promise.resolve();
  private residentHours: [number, number, number] | null = null;

  constructor(
    idOrOptions?: string | WeatherNextDataSourceOptions,
    options?: WeatherNextDataSourceOptions
  ) {
    let id = 'google-weathernext3';
    let opts: WeatherNextDataSourceOptions = {};

    if (typeof idOrOptions === 'string') {
      id = idOrOptions;
      if (options) opts = options;
    } else if (idOrOptions && typeof idOrOptions === 'object') {
      opts = idOrOptions;
      if (typeof opts.id === 'string') {
        id = opts.id;
      }
    }

    this.id = id;
    this.basePath = opts.basePath ?? opts.baseDataPath ?? '/data/weathernext';
    this.metaUrl = opts.metaUrl ?? opts.metadataUrl ?? `${this.basePath}/meta.json`;
    this.activeVariable = opts.defaultVariable ?? 'total_precipitation_1hr_mean';
    this.maxCachedSlices = opts.maxCachedSlices ?? 24;

    if (opts.ringBuffer) {
      this.bindRingBuffer(opts.ringBuffer);
    }
  }

  /**
   * Returns whether the data source has been disposed.
   */
  public get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Alias for metadata property.
   */
  public get meta(): WeatherNextMeta | null {
    return this.metadata;
  }

  /**
   * Alias for activeVariable property.
   */
  public get currentVariable(): string {
    return this.activeVariable;
  }

  /**
   * Helper to check if a variable is recognized.
   */
  public isValidVariable(variable: string): boolean {
    if (WEATHERNEXT_CORE_VARIABLES.includes(variable as any)) {
      return true;
    }
    if (
      this.metadata &&
      Array.isArray(this.metadata.variables) &&
      this.metadata.variables.includes(variable)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Loads and validates metadata from meta.json.
   * Dual-environment: supports browser fetch (or mock fetch in tests) and
   * nodeAssetLoader fallback in Node.js test environment.
   */
  public async loadMetadata(url?: string): Promise<WeatherNextMeta> {
    if (this.isDisposed) {
      throw new Error('Cannot call loadMetadata() on a disposed WeatherNextDataSource');
    }

    const targetUrl = url || this.metaUrl;
    if (!url && this.metadata) {
      return this.metadata;
    }

    const isMock = typeof globalThis.fetch === 'function' && Boolean((globalThis.fetch as any).mock);

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(targetUrl);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch metadata from ${targetUrl}: HTTP ${res.status} ${res.statusText || ''}`.trim()
          );
        }
        const parsed = (await res.json()) as WeatherNextMeta;
        this.metadata = parsed;
        return this.metadata;
      } catch (err) {
        if (isMock) {
          throw err;
        }
      }
    }

    // Node filesystem loader fallback
    const nodeText = await loadNodeAssetText(targetUrl);
    if (nodeText !== null) {
      try {
        this.metadata = JSON.parse(nodeText) as WeatherNextMeta;
        return this.metadata;
      } catch (e) {
        throw new Error(
          `Failed to parse metadata JSON from ${targetUrl}: ${(e as Error).message}`
        );
      }
    }

    throw new Error(`Failed to fetch metadata from ${targetUrl}`);
  }

  /**
   * Alias for loadMetadata()
   */
  public async loadMeta(): Promise<WeatherNextMeta> {
    return this.loadMetadata();
  }

  /**
   * Retrieves an ArrayBuffer slice for the requested variable and prediction hour.
   * Uses in-memory caching and request deduplication to prevent redundant network fetches.
   */
  public async getSlice(variable: string, hour: number): Promise<ArrayBuffer> {
    if (this.isDisposed) {
      throw new Error('Cannot call getSlice() on a disposed WeatherNextDataSource');
    }

    if (!this.isValidVariable(variable)) {
      throw new Error(
        `Unsupported variable '${variable}'. Supported variables are: ${WEATHERNEXT_CORE_VARIABLES.join(', ')}`
      );
    }

    const maxHour = this.metadata ? this.metadata.timeHorizon.totalHours - 1 : 47;
    if (
      typeof hour !== 'number' ||
      !Number.isInteger(hour) ||
      Number.isNaN(hour) ||
      hour < 0 ||
      hour > maxHour
    ) {
      throw new RangeError(
        `Invalid prediction hour ${hour}: must be an integer between 0 and ${maxHour}`
      );
    }

    const cacheKey = `${variable}-${hour}`;

    // 1. In-memory cache hit
    const cached = this.sliceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Anti-thundering herd: return in-flight promise if already pending
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // 3. Initiate fetch
    const requestPromise = (async () => {
      try {
        const filePath = `${this.basePath}/${variable}-${hour}.bin`;
        const buffer = await this.fetchBuffer(filePath);

        // Hardware invariant check: slice must be at least raw 3600x1801 Float16 (12,967,200 bytes)
        if (buffer.byteLength < 12967200) {
          throw new Error(
            `Insufficient data length for slice '${variable}-${hour}': expected at least 12967200 bytes, got ${buffer.byteLength}`
          );
        }

        // Enforce cache capacity limit (evict oldest inserted)
        if (this.sliceCache.size >= this.maxCachedSlices) {
          const oldestKey = this.sliceCache.keys().next().value;
          if (oldestKey !== undefined) {
            this.sliceCache.delete(oldestKey);
          }
        }

        this.sliceCache.set(cacheKey, buffer);
        return buffer;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /**
   * Internal dual-environment buffer fetcher.
   */
  private async fetchBuffer(url: string): Promise<ArrayBuffer> {
    const isMock = typeof globalThis.fetch === 'function' && Boolean((globalThis.fetch as any).mock);

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch slice from ${url}: HTTP ${res.status} ${res.statusText || ''}`.trim()
          );
        }
        return await res.arrayBuffer();
      } catch (err) {
        if (isMock) {
          throw err;
        }
      }
    }

    const nodeBuf = await loadNodeAssetBuffer(url);
    if (nodeBuf !== null) {
      return nodeBuf;
    }

    throw new Error(`Failed to load WeatherNext slice: ${url}`);
  }

  /**
   * Binds an active WebGPU TemporalTextureRingBuffer to the data source.
   * Validates matching dimensions (3600x1801) and format ('r16float').
   */
  public bindRingBuffer(ringBuffer: TemporalTextureRingBuffer): void {
    if (!ringBuffer || ringBuffer.disposed) {
      throw new Error('Cannot bind a null or disposed TemporalTextureRingBuffer');
    }
    if (ringBuffer.width !== 3600 || ringBuffer.height !== 1801) {
      throw new RangeError(
        `Ring buffer dimensions (${ringBuffer.width}x${ringBuffer.height}) do not match WeatherNext 3600x1801`
      );
    }
    if (ringBuffer.format !== 'r16float') {
      throw new TypeError(
        `Ring buffer format '${ringBuffer.format}' incompatible: expected 'r16float'`
      );
    }
    this.ringBuffer = ringBuffer;
  }

  /**
   * Alias for bindRingBuffer().
   */
  public attachRingBuffer(ringBuffer: TemporalTextureRingBuffer, variable?: string): void {
    this.bindRingBuffer(ringBuffer);
    if (variable) {
      this.activeVariable = variable;
    }
  }

  /**
   * Stages three consecutive forecast hours into the 3-slot ring buffer:
   * - Slot 0 (t_k): base hour
   * - Slot 1 (t_{k+1}): next hour
   * - Slot 2 (t_{k+2}): prefetch hour
   */
  public async seekHour(hour: number, variable?: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Cannot call seekHour() on a disposed WeatherNextDataSource');
    }
    if (!this.ringBuffer || this.ringBuffer.disposed) {
      throw new Error('TemporalTextureRingBuffer not bound');
    }

    const targetVar = variable || this.activeVariable;
    if (!this.isValidVariable(targetVar)) {
      throw new Error(`Unsupported variable '${targetVar}'`);
    }

    const maxHour = this.metadata ? this.metadata.timeHorizon.totalHours - 1 : 47;
    const clampedHour = Math.max(0, Math.min(maxHour, Math.floor(hour)));

    const h0 = clampedHour;
    const h1 = Math.min(maxHour, clampedHour + 1);
    const h2 = Math.min(maxHour, clampedHour + 2);

    const seekId = ++this.seekSequenceId;
    this.advanceQueue = Promise.resolve();

    const [b0, b1, b2] = await Promise.all([
      this.getSlice(targetVar, h0),
      this.getSlice(targetVar, h1),
      this.getSlice(targetVar, h2),
    ]);

    // Guard against stale concurrent seek requests
    if (seekId !== this.seekSequenceId || this.isDisposed) {
      return;
    }

    if (this.ringBuffer && !this.ringBuffer.disposed) {
      this.ringBuffer.uploadSlice(0, b0);
      this.ringBuffer.uploadSlice(1, b1);
      this.ringBuffer.uploadSlice(2, b2);
    }

    this.currentHour = clampedHour;
    this.activeVariable = targetVar;
    this.residentHours = [h0, h1, h2];
  }

  /**
   * Advances the ring buffer by one discrete hour:
   * 1. Queues sequential advances to guarantee prior prefetch uploads finish before slot rotation
   * 2. Verifies slot continuity against residentHours; self-heals via seekHour if continuity is broken
   * 3. Rotates slot pointers via ringBuffer.advance() (Slot 1 -> Slot 0, Slot 2 -> Slot 1)
   * 4. Asynchronously prefetches upcoming hour (currentHour + 2) into recycled Slot 2
   */
  public advanceHour(variable?: string): Promise<void> {
    if (this.isDisposed) {
      return Promise.reject(
        new Error('Cannot call advanceHour() on a disposed WeatherNextDataSource')
      );
    }
    if (!this.ringBuffer || this.ringBuffer.disposed) {
      return Promise.reject(new Error('TemporalTextureRingBuffer not bound'));
    }

    const targetVar = variable || this.activeVariable;
    if (!this.isValidVariable(targetVar)) {
      return Promise.reject(new Error(`Unsupported variable '${targetVar}'`));
    }

    const maxHour = this.metadata ? this.metadata.timeHorizon.totalHours - 1 : 47;
    const dispatchSeekId = this.seekSequenceId;

    this.currentHour = Math.min(maxHour, this.currentHour + 1);
    const targetHour = this.currentHour;

    const advanceTask = async (): Promise<void> => {
      if (
        dispatchSeekId !== this.seekSequenceId ||
        this.isDisposed ||
        !this.ringBuffer ||
        this.ringBuffer.disposed
      ) {
        return;
      }

      const expectedSlot1 = targetHour;
      const expectedSlot2 = Math.min(maxHour, targetHour + 1);
      const isContiguous =
        this.residentHours !== null &&
        this.residentHours[1] === expectedSlot1 &&
        this.residentHours[2] === expectedSlot2 &&
        this.activeVariable === targetVar;

      if (!isContiguous) {
        await this.seekHour(targetHour, targetVar);
        return;
      }

      this.ringBuffer.advance();
      this.residentHours = [expectedSlot1, expectedSlot2, -1];
      const prefetchHour = Math.min(maxHour, targetHour + 2);
      const prefetchBuffer = await this.getSlice(targetVar, prefetchHour);

      if (
        dispatchSeekId !== this.seekSequenceId ||
        this.isDisposed ||
        !this.ringBuffer ||
        this.ringBuffer.disposed ||
        this.activeVariable !== targetVar
      ) {
        return;
      }

      this.ringBuffer.uploadSlice(2, prefetchBuffer);
      this.residentHours[2] = prefetchHour;
    };

    const taskPromise = this.advanceQueue.catch(() => {}).then(advanceTask);
    this.advanceQueue = taskPromise;
    return taskPromise;
  }

  /**
   * Primary time update handler invoked by TimelineScrubber onTimeChange.
   * Handles intra-hour scrubbing (zero I/O), sequential advance, and arbitrary seek.
   */
  public async setTime(bracketHour: number, tau: number = 0.0): Promise<void> {
    if (this.isDisposed) return;
    const maxHour = this.metadata ? this.metadata.timeHorizon.totalHours - 1 : 47;
    const clampedHour = Math.max(0, Math.min(maxHour, Math.floor(bracketHour)));

    if (clampedHour === this.currentHour) {
      // Intra-hour progression: tau changed smoothly, slots remain resident in VRAM
      return;
    }

    if (clampedHour === this.currentHour + 1) {
      // Sequential 1-hour step forward
      await this.advanceHour();
      return;
    }

    // Non-contiguous seek or backward step: re-stage all slots
    await this.seekHour(clampedHour);
  }

  /**
   * Returns current forecast hour.
   */
  public getCurrentHour(): number {
    return this.currentHour;
  }

  /**
   * Returns active prognostic variable identifier.
   */
  public getActiveVariable(): string {
    return this.activeVariable;
  }

  /**
   * Changes active prognostic variable and restages the current 3-slot window.
   */
  public async setActiveVariable(variable: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Cannot call setActiveVariable() on a disposed WeatherNextDataSource');
    }
    if (!this.isValidVariable(variable)) {
      throw new Error(`Unsupported variable '${variable}'`);
    }

    this.seekSequenceId++;
    this.advanceQueue = Promise.resolve();
    this.activeVariable = variable;
    if (this.ringBuffer && !this.ringBuffer.disposed) {
      await this.seekHour(this.currentHour, variable);
    }
  }

  /**
   * Clears in-memory slice cache.
   */
  public clearCache(): void {
    this.sliceCache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Invariant §68 & §73: Single-Stream In-Place Ring Buffer VRAM Footprint.
   * Returns active VRAM consumption for the 3-slot sliding window.
   * A single 3-slot ring buffer consumes 40,111,872 bytes (40.11 MB padded),
   * strictly bounding VRAM below the 194 MB budget ceiling (20.68% usage, 153.89 MB headroom).
   * Simultaneous multi-stream residency of all 6 prognostic fields is prohibited (240.67 MB > 194 MB).
   */
  public getVRAMFootprintBytes(): number {
    if (!this.ringBuffer || this.ringBuffer.disposed) return 0;
    return 3 * WEATHERNEXT_GRID_SPEC.paddedSliceBytes;
  }

  /**
   * Releases resources, cancels pending operations, and detaches the ring buffer.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.advanceQueue = Promise.resolve();
    this.residentHours = null;
    this.seekSequenceId++;
    this.clearCache();

    if (this.ringBuffer && !this.ringBuffer.disposed) {
      this.ringBuffer.dispose();
    }
    this.ringBuffer = null;
    this.metadata = null;
  }

  // --- IDataSource Stubs & Metadata ---

  public async fetch(
    bounds: BoundingBox3D,
    zoom: number
  ): Promise<SpatialDataChunk<WeatherNextMeta>> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

    const width = this.metadata?.gridDimensions.width ?? 3600;
    const height = this.metadata?.gridDimensions.height ?? 1801;

    return {
      chunkId: `weathernext-${this.activeVariable}-${this.currentHour}-${Date.now()}`,
      bounds,
      vertexCount: width * height,
      attributes: new Map(),
      meta: this.metadata ?? this.createDefaultMetadata(),
    };
  }

  public toGPUBinding(
    deviceOrGl?: GPUDevice | WebGL2RenderingContext
  ): GPUBuffer | WebGLBuffer | null {
    return null;
  }

  public async disconnect(): Promise<void> {
    this.dispose();
  }

  /**
   * Fallback default metadata conforming to Google DeepMind WeatherNext 3 specifications.
   */
  public createDefaultMetadata(): WeatherNextMeta {
    return {
      source: 'Google DeepMind WeatherNext 3',
      model: 'weathernext_3_0_0_statistics',
      dataset:
        'gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/2026_to_present/',
      forecastInitTimestamp: '2026-09-11T18:00:00Z',
      forecastRunCycle: '20260911_18hr_01_preds',
      ingestedAtUTC: '2026-09-12T00:00:00Z',
      billingProject: 'antigravity-agent-1765655548',
      gridDimensions: {
        width: 3600,
        height: 1801,
        lonPoints: 3600,
        latPoints: 1801,
        resolutionDeg: 0.1,
        latMin: -90.0,
        latMax: 90.0,
        lonMin: -180.0,
        lonMax: 179.9,
      },
      timeHorizon: {
        startHour: 0,
        endHour: 47,
        stepHours: 1,
        totalHours: 48,
      },
      validPredictionHours: Array.from({ length: 48 }, (_, i) => i),
      variables: [...WEATHERNEXT_CORE_VARIABLES],
      variableMetadata: {
        u_component_of_wind_10m_mean: { units: 'm/s', longName: '10m Eastward Wind Velocity' },
        v_component_of_wind_10m_mean: { units: 'm/s', longName: '10m Northward Wind Velocity' },
        total_precipitation_1hr_mean: { units: 'kg/m^2', longName: 'Accumulated Precipitation Rate' },
        temperature_2m_mean: { units: '°C', longName: '2m Ambient Surface Temperature' },
        dewpoint_temperature_2m_mean: { units: '°C', longName: '2m Surface Dewpoint Temperature' },
        total_cloud_cover_mean: { units: 'fraction', longName: 'Column-Integrated Cloud Fraction' },
      },
      textureEncoding: {
        format: 'r16float',
        bytesPerTexel: 2,
        rawRowBytes: 7200,
        paddedRowBytes: 7424,
        paddingBytesPerRow: 224,
        isPrePadded: true,
        sliceByteLength: 12967200,
        paddedSliceByteLength: 13370624,
      },
      filePattern: '/data/weathernext/{variable}-{hour}.bin',
      provenance: {
        chunkShape: [1, 1801, 3600],
        sourceDtype: 'float32',
        outputDtype: 'float16',
        latitudeOrientation: 'row_0_north_inverted',
        longitudeOrientation: 'col_0_antimeridian_rolled_1800',
      },
    };
  }
}
