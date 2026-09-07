// ============================================================================
// File: tests/tier1/tier1-design-system-bugs-and-polish.test.ts
// Tier 1 Contract Tests: Design System Bug Fixes, Token Normalization & Spring Physics
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Tier 1: Design System Bug Fixes & Architecture Polish', () => {
  const appTsxPath = path.resolve(__dirname, '../../src/App.tsx');
  const webgpuFallbackPath = path.resolve(__dirname, '../../src/components/canvas/WebGPUFallback.tsx');
  const toastPath = path.resolve(__dirname, '../../src/components/hud/DataLayerToastNotification.tsx');
  const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
  const indexCssPath = path.resolve(__dirname, '../../index.css');
  const systemStatusPillPath = path.resolve(__dirname, '../../src/components/hud/SystemStatusPill.tsx');
  const topologyDockPath = path.resolve(__dirname, '../../src/components/hud/TopologyControlDock.tsx');
  const dataLayersDrawerPath = path.resolve(__dirname, '../../src/components/hud/DataLayersDrawer.tsx');
  const sunCompassPath = path.resolve(__dirname, '../../src/components/hud/instruments/PolarSunCompass.tsx');
  const tideGaugePath = path.resolve(__dirname, '../../src/components/hud/instruments/BathymetricTideGauge.tsx');
  const reliefCurvePath = path.resolve(__dirname, '../../src/components/hud/instruments/HypsometricReliefCurve.tsx');
  const sextantPath = path.resolve(__dirname, '../../src/components/hud/instruments/CurvatureUnfurlSextant.tsx');

  it('verifies that the Air Dancer button was removed from App.tsx with an easter egg TODO', () => {
    const appContent = fs.readFileSync(appTsxPath, 'utf-8');

    // Should NOT have the floating 🎈 button
    expect(appContent).not.toMatch(/<button[^>]*>\s*🎈/);
    expect(appContent).not.toMatch(/title="Launch Dancing Inflatable Tube Man/);

    // Should include a TODO comment for future subtle easter egg pass
    expect(appContent.toLowerCase()).toContain('easter egg');
  });

  it('verifies that App.tsx replaces hardcoded neatlineTheme color tables with CSS custom variables', () => {
    const appContent = fs.readFileSync(appTsxPath, 'utf-8');

    // neatlineTheme object mapping hardcoded hexes should be replaced
    expect(appContent).not.toMatch(/const\s+neatlineTheme\s*=\s*\{/);
    expect(appContent).toContain('var(--theme-neatline-border)');
    expect(appContent).toContain('var(--theme-panel-bg)');
  });

  it('verifies that WebGPUFallback correctly supports Theme 2 Cyanotype as dark mode', () => {
    const fallbackContent = fs.readFileSync(webgpuFallbackPath, 'utf-8');

    // Must not treat theme 2 as light
    expect(fallbackContent).not.toContain('const isDark = theme === 0;');
    expect(fallbackContent).toMatch(/isDark\s*=\s*theme\s*!==\s*1/);
    expect(fallbackContent).toContain('paper-cyanotype');
    expect(fallbackContent).toContain('var(--theme-card-bg)');
  });

  it('verifies that DataLayerToastNotification binds to CSS variables without light-inversion bugs', () => {
    const toastContent = fs.readFileSync(toastPath, 'utf-8');

    expect(toastContent).not.toMatch(/const\s+isLight\s*=\s*theme\s*===\s*1;/);
    expect(toastContent).toContain('var(--theme-card-bg)');
    expect(toastContent).toContain('var(--theme-card-border)');
    expect(toastContent).toContain('var(--theme-text-primary)');
    expect(toastContent).toContain('var(--theme-text-accent)');
  });

  it('verifies that UnifiedRightSidebar contains zero raw pixel font classes', () => {
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

    // Matches any raw pixel font utility like text-[7px], text-[7.5px], text-[8px], text-[9px], text-[10px], etc.
    const rawPixelMatches = sidebarContent.match(/text-\[[0-9]+(?:\.[0-9]+)?px\]/g);
    expect(rawPixelMatches).toBeNull();

    // Verifies canonical design system typography tokens are present
    expect(sidebarContent).toContain('text-nano');
    expect(sidebarContent).toContain('text-micro');
    expect(sidebarContent).toContain('text-body');
  });

  it('verifies that spring physics recoil curves are defined in index.css and used in UnifiedRightSidebar', () => {
    const cssContent = fs.readFileSync(indexCssPath, 'utf-8');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

    // Keyframes with cubic-bezier bounce
    expect(cssContent).toContain('@keyframes scrollUnfurl');
    expect(cssContent).toContain('@keyframes scrollRollUp');
    expect(cssContent).toMatch(/cubic-bezier\(0\.34,\s*1\.[0-9]+,\s*0\.64,\s*1\)/);
    expect(cssContent).toContain('.sidebar-spring-transition');

    // Sidebar uses the spring transition class
    expect(sidebarContent).toContain('sidebar-spring-transition');
  });

  it('verifies precision instruments use theme card and text CSS variables', () => {
    const sunCompass = fs.readFileSync(sunCompassPath, 'utf-8');
    const tideGauge = fs.readFileSync(tideGaugePath, 'utf-8');
    const reliefCurve = fs.readFileSync(reliefCurvePath, 'utf-8');
    const sextant = fs.readFileSync(sextantPath, 'utf-8');

    expect(sunCompass).toContain('var(--theme-card-bg)');
    expect(sunCompass).toContain('var(--theme-card-border)');

    expect(tideGauge).toContain('var(--theme-card-bg)');
    expect(tideGauge).toContain('var(--theme-card-border)');

    expect(reliefCurve).toContain('var(--theme-card-bg)');
    expect(reliefCurve).toContain('var(--theme-card-border)');

    expect(sextant).toContain('var(--theme-card-bg)');
    expect(sextant).toContain('var(--theme-card-border)');
  });

  it('verifies that legacy testbed components support 3-theme type signatures', () => {
    const pill = fs.readFileSync(systemStatusPillPath, 'utf-8');
    const dock = fs.readFileSync(topologyDockPath, 'utf-8');
    const drawer = fs.readFileSync(dataLayersDrawerPath, 'utf-8');

    expect(pill).toMatch(/theme:\s*0\s*\|\s*1\s*\|\s*2/);
    expect(dock).toMatch(/theme:\s*0\s*\|\s*1\s*\|\s*2/);
    expect(drawer).toMatch(/theme:\s*0\s*\|\s*1\s*\|\s*2/);
  });
});
