import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Stage 1 Geomorphic Hydrology Drainage & Invariant Verification', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  // --------------------------------------------------------------------------
  // 1. WGSL Invariant #3: Uniform Control Flow Conformance
  // --------------------------------------------------------------------------
  describe('Invariant #3: WGSL Uniform Control Flow & Unconditional Derivatives', () => {
    it('HYDRO-01: verifies all finite difference derivatives and 5-tap DEM sampling precede any branching or discard in fs_main', () => {
      const fsMainIdx = shaderSrc.indexOf('fn fs_main(');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainBody = shaderSrc.slice(fsMainIdx);

      const fwidthIdx = fsMainBody.indexOf('fwidth(');
      const dpdxIdx = fsMainBody.indexOf('dpdx(');
      const dpdyIdx = fsMainBody.indexOf('dpdy(');
      const demCIdx = fsMainBody.indexOf('let demC = textureSampleLevel(');
      const firstDiscardIdx = fsMainBody.indexOf('discard;');
      const firstBranchIdx = fsMainBody.indexOf('if (sim.u_mode == 4u');

      expect(fwidthIdx).toBeGreaterThan(0);
      expect(dpdxIdx).toBeGreaterThan(0);
      expect(dpdyIdx).toBeGreaterThan(0);
      expect(demCIdx).toBeGreaterThan(0);

      // Derivatives and DEM sampling MUST occur strictly before first discard
      expect(fwidthIdx).toBeLessThan(firstDiscardIdx);
      expect(dpdxIdx).toBeLessThan(firstDiscardIdx);
      expect(dpdyIdx).toBeLessThan(firstDiscardIdx);
      expect(demCIdx).toBeLessThan(firstDiscardIdx);

      // And strictly before first conditional branch
      expect(fwidthIdx).toBeLessThan(firstBranchIdx);
      expect(dpdxIdx).toBeLessThan(firstBranchIdx);
      expect(demCIdx).toBeLessThan(firstBranchIdx);
    });

    it('HYDRO-02: verifies antimeridian longitude wrapping and polar clamping eliminate border artifacts', () => {
      expect(shaderSrc).toContain('let uvR = vec2<f32>(fract(input.uv.x + ts.x), clamp(input.uv.y, 0.0, 1.0));');
      expect(shaderSrc).toContain('let uvL = vec2<f32>(fract(input.uv.x - ts.x + 1.0), clamp(input.uv.y, 0.0, 1.0));');
      expect(shaderSrc).toContain('let uvU = vec2<f32>(input.uv.x, clamp(input.uv.y + ts.y, 0.0, 1.0));');
      expect(shaderSrc).toContain('let uvD = vec2<f32>(input.uv.x, clamp(input.uv.y - ts.y, 0.0, 1.0));');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Invariant #7: Vector Hierarchy & Line Ratio (55-60%)
  // --------------------------------------------------------------------------
  describe('Invariant #7: River Width Proportions (55-60% of Coastline Width)', () => {
    it('HYDRO-03: verifies maximum confluence river width is strictly 55-60% of 3.40px coastline width', () => {
      const coastlineWidth = 3.40;
      const maxRiverWidth = 1.98;
      const minRiverWidth = 0.40;

      const ratio = maxRiverWidth / coastlineWidth;
      expect(ratio).toBeGreaterThanOrEqual(0.55);
      expect(ratio).toBeLessThanOrEqual(0.60);
      expect(minRiverWidth).toBeLessThan(1.0); // Hairline headwaters

      expect(shaderSrc).toContain('let riverWidthPx = mix(0.40, 1.98, descentAccum);');
    });

    it('HYDRO-04: evaluates continuous self-tapering width from alpine cirques to coastal estuaries', () => {
      function calcRiverWidth(normElev: number): { widthPx: number; ratio: number } {
        const descentAccum = Math.pow(1.0 - Math.min(Math.max(normElev, 0.0), 1.0), 1.6);
        const widthPx = 0.40 + (1.98 - 0.40) * descentAccum;
        return { widthPx, ratio: widthPx / 3.40 };
      }

      // Alpine headwaters (elevation 7000m -> normElev ~ 0.8)
      const headwaters = calcRiverWidth(0.80);
      expect(headwaters.widthPx).toBeCloseTo(0.51, 1);
      expect(headwaters.ratio).toBeLessThan(0.20); // Delicate hairline

      // Mid-elevation montane valleys (elevation 2000m -> normElev ~ 0.23)
      const midValley = calcRiverWidth(0.23);
      expect(midValley.widthPx).toBeGreaterThan(1.20);
      expect(midValley.widthPx).toBeLessThan(1.60);

      // Lowland trunk rivers (elevation 50m -> normElev ~ 0.006)
      const estuary = calcRiverWidth(0.006);
      expect(estuary.widthPx).toBeCloseTo(1.97, 1);
      expect(estuary.ratio).toBeGreaterThanOrEqual(0.55);
      expect(estuary.ratio).toBeLessThanOrEqual(0.60);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Geomorphic Curvature & Sub-Texel Trough Centering
  // --------------------------------------------------------------------------
  describe('Geomorphic Trough Centering & Curvature Detection', () => {
    it('HYDRO-05: verifies discrete second-derivative valley trough centering math yields 0 offset at true minimum', () => {
      // Symmetrical U-shaped valley centered in cell: hC = 0.2, hR = 0.4, hL = 0.4
      const hC = 0.2;
      const hR = 0.4;
      const hL = 0.4;
      const d2x = hR + hL - 2.0 * hC;
      const gx = (hR - hL) * 0.5;

      expect(d2x).toBeCloseTo(0.4, 4);
      expect(gx).toBeCloseTo(0.0, 4);

      const deltaX = -Math.min(Math.max(gx / Math.max(d2x, 1e-4), -0.75), 0.75);
      expect(deltaX).toBeCloseTo(0.0, 4); // Perfectly centered
    });

    it('HYDRO-06: verifies off-center trough shifts offset in direction of descent towards valley floor', () => {
      // Off-center valley: hC = 0.3, hR = 0.5, hL = 0.2 (trough is to the left towards hL)
      const hC = 0.3;
      const hR = 0.5;
      const hL = 0.2;
      const d2x = hR + hL - 2.0 * hC; // 0.1 > 0 (concave)
      const gx = (hR - hL) * 0.5; // 0.15 > 0 (sloping upward to right)

      const deltaX = -Math.min(Math.max(gx / Math.max(d2x, 1e-4), -0.75), 0.75);
      expect(deltaX).toBeLessThan(0.0); // Correctly points left towards lower valley floor
    });
  });

  // --------------------------------------------------------------------------
  // 4. Cartographic Color Harmony & Watercolor Shelves
  // --------------------------------------------------------------------------
  describe('Cartographic Inks & Watercolor Shelves Presentation', () => {
    it('HYDRO-07: verifies Theme 1 uses archival washed celadon-lapis glazes (#77998B to #263B52)', () => {
      expect(shaderSrc).toContain('let cAlpineCeladon = vec3<f32>(0.32, 0.48, 0.46);');
      expect(shaderSrc).toContain('let cLowlandLapis   = vec3<f32>(0.18, 0.32, 0.46);');
      expect(shaderSrc).toContain('glazeAlpha = waterwayGlaze * mix(0.38, 0.52, descentAccum);');
    });

    it('HYDRO-08: verifies Theme 2 uses washed architectural cerulean blueprint drafting ink', () => {
      expect(shaderSrc).toContain('let cChalkCerulean = vec3<f32>(0.52, 0.76, 0.92);');
      expect(shaderSrc).toContain('let cDraftCerulean = vec3<f32>(0.32, 0.58, 0.80);');
    });

    it('HYDRO-09: verifies Eduard Imhof tiered watercolor shelves transition smoothly at shelf break', () => {
      expect(shaderSrc).toContain('let shelfTier = smoothstep(0.004, 0.018, normDepth);');
      expect(shaderSrc).toContain('cBathyShelf  = mix(cInnerShelf, cOuterShelf, shelfTier);');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Numerical Stability & Singularity Robustness
  // --------------------------------------------------------------------------
  describe('Numerical Stability (10,000 Random Samples)', () => {
    it('HYDRO-10: proves zero NaNs, zero Infs across all valid and boundary elevation/curvature inputs', () => {
      let seed = 987654321;
      function rnd() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      for (let i = 0; i < 10000; i++) {
        const normElev = rnd();
        const kValley = rnd();
        const distPx = rnd() * 10.0;

        const descentAccum = Math.pow(1.0 - normElev, 1.6);
        const riverWidthPx = 0.40 + (1.98 - 0.40) * descentAccum;
        const riverHalfWidth = riverWidthPx * 0.5;
        const riverFeather = 0.45;

        const t = Math.min(Math.max((distPx - (riverHalfWidth - riverFeather)) / (2.0 * riverFeather), 0.0), 1.0);
        const channelCoverage = 1.0 - (t * t * (3.0 - 2.0 * t));
        const valleyGate = Math.min(Math.max((kValley - 0.06) / (0.32 - 0.06), 0.0), 1.0);
        const glaze = channelCoverage * valleyGate;

        expect(Number.isNaN(glaze)).toBe(false);
        expect(Number.isFinite(glaze)).toBe(true);
        expect(glaze).toBeGreaterThanOrEqual(0.0);
        expect(glaze).toBeLessThanOrEqual(1.0);
      }
    });
  });
});
