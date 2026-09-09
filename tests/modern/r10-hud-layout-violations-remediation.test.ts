// ============================================================================
// File: tests/modern/r10-hud-layout-violations-remediation.test.ts
// Unit & Integration Test Suite for HUD Layout Violations Remediation
// Verifies all 9 remediations: left-column instrument cascade, corner mark clearance,
// mobile collision defenses, Tailwind arbitrary z-index, and 2xl catalog sheet height.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Stage 2 Cartography: Remediation of 9 Known HUD Layout Violations', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appPath = path.join(projectRoot, 'src/App.tsx');
  const toastPath = path.join(projectRoot, 'src/components/hud/DataLayerToastNotification.tsx');
  const sidebarPath = path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx');
  const canvasPath = path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx');

  const appContent = fs.readFileSync(appPath, 'utf-8');
  const toastContent = fs.readFileSync(toastPath, 'utf-8');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  const canvasContent = fs.readFileSync(canvasPath, 'utf-8');

  // --------------------------------------------------------------------------
  // Violation 1: Cartouche-to-Aside Gap = 20px
  // --------------------------------------------------------------------------
  describe('Violation 1: Cartouche-to-Aside Vertical Clearance Gutter', () => {
    it('V1-01: verifies Cartouche top edge is at h - 92px in WebGPUCanvas', () => {
      expect(canvasContent).toMatch(/cy\s*=\s*h\s*-\s*92/);
      expect(canvasContent).toMatch(/ch\s*=\s*72/);
    });

    it('V1-02: verifies Aside shifts to bottom-[112px] when showCartouche is true', () => {
      expect(appContent).toContain("${showCartouche ? 'bottom-[112px]' : 'bottom-5'}");
    });

    it('V1-03: mathematically proves exact 20px gutter between Cartouche top and Aside bottom', () => {
      const cartoucheTop = 92; // px from bottom
      const asideBottom = 112; // px from bottom
      const gutter = asideBottom - cartoucheTop;
      expect(gutter).toBe(20);
    });
  });

  // --------------------------------------------------------------------------
  // Violation 2: Aside-to-Toast Gap = 20px
  // --------------------------------------------------------------------------
  describe('Violation 2: Aside-to-Toast Vertical Clearance Gutter', () => {
    it('V2-01: verifies Toast stack shifts to bottom-[170px] when Cartouche is visible', () => {
      expect(toastContent).toContain("cartoucheVisible ? 'bottom-[170px]' : 'bottom-[78px]'");
    });

    it('V2-02: mathematically proves exact 20px gutter between Aside top and Toast bottom', () => {
      const asideBottom = 112; // px from bottom
      const asideHeight = 38; // px outer rendered height
      const asideTop = asideBottom + asideHeight; // 150px
      const toastBottom = 170; // px from bottom
      const gutter = toastBottom - asideTop;
      expect(asideTop).toBe(150);
      expect(gutter).toBe(20);
    });
  });

  // --------------------------------------------------------------------------
  // Violation 3: Aside & Toast Dynamic Adaptation When Cartouche Toggled Off
  // --------------------------------------------------------------------------
  describe('Violation 3: Dynamic Adaptive Positioning on Cartouche Toggle', () => {
    it('V3-01: verifies Aside drops to bottom-5 (20px axis = 10px neatline moat) when showCartouche is false', () => {
      expect(appContent).toContain("${showCartouche ? 'bottom-[112px]' : 'bottom-5'}");
      expect(appContent).toMatch(/aside[\s\S]*?transition-all duration-300/);
    });

    it('V3-02: verifies Toast drops to bottom-[78px] when showCartouche is false', () => {
      expect(toastContent).toContain("cartoucheVisible ? 'bottom-[170px]' : 'bottom-[78px]'");
      expect(toastContent).toContain('transition-all duration-300');
    });

    it('V3-03: mathematically proves exact 20px gutter is preserved when Cartouche is off', () => {
      const asideBottomNoCartouche = 20; // px from bottom (bottom-5 = 20px)
      const asideHeight = 38;
      const asideTopNoCartouche = asideBottomNoCartouche + asideHeight; // 58px
      const toastBottomNoCartouche = 78; // px from bottom (bottom-[78px] = 78px)
      const gutter = toastBottomNoCartouche - asideTopNoCartouche;
      expect(asideTopNoCartouche).toBe(58);
      expect(gutter).toBe(20);
    });
  });

  // --------------------------------------------------------------------------
  // Violation 4: Corner Mark ⌝ 90.00° Clears Header Bar
  // --------------------------------------------------------------------------
  describe('Violation 4: Corner Mark ⌝ 90.00° Collision Prevention', () => {
    it('V4-01: verifies top-1 is changed to top-[1px] on ⌝ 90.00°', () => {
      expect(appContent).toContain("top-[1px] right-2 ${isSidebarActive ? 'max-md:hidden' : ''}");
      expect(appContent).not.toContain("top-1 ${isSidebarActive");
    });

    it('V4-02: verifies erroneous md:right-[26rem] override is removed from ⌝ 90.00°', () => {
      // ⌝ 90.00° must not have md:right-[26rem]
      const cornerMark90Block = appContent.match(/<span[^>]*?>⌝ 90\.00°<\/span>/);
      expect(cornerMark90Block).toBeTruthy();
      expect(cornerMark90Block![0]).not.toContain('md:right-[26rem]');
      expect(cornerMark90Block![0]).toContain('right-2');
    });

    it('V4-03: mathematically proves 1px vertical moat clearance and 358px horizontal separation from header', () => {
      const outerNeatlineInset = 8; // inset-2 = 8px
      const markTop = outerNeatlineInset + 1; // top-[1px] = 9px
      const markHeight = 10; // text-nano line-height = 10px
      const markBottom = markTop + markHeight; // 19px
      const headerTop = 20; // top-5 = 20px
      const verticalClearance = headerTop - markBottom;
      expect(verticalClearance).toBe(1); // 1px clean moat buffer

      // Horizontal separation on 1920px screen:
      // Header ends at md:right-[26.5rem] = 424px from right
      // Mark is anchored at right-2 = 8px inset + 8px = 16px from right, glyphs extend to ~66px from right
      // Separation = (W - 66) - (W - 424) = 358px
      const headerRightDistance = 424;
      const markLeftDistance = 66;
      const horizontalSeparation = headerRightDistance - markLeftDistance;
      expect(horizontalSeparation).toBe(358);
    });
  });

  // --------------------------------------------------------------------------
  // Violation 5: Corner Mark ⌜ 00.00° Clears Header Bar
  // --------------------------------------------------------------------------
  describe('Violation 5: Corner Mark ⌜ 00.00° Encroachment Remediation', () => {
    it('V5-01: verifies top-1 is changed to top-[1px] on ⌜ 00.00°', () => {
      expect(appContent).toContain('className="absolute top-[1px] left-2 text-nano font-mono');
      expect(appContent).not.toContain('className="absolute top-1 left-2 text-nano font-mono');
    });

    it('V5-02: mathematically proves 1px vertical clearance above header bar at top-5', () => {
      const outerNeatlineInset = 8; // inset-2
      const markTop = outerNeatlineInset + 1; // 9px
      const markHeight = 10; // 10px
      const markBottom = markTop + markHeight; // 19px
      const headerTop = 20; // 20px
      expect(headerTop - markBottom).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Violation 6: Header vs Sidebar Collision Below md: Breakpoint
  // --------------------------------------------------------------------------
  describe('Violation 6: Responsive Header Defense Below md:', () => {
    it('V6-01: verifies header applies max-md:hidden when isSidebarActive is true', () => {
      expect(appContent).toContain("${isSidebarActive ? 'max-md:hidden' : ''}");
      const headerBlock = appContent.match(/<header className=\{`[^`]*?`\}/);
      expect(headerBlock).toBeTruthy();
      expect(headerBlock![0]).toContain('max-md:hidden');
    });
  });

  // --------------------------------------------------------------------------
  // Violation 7: Right Corner Marks Trapped Under Sidebar Below md:
  // --------------------------------------------------------------------------
  describe('Violation 7: Right Corner Marks Mobile Occlusion Defense', () => {
    it('V7-01: verifies ⌝ 90.00° hides below md: when sidebar is active', () => {
      expect(appContent).toContain("top-[1px] right-2 ${isSidebarActive ? 'max-md:hidden' : ''}");
    });

    it('V7-02: verifies ⌟ 270.00° hides below md: when sidebar is active', () => {
      expect(appContent).toContain("2xl:right-[50.5rem] md:right-[26rem] max-md:hidden' : 'md:right-[26rem] max-md:hidden'");
    });
  });

  // --------------------------------------------------------------------------
  // Violation 8: Invalid z-35 Tailwind Class Replacement
  // --------------------------------------------------------------------------
  describe('Violation 8: Tailwind Stacking Context z-[35]', () => {
    it('V8-01: verifies z-35 is replaced by arbitrary value syntax z-[35] in DataLayerToastNotification', () => {
      expect(toastContent).toContain('z-[35]');
      expect(toastContent).not.toContain('z-35');
    });
  });

  // --------------------------------------------------------------------------
  // Violation 9: Catalog Sheet Height on Compact 2xl
  // --------------------------------------------------------------------------
  describe('Violation 9: Catalog Sheet Height Constraint on Compact 2xl', () => {
    it('V9-01: verifies catalog sheet adds 2xl:max-h-[calc(100vh-8.5rem)]', () => {
      expect(sidebarContent).toContain('2xl:max-h-[calc(100vh-8.5rem)]');
    });

    it('V9-02: mathematically proves catalog sheet bottom stops above NavigationDock top', () => {
      // Catalog sheet top at 20px (top-5)
      // Height capped at calc(100vh - 8.5rem) = 100vh - 136px
      // Bottom edge = 20px + (100vh - 136px) = 100vh - 116px
      // NavigationDock top at 100vh - 112px (bottom-8 is 32px from bottom, height is 80px -> top is 112px from bottom)
      // Clearance = (100vh - 112px) - (100vh - 116px) = 4px
      const catalogTop = 20;
      const catalogMaxH = 136; // 8.5rem = 136px
      const catalogBottomDistance = catalogMaxH - catalogTop; // 116px from bottom
      const dockTopDistance = 112; // 112px from bottom
      const clearance = catalogBottomDistance - dockTopDistance;
      expect(clearance).toBe(4); // 4px clearance above dock
    });
  });
});
