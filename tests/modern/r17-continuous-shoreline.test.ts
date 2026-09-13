// ============================================================================
// File: tests/modern/r17-continuous-shoreline.test.ts
// Test Tier: Modern / Stage 3 Continuous Shoreline Anti-Aliasing & Isoline Blending
// Description: Strictly asserts elimination of 1-pixel hard stair-step cutoff in
//              Option A relief shading, verifies zero occurrences of if (isLand > 0.45),
//              and validates sub-texel C1 Hermite continuity (|dL/dx| <= 0.12).
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('R17 Stage 3: Continuous Shoreline Anti-Aliasing & Isoline Blending', () => {
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

  function mix(a: number, b: number, t: number): number {
    return a * (1.0 - t) + b * t;
  }

  describe('1. Static Code Analysis & Branch Elimination Invariants', () => {
    it('R17-SHORE-01: verifies zero occurrences of if (isLand > 0.45) in crust_hydrosphere.wgsl', () => {
      // Must NOT contain hard binary branching on shoreline threshold
      expect(shaderSrc).not.toContain('if (isLand > 0.45)');
    });

    it('R17-SHORE-02: verifies Option A uses continuous Hermite shoreline coverage', () => {
      expect(shaderSrc).toContain('let shoreCoverage = smoothstep(0.35, 0.65, isLand);');
      expect(shaderSrc).toContain('finalCrust = mix(cBathyComposite, finalLand, shoreCoverage);');
    });

    it('R17-SHORE-03: verifies in-shader waterways use smoothstep(0.40, 0.60, isLand)', () => {
      expect(shaderSrc).toContain('let shoreWaterwayGate = smoothstep(0.40, 0.60, isLand);');
      expect(shaderSrc).toContain('let waterwayGlaze = channelCoverage * valleyGate * cliffDampen * shoreWaterwayGate;');
    });

    it('R17-SHORE-04: verifies land contours and ocean isobaths fade continuously across shoreline', () => {
      expect(shaderSrc).toContain('let shoreContourFade = smoothstep(0.35, 0.65, isLand);');
      expect(shaderSrc).toContain('let shoreIsobathFade = 1.0 - smoothstep(0.35, 0.65, isLand);');
    });
  });

  describe('2. Sub-Texel Transect Continuity & C1 Derivative Bounds', () => {
    it('R17-SHORE-05: verifies maximum sub-texel luminance derivative |dL/dx| <= 0.12 across 20-point coastal transect', () => {
      // Evaluate luminance across a 20-point transect from open ocean (isLand = 0.0)
      // to inland relief (isLand = 1.0), crossing the [0.35, 0.65] transition zone.
      // Option A Cream Rag values:
      // Land luminance: ~0.82 (Cream Cotton Rag ground with gentle relief)
      // Shallow bathymetry luminance: ~0.65 (inner shelf celadon wash)
      const lumaLand = 0.82;
      const lumaBathy = 0.65;

      const N = 20;
      const lumaSamples: number[] = [];

      for (let i = 0; i <= N; i++) {
        const isLand = i / N;
        const shoreCoverage = smoothstep(0.35, 0.65, isLand);
        const luma = mix(lumaBathy, lumaLand, shoreCoverage);
        lumaSamples.push(luma);
      }

      // Discrete finite differences: dL/dx per step
      let maxAbsDiff = 0.0;
      for (let i = 1; i < lumaSamples.length; i++) {
        const dL = Math.abs(lumaSamples[i] - lumaSamples[i - 1]);
        if (dL > maxAbsDiff) maxAbsDiff = dL;
      }

      // In old hard if (isLand > 0.45), step from isLand=0.40 to 0.45 had delta = |0.82 - 0.65| = 0.17 (step discontinuity).
      // Under smoothstep, max derivative is smooth and bounded by <= 0.12 per sub-texel sample.
      expect(maxAbsDiff).toBeLessThanOrEqual(0.12);
    });

    it('R17-SHORE-06: verifies Hermite smoothstep produces zero 1st derivative discontinuities at boundaries (x=0.35 and x=0.65)', () => {
      // In smoothstep, derivative dS/dx = 6 * t * (1 - t) / (edge1 - edge0)
      // At t = 0 (x = 0.35): dS/dx = 0 (tangent-continuous with ocean)
      // At t = 1 (x = 0.65): dS/dx = 0 (tangent-continuous with land)
      const eps = 1e-4;
      const dS_left = (smoothstep(0.35, 0.65, 0.35 + eps) - smoothstep(0.35, 0.65, 0.35)) / eps;
      const dS_right = (smoothstep(0.35, 0.65, 0.65) - smoothstep(0.35, 0.65, 0.65 - eps)) / eps;

      expect(dS_left).toBeLessThan(0.01);
      expect(dS_right).toBeLessThan(0.01);
    });
  });
});
