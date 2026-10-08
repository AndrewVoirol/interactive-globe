// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/clean-digital-gis-toggle.test.tsx
// Architecture: Clean Digital GIS Toggle for Grain and Noise Suppression
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const projectRoot = path.resolve(__dirname, '../..');
const crustShaderPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
const atmosphereDrawerPath = path.join(projectRoot, 'src/components/AtmosphereDrawer.tsx');

describe('Clean Digital GIS Toggle for Grain and Noise Suppression', () => {
  const crustShaderSource = fs.readFileSync(crustShaderPath, 'utf-8');
  const atmosphereDrawerSource = fs.readFileSync(atmosphereDrawerPath, 'utf-8');

  // ==========================================================================
  // SECTION 1: WGSL Shader Procedural Grain & Noise Suppression
  // ==========================================================================
  describe('1. crust_hydrosphere.wgsl Grain & Noise Suppression', () => {
    it('GIS-WGSL-01: modulates fiberTooth by sim.u_roughness and bypasses hashPaper2D when roughness == 0.0', () => {
      // Water surface Theme 1:
      expect(crustShaderSource).toMatch(/if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{\s*fiberTooth\s*=\s*\(hashPaper2D\(uvCoord\s*\*\s*fiberFreq\)\s*-\s*0\.5\)\s*\*\s*\(sim\.u_roughness\s*\*\s*0\.35\);/);

      // Land Theme 1:
      expect(crustShaderSource).toMatch(/var\s+fiberTooth\s*=\s*0\.0;\s*if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{[\s\S]*?fiberTooth\s*=\s*\(fiberFleck\s*\*\s*0\.60\s*\+\s*fiberStrand\s*\*\s*0\.40\s*-\s*0\.50\)\s*\*\s*\(sim\.u_roughness\s*\*\s*0\.85\);/);

      // Bathymetry Theme 1:
      expect(crustShaderSource).toMatch(/var\s+bFiberTooth\s*=\s*0\.0;\s*if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{\s*bFiberTooth\s*=\s*\(hashPaper2D\(input\.uv\s*\*\s*fiberFreq\)\s*-\s*0\.5\)\s*\*\s*\(sim\.u_roughness\s*\*\s*0\.40\);/);
    });

    it('GIS-WGSL-02: modulates crystalGranularity by sim.u_roughness and bypasses hashPaper2D when roughness == 0.0', () => {
      // Land Theme 2:
      expect(crustShaderSource).toMatch(/var\s+crystalGranularity\s*=\s*0\.0;\s*if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{[\s\S]*?crystalGranularity\s*=\s*\(crystal1\s*\*\s*crystal2\s*-\s*0\.22\)\s*\*\s*2\.2\s*\*\s*sim\.u_roughness;/);

      // Bathymetry Theme 2:
      expect(crustShaderSource).toMatch(/var\s+bCrystal\s*=\s*0\.0;\s*if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{[\s\S]*?bCrystal\s*=\s*\(hashPaper2D\(bCrystalCoord\)\s*\*\s*hashPaper2D\(bCrystalCoord\s*\*\s*1\.618\s*\+\s*vec2<f32>\(7\.1,\s*31\.9\)\)\s*-\s*0\.22\)\s*\*\s*2\.0;/);
    });

    it('GIS-WGSL-03: modulates boardTooth by sim.u_roughness and bypasses hashPaper2D when roughness == 0.0', () => {
      // Water surface Theme 0:
      expect(crustShaderSource).toMatch(/if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{\s*boardTooth\s*=\s*\(hashPaper2D\(uvCoord\s*\*\s*boardFreq\)\s*-\s*0\.5\)\s*\*\s*\(sim\.u_roughness\s*\*\s*0\.25\);/);

      // Land Theme 0:
      expect(crustShaderSource).toMatch(/var\s+boardTooth\s*=\s*0\.0;\s*if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{[\s\S]*?boardTooth\s*=\s*\(boardFleck1\s*\*\s*0\.65\s*\+\s*boardFleck2\s*\*\s*0\.35\s*-\s*0\.50\)\s*\*\s*\(sim\.u_roughness\s*\*\s*0\.40\);/);
    });

    it('GIS-WGSL-04: modulates stippleTone by sim.u_roughness and bypasses hashPaper2D when roughness == 0.0', () => {
      // Land Theme 0 stippling:
      expect(crustShaderSource).toMatch(/var\s+dotMask\s*=\s*0\.0;\s*if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{[\s\S]*?dotMask\s*=\s*select\(0\.0,\s*1\.0\s*-\s*smoothstep\(dotRadius\s*-\s*0\.04,\s*dotRadius\s*\+\s*0\.04,\s*distToDot\),\s*hasDot\)\s*\*\s*fragPoleAtten;\s*\}/);
      expect(crustShaderSource).toContain('finalLand = mix(finalLand, stippleTone, dotMask * 0.40 * sim.u_mediumProperties.w * sim.u_roughness);');

      // Bathymetry Theme 0 stippling:
      expect(crustShaderSource).toContain('cBathy = mix(cBathy, cStippleInk, dotMask * 0.70 * sim.u_roughness);');
    });

    it('GIS-WGSL-05: linen weave bypasses hashPaper2D when sim.u_roughness == 0.0', () => {
      expect(crustShaderSource).toMatch(/var\s+linenTooth\s*=\s*0\.0;\s*if\s*\(\s*sim\.u_roughness\s*>\s*0\.0\s*\)\s*\{[\s\S]*?linenTooth\s*=\s*\(weaveGrid\s*\+\s*linenSlub\)\s*\*\s*\(sim\.u_roughness\s*\*\s*0\.65\);/);
    });
  });

  // ==========================================================================
  // SECTION 2: AtmosphereDrawer.tsx UI Integration
  // ==========================================================================
  describe('2. AtmosphereDrawer UI Component Integration', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {};
      }
    });

    afterEach(async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('GIS-UI-01: AtmosphereDrawer contains Appearance / Medium controls and Parchment Texture / Paper Tooth labels', () => {
      expect(atmosphereDrawerSource).toContain('Appearance / Medium');
      expect(atmosphereDrawerSource).toContain('Parchment Texture / Paper Tooth');
      expect(atmosphereDrawerSource).toContain('sidebar-paper-tooth-toggle');
      expect(atmosphereDrawerSource).toContain('sidebar-paper-tooth-slider');
    });

    it('GIS-UI-02: renders toggle switch with Parchment Texture / Paper Tooth', async () => {
      const onRoughnessChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={true}
            roughness={1.0}
            onRoughnessChange={onRoughnessChange}
          />
        );
      });

      const toggle = container.querySelector('#sidebar-paper-tooth-toggle') as HTMLButtonElement;
      expect(toggle).not.toBeNull();
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(toggle.getAttribute('title')).toContain('Parchment Texture / Paper Tooth');

      // Click to toggle off (set roughness to 0.0)
      await act(async () => {
        toggle.click();
      });

      expect(onRoughnessChange).toHaveBeenCalledWith(0.0);
      expect((window as any).__INDICATRIX_LIVE_UNIFORMS__.roughness).toBe(0.0);
      expect((window as any).__INDICATRIX_LIVE_UNIFORMS__.paperTooth).toBe(0.0);
    });

    it('GIS-UI-03: renders clean digital state when roughness is 0.0', async () => {
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={true}
            roughness={0.0}
          />
        );
      });

      const toggle = container.querySelector('#sidebar-paper-tooth-toggle') as HTMLButtonElement;
      expect(toggle).not.toBeNull();
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(container.textContent).toContain('Clean Digital GIS');
      expect(container.textContent).toContain('Clean digital viewing (grain suppressed)');
    });

    it('GIS-UI-04: slider updates roughness across [0.0 .. 1.0]', async () => {
      const onRoughnessChange = vi.fn();
      await act(async () => {
        root.render(
          <AtmosphereDrawer
            showClouds={true}
            roughness={0.5}
            onRoughnessChange={onRoughnessChange}
          />
        );
      });

      const slider = container.querySelector('#sidebar-paper-tooth-slider') as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(Number(slider.value)).toBe(0.5);
    });
  });
});
