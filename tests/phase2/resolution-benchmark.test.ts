import { describe, it, expect } from 'vitest';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Empirical Dual-Surface Mesh Resolution Benchmarks on Apple Silicon', () => {
  const engine = new WebGPUEngine();

  const resolutions = [
    { label: 'Low (Legacy Baseline)', lat: 128, lon: 256 },
    { label: 'Medium (Balanced)', lat: 256, lon: 512 },
    { label: 'High (Target Sweet Spot)', lat: 512, lon: 1024 },
    { label: 'Ultra (Extreme Fidelity)', lat: 768, lon: 1536 },
    { label: 'Maximum (ETOPO Native Bound)', lat: 1024, lon: 2048 },
  ];

  for (const res of resolutions) {
    it(`evaluates ${res.label} [${res.lat}x${res.lon}] geometry, memory footprint, and generation latency`, () => {
      const t0 = performance.now();
      const mesh = engine.generateSphereGrid(res.lat, res.lon);
      const elapsedMs = performance.now() - t0;

      const vertexCount = mesh.vertices.length / 12;
      const triangleCount = mesh.indices.length / 3;
      const vertexBytes = mesh.vertices.byteLength;
      const indexBytes = mesh.indices.byteLength;
      const totalMB = (vertexBytes + indexBytes) / (1024 * 1024);

      console.log(
        `[BENCHMARK] ${res.label.padEnd(28)}: ${res.lat}x${res.lon} | ` +
        `Verts: ${vertexCount.toLocaleString().padStart(9)} | ` +
        `Tris: ${triangleCount.toLocaleString().padStart(9)} | ` +
        `VRAM: ${totalMB.toFixed(2).padStart(6)} MB | ` +
        `Gen Time: ${elapsedMs.toFixed(2).padStart(6)} ms`
      );

      expect(mesh.vertices.length).toBeGreaterThan(0);
      expect(mesh.indices.length).toBeGreaterThan(0);
      expect(Number.isFinite(mesh.vertices[0])).toBe(true);

      for (let i = 0; i < Math.min(1000, mesh.vertices.length); i++) {
        expect(Number.isNaN(mesh.vertices[i])).toBe(false);
      }
    });
  }
});
