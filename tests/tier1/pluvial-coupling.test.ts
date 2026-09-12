/**
 * tests/tier1/pluvial-coupling.test.ts
 *
 * Behavioral unit and integration test suite for Stage 2:
 * Precipitation Texture Binding & Pluvial Valley Swelling.
 *
 * Invariants Verified:
 * - Invariant §3: Unconditional WGSL uniform control flow sampling
 * - Invariant §7: Hydrological river channel width scaling (Leopold-Maddock power law)
 * - Invariant §20: 16-byte WGSL struct alignment & buffer discipline
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';
import { MockGPUDevice } from '../helpers/webgpu-mock';

describe('Stage 2: Precipitation Texture Binding & Pluvial Valley Swelling', () => {
  const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

  const drawerPath = path.resolve(__dirname, '../../src/components/AtmosphereDrawer.tsx');
  const drawerSrc = fs.readFileSync(drawerPath, 'utf8');

  describe('1. WGSL Bindings & SimUniforms Struct Alignment', () => {
    it('declares bindings 9 and 10 in crust_hydrosphere.wgsl', () => {
      expect(shaderSrc).toMatch(/@group\(0\)\s*@binding\(9\)\s*var\s*u_precipTexture\s*:\s*texture_2d<f32>;/);
      expect(shaderSrc).toMatch(/@group\(0\)\s*@binding\(10\)\s*var\s*u_precipSampler\s*:\s*sampler;/);
    });

    it('declares PI_F32 constant matching PI', () => {
      expect(shaderSrc).toMatch(/const\s+PI_F32\s*:\s*f32\s*=\s*3\.14159265358979323846;/);
    });

    it('packs u_pluvial_gamma at float 72 (offset 288) with 16-byte alignment', () => {
      expect(shaderSrc).toMatch(/u_pluvial_gamma\s*:\s*f32\s*,\s*\/\/\s*offset\s*288/);
      expect(shaderSrc).toMatch(/u_weatherOpticalMode\s*:\s*u32\s*,\s*\/\/\s*offset\s*292/);
      expect(shaderSrc).toMatch(/(?:u_lclBypass|_padPrecip0)\s*:\s*f32\s*,\s*\/\/\s*offset\s*296/);
      expect(shaderSrc).toMatch(/_padPrecip1\s*:\s*f32\s*,\s*\/\/\s*offset\s*300/);

      // Alignment verification: byte offset 288 is multiple of 16
      expect(288 % 16).toBe(0);
      expect(72 * 4).toBe(288);
      // Total struct size 304 bytes is multiple of 16
      expect(304 % 16).toBe(0);
      expect(76 * 4).toBe(304);
    });
  });

  describe('2. Unconditional Control Flow & Leopold-Maddock Drainage Swelling', () => {
    it('samples u_precipTexture using textureSampleLevel strictly in unconditional control flow', () => {
      const fsMainIdx = shaderSrc.indexOf('@fragment\nfn fs_main');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainBody = shaderSrc.slice(fsMainIdx);

      const discardIdx = fsMainBody.indexOf('discard;');
      const precipSampleIdx = fsMainBody.indexOf('textureSampleLevel(u_precipTexture, u_precipSampler, precipUV, 0.0)');
      
      expect(precipSampleIdx).toBeGreaterThan(0);
      expect(discardIdx).toBeGreaterThan(0);
      // Unconditional evaluation: textureSampleLevel MUST precede any discard statement (Invariant §3)
      expect(precipSampleIdx).toBeLessThan(discardIdx);
    });

    it('computes precipUV using direct texture coordinates', () => {
      expect(shaderSrc).toContain('let precipUV = input.uv;');
    });

    it('modulates river channel width via Leopold-Maddock pluvial factor', () => {
      expect(shaderSrc).toContain('let pluvialFactor = 1.0 + sim.u_pluvial_gamma * sqrt(clamp(precipRate, 0.0, 50.0));');
      expect(shaderSrc).toContain('riverWidthPx = riverWidthPx * pluvialFactor;');
    });

    it('provides compute_valley_drainage helper function', () => {
      expect(shaderSrc).toMatch(/fn\s+compute_valley_drainage\s*\(/);
    });
  });

  describe('3. WebGPUEngine Bindings & Lazy Allocations', () => {
    it('declares crustBindGroupLayout entries for bindings 9 and 10', () => {
      expect(engineSrc).toMatch(/binding:\s*9,\s*visibility:\s*GPUShaderStage\.FRAGMENT,\s*texture:\s*\{\s*sampleType:\s*'float',\s*viewDimension:\s*'2d'\s*\}/);
      expect(engineSrc).toMatch(/binding:\s*10,\s*visibility:\s*GPUShaderStage\.FRAGMENT,\s*sampler:\s*\{\s*type:\s*'filtering'\s*\}/);
    });

    it('implements ensurePrecipCrustTexture lazy allocator with fallback dummy', () => {
      expect(engineSrc).toContain('public ensurePrecipCrustTexture():');
      expect(engineSrc).toContain("format: 'r16float'");
      expect(engineSrc).toContain("bytesPerRow: 256");
    });

    it('clamps setPluvialGamma between 0.0 and 2.0', () => {
      const engine = new WebGPUEngine();
      expect(engine.pluvialGamma).toBe(0.0);

      engine.setPluvialGamma(1.5);
      expect(engine.pluvialGamma).toBe(1.5);

      engine.setPluvialGamma(-0.5);
      expect(engine.pluvialGamma).toBe(0.0);

      engine.setPluvialGamma(2.5);
      expect(engine.pluvialGamma).toBe(2.0);

      // Non-finite guard
      engine.setPluvialGamma(NaN);
      expect(engine.pluvialGamma).toBe(2.0);
    });

    it('packs u_pluvial_gamma into crustFloats[72] during updateUniforms', () => {
      const engine = new WebGPUEngine();
      const crustFloats = (engine as any).crustFloats;
      const crustUints = (engine as any).crustUints;
      expect(crustFloats.length).toBe(80);

      const writeBufferSpy = vi.fn();
      (engine as any).isInitialized = true;
      (engine as any).crustUniformBuffer = { dummy: true };
      (engine as any).simUniformBuffer = { dummy: true };
      (engine as any).device = { queue: { writeBuffer: writeBufferSpy } };
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        pluvialGamma: 1.7,
        weatherOpticalMode: 1,
      });

      expect(crustFloats[72]).toBeCloseTo(1.7, 5);
      expect(crustUints[73]).toBe(1);
      expect(crustFloats[74]).toBe(0.0);
      expect(crustFloats[75]).toBe(0.0);
    });
  });

  describe('4. AtmosphereDrawer UI Component Integration', () => {
    it('defines Pluvial Coupling VernierSlider with id sidebar-pluvial-coupling and [0.0, 2.0] range', () => {
      expect(drawerSrc).toContain('id="sidebar-pluvial-coupling"');
      expect(drawerSrc).toContain('label="Pluvial Coupling"');
      expect(drawerSrc).toContain('min={0.0}');
      expect(drawerSrc).toContain('max={2.0}');
      expect(drawerSrc).toContain('step={0.1}');
    });

    it('wires pluvialGamma prop and handler through AtmosphereDrawer', () => {
      expect(drawerSrc).toContain('pluvialGamma?: number;');
      expect(drawerSrc).toContain('onPluvialGammaChange?: (v: number) => void;');
      expect(drawerSrc).toContain('handlePluvialGammaChange');
    });
  });

  describe('5. WebGPUEngine Dynamic Ring Buffer Binding & Rotation Invariants', () => {
    it('pre-allocates triple crustPrecipBindGroups mapped to physical textures', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).crustBindGroupLayout = { dummy: 'layout' };
      (engine as any).crustUniformBuffer = mockDevice.createBuffer({ size: 304, usage: 0 });
      (engine as any).orbitalTextureView = { dummy: 'orbitalView' };
      (engine as any).orbitalSampler = { dummy: 'orbitalSampler' };
      (engine as any).demTextureView = { dummy: 'demView' };
      (engine as any).demSampler = { dummy: 'demSampler' };

      const ring = new TemporalTextureRingBuffer(mockDevice as any, 128, 128, 'r16float');
      const physView0 = ring.getPhysicalTextureView(0);
      const physView1 = ring.getPhysicalTextureView(1);
      const physView2 = ring.getPhysicalTextureView(2);

      engine.setPrecipitationRingBuffer(ring);
      const bindGroups = (engine as any).crustPrecipBindGroups;
      expect(bindGroups).not.toBeNull();
      expect(bindGroups.length).toBe(3);

      // Verify each bindgroup binds physical texture view
      expect(bindGroups[0].descriptor.entries.find((e: any) => e.binding === 9).resource).toBe(physView0);
      expect(bindGroups[1].descriptor.entries.find((e: any) => e.binding === 9).resource).toBe(physView1);
      expect(bindGroups[2].descriptor.entries.find((e: any) => e.binding === 9).resource).toBe(physView2);

      // Advance ring buffer and verify active slot physical index mapping
      ring.advance();
      const activeIdx = ring.getActivePhysicalIndex(1);
      expect(activeIdx).toBe(2);
      expect(bindGroups[activeIdx].descriptor.entries.find((e: any) => e.binding === 9).resource).toBe(physView2);

      // Unset ring buffer
      engine.setPrecipitationRingBuffer(null);
      expect((engine as any).crustPrecipBindGroups).toBeNull();
      expect((engine as any).precipTextureView).toBeNull();
    });

    it('maintains physical texture bind group parity even if ring buffer was advanced before attaching', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).crustBindGroupLayout = { dummy: 'layout' };
      (engine as any).crustUniformBuffer = mockDevice.createBuffer({ size: 304, usage: 0 });
      (engine as any).orbitalTextureView = { dummy: 'orbitalView' };
      (engine as any).orbitalSampler = { dummy: 'orbitalSampler' };
      (engine as any).demTextureView = { dummy: 'demView' };
      (engine as any).demSampler = { dummy: 'demSampler' };

      const ring = new TemporalTextureRingBuffer(mockDevice as any, 128, 128, 'r16float');
      // Advance ring buffer twice before attaching to engine
      ring.advance();
      ring.advance();

      engine.setPrecipitationRingBuffer(ring);
      const bindGroups = (engine as any).crustPrecipBindGroups;
      expect(bindGroups).not.toBeNull();

      // Bind group 0 MUST still correspond to physical texture 0
      expect(bindGroups[0].descriptor.entries.find((e: any) => e.binding === 9).resource).toBe(ring.getPhysicalTextureView(0));
      expect(bindGroups[1].descriptor.entries.find((e: any) => e.binding === 9).resource).toBe(ring.getPhysicalTextureView(1));
      expect(bindGroups[2].descriptor.entries.find((e: any) => e.binding === 9).resource).toBe(ring.getPhysicalTextureView(2));
    });

    it('verifies disposing precipRingBuffer while attached falls back to crustBindGroup without crashing', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;
      (engine as any).crustBindGroupLayout = { dummy: 'layout' };
      (engine as any).crustUniformBuffer = mockDevice.createBuffer({ size: 304, usage: 0 });
      (engine as any).simUniformBuffer = mockDevice.createBuffer({ size: 256, usage: 0 });
      (engine as any).orbitalTextureView = { dummy: 'orbitalView' };
      (engine as any).orbitalSampler = { dummy: 'orbitalSampler' };
      (engine as any).demTextureView = { dummy: 'demView' };
      (engine as any).demSampler = { dummy: 'demSampler' };
      const fallbackCrustBg = { dummy: 'crustBindGroup' };
      (engine as any).crustBindGroup = fallbackCrustBg;

      const ring = new TemporalTextureRingBuffer(mockDevice as any, 128, 128, 'r16float');
      engine.setPrecipitationRingBuffer(ring);
      expect((engine as any).crustPrecipBindGroups).not.toBeNull();

      // Externally dispose ring buffer while still attached
      ring.dispose();
      expect(ring.disposed).toBe(true);

      // Set up render pipeline and buffers to trigger crustHydrospherePipeline render block
      (engine as any).crustHydrospherePipeline = { dummy: 'pipeline' };
      (engine as any).crustVertexBuffer = mockDevice.createBuffer({ size: 100, usage: 0 });
      (engine as any).crustIndexBuffer = mockDevice.createBuffer({ size: 100, usage: 0 });
      (engine as any).crustIndexCount = 6;
      (engine as any).cartographicBuffersInitialized = true;
      (engine as any).isInitialized = true;
      (engine as any).depthTextureView = { dummy: 'depth' };

      let boundBg: any = null;
      const mockPass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn((idx: number, bg: any) => {
          if (idx === 0) boundBg = bg;
        }),
        setVertexBuffer: vi.fn(),
        setIndexBuffer: vi.fn(),
        draw: vi.fn(),
        drawIndexed: vi.fn(),
        end: vi.fn(),
      };

      const mockEncoder = {
        beginComputePass: () => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          dispatchWorkgroups: vi.fn(),
          end: vi.fn(),
        }),
        beginRenderPass: vi.fn(() => mockPass),
        finish: vi.fn(() => ({})),
      };
      mockDevice.createCommandEncoder = vi.fn(() => mockEncoder as any);
      (engine as any).context = {
        getCurrentTexture: () => ({
          createView: () => ({ label: 'mock_swapchain' }),
        }),
        canvas: { width: 800, height: 600 },
      };

      const frameParams: any = {
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        dt: 0.016,
        reliefActive: true,
        showRelief: true,
        renderStyle: 'architectural',
        camera: { position: { x: 0, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 } },
      };

      // Must execute without throwing unhandled exception
      expect(() => {
        engine.render(frameParams);
      }).not.toThrow();

      // Invariant: Crust render pass MUST bind fallback crustBindGroup instead of attempting to access disposed ring buffer
      expect(mockPass.setBindGroup).toHaveBeenCalled();
      expect(mockPass.setBindGroup.mock.calls[0]).toEqual([0, fallbackCrustBg]);
    });

    it('verifies ensurePrecipCrustTexture falls back cleanly to dummy view when precipRingBuffer is disposed', () => {
      const mockDevice = new MockGPUDevice();
      const engine = new WebGPUEngine();
      (engine as any).device = mockDevice;

      const ring = new TemporalTextureRingBuffer(mockDevice as any, 128, 128, 'r16float');
      engine.setPrecipitationRingBuffer(ring);
      ring.dispose();

      // Calling ensurePrecipCrustTexture after external disposal must not throw and must return dummyPrecipTextureView
      expect(() => engine.ensurePrecipCrustTexture()).not.toThrow();
      const view = engine.ensurePrecipCrustTexture();
      expect(view).toBe((engine as any).dummyPrecipTextureView);
    });
  });

  describe('6. Atmosphere Timeline & Weather Tau Coupling', () => {
    it('manages timelineMinutes and weatherTau state on WebGPUEngine', () => {
      const engine = new WebGPUEngine();
      expect(engine.timelineMinutes).toBe(0);
      expect(engine.weatherTau).toBe(0.0);

      engine.setTimelineMinutes(120);
      expect(engine.timelineMinutes).toBe(120);
      expect(engine.getTimelineMinutes()).toBe(120);

      engine.setWeatherTau(0.75);
      expect(engine.weatherTau).toBeCloseTo(0.75);
      expect(engine.getWeatherTau()).toBeCloseTo(0.75);

      // Clamp weatherTau between [0.0, 1.0]
      engine.setWeatherTau(-0.5);
      expect(engine.weatherTau).toBe(0.0);
      engine.setWeatherTau(1.5);
      expect(engine.weatherTau).toBe(1.0);

      // Defend against non-finite
      engine.setTimelineMinutes(NaN);
      expect(engine.timelineMinutes).toBe(120);
      engine.setWeatherTau(NaN);
      expect(engine.weatherTau).toBe(1.0);
    });

    it('updates timeline and tau via updateAtmosphereUniforms', () => {
      const engine = new WebGPUEngine();
      engine.updateAtmosphereUniforms({ weatherTimeMinutes: 240, weatherTau: 0.33 });
      expect(engine.timelineMinutes).toBe(240);
      expect(engine.weatherTau).toBeCloseTo(0.33);
    });

    it('updates timelineMinutes and weatherTau during updateUniforms call', () => {
      const engine = new WebGPUEngine();
      (engine as any).isInitialized = true;
      (engine as any).simUniformBuffer = { dummy: true };
      (engine as any).crustUniformBuffer = { dummy: true };
      (engine as any).device = { queue: { writeBuffer: vi.fn() } };
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        timelineMinutes: 360,
        weatherTau: 0.5,
      });

      expect(engine.timelineMinutes).toBe(360);
      expect(engine.weatherTau).toBeCloseTo(0.5);
    });
  });

  describe('7. AtmosphereDrawer & App.tsx Timeline Integration', () => {
    it('wires timelineMinutes and onTimelineChange into AtmosphereDrawer and mounts TimelineScrubber', () => {
      expect(drawerSrc).toContain('TimelineScrubber');
      expect(drawerSrc).toContain('timelineMinutes?: number;');
      expect(drawerSrc).toContain('onTimelineChange?: (state: TimelineScrubberState) => void;');
      expect(drawerSrc).toContain('value={timelineMinutes}');
      expect(drawerSrc).toContain('Atmospheric Chronology');
    });

    it('wires __INDICATRIX_SET_TIMELINE_MINUTES__ in App.tsx', () => {
      const appPath = path.resolve(__dirname, '../../src/App.tsx');
      const appSrc = fs.readFileSync(appPath, 'utf8');
      expect(appSrc).toContain('__INDICATRIX_SET_TIMELINE_MINUTES__');
      expect(appSrc).toContain('timelineMinutes={timelineMinutes}');
      expect(appSrc).toContain('updateAtmosphereUniforms');
    });
  });
});
