/**
 * TemporalTextureRingBuffer.ts
 *
 * WebGPU Temporal Texture Ring Buffer for streaming dynamic weather, cloud,
 * radar, and precipitation data layers without per-frame GPU reallocations.
 *
 * Architecture Invariants:
 * - Invariant §20: 16-byte WGSL alignment & core buffer discipline
 * - Invariant §40: WebGPU texture row pitch 256-byte alignment contract
 * - Invariant §48: Dynamic dimensions (no hardcoded numeric texture literals)
 */

export type TemporalSlot = 0 | 1 | 2;

/**
 * Resolves standard WebGPU texture format bytes-per-pixel.
 * Supports uncompressed color, float, integer, and normalized formats.
 */
export function getTextureFormatBytesPerPixel(format: GPUTextureFormat): number {
  switch (format) {
    // 1-byte formats (8-bit)
    case 'r8unorm':
    case 'r8snorm':
    case 'r8uint':
    case 'r8sint':
      return 1;

    // 2-byte formats (16-bit)
    case 'r16uint':
    case 'r16sint':
    case 'r16float':
    case 'rg8unorm':
    case 'rg8snorm':
    case 'rg8uint':
    case 'rg8sint':
      return 2;

    // 4-byte formats (32-bit)
    case 'r32uint':
    case 'r32sint':
    case 'r32float':
    case 'rg16uint':
    case 'rg16sint':
    case 'rg16float':
    case 'rgba8unorm':
    case 'rgba8unorm-srgb':
    case 'rgba8snorm':
    case 'rgba8uint':
    case 'rgba8sint':
    case 'bgra8unorm':
    case 'bgra8unorm-srgb':
    case 'rgb10a2uint':
    case 'rgb10a2unorm':
    case 'rg11b10ufloat':
      return 4;

    // 8-byte formats (64-bit)
    case 'rg32uint':
    case 'rg32sint':
    case 'rg32float':
    case 'rgba16uint':
    case 'rgba16sint':
    case 'rgba16float':
      return 8;

    // 16-byte formats (128-bit)
    case 'rgba32uint':
    case 'rgba32sint':
    case 'rgba32float':
      return 16;

    default:
      return 4;
  }
}

export class TemporalTextureRingBuffer {
  public readonly device: GPUDevice;
  public readonly width: number;
  public readonly height: number;
  public readonly format: GPUTextureFormat;
  public readonly bytesPerPixel: number;
  public readonly rawRowBytes: number;
  public readonly bytesPerRow: number;

  private readonly textures: [GPUTexture, GPUTexture, GPUTexture];
  private cachedViews: [GPUTextureView, GPUTextureView, GPUTextureView] | null = null;
  private stagingBuffer: Uint8Array | null = null;
  private slotIndices: [number, number, number] = [0, 1, 2];
  private isDisposed: boolean = false;

  constructor(device: GPUDevice, width: number, height: number, format: GPUTextureFormat) {
    if (!device) {
      throw new Error('TemporalTextureRingBuffer requires a valid GPUDevice');
    }
    if (width < 1 || !Number.isFinite(width)) {
      throw new RangeError(`Invalid width ${width}: must be a positive number`);
    }
    if (height < 1 || !Number.isFinite(height)) {
      throw new RangeError(`Invalid height ${height}: must be a positive number`);
    }

    this.device = device;
    this.width = Math.floor(width);
    this.height = Math.floor(height);
    this.format = format;

    this.bytesPerPixel = getTextureFormatBytesPerPixel(format);
    this.rawRowBytes = this.width * this.bytesPerPixel;
    // Invariant §40: WebGPU requires bytesPerRow to be a multiple of 256
    this.bytesPerRow = Math.ceil(this.rawRowBytes / 256) * 256;

    const usage = typeof GPUTextureUsage !== 'undefined'
      ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST)
      : (4 | 2);

    const tex0 = device.createTexture({
      label: 'temporal_ring_slot_0',
      size: { width: this.width, height: this.height, depthOrArrayLayers: 1 },
      format: this.format,
      usage,
    });
    const tex1 = device.createTexture({
      label: 'temporal_ring_slot_1',
      size: { width: this.width, height: this.height, depthOrArrayLayers: 1 },
      format: this.format,
      usage,
    });
    const tex2 = device.createTexture({
      label: 'temporal_ring_slot_2',
      size: { width: this.width, height: this.height, depthOrArrayLayers: 1 },
      format: this.format,
      usage,
    });

