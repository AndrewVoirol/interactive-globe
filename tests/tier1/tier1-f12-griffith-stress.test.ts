import { describe, it, expect } from 'vitest';
import { griffithHoopStress } from '../helpers/math-oracle';

describe('F12: Griffith Tensile Hoop Stress Concentration', () => {
  it('F12-T1: verifies stress scales inversely with sqrt(r) near the crack tip', () => {
    const rNear = 0.04;
    const rFar = 0.16; // 4x distance -> 1/sqrt(4) = 0.5x stress
    const sNear = griffithHoopStress(rNear, 0.0, 1.0).sigmaThetaTheta;
    const sFar = griffithHoopStress(rFar, 0.0, 1.0).sigmaThetaTheta;

    const ratio = sNear / sFar;
    expect(ratio).toBeCloseTo(2.0, 1);
  });

  it('F12-T2: verifies angular stress distribution vanishes behind crack tip at theta = PI', () => {
    const r = 0.1;
    const sFront = griffithHoopStress(r, 0.0).sigmaThetaTheta;
    const sFlank = griffithHoopStress(r, Math.PI / 3).sigmaThetaTheta;
    const sBehind = griffithHoopStress(r, Math.PI).sigmaThetaTheta;

    expect(sFront).toBeGreaterThan(0.0);
    expect(sFlank).toBeGreaterThan(0.0);
    expect(sBehind).toBeCloseTo(0.0, 5); // Zero tensile hoop stress behind crack
  });

  it('F12-T3: verifies cursor proximity increases effective stress intensity factor KI', () => {
    const r = 0.1;
    const baseStress = griffithHoopStress(r, 0.0, 1.0, Infinity).sigmaThetaTheta;
    const probedStress = griffithHoopStress(r, 0.0, 1.0, 0.0, 1.5, 1.0).sigmaThetaTheta;

    // When cursor is at distance 0.0, boost is 1 + 1.5 = 2.5x
    expect(probedStress / baseStress).toBeCloseTo(2.5, 4);
  });

  it('F12-T4: verifies local strain is clamped to prevent unphysical mesh tearing explosions', () => {
    const extremeStress = griffithHoopStress(0.001, 0.0, 100.0);
    expect(extremeStress.localStrain).toBeLessThanOrEqual(0.40);
    expect(extremeStress.localStrain).toBeGreaterThan(0.0);
  });

  it('F12-T5: verifies stress intensity factor decays exponentially with cursor distance', () => {
    const sClose = griffithHoopStress(0.1, 0.0, 1.0, 0.5, 1.5, 1.0).effectiveKI;
    const sMed = griffithHoopStress(0.1, 0.0, 1.0, 1.5, 1.5, 1.0).effectiveKI;
    const sFar = griffithHoopStress(0.1, 0.0, 1.0, 5.0, 1.5, 1.0).effectiveKI;

    expect(sClose).toBeGreaterThan(sMed);
    expect(sMed).toBeGreaterThan(sFar);
    expect(sFar).toBeCloseTo(1.0, 2); // Drops back to baseline KI = 1.0
  });
});
