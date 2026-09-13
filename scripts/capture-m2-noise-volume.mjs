// ============================================================================
// File: scripts/capture-m2-noise-volume.mjs
// Purpose: Live browser capture of Milestone 2 3D Perlin-Worley Noise Volume Slices
// Layout: 1024x576 technical preview card with Row 1 (depth slices) and
//         Row 2 (channel decomposition) saved to screenshots/m2_noise_volume.png.
// ============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_PATH = path.resolve('screenshots/m2_noise_volume.png');
const DEV_SERVER_URL = 'http://127.0.0.1:5173';

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
    console.log('[capture-m2] Dev server already active on port 5173.');
    return null;
  }

  console.log('[capture-m2] Starting dev server...');
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true,
  });

  // Wait for server to become responsive
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isServerRunning()) {
      console.log('[capture-m2] Dev server ready.');
      return serverProcess;
    }
  }

  throw new Error('Dev server failed to start within 30 seconds.');
}

async function capture() {
  let serverProcess = null;
  try {
    serverProcess = await ensureDevServer();
  } catch (err) {
    console.warn('[capture-m2] Warning starting dev server:', err);
  }

  console.log('[capture-m2] Launching browser...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=default',
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--window-size=1920,1080',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    console.log('[capture-m2] Navigating to dev server...');
    await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('[capture-m2] Waiting for engine and noise debug hook...');
    await page.waitForFunction(
      () => typeof (window).__INDICATRIX_NOISE_DEBUG__ !== 'undefined',
      { timeout: 30000 }
    );

    console.log('[capture-m2] Mounting 3D noise debug overlay...');
    await page.evaluate(async () => {
      await (window).__INDICATRIX_NOISE_DEBUG__.mountDebugOverlay();
    });

    await page.waitForSelector('#indicatrix-noise-debug-card', { timeout: 10000 });
    // Allow canvas rendering to settle
    await page.waitForTimeout(1000);

    const cardElement = await page.$('#indicatrix-noise-debug-card');
    if (!cardElement) {
      throw new Error('Could not find #indicatrix-noise-debug-card element.');
    }

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });

    console.log(`[capture-m2] Capturing screenshot to ${SCREENSHOT_PATH}...`);
    await cardElement.screenshot({
      path: SCREENSHOT_PATH,
    });

    const stat = fs.statSync(SCREENSHOT_PATH);
    console.log(`[capture-m2] Screenshot saved successfully: ${(stat.size / 1024).toFixed(1)} KB`);

    if (stat.size < 20000) {
      throw new Error(`Screenshot size too small (${stat.size} bytes).`);
    }

    await page.evaluate(() => {
      (window).__INDICATRIX_NOISE_DEBUG__.unmountDebugOverlay();
    });
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

capture().catch((err) => {
  console.error('[capture-m2] Capture failed:', err);
  process.exit(1);
});
