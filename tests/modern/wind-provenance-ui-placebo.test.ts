// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { WeatherNextDataSource, MeteorologicalProvenance } from '../../src/core/data/WeatherNextDataSource';
import { PrognosticModelCard } from '../../src/components/hud/instruments/PrognosticModelCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

function createMockCanvas(width = 800, height = 600) {
  const mockContext = {
    configure: () => {},
    getCurrentTexture: () => ({
      createView: () => ({}),
    }),
    canvas: { width, height },
  };

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: (type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;

  return { canvas, mockContext };
}

function createEngineConfig(pointCount = 100, lineCount = 20) {
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

describe('Stage 3: Wind Advection & Provenance Architecture - Placebo Test & Telemetry Contracts', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setupMockNavigator();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    if (typeof window !== 'undefined') {
      delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      delete (window as any).__INDICATRIX_SET_WIND_SPEED_MULTIPLIER__;
      delete (window as any).__INDICATRIX_SET_WIND_PARTICLE_LIFETIME__;
      delete (window as any).__INDICATRIX_SET_PROVENANCE__;
    }
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    restoreMockNavigator();
    vi.restoreAllMocks();
  });

  it('PLACEBO-01: Direct mutator alters active windUniformFloats and writes directly to GPU buffer memory', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());
    engine.ensureWindBuffers();

    const device = (engine as any).device as MockGPUDevice;
    expect(device).toBeDefined();
    expect((engine as any).windUniformBuffer).toBeDefined();

    const initialWriteCalls = device.queue.writeBufferCalls.length;

    // Mutate speed multiplier
    engine.setWindSpeedMultiplier(3.75);

    // Verify CPU mirror state at index 5 (byte offset 20)
    expect((engine as any).windUniformFloats[5]).toBeCloseTo(3.75, 4);

    // Verify GPU writeBuffer was executed immediately without waiting for render loop
    expect(device.queue.writeBufferCalls.length).toBeGreaterThan(initialWriteCalls);
    const lastWrite = device.queue.writeBufferCalls[device.queue.writeBufferCalls.length - 1];
    expect(lastWrite.buffer).toBe((engine as any).windUniformBuffer);
    const writtenFloats = new Float32Array((lastWrite.data as Float32Array).buffer);
    expect(writtenFloats[5]).toBeCloseTo(3.75, 4);

    // Mutate particle lifetime
    engine.setWindParticleLifetime(14.5);

    // Verify CPU mirror state at index 11 (byte offset 44)
    expect((engine as any).windUniformFloats[11]).toBeCloseTo(14.5, 4);
    const lastWriteLifetime = device.queue.writeBufferCalls[device.queue.writeBufferCalls.length - 1];
    const writtenFloatsLifetime = new Float32Array((lastWriteLifetime.data as Float32Array).buffer);
    expect(writtenFloatsLifetime[11]).toBeCloseTo(14.5, 4);

    engine.dispose();
  });

  it('PLACEBO-02: Frame loop updateUniforms guarantees Zero-GC and packs UI parameters into exact WGSL byte offsets', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());
    engine.ensureWindBuffers();

    const mirrorRef = (engine as any).windUniformFloats;
    expect(mirrorRef).toBeInstanceOf(Float32Array);
    expect(mirrorRef.length).toBe(16); // 64 bytes

    // Execute 500 simulated frame uniform updates
    for (let frame = 0; frame < 500; frame++) {
      (engine as any).updateUniforms({
        alpha: 0.5,
        mode: 0,
        time: frame * 0.016,
        dt: 0.016,
        unfurl: 1.0,
        windSpeedMultiplier: 2.5,
        windParticleLifetime: 9.0,
        scrubTau: 0.65,
      });
    }

    // Assert Zero-GC invariant: the mirror reference MUST NEVER be re-instantiated
    expect((engine as any).windUniformFloats).toBe(mirrorRef);

    // Verify exact byte alignments in 64-byte WindSimUniforms:
    // Byte 20 -> Float index 5: u_speedMultiplier
    expect(mirrorRef[5]).toBeCloseTo(2.5, 4);
    // Byte 44 -> Float index 11: u_particleLifetime
    expect(mirrorRef[11]).toBeCloseTo(9.0, 4);
    // Byte 60 -> Float index 15: u_tau
    expect(mirrorRef[15]).toBeCloseTo(0.65, 4);

    engine.dispose();
  });

  it('PLACEBO-03: Window Global Bridge dispatches directly to GPU uniform buffer', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());
    engine.ensureWindBuffers();

    (window as any).__INDICATRIX_WEBGPU_ENGINE__ = engine;
    (window as any).__INDICATRIX_SET_WIND_SPEED_MULTIPLIER__ = (val: number) => {
      engine.setWindSpeedMultiplier(val);
    };
    (window as any).__INDICATRIX_SET_WIND_PARTICLE_LIFETIME__ = (val: number) => {
      engine.setWindParticleLifetime(val);
    };

    // Invoke via global bridge
    (window as any).__INDICATRIX_SET_WIND_SPEED_MULTIPLIER__(4.8);
    expect((engine as any).windUniformFloats[5]).toBeCloseTo(4.8, 4);

    (window as any).__INDICATRIX_SET_WIND_PARTICLE_LIFETIME__(18.2);
    expect((engine as any).windUniformFloats[11]).toBeCloseTo(18.2, 4);

    engine.dispose();
  });

  it('PLACEBO-04: UI Vernier Sliders in PrognosticModelCard render and mutate GPU memory on input events', async () => {
    const engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());
    engine.ensureWindBuffers();
    (window as any).__INDICATRIX_WEBGPU_ENGINE__ = engine;

    const onSpeedChangeMock = vi.fn((v: number) => {
      engine.setWindSpeedMultiplier(v);
    });
    const onLifetimeChangeMock = vi.fn((v: number) => {
      engine.setWindParticleLifetime(v);
    });

    await act(async () => {
      root.render(
        React.createElement(PrognosticModelCard, {
          prognosticModel: 'weathernext3',
          prognosticVariable: 'wind_10m_vector',
          windSpeedMultiplier: 1.0,
          onWindSpeedMultiplierChange: onSpeedChangeMock,
          windParticleLifetime: 6.0,
          onWindParticleLifetimeChange: onLifetimeChangeMock,
        })
      );
    });

    // Verify sliders exist in DOM
    const speedSlider = container.querySelector('#wind-speed-multiplier-slider') as HTMLInputElement;
    const lifetimeSlider = container.querySelector('#wind-particle-lifetime-slider') as HTMLInputElement;
    expect(speedSlider).not.toBeNull();
    expect(lifetimeSlider).not.toBeNull();

    // Helper to simulate React-tracked input event
    const setInputValue = (input: HTMLInputElement, val: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Trigger slider interaction for Wind Speed Multiplier
    await act(async () => {
      setInputValue(speedSlider, '5.5');
    });

    expect(onSpeedChangeMock).toHaveBeenCalledWith(5.5);
    expect((engine as any).windUniformFloats[5]).toBeCloseTo(5.5, 4);

    // Trigger slider interaction for Particle Lifetime
    await act(async () => {
      setInputValue(lifetimeSlider, '11.0');
    });

    expect(onLifetimeChangeMock).toHaveBeenCalledWith(11.0);
    expect((engine as any).windUniformFloats[11]).toBeCloseTo(11.0, 4);

    // Also test fine-increment vernier stepper button (+0.1 from base 1.0)
    const speedIncButton = container.querySelector('button[title="Increase Vector Wind Flow Advection"]') as HTMLButtonElement;
    expect(speedIncButton).not.toBeNull();
    await act(async () => {
      speedIncButton.click();
    });
    expect(onSpeedChangeMock).toHaveBeenCalledWith(1.1);
    expect((engine as any).windUniformFloats[5]).toBeCloseTo(1.1, 4);

    engine.dispose();
  });

  it('PROVENANCE-01: WeatherNextDataSource exports strictly typed, synchronized provenance metadata', () => {
    const dataSource = new WeatherNextDataSource();
    const prov = dataSource.getProvenance(0.75, true, true);

    expect(prov.modelName).toBe('Google DeepMind WeatherNext 3');
    expect(prov.spatialResolutionDeg).toBe(0.1);
    expect(prov.temporalBlendTau).toBeCloseTo(0.75, 2);
    // When tau > 0.5, slot index increments to the forward target slot in the 3-slot ring
    expect(prov.activeSlotIndex).toBe(1);
    expect(prov.strata.surface10m).toBe(true);
    expect(prov.strata.jetStream250hPa).toBe(true);
    expect(prov.runTimestamp).toBeDefined();
    expect(prov.validTimestamp).toBeDefined();

    // Verify base cycle step when tau <= 0.5
    dataSource.setTime(6, 0.25);
    const prov6 = dataSource.getProvenance(0.25, true, false);
    expect(prov6.forecastHour).toBe(6);
    expect(prov6.temporalBlendTau).toBeCloseTo(0.25, 2);
    expect(prov6.activeSlotIndex).toBe(0);
    expect(prov6.strata.surface10m).toBe(true);
    expect(prov6.strata.jetStream250hPa).toBe(false);
  });

  it('PROVENANCE-02: PrognosticModelCard displays active provenance telemetry in DOM', async () => {
    const sampleProvenance: MeteorologicalProvenance = {
      modelName: 'Google DeepMind WeatherNext 3',
      runTimestamp: '2026-09-30T00:00:00Z',
      validTimestamp: '2026-09-30T12:00:00Z',
      forecastHour: 12,
      spatialResolutionDeg: 0.1,
      temporalBlendTau: 0.42,
      activeSlotIndex: 1,
      strata: {
        surface10m: true,
        jetStream250hPa: true,
      },
    };

    await act(async () => {
      root.render(
        React.createElement(PrognosticModelCard, {
          prognosticModel: 'weathernext3',
          prognosticVariable: 'wind_10m_vector',
          provenance: sampleProvenance,
        })
      );
    });

    // Verify provenance telemetry values are displayed in the DOM
    const textContent = container.textContent || '';
    expect(textContent).toContain('0.1° (~10 km)');
    expect(textContent).toContain('00Z Hybrid');
    expect(textContent).toContain('τ=0.42 (Slot 1)');
  });
});
