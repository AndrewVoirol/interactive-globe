// ============================================================================
// File: tests/tier1/tier1-visual-delight-and-issues.test.ts
// Tier 1 Contract Tests: Visual Polish, Neatline Anti-Collision, Mineral Harmony
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Visual Polish & Cartographic Interaction Delight Tests', () => {
  const appTsxPath = path.resolve(__dirname, '../../src/App.tsx');
  const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
  const drawerPath = path.resolve(__dirname, '../../src/components/hud/DataLayersDrawer.tsx');
  const topologyDockPath = path.resolve(__dirname, '../../src/components/hud/TopologyControlDock.tsx');
  const segmentedControlPath = path.resolve(__dirname, '../../src/components/ui/SegmentedControl.tsx');
  const indexCssPath = path.resolve(__dirname, '../../index.css');
  const atmosphereDrawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');

  const appContent = fs.readFileSync(appTsxPath, 'utf-8');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  const drawerContent = fs.readFileSync(drawerPath, 'utf-8');
  const topologyContent = fs.readFileSync(topologyDockPath, 'utf-8');
  const segmentedContent = fs.readFileSync(segmentedControlPath, 'utf-8');
  const cssContent = fs.readFileSync(indexCssPath, 'utf-8');
  const atmosphereDrawerContent = fs.readFileSync(atmosphereDrawerPath, 'utf-8');

  // --------------------------------------------------------------------------
  // Issue 1: Neatline Coordinate Collisions
  // --------------------------------------------------------------------------
  describe('1. Neatline Coordinate Anti-Collision', () => {
    it('verifies 180.00° label clears the bottom-left Cartouche box', () => {
      expect(appContent).toContain('left-[268px]');
      expect(appContent).toContain('⌞ 180.00°');
    });

    it('verifies 90.00° and 270.00° labels maintain clearance from the right sidebar plate', () => {
      expect(appContent).toContain('md:right-[26rem]');
      expect(appContent).toContain('⌝ 90.00°');
      expect(appContent).toContain('⌟ 270.00°');
    });

    it('verifies neatline corner offsets respond to sidebar active state and zen mode', () => {
      expect(appContent).toContain('isSidebarActive');
      expect(appContent).toContain('isSidebarOpen');
      expect(appContent).toContain('onSidebarOpenChange');
    });
  });

  // --------------------------------------------------------------------------
  // Issue 2: Segmented Control Text Clipping
  // --------------------------------------------------------------------------
  describe('2. Segmented Control Text Clipping', () => {
    it('verifies blend-mode segmented control uses concise "Scrn" with title tooltip', () => {
      // In sidebar
      expect(sidebarContent).toContain("label: 'Scrn'");
      expect(sidebarContent).toContain("title: 'Screen Blend'");
      expect(sidebarContent).not.toMatch(/label:\s*'Screen'/);

      // In data layers drawer
      expect(drawerContent).toContain("label: 'Scrn'");
      expect(drawerContent).toContain("title: 'Screen Blend'");
      expect(drawerContent).not.toMatch(/label:\s*'Screen'/);
    });

    it('verifies SegmentedControl primitive applies tracking-tight and whitespace-nowrap', () => {
      expect(segmentedContent).toContain('whitespace-nowrap');
      expect(segmentedContent).toContain('tracking-tight');
    });
  });

  // --------------------------------------------------------------------------
  // Issue 3: Metric Redundancy
  // --------------------------------------------------------------------------
  describe('3. Metric Redundancy Removal', () => {
    it('verifies nominal scale readout is displayed singularly and scroll tension bar shows basis weight', () => {
      // Nominal scale should have mapScaleStr
      expect(sidebarContent).toMatch(/Nominal Scale[\s\S]*?\{mapScaleStr\}/);

      // Scroll Tension bar must NOT repeat mapScaleStr
      expect(sidebarContent).not.toMatch(/Scroll Tensioned[^\n]*\n[^\n]*\{mapScaleStr\}/);
    });

    it('verifies medium theme selector and scale calibration readouts are present in sidebar', () => {
      // After refactor, tension bar calibration labels were replaced by medium theme selector
      // Verify the sidebar contains medium-adaptive elements instead
      expect(sidebarContent).toContain('Nominal Scale');
      expect(sidebarContent).toContain('mapScaleStr');
      expect(sidebarContent).toContain('applyMediumCalibration');
    });
  });

  // --------------------------------------------------------------------------
  // Issue 4: Scroll Container Boundary & Mask
  // --------------------------------------------------------------------------
  describe('4. Scroll Container Boundary & Fade Mask', () => {
    it('verifies .scroll-fade-mask gradient utility is defined in index.css', () => {
      expect(cssContent).toContain('.scroll-fade-mask');
      expect(cssContent).toContain('mask-image: linear-gradient(');
      expect(cssContent).toContain('-webkit-mask-image: linear-gradient(');
    });

    it('verifies UnifiedRightSidebar scroll containers adopt scroll-fade-mask and breathing room', () => {
      expect(sidebarContent).toContain('scroll-fade-mask pt-1 pb-3');
      expect(sidebarContent).toContain('scroll-fade-mask pt-1');
    });
  });

  // --------------------------------------------------------------------------
  // Issue 5: Palette Disharmony in Cream Rag
  // --------------------------------------------------------------------------
  describe('5. Palette Harmony in Cream Rag Mode', () => {
    it('verifies Antipodes button in Cream Rag uses Terracotta / Burnt Sienna instead of raw rose-600', () => {
      expect(sidebarContent).toContain("theme === 1\n                            ? 'bg-[#8C4820] text-[#FDFCF9] border-[#6D3414]");
      expect(sidebarContent).not.toContain("? isLight\n                              ? 'bg-rose-600 text-white");

      expect(topologyContent).toContain("isLight ? 'bg-[#8C4820] text-[#FDFCF9]'");
      expect(topologyContent).not.toContain("isLight ? 'bg-rose-600 text-white'");
    });

    it('verifies Conveyor button in Cream Rag uses Prussian Slate instead of raw sky-600', () => {
      expect(sidebarContent).toContain("theme === 1\n                            ? 'bg-[#1A4457] text-[#FDFCF9] border-[#102D3A]");
      expect(sidebarContent).not.toContain("? isLight\n                              ? 'bg-sky-600 text-white");

      expect(topologyContent).toContain("isLight ? 'bg-[#1A4457] text-[#FDFCF9]'");
      expect(topologyContent).not.toContain("isLight ? 'bg-sky-600 text-white'");
    });

    it('verifies Migration button in Cream Rag uses Raw Ochre instead of raw amber-600', () => {
      expect(sidebarContent).toContain("theme === 1\n                            ? 'bg-[#7D4700] text-[#FDFCF9] border-[#5A3300]");
      expect(sidebarContent).not.toContain("? isLight\n                              ? 'bg-amber-600 text-white");

      expect(topologyContent).toContain("isLight ? 'bg-[#7D4700] text-[#FDFCF9]'");
      expect(topologyContent).not.toContain("isLight ? 'bg-amber-600 text-white'");
    });

    it('verifies Vectors (V) toggle in Scene tab', () => {
      expect(sidebarContent).toContain('Vectors (V)');
      expect(sidebarContent).toContain('showVectors');
      expect(sidebarContent).toContain('onVectorsToggle');
      expect(sidebarContent).not.toContain('bg-amber-600');
    });

    it('verifies 16M resolution tier button in Cream Rag uses mineral pigment', () => {
      expect(sidebarContent).toContain("tier === '16M'\n                            ? theme === 1\n                              ? 'bg-[#7D4700] text-[#FDFCF9] border-[#5A3300]");
    });

    it('verifies catalog preset category pills in Cream Rag use readable dark mineral pigments on cream paper', () => {
      expect(sidebarContent).toContain("preset.category === 'topo'\n                            ? 'bg-[#2e6b47]/15 text-[#1b432b] border-[#2e6b47]/30'");
      expect(sidebarContent).toContain("preset.category === 'satellite'\n                            ? 'bg-[#2b6b88]/15 text-[#1a4457] border-[#2b6b88]/30'");
      expect(sidebarContent).toContain("preset.category === 'vectors'\n                            ? 'bg-[#96641e]/15 text-[#52350c] border-[#96641e]/30'");
    });

    it('verifies Zen Mode restore pill uses contrast styling for theme 1', () => {
      expect(appContent).toContain("theme === 1\n                ? 'bg-white/90 border-zinc-300 text-zinc-900 shadow-zinc-300/50'");
    });
  });

  // --------------------------------------------------------------------------
  // Issue 6: Cartographic Interaction Delight & Zero Raw Pixel Font Compliance
  // --------------------------------------------------------------------------
  describe('6. Cartographic Interaction Delight & Typography Scale', () => {
    it('verifies UnifiedRightSidebar maintains zero raw pixel font classes', () => {
      const rawPixelMatches = sidebarContent.match(/text-\[[0-9]+(?:\.[0-9]+)?px\]/g);
      expect(rawPixelMatches).toBeNull();
    });

    it('verifies UnifiedRightSidebar provides interactive tactile theme switching', () => {
      expect(sidebarContent).toContain('handleHeaderThemeToggle');
      expect(sidebarContent).toContain('handleSelectMedium');
    });

    it('verifies top calibration bar establishes 20px vertical grid axis with bottom-left rosette and cartouche', () => {
      expect(appContent).toContain('left-5');
      expect(appContent).not.toContain('left-16');
    });
  });
});
