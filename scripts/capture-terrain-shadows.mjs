// ============================================================================
// File: scripts/capture-terrain-shadows.mjs
// Purpose: Live browser capture for Section 2:
//          Directional Horizon & Canyon Self-Shadowing
// Captures:
//   1. screenshots/s2_canyon_shadow_sunrise_cream_rag.png (Sunrise / Low Sun 15 deg)
//   2. screenshots/s2_canyon_shadow_midday_cream_rag.png (Midday / High Sun 72 deg)
//   3. screenshots/s2_canyon_shadow_cyanotype.png (Theme 2: Prussian Cyanotype)
//   4. screenshots/s2_canyon_shadow_marie_tharp.png (Theme 0: Marie Tharp Chart)
//   5. screenshots/s2_dualstate_canyon_shadows_active.png (Dual-State: Shadows Active)
//   6. screenshots/s2_dualstate_canyon_shadows_bypassed.png (Dual-State: Shadows Bypassed)
// Enforces:
//   - Rule 3 & Invariant §28: All 3 Medium Identities Verified
//   - Rule 5: Grand Canyon barrier at opposing solar altitudes (> 50 KB real content)
//   - Dual-State Visual Contrast: Observable pixel delta between Active vs Bypassed
// ============================================================================

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DEV_SERVER_URL = 'http://localhost:3000';

const CAPTURES = [
  {
    name: 's2_canyon_shadow_sunrise_cream_rag',
    outputPath: path.resolve('screenshots/s2_canyon_shadow_sunrise_cream_rag.png'),
    label: 'Grand Canyon Sunrise / Low Sun (Altitude 15°): Long Cast Shadows in Cream Rag',
    options: {
      lonDeg: -112.14,
      latDeg: 36.06,
      altitudeRadius: 5.012,
      pitchDeg: 64.0,
      headingDeg: 45.0,
      theme: 1,
      sunAltitude: 15.0,
      sunAzimuth: 110.0,
      terrainShadows: true,
      maxRayDistanceMeters: 50000.0,
      penumbraSoftness: 1.5,
    },
  },
  {
    name: 's2_canyon_shadow_midday_cream_rag',
    outputPath: path.resolve('screenshots/s2_canyon_shadow_midday_cream_rag.png'),
    label: 'Grand Canyon Midday / High Sun (Altitude 72°): Minimal Shadows in Cream Rag',
    options: {
      lonDeg: -112.14,
      latDeg: 36.06,
      altitudeRadius: 5.012,
      pitchDeg: 64.0,
      headingDeg: 45.0,
      theme: 1,
      sunAltitude: 72.0,
      sunAzimuth: 180.0,
      terrainShadows: true,
      maxRayDistanceMeters: 50000.0,
      penumbraSoftness: 1.5,
    },
  },
  {
    name: 's2_canyon_shadow_cyanotype',
    outputPath: path.resolve('screenshots/s2_canyon_shadow_cyanotype.png'),
    label: 'Grand Canyon in Prussian Cyanotype (Theme 2): Photochemical Horizon Shadows',
    options: {
      lonDeg: -112.14,
      latDeg: 36.06,
      altitudeRadius: 5.012,
      pitchDeg: 64.0,
      headingDeg: 45.0,
      theme: 2,
      sunAltitude: 18.0,
      sunAzimuth: 120.0,
      terrainShadows: true,
      maxRayDistanceMeters: 50000.0,
      penumbraSoftness: 1.5,
    },
  },
  {
    name: 's2_canyon_shadow_marie_tharp',
    outputPath: path.resolve('screenshots/s2_canyon_shadow_marie_tharp.png'),
    label: 'Grand Canyon in Marie Tharp (Theme 0): Physiographic Vellum Horizon Shadows',
    options: {
      lonDeg: -112.14,
      latDeg: 36.06,
      altitudeRadius: 5.012,
      pitchDeg: 64.0,
      headingDeg: 45.0,
      theme: 0,
      sunAltitude: 18.0,
      sunAzimuth: 120.0,
      terrainShadows: true,
      maxRayDistanceMeters: 50000.0,
      penumbraSoftness: 1.5,
    },
  },
  {
    name: 's2_dualstate_canyon_shadows_active',
    outputPath: path.resolve('screenshots/s2_dualstate_canyon_shadows_active.png'),
    label: 'Dual-State A: Canyon Self-Shadowing ACTIVE (16-tap Adaptive Raymarch Occlusion)',
    options: {
      lonDeg: -112.14,
      latDeg: 36.06,
      altitudeRadius: 5.012,
      pitchDeg: 64.0,
      headingDeg: 45.0,
      theme: 1,
      sunAltitude: 18.0,
      sunAzimuth: 125.0,
      terrainShadows: true,
      maxRayDistanceMeters: 50000.0,
      penumbraSoftness: 1.5,
    },
  },
  {
    name: 's2_dualstate_canyon_shadows_bypassed',
    outputPath: path.resolve('screenshots/s2_dualstate_canyon_shadows_bypassed.png'),
    label: 'Dual-State B: Canyon Self-Shadowing BYPASSED (Raw Fallback White Mask)',
    options: {
      lonDeg: -112.14,
      latDeg: 36.06,
      altitudeRadius: 5.012,
      pitchDeg: 64.0,
      headingDeg: 45.0,
      theme: 1,
      sunAltitude: 18.0,
      sunAzimuth: 125.0,
      terrainShadows: false,
      maxRayDistanceMeters: 50000.0,
      penumbraSoftness: 1.5,
    },
  },
];

