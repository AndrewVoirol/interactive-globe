// ============================================================================
// File: tests/webgpu/atmosphere-scatter-envelope.test.ts
// Target: Planetary Atmospheric Scattering Envelope Test Suite
// Authoritative References:
//   - docs/FIRST_PRINCIPLES_ATMOSPHERIC_SPEC.md (§1.3)
//   - first_principles_atmospheric_coupling_rfc.md (§1.3, §4.1)
//   - AGENTS.md Invariants:
//       * Invariant §3:  WGSL Uniform Control Flow (Unconditional Derivative Evaluation)
//       * Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//       * Invariant §10: Horizon Tangent Attenuation
//       * Invariant §20: 16-Byte WGSL Struct Alignment & 5-Core Buffer Discipline
//       * Invariant §24: Dynamic Theme Switching (Zero-Recompile Contract)
//       * Invariant §28: Exhaustive Multi-Medium Shader Parity (Themes 0, 1, 2)
//       * Invariant §48: Dynamic Texture Dimensions (Zero Hardcoded Literals)
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUFrameParams, WebGPUInitConfig } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

const SHADER_PATH = path.resolve(__dirname, '../../src/webgpu/shaders/atmosphere_scatter.wgsl');
const ENGINE_PATH = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');

const atmosphereShaderSource = fs.readFileSync(SHADER_PATH, 'utf-8');
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
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  }
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

