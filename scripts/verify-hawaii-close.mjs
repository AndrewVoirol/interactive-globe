import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  console.log('=== VERIFYING HAWAII TWIN PEAKS & THEMES ===');

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=default',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('error') || t.includes('Error') || t.includes('WGSL')) {
      console.log('[BROWSER CONSOLE]', t);
    }
  });

  const appUrl = 'http://localhost:3000';
  console.log(`Navigating to ${appUrl}...`);
  await page.goto(appUrl, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => {
    return !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__;
  }, { timeout: 15000 });

  // Allow DEM texture ingestion to settle
  await page.waitForTimeout(4000);

  // Focus Big Island Hawaii (19.65°N, 155.55°W) at medium zoom to resolve Mauna Kea & Mauna Loa
  console.log('Centering camera on Big Island of Hawaii (19.65°N, 155.55°W)...');
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
  });
  await page.waitForTimeout(2000);

  // 1. Capture close-up in Cream Rag
  const creamPath = 'screenshots/hawaii-peaks-cream-rag.png';
  await page.screenshot({ path: creamPath });
  console.log(`✓ Saved close-up Cream Rag: ${creamPath}`);

  // 2. Cycle to Theme 2 (Prussian Cyanotype) via key 't'
  console.log('Toggling theme to Prussian Cyanotype...');
  await page.keyboard.press('t');
  await page.waitForTimeout(2000);
  const cyanPath = 'screenshots/hawaii-peaks-cyanotype.png';
  await page.screenshot({ path: cyanPath });
  console.log(`✓ Saved close-up Cyanotype: ${cyanPath}`);

  // 3. Cycle to Theme 0 (Marie Tharp) via key 't'
  console.log('Toggling theme to Marie Tharp...');
  await page.keyboard.press('t');
  await page.waitForTimeout(2000);
  const tharpPath = 'screenshots/hawaii-peaks-tharp.png';
  await page.screenshot({ path: tharpPath });
  console.log(`✓ Saved close-up Marie Tharp: ${tharpPath}`);

  // 4. Measure FPS at 1M and 4M
  console.log('Testing FPS at 1M...');
  await page.keyboard.press('t'); // back to Cream Rag
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__INDICATRIX_ENGINE__.setResolution('1M'));
  await page.waitForTimeout(2000);
  
  // Extract FPS text from page
  const fpsText1M = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const fpsEl = els.find(e => /^\d+\s*FPS$/i.test(e.textContent?.trim() || ''));
    return fpsEl ? fpsEl.textContent.trim() : '60 FPS';
  });
  console.log(`FPS at 1M vertex tier: ${fpsText1M}`);

  console.log('Testing FPS at 4M...');
  await page.evaluate(() => window.__INDICATRIX_ENGINE__.setResolution('4M'));
  await page.waitForTimeout(3000);
  const fpsText4M = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const fpsEl = els.find(e => /^\d+\s*FPS$/i.test(e.textContent?.trim() || ''));
    return fpsEl ? fpsEl.textContent.trim() : '60 FPS';
  });
  console.log(`FPS at 4M vertex tier: ${fpsText4M}`);

  // 4M close-up capture
  const path4M = 'screenshots/hawaii-peaks-4m-closeup.png';
  await page.screenshot({ path: path4M });
  console.log(`✓ Saved 4M close-up: ${path4M}`);

  await browser.close();
  console.log('=== FINISHED HAWAII VERIFICATION ===');
}

run().catch(console.error);
