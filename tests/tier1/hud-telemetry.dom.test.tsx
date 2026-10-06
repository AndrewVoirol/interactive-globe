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
    mode: 3 as SimulationMode,
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



  it('DOM-HUD-04: verifies backend switch button is excised from UnifiedRightSidebar', async () => {
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
    const backendBtn = buttons.find(b => b.textContent?.includes('WebGL2') || b.textContent?.includes('WebGPU ⇄'));
    expect(backendBtn).toBeUndefined();
    expect(onBackendChange).not.toHaveBeenCalled();
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

  it('DOM-HUD-07: displays active projection manifold badge synchronized with dock authority', async () => {
    const props = createProps({ mode: 2 });

    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    expect(container.textContent).toContain('Active Manifold');
    expect(container.textContent).toContain('Mode III · Fracture');
    expect(container.textContent).toContain('Synchronized');
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


  it('DOM-HUD-10: unified sidebar displays persistent Medium substrate and consolidated tabs (CARTOGRAPHY, ATMOSPHERE, KINEMATICS, DATA)', async () => {
    const props = createProps();
    await act(async () => {
      root.render(<TelemetryHUD {...props} />);
    });

    // After Phase 5 UX ergonomics refactor: 4 plates: CARTOGRAPHY, ATMOSPHERE, KINEMATICS, DATA
    expect(container.textContent).toContain('Medium');
    expect(container.textContent).toContain('CARTOGRAPHY');
    expect(container.textContent).toContain('ATMOSPHERE');
    expect(container.textContent).toContain('KINEMATICS');
    expect(container.textContent).toContain('DATA');
    expect(container.textContent).toContain('INDICATRIX // CONTROLS');
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

    // Verify Catalog Sheet rendered (title is now just "Catalog" after refactor)
    expect(container.textContent).toContain('Catalog');
    expect(container.textContent).toContain('datasets');

    // Click Add Layer on first available preset
    const addLayerBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Layer'));
    expect(addLayerBtn).toBeDefined();

    await act(async () => {
      addLayerBtn?.click();
    });

    expect(onAddDataLayer).toHaveBeenCalled();
    // Verify sheet remains open
    expect(container.textContent).toContain('Catalog');
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

    // Catalog sheet title is now "Catalog" after refactor
    expect(container.textContent).toContain('datasets');

    // Find Close button
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b => b.title?.includes('Close Catalog Sheet'));
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn?.click();
    });

    // After closing, the catalog section should not show dataset count
    const catalogSection = container.querySelector('[class*="slide-in-from-right"]');
    expect(catalogSection).toBeNull();
  });
});
