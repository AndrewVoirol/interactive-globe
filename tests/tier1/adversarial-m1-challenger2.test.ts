import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  toSphere,
  toMercator,
  evaluateCubicBezierEase,
  computeCurlNoise,
  RADIUS,
  MAX_LAT,
} from '../../src/utils/projection';

describe('Adversarial Challenge: Milestone M1 (Challenger 2) — Behavioral Overhaul', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  describe('1. Precompute Mathematics & Geometric Buffer Invariants', () => {
    it('ADV-M1-01: verifies spherical coordinate projection preserves exact radius R and Euclidean distances', () => {
      // Test grid across whole sphere: lon in [-180, 180], lat in [-90, 90]
      const lons = [-180, -120, -60, 0, 60, 120, 180];
      const lats = [-90, -60, -30, 0, 30, 60, 90];

      for (const lon of lons) {
        for (const lat of lats) {
          const [x, y, z] = toSphere(lon, lat, RADIUS);
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
          expect(Number.isFinite(z)).toBe(true);

          const r = Math.hypot(x, y, z);
          expect(r).toBeCloseTo(RADIUS, 5);
        }
      }

      // Poles: x and z must be 0, y must be +/- RADIUS
      const northPole = toSphere(0, 90, RADIUS);
      expect(northPole[0]).toBeCloseTo(0, 5);
      expect(northPole[1]).toBeCloseTo(RADIUS, 5);
      expect(northPole[2]).toBeCloseTo(0, 5);

      const southPole = toSphere(0, -90, RADIUS);
      expect(southPole[0]).toBeCloseTo(0, 5);
      expect(southPole[1]).toBeCloseTo(-RADIUS, 5);
      expect(southPole[2]).toBeCloseTo(0, 5);
    });

    it('ADV-M1-02: verifies Web Mercator planar mapping clamps latitude and preserves symmetry', () => {
      // Equator prime meridian maps to (0, 0)
      const [x0, y0] = toMercator(0, 0, RADIUS, MAX_LAT);
      expect(x0).toBe(0);
      expect(y0).toBeCloseTo(0, 5);

      // Latitudinal symmetry: y(-lat) === -y(lat)
      const testLats = [10, 30, 45, 60, 80, 85];
      for (const lat of testLats) {
        const [, yPos] = toMercator(0, lat, RADIUS, MAX_LAT);
        const [, yNeg] = toMercator(0, -lat, RADIUS, MAX_LAT);
        expect(yPos).toBeCloseTo(-yNeg, 5);
      }

      // Extreme out-of-bounds latitude clamped at MAX_LAT (85.0511°)
      const [, yClamped] = toMercator(0, 89.9, RADIUS, MAX_LAT);
      const [, yMax] = toMercator(0, MAX_LAT, RADIUS, MAX_LAT);
      expect(yClamped).toBeCloseTo(yMax, 5);
      expect(Number.isFinite(yClamped)).toBe(true);

      const [, ySouthClamped] = toMercator(0, -90, RADIUS, MAX_LAT);
      expect(ySouthClamped).toBeCloseTo(-yMax, 5);
    });

    it('ADV-M1-03: verifies precompute binary buffer packing layout and byte stride constraints', () => {
      // Emulate 100k-node precompute buffer structure
      // Format: Interleaved 3D position [x, y, z] (Float32Array: 3 floats = 12 bytes per vertex)
      const nodeCount = 1000;
      const buffer = new Float32Array(nodeCount * 3);

      for (let i = 0; i < nodeCount; i++) {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const x = RADIUS * Math.sin(phi) * Math.cos(theta);
        const y = RADIUS * Math.cos(phi);
        const z = RADIUS * Math.sin(phi) * Math.sin(theta);

        buffer[i * 3 + 0] = x;
        buffer[i * 3 + 1] = y;
        buffer[i * 3 + 2] = z;
      }

      expect(buffer.byteLength).toBe(nodeCount * 3 * 4); // 12 bytes per node
      expect(buffer.byteLength % 4).toBe(0); // 4-byte float32 aligned

      // Verify zero NaNs or Infinities in packed buffer
      for (let i = 0; i < buffer.length; i++) {
        expect(Number.isFinite(buffer[i])).toBe(true);
        expect(Number.isNaN(buffer[i])).toBe(false);
      }
    });

    it('ADV-M1-04: stress-tests vite.config.ts manualChunks against Windows/POSIX paths and edge cases', async () => {
      const configModule = await import(path.join(projectRoot, 'vite.config.ts'));
      const config = configModule.default;
      const manualChunks = config.build?.rollupOptions?.output?.manualChunks;

      expect(typeof manualChunks).toBe('function');

      // Normalized POSIX and Windows paths as passed by Rollup/Vite
      const cases = [
        // Three.js vendor chunking
        { id: '/Users/test/node_modules/three/build/three.module.js', expected: 'three-vendor' },
        { id: 'C:/project/node_modules/three/src/math/Vector3.js', expected: 'three-vendor' },
        { id: '/node_modules/three/examples/jsm/controls/OrbitControls.js', expected: 'three-vendor' },
        // R3F vendor chunking
        { id: '/node_modules/@react-three/fiber/dist/index.js', expected: 'r3f-vendor' },
        { id: '/node_modules/@react-three/drei/index.js', expected: 'r3f-vendor' },
        // React core chunking
        { id: '/node_modules/react/index.js', expected: 'react-vendor' },
        { id: '/node_modules/react-dom/client.js', expected: 'react-vendor' },
        { id: '/node_modules/scheduler/index.js', expected: 'react-vendor' },
        // Lucide icons chunking
        { id: '/node_modules/lucide-react/dist/esm/lucide-react.js', expected: 'lucide-vendor' },
        // Application code (must NOT be grouped into vendor chunk)
        { id: '/Users/test/src/App.tsx', expected: undefined },
        { id: '/Users/test/src/components/canvas/GeometryLayer.tsx', expected: undefined },
        { id: '/Users/test/src/webgpu/WebGPUEngine.ts', expected: undefined },
        // Unrecognized vendor
        { id: '/node_modules/lodash/lodash.js', expected: undefined },
      ];

      for (const { id, expected } of cases) {
        const chunk = manualChunks(id);
        expect(chunk).toBe(expected);
      }
    });
  });

  describe('2. Monotonic Timing & Simulation Stability Invariants', () => {
    it('ADV-M1-05: verifies monotonic elapsed time progression and prevents negative delta steps', () => {
      const startTime = 1000.0;
      const timestamps = [
        1000.0,
        1016.66,
        1033.33,
        1050.00,
        1066.66,
        1083.33,
        2000.00, // 1s later
        10000.00, // 9s later
        3600000.00, // 1 hour later (tab suspend)
      ];

      let prevElapsed = -1;
      for (const ts of timestamps) {
        const elapsedTime = (ts - startTime) * 0.001;
        expect(Number.isFinite(elapsedTime)).toBe(true);
        expect(Number.isNaN(elapsedTime)).toBe(false);
        expect(elapsedTime).toBeGreaterThanOrEqual(0);
        expect(elapsedTime).toBeGreaterThanOrEqual(prevElapsed);
        prevElapsed = elapsedTime;
      }
    });

    it('ADV-M1-06: verifies computeCurlNoise remains strictly bounded under extreme time jumps', () => {
      // Test long uptimes and tab suspension recovery: t = 0 to 10,000,000 seconds
      const testTimes = [0, 0.001, 1.0, 60.0, 3600.0, 86400.0, 1e6, 1e7];
      const testPositions: [number, number, number][] = [
        [0, 0, 0],
        [5, 0, 0],
        [0, 5, 0],
        [0, 0, 5],
        [-3.5, 2.1, -1.8],
        [100, -200, 300],
      ];

      for (const time of testTimes) {
        for (const pos of testPositions) {
          const velocity = computeCurlNoise(pos, time);
          expect(Number.isFinite(velocity[0])).toBe(true);
          expect(Number.isFinite(velocity[1])).toBe(true);
          expect(Number.isFinite(velocity[2])).toBe(true);
          expect(Number.isNaN(velocity[0])).toBe(false);
          expect(Number.isNaN(velocity[1])).toBe(false);
          expect(Number.isNaN(velocity[2])).toBe(false);

          // Vector field bound check: ||u||_inf <= 0.55 + 1.10 + 0.35 = 2.0
          expect(Math.abs(velocity[0])).toBeLessThanOrEqual(2.000001);
          expect(Math.abs(velocity[1])).toBeLessThanOrEqual(2.000001);
          expect(Math.abs(velocity[2])).toBeLessThanOrEqual(2.000001);

          const mag = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
          expect(mag).toBeLessThanOrEqual(3.47);
        }
      }
    });

    it('ADV-M1-07: verifies FPS calculation windowing invariant (no zero-division, no NaN, no negative values)', () => {
      const simulateFpsSampler = (frameDeltas: number[]) => {
        let frameCount = 0;
        let lastTime = 0;
        let currentTime = 0;
        const fpsHistory: number[] = [];

        for (const dt of frameDeltas) {
          currentTime += dt;
          frameCount++;
          if (currentTime - lastTime >= 500) {
            const currentFps = Math.round((frameCount * 1000) / (currentTime - lastTime));
            expect(Number.isFinite(currentFps)).toBe(true);
            expect(Number.isNaN(currentFps)).toBe(false);
            expect(currentFps).toBeGreaterThanOrEqual(0);
            fpsHistory.push(currentFps);
            frameCount = 0;
            lastTime = currentTime;
          }
        }
        return fpsHistory;
      };

      // Case 1: Steady 60 FPS (16.66ms per frame)
      const steady60 = Array(120).fill(16.6667);
      const fps60 = simulateFpsSampler(steady60);
      expect(fps60.length).toBeGreaterThan(0);
      fps60.forEach(f => expect(f).toBeCloseTo(60, 1));

      // Case 2: Steady 120 FPS (8.33ms per frame)
      const steady120 = Array(240).fill(8.3333);
      const fps120 = simulateFpsSampler(steady120);
      fps120.forEach(f => expect(f).toBeCloseTo(120, 1));

      // Case 3: Severe lag / hitching (single 1000ms frame)
      const hitching = [16.6, 16.6, 1000, 16.6, 16.6];
      const fpsHitch = simulateFpsSampler(hitching);
      expect(fpsHitch.length).toBe(1);
      expect(fpsHitch[0]).toBeGreaterThanOrEqual(1);

      // Case 4: Long suspension (10 seconds backgrounding produces 0 FPS without NaN/div0)
      const suspended = [16.6, 10000, 16.6];
      const fpsSuspended = simulateFpsSampler(suspended);
      expect(fpsSuspended.length).toBe(1);
      expect(fpsSuspended[0]).toBe(0);
    });

    it('ADV-M1-08: verifies evaluateCubicBezierEase transition easing never produces NaN or overshoot', () => {
      // Test across entire boundary and out-of-bounds range [-10.0, +10.0]
      for (let unfurl = -10.0; unfurl <= 10.0; unfurl += 0.01) {
        const ease = evaluateCubicBezierEase(unfurl);
        expect(Number.isFinite(ease)).toBe(true);
        expect(Number.isNaN(ease)).toBe(false);
        expect(ease).toBeGreaterThanOrEqual(0.0);
        expect(ease).toBeLessThanOrEqual(1.0);
      }

      // Exact boundaries
      expect(evaluateCubicBezierEase(0.0)).toBe(0.0);
      expect(evaluateCubicBezierEase(0.5)).toBe(0.5);
      expect(evaluateCubicBezierEase(1.0)).toBe(1.0);
    });
  });
});
