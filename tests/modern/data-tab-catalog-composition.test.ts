// ============================================================================
// File: tests/modern/data-tab-catalog-composition.test.ts
// Unit & Integration Test Suite: DATA Tab & Catalog Composition Invariants
// Verifies spatial rhythm, typographic hierarchy, ivory vellum boundaries,
// medium purity, and residual defect resolution.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('DATA Tab & Catalog Composition Invariants', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const dataTabPath = path.join(projectRoot, 'src/components/hud/tabs/DataLayersTab.tsx');
  const catalogPath = path.join(projectRoot, 'src/components/hud/tabs/CatalogSheet.tsx');
  const colophonPath = path.join(projectRoot, 'src/components/hud/CuratorsColophon.tsx');

  const dataTabContent = fs.readFileSync(dataTabPath, 'utf-8');
  const catalogContent = fs.readFileSync(catalogPath, 'utf-8');
  const colophonContent = fs.readFileSync(colophonPath, 'utf-8');

  // --------------------------------------------------------------------------
  // 1. Catalog Toggle Button: Residual Defect Resolution
  // --------------------------------------------------------------------------
  describe('1. Catalog Toggle Button Invariants', () => {
    it('provides distinct close icon when open and prevents duplicate plus sign when closed', () => {
      // Must have close icon path when isCatalogOpen is true
      expect(dataTabContent).toContain('M6 18L18 6M6 6l12 12');
      // When closed, button text must include "+ Catalog" for contract compliance
      expect(dataTabContent).toContain("isCatalogOpen ? 'Close Catalog' : '+ Catalog'");
      // Must not render duplicate plus sign path when closed
      expect(dataTabContent).not.toContain('<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />\n          </svg>\n          <span>{isCatalogOpen ? \'Close Catalog\' : \'+ Catalog\'}</span>');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Layer Folio Strip Hierarchy & Structure
  // --------------------------------------------------------------------------
  describe('2. Layer Folio Strip Layout & Badges', () => {
    it('structures header with flex flex-col to prevent orphaned color ramps', () => {
      expect(dataTabContent).toContain('flex flex-col min-w-0 flex-1 gap-0.5');
      // Stratum badge, title, and mini-ramp are contained on the primary row
      expect(dataTabContent).toContain('leading-tight truncate text-nano font-bold');
      // Secondary status badge renders neatly on a dedicated row
      expect(dataTabContent).toContain('isPrimaryRaster && (');
      expect(dataTabContent).toContain('(Active Raster)');
    });

    it('unifies slider label styles to semantic text-[var(--theme-text-primary)]', () => {
      expect(dataTabContent).toContain('text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider');
      // Both opacity and AO use font-semibold for tabular readouts
      expect(dataTabContent).toContain('font-semibold tabular-nums text-[var(--theme-text-primary)]');
    });

    it('eliminates hardcoded border-white/10 in favor of theme borders', () => {
      expect(dataTabContent).not.toContain('border-white/10');
      expect(dataTabContent).toContain('border-[var(--theme-panel-header-border)]');
      expect(dataTabContent).toContain('border-[var(--theme-card-border)]');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Curator\'s Colophon: Ivory Vellum Card Tone & Typographic Scale
  // --------------------------------------------------------------------------
  describe('3. Curator\'s Colophon Cartouche Invariants', () => {
    it('uses ivory vellum card background var(--theme-card-bg) in Theme 1', () => {
      expect(colophonContent).toContain("theme === 1\n          ? 'bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[#4A3B32]'");
      expect(colophonContent).not.toContain("theme === 1\n          ? 'bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[#4A3B32]'");
    });

    it('enforces disciplined typographic scale with text-nano metadata and provenance', () => {
      // Datum labels are text-nano
      expect(colophonContent).toContain('text-nano uppercase tracking-wider font-medium');
      // Provenance items are text-nano, eliminating oversized text-body
      expect(colophonContent).toContain('space-y-1 opacity-85 text-nano pl-0.5 leading-snug');
      expect(colophonContent).not.toContain('text-body pl-1');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Catalog Sheet: Theme Harmony & Boundaries
  // --------------------------------------------------------------------------
  describe('4. Catalog Sheet Theme Harmony & Boundaries', () => {
    it('uses theme-adaptive dot indicators instead of hardcoded neon classes', () => {
      expect(catalogContent).not.toContain("preset.category === 'topo'\n                            ? 'bg-amber-400'");
      expect(catalogContent).toContain("theme === 1\n                            ? (preset.category === 'topo'\n                                ? 'bg-[#8c4820]'");
    });

    it('theme-adapts category badges for Prussian Cyanotype (zero warm contamination)', () => {
      expect(catalogContent).toContain("bg-[#3b6b99]/25 text-[#9fc2e4] border-[#5c82a6]/40");
      expect(catalogContent).toContain("bg-[#38bdf8]/20 text-[#bae6fd] border-[#38bdf8]/40");
    });

    it('theme-adapts unsupported preset button to prevent black box on cream paper', () => {
      expect(catalogContent).toContain("theme === 1\n                          ? 'opacity-50 cursor-not-allowed bg-[#e2dcce] text-[#787062] border-[#c4bcac]'");
    });

    it('uses min-h-0 on catalog list scroll flex container to prevent clipping', () => {
      expect(catalogContent).toContain('flex-1 min-h-0 pb-4 scroll-fade-mask pt-1');
    });
  });
});