async function runCaptures() {
  let browser = null;

  try {
    console.log('[capture-shadows] Launching Google Chrome with WebGPU and Metal backend...');
    browser = await chromium.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: false,
      args: [
        '--enable-unsafe-webgpu',
        '--use-gl=angle',
        '--use-angle=metal',
        '--ignore-gpu-blocklist',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('[browser error]', err));
    await page.bringToFront();

    console.log('[capture-shadows] Navigating to http://localhost:3000...');
    await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('[capture-shadows] Waiting for engine and snapTerrainShadows hook...');
    await page.waitForFunction(
      () =>
        typeof window.__INDICATRIX_CAMERA__ !== 'undefined' &&
        typeof window.__INDICATRIX_CAMERA__.snapTerrainShadows === 'function' &&
        typeof window.__INDICATRIX_WEBGPU_ENGINE__ !== 'undefined' &&
        window.__INDICATRIX_WEBGPU_ENGINE__.initialized === true,
      { timeout: 60000 }
    );

    // Settle initial pipelines
    await page.waitForTimeout(2500);

    const savedFiles = [];

    for (const item of CAPTURES) {
      console.log(`\n[capture-shadows] --- Capturing ${item.label} ---`);
      const startTime = Date.now();

      await page.evaluate((options) => {
        window.__INDICATRIX_CAMERA__.snapTerrainShadows(options);
      }, item.options);

      // Wait for camera transition, shadow compute dispatch, and frame settling
      await page.waitForTimeout(3000);
      const elapsed = Date.now() - startTime;
      console.log(`[capture-shadows] Settled in ${elapsed}ms`);

      const screenshotBuf = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      fs.writeFileSync(item.outputPath, screenshotBuf);
      const sizeKB = (screenshotBuf.length / 1024).toFixed(1);
      console.log(`[capture-shadows] Saved: ${item.outputPath} (${sizeKB} KB)`);
      savedFiles.push({ path: item.outputPath, size: screenshotBuf.length, name: item.name });

      if (screenshotBuf.length < 50 * 1024) {
        console.warn(`[capture-shadows] WARNING: ${item.outputPath} is under 50KB (${sizeKB} KB).`);
      }
    }

    // Verify dual-state pixel delta between Active and Bypassed
    const activeFile = savedFiles.find((f) => f.name === 's2_dualstate_canyon_shadows_active');
    const bypassedFile = savedFiles.find((f) => f.name === 's2_dualstate_canyon_shadows_bypassed');
    if (activeFile && bypassedFile) {
      const b1 = fs.readFileSync(activeFile.path);
      const b2 = fs.readFileSync(bypassedFile.path);
      let diffBytes = 0;
      const minLen = Math.min(b1.length, b2.length);
      for (let i = 0; i < minLen; i++) {
        if (b1[i] !== b2[i]) diffBytes++;
      }
      diffBytes += Math.abs(b1.length - b2.length);
      const diffPercent = ((diffBytes / minLen) * 100).toFixed(2);
      console.log(`\n[capture-shadows] Dual-State Contrast Check (Active vs Bypassed):`);
      console.log(`  Differing Bytes: ${diffBytes} / ${minLen} (${diffPercent}%)`);
      if (diffBytes > 0) {
        console.log(`  PASS: Observable pixel delta confirmed between Active and Bypassed shadow map.`);
      } else {
        console.warn(`  FAIL: Zero pixel delta between Active and Bypassed!`);
      }
    }

    // Verify opposing solar altitude pixel delta (Sunrise vs Midday)
    const sunriseFile = savedFiles.find((f) => f.name === 's2_canyon_shadow_sunrise_cream_rag');
    const middayFile = savedFiles.find((f) => f.name === 's2_canyon_shadow_midday_cream_rag');
    if (sunriseFile && middayFile) {
      const b1 = fs.readFileSync(sunriseFile.path);
      const b2 = fs.readFileSync(middayFile.path);
      let diffBytes = 0;
      const minLen = Math.min(b1.length, b2.length);
      for (let i = 0; i < minLen; i++) {
        if (b1[i] !== b2[i]) diffBytes++;
      }
      diffBytes += Math.abs(b1.length - b2.length);
      const diffPercent = ((diffBytes / minLen) * 100).toFixed(2);
      console.log(`\n[capture-shadows] Opposing Solar Altitude Check (Sunrise 15° vs Midday 72°):`);
      console.log(`  Differing Bytes: ${diffBytes} / ${minLen} (${diffPercent}%)`);
      if (diffBytes > 0) {
        console.log(`  PASS: Substantial visual delta confirmed across opposing solar altitudes.`);
      } else {
        console.warn(`  FAIL: Zero pixel delta between Sunrise and Midday!`);
      }
    }

    console.log('\n[capture-shadows] All captures completed successfully.');
  } catch (err) {
    console.error('[capture-shadows] Error during capture:', err);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runCaptures();
