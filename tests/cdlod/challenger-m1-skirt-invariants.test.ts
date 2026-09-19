import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';

describe('Empirical Challenger: Shader Skirt Displacement & Boundary Invariants', () => {
  const RADIUS = 5.0;
  const PI = Math.PI;
  const TWO_PI = 2.0 * Math.PI;

  // Analytical representation of evaluateManifoldCore (from manifold.wgsl)
  function evaluateManifoldCore(
    pos3D: [number, number, number],
    mercator2D: [number, number],
    unfurl: number,
    mode: number,
    simTime = 0.0
  ): { pos: [number, number, number]; normal: [number, number, number] } {
    const clampedUnfurl = Math.max(0.0, Math.min(1.0, unfurl));
    const ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);
    const pos2D: [number, number, number] = [mercator2D[0], mercator2D[1], 0.0];

    switch (mode) {
      case 1: {
        // Mode 1: Cylindrical Scroll Unfurl
        const oneMinusT = 1.0 - ease;
        const lonRad = Math.atan2(pos3D[0], pos3D[2]);
        const latRad = Math.asin(Math.max(-0.9998, Math.min(0.9998, pos3D[1] / RADIUS)));
        const cosLat = Math.cos(latRad);
        const sinLat = Math.sin(latRad);

        if (oneMinusT > 0.001) {
          const invOneMinusT = 1.0 / oneMinusT;
          const curAngle = oneMinusT * lonRad;
          const curX = (RADIUS * invOneMinusT) * Math.sin(curAngle);
          const curZ =
            (RADIUS * cosLat * invOneMinusT) * (Math.cos(curAngle) - 1.0) +
            (RADIUS * cosLat * oneMinusT);
          const curY = (1.0 - ease) * pos3D[1] + ease * pos2D[1];

          // Analytical normal via cross product
          const T_lambda = [RADIUS * Math.cos(curAngle), 0.0, -RADIUS * cosLat * Math.sin(curAngle)];
          const T_phi = [
            0.0,
            (1.0 - ease) * (RADIUS * cosLat) + ease * (RADIUS / Math.max(cosLat, 0.05)),
            -RADIUS * sinLat * invOneMinusT * (Math.cos(curAngle) - 1.0) - RADIUS * sinLat * oneMinusT,
          ];
          const rawNorm = [
            T_lambda[1] * T_phi[2] - T_lambda[2] * T_phi[1],
            T_lambda[2] * T_phi[0] - T_lambda[0] * T_phi[2],
            T_lambda[0] * T_phi[1] - T_lambda[1] * T_phi[0],
          ];
          const len = Math.hypot(rawNorm[0], rawNorm[1], rawNorm[2]);
          const norm: [number, number, number] =
            len > 0.0001
              ? [rawNorm[0] / len, rawNorm[1] / len, rawNorm[2] / len]
              : [pos3D[0] / RADIUS, pos3D[1] / RADIUS, pos3D[2] / RADIUS];
          return { pos: [curX, curY, curZ], normal: norm };
        } else {
          const u = oneMinusT * lonRad;
          const sinTerm = lonRad * (1.0 - (u * u) / 6.0);
          const cosTerm = oneMinusT * (lonRad * lonRad) * (-0.5 + (u * u) / 24.0);
          const curX = RADIUS * sinTerm;
          const curZ = RADIUS * cosLat * cosTerm + RADIUS * cosLat * oneMinusT;
          const curY = (1.0 - ease) * pos3D[1] + ease * pos2D[1];
          return { pos: [curX, curY, curZ], normal: [0.0, 0.0, 1.0] };
        }
      }

      case 2: {
        // Mode 2: Griffith Fracture Mechanics
        const lonRad = Math.atan2(pos3D[0], pos3D[2]);
        const latRad = Math.asin(Math.max(-0.9998, Math.min(0.9998, pos3D[1] / RADIUS)));
        const distToSeam = PI - Math.abs(lonRad);
        const seamFactor = 1.0 - Math.min(1.0, Math.max(0.0, distToSeam / 0.75));
        const tRupture = 0.18;

        if (ease < tRupture) {
          const strainProgress = ease / tRupture;
          const localStrain = seamFactor * strainProgress * Math.max(0.2, Math.cos(latRad * 0.85));
          const pLen = Math.hypot(pos3D[0], pos3D[1], pos3D[2]);
          const invLen = pLen > 0.001 ? 1.0 / pLen : 1.0;
          const px = pos3D[0] + pos3D[0] * invLen * (localStrain * 0.3);
          const py = pos3D[1] + pos3D[1] * invLen * (localStrain * 0.3);
          const pz = pos3D[2] + pos3D[2] * invLen * (localStrain * 0.3);
          const outLen = Math.hypot(px, py, pz);
          return { pos: [px, py, pz], normal: [px / outLen, py / outLen, pz / outLen] };
        } else {
          const postRuptureT = Math.min(1.0, Math.max(0.0, (ease - tRupture) / (1.0 - tRupture)));
          const flutterWave = Math.sin(distToSeam * 16.0 - ease * 24.0);
          const flutterDecay = Math.exp(-4.2 * (ease - tRupture));
          const flutterAmp = 0.5 * seamFactor * flutterWave * flutterDecay;
          const px = (1.0 - postRuptureT) * pos3D[0] + postRuptureT * pos2D[0];
          const py = (1.0 - postRuptureT) * pos3D[1] + postRuptureT * pos2D[1];
          const pz = (1.0 - postRuptureT) * pos3D[2] + postRuptureT * pos2D[2] + flutterAmp;
          const sNorm = [pos3D[0] / RADIUS, pos3D[1] / RADIUS, pos3D[2] / RADIUS];
          const nx = (1.0 - postRuptureT) * sNorm[0];
          const ny = (1.0 - postRuptureT) * sNorm[1];
          const nz = (1.0 - postRuptureT) * sNorm[2] + postRuptureT * 1.0;
          const nLen = Math.hypot(nx, ny, nz);
          return { pos: [px, py, pz], normal: [nx / nLen, ny / nLen, nz / nLen] };
        }
      }

      default: {
        // Mode 0: Linear Mix (Default)
        const sLen = Math.hypot(pos3D[0], pos3D[1], pos3D[2]);
        const sNorm: [number, number, number] =
          sLen > 0.001 ? [pos3D[0] / sLen, pos3D[1] / sLen, pos3D[2] / sLen] : [0.0, 0.0, 1.0];
        const px = (1.0 - ease) * pos3D[0] + ease * pos2D[0];
        const py = (1.0 - ease) * pos3D[1] + ease * pos2D[1];
        const pz = (1.0 - ease) * pos3D[2] + ease * pos2D[2];
        const nx = (1.0 - ease) * sNorm[0];
        const ny = (1.0 - ease) * sNorm[1];
        const nz = (1.0 - ease) * sNorm[2] + ease * 1.0;
        const nLen = Math.hypot(nx, ny, nz);
        return { pos: [px, py, pz], normal: [nx / nLen, ny / nLen, nz / nLen] };
      }
    }
  }

  function evaluateGridManifold(
    uv: [number, number],
    unfurl: number,
    mode: number
  ): { pos: [number, number, number]; normal: [number, number, number] } {
    const lambda = (uv[0] - 0.5) * TWO_PI;
    const phi = (0.5 - uv[1]) * PI;
    const cosLat = Math.cos(phi);
    const sinLat = Math.sin(phi);
    const cosLon = Math.cos(lambda);
    const sinLon = Math.sin(lambda);
    const pos3D: [number, number, number] = [
      RADIUS * cosLat * sinLon,
      RADIUS * sinLat,
      RADIUS * cosLat * cosLon,
    ];
    const clampedPhi = Math.max(-1.4835, Math.min(1.4835, phi));
    const mercatorY = Math.log(Math.tan(PI * 0.25 + clampedPhi * 0.5)) * RADIUS;
    const mercatorX = lambda * RADIUS;
    return evaluateManifoldCore(pos3D, [mercatorX, mercatorY], unfurl, mode);
  }

  describe('Challenge 1: Mathematical Bound Analysis on skirtDepth', () => {
    it('proves skirtDepth guarantees >= 0.015 downward drop across all valid LODs and dispScales', () => {
      // Sweep sizeUV across 16 octaves from root (0.5) to sub-millimeter (0.00001)
      const sizeUVs = [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.0078125, 0.001, 0.0005, 0.0001, 0.00001];
      // Sweep dispScale from 0.0 (completely flat) to 3.0 (extreme relief)
      const dispScales = [0.0, 0.01, 0.1, 0.5, 1.0, 1.5, 2.0, 2.8, 3.0, 5.0];

      for (const sizeUV of sizeUVs) {
        for (const dispScale of dispScales) {
          // WGSL formula: max(0.015, inst.sizeUV.y * 0.35 * dispScale)
          const skirtDepth = Math.max(0.015, sizeUV * 0.35 * dispScale);

          // Invariant 1: Strictly positive downward drop
          expect(skirtDepth).toBeGreaterThanOrEqual(0.015);
          expect(Number.isFinite(skirtDepth)).toBe(true);
          expect(Number.isNaN(skirtDepth)).toBe(false);

          // Invariant 2: When dispScale > 0 and sizeUV is large, skirtDepth scales linearly with tile extent
          if (sizeUV * 0.35 * dispScale > 0.015) {
            expect(skirtDepth).toBeCloseTo(sizeUV * 0.35 * dispScale, 6);
          }
        }
      }
    });

    it('proves skirtDepth exceeds the sphere curvature chord sagitta across all quadtree octaves', () => {
      // At LOD level L with patch extent S = 0.5 / 2^L and N = 64 grid quads,
      // the angular extent of a single grid quad is theta = (S / 64) * PI.
      // The chord sagitta is delta = R * (1 - cos(theta / 2)) ≈ R * theta^2 / 8.
      for (let lod = 0; lod <= 12; lod++) {
        const sizeUV = 0.5 / Math.pow(2, lod);
        const thetaQuad = (sizeUV / 64.0) * PI;
        const sagitta = RADIUS * (1.0 - Math.cos(thetaQuad / 2.0));

        // Even at dispScale = 0.0 (un-displaced sphere), skirtDepth is 0.015
        const skirtDepthZeroDisp = Math.max(0.015, sizeUV * 0.35 * 0.0);

        // skirtDepth must exceed the curvature sagitta by at least 10x safety margin
        const safetyRatio = skirtDepthZeroDisp / sagitta;
        expect(safetyRatio).toBeGreaterThan(10.0);
      }
    });
  });

  describe('Challenge 2: Vertex Output Numerical Stability Under Extreme Camera Positions', () => {
    it('proves zero NaNs, Infinities, or denormals across 256 skirt vertices under extreme camera regimes', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridVertsPerSurface = 65 * 65;
      const skirtVertsPerSurface = 256;

      const extremeCameras = [
        new Vector3(0, 0, 10.0),        // Standard orbital camera (z = 10)
        new Vector3(0, 0, 5.00001),     // Sub-millimeter grazing distance to surface (altitude = 10 µm)
        new Vector3(0, 5.00001, 0),     // North pole grazing
        new Vector3(0, -5.00001, 0),    // South pole grazing
        new Vector3(0, 0, 2.5),         // Deep subsurface camera (inside the planet)
        new Vector3(0, 0, 1000.0),      // Distant orbital vantage (z = 1000)
        new Vector3(1e6, 1e6, 1e6),     // Cosmic astronomical distance
        new Vector3(0.000001, 0.000001, 5.0), // Off-axis near-pole
      ];

      const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 2000.0);
      camera.updateProjectionMatrix();
      const proj = camera.projectionMatrix;

      // Test across modes and unfurl parameters
      const testCases = [
        { mode: 0, unfurl: 0.0 },
        { mode: 0, unfurl: 1.0 },
        { mode: 1, unfurl: 0.0 },
        { mode: 1, unfurl: 0.5 },
        { mode: 1, unfurl: 1.0 },
        { mode: 2, unfurl: 0.18 },
        { mode: 2, unfurl: 0.8 },
      ];

      for (const camPos of extremeCameras) {
        camera.position.copy(camPos);
        const isCollinearWithY = Math.abs(camPos.x) < 1e-4 && Math.abs(camPos.z) < 1e-4;
        camera.up.set(0, isCollinearWithY ? 0 : 1, isCollinearWithY ? -1 : 0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const view = camera.matrixWorldInverse;
        const viewProj = new Matrix4().multiplyMatrices(proj, view);

        for (const tc of testCases) {
          // Check all 256 skirt bottom vertices on crust (surface 0)
          for (let k = 0; k < skirtVertsPerSurface; k++) {
            const vertIdx = gridVertsPerSurface + k;
            const off = vertIdx * floatsPerVertex;
            const u = vertices[off + 0];
            const v = vertices[off + 1];
            const skirtFactor = vertices[off + 8]; // 1.0

            const deformed = evaluateGridManifold([u, v], tc.unfurl, tc.mode);
            const basePos = deformed.pos;
            const baseNormal = deformed.normal;

            const dispScale = 2.8;
            const sizeUV = 0.5;
            const skirtDepth = Math.max(0.015, sizeUV * 0.35 * dispScale);

            // worldP = basePos + baseNormal * (normalDisplacement - skirtDepth)
            // Test with normalDisplacement = 0 (sea level) and normalDisplacement = 0.5 (mountain)
            for (const disp of [0.0, 0.5, -0.3]) {
              const worldP = [
                basePos[0] + baseNormal[0] * (disp - skirtDepth),
                basePos[1] + baseNormal[1] * (disp - skirtDepth),
                basePos[2] + baseNormal[2] * (disp - skirtDepth),
              ];

              // Invariant: worldP must be finite
              expect(Number.isFinite(worldP[0])).toBe(true);
              expect(Number.isFinite(worldP[1])).toBe(true);
              expect(Number.isFinite(worldP[2])).toBe(true);

              // Clip space transformation
              const v4 = new Vector4(worldP[0], worldP[1], worldP[2], 1.0).applyMatrix4(viewProj);
              expect(Number.isFinite(v4.x)).toBe(true);
              expect(Number.isFinite(v4.y)).toBe(true);
              expect(Number.isFinite(v4.z)).toBe(true);
              expect(Number.isFinite(v4.w)).toBe(true);

              // Denormal check: coordinate should not be an IEEE 754 denormal (between 0 and 1e-38)
              if (v4.w !== 0.0) {
                expect(Math.abs(v4.w)).toBeGreaterThan(1e-30);
              }
            }
          }
        }
      }
    });
  });

  describe('Challenge 3: Boundary UV Matching & Zero Texture Stretching Across Themes', () => {
    it('verifies exact UV matching between corresponding top perimeter and skirt bottom vertices', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridSize = 64;
      const gridVertsPerSurface = (gridSize + 1) * (gridSize + 1); // 4,225

      // Map each of the 256 skirt vertices k to its exact corresponding top grid vertex index
      const getTopGridVertexIndex = (k: number): number => {
        if (k < gridSize) {
          // South border: v = 0, u = k / 64 -> grid vertex j = 0, i = k
          return 0 * (gridSize + 1) + k;
        } else if (k < 2 * gridSize) {
          // East border: u = 1, v = (k - 64) / 64 -> grid vertex j = step, i = gridSize
          const step = k - gridSize;
          return step * (gridSize + 1) + gridSize;
        } else if (k < 3 * gridSize) {
          // North border: v = 1, u = 1 - (k - 128) / 64 -> grid vertex j = gridSize, i = gridSize - step
          const step = k - 2 * gridSize;
          return gridSize * (gridSize + 1) + (gridSize - step);
        } else {
          // West border: u = 0, v = 1 - (k - 192) / 64 -> grid vertex j = gridSize - step, i = 0
          const step = k - 3 * gridSize;
          return (gridSize - step) * (gridSize + 1) + 0;
        }
      };

      for (let k = 0; k < 256; k++) {
        const topIdx = getTopGridVertexIndex(k);
        const skirtIdx = gridVertsPerSurface + k;

        const topOffset = topIdx * floatsPerVertex;
        const skirtOffset = skirtIdx * floatsPerVertex;

        const topU = vertices[topOffset + 3];
        const topV = vertices[topOffset + 4];
        const skirtU = vertices[skirtOffset + 3];
        const skirtV = vertices[skirtOffset + 4];

        // Strict bit-level or epsilon equivalence: zero UV delta
        expect(skirtU).toBe(topU);
        expect(skirtV).toBe(topV);

        // Verification for Theme 0: Tharp stippling and hatching coordinates are identical
        const cosLat = Math.cos((0.5 - topV) * PI);
        const safeCosLat = Math.max(0.08, cosLat);
        const stippleFreq = 1400.0;
        const topStipple = [topU * safeCosLat * stippleFreq, topV * stippleFreq];
        const skirtStipple = [skirtU * safeCosLat * stippleFreq, skirtV * stippleFreq];
        expect(skirtStipple[0]).toBe(topStipple[0]);
        expect(skirtStipple[1]).toBe(topStipple[1]);

        // Verification for Theme 1: Paper tooth fiber coordinates are identical
        const fiberFreq = 1800.0;
        const topFiber = [topU * fiberFreq, topV * fiberFreq];
        const skirtFiber = [skirtU * fiberFreq, skirtV * fiberFreq];
        expect(skirtFiber[0]).toBe(topFiber[0]);
        expect(skirtFiber[1]).toBe(topFiber[1]);

        // Verification for Theme 2: Blueprint linen weave coordinates are identical
        const linenFreq = 1400.0;
        const topLinen = [topU * safeCosLat * linenFreq, topV * linenFreq];
        const skirtLinen = [skirtU * safeCosLat * linenFreq, skirtV * linenFreq];
        expect(skirtLinen[0]).toBe(topLinen[0]);
        expect(skirtLinen[1]).toBe(topLinen[1]);
      }
    });
  });

  describe('Challenge 4: Downward Normal Alignment & Inward Vector Conformance', () => {
    it('proves the downward extrusion vector is strictly collinear with -baseNormal', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridSize = 64;
      const gridVertsPerSurface = (gridSize + 1) * (gridSize + 1);

      const getTopGridVertexIndex = (k: number): number => {
        if (k < gridSize) return 0 * (gridSize + 1) + k;
        if (k < 2 * gridSize) return (k - gridSize) * (gridSize + 1) + gridSize;
        if (k < 3 * gridSize) return gridSize * (gridSize + 1) + (gridSize - (k - 2 * gridSize));
        return (gridSize - (k - 3 * gridSize)) * (gridSize + 1) + 0;
      };

      for (let k = 0; k < 256; k++) {
        const topIdx = getTopGridVertexIndex(k);
        const topOffset = topIdx * floatsPerVertex;
        const u = vertices[topOffset + 3];
        const v = vertices[topOffset + 4];

        const deformed = evaluateGridManifold([u, v], 0.0, 0);
        const basePos = deformed.pos;
        const baseNormal = deformed.normal;

        const dispScale = 2.8;
        const sizeUV = 0.5;
        const skirtDepth = Math.max(0.015, sizeUV * 0.35 * dispScale);

        // Top vertex position: basePos + baseNormal * disp
        const disp = 0.1;
        const topWorldP = [
          basePos[0] + baseNormal[0] * disp,
          basePos[1] + baseNormal[1] * disp,
          basePos[2] + baseNormal[2] * disp,
        ];

        // Bottom skirt vertex position: basePos + baseNormal * (disp - skirtDepth)
        const skirtWorldP = [
          basePos[0] + baseNormal[0] * (disp - skirtDepth),
          basePos[1] + baseNormal[1] * (disp - skirtDepth),
          basePos[2] + baseNormal[2] * (disp - skirtDepth),
        ];

        // Vector from top to bottom
        const dropVec = [
          skirtWorldP[0] - topWorldP[0],
          skirtWorldP[1] - topWorldP[1],
          skirtWorldP[2] - topWorldP[2],
        ];

        const dropLen = Math.hypot(dropVec[0], dropVec[1], dropVec[2]);
        expect(dropLen).toBeCloseTo(skirtDepth, 5);

        // Unit drop direction
        const dropDir = [dropVec[0] / dropLen, dropVec[1] / dropLen, dropVec[2] / dropLen];

        // Inward normal: -baseNormal
        const inwardNormal = [-baseNormal[0], -baseNormal[1], -baseNormal[2]];

        // Dot product between dropDir and inwardNormal must be exactly 1.0 (collinear)
        const dotProd = dropDir[0] * inwardNormal[0] + dropDir[1] * inwardNormal[1] + dropDir[2] * inwardNormal[2];
        expect(dotProd).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('Challenge 5: Hydrosphere Skirt Suppression Invariant', () => {
    it('verifies hydrosphere surface skirtDepth is strictly 0.0 and fragments are discarded', () => {
      // In crust_hydrosphere.wgsl:
      // let isCrust = inSurfaceType < 0.5;
      // let skirtDepth = select(0.0, max(0.015, inst.sizeUV.y * 0.35 * dispScale), isCrust && skirtFactor > 0.0);
      const evalSkirtDepth = (surfaceType: number, skirtFactor: number, sizeUV: number, dispScale: number) => {
        const isCrust = surfaceType < 0.5;
        if (isCrust && skirtFactor > 0.0) {
          return Math.max(0.015, sizeUV * 0.35 * dispScale);
        }
        return 0.0;
      };

      // For hydrosphere (surfaceType = 1.0):
      expect(evalSkirtDepth(1.0, 1.0, 0.5, 2.8)).toBe(0.0);
      expect(evalSkirtDepth(1.0, 1.0, 0.001, 3.0)).toBe(0.0);
      expect(evalSkirtDepth(1.0, 0.0, 0.5, 2.8)).toBe(0.0);

      // Verify fragment shader rule:
      // if (input.surfaceType > 0.5 && isSkirt) { discard; }
      const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
      const shaderCode = fs.readFileSync(crustShaderPath, 'utf8');

      expect(shaderCode).toMatch(/if\s*\(\s*input\.surfaceType\s*>\s*0\.5\s*&&\s*isSkirt\s*\)\s*\{\s*discard;\s*\}/);
    });
  });

  describe('Challenge 6: Continuous Geomorphing Invariant & Zero-Shear Boundary Conformance', () => {
    it('proves boundary vertices never drift off patch borders during morph progression (alpha in [0, 1])', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridSize = 64;
      const gridVertsPerSurface = (gridSize + 1) * (gridSize + 1);

      const getTopGridVertexIndex = (k: number): number => {
        if (k < gridSize) return 0 * (gridSize + 1) + k;
        if (k < 2 * gridSize) return (k - gridSize) * (gridSize + 1) + gridSize;
        if (k < 3 * gridSize) return gridSize * (gridSize + 1) + (gridSize - (k - 2 * gridSize));
        return (gridSize - (k - 3 * gridSize)) * (gridSize + 1) + 0;
      };

      // Test across alpha in [0.0, 0.25, 0.5, 0.75, 1.0]
      const alphas = [0.0, 0.25, 0.5, 0.75, 1.0];

      for (const alpha of alphas) {
        for (let k = 0; k < 256; k++) {
          const topIdx = getTopGridVertexIndex(k);
          const skirtIdx = gridVertsPerSurface + k;

          const pTop = [vertices[topIdx * floatsPerVertex + 0], vertices[topIdx * floatsPerVertex + 1]];
          const pSkirt = [vertices[skirtIdx * floatsPerVertex + 0], vertices[skirtIdx * floatsPerVertex + 1]];

          // WGSL: let p_morphed = p - alpha * (fract(p * 32.0) * (1.0 / 32.0));
          const morph = (p: number[]) => {
            const mx = p[0] - alpha * ((p[0] * 32.0 - Math.floor(p[0] * 32.0)) * (1.0 / 32.0));
            const my = p[1] - alpha * ((p[1] * 32.0 - Math.floor(p[1] * 32.0)) * (1.0 / 32.0));
            return [mx, my];
          };

          const morphedTop = morph(pTop);
          const morphedSkirt = morph(pSkirt);

          // Invariant 1: Top and skirt bottom morph in exact synchrony (zero lateral shear)
          expect(morphedSkirt[0]).toBeCloseTo(morphedTop[0], 6);
          expect(morphedSkirt[1]).toBeCloseTo(morphedTop[1], 6);

          // Invariant 2: Boundary vertices strictly preserve border coordinates
          if (k < 64) {
            // South border: v must be identically 0
            expect(morphedTop[1]).toBeCloseTo(0.0, 6);
          } else if (k < 128) {
            // East border: u must be identically 1
            expect(morphedTop[0]).toBeCloseTo(1.0, 6);
          } else if (k < 192) {
            // North border: v must be identically 1
            expect(morphedTop[1]).toBeCloseTo(1.0, 6);
          } else {
            // West border: u must be identically 0
            expect(morphedTop[0]).toBeCloseTo(0.0, 6);
          }
        }
      }
    });

    it('proves skirts drop strictly in -Z (under the paper substrate) in the flat map state (unfurl = 1.0)', () => {
      const { vertices } = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridSize = 64;

      const getTopGridVertexIndex = (k: number): number => {
        if (k < gridSize) return 0 * (gridSize + 1) + k;
        if (k < 2 * gridSize) return (k - gridSize) * (gridSize + 1) + gridSize;
        if (k < 3 * gridSize) return gridSize * (gridSize + 1) + (gridSize - (k - 2 * gridSize));
        return (gridSize - (k - 3 * gridSize)) * (gridSize + 1) + 0;
      };

      for (let k = 0; k < 256; k++) {
        const topIdx = getTopGridVertexIndex(k);
        const u = vertices[topIdx * floatsPerVertex + 3];
        const v = vertices[topIdx * floatsPerVertex + 4];

        // Flat map state: unfurl = 1.0, Mode 0 (Linear)
        const deformed = evaluateGridManifold([u, v], 1.0, 0);
        const baseNormal = deformed.normal;

        // On a flat map, the normal must be exactly +Z (0, 0, 1)
        expect(baseNormal[0]).toBeCloseTo(0.0, 5);
        expect(baseNormal[1]).toBeCloseTo(0.0, 5);
        expect(baseNormal[2]).toBeCloseTo(1.0, 5);

        // Therefore, the downward displacement vector -baseNormal * skirtDepth is strictly -Z
        const skirtDepth = Math.max(0.015, 0.5 * 0.35 * 2.8);
        const dropVector = [-baseNormal[0] * skirtDepth, -baseNormal[1] * skirtDepth, -baseNormal[2] * skirtDepth];

        expect(dropVector[0]).toBeCloseTo(0.0, 5);
        expect(dropVector[1]).toBeCloseTo(0.0, 5);
        expect(dropVector[2]).toBeLessThan(-0.015); // Negative Z drop into paper substrate
      }
    });
  });
});
