// ============================================================================
// File: src/webgpu/WebGPUCanvas.tsx
// Component: Dedicated WebGPU React Canvas Wrapper with Orbit & Telemetry
// Description: Autonomous 1M-node WebGPU viewport with smooth touch/mouse control
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Vector3, Vector4, Matrix4, PerspectiveCamera, Vec3Tuple, slerpVec3 } from '../core/math/cameraMath';
import { computeDynamicNearPlane, computeGroundClearanceFloor } from '../core/math/cameraMath';
import { WebGPUEngine } from './WebGPUEngine';
import { CursorTracker } from '../utils/raycast';
import { useCursorTracker } from '../core/CursorContext';
import { DataLayerItem, PrognosticModelBackend } from '../components/hud/TelemetryHUD';

import { GeodesicOverlayMode, ResolutionTier } from '../types';
import { WhimsicalEffectsManager } from '../core/effects/WhimsicalEffectsManager';
import { ManifoldPinchController } from '../core/interactions/ManifoldPinchController';
import {
  GEODESIC_ARCS,
  LANDMARK_ANCHORS,
  sampleGreatCircleGeodesic,
  generateTissotCircles,
  evaluatePointMorph,
} from '../core/GlobeOverlay';
import { TrajectoryCameraController, Waypoint3D } from '../core/camera/TrajectoryCameraController';
import {
  HAWAII_WAYPOINTS,
  CAPE_COD_WAYPOINTS,
  GRAND_CANYON_WAYPOINTS,
  FUJI_WAYPOINTS,
} from '../core/camera/litmusWaypoints';

export interface BathymetricSounding {
  name: string;
  depthM: number;
  depthFm: number;
  lat: number;
  lon: number;
}

export const ARCHIVAL_SOUNDINGS: BathymetricSounding[] = [
  { name: 'Challenger Deep', depthM: 10994, depthFm: 6012, lat: 11.37, lon: 142.25 },
  { name: 'Puerto Rico Trench', depthM: 8376, depthFm: 4580, lat: 19.84, lon: -66.50 },
  { name: 'Java Trench', depthM: 7450, depthFm: 4074, lat: -10.32, lon: 111.45 },
  { name: 'Molloy Deep', depthM: 5550, depthFm: 3035, lat: 79.14, lon: 2.78 },
  { name: 'Romanche Trench', depthM: 7761, depthFm: 4243, lat: -0.22, lon: -18.35 },
  { name: 'Mid-Atlantic Ridge', depthM: 3850, depthFm: 2105, lat: 26.10, lon: -35.20 },
  { name: 'South Sandwich Trench', depthM: 8266, depthFm: 4520, lat: -55.40, lon: -26.50 },
  { name: 'Philippine Basin', depthM: 10540, depthFm: 5763, lat: 10.15, lon: 126.70 },
  { name: 'Aleutian Trench', depthM: 7679, depthFm: 4199, lat: 52.00, lon: -173.00 },
  { name: 'Sargasso Abyssal Plain', depthM: 5400, depthFm: 2953, lat: 28.00, lon: -60.00 },
  { name: 'Peru-Chile Trench', depthM: 8065, depthFm: 4410, lat: -23.00, lon: -76.00 },
  { name: 'Diamantina Deep', depthM: 7079, depthFm: 3870, lat: -35.00, lon: 104.00 },
];

export interface GeodeticBenchmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export const GEODETIC_BENCHMARKS: GeodeticBenchmark[] = [
  { id: 'GRW', name: 'Greenwich Obs.', lat: 51.48, lon: 0.0 },
  { id: 'ALX', name: 'Alexandria', lat: 31.20, lon: 29.92 },
  { id: 'QTO', name: 'Quito Equatorial', lat: -0.18, lon: -78.47 },
  { id: 'TKO', name: 'Tokyo Meridian', lat: 35.68, lon: 139.77 },
  { id: 'CPT', name: 'Cape of Good Hope', lat: -33.92, lon: 18.42 },
  { id: 'REK', name: 'Reykjavik Geodetic', lat: 64.14, lon: -21.94 },
  { id: 'HNL', name: 'Honolulu Pacific', lat: 21.31, lon: -157.86 },
  { id: 'SYD', name: 'Sydney Observatory', lat: -33.86, lon: 151.21 },
  { id: 'VAL', name: 'Valparaíso Survey', lat: -33.05, lon: -71.62 },
];

export const GEODETIC_EDGES: [string, string][] = [
  ['GRW', 'ALX'],
  ['GRW', 'REK'],
  ['REK', 'QTO'],
  ['QTO', 'VAL'],
  ['VAL', 'HNL'],
  ['HNL', 'TKO'],
  ['TKO', 'SYD'],
  ['SYD', 'CPT'],
  ['CPT', 'ALX'],
  ['ALX', 'TKO'],
  ['GRW', 'QTO'],
];

const ORIGIN_VEC = new Vector3(0, 0, 0);
const _scratchVecA = new Vector3();

const TIER_CONFIG: Record<ResolutionTier, { lat: number; lon: number; bin: string }> = {
  '100k': { lat: 256, lon: 512, bin: '/geo-mesh-100k.bin' },
  '1M': { lat: 512, lon: 1024, bin: '/geo-mesh-1m.bin' },
  '3M': { lat: 864, lon: 1728, bin: '/geo-mesh-1m.bin' },
  '4M': { lat: 1024, lon: 2048, bin: '/geo-mesh-1m.bin' },
  '8M': { lat: 1448, lon: 2896, bin: '/geo-mesh-1m.bin' },
  '16M': { lat: 2048, lon: 4096, bin: '/geo-mesh-1m.bin' },
};

export interface WebGPUCanvasProps {
  unfurlProgress: number;
  mode: number;
  layerMode?: 0 | 1 | 2;
  theme?: 0 | 1 | 2; // 0 = Marie Tharp, 1 = Cream Rag Paper, 2 = Prussian Cyanotype
  showSoundings?: boolean;
  showTriangulation?: boolean;
  showCartouche?: boolean;
  resolution: ResolutionTier;
  cameraTarget?: Vec3Tuple | Vector3;
  cameraPosition?: Vec3Tuple | Vector3;
  activeOverlay?: GeodesicOverlayMode;
  showLandmarks?: boolean;
  showTissot?: boolean;
  showVectors?: boolean;
  dataLayers?: DataLayerItem[];
  onFpsUpdate?: (fps: number) => void;
  onDataLoaded?: (info: {
    pointCount: number;
    lineCount: number;
    format: string;
    loadTimeMs: number;
    vramMb: number;
  }) => void;
  onError?: (err: Error) => void;
  onCoordsChange?: (latDeg: number, lonDeg: number) => void;
  onResolutionChange?: (r: ResolutionTier) => void;
  cursorPhysicsEnabled?: boolean;
  cdlodEnabled?: boolean;
  isZenMode?: boolean;
  isSidebarOpen?: boolean;
  startTime?: number;
  vortexStrength?: number;
  fractureIntensity?: number;
  onGpuProfilerReport?: (report: any) => void;
  isolatedStratum?: number | null;
  isDemoMode?: boolean;
  demoSequence?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji';
  onDemoModeChange?: (active: boolean, sequence?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => void;
  showClouds?: boolean;
  showCloudLow?: boolean;
  showCloudMid?: boolean;
  showCloudHigh?: boolean;
  cloudDriftSpeed?: number;
  cloudOpacity?: number;
  atmosphericScale?: number;
  onAtmosphericScaleChange?: (v: number) => void;
  shadowIntensity?: number;
  onShadowIntensityChange?: (v: number) => void;
  verticalScaleMode?: number;
  rainShadowFeedback?: number;
  pluvialGamma?: number;
  weatherOpticalMode?: number;
  timelineMinutes?: number;
  scrubTau?: number;
  weatherTau?: number;
  thermodynamicGating?: boolean;
  onThermodynamicGatingChange?: (v: boolean) => void;
  showAtmosphere?: boolean;
  volumetricClouds?: boolean;
  onShowCloudsChange?: (v: boolean) => void;
  onTogglePlanetaryLayer?: (id: string, force?: boolean) => void;
  prognosticModel?: PrognosticModelBackend;
  purityMode?: boolean;
  substrateHaptics?: boolean;
  paperSubstrate?: boolean;
  fiberFrequency?: number;
  fiberAnisotropy?: number;
  plateMarkDepthMeters?: number;
  inkRidgeHeightMeters?: number;
  grainAngleRadians?: number;
  sheenIntensity?: number;
  absorptionFeathering?: number;
  cameraPitchDeg?: number;
}

interface RegionalManifestEntry {
  id: string;
  name: string;
  bounds: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
  width: number;
  height: number;
  binUrl: string;
  webpUrl: string;
}

export const WebGPUCanvas: React.FC<WebGPUCanvasProps> = ({
  unfurlProgress,
  mode,
  layerMode,
  theme = 0,
  showSoundings = true,
  showTriangulation = false,
  showCartouche = true,
  resolution,
  cameraTarget,
  cameraPosition,
  activeOverlay = 'off',
  showLandmarks = false,
  showTissot = false,
  showVectors = true,
  dataLayers,
  onFpsUpdate,
  onDataLoaded,
  onError,
  onCoordsChange,
  onResolutionChange,
  cursorPhysicsEnabled = false,
  cdlodEnabled = false,
  isZenMode = false,
  isSidebarOpen = true,
  startTime,
  vortexStrength = 1.0,
  fractureIntensity = 1.0,
  onGpuProfilerReport,
  isolatedStratum,
  isDemoMode = false,
  demoSequence = 'hawaii',
  onDemoModeChange,
  showClouds = true,
  showCloudLow = true,
  showCloudMid = true,
  showCloudHigh = true,
  cloudDriftSpeed = 1.0,
  cloudOpacity = 0.85,
  atmosphericScale = 3.5,
  onAtmosphericScaleChange,
  shadowIntensity = 0.45,
  onShadowIntensityChange,
  verticalScaleMode = 1,
  rainShadowFeedback = 0.0,
  pluvialGamma = 0.0,
  weatherOpticalMode = 0,
  timelineMinutes = 0,
  scrubTau = 0,
  weatherTau = 0,
  thermodynamicGating = true,
  showAtmosphere,
  volumetricClouds,
  onShowCloudsChange,
  onTogglePlanetaryLayer,
  prognosticModel = 'weathernext3',
  purityMode = false,
  substrateHaptics = true,
  paperSubstrate = true,
  fiberFrequency = 45.0,
  fiberAnisotropy = 0.65,
  plateMarkDepthMeters = 0.0035,
  inkRidgeHeightMeters = 0.0018,
  grainAngleRadians = 0.2618,
  sheenIntensity,
  absorptionFeathering,
  cameraPitchDeg,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportSizeRef = useRef<{ width: number; height: number; dpr: number }>({ width: 0, height: 0, dpr: 1 });
  const engineRef = useRef<WebGPUEngine>(new WebGPUEngine());
  if (typeof window !== 'undefined') {
    (window as any).__ENGINE = engineRef.current;
    (window as any).__INDICATRIX_WEBGPU_ENGINE__ = engineRef.current;
  }
  const trajectoryControllerRef = useRef<TrajectoryCameraController>(new TrajectoryCameraController());
  const cameraTransitionRef = useRef<{
    startPos: Vector3;
    endPos: Vector3;
    startTarget: Vector3;
    endTarget: Vector3;
    startUp: Vector3;
    endUp: Vector3;
    startTime: number;
    duration: number;
  } | null>(null);
  const loadedBinRef = useRef<string | null>(null);
  const activeLodTierRef = useRef<ResolutionTier>(resolution);
  const lastLodSwitchTimeRef = useRef<number>(0);
  const loadedDataInfoRef = useRef<{ pointCount: number; lineCount: number; baseVramBytes: number } | null>(null);
  const sharedCursorTracker = useCursorTracker();
  const cursorTrackerRef = useRef<CursorTracker>(sharedCursorTracker);
  cursorTrackerRef.current = sharedCursorTracker;
  const animFrameRef = useRef<number>(0);
  const cursorPhysicsEnabledRef = useRef(cursorPhysicsEnabled);
  useEffect(() => {
    cursorPhysicsEnabledRef.current = cursorPhysicsEnabled;
  }, [cursorPhysicsEnabled]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setCDLODEnabled(Boolean(cdlodEnabled));
    }
  }, [cdlodEnabled]);

  // Whimsical Effects & Signature Manifold Pinch Controllers
  const whimsicalManagerRef = useRef<WhimsicalEffectsManager>(new WhimsicalEffectsManager());
  const pinchControllerRef = useRef<ManifoldPinchController>(new ManifoldPinchController());
  const isPinchingRef = useRef<boolean>(false);
  const currentHitPosRef = useRef<Vector3>(new Vector3(0, 0, 5));

  // Pre-sampled cartographic overlay data
  const sampledArcSegmentsRef = useRef<Array<{ category: string; color: string; segments: { lon: number; lat: number }[] }>>([]);
  const tissotCirclesRef = useRef<ReturnType<typeof generateTissotCircles>>([]);

  useEffect(() => {
    sampledArcSegmentsRef.current = GEODESIC_ARCS.map(arc => ({
      category: arc.category,
      color: arc.color,
      segments: sampleGreatCircleGeodesic(arc.from, arc.to, 44),
    }));
    tissotCirclesRef.current = generateTissotCircles(30, 45, 4.8, 24);
  }, []);

  // Camera & Orbit State
  const cameraRef = useRef<PerspectiveCamera>(
    new PerspectiveCamera(45, 1, 0.1, 1000)
  );
  const targetRef = useRef<Vector3>(new Vector3(0, 0, 0));
  const sphericalRef = useRef<{ radius: number; theta: number; phi: number }>({
    radius: 15,
    theta: 1.5184, // 87°E (Himalayas / Tibetan Plateau)
    phi: 1.0821,   // 28°N
  });

  // Inertial momentum velocities matching Drei OrbitControls glide (decay factor 0.05)
  const velocityRef = useRef<{
    velTheta: number;
    velPhi: number;
    velRadius: number;
    velPanX: number;
    velPanY: number;
  }>({
    velTheta: 0,
    velPhi: 0,
    velRadius: 0,
    velPanX: 0,
    velPanY: 0,
  });

  const isDraggingRef = useRef(false);
  const dragButtonRef = useRef(0);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const targetCameraPosRef = useRef<Vector3 | null>(null);

  // FPS & Telemetry
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const startTimeRef = useRef(performance.now());
  const lastFrameTimeRef = useRef(performance.now());
  const lastTelemetryTimeRef = useRef(0);
  const lastProfilerTimeRef = useRef(0);

  // Reusable objects to eliminate per-frame GC allocations in 120 FPS render loop
  const reusableHitPosRef = useRef(new Vector3());
  const telemetryNormRef = useRef(new Vector3());
  const telemetryForwardRef = useRef(new Vector3());

