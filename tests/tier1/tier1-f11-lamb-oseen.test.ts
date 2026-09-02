import { describe, it, expect } from 'vitest';
import { lambOseenVortex } from '../helpers/math-oracle';

describe('F11: Fluid Lamb-Oseen Vortex Wake Simulation', () => {
  it('F11-T1: verifies vortex tangential velocity is non-singular and approaches 0 as r -> 0', () => {
    const { vTheta, vorticity } = lambOseenVortex(0.0, 0.0, 1.0, 0.1, 0.2);
    expect(vTheta).toBe(0.0);
    expect(Number.isFinite(vorticity)).toBe(true);
    expect(vorticity).toBeGreaterThan(0.0);
  });

  it('F11-T2: verifies peak velocity occurs near vortex core radius rc = sqrt(4 * nu * t0)', () => {
    const nu = 0.1;
    const t0 = 0.2;
    const rc = Math.sqrt(4 * nu * t0); // ~0.2828

    const radii = [0.05, 0.1, 0.2, 0.28, 0.35, 0.6, 1.0, 2.0];
    const velocities = radii.map(r => lambOseenVortex(r, 0.0, 1.0, nu, t0).vTheta);

    // Peak velocity is near rc * 1.12
    const maxV = Math.max(...velocities);
    const maxIndex = velocities.indexOf(maxV);
    const maxR = radii[maxIndex];

    expect(maxR).toBeGreaterThanOrEqual(0.2);
    expect(maxR).toBeLessThanOrEqual(0.4);
  });

  it('F11-T3: verifies far-field velocity exhibits asymptotic 1/r potential vortex decay', () => {
    const rFar1 = 5.0;
    const rFar2 = 10.0;
    const v1 = lambOseenVortex(rFar1, 0.0, 1.0).vTheta;
    const v2 = lambOseenVortex(rFar2, 0.0, 1.0).vTheta;

    // Ratio v1 / v2 should approach rFar2 / rFar1 = 2.0
    const ratio = v1 / v2;
    expect(ratio).toBeCloseTo(2.0, 1);
  });

  it('F11-T4: verifies vorticity decays over time as viscous diffusion expands the vortex core', () => {
    const r = 0.1;
    const { vorticity: vortT0 } = lambOseenVortex(r, 0.0, 1.0, 0.1, 0.2);
    const { vorticity: vortT1 } = lambOseenVortex(r, 1.0, 1.0, 0.1, 0.2);
    const { vorticity: vortT2 } = lambOseenVortex(r, 3.0, 1.0, 0.1, 0.2);

    expect(vortT0).toBeGreaterThan(vortT1);
    expect(vortT1).toBeGreaterThan(vortT2);
  });

  it('F11-T5: verifies circulation scaling linearly with cursor motion speed', () => {
    const speedLow = 1.0;
    const speedHigh = 5.0;
    const vLow = lambOseenVortex(0.5, 0.0, speedLow).vTheta;
    const vHigh = lambOseenVortex(0.5, 0.0, speedHigh).vTheta;

    expect(vHigh / vLow).toBeCloseTo(5.0, 4);
  });
});
