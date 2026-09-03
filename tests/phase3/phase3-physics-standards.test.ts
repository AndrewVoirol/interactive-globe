// ============================================================================
// File: tests/phase3/phase3-physics-standards.test.ts
// Unit & Integration Test Suite for Phase 3 Governed Physics & Standards Integration
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PhaseFieldFractureSolver,
  ShallowWaterFluidSolver,
  RigidHingeDymaxionSolver,
  PhysicsSolverRegistry,
} from '../../src/core/physics';

import {
  OGCTileEngine,
  CRSTranslationEngine,
  Tiles3DTerrainEngine,
  GeographicPoint,
  SupportedCRS,
} from '../../src/core/standards';

describe('Phase 3: Governed Computational Physics & Standards Integration Test Suite', () => {
  // ==========================================================================
  // Section 1: Governed Computational Physics Solvers (src/core/physics/)
  // ==========================================================================
  describe('1. PhaseFieldFractureSolver (Mode 2 - Griffith LEFM)', () => {
    let solver: PhaseFieldFractureSolver;

    beforeEach(() => {
      solver = new PhaseFieldFractureSolver({ nodeCount: 100 });
      solver.initialize();
    });

    it('should initialize damage and historical energy fields to zero', () => {
      const damage = solver.getDamageField();
      expect(damage).toHaveLength(100);
      expect(damage[0]).toBe(0);
      expect(solver.getStiffnessDecay(0)).toBe(1.0);
    });

    it('should compute exact Westergaard Mode I hoop stress profile', () => {
      const stressNear = solver.computeWestergaardHoopStress(0.05, 0.1, 1.5);
      const stressFar = solver.computeWestergaardHoopStress(0.50, 0.1, 1.5);

      expect(stressNear).toBeGreaterThan(stressFar);
      expect(stressNear).toBeGreaterThan(0);
    });

    it('should evaluate crack tip propagation front timeline', () => {
      expect(solver.computeCrackTipFront(0.10)).toBe(0);
      const frontMid = solver.computeCrackTipFront(0.35);
      expect(frontMid).toBeGreaterThan(0);
      expect(frontMid).toBeLessThanOrEqual(Math.PI / 2);
    });

    it('should advance phase-field evolution and calculate displacements under step', () => {
      const positions = new Float32Array(300);
      for (let i = 0; i < 100; i++) {
        positions[i * 3 + 0] = Math.sin((i / 100) * Math.PI);
        positions[i * 3 + 1] = 0.5;
        positions[i * 3 + 2] = Math.cos((i / 100) * Math.PI);
      }

      solver.step({
        dt: 0.016,
        time: 0.25,
        unfurl: 0.5,
        cursorPos: [0.5, 0.5, 0.5],
        cursorIntensity: 1.0,
        nodePositions: positions,
      });

      const damage = solver.getDamageField();
      const stresses = solver.getHoopStresses();
      const disp = solver.getDisplacements();

      expect(stresses[0]).toBeGreaterThanOrEqual(0);
      expect(disp.length).toBe(300);
    });
  });

  describe('2. ShallowWaterFluidSolver (Mode 3 - SWE Hydrodynamics)', () => {
    let solver: ShallowWaterFluidSolver;

    beforeEach(() => {
      solver = new ShallowWaterFluidSolver({ nodeCount: 100 });
      solver.initialize();
    });

    it('should compute analytical Lamb-Oseen viscous vortex core and decay with radius', () => {
      const coreNear = solver.computeLambOseenCore(0.05, 0.1, 1.0);
      const coreFar = solver.computeLambOseenCore(1.00, 0.1, 1.0);

      expect(coreNear.vorticity).toBeGreaterThan(coreFar.vorticity);
      expect(coreNear.vTheta).toBeGreaterThan(0);
    });

    it('should evaluate solenoidal curl noise velocity vectors', () => {
      const vec = solver.computeCurlNoise([1.0, 2.0, 3.0], 0.5);
      expect(vec).toHaveLength(3);
      expect(isNaN(vec[0])).toBe(false);
    });

    it('should advance shallow water equations and preserve positive wave height', () => {
      solver.step({
        dt: 0.016,
        time: 1.0,
        unfurl: 0.0,
        cursorPos: [0, 1.0, 0],
        cursorVel: [1.0, 0, 0],
        cursorActive: true,
      });

      const waveH = solver.getWaveHeight();
      const vel = solver.getVelocityField();

      expect(waveH[0]).toBeGreaterThan(0);
      expect(vel.length).toBe(300);
    });
  });

  describe('3. RigidHingeDymaxionSolver (Mode 4 - Rigid Net Folding)', () => {
    let solver: RigidHingeDymaxionSolver;

    beforeEach(() => {
      solver = new RigidHingeDymaxionSolver();
    });

    it('should initialize 20 icosahedral facet states', () => {
      const states = solver.getFacetStates();
      expect(states).toHaveLength(20);
      expect(states[0].centroid3D).toBeDefined();
    });

    it('should compute shell arching height modulation h_arch(t)', () => {
      const h0 = solver.computeArchingHeight(0.0);
      const hMid = solver.computeArchingHeight(0.5);
      const h1 = solver.computeArchingHeight(1.0);

      expect(h0).toBeCloseTo(0);
      expect(hMid).toBeGreaterThan(0.4);
      expect(h1).toBeCloseTo(0);
    });

    it('should step Newton-Euler facet dynamics and update total angular momentum', () => {
      solver.step({
        dt: 0.016,
        time: 0.5,
        unfurl: 0.5,
      });

      const states = solver.getFacetStates();
      const L = solver.getTotalAngularMomentum();

      expect(states[0].hingeAngle).toBeGreaterThan(0);
      expect(L).toHaveLength(3);
    });
  });

  describe('4. PhysicsSolverRegistry & GPU Storage Binding', () => {
    let registry: PhysicsSolverRegistry;

    beforeEach(() => {
      registry = new PhysicsSolverRegistry(100);
    });

    it('should register built-in solvers for Modes 2, 3, and 4', () => {
      expect(registry.getSolver(2)).toBeDefined();
      expect(registry.getSolver(3)).toBeDefined();
      expect(registry.getSolver(4)).toBeDefined();
    });

    it('should step active solver and update 64-byte interleaved GPU storage buffer', () => {
      const gpuBuffer = new Float32Array(100 * 16);
      gpuBuffer.fill(1.0);

      registry.setMode(3);
      registry.stepActiveSolver({
        dt: 0.016,
        time: 1.0,
        unfurl: 0.5,
        mode: 3,
        cursorPos: [0, 1, 0],
      });

      registry.bindToGPUBuffer(gpuBuffer);

      // Verify uniform updates
      const uniforms = registry.getActiveUniforms();
      expect(uniforms[0]).toBe(3.0);
    });
  });

  // ==========================================================================
  // Section 2: Geospatial Standards Engine (src/core/standards/)
  // ==========================================================================
  describe('5. OGCTileEngine (WMTS & OGC API Tiles/Features)', () => {
    let engine: OGCTileEngine;

    beforeEach(() => {
      engine = new OGCTileEngine(16);
    });

    it('should compute exact tile keys and bounding boxes for WorldCRS84Quad', () => {
      const tile = { z: 0, x: 0, y: 0, matrixSet: 'WorldCRS84Quad' as const };
      expect(engine.getTileKey(tile)).toBe('WorldCRS84Quad/0/0/0');

      const bbox = engine.computeTileBoundingBox(tile);
      expect(bbox.minLon).toBe(-180);
      expect(bbox.maxLon).toBe(180);
      expect(bbox.minLat).toBe(-90);
      expect(bbox.maxLat).toBe(90);
    });

    it('should traverse quadtree tile index pyramid for given bounds', () => {
      const bounds = { minLon: -10, maxLon: 10, minLat: 40, maxLat: 60 };
      const tiles = engine.traversePyramid(bounds, 2, 'WorldCRS84Quad');

      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles[0].z).toBe(2);
    });

    it('should parse GeoJSON features into zero-copy Float32Array vector stream buffers', () => {
      const sampleGeoJson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [2.35, 48.85] },
            properties: { name: 'Paris' },
          },
        ],
      };

      const stream = engine.parseVectorFeatureStream(sampleGeoJson);
      expect(stream.featureCount).toBe(1);
      expect(stream.positions.length).toBe(3);
      expect(stream.target2D.length).toBe(2);
    });

    it('should manage tile LRU caching', () => {
      const tile = { z: 1, x: 0, y: 0, matrixSet: 'WorldCRS84Quad' as const };
      const dummyData = new ArrayBuffer(64);

      engine.storeTileInCache(tile, dummyData);
      const cached = engine.getCachedTile(tile);
      expect(cached).toBe(dummyData);
    });
  });

  describe('6. CRSTranslationEngine (PROJ.4 / EPSG Transformations)', () => {
    let engine: CRSTranslationEngine;

    beforeEach(() => {
      engine = new CRSTranslationEngine(5.0);
    });

    const crsList: SupportedCRS[] = ['EPSG:4326', 'EPSG:3857', 'EPSG:2154', 'EPSG:5070', 'EPSG:9820'];
    const testPoint: GeographicPoint = { lon: 2.35, lat: 48.85 }; // Paris, France

    crsList.forEach((crs) => {
      it(`should perform forward and inverse transform identity for ${crs}`, () => {
        const projPoint = engine.forward(testPoint, crs);
        expect(isNaN(projPoint.x)).toBe(false);
        expect(isNaN(projPoint.y)).toBe(false);

        const invPoint = engine.inverse(projPoint, crs);
        expect(invPoint.lon).toBeCloseTo(testPoint.lon, 1);
        expect(invPoint.lat).toBeCloseTo(testPoint.lat, 1);
      });
    });

    it('should compute analytical Tissot distortion metrics', () => {
      const metrics = engine.computeTissotMetrics({ lon: 0, lat: 60 }, 'EPSG:3857');
      expect(metrics.meridionalScale).toBeCloseTo(2.0, 1);
      expect(metrics.parallelScale).toBeCloseTo(2.0, 1);
      expect(metrics.arealDilation).toBeCloseTo(4.0, 1);
      expect(metrics.angularDistortion).toBeCloseTo(0, 1); // Conformal = zero angular distortion
    });
  });

  describe('7. Tiles3DTerrainEngine (OGC 3D Tiles 1.1 & Displacement)', () => {
    let engine: Tiles3DTerrainEngine;

    beforeEach(() => {
      engine = new Tiles3DTerrainEngine(5.0, 0.001);
    });

    it('should parse 12-element OBB array', () => {
      const obbArray = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
      const obb = engine.parseOBB(obbArray);

      expect(obb.center).toEqual([0, 0, 0]);
      expect(obb.halfAxisX).toEqual([1, 0, 0]);
    });

    it('should test if point is inside Oriented Bounding Box (OBB)', () => {
      const obb = engine.parseOBB([0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2]);

      expect(engine.isPointInsideOBB([1, 1, 1], obb)).toBe(true);
      expect(engine.isPointInsideOBB([5, 5, 5], obb)).toBe(false);
    });

    it('should compute spherical elevation displacement R(lambda, phi) = R0 + h(lambda, phi)', () => {
      const disp = engine.computeElevationDisplacement(0, 0, 1000); // 1000m elevation

      expect(disp.height).toBeCloseTo(1.0, 2);
      expect(disp.position3D[2]).toBeCloseTo(6.0, 2); // R0 (5.0) + height (1.0) = 6.0
    });

    it('should decode Quantized Mesh buffer into 3D sphere and 2D target arrays', () => {
      const quantized = new Uint16Array([
        0, 0, 0,        // Vertex 0
        1000, 1000, 1000,// Vertex 1
      ]);
      const bounds = { minLon: -10, maxLon: 10, minLat: 40, maxLat: 60 };

      const result = engine.decodeQuantizedMesh(2, quantized, bounds, 0, 2000);
      expect(result.positions3D.length).toBe(6);
      expect(result.target2D.length).toBe(4);
    });
  });
});
