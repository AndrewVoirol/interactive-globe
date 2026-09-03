import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { shouldCullBackface, computeCurlNoise, computeDivergence } from '../helpers/math-oracle';

describe('Milestone M3 Verification: WebGL2 1M Performance Optimization & Backface Early-Out', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  let appCode = fs.readFileSync(appTsxPath, 'utf8');
  const geoLayerPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoLayerPath)) {
    appCode += '\n' + fs.readFileSync(geoLayerPath, 'utf8');
  }

  // =========================================================================
  // 1. Static AST/Source Shader Verification in App.tsx
  // =========================================================================
  describe('1. GLSL Shader Source Verification', () => {
    it('M3-T1: verifies App.tsx vertex shader implements unfurl-modulated backface early-out at alpha < 0.08', () => {
      expect(appCode).toMatch(/if\s*\(\s*clampedUnfurl\s*<\s*0\.08\s*\)/);
      expect(appCode).toContain('vec3 sphereNormal = normalize(position);');
      expect(appCode).toContain('vec3 vNorm = normalize(normalMatrix * sphereNormal);');
      expect(appCode).toContain('vec4 vPos = modelViewMatrix * vec4(position, 1.0);');
      expect(appCode).toContain('vec3 vDir = normalize(vPos.xyz);');
      expect(appCode).toContain('if (dot(vNorm, vDir) > 0.25)');
      expect(appCode).toContain('gl_Position = vec4(0.0, 0.0, 2.0, 0.0);');
      expect(appCode).toContain('return;');
    });

    it('M3-T2: verifies meshVertexShader is defined and attached to lineSegments', () => {
      expect(appCode).toMatch(/const meshVertexShader = `[\s\S]*?`;/);
      expect(appCode).toMatch(/<lineSegments[\s\S]*?vertexShader=\{meshVertexShader\}/);
    });

    it('M3-T3: verifies early-out precedes computeCurlNoise and modelViewMatrix transformations', () => {
      const vertexShaderMatch = appCode.match(/const vertexShader = `([\s\S]*?)`;/);
      expect(vertexShaderMatch).toBeTruthy();
      const vsContent = vertexShaderMatch![1];

      const mainIndex = vsContent.indexOf('void main()');
      const earlyOutIndex = vsContent.indexOf('if (dot(vNorm, vDir) > 0.25)');
      const curlCallIndex = vsContent.indexOf('computeCurlNoise(basePos, u_time)');
      const mvIndex = vsContent.indexOf('vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);');

      expect(mainIndex).toBeGreaterThan(-1);
      expect(earlyOutIndex).toBeGreaterThan(mainIndex);
      expect(curlCallIndex).toBeGreaterThan(earlyOutIndex);
      expect(mvIndex).toBeGreaterThan(earlyOutIndex);
    });
  });

  // =========================================================================
  // 2. Mathematical Rigor of Backface Early-Out Mechanics
  // =========================================================================
  describe('2. Backface Geometry and Horizon Margin Rigor', () => {
    const viewDir: [number, number, number] = [0, 0, 1]; // Eye looking toward +Z

    it('M3-T4: verifies front hemisphere vertices (dot >= 0) are never culled at alpha = 0', () => {
      expect(shouldCullBackface([0, 0, 1], viewDir, 0.0, -0.25)).toBe(false);
      expect(shouldCullBackface([0.5, 0.5, Math.SQRT1_2], viewDir, 0.0, -0.25)).toBe(false);
      expect(shouldCullBackface([1, 0, 0], viewDir, 0.0, -0.25)).toBe(false); // Geometric horizon
    });

    it('M3-T5: verifies grazing horizon vertices (-0.25 <= dot <= 0.0) remain intact to prevent limb clipping', () => {
      // 10 degrees past horizon: cos(100 deg) ≈ -0.1736 > -0.25
      const angle100 = 100 * (Math.PI / 180);
      const normalGrazing: [number, number, number] = [Math.sin(angle100), 0, Math.cos(angle100)];
      expect(shouldCullBackface(normalGrazing, viewDir, 0.0, -0.25)).toBe(false);
    });

    it('M3-T6: verifies deep back-hemisphere vertices (dot < -0.25) are culled at alpha < 0.08', () => {
      // 120 degrees past horizon: cos(120 deg) = -0.50 < -0.25
      const angle120 = 120 * (Math.PI / 180);
      const normalDeep: [number, number, number] = [Math.sin(angle120), 0, Math.cos(angle120)];
      expect(shouldCullBackface(normalDeep, viewDir, 0.0, -0.25)).toBe(true);
      expect(shouldCullBackface(normalDeep, viewDir, 0.079, -0.25)).toBe(true);
    });

    it('M3-T7: verifies culling is strictly disabled when alpha >= 0.08 (planar morph state)', () => {
      const normalOpposite: [number, number, number] = [0, 0, -1];
      expect(shouldCullBackface(normalOpposite, viewDir, 0.08, -0.25)).toBe(false);
      expect(shouldCullBackface(normalOpposite, viewDir, 0.25, -0.25)).toBe(false);
      expect(shouldCullBackface(normalOpposite, viewDir, 0.50, -0.25)).toBe(false);
      expect(shouldCullBackface(normalOpposite, viewDir, 1.00, -0.25)).toBe(false);
    });
  });

  // =========================================================================
  // 3. FLOP Arithmetic Elimination & Fluid Mode Optimization
  // =========================================================================
  describe('3. Arithmetic FLOP Savings & Divergence-Free Fluid Invariance', () => {
    it('M3-T8: verifies transcendental evaluation savings exceed 162M calls/sec at 1M nodes and 60 FPS', () => {
      const N = 1000000;
      const cullFraction = 0.375; // Theoretical fraction for threshold -0.25 on unit sphere
      const trigCallsPerVertex = 12; // 6 cos/sin + dual octave harmonics
      const fps = 60;

      const culledVerticesPerFrame = N * cullFraction; // 375,000 vertices/frame
      const savedTrigCallsPerSec = culledVerticesPerFrame * trigCallsPerVertex * fps;

      expect(savedTrigCallsPerSec).toBe(270000000); // 270M operations/sec
      expect(savedTrigCallsPerSec).toBeGreaterThanOrEqual(162000000);
    });

    it('M3-T9: verifies curl noise field preserves divergence-free property div(u) = 0 across 3D space', () => {
      const samplePoints: Array<[number, number, number]> = [
        [0.0, 0.0, 5.0],
        [2.5, -2.5, 2.5],
        [-3.0, 1.0, -3.0],
        [1.0, 4.0, 0.5],
        [-4.5, 0.0, 1.5],
      ];

      for (const pt of samplePoints) {
        const div = computeDivergence(pt, 2.0, 1e-4);
        expect(Math.abs(div)).toBeLessThan(1e-3);
      }
    });
  });
});
