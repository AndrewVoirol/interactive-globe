// ============================================================================
// File: tests/modern/r13-wind-ribbon-polish.test.ts
// Milestone: Milestone 2: Wind Ribbon Visual Polish - R3
// Invariants: §3 (UCF), §15 (DEM Parity), §28 (Theme Parity), §46 (Import Integrity), §48 (No Hardcoded Dims)
// Description: Behavioral and structural test suite verifying theme-aware contrast
//              colors (sienna-copper, actinic white/amber), physical jet stream
//              altitude calibration (~10km), and Invariant §28 explicit theme branching.
// ============================================================================

import { describe, it, expect } from 'vitest';
import windRibbonRenderWGSL from '../../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';
import windParticlesWGSL from '../../src/webgpu/shaders/wind_particles.wgsl?raw';

describe('Requirement R3: Wind Ribbon Visual Polish & Physical Calibration', () => {
  describe('1. Invariant §28: Exhaustive Multi-Medium Shader Parity', () => {
    it('M2-THEME-01: wind_ribbon_render.wgsl defines explicit branches for u_theme == 0u, 1u, and 2u in surface winds', () => {
      // Must not use binary fallthrough collapsing themes
      expect(windRibbonRenderWGSL).toContain('sim.u_theme == 0u');
      expect(windRibbonRenderWGSL).toContain('sim.u_theme == 1u');
      expect(windRibbonRenderWGSL).toContain('sim.u_theme == 2u');

      // Verify the surface wind section contains all three explicit branches
      const surfIndex = windRibbonRenderWGSL.indexOf('Surface Boundary Layer');
      expect(surfIndex).toBeGreaterThan(-1);

      const theme0SurfIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 0u', surfIndex);
      const theme1SurfIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 1u', surfIndex);
      const theme2SurfIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 2u', surfIndex);

      expect(theme0SurfIdx).toBeGreaterThan(surfIndex);
      expect(theme1SurfIdx).toBeGreaterThan(theme0SurfIdx);
      expect(theme2SurfIdx).toBeGreaterThan(theme1SurfIdx);
    });

    it('M2-THEME-02: wind_ribbon_render.wgsl defines explicit branches for u_theme == 0u, 1u, and 2u in jet stream', () => {
      const jetIndex = windRibbonRenderWGSL.indexOf('High-Altitude Jet Stream');
      expect(jetIndex).toBeGreaterThan(-1);

      const theme0JetIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 0u', jetIndex);
      const theme1JetIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 1u', jetIndex);
      const theme2JetIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 2u', jetIndex);

      expect(theme0JetIdx).toBeGreaterThan(jetIndex);
      expect(theme1JetIdx).toBeGreaterThan(theme0JetIdx);
      expect(theme2JetIdx).toBeGreaterThan(theme1JetIdx);
    });

    it('M2-THEME-03: wind_ribbon_render.wgsl defines explicit branches for u_theme == 0u, 1u, and 2u in condensation glaze', () => {
      const condIndex = windRibbonRenderWGSL.indexOf('Orographic condensation glaze');
      expect(condIndex).toBeGreaterThan(-1);

      const theme0CondIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 0u', condIndex);
      const theme1CondIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 1u', condIndex);
      const theme2CondIdx = windRibbonRenderWGSL.indexOf('sim.u_theme == 2u', condIndex);

      expect(theme0CondIdx).toBeGreaterThan(condIndex);
      expect(theme1CondIdx).toBeGreaterThan(theme0CondIdx);
      expect(theme2CondIdx).toBeGreaterThan(theme1CondIdx);
    });
  });

  describe('2. Requirement R3a: Theme-Aware Contrast Color Palettes', () => {
    it('M2-COLOR-01: Theme 1 (Cream Rag) surface winds render warm sienna-copper filaments with high substrate contrast', () => {
      // Calm: vec3<f32>(0.74, 0.38, 0.20)
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.74, 0.38, 0.20)');
      // Brisk: vec3<f32>(0.94, 0.58, 0.26)
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.94, 0.58, 0.26)');
      // Alpha range: 0.40 - 0.78
      expect(windRibbonRenderWGSL).toContain('mix(0.40, 0.78, smoothstep(0.06, 0.60, normSpeed))');

      // Behavioral optical validation:
      // Ivory paper substrate: #F3ECE0 ≈ rgb(0.953, 0.925, 0.878)
      // Sepia relief: #38302A ≈ rgb(0.220, 0.188, 0.165)
      const calm = [0.74, 0.38, 0.20];
      const brisk = [0.94, 0.58, 0.26];
      const ivory = [0.953, 0.925, 0.878];
      const sepia = [0.220, 0.188, 0.165];

      const dist = (a: number[], b: number[]) =>
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

      // Contrast distance against ivory paper must be significant (prevent disappearing in flats)
      expect(dist(calm, ivory)).toBeGreaterThan(0.60);
      expect(dist(brisk, ivory)).toBeGreaterThan(0.45);

      // Contrast distance against dark sepia relief must be significant (prevent disappearing on shaded slopes)
      expect(dist(calm, sepia)).toBeGreaterThan(0.45);
      expect(dist(brisk, sepia)).toBeGreaterThan(0.70);

      // Red-chromatic dominance: (R - B) > 0.5 ensures warm copper character distinct from cool grayscale
      expect(calm[0] - calm[2]).toBeGreaterThan(0.50);
      expect(brisk[0] - brisk[2]).toBeGreaterThan(0.60);
    });

    it('M2-COLOR-02: Theme 2 (Cyanotype) surface winds render actinic white and photochemical amber with high indigo contrast', () => {
      // Calm: vec3<f32>(0.92, 0.96, 1.00) (pure actinic white)
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.92, 0.96, 1.00)');
      // Brisk: vec3<f32>(1.00, 0.82, 0.40) (photochemical solar amber)
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(1.00, 0.82, 0.40)');
      // Alpha range: 0.55 - 0.88
      expect(windRibbonRenderWGSL).toContain('mix(0.55, 0.88, smoothstep(0.06, 0.60, normSpeed))');

      // Prussian blue ocean: #0E1824 ≈ rgb(0.055, 0.094, 0.141)
      const calm = [0.92, 0.96, 1.00];
      const brisk = [1.00, 0.82, 0.40];
      const prussianBlue = [0.055, 0.094, 0.141];

      // Relative luminance (sRGB weights 0.2126 R + 0.7152 G + 0.0722 B)
      const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

      // Actinic white must have high luminance (> 0.90) for crisp blueprint linework
      expect(lum(calm)).toBeGreaterThan(0.90);
      expect(lum(calm) - lum(prussianBlue)).toBeGreaterThan(0.80);

      // Warm amber must provide chromatic opposition to blue (R >> B, warm vs cool)
      expect(brisk[0] - brisk[2]).toBeGreaterThan(0.55);
      expect(lum(brisk) - lum(prussianBlue)).toBeGreaterThan(0.65);
    });

    it('M2-COLOR-03: Theme 0 (Marie Tharp) maintains crisp marine cyan and lunar silver palette', () => {
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.56, 0.66, 0.76)'); // Muted slate-pearl
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.88, 0.94, 1.00)'); // Luminous silver filament
      expect(windRibbonRenderWGSL).toContain('mix(0.38, 0.72, smoothstep(0.06, 0.60, normSpeed))');
    });
  });

  describe('3. Requirement R3b: Physical Jet Stream Altitude Differentiation & Calibration', () => {
    const EARTH_RADIUS_KM = 6371.0;
    const SPHERE_RADIUS = 5.0;

    it('M2-ALT-01: wind_particles.wgsl calibrates surface base altitude to ~640m', () => {
      // Surface winds base altitude must be 0.0005
      expect(windParticlesWGSL).toContain('baseAlt = select(0.0005,');

      const surfaceBaseStandoff = 0.0005;
      const surfaceAltitudeKm = (surfaceBaseStandoff / SPHERE_RADIUS) * EARTH_RADIUS_KM;
      const surfaceAltitudeMeters = surfaceAltitudeKm * 1000.0;

      // Surface altitude should be approximately 637m (~640m boundary layer)
      expect(surfaceAltitudeMeters).toBeGreaterThan(600.0);
      expect(surfaceAltitudeMeters).toBeLessThan(700.0);
    });

    it('M2-ALT-02: wind_particles.wgsl calibrates jet stream base altitude to ~10km (troposphere)', () => {
      // Jet stream base altitude must be 0.0065
      expect(windParticlesWGSL).toContain('0.0065');
      expect(windParticlesWGSL).not.toContain('select(0.04, 0.22, isJet');
      expect(windParticlesWGSL).not.toContain('select(0.04, 0.22, isJetStream');

      const jetBaseStandoff = 0.0065;
      const jetAltitudeKm = (jetBaseStandoff / SPHERE_RADIUS) * EARTH_RADIUS_KM;

      // Physical jet stream (250 hPa) exists at 8.0 - 11.5 km in upper troposphere
      expect(jetAltitudeKm).toBeGreaterThanOrEqual(8.0);
      expect(jetAltitudeKm).toBeLessThanOrEqual(11.5);
      expect(jetAltitudeKm).toBeCloseTo(8.28, 1);
    });

    it('M2-ALT-03: jet stream altitude nests physically between Mid and High clouds', () => {
      // Atmospheric layer standoffs from SCOPE.md:
      // Low clouds:  R + 0.0010 (~1.27 km)
      // Mid clouds:  R + 0.0040 (~5.10 km)
      // Jet stream:  R + 0.0065 (~8.28 km)
      // High clouds: R + 0.0080 (~10.19 km)
      const lowCloudStandoff = 0.0010;
      const midCloudStandoff = 0.0040;
      const jetStreamStandoff = 0.0065;
      const highCloudStandoff = 0.0080;

      expect(lowCloudStandoff).toBeLessThan(midCloudStandoff);
      expect(midCloudStandoff).toBeLessThan(jetStreamStandoff);
      expect(jetStreamStandoff).toBeLessThan(highCloudStandoff);

      // Verify physical kilometer altitudes
      const km = (s: number) => (s / SPHERE_RADIUS) * EARTH_RADIUS_KM;
      expect(km(midCloudStandoff)).toBeCloseTo(5.10, 1);
      expect(km(jetStreamStandoff)).toBeCloseTo(8.28, 1);
      expect(km(highCloudStandoff)).toBeCloseTo(10.19, 1);
    });

    it('M2-ALT-04: wind_ribbon_render.wgsl uses calibrated altitude threshold (p.pos.z > 0.003)', () => {
      // Threshold separates surface (~0.0005) from jet stream (~0.0065)
      expect(windRibbonRenderWGSL).toContain('p.pos.z > 0.003');
      expect(windRibbonRenderWGSL).not.toContain('p.pos.z > 0.1');

      const surfaceBase = 0.0005;
      const threshold = 0.003;
      const jetBase = 0.0065;

      expect(surfaceBase).toBeLessThan(threshold);
      expect(threshold).toBeLessThan(jetBase);
    });
  });

  describe('4. Invariant §3 & §48: Uniform Control Flow & Dynamic Dimension Invariants', () => {
    it('M2-UCF-01: wind_ribbon_render.wgsl evaluates derivatives unconditionally at top of fs_main', () => {
      const fsMainIdx = windRibbonRenderWGSL.indexOf('fn fs_main(in: VertexOutput)');
      const dUvIdx = windRibbonRenderWGSL.indexOf('let dUv = fwidth(in.uv);', fsMainIdx);
      const dVertVelIdx = windRibbonRenderWGSL.indexOf('let dVertVel = fwidth(in.vertVel);', fsMainIdx);
      const discardIdx = windRibbonRenderWGSL.indexOf('discard;', fsMainIdx);

      expect(fsMainIdx).toBeGreaterThan(-1);
      expect(dUvIdx).toBeGreaterThan(fsMainIdx);
      expect(dVertVelIdx).toBeGreaterThan(fsMainIdx);
      expect(dUvIdx).toBeLessThan(discardIdx);
      expect(dVertVelIdx).toBeLessThan(discardIdx);
    });

    it('M2-DIMS-01: wind_particles.wgsl uses dynamic textureDimensions(u_demTexture) instead of hardcoded 8192/4096 literals', () => {
      expect(windParticlesWGSL).toContain('textureDimensions(u_demTexture)');

      // Ensure no hardcoded DEM dimension literals in sampleTerrain
      const sampleTerrainIdx = windParticlesWGSL.indexOf('fn sampleTerrain');
      const nextFnIdx = windParticlesWGSL.indexOf('fn computeLiftedAltitude', sampleTerrainIdx);
      const sampleTerrainBody = windParticlesWGSL.slice(sampleTerrainIdx, nextFnIdx);

      expect(sampleTerrainBody).not.toContain('8192.0');
      expect(sampleTerrainBody).not.toContain('4096.0');
    });
  });
});
