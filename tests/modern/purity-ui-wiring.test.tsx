// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/purity-ui-wiring.test.tsx
// Milestone 6: UI Integrity & Performance Hardening Verification Suite
// Tests:
// 1. Purity Diagnostic Mode UI wiring across App.tsx -> TelemetryHUD -> UnifiedRightSidebar
// 2. Tactile switch interaction and DOM rendering in SCENE tab
// 3. Compact GPU Profiler telemetry labels (Sim, Crust, Lines, Cont)
// 4. Responsive breakpoint updates (xl:right-[26.5rem], xl:right-[50.5rem], xl:right-[51.75rem])
// 5. Zero-GC kinematics preallocated vector reuse in WebGPUCanvas.tsx
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { TelemetryHUD, TelemetryHUDProps } from '../../src/components/hud/TelemetryHUD';
import { LoadedDataInfo } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Milestone 6: UI Integrity & Purity Wiring Test Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf-8');
  const telemetrySource = fs.readFileSync(path.join(projectRoot, 'src/components/hud/TelemetryHUD.tsx'), 'utf-8');
  const sidebarSource = fs.readFileSync(path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx'), 'utf-8');
  const canvasSource = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'), 'utf-8');

  let container: HTMLDivElement;
  let root: Root;

  const defaultDataInfo: LoadedDataInfo = {
    pointCount: 100000,
    lineCount: 300000,
    format: 'BIN (Zero-Copy)',
    loadTimeMs: 12.5,
    vramMb: 4.57,
  };

  const dummyLayer = {
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
    onSelectThemeMode: vi.fn(),
    showSoundings: true,
    onSoundingsToggle: vi.fn(),
    showTriangulation: false,
    onTriangulationToggle: vi.fn(),
    showCartouche: true,
    onCartoucheToggle: vi.fn(),
    backend: 'webgpu',
    onBackendChange: vi.fn(),
    hasWebGPU: true,
    resolution: '1M',
    onResolutionChange: vi.fn(),
    layerMode: 0,
    onLayerModeChange: vi.fn(),
    mode: 0,
    onModeChange: vi.fn(),
    cursorPhysicsEnabled: true,
    onCursorPhysicsToggle: vi.fn(),
    showLandmarks: true,
    onLandmarksToggle: vi.fn(),
    activeOverlay: 'off',
    onOverlayChange: vi.fn(),
    showTissot: false,
    onTissotToggle: vi.fn(),
    showVectors: true,
    onVectorsToggle: vi.fn(),
    alpha: 0,
    fps: 120,
    latStr: "00°00'N",
    lonStr: "000°00'E",
    mapScaleStr: "1:50M",
    onSnapCamera: vi.fn(),
    dataInfo: defaultDataInfo,
    dataLayers: [dummyLayer],
    onAddDataLayer: vi.fn(),
    onToggleDataLayer: vi.fn(),
    onRemoveDataLayer: vi.fn(),
    onReorderDataLayer: vi.fn(),
    purityMode: false,
    onPurityModeToggle: vi.fn(),
    ...overrides,
  });

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

  describe('1. Static Source Code Wiring Invariants', () => {
    it('M6-01: App.tsx declares purityMode state and forwards it to WebGPUCanvas', () => {
      expect(appSource).toMatch(/const\s+\[purityMode,\s*setPurityMode\]\s*=\s*useState<boolean>\(false\)/);
      expect(appSource).toMatch(/<WebGPUCanvas[\s\S]*?purityMode=\{purityMode\}/);
    });

    it('M6-02: App.tsx passes purityMode and onPurityModeToggle to TelemetryHUD', () => {
      expect(appSource).toMatch(/<TelemetryHUD[\s\S]*?purityMode=\{purityMode\}/);
      expect(appSource).toMatch(/<TelemetryHUD[\s\S]*?onPurityModeToggle=\{/);
    });

    it('M6-03: TelemetryHUD.tsx declares purityMode in props and forwards to UnifiedRightSidebar', () => {
      expect(telemetrySource).toContain('purityMode?: boolean;');
      expect(telemetrySource).toContain('onPurityModeToggle?: () => void;');
      expect(telemetrySource).toMatch(/<UnifiedRightSidebar[\s\S]*?purityMode=\{props\.purityMode\}/);
      expect(telemetrySource).toMatch(/<UnifiedRightSidebar[\s\S]*?onPurityModeToggle=\{props\.onPurityModeToggle\}/);
    });

    it('M6-04: UnifiedRightSidebar.tsx declares purityMode in UnifiedRightSidebarProps', () => {
      expect(sidebarSource).toContain('purityMode?: boolean;');
      expect(sidebarSource).toContain('onPurityModeToggle?: () => void;');
    });

    it('M6-05: UnifiedRightSidebar.tsx contains Card 4b "Purity · DEM Only" markup with RAW badge', () => {
      expect(sidebarSource).toContain('Purity · DEM Only');
      expect(sidebarSource).toContain('RAW');
      expect(sidebarSource).toContain('Archival substrate + pure DEM mesh (zero atmosphere/water)');
    });

    it('M6-06: UnifiedRightSidebar.tsx catalog sheet uses xl:right-[26.5rem]', () => {
      expect(sidebarSource).toMatch(/fixed top-5 right-5 xl:right-\[26\.5rem\] z-40 pointer-events-auto w-96/);
    });

    it('M6-07: App.tsx responsive offsets use xl:right-[50.5rem] and xl:right-[51.75rem]', () => {
      expect(appSource).toContain('xl:right-[50.5rem]');
      expect(appSource).toContain('xl:right-[51.75rem]');
    });

    it('M6-08: GPU Profiler telemetry labels are compacted to single-line budget', () => {
      expect(sidebarSource).toContain('Sim: {(gpuReport.computeMs ?? 0).toFixed(1)}ms');
      expect(sidebarSource).toContain('Crust: {(gpuReport.reliefMs ?? 0).toFixed(1)}ms');
      expect(sidebarSource).toContain('Lines: {(gpuReport.linesMs ?? 0).toFixed(1)}ms');
      expect(sidebarSource).toContain('Cont: {(gpuReport.contoursMs ?? 0).toFixed(1)}ms');
    });

    it('M6-09: WebGPUCanvas.tsx reuses _scratchVecA and ORIGIN_VEC for camera kinematics', () => {
      expect(canvasSource).toContain('const _scratchVecA = new Vector3();');
      expect(canvasSource).toContain('const offset = _scratchVecA.subVectors(camera.position, targetRef.current);');
      expect(canvasSource).toContain('targetRef.current.lerp(ORIGIN_VEC, 0.08);');
      // Ensure no new Vector3() inside kinematic hot paths
      expect(canvasSource).not.toContain('targetRef.current.lerp(new Vector3(0, 0, 0), 0.08)');
    });
  });

  describe('2. DOM Mounting & Interaction Tests', () => {
    it('M6-10: UnifiedRightSidebar renders Purity · DEM Only card in SCENE tab', () => {
      const onToggle = vi.fn();
      act(() => {
        root.render(<UnifiedRightSidebar {...createSidebarProps({ purityMode: false, onPurityModeToggle: onToggle })} />);
      });

      const card = container.querySelector('.text-micro.font-bold.uppercase.tracking-wider');
      expect(container.textContent).toContain('Purity · DEM Only');
      expect(container.textContent).toContain('RAW');
      expect(container.textContent).toContain('Archival substrate + pure DEM mesh (zero atmosphere/water)');
    });

    it('M6-11: Clicking Purity switch triggers onPurityModeToggle callback', () => {
      const onToggle = vi.fn();
      act(() => {
        root.render(<UnifiedRightSidebar {...createSidebarProps({ purityMode: false, onPurityModeToggle: onToggle })} />);
      });

      const puritySwitch = container.querySelector<HTMLElement>('[role="switch"][title*="Purity"]');
      expect(puritySwitch).toBeTruthy();

      act(() => {
        puritySwitch!.click();
      });

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('M6-12: Switch reflects active state when purityMode is true', () => {
      act(() => {
        root.render(<UnifiedRightSidebar {...createSidebarProps({ purityMode: true })} />);
      });

      const puritySwitch = container.querySelector<HTMLElement>('[role="switch"][title*="Purity"]');
      expect(puritySwitch).toBeTruthy();
      expect(puritySwitch!.textContent).toContain('Active');
    });

    it('M6-13: Compacted GPU Profiler renders Sim, Crust, Lines, and Cont columns', () => {
      const gpuReport = {
        computeMs: 0.92,
        reliefMs: 2.12,
        linesMs: 0.45,
        contoursMs: 0.28,
        totalGpuMs: 3.70,
        frameTimeMs: 8.33,
        fps: 120,
      };

      act(() => {
        root.render(<UnifiedRightSidebar {...createSidebarProps({ gpuReport })} />);
      });

      expect(container.textContent).toContain('Sim: 0.9ms');
      expect(container.textContent).toContain('Crust: 2.1ms');
      expect(container.textContent).toContain('Lines: 0.5ms');
      expect(container.textContent).toContain('Cont: 0.3ms');
    });
  });
});
