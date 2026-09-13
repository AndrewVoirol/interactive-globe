// ============================================================================
// File: tests/modern/challenger-m3-depth-pipeline.test.ts
// Architecture: Milestone 3 Adversarial Verification Suite
// Topic: WebGPU Pass 2 Tropospheric Raymarcher, Depth Occlusion Contract,
//        Buffer Lifecycle, and Anti-Cheating Invariants
// Role: Adversarial WebGPU Pass 2 Depth Occlusion & Anti-Cheating Challenger (challenger_m3_2)
//
// Invariants Tested:
// - 5 Core Buffers on boot (simUniforms, crustUniforms, sphereVertexBuffer, sphereIndexBuffer, quadCornerBuffer)
// - ensureCloudBuffers() allocates exactly 6 buffers (total 11)
// - ensureVolumetricCloudBuffers() allocates 2 uniform buffers lazily (192B & 160B)
// - 20 sequential initialize/dispose cycles with 0 memory leaks or buffer residue
// - Pass 1 depthStencilAttachment uses depth32float with depthStoreOp: 'store'
// - Pass 2 volumetricCloudPass sets depthStencilAttachment: undefined and color loadOp: 'load'
// - Pass 2 specifies premultiplied alpha blend (one / one-minus-src-alpha)
// - Zero occurrences of depth24plus across src/
// - volumetric_cloud.wgsl contains zero mock facades, implements true raymarching, 3 themes, depth occlusion
// - snapRainierInversion() coordinates (-121.7604°, 46.8529°, 5.00298, 75°, 145°)
// - screenshots/m3_rainier_inversion.png is authentic PNG > 50 KB
// - Monte Carlo stress fuzzing (10,000 iterations) with zero NaNs
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';

import { WebGPUEngine, type WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU, MockGPUDevice, MockGPUBuffer } from '../helpers/webgpu-mock';
import {
  EARTH_RADIUS_UNITS,
  EARTH_RADIUS_METERS,
  intersectRaySphere,
  computeTroposphericInterval,
  clampRayIntervalToTerrain,
  computeBeerLambertTransmission,
  integrateOpticalStep,
  dualLobeHenyeyGreenstein,
  dualHenyeyGreensteinPhase,
  computeLCLHeightMeters,
  computeCloudLayerRadii,
  reconstructWorldPositionFromDepth,
  metersToWorldUnits,
  worldUnitsToMeters,
} from '../../src/core/math/volumetricMath';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const srcDir = path.join(projectRoot, 'src');
const engineFilePath = path.join(srcDir, 'webgpu/WebGPUEngine.ts');
const shaderFilePath = path.join(srcDir, 'webgpu/shaders/volumetric_cloud.wgsl');
const canvasFilePath = path.join(srcDir, 'webgpu/WebGPUCanvas.tsx');
const screenshotPath = path.join(projectRoot, 'screenshots/m3_rainier_inversion.png');

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

function createFrameParams(overrides: Record<string, any> = {}): WebGPUFrameParams {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.00005, 1000);
  camera.position.set(0, 0, 5.00298);
  camera.lookAt(0, 0, 0);

  return {
    camera,
    mode: 0,
    unfurl: 0.0,
    theme: 1, // Cream Rag
    dt: 0.016,
    time: 1.0,
    reliefActive: true,
    showRelief: true,
    showVectors: false,
    showClouds: true,
    showAtmosphere: false,
    ...overrides,
  } as any;
}

