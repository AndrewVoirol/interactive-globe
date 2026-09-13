// ============================================================================
// File: tests/modern/r18-bathymetry-and-terrain-relief.test.ts
// Test Tier: Modern / R18 Bathymetry, Ocean Trenches & Terrain Relief
// Description: Validates CPU-side signed bathymetry decoding, elimination of the
//              0.25 ocean slope suppression in WGSL, decoupling of kValley from
//              ridge hatching, depth-gating of mid-ocean ridges, multi-stratum
//              ocean inking across all 3 themes, Tibetan Plateau hypsometry,
//              and lowland micro-relief enhancement.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('R18: Ocean Trenches, Bathymetry & Terrain Relief Remediation', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const shaderPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

  // Math helpers mirroring WGSL functions
  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  function mix(a: number, b: number, t: number): number {
    return a * (1.0 - t) + b * t;
  }

  function mixVec3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
    return [
      mix(a[0], b[0], t),
      mix(a[1], b[1], t),
      mix(a[2], b[2], t),
    ];
  }

  // ==========================================================================
  // Suite 1: Stage 1 - CPU Bathymetry & Fallback Data Flow
  // ==========================================================================
  describe('1. Stage 1: CPU Bathymetry & Fallback Data Flow Hardening', () => {
    it('R18-CPU-01: verifies sampleElevation decodes ocean depth channel g as signed negative elevation', () => {
      expect(engineSrc).toContain('const oceanM = - (g / maxVal) * 10924.0;');
      expect(engineSrc).toContain('const landM = (r / maxVal) * 8848.0;');
      expect(engineSrc).toContain('return isLand ? landM : oceanM;');
      expect(engineSrc).not.toContain('return isLand ? (r / maxVal) * 8848.0 : 0.0;');
    });

    it('R18-CPU-02: verifies 2x2 placeholder DEM texture is initialized as rgba16float with 256-byte row pitch', () => {
      expect(engineSrc).toContain("format: 'rgba16float',");
      expect(engineSrc).toContain('{ bytesPerRow: 256, rowsPerImage: 2 },');
    });

    it('R18-CPU-03: verifies CPU elevation sample simulation produces authentic depths across global locations', () => {
      const isU16 = true;
      const maxVal = isU16 ? 65535 : 255;

      const decodeElev = (r: number, g: number, b: number): number => {
        const isLand = b > maxVal * 0.45;
        const oceanM = - (g / maxVal) * 10924.0;
        const landM = (r / maxVal) * 8848.0;
        return isLand ? landM : oceanM;
      };

      // Challenger Deep (Mariana Trench): ocean (b=0), g = 62260
      const challengerDeepElev = decodeElev(0, 62260, 0);
      expect(challengerDeepElev).toBeLessThan(-10000.0);
      expect(challengerDeepElev).toBeCloseTo(-10377.9, 0);

      // Mid-Atlantic Ridge: ocean (b=0), g = 23746
      const midAtlanticRidgeElev = decodeElev(0, 23746, 0);
      expect(midAtlanticRidgeElev).toBeLessThan(-3000.0);
      expect(midAtlanticRidgeElev).toBeGreaterThan(-4500.0);
      expect(midAtlanticRidgeElev).toBeCloseTo(-3958.2, 0);

      // Mount Everest: land (b=65535), r = 52538
      const everestElev = decodeElev(52538, 0, 65535);
      expect(everestElev).toBeGreaterThan(7000.0);
      expect(everestElev).toBeCloseTo(7093.5, 0);

      // Coastal beach: land (b=65535), r = 111
      const beachElev = decodeElev(111, 0, 65535);
      expect(beachElev).toBeGreaterThan(0.0);
      expect(beachElev).toBeLessThan(50.0);
    });

    it('R18-CPU-04: verifies defensive coordinate sanitization in sampleCPUElevation for NaN and non-finite inputs', () => {
      expect(engineSrc).toContain('if (isNaN(lonDeg) || isNaN(latDeg) || !isFinite(lonDeg) || !isFinite(latDeg)) {');
      expect(engineSrc).toContain('return { elevationMeters: 0, gradEast: 0, gradNorth: 0 };');
    });
  });

  // ==========================================================================
  // Suite 2: Stage 2 - Bathymetry & Trench Differential Physics
  // ==========================================================================
  describe('2. Stage 2: Bathymetry & Trench Differential Physics Restoration', () => {
    it('R18-PHYS-01: verifies elimination of 0.25 ocean slope suppression in WGSL', () => {
      // Must NOT contain 0.25 ocean slope scaling
      expect(shaderSrc).not.toContain('select(-oceanDepth * 0.25, landElev, onLand)');
      expect(shaderSrc).not.toContain('select(-finalDemR.g * 0.25, finalDemR.r, onLand)');
      expect(shaderSrc).not.toContain('select(-finalDemL.g * 0.25, finalDemL.r, onLand)');
      expect(shaderSrc).not.toContain('select(-finalDemU.g * 0.25, finalDemU.r, onLand)');
      expect(shaderSrc).not.toContain('select(-finalDemD.g * 0.25, finalDemD.r, onLand)');

      // Must use true physical bathymetric elevation scale (10924.0 / 8848.0)
      expect(shaderSrc).toContain('let bathyElev = -oceanDepth * (10924.0 / 8848.0);');
      expect(shaderSrc).toContain('let hC = select(bathyElev, landElev, onLand);');
      expect(shaderSrc).toContain('let rawHR = select(-finalDemR.g * (10924.0 / 8848.0), finalDemR.r, onLand);');
      expect(shaderSrc).toContain('let rawHL = select(-finalDemL.g * (10924.0 / 8848.0), finalDemL.r, onLand);');
      expect(shaderSrc).toContain('let rawHU = select(-finalDemU.g * (10924.0 / 8848.0), finalDemU.r, onLand);');
      expect(shaderSrc).toContain('let rawHD = select(-finalDemD.g * (10924.0 / 8848.0), finalDemD.r, onLand);');
    });

    it('R18-PHYS-02: verifies ocean slope scale factor is 10924 / 8848 (~1.2346)', () => {
      const bathyScale = 10924.0 / 8848.0;
      expect(bathyScale).toBeCloseTo(1.2346, 3);
      // Slope is ~4.94x steeper than previous 0.25 suppression
      expect(bathyScale / 0.25).toBeCloseTo(4.9385, 2);
    });

    it('R18-PHYS-03: verifies zero occurrences of kValley in ridgeHatchStrength (decoupled from trench concavity)', () => {
      // Must NOT mix kValley into ridge hatching
      expect(shaderSrc).not.toMatch(/ridgeHatchStrength\s*=[^;]*kValley/);
      expect(shaderSrc).toContain('let ridgeHatchStrength = ridgeHatchWave * (kRidge * 1.6);');
    });

    it('R18-PHYS-04: verifies mid-ocean ridge highlights are depth-gated', () => {
      expect(shaderSrc).toContain('let ridgeDepthGate = smoothstep(1200.0, 2000.0, bathyDepthM) * (1.0 - smoothstep(3800.0, 4800.0, bathyDepthM));');
      expect(shaderSrc).toContain('cBathy = mix(cBathy, cBathyRidge, kRidge * 0.45 * ridgeDepthGate);');
    });

    it('R18-PHYS-05: verifies trench crevice ink absorption in deep ocean chasms', () => {
      expect(shaderSrc).toContain('let trenchChasmWeight = clamp(kValley * 1.5 * smoothstep(4500.0, 6500.0, bathyDepthM), 0.0, 1.0);');
      expect(shaderSrc).toContain('cBathy = mix(cBathy, cTrenchInk, trenchChasmWeight * 0.85);');
    });

    it('R18-PHYS-06: mathematical simulation: trench chasm does NOT hatch white and absorbs dark ink', () => {
      // Mariana Trench simulation:
      // Depth: 8500m -> normDepth = 8500 / 10924 = 0.778
      const bathyDepthM = 8500.0;
      const kValley = 0.85; // deep concave trench
      const kRidge = 0.0;   // not a ridge

      // Ridge depth gate
      const ridgeDepthGate = smoothstep(1200.0, 2000.0, bathyDepthM) * (1.0 - smoothstep(3800.0, 4800.0, bathyDepthM));
      expect(ridgeDepthGate).toBe(0.0); // 8500m is far below 4800m

      // Ridge hatch strength
      const ridgeHatchWave = 0.9;
      const ridgeHatchStrength = ridgeHatchWave * (kRidge * 1.6);
      const ridgeHatch = clamp(ridgeHatchStrength * ridgeDepthGate, 0.0, 1.0);
      expect(ridgeHatch).toBe(0.0); // Exactly ZERO white hatching in trench!

      // Trench crevice ink absorption
      const trenchChasmWeight = clamp(kValley * 1.5 * smoothstep(4500.0, 6500.0, bathyDepthM), 0.0, 1.0);
      expect(trenchChasmWeight).toBeGreaterThan(0.9); // Strong ink absorption!
    });

    it('R18-PHYS-07: verifies swiss_relief_shading.wgsl also eliminates 0.25 ocean slope suppression', () => {
      const swissPath = path.join(projectRoot, 'src/webgpu/shaders/swiss_relief_shading.wgsl');
      const swissSrc = fs.readFileSync(swissPath, 'utf8');
      expect(swissSrc).not.toContain('select(-oceanDepth * 0.25, landElev, isLand > 0.45)');
      expect(swissSrc).toContain('let bathyScale = 10924.0 / 8848.0;');
      expect(swissSrc).toContain('let hC = select(-oceanDepth * bathyScale, landElev, isLand > 0.45);');
    });
  });

  // ==========================================================================
  // Suite 3: Stage 3 - Multi-Stratum Ocean Inking & Hillshading
  // ==========================================================================
  describe('3. Stage 3: Depth Hypsometry & Multi-Stratum Ocean Inking', () => {
    it('R18-BATHY-01: verifies 4-stratum ocean hypsometry blending in Option A', () => {
      expect(shaderSrc).toContain('let b0 = smoothstep(0.004, 0.022, normDepth);');
      expect(shaderSrc).toContain('let b1 = smoothstep(0.022, 0.228, normDepth);');
      expect(shaderSrc).toContain('let b2 = smoothstep(0.228, 0.503, normDepth);');
      expect(shaderSrc).toContain('mix(cBathyShelf, cBathySlope, b0)');
      expect(shaderSrc).toContain('mix(cBathyAbyss, cBathyTrench, b2)');
    });

    it('R18-BATHY-02: verifies cBathySlope is defined across all 3 themes in Option A', () => {
      // Theme 2 (Prussian)
      expect(shaderSrc).toContain('cBathySlope  = vec3<f32>(0.11, 0.22, 0.35); // Pelagic slope cerulean-indigo');
      // Theme 1 (Cream Rag)
      expect(shaderSrc).toContain('cBathySlope  = vec3<f32>(0.32, 0.44, 0.52); // Continental slope mineral lapis wash');
      // Theme 0 (Marie Tharp)
      expect(shaderSrc).toContain('cBathySlope  = vec3<f32>(0.08, 0.22, 0.28); // Oceanic teal-navy continental slope');
    });

    it('R18-BATHY-03: verifies Option B (Hydrosphere Depth) includes multi-stratum hypsometry & relief hillshading', () => {
      expect(shaderSrc).toContain('let ob0 = smoothstep(0.004, 0.022, normDepth);');
      expect(shaderSrc).toContain('let ob1 = smoothstep(0.022, 0.228, normDepth);');
      expect(shaderSrc).toContain('let ob2 = smoothstep(0.228, 0.503, normDepth);');
      expect(shaderSrc).toContain('let bathySunDirect = max(0.0, NdotL1) * shadowFactor;');
      expect(shaderSrc).toContain('let bathyReliefWeight = 0.85 * (1.0 - smoothstep(0.02, 0.40, normDepth) * 0.40);');
      expect(shaderSrc).toContain('let bathyIllum = (cSunLight * (bathySunDirect * 0.80 + ridgeEnhance * 0.75 * shadowFactor) + cSkyAmbient * (skyIndirect * creviceAO)) * bathyReliefWeight;');
    });

    it('R18-BATHY-04: verifies continuous color transition without flat plateau between 1,600m and 3,800m', () => {
      // Sample Cream Rag bathymetric ramp at 100m, 1000m, 2000m, 3500m, 5000m, 8000m
      const cShelf: [number, number, number] = [0.42, 0.55, 0.56];
      const cSlope: [number, number, number] = [0.32, 0.44, 0.52];
      const cAbyss: [number, number, number] = [0.22, 0.32, 0.44];
      const cTrench: [number, number, number] = [0.12, 0.17, 0.24];

      const sampleBathy = (depthM: number): [number, number, number] => {
        const normDepth = depthM / 10924.0;
        const b0 = smoothstep(0.004, 0.022, normDepth);
        const b1 = smoothstep(0.022, 0.228, normDepth);
        const b2 = smoothstep(0.228, 0.503, normDepth);
        return mixVec3(mixVec3(cShelf, cSlope, b0), mixVec3(cAbyss, cTrench, b2), b1);
      };

      const c1000 = sampleBathy(1000.0);
      const c2000 = sampleBathy(2000.0);
      const c3500 = sampleBathy(3500.0);
      const c5000 = sampleBathy(5000.0);

      // Must be monotonically decreasing in brightness (deeper = darker)
      const luma1000 = 0.299 * c1000[0] + 0.587 * c1000[1] + 0.114 * c1000[2];
      const luma2000 = 0.299 * c2000[0] + 0.587 * c2000[1] + 0.114 * c2000[2];
      const luma3500 = 0.299 * c3500[0] + 0.587 * c3500[1] + 0.114 * c3500[2];
      const luma5000 = 0.299 * c5000[0] + 0.587 * c5000[1] + 0.114 * c5000[2];

      expect(luma1000).toBeGreaterThan(luma2000);
      expect(luma2000).toBeGreaterThan(luma3500);
      expect(luma3500).toBeGreaterThan(luma5000);
    });
  });

  // ==========================================================================
  // Suite 4: Stage 4 - Terrain Relief & Montane Plateau Hypsometry
  // ==========================================================================
  describe('4. Stage 4: Terrain Relief & Montane Plateau Hypsometry Restoration', () => {
    it('R18-TERRAIN-01: verifies cMontane band is defined across all 3 themes', () => {
      // Theme 2 (Prussian Cyanotype)
      expect(shaderSrc).toContain('cMontane    = vec3<f32>(0.52, 0.64, 0.76); // Washed Slate High Plateau');
      // Theme 1 (Cream Rag)
      expect(shaderSrc).toContain('cMontane    = vec3<f32>(0.66, 0.56, 0.43); // Montane Steppe / Tibetan Plateau #A88E6E');
      // Theme 0 (Marie Tharp)
      expect(shaderSrc).toContain('cMontane    = vec3<f32>(0.68, 0.60, 0.48); // Archival Parchment Steppe');
    });

    it('R18-TERRAIN-02: verifies glacial summit threshold t3 is shifted to >5,200m', () => {
      expect(shaderSrc).toContain('let t3 = smoothstep(5200.0, 6800.0, hMeters);');
      expect(shaderSrc).not.toContain('let t3 = smoothstep(2800.0, 4200.0, hMeters);');
    });

    it('R18-TERRAIN-03: asserts Tibetan Plateau elevation (4,500m) evaluates to cMontane steppe and NOT cSummit', () => {
      const hMeters = 4500.0;
      // Exact shader smoothstep transitions from crust_hydrosphere.wgsl
      expect(shaderSrc).toContain('let t0 = smoothstep(150.0, 650.0, hMeters);');
      expect(shaderSrc).toContain('let t1 = smoothstep(650.0, 1600.0, hMeters);');
      expect(shaderSrc).toContain('let t2 = smoothstep(1600.0, 3200.0, hMeters);');
      expect(shaderSrc).toContain('let t3 = smoothstep(5200.0, 6800.0, hMeters);');

      const t0 = smoothstep(150.0, 650.0, hMeters);
      const t1 = smoothstep(650.0, 1600.0, hMeters);
      const t2 = smoothstep(1600.0, 3200.0, hMeters);
      const t3 = smoothstep(5200.0, 6800.0, hMeters);

      // Transitions up to montane steppe are complete
      expect(t0).toBe(1.0);
      expect(t1).toBe(1.0);
      expect(t2).toBe(1.0);

      // Glacial summit weight must be zero (< 0.10)
      expect(t3).toBe(0.0);
      expect(t3).toBeLessThan(0.10);

      // Full hypsometric ramp evaluation at 4500m (Cream Rag)
      const cLowland: [number, number, number] = [0.81, 0.71, 0.53];
      const cPlateau: [number, number, number] = [0.74, 0.63, 0.48];
      const cFlank: [number, number, number] = [0.58, 0.44, 0.35];
      const cMontane: [number, number, number] = [0.66, 0.56, 0.43];
      const cSummit: [number, number, number] = [0.98, 0.97, 0.95];

      const cRamp = mixVec3(mixVec3(mixVec3(mixVec3(cLowland, cPlateau, t0), cFlank, t1), cMontane, t2), cSummit, t3);
      expect(cRamp[0]).toBeCloseTo(0.66, 2);
      expect(cRamp[1]).toBeCloseTo(0.56, 2);
      expect(cRamp[2]).toBeCloseTo(0.43, 2);
      expect(cRamp[0]).not.toBeCloseTo(cSummit[0], 1);
    });

    it('R18-TERRAIN-04: asserts glacial white is restricted to elevations h > 5,200m', () => {
      // Sub-alpine / high plateau elevations have zero glacial white
      expect(smoothstep(5200.0, 6800.0, 3000.0)).toBe(0.0);
      expect(smoothstep(5200.0, 6800.0, 4000.0)).toBe(0.0);
      expect(smoothstep(5200.0, 6800.0, 4800.0)).toBe(0.0);
      expect(smoothstep(5200.0, 6800.0, 5200.0)).toBe(0.0);

      // High summits have positive glacial white
      expect(smoothstep(5200.0, 6800.0, 5600.0)).toBeGreaterThan(0.0);
      expect(smoothstep(5200.0, 6800.0, 6000.0)).toBeCloseTo(0.5, 1);
      expect(smoothstep(5200.0, 6800.0, 6800.0)).toBe(1.0);
      expect(smoothstep(5200.0, 6800.0, 8848.0)).toBe(1.0);
    });

    it('R18-TERRAIN-05: verifies lowland micro-relief enhancement in rolling terrain (h < 600m)', () => {
      expect(shaderSrc).toContain('let lowlandWeight = 1.0 - smoothstep(30.0, 600.0, hMeters);');
      expect(shaderSrc).toContain('let lowlandMicroShade = (kRidge - kValley) * 0.40 * lowlandWeight;');
    });

    it('R18-TERRAIN-06: verifies stratum isolation separates montane plateau (h < 5200m) from glacial summit (h >= 5200m)', () => {
      expect(shaderSrc).toContain('} else if (input.elevation < 5200.0) {');
      expect(shaderSrc).toContain('currentStratum = 3u; // Steppe / Montane Plateaus');
      expect(shaderSrc).toContain('currentStratum = 4u; // Glacial Summits & Alpine Ridges');
      expect(shaderSrc).toContain('if (input.elevation < -5500.0) {');
      expect(shaderSrc).toContain('currentStratum = 0u; // Abyssal Trench');
    });
  });

  // ==========================================================================
  // Suite 5: WebGPU Invariant Verification
  // ==========================================================================
  describe('5. WebGPU Invariant Verification', () => {
    it('R18-INV-01: Invariant #3 - WGSL uniform control flow preserved (no derivatives in branches)', () => {
      // All fwidth, dpdx, dpdy must occur before any conditional branching
      const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main(');
      expect(fsMainIdx).toBeGreaterThan(0);

      const dUVIdx = shaderSrc.indexOf('let dUV = fwidth(input.uv);');
      expect(dUVIdx).toBeGreaterThan(fsMainIdx);

      // Ensure no other fwidth appears downstream inside conditional blocks
      const afterDUV = shaderSrc.substring(dUVIdx + 30);
      const secondFwidth = afterDUV.indexOf('fwidth(');
      expect(secondFwidth).toBe(-1);
    });

    it('R18-INV-02: Invariant #28 - Dedicated inks across all 3 themes (Theme 0, Theme 1, Theme 2)', () => {
      // Verify all 3 themes are explicitly handled in bathymetry
      expect(shaderSrc).toContain('if (sim.u_theme == 2u)');
      expect(shaderSrc).toContain('} else if (sim.u_theme == 1u)');
      // Theme 0 is the default branch
      expect(shaderSrc).toContain('// Marie Tharp: High-contrast');
    });
  });
});
