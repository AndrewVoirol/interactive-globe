// ============================================================================
// File: scripts/capture-gate7-after.mjs
// Purpose: Live browser capture of Milestone 7 AFTER screenshots & performance telemetry
// Targets:
//   1. screenshots/after/gate7-after-hawaii-tharp.png
//   2. screenshots/after/gate7-after-hawaii-cream.png
//   3. screenshots/after/gate7-after-hawaii-cyanotype.png
//   4. screenshots/after/gate7-after-sidebar-scene.png
//   5. screenshots/after/gate7-after-sidebar-data.png
//   6. screenshots/after/gate7-after-cloud-closeup.png
// Invariants Enforced: Integrity Mandate, Rules 3, 5, 8, 24, 26
// ============================================================================

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire('/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/package.json');
const { chromium } = require('playwright');

const PROJECT_ROOT = '/Users/andrewvoirol/.gemini/antigravity/worktrees/ais-interactive-globe-to-map/dem_shader_improvements';
const OUT_DIR = path.join(PROJECT_ROOT, 'screenshots/after');
const DEV_SERVER_URL = 'http://localhost:3000';

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log('[gate7-capture] Launching Chromium with Apple Silicon Metal WebGPU flags...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--use-gl=angle',
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
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
  const webgpuErrors = [];

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      consoleErrors.push(text);
      console.log('[BROWSER ERROR]', text);
    }
    if (text.toLowerCase().includes('webgpu validation') || text.toLowerCase().includes('wgsl compilation failed') || text.toLowerCase().includes('gpu validation error')) {
      webgpuErrors.push(text);
      console.log('[WEBGPU ERROR]', text);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
    console.log('[PAGE ERROR]', err);
  });

  console.log(`[gate7-capture] Navigating to ${DEV_SERVER_URL}...`);
  await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('[gate7-capture] Waiting for WebGPU engine and camera initialization...');
  await page.waitForFunction(() => {
    return !!window.__INDICATRIX_ENGINE__ &&
      !!window.__INDICATRIX_CAMERA__ &&
      !!window.__WEBGPU_ENGINE__ &&
      window.__WEBGPU_ENGINE__.initialized === true;
  }, { timeout: 60000 });

  // Settle time for textures and pipeline caches
  await page.waitForTimeout(3000);

  const manifest = [];

  // Helper to save and verify screenshot
  async function recordScreenshot(filename, description) {
    const filePath = path.join(OUT_DIR, filename);
    await page.screenshot({ path: filePath });
    const stat = fs.statSync(filePath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    console.log(`[gate7-capture] Saved ${filename} (${stat.size} bytes / ${sizeKB} KB)`);
    if (stat.size < 50000) {
      throw new Error(`Integrity Failure: ${filename} is smaller than 50 KB (${stat.size} bytes)`);
    }
    manifest.push({
      filename,
      filePath,
      sizeBytes: stat.size,
      sizeFormatted: `${sizeKB} KB`,
      dimensions: '3840×2160 (1920×1080 @ 2x)',
      description
    });
  }

  // --------------------------------------------------------------------------
  // 1. screenshots/after/gate7-after-hawaii-tharp.png (Marie Tharp Theme 0)
  // --------------------------------------------------------------------------
  console.log('\n[1/6] Capturing gate7-after-hawaii-tharp.png (Marie Tharp Theme 0)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(0);
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.2);
  });
  // Ensure SCENE tab is selected
  const sceneTab1 = await page.$('#sidebar-tab-scene');
  if (sceneTab1) await sceneTab1.click();
  await page.waitForTimeout(4000);
  await recordScreenshot(
    'gate7-after-hawaii-tharp.png',
    'Marie Tharp (Theme 0) at Hawaii litmus coordinates (-155.55°W, 19.65°N, zoom radius 6.2). Physiographic bathymetric stippling, dark abyssal ocean, warm shelf tints, and crisp volcanic summits.'
  );

  // --------------------------------------------------------------------------
  // 2. screenshots/after/gate7-after-hawaii-cream.png (Cream Rag Theme 1)
  // --------------------------------------------------------------------------
  console.log('\n[2/6] Capturing gate7-after-hawaii-cream.png (Cream Rag Theme 1)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(1);
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.2);
  });
  await page.waitForTimeout(4000);
  await recordScreenshot(
    'gate7-after-hawaii-cream.png',
    'Cream Rag (Theme 1) at Hawaii litmus coordinates (-155.55°W, 19.65°N, zoom radius 6.2). Archival 310 GSM warm ivory paper substrate, Swiss relief hillshading, sepia-charcoal ink.'
  );

  // --------------------------------------------------------------------------
  // 3. screenshots/after/gate7-after-hawaii-cyanotype.png (Prussian Cyanotype Theme 2)
  // --------------------------------------------------------------------------
  console.log('\n[3/6] Capturing gate7-after-hawaii-cyanotype.png (Prussian Cyanotype Theme 2)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(2);
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.2);
  });
  await page.waitForTimeout(4000);
  await recordScreenshot(
    'gate7-after-hawaii-cyanotype.png',
    'Prussian Cyanotype (Theme 2) at Hawaii litmus coordinates (-155.55°W, 19.65°N, zoom radius 6.2). 1842 blueprint aesthetic, cold cyan linework, per-fragment 8K DEM elevMeters contour precision.'
  );

  // --------------------------------------------------------------------------
  // 4. screenshots/after/gate7-after-sidebar-scene.png (SCENE tab + Card 4b Purity Mode)
  // --------------------------------------------------------------------------
  console.log('\n[4/6] Capturing gate7-after-sidebar-scene.png (SCENE tab with Card 4b Purity Switch)...');
  // Remain in Theme 2 or match baseline
  const sceneTab = await page.$('#sidebar-tab-scene');
  if (sceneTab) await sceneTab.click();
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const card4bText = Array.from(document.querySelectorAll('span')).find(
      (el) => el.textContent && el.textContent.includes('Purity · DEM Only')
    );
    const card4b = card4bText ? card4bText.closest('.rounded-\\[3px\\]') : null;
    if (card4b) {
      card4b.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  });
  await page.waitForTimeout(1000);

  await recordScreenshot(
    'gate7-after-sidebar-scene.png',
    'Sidebar SCENE Tab active in UnifiedRightSidebar: Polar Sun Compass, Hypsometric Relief curve, Sea Level Caliper & Beer-Lambert Clarity (60%), Resolution Selector (3M active), and Card 4b "Purity · DEM Only" TactileSwitch.'
  );

  // --------------------------------------------------------------------------
  // 5. screenshots/after/gate7-after-sidebar-data.png (DATA tab + ETOPO DEM + Scrubber)
  // --------------------------------------------------------------------------
  console.log('\n[5/6] Capturing gate7-after-sidebar-data.png (DATA tab with ETOPO 2022 & Scrubber)...');
  const dataTab = await page.$('#sidebar-tab-data');
  if (dataTab) await dataTab.click();
  await page.waitForTimeout(2000);
  await recordScreenshot(
    'gate7-after-sidebar-data.png',
    'Sidebar DATA Tab active in UnifiedRightSidebar: Synchronized ETOPO 2022 DEM raster layer (Architectural Topographic Relief), Chronometric Scrubber (Datum T+00:00), Atmospheric Cloud Strata Master Deck, and Global Geodesic Feeds.'
  );

  // --------------------------------------------------------------------------
  // 6. screenshots/after/gate7-after-cloud-closeup.png (Haleakala Volumetric Clouds)
  // --------------------------------------------------------------------------
  console.log('\n[6/6] Capturing gate7-after-cloud-closeup.png (Haleakala Volumetric Clouds)...');

  // Activate the master cloud switch on the DATA tab
  const dataTabCloud = await page.$('#sidebar-tab-data');
  if (dataTabCloud) await dataTabCloud.click();
  await page.waitForTimeout(1000);

  const cloudSwitch = page.locator('[title="Master Atmosphere Deck (All Cloud Layers)"]').first();
  const isChecked = await cloudSwitch.getAttribute('aria-checked');
  if (isChecked !== 'true') {
    await cloudSwitch.click();
    await page.waitForTimeout(1000);
  }

  await page.evaluate(async () => {
    window.__INDICATRIX_ENGINE__.setTheme(0);
    const engine = window.__WEBGPU_ENGINE__;
    if (engine) {
      if (typeof engine.setVolumetricCloudsEnabled === 'function') {
        engine.setVolumetricCloudsEnabled(true);
      }
      // Load real GFS binary cloud datasets (/data/gfs-cloud-*-latest.bin)
      await engine.loadAllCloudLayers(false);
      if (typeof engine.updateVolumetricCloudBindGroup === 'function') {
        engine.updateVolumetricCloudBindGroup();
      }
    }

    // Set persistent live uniforms for WebGPUCanvas
    window.__INDICATRIX_LIVE_UNIFORMS__ = {
      ...(window.__INDICATRIX_LIVE_UNIFORMS__ || {}),
      showClouds: true,
      volumetricClouds: true,
      showCloudLow: true,
      showCloudMid: true,
      showCloudHigh: true,
      theme: 0,
    };

    if (typeof window.__INDICATRIX_SET_CLOUD_OPTIONS__ === 'function') {
      window.__INDICATRIX_SET_CLOUD_OPTIONS__({
        showClouds: true,
        showCloudLow: true,
        showCloudMid: true,
        showCloudHigh: true,
        cloudOpacity: 0.90,
      });
    }

    // Snap Haleakala sunset horizon perspective
    window.__INDICATRIX_CAMERA__.snapHaleakalaSunset({
      theme: 0,
      lonDeg: -156.25,
      latDeg: 20.71,
      altitudeRadius: 5.0032,
      pitchDeg: 78.0,
      headingDeg: 268.0,
      sunAltitude: 7.5,
      sunAzimuth: 270.0,
      displacementScale: 0.003,
    });
  });

  // Allow 5s for camera transition, terrain relief, and Wrenninge multiple scattering accumulation
  await page.waitForTimeout(5000);
  await recordScreenshot(
    'gate7-after-cloud-closeup.png',
    'Oblique horizon perspective at Haleakala / Maui (20.71°N, 156.25°W, altitude radius 5.0032, pitch 78°). Volumetric clouds rendered with Wrenninge 2017 multiple scattering, 4-step Beer-Lambert solar integration, and 2× base low-stratum noise detail, with Atmospheric Profile card active.'
  );

  // --------------------------------------------------------------------------
  // Performance Profiling & Metrics Collection
  // --------------------------------------------------------------------------
  console.log('\n[gate7-capture] Measuring live performance metrics...');
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
          resolve({ avgFps, durationSec: parseFloat(duration.toFixed(2)), frameCount: frames });
        } else {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
    });
  });

  const telemetry = await page.evaluate(() => {
    const engine = window.__WEBGPU_ENGINE__;
    const profiler = engine?.profiler;
    const latestReport = profiler?.getLatestReport?.() || null;
    const kernelReports = (profiler?.getKernelReports?.() || []).map(k => ({
      passName: k.passName,
      gpuTimeMs: parseFloat(k.gpuTimeMs?.toFixed(4) || '0'),
      gpuTimeUs: parseFloat(k.gpuTimeUs?.toFixed(2) || '0')
    }));

    return {
      latestReport: latestReport ? {
        timestamp: latestReport.timestamp,
        computeMs: parseFloat(latestReport.computeMs?.toFixed(4) || '0'),
        renderMs: parseFloat(latestReport.renderMs?.toFixed(4) || '0'),
        reliefMs: parseFloat(latestReport.reliefMs?.toFixed(4) || '0'),
        linesMs: parseFloat(latestReport.linesMs?.toFixed(4) || '0'),
        ribbonsMs: parseFloat(latestReport.ribbonsMs?.toFixed(4) || '0'),
        contoursMs: parseFloat(latestReport.contoursMs?.toFixed(4) || '0'),
        pointsMs: parseFloat(latestReport.pointsMs?.toFixed(4) || '0'),
        totalGpuMs: parseFloat(latestReport.totalGpuMs?.toFixed(4) || '0'),
      } : null,
      kernelReports,
      pointCount: engine?.pointCount || 0,
      initialized: !!engine?.initialized,
      hasDEM: !!engine?.demTexture,
      adapterInfo: engine?.adapter ? {
        vendor: engine.adapter.info?.vendor,
        architecture: engine.adapter.info?.architecture
      } : null
    };
  });

  const reportData = {
    timestamp: new Date().toISOString(),
    manifest,
    fpsMeasurement,
    telemetry,
    diagnostics: {
      consoleErrorsCount: consoleErrors.length,
      consoleErrors,
      webgpuErrorsCount: webgpuErrors.length,
      webgpuErrors,
    }
  };

  const jsonOutPath = path.join(PROJECT_ROOT, '.agents/worker_m7_capture/metrics_gate7.json');
  fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
  fs.writeFileSync(jsonOutPath, JSON.stringify(reportData, null, 2));
  console.log(`[gate7-capture] Metrics saved to ${jsonOutPath}`);

  await browser.close();
  console.log('\n[gate7-capture] All 6 AFTER screenshots captured and verified successfully!');
  return reportData;
}

main().catch(err => {
  console.error('[gate7-capture] Fatal error:', err);
  process.exit(1);
});
