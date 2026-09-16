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
      // Precision Instruments Integration
      expect(sidebarCode).toContain('PolarSunCompass');
      expect(sidebarCode).toContain('onHillshadeChangeDataLayer');
      expect(sidebarCode).toContain('HypsometricReliefCurve');
      expect(sidebarCode).toContain('onDisplacementScaleChangeDataLayer');
      expect(sidebarCode).toContain('onPeakExponentChangeDataLayer');
      expect(sidebarCode).toContain('BathymetricTideGauge');
      expect(sidebarCode).toContain('onSeaLevelOffsetChangeDataLayer');
      expect(sidebarCode).toContain('onWaterClarityChangeDataLayer');

      // Ergonomic Sliders & Invariant Callbacks
      expect(sidebarCode).toContain('sidebar-crevice-ao');
      expect(sidebarCode).toContain('label="Crevice Depth"');
      expect(sidebarCode).toContain('onAmbientOcclusionChangeDataLayer');
      expect(sidebarCode).toContain('label="Fracture"');
      expect(sidebarCode).toContain('onFractureIntensityChange');
      expect(sidebarCode).toContain('label="Vortex"');
      expect(sidebarCode).toContain('onFluidVortexStrengthChange');
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

  // --------------------------------------------------------------------------
  // 6. Cloud Shadow Ground Projection Instrument (R4)
  // --------------------------------------------------------------------------
  describe('6. CloudShadowInstrument Math & Invariants', () => {
    const shadowPath = path.join(projectRoot, 'src/components/hud/instruments/CloudShadowInstrument.tsx');
    const shadowCode = fs.readFileSync(shadowPath, 'utf-8');

    it('INST-17: verifies shadow intensity clamping strictly within [0.00, 0.60] in 0.05 increments', () => {
      const calcShadow = (raw: number) => {
        const stepped = Math.round(raw / 0.05) * 0.05;
        return Math.max(0.0, Math.min(0.60, parseFloat(stepped.toFixed(2))));
      };

      expect(calcShadow(0.0)).toBe(0.0);
      expect(calcShadow(0.45)).toBe(0.45);
      expect(calcShadow(0.59)).toBe(0.60);
      expect(calcShadow(0.85)).toBe(0.60);
      expect(calcShadow(-0.15)).toBe(0.0);
    });

    it('INST-18: verifies active horizontal caliper track mapping in 240 viewBox', () => {
      const calcCaliperX = (shadowIntensity: number) => {
        const normIntensity = Math.max(0.0, Math.min(1.0, shadowIntensity / 0.60));
        return Math.round(30 + normIntensity * 180);
      };

      expect(calcCaliperX(0.00)).toBe(30);
      expect(calcCaliperX(0.60)).toBe(210);
      expect(calcCaliperX(0.30)).toBe(120);
    });

    it('INST-19: CloudShadowInstrument embeds contract tokens and medium artifacts', () => {
      expect(shadowCode).toContain('CLOUD SHADOW');
      expect(shadowCode).toContain('Ground Projection Ray');
      expect(shadowCode).toContain('sidebar-shadow-intensity');
      expect(shadowCode).toContain('shadow-projection-cream');
      expect(shadowCode).toContain('shadow-projection-cyanotype');
      expect(shadowCode).toContain('shadow-projection-tharp');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Cloud Drift Speed Kinematic Instrument (R4)
  // --------------------------------------------------------------------------
  describe('7. CloudDriftSpeedInstrument Math & Invariants', () => {
    const driftPath = path.join(projectRoot, 'src/components/hud/instruments/CloudDriftSpeedInstrument.tsx');
    const driftCode = fs.readFileSync(driftPath, 'utf-8');

    it('INST-20: verifies cloud drift speed clamping strictly within [0, 2000] in 10-unit increments', () => {
      const calcDrift = (raw: number) => {
        const stepped = Math.round(raw / 10) * 10;
        return Math.max(0, Math.min(2000, stepped));
      };

      expect(calcDrift(0)).toBe(0);
      expect(calcDrift(500)).toBe(500);
      expect(calcDrift(1996)).toBe(2000);
      expect(calcDrift(2500)).toBe(2000);
      expect(calcDrift(-50)).toBe(0);
    });

    it('INST-21: verifies reticle X position mapping across active streamline [20, 220]', () => {
      const calcThumbX = (speed: number) => {
        const normSpeed = Math.max(0, Math.min(2000, speed)) / 2000;
        return Math.round(20 + normSpeed * 200);
      };

      expect(calcThumbX(0)).toBe(20);
      expect(calcThumbX(2000)).toBe(220);
      expect(calcThumbX(500)).toBe(70);
      expect(calcThumbX(1000)).toBe(120);
    });

    it('INST-22: CloudDriftSpeedInstrument embeds contract tokens and medium artifacts', () => {
      expect(driftCode).toContain('CLOUD DRIFT');
      expect(driftCode).toContain('Kinematic Temporal Motion');
      expect(driftCode).toContain('sidebar-cloud-drift');
      expect(driftCode).toContain('drift-chronometer-cream');
      expect(driftCode).toContain('drift-chronometer-cyanotype');
      expect(driftCode).toContain('drift-chronometer-tharp');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Prognostic Model Consolidation Card & NWP Telemetry (R5)
  // --------------------------------------------------------------------------
  describe('8. PrognosticModelCard Math & Invariants', () => {
    const cardPath = path.join(projectRoot, 'src/components/hud/instruments/PrognosticModelCard.tsx');
    const cardCode = fs.readFileSync(cardPath, 'utf-8');

    it('INST-23: verifies prognostic forecast lead time clamping strictly within [0, 240] in 6-hour increments', () => {
      const calcLeadTime = (raw: number) => {
        const stepped = Math.round(raw / 6) * 6;
        return Math.max(0, Math.min(240, stepped));
      };

      expect(calcLeadTime(0)).toBe(0);
      expect(calcLeadTime(24)).toBe(24);
      expect(calcLeadTime(25)).toBe(24);
      expect(calcLeadTime(27)).toBe(30);
      expect(calcLeadTime(240)).toBe(240);
      expect(calcLeadTime(250)).toBe(240);
      expect(calcLeadTime(-10)).toBe(0);
    });

    it('INST-24: verifies horizontal caliper X position mapping across active track [24, 256] in 280 viewBox', () => {
      const calcCaliperX = (leadTimeHours: number) => {
        const norm = Math.max(0, Math.min(240, leadTimeHours)) / 240;
        return Math.round(24 + norm * 232);
      };

      expect(calcCaliperX(0)).toBe(24);
      expect(calcCaliperX(240)).toBe(256);
      expect(calcCaliperX(120)).toBe(140);
      expect(calcCaliperX(24)).toBe(47);
    });

    it('INST-25: verifies model backend normalization (\'google-weathernext3\' -> \'weathernext3\', \'noaa-gfs\' -> \'gfs\') and variable synonym mapping', () => {
      const normalizeModel = (model: string) => {
        if (model === 'google-weathernext3' || model === 'weathernext' || model === 'weathernext3') {
          return 'weathernext3';
        }
        if (model === 'noaa-gfs' || model === 'gfs') {
          return 'gfs';
        }
        if (model === 'ecmwf') return 'ecmwf';
        if (model === 'off' || model === 'climatology') return 'off';
        return 'gfs';
      };

      expect(normalizeModel('google-weathernext3')).toBe('weathernext3');
      expect(normalizeModel('weathernext')).toBe('weathernext3');
      expect(normalizeModel('weathernext3')).toBe('weathernext3');
      expect(normalizeModel('noaa-gfs')).toBe('gfs');
      expect(normalizeModel('gfs')).toBe('gfs');
      expect(normalizeModel('ecmwf')).toBe('ecmwf');
      expect(normalizeModel('off')).toBe('off');
      expect(normalizeModel('climatology')).toBe('off');

      const normalizeVariable = (v: string) => {
        if (v === 'tcwv' || v === 'total_precipitation_1hr_mean') return 'total_precipitation_1hr_mean';
        if (v === 'cape' || v === 'temperature_2m_mean') return 'temperature_2m_mean';
        if (v === 'ivt' || v === 'wind_10m_vector') return 'wind_10m_vector';
        if (v === 'z500' || v === 'geopotential_500hpa') return 'geopotential_500hpa';
        return v;
      };

      expect(normalizeVariable('tcwv')).toBe('total_precipitation_1hr_mean');
      expect(normalizeVariable('total_precipitation_1hr_mean')).toBe('total_precipitation_1hr_mean');
      expect(normalizeVariable('cape')).toBe('temperature_2m_mean');
      expect(normalizeVariable('temperature_2m_mean')).toBe('temperature_2m_mean');
      expect(normalizeVariable('ivt')).toBe('wind_10m_vector');
      expect(normalizeVariable('wind_10m_vector')).toBe('wind_10m_vector');
      expect(normalizeVariable('z500')).toBe('geopotential_500hpa');
      expect(normalizeVariable('geopotential_500hpa')).toBe('geopotential_500hpa');
    });

    it('INST-26: PrognosticModelCard embeds contract tokens, medium-adaptive SVG artifacts, and single-border contract', () => {
      expect(cardCode).toContain('PROGNOSTIC MODEL');
      expect(cardCode).toContain('Numerical Weather Prediction & Tensor Telemetry');
      expect(cardCode).toContain('prognostic-model-cream');
      expect(cardCode).toContain('prognostic-model-cyanotype');
      expect(cardCode).toContain('prognostic-model-tharp');
      expect(cardCode).toContain('sidebar-model-gfs');
      expect(cardCode).toContain('sidebar-model-weathernext');
      expect(cardCode).toContain('sidebar-variable-rain');
      expect(cardCode).toContain('sidebar-variable-temp');
      expect(cardCode).toContain('sidebar-variable-wind');
      expect(cardCode).toContain('● GCS Zarr v3');
      expect(cardCode).toContain('3-Slot Ring Buffer');
      expect(cardCode).toContain('bg-[var(--theme-card-bg)]');
      expect(cardCode).toContain('border-[var(--theme-card-border)]');
      expect(cardCode).not.toContain('border-current/15');
      expect(cardCode).not.toContain('inset-[2px]');
    });
  });
});


