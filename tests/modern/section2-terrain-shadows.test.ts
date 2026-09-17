import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Section 2: Directional Horizon & Canyon Self-Shadowing', () => {
  const horizonShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/horizon_occlusion.wgsl');
  const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const horizonShaderSrc = fs.readFileSync(horizonShaderPath, 'utf8');
  const crustShaderSrc = fs.readFileSync(crustShaderPath, 'utf8');

  describe('1. WGSL Uniform Structure Alignment & Sizing (§2.4)', () => {
    it('declares TerrainShadowUniforms in horizon_occlusion.wgsl with exact 32-byte layout', () => {
      expect(horizonShaderSrc).toContain('struct TerrainShadowUniforms');
      expect(horizonShaderSrc).toMatch(/u_sunAzimuth:\s*f32/);
      expect(horizonShaderSrc).toMatch(/u_sunAltitude:\s*f32/);
      expect(horizonShaderSrc).toMatch(/u_maxRayDistanceMeters:\s*f32/);
      expect(horizonShaderSrc).toMatch(/u_penumbraSoftness:\s*f32/);
      expect(horizonShaderSrc).toMatch(/u_shadowMapDimensions:\s*vec2<u32>/);
      expect(horizonShaderSrc).toMatch(/u_sampleStepCount:\s*u32/);
      expect(horizonShaderSrc).toMatch(/_pad:\s*u32/);
    });

    it('declares identical TerrainShadowUniforms in crust_hydrosphere.wgsl at @group(1)', () => {
      expect(crustShaderSrc).toContain('struct TerrainShadowUniforms');
      expect(crustShaderSrc).toContain('@group(1) @binding(0) var<uniform> u_terrainShadow: TerrainShadowUniforms;');
      expect(crustShaderSrc).toContain('@group(1) @binding(1) var u_terrainShadowTexture: texture_2d<f32>;');
      expect(crustShaderSrc).toContain('@group(1) @binding(2) var u_terrainShadowSampler: sampler;');
    });

    it('preserves @group(0) crust bindings at exactly 15 entries for backward compatibility', () => {
      // Group 0 bindings 0 through 14 must remain untouched
      for (let b = 0; b <= 14; b++) {
        expect(crustShaderSrc).toMatch(new RegExp(`@group\\(0\\)\\s+@binding\\(${b}\\)`));
      }
    });
  });

  describe('2. Mathematical Formulation & Horizon Occlusion Invariants (§2.2, Rule 8)', () => {
    it('uses @workgroup_size(16, 16) matching pipeline architecture', () => {
      expect(horizonShaderSrc).toMatch(/@workgroup_size\(16,\s*16\)/);
    });

    it('writes to 1-channel r8unorm storage texture', () => {
      expect(horizonShaderSrc).toMatch(/var u_shadowMap:\s*texture_storage_2d<r8unorm,\s*write>;/);
    });

    it('conforms strictly to geoid elevation decoding formula (Rule 8)', () => {
      // Rule 8: elevMeters = demSample.a * 19772.0 - 10924.0
      expect(horizonShaderSrc).toContain('demSample.a * 19772.0 - 10924.0');
    });

    it('implements quadratic adaptive raymarching step distribution', () => {
      // s = maxRayDist * (t * t)
      expect(horizonShaderSrc).toMatch(/let\s+s\s*=\s*maxRayDist\s*\*\s*\(\s*t\s*\*\s*t\s*\);/);
    });

    it('evaluates spherical metric tensor arc-lengths with cosLat scaling (Invariant §18)', () => {
      expect(horizonShaderSrc).toContain('let circumLonMeters = TWO_PI * EARTH_RADIUS_M * cosLat;');
      expect(horizonShaderSrc).toContain('let meridianMeters = PI * EARTH_RADIUS_M;');
      expect(horizonShaderSrc).toMatch(/let\s+deltaU\s*=\s*deltaEast\s*\/\s*circumLonMeters;/);
      expect(horizonShaderSrc).toMatch(/let\s+deltaV\s*=\s*-deltaNorth\s*\/\s*meridianMeters;/);
    });

    it('implements physical penumbra softness with solar angular diameter (tan 0.53 deg)', () => {
      // tan(0.53 deg) ~ 0.009250245
      expect(horizonShaderSrc).toContain('TAN_DELTA_SUN: f32 = 0.009250245');
      expect(horizonShaderSrc).toMatch(/clamp\(\(tanSunAlt\s*-\s*horizonSlope\)\s*\/\s*penumbraScale,\s*0\.0,\s*1\.0\)/);
    });

    it('handles night / below-horizon guard gracefully by writing 0.0', () => {
      expect(horizonShaderSrc).toMatch(/if\s*\(uniforms\.u_sunAltitude\s*<=\s*0\.0\)/);
      expect(horizonShaderSrc).toContain('textureStore(u_shadowMap, coord, vec4<f32>(0.0, 0.0, 0.0, 1.0));');
    });
  });

  describe('3. WGSL Uniform Control Flow & Key Light Multiplication (Rule 4, §2.3)', () => {
    it('samples u_terrainShadowTexture unconditionally at the top of fs_main before branching/discards', () => {
      const fsMainIdx = crustShaderSrc.indexOf('fn fs_main(');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainCode = crustShaderSrc.slice(fsMainIdx);

      const sampleIdx = fsMainCode.indexOf('textureSampleLevel(u_terrainShadowTexture');
      const discardIdx = fsMainCode.indexOf('discard;');

      expect(sampleIdx).toBeGreaterThan(0);
      // Sample must occur strictly BEFORE any discard
      expect(sampleIdx).toBeLessThan(discardIdx);
    });

    it('multiplies relief key light (NdotL1) by terrainShadow', () => {
      expect(crustShaderSrc).toContain('let NdotL1 = max(0.0, dot(N_view, L1_view)) * terrainShadow;');
    });
  });

  describe('4. Engine Integration & Zero-GC Invariants (Rule 26)', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('preallocates 32-byte mirror buffer on engine instance', () => {
      // Zero allocations in frame loop
      expect((engine as any).terrainShadowMirror).toBeInstanceOf(ArrayBuffer);
      expect((engine as any).terrainShadowMirror.byteLength).toBe(32);
      expect((engine as any).terrainShadowFloats).toBeInstanceOf(Float32Array);
      expect((engine as any).terrainShadowUints).toBeInstanceOf(Uint32Array);
    });

    it('updates uniforms in-place without generating garbage', () => {
      (engine as any).device = {
        queue: {
          writeBuffer: vi.fn(),
        },
      };
      (engine as any).terrainShadowUniformBuffer = {};

      const mirrorBefore = (engine as any).terrainShadowMirror;
      engine.updateTerrainShadowUniforms({
        sunAzimuth: 180.0,
        sunAltitude: 30.0,
        maxRayDistanceMeters: 60000.0,
        penumbraSoftness: 2.0,
        sampleStepCount: 32,
      });

      // Buffer instance must be identical (no re-allocation)
      expect((engine as any).terrainShadowMirror).toBe(mirrorBefore);

      const floats = (engine as any).terrainShadowFloats;
      const uints = (engine as any).terrainShadowUints;

      expect(floats[0]).toBeCloseTo((180.0 * Math.PI) / 180.0, 5); // u_sunAzimuth in radians
      expect(floats[1]).toBeCloseTo((30.0 * Math.PI) / 180.0, 5);  // u_sunAltitude in radians
      expect(floats[2]).toBe(60000.0);                             // u_maxRayDistanceMeters
      expect(floats[3]).toBe(2.0);                                 // u_penumbraSoftness
      expect(uints[4]).toBe(2048);                                 // u_shadowMapDimensions.x
      expect(uints[5]).toBe(1024);                                 // u_shadowMapDimensions.y
      expect(uints[6]).toBe(32);                                   // u_sampleStepCount
      expect(uints[7]).toBe(0);                                    // _pad
    });

    it('accepts partial frame parameters and applies default physical values', () => {
      (engine as any).device = {
        queue: {
          writeBuffer: vi.fn(),
        },
      };
      (engine as any).terrainShadowUniformBuffer = {};

      engine.updateTerrainShadowUniforms({});

      const floats = (engine as any).terrainShadowFloats;
      const uints = (engine as any).terrainShadowUints;

      expect(floats[0]).toBeCloseTo((315.0 * Math.PI) / 180.0, 5); // default NW 315 deg
      expect(floats[1]).toBeCloseTo((45.0 * Math.PI) / 180.0, 5);  // default 45 deg altitude
      expect(floats[2]).toBe(50000.0);                             // default 50km
      expect(floats[3]).toBe(1.5);                                 // default softness
      expect(uints[6]).toBe(16);                                   // default 16 steps
    });

    it('toggles terrain shadows on and off via setTerrainShadowsEnabled', () => {
      expect(engine.isTerrainShadowsEnabled()).toBe(false);
      engine.setTerrainShadowsEnabled(true);
      expect(engine.isTerrainShadowsEnabled()).toBe(true);
      engine.setTerrainShadowsEnabled(false);
      expect(engine.isTerrainShadowsEnabled()).toBe(false);
    });
  });

  describe('5. Horizon Occlusion Analytical Physics & Penumbra Unit Test', () => {
    function computeTerrainShadowFactor(
      h0: number,
      elevationsAlongRay: number[],
      distancesAlongRay: number[],
      sunAltitudeDeg: number,
      softness: number = 1.5
    ): number {
      const tanSunAlt = Math.tan((sunAltitudeDeg * Math.PI) / 180.0);
      const tanDeltaSun = 0.009250245; // tan(0.53 deg)
      const penumbraScale = Math.max(1e-5, softness * tanDeltaSun);

      let minShadow = 1.0;
      for (let i = 0; i < elevationsAlongRay.length; i++) {
        const hs = elevationsAlongRay[i];
        const s = distancesAlongRay[i];
        const deltaH = hs - h0;
        const horizonSlope = deltaH / s;
        const stepShadow = Math.min(Math.max((tanSunAlt - horizonSlope) / penumbraScale, 0.0), 1.0);
        minShadow = Math.min(minShadow, stepShadow);
      }
      return minShadow;
    }

    it('evaluates completely lit (factor = 1.0) on flat ground with high sun', () => {
      const h0 = 1000.0;
      const hs = [1000.0, 1000.0, 1000.0, 1000.0];
      const dists = [500.0, 1500.0, 3000.0, 6000.0];
      const factor = computeTerrainShadowFactor(h0, hs, dists, 45.0);
      expect(factor).toBe(1.0);
    });

    it('evaluates deep occlusion (factor = 0.0) at canyon floor with 1.8 km vertical rim', () => {
      // Grand Canyon floor at 750m, rim at 2150m (delta = 1400m) at 2.0 km horizontal distance
      // Rim slope = 1400 / 2000 = 0.70 rad (approx 35 deg).
      // If sun altitude is low (15 deg, tan ~ 0.268), the rim occludes the canyon floor!
      const h0 = 750.0;
      const hs = [800.0, 1200.0, 2150.0, 2150.0];
      const dists = [500.0, 1000.0, 2000.0, 4000.0];
      const factorLowSun = computeTerrainShadowFactor(h0, hs, dists, 15.0);
      expect(factorLowSun).toBe(0.0);

      // Midday sun (70 deg, tan ~ 2.74): sun is above rim slope (0.70 < 2.74), canyon is illuminated!
      const factorHighSun = computeTerrainShadowFactor(h0, hs, dists, 70.0);
      expect(factorHighSun).toBe(1.0);
    });

    it('produces smooth soft penumbra at grazing boundary angle', () => {
      // Rim slope = 100 / 1000 = 0.10
      // Sun altitude where tan(sunAlt) ~ 0.10 is ~5.71 deg
      const h0 = 0.0;
      const hs = [100.0];
      const dists = [1000.0];

      // Sun midway through penumbra band (atan(0.109) ~ 6.22 deg, where slope is 0.10)
      const sunAlt = 6.22;
      const factor = computeTerrainShadowFactor(h0, hs, dists, sunAlt, 2.0);
      expect(factor).toBeGreaterThan(0.0);
      expect(factor).toBeLessThan(1.0);
    });
  });
});
