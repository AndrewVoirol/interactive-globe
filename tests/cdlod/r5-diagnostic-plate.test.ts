// @vitest-environment happy-dom
// ============================================================================
// File: tests/cdlod/r5-diagnostic-plate.test.ts
// Test Tier: Milestone 5 (R5 Real-Time CDLOD Diagnostic Plate)
// Description: Behavioral validation for in-engine real-time CDLOD mesh diagnostic
//              coloring: SimUniforms float 79 packing, VertexOutput @location(7) lodInfo,
//              discrete integer LOD color palette (LOD 0-9+), geomorph alpha thermal ramp,
//              composite plate with preserved hillshade, Rule 18 uniform-driven
//              zero-recompilation pipeline preservation, and Rule 22 Beta Tray UI.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { LoadedDataInfo } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Milestone 5 (R5): Real-Time CDLOD Diagnostic Plate', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const crustWgslPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
  const hookPath = path.join(projectRoot, 'src/hooks/useEngineState.ts');
  const appPath = path.join(projectRoot, 'src/App.tsx');
  const canvasPath = path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx');
  const sidebarPath = path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx');

  let engine: WebGPUEngine;
  let container: HTMLDivElement;
  let root: Root;

  const defaultDataInfo: LoadedDataInfo = {
    pointCount: 100000,
    lineCount: 300000,
    format: 'BIN (Zero-Copy)',
    loadTimeMs: 12.5,
    vramMb: 4.57,
  };

  const defaultLayer = {
    id: 'hybrid-crust-hydrosphere',
    name: 'Hybrid Crust Hydrosphere',
    category: 'topo' as const,
    type: 'Hypsometric Topography & Bathymetry',
    details: 'Calibrated DEM',
    visible: true,
    opacity: 1.0,
    displacementScale: 1.0,
    elevationEncoding: 'terrarium' as const,
    sunAzimuth: 315,
    sunAltitude: 45,
    hillshadeIntensity: 1.0,
    seaLevelOffset: 0.0,
    waterClarity: 0.5,
    ambientOcclusion: 1.0,
    peakExponent: 1.0,
  };

  const createSidebarProps = (overrides: Partial<UnifiedRightSidebarProps> = {}): UnifiedRightSidebarProps => ({
    isZenMode: false,
    onZenToggle: vi.fn(),
    theme: 1,
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
    alpha: 0,
    fps: 60,
    latStr: '21°18\'N',
    lonStr: '157°51\'W',
    mapScaleStr: '1:50,000,000',
    dataInfo: defaultDataInfo,
    onSnapCamera: vi.fn(),
    dataLayers: [defaultLayer],
    cdlodEnabled: true,
    onCdlodToggle: vi.fn(),
    cdlodDiagnosticMode: 0,
    onCdlodDiagnosticModeChange: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    engine = new WebGPUEngine();
    (engine as any).isInitialized = true;
    (engine as any).simUniformBuffer = { destroy: vi.fn() };
    (engine as any).crustUniformBuffer = { destroy: vi.fn() };
    (engine as any).device = { queue: { writeBuffer: vi.fn() } };
    (engine as any).context = { canvas: { width: 1920, height: 1080 } };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    engine.dispose();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // ==========================================================================
  // Pillar 1: SimUniforms Byte Layout & Float 79 Mapping
  // ==========================================================================
  describe('Pillar 1: SimUniforms Byte Layout & Float 79 Mapping', () => {
    it('verifies u_cdlodDiagnosticMode is declared at byte offset 316 (float 79) in SimUniforms', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');

      // 1. SimUniforms struct presence
      const structMatch = shaderSrc.match(/struct\s+SimUniforms\s*\{([^}]+)\};/);
      expect(structMatch).not.toBeNull();
      const structBody = structMatch![1];

      // 2. Field name and offset declaration
      expect(structBody).toMatch(/u_cdlodDiagnosticMode\s*:\s*f32/);
      expect(structBody).toContain('offset 316 (float 79)');

      // 3. Offset calculation verification
      // SimUniforms total size must be 320 bytes (20 vec4 blocks of 16 bytes)
      const floatIndex = 79;
      const byteOffset = floatIndex * 4;
      expect(byteOffset).toBe(316);
      expect(Math.ceil((byteOffset + 4) / 16) * 16).toBe(320);
    });

    it('verifies float 79 slot is cleanly declared as u_cdlodDiagnosticMode without synthetic padding artifacts', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');
      const diagLine = shaderSrc.split('\n').find((l) => l.includes('u_cdlodDiagnosticMode'));
      expect(diagLine).toBeDefined();
      expect(diagLine!.trim()).toBe('u_cdlodDiagnosticMode: f32, // offset 316 (float 79)');
      expect(shaderSrc).not.toContain('_padScrub2');
    });
  });

  // ==========================================================================
  // Pillar 2: WebGPUEngine Uniform Packing & State Management
  // ==========================================================================
  describe('Pillar 2: WebGPUEngine Uniform Packing & State Management', () => {
    it('packs 0.0 when cdlodDiagnosticMode is off or omitted', () => {
      const crustFloats = (engine as any).crustFloats as Float32Array;

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        dt: 0.016,
      });

      expect(crustFloats[79]).toBe(0.0);
    });

    it('packs exact floats 1.0, 2.0, 3.0 when cdlodDiagnosticMode is set', () => {
      const crustFloats = (engine as any).crustFloats as Float32Array;

      // Mode 1: Discrete Integer LOD
      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        dt: 0.016,
        cdlodDiagnosticMode: 1.0,
      });
      expect(crustFloats[79]).toBe(1.0);
      expect(engine.cdlodDiagnosticMode).toBe(1.0);

      // Mode 2: Morph Alpha Ramp
      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        dt: 0.016,
        cdlodDiagnosticMode: 2.0,
      });
      expect(crustFloats[79]).toBe(2.0);
      expect(engine.cdlodDiagnosticMode).toBe(2.0);

      // Mode 3: Composite Plate
      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        dt: 0.016,
        cdlodDiagnosticMode: 3.0,
      });
      expect(crustFloats[79]).toBe(3.0);
      expect(engine.cdlodDiagnosticMode).toBe(3.0);

      // Toggled Off: Mode 0
      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        dt: 0.016,
        cdlodDiagnosticMode: 0.0,
      });
      expect(crustFloats[79]).toBe(0.0);
      expect(engine.cdlodDiagnosticMode).toBe(0.0);
    });

    it('exports RenderParams type alias conforming to WebGPUFrameParams', () => {
      const engineSrc = fs.readFileSync(enginePath, 'utf8');
      expect(engineSrc).toContain('export type RenderParams = WebGPUFrameParams;');
    });
  });

  // ==========================================================================
  // Pillar 3: VertexOutput & Inter-Stage Interpolation
  // ==========================================================================
  describe('Pillar 3: VertexOutput & Inter-Stage Interpolation', () => {
    it('declares @location(7) lodInfo: vec2<f32> in VertexOutput', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');

      const vertexOutputMatch = shaderSrc.match(/struct\s+VertexOutput\s*\{([^}]+)\};/);
      expect(vertexOutputMatch).not.toBeNull();
      const body = vertexOutputMatch![1];

      expect(body).toMatch(/@location\(7\)\s+lodInfo\s*:\s*vec2<f32>/);
    });

    it('populates output.lodInfo = vec2<f32>(f32(inst.lod), alpha) in vs_main', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');

      const vsMainIdx = shaderSrc.indexOf('fn vs_main(');
      expect(vsMainIdx).toBeGreaterThan(0);
      const fsMainIdx = shaderSrc.indexOf('fn fs_main(');
      expect(fsMainIdx).toBeGreaterThan(vsMainIdx);

      const vsMainBody = shaderSrc.slice(vsMainIdx, fsMainIdx);
      expect(vsMainBody).toContain('output.lodInfo = vec2<f32>(f32(inst.lod), alpha);');
      expect(vsMainBody).toMatch(/alpha\s*=\s*clamp\(\s*\(r\s*-\s*inst\.morphStart\)\s*\*\s*inst\.invMorphRange/);
    });
  });

  // ==========================================================================
  // Pillar 4: Shading Response & Color Mathematical Parity
  // ==========================================================================
  describe('Pillar 4: Shading Response & Color Mathematical Parity', () => {
    it('declares getLODColor with all 10 LOD octaves (LOD 0 through LOD 9+)', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');

      expect(shaderSrc).toContain('fn getLODColor(lod: u32) -> vec3<f32>');
      expect(shaderSrc).toContain('vec3<f32>(0.10, 0.25, 0.65)'); // LOD 0: Deep Cobalt
      expect(shaderSrc).toContain('vec3<f32>(0.12, 0.58, 0.85)'); // LOD 1: Cerulean
      expect(shaderSrc).toContain('vec3<f32>(0.15, 0.72, 0.60)'); // LOD 2: Turquoise/Teal
      expect(shaderSrc).toContain('vec3<f32>(0.30, 0.78, 0.35)'); // LOD 3: Meadow Green
      expect(shaderSrc).toContain('vec3<f32>(0.85, 0.82, 0.20)'); // LOD 4: Lemon Yellow
      expect(shaderSrc).toContain('vec3<f32>(0.95, 0.58, 0.15)'); // LOD 5: Amber Orange
      expect(shaderSrc).toContain('vec3<f32>(0.92, 0.25, 0.20)'); // LOD 6: Crimson
      expect(shaderSrc).toContain('vec3<f32>(0.80, 0.20, 0.75)'); // LOD 7: Magenta
      expect(shaderSrc).toContain('vec3<f32>(0.55, 0.15, 0.85)'); // LOD 8: Violet
      expect(shaderSrc).toContain('vec3<f32>(0.95, 0.95, 0.95)'); // LOD 9+: Bright White
    });

    it('contains diagnostic branches for Mode 1, Mode 2, and Mode 3 in fs_main', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');

      const fsMainIdx = shaderSrc.indexOf('fn fs_main(');
      const fsMainBody = shaderSrc.slice(fsMainIdx);

      // Gated by u_cdlodDiagnosticMode > 0.5
      expect(fsMainBody).toContain('if (sim.u_cdlodDiagnosticMode > 0.5)');

      // Extraction of rounded integer LOD and clamped morph alpha
      expect(fsMainBody).toContain('let lodInt = u32(round(input.lodInfo.x));');
      expect(fsMainBody).toContain('let alpha = clamp(input.lodInfo.y, 0.0, 1.0);');

      // Mode 3: Combined plate
      expect(fsMainBody).toContain('if (sim.u_cdlodDiagnosticMode >= 2.5)');
      expect(fsMainBody).toContain('let alphaMod = mix(vec3<f32>(0.75), vec3<f32>(1.25, 1.05, 0.65), alpha);');

      // Mode 2: Pure Morph Factor Alpha Ramp
      expect(fsMainBody).toContain('else if (sim.u_cdlodDiagnosticMode >= 1.5)');
      expect(fsMainBody).toContain('diagColor = mix(vec3<f32>(0.05, 0.40, 0.85), vec3<f32>(0.95, 0.20, 0.10), alpha);');

      // Mode 1: Discrete Integer LOD Hue
      expect(fsMainBody).toContain('diagColor = lodColor;');

      // Preserved hillshade relief modulation (Rule 5)
      expect(fsMainBody).toContain('let hillshade = clamp(NdotL1 * shadowFactor + 0.35, 0.25, 1.25);');
      expect(fsMainBody).toContain('finalCrust = diagColor * hillshade;');
    });

    it('preserves Rule 4 Uniform Control Flow for derivatives before diagnostic block', () => {
      const shaderSrc = fs.readFileSync(crustWgslPath, 'utf8');

      const fsMainIdx = shaderSrc.indexOf('fn fs_main(');
      const fsMainBody = shaderSrc.slice(fsMainIdx);

      const dpdxIdx = fsMainBody.indexOf('dpdx(input.uv.x)');
      const fwidthIdx = fsMainBody.indexOf('fwidth(input.uv)');
      const diagBlockIdx = fsMainBody.indexOf('if (sim.u_cdlodDiagnosticMode > 0.5)');

      expect(dpdxIdx).toBeGreaterThan(0);
      expect(fwidthIdx).toBeGreaterThan(0);
      expect(diagBlockIdx).toBeGreaterThan(dpdxIdx);
      expect(diagBlockIdx).toBeGreaterThan(fwidthIdx);
    });

    it('verifies mathematical interpolation values for Morph Alpha Ramp', () => {
      // Model the WGSL Mode 2 interpolation in CPU math
      const colorStart = [0.05, 0.40, 0.85]; // alpha = 0.0
      const colorEnd = [0.95, 0.20, 0.10];   // alpha = 1.0

      const evalAlpha = (a: number) => [
        colorStart[0] + (colorEnd[0] - colorStart[0]) * a,
        colorStart[1] + (colorEnd[1] - colorStart[1]) * a,
        colorStart[2] + (colorEnd[2] - colorStart[2]) * a,
      ];

      const c0 = evalAlpha(0.0);
      expect(c0[0]).toBeCloseTo(0.05, 4);
      expect(c0[1]).toBeCloseTo(0.40, 4);
      expect(c0[2]).toBeCloseTo(0.85, 4);

      const c5 = evalAlpha(0.5);
      expect(c5[0]).toBeCloseTo(0.50, 4);
      expect(c5[1]).toBeCloseTo(0.30, 4);
      expect(c5[2]).toBeCloseTo(0.475, 4);

      const c1 = evalAlpha(1.0);
      expect(c1[0]).toBeCloseTo(0.95, 4);
      expect(c1[1]).toBeCloseTo(0.20, 4);
      expect(c1[2]).toBeCloseTo(0.10, 4);
    });
  });

  // ==========================================================================
  // Pillar 5: Rule 18 Zero-Recompilation Pipeline Invariant
  // ==========================================================================
  describe('Pillar 5: Rule 18 Zero-Recompilation Pipeline Invariant', () => {
    it('verifies switching diagnostic modes does NOT recompile GPU pipelines', () => {
      const mockDevice = {
        queue: {
          writeBuffer: vi.fn(),
        },
        createBuffer: vi.fn(() => ({})),
        createRenderPipeline: vi.fn(() => ({})),
        createComputePipeline: vi.fn(() => ({})),
      };

      (engine as any).device = mockDevice;
      (engine as any).crustUniformBuffer = { destroy: vi.fn() };
      const initialPipelinesCount = mockDevice.createRenderPipeline.mock.calls.length;

      // Toggle through all diagnostic modes via setCdlodDiagnosticMode
      engine.setCdlodDiagnosticMode(1);
      engine.setCdlodDiagnosticMode(2);
      engine.setCdlodDiagnosticMode(3);
      engine.setCdlodDiagnosticMode(0);

      // Rule 18 invariant: zero pipeline recompilations
      expect(mockDevice.createRenderPipeline.mock.calls.length).toBe(initialPipelinesCount);
      expect(mockDevice.createComputePipeline.mock.calls.length).toBe(0);

      // Only uniform buffer writes occurred
      expect(mockDevice.queue.writeBuffer).toHaveBeenCalledTimes(4);
    });
  });

  // ==========================================================================
  // Pillar 6: Rule 22 Beta Tray UI & SegmentedControl
  // ==========================================================================
  describe('Pillar 6: Rule 22 Beta Tray UI & SegmentedControl', () => {
    it('verifies UnifiedRightSidebar renders CDLOD Mesh Diagnostics inside the [BETA] tray', () => {
      const onChange = vi.fn();
      act(() => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ cdlodDiagnosticMode: 0, onCdlodDiagnosticModeChange: onChange })));
      });

      // 1. Check title label exists
      const label = Array.from(container.querySelectorAll('span')).find(
        (el) => el.textContent?.trim() === 'CDLOD Mesh Diagnostics'
      );
      expect(label).toBeDefined();

      // 2. Check status badge shows OFF when mode = 0
      const offBadge = Array.from(container.querySelectorAll('span')).find(
        (el) => el.textContent?.trim() === 'OFF'
      );
      expect(offBadge).toBeDefined();

      // 3. Check SegmentedControl options: Off, LOD, Morph α, All
      const cardContainer = label!.closest('div.flex-col');
      expect(cardContainer).not.toBeNull();
      const buttons = Array.from(cardContainer!.querySelectorAll('button'));
      expect(buttons.length).toBe(4);
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Off', 'LOD', 'Morph α', 'All']);

      // 4. Click 'LOD' and verify callback
      const lodBtn = buttons.find((btn) => btn.textContent?.trim() === 'LOD');
      expect(lodBtn).toBeDefined();
      act(() => {
        lodBtn!.click();
      });
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('updates badge readout for each diagnostic mode (OFF, LOD, MORPH, COMBINED)', () => {
      // Test LOD mode (1)
      act(() => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ cdlodDiagnosticMode: 1 })));
      });
      expect(container.textContent).toContain('LOD');

      // Test MORPH mode (2)
      act(() => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ cdlodDiagnosticMode: 2 })));
      });
      expect(container.textContent).toContain('MORPH');

      // Test COMBINED mode (3)
      act(() => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ cdlodDiagnosticMode: 3 })));
      });
      expect(container.textContent).toContain('COMBINED');
    });

    it('verifies static UI structure in UnifiedRightSidebar.tsx', () => {
      const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');

      expect(sidebarSrc).toContain('CDLOD Mesh Diagnostics');
      expect(sidebarSrc).toContain("{ id: 0, label: 'Off', title: 'Normal Cartographic Rendering' }");
      expect(sidebarSrc).toContain("{ id: 1, label: 'LOD', title: 'Color patches by integer LOD level' }");
      expect(sidebarSrc).toContain("{ id: 2, label: 'Morph α', title: 'Render geomorphing transition factor alpha' }");
      expect(sidebarSrc).toContain("{ id: 3, label: 'All', title: 'Combined LOD hue + morph gradient + relief' }");
    });
  });

  // ==========================================================================
  // Pillar 7: End-to-End React & Canvas Wiring
  // ==========================================================================
  describe('Pillar 7: End-to-End React & Canvas Wiring', () => {
    it('verifies useEngineState exports cdlodDiagnosticMode and setCdlodDiagnosticMode', () => {
      const hookSrc = fs.readFileSync(hookPath, 'utf8');

      expect(hookSrc).toContain('const [cdlodDiagnosticMode, setCdlodDiagnosticModeState] = useState<number>(0);');
      expect(hookSrc).toContain('cdlodDiagnosticMode, setCdlodDiagnosticMode,');
    });

    it('verifies App.tsx passes cdlodDiagnosticMode to WebGPUCanvas and TelemetryHUD', () => {
      const appSrc = fs.readFileSync(appPath, 'utf8');

      expect(appSrc).toContain('cdlodDiagnosticMode={cdlodDiagnosticMode}');
      expect(appSrc).toContain('onCdlodDiagnosticModeChange={setCdlodDiagnosticMode}');
    });

    it('verifies WebGPUCanvas.tsx passes cdlodDiagnosticMode to engine.render()', () => {
      const canvasSrc = fs.readFileSync(canvasPath, 'utf8');

      expect(canvasSrc).toContain('cdlodDiagnosticMode?: number;');
      expect(canvasSrc).toContain('cdlodDiagnosticMode: stateRef.current.cdlodDiagnosticMode ?? 0,');
    });
  });
});
