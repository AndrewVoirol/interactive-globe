import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map';
const OUT_DIR = path.join(BASE_DIR, 'screenshots');
const OUT_AFTER_DIR = path.join(BASE_DIR, 'screenshots/after');

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

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => window.__INDICATRIX_ENGINE__ && window.__INDICATRIX_ENGINE__.getState().backend === 'webgpu');
  await page.waitForTimeout(2000);

  // Ensure pure substrate (no dataset layers)
  const delBtn = await page.$('button[title*="Remove layer"]');
  if (delBtn) {
    await delBtn.click();
    await page.waitForTimeout(1000);
  }

  // Snap Equator
  const snapEquator = await page.$('button:has-text("Equator")');
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  // 1. Fluid Morph at alpha = 0.5 with LayerMode = 0 (Both Points + Wire)
  console.log('Configuring Fluid Morph at alpha = 0.5 (LayerMode: Both)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setLayerMode(0); // Both Points + Wire
    window.__INDICATRIX_ENGINE__.setMode(3);      // Mode 3 = Fluid Flow
    window.__INDICATRIX_ENGINE__.setAlpha(0.5);   // alpha = 0.5
  });
  await page.waitForTimeout(4000); // Allow solenoidal curl noise and silk drape passes to settle

  const pathFluid = path.join(OUT_DIR, 'after-fluid-morph-alpha05.png');
  const pathFluidCopy = path.join(OUT_AFTER_DIR, 'after-fluid-morph-alpha05.png');
  await page.screenshot({ path: pathFluid });
  fs.copyFileSync(pathFluid, pathFluidCopy);
  console.log('Saved:', pathFluid, `(${fs.statSync(pathFluid).size} bytes)`);

  // 2. Dymaxion Unfold at alpha = 1.0 with LayerMode = 0 (Both Points + Wire)
  console.log('Configuring Dymaxion Unfold at alpha = 1.0 (LayerMode: Both)...');
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setLayerMode(0); // Both Points + Wire
    window.__INDICATRIX_ENGINE__.setMode(4);      // Mode 4 = Dymaxion
    window.__INDICATRIX_ENGINE__.setAlpha(1.0);   // alpha = 1.0
  });
  await page.waitForTimeout(4000); // Allow 20 facets to unfold and lock into planar net

  const pathDymaxion = path.join(OUT_DIR, 'after-dymaxion-unfold.png');
  const pathDymaxionCopy = path.join(OUT_AFTER_DIR, 'after-dymaxion-unfold.png');
  await page.screenshot({ path: pathDymaxion });
  fs.copyFileSync(pathDymaxion, pathDymaxionCopy);
  console.log('Saved:', pathDymaxion, `(${fs.statSync(pathDymaxion).size} bytes)`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
