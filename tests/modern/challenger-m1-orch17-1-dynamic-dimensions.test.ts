// ============================================================================
// File: tests/modern/challenger-m1-orch17-1-dynamic-dimensions.test.ts
// Challenger: challenger_m1_orch17_1 (teamwork_preview_challenger)
// Milestone: Milestone 1 Verification (Dynamic Dimensions & Preflight Cloud Shadows)
// Invariants: §3 (WGSL Uniform Control Flow), §18 (Spherical Metric),
//             §20 (16-Byte WGSL Alignment), §46 (Anti-Cheating Test Import Integrity),
//             §48 (Dynamic Dimensions & Elimination of Hardcoded Literals)
// Description: Adversarial empirical stress suite verifying:
//              1. DEM Guard regex behavior (false positives, blind spots, bypasses)
//              2. Dynamic DEM texture dimension ingestion (2K, 4K, 8K, 16K U16 & U8)
//              3. SimUniforms WGSL struct alignment & Dawn WebGPU buffer size rules
//              4. Anti-cheating audit of worker test suites
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import crustHydrosphereWGSL from '../../src/webgpu/shaders/crust_hydrosphere.wgsl?raw';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const engineSourcePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
const engineSource = fs.readFileSync(engineSourcePath, 'utf-8');

describe('Adversarial Challenger Suite: Invariant §48 Dynamic Dimensions & Struct Alignment Audit', () => {

  // ==========================================================================
  // Section 1: DEM Guard Regex Analysis & Blind-Spot Probing
  // ==========================================================================
  describe('1. DEM Guard Regex Rigor & Blind-Spot Analysis', () => {
    // The exact regex used by the runner hook and scripts/lint-wgsl-control-flow.mjs:
    const isDemGuardHit = (line: string): boolean => {
      return /8192|4096/.test(line) && !/byteLength|is8k|scale/i.test(line);
    };

    it('PROBE-GUARD-01: flags innocent comments containing 8192/4096 as false positives', () => {
      const commentLine1 = '// Production ETOPO 2022 dataset has 8192x4096 resolution';
      const commentLine2 = '/* WebGPU texture dimension: 8192 */';
      expect(isDemGuardHit(commentLine1)).toBe(true);
      expect(isDemGuardHit(commentLine2)).toBe(true);
    });

    it('PROBE-GUARD-02: blind to resolution constants when "scale" is present in line (false negative)', () => {
      const bypassedLine1 = 'const width = 8192; // scale factor for DEM';
      const bypassedLine2 = 'const height = 4096; // scaled height';
      expect(isDemGuardHit(bypassedLine1)).toBe(false);
      expect(isDemGuardHit(bypassedLine2)).toBe(false);
    });

    it('PROBE-GUARD-03: blind to arithmetic avoidance patterns (1024 * 8, 1024 * 4)', () => {
      const avoidedLine1 = 'public static readonly DEFAULT_DEM_WIDTH = 1024 * 8;';
      const avoidedLine2 = 'public static readonly DEFAULT_DEM_HEIGHT = 1024 * 4;';
      expect(isDemGuardHit(avoidedLine1)).toBe(false);
      expect(isDemGuardHit(avoidedLine2)).toBe(false);
      // Both evaluate to 8192 and 4096 at runtime:
      expect(1024 * 8).toBe(8192);
      expect(1024 * 4).toBe(4096);
    });

    it('PROBE-GUARD-04: blind to non-8K resolutions (2048, 1024, 16384) hardcoded anywhere', () => {
      const line2k = 'const width = 2048; const height = 1024;';
      const line16k = 'const width = 16384; const height = 16384 / 2;';
      expect(isDemGuardHit(line2k)).toBe(false);
      expect(isDemGuardHit(line16k)).toBe(false);
    });
  });

  // ==========================================================================
  // Section 2: Dynamic Texture Dimension Ingestion in WebGPUEngine
  // ==========================================================================
  describe('2. Dynamic DEM Texture Dimension Ingestion in WebGPUEngine', () => {

    it('PROBE-DYN-01: correctly derives dimensions for 2048x1024 U16 texture (16 MB)', () => {
      // 2048 * 1024 * 4 channels * 2 bytes = 16,777,216 bytes
      const buffer = new ArrayBuffer(16777216);
      const byteLength = buffer.byteLength;
      const isU16 = byteLength === 268435456 || byteLength === 16777216;
      expect(isU16).toBe(true);

      const totalPixels = Math.floor(byteLength / (isU16 ? 8 : 4));
      const calculatedH = Math.max(1, Math.round(Math.sqrt(totalPixels / 2)));
      const calculatedW = calculatedH * 2;

      expect(calculatedW).toBe(2048);
      expect(calculatedH).toBe(1024);
    });

    it('PROBE-DYN-02: correctly derives dimensions for 8192x4096 U16 texture (256 MB)', () => {
      // 8192 * 4096 * 4 channels * 2 bytes = 268,435,456 bytes
      const buffer = new ArrayBuffer(268435456);
      const byteLength = buffer.byteLength;
      const isU16 = byteLength === 268435456 || byteLength === 16777216;
      expect(isU16).toBe(true);

      const totalPixels = Math.floor(byteLength / (isU16 ? 8 : 4));
      const calculatedH = Math.max(1, Math.round(Math.sqrt(totalPixels / 2)));
      const calculatedW = calculatedH * 2;

      expect(calculatedW).toBe(8192);
      expect(calculatedH).toBe(4096);
    });

    it('PROBE-DYN-03 [BUG IDENTIFICATION]: FAILS on 4096x2048 U16 texture due to hardcoded line 1831', () => {
      // 4096 * 2048 * 4 channels * 2 bytes = 67,108,864 bytes
      const buffer4k = new ArrayBuffer(67108864);
      const byteLength = buffer4k.byteLength;

      // LINE 1831 in WebGPUEngine.ts:
      // const isU16 = byteLength === 268435456 || byteLength === 16777216;
      const currentCodeIsU16 = byteLength === 268435456 || byteLength === 16777216;

      // Because 67108864 is neither 268435456 nor 16777216, current code sets isU16 to false!
      expect(currentCodeIsU16).toBe(false);

      // What WebGPUEngine.ts calculates when isU16 is false:
      const totalPixelsBuggy = Math.floor(byteLength / (currentCodeIsU16 ? 8 : 4)); // Divides by 4 instead of 8!
      const calculatedHBuggy = Math.max(1, Math.round(Math.sqrt(totalPixelsBuggy / 2)));
      const calculatedWBuggy = calculatedHBuggy * 2;

      // Demonstrating the bug: instead of 4096x2048, it calculates 5792x2896!
      expect(calculatedWBuggy).toBe(5792);
      expect(calculatedHBuggy).toBe(2896);
      expect(calculatedWBuggy).not.toBe(4096);
      expect(calculatedHBuggy).not.toBe(2048);

      // True dynamic calculation should check if byteLength is divisible by 8 and forms a 2:1 ratio:
      const trueTotalPixelsU16 = Math.floor(byteLength / 8);
      const trueH = Math.round(Math.sqrt(trueTotalPixelsU16 / 2));
      const trueW = trueH * 2;
      expect(trueW).toBe(4096);
      expect(trueH).toBe(2048);
    });

    it('PROBE-DYN-04 [BUG IDENTIFICATION]: FAILS on 16384x8192 U16 texture due to hardcoded line 1831', () => {
      // 16384 * 8192 * 4 channels * 2 bytes = 1,073,741,824 bytes (1 GB)
      const byteLength16k: number = 1073741824;
      const currentCodeIsU16 = byteLength16k === 268435456 || byteLength16k === 16777216;
      expect(currentCodeIsU16).toBe(false);

      const totalPixelsBuggy = Math.floor(byteLength16k / (currentCodeIsU16 ? 8 : 4));
      const calculatedHBuggy = Math.max(1, Math.round(Math.sqrt(totalPixelsBuggy / 2)));
      const calculatedWBuggy = calculatedHBuggy * 2;

      // Instead of 16384x8192, it calculates 23170x11585!
      expect(calculatedWBuggy).toBe(23170);
      expect(calculatedHBuggy).toBe(11585);
      expect(calculatedWBuggy).not.toBe(16384);
      expect(calculatedHBuggy).not.toBe(8192);
    });

    it('PROBE-DYN-05: 8-bit RGBA8 textures correctly compute dimensions across 2K, 4K, 8K, 16K', () => {
      const resolutions = [
        { w: 2048, h: 1024, bytes: 2048 * 1024 * 4 },
        { w: 4096, h: 2048, bytes: 4096 * 2048 * 4 },
        { w: 8192, h: 4096, bytes: 8192 * 4096 * 4 },
        { w: 16384, h: 8192, bytes: 16384 * 8192 * 4 },
      ];

      for (const res of resolutions) {
        const isU16 = false;
        const totalPixels = Math.floor(res.bytes / 4);
        const calculatedH = Math.max(1, Math.round(Math.sqrt(totalPixels / 2)));
        const calculatedW = calculatedH * 2;
        expect(calculatedW).toBe(res.w);
        expect(calculatedH).toBe(res.h);
      }
    });

    it('PROBE-DYN-06: sampleCPUElevation behaves consistently when demWidth and demHeight are set', () => {
      const engine = new WebGPUEngine();
      expect(engine.demWidth).toBe(0);
      expect(engine.demHeight).toBe(0);

      // Verify sampleCPUElevation falls back cleanly to DEFAULT_DEM_WIDTH and DEFAULT_DEM_HEIGHT
      const result = engine.sampleCPUElevation(0.0, 0.0);
      expect(Number.isFinite(result.elevationMeters)).toBe(true);
      expect(Number.isFinite(result.gradEast)).toBe(true);
      expect(Number.isFinite(result.gradNorth)).toBe(true);
    });
  });

  // ==========================================================================
  // Section 3: SimUniforms WGSL Struct Alignment & Dawn WebGPU Rules
  // ==========================================================================
  describe('3. SimUniforms WGSL Struct Alignment & Dawn WebGPU Buffer Rules', () => {
    // W3C WGSL Type Alignment & Size Table (Section 14.3.1):
    // alignOf(f32) = 4, sizeOf(f32) = 4
    // alignOf(u32) = 4, sizeOf(u32) = 4
    // alignOf(vec2<f32>) = 8, sizeOf(vec2<f32>) = 8
    // alignOf(vec3<f32>) = 16, sizeOf(vec3<f32>) = 12  <-- CRITICAL
    // alignOf(vec4<f32>) = 16, sizeOf(vec4<f32>) = 16
    // alignOf(mat4x4<f32>) = 16, sizeOf(mat4x4<f32>) = 64

    function alignUp(offset: number, align: number): number {
      const rem = offset % align;
      return rem === 0 ? offset : offset + (align - rem);
    }

    interface StructMember {
      name: string;
      type: string;
      align: number;
      size: number;
    }

    const members: StructMember[] = [
      { name: 'u_unfurl',            type: 'f32',         align: 4,  size: 4 },
      { name: 'u_mode',              type: 'u32',         align: 4,  size: 4 },
      { name: 'u_theme',             type: 'u32',         align: 4,  size: 4 },
      { name: 'u_time',              type: 'f32',         align: 4,  size: 4 },
      { name: 'u_viewport',          type: 'vec4<f32>',   align: 16, size: 16 },
      { name: 'u_cameraPos',         type: 'vec4<f32>',   align: 16, size: 16 },
      { name: 'u_cursorHitPos',      type: 'vec4<f32>',   align: 16, size: 16 },
      { name: 'u_cursorVel',         type: 'vec4<f32>',   align: 16, size: 16 },
      { name: 'u_cursorActive',      type: 'f32',         align: 4,  size: 4 },
      { name: 'u_displacementScale', type: 'f32',         align: 4,  size: 4 },
      { name: 'u_seaLevel',          type: 'f32',         align: 4,  size: 4 },
      { name: 'u_roughness',         type: 'f32',         align: 4,  size: 4 },
      { name: 'u_viewMatrix',        type: 'mat4x4<f32>', align: 16, size: 64 },
      { name: 'u_projectionMatrix',  type: 'mat4x4<f32>', align: 16, size: 64 },
      { name: 'u_sunAzimuth',        type: 'f32',         align: 4,  size: 4 },
      { name: 'u_sunAltitude',       type: 'f32',         align: 4,  size: 4 },
      { name: 'u_ambientOcclusion',  type: 'f32',         align: 4,  size: 4 },
      { name: 'u_waterClarity',      type: 'f32',         align: 4,  size: 4 },
      { name: 'u_peakExponent',      type: 'f32',         align: 4,  size: 4 },
      { name: 'u_layerOpacity',      type: 'f32',         align: 4,  size: 4 },
      { name: 'u_renderStyle',       type: 'u32',         align: 4,  size: 4 },
      { name: 'u_isolatedStratum',   type: 'f32',         align: 4,  size: 4 },
      { name: 'u_mediumProperties',  type: 'vec4<f32>',   align: 16, size: 16 },
      { name: 'u_shadowIntensity',   type: 'f32',         align: 4,  size: 4 },
      { name: '_padShadow',          type: 'vec3<f32>',   align: 16, size: 12 }, // alignOf(vec3<f32>) = 16
    ];

    it('PROBE-ALIGN-01: proves that vec3<f32> at byte 276 forces implicit padding to byte 288 in standard WGSL', () => {
      let offset = 0;
      const layout: Array<{ name: string; offset: number; end: number }> = [];

      for (const m of members) {
        offset = alignUp(offset, m.align);
        layout.push({ name: m.name, offset, end: offset + m.size });
        offset += m.size;
      }

      const mediumProp = layout.find(l => l.name === 'u_mediumProperties')!;
      expect(mediumProp.offset).toBe(256);
      expect(mediumProp.end).toBe(272);

      const shadowInt = layout.find(l => l.name === 'u_shadowIntensity')!;
      expect(shadowInt.offset).toBe(272);
      expect(shadowInt.end).toBe(276);

      const padShadow = layout.find(l => l.name === '_padShadow')!;
      // Because vec3<f32> requires 16-byte alignment, alignUp(276, 16) is 288!
      expect(padShadow.offset).toBe(288);
      expect(padShadow.end).toBe(300);

      // Struct size rounded to struct alignment (16):
      const structSize = alignUp(offset, 16);
      expect(structSize).toBe(304);
    });

    it('PROBE-ALIGN-02 [SPECIFICATION MISMATCH]: crustUniformBuffer is 288 bytes but WGSL with vec3<f32> evaluates to 304 bytes', () => {
      // In WebGPUEngine.ts:
      // crustUniformBuffer size is 288
      // crustFloats is Float32Array(72) = 288 bytes
      // But in W3C WGSL spec, _padShadow: vec3<f32> requires 304 bytes!
      const allocatedBufferSize = 288;
      const standardWgslStructSize = 304;

      expect(allocatedBufferSize).toBeLessThan(standardWgslStructSize);
      // Discrepancy is exactly 16 bytes (4 floats)
      expect(standardWgslStructSize - allocatedBufferSize).toBe(16);
    });

    it('PROBE-ALIGN-03: demonstrates correct 288-byte alignment using 3 individual f32 padding floats or vec4', () => {
      // Alternative A: three individual f32 fields
      const membersWithF32Pad: StructMember[] = [
        ...members.slice(0, 24), // up to u_shadowIntensity
        { name: '_pad0', type: 'f32', align: 4, size: 4 },
        { name: '_pad1', type: 'f32', align: 4, size: 4 },
        { name: '_pad2', type: 'f32', align: 4, size: 4 },
      ];

      let offset = 0;
      for (const m of membersWithF32Pad) {
        offset = alignUp(offset, m.align);
        offset += m.size;
      }
      const totalA = alignUp(offset, 16);
      expect(totalA).toBe(288); // Exactly 288 bytes!

      // Alternative B: vec4<f32> shadowProperties
      const membersWithVec4: StructMember[] = [
        ...members.slice(0, 23), // up to u_mediumProperties
        { name: 'u_shadowProperties', type: 'vec4<f32>', align: 16, size: 16 },
      ];

      offset = 0;
      for (const m of membersWithVec4) {
        offset = alignUp(offset, m.align);
        offset += m.size;
      }
      const totalB = alignUp(offset, 16);
      expect(totalB).toBe(288); // Exactly 288 bytes!
    });
  });

  // ==========================================================================
  // Section 4: Anti-Cheating & Production Import Audit (Invariant §46)
  // ==========================================================================
  describe('4. Anti-Cheating & Test Import Integrity Audit (Invariant §46)', () => {
    const workerTestPath = path.join(projectRoot, 'tests/webgpu/r14-m1-preflight-cloud-shadows.test.ts');
    const workerTestSource = fs.existsSync(workerTestPath) ? fs.readFileSync(workerTestPath, 'utf-8') : '';

    it('PROBE-CHEAT-01: detects test-local reimplementation of computeCloudShadowOffsetTS', () => {
      expect(workerTestSource).toContain('function computeCloudShadowOffsetTS(');
      // The test defines its own reference math rather than importing from a production utility
    });

    it('PROBE-CHEAT-02: detects test-local reimplementation of calculateShadowFactor and smoothstep', () => {
      expect(workerTestSource).toContain('function smoothstep(');
      expect(workerTestSource).toContain('function calculateShadowFactor(');
    });

    it('PROBE-CHEAT-03: detects trivial tautological assertion in alignment test', () => {
      expect(workerTestSource).toContain('expect(72 * 4).toBe(288);');
      expect(workerTestSource).toContain('expect(288 % 16).toBe(0);');
    });
  });
});
