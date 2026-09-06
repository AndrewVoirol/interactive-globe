// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SystemStatusPill, SystemStatusPillProps, TERRAIN_VERTICES } from '../../src/components/hud/SystemStatusPill';
import { DataLayersDrawer, DataLayersDrawerProps, DataLayerItem } from '../../src/components/hud/DataLayersDrawer';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { ResolutionTier, SimulationMode } from '../../src/types';
import { getPresetById, DATA_LAYER_CATALOG } from '../../src/core/data/DataLayerCatalog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Adversarial Challenger M5 Suite: HUD State, Telemetry, and Resolution Switching
 *
 * Requirements & Stress-Testing Scope:
 * 1. SystemStatusPill:
 *    - Rapid clicking across all 6 resolution tiers ('100k', '1M', '3M', '4M', '8M', '16M').
 *    - Format accuracy of 3D terrain vertex counts ('264K Verts' .. '16.78M Verts').
 *    - Accurate decoupling and readout of active compute nodes (1.05M or 4.19M nodes).
 *    - FPS edge rendering (0, 30, 60, 118, 120, 240) and color-coded badge classes.
 * 2. DataLayersDrawer & UnifiedRightSidebar:
 *    - Rapid toggle of planetary layers ('noaa-gfs-wind', 'starlink-iss-orbits').
 *    - Visual integrity, persistence, and non-breaking of 'Live Synced' badges.
 */

