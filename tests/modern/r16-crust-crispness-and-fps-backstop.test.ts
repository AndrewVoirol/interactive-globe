// ============================================================================
// File: tests/modern/r16-crust-crispness-and-fps-backstop.test.ts
// Test Tier: Modern / Invariant Backstops (Remediation & Regression Prevention)
// Description: Strictly enforces the integrity of WebGPU draw calls, 8K DEM crispness,
//              Leopold-Maddock river hairlines, and mipmap channel fidelity.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('R16: Crust Crispness & High-FPS Performance Backstop Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
  const crustShaderPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const windShaderPath = path.join(projectRoot, 'src/webgpu/shaders/wind_ribbon_render.wgsl');

  const engineSrc = fs.readFileSync(enginePath, 'utf8');
  const crustSrc = fs.readFileSync(crustShaderPath, 'utf8');
  const windSrc = fs.readFileSync(windShaderPath, 'utf8');

  // --------------------------------------------------------------------------
  // Suite 1: Wind Ribbon Draw Instance & Memory Alignment Invariants
  // --------------------------------------------------------------------------
  describe('1. Wind Ribbon Draw Instance & Memory Layout Invariants', () => {
    it('R16-FPS-01: verifies halfInstances uses exactly * 3 segment multiplier in renderSurfaceWindRibbons', () => {
      // Must NOT use * 15 which caused 983K quad instances and GPU rasterizer saturation
      expect(engineSrc).toMatch(/renderSurfaceWindRibbons[^{]*\{[\s\S]*?const\s+halfInstances\s*=\s*Math\.floor\(this\.windParticleCount\s*\/\s*2\)\s*\*\s*3\s*;/);
      expect(engineSrc).not.toMatch(/renderSurfaceWindRibbons[^{]*\{[\s\S]*?const\s+halfInstances\s*=\s*Math\.floor\(this\.windParticleCount\s*\/\s*2\)\s*\*\s*15\s*;/);
    });

    it('R16-FPS-02: verifies halfInstances uses exactly * 3 segment multiplier in renderJetStreamRibbons', () => {
      expect(engineSrc).toMatch(/renderJetStreamRibbons[^{]*\{[\s\S]*?const\s+halfInstances\s*=\s*Math\.floor\(this\.windParticleCount\s*\/\s*2\)\s*\*\s*3\s*;/);
      expect(engineSrc).not.toMatch(/renderJetStreamRibbons[^{]*\{[\s\S]*?const\s+halfInstances\s*=\s*Math\.floor\(this\.windParticleCount\s*\/\s*2\)\s*\*\s*15\s*;/);
    });

    it('R16-FPS-03: verifies windBufferSize allocates exactly 96 bytes per particle (24 floats)', () => {
      // WindParticle WGSL struct is 6 vec4<f32> = 96 bytes
      expect(engineSrc).toContain('const windBufferSize = this.windParticleCount * 96;');
      expect(engineSrc).toContain('const initialWindData = new Float32Array(this.windParticleCount * 24);');
      expect(engineSrc).not.toContain('this.windParticleCount * 288');
      expect(engineSrc).not.toContain('this.windParticleCount * 72');
    });

    it('R16-FPS-04: verifies wind_ribbon_render.wgsl instanceIdx modulo matches the 3-segment pipeline', () => {
      expect(windSrc).toContain('let particleIdx = in.instanceIdx / 3u;');
      expect(windSrc).toContain('let segIdx = in.instanceIdx % 3u;');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: 8K DEM Crispness & Normal Slope Derivative Invariants
  // --------------------------------------------------------------------------
  describe('2. DEM Sampling & Normal Slope Scale Invariants', () => {
    it('R16-DEM-01: verifies mipLOD is clamped to <= 0.5 to guarantee native 8K DEM level 0 sampling', () => {
      // Unclamped mipLOD reached 3.3+ at 8192x4096, sampling low-res 1024x512 mips
      expect(crustSrc).toMatch(/let\s+mipLOD\s*=\s*clamp\(.+?,\s*0\.0,\s*0\.5\);/);
      expect(crustSrc).toContain('textureSampleLevel(u_demTexture, u_demSampler, input.uv, mipLOD)');
    });

    it('R16-DEM-02: verifies dispScale multiplier is calibrated to >= 40.0 for crisp Swiss relief contrast', () => {
      // A factor of * 16.0 suppressed normal perturbation to near-zero; requires >= 40.0
      const match = crustSrc.match(/let\s+dispScale\s*=\s*sim\.u_displacementScale\s*\*\s*([0-9.]+)\s*\+\s*1\.0;/);
      expect(match).not.toBeNull();
      const scaleFactor = parseFloat(match![1]);
      expect(scaleFactor).toBeGreaterThanOrEqual(40.0);
      expect(scaleFactor).toBeLessThanOrEqual(75.0);
    });

    it('R16-DEM-03: verifies tsGlobal uses dynamic DEM textureDimensions and is not hardcoded', () => {
      expect(crustSrc).toContain('let demDims = textureDimensions(u_demTexture);');
      expect(crustSrc).toContain('let texSize = vec2<f32>(f32(demDims.x), f32(demDims.y));');
      expect(crustSrc).toContain('let tsGlobal = (vec2<f32>(1.0, 1.0) / max(texSize, vec2<f32>(1.0, 1.0))) * max(1.0, mipStep);');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Geomorphic Hydrology & Leopold-Maddock Hairline Invariants
  // --------------------------------------------------------------------------
  describe('3. Geomorphic Hydrology & Leopold-Maddock Invariants', () => {
    it('R16-HYDRO-01: verifies baseline river channel widths conform to Leopold-Maddock limits [0.40px, 1.98px]', () => {
      expect(crustSrc).toContain('var riverWidthPx = mix(0.40, 1.98, descentAccum);');
      expect(crustSrc).toContain('let pluvialFactor = 1.0 + sim.u_pluvial_gamma * sqrt(clamp(precipRate, 0.0, 50.0));');
      expect(crustSrc).toContain('riverWidthPx = riverWidthPx * pluvialFactor;');
    });

    it('R16-HYDRO-02: verifies river channel sub-texel parabolic trough centering uses ts', () => {
      expect(crustSrc).toContain('let uvGrid = input.uv / ts;');
      expect(crustSrc).toContain('var metricDistVec = (fCell - vec2<f32>(deltaX, deltaY)) * ts;');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: Channel-Aware Mipmap Downsampling Invariants
  // --------------------------------------------------------------------------
  describe('4. Channel-Aware Mipmap Downsampling Invariants', () => {
    it('R16-MIP-01: verifies generateMipsRGBA16 avoids 60% maxVal bias and preserves linear elevation', () => {
      expect(engineSrc).not.toContain('Math.round(0.4 * mean + 0.6 * maxVal)');
      expect(engineSrc).toMatch(/if\s*\(c\s*===\s*2\)\s*\{[\s\S]*?nextData\[dstIdx\s*\+\s*c\]\s*=\s*mean\s*>=\s*32768\s*\?\s*65535\s*:\s*0\s*;/);
      expect(engineSrc).toMatch(/nextData\[dstIdx\s*\+\s*c\]\s*=\s*Math\.min\(65535,\s*Math\.round\(mean\)\);/);
    });

    it('R16-MIP-02: verifies generateMipsRGBA8 avoids 60% maxVal bias and preserves 8-bit land mask', () => {
      expect(engineSrc).toMatch(/if\s*\(c\s*===\s*2\)\s*\{[\s\S]*?nextData\[dstIdx\s*\+\s*c\]\s*=\s*mean\s*>=\s*128\s*\?\s*255\s*:\s*0\s*;/);
      expect(engineSrc).toMatch(/nextData\[dstIdx\s*\+\s*c\]\s*=\s*Math\.min\(255,\s*Math\.round\(mean\)\);/);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 5: Geodesic Advection Math Optimization Invariants
  // --------------------------------------------------------------------------
  describe('5. Geodesic Advection Fast-Path Optimization', () => {
    it('R16-OPT-01: verifies mapSphericalGeodesicUV has early-exit on zero displacement/wind', () => {
      expect(crustSrc).toMatch(/if\s*\(sigma_sq\s*<\s*1e-12\)\s*\{\s*return\s+arrivalUV;\s*\}/);
    });

    it('R16-OPT-02: verifies sampleAdvectedPrecipitationField remains unconditionally called at entry', () => {
      // Must satisfy Invariant #3 in AGENTS.md
      expect(crustSrc).toContain('let precipAdvectedField = sampleAdvectedPrecipitationField(input.uv, windForAdvection.xy, scrubTau);');
    });
  });
});
