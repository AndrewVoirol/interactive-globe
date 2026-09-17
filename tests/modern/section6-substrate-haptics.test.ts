// ============================================================================
// File: tests/modern/section6-substrate-haptics.test.ts
// Architecture: Milestone Section 6 Verification Suite
// Invariants:
//   - Section 6.2: 4-Octave Anisotropic Worley & Plate Mark / Ink Ridge Formulation
//   - Section 6.3: WebGPU Pipeline Architecture (Substrate Micro-Relief -> Paper Composition)
//   - Section 6.4: 32-Byte PaperSubstrateUniforms & 16-Byte Alignment
//   - Invariant §24: Zero-Recompile Dynamic Medium Switching
//   - Rule 24: Zero-Zombie Pass Invariant in Purity Mode
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';

import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

const projectRoot = path.resolve(__dirname, '../..');
const microReliefShaderPath = path.join(projectRoot, 'src/webgpu/shaders/substrate_micro_relief.wgsl');
const compositionShaderPath = path.join(projectRoot, 'src/webgpu/shaders/paper_composition.wgsl');
const engineFilePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');

function createMockConfig(width = 1280, height = 720): WebGPUInitConfig {
  let mockContext: any;
  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: vi.fn((type: string) => (type === 'webgpu' ? mockContext : null)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;

  mockContext = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({ label: 'mock_swapchain_view' })),
    })),
    canvas,
  };

  return {
    canvas,
    pointCount: 128,
    pointsData: new Float32Array(128 * 3),
    target2DData: new Float32Array(128 * 2),
    typeData: new Float32Array(128),
    lineIndices: new Uint32Array(64 * 2),
  };
}

function createFrameParams(overrides: Partial<WebGPUFrameParams> = {}): WebGPUFrameParams {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);

  return {
    camera,
    mode: 0,
    unfurl: 0.0,
    theme: 1, // Default Cream Rag (Warm Ivory)
    dt: 0.016,
    time: 0.0,
    reliefActive: true,
    showRelief: true,
    showVectors: true,
    showClouds: false,
    showAtmosphere: false,
    substrateHaptics: true,
    ...overrides,
  };
}

