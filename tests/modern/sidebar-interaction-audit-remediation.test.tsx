// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/sidebar-interaction-audit-remediation.test.tsx
// Comprehensive verification suite for all 10 sidebar & data tab audit remediations:
// 1. Antipodal Geodesic Semicircle Parameterization
// 2. Camera Easing on Geodesic Feeds (Conveyor, Migration, Antipodes)
// 3. Volumetric Cloud Layer Coupling (noaa-gfs-clouds)
// 4. Lifecycle Teardown Hooks (Radar Ring Buffer)
// 5. Auto-Switch Prognostic Model on Catalog Add
// 6. Horizon Cross-Section Preset Scaling (6.0x)
// 7. Curator's Colophon Live Provenance Badges
// 8. Timeline Radar Nowcast Inline Feedback & Prompt
// 9. Layer Stack & Blend SegmentedControl Scalability
// 10. Data Catalog Cleanliness & Asset Parity
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import { sampleGreatCircleGeodesic } from '../../src/core/GlobeOverlay';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { CuratorsColophon } from '../../src/components/hud/CuratorsColophon';
import { TimelineScrubber } from '../../src/components/hud/TimelineScrubber';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { DATA_LAYER_CATALOG } from '../../src/core/data/DataLayerCatalog';
import { DataLayerItem } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Sidebar & Data Tab Engineering Remediations Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

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
    delete (window as any).__INDICATRIX_CAMERA__;
  });

  // --------------------------------------------------------------------------
  // 1. Antipodal Geodesic Semicircle Parameterization
  // --------------------------------------------------------------------------
  describe('1. Antipodal Geodesic Semicircle Parameterization', () => {
    it('ANTIPODE-01: calculates valid 180° great circle semicircle between exact antipodes without NaN collapse', () => {
      // (0, 0) and (180, 0)
      const steps = 60;
      const points = sampleGreatCircleGeodesic({ lon: 0, lat: 0 }, { lon: 180, lat: 0 }, steps);

      expect(points.length).toBe(steps + 1);
      // All points must be finite numbers
      for (const pt of points) {
        expect(Number.isFinite(pt.lon)).toBe(true);
        expect(Number.isFinite(pt.lat)).toBe(true);
        expect(Number.isNaN(pt.lon)).toBe(false);
        expect(Number.isNaN(pt.lat)).toBe(false);
      }

      // First point is start, last point is near end
      expect(points[0].lon).toBeCloseTo(0, 1);
      expect(points[0].lat).toBeCloseTo(0, 1);
      expect(Math.abs(points[points.length - 1].lon)).toBeCloseTo(180, 1);
      expect(points[points.length - 1].lat).toBeCloseTo(0, 1);

      // Midpoint (step 30) should not collapse to 0,0,0 or NaN
      const mid = points[Math.floor(steps / 2)];
      expect(Number.isFinite(mid.lon)).toBe(true);
      expect(Number.isFinite(mid.lat)).toBe(true);
    });

    it('ANTIPODE-02: handles Honolulu to Botswana antipode coordinates without collapse', () => {
      // Honolulu: (-157.8583, 21.3069)
      // Antipode in Botswana: (22.1417, -21.3069)
      const steps = 40;
      const points = sampleGreatCircleGeodesic(
        { lon: -157.8583, lat: 21.3069 },
        { lon: 22.1417, lat: -21.3069 },
        steps
      );

      expect(points.length).toBe(steps + 1);
      for (const pt of points) {
        expect(Number.isFinite(pt.lon)).toBe(true);
        expect(Number.isFinite(pt.lat)).toBe(true);
      }
      expect(points[0].lon).toBeCloseTo(-157.8583, 2);
      expect(points[0].lat).toBeCloseTo(21.3069, 2);
      expect(points[points.length - 1].lon).toBeCloseTo(22.1417, 2);
      expect(points[points.length - 1].lat).toBeCloseTo(-21.3069, 2);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Camera Easing on Geodesic Feeds
  // --------------------------------------------------------------------------
  describe('2. Camera Easing on Geodesic Feeds', () => {
    it('CAMERA-01: invokes easeToCoordinates with framing zoom R ≈ 14.0 on geodesic preset selection', async () => {
      const easeToCoordinatesMock = vi.fn();
      (window as any).__INDICATRIX_CAMERA__ = {
        easeToCoordinates: easeToCoordinatesMock,
      };

      await act(async () => {
        root.render(<UnifiedRightSidebar {...createSidebarProps()} />);
      });

      // Find Geodesic buttons
      const buttons = container.querySelectorAll('button');
      const conveyorBtn = Array.from(buttons).find((b) => b.textContent?.includes('Conveyor'));
      const migrationBtn = Array.from(buttons).find((b) => b.textContent?.includes('Migration'));
      const antipodesBtn = Array.from(buttons).find((b) => b.textContent?.includes('Antipodes'));

      expect(conveyorBtn).toBeDefined();
      expect(migrationBtn).toBeDefined();
      expect(antipodesBtn).toBeDefined();

      // Click Conveyor
      await act(async () => {
        conveyorBtn!.click();
      });
      expect(easeToCoordinatesMock).toHaveBeenCalledWith(-165.0, 10.0, 14.0, 1.4);

      // Click Migration
      await act(async () => {
        migrationBtn!.click();
      });
      expect(easeToCoordinatesMock).toHaveBeenCalledWith(-175.0, 15.0, 14.0, 1.4);

      // Click Antipodes
      await act(async () => {
        antipodesBtn!.click();
      });
      expect(easeToCoordinatesMock).toHaveBeenCalledWith(-65.0, 0.0, 14.0, 1.4);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Volumetric Cloud Layer Coupling
  // --------------------------------------------------------------------------
  describe('3. Volumetric Cloud Layer Coupling', () => {
    it('CLOUD-01: invokes onShowCloudsChange(true) when noaa-gfs-clouds is added from catalog', async () => {
      const showCloudsChangeMock = vi.fn();
      const addDataLayerMock = vi.fn();

      await act(async () => {
        root.render(
          <UnifiedRightSidebar
            {...createSidebarProps({
              onAddDataLayer: addDataLayerMock,
              onShowCloudsChange: showCloudsChangeMock,
            })}
          />
        );
      });

      // Open catalog modal via "+ Catalog" button
      const openCatalogBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('+ Catalog')
      );
      expect(openCatalogBtn).toBeDefined();

      await act(async () => {
        openCatalogBtn!.click();
      });

      // Find the Add Layer button for NOAA GFS Cloud Top Height
      const modalBtns = Array.from(container.querySelectorAll('button'));
      const addCloudBtn = modalBtns.find(
        (b) =>
          b.textContent?.includes('Add Layer') &&
          b.closest('div')?.parentElement?.textContent?.includes('Atmospheric Cloud Strata')
      );
      expect(addCloudBtn).toBeDefined();

      await act(async () => {
        addCloudBtn!.click();
      });

      expect(showCloudsChangeMock).toHaveBeenCalledWith(true);
      expect(addDataLayerMock).toHaveBeenCalled();
      const addedLayer = addDataLayerMock.mock.calls[0][0];
      expect(addedLayer.id).toBe('noaa-gfs-clouds');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Lifecycle Teardown Hooks
  // --------------------------------------------------------------------------
  describe('4. Lifecycle Teardown Hooks', () => {
    it('TEARDOWN-02: WebGPUEngine unbinds precipitation ring buffer cleanly', () => {
      const engine = new WebGPUEngine();
      const mockRing = {
        label: 'radar_ring',
        disposed: false,
        getTextureView: () => ({ label: 'mock_view' }),
      } as any;

      engine.setPrecipitationRingBuffer(mockRing);
      expect((engine as any).precipRingBuffer).toBe(mockRing);

      engine.setPrecipitationRingBuffer(null);
      expect((engine as any).precipRingBuffer).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Auto-Switch Prognostic Model on Catalog Add
  // --------------------------------------------------------------------------
  describe('5. Auto-Switch Prognostic Model on Catalog Add', () => {
    it('PROGNOSTIC-01: App.tsx contains handleAddDataLayerWithModelSync synchronizing google-weathernext3', () => {
      const appPath = path.resolve(__dirname, '../../src/App.tsx');
      const appSource = fs.readFileSync(appPath, 'utf8');

      expect(appSource).toContain('handleAddDataLayerWithModelSync');
      expect(appSource).toContain("layer.id === 'google-weathernext3'");
      expect(appSource).toContain("setPrognosticModel('google-weathernext3')");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Horizon Cross-Section Preset Scaling
  // --------------------------------------------------------------------------
  describe('6. Horizon Cross-Section Preset Scaling', () => {
    it('HORIZON-01: AtmosphereDrawer unconditionally sets atmospheric scale to 6.0x on preset click', async () => {
      const scaleChangeMock = vi.fn();
      const toggleCloudsMock = vi.fn();

      await act(async () => {
        root.render(
          <AtmosphereDrawer
            theme={0}
            showClouds={true}
            cloudDriftSpeed={1.0}
            atmosphericScale={1.0}
            onAtmosphericScaleChange={scaleChangeMock}
            onShowCloudsChange={toggleCloudsMock}
          />
        );
      });

      const presetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Horizon Cross-Section')
      );
      expect(presetBtn).toBeDefined();

      await act(async () => {
        presetBtn!.click();
      });

      // Must be called with 6.0 unconditionally
      expect(scaleChangeMock).toHaveBeenCalledWith(6.0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Curator's Colophon Live Provenance Badges
  // --------------------------------------------------------------------------
  describe('7. Curator\'s Colophon Live Provenance Badges', () => {
    it('COLOPHON-01: renders [WEATHERNEXT: ACTIVE] and [RADAR: ACTIVE] when active', async () => {
      await act(async () => {
        root.render(
          <CuratorsColophon
            theme={0}
            isWeatherActive={true}
            isRadarActive={true}
          />
        );
      });

      const weatherBadge = container.querySelector('[data-testid="colophon-badge-weathernext"]');
      const radarBadge = container.querySelector('[data-testid="colophon-badge-radar"]');

      expect(weatherBadge).not.toBeNull();
      expect(weatherBadge?.textContent).toContain('[WEATHERNEXT: ACTIVE]');

      expect(radarBadge).not.toBeNull();
      expect(radarBadge?.textContent).toContain('[RADAR: ACTIVE]');
    });

    it('COLOPHON-02: hides badges when weather and radar are inactive', async () => {
      await act(async () => {
        root.render(
          <CuratorsColophon
            theme={0}
            isWeatherActive={false}
            isRadarActive={false}
          />
        );
      });

      expect(container.querySelector('[data-testid="colophon-badge-weathernext"]')).toBeNull();
      expect(container.querySelector('[data-testid="colophon-badge-radar"]')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 8. Timeline Radar Nowcast Inline Feedback & Prompt
  // --------------------------------------------------------------------------
  describe('8. Timeline Radar Nowcast Inline Feedback & Prompt', () => {
    it('TIMELINE-01: renders inline warning and Enable Radar button when scrubbing past nowcast without radar', async () => {
      const enableRadarMock = vi.fn();

      await act(async () => {
        root.render(
          <TimelineScrubber
            value={-30}
            onTimeChange={vi.fn()}
            isRadarActive={false}
            onEnableRadar={enableRadarMock}
          />
        );
      });

      const prompt = container.querySelector('[data-testid="radar-nowcast-prompt"]');
      expect(prompt).not.toBeNull();
      expect(prompt?.textContent).toContain('Doppler radar layer required');

      const enableBtn = prompt?.querySelector('button');
      expect(enableBtn).toBeDefined();
      expect(enableBtn?.textContent).toContain('Enable Radar');

      await act(async () => {
        enableBtn!.click();
      });

      expect(enableRadarMock).toHaveBeenCalledTimes(1);
    });

    it('TIMELINE-02: hides warning when value >= 0 or isRadarActive is true', async () => {
      await act(async () => {
        root.render(
          <TimelineScrubber
            value={120}
            onTimeChange={vi.fn()}
            isRadarActive={false}
          />
        );
      });
      expect(container.querySelector('[data-testid="radar-nowcast-prompt"]')).toBeNull();

      await act(async () => {
        root.render(
          <TimelineScrubber
            value={-30}
            onTimeChange={vi.fn()}
            isRadarActive={true}
          />
        );
      });
      expect(container.querySelector('[data-testid="radar-nowcast-prompt"]')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 9. Layer Stack & Blend SegmentedControl Scalability
  // --------------------------------------------------------------------------
  describe('9. Layer Stack & Blend SegmentedControl Scalability', () => {
    it('BLEND-01: renders SegmentedControl for blend mode and propagates changes', async () => {
      const blendModeChangeMock = vi.fn();
      const testLayers: DataLayerItem[] = [
        {
          id: 'global-dem-crust',
          name: 'Global DEM Crust',
          category: 'topo',
          type: 'DEM Crust',
          details: 'Global topography',
          visible: true,
          opacity: 0.85,
          blendMode: 0,
          renderStyle: 'relief' as any,
        },
      ];

      await act(async () => {
        root.render(
          <UnifiedRightSidebar
            {...createSidebarProps({
              dataLayers: testLayers,
              onBlendModeChangeDataLayer: blendModeChangeMock,
            })}
          />
        );
      });

      // Find radio buttons for blend mode
      const radioButtons = container.querySelectorAll('button[role="radio"]');
      const addRadio = Array.from(radioButtons).find((b) => b.textContent === 'Add');
      expect(addRadio).toBeDefined();

      await act(async () => {
        (addRadio as HTMLButtonElement)!.click();
      });

      expect(blendModeChangeMock).toHaveBeenCalledWith('global-dem-crust', 1);
    });
  });

  // --------------------------------------------------------------------------
  // 10. Data Catalog Cleanliness & Asset Parity
  // --------------------------------------------------------------------------
  describe('10. Data Catalog Cleanliness & Asset Parity', () => {
    it('CATALOG-01: public/data/wind-grib2.json exists and is valid JSON', () => {
      const windJsonPath = path.resolve(__dirname, '../../public/data/wind-grib2.json');
      expect(fs.existsSync(windJsonPath)).toBe(true);

      const content = fs.readFileSync(windJsonPath, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed).toBeDefined();
      expect(parsed.source).toContain('NOAA NCEP Global Forecast System');
      expect(parsed.binaryGridUrl).toBe('/data/gfs-wind-latest.bin');
      expect(parsed.gridDimensions?.resolutionDeg).toBe(0.25);
    });

    it('CATALOG-02: DATA_LAYER_CATALOG has unique IDs across all entries', () => {
      const ids = DATA_LAYER_CATALOG.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });
});