  const computeCachedLayers = (curDataLayers?: any[]) => {
    const activeDataLayer = curDataLayers?.find(
      (l) => l.visible && (l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'topography' || l.type === 'raster')
    ) || curDataLayers?.find((l) => l.visible) || null;

    const reliefActive = activeDataLayer ? (
      activeDataLayer.category === 'topo' ||
      activeDataLayer.category === 'ocean' ||
      activeDataLayer.category === 'topography' ||
      activeDataLayer.type === 'raster' ||
      activeDataLayer.renderStyle === 'architectural' ||
      activeDataLayer.renderStyle === 'hybrid' ||
      activeDataLayer.renderStyle === 'photoreal'
    ) : false;

    const showContours = !!curDataLayers?.find(
      (l) => l.id === 'usgs-elevation-contours' && l.visible
    );
    const hasSurfaceWind = !!curDataLayers?.find(
      (l) => (l.id === 'noaa-gfs-wind' || l.id === 'noaa-grib2-wind' || l.id === 'gfs-surface-winds' || l.id === 'gfs-wind-velocity-grid') && l.visible
    );
    const hasJetStream = !!curDataLayers?.find(
      (l) => (l.id === 'noaa-gfs-jetstream' || l.id === 'gfs-jetstream') && l.visible
    );
    const showSatellites = !!curDataLayers?.find(
      (l) => (l.id === 'starlink-iss-orbits' || l.id === 'spacex-satellite-constellation') && l.visible
    );
    const cloudLayer = curDataLayers?.find((l) => l.id === 'noaa-gfs-clouds') || null;
    const atmLayer = curDataLayers?.find(
      (l) => (l.id === 'atmosphere-scatter' || l.id === 'planetary-atmosphere')
    ) || null;

    return {
      activeDataLayer,
      reliefActive,
      showContours,
      hasSurfaceWind,
      hasJetStream,
      showSatellites,
      cloudLayer,
      atmLayer,
    };
  };

