// ============================================================================
// File: tests/modern/r7-neatline-hierarchy-clearance.test.ts
// Unit & Integration Test Suite for Cartographic Neatline Hierarchy,
// Spatial Clearance Moat (Zero Tangency), and Header Collision Prevention
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Requirement R7: Cartographic Neatline Hierarchy & Spatial Clearance Moat', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appPath = path.join(projectRoot, 'src/App.tsx');
  const sidebarPath = path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx');
  const dockPath = path.join(projectRoot, 'src/components/hud/NavigationDock.tsx');
  const ethosPath = path.join(projectRoot, 'DESIGN_ETHOS.md');
  const designLangPath = path.join(projectRoot, 'design-language.md');

  const appContent = fs.readFileSync(appPath, 'utf-8');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  const dockContent = fs.readFileSync(dockPath, 'utf-8');
  const ethosContent = fs.readFileSync(ethosPath, 'utf-8');
  const designLangContent = fs.readFileSync(designLangPath, 'utf-8');

  // --------------------------------------------------------------------------
  // 1. Outer Neatline Geometry & Zero Margin-1 Clutter
  // --------------------------------------------------------------------------
  describe('1. Outer Archival Neatline Frame', () => {
    it('R7-01: verifies outer neatline is inset cleanly at sheet boundary without m-1 shift', () => {
      expect(appContent).toContain('absolute inset-2 pointer-events-none border border-[var(--theme-neatline-border)]');
      expect(appContent).not.toMatch(/inset-2 pointer-events-none[^\n]*m-1/);
    });

    it('R7-02: verifies inner neatline hairline uses tight 2px inset for crisp double-rule', () => {
      expect(appContent).toContain('<div className="absolute inset-[2px] border border-current/15" />');
      expect(appContent).not.toContain('<div className="absolute inset-1 border border-current/15" />');
    });

    it('R7-03: verifies geodetic corner marks remain anchored inside the neatline', () => {
      expect(appContent).toContain('⌜ 00.00°');
      expect(appContent).toContain('⌝ 90.00°');
      expect(appContent).toContain('⌞ 180.00°');
      expect(appContent).toContain('⌟ 270.00°');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Spatial Clearance Moat (Zero Neatline Tangency)
  // --------------------------------------------------------------------------
  describe('2. Spatial Clearance Moat & 20px Grid Axis', () => {
    it('R7-04: verifies top calibration header maintains 20px axis (top-5, left-5, right-5) creating 10px moat', () => {
      expect(appContent).toMatch(/<header className=\{`absolute top-5 left-5 right-5/);
      // Ensure it no longer hugs the neatline at top-4
      expect(appContent).not.toMatch(/<header className=\{`absolute top-4/);
    });

    it('R7-05: verifies right sidebar docks at top-5 right-5 establishing consistent 10px neatline moat', () => {
      expect(sidebarContent).toContain('fixed top-5 right-5 z-30 pointer-events-auto max-w-sm w-96');
      expect(sidebarContent).not.toContain('fixed top-4 right-4 z-30 pointer-events-auto max-w-sm w-96');
    });

    it('R7-06: verifies slide-out catalog sheet docks at top-5 right-5 with 20px axis alignment', () => {
      expect(sidebarContent).toContain('fixed top-5 right-5 2xl:right-[26.5rem] z-40 pointer-events-auto w-96');
      expect(sidebarContent).not.toContain('fixed top-4 right-4 2xl:right-[25.5rem] z-40 pointer-events-auto w-96');
    });

    it('R7-06b: verifies top header maintains 20px inter-instrument gutter and eliminates catalog overlap', () => {
      expect(appContent).toMatch(/isCatalogOpen \? '2xl:right-\[51\.75rem\] md:right-\[26\.5rem\]' : 'md:right-\[26\.5rem\]'/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Elimination of Redundant Inner Borders ("Railroad Tracks")
  // --------------------------------------------------------------------------
  describe('3. Single-Border HUD Container Contract', () => {
    it('R7-07: verifies header bar does not render redundant internal border box', () => {
      // Header should not contain nested inset-[2px] border box
      const headerBlock = appContent.slice(appContent.indexOf('<header'), appContent.indexOf('</header>'));
      expect(headerBlock).not.toContain('inset-[2px]');
      expect(headerBlock).not.toContain('border-current/20');
    });

    it('R7-08: verifies right sidebar dock does not render redundant internal neatline box', () => {
      expect(sidebarContent).not.toMatch(/inset-1\s+rounded-\[2px\]\s+border\s+border-\[var\(--theme-neatline-border\)\]/);
    });

    it('R7-09: verifies nautical compass rosette aside does not render redundant internal border box', () => {
      const asideBlock = appContent.slice(appContent.indexOf('<aside'), appContent.indexOf('</aside>'));
      expect(asideBlock).not.toContain('inset-[2px]');
      expect(asideBlock).not.toContain('border-current/20');
    });

    it('R7-09b: verifies bottom navigation dock does not render redundant internal neatline box', () => {
      expect(dockContent).not.toMatch(/inset-\[2\.5px\]\s+rounded-\[2px\]\s+border\s+border-\[var\(--theme-neatline-border\)\]/);
      expect(dockContent).toContain('var(--theme-neatline-border)');
    });

    it('R7-10: verifies sidebar preserves var(--theme-neatline-border) token for drafting hairlines', () => {
      expect(sidebarContent).toContain('var(--theme-neatline-border)');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Header Text Truncation & Collision Prevention
  // --------------------------------------------------------------------------
  describe('4. Header Text Flow & Collision Prevention', () => {
    it('R7-11: verifies primary title truncates defensively instead of clipping mid-word', () => {
      expect(appContent).toContain('truncate">HYDROGRAPHIC SURVEY<span className="hidden xl:inline"> // CARTOGRAPHIC MATRIX</span>');
    });

    it('R7-12: verifies geodetic coordinates container has dedicated padding and tabular numerals', () => {
      expect(appContent).toMatch(/<div className="flex items-center gap-2\.5 shrink-0 z-10 pl-3">/);
      expect(appContent).toContain('tabular-nums">{latStr} · {lonStr}</span>');
    });

    it('R7-13: verifies header establishes persistent gap-4 gutter between survey and coordinates', () => {
      expect(appContent).toMatch(/<header className=\{`[^`]*gap-4[^`]*`\}/);
    });

    it('R7-13b: verifies auxiliary CRS reference hides responsively on mobile screens below sm', () => {
      expect(appContent).toContain('hidden sm:inline opacity-80 font-bold shrink-0">WGS84 // EPSG:4326</span>');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Design Documentation Alignment
  // --------------------------------------------------------------------------
  describe('5. Design Documentation Specifications', () => {
    it('R7-14: verifies DESIGN_ETHOS.md documents Principle 16 and Section 15 on Neatline Hierarchy', () => {
      expect(ethosContent).toContain('## 2. The 16 Core Design Principles');
      expect(ethosContent).toContain('Neatline Primacy & Spatial Clearance Moats');
      expect(ethosContent).toContain('## 15. Cartographic Framing, Neatline Hierarchy & Spatial Clearance Rules');
      expect(ethosContent).toContain('The Spatial Clearance Moat (Zero Neatline Tangency');
      expect(ethosContent).toContain('Single-Border HUD Enclosure Contract');
    });

    it('R7-15: verifies design-language.md documents Section 2.4 Cartographic Framing & Spatial Clearance', () => {
      expect(designLangContent).toContain('### 2.4 Cartographic Framing, Neatline Rules & Spatial Clearance');
      expect(designLangContent).toContain('The 10px Spatial Moat & 20px Inter-Instrument Gutters');
      expect(designLangContent).toContain('Single-Border HUD Container Contract');
      expect(designLangContent).toContain('Responsive Header Flow & Collision Prevention');
    });
  });
});
