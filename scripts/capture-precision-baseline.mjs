import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const OUT_DIR = path.join(projectRoot, 'screenshots', 'baseline');
const REPORT_PATH = path.join(projectRoot, 'reports', 'baseline-v1-measurements.json');

const LITMUS_LOCATIONS = [
  { id: 'everest', name: 'Mount Everest (Summit)', lat: 27.9881, lon: 86.9250, radius: 8.5 },
  { id: 'mariana', name: 'Mariana Trench (Challenger Deep)', lat: 11.3733, lon: 142.5917, radius: 9.0 },
  { id: 'grand_canyon', name: 'Grand Canyon National Park', lat: 36.0544, lon: -112.1401, radius: 7.2 },
  { id: 'hawaii', name: 'Hawaii (Mauna Kea Rift)', lat: 19.8206, lon: -155.4681, radius: 7.5 },
  { id: 'cape_cod', name: 'Cape Cod Barrier Spit', lat: 41.6688, lon: -70.2962, radius: 7.2 },
  { id: 'amazon_mouth', name: 'Amazon River Estuary', lat: 0.0000, lon: -50.0000, radius: 9.0 },
  { id: 'titicaca', name: 'Lake Titicaca (High Altitude)', lat: -15.9254, lon: -69.3354, radius: 8.0 },
  { id: 'matterhorn', name: 'Matterhorn (Swiss Alps)', lat: 45.9763, lon: 7.6586, radius: 7.5 },
];

const THEMES = [
  { id: 0, themeMode: 1, name: 'cream_rag_swiss_relief' },
  { id: 1, themeMode: 0, name: 'marie_tharp_bathymetry' },
  { id: 2, themeMode: 2, name: 'prussian_cyanotype_blueprint' },
];

