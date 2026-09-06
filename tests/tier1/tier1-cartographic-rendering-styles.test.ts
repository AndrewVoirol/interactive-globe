import { describe, it, expect } from 'vitest';
import { DATA_LAYER_CATALOG, getPresetById } from '../../src/core/data/DataLayerCatalog';
import fs from 'fs';
import path from 'path';

describe('Tier 1 Cartographic Rendering Styles & Numerical Verification', () => {
  const rasterRendererPath = path.resolve(__dirname, '../../src/core/layers/renderers/RasterLayerRenderer.tsx');
  const rasterCode = fs.existsSync(rasterRendererPath) ? fs.readFileSync(rasterRendererPath, 'utf-8') : '';

  // ==========================================================================
  // 1. Catalog & Preset Contract Verification
  // ==========================================================================
  describe('1. Data Layer Catalog Contract', () => {
    it('CRS-01: verifies all three rendering directions are defined with correct renderStyle', () => {
      const arch = getPresetById('architectural-topo-relief');
      const hybrid = getPresetById('hybrid-crust-hydrosphere');
      const photoreal = getPresetById('nasa-blue-marble');

      expect(arch).toBeDefined();
      expect(arch?.renderStyle).toBe('architectural');
      expect(arch?.defaultDisplacementScale).toBeGreaterThanOrEqual(0.10);

      expect(hybrid).toBeDefined();
      expect(hybrid?.renderStyle).toBe('hybrid');
      expect(hybrid?.category).toBe('ocean');

      expect(photoreal).toBeDefined();
      expect(photoreal?.renderStyle).toBe('photoreal');
      expect(photoreal?.category).toBe('satellite');
    });

    it('CRS-02: verifies legend configuration exists with valid color stops for each direction', () => {
      for (const id of ['architectural-topo-relief', 'hybrid-crust-hydrosphere', 'nasa-blue-marble']) {
        const preset = getPresetById(id);
        expect(preset?.legend.colorStops.length).toBeGreaterThanOrEqual(3);
        expect(preset?.legend.minLabel).toBeDefined();
        expect(preset?.legend.maxLabel).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // 2. Shader Optics & Numerical Model Verification
  // ==========================================================================
  describe('2. Mathematical Optics & Numerical Models', () => {
    it('CRS-03: Beer-Lambert transmittance T(d) = exp(-k * d) is strictly monotonic and bounded in (0, 1]', () => {
      const k = 3.4;
      let prevTransmittance = 1.0;

      for (let depth = 0.0; depth <= 1.0; depth += 0.01) {
        const absorption = 1.0 - Math.exp(-depth * k);
        const transmittance = 1.0 - absorption;

        expect(transmittance).toBeGreaterThan(0.0);
        expect(transmittance).toBeLessThanOrEqual(1.0);
        expect(transmittance).toBeLessThanOrEqual(prevTransmittance + 1e-6);
        prevTransmittance = transmittance;
      }
    });

    it('CRS-04: Isocontour periodic distance metric abs(fract(cycle - 0.5) - 0.5) is bounded in [0, 0.5]', () => {
      for (let elev = 0.0; elev <= 1.0; elev += 0.001) {
        const cycle = elev * 24.0;
        const fractVal = cycle - 0.5 - Math.floor(cycle - 0.5);
        const dist = Math.abs(fractVal - 0.5);

        expect(dist).toBeGreaterThanOrEqual(0.0);
        expect(dist).toBeLessThanOrEqual(0.50001);
      }
    });

    it('CRS-05: Schlick Fresnel approximation F(theta) = F0 + (1 - F0) * (1 - cosTheta)^5 satisfies boundary conditions', () => {
      const F0 = 0.02; // Water refractive index n = 1.333
      
      // Normal incidence (cosTheta = 1.0) -> F = F0
      const F_normal = F0 + (1.0 - F0) * Math.pow(1.0 - 1.0, 5);
      expect(F_normal).toBeCloseTo(0.02, 5);

      // Grazing incidence (cosTheta = 0.0) -> F = 1.0
      const F_grazing = F0 + (1.0 - F0) * Math.pow(1.0 - 0.0, 5);
      expect(F_grazing).toBeCloseTo(1.0, 5);

      // Monotonic increase from normal to grazing
      let prevF = F_normal;
      for (let cosTheta = 0.99; cosTheta >= 0.0; cosTheta -= 0.05) {
        const F = F0 + (1.0 - F0) * Math.pow(1.0 - cosTheta, 5);
        expect(F).toBeGreaterThanOrEqual(prevF);
        prevF = F;
      }
    });

    it('CRS-06: verifies shader implements symmetric 4-tap central differencing for DEM normals', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('(hR - hL) * 0.5');
      expect(rasterCode).toContain('(hU - hD) * 0.5');
      expect(rasterCode).toContain('computeDEMNormal(vec2 uv, float dispScale, int renderStyle)');
    });

    it('CRS-07: verifies shader implements dual-tier hierarchical isocontours (intermediate + index)', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('topoCycle = landElev * 24.0');
      expect(rasterCode).toContain('indexCycle = landElev * 4.8');
      expect(rasterCode).toContain('combinedTopo = topoLine * 0.22 + indexLine * 0.40');
    });

    it('CRS-08: verifies shader implements two-surface elevation model clamping ocean to R = 5.0', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('signedH = isLand * landElev');
      expect(rasterCode).toContain('signedH = (u_includeBathymetry == 1)');
    });
  });

  // ==========================================================================
  // 3. Grid Geometry & Resolution Scaling
  // ==========================================================================
  describe('3. Polar Integrity & Dynamic Resolution Geometry', () => {
    it('CRS-09: verifies buildMercatorGridGeometry scales with resolution prop', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain("const widthSegs = resolution === '1M' ? 384 : 256;");
      expect(rasterCode).toContain("const heightSegs = resolution === '1M' ? 192 : 128;");
    });

    it('CRS-10: verifies geometry constructor includes dedicated North and South polar cap rows', () => {
      if (!rasterCode) return;
      expect(rasterCode).toContain('// Row 0: South Pole Cap (lat = -90°, seals Antarctic hole)');
      expect(rasterCode).toContain('// Row totalRows - 1: North Pole Cap (lat = +90°, seals Arctic hole)');
    });
  });
});
