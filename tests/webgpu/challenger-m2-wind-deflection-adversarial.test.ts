// ============================================================================
// File: tests/webgpu/challenger-m2-wind-deflection-adversarial.test.ts
// Challenger: challenger_m2_1 (teamwork_preview_challenger)
// Milestone: Milestone 2 — Topographic Barrier Wind Deflection
// Authoritative Specifications & Invariants:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§2.2 Topographic Barrier Wind Deflection)
//   - AGENTS.md (Invariants §3: UCF, §15: DEM Parity, §18: Metric Tensor, §20: Alignment, §46: Import Integrity, §48: Dynamic Dims)
// Description:
//   Adversarial stress-testing of kinetic energy conservation and numerical stability:
//   1. 50,000-trial Monte Carlo fuzzing over randomized velocities u in [-50, 50]^2 m/s,
//      slope gradients ||grad h|| in [1e-6, 2.0], incident angles theta in [0, 2pi),
//      verifying deviation strictly < 1e-5 in both FP64 and FP32 (Math.fround).
//   2. Boundary singularity probing: calm air (||u|| = 0), near-zero gradients (||grad h|| -> 0),
//      vertical cliffs (||grad h|| -> inf), sea level / bathymetry, downslope flow.
//   3. Anti-cheating verification of production WGSL shader source.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import windParticlesWGSL from '../../src/webgpu/shaders/wind_particles.wgsl?raw';

// ============================================================================
// Mathematical Models of sampleVelocity
// 1. FP64: Double-precision reference model
// 2. FP32: Single-precision GPU-equivalent emulation using Math.fround
// ============================================================================

interface TerrainInput {
  elevation: number;
  gradient: [number, number]; // [dh/dx, dh/dy]
}

function evaluateDeflectionFP64(
  rawVel: [number, number],
  terrain: TerrainInput,
  isJet: boolean = false
): [number, number] {
  if (isJet) {
    return [rawVel[0], rawVel[1]];
  }

  const gradMag = Math.hypot(terrain.gradient[0], terrain.gradient[1]);
  const slopeNormal: [number, number] = [
    terrain.gradient[0] / Math.max(gradMag, 1e-6),
    terrain.gradient[1] / Math.max(gradMag, 1e-6),
  ];

  if (terrain.elevation > 0.0 && gradMag > 1e-5) {
    const d = rawVel[0] * slopeNormal[0] + rawVel[1] * slopeNormal[1];
    if (d > 0.0) {
      // Deflect upslope barrier flow by 75% (Spec §2.2)
      const uDeflected: [number, number] = [
        rawVel[0] - 0.75 * d * slopeNormal[0],
        rawVel[1] - 0.75 * d * slopeNormal[1],
      ];
      const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
      const defSpeed = Math.hypot(uDeflected[0], uDeflected[1]);
      // Conserve kinetic energy by scaling speed to match raw incoming speed
      if (rawSpeed > 1e-5 && defSpeed > 1e-6) {
        const scale = rawSpeed / Math.max(defSpeed, 1e-6);
        return [uDeflected[0] * scale, uDeflected[1] * scale];
      }
      return uDeflected;
    }
  }

  return [rawVel[0], rawVel[1]];
}

function evaluateDeflectionFP32(
  rawVel: [number, number],
  terrain: TerrainInput,
  isJet: boolean = false
): [number, number] {
  if (isJet) {
    return [Math.fround(rawVel[0]), Math.fround(rawVel[1])];
  }

  const vx = Math.fround(rawVel[0]);
  const vy = Math.fround(rawVel[1]);
  const elev = Math.fround(terrain.elevation);
  const gx = Math.fround(terrain.gradient[0]);
  const gy = Math.fround(terrain.gradient[1]);

  const gradMag = Math.fround(Math.hypot(gx, gy));
  const maxGrad = Math.fround(Math.max(gradMag, 1e-6));
  const slopeNormalX = Math.fround(gx / maxGrad);
  const slopeNormalY = Math.fround(gy / maxGrad);

  if (elev > 0.0 && gradMag > 1e-5) {
    const d = Math.fround(Math.fround(vx * slopeNormalX) + Math.fround(vy * slopeNormalY));
    if (d > 0.0) {
      const uDefX = Math.fround(vx - Math.fround(0.75 * Math.fround(d * slopeNormalX)));
      const uDefY = Math.fround(vy - Math.fround(0.75 * Math.fround(d * slopeNormalY)));
      const rawSpeed = Math.fround(Math.hypot(vx, vy));
      const defSpeed = Math.fround(Math.hypot(uDefX, uDefY));
      if (rawSpeed > 1e-5 && defSpeed > 1e-6) {
        const scale = Math.fround(rawSpeed / Math.fround(Math.max(defSpeed, 1e-6)));
        return [Math.fround(uDefX * scale), Math.fround(uDefY * scale)];
      }
      return [uDefX, uDefY];
    }
  }

  return [vx, vy];
}