describe('Milestone Section 6: Cartographic Intaglio Printing Haptics & Paper Tooth Micro-Deformations', () => {
  let microReliefWGSL: string;
  let compositionWGSL: string;
  let engineSource: string;

  beforeEach(() => {
    microReliefWGSL = fs.readFileSync(microReliefShaderPath, 'utf-8');
    compositionWGSL = fs.readFileSync(compositionShaderPath, 'utf-8');
    engineSource = fs.readFileSync(engineFilePath, 'utf-8');
  });

  // ==========================================================================
  // Pillar 1: Static Shader & Buffer Invariant Audit
  // ==========================================================================
  describe('Pillar 1: Static Shader Structure & Mathematical Formulations', () => {
    it('S6-01: confirms PaperSubstrateUniforms struct satisfies 32-byte layout across both shaders', () => {
      // 8 floats = 32 bytes (u_fiberFrequency, u_fiberAnisotropy, u_plateMarkDepthMeters, u_inkRidgeHeightMeters, u_grainAngleRadians, u_sheenIntensity, u_absorptionFeathering, _pad)
      const expectedFields = [
        'u_fiberFrequency: f32',
        'u_fiberAnisotropy: f32',
        'u_plateMarkDepthMeters: f32',
        'u_inkRidgeHeightMeters: f32',
        'u_grainAngleRadians: f32',
        'u_sheenIntensity: f32',
        'u_absorptionFeathering: f32',
      ];

      for (const field of expectedFields) {
        expect(microReliefWGSL).toContain(field);
        expect(compositionWGSL).toContain(field);
      }
    });

    it('S6-02: verifies Substrate Micro-Relief Compute Pass specifications', () => {
      // Workgroup size (16, 16)
      expect(microReliefWGSL).toMatch(/@workgroup_size\s*\(\s*16\s*,\s*16\s*\)/);
      // RGBA8Snorm write-only storage texture
      expect(microReliefWGSL).toMatch(/texture_storage_2d<\s*rgba8snorm\s*,\s*write\s*>/);
      // 4-octave anisotropic Worley network F(u)
      expect(microReliefWGSL).toContain('worleyAnisotropic');
      // Intaglio ink raised deposit ridge formula: h_ink * smoothstep(0.2, 0.8, I_ink)
      expect(microReliefWGSL).toMatch(/smoothstep\s*\(\s*0\.2\s*,\s*0\.8/);
      // Neatline plate mark beveled indentation
      expect(microReliefWGSL).toContain('evaluatePlateMark');
      // 4-tap central difference normal computation in cs_main
      expect(microReliefWGSL).toContain('dZ_dx = (zR - zL) / (2.0 * delta.x)');
    });

    it('S6-03: verifies Anisotropic Fiber BRDF composition shader specifications', () => {
      // Fullscreen single triangle vertex shader
      expect(compositionWGSL).toContain('@vertex');
      expect(compositionWGSL).toContain('vs_main');
      // Gram-Schmidt orthogonalized fiber tangent vector t
      expect(compositionWGSL).toContain('normalize(t0 - nPerturbed * dot(nPerturbed, t0))');
      // Marschner / Kajiya-Kay micro-cylinder specular lobe: (sinL * sinV + tDotL * tDotV) / (cosL + cosV)
      expect(compositionWGSL).toContain('cylinderSpecular');
      expect(compositionWGSL).toContain('specularLobe');
      // Raking light relief modulation
      expect(compositionWGSL).toContain('rakingFactor');
      // Unconditional uniform control flow top sampling (Rule 4)
      expect(compositionWGSL).toMatch(/let\s+sceneColor\s*=\s*textureSample/);
      expect(compositionWGSL).toMatch(/let\s+normalSample\s*=\s*textureSample/);
    });
  });

  // ==========================================================================
  // Pillar 2: Runtime WebGPU Engine Integration & Pass Routing
  // ==========================================================================
  describe('Pillar 2: Runtime WebGPU Engine Pipeline & Buffer Management', () => {
    let mockGPU: any;
    let engine: WebGPUEngine;

    beforeEach(async () => {
      mockGPU = createMockNavigatorGPU();
      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: mockGPU },
        writable: true,
        configurable: true,
      });
      engine = new WebGPUEngine();
    });

    it('S6-04: ensures 5-buffer invariant on boot and allocates uniform buffers lazily with exact byte allocations', async () => {
      const config = createMockConfig(1920, 1080);
      await engine.initialize(config);

      const device = (engine as any).device as MockGPUDevice;
      // Invariant §20: strictly maintains 5 core buffers at initialization
      expect(device.buffers.length).toBe(5);
      expect(engine.getPaperSubstrateUniformBuffer()).toBeNull();

      // Lazily allocate substrate haptics buffers
      engine.ensureSubstrateHapticsBuffers();
      expect(device.buffers.length).toBe(8); // 5 core + 3 substrate haptics buffers

      const paperBuf = engine.getPaperSubstrateUniformBuffer();
      const configBuf = (engine as any).substrateConfigUniformBuffer;
      const lightBuf = (engine as any).compositionLightingUniformBuffer;

      expect(paperBuf).not.toBeNull();
      expect(paperBuf.size).toBe(32); // 8 f32 = 32 bytes

      expect(configBuf).not.toBeNull();
      expect(configBuf.size).toBe(16); // 4 f32 = 16 bytes

      expect(lightBuf).not.toBeNull();
      expect(lightBuf.size).toBe(48); // 12 f32 = 48 bytes
    });

    it('S6-05: updateSubstrateTextures() allocates scene and normal textures with correct dimensions and usages', async () => {
      const config = createMockConfig(1024, 768);
      await engine.initialize(config);

      const sceneTex = engine.getSceneColorTexture() as any;
      const normalTex = engine.getPaperNormalTexture() as any;

      expect(sceneTex).not.toBeNull();
      expect(sceneTex.width).toBe(1024);
      expect(sceneTex.height).toBe(768);

      expect(normalTex).not.toBeNull();
      expect(normalTex.width).toBe(1024);
      expect(normalTex.height).toBe(768);
      expect(normalTex.format).toBe('rgba8snorm');
    });

    it('S6-06: render() executes compute pass and composition pass when substrateHaptics is true', async () => {
      const config = createMockConfig(800, 600);
      await engine.initialize(config);

      const device = (engine as any).device as MockGPUDevice;
      const origCreateCommandEncoder = device.createCommandEncoder.bind(device);

      let executedComputePasses = 0;
      let executedRenderPasses = 0;
      let compositionPassExecuted = false;

      device.createCommandEncoder = (desc?: any) => {
        const enc = origCreateCommandEncoder(desc);
        const origBeginComputePass = enc.beginComputePass.bind(enc);
        const origBeginRenderPass = enc.beginRenderPass.bind(enc);

        enc.beginComputePass = (pDesc: any) => {
          executedComputePasses++;
          return origBeginComputePass(pDesc);
        };

        enc.beginRenderPass = (rDesc: any) => {
          executedRenderPasses++;
          if (rDesc?.label === 'paper_composition_pass') {
            compositionPassExecuted = true;
          }
          return origBeginRenderPass(rDesc);
        };

        return enc;
      };

      const params = createFrameParams({ substrateHaptics: true, theme: 1 });
      engine.render(params);

      // Main render pass (sceneColorTexture) + paper composition render pass (swapchain)
      expect(compositionPassExecuted).toBe(true);
      expect(executedRenderPasses).toBeGreaterThanOrEqual(2);
      expect(executedComputePasses).toBeGreaterThanOrEqual(1);
    });

    it('S6-07: Invariant §24 - theme switching between Warm Ivory, Cyanotype, and Tharp requires zero recompilation', async () => {
      const config = createMockConfig(800, 600);
      await engine.initialize(config);

      const device = (engine as any).device as MockGPUDevice;
      const createRenderPipelineSpy = vi.spyOn(device as any, 'createRenderPipeline');
      const createComputePipelineSpy = vi.spyOn(device as any, 'createComputePipeline');

      // Execute 30 theme switches
      const themes = [1, 2, 0];
      for (let i = 0; i < 30; i++) {
        const targetTheme = themes[i % 3];
        const params = createFrameParams({ theme: targetTheme, substrateHaptics: true });
        engine.render(params);
      }

      // Dynamic theme switching must strictly operate via uniform buffers, never pipeline recompiles
      expect(createRenderPipelineSpy).not.toHaveBeenCalled();
      expect(createComputePipelineSpy).not.toHaveBeenCalled();
    });

    it('S6-08: Rule 24 - purityMode completely bypasses substrate compute pass', async () => {
      const config = createMockConfig(800, 600);
      await engine.initialize(config);

      // Stabilize sim warmup frames to steady state
      (engine as any).simWarmupFrames = 5;
      (engine as any).lastSimUnfurl = 0.0;
      (engine as any).lastSimMode = 0;
      (engine as any).lastSimVortex = 0;
      (engine as any).lastSimFracture = 0;

      const device = (engine as any).device as MockGPUDevice;
      const origCreateCommandEncoder = device.createCommandEncoder.bind(device);

      let computeDispatches = 0;

      device.createCommandEncoder = (desc?: any) => {
        const enc = origCreateCommandEncoder(desc);
        const origBeginComputePass = enc.beginComputePass.bind(enc);

        enc.beginComputePass = (pDesc: any) => {
          const cPass = origBeginComputePass(pDesc);
          const origDispatch = cPass.dispatchWorkgroups.bind(cPass);
          cPass.dispatchWorkgroups = (...args: any[]) => {
            computeDispatches++;
            return origDispatch(...args);
          };
          return cPass;
        };

        return enc;
      };

      // When purityMode=true, substrate haptics MUST be inactive
      const purityParams = createFrameParams({ purityMode: true, substrateHaptics: true });
      engine.render(purityParams);

      expect(computeDispatches).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 3: Monte Carlo Numerical Stability of Anisotropic BRDF
  // ==========================================================================
  describe('Pillar 3: Monte Carlo Numerical Stability & Fiber Optics', () => {
    it('S6-09: 1,000 randomized camera pitch angles evaluate to finite positive sheen coefficients', () => {
      // Evaluates CPU simulation of Marschner anisotropic sheen lobe
      function computeCylinderSheen(
        pitchDeg: number,
        grainAngleRad: number,
        azimuthDeg: number,
        altitudeDeg: number,
        sheenWeight: number
      ): number {
        const azRad = (azimuthDeg * Math.PI) / 180;
        const altRad = Math.max(0.05, (altitudeDeg * Math.PI) / 180);
        const cosAlt = Math.cos(altRad);
        const sinAlt = Math.sin(altRad);
        const omega_i = [Math.sin(azRad) * cosAlt, Math.cos(azRad) * cosAlt, sinAlt];

        const pitchRad = Math.min(85.0, Math.max(0.0, pitchDeg)) * (Math.PI / 180);
        const omega_o = [0.0, -Math.sin(pitchRad), Math.cos(pitchRad)];
        const vLen = Math.hypot(omega_o[0], omega_o[1], omega_o[2]);
        const oNorm = [omega_o[0] / vLen, omega_o[1] / vLen, omega_o[2] / vLen];

        const t = [Math.cos(grainAngleRad), Math.sin(grainAngleRad), 0.0];

        const tDotL = Math.max(-0.999, Math.min(0.999, t[0] * omega_i[0] + t[1] * omega_i[1] + t[2] * omega_i[2]));
        const tDotV = Math.max(-0.999, Math.min(0.999, t[0] * oNorm[0] + t[1] * oNorm[1] + t[2] * oNorm[2]));
        const sinL = Math.sqrt(Math.max(0.0, 1.0 - tDotL * tDotL));
        const sinV = Math.sqrt(Math.max(0.0, 1.0 - tDotV * tDotV));

        const cosL = Math.max(0.01, omega_i[2]);
        const cosV = Math.max(0.01, oNorm[2]);

        const cylinderSpecular = Math.max(0.0, sinL * sinV + tDotL * tDotV);
        const specularLobe = Math.pow(cylinderSpecular, 6.0);

        return sheenWeight * (specularLobe / (cosL + cosV));
      }

      for (let i = 0; i < 1000; i++) {
        const pitch = Math.random() * 85.0; // 0 to 85 degrees
        const grain = Math.random() * Math.PI;
        const az = Math.random() * 360.0;
        const alt = 10.0 + Math.random() * 70.0;
        const sheenWeight = 0.85;

        const sheen = computeCylinderSheen(pitch, grain, az, alt, sheenWeight);
        expect(Number.isFinite(sheen), `Sheen must be finite at iteration ${i}`).toBe(true);
        expect(sheen).toBeGreaterThanOrEqual(0.0);
      }
    });
  });
});
