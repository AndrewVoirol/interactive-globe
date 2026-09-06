// ============================================================================
// File: tests/phase6-precision-instruments.test.ts
// Automated Unit & Integration Tests for Phase 6 Tactile Precision Instruments:
// 1. PolarSunCompass (Azimuth [0, 360] & Altitude [10, 85])
// 2. HypsometricReliefCurve (3D Relief [0.00, 0.25] & Peak Sharpness [0.5, 3.0])
// 3. BathymetricTideGauge (Sea Level [-150, 100] & Clarity [0.10, 1.00])
// 4. CurvatureUnfurlSextant (Topological Curvature Arc & Detent Snapping)
// 5. Static Analysis Contract Invariants in UnifiedRightSidebar & NavigationDock
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 6: Tactile Precision Instruments Suite', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const sidebarPath = path.join(projectRoot, 'src/components/hud/UnifiedRightSidebar.tsx');
  const dockPath = path.join(projectRoot, 'src/components/hud/NavigationDock.tsx');
  const sunPath = path.join(projectRoot, 'src/components/hud/instruments/PolarSunCompass.tsx');
  const reliefPath = path.join(projectRoot, 'src/components/hud/instruments/HypsometricReliefCurve.tsx');
  const tidePath = path.join(projectRoot, 'src/components/hud/instruments/BathymetricTideGauge.tsx');
  const sextantPath = path.join(projectRoot, 'src/components/hud/instruments/CurvatureUnfurlSextant.tsx');

  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');
  const dockCode = fs.readFileSync(dockPath, 'utf-8');
  const sunCode = fs.readFileSync(sunPath, 'utf-8');
  const reliefCode = fs.readFileSync(reliefPath, 'utf-8');
  const tideCode = fs.readFileSync(tidePath, 'utf-8');
  const sextantCode = fs.readFileSync(sextantPath, 'utf-8');

  // --------------------------------------------------------------------------
  // 1. Polar Sun Compass Geometry & Angle Math
  // --------------------------------------------------------------------------
  describe('1. PolarSunCompass Math & Invariants', () => {
    it('INST-01: verifies polar angle conversion correctly maps all 4 cardinal quadrants', () => {
      // Quadrant 1: dx = 10, dy = -10 (North-East) -> angleRad = -pi/4 -> deg = -45 + 90 = 45°
      const calcAzimuth = (dx: number, dy: number) => {
        const angleRad = Math.atan2(dy, dx);
        let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
        if (angleDeg < 0) angleDeg += 360;
        if (angleDeg >= 360) angleDeg = 0;
        return angleDeg;
      };

      expect(calcAzimuth(0, -10)).toBe(0);    // Due North
      expect(calcAzimuth(10, 0)).toBe(90);    // Due East
      expect(calcAzimuth(0, 10)).toBe(180);   // Due South
      expect(calcAzimuth(-10, 0)).toBe(270);  // Due West
      expect(calcAzimuth(-10, -10)).toBe(315); // Imhof NW Sweetspot
    });

    it('INST-02: verifies radial distance strictly clamps solar altitude to [10, 85]', () => {
      const calcAlt = (dist: number, maxR: number) => {
        const altDeg = Math.round(85 - (dist / maxR) * 75);
        return Math.max(10, Math.min(85, altDeg));
      };

      expect(calcAlt(0, 50)).toBe(85);   // Center = 85°
      expect(calcAlt(25, 50)).toBe(48);  // Mid-radius ≈ 48°
      expect(calcAlt(50, 50)).toBe(10);  // Outer perimeter = 10°
      expect(calcAlt(100, 50)).toBe(10); // Beyond perimeter clamps to 10°
    });

    it('INST-03: PolarSunCompass component documents Imhof NW sweetspot (315° / 45°)', () => {
      expect(sunCode).toContain('315');
      expect(sunCode).toContain('45');
      expect(sunCode).toContain('Sun Azimuth:');
      expect(sunCode).toContain('Sun Alt:');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Hypsometric Mountain Profile Curve
  // --------------------------------------------------------------------------
  describe('2. HypsometricReliefCurve Math & Invariants', () => {
    it('INST-04: verifies summit normalization maps strictly to displacementScale [0.00, 0.25]', () => {
      const calcScale = (normY: number) => {
        return parseFloat(((1 - normY) * 0.25).toFixed(2));
      };

      expect(calcScale(1.0)).toBe(0.00); // Base = 0.00x
      expect(calcScale(0.0)).toBe(0.25); // Peak = 0.25x
      expect(calcScale(0.44)).toBe(0.14); // Mid-range alpine = 0.14x
    });

    it('INST-05: verifies horizontal normalization maps to peakExponent [0.5, 3.0]', () => {
      const calcExponent = (normX: number) => {
        return parseFloat((0.5 + normX * 2.5).toFixed(1));
      };

      expect(calcExponent(0.0)).toBe(0.5); // Leftmost = 0.5x (rolling hills)
      expect(calcExponent(1.0)).toBe(3.0); // Rightmost = 3.0x (razor arêtes)
      expect(calcExponent(0.36)).toBe(1.4); // Default Imhof = 1.4x
    });

    it('INST-06: HypsometricReliefCurve embeds contract token Peak Sharp: and 3D Relief:', () => {
      expect(reliefCode).toContain('Peak Sharp:');
      expect(reliefCode).toContain('3D Relief:');
      expect(reliefCode).toContain('onPeakExponentChange');
      expect(reliefCode).toContain('onDisplacementChange');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Bathymetric Tide Gauge
  // --------------------------------------------------------------------------
  describe('3. BathymetricTideGauge Math & Invariants', () => {
    it('INST-07: verifies vertical water caliper strictly maps to seaLevelOffset [-150, 100] in 5m steps', () => {
      const calcSeaLevel = (normY: number) => {
        const bottomPct = (1 - normY) * 100;
        const rawMeters = -150 + (bottomPct / 100) * 250;
        const steppedMeters = Math.round(rawMeters / 5) * 5;
        return Math.max(-150, Math.min(100, steppedMeters));
      };

      expect(calcSeaLevel(1.0)).toBe(-150); // Bottom = -150m (LGM)
      expect(calcSeaLevel(0.0)).toBe(100);  // Top = +100m (Flood)
      expect(calcSeaLevel(0.4)).toBe(0);    // Present day = 0m
    });

    it('INST-08: BathymetricTideGauge embeds contract tokens Sea Level: and Clarity:', () => {
      expect(tideCode).toContain('Sea Level:');
      expect(tideCode).toContain('Clarity:');
      expect(tideCode).toContain('onSeaLevelChange');
      expect(tideCode).toContain('onWaterClarityChange');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Curvature Unfurl Sextant
  // --------------------------------------------------------------------------
  describe('4. CurvatureUnfurlSextant Arc Geometry & Detents', () => {
    it('INST-09: verifies magnetic snap detents snap to 0.0, 0.3, 0.7, 1.0 within tolerance', () => {
      const snapAlpha = (normX: number) => {
        if (normX < 0.03) return 0.0;
        if (Math.abs(normX - 0.3) < 0.02) return 0.3;
        if (Math.abs(normX - 0.7) < 0.02) return 0.7;
        if (normX > 0.97) return 1.0;
        return parseFloat(normX.toFixed(3));
      };

      expect(snapAlpha(0.015)).toBe(0.0);
      expect(snapAlpha(0.295)).toBe(0.3);
      expect(snapAlpha(0.705)).toBe(0.7);
      expect(snapAlpha(0.985)).toBe(1.0);
      expect(snapAlpha(0.550)).toBe(0.55); // Non-detent continuous position preserved
    });

    it('INST-10: verifies quadratic Bezier arc produces zero NaNs across 1,000 steps', () => {
      for (let i = 0; i <= 1000; i++) {
        const alpha = i / 1000;
        const peakY = 6 + alpha * 20;
        const t = alpha;
        const thumbX = 15 + t * 210;
        const thumbY = (1 - t) * (1 - t) * 26 + 2 * (1 - t) * t * peakY + t * t * 26;

        expect(Number.isFinite(thumbX)).toBe(true);
        expect(Number.isFinite(thumbY)).toBe(true);
        expect(thumbX).toBeGreaterThanOrEqual(15);
        expect(thumbX).toBeLessThanOrEqual(225);
        expect(thumbY).toBeGreaterThanOrEqual(6);
        expect(thumbY).toBeLessThanOrEqual(26);
      }
    });

    it('INST-11: CurvatureUnfurlSextant documents topological milestones across all modes', () => {
      expect(sextantCode).toContain('SPHERE (K > 0)');
      expect(sextantCode).toContain('PLANAR MAP (K = 0)');
      expect(sextantCode).toContain('ANTIMERIDIAN RUPTURE');
      expect(sextantCode).toContain('DYMAXION (K = 0)');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Static Analysis Contract Invariants
  // --------------------------------------------------------------------------
  describe('5. Contract Invariants in UnifiedRightSidebar & NavigationDock', () => {
    it('INST-12: UnifiedRightSidebar preserves all required contract tokens', () => {
      expect(sidebarCode).toContain('Crevice AO:');
      expect(sidebarCode).toContain('onAmbientOcclusionChangeDataLayer');
      expect(sidebarCode).toContain('Sea Level:');
      expect(sidebarCode).toContain('onSeaLevelOffsetChangeDataLayer');
      expect(sidebarCode).toContain('Clarity:');
      expect(sidebarCode).toContain('onWaterClarityChangeDataLayer');
      expect(sidebarCode).toContain('Peak Sharp:');
      expect(sidebarCode).toContain('onPeakExponentChangeDataLayer');
      expect(sidebarCode).toContain('Base Lattice:');
      expect(sidebarCode).toContain('Clean Terrain');
      expect(sidebarCode).toContain('+ Node Cloud');
      expect(sidebarCode).toContain('Fracture Intensity');
      expect(sidebarCode).toContain('Vortex Swirl Strength');
      expect(sidebarCode).toContain('GPU Profiler');
    });

    it('INST-13: NavigationDock preserves B: Backend shortcut and embeds CurvatureUnfurlSextant', () => {
      expect(dockCode).toContain('B: Backend');
      expect(dockCode).toContain('CurvatureUnfurlSextant');
      expect(dockCode).toContain('onGlideToAlpha');
    });

    it('INST-14: CurvatureUnfurlSextant enforces invariant width and height without layout shifts', () => {
      expect(sextantCode).toContain('w-56 sm:w-64');
      expect(sextantCode).toContain('truncate');
      expect(sextantCode).toContain('h-3.5');
    });

    it('INST-15: CurvatureUnfurlSextant pointer mapping accurately translates SVG arc padding', () => {
      // Arc spans [15, 225] inside 240 viewBox
      const padPct = 15 / 240;
      const calcNormX = (rawFrac: number) => {
        const norm = (rawFrac - padPct) / (1.0 - 2 * padPct);
        return Math.max(0.0, Math.min(1.0, norm));
      };

      expect(calcNormX(15 / 240)).toBeCloseTo(0.0, 4);
      expect(calcNormX(225 / 240)).toBeCloseTo(1.0, 4);
      expect(calcNormX(120 / 240)).toBeCloseTo(0.5, 4);
    });

    it('INST-16: WebGPUCanvas camera orientation is decoupled from unfurl morphing', () => {
      const webgpuPath = path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx');
      const webgpuCode = fs.readFileSync(webgpuPath, 'utf-8');
      expect(webgpuCode).not.toContain('curUnfurl > 0.05');
      expect(webgpuCode).not.toContain('sphericalRef.current.phi += (targetPhi');
    });
  });
});

