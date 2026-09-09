// ============================================================================
// File: tests/modern/challenger-stage3-webgpu-bindings.test.ts
// Architecture: STAGE 3 Empirical Challenger Verification Suite
// Role: critic / specialist
// Description: Adversarial challenge and stress-testing of WebGPU uniform control
//              flow, WGSL texture sampling invariants, binding slots 6 & 7,
//              zero-buffer initialization footprint, and DEM reload propagation.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import windParticlesWGSL from '../../src/webgpu/shaders/wind_particles.wgsl?raw';
import windRibbonRenderWGSL from '../../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';

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
          features: new Set(['timestamp-query', 'texture-formats-tier1', 'texture-formats-tier2', 'float32-filterable']),
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
      createView: vi.fn(() => ({ label: 'swapchain-view' })),
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

function createEngineConfig(pointCount: number, lineCount = 100): WebGPUInitConfig {
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

describe('CHALLENGER STAGE 3: WebGPU Uniform Control Flow & Pipeline Binding Verification', () => {
  // ==========================================================================
  // Dimension 1: WGSL Uniform Control Flow & Derivative Safety
  // ==========================================================================
  describe('Dimension 1: WGSL Uniform Control Flow & Derivative Safety', () => {
    it('CHALLENGE-UCF-01: wind_ribbon_render.wgsl evaluates all derivatives unconditionally before discard or branching', () => {
      // Find fs_main definition
      const fsMainMatch = windRibbonRenderWGSL.match(/fn\s+fs_main\s*\([^)]*\)\s*->[^{]*{/);
      expect(fsMainMatch).not.toBeNull();
      const fsMainStart = fsMainMatch!.index! + fsMainMatch![0].length;

      // Scan all occurrences of fwidth, dpdx, dpdy in entire shader
      const derivativeRegex = /\b(fwidth|dpdx|dpdy|dpdxCoarse|dpdxFine|dpdyCoarse|dpdyFine)\s*\(/g;
      const allDerivativeMatches: Array<{ name: string; index: number }> = [];
      let match: RegExpExecArray | null;

      while ((match = derivativeRegex.exec(windRibbonRenderWGSL)) !== null) {
        allDerivativeMatches.push({ name: match[1], index: match.index });
      }

      // Exactly two derivatives must exist: fwidth(in.uv) and fwidth(in.vertVel)
      expect(allDerivativeMatches.length).toBe(2);

      // Locate first actual if statement, loop, or discard in fs_main (ignore comments)
      const ifMatch = windRibbonRenderWGSL.slice(fsMainStart).match(/\bif\s*\(/);
      const firstIf = ifMatch ? fsMainStart + ifMatch.index! : -1;
      const firstDiscard = windRibbonRenderWGSL.indexOf('discard;', fsMainStart);
      const loopMatch = windRibbonRenderWGSL.slice(fsMainStart).match(/\b(for|while|loop)\b/);
      const firstLoop = loopMatch ? fsMainStart + loopMatch.index! : -1;

      for (const d of allDerivativeMatches) {
        // Derivative must be inside fs_main
        expect(d.index).toBeGreaterThan(fsMainStart);
        // Derivative must be strictly before the first conditional branch
        if (firstIf !== -1) {
          expect(d.index).toBeLessThan(firstIf);
        }
        // Derivative must be strictly before discard
        expect(d.index).toBeLessThan(firstDiscard);
        if (firstLoop !== -1) {
          expect(d.index).toBeLessThan(firstLoop);
        }
      }
    });

    it('CHALLENGE-UCF-02: wind_particles.wgsl compute shader contains zero derivatives and zero discards', () => {
      const derivativeRegex = /\b(fwidth|dpdx|dpdy|dpdxCoarse|dpdxFine|dpdyCoarse|dpdyFine)\s*\(/g;
      const matches = windParticlesWGSL.match(derivativeRegex);
      expect(matches).toBeNull();

      const discardMatches = windParticlesWGSL.match(/\bdiscard\b/g);
      expect(discardMatches).toBeNull();
    });

    it('CHALLENGE-UCF-03: wind_particles.wgsl uses explicit-LOD textureSampleLevel exclusively', () => {
      // In WGSL compute shaders, implicit derivative textureSample() is invalid.
      // Only textureSampleLevel() or textureLoad() is permitted.
      const textureSampleRegex = /\btextureSample\s*\(/g;
      const textureSampleMatches = windParticlesWGSL.match(textureSampleRegex);
      expect(textureSampleMatches).toBeNull(); // ZERO implicit-derivative calls

      // Match full textureSampleLevel statement up to semicolon
      const sampleLevelRegex = /\btextureSampleLevel\s*\([^;]+;/g;
      const sampleLevelMatches: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = sampleLevelRegex.exec(windParticlesWGSL)) !== null) {
        sampleLevelMatches.push(m[0]);
      }

      // Must have sampleVelocity (jet + surface) and sampleTerrainElevation
      expect(sampleLevelMatches.length).toBeGreaterThanOrEqual(3);

      // All textureSampleLevel calls must specify 0.0 explicit LOD
      for (const call of sampleLevelMatches) {
        expect(call).toContain('0.0');
      }
    });

    it('CHALLENGE-UCF-04: wind_ribbon_render.wgsl contains zero texture sample operations', () => {
      const texSampleRegex = /\btextureSample\w*\s*\(/g;
      const matches = windRibbonRenderWGSL.match(texSampleRegex);
      expect(matches).toBeNull();
    });
  });

  // ==========================================================================
  // Dimension 2: Bind Group Layout & Slot Integrity in WebGPUEngine
  // ==========================================================================
  describe('Dimension 2: Bind Group Layout & Slot Integrity in WebGPUEngine', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(512, 50);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('CHALLENGE-BIND-01: windComputeBindGroupLayout defines exactly 8 entries with bindings 6 & 7', () => {
      engine.ensureWindBuffers();

      const windComputePipeline = (engine as any).windComputePipeline;
      expect(windComputePipeline).toBeDefined();

      const bgl = windComputePipeline.descriptor.layout.descriptor.bindGroupLayouts[0].descriptor;
      expect(bgl.entries.length).toBe(8);

      const entry6 = bgl.entries.find((e: any) => e.binding === 6);
      expect(entry6).toBeDefined();
      expect(entry6.visibility).toBe(GPUShaderStage.COMPUTE);
      expect(entry6.sampler).toEqual({ type: 'filtering' });

      const entry7 = bgl.entries.find((e: any) => e.binding === 7);
      expect(entry7).toBeDefined();
      expect(entry7.visibility).toBe(GPUShaderStage.COMPUTE);
      expect(entry7.texture).toEqual({ sampleType: 'float', viewDimension: '2d' });
    });

    it('CHALLENGE-BIND-02: updateWindBindGroups binds demSampler at slot 6 and demTextureView at slot 7 in both ping-pong bind groups', () => {
      engine.ensureWindBuffers();

      const bgs = (engine as any).windComputeBindGroups;
      expect(bgs).toBeDefined();
      expect(bgs.length).toBe(2);

      const demSampler = (engine as any).demSampler;
      const demTextureView = (engine as any).demTextureView;

      for (let i = 0; i < 2; i++) {
        const bgEntries = bgs[i].descriptor.entries;
        expect(bgEntries.length).toBe(8);

        const slot6 = bgEntries.find((e: any) => e.binding === 6);
        const slot7 = bgEntries.find((e: any) => e.binding === 7);

        expect(slot6).toBeDefined();
        expect(slot6.resource).toBe(demSampler);

        expect(slot7).toBeDefined();
        expect(slot7.resource).toBe(demTextureView);
      }
    });
  });

  // ==========================================================================
  // Dimension 3: Zero-Buffer Initialization Invariant & Lazy Allocation
  // ==========================================================================
  describe('Dimension 3: Zero-Buffer Initialization Invariant & Lazy Allocation', () => {
    let engine: WebGPUEngine;

    beforeEach(() => {
      setupMockNavigator();
      engine = new WebGPUEngine();
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('CHALLENGE-ALLOC-01: initialization allocates exactly 5 core buffers; DEM texture/sampler introduce zero buffer allocations', async () => {
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);

      const device = (engine as any).device as MockGPUDevice;
      // Core buffers: staticBuffer, particleBuffers[0], particleBuffers[1], lineIndexBuffer, simUniformBuffer
      expect(device.buffers.length).toBe(5);

      // Verify demTexture is in textures and demSampler is in samplers, NOT in buffers
      expect(device.textures.length).toBeGreaterThan(0);
      expect(device.samplers.length).toBeGreaterThan(0);
      expect(device.buffers.length).toBe(5);
    });

    it('CHALLENGE-ALLOC-02: wind and crane buffers remain unallocated until ensureWindBuffers is explicitly triggered', async () => {
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);

      const device = (engine as any).device as MockGPUDevice;
      expect((engine as any).windParticleBuffers).toBeNull();
      expect((engine as any).windUniformBuffer).toBeNull();
      expect((engine as any).craneUniformBuffer).toBeNull();
      expect(device.buffers.length).toBe(5);

      // Trigger wind allocation
      engine.ensureWindBuffers();
      expect(device.buffers.length).toBeGreaterThan(5);

      const windParticleBuffers = (engine as any).windParticleBuffers;
      const windUniformBuffer = (engine as any).windUniformBuffer;
      const craneUniformBuffer = (engine as any).craneUniformBuffer;

      expect(windParticleBuffers).toBeDefined();
      expect(windParticleBuffers.length).toBe(2);
      expect(windUniformBuffer).toBeDefined();
      expect(windUniformBuffer.size).toBe(48); // 12 * 4 bytes
      expect(craneUniformBuffer).toBeDefined();
      expect(craneUniformBuffer.size).toBe(240); // 60 * 4 bytes
    });
  });

  // ==========================================================================
  // Dimension 4: DEM Reloading & Dynamic BindGroup Propagation
  // ==========================================================================
  describe('Dimension 4: DEM Reloading & Dynamic BindGroup Propagation', () => {
    let engine: WebGPUEngine;

    beforeEach(async () => {
      setupMockNavigator();
      engine = new WebGPUEngine();
      const config = createEngineConfig(256, 30);
      await engine.initialize(config);
    });

    afterEach(() => {
      engine.dispose();
      restoreMockNavigator();
    });

    it('CHALLENGE-RELOAD-01: loading real DEM updates demTextureView and propagates to windComputeBindGroups', async () => {
      // 1. First ensure wind buffers are created
      engine.ensureWindBuffers();
      const initialDemView = (engine as any).demTextureView;
      const initialWindBGs = (engine as any).windComputeBindGroups;
      expect(initialWindBGs[0].descriptor.entries.find((e: any) => e.binding === 7).resource).toBe(initialDemView);

      // 2. Ingest mock DEM buffer (e.g. 1024 bytes)
      const mockDEMBuffer = new ArrayBuffer(2048 * 1024 * 4);
      await engine.loadDEMTexture(mockDEMBuffer);

      const updatedDemView = (engine as any).demTextureView;
      expect(updatedDemView).not.toBe(initialDemView);

      // 3. Verify that windComputeBindGroups now reference updatedDemView
      const updatedWindBGs = (engine as any).windComputeBindGroups;
      expect(updatedWindBGs[0].descriptor.entries.find((e: any) => e.binding === 7).resource).toBe(updatedDemView);
      expect(updatedWindBGs[1].descriptor.entries.find((e: any) => e.binding === 7).resource).toBe(updatedDemView);
    });

    it('CHALLENGE-RELOAD-02: loading DEM before wind initialization correctly applies to subsequent windComputeBindGroups', async () => {
      // 1. Ingest DEM BEFORE ensureWindBuffers()
      const initialDemView = (engine as any).demTextureView;
      const mockDEMBuffer = new ArrayBuffer(1024);
      await engine.loadDEMTexture(mockDEMBuffer);

      const loadedDemView = (engine as any).demTextureView;
      expect(loadedDemView).not.toBe(initialDemView);

      // 2. Now initialize wind buffers
      engine.ensureWindBuffers();

      const windBGs = (engine as any).windComputeBindGroups;
      expect(windBGs).toBeDefined();
      expect(windBGs[0].descriptor.entries.find((e: any) => e.binding === 7).resource).toBe(loadedDemView);
      expect(windBGs[1].descriptor.entries.find((e: any) => e.binding === 7).resource).toBe(loadedDemView);
    });
  });
});
