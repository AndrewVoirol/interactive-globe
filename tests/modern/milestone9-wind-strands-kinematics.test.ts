import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestone 9: Wind Strands & Multi-Fold Kinematic Entrainment', () => {
  const windParticlesPath = path.resolve(__dirname, '../../src/webgpu/shaders/wind_particles.wgsl');
  const windRibbonRenderPath = path.resolve(__dirname, '../../src/webgpu/shaders/wind_ribbon_render.wgsl');
  const windParticlesWGSL = fs.readFileSync(windParticlesPath, 'utf-8');
  const windRibbonRenderWGSL = fs.readFileSync(windRibbonRenderPath, 'utf-8');

  describe('1. Task M9-T1: Mode 0–3 Manifold Fold Coupling & Developable Unroll Parity', () => {
    it('M9-UNROLL-01: geodeticToManifold enforces Equirectangular 2:1 mapping for Mode 0 parity', () => {
      // In Mode 0, target coordinates must be Equirectangular 2:1 (lonRad * RADIUS, latRad * RADIUS)
      // to achieve exact 1:1 spatial alignment with Mode 0 evaluateModeZero and eliminate latitudinal drift.
      expect(windParticlesWGSL).toContain('let targetY = select(mercatorY, latRad * RADIUS, mode == 0u);');
      expect(windParticlesWGSL).toContain('let target2D = vec2<f32>(lonRad * RADIUS, targetY);');
    });

    it('M9-SCROLL-02: Mode 1 parchment scroll applies physical altitude standoff along deformed normal', () => {
      // Wrapping wind ribbons conformally with cylindrical scroll (r_scroll)
      // prevents ribbons from piercing through paper layers
      expect(windParticlesWGSL).toContain('var finalPos = deformed.pos + deformed.normal * altOffset;');
    });

    it('M9-FRACTURE-03: Mode 2 Mid-Atlantic Ridge calving rift preserves continuous streamline transport', () => {
      // Atmospheric strands cancel the discontinuous crust crack jump across the rift
      // to eliminate tearing or stretching over the opening chasm
      expect(windParticlesWGSL).toContain('let lambdaRift: f32 = -0.48869219;');
      expect(windParticlesWGSL).toContain('let crackSign = select(-1.0, 1.0, lonRad >= lambdaRift);');
      expect(windParticlesWGSL).toContain('finalPos = finalPos - tEast * crackDilation;');
      expect(windParticlesWGSL).toContain('finalPos = finalPos - tEast * (crackWidth * (1.0 - tPeel));');
    });
  });

  describe('2. Task M9-T2: Mode 3 Solenoidal Fluid Shear & Lamb-Oseen Vortex Coupling', () => {
    it('M9-SHEAR-01: defines sampleEffectiveVelocity with solenoidal curl projection onto sphere tangent basis', () => {
      expect(windParticlesWGSL).toContain('fn sampleEffectiveVelocity(lonRad: f32, latRad: f32, isJet: bool) -> vec2<f32>');
      // Mode 3 liquefaction fluid blending factor
      expect(windParticlesWGSL).toContain('let alpha_fluid = select(0.0, sin(PI * alpha_clamped) * (1.0 - 0.35 * alpha_clamped), sim.u_mode == 3u);');
      // Solenoidal projection: u_fluid3D = u_curl - n * (n · u_curl)
      expect(windParticlesWGSL).toContain('let u_curl = computeCurlNoise(pos3D, sim.u_time * 1.5);');
      expect(windParticlesWGSL).toContain('let u_fluid3D = u_curl - n * dot(n, u_curl);');
      // Spherical tangent basis projection
      expect(windParticlesWGSL).toContain('let eEast = vec3<f32>(cosLon, 0.0, -sinLon);');
      expect(windParticlesWGSL).toContain('let eNorth = cross(n, eEast);');
      expect(windParticlesWGSL).toContain('let u_fluid = vec2<f32>(dot(u_fluid3D, eEast), dot(u_fluid3D, eNorth));');
    });

    it('M9-SHEAR-02: effective velocity advects particles and integrates backward streamlines', () => {
      // RK2 advection uses sampleEffectiveVelocity
      expect(windParticlesWGSL).toContain('let v0 = sampleEffectiveVelocity(lon, lat, isJetStream);');
      expect(windParticlesWGSL).toContain('let vMid = sampleEffectiveVelocity(posMid.x, posMid.y, isJetStream);');
      // Backward streamline integration uses sampleEffectiveVelocity
      expect(windParticlesWGSL).toContain('let v1 = sampleEffectiveVelocity(lon1, lat1, isJetStream);');
      expect(windParticlesWGSL).toContain('let v2 = sampleEffectiveVelocity(lon2, lat2, isJetStream);');
      expect(windParticlesWGSL).toContain('let v3 = sampleEffectiveVelocity(lon3, lat3, isJetStream);');
    });
  });

  describe('3. Task M9-T3: Analytic Antimeridian Seam Segmentation & Archival Medium Polish', () => {
    it('M9-SEAM-01: zeroes segment alpha when consecutive history points cross the antimeridian boundary', () => {
      expect(windParticlesWGSL).toContain('if (abs(lon - lon1) > PI) {');
      expect(windParticlesWGSL).toContain('a1 = 0.0;');
      expect(windParticlesWGSL).toContain('if (abs(lon1 - lon2) > PI) {');
      expect(windParticlesWGSL).toContain('a2 = 0.0;');
      expect(windParticlesWGSL).toContain('if (abs(lon2 - lon3) > PI) {');
      expect(windParticlesWGSL).toContain('a3 = 0.0;');
    });

    it('M9-SEAM-02: suppresses flat map quad extrusion at the antimeridian seam in wind_ribbon_render.wgsl', () => {
      expect(windRibbonRenderWGSL).toContain('let isCrossAntimeridian = select(false, abs(ptA.x - ptB.x) > PI * RADIUS * 0.75, sim.u_unfurl > 0.05);');
      expect(windRibbonRenderWGSL).toContain('isCrossAntimeridian');
    });

    it('M9-INK-03: Theme 1 (Cream Rag) applies capillary absorption feathering into cellulose paper tooth', () => {
      expect(windRibbonRenderWGSL).toContain('toothNoise');
      expect(windRibbonRenderWGSL).toContain('capillaryFeather');
      expect(windRibbonRenderWGSL).toContain('inkBleed');
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.64, 0.44, 0.30)'); // Warm cellulose bleed
    });

    it('M9-INK-04: Theme 2 (Prussian Cyanotype) enforces pure actinic white and cerulean linework with zero warm contamination', () => {
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.92, 0.96, 1.00)'); // Pure actinic white
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.42, 0.82, 0.98)'); // Cold photochemical cerulean
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.478, 0.635, 0.784)'); // Chalk cerulean #7AA2C8
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.94, 0.97, 1.00)'); // Crisp chalk white
    });

    it('M9-INK-05: Theme 0 (Marie Tharp) polishes physiographic ink glaze with dual amber/cyan core for jet stream', () => {
      expect(windRibbonRenderWGSL).toContain('coreSpine');
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(1.00, 0.82, 0.38)'); // Warm solar gold
      expect(windRibbonRenderWGSL).toContain('vec3<f32>(0.22, 0.50, 0.70)'); // Deep aerospace slate-blue
    });
  });
});
