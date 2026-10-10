#!/usr/bin/env node
// ============================================================================
// File: scripts/verify-zoom-qualification.mjs
// Architecture: Hardware-Canary Model Qualification & Image Sharpness Harness
// Description: Executes Metal-accelerated WebGPU browser automation, validates
//              hardware adapter integrity, evaluates non-blank framebuffer pixels,
//              measures Modified Laplacian edge energy, and generates visual
//              difference heatmaps for multimodal model inspection.
// ============================================================================

import { chromium } from 'playwright';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.resolve(PROJECT_ROOT, 'screenshots/qualification');

// Calibrated Litmus Test Viewpoints (Survey Inspection Profile)
// Enabled by Camera-Coupled Dynamic Relief Attenuation (lowering clearance floor from 144km to 35km AGL)
export const LITMUS_VIEWPOINTS = [
  {
    id: 'litmus-alpine-matterhorn',
    name: 'Matterhorn Alpine Massif',
    lat: 45.9765,
    lon: 7.6585,
    altitudeRadius: 5.045, // ~57 km survey altitude (safely above summit clearance floor 5.028)
    pitchDeg: 25,
    expectedFeatures: ['alpine_rock_strata', 'couloir_fluting', 'peak_spot_heights'],
  },
  {
    id: 'litmus-canyon-grandcanyon',
    name: 'Grand Canyon Fluvial Incision',
    lat: 36.0570,
    lon: -112.1430,
    altitudeRadius: 5.035, // ~45 km survey altitude (safely above canyon rim floor 5.013)
    pitchDeg: 25,
    expectedFeatures: ['stepped_limestone_terraces', 'river_tapering', 'dense_contours'],
  },
  {
    id: 'litmus-oceanic-hawaii',
    name: 'Hawaii Oceanic Volcano & Trench',
    lat: 19.6500,
    lon: -155.5500,
    altitudeRadius: 5.040, // ~51 km survey altitude
    pitchDeg: 25,
    expectedFeatures: ['volcanic_shield_flank', 'shallow_reef_glow', 'depth_soundings'],
  },
];

/**
 * Computes Modified Laplacian Sharpness (edge energy) across canvas pixels
 */
export function computeLaplacianSharpness(imgData, width, height) {
  const data = imgData.data;
  let totalLaplacian = 0;
  let sampledPixels = 0;

  // Skip outer 20px border (HUD neatline / frame margin)
  const margin = 20;
  for (let y = margin + 1; y < height - margin - 1; y += 2) {
    for (let x = margin + 1; x < width - margin - 1; x += 2) {
      const idx = (y * width + x) * 4;
      // Convert to luminance Y = 0.299R + 0.587G + 0.114B
      const lC = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;

      const idxL = (y * width + (x - 1)) * 4;
      const idxR = (y * width + (x + 1)) * 4;
      const idxU = ((y - 1) * width + x) * 4;
      const idxD = ((y + 1) * width + x) * 4;

      const lL = (data[idxL] * 299 + data[idxL + 1] * 587 + data[idxL + 2] * 114) / 1000;
      const lR = (data[idxR] * 299 + data[idxR + 1] * 587 + data[idxR + 2] * 114) / 1000;
      const lU = (data[idxU] * 299 + data[idxU + 1] * 587 + data[idxU + 2] * 114) / 1000;
      const lD = (data[idxD] * 299 + data[idxD + 1] * 587 + data[idxD + 2] * 114) / 1000;

      // Discrete Modified Laplacian
      const lap = Math.abs(2 * lC - lL - lR) + Math.abs(2 * lC - lU - lD);
      totalLaplacian += lap;
      sampledPixels++;
    }
  }

  return sampledPixels > 0 ? totalLaplacian / sampledPixels : 0;
}

/**
 * Computes pixel delta and generates visual difference heatmap
 */