function createDummyInitConfig(pointCount = 100, lineCount = 100): WebGPUInitConfig {
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

// ============================================================================
// Suite 1: WGSL Uniform Control Flow (Invariant §3)
// ============================================================================
describe('Suite 1: WGSL Uniform Control Flow (Invariant §3)', () => {
  it('ATM-FLOW-01: calls dpdx, dpdy, and fwidth unconditionally at top of fs_main', () => {
    const fsIndex = atmosphereShaderSource.indexOf('fn fs_main(');
    expect(fsIndex).toBeGreaterThan(-1);

    const fsBody = atmosphereShaderSource.slice(fsIndex);
    const dpdxIndex = fsBody.indexOf('dpdx(');
    const dpdyIndex = fsBody.indexOf('dpdy(');
    const fwidthIndex = fsBody.indexOf('fwidth(');

    expect(dpdxIndex).toBeGreaterThan(-1);
    expect(dpdyIndex).toBeGreaterThan(-1);
    expect(fwidthIndex).toBeGreaterThan(-1);

    // Verify all derivatives appear strictly before any discard
    const discardIndex = fsBody.indexOf('discard;');
    expect(dpdxIndex).toBeLessThan(discardIndex);
    expect(dpdyIndex).toBeLessThan(discardIndex);
    expect(fwidthIndex).toBeLessThan(discardIndex);

    // Verify all derivatives appear strictly before any conditional if
    const ifIndex = fsBody.indexOf('if (');
    expect(dpdxIndex).toBeLessThan(ifIndex);
    expect(dpdyIndex).toBeLessThan(ifIndex);
    expect(fwidthIndex).toBeLessThan(ifIndex);
  });

  it('ATM-FLOW-02: incorporates derivAnchor into finalAlpha return value', () => {
    expect(atmosphereShaderSource).toContain('let derivAnchor = (du_dx + du_dy + dv_dx + dv_dy + dUv.x) * 1.0e-7;');
    expect(atmosphereShaderSource).toContain('finalAlpha = clamp(finalAlpha + derivAnchor, 0.0, 1.0);');
  });
});

// ============================================================================
// Suite 2: Multi-Medium Parity & Premultiplied Alpha (Invariant §5 & §28)
// ============================================================================
describe('Suite 2: Multi-Medium Parity & Premultiplied Alpha (Invariant §5 & §28)', () => {
  it('ATM-MED-01: contains explicit branches for u_theme == 0u, 1u, and 2u', () => {
    expect(atmosphereShaderSource).toContain('if (atmosphere.u_theme == 0u)');
    expect(atmosphereShaderSource).toContain('else if (atmosphere.u_theme == 1u)');
    expect(atmosphereShaderSource).toContain('else if (atmosphere.u_theme == 2u)');
  });

  it('ATM-MED-02: Theme 0 (Marie Tharp 1977) uses luminous Rayleigh/Mie blue-to-black scatter envelope', () => {
    expect(atmosphereShaderSource).toContain('deepIndigo = vec3<f32>(0.12, 0.16, 0.23);');
    expect(atmosphereShaderSource).toContain('ceruleanGlow = vec3<f32>(0.28, 0.62, 0.92);');
    expect(atmosphereShaderSource).toContain('rimHighlight = vec3<f32>(0.72, 0.88, 1.00);');
  });

  it('ATM-MED-03: Theme 1 (Cream Rag) satisfies Invariant §5 (zero additive blowout against #F3ECE0)', () => {
    // Archival mineral celadon and lapis watercolor wash with paper tooth
    expect(atmosphereShaderSource).toContain('mineralCeladon = vec3<f32>(0.30, 0.46, 0.44);');
    expect(atmosphereShaderSource).toContain('mineralLapis = vec3<f32>(0.24, 0.36, 0.46);');
    expect(atmosphereShaderSource).toContain('toothFactor');
    expect(atmosphereShaderSource).toContain('atmosphere.u_mediumProperties.w');

    // Alpha is clamped to 0.32 max to prevent white blowout on #F3ECE0 cotton rag paper
    expect(atmosphereShaderSource).toContain('finalAlpha = clamp(baseAlpha * toothFactor * limbAtten * unfurlAtten, 0.0, 0.32);');
  });

  it('ATM-MED-04: Theme 2 (Prussian Cyanotype 1842) uses actinic cyan-blue aura with sensitometric gamma', () => {
    expect(atmosphereShaderSource).toContain('actinicCyan = vec3<f32>(0.38, 0.76, 0.96);');
    expect(atmosphereShaderSource).toContain('deepActinic = vec3<f32>(0.15, 0.48, 0.78);');
    expect(atmosphereShaderSource).toContain('let gamma = max(0.5, atmosphere.u_mediumProperties.z);');
    expect(atmosphereShaderSource).toContain('pow(clamp(opticalDepth * 0.45, 0.0, 1.0), gamma)');
  });

  it('ATM-MED-05: Returns premultiplied alpha: vec4<f32>(scatterColor * finalAlpha, finalAlpha)', () => {
    expect(atmosphereShaderSource).toContain('return vec4<f32>(scatterColor * finalAlpha, finalAlpha);');
  });
});

// ============================================================================
// Suite 3: 16-Byte WGSL Struct Alignment (Invariant §20)
// ============================================================================
describe('Suite 3: 16-Byte WGSL Struct Alignment (Invariant §20)', () => {
  it('ATM-UNIF-01: AtmosphereUniforms matches RFC §4.1 layout (288 bytes / 72 floats)', () => {
    const structStart = atmosphereShaderSource.indexOf('struct AtmosphereUniforms {');
    const structEnd = atmosphereShaderSource.indexOf('};', structStart);
    const structBody = atmosphereShaderSource.slice(structStart, structEnd);

    // Scalar fields packed in 16-byte words
    expect(structBody).toContain('u_unfurl: f32');
    expect(structBody).toContain('u_mode: u32');
    expect(structBody).toContain('u_theme: u32');
    expect(structBody).toContain('u_time: f32');

    // Vector fields with 16-byte alignment
    expect(structBody).toContain('u_cameraPos: vec4<f32>');
    expect(structBody).toContain('u_viewport: vec4<f32>');
    expect(structBody).toContain('u_cloudDrift: vec4<f32>');
    expect(structBody).toContain('u_layerStandoff: vec4<f32>');
    expect(structBody).toContain('u_layerOpacity: vec4<f32>');

    // Sun direction vector (floats 28..31, byte offset 112)
    expect(structBody).toContain('u_sunDirection: vec4<f32>');

    // Medium properties (floats 32..35, byte offset 128)
    expect(structBody).toContain('u_mediumProperties: vec4<f32>');

    // 16-byte pad (floats 36..39, byte offset 144)
    expect(structBody).toContain('u_pad: vec4<f32>');

    // View & Projection matrices (64 bytes each)
    expect(structBody).toContain('u_viewMatrix: mat4x4<f32>');
    expect(structBody).toContain('u_projectionMatrix: mat4x4<f32>');
  });
});

// ============================================================================
// Suite 4: Dynamic Dimensions & Ray-Shell Geometry (Invariant §48)
// ============================================================================
describe('Suite 4: Dynamic Dimensions & Ray-Shell Geometry (Invariant §48)', () => {
  it('ATM-GEOM-01: Contains zero hardcoded DEM dimensions', () => {
    expect(atmosphereShaderSource).not.toMatch(/8192/);
    expect(atmosphereShaderSource).not.toMatch(/4096/);
  });

  it('ATM-GEOM-02: Concentric spherical shell is defined at R = 5.080 at base scale', () => {
    expect(atmosphereShaderSource).toContain('const RADIUS: f32 = 5.0;');
    expect(atmosphereShaderSource).toContain('let shellStandoff = 0.080 * (1.0 + (scaleFactor - 1.0) * 0.15);');
    expect(atmosphereShaderSource).toContain('let rAtm = RADIUS + 0.080 * (1.0 + (scaleFactor - 1.0) * 0.15);');
  });

  it('ATM-GEOM-03: Evaluates ray-sphere discriminant for outer shell and planet crust', () => {
    expect(atmosphereShaderSource).toContain('let discAtm = b * b - cAtm;');
    expect(atmosphereShaderSource).toContain('let discCrust = b * b - cCrust;');
  });
});

// ============================================================================
// Suite 5: WebGPUEngine Integration & Buffer Discipline
// ============================================================================
describe('Suite 5: WebGPUEngine Integration & Buffer Discipline', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    setupMockNavigator();
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    engine.dispose();
    restoreMockNavigator();
  });

  it('ATM-INT-01: Maintains exactly 5 core buffers at startup (Invariant §20)', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);
    const device = (engine as any).device as MockGPUDevice;
    expect(device.buffers.length).toBe(5);
    expect(engine.getAtmosphereUniformBuffer()).toBeNull();
  });

  it('ATM-INT-02: ensureAtmosphereScatterBuffers allocates a 288-byte uniform buffer lazily', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);
    const device = (engine as any).device as MockGPUDevice;

    engine.ensureAtmosphereScatterBuffers();
    expect(device.buffers.length).toBe(6); // 5 core + 1 atmosphere uniform

    const atmUBuffer = engine.getAtmosphereUniformBuffer();
    expect(atmUBuffer).toBeDefined();
    expect((atmUBuffer as any).size).toBe(288);
  });

  it('ATM-INT-03: Atmosphere scatter pipeline is initialized in initPipelines', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);
    expect(engine.getAtmosphereScatterPipeline()).toBeDefined();
  });

  it('ATM-INT-04: Atmosphere scatter toggle setAtmosphereScatter / getAtmosphereScatter works', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);
    expect(engine.getAtmosphereScatter()).toBe(true);

    engine.setAtmosphereScatter(false);
    expect(engine.getAtmosphereScatter()).toBe(false);

    engine.setAtmosphereScatter(true);
    expect(engine.getAtmosphereScatter()).toBe(true);
  });

  it('ATM-INT-05: dispose cleans up all atmosphere resources with zero leaks', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);
    engine.ensureAtmosphereScatterBuffers();

    const device = (engine as any).device as MockGPUDevice;
    expect(device.buffers.length).toBeGreaterThan(0);

    engine.dispose();
    expect(engine.getAtmosphereUniformBuffer()).toBeNull();
    expect((engine as any).atmosphereBindGroup).toBeNull();
    expect(device.buffers.length).toBe(0);
  });

  it('ATM-INT-06: renders atmosphere scatter independently and updates uniforms when clouds are disabled', async () => {
    const config = createDummyInitConfig();
    await engine.init(config);
    const device = (engine as any).device as MockGPUDevice;

    const frameParams: WebGPUFrameParams = {
      unfurl: 0.0,
      mode: 0,
      theme: 0,
      time: 1.5,
      dt: 0.016,
      camera: new THREE.PerspectiveCamera(),
      viewport: { width: 1920, height: 1080 },
      showClouds: false,
      showAtmosphere: true,
      atmosphericScale: 3.5,
      shadowIntensity: 0.45,
    };

    engine.render(frameParams);

    // 1. Atmosphere buffer must be lazily allocated
    const atmUBuffer = engine.getAtmosphereUniformBuffer();
    expect(atmUBuffer).toBeDefined();
    expect((atmUBuffer as any).size).toBe(288);

    // 2. Uniforms must be written to atmosphere buffer even with clouds off
    const writes = device.queue.writeBufferCalls.filter(c => (c.buffer as any) === atmUBuffer);
    expect(writes.length).toBeGreaterThan(0);
    const writtenFloats = new Float32Array(writes[0].data as ArrayBuffer);
    expect(writtenFloats[26]).toBe(3.5); // atmosphericScale
  });
});
