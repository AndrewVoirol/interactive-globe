import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const phase = process.argv[2] || 'before'; // 'before' or 'after'
const OUT_DIR = path.resolve(`screenshots/${phase}`);

const LITMUS_LOCATIONS = [
  {
    id: 'theme0-hawaii',
    name: 'Hawaii Big Island (Theme 0: Marie Tharp)',
    theme: 0,
    lon: -155.55,
    lat: 19.65,
    radius: 6.1,
  },
  {
    id: 'theme0-mariana',
    name: 'Mariana Trench (Theme 0: Marie Tharp)',
    theme: 0,
    lon: 142.2,
    lat: 11.35,
    radius: 6.0,
  },
  {
    id: 'theme1-swiss-alps',
    name: 'Swiss Alps (Theme 1: Cream Rag)',
    theme: 1,
    lon: 10.0,
    lat: 46.0,
    radius: 5.8,
  },
  {
    id: 'theme1-mount-rainier',
    name: 'Mount Rainier (Theme 1: Cream Rag)',
    theme: 1,
    lon: -121.76,
    lat: 46.85,
    radius: 5.8,
  },
  {
    id: 'theme2-cape-cod',
    name: 'Cape Cod (Theme 2: Prussian Cyanotype)',
    theme: 2,
    lon: -70.0,
    lat: 42.0,
    radius: 6.2,
  },
  {
    id: 'theme2-gibraltar',
    name: 'Strait of Gibraltar (Theme 2: Prussian Cyanotype)',
    theme: 2,
    lon: -5.35,
    lat: 36.14,
    radius: 6.0,
  },
];

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Starting litmus capture for phase: [${phase}]...`);
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
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  page.on('console', msg => {
    console.log(`[PAGE ${msg.type().toUpperCase()}]:`, msg.text());
  });
  page.on('pageerror', err => {
    console.log(`[PAGE UNCAUGHT]:`, err);
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => !!window.__INDICATRIX_CAMERA__ && !!window.__INDICATRIX_ENGINE__, { timeout: 20000 });
  await page.waitForTimeout(2500);

  for (const loc of LITMUS_LOCATIONS) {
    console.log(`Capturing ${loc.name}...`);
    await page.evaluate(({ theme, lon, lat, radius }) => {
      window.__INDICATRIX_ENGINE__.setTheme(theme);
      window.__INDICATRIX_ENGINE__.setMode(0);
      window.__INDICATRIX_ENGINE__.setAlpha(0.0);
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(lon, lat, radius, [0, 0, 0]);
    }, loc);

    // Wait 2.5 seconds for render stabilization and DEM sampling
    await page.waitForTimeout(2500);

    const outPath = path.join(OUT_DIR, `${loc.id}.png`);
    await page.screenshot({ path: outPath });
    const stats = fs.statSync(outPath);
    console.log(`  -> Saved ${outPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  await browser.close();
  console.log(`[COMPLETE] All litmus captures for phase [${phase}] finished!`);
}

run().catch(err => {
  console.error('Litmus capture failed:', err);
  process.exit(1);
});
