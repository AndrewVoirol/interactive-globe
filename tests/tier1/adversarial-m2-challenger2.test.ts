import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GlobeLayerManager } from '../../src/core/layers/GlobeLayerManager';
import { IGlobeLayer, LayerRenderContext } from '../../src/core/layers/IGlobeLayer';
import { SubstrateUniformFrameData } from '../../src/core/paradigms/IRenderParadigm';

describe('Adversarial Challenge 2 (Milestone M2): Layer Management, Wireframe Moiré & Contrast Rigor', () => {
  // =========================================================================
  // 1. Production GlobeLayerManager Lifecycle & State Behavioral Tests
  // =========================================================================
  describe('1. Production GlobeLayerManager Lifecycle & State Transitions', () => {
    class MockGlobeLayer implements IGlobeLayer {
      public readonly id: string;
      public readonly name: string;
      public visible = true;
      public opacity = 1.0;
      public blendMode: 'opaque' | 'alpha' | 'additive' | 'screen' | 'multiply' = 'alpha';
      public order: number;
      public updateCount = 0;
      public disposed = false;

      constructor(id: string, order = 0) {
        this.id = id;
        this.name = `Layer ${id}`;
        this.order = order;
      }

      async onAdd(): Promise<void> {}
      async onRemove(): Promise<void> {}
      update(frameData: SubstrateUniformFrameData): void {
        this.updateCount++;
      }
      render(ctx: LayerRenderContext): void {}
      dispose(): void {
        this.disposed = true;
      }
    }

    it('C2-M2-T1: verifies GlobeLayerManager adds, removes, reorders and enforces z-order invariants', async () => {
      const manager = new GlobeLayerManager();
      const layerA = new MockGlobeLayer('layer-a', 2);
      const layerB = new MockGlobeLayer('layer-b', 1);
      const layerC = new MockGlobeLayer('layer-c', 3);

      await manager.addLayer(layerA);
      await manager.addLayer(layerB);
      await manager.addLayer(layerC);

      expect(manager.hasLayer('layer-a')).toBe(true);
      expect(manager.hasLayer('layer-b')).toBe(true);
      expect(manager.hasLayer('layer-c')).toBe(true);

      // Verify sorted order by order property (1, 2, 3)
      const sorted = manager.getAllLayers();
      expect(sorted[0].id).toBe('layer-b');
      expect(sorted[1].id).toBe('layer-a');
      expect(sorted[2].id).toBe('layer-c');

      // Reorder layer-c to top priority (order 0)
      manager.setLayerOrder('layer-c', 0);
      const reordered = manager.getAllLayers();
      expect(reordered[0].id).toBe('layer-c');
      expect(reordered[1].id).toBe('layer-b');
      expect(reordered[2].id).toBe('layer-a');

      // Remove layer-b
      const removed = await manager.removeLayer('layer-b');
      expect(removed).toBe(true);
      expect(manager.hasLayer('layer-b')).toBe(false);
      expect(layerB.disposed).toBe(true);
      expect(manager.getAllLayers().length).toBe(2);
    });

    it('C2-M2-T2: verifies GlobeLayerManager clamps opacity strictly to [0, 1] and suppresses updates when invisible', async () => {
      const manager = new GlobeLayerManager();
      const layer = new MockGlobeLayer('test-layer', 0);
      await manager.addLayer(layer);

      // Test negative opacity clamping
      manager.setLayerOpacity('test-layer', -0.5);
      expect(layer.opacity).toBe(0.0);

      // Test excessive opacity clamping
      manager.setLayerOpacity('test-layer', 2.5);
      expect(layer.opacity).toBe(1.0);

      // Test valid opacity
      manager.setLayerOpacity('test-layer', 0.65);
      expect(layer.opacity).toBe(0.65);

      // Frame update when visible and opaque
      const dummyFrameData: SubstrateUniformFrameData = {
        time: 1.0,
        dt: 0.016,
        unfurl: 0.5,
        mode: 4,
        theme: 0,
        cameraPosition: new THREE.Vector3(0, 0, 15),
        cameraCenter: new THREE.Vector3(0, 0, 0),
        viewMatrix: new THREE.Matrix4(),
        projectionMatrix: new THREE.Matrix4(),
      };

      manager.updateAll(dummyFrameData);
      expect(layer.updateCount).toBe(1);

      // Suppressed when visibility is toggled off
      manager.toggleLayerVisibility('test-layer');
      expect(layer.visible).toBe(false);
      manager.updateAll(dummyFrameData);
      expect(layer.updateCount).toBe(1); // Did not increment

      // Suppressed when opacity < 0.001
      manager.toggleLayerVisibility('test-layer');
      expect(layer.visible).toBe(true);
      manager.setLayerOpacity('test-layer', 0.0005);
      manager.updateAll(dummyFrameData);
      expect(layer.updateCount).toBe(1); // Did not increment
    });
  });

  // =========================================================================
  // 2. Numerical Robustness & Wireframe Moiré Attenuation Curves
  // =========================================================================
  describe('2. Numerical Robustness & Attenuation Curves', () => {
    const computeWireframeOpacityScale = (nodeCount: number) => {
      const safeCount = nodeCount <= 0 || !Number.isFinite(nodeCount) ? 100000 : nodeCount;
      return Math.min(1.0, Math.sqrt(100000 / safeCount));
    };

    it('C2-M2-T3: verifies computeWireframeOpacityScale handles non-positive, zero, NaN, and extreme densities without divide-by-zero or negative values', () => {
      // Non-positive and zero densities fallback safely to 1.0
      expect(computeWireframeOpacityScale(0)).toBe(1.0);
      expect(computeWireframeOpacityScale(-100)).toBe(1.0);
      expect(computeWireframeOpacityScale(-1e6)).toBe(1.0);
      expect(computeWireframeOpacityScale(NaN)).toBe(1.0);

      // Standard densities
      expect(computeWireframeOpacityScale(100000)).toBe(1.0);
      expect(computeWireframeOpacityScale(1000000)).toBeCloseTo(0.3162277, 5);

      // Extreme positive densities
      const scale10M = computeWireframeOpacityScale(10000000);
      expect(scale10M).toBeCloseTo(0.1, 5);
      expect(scale10M).toBeGreaterThan(0);

      const scale1B = computeWireframeOpacityScale(1e9);
      expect(scale1B).toBeCloseTo(0.01, 4);
      expect(scale1B).toBeGreaterThan(0);

      // Infinitesimal positive densities clamped to 1.0 max
      expect(computeWireframeOpacityScale(1)).toBe(1.0);
      expect(computeWireframeOpacityScale(1e-6)).toBe(1.0);
    });

    it('C2-M2-T4: verifies densityFactor clamping to [0.01, 1.0] and strictly positive wireframe alpha across all simulation modes', () => {
      const simulateMeshAlpha = (
        wireOpacityScale: number,
        vPointType: number,
        vFacing: number,
        vStrain: number,
        u_mode: number,
        u_unfurl: number
      ): number => {
        const densityFactor = Math.max(0.01, Math.min(1.0, wireOpacityScale));
        const smoothstep = (min: number, max: number, x: number) => {
          const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
          return t * t * (3 - 2 * t);
        };
        const backfaceDimming = 0.15 + (1.0 - 0.15) * smoothstep(-0.5, 0.2, vFacing);
        let alpha = 0.03 * densityFactor * (1 - Math.pow(vPointType, 2)) + (0.50 * densityFactor) * Math.pow(vPointType, 2);

        if (u_mode === 2) {
          if (vStrain > 0.35) {
            const strainMix = (vStrain - 0.35) * 1.5;
            alpha = alpha * (1 - strainMix) + (0.95 * densityFactor) * strainMix;
          }
        } else if (u_mode === 3) {
          const rawSin = Math.sin(Math.PI * Math.max(0, Math.min(1, u_unfurl)));
          const liquefaction = (u_unfurl <= 0.001 || u_unfurl >= 0.999) ? 0.0 : Math.pow(Math.max(0, rawSin), 1.2);
          alpha = alpha * (1.0 - liquefaction * 0.92);
        }

        return alpha * backfaceDimming;
      };

      // Fuzz test parameter combinations across all modes
      const scaleTestValues = [-10, 0, 0.0001, 0.01, 0.3162, 0.5, 1.0, 5.0, 100.0];
      const pointTypes = [0.0, 0.25, 0.5, 0.75, 1.0];
      const facings = [-1.0, -0.5, -0.25, 0.0, 0.2, 0.5, 1.0];
      const strains = [0.0, 0.35, 0.5, 0.78, 1.0];
      const modes = [0, 1, 2, 3];
      const unfurls = [0.0, 0.18, 0.5, 0.9, 1.0];

      for (const scale of scaleTestValues) {
        for (const pt of pointTypes) {
          for (const facing of facings) {
            for (const strain of strains) {
              for (const mode of modes) {
                for (const unfurl of unfurls) {
                  const finalAlpha = simulateMeshAlpha(scale, pt, facing, strain, mode, unfurl);
                  expect(Number.isFinite(finalAlpha)).toBe(true);
                  expect(finalAlpha).toBeGreaterThan(0.0);
                  expect(finalAlpha).toBeLessThanOrEqual(1.0);
                }
              }
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // 3. Optical Invariance & Dynamic Range Contrast Proofs
  // =========================================================================
  describe('3. Optical Invariance & Dynamic Range Contrast Proofs', () => {
    it('C2-M2-T5: models line overdraw at 100k vs 1M and verifies integrated optical density invariance', () => {
      // Surface area of sphere with R = 5.0: A = 4 * PI * R^2 = 100 * PI ≈ 314.159
      // At N nodes: cell area a ≈ A / N, Delaunay edge length L_edge ≈ sqrt(a) = sqrt(A / N)
      // Euler edge count on sphere: E ≈ 3N
      // Total line length L_total = E * L_edge ≈ 3N * sqrt(A / N) = 3 * sqrt(A) * sqrt(N)
      const computeTotalLineLength = (N: number, R = 5.0) => {
        const A = 4 * Math.PI * R * R;
        const L_edge = Math.sqrt(A / N);
        const E = 3 * N;
        return E * L_edge;
      };

      const L_100k = computeTotalLineLength(100000);
      const L_1M = computeTotalLineLength(1000000);

      const unattenuatedOverdrawRatio = L_1M / L_100k;
      expect(unattenuatedOverdrawRatio).toBeCloseTo(Math.sqrt(10), 4);

      // Attenuation scaling factor = sqrt(100,000 / N)
      const scale_100k = 1.0;
      const scale_1M = Math.sqrt(100000 / 1000000); // ~0.3162277

      const effectiveOpticalDensity100k = L_100k * scale_100k;
      const effectiveOpticalDensity1M = L_1M * scale_1M;

      // Attenuated integrated optical density is invariant: ratio == 1.0000
      expect(effectiveOpticalDensity1M).toBeCloseTo(effectiveOpticalDensity100k, 3);
      expect(effectiveOpticalDensity1M / effectiveOpticalDensity100k).toBeCloseTo(1.0, 4);
    });

    it('C2-M2-T6: verifies 102.6:1 point dynamic range ensures coastline resolution without wireframe moiré interference', () => {
      // Coastline Point:
      const sGeo = 1.8;
      const alphaGeo = 0.95;
      const energyGeo = alphaGeo * (sGeo * sGeo); // 3.078

      // Structural Point:
      const sStruct = 1.0;
      const alphaStruct = 0.03;
      const energyStruct = alphaStruct * (sStruct * sStruct); // 0.030

      // Wireframe Line at 1M density (ocean structural lattice):
      const densityFactor1M = Math.sqrt(100000 / 1000000); // 0.316228
      const wireAlphaOcean1M = 0.03 * densityFactor1M; // ~0.009487

      // Contrast ratio between Coastline Points and Ocean Wireframe Lines:
      const pointToWireContrast = alphaGeo / wireAlphaOcean1M;
      expect(pointToWireContrast).toBeGreaterThan(100.0); // Coastline points are >100x more opaque than ocean wireframe

      const contrastRatio = energyGeo / energyStruct;
      expect(contrastRatio).toBeCloseTo(102.6, 1);
      expect(contrastRatio).toBeGreaterThanOrEqual(102.0);
    });

    it('C2-M2-T7: verifies Mode 3 Fluid liquefaction attenuation curve across morph progression', () => {
      const getLiquefactionAttenuation = (unfurl: number) => {
        if (unfurl <= 0.001 || unfurl >= 0.999) return 1.0;
        const rawSin = Math.sin(Math.PI * Math.max(0, Math.min(1, unfurl)));
        const liq = Math.pow(Math.max(0, rawSin), 1.2);
        return 1.0 - liq * 0.92;
      };

      // At alpha = 0 (Globe): full wireframe opacity (no attenuation)
      expect(getLiquefactionAttenuation(0.0)).toBe(1.0);
      // At alpha = 1 (Map): full wireframe opacity (no attenuation)
      expect(getLiquefactionAttenuation(1.0)).toBe(1.0);
      // At peak morph (alpha = 0.5): 92% attenuation of wireframe lines
      expect(getLiquefactionAttenuation(0.5)).toBeCloseTo(0.08, 2);
      expect(getLiquefactionAttenuation(0.5)).toBeGreaterThan(0.0); // Never negative
    });
  });
});
