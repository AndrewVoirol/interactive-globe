// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/rule17-strata-reorder-and-atmosphere-toggle.test.tsx
// Verification suite for:
// 1. Rule 17: Physical strata ordering is immutable — strata reorder arrow buttons
//    and Z-order ordinal displays removed from UI.
// 2. Atmospheric Scattering: UI toggle exposed in AtmosphereDrawer and fully
//    wired across useEngineState -> App -> TelemetryHUD -> UnifiedRightSidebar -> AtmosphereDrawer & WebGPUCanvas.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { DataLayerItem } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Rule 17 Strata Reorder Removal & Atmospheric Scatter Toggle Wiring', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const sidebarSource = fs.readFileSync(path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx'), 'utf-8');
  const atmosphereTabSource = fs.readFileSync(path.join(projectRoot, 'src/components/hud/tabs/AtmosphereTab.tsx'), 'utf-8');
  const atmosphereDrawerSource = fs.readFileSync(path.join(projectRoot, 'src/components/AtmosphereDrawer.tsx'), 'utf-8');
  const engineStateSource = fs.readFileSync(path.join(projectRoot, 'src/hooks/useEngineState.ts'), 'utf-8');
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf-8');
  const telemetrySource = fs.readFileSync(path.join(projectRoot, 'src/components/hud/TelemetryHUD.tsx'), 'utf-8');
  const canvasSource = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'), 'utf-8');

  let container: HTMLDivElement;
  let root: Root;

  const mockLayers: DataLayerItem[] = [
    {
      id: 'architectural-topo-relief',
      name: 'Topographic Relief',
      category: 'topo',
      type: 'DEM 15-arcsec',
      details: 'SRTM 15-arcsecond global digital elevation model',
      visible: true,
      opacity: 1.0,
    },
    {
      id: 'noaa-gfs-clouds',
      name: 'Atmospheric Cloud Strata',
      category: 'atmosphere',
      type: 'Volumetric',
      details: 'NOAA GFS volumetric optical depth',
      visible: true,
      opacity: 0.85,
    },
  ];

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
    fps: 120,
    latStr: "00°00'N",
    lonStr: "000°00'E",
    mapScaleStr: "1:50M",
    onSnapCamera: vi.fn(),
    dataLayers: mockLayers,
    onAddDataLayer: vi.fn(),
    onToggleDataLayer: vi.fn(),
    onRemoveDataLayer: vi.fn(),
    onReorderDataLayer: vi.fn(),
    showClouds: true,
    showAtmosphere: false,
    onShowAtmosphereChange: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    if (typeof window !== 'undefined') {
      (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {};
    }
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  describe('Bug A: Rule 17 Strata Reorder Excision', () => {
    it('RULE17-01: UnifiedRightSidebar source contains no Move Layer Up/Down buttons or Z: ordinal display', () => {
      expect(sidebarSource).not.toContain('title="Move Layer Up"');
      expect(sidebarSource).not.toContain('title="Move Layer Down"');
      expect(sidebarSource).not.toContain('Z:{dataLayers.length');
    });

    it('RULE17-02: DATA tab renders active layers without up/down arrow buttons or Z: indicators', async () => {
      await act(async () => {
        root.render(
          <UnifiedRightSidebar
            {...createSidebarProps({
              isSidebarOpen: true,
            })}
          />
        );
      });

      // Switch to DATA tab
      const dataTabButton = container.querySelector('#sidebar-tab-data') as HTMLButtonElement;
      expect(dataTabButton).not.toBeNull();
      await act(async () => {
        dataTabButton.click();
      });

      // Confirm up/down buttons do not exist in DOM
      expect(container.querySelector('button[title="Move Layer Up"]')).toBeNull();
      expect(container.querySelector('button[title="Move Layer Down"]')).toBeNull();

      // Confirm Z: ordinal text does not appear in layer cards
      expect(container.textContent).not.toMatch(/Z:\d+/);

      // Confirm visibility and remove buttons still exist
      const showHideButtons = container.querySelectorAll('button[title*="layer"]');
      expect(showHideButtons.length).toBeGreaterThan(0);
    });

    it('RULE17-03: onReorderDataLayer prop remains in UnifiedRightSidebarProps interface for contract compatibility', () => {
      expect(sidebarSource).toContain('onReorderDataLayer?: (id: string, direction: \'up\' | \'down\') => void;');
    });
  });

  describe('Bug B: Atmospheric Scattering UI Toggle & Pipeline Wiring', () => {
    it('ATMOS-01: useEngineState declares showAtmosphere state defaulting to false and exports setter', () => {
      expect(engineStateSource).toMatch(/const\s+\[showAtmosphere,\s*setShowAtmosphereState\]\s*=\s*useState<boolean>\(false\)/);
      expect(engineStateSource).toContain('showAtmosphere, setShowAtmosphere,');
      expect(engineStateSource).toContain('__INDICATRIX_LIVE_UNIFORMS__.showAtmosphere = val;');
    });

    it('ATMOS-02: App.tsx threads showAtmosphere to WebGPUCanvas and TelemetryHUD', () => {
      expect(appSource).toContain('showAtmosphere, setShowAtmosphere');
      expect(appSource).toMatch(/<WebGPUCanvas[\s\S]*?showAtmosphere=\{showAtmosphere\}/);
      expect(appSource).toMatch(/<TelemetryHUD[\s\S]*?showAtmosphere=\{showAtmosphere\}/);
      expect(appSource).toMatch(/<TelemetryHUD[\s\S]*?onShowAtmosphereChange=\{setShowAtmosphere\}/);
    });

    it('ATMOS-03: TelemetryHUD declares and forwards showAtmosphere to UnifiedRightSidebar', () => {
      expect(telemetrySource).toContain('showAtmosphere?: boolean;');
      expect(telemetrySource).toContain('onShowAtmosphereChange?: (v: boolean) => void;');
      expect(telemetrySource).toMatch(/<UnifiedRightSidebar[\s\S]*?showAtmosphere=\{props\.showAtmosphere\}/);
      expect(telemetrySource).toMatch(/<UnifiedRightSidebar[\s\S]*?onShowAtmosphereChange=\{props\.onShowAtmosphereChange\}/);
    });

    it('ATMOS-04: UnifiedRightSidebar declares and forwards showAtmosphere to AtmosphereDrawer', () => {
      expect(sidebarSource).toContain('showAtmosphere?: boolean; onShowAtmosphereChange?: (v: boolean) => void;');
      expect(sidebarSource).toMatch(/<(AtmosphereDrawer|AtmosphereTab)[\s\S]*?(?:showAtmosphere|propShowAtmosphere)=\{propShowAtmosphere\}/);
      expect(sidebarSource).toMatch(/<(AtmosphereDrawer|AtmosphereTab)[\s\S]*?onShowAtmosphereChange=\{onShowAtmosphereChange\}/);
      expect(atmosphereTabSource).toMatch(/<AtmosphereDrawer[\s\S]*?showAtmosphere=\{propShowAtmosphere\}/);
      expect(atmosphereTabSource).toMatch(/<AtmosphereDrawer[\s\S]*?onShowAtmosphereChange=\{onShowAtmosphereChange\}/);
    });

    it('ATMOS-05: WebGPUCanvas defaults showAtmosphere to false', () => {
      expect(canvasSource).toContain('showAtmosphere = false,');
    });

    it('ATMOS-06: AtmosphereDrawer renders Atmospheric Scatter toggle station with TactileSwitch', async () => {
      const onToggle = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={true}
            showAtmosphere={false}
            onShowAtmosphereChange={onToggle}
          />
        );
      });

      expect(container.textContent).toContain('Atmospheric Scatter');
      expect(container.textContent).toContain('Bypassed · Limb scatter off');

      const scatterSwitch = container.querySelector('#sidebar-atmospheric-scatter');
      expect(scatterSwitch).not.toBeNull();
      expect(scatterSwitch?.textContent).toContain('Off');
      expect(scatterSwitch?.getAttribute('aria-checked')).toBe('false');

      // Click to toggle
      await act(async () => {
        scatterSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onToggle).toHaveBeenCalledWith(true);
      expect((window as any).__INDICATRIX_LIVE_UNIFORMS__.showAtmosphere).toBe(true);
    });

    it('ATMOS-07: AtmosphereDrawer displays Active state when showAtmosphere is true', async () => {
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={true}
            showAtmosphere={true}
          />
        );
      });

      expect(container.textContent).toContain('Atmospheric Scatter');
      expect(container.textContent).toContain('Active · Rayleigh & Mie limb scattering');

      const scatterSwitch = container.querySelector('#sidebar-atmospheric-scatter');
      expect(scatterSwitch?.textContent).toContain('Active');
      expect(scatterSwitch?.getAttribute('aria-checked')).toBe('true');
    });
  });
});
