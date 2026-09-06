#!/usr/bin/env -S node --experimental-websocket
// ============================================================================
// Script: scripts/hardware-benchmark-v2.mjs
// Description: Calibrated Apple Silicon M4 Pro Telemetry & Benchmark Harness
// Architecture:
//   - Synchronized to true 120 Hz ProMotion display v-blank (no unthrottled vsync hacks)
//   - 300-frame sustained sampling window (2.5s) per scenario
//   - Refresh-bucket pacing:
//       On-Time 120 Hz: interval < 12.5 ms
//       Missed 1 V-Blank (60 Hz cadence): 12.5 ms <= interval < 20.8 ms
//       Severe Stutter: interval >= 20.8 ms
//   - Direct JavaScript CPU execution duration measurement during slider interactions
//   - Non-blocking Metal GPU timestamp queries (via Dawn allow_unsafe_apis)
// ============================================================================

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PORT = 9560 + Math.floor(Math.random() * 200);
const APP_URL = 'http://localhost:3000/';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TEMP_PROFILE = `/tmp/indicatrix-bench-v2-${Date.now()}`;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.msgId = 1;
    this.ws = null;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        console.error('CDP message parse error:', err);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(funcOrExpr, ...args) {
    let expression;
    if (typeof funcOrExpr === 'function') {
      expression = `(${funcOrExpr.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    } else {
      expression = funcOrExpr;
    }

    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (res?.exceptionDetails) {
      throw new Error(`Evaluation Exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }

    return res?.result?.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outFileName = args.find((a) => a.startsWith('--out='))?.split('=')[1] || 'benchmark-v2-run.json';
  const outFilePath = path.isAbsolute(outFileName) ? outFileName : path.join(ROOT_DIR, 'reports', outFileName);

  console.log('='.repeat(78));
  console.log('INDICATRIX CALIBRATED BENCHMARK V2 (APPLE SILICON M4 PRO)');
  console.log(`Target Port: ${PORT}`);
  console.log(`Output Report: ${outFilePath}`);
  console.log('='.repeat(78));

  // Flags keep vsync intact so Chrome aligns with the physical 120 Hz display
  const chromeArgs = [
    `--remote-debugging-port=${PORT}`,
    '--use-angle=metal',
    '--enable-unsafe-webgpu',
    '--enable-dawn-features=allow_unsafe_apis',
    '--disable-dawn-features=disallow_unsafe_apis',
    '--ignore-gpu-blocklist',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1728,1117',
  ];

  const chromeProc = spawn(CHROME_PATH, chromeArgs, {
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const cleanup = async () => {
    try {
      chromeProc.kill('SIGTERM');
      await fs.rm(TEMP_PROFILE, { recursive: true, force: true }).catch(() => {});
    } catch {}
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(1);
  });
  process.on('exit', cleanup);

  // Connect to Chrome CDP
  let pageTarget = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const targets = await res.json();
      pageTarget = targets.find((t) => t.type === 'page');
      if (pageTarget) break;
    } catch {}
  }

  if (!pageTarget) {
    console.error('Failed to connect to Chrome CDP.');
    await cleanup();
    process.exit(1);
  }

  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  console.log('Navigating to ' + APP_URL);
  await client.send('Page.navigate', { url: APP_URL });

  // Wait for WebGPU engine initialization
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await client.evaluate(() => {
      const eng = window.__WEBGPU_ENGINE__;
      return !!(eng && eng.initialized && eng.pointCount > 0);
    });
    if (ready) break;
  }

  if (!ready) {
    console.error('WebGPU engine failed to initialize.');
    await cleanup();
    process.exit(1);
  }

  console.log('Engine ready. 1M nodes loaded in WebGPU unified memory.\n');

  // Query environment metadata directly from the live page
  const environment = await client.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return {
      userAgent: navigator.userAgent,
      dpr: window.devicePixelRatio,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
      },
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        pixelCount: canvas.width * canvas.height,
      } : null,
      webgpuFeatures: Array.from(window.__WEBGPU_ENGINE__?.device?.features || []),
    };
  });

  console.log('Environment Details:');
  console.log(`  Screen: ${environment.screen.width}x${environment.screen.height} (DPR: ${environment.dpr})`);
  console.log(`  Canvas Buffer: ${environment.canvas?.width}x${environment.canvas?.height} (~${((environment.canvas?.pixelCount || 0) / 1e6).toFixed(2)}M px/frame)`);
  console.log(`  WebGPU Timestamps: ${environment.webgpuFeatures.includes('timestamp-query') ? 'ENABLED (Hardware Metal SIMD32)' : 'DISABLED'}\n`);

  const scenarioConfigs = [
    { id: 'SC-01', name: 'Baseline Idle (1M Nodes, Both Layers)', type: 'idle', mode: 0, layerMode: 0, alpha: 0.0 },
    { id: 'SC-02', name: 'Clean Terrain (1M Nodes, Solid Crust + Wireframe)', type: 'clean', mode: 0, layerMode: 2, alpha: 0.0 },
    { id: 'SC-03', name: 'Points Only (1M Nodes, Points Sprites Only)', type: 'points', mode: 0, layerMode: 1, alpha: 0.0 },
    { id: 'SC-04', name: 'Active Camera Orbit Drag', type: 'orbit', mode: 0, layerMode: 0, alpha: 0.0 },
    { id: 'SC-05', name: 'Continuous Zoom (Wheel In & Out)', type: 'zoom', mode: 0, layerMode: 0, alpha: 0.0 },
    { id: 'SC-06', name: 'Active Morph Unroll (Alpha 0.0 -> 1.0 -> 0.0)', type: 'morph', mode: 0, layerMode: 0, alpha: 0.0 },
    { id: 'SC-07', name: 'Continuous Slider Dragging (Sun Azimuth & Sea Level)', type: 'sliders', mode: 0, layerMode: 2, alpha: 0.0 },
    { id: 'SC-08', name: 'Resolution Scaling (100K Nodes Active Orbit)', type: 'scaling', mode: 0, layerMode: 0, alpha: 0.0, resolution: '100k' },
  ];

  const results = [];

  for (const sc of scenarioConfigs) {
    process.stdout.write(`Executing [${sc.id}] ${sc.name}... `);
    const tStart = Date.now();

    const res = await client.evaluate(async (cfg) => {
      const devTools = window.__INDICATRIX_ENGINE__;
      const engine = window.__WEBGPU_ENGINE__;
      const profiler = engine?.getProfiler?.();
      const canvas = document.querySelector('canvas');

      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Setup
      if (cfg.resolution) {
        devTools.setResolution(cfg.resolution);
        await new Promise((r) => setTimeout(r, 500));
      } else {
        devTools.setResolution('1M');
      }
      devTools.setMode(cfg.mode);
      devTools.setLayerMode(cfg.layerMode);
      devTools.setAlpha(cfg.alpha);

      if (cfg.type === 'orbit' || cfg.type === 'scaling') {
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
      }

      await new Promise((r) => setTimeout(r, 200)); // settle

      const frameCount = 300;
      const warmup = 15;
      const samples = [];
      let prevTime = performance.now();

      for (let i = 0; i < frameCount; i++) {
        let cpuMs = 0;

        if (cfg.type === 'orbit' || cfg.type === 'scaling') {
          const angle = (i / frameCount) * Math.PI * 4;
          const x = cx + Math.cos(angle) * 120;
          const y = cy + Math.sin(angle) * 60;
          canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, button: 0, bubbles: true }));
        } else if (cfg.type === 'zoom') {
          const deltaY = i < frameCount / 2 ? -25 : 25;
          canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true }));
        } else if (cfg.type === 'morph') {
          const a = i < frameCount / 2 ? i / (frameCount / 2) : 1.0 - (i - frameCount / 2) / (frameCount / 2);
          devTools.setAlpha(a);
        } else if (cfg.type === 'sliders') {
          const t0 = performance.now();
          const azimuth = (i / frameCount) * 360;
          const seaLevel = -50 + (i / frameCount) * 100;
          const sliders = Array.from(document.querySelectorAll('input[type="range"]'));
          const azSlider = sliders.find((s) => s.closest('.flex')?.textContent?.includes('Sun Azimuth'));
          const seaSlider = sliders.find((s) => s.closest('.flex')?.textContent?.includes('Sea Level'));

          if (azSlider) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(azSlider, String(Math.round(azimuth)));
            azSlider.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (seaSlider) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(seaSlider, String(Math.round(seaLevel)));
            seaSlider.dispatchEvent(new Event('input', { bubbles: true }));
          }
          cpuMs = performance.now() - t0;
        }

        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        const frameIntervalMs = now - prevTime;
        prevTime = now;

        const report = profiler?.latestReport;
        samples.push({
          intervalMs: frameIntervalMs,
          cpuMs,
          computeMs: report ? report.computeMs : 0,
          renderMs: report ? report.renderMs : 0,
          totalGpuMs: report ? report.totalGpuMs : 0,
        });
      }

      if (cfg.type === 'orbit' || cfg.type === 'scaling') {
        canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
      }

      const valid = samples.slice(warmup);
      const intervals = valid.map((s) => s.intervalMs).sort((a, b) => a - b);
      const cpu = valid.map((s) => s.cpuMs).filter((c) => c >= 0).sort((a, b) => a - b);
      const compute = valid.map((s) => s.computeMs).filter((c) => c > 0).sort((a, b) => a - b);
      const render = valid.map((s) => s.renderMs).filter((r) => r > 0).sort((a, b) => a - b);
      const totalGpu = valid.map((s) => s.totalGpuMs).filter((t) => t > 0).sort((a, b) => a - b);

      const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
      const p50 = (arr) => (arr.length ? arr[Math.floor(arr.length * 0.5)] : 0);
      const p95 = (arr) => (arr.length ? arr[Math.floor(arr.length * 0.95)] : 0);
      const p99 = (arr) => (arr.length ? arr[Math.floor(arr.length * 0.99)] : 0);

      const onTime = intervals.filter((t) => t < 12.5).length;
      const missed1VBlank = intervals.filter((t) => t >= 12.5 && t < 20.8).length;
      const severeStutter = intervals.filter((t) => t >= 20.8).length;
      const trueDrops = missed1VBlank + severeStutter;
      const trueDropRatePct = (trueDrops / intervals.length) * 100;

      return {
        id: cfg.id,
        name: cfg.name,
        sampleCount: intervals.length,
        meanFps: Number((1000 / avg(intervals)).toFixed(1)),
        frameInterval: {
          meanMs: Number(avg(intervals).toFixed(2)),
          p50Ms: Number(p50(intervals).toFixed(2)),
          p95Ms: Number(p95(intervals).toFixed(2)),
          p99Ms: Number(p99(intervals).toFixed(2)),
          minMs: Number((intervals[0] || 0).toFixed(2)),
          maxMs: Number((intervals[intervals.length - 1] || 0).toFixed(2)),
        },
        pacingBuckets: {
          onTime120HzCount: onTime,
          onTime120HzPct: Number(((onTime / intervals.length) * 100).toFixed(1)),
          missed1VBlankCount: missed1VBlank,
          severeStutterCount: severeStutter,
          trueDropCount: trueDrops,
          trueDropRatePct: Number(trueDropRatePct.toFixed(1)),
          sustains120Fps: trueDropRatePct < 5.0 && p95(intervals) <= 12.5,
        },
        gpuHardware: {
          avgComputeMs: Number(avg(compute).toFixed(3)),
          p95ComputeMs: Number(p95(compute).toFixed(3)),
          avgRenderMs: Number(avg(render).toFixed(3)),
          p95RenderMs: Number(p95(render).toFixed(3)),
          avgTotalGpuMs: Number(avg(totalGpu).toFixed(3)),
          p95TotalGpuMs: Number(p95(totalGpu).toFixed(3)),
        },
        cpuMainThread: {
          avgCpuMs: Number(avg(cpu).toFixed(2)),
          p95CpuMs: Number(p95(cpu).toFixed(2)),
          maxCpuMs: Number((cpu[cpu.length - 1] || 0).toFixed(2)),
        },
      };
    }, sc);

    results.push(res);
    const durationS = ((Date.now() - tStart) / 1000).toFixed(1);
    console.log(`done in ${durationS}s -> ${res.meanFps} FPS | p50: ${res.frameInterval.p50Ms}ms | True Drops: ${res.pacingBuckets.trueDropCount} (${res.pacingBuckets.trueDropRatePct}%) | GPU: ${res.gpuHardware.avgTotalGpuMs}ms`);
  }

  // Restore clean state
  await client.evaluate(() => {
    const devTools = window.__INDICATRIX_ENGINE__;
    devTools.setResolution('1M');
    devTools.setMode(0);
    devTools.setLayerMode(2);
    devTools.setAlpha(0.0);
  });

  console.log('\nCALIBRATED BENCHMARK SUMMARY:');
  console.table(
    results.map((s) => ({
      Scenario: s.name.slice(0, 36),
      FPS: s.meanFps,
      'p50 (ms)': s.frameInterval.p50Ms,
      'p95 (ms)': s.frameInterval.p95Ms,
      '120Hz (%)': s.pacingBuckets.onTime120HzPct,
      'Missed 1V': s.pacingBuckets.missed1VBlankCount,
      'Hitch': s.pacingBuckets.severeStutterCount,
      'Drops (%)': s.pacingBuckets.trueDropRatePct,
      'GPU Total': s.gpuHardware.avgTotalGpuMs,
      'CPU Handler': s.cpuMainThread.avgCpuMs > 0 ? `${s.cpuMainThread.avgCpuMs}ms` : '-',
      'Sustains 120': s.pacingBuckets.sustains120Fps ? 'YES' : 'NO',
    }))
  );

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      platform: 'Apple Silicon M4 Pro (Mac16,7)',
      display: 'Liquid Retina XDR (120 Hz ProMotion)',
      harness: 'Calibrated Hardware Benchmark Harness v2',
      framesPerScenario: 300,
      discardWarmupFrames: 15,
      environment,
    },
    scenarios: results,
  };

  await fs.mkdir(path.dirname(outFilePath), { recursive: true });
  await fs.writeFile(outFilePath, JSON.stringify(report, null, 2));
  console.log(`\nReport successfully saved to: ${outFilePath}`);

  await cleanup();
}

main().catch(async (err) => {
  console.error('Fatal error in benchmark harness:', err);
  process.exit(1);
});
