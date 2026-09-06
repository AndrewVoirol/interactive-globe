import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

/**
 * Adversarial Challenger M3 Suite: Solar Terminator & Planetary Optics Stress Test
 *
 * Empirical validation of Features F28 (NASA Draping) and F29 (Celestial Solar Terminator).
 * Focus areas:
 * 1. Solar Light Direction: Unit vector normalization across 10,000 randomized (azimuth, altitude) pairs and pole singularities.
 * 2. Solar Terminator Transitions: Subsolar (cosSun = 1.0), antipolar (cosSun = -1.0), and horizon (cosSun = 0.0) states.
 * 3. C1 Continuity: Numerical differentiability and zero step popping across twilight envelope [-0.08, +0.08].
 * 4. UV Bounds & Seam Closure: Mapping across lat [-90, 90] and lon [-180, 180], mesh grid bounds, and antimeridian closure.
 * 5. Architectural & Shader Invariants: WGSL shader bindings and engine sampler configuration.
 */

describe('Adversarial Challenger M3: Solar Terminator & Planetary Optics Pipeline', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const shaderPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');
  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');

  // Ground truth mathematical implementations matching WGSL crust_hydrosphere.wgsl lines 60-69 and 771-785
  function computeSunLightDir(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
    const radAz = (azimuthDeg * Math.PI) / 180.0;
    const radAlt = (altitudeDeg * Math.PI) / 180.0;
    const cosAlt = Math.cos(radAlt);
    const x = Math.sin(radAz) * cosAlt;
    const y = Math.cos(radAz) * cosAlt;
    const z = Math.sin(radAlt);
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len];
  }

  // Emulate IEEE 754 32-bit floating point precision (f32 in WGSL)
  function computeSunLightDirF32(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
    const f = Math.fround;
    const PI_F = f(3.14159265358979323846);
    const radAz = f(f(azimuthDeg) * f(PI_F / 180.0));
    const radAlt = f(f(altitudeDeg) * f(PI_F / 180.0));
    const cosAlt = f(Math.cos(radAlt));
    const sinAlt = f(Math.sin(radAlt));
    const sinAz = f(Math.sin(radAz));
    const cosAz = f(Math.cos(radAz));
    const x = f(sinAz * cosAlt);
    const y = f(cosAz * cosAlt);
    const z = sinAlt;
    const len = f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z))));
    return [f(x / len), f(y / len), f(z / len)];
  }

  function evaluateShaderOptics(cosSun: number, dayColor = [0.8, 0.8, 0.8], nightColor = [0.1, 0.1, 0.1]) {
    // WGSL lines 774-785:
    // let dayWeight = smoothstep(-0.08, 0.08, cosSun);
    const edge0 = -0.08;
    const edge1 = 0.08;
    const t = Math.max(0.0, Math.min(1.0, (cosSun - edge0) / (edge1 - edge0)));
    const dayWeight = t * t * (3.0 - 2.0 * t);
    const nightWeight = 1.0 - dayWeight;

    const directIllum = 0.10 + 0.90 * Math.max(0.0, cosSun);
    const dayLit = dayColor.map(c => c * directIllum);
    const nightLit = nightColor.map(c => c * (nightWeight * 1.8));

    const inTwilight = Math.abs(cosSun) < 0.08;
    const twilightBand = inTwilight ? Math.pow(1.0 - Math.abs(cosSun) / 0.08, 2.0) : 0.0;
    const twilightColor = [1.0 * twilightBand * 0.35, 0.44 * twilightBand * 0.35, 0.16 * twilightBand * 0.35];

    const finalCrust = [
      dayLit[0] * dayWeight + nightLit[0] + twilightColor[0],
      dayLit[1] * dayWeight + nightLit[1] + twilightColor[1],
      dayLit[2] * dayWeight + nightLit[2] + twilightColor[2],
    ];

    return { dayWeight, nightWeight, directIllum, twilightBand, finalCrust };
  }

  // --------------------------------------------------------------------------
  // 1. WGSL & WebGPUEngine Source Contract Verification
  // --------------------------------------------------------------------------
  describe('Part 1: Shader & Engine Architectural Bindings', () => {
    it('M3-ADV-01: verifies @group(0) @binding(3) and @binding(4) declarations in crust_hydrosphere.wgsl', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');
      expect(shaderSrc).toContain('@group(0) @binding(3) var u_orbitalTextures: texture_2d_array<f32>;');
      expect(shaderSrc).toContain('@group(0) @binding(4) var u_orbitalSampler: sampler;');
      expect(shaderSrc).toContain('fn computeSunLightDir(azimuthDeg: f32, altitudeDeg: f32) -> vec3<f32>');
      expect(shaderSrc).toContain('smoothstep(-0.08, 0.08, cosSun)');
      expect(shaderSrc).toContain('pow(1.0 - abs(cosSun) / 0.08, 2.0)');
    });

    it('M3-ADV-02: verifies WebGPUEngine orbitalSampler configuration and ingestion pipeline', () => {
      const engineSrc = fs.readFileSync(enginePath, 'utf8');
      expect(engineSrc).toContain("label: 'orbital_sampler'");
      expect(engineSrc).toContain("addressModeU: 'repeat'");
      expect(engineSrc).toContain("addressModeV: 'clamp-to-edge'");
      expect(engineSrc).toContain('loadOrbitalTextures(');
      expect(engineSrc).toContain('copyExternalImageToTexture(');
      expect(engineSrc).toContain("dimension: '2d-array'");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Solar Light Direction: 10,000 Random Samples + Singularity Stress
  // --------------------------------------------------------------------------
  describe('Part 2: Solar Light Direction Vector Normalization (10,000 Samples)', () => {
    it('M3-ADV-03: evaluates 10,000 randomized uniform azimuth [0, 360] and altitude [-90, 90] angles', () => {
      let nonFiniteCount = 0;
      let nanCount = 0;
      let maxLenDeviation = 0;

      // Seed pseudo-random generator deterministically (LCG)
      let seed = 133742;
      function nextRandom() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      const sampleCount = 10000;
      for (let i = 0; i < sampleCount; i++) {
        const az = nextRandom() * 360.0;
        const alt = -90.0 + nextRandom() * 180.0;

        const [x, y, z] = computeSunLightDir(az, alt);

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          nonFiniteCount++;
        }
        if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
          nanCount++;
        }

        const len = Math.hypot(x, y, z);
        const dev = Math.abs(len - 1.0);
        if (dev > maxLenDeviation) {
          maxLenDeviation = dev;
        }

        expect(len).toBeCloseTo(1.0, 5);
      }

      expect(nanCount).toBe(0);
      expect(nonFiniteCount).toBe(0);
      expect(maxLenDeviation).toBeLessThan(1e-6);
    });

    it('M3-ADV-04: stress-tests pole singularities (altitude = +/- 90 deg) and boundary angles in FP32', () => {
      const poleAzimuths = [0, 30, 45, 90, 135, 180, 225, 270, 315, 360, -90, 720];

      // North Pole tests: altitude = +90 deg -> light dir must be strictly along +Z (0, 0, 1)
      for (const az of poleAzimuths) {
        const [x, y, z] = computeSunLightDirF32(az, 90.0);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);
        expect(Math.abs(x)).toBeLessThan(1e-5);
        expect(Math.abs(y)).toBeLessThan(1e-5);
        expect(z).toBeCloseTo(1.0, 5);
        const len = Math.hypot(x, y, z);
        expect(len).toBeCloseTo(1.0, 5);
      }

      // South Pole tests: altitude = -90 deg -> light dir must be strictly along -Z (0, 0, -1)
      for (const az of poleAzimuths) {
        const [x, y, z] = computeSunLightDirF32(az, -90.0);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);
        expect(Math.abs(x)).toBeLessThan(1e-5);
        expect(Math.abs(y)).toBeLessThan(1e-5);
        expect(z).toBeCloseTo(-1.0, 5);
        const len = Math.hypot(x, y, z);
        expect(len).toBeCloseTo(1.0, 5);
      }

      // Near-pole epsilon tests (+/- 89.999999 deg)
      const nearPoles = [89.9999, -89.9999, 89.999999, -89.999999];
      for (const alt of nearPoles) {
        const [x, y, z] = computeSunLightDirF32(45.0, alt);
        const len = Math.hypot(x, y, z);
        expect(len).toBeCloseTo(1.0, 4);
        expect(Number.isNaN(len)).toBe(false);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Solar Terminator Transition: Subsolar, Antipolar, Horizon
  // --------------------------------------------------------------------------
  describe('Part 3: Solar Terminator Critical Regimes', () => {
    it('M3-ADV-05: verifies high-noon subsolar point (cosSun = 1.0) emits pure daylight with zero night or twilight', () => {
      const dayColor = [0.75, 0.65, 0.55];
      const nightColor = [0.90, 0.85, 0.40];
      const res = evaluateShaderOptics(1.0, dayColor, nightColor);

      expect(res.dayWeight).toBe(1.0);
      expect(res.nightWeight).toBe(0.0);
      expect(res.directIllum).toBeCloseTo(1.0, 6);
      expect(res.twilightBand).toBe(0.0);

      // finalCrust = dayColor * directIllum * dayWeight + nightLit(0) + twilightColor(0)
      expect(res.finalCrust[0]).toBeCloseTo(dayColor[0], 5);
      expect(res.finalCrust[1]).toBeCloseTo(dayColor[1], 5);
      expect(res.finalCrust[2]).toBeCloseTo(dayColor[2], 5);
    });

    it('M3-ADV-06: verifies antipolar nadir (cosSun = -1.0) emits 100% night city lights with zero daylight or twilight', () => {
      const dayColor = [0.75, 0.65, 0.55];
      const nightColor = [0.50, 0.40, 0.20];
      const res = evaluateShaderOptics(-1.0, dayColor, nightColor);

      expect(res.dayWeight).toBe(0.0);
      expect(res.nightWeight).toBe(1.0);
      expect(res.directIllum).toBeCloseTo(0.10, 6); // Ambient floor
      expect(res.twilightBand).toBe(0.0);

      // finalCrust = nightColor * (1.0 * 1.8)
      expect(res.finalCrust[0]).toBeCloseTo(nightColor[0] * 1.8, 5);
      expect(res.finalCrust[1]).toBeCloseTo(nightColor[1] * 1.8, 5);
      expect(res.finalCrust[2]).toBeCloseTo(nightColor[2] * 1.8, 5);
    });

    it('M3-ADV-07: verifies exact horizon crossing (cosSun = 0.0) yields peak twilight scattering and 50/50 day-night balance', () => {
      const dayColor = [0.5, 0.5, 0.5];
      const nightColor = [0.5, 0.5, 0.5];
      const res = evaluateShaderOptics(0.0, dayColor, nightColor);

      expect(res.dayWeight).toBeCloseTo(0.5, 6);
      expect(res.nightWeight).toBeCloseTo(0.5, 6);
      expect(res.twilightBand).toBeCloseTo(1.0, 6); // Global peak

      // Twilight color: vec3(1.0, 0.44, 0.16) * (1.0 * 0.35)
      const expectedTwR = 1.0 * 0.35;
      const expectedTwG = 0.44 * 0.35;
      const expectedTwB = 0.16 * 0.35;

      // Verify twilight is strictly symmetric around cosSun = 0.0
      const testDeltas = [0.01, 0.02, 0.04, 0.06, 0.079];
      for (const delta of testDeltas) {
        const posRes = evaluateShaderOptics(+delta);
        const negRes = evaluateShaderOptics(-delta);
        expect(posRes.twilightBand).toBeCloseTo(negRes.twilightBand, 6);
        expect(posRes.twilightBand).toBeLessThan(1.0);
        expect(posRes.twilightBand).toBeGreaterThan(0.0);
      }
    });

    it('M3-ADV-08: verifies strict monotonicity of day/night weights and zero twilight outside [-0.08, +0.08]', () => {
      const cosSunValues = [-1.0, -0.5, -0.1, -0.08001, 0.08001, 0.1, 0.5, 1.0];
      for (const cosSun of cosSunValues) {
        const res = evaluateShaderOptics(cosSun);
        expect(res.dayWeight + res.nightWeight).toBeCloseTo(1.0, 6);
        if (Math.abs(cosSun) >= 0.08) {
          expect(res.twilightBand).toBe(0.0);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. C1 Continuity Across Twilight Envelope [-0.08, +0.08]
  // --------------------------------------------------------------------------
  describe('Part 4: C1 Continuity and Zero Step Popping Analysis', () => {
    it('M3-ADV-09: verifies bounded numerical derivatives (zero step popping) across 4,000 fine-grid samples', () => {
      const step = 0.0001; // Fine grid across [-0.20, +0.20]
      const start = -0.20;
      const end = 0.20;

      let prevDayWeight = evaluateShaderOptics(start).dayWeight;
      let maxDayWeightDeriv = 0;
      let maxTwilightBandDeriv = 0;

      for (let x = start + step; x <= end; x += step) {
        const { dayWeight, twilightBand } = evaluateShaderOptics(x);

        // Value continuity check: no jump greater than 0.002 per 0.0001 step
        const deltaDay = dayWeight - prevDayWeight;
        expect(deltaDay).toBeGreaterThanOrEqual(-1e-12); // Monotonic non-decreasing
        expect(deltaDay).toBeLessThan(0.002);

        const derivDay = deltaDay / step;
        if (derivDay > maxDayWeightDeriv) {
          maxDayWeightDeriv = derivDay;
        }

        prevDayWeight = dayWeight;
      }

      // Theoretical maximum slope of smoothstep(x, -0.08, 0.08):
      // du/dx = 1 / 0.16 = 6.25. S'(u) max at u=0.5 is 6 * 0.5 * (1 - 0.5) = 1.5.
      // Maximum slope = 6.25 * 1.5 = 9.375.
      expect(maxDayWeightDeriv).toBeLessThanOrEqual(9.38);
      expect(maxDayWeightDeriv).toBeGreaterThan(9.30);
    });

    it('M3-ADV-10: verifies continuous boundary derivatives at x = -0.08 and x = +0.08', () => {
      const eps = 1e-5;

      // Check left boundary x = -0.08:
      // Approaching from outside (x = -0.08 - eps): derivative is 0
      // Approaching from inside (x = -0.08 + eps): derivative must approach 0
      const dayWeightAtLeftBound = evaluateShaderOptics(-0.08).dayWeight;
      const dayWeightInsideLeft = evaluateShaderOptics(-0.08 + eps).dayWeight;
      const leftDerivInside = (dayWeightInsideLeft - dayWeightAtLeftBound) / eps;
      expect(leftDerivInside).toBeLessThan(0.01); // Smooth transition to 0

      // Check right boundary x = +0.08:
      // Approaching from inside (x = 0.08 - eps): derivative must approach 0
      const dayWeightAtRightBound = evaluateShaderOptics(0.08).dayWeight;
      const dayWeightInsideRight = evaluateShaderOptics(0.08 - eps).dayWeight;
      const rightDerivInside = (dayWeightAtRightBound - dayWeightInsideRight) / eps;
      expect(rightDerivInside).toBeLessThan(0.01); // Smooth transition to 0

      // Twilight band boundary derivatives at +/- 0.08:
      // d/dx [(1 - x/0.08)^2] = -2/0.08 * (1 - x/0.08) -> 0 as x -> 0.08
      const twAtRightBound = evaluateShaderOptics(0.08).twilightBand;
      const twInsideRight = evaluateShaderOptics(0.08 - eps).twilightBand;
      const twRightDeriv = (twInsideRight - twAtRightBound) / eps;
      expect(twRightDeriv).toBeLessThan(0.01);
    });

    it('M3-ADV-11: verifies final composite color has zero step discontinuity across the entire solar envelope', () => {
      const eps = 1e-4;
      for (let cosSun = -0.15; cosSun <= 0.15; cosSun += 0.005) {
        const c1 = evaluateShaderOptics(cosSun - eps).finalCrust;
        const c2 = evaluateShaderOptics(cosSun + eps).finalCrust;
        const colorDiff = Math.hypot(c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]);
        // Continuous transition: difference over 2*eps must be proportional to 2*eps
        expect(colorDiff).toBeLessThan(0.05);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. UV Bounds: Lat [-90, 90] and Lon [-180, 180] Mapping & Mesh Verification
  // --------------------------------------------------------------------------
  describe('Part 5: UV Coordinates & Spherical Mesh Texture Boundary Bounds', () => {
    it('M3-ADV-12: verifies 100,000 randomized (lon, lat) pairs map strictly to [0, 1] texture coordinates', () => {
      let seed = 987654;
      function nextRandom() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      const sampleCount = 100000;
      let minU = 1.0;
      let maxU = 0.0;
      let minV = 1.0;
      let maxV = 0.0;

      for (let i = 0; i < sampleCount; i++) {
        const lon = -180.0 + nextRandom() * 360.0;
        const lat = -90.0 + nextRandom() * 180.0;

        const u = lon / 360.0 + 0.5;
        const v = 0.5 - lat / 180.0;

        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;

        expect(u).toBeGreaterThanOrEqual(0.0);
        expect(u).toBeLessThanOrEqual(1.0);
        expect(v).toBeGreaterThanOrEqual(0.0);
        expect(v).toBeLessThanOrEqual(1.0);
      }

      expect(minU).toBeCloseTo(0.0, 1);
      expect(maxU).toBeCloseTo(1.0, 1);
      expect(minV).toBeCloseTo(0.0, 1);
      expect(maxV).toBeCloseTo(1.0, 1);
    });

    it('M3-ADV-13: verifies corner coordinates map with zero clamp artifacts', () => {
      const corners = [
        { lon: -180, lat: 90, expectedU: 0.0, expectedV: 0.0 },
        { lon: 180, lat: 90, expectedU: 1.0, expectedV: 0.0 },
        { lon: -180, lat: -90, expectedU: 0.0, expectedV: 1.0 },
        { lon: 180, lat: -90, expectedU: 1.0, expectedV: 1.0 },
        { lon: 0, lat: 0, expectedU: 0.5, expectedV: 0.5 },
      ];

      for (const { lon, lat, expectedU, expectedV } of corners) {
        const u = lon / 360.0 + 0.5;
        const v = 0.5 - lat / 180.0;
        expect(u).toBe(expectedU);
        expect(v).toBe(expectedV);
      }
    });

    it('M3-ADV-14: evaluates WebGPUEngine generateSphereGrid mesh vertices for UV bounds and antimeridian seam closure', () => {
      const engine = new WebGPUEngine();
      const latSegments = 64;
      const lonSegments = 128;
      const mesh = engine.generateSphereGrid(latSegments, lonSegments);

      const floatsPerVertex = 12;
      const vertsPerSurface = (latSegments + 1) * (lonSegments + 1);
      const totalVertices = vertsPerSurface * 2;

      expect(mesh.vertices.length).toBe(totalVertices * floatsPerVertex);

      // Verify every single vertex has UV in [0, 1]
      for (let i = 0; i < totalVertices; i++) {
        const offset = i * floatsPerVertex;
        const u = mesh.vertices[offset + 3];
        const v = mesh.vertices[offset + 4];

        expect(Number.isFinite(u)).toBe(true);
        expect(Number.isFinite(v)).toBe(true);
        expect(u).toBeGreaterThanOrEqual(0.0 - 1e-6);
        expect(u).toBeLessThanOrEqual(1.0 + 1e-6);
        expect(v).toBeGreaterThanOrEqual(0.0 - 1e-6);
        expect(v).toBeLessThanOrEqual(1.0 + 1e-6);
      }

      // Verify antimeridian seam closure:
      // Vertices at lon=0 (u=0.0) and lon=lonSegments (u=1.0) must share exact same Cartesian (x, y, z)
      for (let surface = 0; surface < 2; surface++) {
        const baseOffset = surface * vertsPerSurface;
        for (let lat = 0; lat <= latSegments; lat++) {
          const idx0 = baseOffset + lat * (lonSegments + 1) + 0;
          const idxEnd = baseOffset + lat * (lonSegments + 1) + lonSegments;

          const off0 = idx0 * floatsPerVertex;
          const offEnd = idxEnd * floatsPerVertex;

          const x0 = mesh.vertices[off0 + 0];
          const y0 = mesh.vertices[off0 + 1];
          const z0 = mesh.vertices[off0 + 2];
          const u0 = mesh.vertices[off0 + 3];

          const xEnd = mesh.vertices[offEnd + 0];
          const yEnd = mesh.vertices[offEnd + 1];
          const zEnd = mesh.vertices[offEnd + 2];
          const uEnd = mesh.vertices[offEnd + 3];

          expect(u0).toBeCloseTo(0.0, 6);
          expect(uEnd).toBeCloseTo(1.0, 6);

          // 3D coordinates must be identical with zero seam tearing
          expect(x0).toBeCloseTo(xEnd, 5);
          expect(y0).toBeCloseTo(yEnd, 5);
          expect(z0).toBeCloseTo(zEnd, 5);
        }
      }
    });
  });
});
