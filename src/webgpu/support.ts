// ============================================================================
// File: src/webgpu/support.ts
// Utility: Lightweight WebGPU Hardware Feature Detection (Zero WGSL Dependency)
// ============================================================================

export async function isWebGPUSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}
