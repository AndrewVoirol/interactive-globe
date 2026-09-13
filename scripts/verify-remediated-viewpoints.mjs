import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function captureAllViewpoints() {
  console.log("Launching Chromium with WebGPU...");
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      "--use-webgpu-adapter=default",
      "--window-size=1440,900",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !!window.__INDICATRIX_ENGINE__ && !!window.__INDICATRIX_CAMERA__,
    { timeout: 30000 }
  );
  await page.waitForTimeout(4000);

  const viewpoints = [
    {
      id: "remediated_viewpoint1_arctic",
      name: "Viewpoint 1: Arctic North Pole",
      theme: 1, // Cream Rag
      lon: 87.0,
      lat: 90.0,
      radius: 9.5,
    },
    {
      id: "remediated_viewpoint2_equatorial",
      name: "Viewpoint 2: Equatorial / South Atlantic & Indian Ocean",
      theme: 1, // Cream Rag
      lon: 87.0,
      lat: -50.0,
      radius: 9.5,
    },
    {
      id: "remediated_viewpoint3_marietharp_pacific",
      name: "Viewpoint 3: Marie Tharp Southwest Pacific (Kermadec / Tonga)",
      theme: 0, // Marie Tharp
      lon: 174.0,
      lat: -16.0,
      radius: 9.5,
    },
    {
      id: "remediated_viewpoint4_cyanotype_indianocean",
      name: "Viewpoint 4: Prussian Cyanotype Indian Ocean (Western Australia)",
      theme: 2, // Cyanotype
      lon: 118.0,
      lat: -17.0,
      radius: 9.5,
    },
  ];

  for (const vp of viewpoints) {
    console.log("Setting up " + vp.name + "...");
    await page.evaluate((themeId) => {
      window.__INDICATRIX_ENGINE__.setTheme(themeId);
    }, vp.theme);

    await page.evaluate(({ lon, lat, radius }) => {
      window.__INDICATRIX_CAMERA__.lookAtCoordinates(lon, lat, radius);
    }, { lon: vp.lon, lat: vp.lat, radius: vp.radius });

    await page.waitForTimeout(3000);

    const outPath = path.resolve("screenshots/" + vp.id + ".png");
    await page.screenshot({ path: outPath });
    console.log("✓ Captured " + outPath);
  }

  await browser.close();
  console.log("All 4 viewpoints captured successfully!");
}

captureAllViewpoints().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
