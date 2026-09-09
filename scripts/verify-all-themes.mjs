import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function verifyAllThemes() {
  console.log('=== INDICATRIX ENGINE: MULTI-THEME SHADER VERIFICATION ===');

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

  const allLogs = [];
  const errors = [];
  const wgslErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    allLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error' || text.toLowerCase().includes('error') || text.includes('WGSL') || text.includes('Shader')) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
      if (text.includes('WGSL') || text.includes('compilation error') || text.includes('fwidth') || text.includes('Shader')) {
        wgslErrors.push(text);
      }
      errors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err.message);
    errors.push(err.message);
  });

  const appUrl = process.env.APP_URL || 'http://localhost:3001';
  console.log(`Navigating to ${appUrl}...`);
  await page.goto(appUrl, { waitUntil: 'networkidle' });

  // Wait for WebGPU canvas and engine initialization
  console.log('Waiting for engine initialization...');
  await page.waitForFunction(() => {
    return !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__;
  }, { timeout: 20000 });

  // Allow textures to settle
  await page.waitForTimeout(3000);

  fs.mkdirSync('screenshots/theme-verify', { recursive: true });

  const initialState = await page.evaluate(() => {
    return window.__INDICATRIX_ENGINE__.getState();
  });
  console.log(`Initial Theme: ${initialState.theme}`);

  // Helper to set theme programmatically via engine
  const setTheme = async (targetTheme) => {
    console.log(`Setting theme to ${targetTheme}...`);
    await page.evaluate((th) => {
      window.__INDICATRIX_ENGINE__.setTheme(th);
    }, targetTheme);
    await page.waitForTimeout(1500);
    const confirmed = await page.evaluate(() => window.__INDICATRIX_ENGINE__.getState().theme);
    console.log(`Confirmed current theme: ${confirmed}`);
  };

  // Helper to toggle wind ribbons and origami crane
  console.log('Activating winds and vector overlays...');
  await page.evaluate(() => {
    // Ensure vector overlays are enabled
    window.__INDICATRIX_ENGINE__.setShowVectors(true);
    // Keyboard shortcuts to trigger winds and features
    // Key 'w' toggles air dancer, 'v' toggles vectors
  });
  await page.waitForTimeout(1000);

  const viewpoints = [
    {
      name: 'globe',
      setup: async () => {
        await page.evaluate(() => {
          window.__INDICATRIX_CAMERA__.lookAtCoordinates(0.0, 20.0, 15.0);
        });
      },
    },
    {
      name: 'europe_alps',
      setup: async () => {
        await page.evaluate(() => {
          window.__INDICATRIX_CAMERA__.lookAtCoordinates(10.0, 46.0, 6.2);
        });
      },
    },
    {
      name: 'pacific_hawaii',
      setup: async () => {
        await page.evaluate(() => {
          window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
        });
      },
    },
  ];

  const themes = [
    { id: 1, name: 'cream_rag' },
    { id: 2, name: 'cyanotype' },
    { id: 0, name: 'marie_tharp' },
  ];

  for (const vp of viewpoints) {
    console.log(`\n=== Testing Viewpoint: ${vp.name} ===`);
    await vp.setup();
    await page.waitForTimeout(2000);

    for (const th of themes) {
      console.log(`--- Viewpoint ${vp.name} with Theme: ${th.name} (${th.id}) ---`);
      await setTheme(th.id);
      await page.waitForTimeout(2000);

      const shotPath = `screenshots/theme-verify/${vp.name}-${th.name}.png`;
      await page.screenshot({ path: shotPath });
      console.log(`✓ Saved screenshot: ${shotPath}`);
    }
  }

  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`Total console logs: ${allLogs.length}`);
  console.log(`Total console errors: ${errors.length}`);
  console.log(`Total WGSL compilation errors: ${wgslErrors.length}`);

  if (wgslErrors.length > 0) {
    console.error('FATAL: WGSL compilation errors detected:', wgslErrors);
    throw new Error(`WGSL compilation errors: ${wgslErrors.join('\n')}`);
  } else {
    console.log('✓ ZERO WGSL compilation errors detected across all themes and viewpoints!');
  }

  await browser.close();
}

verifyAllThemes().catch((err) => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
