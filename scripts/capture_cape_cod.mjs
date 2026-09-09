// ============================================================================
// File: scripts/capture_cape_cod.mjs
// Purpose: Re-capture Cape Cod screencasts with confirmed sequence loading
// ============================================================================

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.resolve('screenshots');
const TEMP_VIDEO_DIR = path.resolve('.temp_screencasts');

const THEMES = [
  { index: 0, id: 'tharp', name: 'Marie Tharp (1977)' },
  { index: 1, id: 'cream-rag', name: 'Cream Rag Paper (1842)' },
  { index: 2, id: 'cyanotype', name: 'Prussian Cyanotype (1842)' },
];

async function launchBrowser() {
  return await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--use-gl=angle',
      '--use-angle=metal',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
}

(async () => {
  for (const theme of THEMES) {
    const videoName = `${theme.id}-cape-cod-demo`;
    const finalMp4Path = path.join(SCREENSHOTS_DIR, `${videoName}.mp4`);
    console.log(`\n--- Recording Cape Cod: [${theme.name}] -> ${videoName}.mp4 ---`);

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

    await page.waitForFunction(() => !!window.__INDICATRIX_TRAJECTORY__ && !!window.__INDICATRIX_ENGINE__);

    // Set theme and mode
    await page.evaluate((themeIdx) => {
      window.__INDICATRIX_ENGINE__.setTheme(themeIdx);
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    }, theme.index);

    await page.waitForTimeout(1500);

    // Launch Cape Cod trajectory sequence (8.0 seconds)
    console.log('  -> Triggering startDemo("cape-cod", 8.0)...');
    await page.evaluate(() => {
      window.__INDICATRIX_TRAJECTORY__.startDemo('cape-cod', 8.0);
    });

    // Wait 8.5 seconds for trajectory to complete
    await page.waitForTimeout(8500);

    await page.close();
    await context.close();
    await browser.close();

    // Convert raw webm to mp4
    const recordedFiles = fs.readdirSync(subTempDir).filter((f) => f.endsWith('.webm'));
    if (recordedFiles.length === 0) {
      throw new Error(`No webm file found in ${subTempDir}`);
    }
    const rawWebmPath = path.join(subTempDir, recordedFiles[0]);

    execSync(
      `/Users/andrewvoirol/.local/bin/ffmpeg -y -i "${rawWebmPath}" -t 10 -c:v libx264 -crf 23 -pix_fmt yuv420p "${finalMp4Path}"`,
      { stdio: 'inherit' }
    );

    const mp4Stats = fs.statSync(finalMp4Path);
    console.log(`  [OK] Produced ${videoName}.mp4: ${(mp4Stats.size / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log('\n[SUCCESS] Cape Cod screencasts re-recorded successfully!');
  process.exit(0);
})();
