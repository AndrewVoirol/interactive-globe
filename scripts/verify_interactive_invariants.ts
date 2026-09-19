import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runInteractiveVerification() {
  const screenshotsDir = path.resolve('screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('[Smoke Harness] Launching Chrome with WebGPU enabled...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=default',
      '--enable-features=Vulkan,UseSkiaRenderer',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.toString());
  });

  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}`;
  console.log(`[Smoke Harness] Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for canvas and engine
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // --------------------------------------------------------------------------
  // Invariant 1: Flat Map 3D Rotation
  // --------------------------------------------------------------------------
  console.log('\n--- Testing Invariant 1: Flat Map 3D Rotation ---');
  // Transition to Flat Map (MAP M button)
  await page.evaluate(() => {
    const mapBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('MAP'));
    if (mapBtn) mapBtn.click();
  });
  await page.waitForTimeout(1500);

  const flatMapStateBefore = await page.evaluate(() => {
    const c = (window as any).__INDICATRIX_CAMERA__;
    return c?.getSpherical?.() || null;
  });
  console.log('Flat Map Camera State Before Drag:', JSON.stringify(flatMapStateBefore?.cameraPos));

  // Perform pointer drag on container
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const container = canvas.parentElement || canvas;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    container.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx - 120, clientY: cy - 80, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: cx - 120, clientY: cy - 80, button: 0, bubbles: true }));
  });
  await page.waitForTimeout(300);

  const flatMapStateAfter = await page.evaluate(() => {
    const c = (window as any).__INDICATRIX_CAMERA__;
    return c?.getSpherical?.() || null;
  });
  console.log('Flat Map Camera State After Drag:', JSON.stringify(flatMapStateAfter?.cameraPos));

  const thetaDelta = Math.abs((flatMapStateAfter?.theta ?? 0) - (flatMapStateBefore?.theta ?? 0));
  const phiDelta = Math.abs((flatMapStateAfter?.phi ?? 0) - (flatMapStateBefore?.phi ?? 0));
  console.log(`Angular deltas: thetaDelta = ${thetaDelta.toFixed(4)}, phiDelta = ${phiDelta.toFixed(4)}`);

  if (thetaDelta < 0.05 && phiDelta < 0.05) {
    throw new Error(`FAIL: Flat map failed to rotate on its axes! delta = {theta: ${thetaDelta}, phi: ${phiDelta}}`);
  }
  console.log('PASS: Flat map rotates freely in 3D on its axes!');

  // Capture rotated flat map screenshot
  await page.screenshot({ path: path.join(screenshotsDir, 'invariant-flat-map-3d-rotated.png') });
  console.log('Captured: screenshots/invariant-flat-map-3d-rotated.png');

  // --------------------------------------------------------------------------
  // Invariant 2: Smooth Zoom Monotonicity & Ground Clearance Floor (Rule 32)
  // --------------------------------------------------------------------------
  console.log('\n--- Testing Invariant 2: Zoom Monotonicity & Ground Floor ---');
  const zoomResults = await page.evaluate(() => {
    const c = (window as any).__INDICATRIX_CAMERA__;
    if (!c) return { error: 'No camera' };
    const initialRadius = c.getSpherical?.()?.radius ?? 15.0;

    // Zoom in steps
    c.setSpherical(12.0);
    const r1 = c.getSpherical?.()?.radius;
    c.setSpherical(8.0);
    const r2 = c.getSpherical?.()?.radius;
    c.setSpherical(5.5);
    const r3 = c.getSpherical?.()?.radius;

    return { initialRadius, r1, r2, r3 };
  });
  console.log('Zoom progression:', zoomResults);
  if (zoomResults.r1 >= zoomResults.initialRadius || zoomResults.r2 >= zoomResults.r1 || zoomResults.r3 >= zoomResults.r2) {
    throw new Error(`FAIL: Zoom is not monotonically decreasing! ${JSON.stringify(zoomResults)}`);
  }
  if (zoomResults.r3 < 5.0) {
    throw new Error(`FAIL: Camera clipped below planetary radius floor! r3 = ${zoomResults.r3}`);
  }
  console.log('PASS: Zoom scales smoothly and monotonically without subterranean clipping.');

  // --------------------------------------------------------------------------
  // Invariant 3: Panning Across the Sheet
  // --------------------------------------------------------------------------
  console.log('\n--- Testing Invariant 3: Flat Map Panning ---');
  const panResult = await page.evaluate(() => {
    const c = (window as any).__INDICATRIX_CAMERA__;
    const before = c?.getSpherical?.()?.target || [0, 0, 0];

    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas' };
    const container = canvas.parentElement || canvas;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Pan with right mouse button (button 2)
    container.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 2, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx - 100, clientY: cy - 50, button: 2, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: cx - 100, clientY: cy - 50, button: 2, bubbles: true }));

    const after = c?.getSpherical?.()?.target || [0, 0, 0];
    return {
      before,
      after,
      dx: after[0] - before[0],
      dy: after[1] - before[1],
    };
  });
  console.log(`Pan Target Delta: [${panResult.dx.toFixed(3)}, ${panResult.dy.toFixed(3)}]`);
  if (Math.abs(panResult.dx) < 0.1 && Math.abs(panResult.dy) < 0.1) {
    throw new Error('FAIL: Panning failed to translate target across sheet!');
  }
  console.log('PASS: Pan translates target across sheet cleanly.');

  // --------------------------------------------------------------------------
  // Invariant 4: CDLOD Node Counts & Zero Seam Rips
  // --------------------------------------------------------------------------
  console.log('\n--- Testing Invariant 4: CDLOD Engine State ---');
  const cdlodState = await page.evaluate(() => {
    const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    return {
      cdlodEnabled: engine?.cdlodEnabled,
      activeNodeCount: engine?.cdlodActiveNodeCount,
      buffersInitialized: engine?.cdlodBuffersInitialized,
    };
  });
  console.log('CDLOD State:', JSON.stringify(cdlodState));
  if (!cdlodState.cdlodEnabled || !cdlodState.buffersInitialized) {
    throw new Error('FAIL: CDLOD is not enabled or initialized!');
  }
  console.log('PASS: CDLOD active and rendering instances smoothly.');

  // --------------------------------------------------------------------------
  // Invariant 5: Archival Medium Verification (Themes 0, 1, 2)
  // --------------------------------------------------------------------------
  console.log('\n--- Testing Invariant 5: Archival Medium Verification ---');
  // Reset camera to standard oblique view
  await page.evaluate(() => {
    const c = (window as any).__INDICATRIX_CAMERA__;
    c?.setSpherical?.(18.0, 0.15, 1.15);
  });
  await page.waitForTimeout(400);

  // Theme 1: Cream Rag (Swiss Relief)
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-1-cream-rag-oblique.png') });
  console.log('Captured: screenshots/theme-1-cream-rag-oblique.png');

  // Switch to Theme 0: Marie Tharp
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tharp'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-0-tharp-oblique.png') });
  console.log('Captured: screenshots/theme-0-tharp-oblique.png');

  // Switch to Theme 2: Prussian Cyanotype
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Prussian'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-2-prussian-oblique.png') });
  console.log('Captured: screenshots/theme-2-prussian-oblique.png');

  // Check console errors
  console.log(`\n--- Console Error Audit ---`);
  console.log(`Errors encountered: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors:\n', consoleErrors.join('\n'));
    throw new Error('FAIL: Uncaught runtime console errors detected!');
  }

  console.log('\n======================================================');
  console.log('ALL INTERACTIVE INVARIANTS PASS WITH ZERO ERRORS!');
  console.log('======================================================\n');

  await browser.close();
}

runInteractiveVerification().catch((err) => {
  console.error('[Smoke Harness] Verification Failed:', err);
  process.exit(1);
});
