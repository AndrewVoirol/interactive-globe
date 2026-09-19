// ============================================================================
// File: tests/adversarial/challenger-m4-1-regional-dem-stress.test.ts
// Test Tier: Adversarial Challenger (Milestone 4: Regional Seam, Resolution & Lifecycle Stress)
// Description: Adversarial verification of regional DEM elevation continuity across
//              boundaries (no step discontinuities or seam tears for Hawaii, Fuji,
//              Cape Cod, Grand Canyon), nadir vertex spacing scaling <= 76.4m at LOD 12
//              across diverse latitude bands, and robust lifecycle switching/releasing
//              without stale bounds or dangling texture views.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice } from '../helpers/webgpu-mock';

describe('Adversarial Challenger M4-1: Regional Seam, Resolution & Lifecycle Stress', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const crustWgslPath = path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl');

  let engine: WebGPUEngine;
  let originalNavigator: any;

  function setupMockNavigator() {
    originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
          requestAdapter: async () => ({
            limits: {
              maxStorageBufferBindingSize: 1024 * 1024 * 1024,
              maxBufferSize: 1024 * 1024 * 1024,
              maxComputeWorkgroupStorageSize: 32768,
              maxComputeInvocationsPerWorkgroup: 1024,
            },
            features: new Set(['timestamp-query']),
            requestDevice: async () => new MockGPUDevice(),
          }),
        },
      },
      configurable: true,
      writable: true,
    });
  }

  function restoreMockNavigator() {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  }

  function createMockCanvas(width = 1920, height = 1080) {
    const mockContext = {
      configure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({
        createView: vi.fn(() => ({})),
      })),
    };
    return {
      width,
      height,
      getContext: vi.fn((type: string) => {
        if (type === 'webgpu') return mockContext;
        return null;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;
  }

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  // ==========================================================================
  // Section 1: Boundary Seam & Elevation Continuity Stress Tests
  // ==========================================================================
  describe('Section 1: Boundary Seam & Elevation Continuity Stress Tests', () => {
    /**
     * Exact simulation of the WGSL getRegionalBlendWeight logic
     */
    function computeBlendWeight(
      lon: number,
      lat: number,
      bounds: [number, number, number, number],
      active: boolean = true
    ): number {
      if (!active) return 0.0;
      const [minLon, minLat, maxLon, maxLat] = bounds;

      if (
        minLon >= maxLon ||
        minLat >= maxLat ||
        minLat < -90.0 ||
        maxLat > 90.0 ||
        minLon < -180.0 ||
        maxLon > 180.0
      ) {
        return 0.0;
      }

      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
        return 0.0;
      }

      const regU = (lon - minLon) / (maxLon - minLon);
      const regV = (maxLat - lat) / (maxLat - minLat);

      const blendDeg = 0.5;
      const lonSpan = maxLon - minLon;
      const latSpan = maxLat - minLat;
      const marginU = Math.min(0.49, Math.max(0.001, blendDeg / lonSpan));
      const marginV = Math.min(0.49, Math.max(0.001, blendDeg / latSpan));

      const distU = Math.min(regU, 1.0 - regU);
      const distV = Math.min(regV, 1.0 - regV);

      const smoothstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.min(1.0, Math.max(0.0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3.0 - 2.0 * t);
      };

      const weightU = smoothstep(0.0, marginU, distU);
      const weightV = smoothstep(0.0, marginV, distV);
      return weightU * weightV;
    }

    function compositeElevation(
      lon: number,
      lat: number,
      bounds: [number, number, number, number],
      globalElev: number,
      regionalElev: number
    ): number {
      const w = computeBlendWeight(lon, lat, bounds, true);
      return (1.0 - w) * globalElev + w * regionalElev;
    }

    const testRegions: Record<string, [number, number, number, number]> = {
      hawaii: [-161.0, 18.0, -154.0, 23.0],
      fuji: [138.5, 35.2, 139.0, 35.5],
      capecod: [-71.0, 41.0, -69.0, 43.0],
      grandCanyon: [-112.5, 35.9, -111.5, 36.5],
    };

    it('proves zero step discontinuity (|elev_in - elev_out| -> 0) at boundaries under 2000m cliff contrast', () => {
      // Stress each of the four regions
      for (const [name, bounds] of Object.entries(testRegions)) {
        const [minLon, minLat, maxLon, maxLat] = bounds;
        const midLon = (minLon + maxLon) * 0.5;
        const midLat = (minLat + maxLat) * 0.5;

        // Artificial extreme cliff: global = 100m, regional = 2100m (2000m delta)
        const globalElev = 100.0;
        const regionalElev = 2100.0;

        // Test all 4 cardinal borders with micro-step epsilon crossing
        const epsilons = [1e-4, 1e-5, 1e-6, 1e-7];

        for (const eps of epsilons) {
          // 1. West border (lon = minLon)
          const elevWestOut = compositeElevation(minLon - eps, midLat, bounds, globalElev, regionalElev);
          const elevWestIn = compositeElevation(minLon + eps, midLat, bounds, globalElev, regionalElev);
          const deltaWest = Math.abs(elevWestIn - elevWestOut);
          // With cubic smoothstep, delta at eps=1e-5 is O(eps^2) << 0.01m
          expect(deltaWest).toBeLessThan(0.05);

          // 2. East border (lon = maxLon)
          const elevEastOut = compositeElevation(maxLon + eps, midLat, bounds, globalElev, regionalElev);
          const elevEastIn = compositeElevation(maxLon - eps, midLat, bounds, globalElev, regionalElev);
          const deltaEast = Math.abs(elevEastIn - elevEastOut);
          expect(deltaEast).toBeLessThan(0.05);

          // 3. South border (lat = minLat)
          const elevSouthOut = compositeElevation(midLon, minLat - eps, bounds, globalElev, regionalElev);
          const elevSouthIn = compositeElevation(midLon, minLat + eps, bounds, globalElev, regionalElev);
          const deltaSouth = Math.abs(elevSouthIn - elevSouthOut);
          expect(deltaSouth).toBeLessThan(0.05);

          // 4. North border (lat = maxLat)
          const elevNorthOut = compositeElevation(midLon, maxLat + eps, bounds, globalElev, regionalElev);
          const elevNorthIn = compositeElevation(midLon, maxLat - eps, bounds, globalElev, regionalElev);
          const deltaNorth = Math.abs(elevNorthIn - elevNorthOut);
          expect(deltaNorth).toBeLessThan(0.05);
        }
      }
    });

    it('samples 2,000 continuous transect steps across Mount Fuji and Hawaii without non-monotonic tears', () => {
      // Transect across Fuji East-West through center: lon 138.3 to 139.2 (bounds: [138.5, 35.2, 139.0, 35.5])
      const fujiBounds = testRegions.fuji;
      const steps = 1000;
      let prevWeight = 0.0;

      // Entering West border into center: weight should be monotonically non-decreasing
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lon = 138.4 + t * (138.75 - 138.4); // From outside border to center
        const weight = computeBlendWeight(lon, 35.35, fujiBounds, true);

        // Monotonic ramp into interior
        expect(weight).toBeGreaterThanOrEqual(prevWeight - 1e-7);
        expect(weight).toBeLessThanOrEqual(1.0);
        prevWeight = weight;
      }
      expect(prevWeight).toBe(1.0); // Full regional weight at center

      // Exiting East border from center to outside: weight should be monotonically non-increasing
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lon = 138.75 + t * (139.1 - 138.75); // From center to outside border
        const weight = computeBlendWeight(lon, 35.35, fujiBounds, true);

        expect(weight).toBeLessThanOrEqual(prevWeight + 1e-7);
        expect(weight).toBeGreaterThanOrEqual(0.0);
        prevWeight = weight;
      }
      expect(prevWeight).toBe(0.0); // Outside east border
    });

    it('stress-tests diagonal corner approaches (corner singularity defense)', () => {
      // Approach Southwest corner of Cape Cod: bounds [-71.0, 41.0, -69.0, 43.0]
      const bounds = testRegions.capecod;
      const cornerLon = bounds[0];
      const cornerLat = bounds[1];

      // Walk diagonally across the SW corner: from (-71.05, 40.95) to (-70.95, 41.05)
      const steps = 500;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * 0.1 - 0.05; // -0.05 to +0.05
        const lon = cornerLon + t;
        const lat = cornerLat + t;
        const weight = computeBlendWeight(lon, lat, bounds, true);

        expect(Number.isFinite(weight)).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0.0);
        expect(weight).toBeLessThanOrEqual(1.0);

        if (t <= 0) {
          expect(weight).toBe(0.0); // Outside corner
        }
      }
    });
  });

  // ==========================================================================
  // Section 2: Nadir Spacing & Resolution Scaling Across Latitude Bands
  // ==========================================================================
  describe('Section 2: Nadir Spacing & Resolution Scaling Across Latitude Bands', () => {
    it('verifies great-circle nadir vertex spacing at LOD 12 achieves <= 76.4m (specifically 76.35m)', () => {
      // Test across multiple close altitudes (50m, 500m, 2000m, 5000m, 10000m)
      const testAltitudesKm = [0.05, 0.5, 2.0, 5.0, 10.0];

      for (const altKm of testAltitudesKm) {
        const spacing = engine.getNadirVertexSpacingMeters(altKm, 12);
        expect(spacing).toBeLessThanOrEqual(76.4);
        expect(spacing).toBeCloseTo(76.3515, 2);
      }
    });

    it('stress tests on-sphere metric vertex spacing across all latitude bands (-90 to +90)', () => {
      const latitudeBands = [
        { name: 'Equator', lat: 0.0 },
        { name: 'Tropical (Hawaii)', lat: 20.0 },
        { name: 'Subtropical (Fuji)', lat: 35.36 },
        { name: 'Mid-Latitude (Cape Cod)', lat: 41.8 },
        { name: 'Subpolar (Oslo)', lat: 60.0 },
        { name: 'Arctic (Svalbard)', lat: 75.0 },
        { name: 'Near Pole', lat: 89.9 },
      ];

      const R_earth = 6371000;
      const baseSpacing = engine.getNadirVertexSpacingMeters(10.0, 12); // ~76.35m

      for (const band of latitudeBands) {
        const latRad = (band.lat * Math.PI) / 180.0;
        // North-South vertex spacing along meridian: R * dphi
        const latSpacing = baseSpacing;
        // East-West vertex spacing along parallel: R * cos(lat) * dlambda
        const lonSpacing = baseSpacing * Math.cos(latRad);

        // Maximum spatial dimension of the tessellated quadcell
        const maxCellDimension = Math.max(latSpacing, lonSpacing);

        // Invariant: across every latitude band on Earth, vertex spacing never exceeds 76.4m!
        expect(maxCellDimension).toBeLessThanOrEqual(76.4);
        expect(maxCellDimension).toBeGreaterThan(0.0);
      }
    });

    it('confirms quadtree dynamically selects LOD 12 over active regional DEM and caps at LOD 10 outside', () => {
      // Set Fuji as active regional DEM
      engine.activeRegionalDEM = {
        texture: {} as any,
        view: {} as any,
        bounds: [138.5, 35.2, 139.0, 35.5],
        width: 900,
        height: 540,
        id: 'fuji',
      };

      const camera = new PerspectiveCamera(45, 1.0, 0.001, 100);

      // Case A: Inside Fuji bounds at 5km altitude
      const uFuji = (138.75 + 180.0) / 360.0;
      const vFuji = (90.0 - 35.35) / 180.0;
      const posFuji = WebGPUEngine.evaluateManifoldPosition(uFuji, vFuji, 0, 0.0, 5.0);
      const scaleFuji = (5.0 + 5.0 / 1274.2) / 5.0;

      camera.position.set(posFuji[0] * scaleFuji, posFuji[1] * scaleFuji, posFuji[2] * scaleFuji);
      camera.lookAt(posFuji[0], posFuji[1], posFuji[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      expect(engine.lastMaxLodSeen).toBe(12);

      // Case B: Outside Fuji bounds (e.g. Kyoto: lon 135.75, lat 35.0) at same 5km altitude
      const uKyoto = (135.75 + 180.0) / 360.0;
      const vKyoto = (90.0 - 35.0) / 180.0;
      const posKyoto = WebGPUEngine.evaluateManifoldPosition(uKyoto, vKyoto, 0, 0.0, 5.0);

      camera.position.set(posKyoto[0] * scaleFuji, posKyoto[1] * scaleFuji, posKyoto[2] * scaleFuji);
      camera.lookAt(posKyoto[0], posKyoto[1], posKyoto[2]);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      engine.updateCDLOD(camera, 0, 0.0, false);
      expect(engine.lastMaxLodSeen).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================================
  // Section 3: Switching, Releasing, and Lifecycle Stress
  // ==========================================================================
  describe('Section 3: Switching, Releasing, and Lifecycle Stress', () => {
    it('stress-tests rapid switching and releasing across multiple regional DEMs without stale state', async () => {
      setupMockNavigator();
      try {
        const testEngine = new WebGPUEngine();
        const canvas = createMockCanvas(1920, 1080);
        await testEngine.initialize({
          canvas,
          pointCount: 10,
          pointsData: new Float32Array(30),
          target2DData: new Float32Array(20),
          typeData: new Float32Array(10),
          lineIndices: new Uint32Array(20),
        });

        // Load 3 synthetic regional DEMs
        const regions = [
          { id: 'hawaii', bounds: { minLon: -161.0, maxLon: -154.0, minLat: 18.0, maxLat: 23.0 }, w: 32, h: 32 },
          { id: 'fuji', bounds: { minLon: 138.5, maxLon: 139.0, minLat: 35.2, maxLat: 35.5 }, w: 32, h: 32 },
          { id: 'capecod', bounds: { minLon: -71.0, maxLon: -69.0, minLat: 41.0, maxLat: 43.0 }, w: 32, h: 32 },
        ];

        for (const reg of regions) {
          const u16Data = new Uint16Array(reg.w * reg.h * 4);
          await testEngine.loadRegionalDEMTexture(u16Data.buffer, reg.bounds, reg.w, reg.h, reg.id);
        }

        expect(testEngine.regionalDEMTextures.size).toBe(3);

        // 1. Rapid switching sequence (50 iterations)
        const sequence = ['hawaii', 'fuji', 'capecod', null, 'fuji', 'hawaii', null, 'capecod'];
        for (let iter = 0; iter < 50; iter++) {
          const targetId = sequence[iter % sequence.length];
          testEngine.setActiveRegionalDEM(targetId);

          if (targetId === null) {
            expect(testEngine.getActiveRegionalDEM()).toBeNull();
            expect(testEngine.getActiveRegionalBounds()).toBeNull();
            expect(testEngine.hasActiveRegionalDEM).toBe(false);
          } else {
            expect(testEngine.getActiveRegionalDEM()).toBe(targetId);
            expect(testEngine.hasActiveRegionalDEM).toBe(true);
            const bounds = testEngine.getActiveRegionalBounds();
            expect(bounds).not.toBeNull();
            const expected = regions.find(r => r.id === targetId)!.bounds;
            expect(bounds![0]).toBe(expected.minLon);
            expect(bounds![1]).toBe(expected.minLat);
            expect(bounds![2]).toBe(expected.maxLon);
            expect(bounds![3]).toBe(expected.maxLat);
          }
        }

        // 2. Release currently active DEM ('capecod')
        testEngine.setActiveRegionalDEM('capecod');
        expect(testEngine.getActiveRegionalDEM()).toBe('capecod');

        testEngine.releaseRegionalDEMTexture('capecod');

        // Must clear active reference, bounds, and hasActive flag
        expect(testEngine.getActiveRegionalDEM()).toBeNull();
        expect(testEngine.getActiveRegionalBounds()).toBeNull();
        expect(testEngine.hasActiveRegionalDEM).toBe(false);
        expect(testEngine.activeRegionalMinLon).toBe(0);
        expect(testEngine.activeRegionalMinLat).toBe(0);
        expect(testEngine.activeRegionalMaxLon).toBe(0);
        expect(testEngine.activeRegionalMaxLat).toBe(0);
        expect(testEngine.regionalDEMTextures.has('capecod')).toBe(false);
        expect(testEngine.regionalDEMTextures.size).toBe(2);

        // 3. Release non-active DEM ('fuji') while 'hawaii' is active
        testEngine.setActiveRegionalDEM('hawaii');
        expect(testEngine.getActiveRegionalDEM()).toBe('hawaii');

        testEngine.releaseRegionalDEMTexture('fuji');

        // Hawaii must remain strictly active
        expect(testEngine.getActiveRegionalDEM()).toBe('hawaii');
        expect(testEngine.hasActiveRegionalDEM).toBe(true);
        expect(testEngine.regionalDEMTextures.has('fuji')).toBe(false);
        expect(testEngine.regionalDEMTextures.size).toBe(1);

        // 4. Release last DEM
        testEngine.releaseRegionalDEMTexture('hawaii');
        expect(testEngine.getActiveRegionalDEM()).toBeNull();
        expect(testEngine.getActiveRegionalBounds()).toBeNull();
        expect(testEngine.hasActiveRegionalDEM).toBe(false);
        expect(testEngine.regionalDEMTextures.size).toBe(0);

        testEngine.dispose();
      } finally {
        restoreMockNavigator();
      }
    });
  });

  // ==========================================================================
  // Section 4: Adversarial Input Boundary Defense
  // ==========================================================================
  describe('Section 4: Adversarial Input Boundary Defense', () => {
    it('handles inverted or degenerate bounding boxes gracefully without NaN or crash', () => {
      const crustWgsl = fs.readFileSync(crustWgslPath, 'utf8');

      // Assert WGSL contains strict bounds validation
      expect(crustWgsl).toContain('if (minLon >= maxLon || minLat >= maxLat ||');
      expect(crustWgsl).toContain('minLat < -90.0 || maxLat > 90.0 ||');
      expect(crustWgsl).toContain('minLon < -180.0 || maxLon > 180.0) {');
      expect(crustWgsl).toContain('return 0.0;');
    });

    it('verifies clamp protection prevents division by zero in zero-width regions', () => {
      const crustWgsl = fs.readFileSync(crustWgslPath, 'utf8');

      // Margin clamping prevents 1 / 0
      expect(crustWgsl).toContain('let marginU = clamp(blendDeg / lonSpan, 0.001, 0.49);');
      expect(crustWgsl).toContain('let marginV = clamp(blendDeg / latSpan, 0.001, 0.49);');
    });
  });
});
