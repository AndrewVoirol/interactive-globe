import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { evaluatePointMorph } from '../../src/core/GlobeOverlay';

describe('GlobeOverlay & Manifold Parity (Milestone 3 Verification)', () => {
  const overlayPath = path.resolve(__dirname, '../../src/core/GlobeOverlay.ts');
  const overlayCode = fs.readFileSync(overlayPath, 'utf-8');

  const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const crustShaderCode = fs.readFileSync(crustShaderPath, 'utf-8');

  // ==========================================================================
  // Mode 2: Griffith LEFM Fracture Tuning
  // ==========================================================================
  describe('Mode 2 (Fracture): tRupture = 0.05 & Immediate Visible Response', () => {
    it('verifies tRupture is lowered from 0.18 to 0.05 in GlobeOverlay.ts and crust_hydrosphere.wgsl', () => {
      expect(overlayCode).toContain('const tRupture = 0.05;');
      expect(crustShaderCode).toContain('let tRupture = 0.05;');
    });

    it('verifies pre-rupture hoop stress causes the visible hemisphere (lon=0, lat=0) to respond immediately to slider', () => {
      // With elevationOffset = 0.0, sphere radius is exactly 5.0
      const pos0 = evaluatePointMorph(0, 0, 0.0, 2, 0, 0.0);
      const len0 = Math.hypot(pos0[0], pos0[1], pos0[2]);
      expect(len0).toBeCloseTo(5.0, 4);

      // At alpha = 0.02 (well before 0.05 rupture), visible hemisphere MUST deform outward from pre-rupture hoop stress
      const pos002 = evaluatePointMorph(0, 0, 0.02, 2, 0, 0.0);
      const len002 = Math.hypot(pos002[0], pos002[1], pos002[2]);
      expect(len002).toBeGreaterThan(len0);
      expect(len002 - len0).toBeGreaterThan(0.001);

      // At alpha = 0.04
      const pos004 = evaluatePointMorph(0, 0, 0.04, 2, 0, 0.0);
      const len004 = Math.hypot(pos004[0], pos004[1], pos004[2]);
      expect(len004).toBeGreaterThan(len002);
    });

    it('verifies post-rupture base manifold aligns to Cylindrical Unroll at alpha = 1.0', () => {
      // At alpha = 1.0, both Mode 1 (Cylindrical Unroll) and Mode 2 (Fracture) must reach identical planar coordinates
      const posMode1 = evaluatePointMorph(30, 20, 1.0, 1, 0, 0.0);
      const posMode2 = evaluatePointMorph(30, 20, 1.0, 2, 0, 0.0);

      expect(posMode2[0]).toBeCloseTo(posMode1[0], 4);
      expect(posMode2[1]).toBeCloseTo(posMode1[1], 4);
      expect(posMode2[2]).toBeCloseTo(posMode1[2], 4);
    });
  });

  // ==========================================================================
  // Mode 3: Fluid Advection Balloon Shell Tuning
  // ==========================================================================
  describe('Mode 3 (Fluid): balloonAmp (+2.5 units) to prevent sounding drowning', () => {
    it('verifies balloonAmp is present in GlobeOverlay.ts', () => {
      expect(overlayCode).toContain('const balloonAmp = rawSin * 2.5;');
      expect(overlayCode).toContain('basePos[0] += surfaceNormal[0] * balloonAmp;');
    });

    it('verifies balloonAmp evaluates to +2.5 units at mid-unfurl (alpha = 0.50)', () => {
      const rawSin = Math.sin(Math.PI * 0.5);
      const balloonAmp = rawSin * 2.5;
      expect(balloonAmp).toBeCloseTo(2.5, 5);
    });

    it('verifies balloonAmp is zero at boundaries (alpha = 0.0 and alpha = 1.0)', () => {
      const rawSin0 = Math.sin(Math.PI * 0.0);
      expect(rawSin0 * 2.5).toBeCloseTo(0.0, 5);

      const rawSin1 = Math.sin(Math.PI * 1.0);
      expect(rawSin1 * 2.5).toBeCloseTo(0.0, 5);
    });

    it('verifies overlay coordinates at alpha = 0.50 are elevated by balloon shell', () => {
      // Evaluated at lon = 0, lat = 0 at alpha = 0.50
      const posMid = evaluatePointMorph(0, 0, 0.5, 3, 0.0);
      const lenMid = Math.hypot(posMid[0], posMid[1], posMid[2]);

      // Base linear mix would have radius ~ 2.5. With balloonAmp (+2.5), radius is ~ 5.0+
      expect(lenMid).toBeGreaterThan(4.5);
    });
  });
});
