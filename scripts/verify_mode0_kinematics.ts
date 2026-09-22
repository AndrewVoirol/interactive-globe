import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { preview } from 'vite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function verify() {
  const screenshotsDir = path.resolve(ROOT_DIR, 'screenshots/mode0-calibration');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const port = 5184;
  console.log(`[Verify] Starting ephemeral Vite preview server on port ${port}...`);
  const server = await preview({ root: ROOT_DIR, preview: { port } });
  const localUrl = server.resolvedUrls?.local?.[0] || `http://localhost:${port}`;
  console.log(`[Verify] Preview server live at ${localUrl}`);

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

  const consoleLogs: Array<{ type: string; text: string }> = [];
  const errors: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      if (!text.includes('favicon') && !text.includes('ResizeObserver')) {
        errors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    errors.push(err.toString());
  });

  console.log(`[Verify] Navigating to ${localUrl} ...`);
  await page.goto(localUrl, { waitUntil: 'networkidle' });

  // Wait for canvas
  await page.waitForSelector('canvas', { timeout: 15000 });
  console.log('[Verify] Canvas detected.');

  // Wait for WebGPU engine initialization
  await page.waitForFunction(
    () => {
      const eng = (window as any).__INDICATRIX_WEBGPU_ENGINE__ || (window as any).__ENGINE || (window as any).__INDICATRIX_ENGINE__;
      return eng && (eng.initialized || eng.isInitialized);
    },
    { timeout: 30000 }
  );
  console.log('[Verify] WebGPU Engine initialized.');

  // Let initial buffers settle
  await page.waitForTimeout(2000);

  // Set Mode 0 (Linear/Developable Unfurl)
  await page.evaluate(() => {
    if ((window as any).__INDICATRIX_ENGINE__) {
      (window as any).__INDICATRIX_ENGINE__.setMode(0);
    }
    if ((window as any).setMode) {
      (window as any).setMode(0);
    }
  });
  await page.waitForTimeout(400);

  const themes = [
    { id: 1, name: 'cream_rag' },
    { id: 2, name: 'prussian_cyanotype' },
    { id: 0, name: 'marie_tharp' },
  ];

  const alphas = [0.0, 0.05, 0.25, 0.50, 0.75, 1.00];
  const results: Array<{ theme: string; alpha: number; file: string; size: number }> = [];

  for (const theme of themes) {
    console.log(`\n[Verify] Switching to Theme ${theme.id} (${theme.name})...`);
    await page.evaluate((themeId) => {
      if (typeof (window as any).setTheme === 'function') {
        (window as any).setTheme(themeId);
      } else if ((window as any).__INDICATRIX_DEVTOOLS__?.setTheme) {
        (window as any).__INDICATRIX_DEVTOOLS__.setTheme(themeId);
      }
    }, theme.id);
    await page.waitForTimeout(500);

    for (const a of alphas) {
      await page.evaluate((targetAlpha) => {
        (window as any).__INDICATRIX_SCRUB_ALPHA__ = targetAlpha;
        if ((window as any).__INDICATRIX_ENGINE__) {
          (window as any).__INDICATRIX_ENGINE__.setAlpha(targetAlpha);
        }
      }, a);

      // Wait 350ms for camera tracking and deformation pass
      await page.waitForTimeout(350);

      const filename = `mode0_${theme.name}_alpha_${a.toFixed(2)}.png`;
      const filePath = path.join(screenshotsDir, filename);

      await page.screenshot({ path: filePath });
      const stat = fs.statSync(filePath);

      console.log(`  Captured ${theme.name} @ alpha=${a.toFixed(2)} -> ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);

      if (stat.size < 50000) {
        throw new Error(`Screenshot ${filename} is unexpectedly small (${stat.size} bytes). Blank canvas detected!`);
      }

      results.push({
        theme: theme.name,
        alpha: a,
        file: filename,
        size: stat.size,
      });

      // Clear scrub channel
      await page.evaluate(() => {
        (window as any).__INDICATRIX_SCRUB_ALPHA__ = undefined;
      });
    }
  }

  // Check console logs for errors
  console.log('\n[Verify] Checking console logs for critical errors...');
  const criticalErrors = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver')
  );

  if (criticalErrors.length > 0) {
    console.error('[Verify] Critical console errors detected:', criticalErrors);
    throw new Error(`Console errors during verification: ${criticalErrors.join('; ')}`);
  }

  console.log('[Verify] ZERO WebGPU/WGSL console errors detected.');
  console.log(`[Verify] All ${results.length} Mode 0 visual verification captures saved successfully.`);

  await browser.close();
  await server.close();
  console.log('[Verify] Closed browser and ephemeral server cleanly.');
}

verify().catch((err) => {
  console.error('[Verify] Fatal verification failure:', err);
  process.exit(1);
});
