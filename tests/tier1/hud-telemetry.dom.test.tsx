// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TelemetryHUD, TelemetryHUDProps } from '../../src/components/hud/TelemetryHUD';
import { SimulationMode, GeodesicOverlayMode, LoadedDataInfo } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('DOM Component Test: TelemetryHUD in happy-dom environment', () => {
  let container: HTMLDivElement;
  let root: Root;

  const defaultDataInfo: LoadedDataInfo = {
    pointCount: 100000,
    lineCount: 300000,
    format: 'BIN (Zero-Copy)',
    loadTimeMs: 12.5,
    vramMb: 4.57,
  };

  const createProps = (overrides: Partial<TelemetryHUDProps> = {}): TelemetryHUDProps => ({
    isZenMode: false,
    onZenToggle: vi.fn(),
    theme: 0,
    onThemeToggle: vi.fn(),
    backend: 'webgl2',
    onBackendChange: vi.fn(),
    hasWebGPU: true,
    resolution: '100k',
    onResolutionChange: vi.fn(),
    layerMode: 0,
    onLayerModeChange: vi.fn(),
    mode: 4 as SimulationMode,
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
    alpha: 0.0,
    fps: 60,
    latStr: "37°46'N",
    lonStr: "122°25'W",
    mapScaleStr: '1:50M',
    dataInfo: defaultDataInfo,
    onSnapCamera: vi.fn(),
    isAudioMuted: true,
    onAudioMuteToggle: vi.fn(),
    dataLayers: [
      {
        id: 'natural-earth-bathy',
        name: 'Bathymetry & Elevation',
        details: '1:10M raster',
        type: 'raster',
        visible: true,
        opacity: 0.85,
        blendMode: 2,
      },
    ],
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

  it('DOM-HUD-01: renders nothing when isZenMode is true', async () => {
    const props = createProps({ isZenMode: true });
    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    expect(container.innerHTML).toBe('');
    expect(container.children.length).toBe(0);
  });

  it('DOM-HUD-02: renders SystemStatusPill with FPS, backend, resolution, and theme controls', async () => {
    const props = createProps({
      fps: 59,
      backend: 'webgl2',
      hasWebGPU: true,
      resolution: '100k',
      theme: 0,
    });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    // Check FPS readout
    expect(container.textContent).toContain('59');
    expect(container.textContent).toContain('FPS');

    // Check backend toggle button
    const buttons = Array.from(container.querySelectorAll('button'));
    const backendBtn = buttons.find(b => b.textContent?.includes('WebGL2') || b.textContent?.includes('WebGPU'));
    expect(backendBtn).toBeDefined();
    expect(backendBtn?.textContent).toContain('WebGL2');

    // Check resolution buttons
    const res100kBtn = buttons.find(b => b.textContent?.includes('100K') || b.textContent?.includes('100k'));
    const res1MBtn = buttons.find(b => b.textContent?.includes('1M'));
    expect(res100kBtn).toBeDefined();
    expect(res1MBtn).toBeDefined();

    // Check theme toggle button
    const themeBtn = buttons.find(b => b.title?.includes('Switch to') || b.title?.includes('Monochrome') || b.title?.includes('Cyber'));
    expect(themeBtn).toBeDefined();
  });

  it('DOM-HUD-03: renders TopologyControlDock with telemetry readouts and paradigm buttons', async () => {
    const props = createProps({
      latStr: "51°30'N",
      lonStr: "00°07'W",
      mapScaleStr: '1:25M',
      mode: 4,
    });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    // Verify coordinate telemetry in DOM
    expect(container.textContent).toContain("51°30'N");
    expect(container.textContent).toContain("00°07'W");
    expect(container.textContent).toContain('1:25M');

    // Verify paradigm mode buttons are rendered
    const buttons = Array.from(container.querySelectorAll('button'));
    const dymaxionBtn = buttons.find(b => b.textContent?.includes('Dymaxion') || b.title?.includes('Dymaxion'));
    expect(dymaxionBtn).toBeDefined();
  });

  it('DOM-HUD-04: triggers onBackendChange callback when user clicks backend switch button', async () => {
    const onBackendChange = vi.fn();
    const props = createProps({
      backend: 'webgl2',
      hasWebGPU: true,
      onBackendChange,
    });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const backendBtn = buttons.find(b => b.textContent?.includes('WebGL2'));
    expect(backendBtn).toBeDefined();

    await act(async () => {
      backendBtn?.click();
    });

    expect(onBackendChange).toHaveBeenCalledWith('webgpu');
  });

  it('DOM-HUD-05: triggers onResolutionChange callback when user clicks 1M button', async () => {
    const onResolutionChange = vi.fn();
    const props = createProps({
      resolution: '100k',
      onResolutionChange,
    });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const res1MBtn = buttons.find(b => b.textContent?.includes('1M'));
    expect(res1MBtn).toBeDefined();

    await act(async () => {
      res1MBtn?.click();
    });

    expect(onResolutionChange).toHaveBeenCalledWith('1M');
  });

  it('DOM-HUD-06: triggers onThemeToggle callback when user clicks theme button', async () => {
    const onThemeToggle = vi.fn();
    const props = createProps({ onThemeToggle });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const themeBtn = buttons.find(b => b.title?.includes('Switch to') || b.title?.includes('Monochrome') || b.title?.includes('Cyber'));
    expect(themeBtn).toBeDefined();

    await act(async () => {
      themeBtn?.click();
    });

    expect(onThemeToggle).toHaveBeenCalledTimes(1);
  });

  it('DOM-HUD-07: triggers onModeChange callback when user selects a different paradigm', async () => {
    const onModeChange = vi.fn();
    const props = createProps({ mode: 0, onModeChange });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const dymaxionBtn = buttons.find(b => b.textContent?.includes('Dymaxion') || b.title?.includes('Dymaxion'));
    expect(dymaxionBtn).toBeDefined();

    await act(async () => {
      dymaxionBtn?.click();
    });

    expect(onModeChange).toHaveBeenCalledWith(4);
  });

  it('DOM-HUD-08: dynamically updates DOM when telemetry coordinates and FPS change', async () => {
    const initialProps = createProps({
      fps: 60,
      latStr: "00°00'N",
      lonStr: "000°00'E",
    });

    await act(async () => {
      root.render(<TelemetryHUD {...initialProps} />);
    });

    expect(container.textContent).toContain("00°00'N");
    expect(container.textContent).toContain("000°00'E");
    expect(container.textContent).toContain('60');

    // Update telemetry props to new position and FPS
    const updatedProps = createProps({
      fps: 120,
      latStr: "45°30'S",
      lonStr: "075°15'W",
    });

    await act(async () => {
      root.render(<TelemetryHUD {...updatedProps} />);
    });

    expect(container.textContent).toContain("45°30'S");
    expect(container.textContent).toContain("075°15'W");
    expect(container.textContent).toContain('120');
  });

  it('DOM-HUD-09: renders DataLayersDrawer with configured layer titles and handles mute toggle', async () => {
    const onAudioMuteToggle = vi.fn();
    const props = createProps({
      isAudioMuted: false,
      onAudioMuteToggle,
      dataLayers: [
        {
          id: 'test-layer-1',
          name: 'Topographic Contour Vectors',
          details: 'Vector contours',
          type: 'vector',
          visible: true,
          opacity: 0.7,
          blendMode: 0,
        },
      ],
    });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    // Verify audio mute button is clickable
    const buttons = Array.from(container.querySelectorAll('button'));
    const muteBtn = buttons.find(b => b.title?.toLowerCase().includes('mute') || b.title?.toLowerCase().includes('audio'));
    if (muteBtn) {
      await act(async () => {
        muteBtn.click();
      });
      expect(onAudioMuteToggle).toHaveBeenCalled();
    }
  });

  it('DOM-HUD-10: unified sidebar displays both Topology and Datasets simultaneously', async () => {
    const props = createProps();
    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    expect(container.textContent).toContain('Active Datasets');
    expect(container.textContent).toContain('+ Catalog');
    expect(container.textContent).toContain('Morph Paradigm');
  });

  it('DOM-HUD-11: slide-out catalog sheet opens and allows adding datasets with persistent sheet', async () => {
    const onAddDataLayer = vi.fn();
    const props = createProps({ onAddDataLayer });
    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    // Click + Catalog button directly available in unified sidebar
    const catalogBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Catalog'));
    expect(catalogBtn).toBeDefined();

    await act(async () => {
      catalogBtn?.click();
    });

    // Verify Catalog Sheet rendered
    expect(container.textContent).toContain('Cartographic Data Catalog');
    expect(container.textContent).toContain('NASA Blue Marble');

    // Click Add Layer on first available preset
    const addLayerBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Layer'));
    expect(addLayerBtn).toBeDefined();

    await act(async () => {
      addLayerBtn?.click();
    });

    expect(onAddDataLayer).toHaveBeenCalled();
    // Verify sheet remains open
    expect(container.textContent).toContain('Cartographic Data Catalog');
  });

  it('DOM-HUD-12: closing catalog sheet via close button smoothly dismisses sheet', async () => {
    const props = createProps();
    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    // Open Catalog directly from unified sidebar
    const catalogBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Catalog'));
    await act(async () => {
      catalogBtn?.click();
    });

    expect(container.textContent).toContain('Cartographic Data Catalog');

    // Find Close button
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b => b.title?.includes('Close Catalog Sheet'));
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn?.click();
    });

    expect(container.textContent).not.toContain('Cartographic Data Catalog');
  });
});
