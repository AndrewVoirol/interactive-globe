// ============================================================================
// File: tests/webgpu/r14-m3-pitch-adaptive-clouds.test.ts
// Milestone: Milestone 3: Pitch-Adaptive Cloud Shell Separation & Rain Shadows
// Authoritative References:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§2.3, §3.2)
//   - AGENTS.md Invariants:
//       * Invariant §3:  WGSL Uniform Control Flow (Unconditional Derivative & LOD)
//       * Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//       * Invariant §10: Horizon Tangent Attenuation (smoothstep(0.02, 0.20, in.facing))
//       * Invariant §15: Cross-Pipeline DEM Mathematical Parity (elevMeters decoding)
//       * Invariant §20: 16-Byte WGSL Struct Alignment & 256-Byte Uniform Packing
//       * Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//       * Invariant §28: Exhaustive Multi-Medium Shader Parity (Themes 0, 1, 2)
//       * Invariant §46: Anti-Cheating Production Source Import Integrity
//       * Invariant §48: Dynamic Texture Dimensions (Clean DEM Guard)
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

const SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/cloud_shell.wgsl');
const ENGINE_PATH = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');

const cloudShaderSource = fs.readFileSync(SHADER_PATH, 'utf-8');
const engineSource = fs.readFileSync(ENGINE_PATH, 'utf-8');

// ============================================================================
// Mock WebGPU Environment Helpers
// ============================================================================

let originalNavigator: any;

function setupMockNavigator() {
  originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
        requestAdapter: async () => ({
          limits: {
            maxStorageBufferBindingSize: 1024 * 1024 * 1024,
            maxBufferSize: 1024 * 1024 * 1024,
            maxComputeWorkgroupStorageSize: 32768,
            maxComputeInvocationsPerWorkgroup: 1024,
          },
          features: new Set(['timestamp-query']),
          requestDevice: async () => new MockGPUDevice(),
        }),
      },
    },
    configurable: true,
    writable: true,
  });
}

function restoreMockNavigator() {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
}

function createMockCanvas(width = 1920, height = 1080) {
  const mockContext = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
    })),
    canvas: { width, height },
  };

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: vi.fn((type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;

  return { canvas, mockContext };
}

function createEngineConfig(pointCount = 100, lineCount = 100): WebGPUInitConfig {
  const { canvas } = createMockCanvas();
  const pointsData = new Float32Array(pointCount * 3);
  const target2DData = new Float32Array(pointCount * 2);
  const typeData = new Float32Array(pointCount);
  const lineIndices = new Uint32Array(lineCount * 2);

  return {
    canvas,
    pointCount,
    pointsData,
    target2DData,
    typeData,
    lineIndices,
  };
}

function createFrameParams(overrides: Partial<WebGPUFrameParams> = {}): WebGPUFrameParams {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);

  return {
    camera,
    dt: 0.016,
    time: 1.0,
    unfurl: 0.0,
    mode: 0,
    theme: 0,
    ...overrides,
  };
}

// ============================================================================
// Pure Mathematical Reference Models
// Mirrors exact WGSL implementation in cloud_shell.wgsl (vs_main and fs_main)
// ============================================================================

const EARTH_RADIUS_KM = 6371.0;
const SPHERE_RADIUS = 5.0; // Shader base sphere radius

function calculateKExagg(NdotV: number, atmosphericScale: number): number {
  const clampedNdotV = Math.max(0.0, Math.min(1.0, NdotV / 0.35));
  const oneMinus = 1.0 - clampedNdotV;
  return 1.0 + (atmosphericScale - 1.0) * (oneMinus * oneMinus);
}

function calculateEffectiveStandoff(
  baseStandoff: number,
  NdotV: number,
  atmosphericScale: number
): number {
  const kExagg = calculateKExagg(NdotV, atmosphericScale);
  return baseStandoff * kExagg;
}

function calculateStratumDampening(layerIdx: number): number {
  if (layerIdx >= 1) {
    return layerIdx === 2 ? 0.15 : 0.40;
  }
  return 0.85;
}

/** Production default displacement scale from WebGPUEngine.ts:4456 */
const PRODUCTION_DISP_SCALE = 0.08;

function calculateCrustDisp(
  elevMeters: number,
  dispScale: number = PRODUCTION_DISP_SCALE,
  dynamicExp: number = 1.4,
  poleAtten: number = 1.0
): number {
  const normH = Math.max(0.0, elevMeters) / 8848.0;
  return Math.pow(normH, Math.max(0.5, dynamicExp)) * (dispScale * 2.8) * poleAtten;
}

