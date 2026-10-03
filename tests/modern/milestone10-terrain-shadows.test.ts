import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Milestone 10: Dynamic Terrain Horizon Self-Shadows & Canyon Lighting', () => {
  const horizonShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/horizon_occlusion.wgsl');
  const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
  const crustHydrosphereTabPath = path.resolve(__dirname, '../../src/components/hud/tabs/CrustHydrosphereTab.tsx');
  const canvasPath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
  const appPath = path.resolve(__dirname, '../../src/App.tsx');
  const prognosticCardPath = path.resolve(__dirname, '../../src/components/hud/instruments/PrognosticModelCard.tsx');

  const horizonShaderSrc = fs.readFileSync(horizonShaderPath, 'utf8');
  const crustShaderSrc = fs.readFileSync(crustShaderPath, 'utf8');
  const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');
  const crustHydrosphereTabSrc = fs.readFileSync(crustHydrosphereTabPath, 'utf8');
  const canvasSrc = fs.readFileSync(canvasPath, 'utf8');
  const appSrc = fs.readFileSync(appPath, 'utf8');
  const prognosticCardSrc = fs.readFileSync(prognosticCardPath, 'utf8');

  describe('1. Task M10-T1: Horizon Occlusion Pipeline Activation & Sun Compass Synchronization', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('TerrainShadowUniforms enforces exact 32-byte layout with 16-byte alignment', () => {
      expect(horizonShaderSrc).toContain('struct TerrainShadowUniforms');
      expect((engine as any).terrainShadowMirror).toBeInstanceOf(ArrayBuffer);
      expect((engine as any).terrainShadowMirror.byteLength).toBe(32);
    });

    it('converts solar azimuth and altitude degrees to radians accurately', () => {
      (engine as any).device = {
        queue: {
          writeBuffer: vi.fn(),
        },
      };
      (engine as any).terrainShadowUniformBuffer = {};

      // Test opposing azimuths: NW 315° vs SE 135°, and solar elevations: 15° vs 65°
      engine.updateTerrainShadowUniforms({
        sunAzimuth: 315.0,
        sunAltitude: 45.0,
        maxRayDistanceMeters: 50000.0,
        penumbraSoftness: 1.5,
        sampleStepCount: 16,
      });

      const floats = (engine as any).terrainShadowFloats;
      expect(floats[0]).toBeCloseTo((315.0 * Math.PI) / 180.0, 5);
      expect(floats[1]).toBeCloseTo((45.0 * Math.PI) / 180.0, 5);
      expect(floats[2]).toBe(50000.0);
      expect(floats[3]).toBe(1.5);

      engine.updateTerrainShadowUniforms({
        sunAzimuth: 135.0,
        sunAltitude: 65.0,
      });

      expect(floats[0]).toBeCloseTo((135.0 * Math.PI) / 180.0, 5);
      expect(floats[1]).toBeCloseTo((65.0 * Math.PI) / 180.0, 5);
    });

    it('synchronizes PolarSunCompass changes with updateTerrainShadowUniforms in UnifiedRightSidebar', () => {
      expect(crustHydrosphereTabSrc).toContain('id="sidebar-terrain-shadows-toggle"');
      expect(crustHydrosphereTabSrc).toContain('id="sidebar-terrain-shadow-softness"');
      // Sun compass onChange synchronizes terrain shadow uniforms
      expect(crustHydrosphereTabSrc).toContain('engine.updateTerrainShadowUniforms({');
      expect(crustHydrosphereTabSrc).toContain('sunAzimuth: azimuth');
      expect(crustHydrosphereTabSrc).toContain('sunAltitude: altitude');
    });

    it('enforces semantic typography on terrain shadow controls without raw pixel font utilities', () => {
      const terrainControlsMatch = crustHydrosphereTabSrc.match(/id="sidebar-terrain-shadows-toggle"[\s\S]*?id="sidebar-terrain-shadow-softness"/);
      expect(terrainControlsMatch).not.toBeNull();
      const snippet = terrainControlsMatch![0];
      expect(snippet).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
      expect(snippet).toMatch(/text-(micro|nano|caption|body)/);
    });

    it('guarantees showSurfaceWinds is active when 10m Wind is selected in PrognosticModelCard (M9 Handoff)', () => {
      expect(prognosticCardSrc).toContain("onTogglePlanetaryLayer?.('noaa-gfs-wind', true)");
      expect(prognosticCardSrc).toContain('live.showSurfaceWinds = true');
      expect(prognosticCardSrc).toContain('live.showWind = true');
    });
  });

  describe('2. Task M10-T2: Medium-Specific Shadow Palette & Invariant Verification (Rule 3, 4, 8, 24)', () => {
    it('samples u_terrainShadowTexture unconditionally at the top of fs_main (Rule 4)', () => {
      const fsMainIdx = crustShaderSrc.indexOf('fn fs_main(');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainCode = crustShaderSrc.slice(fsMainIdx);

      const terrainShadowSampleIdx = fsMainCode.indexOf('textureSampleLevel(u_terrainShadowTexture');
      const firstBranchOrDiscardIdx = fsMainCode.indexOf('discard;');

      expect(terrainShadowSampleIdx).toBeGreaterThan(0);
      expect(terrainShadowSampleIdx).toBeLessThan(firstBranchOrDiscardIdx);
    });

    it('satisfies Rule 24 Zero-Zombie Pass Invariant: bypasses horizonOcclusionPipeline when terrain shadows disabled', () => {
      const engineSrc = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts'), 'utf8');
      expect(engineSrc).toContain('const hasHorizonCompute = showTerrainShadows && !!(');
      expect(engineSrc).toContain('if (hasHorizonCompute) {');
      expect(engineSrc).toContain('computePass.setPipeline(this.horizonOcclusionPipeline!);');
    });

    it('satisfies Rule 8 Cross-Pipeline DEM Parity in elevation decoding', () => {
      const demDecode = 'demSample.a * 19772.0 - 10924.0';
      expect(horizonShaderSrc).toContain(demDecode);
      expect(crustShaderSrc).toContain(demDecode);
    });

    it('tunes Theme 1 (Cream Rag) shadow palette with archival sepia-charcoal ink wash (#38302A)', () => {
      // Warm sepia-charcoal wash #38302A -> vec3(0.22, 0.19, 0.16)
      expect(crustShaderSrc).toContain('let cSepiaCharcoal = vec3<f32>(0.22, 0.19, 0.16);');
      expect(crustShaderSrc).toContain('mix(vec3<f32>(0.35, 0.36, 0.45), cSepiaCharcoal, (1.0 - terrainShadow) * 0.65)');
      // Lowland lift is scaled by terrainShadow
      expect(crustShaderSrc).toContain('let lowlandLift = lowlandWeight * 0.12 * (1.0 + lowlandMicroShade) * terrainShadow;');
      // Subtractive Kubelka-Munk intaglio ink absorption absorbs cast shadows into paper fibers
      expect(crustShaderSrc).toContain('let shadowCastGrip = max(slopeGrip, (1.0 - terrainShadow) * 0.60);');
    });

    it('tunes Theme 2 (Prussian Cyanotype) shadow palette with cold photochemical Prussian navy and zero warm bleed', () => {
      // Cold photochemical Prussian navy
      expect(crustShaderSrc).toContain('let cPrussianNavyShadow = vec3<f32>(0.07, 0.14, 0.24);');
      expect(crustShaderSrc).toContain('mix(vec3<f32>(0.18, 0.32, 0.48), cPrussianNavyShadow, (1.0 - terrainShadow) * 0.70)');
    });

    it('tunes Theme 0 (Marie Tharp) shadow palette with hand-painted Heinrich Berann umber wash', () => {
      // Hand-painted rich umber wash #2E241C
      expect(crustShaderSrc).toContain('let cUmberCastShadow = vec3<f32>(0.22, 0.16, 0.12);');
      expect(crustShaderSrc).toContain('mix(cSkyAmbient, cUmberCastShadow, (1.0 - terrainShadow) * 0.75)');
    });
  });

  describe('3. Component Architecture & Property Plumbing', () => {
    it('plumbs terrainShadows and penumbraSoftness through WebGPUCanvas props and engine sync', () => {
      expect(canvasSrc).toContain('terrainShadows?: boolean;');
      expect(canvasSrc).toContain('penumbraSoftness?: number;');
      expect(canvasSrc).toContain('engineRef.current.setTerrainShadowsEnabled');
      expect(canvasSrc).toContain('engineRef.current.updateTerrainShadowUniforms');
    });

    it('plumbs terrainShadows and penumbraSoftness through App state and TelemetryHUD', () => {
      expect(appSrc).toContain('const [terrainShadows, setTerrainShadows] = useState<boolean>(false);');
      expect(appSrc).toContain('const [penumbraSoftness, setPenumbraSoftness] = useState<number>(1.5);');
      expect(appSrc).toContain('terrainShadows={terrainShadows}');
      expect(appSrc).toContain('penumbraSoftness={penumbraSoftness}');
    });
  });
});
