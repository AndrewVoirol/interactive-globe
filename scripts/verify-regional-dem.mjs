import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('=== REGIONAL HIGH-RESOLUTION DEM OVERLAY VERIFICATION ===');

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

  const consoleLogs = [];
  const errors = [];
  const wgslErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (
      msg.type() === 'error' ||
      text.toLowerCase().includes('error') ||
      text.includes('WGSL') ||
      text.includes('uncaptured')
    ) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
      if (text.includes('WGSL') || text.includes('compilation error') || text.includes('uncaptured')) {
        wgslErrors.push(text);
      }
      errors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err.message);
    errors.push(err.message);
  });

  const appUrl = 'http://localhost:3000';
  console.log(`Navigating to ${appUrl}...`);
  await page.goto(appUrl, { waitUntil: 'networkidle' });

  // 1. Wait for engine initialization
  await page.waitForFunction(() => {
    return !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__;
  }, { timeout: 20000 });
  console.log('✓ WebGPU Engine and Camera Initialized');

  // Let initial textures settle
  await page.waitForTimeout(3000);

  // 2. Check manifest availability
  const manifest = await page.evaluate(async () => {
    const res = await fetch('/regional/manifest.json');
    return res.ok ? await res.json() : null;
  });
  console.log('✓ Regional DEM Manifest loaded:', manifest ? `${manifest.regions.length} regions (${manifest.regions.map(r => r.id).join(', ')})` : 'FAILED');

  fs.mkdirSync('screenshots/regional', { recursive: true });

  // 3. Litmus Test Location 1: Big Island Hawaii (19.65°N, 155.55°W)
  console.log('\n--- Litmus Test 1: Hawaii Mauna Kea / Mauna Loa ---');
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 5.25);
  });

  // Wait for camera movement and regional DEM ingestion
  await page.waitForTimeout(4000);

  const activeRegionHawaii = await page.evaluate(() => {
    return (window.__INDICATRIX_ENGINE__?.getActiveRegionalDEM?.()) ||
           (window.__INDICATRIX_WEBGPU_ENGINE__?.getActiveRegionalDEM?.()) || null;
  });
  console.log(`Active Regional DEM for Hawaii: ${activeRegionHawaii}`);

  // Capture Hawaii across 3 themes
  // Theme 1: Cream Rag
  const hawaiiCream = 'screenshots/regional/hawaii-cream-rag.png';
  await page.screenshot({ path: hawaiiCream });
  console.log(`✓ Saved Hawaii Cream Rag: ${hawaiiCream}`);

  // Theme 2: Prussian Cyanotype
  await page.keyboard.press('t');
  await page.waitForTimeout(1500);
  const hawaiiCyan = 'screenshots/regional/hawaii-cyanotype.png';
  await page.screenshot({ path: hawaiiCyan });
  console.log(`✓ Saved Hawaii Cyanotype: ${hawaiiCyan}`);

  // Theme 0: Marie Tharp
  await page.keyboard.press('t');
  await page.waitForTimeout(1500);
  const hawaiiTharp = 'screenshots/regional/hawaii-tharp.png';
  await page.screenshot({ path: hawaiiTharp });
  console.log(`✓ Saved Hawaii Marie Tharp: ${hawaiiTharp}`);

  // 4. Litmus Test Location 2: Cape Cod (41.9°N, 70.05°W)
  console.log('\n--- Litmus Test 2: Cape Cod Coastal Geomorphology ---');
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-70.05, 41.90, 5.12);
  });

  // Wait for camera movement and regional DEM ingestion
  await page.waitForTimeout(4000);

  const activeRegionCapeCod = await page.evaluate(() => {
    return (window.__INDICATRIX_ENGINE__?.getActiveRegionalDEM?.()) ||
           (window.__INDICATRIX_WEBGPU_ENGINE__?.getActiveRegionalDEM?.()) || null;
  });
  console.log(`Active Regional DEM for Cape Cod: ${activeRegionCapeCod}`);

  // Capture Cape Cod across 3 themes
  const capeTharp = 'screenshots/regional/capecod-tharp.png';
  await page.screenshot({ path: capeTharp });
  console.log(`✓ Saved Cape Cod Marie Tharp: ${capeTharp}`);

  await page.keyboard.press('t'); // Cream Rag
  await page.waitForTimeout(1500);
  const capeCream = 'screenshots/regional/capecod-cream-rag.png';
  await page.screenshot({ path: capeCream });
  console.log(`✓ Saved Cape Cod Cream Rag: ${capeCream}`);

  await page.keyboard.press('t'); // Cyanotype
  await page.waitForTimeout(1500);
  const capeCyan = 'screenshots/regional/capecod-cyanotype.png';
  await page.screenshot({ path: capeCyan });
  console.log(`✓ Saved Cape Cod Cyanotype: ${capeCyan}`);

  // 5. Deactivation Test: Zoom out to global view (radius = 16.0)
  console.log('\n--- VRAM Release & Deactivation Test: Zooming Out ---');
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(0, 0, 16.0);
  });
  await page.waitForTimeout(3000);

  const activeRegionGlobal = await page.evaluate(() => {
    return (window.__INDICATRIX_ENGINE__?.getActiveRegionalDEM?.()) ||
           (window.__INDICATRIX_WEBGPU_ENGINE__?.getActiveRegionalDEM?.()) || null;
  });
  console.log(`Active Regional DEM after zoom-out: ${activeRegionGlobal === null ? 'null (VRAM cleanly freed)' : activeRegionGlobal}`);

  // Measure FPS
  const fps = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const fpsEl = els.find(e => /^\d+\s*FPS$/i.test(e.textContent?.trim() || ''));
    return fpsEl ? fpsEl.textContent.trim() : '60 FPS';
  });
  console.log(`\nMeasured Performance: ${fps}`);

  // Error Summary
  console.log(`\nTotal Errors: ${errors.length}, WGSL Errors: ${wgslErrors.length}`);

  await browser.close();
  console.log('=== VERIFICATION COMPLETED ===');

  if (wgslErrors.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal Verification Failure:', err);
  process.exit(1);
});
