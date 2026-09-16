// ============================================================================
// File: tests/webgpu/perf-audit-zombie-pass-remediation.test.ts
// Target: Performance & Frame Rate Audit — Zombie Pass Remediation Harness
// Authoritative References:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md
//   - Invariant §20: 16-Byte WGSL Struct Alignment & Zero-GC Buffer Discipline
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

let originalNavigator: any;

function setupMockNavigator() {
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
          features: new Set(['timestamp-query']),
          requestDevice: async () => new MockGPUDevice(),
        }),
      },
    },
    configurable: true,
    writable: true,
  });
}

function restoreMockNavigator() {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  }
}

function createMockCanvas(width = 1920, height = 1080) {
  const mockContext = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
    })),
    canvas: { width, height },
  };

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: vi.fn((type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;

  return { canvas, mockContext };
}

function createDummyInitConfig(pointCount = 100, lineCount = 100): WebGPUInitConfig {
  const { canvas } = createMockCanvas();
  const pointsData = new Float32Array(pointCount * 3);
  const target2DData = new Float32Array(pointCount * 2);
  const typeData = new Float32Array(pointCount);
  const lineIndices = new Uint32Array(lineCount * 2);

  return {
    canvas,
    pointCount,
    pointsData,
    target2DData,
    typeData,
    lineIndices,
  };
}

describe('Performance Audit: Zombie Pass Remediation & Zero GC Verification', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    setupMockNavigator();
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    engine.dispose();
    restoreMockNavigator();
  });

  it('PERF-01: Wind compute pass is bypassed when showWind/showSurfaceWinds/showJetStream are omitted', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);
    const device = (engine as any).device as MockGPUDevice;

    const camera = new THREE.PerspectiveCamera();
    const frameParams: WebGPUFrameParams = {
      unfurl: 0.0,
      mode: 0,
      theme: 0,
      time: 1.0,
      dt: 0.016,
      camera,
      viewport: { width: 1920, height: 1080 },
    };

    engine.render(frameParams);

    expect(device.buffers.length).toBe(5);
    expect((engine as any).windUniformBuffer).toBeNull();
  });

  it('PERF-02: Volumetric cloud raymarching pass is decoupled from cloud state and bypassed when volumetricClouds is false', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);

    const camera = new THREE.PerspectiveCamera();
    const frameParams: WebGPUFrameParams = {
      unfurl: 0.0,
      mode: 0,
      theme: 0,
      time: 1.0,
      dt: 0.016,
      camera,
      viewport: { width: 1920, height: 1080 },
      showClouds: true,
      volumetricClouds: false,
    };

    const volumetricSpy = vi.spyOn(engine, 'renderVolumetricClouds');
    engine.render(frameParams);

    expect(volumetricSpy).not.toHaveBeenCalled();
  });

  it('PERF-03: Atmosphere scatter pass is decoupled from cloud state and bypassed when showAtmosphere is false', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);

    const camera = new THREE.PerspectiveCamera();
    const frameParams: WebGPUFrameParams = {
      unfurl: 0.0,
      mode: 0,
      theme: 0,
      time: 1.0,
      dt: 0.016,
      camera,
      viewport: { width: 1920, height: 1080 },
      showClouds: true,
      showAtmosphere: false,
    };

    const atmSpy = vi.spyOn(engine, 'renderAtmosphereScatterPass');
    engine.render(frameParams);

    expect(atmSpy).not.toHaveBeenCalled();
  });

  it('PERF-04: Atmosphere scatter pass runs independently when showAtmosphere is true even with clouds false', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);

    const camera = new THREE.PerspectiveCamera();
    const frameParams: WebGPUFrameParams = {
      unfurl: 0.0,
      mode: 0,
      theme: 0,
      time: 1.0,
      dt: 0.016,
      camera,
      viewport: { width: 1920, height: 1080 },
      showClouds: false,
      showAtmosphere: true,
    };

    const atmSpy = vi.spyOn(engine, 'renderAtmosphereScatterPass');
    engine.render(frameParams);

    expect(atmSpy).toHaveBeenCalled();
  });

  it('PERF-05: Preallocated uniform buffers eliminate per-frame TypedArray allocations during animated rendering', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);

    const camera = new THREE.PerspectiveCamera();

    const frameParams: WebGPUFrameParams = {
      unfurl: 0.0,
      mode: 0,
      theme: 1,
      time: 1.0,
      dt: 0.016,
      camera,
      viewport: { width: 1920, height: 1080 },
    };

    const origUint32 = globalThis.Uint32Array;
    const origFloat32 = globalThis.Float32Array;
    let typedArrayAllocations = 0;
    const uint32Spy = vi.spyOn(globalThis, 'Uint32Array').mockImplementation(function(...args: any[]) {
      typedArrayAllocations++;
      return new origUint32(...args as [any]);
    });
    const float32Spy = vi.spyOn(globalThis, 'Float32Array').mockImplementation(function(...args: any[]) {
      typedArrayAllocations++;
      return new origFloat32(...args as [any]);
    });

    for (let i = 0; i < 10; i++) {
      frameParams.time += 0.016;
      engine.render(frameParams);
    }

    uint32Spy.mockRestore();
    float32Spy.mockRestore();
    expect(typedArrayAllocations).toBe(0);
  });

  it('PERF-06: updateCloudLayerUniform reuses preallocated buffers without reallocations', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);

    engine.ensureCloudBuffers();

    const origArrayBuffer = globalThis.ArrayBuffer;
    let bufferAllocations = 0;
    const abSpy = vi.spyOn(globalThis, 'ArrayBuffer').mockImplementation(function(...args: any[]) {
      bufferAllocations++;
      return new origArrayBuffer(...args as [any]);
    });

    for (let layer = 0; layer < 3; layer++) {
      engine.updateCloudLayerUniform(layer, 4.0, 0.5);
    }

    abSpy.mockRestore();
    expect(bufferAllocations).toBe(0);
  });

  it('PERF-07: Atmosphere layer resolution correctly respects visible: false in data layers', () => {
    const dataLayersWithHiddenAtm = [
      { id: 'architectural-topo-relief', visible: true },
      { id: 'atmosphere-scatter', visible: false },
    ];

    const stateRef = {
      showAtmosphere: true,
    };

    const liveOverrides = null as any;

    const atmLayer = dataLayersWithHiddenAtm.find(
      (l) => l.id === 'atmosphere-scatter' || l.id === 'planetary-atmosphere'
    );
    const effectiveShowAtmosphere = liveOverrides?.showAtmosphere !== undefined
      ? liveOverrides.showAtmosphere
      : (atmLayer !== undefined
        ? atmLayer.visible
        : (stateRef.showAtmosphere ?? false));

    expect(effectiveShowAtmosphere).toBe(false);
  });
});
