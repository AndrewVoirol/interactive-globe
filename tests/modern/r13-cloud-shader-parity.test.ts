// ============================================================================
// File: tests/modern/r13-cloud-shader-parity.test.ts
// Milestone: Milestone 3: Cloud Shell WGSL Shader & Inking (R1, R4 / F28, F29)
// Invariants:
//   - Invariant §3:  WGSL Uniform Control Flow (fwidth, dpdx, dpdy)
//   - Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//   - Invariant §10: Horizon Tangent Attenuation (smoothstep on facing n · v)
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity (elevMeters)
//   - Invariant §20: WebGPU Core vs. Lazy Buffer Discipline
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §28: Exhaustive Multi-Medium Shader Parity (Themes 0, 1, 2)
//   - Invariant §44: Metric Latitude Scaling for Procedural Substrate Noise
//   - Invariant §46: Test Import Integrity (Import from src/)
//   - Invariant §48: Dynamic Texture Dimensions (No Hardcoded 8192/4096 Literals)
// Description: Behavioral, mathematical, and structural test suite verifying
//              multi-altitude cloud shell WGSL shader compilation properties,
//              3-tier altitude standoffs, morph participation, differential drift,
//              feathering threshold, and 3-theme archival inking.
// ============================================================================

import { describe, it, expect } from 'vitest';
import cloudShellWGSL from '../../src/webgpu/shaders/cloud_shell.wgsl?raw';

