// ============================================================================
// File: tests/modern/challenger-p3-physics-manifold-parity.test.ts
// Challenger: teamwork_preview_challenger_1 (Iteration 2 Mathematical Stress Challenger)
// Mission: Mathematical stress verification of:
//   1. CPU computeCurlNoise parity with WGSL (Delta = 0.000000)
//   2. Alignment between WebGPUEngine.evaluateManifoldPosition and physics_sim.wgsl (Delta <= 0.05)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { evaluateManifoldCore } from './challenger-phase2-3-manifold-stress.test';

const PI = Math.PI;
const RADIUS = 5.0;

// Analytical ground-truth WGSL computeCurlNoise simulator in double precision
function evaluateWgslCurlNoise(p: [number, number, number], time: number): [number, number, number] {
  const t = time * 0.75;

  // WGSL:
  // let rot = mat3x3<f32>(
  //     vec3<f32>(0.00,  0.80,  0.60),
  //     vec3<f32>(-0.80, 0.36, -0.48),
  //     vec3<f32>(-0.60, -0.48, 0.64)
  // );
  // let rotT = transpose(rot);
  // Column vectors: col0=(0, 0.8, 0.6), col1=(-0.8, 0.36, -0.48), col2=(-0.6, -0.48, 0.64)
  // rot * v = v.x * col0 + v.y * col1 + v.z * col2:
  const rotMul = (v: [number, number, number]): [number, number, number] => [
    -0.80 * v[1] - 0.60 * v[2],
    0.80 * v[0] + 0.36 * v[1] - 0.48 * v[2],
    0.60 * v[0] - 0.48 * v[1] + 0.64 * v[2],
  ];

  // rotT * w = w.x * (0, -0.8, -0.6) + w.y * (0.8, 0.36, -0.48) + w.z * (0.6, -0.48, 0.64)
  // rotT * w:
  const rotTMul = (w: [number, number, number]): [number, number, number] => [
    0.80 * w[1] + 0.60 * w[2],
    -0.80 * w[0] + 0.36 * w[1] - 0.48 * w[2],
    -0.60 * w[0] - 0.48 * w[1] + 0.64 * w[2],
  ];

  const q1 = rotMul([p[0] * 0.45, p[1] * 0.45, p[2] * 0.45]);
  const q2 = rotMul(rotMul([p[0] * 0.95, p[1] * 0.95, p[2] * 0.95]));

  const ux = -0.55 * Math.cos(0.55 * q1[1] + t * 0.7) - 0.45 * Math.cos(0.95 * q1[2] - t * 0.5);
  const uy = -0.55 * Math.cos(0.55 * q1[2] + t * 0.9) - 0.45 * Math.cos(0.95 * q1[0] - t * 0.6);
  const uz = -0.55 * Math.cos(0.55 * q1[0] + t * 0.8) - 0.45 * Math.cos(0.95 * q1[1] - t * 0.4);

  const u2x = 0.25 * Math.sin(1.5 * q2[1] - t * 1.2);
  const u2y = 0.25 * Math.sin(1.5 * q2[2] - t * 1.1);
  const u2z = 0.25 * Math.sin(1.5 * q2[0] - t * 1.3);

  const out1 = rotTMul([ux, uy, uz]);
  const out2 = rotTMul(rotTMul([u2x, u2y, u2z]));

  return [
    out1[0] + out2[0],
    out1[1] + out2[1],
    out1[2] + out2[2],
  ];
}

// // Exact physics_sim.wgsl particle position evaluator (calls unified evaluateManifoldCore)
function simulatePhysicsParticle(
  pos3D: [number, number, number],
  pos2D: [number, number, number],
  mode: number,
  unfurl: number,
  simTime = 0.0
): [number, number, number] {
  return evaluateManifoldCore(pos3D, [pos2D[0], pos2D[1]], unfurl, mode, simTime).pos;
}

