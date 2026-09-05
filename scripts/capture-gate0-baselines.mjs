import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUT_DIR = '/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/screenshots/before';

async function capture() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log('Launching browser with Apple Silicon Metal WebGPU flags...');
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

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('WebGPU')) {
      console.log('BROWSER:', msg.type(), msg.text());
    }
  });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => window.__INDICATRIX_ENGINE__ && window.__INDICATRIX_ENGINE__.getState().backend === 'webgpu', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // --------------------------------------------------------------------------
  // 1. before-mathematical-purity-dark.png (alpha = 0.0, base state, no data layers)
  // --------------------------------------------------------------------------
  console.log('\n[1/4] Configuring Mathematical Purity Dark (alpha = 0.0, no data layers)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(0); // Mode 0 = Linear Mix
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_ENGINE__.setTheme(0); // Dark Cyber
    window.__INDICATRIX_ENGINE__.setLayerMode(0); // Both Points + Wireframe
  });

  // Hide or remove active data layers
  const hideButton = await page.$('button[title*="Hide layer"]');
  if (hideButton) {
    console.log('Toggling off active data layer to ensure pure substrate...');
    await hideButton.click();
    await page.waitForTimeout(1000);
  }

  // Snap camera to default equator view
  const snapEquator = await page.$('button:has-text("Equator")');
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(2000);
  const path1 = path.join(OUT_DIR, 'before-mathematical-purity-dark.png');
  await page.screenshot({ path: path1 });
  console.log('Saved:', path1, `(${fs.statSync(path1).size} bytes)`);

  // --------------------------------------------------------------------------
  // 2. before-hydrosphere-caribbean.png (Caribbean sea zoomed in, current water optics)
  // --------------------------------------------------------------------------
  console.log('\n[2/4] Configuring Hydrosphere Caribbean Sea view...');
  // Activate Direction B: Hydrosphere & Bathymetric Depth
  const hydroBtn = await page.$('button:has-text("B: Depth")');
  if (hydroBtn) {
    console.log('Activating Direction B: Hydrosphere & Bathymetric Depth...');
    await hydroBtn.click();
    await page.waitForTimeout(2000);
  }

  // Ensure layer is visible
  const unhideButton = await page.$('button[title*="Show layer"]');
  if (unhideButton) {
    await unhideButton.click();
    await page.waitForTimeout(1000);
  }

  // Ensure alpha = 0.0 (Globe view)
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_ENGINE__.setMode(0);
  });
  await page.waitForTimeout(1000);

  // Drag camera to Caribbean Sea (Lon 75°W, Lat 18°N)
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  console.log('Orbiting camera to Caribbean Sea (18°N, 75°W)...');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 565, startY - 35, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  // Zoom in to Caribbean basin (radius ~8.5)
  console.log('Zooming in to Caribbean basin...');
  for (let i = 0; i < 9; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(2500);

  const coords = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const coordSpan = spans.find(s => s.innerText.match(/\d+°\d+'[NS]\s+\d+°\d+'[EW]/));
    return coordSpan ? coordSpan.innerText : 'unknown';
  });
  console.log('Current Caribbean Telemetry Coordinates:', coords);

  const path2 = path.join(OUT_DIR, 'before-hydrosphere-caribbean.png');
  await page.screenshot({ path: path2 });
  console.log('Saved:', path2, `(${fs.statSync(path2).size} bytes)`);

  // --------------------------------------------------------------------------
  // 3. before-fluid-morph-alpha05.png (alpha = 0.5, fluid advection mode)
  // --------------------------------------------------------------------------
  console.log('\n[3/4] Configuring Fluid Morph (alpha = 0.5)...');
  // Reset camera zoom
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(3); // Mode 3 = Fluid Flow
    window.__INDICATRIX_ENGINE__.setAlpha(0.5); // alpha = 0.5
  });
  await page.waitForTimeout(3000); // Allow fluid curl noise and advection passes to iterate

  const path3 = path.join(OUT_DIR, 'before-fluid-morph-alpha05.png');
  await page.screenshot({ path: path3 });
  console.log('Saved:', path3, `(${fs.statSync(path3).size} bytes)`);

  // --------------------------------------------------------------------------
  // 4. before-dymaxion-unfold.png (alpha = 1.0, Dymaxion planar net)
  // --------------------------------------------------------------------------
  console.log('\n[4/4] Configuring Dymaxion Unfold (alpha = 1.0)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(4); // Mode 4 = Dymaxion
    window.__INDICATRIX_ENGINE__.setAlpha(1.0); // alpha = 1.0 (Full planar net)
  });
  await page.waitForTimeout(3000); // Allow 20 facets to unfold and lock into planar net

  const path4 = path.join(OUT_DIR, 'before-dymaxion-unfold.png');
  await page.screenshot({ path: path4 });
  console.log('Saved:', path4, `(${fs.statSync(path4).size} bytes)`);

  await browser.close();
  console.log('\nAll 4 baseline screenshots captured successfully!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
