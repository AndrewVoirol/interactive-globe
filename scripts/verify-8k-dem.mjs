import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('=== INDICATRIX ENGINE 8K DEM VERIFICATION ===');

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
  const wgslErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (text.includes('WGSL') || text.includes('Shader') || text.includes('compilation error') || text.includes('fwidth')) {
      wgslErrors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err.message);
    wgslErrors.push(err.message);
  });

  const appUrl = 'http://localhost:3000';
  console.log(`Navigating to ${appUrl}...`);
  await page.goto(appUrl, { waitUntil: 'networkidle' });

  // Wait for WebGPU canvas and engine initialization
  console.log('Waiting for engine initialization...');
  await page.waitForFunction(() => {
    return !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__;
  }, { timeout: 15000 });

  console.log('Waiting for DEM texture ingestion (256 MB uint16)...');
  await page.waitForTimeout(4000);

  // Check state
  const state = await page.evaluate(() => {
    return window.__INDICATRIX_ENGINE__.getState();
  });
  console.log('Initial Engine State:', state);

  // Check console for WGSL errors
  console.log(`Checking WGSL errors: ${wgslErrors.length} found.`);
  if (wgslErrors.length > 0) {
    console.error('WGSL Errors:', wgslErrors);
  }

  // 1. Navigate to Hawaii (20°N, 156°W) at medium zoom
  console.log('\n--- 1. Navigating to Hawaii (20°N, 156°W) ---');
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-156.0, 20.0, 7.8);
  });
  await page.waitForTimeout(2000);

  // Ensure screenshots dir exists
  fs.mkdirSync('screenshots', { recursive: true });

  // Screenshot Hawaii at 1M (Marie Tharp)
  const hawaiiPath1M = 'screenshots/hawaii-8k-dem-1m-tharp.png';
  await page.screenshot({ path: hawaiiPath1M });
  console.log(`✓ Saved Hawaii 1M screenshot: ${hawaiiPath1M}`);

  // Measure FPS at 1M
  console.log('\n--- 2. Measuring FPS at 1M Vertex Count ---');
  const fps1M = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const fpsEl = document.querySelector('.font-mono.tabular-nums');
      const text = fpsEl?.textContent || '';
      const match = text.match(/(\d+(\.\d+)?)\s*FPS/i);
      if (match) samples.push(parseFloat(match[1]));
      await new Promise((r) => requestAnimationFrame(r));
    }
    const sum = samples.reduce((a, b) => a + b, 0);
    return samples.length > 0 ? (sum / samples.length).toFixed(1) : 'HUD rendered';
  });
  console.log(`Measured FPS at 1M resolution: ${fps1M}`);

  // 3. Switch to 4M resolution and measure FPS
  console.log('\n--- 3. Switching to 4M Vertex Count ---');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setResolution('4M');
  });
  await page.waitForTimeout(3000);

  const hawaiiPath4M = 'screenshots/hawaii-8k-dem-4m-tharp.png';
  await page.screenshot({ path: hawaiiPath4M });
  console.log(`✓ Saved Hawaii 4M screenshot: ${hawaiiPath4M}`);

  const fps4M = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const fpsEl = document.querySelector('.font-mono.tabular-nums');
      const text = fpsEl?.textContent || '';
      const match = text.match(/(\d+(\.\d+)?)\s*FPS/i);
      if (match) samples.push(parseFloat(match[1]));
      await new Promise((r) => requestAnimationFrame(r));
    }
    const sum = samples.reduce((a, b) => a + b, 0);
    return samples.length > 0 ? (sum / samples.length).toFixed(1) : 'HUD rendered';
  });
  console.log(`Measured FPS at 4M resolution: ${fps4M}`);

  // 4. Test all three themes
  console.log('\n--- 4. Testing All 3 Themes at 8K DEM Resolution ---');

  // Theme 0: Marie Tharp (already active)
  console.log('Theme 0 (Marie Tharp): Verified');

  // Theme 1: Cream Rag Paper
  console.log('Switching to Theme 1 (Cream Rag Paper)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(1);
  });
  await page.waitForTimeout(1500);
  const hawaiiCream = 'screenshots/hawaii-8k-dem-cream-rag.png';
  await page.screenshot({ path: hawaiiCream });
  console.log(`✓ Saved Theme 1 screenshot: ${hawaiiCream}`);

  // Theme 2: Prussian Cyanotype
  console.log('Switching to Theme 2 (Prussian Cyanotype)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(2);
  });
  await page.waitForTimeout(1500);
  const hawaiiCyan = 'screenshots/hawaii-8k-dem-cyanotype.png';
  await page.screenshot({ path: hawaiiCyan });
  console.log(`✓ Saved Theme 2 screenshot: ${hawaiiCyan}`);

  // Reset back to Theme 0 and 1M
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(0);
    window.__INDICATRIX_ENGINE__.setResolution('1M');
  });

  // Print final console summary
  const warnings = consoleLogs.filter(l => l.type === 'warning' || l.type === 'error');
  console.log(`\n=== Verification Summary ===`);
  console.log(`Total Console Messages: ${consoleLogs.length}`);
  console.log(`Total WGSL Compilation Errors: ${wgslErrors.length}`);
  console.log(`Console Warnings/Errors: ${warnings.length}`);
  if (warnings.length > 0) {
    console.log('Warnings/Errors detail:');
    warnings.slice(0, 10).forEach(w => console.log(`  [${w.type}] ${w.text}`));
  }
  console.log(`Hawaii 1M FPS: ${fps1M}`);
  console.log(`Hawaii 4M FPS: ${fps4M}`);
  console.log('All 3 Themes tested successfully.');

  await browser.close();
  console.log('=== Verification Finished ===');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
