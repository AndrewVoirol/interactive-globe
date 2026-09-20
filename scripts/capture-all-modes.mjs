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

  await page.waitForFunction(
    () => window.__INDICATRIX_ENGINE__ && window.__INDICATRIX_ENGINE__.getState().backend === 'webgpu',
    { timeout: 20000 }
  );
  console.log('Engine initialized in WebGPU mode.');
  await page.waitForTimeout(2000);

  // Test Mode 1 (Scroll), Mode 2 (Griffith), Mode 3 (Fluid) at alpha 0.5
  const modes = [
    { id: 1, name: 'mode1-cylindrical-scroll' },
    { id: 2, name: 'mode2-griffith-fracture' },
    { id: 3, name: 'mode3-fluid-morph' },
  ];

  for (const m of modes) {
    console.log(`\nTesting ${m.name} (Mode ${m.id}) at alpha 0.5...`);
    await page.evaluate((modeId) => {
      if (window.setMode) {
        window.setMode(modeId);
      }
      if (window.__INDICATRIX_SET_PURITY_MODE__) {
        window.__INDICATRIX_SET_PURITY_MODE__(false);
      }
      window.__INDICATRIX_ENGINE__.setAlpha(0.5);
    }, m.id);
    await page.waitForTimeout(2500);

    const filename = `${m.name}-alpha0.5.png`;
    const targetPath = path.join(OUT_DIR, filename);
    await page.screenshot({ path: targetPath });
    const stat = fs.statSync(targetPath);
    console.log(`Captured: ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  await browser.close();

  console.log('\n--- ALL MODES CAPTURE SUMMARY ---');
  console.log(`Total console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('Errors encountered:', consoleErrors);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
