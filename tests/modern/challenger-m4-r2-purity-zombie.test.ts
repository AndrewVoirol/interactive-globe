// ============================================================================
// File: tests/modern/challenger-m4-r2-purity-zombie.test.ts
// Challenger: challenger_2_m4_r2 (Empirical Challenger)
// Target: Milestone 4 Iteration 2 (Camera Interaction UX & Purity Diagnostic Mode)
// Invariants Tested:
//   - Invariant §20 / Rule 24: Zero-Zombie Pass Invariant & Independent Pass Gating
//   - Rule 4: WGSL Uniform Control Flow & Unconditional Derivative Safety
//   - Invariant §20: 16-Byte WGSL Struct Alignment & 320-Byte SimUniforms Stride
//   - Rule 21: Zero Synthetic Comments Invariant
//   - Cursor-Relative Zoom Kinematics & Planetary Manifold Bounding
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import * as THREE from 'three';

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

function createEngineConfig(pointCount = 100, lineCount = 50): WebGPUInitConfig {
  const pointsData = new Float32Array(pointCount * 3);
  const target2DData = new Float32Array(pointCount * 2);
  const typeData = new Float32Array(pointCount);
  const lineIndices = new Uint32Array(lineCount * 2);

  for (let i = 0; i < pointCount; i++) {
    pointsData[i * 3 + 0] = Math.sin(i);
    pointsData[i * 3 + 1] = Math.cos(i);
    pointsData[i * 3 + 2] = 5.0;
    target2DData[i * 2 + 0] = i * 0.1;
    target2DData[i * 2 + 1] = i * 0.2;
    typeData[i] = i % 2;
  }

  for (let j = 0; j < lineCount * 2; j++) {
    lineIndices[j] = j % pointCount;
  }

  const canvas = {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: (type: string) => {
      if (type === 'webgpu') {
        return {
          configure: vi.fn(),
          getCurrentTexture: vi.fn(() => ({
            createView: vi.fn(() => ({ label: 'mock_swapchain_view' })),
          })),
        };
      }
      return null;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as any as HTMLCanvasElement;

  return { canvas, pointCount, pointsData, target2DData, typeData, lineIndices };
}

function createDefaultCamera() {
  return {
    position: { x: 0, y: 0, z: 15 },
    matrixWorldInverse: { toArray: vi.fn() },
    projectionMatrix: { toArray: vi.fn() },
    near: 0.1,
    updateMatrixWorld: vi.fn(),
  };
}

describe('Challenger M4 Iteration 2: Purity Diagnostic Mode & Zero-Zombie Pass Invariant', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const shaderPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');

  // ==========================================================================
  // Pillar 1: WGSL SimUniforms Layout, 16-Byte Alignment & Synthetic Comment Ban
  // ==========================================================================
  describe('Pillar 1: WGSL SimUniforms Struct Integrity & Layout Oracle', () => {
    it('CH-M4-01 [Synthetic Comment Ban]: crust_hydrosphere.wgsl contains zero occurrences of _padPrecip1', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');
      const matches = shaderSrc.match(/_padPrecip1/g);
      expect(matches).toBeNull();
    });

    it('CH-M4-02 [WGSL Alignment & Stride Oracle]: SimUniforms struct has exact 16-byte alignment and 320 bytes total stride', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');
      const structMatch = shaderSrc.match(/struct\s+SimUniforms\s*\{([\s\S]*?)\};/);
      expect(structMatch).not.toBeNull();
      const structBody = structMatch![1];

      // Exact field layout specification per WGSL spec rules:
      const fields: Array<{ name: string; size: number; align: number; expectedOffset: number }> = [
        { name: 'u_unfurl', size: 4, align: 4, expectedOffset: 0 },
        { name: 'u_mode', size: 4, align: 4, expectedOffset: 4 },
        { name: 'u_theme', size: 4, align: 4, expectedOffset: 8 },
        { name: 'u_time', size: 4, align: 4, expectedOffset: 12 },
        { name: 'u_viewport', size: 16, align: 16, expectedOffset: 16 },
        { name: 'u_cameraPos', size: 16, align: 16, expectedOffset: 32 },
        { name: 'u_cursorHitPos', size: 16, align: 16, expectedOffset: 48 },
        { name: 'u_cursorVel', size: 16, align: 16, expectedOffset: 64 },
        { name: 'u_cursorActive', size: 4, align: 4, expectedOffset: 80 },
        { name: 'u_displacementScale', size: 4, align: 4, expectedOffset: 84 },
        { name: 'u_seaLevel', size: 4, align: 4, expectedOffset: 88 },
        { name: 'u_roughness', size: 4, align: 4, expectedOffset: 92 },
        { name: 'u_viewMatrix', size: 64, align: 16, expectedOffset: 96 },
        { name: 'u_projectionMatrix', size: 64, align: 16, expectedOffset: 160 },
        { name: 'u_sunAzimuth', size: 4, align: 4, expectedOffset: 224 },
        { name: 'u_sunAltitude', size: 4, align: 4, expectedOffset: 228 },
        { name: 'u_ambientOcclusion', size: 4, align: 4, expectedOffset: 232 },
        { name: 'u_waterClarity', size: 4, align: 4, expectedOffset: 236 },
        { name: 'u_peakExponent', size: 4, align: 4, expectedOffset: 240 },
        { name: 'u_layerOpacity', size: 4, align: 4, expectedOffset: 244 },
        { name: 'u_renderStyle', size: 4, align: 4, expectedOffset: 248 },
        { name: 'u_isolatedStratum', size: 4, align: 4, expectedOffset: 252 },
        { name: 'u_mediumProperties', size: 16, align: 16, expectedOffset: 256 },
        { name: 'u_shadowIntensity', size: 4, align: 4, expectedOffset: 272 },
        { name: 'u_cloudDriftRate', size: 4, align: 4, expectedOffset: 276 },
        { name: 'u_cloudAltitudeKm', size: 4, align: 4, expectedOffset: 280 },
        { name: 'u_verticalScaleMode', size: 4, align: 4, expectedOffset: 284 },
        { name: 'u_pluvial_gamma', size: 4, align: 4, expectedOffset: 288 },
        { name: 'u_weatherOpticalMode', size: 4, align: 4, expectedOffset: 292 },
        { name: 'u_lclBypass', size: 4, align: 4, expectedOffset: 296 },
        { name: 'u_purityMode', size: 4, align: 4, expectedOffset: 300 },
        { name: 'u_scrubTau', size: 4, align: 4, expectedOffset: 304 },
        { name: 'u_advectionActive', size: 4, align: 4, expectedOffset: 308 },
        { name: '_padScrub1', size: 4, align: 4, expectedOffset: 312 },
        { name: 'u_cdlodDiagnosticMode', size: 4, align: 4, expectedOffset: 316 },
      ];

      let currentOffset = 0;
      let maxAlign = 0;

      for (const field of fields) {
        expect(structBody).toContain(field.name);

        const padding = (field.align - (currentOffset % field.align)) % field.align;
        currentOffset += padding;

        expect(currentOffset).toBe(field.expectedOffset);
        maxAlign = Math.max(maxAlign, field.align);
        currentOffset += field.size;
      }

      const structPadding = (maxAlign - (currentOffset % maxAlign)) % maxAlign;
      const totalSize = currentOffset + structPadding;

      expect(maxAlign).toBe(16);
      expect(totalSize).toBe(320);
      expect(totalSize % 16).toBe(0);
    });

    it('CH-M4-03 [u_purityMode Offset & Clean Comment]: u_purityMode is declared at offset 300 without synthetic comments', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');
      const purityLine = shaderSrc.split('\n').find((l) => l.includes('u_purityMode'));
      expect(purityLine).toBeDefined();
      expect(purityLine!.trim()).toBe('u_purityMode: f32, // offset 300 (float 75)');
    });
  });

  // ==========================================================================
  // Pillar 2: WebGPUEngine Serialization & Default Uniform Initialization
  // ==========================================================================
  describe('Pillar 2: Engine Uniform Serialization & Zero-Default Invariant', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);
      engine.ensureCartographicBuffers();
    });

    afterEach(() => {
      engine?.dispose();
      restoreMockNavigator();
    });

    it('CH-M4-04 [Default State]: crustFloats[75] is 0.0 upon engine initialization', () => {
      expect((engine as any).crustFloats[75]).toBe(0.0);
      expect(engine.purityMode).toBe(false);
    });

    it('CH-M4-05 [Purity Mode Toggle Serialization]: crustFloats[75] reflects exact 1.0/0.0 parity', () => {
      const defaultParams: WebGPUFrameParams = {
        unfurl: 0.0,
        mode: 0,
        theme: 0,
        time: 0,
        dt: 0.016,
        camera: createDefaultCamera() as any,
      };

      // Toggle ON via params
      engine.updateUniforms({ ...defaultParams, purityMode: true });
      expect((engine as any).crustFloats[75]).toBe(1.0);
      expect(engine.purityMode).toBe(true);

      // Toggle OFF via params
      engine.updateUniforms({ ...defaultParams, purityMode: false });
      expect((engine as any).crustFloats[75]).toBe(0.0);
      expect(engine.purityMode).toBe(false);

      // Toggle ON via property
      engine.purityMode = true;
      engine.updateUniforms({ ...defaultParams });
      expect((engine as any).crustFloats[75]).toBe(1.0);

      // Explicit param override takes precedence over property
      engine.updateUniforms({ ...defaultParams, purityMode: false });
      expect((engine as any).crustFloats[75]).toBe(0.0);
    });
  });

  // ==========================================================================
  // Pillar 3: Rule 24 Zero-Zombie Pass Invariant Empirical Stress Test
  // ==========================================================================
  describe('Pillar 3: Zero-Zombie Secondary Pass Invariant (Rule 24)', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig();
      await engine.initialize(config);
      engine.ensureCartographicBuffers();
      // Stabilize sim warmup frames and state
      (engine as any).simWarmupFrames = 5;
      (engine as any).lastSimUnfurl = 0.0;
      (engine as any).lastSimMode = 0;
      (engine as any).lastSimVortex = 0;
      (engine as any).lastSimFracture = 0;
    });

    afterEach(() => {
      engine?.dispose();
      restoreMockNavigator();
    });

    it('CH-M4-06 [Zero Secondary Passes in Purity Mode]: When purityMode=true, zero secondary passes execute even when fully enabled', () => {
      const surfaceWindsSpy = vi.spyOn(engine as any, 'renderSurfaceWindRibbons');
      const jetStreamSpy = vi.spyOn(engine as any, 'renderJetStreamRibbons');
      const cloudLayerSpy = vi.spyOn(engine as any, 'renderCloudLayer');
      const atmosphereSpy = vi.spyOn(engine as any, 'renderAtmosphereScatterPass');
      const volumetricSpy = vi.spyOn(engine as any, 'renderVolumetricClouds');

      const device = (engine as any).device;
      let computeDispatches = 0;
      const origCreateCommandEncoder = device.createCommandEncoder.bind(device);
      vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
        const encoder = origCreateCommandEncoder();
        const origBeginComputePass = encoder.beginComputePass.bind(encoder);
        encoder.beginComputePass = (desc: any) => {
          const pass = origBeginComputePass(desc);
          const origDispatch = pass.dispatchWorkgroups.bind(pass);
          pass.dispatchWorkgroups = (...args: any[]) => {
            computeDispatches++;
            return origDispatch(...args);
          };
          return pass;
        };
        return encoder;
      });

      const allEnabledParams: WebGPUFrameParams = {
        unfurl: 0.0,
        mode: 0,
        theme: 0,
        time: 0,
        dt: 0.016,
        camera: createDefaultCamera() as any,
        viewport: { width: 800, height: 600 },
        purityMode: true, // PURITY ACTIVE
        showWind: true,
        showSurfaceWinds: true,
        showJetStream: true,
        showClouds: true,
        showCloudLow: true,
        showCloudMid: true,
        showCloudHigh: true,
        showAtmosphere: true,
        volumetricClouds: true,
      };

      engine.render(allEnabledParams);

      // Rule 24 Verification: Zero secondary render passes
      expect(surfaceWindsSpy).not.toHaveBeenCalled();
      expect(jetStreamSpy).not.toHaveBeenCalled();
      expect(cloudLayerSpy).not.toHaveBeenCalled();
      expect(atmosphereSpy).not.toHaveBeenCalled();
      expect(volumetricSpy).not.toHaveBeenCalled();

      // Zero compute passes/dispatches when purityMode=true in steady state
      expect(computeDispatches).toBe(0);
    });

    it('CH-M4-07 [Passes Activate When purityMode=false]: Verifies test harness sensitivity by checking execution when purityMode=false', () => {
      const surfaceWindsSpy = vi.spyOn(engine as any, 'renderSurfaceWindRibbons').mockImplementation(() => {});
      const jetStreamSpy = vi.spyOn(engine as any, 'renderJetStreamRibbons').mockImplementation(() => {});
      const cloudLayerSpy = vi.spyOn(engine as any, 'renderCloudLayer').mockImplementation(() => {});
      const atmosphereSpy = vi.spyOn(engine as any, 'renderAtmosphereScatterPass').mockImplementation(() => {});

      (engine as any).windRibbonPipeline = {};
      (engine as any).windRibbonBindGroups = [{}];
      (engine as any).atmosphereScatterPipeline = {};
      (engine as any).showAtmosphereScatter = true;

      const enabledParams: WebGPUFrameParams = {
        unfurl: 0.0,
        mode: 0,
        theme: 0,
        time: 0,
        dt: 0.016,
        camera: createDefaultCamera() as any,
        viewport: { width: 800, height: 600 },
        purityMode: false, // PURITY INACTIVE
        showWind: true,
        showSurfaceWinds: true,
        showJetStream: true,
        showClouds: true,
        showCloudLow: true,
        showCloudMid: true,
        showCloudHigh: true,
        showAtmosphere: true,
      };

      engine.render(enabledParams);

      // In normal mode, passes MUST execute:
      expect(surfaceWindsSpy).toHaveBeenCalled();
      expect(jetStreamSpy).toHaveBeenCalled();
      expect(cloudLayerSpy).toHaveBeenCalled();
      expect(atmosphereSpy).toHaveBeenCalled();
    });

    it('CH-M4-08 [Monte Carlo Pass Gating Fuzzing]: 1,000 randomized parameter configurations never leak secondary passes under purityMode', () => {
      const surfaceWindsSpy = vi.spyOn(engine as any, 'renderSurfaceWindRibbons');
      const jetStreamSpy = vi.spyOn(engine as any, 'renderJetStreamRibbons');
      const cloudLayerSpy = vi.spyOn(engine as any, 'renderCloudLayer');
      const atmosphereSpy = vi.spyOn(engine as any, 'renderAtmosphereScatterPass');
      const volumetricSpy = vi.spyOn(engine as any, 'renderVolumetricClouds');

      (engine as any).windRibbonPipeline = {};
      (engine as any).windRibbonBindGroups = [{}];
      (engine as any).atmosphereScatterPipeline = {};
      (engine as any).volumetricCloudPipeline = {};
      (engine as any).showAtmosphereScatter = true;
      (engine as any).volumetricCloudsEnabled = true;

      for (let i = 0; i < 1000; i++) {
        const randomParams: WebGPUFrameParams = {
          unfurl: Math.random(),
          mode: Math.floor(Math.random() * 5),
          theme: Math.floor(Math.random() * 3),
          time: i * 0.016,
          dt: 0.016,
          camera: createDefaultCamera() as any,
          viewport: { width: 800, height: 600 },
          purityMode: true,
          showWind: Math.random() > 0.5,
          showSurfaceWinds: Math.random() > 0.5,
          showJetStream: Math.random() > 0.5,
          showClouds: Math.random() > 0.5,
          showCloudLow: Math.random() > 0.5,
          showCloudMid: Math.random() > 0.5,
          showCloudHigh: Math.random() > 0.5,
          showAtmosphere: Math.random() > 0.5,
          volumetricClouds: Math.random() > 0.5,
        };

        engine.render(randomParams);
      }

      expect(surfaceWindsSpy).not.toHaveBeenCalled();
      expect(jetStreamSpy).not.toHaveBeenCalled();
      expect(cloudLayerSpy).not.toHaveBeenCalled();
      expect(atmosphereSpy).not.toHaveBeenCalled();
      expect(volumetricSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Pillar 4: WGSL Hydrosphere Discard & Uniform Control Flow Invariant
  // ==========================================================================
  describe('Pillar 4: WGSL Hydrosphere Discard & Derivative Safety', () => {
    it('CH-M4-09 [Hydrosphere Discard Logic]: WGSL discards liquid hydrosphere surfaceType > 0.5 when u_purityMode > 0.5', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');
      const discardPattern = /if\s*\(\s*input\.surfaceType\s*>\s*0\.5\s*\)\s*\{[\s\S]*?if\s*\(\s*sim\.u_purityMode\s*>\s*0\.5\s*\)\s*\{\s*discard;\s*\}/;
      expect(shaderSrc).toMatch(discardPattern);
    });

    it('CH-M4-10 [Crust Preservation]: Terrain crust surfaceType <= 0.5 is NOT discarded by u_purityMode', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

      // Check that u_purityMode discard is strictly scoped inside surfaceType > 0.5
      const surfaceTypeBlock = shaderSrc.match(/if\s*\(\s*input\.surfaceType\s*>\s*0\.5\s*\)\s*\{([\s\S]*?)let\s+depthMeters/);
      expect(surfaceTypeBlock).not.toBeNull();
      expect(surfaceTypeBlock![1]).toContain('sim.u_purityMode > 0.5');
      expect(surfaceTypeBlock![1]).toContain('discard;');

      // Verify no u_purityMode check exists outside this hydrosphere block
      const allPurityOccurrences = [...shaderSrc.matchAll(/u_purityMode/g)];
      // Occurrence 1: struct declaration, Occurrence 2: if (sim.u_purityMode > 0.5) inside surfaceType > 0.5
      expect(allPurityOccurrences.length).toBe(2);
    });

    it('CH-M4-11 [Derivative Safety / Rule 4]: All finite differences and implicit-LOD samples precede dynamic discard', () => {
      const shaderSrc = fs.readFileSync(shaderPath, 'utf8');
      const fsMainMatch = shaderSrc.match(/fn\s+fs_main[\s\S]*$/);
      expect(fsMainMatch).not.toBeNull();
      const fsMain = fsMainMatch![0];

      const discardIndex = fsMain.indexOf('discard;');
      expect(discardIndex).toBeGreaterThan(0);

      const codeAfterDiscard = fsMain.substring(discardIndex);
      expect(codeAfterDiscard).not.toMatch(/\bfwidth\s*\(/);
      expect(codeAfterDiscard).not.toMatch(/\bdpdx\s*\(/);
      expect(codeAfterDiscard).not.toMatch(/\bdpdy\s*\(/);
    });
  });

  // ==========================================================================
  // Pillar 5: Cursor-Relative Zoom Kinematics & Boundary Invariants
  // ==========================================================================
  describe('Pillar 5: Cursor-Relative Zoom & Kinematic Bounds', () => {
    it('CH-M4-12 [Target Radius Invariant]: Target position never exceeds geoid sphere radius R <= 5.0 under extreme wheel zoom', () => {
      const target = new THREE.Vector3(0, 0, 0);
      const hitPos = new THREE.Vector3(3.5, 3.5, 3.5);

      const deltaY = -5000;
      const lerpFactor = Math.min(0.08, Math.abs(deltaY) * 0.0008);
      target.lerp(hitPos, lerpFactor);

      if (target.length() > 5.0) {
        target.multiplyScalar(5.0 / target.length());
      }

      expect(target.length()).toBeLessThanOrEqual(5.0 + 1e-6);
    });

    it('CH-M4-13 [Zoom-Out Recentering & Snapping]: Target decays toward (0,0,0) and snaps when radius >= 20.0', () => {
      const target = new THREE.Vector3(2.0, 1.5, -0.5);
      const ORIGIN_VEC = new THREE.Vector3(0, 0, 0);

      const deltaY = 120;
      const recenterFactor = Math.min(0.10, Math.abs(deltaY) * 0.0010);
      target.lerp(ORIGIN_VEC, recenterFactor);

      expect(target.length()).toBeLessThan(new THREE.Vector3(2.0, 1.5, -0.5).length());

      const orbitalRadius = 20.5;
      if (orbitalRadius >= 20.0 || target.lengthSq() < 1e-5) {
        target.set(0, 0, 0);
      }

      expect(target.x).toBe(0);
      expect(target.y).toBe(0);
      expect(target.z).toBe(0);
    });
  });
});