describe('Mathematical Stress Challenger: Physics Sim vs Manifold Parity', () => {
  describe('Mission 3: CPU computeCurlNoise Parity with WGSL (Delta = 0.000000)', () => {
    it('PARITY-01: verifies exact analytical match between WebGPUEngine.computeCurlNoise and WGSL computeCurlNoise across 5,000 spatial samples', () => {
      let maxDiff = 0.0;
      let seed = 42;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      for (let i = 0; i < 5000; i++) {
        const p: [number, number, number] = [
          (rand() - 0.5) * 20.0,
          (rand() - 0.5) * 20.0,
          (rand() - 0.5) * 20.0,
        ];
        const time = rand() * 100.0;

        const cpuVal = (WebGPUEngine as any).computeCurlNoise(p, time);
        const wgslVal = evaluateWgslCurlNoise(p, time);

        const diff = Math.hypot(
          cpuVal[0] - wgslVal[0],
          cpuVal[1] - wgslVal[1],
          cpuVal[2] - wgslVal[2]
        );

        if (diff > maxDiff) maxDiff = diff;
      }

      console.log(`[PARITY-01] Max difference between WebGPUEngine CPU and WGSL computeCurlNoise: ${maxDiff}`);
      expect(maxDiff).toBe(0.0);
    });

    it('PARITY-02: verifies WGSL shader source in manifold.wgsl has identical coefficients to WebGPUEngine.ts', () => {
      const manifoldPath = path.resolve('src/webgpu/shaders/manifold.wgsl');
      const enginePath = path.resolve('src/webgpu/WebGPUEngine.ts');

      const manifoldSrc = fs.readFileSync(manifoldPath, 'utf8');
      const engineSrc = fs.readFileSync(enginePath, 'utf8');

      // Key rotational coefficients
      expect(manifoldSrc).toContain('vec3<f32>(0.00,  0.80,  0.60)');
      expect(manifoldSrc).toContain('vec3<f32>(-0.80, 0.36, -0.48)');
      expect(manifoldSrc).toContain('vec3<f32>(-0.60, -0.48, 0.64)');

      expect(engineSrc).toContain('-0.80 * v[1] - 0.60 * v[2]');
      expect(engineSrc).toContain('0.80 * v[0] + 0.36 * v[1] - 0.48 * v[2]');
      expect(engineSrc).toContain('0.60 * v[0] - 0.48 * v[1] + 0.64 * v[2]');

      expect(engineSrc).toContain('0.80 * w[1] + 0.60 * w[2]');
      expect(engineSrc).toContain('-0.80 * w[0] + 0.36 * w[1] - 0.48 * w[2]');
      expect(engineSrc).toContain('-0.60 * w[0] - 0.48 * w[1] + 0.64 * w[2]');
    });
  });

  describe('Mission 2: Alignment between WebGPUEngine.evaluateManifoldPosition and physics_sim.wgsl (Delta <= 0.05)', () => {
    it('PARITY-03: verifies particle simulation positions match manifold evaluation within Delta <= 0.05 across all 4 modes and intermediate alphas', () => {
      const modes = [0, 1, 2, 3];
      const alphas = [0.0, 0.1, 0.18, 0.25, 0.50, 0.75, 0.90, 1.0];
      const testCoordinates: [number, number, string][] = [
        [0.5, 0.5, 'Null Island (0, 0)'],
        [0.0, 0.5, 'Antimeridian West (-180, 0)'],
        [1.0, 0.5, 'Antimeridian East (+180, 0)'],
        [0.9999, 0.5, 'Antimeridian Seam Boundary'],
        [0.625, 0.25, 'Mid-Latitude NE (45, 45)'],
        [0.375, 0.75, 'Mid-Latitude SW (-45, -45)'],
        [0.0615, 0.3817, 'Pacific Litmus (-157.85, 21.3)'],
        [0.888, 0.3017, 'Tokyo (139.69, 35.69)'],
        [0.5, 0.5 - 80 / 180, 'High Northern Latitude (+80)'],
        [0.5, 0.5 + 80 / 180, 'High Southern Latitude (-80)'],
      ];

      let globalMaxDelta = 0.0;
      const maxDeltaByMode: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

      for (const mode of modes) {
        for (const alpha of alphas) {
          for (const [u, v, label] of testCoordinates) {
            const posEngine = WebGPUEngine.evaluateManifoldPosition(u, v, mode, alpha, RADIUS, 1.5);

            // Construct particle resting coordinates from (u, v)
            const TWO_PI = 2.0 * Math.PI;
            const lonRad = (u - 0.5) * TWO_PI;
            const latRad = (0.5 - v) * PI;
            const cosLat = Math.cos(latRad);
            const sinLat = Math.sin(latRad);
            const cosLon = Math.cos(lonRad);
            const sinLon = Math.sin(lonRad);

            const pos3D: [number, number, number] = [
              RADIUS * cosLat * sinLon,
              RADIUS * sinLat,
              RADIUS * cosLat * cosLon,
            ];

            const clampedLat = Math.max(-1.4835, Math.min(1.4835, latRad));
            const mercatorY = Math.log(Math.tan(PI * 0.25 + clampedLat * 0.5)) * RADIUS;
            const mercatorX = lonRad * RADIUS;
            const pos2D: [number, number, number] = [mercatorX, mercatorY, 0.0];

            const posSim = simulatePhysicsParticle(pos3D, pos2D, mode, alpha, 1.5);

            const delta = Math.hypot(
              posEngine[0] - posSim[0],
              posEngine[1] - posSim[1],
              posEngine[2] - posSim[2]
            );

            if (delta > globalMaxDelta) globalMaxDelta = delta;
            if (delta > maxDeltaByMode[mode]) maxDeltaByMode[mode] = delta;

            expect(
              delta,
              `Mode ${mode} at ${label}, alpha=${alpha}: delta=${delta} exceeds 0.05`
            ).toBeLessThanOrEqual(0.05);
          }
        }
      }

      console.log(`[PARITY-03] Global Maximum Delta: ${globalMaxDelta.toFixed(6)}`);
      console.log(`[PARITY-03] Max Delta by Mode:`, maxDeltaByMode);
      expect(globalMaxDelta).toBeLessThanOrEqual(0.05);
    });

    it('PARITY-04: dense sweep across 200 alpha values confirms continuous alignment Delta <= 0.05 in Mode 3 (Fluid)', () => {
      const STEPS = 200;
      let maxDeltaFluid = 0.0;
      const u = 0.0615; // Pacific Litmus
      const v = 0.3817;

      const TWO_PI = 2.0 * Math.PI;
      const lonRad = (u - 0.5) * TWO_PI;
      const latRad = (0.5 - v) * PI;
      const cosLat = Math.cos(latRad);
      const sinLat = Math.sin(latRad);
      const cosLon = Math.cos(lonRad);
      const sinLon = Math.sin(lonRad);

      const pos3D: [number, number, number] = [
        RADIUS * cosLat * sinLon,
        RADIUS * sinLat,
        RADIUS * cosLat * cosLon,
      ];
      const clampedLat = Math.max(-1.4835, Math.min(1.4835, latRad));
      const mercatorY = Math.log(Math.tan(PI * 0.25 + clampedLat * 0.5)) * RADIUS;
      const mercatorX = lonRad * RADIUS;
      const pos2D: [number, number, number] = [mercatorX, mercatorY, 0.0];

      for (let i = 0; i <= STEPS; i++) {
        const alpha = i / STEPS;
        const posEngine = WebGPUEngine.evaluateManifoldPosition(u, v, 3, alpha, RADIUS, 2.0);
        const posSim = simulatePhysicsParticle(pos3D, pos2D, 3, alpha, 2.0);

        const delta = Math.hypot(
          posEngine[0] - posSim[0],
          posEngine[1] - posSim[1],
          posEngine[2] - posSim[2]
        );

        if (delta > maxDeltaFluid) maxDeltaFluid = delta;
        expect(delta).toBeLessThanOrEqual(0.05);
      }

      console.log(`[PARITY-04] Mode 3 200-step sweep max delta: ${maxDeltaFluid.toFixed(6)}`);
      expect(maxDeltaFluid).toBeLessThanOrEqual(0.05);
    });
  });
});
