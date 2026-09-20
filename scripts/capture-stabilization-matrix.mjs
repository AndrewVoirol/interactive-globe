import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve('screenshots/matrix');

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const chromeDev = '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
  const chromeStable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = fs.existsSync(chromeDev) ? chromeDev : chromeStable;

  console.log(`Using Chrome binary: ${executablePath}`);

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
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ]
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2
  });

  const consoleErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error' || text.toLowerCase().includes('webgpu') || text.toLowerCase().includes('error')) {
      console.log(`[PAGE ${type.toUpperCase()}]: ${text}`);
      if (type === 'error') {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', err => {
    console.error('[PAGE UNCAUGHT]:', err.message);
    consoleErrors.push(err.message);
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');

  // Wait for Indicatrix engine to be fully initialized
  await page.waitForFunction(
    () => window.__INDICATRIX_ENGINE__ && window.__INDICATRIX_ENGINE__.getState().backend === 'webgpu',
    { timeout: 20000 }
  );
  console.log('Engine initialized in WebGPU mode.');
  await page.waitForTimeout(2000);

  // Remove any active overlay/data layer to ensure clean visualization
  await page.evaluate(() => {
    if (window.__INDICATRIX_SET_PURITY_MODE__) {
      window.__INDICATRIX_SET_PURITY_MODE__(false);
    }
    if (window.setMode) {
      window.setMode(0); // Mode 0: Spheroidal Linear Unfurling
    }
  });
  await page.waitForTimeout(1000);

  // 1. Capture 3x3 Matrix: Themes 0, 1, 2 at Alpha 0.0, 0.5, 1.0
  const themes = [
    { id: 0, name: 'theme0-tharp' },
    { id: 1, name: 'theme1-cream-rag' },
    { id: 2, name: 'theme2-cyanotype' },
  ];
  const alphas = [0.0, 0.5, 1.0];

  for (const th of themes) {
    console.log(`\nSetting Theme ${th.id} (${th.name})...`);
    await page.evaluate((themeId) => {
      window.__INDICATRIX_ENGINE__.setTheme(themeId);
      if (window.__INDICATRIX_SET_PURITY_MODE__) {
        window.__INDICATRIX_SET_PURITY_MODE__(false);
      }
    }, th.id);
    await page.waitForTimeout(1500);

    for (const alpha of alphas) {
      console.log(`  Setting alpha = ${alpha}...`);
      await page.evaluate((a) => {
        window.__INDICATRIX_ENGINE__.setAlpha(a);
      }, alpha);
      await page.waitForTimeout(2000);

      const filename = `${th.name}-alpha${alpha.toFixed(1)}.png`;
      const targetPath = path.join(OUT_DIR, filename);
      await page.screenshot({ path: targetPath });
      const stat = fs.statSync(targetPath);
      console.log(`  Captured: ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
  }

  // 2. Capture Purity Mode: DEM Only at alpha = 0.0 and alpha = 0.5
  console.log('\nTesting Purity Mode: DEM Only...');
  await page.evaluate(() => {
    if (window.__INDICATRIX_SET_PURITY_MODE__) {
      window.__INDICATRIX_SET_PURITY_MODE__(true);
    } else if (window.setPurityMode) {
      window.setPurityMode(true);
    }
    window.__INDICATRIX_ENGINE__.setTheme(0);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
  });
  await page.waitForTimeout(2000);

  let purityPath = path.join(OUT_DIR, 'purity-dem-only-alpha0.0.png');
  await page.screenshot({ path: purityPath });
  console.log(`Captured: purity-dem-only-alpha0.0.png (${(fs.statSync(purityPath).size / 1024).toFixed(1)} KB)`);

  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setAlpha(0.5);
  });
  await page.waitForTimeout(2000);

  purityPath = path.join(OUT_DIR, 'purity-dem-only-alpha0.5.png');
  await page.screenshot({ path: purityPath });
  console.log(`Captured: purity-dem-only-alpha0.5.png (${(fs.statSync(purityPath).size / 1024).toFixed(1)} KB)`);

  await browser.close();

  console.log('\n--- CAPTURE SUMMARY ---');
  console.log(`Total console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('Errors encountered:', consoleErrors);
  }
}

main().catch(err => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
