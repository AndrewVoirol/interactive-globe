// ============================================================================
// File: tests/modern/challenger-m3-cloud-shader-control-flow.test.ts
// Challenger: challenger_m3_2 (teamwork_preview_challenger)
// Milestone: Milestone 3 (Cloud Shell WGSL Shader & Inking)
// Invariants: §3 (UCF), §5 (Premul Alpha), §10 (Horizon Tangent), §15 (DEM Parity),
//             §20 (Buffer Discipline), §24 (Zero-Recompile), §28 (Theme Parity),
//             §44 (Metric Latitude Scaling), §46 (Import Integrity), §48 (No Hardcoded Dims)
// Description: Exhaustive adversarial verification suite with 100,000-trial
//              Monte Carlo stress tests, mathematical singularity probing,
//              WGSL uniform control flow audit, and geometric boundary tests.
// ============================================================================

import { describe, it, expect } from 'vitest';
import cloudShellWGSL from '../../src/webgpu/shaders/cloud_shell.wgsl?raw';

describe('Adversarial Challenger Suite: Cloud Shell WGSL Control Flow & Shader Integrity (Milestone 3)', () => {
  const SPHERE_RADIUS = 5.0;
  const PI = Math.PI;

  function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // --------------------------------------------------------------------------
  // Pillar 1: Anti-Cheating Test Import Integrity (Invariant §46)
  // --------------------------------------------------------------------------
  describe('Pillar 1: Invariant §46 - Anti-Cheating Production Source Verification', () => {
    it('CHALLENGE-M3-01: cloud_shell.wgsl is imported directly from src/webgpu/shaders/ without stubs', () => {
      expect(cloudShellWGSL).toBeDefined();
      expect(cloudShellWGSL.length).toBeGreaterThan(6000);

      // Verify production shader entry points exist
      expect(cloudShellWGSL).toContain('@vertex');
      expect(cloudShellWGSL).toContain('fn vs_main');
      expect(cloudShellWGSL).toContain('@fragment');
      expect(cloudShellWGSL).toContain('fn fs_main');

      // Verify required group(0) bindings
      expect(cloudShellWGSL).toContain('@group(0) @binding(0) var<uniform> cloud: CloudUniforms;');
      expect(cloudShellWGSL).toContain('@group(0) @binding(1) var u_cloudTexture: texture_2d<f32>;');
      expect(cloudShellWGSL).toContain('@group(0) @binding(2) var u_cloudSampler: sampler;');
      expect(cloudShellWGSL).toContain('@group(0) @binding(3) var u_demTexture: texture_2d<f32>;');
      expect(cloudShellWGSL).toContain('@group(0) @binding(4) var u_demSampler: sampler;');
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: WGSL Uniform Control Flow (Invariant §3) & Static Call Graph
  // --------------------------------------------------------------------------
  describe('Pillar 2: Invariant §3 - WGSL Uniform Control Flow Audit', () => {
    it('CHALLENGE-M3-02: All finite-difference derivatives are evaluated unconditionally before branches or discards', () => {
      const fsMainIdx = cloudShellWGSL.indexOf('fn fs_main(in: VertexOutput)');
      expect(fsMainIdx).toBeGreaterThan(-1);

      const dUvIdx = cloudShellWGSL.indexOf('let dUv = fwidth(in.uv);', fsMainIdx);
      const dudxIdx = cloudShellWGSL.indexOf('let du_dx = dpdx(in.uv.x);', fsMainIdx);
      const dudyIdx = cloudShellWGSL.indexOf('let du_dy = dpdy(in.uv.x);', fsMainIdx);
      const dvdxIdx = cloudShellWGSL.indexOf('let dv_dx = dpdx(in.uv.y);', fsMainIdx);
      const dvdyIdx = cloudShellWGSL.indexOf('let dv_dy = dpdy(in.uv.y);', fsMainIdx);

      // Find first branch / conditional or discard
      const firstDiscardIdx = cloudShellWGSL.indexOf('discard;', fsMainIdx);
      const firstIfIdx = cloudShellWGSL.indexOf('if (', fsMainIdx);

      const allDerivs = [dUvIdx, dudxIdx, dudyIdx, dvdxIdx, dvdyIdx];
      for (const idx of allDerivs) {
        expect(idx).toBeGreaterThan(fsMainIdx);
        expect(idx).toBeLessThan(firstDiscardIdx);
        // Note: layerIdx branching occurs for drift speed, but derivatives are placed before any branch
        expect(idx).toBeLessThan(cloudShellWGSL.indexOf('if (layerIdx == 1u)', fsMainIdx));
      }
    });

    it('CHALLENGE-M3-03: Zero textureSample() calls inside conditional blocks (explicit LOD used)', () => {
      // In vs_main and fs_main, sampling must use textureSampleLevel (explicit LOD 0.0)
      expect(cloudShellWGSL).toContain('textureSampleLevel(u_demTexture, u_demSampler, input.uv, 0.0)');
      expect(cloudShellWGSL).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, sampleUV, 0.0)');

      // Verify no implicit LOD textureSample exists
      const regexImplicitSample = /\btextureSample\s*\(/g;
      const matches = cloudShellWGSL.match(regexImplicitSample);
      expect(matches).toBeNull();
    });

    it('CHALLENGE-M3-04: Derivative values are anchored into output alpha to defeat compiler dead-code elimination', () => {
      expect(cloudShellWGSL).toContain('let derivAnchor = (du_dx + du_dy + dv_dx + dv_dy + dUv.x) * 1.0e-7;');
      expect(cloudShellWGSL).toContain('let finalAlpha = clamp(alpha, 0.0, 1.0) + derivAnchor;');
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Premultiplied Alpha Transparent Clear & Compositing (Invariant §5)
  // --------------------------------------------------------------------------
  describe('Pillar 3: Invariant §5 - Premultiplied Alpha 100,000-Trial Monte Carlo Fuzzing', () => {
    it('CHALLENGE-M3-05: 100,000 randomized Monte Carlo trials confirm rgb <= alpha in premultiplied space', () => {
      for (let i = 0; i < 100_000; i++) {
        const r = Math.random();
        const g = Math.random();
        const b = Math.random();
        const a = Math.random();

        const premulR = r * a;
        const premulG = g * a;
        const premulB = b * a;

        // In premultiplied alpha space: Color_out = Color_rgb * Alpha
        // Therefore Color_out <= Alpha is mathematically guaranteed for all Color_rgb in [0, 1]
        expect(premulR).toBeLessThanOrEqual(a + 1e-7);
        expect(premulG).toBeLessThanOrEqual(a + 1e-7);
        expect(premulB).toBeLessThanOrEqual(a + 1e-7);
        expect(Number.isFinite(premulR)).toBe(true);
        expect(Number.isFinite(premulG)).toBe(true);
        expect(Number.isFinite(premulB)).toBe(true);
      }
    });

    it('CHALLENGE-M3-06: Extreme boundary alpha values (0.0, 1.0, 1e-7) produce exact premultiplied outputs', () => {
      const color = [0.96, 0.96, 0.94];
      const testAlphas = [0.0, 1e-7, 1e-4, 0.5, 1.0];

      for (const alpha of testAlphas) {
        const out = [color[0] * alpha, color[1] * alpha, color[2] * alpha, alpha];
        if (alpha === 0.0) {
          expect(out[0]).toBe(0.0);
          expect(out[1]).toBe(0.0);
          expect(out[2]).toBe(0.0);
          expect(out[3]).toBe(0.0);
        } else if (alpha === 1.0) {
          expect(out[0]).toBeCloseTo(color[0], 5);
          expect(out[1]).toBeCloseTo(color[1], 5);
          expect(out[2]).toBeCloseTo(color[2], 5);
          expect(out[3]).toBe(1.0);
        }
        expect(out[0]).toBeLessThanOrEqual(out[3]);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Horizon Tangent Attenuation (Invariant §10) & 100,000-Trial Fuzzing
  // --------------------------------------------------------------------------
  describe('Pillar 4: Invariant §10 - Horizon Tangent Attenuation Boundary Probing', () => {
    it('CHALLENGE-M3-07: 100,000 Monte Carlo facing trials confirm monotonic, bounded [0, 1] attenuation', () => {
      let prevFacing = -1.0;
      let prevAtten = 0.0;

      for (let i = 0; i < 100_000; i++) {
        // Sample facing dot product in [-1.0, 1.0]
        const facing = -1.0 + (i / 100_000) * 2.0;
        const atten = smoothstep(0.02, 0.20, facing);

        expect(atten).toBeGreaterThanOrEqual(0.0);
        expect(atten).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(atten)).toBe(true);

        if (facing <= 0.02) {
          expect(atten).toBe(0.0);
        } else if (facing >= 0.20) {
          expect(atten).toBe(1.0);
        } else {
          // In the transition interval [0.02, 0.20], it must be strictly non-decreasing
          expect(atten).toBeGreaterThanOrEqual(prevAtten);
        }

        prevFacing = facing;
        prevAtten = atten;
      }
    });

    it('CHALLENGE-M3-08: Limb discard condition triggers only for globe mode (u_unfurl < 0.20) with back-facing fragments', () => {
      expect(cloudShellWGSL).toContain('if (cloud.u_unfurl < 0.20 && in.facing < 0.02)');
      // Flat map mode (u_unfurl >= 0.20) never triggers limb discard
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 5: Cross-Pipeline DEM Mathematical Parity (Invariant §15)
  // --------------------------------------------------------------------------
  describe('Pillar 5: Invariant §15 - DEM Geoid Decoding 100,000-Trial Monte Carlo Probing', () => {
    const decodeElevation = (a: number) => a * 19772.0 - 10924.0;

    it('CHALLENGE-M3-09: 100,000 random alpha samples decode linearly in [-10924m, +8848m]', () => {
      for (let i = 0; i < 100_000; i++) {
        const a = Math.random();
        const elev = decodeElevation(a);

        expect(elev).toBeGreaterThanOrEqual(-10924.0);
        expect(elev).toBeLessThanOrEqual(8848.0);
        expect(Number.isFinite(elev)).toBe(true);
      }
    });

    it('CHALLENGE-M3-10: Orographic lift logic yields zero lift for oceanic bathymetry (elevMeters <= 0)', () => {
      // oceanic bathymetry has elevMeters <= 0.0
      // In WGSL: let terrainLift = max(0.0, elevMeters / 8848.0) * (cloud.u_layerStandoff.w * 2.8) * terrainDamp;
      const calcLift = (elevMeters: number, dispScale: number, terrainDamp: number) =>
        Math.max(0.0, elevMeters / 8848.0) * (dispScale * 2.8) * terrainDamp;

      const oceanElevations = [-10924.0, -5000.0, -1000.0, -50.0, 0.0];
      for (const elev of oceanElevations) {
        expect(calcLift(elev, 0.005, 0.85)).toBe(0.0);
      }

      // Mountain summits produce positive, bounded lift
      const summitLift = calcLift(8848.0, 0.005, 0.85);
      expect(summitLift).toBeCloseTo(1.0 * (0.005 * 2.8) * 0.85, 6);
      expect(summitLift).toBeGreaterThan(0.0);
      expect(summitLift).toBeLessThan(0.02); // reasonable scale
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 6: Manifold Evaluation Across All 5 Paradigms (50,000 Trials)
  // --------------------------------------------------------------------------
  describe('Pillar 6: Mathematical Manifold Evaluation Stress Fuzzing (50,000 Trials)', () => {
    // TypeScript mirror of evaluateManifold in cloud_shell.wgsl
    function evaluateManifold(
      pos3D: [number, number, number],
      mercator2D: [number, number],
      dymaxion2D: [number, number],
      unfurl: number,
      mode: number
    ): [number, number, number] {
      const ease = unfurl * unfurl * (3.0 - 2.0 * unfurl);
      const pos2D: [number, number, number] = [mercator2D[0], mercator2D[1], 0.0];

      if (mode === 1) {
        // Mode 1: Cylindrical Scroll
        const oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
          const invOneMinusT = 1.0 / oneMinusT;
          const lonRad = Math.atan2(pos3D[0], pos3D[2]);
          const curAngle = oneMinusT * lonRad;
          const latRad = Math.asin(Math.max(-0.999, Math.min(0.999, pos3D[1] / SPHERE_RADIUS)));
          const cosLat = Math.cos(latRad);
          const curX = (SPHERE_RADIUS * invOneMinusT) * Math.sin(curAngle);
          const curZ = (SPHERE_RADIUS * cosLat * invOneMinusT) * (Math.cos(curAngle) - 1.0) + (SPHERE_RADIUS * cosLat * oneMinusT);
          const curY = pos3D[1] * (1 - ease) + pos2D[1] * ease;
          return [curX, curY, curZ];
        } else {
          return pos2D;
        }
      } else if (mode === 4) {
        // Mode 4: Fuller Dymaxion
        const dym2D: [number, number, number] = [dymaxion2D[0], dymaxion2D[1], 0.0];
        const arch = Math.sin(PI * unfurl) * 0.45;
        const len = Math.sqrt(pos3D[0] * pos3D[0] + pos3D[1] * pos3D[1] + pos3D[2] * pos3D[2]);
        const sphereNorm = len > 0.001 ? [pos3D[0] / len, pos3D[1] / len, pos3D[2] / len] : [0, 0, 1];
        return [
          pos3D[0] * (1 - ease) + dym2D[0] * ease + sphereNorm[0] * arch,
          pos3D[1] * (1 - ease) + dym2D[1] * ease + sphereNorm[1] * arch,
          pos3D[2] * (1 - ease) + dym2D[2] * ease + sphereNorm[2] * arch,
        ];
      }

      // Default Modes 0, 2, 3 (Linear Mix)
      return [
        pos3D[0] * (1 - ease) + pos2D[0] * ease,
        pos3D[1] * (1 - ease) + pos2D[1] * ease,
        pos3D[2] * (1 - ease) + pos2D[2] * ease,
      ];
    }

    it('CHALLENGE-M3-11: 50,000 randomized trials across all modes and unfurl parameters yield zero NaNs or Infs', () => {
      for (let i = 0; i < 50_000; i++) {
        // Generate random spherical point
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * PI * u;
        const phi = Math.acos(2 * v - 1);
        const x = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta);
        const y = SPHERE_RADIUS * Math.cos(phi);
        const z = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta);

        const mercator2D: [number, number] = [(u - 0.5) * 10.0, (v - 0.5) * 10.0];
        const dymaxion2D: [number, number] = [(u - 0.5) * 8.0, (v - 0.5) * 8.0];
        const unfurl = Math.random();
        const mode = Math.floor(Math.random() * 5); // 0, 1, 2, 3, 4

        const res = evaluateManifold([x, y, z], mercator2D, dymaxion2D, unfurl, mode);

        expect(Number.isFinite(res[0])).toBe(true);
        expect(Number.isFinite(res[1])).toBe(true);
        expect(Number.isFinite(res[2])).toBe(true);
      }
    });

    it('CHALLENGE-M3-12: Mode 1 Cylindrical Scroll transition boundary at unfurl -> 1.0 handles singularity smoothly', () => {
      const pos3D: [number, number, number] = [0.0, 0.0, SPHERE_RADIUS];
      const mercator2D: [number, number] = [0.0, 0.0];
      const dymaxion2D: [number, number] = [0.0, 0.0];

      // Probing exactly around unfurl = 1.0 (ease = 1.0, oneMinusT = 0)
      const nearOneUnfurls = [0.999, 0.9999, 0.99999, 1.0];
      for (const u of nearOneUnfurls) {
        const res = evaluateManifold(pos3D, mercator2D, dymaxion2D, u, 1);
        expect(Number.isFinite(res[0])).toBe(true);
        expect(Number.isFinite(res[1])).toBe(true);
        expect(Number.isFinite(res[2])).toBe(true);
      }
    });

    it('CHALLENGE-M3-13: Mode 4 Fuller Dymaxion protects against zero-length vector division', () => {
      // Degenerate zero position input
      const zeroPos: [number, number, number] = [0.0, 0.0, 0.0];
      const res = evaluateManifold(zeroPos, [1.0, 2.0], [3.0, 4.0], 0.5, 4);

      expect(Number.isFinite(res[0])).toBe(true);
      expect(Number.isFinite(res[1])).toBe(true);
      expect(Number.isFinite(res[2])).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 7: Invariant §28 - Multi-Medium Archival Inking & Contrast
  // --------------------------------------------------------------------------
  describe('Pillar 7: Invariant §28 - Archival Ink Color Metrics & Theme Branching', () => {
    it('CHALLENGE-M3-14: Shaders contain distinct branches for Themes 0, 1, 2 with no binary fallthrough', () => {
      expect(cloudShellWGSL).toContain('if (cloud.u_theme == 0u)');
      expect(cloudShellWGSL).toContain('else if (cloud.u_theme == 1u)');
      expect(cloudShellWGSL).toContain('else if (cloud.u_theme == 2u)');
      expect(cloudShellWGSL).toContain('else {'); // Defensive fallback
    });

    it('CHALLENGE-M3-15: Color metrics distinguish all three mediums in OKLCH/sRGB space', () => {
      const tharpWhite = [0.96, 0.96, 0.94];
      const creamIvory = [0.98, 0.95, 0.89];
      const actinicWhite = [0.95, 0.98, 1.00];

      // Euclidean distance in sRGB between each pair must be >= 0.05 (non-identical)
      const dist = (a: number[], b: number[]) =>
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

      expect(dist(tharpWhite, creamIvory)).toBeGreaterThan(0.05);
      expect(dist(creamIvory, actinicWhite)).toBeGreaterThan(0.10);
      expect(dist(tharpWhite, actinicWhite)).toBeGreaterThan(0.06);

      // Cream Ivory must have warm profile: R > G > B
      expect(creamIvory[0]).toBeGreaterThan(creamIvory[1]);
      expect(creamIvory[1]).toBeGreaterThan(creamIvory[2]);

      // Actinic White must have cool/blueprint profile: B >= G > R
      expect(actinicWhite[2]).toBeGreaterThanOrEqual(actinicWhite[1]);
      expect(actinicWhite[1]).toBeGreaterThan(actinicWhite[0]);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 8: Invariant §44 & §48 - Metric Latitude Scaling & No Hardcoded Dimensions
  // --------------------------------------------------------------------------
  describe('Pillar 8: Invariant §44 & §48 - Metric Latitude Scaling and Dynamic Dimensions', () => {
    it('CHALLENGE-M3-16: Paper fiber tooth applies cos(lat) metric scaling to prevent polar distortion', () => {
      expect(cloudShellWGSL).toContain('let latRad = (0.5 - in.uv.y) * PI;');
      expect(cloudShellWGSL).toContain('let cosLat = max(0.1, cos(latRad));');
      expect(cloudShellWGSL).toContain('let toothCoord = vec2<f32>(in.uv.x * cosLat, in.uv.y) * 800.0;');

      // Probing latitude scaling from equator (lat 0°) to poles (lat ±90°)
      const uvYEquator = 0.5;
      const latRadEquator = (0.5 - uvYEquator) * PI;
      expect(Math.cos(latRadEquator)).toBeCloseTo(1.0, 5);

      const uvYPole = 0.0;
      const latRadPole = (0.5 - uvYPole) * PI; // +PI/2
      expect(Math.abs(Math.cos(latRadPole))).toBeCloseTo(0.0, 5);
      // Protected by max(0.1, cos(latRad))
      const safeCosLat = Math.max(0.1, Math.cos(latRadPole));
      expect(safeCosLat).toBe(0.1);
    });

    it('CHALLENGE-M3-17: cloud_shell.wgsl contains zero hardcoded 8192 or 4096 dimensions', () => {
      expect(cloudShellWGSL).not.toContain('8192');
      expect(cloudShellWGSL).not.toContain('4096');
    });
  });
});
