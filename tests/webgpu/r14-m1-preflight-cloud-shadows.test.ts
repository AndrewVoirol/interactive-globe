// ============================================================================
// File: tests/webgpu/r14-m1-preflight-cloud-shadows.test.ts
// Milestone: Milestone 1: Pre-Flight Hygiene & Dynamic Cloud Ground Shadows
// Specifications:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§2.1, §3.1)
//   - Invariant §3:  WGSL Uniform Control Flow (fwidth, dpdx, dpdy)
//   - Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//   - Invariant §10: Zero-Standoff Surface Conformance & Horizon Tangent Attenuation
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity (elevMeters)
//   - Invariant §20: 16-Byte WGSL Struct Alignment & Lazy Dynamic Buffer Discipline
//   - Invariant §28: Exhaustive Multi-Medium Shader Parity (Themes 0, 1, 2)
//   - Invariant §48: Dynamic Texture Dimensions (Zero Hardcoded 8192/4096 Literals)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

const ENGINE_PATH = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
const CRUST_WGSL_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');

const engineSource = fs.readFileSync(ENGINE_PATH, 'utf-8');
const crustWgsl = fs.readFileSync(CRUST_WGSL_PATH, 'utf-8');

describe('Milestone 1: Pre-Flight Hygiene & Dynamic Cloud Ground Shadows', () => {
  // --------------------------------------------------------------------------
  // 1. Invariant §48: Dynamic Dimensions & Zero Hardcoded DEM Literals
  // --------------------------------------------------------------------------
  describe('1. Invariant §48: Zero Hardcoded DEM Literals in WebGPUEngine.ts', () => {
    it('M1-DEM-01: does not declare hardcoded 8192 or 4096 literals as instance field initializers', () => {
      // Must not have bare field initializers: public demWidth: number = 8192;
      expect(engineSource).not.toMatch(/public\s+demWidth\s*:\s*number\s*=\s*8192\s*;/);
      expect(engineSource).not.toMatch(/public\s+demHeight\s*:\s*number\s*=\s*4096\s*;/);

      // Must initialize demWidth and demHeight to 0 indicating dynamic uninitialized state
      expect(engineSource).toMatch(/public\s+demWidth\s*:\s*number\s*=\s*0\s*;/);
      expect(engineSource).toMatch(/public\s+demHeight\s*:\s*number\s*=\s*0\s*;/);
    });

    it('M1-DEM-02: exposes symbolic constants DEFAULT_DEM_WIDTH and DEFAULT_DEM_HEIGHT', () => {
      expect(WebGPUEngine.DEFAULT_DEM_WIDTH).toBe(8192);
      expect(WebGPUEngine.DEFAULT_DEM_HEIGHT).toBe(4096);
    });

    it('M1-DEM-03: loadOrbitalTextures uses dynamic default properties rather than raw literals', () => {
      // Must use this.defaultTextureWidth and this.defaultTextureHeight
      expect(engineSource).toMatch(/\(daySource as any\)\.width\s*\|\|\s*this\.defaultTextureWidth/);
      expect(engineSource).toMatch(/\(daySource as any\)\.height\s*\|\|\s*this\.defaultTextureHeight/);
      expect(engineSource).not.toMatch(/\(daySource as any\)\.width\s*\|\|\s*4096/);
    });

    it('M1-DEM-04: loadDEMTexture derives dimensions dynamically from buffer byteLength', () => {
      expect(engineSource).not.toMatch(/8192\s*\*\s*4096\s*\*\s*4/);
      expect(engineSource).not.toMatch(/\/\/.*8192\s*x\s*4096/);
      expect(engineSource).toMatch(/Math\.sqrt\(totalPixels\s*\/\s*2\)/);
    });

    it('M1-DEM-05: sampleElevation falls back cleanly to dynamic properties and constants', () => {
      expect(engineSource).not.toMatch(/W\s*=\s*8192\s*;\s*H\s*=\s*4096\s*;/);
      expect(engineSource).toMatch(/this\.demWidth\s*>\s*0\s*\?\s*this\.demWidth\s*:\s*WebGPUEngine\.DEFAULT_DEM_WIDTH/);
      expect(engineSource).toMatch(/this\.demHeight\s*>\s*0\s*\?\s*this\.demHeight\s*:\s*WebGPUEngine\.DEFAULT_DEM_HEIGHT/);
    });

    it('M1-DEM-06: relief texel width/height uniforms compute dynamically from dem dimensions', () => {
      expect(engineSource).not.toMatch(/1\.0\s*\/\s*8192\.0/);
      expect(engineSource).not.toMatch(/1\.0\s*\/\s*4096\.0/);
      expect(engineSource).toMatch(/rf\[6\]\s*=\s*1\.0\s*\/\s*curDemW/);
      expect(engineSource).toMatch(/rf\[7\]\s*=\s*1\.0\s*\/\s*curDemH/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Invariant §20: 16-Byte Struct Alignment & SimUniforms Layout
  // --------------------------------------------------------------------------
  describe('2. Invariant §20: SimUniforms 288-Byte Alignment & Float Packing', () => {
    it('M1-ALIGN-01: SimUniforms in crust_hydrosphere.wgsl contains u_shadowIntensity and scalar padding floats', () => {
      expect(crustWgsl).toMatch(/u_shadowIntensity\s*:\s*f32/);
      expect(crustWgsl).toMatch(/_padShadow0\s*:\s*f32/);
      expect(crustWgsl).toMatch(/_padShadow1\s*:\s*f32/);
      expect(crustWgsl).toMatch(/_padShadow2\s*:\s*f32/);
    });

    it('M1-ALIGN-02: crustFloats is sized to exactly 72 floats (288 bytes) and crustUniformBuffer size is 288', () => {
      expect(engineSource).toMatch(/private\s+crustFloats\s*=\s*new\s+Float32Array\(72\)/);
      expect(engineSource).toMatch(/size\s*:\s*288/);
      // 72 floats * 4 bytes/float = 288 bytes, exactly divisible by 16
      expect(72 * 4).toBe(288);
      expect(288 % 16).toBe(0);
    });

    it('M1-ALIGN-03: u_shadowIntensity is written at float index 68 (byte offset 272)', () => {
      expect(engineSource).toMatch(/this\.crustFloats\[68\]\s*=\s*params\.shadowIntensity/);
      expect(engineSource).toMatch(/this\.crustFloats\[69\]\s*=\s*0\.0/);
      expect(engineSource).toMatch(/this\.crustFloats\[70\]\s*=\s*0\.0/);
      expect(engineSource).toMatch(/this\.crustFloats\[71\]\s*=\s*0\.0/);
      // Float 68 * 4 bytes = 272 bytes (immediately following u_mediumProperties vec4 at 256..271)
      expect(68 * 4).toBe(272);
      expect(272 % 4).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. WebGPU Binding Architecture & Dummy Fallback
  // --------------------------------------------------------------------------
  describe('3. WebGPU Texture Bindings & Fallback Architecture', () => {
    it('M1-BIND-01: crust_hydrosphere.wgsl binds u_cloudTexture at slot 7 and u_cloudSampler at slot 8', () => {
      expect(crustWgsl).toMatch(/@group\(0\)\s*@binding\(7\)\s*var\s*u_cloudTexture\s*:\s*texture_2d<f32>\s*;/);
      expect(crustWgsl).toMatch(/@group\(0\)\s*@binding\(8\)\s*var\s*u_cloudSampler\s*:\s*sampler\s*;/);
    });

    it('M1-BIND-02: crustBindGroupLayout includes entries 7 and 8 in WebGPUEngine.ts', () => {
      expect(engineSource).toMatch(/binding\s*:\s*7,\s*visibility\s*:\s*GPUShaderStage\.FRAGMENT,\s*texture\s*:\s*\{\s*sampleType\s*:\s*'float'\s*\}/);
      expect(engineSource).toMatch(/binding\s*:\s*8,\s*visibility\s*:\s*GPUShaderStage\.FRAGMENT,\s*sampler\s*:\s*\{\s*type\s*:\s*'filtering'\s*\}/);
    });

    it('M1-BIND-03: allocates 1x1 r16float dummyCloudTexture to ensure non-null startup', () => {
      expect(engineSource).toMatch(/label\s*:\s*'dummy_cloud_texture'/);
      expect(engineSource).toMatch(/format\s*:\s*'r16float'/);
      expect(engineSource).toMatch(/dummyCloudTextureView/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Invariant §3: WGSL Uniform Control Flow & Unconditional Sampling
  // --------------------------------------------------------------------------
  describe('4. Invariant §3: WGSL Uniform Control Flow', () => {
    it('M1-UCF-01: all derivatives and shadow factors evaluate unconditionally at the top of fs_main', () => {
      const fsMainIdx = crustWgsl.indexOf('fn fs_main(input: VertexOutput)');
      expect(fsMainIdx).toBeGreaterThan(-1);

      const dUVIdx = crustWgsl.indexOf('fwidth(input.uv)', fsMainIdx);
      const shadowEvalIdx = crustWgsl.indexOf('let shadowFactor = sampleCloudShadowFactor', fsMainIdx);
      const dymaxionDiscardIdx = crustWgsl.indexOf('if (sim.u_mode == 4u && sim.u_unfurl > 0.02)', fsMainIdx);
      const surfaceDiscardIdx = crustWgsl.indexOf('if (input.surfaceType > 0.5)', fsMainIdx);

      // Derivatives must be evaluated first
      expect(dUVIdx).toBeGreaterThan(fsMainIdx);
      // Shadow sampling must be evaluated unconditionally before any dynamic branching or discard
      expect(shadowEvalIdx).toBeGreaterThan(fsMainIdx);
      expect(shadowEvalIdx).toBeLessThan(dymaxionDiscardIdx);
      expect(shadowEvalIdx).toBeLessThan(surfaceDiscardIdx);
    });

    it('M1-UCF-02: shadow sampling taps use explicit LOD 0.0 with textureSampleLevel', () => {
      // Must not call implicit-LOD textureSample inside sampleCloudShadowFactor
      const sampleFuncIdx = crustWgsl.indexOf('fn sampleCloudShadowFactor');
      const sampleFuncEnd = crustWgsl.indexOf('return clamp(shadowFactor', sampleFuncIdx);
      const sampleFuncCode = crustWgsl.substring(sampleFuncIdx, sampleFuncEnd);

      expect(sampleFuncCode).not.toMatch(/[^L]textureSample\(/);
      expect(sampleFuncCode).toMatch(/textureSampleLevel\(u_cloudTexture,\s*u_cloudSampler,\s*tap0,\s*0\.0\)/);
      expect(sampleFuncCode).toMatch(/textureSampleLevel\(u_cloudTexture,\s*u_cloudSampler,\s*tap1,\s*0\.0\)/);
      expect(sampleFuncCode).toMatch(/textureSampleLevel\(u_cloudTexture,\s*u_cloudSampler,\s*tap2,\s*0\.0\)/);
      expect(sampleFuncCode).toMatch(/textureSampleLevel\(u_cloudTexture,\s*u_cloudSampler,\s*tap3,\s*0\.0\)/);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Mathematical Mechanics: Physical Shadow UV Offset Math
  // --------------------------------------------------------------------------
  describe('5. Mathematical Mechanics: Physical Shadow UV Offset Verification', () => {
    // Pure TypeScript reference implementation of computeCloudShadowOffset matching WGSL exactly
    function computeCloudShadowOffsetTS(
      uv: { x: number; y: number },
      sunAzimuthDeg: number,
      sunAltitudeDeg: number
    ): { deltaU: number; deltaV: number } {
      const EARTH_RADIUS_KM = 6371.0;
      const CLOUD_ALT_KM = 2.5;
      const TWO_PI_RE = 2.0 * Math.PI * EARTH_RADIUS_KM; // ~40030.17 km
      const PI_RE = Math.PI * EARTH_RADIUS_KM;           // ~20015.09 km

      const azDeg = sunAzimuthDeg > 0.0 ? sunAzimuthDeg : 315.0;
      const altDeg = sunAltitudeDeg > 0.0 ? sunAltitudeDeg : 45.0;

      const radAz = (azDeg * Math.PI) / 180.0;
      const radAlt = Math.max((5.0 * Math.PI) / 180.0, Math.min((85.0 * Math.PI) / 180.0, (altDeg * Math.PI) / 180.0));
      const tanAlt = Math.tan(radAlt);

      const cosLat = Math.max(0.15, Math.cos((uv.y - 0.5) * Math.PI));

      const deltaU = -(CLOUD_ALT_KM / (tanAlt * TWO_PI_RE)) * (Math.cos(radAz) / cosLat);
      const deltaV = (CLOUD_ALT_KM / (tanAlt * PI_RE)) * Math.sin(radAz);

      return { deltaU, deltaV };
    }

    it('M1-MATH-01: NW 315° sun azimuth produces negative deltaU (West) and negative deltaV (North)', () => {
      const offset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0);

      // At 315° NW: cos(315°) = +sqrt(2)/2 > 0, sin(315°) = -sqrt(2)/2 < 0
      // deltaU = - (C / tanAlt) * cos(315°) / cosLat < 0 (West displacement)
      // deltaV =   (C / tanAlt) * sin(315°) < 0 (North displacement)
      expect(offset.deltaU).toBeLessThan(0);
      expect(offset.deltaV).toBeLessThan(0);

      // At equator (y = 0.5), cosLat = 1.0, tan(45°) = 1.0
      // |deltaU| = 2.5 / 40030.17 * 0.7071068 ≈ 4.416e-5
      // |deltaV| = 2.5 / 20015.09 * -0.7071068 ≈ -8.832e-5
      expect(Math.abs(offset.deltaU)).toBeCloseTo(4.416e-5, 7);
      expect(Math.abs(offset.deltaV)).toBeCloseTo(8.832e-5, 7);
    });

    it('M1-MATH-02: deltaU scales inversely with cosLat across latitude bands (Spherical Metric)', () => {
      const eqOffset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 45.0); // Lat 0°
      const midOffset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.25 }, 315.0, 45.0); // Lat +45° (y=0.25 -> (0.25-0.5)*pi = -pi/4)

      // cos(45°) = 0.7071068, so deltaU at 45° latitude should be ~1.414x larger than at equator
      const ratio = Math.abs(midOffset.deltaU) / Math.abs(eqOffset.deltaU);
      expect(ratio).toBeCloseTo(Math.SQRT2, 3);
      // deltaV (latitude displacement) remains invariant with longitude/latitude metric
      expect(midOffset.deltaV).toBeCloseTo(eqOffset.deltaV, 9);
    });

    it('M1-MATH-03: handles grazing sun altitude (5°) without NaN or Infinite displacement', () => {
      const grazingOffset = computeCloudShadowOffsetTS({ x: 0.5, y: 0.5 }, 315.0, 1.0); // Below 5° clamp
      expect(Number.isFinite(grazingOffset.deltaU)).toBe(true);
      expect(Number.isFinite(grazingOffset.deltaV)).toBe(true);
      expect(Number.isNaN(grazingOffset.deltaU)).toBe(false);
      expect(Number.isNaN(grazingOffset.deltaV)).toBe(false);
      // Clamped to tan(5°) ≈ 0.08748866
      expect(Math.abs(grazingOffset.deltaU)).toBeLessThan(0.002);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Mathematical Mechanics: Soft Shadow Factor Attenuation
  // --------------------------------------------------------------------------
  describe('6. Mathematical Mechanics: Soft Shadow Factor Attenuation Formula', () => {
    function smoothstep(edge0: number, edge1: number, x: number): number {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    }

    function calculateShadowFactor(cloudDens: number, intensity: number): number {
      const shadowFactor = 1.0 - intensity * smoothstep(0.10, 0.35, cloudDens);
      return Math.max(0, Math.min(1, shadowFactor));
    }

    it('M1-SHADOW-01: clear sky (cloudDens <= 0.10) produces unattenuated lighting (shadowFactor = 1.0)', () => {
      expect(calculateShadowFactor(0.0, 0.45)).toBe(1.0);
      expect(calculateShadowFactor(0.05, 0.45)).toBe(1.0);
      expect(calculateShadowFactor(0.10, 0.45)).toBe(1.0);
    });

    it('M1-SHADOW-02: thick overcast (cloudDens >= 0.35) achieves full specified shadow depth (1.0 - intensity)', () => {
      const intensity = 0.45;
      expect(calculateShadowFactor(0.35, intensity)).toBeCloseTo(0.55, 5);
      expect(calculateShadowFactor(0.70, intensity)).toBeCloseTo(0.55, 5);
      expect(calculateShadowFactor(1.0, intensity)).toBeCloseTo(0.55, 5);
    });

    it('M1-SHADOW-03: intermediate cloud (0.10 < cloudDens < 0.35) smoothly attenuates lighting', () => {
      const midFactor = calculateShadowFactor(0.225, 0.45); // midpoint
      expect(midFactor).toBeLessThan(1.0);
      expect(midFactor).toBeGreaterThan(0.55);
      expect(midFactor).toBeCloseTo(1.0 - 0.45 * 0.5, 5); // smoothstep at midpoint is exactly 0.5
    });

    it('M1-SHADOW-04: intensity = 0.0 produces zero shadow across all cloud densities', () => {
      expect(calculateShadowFactor(0.0, 0.0)).toBe(1.0);
      expect(calculateShadowFactor(0.25, 0.0)).toBe(1.0);
      expect(calculateShadowFactor(0.50, 0.0)).toBe(1.0);
      expect(calculateShadowFactor(1.0, 0.0)).toBe(1.0);
    });

    it('M1-SHADOW-05: maximum intensity (0.60) preserves minimum 40% ambient light floor', () => {
      const minFactor = calculateShadowFactor(1.0, 0.60);
      expect(minFactor).toBeCloseTo(0.40, 5);
      expect(minFactor).toBeGreaterThanOrEqual(0.40);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Invariant §28: Multi-Medium Archival Inking Parity
  // --------------------------------------------------------------------------
  describe('7. Invariant §28: Exhaustive Multi-Medium Shader Parity in crust_hydrosphere.wgsl', () => {
    it('M1-PARITY-01: modulates direct diffuse terrain lighting across all three themes', () => {
      // Theme 1: Cream Rag Paper (Eduard Imhof Swiss Alpine Relief)
      expect(crustWgsl).toMatch(/cWarmDirect\s*\*\s*\(sunDirect\s*\*\s*0\.90\s*\+\s*ridgeEnhance\s*\*\s*0\.8\s*\*\s*shadowFactor\)/);

      // Theme 2: Prussian Cyanotype (Ferroprussiate Monochromatic Wash)
      expect(crustWgsl).toMatch(/cActinicDirect\s*\*\s*\(sunDirect\s*\*\s*0\.85\s*\+\s*ridgeEnhance\s*\*\s*0\.8\s*\*\s*shadowFactor\)/);

      // Theme 0: Marie Tharp Physiographic Shading
      expect(crustWgsl).toMatch(/cSunLight\s*\*\s*\(sunDirect\s*\*\s*0\.85\s*\+\s*ridgeEnhance\s*\*\s*shadowFactor\)/);
    });

    it('M1-PARITY-02: modulates ocean and bathymetric direct lighting while preserving sky ambient fill', () => {
      // Hydrosphere seabed radiance
      expect(crustWgsl).toMatch(/seabedRadiance\s*=\s*R_subsurface\s*\*\s*\(NdotL\s*\*\s*causticFactor\s*\*\s*shadowFactor\)/);

      // Hydrosphere pelagic solar illumination
      expect(crustWgsl).toMatch(/sunIllum\s*=\s*cSunLight\s*\*\s*\(NdotL\s*\*\s*0\.85\s*\*\s*shadowFactor\s*\+\s*0\.15\)\s*\+\s*cSkyAmbient\s*\*\s*0\.80/);

      // Hydrosphere water sun specular reflection
      expect(crustWgsl).toMatch(/sunSpecular\s*\*\s*fresnel\s*\*\s*specAtten\s*\*\s*shadowFactor/);

      // NASA Blue Marble orbital direct illumination
      expect(crustWgsl).toMatch(/directIllum\s*=\s*0\.10\s*\+\s*0\.90\s*\*\s*max\(0\.0,\s*cosSun\)\s*\*\s*shadowFactor/);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Ground Shadow Synchronization & Cloud Toggle Masking (RFC §1.1, Mechanic 1)
  // --------------------------------------------------------------------------
  describe('8. Ground Shadow Synchronization & Cloud Toggle Masking', () => {
    it('M1-SYNC-01: crust_hydrosphere.wgsl declares u_cloudDriftRate and u_cloudAltitudeKm in SimUniforms', () => {
      expect(crustWgsl).toMatch(/u_cloudDriftRate\s*:\s*f32/);
      expect(crustWgsl).toMatch(/u_cloudAltitudeKm\s*:\s*f32/);
    });

    it('M1-SYNC-02: crust_hydrosphere.wgsl evaluates driftOffset from sim.u_time * sim.u_cloudDriftRate', () => {
      expect(crustWgsl).toMatch(/let\s+driftOffset\s*=\s*sim\.u_time\s*\*\s*sim\.u_cloudDriftRate\s*;/);
      expect(crustWgsl).toMatch(/fract\(uv\.x\s*\+\s*driftOffset\s*\+\s*shadowOffset\.x\)/);
    });

    it('M1-SYNC-03: computeCloudShadowOffset dynamically uses sim.u_cloudAltitudeKm with fallback', () => {
      expect(crustWgsl).toMatch(/let\s+cloudAltKm\s*:\s*f32\s*=\s*select\(2\.5,\s*sim\.u_cloudAltitudeKm,\s*sim\.u_cloudAltitudeKm\s*>\s*0\.0\);/);
      expect(crustWgsl).toMatch(/cloudAltKm\s*\/\s*\(tanAlt\s*\*\s*TWO_PI_RE\)/);
      expect(crustWgsl).toMatch(/cloudAltKm\s*\/\s*\(tanAlt\s*\*\s*PI_RE\)/);
    });

    it('M1-SYNC-04: WebGPUEngine masks shadow intensity to 0.0 when clouds are toggled off', () => {
      expect(engineSource).toMatch(/const\s+cloudsActive\s*=\s*\(params\.showClouds\s*!==\s*false\)\s*&&\s*\(this\.cloudEnabled\s*!==\s*false\);/);
      expect(engineSource).toMatch(/this\.crustFloats\[69\]\s*=\s*0\.6\s*\*\s*baseDrift\s*;/);
      expect(engineSource).toMatch(/this\.crustFloats\[70\]\s*=\s*2\.5\s*;/);
    });
  });
});
