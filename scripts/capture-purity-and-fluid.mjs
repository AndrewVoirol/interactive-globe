import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUT_DIR = '/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/screenshots/before';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
    headless: true,
    args: [
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--enable-features=Vulkan,DefaultANGLEVulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis',
      '--use-gpu-in-tests'
    ]
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2
  });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => window.__INDICATRIX_ENGINE__ && window.__INDICATRIX_ENGINE__.getState().backend === 'webgpu');
  await page.waitForTimeout(2000);

  // 1. Remove any active data layer to achieve pure substrate
  const delBtn = await page.$('button[title*="Remove layer"]');
  if (delBtn) {
    console.log('Removing active dataset layer for pure substrate...');
    await delBtn.click();
    await page.waitForTimeout(1000);
  }

  // Snap to Equator
  const snapEquator = await page.$('button:has-text("Equator")');
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  // Ensure Base State: Mode 0 (Linear), Alpha 0.0, Theme 0 (Dark Cyber), LayerMode 0 (Both)
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(0);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_ENGINE__.setTheme(0);
    window.__INDICATRIX_ENGINE__.setLayerMode(0); // Both Points + Wire
  });
  await page.waitForTimeout(2000);

  const path1 = path.join(OUT_DIR, 'before-mathematical-purity-dark.png');
  await page.screenshot({ path: path1 });
  console.log('Captured:', path1, `(${fs.statSync(path1).size} bytes)`);

  // 2. Fluid Morph at alpha = 0.5
  console.log('Setting Fluid Morph mode (mode 3) at alpha = 0.5...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(3); // Fluid mode
    window.__INDICATRIX_ENGINE__.setAlpha(0.5);
  });
  await page.waitForTimeout(3500); // Allow fluid curl/wave iterations to settle

  const path2 = path.join(OUT_DIR, 'before-fluid-morph-alpha05.png');
  await page.screenshot({ path: path2 });
  console.log('Captured:', path2, `(${fs.statSync(path2).size} bytes)`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
