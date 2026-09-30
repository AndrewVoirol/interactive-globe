/**
 * Comprehensive Performance Profiling Suite for Indicatrix Engine
 * Exhaustively benchmarks:
 * - 1. Cartographic Mediums (Theme 0, Theme 1 + Substrate, Theme 1 clean, Theme 2)
 * - 2. Manifolds & Morph States (Mode 0, Mode 1, Mode 2, Mode 3 at alpha = 0.0, 0.5, 1.0)
 * - 3. Atmospheric & Weather Strata (Raster Low/Mid/High, Volumetric Raymarcher, Atmo Scatter)
 * - 4. Vector Linework & 2D Overlays (Ribbons, Contours, 2D Landmarks Cached vs Uncached)
 * - 5. Mesh & Particle Resolution Tiers (100k, 1M, 4M with VRAM ledger tracking)
 * - 6. Camera Orbit & Interaction Stress
 */

export async function runComprehensiveProfilingSuite(options = {}) {
  const warmupCount = options.warmupCount || 15;
  const sampleCount = options.sampleCount || 60;
  const suiteFilter = options.suites || ['themes', 'manifolds', 'weather', 'vectors', 'resolution', 'interaction'];

  const engine = window.__INDICATRIX_WEBGPU_ENGINE__ || window.__ENGINE;
  if (!engine || !engine.device) {
    throw new Error('WebGPU Engine not initialized');
  }

  const camera = window.__INDICATRIX_CAMERA_OBJECT__ || engine.camera;
  const overlayCanvas = document.querySelector('canvas:nth-of-type(2)') || document.querySelectorAll('canvas')[1];

  // Pause continuous background renderLoop during benchmarking to eliminate scheduling jitter
  window.__INDICATRIX_PAUSE_RENDER_LOOP__ = true;
  await new Promise((r) => setTimeout(r, 120));

  const results = {
    metadata: {
      timestamp: new Date().toISOString(),
      gpuDevice: engine.device?.label || 'WebGPU Device',
      warmupCount,
      sampleCount,
    },
    suites: {},
    summary: {},
  };

  const calculateStats = (arr) => {
    if (!arr || arr.length === 0) return { mean: 0, p95: 0, min: 0, max: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return {
      mean: parseFloat(mean.toFixed(3)),
      p95: parseFloat(p95.toFixed(3)),
      min: parseFloat(min.toFixed(3)),
      max: parseFloat(max.toFixed(3)),
    };
  };

  const executeState = async (suiteName, stateName, config) => {
    // 1. Mesh tier configuration
    if (config.meshTier) {
      const tiers = {
        '100k': { lat: 256, lon: 512 },
        '1M': { lat: 512, lon: 1024 },
        '4M': { lat: 1024, lon: 2048 },
      };
      const t = tiers[config.meshTier] || tiers['1M'];
      if (typeof engine.rebuildSphereMesh === 'function') {
        engine.rebuildSphereMesh(t.lat, t.lon);
      }
    }

    if (config.substrateHaptics !== undefined) {
      engine.paperSubstrateEnabled = config.substrateHaptics;
    }

    const baseParams = {
      unfurl: config.unfurl !== undefined ? config.unfurl : 0.0,
      mode: config.mode !== undefined ? config.mode : 0,
      theme: config.theme !== undefined ? config.theme : 0,
      layerMode: config.layerMode !== undefined ? config.layerMode : 0,
      time: 1.0,
      dt: 0.01667,
      camera: camera,
      cursorRayOrig: { x: 0, y: 0, z: 0 },
      cursorRayDir: { x: 0, y: 0, z: -1 },
      cursorHitPos: { x: 0, y: 0, z: 0 },
      cursorVel: { x: 0, y: 0, z: 0 },
      showRelief: config.showRelief !== undefined ? config.showRelief : true,
      reliefActive: config.reliefActive !== undefined ? config.reliefActive : true,
      showVectors: config.showVectors ?? false,
      showWind: config.showWind ?? false,
      showContours: config.showContours ?? false,
      showSatellites: false,
      showClouds: config.showClouds ?? false,
      volumetricClouds: config.volumetricClouds ?? false,
      showCloudLow: config.showCloudLow ?? false,
      showCloudMid: config.showCloudMid ?? false,
      showCloudHigh: config.showCloudHigh ?? false,
      showAtmosphere: config.showAtmosphere ?? false,
      substrateHaptics: config.substrateHaptics ?? false,
      paperSubstrate: config.paperSubstrate ?? false,
      cloudAdvection: config.cloudAdvection ?? false,
    };

    // 2. Warmup passes
    for (let i = 0; i < warmupCount; i++) {
      engine.render({ ...baseParams, time: i * 0.01667 });
      await engine.device.queue.onSubmittedWorkDone();
    }

    // 3. Measurement passes
    const cpuSamples = [];
    const gpuSamples = [];
    const totalSamples = [];
    const overlaySamples = [];

    const camOrigPos = camera?.position ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null;

    for (let i = 0; i < sampleCount; i++) {
      const curTime = (warmupCount + i) * 0.01667;

      // Interaction simulation: camera orbit
      if (config.orbitCamera && camera && camOrigPos) {
        const radius = Math.sqrt(camOrigPos.x * camOrigPos.x + camOrigPos.z * camOrigPos.z) || 12;
        const angle = i * 0.02;
        camera.position.x = Math.sin(angle) * radius;
        camera.position.z = Math.cos(angle) * radius;
        if (typeof camera.lookAt === 'function') {
          camera.lookAt(0, 0, 0);
        }
      }

      const t0 = performance.now();
      engine.render({ ...baseParams, time: curTime });
      const tEngineEnd = performance.now();
      const cpuTime = tEngineEnd - t0;

      // 2D Canvas Landmark Simulation
      let overlayTime = 0;
      if (config.showLandmarks && overlayCanvas) {
        const tOverlayStart = performance.now();
        const ctx = overlayCanvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.font = '10px monospace';
          const count = 50;
          for (let lm = 0; lm < count; lm++) {
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
      } else if (config.forceUncachedProjections && overlayCanvas) {
        // Uncached worst-case projection simulation
        const tProjStart = performance.now();
        const ctx = overlayCanvas.getContext('2d');
        if (ctx) {
          for (let lm = 0; lm < 50; lm++) {
            // Emulate evaluatePointMorph + trigonometry + measureText uncached
            const lat = (lm * 3.6 - 90) * (Math.PI / 180);
            const lon = (lm * 7.2 - 180) * (Math.PI / 180);
            const r = 5.0;
            const x = r * Math.cos(lat) * Math.sin(lon);
            const y = r * Math.sin(lat);
            const z = r * Math.cos(lat) * Math.cos(lon);
            ctx.font = '10px "JetBrains Mono", monospace';
            const m = ctx.measureText(`Sounding ${lm}: ${Math.sin(x) * 1000}m`);
          }
        }
        overlayTime = performance.now() - tProjStart;
      }

      await engine.device.queue.onSubmittedWorkDone();
      const totalTime = performance.now() - t0;
      const gpuTime = Math.max(0, totalTime - cpuTime);

      cpuSamples.push(cpuTime + overlayTime);
      gpuSamples.push(gpuTime);
      totalSamples.push(totalTime + overlayTime);
      overlaySamples.push(overlayTime);
    }

    // Restore camera position if altered
    if (config.orbitCamera && camera && camOrigPos) {
      camera.position.x = camOrigPos.x;
      camera.position.y = camOrigPos.y;
      camera.position.z = camOrigPos.z;
      if (typeof camera.lookAt === 'function') {
        camera.lookAt(0, 0, 0);
      }
    }

    // Capture VRAM snapshot
    let vramSnapshot = null;
    if (typeof engine.getVramLedger === 'function') {
      vramSnapshot = engine.getVramLedger();
    }

    // Capture hardware profiler report if available
    let profilerReport = null;
    if (typeof engine.getProfiler === 'function') {
      profilerReport = engine.getProfiler()?.getLatestReport();
    }

    const cpuStats = calculateStats(cpuSamples);
    const gpuStats = calculateStats(gpuSamples);
    const totalStats = calculateStats(totalSamples);
    const overlayStats = calculateStats(overlaySamples);

    if (!results.suites[suiteName]) {
      results.suites[suiteName] = {};
    }

    results.suites[suiteName][stateName] = {
      cpuMs: cpuStats,
      gpuMs: gpuStats,
      totalMs: totalStats,
      overlayMs: overlayStats,
      effectiveFps: parseFloat((1000 / Math.max(0.001, totalStats.mean)).toFixed(1)),
      vramMb: vramSnapshot ? vramSnapshot.totalMb : 'N/A',
      vramSubsystems: vramSnapshot ? vramSnapshot.subsystems : null,
      profilerReport: profilerReport || null,
    };
  };

  try {
    // ========================================================================
    // Suite 1: Cartographic Mediums (Themes)
    // ========================================================================
    if (suiteFilter.includes('themes')) {
      await executeState('themes', 'Theme 0 (Marie Tharp Physiographic)', {
        theme: 0,
        substrateHaptics: false,
        paperSubstrate: false,
        meshTier: '1M',
      });

      await executeState('themes', 'Theme 1 (Cream Rag + Substrate Haptics)', {
        theme: 1,
        substrateHaptics: true,
        paperSubstrate: true,
        meshTier: '1M',
      });

      await executeState('themes', 'Theme 1 (Cream Rag WITHOUT Substrate Haptics)', {
        theme: 1,
        substrateHaptics: false,
        paperSubstrate: false,
        meshTier: '1M',
      });

      await executeState('themes', 'Theme 2 (Prussian Cyanotype Blueprint)', {
        theme: 2,
        substrateHaptics: false,
        paperSubstrate: false,
        meshTier: '1M',
      });
    }

    // ========================================================================
    // Suite 2: Manifolds & Deformation States
    // ========================================================================
    if (suiteFilter.includes('manifolds')) {
      await executeState('manifolds', 'Mode 0 (Folio Wave Unfurl: α=0.0 Sphere)', {
        mode: 0,
        unfurl: 0.0,
        theme: 0,
        meshTier: '1M',
      });

      await executeState('manifolds', 'Mode 0 (Folio Wave Unfurl: α=0.5 Mid)', {
        mode: 0,
        unfurl: 0.5,
        theme: 0,
        meshTier: '1M',
      });

      await executeState('manifolds', 'Mode 0 (Folio Wave Unfurl: α=1.0 Flat Sheet)', {
        mode: 0,
        unfurl: 1.0,
        theme: 0,
        meshTier: '1M',
      });

      await executeState('manifolds', 'Mode 1 (Cylindrical Scroll: α=0.5 Mid)', {
        mode: 1,
        unfurl: 0.5,
        theme: 0,
        meshTier: '1M',
      });

      await executeState('manifolds', 'Mode 1 (Cylindrical Scroll: α=1.0 Flat)', {
        mode: 1,
        unfurl: 1.0,
        theme: 0,
        meshTier: '1M',
      });

      await executeState('manifolds', 'Mode 2 (Linear Elastic Fracture: α=0.5)', {
        mode: 2,
        unfurl: 0.5,
        theme: 0,
        meshTier: '1M',
      });

      await executeState('manifolds', 'Mode 3 (Fluid Advection Vortex: α=0.5)', {
        mode: 3,
        unfurl: 0.5,
        theme: 0,
        meshTier: '1M',
      });
    }

    // ========================================================================
    // Suite 3: Atmospheric & Weather Strata Breakdown
    // ========================================================================
    if (suiteFilter.includes('weather')) {
      await executeState('weather', 'Baseline Clean (No Weather Strata)', {
        theme: 0,
        showClouds: false,
        volumetricClouds: false,
        showAtmosphere: false,
        meshTier: '1M',
      });

      await executeState('weather', 'Low Cloud Shell Alone', {
        theme: 0,
        showClouds: true,
        volumetricClouds: false,
        showCloudLow: true,
        showCloudMid: false,
        showCloudHigh: false,
        meshTier: '1M',
      });

      await executeState('weather', 'Mid Cloud Shell Alone', {
        theme: 0,
        showClouds: true,
        volumetricClouds: false,
        showCloudLow: false,
        showCloudMid: true,
        showCloudHigh: false,
        meshTier: '1M',
      });

      await executeState('weather', 'High Cloud Shell Alone', {
        theme: 0,
        showClouds: true,
        volumetricClouds: false,
        showCloudLow: false,
        showCloudMid: false,
        showCloudHigh: true,
        meshTier: '1M',
      });

      await executeState('weather', 'All 3 Raster Cloud Shells (Low+Mid+High)', {
        theme: 0,
        showClouds: true,
        volumetricClouds: false,
        showCloudLow: true,
        showCloudMid: true,
        showCloudHigh: true,
        meshTier: '1M',
      });

      await executeState('weather', 'Volumetric Cloud Raymarcher (Pass 2 + Proxy)', {
        theme: 0,
        showClouds: true,
        volumetricClouds: true,
        meshTier: '1M',
      });

      await executeState('weather', 'Atmospheric Limb Scattering Alone', {
        theme: 0,
        showAtmosphere: true,
        showClouds: false,
        volumetricClouds: false,
        meshTier: '1M',
      });

      await executeState('weather', 'Full Atmosphere Stack (Volumetric + Scatter)', {
        theme: 0,
        showAtmosphere: true,
        showClouds: true,
        volumetricClouds: true,
        meshTier: '1M',
      });
    }

    // ========================================================================
    // Suite 4: Vector Linework & 2D Overlays
    // ========================================================================
    if (suiteFilter.includes('vectors')) {
      await executeState('vectors', 'Vectors OFF (Zero Overlays)', {
        theme: 0,
        showVectors: false,
        showContours: false,
        showLandmarks: false,
        meshTier: '1M',
      });

      await executeState('vectors', 'WebGPU Vector Ribbons ON (Coastlines + Graticule)', {
        theme: 0,
        showVectors: true,
        meshTier: '1M',
      });

      await executeState('vectors', 'Isoline Contours ON', {
        theme: 0,
        showContours: true,
        meshTier: '1M',
      });

      await executeState('vectors', 'Wireframe Lines ON (Layer Mode 2)', {
        theme: 0,
        layerMode: 2,
        meshTier: '1M',
      });

      await executeState('vectors', '2D Canvas Landmarks (Cached Projections)', {
        theme: 0,
        showLandmarks: true,
        meshTier: '1M',
      });

      await executeState('vectors', '2D Canvas Landmarks (Uncached Worst-Case)', {
        theme: 0,
        forceUncachedProjections: true,
        meshTier: '1M',
      });
    }

    // ========================================================================
    // Suite 5: Mesh & Particle Resolution Tiers
    // ========================================================================
    if (suiteFilter.includes('resolution')) {
      await executeState('resolution', 'Mesh 100k (256x512)', {
        theme: 0,
        meshTier: '100k',
      });

      await executeState('resolution', 'Mesh 1M (512x1024)', {
        theme: 0,
        meshTier: '1M',
      });

      await executeState('resolution', 'Mesh 4M (1024x2048)', {
        theme: 0,
        meshTier: '4M',
      });
    }

    // ========================================================================
    // Suite 6: Camera Orbit & Interaction Stress
    // ========================================================================
    if (suiteFilter.includes('interaction')) {
      await executeState('interaction', 'Camera Orbit (Continuous Azimuth Orbit)', {
        theme: 0,
        orbitCamera: true,
        meshTier: '1M',
      });

      await executeState('interaction', 'Full Scene Under Orbit (Theme 1 + Volumetric + Vectors)', {
        theme: 1,
        substrateHaptics: true,
        paperSubstrate: true,
        showClouds: true,
        volumetricClouds: true,
        showVectors: true,
        orbitCamera: true,
        meshTier: '1M',
      });
    }
  } finally {
    // Restore default baseline mesh & resume background render loop
    if (typeof engine.rebuildSphereMesh === 'function') {
      engine.rebuildSphereMesh(512, 1024);
    }
    engine.paperSubstrateEnabled = false;
    window.__INDICATRIX_PAUSE_RENDER_LOOP__ = false;
  }

  // Calculate Key Hypotheses Deltas
  const sThemes = results.suites.themes;
  if (sThemes) {
    const t0 = sThemes['Theme 0 (Marie Tharp Physiographic)'];
    const t1 = sThemes['Theme 1 (Cream Rag + Substrate Haptics)'];
    const t1Clean = sThemes['Theme 1 (Cream Rag WITHOUT Substrate Haptics)'];
    const t2 = sThemes['Theme 2 (Prussian Cyanotype Blueprint)'];

    results.summary.themeHypothesis = {
      theme0GpuMs: t0?.gpuMs.mean,
      theme1GpuMs: t1?.gpuMs.mean,
      theme1CleanGpuMs: t1Clean?.gpuMs.mean,
      theme2GpuMs: t2?.gpuMs.mean,
      paperToothDeltaMs: t1 && t1Clean ? parseFloat((t1.gpuMs.mean - t1Clean.gpuMs.mean).toFixed(3)) : 'N/A',
      paperToothOverheadPct: t1 && t1Clean && t1Clean.gpuMs.mean > 0
        ? parseFloat((((t1.gpuMs.mean - t1Clean.gpuMs.mean) / t1Clean.gpuMs.mean) * 100).toFixed(1))
        : 'N/A',
    };
  }

  const sWeather = results.suites.weather;
  if (sWeather) {
    const base = sWeather['Baseline Clean (No Weather Strata)'];
    const raster = sWeather['All 3 Raster Cloud Shells (Low+Mid+High)'];
    const volumetric = sWeather['Volumetric Cloud Raymarcher (Pass 2 + Proxy)'];
    const atmo = sWeather['Atmospheric Limb Scattering Alone'];

    results.summary.weatherHypothesis = {
      baselineGpuMs: base?.gpuMs.mean,
      rasterCloudsDeltaMs: raster && base ? parseFloat((raster.gpuMs.mean - base.gpuMs.mean).toFixed(3)) : 'N/A',
      volumetricDeltaMs: volumetric && base ? parseFloat((volumetric.gpuMs.mean - base.gpuMs.mean).toFixed(3)) : 'N/A',
      atmoScatterDeltaMs: atmo && base ? parseFloat((atmo.gpuMs.mean - base.gpuMs.mean).toFixed(3)) : 'N/A',
    };
  }

  const sVectors = results.suites.vectors;
  if (sVectors) {
    const cached = sVectors['2D Canvas Landmarks (Cached Projections)'];
    const uncached = sVectors['2D Canvas Landmarks (Uncached Worst-Case)'];
    results.summary.overlayHypothesis = {
      cachedCpuMs: cached?.cpuMs.mean,
      uncachedCpuMs: uncached?.cpuMs.mean,
      projectionSavingsMs: cached && uncached ? parseFloat((uncached.cpuMs.mean - cached.cpuMs.mean).toFixed(3)) : 'N/A',
    };
  }

  const sRes = results.suites.resolution;
  if (sRes) {
    results.summary.resolutionScaling = {
      res100kGpuMs: sRes['Mesh 100k (256x512)']?.gpuMs.mean,
      res1MGpuMs: sRes['Mesh 1M (512x1024)']?.gpuMs.mean,
      res4MGpuMs: sRes['Mesh 4M (1024x2048)']?.gpuMs.mean,
      res100kVramMb: sRes['Mesh 100k (256x512)']?.vramMb,
      res1MVramMb: sRes['Mesh 1M (512x1024)']?.vramMb,
      res4MVramMb: sRes['Mesh 4M (1024x2048)']?.vramMb,
    };
  }

  window.__INDICATRIX_COMPREHENSIVE_RESULTS__ = results;
  return results;
}

if (typeof window !== 'undefined') {
  window.runComprehensiveProfilingSuite = runComprehensiveProfilingSuite;
}
