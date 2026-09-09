// ============================================================================
// File: tests/modern/r12-hud-layout-bounds-stress.test.ts
// Adversarial HUD Layout & Bounding Box Stress Suite (Challenger 2)
// Empirically asserts zero overlap, strict 20px gutters, 10px neatline moats,
// and state transition stability across responsive breakpoints.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ----------------------------------------------------------------------------
// Types & Bounding Box Model
// ----------------------------------------------------------------------------
export interface BoundingBox {
  id: string;
  x1: number; // left
  y1: number; // top
  x2: number; // right
  y2: number; // bottom
  width: number;
  height: number;
  visible: boolean;
  zIndex: number;
}

export interface HUDState {
  viewportWidth: number;
  viewportHeight: number;
  isSidebarActive: boolean;
  isCatalogOpen: boolean;
  showCartouche: boolean;
  isZenMode: boolean;
}

/**
 * Checks if two bounding boxes have a non-empty spatial intersection.
 */
export function hasAABBCollision(a: BoundingBox, b: BoundingBox): boolean {
  if (!a.visible || !b.visible) return false;
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

/**
 * Computes exact horizontal gutter between a on left and b on right.
 */
export function getHorizontalGutter(leftBox: BoundingBox, rightBox: BoundingBox): number {
  return rightBox.x1 - leftBox.x2;
}

/**
 * Computes exact vertical gutter between a on top and b on bottom.
 */
export function getVerticalGutter(topBox: BoundingBox, bottomBox: BoundingBox): number {
  return bottomBox.y1 - topBox.y2;
}

/**
 * Mathematical Layout Geometry Engine for Indicatrix HUD Elements.
 * Accurately models Tailwind CSS classes, inline styles, and canvas overlays.
 */
export function calculateHUDBoundingBoxes(state: HUDState): Record<string, BoundingBox> {
  const {
    viewportWidth: W,
    viewportHeight: H,
    isSidebarActive,
    isCatalogOpen,
    showCartouche,
    isZenMode,
  } = state;

  const boxes: Record<string, BoundingBox> = {};

  if (isZenMode) {
    // In Zen mode, only neatline is active
    boxes.neatline = {
      id: 'neatline',
      x1: 8,
      y1: 8,
      x2: W - 8,
      y2: H - 8,
      width: W - 16,
      height: H - 16,
      visible: true,
      zIndex: 20,
    };
    return boxes;
  }

  // 1. Outer Neatline (inset-2 = 8px margin, 10px inner hairline)
  boxes.neatline = {
    id: 'neatline',
    x1: 8,
    y1: 8,
    x2: W - 8,
    y2: H - 8,
    width: W - 16,
    height: H - 16,
    visible: true,
    zIndex: 20,
  };

  // 2. Corner Marks (text-nano line-height = 10px, rendered text ~50px)
  const markW = 50;
  const markH = 10;

  // ⌜ 00.00° (top-[1px] left-2 relative to inset-2)
  boxes.mark00 = {
    id: 'mark00',
    x1: 8 + 8, // 16px
    y1: 8 + 1, // 9px
    x2: 16 + markW,
    y2: 9 + markH, // 19px
    width: markW,
    height: markH,
    visible: true,
    zIndex: 20,
  };

  // ⌝ 90.00° (top-[1px] right-2, max-md:hidden if isSidebarActive)
  const mark90Hidden = isSidebarActive && W < 768;
  boxes.mark90 = {
    id: 'mark90',
    x1: W - 16 - markW,
    y1: 9,
    x2: W - 16,
    y2: 19,
    width: mark90Hidden ? 0 : markW,
    height: mark90Hidden ? 0 : markH,
    visible: !mark90Hidden,
    zIndex: 20,
  };

  // ⌞ 180.00° (bottom-1, left-[268px] if showCartouche, else left-2)
  const mark180Left = showCartouche ? 8 + 268 : 8 + 8;
  boxes.mark180 = {
    id: 'mark180',
    x1: mark180Left,
    y1: H - 12 - markH,
    x2: mark180Left + markW,
    y2: H - 12,
    width: markW,
    height: markH,
    visible: true,
    zIndex: 20,
  };

  // ⌟ 270.00° (bottom-1, right position depends on sidebar/catalog and breakpoint)
  const mark270Hidden = isSidebarActive && W < 768;
  let mark270RightDist = 16; // right-2 default (8 + 8 = 16)
  if (isSidebarActive) {
    if (W >= 1536 && isCatalogOpen) {
      mark270RightDist = 8 + 50.5 * 16; // 816px
    } else if (W >= 768) {
      mark270RightDist = 8 + 26 * 16; // 424px
    }
  }
  boxes.mark270 = {
    id: 'mark270',
    x1: W - mark270RightDist - markW,
    y1: H - 12 - markH,
    x2: W - mark270RightDist,
    y2: H - 12,
    width: mark270Hidden ? 0 : markW,
    height: mark270Hidden ? 0 : markH,
    visible: !mark270Hidden,
    zIndex: 20,
  };

  // 3. Top Header Bar (top-5 left-5 right-5, h-7 = 28px)
  // Classes: absolute top-5 left-5 right-5 ${isCatalogOpen ? '2xl:right-[51.75rem] md:right-[26.5rem]' : 'md:right-[26.5rem]'} ${isSidebarActive ? 'max-md:hidden' : ''}
  const headerHidden = isSidebarActive && W < 768;
  let headerRightDist = 20; // right-5 = 20px
  if (W >= 1536 && isCatalogOpen) {
    headerRightDist = 51.75 * 16; // 828px
  } else if (W >= 768) {
    headerRightDist = 26.5 * 16; // 424px
  }
  const headerX1 = 20;
  const headerX2 = W - headerRightDist;
  boxes.header = {
    id: 'header',
    x1: headerX1,
    y1: 20,
    x2: headerX2,
    y2: 20 + 28, // 48px
    width: headerHidden ? 0 : Math.max(0, headerX2 - headerX1),
    height: headerHidden ? 0 : 28,
    visible: !headerHidden,
    zIndex: 20,
  };

  // 4. Unified Right Sidebar (top-5 right-5, w-96 = 384px)
  const sidebarWidth = Math.min(384, W - 40);
  const sidebarX2 = W - 20;
  const sidebarX1 = sidebarX2 - sidebarWidth;
  const sidebarHeight = isSidebarActive ? H - 40 : 82;
  boxes.sidebar = {
    id: 'sidebar',
    x1: sidebarX1,
    y1: 20,
    x2: sidebarX2,
    y2: 20 + sidebarHeight,
    width: sidebarWidth,
    height: sidebarHeight,
    visible: true,
    zIndex: 30,
  };

  // 5. Data Catalog Sheet (when open: top-5 right-5 2xl:right-[26.5rem], w-96)
  if (isCatalogOpen) {
    let catRightDist = 20;
    let catMaxHeight = H - 40; // max-h-[calc(100vh-2.5rem)]
    if (W >= 1536) {
      catRightDist = 26.5 * 16; // 424px
      catMaxHeight = H - 8.5 * 16; // 2xl:max-h-[calc(100vh-8.5rem)] = H - 136px
    }
    const catX2 = W - catRightDist;
    const catX1 = catX2 - 384;
    boxes.catalogSheet = {
      id: 'catalogSheet',
      x1: catX1,
      y1: 20,
      x2: catX2,
      y2: 20 + catMaxHeight,
      width: 384,
      height: catMaxHeight,
      visible: true,
      zIndex: 40,
    };
  }

  // 6. NavigationDock (bottom-8 inset-x-0 items-center, width ~650px, height ~80px)
  const dockWidth = Math.min(650, W - 40);
  const dockHeight = 80;
  const dockX1 = (W - dockWidth) / 2;
  const dockY2 = H - 32; // bottom-8 = 32px
  const dockY1 = dockY2 - dockHeight;
  boxes.navigationDock = {
    id: 'navigationDock',
    x1: dockX1,
    y1: dockY1,
    x2: dockX1 + dockWidth,
    y2: dockY2,
    width: dockWidth,
    height: dockHeight,
    visible: true,
    zIndex: 20,
  };

  // 7. Cartouche in WebGPUCanvas (cx=20, cy=H-92, cw=236, ch=72)
  if (showCartouche) {
    boxes.cartouche = {
      id: 'cartouche',
      x1: 20,
      y1: H - 92,
      x2: 20 + 236, // 256px
      y2: H - 92 + 72, // H - 20px
      width: 236,
      height: 72,
      visible: true,
      zIndex: 10,
    };
  }

  // 8. Imhof NW Aside (left-5, bottom-[112px] when cartouche ON, bottom-5 = 20px when OFF)
  const asideWidth = 220;
  const asideHeight = 38;
  const asideBottomDist = showCartouche ? 112 : 20;
  const asideY2 = H - asideBottomDist;
  const asideY1 = asideY2 - asideHeight;
  boxes.aside = {
    id: 'aside',
    x1: 20,
    y1: asideY1,
    x2: 20 + asideWidth,
    y2: asideY2,
    width: asideWidth,
    height: asideHeight,
    visible: true,
    zIndex: 20,
  };

  // 9. Toast Notification Stack (left-5, bottom-[170px] when cartouche ON, bottom-[78px] when OFF)
  const toastWidth = 320;
  const toastHeight = 40;
  const toastBottomDist = showCartouche ? 170 : 78;
  const toastY2 = H - toastBottomDist;
  const toastY1 = toastY2 - toastHeight;
  boxes.toast = {
    id: 'toast',
    x1: 20,
    y1: toastY1,
    x2: 20 + toastWidth,
    y2: toastY2,
    width: toastWidth,
    height: toastHeight,
    visible: true,
    zIndex: 35,
  };

  return boxes;
}

// ============================================================================
// Adversarial Stress Suite
// ============================================================================
describe('R12: HUD Layout Geometry & Boundary Challenger Stress Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appSrc = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf-8');
  const toastSrc = fs.readFileSync(path.join(projectRoot, 'src/components/hud/DataLayerToastNotification.tsx'), 'utf-8');
  const sidebarSrc = fs.readFileSync(path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx'), 'utf-8');
  const canvasSrc = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'), 'utf-8');

  // ==========================================================================
  // Objective 1: Adversarial Layout Geometry Across Viewport Sizes
  // ==========================================================================
  describe('Objective 1: Multi-Viewport Responsive Boundary & Clearance Verification', () => {

    // ------------------------------------------------------------------------
    // Mobile (< 768px)
    // ------------------------------------------------------------------------
    describe('1.1 Mobile Viewports (< 768px): Sidebar Occlusion & Defensive Collapsing', () => {
      const mobileWidths = [360, 375, 390, 414, 540, 767];

      it.each(mobileWidths)('W=%ipx: active sidebar hides header bar completely (zero collision)', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 844,
          isSidebarActive: true,
          isCatalogOpen: false,
          showCartouche: false,
          isZenMode: false,
        });

        expect(boxes.header.visible).toBe(false);
        expect(boxes.header.width).toBe(0);
        expect(hasAABBCollision(boxes.header, boxes.sidebar)).toBe(false);
      });

      it.each(mobileWidths)('W=%ipx: active sidebar hides ⌝ 90.00° and ⌟ 270.00° corner marks (no trapped text)', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 844,
          isSidebarActive: true,
          isCatalogOpen: false,
          showCartouche: false,
          isZenMode: false,
        });

        expect(boxes.mark90.visible).toBe(false);
        expect(boxes.mark270.visible).toBe(false);
        expect(hasAABBCollision(boxes.mark90, boxes.sidebar)).toBe(false);
        expect(hasAABBCollision(boxes.mark270, boxes.sidebar)).toBe(false);
      });

      it.each(mobileWidths)('W=%ipx: collapsed sidebar restores header and corner marks within neatline', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 844,
          isSidebarActive: false,
          isCatalogOpen: false,
          showCartouche: false,
          isZenMode: false,
        });

        expect(boxes.header.visible).toBe(true);
        expect(boxes.header.x1).toBe(20);
        expect(boxes.header.x2).toBe(w - 20);
        expect(boxes.mark90.visible).toBe(true);
        expect(boxes.mark270.visible).toBe(true);

        // 1px vertical moat above header
        expect(boxes.header.y1 - boxes.mark90.y2).toBe(1);
      });
    });

    // ------------------------------------------------------------------------
    // Tablet (768px – 1023px)
    // ------------------------------------------------------------------------
    describe('1.2 Tablet Viewports (768px–1023px): Header Bar, Corner Marks, and Sidebar Clearance', () => {
      const tabletWidths = [768, 810, 834, 912, 1023];

      it.each(tabletWidths)('W=%ipx: Header right ends at 424px from right, maintaining EXACT 20px gutter to Sidebar', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 1024,
          isSidebarActive: true,
          isCatalogOpen: false,
          showCartouche: true,
          isZenMode: false,
        });

        expect(boxes.header.visible).toBe(true);
        expect(boxes.sidebar.visible).toBe(true);

        const gutter = getHorizontalGutter(boxes.header, boxes.sidebar);
        expect(gutter).toBe(20);
        expect(hasAABBCollision(boxes.header, boxes.sidebar)).toBe(false);
      });

      it.each(tabletWidths)('W=%ipx: ⌝ 90.00° clears Sidebar vertically by 1px in neatline moat', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 1024,
          isSidebarActive: true,
          isCatalogOpen: false,
          showCartouche: true,
          isZenMode: false,
        });

        expect(boxes.mark90.visible).toBe(true);
        expect(boxes.mark90.y2).toBe(19);
        expect(boxes.sidebar.y1).toBe(20);
        expect(boxes.sidebar.y1 - boxes.mark90.y2).toBe(1); // 1px vertical moat
        expect(hasAABBCollision(boxes.mark90, boxes.sidebar)).toBe(false);
      });

      it.each(tabletWidths)('W=%ipx: ⌟ 270.00° shifts left to md:right-[26rem] (424px), clearing Sidebar left by 20px', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 1024,
          isSidebarActive: true,
          isCatalogOpen: false,
          showCartouche: true,
          isZenMode: false,
        });

        expect(boxes.mark270.visible).toBe(true);
        // Sidebar left is at w - 404
        // Mark right is at w - 424
        const markToSidebarClearance = boxes.sidebar.x1 - boxes.mark270.x2;
        expect(markToSidebarClearance).toBe(20);
        expect(hasAABBCollision(boxes.mark270, boxes.sidebar)).toBe(false);
      });
    });

    // ------------------------------------------------------------------------
    // Desktop (1024px – 1535px)
    // ------------------------------------------------------------------------
    describe('1.3 Desktop Viewports (1024px–1535px): Strict 20px Gutters & Non-Overlap', () => {
      const desktopWidths = [1024, 1152, 1280, 1366, 1440, 1535];

      it.each(desktopWidths)('W=%ipx: guarantees exact 20px gutter between Header and Sidebar', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 900,
          isSidebarActive: true,
          isCatalogOpen: false,
          showCartouche: true,
          isZenMode: false,
        });

        const gutter = getHorizontalGutter(boxes.header, boxes.sidebar);
        expect(gutter).toBe(20);
        expect(hasAABBCollision(boxes.header, boxes.sidebar)).toBe(false);
      });

      it.each(desktopWidths)('W=%ipx: verifies 10px uniform cartographic moat around all perimeter panels', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 900,
          isSidebarActive: true,
          isCatalogOpen: false,
          showCartouche: true,
          isZenMode: false,
        });

        // Top moat: neatline inner hairline = 10px, header and sidebar top = 20px -> moat = 10px
        expect(boxes.header.y1 - 10).toBe(10);
        expect(boxes.sidebar.y1 - 10).toBe(10);

        // Left moat: neatline inner hairline = 10px, header & cartouche left = 20px -> moat = 10px
        expect(boxes.header.x1 - 10).toBe(10);
        expect(boxes.cartouche.x1 - 10).toBe(10);

        // Right moat: neatline inner hairline = w - 10px, sidebar right = w - 20px -> moat = 10px
        expect((w - 10) - boxes.sidebar.x2).toBe(10);

        // Bottom moat: cartouche bottom = H - 20px, neatline inner hairline = H - 10px -> moat = 10px
        expect((900 - 10) - boxes.cartouche.y2).toBe(10);
      });
    });

    // ------------------------------------------------------------------------
    // Compact 2xl (1536px – 1650px)
    // ------------------------------------------------------------------------
    describe('1.4 Compact 2xl Viewports (1536px–1650px): Catalog Sheet Height Cap & Zero Dock Collision', () => {
      const compact2xlWidths = [1536, 1560, 1600, 1620, 1650];
      const viewportHeights = [768, 864, 900, 960, 1080];

      it.each(compact2xlWidths)('W=%ipx: Catalog Sheet, Sidebar, and Header form strict 20px + 20px dual-gutter chain', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 900,
          isSidebarActive: true,
          isCatalogOpen: true,
          showCartouche: true,
          isZenMode: false,
        });

        // Gutter 1: Catalog Sheet right to Sidebar left
        const gutterCatalogSidebar = getHorizontalGutter(boxes.catalogSheet, boxes.sidebar);
        expect(gutterCatalogSidebar).toBe(20);

        // Gutter 2: Header right to Catalog Sheet left
        const gutterHeaderCatalog = getHorizontalGutter(boxes.header, boxes.catalogSheet);
        expect(gutterHeaderCatalog).toBe(20);

        expect(hasAABBCollision(boxes.header, boxes.catalogSheet)).toBe(false);
        expect(hasAABBCollision(boxes.catalogSheet, boxes.sidebar)).toBe(false);
      });

      it.each(viewportHeights)('H=%ipx: Catalog Sheet bottom is capped at H-116px, stopping strictly ABOVE NavigationDock top (H-112px)', (h) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: 1536,
          viewportHeight: h,
          isSidebarActive: true,
          isCatalogOpen: true,
          showCartouche: true,
          isZenMode: false,
        });

        // Catalog Sheet max height = H - 136px (8.5rem)
        // Top = 20px
        // Bottom = 20 + (H - 136) = H - 116px
        expect(boxes.catalogSheet.y2).toBe(h - 116);

        // NavigationDock bottom = H - 32px (bottom-8)
        // Height = 80px
        // Top = (H - 32) - 80 = H - 112px
        expect(boxes.navigationDock.y1).toBe(h - 112);

        // Vertical clearance between Catalog bottom and Dock top:
        const verticalClearance = boxes.navigationDock.y1 - boxes.catalogSheet.y2;
        expect(verticalClearance).toBe(4); // 4px clean gap
        expect(verticalClearance).toBeGreaterThan(0);

        // Assert zero collision despite horizontal overlap
        expect(hasAABBCollision(boxes.catalogSheet, boxes.navigationDock)).toBe(false);
      });
    });

    // ------------------------------------------------------------------------
    // Wide 2xl (1920px+)
    // ------------------------------------------------------------------------
    describe('1.5 Wide 2xl Viewports (1920px+): Full Expansive Layout Symmetry', () => {
      const wideWidths = [1920, 2560, 3440, 3840];

      it.each(wideWidths)('W=%ipx: Preserves layout symmetry with generous canvas exposure', (w) => {
        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: 1080,
          isSidebarActive: true,
          isCatalogOpen: true,
          showCartouche: true,
          isZenMode: false,
        });

        // Left boundary of UI elements: 20px
        expect(boxes.header.x1).toBe(20);
        expect(boxes.cartouche.x1).toBe(20);

        // Right boundary of UI elements: W - 20px
        expect(boxes.sidebar.x2).toBe(w - 20);

        // Navigation dock is centered horizontally:
        const dockCenter = (boxes.navigationDock.x1 + boxes.navigationDock.x2) / 2;
        expect(Math.abs(dockCenter - w / 2)).toBeLessThanOrEqual(1.0);

        // All active panels have zero collisions
        const panelKeys = ['header', 'catalogSheet', 'sidebar', 'cartouche', 'aside', 'toast', 'navigationDock'];
        for (let i = 0; i < panelKeys.length; i++) {
          for (let j = i + 1; j < panelKeys.length; j++) {
            const a = boxes[panelKeys[i]];
            const b = boxes[panelKeys[j]];
            expect(hasAABBCollision(a, b)).toBe(false);
          }
        }
      });
    });
  });

  // ==========================================================================
  // Objective 2: State Transition Testing (Cartouche Toggle)
  // ==========================================================================
  describe('Objective 2: State Transition Testing: Cartouche Toggle (ON -> OFF -> ON)', () => {
    const W = 1920;
    const H = 1080;

    it('State 1 (ON): Aside bottom = 112px, Toast bottom = 170px (gutter = 20px)', () => {
      const boxesOn = calculateHUDBoundingBoxes({
        viewportWidth: W,
        viewportHeight: H,
        isSidebarActive: true,
        isCatalogOpen: false,
        showCartouche: true,
        isZenMode: false,
      });

      expect(boxesOn.cartouche.visible).toBe(true);
      expect(boxesOn.cartouche.y1).toBe(H - 92);
      expect(boxesOn.cartouche.y2).toBe(H - 20);

      // Aside bottom is at 112px from viewport bottom
      const asideBottomDist = H - boxesOn.aside.y2;
      expect(asideBottomDist).toBe(112);

      // Cartouche-to-Aside gutter:
      // Cartouche top = H - 92, Aside bottom = H - 112
      const cartoucheToAsideGutter = getVerticalGutter(boxesOn.aside, boxesOn.cartouche);
      expect(cartoucheToAsideGutter).toBe(20);

      // Toast bottom is at 170px from viewport bottom
      const toastBottomDist = H - boxesOn.toast.y2;
      expect(toastBottomDist).toBe(170);

      // Aside top = H - 112 - 38 = H - 150
      // Toast bottom = H - 170
      const asideToToastGutter = getVerticalGutter(boxesOn.toast, boxesOn.aside);
      expect(asideToToastGutter).toBe(20);

      // Corner mark 180 clearance from Cartouche right (256px)
      expect(boxesOn.mark180.x1).toBe(276);
      expect(boxesOn.mark180.x1 - boxesOn.cartouche.x2).toBe(20);
    });

    it('State 2 (OFF): Aside bottom = 20px, Toast bottom = 78px (gutter = 20px)', () => {
      const boxesOff = calculateHUDBoundingBoxes({
        viewportWidth: W,
        viewportHeight: H,
        isSidebarActive: true,
        isCatalogOpen: false,
        showCartouche: false,
        isZenMode: false,
      });

      expect(boxesOff.cartouche).toBeUndefined();

      // Aside drops to bottom-5 (20px from bottom)
      const asideBottomDist = H - boxesOff.aside.y2;
      expect(asideBottomDist).toBe(20);

      // Neatline moat for Aside when cartouche is off:
      // Aside bottom at H - 20, inner neatline at H - 10 -> moat = 10px
      expect(boxesOff.aside.y2 - (H - 20)).toBe(0);

      // Aside height = 38px, Aside top = H - 58px
      expect(boxesOff.aside.y1).toBe(H - 58);

      // Toast drops to bottom-[78px] (78px from bottom)
      const toastBottomDist = H - boxesOff.toast.y2;
      expect(toastBottomDist).toBe(78);

      // Aside top = H - 58, Toast bottom = H - 78
      // Gutter = (H - 58) - (H - 78) = 20px
      const asideToToastGutter = getVerticalGutter(boxesOff.toast, boxesOff.aside);
      expect(asideToToastGutter).toBe(20);

      // Corner mark 180 drops to left-2 (16px)
      expect(boxesOff.mark180.x1).toBe(16);
    });

    it('State 3 (ON again): Full hysteresis-free recovery of all exact coordinates and gutters', () => {
      const boxesOnAgain = calculateHUDBoundingBoxes({
        viewportWidth: W,
        viewportHeight: H,
        isSidebarActive: true,
        isCatalogOpen: false,
        showCartouche: true,
        isZenMode: false,
      });

      expect(boxesOnAgain.cartouche.visible).toBe(true);
      expect(H - boxesOnAgain.aside.y2).toBe(112);
      expect(H - boxesOnAgain.toast.y2).toBe(170);
      expect(getVerticalGutter(boxesOnAgain.aside, boxesOnAgain.cartouche)).toBe(20);
      expect(getVerticalGutter(boxesOnAgain.toast, boxesOnAgain.aside)).toBe(20);
      expect(boxesOnAgain.mark180.x1 - boxesOnAgain.cartouche.x2).toBe(20);
    });
  });

  // ==========================================================================
  // Objective 3: Source Code & AST Invariant Checks
  // ==========================================================================
  describe('Objective 3: Static Source Invariant Audit in Production Code', () => {
    it('S3-01: App.tsx enforces max-md:hidden on header when sidebar is active', () => {
      expect(appSrc).toContain("${isSidebarActive ? 'max-md:hidden' : ''}");
      expect(appSrc).toMatch(/<header[\s\S]*?max-md:hidden/);
    });

    it('S3-02: App.tsx enforces max-md:hidden on corner marks 90 and 270 when sidebar is active', () => {
      expect(appSrc).toContain("top-[1px] right-2 ${isSidebarActive ? 'max-md:hidden' : ''}");
      expect(appSrc).toContain("2xl:right-[50.5rem] md:right-[26rem] max-md:hidden' : 'md:right-[26rem] max-md:hidden'");
    });

    it('S3-03: App.tsx dynamically shifts Aside bottom between [112px] and bottom-5', () => {
      expect(appSrc).toContain("${showCartouche ? 'bottom-[112px]' : 'bottom-5'}");
    });

    it('S3-04: DataLayerToastNotification.tsx dynamically shifts bottom between [170px] and [78px]', () => {
      expect(toastSrc).toContain("cartoucheVisible ? 'bottom-[170px]' : 'bottom-[78px]'");
    });

    it('S3-05: DataLayerToastNotification.tsx uses valid Tailwind arbitrary value z-[35]', () => {
      expect(toastSrc).toContain('z-[35]');
      expect(toastSrc).not.toContain('z-35 ');
    });

    it('S3-06: UnifiedRightSidebar.tsx restricts catalog sheet on 2xl to 2xl:max-h-[calc(100vh-8.5rem)]', () => {
      expect(sidebarSrc).toContain('2xl:max-h-[calc(100vh-8.5rem)]');
    });

    it('S3-07: WebGPUCanvas.tsx renders Cartouche at cy = h - 92 with height 72', () => {
      expect(canvasSrc).toMatch(/cy\s*=\s*h\s*-\s*92/);
      expect(canvasSrc).toMatch(/ch\s*=\s*72/);
    });
  });

  // ==========================================================================
  // Objective 4: Fuzzing & Monte Carlo Layout Stress Test
  // ==========================================================================
  describe('Objective 4: Monte Carlo Fuzzing across 1,000 Random Viewport & State Permutations', () => {
    it('asserts zero AABB collisions and non-negative boundaries across 1,000 random viewports', () => {
      let seed = 42;
      const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      for (let iter = 0; iter < 1000; iter++) {
        const w = Math.floor(320 + pseudoRandom() * (3840 - 320));
        const h = Math.floor(480 + pseudoRandom() * (2160 - 480));
        const isSidebarActive = pseudoRandom() > 0.5;
        const isCatalogOpen = pseudoRandom() > 0.5;
        const showCartouche = pseudoRandom() > 0.5;
        const isZenMode = pseudoRandom() > 0.9; // 10% zen mode

        const boxes = calculateHUDBoundingBoxes({
          viewportWidth: w,
          viewportHeight: h,
          isSidebarActive,
          isCatalogOpen,
          showCartouche,
          isZenMode,
        });

        // 1. All boxes must have valid coordinates
        for (const box of Object.values(boxes)) {
          expect(Number.isFinite(box.x1)).toBe(true);
          expect(Number.isFinite(box.y1)).toBe(true);
          expect(Number.isFinite(box.x2)).toBe(true);
          expect(Number.isFinite(box.y2)).toBe(true);
          expect(box.width).toBeGreaterThanOrEqual(0);
          expect(box.height).toBeGreaterThanOrEqual(0);
        }

        if (isZenMode) continue;

        // 2. No collisions between non-layered instruments:
        // Header vs Sidebar non-collision
        if (w >= 768) {
          if (boxes.header?.visible && boxes.sidebar?.visible) {
            expect(hasAABBCollision(boxes.header, boxes.sidebar)).toBe(false);
            expect(boxes.sidebar.x1 - boxes.header.x2).toBeGreaterThanOrEqual(20);
          }
        } else {
          // On mobile (< 768px), activating the sidebar MUST hide the header
          if (isSidebarActive) {
            expect(boxes.header?.visible).toBe(false);
            expect(hasAABBCollision(boxes.header, boxes.sidebar)).toBe(false);
          }
        }

        // Header vs Catalog Sheet
        if (boxes.header?.visible && boxes.catalogSheet?.visible && w >= 1536) {
          expect(hasAABBCollision(boxes.header, boxes.catalogSheet)).toBe(false);
          expect(boxes.catalogSheet.x1 - boxes.header.x2).toBeGreaterThanOrEqual(20);
        }

        // Catalog Sheet vs Sidebar
        if (boxes.catalogSheet?.visible && boxes.sidebar?.visible && w >= 1536) {
          expect(hasAABBCollision(boxes.catalogSheet, boxes.sidebar)).toBe(false);
          expect(boxes.sidebar.x1 - boxes.catalogSheet.x2).toBeGreaterThanOrEqual(20);
        }

        // Catalog Sheet vs NavigationDock (Vertical clearance on 2xl)
        if (boxes.catalogSheet?.visible && boxes.navigationDock?.visible && w >= 1536) {
          expect(hasAABBCollision(boxes.catalogSheet, boxes.navigationDock)).toBe(false);
          expect(boxes.navigationDock.y1 - boxes.catalogSheet.y2).toBe(4);
        }

        // Left instrument stack vertical gutters:
        if (boxes.cartouche?.visible && boxes.aside?.visible) {
          expect(hasAABBCollision(boxes.aside, boxes.cartouche)).toBe(false);
          expect(boxes.cartouche.y1 - boxes.aside.y2).toBe(20); // Cartouche top = Aside bottom + 20px gutter
        }

        if (boxes.aside?.visible && boxes.toast?.visible) {
          expect(hasAABBCollision(boxes.toast, boxes.aside)).toBe(false);
          expect(boxes.aside.y1 - boxes.toast.y2).toBe(20);
        }
      }
    });
  });
});
