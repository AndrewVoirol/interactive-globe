import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_DIR = '/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map';
const OUT_DIR = path.join(BASE_DIR, 'screenshots');
const OUT_AFTER_DIR = path.join(BASE_DIR, 'screenshots/after');

async function main() {
  if (!fs.existsSync(OUT_AFTER_DIR)) {
    fs.mkdirSync(OUT_AFTER_DIR, { recursive: true });
  }

  console.log('Launching Chromium with Apple Silicon Metal WebGPU flags...');
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
      console.log('BROWSER CONSOLE:', msg.type(), msg.text());
    }
  });

  // Determine active port: 3000 or 5173
  let targetUrl = 'http://localhost:3000';
  console.log(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl);
  await page.waitForFunction(() => window.__INDICATRIX_ENGINE__ && window.__INDICATRIX_ENGINE__.getState().backend === 'webgpu', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // --------------------------------------------------------------------------
  // 1. after-mathematical-purity-dark.png (alpha = 0.0, base state, Clean Terrain, no data layers)
  // --------------------------------------------------------------------------
  console.log('\n[1/4] Capturing after-mathematical-purity-dark.png...');
  // Remove any active dataset layer for pure substrate
  const delBtn = await page.$('button[title*="Remove layer"]');
  if (delBtn) {
    console.log('Removing active dataset layer for pure substrate...');
    await delBtn.click();
    await page.waitForTimeout(1000);
  }

  // Snap to Equator
  const snapEquator = await page.$('button:has-text("Equator")');
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  // Base State: Mode 0 (Linear), Alpha 0.0, Theme 0 (Dark Cyber), LayerMode 0 (Both)
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(0);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_ENGINE__.setTheme(0);
    window.__INDICATRIX_ENGINE__.setLayerMode(0);
  });
  await page.waitForTimeout(2500);

  const path1 = path.join(OUT_DIR, 'after-mathematical-purity-dark.png');
  const path1Copy = path.join(OUT_AFTER_DIR, 'after-mathematical-purity-dark.png');
  await page.screenshot({ path: path1 });
  fs.copyFileSync(path1, path1Copy);
  console.log('Saved:', path1, `(${fs.statSync(path1).size} bytes)`);

  // --------------------------------------------------------------------------
  // 2. after-hydrosphere-caribbean.png (Caribbean sea zoomed in, recording current water optics)
  // --------------------------------------------------------------------------
  console.log('\n[2/4] Capturing after-hydrosphere-caribbean.png...');
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

  // Drag from initial 87°E 28°N to 18°N 75°W
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

  // Move mouse over canvas center before wheeling
  const canvasCenterX = box.x + box.width / 3;
  const canvasCenterY = box.y + box.height / 2;
  await page.mouse.move(canvasCenterX, canvasCenterY);

  // Zoom in to Caribbean (10 wheel steps)
  console.log('Zooming in to Caribbean basin...');
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

  const path2 = path.join(OUT_DIR, 'after-hydrosphere-caribbean.png');
  const path2Copy = path.join(OUT_AFTER_DIR, 'after-hydrosphere-caribbean.png');
  await page.screenshot({ path: path2 });
  fs.copyFileSync(path2, path2Copy);
  console.log('Saved:', path2, `(${fs.statSync(path2).size} bytes)`);

  // --------------------------------------------------------------------------
  // 3. after-fluid-morph-alpha05.png (alpha = 0.5, fluid advection mode)
  // --------------------------------------------------------------------------
  console.log('\n[3/4] Capturing after-fluid-morph-alpha05.png...');
  // Reset camera zoom & position
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  // Remove dataset layer for pure substrate
  const delBtn2 = await page.$('button[title*="Remove layer"]');
  if (delBtn2) {
    await delBtn2.click();
    await page.waitForTimeout(500);
  }

  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(3); // Mode 3 = Fluid Flow
    window.__INDICATRIX_ENGINE__.setAlpha(0.5); // alpha = 0.5
  });
  await page.waitForTimeout(3500); // Allow fluid curl noise and advection passes to settle

  const path3 = path.join(OUT_DIR, 'after-fluid-morph-alpha05.png');
  const path3Copy = path.join(OUT_AFTER_DIR, 'after-fluid-morph-alpha05.png');
  await page.screenshot({ path: path3 });
  fs.copyFileSync(path3, path3Copy);
  console.log('Saved:', path3, `(${fs.statSync(path3).size} bytes)`);

  // --------------------------------------------------------------------------
  // 4. after-dymaxion-unfold.png (alpha = 1.0, Dymaxion planar net)
  // --------------------------------------------------------------------------
  console.log('\n[4/4] Capturing after-dymaxion-unfold.png...');
  if (snapEquator) {
    await snapEquator.click();
    await page.waitForTimeout(1000);
  }

  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(4); // Mode 4 = Dymaxion
    window.__INDICATRIX_ENGINE__.setAlpha(1.0); // alpha = 1.0 (Full planar net)
  });
  await page.waitForTimeout(3000); // Allow 20 facets to unfold and lock into planar net

  const path4 = path.join(OUT_DIR, 'after-dymaxion-unfold.png');
  const path4Copy = path.join(OUT_AFTER_DIR, 'after-dymaxion-unfold.png');
  await page.screenshot({ path: path4 });
  fs.copyFileSync(path4, path4Copy);
  console.log('Saved:', path4, `(${fs.statSync(path4).size} bytes)`);

  // --------------------------------------------------------------------------
  // Measure Live Metrics (FPS, Memory, WebGPU Profiler Timings)
  // --------------------------------------------------------------------------
  console.log('\nMeasuring live performance metrics...');
  const fpsMeasurement = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let frames = 0;
      const t0 = performance.now();
      function tick() {
        frames++;
        if (frames >= 120) {
          const t1 = performance.now();
          const duration = (t1 - t0) / 1000;
          const avgFps = Math.round(frames / duration);
          resolve({ avgFps, duration: duration.toFixed(2), frames });
        } else {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
    });
  });

  const engineMetrics = await page.evaluate(() => {
    const engine = window.__WEBGPU_ENGINE__;
    const hudFps = parseInt(document.querySelector('.tabular-nums span')?.innerText || '0', 10);
    const mem = (performance).memory ? {
      usedJSHeapSizeMB: ((performance).memory.usedJSHeapSize / 1048576).toFixed(2),
      totalJSHeapSizeMB: ((performance).memory.totalJSHeapSize / 1048576).toFixed(2),
      jsHeapSizeLimitMB: ((performance).memory.jsHeapSizeLimit / 1048576).toFixed(2),
    } : null;

    const kernelReports = (engine?.profiler?.getKernelReports?.() || []).map(r => ({
      ...r,
      gpuTimeNs: r.gpuTimeNs?.toString()
    }));
    const latestReport = engine?.profiler?.getLatestReport?.() || null;

    return {
      hudFps,
      pointCount: engine?.pointCount,
      lineIndexCount: engine?.lineIndexCount,
      contourVertexCount: engine?.contourVertexCount,
      contourIndexCount: engine?.contourIndexCount,
      hasDEM: !!engine?.demTexture,
      kernelReports,
      latestReport,
      mem,
      adapterInfo: engine?.adapter ? {
        vendor: engine.adapter.info?.vendor,
        architecture: engine.adapter.info?.architecture,
        limits: {
          maxBufferSizeMB: (engine.adapter.limits.maxBufferSize / 1048576).toFixed(0),
          maxStorageBufferBindingSizeMB: (engine.adapter.limits.maxStorageBufferBindingSize / 1048576).toFixed(0),
          maxComputeWorkgroupStorageSize: engine.adapter.limits.maxComputeWorkgroupStorageSize,
          maxComputeInvocationsPerWorkgroup: engine.adapter.limits.maxComputeInvocationsPerWorkgroup,
        }
      } : null
    };
  });

  const metricsReport = {
    fpsMeasurement,
    engineMetrics,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(BASE_DIR, 'scripts/metrics-gate1.json'),
    JSON.stringify(metricsReport, null, 2)
  );
  console.log('\nFinal Live Metrics:', JSON.stringify(metricsReport, null, 2));

  await browser.close();
  console.log('\nGate 1 After capture and metrics collection complete!');
}

main().catch(err => {
  console.error('Gate 1 capture failed:', err);
  process.exit(1);
});
