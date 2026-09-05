import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
    headless: true,
    args: [
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--enable-features=Vulkan,DefaultANGLEVulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis',
      '--use-gpu-in-tests'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => window.__INDICATRIX_ENGINE__ && window.__INDICATRIX_ENGINE__.getState().backend === 'webgpu');
  await page.waitForTimeout(3000);

  // Measure FPS over 100 rAF frames
  const fpsMeasurement = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let frames = 0;
      const t0 = performance.now();
      function tick() {
        frames++;
        if (frames >= 120) {
          const t1 = performance.now();
          const duration = (t1 - t0) / 1000;
          const avgFps = Math.round(frames / duration);
          resolve({ avgFps, duration: duration.toFixed(2), frames });
        } else {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
    });
  });

  const engineMetrics = await page.evaluate(() => {
    const engine = window.__WEBGPU_ENGINE__;
    const hudFps = parseInt(document.querySelector('.tabular-nums span')?.innerText || '0', 10);
    const mem = (performance).memory ? {
      usedJSHeapSizeMB: ((performance).memory.usedJSHeapSize / 1048576).toFixed(2),
      totalJSHeapSizeMB: ((performance).memory.totalJSHeapSize / 1048576).toFixed(2),
      jsHeapSizeLimitMB: ((performance).memory.jsHeapSizeLimit / 1048576).toFixed(2),
    } : null;

    const kernelReports = (engine?.profiler?.getKernelReports?.() || []).map(r => ({
      ...r,
      gpuTimeNs: r.gpuTimeNs?.toString()
    }));
    const latestReport = engine?.profiler?.getLatestReport?.() || null;

    return {
      hudFps,
      pointCount: engine?.pointCount,
      lineIndexCount: engine?.lineIndexCount,
      contourVertexCount: engine?.contourVertexCount,
      contourIndexCount: engine?.contourIndexCount,
      hasDEM: !!engine?.demTexture,
      kernelReports,
      latestReport,
      mem,
      adapterInfo: engine?.adapter ? {
        vendor: engine.adapter.info?.vendor,
        architecture: engine.adapter.info?.architecture,
        limits: {
          maxBufferSizeMB: (engine.adapter.limits.maxBufferSize / 1048576).toFixed(0),
          maxStorageBufferBindingSizeMB: (engine.adapter.limits.maxStorageBufferBindingSize / 1048576).toFixed(0),
          maxComputeWorkgroupStorageSize: engine.adapter.limits.maxComputeWorkgroupStorageSize,
          maxComputeInvocationsPerWorkgroup: engine.adapter.limits.maxComputeInvocationsPerWorkgroup,
        }
      } : null
    };
  });

  console.log('Measurement Results:', JSON.stringify({ fpsMeasurement, engineMetrics }, null, 2));

  await browser.close();
}

run().catch(console.error);