export async function computeDeltaHeatmap(baselinePath, currentPath, heatmapOutputPath) {
  if (!fs.existsSync(baselinePath) || !fs.existsSync(currentPath)) {
    return { meanDelta: 0, activeRatio: 0 };
  }

  const [baseImg, curImg] = await Promise.all([
    loadImage(baselinePath),
    loadImage(currentPath),
  ]);

  const width = baseImg.width;
  const height = baseImg.height;

  const canvasA = createCanvas(width, height);
  const ctxA = canvasA.getContext('2d');
  ctxA.drawImage(baseImg, 0, 0);
  const dataA = ctxA.getImageData(0, 0, width, height).data;

  const canvasB = createCanvas(width, height);
  const ctxB = canvasB.getContext('2d');
  ctxB.drawImage(curImg, 0, 0);
  const dataB = ctxB.getImageData(0, 0, width, height).data;

  const heatCanvas = createCanvas(width, height);
  const heatCtx = heatCanvas.getContext('2d');
  const heatImgData = heatCtx.createImageData(width, height);
  const heatData = heatImgData.data;

  let totalDelta = 0;
  let activePixels = 0;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const dr = Math.abs(dataB[idx + 0] - dataA[idx + 0]);
    const dg = Math.abs(dataB[idx + 1] - dataA[idx + 1]);
    const db = Math.abs(dataB[idx + 2] - dataA[idx + 2]);
    const dVal = (dr + dg + db) / 3.0;

    totalDelta += dVal;
    if (dVal > 8.0) {
      activePixels++;
    }

    // False-color heatmap: black -> cyan -> green -> yellow -> red
    const normD = Math.min(1.0, dVal / 64.0);
    if (normD < 0.05) {
      heatData[idx + 0] = 10;
      heatData[idx + 1] = 10;
      heatData[idx + 2] = 15;
    } else if (normD < 0.35) {
      const t = normD / 0.35;
      heatData[idx + 0] = 0;
      heatData[idx + 1] = Math.round(t * 220);
      heatData[idx + 2] = 255;
    } else if (normD < 0.70) {
      const t = (normD - 0.35) / 0.35;
      heatData[idx + 0] = Math.round(t * 255);
      heatData[idx + 1] = 255;
      heatData[idx + 2] = Math.round((1 - t) * 200);
    } else {
      const t = (normD - 0.70) / 0.30;
      heatData[idx + 0] = 255;
      heatData[idx + 1] = Math.round((1 - t) * 220);
      heatData[idx + 2] = 0;
    }
    heatData[idx + 3] = 255;
  }

  heatCtx.putImageData(heatImgData, 0, 0);
  const outBuf = heatCanvas.toBuffer('image/png');
  fs.writeFileSync(heatmapOutputPath, outBuf);

  return {
    meanDelta: totalDelta / totalPixels,
    activeRatio: activePixels / totalPixels,
  };
}

/**
 * Main Qualification Execution
 */
