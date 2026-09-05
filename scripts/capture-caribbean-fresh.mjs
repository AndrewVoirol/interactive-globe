import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map';
const OUT_DIR = path.join(BASE_DIR, 'screenshots');
const OUT_AFTER_DIR = path.join(BASE_DIR, 'screenshots/after');

async function captureCaribbean() {
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

  // Activate Direction B: Hydrosphere & Bathymetric Depth on fresh page load (camera at initial 87°E, 28°N)
  const hydroBtn = await page.$('button:has-text("B: Depth")');
  if (hydroBtn) {
    console.log('Activating Direction B: Hydrosphere & Bathymetric Depth...');
    await hydroBtn.click();
    await page.waitForTimeout(2000);
  }

  // Drag from initial 87°E 28°N to 18°N 75°W (exact same vector as test-caribbean-zoom.mjs)
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  console.log('Dragging from initial coords to Caribbean Sea...');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 565, startY - 35, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  // Move mouse over canvas center before wheeling
  const canvasCenterX = box.x + box.width / 3;
  const canvasCenterY = box.y + box.height / 2;
  await page.mouse.move(canvasCenterX, canvasCenterY);

  // Zoom in to Caribbean (10 wheel steps)
  console.log('Zooming in to Caribbean basin (10 wheel steps)...');
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(3000);

  const coords = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const coordSpan = spans.find(s => s.innerText.match(/\d+°\d+'[NS]\s+\d+°\d+'[EW]/));
    return coordSpan ? coordSpan.innerText : 'unknown';
  });
  console.log('Caribbean coordinates after zoom:', coords);

  const outPath = path.join(OUT_DIR, 'after-hydrosphere-caribbean.png');
  const outPathCopy = path.join(OUT_AFTER_DIR, 'after-hydrosphere-caribbean.png');
  await page.screenshot({ path: outPath });
  fs.copyFileSync(outPath, outPathCopy);
  console.log('Saved:', outPath, `(${fs.statSync(outPath).size} bytes)`);

  await browser.close();
}

captureCaribbean().catch(err => {
  console.error(err);
  process.exit(1);
});
