/**
 * WebGPU Mock and Verification Utilities for Node Test Environments
 */

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

export class MockGPUQueue {
  writeBufferCalls: Array<{ buffer: MockGPUBuffer; bufferOffset: number; data: ArrayBufferView | ArrayBuffer }> = [];

  writeBuffer(buffer: MockGPUBuffer, bufferOffset: number, data: ArrayBufferView | ArrayBuffer) {
    this.writeBufferCalls.push({ buffer, bufferOffset, data });
  }

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

  createBuffer(descriptor: { size: number; usage: number }): MockGPUBuffer {
    const buf = new MockGPUBuffer(descriptor);
    this.buffers.push(buf);
    return buf;
  }

  createShaderModule(descriptor: { code: string }) {
    return { code: descriptor.code };
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

  destroy() {
    this.buffers.forEach(b => b.destroy());
    this.buffers = [];
  }
}

export function createMockNavigatorGPU(supported = true) {
  if (!supported) return undefined;
  return {
    requestAdapter: async () => ({
      requestDevice: async () => new MockGPUDevice(),
    }),
  };
}
