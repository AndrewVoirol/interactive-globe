// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/data-tab-color-enhancements.test.tsx
// Verification suite for informative color enhancements on the DATA tab:
// 1. Layer stack stratum category pips & micro-palette previews
// 2. Geodetic survey feeds ink-matched indicators
// 3. Timeline scrubber dual-zone spectral highlights & reactive thumb
// 4. Atmosphere drawer weather optical mode spectrum pans
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { TimelineScrubber } from '../../src/components/hud/TimelineScrubber';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { DataLayerItem } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('DATA Tab Informative Color Enhancements', () => {
  let container: HTMLDivElement;
  let root: Root;

  const createSidebarProps = (overrides: Partial<UnifiedRightSidebarProps> = {}): UnifiedRightSidebarProps => ({
    isZenMode: false,
    onZenToggle: vi.fn(),
    theme: 1, // Default to Cream Rag
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
    dataLayers: [],
    onAddDataLayer: vi.fn(),
    onToggleDataLayer: vi.fn(),
    onRemoveDataLayer: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  // --------------------------------------------------------------------------
  // 1. Layer stack stratum category badges & micro-palette previews
  // --------------------------------------------------------------------------
  describe('1. Layer Stack Stratum Badges & Micro-Palettes', () => {
    it('COLOR-01: renders stratum category badges with archival inks in Cream Rag (Theme 1)', async () => {
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

      await act(async () => {
        root.render(
          <UnifiedRightSidebar
            {...createSidebarProps({
              theme: 1,
              isSidebarOpen: true,
              dataLayers: mockLayers,
            })}
          />
        );
      });

      // Switch to DATA tab
      const dataTabButton = container.querySelector('#sidebar-tab-data') as HTMLButtonElement;
      await act(async () => {
        dataTabButton.click();
      });

      // Topo layer badge
      const topoBadge = container.querySelector('span[title*="Stratum Category: topo"]');
      expect(topoBadge).not.toBeNull();
      expect(topoBadge?.textContent).toBe('TOPO');

      // Atmosphere layer badge
      const atmoBadge = container.querySelector('span[title*="Stratum Category: atmospheric"]');
      expect(atmoBadge).not.toBeNull();
      expect(atmoBadge?.textContent).toBe('ATMO');

      // Micro-palette gradient preview should be rendered
      const palettePreview = container.querySelector('div[title*="Pigment Preview"]');
      expect(palettePreview).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Geodetic survey feeds ink-matched indicators
  // --------------------------------------------------------------------------
  describe('2. Geodetic Survey Feeds Ink Indicators', () => {
    it('COLOR-02: renders ink-matched indicator swatches in Geodetic Survey Feeds switches', async () => {
      await act(async () => {
        root.render(
          <UnifiedRightSidebar
            {...createSidebarProps({
              theme: 1,
              isSidebarOpen: true,
              showSoundings: true,
              showTriangulation: false,
              showLandmarks: true,
            })}
          />
        );
      });

      // Switch to DATA tab
      const dataTabButton = container.querySelector('#sidebar-tab-data') as HTMLButtonElement;
      await act(async () => {
        dataTabButton.click();
      });

      // Find switches by role
      const switches = container.querySelectorAll('div[role="switch"]');
      expect(switches.length).toBeGreaterThanOrEqual(3);

      // Soundings, Triangulation, Landmarks switches have indicator spans
      const soundingsSwitch = Array.from(switches).find((s) => s.textContent?.includes('Soundings'));
      expect(soundingsSwitch).toBeDefined();
      const soundingsPip = soundingsSwitch?.querySelector('span.rounded-\\[1px\\].border');
      expect(soundingsPip).not.toBeNull();

      const triSwitch = Array.from(switches).find((s) => s.textContent?.includes('Triangulation'));
      expect(triSwitch).toBeDefined();
      const triPip = triSwitch?.querySelector('span.rounded-\\[1px\\].border');
      expect(triPip).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Timeline scrubber dual-zone spectral highlights & reactive thumb
  // --------------------------------------------------------------------------
  describe('3. Timeline Scrubber Dual-Zone Spectral Highlights', () => {
    it('COLOR-03: illuminates amber radar zone when scrubbing into past radar (-30m)', async () => {
      await act(async () => {
        root.render(
          <TimelineScrubber
            value={-30}
            onTimeChange={vi.fn()}
            isRadarActive={true}
          />
        );
      });

      const track = container.querySelector('[data-testid="timeline-scrubber-track"]');
      expect(track).not.toBeNull();

      // Left radar zone should have amber glow styling
      const leftZone = track?.firstElementChild as HTMLDivElement;
      expect(leftZone.className).toContain('bg-amber-500/20');

      // Badge in header should reflect radar amber accent
      const radarBadge = container.querySelector('span.text-nano.font-bold.uppercase');
      expect(radarBadge?.textContent).toBe('PAST RADAR');
      expect(radarBadge?.className).toContain('border-amber-500');
    });

    it('COLOR-04: illuminates cyan forecast zone when scrubbing into future forecast (+12h)', async () => {
      await act(async () => {
        root.render(
          <TimelineScrubber
            value={720}
            onTimeChange={vi.fn()}
            isRadarActive={false}
          />
        );
      });

      const track = container.querySelector('[data-testid="timeline-scrubber-track"]');
      expect(track).not.toBeNull();

      // Right forecast zone should have sky blue styling
      const forecastZone = track?.children[1] as HTMLDivElement;
      expect(forecastZone.className).toContain('bg-sky-500/15');

      // Badge in header should reflect WeatherNext sky accent
      const forecastBadge = container.querySelector('span.text-nano.font-bold.uppercase');
      expect(forecastBadge?.textContent).toBe('WEATHERNEXT 3');
      expect(forecastBadge?.className).toContain('border-sky-500');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Atmosphere drawer weather optical mode spectrum pans
  // --------------------------------------------------------------------------
  describe('4. Atmosphere Drawer Weather Optical Mode Spectrum Pans', () => {
    it('COLOR-05: renders spectral swatches for Ink Wash and Doppler Radar modes', async () => {
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            theme={1}
            isLight={true}
            weatherOpticalMode={0}
            onWeatherOpticalModeChange={vi.fn()}
          />
        );
      });

      // Find optical mode radios
      const opticalModeButtons = container.querySelectorAll('button[role="radio"]');
      expect(opticalModeButtons.length).toBeGreaterThanOrEqual(2);

      // Swatches present
      const swatches = container.querySelectorAll('div[title*="pigment wash"], div[title*="reflectivity"]');
      expect(swatches.length).toBe(2);
    });
  });
});
