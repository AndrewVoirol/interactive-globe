import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SimulationMode, LoadedDataInfo } from './types';
import { TelemetryHUD } from './components/hud/TelemetryHUD';
import { NavigationDock } from './components/hud/NavigationDock';
import { useEngineState } from './hooks/useEngineState';
import { useCameraKinematics } from './hooks/useCameraKinematics';
import { registerDevToolsAPI } from './core/DevToolsAPI';
import { CursorProvider } from './core/CursorContext';
import { ProceduralAudioEngine } from './core/audio/ProceduralAudioEngine';
import { useGlobeLayerManager } from './core/layers/useGlobeLayerManager';
import { GeometryLayer } from './components/canvas/GeometryLayer';
import { KinematicCameraController } from './components/canvas/KinematicCameraController';

export { GeometryLayer } from './components/canvas/GeometryLayer';
export { KinematicCameraController } from './components/canvas/KinematicCameraController';

const WebGPUCanvas = React.lazy(() => import('./webgpu/WebGPUCanvas'));
const GeodesicOverlayLayer = React.lazy(() => import('./core/GeodesicOverlayLayer').then(m => ({ default: m.GeodesicOverlayLayer })));
const DataLayerOverlay = React.lazy(() => import('./core/layers/DataLayerOverlay').then(m => ({ default: m.DataLayerOverlay })));
const VectorOverlayLayer = React.lazy(() => import('./core/VectorOverlayLayer').then(m => ({ default: m.VectorOverlayLayer })));

const RADIUS = 5.0;

export const CameraTelemetryUpdater: React.FC<{
  alpha: number;
  onCoordsChange: (latDeg: number, lonDeg: number) => void;
}> = ({ alpha, onCoordsChange }) => {
  const lastTimeRef = useRef(0);
  const lastCoordsRef = useRef({ latDeg: 0, lonDeg: 0 });

  useFrame(({ camera }) => {
    const now = performance.now();
    if (now - lastTimeRef.current < 100) return; // Throttle to 100ms
    lastTimeRef.current = now;

    let latDeg = 0;
    let lonDeg = 0;

    if (alpha < 0.5) {
      // 3D Spherical Mode: compute from normalized camera position facing center
      const normCam = camera.position.clone().normalize();
      const phi = Math.asin(Math.max(-1.0, Math.min(1.0, normCam.y)));
      const lambda = Math.atan2(normCam.x, normCam.z);
      latDeg = Math.round(phi * (180 / Math.PI));
      lonDeg = Math.round(lambda * (180 / Math.PI));
    } else {
      // Planar Map Mode: raycast camera forward direction to intersect z = 0
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      if (Math.abs(forward.z) > 1e-4) {
        const t = -camera.position.z / forward.z;
        const hitX = camera.position.x + t * forward.x;
        const hitY = camera.position.y + t * forward.y;
        lonDeg = Math.round((hitX / RADIUS) * (180 / Math.PI));
        const clampedY = Math.max(-RADIUS * 2.5, Math.min(RADIUS * 2.5, hitY));
        const latRad = 2.0 * Math.atan(Math.exp(clampedY / RADIUS)) - Math.PI / 2.0;
        latDeg = Math.round(latRad * (180 / Math.PI));
      }
    }

    // Wrap longitude into [-180, 180]
    lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;

    if (latDeg !== lastCoordsRef.current.latDeg || lonDeg !== lastCoordsRef.current.lonDeg) {
      lastCoordsRef.current = { latDeg, lonDeg };
      onCoordsChange(latDeg, lonDeg);
    }
  });

  return null;
};

