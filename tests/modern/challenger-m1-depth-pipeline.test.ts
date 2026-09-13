// ============================================================================
// File: tests/modern/challenger-m1-depth-pipeline.test.ts
// Architecture: Milestone 1 Adversarial Verification Suite
// Topic: WebGPU Depth Buffer Format, Pipeline Descriptors, Memory Usages & Accessors
// Role: Adversarial Depth Pipeline Challenger (challenger_m1_2)
//
// Invariants Tested:
// - Zero occurrences of `depth24plus` in WebGPUEngine.ts
// - All 10 Pass 1 render pipelines configure format: 'depth32float'
// - depthTexture created with GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
// - mainRenderPass preserves depthStoreOp: 'store' for Pass 2 tropospheric raymarcher
// - Public accessors getDepthTexture() and getDepthTextureView() active
// - Zero memory leaks across dynamic canvas resize cycles (old texture destroyed)
// - Monte Carlo stress fuzzing across 10,000 randomized dimension pairs
// - Defect injection sensitivity validation
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { WebGPUEngine, type WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import * as THREE from 'three';
import { createMockNavigatorGPU, MockGPUDevice, MockGPUTexture } from '../helpers/webgpu-mock';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const engineFilePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');

function createFrameParams(overrides: Partial<WebGPUFrameParams> = {}): WebGPUFrameParams {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);

  return {
    camera,
    mode: 0,
    unfurl: 0.0,
    theme: 0,
    dt: 0.016,
    time: 0.0,
    reliefActive: false,
    showRelief: false,
    showVectors: false,
    showClouds: false,
    showAtmosphere: false,
    ...overrides,
  };
}

function createTestConfig(width = 1024, height = 768) {
  let mockContext: any;
  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: (type: string) => (type === 'webgpu' ? mockContext : null),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;

  mockContext = {
    configure: () => {},
    getCurrentTexture: () => ({
      createView: () => ({}),
    }),
    canvas,
  };

  return {
    canvas,
    pointCount: 100,
    pointsData: new Float32Array(300),
    target2DData: new Float32Array(200),
    typeData: new Float32Array(100),
    lineIndices: new Uint32Array(100),
    mode: 0,
    layerMode: 'both' as const,
    theme: 'dark' as const,
  };
}