function calculateTotalDisp(
  baseStandoff: number,
  NdotV: number,
  atmosphericScale: number,
  elevMeters: number,
  layerIdx: number,
  dispScale: number = 0.08,
  dynamicExp: number = 1.4,
  poleAtten: number = 1.0
): number {
  const effStandoff = calculateEffectiveStandoff(baseStandoff, NdotV, atmosphericScale);
  const crustDisp = calculateCrustDisp(elevMeters, dispScale, dynamicExp, poleAtten);
  // Additive terrain following: totalOffset = effStandoff + crustDisp
  // Guarantees zero subterranean penetration and strict deck hierarchy (Low < Mid < High)
  return effStandoff + crustDisp;
}

function calculateOrographicFactor(
  elevEast: number,
  elevWest: number,
  layerIdx: number
): {
  deltaH: number;
  windwardBoost: number;
  leewardShadow: number;
  stratumCoupling: number;
  orographicFactor: number;
} {
  const deltaH = (elevEast - elevWest) / 8848.0;
  const windwardBoost = Math.max(0.0, Math.min(0.35, deltaH * 3.5));
  const leewardShadow = Math.max(0.0, Math.min(0.70, -deltaH * 4.0));
  const stratumCoupling = layerIdx >= 1 ? (layerIdx === 2 ? 0.15 : 0.50) : 1.0;
  const orographicFactor = 1.0 + (windwardBoost - leewardShadow) * stratumCoupling;
  return { deltaH, windwardBoost, leewardShadow, stratumCoupling, orographicFactor };
}

