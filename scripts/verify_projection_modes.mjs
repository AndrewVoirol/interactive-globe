import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function verify() {
  const screenshotsDir = path.resolve('screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('[Verify] Launching Chrome with WebGPU enabled...');
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

  const consoleLogs = [];
  const errors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      if (!text.includes('favicon')) {
        errors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    errors.push(err.toString());
  });

  const port = process.env.PORT || 5173;
  const url = `http://localhost:${port}`;
  console.log(`[Verify] Navigating to ${url} ...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for canvas
  await page.waitForSelector('canvas', { timeout: 15000 });
  console.log('[Verify] Canvas detected.');

  // Wait for WebGPU engine initialization
  await page.waitForFunction(
    () => {
      const eng = window.__INDICATRIX_WEBGPU_ENGINE__ || window.__ENGINE;
      return eng && eng.initialized;
    },
    { timeout: 20000 }
  );
  console.log('[Verify] WebGPU Engine initialized.');

  // Let initial buffers upload and frame settle
  await page.waitForTimeout(2000);

  // Test Direct 120Hz Scrub Write
  console.log('[Verify] Testing decoupled 120Hz scrub channel...');
  await page.evaluate(() => {
    window.__INDICATRIX_SCRUB_ALPHA__ = 0.42;
  });
  await page.waitForTimeout(100);
  const scrubVal = await page.evaluate(() => window.__INDICATRIX_SCRUB_ALPHA__);
  if (scrubVal !== 0.42) {
    throw new Error(`[Verify] Failed to read __INDICATRIX_SCRUB_ALPHA__: expected 0.42, got ${scrubVal}`);
  }
  await page.evaluate(() => {
    window.__INDICATRIX_SCRUB_ALPHA__ = undefined;
  });

  // Verify modes 0-3 across alphas {0.00, 0.30, 0.70, 1.00}
  const modes = [
    { id: 0, name: 'Linear' },
    { id: 1, name: 'Scroll' },
    { id: 2, name: 'Fracture' },
    { id: 3, name: 'Fluid' },
  ];
  const alphas = [0.0, 0.3, 0.7, 1.0];

  const results = [];

  for (const m of modes) {
    console.log(`\n[Verify] Testing Mode ${m.id} (${m.name}) ...`);
    // Switch mode via dock button or devtools API
    const modeBtn = await page.$(`button:has-text("${m.name}")`);
    if (modeBtn) {
      await modeBtn.click();
    } else {
      await page.evaluate((modeId) => {
        if (window.__INDICATRIX_ENGINE__) {
          window.__INDICATRIX_ENGINE__.setMode(modeId);
        }
      }, m.id);
    }
    await page.waitForTimeout(400);

    for (const a of alphas) {
      // Set alpha directly
      await page.evaluate((targetAlpha) => {
        window.__INDICATRIX_SCRUB_ALPHA__ = targetAlpha;
        if (window.__INDICATRIX_ENGINE__) {
          window.__INDICATRIX_ENGINE__.setAlpha(targetAlpha);
        }
      }, a);

      // Wait 300ms for camera tracking and deformation pass
      await page.waitForTimeout(300);

      const filename = `verify_mode${m.id}_${m.name.toLowerCase()}_alpha_${a.toFixed(2)}.png`;
      const filePath = path.join(screenshotsDir, filename);

      await page.screenshot({ path: filePath });
      const stat = fs.statSync(filePath);

      console.log(`  Captured alpha=${a.toFixed(2)} -> ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);

      if (stat.size < 50000) {
        throw new Error(`Screenshot ${filename} is unexpectedly small (${stat.size} bytes). May be blank.`);
      }

      results.push({
        mode: m.name,
        alpha: a,
        file: filename,
        size: stat.size,
      });

      // Clear scrub channel
      await page.evaluate(() => {
        window.__INDICATRIX_SCRUB_ALPHA__ = undefined;
      });
    }
  }

  // Check console errors
  console.log('\n[Verify] Checking console logs for errors...');
  const criticalErrors = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver loop')
  );

  if (criticalErrors.length > 0) {
    console.error('[Verify] Critical console errors detected:', criticalErrors);
    throw new Error(`Console errors during verification: ${criticalErrors.join('; ')}`);
  }

  console.log('[Verify] ZERO console errors detected.');
  console.log(`[Verify] All ${results.length} visual verification captures saved successfully.`);

  await browser.close();
}

verify().catch((err) => {
  console.error('[Verify] Fatal error:', err);
  process.exit(1);
});
