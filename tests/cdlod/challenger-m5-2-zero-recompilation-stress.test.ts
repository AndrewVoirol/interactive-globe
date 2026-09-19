// ============================================================================
// File: tests/cdlod/challenger-m5-2-zero-recompilation-stress.test.ts
// Test Tier: Milestone 5 Challenger (Zero-Recompilation & Stress Challenger)
// Challenger: challenger_m5_2
// Description: Empirically stress-tests rapid switching of diagnostic modes:
//              - 100 rapid mode switches (0 -> 1 -> 2 -> 3 -> 0 ...) during continuous rendering
//              - Strict Rule 18 compliance: 0 GPU pipeline recompilations
//                (device.createRenderPipeline and device.createComputePipeline called 0 times)
//              - Strict Rule 26 & Invariant §20 compliance: constant GPU/CPU memory usage
//                (0 GPU buffer leaks, 0 texture leaks, in-place typed array mutation)
//              - SimUniforms float 79 byte offset 316 integrity & non-corruption of adjacent uniforms
//              - Adversarial fuzzing of non-canonical diagnostic mode inputs
//              - Continuous camera orbit & CDLOD quadtree interleaved stress
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice, MockGPUBuffer } from '../helpers/webgpu-mock';

let originalNavigator: any;

function createInstrumentedMockDevice(): {
  device: MockGPUDevice;
  renderPipelineSpy: ReturnType<typeof vi.fn>;
  computePipelineSpy: ReturnType<typeof vi.fn>;
  createBufferSpy: ReturnType<typeof vi.fn>;
  writeBufferSpy: ReturnType<typeof vi.fn>;
} {
  const device = new MockGPUDevice();

  const originalCreateRenderPipeline = device.createRenderPipeline.bind(device);
  const renderPipelineSpy = vi.fn((desc: any) => originalCreateRenderPipeline(desc));
  device.createRenderPipeline = renderPipelineSpy as any;

  const originalCreateComputePipeline = device.createComputePipeline.bind(device);
  const computePipelineSpy = vi.fn((desc: any) => originalCreateComputePipeline(desc));
  device.createComputePipeline = computePipelineSpy as any;

  const originalCreateBuffer = device.createBuffer.bind(device);
  const createBufferSpy = vi.fn((desc: any) => originalCreateBuffer(desc));
  device.createBuffer = createBufferSpy as any;

  const originalWriteBuffer = device.queue.writeBuffer.bind(device.queue);
  const writeBufferSpy = vi.fn((buffer: any, offset: any, data: any) => {
    originalWriteBuffer(buffer, offset, data);
  });
  device.queue.writeBuffer = writeBufferSpy as any;

  // Augment command encoder to support indirect draw calls if checked
  const originalCreateCommandEncoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = () => {
    const enc = originalCreateCommandEncoder() as any;
    enc.beginRenderPass = () => ({
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      draw: vi.fn(),
      drawIndexed: vi.fn(),
      drawIndexedIndirect: vi.fn(),
      end: vi.fn(),
    });
    enc.beginComputePass = () => ({
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      dispatchWorkgroupsIndirect: vi.fn(),
      end: vi.fn(),
    });
    return enc;
  };

  return {
    device,
    renderPipelineSpy,
    computePipelineSpy,
    createBufferSpy,
    writeBufferSpy,
  };
}

function setupMockNavigator(mockDevice: MockGPUDevice) {
  originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
        requestAdapter: async () => ({
          limits: {
            maxStorageBufferBindingSize: 1024 * 1024 * 1024,
            maxBufferSize: 1024 * 1024 * 1024,
            maxComputeWorkgroupStorageSize: 32768,
            maxComputeInvocationsPerWorkgroup: 1024,
          },
          features: new Set(['timestamp-query', 'texture-formats-tier1', 'texture-formats-tier2', 'float32-filterable']),
          requestDevice: async () => mockDevice,
        }),
      },
    },
    configurable: true,
    writable: true,
  });
}

function restoreMockNavigator() {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
}

