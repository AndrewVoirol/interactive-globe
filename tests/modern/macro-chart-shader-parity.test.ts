// ============================================================================
// File: tests/modern/macro-chart-shader-parity.test.ts
// Milestone 2 Gate: Macro Chart WGSL Extraction & CPU/GPU Parity Suite
// Reference: macro_chart_implementation_plan.md §Milestone 2, AGENTS.md Rule 4, 7, 21, 28
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { evaluateMacroChartCPU, invertMacroChart } from '../../src/core/math/volumetricMath';

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
    // Exact mirror of WGSL evaluateMacroChart in TypeScript using single-precision Float32Array
    function evaluateMacroChartWGSLSim(
      lonRad: number,
      latRad: number,
      h: number,
      alpha: number,
      radius: number
    ): { pos: [number, number, number]; normal: [number, number, number] } {
      const f32 = new Float32Array(32);
      const smoothstepSim = (e0: number, e1: number, x: number): number => {
        const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
        return Math.fround(t * t * (3.0 - 2.0 * t));
      };

      f32[0] = Math.fround(Math.max(0.0, Math.min(1.0, alpha)));
      const alphaClamped = f32[0];
      const alphaEased = Math.fround(alphaClamped * alphaClamped * (3.0 - 2.0 * alphaClamped));
      const tParallel = smoothstepSim(0.05, 0.85, alphaEased);
      const cosLat = Math.fround(Math.cos(latRad));
      const sinLat = Math.fround(Math.sin(latRad));
      const parallelWidth = Math.fround(cosLat * (1.0 - tParallel) + tParallel);
      const rPar = Math.fround(radius * parallelWidth);
      const s = Math.fround(Math.max(0.0, 1.0 - alphaEased));
      const uAngle = Math.fround(s * lonRad);

      let curX: number;
      let curZ: number;
      if (Math.abs(uAngle) > 0.02) {
        const sDiv = Math.fround(Math.max(0.0001, s));
        curX = Math.fround(rPar * (Math.sin(uAngle) / sDiv));
        curZ = Math.fround(rPar * ((Math.cos(uAngle) - 1.0) / sDiv + s));
      } else {
        const u2 = Math.fround(uAngle * uAngle);
        curX = Math.fround(rPar * lonRad * (1.0 - u2 / 6.0));
        curZ = Math.fround(rPar * s * (1.0 - lonRad * lonRad * 0.5 * (1.0 - u2 / 12.0)));
      }

      const tStraighten = smoothstepSim(0.20, 0.95, alphaEased);
      const curY = Math.fround((1.0 - tStraighten) * radius * sinLat + tStraighten * radius * latRad);

      const dyDPhi = Math.fround(radius * (cosLat * (1.0 - tStraighten) + tStraighten));
      const negDrDPhi = Math.fround(radius * sinLat * (1.0 - tParallel));
      let bracket: number;
      if (Math.abs(uAngle) > 0.02) {
        const sDiv = Math.fround(Math.max(0.0001, s));
        bracket = Math.fround((1.0 - Math.cos(uAngle)) / sDiv + s * Math.cos(uAngle));
      } else {
        const u2 = Math.fround(uAngle * uAngle);
        bracket = Math.fround(s * (lonRad * lonRad * (0.5 - u2 / 24.0) + (1.0 - u2 * 0.5)));
      }

      const rawNx = Math.fround(dyDPhi * Math.sin(uAngle));
      const rawNy = Math.fround(negDrDPhi * bracket);
      const rawNz = Math.fround(dyDPhi * Math.cos(uAngle));
      const rawLen = Math.fround(Math.hypot(rawNx, rawNy, rawNz));
      const norm: [number, number, number] = rawLen > 0.00001
        ? [Math.fround(rawNx / rawLen), Math.fround(rawNy / rawLen), Math.fround(rawNz / rawLen)]
        : [0.0, 0.0, 1.0];

      return {
        pos: [Math.fround(curX + norm[0] * h), Math.fround(curY + norm[1] * h), Math.fround(curZ + norm[2] * h)],
        normal: norm,
      };
    }

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
            const wgsl = evaluateMacroChartWGSLSim(lon, lat, h, alpha, RADIUS);

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
