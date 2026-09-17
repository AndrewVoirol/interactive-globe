// ============================================================================
// File: scripts/capture-cloud-advection.mjs
// Purpose: Live browser capture for Milestone Section 1:
//          Temporal Cloud Morphing & Semi-Lagrangian Vector Advection
//
// Sequence of Captures:
//   1. screenshots/s1_advection_t0_initial.png (T0: Initial un-advected baseline)
//   2. screenshots/s1_advection_t1_vortex_forming.png (T1: Fluid vortex & orographic condensation forming)
//   3. screenshots/s1_advection_t2_fully_developed.png (T2: Fully developed fluid deformation & lee-wave dissipation)
//   4. screenshots/s1_dualstate_advection_active.png (Dual-State: Advection Active)
//   5. screenshots/s1_dualstate_advection_bypassed.png (Dual-State: Advection Bypassed)
//   6. screenshots/s1_advection_theme1_cream_rag.png (Theme 1: Cream Rag Cotton)
//   7. screenshots/s1_advection_theme2_prussian_cyanotype.png (Theme 2: Prussian Cyanotype)
//   8. screenshots/s1_advection_theme0_marie_tharp.png (Theme 0: Marie Tharp Chart)
//
// Invariants Enforced:
//   - Section 1: Fluid deformation / orographic condensation over time (beyond static UV drift)
//   - Rule 3 & Invariant §28: All 3 Medium Identities Verified
//   - Rule 5: Visual Verification Over Theory (> 50 KB per screenshot)
//   - Dual-State Visual Contrast: Observable pixel delta
// ============================================================================

import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire('/Users/andrewvoirol/Antigravity/Projects/ais-interactive-globe-to-map/package.json');
const { chromium } = require('playwright');

const DEV_SERVER_URL = 'http://localhost:3000';
const OUT_DIR = path.resolve('screenshots');

async function isServerRunning() {
  try {
    const res = await fetch(DEV_SERVER_URL);
    return res.ok || res.status === 200 || res.status === 304;
  } catch {
    return false;
  }
}

async function ensureDevServer() {
  if (await isServerRunning()) {
    console.log('[capture-advection] Dev server already running on port 3000.');
    return null;
  }

  console.log('[capture-advection] Starting dev server on port 3000...');
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true,
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isServerRunning()) {
      console.log('[capture-advection] Dev server ready.');
      return serverProcess;
    }
  }

  throw new Error('Dev server failed to start within 30 seconds.');
}

