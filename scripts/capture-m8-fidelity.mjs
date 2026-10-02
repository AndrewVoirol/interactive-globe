import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DEV_SERVER_URL = process.env.DEV_URL || 'http://localhost:5173';
const OUT_DIR = path.resolve('screenshots/milestone8');

const LITMUS_LOCATIONS = [
  {
    id: 'theme0-hawaii',
    name: 'Hawaii Big Island (Theme 0: Marie Tharp Physiographic Chart)',
    theme: 0,
    lon: -155.55,
    lat: 19.65,
    radius: 6.1,
  },
  {
    id: 'theme1-cream-rag',
    name: 'Swiss Alps & Rhine (Theme 1: Cream Rag Cotton)',
    theme: 1,
    lon: 8.5,
    lat: 46.5,
    radius: 5.8,
  },
  {
    id: 'theme2-cape-cod',
    name: 'Cape Cod (Theme 2: Prussian Cyanotype Linen Weave)',
    theme: 2,
    lon: -70.0,
    lat: 42.0,
    radius: 6.2,
  },
];

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[M8 Capture] Connecting to ${DEV_SERVER_URL}...`);
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-dawn-features=allow_unsafe_apis',
      '--use-gl=angle',
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log(`[PAGE ${msg.type().toUpperCase()}]:`, text);
    consoleMessages.push({ type: msg.type(), text });
  });
  page.on('pageerror', err => {
    console.error(`[PAGE UNCAUGHT]:`, err);
    consoleMessages.push({ type: 'pageerror', text: String(err) });
  });

  await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_WEBGPU_ENGINE__?.initialized,
    { timeout: 60000 }
  );
  await page.waitForTimeout(2500);

  for (const loc of LITMUS_LOCATIONS) {
    console.log(`[M8 Capture] Capturing ${loc.name}...`);
    await page.evaluate(({ theme, lon, lat, radius }) => {
      window.__INDICATRIX_ENGINE__.setTheme(theme);
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(lon, lat, radius, [0, 0, 0]);
    }, loc);

    await page.waitForTimeout(3000);
    const filePath = path.join(OUT_DIR, `${loc.id}.png`);
    await page.screenshot({ path: filePath });
    const stat = fs.statSync(filePath);
    console.log(`[M8 Capture] Saved ${filePath} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  // Also capture intaglio haptic sheen at oblique angle
  if (typeof page.evaluate !== 'undefined') {
    console.log('[M8 Capture] Capturing oblique intaglio haptic sheen...');
    await page.evaluate(() => {
      if (window.__INDICATRIX_CAMERA__.snapIntaglioHaptics) {
        window.__INDICATRIX_CAMERA__.snapIntaglioHaptics({
          theme: 1,
          pitchDeg: 68.0,
          sheenIntensity: 0.85,
          fiberFrequency: 45.0,
          fiberAnisotropy: 0.65,
          plateMarkDepthMeters: 0.0035,
          inkRidgeHeightMeters: 0.0018,
        });
      }
    });
    await page.waitForTimeout(3000);
    const hapticsPath = path.join(OUT_DIR, 'theme1-intaglio-sheen-oblique.png');
    await page.screenshot({ path: hapticsPath });
    const statH = fs.statSync(hapticsPath);
    console.log(`[M8 Capture] Saved ${hapticsPath} (${(statH.size / 1024).toFixed(1)} KB)`);
  }

  await browser.close();

  // Audit console messages for WebGPU errors
  const errors = consoleMessages.filter(m => m.type === 'error' || m.type === 'pageerror');
  const warnings = consoleMessages.filter(m => m.type === 'warn' && m.text.toLowerCase().includes('webgpu'));
  console.log(`\n[M8 Console Audit] Errors: ${errors.length}, WebGPU Warnings: ${warnings.length}`);
  if (errors.length > 0 || warnings.length > 0) {
    console.error('Console messages flagged:', { errors, warnings });
    process.exit(1);
  }
  console.log('[M8 Verification] Visual Verification Passed with 0 errors and 0 WebGPU warnings!');
}

run().catch(err => {
  console.error('[M8 Error]', err);
  process.exit(1);
});
