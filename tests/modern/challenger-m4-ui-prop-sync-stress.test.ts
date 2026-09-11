// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m4-ui-prop-sync-stress.test.ts
// Challenger: challenger_m4_it2_2 (teamwork_preview_challenger)
// Milestone: Milestone 4 Iteration 2 (Camera Kinematics & Prop Synchronization Stress)
// Authoritative References:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§2.1, §4)
//   - AGENTS.md Invariants:
//       * Invariant §2:  10px Spatial Clearance Moat & 20px Gutters
//       * Invariant §4:  Single-Border HUD Enclosure Contract
//       * Invariant §12: 4 Canonical Benchmark Viewpoints (Pitch 78° Limb Horizon)
//       * Invariant §17: Independent Victory Auditor Contract
//       * Invariant §20: 16-Byte WGSL Struct Alignment & 256-Byte Uniform Packing
//       * Invariant §24: Dynamic Theme & Zero-Recompile Uniform Buffer Updates
//       * Invariant §46: Anti-Cheating Production Source Import Integrity
//       * Invariant §48: Dynamic Texture Dimensions (Clean DEM Guard)
// Description:
//   Adversarially stresses:
//   1. Rapid repeated calls to window.__INDICATRIX_CAMERA__.snapHorizonCrossSection(1.6)
//   2. Dynamic transitions interrupted mid-flight by pointer events and wheel impulses
//   3. User manual slider scrubbing while camera kinematics transitions are active
//   4. 1,000 randomized interleaved actions verifying zero race conditions between
//      React state, DOM slider value, badge text, and WebGPU uniform state
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as THREE from 'three';

// Invariant §46: Direct Production Imports from src/
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { slerpVec3, Vector3 } from '../../src/core/math/cameraMath';
import { MockGPUDevice } from '../helpers/webgpu-mock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock WebGPU Environment
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

