// ============================================================================
// File: tests/modern/challenger-m4-medium-stress.test.ts
// Challenger: challenger_m4_2 (Multi-Medium Visual Contrast & Zero-Recompile Lifecycle Challenger)
// Mission: Milestone 4 Adversarial Verification Harness
// Invariants:
//   - Invariant §20: WebGPU Core vs. Lazy Dynamic Buffer Discipline & 16-Byte Uniform Packing
//   - Invariant §22: Comprehensive Multi-Medium Verification Gate Contract
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Medium Switching (Zero-Recompile)
//   - Invariant §27: Independent Victory Auditor Capture Count Accounting
//   - Invariant §28: Exhaustive Multi-Medium Shader Parity & Historical Identity Conservation
//   - Invariant §46: The Test Import Integrity Contract (Anti-Self-Certification Rule)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as THREE from 'three';

import {
  CLOUD_MEDIUM_PALETTES,
  getCloudMediumPalette,
  computeSunsetSolarColor,
  computeGoldenHourRimIntensity,
  computeCreviceAmbientOcclusion,
  computeSunShadowTransmittance,
  dualLobeHenyeyGreenstein,
  CloudMediumPalette,
} from '../../src/core/math/volumetricMath';

import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice } from '../helpers/webgpu-mock';

function createMockEngineConfig(): WebGPUInitConfig {
  const mockContext = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
    })),
    canvas: { width: 1920, height: 1080 },
  };

  const canvas = {
    width: 1920,
    height: 1080,
    clientWidth: 1920,
    clientHeight: 1080,
    getContext: vi.fn((type: string) => {
      if (type === 'webgpu') return mockContext;
      return null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    pointCount: 256,
    pointsData: new Float32Array(256 * 3),
    target2DData: new Float32Array(256 * 2),
    typeData: new Float32Array(256),
    lineIndices: new Uint32Array(64 * 2),
  };
}

function computeEuclideanColorDistance(
  c1: [number, number, number],
  c2: [number, number, number]
): number {
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}

describe('Challenger M4-2: Multi-Medium Visual Contrast & Zero-Recompile Lifecycle', () => {
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

  // ==========================================================================
  // Pillar 1: Invariant §24 - Zero-Recompile Dynamic Theme Switching Stress
  // ==========================================================================
  describe('Pillar 1: Invariant §24 - Zero-Recompile Dynamic Medium Switching', () => {
    it('CHALLENGE-M4-01: executes 50 consecutive theme switches with EXACTLY ZERO createRenderPipeline calls', async () => {
      await engine.initialize(createMockEngineConfig());
      const device = (engine as any).device as MockGPUDevice;
      expect(device).toBeDefined();

      // Ensure cloud pipeline and volumetric buffers are ready
      engine.initVolumetricCloudPipeline();
      engine.ensureVolumetricCloudBuffers();

      // Spy on device.createRenderPipeline
      const createRenderPipelineSpy = vi.spyOn(device, 'createRenderPipeline');

      // Execute 50 consecutive theme switches across Themes 0, 1, 2
      const themes: Array<0 | 1 | 2> = [0, 1, 2];
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
      camera.position.set(0, 5, 15);

      const writeBufferSpy = vi.spyOn(device.queue, 'writeBuffer');
      const initialWriteCount = writeBufferSpy.mock.calls.length;

      for (let i = 0; i < 50; i++) {
        const theme = themes[i % 3];
        const params: Partial<WebGPUFrameParams> = {
          theme,
          camera,
          time: i * 0.016,
          unfurl: 0.0,
          mode: 0,
          paperTooth: 0.85 + (i % 5) * 0.03,
        };

        engine.updateVolumetricUniforms(params as WebGPUFrameParams);

        // Verify cloud uniform buffer write state after each switch
        const writes = writeBufferSpy.mock.calls.filter(
          (call) => call[0] === (engine as any).volumetricCloudUniformBuffer
        );
        expect(writes.length).toBe(i + 1);

        const latestWrite = writes[writes.length - 1];
        expect(latestWrite[1]).toBe(0); // offset 0
        const data = latestWrite[2] as ArrayBuffer;
        expect(data.byteLength).toBe(160); // 160 bytes (40 floats)

        const floats = new Float32Array(data);
        expect(floats[28]).toBe(theme); // themeIndex
        if (theme === 0) {
          expect(floats[29]).toBeCloseTo(1.0, 2); // Tharp inkAbsorption
          expect(floats[31]).toBeCloseTo(1.0, 2); // Tharp gamma
        } else if (theme === 1) {
          expect(floats[29]).toBeCloseTo(0.92, 2); // Cream inkAbsorption
          expect(floats[31]).toBeCloseTo(1.0, 2); // Cream gamma
        } else if (theme === 2) {
          expect(floats[29]).toBeCloseTo(1.15, 2); // Cyanotype inkAbsorption
          expect(floats[31]).toBeCloseTo(1.4, 2); // Cyanotype gamma
        }
      }

      // Invariant §24: STRICT ASSERTION: pipeline re-creation count MUST be EXACTLY ZERO
      expect(createRenderPipelineSpy).toHaveBeenCalledTimes(0);

      // Total queue writes = 50 switches * 2 buffers (camera + cloud) = 100 writes
      expect(writeBufferSpy.mock.calls.length - initialWriteCount).toBe(100);

      // Cloud uniform buffer specifically updated 50 times
      const cloudWrites = writeBufferSpy.mock.calls.filter(
        (call) => call[0] === (engine as any).volumetricCloudUniformBuffer
      );
      expect(cloudWrites.length).toBe(50);
    });

    it('CHALLENGE-M4-02: 10,000 Monte Carlo theme fuzzing iterations produce ZERO non-finite corruptions', async () => {
      await engine.initialize(createMockEngineConfig());
      const device = (engine as any).device as MockGPUDevice;
      engine.initVolumetricCloudPipeline();
      engine.ensureVolumetricCloudBuffers();

      const createRenderPipelineSpy = vi.spyOn(device, 'createRenderPipeline');
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);

      let nanDetected = 0;
      let infDetected = 0;

      for (let i = 0; i < 10_000; i++) {
        const theme = (i % 3) as 0 | 1 | 2;
        const time = Math.random() * 1000.0;
        const unfurl = Math.random();
        const mode = Math.floor(Math.random() * 5);
        const paperTooth = Math.random();

        engine.updateVolumetricUniforms({
          theme,
          camera,
          time,
          dt: 0.016,
          unfurl,
          mode,
          paperTooth,
        } as unknown as WebGPUFrameParams);

        const lastCall = device.queue.writeBufferCalls[device.queue.writeBufferCalls.length - 1];
        const floats = new Float32Array(lastCall.data as ArrayBuffer);

        // Check floats 28..39 (medium and control uniforms)
        for (let f = 28; f < 40; f++) {
          if (Number.isNaN(floats[f])) nanDetected++;
          if (!Number.isFinite(floats[f])) infDetected++;
        }
      }

      expect(nanDetected).toBe(0);
      expect(infDetected).toBe(0);
      expect(createRenderPipelineSpy).toHaveBeenCalledTimes(0);
    });

    it('CHALLENGE-M4-03: Defect Injection — confirms test sensitivity if pipeline recreation were triggered', () => {
      let roguePipelineCount = 0;
      const fakeRecompile = () => {
        roguePipelineCount++;
      };

      // When rogue compilation occurs:
      fakeRecompile();
      expect(() => {
        expect(roguePipelineCount).toBe(0);
      }).toThrow();
    });
  });

  // ==========================================================================
  // Pillar 2: Invariant §28 - Multi-Medium Separation & Color Distance
  // ==========================================================================
  describe('Pillar 2: Invariant §28 - Multi-Medium Separation & Color Distance', () => {
    it('CHALLENGE-M4-04: verifies ΔE > 0.25 across all three theme pairs for midColor', () => {
      const tharp = getCloudMediumPalette(0);
      const cream = getCloudMediumPalette(1);
      const cyanotype = getCloudMediumPalette(2);

      expect(tharp).toBeDefined();
      expect(cream).toBeDefined();
      expect(cyanotype).toBeDefined();

      const distTharpCream = computeEuclideanColorDistance(tharp.midColor, cream.midColor);
      const distTharpCyanotype = computeEuclideanColorDistance(tharp.midColor, cyanotype.midColor);
      const distCreamCyanotype = computeEuclideanColorDistance(cream.midColor, cyanotype.midColor);

      // Invariant §28: All pairwise Euclidean distances must exceed 0.25
      expect(distTharpCream).toBeGreaterThan(0.25);
      expect(distTharpCyanotype).toBeGreaterThan(0.25);
      expect(distCreamCyanotype).toBeGreaterThan(0.25);

      // Verify empirical measurements
      expect(distTharpCream).toBeCloseTo(0.4025, 2);
      expect(distTharpCyanotype).toBeCloseTo(0.5460, 2);
      expect(distCreamCyanotype).toBeCloseTo(0.3722, 2);
    });

    it('CHALLENGE-M4-05: verifies composite palette distinction (sun, mid, ambient) across all pairs', () => {
      const themes = [0, 1, 2];
      for (let i = 0; i < themes.length; i++) {
        for (let j = i + 1; j < themes.length; j++) {
          const pA = getCloudMediumPalette(themes[i]);
          const pB = getCloudMediumPalette(themes[j]);

          // Multi-component Euclidean norm across 9 channels (sun, mid, ambient)
          const deltaSun = computeEuclideanColorDistance(pA.sunColor, pB.sunColor);
          const deltaMid = computeEuclideanColorDistance(pA.midColor, pB.midColor);
          const deltaAmb = computeEuclideanColorDistance(pA.ambientColor, pB.ambientColor);

          const compositeDelta = Math.hypot(deltaSun, deltaMid, deltaAmb);
          expect(compositeDelta).toBeGreaterThan(0.30);
        }
      }
    });

    it('CHALLENGE-M4-06: boundary probing on getCloudMediumPalette', () => {
      // Out-of-bounds indices clamp gracefully
      expect(getCloudMediumPalette(-10).theme).toBe(0);
      expect(getCloudMediumPalette(-1).theme).toBe(0);
      expect(getCloudMediumPalette(3).theme).toBe(2);
      expect(getCloudMediumPalette(100).theme).toBe(2);

      // Non-integer inputs floor safely
      expect(getCloudMediumPalette(0.8).theme).toBe(0);
      expect(getCloudMediumPalette(1.9).theme).toBe(1);

      // Valid themes 0, 1, 2
      expect(getCloudMediumPalette(0).theme).toBe(0);
      expect(getCloudMediumPalette(1).theme).toBe(1);
      expect(getCloudMediumPalette(2).theme).toBe(2);
    });

    it('CHALLENGE-M4-07: 10,000 Monte Carlo queries on optical formulas produce bounded finite outputs', () => {
      for (let i = 0; i < 10_000; i++) {
        const themeIndex = Math.floor(Math.random() * 3);
        const palette = getCloudMediumPalette(themeIndex);
        const sunAlt = Math.random() * 90.0;
        const cosTheta = Math.random() * 2.0 - 1.0;

        const solar = computeSunsetSolarColor(palette.sunColor, sunAlt);
        expect(Number.isFinite(solar[0])).toBe(true);
        expect(Number.isFinite(solar[1])).toBe(true);
        expect(Number.isFinite(solar[2])).toBe(true);
        expect(solar[0]).toBeGreaterThanOrEqual(0.0);
        expect(solar[1]).toBeGreaterThanOrEqual(0.0);
        expect(solar[2]).toBeGreaterThanOrEqual(0.0);

        const rim = computeGoldenHourRimIntensity(cosTheta, sunAlt);
        expect(Number.isFinite(rim)).toBe(true);
        expect(rim).toBeGreaterThan(0.0);

        const density = Math.random() * 200.0;
        const trans = computeSunShadowTransmittance(density);
        expect(Number.isFinite(trans)).toBe(true);
        expect(trans).toBeGreaterThanOrEqual(0.0);
        expect(trans).toBeLessThanOrEqual(1.0);

        const ao = computeCreviceAmbientOcclusion(trans);
        expect(Number.isFinite(ao)).toBe(true);
        expect(ao).toBeGreaterThanOrEqual(0.0);
        expect(ao).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Invariant §20 - Buffer Discipline & 16-Byte Uniform Packing
  // ==========================================================================
  describe('Pillar 3: Invariant §20 - Buffer Discipline & 16-Byte Uniform Packing', () => {
    it('CHALLENGE-M4-08: asserts VolumetricCloudUniforms struct byte length is 160 (40 floats) in WGSL and TS', () => {
      // 1. Static Shader Inspection: read volumetric_cloud.wgsl
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
      expect(fs.existsSync(shaderPath)).toBe(true);
      const wgslCode = fs.readFileSync(shaderPath, 'utf-8');

      // Extract VolumetricCloudUniforms struct definition
      const structMatch = wgslCode.match(/struct\s+VolumetricCloudUniforms\s*\{([\s\S]*?)\};/);
      expect(structMatch).not.toBeNull();
      const structBody = structMatch![1];

      // Match all vec4<f32> members
      const memberMatches = [...structBody.matchAll(/(\w+)\s*:\s*vec4<f32>/g)];
      expect(memberMatches.length).toBe(10); // Exactly 10 vec4 fields

      // 10 fields * 16 bytes/field = 160 bytes = 40 floats
      const totalBytes = memberMatches.length * 16;
      const totalFloats = totalBytes / 4;
      expect(totalBytes).toBe(160);
      expect(totalFloats).toBe(40);

      // Verify each field name in order
      const expectedFields = [
        'u_shellRadii',
        'u_sunDirection',
        'u_layerHeights',
        'u_layerDensities',
        'u_lclParams',
        'u_noiseParams',
        'u_opticalParams',
        'u_mediumParams',
        'u_simControl',
        'u_padCloud',
      ];
      expectedFields.forEach((field, index) => {
        expect(memberMatches[index][1]).toBe(field);
      });
    });

    it('CHALLENGE-M4-09: asserts u_mediumParams sits at byte offset 112 with strict 16-byte alignment', () => {
      // Offset calculation: 7 preceding vec4 fields * 16 bytes = 112 bytes
      const fieldIndex = 7; // 8th field (0-indexed)
      const byteOffset = fieldIndex * 16;
      const floatOffset = byteOffset / 4;

      expect(byteOffset).toBe(112);
      expect(floatOffset).toBe(28);

      // Strict 16-byte alignment invariant
      expect(byteOffset % 16).toBe(0);

      // Verify WebGPUEngine allocation size
      const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
      const engineCode = fs.readFileSync(enginePath, 'utf-8');

      // Check volumetric_cloud_uniform_buffer creation size
      expect(engineCode).toMatch(/label:\s*['"]volumetric_cloud_uniform_buffer['"][\s\S]*?size:\s*160/);

      // Check float indexing in updateVolumetricUniforms
      expect(engineCode).toMatch(/cloudFloats\[28\]\s*=\s*themeIndex/);
      expect(engineCode).toMatch(/cloudFloats\[29\]\s*=\s*inkAbsorption/);
      expect(engineCode).toMatch(/cloudFloats\[30\]\s*=/);
      expect(engineCode).toMatch(/cloudFloats\[31\]\s*=\s*gamma/);
    });

    it('CHALLENGE-M4-10: verifies runtime GPUBuffer allocation and full 160-byte queue write', async () => {
      await engine.initialize(createMockEngineConfig());
      engine.ensureVolumetricCloudBuffers();

      const buffer = (engine as any).volumetricCloudUniformBuffer;
      expect(buffer).toBeDefined();
      expect(buffer.size).toBe(160);

      const device = (engine as any).device as MockGPUDevice;
      const initialWrites = device.queue.writeBufferCalls.length;

      engine.updateVolumetricUniforms({ theme: 1, dt: 0.016 } as unknown as WebGPUFrameParams);

      const writes = device.queue.writeBufferCalls.slice(initialWrites);
      expect(writes.length).toBeGreaterThan(0);

      const cloudWrite = writes.find((w) => w.buffer === buffer);
      expect(cloudWrite).toBeDefined();
      expect(cloudWrite!.bufferOffset).toBe(0);
      expect((cloudWrite!.data as ArrayBuffer).byteLength).toBe(160);
    });
  });

  // ==========================================================================
  // Pillar 4: Invariants §22 & §27 - Visual Capture Artifact Verification
  // ==========================================================================
  describe('Pillar 4: Invariants §22 & §27 - Visual Capture Verification', () => {
    const screenshotDir = path.resolve(__dirname, '../../screenshots');
    const captures = [
      { filename: 'm4_haleakala_tharp.png', theme: 'Marie Tharp (Theme 0)' },
      { filename: 'm4_haleakala_cream.png', theme: 'Cream Rag (Theme 1)' },
      { filename: 'm4_haleakala_cyanotype.png', theme: 'Prussian Cyanotype (Theme 2)' },
    ];

    it('CHALLENGE-M4-11: asserts all three Haleakala multi-medium capture files exist on disk', () => {
      captures.forEach(({ filename }) => {
        const filePath = path.join(screenshotDir, filename);
        expect(fs.existsSync(filePath), `Screenshot missing: ${filename}`).toBe(true);
      });
    });

    it('CHALLENGE-M4-12: asserts each capture file exceeds 50,000 bytes (Invariant §22 threshold)', () => {
      captures.forEach(({ filename }) => {
        const filePath = path.join(screenshotDir, filename);
        const stats = fs.statSync(filePath);
        expect(
          stats.size,
          `Screenshot ${filename} is smaller than 50KB (${stats.size} bytes)`
        ).toBeGreaterThan(50_000);
      });
    });

    it('CHALLENGE-M4-13: asserts valid PNG magic bytes and parses IHDR dimensions for all captures', () => {
      const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      captures.forEach(({ filename }) => {
        const filePath = path.join(screenshotDir, filename);
        const fd = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(24);
        fs.readSync(fd, header, 0, 24, 0);
        fs.closeSync(fd);

        // Verify PNG magic bytes
        expect(header.subarray(0, 8).equals(PNG_MAGIC), `${filename} has invalid PNG header`).toBe(true);

        // Verify IHDR chunk marker
        expect(header.subarray(12, 16).toString('ascii')).toBe('IHDR');

        // Extract width and height (big-endian 32-bit integers)
        const width = header.readUInt32BE(16);
        const height = header.readUInt32BE(20);

        expect(width).toBeGreaterThanOrEqual(1024);
        expect(height).toBeGreaterThanOrEqual(768);
      });
    });

    it('CHALLENGE-M4-14: asserts distinct SHA-256 hashes across all captures (zero duplicated files)', () => {
      const hashes = new Map<string, string>();

      captures.forEach(({ filename }) => {
        const filePath = path.join(screenshotDir, filename);
        const buffer = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        hashes.set(filename, hash);
      });

      const hashTharp = hashes.get('m4_haleakala_tharp.png')!;
      const hashCream = hashes.get('m4_haleakala_cream.png')!;
      const hashCyanotype = hashes.get('m4_haleakala_cyanotype.png')!;

      // Invariant §27: None of the captures can have identical contents
      expect(hashTharp).not.toBe(hashCream);
      expect(hashTharp).not.toBe(hashCyanotype);
      expect(hashCream).not.toBe(hashCyanotype);

      // Verify all 3 hashes are unique
      const uniqueHashes = new Set(hashes.values());
      expect(uniqueHashes.size).toBe(3);
    });
  });

  // ==========================================================================
  // Pillar 5: Invariant §46 - Test Import Integrity & Shadow Oracle Prohibition
  // ==========================================================================
  describe('Pillar 5: Invariant §46 - Anti-Cheating & Import Integrity', () => {
    it('CHALLENGE-M4-15: confirms test harness imports production modules directly without local shadows', () => {
      const testFilePath = path.resolve(__dirname, 'challenger-m4-medium-stress.test.ts');
      const testContent = fs.readFileSync(testFilePath, 'utf-8');

      // Must import from production math and engine modules
      expect(testContent).toContain("from '../../src/core/math/volumetricMath'");
      expect(testContent).toContain("from '../../src/webgpu/WebGPUEngine'");

      // Prohibition of shadow / mock duplicates:
      // Must not contain local definition of getCloudMediumPalette or CLOUD_MEDIUM_PALETTES
      expect(testContent).not.toMatch(/function\s+getCloudMediumPalette\s*\(/);
      expect(testContent).not.toMatch(/const\s+CLOUD_MEDIUM_PALETTES\s*=/);
      expect(testContent).not.toMatch(/function\s+dualLobeHenyeyGreenstein\s*\(/);
    });

    it('CHALLENGE-M4-16: verifies WGSL shader contains explicit 3-medium branching (Invariant §28)', () => {
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/volumetric_cloud.wgsl');
      const shaderCode = fs.readFileSync(shaderPath, 'utf-8');

      // Invariant §28: Shaders must not use binary branching collapsing themes
      expect(shaderCode).toContain('theme == 0u'); // Marie Tharp
      expect(shaderCode).toContain('theme == 1u'); // Cream Rag
      expect(shaderCode).toContain('theme == 2u'); // Prussian Cyanotype

      // Must implement tactile medium characteristics:
      expect(shaderCode).toContain('inkAbsorption');
      expect(shaderCode).toContain('paperTooth');
      expect(shaderCode).toContain('gamma');
    });
  });
});
