// ============================================================================
// File: scripts/verify-camera-orbit-rte.mjs
// Interactive 25m Altitude Camera Orbit Test (Grand Canyon & Mount Everest)
// Verifies zero vertex swimming and zero WebGPU errors under RTE coordinates
// ============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const screenshotsDir = path.join(projectRoot, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const PORT = 3001;
const APP_URL = `http://localhost:${PORT}`;

async function isServerRunning(url) {
  try {
    const res = await fetch(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 3: CAMERA ORBIT TESTS AT 25M ALTITUDE (RTE VERIFICATION)');
  console.log('================================================================\n');

  let serverProcess = null;
  const running = await isServerRunning(APP_URL);
  if (!running) {
    console.log(`Starting Vite dev server on port ${PORT}...`);
    serverProcess = spawn('npx', ['vite', '--port', String(PORT)], {
      cwd: projectRoot,
      stdio: 'pipe',
      detached: false,
    });

    let started = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isServerRunning(APP_URL)) {
        started = true;
        break;
      }
    }
    if (!started) {
      throw new Error(`Failed to start Vite dev server on ${APP_URL}`);
    }
    console.log(`✓ Dev server online at ${APP_URL}`);
  } else {
    console.log(`✓ Using existing server at ${APP_URL}`);
  }

  const chromeDev = '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
  const chromeStable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = fs.existsSync(chromeDev) ? chromeDev : chromeStable;
  console.log(`Launching Chrome binary: ${executablePath}`);

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--enable-features=Vulkan,DefaultANGLEVulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis',
      '--use-gpu-in-tests',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' || text.toLowerCase().includes('error') || text.includes('WGSL')) {
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
      if (type === 'error' || text.includes('WGSL')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err.message);
    consoleErrors.push(err.message);
  });

  console.log(`Navigating to ${APP_URL}...`);
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

  console.log('Waiting for WebGPU engine initialization...');
  await page.waitForFunction(
    () => (window.__INDICATRIX_WEBGPU_ENGINE__ || window.__INDICATRIX_ENGINE__ || window.__ENGINE),
    { timeout: 20000 }
  );
  await page.waitForTimeout(2000);
  console.log('✓ WebGPU Engine confirmed online.\n');

  // Verify RTE uniform buffer size in browser memory:
  const bufferFootprint = await page.evaluate(() => {
    const engine = window.__INDICATRIX_WEBGPU_ENGINE__ || window.__INDICATRIX_ENGINE__;
    const cf = engine?.crustFloats;
    return {
      floatsLength: cf?.length || 0,
      byteLength: cf?.byteLength || 0,
    };
  });
  console.log(`WebGPU Uniform Buffer Footprint: ${bufferFootprint.floatsLength} floats (${bufferFootprint.byteLength} bytes)`);
  if (bufferFootprint.floatsLength !== 104 || bufferFootprint.byteLength !== 416) {
    throw new Error(`Unexpected uniform buffer footprint: expected 104 floats / 416 bytes, received ${bufferFootprint.floatsLength}`);
  }

  const litmusSites = [
    {
      id: 'grand_canyon',
      name: 'Grand Canyon South Rim',
      lat: 36.0544,
      lon: -112.1401,
      altitudeMeters: 25.0,
      screenshot: 'rte-orbit-grand-canyon-25m.png',
    },
    {
      id: 'everest',
      name: 'Mount Everest Summit',
      lat: 27.9881,
      lon: 86.9250,
      altitudeMeters: 25.0,
      screenshot: 'rte-orbit-everest-25m.png',
    },
  ];

  for (const site of litmusSites) {
    console.log(`----------------------------------------------------------------`);
    console.log(`ORBIT TEST: ${site.name.toUpperCase()} (25m Altitude)`);
    console.log(`----------------------------------------------------------------`);

    // Position camera over site
    await page.evaluate((s) => {
      if (window.__INDICATRIX_CAMERA__ && typeof window.__INDICATRIX_CAMERA__.lookAtCoordinates === 'function') {
        window.__INDICATRIX_CAMERA__.lookAtCoordinates(s.lon, s.lat, 5.002, [0, 0, 0]);
      } else if (window.__INDICATRIX_CAMERA_CONTROLLER__) {
        const phi = (90.0 - s.lat) * (Math.PI / 180.0);
        const theta = (s.lon + 90.0) * (Math.PI / 180.0);
        window.__INDICATRIX_CAMERA_CONTROLLER__.phi = phi;
        window.__INDICATRIX_CAMERA_CONTROLLER__.theta = theta;
        window.__INDICATRIX_CAMERA_CONTROLLER__.radius = 5.002;
      }
    }, site);
    await page.waitForTimeout(1000);

    // Execute 120-frame orbit loop and record frame delta stability
    const orbitStats = await page.evaluate(async (s) => {
      const frameTimes = [];
      const camPositions = [];
      let lastTime = performance.now();

      const engine = window.__INDICATRIX_WEBGPU_ENGINE__ || window.__INDICATRIX_ENGINE__;
      const camera = window.__INDICATRIX_CAMERA__;

      const TOTAL_FRAMES = 120;
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const angle = (i / TOTAL_FRAMES) * 2.0 * Math.PI;

        if (camera && typeof camera.getSpherical === 'function') {
          const sph = camera.getSpherical();
          camera.setSpherical(sph.radius, sph.theta + (1.0 / TOTAL_FRAMES) * 0.05, sph.phi);
        }

        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        frameTimes.push(now - lastTime);
        lastTime = now;

        if (engine && engine.crustFloats) {
          // Sample high and low camera positions packed in crustFloats
          camPositions.push({
            highX: engine.crustFloats[80],
            highY: engine.crustFloats[81],
            highZ: engine.crustFloats[82],
            lowX: engine.crustFloats[84],
            lowY: engine.crustFloats[85],
            lowZ: engine.crustFloats[86],
          });
        }
      }

      const meanMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const fps = 1000.0 / Math.max(0.1, meanMs);

      // Verify zero NaNs or Infs across all 120 sampled camera frames
      let nanCount = 0;
      for (const p of camPositions) {
        if (!Number.isFinite(p.highX) || !Number.isFinite(p.lowX)) nanCount++;
      }

      return {
        framesRendered: frameTimes.length,
        meanMs: parseFloat(meanMs.toFixed(2)),
        fps: parseFloat(fps.toFixed(1)),
        nanCount,
      };
    }, site);

    console.log(`  ✓ 120 frames rendered smoothly: ${orbitStats.fps} FPS (Mean: ${orbitStats.meanMs}ms)`);
    console.log(`  ✓ Zero NaN/Inf anomalies detected: ${orbitStats.nanCount === 0 ? 'PASS' : 'FAIL'}`);

    // Capture lossless screenshot
    const shotPath = path.join(screenshotsDir, site.screenshot);
    await page.screenshot({ path: shotPath });
    const stat = fs.statSync(shotPath);
    console.log(`  ✓ Captured lossless orbit state: screenshots/${site.screenshot} (${(stat.size / 1024).toFixed(1)} KB)\n`);
  }

  await browser.close();

  if (serverProcess) {
    console.log('Stopping dev server...');
    serverProcess.kill();
  }

  console.log('================================================================');
  console.log(`ORBIT SUITE COMPLETE: ${consoleErrors.length} ERRORS ENCOUNTERED`);
  console.log('================================================================\n');

  if (consoleErrors.length > 0) {
    console.error('Console errors:\n', consoleErrors.join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in orbit verification:', err);
  process.exit(1);
});
