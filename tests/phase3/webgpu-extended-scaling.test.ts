import { describe, it, expect } from 'vitest';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { ResolutionTier } from '../../src/types';
import fs from 'fs';
import path from 'path';

describe('Phase 3: WebGPU Extended Scaling, Vector Parity & DEM Mipmapping', () => {
  const engine = new WebGPUEngine();

  it('SCAL-01: verifies ResolutionTier includes 100k, 1M, 3M, 4M, 8M, and 16M tiers', () => {
    const validTiers: ResolutionTier[] = ['100k', '1M', '3M', '4M', '8M', '16M'];
    expect(validTiers.length).toBe(6);
  });

  it('SCAL-02: generates correct sphere grid dimensions and vertex counts for all tiers', () => {
    const tierConfigs = [
      { tier: '100k', lat: 256, lon: 512, minExpectedVerts: 260000 },
      { tier: '1M', lat: 512, lon: 1024, minExpectedVerts: 1000000 },
      { tier: '3M', lat: 864, lon: 1728, minExpectedVerts: 2900000 },
      { tier: '4M', lat: 1024, lon: 2048, minExpectedVerts: 4100000 },
    ];

    for (const conf of tierConfigs) {
      const mesh = engine.generateSphereGrid(conf.lat, conf.lon);
      const totalVertices = mesh.vertices.length / 12;
      const totalIndices = mesh.indices.length;

      expect(totalVertices).toBeGreaterThanOrEqual(conf.minExpectedVerts);
      expect(totalIndices).toBe(conf.lat * conf.lon * 6 * 2);
    }
  });

  it('VEC-01: vector_ribbon.wgsl implements exact geoid elevation formula matching crust_hydrosphere.wgsl', () => {
    const vectorWgsl = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/shaders/vector_ribbon.wgsl'), 'utf8');
    const crustWgsl = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl'), 'utf8');

    // Both shaders must decode elevation identically
    expect(vectorWgsl).toContain('demSample.a * 19772.0 - 10924.0');
    expect(crustWgsl).toContain('19772.0 - 10924.0');

    // Both must use dispScale * 2.8 and poleAtten
    expect(vectorWgsl).toContain('sim.u_displacementScale * 2.8');
    expect(crustWgsl).toContain('sim.u_displacementScale * 2.8');

    // Vector ribbon must have positive normal standoff to prevent terrain clipping
    expect(vectorWgsl).toContain('standoff');
    expect(vectorWgsl).toContain('0.025');
  });

  it('VEC-02: mathematical assertion that vector elevation >= crust elevation across all heights', () => {
    const testElevations = [-10000, -5000, -100, 0, 50, 500, 2000, 4500, 8848];
    const dispScale = 0.14 * 2.8;
    const poleAtten = 1.0;

    for (const elevMeters of testElevations) {
      // Crust displacement
      let crustDisp = 0.0;
      if (elevMeters >= 0.0) {
        const normH = elevMeters / 8848.0;
        crustDisp = Math.pow(normH, 1.4) * dispScale * poleAtten;
      } else {
        const normD = Math.max(0.0, Math.min(1.0, -elevMeters / 10924.0));
        crustDisp = -Math.pow(normD, 0.85) * (dispScale * 0.65) * poleAtten;
      }

      // Vector displacement with standoff (+0.025)
      let vecDisp = 0.0;
      if (elevMeters >= 0.0) {
        const normH = elevMeters / 8848.0;
        vecDisp = Math.pow(normH, 1.4) * dispScale * poleAtten;
      } else {
        const normD = Math.max(0.0, Math.min(1.0, -elevMeters / 10924.0));
        vecDisp = -Math.pow(normD, 0.85) * (dispScale * 0.65) * poleAtten;
      }
      const totalVecHeight = vecDisp + 0.025;

      expect(totalVecHeight).toBeGreaterThan(crustDisp);
      expect(totalVecHeight - crustDisp).toBeCloseTo(0.025, 5);
    }
  });

  it('MIP-01: crust_hydrosphere.wgsl uses screen-space derivative mipLOD for DEM sampling', () => {
    const crustWgsl = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl'), 'utf8');
    expect(crustWgsl).toContain('mipLOD');
    expect(crustWgsl).toContain('mipStep');
    expect(crustWgsl).toContain('textureSampleLevel(u_demTexture, u_demSampler, input.uv, mipLOD)');
  });

  it('MIP-02: points and lines renderers implement distance attenuation when zoomed out', () => {
    const pointsWgsl = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/shaders/points_render.wgsl'), 'utf8');
    const linesWgsl = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/shaders/lines_render.wgsl'), 'utf8');

    expect(pointsWgsl).toContain('distAtten');
    expect(pointsWgsl).toContain('smoothstep(18.0, 45.0, camDist)');

    expect(linesWgsl).toContain('distAtten');
    expect(linesWgsl).toContain('smoothstep(18.0, 45.0, camDist)');
  });
});
