// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m6-purity-e2e-adversarial.test.tsx
// Challenger: Challenger 1 - Milestone 6 (UI Integrity & Performance Hardening)
// Verification:
//   1. End-to-end React flow from Card 4b TactileSwitch -> TelemetryHUD -> WebGPUCanvas
//   2. WebGPUEngine crustFloats[75] (offset 300) serialization and 0.0/1.0 toggle parity
//   3. Absolute suppression of all secondary passes (Rule 24 Zero-Zombie invariant)
//   4. WGSL derivative safety & discard scoping in crust_hydrosphere.wgsl
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { TelemetryHUD, TelemetryHUDProps } from '../../src/components/hud/TelemetryHUD';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

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

function createEngineConfig(pointCount = 100, lineCount = 50): WebGPUInitConfig {
  const pointsData = new Float32Array(pointCount * 3);
  const target2DData = new Float32Array(pointCount * 2);
  const typeData = new Float32Array(pointCount);
  const lineIndices = new Uint32Array(lineCount * 2);

  const canvas = {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: (type: string) => {
      if (type === 'webgpu') {
        return {
          configure: vi.fn(),
          getCurrentTexture: vi.fn(() => ({
            createView: vi.fn(() => ({ label: 'mock_swapchain_view' })),
          })),
        };
      }
      return null;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as any as HTMLCanvasElement;

  return { canvas, pointCount, pointsData, target2DData, typeData, lineIndices };
}

function createDefaultCamera() {
  return {
    position: { x: 0, y: 0, z: 15 },
    matrixWorldInverse: { toArray: vi.fn() },
    projectionMatrix: { toArray: vi.fn() },
    near: 0.1,
    updateMatrixWorld: vi.fn(),
  };
}

describe('Milestone 6 Challenger 1: Purity Diagnostic Mode & Pass Gating Adversarial Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const shaderPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // ==========================================================================
  // Section 1: End-to-End React Tree Purity Toggle Flow
  // ==========================================================================
  describe('1. Card 4b TactileSwitch React Flow & WebGPUCanvas Propagation', () => {
    it('CH1-M6-01: Interactive container toggle propagates from Card 4b through state to canvas props', async () => {
      const receivedPurityModes: boolean[] = [];

      // Mock Test Rig simulating App.tsx state holder
      const AppSimulationHarness = () => {
        const [purityMode, setPurityMode] = useState<boolean>(false);

        // Record purityMode whenever it updates
        receivedPurityModes.push(purityMode);

        return (
          <div>
            <div data-testid="mock-webgpu-canvas" data-purity-mode={String(purityMode)} />
            <UnifiedRightSidebar
              isZenMode={false}
              onZenToggle={() => {}}
              theme={1}
              onThemeToggle={() => {}}
              onSelectThemeMode={() => {}}
              showSoundings={true}
              onSoundingsToggle={() => {}}
              showTriangulation={false}
              onTriangulationToggle={() => {}}
              showCartouche={true}
              onCartoucheToggle={() => {}}
              backend="webgpu"
              onBackendChange={() => {}}
              hasWebGPU={true}
              resolution="1M"
              onResolutionChange={() => {}}
              layerMode={0}
              onLayerModeChange={() => {}}
              mode={0}
              onModeChange={() => {}}
              cursorPhysicsEnabled={true}
              onCursorPhysicsToggle={() => {}}
              showLandmarks={true}
              onLandmarksToggle={() => {}}
              activeOverlay="off"
              onOverlayChange={() => {}}
              showTissot={false}
              onTissotToggle={() => {}}
              showVectors={true}
              onVectorsToggle={() => {}}
              alpha={0}
              fps={120}
              latStr="00°00'N"
              lonStr="000°00'E"
              mapScaleStr="1:50M"
              onSnapCamera={() => {}}
              dataInfo={{
                pointCount: 1000,
                lineCount: 3000,
                format: 'BIN',
                loadTimeMs: 1,
                vramMb: 2,
              }}
              dataLayers={[]}
              onAddDataLayer={() => {}}
              onToggleDataLayer={() => {}}
              onRemoveDataLayer={() => {}}
              onReorderDataLayer={() => {}}
              purityMode={purityMode}
              onPurityModeToggle={() => setPurityMode((prev) => !prev)}
            />
          </div>
        );
      };

      act(() => {
        root.render(<AppSimulationHarness />);
      });

      // Initial state: Off
      const mockCanvas = container.querySelector('[data-testid="mock-webgpu-canvas"]');
      expect(mockCanvas?.getAttribute('data-purity-mode')).toBe('false');

      const puritySwitch = container.querySelector<HTMLElement>('[role="switch"][title*="Purity"]');
      expect(puritySwitch).toBeTruthy();
      expect(puritySwitch?.getAttribute('aria-checked')).toBe('false');
      expect(puritySwitch?.textContent).toContain('Off');

      // Click switch: Turn ON
      act(() => {
        puritySwitch!.click();
      });

      expect(mockCanvas?.getAttribute('data-purity-mode')).toBe('true');
      expect(puritySwitch?.getAttribute('aria-checked')).toBe('true');
      expect(puritySwitch?.textContent).toContain('Active');

      // Click switch again: Turn OFF
      act(() => {
        puritySwitch!.click();
      });

      expect(mockCanvas?.getAttribute('data-purity-mode')).toBe('false');
      expect(puritySwitch?.getAttribute('aria-checked')).toBe('false');
      expect(puritySwitch?.textContent).toContain('Off');

      // Trace recorded transitions: [initial: false, after click 1: true, after click 2: false]
      expect(receivedPurityModes).toEqual([false, true, false]);
    });

    it('CH1-M6-02: TelemetryHUD properly declares and forwards purityMode and onPurityModeToggle', () => {
      const onToggleSpy = vi.fn();
      const defaultDataInfo = {
        pointCount: 5000,
        lineCount: 15000,
        format: 'BIN',
        loadTimeMs: 1,
        vramMb: 2,
      };

      act(() => {
        root.render(
          <TelemetryHUD
            isZenMode={false}
            onZenToggle={() => {}}
            fps={60}
            dataInfo={defaultDataInfo}
            latStr="00°00'N"
            lonStr="000°00'E"
            mapScaleStr="1:50M"
            alpha={0}
            mode={0}
            layerMode={0}
            showSoundings={true}
            showTriangulation={false}
            showCartouche={true}
            onSnapCamera={() => {}}
            onModeChange={() => {}}
            onLayerModeChange={() => {}}
            onSoundingsToggle={() => {}}
            onTriangulationToggle={() => {}}
            onCartoucheToggle={() => {}}
            theme={1}
            onThemeToggle={() => {}}
            onSelectThemeMode={() => {}}
            backend="webgpu"
            onBackendChange={() => {}}
            hasWebGPU={true}
            resolution="1M"
            onResolutionChange={() => {}}
            cursorPhysicsEnabled={true}
            onCursorPhysicsToggle={() => {}}
            activeOverlay="off"
            onOverlayChange={() => {}}
            showLandmarks={true}
            onLandmarksToggle={() => {}}
            showTissot={false}
            onTissotToggle={() => {}}
            showVectors={true}
            onVectorsToggle={() => {}}
            dataLayers={[]}
            onAddDataLayer={() => {}}
            onToggleDataLayer={() => {}}
            onRemoveDataLayer={() => {}}
            onReorderDataLayer={() => {}}
            purityMode={true}
            onPurityModeToggle={onToggleSpy}
          />
        );
      });

      const puritySwitch = container.querySelector<HTMLElement>('[role="switch"][title*="Purity"]');
      expect(puritySwitch).toBeTruthy();
      expect(puritySwitch?.getAttribute('aria-checked')).toBe('true');
      expect(puritySwitch?.textContent).toContain('Active');

      act(() => {
        puritySwitch!.click();
      });
      expect(onToggleSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Section 2: WebGPUEngine crustFloats[75] Serialization & Pass Suppression
  // ==========================================================================
  describe('2. WebGPUEngine crustFloats[75] (offset 300) & Pass Gating', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);
      engine.ensureCartographicBuffers();
      (engine as any).simWarmupFrames = 5;
    });

    afterEach(() => {
      engine?.dispose();
      restoreMockNavigator();
    });

    it('CH1-M6-03: WebGPUEngine updates crustFloats[75] to 1.0 (offset 300) when purityMode is true', () => {
      const defaultParams: WebGPUFrameParams = {
        unfurl: 0.0,
        mode: 0,
        theme: 1,
        time: 0,
        dt: 0.016,
        camera: createDefaultCamera() as any,
      };

      // Initially false
      engine.updateUniforms({ ...defaultParams, purityMode: false });
      expect((engine as any).crustFloats[75]).toBe(0.0);
      expect((engine as any).crustFloats.byteOffset + 75 * 4).toBe(300);

      // Set to true
      engine.updateUniforms({ ...defaultParams, purityMode: true });
      expect((engine as any).crustFloats[75]).toBe(1.0);
      expect(engine.purityMode).toBe(true);

      // Set back to false
      engine.updateUniforms({ ...defaultParams, purityMode: false });
      expect((engine as any).crustFloats[75]).toBe(0.0);
      expect(engine.purityMode).toBe(false);
    });

    it('CH1-M6-04: Absolute suppression of all secondary passes under purityMode: true per Rule 24', () => {
      const surfaceWindsSpy = vi.spyOn(engine as any, 'renderSurfaceWindRibbons');
      const jetStreamSpy = vi.spyOn(engine as any, 'renderJetStreamRibbons');
      const cloudLayerSpy = vi.spyOn(engine as any, 'renderCloudLayer');
      const atmosphereSpy = vi.spyOn(engine as any, 'renderAtmosphereScatterPass');
      const volumetricSpy = vi.spyOn(engine as any, 'renderVolumetricClouds');

      (engine as any).windRibbonPipeline = {};
      (engine as any).windRibbonBindGroups = [{}];
      (engine as any).atmosphereScatterPipeline = {};
      (engine as any).volumetricCloudPipeline = {};
      (engine as any).showAtmosphereScatter = true;
      (engine as any).volumetricCloudsEnabled = true;

      // Ensure steady state for particle compute pass
      (engine as any).simWarmupFrames = 5;
      (engine as any).lastSimUnfurl = 0.0;
      (engine as any).lastSimMode = 0;
      (engine as any).lastSimVortex = 0;
      (engine as any).lastSimFracture = 0;

      const device = (engine as any).device;
      let computeDispatches = 0;
      let windComputeDispatched = false;

      const origCreateCommandEncoder = device.createCommandEncoder.bind(device);
      vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
        const encoder = origCreateCommandEncoder();
        const origBeginComputePass = encoder.beginComputePass.bind(encoder);
        encoder.beginComputePass = (desc: any) => {
          const pass = origBeginComputePass(desc);
          const origSetPipeline = pass.setPipeline.bind(pass);
          pass.setPipeline = (pipeline: any) => {
            if (pipeline === (engine as any).windComputePipeline) {
              windComputeDispatched = true;
            }
            return origSetPipeline(pipeline);
          };
          const origDispatch = pass.dispatchWorkgroups.bind(pass);
          pass.dispatchWorkgroups = (...args: any[]) => {
            computeDispatches++;
            return origDispatch(...args);
          };
          return pass;
        };
        return encoder;
      });

      const maxConfiguredParams: WebGPUFrameParams = {
        unfurl: 0.0,
        mode: 0,
        theme: 1,
        time: 1.0,
        dt: 0.016,
        camera: createDefaultCamera() as any,
        viewport: { width: 800, height: 600 },
        purityMode: true, // PURITY ON
        showWind: true,
        showSurfaceWinds: true,
        showJetStream: true,
        showClouds: true,
        showCloudLow: true,
        showCloudMid: true,
        showCloudHigh: true,
        showAtmosphere: true,
        volumetricClouds: true,
      };

      engine.render(maxConfiguredParams);

      // Verify zero calls to secondary render passes
      expect(surfaceWindsSpy).not.toHaveBeenCalled();
      expect(jetStreamSpy).not.toHaveBeenCalled();
      expect(cloudLayerSpy).not.toHaveBeenCalled();
      expect(atmosphereSpy).not.toHaveBeenCalled();
      expect(volumetricSpy).not.toHaveBeenCalled();

      // Verify zero compute dispatches in steady state and no wind compute pipeline invocation
      expect(computeDispatches).toBe(0);
      expect(windComputeDispatched).toBe(false);

      // Invert purityMode to false: verify sensitivity with volumetricClouds active
      engine.render({ ...maxConfiguredParams, purityMode: false });
      expect(surfaceWindsSpy).toHaveBeenCalled();
      expect(jetStreamSpy).toHaveBeenCalled();
      expect(atmosphereSpy).toHaveBeenCalled();
      expect(volumetricSpy).toHaveBeenCalled();

      // With volumetricClouds inactive, raster cloud layers must activate
      engine.render({ ...maxConfiguredParams, purityMode: false, volumetricClouds: false });
      expect(cloudLayerSpy).toHaveBeenCalled();
    });

    it('CH1-M6-05: 500-cycle randomized Monte Carlo stress test confirms zero pass leakage under purityMode', () => {
      const surfaceWindsSpy = vi.spyOn(engine as any, 'renderSurfaceWindRibbons');
      const jetStreamSpy = vi.spyOn(engine as any, 'renderJetStreamRibbons');
      const cloudLayerSpy = vi.spyOn(engine as any, 'renderCloudLayer');
      const atmosphereSpy = vi.spyOn(engine as any, 'renderAtmosphereScatterPass');
      const volumetricSpy = vi.spyOn(engine as any, 'renderVolumetricClouds');

      (engine as any).windRibbonPipeline = {};
      (engine as any).windRibbonBindGroups = [{}];
      (engine as any).atmosphereScatterPipeline = {};
      (engine as any).volumetricCloudPipeline = {};
      (engine as any).showAtmosphereScatter = true;
      (engine as any).volumetricCloudsEnabled = true;

      for (let i = 0; i < 500; i++) {
        const randBool = () => Math.random() > 0.5;
        const testParams: WebGPUFrameParams = {
          unfurl: Math.random(),
          mode: Math.floor(Math.random() * 5),
          theme: Math.floor(Math.random() * 3),
          time: i * 0.016,
          dt: 0.016,
          camera: createDefaultCamera() as any,
          viewport: { width: 800, height: 600 },
          purityMode: true, // Always true
          showWind: randBool(),
          showSurfaceWinds: randBool(),
          showJetStream: randBool(),
          showClouds: randBool(),
          showCloudLow: randBool(),
          showCloudMid: randBool(),
          showCloudHigh: randBool(),
          showAtmosphere: randBool(),
          volumetricClouds: randBool(),
        };

        engine.render(testParams);
      }

      expect(surfaceWindsSpy).not.toHaveBeenCalled();
      expect(jetStreamSpy).not.toHaveBeenCalled();
      expect(cloudLayerSpy).not.toHaveBeenCalled();
      expect(atmosphereSpy).not.toHaveBeenCalled();
      expect(volumetricSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Section 3: WGSL Shader Structure & Derivative Safety Check
  // ==========================================================================
  describe('3. WGSL Shader Structure & Derivative Safety Invariant', () => {
    it('CH1-M6-06: crust_hydrosphere.wgsl declares u_purityMode at offset 300 and scopes discard to hydrosphere only', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

      // Verify struct declaration at offset 300
      expect(shaderSrc).toMatch(/u_purityMode:\s*f32,\s*\/\/\s*offset\s*300\s*\(float\s*75\)/);

      // Verify discard is strictly inside fs_main and inside `if (input.surfaceType > 0.5)`
      const fsMainIndex = shaderSrc.indexOf('fn fs_main(');
      expect(fsMainIndex).toBeGreaterThan(0);
      const fsMainBody = shaderSrc.substring(fsMainIndex);

      const match = fsMainBody.match(/if\s*\(\s*input\.surfaceType\s*>\s*0\.5\s*\)\s*\{([\s\S]*?)\}/);
      expect(match).not.toBeNull();
      expect(match![1]).toContain('sim.u_purityMode > 0.5');
      expect(match![1]).toContain('discard;');

      // Verify all derivatives (fwidth, dpdx, dpdy) precede any dynamic discard in fs_main
      const firstDiscard = fsMainBody.indexOf('discard;');
      expect(firstDiscard).toBeGreaterThan(0);

      const afterFirstDiscard = fsMainBody.substring(firstDiscard);
      expect(afterFirstDiscard).not.toMatch(/\bfwidth\s*\(/);
      expect(afterFirstDiscard).not.toMatch(/\bdpdx\s*\(/);
      expect(afterFirstDiscard).not.toMatch(/\bdpdy\s*\(/);
    });
  });
});
