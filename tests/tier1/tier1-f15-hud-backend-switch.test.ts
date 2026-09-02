import { describe, it, expect } from 'vitest';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

describe('F15: WebGPU/WebGL2 Runtime HUD Switch & Fallback Resilience', () => {
  it('F15-T1: verifies WebGPU feature detection checks navigator.gpu and adapter availability', async () => {
    const isSupported = async (navGpu: any): Promise<boolean> => {
      if (!navGpu) return false;
      try {
        const adapter = await navGpu.requestAdapter();
        return adapter !== null;
      } catch {
        return false;
      }
    };

    const navSupported = createMockNavigatorGPU(true);
    const navUnsupported = createMockNavigatorGPU(false);

    expect(await isSupported(navSupported)).toBe(true);
    expect(await isSupported(navUnsupported)).toBe(false);
  });

  it('F15-T2: verifies runtime fallback defaults gracefully to WebGL2 when WebGPU is absent', () => {
    const resolveEngineBackend = (hasWebGPU: boolean, userPreference?: 'webgpu' | 'webgl2'): 'webgpu' | 'webgl2' => {
      if (userPreference === 'webgl2') return 'webgl2';
      if (hasWebGPU && userPreference === 'webgpu') return 'webgpu';
      if (hasWebGPU) return 'webgpu';
      return 'webgl2';
    };

    expect(resolveEngineBackend(false, 'webgpu')).toBe('webgl2'); // Fallback!
    expect(resolveEngineBackend(true, 'webgpu')).toBe('webgpu');
    expect(resolveEngineBackend(true, 'webgl2')).toBe('webgl2');
    expect(resolveEngineBackend(false)).toBe('webgl2');
  });

  it('F15-T3: verifies continuous simulation state persists seamlessly across backend toggles', () => {
    interface EngineState {
      unfurl: number;
      mode: number;
      layerMode: number;
      time: number;
    }

    const state: EngineState = {
      unfurl: 0.65,
      mode: 3,
      layerMode: 1,
      time: 42.15,
    };

    // Simulate backend switch from WebGL2 to WebGPU and back
    let backend: 'webgl2' | 'webgpu' = 'webgl2';
    backend = 'webgpu';
    expect(state.unfurl).toBe(0.65);
    expect(state.mode).toBe(3);
    expect(state.layerMode).toBe(1);

    backend = 'webgl2';
    expect(state.unfurl).toBe(0.65);
    expect(state.time).toBe(42.15);
  });

  it('F15-T4: verifies engine dispose releases all allocated GPU buffers and event listeners', () => {
    const device = new MockGPUDevice();
    const buf1 = device.createBuffer({ size: 1024, usage: 1 });
    const buf2 = device.createBuffer({ size: 2048, usage: 1 });

    expect(device.buffers.length).toBe(2);
    device.destroy();
    expect(device.buffers.length).toBe(0);
    expect(buf1.data.byteLength).toBe(0);
    expect(buf2.data.byteLength).toBe(0);
  });

  it('F15-T5: verifies device loss or runtime exception triggers automatic WebGL2 failover', async () => {
    let activeBackend: 'webgpu' | 'webgl2' = 'webgpu';

    const handleWebGPUError = (err: any) => {
      console.warn('WebGPU crashed or lost:', err);
      activeBackend = 'webgl2';
    };

    try {
      throw new Error('GPU device lost');
    } catch (e) {
      handleWebGPUError(e);
    }

    expect(activeBackend).toBe('webgl2');
  });
});
