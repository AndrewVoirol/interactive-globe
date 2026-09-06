/**
 * WebGPU Mock and Verification Utilities for Node Test Environments
 */

if (typeof (globalThis as any).GPUTextureUsage === 'undefined') {
  (globalThis as any).GPUTextureUsage = {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  };
}

if (typeof (globalThis as any).GPUBufferUsage === 'undefined') {
  (globalThis as any).GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };
}

if (typeof (globalThis as any).GPUShaderStage === 'undefined') {
  (globalThis as any).GPUShaderStage = {
    VERTEX: 0x01,
    FRAGMENT: 0x02,
    COMPUTE: 0x04,
  };
}

if (typeof (globalThis as any).GPUMapMode === 'undefined') {
  (globalThis as any).GPUMapMode = {
    READ: 0x0001,
    WRITE: 0x0002,
  };
}

export class MockGPUBuffer {
  size: number;
  usage: number;
  data: ArrayBuffer;

  constructor(descriptor: { size: number; usage: number }) {
    this.size = descriptor.size;
    this.usage = descriptor.usage;
    this.data = new ArrayBuffer(descriptor.size);
  }

  destroy() {
    this.data = new ArrayBuffer(0);
  }
}

export class MockGPUTextureView {
  label?: string;
  constructor(public descriptor?: any) {}
}

export class MockGPUTexture {
  width: number;
  height: number;
  depthOrArrayLayers: number;
  format: string;
  usage: number;

  constructor(public descriptor: any) {
    if (Array.isArray(descriptor.size)) {
      this.width = descriptor.size[0] || 1;
      this.height = descriptor.size[1] || 1;
      this.depthOrArrayLayers = descriptor.size[2] || 1;
    } else if (descriptor.size && typeof descriptor.size === 'object') {
      this.width = descriptor.size.width || 1;
      this.height = descriptor.size.height || 1;
      this.depthOrArrayLayers = descriptor.size.depthOrArrayLayers || 1;
    } else {
      this.width = 1;
      this.height = 1;
      this.depthOrArrayLayers = 1;
    }
    this.format = descriptor.format || 'rgba8unorm';
    this.usage = descriptor.usage || 0;
    this.mipLevelCount = descriptor.mipLevelCount || 1;
  }

  createView(descriptor?: any): MockGPUTextureView {
    return new MockGPUTextureView(descriptor);
  }

  destroy() {}
}

export class MockGPUSampler {
  constructor(public descriptor?: any) {}
}

export class MockGPUQueue {
  writeBufferCalls: Array<{ buffer: MockGPUBuffer; bufferOffset: number; data: ArrayBufferView | ArrayBuffer }> = [];
  writeTextureCalls: Array<{ destination: any; data: any; dataLayout: any; size: any }> = [];

  writeBuffer(buffer: MockGPUBuffer, bufferOffset: number, data: ArrayBufferView | ArrayBuffer) {
    this.writeBufferCalls.push({ buffer, bufferOffset, data });
  }

  writeTexture(destination: any, data: any, dataLayout: any, size: any) {
    this.writeTextureCalls.push({ destination, data, dataLayout, size });
  }

  copyExternalImageToTexture(source: any, destination: any, copySize: any) {}

  submit(commandBuffers: any[]) {
    // Mock submit
  }
}

export class MockGPUComputePipeline {
  label?: string;
  constructor(public descriptor: any) {}
}

export class MockGPURenderPipeline {
  label?: string;
  constructor(public descriptor: any) {}
}

export class MockGPUBindGroup {
  constructor(public descriptor: any) {}
}

export class MockGPUDevice {
  queue = new MockGPUQueue();
  buffers: MockGPUBuffer[] = [];
  textures: MockGPUTexture[] = [];
  samplers: MockGPUSampler[] = [];
  features = new Set(['timestamp-query', 'texture-formats-tier1', 'texture-formats-tier2', 'float32-filterable']);
  lost = new Promise<GPUDeviceLostInfo>(() => {});

  createBuffer(descriptor: { size: number; usage: number }): MockGPUBuffer {
    const buf = new MockGPUBuffer(descriptor);
    this.buffers.push(buf);
    return buf;
  }

  createTexture(descriptor: any): MockGPUTexture {
    const tex = new MockGPUTexture(descriptor);
    this.textures.push(tex);
    return tex;
  }

  createSampler(descriptor?: any): MockGPUSampler {
    const sampler = new MockGPUSampler(descriptor);
    this.samplers.push(sampler);
    return sampler;
  }

  createShaderModule(descriptor: { code: string; label?: string }) {
    return { code: descriptor.code, label: descriptor.label };
  }

  createComputePipeline(descriptor: any): MockGPUComputePipeline {
    return new MockGPUComputePipeline(descriptor);
  }

  createRenderPipeline(descriptor: any): MockGPURenderPipeline {
    return new MockGPURenderPipeline(descriptor);
  }

  createBindGroupLayout(descriptor: any) {
    return { descriptor };
  }

  createPipelineLayout(descriptor: any) {
    return { descriptor };
  }

  createBindGroup(descriptor: any): MockGPUBindGroup {
    return new MockGPUBindGroup(descriptor);
  }

  createCommandEncoder() {
    return {
      beginComputePass: () => ({
        setPipeline: (..._args: any[]) => {},
        setBindGroup: (..._args: any[]) => {},
        dispatchWorkgroups: (..._args: any[]) => {},
        end: (..._args: any[]) => {},
      }),
      beginRenderPass: () => ({
        setPipeline: (..._args: any[]) => {},
        setBindGroup: (..._args: any[]) => {},
        setVertexBuffer: (..._args: any[]) => {},
        setIndexBuffer: (..._args: any[]) => {},
        draw: (..._args: any[]) => {},
        drawIndexed: (..._args: any[]) => {},
        end: (..._args: any[]) => {},
      }),
      finish: () => ({}),
    };
  }

  addEventListener(event: string, callback: (...args: any[]) => void) {}
  removeEventListener(event: string, callback: (...args: any[]) => void) {}

  destroy() {
    this.buffers.forEach(b => b.destroy());
    this.buffers = [];
    this.textures.forEach(t => t.destroy());
    this.textures = [];
  }
}

export function createMockNavigatorGPU(supported = true) {
  if (!supported) return undefined;
  return {
    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
    requestAdapter: async () => ({
      limits: {
        maxStorageBufferBindingSize: 1024 * 1024 * 1024,
        maxBufferSize: 1024 * 1024 * 1024,
        maxComputeWorkgroupStorageSize: 32768,
        maxComputeInvocationsPerWorkgroup: 1024,
      },
      features: new Set(['timestamp-query']),
      requestDevice: async () => new MockGPUDevice(),
    }),
  };
}