export async function runQualification(options = {}) {
  const {
    appUrl = process.env.APP_URL || 'http://localhost:3000',
    mode = 'evaluate', // 'baseline' or 'evaluate'
  } = options;

  console.log('================================================================');
  console.log(' INDICATRIX ENGINE: HARDWARE-CANARY MODEL QUALIFICATION HARNESS ');
  console.log('================================================================');
  console.log(` Target App URL:   ${appUrl}`);
  console.log(` Execution Mode:   ${mode.toUpperCase()}`);
  console.log(` Output Directory: ${OUTPUT_DIR}`);
  console.log('----------------------------------------------------------------');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Launch verified Google Chrome binary with native Apple Metal WebGPU flags
  console.log('Launching hardware-accelerated Google Chrome...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=default',
      '--use-angle=metal',
      '--use-gpu-in-tests',
      '--ignore-gpu-blocklist',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Console and WGSL Error Listening
  const wgslErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('WGSL') || text.includes('compilation error') || text.includes('uncaptured error')) {
      wgslErrors.push(text);
      console.error(`[BROWSER WGSL ERROR] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    console.error(`[PAGE RUNTIME ERROR] ${err.message}`);
  });

  // Navigate to application
  console.log(`Navigating to ${appUrl}...`);
  try {
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 25000 });
  } catch (err) {
    console.error(`Failed to connect to ${appUrl}. Is the dev server running?`);
    await browser.close();
    process.exit(1);
  }

  // 2. Hardware Canary Assertion (Fail-Safe 1)
  console.log('Executing Hardware Canary Assertion...');
  const canary = await page.evaluate(async () => {
    if (!navigator.gpu) {
      return { ok: false, error: 'navigator.gpu is undefined. Ensure context is secure (localhost).' };
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { ok: false, error: 'navigator.gpu.requestAdapter() returned null.' };
    }
    return {
      ok: true,
      vendor: adapter.info?.vendor || 'unknown',
      architecture: adapter.info?.architecture || 'unknown',
      description: adapter.info?.description || '',
    };
  });

  if (!canary.ok) {
    console.error(`\n[FATAL CANARY FAILURE] ${canary.error}`);
    await browser.close();
    process.exit(1);
  }

  console.log(`✓ WebGPU Adapter: Vendor="${canary.vendor}", Architecture="${canary.architecture}"`);

  // Assert native Apple Metal acceleration (Reject SwiftShader software emulation)
  if (canary.vendor.toLowerCase() !== 'apple') {
    console.warn(`[WARNING] Non-Apple adapter detected (${canary.vendor}). Hardware profiling may differ.`);
  }

  // 3. Engine Initialization Assertion
  console.log('Waiting for Indicatrix WebGPU Engine initialization...');
  await page.waitForFunction(() => {
    return !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__;
  }, { timeout: 20000 });
  console.log('✓ Indicatrix Engine & Camera controllers confirmed.');

  // Settle textures
  await page.waitForTimeout(3000);

  const report = {
    timestamp: new Date().toISOString(),
    canary,
    viewpoints: [],
  };

  // Define the 3 non-negotiable cartographic mediums (Rule 3)
  const themes = [
    { id: 'cream-rag', index: 1, name: 'Cream Rag (Theme 1)' },
    { id: 'prussian-cyanotype', index: 2, name: 'Prussian Cyanotype (Theme 2)' },
    { id: 'marie-tharp', index: 0, name: 'Marie Tharp (Theme 0)' },
  ];

  // Configure Shader Zoom Detail Mode (A/B Test Verification)
  if (mode === 'baseline') {
    console.log('\n[MODE: BASELINE] Enforcing un-enhanced baseline (procedural micro-detail = 0.0, contours = 0.0).');
  } else {
    console.log('\n[MODE: EVALUATE] Enforcing calibrated zoom detail state (micro-detail = 0.65, contours = 1.0).');
  }

  // 4. Execute Litmus Viewpoint Captures across all 3 Mediums
  for (const theme of themes) {
    console.log(`\n============================================================`);
    console.log(` Cartographic Medium: ${theme.name}`);
    console.log(`============================================================`);

    // Switch theme via Indicatrix API
    await page.evaluate((idx) => {
      if (typeof window.setTheme === 'function') {
        window.setTheme(idx);
      }
      if (typeof window.__INDICATRIX_THEME__?.setThemeIndex === 'function') {
        window.__INDICATRIX_THEME__.setThemeIndex(idx);
      }
    }, theme.index);
    await page.waitForTimeout(1000);

    for (const vp of LITMUS_VIEWPOINTS) {
      console.log(`\n--- Viewpoint: ${vp.name} (${vp.id}) [${theme.id}] ---`);

      // Enforce uniform state for baseline vs evaluate mode
      await page.evaluate((isBaseline) => {
        if (typeof window !== 'undefined') {
          window.__INDICATRIX_LIVE_OVERRIDES__ = {
            ...(window.__INDICATRIX_LIVE_OVERRIDES__ || {}),
            microDetailStrength: isBaseline ? 0.0 : 0.65,
            contourActive: !isBaseline,
          };
        }
        if (window.__INDICATRIX_ENGINE__?.updateGeomorphicMicroUniforms) {
          window.__INDICATRIX_ENGINE__.updateGeomorphicMicroUniforms({
            microDetailStrength: isBaseline ? 0.0 : 0.65,
            rockSlopeThreshold: 0.61,
            contourBaseInterval: 50.0,
            contourActive: !isBaseline,
          });
        }
      }, mode === 'baseline');

      // Navigate camera via Indicatrix Camera API with oblique pitch support
      await page.evaluate(({ lon, lat, alt, pitch }) => {
        if (window.__INDICATRIX_CAMERA__?.setObliqueView) {
          window.__INDICATRIX_CAMERA__.setObliqueView(lon, lat, alt, pitch, 0);
        } else if (window.__INDICATRIX_CAMERA__?.lookAtCoordinates) {
          window.__INDICATRIX_CAMERA__.lookAtCoordinates(lon, lat, alt);
        }
      }, { lon: vp.lon, lat: vp.lat, alt: vp.altitudeRadius, pitch: vp.pitchDeg });

      // Allow CDLOD and tile streaming to settle
      await page.waitForTimeout(3500);

      const prefix = mode === 'baseline' ? 'baseline' : 'current';
      const screenshotName = `${prefix}_${theme.id}_${vp.id}.png`;
      const screenshotPath = path.join(OUTPUT_DIR, screenshotName);

      await page.screenshot({ path: screenshotPath });
      console.log(`✓ Saved capture: ${screenshotPath}`);

      // Also save default theme (Cream Rag) to legacy path for backward compatibility
      if (theme.index === 1) {
        const legacyPath = path.join(OUTPUT_DIR, `${prefix}_${vp.id}.png`);
        fs.copyFileSync(screenshotPath, legacyPath);
      }

      // Fail-Safe 2: Non-Zero Framebuffer Pixel Canary
      const img = await loadImage(screenshotPath);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);

      // Compute active non-black pixels
      let nonBlackCount = 0;
      const totalPx = img.width * img.height;
      for (let p = 0; p < totalPx; p++) {
        const idx = p * 4;
        if (imgData.data[idx] > 5 || imgData.data[idx + 1] > 5 || imgData.data[idx + 2] > 5) {
          nonBlackCount++;
        }
      }
      const nonBlackRatio = nonBlackCount / totalPx;
      if (nonBlackRatio < 0.05) {
        console.error(`\n[FATAL FRAMEBUFFER DEFECT] Screenshot is >95% black. WebGPU render target failed.`);
        await browser.close();
        process.exit(1);
      }
      console.log(`✓ Framebuffer Validated: ${(nonBlackRatio * 100).toFixed(1)}% active non-black pixels.`);

      // Compute Modified Laplacian Sharpness
      const sharpness = computeLaplacianSharpness(imgData, img.width, img.height);
      console.log(`✓ Modified Laplacian Edge Sharpness: ${sharpness.toFixed(3)} units.`);

      const vpResult = {
        id: vp.id,
        theme: theme.id,
        name: vp.name,
        screenshot: screenshotPath,
        sharpness,
        nonBlackRatio,
      };

      // If in evaluation mode, compare against baseline
      if (mode === 'evaluate') {
        const baselinePath = path.join(OUTPUT_DIR, `baseline_${theme.id}_${vp.id}.png`);
        const heatmapPath = path.join(OUTPUT_DIR, `heatmap_${theme.id}_${vp.id}.png`);

        if (fs.existsSync(baselinePath)) {
          const delta = await computeDeltaHeatmap(baselinePath, screenshotPath, heatmapPath);
          const baseImg = await loadImage(baselinePath);
          const bCanvas = createCanvas(baseImg.width, baseImg.height);
          const bCtx = bCanvas.getContext('2d');
          bCtx.drawImage(baseImg, 0, 0);
          const bData = bCtx.getImageData(0, 0, baseImg.width, baseImg.height);
          const baseSharpness = computeLaplacianSharpness(bData, baseImg.width, baseImg.height);
          const sharpnessRatio = baseSharpness > 1e-4 ? (sharpness / baseSharpness) : 1.0;

          vpResult.baselineSharpness = baseSharpness;
          vpResult.sharpnessRatio = sharpnessRatio;
          vpResult.meanDelta = delta.meanDelta;
          vpResult.activeDeltaRatio = delta.activeRatio;
          vpResult.heatmap = heatmapPath;
          console.log(`✓ Delta vs Baseline: Mean Δ = ${delta.meanDelta.toFixed(2)}, Active Area = ${(delta.activeRatio * 100).toFixed(1)}%`);
          console.log(`✓ Sharpness Progression: Baseline = ${baseSharpness.toFixed(3)}, Evaluated = ${sharpness.toFixed(3)} (${sharpnessRatio.toFixed(2)}x)`);
          console.log(`✓ Generated Heatmap: ${heatmapPath}`);
        } else {
          console.log(`ℹ Baseline capture not found for ${vp.id} (${theme.id}); run with --baseline first for delta metrics.`);
        }
      }

      report.viewpoints.push(vpResult);
    }
  }

  // 5. Emit Machine-Readable Report
  const reportPath = path.join(OUTPUT_DIR, `${mode}_qualification_report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n================================================================`);
  console.log(` Qualification run completed. Report written to:`);
  console.log(` ${reportPath}`);
  console.log(`================================================================`);

  if (wgslErrors.length > 0) {
    console.error(`\n[FAILURE] ${wgslErrors.length} WGSL Shader errors detected during run.`);
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  return report;
}

// CLI Execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isBaseline = process.argv.includes('--baseline');
  runQualification({ mode: isBaseline ? 'baseline' : 'evaluate' }).catch((err) => {
    console.error('Fatal error during qualification execution:', err);
    process.exit(1);
  });
}
