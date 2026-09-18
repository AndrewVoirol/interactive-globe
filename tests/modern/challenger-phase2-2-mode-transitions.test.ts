// ============================================================================
// File: tests/modern/challenger-phase2-2-mode-transitions.test.ts
// Challenger 1 Empirical Test Harness: Mode Transitions & Excision Completeness
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { createMockNavigatorGPU } from '../helpers/webgpu-mock';
import { WhimsicalEffectsManager } from '../../src/core/effects/WhimsicalEffectsManager';
import { SimulationMode } from '../../src/types';

describe('Challenger 1 Empirical Verification: Phase 2.2 Mode 4 Excision & Transitions', () => {
  it('TRANSITION-01: verifies all 16 pairwise mode transitions (0..3 -> 0..3) across alpha [0, 0.5, 1.0]', async () => {
    const mockGPU = createMockNavigatorGPU();
    (globalThis as any).navigator = { gpu: mockGPU };

    const engine = new WebGPUEngine();
    const canvas = {
      getContext: () => ({
        configure: () => {},
        getCurrentTexture: () => ({ createView: () => ({}) }),
        canvas: { width: 1920, height: 1080 },
      }),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    await engine.initialize({
      canvas,
      pointCount: 100,
      pointsData: new Float32Array(300),
      target2DData: new Float32Array(200),
      typeData: new Float32Array(100),
      lineIndices: new Uint32Array(100),
    });

    const camera = new THREE.PerspectiveCamera(45, 1920 / 1080, 0.1, 1000);
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);

    const validModes: SimulationMode[] = [0, 1, 2, 3];
    const alphas = [0.0, 0.25, 0.5, 0.75, 1.0];

    // Stress test every pair transition
    for (const fromMode of validModes) {
      for (const toMode of validModes) {
        for (const alpha of alphas) {
          // Render fromMode
          expect(() => {
            engine.render({
              unfurl: alpha,
              mode: fromMode,
              layerMode: 0,
              time: 1.0,
              dt: 0.016,
              camera,
            });
          }).not.toThrow();

          // Immediately transition to toMode
          expect(() => {
            engine.render({
              unfurl: alpha,
              mode: toMode,
              layerMode: 0,
              time: 1.016,
              dt: 0.016,
              camera,
            });
          }).not.toThrow();

          // Verify CDLOD update handles the transition cleanly
          expect(() => {
            engine.updateCDLOD(camera, toMode, alpha, false);
          }).not.toThrow();
        }
      }
    }

    engine.dispose();
  });

  it('TRANSITION-02: evaluateManifoldPosition produces finite coordinates with zero NaNs for all valid modes (0..3)', () => {
    const validModes: SimulationMode[] = [0, 1, 2, 3];
    const alphas = [0.0, 0.001, 0.18, 0.5, 0.999, 1.0];
    const uvSamples = [
      [0.0, 0.0],
      [0.5, 0.5],
      [1.0, 1.0],
      [0.25, 0.75],
      [0.001, 0.999],
      [0.5, 0.0], // Pole
      [0.5, 1.0], // Pole
    ];

    for (const mode of validModes) {
      for (const alpha of alphas) {
        for (const [u, v] of uvSamples) {
          const pos = WebGPUEngine.evaluateManifoldPosition(u, v, mode, alpha, 5.0);
          expect(Number.isFinite(pos[0])).toBe(true);
          expect(Number.isFinite(pos[1])).toBe(true);
          expect(Number.isFinite(pos[2])).toBe(true);
          expect(Number.isNaN(pos[0])).toBe(false);
          expect(Number.isNaN(pos[1])).toBe(false);
          expect(Number.isNaN(pos[2])).toBe(false);
        }
      }
    }
  });

  it('WHIMSICAL-FIX-01: verifies WhimsicalEffectsManager is cleanly excised of Mode 4 logic and conforms to SimulationMode (0..3)', () => {
    const manager = new WhimsicalEffectsManager();

    // In all valid modes (0, 1, 2, 3), polar alignment operates deterministically
    for (const validMode of [0, 1, 2, 3] as SimulationMode[]) {
      const statePole = manager.update([0, 15, 0], validMode, 0.0, 1.0);
      expect(statePole.isPolarAligned).toBe(true);
      expect(statePole.pointScaleMultiplier).toBe(1.2);

      const stateEquator = manager.update([15, 0, 0], validMode, 0.0, 1.0);
      expect(stateEquator.isPolarAligned).toBe(false);
      expect(stateEquator.pointScaleMultiplier).toBe(1.0);
    }
  });
});