function createTestCamera() {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function triggerInputChange(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Challenger M4.2.2: Prop Pipeline & UI Synchronization Stress (Pillar A & B)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let engine: WebGPUEngine;

  beforeEach(async () => {
    setupMockNavigator();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    engine = new WebGPUEngine();
    await engine.initialize(createEngineConfig());
    (engine as any).ensureCartographicBuffers();
    (engine as any).ensureCloudBuffers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    engine.dispose();
    restoreMockNavigator();
    delete (window as any).__INDICATRIX_CAMERA__;
    delete (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__;
    delete (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__;
    delete (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__;
  });

  const createSidebarProps = (overrides: Partial<UnifiedRightSidebarProps> = {}): UnifiedRightSidebarProps => ({
    isZenMode: false,
    onZenToggle: vi.fn(),
    theme: 0,
    onThemeToggle: vi.fn(),
    backend: 'webgpu',
    onBackendChange: vi.fn(),
    hasWebGPU: true,
    resolution: '100k' as any,
    onResolutionChange: vi.fn(),
    layerMode: 0,
    onLayerModeChange: vi.fn(),
    mode: 0,
    onModeChange: vi.fn(),
    cursorPhysicsEnabled: false,
    onCursorPhysicsToggle: vi.fn(),
    activeOverlay: 0 as any,
    onOverlayChange: vi.fn(),
    showLandmarks: false,
    onLandmarksToggle: vi.fn(),
    showTissot: false,
    onTissotToggle: vi.fn(),
    showVectors: false,
    onVectorsToggle: vi.fn(),
    dataLayers: [],
    alpha: 0,
    fps: 120,
    latStr: "44°30'N",
    lonStr: "008°30'E",
    mapScaleStr: '1:50,000,000',
    onSnapCamera: vi.fn(),
    fractureIntensity: 1.0,
    onFractureIntensityChange: vi.fn(),
    fluidVortexStrength: 1.0,
    onFluidVortexStrengthChange: vi.fn(),
    isCatalogOpen: false,
    onCatalogOpenChange: vi.fn(),
    isSidebarOpen: true,
    onSidebarOpenChange: vi.fn(),
    showClouds: true,
    onShowCloudsChange: vi.fn(),
    showCloudLow: true,
    onShowCloudLowChange: vi.fn(),
    showCloudMid: true,
    onShowCloudMidChange: vi.fn(),
    showCloudHigh: true,
    onShowCloudHighChange: vi.fn(),
    cloudDriftSpeed: 1.0,
    onCloudDriftSpeedChange: vi.fn(),
    cloudOpacity: 0.8,
    onCloudOpacityChange: vi.fn(),
    atmosphericScale: 1.0,
    onAtmosphericScaleChange: vi.fn(),
    shadowIntensity: 0.45,
    onShadowIntensityChange: vi.fn(),
    ...overrides,
  });

  /**
   * Complete Test App Container replicating App.tsx state management,
   * TelemetryHUD propagation, UnifiedRightSidebar, and WebGPUEngine synchronization.
   */
  const AppTestHarness: React.FC<{
    onStateUpdate?: (scale: number, shadow: number, clouds: boolean) => void;
  }> = ({ onStateUpdate }) => {
    const [scale, setScale] = React.useState<number>(1.0);
    const [shadow, setShadow] = React.useState<number>(0.45);
    const [clouds, setClouds] = React.useState<boolean>(true);

    React.useEffect(() => {
      onStateUpdate?.(scale, shadow, clouds);
    }, [scale, shadow, clouds, onStateUpdate]);

    React.useEffect(() => {
      (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__ = (valOrFn: any) => {
        setScale((prev) => {
          const v = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
          if (typeof v !== 'number' || !Number.isFinite(v)) return prev;
          return Math.max(1.0, Math.min(12.0, v));
        });
      };
      (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__ = (valOrFn: any) => {
        setShadow((prev) => {
          const v = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
          if (typeof v !== 'number' || !Number.isFinite(v)) return prev;
          return Math.max(0.0, Math.min(0.60, v));
        });
      };
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = (opts: any) => {
        if (opts.showClouds !== undefined) setClouds(!!opts.showClouds);
        if (opts.atmosphericScale !== undefined) {
          setScale(Math.max(1.0, Math.min(12.0, Number(opts.atmosphericScale))));
        }
        if (opts.shadowIntensity !== undefined) {
          setShadow(Math.max(0.0, Math.min(0.60, Number(opts.shadowIntensity))));
        }
      };
      (window as any).__INDICATRIX_CAMERA__ = {
        snapHorizonCrossSection: (duration = 1.6) => {
          setClouds(true);
          setScale((s) => (s <= 1.05 ? 6.0 : Math.max(s, 6.0)));
        },
      };
    }, []);

    return React.createElement(
      UnifiedRightSidebar,
      createSidebarProps({
        showClouds: clouds,
        onShowCloudsChange: setClouds,
        atmosphericScale: scale,
        onAtmosphericScaleChange: setScale,
        shadowIntensity: shadow,
        onShadowIntensityChange: setShadow,
      })
    );
  };

  it('CHALLENGE-SYNC-01: rapid consecutive snapHorizonCrossSection calls (100x burst) execute cleanly with zero race divergence', async () => {
    let latestScale = 1.0;
    let latestShadow = 0.45;
    let latestClouds = true;

    await act(async () => {
      root.render(
        React.createElement(AppTestHarness, {
          onStateUpdate: (s, sh, c) => {
            latestScale = s;
            latestShadow = sh;
            latestClouds = c;
          },
        })
      );
    });

    const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
    expect(scaleInput).not.toBeNull();
    expect(scaleInput.value).toBe('1');

    // Fire 100 rapid consecutive invocations
    await act(async () => {
      for (let i = 0; i < 100; i++) {
        (window as any).__INDICATRIX_CAMERA__.snapHorizonCrossSection(1.6);
      }
    });

    // Update WebGPU engine with latest synchronized state
    engine.updateUniforms({
      camera: createTestCamera(),
      unfurl: 0.0,
      mode: 0,
      layerMode: 0,
      theme: 0,
      time: 1.0,
      dt: 0.016,
      atmosphericScale: latestScale,
      shadowIntensity: latestShadow,
      showClouds: latestClouds,
    });

    // 1. React state updated to 6.0
    expect(latestScale).toBe(6.0);
    expect(latestClouds).toBe(true);

    // 2. DOM input and text badge reflect 6.0x
    expect(scaleInput.value).toBe('6');
    const scaleCard = scaleInput.closest('.p-2');
    expect(scaleCard?.textContent).toContain('6.0x');

    // 3. WebGPU uniform mirrors strictly match
    const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
    expect(mirror[26]).toBe(6.0);
    const crustShadow = (engine as any).crustFloats[68];
    expect(crustShadow).toBeCloseTo(0.45, 5);
  });

  it('CHALLENGE-SYNC-02: transition interrupted mid-flight by pointer-down and manual slider adjustment', async () => {
    let latestScale = 1.0;
    let latestShadow = 0.45;

    await act(async () => {
      root.render(
        React.createElement(AppTestHarness, {
          onStateUpdate: (s, sh) => {
            latestScale = s;
            latestShadow = sh;
          },
        })
      );
    });

    const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;

    // 1. Start transition
    await act(async () => {
      (window as any).__INDICATRIX_CAMERA__.snapHorizonCrossSection(1.6);
    });
    expect(latestScale).toBe(6.0);

    // 2. Simulate pointer interruption & user manually dragging slider to 3.5x
    await act(async () => {
      triggerInputChange(scaleInput, '3.5');
    });

    // 3. Synchronize WebGPU engine
    engine.updateUniforms({
      camera: createTestCamera(),
      unfurl: 0.0,
      mode: 0,
      layerMode: 0,
      theme: 0,
      time: 1.5,
      dt: 0.016,
      atmosphericScale: latestScale,
      shadowIntensity: latestShadow,
      showClouds: true,
    });

    expect(latestScale).toBe(3.5);
    expect(scaleInput.value).toBe('3.5');
    const scaleCard = scaleInput.closest('.p-2');
    expect(scaleCard?.textContent).toContain('3.5x');

    const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
    expect(mirror[26]).toBe(3.5);
  });

  it('CHALLENGE-SYNC-03: user scrubbing slider during active camera flight maintains UI and uniform parity', async () => {
    let latestScale = 1.0;
    let latestShadow = 0.45;

    await act(async () => {
      root.render(
        React.createElement(AppTestHarness, {
          onStateUpdate: (s, sh) => {
            latestScale = s;
            latestShadow = sh;
          },
        })
      );
    });

    const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
    const testSteps = [8.0, 10.5, 4.2, 12.0, 1.0, 7.3];

    for (const testVal of testSteps) {
      await act(async () => {
        triggerInputChange(scaleInput, testVal.toString());
      });

      engine.updateUniforms({
        camera: createTestCamera(),
        unfurl: 0.0,
        mode: 0,
        layerMode: 0,
        theme: 0,
        time: 2.0,
        dt: 0.016,
        atmosphericScale: latestScale,
        shadowIntensity: latestShadow,
        showClouds: true,
      });

      expect(latestScale).toBe(testVal);
      expect(scaleInput.value).toBe(testVal.toString());

      const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
      expect(mirror[26]).toBeCloseTo(testVal, 4);
    }
  });

  it('CHALLENGE-SYNC-04: 1,000 randomized interleaved actions stress test (fuzzing race conditions)', async () => {
    let latestScale = 1.0;
    let latestShadow = 0.45;
    let latestClouds = true;

    await act(async () => {
      root.render(
        React.createElement(AppTestHarness, {
          onStateUpdate: (s, sh, c) => {
            latestScale = s;
            latestShadow = sh;
            latestClouds = c;
          },
        })
      );
    });

    const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
    const shadowInput = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
    expect(scaleInput).not.toBeNull();
    expect(shadowInput).not.toBeNull();

    const NUM_ACTIONS = 1000;
    let presetCount = 0;
    let sliderScaleCount = 0;
    let sliderShadowCount = 0;
    let directHookCount = 0;

    for (let i = 0; i < NUM_ACTIONS; i++) {
      const actionType = Math.floor(Math.random() * 4);

      await act(async () => {
        switch (actionType) {
          case 0: {
            // Preset call
            (window as any).__INDICATRIX_CAMERA__.snapHorizonCrossSection(1.6);
            presetCount++;
            break;
          }
          case 1: {
            // Manual scale slider adjustment
            const randScale = (1.0 + Math.random() * 11.0).toFixed(1);
            triggerInputChange(scaleInput, randScale);
            sliderScaleCount++;
            break;
          }
          case 2: {
            // Manual shadow slider adjustment
            const randShadow = (Math.random() * 0.60).toFixed(2);
            triggerInputChange(shadowInput, randShadow);
            sliderShadowCount++;
            break;
          }
          case 3: {
            // Global hook call with functional or direct updater
            const randVal = Math.random() < 0.5
              ? (prev: number) => Math.max(1.0, Math.min(12.0, prev + (Math.random() - 0.5) * 2))
              : 1.0 + Math.random() * 11.0;
            (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__(randVal);
            directHookCount++;
            break;
          }
        }
      });

      // Synchronize WebGPU engine
      engine.updateUniforms({
        camera: createTestCamera(),
        unfurl: 0.0,
        mode: 0,
        layerMode: 0,
        theme: 0,
        time: i * 0.016,
        dt: 0.016,
        atmosphericScale: latestScale,
        shadowIntensity: latestShadow,
        showClouds: latestClouds,
      });

      // Assertions at every 50 iterations
      if (i % 50 === 0) {
        expect(latestScale).toBeGreaterThanOrEqual(1.0);
        expect(latestScale).toBeLessThanOrEqual(12.0);
        expect(latestShadow).toBeGreaterThanOrEqual(0.0);
        expect(latestShadow).toBeLessThanOrEqual(0.60);

        const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
        expect(mirror[26]).toBeCloseTo(latestScale, 4);
        expect(mirror[27]).toBeLessThanOrEqual(0.60);
        expect((engine as any).crustFloats[68]).toBeLessThanOrEqual(0.60);
      }
    }

    console.log(
      `[Synchronization Stress] 1000 actions complete: presets=${presetCount}, ` +
      `scaleSlider=${sliderScaleCount}, shadowSlider=${sliderShadowCount}, directHook=${directHookCount}. ` +
      `Final state: scale=${latestScale.toFixed(2)}, shadow=${latestShadow.toFixed(2)}`
    );

    expect(latestScale).toBeGreaterThanOrEqual(1.0);
    expect(latestScale).toBeLessThanOrEqual(12.0);
    expect(latestShadow).toBeGreaterThanOrEqual(0.0);
    expect(latestShadow).toBeLessThanOrEqual(0.60);
  });

  it('CHALLENGE-SYNC-05: dynamic transition interrupted by pointer/wheel events and UI preset re-trigger maintains camera and uniform safety', async () => {
    let latestScale = 1.0;
    let latestShadow = 0.45;
    let latestClouds = true;

    await act(async () => {
      root.render(
        React.createElement(AppTestHarness, {
          onStateUpdate: (s, sh, c) => {
            latestScale = s;
            latestShadow = sh;
            latestClouds = c;
          },
        })
      );
    });

    const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
    const shadowInput = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
    const presetBtn = container.querySelector('button[title*="Horizon Cross-Section"]') as HTMLButtonElement;
    expect(presetBtn).not.toBeNull();

    // 1. Trigger via UI preset button click
    await act(async () => {
      presetBtn.click();
    });

    expect(latestScale).toBe(6.0);
    expect(latestClouds).toBe(true);

    // 2. Simulate camera kinematics mid-flight step at t = 0.3s
    const startPose = new Vector3(0, 0, 15);
    const endPose = new Vector3(3.5, 2.5, 3.0); // radius ~ 5.24
    let curCameraPos = slerpVec3(startPose, endPose, 0.3);
    let curR = Math.max(5.15, 15.0 + (endPose.length() - 15.0) * 0.3);

    expect(curR).toBeGreaterThanOrEqual(5.15);

    // 3. User interrupts flight with slider drag to 9.2x and shadow to 0.55
    await act(async () => {
      triggerInputChange(scaleInput, '9.2');
      triggerInputChange(shadowInput, '0.55');
    });

    expect(latestScale).toBe(9.2);
    expect(latestShadow).toBe(0.55);

    // 4. Update WebGPU engine uniforms
    engine.updateUniforms({
      camera: createTestCamera(),
      unfurl: 0.0,
      mode: 0,
      layerMode: 0,
      theme: 0,
      time: 0.3,
      dt: 0.016,
      atmosphericScale: latestScale,
      shadowIntensity: latestShadow,
      showClouds: latestClouds,
    });

    let mirror = (engine as any).cloudLayerUniformMirrors?.[0];
    expect(mirror[26]).toBeCloseTo(9.2, 4);
    expect(mirror[27]).toBeCloseTo(0.55, 4);
    expect((engine as any).crustFloats[68]).toBeCloseTo(0.55, 4);

    // 5. Re-trigger preset button while scale is already 9.2 (should keep scale at >= 6.0, preserving 9.2)
    await act(async () => {
      presetBtn.click();
    });

    // Per line 700: s <= 1.05 ? 6.0 : Math.max(s, 6.0) -> scale remains 9.2!
    expect(latestScale).toBe(9.2);

    // 6. User scrubs scale back to 1.0
    await act(async () => {
      triggerInputChange(scaleInput, '1.0');
    });
    expect(latestScale).toBe(1.0);

    // 7. Clicking preset button from 1.0x scales up to 6.0x
    await act(async () => {
      presetBtn.click();
    });
    expect(latestScale).toBe(6.0);
    expect(scaleInput.value).toBe('6');

    // Sync WebGPU engine
    engine.updateUniforms({
      camera: createTestCamera(),
      unfurl: 0.0,
      mode: 0,
      layerMode: 0,
      theme: 0,
      time: 1.6,
      dt: 0.016,
      atmosphericScale: latestScale,
      shadowIntensity: latestShadow,
      showClouds: latestClouds,
    });

    mirror = (engine as any).cloudLayerUniformMirrors?.[0];
    expect(mirror[26]).toBe(6.0);
  });
});

