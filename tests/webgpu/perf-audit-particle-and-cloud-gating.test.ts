// ============================================================================
// File: tests/webgpu/perf-audit-particle-and-cloud-gating.test.ts
// Target: Verification of Particle Compute Dirty Gating and Explicit Cloud Strata Gating
// Authoritative References:
//   - Rule 24: Zero-Zombie Pass Invariant & Independent Pass Gating
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
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

describe('Particle Compute Dirty Gating & Explicit Cloud Pass Gating', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    setupMockNavigator();
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    engine.dispose();
    restoreMockNavigator();
  });

  it('PERF-P01: Particle compute dispatches during initial warmup frames (0 and 1)', async () => {
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
    };

    const device = (engine as any).device as MockGPUDevice;
    const createCommandEncoderSpy = vi.spyOn(device, 'createCommandEncoder');

    engine.render(frameParams);
    expect((engine as any).simWarmupFrames).toBe(1);

    engine.render(frameParams);
    expect((engine as any).simWarmupFrames).toBe(2);

    createCommandEncoderSpy.mockRestore();
  });

  it('PERF-P02: Particle compute pass is skipped when unfurl is 0 and static', async () => {
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
    };

    // Warmup 2 frames
    engine.render(frameParams);
    engine.render(frameParams);

    const warmupCount = (engine as any).simWarmupFrames;
    expect(warmupCount).toBe(2);

    // Frame 3: static, no change
    frameParams.time += 0.016;
    engine.render(frameParams);

    // Warmup frames should NOT increment because compute pass was skipped
    expect((engine as any).simWarmupFrames).toBe(2);
  });

  it('PERF-P03: Particle compute pass activates when unfurl changes or is greater than 0', async () => {
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
    };

    // Warmup 2 frames
    engine.render(frameParams);
    engine.render(frameParams);
    expect((engine as any).simWarmupFrames).toBe(2);

    // Activate unfurl
    frameParams.unfurl = 0.5;
    engine.render(frameParams);
    expect((engine as any).simWarmupFrames).toBe(3);

    // Change mode
    frameParams.mode = 1;
    engine.render(frameParams);
    expect((engine as any).simWarmupFrames).toBe(4);
  });

  it('PERF-P04: Cloud layers do NOT render when showClouds is omitted or false', async () => {
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
      // showClouds omitted
    };

    const cloudSpy = vi.spyOn(engine, 'renderCloudLayer');
    engine.render(frameParams);

    expect(cloudSpy).not.toHaveBeenCalled();

    // Explicitly false
    frameParams.showClouds = false;
    engine.render(frameParams);
    expect(cloudSpy).not.toHaveBeenCalled();

    cloudSpy.mockRestore();
  });

  it('PERF-P05: Cloud layers render when showClouds is explicitly true', async () => {
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
    };

    const cloudSpy = vi.spyOn(engine, 'renderCloudLayer');
    engine.render(frameParams);

    // With showClouds: true and all 3 strata default active, renderCloudLayer is called 3 times (low, mid, high)
    expect(cloudSpy).toHaveBeenCalledTimes(3);

    cloudSpy.mockRestore();
  });

  it('PERF-P06: Zero params.* !== false occurrences in WebGPUEngine.ts render code', () => {
    const engineCode = fs.readFileSync(
      path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts'),
      'utf-8'
    );

    // Check for params.showClouds !== false, params.showCloud* !== false, params.volumetricClouds !== false, params.showWind !== false
    expect(engineCode).not.toMatch(/params\.[a-zA-Z0-9_]+\s*!==\s*false/);
  });
});
