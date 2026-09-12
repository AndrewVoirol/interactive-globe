/**
 * tests/modern/challenger-s2-it2-precip-active.test.ts
 *
 * Adversarial Challenger Test Suite for Stage 2 Iteration 2:
 * Gating and Allocation Lifecycle of `isPrecipActive` in WebGPUEngine.
 *
 * Challenger: challenger_s2_it2_1 (Empirical Adversarial Verification)
 *
 * Verifies:
 * 1. pluvialGamma = 0.0 skips allocating cartographic buffers when no other cartographic layer is active.
 * 2. pluvialGamma = 0.001 allocates cartographic buffers and sets up crustBindGroup entries 9 & 10.
 * 3. pluvialGamma = -1.0 and NaN gracefully clamp and avoid invalid buffer allocation.
 * 4. engine.setPluvialGamma() defensively clamps negatives to 0.0 and rejects NaN.
 * 5. 20,000-trial Monte Carlo fuzzing of the activation condition.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import * as THREE from 'three';

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
      createView: vi.fn(() => ({ label: 'mock_swapchain_view' })),
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

function createEngineConfig(pointCount = 256, lineCount = 30): WebGPUInitConfig {
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

function createFrameParams(overrides: Partial<WebGPUFrameParams> = {}): WebGPUFrameParams {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);

  return {
    camera,
    mode: 0,
    unfurl: 0.0,
    theme: 0,
    dt: 0.016,
    time: 0.0,
    // Explicitly ensure other cartographic layers are inactive
    reliefActive: false,
    showRelief: false,
    showVectors: false,
    showClouds: false,
    showAtmosphere: false,
    ...overrides,
  } as WebGPUFrameParams;
}

describe('Challenger S2-IT2: Adversarial isPrecipActive Allocation & Boundary Gating', () => {
  beforeEach(() => {
    setupMockNavigator();
  });

  afterEach(() => {
    restoreMockNavigator();
  });

  it('proves pluvialGamma = 0.0 skips allocating cartographic buffers when no other cartographic layer is active', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());

    // Initially, crustBindGroup is undefined (5-core startup buffer invariant)
    expect((engine as any).crustBindGroup).toBeUndefined();

    // Render with pluvialGamma = 0.0 and no other cartographic layers
    const params = createFrameParams({
      pluvialGamma: 0.0,
      weatherOpticalMode: 0,
    });

    expect(() => {
      engine.render(params);
    }).not.toThrow();

    // Verify cartographic buffers were NOT allocated
    expect((engine as any).crustBindGroup).toBeUndefined();
    expect((engine as any).dummyPrecipTexture).toBeNull();
    expect((engine as any).dummyPrecipTextureView).toBeNull();

    engine.dispose();
  });

  it('proves pluvialGamma = 0.001 allocates cartographic buffers and sets up crustBindGroup entries 9 and 10', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());

    expect((engine as any).crustBindGroup).toBeUndefined();

    // Render with epsilon positive pluvialGamma = 0.001
    const params = createFrameParams({
      pluvialGamma: 0.001,
      weatherOpticalMode: 0,
    });

    expect(() => {
      engine.render(params);
    }).not.toThrow();

    // Verify cartographic buffers WERE automatically allocated
    const crustBindGroup = (engine as any).crustBindGroup;
    expect(crustBindGroup).toBeDefined();

    const entry9 = crustBindGroup.descriptor.entries.find((e: any) => e.binding === 9);
    const entry10 = crustBindGroup.descriptor.entries.find((e: any) => e.binding === 10);

    expect(entry9).toBeDefined();
    expect(entry9.resource).toBe((engine as any).dummyPrecipTextureView);

    expect(entry10).toBeDefined();
    expect(entry10.resource).toBe((engine as any).dummyPrecipSampler);

    engine.dispose();
  });

  it('proves pluvialGamma = -1.0 avoids allocating cartographic buffers', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());

    expect((engine as any).crustBindGroup).toBeUndefined();

    // Render with negative pluvialGamma = -1.0
    const params = createFrameParams({
      pluvialGamma: -1.0,
      weatherOpticalMode: 0,
    });

    expect(() => {
      engine.render(params);
    }).not.toThrow();

    // Negative pluvialGamma must NOT trigger cartographic buffer allocation
    expect((engine as any).crustBindGroup).toBeUndefined();
    expect((engine as any).dummyPrecipTexture).toBeNull();

    engine.dispose();
  });

  it('proves pluvialGamma = NaN avoids allocating cartographic buffers', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());

    expect((engine as any).crustBindGroup).toBeUndefined();

    // Render with NaN pluvialGamma
    const params = createFrameParams({
      pluvialGamma: NaN,
      weatherOpticalMode: 0,
    });

    expect(() => {
      engine.render(params);
    }).not.toThrow();

    // NaN must NOT trigger cartographic buffer allocation
    expect((engine as any).crustBindGroup).toBeUndefined();
    expect((engine as any).dummyPrecipTexture).toBeNull();

    engine.dispose();
  });

  it('proves engine.setPluvialGamma() defensive behavior with -1.0, NaN, and subsequent renders', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());

    // 1. Negative pluvialGamma via setter
    engine.setPluvialGamma(-1.0);
    expect(engine.pluvialGamma).toBe(0.0); // Clamped to 0.0

    // Render without overriding pluvialGamma in params
    const params1 = createFrameParams({});
    engine.render(params1);
    expect((engine as any).crustBindGroup).toBeUndefined();

    // 2. NaN pluvialGamma via setter
    engine.setPluvialGamma(NaN);
    expect(engine.pluvialGamma).toBe(0.0); // Retained previous valid state (0.0)

    engine.render(params1);
    expect((engine as any).crustBindGroup).toBeUndefined();

    // 3. Positive pluvialGamma via setter
    engine.setPluvialGamma(0.75);
    expect(engine.pluvialGamma).toBe(0.75);

    engine.render(params1);
    expect((engine as any).crustBindGroup).toBeDefined();

    engine.dispose();
  });

  it('proves weatherOpticalMode boundary conditions: 0 (skip), 1 (allocate), -1 & NaN (skip)', async () => {
    // Sub-test A: weatherOpticalMode = 0 skips
    const engineA = new WebGPUEngine();
    await engineA.initialize(createEngineConfig());
    engineA.render(createFrameParams({ weatherOpticalMode: 0 }));
    expect((engineA as any).crustBindGroup).toBeUndefined();
    engineA.dispose();

    // Sub-test B: weatherOpticalMode = 1 allocates
    const engineB = new WebGPUEngine();
    await engineB.initialize(createEngineConfig());
    engineB.render(createFrameParams({ weatherOpticalMode: 1 }));
    expect((engineB as any).crustBindGroup).toBeDefined();
    engineB.dispose();

    // Sub-test C: weatherOpticalMode = -1 skips
    const engineC = new WebGPUEngine();
    await engineC.initialize(createEngineConfig());
    engineC.render(createFrameParams({ weatherOpticalMode: -1 }));
    expect((engineC as any).crustBindGroup).toBeUndefined();
    engineC.dispose();

    // Sub-test D: weatherOpticalMode = NaN skips
    const engineD = new WebGPUEngine();
    await engineD.initialize(createEngineConfig());
    engineD.render(createFrameParams({ weatherOpticalMode: NaN }));
    expect((engineD as any).crustBindGroup).toBeUndefined();
    engineD.dispose();
  });

  it('stress tests dynamic multi-frame transitions between inactive and active states', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());

    // Frame 0: 0.0 -> unallocated
    engine.render(createFrameParams({ pluvialGamma: 0.0 }));
    expect((engine as any).crustBindGroup).toBeUndefined();

    // Frame 1: -1.0 -> unallocated
    engine.render(createFrameParams({ pluvialGamma: -1.0 }));
    expect((engine as any).crustBindGroup).toBeUndefined();

    // Frame 2: NaN -> unallocated
    engine.render(createFrameParams({ pluvialGamma: NaN }));
    expect((engine as any).crustBindGroup).toBeUndefined();

    // Frame 3: 0.001 -> ALLOCATES!
    engine.render(createFrameParams({ pluvialGamma: 0.001 }));
    expect((engine as any).crustBindGroup).toBeDefined();

    // Frame 4: 0.0 -> Remains valid and doesn't crash or reallocate
    expect(() => {
      engine.render(createFrameParams({ pluvialGamma: 0.0 }));
    }).not.toThrow();
    expect((engine as any).crustBindGroup).toBeDefined();

    engine.dispose();
  });

  it('runs 20,000-trial Monte Carlo fuzzing on isPrecipActive boolean logic', () => {
    const engine = new WebGPUEngine();

    let seed = 424242;
    function rnd(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    const TRIALS = 20_000;
    for (let i = 0; i < TRIALS; i++) {
      const typeChoice = i % 6;
      let testVal: any;

      if (typeChoice === 0) {
        // Strictly negative: [-1000.0, -1e-10]
        testVal = -rnd() * 1000.0 - 1e-10;
        const active = engine.isPrecipActive({ pluvialGamma: testVal });
        expect(active).toBe(false);
      } else if (typeChoice === 1) {
        // Exact zeroes
        testVal = rnd() < 0.5 ? 0.0 : -0.0;
        const active = engine.isPrecipActive({ pluvialGamma: testVal });
        expect(active).toBe(false);
      } else if (typeChoice === 2) {
        // Non-finites and edge values (must all be rejected as inactive)
        const nonFinites = [NaN, Infinity, -Infinity, null, undefined, 'text', {}, []];
        testVal = nonFinites[Math.floor(rnd() * nonFinites.length)];
        const active = engine.isPrecipActive({ pluvialGamma: testVal });
        expect(active).toBe(false);
      } else if (typeChoice === 3) {
        // Infinitesimal positive [1e-15, 0.001]
        testVal = 1e-15 + rnd() * 0.001;
        const active = engine.isPrecipActive({ pluvialGamma: testVal });
        expect(active).toBe(true);
      } else if (typeChoice === 4) {
        // Normal positive [0.001, 2.0]
        testVal = 0.001 + rnd() * 2.0;
        const active = engine.isPrecipActive({ pluvialGamma: testVal });
        expect(active).toBe(true);
      } else {
        // Extreme positive [2.0, 1e8]
        testVal = 2.0 + rnd() * 1e8;
        const active = engine.isPrecipActive({ pluvialGamma: testVal });
        expect(active).toBe(true);
      }
    }

    engine.dispose();
  });
});
