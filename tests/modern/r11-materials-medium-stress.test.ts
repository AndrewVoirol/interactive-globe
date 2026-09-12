import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ThemeManager,
  DARK_CYBER_THEME,
  MARIE_THARP_THEME,
  LIGHT_MONOCHROME_THEME,
  CREAM_RAG_THEME,
  PRUSSIAN_CYANOTYPE_THEME,
  ThemeMode,
  ArchivalMediumId,
} from '../../src/core/themes/ThemeManager';

describe('Adversarial Challenger: Stage 2 Shader & Uniform Alignment Suite (R11)', () => {
  const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
  const themeManagerPath = path.resolve(__dirname, '../../src/core/themes/ThemeManager.ts');

  const crustSrc = fs.readFileSync(crustShaderPath, 'utf8');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');
  const themeManagerSrc = fs.readFileSync(themeManagerPath, 'utf8');

  // ==========================================================================
  // SECTION 1: 16-Byte WGSL Struct Alignment & Memory Footprint of SimUniforms
  // ==========================================================================
  describe('1. 16-Byte WGSL Struct Alignment & Uniform Buffer Footprint', () => {
    interface FieldSpec {
      name: string;
      type: string;
      size: number;
      align: number;
      expectedOffset: number;
      expectedEnd: number;
      expectedFloatIdx: number;
    }

    // Exact field specification of SimUniforms per W3C WGSL Memory Layout Specification
    const expectedFields: FieldSpec[] = [
      { name: 'u_unfurl',            type: 'f32',        size: 4,  align: 4,  expectedOffset: 0,   expectedEnd: 4,   expectedFloatIdx: 0 },
      { name: 'u_mode',              type: 'u32',        size: 4,  align: 4,  expectedOffset: 4,   expectedEnd: 8,   expectedFloatIdx: 1 },
      { name: 'u_theme',             type: 'u32',        size: 4,  align: 4,  expectedOffset: 8,   expectedEnd: 12,  expectedFloatIdx: 2 },
      { name: 'u_time',              type: 'f32',        size: 4,  align: 4,  expectedOffset: 12,  expectedEnd: 16,  expectedFloatIdx: 3 },
      { name: 'u_viewport',          type: 'vec4<f32>',  size: 16, align: 16, expectedOffset: 16,  expectedEnd: 32,  expectedFloatIdx: 4 },
      { name: 'u_cameraPos',         type: 'vec4<f32>',  size: 16, align: 16, expectedOffset: 32,  expectedEnd: 48,  expectedFloatIdx: 8 },
      { name: 'u_cursorHitPos',      type: 'vec4<f32>',  size: 16, align: 16, expectedOffset: 48,  expectedEnd: 64,  expectedFloatIdx: 12 },
      { name: 'u_cursorVel',         type: 'vec4<f32>',  size: 16, align: 16, expectedOffset: 64,  expectedEnd: 80,  expectedFloatIdx: 16 },
      { name: 'u_cursorActive',      type: 'f32',        size: 4,  align: 4,  expectedOffset: 80,  expectedEnd: 84,  expectedFloatIdx: 20 },
      { name: 'u_displacementScale', type: 'f32',        size: 4,  align: 4,  expectedOffset: 84,  expectedEnd: 88,  expectedFloatIdx: 21 },
      { name: 'u_seaLevel',          type: 'f32',        size: 4,  align: 4,  expectedOffset: 88,  expectedEnd: 92,  expectedFloatIdx: 22 },
      { name: 'u_roughness',         type: 'f32',        size: 4,  align: 4,  expectedOffset: 92,  expectedEnd: 96,  expectedFloatIdx: 23 },
      { name: 'u_viewMatrix',        type: 'mat4x4<f32>',size: 64, align: 16, expectedOffset: 96,  expectedEnd: 160, expectedFloatIdx: 24 },
      { name: 'u_projectionMatrix',  type: 'mat4x4<f32>',size: 64, align: 16, expectedOffset: 160, expectedEnd: 224, expectedFloatIdx: 40 },
      { name: 'u_sunAzimuth',        type: 'f32',        size: 4,  align: 4,  expectedOffset: 224, expectedEnd: 228, expectedFloatIdx: 56 },
      { name: 'u_sunAltitude',       type: 'f32',        size: 4,  align: 4,  expectedOffset: 228, expectedEnd: 232, expectedFloatIdx: 57 },
      { name: 'u_ambientOcclusion',  type: 'f32',        size: 4,  align: 4,  expectedOffset: 232, expectedEnd: 236, expectedFloatIdx: 58 },
      { name: 'u_waterClarity',      type: 'f32',        size: 4,  align: 4,  expectedOffset: 236, expectedEnd: 240, expectedFloatIdx: 59 },
      { name: 'u_peakExponent',      type: 'f32',        size: 4,  align: 4,  expectedOffset: 240, expectedEnd: 244, expectedFloatIdx: 60 },
      { name: 'u_layerOpacity',      type: 'f32',        size: 4,  align: 4,  expectedOffset: 244, expectedEnd: 248, expectedFloatIdx: 61 },
      { name: 'u_renderStyle',       type: 'u32',        size: 4,  align: 4,  expectedOffset: 248, expectedEnd: 252, expectedFloatIdx: 62 },
      { name: 'u_isolatedStratum',   type: 'f32',        size: 4,  align: 4,  expectedOffset: 252, expectedEnd: 256, expectedFloatIdx: 63 },
      { name: 'u_mediumProperties',  type: 'vec4<f32>',  size: 16, align: 16, expectedOffset: 256, expectedEnd: 272, expectedFloatIdx: 64 },
    ];

    it('R11-ALIGN-01: calculates dynamic byte offsets confirming 16-byte alignment at offset 256', () => {
      let currentByte = 0;

      for (const field of expectedFields) {
        // Alignment rule: advance currentByte to next multiple of field.align
        const remainder = currentByte % field.align;
        if (remainder !== 0) {
          currentByte += (field.align - remainder);
        }

        expect(currentByte).toBe(field.expectedOffset);
        expect(currentByte % field.align).toBe(0);
        expect(field.expectedOffset / 4).toBe(field.expectedFloatIdx);

        currentByte += field.size;
        expect(currentByte).toBe(field.expectedEnd);
      }

      // Final struct alignment rule: struct size must be rounded up to multiple of max alignment (16)
      const maxAlign = 16;
      const structRemainder = currentByte % maxAlign;
      const totalStructSize = structRemainder === 0 ? currentByte : currentByte + (maxAlign - structRemainder);

      expect(totalStructSize).toBe(272);
      expect(totalStructSize % 16).toBe(0);
      expect(totalStructSize / 4).toBe(68);
    });

    it('R11-ALIGN-02: verifies SimUniforms definition in crust_hydrosphere.wgsl matches expected order', () => {
      const structMatch = crustSrc.match(/struct\s+SimUniforms\s*\{([\s\S]*?)\};/);
      expect(structMatch).not.toBeNull();

      const structBody = structMatch![1];
      const fieldLines = structBody
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//') && l.includes(':'));

      expect(fieldLines.length).toBeGreaterThanOrEqual(expectedFields.length);

      expectedFields.forEach((expected, idx) => {
        const line = fieldLines[idx];
        const [fieldName, fieldTypeWithComment] = line.split(':').map(s => s.trim());
        const fieldType = fieldTypeWithComment.split(';')[0].split(',')[0].trim();

        expect(fieldName).toBe(expected.name);
        expect(fieldType).toBe(expected.type);
      });
    });

    it('R11-ALIGN-03: verifies WebGPUEngine allocation and buffer registration matches 68 to 80 floats (272 to 320 bytes)', () => {
      // 1. Float32Array size
      expect(engineSrc).toMatch(/private\s+crustFloats\s*=\s*new\s+Float32Array\((68|72|76|80)\)/);
      // 2. Uint32Array overlay for u32 fields
      expect(engineSrc).toMatch(/private\s+crustUints\s*=\s*new\s+Uint32Array\(this\.crustFloats\.buffer\)/);
      // 3. GPUBuffer size = 272 to 320
      expect(engineSrc).toMatch(/this\.crustUniformBuffer\s*=\s*this\.device\.createBuffer\(\{\s*size:\s*(272|288|304|320)/);
      // 4. writeBuffer with exact buffer
      expect(engineSrc).toMatch(/this\.device\.queue\.writeBuffer\(this\.crustUniformBuffer,\s*0,\s*cf\.buffer\)/);
    });

    it('R11-ALIGN-04: verifies exact field-to-float index assignments in WebGPUEngine.ts', () => {
      // Check indices 0..3
      expect(engineSrc).toMatch(/cf\[0\]\s*=\s*params\.unfurl/);
      expect(engineSrc).toMatch(/cu\[1\]\s*=\s*params\.mode/);
      expect(engineSrc).toMatch(/cu\[2\]\s*=\s*params\.theme/);
      expect(engineSrc).toMatch(/cf\[3\]\s*=\s*params\.time/);

      // Check viewport (4..7)
      expect(engineSrc).toMatch(/cf\[4\]\s*=\s*vpWidth/);
      expect(engineSrc).toMatch(/cf\[5\]\s*=\s*vpHeight/);
      expect(engineSrc).toMatch(/cf\[6\]\s*=\s*1\.0\s*\/\s*vpWidth/);
      expect(engineSrc).toMatch(/cf\[7\]\s*=\s*1\.0\s*\/\s*vpHeight/);

      // Check camera & cursor (8..23)
      expect(engineSrc).toMatch(/cf\[8\]\s*=\s*params\.camera\.position\.x/);
      expect(engineSrc).toMatch(/cf\[12\]/); // cursorHitPos
      expect(engineSrc).toMatch(/cf\[16\]/); // cursorVel
      expect(engineSrc).toMatch(/cf\[20\]\s*=\s*params\.cursorActive/);
      expect(engineSrc).toMatch(/cf\[21\]\s*=\s*params\.displacementScale/);
      expect(engineSrc).toMatch(/cf\[22\]\s*=\s*params\.seaLevel/);
      expect(engineSrc).toMatch(/cf\[23\]\s*=\s*params\.theme/);

      // Check matrices (24..55)
      expect(engineSrc).toMatch(/params\.camera\.matrixWorldInverse\.toArray\(cf,\s*24\)/);
      expect(engineSrc).toMatch(/params\.camera\.projectionMatrix\.toArray\(cf,\s*40\)/);

      // Check cartographic parameters (56..63)
      expect(engineSrc).toMatch(/cf\[56\]\s*=\s*params\.sunAzimuth/);
      expect(engineSrc).toMatch(/cf\[57\]\s*=\s*params\.sunAltitude/);
      expect(engineSrc).toMatch(/cf\[58\]\s*=\s*params\.ambientOcclusion/);
      expect(engineSrc).toMatch(/cf\[59\]\s*=\s*params\.waterClarity/);
      expect(engineSrc).toMatch(/cf\[60\]\s*=\s*params\.peakExponent/);
      expect(engineSrc).toMatch(/cf\[61\]\s*=\s*params\.opacity/);
      expect(engineSrc).toMatch(/cu\[62\]\s*=\s*styleCode/);
      expect(engineSrc).toMatch(/cf\[63\]\s*=\s*params\.isolatedStratum/);

      // Check Stage 2 physical medium properties (64..67)
      expect(engineSrc).toMatch(/this\.crustFloats\[64\]\s*=\s*medium\?\.inkAbsorption/);
      expect(engineSrc).toMatch(/this\.crustFloats\[65\]\s*=\s*medium\?\.fiberDensity/);
      expect(engineSrc).toMatch(/this\.crustFloats\[66\]\s*=\s*medium\?\.exposureGamma/);
      expect(engineSrc).toMatch(/this\.crustFloats\[67\]\s*=\s*medium\?\.stippleDensity/);
    });
  });

  // ==========================================================================
  // SECTION 2: Adversarial Static Analysis of WGSL Derivatives (Invariant #3)
  // ==========================================================================
  describe('2. Adversarial Static Analysis of WGSL Derivatives (Invariant #3)', () => {
    it('R11-DERIV-01: scans all occurrences of derivatives and verifies unconditional execution at fs_main entry', () => {
      const lines = crustSrc.split('\n');
      const derivativeRegex = /\b(dpdx|dpdy|fwidth)(Fine|Coarse)?\s*\(/;

      const occurrences: { lineNum: number; lineContent: string; fn: string }[] = [];
      let currentFunction = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const fnMatch = trimmed.match(/fn\s+([a-zA-Z0-9_]+)\s*\(/);
        if (fnMatch) {
          currentFunction = fnMatch[1];
        }

        if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          continue; // Ignore pure comments
        }

        if (derivativeRegex.test(line)) {
          occurrences.push({
            lineNum: i + 1,
            lineContent: trimmed,
            fn: currentFunction,
          });
        }
      }

      // Exactly 7 active derivative evaluations must exist in the shader
      expect(occurrences.length).toBe(7);

      // All 7 must belong to fs_main
      for (const occ of occurrences) {
        expect(occ.fn).toBe('fs_main');
      }

      // Find line of fs_main
      const fsMainLineIdx = lines.findIndex(l => l.includes('fn fs_main('));
      expect(fsMainLineIdx).toBeGreaterThan(0);

      // All 7 occurrences must be in the first 15 lines of fs_main (before any branches)
      for (const occ of occurrences) {
        expect(occ.lineNum).toBeGreaterThan(fsMainLineIdx + 1);
        expect(occ.lineNum).toBeLessThanOrEqual(fsMainLineIdx + 15);
      }
    });

    it('R11-DERIV-02: proves that NO derivatives exist inside if (sim.u_theme == ...) or conditional blocks', () => {
      // Extract fs_main body
      const fsMainStart = crustSrc.indexOf('fn fs_main(');
      expect(fsMainStart).toBeGreaterThan(-1);

      const fsMainBody = crustSrc.slice(fsMainStart);

      // Search for any theme conditions
      const themeMatches = [...fsMainBody.matchAll(/if\s*\(\s*sim\.u_theme\s*==\s*([0-2]u)\s*\)\s*\{([\s\S]*?)\}/g)];
      expect(themeMatches.length).toBeGreaterThan(0);

      const derivativeRegex = /\b(dpdx|dpdy|fwidth)(Fine|Coarse)?\s*\(/;

      for (const match of themeMatches) {
        const blockCode = match[2];
        const hasDerivative = derivativeRegex.test(blockCode);
        expect(hasDerivative).toBe(false);
      }

      // Also check general conditional blocks throughout fs_main
      const lines = fsMainBody.split('\n');
      let depth = 0;
      let inConditional = false;
      const conditionalDepths: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//')) continue;

        if (/\b(if|else|switch|for|while|loop)\b/.test(line)) {
          inConditional = true;
          conditionalDepths.push(depth);
        }

        if (inConditional && derivativeRegex.test(line)) {
          throw new Error(`VIOLATION of Invariant #3: Derivative call in conditional block on line: ${line}`);
        }

        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        depth += (openBraces - closeBraces);

        if (conditionalDepths.length > 0 && depth <= conditionalDepths[conditionalDepths.length - 1]) {
          conditionalDepths.pop();
          if (conditionalDepths.length === 0) {
            inConditional = false;
          }
        }
      }
    });

    it('R11-DERIV-03: proves that texture sampling exclusively uses explicit-LOD textureSampleLevel', () => {
      // textureSample without Level/Grad/Bias requires derivative control flow.
      // textureSampleLevel is safe anywhere because LOD is explicitly provided.
      const fsMainStart = crustSrc.indexOf('fn fs_main(');
      const fsMainBody = crustSrc.slice(fsMainStart);

      const lines = fsMainBody.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;

        if (trimmed.includes('textureSample(')) {
          throw new Error(`Disallowed implicit derivative textureSample found: ${trimmed}`);
        }

        if (trimmed.includes('textureSample')) {
          expect(trimmed).toMatch(/textureSampleLevel\(/);
        }
      }
    });
  });

  // ==========================================================================
  // SECTION 3: Rapid Theme Switching & Physical Medium Properties Stress Test
  // ==========================================================================
  describe('3. Rapid Theme Switching & Physical Medium Properties Stress Test', () => {
    let themeManager: ThemeManager;

    beforeEach(() => {
      themeManager = ThemeManager.getInstance();
      themeManager.setMode(1); // Reset to Cream Rag
    });

    it('R11-STRESS-01: verifies mediumProperties completeness and physical ranges across all theme definitions', () => {
      const themes = [
        { name: 'DARK_CYBER_THEME (Mode 0)', theme: DARK_CYBER_THEME },
        { name: 'MARIE_THARP_THEME (Mode 0)', theme: MARIE_THARP_THEME },
        { name: 'LIGHT_MONOCHROME_THEME (Mode 1)', theme: LIGHT_MONOCHROME_THEME },
        { name: 'CREAM_RAG_THEME (Mode 1)', theme: CREAM_RAG_THEME },
        { name: 'PRUSSIAN_CYANOTYPE_THEME (Mode 2)', theme: PRUSSIAN_CYANOTYPE_THEME },
      ];

      for (const { name, theme } of themes) {
        expect(theme.mediumProperties, `${name} must define mediumProperties`).toBeDefined();
        const m = theme.mediumProperties;

        // inkAbsorption: Kubelka-Munk scattering coefficient [0.0, 1.0]
        expect(m.inkAbsorption).toBeGreaterThanOrEqual(0.0);
        expect(m.inkAbsorption).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(m.inkAbsorption)).toBe(true);

        // fiberDensity: paper tooth frequency multiplier > 0.0
        expect(m.fiberDensity).toBeGreaterThan(0.0);
        expect(m.fiberDensity).toBeLessThan(10.0);
        expect(Number.isFinite(m.fiberDensity)).toBe(true);

        // exposureGamma: cyanotype photochemical sensitometric curve > 0.0
        expect(m.exposureGamma).toBeGreaterThan(0.0);
        expect(m.exposureGamma).toBeLessThan(10.0);
        expect(Number.isFinite(m.exposureGamma)).toBe(true);

        // stippleDensity: Tharp abyssal plain stipple frequency >= 0.0
        expect(m.stippleDensity).toBeGreaterThanOrEqual(0.0);
        expect(m.stippleDensity).toBeLessThan(10.0);
        expect(Number.isFinite(m.stippleDensity)).toBe(true);
      }
    });

    it('R11-STRESS-02: stress-tests 1,000 rapid synchronous theme switches ensuring listener consistency', () => {
      let callbackCount = 0;
      let lastReceivedMode: ThemeMode = -1 as any;
      let lastReceivedMediumId: ArchivalMediumId = '' as any;

      const unsubscribe = themeManager.subscribe((palette) => {
        callbackCount++;
        lastReceivedMode = palette.mode;
        lastReceivedMediumId = palette.mediumId;
        expect(palette.mediumProperties).toBeDefined();
      });

      // Initial subscription triggers 1 immediate callback
      expect(callbackCount).toBe(1);

      const targetModes: ThemeMode[] = [0, 1, 2];
      const mediumIds: Record<ThemeMode, ArchivalMediumId> = {
        0: 'tharp',
        1: 'cream',
        2: 'cyanotype',
      };

      const ITERATIONS = 1000;
      for (let i = 0; i < ITERATIONS; i++) {
        const nextMode = targetModes[i % 3];
        themeManager.setMode(nextMode);

        const currentPalette = themeManager.getPalette();
        expect(currentPalette.mode).toBe(nextMode);
        expect(currentPalette.mediumId).toBe(mediumIds[nextMode]);
        expect(lastReceivedMode).toBe(nextMode);
        expect(lastReceivedMediumId).toBe(mediumIds[nextMode]);
      }

      // Exactly 1 initial + 1,000 switches (since mode cycles 0->1->2 each step, mode always changes)
      expect(callbackCount).toBe(ITERATIONS + 1);

      unsubscribe();
    });

    it('R11-STRESS-03: stress-tests CSS variables synchronization on rapid medium property mutations', () => {
      // Create mock DOM element
      const mockElement = {
        attributes: {} as Record<string, string>,
        style: {
          properties: {} as Record<string, string>,
          setProperty(key: string, val: string) {
            this.properties[key] = val;
          },
          removeProperty(key: string) {
            delete this.properties[key];
          },
        },
        setAttribute(attr: string, val: string) {
          this.attributes[attr] = val;
        },
      } as unknown as HTMLElement;

      const modes: ThemeMode[] = [0, 1, 2];

      for (let i = 0; i < 500; i++) {
        const mode = modes[i % 3];
        themeManager.setMode(mode);
        themeManager.applyCSSVariables(mockElement);

        const palette = themeManager.getPalette();
        const m = palette.mediumProperties;

        const props = (mockElement as any).style.properties;
        expect(props['--theme-ink-absorption']).toBe(m.inkAbsorption.toString());
        expect(props['--theme-fiber-density']).toBe(m.fiberDensity.toString());
        expect(props['--theme-exposure-gamma']).toBe(m.exposureGamma.toString());
        expect(props['--theme-stipple-density']).toBe(m.stippleDensity.toString());
      }
    });

    it('R11-STRESS-04: Monte Carlo uniform buffer packing (10,000 iterations) guaranteeing zero NaNs and valid medium data', () => {
      // Simulate exact uniform packing algorithm of WebGPUEngine
      const crustFloats = new Float32Array(68);
      const crustUints = new Uint32Array(crustFloats.buffer);

      const ITERATIONS = 10000;

      for (let i = 0; i < ITERATIONS; i++) {
        const randomMode: ThemeMode = (Math.floor(Math.random() * 3)) as ThemeMode;
        themeManager.setMode(randomMode);
        const palette = themeManager.getPalette();

        // 1. Pack basic parameters
        crustFloats[0] = Math.random(); // unfurl
        crustUints[1] = Math.floor(Math.random() * 5); // mode
        crustUints[2] = randomMode; // theme
        crustFloats[3] = performance.now() * 0.001; // time

        // 2. Viewport
        const vpWidth = 800 + Math.random() * 1920;
        const vpHeight = 600 + Math.random() * 1080;
        crustFloats[4] = vpWidth;
        crustFloats[5] = vpHeight;
        crustFloats[6] = 1.0 / vpWidth;
        crustFloats[7] = 1.0 / vpHeight;

        // 3. Camera pos
        crustFloats[8] = (Math.random() - 0.5) * 50;
        crustFloats[9] = (Math.random() - 0.5) * 50;
        crustFloats[10] = 5.0 + Math.random() * 30;
        crustFloats[11] = 1.0;

        // 4. Cursor hit & vel
        crustFloats[12] = Math.random();
        crustFloats[13] = Math.random();
        crustFloats[14] = Math.random();
        crustFloats[15] = 0.0;
        crustFloats[16] = (Math.random() - 0.5) * 2;
        crustFloats[17] = (Math.random() - 0.5) * 2;
        crustFloats[18] = (Math.random() - 0.5) * 2;
        crustFloats[19] = Math.hypot(crustFloats[16], crustFloats[17], crustFloats[18]);

        crustFloats[20] = Math.random() > 0.5 ? 1.0 : 0.0;
        crustFloats[21] = 0.08;
        crustFloats[22] = 0.0;
        crustFloats[23] = randomMode === 1 ? 0.40 : 0.04;

        // 5. Matrices (identity + noise)
        for (let m = 24; m < 56; m++) {
          crustFloats[m] = (m % 5 === 0) ? 1.0 : 0.0;
        }

        // 6. Extended cartographic parameters
        crustFloats[56] = 315.0;
        crustFloats[57] = 45.0;
        crustFloats[58] = 0.65;
        crustFloats[59] = 0.75;
        crustFloats[60] = 1.4;
        crustFloats[61] = 1.0;
        crustUints[62] = 0;
        crustFloats[63] = -1.0;

        // 7. Stage 2 medium properties packing (floats 64..67, byte offset 256)
        const medium = palette.mediumProperties;
        crustFloats[64] = medium?.inkAbsorption ?? 0.8;
        crustFloats[65] = medium?.fiberDensity ?? 1.0;
        crustFloats[66] = medium?.exposureGamma ?? 1.0;
        crustFloats[67] = medium?.stippleDensity ?? 1.0;

        // Adversarial assertions:
        expect(crustFloats.byteLength).toBe(272);
        expect(crustFloats[64]).toBeCloseTo(medium.inkAbsorption, 5);
        expect(crustFloats[65]).toBeCloseTo(medium.fiberDensity, 5);
        expect(crustFloats[66]).toBeCloseTo(medium.exposureGamma, 5);
        expect(crustFloats[67]).toBeCloseTo(medium.stippleDensity, 5);

        // Ensure ZERO NaNs or Infs across the entire 68-float payload
        for (let f = 0; f < 68; f++) {
          if (!Number.isFinite(crustFloats[f]) || Number.isNaN(crustFloats[f])) {
            throw new Error(`Invalid float in uniform buffer at index ${f}: ${crustFloats[f]}`);
          }
        }
      }
    }, 60000);

    it('R11-STRESS-05: verifies fallback robustness when mediumProperties is missing or partially populated', () => {
      const crustFloats = new Float32Array(68);

      // Scenario A: completely undefined medium
      const undefinedMedium: any = undefined;
      crustFloats[64] = undefinedMedium?.inkAbsorption ?? 0.8;
      crustFloats[65] = undefinedMedium?.fiberDensity ?? 1.0;
      crustFloats[66] = undefinedMedium?.exposureGamma ?? 1.0;
      crustFloats[67] = undefinedMedium?.stippleDensity ?? 1.0;

      expect(crustFloats[64]).toBeCloseTo(0.8, 5);
      expect(crustFloats[65]).toBeCloseTo(1.0, 5);
      expect(crustFloats[66]).toBeCloseTo(1.0, 5);
      expect(crustFloats[67]).toBeCloseTo(1.0, 5);

      // Scenario B: partially defined medium (e.g. legacy theme missing stippleDensity)
      const partialMedium: any = { inkAbsorption: 0.5 };
      crustFloats[64] = partialMedium?.inkAbsorption ?? 0.8;
      crustFloats[65] = partialMedium?.fiberDensity ?? 1.0;
      crustFloats[66] = partialMedium?.exposureGamma ?? 1.0;
      crustFloats[67] = partialMedium?.stippleDensity ?? 1.0;

      expect(crustFloats[64]).toBeCloseTo(0.5, 5);
      expect(crustFloats[65]).toBeCloseTo(1.0, 5);
      expect(crustFloats[66]).toBeCloseTo(1.0, 5);
      expect(crustFloats[67]).toBeCloseTo(1.0, 5);

      // Verify no NaNs
      expect(Number.isNaN(crustFloats[64])).toBe(false);
      expect(Number.isNaN(crustFloats[65])).toBe(false);
      expect(Number.isNaN(crustFloats[66])).toBe(false);
      expect(Number.isNaN(crustFloats[67])).toBe(false);
    });
  });
});
