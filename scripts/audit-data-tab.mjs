import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('screenshots/audit-data');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortOpen(port) {
  try {
    const res = await fetch(`http://localhost:${port}`);
    return res.ok || res.status === 200 || res.status === 304;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  console.log('====================================================');
  console.log('INDICATRIX ENGINE: DATA TAB INTERACTION & LAYER AUDIT');
  console.log('====================================================');

  let devProcess = null;
  const port = 3000;
  const alreadyRunning = await isPortOpen(port);

  if (!alreadyRunning) {
    console.log(`Starting Vite dev server on port ${port}...`);
    devProcess = spawn('npx', ['vite', '--port', String(port), '--host', '0.0.0.0'], {
      stdio: 'pipe',
      detached: false,
    });

    devProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('ready in') || msg.includes('localhost:')) {
        console.log(`[Vite]: ${msg.trim()}`);
      }
    });

    devProcess.stderr.on('data', (d) => {
      console.error(`[Vite ERR]: ${d.toString().trim()}`);
    });

    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (await isPortOpen(port)) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      throw new Error(`Vite server failed to start on port ${port}`);
    }
    console.log('Vite server is ready!');
  } else {
    console.log(`Vite server is already running on port ${port}`);
  }

  console.log('Launching browser with WebGPU enabled...');
  const browser = await chromium.launch({
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

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const consoleLogs = [];
  const errors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      errors.push(text);
      console.error(`[BROWSER ERROR]: ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(err.toString());
    console.error(`[PAGE ERROR]: ${err}`);
  });

  console.log(`Navigating to http://localhost:${port}...`);
  await page.goto(`http://localhost:${port}`);

  console.log('Waiting for Indicatrix engine initialization...');
  await page.waitForFunction(() => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__, { timeout: 30000 });
  await sleep(3000);

  // Position camera at an interesting global viewpoint (Pacific / Hawaii / North America)
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-140.0, 25.0, 7.5, [0, 0, 0]);
    window.__INDICATRIX_ENGINE__.setTheme(0); // Marie Tharp
    window.__INDICATRIX_ENGINE__.setMode(0);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
  });
  await sleep(2000);

  console.log('\n--- SECTION 1: SWITCH TO DATA TAB ---');
  const dataTabBtn = page.locator('#sidebar-tab-data');
  await dataTabBtn.click();
  await sleep(500);

  const isDataPanelVisible = await page.evaluate(() => {
    const el = document.getElementById('sidebar-panel-data');
    return el && !el.classList.contains('hidden');
  });
  console.log(`DATA tab active: ${isDataPanelVisible}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-data-tab-initial.png') });

  console.log('\n--- SECTION 2: TIMELINE SCRUBBER ---');
  console.log('Scrubbing to -30m (Radar Nowcast Zone)...');
  await page.evaluate(() => {
    if (window.__INDICATRIX_SET_TIMELINE_MINUTES__) {
      window.__INDICATRIX_SET_TIMELINE_MINUTES__(-30);
    }
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-timeline-radar-zone.png') });

  console.log('Scrubbing to +12h (WeatherNext Forecast Zone)...');
  await page.evaluate(() => {
    if (window.__INDICATRIX_SET_TIMELINE_MINUTES__) {
      window.__INDICATRIX_SET_TIMELINE_MINUTES__(720);
    }
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-timeline-forecast-12h.png') });

  // Reset timeline back to 0
  await page.evaluate(() => {
    if (window.__INDICATRIX_SET_TIMELINE_MINUTES__) {
      window.__INDICATRIX_SET_TIMELINE_MINUTES__(0);
    }
  });
  await sleep(500);

  console.log('\n--- SECTION 3: ATMOSPHERIC CLOUD STRATA & INSTRUMENTS ---');
  // 1. Master Cloud toggle OFF
  console.log('Toggling Master Clouds OFF...');
  const cloudMasterToggle = page.locator('div[role="switch"]:has-text("Atmospheric Cloud Strata")').first();
  if (await cloudMasterToggle.count() > 0) {
    await cloudMasterToggle.click();
  } else {
    await page.evaluate(() => window.__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: false }));
  }
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-clouds-master-off.png') });

  // 2. Master Cloud toggle ON
  console.log('Toggling Master Clouds ON...');
  if (await cloudMasterToggle.count() > 0) {
    await cloudMasterToggle.click();
  } else {
    await page.evaluate(() => window.__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: true }));
  }
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-clouds-master-on.png') });

  // Scroll down to reveal more atmospheric controls
  await page.evaluate(() => {
    const scrollable = document.querySelector('#sidebar-drawer .overflow-y-auto');
    if (scrollable) scrollable.scrollTop = 300;
  });
  await sleep(500);

  // 3. Horizon Cross-Section Preset (78° Oblique)
  console.log('Triggering 1-Click Horizon Cross-Section (78°)...');
  const horizonBtn = page.locator('button:has-text("Horizon Cross-Section (78°)")');
  if (await horizonBtn.count() > 0) {
    await horizonBtn.scrollIntoViewIfNeeded();
    await horizonBtn.click();
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-horizon-cross-section-78deg.png') });
  }

  // Restore camera to global view
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-140.0, 25.0, 7.5, [0, 0, 0]);
  });
  await sleep(1500);

  // 4. Test Weather Optical Mode (Archival Ink Wash vs Doppler Radar)
  console.log('Testing Weather Optical Mode...');
  await page.evaluate(() => {
    if (window.__INDICATRIX_SET_WEATHER_OPTICAL_MODE__) {
      window.__INDICATRIX_SET_WEATHER_OPTICAL_MODE__(1); // Doppler
    }
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-weather-optical-mode-doppler.png') });

  await page.evaluate(() => {
    if (window.__INDICATRIX_SET_WEATHER_OPTICAL_MODE__) {
      window.__INDICATRIX_SET_WEATHER_OPTICAL_MODE__(0); // Ink Wash
    }
  });
  await sleep(1000);

  console.log('\n--- SECTION 4: GLOBAL GEODESIC FEEDS ---');
  // Scroll to Global Geodesic Feeds
  await page.evaluate(() => {
    const scrollable = document.querySelector('#sidebar-drawer .overflow-y-auto');
    if (scrollable) scrollable.scrollTop = 700;
  });
  await sleep(500);

  // 1. Antipodes
  console.log('Activating Antipodes Geodesic Connectors...');
  const antipodesBtn = page.locator('button:has-text("Antipodes")');
  await antipodesBtn.scrollIntoViewIfNeeded();
  await antipodesBtn.click();
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-geodesic-antipodes.png') });

  // 2. Conveyor
  console.log('Activating Global Oceanic Conveyor Belt...');
  const conveyorBtn = page.locator('button:has-text("Conveyor")');
  await conveyorBtn.scrollIntoViewIfNeeded();
  await conveyorBtn.click();
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-geodesic-conveyor.png') });

  // 3. Migration
  console.log('Activating Great Circle Migration...');
  const migrationBtn = page.locator('button:has-text("Migration")');
  await migrationBtn.scrollIntoViewIfNeeded();
  await migrationBtn.click();
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-geodesic-migration.png') });

  // 4. Off
  console.log('Turning Geodesic Feeds OFF...');
  const offBtn = page.locator('button:has-text("Off")').first();
  await offBtn.scrollIntoViewIfNeeded();
  await offBtn.click();
  await sleep(500);

  console.log('\n--- SECTION 5: GEODETIC SURVEY FEEDS ---');
  // 1. Soundings
  console.log('Testing Soundings Toggle...');
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(142.2, 11.3, 6.0, [0, 0, 0]); // Mariana Trench
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-survey-soundings-active.png') });

  // 2. Triangulation
  console.log('Toggling Triangulation ON...');
  const triangToggle = page.locator('div[role="switch"]:has-text("Triangulation")').first();
  if (await triangToggle.count() > 0) {
    await triangToggle.scrollIntoViewIfNeeded();
    await triangToggle.click();
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12-survey-triangulation-on.png') });
  }

  // 3. Landmarks
  console.log('Testing Landmarks...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13-survey-landmarks.png') });

  console.log('\n--- SECTION 6: ACTIVE DATA LAYERS STACK ---');
  // Scroll to top of sidebar where Active Layers section is now elevated
  await page.evaluate(() => {
    const scrollable = document.querySelector('#sidebar-drawer .overflow-y-auto');
    if (scrollable) scrollable.scrollTop = 0;
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14-layers-stack-default.png') });

  // Test expanding default layer parameters
  console.log('Expanding default layer parameters...');
  const expandBtn = page.locator('button[title="Expand parameters"]').first();
  if (await expandBtn.count() > 0) {
    await expandBtn.scrollIntoViewIfNeeded();
    await expandBtn.click();
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15-layer-expanded-controls.png') });
  }

  // Test layer opacity slider
  console.log('Testing layer opacity slider (set to 20%)...');
  const opacityInput = page.locator('input[id^="sidebar-opacity-"]').first();
  if (await opacityInput.count() > 0) {
    await opacityInput.scrollIntoViewIfNeeded();
    await opacityInput.evaluate((el, val) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '0.2');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16-layer-opacity-20pct.png') });

    // Restore to 0.95
    await opacityInput.evaluate((el, val) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '0.95');
    await sleep(500);
  }

  // Test Layer Visibility Toggle (Hide / Show)
  console.log('Testing Layer Visibility Toggle (Hide)...');
  const hideBtn = page.locator('button[title="Hide layer"]').first();
  if (await hideBtn.count() > 0) {
    await hideBtn.scrollIntoViewIfNeeded();
    await hideBtn.click();
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17-layer-hidden.png') });

    console.log('Restoring Layer Visibility (Show)...');
    const showBtn = page.locator('button[title="Show layer"]').first();
    await showBtn.scrollIntoViewIfNeeded();
    await showBtn.click();
    await sleep(1000);
  }

  console.log('\n--- SECTION 7: SLIDE-OUT CATALOG SHEET ---');
  console.log('Opening Catalog Sheet (+ Catalog)...');
  const catalogBtn = page.locator('button:has-text("+ Catalog")');
  await catalogBtn.scrollIntoViewIfNeeded();
  await catalogBtn.click();
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '18-catalog-sheet-open.png') });

  // Test Catalog Filters
  console.log('Testing Catalog Category Filters...');
  await page.locator('button:has-text("[TOPO]")').click();
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '19-catalog-filter-topo.png') });

  await page.locator('button:has-text("[VECTORS]")').click();
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '20-catalog-filter-vectors.png') });

  await page.locator('button:has-text("[SATELLITE]")').click();
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '21-catalog-filter-satellite.png') });

  await page.locator('button:has-text("[ALL]")').click();
  await sleep(500);

  // Add multiple datasets and test their impact
  const addPreset = async (name) => {
    console.log(`Adding preset: ${name}...`);
    const card = page.locator('div.p-3').filter({ has: page.locator('span', { hasText: name }) }).first();
    const btn = card.locator('button:has-text("+ Add Layer to Stack")');
    if (await btn.count() > 0) {
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await sleep(800);
    }
  };

  await addPreset("Hydrosphere & Bathymetric Depth");
  await addPreset("USGS Hypsometric Vector Contours");
  await addPreset("Real NOAA GFS Surface Winds");
  await addPreset("CelesTrak Active Starlink & ISS Orbits");

  // Close Catalog Sheet
  console.log('Closing Catalog Sheet...');
  const closeCatalogBtn = page.locator('button[title="Close Catalog Sheet (Esc)"]');
  await closeCatalogBtn.click();
  await sleep(1000);

  // Capture Globe with Multiple Layers Active
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '22-multi-layers-active-globe.png') });

  // Scroll to top to see updated layers stack
  await page.evaluate(() => {
    const scrollable = document.querySelector('#sidebar-drawer .overflow-y-auto');
    if (scrollable) scrollable.scrollTop = 0;
  });
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '23-layers-stack-multi-items.png') });

  // Test Layer Reordering
  console.log('Testing Layer Reorder (Move Up)...');
  const moveUpButtons = page.locator('button[title="Move Layer Up"]:not([disabled])');
  if (await moveUpButtons.count() > 0) {
    await moveUpButtons.first().scrollIntoViewIfNeeded();
    await moveUpButtons.first().click();
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '24-layers-stack-reordered.png') });
  }

  console.log('\n--- SECTION 8: REMOVE LAYERS & EMPTY STATE ---');
  while (true) {
    const removeBtn = page.locator('button[title="Remove layer"]').first();
    if (await removeBtn.count() > 0) {
      await removeBtn.scrollIntoViewIfNeeded();
      await removeBtn.click();
      await sleep(300);
    } else {
      break;
    }
  }
  await sleep(1000);
  console.log('All layers removed. Checking empty state...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '25-layers-stack-empty-state.png') });

  console.log('\n--- SECTION 9: THEME ADAPTATION OF DATA TAB ---');
  // Re-add default layer from catalog so globe has texture
  const catBtn2 = page.locator('button:has-text("+ Catalog")');
  await catBtn2.scrollIntoViewIfNeeded();
  await catBtn2.click();
  await sleep(500);
  await addPreset("Architectural Topographic Relief");
  await page.locator('button[title="Close Catalog Sheet (Esc)"]').click();
  await sleep(500);

  // Test Theme 1 (Cream Rag)
  console.log('Switching to Theme 1 (Cream Rag)...');
  await page.evaluate(() => window.__INDICATRIX_ENGINE__.setTheme(1));
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '26-data-tab-theme1-cream-rag.png') });

  // Test Theme 2 (Prussian Cyanotype)
  console.log('Switching to Theme 2 (Prussian Cyanotype)...');
  await page.evaluate(() => window.__INDICATRIX_ENGINE__.setTheme(2));
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '27-data-tab-theme2-prussian.png') });

  console.log('\nAudit complete! Total errors:', errors.length);
  if (errors.length > 0) {
    console.log('Error details:', errors);
  }

  await browser.close();
  if (devProcess) {
    devProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