async function main() {
  console.log('================================================================');
  console.log('INDICATRIX ENGINE: AUTOMATED HIGH-PRECISION BASELINE SUITE');
  console.log('================================================================\n');

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const reportDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const chromeDev = '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
  const chromeStable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = fs.existsSync(chromeDev) ? chromeDev : chromeStable;
  console.log(`Using Chrome binary: ${executablePath}`);

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
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error' || text.toLowerCase().includes('error') || text.includes('WGSL')) {
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
      if (type === 'error' || text.includes('WGSL')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    console.error('[PAGE UNCAUGHT]', err.message);
    consoleErrors.push(err.message);
  });

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  console.log(`Connecting to ${appUrl}...`);
  try {
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.error(`Failed to navigate to ${appUrl}. Is the dev server running?`);
    console.error(e.message);
    await browser.close();
    process.exit(1);
  }

  console.log('Waiting for WebGPU engine initialization...');
  await page.waitForFunction(
    () => ((window.__INDICATRIX_WEBGPU_ENGINE__ || window.__INDICATRIX_ENGINE__ || window.__ENGINE) && window.__INDICATRIX_CAMERA__),
    { timeout: 20000 }
  );
  await page.waitForTimeout(2000);
  console.log('✓ WebGPU Engine confirmed online.\n');

  const benchmarkReport = {
    timestamp: new Date().toISOString(),
    engineBackend: 'WebGPU (Metal)',
    viewport: { width: 1920, height: 1080, dpr: 2 },
    benchmarks: [],
  };

  for (const theme of THEMES) {
    console.log(`----------------------------------------------------------------`);
    console.log(`BENCHMARKING THEME: ${theme.name.toUpperCase()} (ID: ${theme.id})`);
    console.log(`----------------------------------------------------------------`);

    // Switch theme
    await page.evaluate((th) => {
      const mode = th.themeMode !== undefined ? th.themeMode : th.id;
      if (window.__INDICATRIX_ENGINE__ && typeof window.__INDICATRIX_ENGINE__.setTheme === 'function') {
        window.__INDICATRIX_ENGINE__.setTheme(mode);
      } else if (typeof window.setTheme === 'function') {
        window.setTheme(mode);
      }
      if (window.__INDICATRIX_THEME__ && typeof window.__INDICATRIX_THEME__.setThemeIndex === 'function') {
        window.__INDICATRIX_THEME__.setThemeIndex(mode);
      }
      if (window.__INDICATRIX_LIVE_UNIFORMS__) {
        window.__INDICATRIX_LIVE_UNIFORMS__.theme = mode;
      }
    }, theme);
    await page.waitForTimeout(1000);

    for (const loc of LITMUS_LOCATIONS) {
      console.log(`  -> Sampling Location: ${loc.name} (${loc.lat.toFixed(2)}°N, ${loc.lon.toFixed(2)}°E)...`);

      // Set viewpoint
      await page.evaluate((l) => {
        if (window.__INDICATRIX_CAMERA__ && typeof window.__INDICATRIX_CAMERA__.lookAtCoordinates === 'function') {
          window.__INDICATRIX_CAMERA__.lookAtCoordinates(l.lon, l.lat, l.radius || 8.0, [0, 0, 0]);
        } else if (window.__INDICATRIX_CAMERA_CONTROLLER__) {
          const phi = (90.0 - l.lat) * (Math.PI / 180.0);
          const theta = (l.lon + 90.0) * (Math.PI / 180.0);
          const radius = l.radius || 8.0;
          window.__INDICATRIX_CAMERA_CONTROLLER__.phi = phi;
          window.__INDICATRIX_CAMERA_CONTROLLER__.theta = theta;
          window.__INDICATRIX_CAMERA_CONTROLLER__.radius = radius;
        } else {
          const engine = window.__INDICATRIX_WEBGPU_ENGINE__ || window.__INDICATRIX_ENGINE__;
          if (engine && engine.camera) {
            const phi = (90.0 - l.lat) * (Math.PI / 180.0);
            const theta = (l.lon + 90.0) * (Math.PI / 180.0);
            const radius = l.radius || 8.0;
            const x = radius * Math.sin(phi) * Math.sin(theta);
            const y = radius * Math.cos(phi);
            const z = radius * Math.sin(phi) * Math.cos(theta);
            engine.camera.position.set(x, y, z);
            engine.camera.lookAt(0, 0, 0);
          }
        }
      }, loc);

      // Settle and warm up
      await page.waitForTimeout(1200);

      // Profile frame times
      const perfMetrics = await page.evaluate(async () => {
        const frameTimes = [];
        let lastTime = performance.now();
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          const now = performance.now();
          frameTimes.push(now - lastTime);
          lastTime = now;
        }

        frameTimes.sort((a, b) => a - b);
        const sum = frameTimes.reduce((acc, t) => acc + t, 0);
        const mean = sum / frameTimes.length;
        const p95 = frameTimes[Math.floor(frameTimes.length * 0.95)];
        const min = frameTimes[0];
        const max = frameTimes[frameTimes.length - 1];
        const fps = 1000.0 / Math.max(0.1, mean);

        const memory = window.performance && window.performance.memory
          ? {
              usedJSHeapMB: parseFloat((window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)),
              totalJSHeapMB: parseFloat((window.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2)),
            }
          : null;

        return { mean: parseFloat(mean.toFixed(2)), p95: parseFloat(p95.toFixed(2)), min: parseFloat(min.toFixed(2)), max: parseFloat(max.toFixed(2)), fps: parseFloat(fps.toFixed(1)), memory };
      });

      // Capture lossless screenshot
      const imgFilename = `${theme.name}_${loc.id}.png`;
      const imgPath = path.join(OUT_DIR, imgFilename);
      await page.screenshot({ path: imgPath });
      const stat = fs.statSync(imgPath);

      console.log(`     ✓ FPS: ${perfMetrics.fps} | Frame Mean: ${perfMetrics.mean}ms | P95: ${perfMetrics.p95}ms | Image: ${(stat.size / 1024).toFixed(1)} KB`);

      benchmarkReport.benchmarks.push({
        themeId: theme.id,
        themeName: theme.name,
        locationId: loc.id,
        locationName: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        metrics: perfMetrics,
        screenshot: imgFilename,
      });
    }
  }

  await browser.close();

  const FINAL_DELTA_PATH = path.join(projectRoot, 'reports', 'final-precision-delta.json');
  const DELTA_PATH = path.join(projectRoot, 'reports', 'stage1-gebco-delta.json');

  // Load Phase 1 baseline (commit 6530978) for authoritative comparison
  let phase1Baseline = null;
  try {
    const raw = execSync('git show 6530978:reports/baseline-v1-measurements.json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    phase1Baseline = JSON.parse(raw);
  } catch {
    if (fs.existsSync(REPORT_PATH)) {
      try {
        phase1Baseline = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
      } catch {}
    }
  }

  let baselinePrior = null;
  if (fs.existsSync(REPORT_PATH)) {
    try {
      baselinePrior = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
    } catch {}
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(benchmarkReport, null, 2));

  const baseSource = phase1Baseline || baselinePrior;
  if (baseSource && baseSource.benchmarks) {
    const finalDeltaReport = {
      timestamp: new Date().toISOString(),
      phase1BaselineTimestamp: baseSource.timestamp,
      finalPrecisionTimestamp: benchmarkReport.timestamp,
      summary: {
        totalBenchmarks: benchmarkReport.benchmarks.length,
        baselineMeanFps: parseFloat(
          (baseSource.benchmarks.reduce((acc, b) => acc + (b.metrics?.fps || 0), 0) / baseSource.benchmarks.length).toFixed(2)
        ),
        finalMeanFps: parseFloat(
          (benchmarkReport.benchmarks.reduce((acc, b) => acc + (b.metrics?.fps || 0), 0) / benchmarkReport.benchmarks.length).toFixed(2)
        ),
      },
      comparisons: benchmarkReport.benchmarks.map((cur, i) => {
        const base =
          baseSource.benchmarks?.find((b) => b.locationId === cur.locationId && b.themeName === cur.themeName) ||
          baseSource.benchmarks?.[i] ||
          {};
        return {
          locationId: cur.locationId,
          locationName: cur.locationName,
          themeName: cur.themeName,
          baselineFps: base.metrics?.fps,
          finalFps: cur.metrics.fps,
          fpsDelta: parseFloat((cur.metrics.fps - (base.metrics?.fps || 0)).toFixed(2)),
          baselineMeanMs: base.metrics?.mean,
          finalMeanMs: cur.metrics.mean,
          meanMsDelta: parseFloat((cur.metrics.mean - (base.metrics?.mean || 0)).toFixed(2)),
          baselineP95Ms: base.metrics?.p95,
          finalP95Ms: cur.metrics.p95,
        };
      }),
    };
    fs.writeFileSync(FINAL_DELTA_PATH, JSON.stringify(finalDeltaReport, null, 2));
    console.log(`Final precision delta report written to: ${FINAL_DELTA_PATH}`);

    const deltaReport = {
      timestamp: new Date().toISOString(),
      baselineTimestamp: baselinePrior ? baselinePrior.timestamp : baseSource.timestamp,
      postGebcoTimestamp: benchmarkReport.timestamp,
      comparisons: finalDeltaReport.comparisons.map((c) => ({
        locationId: c.locationId,
        themeName: c.themeName,
        baselineFps: c.baselineFps,
        postGebcoFps: c.finalFps,
        fpsDelta: c.fpsDelta,
        baselineMeanMs: c.baselineMeanMs,
        postGebcoMeanMs: c.finalMeanMs,
        meanMsDelta: c.meanMsDelta,
      })),
    };
    fs.writeFileSync(DELTA_PATH, JSON.stringify(deltaReport, null, 2));
    console.log(`Delta report written to: ${DELTA_PATH}`);
  }

  console.log(`\n================================================================`);
  console.log(`BASELINE BENCHMARK COMPLETE!`);
  console.log(`Report written to: ${REPORT_PATH}`);
  console.log(`Screenshots saved to: ${OUT_DIR}/`);
  console.log(`Total errors logged: ${consoleErrors.length}`);
  console.log(`================================================================\n`);
}

main().catch((err) => {
  console.error('Fatal error in baseline capture:', err);
  process.exit(1);
});
