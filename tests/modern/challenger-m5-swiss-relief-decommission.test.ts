// ============================================================================
// File: tests/modern/challenger-m5-swiss-relief-decommission.test.ts
// Architecture: Milestone 5 Adversarial Verification Suite
// Topic: Verification of swissReliefPipeline Decommissioning & Fallback Binding
// Role: Empirical Challenger (challenger_1_m5)
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';

import { WebGPUEngine, type WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU } from '../helpers/webgpu-mock';

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
    reliefActive: true,
    showRelief: true,
    showVectors: true,
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

describe('Challenger M5: Adversarial swissReliefPipeline Decommissioning & Fallback Binding Verification', () => {
  const engineSource = fs.readFileSync(engineFilePath, 'utf-8');

  describe('Sub-test 1: Static Code Invariants (WebGPUEngine.ts)', () => {
    it('M5-ADV-01: confirms this.swissReliefPipeline is completely absent from WebGPUEngine.ts', () => {
      const swissMatches = engineSource.match(/swissReliefPipeline/g) || [];
      expect(
        swissMatches.length,
        `Expected 0 occurrences of swissReliefPipeline in WebGPUEngine.ts, but found ${swissMatches.length}`
      ).toBe(0);

      const generalSwissMatches = engineSource.match(/swissRelief/g) || [];
      expect(
        generalSwissMatches.length,
        `Expected 0 occurrences of swissRelief in WebGPUEngine.ts, but found ${generalSwissMatches.length}`
      ).toBe(0);
    });

    it('M5-ADV-02: confirms exactly 7 createRenderPipeline calls exist in Pass 1', () => {
      const pipelineCreations = engineSource.match(/createRenderPipeline\s*\(/g) || [];
      expect(
        pipelineCreations.length,
        `Expected exactly 7 createRenderPipeline calls in WebGPUEngine.ts, found: ${pipelineCreations.length}`
      ).toBe(7);

      const expectedPipelines = [
        'windRibbonPipeline',
        'pointsRenderPipeline',
        'linesRenderPipeline',
        'vectorRibbonPipeline',
        'crustHydrospherePipeline',
        'cloudPipeline',
        'atmosphereScatterPipeline',
      ];

      for (const name of expectedPipelines) {
        expect(engineSource.includes(name), `Expected pipeline ${name} in WebGPUEngine.ts`).toBe(true);
      }
    });

    it('M5-ADV-03: confirms exactly 8 depth32float format matches exist (1 depth texture + 7 pipelines)', () => {
      const depthMatches = engineSource.match(/format:\s*['"]depth32float['"]/g) || [];
      expect(
        depthMatches.length,
        `Expected exactly 8 format: depth32float matches in WebGPUEngine.ts, found: ${depthMatches.length}`
      ).toBe(8);
    });

    it('M5-ADV-04: confirms reliefUniformBuffer is preserved and intact', () => {
      expect(engineSource).toContain('private reliefUniformBuffer!: GPUBuffer;');
      expect(engineSource).toContain('this.reliefUniformBuffer = this.device.createBuffer(');
      expect(engineSource).toContain('this.reliefUniformBuffer?.destroy();');
    });
  });

  describe('Sub-test 2: Runtime Object Invariants & Property Evaluation', () => {
    let mockGPU: any;

    beforeEach(() => {
      mockGPU = createMockNavigatorGPU();
      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: mockGPU },
        writable: true,
        configurable: true,
      });
    });

    it('M5-ADV-05: confirms (engine as any).swissReliefPipeline is undefined on instantiation, initialization, and disposal', async () => {
      const engine = new WebGPUEngine();
      expect((engine as any).swissReliefPipeline).toBeUndefined();

      const config = createTestConfig();
      await engine.initialize(config);
      expect((engine as any).swissReliefPipeline).toBeUndefined();

      engine.ensureCartographicBuffers();
      expect((engine as any).swissReliefPipeline).toBeUndefined();

      const params = createFrameParams({ reliefActive: true });
      engine.render(params);
      expect((engine as any).swissReliefPipeline).toBeUndefined();

      engine.dispose();
      expect((engine as any).swissReliefPipeline).toBeUndefined();
    });

    it('M5-ADV-06: confirms reliefUniformBuffer is allocated, 64-bytes, and writable', async () => {
      const engine = new WebGPUEngine();
      const config = createTestConfig();
      await engine.initialize(config);
      engine.ensureCartographicBuffers();

      const reliefBuf = (engine as any).reliefUniformBuffer;
      expect(reliefBuf).toBeDefined();
      expect(reliefBuf).not.toBeNull();
      expect(reliefBuf.size).toBe(64);

      // Verify updateUniforms updates reliefUniformBuffer with u_regionalActive = 0
      const params = createFrameParams({ sunAzimuth: 270, sunAltitude: 30, displacementScale: 0.08 });
      engine.render(params);

      const rf = (engine as any).reliefFloats;
      const ru = (engine as any).reliefUints;
      expect(rf[0]).toBeCloseTo(270);
      expect(rf[1]).toBeCloseTo(30);
      expect(rf[4]).toBeCloseTo(0.08, 4);
      expect(ru[12]).toBe(0); // u_regionalActive = 0 guarantee

      engine.dispose();
      expect((engine as any).reliefUniformBuffer).toBeNull();
    });

    it('M5-ADV-07: verifies regional fallback bindings function cleanly without throwing', async () => {
      const engine = new WebGPUEngine();
      const config = createTestConfig();
      await engine.initialize(config);
      engine.ensureCartographicBuffers();

      // Explicitly ensure activeRegionalDEM is null
      expect((engine as any).activeRegionalDEM).toBeNull();

      // Render across diverse parameter configurations
      expect(() => {
        engine.render(createFrameParams({ reliefActive: false }));
        engine.render(createFrameParams({ reliefActive: true }));
        engine.render(createFrameParams({ reliefActive: true, purityMode: true }));
        engine.render(createFrameParams({ reliefActive: true, purityMode: false }));
        engine.render(createFrameParams({ showVectors: true, showSurfaceWinds: true }));
        engine.render(createFrameParams({ showClouds: true, volumetricClouds: true }));
      }).not.toThrow();

      engine.dispose();
    });
  });
});
