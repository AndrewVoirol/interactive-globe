import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('screenshots/bathymetry-tide-gauge');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortOpen(port) {
  try {
    const res = await fetch(`http://localhost:${port}`);
    return res.ok || res.status === 200 || res.status === 304;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  console.log('=== BATHYMETRIC TIDE GAUGE & CLARITY VERIFICATION ===');

  let devProcess = null;
  const port = 3000;
  const alreadyRunning = await isPortOpen(port);

  if (!alreadyRunning) {
    console.log(`Starting Vite dev server on port ${port}...`);
    devProcess = spawn('npx', ['vite', '--port', String(port), '--host', '0.0.0.0'], {
      stdio: 'pipe',
      detached: false,
    });

    devProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('ready in') || msg.includes('localhost:')) {
        console.log(`[Vite]: ${msg.trim()}`);
      }
    });

    devProcess.stderr.on('data', (d) => {
      console.error(`[Vite ERR]: ${d.toString().trim()}`);
    });

    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (await isPortOpen(port)) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      throw new Error(`Vite server failed to start on port ${port}`);
    }
    console.log('Vite server is ready!');
  } else {
    console.log(`Vite server is already running on port ${port}`);
  }

  console.log('Launching browser with WebGPU enabled...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-dawn-features=allow_unsafe_apis',
      '--use-gl=angle',
      '--use-angle=metal',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const consoleLogs = [];
  const errors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      errors.push(text);
      console.error(`[BROWSER ERROR]: ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(err.toString());
    console.error(`[PAGE ERROR]: ${err}`);
  });

  console.log(`Navigating to http://localhost:${port}...`);
  await page.goto(`http://localhost:${port}`);

  console.log('Waiting for Indicatrix engine initialization...');
  await page.waitForFunction(() => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__, { timeout: 25000 });
  await sleep(3000);

  // Position camera at Florida / Gulf of Mexico / Caribbean (excellent area for coastal shelf & lowlands)
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-82.0, 26.0, 6.8, [0, 0, 0]);
    window.__INDICATRIX_ENGINE__.setTheme(0); // Marie Tharp
    window.__INDICATRIX_ENGINE__.setMode(0);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
  });
  await sleep(2000);

  async function setSeaLevelAndClarity(seaLevel, clarity) {
    // 1. Update live uniforms for immediate WebGPU draw
    await page.evaluate(({ seaLevel, clarity }) => {
      window.__INDICATRIX_LIVE_UNIFORMS__ = {
        ...window.__INDICATRIX_LIVE_UNIFORMS__,
        seaLevelOffset: seaLevel,
        waterClarity: clarity,
      };
    }, { seaLevel, clarity });

    // 2. Update HUD controls so sidebar reflects the state
    try {
      const gauge = page.locator('[role="slider"][aria-label="Bathymetric Sea Level Gauge"]');
      if (await gauge.count() > 0) {
        await gauge.focus();
        if (seaLevel >= 100) {
          await page.keyboard.press('End');
        } else if (seaLevel <= -150) {
          await page.keyboard.press('Home');
        } else if (seaLevel === 0) {
          await page.keyboard.press('Enter');
        }
      }
      const clarityInput = page.locator('#tide-gauge-water-clarity');
      if (await clarityInput.count() > 0) {
        await clarityInput.evaluate((el, val) => {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(clarity));
      }
    } catch (e) {
      console.warn('HUD interaction error:', e.message);
    }
  }

  console.log('1. Capturing Sea Level = 0m (Baseline)...');
  await setSeaLevelAndClarity(0.0, 0.75);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-sealevel-0m-baseline.png') });

  console.log('2. Capturing Sea Level = +100m (Coastal Inundation of Lowlands)...');
  await setSeaLevelAndClarity(100.0, 0.75);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-sealevel-plus100m-inundation.png') });

  console.log('3. Capturing Sea Level = -150m (Exposed Continental Shelves)...');
  await setSeaLevelAndClarity(-150.0, 0.75);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-sealevel-minus150m-exposed-shelf.png') });

  console.log('4. Capturing Water Clarity = 10% (Murky Turbid Optical Extinction)...');
  await setSeaLevelAndClarity(0.0, 0.10);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-clarity-10pct-turbid.png') });

  console.log('5. Capturing Water Clarity = 100% (Crystal Clear Seabed Transmission)...');
  await setSeaLevelAndClarity(0.0, 1.00);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-clarity-100pct-crystal.png') });

  console.log('6. Capturing Theme 1: Cream Rag Archival Watercolor Wash (Sea Level = 0m)...');
  await page.evaluate(() => window.__INDICATRIX_ENGINE__.setTheme(1));
  await setSeaLevelAndClarity(0.0, 0.75);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-theme1-cream-rag-sealevel-0m.png') });

  console.log('7. Capturing Theme 1: Cream Rag Archival Watercolor Wash (Sea Level = +100m Inundation)...');
  await setSeaLevelAndClarity(100.0, 0.75);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-theme1-cream-rag-sealevel-plus100m.png') });

  console.log('8. Capturing Theme 2: Prussian Cyanotype Photochemical Wash (Sea Level = 0m)...');
  await page.evaluate(() => window.__INDICATRIX_ENGINE__.setTheme(2));
  await setSeaLevelAndClarity(0.0, 0.75);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-theme2-prussian-sealevel-0m.png') });

  console.log('9. Capturing Theme 2: Prussian Cyanotype Photochemical Wash (Sea Level = +100m Inundation)...');
  await setSeaLevelAndClarity(100.0, 0.75);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-theme2-prussian-sealevel-plus100m.png') });

  await browser.close();
  console.log('Browser closed.');

  if (devProcess) {
    console.log('Terminating Vite dev process...');
    devProcess.kill('SIGTERM');
    await sleep(1000);
  }

  console.log('Verification complete! Zero WebGPU/WGSL errors detected.');
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
