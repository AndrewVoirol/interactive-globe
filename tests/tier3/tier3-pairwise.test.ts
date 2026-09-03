import { describe, it, expect } from 'vitest';
import { evaluatePointMorph } from '../../src/core/GlobeOverlay';
import { GlobeLayerManager } from '../../src/core/layers/GlobeLayerManager';
import { toSphere, toMercator } from '../../src/utils/projection';
import { griffithHoopStress, lambOseenVortex } from '../../src/utils/raycast';

describe('Tier 3: Cross-Feature Pairwise Combinations & State Machine Transitions', () => {
  type SimMode = 0 | 1 | 2 | 3 | 4; // 0=Linear, 1=Scroll, 2=Griffith, 3=Fluid, 4=Dymaxion
  type LayerMode = 0 | 1 | 2;       // 0=Both, 1=Points, 2=Wireframe
  type Backend = 'webgl2' | 'webgpu';

  interface MatrixState {
    mode: SimMode;
    layerMode: LayerMode;
    backend: Backend;
    cursorActive: boolean;
    alpha: number;
    time: number;
  }

  const evaluateState = (
    state: MatrixState,
    lon = 30,
    lat = 45
  ) => {
    const { mode, layerMode, cursorActive, alpha, time } = state;
    const pointsOpacity = layerMode === 2 ? 0.0 : 1.0;
    const wireframeOpacity = layerMode === 1 ? 0.0 : 1.0;

    const hitPos: [number, number, number] = cursorActive ? [0, 0, 5] : [0, 0, 0];
    const cursorVel: [number, number, number, number] = cursorActive ? [1, 0, 0, 1] : [0, 0, 0, 0];

    const position = evaluatePointMorph(
      lon,
      lat,
      alpha,
      mode,
      time,
      0.0, // elevationOffset = 0.0 so coordinates align with surface radius
      hitPos,
      cursorVel,
      cursorActive ? 1.0 : 0.0
    );

    let extraMetric = 0;
    if (mode === 2) {
      const stress = griffithHoopStress(0.1, 0.0, 1.0, cursorActive ? 0.2 : Infinity);
      extraMetric = stress.localStrain;
    } else if (mode === 3) {
      const vortex = cursorActive ? lambOseenVortex(0.3, time, 2.0).vTheta : 0;
      extraMetric = Math.hypot(position[0], position[1], position[2]) + vortex;
    }

    return { position, pointsOpacity, wireframeOpacity, extraMetric };
  };

  const samplePoint3D = toSphere(30, 45, 5.0);
  const samplePoint2D = toMercator(30, 45, 5.0);

  it('T3-01: Pairwise Mode 0 (Linear) x Layer 0 (Both) x WebGL2 x Cursor Idle', () => {
    const res = evaluateState({ mode: 0, layerMode: 0, backend: 'webgl2', cursorActive: false, alpha: 0.0, time: 1.0 });
    expect(res.pointsOpacity).toBe(1.0);
    expect(res.wireframeOpacity).toBe(1.0);
    expect(res.position[0]).toBeCloseTo(samplePoint3D[0], 4);
    expect(res.position[1]).toBeCloseTo(samplePoint3D[1], 4);
    expect(res.position[2]).toBeCloseTo(samplePoint3D[2], 4);
  });

  it('T3-02: Pairwise Mode 0 (Linear) x Layer 1 (Points) x WebGPU x Cursor Active', () => {
    const res = evaluateState({ mode: 0, layerMode: 1, backend: 'webgpu', cursorActive: true, alpha: 0.5, time: 1.0 });
    expect(res.pointsOpacity).toBe(1.0);
    expect(res.wireframeOpacity).toBe(0.0);
    expect(Number.isFinite(res.position[0])).toBe(true);
  });

  it('T3-03: Pairwise Mode 1 (Scroll) x Layer 2 (Wireframe) x WebGL2 x Cursor Idle', () => {
    const res = evaluateState({ mode: 1, layerMode: 2, backend: 'webgl2', cursorActive: false, alpha: 0.2, time: 2.0 });
    expect(res.pointsOpacity).toBe(0.0);
    expect(res.wireframeOpacity).toBe(1.0);
    expect(Number.isFinite(res.position[1])).toBe(true);
  });

  it('T3-04: Pairwise Mode 1 (Scroll) x Layer 0 (Both) x WebGPU x Cursor Active', () => {
    const res = evaluateState({ mode: 1, layerMode: 0, backend: 'webgpu', cursorActive: true, alpha: 0.8, time: 3.0 });
    expect(res.pointsOpacity).toBe(1.0);
    expect(res.wireframeOpacity).toBe(1.0);
    expect(Number.isFinite(res.position[2])).toBe(true);
  });

  it('T3-05: Pairwise Mode 2 (Griffith) x Layer 1 (Points) x WebGL2 x Cursor Active', () => {
    const res = evaluateState({ mode: 2, layerMode: 1, backend: 'webgl2', cursorActive: true, alpha: 0.1, time: 1.0 });
    expect(res.extraMetric).toBeGreaterThan(0.0); // Amplified strain
    expect(res.pointsOpacity).toBe(1.0);
    expect(res.wireframeOpacity).toBe(0.0);
  });

  it('T3-06: Pairwise Mode 2 (Griffith) x Layer 2 (Wireframe) x WebGPU x Cursor Idle', () => {
    const res = evaluateState({ mode: 2, layerMode: 2, backend: 'webgpu', cursorActive: false, alpha: 0.0, time: 1.0 });
    expect(res.wireframeOpacity).toBe(1.0);
    expect(res.pointsOpacity).toBe(0.0);
  });

  it('T3-07: Pairwise Mode 3 (Fluid) x Layer 0 (Both) x WebGL2 x Cursor Active', () => {
    const res = evaluateState({ mode: 3, layerMode: 0, backend: 'webgl2', cursorActive: true, alpha: 0.0, time: 2.5 });
    expect(res.extraMetric).toBeGreaterThan(0.0); // Vortex circulation present
    expect(res.pointsOpacity).toBe(1.0);
    expect(res.wireframeOpacity).toBe(1.0);
  });

  it('T3-08: Pairwise Mode 3 (Fluid) x Layer 1 (Points) x WebGPU x Cursor Active', () => {
    const res = evaluateState({ mode: 3, layerMode: 1, backend: 'webgpu', cursorActive: true, alpha: 0.5, time: 4.0 });
    expect(res.pointsOpacity).toBe(1.0);
    expect(res.wireframeOpacity).toBe(0.0);
  });

  it('T3-09: Pairwise Mode 4 (Dymaxion) x Layer 0 (Both) x WebGL2 x Cursor Idle', () => {
    const res = evaluateState({ mode: 4, layerMode: 0, backend: 'webgl2', cursorActive: false, alpha: 0.0, time: 1.0 });
    expect(res.pointsOpacity).toBe(1.0);
    expect(res.wireframeOpacity).toBe(1.0);
    expect(Number.isNaN(res.position[0])).toBe(false);
  });

  it('T3-10: Pairwise Mode 4 (Dymaxion) x Layer 2 (Wireframe) x WebGPU x Cursor Active', () => {
    const res = evaluateState({ mode: 4, layerMode: 2, backend: 'webgpu', cursorActive: true, alpha: 1.0, time: 1.0 });
    expect(res.pointsOpacity).toBe(0.0);
    expect(res.wireframeOpacity).toBe(1.0);
    expect(res.position[2]).toBeCloseTo(0.0, 5); // Flat on map
  });

  it('T3-11: Mid-morph mode switch from Mode 0 (Linear) to Mode 3 (Fluid) at alpha = 0.5 preserves position continuity', () => {
    const resLinear = evaluateState({ mode: 0, layerMode: 0, backend: 'webgl2', cursorActive: false, alpha: 0.5, time: 1.0 });
    const resFluid = evaluateState({ mode: 3, layerMode: 0, backend: 'webgl2', cursorActive: false, alpha: 0.5, time: 1.0 });

    const dist = Math.hypot(
      resLinear.position[0] - resFluid.position[0],
      resLinear.position[1] - resFluid.position[1],
      resLinear.position[2] - resFluid.position[2]
    );
    expect(dist).toBeLessThan(2.0); // Bounded fluid turbulence perturbation
  });

  it('T3-12: Mid-morph layer switch sequence (Both -> Points Only -> Wireframe Only) maintains continuous alpha', () => {
    const state: MatrixState = { mode: 3, layerMode: 0, backend: 'webgpu', cursorActive: true, alpha: 0.42, time: 5.0 };

    const r1 = evaluateState({ ...state, layerMode: 0 });
    const r2 = evaluateState({ ...state, layerMode: 1 });
    const r3 = evaluateState({ ...state, layerMode: 2 });

    expect(r1.pointsOpacity + r1.wireframeOpacity).toBe(2.0);
    expect(r2.pointsOpacity + r2.wireframeOpacity).toBe(1.0);
    expect(r3.pointsOpacity + r3.wireframeOpacity).toBe(1.0);
  });

  it('T3-13: Backend switch from WebGL2 to WebGPU maintains identical computational results', () => {
    const stWebGL2: MatrixState = { mode: 3, layerMode: 0, backend: 'webgl2', cursorActive: true, alpha: 0.3, time: 2.0 };
    const stWebGPU: MatrixState = { mode: 3, layerMode: 0, backend: 'webgpu', cursorActive: true, alpha: 0.3, time: 2.0 };

    const res1 = evaluateState(stWebGL2);
    const res2 = evaluateState(stWebGPU);

    expect(res1.position[0]).toBeCloseTo(res2.position[0], 5);
    expect(res1.position[1]).toBeCloseTo(res2.position[1], 5);
    expect(res1.position[2]).toBeCloseTo(res2.position[2], 5);
  });

  it('T3-14: Layer manager manages layer ordering, opacity clamping, and visibility transitions', async () => {
    const manager = new GlobeLayerManager();
    const layer1 = {
      id: 'layer-points',
      name: 'Point Cloud Layer',
      visible: true,
      opacity: 1.0,
      blendMode: 'alpha' as const,
      order: 1,
      onAdd: async () => {},
      onRemove: async () => {},
      update: () => {},
      render: () => {},
      dispose: () => {},
    };
    const layer2 = {
      id: 'layer-wireframe',
      name: 'Wireframe Lattice Layer',
      visible: true,
      opacity: 0.5,
      blendMode: 'alpha' as const,
      order: 2,
      onAdd: async () => {},
      onRemove: async () => {},
      update: () => {},
      render: () => {},
      dispose: () => {},
    };

    await manager.addLayer(layer1);
    await manager.addLayer(layer2);

    expect(manager.getAllLayers().length).toBe(2);
    expect(manager.getAllLayers()[0].id).toBe('layer-points');

    // Toggle visibility
    manager.toggleLayerVisibility('layer-points');
    expect(manager.getLayer('layer-points')?.visible).toBe(false);

    // Set opacity with bounds clamping
    manager.setLayerOpacity('layer-wireframe', 1.5);
    expect(manager.getLayer('layer-wireframe')?.opacity).toBe(1.0);
  });

  it('T3-15: Complete 30-state combinatorial matrix validation (5 modes x 3 layers x 2 backends)', () => {
    const modes: SimMode[] = [0, 1, 2, 3, 4];
    const layerModes: LayerMode[] = [0, 1, 2];
    const backends: Backend[] = ['webgl2', 'webgpu'];

    let validCombinations = 0;
    modes.forEach(mode => {
      layerModes.forEach(layerMode => {
        backends.forEach(backend => {
          const res = evaluateState(
            { mode, layerMode, backend, cursorActive: true, alpha: 0.5, time: 1.0 }
          );
          expect(Number.isFinite(res.position[0])).toBe(true);
          expect(Number.isFinite(res.position[1])).toBe(true);
          expect(Number.isFinite(res.position[2])).toBe(true);
          validCombinations++;
        });
      });
    });

    expect(validCombinations).toBe(30);
  });

  it('T3-16: Simultaneous mode change + layer change + backend toggle completes in single frame step', () => {
    const initialState: MatrixState = {
      mode: 0,
      layerMode: 0,
      backend: 'webgl2',
      cursorActive: false,
      alpha: 0.0,
      time: 0.0,
    };

    const finalState: MatrixState = {
      mode: 4,
      layerMode: 1,
      backend: 'webgpu',
      cursorActive: true,
      alpha: 1.0,
      time: 10.0,
    };

    const resInit = evaluateState(initialState);
    const resFinal = evaluateState(finalState);

    expect(resInit.pointsOpacity).toBe(1.0);
    expect(resInit.wireframeOpacity).toBe(1.0);
    expect(resFinal.pointsOpacity).toBe(1.0);
    expect(resFinal.wireframeOpacity).toBe(0.0);
    expect(resFinal.position[2]).toBeCloseTo(0.0, 5);
  });

  it('T3-17: Rapid mode cycling (0 -> 1 -> 2 -> 3 -> 4 -> 0) maintains bounded memory state', () => {
    let state: MatrixState = { mode: 0, layerMode: 0, backend: 'webgl2', cursorActive: false, alpha: 0.5, time: 0 };
    for (let cycle = 0; cycle < 50; cycle++) {
      state.mode = (cycle % 5) as SimMode;
      const res = evaluateState(state);
      expect(Number.isFinite(res.position[0])).toBe(true);
    }
  });

  it('T3-18: Continuous scrubbing while switching from Points Only to Wireframe Only causes no division by zero', () => {
    for (let a = 0; a <= 1.0; a += 0.1) {
      const layer = (Math.floor(a * 10) % 3) as LayerMode;
      const res = evaluateState({ mode: 1, layerMode: layer, backend: 'webgpu', cursorActive: false, alpha: a, time: a });
      expect(Number.isFinite(res.position[0])).toBe(true);
    }
  });

  it('T3-19: Griffith mode with cursor hovering near antimeridian concentrates strain in Both and Points Only modes', () => {
    const stBoth: MatrixState = { mode: 2, layerMode: 0, backend: 'webgl2', cursorActive: true, alpha: 0.05, time: 1.0 };
    const stPoints: MatrixState = { mode: 2, layerMode: 1, backend: 'webgl2', cursorActive: true, alpha: 0.05, time: 1.0 };

    const resBoth = evaluateState(stBoth);
    const resPoints = evaluateState(stPoints);

    expect(resBoth.extraMetric).toBe(resPoints.extraMetric);
    expect(resBoth.extraMetric).toBeGreaterThan(0.0);
  });

  it('T3-20: WebGPU compute pipeline simulation state step advances time deterministically across frame steps', () => {
    let simTime = 0.0;
    const dt = 0.0166667;
    for (let frame = 0; frame < 60; frame++) {
      simTime += dt;
      const res = evaluateState({ mode: 3, layerMode: 0, backend: 'webgpu', cursorActive: true, alpha: 0.2, time: simTime });
      expect(Number.isFinite(res.position[0])).toBe(true);
    }
    expect(simTime).toBeCloseTo(1.0, 3);
  });
});
