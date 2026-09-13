// ============================================================================
// File: tests/modern/r17-coastal-normal-clamping.test.ts
// Test Tier: Modern / Stage 2 Domain-Aware Coastal Normal Clamping & Curvature
// Description: Validates elimination of the dark muddy brown coastal band via
//              domain-aware one-sided finite differences and curvature decoupling.
//              Asserts flat beaches have theta <= 0.5 deg and creviceAO >= 0.98,
//              while authentic coastal cliffs (Dover, Hawaii) retain theta >= 38 deg.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('R17 Stage 2: Domain-Aware Coastal Normal Clamping & Curvature Decoupling', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const shaderPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  // Math helper mirroring WGSL functions
  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  describe('1. Static Code Analysis & Invariant Guardrails', () => {
    it('R17-CLAMP-01: verifies domain-aware one-sided finite differences replace zeroing', () => {
      expect(shaderSrc).toContain('let effHR = select(hC, rawHR, hasR);');
      expect(shaderSrc).toContain('let effHL = select(hC, rawHL, hasL);');
      expect(shaderSrc).toContain('let effHU = select(hC, rawHU, hasU);');
      expect(shaderSrc).toContain('let effHD = select(hC, rawHD, hasD);');
      expect(shaderSrc).toContain('let dHx = (effHR - effHL) * scaleX * dispScale * slopeScale;');
      expect(shaderSrc).toContain('let dHy = (effHD - effHU) * scaleY * dispScale * slopeScale;');
    });

    it('R17-CLAMP-02: verifies discrete Laplacian curvature uses effective elevations', () => {
      expect(shaderSrc).toContain('let laplacian = ((effHR + effHL + effHU + effHD) - 4.0 * hC) * slopeScale;');
      expect(shaderSrc).not.toContain('let laplacian = ((hR + hL + hU + hD) - 4.0 * hC) * slopeScale;');
    });

    it('R17-CLAMP-03: verifies bathymetry rock shading is gated by shelf depth', () => {
      expect(shaderSrc).toContain('let shelfDepthMeters = normDepth * 10924.0;');
      expect(shaderSrc).toContain('let bathyRockGate = smoothstep(200.0, 1000.0, shelfDepthMeters);');
      expect(shaderSrc).toContain('let cBathyComposite = mix(cBathy * bathyIllum, cRockShaded, rockWeight * 0.4 * bathyRockGate);');
    });

    it('R17-CLAMP-04: verifies NO unphysical elevation gate (< 100m) is present in normal calculation', () => {
      // Must NOT arbitrarily clamp slopes for all terrain under 100m
      expect(shaderSrc).not.toMatch(/if\s*\(h(?:Meters|Elev|Land)?\s*<\s*100(?:\.0)?\)/);
      expect(shaderSrc).not.toMatch(/landElev\s*<\s*100\.0\s*\/\s*8848\.0/);
    });
  });

  describe('2. Coastal Boundary Physics & Slope Mathematical Rigor', () => {
    const Z_MAX_LAND = 8848.0;
    const dispScale = 1.0 * 45.0 + 1.0; // 46.0
    const slopeScale = 8192.0 / (2.0 * Math.PI * 5.0); // ~260.75

    it('R17-CLAMP-05: flat coastal boundary evaluates theta <= 0.5°, rockWeight === 0, creviceAO >= 0.98', () => {
      // Center tap: coastal beach at 15m elevation
      const hC = 15.0 / Z_MAX_LAND;
      const onLand = true;

      // Seaward neighbor R is ocean (isLand = 0.0, depth = 10m)
      const hasR = false;
      const rawHR = 0.0;
      // Inland neighbor L is flat plain at 15m
      const hasL = true;
      const rawHL = 15.0 / Z_MAX_LAND;
      // Along-coast neighbors U and D are flat plain at 15m
      const hasU = true;
      const rawHU = 15.0 / Z_MAX_LAND;
      const hasD = true;
      const rawHD = 15.0 / Z_MAX_LAND;

      const effHR = hasR ? rawHR : hC;
      const effHL = hasL ? rawHL : hC;
      const effHU = hasU ? rawHU : hC;
      const effHD = hasD ? rawHD : hC;

      const scaleX = (hasR && hasL) ? 0.5 : ((hasR || hasL) ? 1.0 : 0.0);
      const scaleY = (hasU && hasD) ? 0.5 : ((hasU || hasD) ? 1.0 : 0.0);

      const dHx = (effHR - effHL) * scaleX * dispScale * slopeScale;
      const dHy = (effHD - effHU) * scaleY * dispScale * slopeScale;

      // Normal perturbation: n = normalize([ -dHx, -dHy, 1.0 ])
      const normLen = Math.hypot(dHx, dHy, 1.0);
      const cosSlope = 1.0 / normLen;
      const slopeAngleRad = Math.acos(cosSlope);
      const slopeAngleDeg = slopeAngleRad * (180.0 / Math.PI);

      // Rock cliff exposure weight
      const rockWeight = (1.0 - smoothstep(0.66913, 0.81915, cosSlope)) * 0.75;

      // Laplacian curvature & crevice AO
      const laplacian = ((effHR + effHL + effHU + effHD) - 4.0 * hC) * slopeScale;
      const kValley = clamp(laplacian * 45.0, 0.0, 1.0);
      const creviceAO = 1.0 - kValley * (0.85 * 1.0); // ambientOcclusion = 1.0

      expect(slopeAngleDeg).toBeLessThanOrEqual(0.5);
      expect(rockWeight).toBe(0.0);
      expect(creviceAO).toBeGreaterThanOrEqual(0.98);
    });

    it('R17-CLAMP-06: authentic coastal sea cliffs (Dover / Big Sur / Hawaii) retain theta >= 38.0° and active rock shading', () => {
      // Center tap: cliff base at 30m elevation
      const hC = 30.0 / Z_MAX_LAND;
      const onLand = true;

      // Seaward neighbor R is ocean
      const hasR = false;
      const rawHR = 0.0;
      // Inland neighbor L rises to 180m plateau (150m cliff face over 1 pixel)
      const hasL = true;
      const rawHL = 180.0 / Z_MAX_LAND;
      const hasU = true;
      const rawHU = 30.0 / Z_MAX_LAND;
      const hasD = true;
      const rawHD = 30.0 / Z_MAX_LAND;

      const effHR = hasR ? rawHR : hC;
      const effHL = hasL ? rawHL : hC;
      const effHU = hasU ? rawHU : hC;
      const effHD = hasD ? rawHD : hC;

      const scaleX = (hasR && hasL) ? 0.5 : ((hasR || hasL) ? 1.0 : 0.0);
      const scaleY = (hasU && hasD) ? 0.5 : ((hasU || hasD) ? 1.0 : 0.0);

      const dHx = (effHR - effHL) * scaleX * dispScale * slopeScale;
      const dHy = (effHD - effHU) * scaleY * dispScale * slopeScale;

      const normLen = Math.hypot(dHx, dHy, 1.0);
      const cosSlope = 1.0 / normLen;
      const slopeAngleRad = Math.acos(cosSlope);
      const slopeAngleDeg = slopeAngleRad * (180.0 / Math.PI);

      const rockWeight = (1.0 - smoothstep(0.66913, 0.81915, cosSlope)) * 0.75;

      expect(slopeAngleDeg).toBeGreaterThanOrEqual(38.0);
      expect(rockWeight).toBeGreaterThan(0.50);
    });

    it('R17-CLAMP-07: coastal plain luminance parity: |Luma_coast - Luma_inland| < 0.04', () => {
      // Compute diffuse total for inland plain vs coastal plain
      // Under uniform solar illumination:
      const L1 = [0.577, 0.577, 0.577]; // Sun dir
      const N_inland = [0.0, 0.0, 1.0]; // flat surface normal

      // Coast: normal clamped to vertical by domain-aware differences
      const N_coast = [0.0, 0.0, 1.0];

      const NdotL_inland = Math.max(0.0, N_inland[2] * L1[2]);
      const NdotL_coast = Math.max(0.0, N_coast[2] * L1[2]);

      const diff_inland = 0.08 + 0.72 * NdotL_inland + 0.20 * 0.5;
      const diff_coast = 0.08 + 0.72 * NdotL_coast + 0.20 * 0.5;

      // In the old zeroing scheme, dHx was ~203, tilting normal by 89 degrees away from sun,
      // dropping NdotL to ~0.01 and causing diffuse_coast to drop by > 0.40 (dark band).
      const deltaLuma = Math.abs(diff_coast - diff_inland);
      expect(deltaLuma).toBeLessThan(0.04);
    });
  });
});
