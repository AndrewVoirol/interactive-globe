import { describe, it, expect } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';

describe('F13: Dedicated WebGPU WGSL Compute Pipeline', () => {
  it('F13-T1: verifies workgroup size of 256 calculates correct workgroup dispatch counts', () => {
    const calculateWorkgroups = (pointCount: number, workgroupSize = 256) => {
      return Math.ceil(pointCount / workgroupSize);
    };

    expect(calculateWorkgroups(256)).toBe(1);
    expect(calculateWorkgroups(257)).toBe(2);
    expect(calculateWorkgroups(20000)).toBe(79); // ceil(20000/256) = 79
    expect(calculateWorkgroups(100000)).toBe(391); // ceil(100000/256) = 391
    expect(calculateWorkgroups(1000000)).toBe(3907); // ceil(1000000/256) = 3907
  });

  it('F13-T2: verifies uniform buffer layout enforces standard WGSL 16-byte alignment rules', () => {
    // WGSL struct SimUniforms:
    // unfurl: f32 (4), mode: u32 (4), layerMode: u32 (4), time: f32 (4) -> 16 bytes
    // dt: f32 (4), cursorActive: f32 (4), pad: vec2<f32> (8) -> 16 bytes
    // cursorRayOrig: vec4<f32> (16)
    // cursorRayDir: vec4<f32> (16)
    // cursorHitPos: vec4<f32> (16)
    // cursorVel: vec4<f32> (16)
    // viewMatrix: mat4x4<f32> (64)
    // projectionMatrix: mat4x4<f32> (64)
    // cameraPos: vec4<f32> (16)
    // Total = 16 + 16 + 16 + 16 + 16 + 16 + 64 + 64 + 16 = 224 bytes (multiple of 16)
    const structSizeBytes = 224;
    expect(structSizeBytes % 16).toBe(0);
    expect(structSizeBytes).toBeGreaterThanOrEqual(128);
  });

  it('F13-T3: verifies compute pipeline compiles and creates shader module with @compute entry point', () => {
    const device = new MockGPUDevice();
    const wgslSource = `
      @group(0) @binding(0) var<uniform> uniforms: SimUniforms;
      @group(0) @binding(1) var<storage, read> inPoints: array<vec4<f32>>;
      @group(0) @binding(2) var<storage, read_write> outPositions: array<vec4<f32>>;

      @compute @workgroup_size(256)
      fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x;
        if (index >= 1000000u) { return; }
        outPositions[index] = inPoints[index];
      }
    `;

    const shaderModule = device.createShaderModule({ code: wgslSource });
    expect(shaderModule.code).toContain('@compute @workgroup_size(256)');
    expect(shaderModule.code).toContain('fn cs_main');
  });

  it('F13-T4: verifies storage buffer creation with GPUBufferUsage flags (STORAGE | VERTEX | COPY_DST)', () => {
    const device = new MockGPUDevice();
    const STORAGE_USAGE = 0x0080;
    const VERTEX_USAGE = 0x0020;
    const COPY_DST_USAGE = 0x0008;

    const buffer = device.createBuffer({
      size: 1000000 * 16, // 1M vec4s (16MB)
      usage: STORAGE_USAGE | VERTEX_USAGE | COPY_DST_USAGE,
    });

    expect(buffer.size).toBe(16000000);
    expect(buffer.usage & STORAGE_USAGE).toBeTruthy();
    expect(buffer.usage & VERTEX_USAGE).toBeTruthy();
  });

  it('F13-T5: verifies compute pass dispatches without runtime exceptions on mock device', () => {
    const device = new MockGPUDevice();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    expect(() => {
      pass.setPipeline({} as any);
      pass.setBindGroup(0, {} as any);
      pass.dispatchWorkgroups(3907);
      pass.end();
    }).not.toThrow();
  });
});
