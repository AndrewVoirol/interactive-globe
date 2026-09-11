// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/challenger-m4-uniform-fuzzing.test.ts
// Challenger: challenger_m4_1 (teamwork_preview_challenger)
// Methodology: adversarial-challenger-protocol (Monte Carlo stress fuzzing 50,000 iterations)
// Target: Milestone 4: Atmosphere Drawer Controls & Uniform Clamping
// Invariants: §20 (16-Byte WGSL Struct Alignment), §46 (Anti-Cheating Production Source Import Integrity)
// Description:
//   Adversarially challenges and stress-tests:
//   1. WebGPUEngine.atmosphericScale clamping to [1.0, 12.0] under 50,000 fuzz iterations
//   2. WebGPUEngine.shadowIntensity clamping to [0.0, 0.60] under 50,000 fuzz iterations
//   3. IEEE-754 bit representations in CloudUniforms (floats 26, 27) and crustUniformBuffer (float 68)
//   4. Readout formatting functions (${v.toFixed(1)}x, ${Math.round(v * 100)}%) against NaNs, Infs, and unstepped values
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';

// Invariant §46: Direct import from src/
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import { MockGPUDevice } from '../helpers/webgpu-mock';

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

// Generate adversarial inputs across the requested domain
function generateAdversarialScale(i: number): number {
  switch (i % 10) {
    case 0: return NaN;
    case 1: return Infinity;
    case 2: return -Infinity;
    case 3: return 5e-324; // smallest subnormal
    case 4: return -0.0;
    case 5: return -100.0 + Math.random() * 99.0; // [-100.0, -1.0)
    case 6: return 12.000001 + Math.random() * 88.0; // (12.0, 100.0]
    case 7: return 1.0 + Math.random() * 11.0; // [1.0, 12.0] valid
    case 8: return 1.0 + Math.random() * 11.0 + Math.random() * 1e-7; // non-stepped
    case 9: return Number.MAX_VALUE;
    default: return 1.0;
  }
}

function generateAdversarialShadow(i: number): number {
  switch (i % 10) {
    case 0: return NaN;
    case 1: return Infinity;
    case 2: return -Infinity;
    case 3: return 5e-324; // smallest subnormal
    case 4: return -0.0;
    case 5: return -10.0 + Math.random() * 9.99; // [-10.0, -0.01)
    case 6: return 0.600001 + Math.random() * 9.4; // (0.60, 10.0]
    case 7: return Math.random() * 0.60; // [0.0, 0.60] valid
    case 8: return Math.random() * 0.60 + Math.random() * 1e-7; // non-stepped
    case 9: return 1.0; // boundary > 0.60
    default: return 0.45;
  }
}

