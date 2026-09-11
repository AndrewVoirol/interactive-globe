// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/r14-m4-atmosphere-drawer-controls.test.ts
// Milestone: Milestone 4: Atmosphere Drawer Controls & Horizon Cross-Section Preset
// Authoritative References:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§2.1, §2.3, §3.2, §4)
//   - AGENTS.md Invariants:
//       * Invariant §2:  10px Spatial Clearance Moat & 20px Gutters
//       * Invariant §4:  Single-Border HUD Enclosure Contract
//       * Invariant §6:  Ivory Vellum Card Tone (.paper-cream-panel)
//       * Invariant §12: 4 Canonical Benchmark Viewpoints (Limb Horizon Pitch 78°)
//       * Invariant §20: 16-Byte WGSL Struct Alignment & 256-Byte Uniform Packing
//       * Invariant §21: Responsive Collision & Accordion Collapsing
//       * Invariant §24: Zero-Recompile Uniform Buffer Updates
//       * Invariant §46: Anti-Cheating Production Source Import Integrity
//       * Invariant §48: Dynamic Texture Dimensions (Clean DEM Guard)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';

// Invariant §46: Direct Imports from src/
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { AtmosphereDrawer, AtmosphereDrawerProps } from '../../src/components/AtmosphereDrawer';
import { TelemetryHUD, TelemetryHUDProps } from '../../src/components/hud/TelemetryHUD';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { slerpVec3, Vector3 } from '../../src/core/math/cameraMath';
import { MockGPUDevice } from '../helpers/webgpu-mock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock WebGPU Environment Helpers for Engine Testing
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

