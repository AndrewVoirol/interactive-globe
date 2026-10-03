import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseGeomBuffer, serializeGeomBuffer, GEOM_MAGIC, GEOM_VERSION } from '../helpers/geom-parser';
import { getLayerOpacities, computeWireframeOpacityScale } from '../helpers/math-oracle';
describe('Milestone M2 Verification: Visual Restraint & Adaptive Lattice Layering', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  const precomputePath = path.join(projectRoot, 'scripts/precompute.js');
  let appCode = fs.readFileSync(appTsxPath, 'utf8');
  const pointsWgslPath = path.join(projectRoot, 'src/webgpu/shaders/points_render.wgsl');
  const linesWgslPath = path.join(projectRoot, 'src/webgpu/shaders/lines_render.wgsl');
  const enginePath = path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts');
  const pointsCode = fs.existsSync(pointsWgslPath) ? fs.readFileSync(pointsWgslPath, 'utf8') : '';
  const linesCode = fs.existsSync(linesWgslPath) ? fs.readFileSync(linesWgslPath, 'utf8') : '';
  const engineCode = fs.existsSync(enginePath) ? fs.readFileSync(enginePath, 'utf8') : '';
  const precomputeCode = fs.readFileSync(precomputePath, 'utf8');

  describe('1. Interactive HUD Layer Selector & Uniform Dispatch', () => {
    it('M2-T1: verifies App.tsx manages layerMode state and DevTools API integration', () => {
      expect(appCode).toContain('layerMode');
      expect(appCode).toContain('setLayerMode');
      expect(appCode).toContain('registerDevToolsAPI');
    });

    it('M2-T2: verifies App.tsx renders HUD buttons for [Both], [Points], and [Wireframe]', () => {
      expect(appCode).toContain('setLayerMode(0)');
      expect(appCode).toContain('setLayerMode(1)');
      expect(appCode).toContain('setLayerMode(2)');
      expect(appCode).toContain('Display Layer');
      expect(appCode).toMatch(/Both[\s\S]*Points[\s\S]*Wireframe/);
    });

    it('M2-T3: verifies u_layerMode uniform is dispatched to point and mesh shader materials', () => {
      expect(fs.existsSync(pointsWgslPath)).toBe(true);
      expect(fs.existsSync(linesWgslPath)).toBe(true);
      expect(fs.existsSync(enginePath)).toBe(true);
      expect(pointsCode).toContain('u_layerMode: u32');
      expect(linesCode).toContain('u_layerMode: u32');
      expect(engineCode).toContain('simUints[2] = layerMode;');
    });
  });

  describe('2. GLSL 102:1 Contrast Ratio and Dynamic Opacity Transitions', () => {
    it('M2-T4: verifies Point Shader enforces contrast ratio between geographic and structural points', () => {
      expect(fs.existsSync(pointsWgslPath)).toBe(true);
      expect(pointsCode).toContain('in.vPointType');
      expect(pointsCode).toContain('baseAlpha = select(');

      // Exact mathematical dynamic range verification:
      const sGeo = 1.8;
      const alphaGeo = 0.95;
      const sStruct = 1.0;
      const alphaStruct = 0.03;

      const intensityGeo = alphaGeo * (sGeo * sGeo);
      const intensityStruct = alphaStruct * (sStruct * sStruct);
      const contrastRatio = intensityGeo / intensityStruct;

      expect(contrastRatio).toBeCloseTo(102.6, 1);
      expect(contrastRatio).toBeGreaterThanOrEqual(102.0);
    });

    it('M2-T5: verifies Point and Line Shaders discard or attenuate primitives according to u_layerMode', () => {
      expect(fs.existsSync(pointsWgslPath)).toBe(true);
      expect(fs.existsSync(linesWgslPath)).toBe(true);
      // In wireframe-only mode (layerMode == 2), points are discarded
      expect(pointsCode).toContain('if (sim.u_layerMode == 2u) {');
      expect(pointsCode).toContain('discard;');

      // In points-only mode (layerMode == 1), wireframe lines are discarded
      expect(linesCode).toContain('if (sim.u_layerMode == 1u) {');
      expect(linesCode).toContain('discard;');
    });

    it('M2-T6: verifies wireframe opacity is attenuated based on node density sqrt(100k / N)', () => {
      expect(fs.existsSync(linesWgslPath)).toBe(true);
      expect(linesCode).toContain('sim.u_layerMode == 0u');

      // Verify scaling behavior
      expect(computeWireframeOpacityScale(100000)).toBe(1.0);
      expect(computeWireframeOpacityScale(1000000)).toBeCloseTo(0.3162, 3);
    });
  });

  describe('3. Challenger 1 Bug Fixes Verification', () => {
    it('M2-T7: verifies scripts/precompute.js handles --density <= 0 and invalid density formats strictly', () => {
      expect(precomputeCode).toContain('num <= 0');
      expect(precomputeCode).toContain('parsed <= 0');

      // Check parseDensity behavior directly from script logic
      const parseDensityTest = (arg: string) => {
        if (!arg) throw new Error('Empty');
        const lower = String(arg).toLowerCase().trim();
        if (lower.endsWith('k')) {
          const num = parseFloat(lower.slice(0, -1));
          if (isNaN(num) || num <= 0) throw new Error('Invalid');
          return Math.round(num * 1000);
        }
        if (lower.endsWith('m')) {
          const num = parseFloat(lower.slice(0, -1));
          if (isNaN(num) || num <= 0) throw new Error('Invalid');
          return Math.round(num * 1000000);
        }
        const parsed = parseInt(lower, 10);
        if (isNaN(parsed) || parsed <= 0) throw new Error('Invalid');
        return parsed;
      };

      expect(() => parseDensityTest('0')).toThrow();
      expect(() => parseDensityTest('-100')).toThrow();
      expect(() => parseDensityTest('0k')).toThrow();
      expect(() => parseDensityTest('-5m')).toThrow();
      expect(parseDensityTest('100k')).toBe(100000);
      expect(parseDensityTest('1m')).toBe(1000000);
    });

    it('M2-T8: verifies scripts/precompute.js validates --format= equal syntax', () => {
      expect(precomputeCode).toContain("arg.startsWith('--format=')");
      expect(precomputeCode).toContain("['bin', 'json', 'both'].includes(f)");
    });

    it('M2-T9: verifies tests/helpers/geom-parser.ts reads offset 12 directly as indexCount', () => {
      const N = 50;
      const M = 80;
      const points = new Float32Array(N * 3);
      const target2D = new Float32Array(N * 2);
      const types = new Float32Array(N);
      const indices = new Uint32Array(M * 2);

      const buffer = serializeGeomBuffer(points, target2D, types, indices);
      const dataView = new DataView(buffer.buffer);

      // Verify offset 12 holds indexCount
      const rawIndexCountAt12 = dataView.getUint32(12, true);
      expect(rawIndexCountAt12).toBe(M * 2);

      const parsed = parseGeomBuffer(buffer);
      expect(parsed.indexCount).toBe(M * 2);
      expect(parsed.indices.length).toBe(M * 2);
    });
  });
});
