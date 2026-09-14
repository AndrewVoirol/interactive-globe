import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const screenshotsDir = path.resolve('screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

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
      errors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(err.toString());
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for canvas and engine
  await page.waitForSelector('canvas', { timeout: 15000 });
  console.log('Canvas detected.');

  // Wait for WebGPU engine or theme manager to be ready
  await page.waitForTimeout(3000);

  // Check state via DevTools API
  const engineState = await page.evaluate(() => {
    if (window.__INDICATRIX_ENGINE__) {
      return window.__INDICATRIX_ENGINE__.getState();
    }
    return {
      theme: window.theme,
      backend: window.backend,
      mode: typeof window.__INDICATRIX_ENGINE__ !== 'undefined',
    };
  });
  console.log('Initial Engine State:', JSON.stringify(engineState, null, 2));

  // Capture Theme 0 (Marie Tharp)
  await page.evaluate(() => {
    if (window.__INDICATRIX_ENGINE__?.setTheme) {
      window.__INDICATRIX_ENGINE__.setTheme(0);
    } else if (window.setTheme) {
      window.setTheme(0);
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-0-tharp.png') });
  console.log('Captured Theme 0: Marie Tharp');

  // Capture Theme 1 (Cream Rag)
  await page.evaluate(() => {
    if (window.__INDICATRIX_ENGINE__?.setTheme) {
      window.__INDICATRIX_ENGINE__.setTheme(1);
    } else if (window.setTheme) {
      window.setTheme(1);
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-1-cream-rag.png') });
  console.log('Captured Theme 1: Cream Rag');

  // Capture Theme 2 (Prussian Cyanotype)
  await page.evaluate(() => {
    if (window.__INDICATRIX_ENGINE__?.setTheme) {
      window.__INDICATRIX_ENGINE__.setTheme(2);
    } else if (window.setTheme) {
      window.setTheme(2);
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-2-cyanotype.png') });
  console.log('Captured Theme 2: Prussian Cyanotype');

  // Test Morphing Mode 1: Linear Unfurl
  console.log('Testing Mode 1: Linear Unfurl');
  await page.evaluate(() => {
    if (window.__INDICATRIX_ENGINE__?.setMode) {
      window.__INDICATRIX_ENGINE__.setMode(1);
      window.__INDICATRIX_ENGINE__.setAlpha(0.5);
    } else if (window.setMode) {
      window.setMode(1);
      window.setAlpha(0.5);
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotsDir, 'mode-1-unfurl-half.png') });

  // Test Morphing Mode 4: Fluid Advection (mode index 3 in 0-indexed modes)
  console.log('Testing Mode 4: Fluid Advection');
  await page.evaluate(() => {
    if (window.__INDICATRIX_ENGINE__?.setMode) {
      window.__INDICATRIX_ENGINE__.setMode(3);
      window.__INDICATRIX_ENGINE__.setAlpha(0.7);
    } else if (window.setMode) {
      window.setMode(3);
      window.setAlpha(0.7);
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotsDir, 'mode-4-fluid-flow.png') });

  // Reset back to Mode 0 Alpha 0
  await page.evaluate(() => {
    if (window.__INDICATRIX_ENGINE__?.setMode) {
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    }
  });

  // Verify HUD sidebar and tab navigation
  console.log('Testing HUD tabs...');
  const tabNames = ['all', 'medium', 'terrain', 'weather', 'projection'];
  for (const tab of tabNames) {
    const tabSelector = `button[data-tab="${tab}"], button:has-text("${tab.toUpperCase()}")`;
    const tabBtn = page.locator(tabSelector).first();
    if (await tabBtn.count() > 0) {
      await tabBtn.click();
      await page.waitForTimeout(400);
    }
  }

  console.log('\n--- Console Messages Summary ---');
  console.log(`Total messages: ${consoleLogs.length}`);
  console.log(`Errors encountered: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Error details:\n', errors.join('\n'));
  }

  const warnings = consoleLogs.filter(l => l.type === 'warning' || l.type === 'warn');
  console.log(`Warnings encountered: ${warnings.length}`);
  if (warnings.length > 0) {
    console.log('Warning details:\n', warnings.map(w => w.text).slice(0, 10).join('\n'));
  }

  await browser.close();
}

run().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
