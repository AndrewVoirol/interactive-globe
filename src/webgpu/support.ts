// ============================================================================
// File: src/webgpu/support.ts
// Utility: Lightweight WebGPU Hardware Feature Detection (Zero WGSL Dependency)
// ============================================================================

let lastNavigatorGPU: any = null;
let globalAdapterPromise: Promise<GPUAdapter | null> | null = null;
let globalDevicePromise: Promise<GPUDevice | null> | null = null;

export function resetWebGPUCache(): void {
  globalAdapterPromise = null;
  globalDevicePromise = null;
  lastNavigatorGPU = null;
}

export async function getWebGPUAdapter(): Promise<GPUAdapter | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return null;
  }
  if (navigator.gpu !== lastNavigatorGPU) {
    globalAdapterPromise = null;
    globalDevicePromise = null;
    lastNavigatorGPU = navigator.gpu;
  }
  if (!globalAdapterPromise) {
    globalAdapterPromise = navigator.gpu.requestAdapter().catch(() => null);
  }
  return globalAdapterPromise;
}

export async function getWebGPUDevice(): Promise<GPUDevice | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return null;
  }
  if (navigator.gpu !== lastNavigatorGPU) {
    globalAdapterPromise = null;
    globalDevicePromise = null;
    lastNavigatorGPU = navigator.gpu;
  }
  if (!globalDevicePromise) {
    globalDevicePromise = (async () => {
      const adapter = await getWebGPUAdapter();
      if (!adapter) return null;
      try {
        const device = await adapter.requestDevice();
        if (device && device.lost) {
          device.lost.then(() => {
            globalDevicePromise = null;
            globalAdapterPromise = null;
          }).catch(() => {});
        }
        return device;
      } catch (err) {
        console.warn('Failed to acquire WebGPU device:', err);
        return null;
      }
    })();
  }
  return globalDevicePromise;
}

export async function isWebGPUSupported(): Promise<boolean> {
  const device = await getWebGPUDevice();
  return device !== null;
}
