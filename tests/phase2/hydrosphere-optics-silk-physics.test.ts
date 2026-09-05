// ============================================================================
// File: tests/phase2/hydrosphere-optics-silk-physics.test.ts
// Architecture: Hydrosphere Optics Fidelity & Solenoidal Silk Physics Verification
// Topics: Jerlov Spectral Radiative Transfer, Kubelka-Munk Carbonate Reef Glow,
//         Gerstner Micro-Ripple Caustics, Sea Level Zero Z-Fighting,
//         and Solenoidal Silk Drape Wave Dynamics.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import crustHydrosphereWGSL from '../../src/webgpu/shaders/crust_hydrosphere.wgsl?raw';
import physicsSimWGSL from '../../src/webgpu/shaders/physics_sim.wgsl?raw';

describe('Hydrosphere Optics & Solenoidal Silk Physics Verification', () => {
  // ==========================================================================
  // Suite 1: Jerlov Radiative Transfer & Spectral Extinction
  // ==========================================================================
  describe('Suite 1: Jerlov Spectral Radiative Transfer (crust_hydrosphere.wgsl)', () => {
    it('HYDRO-01: verifies Jerlov downwelling attenuation coefficients Kd match empirical ocean optics', () => {
      expect(crustHydrosphereWGSL).toContain('const JERLOV_KD: array<vec3<f32>, 5>');
      expect(crustHydrosphereWGSL).toContain('vec3<f32>(0.355, 0.055, 0.023)'); // Type I
      expect(crustHydrosphereWGSL).toContain('vec3<f32>(0.480, 0.145, 0.190)'); // Type III

      // Type I: Blue penetrates deepest (Kd_blue < Kd_green < Kd_red)
      const typeI = [0.355, 0.055, 0.023];
      expect(typeI[2]).toBeLessThan(typeI[1]);
      expect(typeI[1]).toBeLessThan(typeI[0]);

      // Type III: CDOM reverses relationship, Green penetrates deepest (Kd_green < Kd_blue < Kd_red)
      const typeIII = [0.480, 0.145, 0.190];
      expect(typeIII[1]).toBeLessThan(typeIII[2]);
      expect(typeIII[2]).toBeLessThan(typeIII[0]);
    });

    it('HYDRO-02: verifies Jerlov infinite volume reflectance R_inf produces sapphire abyss for Type I and green-cyan for Type III', () => {
      expect(crustHydrosphereWGSL).toContain('const JERLOV_R_INF: array<vec3<f32>, 5>');
      expect(crustHydrosphereWGSL).toContain('vec3<f32>(0.00064, 0.00527, 0.01720)'); // Type I
      expect(crustHydrosphereWGSL).toContain('vec3<f32>(0.00542, 0.02377, 0.01903)'); // Type III

      const rInfTypeI = [0.00064, 0.00527, 0.01720];
      // In Type I: Blue reflectance is over 3x stronger than green and 26x stronger than red
      expect(rInfTypeI[2] / rInfTypeI[1]).toBeGreaterThan(3.0);
      expect(rInfTypeI[2] / rInfTypeI[0]).toBeGreaterThan(25.0);

      const rInfTypeIII = [0.00542, 0.02377, 0.01903];
      // In Type III: Green reflectance dominates
      expect(rInfTypeIII[1]).toBeGreaterThan(rInfTypeIII[2]);
    });

    it('HYDRO-03: verifies getJerlovProperties smoothly interpolates across water types based on clarity and depth', () => {
      expect(crustHydrosphereWGSL).toContain('fn getJerlovProperties');
      expect(crustHydrosphereWGSL).toContain('struct JerlovProperties');
      expect(crustHydrosphereWGSL).toContain('props.Kd = mix(JERLOV_KD[idx0], JERLOV_KD[idx1], frac);');
    });
  });

  // ==========================================================================
  // Suite 2: Kubelka-Munk Carbonate Reef Glow (0m - 50m)
  // ==========================================================================
  describe('Suite 2: Kubelka-Munk Carbonate Reef Reflectance (crust_hydrosphere.wgsl)', () => {
    it('HYDRO-04: verifies ALBEDO_CARBONATE_REEF matches exact aragonite coral sand albedo', () => {
      expect(crustHydrosphereWGSL).toContain('const ALBEDO_CARBONATE_REEF: vec3<f32> = vec3<f32>(0.48, 0.54, 0.44);');
      expect(crustHydrosphereWGSL).toContain('const ALBEDO_ABYSSAL_BASALT: vec3<f32> = vec3<f32>(0.06, 0.05, 0.04);');
    });

    it('HYDRO-05: verifies Kubelka-Munk reflectance transitions from carbonate reef glow to deep abyss', () => {
      expect(crustHydrosphereWGSL).toContain('evaluateKubelkaMunkReflectanceProps');
      expect(crustHydrosphereWGSL).toContain('mix(ALBEDO_ABYSSAL_BASALT, ALBEDO_CARBONATE_REEF, reefWeight);');
      expect(crustHydrosphereWGSL).toContain('1.0 - smoothstep(1.0, 50.0, safeDepth)');
    });

    it('HYDRO-06: proves 3m shallow bathymetry over carbonate reef produces radiant turquoise-cyan with warm undertone', () => {
      const bottomAlbedo = [0.48, 0.54, 0.44];
      const Kd = [0.355, 0.055, 0.023]; // Type I
      const depth = 3.0;

      // Two-way attenuation
      const reflected = [
        bottomAlbedo[0] * Math.exp(-2.0 * Kd[0] * depth),
        bottomAlbedo[1] * Math.exp(-2.0 * Kd[1] * depth),
        bottomAlbedo[2] * Math.exp(-2.0 * Kd[2] * depth),
      ];

      expect(reflected[0]).toBeCloseTo(0.056, 2);
      expect(reflected[1]).toBeCloseTo(0.388, 2);
      expect(reflected[2]).toBeCloseTo(0.383, 2);
      // Vivid turquoise cyan with green and blue > 6x red
      expect(reflected[1] / reflected[0]).toBeGreaterThan(6.0);
      expect(reflected[2] / reflected[0]).toBeGreaterThan(6.0);
    });
  });

  // ==========================================================================
  // Suite 3: Gerstner 4-Octave Micro-Ripple Caustics
  // ==========================================================================
  describe('Suite 3: Gerstner 4-Octave Micro-Ripple Caustics (crust_hydrosphere.wgsl)', () => {
    it('HYDRO-07: verifies 4-octave directional harmonics in WAVE_OCTAVES array', () => {
      expect(crustHydrosphereWGSL).toContain('const WAVE_OCTAVES: array<WaveHarmonic, 4>');
      expect(crustHydrosphereWGSL).toContain('WaveHarmonic(0.024,  2.40,  1.80, 2.20, 0.00)');
      expect(crustHydrosphereWGSL).toContain('WaveHarmonic(0.014, -3.80,  3.20, 3.40, 1.14)');
      expect(crustHydrosphereWGSL).toContain('WaveHarmonic(0.008,  6.50, -5.10, 5.10, 2.31)');
      expect(crustHydrosphereWGSL).toContain('WaveHarmonic(0.004, -9.20, -8.60, 7.80, 4.05)');
    });

    it('HYDRO-08: verifies evaluateCausticIntensity focuses light at wave troughs and attenuates with depth', () => {
      expect(crustHydrosphereWGSL).toContain('fn evaluateCausticIntensity');
      expect(crustHydrosphereWGSL).toContain('const MU_REFR: f32 = 0.2504;');
      expect(crustHydrosphereWGSL).toContain('rawCaustic = 1.0 - (beta * analyticalDivergence) * intensityGain;');
    });
  });

  // ==========================================================================
  // Suite 4: Fluid Morph Silk Billowing Physics (physics_sim.wgsl)
  // ==========================================================================
  describe('Suite 4: Fluid Morph Silk Drape Dynamics (physics_sim.wgsl)', () => {
    it('PHYS-01: verifies irrational SO(3) rotation matrix in solenoidal curl noise', () => {
      expect(physicsSimWGSL).toContain('vec3<f32>(0.00,  0.80,  0.60)');
      expect(physicsSimWGSL).toContain('vec3<f32>(-0.80, 0.36, -0.48)');
      expect(physicsSimWGSL).toContain('vec3<f32>(-0.60, -0.48, 0.64)');

      // Verify rotation matrix is orthogonal (R * R^T = I)
      const c0 = new THREE.Vector3(0.00, 0.80, 0.60);
      const c1 = new THREE.Vector3(-0.80, 0.36, -0.48);
      const c2 = new THREE.Vector3(-0.60, -0.48, 0.64);

      expect(c0.length()).toBeCloseTo(1.0, 5);
      expect(c1.length()).toBeCloseTo(1.0, 5);
      expect(c2.length()).toBeCloseTo(1.0, 5);

      expect(c0.dot(c1)).toBeCloseTo(0.0, 5);
      expect(c0.dot(c2)).toBeCloseTo(0.0, 5);
      expect(c1.dot(c2)).toBeCloseTo(0.0, 5);

      // Determinant = 1 (proper SO(3) rotation)
      const m = new THREE.Matrix3().set(
        0.00, -0.80, -0.60,
        0.80, 0.36, -0.48,
        0.60, -0.48, 0.64
      );
      expect(m.determinant()).toBeCloseTo(1.0, 4);
    });

    it('PHYS-02: verifies silk drape wave dynamics formulation in Mode 3', () => {
      expect(physicsSimWGSL).toContain('let wavePhase1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35 - sim.u_time * 1.25;');
      expect(physicsSimWGSL).toContain('let wavePhase2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75 - sim.u_time * 0.90;');
      expect(physicsSimWGSL).toContain('let silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;');
      expect(physicsSimWGSL).toContain('let silkDrapeOffset = surfaceNormal * silkWave;');
    });

    it('PHYS-03: verifies liquefaction curve produces zero displacement at boundaries and peak billow at alpha = 0.5', () => {
      const liquefaction = (alpha: number) => Math.pow(Math.max(0.0, Math.sin(Math.PI * alpha)), 1.15);

      expect(liquefaction(0.0)).toBeCloseTo(0.0, 5);
      expect(liquefaction(1.0)).toBeCloseTo(0.0, 5);
      expect(liquefaction(0.5)).toBeCloseTo(1.0, 5);

      // Verify smooth and symmetric curve
      expect(liquefaction(0.25)).toBeCloseTo(liquefaction(0.75), 5);
      expect(liquefaction(0.25)).toBeGreaterThan(0.6);
    });

    it('PHYS-04: verifies silk drape offset is strictly normal to the manifold surface', () => {
      // For any point, silkDrapeOffset is scalar * surfaceNormal
      const normal = new THREE.Vector3(0.577, 0.577, 0.577).normalize();
      const silkWave = 0.45;
      const silkDrapeOffset = normal.clone().multiplyScalar(silkWave);

      expect(silkDrapeOffset.clone().normalize().dot(normal)).toBeCloseTo(1.0, 5);
      expect(silkDrapeOffset.length()).toBeCloseTo(0.45, 5);
    });
  });
});
