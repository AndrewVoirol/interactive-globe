import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

(async () => {
  console.log('--- Starting Screencast & 2D Optical Flow Motion Verification ---');
  const framesDir = path.resolve('.temp_screencast_frames');
  if (fs.existsSync(framesDir)) {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync('screenshots', { recursive: true });

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=default',
      '--use-gpu-in-tests',
      '--ignore-gpu-blocklist',
      '--enable-features=Vulkan,DefaultANGLEVulkan,Metal',
      '--use-angle=metal',
      '--window-size=1920,1080'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  await page.waitForFunction(() => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__, { timeout: 30000 });
  console.log('Engine & Camera loaded.');

  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(2000);

  // Position camera at Hawaii in Theme 0
  console.log('Positioning camera at Hawaii with Theme 0 (Marie Tharp)...');
  await page.evaluate(() => {
    window.__INDICATRIX_ENGINE__.setTheme(0);
    window.__INDICATRIX_ENGINE__.setAlpha(0.0);
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
  });
  await wait(2500);

  // Start continuous manifold morphing loop via play button
  console.log('Activating continuous unfurl loop...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const playBtn = buttons.find(b => b.title && b.title.includes('Continuous Unfurl Loop'));
    if (playBtn) playBtn.click();
  });

  // Allow motion to get underway
  await wait(500);

  console.log('Capturing sequential frames at 5 FPS across 2.5 seconds...');
  const numFrames = 13;
  const frameIntervalMs = 200; // 5 FPS

  for (let i = 0; i < numFrames; i++) {
    const framePath = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: framePath });
    await wait(frameIntervalMs);
  }

  // Pause playback
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const playBtn = buttons.find(b => b.title && b.title.includes('Continuous Unfurl Loop'));
    if (playBtn) playBtn.click();
  });

  await browser.close();
  console.log(`Captured ${numFrames} frames into ${framesDir}`);

  // Assemble video screencast
  try {
    console.log('Assembling video screencast from frames...');
    execSync(`ffmpeg -y -framerate 5 -i "${framesDir}/frame_%03d.png" -c:v libx264 -pix_fmt yuv420p screenshots/advection_screencast.mp4`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('ffmpeg video assembly notice:', e.message);
  }

  // Run Quantitative 2D Optical Flow Analyzer
  console.log('\nRunning scripts/analyze_screencast_motion.py...');
  const pythonCmd = `python3 scripts/analyze_screencast_motion.py --frames-dir "${framesDir}" --output-heatmap screenshots/motion_delta_heatmap.png --fps 5 --duration 2.5`;
  const output = execSync(pythonCmd, { encoding: 'utf-8' });
  console.log(output);

  console.log('Optical flow analysis completed successfully.');
})();
