// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/sidebar-hud-ergonomics-and-provenance.test.tsx
// Verification suite for:
// 1. TelemetryHUD forwarding onPaperToothChangeDataLayer
// 2. CuratorsColophon provenance rendering
// 3. UnifiedRightSidebar dedicated DATA tab, Plate 2/3/4/5 ergonomics, pinned footer
// 4. Header theme toggle synchronization of calibrated relief parameters
// 5. Excision of 2D canvas cartouche
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { CuratorsColophon } from '../../src/components/hud/CuratorsColophon';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { TelemetryHUD, TelemetryHUDProps } from '../../src/components/hud/TelemetryHUD';
import { DataLayerItem, SimulationMode, GeodesicOverlayMode, LoadedDataInfo } from '../../src/types';
import { useCameraKinematics } from '../../src/hooks/useCameraKinematics';
import { BathymetricTideGauge } from '../../src/components/hud/instruments/BathymetricTideGauge';
import { TactileSelect } from '../../src/components/ui/TactileSelect';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Sidebar HUD Ergonomics & Data Provenance Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const sidebarSource = fs.readFileSync(path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx'), 'utf-8');
  const canvasSource = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'), 'utf-8');
  const telemetrySource = fs.readFileSync(path.join(projectRoot, 'src/components/hud/TelemetryHUD.tsx'), 'utf-8');

  let container: HTMLDivElement;
  let root: Root;

  const defaultDataInfo: LoadedDataInfo = {
    pointCount: 100000,
    lineCount: 300000,
    format: 'BIN (Zero-Copy)',
    loadTimeMs: 12.5,
    vramMb: 4.57,
  };

  const dummyLayer: DataLayerItem = {
    id: 'hybrid-crust-hydrosphere',
    name: 'Hybrid Crust Hydrosphere',
    category: 'topo',
    type: 'Hypsometric Topography & Bathymetry',
    details: 'Calibrated DEM',
    visible: true,
    opacity: 0.9,
    blendMode: 0,
    renderStyle: 'hybrid',
    displacementScale: 0.12,
  };

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
    showVectors: false,
    onVectorsToggle: vi.fn(),
    alpha: 0,
    fps: 120,
    latStr: "00°00'N",
    lonStr: "000°00'E",
    mapScaleStr: "1:50M",
    onSnapCamera: vi.fn(),
    dataLayers: [dummyLayer],
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
  // 1. TelemetryHUD Prop Forwarding
  // --------------------------------------------------------------------------
  describe('1. TelemetryHUD Prop Forwarding', () => {
    it('verifies TelemetryHUD forwards onPaperToothChangeDataLayer to UnifiedRightSidebar', () => {
      expect(telemetrySource).toContain('onPaperToothChangeDataLayer={props.onPaperToothChangeDataLayer}');
    });

    it('DOM: dispatches onPaperToothChangeDataLayer through TelemetryHUD to UnifiedRightSidebar', async () => {
      const onPaperToothMock = vi.fn();
      const dummyItem: DataLayerItem = {
        id: 'hybrid-crust-hydrosphere',
        name: 'Hybrid Crust Hydrosphere',
        category: 'topo',
        type: 'Hypsometric Topography & Bathymetry',
        details: 'Calibrated DEM',
        visible: true,
        opacity: 0.9,
        blendMode: 0,
        renderStyle: 'hybrid',
        displacementScale: 0.12,
        paperTooth: 0.40,
      };

      const props: TelemetryHUDProps = {
        isZenMode: false,
        onZenToggle: vi.fn(),
        theme: 1, // Cream Rag
        onThemeToggle: vi.fn(),
        backend: 'webgpu',
        onBackendChange: vi.fn(),
        hasWebGPU: true,
        resolution: '1M',
        onResolutionChange: vi.fn(),
        layerMode: 0,
        onLayerModeChange: vi.fn(),
        mode: 0 as SimulationMode,
        onModeChange: vi.fn(),
        cursorPhysicsEnabled: false,
        onCursorPhysicsToggle: vi.fn(),
        activeOverlay: 'off' as GeodesicOverlayMode,
        onOverlayChange: vi.fn(),
        showLandmarks: false,
        onLandmarksToggle: vi.fn(),
        showTissot: false,
        onTissotToggle: vi.fn(),
        showVectors: false,
        onVectorsToggle: vi.fn(),
        alpha: 0,
        fps: 120,
        latStr: "00°00'N",
        lonStr: "000°00'E",
        mapScaleStr: "1:50M",
        dataInfo: defaultDataInfo,
        onSnapCamera: vi.fn(),
        dataLayers: [dummyItem],
        onPaperToothChangeDataLayer: onPaperToothMock,
      };

      await act(async () => {
        root.render(<TelemetryHUD {...props} />);
      });

      const paperToothInput = container.querySelector('#sidebar-paper-tooth') as HTMLInputElement;
      expect(paperToothInput).not.toBeNull();

      const increaseBtn = container.querySelector('button[title="Increase Paper Grain"]') as HTMLButtonElement;
      expect(increaseBtn).not.toBeNull();

      await act(async () => {
        increaseBtn.click();
      });

      // Starting from default 0.40 + step 0.05 = 0.45
      expect(onPaperToothMock).toHaveBeenCalledWith('hybrid-crust-hydrosphere', 0.45);
    });
  });

  // --------------------------------------------------------------------------
  // 2. CuratorsColophon Verified Data Feeds
  // --------------------------------------------------------------------------
  describe('2. CuratorsColophon', () => {
    it('renders provenance feeds with data sources', async () => {
      await act(async () => {
        root.render(
          <CuratorsColophon
            theme={1}
            isWeatherActive={true}
            isRadarActive={true}
          />
        );
      });

      expect(container.textContent).toContain("Curator's Colophon");
      expect(container.textContent).toContain('Provenance');
      expect(container.textContent).toContain('NOAA ETOPO 2022');
      expect(container.textContent).toContain('WeatherNext 3');
      expect(container.textContent).toContain('RainViewer Radar');
      expect(container.textContent).toContain('Natural Earth');
    });

    it('renders medium and projection state', async () => {
      await act(async () => {
        root.render(
          <CuratorsColophon
            theme={1}
            mode={0}
            alpha={0.5}
            isWeatherActive={true}
            isRadarActive={true}
          />
        );
      });

      expect(container.textContent).toContain("Curator's Colophon");
      expect(container.textContent).toContain('Cotton Rag');
      expect(container.textContent).toContain('Linear');
      expect(container.textContent).toContain('Morph');
    });
  });

  // --------------------------------------------------------------------------
  // 3. UnifiedRightSidebar Navigation & Plates
  // --------------------------------------------------------------------------
  describe('3. UnifiedRightSidebar Ergonomics & Tabs', () => {
    it('contains DATA in the 2-tab navigation strip and SidebarPlate type', () => {
      expect(sidebarSource).toContain("type SidebarPlate = 'scene' | 'data'");
      expect(sidebarSource).toMatch(/\{\s*id:\s*'data',\s*label:\s*'DATA'\s*\}/);
    });

    it('uses "Crevice Depth" label', () => {
      expect(sidebarSource).toContain('label="Crevice Depth"');
      expect(sidebarSource).not.toContain('label="Crevice AO:"');
    });

    it('renders projection modes with short labels', () => {
      expect(sidebarSource).toContain("'Linear'");
      expect(sidebarSource).toContain("'Scroll'");
      expect(sidebarSource).toContain("'Fracture'");
      expect(sidebarSource).toContain("'Fluid'");
      expect(sidebarSource).toContain("'Dymaxion'");
    });

    it('does not contain removed features (Base Lattice, pinned footer, compact colophon)', () => {
      expect(sidebarSource).not.toContain('Base Lattice:');
      expect(sidebarSource).not.toContain('Pinned Footer');
      expect(sidebarSource).not.toContain('compact={true}');
    });

    it('header theme toggle synchronizes calibrated relief parameters', () => {
      expect(sidebarSource).toContain('onClick={handleHeaderThemeToggle}');
      expect(sidebarSource).toContain('applyMediumCalibration(nextTheme)');
    });
  });

  // --------------------------------------------------------------------------
  // 4. 2D Canvas Cartouche Permanent Excision
  // --------------------------------------------------------------------------
  describe('4. 2D Canvas Cartouche Permanent Excision', () => {
    it('verifies 2D canvas cartouche drawing is completely removed from WebGPUCanvas', () => {
      expect(canvasSource).not.toContain('TYPUS ORBIS TERRARUM');
      expect(canvasSource).not.toMatch(/cy\s*=\s*h\s*-\s*92/);
      expect(canvasSource).not.toMatch(/ch\s*=\s*72/);
      expect(canvasSource).not.toContain('curShowCartouche');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Interactive Behavior Verification
  // --------------------------------------------------------------------------
  describe('5. Interactive Theme Calibration & Sidebar Execution', () => {

    it('switches between plates in DOM across tabs', async () => {
      const props = createSidebarProps({ theme: 1 });

      await act(async () => {
        root.render(<UnifiedRightSidebar {...props} />);
      });

      const tabs = Array.from(container.querySelectorAll('button'));
      const sceneTab = tabs.find((b) => b.textContent?.trim() === 'SCENE');
      const dataTab = tabs.find((b) => b.textContent?.trim() === 'DATA');

      expect(sceneTab).not.toBeUndefined();
      expect(dataTab).not.toBeUndefined();

      // Default SCENE tab: scene tab is active, scene panel is visible
      expect(sceneTab?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(dataTab?.className).not.toContain('bg-[var(--theme-control-active-bg)]');

      const panels = container.querySelectorAll('.scroll-fade-mask > div');
      expect(panels.length).toBe(2);
      expect(panels[0].className).not.toContain('hidden');
      expect(panels[1].className).toContain('hidden');

      // Click DATA tab: displays Data plate and hides Scene plate
      await act(async () => {
        dataTab?.click();
      });

      expect(dataTab?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(sceneTab?.className).not.toContain('bg-[var(--theme-control-active-bg)]');
      expect(panels[0].className).toContain('hidden');
      expect(panels[1].className).not.toContain('hidden');

      // Click SCENE tab: displays Scene plate and hides Data plate
      await act(async () => {
        sceneTab?.click();
      });

      expect(sceneTab?.className).toContain('bg-[var(--theme-control-active-bg)]');
      expect(dataTab?.className).not.toContain('bg-[var(--theme-control-active-bg)]');
      expect(panels[0].className).not.toContain('hidden');
      expect(panels[1].className).toContain('hidden');
    });

    it('Plate 5 renders Opacity label with correct typography and prunes redundant relief sliders', async () => {
      const props = createSidebarProps({ theme: 1 });

      await act(async () => {
        root.render(<UnifiedRightSidebar {...props} />);
      });

      // Switch to DATA tab
      const dataTab = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'DATA');
      await act(async () => {
        dataTab?.click();
      });

      // Find the layer accordion expand chevron
      const chevronBtn = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
      expect(chevronBtn).not.toBeNull();

      await act(async () => {
        chevronBtn.click();
      });

      // Check Opacity typography
      const opacitySpan = Array.from(container.querySelectorAll('span')).find((s) => s.textContent?.trim() === 'Opacity:');
      expect(opacitySpan).not.toBeUndefined();
      expect(opacitySpan?.className).toContain('text-[var(--theme-text-secondary)]');

      // Check Blend Mode control
      expect(container.textContent).toContain('Norm');
      expect(container.textContent).toContain('Add');
      expect(container.textContent).toContain('Mult');
      expect(container.textContent).toContain('Scrn');

      // Check that redundant per-layer sliders are pruned from the layer folio
      expect(container.querySelector('input[name*="layerSeaLevel"]')).toBeNull();
      expect(container.querySelector('input[name*="layerClarity"]')).toBeNull();
      expect(container.querySelector('input[name*="layerPeakSharp"]')).toBeNull();
    });

    it('executes handleHeaderThemeToggle and dispatches calibrated params', async () => {
      const onThemeToggleMock = vi.fn();
      const onHillshadeMock = vi.fn();
      const onDisplacementMock = vi.fn();
      const onPeakExponentMock = vi.fn();

      const defaultProps = createSidebarProps({
        theme: 0,
        onThemeToggle: onThemeToggleMock,
        onHillshadeChangeDataLayer: onHillshadeMock,
        onDisplacementScaleChangeDataLayer: onDisplacementMock,
        onPeakExponentChangeDataLayer: onPeakExponentMock,
      });

      await act(async () => {
        root.render(<UnifiedRightSidebar {...defaultProps} />);
      });

      const themeBtn = container.querySelector('button[title*="Switch to Cream Rag"]') as HTMLButtonElement;
      expect(themeBtn).not.toBeNull();

      await act(async () => {
        themeBtn.click();
      });

      expect(onThemeToggleMock).toHaveBeenCalledTimes(1);
      // Switching from theme 0 to nextTheme 1 applies Cream Rag calibrated relief
      expect(onHillshadeMock).toHaveBeenCalledWith('hybrid-crust-hydrosphere', 315, 0.7, 45);
      expect(onDisplacementMock).toHaveBeenCalledWith('hybrid-crust-hydrosphere', 0.14);
      expect(onPeakExponentMock).toHaveBeenCalledWith('hybrid-crust-hydrosphere', 1.6);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Stage 2 Camera Snap & BathymetricTideGauge Keyboard Accessibility
  // --------------------------------------------------------------------------
  describe('6. Stage 2 Camera Snap & BathymetricTideGauge Keyboard Accessibility', () => {
    it('verifies UnifiedRightSidebar renders all 5 camera snap buttons including Horizon', async () => {
      const onSnapMock = vi.fn();
      const defaultProps = createSidebarProps({
        onSnapCamera: onSnapMock,
      });

      await act(async () => {
        root.render(<UnifiedRightSidebar {...defaultProps} />);
      });

      const buttons = Array.from(container.querySelectorAll('#sidebar-panel-scene button')).filter((b) =>
        ['Equator', 'Pole', 'Seam', 'Iso', 'Horizon'].includes(b.textContent?.trim() || '')
      );
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Equator', 'Pole', 'Seam', 'Iso', 'Horizon']);

      const horizonBtn = buttons.find((b) => b.textContent?.trim() === 'Horizon');
      expect(horizonBtn).not.toBeUndefined();

      await act(async () => {
        horizonBtn?.click();
      });
      expect(onSnapMock).toHaveBeenCalledWith('horizon');
    });

    it('verifies useCameraKinematics handles horizon camera view', () => {
      let resultHook: ReturnType<typeof useCameraKinematics> | null = null;
      function TestComp() {
        resultHook = useCameraKinematics();
        return null;
      }
      act(() => {
        root.render(<TestComp />);
      });

      expect(resultHook).not.toBeNull();
      act(() => {
        resultHook!.snapCamera('horizon');
      });

      expect(resultHook!.targetCameraPos).toEqual([0.55, 3.66, 3.68]);
      expect(resultHook!.webgpuCameraPos).toEqual([0.55, 3.66, 3.68]);
      expect(resultHook!.cameraTarget).toEqual([0, 0, 0]);
    });

    it('verifies BathymetricTideGauge has accessible role=slider and keyboard navigation', async () => {
      const onSeaLevelMock = vi.fn();
      await act(async () => {
        root.render(
          <BathymetricTideGauge
            seaLevelOffset={0}
            waterClarity={0.75}
            onSeaLevelChange={onSeaLevelMock}
            theme={1}
          />
        );
      });

      const slider = container.querySelector('[aria-label="Bathymetric Sea Level Gauge"]') as HTMLElement;
      expect(slider).not.toBeNull();
      expect(slider.getAttribute('role')).toBe('slider');
      expect(slider.getAttribute('tabindex')).toBe('0');
      expect(slider.getAttribute('aria-valuemin')).toBe('-150');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
      expect(slider.getAttribute('aria-valuenow')).toBe('0');

      // ArrowUp nudges +5m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(5);

      // ArrowRight nudges +5m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(5);

      // ArrowDown nudges -5m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(-5);

      // ArrowLeft nudges -5m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(-5);

      // PageUp nudges +20m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(20);

      // PageDown nudges -20m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(-20);

      // Home sets -150m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(-150);

      // End sets +100m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(100);

      // Enter resets to 0m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(0);

      // Space resets to 0m
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(onSeaLevelMock).toHaveBeenCalledWith(0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. TactileSelect Component & Demo Mode Integration
  // --------------------------------------------------------------------------
  describe('7. TactileSelect Component & Demo Mode Integration', () => {
    const mockOptions = [
      { id: 'hawaii', label: 'Hawaii', coordinates: "19°49'N 155°28'W", description: 'Volcanic hotspot' },
      { id: 'cape-cod', label: 'Cape Cod', coordinates: "41°54'N 70°03'W", description: 'Coastal spit' },
      { id: 'grand-canyon', label: 'Grand Canyon', coordinates: "36°06'N 112°06'W", description: 'Riparian orogeny' },
      { id: 'fuji', label: 'Mount Fuji', coordinates: "35°21'N 138°43'E", description: 'Stratovolcano' },
    ];

    it('renders trigger button with coordinates and ARIA combobox semantics', async () => {
      const onChangeMock = vi.fn();
      await act(async () => {
        root.render(
          <TactileSelect
            id="test-tactile-select"
            value="hawaii"
            options={mockOptions}
            onChange={onChangeMock}
            ariaLabel="Test Select"
          />
        );
      });

      const button = container.querySelector('#test-tactile-select') as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(button.getAttribute('role')).toBe('combobox');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.getAttribute('aria-haspopup')).toBe('listbox');
      expect(button.getAttribute('aria-controls')).toBe('test-tactile-select-listbox');
      expect(button.textContent).toContain('Hawaii');
      expect(button.textContent).toContain("19°49'N 155°28'W");
    });

    it('opens popover listbox on click with options and metadata', async () => {
      const onChangeMock = vi.fn();
      await act(async () => {
        root.render(
          <TactileSelect
            id="test-tactile-select"
            value="hawaii"
            options={mockOptions}
            onChange={onChangeMock}
          />
        );
      });

      const button = container.querySelector('#test-tactile-select') as HTMLButtonElement;
      await act(async () => {
        button.click();
      });

      expect(button.getAttribute('aria-expanded')).toBe('true');
      const listbox = container.querySelector('#test-tactile-select-listbox');
      expect(listbox).not.toBeNull();
      expect(listbox?.getAttribute('role')).toBe('listbox');

      const optionButtons = Array.from(listbox!.querySelectorAll('[role="option"]'));
      expect(optionButtons.length).toBe(4);
      expect(optionButtons[0].getAttribute('aria-selected')).toBe('true');
      expect(optionButtons[1].getAttribute('aria-selected')).toBe('false');

      // Click option 2
      await act(async () => {
        (optionButtons[1] as HTMLElement).click();
      });
      expect(onChangeMock).toHaveBeenCalledWith('cape-cod');
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('handles keyboard navigation: ArrowDown, ArrowUp, Home, End, Escape', async () => {
      const onChangeMock = vi.fn();
      await act(async () => {
        root.render(
          <TactileSelect
            id="test-tactile-select"
            value="cape-cod"
            options={mockOptions}
            onChange={onChangeMock}
          />
        );
      });

      const trigger = container.querySelector('#test-tactile-select') as HTMLButtonElement;

      // Enter opens
      await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      // ArrowDown advances from cape-cod (index 1) to grand-canyon (index 2)
      await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(onChangeMock).toHaveBeenCalledWith('grand-canyon');

      // ArrowUp retreats
      await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(onChangeMock).toHaveBeenCalledWith('hawaii');

      // Home jumps to first
      await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      });
      expect(onChangeMock).toHaveBeenCalledWith('hawaii');

      // End jumps to last
      await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      });
      expect(onChangeMock).toHaveBeenCalledWith('fuji');

      // Escape closes
      await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
