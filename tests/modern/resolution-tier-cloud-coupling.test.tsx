// ============================================================================
// File: tests/modern/resolution-tier-cloud-coupling.test.ts
// Purpose: Verification of ResolutionTier to Volumetric Cloud Raymarch Steps
//          Coupling and HUD Telemetry Invariants
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RESOLUTION_TIER_CLOUD_STEPS, WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { StratosphericTelemetryInstrument } from '../../src/components/hud/instruments/StratosphericTelemetryInstrument';
import type { ResolutionTier } from '../../src/types';

describe('ResolutionTier Cloud Raymarching Step Coupling', () => {
  it('maps each ResolutionTier to calibrated monotonic raymarch step counts', () => {
    expect(RESOLUTION_TIER_CLOUD_STEPS['100k']).toBe(16);
    expect(RESOLUTION_TIER_CLOUD_STEPS['1M']).toBe(32);
    expect(RESOLUTION_TIER_CLOUD_STEPS['3M']).toBe(40);
    expect(RESOLUTION_TIER_CLOUD_STEPS['4M']).toBe(48);
    expect(RESOLUTION_TIER_CLOUD_STEPS['8M']).toBe(56);
    expect(RESOLUTION_TIER_CLOUD_STEPS['16M']).toBe(64);

    // Monotonically increasing invariant
    const tiers: ResolutionTier[] = ['100k', '1M', '3M', '4M', '8M', '16M'];
    for (let i = 1; i < tiers.length; i++) {
      expect(RESOLUTION_TIER_CLOUD_STEPS[tiers[i]]).toBeGreaterThan(
        RESOLUTION_TIER_CLOUD_STEPS[tiers[i - 1]]
      );
    }
  });

  it('updates currentCloudMaxSteps and buffer via updateVolumetricUniforms', () => {
    (globalThis as any).GPUBufferUsage = { UNIFORM: 0x0040, COPY_DST: 0x0008 };

    const mockDevice = {
      queue: {
        writeBuffer: vi.fn(),
      },
      createBuffer: vi.fn().mockReturnValue({}),
      createTexture: vi.fn(),
      createSampler: vi.fn(),
    } as any;

    const engine = Object.create(WebGPUEngine.prototype);
    engine.device = mockDevice;
    engine.volumetricCameraUniformBuffer = {} as any;
    engine.volumetricCloudUniformBuffer = {} as any;
    engine.volumetricCamFloats = new Float32Array(48);
    engine.volumetricCloudFloats = new Float32Array(40);
    engine.cloudOptions = {};
    engine.currentCloudMaxSteps = 32;

    // Test tier '100k'
    engine.updateVolumetricUniforms({ resolution: '100k' });
    expect(engine.getCloudMaxSteps()).toBe(16);
    expect(mockDevice.queue.writeBuffer).toHaveBeenCalledTimes(2);
    const lastCallBuffer100k = mockDevice.queue.writeBuffer.mock.calls[1];
    const writtenFloats100k = new Float32Array(lastCallBuffer100k[2]);
    expect(writtenFloats100k[35]).toBe(16.0);

    // Test tier '16M'
    mockDevice.queue.writeBuffer.mockClear();
    engine.updateVolumetricUniforms({ resolution: '16M' });
    expect(engine.getCloudMaxSteps()).toBe(64);
    const lastCallBuffer16M = mockDevice.queue.writeBuffer.mock.calls[1];
    const writtenFloats16M = new Float32Array(lastCallBuffer16M[2]);
    expect(writtenFloats16M[35]).toBe(64.0);

    // Test explicit manual override clamp
    mockDevice.queue.writeBuffer.mockClear();
    engine.updateVolumetricUniforms({ cloudMaxSteps: 24 });
    expect(engine.getCloudMaxSteps()).toBe(24);
    const lastCallBufferCustom = mockDevice.queue.writeBuffer.mock.calls[1];
    const writtenFloatsCustom = new Float32Array(lastCallBufferCustom[2]);
    expect(writtenFloatsCustom[35]).toBe(24.0);
  });

  describe('StratosphericTelemetryInstrument HUD integration', () => {
    it('renders Raymarch Step Budget row reflecting the active tier and steps', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<StratosphericTelemetryInstrument theme={0} resolution="100k" />);
      });

      expect(container.textContent).toContain('Raymarch Step Budget:');
      expect(container.textContent).toContain('100k');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
