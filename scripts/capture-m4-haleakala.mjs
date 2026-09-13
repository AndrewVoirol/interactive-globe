// ============================================================================
// File: scripts/capture-m4-haleakala.mjs
// Purpose: Live browser capture of Milestone 4 Haleakala Sunset Viewpoint
//          demonstrating dual-lobe Henyey-Greenstein optical scattering,
//          1-tap solar crevice shadows, and 3-theme archival inking.
// Output:
//   - screenshots/m4_haleakala_tharp.png     (Theme 0: Marie Tharp 1977)
//   - screenshots/m4_haleakala_cream.png     (Theme 1: Cream Rag Paper)
//   - screenshots/m4_haleakala_cyanotype.png (Theme 2: Prussian Cyanotype 1842)
// Invariants Enforced: §12, §22, §24, §27
// ============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const DEV_SERVER_URL = 'http://localhost:3000';

const CAPTURES = [
  {
    theme: 0,
    name: 'tharp',
    outputPath: path.resolve('screenshots/m4_haleakala_tharp.png'),
    label: 'Theme 0: Marie Tharp Physiographic Chart (1977)',
  },
  {
    theme: 1,
    name: 'cream',
    outputPath: path.resolve('screenshots/m4_haleakala_cream.png'),
    label: 'Theme 1: Cream Rag Paper (310 GSM Cotton Rag)',
  },
  {
    theme: 2,
    name: 'cyanotype',
    outputPath: path.resolve('screenshots/m4_haleakala_cyanotype.png'),
    label: 'Theme 2: Prussian Cyanotype Blueprint (1842)',
  },
];

async function isServerRunning() {
  try {
    const res = await fetch(DEV_SERVER_URL);
    return res.ok || res.status === 200 || res.status === 304;
  } catch {
    return false;
  }
}

async function ensureDevServer() {
  if (await isServerRunning()) {
    console.log('[capture-m4] Dev server already active on port 3000.');
    return null;
  }

  console.log('[capture-m4] Starting dev server on port 3000...');
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true,
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isServerRunning()) {
      console.log('[capture-m4] Dev server ready.');
      return serverProcess;
    }
  }

  throw new Error('Dev server failed to start within 30 seconds.');
}

async function captureAllThemes() {
  let serverProcess = null;
  let browser = null;
  try {
    try {
      serverProcess = await ensureDevServer();
    } catch (err) {
      console.warn('[capture-m4] Warning checking/starting dev server:', err);
    }

    console.log('[capture-m4] Launching Google Chrome with WebGPU enabled...');
    browser = await chromium.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: false,
      args: [
        '--enable-unsafe-webgpu',
        '--use-gl=angle',
        '--use-angle=metal',
        '--ignore-gpu-blocklist',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('[browser error]', err));
    await page.bringToFront();

    console.log('[capture-m4] Navigating to http://localhost:3000...');
    await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('[capture-m4] Waiting for engine and snapHaleakalaSunset hook...');
    await page.waitForFunction(
      () =>
        typeof (window).__INDICATRIX_CAMERA__ !== 'undefined' &&
        typeof (window).__INDICATRIX_CAMERA__.snapHaleakalaSunset === 'function' &&
        typeof (window).__INDICATRIX_WEBGPU_ENGINE__ !== 'undefined' &&
        (window).__INDICATRIX_WEBGPU_ENGINE__.initialized === true,
      { timeout: 60000 }
    );

    // Allow WebGPU pipelines and initial 3D noise volume to settle
    await page.waitForTimeout(2000);

    console.log('[capture-m4] Loading WeatherNext prognostic cloud layers...');
    await page.evaluate(async () => {
      const engine = (window).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine) {
        if (typeof engine.setVolumetricCloudsEnabled === 'function') {
          engine.setVolumetricCloudsEnabled(true);
        }
        await engine.loadAllCloudLayers(true);
        if (typeof engine.updateVolumetricCloudBindGroup === 'function') {
          engine.updateVolumetricCloudBindGroup();
        }
      }
    });
    await page.waitForTimeout(1000);

    for (const item of CAPTURES) {
      console.log(`\n[capture-m4] --- Capturing ${item.label} ---`);

      const startTime = Date.now();
      await page.evaluate((themeIdx) => {
        (window).__INDICATRIX_CAMERA__.snapHaleakalaSunset({
          theme: themeIdx,
          sunAltitude: 7.5,
          sunAzimuth: 270.0,
          displacementScale: 0.003,
        });
      }, item.theme);

      // Wait 4s for camera transition and multi-frame raymarching accumulation
      await page.waitForTimeout(4000);
      const transitionElapsed = Date.now() - startTime;
      console.log(`[capture-m4] Switched and settled in ${transitionElapsed}ms`);

      fs.mkdirSync(path.dirname(item.outputPath), { recursive: true });

      console.log(`[capture-m4] Writing screenshot to ${item.outputPath}...`);
      await page.screenshot({
        path: item.outputPath,
        fullPage: false,
      });

      const stat = fs.statSync(item.outputPath);
      const sizeKB = (stat.size / 1024).toFixed(1);
      console.log(`[capture-m4] Saved: ${item.outputPath} (${sizeKB} KB)`);

      if (stat.size < 50000) {
        throw new Error(
          `Screenshot ${item.outputPath} size too small: ${stat.size} bytes. Target: > 50,000 bytes.`
        );
      }
    }

    console.log('\n[capture-m4] ALL 3 THEME BENCHMARKS CAPTURED SUCCESSFULLY (Invariant §22 & §27)!');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.warn('[capture-m4] Warning closing browser:', err);
      }
    }
    if (serverProcess) {
      try {
        serverProcess.kill('SIGTERM');
      } catch (err) {
        console.warn('[capture-m4] Warning killing server process:', err);
      }
    }
  }
}

captureAllThemes()
  .then(() => {
    console.log('[capture-m4] Completed all captures cleanly. Exiting.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[capture-m4] Execution failed:', err);
    process.exit(1);
  });
