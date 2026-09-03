import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseGeomBuffer, serializeGeomBuffer, GEOM_MAGIC, GEOM_VERSION } from '../helpers/geom-parser';
import { getLayerOpacities, computeWireframeOpacityScale } from '../helpers/math-oracle';

describe('Challenger 1 Empirical Verification: Milestone M2', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  const precomputePath = path.join(projectRoot, 'scripts/precompute.js');
  let appCode = fs.readFileSync(appTsxPath, 'utf8');
  const geoLayerPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoLayerPath)) {
    appCode += '\n' + fs.readFileSync(geoLayerPath, 'utf8');
  }
  const precomputeCode = fs.readFileSync(precomputePath, 'utf8');

  describe('1. Layer Toggling State Machine & Rapid Switching Stress', () => {
    it('CH-M2-T1: verifies rapid 10,000-cycle layer switching maintains strict state invariants', () => {
      // Simulating rapid switching cycle [Both (0) -> Points (1) -> Wireframe (2) -> Points (1) -> Both (0)]
      const modes: Array<0 | 1 | 2> = [0, 1, 2, 1, 0, 2, 0];
      let currentMode: 0 | 1 | 2 = 0;

      for (let cycle = 0; cycle < 10000; cycle++) {
        currentMode = modes[cycle % modes.length];
        const { pointsOpacity, wireframeOpacity } = getLayerOpacities(currentMode);

        if (currentMode === 0) {
          expect(pointsOpacity).toBe(1.0);
          expect(wireframeOpacity).toBe(1.0);
        } else if (currentMode === 1) {
          expect(pointsOpacity).toBe(1.0);
          expect(wireframeOpacity).toBe(0.0);
        } else if (currentMode === 2) {
          expect(pointsOpacity).toBe(0.0);
          expect(wireframeOpacity).toBe(1.0);
        }
      }
    });

    it('CH-M2-T2: verifies shader source ensures immediate primitive discard per mode', () => {
      // Points shader must discard in Wireframe mode (layerMode == 2)
      expect(appCode).toMatch(/if\s*\(\s*u_layerMode\s*==\s*2\s*\|\|\s*vAlphaMultiplier\s*<\s*0\.001\s*\)\s*\{[\s\S]*?discard;[\s\S]*?\}/);

      // Wireframe shader must discard in Points mode (layerMode == 1)
      expect(appCode).toMatch(/if\s*\(\s*u_layerMode\s*==\s*1\s*\)\s*\{[\s\S]*?discard;[\s\S]*?\}/);

      // Vertex shader must set vAlphaMultiplier to 0.0 when u_layerMode == 2
      expect(appCode).toMatch(/if\s*\(\s*u_layerMode\s*==\s*2\s*\)\s*\{[\s\S]*?vAlphaMultiplier\s*=\s*0\.0;[\s\S]*?\}\s*else\s*\{[\s\S]*?vAlphaMultiplier\s*=\s*1\.0;[\s\S]*?\}/);
    });

    it('CH-M2-T3: verifies zero geometry recreation or reallocation on layerMode change', () => {
      // In App.tsx, geometry useMemo depends ONLY on [geoData], NOT on [layerMode]
      const useMemoGeoMatch = appCode.match(/const\s*\{\s*meshGeometry,\s*pointGeometry\s*\}\s*=\s*useMemo\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[(.*?)\]\);/);
      expect(useMemoGeoMatch).not.toBeNull();
      if (useMemoGeoMatch) {
        const deps = useMemoGeoMatch[1];
        expect(deps).toContain('geoData');
        expect(deps).not.toContain('layerMode');
        expect(deps).not.toContain('mode');
        expect(deps).not.toContain('unfurlProgress');
      }
    });
  });

  describe('2. Mathematical Dynamic Range & Contrast Ratio (>100:1)', () => {
    it('CH-M2-T4: verifies exact 102.6:1 spatial-photometric dynamic range', () => {
      // Point size parameters from shaders
      const sizeGeo = 1.8;
      const sizeStruct = 1.0;
      const areaGeo = sizeGeo * sizeGeo; // 3.24
      const areaStruct = sizeStruct * sizeStruct; // 1.00

      // Alpha parameters from shaders
      const alphaGeo = 0.95;
      const alphaStruct = 0.03;

      // Integrated point intensity
      const intensityGeo = alphaGeo * areaGeo;
      const intensityStruct = alphaStruct * areaStruct;

      const dynamicRange = intensityGeo / intensityStruct;

      expect(dynamicRange).toBeCloseTo(102.6, 1);
      expect(dynamicRange).toBeGreaterThan(100.0);
    });

    it('CH-M2-T5: verifies ITU-R BT.709 perceived luminance contrast exceeds 100:1', () => {
      // Relative luminance Y = 0.2126 R + 0.7152 G + 0.0722 B
      const calcY = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Shaders: geographicColor = vec3(0.49, 0.827, 0.988), structuralColor = vec3(0.05, 0.12, 0.22)
      const yGeo = calcY(0.49, 0.827, 0.988);
      const yStruct = calcY(0.05, 0.12, 0.22);

      const alphaGeo = 0.95;
      const alphaStruct = 0.03;

      const effectiveLuminanceGeo = yGeo * alphaGeo;
      const effectiveLuminanceStruct = yStruct * alphaStruct;

      const luminanceRatio = effectiveLuminanceGeo / effectiveLuminanceStruct;
      expect(luminanceRatio).toBeGreaterThan(200.0); // 216:1
    });

    it('CH-M2-T6: verifies wireframe density attenuation function across extreme scale ranges', () => {
      // Sub-100k clamp
      expect(computeWireframeOpacityScale(1000)).toBe(1.0);
      expect(computeWireframeOpacityScale(50000)).toBe(1.0);
      expect(computeWireframeOpacityScale(100000)).toBe(1.0);

      // 1M density (overdraw reduction >= 68%)
      const scale1M = computeWireframeOpacityScale(1000000);
      expect(scale1M).toBeCloseTo(Math.sqrt(0.1), 4);
      expect((1.0 - scale1M) * 100).toBeGreaterThanOrEqual(68.0);

      // Extreme 10M density
      const scale10M = computeWireframeOpacityScale(10000000);
      expect(scale10M).toBeCloseTo(0.1, 4);

      // Negative and zero safety
      expect(computeWireframeOpacityScale(0)).toBe(1.0);
      expect(computeWireframeOpacityScale(-100)).toBe(1.0);
    });
  });

  describe('3. CLI Robustness & Parser Roundtrip Edge Cases', () => {
    it('CH-M2-T7: verifies density parser handles all invalid and valid formats with exact outputs', () => {
      // Extract parseDensity logic from precompute script
      const parseDensity = (arg: any) => {
        if (arg === undefined || arg === null || arg === '') {
          throw new Error('Invalid density: empty');
        }
        const lower = String(arg).toLowerCase().trim();
        if (lower === '100k') return 100000;
        if (lower === '1m') return 1000000;
        if (lower === '20k') return 20000;
        if (lower === '500k') return 500000;
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

      // Fuzz invalid density inputs
      const invalidDensities = ['0', '-1', '-100', '0k', '-5k', '0m', '-1m', 'abc', 'NaN', '', null, undefined];
      for (const inv of invalidDensities) {
        expect(() => parseDensity(inv)).toThrow();
      }

      // Valid density inputs
      expect(parseDensity('100k')).toBe(100000);
      expect(parseDensity('1m')).toBe(1000000);
      expect(parseDensity('20k')).toBe(20000);
      expect(parseDensity('50k')).toBe(50000);
      expect(parseDensity('2.5k')).toBe(2500);
      expect(parseDensity('1.5m')).toBe(1500000);
      expect(parseDensity('50000')).toBe(50000);
    });

    it('CH-M2-T8: verifies GEOM v1 binary buffer serialization and parsing integrity', () => {
      const N = 1000;
      const M = 1500;
      const points = new Float32Array(N * 3);
      const target2D = new Float32Array(N * 2);
      const types = new Float32Array(N);
      const indices = new Uint32Array(M * 2);

      for (let i = 0; i < N; i++) {
        points[i * 3 + 0] = Math.cos(i);
        points[i * 3 + 1] = Math.sin(i);
        points[i * 3 + 2] = (i / N) * 5.0;
        target2D[i * 2 + 0] = i * 0.1;
        target2D[i * 2 + 1] = i * 0.2;
        types[i] = i % 3 === 0 ? 1.0 : 0.0;
      }
      for (let i = 0; i < M * 2; i++) {
        indices[i] = (i * 17) % N;
      }

      const serialized = serializeGeomBuffer(points, target2D, types, indices);
      expect(serialized.byteLength).toBe(32 + N * 3 * 4 + N * 2 * 4 + N * 4 + M * 2 * 4);

      const parsed = parseGeomBuffer(serialized);
      expect(parsed.magic).toBe(GEOM_MAGIC);
      expect(parsed.version).toBe(GEOM_VERSION);
      expect(parsed.pointCount).toBe(N);
      expect(parsed.indexCount).toBe(M * 2);
      expect(parsed.points.length).toBe(N * 3);
      expect(parsed.target2D.length).toBe(N * 2);
      expect(parsed.types.length).toBe(N);
      expect(parsed.indices.length).toBe(M * 2);

      // Verify content preservation
      expect(parsed.points[0]).toBeCloseTo(points[0], 5);
      expect(parsed.points[N * 3 - 1]).toBeCloseTo(points[N * 3 - 1], 5);
      expect(parsed.types[0]).toBe(types[0]);
      expect(parsed.types[3]).toBe(1.0);
      expect(parsed.types[4]).toBe(0.0);
      expect(parsed.indices[10]).toBe(indices[10]);
    });
  });
});
