// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
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
      unfurl: 0,
      mode: 0,
      time: 0,
      dt: 0.016,
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
      unfurl: 0,
      mode: 0,
      time: 0,
      dt: 0.016,
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
      unfurl: 0,
      mode: 0,
      time: 0,
      dt: 0.016,
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

  it('G5: proves volumetric_cloud.wgsl enforces premultiplied alpha invariants across Themes 0, 1, 2', () => {
    const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
    const wgsl = fs.readFileSync(shaderPath, 'utf-8');

    // Symmetrical morphFade scaling on radiance and opacity
    expect(wgsl).toContain('finalLight *= morphFade;');
    expect(wgsl).toContain('finalAlpha *= morphFade;');

    // Proportional tooth and stipple modulation
    expect(wgsl).toContain('finalLight *= stippleFactor;');
    expect(wgsl).toContain('finalAlpha *= stippleFactor;');
    expect(wgsl).toContain('finalLight *= toothFactor;');
    expect(wgsl).toContain('finalAlpha *= toothFactor;');

    // Unassociated color conservation under actinic gamma response (Theme 2 Prussian Cyanotype)
    expect(wgsl).toContain('let unassociatedColor = finalLight / alphaSafe;');
    expect(wgsl).toContain('finalLight = unassociatedColor * finalAlpha;');

    // Premultiplied alpha hardware output: srcFactor: 'one', dstFactor: 'one-minus-src-alpha'
    expect(wgsl).toContain('return vec4<f32>(finalLight, finalAlpha);');
  });

  it('G6: proves volumetric_cloud.wgsl enforces pure Equirectangular 2:1 developable sheet bounds without Mercator vestiges', () => {
    const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
    const wgsl = fs.readFileSync(shaderPath, 'utf-8');

    // 1. Must enforce Equirectangular 2:1 sheet bounds: yMax = rInner * (1.0 - tStraighten + tStraighten * HALF_PI)
    expect(wgsl).toContain('let yMax = rInner * (1.0 - tStraighten + tStraighten * HALF_PI);');

    // 2. Must NOT contain vestigial Mercator 3.13 R scaling or mode >= 1u slab branching
    expect(wgsl).not.toContain('3.13 * rInner');
    expect(wgsl).not.toContain('3.13 * RADIUS');
    expect(wgsl).not.toContain('mode >= 1u');

    // 3. Must NOT conflate simulation mode with false-color diagnostic mode
    expect(wgsl).not.toContain('cloud.u_simControl.z > 1.5');
    expect(wgsl).toContain('let isFalseColor = cloud.u_padCloud.x > 0.5;');
  });

  it('G7: verifies WebGPUEngine pass gating discipline (Rule 24) and uniform pad slot 34 initialization', () => {
    // 1. Per Rule 24 Zero-Zombie Pass Invariant, optional passes default to inactive on raw engine
    expect((engine as any).volumetricCloudsEnabled).toBe(false);
    expect(engine.isVolumetricCloudsEnabled()).toBe(false);

    // Can be explicitly toggled via setter
    engine.setVolumetricCloudsEnabled(true);
    expect(engine.isVolumetricCloudsEnabled()).toBe(true);
    engine.setVolumetricCloudsEnabled(false);

    // 2. Dynamic uniform upload must explicitly initialize pad slot 34 to 0.0 (Equirectangular 2:1 sheet)
    const floats = (engine as any).volumetricCloudFloats;
    expect(floats).toBeDefined();
    // Execute updateVolumetricUniforms with default parameters
    (engine as any).updateVolumetricUniforms({
      time: 1.0,
      unfurl: 0.5,
      cloudFalseColor: false,
    }, camera);
    expect(floats[34]).toBe(0.0);
    expect(floats[36]).toBe(0.0); // falseColor is 0.0

    // Strata diagnostic falseColor true
    (engine as any).updateVolumetricUniforms({
      time: 1.0,
      unfurl: 0.5,
      cloudFalseColor: true,
    }, camera);
    expect(floats[36]).toBe(1.0); // falseColor is 1.0
  });

  it('G8: loadWeatherNextCloudLayers rejects text/html responses and falls back to NOAA GFS', async () => {
    const originalFetch = globalThis.fetch;
    // Mock fetch returning HTML (e.g. Vite SPA fallback on missing route)
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/data/weathernext/')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          arrayBuffer: async () => new TextEncoder().encode('<!DOCTYPE html><html><body>SPA</body></html>').buffer,
        };
      }
      // Fallback GFS request
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/octet-stream' },
        arrayBuffer: async () => new ArrayBuffer(1440 * 721 * 2),
      };
    });

    try {
      await engine.loadAllCloudLayers(true);
      // Because WeatherNext returned text/html, it must cleanly fallback to GFS 1440x721
      expect((engine as any).cloudTextures.low.width).toBe(1440);
      expect((engine as any).cloudTextures.low.height).toBe(721);
      expect((engine as any).lastLoadedWeatherNextHour).toBe(-1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('G9: dual-model ground shadow coupling activates whenever showClouds and showCloudLow are true', () => {
    // 1. WeatherNext 3 active with low cloud -> ground shadow must project onto crust
    engine.render({
      camera,
      unfurl: 0,
      mode: 0,
      time: 0,
      dt: 0.016,
      showClouds: true,
      showCloudLow: true,
      showCloudMid: true,
      showCloudHigh: true,
      prognosticModel: 'google-weathernext3',
      shadowIntensity: 0.45,
    });
    expect((engine as any).crustFloats[68]).toBeCloseTo(0.45, 2);

    // 2. NOAA GFS active with low cloud -> ground shadow must project onto crust
    engine.render({
      camera,
      unfurl: 0,
      mode: 0,
      time: 0,
      dt: 0.016,
      showClouds: true,
      showCloudLow: true,
      showCloudMid: true,
      showCloudHigh: true,
      prognosticModel: 'noaa-gfs',
      shadowIntensity: 0.45,
    });
    expect((engine as any).crustFloats[68]).toBeCloseTo(0.45, 2);
  });
});