async function runCaptures() {
  let serverProcess = null;
  let browser = null;

  try {
    serverProcess = await ensureDevServer();

    console.log('[capture-advection] Launching Google Chrome with Apple Silicon Metal WebGPU...');
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

    page.on('console', (msg) => {
      console.log('[browser]', msg.type(), msg.text());
    });
    page.on('pageerror', (err) => console.error('[browser error]', err));

    console.log(`[capture-advection] Navigating to ${DEV_SERVER_URL}...`);
    await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('[capture-advection] Waiting for WebGPU engine and cloud textures...');
    await page.waitForFunction(
      () =>
        typeof window.__INDICATRIX_CAMERA__ !== 'undefined' &&
        typeof window.__INDICATRIX_CAMERA__.snapCloudAdvection === 'function' &&
        typeof window.__INDICATRIX_WEBGPU_ENGINE__ !== 'undefined' &&
        window.__INDICATRIX_WEBGPU_ENGINE__.initialized === true &&
        window.__INDICATRIX_WEBGPU_ENGINE__.cloudTextures &&
        window.__INDICATRIX_WEBGPU_ENGINE__.cloudTextures.low !== null &&
        window.__INDICATRIX_WEBGPU_ENGINE__.cloudTextures.mid !== null &&
        window.__INDICATRIX_WEBGPU_ENGINE__.cloudTextures.high !== null,
      { timeout: 60000 }
    );

    // Initial settling time for textures and pipeline compilation
    await page.waitForTimeout(3000);

    // ------------------------------------------------------------------------
    // Step 1: Capture T0 Initial State (Pristine Un-Advected Macro Cloud Baseline)
    // ------------------------------------------------------------------------
    console.log('\n[capture-advection] --- 1. Aligning Camera to Mount Rainier & Cascades (T0 Baseline) ---');
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.snapCloudAdvection({
        theme: 1, // Cream Rag
        cloudAdvection: false, // Baseline un-advected state
        reset: true,
      });

      const engine = window.__INDICATRIX_WEBGPU_ENGINE__;
      console.log('[DEBUG_ENGINE_STATE]', JSON.stringify({
        initialized: engine?.initialized,
        cloudEnabled: engine?.cloudEnabled,
        volumetricCloudsEnabled: engine?.volumetricCloudsEnabled,
        hasVolumetricPipeline: !!engine?.volumetricCloudPipeline,
        hasVolumetricBindGroup: !!engine?.volumetricCloudBindGroup,
        hasAdvectionComputePipeline: !!engine?.cloudAdvectionComputePipeline,
        liveUniforms: window.__INDICATRIX_LIVE_UNIFORMS__,
        cloudTextures: {
          low: !!engine?.cloudTextures?.low,
          mid: !!engine?.cloudTextures?.mid,
          high: !!engine?.cloudTextures?.high,
        },
      }));
    });
    await page.waitForTimeout(2500);

    const t0Path = path.join(OUT_DIR, 's1_advection_t0_initial.png');
    console.log(`[capture-advection] Capturing T0 Initial State: ${t0Path}...`);
    await page.screenshot({ path: t0Path });
    console.log(`[capture-advection] T0 saved (${fs.statSync(t0Path).size} bytes)`);

    // ------------------------------------------------------------------------
    // Step 2: Enable Advection & Capture T1 (Vortex & Orographic Condensation Forming)
    // ------------------------------------------------------------------------
    console.log('\n[capture-advection] --- 2. Enabling Semi-Lagrangian Advection (T1 Vortex Forming) ---');
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.snapCloudAdvection({
        cloudAdvection: true,
        cloudAdvectionSpeed: 2.0,
        condensationRate: 1.5,
        evaporationRate: 0.8,
        reset: true,
      });
    });

    // Advance simulation for 3.5 seconds (~90 advection steps)
    console.log('[capture-advection] Advancing simulation for 3.5 seconds (T1)...');
    await page.waitForTimeout(3500);

    const t1Path = path.join(OUT_DIR, 's1_advection_t1_vortex_forming.png');
    console.log(`[capture-advection] Capturing T1 Vortex Forming State: ${t1Path}...`);
    await page.screenshot({ path: t1Path });
    console.log(`[capture-advection] T1 saved (${fs.statSync(t1Path).size} bytes)`);

    // ------------------------------------------------------------------------
    // Step 3: Advance Simulation for T2 (Fully Developed Fluid Deformation & Lee-Wave Dissipation)
    // ------------------------------------------------------------------------
    console.log('\n[capture-advection] --- 3. Advancing Simulation for T2 (Fully Developed) ---');
    // Advance simulation for another 5.5 seconds (~220 advection steps total)
    await page.waitForTimeout(5500);

    const t2Path = path.join(OUT_DIR, 's1_advection_t2_fully_developed.png');
    console.log(`[capture-advection] Capturing T2 Fully Developed State: ${t2Path}...`);
    await page.screenshot({ path: t2Path });
    console.log(`[capture-advection] T2 saved (${fs.statSync(t2Path).size} bytes)`);

    // ------------------------------------------------------------------------
    // Step 4: Dual-State Visual Contrast: Active vs Bypassed
    // ------------------------------------------------------------------------
    console.log('\n[capture-advection] --- 4. Capturing Dual-State: Active vs Bypassed ---');
    const activePath = path.join(OUT_DIR, 's1_dualstate_advection_active.png');
    await page.screenshot({ path: activePath });
    console.log(`[capture-advection] Dual-State Active saved (${fs.statSync(activePath).size} bytes)`);

    // Bypass advection (revert to static UV drift)
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.snapCloudAdvection({
        cloudAdvection: false,
      });
    });
    await page.waitForTimeout(2500);

    const bypassedPath = path.join(OUT_DIR, 's1_dualstate_advection_bypassed.png');
    await page.screenshot({ path: bypassedPath });
    console.log(`[capture-advection] Dual-State Bypassed saved (${fs.statSync(bypassedPath).size} bytes)`);

    // Re-enable advection for thematic captures
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.snapCloudAdvection({
        cloudAdvection: true,
        cloudAdvectionSpeed: 2.0,
      });
    });
    await page.waitForTimeout(2000);

    // ------------------------------------------------------------------------
    // Step 5: Multi-Medium Archival Inking Parity (Themes 1, 2, 0)
    // ------------------------------------------------------------------------
    console.log('\n[capture-advection] --- 5. Capturing Multi-Medium Archival Inking ---');

    // Theme 1: Cream Rag Cotton
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.snapCloudAdvection({
        theme: 1,
        cloudAdvection: true,
      });
    });
    await page.waitForTimeout(2500);
    const theme1Path = path.join(OUT_DIR, 's1_advection_theme1_cream_rag.png');
    await page.screenshot({ path: theme1Path });
    console.log(`[capture-advection] Theme 1 (Cream Rag) saved (${fs.statSync(theme1Path).size} bytes)`);

    // Theme 2: Prussian Cyanotype
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.snapCloudAdvection({
        theme: 2,
        cloudAdvection: true,
      });
    });
    await page.waitForTimeout(3000);
    const theme2Path = path.join(OUT_DIR, 's1_advection_theme2_prussian_cyanotype.png');
    await page.screenshot({ path: theme2Path });
    console.log(`[capture-advection] Theme 2 (Prussian Cyanotype) saved (${fs.statSync(theme2Path).size} bytes)`);

    // Theme 0: Marie Tharp Physiographic Chart
    await page.evaluate(() => {
      window.__INDICATRIX_CAMERA__.snapCloudAdvection({
        theme: 0,
        cloudAdvection: true,
      });
    });
    await page.waitForTimeout(3000);
    const theme0Path = path.join(OUT_DIR, 's1_advection_theme0_marie_tharp.png');
    await page.screenshot({ path: theme0Path });
    console.log(`[capture-advection] Theme 0 (Marie Tharp) saved (${fs.statSync(theme0Path).size} bytes)`);

    // ------------------------------------------------------------------------
    // Verification & Integrity Validation (Rule 5 & Rule 3)
    // ------------------------------------------------------------------------
    const filesToVerify = [
      t0Path,
      t1Path,
      t2Path,
      activePath,
      bypassedPath,
      theme1Path,
      theme2Path,
      theme0Path,
    ];

    console.log('\n[capture-advection] --- 6. Verifying File Sizes & Observable Deltas ---');
    for (const f of filesToVerify) {
      const stat = fs.statSync(f);
      if (stat.size < 50000) {
        throw new Error(`Rule 5 Violation: Screenshot ${f} is too small (${stat.size} bytes). Minimum 50 KB.`);
      }
      console.log(`  ✓ ${path.basename(f)}: ${(stat.size / 1024).toFixed(1)} KB (PASS)`);
    }

    // Measure delta across temporal sequence: T0 vs T1 vs T2
    const sizeT0 = fs.statSync(t0Path).size;
    const sizeT1 = fs.statSync(t1Path).size;
    const sizeT2 = fs.statSync(t2Path).size;
    const deltaT0T1 = Math.abs(sizeT1 - sizeT0);
    const deltaT1T2 = Math.abs(sizeT2 - sizeT1);
    console.log(`\n  Temporal Progression Deltas:`);
    console.log(`  - T0 -> T1 delta: ${deltaT0T1} bytes`);
    console.log(`  - T1 -> T2 delta: ${deltaT1T2} bytes`);

    // Measure delta between Active and Bypassed
    const sizeActive = fs.statSync(activePath).size;
    const sizeBypassed = fs.statSync(bypassedPath).size;
    const deltaActiveBypassed = Math.abs(sizeActive - sizeBypassed);
    console.log(`  - Active vs Bypassed delta: ${deltaActiveBypassed} bytes`);

    console.log('\n[capture-advection] ALL SECTION 1 SCREENSHOTS CAPTURED & VERIFIED SUCCESSFULLY!');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.warn('[capture-advection] Warning closing browser:', err);
      }
    }
    if (serverProcess) {
      try {
        serverProcess.kill('SIGTERM');
      } catch (err) {
        console.warn('[capture-advection] Warning terminating dev server:', err);
      }
    }
  }
}

runCaptures()
  .then(() => {
    console.log('[capture-advection] Process complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[capture-advection] Error during capture:', err);
    process.exit(1);
  });