    this.textures = [tex0, tex1, tex2];
    this.cachedViews = [
      tex0.createView(),
      tex1.createView(),
      tex2.createView(),
    ];
  }

  /**
   * Returns whether the ring buffer has been disposed.
   */
  public get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Retrieves active texture for the requested logical slot.
   * Slot 0: Previous frame (t_k)
   * Slot 1: Current frame (t_{k+1})
   * Slot 2: Staging slot for asynchronous upload of next frame (t_{k+2})
   */
  public getTexture(slot: TemporalSlot): GPUTexture {
    if (this.isDisposed) {
      throw new Error('Cannot call getTexture() on a disposed TemporalTextureRingBuffer');
    }
    if (slot !== 0 && slot !== 1 && slot !== 2) {
      throw new RangeError(`Invalid slotIndex ${slot}: must be 0, 1, or 2`);
    }
    return this.textures[this.slotIndices[slot]];
  }

  /**
   * Retrieves a GPUTextureView for the requested logical slot.
   * If descriptor is undefined, returns the pre-cached default GPUTextureView.
   */
  public getTextureView(slot: TemporalSlot, descriptor?: GPUTextureViewDescriptor): GPUTextureView {
    if (this.isDisposed) {
      throw new Error('Cannot call getTextureView() on a disposed TemporalTextureRingBuffer');
    }
    if (slot !== 0 && slot !== 1 && slot !== 2) {
      throw new RangeError(`Invalid slotIndex ${slot}: must be 0, 1, or 2`);
    }
    if (!descriptor && this.cachedViews) {
      return this.cachedViews[this.slotIndices[slot]];
    }
    return this.getTexture(slot).createView(descriptor);
  }

  /**
   * Returns the underlying physical texture index (0, 1, or 2) assigned to the specified logical slot.
   */
  public getActivePhysicalIndex(slot: TemporalSlot = 1): number {
    if (this.isDisposed) {
      throw new Error('Cannot call getActivePhysicalIndex() on a disposed TemporalTextureRingBuffer');
    }
    if (slot !== 0 && slot !== 1 && slot !== 2) {
      throw new RangeError(`Invalid slotIndex ${slot}: must be 0, 1, or 2`);
    }
    return this.slotIndices[slot];
  }

  /**
   * Returns the underlying physical texture at the given index (0, 1, or 2),
   * bypassing logical slot permutations.
   */
  public getPhysicalTexture(index: number): GPUTexture {
    if (this.isDisposed) {
      throw new Error('Cannot call getPhysicalTexture() on a disposed TemporalTextureRingBuffer');
    }
    if (index !== 0 && index !== 1 && index !== 2) {
      throw new RangeError(`Invalid physical index ${index}: must be 0, 1, or 2`);
    }
    return this.textures[index];
  }

  /**
   * Returns the pre-cached default GPUTextureView for the physical texture at the given index (0, 1, or 2).
   */
  public getPhysicalTextureView(index: number): GPUTextureView {
    if (this.isDisposed) {
      throw new Error('Cannot call getPhysicalTextureView() on a disposed TemporalTextureRingBuffer');
    }
    if (index !== 0 && index !== 1 && index !== 2) {
      throw new RangeError(`Invalid physical index ${index}: must be 0, 1, or 2`);
    }
    return this.cachedViews ? this.cachedViews[index] : this.textures[index].createView();
  }

  /**
   * Rotates slot pointers with zero-copy index manipulation.
   * Cyclic 3-slot permutation: Slot 2 (Staging) -> Slot 1 (Current), Slot 1 (Current) -> Slot 0 (Previous), Slot 0 (Previous) -> Slot 2 (Staging).
   * Three consecutive calls restore original assignment (order 3 cyclic invariance).
   */
  public advance(): void {
    if (this.isDisposed) {
      throw new Error('Cannot call advance() on a disposed TemporalTextureRingBuffer');
    }
    const [s0, s1, s2] = this.slotIndices;
    this.slotIndices[0] = s1;
    this.slotIndices[1] = s2;
    this.slotIndices[2] = s0;
  }

  /**
   * Writes slice data to the texture assigned to slotIndex using device.queue.writeTexture().
   * Adheres strictly to WebGPU 256-byte row pitch alignment constraints (Invariant §20 and §40).
   * If incoming buffer is unpadded, rows are copied into a padded Uint8Array with destination stride bytesPerRow.
   */
  public uploadSlice(slotIndex: TemporalSlot, data: ArrayBuffer | ArrayBufferView): void {
    if (this.isDisposed) {
      throw new Error('Cannot call uploadSlice() on a disposed TemporalTextureRingBuffer');
    }
    if (slotIndex !== 0 && slotIndex !== 1 && slotIndex !== 2) {
      throw new RangeError(`Invalid slotIndex ${slotIndex}: must be 0, 1, or 2`);
    }

    const targetTexture = this.getTexture(slotIndex);

    const srcBytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    const minRequiredBytes = this.rawRowBytes * this.height;
    if (srcBytes.byteLength < minRequiredBytes) {
      throw new Error(
        `Insufficient data length: expected at least ${minRequiredBytes} bytes, got ${srcBytes.byteLength}`
      );
    }

    const totalPaddedSize = this.bytesPerRow * this.height;
    let uploadData: Uint8Array;

    if (this.bytesPerRow === this.rawRowBytes) {
      // Natural 256-byte alignment: zero-copy pass-through
      uploadData = srcBytes;
    } else if (srcBytes.byteLength >= totalPaddedSize) {
      // Pre-padded buffer supplied by caller: zero-copy pass-through
      uploadData = srcBytes;
    } else {
      // Copy rows with 256-byte aligned destination stride
      if (!this.stagingBuffer || this.stagingBuffer.byteLength < totalPaddedSize) {
        this.stagingBuffer = new Uint8Array(totalPaddedSize);
      }
      const paddedBytes = this.stagingBuffer;
      for (let row = 0; row < this.height; row++) {
        const srcOffset = row * this.rawRowBytes;
        const dstOffset = row * this.bytesPerRow;
        paddedBytes.set(
          srcBytes.subarray(srcOffset, srcOffset + this.rawRowBytes),
          dstOffset
        );
      }
      uploadData = paddedBytes.subarray(0, totalPaddedSize);
    }

    this.device.queue.writeTexture(
      {
        texture: targetTexture,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 },
        aspect: 'all',
      },
      uploadData,
      {
        offset: 0,
        bytesPerRow: this.bytesPerRow,
        rowsPerImage: this.height,
      },
      {
        width: this.width,
        height: this.height,
        depthOrArrayLayers: 1,
      }
    );
  }

  /**
   * Frees and destroys all 3 GPU textures cleanly.
   * Sets isDisposed = true and defends against subsequent calls.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stagingBuffer = null;
    this.cachedViews = null;

    for (const texture of this.textures) {
      if (texture && typeof texture.destroy === 'function') {
        try {
          texture.destroy();
        } catch {
          // Ignore errors from already destroyed mocks
        }
      }
    }
  }
}
