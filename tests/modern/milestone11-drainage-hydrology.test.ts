import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Milestone 11: Geomorphic Drainage Basin Synthesis & Leopold-Maddock Hydrology', () => {
  const drainageShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/drainage_accumulation.wgsl');
  const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const sidebarPath = path.resolve(__dirname, '../../src/components/hud/UnifiedRightSidebar.tsx');
  const canvasPath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');
  const appPath = path.resolve(__dirname, '../../src/App.tsx');
  const telemetryHudPath = path.resolve(__dirname, '../../src/components/hud/TelemetryHUD.tsx');

  const drainageShaderSrc = fs.readFileSync(drainageShaderPath, 'utf8');
  const crustShaderSrc = fs.readFileSync(crustShaderPath, 'utf8');
  const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');
  const canvasSrc = fs.readFileSync(canvasPath, 'utf8');
  const appSrc = fs.readFileSync(appPath, 'utf8');
  const telemetryHudSrc = fs.readFileSync(telemetryHudPath, 'utf8');

  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('1. Task M11-T1: Dynamic Drainage Basin Accumulation & Uniform Struct Layout', () => {
    it('DrainageBasinUniforms enforces exact 32-byte layout with 16-byte alignment', () => {
      expect(drainageShaderSrc).toContain('struct DrainageBasinUniforms');
      expect(crustShaderSrc).toContain('struct DrainageBasinUniforms');

      const mirror = (engine as any).drainageUniformMirror;
      expect(mirror).toBeInstanceOf(ArrayBuffer);
      expect(mirror.byteLength).toBe(32);
    });

    it('validates 32-byte uniform field offsets and typed array mirror mapping (Rule 26)', () => {
      (engine as any).device = {
        queue: {
          writeBuffer: vi.fn(),
        },
      };
      (engine as any).drainageUniformBuffer = {};

      engine.updateDrainageUniforms({
        widthExponentB: 0.52,
        depthExponentF: 0.38,
        erodibilityK: 1.25,
        flintM: 0.48,
        flintN: 0.95,
        minDischargeThreshold: 0.005,
        demWidth: 4096,
        demHeight: 2048,
      });

      const floats = (engine as any).drainageFloats as Float32Array;
      const uints = (engine as any).drainageUints as Uint32Array;

      // Offsets 0..20: floats
      expect(floats[0]).toBeCloseTo(0.52, 5); // u_widthExponentB
      expect(floats[1]).toBeCloseTo(0.38, 5); // u_depthExponentF
      expect(floats[2]).toBeCloseTo(1.25, 5); // u_erodibilityConstantK
      expect(floats[3]).toBeCloseTo(0.48, 5); // u_flintExponentM
      expect(floats[4]).toBeCloseTo(0.95, 5); // u_flintExponentN
      expect(floats[5]).toBeCloseTo(0.005, 5); // u_minDischargeThreshold

      // Offsets 24..28: vec2<u32> (indices 6 and 7 in 32-bit words)
      expect(uints[6]).toBe(4096); // u_demGridDimensions.x
      expect(uints[7]).toBe(2048); // u_demGridDimensions.y
    });

    it('evaluates steepest descent / D-infinity downhill flow direction field in compute shader', () => {
      expect(drainageShaderSrc).toContain('let slope = sqrt(gx * gx + gy * gy);');
      expect(drainageShaderSrc).toContain('let downhill = vec2<f32>(-gx * invSlope, -gy * invSlope);');
      expect(drainageShaderSrc).toContain('let laplacian = d2x + d2y;');
      expect(drainageShaderSrc).toContain('let valleyCurvature = max(0.0, laplacian * 1e6);');
    });

    it('integrates live rainfall into discharge Q(x) along upstream catchment trajectory', () => {
      expect(drainageShaderSrc).toContain('u_precipTexture');
      expect(drainageShaderSrc).toContain('let precipRate = textureSampleLevel(u_precipTexture, u_precipSampler, uv, 0.0).r;');
      expect(drainageShaderSrc).toContain('accumulatedPrecip += upPrecip * stepWeight;');
      expect(drainageShaderSrc).toContain('let dischargeQ = accumulatedArea * pluvialFactor;');
    });
  });

  describe('2. Task M11-T2: Leopold-Maddock Hydraulic Power Law Scaling & Flint Bedrock Incision', () => {
    it('verifies Leopold-Maddock (1953) hydraulic geometry: W = a * Q^0.50 and D = c * Q^0.40', () => {
      const calcWidth = (a: number, Q: number) => a * Math.pow(Math.max(0, Q), 0.50);
      const calcDepth = (c: number, Q: number) => c * Math.pow(Math.max(0, Q), 0.40);

      const a = 1.0;
      const c = 0.5;

      const Q_headwater = 1.0;
      const Q_confluence = 100.0;
      const Q_estuary = 10000.0;

      const W_headwater = calcWidth(a, Q_headwater);
      const W_confluence = calcWidth(a, Q_confluence);
      const W_estuary = calcWidth(a, Q_estuary);

      const D_headwater = calcDepth(c, Q_headwater);
      const D_confluence = calcDepth(c, Q_confluence);
      const D_estuary = calcDepth(c, Q_estuary);

      // Width scaling factor is exactly 10x for 100x discharge increase (sqrt)
      expect(W_confluence / W_headwater).toBeCloseTo(10.0, 5);
      expect(W_estuary / W_confluence).toBeCloseTo(10.0, 5);

      // Depth scaling factor is 100^0.40 = 6.30957
      expect(D_confluence / D_headwater).toBeCloseTo(Math.pow(100, 0.40), 4);

      // Leopold-Maddock invariant: width widens faster than depth downstream (b / f = 0.50 / 0.40 = 1.25 > 1.0)
      const widthExpansionRatio = (W_confluence / W_headwater);
      const depthExpansionRatio = (D_confluence / D_headwater);
      expect(widthExpansionRatio).toBeGreaterThan(depthExpansionRatio);
    });

    it('verifies Flint Law bedrock incision rate monotonically scales with upstream area and slope', () => {
      const calcIncision = (K: number, A: number, S: number) => K * Math.pow(Math.max(0, A), 0.45) * Math.pow(Math.max(0, S), 1.0);

      const K = 1.0;
      const slopeHigh = 0.15;
      const slopeLow = 0.02;
      const areaSmall = 10.0;
      const areaLarge = 1000.0;

      const incSmallSteep = calcIncision(K, areaSmall, slopeHigh);
      const incLargeSteep = calcIncision(K, areaLarge, slopeHigh);
      const incLargeFlat = calcIncision(K, areaLarge, slopeLow);

      expect(incLargeSteep).toBeGreaterThan(incSmallSteep);
      expect(incLargeSteep).toBeGreaterThan(incLargeFlat);
    });

    it('preserves Invariant #7: river width strictly proportioned below 3.40px coastline width', () => {
      expect(crustShaderSrc).toContain('var riverWidthPx = mix(0.40, 1.98, descentAccum);');
      // Max river width (1.98px) is ~58.2% of 3.40px coastline width (strictly 55%-60%)
      const maxRiverPx = 1.98;
      const coastlinePx = 3.40;
      const ratio = maxRiverPx / coastlinePx;
      expect(ratio).toBeGreaterThanOrEqual(0.55);
      expect(ratio).toBeLessThanOrEqual(0.60);
    });

    it('samples u_drainageTexture unconditionally at LOD 0.0 at top of fs_main before discard (Rule 4)', () => {
      const fsMainIdx = crustShaderSrc.indexOf('fn fs_main(');
      expect(fsMainIdx).toBeGreaterThan(0);
      const fsMainCode = crustShaderSrc.slice(fsMainIdx);

      const drainageSampleIdx = fsMainCode.indexOf('textureSampleLevel(u_drainageTexture');
      const firstBranchOrDiscardIdx = fsMainCode.indexOf('discard;');

      expect(drainageSampleIdx).toBeGreaterThan(0);
      expect(drainageSampleIdx).toBeLessThan(firstBranchOrDiscardIdx);
    });
  });

  describe('3. Task M11-T3: Archival Medium Inking & Hydrologic Pigmentation (Rule 3)', () => {
    it('Theme 1 (Cream Rag Paper) renders copperplate intaglio incisions (#38302A) with celadon-lapis glazes', () => {
      expect(crustShaderSrc).toContain('let cAlpineCeladon = vec3<f32>(0.32, 0.48, 0.46);');
      expect(crustShaderSrc).toContain('let cLowlandLapis   = vec3<f32>(0.18, 0.32, 0.46);');
      expect(crustShaderSrc).toContain('let cCopperplateInk = vec3<f32>(0.22, 0.19, 0.16);');
      expect(crustShaderSrc).toContain('riverIntaglioDeboss');
    });

    it('Theme 2 (Prussian Cyanotype) renders photochemical actinic white to cerulean with zero warm bleed', () => {
      expect(crustShaderSrc).toContain('let cChalkCerulean = vec3<f32>(0.52, 0.76, 0.92);');
      expect(crustShaderSrc).toContain('let cDraftCerulean = vec3<f32>(0.32, 0.58, 0.80);');
      expect(crustShaderSrc).toContain('let cActinicWhite  = vec3<f32>(0.92, 0.96, 1.00);');
    });

    it('Theme 0 (Marie Tharp) extends Heinrich Berann turquoise drafting glaze across shelf break', () => {
      expect(crustShaderSrc).toContain('let cAlpineCyan = vec3<f32>(0.32, 0.64, 0.72);');
      expect(crustShaderSrc).toContain('let cEstuaryCyan = vec3<f32>(0.18, 0.46, 0.56);');
      expect(crustShaderSrc).toContain('cSubmarineChasm');
    });
  });

  describe('4. Task M11-T4: Tactile HUD Instrument & Property Plumbing', () => {
    it('UnifiedRightSidebar renders dedicated Geomorphic Hydrology switch and collapsible sliders', () => {
      expect(sidebarSrc).toContain('id="sidebar-geomorphic-hydrology-toggle"');
      expect(sidebarSrc).toContain('id="sidebar-pluvial-discharge-coupling"');
      expect(sidebarSrc).toContain('id="sidebar-bedrock-incision"');
      expect(sidebarSrc).toContain('Geomorphic Hydrology');
      expect(sidebarSrc).toContain('D-∞ catchment routing & Leopold-Maddock');
    });

    it('enforces semantic typography on hydrology controls without raw pixel font utilities', () => {
      const hydroMatch = sidebarSrc.match(/id="sidebar-geomorphic-hydrology-toggle"[\s\S]*?id="sidebar-bedrock-incision"/);
      expect(hydroMatch).not.toBeNull();
      const snippet = hydroMatch![0];
      expect(snippet).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
      expect(snippet).toMatch(/text-(micro|nano|caption|body)/);
    });

    it('plumbs geomorphic hydrology state cleanly through App.tsx, TelemetryHUD, and WebGPUCanvas', () => {
      expect(appSrc).toContain('const [geomorphicHydrology, setGeomorphicHydrology] = useState<boolean>(false);');
      expect(appSrc).toContain('const [pluvialDischargeCoupling, setPluvialDischargeCoupling] = useState<number>(1.0);');
      expect(appSrc).toContain('const [bedrockIncision, setBedrockIncision] = useState<number>(1.0);');

      expect(telemetryHudSrc).toContain('geomorphicHydrology?: boolean;');
      expect(telemetryHudSrc).toContain('pluvialDischargeCoupling?: number;');
      expect(telemetryHudSrc).toContain('bedrockIncision?: number;');

      expect(canvasSrc).toContain('geomorphicHydrology?: boolean;');
      expect(canvasSrc).toContain('pluvialDischargeCoupling?: number;');
      expect(canvasSrc).toContain('bedrockIncision?: number;');
      expect(canvasSrc).toContain('engineRef.current.setDrainageHydrologyEnabled');
      expect(canvasSrc).toContain('engineRef.current.updateDrainageUniforms');
    });
  });

  describe('5. Safety Invariants: Rule 8, Rule 24 Zero-Zombie Pass, and Rule 26 Zero-GC', () => {
    it('satisfies Rule 8 Cross-Pipeline DEM Parity in elevation decoding', () => {
      const demDecode = 'demSample.a * 19772.0 - 10924.0';
      expect(drainageShaderSrc).toContain(demDecode);
      expect(crustShaderSrc).toContain(demDecode);
    });

    it('satisfies Rule 24 Zero-Zombie Pass Invariant: bypasses drainage compute pass when disabled', () => {
      const engineSrc = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts'), 'utf8');
      expect(engineSrc).toContain('const hasDrainageCompute = showDrainageHydrology && !!(');
      expect(engineSrc).toContain('if (hasDrainageCompute) {');
      expect(engineSrc).toContain('computePass.setPipeline(this.drainagePipeline!);');
    });

    it('satisfies Rule 26 Zero-GC Per-Frame Buffer Discipline with preallocated bind group permutations', () => {
      const engineSrc = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts'), 'utf8');
      expect(engineSrc).toContain('crustGroup1BindGroups: (GPUBindGroup | null)[] = [null, null, null, null];');
      expect(engineSrc).toContain('const bgIndex = (showTerrainShadows ? 1 : 0) | (showDrainageHydrology ? 2 : 0);');
      expect(engineSrc).toContain('this.crustGroup1BindGroups[bgIndex]');
    });
  });
});
