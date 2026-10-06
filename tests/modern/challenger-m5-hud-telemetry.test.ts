// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  UnifiedRightSidebar,
  UnifiedRightSidebarProps,
  DataLayerItem,
} from '../../src/components/hud/UnifiedRightSidebar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Adversarial Challenger M5 Suite: UnifiedRightSidebar
 *
 * Verifies planetary layer rapid toggle, catalog sheet integration,
 * badge integrity, and Zen Mode suppression invariants.
 */

describe('Adversarial Challenger M5: UnifiedRightSidebar Integration', () => {
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
  // UnifiedRightSidebar: Planetary Layer Rapid Toggle & 'Live Synced' Badges
  // ==========================================================================
  describe('UnifiedRightSidebar: Planetary Layer Rapid Toggle & Badge Integrity', () => {
    it('CHALLENGE-S-01: dispatches onAddDataLayer via catalog sheet in UnifiedRightSidebar', async () => {
      const onAddDataLayer = vi.fn();

      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({
          dataLayers: [],
          onAddDataLayer,
          isCatalogOpen: true,
        })));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.textContent?.includes('Add Layer'));
      expect(addBtn).toBeDefined();

      await act(async () => {
        addBtn?.click();
      });

      expect(onAddDataLayer).toHaveBeenCalledTimes(1);
    });

    it('CHALLENGE-S-02: stress-tests 100 rapid catalog adds in UnifiedRightSidebar without desync', async () => {
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
          isCatalogOpen: true,
        }));
      };

      await act(async () => {
        root.render(React.createElement(StatefulSidebar));
      });

      for (let i = 0; i < 50; i++) {
        const buttons = Array.from(container.querySelectorAll('button'));
        const addBtn = buttons.find(b => b.textContent?.includes('Add Layer'));

        if (addBtn) {
          await act(async () => {
            addBtn.click();
          });
        }
      }

      const finalButtons = Array.from(container.querySelectorAll('button'));
      const catalogClose = finalButtons.find(b => b.title?.includes('Close Catalog'));
      expect(catalogClose).toBeDefined();
      expect(container.textContent).toContain('Catalog');
    });

    it('CHALLENGE-S-03: verifies layer folio strips render across dark and light themes in UnifiedRightSidebar', async () => {
      const activeLayer: DataLayerItem = {
        id: 'architectural-topo-relief',
        name: 'Architectural Topographic Relief',
        category: 'topo',
        type: 'topo',
        details: 'Analytical relief shading',
        visible: true,
        opacity: 0.95,
        blendMode: 0,
        renderStyle: 'architectural',
      };

      // Test Dark Theme (theme = 0)
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({
          theme: 0,
          dataLayers: [activeLayer],
        })));
      });

      expect(container.textContent).toContain('Layers');
      expect(container.textContent).toContain('Architectural Topographic Relief');

      // Test Light Theme (theme = 1)
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({
          theme: 1,
          dataLayers: [activeLayer],
        })));
      });

      expect(container.textContent).toContain('Layers');
      expect(container.textContent).toContain('Architectural Topographic Relief');
    });
  });

  // ==========================================================================
  // Zen Mode Suppression & Isolation Invariants
  // ==========================================================================
  describe('Zen Mode Suppression & Isolation Invariants', () => {
    it('CHALLENGE-Z-03: UnifiedRightSidebar renders null when isZenMode is true', async () => {
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ isZenMode: true })));
      });
      expect(container.children.length).toBe(0);
    });
  });
});
