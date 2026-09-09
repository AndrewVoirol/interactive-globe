import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.resolve('screenshots');

const THEMES = [
  { index: 0, id: 'tharp', name: 'Marie Tharp (1977)' },
  { index: 1, id: 'cream-rag', name: 'Cream Rag Paper (1842)' },
  { index: 2, id: 'cyanotype', name: 'Prussian Cyanotype (1842)' },
];

async function launchBrowser() {
  return await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--use-gl=angle',
      '--use-angle=metal',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
}

(async () => {
  console.log('Launching browser to recapture Alpine Basin Zoom screenshots...');
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__);

  for (const theme of THEMES) {
    console.log(`\nCapturing Alpine Basin Zoom for Theme: ${theme.name} (${theme.id})`);
    await page.evaluate((themeIdx) => {
      window.__INDICATRIX_ENGINE__.setTheme(themeIdx);
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    }, theme.index);
    await page.waitForTimeout(1000);

    // First, simulate Viewpoint 1 running setObliqueView (to verify targetRef reset works!)
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.setObliqueView(12.0, 44.0, 6.05, 52, 0);
    });
    await page.waitForTimeout(500);

    // Now execute Viewpoint 2: lookAtCoordinates(8.0, 45.0, 5.9)
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(8.0, 45.0, 5.9);
    });
    await page.waitForTimeout(1500);

    // Verify camera target and coordinates
    const camState = await page.evaluate(() => {
      const c = window.__INDICATRIX_CAMERA__.getState?.() || {};
      return c;
    });
    console.log(`Camera State:`, camState);

    const alpinePath = path.join(SCREENSHOTS_DIR, `alpine-basin-zoom-${theme.id}.png`);
    await page.screenshot({ path: alpinePath });
    console.log(`[OK] Saved ${alpinePath}`);
  }

  await page.close();
  await context.close();
  await browser.close();
  console.log('\nRecapture complete!');
})();
