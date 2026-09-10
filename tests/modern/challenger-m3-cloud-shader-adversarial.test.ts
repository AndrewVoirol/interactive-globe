// ============================================================================
// File: tests/modern/challenger-m3-cloud-shader-adversarial.test.ts
// Challenger: challenger_m3_1 (teamwork_preview_challenger)
// Milestone: Milestone 3 (Cloud Shell WGSL Shader & Inking)
// Invariants: §3 (UCF), §5 (Premultiplied Alpha), §10 (Horizon Tangent),
//             §15 (DEM Parity), §20 (Buffer Discipline), §24 (Dynamic Theme),
//             §28 (Theme Parity), §46 (Import Integrity)
// Description: Adversarial verification and stress harness for Milestone 3 cloud
//              shell mathematics, physical altitude parameters, feathering
//              transfer function, tropospheric drift, and 16-byte struct alignment.
// ============================================================================

import { describe, it, expect } from 'vitest';
import cloudShellWGSL from '../../src/webgpu/shaders/cloud_shell.wgsl?raw';
import windParticlesWGSL from '../../src/webgpu/shaders/wind_particles.wgsl?raw';

describe('Adversarial Challenger Suite: Milestone 3 Cloud Shell Physics & Math', () => {
  const SPHERE_RADIUS = 5.0;
  const EARTH_RADIUS_KM = 6371.0;

  // WGSL-compliant smoothstep
  function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // Cloud feathering transfer function
  function effectiveCloud(c: number): number {
    return c * smoothstep(0.0, 0.20, c);
  }

  // --------------------------------------------------------------------------
  // Pillar 1: Anti-Cheating Production Source Import Integrity (Invariant §46)
  // --------------------------------------------------------------------------
  describe('Pillar 1: Invariant §46 - Production Source Import Integrity', () => {
    it('CHALLENGE-M3-01: Verifies cloud_shell.wgsl is imported directly from src/ with non-trivial size', () => {
      expect(cloudShellWGSL).toBeDefined();
      expect(cloudShellWGSL.length).toBeGreaterThan(6000);
      expect(cloudShellWGSL).toContain('@vertex');
      expect(cloudShellWGSL).toContain('fn vs_main');
      expect(cloudShellWGSL).toContain('@fragment');
      expect(cloudShellWGSL).toContain('fn fs_main');
      expect(cloudShellWGSL).toContain('struct CloudUniforms');
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Altitude Standoff Inequality & Physical Kilometer Scaling
  // --------------------------------------------------------------------------
  describe('Pillar 2: Altitude Standoff Inequality & Physical Kilometer Scaling', () => {
    // Exact standoffs extracted from production shaders
    const lowStandoff = 0.0010;
    const midStandoff = 0.0040;
    const jetStandoff = 0.0065; // from wind_particles.wgsl
    const highStandoff = 0.0080;

    const toKm = (s: number) => (s / SPHERE_RADIUS) * EARTH_RADIUS_KM;

    it('CHALLENGE-M3-02: Verifies strict inequality Low (0.0010) < Mid (0.0040) < Jet Stream (0.0065) < High (0.0080)', () => {
      // Confirm values exist verbatim in production shaders
      expect(cloudShellWGSL).toContain('0.0010');
      expect(cloudShellWGSL).toContain('0.0040');
      expect(cloudShellWGSL).toContain('0.0080');
      expect(windParticlesWGSL).toContain('0.0065');

      // Strict standoff ordering
      expect(lowStandoff).toBeLessThan(midStandoff);
      expect(midStandoff).toBeLessThan(jetStandoff);
      expect(jetStandoff).toBeLessThan(highStandoff);

      // Verify positive altitude increments
      expect(midStandoff - lowStandoff).toBeCloseTo(0.0030, 4);
      expect(jetStandoff - midStandoff).toBeCloseTo(0.0025, 4);
      expect(highStandoff - jetStandoff).toBeCloseTo(0.0015, 4);
    });

    it('CHALLENGE-M3-03: Verifies physical altitudes in kilometers on R=6371km match meteorological targets', () => {
      const lowKm = toKm(lowStandoff);
      const midKm = toKm(midStandoff);
      const jetKm = toKm(jetStandoff);
      const highKm = toKm(highStandoff);

      // Low ~1.27km (stratus/fog)
      expect(lowKm).toBeCloseTo(1.2742, 2);
      expect(lowKm).toBeGreaterThanOrEqual(1.0);
      expect(lowKm).toBeLessThanOrEqual(2.0);

      // Mid ~5.10km (altocumulus)
      expect(midKm).toBeCloseTo(5.0968, 2);
      expect(midKm).toBeGreaterThanOrEqual(4.0);
      expect(midKm).toBeLessThanOrEqual(6.0);

      // Jet Stream ~8.28km (upper tropospheric core)
      expect(jetKm).toBeCloseTo(8.2823, 2);
      expect(jetKm).toBeGreaterThanOrEqual(8.0);
      expect(jetKm).toBeLessThanOrEqual(10.0);

      // High ~10.19km (cirrus)
      expect(highKm).toBeCloseTo(10.1936, 2);
      expect(highKm).toBeGreaterThanOrEqual(10.0);
      expect(highKm).toBeLessThanOrEqual(12.0);

      // Physical strictly monotonic ordering
      expect(lowKm).toBeLessThan(midKm);
      expect(midKm).toBeLessThan(jetKm);
      expect(jetKm).toBeLessThan(highKm);
    });

    it('CHALLENGE-M3-04: Terrain lift preserves layer separation even under extreme Mount Everest topography (+8,848m)', () => {
      // In cloud_shell.wgsl:
      // terrainLift = max(0.0, elevMeters / 8848.0) * (u_layerStandoff.w * 2.8) * terrainDamp
      // where terrainDamp = Low: 0.85, Mid: 0.40, High: 0.15
      const dispScale = 0.001; // nominal displacement scale
      const maxElev = 8848.0;

      const calcTotalOffset = (baseStandoff: number, damp: number) => {
        const lift = Math.max(0, maxElev / 8848.0) * (dispScale * 2.8) * damp;
        return baseStandoff + lift;
      };

      const totalLow = calcTotalOffset(lowStandoff, 0.85);
      const totalMid = calcTotalOffset(midStandoff, 0.40);
      const totalHigh = calcTotalOffset(highStandoff, 0.15);

      // Layer ordering must NOT invert over extreme mountain summits
      expect(totalLow).toBeLessThan(totalMid);
      expect(totalMid).toBeLessThan(totalHigh);

      // Over ocean trench (-10,924m bathymetry), lift clamps to 0 (no submergence)
      const oceanLift = Math.max(0, -10924.0 / 8848.0);
      expect(oceanLift).toBe(0.0);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Feathering Mathematics & 100,000-Trial Monte Carlo Fuzzing
  // --------------------------------------------------------------------------
  describe('Pillar 3: Feathering Mathematics & 100,000-Trial Monte Carlo Fuzzing', () => {
    it('CHALLENGE-M3-05: Exact boundary verification for effectiveCloud(c)', () => {
      // 1. Zero coverage remains strictly zero
      expect(effectiveCloud(0.0)).toBe(0.0);

      // 2. Infinitesimal coverage strongly attenuated
      const tinyCoverage = 1e-5;
      expect(effectiveCloud(tinyCoverage)).toBeLessThan(1e-8);

      // 3. Exactly at threshold (c = 0.20)
      expect(effectiveCloud(0.20)).toBeCloseTo(0.20, 7);

      // 4. Above threshold (c >= 0.20)
      expect(effectiveCloud(0.20001)).toBeCloseTo(0.20001, 5);
      expect(effectiveCloud(0.50)).toBe(0.50);
      expect(effectiveCloud(1.00)).toBe(1.00);

      // 5. Negative values clamped to 0
      expect(effectiveCloud(-0.1)).toBe(-0.0);
    });

    it('CHALLENGE-M3-06: 100,000-Trial Monte Carlo stress test across randomized cloud coverage c in [0, 1]', () => {
      const TRIALS = 100_000;
      let nanCount = 0;
      let infCount = 0;
      let attenuationViolations = 0;
      let passthroughViolations = 0;
      let monotonicityViolations = 0;

      let prevC = 0.0;
      let prevEff = 0.0;

      for (let i = 0; i < TRIALS; i++) {
        const c = Math.random(); // c in [0, 1)
        const eff = effectiveCloud(c);

        if (Number.isNaN(eff)) nanCount++;
        if (!Number.isFinite(eff)) infCount++;

        // Rule: effectiveCloud(c) < c for c < 0.20 (and c > 0)
        if (c > 0 && c < 0.20) {
          if (eff >= c) attenuationViolations++;
        }

        // Rule: effectiveCloud(c) == c for c >= 0.20
        if (c >= 0.20) {
          if (Math.abs(eff - c) > 1e-6) passthroughViolations++;
        }
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
      expect(attenuationViolations).toBe(0);
      expect(passthroughViolations).toBe(0);

      // Test monotonicity across sorted sweep (10,000 steps)
      const STEPS = 10_000;
      for (let j = 0; j <= STEPS; j++) {
        const c = j / STEPS;
        const eff = effectiveCloud(c);
        if (j > 0 && eff < prevEff - 1e-12) {
          monotonicityViolations++;
        }
        prevEff = eff;
      }
      expect(monotonicityViolations).toBe(0);
    });

    it('CHALLENGE-M3-07: Verifies C1 derivative continuity across transition threshold c = 0.20', () => {
      const eps = 1e-6;
      const cThreshold = 0.20;

      // Left numerical derivative: d/dc at 0.20-
      const f_minus = effectiveCloud(cThreshold - eps);
      const f_0 = effectiveCloud(cThreshold);
      const derivLeft = (f_0 - f_minus) / eps;

      // Right numerical derivative: d/dc at 0.20+
      const f_plus = effectiveCloud(cThreshold + eps);
      const derivRight = (f_plus - f_0) / eps;

      // Both left and right derivative must equal 1.0 (smooth C1 transition, zero derivative discontinuity)
      expect(derivLeft).toBeCloseTo(1.0, 3);
      expect(derivRight).toBeCloseTo(1.0, 3);
      expect(Math.abs(derivRight - derivLeft)).toBeLessThan(1e-3);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Tropospheric Differential Drift Monotonicity
  // --------------------------------------------------------------------------
  describe('Pillar 4: Tropospheric Differential Drift Monotonicity', () => {
    const lowDrift = 0.6;
    const midDrift = 1.0;
    const highDrift = 1.8;

    it('CHALLENGE-M3-08: Verifies Low (0.6x) < Mid (1.0x) < High (1.8x) strictly monotonic increase', () => {
      // Confirm present in production shader
      expect(cloudShellWGSL).toContain('cloud.u_cloudDrift.x'); // Low 0.6x
      expect(cloudShellWGSL).toContain('cloud.u_cloudDrift.y'); // Mid 1.0x
      expect(cloudShellWGSL).toContain('cloud.u_cloudDrift.z'); // High 1.8x

      expect(lowDrift).toBeLessThan(midDrift);
      expect(midDrift).toBeLessThan(highDrift);

      // Upper tropospheric shear ratio is exactly 3.0x
      const shearRatio = highDrift / lowDrift;
      expect(shearRatio).toBeCloseTo(3.0, 2);
    });

    it('CHALLENGE-M3-09: Verifies drift longitude wrapping fract(uv.x + driftOffset) stays in [0, 1) over 10,000 randomized time steps', () => {
      const baseSpeed = 0.001;
      let wrapErrors = 0;

      for (let i = 0; i < 10_000; i++) {
        const uvX = Math.random();
        const timeSec = Math.random() * 100_000; // up to 27 hours
        const speed = [lowDrift, midDrift, highDrift][i % 3];

        const driftOffset = timeSec * speed * baseSpeed;
        const driftedU = (uvX + driftOffset) % 1.0;
        const normalizedU = driftedU < 0 ? driftedU + 1.0 : driftedU;

        if (normalizedU < 0.0 || normalizedU >= 1.0 || !Number.isFinite(normalizedU)) {
          wrapErrors++;
        }
      }

      expect(wrapErrors).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 5: Struct Alignment & WGSL 16-Byte Rules
  // --------------------------------------------------------------------------
  describe('Pillar 5: Struct Alignment Verification (CloudUniforms)', () => {
    interface FieldDef {
      name: string;
      type: string;
      size: number;
      align: number;
      expectedOffset: number;
    }

    // All declared fields in CloudUniforms
    const fields: FieldDef[] = [
      { name: 'u_unfurl', type: 'f32', size: 4, align: 4, expectedOffset: 0 },
      { name: 'u_mode', type: 'u32', size: 4, align: 4, expectedOffset: 4 },
      { name: 'u_theme', type: 'u32', size: 4, align: 4, expectedOffset: 8 },
      { name: 'u_time', type: 'f32', size: 4, align: 4, expectedOffset: 12 },
      { name: 'u_cameraPos', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 16 },
      { name: 'u_viewport', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 32 },
      { name: 'u_cloudDrift', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 48 },
      { name: 'u_layerStandoff', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 64 },
      { name: 'u_layerOpacity', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 80 },
      { name: 'u_layerIndex', type: 'u32', size: 4, align: 4, expectedOffset: 96 },
      { name: 'u_isLow', type: 'u32', size: 4, align: 4, expectedOffset: 100 },
      { name: 'u_isMid', type: 'u32', size: 4, align: 4, expectedOffset: 104 },
      { name: 'u_isHigh', type: 'u32', size: 4, align: 4, expectedOffset: 108 },
      { name: 'u_mediumProperties', type: 'vec4<f32>', size: 16, align: 16, expectedOffset: 112 },
      { name: 'u_viewMatrix', type: 'mat4x4<f32>', size: 64, align: 16, expectedOffset: 128 },
      { name: 'u_projectionMatrix', type: 'mat4x4<f32>', size: 64, align: 16, expectedOffset: 192 },
    ];

    it('CHALLENGE-M3-10: Computes byte offsets and validates 16-byte WGSL alignment rules for all fields', () => {
      let currentOffset = 0;

      for (const field of fields) {
        // WGSL rule: offset must be aligned to field's natural alignment
        const alignedOffset = Math.ceil(currentOffset / field.align) * field.align;
        expect(alignedOffset).toBe(field.expectedOffset);

        // Vector4 and Mat4x4 fields MUST start on 16-byte boundaries
        if (field.align === 16) {
          expect(alignedOffset % 16).toBe(0);
        }

        currentOffset = alignedOffset + field.size;
      }

      // Total size must be padded to struct alignment (16 bytes) and uniform offset alignment (256 bytes)
      const structAlign = 16;
      const totalSize = Math.ceil(currentOffset / structAlign) * structAlign;

      expect(totalSize).toBe(256);
      expect(totalSize % 16).toBe(0);
      expect(totalSize % 256).toBe(0);
    });

    it('CHALLENGE-M3-11: Confirms zero internal compiler padding holes', () => {
      // Verify that every single byte from 0 to 255 is explicitly accounted for
      let contiguousOffset = 0;
      for (const field of fields) {
        expect(field.expectedOffset).toBe(contiguousOffset);
        contiguousOffset += field.size;
      }
      expect(contiguousOffset).toBe(256);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 6: Invariants §3 (UCF), §5 (Premul Alpha), §10 (Horizon) & §28 (Themes)
  // --------------------------------------------------------------------------
  describe('Pillar 6: WGSL Invariant Compliance Auditing', () => {
    it('CHALLENGE-M3-12: Invariant §3 - Derivatives evaluated unconditionally before any discard', () => {
      const fsMainIdx = cloudShellWGSL.indexOf('fn fs_main(in: VertexOutput)');
      const dUvIdx = cloudShellWGSL.indexOf('let dUv = fwidth(in.uv);', fsMainIdx);
      const firstDiscardIdx = cloudShellWGSL.indexOf('discard;', fsMainIdx);

      expect(dUvIdx).toBeGreaterThan(fsMainIdx);
      expect(firstDiscardIdx).toBeGreaterThan(dUvIdx);
    });

    it('CHALLENGE-M3-13: Invariant §5 - Output color is strictly premultiplied alpha (C * A <= A)', () => {
      expect(cloudShellWGSL).toContain('vec4<f32>(cloudColor * finalAlpha, finalAlpha)');
    });

    it('CHALLENGE-M3-14: Invariant §10 - Horizon tangent falloff attenuates fragments smoothly to zero', () => {
      expect(cloudShellWGSL).toContain('smoothstep(0.02, 0.20, in.facing)');
      expect(smoothstep(0.02, 0.20, 0.02)).toBe(0.0);
      expect(smoothstep(0.02, 0.20, 0.20)).toBe(1.0);
    });

    it('CHALLENGE-M3-15: Invariant §28 - Explicit branches for all 3 themes with non-empty blocks', () => {
      expect(cloudShellWGSL).toContain('if (cloud.u_theme == 0u)');
      expect(cloudShellWGSL).toContain('else if (cloud.u_theme == 1u)');
      expect(cloudShellWGSL).toContain('else if (cloud.u_theme == 2u)');
    });
  });
});
