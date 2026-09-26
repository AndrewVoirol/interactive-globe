// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

function createMockCanvas(width = 800, height = 600) {
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

function createEngineConfig(pointCount = 100, lineCount = 100): WebGPUInitConfig {
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

describe('Volumetric Cloud & Data Reconciliation Suite', () => {
  let engine: WebGPUEngine;
  let originalNavigator: any;
  let camera: THREE.PerspectiveCamera;

  beforeEach(async () => {
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

    camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    engine = new WebGPUEngine();
    const config = createEngineConfig();
    await engine.initialize(config);
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  it('G1: ground shadow intensity drops to 0.0 when Low stratum is disabled (even with showClouds: true)', () => {
    // Both showClouds and showCloudLow enabled -> shadow active
    engine.render({
      camera,
      showClouds: true,
      showCloudLow: true,
      showCloudMid: true,
      showCloudHigh: true,
      shadowIntensity: 0.45,
    });
    expect((engine as any).crustFloats[68]).toBeCloseTo(0.45, 2);

    // Turn off Low stratum -> ground shadow must drop to 0.0 because low deck casts ground shadow
    engine.render({
      camera,
      showClouds: true,
      showCloudLow: false,
      showCloudMid: true,
      showCloudHigh: true,
      shadowIntensity: 0.45,
    });
    expect((engine as any).crustFloats[68]).toBe(0.0);
  });

  it('G2: ground shadow intensity and cloud rendering drop to 0.0 when all strata are disabled', () => {
    engine.render({
      camera,
      showClouds: true,
      showCloudLow: false,
      showCloudMid: false,
      showCloudHigh: false,
      shadowIntensity: 0.45,
    });
    // Crust shadow zeroed
    expect((engine as any).crustFloats[68]).toBe(0.0);
  });

  it('G3: ensureCloudBuffers handles 3600x1801 and 1440x721 transitions without texture size mismatch', () => {
    // 1. Allocate 3600x1801
    engine.ensureCloudBuffers(3600, 1801);
    expect((engine as any).cloudTextures.low.width).toBe(3600);
    expect((engine as any).cloudTextures.low.height).toBe(1801);
    expect((engine as any).cloudTextures.mid.width).toBe(3600);
    expect((engine as any).cloudTextures.high.width).toBe(3600);

    // 2. Allocate 1440x721
    engine.ensureCloudBuffers(1440, 721);
    expect((engine as any).cloudTextures.low.width).toBe(1440);
    expect((engine as any).cloudTextures.low.height).toBe(721);
    expect((engine as any).cloudTextures.mid.width).toBe(1440);
    expect((engine as any).cloudTextures.high.width).toBe(1440);
  });

  it('G4: loadAllCloudLayers handles GFS fallback atomically', async () => {
    await engine.loadAllCloudLayers(false);
    expect((engine as any).cloudTextures.low.width).toBe(1440);
    expect((engine as any).cloudTextures.low.height).toBe(721);
    expect((engine as any).lastLoadedWeatherNextHour).toBe(-1);
  });
});
