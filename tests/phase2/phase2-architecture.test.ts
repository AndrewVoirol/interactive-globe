// ============================================================================
// File: tests/phase2/phase2-architecture.test.ts
// Unit & Integration Test Suite for Phase 2 Architectural Evolution
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';

import {
  ParadigmRegistry,
  ScientificWireframeParadigm,
  PhotorealisticTerrainParadigm,
  VoxelParadigm,
  LowPolyParadigm,
  TopographicContourParadigm,
  AbstractSculptureParadigm,
  SubstratePipelineConfig,
  SubstrateUniformFrameData,
} from '../../src/core/paradigms';

import {
  GeoTIFFDataSource,
  RasterTileDataSource,
  GeoJSONDataSource,
  VectorFieldDataSource,
  TLETrajectoryDataSource,
  CustomUserDataSource,
  BoundingBox3D,
  getPresetById,
} from '../../src/core/data';

import {
  GlobeLayerManager,
  BaseGlobeOverlayLayer,
  VectorOverlayPluginLayer,
  GeodesicOverlayPluginLayer,
  LayerRenderContext,
} from '../../src/core/layers';

import {
  RTCCamera,
  TrajectoryCameraController,
  FlightControlInputs,
} from '../../src/core/camera';

describe('Phase 2: Universal Substrate & Data Pipeline Abstraction Test Suite', () => {
  // ==========================================================================
  // Section 1: Universal Substrate Engine (IRenderParadigm & Registry)
  // ==========================================================================
  describe('1. Universal Substrate Engine (IRenderParadigm)', () => {
    let registry: ParadigmRegistry;
    const defaultConfig: SubstratePipelineConfig = {
      enableDepthWrite: true,
      enableDepthTest: true,
      blendMode: 'opaque',
      cullMode: 'back',
      wireframeOverlay: false,
      resolutionScale: 1.0,
    };

    beforeEach(() => {
      registry = new ParadigmRegistry();
      registry.registerParadigm(new ScientificWireframeParadigm('webgpu'));
      registry.registerParadigm(new PhotorealisticTerrainParadigm('webgpu'));
      registry.registerParadigm(new VoxelParadigm('webgpu'));
      registry.registerParadigm(new LowPolyParadigm('webgpu'));
      registry.registerParadigm(new TopographicContourParadigm('webgpu'));
      registry.registerParadigm(new AbstractSculptureParadigm('webgpu'));
    });

    it('should register all 6 universal visual substrates', () => {
      const registeredIds = registry.getRegisteredIds();
      expect(registeredIds).toHaveLength(6);
      expect(registeredIds).toContain('scientific');
      expect(registeredIds).toContain('photorealistic');
      expect(registeredIds).toContain('voxel');
      expect(registeredIds).toContain('lowpoly');
      expect(registeredIds).toContain('contour');
      expect(registeredIds).toContain('sculpture');
    });

    it('should initialize and default active paradigm to scientific wireframe', async () => {
      await registry.initialize({}, defaultConfig);
      const active = registry.getActiveParadigm();
      expect(active).not.toBeNull();
      expect(active?.id).toBe('scientific');
    });

    it('should hot-switch substrate in <16ms with persistent buffer binding', async () => {
      await registry.initialize({}, defaultConfig);
      const dummyBuffer = {} as GPUBuffer;

      const switchTime = await registry.switchParadigm('voxel', dummyBuffer);
      expect(switchTime).toBeLessThan(16.0);
      expect(registry.getActiveParadigm()?.id).toBe('voxel');

      const switchBackTime = await registry.switchParadigm('photorealistic');
      expect(switchBackTime).toBeLessThan(16.0);
      expect(registry.getActiveParadigm()?.id).toBe('photorealistic');
    });
  });

  // ==========================================================================
  // Section 2: Heterogeneous Data Ingestion Layer (IDataSource<T>)
  // ==========================================================================
  describe('2. Data Ingestion Layer (IDataSource)', () => {
    const sampleBounds: BoundingBox3D = {
      minLon: -122.5, maxLon: -121.5,
      minLat: 37.0, maxLat: 38.0,
      minAlt: 0, maxAlt: 1000,
    };

    it('GeoTIFFDataSource should fetch NASA EOSDIS raster elevation chunk', async () => {
      const source = new GeoTIFFDataSource();
      await source.connect('https://nasa.eosdis/dem.tif');
      const chunk = await source.fetch(sampleBounds, 10);

      expect(chunk.vertexCount).toBe(256 * 256);
      expect(chunk.attributes.has('elevation')).toBe(true);
      expect(source.getPhysicsField()).not.toBeNull();
    });

    it('RasterTileDataSource should compute tile indices for WMTS pyramids', async () => {
      const source = new RasterTileDataSource();
      await source.connect('https://gee.google/tiles/{z}/{x}/{y}');
      const chunk = await source.fetch(sampleBounds, 5);

      expect(chunk.meta.tileSize).toBe(256);
      expect(chunk.attributes.has('color')).toBe(true);
    });

    it('RasterTileDataSource should fetch multi-tile pyramid coordinates across zoom levels', () => {
      const source = new RasterTileDataSource();
      const pyramidZoom2 = source.fetchTilePyramid(2, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      expect(pyramidZoom2).toHaveLength(16); // 2^2 x 2^2 = 16 tiles
      expect(pyramidZoom2[0].url).toBe('https://tile.openstreetmap.org/2/0/0.png');
      expect(pyramidZoom2[15].url).toBe('https://tile.openstreetmap.org/2/3/3.png');

      const pyramidZoom3 = source.fetchTilePyramid(3, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      expect(pyramidZoom3).toHaveLength(64); // 2^3 x 2^3 = 64 tiles
    });

    it('GeoJSONDataSource should fetch vector boundary attributes', async () => {
      const source = new GeoJSONDataSource();
      const chunk = await source.fetch(sampleBounds, 12);

      expect(chunk.vertexCount).toBe(1000);
      expect(chunk.attributes.has('position')).toBe(true);
    });

    it('VectorFieldDataSource should output physics driver wind vectors', async () => {
      const source = new VectorFieldDataSource();
      const chunk = await source.fetch(sampleBounds, 8);

      expect(chunk.attributes.has('vectorField')).toBe(true);
      const physicsField = source.getPhysicsField();
      expect(physicsField).not.toBeNull();
      expect(physicsField?.length).toBe(64 * 64 * 4);
    });

    it('TLETrajectoryDataSource should calculate SpaceX NORAD satellite orbits', async () => {
      const source = new TLETrajectoryDataSource();
      const chunk = await source.fetch(sampleBounds, 1);

      expect(chunk.vertexCount).toBe(500);
      expect(chunk.attributes.has('position')).toBe(true);
      expect(chunk.attributes.has('velocity')).toBe(true);
    });

    it('CustomUserDataSource should parse custom CSV lat/lon/scalar inputs', async () => {
      const source = new CustomUserDataSource();
      const csvData = `lat,lon,value\n37.77,-122.41,100\n34.05,-118.24,200`;
      source.parseCSV(csvData);

      const chunk = await source.fetch(sampleBounds, 1);
      expect(chunk.vertexCount).toBe(2);
      const pos = chunk.attributes.get('position');
      expect(pos?.[0]).toBeCloseTo(-122.41);
      expect(pos?.[1]).toBeCloseTo(37.77);
      expect(pos?.[2]).toBeCloseTo(100);
    });

    it('DATA_LAYER_CATALOG should contain verified global cartographic datasets', () => {
      const satellitePreset = getPresetById('nasa-blue-marble');
      expect(satellitePreset).toBeDefined();
      expect(satellitePreset?.category).toBe('satellite');
      expect(satellitePreset?.type).toBe('WMTS EPSG:3857');

      const esriPreset = getPresetById('esri-world-imagery');
      expect(esriPreset).toBeDefined();
      expect(esriPreset?.category).toBe('satellite');

      const topoPreset = getPresetById('usgs-topo-map');
      expect(topoPreset).toBeDefined();
      expect(topoPreset?.category).toBe('topo');

      const oceanPreset = getPresetById('global-bathymetry-ocean');
      expect(oceanPreset).toBeDefined();
      expect(oceanPreset?.category).toBe('ocean');
    });
  });

  // ==========================================================================
  // Section 3: Plugin / Layer Architecture (IGlobeLayer & GlobeLayerManager)
  // ==========================================================================
  describe('3. Plugin / Layer Architecture (IGlobeLayer)', () => {
    let manager: GlobeLayerManager;

    beforeEach(() => {
      manager = new GlobeLayerManager();
    });

    it('should attach layers and maintain strict z-index sorting', async () => {
      const baseLayer = new BaseGlobeOverlayLayer();      // order = 10
      const vectorLayer = new VectorOverlayPluginLayer();  // order = 50
      const geodesicLayer = new GeodesicOverlayPluginLayer(); // order = 60

      await manager.addLayer(geodesicLayer);
      await manager.addLayer(baseLayer);
      await manager.addLayer(vectorLayer);

      const all = manager.getAllLayers();
      expect(all[0].id).toBe('base-globe-overlay');
      expect(all[1].id).toBe('vector-overlay-layer');
      expect(all[2].id).toBe('geodesic-overlay-layer');
    });

    it('should handle layer removal and clean disposal', async () => {
      const baseLayer = new BaseGlobeOverlayLayer();
      await manager.addLayer(baseLayer);
      expect(manager.getAllLayers()).toHaveLength(1);

      const removed = await manager.removeLayer(baseLayer.id);
      expect(removed).toBe(true);
      expect(manager.getAllLayers()).toHaveLength(0);
    });

    it('should support synchronous layer visibility, opacity, blend mode, and z-index order mutations', async () => {
      const baseLayer = new BaseGlobeOverlayLayer();
      const vectorLayer = new VectorOverlayPluginLayer();
      await manager.addLayer(baseLayer);
      await manager.addLayer(vectorLayer);

      expect(manager.hasLayer(baseLayer.id)).toBe(true);

      manager.toggleLayerVisibility(baseLayer.id);
      expect(baseLayer.visible).toBe(false);

      manager.setLayerOpacity(baseLayer.id, 0.45);
      expect(baseLayer.opacity).toBeCloseTo(0.45);

      manager.setLayerBlendMode(baseLayer.id, 'additive');
      expect(baseLayer.blendMode).toBe('additive');

      manager.setLayerOrder(baseLayer.id, 100);
      expect(baseLayer.order).toBe(100);

      const all = manager.getAllLayers();
      expect(all[all.length - 1].id).toBe('base-globe-overlay');
    });

    it('should execute multi-pass pipeline compositing without error', async () => {
      await manager.addLayer(new BaseGlobeOverlayLayer());
      await manager.addLayer(new VectorOverlayPluginLayer());

      const mockCtx: LayerRenderContext = {
        viewportWidth: 800,
        viewportHeight: 600,
        camera: new THREE.PerspectiveCamera(),
        frameData: {
          unfurl: 0,
          mode: 0,
          theme: 0,
          time: 1.0,
          dt: 0.016,
          cameraPosition: new THREE.Vector3(0, 0, 15),
          cameraCenter: new THREE.Vector3(0, 0, 0),
          viewMatrix: new THREE.Matrix4(),
          projectionMatrix: new THREE.Matrix4(),
        },
      };

      expect(() => manager.renderComposite(mockCtx)).not.toThrow();
    });
  });

  // ==========================================================================
  // Section 4: Dual Precision RTC & 5-Mode Trajectory Camera System
  // ==========================================================================
  describe('4. Dual Precision RTC & Trajectory Camera System', () => {
    it('RTCCamera should classify altitude regimes accurately', () => {
      const rtc = new RTCCamera();

      // Space altitude (R = 15 => alt = 10)
      rtc.cameraPosition.set(0, 0, 15);
      expect(rtc.getAltitudeRegime().regime).toBe('leo-space');

      // Commercial altitude (alt = 0.01)
      rtc.cameraPosition.set(0, 0, 5.01);
      expect(rtc.getAltitudeRegime().regime).toBe('commercial');

      // Ground altitude (alt = 0.001)
      rtc.cameraPosition.set(0, 0, 5.001);
      expect(rtc.getAltitudeRegime().regime).toBe('ground-level');
    });

    it('RTCCamera should calculate accurate Relative-to-Center (RTC) translation', () => {
      const rtc = new RTCCamera();
      rtc.cameraPosition.set(100, 200, 300);

      const pWorld = new THREE.Vector3(105, 202, 301);
      const pRtc = rtc.computeRTCVector(pWorld);

      expect(pRtc.x).toBeCloseTo(5);
      expect(pRtc.y).toBeCloseTo(2);
      expect(pRtc.z).toBeCloseTo(1);
    });

    it('TrajectoryCameraController should support all 5 kinematic modes', () => {
      const controller = new TrajectoryCameraController();

      controller.setMode('orbital');
      expect(controller.mode).toBe('orbital');

      controller.setMode('free-flight-6dof');
      expect(controller.mode).toBe('free-flight-6dof');

      controller.setMode('follow-path');
      expect(controller.mode).toBe('follow-path');

      controller.setMode('cockpit-hud');
      expect(controller.mode).toBe('cockpit-hud');

      controller.setMode('dolly-cinematic');
      expect(controller.mode).toBe('dolly-cinematic');
    });

    it('TrajectoryCameraController should update 6DOF flight dynamics & compute centripetal banking', () => {
      const controller = new TrajectoryCameraController();
      controller.setMode('free-flight-6dof');

      const inputs: FlightControlInputs = {
        pitchUp: 0.5,
        yawRight: 0.2,
        rollRight: 0.1,
        throttle: 1.0,
      };

      controller.update(0.016, inputs);

      // Verify movement
      expect(controller.velocity.length()).toBeGreaterThan(0);

      // Verify banking calculation
      const bankAngle = controller.computeGeodesicBanking(10.0);
      expect(typeof bankAngle).toBe('number');
      expect(isNaN(bankAngle)).toBe(false);
    });
  });
});
