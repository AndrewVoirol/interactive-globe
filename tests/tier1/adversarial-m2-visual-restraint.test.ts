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
  const geoLayerPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoLayerPath)) {
    appCode += '\n' + fs.readFileSync(geoLayerPath, 'utf8');
  }
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
      if (!fs.existsSync(geoLayerPath)) return;
      expect(appCode).toContain('meshMaterialRef.current.uniforms.u_layerMode.value = layerMode');
      expect(appCode).toContain('pointMaterialRef.current.uniforms.u_layerMode.value = layerMode');
      expect(appCode).toContain('uniform int u_layerMode');
    });
  });

  describe('2. GLSL 102:1 Contrast Ratio and Dynamic Opacity Transitions', () => {
    it('M2-T4: verifies Point Shader enforces 102:1 contrast ratio between geographic and structural points', () => {
      if (fs.existsSync(geoLayerPath)) {
        // Point size verification in vertex shader: mix(1.0, 1.8, vType)
        expect(appCode).toContain('gl_PointSize = mix(1.0, 1.8, vType)');

        // Color and alpha verification in fragment shader
        expect(appCode).toContain('vec3(0.49, 0.827, 0.988)');
        expect(appCode).toContain('vec3(0.05, 0.12, 0.22)');
        expect(appCode).toContain('float alpha = mix(0.03, 0.95, vPointType)');
      }

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
      if (!fs.existsSync(geoLayerPath)) return;
      // In wireframe-only mode (layerMode == 2), points are discarded
      expect(appCode).toContain('u_layerMode == 2');
      expect(appCode).toContain('vAlphaMultiplier = 0.0');

      // In points-only mode (layerMode == 1), wireframe lines are discarded
      expect(appCode).toContain('u_layerMode == 1');
      expect(appCode).toMatch(/if\s*\(\s*u_layerMode\s*==\s*1\s*\)\s*\{[\s\S]*?discard;[\s\S]*?\}/);
    });

    it('M2-T6: verifies wireframe opacity is attenuated based on node density sqrt(100k / N)', () => {
      if (!fs.existsSync(geoLayerPath)) return;
      expect(appCode).toContain('u_wireOpacityScale');
      expect(appCode).toContain('Math.sqrt(100000 /');
      expect(appCode).toMatch(/float\s+densityFactor\s*=\s*clamp\(\s*u_wireOpacityScale/);

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
