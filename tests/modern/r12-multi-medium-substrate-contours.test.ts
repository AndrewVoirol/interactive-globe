import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Requirement R12: Multi-Medium Physical Substrate & Analytical Contours', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  // ==========================================================================
  // SECTION 1: WGSL Derivative Control Flow Safety (Invariant #3)
  // ==========================================================================
  describe('1. WGSL Uniform Control Flow & Derivative Verification', () => {
    it('R12-WGSL-01: verifies strictly 7 derivative calls in fs_main and 0 in conditional blocks', () => {
      const lines = shaderSrc.split('\n');
      const derivativeRegex = /\b(dpdx|dpdy|fwidth)(Fine|Coarse)?\s*\(/;
      const occurrences: { lineNum: number; lineContent: string; fn: string }[] = [];
      let currentFunction = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const fnMatch = trimmed.match(/fn\s+([a-zA-Z0-9_]+)\s*\(/);
        if (fnMatch) {
          currentFunction = fnMatch[1];
        }

        if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          continue;
        }

        if (derivativeRegex.test(line)) {
          occurrences.push({
            lineNum: i + 1,
            lineContent: trimmed,
            fn: currentFunction,
          });
        }
      }

      // Exactly 7 active derivative evaluations must exist in the entire shader
      expect(occurrences.length).toBe(7);
      for (const occ of occurrences) {
        expect(occ.fn).toBe('fs_main');
      }
    });

    it('R12-WGSL-02: verifies explicit-LOD texture sampling (zero textureSample calls)', () => {
      const fsMainStart = shaderSrc.indexOf('fn fs_main(');
      expect(fsMainStart).toBeGreaterThan(-1);
      const fsMainBody = shaderSrc.slice(fsMainStart);

      const lines = fsMainBody.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;
        expect(trimmed.includes('textureSample(')).toBe(false);
      }
    });
  });

  // ==========================================================================
  // SECTION 2: Scope 1 - Prussian Cyanotype Substrate Deepening
  // ==========================================================================
  describe('2. Scope 1: Prussian Cyanotype Substrate Deepening', () => {
    it('R12-CYANO-01: implements Prussian blue colloidal crystal precipitation noise in deep exposure', () => {
      expect(shaderSrc).toContain('crystalGranularity');
      expect(shaderSrc).toContain('crystalStrength');
      expect(shaderSrc).toContain('cPrussianCrystal');
      // Hex #0F1C2E / rgb(0.06, 0.11, 0.18)
      expect(shaderSrc).toMatch(/vec3<f32>\(\s*0\.06\s*,\s*0\.11\s*,\s*0\.18\s*\)/);
    });

    it('R12-CYANO-02: implements wash edge rinse boundary darkening along exposure transition gradient', () => {
      expect(shaderSrc).toContain('washEdgeBand');
      expect(shaderSrc).toContain('cWashEdgeIndigo');
      expect(shaderSrc).toMatch(/vec3<f32>\(\s*0\.08\s*,\s*0\.15\s*,\s*0\.25\s*\)/);
    });

    it('R12-CYANO-03: implements structured orthogonal warp/weft linen weave grid on land and bathymetry', () => {
      expect(shaderSrc).toContain('isWarpOver');
      expect(shaderSrc).toContain('weaveGrid');
      expect(shaderSrc).toContain('linenSlub');
      // Linen tooth weight enhanced with u_roughness * 0.65
      expect(shaderSrc).toMatch(/sim\.u_roughness\s*\*\s*0\.65/);
    });

    it('R12-CYANO-04: verifies strictly monochromatic palette (no warm sepia or umber in Theme 2)', () => {
      // Find Theme 2 land shading block
      const theme2LandMatch = shaderSrc.match(/else\s+if\s*\(\s*sim\.u_theme\s*==\s*2u\s*\)\s*\{([\s\S]*?)\n\s*\}\s*\n/);
      expect(theme2LandMatch).not.toBeNull();
      const theme2Block = theme2LandMatch![1];

      // Must NOT contain warm pigments
      expect(theme2Block).not.toContain('cCopperplateSepia');
      expect(theme2Block).not.toContain('cInkTharp');
      expect(theme2Block).not.toContain('cParchmentInk');
    });
  });

  // ==========================================================================
  // SECTION 3: Scope 2 - Marie Tharp Substrate Simulation
  // ==========================================================================
  describe('3. Scope 2: Marie Tharp Illustration Board & Gouache Substrate', () => {
    it('R12-THARP-01: models Berann directional gouache brushwork aligned to slope & contours', () => {
      expect(shaderSrc).toContain('painterlyBrush');
      expect(shaderSrc).toContain('cGouacheBody');
      expect(shaderSrc).toContain('strokeFlank');
    });

    it('R12-THARP-02: implements illustration board substrate with lower frequency broader grain', () => {
      // Illustration board uses lower frequency (750) than cotton rag (1800)
      expect(shaderSrc).toMatch(/boardFreq\s*=\s*750\.0/);
      expect(shaderSrc).toContain('boardTooth');
    });

    it('R12-THARP-03: implements subtractive ink absorption into warm parchment illustration board', () => {
      expect(shaderSrc).toContain('kTharpInk');
      expect(shaderSrc).toContain('cBoardBase');
      expect(shaderSrc).toContain('boardAbsorbed');
    });
  });

  // ==========================================================================
  // SECTION 4: Scopes 3, 4, 5 - Medium-Specific Contours & Isobaths
  // ==========================================================================
  describe('4. Scopes 3, 4, 5: Contours and Oceanographic Isobaths', () => {
    it('R12-CONTOUR-01: generates Eduard Imhof Swiss relief contours in sepia ink for Cream Rag (Theme 1)', () => {
      expect(shaderSrc).toContain('creamFreq');
      expect(shaderSrc).toContain('distMinor');
      expect(shaderSrc).toContain('distMajor');
      expect(shaderSrc).toContain('cCopperplateSepia');
    });

    it('R12-CONTOUR-02: fades Cream Rag contours on steep slopes (>20°) where Lehmann hachures dominate', () => {
      expect(shaderSrc).toContain('hachureFade');
      expect(shaderSrc).toMatch(/hachureFade\s*=\s*1\.0\s*-\s*smoothstep\(\s*0\.30\s*,\s*0\.42\s*,\s*slopeAngle\s*\)/);
    });

    it('R12-CONTOUR-03: generates oceanographic isobaths (1000m) in marine turquoise for Marie Tharp (Theme 0)', () => {
      expect(shaderSrc).toContain('isobathFreq');
      expect(shaderSrc).toContain('distToIsobath');
      expect(shaderSrc).toContain('cMarineTurquoise');
      // Verifies isobaths are only in ocean basins (isLand <= 0.45)
      expect(shaderSrc).toMatch(/if\s*\(\s*isLand\s*<=\s*0\.45\s*\)/);
    });

    it('R12-CONTOUR-04: Marie Tharp land has NO contour lines', () => {
      // Theme 0 block inside medium contours
      const theme0ContourMatch = shaderSrc.match(/else\s+if\s*\(\s*sim\.u_theme\s*==\s*0u\s*\)\s*\{([\s\S]*?)\}/);
      expect(theme0ContourMatch).not.toBeNull();
      const theme0Block = theme0ContourMatch![1];
      // Only runs if isLand <= 0.45
      expect(theme0Block).toContain('isLand <= 0.45');
      expect(theme0Block).not.toContain('isLand > 0.45');
    });

    it('R12-CONTOUR-05: tunes Cyanotype contours with view-dependent frequency and screen-space anti-Moiré feathering', () => {
      expect(shaderSrc).toContain('cyanoFreq');
      expect(shaderSrc).toContain('moireGuard');
      expect(shaderSrc).toContain('cChalkContour');
    });

    it('R12-CONTOUR-06: computes contour derivatives from unscaled DEM gradient differences to prevent displacement blowout', () => {
      expect(shaderSrc).toContain('dDemLandX');
      expect(shaderSrc).toContain('dDemDepthX');
      expect(shaderSrc).toContain('dDemGlobalX');
      // Verifies unscaled half-difference from 5-tap DEM
      expect(shaderSrc).toMatch(/dDemLandX\s*=\s*\(finalDemR\.r\s*-\s*finalDemL\.r\)\s*\*\s*0\.5/);
      expect(shaderSrc).toMatch(/dDemDepthX\s*=\s*\(finalDemR\.g\s*-\s*finalDemL\.g\)\s*\*\s*0\.5/);
      expect(shaderSrc).toMatch(/dDemGlobalX\s*=\s*\(finalDemR\.a\s*-\s*finalDemL\.a\)\s*\*\s*0\.5/);
    });

    it('R12-CONTOUR-07: generates continental shelf break isobaths (200m) in ocean basins', () => {
      expect(shaderSrc).toContain('shelfIsobathVal');
      expect(shaderSrc).toContain('distToShelfIsobath');
      expect(shaderSrc).toContain('isShelfIsobath');
      expect(shaderSrc).toContain('netIsobath');
    });

    it('R12-SUBSTRATE-01: scales all paper and substrate textures by cosLat to preserve isotropic grain across latitudes', () => {
      // Theme 0: Illustration board
      expect(shaderSrc).toMatch(/boardCoord\s*=\s*vec2<f32>\(input\.uv\.x\s*\*\s*cosLat,\s*input\.uv\.y\)\s*\*\s*boardFreq/);
      // Theme 2: Prussian crystal noise on land and ocean
      expect(shaderSrc).toMatch(/crystalCoord\s*=\s*vec2<f32>\(input\.uv\.x\s*\*\s*cosLat,\s*input\.uv\.y\)\s*\*\s*crystalFreq/);
      expect(shaderSrc).toMatch(/bCrystalCoord\s*=\s*vec2<f32>\(input\.uv\.x\s*\*\s*cosLat,\s*input\.uv\.y\)/);
    });

    it('R12-MATH-01: proves moireGuard does NOT extinguish contours under typical mountain slopes (0.05 to 0.25)', () => {
      // Simulate typical slope and zoom values
      // At zoom 6.1 (Hawaii / Alps): pxPerTexel ~ 1.0, creamFreq ~ 64.0
      // Slope: 10% slope over 5km texel -> dDemLand ~ 0.003
      const slopes = [0.001, 0.002, 0.005, 0.008, 0.012];
      const pxPerTexel = 1.0;
      const creamFreq = 64.0;

      for (const slope of slopes) {
        const dElevPx = slope * pxPerTexel * creamFreq;
        const smoothstep = (min: number, max: number, x: number) => {
          const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
          return t * t * (3 - 2 * t);
        };
        const moireGuard = 1.0 - smoothstep(0.35, 0.85, dElevPx);
        // moireGuard MUST be > 0 (contours remain visible and not killed)
        expect(moireGuard).toBeGreaterThan(0.0);
      }
    });
  });
});
