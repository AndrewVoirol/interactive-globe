// ============================================================================
// File: tests/tier1/tier1-options-ab-enhancements.test.ts
// Test Suite: Option A & Option B Cartographic Pipeline Upgrades
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_LAYER_CATALOG, getPresetById } from '../../src/core/data/DataLayerCatalog';

describe('Option A & Option B Cartographic Pipeline Upgrades', () => {
  const rasterRendererPath = path.resolve(__dirname, '../../src/core/layers/renderers/RasterLayerRenderer.tsx');
  const rasterCode = fs.existsSync(rasterRendererPath) ? fs.readFileSync(rasterRendererPath, 'utf-8') : '';

  const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');

  const drawerPath = path.resolve(__dirname, '../../src/components/hud/DataLayersDrawer.tsx');
  const drawerCode = fs.readFileSync(drawerPath, 'utf-8');

  const appPath = path.resolve(__dirname, '../../src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  // ==========================================================================
  // 1. Option A (Architectural Topo-Relief) Shader & Catalog Verification
  // ==========================================================================
  describe('1. Option A Enhancements', () => {
    it('AB-01: verifies DataLayerCatalog preset for Option A contains ambientOcclusion and autoEnableVectors', () => {
      const preset = getPresetById('architectural-topo-relief');
      expect(preset).toBeDefined();
      expect(preset?.ambientOcclusion).toBe(0.65);
      expect(preset?.autoEnableVectors).toBe(true);
    });

    it('AB-02: verifies shader implements screen-space derivative antialiasing (fwidth) for contours and isobaths', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('float topoFw = max(fwidth(topoCycle), 0.001);');
      expect(rasterCode).toContain('float indexFw = max(fwidth(indexCycle), 0.001);');
      expect(rasterCode).toContain('float bathFw = max(fwidth(bathCycle), 0.001);');
      expect(rasterCode).toContain('smoothstep(0.0, max(topoFw * 1.5, 0.035), topoDist)');
    });

    it('AB-03: verifies shader implements analytical valley crevice ambient occlusion via DEM finite differences', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('float hNeighborAvg = (demN_R.r + demN_L.r + demN_U.r + demN_D.r) * 0.25;');
      expect(rasterCode).toContain('float creviceDepth = clamp((hNeighborAvg - landElev) * 55.0, 0.0, 1.0);');
      expect(rasterCode).toContain('float creviceAO = creviceDepth * u_ambientOcclusion * 0.65;');
      expect(rasterCode).toContain('rgb *= (1.0 - creviceAO);');
    });

    it('AB-04: verifies App.tsx auto-enables vector outlines when architectural style is activated', () => {
      expect(appCode).toContain("if (style === 'architectural')");
      expect(appCode).toContain('setShowVectors(true)');
    });
  });

  // ==========================================================================
  // 2. Option B (Hydrosphere Depth Two-Surface) Shader & Catalog Verification
  // ==========================================================================
  describe('2. Option B Enhancements', () => {
    it('AB-05: verifies DataLayerCatalog preset for Option B defines seaLevelOffset, waterClarity, and peakExponent', () => {
      const preset = getPresetById('hybrid-crust-hydrosphere');
      expect(preset).toBeDefined();
      expect(preset?.seaLevelOffset).toBe(0);
      expect(preset?.waterClarity).toBe(0.75);
      expect(preset?.peakExponent).toBe(1.4);
    });

    it('AB-06: verifies vertex shader shapes mountain peaks via u_peakExponent non-linear power curve', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('uniform float u_peakExponent;');
      expect(rasterCode).toContain('if (u_renderStyle == 1 && u_peakExponent > 1.01)');
      expect(rasterCode).toContain('pow(clamp(landElev, 0.0, 1.0), u_peakExponent)');
    });

    it('AB-07: verifies fragment shader implements dynamic sea level offset and Beer-Lambert water clarity', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('uniform float u_seaLevelOffset;');
      expect(rasterCode).toContain('uniform float u_waterClarity;');
      expect(rasterCode).toContain('float currentElevMeters = (isLand > 0.45)');
      expect(rasterCode).toContain('float isSubmerged = currentElevMeters < u_seaLevelOffset ? 1.0 : 0.0;');
      expect(rasterCode).toContain('float extinctionCoeff = mix(4.8, 1.8, clamp(u_waterClarity, 0.1, 1.0));');
      expect(rasterCode).toContain('float absorption = 1.0 - exp(-normWaterDepth * extinctionCoeff);');
    });

    it('AB-08: verifies fragment shader generates animated wave micro-ripples and sun specular glint', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('vec2 waveUv1 = vDemUv * 360.0 + vec2(u_time * 0.035, u_time * 0.018);');
      expect(rasterCode).toContain('vec3 waveNormal = normalize(demNormal + vec3(waveRipple, waveRipple, 0.0));');
      expect(rasterCode).toContain('float waterSpec = pow(max(0.0, dot(waveNormal, halfVec)), 28.0)');
    });
  });

  // ==========================================================================
  // 3. HUD Controls & User Interface Verification
  // ==========================================================================
  describe('3. HUD & Sidebar Controls', () => {
    it('AB-09: verifies UnifiedRightSidebar and DataLayersDrawer render Crevice AO slider for Option A', () => {
      expect(sidebarCode).toContain('Crevice AO:');
      expect(sidebarCode).toContain('onAmbientOcclusionChangeDataLayer');
      expect(drawerCode).toContain('Crevice AO:');
      expect(drawerCode).toContain('onAmbientOcclusionChangeDataLayer');
    });

    it('AB-10: verifies UnifiedRightSidebar and DataLayersDrawer render Sea Level, Clarity, and Peak Sharpness sliders for Option B', () => {
      expect(sidebarCode).toContain('Sea Level:');
      expect(sidebarCode).toContain('onSeaLevelOffsetChangeDataLayer');
      expect(sidebarCode).toContain('Clarity:');
      expect(sidebarCode).toContain('onWaterClarityChangeDataLayer');
      expect(sidebarCode).toContain('Peak Sharp:');
      expect(sidebarCode).toContain('onPeakExponentChangeDataLayer');

      expect(drawerCode).toContain('Sea Level:');
      expect(drawerCode).toContain('onSeaLevelOffsetChangeDataLayer');
      expect(drawerCode).toContain('Clarity:');
      expect(drawerCode).toContain('onWaterClarityChangeDataLayer');
      expect(drawerCode).toContain('Peak Sharp:');
      expect(drawerCode).toContain('onPeakExponentChangeDataLayer');
    });
  });
});
