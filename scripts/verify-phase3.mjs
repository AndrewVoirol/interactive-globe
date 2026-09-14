import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const screenshotsDir = path.resolve('screenshots/phase3');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=default',
      '--enable-features=Vulkan,UseSkiaRenderer',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const errors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(err.toString());
  });

  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}`;
  console.log(`Navigating to ${url} ...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // Hook GPU device to detect any pipeline recompilations during theme switching
  const pipelineTracking = await page.evaluate(() => {
    const engine = window.__INDICATRIX_WEBGPU_ENGINE__;
    if (engine && engine.device) {
      window.__pipelineCreationCount = 0;
      const originalCreateRenderPipeline = engine.device.createRenderPipeline.bind(engine.device);
      engine.device.createRenderPipeline = function(...args) {
        window.__pipelineCreationCount++;
        return originalCreateRenderPipeline(...args);
      };
      return true;
    }
    return false;
  });
  console.log('Pipeline tracking installed:', pipelineTracking);

  // 3a. Rapid Theme Switching Test
  console.log('Executing 3a: Rapid Theme Switching (10 cycles across all 3 mediums)...');
  for (let cycle = 0; cycle < 10; cycle++) {
    for (const t of [0, 1, 2]) {
      await page.evaluate((themeIdx) => {
        if (window.__INDICATRIX_ENGINE__?.setTheme) {
          window.__INDICATRIX_ENGINE__.setTheme(themeIdx);
        } else if (window.setTheme) {
          window.setTheme(themeIdx);
        }
      }, t);
      await page.waitForTimeout(30);
    }
  }

  const pipelineCountAfterSwitch = await page.evaluate(() => window.__pipelineCreationCount || 0);
  console.log(`Pipelines created during rapid theme switching: ${pipelineCountAfterSwitch} (Must be 0)`);

  // 3b. Vector Linework Sharpness at dense coastlines (Norway Fjords & Indonesian archipelago)
  console.log('Executing 3b: Testing Vector Linework Sharpness (Norway & Indonesia)...');
  
  // Norway Fjords close-up (lon: 7.0, lat: 61.5, altitude: 1.08, pitch: 30)
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__?.setObliqueView) {
      window.__INDICATRIX_CAMERA__.setObliqueView(7.0, 61.5, 1.08, 30, 0);
    }
    window.__INDICATRIX_ENGINE__?.setTheme(1); // Cream Rag for archival ink verification
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'norway-fjords-cream-rag.png') });
  console.log('Captured Norway fjords (Cream Rag)');

  // Indonesian Archipelago in Cyanotype (lon: 120.0, lat: -2.5, altitude: 1.12, pitch: 20)
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__?.setObliqueView) {
      window.__INDICATRIX_CAMERA__.setObliqueView(120.0, -2.5, 1.12, 20, 0);
    }
    window.__INDICATRIX_ENGINE__?.setTheme(2); // Cyanotype
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'indonesia-cyanotype.png') });
  console.log('Captured Indonesian Archipelago (Cyanotype)');

  // 3c. Relief Shading Across Mediums in High-Relief Terrain (Himalayas & Andes)
  console.log('Executing 3c: Relief Shading in High-Relief Terrain (Himalayas & Andes)...');
  
  // Himalayas in Tharp (lon: 86.9, lat: 27.9, altitude: 1.15, pitch: 40)
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__?.setObliqueView) {
      window.__INDICATRIX_CAMERA__.setObliqueView(86.9, 27.9, 1.15, 40, 315);
    }
    window.__INDICATRIX_ENGINE__?.setTheme(0); // Tharp
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'himalayas-tharp.png') });
  console.log('Captured Himalayas (Marie Tharp)');

  // Himalayas in Cream Rag (Swiss Relief lighting litmus)
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__?.setTheme(1);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'himalayas-cream-swiss-relief.png') });
  console.log('Captured Himalayas Swiss Relief (Cream Rag)');

  // Andes in Cyanotype (lon: -70.0, lat: -32.5, altitude: 1.15, pitch: 35)
  await page.evaluate(() => {
    if (window.__INDICATRIX_CAMERA__?.setObliqueView) {
      window.__INDICATRIX_CAMERA__.setObliqueView(-70.0, -32.5, 1.15, 35, 315);
    }
    window.__INDICATRIX_ENGINE__?.setTheme(2);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, 'andes-cyanotype.png') });
  console.log('Captured Andes (Cyanotype)');

  console.log('\n--- Phase 3 Console Messages Summary ---');
  console.log(`Total messages: ${consoleLogs.length}`);
  console.log(`Errors encountered: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Error details:\n', errors.join('\n'));
  }

  await browser.close();
}

run().catch((err) => {
  console.error('Phase 3 verification failed:', err);
  process.exit(1);
});
