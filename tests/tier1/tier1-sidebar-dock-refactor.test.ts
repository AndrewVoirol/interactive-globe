// ============================================================================
// File: tests/tier1/tier1-sidebar-dock-refactor.test.ts
// Automated Unit & Contract Invariant Tests for Bite 4:
// Surface & Sidebar Refactoring (NavigationDock & UnifiedRightSidebar)
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ThemeManager,
  DARK_CYBER_THEME,
  LIGHT_MONOCHROME_THEME,
  PRUSSIAN_CYANOTYPE_THEME,
} from '../../src/core/themes/ThemeManager';

describe('Bite 4: Surface & Sidebar Refactoring Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const sidebarPath = path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx');
  const dockPath = path.join(projectRoot, 'src/components/hud/NavigationDock.tsx');

  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');
  const dockCode = fs.readFileSync(dockPath, 'utf-8');

  // --------------------------------------------------------------------------
  // 1. UnifiedRightSidebar Component Delegation & Deduplication
  // --------------------------------------------------------------------------
  describe('1. Micro-Control Delegation', () => {
    it('B4-01: verifies KnurledSlideSwitch delegates to standardized TactileSwitch primitive', () => {
      expect(sidebarCode).toContain("import { TactileSwitch } from '../ui/TactileSwitch'");
      expect(sidebarCode).toContain('<TactileSwitch');
    });

    it('B4-02: verifies VernierSliderWithStepper delegates to standardized VernierSlider primitive', () => {
      expect(sidebarCode).toContain("import { VernierSlider } from '../ui/VernierSlider'");
      expect(sidebarCode).toContain('<VernierSlider');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Semantic Theme Variable Adoption (Elimination of Hardcoded Bleed)
  // --------------------------------------------------------------------------
  describe('2. Semantic Theme Variable Adoption', () => {
    it('B4-03: verifies Direction A, B, and C buttons adopt semantic direction variables', () => {
      expect(sidebarCode).toContain('var(--theme-direction-a-bg)');
      expect(sidebarCode).toContain('var(--theme-direction-b-bg)');
      expect(sidebarCode).toContain('var(--theme-direction-c-bg)');
      // Confirm hardcoded cyan/sky button active classes were removed from Direction buttons
      expect(sidebarCode).not.toContain("activeDirection === 'hybrid'\n                            ? 'bg-cyan-500");
      expect(sidebarCode).not.toContain("activeDirection === 'photoreal'\n                            ? 'bg-sky-500");
    });

    it('B4-04: verifies outer dock panels and dividers use theme tokens', () => {
      expect(sidebarCode).toContain('var(--theme-panel-border)');
      expect(sidebarCode).toContain('var(--theme-neatline-border)');
      expect(sidebarCode).toContain('var(--theme-panel-header-border)');
      expect(sidebarCode).toContain('var(--theme-card-border)');
      expect(sidebarCode).toContain('var(--theme-control-border)');
    });

    it('B4-05: verifies NavigationDock adopts theme tokens and neatline rules', () => {
      expect(dockCode).toContain('var(--theme-panel-border)');
      expect(dockCode).toContain('var(--theme-neatline-border)');
      expect(dockCode).toContain('var(--theme-font-telemetry)');
      expect(dockCode).toContain('text-micro');
      expect(dockCode).toContain('text-nano');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Typographic Hierarchy Integration
  // --------------------------------------------------------------------------
  describe('3. Typographic Hierarchy Integration', () => {
    it('B4-06: verifies UnifiedRightSidebar enforces standardized typography scale', () => {
      expect(sidebarCode).toContain('cartouche-title');
      expect(sidebarCode).toContain('text-title');
      expect(sidebarCode).toContain('text-body');
      expect(sidebarCode).toContain('text-micro');
      expect(sidebarCode).toContain('text-nano');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Direction Palette Mineral Pigment Parity
  // --------------------------------------------------------------------------
  describe('4. Theme Direction Palette Verification', () => {
    it('B4-07: verifies Theme 1 (Cream Rag Paper) uses Alpine Celadon & Umber without neon cyan', () => {
      const creamTokens = LIGHT_MONOCHROME_THEME.ui;
      expect(creamTokens.directionA.bg).toBe('#2B241A'); // Bistre Carbon
      expect(creamTokens.directionB.bg).toBe('#77998B'); // Alpine Celadon
      expect(creamTokens.directionC.bg).toBe('#9E6D50'); // Raw Umber
      expect(creamTokens.directionB.bg).not.toContain('cyan');
      expect(creamTokens.directionB.bg).not.toBe('#00e5ff');
    });

    it('B4-08: verifies Theme 0 (Dark Cyber) uses Tharp oceanographic survey tones', () => {
      const tharpTokens = DARK_CYBER_THEME.ui;
      expect(tharpTokens.directionA.bg).toBe('#1B2B3A');
      expect(tharpTokens.directionB.bg).toBe('#102A38');
      expect(tharpTokens.directionC.bg).toBe('#122538');
    });

    it('B4-09: verifies Theme 2 (Cyanotype) uses architectural blueprint drafting tones', () => {
      const cyanotypeTokens = PRUSSIAN_CYANOTYPE_THEME.ui;
      expect(cyanotypeTokens.directionA.bg).toBe('#203A57');
      expect(cyanotypeTokens.directionB.bg).toBe('#162B42');
      expect(cyanotypeTokens.directionC.bg).toBe('#102236');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Preservation of Phase 6 Contract Invariants
  // --------------------------------------------------------------------------
  describe('5. Contract Invariant Preservation', () => {
    it('B4-10: preserves all required contract tokens in UnifiedRightSidebar and NavigationDock', () => {
      // INST-12 tokens
      expect(sidebarCode).toContain('Crevice AO:');
      expect(sidebarCode).toContain('onAmbientOcclusionChangeDataLayer');
      expect(sidebarCode).toContain('Sea Level:');
      expect(sidebarCode).toContain('onSeaLevelOffsetChangeDataLayer');
      expect(sidebarCode).toContain('Clarity:');
      expect(sidebarCode).toContain('onWaterClarityChangeDataLayer');
      expect(sidebarCode).toContain('Peak Sharp:');
      expect(sidebarCode).toContain('onPeakExponentChangeDataLayer');
      expect(sidebarCode).toContain('Base Lattice:');
      expect(sidebarCode).toContain('Clean Terrain');
      expect(sidebarCode).toContain('+ Node Cloud');
      expect(sidebarCode).toContain('Fracture Intensity');
      expect(sidebarCode).toContain('Vortex Swirl Strength');
      expect(sidebarCode).toContain('GPU Profiler');

      // INST-13 tokens
      expect(dockCode).toContain('B: Backend');
      expect(dockCode).toContain('CurvatureUnfurlSextant');
      expect(dockCode).toContain('onGlideToAlpha');
    });
  });
});