describe('Adversarial Challenger M5: HUD State, Telemetry, and Resolution Switching', () => {
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
  });

  // Helper to create baseline SystemStatusPill props
  const createPillProps = (overrides: Partial<SystemStatusPillProps> = {}): SystemStatusPillProps => ({
    fps: 120,
    backend: 'webgpu',
    onBackendChange: vi.fn(),
    hasWebGPU: true,
    resolution: '1M',
    onResolutionChange: vi.fn(),
    theme: 0,
    onThemeToggle: vi.fn(),
    isAudioMuted: true,
    onAudioMuteToggle: vi.fn(),
    ...overrides,
  });

  // Helper to create baseline DataLayersDrawer props
  const createDrawerProps = (overrides: Partial<DataLayersDrawerProps> = {}): DataLayersDrawerProps => ({
    isZenMode: false,
    theme: 0,
    dataLayers: [],
    onAddDataLayer: vi.fn(),
    onToggleDataLayer: vi.fn(),
    onRemoveDataLayer: vi.fn(),
    onOpacityChangeDataLayer: vi.fn(),
    onBlendModeChangeDataLayer: vi.fn(),
    onDisplacementScaleChangeDataLayer: vi.fn(),
    onHillshadeChangeDataLayer: vi.fn(),
    ...overrides,
  });

  // Helper to create baseline UnifiedRightSidebar props
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
    dataLayers: [],
    onAddDataLayer: vi.fn(),
    onToggleDataLayer: vi.fn(),
    onRemoveDataLayer: vi.fn(),
    ...overrides,
  });

  // ==========================================================================
  // 1. SystemStatusPill: Resolution Switching Stress Test
  // ==========================================================================
  describe('1. SystemStatusPill: Rapid Resolution Switching Across All 6 Tiers', () => {
    const ALL_TIERS: ResolutionTier[] = ['100k', '1M', '3M', '4M', '8M', '16M'];

    it('CHALLENGE-P-01: rapid forward and reverse cycling across all 6 resolution tiers triggers correct callbacks', async () => {
      const onResolutionChange = vi.fn();

      // Stateful test component to test real DOM re-rendering
      const StatefulPill = () => {
        const [res, setRes] = useState<ResolutionTier>('100k');
        return React.createElement(SystemStatusPill, createPillProps({
          resolution: res,
          onResolutionChange: (newRes) => {
            onResolutionChange(newRes);
            setRes(newRes);
          }
        }));
      };

      await act(async () => {
        root.render(React.createElement(StatefulPill));
      });

      // Forward cycle
      for (const tier of ALL_TIERS) {
        const buttons = Array.from(container.querySelectorAll('button'));
        const targetBtn = buttons.find(b => b.textContent?.trim().toLowerCase() === tier.toLowerCase());
        expect(targetBtn, `Button for tier ${tier} must exist`).toBeDefined();

        await act(async () => {
          targetBtn?.click();
        });

        expect(onResolutionChange).toHaveBeenLastCalledWith(tier);
      }

      // Reverse cycle
      const reverseTiers = [...ALL_TIERS].reverse();
      for (const tier of reverseTiers) {
        const buttons = Array.from(container.querySelectorAll('button'));
        const targetBtn = buttons.find(b => b.textContent?.trim().toLowerCase() === tier.toLowerCase());
        expect(targetBtn, `Button for tier ${tier} must exist in reverse cycle`).toBeDefined();

        await act(async () => {
          targetBtn?.click();
        });

        expect(onResolutionChange).toHaveBeenLastCalledWith(tier);
      }

      expect(onResolutionChange).toHaveBeenCalledTimes(ALL_TIERS.length * 2);
    });

    it('CHALLENGE-P-02: stress-tests 120 rapid pseudo-random resolution button clicks without state desync or crashes', async () => {
      const onResolutionChange = vi.fn();

      const StatefulPill = () => {
        const [res, setRes] = useState<ResolutionTier>('1M');
        return React.createElement(SystemStatusPill, createPillProps({
          resolution: res,
          onResolutionChange: (newRes) => {
            onResolutionChange(newRes);
            setRes(newRes);
          }
        }));
      };

      await act(async () => {
        root.render(React.createElement(StatefulPill));
      });

      // Execute 120 rapid pseudo-random clicks
      const clickSequence: ResolutionTier[] = [];
      for (let i = 0; i < 120; i++) {
        const tier = ALL_TIERS[i % ALL_TIERS.length];
        clickSequence.push(tier);

        const buttons = Array.from(container.querySelectorAll('button'));
        const targetBtn = buttons.find(b => b.textContent?.trim().toLowerCase() === tier.toLowerCase());

        await act(async () => {
          targetBtn?.click();
        });
      }

      expect(onResolutionChange).toHaveBeenCalledTimes(120);
      const lastTier = clickSequence[clickSequence.length - 1];
      expect(onResolutionChange).toHaveBeenLastCalledWith(lastTier);

      // Verify DOM reflects the final tier
      expect(container.textContent).toContain(TERRAIN_VERTICES[lastTier]);
    });

    it('CHALLENGE-P-03: verifies specific active button highlighting styles across tiers', async () => {
      for (const tier of ALL_TIERS) {
        await act(async () => {
          root.render(React.createElement(SystemStatusPill, createPillProps({ resolution: tier })));
        });

        const buttons = Array.from(container.querySelectorAll('button'));
        const activeBtn = buttons.find(b => b.textContent?.trim().toLowerCase() === tier.toLowerCase());
        expect(activeBtn).toBeDefined();

        if (tier === '16M') {
          expect(activeBtn?.className).toContain('bg-amber-500');
          expect(activeBtn?.className).toContain('text-black');
        } else if (tier === '1M' || tier === '4M') {
          expect(activeBtn?.className).toContain('bg-purple-600');
          expect(activeBtn?.className).toContain('text-white');
        } else {
          // Other active tiers in dark mode
          expect(activeBtn?.className).toContain('bg-white/20');
        }
      }
    });
  });

  // ==========================================================================
  // 2. SystemStatusPill: Terrain Vertex Count Formatting
  // ==========================================================================
  describe('2. SystemStatusPill: Terrain Vertex Count Formatting Matrix', () => {
    const EXPECTED_FORMATS: Record<ResolutionTier, string> = {
      '100k': '264K Verts',
      '1M': '1.05M Verts',
      '3M': '2.99M Verts',
      '4M': '4.20M Verts',
      '8M': '8.40M Verts',
      '16M': '16.78M Verts',
    };

    it('CHALLENGE-P-04: verifies exact terrain vertex formatting for all 6 tiers in SystemStatusPill', async () => {
      for (const [tier, expectedFormat] of Object.entries(EXPECTED_FORMATS) as [ResolutionTier, string][]) {
        await act(async () => {
          root.render(React.createElement(SystemStatusPill, createPillProps({ resolution: tier })));
        });

        expect(container.textContent).toContain(expectedFormat);
        expect(TERRAIN_VERTICES[tier]).toBe(expectedFormat);
      }
    });

    it('CHALLENGE-P-05: verifies mathematical precision of dual-surface grid vertex counts', () => {
      // Formula: 2 surfaces (Lithosphere + Hydrosphere) * (lat + 1) * (lon + 1)
      const testCases = [
        { tier: '100k', lat: 256, lon: 512, expected: 263682, text: '264K Verts' },
        { tier: '1M', lat: 512, lon: 1024, expected: 1051650, text: '1.05M Verts' },
        { tier: '3M', lat: 864, lon: 1728, expected: 2991170, text: '2.99M Verts' },
        { tier: '4M', lat: 1024, lon: 2048, expected: 4200450, text: '4.20M Verts' },
        { tier: '8M', lat: 1448, lon: 2896, expected: 8395506, text: '8.40M Verts' },
        { tier: '16M', lat: 2048, lon: 4096, expected: 16789506, text: '16.78M Verts' },
      ];

      for (const tc of testCases) {
        const count = 2 * (tc.lat + 1) * (tc.lon + 1);
        expect(count).toBe(tc.expected);

        // Verification of lookup table format
        expect(TERRAIN_VERTICES[tc.tier as ResolutionTier]).toBe(tc.text);

        // Both closed-mesh (lat * lon * 2) and seam-duplicated (lat+1)*(lon+1)*2 lie within [16M, 17M]
        if (tc.tier === '16M') {
          const closedCount = 2 * tc.lat * tc.lon;
          expect(closedCount).toBe(16777216);
          expect((closedCount / 1000000).toFixed(2) + 'M Verts').toBe('16.78M Verts');
        }
      }
    });

    it('CHALLENGE-P-06: verifies robust fallback when given an unrecognized resolution tier', async () => {
      await act(async () => {
        root.render(React.createElement(SystemStatusPill, createPillProps({
          resolution: 'invalid-tier' as any,
        })));
      });

      // Default fallback is 1.05M Verts
      expect(container.textContent).toContain('1.05M Verts');
    });
  });

  // ==========================================================================
  // 3. SystemStatusPill: Active Compute Node Count Telemetry
  // ==========================================================================
  describe('3. SystemStatusPill: Active Compute Node Count Telemetry Decoupling', () => {
    it('CHALLENGE-P-07: defaults to 1.05M Nodes on lower tiers and 4.19M Nodes on 4M+ tiers when particleNodes is undefined', async () => {
      const lowTiers: ResolutionTier[] = ['100k', '1M', '3M'];
      for (const tier of lowTiers) {
        await act(async () => {
          root.render(React.createElement(SystemStatusPill, createPillProps({ resolution: tier, particleNodes: undefined })));
        });
        expect(container.textContent).toContain('1.05M Nodes');
      }

      const highTiers: ResolutionTier[] = ['4M', '8M', '16M'];
      for (const tier of highTiers) {
        await act(async () => {
          root.render(React.createElement(SystemStatusPill, createPillProps({ resolution: tier, particleNodes: undefined })));
        });
        expect(container.textContent).toContain('4.19M Nodes');
      }
    });

    it('CHALLENGE-P-08: displays 4.19M Nodes on low resolution tiers when isHighDensityNodes is explicitly true', async () => {
      await act(async () => {
        root.render(React.createElement(SystemStatusPill, createPillProps({
          resolution: '100k',
          isHighDensityNodes: true,
          particleNodes: undefined,
        })));
      });

      expect(container.textContent).toContain('264K Verts');
      expect(container.textContent).toContain('4.19M Nodes');
    });

    it('CHALLENGE-P-09: accurately parses numeric particleNodes with threshold at 4,000,000', async () => {
      // Boundary testing around 4,000,000
      const numericCases = [
        { count: 0, expected: '1.05M Nodes' },
        { count: 1048576, expected: '1.05M Nodes' },
        { count: 3999999, expected: '1.05M Nodes' },
        { count: 4000000, expected: '4.19M Nodes' },
        { count: 4194304, expected: '4.19M Nodes' },
        { count: 16789506, expected: '4.19M Nodes' },
      ];

      for (const tc of numericCases) {
        await act(async () => {
          root.render(React.createElement(SystemStatusPill, createPillProps({
            resolution: '1M',
            particleNodes: tc.count,
          })));
        });
        expect(container.textContent).toContain(tc.expected);
      }
    });

    it('CHALLENGE-P-10: correctly handles string particleNodes without doubling "Nodes"', async () => {
      const stringCases = [
        { input: '1.05M', expected: '1.05M Nodes' },
        { input: '4.19M', expected: '4.19M Nodes' },
        { input: '1.05M Nodes', expected: '1.05M Nodes' },
        { input: '4.19M Nodes', expected: '4.19M Nodes' },
      ];

      for (const tc of stringCases) {
        await act(async () => {
          root.render(React.createElement(SystemStatusPill, createPillProps({
            resolution: '1M',
            particleNodes: tc.input as any,
          })));
        });
        expect(container.textContent).toContain(tc.expected);
        expect(container.textContent).not.toContain('Nodes Nodes');
      }
    });
  });

  // ==========================================================================
  // 4. SystemStatusPill: FPS Edge Values & Color Badge Rendering
  // ==========================================================================
  describe('4. SystemStatusPill: FPS Edge Values and Dynamic Badge Color Matrix', () => {
    it('CHALLENGE-P-11: renders edge FPS values (0, 30, 60, 118, 120, 240) with accurate badge colors', async () => {
      const fpsTestMatrix = [
        {
          fps: 0,
          expectedText: '0 FPS',
          dotColorClass: 'bg-amber-400',
          textColorClass: 'text-amber-400 font-bold',
          hasPulse: false,
        },
        {
          fps: 30,
          expectedText: '30 FPS',
          dotColorClass: 'bg-amber-400',
          textColorClass: 'text-amber-400 font-bold',
          hasPulse: false,
        },
        {
          fps: 54, // Just below 55 threshold
          expectedText: '54 FPS',
          dotColorClass: 'bg-amber-400',
          textColorClass: 'text-amber-400 font-bold',
          hasPulse: false,
        },
        {
          fps: 55, // Exactly at 55 threshold
          expectedText: '55 FPS',
          dotColorClass: 'bg-emerald-400',
          textColorClass: 'text-emerald-400 font-bold',
          hasPulse: true,
        },
        {
          fps: 60,
          expectedText: '60 FPS',
          dotColorClass: 'bg-emerald-400',
          textColorClass: 'text-emerald-400 font-bold',
          hasPulse: true,
        },
        {
          fps: 99, // Just below 100 threshold
          expectedText: '99 FPS',
          dotColorClass: 'bg-emerald-400',
          textColorClass: 'text-emerald-400 font-bold',
          hasPulse: true,
        },
        {
          fps: 100, // Exactly at 100 threshold
          expectedText: '100 FPS',
          dotColorClass: 'bg-purple-400',
          textColorClass: 'text-purple-400 font-bold',
          hasPulse: true,
        },
        {
          fps: 118,
          expectedText: '118 FPS',
          dotColorClass: 'bg-purple-400',
          textColorClass: 'text-purple-400 font-bold',
          hasPulse: true,
        },
        {
          fps: 120,
          expectedText: '120 FPS',
          dotColorClass: 'bg-purple-400',
          textColorClass: 'text-purple-400 font-bold',
          hasPulse: true,
        },
        {
          fps: 240,
          expectedText: '240 FPS',
          dotColorClass: 'bg-purple-400',
          textColorClass: 'text-purple-400 font-bold',
          hasPulse: true,
        },
      ];

      for (const tc of fpsTestMatrix) {
        await act(async () => {
          root.render(React.createElement(SystemStatusPill, createPillProps({ fps: tc.fps })));
        });

        expect(container.textContent).toContain(tc.expectedText);

        const fpsContainer = container.querySelector('.border-r.border-white\\/10');
        expect(fpsContainer, `FPS badge container must exist for ${tc.fps} FPS`).toBeDefined();

        const dotSpan = fpsContainer?.querySelector('span.rounded-full');
        const textSpan = fpsContainer?.querySelector('span:not(.rounded-full)');

        expect(dotSpan?.className).toContain(tc.dotColorClass);
        if (tc.hasPulse) {
          expect(dotSpan?.className).toContain('animate-pulse');
        } else {
          expect(dotSpan?.className).not.toContain('animate-pulse');
        }

        expect(textSpan?.className).toBe(tc.textColorClass);
      }
    });

    it('CHALLENGE-P-12: gracefully renders fractional/decimal FPS without crashing', async () => {
      await act(async () => {
        root.render(React.createElement(SystemStatusPill, createPillProps({ fps: 59.94 })));
      });

      expect(container.textContent).toContain('59.94 FPS');
      const fpsContainer = container.querySelector('.border-r.border-white\\/10');
      const dotSpan = fpsContainer?.querySelector('span.rounded-full');
      expect(dotSpan?.className).toContain('bg-emerald-400');
    });
  });

  // ==========================================================================
  // 5. DataLayersDrawer: Planetary Layer Rapid Toggle & 'Live Synced' Badges
  // ==========================================================================
  describe('5. DataLayersDrawer: Planetary Layer Rapid Toggle & Badge Integrity', () => {
    it('CHALLENGE-D-01: calls onAddDataLayer with valid preset on first click and onToggleDataLayer on subsequent clicks', async () => {
      const onAddDataLayer = vi.fn();
      const onToggleDataLayer = vi.fn();

      await act(async () => {
        root.render(React.createElement(DataLayersDrawer, createDrawerProps({
          dataLayers: [],
          onAddDataLayer,
          onToggleDataLayer,
        })));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const noaaBtn = buttons.find(b => b.textContent?.includes('NOAA Wind'));
      const starlinkBtn = buttons.find(b => b.textContent?.includes('Starlink & ISS'));

      expect(noaaBtn).toBeDefined();
      expect(starlinkBtn).toBeDefined();

      // First click on empty list -> onAddDataLayer
      await act(async () => {
        noaaBtn?.click();
      });

      expect(onAddDataLayer).toHaveBeenCalledTimes(1);
      const addedLayer = onAddDataLayer.mock.calls[0][0];
      expect(addedLayer.id).toBe('noaa-gfs-wind');
      expect(addedLayer.name).toBe('Real NOAA GFS Surface Winds (0.25°)');
      expect(addedLayer.category).toBe('field');
      expect(addedLayer.visible).toBe(true);

      // Now re-render with NOAA in dataLayers -> subsequent click triggers onToggleDataLayer
      await act(async () => {
        root.render(React.createElement(DataLayersDrawer, createDrawerProps({
          dataLayers: [addedLayer],
          onAddDataLayer,
          onToggleDataLayer,
        })));
      });

      const updatedButtons = Array.from(container.querySelectorAll('button'));
      const activeNoaaBtn = updatedButtons.find(b => b.textContent?.includes('NOAA Wind'));

      await act(async () => {
        activeNoaaBtn?.click();
      });

      expect(onToggleDataLayer).toHaveBeenCalledWith('noaa-gfs-wind');
    });

    it('CHALLENGE-D-02: stress-tests 100 rapid alternating toggles between NOAA Wind and Starlink Orbits', async () => {
      // Stateful container simulating the real application state loop
      const StatefulDrawer = () => {
        const [layers, setLayers] = useState<DataLayerItem[]>([]);

        const handleAdd = (layer: DataLayerItem) => {
          setLayers(prev => [...prev, layer]);
        };

        const handleToggle = (id: string) => {
          setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
        };

        return React.createElement(DataLayersDrawer, createDrawerProps({
          dataLayers: layers,
          onAddDataLayer: handleAdd,
          onToggleDataLayer: handleToggle,
        }));
      };

      await act(async () => {
        root.render(React.createElement(StatefulDrawer));
      });

      for (let i = 0; i < 50; i++) {
        const buttons = Array.from(container.querySelectorAll('button'));
        const noaaBtn = buttons.find(b => b.textContent?.includes('NOAA Wind'));
        const starlinkBtn = buttons.find(b => b.textContent?.includes('Starlink & ISS'));

        await act(async () => {
          noaaBtn?.click();
        });

        await act(async () => {
          starlinkBtn?.click();
        });
      }

      // After 50 pairs of clicks (100 clicks total), both layers must be in the list
      // Since 50 is an even number of clicks:
      // Click 1: added (visible: true)
      // Click 2: toggle (visible: false)
      // ...
      // Click 50: toggle (visible: false)
      const finalButtons = Array.from(container.querySelectorAll('button'));
      const finalNoaa = finalButtons.find(b => b.textContent?.includes('NOAA Wind'));
      const finalStarlink = finalButtons.find(b => b.textContent?.includes('Starlink & ISS'));

      // Both buttons still cleanly respond and carry Live Synced indicators
      expect(finalNoaa?.textContent).toContain('Live Synced');
      expect(finalStarlink?.textContent).toContain('Live Synced');
    });

    it('CHALLENGE-D-03: verifies "Live Synced" badges remain visually distinct and unbroken across inactive, active, and catalog states', async () => {
      const activeNoaa: DataLayerItem = {
        id: 'noaa-gfs-wind',
        name: 'Real NOAA GFS Surface Winds (0.25°)',
        category: 'field',
        type: 'field',
        details: 'Global half-float vector grid',
        visible: true,
        opacity: 0.9,
      };

      await act(async () => {
        root.render(React.createElement(DataLayersDrawer, createDrawerProps({
          dataLayers: [activeNoaa],
        })));
      });

      // 1. Header contains 'Live Synced'
      const headerSynced = Array.from(container.querySelectorAll('span')).find(s => s.textContent?.trim() === 'Live Synced');
      expect(headerSynced).toBeDefined();

      // 2. Active NOAA button has active styling
      const buttons = Array.from(container.querySelectorAll('button'));
      const activeNoaaBtn = buttons.find(b => b.textContent?.includes('NOAA Wind'));
      expect(activeNoaaBtn?.className).toContain('border-sky-500/60');
      expect(activeNoaaBtn?.className).toContain('bg-sky-500/20');
      expect(activeNoaaBtn?.className).toContain('shadow-[0_0_10px_rgba(56,189,248,0.25)]');

      // 3. Active stack shows layer with 'Live Synced'
      const activeStack = container.querySelector('.max-h-72');
      expect(activeStack?.textContent).toContain('Live Synced');

      // 4. Open Catalog Sheet and verify catalog items have 'Live Synced' badges
      const catalogBtn = buttons.find(b => b.textContent?.includes('+ Catalog'));
      expect(catalogBtn).toBeDefined();

      await act(async () => {
        catalogBtn?.click();
      });

      expect(container.textContent).toContain('Cartographic Data Catalog');
      const catalogText = container.textContent || '';
      expect(catalogText).toContain('Real NOAA GFS Surface Winds (0.25°)');
      expect(catalogText).toContain('CelesTrak Active Starlink & ISS Orbits');

      // Count 'Live Synced' badges in the entire DOM (header, 2 buttons, active stack, and 2 catalog entries)
      const allSyncedElements = Array.from(container.querySelectorAll('span')).filter(s => s.textContent?.includes('Live Synced'));
      expect(allSyncedElements.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ==========================================================================
  // 6. UnifiedRightSidebar: Planetary Layer Rapid Toggle & 'Live Synced' Badges
  // ==========================================================================
  describe('6. UnifiedRightSidebar: Planetary Layer Rapid Toggle & Badge Integrity', () => {
    it('CHALLENGE-S-01: dispatches onAddDataLayer and onToggleDataLayer for planetary layers in UnifiedRightSidebar', async () => {
      const onAddDataLayer = vi.fn();
      const onToggleDataLayer = vi.fn();

      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({
          dataLayers: [],
          onAddDataLayer,
          onToggleDataLayer,
        })));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const noaaBtn = buttons.find(b => b.textContent?.includes('NOAA Wind'));
      const starlinkBtn = buttons.find(b => b.textContent?.includes('Starlink Orbits'));

      expect(noaaBtn).toBeDefined();
      expect(starlinkBtn).toBeDefined();

      // Click NOAA Wind -> onAddDataLayer
      await act(async () => {
        noaaBtn?.click();
      });

      expect(onAddDataLayer).toHaveBeenCalledTimes(1);
      expect(onAddDataLayer.mock.calls[0][0].id).toBe('noaa-gfs-wind');

      // Click Starlink -> onAddDataLayer
      await act(async () => {
        starlinkBtn?.click();
      });

      expect(onAddDataLayer).toHaveBeenCalledTimes(2);
      expect(onAddDataLayer.mock.calls[1][0].id).toBe('starlink-iss-orbits');
    });

    it('CHALLENGE-S-02: stress-tests 100 rapid toggles in UnifiedRightSidebar without desync', async () => {
      const StatefulSidebar = () => {
        const [layers, setLayers] = useState<DataLayerItem[]>([]);

        const handleAdd = (layer: DataLayerItem) => {
          setLayers(prev => [...prev, layer]);
        };

        const handleToggle = (id: string) => {
          setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
        };

        return React.createElement(UnifiedRightSidebar, createSidebarProps({
          dataLayers: layers,
          onAddDataLayer: handleAdd,
          onToggleDataLayer: handleToggle,
        }));
      };

      await act(async () => {
        root.render(React.createElement(StatefulSidebar));
      });

      for (let i = 0; i < 50; i++) {
        const buttons = Array.from(container.querySelectorAll('button'));
        const noaaBtn = buttons.find(b => b.textContent?.includes('NOAA Wind'));
        const starlinkBtn = buttons.find(b => b.textContent?.includes('Starlink Orbits'));

        await act(async () => {
          noaaBtn?.click();
        });

        await act(async () => {
          starlinkBtn?.click();
        });
      }

      // Verify DOM remains intact with both quick buttons visible
      const finalButtons = Array.from(container.querySelectorAll('button'));
      const finalNoaa = finalButtons.find(b => b.textContent?.includes('NOAA Wind'));
      const finalStarlink = finalButtons.find(b => b.textContent?.includes('Starlink Orbits'));

      expect(finalNoaa).toBeDefined();
      expect(finalStarlink).toBeDefined();
      expect(container.textContent).toContain('Planetary Instrumentation');
    });

    it('CHALLENGE-S-03: verifies "Live Synced" and "Live" badges across dark and light themes in UnifiedRightSidebar', async () => {
      const activeStarlink: DataLayerItem = {
        id: 'starlink-iss-orbits',
        name: 'CelesTrak Active Starlink & ISS Orbits',
        category: 'vectors',
        type: 'vectors',
        details: 'SGP4 propagated orbital ribbons',
        visible: true,
        opacity: 1.0,
      };

      // Test Dark Theme (theme = 0)
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({
          theme: 0,
          dataLayers: [activeStarlink],
        })));
      });

      expect(container.textContent).toContain('Planetary Instrumentation');
      expect(container.textContent).toContain('Live Synced');

      const buttonsDark = Array.from(container.querySelectorAll('button'));
      const activeStarlinkBtnDark = buttonsDark.find(b => b.textContent?.includes('Starlink Orbits'));
      expect(activeStarlinkBtnDark?.className).toContain('border-purple-500/60');
      expect(activeStarlinkBtnDark?.className).toContain('bg-purple-500/20');
      expect(activeStarlinkBtnDark?.className).toContain('ring-purple-400/40');

      // Test Light Theme (theme = 1)
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({
          theme: 1,
          dataLayers: [activeStarlink],
        })));
      });

      expect(container.textContent).toContain('Planetary Instrumentation');
      expect(container.textContent).toContain('Live Synced');
    });
  });

  // ==========================================================================
  // 7. Architectural Constraints & Zen Mode Suppression
  // ==========================================================================
  describe('7. Zen Mode Suppression & Isolation Invariants', () => {
    it('CHALLENGE-Z-01: DataLayersDrawer and UnifiedRightSidebar render null when isZenMode is true', async () => {
      await act(async () => {
        root.render(React.createElement(DataLayersDrawer, createDrawerProps({ isZenMode: true })));
      });
      expect(container.children.length).toBe(0);

      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ isZenMode: true })));
      });
      expect(container.children.length).toBe(0);
    });

    it('CHALLENGE-Z-02: SystemStatusPill remains visible as a safety telemetry anchor even when Zen mode is active', async () => {
      // SystemStatusPill does not have an isZenMode prop and serves as the non-intrusive floating status
      await act(async () => {
        root.render(React.createElement(SystemStatusPill, createPillProps()));
      });
      expect(container.children.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('WebGPU');
    });
  });
});