describe('Challenger M2 Adversarial Test Suite: Topographic Barrier Wind Deflection', () => {
  // --------------------------------------------------------------------------
  // Pillar 1: Anti-Cheating & Production WGSL Shader Verification (Invariant §46)
  // --------------------------------------------------------------------------
  describe('Pillar 1: Production Shader Integrity & Invariants', () => {
    it('CHALLENGE-M2-01: Imports production WGSL shader directly with non-trivial size', () => {
      expect(windParticlesWGSL).toBeDefined();
      expect(windParticlesWGSL.length).toBeGreaterThan(10000);
      expect(windParticlesWGSL).toContain('fn sampleVelocity');
      expect(windParticlesWGSL).toContain('fn sampleTerrain');
    });

    it('CHALLENGE-M2-02: Verifies sampleVelocity is declared strictly AFTER sampleTerrain', () => {
      const sampleTerrainIdx = windParticlesWGSL.indexOf('fn sampleTerrain(');
      const sampleVelocityIdx = windParticlesWGSL.indexOf('fn sampleVelocity(');
      expect(sampleTerrainIdx).toBeGreaterThan(-1);
      expect(sampleVelocityIdx).toBeGreaterThan(-1);
      expect(sampleTerrainIdx).toBeLessThan(sampleVelocityIdx);
    });

    it('CHALLENGE-M2-03: Invariant §3 - Verifies unconditional uniform control flow and explicit LOD 0.0', () => {
      // In WebGPU compute shaders, textureSampleLevel with LOD 0.0 must be used
      const sampleVelocityBody = windParticlesWGSL.slice(
        windParticlesWGSL.indexOf('fn sampleVelocity('),
        windParticlesWGSL.indexOf('fn computeLiftedAltitude(')
      );
      expect(sampleVelocityBody).toContain('textureSampleLevel(u_jetTexture, u_windSampler, uv, 0.0)');
      expect(sampleVelocityBody).toContain('textureSampleLevel(u_windTexture, u_windSampler, uv, 0.0)');
      // Must not contain implicit derivative textureSample
      expect(sampleVelocityBody).not.toMatch(/textureSample\(/);
      expect(sampleVelocityBody).not.toMatch(/fwidth\(/);
      expect(sampleVelocityBody).not.toMatch(/dpdx\(/);
      expect(sampleVelocityBody).not.toMatch(/dpdy\(/);
    });

    it('CHALLENGE-M2-04: Invariant §15 & §18 - Verifies DEM elevation unpacking and spherical metric tensor', () => {
      expect(windParticlesWGSL).toContain('sample.a * 19772.0 - 10924.0');
      expect(windParticlesWGSL).toContain('let cosLat = max(0.05, cos(latRad));');
      expect(windParticlesWGSL).toContain('let dx = 2.0 * EARTH_RADIUS * cosLat * dLon;');
      expect(windParticlesWGSL).toContain('let dy = 2.0 * EARTH_RADIUS * dLat;');
    });

    it('CHALLENGE-M2-05: Invariant §48 - Verifies dynamic DEM dimensions via textureDimensions', () => {
      expect(windParticlesWGSL).toContain('let demDims = vec2<f32>(textureDimensions(u_demTexture));');
    });

    it('CHALLENGE-M2-06: Verifies exact 0.75 deflection factor and select-based speed normalization in WGSL', () => {
      expect(windParticlesWGSL).toContain('let uDeflected = rawVel - 0.75 * d * slopeNormal;');
      expect(windParticlesWGSL).toContain(
        'return select(uDeflected, uDeflected * (rawSpeed / max(defSpeed, 1e-6)), rawSpeed > 1e-5 && defSpeed > 1e-6);'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: 50,000-Trial Monte Carlo Fuzzing across Full Domain
  // --------------------------------------------------------------------------
  describe('Pillar 2: 50,000-Trial Monte Carlo Fuzzing (Kinetic Energy Conservation)', () => {
    const ITERATIONS = 50_000;

    it('CHALLENGE-M2-07: 50,000 Monte Carlo trials in FP64: speed deviation strictly < 1e-5, zero NaNs, zero Infs', () => {
      let maxDeviation = 0;
      let nanCount = 0;
      let nonFiniteCount = 0;
      let upslopeDeflectionCount = 0;

      // Seeded deterministic pseudo-random sequence for repeatability
      let seed = 1337042;
      const pseudoRandom = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      for (let i = 0; i < ITERATIONS; i++) {
        // Randomized velocities u in [-50, 50]^2 m/s
        const ux = pseudoRandom() * 100 - 50;
        const uy = pseudoRandom() * 100 - 50;
        const rawVel: [number, number] = [ux, uy];

        // Randomized steepness gradients ||grad h|| in [1e-6, 2.0]
        const gradMag = 1e-6 + pseudoRandom() * (2.0 - 1e-6);
        const aspectAngle = pseudoRandom() * Math.PI * 2;
        const grad: [number, number] = [
          gradMag * Math.cos(aspectAngle),
          gradMag * Math.sin(aspectAngle),
        ];

        // Positive mountain elevation (1m to 8848m)
        const elevation = 1.0 + pseudoRandom() * 8847.0;

        const out = evaluateDeflectionFP64(rawVel, { elevation, gradient: grad });

        if (Number.isNaN(out[0]) || Number.isNaN(out[1])) nanCount++;
        if (!Number.isFinite(out[0]) || !Number.isFinite(out[1])) nonFiniteCount++;

        const rawSpeed = Math.hypot(ux, uy);
        const outSpeed = Math.hypot(out[0], out[1]);
        const deviation = Math.abs(outSpeed - rawSpeed);

        if (deviation > maxDeviation) {
          maxDeviation = deviation;
        }

        // Track when actual upslope deflection occurred (d > 0 and gradMag > 1e-5)
        const slopeNormalX = grad[0] / Math.max(gradMag, 1e-6);
        const slopeNormalY = grad[1] / Math.max(gradMag, 1e-6);
        const d = ux * slopeNormalX + uy * slopeNormalY;
        if (d > 0 && gradMag > 1e-5) {
          upslopeDeflectionCount++;
        }
      }

      expect(nanCount).toBe(0);
      expect(nonFiniteCount).toBe(0);
      // Ensure a significant portion of trials experienced active deflection
      expect(upslopeDeflectionCount).toBeGreaterThan(ITERATIONS * 0.45);
      // Kinetic energy speed deviation must be strictly < 1e-5
      expect(maxDeviation).toBeLessThan(1e-5);
    });

    it('CHALLENGE-M2-08: 50,000 Monte Carlo trials in FP32 (Math.fround): speed deviation strictly < 1e-5, zero NaNs, zero Infs', () => {
      let maxDeviation = 0;
      let nanCount = 0;
      let nonFiniteCount = 0;

      let seed = 987654321;
      const pseudoRandom = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      for (let i = 0; i < ITERATIONS; i++) {
        // Randomized velocities u in [-50, 50]^2 m/s
        const ux = Math.fround(pseudoRandom() * 100 - 50);
        const uy = Math.fround(pseudoRandom() * 100 - 50);
        const rawVel: [number, number] = [ux, uy];

        // Randomized steepness gradients ||grad h|| in [1e-6, 2.0]
        const gradMag = Math.fround(1e-6 + pseudoRandom() * (2.0 - 1e-6));
        const aspectAngle = pseudoRandom() * Math.PI * 2;
        const grad: [number, number] = [
          Math.fround(gradMag * Math.cos(aspectAngle)),
          Math.fround(gradMag * Math.sin(aspectAngle)),
        ];

        const elevation = Math.fround(1.0 + pseudoRandom() * 8847.0);

        const out = evaluateDeflectionFP32(rawVel, { elevation, gradient: grad });

        if (Number.isNaN(out[0]) || Number.isNaN(out[1])) nanCount++;
        if (!Number.isFinite(out[0]) || !Number.isFinite(out[1])) nonFiniteCount++;

        const rawSpeed = Math.fround(Math.hypot(ux, uy));
        const outSpeed = Math.fround(Math.hypot(out[0], out[1]));
        const deviation = Math.abs(outSpeed - rawSpeed);

        if (deviation > maxDeviation) {
          maxDeviation = deviation;
        }
      }

      expect(nanCount).toBe(0);
      expect(nonFiniteCount).toBe(0);
      // In single precision FP32, deviation must also be strictly < 1e-5
      expect(maxDeviation).toBeLessThan(1e-5);
    });

    it('CHALLENGE-M2-09: Fuzzing across full incident angle spectrum theta in [0, 2pi) at 360 discrete steps', () => {
      const speed = 25.0; // 25 m/s gale
      const gradMag = 0.5; // 50% grade mountain slope
      const elevation = 2500; // 2500m Alpine ridge

      for (let deg = 0; deg < 360; deg++) {
        const rad = (deg * Math.PI) / 180;
        const rawVel: [number, number] = [speed * Math.cos(rad), speed * Math.sin(rad)];
        const grad: [number, number] = [gradMag, 0.0]; // Slope rises East

        const outFP64 = evaluateDeflectionFP64(rawVel, { elevation, gradient: grad });
        const outFP32 = evaluateDeflectionFP32(rawVel, { elevation, gradient: grad });

        const outSpeedFP64 = Math.hypot(outFP64[0], outFP64[1]);
        const outSpeedFP32 = Math.hypot(outFP32[0], outFP32[1]);

        expect(Math.abs(outSpeedFP64 - speed)).toBeLessThan(1e-5);
        expect(Math.abs(outSpeedFP32 - speed)).toBeLessThan(1e-5);
        expect(Number.isFinite(outFP64[0])).toBe(true);
        expect(Number.isFinite(outFP32[0])).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Critical Boundary Singularities Probing
  // --------------------------------------------------------------------------
  describe('Pillar 3: Boundary Singularities & Extreme Edge Probing', () => {
    it('CHALLENGE-M2-10: Calm Air (||u|| = 0) returns [0, 0] with zero NaNs and zero crashes', () => {
      const calmProbes: [number, number][] = [
        [0.0, 0.0],
        [-0.0, -0.0],
        [0.0, -0.0],
        [-0.0, 0.0],
      ];

      for (const vel of calmProbes) {
        const out64 = evaluateDeflectionFP64(vel, { elevation: 2000, gradient: [1.0, 1.0] });
        const out32 = evaluateDeflectionFP32(vel, { elevation: 2000, gradient: [1.0, 1.0] });

        expect(Math.abs(out64[0])).toBe(0);
        expect(Math.abs(out64[1])).toBe(0);
        expect(Math.abs(out32[0])).toBe(0);
        expect(Math.abs(out32[1])).toBe(0);
        expect(Number.isNaN(out64[0])).toBe(false);
        expect(Number.isNaN(out32[0])).toBe(false);
      }
    });

    it('CHALLENGE-M2-11: Subnormal and near-zero calm air (||u|| in [1e-30, 1e-7]) handles select cutoff cleanly', () => {
      const subnormalProbes = [1e-7, 1e-10, 1e-15, 1e-20, 1e-30];

      for (const mag of subnormalProbes) {
        const rawVel: [number, number] = [mag, mag];
        const out64 = evaluateDeflectionFP64(rawVel, { elevation: 2000, gradient: [1.0, 1.0] });
        const out32 = evaluateDeflectionFP32(rawVel, { elevation: 2000, gradient: [1.0, 1.0] });

        expect(Number.isFinite(out64[0])).toBe(true);
        expect(Number.isFinite(out64[1])).toBe(true);
        expect(Number.isFinite(out32[0])).toBe(true);
        expect(Number.isFinite(out32[1])).toBe(true);

        const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
        const outSpeed = Math.hypot(out64[0], out64[1]);
        // For subnormal speeds below 1e-5, speed deviation is trivially bounded by speed magnitude
        expect(Math.abs(outSpeed - rawSpeed)).toBeLessThan(1e-5);
      }
    });

    it('CHALLENGE-M2-12: Near-zero slope gradients (||grad h|| -> 0) returns unattenuated velocity', () => {
      const zeroGradProbes: [number, number][] = [
        [0.0, 0.0],
        [1e-6, 1e-6],
        [1e-10, 1e-10],
        [1e-15, 1e-15],
        [1e-30, 1e-30],
      ];

      const rawVel: [number, number] = [15.0, -20.0];

      for (const grad of zeroGradProbes) {
        const out64 = evaluateDeflectionFP64(rawVel, { elevation: 2000, gradient: grad });
        const out32 = evaluateDeflectionFP32(rawVel, { elevation: 2000, gradient: grad });

        expect(Number.isFinite(out64[0])).toBe(true);
        expect(Number.isFinite(out32[0])).toBe(true);
        expect(out64[0]).toBe(rawVel[0]);
        expect(out64[1]).toBe(rawVel[1]);
      }
    });

    it('CHALLENGE-M2-13: Extreme vertical cliffs (||grad h|| in [1e2, 1e15]) preserves finite output and speed conservation', () => {
      const cliffProbes = [1e2, 1e4, 1e6, 1e9, 1e12, 1e15];
      const rawVel: [number, number] = [12.0, 16.0]; // speed = 20 m/s

      for (const cliff of cliffProbes) {
        // Oblique cliff at 45 degrees
        const grad: [number, number] = [cliff / Math.SQRT2, cliff / Math.SQRT2];
        const out64 = evaluateDeflectionFP64(rawVel, { elevation: 4000, gradient: grad });
        const out32 = evaluateDeflectionFP32(rawVel, { elevation: 4000, gradient: grad });

        expect(Number.isFinite(out64[0])).toBe(true);
        expect(Number.isFinite(out64[1])).toBe(true);
        expect(Number.isFinite(out32[0])).toBe(true);
        expect(Number.isFinite(out32[1])).toBe(true);

        const speed64 = Math.hypot(out64[0], out64[1]);
        const speed32 = Math.hypot(out32[0], out32[1]);
        expect(Math.abs(speed64 - 20.0)).toBeLessThan(1e-5);
        expect(Math.abs(speed32 - 20.0)).toBeLessThan(1e-5);
      }
    });

    it('CHALLENGE-M2-14: Sea level (h = 0) and submarine bathymetry (h < 0) experience zero barrier deflection', () => {
      const rawVel: [number, number] = [20.0, 10.0];
      const steepGrad: [number, number] = [1.5, 1.5];

      // Exact sea level
      const seaLevelOut = evaluateDeflectionFP64(rawVel, { elevation: 0.0, gradient: steepGrad });
      expect(seaLevelOut[0]).toBe(rawVel[0]);
      expect(seaLevelOut[1]).toBe(rawVel[1]);

      // Submarine trench (Mariana Trench -10,924m)
      const trenchOut = evaluateDeflectionFP64(rawVel, { elevation: -10924.0, gradient: steepGrad });
      expect(trenchOut[0]).toBe(rawVel[0]);
      expect(trenchOut[1]).toBe(rawVel[1]);
    });

    it('CHALLENGE-M2-15: Downslope and lee-slope flow (d <= 0) experiences zero deflection and zero drag', () => {
      const elevation = 3000;
      const grad: [number, number] = [1.0, 0.0]; // Slope rises East

      // Wind blowing West (descending the Western slope into the valley)
      const downslopeVel: [number, number] = [-15.0, 0.0];
      const outDown = evaluateDeflectionFP64(downslopeVel, { elevation, gradient: grad });
      expect(outDown[0]).toBe(downslopeVel[0]);
      expect(outDown[1]).toBe(downslopeVel[1]);

      // Wind blowing North (purely parallel to the ridgeline, d = 0)
      const ridgeParallelVel: [number, number] = [0.0, 20.0];
      const outParallel = evaluateDeflectionFP64(ridgeParallelVel, { elevation, gradient: grad });
      expect(outParallel[0]).toBe(ridgeParallelVel[0]);
      expect(outParallel[1]).toBe(ridgeParallelVel[1]);
    });

    it('CHALLENGE-M2-16: Jet Stream Stratum (isJet = true) completely bypasses surface barrier deflection', () => {
      const rawVel: [number, number] = [60.0, 0.0]; // 60 m/s jet core
      const steepAlpineRidge: TerrainInput = {
        elevation: 4807, // Mont Blanc summit
        gradient: [1.2, 1.2], // Oblique Alpine ridge
      };

      const surfaceOut = evaluateDeflectionFP64(rawVel, steepAlpineRidge, false);
      const jetOut = evaluateDeflectionFP64(rawVel, steepAlpineRidge, true);

      // Surface wind is deflected obliquely around the ridge
      expect(surfaceOut[0]).not.toBe(rawVel[0]);
      expect(surfaceOut[1]).not.toBe(rawVel[1]);
      // Jet stream is completely unhindered
      expect(jetOut[0]).toBe(rawVel[0]);
      expect(jetOut[1]).toBe(rawVel[1]);
    });

    it('CHALLENGE-M2-17: High subsonic hurricane speeds (u in [75, 150] m/s) maintain energy conservation', () => {
      const hurricaneVel: [number, number] = [80.0, 60.0]; // 100 m/s Category 5
      const steepRidge: TerrainInput = {
        elevation: 3500,
        gradient: [1.2, 0.8],
      };

      const out64 = evaluateDeflectionFP64(hurricaneVel, steepRidge);
      const out32 = evaluateDeflectionFP32(hurricaneVel, steepRidge);

      const spd64 = Math.hypot(out64[0], out64[1]);
      const spd32 = Math.hypot(out32[0], out32[1]);

      expect(Math.abs(spd64 - 100.0)).toBeLessThan(1e-5);
      expect(Math.abs(spd32 - 100.0)).toBeLessThan(1e-5);
    });

    it('CHALLENGE-M2-18: Mathematical singularity probe: ||grad h|| = Infinity and NaN gradient safely fallback', () => {
      const rawVel: [number, number] = [18.0, -24.0]; // 30 m/s
      const infGradRidge: TerrainInput = {
        elevation: 2000,
        gradient: [Infinity, Infinity],
      };
      const nanGradRidge: TerrainInput = {
        elevation: 2000,
        gradient: [NaN, NaN],
      };

      const infOut = evaluateDeflectionFP64(rawVel, infGradRidge);
      const nanOut = evaluateDeflectionFP64(rawVel, nanGradRidge);

      // Falls back cleanly to rawVel without crash or unbounded divergence
      expect(infOut[0]).toBe(rawVel[0]);
      expect(infOut[1]).toBe(rawVel[1]);
      expect(nanOut[0]).toBe(rawVel[0]);
      expect(nanOut[1]).toBe(rawVel[1]);
    });

    it('CHALLENGE-M2-19: Head-on collision (theta = 0) preserves speed and direction without divergence', () => {
      const speed = 30.0;
      const rawVel: [number, number] = [speed, 0.0]; // Wind East
      const headOnRidge: TerrainInput = {
        elevation: 2500,
        gradient: [1.5, 0.0], // Slope rises East
      };

      const out64 = evaluateDeflectionFP64(rawVel, headOnRidge);
      const out32 = evaluateDeflectionFP32(rawVel, headOnRidge);

      // Speed is strictly conserved
      expect(Math.abs(Math.hypot(out64[0], out64[1]) - speed)).toBeLessThan(1e-5);
      expect(Math.abs(Math.hypot(out32[0], out32[1]) - speed)).toBeLessThan(1e-5);
      // Direction remains along normal since tangential component is zero
      expect(out64[0]).toBeCloseTo(speed, 5);
      expect(out64[1]).toBeCloseTo(0.0, 5);
    });

    it('CHALLENGE-M2-20: Tangential grazing flow (theta = pi/2, d = 0) experiences zero deflection and zero drag', () => {
      const speed = 30.0;
      const rawVel: [number, number] = [0.0, speed]; // Wind North
      const ridge: TerrainInput = {
        elevation: 2500,
        gradient: [1.5, 0.0], // Slope rises East
      };

      const out64 = evaluateDeflectionFP64(rawVel, ridge);
      expect(out64[0]).toBe(0.0);
      expect(out64[1]).toBe(speed);
      expect(Math.hypot(out64[0], out64[1])).toBe(speed);
    });

    it('CHALLENGE-M2-21: Barrier Jet Effect: Oblique impact (theta = 45 deg) accelerates tangential along-barrier flow', () => {
      const speed = 20.0;
      // 45 degree impact: normal component un = speed / sqrt(2), tangential ut = speed / sqrt(2)
      const rawVel: [number, number] = [speed / Math.SQRT2, speed / Math.SQRT2];
      const ridge: TerrainInput = {
        elevation: 2500,
        gradient: [1.0, 0.0], // Slope rises East (normal is +X, along-barrier tangent is +Y)
      };

      const out = evaluateDeflectionFP64(rawVel, ridge);

      const unRaw = rawVel[0];
      const utRaw = rawVel[1];
      const unFinal = out[0];
      const utFinal = out[1];

      // Penetrating normal flow is reduced
      expect(unFinal).toBeLessThan(unRaw);
      // Along-barrier tangential flow is accelerated (barrier jet)
      expect(utFinal).toBeGreaterThan(utRaw);
      // Total speed is conserved
      const finalSpeed = Math.hypot(out[0], out[1]);
      expect(Math.abs(finalSpeed - speed)).toBeLessThan(1e-5);
    });
  });
});