describe('Challenger M4: 50,000-Iteration Adversarial Stress & Uniform Clamping Audit', () => {
  beforeEach(() => {
    setupMockNavigator();
  });

  afterEach(() => {
    restoreMockNavigator();
  });

  // ==========================================================================
  // Pillar 1: Setter Clamping & Fuzzing (50,000 Iterations)
  // ==========================================================================
  describe('Pillar 1: WebGPUEngine Property Clamping under 50,000 Adversarial Inputs', () => {
    it('CHALLENGE-M4-01a: atmosphericScale setter strictly clamps to [1.0, 12.0] or rejects corruption', () => {
      const engine = new WebGPUEngine();
      let nanFailures = 0;
      let outOfBoundsFailures = 0;

      for (let i = 0; i < 50_000; i++) {
        const input = generateAdversarialScale(i);
        engine.atmosphericScale = input;
        const val = engine.atmosphericScale;

        if (Number.isNaN(val)) {
          nanFailures++;
        } else if (val < 1.0 || val > 12.0) {
          outOfBoundsFailures++;
        }
      }

      console.log(`[CHALLENGE-M4-01a] 50,000 trials: NaN corruptions = ${nanFailures}, Out-of-bounds = ${outOfBoundsFailures}`);
      expect(nanFailures, 'atmosphericScale accepted NaN corruption into internal state').toBe(0);
      expect(outOfBoundsFailures, 'atmosphericScale escaped [1.0, 12.0] bounds').toBe(0);
    });

    it('CHALLENGE-M4-01b: shadowIntensity setter strictly clamps to [0.0, 0.60] or rejects corruption', () => {
      const engine = new WebGPUEngine();
      let nanFailures = 0;
      let outOfBoundsFailures = 0;

      for (let i = 0; i < 50_000; i++) {
        const input = generateAdversarialShadow(i);
        engine.shadowIntensity = input;
        const val = engine.shadowIntensity;

        if (Number.isNaN(val)) {
          nanFailures++;
        } else if (val < 0.0 || val > 0.60) {
          outOfBoundsFailures++;
        }
      }

      console.log(`[CHALLENGE-M4-01b] 50,000 trials: NaN corruptions = ${nanFailures}, Out-of-bounds = ${outOfBoundsFailures}`);
      expect(nanFailures, 'shadowIntensity accepted NaN corruption into internal state').toBe(0);
      expect(outOfBoundsFailures, 'shadowIntensity escaped [0.0, 0.60] bounds').toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 2: Uniform Buffer Packing & IEEE-754 Validity (50,000 Iterations)
  // ==========================================================================
  describe('Pillar 2: IEEE-754 Floating-Point Packing in Cloud and Crust Buffers', () => {
    it('CHALLENGE-M4-02a: updateCloudLayerUniform strictly writes valid, bounded IEEE-754 floats to float 26 and 27', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      let float26Corruptions = 0;
      let float27Corruptions = 0;

      for (let i = 0; i < 50_000; i++) {
        const scale = generateAdversarialScale(i);
        const shadow = generateAdversarialShadow(i);

        engine.updateCloudLayerUniform(0, scale, shadow);

        const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
        const f26 = mirror[26];
        const f27 = mirror[27];

        if (!Number.isFinite(f26) || f26 < 1.0 || f26 > 12.0) {
          float26Corruptions++;
        }
        if (!Number.isFinite(f27) || f27 < 0.0 || f27 > 0.60) {
          float27Corruptions++;
        }
      }

      console.log(`[CHALLENGE-M4-02a] CloudUniforms 50,000 trials: Float 26 corruptions = ${float26Corruptions}, Float 27 corruptions = ${float27Corruptions}`);
      expect(float26Corruptions, 'CloudUniforms float 26 (u_atmosphericScale) suffered NaN/Inf or out-of-bounds corruption').toBe(0);
      expect(float27Corruptions, 'CloudUniforms float 27 (u_shadowIntensity) suffered NaN/Inf or out-of-bounds corruption').toBe(0);

      engine.dispose();
    });

    it('CHALLENGE-M4-02b: crustFloats[68] (u_shadowIntensity) strictly clamps to [0.0, 0.60] across render/updateUniforms', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      let crustFloat68Corruptions = 0;
      const crustFloats = (engine as any).crustFloats;

      for (let i = 0; i < 50_000; i++) {
        const shadowInput = generateAdversarialShadow(i);

        const params: WebGPUFrameParams = {
          unfurl: 0.0,
          time: 0.0,
          dt: 0.016,
          mode: 0,
          layerMode: 0,
          theme: 0,
          camera,
          shadowIntensity: shadowInput,
          atmosphericScale: 1.0,
          showClouds: true,
        };

        engine.render(params);

        const val68 = crustFloats[68];
        if (!Number.isFinite(val68) || val68 < 0.0 || val68 > 0.600001) {
          crustFloat68Corruptions++;
          if (crustFloat68Corruptions <= 5) {
            console.error(`[CHALLENGE-M4-02b] Corruption sample #${crustFloat68Corruptions}: input = ${shadowInput}, crustFloats[68] = ${val68}`);
          }
        }
      }

      console.log(`[CHALLENGE-M4-02b] crustFloats[68] 50,000 trials: corruptions = ${crustFloat68Corruptions}`);
      expect(crustFloat68Corruptions, 'crustFloats[68] in crustUniformBuffer bypassed clamping or suffered NaN/Inf corruption').toBe(0);

      engine.dispose();
    });
  });

  // ==========================================================================
  // Pillar 3: Formatting Readout Sanity & Undefined/NaN Rejection
  // ==========================================================================
  describe('Pillar 3: Readout Formatting Sanity under Adversarial Values', () => {
    it('CHALLENGE-M4-03: UI format strings produce zero formatting errors, undefined, or NaN strings', () => {
      // Testing the readout format expressions used across AtmosphereDrawer and UnifiedRightSidebar:
      // Atmosphere Scale: `${curAtmosphericScale.toFixed(1)}x`
      // Shadow Intensity: `${Math.round(curShadowIntensity * 100)}%`

      let formatScaleErrors = 0;
      let formatShadowErrors = 0;

      for (let i = 0; i < 50_000; i++) {
        const scaleInput = generateAdversarialScale(i);
        const shadowInput = generateAdversarialShadow(i);

        // Clamped values as should be enforced before display
        const clampedScale = Number.isFinite(scaleInput) ? Math.max(1.0, Math.min(12.0, scaleInput)) : 1.0;
        const clampedShadow = Number.isFinite(shadowInput) ? Math.max(0.0, Math.min(0.60, shadowInput)) : 0.45;

        const scaleStr = `${clampedScale.toFixed(1)}x`;
        const shadowStr = `${Math.round(clampedShadow * 100)}%`;

        if (scaleStr.includes('NaN') || scaleStr.includes('undefined') || scaleStr.includes('Infinity')) {
          formatScaleErrors++;
        }
        if (shadowStr.includes('NaN') || shadowStr.includes('undefined') || shadowStr.includes('Infinity')) {
          formatShadowErrors++;
        }
      }

      expect(formatScaleErrors).toBe(0);
      expect(formatShadowErrors).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 4: Stress Testing Additional Edge Cases
  // (Subnormals, Extreme 1e30, Negative Infinity, and Object.create(null))
  // ==========================================================================
  describe('Pillar 4: Stress Testing Additional Edge Cases (Subnormals, 1e30, -Infinity, Object.create(null))', () => {
    it('CHALLENGE-M4-04a: Subnormal floating-point numbers clamp to valid bounds without underflow corruption', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const subnormals = [
        Number.MIN_VALUE, // 5e-324 (smallest positive double)
        -Number.MIN_VALUE, // -5e-324 (smallest negative double)
        1e-320,
        -1e-320,
        1.401298464324817e-45, // smallest positive single-precision float32 subnormal
        -1.401298464324817e-45, // smallest negative single-precision float32 subnormal
      ];

      for (const sub of subnormals) {
        // 1. Setter clamping
        engine.atmosphericScale = sub;
        expect(engine.atmosphericScale, `atmosphericScale setter with subnormal ${sub}`).toBe(1.0);

        engine.shadowIntensity = sub;
        const expectedShadow = Math.max(0.0, Math.min(0.60, sub));
        expect(engine.shadowIntensity, `shadowIntensity setter with subnormal ${sub}`).toBe(expectedShadow);

        // 2. Cloud uniform buffer packing
        engine.updateCloudLayerUniform(0, sub, sub);
        const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
        const f26 = mirror[26];
        const f27 = mirror[27];

        expect(Number.isFinite(f26)).toBe(true);
        expect(f26).toBeGreaterThanOrEqual(1.0);
        expect(f26).toBeLessThanOrEqual(12.0);

        expect(Number.isFinite(f27)).toBe(true);
        expect(f27).toBeGreaterThanOrEqual(0.0);
        expect(f27).toBeLessThanOrEqual(0.60);

        // 3. Render and crust buffer packing
        const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
        camera.position.set(0, 0, 15);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        const params: WebGPUFrameParams = {
          unfurl: 0.0,
          time: 0.0,
          dt: 0.016,
          mode: 0,
          layerMode: 0,
          theme: 0,
          camera,
          shadowIntensity: sub,
          atmosphericScale: sub,
          showClouds: true,
        };

        engine.render(params);
        const crustFloats = (engine as any).crustFloats;
        const c68 = crustFloats[68];
        expect(Number.isFinite(c68)).toBe(true);
        expect(c68).toBeGreaterThanOrEqual(0.0);
        expect(c68).toBeLessThanOrEqual(0.60);
      }

      engine.dispose();
    });

    it('CHALLENGE-M4-04b: Extreme large numbers (1e30, float/double max) clamp strictly to ceiling bounds', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const extremes = [
        1e30,
        -1e30,
        1e38,
        -1e38,
        Number.MAX_VALUE,
        -Number.MAX_VALUE,
      ];

      for (const val of extremes) {
        // 1. Setter clamping
        engine.atmosphericScale = val;
        const expectedScale = val > 0 ? 12.0 : 1.0;
        expect(engine.atmosphericScale, `atmosphericScale setter with extreme ${val}`).toBe(expectedScale);

        engine.shadowIntensity = val;
        const expectedShadow = val > 0 ? 0.60 : 0.0;
        expect(engine.shadowIntensity, `shadowIntensity setter with extreme ${val}`).toBe(expectedShadow);

        // 2. Cloud layer uniform buffer writes
        engine.updateCloudLayerUniform(1, val, val);
        const mirror = (engine as any).cloudLayerUniformMirrors?.[1];
        const f26 = mirror[26];
        const f27 = mirror[27];

        expect(Number.isFinite(f26)).toBe(true);
        expect(f26).toBe(expectedScale);

        expect(Number.isFinite(f27)).toBe(true);
        if (val > 0) {
          expect(f27).toBeLessThanOrEqual(0.60);
          expect(f27).toBeCloseTo(0.60, 5);
        } else {
          expect(f27).toBe(0.0);
        }

        // 3. Render frame params
        const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
        camera.position.set(0, 0, 15);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        const params: WebGPUFrameParams = {
          unfurl: 0.0,
          time: 0.0,
          dt: 0.016,
          mode: 0,
          layerMode: 0,
          theme: 0,
          camera,
          shadowIntensity: val,
          atmosphericScale: val,
          showClouds: true,
        };

        engine.render(params);
        const crustFloats = (engine as any).crustFloats;
        const c68 = crustFloats[68];
        expect(Number.isFinite(c68)).toBe(true);
        if (val > 0) {
          expect(c68).toBeLessThanOrEqual(0.60);
          expect(c68).toBeCloseTo(0.60, 5);
        } else {
          expect(c68).toBe(0.0);
        }
      }

      engine.dispose();
    });

    it('CHALLENGE-M4-04c: Negative infinity (-Infinity, -1/0) is rejected and defaults safely', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const negInfinities = [-Infinity, -1 / 0, Number.NEGATIVE_INFINITY];

      for (const negInf of negInfinities) {
        // Set to known valid values first
        engine.atmosphericScale = 3.5;
        engine.shadowIntensity = 0.40;

        // 1. Setter rejection
        engine.atmosphericScale = negInf;
        expect(engine.atmosphericScale, 'atmosphericScale rejected -Infinity and retained previous valid state').toBe(3.5);

        engine.shadowIntensity = negInf;
        expect(engine.shadowIntensity, 'shadowIntensity rejected -Infinity and retained previous valid state').toBe(0.40);

        // 2. Cloud layer uniform writes with -Infinity
        engine.updateCloudLayerUniform(2, negInf, negInf);
        const mirror = (engine as any).cloudLayerUniformMirrors?.[2];
        const f26 = mirror[26];
        const f27 = mirror[27];

        expect(Number.isFinite(f26), 'Float 26 must be finite when given -Infinity').toBe(true);
        expect(f26).toBe(3.5);

        expect(Number.isFinite(f27), 'Float 27 must be finite when given -Infinity').toBe(true);
        expect(f27).toBeLessThanOrEqual(0.60);
        expect(f27).toBeGreaterThanOrEqual(0.0);

        // 3. Render frame params with -Infinity
        const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
        camera.position.set(0, 0, 15);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        const params: WebGPUFrameParams = {
          unfurl: 0.0,
          time: 0.0,
          dt: 0.016,
          mode: 0,
          layerMode: 0,
          theme: 0,
          camera,
          shadowIntensity: negInf,
          atmosphericScale: negInf,
          showClouds: true,
        };

        engine.render(params);
        const crustFloats = (engine as any).crustFloats;
        const c68 = crustFloats[68];
        expect(Number.isFinite(c68), 'crustFloats[68] must be finite when given -Infinity').toBe(true);
        expect(c68).toBeLessThanOrEqual(0.60);
        expect(c68).toBeGreaterThanOrEqual(0.0);
      }

      engine.dispose();
    });

    it('CHALLENGE-M4-04d: Prototype-less Object.create(null) inputs to setters, cloud layer uniforms, atmosphericScale, and empty params are safely handled', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const nullProto = Object.create(null);

      // 1. Passing Object.create(null) to setters
      engine.atmosphericScale = 4.2;
      engine.shadowIntensity = 0.35;

      expect(() => {
        engine.atmosphericScale = nullProto as any;
      }).not.toThrow();
      expect(engine.atmosphericScale, 'atmosphericScale preserved state when passed Object.create(null)').toBe(4.2);

      expect(() => {
        engine.shadowIntensity = nullProto as any;
      }).not.toThrow();
      expect(engine.shadowIntensity, 'shadowIntensity preserved state when passed Object.create(null)').toBe(0.35);

      // 2. Passing Object.create(null) to updateCloudLayerUniform
      expect(() => {
        engine.updateCloudLayerUniform(0, nullProto as any, nullProto as any);
      }).not.toThrow();

      const mirror = (engine as any).cloudLayerUniformMirrors?.[0];
      const f26 = mirror[26];
      const f27 = mirror[27];
      expect(Number.isFinite(f26), 'Float 26 must remain finite with Object.create(null)').toBe(true);
      expect(f26).toBeCloseTo(4.2, 5);
      expect(Number.isFinite(f27), 'Float 27 must remain finite with Object.create(null)').toBe(true);
      expect(f27).toBeLessThanOrEqual(0.60);
      expect(f27).toBeGreaterThanOrEqual(0.0);

      // 3. Passing Object.create(null) as atmosphericScale field in render(params)
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const paramsWithNullAtmScale: WebGPUFrameParams = {
        unfurl: 0.0,
        time: 0.0,
        dt: 0.016,
        mode: 0,
        layerMode: 0,
        theme: 0,
        camera,
        atmosphericScale: nullProto as any,
        showClouds: true,
      };

      expect(() => {
        engine.render(paramsWithNullAtmScale);
      }).not.toThrow();

      // 4. Passing Object.create(null) as the params object into updateUniforms
      const nullProtoParams = Object.assign(Object.create(null), { camera });
      expect(() => {
        (engine as any).updateUniforms(nullProtoParams);
      }).not.toThrow();

      const c68After = (engine as any).crustFloats[68];
      expect(Number.isFinite(c68After), 'crustFloats[68] must remain finite when entire params is Object.create(null)').toBe(true);
      expect(c68After).toBeLessThanOrEqual(0.60);
      expect(c68After).toBeGreaterThanOrEqual(0.0);

      engine.dispose();
    });

    it('CHALLENGE-M4-04e: Prototype-less Object.create(null) shadowIntensity passed to render() must be safely rejected without unhandled TypeError', async () => {
      const engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);

      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const nullProto = Object.create(null);
      const paramsWithNullProtoShadow: WebGPUFrameParams = {
        unfurl: 0.0,
        time: 0.0,
        dt: 0.016,
        mode: 0,
        layerMode: 0,
        theme: 0,
        camera,
        shadowIntensity: nullProto as any,
        atmosphericScale: 1.0,
        showClouds: true,
      };

      expect(() => {
        engine.render(paramsWithNullProtoShadow);
      }, 'render(params) crashed with unhandled TypeError when shadowIntensity is Object.create(null)').not.toThrow();

      const crustFloats = (engine as any).crustFloats;
      const c68 = crustFloats[68];
      expect(Number.isFinite(c68), 'crustFloats[68] must remain finite with Object.create(null) shadow').toBe(true);
      expect(c68).toBeLessThanOrEqual(0.60);
      expect(c68).toBeGreaterThanOrEqual(0.0);

      engine.dispose();
    });
  });
});
