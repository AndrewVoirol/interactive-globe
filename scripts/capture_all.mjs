// ============================================================================
// File: scripts/capture_all.mjs
// Purpose: Autonomous Litmus Screencasts, Canonical Screenshots & Performance Profiler
// ============================================================================

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.resolve('screenshots');
const TEMP_VIDEO_DIR = path.resolve('.temp_screencasts');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_VIDEO_DIR)) {
  fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
}

const THEMES = [
  { index: 0, id: 'tharp', name: 'Marie Tharp (1977)' },
  { index: 1, id: 'cream-rag', name: 'Cream Rag Paper (1842)' },
  { index: 2, id: 'cyanotype', name: 'Prussian Cyanotype (1842)' },
];

const LOCATIONS = [
  { id: 'hawaii', name: 'Hawaii Big Island Litmus' },
  { id: 'cape-cod', name: 'Cape Cod Peninsula Litmus' },
];

async function launchBrowser() {
  return await chromium.launch({
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
}

// ----------------------------------------------------------------------------
// PHASE 1: SCREENCAST CAPTURE (6 videos: 3 mediums x 2 locations)
// ----------------------------------------------------------------------------
async function captureScreencasts() {
  console.log('\n============================================================');
  console.log('PHASE 1: CAPTURING 6 LITMUS SCREENCASTS (3 Mediums x 2 Locations)');
  console.log('============================================================');

  for (const theme of THEMES) {
    for (const loc of LOCATIONS) {
      const videoName = `${theme.id}-${loc.id}-demo`;
      const finalMp4Path = path.join(SCREENSHOTS_DIR, `${videoName}.mp4`);
      console.log(`\n--- Recording Screencast: [${theme.name}] @ [${loc.name}] -> ${videoName}.mp4 ---`);

      // Clean temp dir
      const subTempDir = path.join(TEMP_VIDEO_DIR, videoName);
      if (fs.existsSync(subTempDir)) {
        fs.rmSync(subTempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(subTempDir, { recursive: true });

      const browser = await launchBrowser();
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        recordVideo: {
          dir: subTempDir,
          size: { width: 1920, height: 1080 },
        },
      });

      const page = await context.newPage();
      await page.goto(BASE_URL);

      // Wait for engine initialization
      await page.waitForFunction(() => !!window.__INDICATRIX_TRAJECTORY__ && !!window.__INDICATRIX_ENGINE__);

      // Set target theme
      await page.evaluate((themeIdx) => {
        window.__INDICATRIX_ENGINE__.setTheme(themeIdx);
        // Ensure Mode 0 (Spherical Globe) for litmus tests
        window.__INDICATRIX_ENGINE__.setMode(0);
        window.__INDICATRIX_ENGINE__.setAlpha(0.0);
      }, theme.index);

      // Wait 1.5 seconds for render stabilization
      await page.waitForTimeout(1500);

      // Launch Trajectory Camera Sequence (8.0 seconds)
      console.log(`  -> Starting trajectory sequence: ${loc.id} (duration: 8.0s)`);
      await page.evaluate((seqId) => {
        window.__INDICATRIX_TRAJECTORY__.startDemo(seqId, 8.0);
      }, loc.id);

      // Wait 8.5 seconds for full trajectory execution + hold
      await page.waitForTimeout(8500);

      // Close page and context to flush video file
      await page.close();
      await context.close();
      await browser.close();

      // Find recorded webm file
      const recordedFiles = fs.readdirSync(subTempDir).filter((f) => f.endsWith('.webm'));
      if (recordedFiles.length === 0) {
        throw new Error(`No webm file found in ${subTempDir}`);
      }
      const rawWebmPath = path.join(subTempDir, recordedFiles[0]);
      console.log(`  -> Raw WebM recorded: ${rawWebmPath} (${(fs.statSync(rawWebmPath).size / 1024 / 1024).toFixed(2)} MB)`);

      // Convert to compressed MP4 (H.264, CRF 23, yuv420p)
      console.log(`  -> Converting to MP4 via ffmpeg: ${finalMp4Path}`);
      execSync(
        `/Users/andrewvoirol/.local/bin/ffmpeg -y -i "${rawWebmPath}" -t 10 -c:v libx264 -crf 23 -pix_fmt yuv420p "${finalMp4Path}"`,
        { stdio: 'inherit' }
      );

      const mp4Stats = fs.statSync(finalMp4Path);
      console.log(`  [OK] Produced ${videoName}.mp4: ${(mp4Stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  }
}

// ----------------------------------------------------------------------------
// PHASE 2: CANONICAL SCREENSHOT SUITE (12 minimum: 4 viewpoints x 3 themes)
// ----------------------------------------------------------------------------
async function captureCanonicalScreenshots() {
  console.log('\n============================================================');
  console.log('PHASE 2: CAPTURING CANONICAL SCREENSHOT SUITE (4 Viewpoints x 3 Themes)');
  console.log('============================================================');

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__);

  for (const theme of THEMES) {
    console.log(`\n--- Capturing Canonical Viewpoints for Theme: ${theme.name} ---`);
    await page.evaluate((themeIdx) => {
      window.__INDICATRIX_ENGINE__.setTheme(themeIdx);
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    }, theme.index);
    await page.waitForTimeout(1000);

    // Viewpoint 1: Limb Horizon (44°N, 12°E, pitch 75° grazing angle)
    console.log(`  1. Limb Horizon: 44°N, 12°E, pitch 75°`);
    await page.evaluate(() => {
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
      // Place camera at grazing angle looking across Adriatic / Mediterranean limb horizon
      const lon = 12.0;
      const lat = 44.0;
      // Oblique grazing view (pitch ~52° from nadir, 15° above horizontal) looking across Alps towards northern limb horizon
      window.__INDICATRIX_CAMERA__.setObliqueView(lon, lat, 6.05, 52, 0);
    });
    await page.waitForTimeout(1500);
    const limbPath = path.join(SCREENSHOTS_DIR, `limb-horizon-${theme.id}.png`);
    await page.screenshot({ path: limbPath });
    console.log(`     [OK] Saved ${limbPath}`);

    // Viewpoint 2: Alpine Basin Zoom (45°N, 8°E, zoom 3.5x)
    console.log(`  2. Alpine Basin Zoom: 45°N, 8°E, zoom 3.5x`);
    await page.evaluate(() => {
      // Zoom 3.5x corresponds to radius ~ 5.9 over the Alps / Po Valley
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(8.0, 45.0, 5.9);
    });
    await page.waitForTimeout(1000);
    const alpinePath = path.join(SCREENSHOTS_DIR, `alpine-basin-zoom-${theme.id}.png`);
    await page.screenshot({ path: alpinePath });
    console.log(`     [OK] Saved ${alpinePath}`);

    // Viewpoint 3: Planar Unroll (Mode 1, t = 1.0)
    console.log(`  3. Planar Unroll: Mode 1, t = 1.0`);
    await page.evaluate(() => {
      window.__INDICATRIX_ENGINE__.setMode(1);
      window.__INDICATRIX_ENGINE__.setAlpha(1.0);
      window.__INDICATRIX_CAMERA__.setSpherical(14.0, 0, Math.PI / 2, [0, 0, 0]);
    });
    await page.waitForTimeout(1200);
    const planarPath = path.join(SCREENSHOTS_DIR, `planar-unroll-${theme.id}.png`);
    await page.screenshot({ path: planarPath });
    console.log(`     [OK] Saved ${planarPath}`);

    // Viewpoint 4: Rapid Medium Shift (Mid-transition between themes)
    console.log(`  4. Rapid Medium Shift: Mid-transition capture`);
    await page.evaluate(() => {
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
    });
    await page.waitForTimeout(500);
    // Rapidly toggle theme to next and capture immediately during shader uniform transition
    await page.evaluate((themeIdx) => {
      const nextTheme = (themeIdx + 1) % 3;
      window.__INDICATRIX_ENGINE__.setTheme(nextTheme);
    }, theme.index);
    // Capture immediately without waiting
    const shiftPath = path.join(SCREENSHOTS_DIR, `rapid-medium-shift-${theme.id}.png`);
    await page.screenshot({ path: shiftPath });
    console.log(`     [OK] Saved ${shiftPath}`);
  }

  await page.close();
  await context.close();
  await browser.close();
}

// ----------------------------------------------------------------------------
// PHASE 3: PERFORMANCE PROFILING & GPU PASS TIMINGS
// ----------------------------------------------------------------------------
async function runPerformanceProfiling() {
  console.log('\n============================================================');
  console.log('PHASE 3: PERFORMANCE PROFILING (1M, 4M, 8M Nodes across 3 Themes)');
  console.log('============================================================');

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!window.__INDICATRIX_WEBGPU_ENGINE__ && !!window.__INDICATRIX_ENGINE__);

  const results = [];
  const TIERS = ['1M', '4M', '8M'];

  for (const loc of LOCATIONS) {
    for (const theme of THEMES) {
      for (const tier of TIERS) {
        console.log(`\nProfiling: [${loc.name}] | [${theme.name}] | Tier [${tier}]`);

        // Configure scene
        await page.evaluate(
          ({ themeIdx, tierName, locId }) => {
            window.__INDICATRIX_ENGINE__.setTheme(themeIdx);
            window.__INDICATRIX_ENGINE__.setMode(0);
            window.__INDICATRIX_ENGINE__.setAlpha(0.0);
            window.__INDICATRIX_ENGINE__.setResolution(tierName);

            if (locId === 'hawaii') {
              window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
            } else {
              window.__INDICATRIX_CAMERA__.lookAtCoordinates(-70.0, 42.0, 6.2);
            }
          },
          { themeIdx: theme.index, tierName: tier, locId: loc.id }
        );

        // Wait 1.5 seconds for grid rebuild and render stabilization
        await page.waitForTimeout(1500);

        // Measure FPS over 120 animation frames
        const benchData = await page.evaluate(async () => {
          const frameCount = 120;
          const t0 = performance.now();
          for (let i = 0; i < frameCount; i++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          const t1 = performance.now();
          const duration = t1 - t0;
          const measuredFps = Math.round((frameCount * 1000) / duration);

          // Profiler metrics
          const engine = window.__INDICATRIX_WEBGPU_ENGINE__;
          const profiler = engine?.getProfiler?.();
          const report = profiler?.getLatestReport?.();

          return {
            fps: measuredFps,
            report: report || null,
          };
        });

        const entry = {
          location: loc.id,
          theme: theme.id,
          tier,
          fps: benchData.fps,
          profiler: benchData.report,
        };
        results.push(entry);
        console.log(`  -> Measured FPS: ${benchData.fps} FPS`);
      }
    }
  }

  await page.close();
  await context.close();
  await browser.close();

  return results;
}

// ----------------------------------------------------------------------------
// PHASE 4: MEMORY LEAK CHECK (10 Full Theme Cycles = 30 Switches)
// ----------------------------------------------------------------------------
async function runMemoryCheck() {
  console.log('\n============================================================');
  console.log('PHASE 4: MEMORY LEAK VERIFICATION (10 Cycles / 30 Theme Switches)');
  console.log('============================================================');

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__);

  // Position at Hawaii Litmus
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setMode(0);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
  });
  await page.waitForTimeout(2000);

  const memReadings = [];

  for (let cycle = 1; cycle <= 10; cycle++) {
    for (let t = 0; t < 3; t++) {
      await page.evaluate((themeIdx) => {
        window.__INDICATRIX_ENGINE__.setTheme(themeIdx);
      }, t);
      await page.waitForTimeout(100);
    }

    const heapMB = await page.evaluate(() => {
      const mem = window.performance?.memory;
      return mem ? parseFloat((mem.usedJSHeapSize / (1024 * 1024)).toFixed(2)) : null;
    });

    memReadings.push({ cycle, heapMB });
    console.log(`  Cycle ${cycle}/10 completed. Heap: ${heapMB !== null ? `${heapMB} MB` : 'N/A'}`);
  }

  await page.close();
  await context.close();
  await browser.close();

  return memReadings;
}

// ----------------------------------------------------------------------------
// MAIN RUNNER
// ----------------------------------------------------------------------------
(async () => {
  try {
    // 1. Screencasts
    await captureScreencasts();

    // 2. Canonical Screenshots
    await captureCanonicalScreenshots();

    // 3. Performance Profiling
    const perfResults = await runPerformanceProfiling();
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'performance-profile.json'),
      JSON.stringify(perfResults, null, 2)
    );

    // 4. Memory Check
    const memResults = await runMemoryCheck();
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'memory-check.json'),
      JSON.stringify(memResults, null, 2)
    );

    console.log('\n[SUCCESS] All screencasts, screenshots, performance data, and memory tests complete!');
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] Automation failure:', err);
    process.exit(1);
  }
})();