function createMockCanvas(width = 1920, height = 1080) {
  const mockContext = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
    })),
  };
  return {
    width,
    height,
    getContext: vi.fn((type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;
}

describe('Milestone 5 Challenger (challenger_m5_2): Zero-Recompilation & Diagnostic Stress Suite', () => {
  let engine: WebGPUEngine;
  let instrumented: ReturnType<typeof createInstrumentedMockDevice>;
  let camera: THREE.PerspectiveCamera;

  beforeEach(async () => {
    instrumented = createInstrumentedMockDevice();
    setupMockNavigator(instrumented.device);

    engine = new WebGPUEngine();
    const canvas = createMockCanvas(1920, 1080);
    await engine.initialize({
      canvas,
      pointCount: 100,
      pointsData: new Float32Array(300),
      target2DData: new Float32Array(200),
      typeData: new Float32Array(100),
      lineIndices: new Uint32Array(200),
    });

    camera = new THREE.PerspectiveCamera(45, 1920 / 1080, 0.1, 1000);
    camera.position.set(0, 0, 15);
    camera.updateMatrixWorld(true);

    // Warm-up frames: render 5 frames with relief and CDLOD to stabilize all lazy buffers/pipelines
    for (let f = 0; f < 5; f++) {
      engine.render({
        camera,
        time: f * 0.016,
        dt: 0.016,
        unfurl: 0.0,
        mode: 0,
        theme: 1,
        reliefActive: true,
        showRelief: true,
        showVectors: true,
        cdlodDiagnosticMode: 0,
      });
    }
  });

  afterEach(() => {
    if (engine) {
      engine.dispose();
    }
    restoreMockNavigator();
  });

  // ==========================================================================
  // Pillar 1: 100 Rapid Diagnostic Mode Switches Under Continuous Rendering
  // ==========================================================================
  describe('Pillar 1: 100 Rapid Diagnostic Mode Switches Under Continuous Rendering (Rule 18 Strict Compliance)', () => {
    it('executes 100 rapid mode switches (0 -> 1 -> 2 -> 3 -> 0 ...) during continuous rendering with STRICT ZERO new GPU pipelines', () => {
      const renderPipelinesAtBaseline = instrumented.renderPipelineSpy.mock.calls.length;
      const computePipelinesAtBaseline = instrumented.computePipelineSpy.mock.calls.length;

      expect(renderPipelinesAtBaseline).toBeGreaterThan(0); // Pipelines exist from initialization

      const targetModes = [0, 1, 2, 3];
      const totalSwitches = 100;

      for (let i = 0; i < totalSwitches; i++) {
        const targetMode = targetModes[i % targetModes.length];
        const prevRenderPipelineCount = instrumented.renderPipelineSpy.mock.calls.length;
        const prevComputePipelineCount = instrumented.computePipelineSpy.mock.calls.length;

        // Execute continuous rendering frame with mode switch
        expect(() => {
          engine.render({
            camera,
            time: 1.0 + i * 0.016,
            dt: 0.016,
            unfurl: (i % 20) / 20,
            mode: 0,
            theme: 1,
            reliefActive: true,
            showRelief: true,
            showVectors: true,
            cdlodDiagnosticMode: targetMode,
          });
        }).not.toThrow();

        // Strict per-frame Rule 18 assertion: 0 new pipelines created in this frame
        expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(prevRenderPipelineCount);
        expect(instrumented.computePipelineSpy.mock.calls.length).toBe(prevComputePipelineCount);

        // Verify engine uniform state matches targetMode exactly
        expect(engine.cdlodDiagnosticMode).toBe(targetMode);
        const crustFloats = (engine as any).crustFloats as Float32Array;
        expect(crustFloats[79]).toBe(targetMode);
      }

      // Aggregate Rule 18 assertion across all 100 mode switches
      expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(renderPipelinesAtBaseline);
      expect(instrumented.computePipelineSpy.mock.calls.length).toBe(computePipelinesAtBaseline);
    });

    it('verifies 100 rapid mode switches via setCdlodDiagnosticMode without render() also creates ZERO pipelines', () => {
      const renderPipelinesAtBaseline = instrumented.renderPipelineSpy.mock.calls.length;
      const computePipelinesAtBaseline = instrumented.computePipelineSpy.mock.calls.length;

      const targetModes = [0, 1, 2, 3];
      for (let i = 0; i < 100; i++) {
        const mode = targetModes[i % targetModes.length];
        engine.setCdlodDiagnosticMode(mode);

        expect(engine.cdlodDiagnosticMode).toBe(mode);
        const crustFloats = (engine as any).crustFloats as Float32Array;
        expect(crustFloats[79]).toBe(mode);
      }

      expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(renderPipelinesAtBaseline);
      expect(instrumented.computePipelineSpy.mock.calls.length).toBe(computePipelinesAtBaseline);
    });
  });

  // ==========================================================================
  // Pillar 2: Memory Invariance & Zero GPU Buffer Leaks
  // ==========================================================================
  describe('Pillar 2: Memory Invariance & Zero GPU Buffer/Texture Leaks (Rule 26 & Invariant §20)', () => {
    it('asserts that GPU buffer count and texture count remain strictly constant across 100 mode switches', () => {
      const baselineBufferCount = instrumented.device.buffers.length;
      const baselineTextureCount = instrumented.device.textures.length;
      const baselineCreateBufferCalls = instrumented.createBufferSpy.mock.calls.length;

      const baselineTotalBufferBytes = instrumented.device.buffers.reduce(
        (acc: number, b: MockGPUBuffer) => acc + b.size,
        0
      );

      // Execute 100 rapid mode transitions during continuous rendering
      for (let i = 0; i < 100; i++) {
        const targetMode = i % 4;
        engine.render({
          camera,
          time: 2.0 + i * 0.016,
          dt: 0.016,
          unfurl: 0.0,
          mode: 0,
          theme: 1,
          reliefActive: true,
          showRelief: true,
          cdlodDiagnosticMode: targetMode,
        });
      }

      // Assert zero buffer leaks or allocations
      expect(instrumented.device.buffers.length).toBe(baselineBufferCount);
      expect(instrumented.createBufferSpy.mock.calls.length).toBe(baselineCreateBufferCalls);

      // Assert byte footprint remains strictly invariant
      const finalTotalBufferBytes = instrumented.device.buffers.reduce(
        (acc: number, b: MockGPUBuffer) => acc + b.size,
        0
      );
      expect(finalTotalBufferBytes).toBe(baselineTotalBufferBytes);

      // Assert zero texture leaks
      expect(instrumented.device.textures.length).toBe(baselineTextureCount);
    });

    it('asserts zero CPU typed array reallocations (preallocated mirror buffer invariance)', () => {
      const crustFloatsInstance = (engine as any).crustFloats;
      const bufferInstance = crustFloatsInstance.buffer;

      // Perform 1,000 rapid mode switches in a tight loop
      for (let i = 0; i < 1000; i++) {
        engine.setCdlodDiagnosticMode(i % 4);
      }

      // Rule 26: Preallocated class instance mirror must be mutated strictly in-place
      expect((engine as any).crustFloats).toBe(crustFloatsInstance);
      expect((engine as any).crustFloats.buffer).toBe(bufferInstance);
      expect(crustFloatsInstance.byteLength).toBe(320); // 80 floats * 4 bytes = 320 bytes
    });
  });

  // ==========================================================================
  // Pillar 3: SimUniforms Byte Layout & Offset 316 (Float 79) Integrity
  // ==========================================================================
  describe('Pillar 3: SimUniforms Byte Layout & Float 79 Data Integrity', () => {
    it('verifies that each mode switch correctly uploads exact float representation at byte offset 316', () => {
      const modes = [0, 1, 2, 3];

      for (const mode of modes) {
        instrumented.writeBufferSpy.mockClear();

        engine.render({
          camera,
          time: 1.0,
          dt: 0.016,
          unfurl: 0.0,
          mode: 0,
          theme: 1,
          reliefActive: true,
          showRelief: true,
          cdlodDiagnosticMode: mode,
        });

        // Find writeBuffer call targeting crustUniformBuffer
        const crustBuf = (engine as any).crustUniformBuffer;
        const call = instrumented.writeBufferSpy.mock.calls.find((c: any) => c[0] === crustBuf);
        expect(call).toBeDefined();

        const [buffer, offset, data] = call;
        expect(buffer).toBe(crustBuf);
        expect(offset).toBe(0);

        // Inspect raw ArrayBufferView data
        const view = new Float32Array(data);
        expect(view[79]).toBe(mode);

        // Byte offset verification: float index 79 corresponds to byte 316
        const byteView = new DataView(data);
        expect(byteView.getFloat32(316, true)).toBe(mode);
      }
    });

    it('verifies non-corruption of adjacent uniforms (floats 76, 77, 78) across rapid mode switches', () => {
      // Set specific known values in adjacent uniforms
      const cf = (engine as any).crustFloats as Float32Array;
      cf[76] = 42.5;  // weatherTau
      cf[77] = 1.0;   // advectionActive
      cf[78] = 0.0;   // toksvigBypass

      // Rapidly switch diagnostic modes 100 times
      for (let i = 0; i < 100; i++) {
        engine.setCdlodDiagnosticMode(i % 4);

        // Verify float 79 changed
        expect(cf[79]).toBe(i % 4);

        // Verify adjacent floats were NOT overwritten or corrupted
        expect(cf[76]).toBe(42.5);
        expect(cf[77]).toBe(1.0);
        expect(cf[78]).toBe(0.0);
      }
    });
  });

  // ==========================================================================
  // Pillar 4: Dual Setting Invariance & Persistence
  // ==========================================================================
  describe('Pillar 4: Dual Setting Invariance & State Persistence', () => {
    it('produces identical engine state via setCdlodDiagnosticMode vs render({ cdlodDiagnosticMode })', () => {
      for (let m = 0; m <= 3; m++) {
        // Path A: via setCdlodDiagnosticMode
        engine.setCdlodDiagnosticMode(m);
        const cfA = (engine as any).crustFloats[79];
        const stateA = engine.cdlodDiagnosticMode;

        // Path B: via render parameter
        engine.render({
          camera,
          time: 1.0,
          dt: 0.016,
          unfurl: 0.0,
          mode: 0,
          cdlodDiagnosticMode: m,
        });
        const cfB = (engine as any).crustFloats[79];
        const stateB = engine.cdlodDiagnosticMode;

        expect(cfA).toBe(m);
        expect(cfB).toBe(m);
        expect(stateA).toBe(m);
        expect(stateB).toBe(m);
      }
    });

    it('preserves the active diagnostic mode when cdlodDiagnosticMode is omitted in subsequent render calls', () => {
      // Set mode 2 (Morph Alpha)
      engine.setCdlodDiagnosticMode(2);
      expect(engine.cdlodDiagnosticMode).toBe(2);

      // Render 10 frames WITHOUT cdlodDiagnosticMode in params
      for (let f = 0; f < 10; f++) {
        engine.render({
          camera,
          time: f * 0.016,
          dt: 0.016,
          unfurl: 0.0,
          mode: 0,
        });

        // Mode must remain 2, NOT reset to 0 or undefined
        expect(engine.cdlodDiagnosticMode).toBe(2);
        expect((engine as any).crustFloats[79]).toBe(2.0);
      }
    });
  });

  // ==========================================================================
  // Pillar 5: Adversarial State Fuzzing & Boundary Hardening
  // ==========================================================================
  describe('Pillar 5: Adversarial State Fuzzing & Boundary Hardening', () => {
    it('handles non-canonical and out-of-bounds diagnostic mode values gracefully without crashing or recompiling', () => {
      const renderPipelinesAtBaseline = instrumented.renderPipelineSpy.mock.calls.length;
      const computePipelinesAtBaseline = instrumented.computePipelineSpy.mock.calls.length;

      const adversarialInputs = [
        -1,
        -100,
        4,
        10,
        999,
        0.5,
        1.5,
        2.7,
        3.99,
        NaN,
        Infinity,
        -Infinity,
      ];

      for (const adv of adversarialInputs) {
        expect(() => {
          engine.render({
            camera,
            time: 1.0,
            dt: 0.016,
            unfurl: 0.0,
            mode: 0,
            cdlodDiagnosticMode: adv,
          });
        }).not.toThrow();

        // Assert zero new pipelines
        expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(renderPipelinesAtBaseline);
        expect(instrumented.computePipelineSpy.mock.calls.length).toBe(computePipelinesAtBaseline);
      }

      // Seamless recovery to standard mode 1
      engine.setCdlodDiagnosticMode(1);
      expect(engine.cdlodDiagnosticMode).toBe(1);
      expect((engine as any).crustFloats[79]).toBe(1.0);
      expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(renderPipelinesAtBaseline);
    });
  });

  // ==========================================================================
  // Pillar 6: Interleaved Camera Trajectories & CDLOD Quadtree Updates
  // ==========================================================================
  describe('Pillar 6: Interleaved Camera Trajectories & CDLOD Quadtree Updates', () => {
    it('simulates 100 continuous frames of orbiting camera while rapidly cycling diagnostic modes', () => {
      const renderPipelinesAtBaseline = instrumented.renderPipelineSpy.mock.calls.length;
      const bufferCountAtBaseline = instrumented.device.buffers.length;

      // Orbit camera while zooming from altitude 30.0 down to 1.0
      for (let frame = 0; frame < 100; frame++) {
        const theta = frame * 0.05;
        const radius = 5.0 + 25.0 * (1.0 - frame / 100); // 30.0 down to 5.0
        camera.position.set(radius * Math.sin(theta), 0.5 * Math.cos(theta), radius * Math.cos(theta));
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);

        const targetMode = frame % 4;

        expect(() => {
          engine.render({
            camera,
            time: frame * 0.016,
            dt: 0.016,
            unfurl: 0.0,
            mode: 0,
            theme: 1,
            reliefActive: true,
            showRelief: true,
            cdlodDiagnosticMode: targetMode,
          });
        }).not.toThrow();

        // Assert zero recompilations during high-velocity camera + mode switching
        expect(instrumented.renderPipelineSpy.mock.calls.length).toBe(renderPipelinesAtBaseline);
      }

      // Assert buffer count remained strictly invariant
      expect(instrumented.device.buffers.length).toBe(bufferCountAtBaseline);
    });
  });
});
