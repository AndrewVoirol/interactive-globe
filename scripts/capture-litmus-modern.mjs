import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
  console.log('Launching browser for Multi-Medium Visual Parity Verification...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=default',
      '--use-gpu-in-tests',
      '--ignore-gpu-blocklist',
      '--enable-features=Vulkan,DefaultANGLEVulkan,Metal',
      '--use-angle=metal',
      '--window-size=1920,1080'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  await page.waitForFunction(() => !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__, { timeout: 30000 });
  console.log('Engine & Camera loaded.');

  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(2500);

  fs.mkdirSync('screenshots/modern-audit', { recursive: true });

  const themes = [
    { id: 0, name: 'marie_tharp' },
    { id: 1, name: 'cream_rag' },
    { id: 2, name: 'prussian_cyanotype' }
  ];

  const alphas = [0.0, 0.5, 1.0];

  // 1. Hawaii Litmus at α ∈ {0.0, 0.5, 1.0} across all 3 themes
  console.log('\n--- Capturing Hawaii Litmus across 3 Themes and 3 Alphas (9 Captures) ---');
  for (const th of themes) {
    for (const alpha of alphas) {
      await page.evaluate(({ t, a }) => {
        window.__INDICATRIX_ENGINE__.setTheme(t);
        window.__INDICATRIX_ENGINE__.setAlpha(a);
        window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
      }, { t: th.id, a: alpha });

      await wait(2000); // Allow DEM sampling and render stabilization

      const filename = `screenshots/modern-audit/hawaii_theme${th.id}_alpha${alpha}.png`;
      await page.screenshot({ path: filename });
      const stats = fs.statSync(filename);
      console.log(`Saved ${filename} (${(stats.size / 1024).toFixed(1)} KB) [Theme: ${th.name}, Alpha: ${alpha}]`);
    }
  }

  // 2. Medium Canonical Reference Views
  console.log('\n--- Capturing Canonical Reference Litmus Views ---');
  // Swiss Alps (Theme 1)
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(1);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(10.0, 46.0, 5.8);
  });
  await wait(2500);
  await page.screenshot({ path: 'screenshots/modern-audit/litmus_theme1_swiss_alps.png' });
  console.log('Saved screenshots/modern-audit/litmus_theme1_swiss_alps.png');

  // Cape Cod (Theme 2)
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(2);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-70.0, 42.0, 6.2);
  });
  await wait(2500);
  await page.screenshot({ path: 'screenshots/modern-audit/litmus_theme2_cape_cod.png' });
  console.log('Saved screenshots/modern-audit/litmus_theme2_cape_cod.png');

  await browser.close();
  console.log('Visual capture completed successfully.');
})();
