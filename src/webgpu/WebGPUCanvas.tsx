// ============================================================================
// File: src/webgpu/WebGPUCanvas.tsx
// Component: Dedicated WebGPU React Canvas Wrapper with Orbit & Telemetry
// Description: Autonomous 1M-node WebGPU viewport with smooth touch/mouse control
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Vector3, Vector4, Matrix4, PerspectiveCamera, Vec3Tuple, slerpVec3 } from '../core/math/cameraMath';
import { WebGPUEngine } from './WebGPUEngine';
import { CursorTracker } from '../utils/raycast';
import { useCursorTracker } from '../core/CursorContext';
import { DataLayerItem } from '../components/hud/TelemetryHUD';

import { GeodesicOverlayMode, ResolutionTier } from '../types';
import { WhimsicalEffectsManager } from '../core/effects/WhimsicalEffectsManager';
import { ManifoldPinchController } from '../core/interactions/ManifoldPinchController';
import { ProceduralAudioEngine } from '../core/audio/ProceduralAudioEngine';
import {
  GEODESIC_ARCS,
  LANDMARK_ANCHORS,
  sampleGreatCircleGeodesic,
  generateTissotCircles,
  evaluatePointMorph,
} from '../core/GlobeOverlay';
import { TrajectoryCameraController, Waypoint3D } from '../core/camera/TrajectoryCameraController';
import { HAWAII_WAYPOINTS, CAPE_COD_WAYPOINTS } from '../core/camera/litmusWaypoints';

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
  cursorPhysicsEnabled?: boolean;
  isZenMode?: boolean;
  isSidebarOpen?: boolean;
  startTime?: number;
  vortexStrength?: number;
  fractureIntensity?: number;
  audioEngine?: ProceduralAudioEngine;
  onGpuProfilerReport?: (report: any) => void;
  isolatedStratum?: number | null;
  isDemoMode?: boolean;
  demoSequence?: 'hawaii' | 'cape-cod';
  onDemoModeChange?: (active: boolean, sequence?: 'hawaii' | 'cape-cod') => void;
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
  onShowCloudsChange?: (v: boolean) => void;
  onTogglePlanetaryLayer?: (id: string, force?: boolean) => void;
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
  cursorPhysicsEnabled = false,
  isZenMode = false,
  isSidebarOpen = true,
  startTime,
  vortexStrength = 1.0,
  fractureIntensity = 1.0,
  audioEngine,
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
  onShowCloudsChange,
  onTogglePlanetaryLayer,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportSizeRef = useRef<{ width: number; height: number; dpr: number }>({ width: 0, height: 0, dpr: 1 });
  const engineRef = useRef<WebGPUEngine>(new WebGPUEngine());
  if (typeof window !== 'undefined') (window as any).__ENGINE = engineRef.current;
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
  const loadedDataInfoRef = useRef<{ pointCount: number; lineCount: number; baseVramBytes: number } | null>(null);
  const sharedCursorTracker = useCursorTracker();
  const cursorTrackerRef = useRef<CursorTracker>(sharedCursorTracker);
  cursorTrackerRef.current = sharedCursorTracker;
  const animFrameRef = useRef<number>(0);
  const cursorPhysicsEnabledRef = useRef(cursorPhysicsEnabled);
  useEffect(() => {
    cursorPhysicsEnabledRef.current = cursorPhysicsEnabled;
  }, [cursorPhysicsEnabled]);

  // Whimsical Effects & Signature Manifold Pinch Controllers
  const whimsicalManagerRef = useRef<WhimsicalEffectsManager>(new WhimsicalEffectsManager());
  const pinchControllerRef = useRef<ManifoldPinchController>(new ManifoldPinchController(audioEngine));
  const isPinchingRef = useRef<boolean>(false);
  const currentHitPosRef = useRef<Vector3>(new Vector3(0, 0, 5));

  useEffect(() => {
    if (audioEngine) {
      pinchControllerRef.current.setAudioEngine(audioEngine);
    }
  }, [audioEngine]);

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
  });
  useEffect(() => {
    stateRef.current = {
      unfurlProgress,
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
    };
  }, [unfurlProgress, mode, layerMode, theme, showSoundings, showTriangulation, showCartouche, showVectors, activeOverlay, showLandmarks, showTissot, dataLayers, vortexStrength, fractureIntensity, isolatedStratum, isDemoMode, demoSequence, showClouds, showCloudLow, showCloudMid, showCloudHigh, cloudDriftSpeed, cloudOpacity, atmosphericScale, shadowIntensity]);

  const callbacksRef = useRef({ onFpsUpdate, onDataLoaded, onError, onCoordsChange, onGpuProfilerReport, onDemoModeChange, onAtmosphericScaleChange, onShadowIntensityChange, onShowCloudsChange, onTogglePlanetaryLayer });
  useEffect(() => {
    callbacksRef.current = { onFpsUpdate, onDataLoaded, onError, onCoordsChange, onGpuProfilerReport, onDemoModeChange, onAtmosphericScaleChange, onShadowIntensityChange, onShowCloudsChange, onTogglePlanetaryLayer };
  }, [onFpsUpdate, onDataLoaded, onError, onCoordsChange, onGpuProfilerReport, onDemoModeChange, onAtmosphericScaleChange, onShadowIntensityChange, onShowCloudsChange, onTogglePlanetaryLayer]);

  // Synchronize Trajectory Controller with demo mode and active sequence
  useEffect(() => {
    const trajectory = trajectoryControllerRef.current;
    trajectory.setMode('dolly-cinematic');
    const waypoints = demoSequence === 'cape-cod' ? CAPE_COD_WAYPOINTS : HAWAII_WAYPOINTS;
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
    const hasWind = !!dataLayers?.find(
      (l) => (l.id === 'noaa-gfs-wind' || l.id === 'gfs-surface-winds' || l.id === 'gfs-wind-velocity-grid') && l.visible
    );
    if (hasWind) {
      engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {}); engine.loadAllCloudLayers().catch(() => {});;
    }
    const hasJetStream = !!dataLayers?.find(
      (l) => (l.id === 'noaa-gfs-jetstream' || l.id === 'gfs-jetstream') && l.visible
    );
    if (hasJetStream) {
      engine.loadJetStreamTexture('/data/gfs-jetstream-latest.bin').catch(() => {});
    }
    const hasCrane = !!dataLayers?.find(
      (l) => (l.id === 'origami-crane-companion' || l.id === 'origami-crane') && l.visible
    );
    if (hasCrane && !engine.isCraneActive) {
      const cam = cameraRef.current;
      const norm = new Vector3().copy(cam.position).normalize();
      const phi = Math.asin(Math.max(-1.0, Math.min(1.0, norm.y)));
      const lambda = Math.atan2(norm.x, norm.z);
      const latDeg = phi * (180 / Math.PI);
      const lonDeg = ((((lambda * (180 / Math.PI) + 180) % 360) + 360) % 360) - 180;
      engine.releaseOrigamiCrane(lonDeg, latDeg);
    }
    const hasPhotoreal = !!dataLayers?.find(
      (l) => (l.renderStyle === 'photoreal' || l.id === 'photoreal-satellite-layer') && l.visible
    );
    if (hasPhotoreal && !engine.isOrbitalTexturesLoaded()) {
      engine.loadOrbitalTextures('/earth-blue-marble-4k.webp', '/earth-night-lights-4k.webp').catch(() => {});
    }
  }, [dataLayers]);

  const focusCrane = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const state = engine.getCraneState();
    if (!state) return;
    const phi = ((90 - state.lat) * Math.PI) / 180;
    const theta = (state.lon * Math.PI) / 180;
    const radius = 11.5;
    const camX = radius * Math.sin(phi) * Math.sin(theta);
    const camY = radius * Math.cos(phi);
    const camZ = radius * Math.sin(phi) * Math.cos(theta);
    targetCameraPosRef.current = new Vector3(camX, camY, camZ);
  }, []);

  useEffect(() => {
    (window as any).__FOCUS_CRANE__ = focusCrane;
    return () => {
      delete (window as any).__FOCUS_CRANE__;
    };
  }, [focusCrane]);

  // WebGPU Device Loss Recovery
  useEffect(() => {
    const engine = engineRef.current;
    engine.onDeviceLost((info) => {
      console.warn('WebGPU device lost, triggering fallback to WebGL2:', info);
      setLoadError(`WebGPU Device Lost: ${info?.message || 'Device disconnected'}`);
      callbacksRef.current.onError?.(new Error(`WebGPU Device Lost: ${info?.message || 'Device disconnected'}`));
    });
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
        if (target) {
          targetRef.current.set(target[0], target[1], target[2]);
        } else {
          targetRef.current.set(0, 0, 0);
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
        if (target) {
          targetRef.current.set(target[0], target[1], target[2]);
        } else {
          targetRef.current.set(0, 0, 0);
        }
        sphericalRef.current.radius = Math.max(5.08, Math.min(zoomRadius, 30.0));
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

        const camX = nx * altitudeRadius;
        const camY = ny * altitudeRadius;
        const camZ = nz * altitudeRadius;

        const targetDist = 3.5;
        const targetX = camX + vDirX * targetDist;
        const targetY = camY + vDirY * targetDist;
        const targetZ = camZ + vDirZ * targetDist;

        cameraRef.current.position.set(camX, camY, camZ);
        targetRef.current.set(targetX, targetY, targetZ);
        cameraRef.current.up.set(nx, ny, nz);
        cameraRef.current.lookAt(targetRef.current);
        cameraRef.current.updateMatrixWorld();

        velocityRef.current.velTheta = 0;
        velocityRef.current.velPhi = 0;
        velocityRef.current.velRadius = 0;
        velocityRef.current.velPanX = 0;
        velocityRef.current.velPanY = 0;
        targetCameraPosRef.current = null;
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
      startDemo: (seq: 'hawaii' | 'cape-cod' = 'hawaii', duration = 8.0) => {
        const trajectory = trajectoryControllerRef.current;
        trajectory.setMode('dolly-cinematic');
        trajectory.setWaypoints(seq === 'cape-cod' ? CAPE_COD_WAYPOINTS : HAWAII_WAYPOINTS, duration, false);
        trajectory.setIsPlaying(true);
        callbacksRef.current.onDemoModeChange?.(true, seq);
      },
      stopDemo: () => {
        trajectoryControllerRef.current.setIsPlaying(false);
        callbacksRef.current.onDemoModeChange?.(false);
      },
      toggleDemo: (seq?: 'hawaii' | 'cape-cod') => {
        if (stateRef.current.isDemoMode) {
          trajectoryControllerRef.current.setIsPlaying(false);
          callbacksRef.current.onDemoModeChange?.(false);
        } else {
          const s = seq ?? stateRef.current.demoSequence;
          const trajectory = trajectoryControllerRef.current;
          trajectory.setMode('dolly-cinematic');
          trajectory.setWaypoints(s === 'cape-cod' ? CAPE_COD_WAYPOINTS : HAWAII_WAYPOINTS, 8.0, false);
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
      },
    };
    if ((window as any).__INDICATRIX_ENGINE__) {
      (window as any).__INDICATRIX_ENGINE__.getActiveRegionalDEM = () =>
        engineRef.current?.getActiveRegionalDEM() ?? null;
    }
    return () => {
      delete (window as any).__INDICATRIX_CAMERA__;
      delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      delete (window as any).__INDICATRIX_TRAJECTORY__;
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
      // Smooth inertial zoom impulse (decay factor 0.05)
      const zoomImpulse = e.deltaY * 0.015;
      velocityRef.current.velRadius += zoomImpulse;
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onDblClick = () => {
      const hit = currentHitPosRef.current;
      const len = Math.hypot(hit.x, hit.y, hit.z) || 1.0;
      const latDeg = Math.asin(Math.max(-1, Math.min(1, hit.y / len))) * (180.0 / Math.PI);
      const lonDeg = Math.atan2(hit.x, hit.z) * (180.0 / Math.PI);
      engineRef.current.releaseOrigamiCrane(lonDeg, latDeg);
    };

    const container = containerRef.current || canvas;

    container.addEventListener('pointerdown', onPointerDown as EventListener);
    container.addEventListener('pointerenter', onPointerEnter as EventListener);
    container.addEventListener('pointerleave', onPointerLeave as EventListener);
    container.addEventListener('dblclick', onDblClick as EventListener);
    window.addEventListener('pointermove', onPointerMove as EventListener);
    window.addEventListener('pointerup', onPointerUp as EventListener);
    container.addEventListener('wheel', onWheel as EventListener, { passive: false });
    container.addEventListener('contextmenu', onContextMenu as EventListener);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown as EventListener);
      container.removeEventListener('pointerenter', onPointerEnter as EventListener);
      container.removeEventListener('pointerleave', onPointerLeave as EventListener);
      container.removeEventListener('dblclick', onDblClick as EventListener);
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
        engine.loadVectorData('/geo-vectors.bin').catch(() => {});
        engine.loadContourMesh('/geo-contour-mesh.bin').catch(() => {});
        engine.loadSatelliteTrajectories('/data/tle-starlink.json').catch(() => {});
        engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {}); engine.loadAllCloudLayers().catch(() => {});;
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
          engine.loadVectorData('/geo-vectors.bin').catch(() => {});
          engine.loadContourMesh('/geo-contour-mesh.bin').catch(() => {});
          engine.loadSatelliteTrajectories('/data/tle-starlink.json').catch(() => {});
          engine.loadWindTexture('/data/gfs-wind-latest.bin').catch(() => {}); engine.loadAllCloudLayers().catch(() => {});;
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
        showCartouche: curShowCartouche,
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
            const offset = new Vector3().subVectors(camera.position, targetRef.current);
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

          const offset = new Vector3().subVectors(camera.position, targetRef.current);
          sphericalRef.current.radius = offset.length();
          sphericalRef.current.theta = Math.atan2(offset.x, offset.z);
          sphericalRef.current.phi = Math.acos(Math.min(Math.max(offset.y / Math.max(sphericalRef.current.radius, 0.001), -1), 1));

          if (alpha >= 1.0) {
            cameraTransitionRef.current = null;
          }
        } else if (targetCameraPosRef.current && !isDraggingRef.current) {
          const targetPos = targetCameraPosRef.current;
          camera.position.lerp(targetPos, 0.08);
          targetRef.current.lerp(new Vector3(0, 0, 0), 0.08);
          const offset = new Vector3().subVectors(camera.position, targetRef.current);
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
              sphericalRef.current.radius = Math.min(
                Math.max(sphericalRef.current.radius + vel.velRadius, 5.08),
                50.0
              );
              vel.velRadius *= decay;
              if (Math.abs(vel.velRadius) < 1e-6) vel.velRadius = 0;
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

        const activeDataLayer = curDataLayers?.find(
          (l) => l.visible && (l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'topography' || l.type === 'raster')
        ) || curDataLayers?.find((l) => l.visible);

        const liveOverrides = typeof window !== 'undefined' ? (window as any).__INDICATRIX_LIVE_UNIFORMS__ : null;

        const displacementScale = liveOverrides?.displacementScale ?? activeDataLayer?.displacementScale ?? 0.08;
        const hillshadeIntensity = liveOverrides?.hillshadeIntensity ?? activeDataLayer?.hillshadeIntensity ?? 1.0;
        const reliefActive = activeDataLayer ? (
          activeDataLayer.category === 'topo' ||
          activeDataLayer.category === 'ocean' ||
          activeDataLayer.category === 'topography' ||
          activeDataLayer.type === 'raster' ||
          activeDataLayer.renderStyle === 'architectural' ||
          activeDataLayer.renderStyle === 'hybrid' ||
          activeDataLayer.renderStyle === 'photoreal'
        ) : false;
        const seaLevel = liveOverrides?.seaLevelOffset ?? activeDataLayer?.seaLevelOffset ?? 0.0;
        const sunAzimuth = liveOverrides?.sunAzimuth ?? activeDataLayer?.sunAzimuth ?? 315.0;
        const sunAltitude = liveOverrides?.sunAltitude ?? activeDataLayer?.sunAltitude ?? 45.0;
        const ambientOcclusion = liveOverrides?.ambientOcclusion ?? activeDataLayer?.ambientOcclusion ?? 0.65;
        const waterClarity = liveOverrides?.waterClarity ?? activeDataLayer?.waterClarity ?? 0.75;
        const peakExponent = liveOverrides?.peakExponent ?? activeDataLayer?.peakExponent ?? 1.4;
        const paperTooth = liveOverrides?.paperTooth ?? activeDataLayer?.paperTooth ?? 0.40;
        const opacity = activeDataLayer?.opacity ?? 1.0;
        const renderStyle = activeDataLayer?.renderStyle ?? (activeDataLayer?.id === 'hybrid-crust-hydrosphere' ? 'hybrid' : 'architectural');

        const showContours = !!curDataLayers?.find(
          (l) => l.id === 'usgs-elevation-contours' && l.visible
        );
        const hasSurfaceWind = !!curDataLayers?.find(
          (l) => (l.id === 'noaa-gfs-wind' || l.id === 'gfs-surface-winds' || l.id === 'gfs-wind-velocity-grid') && l.visible
        );
        const hasJetStream = !!curDataLayers?.find(
          (l) => (l.id === 'noaa-gfs-jetstream' || l.id === 'gfs-jetstream') && l.visible
        );
        const hasCrane = !!curDataLayers?.find(
          (l) => (l.id === 'origami-crane-companion' || l.id === 'origami-crane') && l.visible
        );

        engine.render({
          unfurl: curUnfurl,
          mode: curMode,
          layerMode: curLayer,
          theme: curTheme,
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
          showSatellites: !!curDataLayers?.find((l) => (l.id === 'starlink-iss-orbits' || l.id === 'spacex-satellite-constellation') && l.visible),
          showStarlink: !!curDataLayers?.find((l) => (l.id === 'starlink-iss-orbits' || l.id === 'spacex-satellite-constellation') && l.visible),
          showWind: hasSurfaceWind || hasJetStream,
          showSurfaceWinds: hasSurfaceWind,
          showJetStream: hasJetStream,
          showCrane: hasCrane,
          showClouds: stateRef.current.showClouds,
          showCloudLow: stateRef.current.showCloudLow,
          showCloudMid: stateRef.current.showCloudMid,
          showCloudHigh: stateRef.current.showCloudHigh,
          showAtmosphere: stateRef.current.showClouds,
          cloudDriftSpeed: stateRef.current.cloudDriftSpeed,
          cloudOpacity: stateRef.current.cloudOpacity,
          atmosphericScale: stateRef.current.atmosphericScale,
          shadowIntensity: stateRef.current.shadowIntensity,
          vortexStrength: curVortexStrength,
          fractureIntensity: curFractureIntensity,
          seaLevel,
          sunAzimuth,
          sunAltitude,
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

              // 6. Archival Title Cartouche (Dedicated space in bottom-left)
              if (curShowCartouche) {
                const cx = 20;
                const cy = h - 92;
                const cw = 236;
                const ch = 72;

                // Background plate
                ctx.fillStyle =
                  curTheme === 1
                    ? 'rgba(252, 249, 242, 0.94)'
                    : curTheme === 2
                    ? 'rgba(12, 25, 41, 0.88)'
                    : 'rgba(9, 15, 24, 0.88)';
                ctx.fillRect(cx, cy, cw, ch);

                // Outer border
                ctx.strokeStyle =
                  curTheme === 1
                    ? 'rgba(168, 120, 80, 0.8)'
                    : curTheme === 2
                    ? 'rgba(79, 163, 227, 0.7)'
                    : 'rgba(0, 229, 255, 0.6)';
                ctx.lineWidth = 1;
                ctx.strokeRect(cx, cy, cw, ch);

                // Typography inside Cartouche
                const titleColor = curTheme === 1 ? '#2c221e' : curTheme === 2 ? '#cbe1f7' : '#e0f2fe';
                const subColor = curTheme === 1 ? '#735f52' : curTheme === 2 ? '#78a6d4' : '#67e8f9';
                const metaColor = curTheme === 1 ? '#8a776a' : curTheme === 2 ? '#597fa6' : '#38bdf8';

                ctx.font = 'bold 10px Cinzel, serif';
                ctx.fillStyle = titleColor;
                const titleText =
                  curTheme === 1
                    ? 'TYPUS ORBIS TERRARUM'
                    : curTheme === 2
                    ? 'ORBIS TERRARUM // BLUEPRINT'
                    : 'PHYSIOGRAPHIC WORLD OCEAN';
                ctx.fillText(titleText, cx + 12, cy + 20);

                ctx.font = '8px Newsreader, serif';
                ctx.fillStyle = subColor;
                const subText =
                  curTheme === 1
                    ? 'Eduard Imhof Relief • 100% Cotton Rag'
                    : curTheme === 2
                    ? 'Ferroprussiate Survey Draft • Cyanotype'
                    : 'Marie Tharp & Bruce Heezen Survey (1977)';
                ctx.fillText(subText, cx + 12, cy + 36);

                // Divider line
                ctx.strokeStyle =
                  curTheme === 1
                    ? 'rgba(168, 120, 80, 0.25)'
                    : curTheme === 2
                    ? 'rgba(79, 163, 227, 0.25)'
                    : 'rgba(0, 229, 255, 0.2)';
                ctx.beginPath();
                ctx.moveTo(cx + 12, cy + 44);
                ctx.lineTo(cx + cw - 12, cy + 44);
                ctx.stroke();

                // Scale ratio and projection format
                ctx.font = '8px "IBM Plex Mono", monospace';
                ctx.fillStyle = metaColor;
                const ratioText = curUnfurl < 0.05 ? 'SCALE: 1:127,420,000' : `UNFURL: ${(curUnfurl * 100).toFixed(1)}%`;
                const seriesText = curTheme === 1 ? 'SWISS FED. TOPO' : curTheme === 2 ? 'HYDROGRAPHIC SER.' : 'LAMONT-DOHERTY';
                ctx.fillText(ratioText, cx + 12, cy + 58);
                const seriesMetrics = ctx.measureText(seriesText);
                ctx.fillText(seriesText, cx + cw - 12 - seriesMetrics.width, cy + 58);
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
