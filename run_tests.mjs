import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--use-gpu-in-tests',
      '--ignore-gpu-blocklist',
      '--enable-features=Vulkan,DefaultANGLEVulkan,Metal',
      '--use-angle=metal'
    ]
  });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      console.log(`[PAGE ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`[PAGE ERROR] ${err.message}`);
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  
  if (errors.some(e => e.includes('504'))) {
    console.log("Vite optimize dep 504 detected, reloading...");
    errors.length = 0; // Clear errors
    await page.reload();
  }
  
  await page.waitForTimeout(5000);
  
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  // Helper to wait
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Part 1: Baseline Visual Delta Audit
  // Capture Hawaii litmus location at α = 0.0, 0.5, 1.0 across all 3 mediums.
  // Hawaii: 21°N, 157°W (-157)
  console.log("Starting Part 1: Visual Delta Audit");
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__ && window.__INDICATRIX_CAMERA__.lookAtCoordinates) {
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(-157, 21, 10);
    }
  });
  await wait(1000);

  const alphas = [0.0, 0.5, 1.0];
  const themes = [0, 1, 2];

  for (const theme of themes) {
    for (const alpha of alphas) {
      await page.evaluate(({t, a}) => {
        if (window.setTheme) window.setTheme(t);
        if (window.setAlpha) window.setAlpha(a);
      }, {t: theme, a: alpha});
      await wait(1500); // Wait for transition and render
      await page.screenshot({ path: `screenshots/test_theme${theme}_alpha${alpha}.png` });
      console.log(`Captured theme ${theme} alpha ${alpha}`);
    }
  }

  // Part 2: Adversarial Edge-Case Stress Testing
  console.log("Starting Part 2: Adversarial Edge-Case Stress Testing");

  // 1. Antimeridian Seams: Zoom to max at 180° longitude during continuous α morph.
  console.log("Stress Test 1: Antimeridian Seams");
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__ && window.__INDICATRIX_CAMERA__.lookAtCoordinates) {
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(180, 0, 3); // Max zoom
    }
  });
  for (let i = 0; i <= 10; i++) {
    await page.evaluate((val) => { if (window.setAlpha) window.setAlpha(val); }, i / 10);
    await wait(200);
  }

  // 2. Polar Singularity: Zoom to max at ±89.5° latitude; inspect pole damping.
  console.log("Stress Test 2: Polar Singularity");
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__ && window.__INDICATRIX_CAMERA__.lookAtCoordinates) {
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(0, 89.5, 3);
    }
  });
  await wait(1000);
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__ && window.__INDICATRIX_CAMERA__.lookAtCoordinates) {
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(0, -89.5, 3);
    }
  });
  await wait(1000);

  // 3. Theme Switching Under Motion: Rapidly cycle themes while unfurl α is animating.
  console.log("Stress Test 3: Theme Switching Under Motion");
  for (let i = 0; i <= 20; i++) {
    await page.evaluate(({a, t}) => {
      if (window.setAlpha) window.setAlpha(a);
      if (window.setTheme) window.setTheme(t);
    }, {a: (i % 10) / 10, t: i % 3});
    await wait(100);
  }

  // 4. CDLOD Buffer Stress: Pan camera rapidly across high-gradient mountain ranges at 5° elevation angle.
  console.log("Stress Test 4: CDLOD Buffer Stress");
  // Set oblique view if available
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__ && window.__INDICATRIX_CAMERA__.setObliqueView) {
      window.__INDICATRIX_CAMERA__.setObliqueView(86, 27, 5, 85, 0); // Himalayas
    } else if (window.__INDICATRIX_CAMERA__ && window.__INDICATRIX_CAMERA__.lookAtCoordinates) {
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(86, 27, 5);
    }
  });
  await wait(500);
  for (let lon = 86; lon < 96; lon += 0.5) {
    await page.evaluate((l) => {
      if (window.__INDICATRIX_CAMERA__ && window.__INDICATRIX_CAMERA__.lookAtCoordinates) {
        window.__INDICATRIX_CAMERA__.lookAtCoordinates(l, 27, 5);
      }
    }, lon);
    await wait(100);
  }

  await wait(1000);

  console.log("Tests complete.");
  fs.writeFileSync('stress_test_report.md', 
`# Adversarial Edge-Case Stress Testing Report

## Captured WebGPU Warnings & Errors
${errors.length > 0 ? errors.map(e => '- ' + e).join('\\n') : 'No warnings or errors captured.'}
`);

  await browser.close();
})();