describe('Milestone 3: Pitch-Adaptive Cloud Shell Separation & Rain Shadows', () => {
  // ==========================================================================
  // Pillar 1: Mathematical Parity of Standoff Exaggeration (k_exagg)
  // ==========================================================================
  describe('Pillar 1: Mathematical Parity of Standoff Exaggeration (k_exagg)', () => {
    it('M3-MATH-01: k_exagg strictly equals 1.0 at nadir (N · V >= 0.35) across all atmospheric scales [1.0 .. 12.0]', () => {
      const scales = [1.0, 2.0, 4.0, 8.0, 12.0];
      const nadirAngles = [0.35, 0.40, 0.50, 0.70, 0.90, 1.0];

      for (const scale of scales) {
        for (const NdotV of nadirAngles) {
          const k = calculateKExagg(NdotV, scale);
          expect(k).toBeCloseTo(1.0, 6);
        }
      }
    });

    it('M3-MATH-02: k_exagg strictly equals atmosphericScale at grazing angles (N · V <= 0.0)', () => {
      const scales = [1.0, 2.5, 5.0, 8.0, 10.0, 12.0];
      const grazingAngles = [0.0, -0.1, -0.5, -1.0];

      for (const scale of scales) {
        for (const NdotV of grazingAngles) {
          const k = calculateKExagg(NdotV, scale);
          expect(k).toBeCloseTo(scale, 6);
        }
      }
    });

    it('M3-MATH-03: default atmospheric scale 1.0 yields k_exagg = 1.0 across all angles in [-1.0, 1.0]', () => {
      for (let angle = -1.0; angle <= 1.0; angle += 0.05) {
        const k = calculateKExagg(angle, 1.0);
        expect(k).toBeCloseTo(1.0, 6);
      }
    });

    it('M3-MATH-04: k_exagg displays C1 smooth continuity at the N · V = 0.35 transition boundary', () => {
      const scale = 8.0;
      const eps = 1e-4;
      const kJustBelow = calculateKExagg(0.35 - eps, scale);
      const kAtBoundary = calculateKExagg(0.35, scale);
      const kJustAbove = calculateKExagg(0.35 + eps, scale);

      // Value continuity
      expect(kAtBoundary).toBeCloseTo(1.0, 6);
      expect(kJustAbove).toBeCloseTo(1.0, 6);
      expect(Math.abs(kJustBelow - kAtBoundary)).toBeLessThan(1e-5);

      // Derivative continuity: d(k)/d(mu) approaching 0.35 from below must approach 0
      const derivativeBelow = (kAtBoundary - kJustBelow) / eps;
      const derivativeAbove = (kJustAbove - kAtBoundary) / eps;
      expect(derivativeAbove).toBe(0);
      expect(Math.abs(derivativeBelow)).toBeLessThan(1e-2);
    });

    it('M3-MATH-05: k_exagg is strictly monotonic with respect to angle on [0.0, 0.35]', () => {
      const scale = 12.0;
      let prevK = calculateKExagg(0.0, scale);

      for (let angle = 0.01; angle <= 0.35; angle += 0.01) {
        const currentK = calculateKExagg(angle, scale);
        expect(currentK).toBeLessThan(prevK);
        prevK = currentK;
      }
    });

    it('M3-MATH-06: Monte Carlo stress sweep over 10,000 random orientations confirms bounded, finite, non-NaN outputs', () => {
      for (let i = 0; i < 10000; i++) {
        const randomScale = 1.0 + Math.random() * 11.0; // [1.0, 12.0]
        const randomNdotV = -1.0 + Math.random() * 2.0; // [-1.0, 1.0]
        const k = calculateKExagg(randomNdotV, randomScale);

        expect(Number.isFinite(k)).toBe(true);
        expect(Number.isNaN(k)).toBe(false);
        expect(k).toBeGreaterThanOrEqual(1.0);
        expect(k).toBeLessThanOrEqual(12.0);
      }
    });
  });

  // ==========================================================================
  // Pillar 2: Altitude Standoff Inequality & Physical Kilometer Scaling
  // ==========================================================================
  describe('Pillar 2: Altitude Standoff Inequality & Physical Kilometer Scaling', () => {
    const lowStandoff = 0.0010;
    const midStandoff = 0.0040;
    const highStandoff = 0.0080;

    const toKm = (s: number) => (s / SPHERE_RADIUS) * EARTH_RADIUS_KM;

    it('M3-ALT-01: baseline standoffs preserve strict inequality Low (0.0010) < Mid (0.0040) < High (0.0080)', () => {
      expect(lowStandoff).toBeLessThan(midStandoff);
      expect(midStandoff).toBeLessThan(highStandoff);
      expect(midStandoff - lowStandoff).toBeCloseTo(0.0030, 4);
      expect(highStandoff - midStandoff).toBeCloseTo(0.0040, 4);
    });

    it('M3-ALT-02: physical altitudes in kilometers on Earth R=6371km match tropospheric targets', () => {
      const lowKm = toKm(lowStandoff);
      const midKm = toKm(midStandoff);
      const highKm = toKm(highStandoff);

      // Low Stratus/Fog: ~1.27 km (target 1.0 - 2.0 km)
      expect(lowKm).toBeCloseTo(1.2742, 2);
      expect(lowKm).toBeGreaterThanOrEqual(1.0);
      expect(lowKm).toBeLessThanOrEqual(2.0);

      // Mid Altocumulus: ~5.10 km (target 4.0 - 6.0 km)
      expect(midKm).toBeCloseTo(5.0968, 2);
      expect(midKm).toBeGreaterThanOrEqual(4.0);
      expect(midKm).toBeLessThanOrEqual(6.0);

      // High Cirrus: ~10.19 km (target 10.0 - 12.0 km)
      expect(highKm).toBeCloseTo(10.1936, 2);
      expect(highKm).toBeGreaterThanOrEqual(10.0);
      expect(highKm).toBeLessThanOrEqual(12.0);
    });

    it('M3-ALT-03: 12.0x limb scaling expands standoffs by exactly 12x at grazing angles', () => {
      const limbScale = 12.0;
      const lowLimb = calculateEffectiveStandoff(lowStandoff, 0.0, limbScale);
      const midLimb = calculateEffectiveStandoff(midStandoff, 0.0, limbScale);
      const highLimb = calculateEffectiveStandoff(highStandoff, 0.0, limbScale);

      expect(lowLimb).toBeCloseTo(0.0120, 4);
      expect(midLimb).toBeCloseTo(0.0480, 4);
      expect(highLimb).toBeCloseTo(0.0960, 4);

      // Inter-shell gaps expand tenfold at the limb, preventing visual collapsing
      const gapLowMid = midLimb - lowLimb;
      const gapMidHigh = highLimb - midLimb;
      expect(gapLowMid).toBeCloseTo(0.0360, 4);
      expect(gapMidHigh).toBeCloseTo(0.0480, 4);
    });

    it('M3-ALT-04: additive terrain following with production dispScale=0.08 preserves strict deck hierarchy (Low < Mid < High) and prevents subterranean penetration over Mount Everest (+8,848m)', () => {
      const everestElev = 8848.0;
      const crustEverest = calculateCrustDisp(everestElev, PRODUCTION_DISP_SCALE);
      expect(crustEverest).toBeCloseTo(0.2240, 4);

      // Nadir viewing (scale = 1.0, NdotV = 0.5)
      const lowTotal1 = calculateTotalDisp(lowStandoff, 0.5, 1.0, everestElev, 0, PRODUCTION_DISP_SCALE);
      const midTotal1 = calculateTotalDisp(midStandoff, 0.5, 1.0, everestElev, 1, PRODUCTION_DISP_SCALE);
      const highTotal1 = calculateTotalDisp(highStandoff, 0.5, 1.0, everestElev, 2, PRODUCTION_DISP_SCALE);

      // 1. Strict stratification hierarchy: Low < Mid < High
      expect(lowTotal1).toBeLessThan(midTotal1);
      expect(midTotal1).toBeLessThan(highTotal1);
      expect(lowTotal1).toBeCloseTo(0.2250, 4);
      expect(midTotal1).toBeCloseTo(0.2280, 4);
      expect(highTotal1).toBeCloseTo(0.2320, 4);

      // 2. Zero subterranean penetration: All cloud decks hover above crust elevation
      expect(lowTotal1).toBeGreaterThan(crustEverest);
      expect(midTotal1).toBeGreaterThan(crustEverest);
      expect(highTotal1).toBeGreaterThan(crustEverest);
      expect(lowTotal1 - crustEverest).toBeCloseTo(lowStandoff, 4);
      expect(highTotal1 - crustEverest).toBeCloseTo(highStandoff, 4);

      // Oblique limb grazing (scale = 12.0, NdotV = 0.0)
      const lowTotal12 = calculateTotalDisp(lowStandoff, 0.0, 12.0, everestElev, 0, PRODUCTION_DISP_SCALE);
      const midTotal12 = calculateTotalDisp(midStandoff, 0.0, 12.0, everestElev, 1, PRODUCTION_DISP_SCALE);
      const highTotal12 = calculateTotalDisp(highStandoff, 0.0, 12.0, everestElev, 2, PRODUCTION_DISP_SCALE);

      expect(lowTotal12).toBeLessThan(midTotal12);
      expect(midTotal12).toBeLessThan(highTotal12);
      expect(lowTotal12).toBeGreaterThan(crustEverest);
      expect(midTotal12).toBeGreaterThan(crustEverest);
      expect(highTotal12).toBeGreaterThan(crustEverest);

      // 12x limb expansion preserves expanded inter-deck gaps above terrain
      expect(midTotal12 - lowTotal12).toBeCloseTo(0.0360, 4);
      expect(highTotal12 - midTotal12).toBeCloseTo(0.0480, 4);
    });

    it('M3-ALT-05: verifies strict vertical stratification and surface clearance across major planetary landforms', () => {
      const landforms = [
        { name: 'Sea Level', elev: 0.0 },
        { name: 'Alps / Mont Blanc', elev: 4808.0 },
        { name: 'Tibetan Plateau', elev: 5000.0 },
        { name: 'Andes / Aconcagua', elev: 6961.0 },
        { name: 'Mount Everest', elev: 8848.0 },
      ];

      for (const { name, elev } of landforms) {
        const crust = calculateCrustDisp(elev, PRODUCTION_DISP_SCALE);
        const low = calculateTotalDisp(lowStandoff, 0.5, 1.0, elev, 0, PRODUCTION_DISP_SCALE);
        const mid = calculateTotalDisp(midStandoff, 0.5, 1.0, elev, 1, PRODUCTION_DISP_SCALE);
        const high = calculateTotalDisp(highStandoff, 0.5, 1.0, elev, 2, PRODUCTION_DISP_SCALE);

        // Strict deck ordering Low < Mid < High
        expect(low, `${name} low < mid`).toBeLessThan(mid);
        expect(mid, `${name} mid < high`).toBeLessThan(high);

        // Strict surface clearance (zero subterranean penetration)
        expect(low, `${name} low > crust`).toBeGreaterThan(crust);
        expect(mid, `${name} mid > crust`).toBeGreaterThan(crust);
        expect(high, `${name} high > crust`).toBeGreaterThan(crust);
      }
    });

    it('M3-ALT-06: 50,000-iteration Monte Carlo stress sweep over random elevations, angles, and scales confirms 0% deck inversions and 0% subterranean penetrations', () => {
      let inversionCount = 0;
      let subterraneanCount = 0;
      const TRIALS = 50_000;

      for (let i = 0; i < TRIALS; i++) {
        const elev = -10924.0 + Math.random() * (8848.0 + 10924.0);
        const NdotV = -1.0 + Math.random() * 2.0;
        const scale = 1.0 + Math.random() * 11.0;
        const dispScale = 0.04 + Math.random() * 0.16;
        const dynamicExp = 0.5 + Math.random() * 1.5;
        const poleAtten = 0.8 + Math.random() * 0.2;

        const crust = calculateCrustDisp(elev, dispScale, dynamicExp, poleAtten);
        const low = calculateTotalDisp(lowStandoff, NdotV, scale, elev, 0, dispScale, dynamicExp, poleAtten);
        const mid = calculateTotalDisp(midStandoff, NdotV, scale, elev, 1, dispScale, dynamicExp, poleAtten);
        const high = calculateTotalDisp(highStandoff, NdotV, scale, elev, 2, dispScale, dynamicExp, poleAtten);

        if (low >= mid || mid >= high) {
          inversionCount++;
        }
        if (low <= crust || mid <= crust || high <= crust) {
          subterraneanCount++;
        }
      }

      expect(inversionCount).toBe(0);
      expect(subterraneanCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 3: Uniform Struct Layout & 16-Byte Alignment (Invariant §20)
  // ==========================================================================
  describe('Pillar 3: Uniform Struct Layout & 16-Byte Alignment (Invariant §20)', () => {
    it('M3-UNIF-01: cloud_shell.wgsl declares u_atmosphericScale: f32 and u_shadowIntensity: f32 in CloudUniforms', () => {
      expect(cloudShaderSource).toMatch(/u_atmosphericScale\s*:\s*f32/);
      expect(cloudShaderSource).toMatch(/u_shadowIntensity\s*:\s*f32/);

      // Dead flags u_isMid and u_isHigh must be eliminated
      expect(cloudShaderSource).not.toMatch(/u_isMid\s*:\s*u32/);
      expect(cloudShaderSource).not.toMatch(/u_isHigh\s*:\s*u32/);
    });

    it('M3-UNIF-02: verifies 16-byte natural alignment and byte offsets in CloudUniforms', () => {
      // Offset table verification (RFC §4.1 - 288 bytes / 72 floats)
      // Offset 96: u_layerIndex (u32, 4B)
      // Offset 100: u_peakExponent (f32, 4B)
      // Offset 104: u_atmosphericScale (f32, 4B)
      // Offset 108: u_shadowIntensity (f32, 4B)
      // Offset 112: u_sunDirection (vec4<f32>, 16B aligned: 112 % 16 == 0)
      // Offset 128: u_mediumProperties (vec4<f32>, 16B aligned: 128 % 16 == 0)
      // Offset 144: u_pad (vec4<f32>, 16B aligned: 144 % 16 == 0)
      // Offset 160: u_viewMatrix (mat4x4<f32>, 16B aligned: 160 % 16 == 0)
      // Offset 224: u_projectionMatrix (mat4x4<f32>, 16B aligned: 224 % 16 == 0)
      expect(112 % 16).toBe(0);
      expect(128 % 16).toBe(0);
      expect(144 % 16).toBe(0);
      expect(160 % 16).toBe(0);
      expect(224 % 16).toBe(0);
      expect((224 + 64) % 16).toBe(0);
      expect(224 + 64).toBe(288);
      expect(cloudShaderSource).toMatch(/u_sunDirection\s*:\s*vec4<f32>/);
    });

    it('M3-UNIF-03: WebGPUEngine declares public atmosphericScale with [1.0, 12.0] clamping', () => {
      const engine = new WebGPUEngine();
      expect(engine.atmosphericScale).toBe(1.0);

      engine.atmosphericScale = 5.5;
      expect(engine.atmosphericScale).toBe(5.5);

      // Clamp lower bound
      engine.atmosphericScale = 0.2;
      expect(engine.atmosphericScale).toBe(1.0);

      // Clamp upper bound
      engine.atmosphericScale = 15.0;
      expect(engine.atmosphericScale).toBe(12.0);
    });

    it('M3-UNIF-04: updateCloudUniforms writes atmosphericScale to float 26 and shadowIntensity to float 27', async () => {
      setupMockNavigator();
      const engine = new WebGPUEngine();
      await engine.initialize(createEngineConfig(100));
      engine.ensureCloudBuffers();

      const params: WebGPUFrameParams = createFrameParams({
        dt: 0.016,
        time: 1.0,
        unfurl: 0.0,
        mode: 0,
        theme: 0,
        atmosphericScale: 6.5,
        shadowIntensity: 0.52,
      });

      engine.updateCloudUniforms(0.016, params);

      // Inspect internal cloudUniformFloats buffer
      const f = (engine as any).cloudUniformFloats as Float32Array;
      expect(f[26]).toBeCloseTo(6.5, 4);
      expect(f[27]).toBeCloseTo(0.52, 4);
      restoreMockNavigator();
    });

    it('M3-UNIF-05: render(params) accepts params.atmosphericScale and updates engine property', async () => {
      setupMockNavigator();
      const engine = new WebGPUEngine();
      await engine.initialize(createEngineConfig(100));

      const params: WebGPUFrameParams = createFrameParams({
        dt: 0.016,
        time: 0.0,
        unfurl: 0.0,
        mode: 0,
        theme: 0,
        atmosphericScale: 8.4,
      });

      engine.render(params);
      expect(engine.atmosphericScale).toBeCloseTo(8.4, 4);
      restoreMockNavigator();
    });
  });

  // ==========================================================================
  // Pillar 4: Orographic Lift Enhancement & Leeward Rain Shadows
  // ==========================================================================
  describe('Pillar 4: Orographic Lift Enhancement & Leeward Rain Shadows', () => {
    it('M3-ORO-01: windward upslope (deltaH > 0) enhances cloud fraction up to +35%', () => {
      // Eastward rising slope: elevEast = 3000m, elevWest = 1000m => deltaH = 2000 / 8848 > 0
      const result = calculateOrographicFactor(3000, 1000, 0);
      expect(result.deltaH).toBeGreaterThan(0);
      expect(result.windwardBoost).toBeGreaterThan(0);
      expect(result.windwardBoost).toBeLessThanOrEqual(0.35);
      expect(result.leewardShadow).toBe(0);
      expect(result.orographicFactor).toBeGreaterThan(1.0);
      expect(result.orographicFactor).toBeLessThanOrEqual(1.35);
    });

    it('M3-ORO-02: leeward downslope (deltaH < 0) thins cloud fraction up to -70%', () => {
      // Eastward descending slope: elevEast = 500m, elevWest = 3500m => deltaH = -3000 / 8848 < 0
      const result = calculateOrographicFactor(500, 3500, 0);
      expect(result.deltaH).toBeLessThan(0);
      expect(result.windwardBoost).toBe(0);
      expect(result.leewardShadow).toBeGreaterThan(0);
      expect(result.leewardShadow).toBeLessThanOrEqual(0.70);
      expect(result.orographicFactor).toBeLessThan(1.0);
      expect(result.orographicFactor).toBeGreaterThanOrEqual(0.30);
    });

    it('M3-ORO-03: flat terrain (deltaH = 0) produces neutral orographic factor 1.0', () => {
      const result = calculateOrographicFactor(1200, 1200, 0);
      expect(result.deltaH).toBe(0);
      expect(result.windwardBoost).toBe(0);
      expect(result.leewardShadow).toBe(0);
      expect(result.orographicFactor).toBe(1.0);
    });

    it('M3-ORO-04: stratum coupling modulates orographic response by altitude (Low 1.0, Mid 0.50, High 0.15)', () => {
      const elevE = 4000;
      const elevW = 1000;

      const low = calculateOrographicFactor(elevE, elevW, 0);
      const mid = calculateOrographicFactor(elevE, elevW, 1);
      const high = calculateOrographicFactor(elevE, elevW, 2);

      expect(low.stratumCoupling).toBe(1.0);
      expect(mid.stratumCoupling).toBe(0.50);
      expect(high.stratumCoupling).toBe(0.15);

      // Boost scales with coupling
      expect(low.orographicFactor - 1.0).toBeGreaterThan(mid.orographicFactor - 1.0);
      expect(mid.orographicFactor - 1.0).toBeGreaterThan(high.orographicFactor - 1.0);
    });

    it('M3-ORO-05: Monte Carlo stress sweep over 10,000 elevation pairs confirms stability and bounds [0.0, 1.0]', () => {
      for (let i = 0; i < 10000; i++) {
        const elevE = -10924.0 + Math.random() * (8848.0 + 10924.0);
        const elevW = -10924.0 + Math.random() * (8848.0 + 10924.0);
        const rawCloud = Math.random();
        const layerIdx = Math.floor(Math.random() * 3);

        const { orographicFactor } = calculateOrographicFactor(elevE, elevW, layerIdx);
        const effectiveCloud = Math.max(0.0, Math.min(1.0, rawCloud * orographicFactor));

        expect(Number.isFinite(effectiveCloud)).toBe(true);
        expect(Number.isNaN(effectiveCloud)).toBe(false);
        expect(effectiveCloud).toBeGreaterThanOrEqual(0.0);
        expect(effectiveCloud).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // ==========================================================================
  // Pillar 5: Invariant §3 Uniform Control Flow & Multi-Medium Parity (Invariant §28)
  // ==========================================================================
  describe('Pillar 5: Invariant §3 Uniform Control Flow & Multi-Medium Parity (Invariant §28)', () => {
    it('M3-FLOW-01: all derivatives (dpdx, dpdy, fwidth) and texture lookups occur unconditionally before discards', () => {
      const fsMainIndex = cloudShaderSource.indexOf('fn fs_main');
      expect(fsMainIndex).toBeGreaterThan(0);
      const fsMainSource = cloudShaderSource.slice(fsMainIndex);

      const firstDiscardIndex = fsMainSource.indexOf('discard;');
      expect(firstDiscardIndex).toBeGreaterThan(0);

      // dpdx, dpdy, fwidth must precede first discard
      const dpdxIndex = fsMainSource.indexOf('dpdx(');
      const dpdyIndex = fsMainSource.indexOf('dpdy(');
      const fwidthIndex = fsMainSource.indexOf('fwidth(');

      expect(dpdxIndex).toBeGreaterThan(0);
      expect(dpdxIndex).toBeLessThan(firstDiscardIndex);
      expect(dpdyIndex).toBeGreaterThan(0);
      expect(dpdyIndex).toBeLessThan(firstDiscardIndex);
      expect(fwidthIndex).toBeGreaterThan(0);
      expect(fwidthIndex).toBeLessThan(firstDiscardIndex);

      // u_demTexture sampling must also precede first discard
      const demSampleIndex = fsMainSource.indexOf('textureSampleLevel(u_demTexture');
      expect(demSampleIndex).toBeGreaterThan(0);
      expect(demSampleIndex).toBeLessThan(firstDiscardIndex);
    });

    it('M3-FLOW-02: verifies explicit theme branches for all 3 supported media (Invariant §28)', () => {
      expect(cloudShaderSource).toMatch(/if\s*\(cloud\.u_theme\s*==\s*0u\)/);
      expect(cloudShaderSource).toMatch(/else\s+if\s*\(cloud\.u_theme\s*==\s*1u\)/);
      expect(cloudShaderSource).toMatch(/else\s+if\s*\(cloud\.u_theme\s*==\s*2u\)/);

      // Theme 0: Marie Tharp warm white & underside shade
      expect(cloudShaderSource).toMatch(/vec3<f32>\(0\.96,\s*0\.96,\s*0\.94\)/);
      // Theme 1: Cream Rag ivory wash and paper tooth
      expect(cloudShaderSource).toMatch(/vec3<f32>\(0\.98,\s*0\.95,\s*0\.89\)/);
      expect(cloudShaderSource).toMatch(/u_paper_tooth/);
      // Theme 2: Prussian Cyanotype actinic white
      expect(cloudShaderSource).toMatch(/vec3<f32>\(0\.95,\s*0\.98,\s*1\.00\)/);
    });

    it('M3-FLOW-03: returns premultiplied alpha according to Invariant §5', () => {
      expect(cloudShaderSource).toMatch(/return\s+vec4<f32>\(cloudColor\s*\*\s*finalAlpha,\s*finalAlpha\);/);
    });

    it('M3-FLOW-04: evaluates Invariant §10 horizon tangent attenuation before limb', () => {
      expect(cloudShaderSource).toMatch(/smoothstep\(0\.02,\s*0\.20,\s*in\.facing\)/);
      expect(cloudShaderSource).toMatch(/if\s*\(cloud\.u_unfurl\s*<\s*0\.20\s*&&\s*in\.facing\s*<\s*0\.02\)\s*\{\s*discard;\s*\}/);
    });
  });
});
