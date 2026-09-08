import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import {
  DARK_CYBER_UI_TOKENS,
  LIGHT_MONOCHROME_UI_TOKENS,
  PRUSSIAN_CYANOTYPE_UI_TOKENS,
} from '../../src/core/themes/ThemeManager';
import { UnifiedRightSidebar, UnifiedRightSidebarProps } from '../../src/components/hud/UnifiedRightSidebar';
import { PolarSunCompass } from '../../src/components/hud/instruments/PolarSunCompass';
import { HypsometricReliefCurve } from '../../src/components/hud/instruments/HypsometricReliefCurve';
import { BathymetricTideGauge } from '../../src/components/hud/instruments/BathymetricTideGauge';
import { DataLayerItem } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Round 6: Design System Ergonomics, Hover Transitions & Layout Safety', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const indexCssPath = path.join(rootDir, 'index.css');
  const tailwindConfigPath = path.join(rootDir, 'tailwind.config.js');
  const themeManagerPath = path.join(rootDir, 'src/core/themes/ThemeManager.ts');
  const appPath = path.join(rootDir, 'src/App.tsx');
  const sidebarPath = path.join(rootDir, 'src/components/hud/UnifiedRightSidebar.tsx');

  const indexCss = fs.readFileSync(indexCssPath, 'utf-8');
  const tailwindConfig = fs.readFileSync(tailwindConfigPath, 'utf-8');
  const themeManagerCode = fs.readFileSync(themeManagerPath, 'utf-8');
  const appCode = fs.readFileSync(appPath, 'utf-8');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');

  describe('Defect 1 & 6: Hover Border Token Synchronization Across Themes', () => {
    it('defines --theme-card-border-hover in all 3 themes in index.css', () => {
      expect(indexCss).toMatch(/\[data-theme=["']tharp["']\][\s\S]*?--theme-card-border-hover:\s*#415164/i);
      expect(indexCss).toMatch(/\[data-theme=["']cream["']\][\s\S]*?--theme-card-border-hover:\s*#B8AD98/i);
      expect(indexCss).toMatch(/\[data-theme=["']cyanotype["']\][\s\S]*?--theme-card-border-hover:\s*#3B597A/i);
    });

    it('registers cardBorderHover in ThemeManager UIThemeTokens', () => {
      expect(DARK_CYBER_UI_TOKENS.cardBorderHover).toBe('#415164');
      expect(LIGHT_MONOCHROME_UI_TOKENS.cardBorderHover).toBe('#B8AD98');
      expect(PRUSSIAN_CYANOTYPE_UI_TOKENS.cardBorderHover).toBe('#3B597A');
      expect(themeManagerCode).toContain("target.style.setProperty('--theme-card-border-hover', ui.cardBorderHover);");
    });

    it('exposes theme-card-border-hover in tailwind.config.js', () => {
      expect(tailwindConfig).toContain("'theme-card-border-hover': 'var(--theme-card-border-hover)'");
    });
  });

  describe('Defect 1: Viewport Calibration Bar & Sidebar Layout Clearance', () => {
    it('docks header with clearance to eliminate physical bounding box collision with 24rem sidebar', () => {
      expect(appCode).toMatch(/md:right-\[(?:25\.5|26\.5)rem\]/);
      expect(appCode).not.toContain('md:right-84');
    });
  });

  describe('Defect 2: Paper Scroll Drop Shadows and Contrast Harmony', () => {
    it('applies theme-adaptive warm sepia shadow in Cream mode instead of pitch-black rgba(0,0,0,0.5)', () => {
      expect(indexCss).toContain('[data-theme="cream"] .scroll-curl-lip');
      expect(indexCss).toContain('rgba(140, 114, 82, 0.22)');
      expect(indexCss).toContain('[data-theme="cyanotype"] .scroll-curl-lip');
    });
  });

  describe('Defect 4: Optical Reticle Inactive State Contrast in Cream Rag Paper', () => {
    it('renders distinct intaglio copper ring in Cream mode for inactive radio reticles', () => {
      expect(sidebarCode).toContain("border-[#8C4820]/45 bg-[#8C4820]/5 group-hover:border-[#8C4820]");
    });
  });

  describe('Defect 5: Hypsometric Pigment Pans Text Wrapping', () => {
    it('removes single-line truncate from pigment pan labels and applies 2-line wrapped text-nano', () => {
      expect(sidebarCode).toContain('text-nano font-serif-title line-clamp-2 h-5 flex items-center justify-center');
      expect(sidebarCode).not.toMatch(/div\s+className=["'][^"']*font-serif-title\s+truncate/);
    });
  });

  describe('Defect 7: Planetary Instrumentation Contrast in Cream and Cyanotype', () => {
    it('provides theme-aware high contrast styles for NOAA, Starlink, Jet Stream, and Crane badges', () => {
      expect(sidebarCode).toContain("border-[#2b6b88]/60 bg-[#2b6b88]/15 text-[#1a4457]");
      expect(sidebarCode).toContain("border-[#5a4878]/60 bg-[#5a4878]/15 text-[#3d2e54]");
      expect(sidebarCode).toContain("border-[#96641e]/60 bg-[#96641e]/15 text-[#52350c]");
    });

    it('uses semantic control tokens for Base Lattice Clean Terrain and Node Cloud buttons', () => {
      expect(sidebarCode).toContain('Clean Terrain');
      expect(sidebarCode).toContain('+ Node Cloud');
      expect(sidebarCode).toContain("bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)]");
    });
  });

  describe('Defect 8: Layers Tab (Plate 5) Slider Labels and Action Controls', () => {
    it('unifies slider labels to semantic text-[var(--theme-text-primary)]', () => {
      expect(sidebarCode).toContain("text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider");
    });

    it('ensures action buttons in active layers and catalog have cursor-pointer and hover borders', () => {
      expect(sidebarCode).toContain("hover:border-[var(--theme-card-border-hover)]");
    });
  });

  describe('Defect 9: Tailwind Dark Mode Decoupling', () => {
    it('configures selector-based darkMode targeting tharp and cyanotype attributes', () => {
      expect(tailwindConfig).toMatch(/darkMode:\s*\[['"]selector['"],\s*['"]\[data-theme=["']tharp["']\],\s*\[data-theme=["']cyanotype["']\]['"]\]/);
    });
  });

  // =========================================================================
  // Master Design System & Architectural Decisions Verification
  // =========================================================================

  const compassPath = path.join(rootDir, 'src/components/hud/instruments/PolarSunCompass.tsx');
  const reliefPath = path.join(rootDir, 'src/components/hud/instruments/HypsometricReliefCurve.tsx');
  const tidePath = path.join(rootDir, 'src/components/hud/instruments/BathymetricTideGauge.tsx');

  const compassCode = fs.readFileSync(compassPath, 'utf-8');
  const reliefCode = fs.readFileSync(reliefPath, 'utf-8');
  const tideCode = fs.readFileSync(tidePath, 'utf-8');

  describe('Locked-In Decision 1: Semantic Status & Mineral Inks Across Physical Mediums', () => {
    it('defines --theme-status-sage, slate, and amber across all 3 themes in index.css', () => {
      expect(indexCss).toMatch(/\[data-theme=["']tharp["']\][\s\S]*?--theme-status-sage:\s*#34D399/i);
      expect(indexCss).toMatch(/\[data-theme=["']cream["']\][\s\S]*?--theme-status-sage:\s*#1B432B/i);
      expect(indexCss).toMatch(/\[data-theme=["']cyanotype["']\][\s\S]*?--theme-status-sage:\s*#4FA3E3/i);

      expect(indexCss).toMatch(/\[data-theme=["']tharp["']\][\s\S]*?--theme-status-slate:\s*#4FD1C5/i);
      expect(indexCss).toMatch(/\[data-theme=["']cream["']\][\s\S]*?--theme-status-slate:\s*#1A4457/i);
      expect(indexCss).toMatch(/\[data-theme=["']cyanotype["']\][\s\S]*?--theme-status-slate:\s*#6B94BD/i);

      expect(indexCss).toMatch(/\[data-theme=["']tharp["']\][\s\S]*?--theme-status-amber:\s*#F59E0B/i);
      expect(indexCss).toMatch(/\[data-theme=["']cream["']\][\s\S]*?--theme-status-amber:\s*#7D4700/i);
      expect(indexCss).toMatch(/\[data-theme=["']cyanotype["']\][\s\S]*?--theme-status-amber:\s*#E2C37E/i);
    });

    it('exposes status tokens in ThemeManager UIThemeTokens and registers CSS properties', () => {
      expect(DARK_CYBER_UI_TOKENS.statusSage).toBe('#34D399');
      expect(LIGHT_MONOCHROME_UI_TOKENS.statusSage).toBe('#1B432B');
      expect(PRUSSIAN_CYANOTYPE_UI_TOKENS.statusSage).toBe('#4FA3E3');

      expect(themeManagerCode).toContain("target.style.setProperty('--theme-status-sage', ui.statusSage);");
      expect(themeManagerCode).toContain("target.style.setProperty('--theme-status-slate', ui.statusSlate);");
      expect(themeManagerCode).toContain("target.style.setProperty('--theme-status-amber', ui.statusAmber);");
    });

    it('exposes semantic status tokens in tailwind.config.js', () => {
      expect(tailwindConfig).toContain("'theme-status-sage': 'var(--theme-status-sage)'");
      expect(tailwindConfig).toContain("'theme-status-slate': 'var(--theme-status-slate)'");
      expect(tailwindConfig).toContain("'theme-status-amber': 'var(--theme-status-amber)'");
    });

    it('uses var(--theme-status-sage) in Row 1 engine status and audio controls', () => {
      expect(sidebarCode).toContain('bg-[var(--theme-status-sage)]');
      expect(sidebarCode).toContain('border-[var(--theme-status-sage)]');
    });

    it('has zero remaining fluorescent emerald classes in UnifiedRightSidebar', () => {
      expect(sidebarCode).not.toContain('bg-emerald-400');
      expect(sidebarCode).not.toContain('bg-emerald-500');
      expect(sidebarCode).not.toContain('text-emerald-400');
      expect(sidebarCode).not.toContain('text-emerald-500');
    });
  });

  describe('Locked-In Decision 2: Upper Calibration Bar Clearance & Geodetic Metadata', () => {
    it('anchors calibration bar and aside without relative positioning collision', () => {
      expect(appCode).not.toContain('fixed top-4 left-4 z-20 pointer-events-auto relative');
    });

    it('docks header with dynamic right margin responding to catalog open state', () => {
      expect(appCode).toMatch(/isCatalogOpen \? '(?:2xl:right-\[51\.75rem\] md:right-\[26\.5rem\]|2xl:right-\[50rem\] md:right-\[25\.5rem\])' : 'md:right-\[(?:26\.5|25\.5)rem\]'/);
    });

    it('displays WGS84 // EPSG:4326 geodetic surveying metadata in calibration header', () => {
      expect(appCode).toContain('WGS84 // EPSG:4326');
    });
  });

  describe('Locked-In Decision 3: Global Intaglio Tactile Cursor & Spring Mechanical Curves', () => {
    it('enforces global pointer cursor contract across interactive classes and buttons in index.css', () => {
      expect(indexCss).toMatch(/button,\s*input\[type="range"\],\s*\.tactile-btn,\s*\[role="button"\],\s*\.pigment-pan,\s*\.folio-strip,\s*\.domain-chip\s*\{\s*cursor:\s*pointer;/);
    });

    it('applies 1px active mechanical press depression in index.css', () => {
      expect(indexCss).toContain('transform: translateY(1px)');
    });

    it('defines distinct physical spring curves (--theme-spring-switch) per medium in index.css', () => {
      expect(indexCss).toMatch(/\[data-theme=["']cream["']\][\s\S]*?--theme-spring-switch:\s*280ms/i);
      expect(indexCss).toMatch(/\[data-theme=["']cyanotype["']\][\s\S]*?--theme-spring-switch:\s*180ms/i);
      expect(indexCss).toMatch(/\[data-theme=["']tharp["']\][\s\S]*?--theme-spring-switch:\s*350ms/i);
    });

    it('defines medium physical properties (--theme-shadow-ambient, thumb shadow, cathode glow)', () => {
      expect(indexCss).toContain('--theme-shadow-ambient');
      expect(indexCss).toContain('--theme-switch-thumb-shadow');
      expect(indexCss).toContain('--theme-cathode-glow');
    });
  });

  describe('Locked-In Decision 4 & 5: Plate 4 Full-Width Slips & Plate 5 Folio Accordion', () => {
    it('converts Plate 4 planetary instrumentation to full-width horizontal slips (~38px tall)', () => {
      expect(sidebarCode).toContain('min-h-[38px]');
      expect(sidebarCode).toContain('NOAA Wind');
      expect(sidebarCode).toContain('Starlink Orbits');
      expect(sidebarCode).toContain('Jet Stream');
      expect(sidebarCode).toContain('Origami Crane');
    });

    it('structures Plate 5 active layers into collapsible folio strips with accordion disclosure', () => {
      expect(sidebarCode).toContain('folio-strip');
      expect(sidebarCode).toContain('expandedLayerId');
      expect(sidebarCode).toContain('min-h-[34px]');
      expect(sidebarCode).toContain('aria-expanded={isExpanded}');
    });
  });

  describe('Locked-In Decision 6: Cartographic Data Catalog Sheet Domain Taxonomy & Filtering', () => {
    it('provides domain taxonomy filter chips [ALL], [TOPO], [VECTORS], [SATELLITE] in catalog sheet', () => {
      expect(sidebarCode).toContain('domain-chip');
      expect(sidebarCode).toContain("'all', 'topo', 'vectors', 'satellite'");
      expect(sidebarCode).toContain("all: 'ALL'");
      expect(sidebarCode).toContain("topo: 'TOPO'");
      expect(sidebarCode).toContain("vectors: 'VECTORS'");
      expect(sidebarCode).toContain("satellite: 'SATELLITE'");
    });

    it('provides clear + Add Layer to Stack and ✓ Added to Stack button states', () => {
      expect(sidebarCode).toContain('+ Add Layer to Stack');
      expect(sidebarCode).toContain('✓ Added to Stack');
    });
  });

  describe('Locked-In Decision 7: Plate 1 Hypsometric Pigment Pan Stratum Isolation', () => {
    it('manages isolatedStratum selection and attaches click handler to pigment pans', () => {
      expect(sidebarCode).toContain('isolatedStratum');
      expect(sidebarCode).toContain('setIsolatedStratum');
      expect(sidebarCode).toContain('swatch.depth');
    });
  });

  describe('Locked-In Decision 8: Zen Mode Translucent Cartographic Anchor Pill', () => {
    it('renders docked bottom-center cartographic anchor pill with idle fade and exit button', () => {
      expect(appCode).toContain('fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto');
      expect(appCode).toContain("isMouseIdle ? 'opacity-25 hover:opacity-100' : 'opacity-90'");
      expect(appCode).toContain('Exit Zen (H)');
    });
  });

  describe('Locked-In Decision 9, 10, 11, 12: Era-Specific Nautical Rosette & Scientific Instruments', () => {
    it('renders medium-adaptive ornate nautical compass rosette in App.tsx', () => {
      expect(appCode).toContain('16-point intaglio nautical compass rosette');
      expect(appCode).toContain('Architectural CAD drafting protractor');
      expect(appCode).toContain('Acoustic sonar bathymetric sounding cone');
    });

    it('renders medium-adaptive artifacts in PolarSunCompass', () => {
      expect(compassCode).toContain('compass-rose-cream');
      expect(compassCode).toContain('protractor-cyanotype');
      expect(compassCode).toContain('sonar-sweep-tharp');
    });

    it('renders medium-adaptive artifacts in HypsometricReliefCurve', () => {
      expect(reliefCode).toContain('hachures-cream');
      expect(reliefCode).toContain('cad-grid-cyanotype');
      expect(reliefCode).toContain('fathometer-tharp');
    });

    it('renders medium-adaptive artifacts in BathymetricTideGauge', () => {
      expect(tideCode).toContain('tide-staff-cream');
      expect(tideCode).toContain('manometer-cyanotype');
      expect(tideCode).toContain('ctd-column-tharp');
    });
  });

  describe('Interactive Empirical DOM Contract Verification', () => {
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

    it('DOM: validates Cartographic Data Catalog domain taxonomy filtering', async () => {
      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            isCatalogOpen: true,
          }))
        );
      });

      const chips = Array.from(container.querySelectorAll('.domain-chip'));
      expect(chips.length).toBe(4);

      const allChip = chips.find(c => c.textContent?.includes('ALL'));
      const topoChip = chips.find(c => c.textContent?.includes('TOPO'));
      const vectorsChip = chips.find(c => c.textContent?.includes('VECTORS'));
      const satChip = chips.find(c => c.textContent?.includes('SATELLITE'));

      expect(allChip).toBeDefined();
      expect(topoChip).toBeDefined();
      expect(vectorsChip).toBeDefined();
      expect(satChip).toBeDefined();

      // Click [TOPO]
      await act(async () => {
        (topoChip as HTMLButtonElement).click();
      });
      expect(container.textContent).toContain('Architectural Topographic Relief');
      expect(container.textContent).toContain('USGS Hypsometric Vector Contours');
      expect(container.textContent).not.toContain('Real NOAA GFS Surface Winds (0.25°)');

      // Click [VECTORS]
      await act(async () => {
        (vectorsChip as HTMLButtonElement).click();
      });
      expect(container.textContent).toContain('Real NOAA GFS Surface Winds (0.25°)');
      expect(container.textContent).toContain('NOAA GFS 250 hPa Jet Stream');
      expect(container.textContent).toContain('CelesTrak Active Starlink & ISS Orbits');
      expect(container.textContent).not.toContain('Architectural Topographic Relief');

      // Click [SATELLITE]
      await act(async () => {
        (satChip as HTMLButtonElement).click();
      });
      expect(container.textContent).toContain('NASA Blue Marble & Orbital Relief');
      expect(container.textContent).toContain('SpaceX Starlink & LEO Constellation');
      expect(container.textContent).toContain('NASA Blue Marble Night Lights');
      expect(container.textContent).not.toContain('Architectural Topographic Relief');

      // Return to [ALL]
      await act(async () => {
        (allChip as HTMLButtonElement).click();
      });
      expect(container.textContent).toContain('Architectural Topographic Relief');
      expect(container.textContent).toContain('Real NOAA GFS Surface Winds (0.25°)');
      expect(container.textContent).toContain('NASA Blue Marble & Orbital Relief');
    });

    it('DOM: validates Plate 5 collapsible folio accordion disclosure', async () => {
      const sampleLayers: DataLayerItem[] = [
        {
          id: 'architectural-topo-relief',
          name: 'Architectural Topographic Relief',
          category: 'topo',
          type: 'Monochrome Relief & Isolines',
          details: 'Analytical relief',
          visible: true,
          opacity: 0.95,
          blendMode: 0,
          displacementScale: 0.14,
          renderStyle: 'architectural',
          ambientOcclusion: 0.65,
        },
      ];

      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            dataLayers: sampleLayers,
          }))
        );
      });

      // Initially collapsed
      const expandBtn = container.querySelector('button[aria-expanded]') as HTMLButtonElement;
      expect(expandBtn).toBeDefined();
      expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
      const input = container.querySelector('input[name="layerAo-architectural-topo-relief"]');
      expect(input).not.toBeNull();
      const accordionContainer = input?.closest('.transition-all');
      expect(accordionContainer?.className).toContain('max-h-0');
      expect(accordionContainer?.className).toContain('opacity-0');
      expect(accordionContainer?.className).toContain('pointer-events-none');

      // Click to expand
      await act(async () => {
        expandBtn.click();
      });

      expect(expandBtn.getAttribute('aria-expanded')).toBe('true');
      expect(accordionContainer?.className).toContain('max-h-[600px]');
      expect(accordionContainer?.className).toContain('opacity-100');
      expect(accordionContainer?.className).toContain('pointer-events-auto');
      expect(container.textContent).toContain('Crevice AO:');

      // Click again to collapse
      await act(async () => {
        expandBtn.click();
      });

      expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
      expect(accordionContainer?.className).toContain('max-h-0');
      expect(accordionContainer?.className).toContain('opacity-0');
      expect(accordionContainer?.className).toContain('pointer-events-none');
    });

    it('DOM: validates Plate 1 hypsometric pigment pan stratum isolation click', async () => {
      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            theme: 0,
          }))
        );
      });

      const pans = Array.from(container.querySelectorAll('.pigment-pan'));
      expect(pans.length).toBe(5);

      // Initially no pan has ring-2
      expect(container.querySelector('.pigment-pan.ring-2')).toBeNull();

      // Click first pan
      await act(async () => {
        (pans[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const pansAfterClick = Array.from(container.querySelectorAll('.pigment-pan'));
      expect(pansAfterClick[0].classList.contains('ring-2')).toBe(true);

      // Click first pan again -> toggles off
      await act(async () => {
        (pansAfterClick[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const pansAfterSecondClick = Array.from(container.querySelectorAll('.pigment-pan'));
      expect(pansAfterSecondClick[0].classList.contains('ring-2')).toBe(false);
    });

    it('DOM: validates Roll Up button collapses open catalog sheet', async () => {
      const onCatalogOpenChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(UnifiedRightSidebar, createSidebarProps({
            isCatalogOpen: true,
            onCatalogOpenChange,
          }))
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const rollUpBtn = buttons.find(b => b.textContent?.includes('Roll Up'));
      expect(rollUpBtn).toBeDefined();

      await act(async () => {
        rollUpBtn?.click();
      });

      expect(onCatalogOpenChange).toHaveBeenCalledWith(false);
    });

    it('DOM: validates medium-adaptive vignette emblem in title cartouche across themes', async () => {
      // Theme 0: Marie Tharp Sonar Ridge
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ theme: 0 })));
      });
      expect(container.querySelector('span[title="Archival Cartouche Vignette Emblem"] svg path')?.getAttribute('d')).toContain('M1 12 Q 6 4');

      // Theme 1: Cream Rag Swiss Alpine Relief Ridge
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ theme: 1 })));
      });
      expect(container.querySelector('span[title="Archival Cartouche Vignette Emblem"] svg path')?.getAttribute('d')).toContain('M0 16 L6 7');

      // Theme 2: Prussian Cyanotype CAD Protractor
      await act(async () => {
        root.render(React.createElement(UnifiedRightSidebar, createSidebarProps({ theme: 2 })));
      });
      expect(container.querySelector('span[title="Archival Cartouche Vignette Emblem"] svg circle')?.getAttribute('stroke-dasharray')).toContain('1.5 1.5');
    });

    it('DOM: validates medium-adaptive scientific instruments per theme', async () => {
      // PolarSunCompass artifacts
      for (const t of [0, 1, 2] as const) {
        await act(async () => {
          root.render(React.createElement(PolarSunCompass, {
            azimuth: 315,
            altitude: 45,
            onChange: vi.fn(),
            theme: t,
          }));
        });
        const expectedClass = t === 1 ? 'compass-rose-cream' : t === 2 ? 'protractor-cyanotype' : 'sonar-sweep-tharp';
        expect(container.querySelector(`.${expectedClass}`)).not.toBeNull();
      }

      // HypsometricReliefCurve artifacts
      for (const t of [0, 1, 2] as const) {
        await act(async () => {
          root.render(React.createElement(HypsometricReliefCurve, {
            theme: t,
          }));
        });
        const expectedClass = t === 1 ? 'hachures-cream' : t === 2 ? 'cad-grid-cyanotype' : 'fathometer-tharp';
        expect(container.querySelector(`.${expectedClass}`)).not.toBeNull();
      }

      // BathymetricTideGauge artifacts
      for (const t of [0, 1, 2] as const) {
        await act(async () => {
          root.render(React.createElement(BathymetricTideGauge, {
            theme: t,
          }));
        });
        const expectedClass = t === 1 ? 'tide-staff-cream' : t === 2 ? 'manometer-cyanotype' : 'ctd-column-tharp';
        expect(container.querySelector(`.${expectedClass}`)).not.toBeNull();
      }
    });
  });
});
