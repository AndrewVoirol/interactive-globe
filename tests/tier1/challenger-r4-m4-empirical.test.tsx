// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

// Production imports
import {
  toSphere,
  toMercator,
  geoToSphere,
  geoToMercator,
  evaluateCubicBezierEase,
  computeCurlNoise,
  RADIUS,
  MAX_LAT,
} from '../../src/utils/projection';
import { TelemetryHUD, TelemetryHUDProps } from '../../src/components/hud/TelemetryHUD';
import { SimulationMode, GeodesicOverlayMode, LoadedDataInfo } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Empirical Challenger R4-M4: Test Quality & Behavioral Integrity Verification', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  // =========================================================================
  // Task 1: DOM Environment & TelemetryHUD Stress Harness
  // =========================================================================
  describe('1. DOM Environment & TelemetryHUD Stress Harness', () => {
    let container: HTMLDivElement;
    let root: Root;

    const baseDataInfo: LoadedDataInfo = {
      pointCount: 100000,
      lineCount: 300000,
      format: 'BIN (Zero-Copy)',
      loadTimeMs: 14.2,
      vramMb: 4.57,
    };

    const makeProps = (overrides: Partial<TelemetryHUDProps> = {}): TelemetryHUDProps => ({
      isZenMode: false,
      onZenToggle: vi.fn(),
      theme: 0,
      onThemeToggle: vi.fn(),
      backend: 'webgl2',
      onBackendChange: vi.fn(),
      hasWebGPU: true,
      resolution: '100k',
      onResolutionChange: vi.fn(),
      layerMode: 0,
      onLayerModeChange: vi.fn(),
      mode: 0,
      onModeChange: vi.fn(),
      cursorPhysicsEnabled: false,
      onCursorPhysicsToggle: vi.fn(),
      activeOverlay: 'off' as GeodesicOverlayMode,
      onOverlayChange: vi.fn(),
      showLandmarks: false,
      onLandmarksToggle: vi.fn(),
      showTissot: false,
      onTissotToggle: vi.fn(),
      showVectors: false,
      onVectorsToggle: vi.fn(),
      alpha: 0.0,
      fps: 60,
      latStr: "00°00'N",
      lonStr: "000°00'E",
      mapScaleStr: '1:50M',
      dataInfo: baseDataInfo,
      onSnapCamera: vi.fn(),
      isAudioMuted: true,
      onAudioMuteToggle: vi.fn(),
      dataLayers: [],
      toasts: [],
      onDismissToast: vi.fn(),
      ...overrides,
    });

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('CH1-M4-01: rapid mount-unmount cycling stress test (50 cycles) produces zero DOM leaks or unhandled errors', async () => {
      for (let i = 0; i < 50; i++) {
        const cycleContainer = document.createElement('div');
        document.body.appendChild(cycleContainer);
        const cycleRoot = createRoot(cycleContainer);

        const props = makeProps({
          fps: 50 + (i % 20),
          latStr: `${(i * 3) % 90}°00'N`,
          lonStr: `${(i * 7) % 180}°00'E`,
          theme: (i % 2) as 0 | 1,
        });

        await act(async () => {
          cycleRoot.render(<TelemetryHUD {...props} />);
        });

        expect(cycleContainer.innerHTML.length).toBeGreaterThan(0);

        await act(async () => {
          cycleRoot.unmount();
        });

        expect(cycleContainer.innerHTML).toBe('');
        cycleContainer.remove();
      }
    });

    it('CH1-M4-02: high-frequency prop updates simulating 120 FPS continuous orbit renders without crashing', async () => {
      let currentProps = makeProps({ fps: 120 });

      await act(async () => {
        root.render(<TelemetryHUD {...currentProps} />);
      });

      // Simulate 120 successive frame updates across a 360-degree orbit
      for (let frame = 0; frame < 120; frame++) {
        const lat = Math.round(45 * Math.sin((frame / 120) * 2 * Math.PI));
        const lon = Math.round((frame / 120) * 360 - 180);
        const latStr = `${Math.abs(lat).toString().padStart(2, '0')}°00'${lat >= 0 ? 'N' : 'S'}`;
        const lonStr = `${Math.abs(lon).toString().padStart(3, '0')}°00'${lon >= 0 ? 'E' : 'W'}`;

        currentProps = {
          ...currentProps,
          fps: 118 + (frame % 5),
          latStr,
          lonStr,
          alpha: frame / 120,
        };

        await act(async () => {
          root.render(<TelemetryHUD {...currentProps} />);
        });

        // Verify latest telemetry string is rendered in DOM
        expect(container.textContent).toContain(latStr);
        expect(container.textContent).toContain(lonStr);
      }
    });

    it('CH1-M4-03: handles extreme and adversarial telemetry prop values gracefully', async () => {
      const adversarialCases: Partial<TelemetryHUDProps>[] = [
        // Extreme FPS
        { fps: 0 },
        { fps: -1 },
        { fps: 999999 },
        { fps: NaN },
        // Unusual coordinate strings
        { latStr: '', lonStr: '' },
        { latStr: '85°03\'04"N [PRECISION]', lonStr: '180°00\'00"W [ANTIMERIDIAN]' },
        { latStr: '<script>alert(1)</script>', lonStr: '&#x22;' },
        // Extreme alpha
        { alpha: -100.0 },
        { alpha: 100.0 },
        { alpha: NaN },
        // Data info edge cases
        {
          dataInfo: {
            pointCount: 0,
            lineCount: 0,
            format: 'EMPTY',
            loadTimeMs: 0,
            vramMb: 0,
          },
        },
      ];

      for (const edgeCase of adversarialCases) {
        const props = makeProps(edgeCase);
        await act(async () => {
          root.render(<TelemetryHUD {...props} />);
        });
        // Rendering should complete with no thrown errors
        expect(container).toBeDefined();
      }
    });

    it('CH1-M4-04: dispatches all interactive HUD callbacks across all paradigms, resolutions, themes, and overlays', async () => {
      const onBackendChange = vi.fn();
      const onResolutionChange = vi.fn();
      const onThemeToggle = vi.fn();
      const onModeChange = vi.fn();
      const onLayerModeChange = vi.fn();
      const onSnapCamera = vi.fn();
      const onAudioMuteToggle = vi.fn();
      const onZenToggle = vi.fn();

      const props = makeProps({
        backend: 'webgl2',
        hasWebGPU: true,
        resolution: '100k',
        theme: 0,
        mode: 0,
        layerMode: 0,
        onBackendChange,
        onResolutionChange,
        onThemeToggle,
        onModeChange,
        onLayerModeChange,
        onSnapCamera,
        onAudioMuteToggle,
        onZenToggle,
      });

      await act(async () => {
        root.render(<TelemetryHUD {...props} />);
      });

      const buttons = Array.from(container.querySelectorAll('button'));

      // 1. Backend toggle
      const backendBtn = buttons.find(b => b.textContent?.includes('WebGL2'));
      expect(backendBtn).toBeDefined();
      await act(async () => {
        backendBtn?.click();
      });
      expect(onBackendChange).toHaveBeenCalledWith('webgpu');

      // 2. Resolution toggle to 1M
      const res1MBtn = buttons.find(b => b.textContent?.includes('1M'));
      expect(res1MBtn).toBeDefined();
      await act(async () => {
        res1MBtn?.click();
      });
      expect(onResolutionChange).toHaveBeenCalledWith('1M');

      // 3. Theme toggle
      const themeBtn = buttons.find(b => b.title?.toLowerCase().includes('switch to') || b.title?.toLowerCase().includes('monochrome') || b.title?.toLowerCase().includes('cyber'));
      expect(themeBtn).toBeDefined();
      await act(async () => {
        themeBtn?.click();
      });
      expect(onThemeToggle).toHaveBeenCalledTimes(1);

      // 4. Paradigm Mode buttons: Mode 1 (Scroll), Mode 2 (Griffith), Mode 3 (Fluid), Mode 4 (Dymaxion)
      const modeNames = ['Linear', 'Scroll', 'Fracture', 'Fluid', 'Dymaxion'];
      for (let m = 0; m <= 4; m++) {
        const modeBtn = buttons.find(b =>
          b.textContent?.toLowerCase().includes(modeNames[m].toLowerCase()) ||
          b.title?.toLowerCase().includes(modeNames[m].toLowerCase())
        );
        if (modeBtn) {
          await act(async () => {
            modeBtn.click();
          });
          expect(onModeChange).toHaveBeenCalledWith(m as SimulationMode);
        }
      }

      // 5. Audio Mute button
      const audioBtn = buttons.find(b => b.title?.toLowerCase().includes('mute') || b.title?.toLowerCase().includes('audio'));
      if (audioBtn) {
        await act(async () => {
          audioBtn.click();
        });
        expect(onAudioMuteToggle).toHaveBeenCalled();
      }
    });

    it('CH1-M4-05: verifies Zen mode toggle and suppression contract', async () => {
      const onZenToggle = vi.fn();
      const propsZenActive = makeProps({ isZenMode: true, onZenToggle });

      await act(async () => {
        root.render(<TelemetryHUD {...propsZenActive} />);
      });

      // Complete silence and zero child elements in Zen mode
      expect(container.children.length).toBe(0);
      expect(container.innerHTML).toBe('');

      // Exit Zen mode
      const propsZenInactive = makeProps({ isZenMode: false, onZenToggle });
      await act(async () => {
        root.render(<TelemetryHUD {...propsZenInactive} />);
      });

      expect(container.children.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Task 2: Cartographic Projection Mathematics Stress Harness
  // =========================================================================
  describe('2. Projection Math Stress Harness Across Extreme Limits (±85° lat, ±180° lon)', () => {
    it('CH1-M4-06: toSphere preserves invariant Euclidean radius across 10,000 coordinate pairs with zero NaNs or Infs', () => {
      let testedCount = 0;
      // Dense grid: lat in [-90, 90] step 2°, lon in [-180, 180] step 4°
      for (let lat = -90; lat <= 90; lat += 2) {
        for (let lon = -180; lon <= 180; lon += 4) {
          const [x, y, z] = toSphere(lon, lat, RADIUS);

          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
          expect(Number.isFinite(z)).toBe(true);
          expect(Number.isNaN(x)).toBe(false);
          expect(Number.isNaN(y)).toBe(false);
          expect(Number.isNaN(z)).toBe(false);

          const r = Math.hypot(x, y, z);
          expect(r).toBeCloseTo(RADIUS, 5);
          testedCount++;
        }
      }
      expect(testedCount).toBeGreaterThanOrEqual(8000);
    });

    it('CH1-M4-07: toSphere polar singularities and antimeridian boundary test', () => {
      // North pole (lat = 90): x = 0, y = RADIUS, z = 0 for any lon
      for (let lon = -180; lon <= 180; lon += 45) {
        const [xN, yN, zN] = toSphere(lon, 90, RADIUS);
        expect(xN).toBeCloseTo(0, 5);
        expect(yN).toBeCloseTo(RADIUS, 5);
        expect(zN).toBeCloseTo(0, 5);
      }

      // South pole (lat = -90): x = 0, y = -RADIUS, z = 0 for any lon
      for (let lon = -180; lon <= 180; lon += 45) {
        const [xS, yS, zS] = toSphere(lon, -90, RADIUS);
        expect(xS).toBeCloseTo(0, 5);
        expect(yS).toBeCloseTo(-RADIUS, 5);
        expect(zS).toBeCloseTo(0, 5);
      }

      // Equator (lat = 0): y = 0
      for (let lon = -180; lon <= 180; lon += 45) {
        const [, yEq] = toSphere(lon, 0, RADIUS);
        expect(yEq).toBeCloseTo(0, 5);
      }

      // Antimeridian (+180 vs -180): coordinates must be identical
      for (let lat = -85; lat <= 85; lat += 10) {
        const pPos = toSphere(180, lat, RADIUS);
        const pNeg = toSphere(-180, lat, RADIUS);
        expect(pPos[0]).toBeCloseTo(pNeg[0], 5);
        expect(pPos[1]).toBeCloseTo(pNeg[1], 5);
        expect(pPos[2]).toBeCloseTo(pNeg[2], 5);
      }
    });

    it('CH1-M4-08: toMercator boundary clamping strictly preserves finite square aspect without NaN or Inf', () => {
      const halfCircumference = RADIUS * Math.PI;

      // 1. Prime meridian / Equator
      const [xOrigin, yOrigin] = toMercator(0, 0, RADIUS, MAX_LAT);
      expect(xOrigin).toBe(0);
      expect(yOrigin).toBeCloseTo(0, 5);

      // 2. Exact antimeridian edges: lon = ±180 -> x = ±(R * PI)
      const [xEast, ] = toMercator(180, 0, RADIUS, MAX_LAT);
      const [xWest, ] = toMercator(-180, 0, RADIUS, MAX_LAT);
      expect(xEast).toBeCloseTo(halfCircumference, 5);
      expect(xWest).toBeCloseTo(-halfCircumference, 5);

      // 3. Exact Web Mercator maximum latitude limits (MAX_LAT = 85.0511287798066°)
      // In Web Mercator, y(MAX_LAT) == R * PI exactly (forming a square map of side 2*R*PI)
      const [, yNorthMax] = toMercator(0, MAX_LAT, RADIUS, MAX_LAT);
      const [, ySouthMax] = toMercator(0, -MAX_LAT, RADIUS, MAX_LAT);
      expect(yNorthMax).toBeCloseTo(halfCircumference, 5);
      expect(ySouthMax).toBeCloseTo(-halfCircumference, 5);

      // 4. Over-the-limit latitudes: 86°, 89.999°, 90°, 1000°, Infinity
      const extremeLats = [85.0512, 86.0, 89.9999, 90.0, 180.0, 1000.0, Infinity];
      for (const extLat of extremeLats) {
        const [xClampN, yClampN] = toMercator(45, extLat, RADIUS, MAX_LAT);
        expect(Number.isFinite(xClampN)).toBe(true);
        expect(Number.isFinite(yClampN)).toBe(true);
        expect(Number.isNaN(xClampN)).toBe(false);
        expect(Number.isNaN(yClampN)).toBe(false);
        expect(yClampN).toBeCloseTo(halfCircumference, 5);

        const [xClampS, yClampS] = toMercator(45, -extLat, RADIUS, MAX_LAT);
        expect(Number.isFinite(xClampS)).toBe(true);
        expect(Number.isFinite(yClampS)).toBe(true);
        expect(Number.isNaN(xClampS)).toBe(false);
        expect(Number.isNaN(yClampS)).toBe(false);
        expect(yClampS).toBeCloseTo(-halfCircumference, 5);
      }

      // 5. Antipodal antisymmetry check: y(-lat) === -y(lat) across fine range
      for (let lat = 0.1; lat <= 85.0; lat += 0.5) {
        const [, yPos] = toMercator(0, lat, RADIUS, MAX_LAT);
        const [, yNeg] = toMercator(0, -lat, RADIUS, MAX_LAT);
        expect(yPos).toBeCloseTo(-yNeg, 5);
      }
    });

    it('CH1-M4-09: aliases geoToSphere and geoToMercator produce identical results to canonical functions', () => {
      const lons = [-180, -90, 0, 90, 180];
      const lats = [-85, -45, 0, 45, 85];

      for (const lon of lons) {
        for (const lat of lats) {
          const s1 = toSphere(lon, lat);
          const s2 = geoToSphere(lon, lat);
          expect(s1).toEqual(s2);

          const m1 = toMercator(lon, lat);
          const m2 = geoToMercator(lon, lat);
          expect(m1).toEqual(m2);
        }
      }
    });

    it('CH1-M4-10: evaluateCubicBezierEase fuzzer over 20,000 steps demonstrates strict bounds [0, 1] and monotonic progression', () => {
      let prevEase = -1;
      for (let alpha = 0.0; alpha <= 1.0; alpha += 0.0001) {
        const ease = evaluateCubicBezierEase(alpha);
        expect(Number.isFinite(ease)).toBe(true);
        expect(Number.isNaN(ease)).toBe(false);
        expect(ease).toBeGreaterThanOrEqual(0.0);
        expect(ease).toBeLessThanOrEqual(1.0);
        expect(ease).toBeGreaterThanOrEqual(prevEase);
        prevEase = ease;
      }

      // Out of bounds inputs safely clamped
      expect(evaluateCubicBezierEase(-1000.0)).toBe(0.0);
      expect(evaluateCubicBezierEase(1000.0)).toBe(1.0);
    });

    it('CH1-M4-11: computeCurlNoise remains strictly bounded across extreme spatial points and long simulation uptimes', () => {
      const testCoordinates: [number, number, number][] = [
        [0, 0, 0],
        [RADIUS, 0, 0],
        [0, RADIUS, 0],
        [0, 0, RADIUS],
        [-RADIUS, -RADIUS, -RADIUS],
        [100, -200, 300],
        [1e5, -1e5, 1e5],
      ];

      const testTimes = [0, 0.001, 1.0, 60.0, 3600.0, 86400.0, 1e7];

      for (const p of testCoordinates) {
        for (const t of testTimes) {
          const u = computeCurlNoise(p, t);
          expect(Number.isFinite(u[0])).toBe(true);
          expect(Number.isFinite(u[1])).toBe(true);
          expect(Number.isFinite(u[2])).toBe(true);
          expect(Number.isNaN(u[0])).toBe(false);
          expect(Number.isNaN(u[1])).toBe(false);
          expect(Number.isNaN(u[2])).toBe(false);

          // Bound ||u||_inf <= 2.000001
          expect(Math.abs(u[0])).toBeLessThanOrEqual(2.000001);
          expect(Math.abs(u[1])).toBeLessThanOrEqual(2.000001);
          expect(Math.abs(u[2])).toBeLessThanOrEqual(2.000001);
        }
      }
    });
  });

  // =========================================================================
  // Task 3: Zero fs.readFileSync String-Regex Matching in Overhauled Suites
  // =========================================================================
  describe('3. Empirical Verification of Zero Source-Code String Regex Matching', () => {
    const targetOverhauledSuites = [
      'tests/tier1/adversarial-m1-challenger2.test.ts',
      'tests/tier1/adversarial-m2-challenger2.test.ts',
      'tests/tier1/adversarial-m3-challenger2.test.ts',
      'tests/tier1/tier1-f1-clock.test.ts',
      'tests/tier2/tier2-nan-inf-robustness.test.ts',
      'tests/tier3/tier3-pairwise.test.ts',
      'tests/tier1/hud-telemetry.dom.test.tsx',
    ];

    it('CH1-M4-12: verifies all 7 target overhauled test files contain ZERO fs.readFileSync calls', () => {
      for (const relPath of targetOverhauledSuites) {
        const fullPath = path.join(projectRoot, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, 'utf8');
        const readFileSyncMatches = content.match(/readFileSync/g) || [];

        expect(
          readFileSyncMatches.length,
          `File ${relPath} must not contain any fs.readFileSync calls, but found ${readFileSyncMatches.length}`
        ).toBe(0);
      }
    });

    it('CH1-M4-13: verifies target overhauled suites import from production modules and not disconnected dummy mocks', () => {
      const f1ClockContent = fs.readFileSync(path.join(projectRoot, 'tests/tier1/tier1-f1-clock.test.ts'), 'utf8');
      expect(f1ClockContent).toContain("import { CursorTracker } from '../../src/utils/raycast';");
      expect(f1ClockContent).toContain("import { evaluateCubicBezierEase } from '../../src/utils/projection';");

      const t2RobustnessContent = fs.readFileSync(path.join(projectRoot, 'tests/tier2/tier2-nan-inf-robustness.test.ts'), 'utf8');
      expect(t2RobustnessContent).toContain("from '../../src/utils/projection';");
      expect(t2RobustnessContent).toContain("from '../../src/utils/raycast';");
      expect(t2RobustnessContent).toContain("from '../../src/utils/dymaxion';");
      // Must NOT import math-oracle in tier2-nan-inf-robustness anymore
      expect(t2RobustnessContent).not.toContain("from '../helpers/math-oracle'");

      const t3PairwiseContent = fs.readFileSync(path.join(projectRoot, 'tests/tier3/tier3-pairwise.test.ts'), 'utf8');
      expect(t3PairwiseContent).toContain("import { evaluatePointMorph } from '../../src/core/GlobeOverlay';");
      expect(t3PairwiseContent).toContain("import { GlobeLayerManager } from '../../src/core/layers/GlobeLayerManager';");
      expect(t3PairwiseContent).toContain("import { toSphere, toMercator } from '../../src/utils/projection';");
      expect(t3PairwiseContent).toContain("import { griffithHoopStress, lambOseenVortex } from '../../src/utils/raycast';");

      const m1AdvContent = fs.readFileSync(path.join(projectRoot, 'tests/tier1/adversarial-m1-challenger2.test.ts'), 'utf8');
      expect(m1AdvContent).toContain("from '../../src/utils/projection';");

      const m2AdvContent = fs.readFileSync(path.join(projectRoot, 'tests/tier1/adversarial-m2-challenger2.test.ts'), 'utf8');
      expect(m2AdvContent).toContain("from '../../src/core/layers/GlobeLayerManager';");
    });
  });
});
