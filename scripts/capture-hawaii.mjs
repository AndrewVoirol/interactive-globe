import { chromium } from 'playwright';

async function captureHawaii() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=default', '--window-size=1920,1080'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__, { timeout: 20000 });
  await page.waitForTimeout(3000);

  // Look at Hawaii
  await page.evaluate(() => {
    window.__INDICATRIX_CAMERA__.lookAtCoordinates(-155.55, 19.65, 6.1);
  });
  await page.waitForTimeout(2000);

  const themes = [
    { id: 1, name: 'cream_rag' },
    { id: 2, name: 'cyanotype' },
    { id: 0, name: 'marie_tharp' },
  ];

  for (const th of themes) {
    console.log(`Setting Hawaii theme to ${th.name} (${th.id})...`);
    await page.evaluate((id) => window.__INDICATRIX_ENGINE__.setTheme(id), th.id);
    await page.waitForTimeout(2000);
    const p = `screenshots/theme-verify/pacific_hawaii-${th.name}.png`;
    await page.screenshot({ path: p });
    console.log(`✓ Saved ${p}`);
  }

  await browser.close();
}

captureHawaii().catch(console.error);
