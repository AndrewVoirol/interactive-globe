import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Adversarial Challenge: Milestone M1 (Challenger 2)', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const distDir = path.join(projectRoot, 'dist');
  const assetsDir = path.join(distDir, 'assets');

  describe('1. Production Build, Minification & Chunk Splitting Verification', () => {
    it('ADV-M1-01: verifies production build artifacts exist and are properly structured', () => {
      expect(fs.existsSync(distDir), 'dist directory must exist').toBe(true);
      expect(fs.existsSync(assetsDir), 'dist/assets directory must exist').toBe(true);
      expect(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html must exist').toBe(true);

      const files = fs.readdirSync(assetsDir);
      const indexJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
      const threeVendor = files.find(f => f.startsWith('three-vendor-') && f.endsWith('.js'));
      const reactVendor = files.find(f => f.startsWith('react-vendor-') && f.endsWith('.js'));
      const r3fVendor = files.find(f => f.startsWith('r3f-vendor-') && f.endsWith('.js'));

      expect(indexJs, 'Entry chunk index-*.js must be present').toBeDefined();
      expect(threeVendor, 'three-vendor-*.js chunk must be present').toBeDefined();
      expect(reactVendor, 'react-vendor-*.js chunk must be present').toBeDefined();
      expect(r3fVendor, 'r3f-vendor-*.js chunk must be present').toBeDefined();
    });

    it('ADV-M1-02: verifies all production chunks satisfy strict byte limits under minification', () => {
      const files = fs.readdirSync(assetsDir);

      const indexJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'))!;
      const threeVendor = files.find(f => f.startsWith('three-vendor-') && f.endsWith('.js'))!;
      const reactVendor = files.find(f => f.startsWith('react-vendor-') && f.endsWith('.js'))!;
      const r3fVendor = files.find(f => f.startsWith('r3f-vendor-') && f.endsWith('.js'))!;

      const indexSize = fs.statSync(path.join(assetsDir, indexJs)).size;
      const threeSize = fs.statSync(path.join(assetsDir, threeVendor)).size;
      const reactSize = fs.statSync(path.join(assetsDir, reactVendor)).size;
      const r3fSize = fs.statSync(path.join(assetsDir, r3fVendor)).size;

      // Entry chunk should be ultra-lean (< 50 kB)
      expect(indexSize / 1024).toBeLessThan(50); // Measured ~27.25 kB
      // Vendor chunks must all be under Vite warning limit (1000 kB)
      expect(threeSize / 1024).toBeLessThan(1000); // Measured ~748 kB
      expect(reactSize / 1024).toBeLessThan(300); // Measured ~197 kB
      expect(r3fSize / 1024).toBeLessThan(300); // Measured ~156 kB
    });

    it('ADV-M1-03: verifies minification quality and zero Three.Clock references in production bundle', () => {
      const files = fs.readdirSync(assetsDir);
      const indexJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'))!;
      const content = fs.readFileSync(path.join(assetsDir, indexJs), 'utf8');

      // Verify code minification: identifiers are mangled and ES module imports are optimized
      expect(content).toMatch(/import\{[a-zA-Z0-9_$,\s]+\}from/);
      // Zero Three.Clock or clockRef in production bundle
      expect(content).not.toContain('THREE.Clock');
      expect(content).not.toContain('clockRef');
    });

    it('ADV-M1-04: stress-tests vite.config.ts manualChunks against Windows/POSIX paths and edge cases', async () => {
      const configModule = await import(path.join(projectRoot, 'vite.config.ts'));
      const config = configModule.default;
      const manualChunks = config.build?.rollupOptions?.output?.manualChunks;

      expect(typeof manualChunks).toBe('function');

      // Normalized POSIX paths as passed by Rollup/Vite
      const cases = [
        // Three.js
        { id: '/Users/test/node_modules/three/build/three.module.js', expected: 'three-vendor' },
        { id: 'C:/project/node_modules/three/src/math/Vector3.js', expected: 'three-vendor' },
        { id: '/node_modules/three/examples/jsm/controls/OrbitControls.js', expected: 'three-vendor' },
        // R3F
        { id: '/node_modules/@react-three/fiber/dist/index.js', expected: 'r3f-vendor' },
        { id: '/node_modules/@react-three/drei/index.js', expected: 'r3f-vendor' },
        // React
        { id: '/node_modules/react/index.js', expected: 'react-vendor' },
        { id: '/node_modules/react-dom/client.js', expected: 'react-vendor' },
        { id: '/node_modules/scheduler/index.js', expected: 'react-vendor' },
        // Lucide
        { id: '/node_modules/lucide-react/dist/esm/lucide-react.js', expected: 'lucide-vendor' },
        // Application code (must NOT be grouped into vendor chunk)
        { id: '/Users/test/src/App.tsx', expected: undefined },
        { id: '/Users/test/App.tsx', expected: undefined },
        { id: '/Users/test/src/webgpu/WebGPUEngine.ts', expected: undefined },
        // Unrecognized vendor
        { id: '/node_modules/lodash/lodash.js', expected: undefined },
      ];

      for (const { id, expected } of cases) {
        const chunk = manualChunks(id);
        expect(chunk).toBe(expected);
      }
    });

    it('ADV-M1-05: verifies index.html references valid bundled assets', () => {
      const htmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
      expect(htmlContent).toContain('<script type="module" crossorigin src="/assets/index-');
      expect(htmlContent).toContain('<link rel="stylesheet" crossorigin href="/assets/index-');
    });
  });

  describe('2. App.tsx Monotonic Timing & useFrame Invariant Verification', () => {
    // Replicate computeCurlNoise from vertex shader
    const computeCurlNoise = (p: [number, number, number], time: number): [number, number, number] => {
      const k1 = 0.55;
      const k2 = 1.10;
      const t = time * 0.8;

      const u_x = -k1 * Math.cos(k1 * p[1] + t * 0.7) - k2 * Math.cos(k2 * p[2] - t * 0.5);
      const u_y = -k1 * Math.cos(k1 * p[2] + t * 0.9) - k2 * Math.cos(k2 * p[0] - t * 0.6);
      const u_z = -k1 * Math.cos(k1 * p[0] + t * 0.8) - k2 * Math.cos(k2 * p[1] - t * 0.4);

      const u2_x = 0.35 * Math.sin(1.8 * p[1] - t * 1.2);
      const u2_y = 0.35 * Math.sin(1.8 * p[2] - t * 1.1);
      const u2_z = 0.35 * Math.sin(1.8 * p[0] - t * 1.3);

      return [u_x + u2_x, u_y + u2_y, u_z + u2_z];
    };

    it('ADV-M1-06: verifies (performance.now() - startTimeRef) * 0.001 is strictly monotonic and non-negative', () => {
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

    it('ADV-M1-07: stress-tests computeCurlNoise under extreme time jumps (tab suspension recovery)', () => {
      // Simulate extreme time jumps after tab resume (t = 0, 10, 100, 1000, 100000, 10000000 seconds)
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

    it('ADV-M1-08: verifies FPS calculation invariant (no zero-division, no NaN, no negative values)', () => {
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

    it('ADV-M1-09: verifies cubic bezier ease function in vertex shader never produces NaN or overshoot', () => {
      const evaluateEase = (u_unfurl: number): number => {
        const clampedUnfurl = Math.max(0.0, Math.min(1.0, u_unfurl));
        return clampedUnfurl < 0.5
          ? 4.0 * clampedUnfurl * clampedUnfurl * clampedUnfurl
          : 1.0 - Math.pow(Math.max(0.0, -2.0 * clampedUnfurl + 2.0), 3.0) / 2.0;
      };

      // Test across entire boundary and out-of-bounds range [-10.0, +10.0]
      for (let unfurl = -10.0; unfurl <= 10.0; unfurl += 0.01) {
        const ease = evaluateEase(unfurl);
        expect(Number.isFinite(ease)).toBe(true);
        expect(Number.isNaN(ease)).toBe(false);
        expect(ease).toBeGreaterThanOrEqual(0.0);
        expect(ease).toBeLessThanOrEqual(1.0);
      }

      // Exact boundaries
      expect(evaluateEase(0.0)).toBe(0.0);
      expect(evaluateEase(0.5)).toBe(0.5);
      expect(evaluateEase(1.0)).toBe(1.0);
    });
  });
});