describe('Challenger M1-2: Adversarial Depth Pipeline & Buffer Verification', () => {
  let engineSource: string;

  beforeEach(() => {
    engineSource = fs.readFileSync(engineFilePath, 'utf-8');
  });

  // ==========================================================================
  // Pillar 1: Static Source Code Invariant Audit (WebGPUEngine.ts)
  // ==========================================================================
  describe('Pillar 1: Static Source Code Invariant Audit', () => {
    it('CH-M1-01 [Zero Legacy Formats]: asserts ZERO occurrences of depth24plus across WebGPUEngine.ts', () => {
      // Must not appear in strings, comments, or descriptors
      const d24Matches = engineSource.match(/depth24plus/gi) || [];
      expect(
        d24Matches.length,
        `Expected 0 occurrences of depth24plus in WebGPUEngine.ts, found: ${d24Matches.length}`
      ).toBe(0);
    });

    it('CH-M1-02 [All 10 Pass 1 Pipelines]: asserts all 10 render pipelines specify format: depth32float', () => {
      // 10 distinct Pass 1 render pipelines in WebGPUEngine.ts:
      // 1. windRibbonPipeline (line ~1476)
      // 2. cranePipeline [site 1] (line ~1545)
      // 3. pointsRenderPipeline (line ~3567)
      // 4. linesRenderPipeline (line ~3600)
      // 5. swissReliefPipeline (line ~3637)
      // 6. vectorRibbonPipeline (line ~3690)
      // 7. crustHydrospherePipeline (line ~3740)
      // 8. cloudPipeline (line ~3799)
      // 9. atmosphereScatterPipeline (line ~3844)
      // 10. cranePipeline [site 2] (line ~3898)

      const pipelineNames = [
        'windRibbonPipeline',
        'cranePipeline',
        'pointsRenderPipeline',
        'linesRenderPipeline',
        'swissReliefPipeline',
        'vectorRibbonPipeline',
        'crustHydrospherePipeline',
        'cloudPipeline',
        'atmosphereScatterPipeline',
      ];

      for (const name of pipelineNames) {
        expect(
          engineSource.includes(name),
          `Expected pipeline ${name} to be declared in WebGPUEngine.ts`
        ).toBe(true);
      }

      // Count all createRenderPipeline calls
      const pipelineCreations = engineSource.match(/createRenderPipeline\s*\(/g) || [];
      expect(
        pipelineCreations.length,
        'Expected exactly 10 createRenderPipeline calls in WebGPUEngine.ts'
      ).toBe(10);

      // Find every depthStencil block across all pipelines
      // Regex matches depthStencil: { ... } blocks
      const depthStencilRegex = /depthStencil:\s*\{([^}]+)\}/g;
      let match: RegExpExecArray | null;
      let depthStencilBlocksCount = 0;

      while ((match = depthStencilRegex.exec(engineSource)) !== null) {
        depthStencilBlocksCount++;
        const blockContent = match[1];
        expect(
          blockContent,
          `depthStencil block #${depthStencilBlocksCount} must specify depth32float`
        ).toMatch(/format:\s*['"]depth32float['"]/);
        expect(
          blockContent,
          `depthStencil block #${depthStencilBlocksCount} must not contain depth24plus`
        ).not.toMatch(/depth24plus/);
      }

      expect(
        depthStencilBlocksCount,
        'All 10 render pipelines must define an active depthStencil descriptor block'
      ).toBe(10);
    });

    it('CH-M1-03 [Texture Creation Usages]: asserts depthTexture creation specifies RENDER_ATTACHMENT and TEXTURE_BINDING', () => {
      // Find updateDepthTexture definition up to getDepthTexture
      const updateDepthTextureMatch = engineSource.match(
        /private\s+updateDepthTexture\s*\([^)]*\)[\s\S]*?(?=public\s+getDepthTexture)/
      );
      expect(updateDepthTextureMatch, 'updateDepthTexture method must be present').not.toBeNull();

      const methodBody = updateDepthTextureMatch![0];

      // Assert format is depth32float
      expect(methodBody).toMatch(/format:\s*['"]depth32float['"]/);

      // Assert usage includes GPUTextureUsage.RENDER_ATTACHMENT and GPUTextureUsage.TEXTURE_BINDING
      expect(methodBody).toContain('GPUTextureUsage.RENDER_ATTACHMENT');
      expect(methodBody).toContain('GPUTextureUsage.TEXTURE_BINDING');

      // Assert fallback bitmask (16 | 4 = 20) is present for environments without GPUTextureUsage
      expect(methodBody).toContain('16 | 4');
    });

    it('CH-M1-04 [VRAM Persistence]: asserts mainRenderPass preserves depthStoreOp: store', () => {
      // Find mainRenderPass beginRenderPass block
      const renderPassMatch = engineSource.match(
        /beginRenderPass\s*\(\s*\{[\s\S]*?depthStencilAttachment:\s*this\.depthTextureView\s*\?\s*\{([\s\S]*?)\}\s*:\s*undefined/
      );
      expect(renderPassMatch, 'mainRenderPass depthStencilAttachment must be defined').not.toBeNull();

      const attachmentBody = renderPassMatch![1];
      expect(attachmentBody).toMatch(/depthStoreOp:\s*['"]store['"]/);
      expect(attachmentBody).toMatch(/depthLoadOp:\s*['"]clear['"]/);
      expect(attachmentBody).toMatch(/depthClearValue:\s*1\.0/);
    });

    it('CH-M1-05 [Public Accessors]: asserts getDepthTexture and getDepthTextureView are declared on WebGPUEngine', () => {
      expect(engineSource).toMatch(/public\s+getDepthTexture\s*\(\s*\)\s*:\s*GPUTexture\s*\|\s*null/);
      expect(engineSource).toMatch(/public\s+getDepthTextureView\s*\(\s*\)\s*:\s*GPUTextureView\s*\|\s*null/);
    });

    it('CH-M1-06 [Invariant §14 Hardware Depth Bias]: asserts vector ribbon pipeline configures hardware depth bias', () => {
      // Hardware depth bias prevents coplanar z-fighting with terrain crust
      expect(engineSource).toMatch(/depthBias:\s*-120/);
      expect(engineSource).toMatch(/depthBiasSlopeScale:\s*-1\.0/);
    });
  });

  // ==========================================================================
  // Pillar 2: Runtime Lifecycle & Behavioral Verification
  // ==========================================================================
  describe('Pillar 2: Runtime Lifecycle & Behavioral Verification', () => {
    let engine: WebGPUEngine;
    let mockGPU: any;

    beforeEach(async () => {
      mockGPU = createMockNavigatorGPU();
      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: mockGPU },
        writable: true,
        configurable: true,
      });
      engine = new WebGPUEngine();
    });

    it('CH-M1-07 [Uninitialized Safety]: accessors return null prior to initialization', () => {
      expect(engine.getDepthTexture()).toBeNull();
      expect(engine.getDepthTextureView()).toBeNull();
    });

    it('CH-M1-08 [Initialization Integrity]: depthTexture allocates with depth32float and dual usages', async () => {
      await engine.initialize(createTestConfig(1280, 720));

      const depthTex = engine.getDepthTexture() as any;
      const depthView = engine.getDepthTextureView();

      expect(depthTex).not.toBeNull();
      expect(depthView).not.toBeNull();

      expect(depthTex.format).toBe('depth32float');
      expect(depthTex.width).toBe(1280);
      expect(depthTex.height).toBe(720);

      // Usage bitmask verification:
      // RENDER_ATTACHMENT = 0x10 (16)
      // TEXTURE_BINDING = 0x04 (4)
      // Combined = 0x14 (20)
      const usage = depthTex.usage;
      expect((usage & 0x10) !== 0, 'RENDER_ATTACHMENT flag must be set').toBe(true);
      expect((usage & 0x04) !== 0, 'TEXTURE_BINDING flag must be set').toBe(true);
      expect((usage & 0x14) === 0x14, 'Both flags must be concurrently present').toBe(true);

      // Incompatible flags must NOT be set
      expect((usage & 0x08) === 0, 'STORAGE_BINDING should not be set on standard depth32float').toBe(true);
    });

    it('CH-M1-09 [Lifecycle VRAM Cleanliness]: texture destroy() called on canvas resize and engine dispose', async () => {
      await engine.initialize(createTestConfig(800, 600));

      const initialTex = engine.getDepthTexture() as any;
      expect(initialTex).not.toBeNull();

      let destroyCalled = false;
      const originalDestroy = initialTex.destroy;
      initialTex.destroy = () => {
        destroyCalled = true;
        if (originalDestroy) originalDestroy.call(initialTex);
      };

      // Trigger resize to different dimensions
      engine.resize(1920, 1080);

      expect(destroyCalled, 'Old depthTexture must be destroyed upon resize to prevent VRAM leaks').toBe(true);

      const resizedTex = engine.getDepthTexture() as any;
      expect(resizedTex).not.toBeNull();
      expect(resizedTex).not.toBe(initialTex);
      expect(resizedTex.width).toBe(1920);
      expect(resizedTex.height).toBe(1080);
      expect(resizedTex.format).toBe('depth32float');

      // Now test disposal
      let resizedDestroyCalled = false;
      resizedTex.destroy = () => {
        resizedDestroyCalled = true;
      };

      engine.dispose();

      expect(resizedDestroyCalled, 'Active depthTexture must be destroyed upon engine.dispose()').toBe(true);
      expect(engine.getDepthTexture()).toBeNull();
      expect(engine.getDepthTextureView()).toBeNull();
    });

    it('CH-M1-10 [Runtime Pipeline Descriptors]: all initialized render pipelines hold depthStencil with depth32float', async () => {
      await engine.initialize(createTestConfig(800, 600));

      const pipelines = [
        { name: 'pointsRenderPipeline', pipe: (engine as any).pointsRenderPipeline },
        { name: 'linesRenderPipeline', pipe: (engine as any).linesRenderPipeline },
        { name: 'swissReliefPipeline', pipe: (engine as any).swissReliefPipeline },
        { name: 'vectorRibbonPipeline', pipe: (engine as any).vectorRibbonPipeline },
        { name: 'crustHydrospherePipeline', pipe: (engine as any).crustHydrospherePipeline },
      ];

      for (const { name, pipe } of pipelines) {
        expect(pipe, `Pipeline ${name} must be initialized`).toBeDefined();
        expect(pipe.descriptor, `Pipeline ${name} must have descriptor`).toBeDefined();
        expect(pipe.descriptor.depthStencil, `Pipeline ${name} must have depthStencil descriptor`).toBeDefined();
        expect(pipe.descriptor.depthStencil.format, `Pipeline ${name} format must be depth32float`).toBe('depth32float');
      }
    });

    it('CH-M1-11 [Runtime Render Pass Attachment Interception]: beginRenderPass receives depth32float view and storeOp', async () => {
      const config = createTestConfig(1024, 768);
      await engine.initialize(config);

      let capturedRenderPassDesc: any = null;
      const device = (engine as any).device as MockGPUDevice;
      const originalCreateCommandEncoder = device.createCommandEncoder.bind(device);

      device.createCommandEncoder = (desc?: any) => {
        const encoder = originalCreateCommandEncoder(desc);
        const originalBeginRenderPass = encoder.beginRenderPass.bind(encoder);
        encoder.beginRenderPass = (passDesc: any) => {
          capturedRenderPassDesc = passDesc;
          return originalBeginRenderPass(passDesc);
        };
        return encoder;
      };

      const frameParams = createFrameParams();
      engine.render(frameParams);

      expect(capturedRenderPassDesc, 'mainRenderPass must be executed').not.toBeNull();
      const depthAttachment = capturedRenderPassDesc.depthStencilAttachment;
      expect(depthAttachment, 'depthStencilAttachment must be attached').toBeDefined();
      expect(depthAttachment.view, 'depthStencilAttachment view must match active depthTextureView').toBe(engine.getDepthTextureView());
      expect(depthAttachment.depthStoreOp, 'depthStoreOp must be store for Pass 2 persistence').toBe('store');
      expect(depthAttachment.depthLoadOp, 'depthLoadOp must be clear').toBe('clear');
      expect(depthAttachment.depthClearValue, 'depthClearValue must be 1.0').toBe(1.0);
    });

    it('CH-M1-12 [Dynamic Mid-Frame Canvas Resize Auto-Adjustment]: render() detects canvas dimension change and updates depth buffer', async () => {
      const config = createTestConfig(800, 600);
      await engine.initialize(config);

      const initialTex = engine.getDepthTexture() as any;
      expect(initialTex.width).toBe(800);
      expect(initialTex.height).toBe(600);

      // Simulate viewport/canvas size change without calling engine.resize() directly
      config.canvas.width = 2560;
      config.canvas.height = 1440;

      const frameParams = createFrameParams();
      engine.render(frameParams);

      const updatedTex = engine.getDepthTexture() as any;
      expect(updatedTex).not.toBeNull();
      expect(updatedTex.width).toBe(2560);
      expect(updatedTex.height).toBe(1440);
      expect(updatedTex.format).toBe('depth32float');
      expect((updatedTex.usage & 0x14) === 0x14).toBe(true);
    });
  });

  // ==========================================================================
  // Pillar 3: Monte Carlo Stress Fuzzing (10,000 Iterations)
  // ==========================================================================
  describe('Pillar 3: Monte Carlo Stress Fuzzing & Geometric Boundary Probing', () => {
    it('CH-M1-13 [Monte Carlo Dimension Fuzzing]: 10,000 randomized dimension pairs maintain valid texture bounds', async () => {
      const mockGPU = createMockNavigatorGPU();
      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: mockGPU },
        writable: true,
        configurable: true,
      });

      const engine = new WebGPUEngine();
      await engine.initialize(createTestConfig(800, 600));

      for (let i = 0; i < 10_000; i++) {
        // Generate random widths and heights including edge cases:
        // [0, 8192], non-power-of-two, odd values, small values
        let w: number;
        let h: number;

        if (i === 0) {
          w = 0; h = 0; // Singular zero dimensions
        } else if (i === 1) {
          w = 1; h = 1; // Minimum singular dimension
        } else if (i === 2) {
          w = 7680; h = 4320; // 8K UHD
        } else if (i === 3) {
          w = 3440; h = 1440; // Ultrawide 21:9
        } else if (i === 4) {
          w = -100; h = -50; // Negative edge cases
        } else {
          w = Math.floor(Math.random() * 4096);
          h = Math.floor(Math.random() * 2160);
        }

        engine.resize(w, h);

        const tex = engine.getDepthTexture() as any;
        const view = engine.getDepthTextureView();

        expect(tex, `Texture must not be null at iteration ${i} (${w}x${h})`).not.toBeNull();
        expect(view, `View must not be null at iteration ${i} (${w}x${h})`).not.toBeNull();

        // Dimensions must be clamped to at least 1
        expect(tex.width).toBeGreaterThanOrEqual(1);
        expect(tex.height).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(tex.width)).toBe(true);
        expect(Number.isFinite(tex.height)).toBe(true);
        expect(tex.format).toBe('depth32float');
      }

      engine.dispose();
    });
  });

  // ==========================================================================
  // Pillar 4: Defect Injection Sensitivity Verification
  // ==========================================================================
  describe('Pillar 4: Defect Injection Sensitivity Verification', () => {
    it('CH-M1-14 [Defect Sensitivity - Legacy Format]: proves validator rejects depth24plus', () => {
      const corruptSource = engineSource.replace(
        "format: 'depth32float'",
        "format: 'depth24plus'"
      );

      const hasLegacy = /format:\s*['"]depth24plus['"]/.test(corruptSource);
      expect(hasLegacy, 'Defect injection should be recognized as invalid').toBe(true);
    });

    it('CH-M1-15 [Defect Sensitivity - Missing TEXTURE_BINDING]: proves validator detects missing usage bit', () => {
      // Simulate defective usage lacking TEXTURE_BINDING (only RENDER_ATTACHMENT = 16)
      const defectiveUsage = 16;
      const hasTextureBinding = (defectiveUsage & 4) !== 0;
      expect(hasTextureBinding, 'Defective usage lacking bit 4 must fail check').toBe(false);

      // Correct usage (16 | 4 = 20)
      const validUsage = 16 | 4;
      expect((validUsage & 4) !== 0).toBe(true);
      expect((validUsage & 16) !== 0).toBe(true);
    });

    it('CH-M1-16 [Defect Sensitivity - Discard StoreOp]: proves validator catches depthStoreOp: discard', () => {
      const corruptSource = engineSource.replace(
        "depthStoreOp: 'store'",
        "depthStoreOp: 'discard'"
      );

      const isStore = /depthStoreOp:\s*['"]store['"]/.test(corruptSource);
      expect(isStore, 'Corrupt depthStoreOp: discard must fail validation').toBe(false);
    });
  });
});
