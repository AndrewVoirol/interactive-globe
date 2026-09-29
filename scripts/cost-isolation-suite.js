/**
 * Automated Cost Isolation Suite for Indicatrix Engine
 * Measures exact GPU and CPU frame times across isolated subsystems:
 * 1. Baseline (Crust/Hydrosphere + Theme 0)
 * 2. Theme 1 (Cream Rag substrate haptics) vs Theme 0
 * 3. Volumetric Raymarcher vs Raster Clouds
 * 4. 2D Canvas Landmarks (ON vs OFF)
 * 5. Particle Resolution (100k vs 1M vs 4M)
 */

export async function runCostIsolationSuite(options = {}) {
  const warmupCount = options.warmupCount || 15;
  const sampleCount = options.sampleCount || 60;

  const engine = window.__INDICATRIX_WEBGPU_ENGINE__;
  if (!engine || !engine.device) {
    throw new Error('WebGPU Engine not ready');
  }

  const camera = window.__INDICATRIX_CAMERA_OBJECT__ || engine.camera;
  const overlayCanvas = document.querySelector('canvas:nth-of-type(2)') || document.querySelectorAll('canvas')[1];

  // Pause background renderLoop to prevent interference
  window.__INDICATRIX_PAUSE_RENDER_LOOP__ = true;
  await new Promise((r) => setTimeout(r, 100));

  const results = {};

  const executeState = async (name, config) => {
    // Apply configuration
    if (config.meshTier) {
      const tiers = {
        '100k': { lat: 256, lon: 512 },
        '1M': { lat: 512, lon: 1024 },
        '4M': { lat: 1024, lon: 2048 },
      };
      const t = tiers[config.meshTier] || tiers['1M'];
      engine.rebuildSphereMesh(t.lat, t.lon);
    }

    const baseParams = {
      unfurl: 0.0,
      mode: 0,
      theme: config.theme !== undefined ? config.theme : 0,
      time: 1.0,
      dt: 0.01667,
      camera: camera,
      cursorRayOrig: { x: 0, y: 0, z: 0 },
      cursorRayDir: { x: 0, y: 0, z: -1 },
      cursorHitPos: { x: 0, y: 0, z: 0 },
      cursorVel: { x: 0, y: 0, z: 0 },
      showRelief: true,
      reliefActive: true,
      showVectors: false,
      showWind: false,
      showContours: false,
      showSatellites: false,
      showClouds: config.showClouds ?? false,
      volumetricClouds: config.volumetricClouds ?? false,
      showCloudLow: config.showCloudLow ?? false,
      showCloudMid: config.showCloudMid ?? false,
      showCloudHigh: config.showCloudHigh ?? false,
      substrateHaptics: config.substrateHaptics ?? false,
      paperSubstrate: config.paperSubstrate ?? false,
    };

    if (config.substrateHaptics !== undefined) {
      engine.paperSubstrateEnabled = config.substrateHaptics;
    }

    // Warmup
    for (let i = 0; i < warmupCount; i++) {
      engine.render({ ...baseParams, time: i * 0.01667 });
      await engine.device.queue.onSubmittedWorkDone();
    }

    // Measure
    const cpuSamples = [];
    const gpuSamples = [];
    const overlaySamples = [];

    for (let i = 0; i < sampleCount; i++) {
      const curTime = (warmupCount + i) * 0.01667;

      const t0 = performance.now();
      engine.render({ ...baseParams, time: curTime });
      const tEngineEnd = performance.now();
      const cpuTime = tEngineEnd - t0;

      // If testing 2D Canvas Landmarks
      let overlayTime = 0;
      if (config.showLandmarks && overlayCanvas) {
        const tOverlayStart = performance.now();
        const ctx = overlayCanvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.font = '10px monospace';
          // Simulate the 2D canvas landmark loop from WebGPUCanvas.tsx
          for (let lm = 0; lm < 50; lm++) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
            ctx.beginPath();
            ctx.roundRect(100 + (lm % 10) * 80, 100 + Math.floor(lm / 10) * 40, 70, 16, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#E2E8F0';
            ctx.fillText(`Landmark-${lm}`, 105 + (lm % 10) * 80, 112 + Math.floor(lm / 10) * 40);
          }
          ctx.restore();
        }
        overlayTime = performance.now() - tOverlayStart;
      }

      await engine.device.queue.onSubmittedWorkDone();
      const totalTime = performance.now() - t0;
      const gpuTime = Math.max(0, totalTime - cpuTime);

      cpuSamples.push(cpuTime + overlayTime);
      gpuSamples.push(gpuTime);
      overlaySamples.push(overlayTime);
    }

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const cpuAvg = avg(cpuSamples);
    const gpuAvg = avg(gpuSamples);
    const overlayAvg = avg(overlaySamples);
    const totalAvg = cpuAvg + gpuAvg;

    results[name] = {
      cpuMs: parseFloat(cpuAvg.toFixed(3)),
      gpuMs: parseFloat(gpuAvg.toFixed(3)),
      overlayMs: parseFloat(overlayAvg.toFixed(3)),
      totalMs: parseFloat(totalAvg.toFixed(3)),
      fps: parseFloat((1000 / Math.max(0.001, totalAvg)).toFixed(1)),
    };
  };

  try {
    // 1. Baseline: Crust/Hydrosphere + Theme 0 (1M mesh)
    await executeState('Baseline (Crust + Theme 0)', {
      theme: 0,
      substrateHaptics: false,
      showClouds: false,
      meshTier: '1M',
    });

    // 2. Theme 1: Cream Rag (with Substrate Haptics)
    await executeState('Theme 1 (Cream Rag + Substrate Haptics)', {
      theme: 1,
      substrateHaptics: true,
      paperSubstrate: true,
      showClouds: false,
      meshTier: '1M',
    });

    // 3. Raster Clouds (Low + Mid + High)
    await executeState('Raster Clouds (Low + Mid + High)', {
      theme: 0,
      substrateHaptics: false,
      showClouds: true,
      volumetricClouds: false,
      showCloudLow: true,
      showCloudMid: true,
      showCloudHigh: true,
      meshTier: '1M',
    });

    // 4. Volumetric Raymarcher
    await executeState('Volumetric Cloud Raymarcher', {
      theme: 0,
      substrateHaptics: false,
      showClouds: true,
      volumetricClouds: true,
      meshTier: '1M',
    });

    // 5. 2D Canvas Landmarks OFF
    await executeState('2D Canvas Landmarks OFF', {
      theme: 0,
      substrateHaptics: false,
      showClouds: false,
      showLandmarks: false,
      meshTier: '1M',
    });

    // 6. 2D Canvas Landmarks ON
    await executeState('2D Canvas Landmarks ON', {
      theme: 0,
      substrateHaptics: false,
      showClouds: false,
      showLandmarks: true,
      meshTier: '1M',
    });

    // 7. Particle Resolution: 100k
    await executeState('Particle Resolution 100k', {
      theme: 0,
      substrateHaptics: false,
      showClouds: false,
      meshTier: '100k',
    });

    // 8. Particle Resolution: 1M
    await executeState('Particle Resolution 1M', {
      theme: 0,
      substrateHaptics: false,
      showClouds: false,
      meshTier: '1M',
    });

    // 9. Particle Resolution: 4M
    await executeState('Particle Resolution 4M', {
      theme: 0,
      substrateHaptics: false,
      showClouds: false,
      meshTier: '4M',
    });
  } finally {
    // Restore default baseline mesh & resume background render loop
    engine.rebuildSphereMesh(512, 1024);
    engine.paperSubstrateEnabled = false;
    window.__INDICATRIX_PAUSE_RENDER_LOOP__ = false;
  }

  return results;
}
