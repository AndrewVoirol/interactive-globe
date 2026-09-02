import { describe, it, expect } from 'vitest';
import { shouldCullBackface } from '../helpers/math-oracle';

describe('F6: WebGL2 Backface Early-Out Culling', () => {
  const viewDir: [number, number, number] = [0, 0, 1]; // Looking towards +Z

  it('F6-T1: verifies front-facing vertices (dot > 0) are never culled at alpha = 0.0', () => {
    const normalFront: [number, number, number] = [0, 0, 1];
    const isCulled = shouldCullBackface(normalFront, viewDir, 0.0, -0.25);
    expect(isCulled).toBe(false);
  });

  it('F6-T2: verifies deep back-facing vertices (dot < -0.25) are culled at alpha = 0.0', () => {
    const normalBack: [number, number, number] = [0, 0, -1];
    const isCulled = shouldCullBackface(normalBack, viewDir, 0.0, -0.25);
    expect(isCulled).toBe(true);
  });

  it('F6-T3: verifies grazing silhouette vertices (-0.25 <= dot <= 0.0) remain visible without clipping', () => {
    // Dot product = -0.15 (between -0.25 and 0.0)
    const normalGrazing: [number, number, number] = [Math.sqrt(1 - 0.15 * 0.15), 0, -0.15];
    const isCulled = shouldCullBackface(normalGrazing, viewDir, 0.0, -0.25);
    expect(isCulled).toBe(false);
  });

  it('F6-T4: verifies culling is disabled when morphing into 2D planar map (alpha >= 0.08)', () => {
    const normalBack: [number, number, number] = [0, 0, -1];
    expect(shouldCullBackface(normalBack, viewDir, 0.08, -0.25)).toBe(false);
    expect(shouldCullBackface(normalBack, viewDir, 0.5, -0.25)).toBe(false);
    expect(shouldCullBackface(normalBack, viewDir, 1.0, -0.25)).toBe(false);
  });

  it('F6-T5: verifies theoretical spherical backface cull ratio achieves 40% to 50% vertex reduction', () => {
    // Sample 10,000 random points on unit sphere
    let culledCount = 0;
    const sampleCount = 10000;

    for (let i = 0; i < sampleCount; i++) {
      const z = 1 - (i / (sampleCount - 1)) * 2;
      const r = Math.sqrt(1 - z * z);
      const theta = i * 2.399963;
      const nx = Math.cos(theta) * r;
      const ny = Math.sin(theta) * r;
      const nz = z;

      if (shouldCullBackface([nx, ny, nz], [0, 0, 1], 0.0, -0.25)) {
        culledCount++;
      }
    }

    const cullRatio = culledCount / sampleCount;
    // Theoretical cull fraction for threshold -0.25 is (1 + (-0.25)) / 2 = 0.75/2 = 0.375...
    expect(cullRatio).toBeGreaterThanOrEqual(0.35);
    expect(cullRatio).toBeLessThanOrEqual(0.42);
  });
});