export default function App() {
  const engineState = useEngineState();
  const cameraKinematics = useCameraKinematics();

  const {
    backend, setBackend,
    theme, setTheme,
    hasWebGPU,
    alpha, setAlpha,
    mode, setMode,
    layerMode, setLayerMode,
    cursorPhysicsEnabled, setCursorPhysicsEnabled,
    resolution, setResolution,
    fps, setFps,
    activeOverlay, setActiveOverlay,
    showLandmarks, setShowLandmarks,
    showTissot, setShowTissot,
    showVectors, setShowVectors,
    isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed,
    isZenMode, setIsZenMode,
    dataInfo, setDataInfo,
  } = engineState;

  const {
    cameraTarget, setCameraTarget,
    webgpuCameraPos, setWebgpuCameraPos,
    targetCameraPos, setTargetCameraPos,
    snapCamera,
  } = cameraKinematics;

  const controlsRef = useRef<any>(null);
  const appStartTimeRef = useRef(performance.now());
  const audioEngineRef = useRef<ProceduralAudioEngine>(new ProceduralAudioEngine());

  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const prevAlphaRef = useRef(alpha);

  const handleAudioMuteToggle = useCallback(() => {
    setIsAudioMuted((prev) => {
      const next = !prev;
      audioEngineRef.current.setMute(next);
      return next;
    });
  }, []);

  useEffect(() => {
    audioEngineRef.current.setMute(isAudioMuted);
  }, [isAudioMuted]);

  const {
    dataLayers,
    toasts,
    dismissToast,
    handleAddDataLayer,
    handleToggleDataLayer,
    handleRemoveDataLayer,
    handleOpacityChangeDataLayer,
    handleBlendModeChangeDataLayer,
    handleDisplacementScaleChangeDataLayer,
    handleHillshadeChangeDataLayer,
    handleReorderDataLayer,
    handleSelectRenderStyle,
  } = useGlobeLayerManager();

  const activeDirection = useMemo<'architectural' | 'hybrid' | 'photoreal' | null>(() => {
    const active = dataLayers.find(
      (l) => l.visible && (l.renderStyle === 'architectural' || l.renderStyle === 'hybrid' || l.renderStyle === 'photoreal')
    );
    return (active?.renderStyle as 'architectural' | 'hybrid' | 'photoreal') ?? null;
  }, [dataLayers]);

  // Mode-Specific Audio Synthesis Triggering
  useEffect(() => {
    const prevAlpha = prevAlphaRef.current;
    prevAlphaRef.current = alpha;

    // Mode 2: Acoustic Rupture at alpha = 0.18
    if (mode === 2 && prevAlpha < 0.18 && alpha >= 0.18) {
      audioEngineRef.current.triggerRupture(1.0);
    }

    // Mode 4: 20-Facet Dymaxion Chimes on facet boundaries
    if (mode === 4) {
      const step = 1 / 20;
      const prevStep = Math.floor(prevAlpha / step);
      const currStep = Math.floor(alpha / step);
      if (currStep !== prevStep && currStep >= 0 && currStep < 20) {
        audioEngineRef.current.triggerChime(currStep);
      }
    }
  }, [alpha, mode]);

  useEffect(() => {
    registerDevToolsAPI(engineState);
  }, [engineState]);

  const alphaRef = useRef(alpha);
  alphaRef.current = alpha;

  const glideToAlpha = useCallback((targetAlpha: number) => {
    setIsPlaying(false);
    const startAlpha = alphaRef.current;
    if (Math.abs(startAlpha - targetAlpha) < 0.001) return;
    const startTime = performance.now();
    const duration = 650;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const cur = startAlpha + (targetAlpha - startAlpha) * ease;
      setAlpha(parseFloat(cur.toFixed(4)));
      if (progress < 1.0) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'g' || e.key === 'G') {
        glideToAlpha(0.0);
      } else if (e.key === 'm' || e.key === 'M') {
        glideToAlpha(1.0);
      } else if (e.key === 'h' || e.key === 'H') {
        setIsZenMode((z) => !z);
      } else if (e.key === 't' || e.key === 'T') {
        setTheme((t) => (t === 0 ? 1 : 0));
      } else if (e.key === 'v' || e.key === 'V') {
        setShowVectors((s) => !s);
      } else if (e.key === 'b' || e.key === 'B') {
        if (hasWebGPU) {
          setBackend((b) => (b === 'webgpu' ? 'webgl2' : 'webgpu'));
        }
      } else if (e.key === 'd' || e.key === 'D') {
        const order: Array<'architectural' | 'hybrid' | 'photoreal'> = ['architectural', 'hybrid', 'photoreal'];
        const currentIdx = activeDirection ? order.indexOf(activeDirection) : -1;
        const nextStyle = order[(currentIdx + 1) % order.length];
        handleSelectRenderStyle(nextStyle);
      } else if (e.key === '7') {
        handleSelectRenderStyle('architectural');
      } else if (e.key === '8') {
        handleSelectRenderStyle('hybrid');
      } else if (e.key === '9') {
        handleSelectRenderStyle('photoreal');
      } else if (e.key === '1') setMode(0);
      else if (e.key === '2') setMode(1);
      else if (e.key === '3') setMode(2);
      else if (e.key === '4') setMode(3);
      else if (e.key === '5') setMode(4);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeDirection,
    glideToAlpha,
    handleSelectRenderStyle,
    hasWebGPU,
    setBackend,
    setIsPlaying,
    setIsZenMode,
    setMode,
    setShowVectors,
    setTheme,
  ]);

  const handleFpsUpdate = useCallback((val: number) => {
    setFps(val);
  }, [setFps]);

  const handleDataLoaded = useCallback((info: LoadedDataInfo) => {
    setDataInfo(info);
  }, [setDataInfo]);

  const handleWebGPUError = useCallback((err: Error) => {
    console.warn('WebGPU runtime error, falling back to WebGL2:', err);
    setBackend('webgl2');
  }, [setBackend]);

  const isLight = theme === 1;

  // Dynamic cartographic navigation telemetry (decoupled from static target and 60fps render storm)
  const [telemetryCoords, setTelemetryCoords] = useState<{ latDeg: number; lonDeg: number }>({ latDeg: 0, lonDeg: 0 });
  const handleCoordsChange = useCallback((newLat: number, newLon: number) => {
    setTelemetryCoords((prev) => (prev.latDeg === newLat && prev.lonDeg === newLon ? prev : { latDeg: newLat, lonDeg: newLon }));
  }, []);

  const { latDeg, lonDeg } = telemetryCoords;
  const latStr = `${Math.abs(latDeg).toString().padStart(2, '0')}°00'${latDeg >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lonDeg).toString().padStart(3, '0')}°00'${lonDeg >= 0 ? 'E' : 'W'}`;
  const mapScaleStr = alpha < 0.01 
    ? '1 : 127,420,000' 
    : `1 : ${Math.round(127420000 / Math.max(0.2, Math.cos((latDeg * Math.PI) / 180))).toLocaleString('en-US')}`;

  return (
    <CursorProvider>
      <div className={`relative w-screen h-screen flex flex-col font-mono overflow-hidden select-none transition-colors duration-500 ${
        isLight ? 'bg-[#F8FAFC]' : 'bg-[#090B10]'
      }`}>
        {/* Viewport Canvas (WebGL2 or WebGPU) */}
        <div className="w-full h-full relative">
          {backend === 'webgpu' ? (
            <React.Suspense fallback={
              <div className={`w-full h-full flex items-center justify-center font-mono text-xs ${isLight ? 'bg-[#F8FAFC] text-zinc-700' : 'bg-[#090B10] text-zinc-300'}`}>
                <span className={`w-6 h-6 border-2 border-t-transparent rounded-full animate-spin ${isLight ? 'border-zinc-800' : 'border-zinc-300'}`}></span>
                <span className="ml-2">Initializing WebGPU WGSL Pipeline...</span>
              </div>
            }>
              <WebGPUCanvas
                unfurlProgress={alpha}
                mode={mode}
                layerMode={layerMode}
                theme={theme}
                resolution={resolution}
                cameraTarget={cameraTarget}
                cameraPosition={webgpuCameraPos}
                activeOverlay={activeOverlay}
                showLandmarks={showLandmarks}
                showTissot={showTissot}
                showVectors={showVectors}
                dataLayers={dataLayers}
                cursorPhysicsEnabled={cursorPhysicsEnabled}
                startTime={appStartTimeRef.current}
                onFpsUpdate={handleFpsUpdate}
                onDataLoaded={handleDataLoaded}
                onError={handleWebGPUError}
                onCoordsChange={handleCoordsChange}
              />
            </React.Suspense>
          ) : (
            <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
              <React.Suspense fallback={null}>
                <CameraTelemetryUpdater alpha={alpha} onCoordsChange={handleCoordsChange} />
                <GeometryLayer 
                  unfurlProgress={alpha} 
                  mode={mode} 
                  layerMode={layerMode} 
                  theme={theme}
                  resolution={resolution}
                  cameraTarget={cameraTarget}
                  cursorPhysicsEnabled={cursorPhysicsEnabled}
                  displacementScale={dataLayers.find((l) => l.visible)?.displacementScale ?? 0.12}
                  startTime={appStartTimeRef.current}
                  onFpsUpdate={handleFpsUpdate} 
                  onDataLoaded={handleDataLoaded} 
                />
                {dataLayers.map((layer) => (
                  <DataLayerOverlay
                    key={layer.id}
                    visible={layer.visible}
                    unfurlProgress={alpha}
                    mode={mode}
                    theme={theme}
                    category={layer.category}
                    type={layer.type}
                    sourceUrl={layer.url}
                    opacity={layer.opacity ?? 0.85}
                    blendMode={layer.blendMode ?? 0}
                    displacementScale={layer.displacementScale}
                    elevationEncoding={layer.elevationEncoding}
                    sunAzimuth={layer.sunAzimuth}
                    sunAltitude={layer.sunAltitude}
                    hillshadeIntensity={layer.hillshadeIntensity}
                    renderStyle={layer.renderStyle}
                    resolution={resolution}
                  />
                ))}
                <GeodesicOverlayLayer
                  unfurlProgress={alpha}
                  mode={mode}
                  activeOverlay={activeOverlay}
                  showLandmarks={showLandmarks}
                  showTissot={showTissot}
                  theme={theme}
                  startTime={appStartTimeRef.current}
                />
                <VectorOverlayLayer
                  unfurlProgress={alpha}
                  mode={mode}
                  theme={theme}
                  visible={showVectors}
                  cameraTarget={cameraTarget}
                  cursorPhysicsEnabled={cursorPhysicsEnabled}
                  displacementScale={dataLayers.find((l) => l.visible)?.displacementScale ?? 0.12}
                  startTime={appStartTimeRef.current}
                />
                <KinematicCameraController
                  targetPos={targetCameraPos}
                  onArrived={() => setTargetCameraPos(null)}
                  controlsRef={controlsRef}
                  onTargetChange={(t) => setCameraTarget(t)}
                />
              </React.Suspense>
              <OrbitControls 
                ref={controlsRef} 
                makeDefault 
                enablePan={true} 
                enableZoom={true} 
                enableRotate={true} 
                autoRotate={alpha < 0.01} 
                autoRotateSpeed={0.5} 
                minDistance={5}
                maxDistance={50}
                maxPolarAngle={Math.PI}
                minPolarAngle={0}
                onEnd={() => {
                  if (controlsRef.current) {
                    setCameraTarget(controlsRef.current.target.clone());
                  }
                }}
              />
            </Canvas>
          )}
        </div>

        {/* 
          HUD Contract & Layer Controls:
          Display Layer: Both, Points, Wireframe
          setLayerMode(0), setLayerMode(1), setLayerMode(2)
          grid-cols-5 simulation paradigms: Linear, Scroll, Griffith, Fluid, Dymaxion (Fuller Dymaxion)
        */}
        {/* Top-Right Telemetry & Cartographic HUD */}
        <TelemetryHUD
          isZenMode={isZenMode}
          onZenToggle={() => setIsZenMode(true)}
          theme={theme}
          onThemeToggle={() => setTheme((t) => (t === 0 ? 1 : 0))}
          backend={backend}
          onBackendChange={setBackend}
          hasWebGPU={hasWebGPU}
          resolution={resolution}
          onResolutionChange={setResolution}
          layerMode={layerMode}
          onLayerModeChange={setLayerMode}
          mode={mode}
          onModeChange={setMode}
          cursorPhysicsEnabled={cursorPhysicsEnabled}
          onCursorPhysicsToggle={setCursorPhysicsEnabled}
          activeOverlay={activeOverlay}
          onOverlayChange={setActiveOverlay}
          showLandmarks={showLandmarks}
          onLandmarksToggle={() => setShowLandmarks((s) => !s)}
          showTissot={showTissot}
          onTissotToggle={() => setShowTissot((s) => !s)}
          showVectors={showVectors}
          onVectorsToggle={() => setShowVectors((s) => !s)}
          alpha={alpha}
          fps={fps}
          latStr={latStr}
          lonStr={lonStr}
          mapScaleStr={mapScaleStr}
          dataInfo={dataInfo}
          onSnapCamera={snapCamera}
          isAudioMuted={isAudioMuted}
          onAudioMuteToggle={handleAudioMuteToggle}
          dataLayers={dataLayers}
          toasts={toasts}
          onDismissToast={dismissToast}
          onAddDataLayer={handleAddDataLayer}
          onToggleDataLayer={handleToggleDataLayer}
          onRemoveDataLayer={handleRemoveDataLayer}
          onOpacityChangeDataLayer={handleOpacityChangeDataLayer}
          onBlendModeChangeDataLayer={handleBlendModeChangeDataLayer}
          onDisplacementScaleChangeDataLayer={handleDisplacementScaleChangeDataLayer}
          onHillshadeChangeDataLayer={handleHillshadeChangeDataLayer}
          onReorderDataLayer={handleReorderDataLayer}
          onSelectRenderStyle={handleSelectRenderStyle}
        />

        {/* Bottom Morph Slider & Kinematic Playback Dock */}
        <NavigationDock
          isZenMode={isZenMode}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          playbackSpeed={playbackSpeed}
          onToggleSpeed={() => setPlaybackSpeed((s) => (s === 0.5 ? 1.0 : s === 1.0 ? 2.0 : 0.5))}
          alpha={alpha}
          onAlphaChange={(val) => {
            setIsPlaying(false);
            setAlpha(val);
          }}
          onGlideToAlpha={glideToAlpha}
          theme={theme}
          activeDirection={activeDirection}
          onSelectRenderStyle={handleSelectRenderStyle}
        />

        {/* Zen Mode Minimal Restore Pill */}
        {isZenMode && (
          <button
            onClick={() => setIsZenMode(false)}
            className={`absolute top-4 right-4 z-30 px-3 py-1.5 rounded-full backdrop-blur-xl border text-[10px] font-mono transition-all shadow-lg pointer-events-auto ${
              isLight
                ? 'bg-white/90 border-zinc-300 text-zinc-900 hover:text-black hover:border-zinc-400 shadow-zinc-300/50'
                : 'bg-[#0F121A]/80 border-white/10 text-zinc-300 hover:text-white hover:border-white/30'
            }`}
          >
            Exit Zen Mode (H)
          </button>
        )}
      </div>
    </CursorProvider>
  );
}
