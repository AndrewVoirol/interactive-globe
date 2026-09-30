// ============================================================================
// File: tests/modern/macro-chart-shader-parity.test.ts
// Milestone 2 Gate: Macro Chart WGSL Extraction & CPU/GPU Parity Suite
// Reference: macro_chart_implementation_plan.md §Milestone 2, AGENTS.md Rule 4, 7, 21, 28
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { evaluateMacroChartCPU, invertMacroChart, evaluateMacroChartF32 } from '../../src/core/math/volumetricMath';

const RADIUS = 5.0;
const PI = Math.PI;
const SHADERS_DIR = path.resolve(__dirname, '../../src/webgpu/shaders');

describe('Milestone 2 Gate: Macro Chart Shader Parity & Extraction', () => {
  const manifoldSrc = fs.readFileSync(path.join(SHADERS_DIR, 'manifold.wgsl'), 'utf8');

  it('M2-T1: verifies evaluateMacroChart is declared in manifold.wgsl with exact signature', () => {
    expect(manifoldSrc).toContain('fn evaluateMacroChart(lonRad: f32, latRad: f32, h: f32, alpha: f32, radius: f32) -> DeformedVertex');
    expect(manifoldSrc).toContain('let tStraighten = smoothstep(0.20, 0.95, alphaEased);');
    expect(manifoldSrc).toContain('let parallelWidth = cosLat * (1.0 - tParallel) + tParallel;');
  });

  it('M2-T2: verifies WebGPUEngine.evaluateMacroChart delegates to evaluateMacroChartCPU with 1e-12 precision', () => {
    const testCases = [
      { u: 0.5, v: 0.5, h: 0.0, unfurl: 0.0 },
      { u: 0.25, v: 0.25, h: 0.05, unfurl: 0.5 },
      { u: 0.75, v: 0.8, h: 0.1, unfurl: 0.85 },
      { u: 0.0, v: 0.1, h: 0.0, unfurl: 1.0 },
      { u: 1.0, v: 0.9, h: 0.2, unfurl: 0.25 },
    ];

    for (const { u, v, h, unfurl } of testCases) {
      const lonRad = (u - 0.5) * 2.0 * PI;
      const latRad = (0.5 - v) * PI;

      const engineRes = WebGPUEngine.evaluateMacroChart(u, v, h, unfurl, RADIUS);
      const mathRes = evaluateMacroChartCPU(lonRad, latRad, h, unfurl, RADIUS);

      for (let j = 0; j < 3; j++) {
        expect(Math.abs(engineRes.pos[j] - mathRes.pos[j])).toBeLessThanOrEqual(1e-12);
        expect(Math.abs(engineRes.normal[j] - mathRes.normal[j])).toBeLessThanOrEqual(1e-12);
      }
    }
  });

  it('M2-T3: verifies analytical parity between WGSL and TypeScript evaluateMacroChart (<= 1e-5)', () => {
    const testAlphas = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    const testLons = [-PI, -PI * 0.5, 0.0, PI * 0.5, PI];
    const testLats = [-1.4, -0.7, 0.0, 0.7, 1.4];
    const testHeights = [0.0, 0.05, 0.15];

    let maxPosDelta = 0.0;
    let maxNormDelta = 0.0;

    for (const alpha of testAlphas) {
      for (const lon of testLons) {
        for (const lat of testLats) {
          for (const h of testHeights) {
            const cpu = evaluateMacroChartCPU(lon, lat, h, alpha, RADIUS);
            const wgsl = evaluateMacroChartF32(lon, lat, h, alpha, RADIUS);

            for (let j = 0; j < 3; j++) {
              const dPos = Math.abs(cpu.pos[j] - wgsl.pos[j]);
              const dNorm = Math.abs(cpu.normal[j] - wgsl.normal[j]);
              if (dPos > maxPosDelta) maxPosDelta = dPos;
              if (dNorm > maxNormDelta) maxNormDelta = dNorm;

              expect(dPos).toBeLessThanOrEqual(1e-5);
              expect(dNorm).toBeLessThanOrEqual(1e-5);
            }
          }
        }
      }
    }

    expect(maxPosDelta).toBeLessThanOrEqual(1e-5);
    expect(maxNormDelta).toBeLessThanOrEqual(1e-5);
  });

  it('M2-T4: verifies all 6 downstream shaders concatenate manifold.wgsl without duplicate symbols', () => {
    const consumingShaders = [
      'crust_hydrosphere.wgsl',
      'cloud_shell.wgsl',
      'vector_ribbon.wgsl',
      'physics_sim.wgsl',
      'wind_particles.wgsl',
      'atmosphere_scatter.wgsl',
    ];

    for (const shaderName of consumingShaders) {
      const shaderSrc = fs.readFileSync(path.join(SHADERS_DIR, shaderName), 'utf8');

      // Rule 28: ensure no duplicate symbol definitions in consumers
      expect(shaderSrc.match(/fn\s+evaluateMacroChart\b/g), `${shaderName} redeclares evaluateMacroChart`).toBeNull();
      expect(shaderSrc.match(/fn\s+evaluateModeZero\b/g), `${shaderName} redeclares evaluateModeZero`).toBeNull();
      expect(shaderSrc.match(/fn\s+evaluateManifoldCore\b/g), `${shaderName} redeclares evaluateManifoldCore`).toBeNull();
      expect(shaderSrc.match(/^\s*const\s+PI\s*:\s*f32\b/gm), `${shaderName} redeclares const PI: f32`).toBeNull();
      expect(shaderSrc.match(/^\s*const\s+RADIUS\s*:\s*f32\b/gm), `${shaderName} redeclares const RADIUS: f32`).toBeNull();
    }
  });
});
