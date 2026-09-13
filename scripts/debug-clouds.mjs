import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--use-gl=angle',
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
    ],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof window.__INDICATRIX_CAMERA__ !== 'undefined',
    { timeout: 30000 }
  );
  await page.waitForTimeout(3000);

  console.log('Loading WeatherNext cloud layers and snapping Haleakala...');
  await page.evaluate(async () => {
    const engine = window.__INDICATRIX_WEBGPU_ENGINE__;
    await engine.loadAllCloudLayers(true);
    window.__INDICATRIX_CAMERA__.snapHaleakalaSunset({
      theme: 0,
      sunAltitude: 7.5,
      sunAzimuth: 270.0,
    });
  });

  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'screenshots/test_haleakala_wn.png' });
  console.log('Saved screenshots/test_haleakala_wn.png');
  await browser.close();
}

test().catch(console.error);