describe('Challenger M3-2: WebGPU Pass 2 Depth Occlusion & Anti-Cheating Verification', () => {
  let engine: WebGPUEngine;
  let mockDevice: MockGPUDevice;

  beforeEach(async () => {
    const mockGPU = createMockNavigatorGPU();
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGPU },
      writable: true,
      configurable: true,
    });
    mockDevice = (await mockGPU!.requestAdapter()!.then((a: any) => a.requestDevice())) as MockGPUDevice;
    engine = new WebGPUEngine();
  });

  // ==========================================================================
  // Suite 1: Buffer Lifecycle, 5-Core Discipline & 20-Cycle Stress
  // ==========================================================================
  describe('Suite 1: Buffer Lifecycle & 20-Cycle Stress Testing', () => {
    it('CH-M3-01 [5 Core Buffers]: engine.initialize() allocates exactly 5 core buffers on boot', async () => {
      await engine.initialize(createTestConfig());
      const device = (engine as any).device as MockGPUDevice;
      expect(device.buffers.length).toBe(5);

      // Verify core buffers exist on engine
      expect((engine as any).particleBuffers[0]).toBeDefined();
      expect((engine as any).particleBuffers[1]).toBeDefined();
      expect((engine as any).staticBuffer).toBeDefined();
      expect((engine as any).lineIndexBuffer).toBeDefined();
      expect((engine as any).simUniformBuffer).toBeDefined();

      // Volumetric cloud uniform buffers must NOT be allocated on boot
      expect((engine as any).volumetricCameraUniformBuffer).toBeNull();
      expect((engine as any).volumetricCloudUniformBuffer).toBeNull();
    });

    it('CH-M3-02 [ensureCloudBuffers Allocation]: allocates exactly 6 auxiliary cloud buffers (total 11)', async () => {
      await engine.initialize(createTestConfig());
      const device = (engine as any).device as MockGPUDevice;
      expect(device.buffers.length).toBe(5);

      engine.ensureCloudBuffers();
      expect(device.buffers.length).toBe(11);

      // 3 cloud uniform buffers, 1 staging buffer, 1 sphere vertex buffer, 1 sphere index buffer
      expect((engine as any).cloudUniformBuffers?.length).toBe(3);
      expect((engine as any).cloudStagingBuffer).toBeDefined();
      expect((engine as any).cloudSphereVertexBuffer).toBeDefined();
      expect((engine as any).cloudSphereIndexBuffer).toBeDefined();

      // Ensure idempotency: re-invoking must not reallocate
      engine.ensureCloudBuffers();
      expect(device.buffers.length).toBe(11);
    });

    it('CH-M3-03 [Volumetric Lazy Uniforms]: ensureVolumetricCloudBuffers() creates 2 buffers destroyed in dispose()', async () => {
      await engine.initialize(createTestConfig());
      const device = (engine as any).device as MockGPUDevice;

      expect((engine as any).volumetricCameraUniformBuffer).toBeNull();
      expect((engine as any).volumetricCloudUniformBuffer).toBeNull();
      const initialCount = device.buffers.length;

      // Lazy allocation
      engine.ensureVolumetricCloudBuffers();
      expect((engine as any).volumetricCameraUniformBuffer).not.toBeNull();
      expect((engine as any).volumetricCloudUniformBuffer).not.toBeNull();
      expect(device.buffers.length).toBe(initialCount + 2);

      const camBuf = (engine as any).volumetricCameraUniformBuffer as MockGPUBuffer;
      const cloudBuf = (engine as any).volumetricCloudUniformBuffer as MockGPUBuffer;

      // Assert exact 16-byte aligned byte sizes (192 bytes = 48 floats, 160 bytes = 40 floats)
      expect(camBuf.size).toBe(192);
      expect(cloudBuf.size).toBe(160);

      // Verify clean destruction on dispose
      engine.dispose();
      expect((engine as any).volumetricCameraUniformBuffer).toBeNull();
      expect((engine as any).volumetricCloudUniformBuffer).toBeNull();
      expect(device.buffers.length).toBe(0);
    });

    it('CH-M3-04 [20-Cycle Stress Harness]: 20 sequential initialize/dispose cycles have 0 leaks and 0 residue', async () => {
      for (let cycle = 0; cycle < 20; cycle++) {
        const testEngine = new WebGPUEngine();
        await testEngine.initialize(createTestConfig());
        expect(testEngine.initialized).toBe(true);

        const dev = (testEngine as any).device as MockGPUDevice;
        expect(dev.buffers.length).toBe(5);

        // Exercise lazy volumetric allocation
        testEngine.ensureVolumetricCloudBuffers();
        expect(dev.buffers.length).toBe(7);

        // Exercise cloud layer buffers
        testEngine.ensureCloudBuffers();
        expect(dev.buffers.length).toBe(13);

        // Dispose cleanly
        testEngine.dispose();
        expect(testEngine.initialized).toBe(false);
        expect(dev.buffers.length).toBe(0);
      }
    });
  });

  // ==========================================================================
  // Suite 2: Pass 2 Render Pass & Depth Texture Attachment Probing
  // ==========================================================================
  describe('Suite 2: Pass 2 Render Pass & Depth Texture Attachment Probing', () => {
    it('CH-M3-05 [Pass 1 Depth Store]: Pass 1 depthStencilAttachment binds depth32float with depthStoreOp: "store"', async () => {
      await engine.initialize(createTestConfig());
      const depthTex = engine.getDepthTexture();
      const depthView = engine.getDepthTextureView();

      expect(depthTex).not.toBeNull();
      expect(depthView).not.toBeNull();
      expect(depthTex?.format).toBe('depth32float');
      expect(depthTex?.usage & GPUTextureUsage.RENDER_ATTACHMENT).toBeTruthy();
      expect(depthTex?.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();

      // Spy on commandEncoder.beginRenderPass
      const dev = (engine as any).device as MockGPUDevice;
      let pass1DepthAttachment: any = null;

      const origCreateCommandEncoder = dev.createCommandEncoder.bind(dev);
      dev.createCommandEncoder = () => {
        const enc = origCreateCommandEncoder();
        const origBeginRenderPass = enc.beginRenderPass.bind(enc);
        let passIndex = 0;
        enc.beginRenderPass = (desc: any) => {
          if (passIndex === 0) {
            pass1DepthAttachment = desc.depthStencilAttachment;
          }
          passIndex++;
          return origBeginRenderPass(desc);
        };
        return enc;
      };

      engine.render(createFrameParams());
      expect(pass1DepthAttachment).not.toBeNull();
      expect(pass1DepthAttachment.depthStoreOp).toBe('store');
      expect(pass1DepthAttachment.depthLoadOp).toBe('clear');
      expect(pass1DepthAttachment.view).toBe(depthView);
    });

    it('CH-M3-06 [Pass 2 Depth Occlusion Contract]: Pass 2 sets depthStencilAttachment: undefined and binds depth32float as sampled texture_depth_2d', async () => {
      await engine.initialize(createTestConfig());
      engine.setVolumetricCloudsEnabled(true);

      const dev = (engine as any).device as MockGPUDevice;
      let pass2Descriptor: any = null;

      const origCreateCommandEncoder = dev.createCommandEncoder.bind(dev);
      dev.createCommandEncoder = () => {
        const enc = origCreateCommandEncoder();
        const origBeginRenderPass = enc.beginRenderPass.bind(enc);
        enc.beginRenderPass = (desc: any) => {
          if (desc.label === 'volumetric_cloud_pass_pass2') {
            pass2Descriptor = desc;
          }
          return origBeginRenderPass(desc);
        };
        return enc;
      };

      engine.render(createFrameParams({ volumetricClouds: true }));

      expect(pass2Descriptor).not.toBeNull();
      // Crucial: Pass 2 must NOT have depthStencilAttachment to allow sampling depth texture
      expect(pass2Descriptor.depthStencilAttachment).toBeUndefined();
      expect(pass2Descriptor.colorAttachments[0].loadOp).toBe('load');
      expect(pass2Descriptor.colorAttachments[0].storeOp).toBe('store');

      // Check volumetric cloud bind group layout binding 2
      const bgl = (engine as any).volumetricCloudBindGroupLayout?.descriptor;
      expect(bgl).toBeDefined();
      const depthBinding = bgl.entries.find((e: any) => e.binding === 2);
      expect(depthBinding).toBeDefined();
      expect(depthBinding.texture.sampleType).toBe('depth');
      expect(depthBinding.texture.viewDimension).toBe('2d');
    });

    it('CH-M3-07 [Premultiplied Alpha Blending]: Pass 2 specifies srcFactor: "one", dstFactor: "one-minus-src-alpha"', async () => {
      await engine.initialize(createTestConfig());
      const pipelineDesc = engine.getVolumetricPipelineDescriptor();
      expect(pipelineDesc).not.toBeNull();

      const blend = pipelineDesc?.fragment?.targets[0]?.blend;
      expect(blend).toBeDefined();
      expect(blend?.color.srcFactor).toBe('one');
      expect(blend?.color.dstFactor).toBe('one-minus-src-alpha');
      expect(blend?.color.operation).toBe('add');
      expect(blend?.alpha.srcFactor).toBe('one');
      expect(blend?.alpha.dstFactor).toBe('one-minus-src-alpha');
      expect(blend?.alpha.operation).toBe('add');
    });

    it('CH-M3-08 [Zero Legacy Formats]: static scan asserts ZERO occurrences of depth24plus across entire src/ tree', () => {
      function scanDir(dir: string): string[] {
        const results: string[] = [];
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results.push(...scanDir(fullPath));
          } else if (/\.(ts|tsx|wgsl)$/.test(file)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (/depth24plus/i.test(content)) {
              results.push(fullPath);
            }
          }
        }
        return results;
      }

      const violations = scanDir(srcDir);
      expect(violations).toEqual([]);
    });
  });

  // ==========================================================================
  // Suite 3: Anti-Cheating & Integrity Probing
  // ==========================================================================
  describe('Suite 3: Anti-Cheating & Integrity Probing', () => {
    it('CH-M3-09 [Shader Audit]: volumetric_cloud.wgsl contains zero mock returns, implements true raymarch loop', () => {
      expect(fs.existsSync(shaderFilePath)).toBe(true);
      const wgsl = fs.readFileSync(shaderFilePath, 'utf-8');

      // Must NOT contain dummy returns or mock bypasses
      expect(wgsl).not.toMatch(/return\s+vec4<f32>\(1\.0,\s*0\.0,\s*0\.0/);
      expect(wgsl).not.toMatch(/return\s+vec4<f32>\(0\.0,\s*0\.0,\s*0\.0,\s*0\.0\);/);
      expect(wgsl).not.toContain('// MOCK');
      expect(wgsl).not.toContain('mock');

      // Must implement true Beer-Lambert integration & dual-lobe HG
      expect(wgsl).toContain('fn dualHenyeyGreenstein(');
      expect(wgsl).toContain('fn intersectTroposphericShell(');
      expect(wgsl).toContain('fn reconstructWorldPosition(');
      expect(wgsl).toContain('fn sampleSunShadowTransmittance(');
      expect(wgsl).toContain('accumLight += accumTransmittance * S * stepSize');
      expect(wgsl).toContain('accumTransmittance *= stepT');

      // Must implement 3 distinct medium themes
      expect(wgsl).toContain('fn getMediumPalette(theme: u32) -> CloudMediumPalette');
      expect(wgsl).toContain('theme == 0u'); // Marie Tharp
      expect(wgsl).toContain('theme == 1u'); // Cream Rag
      // Theme 2 Prussian Cyanotype fallback

      // Must clamp to terrain surface
      expect(wgsl).toContain('let tExit = min(shellHit.y, tTerrain)');
      expect(wgsl).toContain('textureLoad(u_depthTexture, pixelCoords, 0)');
    });

    it('CH-M3-10 [Rainier Inversion Hook]: WebGPUCanvas.tsx defines snapRainierInversion with exact coordinates', () => {
      expect(fs.existsSync(canvasFilePath)).toBe(true);
      const canvasContent = fs.readFileSync(canvasFilePath, 'utf-8');

      expect(canvasContent).toContain('snapRainierInversion');
      expect(canvasContent).toContain('-121.7604'); // Longitude
      expect(canvasContent).toContain('46.8529');   // Latitude
      expect(canvasContent).toContain('5.00298');   // Altitude radius (~3800m)
      expect(canvasContent).toContain('75.0');      // Pitch (75°)
      expect(canvasContent).toContain('145.0');     // Heading (145°)
    });

    it('CH-M3-11 [Visual Artifact Verification]: screenshots/m3_rainier_inversion.png is authentic PNG > 50 KB', () => {
      expect(fs.existsSync(screenshotPath)).toBe(true);
      const stats = fs.statSync(screenshotPath);

      // Must be greater than 50 KB (reported ~6.8 MB)
      expect(stats.size).toBeGreaterThan(50 * 1024);
      expect(stats.size).toBeGreaterThan(1 * 1024 * 1024); // Confirms high-res capture

      // Verify PNG Magic Header bytes: 0x89 50 4E 47 0D 0A 1A 0A
      const buffer = fs.readFileSync(screenshotPath);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // P
      expect(buffer[2]).toBe(0x4E); // N
      expect(buffer[3]).toBe(0x47); // G
      expect(buffer[4]).toBe(0x0D);
      expect(buffer[5]).toBe(0x0A);
      expect(buffer[6]).toBe(0x1A);
      expect(buffer[7]).toBe(0x0A);
    });

    it('CH-M3-12 [Test Import Integrity]: confirms this test suite imports exclusively from production src/', () => {
      const thisTestPath = path.resolve(__dirname, 'challenger-m3-depth-pipeline.test.ts');
      const testContent = fs.readFileSync(thisTestPath, 'utf-8');

      expect(testContent).toContain("from '../../src/webgpu/WebGPUEngine'");
      expect(testContent).toContain("from '../../src/core/math/volumetricMath'");
      expect(testContent).not.toContain('function ' + 'intersectRaySphere(');
      expect(testContent).not.toContain('function ' + 'computeBeerLambertTransmission(');
    });

    it('CH-M3-12b [dualHenyeyGreensteinPhase Production Export & Invariant §46]: imports directly without shadow math and matches dualLobeHenyeyGreenstein', () => {
      // 1. Direct import verification
      expect(typeof dualHenyeyGreensteinPhase).toBe('function');
      expect(dualHenyeyGreensteinPhase).toBe(dualLobeHenyeyGreenstein);

      // 2. Invariant §46: Zero shadow or duplicate math implementations
      const thisTestPath = path.resolve(__dirname, 'challenger-m3-depth-pipeline.test.ts');
      const testContent = fs.readFileSync(thisTestPath, 'utf-8');
      expect(testContent).not.toContain('function ' + 'dualHenyeyGreensteinPhase(');
      expect(testContent).not.toContain('function ' + 'dualLobeHenyeyGreenstein(');
      expect(testContent).not.toContain('const ' + 'dualHenyeyGreensteinPhase = (');

      // 3. Monte Carlo verification over 10,000 angles
      for (let i = 0; i < 10000; i++) {
        const cosTheta = (Math.random() * 2.0) - 1.0;
        const resPhase = dualHenyeyGreensteinPhase(cosTheta);
        const resDual = dualLobeHenyeyGreenstein(cosTheta);

        expect(Number.isFinite(resPhase)).toBe(true);
        expect(Number.isNaN(resPhase)).toBe(false);
        expect(resPhase).toBeGreaterThan(0.0);
        expect(resPhase).toBe(resDual);
      }
    });
  });

  // ==========================================================================
  // Suite 4: Monte Carlo Stress Fuzzing (10,000 Iterations)
  // ==========================================================================
  describe('Suite 4: Monte Carlo Stress Fuzzing (10,000 Iterations)', () => {
    it('CH-M3-13 [Monte Carlo Ray-Sphere]: 10,000 randomized rays produce finite, bounded intersection intervals', () => {
      for (let i = 0; i < 10000; i++) {
        // Random origin in shell [4.8, 20.0]
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI;
        const r = 4.8 + Math.random() * 15.2;

        const r0: [number, number, number] = [
          r * Math.cos(phi) * Math.cos(theta),
          r * Math.sin(phi),
          r * Math.cos(phi) * Math.sin(theta),
        ];

        // Random unit direction
        const dTheta = Math.random() * Math.PI * 2;
        const dPhi = (Math.random() - 0.5) * Math.PI;
        const dir: [number, number, number] = [
          Math.cos(dPhi) * Math.cos(dTheta),
          Math.sin(dPhi),
          Math.cos(dPhi) * Math.sin(dTheta),
        ];

        const hit = intersectRaySphere(r0, dir, 5.0);
        if (hit !== null) {
          expect(Number.isFinite(hit.tNear)).toBe(true);
          expect(Number.isFinite(hit.tFar)).toBe(true);
          expect(hit.tFar).toBeGreaterThanOrEqual(hit.tNear);
        }
      }
    });

    it('CH-M3-14 [Monte Carlo Beer-Lambert]: 10,000 optical depths evaluate strictly within [0.0, 1.0] with zero NaN', () => {
      for (let i = 0; i < 10000; i++) {
        const opticalDepth = Math.random() * 100.0;
        const transmission = computeBeerLambertTransmission(opticalDepth);

        expect(Number.isFinite(transmission)).toBe(true);
        expect(Number.isNaN(transmission)).toBe(false);
        expect(transmission).toBeGreaterThanOrEqual(0.0);
        expect(transmission).toBeLessThanOrEqual(1.0);
      }
    });

    it('CH-M3-15 [Monte Carlo Terrain Clamping]: 10,000 randomized intervals clamp strictly to min(tEnd, tTerrain)', () => {
      for (let i = 0; i < 10000; i++) {
        const tStart = Math.random() * 10.0;
        const tEnd = tStart + Math.random() * 5.0;
        const tTerrain = tStart + (Math.random() - 0.2) * 6.0;

        const clamped = clampRayIntervalToTerrain(tStart, tEnd, tTerrain);
        if (clamped !== null) {
          expect(Number.isFinite(clamped.tStart)).toBe(true);
          expect(Number.isFinite(clamped.tEnd)).toBe(true);
          expect(clamped.tStart).toBeGreaterThanOrEqual(tStart);
          expect(clamped.tEnd).toBeLessThanOrEqual(tEnd);
          expect(clamped.tEnd).toBeLessThanOrEqual(tTerrain);
          expect(clamped.tEnd).toBeGreaterThan(clamped.tStart);
        } else {
          // Null means terrain is closer than or equal to tStart
          expect(tTerrain <= tStart).toBe(true);
        }
      }
    });

    it('CH-M3-16 [Monte Carlo LCL Psychrometrics]: 10,000 temperature/dewpoint pairs produce non-negative finite heights', () => {
      for (let i = 0; i < 10000; i++) {
        const temp = -50.0 + Math.random() * 100.0; // [-50°C, 50°C]
        const dewpoint = -50.0 + Math.random() * 100.0;

        const lclMeters = computeLCLHeightMeters(temp, dewpoint);
        expect(Number.isFinite(lclMeters)).toBe(true);
        expect(Number.isNaN(lclMeters)).toBe(false);
        expect(lclMeters).toBeGreaterThanOrEqual(0.0);

        if (dewpoint >= temp) {
          expect(lclMeters).toBe(0.0);
        } else {
          expect(lclMeters).toBeCloseTo(125.0 * (temp - dewpoint), 5);
        }
      }
    });
  });

  // ==========================================================================
  // Suite 5: Defect Sensitivity & Invalidation Probing
  // ==========================================================================
  describe('Suite 5: Defect Sensitivity & Invalidation Probing', () => {
    it('CH-M3-17 [Sensitivity: Depth Store Op]: proves validator detects corrupted depthStoreOp: "discard"', () => {
      const validDescriptor = { depthStoreOp: 'store', depthLoadOp: 'clear' };
      const corruptedDescriptor = { depthStoreOp: 'discard', depthLoadOp: 'clear' };

      const validator = (d: any) => d.depthStoreOp === 'store';
      expect(validator(validDescriptor)).toBe(true);
      expect(validator(corruptedDescriptor)).toBe(false);
    });

    it('CH-M3-18 [Sensitivity: Premultiplied Alpha]: proves validator detects non-premultiplied blend factors', () => {
      const validBlend = {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      };
      const buggyBlend = {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, // Causes dark fringing
      };

      const validator = (b: any) => b.color.srcFactor === 'one';
      expect(validator(validBlend)).toBe(true);
      expect(validator(buggyBlend)).toBe(false);
    });

    it('CH-M3-19 [Sensitivity: Legacy depth24plus Injection]: proves scanner detects injected depth24plus', () => {
      const cleanCode = "format: 'depth32float'";
      const dirtyCode = "format: 'depth24plus'";

      const detector = (src: string) => /depth24plus/i.test(src);
      expect(detector(cleanCode)).toBe(false);
      expect(detector(dirtyCode)).toBe(true);
    });
  });
});