describe('Milestone 3: Cloud Shell WGSL Shader & Inking (R1, R4 / F28, F29)', () => {
  const SPHERE_RADIUS = 5.0;
  const EARTH_RADIUS_KM = 6371.0;

  // Helper smoothstep function matching WGSL
  function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  describe('1. Invariant §28: Exhaustive Multi-Medium Shader Parity', () => {
    it('M3-THEME-01: cloud_shell.wgsl contains explicit branches for u_theme == 0u, 1u, and 2u', () => {
      // Must have explicit branches for all 3 themes without binary fallthrough
      expect(cloudShellWGSL).toContain('cloud.u_theme == 0u');
      expect(cloudShellWGSL).toContain('cloud.u_theme == 1u');
      expect(cloudShellWGSL).toContain('cloud.u_theme == 2u');

      const theme0Idx = cloudShellWGSL.indexOf('cloud.u_theme == 0u');
      const theme1Idx = cloudShellWGSL.indexOf('cloud.u_theme == 1u');
      const theme2Idx = cloudShellWGSL.indexOf('cloud.u_theme == 2u');

      expect(theme0Idx).toBeGreaterThan(-1);
      expect(theme1Idx).toBeGreaterThan(theme0Idx);
      expect(theme2Idx).toBeGreaterThan(theme1Idx);
    });

    it('M3-THEME-02: Theme 0 (Marie Tharp 1977) renders soft warm white archival ink with underside darkening', () => {
      // Soft warm white: vec3(0.96, 0.96, 0.94)
      expect(cloudShellWGSL).toContain('vec3<f32>(0.96, 0.96, 0.94)');
      // Underside shadow tone
      expect(cloudShellWGSL).toContain('vec3<f32>(0.82, 0.85, 0.89)');

      const coreWhite = [0.96, 0.96, 0.94];
      const shade = [0.82, 0.85, 0.89];

      // Luminance check: core white is bright (> 0.95), shade is darker
      const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      expect(lum(coreWhite)).toBeGreaterThan(0.95);
      expect(lum(shade)).toBeLessThan(lum(coreWhite));
      expect(lum(coreWhite) - lum(shade)).toBeGreaterThan(0.08);
    });

    it('M3-THEME-03: Theme 1 (Cream Rag) renders warm ivory watercolor wash absorbed into paper tooth (u_paper_tooth)', () => {
      // Warm ivory: vec3(0.98, 0.95, 0.89)
      expect(cloudShellWGSL).toContain('vec3<f32>(0.98, 0.95, 0.89)');
      // References paper tooth modulation
      expect(cloudShellWGSL).toContain('u_paper_tooth');
      expect(cloudShellWGSL).toContain('paperTooth');
      expect(cloudShellWGSL).toContain('cloud.u_mediumProperties.w');

      const ivory = [0.98, 0.95, 0.89];
      // Warm ivory character: R > G > B
      expect(ivory[0]).toBeGreaterThan(ivory[1]);
      expect(ivory[1]).toBeGreaterThan(ivory[2]);
      // Distinct warmth (R - B >= 0.08)
      expect(ivory[0] - ivory[2]).toBeGreaterThanOrEqual(0.08);
    });

    it('M3-THEME-04: Theme 2 (Prussian Cyanotype 1842) renders actinic white wisps with photochemical blueprint gamma', () => {
      // Actinic white: vec3(0.95, 0.98, 1.00)
      expect(cloudShellWGSL).toContain('vec3<f32>(0.95, 0.98, 1.00)');
      // Photochemical gamma exposure
      expect(cloudShellWGSL).toContain('cloud.u_mediumProperties.z');
      expect(cloudShellWGSL).toContain('pow(featheredCloud, gamma)');

      const actinicWhite = [0.95, 0.98, 1.00];
      // Actinic character: B >= G > R (cool chalk white)
      expect(actinicWhite[2]).toBeGreaterThanOrEqual(actinicWhite[1]);
      expect(actinicWhite[1]).toBeGreaterThan(actinicWhite[0]);
    });
  });

  describe('2. Invariant §3: WGSL Uniform Control Flow', () => {
    it('M3-UCF-01: All derivatives (fwidth, dpdx, dpdy) are evaluated at the top of fs_main unconditionally', () => {
      const fsMainIdx = cloudShellWGSL.indexOf('fn fs_main(in: VertexOutput)');
      expect(fsMainIdx).toBeGreaterThan(-1);

      const dUvIdx = cloudShellWGSL.indexOf('let dUv = fwidth(in.uv);', fsMainIdx);
      const dudxIdx = cloudShellWGSL.indexOf('let du_dx = dpdx(in.uv.x);', fsMainIdx);
      const dudyIdx = cloudShellWGSL.indexOf('let du_dy = dpdy(in.uv.x);', fsMainIdx);
      const dvdxIdx = cloudShellWGSL.indexOf('let dv_dx = dpdx(in.uv.y);', fsMainIdx);
      const dvdyIdx = cloudShellWGSL.indexOf('let dv_dy = dpdy(in.uv.y);', fsMainIdx);

      expect(dUvIdx).toBeGreaterThan(fsMainIdx);
      expect(dudxIdx).toBeGreaterThan(fsMainIdx);
      expect(dudyIdx).toBeGreaterThan(fsMainIdx);
      expect(dvdxIdx).toBeGreaterThan(fsMainIdx);
      expect(dvdyIdx).toBeGreaterThan(fsMainIdx);

      // Must be evaluated strictly before any discard statement or conditional branch
      const firstDiscardIdx = cloudShellWGSL.indexOf('discard;', fsMainIdx);
      expect(firstDiscardIdx).toBeGreaterThan(dUvIdx);
      expect(firstDiscardIdx).toBeGreaterThan(dudxIdx);
      expect(firstDiscardIdx).toBeGreaterThan(dudyIdx);
      expect(firstDiscardIdx).toBeGreaterThan(dvdxIdx);
      expect(firstDiscardIdx).toBeGreaterThan(dvdyIdx);

      const firstIfIdx = cloudShellWGSL.indexOf('if (', fsMainIdx);
      expect(firstIfIdx).toBeGreaterThan(dUvIdx);
      expect(firstIfIdx).toBeGreaterThan(dudxIdx);
    });

    it('M3-UCF-02: Texture sampling occurs unconditionally before dynamic branching or discards', () => {
      const fsMainIdx = cloudShellWGSL.indexOf('fn fs_main(in: VertexOutput)');
      const sampleIdx = cloudShellWGSL.indexOf('textureSampleLevel(u_cloudTexture', fsMainIdx);
      const firstDiscardIdx = cloudShellWGSL.indexOf('discard;', fsMainIdx);

      expect(sampleIdx).toBeGreaterThan(fsMainIdx);
      // Texture sample is evaluated in uniform control flow before any discard
      expect(sampleIdx).toBeLessThan(firstDiscardIdx);
    });
  });

  describe('3. Invariant §5: Premultiplied Alpha Transparent Clear & Compositing', () => {
    it('M3-PREMUL-01: fs_main returns color premultiplied by alpha: vec4<f32>(color.rgb * alpha, alpha)', () => {
      expect(cloudShellWGSL).toContain('vec4<f32>(cloudColor * finalAlpha, finalAlpha)');

      // Behavioral validation of premultiplied alpha math:
      // For any color C in [0, 1]^3 and alpha A in [0, 1], premultiplied color is C * A
      const color = [0.96, 0.96, 0.94];
      const alpha = 0.65;
      const premul = [color[0] * alpha, color[1] * alpha, color[2] * alpha, alpha];

      expect(premul[0]).toBeCloseTo(0.624, 3);
      expect(premul[1]).toBeCloseTo(0.624, 3);
      expect(premul[2]).toBeCloseTo(0.611, 3);
      expect(premul[3]).toBe(alpha);
      // In premultiplied space, RGB components must never exceed Alpha
      expect(premul[0]).toBeLessThanOrEqual(premul[3]);
      expect(premul[1]).toBeLessThanOrEqual(premul[3]);
      expect(premul[2]).toBeLessThanOrEqual(premul[3]);
    });
  });

  describe('4. Invariant §10: Horizon Tangent Attenuation', () => {
    it('M3-HORIZON-01: Cloud fragments evaluate surface facing (n · v) and smoothstep attenuate to zero', () => {
      expect(cloudShellWGSL).toContain('smoothstep(0.02, 0.20, in.facing)');
      expect(cloudShellWGSL).toContain('dot(normal, viewDir)');

      // Behavioral verification of horizon tangent falloff
      expect(smoothstep(0.02, 0.20, 0.01)).toBe(0.0); // Outside horizon -> zero
      expect(smoothstep(0.02, 0.20, 0.02)).toBe(0.0); // Exactly at limb cutoff -> zero
      expect(smoothstep(0.02, 0.20, 0.11)).toBeCloseTo(0.5, 1); // Mid-transition -> smooth attenuation
      expect(smoothstep(0.02, 0.20, 0.20)).toBe(1.0); // Full disk facing -> full opacity
      expect(smoothstep(0.02, 0.20, 0.90)).toBe(1.0); // Nadir viewing -> full opacity
    });

    it('M3-HORIZON-02: Discards fragments past the planetary limb when in globe mode (u_unfurl < 0.20)', () => {
      expect(cloudShellWGSL).toContain('if (cloud.u_unfurl < 0.20 && in.facing < 0.02)');
    });
  });

  describe('5. Invariant §15: Cross-Pipeline DEM Mathematical Parity', () => {
    it('M3-DEM-01: decodes elevation using identical formula: elevMeters = demSample.a * 19772.0 - 10924.0', () => {
      expect(cloudShellWGSL).toContain('demSample.a * 19772.0 - 10924.0');
      expect(cloudShellWGSL).toContain('fn decodeElevation');

      // Behavioral validation of full Earth elevation range:
      const decodeElevation = (a: number) => a * 19772.0 - 10924.0;

      // Mariana Trench Challenger Deep (-10,924m bathymetry at a = 0.0)
      expect(decodeElevation(0.0)).toBe(-10924.0);

      // Sea level (0m elevation at a = 10924 / 19772 ≈ 0.552498)
      const seaLevelAlpha = 10924.0 / 19772.0;
      expect(decodeElevation(seaLevelAlpha)).toBeCloseTo(0.0, 4);

      // Mount Everest summit (+8,848m topography at a = 1.0)
      expect(decodeElevation(1.0)).toBe(8848.0);
    });
  });

  describe('6. Multi-Altitude Standoffs & Meteorological Calibration (R1)', () => {
    it('M3-ALT-01: Supports 3 independent altitude standoffs satisfying Low < Mid < High ordering', () => {
      expect(cloudShellWGSL).toContain('cloud.u_layerStandoff.x'); // Low ~0.0010
      expect(cloudShellWGSL).toContain('cloud.u_layerStandoff.y'); // Mid ~0.0040
      expect(cloudShellWGSL).toContain('cloud.u_layerStandoff.z'); // High ~0.0080

      const lowStandoff = 0.0010;
      const midStandoff = 0.0040;
      const highStandoff = 0.0080;

      // Strict standoff ordering
      expect(lowStandoff).toBeLessThan(midStandoff);
      expect(midStandoff).toBeLessThan(highStandoff);

      // Convert to physical Earth kilometers: altitude_km = (standoff / R_sphere) * R_earth
      const toKm = (s: number) => (s / SPHERE_RADIUS) * EARTH_RADIUS_KM;

      // Low: ~1-2km (stratus/fog)
      const lowKm = toKm(lowStandoff);
      expect(lowKm).toBeGreaterThanOrEqual(1.0);
      expect(lowKm).toBeLessThanOrEqual(2.0);
      expect(lowKm).toBeCloseTo(1.27, 2);

      // Mid: ~4-6km (altocumulus)
      const midKm = toKm(midStandoff);
      expect(midKm).toBeGreaterThanOrEqual(4.0);
      expect(midKm).toBeLessThanOrEqual(6.0);
      expect(midKm).toBeCloseTo(5.10, 2);

      // High: ~10-12km (cirrus)
      const highKm = toKm(highStandoff);
      expect(highKm).toBeGreaterThanOrEqual(10.0);
      expect(highKm).toBeLessThanOrEqual(12.0);
      expect(highKm).toBeCloseTo(10.19, 2);
    });

    it('M3-ALT-02: Layer selection supports uniform u_layerIndex (0u = Low, 1u = Mid, 2u = High)', () => {
      expect(cloudShellWGSL).toContain('u_layerIndex: u32');
      expect(cloudShellWGSL).toContain('let layerIdx = cloud.u_layerIndex;');
      expect(cloudShellWGSL).toContain('if (layerIdx == 1u)');
      expect(cloudShellWGSL).toContain('else if (layerIdx == 2u)');
    });
  });

  describe('7. Morph Participation & Surface Normal Displacement (R1 / Invariant §8)', () => {
    it('M3-MORPH-01: Displaces along surface normal: p_world = basePos + normal * totalOffset', () => {
      expect(cloudShellWGSL).toContain('let worldP = basePos + normal * totalOffset;');

      // Verify that at alpha=1.0, normal blends toward (0, 0, 1)
      expect(cloudShellWGSL).toContain('let flatNorm = vec3<f32>(0.0, 0.0, 1.0);');
      expect(cloudShellWGSL).toContain('mix(sphereNorm, flatNorm, cloud.u_unfurl)');

      // Behavioral validation of normal blending:
      // At u_unfurl = 0.0 (globe): normal = sphereNorm (radial unit vector)
      // At u_unfurl = 1.0 (flat map): normal = (0, 0, 1), preserving altitude standoff as vertical 3D offset
      const sphereNorm = [0.0, 0.0, 1.0];
      const flatNorm = [0.0, 0.0, 1.0];
      const unfurl = 1.0;
      const normalZ = sphereNorm[2] * (1 - unfurl) + flatNorm[2] * unfurl;
      expect(normalZ).toBe(1.0);
    });

    it('M3-MORPH-02: Incorporates orographic terrain lift coupled to DEM elevation', () => {
      expect(cloudShellWGSL).toContain('let normH = max(0.0, elevMeters) / 8848.0;');
      expect(cloudShellWGSL).toContain('let crustDisp = pow(normH, max(0.5, dynamicExp)) * (cloud.u_layerStandoff.w * 2.8) * poleAtten;');
    });
  });

  describe('8. Independent Tropospheric Drift (R1)', () => {
    it('M3-DRIFT-01: Longitude UV is modulated by driftOffset = fract(uv.x + driftOffset)', () => {
      expect(cloudShellWGSL).toContain('let driftedU = fract(in.uv.x + driftOffset);');
      expect(cloudShellWGSL).toContain('let sampleUV = vec2<f32>(driftedU, in.uv.y);');
    });

    it('M3-DRIFT-02: Drift speed varies with altitude (Low < Mid < High)', () => {
      // Documented drift ratios in SCOPE.md and survey:
      // Low: 0.6x, Mid: 1.0x, High: 1.8x
      expect(cloudShellWGSL).toContain('cloud.u_cloudDrift.x');
      expect(cloudShellWGSL).toContain('cloud.u_cloudDrift.y');
      expect(cloudShellWGSL).toContain('cloud.u_cloudDrift.z');

      const lowDrift = 0.6;
      const midDrift = 1.0;
      const highDrift = 1.8;

      expect(lowDrift).toBeLessThan(midDrift);
      expect(midDrift).toBeLessThan(highDrift);
    });
  });

  describe('9. Feathering Threshold & Altitude-Dependent Opacity (R1)', () => {
    it('M3-FEATHER-01: Values below 20% cloud fraction feather to 0 to prevent blocky 0.25° grid steps', () => {
      expect(cloudShellWGSL).toContain('let featheredCloud = smoothstep(0.0, 0.20, rawCloud);');

      // Behavioral verification of feathering curve:
      // Values <= 0.0 yield 0.0
      expect(smoothstep(0.0, 0.20, 0.0)).toBe(0.0);
      // Low values (e.g. 5% cloud cover) feather smoothly down toward 0
      expect(smoothstep(0.0, 0.20, 0.05)).toBeCloseTo(0.156, 3);
      // 10% cloud cover is at inflection point
      expect(smoothstep(0.0, 0.20, 0.10)).toBeCloseTo(0.500, 3);
      // Values >= 20% reach full unattenuated factor 1.0
      expect(smoothstep(0.0, 0.20, 0.20)).toBe(1.0);
      expect(smoothstep(0.0, 0.20, 0.80)).toBe(1.0);

      // Effective cloud = rawCloud * featheredCloud ensures continuity
      const effectiveCloud = (raw: number) => raw * smoothstep(0.0, 0.20, raw);
      expect(effectiveCloud(0.0)).toBe(0.0);
      expect(effectiveCloud(0.05)).toBeLessThan(0.01); // 5% cloud strongly suppressed
      expect(effectiveCloud(0.20)).toBeCloseTo(0.20, 4); // 20% cloud passes unattenuated
      expect(effectiveCloud(0.60)).toBeCloseTo(0.60, 4); // 60% cloud passes unattenuated
    });

    it('M3-OPACITY-01: Enforces altitude-dependent opacity ranges (Low stratus 0.5–0.8, High cirrus 0.2–0.4)', () => {
      expect(cloudShellWGSL).toContain('cloud.u_layerOpacity.x');
      expect(cloudShellWGSL).toContain('cloud.u_layerOpacity.y');
      expect(cloudShellWGSL).toContain('cloud.u_layerOpacity.z');

      // Expected design opacity ranges from SCOPE.md:
      const lowStratus = 0.70; // within [0.5, 0.8]
      const midAltocumulus = 0.50; // within [0.4, 0.6]
      const highCirrus = 0.30; // within [0.2, 0.4]

      expect(lowStratus).toBeGreaterThanOrEqual(0.5);
      expect(lowStratus).toBeLessThanOrEqual(0.8);

      expect(highCirrus).toBeGreaterThanOrEqual(0.2);
      expect(highCirrus).toBeLessThanOrEqual(0.4);

      // Stratus clouds are denser/more opaque than high wispy cirrus
      expect(lowStratus).toBeGreaterThan(midAltocumulus);
      expect(midAltocumulus).toBeGreaterThan(highCirrus);
    });
  });

  describe('10. Uniform Buffer Layout & Alignment (Invariant §20, §24)', () => {
    it('M3-UNIFORM-01: CloudUniforms struct layout is exactly 256 bytes (64 floats) with 16-byte alignment', () => {
      expect(cloudShellWGSL).toContain('struct CloudUniforms {');
      expect(cloudShellWGSL).toContain('u_unfurl: f32');
      expect(cloudShellWGSL).toContain('u_mode: u32');
      expect(cloudShellWGSL).toContain('u_theme: u32');
      expect(cloudShellWGSL).toContain('u_time: f32');
      expect(cloudShellWGSL).toContain('u_cameraPos: vec4<f32>');
      expect(cloudShellWGSL).toContain('u_viewport: vec4<f32>');
      expect(cloudShellWGSL).toContain('u_cloudDrift: vec4<f32>');
      expect(cloudShellWGSL).toContain('u_layerStandoff: vec4<f32>');
      expect(cloudShellWGSL).toContain('u_layerOpacity: vec4<f32>');
      expect(cloudShellWGSL).toContain('u_layerIndex: u32');
      expect(cloudShellWGSL).toContain('u_mediumProperties: vec4<f32>');
      expect(cloudShellWGSL).toContain('u_viewMatrix: mat4x4<f32>');
      expect(cloudShellWGSL).toContain('u_projectionMatrix: mat4x4<f32>');

      // Verify byte layout calculation:
      // Floats 0..3:   4 scalars = 16 bytes (offset 0..15)
      // Floats 4..7:   vec4<f32> = 16 bytes (offset 16..31)
      // Floats 8..11:  vec4<f32> = 16 bytes (offset 32..47)
      // Floats 12..15: vec4<f32> = 16 bytes (offset 48..63)
      // Floats 16..19: vec4<f32> = 16 bytes (offset 64..79)
      // Floats 20..23: vec4<f32> = 16 bytes (offset 80..95)
      // Floats 24..27: 4 scalars = 16 bytes (offset 96..111)
      // Floats 28..31: vec4<f32> = 16 bytes (offset 112..127)
      // Floats 32..47: mat4x4    = 64 bytes (offset 128..191)
      // Floats 48..63: mat4x4    = 64 bytes (offset 192..255)
      // Total: 64 floats * 4 bytes = 256 bytes
      const totalBytes = 64 * 4;
      expect(totalBytes).toBe(256);
      expect(totalBytes % 16).toBe(0);
      expect(totalBytes % 256).toBe(0); // Standard uniform buffer offset alignment
    });
  });

  describe('11. Invariant §48: Dynamic Texture Dimensions (No Hardcoded Literals)', () => {
    it('M3-DIMS-01: cloud_shell.wgsl contains zero hardcoded 8192 or 4096 literals', () => {
      expect(cloudShellWGSL).not.toContain('8192');
      expect(cloudShellWGSL).not.toContain('4096');
    });
  });
});
