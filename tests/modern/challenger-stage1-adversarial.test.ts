import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Adversarial Challenger: Stage 1 Stress Testing Suite', () => {
  const ribbonShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/vector_ribbon.wgsl');
  const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');

  const ribbonSrc = fs.readFileSync(ribbonShaderPath, 'utf8');
  const crustSrc = fs.readFileSync(crustShaderPath, 'utf8');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

  // ==========================================================================
  // Challenge Scenario 1: Camera Distance Extremes
  // ==========================================================================
  describe('Challenge Scenario 1: Camera Distance Extremes & Stroke Scaling Clamping', () => {
    // Exact TypeScript logic from WebGPUEngine.ts lines 3112-3119
    function computeEngineStroke(camPos: { x: number; y: number; z: number }): {
      camDist: number;
      orbitT: number;
      strokeWidthPx: number;
      u_halfWidthPx: number;
    } {
      const camDist = Math.hypot(camPos.x, camPos.y, camPos.z);
      const orbitT = Math.max(0.0, Math.min(1.0, (camDist - 8.0) / (25.0 - 8.0)));
      const strokeWidthPx = 0.75 + (0.35 - 0.75) * orbitT;
      const u_halfWidthPx = strokeWidthPx * 0.5;
      return { camDist, orbitT, strokeWidthPx, u_halfWidthPx };
    }

    // Exact WGSL logic from vector_ribbon.wgsl lines 312-316
    function computeWgslStroke(camDist: number, u_halfWidthPx: number): {
      orbitT: number;
      targetHalfWidthCss: number;
      effectiveHalfWidthCss: number;
      totalWidthPx: number;
    } {
      const orbitT = Math.min(Math.max((camDist - 8.0) / (25.0 - 8.0), 0.0), 1.0);
      const targetHalfWidthCss = 0.375 + (0.175 - 0.375) * orbitT;
      const effectiveHalfWidthCss = u_halfWidthPx > 0.001 ? u_halfWidthPx : targetHalfWidthCss;
      const totalWidthPx = effectiveHalfWidthCss * 2.0;
      return { orbitT, targetHalfWidthCss, effectiveHalfWidthCss, totalWidthPx };
    }

    it('CHALLENGE-1A: camDist approaching 0.0 (camera at coordinate origin)', () => {
      const res = computeEngineStroke({ x: 0.0, y: 0.0, z: 0.0 });
      expect(res.camDist).toBe(0.0);
      expect(res.orbitT).toBe(0.0);
      expect(res.strokeWidthPx).toBe(0.75); // Clamped to zoomed-in width
      expect(res.u_halfWidthPx).toBe(0.375);
      expect(Number.isFinite(res.strokeWidthPx)).toBe(true);
      expect(Number.isNaN(res.strokeWidthPx)).toBe(false);

      const wgsl = computeWgslStroke(0.0, res.u_halfWidthPx);
      expect(wgsl.orbitT).toBe(0.0);
      expect(wgsl.effectiveHalfWidthCss).toBe(0.375);
      expect(wgsl.totalWidthPx).toBe(0.75);
    });

    it('CHALLENGE-1B: camDist approaching exactly 8.0 (close terrain threshold)', () => {
      const at7999 = computeEngineStroke({ x: 0.0, y: 0.0, z: 7.9999 });
      expect(at7999.orbitT).toBe(0.0);
      expect(at7999.strokeWidthPx).toBe(0.75);

      const at8000 = computeEngineStroke({ x: 0.0, y: 0.0, z: 8.0 });
      expect(at8000.orbitT).toBe(0.0);
      expect(at8000.strokeWidthPx).toBe(0.75);

      const at8001 = computeEngineStroke({ x: 0.0, y: 0.0, z: 8.001 });
      expect(at8001.orbitT).toBeGreaterThan(0.0);
      expect(at8001.orbitT).toBeLessThan(0.001);
      expect(at8001.strokeWidthPx).toBeLessThanOrEqual(0.75);
      expect(at8001.strokeWidthPx).toBeGreaterThan(0.749);
    });

    it('CHALLENGE-1C: camDist approaching exactly 25.0 (planetary orbit threshold)', () => {
      const at2499 = computeEngineStroke({ x: 0.0, y: 0.0, z: 24.99 });
      expect(at2499.orbitT).toBeLessThan(1.0);
      expect(at2499.strokeWidthPx).toBeGreaterThan(0.35);

      const at2500 = computeEngineStroke({ x: 0.0, y: 0.0, z: 25.0 });
      expect(at2500.orbitT).toBe(1.0);
      expect(at2500.strokeWidthPx).toBe(0.35);

      const at2501 = computeEngineStroke({ x: 0.0, y: 0.0, z: 25.01 });
      expect(at2501.orbitT).toBe(1.0);
      expect(at2501.strokeWidthPx).toBe(0.35);
    });

    it('CHALLENGE-1D: camDist at 100.0 and extreme 1e6 (deep space / cosmic zoom)', () => {
      const at100 = computeEngineStroke({ x: 60.0, y: 60.0, z: 52.915 }); // hypot = 100
      expect(at100.camDist).toBeCloseTo(100.0, 1);
      expect(at100.orbitT).toBe(1.0);
      expect(at100.strokeWidthPx).toBe(0.35);

      const at1e6 = computeEngineStroke({ x: 1e6, y: 0, z: 0 });
      expect(at1e6.orbitT).toBe(1.0);
      expect(at1e6.strokeWidthPx).toBe(0.35);
      expect(Number.isFinite(at1e6.strokeWidthPx)).toBe(true);
    });

    it('CHALLENGE-1E: Monte Carlo stress (50,000 random camera positions) guarantees zero NaNs or Infs', () => {
      let seed = 123456789;
      function rnd() {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      }

      for (let i = 0; i < 50000; i++) {
        const x = (rnd() - 0.5) * 200.0;
        const y = (rnd() - 0.5) * 200.0;
        const z = (rnd() - 0.5) * 200.0;

        const res = computeEngineStroke({ x, y, z });
        expect(Number.isFinite(res.strokeWidthPx)).toBe(true);
        expect(Number.isNaN(res.strokeWidthPx)).toBe(false);
        expect(res.strokeWidthPx).toBeGreaterThanOrEqual(0.35);
        expect(res.strokeWidthPx).toBeLessThanOrEqual(0.75);

        const wgsl = computeWgslStroke(res.camDist, res.u_halfWidthPx);
        expect(Number.isFinite(wgsl.totalWidthPx)).toBe(true);
        expect(Number.isNaN(wgsl.totalWidthPx)).toBe(false);
        expect(wgsl.totalWidthPx).toBeGreaterThanOrEqual(0.35);
        expect(wgsl.totalWidthPx).toBeLessThanOrEqual(0.75);
      }
    });

    it('CHALLENGE-1F: verifies elevation dynamicExp coupling across camera distance extremes', () => {
      // In vector_ribbon.wgsl line 211 and crust_hydrosphere.wgsl line 553:
      // dynamicExp = mix(1.0, 1.8, orbitT) * (max(0.5, sim.u_peakExponent) / 1.4);
      function computeDynamicExp(camDist: number, peakExp: number): number {
        const orbitT = Math.min(Math.max((camDist - 8.0) / (25.0 - 8.0), 0.0), 1.0);
        return (1.0 + (1.8 - 1.0) * orbitT) * (Math.max(0.5, peakExp) / 1.4);
      }

      // At close zoom (camDist <= 8.0, peakExp = 1.4)
      const closeExp = computeDynamicExp(5.0, 1.4);
      expect(closeExp).toBeCloseTo(1.0, 4);

      // At planetary orbit (camDist >= 25.0, peakExp = 1.4)
      const orbitExp = computeDynamicExp(30.0, 1.4);
      expect(orbitExp).toBeCloseTo(1.8, 4);

      // Extreme peakExp = 0.0 (defensively clamped to 0.5)
      const clampedExp = computeDynamicExp(8.0, 0.0);
      expect(clampedExp).toBeCloseTo(0.5 / 1.4, 4);
    });
  });

  // ==========================================================================
  // Challenge Scenario 2: Sub-Texel Trough Centering in Flat Terrain
  // ==========================================================================
  describe('Challenge Scenario 2: Sub-Texel Trough Centering & Laplacian Singularities', () => {
    // Exact WGSL formulation from crust_hydrosphere.wgsl lines 827-834:
    function computeTroughCentering(hC: number, hR: number, hL: number, hU: number, hD: number): {
      d2x: number;
      d2y: number;
      gx: number;
      gy: number;
      deltaX: number;
      deltaY: number;
      laplacian: number;
      kValley: number;
      valleyGate: number;
    } {
      const d2x = hR + hL - 2.0 * hC;
      const d2y = hD + hU - 2.0 * hC;
      const gx = (hR - hL) * 0.5;
      const gy = (hD - hU) * 0.5;

      const deltaX = d2x > 1e-4 ? -Math.min(Math.max(gx / Math.max(d2x, 1e-4), -0.75), 0.75) : 0.0;
      const deltaY = d2y > 1e-4 ? -Math.min(Math.max(gy / Math.max(d2y, 1e-4), -0.75), 0.75) : 0.0;

      const laplacian = (hR + hL + hU + hD) - 4.0 * hC;
      const kValley = Math.min(Math.max(laplacian * 45.0, 0.0), 1.0);

      // smoothstep(0.06, 0.32, kValley)
      const t = Math.min(Math.max((kValley - 0.06) / (0.32 - 0.06), 0.0), 1.0);
      const valleyGate = t * t * (3.0 - 2.0 * t);

      return { d2x, d2y, gx, gy, deltaX, deltaY, laplacian, kValley, valleyGate };
    }

    it('CHALLENGE-2A: perfectly flat plain (zero gradient, zero curvature)', () => {
      const res = computeTroughCentering(0.4, 0.4, 0.4, 0.4, 0.4);
      expect(res.d2x).toBe(0.0);
      expect(res.d2y).toBe(0.0);
      expect(res.gx).toBe(0.0);
      expect(res.gy).toBe(0.0);
      expect(res.deltaX).toBe(0.0); // Zero division guard holds
      expect(res.deltaY).toBe(0.0);
      expect(res.laplacian).toBe(0.0);
      expect(res.kValley).toBe(0.0);
      expect(res.valleyGate).toBe(0.0); // Exactly zero waterway glaze!
    });

    it('CHALLENGE-2B: planar inclined ramp (steep gradient, zero second derivative)', () => {
      // Linear slope: h(x, y) = 0.5 + 0.15*x - 0.10*y
      const res = computeTroughCentering(0.5, 0.65, 0.35, 0.40, 0.60);
      expect(res.d2x).toBeCloseTo(0.0, 6);
      expect(res.d2y).toBeCloseTo(0.0, 6);
      expect(res.gx).toBeCloseTo(0.15, 6);
      expect(res.gy).toBeCloseTo(0.10, 6);
      expect(res.deltaX).toBe(0.0); // No division by zero: guard d2x > 1e-4 prevents deltaX explosion
      expect(res.deltaY).toBe(0.0);
      expect(res.laplacian).toBeCloseTo(0.0, 6);
      expect(res.kValley).toBe(0.0);
      expect(res.valleyGate).toBe(0.0); // Planar slopes NEVER trigger river valleys
    });

    it('CHALLENGE-2C: convex mountain ridge (negative curvature: d2x < 0, d2y < 0)', () => {
      // Sharp mountain ridge: peak at center hC = 0.9, sides at 0.3
      const res = computeTroughCentering(0.9, 0.3, 0.3, 0.3, 0.3);
      expect(res.d2x).toBeLessThan(0.0);
      expect(res.d2y).toBeLessThan(0.0);
      expect(res.deltaX).toBe(0.0); // Ridge negative curvature selected to 0.0
      expect(res.deltaY).toBe(0.0);
      expect(res.laplacian).toBeLessThan(0.0);
      expect(res.kValley).toBe(0.0);
      expect(res.valleyGate).toBe(0.0); // Mountain ridges have zero valley drainage
    });

    it('CHALLENGE-2D: infinitesimal curvature just below guard threshold (d2x = 9.99e-5)', () => {
      const hC = 0.5;
      const hL = 0.5;
      const hR = 0.5 + 9.99e-5; // d2x = 9.99e-5 < 1e-4
      const res = computeTroughCentering(hC, hR, hL, 0.5, 0.5);
      expect(res.d2x).toBeLessThan(1e-4);
      expect(res.deltaX).toBe(0.0); // Guard safely trips: selects 0.0
      expect(res.kValley).toBeCloseTo(9.99e-5 * 45.0, 6);
      expect(res.valleyGate).toBe(0.0); // Below 0.06 gate threshold
    });

    it('CHALLENGE-2E: infinitesimal curvature just above guard threshold (d2x = 1.001e-4) with large gradient', () => {
      const hC = 0.5;
      const hL = 0.1;
      const hR = 0.9001001; // d2x = 0.9001001 + 0.1 - 1.0 = 1.001e-4, gx = (0.9001001 - 0.1)*0.5 = 0.40005
      const res = computeTroughCentering(hC, hR, hL, 0.5, 0.5);
      expect(res.d2x).toBeGreaterThan(1e-4);
      // gx / d2x = 0.40005 / 1.001e-4 = 3996.5 -> strictly clamped to -0.75
      expect(res.deltaX).toBe(-0.75); // Clamping prevents numerical explosion!
      expect(Number.isFinite(res.deltaX)).toBe(true);
    });

    it('CHALLENGE-2F: 100,000 Monte Carlo stress iterations across arbitrary elevations', () => {
      let seed = 42;
      function rnd() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      for (let i = 0; i < 100000; i++) {
        const hC = rnd() * 2.0 - 0.5; // [-0.5, 1.5]
        const hR = rnd() * 2.0 - 0.5;
        const hL = rnd() * 2.0 - 0.5;
        const hU = rnd() * 2.0 - 0.5;
        const hD = rnd() * 2.0 - 0.5;

        const res = computeTroughCentering(hC, hR, hL, hU, hD);
        expect(Number.isFinite(res.deltaX)).toBe(true);
        expect(Number.isFinite(res.deltaY)).toBe(true);
        expect(Number.isNaN(res.deltaX)).toBe(false);
        expect(Number.isNaN(res.deltaY)).toBe(false);
        expect(res.deltaX).toBeGreaterThanOrEqual(-0.75);
        expect(res.deltaX).toBeLessThanOrEqual(0.75);
        expect(res.deltaY).toBeGreaterThanOrEqual(-0.75);
        expect(res.deltaY).toBeLessThanOrEqual(0.75);
        expect(res.valleyGate).toBeGreaterThanOrEqual(0.0);
        expect(res.valleyGate).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // ==========================================================================
  // Challenge Scenario 3: Antimeridian & Polar Boundary Taps
  // ==========================================================================
  describe('Challenge Scenario 3: Antimeridian & Polar Boundary Taps Safety', () => {
    // Exact WGSL formulas from crust_hydrosphere.wgsl lines 595-598:
    function computeUvTaps(u: number, v: number, tsX: number, tsY: number): {
      uvR: { x: number; y: number };
      uvL: { x: number; y: number };
      uvU: { x: number; y: number };
      uvD: { x: number; y: number };
    } {
      // WGSL fract(x) = x - floor(x)
      const fract = (x: number) => x - Math.floor(x);
      const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

      const uvR = { x: fract(u + tsX), y: clamp(v, 0.0, 1.0) };
      const uvL = { x: fract(u - tsX + 1.0), y: clamp(v, 0.0, 1.0) };
      const uvU = { x: u, y: clamp(v + tsY, 0.0, 1.0) };
      const uvD = { x: u, y: clamp(v - tsY, 0.0, 1.0) };

      return { uvR, uvL, uvU, uvD };
    }

    const tsX = 1.0 / 2048.0;
    const tsY = 1.0 / 1024.0;

    it('CHALLENGE-3A: Antimeridian boundary tap at u = 0.0 (Prime/Date boundary)', () => {
      const taps = computeUvTaps(0.0, 0.5, tsX, tsY);
      expect(taps.uvR.x).toBeCloseTo(tsX, 6);
      expect(taps.uvL.x).toBeCloseTo(1.0 - tsX, 6); // Wraps seamlessly to eastern edge
      expect(taps.uvR.x).toBeGreaterThan(0.0);
      expect(taps.uvL.x).toBeLessThan(1.0);
    });

    it('CHALLENGE-3B: Antimeridian boundary tap at u = 1.0', () => {
      const taps = computeUvTaps(1.0, 0.5, tsX, tsY);
      expect(taps.uvR.x).toBeCloseTo(tsX, 6); // Wraps seamlessly to western edge
      expect(taps.uvL.x).toBeCloseTo(1.0 - tsX, 6);
      expect(taps.uvR.x).toBeGreaterThan(0.0);
      expect(taps.uvL.x).toBeLessThan(1.0);
    });

    it('CHALLENGE-3C: North Pole boundary tap at v = 0.0', () => {
      const taps = computeUvTaps(0.5, 0.0, tsX, tsY);
      expect(taps.uvU.y).toBeCloseTo(tsY, 6);
      expect(taps.uvD.y).toBe(0.0); // Clamped cleanly to North Pole boundary
      expect(taps.uvR.y).toBe(0.0);
      expect(taps.uvL.y).toBe(0.0);
    });

    it('CHALLENGE-3D: South Pole boundary tap at v = 1.0', () => {
      const taps = computeUvTaps(0.5, 1.0, tsX, tsY);
      expect(taps.uvU.y).toBe(1.0); // Clamped cleanly to South Pole boundary
      expect(taps.uvD.y).toBeCloseTo(1.0 - tsY, 6);
      expect(taps.uvR.y).toBe(1.0);
      expect(taps.uvL.y).toBe(1.0);
    });

    it('CHALLENGE-3E: Sampler address mode verification in WebGPUEngine.ts', () => {
      // Sampler configuration in WebGPUEngine.ts lines 326-333:
      expect(engineSrc).toContain("addressModeU: 'repeat'");
      expect(engineSrc).toContain("addressModeV: 'clamp-to-edge'");
    });

    it('CHALLENGE-3F: Polar displacement attenuation in vector_ribbon.wgsl', () => {
      function computePoleAtten(v: number): number {
        const poleDist = Math.abs(v - 0.5) * 2.0;
        const t = Math.min(Math.max((poleDist - 0.85) / (0.98 - 0.85), 0.0), 1.0);
        return 1.0 - (t * t * (3.0 - 2.0 * t));
      }

      expect(computePoleAtten(0.5)).toBe(1.0); // Equator: 100% elevation
      expect(computePoleAtten(0.0)).toBe(0.0); // North Pole: 0% displacement (zero spikes)
      expect(computePoleAtten(1.0)).toBe(0.0); // South Pole: 0% displacement (zero spikes)
    });
  });

  // ==========================================================================
  // Challenge Scenario 4: Silhouette Edge Facing & Limb Attenuation
  // ==========================================================================
  describe('Challenge Scenario 4: Silhouette Edge Facing & Limb Attenuation', () => {
    // Exact WGSL formulas from vector_ribbon.wgsl lines 397-406 & 437:
    function computeFacingShading(facing: number, sphereFactor: number = 1.0, nominalAlpha: number = 0.80): {
      horizonAtten: number;
      facingFade: number;
      discarded: boolean;
      finalAlpha: number;
      quantizedAlpha8bit: number;
    } {
      const smoothstep = (e0: number, e1: number, x: number) => {
        const t = Math.min(Math.max((x - e0) / (e1 - e0), 0.0), 1.0);
        return t * t * (3.0 - 2.0 * t);
      };

      const horizonAtten = smoothstep(0.0, 0.10, facing);
      const facingFade = (1.0 - sphereFactor) * 1.0 + sphereFactor * horizonAtten;

      // Discard condition: (coverage <= 0.0 || (sphereFactor > 0.0 && in.facing <= 0.0))
      const discarded = sphereFactor > 0.0 && facing <= 0.0;
      const finalAlpha = discarded ? 0.0 : nominalAlpha * 1.0 * 1.0 * facingFade;
      const quantizedAlpha8bit = Math.round(finalAlpha * 255);

      return { horizonAtten, facingFade, discarded, finalAlpha, quantizedAlpha8bit };
    }

    // Exact limbTaper from vs_main line 318:
    function computeLimbTaper(facingEnd: number, sphereFactor: number = 1.0): number {
      const smoothstep = (e0: number, e1: number, x: number) => {
        const t = Math.min(Math.max((x - e0) / (e1 - e0), 0.0), 1.0);
        return t * t * (3.0 - 2.0 * t);
      };
      if (sphereFactor > 0.5) {
        return smoothstep(0.0, 0.08, Math.max(0.0, facingEnd));
      }
      return 1.0;
    }

    it('CHALLENGE-4A: facing = -0.001 (just behind horizon silhouette)', () => {
      const res = computeFacingShading(-0.001);
      expect(res.discarded).toBe(true); // HARD DISCARD
      expect(res.finalAlpha).toBe(0.0);
      expect(res.quantizedAlpha8bit).toBe(0);

      const taper = computeLimbTaper(-0.001);
      expect(taper).toBe(0.0); // Quad extrusion width scaled to 0
    });

    it('CHALLENGE-4B: facing = 0.0 (exact tangent along horizon silhouette)', () => {
      const res = computeFacingShading(0.0);
      expect(res.discarded).toBe(true); // HARD DISCARD (facing <= 0.0)
      expect(res.finalAlpha).toBe(0.0);
      expect(res.quantizedAlpha8bit).toBe(0);

      const taper = computeLimbTaper(0.0);
      expect(taper).toBe(0.0); // Quad extrusion width scaled to 0
    });

    it('CHALLENGE-4C: facing = +0.001 (infinitesimally facing camera, grazing silhouette)', () => {
      const res = computeFacingShading(0.001);
      expect(res.discarded).toBe(false); // Fragment survives discard
      expect(res.horizonAtten).toBeCloseTo(0.000298, 6);
      expect(res.finalAlpha).toBeCloseTo(0.000238, 6);
      expect(res.quantizedAlpha8bit).toBe(0); // 8-bit frame buffer rounds to EXACTLY ZERO opacity!

      const taper = computeLimbTaper(0.001);
      expect(taper).toBeCloseTo(0.000465, 6); // Quad width shrunk to 0.04% of normal
    });

    it('CHALLENGE-4D: facing = +0.05 (halfway into horizon falloff ramp)', () => {
      const res = computeFacingShading(0.05);
      expect(res.discarded).toBe(false);
      // smoothstep(0, 0.1, 0.05) = 0.5
      expect(res.horizonAtten).toBeCloseTo(0.5, 4);
      expect(res.finalAlpha).toBeCloseTo(0.40, 4);

      const taper = computeLimbTaper(0.05);
      // smoothstep(0, 0.08, 0.05) = 3*(5/8)^2 - 2*(5/8)^3 = 0.68359
      expect(taper).toBeCloseTo(0.6836, 3);
    });

    it('CHALLENGE-4E: facing = +0.10 (fully inside visible hemisphere)', () => {
      const res = computeFacingShading(0.10);
      expect(res.discarded).toBe(false);
      expect(res.horizonAtten).toBe(1.0);
      expect(res.finalAlpha).toBe(0.80);

      const taper = computeLimbTaper(0.10);
      expect(taper).toBe(1.0); // Full unattenuated quad width
    });

    it('CHALLENGE-4F: early-out backface culling in vs_main', () => {
      expect(ribbonSrc).toContain('if (sphereFactor > 0.5 && facingA < 0.0 && facingB < 0.0)');
      expect(ribbonSrc).toContain('out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0);');
    });

    it('CHALLENGE-4G: Invariant #3 verification - fwidth precedes discard in fs_main', () => {
      const fsMainIdx = ribbonSrc.indexOf('fn fs_main(');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainBody = ribbonSrc.slice(fsMainIdx);

      const fwidthIdx = fsMainBody.indexOf('fwidth(dNorm)');
      const discardIdx = fsMainBody.indexOf('discard;');

      expect(fwidthIdx).toBeGreaterThan(0);
      expect(discardIdx).toBeGreaterThan(0);
      expect(fwidthIdx).toBeLessThan(discardIdx); // Unconditional uniform control flow!
    });
  });

  // ==========================================================================
  // Challenge Scenario 5: Standoff Elimination & Depth Bias Integration
  // ==========================================================================
  describe('Challenge Scenario 5: Standoff Elimination & Depth Bias Alignment', () => {
    it('CHALLENGE-5A: verifies normal standoff is eliminated in vector_ribbon.wgsl', () => {
      expect(ribbonSrc).toContain('let standoff = 0.0;');
      expect(ribbonSrc).not.toContain('let standoff = 0.025');
    });

    it('CHALLENGE-5B: verifies depth bias is applied in WebGPUEngine.ts to prevent z-fighting without standoff', () => {
      expect(engineSrc).toContain('depthBias: -120');
      expect(engineSrc).toContain('depthBiasSlopeScale: -1.0');
      expect(engineSrc).toContain("depthCompare: 'less-equal'");
      expect(engineSrc).toContain('depthWriteEnabled: false');
    });

    it('CHALLENGE-5C: verifies SimUniforms 240-byte alignment in vector_ribbon.wgsl', () => {
      expect(ribbonSrc).toContain('u_peakExponent: f32');
      expect(ribbonSrc).toContain('u_seaLevel: f32');
      expect(ribbonSrc).toContain('u_pad2: f32');
    });
  });
});