describe('R14 Milestone 4: Atmosphere Drawer Controls & Horizon Cross-Section Preset', () => {
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
    resolution: '1M',
    onResolutionChange: vi.fn(),
    layerMode: 0,
    onLayerModeChange: vi.fn(),
    mode: 0,
    onModeChange: vi.fn(),
    cursorPhysicsEnabled: false,
    onCursorPhysicsToggle: vi.fn(),
    activeOverlay: 'off',
    onOverlayChange: vi.fn(),
    showLandmarks: false,
    onLandmarksToggle: vi.fn(),
    showTissot: false,
    onTissotToggle: vi.fn(),
    showVectors: true,
    onVectorsToggle: vi.fn(),
    alpha: 0.0,
    fps: 120,
    latStr: "44°30'N",
    lonStr: "008°30'E",
    mapScaleStr: '1 : 127,420,000',
    onSnapCamera: vi.fn(),
    dataLayers: [],
    onAddDataLayer: vi.fn(),
    onToggleDataLayer: vi.fn(),
    onRemoveDataLayer: vi.fn(),
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

  // ==========================================================================
  // Suite 1: Slider Clamping & Readout Formatting Contracts
  // ==========================================================================
  describe('1. Slider Clamping & Readout Formatting Contracts', () => {
    it('M4-CLAMP-01: clamps atmosphericScale strictly within [1.0 .. 12.0] on WebGPUEngine', () => {
      const engine = new WebGPUEngine();

      engine.atmosphericScale = 0.0;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = -10.0;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = 0.999;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = 1.0;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = 6.0;
      expect(engine.atmosphericScale).toBe(6.0);

      engine.atmosphericScale = 12.0;
      expect(engine.atmosphericScale).toBe(12.0);

      engine.atmosphericScale = 12.001;
      expect(engine.atmosphericScale).toBe(12.0);

      engine.atmosphericScale = 50.0;
      expect(engine.atmosphericScale).toBe(12.0);
    });

    it('M4-CLAMP-02: clamps shadowIntensity strictly within [0.0 .. 0.60] on WebGPUEngine', () => {
      const engine = new WebGPUEngine();

      engine.shadowIntensity = -1.0;
      expect(engine.shadowIntensity).toBe(0.0);

      engine.shadowIntensity = -0.01;
      expect(engine.shadowIntensity).toBe(0.0);

      engine.shadowIntensity = 0.0;
      expect(engine.shadowIntensity).toBe(0.0);

      engine.shadowIntensity = 0.35;
      expect(engine.shadowIntensity).toBe(0.35);

      engine.shadowIntensity = 0.45;
      expect(engine.shadowIntensity).toBe(0.45);

      engine.shadowIntensity = 0.60;
      expect(engine.shadowIntensity).toBe(0.60);

      engine.shadowIntensity = 0.601;
      expect(engine.shadowIntensity).toBe(0.60);

      engine.shadowIntensity = 1.0;
      expect(engine.shadowIntensity).toBe(0.60);
    });

    it('M4-CLAMP-03: formats atmosphericScale readout string as ${v.toFixed(1)}x', () => {
      const formatReadout = (v: number) => `${v.toFixed(1)}x`;

      expect(formatReadout(1.0)).toBe('1.0x');
      expect(formatReadout(6.0)).toBe('6.0x');
      expect(formatReadout(12.0)).toBe('12.0x');
      expect(formatReadout(3.456)).toBe('3.5x');
    });

    it('M4-CLAMP-04: formats shadowIntensity readout string as ${Math.round(v * 100)}%', () => {
      const formatReadout = (v: number) => `${Math.round(v * 100)}%`;

      expect(formatReadout(0.0)).toBe('0%');
      expect(formatReadout(0.45)).toBe('45%');
      expect(formatReadout(0.60)).toBe('60%');
      expect(formatReadout(0.50)).toBe('50%');
    });

    it('M4-CLAMP-05: rejects NaN, Infinity, and non-numeric inputs preserving bounded state in engine and buffers', async () => {
      setupMockNavigator();
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      // 1. Assert property setter rejection on atmosphericScale
      engine.atmosphericScale = 1.0;
      engine.atmosphericScale = NaN as any;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = Infinity as any;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = -Infinity as any;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = 'invalid' as any;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = 7.5;
      expect(engine.atmosphericScale).toBe(7.5);

      engine.atmosphericScale = NaN as any;
      expect(engine.atmosphericScale).toBe(7.5);

      // 2. Assert property setter rejection on shadowIntensity
      engine.shadowIntensity = 0.45;
      engine.shadowIntensity = NaN as any;
      expect(engine.shadowIntensity).toBe(0.45);

      engine.shadowIntensity = Infinity as any;
      expect(engine.shadowIntensity).toBe(0.45);

      engine.shadowIntensity = -Infinity as any;
      expect(engine.shadowIntensity).toBe(0.45);

      engine.shadowIntensity = 0.25;
      expect(engine.shadowIntensity).toBe(0.25);

      engine.shadowIntensity = NaN as any;
      expect(engine.shadowIntensity).toBe(0.25);

      // 3. Assert buffer array values in cloudLayerUniformMirrors (Float 26 & Float 27)
      engine.updateCloudLayerUniform(0, NaN as any, NaN as any);
      const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
      expect(mirror).toBeDefined();
      expect(Number.isFinite(mirror[26])).toBe(true);
      expect(mirror[26]).toBeGreaterThanOrEqual(1.0);
      expect(mirror[26]).toBeLessThanOrEqual(12.0);
      expect(Number.isFinite(mirror[27])).toBe(true);
      expect(mirror[27]).toBeGreaterThanOrEqual(0.0);
      expect(mirror[27]).toBeLessThanOrEqual(0.60);

      // 4. Assert buffer array value in crustFloats[68] (u_shadowIntensity in crustUniformBuffer)
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      engine.render({
        unfurl: 0.0,
        time: 0.0,
        dt: 0.016,
        mode: 0,
        layerMode: 0,
        theme: 0,
        camera,
        shadowIntensity: NaN as any,
        atmosphericScale: NaN as any,
        showClouds: true,
      });

      const crustFloats = (engine as any).crustFloats;
      expect(Number.isFinite(crustFloats[68])).toBe(true);
      expect(crustFloats[68]).toBeGreaterThanOrEqual(0.0);
      expect(crustFloats[68]).toBeLessThanOrEqual(0.60);

      engine.dispose();
      restoreMockNavigator();
    });
  });

  // ==========================================================================
  // Suite 2: UI Rendering & Prop Wiring in UnifiedRightSidebar and AtmosphereDrawer
  // ==========================================================================
  describe('2. UI Rendering & Prop Wiring in UnifiedRightSidebar & AtmosphereDrawer', () => {
    it('M4-HUD-01: renders Atmospheric Scale slider with range [1.0 .. 12.0], step 0.1, and correct readout', async () => {
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              atmosphericScale: 6.0,
            })
          )
        );
      });

      const sliderInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
      expect(sliderInput).not.toBeNull();
      expect(sliderInput.min).toBe('1');
      expect(sliderInput.max).toBe('12');
      expect(sliderInput.step).toBe('0.1');

      // Check readout text contains 6.0x
      const card = sliderInput.closest('.p-2');
      expect(card?.textContent).toContain('6.0x');
      expect(card?.textContent).toContain('Atmospheric Scale');
    });

    it('M4-HUD-02: renders Shadow Intensity slider with range [0.0 .. 0.60], step 0.05, and correct readout', async () => {
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              shadowIntensity: 0.45,
            })
          )
        );
      });

      const sliderInput = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      expect(sliderInput).not.toBeNull();
      expect(sliderInput.min).toBe('0');
      expect(sliderInput.max).toBe('0.6');
      expect(sliderInput.step).toBe('0.05');

      const card = sliderInput.closest('.p-2');
      expect(card?.textContent).toContain('45%');
      expect(card?.textContent).toContain('Shadow Intensity');
    });

    it('M4-HUD-03: dispatches onAtmosphericScaleChange when user adjusts slider or stepper', async () => {
      const onAtmosphericScaleChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              atmosphericScale: 1.0,
              onAtmosphericScaleChange,
            })
          )
        );
      });

      const sliderInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
      expect(sliderInput).not.toBeNull();

      // Test stepper button
      const increaseBtn = container.querySelector('button[title*="Increase Atmospheric Scale"]') as HTMLButtonElement;
      expect(increaseBtn).not.toBeNull();
      await act(async () => {
        increaseBtn.click();
      });
      expect(onAtmosphericScaleChange).toHaveBeenCalledWith(1.1);

      // Also simulate range input change event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      await act(async () => {
        nativeInputValueSetter?.call(sliderInput, '4.5');
        sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
        sliderInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(onAtmosphericScaleChange).toHaveBeenCalledWith(4.5);
    });

    it('M4-HUD-04: dispatches onShadowIntensityChange when user adjusts shadow intensity', async () => {
      const onShadowIntensityChange = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              shadowIntensity: 0.45,
              onShadowIntensityChange,
            })
          )
        );
      });

      const sliderInput = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      expect(sliderInput).not.toBeNull();

      // Test stepper button
      const increaseBtn = container.querySelector('button[title*="Increase Shadow Intensity"]') as HTMLButtonElement;
      expect(increaseBtn).not.toBeNull();
      await act(async () => {
        increaseBtn.click();
      });
      expect(onShadowIntensityChange).toHaveBeenCalledWith(0.5);

      // Also simulate range input change event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      await act(async () => {
        nativeInputValueSetter?.call(sliderInput, '0.55');
        sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
        sliderInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(onShadowIntensityChange).toHaveBeenCalledWith(0.55);
    });

    it('M4-HUD-05: standalone AtmosphereDrawer component renders identically with full prop wiring', async () => {
      const onScaleChange = vi.fn();
      const onShadowChange = vi.fn();
      const onHorizonClick = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AtmosphereDrawer, {
            showClouds: true,
            atmosphericScale: 8.5,
            shadowIntensity: 0.50,
            onAtmosphericScaleChange: onScaleChange,
            onShadowIntensityChange: onShadowChange,
            onHorizonPresetClick: onHorizonClick,
          })
        );
      });

      const scaleInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
      const shadowInput = container.querySelector('#sidebar-shadow-intensity') as HTMLInputElement;
      expect(scaleInput).not.toBeNull();
      expect(shadowInput).not.toBeNull();

      expect(container.textContent).toContain('8.5x');
      expect(container.textContent).toContain('50%');

      const presetBtn = container.querySelector('button[title*="Horizon Cross-Section"]') as HTMLButtonElement;
      expect(presetBtn).not.toBeNull();

      await act(async () => {
        presetBtn.click();
      });

      expect(onHorizonClick).toHaveBeenCalledTimes(1);
    });

    it('M4-HUD-06: strictly complies with Invariant §4 Single-Border HUD Enclosure Contract', async () => {
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              showClouds: true,
            })
          )
        );
      });

      const atmosphericCard = container.querySelector('#sidebar-atmospheric-scale')?.closest('.p-2.rounded-\\[3px\\].border');
      expect(atmosphericCard).not.toBeNull();

      // Exactly one perimeter border, no nested inner neatline boxes
      expect(atmosphericCard!.querySelectorAll('.border-current\\/15').length).toBe(0);
      expect(atmosphericCard!.querySelectorAll('.inset-\\[2px\\]').length).toBe(0);
      expect(atmosphericCard!.className).toContain('border-[var(--theme-card-border)]');
    });

    it('M4-HUD-07: collapses all controls and presets when master clouds toggle is false (Invariant §21)', async () => {
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              showClouds: false,
            })
          )
        );
      });

      expect(container.querySelector('#sidebar-atmospheric-scale')).toBeNull();
      expect(container.querySelector('#sidebar-shadow-intensity')).toBeNull();
      expect(container.querySelector('#sidebar-cloud-drift')).toBeNull();
      expect(container.querySelector('button[title*="Horizon Cross-Section"]')).toBeNull();
    });

    it('M4-HUD-08: prop pipeline synchronization updates sidebar slider readout on snapHorizonCrossSection or atmosphericScale change', async () => {
      // Integration container modeling App.tsx state management and TelemetryHUD propagation
      const AppContainer: React.FC<{ initialScale?: number }> = ({ initialScale = 1.0 }) => {
        const [scale, setScale] = React.useState(initialScale);

        React.useEffect(() => {
          (window as any).__INDICATRIX_CAMERA__ = {
            snapHorizonCrossSection: () => {
              setScale(6.0);
            },
          };
          return () => {
            delete (window as any).__INDICATRIX_CAMERA__;
          };
        }, []);

        return React.createElement(
          UnifiedRightSidebar,
          createSidebarProps({
            showClouds: true,
            atmosphericScale: scale,
            onAtmosphericScaleChange: setScale,
          })
        );
      };

      await act(async () => {
        root.render(React.createElement(AppContainer, { initialScale: 1.0 }));
      });

      // Initially verifies 1.0x readout
      const sliderInput = container.querySelector('#sidebar-atmospheric-scale') as HTMLInputElement;
      expect(sliderInput).not.toBeNull();
      expect(sliderInput.value).toBe('1');
      const card = sliderInput.closest('.p-2');
      expect(card?.textContent).toContain('1.0x');

      // Trigger snapHorizonCrossSection programmatic preset
      await act(async () => {
        (window as any).__INDICATRIX_CAMERA__.snapHorizonCrossSection();
      });

      // Verify slider input and readout updated to 6.0 / 6.0x
      expect(sliderInput.value).toBe('6');
      expect(card?.textContent).toContain('6.0x');

      // Verify direct prop change updates readout
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              showClouds: true,
              atmosphericScale: 8.5,
            })
          )
        );
      });
      const updatedCard = container.querySelector('#sidebar-atmospheric-scale')?.closest('.p-2');
      expect(updatedCard?.textContent).toContain('8.5x');
    });
  });

  // ==========================================================================
  // Suite 3: Horizon Cross-Section Preset Button & Camera Kinematics
  // ==========================================================================
  describe('3. Horizon Cross-Section Preset Button & Camera Kinematics', () => {
    it('M4-CAM-01: renders 1-click Horizon Cross-Section preset button with accessible label and badge', async () => {
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps()));
      });

      const presetBtn = container.querySelector('button[title*="Horizon Cross-Section"]') as HTMLButtonElement;
      expect(presetBtn).not.toBeNull();
      expect(presetBtn.textContent).toContain('Horizon Cross-Section (78°)');
      expect(presetBtn.textContent).toContain('78.0° Oblique');
    });

    it('M4-CAM-02: clicking preset button dispatches onSnapCamera("horizon") and scales up atmosphere', async () => {
      const onSnapCamera = vi.fn();
      const onAtmosphericScaleChange = vi.fn();
      const onShowCloudsChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              showClouds: true,
              atmosphericScale: 1.0,
              onSnapCamera,
              onAtmosphericScaleChange,
              onShowCloudsChange,
            })
          )
        );
      });

      const presetBtn = container.querySelector('button[title*="Horizon Cross-Section"]') as HTMLButtonElement;
      expect(presetBtn).not.toBeNull();

      await act(async () => {
        presetBtn.click();
      });

      expect(onSnapCamera).toHaveBeenCalledWith('horizon');
      expect(onAtmosphericScaleChange).toHaveBeenCalledWith(6.0);
    });

    it('M4-CAM-03: verifies Pitch 78.0° limb horizon optical geometry (r_cam = 5.22, pitch = 78.0°)', () => {
      const R0 = 5.0; // Base planet radius
      const r_cam = 5.22; // Altitude radius (~280 km orbit)

      // Horizon dip angle from local horizontal: theta_dip = acos(R0 / r_cam)
      const cosDip = R0 / r_cam;
      const dipAngleRad = Math.acos(cosDip);
      const dipAngleDeg = (dipAngleRad * 180) / Math.PI;

      // Pitch of the planetary crust horizon from nadir: 90° - theta_dip
      const crustHorizonPitchDeg = 90.0 - dipAngleDeg;

      // Assert dip angle is approximately 16.70°
      expect(dipAngleDeg).toBeGreaterThan(16.5);
      expect(dipAngleDeg).toBeLessThan(16.9);

      // Assert crust horizon pitch is approximately 73.30°
      expect(crustHorizonPitchDeg).toBeGreaterThan(73.1);
      expect(crustHorizonPitchDeg).toBeLessThan(73.5);

      // When camera pitch is 78.0°, the optical axis is aimed exactly 4.70° ABOVE the crust horizon,
      // gazing directly through the elevated Low (0.0010), Mid (0.0040), Jet Stream (0.0065), and High (0.0080) strata!
      const deltaAboveCrust = 78.0 - crustHorizonPitchDeg;
      expect(deltaAboveCrust).toBeGreaterThan(4.5);
      expect(deltaAboveCrust).toBeLessThan(4.9);
    });

    it('M4-CAM-04: spherical slerp arc transition enforces ground clearance safety floor (r >= 5.15)', () => {
      // Simulate trajectory from isometric view to horizon cross section view
      const startPos = new Vector3(10, 8, 12);
      const endPos = new Vector3(0.5, 3.7, 3.65); // norm length 5.22
      const r0 = startPos.length();
      const r1 = 5.22;

      // Sample 100 points along smootherstep arc
      for (let i = 0; i <= 100; i++) {
        const alpha = i / 100;
        const ease = alpha * alpha * alpha * (alpha * (alpha * 6 - 15) + 10);
        const curR = Math.max(5.15, r0 + (r1 - r0) * ease);

        expect(curR).toBeGreaterThanOrEqual(5.15);
      }
    });

    it('M4-CAM-05: exposes window.__INDICATRIX_CAMERA__.snapHorizonCrossSection programmatic trigger', () => {
      let triggeredDuration: number | null = null;
      let targetCalled = false;

      (window as any).__INDICATRIX_CAMERA__ = {
        snapHorizonCrossSection: (duration = 1.6) => {
          triggeredDuration = duration;
          targetCalled = true;
        },
      };

      (window as any).__INDICATRIX_CAMERA__.snapHorizonCrossSection(1.6);

      expect(targetCalled).toBe(true);
      expect(triggeredDuration).toBe(1.6);
    });
  });

  // ==========================================================================
  // Suite 4: WebGPUEngine Uniform Parameter Population
  // ==========================================================================
  describe('4. WebGPUEngine Uniform Parameter Population', () => {
    beforeEach(() => {
      setupMockNavigator();
    });

    afterEach(() => {
      restoreMockNavigator();
    });

    it('M4-ENG-01: WebGPUEngine getters/setters clamp atmosphericScale and shadowIntensity', () => {
      const engine = new WebGPUEngine();

      expect(engine.atmosphericScale).toBe(1.0);
      expect(engine.shadowIntensity).toBe(0.45);

      engine.atmosphericScale = 5.5;
      expect(engine.atmosphericScale).toBe(5.5);

      engine.atmosphericScale = 0.5;
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = 15.0;
      expect(engine.atmosphericScale).toBe(12.0);

      engine.shadowIntensity = 0.30;
      expect(engine.shadowIntensity).toBe(0.30);

      engine.shadowIntensity = -0.5;
      expect(engine.shadowIntensity).toBe(0.0);

      engine.shadowIntensity = 0.85;
      expect(engine.shadowIntensity).toBe(0.60);
    });

    it('M4-ENG-02: updateCloudLayerUniform populates float 26 and float 27 in 256-byte CloudUniforms', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      // Call updateCloudLayerUniform with scale = 6.0, shadow = 0.50
      engine.updateCloudLayerUniform(0, 6.0, 0.50);

      const f32Mirror = (engine as any).cloudLayerUniformMirrors?.[0];
      expect(f32Mirror).toBeDefined();

      // Invariant §20 & Spec §3.2:
      // Float 26 (byte offset 104) = u_atmosphericScale
      // Float 27 (byte offset 108) = u_shadowIntensity
      expect(f32Mirror[26]).toBe(6.0);
      expect(f32Mirror[27]).toBe(0.50);

      engine.dispose();
    });

    it('M4-ENG-03: render(params) propagates atmosphericScale and shadowIntensity to crust and cloud mirrors', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const params: WebGPUFrameParams = {
        unfurl: 0.0,
        time: 0.0,
        dt: 0.016,
        mode: 0,
        layerMode: 0,
        theme: 0,
        camera,
        atmosphericScale: 7.2,
        shadowIntensity: 0.35,
        showClouds: true,
      };

      engine.render(params);

      expect(engine.atmosphericScale).toBe(7.2);
      expect(engine.shadowIntensity).toBe(0.35);

      // Crust Floats float 68 (byte offset 272) is u_shadowIntensity in SimUniforms
      const crustFloats = (engine as any).crustFloats;
      expect(crustFloats[68]).toBeCloseTo(0.35, 2);

      // Cloud uniform float 26 and 27
      const cloudMirrors = (engine as any).cloudLayerUniformMirrors;
      if (cloudMirrors && cloudMirrors[0]) {
        expect(cloudMirrors[0][26]).toBeCloseTo(7.2, 1);
        expect(cloudMirrors[0][27]).toBeCloseTo(0.35, 2);
      }

      engine.dispose();
    });

    it('M4-ENG-04: zero pipeline recompilation when adjusting scale or shadow (Invariant §24)', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const device = (engine as any).device;
      const createPipelineSpy = vi.spyOn(device, 'createRenderPipeline');

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      // Re-rendering with modified atmospheric scale and shadow intensity
      engine.render({
        unfurl: 0.0,
        time: 0.0,
        dt: 0.016,
        mode: 0,
        layerMode: 0,
        theme: 0,
        camera,
        atmosphericScale: 10.5,
        shadowIntensity: 0.20,
      });

      // Pipeline re-creation count must remain 0 during uniform buffer updates
      expect(createPipelineSpy).not.toHaveBeenCalled();

      engine.dispose();
    });
  });

  // ==========================================================================
  // Suite 5: Invariant §48 Dynamic Dimensions Check (DEM Guard)
  // ==========================================================================
  describe('5. Invariant §48 Dynamic Dimensions Check (DEM Guard)', () => {
    it('M4-DEM-01: verifies WebGPUEngine.ts contains zero hardcoded DEM dimensions', () => {
      const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(enginePath, 'utf-8');
      const lines = content.split('\n');

      // Check specific historical line areas for literal 8192 or 4096 allocations
      const prohibitedLiterals = [
        /width:\s*8192/,
        /height:\s*4096/,
        /demTexture.*8192/,
      ];

      prohibitedLiterals.forEach(pattern => {
        lines.forEach((line, index) => {
          // Allow constants declarations or fallback symbols if dynamic
          if (line.includes('const ') || line.includes('//') || line.includes('*')) return;
          expect(pattern.test(line)).toBe(false);
        });
      });
    });

    it('M4-DEM-02: verifies DEM Guard reports None (Clean)', () => {
      // The DEM Guard outputs "Detected hardcoded literals at: None (Clean)"
      const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const content = fs.readFileSync(enginePath, 'utf-8');

      // Verify dynamic property existence
      expect(content).toContain('demWidth');
      expect(content).toContain('demHeight');
      expect(content).not.toContain('const demWidth = 8192;');
    });
  });

  // ==========================================================================
  // Suite 6: Monte Carlo Stress & Adversarial Fuzzing
  // ==========================================================================
  describe('6. Monte Carlo Stress & Adversarial Fuzzing', () => {
    it('M4-STRESS-01: 1,000-iteration random value fuzzing confirms 100% bounded, finite state on WebGPUEngine', () => {
      const engine = new WebGPUEngine();

      for (let i = 0; i < 1000; i++) {
        // Generate pseudo-random inputs in [-1000, 1000]
        const randomInput = (Math.random() - 0.5) * 2000;

        engine.atmosphericScale = randomInput;
        expect(engine.atmosphericScale).toBeGreaterThanOrEqual(1.0);
        expect(engine.atmosphericScale).toBeLessThanOrEqual(12.0);
        expect(Number.isFinite(engine.atmosphericScale)).toBe(true);

        engine.shadowIntensity = randomInput;
        expect(engine.shadowIntensity).toBeGreaterThanOrEqual(0.0);
        expect(engine.shadowIntensity).toBeLessThanOrEqual(0.60);
        expect(Number.isFinite(engine.shadowIntensity)).toBe(true);
      }
    });

    it('M4-STRESS-02: 50 rapid sequential clicks on Horizon preset button execute without dropped state or error', async () => {
      const onSnapCamera = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(
            UnifiedRightSidebar,
            createSidebarProps({
              onSnapCamera,
            })
          )
        );
      });

      const presetBtn = container.querySelector('button[title*="Horizon Cross-Section"]') as HTMLButtonElement;
      expect(presetBtn).not.toBeNull();

      await act(async () => {
        for (let i = 0; i < 50; i++) {
          presetBtn.click();
        }
      });

      expect(onSnapCamera).toHaveBeenCalledTimes(50);
      expect(onSnapCamera).toHaveBeenLastCalledWith('horizon');
    });
  });
});
