import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestone 4: Cloud Strata Ground Shadows & Stratum Ink Pigmentation', () => {
  const root = process.cwd();
  const crustWgslPath = path.join(root, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const cloudShellWgslPath = path.join(root, 'src/webgpu/shaders/cloud_shell.wgsl');

  const crustWgsl = fs.readFileSync(crustWgslPath, 'utf8');
  const cloudShellWgsl = fs.readFileSync(cloudShellWgslPath, 'utf8');

  // Mathematical reference models matching Spec §8
  function computeStratumShadowFactor(
    cloudDensLow: number,
    cloudDensHigh: number,
    terrainElevM: number,
    cloudAltKm: number = 2.5,
    intensity: number = 0.55
  ): { shadowFactor: number; lowTau: number; highTau: number } {
    const terrainH_km = Math.max(0.0, terrainElevM) * 0.001;
    const deltaHLow = Math.max(0.0, cloudAltKm - terrainH_km);
    const deltaHHigh = Math.max(0.0, 8.5 - terrainH_km);

    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
      return t * t * (3.0 - 2.0 * t);
    };

    const lowTerrainAtten = deltaHLow <= 0.0 ? 0.0 : smoothstep(0.0, 0.5, deltaHLow);
    const highTerrainAtten = deltaHHigh <= 0.0 ? 0.0 : smoothstep(0.0, 1.0, deltaHHigh);

    const lowTau = smoothstep(0.10, 0.35, cloudDensLow) * 0.70 * lowTerrainAtten;
    const highTau = smoothstep(0.12, 0.45, cloudDensHigh) * 0.30 * highTerrainAtten;
    const totalTau = lowTau + highTau;

    const shadowFactor = Math.max(0.0, Math.min(1.0, 1.0 - intensity * totalTau));
    return { shadowFactor, lowTau, highTau };
  }

  describe('1. Stratum Ink Pigmentation (cloud_shell.wgsl)', () => {
    it('M4-PIGM-01: Theme 1 implements stratum differentiation across layers 0, 1, 2', () => {
      expect(cloudShellWgsl).toContain('layerIdx == 0u');
      expect(cloudShellWgsl).toContain('layerIdx == 1u');
      // Low Stratus: Layered gouache crevice tone
      expect(cloudShellWgsl).toContain('vec3<f32>(0.78, 0.72, 0.64)');
      // Mid Altocumulus: Soft umber wash
      expect(cloudShellWgsl).toContain('vec3<f32>(0.74, 0.67, 0.58)');
      // High Cirrus: Silverpoint hairline (#4A423B)
      expect(cloudShellWgsl).toContain('vec3<f32>(0.290, 0.259, 0.231)');
    });

    it('M4-PIGM-02: High Cirrus applies non-linear exponential falloff and hairline modulation', () => {
      expect(cloudShellWgsl).toContain('pow(featheredCloud, 2.4)');
      expect(cloudShellWgsl).toContain('hairlineMod');
      expect(cloudShellWgsl).toContain('alpha * cirrusFalloff * hairlineMod');
    });

    it('M4-PIGM-03: Theme 1 preserves ivory wash paper tooth absorption', () => {
      expect(cloudShellWgsl).toContain('let ivoryWash = vec3<f32>(0.98, 0.95, 0.89);');
      expect(cloudShellWgsl).toContain('paperTooth');
    });
  });

  describe('2. Multi-Stratum Ground Shadow Raymarching (crust_hydrosphere.wgsl)', () => {
    it('M4-SHAD-01: sampleCloudShadowFactor projects low (2.5 km) and high (8.5 km) shadow rays', () => {
      expect(crustWgsl).toContain('let highShadowOffset = shadowOffset * 3.4;');
      expect(crustWgsl).toContain('let highDriftOffset = driftOffset * 1.8;');
      expect(crustWgsl).toContain('const PENUMBRA_HIGH_KM: f32 = 35.0;');
    });

    it('M4-SHAD-02: High cloud taps use explicit LOD 0.0 with textureSampleLevel', () => {
      expect(crustWgsl).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tapHigh0, 0.0)');
      expect(crustWgsl).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tapHigh1, 0.0)');
      expect(crustWgsl).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tapHigh2, 0.0)');
      expect(crustWgsl).toContain('textureSampleLevel(u_cloudTexture, u_cloudSampler, tapHigh3, 0.0)');
    });

    it('M4-SHAD-03: Terrain peaks above cloudAltKm decouple from low stratus shadows', () => {
      expect(crustWgsl).toContain('let deltaHLow = max(0.0, cloudAltKm - terrainH_km);');
      expect(crustWgsl).toContain('let deltaHHigh = max(0.0, 8.5 - terrainH_km);');
      expect(crustWgsl).toContain('let lowTerrainAtten = select(smoothstep(0.0, 0.5, deltaHLow), 0.0, deltaHLow <= 0.0);');
    });

    it('M4-SHAD-04: Optical depths combine low and high contributions into shadowFactor', () => {
      expect(crustWgsl).toContain('let lowTau = smoothstep(0.10, 0.35, cloudDens) * 0.70 * lowTerrainAtten;');
      expect(crustWgsl).toContain('let highTau = smoothstep(0.12, 0.45, highCloudDens) * 0.30 * highTerrainAtten;');
      expect(crustWgsl).toContain('let totalTau = lowTau + highTau;');
      expect(crustWgsl).toContain('let shadowFactor = 1.0 - intensity * totalTau;');
    });
  });

  describe('3. Physical Boundary Decoupling Verification', () => {
    it('M4-PHYS-01: Mountain summit (z = 4,000m) pierces low clouds (lowTau == 0)', () => {
      const res = computeStratumShadowFactor(0.9, 0.0, 4000.0, 2.5, 0.6);
      expect(res.lowTau).toBe(0.0);
      expect(res.shadowFactor).toBe(1.0); // Completely unattenuated by low cloud
    });

    it('M4-PHYS-02: Valley floor (z = 200m) receives full low cloud shadow', () => {
      const res = computeStratumShadowFactor(0.9, 0.0, 200.0, 2.5, 0.6);
      expect(res.lowTau).toBeCloseTo(0.70, 2);
      expect(res.shadowFactor).toBeLessThan(1.0);
    });

    it('M4-PHYS-03: High cirrus casts shadows over high peaks up to 8,500m', () => {
      const res = computeStratumShadowFactor(0.0, 0.9, 5000.0, 2.5, 0.6);
      expect(res.highTau).toBeGreaterThan(0.20);
      expect(res.shadowFactor).toBeLessThan(1.0);
    });

    it('M4-PHYS-04: Beyond 8,500m (Mt. Everest summit), high cirrus shadow tapers to zero', () => {
      const res = computeStratumShadowFactor(0.0, 0.9, 8848.0, 2.5, 0.6);
      expect(res.highTau).toBe(0.0);
      expect(res.shadowFactor).toBe(1.0);
    });
  });

  describe('4. Monte Carlo Fuzzing & Numerical Singularity Verification', () => {
    it('M4-MC-01: 25,000 randomized iterations confirm shadowFactor strictly in [0.0, 1.0] and zero NaNs', () => {
      for (let i = 0; i < 25000; i++) {
        const cloudLow = Math.random();
        const cloudHigh = Math.random();
        const elev = Math.random() * 19772.0 - 10924.0; // Full DEM range [-10924, +8848]
        const intensity = Math.random();

        const res = computeStratumShadowFactor(cloudLow, cloudHigh, elev, 2.5, intensity);

        expect(Number.isNaN(res.shadowFactor)).toBe(false);
        expect(Number.isFinite(res.shadowFactor)).toBe(true);
        expect(res.shadowFactor).toBeGreaterThanOrEqual(0.0);
        expect(res.shadowFactor).toBeLessThanOrEqual(1.0);
        expect(res.lowTau).toBeGreaterThanOrEqual(0.0);
        expect(res.highTau).toBeGreaterThanOrEqual(0.0);
      }
    });
  });
});
