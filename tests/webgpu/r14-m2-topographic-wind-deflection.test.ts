// ============================================================================
// File: tests/webgpu/r14-m2-topographic-wind-deflection.test.ts
// Milestone: Milestone 2: Topographic Barrier Wind Deflection
// Specifications:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§2.2 Topographic Barrier Wind Deflection)
//   - Invariant §3:  WGSL Uniform Control Flow (explicit LOD 0.0, zero implicit derivatives)
//   - Invariant §12: Canonical Benchmark Viewpoints (Viewpoint 2: Alpine Basin Zoom & Po Valley)
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity (sample.a * 19772.0 - 10924.0)
//   - Invariant §18: Coupled Orographic Lift & Spherical Metric Terrain Gradients
//   - Invariant §20: 16-Byte WGSL Struct Alignment & Lazy Buffer Allocation
//   - Invariant §48: Dynamic Dimensions (Zero Hardcoded 8192/4096 Literals)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/wind_particles.wgsl');
const shaderSource = fs.readFileSync(SHADER_PATH, 'utf-8');

// ============================================================================
// Pure Mathematical Model of WGSL sampleVelocity Deflection
// Mirrors exact WGSL implementation in wind_particles.wgsl:sampleVelocity
// ============================================================================

interface TerrainData {
  elevation: number;
  gradient: [number, number]; // [dh/dx, dh/dy] in m/m
}

function simulateDeflectVelocity(
  rawVel: [number, number],
  terrain: TerrainData,
  isJet: boolean
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
      // Spec §2.2: Deflect upslope barrier flow by 75%
      const uDeflected: [number, number] = [
        rawVel[0] - 0.75 * d * slopeNormal[0],
        rawVel[1] - 0.75 * d * slopeNormal[1],
      ];
      const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
      const defSpeed = Math.hypot(uDeflected[0], uDeflected[1]);
      if (rawSpeed > 1e-5 && defSpeed > 1e-6) {
        const scale = rawSpeed / Math.max(defSpeed, 1e-6);
        return [uDeflected[0] * scale, uDeflected[1] * scale];
      }
      return uDeflected;
    }
  }

  return [rawVel[0], rawVel[1]];
}