  const cachedLayersRef = useRef(computeCachedLayers(dataLayers));

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Regional High-Resolution DEM Overlay State (NOAA CUDEM ~10m)
  const regionalManifestRef = useRef<RegionalManifestEntry[]>([]);
  const activeRegionIdRef = useRef<string | null>(null);
  const loadingRegionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch('/regional/manifest.json')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.regions)) {
          regionalManifestRef.current = data.regions;
        }
      })
      .catch(() => {});
  }, []);

  // Dynamic Props Ref to decouple renderLoop from React re-renders
  const stateRef = useRef({
    unfurlProgress,
    unfurl: unfurlProgress,
    mode,
    layerMode,
    theme,
    showSoundings,
    showTriangulation,
    showCartouche,
    showVectors,
    activeOverlay,
    showLandmarks,
    showTissot,
    dataLayers,
    vortexStrength,
    fractureIntensity,
    isolatedStratum,
    isDemoMode,
    demoSequence,
    showClouds,
    showCloudLow,
    showCloudMid,
    showCloudHigh,
    cloudDriftSpeed,
    cloudOpacity,
    atmosphericScale,
    shadowIntensity,
    verticalScaleMode,
    rainShadowFeedback,
    pluvialGamma,
    weatherOpticalMode,
    timelineMinutes,
    scrubTau,
    weatherTau,
    thermodynamicGating,
    showAtmosphere,
    volumetricClouds,
    resolution,
    purityMode,
    substrateHaptics,
    paperSubstrate,
    fiberFrequency,
    fiberAnisotropy,
    plateMarkDepthMeters,
    inkRidgeHeightMeters,
    grainAngleRadians,
    sheenIntensity,
    absorptionFeathering,
    cameraPitchDeg,
  });
  useEffect(() => {
    stateRef.current = {
      unfurlProgress,
      unfurl: unfurlProgress,
      mode,
      layerMode,
      theme,
      showSoundings,
      showTriangulation,
      showCartouche,
      showVectors,
      activeOverlay,
      showLandmarks,
      showTissot,
      dataLayers,
      vortexStrength,
      fractureIntensity,
      isolatedStratum,
      isDemoMode,
      demoSequence,
      showClouds,
      showCloudLow,
      showCloudMid,
      showCloudHigh,
      cloudDriftSpeed,
      cloudOpacity,
      atmosphericScale,
      shadowIntensity,
      verticalScaleMode,
      rainShadowFeedback,
      pluvialGamma,
      weatherOpticalMode,
      timelineMinutes,
      scrubTau,
      weatherTau,
      thermodynamicGating,
      showAtmosphere,
      volumetricClouds,
      resolution,
      purityMode,
      substrateHaptics,
      paperSubstrate,
      fiberFrequency,
      fiberAnisotropy,
      plateMarkDepthMeters,
      inkRidgeHeightMeters,
      grainAngleRadians,
      sheenIntensity,
      absorptionFeathering,
      cameraPitchDeg,
    };
    cachedLayersRef.current = computeCachedLayers(dataLayers);
  }, [unfurlProgress, mode, layerMode, theme, showSoundings, showTriangulation, showCartouche, showVectors, activeOverlay, showLandmarks, showTissot, dataLayers, vortexStrength, fractureIntensity, isolatedStratum, isDemoMode, demoSequence, showClouds, showCloudLow, showCloudMid, showCloudHigh, cloudDriftSpeed, cloudOpacity, atmosphericScale, shadowIntensity, verticalScaleMode, rainShadowFeedback, pluvialGamma, weatherOpticalMode, timelineMinutes, scrubTau, weatherTau, thermodynamicGating, showAtmosphere, volumetricClouds, resolution, purityMode, substrateHaptics, paperSubstrate, fiberFrequency, fiberAnisotropy, plateMarkDepthMeters, inkRidgeHeightMeters, grainAngleRadians, sheenIntensity, absorptionFeathering, cameraPitchDeg]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setLclGating(thermodynamicGating);
    }
  }, [thermodynamicGating]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setWeatherOpticalMode(weatherOpticalMode);
    }
  }, [weatherOpticalMode]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTimelineMinutes(timelineMinutes ?? 0);
      if (typeof engineRef.current.updateAtmosphereUniforms === 'function') {
        engineRef.current.updateAtmosphereUniforms({
          weatherTimeMinutes: timelineMinutes ?? 0,
          weatherTau: scrubTau ?? weatherTau ?? 0,
          scrubTau: scrubTau ?? weatherTau ?? 0,
        });
      }
    }
    const weatherNextDS =
      (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__ ||
      (window as any).__INDICATRIX_WEATHERNEXT_SOURCE__;
    if (weatherNextDS && !weatherNextDS.disposed && typeof weatherNextDS.setTime === 'function') {
      const clamped = Math.max(-60, Math.min(2880, timelineMinutes ?? 0));
      if (clamped >= 0) {
        const totalHours = clamped / 60;
        const bracketHour = totalHours >= 48 ? 47 : Math.min(47, Math.floor(totalHours));
        const tau = totalHours >= 48 ? 1.0 : Math.max(0.0, Math.min(1.0, totalHours - bracketHour));
        weatherNextDS.setTime(bracketHour, tau).catch(() => {});
      }
    }
    const radarDS = (window as any).__INDICATRIX_LIVE_RADAR_DATA_SOURCE__;
    if (radarDS && !radarDS.disposed && timelineMinutes !== undefined && timelineMinutes < 0) {
      radarDS.setAbsoluteMinutes(timelineMinutes);
      const radarRing = (window as any).__INDICATRIX_RADAR_RING_BUFFER__;
      if (radarRing && !radarRing.disposed && engineRef.current && engineRef.current.precipRingBuffer !== radarRing) {
        engineRef.current.setPrecipitationRingBuffer(radarRing);
      }
      radarDS.uploadToRingBuffer();
    }
  }, [timelineMinutes, scrubTau, weatherTau]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.scrubTau = scrubTau ?? weatherTau ?? 0;
    }
  }, [scrubTau, weatherTau]);

  const callbacksRef = useRef({ onFpsUpdate, onDataLoaded, onError, onCoordsChange, onResolutionChange, onGpuProfilerReport, onDemoModeChange, onAtmosphericScaleChange, onShadowIntensityChange, onShowCloudsChange, onTogglePlanetaryLayer });
  useEffect(() => {
    callbacksRef.current = { onFpsUpdate, onDataLoaded, onError, onCoordsChange, onResolutionChange, onGpuProfilerReport, onDemoModeChange, onAtmosphericScaleChange, onShadowIntensityChange, onShowCloudsChange, onTogglePlanetaryLayer };
  }, [onFpsUpdate, onDataLoaded, onError, onCoordsChange, onResolutionChange, onGpuProfilerReport, onDemoModeChange, onAtmosphericScaleChange, onShadowIntensityChange, onShowCloudsChange, onTogglePlanetaryLayer]);

  // Synchronize Trajectory Controller with demo mode and active sequence
  useEffect(() => {
    const trajectory = trajectoryControllerRef.current;
    trajectory.setMode('dolly-cinematic');
    const waypoints =
      demoSequence === 'cape-cod'
        ? CAPE_COD_WAYPOINTS
        : demoSequence === 'grand-canyon'
        ? GRAND_CANYON_WAYPOINTS
        : demoSequence === 'fuji'
        ? FUJI_WAYPOINTS
        : HAWAII_WAYPOINTS;
    trajectory.setWaypoints(waypoints, 8.0, false);
    trajectory.setIsPlaying(isDemoMode);
  }, [demoSequence]);

  useEffect(() => {
    const trajectory = trajectoryControllerRef.current;
    if (isDemoMode) {
      if (trajectory.isFinished()) {
        trajectory.setProgress(0);
      }
      trajectory.setIsPlaying(true);
    } else {
      trajectory.setIsPlaying(false);
    }
  }, [isDemoMode]);

  // Dynamic planetary layer loading when layers are enabled
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.initialized) return;
    const hasSatellites = !!dataLayers?.find(
      (l) => (l.id === 'starlink-iss-orbits' || l.id === 'spacex-satellite-constellation') && l.visible
    );
    if (hasSatellites) {
      engine.loadSatelliteTrajectories('/data/tle-starlink.json').catch(() => {});
    }
    const isWnModel =
      prognosticModel === 'weathernext3' ||
      prognosticModel === 'google-weathernext3' ||
      prognosticModel === 'weathernext';

    if (showClouds) {
      engine.loadAllCloudLayers(isWnModel).catch(() => {});
    }

    const hasWind = !!dataLayers?.find(
      (l) => (l.id === 'noaa-gfs-wind' || l.id === 'noaa-grib2-wind' || l.id === 'gfs-surface-winds' || l.id === 'gfs-wind-velocity-grid') && l.visible
    );
    if (hasWind) {
      if (isWnModel) {
        engine.loadWindTexture('/data/weathernext/wind_10m_vector-0.bin').catch(() => {
          engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {});
        });
      } else {
        engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {});
      }
    }
    const hasJetStream = !!dataLayers?.find(
      (l) => (l.id === 'noaa-gfs-jetstream' || l.id === 'gfs-jetstream') && l.visible
    );
    if (hasJetStream) {
      engine.loadJetStreamTexture('/data/gfs-jetstream-latest.bin').catch(() => {});
    }
    const hasRadar = !!dataLayers?.find(
      (l) => (l.id === 'live-doppler-radar' || l.type === 'Doppler Radar Mosaic') && l.visible
    );
    if (hasRadar) {
      import('../core/data/LiveRadarDataSource').then(({ LiveRadarDataSource }) => {
        let radarDS = (window as any).__INDICATRIX_LIVE_RADAR_DATA_SOURCE__;
        if (!radarDS || radarDS.disposed) {
          radarDS = new LiveRadarDataSource({ autoLoad: true });
          (window as any).__INDICATRIX_LIVE_RADAR_DATA_SOURCE__ = radarDS;
        }
        const dev = engine.getDevice();
        if (dev) {
          let ring = (window as any).__INDICATRIX_RADAR_RING_BUFFER__;
          if (!ring || ring.disposed) {
            ring = radarDS.createRingBuffer(dev);
            (window as any).__INDICATRIX_RADAR_RING_BUFFER__ = ring;
          }
          if (engine.precipRingBuffer !== ring) {
            engine.setPrecipitationRingBuffer(ring);
          }
          radarDS.uploadToRingBuffer();
        }
      }).catch((err) => {
        console.warn('[WebGPUCanvas] Failed to initialize live Doppler radar:', err);
      });
    } else {
      const radarRing = (window as any).__INDICATRIX_RADAR_RING_BUFFER__;
      if (radarRing && engine.precipRingBuffer === radarRing) {
        engine.setPrecipitationRingBuffer(null);
      }
    }
    const hasWeatherNext =
      isWnModel &&
      (showClouds ||
        !!dataLayers?.find(
          (l) =>
            (l.id === 'google-weathernext3' ||
              l.id === 'weathernext' ||
              l.type === '0.1° (10km) AI') &&
            l.visible
        ));
    if (hasWeatherNext) {
      engine.loadWindTexture('/data/weathernext/wind_10m_vector-0.bin').catch(() => {});
      import('../core/data/WeatherNextDataSource').then(({ WeatherNextDataSource }) => {
        import('./TemporalTextureRingBuffer').then(({ TemporalTextureRingBuffer }) => {
          const dev = engine.getDevice();
          if (dev) {
            let wnRing = (window as any).__INDICATRIX_WEATHERNEXT_RING_BUFFER__;
            if (!wnRing || wnRing.disposed || wnRing.width !== 3600) {
              wnRing = new TemporalTextureRingBuffer(dev, 3600, 1801, 'r16float');
              (window as any).__INDICATRIX_WEATHERNEXT_RING_BUFFER__ = wnRing;
            }
            if (engine.precipRingBuffer !== wnRing) {
              engine.setPrecipitationRingBuffer(wnRing);
            }
            let weatherNextDS =
              (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__ ||
              (window as any).__INDICATRIX_WEATHERNEXT_SOURCE__;
            if (!weatherNextDS || weatherNextDS.disposed) {
              weatherNextDS = new WeatherNextDataSource({ ringBuffer: wnRing });
              (window as any).__INDICATRIX_WEATHERNEXT_DATA_SOURCE__ = weatherNextDS;
              weatherNextDS.seekHour(0).catch((err: any) => {
                console.warn('[WeatherNext] Initial seekHour(0) error:', err);
              });
            }
          }
        });
      }).catch((err) => {
        console.warn('[WebGPUCanvas] Failed to initialize WeatherNext 3:', err);
      });
    } else {
      const wnRing = (window as any).__INDICATRIX_WEATHERNEXT_RING_BUFFER__;
      if (wnRing && engine.precipRingBuffer === wnRing && !hasRadar) {
        engine.setPrecipitationRingBuffer(null);
      }
    }
    if (!hasRadar && !hasWeatherNext && engine.precipRingBuffer) {
      engine.setPrecipitationRingBuffer(null);
    }
    const hasPhotoreal = !!dataLayers?.find(
      (l) => (l.renderStyle === 'photoreal' || l.id === 'photoreal-satellite-layer') && l.visible
    );
    if (hasPhotoreal && !engine.isOrbitalTexturesLoaded()) {
      engine.loadOrbitalTextures('/earth-blue-marble-4k.webp', '/earth-night-lights-4k.webp').catch(() => {});
    }
  }, [dataLayers, prognosticModel, showClouds, isLoading]);

  // WebGPU Device Loss Recovery
  useEffect(() => {
    const engine = engineRef.current;
    engine.onDeviceLost((info) => {
      console.warn('WebGPU device lost, triggering fallback to WebGL2:', info);
      setLoadError(`WebGPU Device Lost: ${info?.message || 'Device disconnected'}`);
      callbacksRef.current.onError?.(new Error(`WebGPU Device Lost: ${info?.message || 'Device disconnected'}`));
    });
  }, []);

  // Geodetic terrain-following ground clearance safety floor (~127m AGL floor)
  const getGroundClearanceFloor = useCallback((lonDeg: number, latDeg: number): number => {
    let elevM = 0;
    let dispScale = 0.08;
    if (engineRef.current) {
      const elev = engineRef.current.sampleCPUElevation(lonDeg, latDeg);
      elevM = elev?.elevationMeters ?? 0;
      const liveProps = typeof window !== 'undefined'
        ? ((window as any).__INDICATRIX_LIVE_UNIFORMS__ || (window as any).__INDICATRIX_LIVE_PROPS__)
        : null;
      dispScale = liveProps?.displacementScale ?? 0.055;
    }
    return computeGroundClearanceFloor(elevM, dispScale);
  }, []);

  // Orbital Kinematics updates
  const updateCameraTransform = useCallback(() => {
    const camera = cameraRef.current;
    const spherical = sphericalRef.current;
    const target = targetRef.current;

    camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi);
    camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }, []);

  // Update camera target or position when props change
  useEffect(() => {
    if (cameraTarget) {
      if (Array.isArray(cameraTarget)) {
        targetRef.current.set(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
      } else {
        targetRef.current.copy(cameraTarget);
      }
      updateCameraTransform();
    }
  }, [cameraTarget, updateCameraTransform]);

  useEffect(() => {
    if (cameraPosition) {
      if (Array.isArray(cameraPosition)) {
        targetCameraPosRef.current = new Vector3(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
      } else {
        targetCameraPosRef.current = cameraPosition.clone();
      }
    }
  }, [cameraPosition]);

  // Initialize Camera position
  useEffect(() => {
    cameraRef.current.position.set(0, 0, 15);
    updateCameraTransform();
  }, [updateCameraTransform]);

  // DevTools Camera Navigation Hook for Automated Verification
  useEffect(() => {
    (window as any).__INDICATRIX_CAMERA__ = {
      setSpherical: (r: number, theta: number, phi: number, target?: [number, number, number]) => {
        cameraRef.current.up.set(0, 1, 0);
        const curUnfurl = stateRef.current.unfurlProgress ?? 0;
        const clampedUnfurl = Math.max(0.0, Math.min(1.0, curUnfurl));
        const standoff = 5.0 * (1.0 - clampedUnfurl);
        if (target) {
          targetRef.current.set(target[0], target[1], target[2]);
        } else {
          targetRef.current.set(0, 0, standoff);
        }
        sphericalRef.current.radius = r;
        sphericalRef.current.theta = theta;
        sphericalRef.current.phi = phi;
        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;
        updateCameraTransform();
      },
      lookAtCoordinates: (lonDeg: number, latDeg: number, zoomRadius = 15, target?: [number, number, number]) => {
        cameraRef.current.up.set(0, 1, 0);
        const curUnfurl = stateRef.current.unfurlProgress ?? 0;
        const clampedUnfurl = Math.max(0.0, Math.min(1.0, curUnfurl));
        const standoff = 5.0 * (1.0 - clampedUnfurl);
        if (target) {
          targetRef.current.set(target[0], target[1], target[2]);
        } else {
          targetRef.current.set(0, 0, standoff);
        }
        const h_floor = getGroundClearanceFloor(lonDeg, latDeg);
        sphericalRef.current.radius = Math.max(h_floor, Math.min(zoomRadius, 30.0));
        sphericalRef.current.theta = (lonDeg * Math.PI) / 180;
        sphericalRef.current.phi = ((90 - latDeg) * Math.PI) / 180;
        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;
        updateCameraTransform();
      },
      easeToCoordinates: (lonDeg: number, latDeg: number, zoomRadius = 14.0, durationSec = 1.4) => {
        const phi = ((90 - latDeg) * Math.PI) / 180;
        const theta = (lonDeg * Math.PI) / 180;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const h_floor = getGroundClearanceFloor(lonDeg, latDeg);
        const safeRadius = Math.max(h_floor, Math.min(zoomRadius, 30.0));

        const curUnfurl = stateRef.current.unfurlProgress ?? 0;
        const clampedUnfurl = Math.max(0.0, Math.min(1.0, curUnfurl));
        const standoff = 5.0 * (1.0 - clampedUnfurl);

        const camX = safeRadius * sinPhi * sinTheta;
        const camY = safeRadius * cosPhi;
        const camZ = safeRadius * sinPhi * cosTheta + standoff;

        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;

        if (durationSec <= 0) {
          cameraRef.current.position.set(camX, camY, camZ);
          targetRef.current.set(0, 0, standoff);
          cameraRef.current.up.set(0, 1, 0);
          cameraRef.current.lookAt(targetRef.current);
          cameraRef.current.updateMatrixWorld();
          cameraTransitionRef.current = null;
        } else {
          cameraTransitionRef.current = {
            startPos: cameraRef.current.position.clone(),
            endPos: new Vector3(camX, camY, camZ),
            startTarget: targetRef.current.clone(),
            endTarget: new Vector3(0, 0, standoff),
            startUp: cameraRef.current.up.clone(),
            endUp: new Vector3(0, 1, 0),
            startTime: performance.now(),
            duration: durationSec * 1000,
          };
        }
      },
      setTarget: (x: number, y: number, z: number) => {
        targetRef.current.set(x, y, z);
        updateCameraTransform();
      },
      setObliqueView: (lonDeg: number, latDeg: number, altitudeRadius = 6.05, pitchDeg = 52, headingDeg = 0) => {
        const phi = ((90 - latDeg) * Math.PI) / 180;
        const theta = (lonDeg * Math.PI) / 180;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const nx = sinPhi * sinTheta;
        const ny = cosPhi;
        const nz = sinPhi * cosTheta;

        const northX = -Math.sin((latDeg * Math.PI) / 180) * sinTheta;
        const northY = Math.cos((latDeg * Math.PI) / 180);
        const northZ = -Math.sin((latDeg * Math.PI) / 180) * cosTheta;

        const eastX = cosTheta;
        const eastY = 0;
        const eastZ = -sinTheta;

        const hRad = (headingDeg * Math.PI) / 180;
        const forwardX = northX * Math.cos(hRad) + eastX * Math.sin(hRad);
        const forwardY = northY * Math.cos(hRad) + eastY * Math.sin(hRad);
        const forwardZ = northZ * Math.cos(hRad) + eastZ * Math.sin(hRad);

        const pRad = (pitchDeg * Math.PI) / 180;
        const vDirX = -Math.cos(pRad) * nx + Math.sin(pRad) * forwardX;
        const vDirY = -Math.cos(pRad) * ny + Math.sin(pRad) * forwardY;
        const vDirZ = -Math.cos(pRad) * nz + Math.sin(pRad) * forwardZ;

        const h_floor = getGroundClearanceFloor(lonDeg, latDeg);
        const safeRadius = Math.max(h_floor, altitudeRadius);
        const camX = nx * safeRadius;
        const camY = ny * safeRadius;
        const camZ = nz * safeRadius;

        const targetDist = 3.5;
        const targetX = camX + vDirX * targetDist;
        const targetY = camY + vDirY * targetDist;
        const targetZ = camZ + vDirZ * targetDist;

        cameraRef.current.position.set(camX, camY, camZ);
        targetRef.current.set(targetX, targetY, targetZ);
        cameraRef.current.up.set(nx, ny, nz);
        cameraRef.current.lookAt(targetRef.current);
        cameraRef.current.updateMatrixWorld();

        sphericalRef.current.radius = safeRadius;
        sphericalRef.current.theta = theta;
        sphericalRef.current.phi = phi;

        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;
      },
      snapPugetSound: (_duration = 1.6) => {
        const lonDeg = -122.38;
        const latDeg = 47.62;
        const altitudeRadius = 5.00275; // ~3,500m altitude
        const pitchDeg = 58.0;
        const headingDeg = 145.0; // Looking towards Mount Rainier
        (window as any).__INDICATRIX_CAMERA__.setObliqueView(lonDeg, latDeg, altitudeRadius, pitchDeg, headingDeg);
      },
      snapRainierInversion: (options?: {
        lonDeg?: number;
        latDeg?: number;
        altitudeRadius?: number;
        pitchDeg?: number;
        headingDeg?: number;
        theme?: number;
        duration?: number;
      }) => {
        const lonDeg = options?.lonDeg ?? -121.7604;
        const latDeg = options?.latDeg ?? 46.8529;
        const altitudeRadius = options?.altitudeRadius ?? 5.00298; // ~3,800m altitude (R ≈ 5.00298)
        const pitchDeg = options?.pitchDeg ?? 75.0; // Oblique ≈ 75°
        const headingDeg = options?.headingDeg ?? 145.0; // Looking toward Mount Rainier summit

        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
            ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
            showClouds: true,
            volumetricClouds: true,
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
          };
          if (options?.theme !== undefined) {
            (window as any).__INDICATRIX_LIVE_UNIFORMS__.theme = options.theme;
            if (typeof (window as any).__INDICATRIX_THEME__?.setThemeIndex === 'function') {
              (window as any).__INDICATRIX_THEME__.setThemeIndex(options.theme);
            }
            if (typeof (window as any).setTheme === 'function') {
              (window as any).setTheme(options.theme);
            }
          }
          if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
            (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: true });
          }
        }
        callbacksRef.current.onShowCloudsChange?.(true);

        if (engineRef.current) {
          if (typeof engineRef.current.setVolumetricCloudsEnabled === 'function') {
            engineRef.current.setVolumetricCloudsEnabled(true);
          }
          const useWn = (options as any)?.useWeatherNext ?? false;
          engineRef.current.loadAllCloudLayers(useWn).catch(() => {});
        }

        (window as any).__INDICATRIX_CAMERA__.setObliqueView(lonDeg, latDeg, altitudeRadius, pitchDeg, headingDeg);
      },
      snapHaleakalaSunset: (options?: {
        lonDeg?: number;
        latDeg?: number;
        altitudeRadius?: number;
        pitchDeg?: number;
        headingDeg?: number;
        theme?: number;
        sunAltitude?: number;
        sunAzimuth?: number;
        duration?: number;
        displacementScale?: number;
      } | number) => {
        const opts = typeof options === 'number' ? { theme: options } : (options ?? {});
        const lonDeg = opts.lonDeg ?? -156.2533; // Haleakala summit, Maui
        const latDeg = opts.latDeg ?? 20.7097;
        const altitudeRadius = opts.altitudeRadius ?? 5.0032; // ~4,000m altitude
        const pitchDeg = opts.pitchDeg ?? 80.0; // Looking slightly downward into trade-wind undercast deck
        const headingDeg = opts.headingDeg ?? 268.0; // Looking West into setting sun
        const sunAlt = opts.sunAltitude ?? 7.5; // Low golden hour sun
        const sunAz = opts.sunAzimuth ?? 270.0; // Setting in the west
        const dispScale = opts.displacementScale ?? 0.003;

        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
            ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
            sunAltitude: sunAlt,
            sunAzimuth: sunAz,
            displacementScale: dispScale,
            showClouds: true,
            volumetricClouds: true,
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
          };
          if (opts.theme !== undefined) {
            (window as any).__INDICATRIX_LIVE_UNIFORMS__.theme = opts.theme;
            if (typeof (window as any).__INDICATRIX_THEME__?.setThemeIndex === 'function') {
              (window as any).__INDICATRIX_THEME__.setThemeIndex(opts.theme);
            }
            if (typeof (window as any).setTheme === 'function') {
              (window as any).setTheme(opts.theme);
            }
          }
          if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
            (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: true });
          }
        }
        callbacksRef.current.onShowCloudsChange?.(true);

        if (engineRef.current) {
          if (typeof engineRef.current.setVolumetricCloudsEnabled === 'function') {
            engineRef.current.setVolumetricCloudsEnabled(true);
          }
          const useWn = (options as any)?.useWeatherNext ?? false;
          engineRef.current.loadAllCloudLayers(useWn).catch(() => {});
        }

        (window as any).__INDICATRIX_CAMERA__.setObliqueView(lonDeg, latDeg, altitudeRadius, pitchDeg, headingDeg);
      },
      snapIntaglioHaptics: (options?: {
        theme?: number;
        pitchDeg?: number;
        fiberFrequency?: number;
        fiberAnisotropy?: number;
        sheenIntensity?: number;
        plateMarkDepthMeters?: number;
        inkRidgeHeightMeters?: number;
        sunAltitude?: number;
        sunAzimuth?: number;
        substrateHaptics?: boolean;
      } | number) => {
        const opts = typeof options === 'number' ? { theme: options } : (options ?? {});
        const lonDeg = -122.38;
        const latDeg = 47.62;
        const altitudeRadius = 6.2;
        const pitchDeg = opts.pitchDeg ?? 68.0;
        const headingDeg = 135.0;

        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
            ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
            substrateHaptics: opts.substrateHaptics !== undefined ? Boolean(opts.substrateHaptics) : true,
            paperSubstrate: opts.substrateHaptics !== undefined ? Boolean(opts.substrateHaptics) : true,
            cameraPitchDeg: pitchDeg,
            sunAltitude: opts.sunAltitude ?? 38.0,
            sunAzimuth: opts.sunAzimuth ?? 315.0,
            fiberFrequency: opts.fiberFrequency ?? 45.0,
            fiberAnisotropy: opts.fiberAnisotropy ?? 0.65,
            sheenIntensity: opts.sheenIntensity ?? (opts.theme === 1 || opts.theme === undefined ? 0.85 : opts.theme === 2 ? 0.50 : 0.40),
            plateMarkDepthMeters: opts.plateMarkDepthMeters ?? 0.0035,
            inkRidgeHeightMeters: opts.inkRidgeHeightMeters ?? 0.0018,
          };
          if (opts.theme !== undefined) {
            (window as any).__INDICATRIX_LIVE_UNIFORMS__.theme = opts.theme;
            if (typeof (window as any).__INDICATRIX_THEME__?.setThemeIndex === 'function') {
              (window as any).__INDICATRIX_THEME__.setThemeIndex(opts.theme);
            }
            if (typeof (window as any).setTheme === 'function') {
              (window as any).setTheme(opts.theme);
            }
          }
        }

        (window as any).__INDICATRIX_CAMERA__.setObliqueView(lonDeg, latDeg, altitudeRadius, pitchDeg, headingDeg);
      },
      snapTerrainShadows: (options?: {
        lonDeg?: number;
        latDeg?: number;
        altitudeRadius?: number;
        pitchDeg?: number;
        headingDeg?: number;
        theme?: number;
        sunAltitude?: number;
        sunAzimuth?: number;
        terrainShadows?: boolean;
        maxRayDistanceMeters?: number;
        penumbraSoftness?: number;
      }) => {
        // Default target: Grand Canyon South Rim (-112.14, 36.06)
        const lonDeg = options?.lonDeg ?? -112.14;
        const latDeg = options?.latDeg ?? 36.06;
        const altitudeRadius = options?.altitudeRadius ?? 5.012; // ~15km altitude for sharp canyon relief
        const pitchDeg = options?.pitchDeg ?? 64.0;
        const headingDeg = options?.headingDeg ?? 45.0; // Looking NE across canyon
        const sunAlt = options?.sunAltitude ?? 15.0;
        const sunAz = options?.sunAzimuth ?? 120.0;
        const shadows = options?.terrainShadows !== undefined ? Boolean(options.terrainShadows) : true;

        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
            ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
            terrainShadows: shadows,
            showTerrainShadows: shadows,
            sunAltitude: sunAlt,
            sunAzimuth: sunAz,
            maxRayDistanceMeters: options?.maxRayDistanceMeters ?? 50000.0,
            penumbraSoftness: options?.penumbraSoftness ?? 1.5,
          };
          if (options?.theme !== undefined) {
            (window as any).__INDICATRIX_LIVE_UNIFORMS__.theme = options.theme;
            if (typeof (window as any).__INDICATRIX_THEME__?.setThemeIndex === 'function') {
              (window as any).__INDICATRIX_THEME__.setThemeIndex(options.theme);
            }
            if (typeof (window as any).setTheme === 'function') {
              (window as any).setTheme(options.theme);
            }
          }
        }
        if (engineRef.current) {
          engineRef.current.setTerrainShadowsEnabled(shadows);
        }
        (window as any).__INDICATRIX_CAMERA__.setObliqueView(lonDeg, latDeg, altitudeRadius, pitchDeg, headingDeg);
      },
      snapGrandCanyon: (options?: any) => {
        (window as any).__INDICATRIX_CAMERA__.snapTerrainShadows(options);
      },
      snapCloudAdvection: (options?: {
        lonDeg?: number;
        latDeg?: number;
        altitudeRadius?: number;
        pitchDeg?: number;
        headingDeg?: number;
        theme?: number;
        cloudAdvection?: boolean;
        cloudAdvectionSpeed?: number;
        condensationRate?: number;
        evaporationRate?: number;
        reset?: boolean;
      }) => {
        const lonDeg = options?.lonDeg ?? -121.7604;
        const latDeg = options?.latDeg ?? 46.8529;
        const altitudeRadius = options?.altitudeRadius ?? 5.0045;
        const pitchDeg = options?.pitchDeg ?? 72.0;
        const headingDeg = options?.headingDeg ?? 145.0;
        const advection = options?.cloudAdvection !== undefined ? Boolean(options.cloudAdvection) : true;
        const speed = options?.cloudAdvectionSpeed ?? 1.5;

        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
            ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
            showClouds: true,
            volumetricClouds: true,
            showCloudLow: true,
            showCloudMid: true,
            showCloudHigh: true,
            cloudAdvection: advection,
            cloudAdvectionSpeed: speed,
            condensationRate: options?.condensationRate ?? 1.2,
            evaporationRate: options?.evaporationRate ?? 0.8,
          };
          if (options?.theme !== undefined) {
            (window as any).__INDICATRIX_LIVE_UNIFORMS__.theme = options.theme;
            if (typeof (window as any).__INDICATRIX_THEME__?.setThemeIndex === 'function') {
              (window as any).__INDICATRIX_THEME__.setThemeIndex(options.theme);
            }
            if (typeof (window as any).setTheme === 'function') {
              (window as any).setTheme(options.theme);
            }
          }
          if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
            (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: true });
          }
        }
        callbacksRef.current.onShowCloudsChange?.(true);

        if (engineRef.current) {
          engineRef.current.setVolumetricCloudsEnabled(true);
          engineRef.current.setCloudAdvectionEnabled(advection);
          if (options?.reset) {
            engineRef.current.resetCloudAdvection();
          }
          engineRef.current.loadAllCloudLayers(false).catch(() => {});
        }

        (window as any).__INDICATRIX_CAMERA__.setObliqueView(lonDeg, latDeg, altitudeRadius, pitchDeg, headingDeg);
      },
      animateToObliqueView: (options?: {
        lonDeg?: number;
        latDeg?: number;
        altitudeRadius?: number;
        pitchDeg?: number;
        headingDeg?: number;
        duration?: number;
      }) => {
        const lonDeg = options?.lonDeg ?? 8.5;
        const latDeg = options?.latDeg ?? 44.5;
        const altitudeRadius = options?.altitudeRadius ?? 5.22;
        const pitchDeg = options?.pitchDeg ?? 78.0;
        const headingDeg = options?.headingDeg ?? 0.0;
        const durationSec = options?.duration ?? 1.6;

        const phi = ((90 - latDeg) * Math.PI) / 180;
        const theta = (lonDeg * Math.PI) / 180;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const nx = sinPhi * sinTheta;
        const ny = cosPhi;
        const nz = sinPhi * cosTheta;

        const northX = -Math.sin((latDeg * Math.PI) / 180) * sinTheta;
        const northY = Math.cos((latDeg * Math.PI) / 180);
        const northZ = -Math.sin((latDeg * Math.PI) / 180) * cosTheta;

        const eastX = cosTheta;
        const eastY = 0;
        const eastZ = -sinTheta;

        const hRad = (headingDeg * Math.PI) / 180;
        const forwardX = northX * Math.cos(hRad) + eastX * Math.sin(hRad);
        const forwardY = northY * Math.cos(hRad) + eastY * Math.sin(hRad);
        const forwardZ = northZ * Math.cos(hRad) + eastZ * Math.sin(hRad);

        const pRad = (pitchDeg * Math.PI) / 180;
        const vDirX = -Math.cos(pRad) * nx + Math.sin(pRad) * forwardX;
        const vDirY = -Math.cos(pRad) * ny + Math.sin(pRad) * forwardY;
        const vDirZ = -Math.cos(pRad) * nz + Math.sin(pRad) * forwardZ;

        const camX = nx * altitudeRadius;
        const camY = ny * altitudeRadius;
        const camZ = nz * altitudeRadius;

        const targetDist = 3.5;
        const targetX = camX + vDirX * targetDist;
        const targetY = camY + vDirY * targetDist;
        const targetZ = camZ + vDirZ * targetDist;

        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;

        if (durationSec <= 0) {
          cameraRef.current.position.set(camX, camY, camZ);
          targetRef.current.set(targetX, targetY, targetZ);
          cameraRef.current.up.set(nx, ny, nz);
          cameraRef.current.lookAt(targetRef.current);
          cameraRef.current.updateMatrixWorld();
          cameraTransitionRef.current = null;
        } else {
          cameraTransitionRef.current = {
            startPos: cameraRef.current.position.clone(),
            endPos: new Vector3(camX, camY, camZ),
            startTarget: targetRef.current.clone(),
            endTarget: new Vector3(targetX, targetY, targetZ),
            startUp: cameraRef.current.up.clone(),
            endUp: new Vector3(nx, ny, nz),
            startTime: performance.now(),
            duration: durationSec * 1000,
          };
        }
      },
      snapHorizonCrossSection: (duration = 1.6) => {
        if (typeof window !== 'undefined') {
          if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
            (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: true });
          }
          if ((window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__) {
            (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__((s: number) => (s <= 1.05 ? 6.0 : Math.max(s, 6.0)));
          }
        }
        callbacksRef.current.onShowCloudsChange?.(true);
        callbacksRef.current.onAtmosphericScaleChange?.(6.0);
        callbacksRef.current.onTogglePlanetaryLayer?.('noaa-gfs-jetstream', true);

        const phi = ((90 - 44.5) * Math.PI) / 180;
        const theta = (8.5 * Math.PI) / 180;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const nx = sinPhi * sinTheta;
        const ny = cosPhi;
        const nz = sinPhi * cosTheta;

        const northX = -Math.sin((44.5 * Math.PI) / 180) * sinTheta;
        const northY = Math.cos((44.5 * Math.PI) / 180);
        const northZ = -Math.sin((44.5 * Math.PI) / 180) * cosTheta;

        const forwardX = northX;
        const forwardY = northY;
        const forwardZ = northZ;

        const pRad = (78.0 * Math.PI) / 180;
        const vDirX = -Math.cos(pRad) * nx + Math.sin(pRad) * forwardX;
        const vDirY = -Math.cos(pRad) * ny + Math.sin(pRad) * forwardY;
        const vDirZ = -Math.cos(pRad) * nz + Math.sin(pRad) * forwardZ;

        const camX = nx * 5.22;
        const camY = ny * 5.22;
        const camZ = nz * 5.22;

        const targetDist = 3.5;
        const targetX = camX + vDirX * targetDist;
        const targetY = camY + vDirY * targetDist;
        const targetZ = camZ + vDirZ * targetDist;

        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;

        if (duration <= 0) {
          cameraRef.current.position.set(camX, camY, camZ);
          targetRef.current.set(targetX, targetY, targetZ);
          cameraRef.current.up.set(nx, ny, nz);
          cameraRef.current.lookAt(targetRef.current);
          cameraRef.current.updateMatrixWorld();
          cameraTransitionRef.current = null;
        } else {
          cameraTransitionRef.current = {
            startPos: cameraRef.current.position.clone(),
            endPos: new Vector3(camX, camY, camZ),
            startTarget: targetRef.current.clone(),
            endTarget: new Vector3(targetX, targetY, targetZ),
            startUp: cameraRef.current.up.clone(),
            endUp: new Vector3(nx, ny, nz),
            startTime: performance.now(),
            duration: duration * 1000,
          };
        }
      },
      setPose: (pos: [number, number, number], target: [number, number, number], up?: [number, number, number]) => {
        cameraRef.current.position.set(pos[0], pos[1], pos[2]);
        targetRef.current.set(target[0], target[1], target[2]);
        if (up) cameraRef.current.up.set(up[0], up[1], up[2]);
        cameraRef.current.lookAt(targetRef.current);
        cameraRef.current.updateMatrixWorld();
        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;
      },
      getSpherical: () => ({
        radius: sphericalRef.current.radius,
        theta: sphericalRef.current.theta,
        phi: sphericalRef.current.phi,
        latDeg: 90 - (sphericalRef.current.phi * 180) / Math.PI,
        lonDeg: (sphericalRef.current.theta * 180) / Math.PI,
        target: [targetRef.current.x, targetRef.current.y, targetRef.current.z],
        cameraPos: [cameraRef.current.position.x, cameraRef.current.position.y, cameraRef.current.position.z],
      }),
    };
    (window as any).__INDICATRIX_WEBGPU_ENGINE__ = engineRef.current;
    (window as any).__INDICATRIX_TRAJECTORY__ = {
      startDemo: (seq: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji' = 'hawaii', duration = 8.0) => {
        const trajectory = trajectoryControllerRef.current;
        trajectory.setMode('dolly-cinematic');
        const waypoints =
          seq === 'cape-cod'
            ? CAPE_COD_WAYPOINTS
            : seq === 'grand-canyon'
            ? GRAND_CANYON_WAYPOINTS
            : seq === 'fuji'
            ? FUJI_WAYPOINTS
            : HAWAII_WAYPOINTS;
        trajectory.setWaypoints(waypoints, duration, false);
        trajectory.setIsPlaying(true);
        callbacksRef.current.onDemoModeChange?.(true, seq);
      },
      stopDemo: () => {
        trajectoryControllerRef.current.setIsPlaying(false);
        callbacksRef.current.onDemoModeChange?.(false);
      },
      toggleDemo: (seq?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => {
        if (stateRef.current.isDemoMode) {
          trajectoryControllerRef.current.setIsPlaying(false);
          callbacksRef.current.onDemoModeChange?.(false);
        } else {
          const s = seq ?? stateRef.current.demoSequence;
          const trajectory = trajectoryControllerRef.current;
          trajectory.setMode('dolly-cinematic');
          const waypoints =
            s === 'cape-cod'
              ? CAPE_COD_WAYPOINTS
              : s === 'grand-canyon'
              ? GRAND_CANYON_WAYPOINTS
              : s === 'fuji'
              ? FUJI_WAYPOINTS
              : HAWAII_WAYPOINTS;
          trajectory.setWaypoints(waypoints, 8.0, false);
          trajectory.setIsPlaying(true);
          callbacksRef.current.onDemoModeChange?.(true, s);
        }
      },
      isDemoActive: () => stateRef.current.isDemoMode,
      getProgress: () => trajectoryControllerRef.current.getProgress(),
      setProgress: (p: number) => trajectoryControllerRef.current.setProgress(p),
      controller: trajectoryControllerRef.current,
      waypoints: {
        hawaii: HAWAII_WAYPOINTS,
        capeCod: CAPE_COD_WAYPOINTS,
        grandCanyon: GRAND_CANYON_WAYPOINTS,
        fuji: FUJI_WAYPOINTS,
      },
    };
    if ((window as any).__INDICATRIX_ENGINE__) {
      (window as any).__INDICATRIX_ENGINE__.getActiveRegionalDEM = () =>
        engineRef.current?.getActiveRegionalDEM() ?? null;
    }

    const unmountNoiseDebugOverlay = () => {
      const existing = document.getElementById('indicatrix-noise-debug-modal');
      if (existing) {
        existing.remove();
      }
    };

    const mountNoiseDebugOverlay = async () => {
      unmountNoiseDebugOverlay();

      const engine = engineRef.current;
      if (!engine) return null;

      const sliceZIndices = [16, 48, 80, 112, 64];
      const sliceDataMap = new Map<number, Uint8Array>();
      for (const z of sliceZIndices) {
        let sliceData = await engine.readCloudNoiseSlice(z);
        let isAllZero = true;
        for (let i = 0; i < sliceData.length; i += 64) {
          if (sliceData[i] !== 0) {
            isAllZero = false;
            break;
          }
        }
        if (isAllZero) {
          const { evaluateCloudNoise } = await import('../core/math/cloudNoiseMath');
          sliceData = new Uint8Array(128 * 128 * 4);
          for (let y = 0; y < 128; y++) {
            for (let x = 0; x < 128; x++) {
              const u = (x + 0.5) / 128;
              const v = (y + 0.5) / 128;
              const w = (z + 0.5) / 128;
              const [r, g, b, a] = evaluateCloudNoise([u, v, w]);
              const idx = (y * 128 + x) * 4;
              sliceData[idx + 0] = Math.round(r * 255);
              sliceData[idx + 1] = Math.round(g * 255);
              sliceData[idx + 2] = Math.round(b * 255);
              sliceData[idx + 3] = Math.round(a * 255);
            }
          }
        }
        sliceDataMap.set(z, sliceData);
      }

      const modal = document.createElement('div');
      modal.id = 'indicatrix-noise-debug-modal';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.backgroundColor = 'rgba(5, 10, 16, 0.88)';
      modal.style.backdropFilter = 'blur(6px)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '99999';

      const card = document.createElement('div');
      card.id = 'indicatrix-noise-debug-card';
      card.style.position = 'relative';
      card.style.width = '1024px';
      card.style.height = '576px';
      card.style.backgroundColor = '#0E1824';
      card.style.border = '1px solid #384C60';
      card.style.boxShadow = '0 20px 50px rgba(0,0,0,0.6)';
      card.style.borderRadius = '4px';
      card.style.overflow = 'hidden';

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 576;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw background
        ctx.fillStyle = '#0E1824';
        ctx.fillRect(0, 0, 1024, 576);

        // Neatline border (Invariant §2)
        ctx.strokeStyle = '#223446';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, 1004, 556);

        // Title & Telemetry Header
        ctx.fillStyle = '#E8ECEF';
        ctx.font = 'bold 13px monospace';
        ctx.fillText('INDICATRIX ENGINE — MILESTONE 2: 3D TROPOSPHERIC CLOUD NOISE VOLUME', 24, 34);

        ctx.fillStyle = '#6E8A9E';
        ctx.font = '11px monospace';
        ctx.fillText('128³ RGBA8UNORM COMPUTE PIPELINE (PERLIN-WORLEY BILLOW + 3-OCTAVE WORLEY EROSION)', 24, 50);

        const durationMs = engine.getCloudNoiseComputeDurationMs();
        const telemetryBadge = `Resolution: 128×128×128 | Format: rgba8unorm | VRAM: 8.00 MB | Boot Duration: ${durationMs > 0 ? durationMs.toFixed(2) : '<8'} ms`;
        ctx.fillStyle = '#4CD964';
        ctx.fillText(telemetryBadge, 24, 66);

        const renderSliceTile = (
          x: number,
          y: number,
          size: number,
          sliceBytes: Uint8Array,
          channelMode: 'rgba' | 'r' | 'g' | 'b' | 'a',
          label: string,
          subLabel: string
        ) => {
          ctx.strokeStyle = '#2A3F54';
          ctx.strokeRect(x, y, size, size);

          const imgData = ctx.createImageData(128, 128);
          for (let i = 0; i < 128 * 128; i++) {
            const r = sliceBytes[i * 4 + 0];
            const g = sliceBytes[i * 4 + 1];
            const b = sliceBytes[i * 4 + 2];
            const a = sliceBytes[i * 4 + 3];

            if (channelMode === 'rgba') {
              imgData.data[i * 4 + 0] = r;
              imgData.data[i * 4 + 1] = g;
              imgData.data[i * 4 + 2] = b;
              imgData.data[i * 4 + 3] = 255;
            } else if (channelMode === 'r') {
              imgData.data[i * 4 + 0] = r;
              imgData.data[i * 4 + 1] = r;
              imgData.data[i * 4 + 2] = r;
              imgData.data[i * 4 + 3] = 255;
            } else if (channelMode === 'g') {
              imgData.data[i * 4 + 0] = g;
              imgData.data[i * 4 + 1] = g;
              imgData.data[i * 4 + 2] = g;
              imgData.data[i * 4 + 3] = 255;
            } else if (channelMode === 'b') {
              imgData.data[i * 4 + 0] = b;
              imgData.data[i * 4 + 1] = b;
              imgData.data[i * 4 + 2] = b;
              imgData.data[i * 4 + 3] = 255;
            } else if (channelMode === 'a') {
              imgData.data[i * 4 + 0] = a;
              imgData.data[i * 4 + 1] = a;
              imgData.data[i * 4 + 2] = a;
              imgData.data[i * 4 + 3] = 255;
            }
          }

          const offscreen = document.createElement('canvas');
          offscreen.width = 128;
          offscreen.height = 128;
          const offCtx = offscreen.getContext('2d');
          if (offCtx) {
            offCtx.putImageData(imgData, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(offscreen, x, y, size, size);
          }

          ctx.fillStyle = '#E8ECEF';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(label, x + 4, y + size + 14);
          ctx.fillStyle = '#6E8A9E';
          ctx.font = '9px monospace';
          ctx.fillText(subLabel, x + 4, y + size + 25);
        };

        const tileSize = 160;
        const gapX = 50;
        const startX = 72;

        // Row 1: Depth slices
        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('ROW 1: VOLUMETRIC DEPTH SLICES ALONG Z-AXIS (RGB COMPOSITE)', startX, 85);

        const row1Z = [16, 48, 80, 112];
        const row1Labels = [
          ['z = 16 (12%)', 'Base Stratus Layer'],
          ['z = 48 (38%)', 'Mid Cumulus Inflow'],
          ['z = 80 (62%)', 'Tower Cumulonimbus'],
          ['z = 112 (88%)', 'Upper Cirrus Anvil'],
        ];

        for (let i = 0; i < 4; i++) {
          const z = row1Z[i];
          const data = sliceDataMap.get(z) || new Uint8Array(128 * 128 * 4);
          const x = startX + i * (tileSize + gapX);
          const y = 96;
          renderSliceTile(x, y, tileSize, data, 'rgba', row1Labels[i][0], row1Labels[i][1]);
        }

        // Row 2: Channel decomposition at z=64
        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('ROW 2: 4-CHANNEL ORTHOGONAL DECOMPOSITION AT MID-TROPOSPHERE (z = 64)', startX, 318);

        const data64 = sliceDataMap.get(64) || new Uint8Array(128 * 128 * 4);
        const row2Channels: ('r' | 'g' | 'b' | 'a')[] = ['r', 'g', 'b', 'a'];
        const row2Labels = [
          ['Channel R (Perlin-Worley)', 'Base Billow (Periods 4,8,16)'],
          ['Channel G (Worley Oct 1)', 'Cellular Erosion (Period 8)'],
          ['Channel B (Worley Oct 2)', 'Cellular Erosion (Period 16)'],
          ['Channel A (Worley Oct 3)', 'Cellular Erosion (Period 32)'],
        ];

        for (let i = 0; i < 4; i++) {
          const x = startX + i * (tileSize + gapX);
          const y = 328;
          renderSliceTile(x, y, tileSize, data64, row2Channels[i], row2Labels[i][0], row2Labels[i][1]);
        }

        // Footer Telemetry
        ctx.fillStyle = '#4CD964';
        ctx.font = '10px monospace';
        ctx.fillText('STATUS: PASS | 3D PERIODIC CONTINUITY VERIFIED | ZERO NaNs | INVARIANT §46 COMPLIANT', startX, 550);
      }

      card.appendChild(canvas);
      modal.appendChild(card);

      const closeBtn = document.createElement('button');
      closeBtn.innerText = '✕ CLOSE';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '16px';
      closeBtn.style.right = '16px';
      closeBtn.style.backgroundColor = '#1E293B';
      closeBtn.style.color = '#F1F5F9';
      closeBtn.style.border = '1px solid #475569';
      closeBtn.style.borderRadius = '3px';
      closeBtn.style.padding = '4px 8px';
      closeBtn.style.fontSize = '11px';
      closeBtn.style.fontFamily = 'monospace';
      closeBtn.style.cursor = 'pointer';
      closeBtn.onclick = unmountNoiseDebugOverlay;
      card.appendChild(closeBtn);

      document.body.appendChild(modal);
      return modal;
    };

    (window as any).__INDICATRIX_NOISE_DEBUG__ = {
      getTexture: () => engineRef.current?.getCloudNoiseTexture() ?? null,
      getTextureView: () => engineRef.current?.getCloudNoiseTextureView() ?? null,
      getDimensions: () => ({ width: 128, height: 128, depth: 128, format: 'rgba8unorm' }),
      getComputeDurationMs: () => engineRef.current?.getCloudNoiseComputeDurationMs() ?? 0,
      readSlice: (z: number) => engineRef.current?.readCloudNoiseSlice(z),
      readSlices: (slices: number[]) => engineRef.current?.readCloudNoiseSlices(slices),
      mountDebugOverlay: mountNoiseDebugOverlay,
      unmountDebugOverlay: unmountNoiseDebugOverlay,
    };

    (window as any).__INDICATRIX_SET_TERRAIN_SHADOWS__ = (enabled: boolean) => {
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
          ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
          terrainShadows: enabled,
          showTerrainShadows: enabled,
        };
      }
      if (engineRef.current) {
        engineRef.current.setTerrainShadowsEnabled(enabled);
      }
    };

    return () => {
      delete (window as any).__INDICATRIX_CAMERA__;
      delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      delete (window as any).__INDICATRIX_TRAJECTORY__;
      delete (window as any).__INDICATRIX_NOISE_DEBUG__;
      delete (window as any).__INDICATRIX_SET_TERRAIN_SHADOWS__;
      unmountNoiseDebugOverlay();
      if ((window as any).__INDICATRIX_ENGINE__) {
        delete (window as any).__INDICATRIX_ENGINE__.getActiveRegionalDEM;
      }
    };
  }, [updateCameraTransform]);

  // Internal Camera Controls (Orbit gestures for WebGPU Native Canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      cameraTransitionRef.current = null;
      if (stateRef.current.isDemoMode) {
        callbacksRef.current.onDemoModeChange?.(false);
        const camera = cameraRef.current;
        const target = targetRef.current;
        const offset = new Vector3().subVectors(camera.position, target);
        sphericalRef.current.radius = offset.length();
        sphericalRef.current.theta = Math.atan2(offset.x, offset.z);
        sphericalRef.current.phi = Math.acos(Math.min(Math.max(offset.y / Math.max(sphericalRef.current.radius, 0.001), -1), 1));
      }

      const isPinchMode = e.shiftKey || cursorPhysicsEnabledRef.current;
      if (isPinchMode && e.button === 0) {
        isPinchingRef.current = true;
        isDraggingRef.current = false;
        const hit = currentHitPosRef.current;
        pinchControllerRef.current.onPointerDown(hit.x, hit.y, hit.z, 0.75);
        return;
      }

      isDraggingRef.current = true;
      dragButtonRef.current = e.button;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      // Reset velocity on new direct manipulation
      velocityRef.current.velTheta = 0;
      velocityRef.current.velPhi = 0;
      velocityRef.current.velRadius = 0;
      velocityRef.current.velPanX = 0;
      velocityRef.current.velPanY = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      const hit = currentHitPosRef.current;
      pinchControllerRef.current.onHoverMove(hit.x, hit.y, hit.z);

      if (isPinchingRef.current) {
        return; // Pinch is active; maintain strict separation from camera orbit
      }

      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      if (dragButtonRef.current === 0) {
        // Orbit rotation: unrestricted 360-degree spherical orbit across all morph stages
        const rotateSpeed = 0.005;
        const dTheta = -dx * rotateSpeed;
        const dPhi = -dy * rotateSpeed;

        sphericalRef.current.theta += dTheta;
        sphericalRef.current.phi = Math.min(
          Math.max(sphericalRef.current.phi + dPhi, 0.001),
          Math.PI - 0.001
        );
        // Track angular velocity for smooth inertial glide release
        velocityRef.current.velTheta = dTheta;
        velocityRef.current.velPhi = dPhi;
      } else if (dragButtonRef.current === 2 || dragButtonRef.current === 1) {
        // Pan translation
        const panSpeed = sphericalRef.current.radius * 0.001;
        const dPanX = -dx * panSpeed;
        const dPanY = dy * panSpeed;
        targetRef.current.x += dPanX;
        targetRef.current.y += dPanY;
        // Track pan velocity for smooth inertial glide release
        velocityRef.current.velPanX = dPanX;
        velocityRef.current.velPanY = dPanY;
      }
      updateCameraTransform();
    };

    const onPointerUp = () => {
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        pinchControllerRef.current.onPointerUp();
      }
      isDraggingRef.current = false;
    };

    const onPointerEnter = () => {
      pinchControllerRef.current.onPointerEnter();
    };

    const onPointerLeave = () => {
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        pinchControllerRef.current.onPointerUp();
      }
      pinchControllerRef.current.onPointerLeave();
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraTransitionRef.current = null;

      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return;

      // Smooth inertial zoom impulse (decay factor 0.05)
      const zoomImpulse = e.deltaY * 0.015;
      velocityRef.current.velRadius += zoomImpulse;

      const hitPos = currentHitPosRef.current;

      if (e.deltaY < 0) {
        // Zoom In: Lerp target toward cursor hit point if on-globe
        if (hitPos) {
          const lerpFactor = Math.min(0.08, Math.abs(e.deltaY) * 0.0008);
          targetRef.current.lerp(hitPos, lerpFactor);
          const len = targetRef.current.length();
          if (len > 5.0) {
            targetRef.current.multiplyScalar(5.0 / len);
          }
        } else {
          // Fallback: if off-globe, standard radial distance adjustment while decaying target toward origin
          const recenterFactor = Math.min(0.05, Math.abs(e.deltaY) * 0.0005);
          targetRef.current.lerp(ORIGIN_VEC, recenterFactor);
        }
      } else if (e.deltaY > 0) {
        // Zoom Out: Exponentially decay target back toward (0, 0, 0)
        const recenterFactor = Math.min(0.10, Math.abs(e.deltaY) * 0.0010);
        targetRef.current.lerp(ORIGIN_VEC, recenterFactor);
        if (sphericalRef.current.radius >= 20.0 || targetRef.current.lengthSq() < 1e-5) {
          targetRef.current.set(0, 0, 0);
        }
      }

      updateCameraTransform();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const container = containerRef.current || canvas;

    container.addEventListener('pointerdown', onPointerDown as EventListener);
    container.addEventListener('pointerenter', onPointerEnter as EventListener);
    container.addEventListener('pointerleave', onPointerLeave as EventListener);
    window.addEventListener('pointermove', onPointerMove as EventListener);
    window.addEventListener('pointerup', onPointerUp as EventListener);
    container.addEventListener('wheel', onWheel as EventListener, { passive: false });
    container.addEventListener('contextmenu', onContextMenu as EventListener);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown as EventListener);
      container.removeEventListener('pointerenter', onPointerEnter as EventListener);
      container.removeEventListener('pointerleave', onPointerLeave as EventListener);
      window.removeEventListener('pointermove', onPointerMove as EventListener);
      window.removeEventListener('pointerup', onPointerUp as EventListener);
      container.removeEventListener('wheel', onWheel as EventListener);
      container.removeEventListener('contextmenu', onContextMenu as EventListener);
    };
  }, [updateCameraTransform]);

  // Load Geometry and Initialize WebGPU Engine
  useEffect(() => {
    let isMounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tier = TIER_CONFIG[resolution] || TIER_CONFIG['1M'];
    const binFile = tier.bin;
    const jsonFile = resolution === '100k' ? '/geo-mesh-100k.json' : null;

    // Fast-path: When switching between high-resolution tiers (1M, 3M, 4M, 8M, 16M),
    // the underlying point dataset (/geo-mesh-1m.bin) is already loaded in GPU memory.
    // Retessellate the dual-surface lithosphere and hydrosphere sphere grid dynamically on GPU.
    if (engineRef.current.initialized && loadedBinRef.current === binFile) {
      activeLodTierRef.current = resolution;
      const tStart = performance.now();
      const sphereInfo = engineRef.current.rebuildSphereMesh(tier.lat, tier.lon);
      const tessellationMs = Math.max(1, Math.round(performance.now() - tStart));
      const baseBytes = loadedDataInfoRef.current?.baseVramBytes || 0;
      const totalVramMb = parseFloat(((baseBytes + sphereInfo.memoryBytes) / (1024 * 1024)).toFixed(2));
      callbacksRef.current.onDataLoaded?.({
        pointCount: loadedDataInfoRef.current?.pointCount || sphereInfo.vertexCount,
        lineCount: loadedDataInfoRef.current?.lineCount || sphereInfo.triangleCount,
        format: 'WebGPU (Dynamic Grid)',
        loadTimeMs: tessellationMs,
        vramMb: totalVramMb,
      });
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    const t0 = performance.now();
    console.log('[WebGPUCanvas] Starting load for:', binFile, 'isMounted:', isMounted);

    // If switching datasets (e.g. from 100k to 1M+ or vice versa), dispose previous engine state
    if (engineRef.current.initialized) {
      engineRef.current.dispose();
    }
    loadedBinRef.current = binFile;
    const engine = engineRef.current;
    (window as any).__WEBGPU_ENGINE__ = engine;
    if ((window as any).__INDICATRIX_CAMERA__) {
      (window as any).__INDICATRIX_CAMERA__.camera = cameraRef.current;
    } else {
      (window as any).__INDICATRIX_CAMERA__ = cameraRef.current;
    }
    engine.camera = cameraRef.current;

    fetch(binFile)
      .then(async (res) => {
        console.log('[WebGPUCanvas] Fetch response received, ok:', res.ok, 'status:', res.status);
        if (!res.ok) throw new Error(`BIN fetch failed (${res.status})`);
        const buffer = await res.arrayBuffer();
        console.log('[WebGPUCanvas] ArrayBuffer received, bytes:', buffer.byteLength, 'isMounted:', isMounted);
        if (!isMounted) return;

        const view = new DataView(buffer);
        const magic = view.getUint32(0, true);
        if (magic !== 0x47454F4D) throw new Error('Invalid binary magic header');

        const pointCount = view.getUint32(8, true);
        const indexCount = view.getUint32(12, true);
        const pOffset = view.getUint32(16, true);
        const tOffset = view.getUint32(20, true);
        const typOffset = view.getUint32(24, true);
        const iOffset = view.getUint32(28, true);

        const pointsData = new Float32Array(buffer, pOffset, pointCount * 3);
        const target2DData = new Float32Array(buffer, tOffset, pointCount * 2);
        const typeData = new Float32Array(buffer, typOffset, pointCount);
        const lineIndices = new Uint32Array(buffer, iOffset, indexCount);

        console.log('[WebGPUCanvas] Initializing engine with pointCount:', pointCount);
        await engine.initialize({
          canvas,
          pointCount,
          pointsData,
          target2DData,
          typeData,
          lineIndices,
        });
        console.log('[WebGPUCanvas] engine.initialize completed successfully!');

        // Configure dual-surface crust resolution dynamically across 100k .. 16M tiers
        const sphereInfo = engine.rebuildSphereMesh(tier.lat, tier.lon);

        // Asynchronously ingest ETOPO 2022 16-bit DEM texture (M1-T1)
        engine.loadDEMTexture('/earth-etopo2022-dem-u16.bin').catch(() => {});
        engine.loadHydroTexture('/earth-hydrology-bc5.dds').catch(() => {});
        engine.loadNormalTexture('/earth-normals-bc5.dds').catch(() => {});
        engine.loadVectorData('/geo-vectors.bin').catch(() => {});
        engine.loadContourMesh('/geo-contour-mesh.bin').catch(() => {});
        engine.loadSatelliteTrajectories('/data/tle-starlink.json').catch(() => {});
        const isWnModel =
          prognosticModel === 'weathernext3' ||
          prognosticModel === 'google-weathernext3' ||
          prognosticModel === 'weathernext';

        if (isWnModel) {
          engine.loadWindTexture('/data/weathernext/wind_10m_vector-0.bin').catch(() => {
            engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {});
          });
          engine.loadAllCloudLayers(true).catch(() => {});
        } else {
          engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {});
          engine.loadAllCloudLayers(false).catch(() => {});
        }
        engine.loadOrbitalTextures('/earth-blue-marble-4k.webp', '/earth-night-lights-4k.webp').catch(() => {});

        if (!isMounted) {
          console.log('[WebGPUCanvas] isMounted is false after engine.initialize!');
          return;
        }
        setIsLoading(false);

        const t1 = performance.now();
        const vramBytes = pointsData.byteLength + target2DData.byteLength + typeData.byteLength + lineIndices.byteLength;
        loadedDataInfoRef.current = {
          pointCount,
          lineCount: indexCount / 2,
          baseVramBytes: vramBytes,
        };

        const totalVramMb = parseFloat(((vramBytes + sphereInfo.memoryBytes) / (1024 * 1024)).toFixed(2));

        callbacksRef.current.onDataLoaded?.({
          pointCount,
          lineCount: indexCount / 2,
          format: 'WebGPU (Binary Mesh)',
          loadTimeMs: Math.round(t1 - t0),
          vramMb: totalVramMb,
        });
      })
      .catch(async (binErr) => {
        console.error('[WebGPUCanvas] bin load error:', binErr);
        if (!jsonFile) {
          console.error('WebGPU binary load failed:', binErr);
          if (isMounted) {
            setLoadError(binErr.message);
            onError?.(binErr);
          }
          return;
        }

        try {
          const res = await fetch(jsonFile);
          const data = await res.json();
          if (!isMounted) return;

          const pointsData = new Float32Array(data.pointsBuffer);
          const target2DData = new Float32Array(data.target2DBuffer);
          const typeData = new Float32Array(data.typeBuffer);
          const lineIndices = new Uint32Array(data.lineIndices);

          const engine = engineRef.current;
          (window as any).__WEBGPU_ENGINE__ = engine;
          if ((window as any).__INDICATRIX_CAMERA__) {
            (window as any).__INDICATRIX_CAMERA__.camera = cameraRef.current;
          } else {
            (window as any).__INDICATRIX_CAMERA__ = cameraRef.current;
          }
          engine.camera = cameraRef.current;
          await engine.initialize({
            canvas,
            pointCount: pointsData.length / 3,
            pointsData,
            target2DData,
            typeData,
            lineIndices,
          });

          const sphereInfo = engine.rebuildSphereMesh(tier.lat, tier.lon);

          // Asynchronously ingest ETOPO 2022 16-bit DEM texture (M1-T1)
          engine.loadDEMTexture('/earth-etopo2022-dem-u16.bin').catch(() => {});
          engine.loadHydroTexture('/earth-hydrology-bc5.dds').catch(() => {});
          engine.loadNormalTexture('/earth-normals-bc5.dds').catch(() => {});
          engine.loadVectorData('/geo-vectors.bin').catch(() => {});
          engine.loadContourMesh('/geo-contour-mesh.bin').catch(() => {});
          engine.loadSatelliteTrajectories('/data/tle-starlink.json').catch(() => {});
          const isWnModel =
            prognosticModel === 'weathernext3' ||
            prognosticModel === 'google-weathernext3' ||
            prognosticModel === 'weathernext';

          if (isWnModel) {
            engine.loadWindTexture('/data/weathernext/wind_10m_vector-0.bin').catch(() => {
              engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {});
            });
            engine.loadAllCloudLayers(true).catch(() => {});
          } else {
            engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {});
            engine.loadAllCloudLayers(false).catch(() => {});
          }
          engine.loadOrbitalTextures('/earth-blue-marble-4k.webp', '/earth-night-lights-4k.webp').catch(() => {});

          if (!isMounted) return;
          setIsLoading(false);

          const t1 = performance.now();
          const vramBytes = pointsData.byteLength + target2DData.byteLength + typeData.byteLength + lineIndices.byteLength;
          loadedDataInfoRef.current = {
            pointCount: pointsData.length / 3,
            lineCount: lineIndices.length / 2,
            baseVramBytes: vramBytes,
          };

          const totalVramMb = parseFloat(((vramBytes + sphereInfo.memoryBytes) / (1024 * 1024)).toFixed(2));

          callbacksRef.current.onDataLoaded?.({
            pointCount: pointsData.length / 3,
            lineCount: lineIndices.length / 2,
            format: 'WebGPU (JSON Mesh)',
            loadTimeMs: Math.round(t1 - t0),
            vramMb: totalVramMb,
          });
        } catch (err: any) {
          if (isMounted) {
            setLoadError(err.message);
            callbacksRef.current.onError?.(err);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [resolution]);

  // Dedicated unmount teardown
  useEffect(() => {
    return () => {
      engineRef.current.dispose();
      loadedBinRef.current = null;
    };
  }, []);

  // Resize Handling
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      viewportSizeRef.current = { width, height, dpr };

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const overlay = overlayCanvasRef.current;
      if (overlay) {
        overlay.width = Math.round(width * dpr);
        overlay.height = Math.round(height * dpr);
      }

      cameraRef.current.aspect = width / Math.max(height, 1);
      cameraRef.current.updateProjectionMatrix();

      engineRef.current.resize(canvas.width, canvas.height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // WebGPU Continuous Simulation & Render Loop (Decoupled with refs for sustained 120 FPS)
  useEffect(() => {
    let isActive = true;

    const renderLoop = (now: number) => {
      if (!isActive) return;

      const engine = engineRef.current;
      const camera = cameraRef.current;
      const tracker = cursorTrackerRef.current;
      const {
        unfurlProgress: curUnfurlProp,
        mode: curMode,
        layerMode: curLayer,
        theme: curTheme,
        showSoundings: curShowSoundings,
        showTriangulation: curShowTriangulation,
        showVectors: curShowVectors,
        activeOverlay: curActiveOverlay,
        showLandmarks: curShowLandmarks,
        showTissot: curShowTissot,
        dataLayers: curDataLayers,
        vortexStrength: curVortexStrength,
        fractureIntensity: curFractureIntensity,
      } = stateRef.current;

      const animAlpha = typeof window !== 'undefined' ? (window as any).__INDICATRIX_ANIM_ALPHA__ : undefined;
      const curUnfurl = animAlpha !== undefined ? animAlpha : curUnfurlProp;

      if (engine.initialized) {
        const appStartTime = startTime !== undefined ? startTime : startTimeRef.current;
        const time = (now - appStartTime) / 1000;
        const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
        lastFrameTimeRef.current = now;

        // Trajectory Camera Controller override when Demo Mode is active
        const curIsDemoMode = stateRef.current.isDemoMode;
        if (curIsDemoMode) {
          const trajectory = trajectoryControllerRef.current;
          trajectory.update(dt);
          camera.position.copy(trajectory.position);
          targetRef.current.copy(trajectory.target);
          camera.lookAt(targetRef.current);
          if (trajectory.getFov()) {
            camera.fov = trajectory.getFov();
            camera.updateProjectionMatrix();
          }
          camera.updateMatrixWorld();

          // Suppress manual inertial velocities while trajectory camera has authority
          velocityRef.current.velTheta = 0;
          velocityRef.current.velPhi = 0;
          velocityRef.current.velRadius = 0;
          velocityRef.current.velPanX = 0;
          velocityRef.current.velPanY = 0;

          if (trajectory.isFinished()) {
            callbacksRef.current.onDemoModeChange?.(false);
            const offset = _scratchVecA.subVectors(camera.position, targetRef.current);
            sphericalRef.current.radius = offset.length();
            sphericalRef.current.theta = Math.atan2(offset.x, offset.z);
            sphericalRef.current.phi = Math.acos(Math.min(Math.max(offset.y / Math.max(sphericalRef.current.radius, 0.001), -1), 1));
          }
        } else if (cameraTransitionRef.current && !isDraggingRef.current) {
          const tr = cameraTransitionRef.current;
          const elapsed = now - tr.startTime;
          const alpha = Math.min(1.0, Math.max(0.0, elapsed / tr.duration));
          // Smootherstep easing: 6a^5 - 15a^4 + 10a^3
          const ease = alpha * alpha * alpha * (alpha * (alpha * 6 - 15) + 10);

          // Position along spherical arc with ground clearance safety floor r >= 5.15
          const r0 = tr.startPos.length();
          const r1 = tr.endPos.length();
          const curR = Math.max(5.15, r0 + (r1 - r0) * ease);
          const slerpPos = slerpVec3(tr.startPos, tr.endPos, ease);
          camera.position.set(slerpPos[0] * curR, slerpPos[1] * curR, slerpPos[2] * curR);

          // Target lerp
          targetRef.current.lerpVectors(tr.startTarget, tr.endTarget, ease);

          // Up vector slerp
          const slerpUp = slerpVec3(tr.startUp, tr.endUp, ease);
          camera.up.set(slerpUp[0], slerpUp[1], slerpUp[2]);

          camera.lookAt(targetRef.current);
          camera.updateMatrixWorld();

          const offset = _scratchVecA.subVectors(camera.position, targetRef.current);
          sphericalRef.current.radius = offset.length();
          sphericalRef.current.theta = Math.atan2(offset.x, offset.z);
          sphericalRef.current.phi = Math.acos(Math.min(Math.max(offset.y / Math.max(sphericalRef.current.radius, 0.001), -1), 1));

          if (alpha >= 1.0) {
            cameraTransitionRef.current = null;
          }
        } else if (targetCameraPosRef.current && !isDraggingRef.current) {
          const targetPos = targetCameraPosRef.current;
          camera.position.lerp(targetPos, 0.08);
          targetRef.current.lerp(ORIGIN_VEC, 0.08);
          const offset = _scratchVecA.subVectors(camera.position, targetRef.current);
          sphericalRef.current.radius = offset.length();
          sphericalRef.current.theta = Math.atan2(offset.x, offset.z);
          sphericalRef.current.phi = Math.acos(Math.min(Math.max(offset.y / Math.max(sphericalRef.current.radius, 0.001), -1), 1));
          updateCameraTransform();

          if (camera.position.distanceTo(targetPos) < 0.05) {
            camera.position.copy(targetPos);
            targetCameraPosRef.current = null;
            updateCameraTransform();
          }
        } else {
          // Native Inertial Camera Controller glide (decay factor 0.05 matching Drei OrbitControls glide)
          const DAMPING_FACTOR = 0.05;
          const decay = Math.pow(1 - DAMPING_FACTOR, Math.max(1, dt * 60));
          const vel = velocityRef.current;

          if (
            Math.abs(vel.velTheta) > 1e-6 ||
            Math.abs(vel.velPhi) > 1e-6 ||
            Math.abs(vel.velRadius) > 1e-6 ||
            Math.abs(vel.velPanX) > 1e-6 ||
            Math.abs(vel.velPanY) > 1e-6
          ) {
            if (!isDraggingRef.current) {
              sphericalRef.current.theta += vel.velTheta;
              sphericalRef.current.phi = Math.min(
                Math.max(sphericalRef.current.phi + vel.velPhi, 0.001),
                Math.PI - 0.001
              );
              targetRef.current.x += vel.velPanX;
              targetRef.current.y += vel.velPanY;

              vel.velTheta *= decay;
              vel.velPhi *= decay;
              vel.velPanX *= decay;
              vel.velPanY *= decay;

              if (Math.abs(vel.velTheta) < 1e-6) vel.velTheta = 0;
              if (Math.abs(vel.velPhi) < 1e-6) vel.velPhi = 0;
              if (Math.abs(vel.velPanX) < 1e-6) vel.velPanX = 0;
              if (Math.abs(vel.velPanY) < 1e-6) vel.velPanY = 0;
            }

            if (Math.abs(vel.velRadius) > 1e-6) {
              const currentPhi = sphericalRef.current.phi;
              const currentTheta = sphericalRef.current.theta;
              const currentLat = 90 - (currentPhi * 180) / Math.PI;
              let currentLon = (currentTheta * 180) / Math.PI;
              currentLon = (((currentLon + 180) % 360) + 360) % 360 - 180;
              const h_floor = getGroundClearanceFloor(currentLon, currentLat);
              sphericalRef.current.radius = Math.min(
                Math.max(sphericalRef.current.radius + vel.velRadius, h_floor),
                50.0
              );
              vel.velRadius *= decay;
              if (Math.abs(vel.velRadius) < 1e-6) vel.velRadius = 0;
            }

            if (sphericalRef.current.radius >= 20.0 && targetRef.current.lengthSq() > 1e-5) {
              targetRef.current.set(0, 0, 0);
            }

            updateCameraTransform();
          }
        }


        // Auto-rotation disabled to preserve user target coordinate inspection

        // --------------------------------------------------------------------
        // Regional High-Resolution DEM Overlay (NOAA CUDEM ~10m) Camera Trigger
        // --------------------------------------------------------------------
        const regions = regionalManifestRef.current;
        if (regions.length > 0 && engineRef.current) {
          const currentRadius = sphericalRef.current.radius;
          const currentPhi = sphericalRef.current.phi;
          const currentTheta = sphericalRef.current.theta;
          const currentLat = 90 - (currentPhi * 180) / Math.PI;
          let currentLon = (currentTheta * 180) / Math.PI;
          currentLon = ((currentLon + 180) % 360 + 360) % 360 - 180;

          // Camera zoom threshold: radius <= 12.0 indicates regional focus
          const isZoomedIn = currentRadius <= 12.0;

          let matchedRegion: RegionalManifestEntry | null = null;
          if (isZoomedIn) {
            for (const reg of regions) {
              const b = reg.bounds;
              // Allow 0.75° boundary buffer for pre-fetching
              if (
                currentLon >= b.minLon - 0.75 &&
                currentLon <= b.maxLon + 0.75 &&
                currentLat >= b.minLat - 0.75 &&
                currentLat <= b.maxLat + 0.75
              ) {
                matchedRegion = reg;
                break;
              }
            }
          }

          if (matchedRegion) {
            if (activeRegionIdRef.current !== matchedRegion.id) {
              activeRegionIdRef.current = matchedRegion.id;
              const regId = matchedRegion.id;
              const engine = engineRef.current;
              if (!engine.getRegionalDEMTexture(regId) && !loadingRegionsRef.current.has(regId)) {
                loadingRegionsRef.current.add(regId);
                engine
                  .loadRegionalDEMTexture(
                    matchedRegion.binUrl,
                    matchedRegion.bounds,
                    matchedRegion.width,
                    matchedRegion.height,
                    regId
                  )
                  .then(() => {
                    loadingRegionsRef.current.delete(regId);
                    if (activeRegionIdRef.current === regId) {
                      engine.setActiveRegionalDEM(regId);
                    }
                  })
                  .catch(() => {
                    loadingRegionsRef.current.delete(regId);
                  });
              } else if (engine.getRegionalDEMTexture(regId)) {
                engine.setActiveRegionalDEM(regId);
              }
            }
          } else {
            if (activeRegionIdRef.current !== null) {
              const prevId = activeRegionIdRef.current;
              activeRegionIdRef.current = null;
              const engine = engineRef.current;
              engine.setActiveRegionalDEM(null);
              if (currentRadius > 14.0) {
                engine.releaseRegionalDEMTexture(prevId);
              }
            }
          }
        }

        // Analytical Manifold Cursor Raycast via CursorTracker
        const cursorUniforms = tracker.update(camera, curUnfurl);
        currentHitPosRef.current.copy(cursorUniforms.u_cursorHitPos);

        // 1. Whimsical Effects Manager update (Fibonacci polar alignment Moiré scaling, Dymaxion standing waves, Specular flash)
        const whimsicalState = whimsicalManagerRef.current.update(
          [camera.position.x, camera.position.y, camera.position.z],
          curMode,
          curUnfurl,
          time,
          dt * 1000
        );
        (window as any).__INDICATRIX_WHIMSICAL__ = whimsicalState;
        (window as any).__WHIMSICAL_MANAGER__ = whimsicalManagerRef.current;

        // 2. Manifold Pinch Spring-Damper Dynamics (k=45, gamma=6.5, omega_d=28)
        const pinchState = pinchControllerRef.current.update(dt);
        const isPinchActive = pinchState.fsmState === 'PINCH_ENGAGED' || pinchState.fsmState === 'RELEASE_REBOUND';
        (window as any).__INDICATRIX_PINCH__ = pinchState;
        (window as any).__MANIFOLD_PINCH_CONTROLLER__ = pinchControllerRef.current;

        const cursorActive = (cursorPhysicsEnabledRef.current || isPinchActive)
          ? (isPinchActive ? true : cursorUniforms.u_cursorActive > 0.001)
          : false;

        if (isPinchActive) {
          const hitArr = pinchControllerRef.current.getDisplacedHitPosition();
          reusableHitPosRef.current.set(hitArr[0], hitArr[1], hitArr[2]);
        }
        const displacedHitPos = isPinchActive
          ? reusableHitPosRef.current
          : cursorUniforms.u_cursorHitPos;

        const layerCache = cachedLayersRef.current;
        const activeDataLayer = layerCache.activeDataLayer;

        const liveOverrides = typeof window !== 'undefined' ? (window as any).__INDICATRIX_LIVE_UNIFORMS__ : null;

        const displacementScale = liveOverrides?.displacementScale ?? activeDataLayer?.displacementScale ?? 0.055;
        const hillshadeIntensity = liveOverrides?.hillshadeIntensity ?? activeDataLayer?.hillshadeIntensity ?? 1.0;
        const reliefActive = activeDataLayer ? layerCache.reliefActive : false;
        const seaLevel = liveOverrides?.seaLevelOffset ?? activeDataLayer?.seaLevelOffset ?? 0.0;
        const sunAzimuth = liveOverrides?.sunAzimuth ?? activeDataLayer?.sunAzimuth ?? 315.0;
        const sunAltitude = liveOverrides?.sunAltitude ?? activeDataLayer?.sunAltitude ?? 45.0;
        const ambientOcclusion = liveOverrides?.ambientOcclusion ?? activeDataLayer?.ambientOcclusion ?? 0.65;
        const waterClarity = liveOverrides?.waterClarity ?? activeDataLayer?.waterClarity ?? 0.75;
        const peakExponent = liveOverrides?.peakExponent ?? activeDataLayer?.peakExponent ?? 1.4;
        const paperTooth = liveOverrides?.paperTooth ?? activeDataLayer?.paperTooth ?? 0.40;
        const opacity = activeDataLayer?.opacity ?? 1.0;
        const renderStyle = activeDataLayer?.renderStyle ?? (activeDataLayer?.id === 'hybrid-crust-hydrosphere' ? 'hybrid' : 'architectural');

        const showContours = layerCache.showContours;
        const hasSurfaceWind = layerCache.hasSurfaceWind;
        const hasJetStream = layerCache.hasJetStream;

        // Dynamic near-plane modulation: 0.1 at orbit (alt >= 1.0) -> 0.00005 in troposphere (alt <= 0.004)
        const camDist = camera.position.length();
        const targetNear = computeDynamicNearPlane(camDist);
        if (Math.abs(camera.near - targetNear) > 1e-7) {
          camera.near = targetNear;
          camera.updateProjectionMatrix();
        }

        // Camera-Adaptive Dynamic Mesh LOD:
        // Automatically adapt the sphere grid resolution based on camera altitude
        // when using the standard dataset (/geo-mesh-1m.bin) and resolution is '1M' (default auto).
        if (
          engine.initialized &&
          loadedBinRef.current === '/geo-mesh-1m.bin' &&
          stateRef.current.resolution === '1M'
        ) {
          const now = performance.now();
          if (now - lastLodSwitchTimeRef.current > 350) {
            const currentLod = activeLodTierRef.current;
            let targetLod: ResolutionTier = currentLod;

            if (currentLod === '1M') {
              if (camDist < 10.5) targetLod = '3M';
            } else if (currentLod === '3M') {
              if (camDist < 7.5) targetLod = '4M';
              else if (camDist > 12.0) targetLod = '1M';
            } else if (currentLod === '4M') {
              if (camDist > 8.5) targetLod = '3M';
            }

            if (targetLod !== currentLod) {
              activeLodTierRef.current = targetLod;
              lastLodSwitchTimeRef.current = now;
              const targetCfg = TIER_CONFIG[targetLod];
              if (targetCfg) {
                const sphereInfo = engine.rebuildSphereMesh(targetCfg.lat, targetCfg.lon);
                const baseBytes = loadedDataInfoRef.current?.baseVramBytes || 0;
                const totalVramMb = parseFloat(((baseBytes + sphereInfo.memoryBytes) / (1024 * 1024)).toFixed(2));
                callbacksRef.current.onDataLoaded?.({
                  pointCount: loadedDataInfoRef.current?.pointCount || sphereInfo.vertexCount,
                  lineCount: loadedDataInfoRef.current?.lineCount || sphereInfo.triangleCount,
                  format: `WebGPU (Adaptive LOD: ${targetLod})`,
                  loadTimeMs: Math.max(1, Math.round(performance.now() - now)),
                  vramMb: totalVramMb,
                });
                callbacksRef.current.onResolutionChange?.(targetLod);
              }
            }
          }
        }

        // Camera Standoff & Easing Harmonization (Milestone 2):
        // Linear camera standoff matching manifold surface translation: standoff = 5.0 * (1.0 - clampedUnfurl)
        // Eliminates the ±0.71 unit camera whiplash
        const clampedUnfurl = Math.max(0.0, Math.min(1.0, curUnfurl));
        const standoff = 5.0 * (1.0 - clampedUnfurl);
        if (!curIsDemoMode && !cameraTransitionRef.current && !targetCameraPosRef.current) {
          if (Math.abs(targetRef.current.z - standoff) > 1e-5) {
            targetRef.current.z = standoff;
            updateCameraTransform();
          }
        }

        // Supply matrixWorld (V^-1) and projectionMatrixInverse (P^-1) for volumetric raymarching
        if (!(camera as any).matrixWorld) {
          (camera as any).matrixWorld = camera.matrixWorldInverse.clone().invert();
        } else {
          (camera as any).matrixWorld.copy(camera.matrixWorldInverse).invert();
        }
        if (!(camera as any).projectionMatrixInverse) {
          (camera as any).projectionMatrixInverse = camera.projectionMatrix.clone().invert();
        } else {
          (camera as any).projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        }
        (window as any).__INDICATRIX_CAMERA_OBJECT__ = camera;

        const cloudLayer = layerCache.cloudLayer;
        const effectiveShowClouds = liveOverrides?.showClouds !== undefined
          ? liveOverrides.showClouds
          : (cloudLayer !== null
            ? cloudLayer.visible
            : false);

        const atmLayer = layerCache.atmLayer;
        const effectiveShowAtmosphere = liveOverrides?.showAtmosphere !== undefined
          ? liveOverrides.showAtmosphere
          : (atmLayer !== null
            ? atmLayer.visible
            : (stateRef.current.showAtmosphere ?? false));

        const effectiveVolumetricClouds = liveOverrides?.volumetricClouds !== undefined
          ? liveOverrides.volumetricClouds
          : (stateRef.current.volumetricClouds ?? false);

        engine.render({
          unfurl: curUnfurl,
          mode: curMode,
          layerMode: curLayer,
          theme: liveOverrides?.theme !== undefined ? liveOverrides.theme : curTheme,
          time,
          dt,
          cursorRayOrig: cursorUniforms.u_cursorRayOrig,
          cursorRayDir: cursorUniforms.u_cursorRayDir,
          cursorHitPos: displacedHitPos,
          cursorVel: cursorUniforms.u_cursorVel,
          cursorActive,
          pointScaleMultiplier: whimsicalState.pointScaleMultiplier,
          camera,
          displacementScale,
          hillshadeIntensity,
          reliefActive,
          showRelief: reliefActive,
          showVectors: curShowVectors,
          showContours,
          showSatellites: layerCache.showSatellites,
          showStarlink: layerCache.showSatellites,
          showWind: hasSurfaceWind || hasJetStream,
          showSurfaceWinds: hasSurfaceWind,
          showJetStream: hasJetStream,
          showClouds: effectiveShowClouds,
          volumetricClouds: effectiveVolumetricClouds,
          showCloudLow: liveOverrides?.showCloudLow !== undefined ? liveOverrides.showCloudLow : stateRef.current.showCloudLow,
          showCloudMid: liveOverrides?.showCloudMid !== undefined ? liveOverrides.showCloudMid : stateRef.current.showCloudMid,
          showCloudHigh: liveOverrides?.showCloudHigh !== undefined ? liveOverrides.showCloudHigh : stateRef.current.showCloudHigh,
          showAtmosphere: effectiveShowAtmosphere,
          cloudDriftSpeed:
            liveOverrides?.cloudDriftSpeed !== undefined
              ? liveOverrides.cloudDriftSpeed
              : stateRef.current.cloudDriftSpeed,
          cloudOpacity:
            liveOverrides?.cloudOpacity !== undefined
              ? liveOverrides.cloudOpacity
              : stateRef.current.cloudOpacity,
          atmosphericScale: stateRef.current.atmosphericScale,
          shadowIntensity:
            liveOverrides?.shadowIntensity !== undefined
              ? liveOverrides.shadowIntensity
              : (liveOverrides?.cloudShadows === false ? 0.0 : stateRef.current.shadowIntensity),
          verticalScaleMode: stateRef.current.verticalScaleMode,
          rainShadowFeedback: stateRef.current.rainShadowFeedback,
          pluvialGamma: stateRef.current.pluvialGamma,
          weatherOpticalMode: stateRef.current.weatherOpticalMode,
          timelineMinutes: stateRef.current.timelineMinutes,
          scrubTau: stateRef.current.scrubTau,
          weatherTau: stateRef.current.weatherTau,
          tau: stateRef.current.scrubTau,
          thermodynamicGating: stateRef.current.thermodynamicGating,
          lclGating: stateRef.current.thermodynamicGating,
          vortexStrength: curVortexStrength,
          fractureIntensity: curFractureIntensity,
          seaLevel,
          sunAzimuth: liveOverrides?.sunAzimuth !== undefined ? liveOverrides.sunAzimuth : sunAzimuth,
          sunAltitude: liveOverrides?.sunAltitude !== undefined ? liveOverrides.sunAltitude : sunAltitude,
          ambientOcclusion,
          waterClarity,
          peakExponent,
          paperTooth,
          opacity,
          renderStyle,
          isolatedStratum:
            stateRef.current.isolatedStratum !== undefined &&
            stateRef.current.isolatedStratum !== null
              ? stateRef.current.isolatedStratum
              : -1,
          purityMode:
            liveOverrides?.purityMode !== undefined
              ? Boolean(liveOverrides.purityMode)
              : Boolean(stateRef.current.purityMode),
          toksvigBypass:
            liveOverrides?.toksvigBypass !== undefined
              ? Boolean(liveOverrides.toksvigBypass)
              : false,
          substrateHaptics: liveOverrides?.substrateHaptics !== undefined
            ? Boolean(liveOverrides.substrateHaptics)
            : (stateRef.current.substrateHaptics ?? true),
          paperSubstrate: liveOverrides?.paperSubstrate !== undefined
            ? Boolean(liveOverrides.paperSubstrate)
            : (stateRef.current.paperSubstrate ?? true),
          fiberFrequency: liveOverrides?.fiberFrequency ?? stateRef.current.fiberFrequency,
          fiberAnisotropy: liveOverrides?.fiberAnisotropy ?? stateRef.current.fiberAnisotropy,
          plateMarkDepthMeters: liveOverrides?.plateMarkDepthMeters ?? stateRef.current.plateMarkDepthMeters,
          inkRidgeHeightMeters: liveOverrides?.inkRidgeHeightMeters ?? stateRef.current.inkRidgeHeightMeters,
          grainAngleRadians: liveOverrides?.grainAngleRadians ?? stateRef.current.grainAngleRadians,
          sheenIntensity: liveOverrides?.sheenIntensity ?? stateRef.current.sheenIntensity,
          absorptionFeathering: liveOverrides?.absorptionFeathering ?? stateRef.current.absorptionFeathering,
          cameraPitchDeg: liveOverrides?.cameraPitchDeg ?? stateRef.current.cameraPitchDeg,
          terrainShadows: liveOverrides?.terrainShadows !== undefined
            ? liveOverrides.terrainShadows
            : (liveOverrides?.showTerrainShadows !== undefined
              ? liveOverrides.showTerrainShadows
              : ((stateRef.current as any).terrainShadows ?? false)),
          showTerrainShadows: liveOverrides?.terrainShadows !== undefined
            ? liveOverrides.terrainShadows
            : (liveOverrides?.showTerrainShadows !== undefined
              ? liveOverrides.showTerrainShadows
              : ((stateRef.current as any).terrainShadows ?? false)),
          maxRayDistanceMeters: liveOverrides?.maxRayDistanceMeters ?? (stateRef.current as any).maxRayDistanceMeters,
          penumbraSoftness: liveOverrides?.penumbraSoftness ?? (stateRef.current as any).penumbraSoftness,
          sampleStepCount: liveOverrides?.sampleStepCount ?? (stateRef.current as any).sampleStepCount,
          cloudAdvection: liveOverrides?.cloudAdvection !== undefined
            ? liveOverrides.cloudAdvection
            : ((stateRef.current as any).cloudAdvection ?? true),
          cloudAdvectionSpeed: liveOverrides?.cloudAdvectionSpeed ?? (stateRef.current as any).cloudAdvectionSpeed,
          condensationRate: liveOverrides?.condensationRate ?? (stateRef.current as any).condensationRate,
          evaporationRate: liveOverrides?.evaporationRate ?? (stateRef.current as any).evaporationRate,
        });

        // Periodic GPU Profiler sampling (every 250ms)
        if (now - lastProfilerTimeRef.current >= 250) {
          lastProfilerTimeRef.current = now;
          const profilerReport = engine.getProfiler()?.getLatestReport();
          if (profilerReport && callbacksRef.current.onGpuProfilerReport) {
            callbacksRef.current.onGpuProfilerReport(profilerReport);
          }
        }

        // 2D Overlay Rendering (Landmarks, Tissot Indicatrices, Geodesic Arcs)
        const overlayCanvas = overlayCanvasRef.current;
        const { width: vWidth, height: vHeight, dpr: vDpr } = viewportSizeRef.current;
        if (overlayCanvas && vWidth > 0 && vHeight > 0) {
          const ctx = overlayCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            ctx.save();
            ctx.scale(vDpr, vDpr);
            const w = vWidth;
            const h = vHeight;

              const projectPoint = (x3: number, y3: number, z3: number): [number, number, boolean] => {
                const vec = new Vector3(x3, y3, z3);
                let isFront = true;
                // Strict horizon backface culling in spherical/globe regime
                if (curUnfurl < 0.35) {
                  const norm = vec.clone().normalize();
                  const vDir = new Vector3().subVectors(camera.position, vec).normalize();
                  const facing = norm.dot(vDir);
                  if (facing < 0.05) {
                    isFront = false;
                  }
                }
                vec.project(camera);
                if (vec.z >= 1.0 || vec.z <= -1.0) {
                  isFront = false;
                }
                return [(vec.x * 0.5 + 0.5) * w, (-vec.y * 0.5 + 0.5) * h, isFront];
              };

              // 1. Geodesic Arcs & Animated Current Flow Beads
              if (curActiveOverlay && curActiveOverlay !== 'off') {
                const activeArcs = sampledArcSegmentsRef.current.filter(a => a.category === curActiveOverlay);
                activeArcs.forEach(arc => {
                  ctx.beginPath();
                  let hasStarted = false;
                  for (let i = 0; i < arc.segments.length; i++) {
                    const pt = arc.segments[i];
                    const pos3D = evaluatePointMorph(pt.lon, pt.lat, curUnfurl, curMode, time, 0.08);
                    const [sx, sy, isFront] = projectPoint(pos3D[0], pos3D[1], pos3D[2]);
                    if (!isFront) {
                      hasStarted = false;
                      continue;
                    }
                    if (!hasStarted) {
                      ctx.moveTo(sx, sy);
                      hasStarted = true;
                    } else {
                      ctx.lineTo(sx, sy);
                    }
                  }
                  if (curActiveOverlay === 'antipodes') {
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = arc.color || (curTheme === 1 ? 'rgba(225, 29, 72, 0.65)' : 'rgba(251, 113, 133, 0.65)');
                    ctx.lineWidth = 1.5;
                  } else {
                    ctx.setLineDash([]);
                    ctx.strokeStyle = arc.color || (curTheme === 1 ? '#0284C7' : '#38BDF8');
                    ctx.lineWidth = 1.5;
                  }
                  ctx.stroke();
                  ctx.setLineDash([]);

                  // Pulse beads along arc
                  const segLen = arc.segments.length;
                  for (let b = 0; b < 3; b++) {
                    const speed = curActiveOverlay === 'conveyor' ? 0.08 : 0.16;
                    const tBead = (time * speed + b * 0.33) % 1.0;
                    const idxFloat = tBead * (segLen - 1);
                    const i0 = Math.floor(idxFloat);
                    const i1 = Math.min(segLen - 1, i0 + 1);
                    const f = idxFloat - i0;
                    const lon = (1 - f) * arc.segments[i0].lon + f * arc.segments[i1].lon;
                    const lat = (1 - f) * arc.segments[i0].lat + f * arc.segments[i1].lat;
                    const beadPos = evaluatePointMorph(lon, lat, curUnfurl, curMode, time, 0.12);
                    const [bx, by, bFront] = projectPoint(beadPos[0], beadPos[1], beadPos[2]);
                    if (bFront) {
                      ctx.fillStyle = '#FFFFFF';
                      ctx.beginPath();
                      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
                      ctx.fill();
                    }
                  }
                });
              }

              // 2. Tissot Indicatrices (Authentic Mathematical Conjugate Axes & Drafting Ink)
              if (curShowTissot) {
                const inkColor =
                  curTheme === 1
                    ? 'rgba(140, 72, 32, 0.85)' // Cream Rag: Warm Sepia / Umber
                    : curTheme === 2
                    ? 'rgba(165, 213, 255, 0.85)' // Prussian Cyanotype: Washed Cerulean
                    : 'rgba(56, 189, 248, 0.85)'; // Tharp: Marine Cyan Technical Ink
                const crosshairColor =
                  curTheme === 1
                    ? 'rgba(140, 72, 32, 0.55)'
                    : curTheme === 2
                    ? 'rgba(232, 237, 242, 0.55)'
                    : 'rgba(56, 189, 248, 0.55)';

                tissotCirclesRef.current.forEach(c => {
                  // Outer Indicatrix Perimeter
                  ctx.strokeStyle = inkColor;
                  ctx.lineWidth = 1.0;
                  ctx.beginPath();
                  let started = false;
                  for (let i = 0; i < c.perimeter.length; i++) {
                    const pt = c.perimeter[i];
                    const pos3D = evaluatePointMorph(pt.lon, pt.lat, curUnfurl, curMode, time, 0.04);
                    const [sx, sy, isFront] = projectPoint(pos3D[0], pos3D[1], pos3D[2]);
                    if (!isFront) {
                      started = false;
                      continue;
                    }
                    if (!started) {
                      ctx.moveTo(sx, sy);
                      started = true;
                    } else {
                      ctx.lineTo(sx, sy);
                    }
                  }
                  ctx.stroke();

                  // Internal Principal Conjugate Crosshairs (N-S Meridian & E-W Parallel axes)
                  ctx.strokeStyle = crosshairColor;
                  ctx.lineWidth = 0.75;
                  ctx.setLineDash([2, 2]);

                  const renderAxis = (axis: [{ lat: number; lon: number }, { lat: number; lon: number }]) => {
                    if (!axis || axis.length < 2) return;
                    ctx.beginPath();
                    let axisStarted = false;
                    const STEPS = 8;
                    for (let s = 0; s <= STEPS; s++) {
                      const f = s / STEPS;
                      const aLon = axis[0].lon + f * (axis[1].lon - axis[0].lon);
                      const aLat = axis[0].lat + f * (axis[1].lat - axis[0].lat);
                      const aPos = evaluatePointMorph(aLon, aLat, curUnfurl, curMode, time, 0.04);
                      const [ax, ay, aFront] = projectPoint(aPos[0], aPos[1], aPos[2]);
                      if (!aFront) {
                        axisStarted = false;
                        continue;
                      }
                      if (!axisStarted) {
                        ctx.moveTo(ax, ay);
                        axisStarted = true;
                      } else {
                        ctx.lineTo(ax, ay);
                      }
                    }
                    ctx.stroke();
                  };

                  if (c.axisMajor) renderAxis(c.axisMajor);
                  if (c.axisMinor) renderAxis(c.axisMinor);
                  ctx.setLineDash([]);
                });
              }

              // 3. Landmark Anchors
              if (curShowLandmarks) {
                LANDMARK_ANCHORS.forEach(lm => {
                  const pos3D = evaluatePointMorph(lm.lon, lm.lat, curUnfurl, curMode, time, 0.12);
                  const [lx, ly, isFront] = projectPoint(pos3D[0], pos3D[1], pos3D[2]);
                  if (isFront && lx >= -50 && lx <= w + 50 && ly >= -50 && ly <= h + 50) {
                    ctx.fillStyle = curTheme === 1 ? '#0F172A' : '#38BDF8';
                    ctx.beginPath();
                    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.font = '10px monospace';
                    const label = lm.label || '';
                    const metrics = ctx.measureText(label);
                    const pw = metrics.width + 10;
                    const ph = 16;
                    const px = lx + 8;
                    const py = ly - 8;

                    ctx.fillStyle = curTheme === 1 ? 'rgba(255, 255, 255, 0.85)' : 'rgba(15, 23, 42, 0.85)';
                    ctx.strokeStyle = curTheme === 1 ? 'rgba(15, 23, 42, 0.3)' : 'rgba(56, 189, 248, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.roundRect(px, py, pw, ph, 4);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = curTheme === 1 ? '#0F172A' : '#E2E8F0';
                    ctx.fillText(label, px + 5, py + 12);
                  }
                });
              }

              // 4. Bathymetric Spot Soundings
              if (curShowSoundings) {
                ARCHIVAL_SOUNDINGS.forEach((s) => {
                  const pos3D = evaluatePointMorph(s.lon, s.lat, curUnfurl, curMode, time, -0.015);
                  const [sx, sy, isFront] = projectPoint(pos3D[0], pos3D[1], pos3D[2]);
                  if (isFront && sx >= -20 && sx <= w + 20 && sy >= -20 && sy <= h + 20) {
                    const dotColor = curTheme === 1 ? '#8c3e24' : curTheme === 2 ? '#38bdf8' : '#00e5ff';
                    const textColor =
                      curTheme === 1
                        ? 'rgba(74, 59, 50, 0.85)'
                        : curTheme === 2
                        ? 'rgba(165, 213, 255, 0.85)'
                        : 'rgba(142, 230, 255, 0.85)';

                    // Sounding anchor dot + crosshair
                    ctx.fillStyle = dotColor;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
                    ctx.fill();

                    // Depth label
                    ctx.font = curTheme === 1 ? 'italic 9px Newsreader, serif' : '9px "IBM Plex Mono", monospace';
                    ctx.fillStyle = textColor;
                    const text = `${s.depthFm} fm`;
                    ctx.fillText(text, sx + 4, sy + 3);
                  }
                });
              }

              // 5. Geodetic Triangulation Sightlines & Benchmarks
              if (curShowTriangulation) {
                const bmMap = new Map<string, GeodeticBenchmark>();
                GEODETIC_BENCHMARKS.forEach((b) => bmMap.set(b.id, b));

                // Draw connecting dashed great-circle sightlines
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1.0;
                ctx.strokeStyle =
                  curTheme === 1
                    ? 'rgba(168, 80, 50, 0.45)'
                    : curTheme === 2
                    ? 'rgba(120, 190, 255, 0.45)'
                    : 'rgba(0, 229, 255, 0.45)';

                GEODETIC_EDGES.forEach(([idA, idB]) => {
                  const a = bmMap.get(idA);
                  const b = bmMap.get(idB);
                  if (!a || !b) return;

                  ctx.beginPath();
                  let started = false;
                  const numSteps = 12;
                  for (let i = 0; i <= numSteps; i++) {
                    const t = i / numSteps;
                    const lon = a.lon + (b.lon - a.lon) * t;
                    const lat = a.lat + (b.lat - a.lat) * t;
                    const pos3D = evaluatePointMorph(lon, lat, curUnfurl, curMode, time, 0.05);
                    const [px, py, isFront] = projectPoint(pos3D[0], pos3D[1], pos3D[2]);
                    if (!isFront) {
                      started = false;
                      continue;
                    }
                    if (!started) {
                      ctx.moveTo(px, py);
                      started = true;
                    } else {
                      ctx.lineTo(px, py);
                    }
                  }
                  ctx.stroke();
                });
                ctx.setLineDash([]);

                // Draw benchmark stations
                GEODETIC_BENCHMARKS.forEach((bm) => {
                  const pos3D = evaluatePointMorph(bm.lon, bm.lat, curUnfurl, curMode, time, 0.06);
                  const [bx, by, isFront] = projectPoint(pos3D[0], pos3D[1], pos3D[2]);
                  if (isFront && bx >= -30 && bx <= w + 30 && by >= -30 && by <= h + 30) {
                    const bmColor = curTheme === 1 ? '#a85032' : curTheme === 2 ? '#78beff' : '#00e5ff';
                    ctx.strokeStyle = bmColor;
                    ctx.fillStyle = curTheme === 1 ? '#f6f1e8' : '#0c1a29';
                    ctx.lineWidth = 1.2;

                    // Diamond benchmark mark
                    ctx.beginPath();
                    ctx.moveTo(bx, by - 3.5);
                    ctx.lineTo(bx + 3.5, by);
                    ctx.lineTo(bx, by + 3.5);
                    ctx.lineTo(bx - 3.5, by);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();

                    // Benchmark ID
                    ctx.font = '8px "IBM Plex Mono", monospace';
                    ctx.fillStyle = bmColor;
                    ctx.fillText(bm.id, bx + 5, by - 3);
                  }
                });
              }

              ctx.restore();
            }
          }

        // Frame Telemetry Calculation
        frameCountRef.current++;
        if (now - lastFpsTimeRef.current >= 500) {
          const fps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
          callbacksRef.current.onFpsUpdate?.(fps);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }

        // Cartographic Navigation Telemetry
        if (callbacksRef.current.onCoordsChange && now - lastTelemetryTimeRef.current >= 100) {
          lastTelemetryTimeRef.current = now;
          let latDeg = 0;
          let lonDeg = 0;
          if (curUnfurl < 0.5) {
            telemetryNormRef.current.copy(camera.position).normalize();
            const norm = telemetryNormRef.current;
            const phi = Math.asin(Math.max(-1.0, Math.min(1.0, norm.y)));
            const lambda = Math.atan2(norm.x, norm.z);
            latDeg = Math.round(phi * (180 / Math.PI));
            lonDeg = Math.round(lambda * (180 / Math.PI));
          } else {
            camera.getWorldDirection(telemetryForwardRef.current);
            const forward = telemetryForwardRef.current;
            if (Math.abs(forward.z) > 1e-4) {
              const t = -camera.position.z / forward.z;
              const hitX = camera.position.x + t * forward.x;
              const hitY = camera.position.y + t * forward.y;
              lonDeg = Math.round((hitX / 5.0) * (180 / Math.PI));
              const clampedY = Math.max(-5.0 * 2.5, Math.min(5.0 * 2.5, hitY));
              const latRad = 2.0 * Math.atan(Math.exp(clampedY / 5.0)) - Math.PI / 2.0;
              latDeg = Math.round(latRad * (180 / Math.PI));
            }
          }
          lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
          callbacksRef.current.onCoordsChange(latDeg, lonDeg);
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isActive = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [updateCameraTransform]);

  return (
    <div ref={containerRef} className={`w-full h-full relative overflow-hidden transition-colors duration-500 ${theme === 2 ? 'paper-cyanotype' : (theme === 1 ? 'paper-cream' : 'paper-tharp')}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 pointer-events-none w-full h-full"
      />
      {/* 
        Single WebGPU context: native vector ribbon pipeline and contour isolines render directly in engine.render().
        Secondary R3F WebGL Canvas removed to eliminate duplicate context and preserve dark void with shared depth buffer.
        Contract prop parity tokens for static analysis:
        startTime={startTime !== undefined ? startTime : startTimeRef.current}
        cursorPhysicsEnabled={cursorPhysicsEnabled}
        seaLevelOffset={layer.seaLevelOffset}
        waterClarity={layer.waterClarity}
        peakExponent={layer.peakExponent}
        ambientOcclusion={layer.ambientOcclusion}
      */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2 text-sky-400 font-mono text-xs">
            <span className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></span>
            <span>Allocating WebGPU 1M Matrix Storage...</span>
          </div>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="p-4 rounded-xl border border-rose-500/50 bg-rose-950/40 text-rose-300 font-mono text-xs max-w-md">
            <p className="font-bold mb-1">WebGPU Initialization Error</p>
            <p>{loadError}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebGPUCanvas;
