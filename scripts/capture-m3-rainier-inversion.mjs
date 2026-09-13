// ============================================================================
// File: scripts/capture-m3-rainier-inversion.mjs
// Purpose: Live browser capture of Milestone 3 Mount Rainier Inversion Viewpoint
//          demonstrating Mount Rainier summit (4,392m) piercing the Puget Sound
//          marine stratus cloud deck (0-500m AGL) with clean depth occlusion.
// Output: screenshots/m3_rainier_inversion.png (>50 KB).
// ============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_PATH = path.resolve('screenshots/m3_rainier_inversion.png');
const DEV_SERVER_URL = 'http://localhost:3000';

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
    console.log('[capture-m3] Dev server already active on port 3000.');
    return null;
  }

  console.log('[capture-m3] Starting dev server on port 3000...');
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true,
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isServerRunning()) {
      console.log('[capture-m3] Dev server ready.');
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
    console.warn('[capture-m3] Warning starting dev server:', err);
  }

  console.log('[capture-m3] Launching Google Chrome...');
  const browser = await chromium.launch({
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

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    console.log('[capture-m3] Navigating to http://localhost:3000...');
    await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('[capture-m3] Waiting for engine and camera hook...');
    await page.waitForFunction(
      () => typeof (window).__INDICATRIX_CAMERA__ !== 'undefined' && typeof (window).__INDICATRIX_CAMERA__.snapRainierInversion === 'function',
      { timeout: 30000 }
    );

    // Give WebGPU engine time to settle initial textures
    await page.waitForTimeout(3000);

    console.log('[capture-m3] Snapping to Mount Rainier Inversion viewpoint...');
    await page.evaluate(() => {
      (window).__INDICATRIX_CAMERA__.snapRainierInversion();
    });

    // Wait for camera to settle and multiple frames to render
    await page.waitForTimeout(4000);

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });

    console.log(`[capture-m3] Capturing screenshot to ${SCREENSHOT_PATH}...`);
    await page.screenshot({
      path: SCREENSHOT_PATH,
      fullPage: false,
    });

    const stat = fs.statSync(SCREENSHOT_PATH);
    console.log(`[capture-m3] Screenshot saved successfully: ${(stat.size / 1024).toFixed(1)} KB`);

    if (stat.size < 50000) {
      throw new Error(`Screenshot size too small (${stat.size} bytes). Target: > 50,000 bytes.`);
    }

    console.log('[capture-m3] Verification successful: Rainier inversion captured with size > 50 KB.');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

capture().catch((err) => {
  console.error('[capture-m3] Capture failed:', err);
  process.exit(1);
});