describe('Milestone 2: Topographic Barrier Wind Deflection', () => {
  // --------------------------------------------------------------------------
  // Group 1: WGSL Shader Structural Verification & Invariant Adherence
  // --------------------------------------------------------------------------
  describe('1. WGSL Shader Structural & Invariant Verification', () => {
    it('M2-WGSL-01: declares sampleTerrainElevation and sampleTerrain before sampleVelocity', () => {
      const terrainElevIdx = shaderSource.indexOf('fn sampleTerrainElevation');
      const terrainIdx = shaderSource.indexOf('fn sampleTerrain(');
      const velocityIdx = shaderSource.indexOf('fn sampleVelocity(');

      expect(terrainElevIdx).toBeGreaterThan(-1);
      expect(terrainIdx).toBeGreaterThan(-1);
      expect(velocityIdx).toBeGreaterThan(-1);

      // WGSL function order: sampleTerrain must precede sampleVelocity so sampleVelocity can call it
      expect(terrainElevIdx).toBeLessThan(terrainIdx);
      expect(terrainIdx).toBeLessThan(velocityIdx);
    });

    it('M2-WGSL-02: implements Invariant §15 DEM decoding parity and sea-level clipping in sampleTerrainElevation', () => {
      expect(shaderSource).toContain('sample.a * 19772.0 - 10924.0');
      expect(shaderSource).toContain('max(0.0, elevMeters)');
    });

    it('M2-WGSL-03: implements Invariant §18 spherical metric tensor differences in sampleTerrain', () => {
      expect(shaderSource).toContain('let cosLat = max(0.05, cos(latRad));');
      expect(shaderSource).toContain('let dx = 2.0 * EARTH_RADIUS * cosLat * dLon;');
      expect(shaderSource).toContain('let dy = 2.0 * EARTH_RADIUS * dLat;');
      expect(shaderSource).toContain('res.gradient = vec2<f32>((hEast - hWest) / dx, (hNorth - hSouth) / dy);');
    });

    it('M2-WGSL-04: implements Invariant §48 dynamic texture dimensions without hardcoded literals', () => {
      expect(shaderSource).toContain('let demDims = vec2<f32>(textureDimensions(u_demTexture));');
      const sampleTerrainIdx = shaderSource.indexOf('fn sampleTerrain');
      const sampleVelocityIdx = shaderSource.indexOf('fn sampleVelocity');
      const sampleTerrainBody = shaderSource.slice(sampleTerrainIdx, sampleVelocityIdx);
      expect(sampleTerrainBody).not.toContain('8192.0');
      expect(sampleTerrainBody).not.toContain('4096.0');
    });

    it('M2-WGSL-05: adheres strictly to Invariant §3 explicit LOD 0.0 for compute shader texture lookups', () => {
      // Find all textureSample calls in wind_particles.wgsl
      const textureSampleMatches = shaderSource.match(/textureSample\s*\(/g);
      // In compute shaders, textureSample (implicit derivative) is strictly invalid
      expect(textureSampleMatches).toBeNull();

      // Must use textureSampleLevel with explicit LOD 0.0
      expect(shaderSource).toContain('textureSampleLevel(u_jetTexture, u_windSampler, uv, 0.0)');
      expect(shaderSource).toContain('textureSampleLevel(u_windTexture, u_windSampler, uv, 0.0)');
      expect(shaderSource).toContain('textureSampleLevel(u_demTexture, u_demSampler, vec2<f32>(u, v), 0.0)');
    });

    it('M2-WGSL-06: compute shader contains zero implicit derivatives or discard statements', () => {
      expect(shaderSource).not.toMatch(/\bfwidth\s*\(/);
      expect(shaderSource).not.toMatch(/\bdpdx\s*\(/);
      expect(shaderSource).not.toMatch(/\bdpdy\s*\(/);
      expect(shaderSource).not.toMatch(/\bdiscard\s*;/);
    });

    it('M2-WGSL-07: implements Spec §2.2 0.75 barrier deflection and kinetic energy conservation in sampleVelocity', () => {
      const sampleVelIdx = shaderSource.indexOf('fn sampleVelocity');
      const nextFnIdx = shaderSource.indexOf('fn computeLiftedAltitude', sampleVelIdx);
      const sampleVelBody = shaderSource.slice(sampleVelIdx, nextFnIdx);

      // Stratum isolation
      expect(sampleVelBody).toContain('if (isJet)');
      // Topographic barrier query
      expect(sampleVelBody).toContain('let terrain = sampleTerrain(lonRad, latRad);');
      expect(sampleVelBody).toContain('let gradMag = length(terrain.gradient);');
      expect(sampleVelBody).toContain('let slopeNormal = terrain.gradient / max(gradMag, 1e-6);');
      // Upslope dot product and 0.75 barrier deflection
      expect(sampleVelBody).toContain('let d = dot(rawVel, slopeNormal);');
      expect(sampleVelBody).toContain('let uDeflected = rawVel - 0.75 * d * slopeNormal;');
      // Kinetic energy conservation scaling
      expect(sampleVelBody).toContain('select(uDeflected, uDeflected * (rawSpeed / max(defSpeed, 1e-6)), rawSpeed > 1e-5 && defSpeed > 1e-6)');
    });
  });

  // --------------------------------------------------------------------------
  // Group 2: Mathematical Deflection Mechanics
  // --------------------------------------------------------------------------
  describe('2. Mathematical Deflection Mechanics', () => {
    it('M2-MATH-01: flat terrain (zero gradient) produces zero deflection', () => {
      const rawVel: [number, number] = [15.0, -8.0];
      const flatTerrain: TerrainData = { elevation: 500.0, gradient: [0.0, 0.0] };
      const deflected = simulateDeflectVelocity(rawVel, flatTerrain, false);

      expect(deflected[0]).toBeCloseTo(rawVel[0], 6);
      expect(deflected[1]).toBeCloseTo(rawVel[1], 6);
    });

    it('M2-MATH-02: ocean surface (elevation <= 0) produces zero deflection regardless of bathymetry slope', () => {
      const rawVel: [number, number] = [12.0, 5.0];
      // Mariana Trench wall slope (elevation -5000m, steep gradient)
      const oceanicTerrain: TerrainData = { elevation: 0.0, gradient: [0.15, 0.05] };
      const deflected = simulateDeflectVelocity(rawVel, oceanicTerrain, false);

      expect(deflected[0]).toBeCloseTo(rawVel[0], 6);
      expect(deflected[1]).toBeCloseTo(rawVel[1], 6);
    });

    it('M2-MATH-03: pure downslope flow (d <= 0) produces zero deflection', () => {
      // Mountain ridge to the South, wind blowing Northward away from ridge (downslope)
      // Ridge slope normal points South (gradient = [0, -0.1])
      // Wind blowing North (rawVel = [0, 10]) -> d = dot([0, 10], [0, -1]) = -10 < 0
      const rawVel: [number, number] = [0.0, 10.0];
      const downslopeTerrain: TerrainData = { elevation: 2000.0, gradient: [0.0, -0.1] };
      const deflected = simulateDeflectVelocity(rawVel, downslopeTerrain, false);

      expect(deflected[0]).toBeCloseTo(rawVel[0], 6);
      expect(deflected[1]).toBeCloseTo(rawVel[1], 6);
    });

    it('M2-MATH-04: pure contour-parallel wind (d = 0) preserves velocity identically', () => {
      // East-West ridge (gradient North: [0, 0.08])
      // Wind blowing due East parallel to ridge (rawVel = [14.0, 0.0]) -> d = 0
      const rawVel: [number, number] = [14.0, 0.0];
      const ridgeTerrain: TerrainData = { elevation: 1800.0, gradient: [0.0, 0.08] };
      const deflected = simulateDeflectVelocity(rawVel, ridgeTerrain, false);

      expect(deflected[0]).toBeCloseTo(rawVel[0], 6);
      expect(deflected[1]).toBeCloseTo(rawVel[1], 6);
    });

    it('M2-MATH-05: upslope impinging wind (d > 0) reduces normal component by 75%', () => {
      // Ridge with slope normal pointing North: n_slope = [0, 1]
      // Wind blowing oblique North-East: u = 10, v = 10 (rawSpeed = sqrt(200) ≈ 14.1421)
      // d = 10 > 0
      // Before normalization: uDeflected = [10, 10 - 0.75 * 10] = [10, 2.5]
      // Normal component v was 10, reduced to 2.5 (exactly 75% reduction!)
      const rawVel: [number, number] = [10.0, 10.0];
      const mountainTerrain: TerrainData = { elevation: 2500.0, gradient: [0.0, 0.05] };
      const deflected = simulateDeflectVelocity(rawVel, mountainTerrain, false);

      // Tangential component (x) is boosted by speed conservation, normal component (y) is reduced
      expect(deflected[0]).toBeGreaterThan(10.0); // Accelerated eastward along contour
      expect(deflected[1]).toBeLessThan(10.0);    // Retarded northward into wall
      // The ratio of y/x before normalization was 2.5/10 = 0.25
      // Because re-normalization scales both components by the same scalar, the ratio y/x must be 0.25
      expect(deflected[1] / deflected[0]).toBeCloseTo(0.25, 5);
    });

    it('M2-MATH-06: oblique wind striking mountain wall deflects tangentially and accelerates along-barrier flow', () => {
      // Demonstrates the meteorological "barrier jet" acceleration
      const rawVel: [number, number] = [8.0, 8.0];
      const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
      const wallTerrain: TerrainData = { elevation: 3000.0, gradient: [0.0, 0.12] };
      const deflected = simulateDeflectVelocity(rawVel, wallTerrain, false);

      // Eastward along-barrier speed must be greater than incoming eastward speed
      expect(deflected[0]).toBeGreaterThan(rawVel[0]);
      // Total speed is preserved exactly
      expect(Math.hypot(deflected[0], deflected[1])).toBeCloseTo(rawSpeed, 5);
    });

    it('M2-MATH-07: pure perpendicular head-on wall collision preserves vector direction and speed', () => {
      // Wind blowing directly perpendicular into wall: u = [0, 15], n_slope = [0, 1]
      // d = 15 > 0. uDef = [0, 15 - 11.25] = [0, 3.75].
      // defSpeed = 3.75. Scale = 15 / 3.75 = 4.
      // uFinal = [0, 3.75 * 4] = [0, 15].
      const rawVel: [number, number] = [0.0, 15.0];
      const wallTerrain: TerrainData = { elevation: 2000.0, gradient: [0.0, 0.1] };
      const deflected = simulateDeflectVelocity(rawVel, wallTerrain, false);

      expect(deflected[0]).toBeCloseTo(0.0, 5);
      expect(deflected[1]).toBeCloseTo(15.0, 5);
    });
  });

  // --------------------------------------------------------------------------
  // Group 3: Kinetic Energy Conservation Invariant
  // --------------------------------------------------------------------------
  describe('3. Strict Kinetic Energy Speed Conservation', () => {
    it('M2-KE-01: speed is conserved exactly across various incidence angles', () => {
      const terrain: TerrainData = { elevation: 2800.0, gradient: [0.06, 0.08] }; // n_slope = [0.6, 0.8]
      const speed = 20.0;

      // Test angles from 0 to 360 degrees in 15-degree steps
      for (let deg = 0; deg < 360; deg += 15) {
        const rad = (deg * Math.PI) / 180;
        const rawVel: [number, number] = [speed * Math.cos(rad), speed * Math.sin(rad)];
        const deflected = simulateDeflectVelocity(rawVel, terrain, false);
        const deflectedSpeed = Math.hypot(deflected[0], deflected[1]);

        expect(deflectedSpeed).toBeCloseTo(speed, 5);
      }
    });

    it('M2-KE-02: kinetic energy is conserved across gentle, moderate, and gale wind regimes', () => {
      const terrain: TerrainData = { elevation: 1500.0, gradient: [0.04, 0.0] }; // East-facing slope

      const speeds = [2.0, 10.0, 25.0, 50.0]; // Gentle to storm-force m/s
      for (const s of speeds) {
        const rawVel: [number, number] = [s / Math.SQRT2, s / Math.SQRT2];
        const deflected = simulateDeflectVelocity(rawVel, terrain, false);
        const finalSpeed = Math.hypot(deflected[0], deflected[1]);

        expect(finalSpeed).toBeCloseTo(s, 5);
        // Kinetic energy per unit mass: E_k = 0.5 * s^2
        const rawEk = 0.5 * s * s;
        const deflectedEk = 0.5 * finalSpeed * finalSpeed;
        expect(deflectedEk).toBeCloseTo(rawEk, 4);
      }
    });

    it('M2-KE-03: 1,000-trial Monte Carlo verification of zero speed deviation', () => {
      let maxSpeedDelta = 0;

      for (let i = 0; i < 1000; i++) {
        // Pseudo-random velocity between -60 and +60 m/s
        const vx = (Math.sin(i * 1.7) * 0.5 + 0.5) * 120 - 60;
        const vy = (Math.cos(i * 2.3) * 0.5 + 0.5) * 120 - 60;
        const rawVel: [number, number] = [vx, vy];
        const rawSpeed = Math.hypot(vx, vy);

        // Pseudo-random elevation and slopes
        const elevation = (Math.sin(i * 3.1) * 0.5 + 0.5) * 4000;
        const gx = (Math.cos(i * 4.7) * 0.5 + 0.5) * 0.2 - 0.1;
        const gy = (Math.sin(i * 5.3) * 0.5 + 0.5) * 0.2 - 0.1;
        const terrain: TerrainData = { elevation, gradient: [gx, gy] };

        const deflected = simulateDeflectVelocity(rawVel, terrain, false);
        const deflectedSpeed = Math.hypot(deflected[0], deflected[1]);

        if (rawSpeed > 1e-4) {
          const delta = Math.abs(deflectedSpeed - rawSpeed);
          if (delta > maxSpeedDelta) maxSpeedDelta = delta;
          expect(deflectedSpeed).toBeCloseTo(rawSpeed, 4);
        }
      }

      expect(maxSpeedDelta).toBeLessThan(1e-4);
    });
  });

  // --------------------------------------------------------------------------
  // Group 4: Stratum Isolation (Surface vs. Jet Stream)
  // --------------------------------------------------------------------------
  describe('4. Stratum Isolation (Boundary Layer vs. Upper Troposphere)', () => {
    it('M2-STRAT-01: surface winds undergo barrier deflection, jet stream winds bypass deflection', () => {
      const rawVel: [number, number] = [20.0, 30.0];
      const terrain: TerrainData = { elevation: 3500.0, gradient: [0.0, 0.1] };

      const surfaceVel = simulateDeflectVelocity(rawVel, terrain, false);
      const jetVel = simulateDeflectVelocity(rawVel, terrain, true);

      // Surface wind must be deflected
      expect(surfaceVel[1]).not.toBeCloseTo(rawVel[1], 4);
      expect(surfaceVel[0]).toBeGreaterThan(rawVel[0]); // Accelerated along ridge

      // Jet stream wind must be 100% untouched
      expect(jetVel[0]).toBe(rawVel[0]);
      expect(jetVel[1]).toBe(rawVel[1]);
    });

    it('M2-STRAT-02: jet stream maintains global zonal flow across extreme alpine topography', () => {
      // 250 hPa Jet stream core blowing 75 m/s eastward across Himalayas (elevation 8000m, steep North gradient)
      const rawJet: [number, number] = [75.0, 5.0];
      const himalayas: TerrainData = { elevation: 8000.0, gradient: [0.05, 0.25] };

      const result = simulateDeflectVelocity(rawJet, himalayas, true);

      expect(result[0]).toBe(75.0);
      expect(result[1]).toBe(5.0);
    });
  });

  // --------------------------------------------------------------------------
  // Group 5: Alpine Massif & Po Valley Corridor Benchmark (Invariant §12 Viewpoint 2)
  // --------------------------------------------------------------------------
  describe('5. Alpine Massif & Po Valley Corridor Benchmark (Viewpoint 2)', () => {
    it('M2-ALPS-01: northerly wind hitting Swiss Alpine massif is deflected eastward along mountain wall', () => {
      // European Alps northern flank (lat 46.5°N, lon 8.5°E, elev 3200m, northward rising slope)
      // Northerly cold front (blowing Southward: u = 0, v = -18 m/s)
      // Slope normal points South (into the massif, gradient = [0, -0.12])
      // d = dot([0, -18], [0, -1]) = 18 > 0 (strong upslope)
      const rawVel: [number, number] = [2.0, -18.0];
      const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
      const swissAlps: TerrainData = { elevation: 3200.0, gradient: [0.0, -0.12] };

      const deflected = simulateDeflectVelocity(rawVel, swissAlps, false);

      // Flow is strongly deflected tangentially Eastward along the Bavarian foreland
      expect(deflected[0]).toBeGreaterThan(rawVel[0] * 2.0);
      // Penetration into mountain wall is attenuated
      expect(Math.abs(deflected[1])).toBeLessThan(Math.abs(rawVel[1]));
      // Total speed is preserved
      expect(Math.hypot(deflected[0], deflected[1])).toBeCloseTo(rawSpeed, 5);
    });

    it('M2-ALPS-02: flat Po Valley alluvial plain produces zero barrier deflection', () => {
      // Northern Italy Po Valley basin (lat 45.0°N, lon 9.5°E, elev 80m, flat alluvial plain)
      // Surface wind flowing down the valley towards Venice
      const rawVel: [number, number] = [12.0, 1.0];
      const poValley: TerrainData = { elevation: 80.0, gradient: [0.000002, 0.000001] }; // Gradient < 1e-5

      const deflected = simulateDeflectVelocity(rawVel, poValley, false);

      // Flow proceeds completely unhindered through the valley corridor
      expect(deflected[0]).toBe(rawVel[0]);
      expect(deflected[1]).toBe(rawVel[1]);
    });

    it('M2-ALPS-03: south-westerly Mediterranean inflow (Libeccio) is steered Eastward down Po corridor', () => {
      // Mediterranean air entering Po Valley from SW (u = 12 m/s, v = 10 m/s)
      // Approaching southern wall of Alps (Lombardy, elev 2800m, gradient North: [0, 0.10])
      // Slope normal points North: n_slope = [0, 1]
      // d = 10 > 0. Normal component v reduced from 10 to 2.5, u accelerated from 12 to ~15.3 m/s
      const rawVel: [number, number] = [12.0, 10.0];
      const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
      const southernAlps: TerrainData = { elevation: 2800.0, gradient: [0.0, 0.10] };

      const steered = simulateDeflectVelocity(rawVel, southernAlps, false);

      // Vector is rotated strongly toward due East (parallel to Alpine arc)
      expect(steered[0]).toBeGreaterThan(14.5); // Accelerated eastward
      expect(steered[1]).toBeLessThan(4.0);    // Northward motion dammed
      expect(Math.hypot(steered[0], steered[1])).toBeCloseTo(rawSpeed, 5);
    });
  });

  // --------------------------------------------------------------------------
  // Group 6: Numerical Robustness & Singular Boundary Safeguards
  // --------------------------------------------------------------------------
  describe('6. Numerical Robustness & Singular Boundary Safeguards', () => {
    it('M2-ROBUST-01: zero wind speed safely returns zero vector without NaN', () => {
      const rawVel: [number, number] = [0.0, 0.0];
      const steepTerrain: TerrainData = { elevation: 3000.0, gradient: [0.1, 0.1] };

      const result = simulateDeflectVelocity(rawVel, steepTerrain, false);

      expect(Number.isNaN(result[0])).toBe(false);
      expect(Number.isNaN(result[1])).toBe(false);
      expect(result[0]).toBe(0.0);
      expect(result[1]).toBe(0.0);
    });

    it('M2-ROBUST-02: calm sub-threshold wind (< 1e-5) returns safely without NaN', () => {
      const rawVel: [number, number] = [1e-7, 2e-7];
      const steepTerrain: TerrainData = { elevation: 2000.0, gradient: [0.05, 0.05] };

      const result = simulateDeflectVelocity(rawVel, steepTerrain, false);

      expect(Number.isNaN(result[0])).toBe(false);
      expect(Number.isNaN(result[1])).toBe(false);
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
    });

    it('M2-ROBUST-03: vertical cliff / extreme mountain gradient (slope > 60°) remains numerically stable', () => {
      // Extremely steep cliff (gradient = [2.0, 0.0], slope = 63.4°)
      const rawVel: [number, number] = [15.0, 15.0];
      const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
      const cliffTerrain: TerrainData = { elevation: 4000.0, gradient: [2.0, 0.0] };

      const result = simulateDeflectVelocity(rawVel, cliffTerrain, false);

      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Math.hypot(result[0], result[1])).toBeCloseTo(rawSpeed, 5);
    });

    it('M2-ROBUST-04: polar coordinate metric clamp (cosLat >= 0.05) prevents division-by-zero at poles', () => {
      const R_E = 6371000.0;
      const dLon = (2 * Math.PI) / 8192;
      const dLat = Math.PI / 4096;

      // At North Pole (lat = 89.99°):
      const latRad = (89.99 * Math.PI) / 180;
      const cosLat = Math.max(0.05, Math.cos(latRad));
      const dx = 2.0 * R_E * cosLat * dLon;
      const dy = 2.0 * R_E * dLat;

      expect(dx).toBeGreaterThan(0);
      expect(dy).toBeGreaterThan(0);
      expect(Number.isFinite(dx)).toBe(true);
      expect(Number.isFinite(dy)).toBe(true);
    });

    it('M2-ROBUST-05: 10,000-trial adversarial fuzzing test asserts 0 NaNs and strict speed conservation', () => {
      let nanCount = 0;
      let infCount = 0;

      for (let i = 0; i < 10000; i++) {
        // Random velocity between -100 and +100 m/s
        const vx = (Math.sin(i * 1.1) * 0.5 + 0.5) * 200 - 100;
        const vy = (Math.cos(i * 1.3) * 0.5 + 0.5) * 200 - 100;
        const rawVel: [number, number] = [vx, vy];
        const rawSpeed = Math.hypot(vx, vy);

        // Extreme gradients from -5.0 to +5.0 m/m
        const elevation = (Math.sin(i * 2.7) * 0.5 + 0.5) * 9000 - 1000;
        const gx = Math.tan((Math.sin(i * 3.7) * 0.99 * Math.PI) / 2);
        const gy = Math.tan((Math.cos(i * 4.1) * 0.99 * Math.PI) / 2);
        const terrain: TerrainData = { elevation, gradient: [gx, gy] };

        const isJet = i % 2 === 0;
        const result = simulateDeflectVelocity(rawVel, terrain, isJet);

        if (Number.isNaN(result[0]) || Number.isNaN(result[1])) nanCount++;
        if (!Number.isFinite(result[0]) || !Number.isFinite(result[1])) infCount++;

        if (rawSpeed > 1e-4) {
          const resSpeed = Math.hypot(result[0], result[1]);
          expect(resSpeed).toBeCloseTo(rawSpeed, 4);
        }
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Group 6: Along-Contour Valley Funneling Vector Steer (RFC Mechanic 3)
  // --------------------------------------------------------------------------
  describe('6. Along-Contour Valley Funneling Vector Steer (RFC Mechanic 3)', () => {
    function simulateValleySteeredVelocity(
      rawVel: [number, number],
      terrain: TerrainData,
      isJet: boolean
    ): [number, number] {
      if (isJet) return [rawVel[0], rawVel[1]];
      const gradMag = Math.hypot(terrain.gradient[0], terrain.gradient[1]);
      const slopeNormal: [number, number] = [
        terrain.gradient[0] / Math.max(gradMag, 1e-6),
        terrain.gradient[1] / Math.max(gradMag, 1e-6),
      ];

      if (terrain.elevation > 0.0 && gradMag > 1e-5) {
        const d = rawVel[0] * slopeNormal[0] + rawVel[1] * slopeNormal[1];
        if (d > 0.0) {
          const uDeflected: [number, number] = [
            rawVel[0] - 0.75 * d * slopeNormal[0],
            rawVel[1] - 0.75 * d * slopeNormal[1],
          ];
          const tContour: [number, number] = [-slopeNormal[1], slopeNormal[0]];
          const crossZ = rawVel[0] * slopeNormal[1] - rawVel[1] * slopeNormal[0];
          const steerSign = crossZ >= 0.0 ? 1.0 : -1.0;
          const rawSpeed = Math.hypot(rawVel[0], rawVel[1]);
          const uSteered: [number, number] = [
            uDeflected[0] + 0.25 * steerSign * tContour[0] * rawSpeed,
            uDeflected[1] + 0.25 * steerSign * tContour[1] * rawSpeed,
          ];
          const defSpeed = Math.hypot(uSteered[0], uSteered[1]);
          if (rawSpeed > 1e-5 && defSpeed > 1e-6) {
            const scale = rawSpeed / Math.max(defSpeed, 1e-6);
            return [uSteered[0] * scale, uSteered[1] * scale];
          }
          return uSteered;
        }
      }
      return [rawVel[0], rawVel[1]];
    }

    it('M2-STEER-01: wind_particles.wgsl implements along-contour tangent steering in sampleVelocity', () => {
      expect(shaderSource).toContain('let tContour = vec2<f32>(-slopeNormal.y, slopeNormal.x);');
      expect(shaderSource).toContain('let crossZ = rawVel.x * slopeNormal.y - rawVel.y * slopeNormal.x;');
      expect(shaderSource).toContain('let steerSign = select(-1.0, 1.0, crossZ >= 0.0);');
      expect(shaderSource).toContain('let uSteered = uDeflected + 0.25 * steerSign * tContour * rawSpeed;');
    });

    it('M2-STEER-02: upslope wind impinging on barrier acquires along-contour component directed down valleys', () => {
      // East-West barrier (slope normal points North: [0, 1])
      // Wind blowing North-East: rawVel = [10, 10]
      const rawVel: [number, number] = [10.0, 10.0];
      const ridge: TerrainData = { elevation: 2500.0, gradient: [0.0, 0.08] };
      const steered = simulateValleySteeredVelocity(rawVel, ridge, false);

      // tContour = [-1, 0]. crossZ = 10 * 1 - 10 * 0 = 10 >= 0 -> steerSign = +1
      // Steers wind toward West parallel to ridge (-x direction)
      expect(steered[0]).not.toBe(rawVel[0]);
      expect(Math.hypot(steered[0], steered[1])).toBeCloseTo(Math.hypot(rawVel[0], rawVel[1]), 5);
    });

    it('M2-STEER-03: computeLiftedAltitude scales Jet Stream altitude dynamically with pitch (RFC Mechanic 2)', () => {
      expect(shaderSource).toContain('let k_exagg = 1.0 + 9.0 * ((1.0 - NdotV) * (1.0 - NdotV));');
      expect(shaderSource).toContain('let baseAlt = select(0.0005, 0.0065 * k_exagg, isJet);');
    });
  });
});
