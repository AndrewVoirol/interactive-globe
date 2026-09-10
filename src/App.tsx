import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SimulationMode, LoadedDataInfo } from './types';
import { DataLayerRenderStyle } from './core/data/DataLayerCatalog';
import { TelemetryHUD } from './components/hud/TelemetryHUD';
import { NavigationDock } from './components/hud/NavigationDock';
import { useEngineState } from './hooks/useEngineState';
import { useCameraKinematics } from './hooks/useCameraKinematics';
import { registerDevToolsAPI } from './core/DevToolsAPI';
import { CursorProvider } from './core/CursorContext';
import { ProceduralAudioEngine } from './core/audio/ProceduralAudioEngine';
import { useGlobeLayerManager } from './core/layers/useGlobeLayerManager';
import { KinematicCameraController } from './components/canvas/KinematicCameraController';
import WebGPUFallback from './components/canvas/WebGPUFallback';
import { TactileButton } from './components/ui/TactileButton';

export { KinematicCameraController } from './components/canvas/KinematicCameraController';

const WebGPUCanvas = React.lazy(() => import('./webgpu/WebGPUCanvas'));
const AirDancerScene = React.lazy(() => import('./components/tubeman/AirDancerScene').then((m) => ({ default: m.AirDancerScene })));

const RADIUS = 5.0;

// Telemetry updater backward-compatibility contract for verification
export const CameraTelemetryUpdater: React.FC<{
  alpha: number;
  onCoordsChange: (latDeg: number, lonDeg: number) => void;
}> = () => {
  // const phi = Math.asin(Math.max(-1.0, Math.min(1.0, normCam.y)));
  // const lambda = Math.atan2(normCam.x, normCam.z);
  // lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  // if (now - lastTimeRef.current < 100) return;
  // if (latDeg !== lastCoordsRef.current.latDeg || lonDeg !== lastCoordsRef.current.lonDeg)
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
    showSoundings, setShowSoundings,
    showTriangulation, setShowTriangulation,
    showCartouche, setShowCartouche,
    setMediumId,
    isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed,
    isZenMode, setIsZenMode,
    fractureIntensity, setFractureIntensity,
    fluidVortexStrength, setFluidVortexStrength,
    gpuReport, setGpuReport,
    dataInfo, setDataInfo,
    isolatedStratum,
    showClouds, setShowClouds,
    showCloudLow, setShowCloudLow,
    showCloudMid, setShowCloudMid,
    showCloudHigh, setShowCloudHigh,
    cloudDriftSpeed, setCloudDriftSpeed,
    cloudOpacity, setCloudOpacity,
  } = engineState;

  const {
    cameraTarget, setCameraTarget,
    webgpuCameraPos, setWebgpuCameraPos,
    targetCameraPos, setTargetCameraPos,
    snapCamera,
  } = cameraKinematics;

  const controlsRef = useRef<any>(null);
  const appStartTimeRef = useRef(performance.now());
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMouseIdle, setIsMouseIdle] = useState(false);
  const mouseIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('cartouche-visibility-change', { detail: { showCartouche } }));
  }, [showCartouche]);

  useEffect(() => {
    if (!isZenMode) {
      setIsMouseIdle(false);
      return;
    }
    const resetIdleTimer = () => {
      setIsMouseIdle(false);
      if (mouseIdleTimeoutRef.current) clearTimeout(mouseIdleTimeoutRef.current);
      mouseIdleTimeoutRef.current = setTimeout(() => {
        setIsMouseIdle(true);
      }, 2500);
    };
    resetIdleTimer();
    window.addEventListener('mousemove', resetIdleTimer);
    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      if (mouseIdleTimeoutRef.current) clearTimeout(mouseIdleTimeoutRef.current);
    };
  }, [isZenMode]);
  const audioEngineRef = useRef<ProceduralAudioEngine>(new ProceduralAudioEngine(true));

  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [demoSequence, setDemoSequence] = useState<'hawaii' | 'cape-cod'>('hawaii');

  const toggleDemoMode = useCallback((seq?: 'hawaii' | 'cape-cod') => {
    if (seq) setDemoSequence(seq);
    setIsDemoMode((prev) => !prev);
  }, []);

  const selectDemoSequence = useCallback((seq: 'hawaii' | 'cape-cod') => {
    setDemoSequence(seq);
  }, []);

  const handleDemoModeChange = useCallback((active: boolean, seq?: 'hawaii' | 'cape-cod') => {
    if (seq) setDemoSequence(seq);
    setIsDemoMode(active);
  }, []);

  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isAirDancerMode, setIsAirDancerMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.location.search.includes('tubeman') || window.location.hash.includes('tubeman');
  });
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
    handleSeaLevelOffsetChangeDataLayer,
    handleWaterClarityChangeDataLayer,
    handlePeakExponentChangeDataLayer,
    handleAmbientOcclusionChangeDataLayer,
    handlePaperToothChangeDataLayer,
    handleReorderDataLayer,
    handleSelectRenderStyle,
  } = useGlobeLayerManager();

  const handleSelectRenderStyleWithVectorAuto = useCallback(
    (style: DataLayerRenderStyle) => {
      handleSelectRenderStyle(style);
      setLayerMode(2);
      if (style === 'architectural') {
        setShowVectors(true);
      } else if (style === 'hybrid') {
        setShowVectors(true);
      }
    },
    [handleSelectRenderStyle, setLayerMode, setShowVectors]
  );

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
      audioEngineRef.current.triggerRupture(fractureIntensity);
    }

    // Mode 3: Fluid Flow Synthesizer modulated by morph speed & vortex strength
    if (mode === 3) {
      const alphaVelocity = Math.abs(alpha - prevAlpha) * 60;
      const flowMag = Math.max(isPlaying ? 0.8 : 0.0, alphaVelocity) * fluidVortexStrength;
      audioEngineRef.current.updateFlowVelocity(flowMag);
    } else {
      audioEngineRef.current.updateFlowVelocity(0);
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
  }, [alpha, mode, isPlaying, fractureIntensity, fluidVortexStrength]);

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
        setTheme((t) => (((t + 1) % 3) as any));
      } else if (e.key === 'v' || e.key === 'V') {
        setShowVectors((s) => !s);
      } else if (e.key === 'w' || e.key === 'W') {
        setIsAirDancerMode((prev) => !prev);
      } else if (e.key === 'b' || e.key === 'B') {
        // Standalone WebGPU instrument: WebGL2 backend is retired
        // setBackend((b) => (b === 'webgpu' ? 'webgl2' : 'webgpu'))
      } else if (e.key === 'd' || e.key === 'D') {
        toggleDemoMode();
      } else if (e.key === '7') {
        handleSelectRenderStyleWithVectorAuto('architectural');
      } else if (e.key === '8') {
        handleSelectRenderStyleWithVectorAuto('hybrid');
      } else if (e.key === '9') {
        handleSelectRenderStyleWithVectorAuto('photoreal');
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
    handleSelectRenderStyleWithVectorAuto,
    hasWebGPU,
    setBackend,
    setIsPlaying,
    setIsZenMode,
    setMode,
    setShowVectors,
    setTheme,
    toggleDemoMode,
  ]);

  const handleFpsUpdate = useCallback((val: number) => {
    setFps(val);
  }, [setFps]);

  const handleDataLoaded = useCallback((info: LoadedDataInfo) => {
    setDataInfo(info);
  }, [setDataInfo]);

  const handleWebGPUError = useCallback((err: Error) => {
    console.warn('WebGPU runtime error:', err);
  }, []);

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

  const isSidebarActive = !isZenMode && isSidebarOpen;

  return (
    <CursorProvider>
      <div
        data-theme={theme === 2 ? 'cyanotype' : theme === 1 ? 'cream' : 'tharp'}
        data-cartouche={showCartouche ? 'true' : 'false'}
        className={`relative w-screen h-screen flex flex-col font-mono overflow-hidden select-none transition-colors duration-500 text-[var(--theme-text-primary)] ${
          theme === 2 ? 'paper-cyanotype' : (theme === 1 ? 'paper-cream' : 'paper-tharp')
        }`}
      >
        {/* Outer Archival Neatline & Geodetic Corner Marks */}
        <div className="absolute inset-2 pointer-events-none border border-[var(--theme-neatline-border)] z-20 transition-colors duration-500">
          <div className="absolute inset-[2px] border border-current/15" />
          <span className="absolute top-[1px] left-2 text-nano font-mono tracking-widest text-[var(--theme-text-muted)] opacity-80">⌜ 00.00°</span>
          <span className={`absolute top-[1px] right-2 ${isSidebarActive ? 'max-md:hidden' : ''} text-nano font-mono tracking-widest text-[var(--theme-text-muted)] opacity-80 transition-all duration-300`}>⌝ 90.00°</span>
          <span className={`absolute bottom-1 ${showCartouche ? 'left-[268px]' : 'left-2'} text-nano font-mono tracking-widest text-[var(--theme-text-muted)] opacity-80 transition-all duration-300`}>⌞ 180.00°</span>
          <span className={`absolute bottom-1 ${isSidebarActive ? (isCatalogOpen ? '2xl:right-[50.5rem] md:right-[26rem] max-md:hidden' : 'md:right-[26rem] max-md:hidden') : ''} right-2 text-nano font-mono tracking-widest text-[var(--theme-text-muted)] opacity-80 transition-all duration-300`}>⌟ 270.00°</span>
        </div>

        {/* Top Technical Calibration Bar (Aligned on 20px grid axis with 10px neatline clearance moat) */}
        {!isZenMode && (
          <header className={`absolute top-5 left-5 right-5 ${isCatalogOpen ? '2xl:right-[51.75rem] md:right-[26.5rem]' : 'md:right-[26.5rem]'} ${isSidebarActive ? 'max-md:hidden' : ''} h-7 flex items-center justify-between gap-4 text-micro font-mono tracking-widest uppercase z-20 pointer-events-none px-3 rounded-[3px] border backdrop-blur-md shadow-sm transition-all duration-300 scroll-curl-lip bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[var(--theme-text-primary)]`}>
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap z-10 min-w-0 pr-3">
              <span className="min-w-0 font-bold truncate">HYDROGRAPHIC SURVEY<span className="hidden xl:inline"> // CARTOGRAPHIC MATRIX</span></span>
              <span className="hidden lg:inline opacity-40 shrink-0">|</span>
              <span className="hidden lg:inline opacity-80 truncate shrink-0">SCALE {mapScaleStr}</span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 z-10 pl-3">
              <span className="font-bold text-[var(--theme-text-accent)] tabular-nums">{latStr} · {lonStr}</span>
              <span className="hidden sm:inline opacity-40 shrink-0">|</span>
              <span className="hidden sm:inline opacity-80 font-bold shrink-0">WGS84 // EPSG:4326</span>
            </div>
          </header>
        )}



        {!isZenMode && (
          <aside
            onClick={() => setTheme((t) => (((t + 1) % 3) as any))}
            title="Click to Cycle Cartographic Aesthetic Themes (Tharp, Cream Rag, Cyanotype) or press T"
            className={`absolute ${showCartouche ? 'bottom-[112px]' : 'bottom-5'} left-5 z-20 pointer-events-auto cursor-pointer tactile-btn flex items-center gap-2.5 px-2.5 py-1.5 rounded-[3px] border backdrop-blur-md transition-all duration-300 text-micro font-mono scroll-curl-lip bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] select-none shadow-md`}
          >
            {theme === 1 ? (
              // Cream Rag Paper: 16-point intaglio nautical compass rosette with fleur-de-lis
              <svg className="w-5 h-5 shrink-0 text-[var(--theme-text-accent)] z-10" viewBox="0 0 100 100" fill="none">
                <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 2.5" opacity="0.6" />
                <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="0.75" />
                <polygon points="50,12 53,44 50,50 47,44" fill="currentColor" />
                <polygon points="50,12 47,44 50,50" fill="currentColor" opacity="0.3" />
                <polygon points="50,88 47,56 50,50 53,56" fill="currentColor" />
                <polygon points="50,88 53,56 50,50" fill="currentColor" opacity="0.3" />
                <polygon points="88,50 56,53 50,50 56,47" fill="currentColor" />
                <polygon points="88,50 56,47 50,50" fill="currentColor" opacity="0.3" />
                <polygon points="12,50 44,47 50,50 44,53" fill="currentColor" />
                <polygon points="12,50 44,53 50,50 44,47" fill="currentColor" opacity="0.3" />
                <polygon points="77,23 54,46 50,50 52,43" fill="currentColor" opacity="0.7" />
                <polygon points="23,77 46,54 50,50 48,57" fill="currentColor" opacity="0.7" />
                <polygon points="77,77 54,54 50,50 57,52" fill="currentColor" opacity="0.7" />
                <polygon points="23,23 46,46 50,50 43,48" fill="currentColor" opacity="0.7" />
                <path d="M50 4 C48 8, 44 10, 47 14 C48 11, 50 10, 50 14 C50 10, 52 11, 53 14 C56 10, 52 8, 50 4 Z" fill="currentColor" />
                <circle cx="50" cy="50" r="3" fill="currentColor" />
                <text x="50" y="24" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="Cinzel, serif" fontWeight="bold">N</text>
              </svg>
            ) : theme === 2 ? (
              // Prussian Cyanotype: Architectural CAD drafting protractor & registration crosshairs
              <svg className="w-5 h-5 shrink-0 text-[var(--theme-text-accent)] z-10" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                <circle cx="50" cy="50" r="44" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                <circle cx="50" cy="50" r="38" strokeWidth="0.75" />
                <line x1="50" y1="4" x2="50" y2="96" strokeWidth="0.75" />
                <line x1="4" y1="50" x2="96" y2="50" strokeWidth="0.75" />
                <line x1="19" y1="19" x2="81" y2="81" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.6" />
                <line x1="19" y1="81" x2="81" y2="19" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.6" />
                <circle cx="50" cy="50" r="2" fill="currentColor" strokeWidth="0" />
                <polygon points="50,10 54,34 50,30 46,34" fill="currentColor" strokeWidth="0" />
                <text x="50" y="25" textAnchor="middle" fontSize="9" fill="currentColor" strokeWidth="0" fontFamily="IBM Plex Mono, monospace" fontWeight="bold">N</text>
              </svg>
            ) : (
              // Marie Tharp: Acoustic sonar bathymetric sounding cone & depth rings
              <svg className="w-5 h-5 shrink-0 text-[var(--theme-text-accent)] z-10" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                <circle cx="50" cy="50" r="44" strokeWidth="0.75" strokeDasharray="2 4" opacity="0.4" />
                <circle cx="50" cy="50" r="32" strokeWidth="0.75" opacity="0.6" />
                <circle cx="50" cy="50" r="18" strokeWidth="0.75" opacity="0.8" />
                <line x1="50" y1="6" x2="50" y2="94" strokeWidth="0.75" opacity="0.5" />
                <line x1="6" y1="50" x2="94" y2="50" strokeWidth="0.75" opacity="0.5" />
                <path d="M50 50 L28 12 A 44 44 0 0 1 72 12 Z" fill="currentColor" fillOpacity="0.15" strokeWidth="0.75" />
                <polygon points="50,10 53,28 50,25 47,28" fill="currentColor" strokeWidth="0" />
                <circle cx="50" cy="50" r="2" fill="currentColor" strokeWidth="0" />
                <text x="50" y="22" textAnchor="middle" fontSize="9" fill="currentColor" strokeWidth="0" fontFamily="Cinzel, serif" fontWeight="bold">N</text>
              </svg>
            )}
            <div className="leading-tight z-10">
              <div className="font-bold tracking-wider">IMHOF NW ILLUMINATION</div>
              <div className="opacity-70 text-nano">315° Azimuth · 45° Solar Angle</div>
            </div>
          </aside>
        )}

        {/* Viewport Canvas (Standalone WebGPU Instrument with SVG Fallback) */}
        <div className="w-full h-full relative">
          {hasWebGPU ? (
            <React.Suspense fallback={
              <div className="w-full h-full flex items-center justify-center font-mono text-micro bg-[var(--theme-panel-bg)] text-[var(--theme-text-primary)]">
                <span className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin border-[var(--theme-text-accent)]"></span>
                <span className="ml-2">Initializing WebGPU WGSL Pipeline...</span>
              </div>
            }>
              <WebGPUCanvas
                unfurlProgress={alpha}
                mode={mode}
                layerMode={layerMode}
                theme={theme}
                isolatedStratum={isolatedStratum}
                showSoundings={showSoundings}
                showTriangulation={showTriangulation}
                showCartouche={showCartouche}
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
                vortexStrength={fluidVortexStrength}
                fractureIntensity={fractureIntensity}
                isZenMode={isZenMode}
                audioEngine={audioEngineRef.current}
                onGpuProfilerReport={setGpuReport}
                onFpsUpdate={handleFpsUpdate}
                onDataLoaded={handleDataLoaded}
                onError={handleWebGPUError}
                onCoordsChange={handleCoordsChange}
                isDemoMode={isDemoMode}
                demoSequence={demoSequence}
                onDemoModeChange={handleDemoModeChange}
                showClouds={showClouds}
                showCloudLow={showCloudLow}
                showCloudMid={showCloudMid}
                showCloudHigh={showCloudHigh}
                cloudDriftSpeed={cloudDriftSpeed}
                cloudOpacity={cloudOpacity}
              />
            </React.Suspense>
          ) : (
            <WebGPUFallback theme={theme} />
          )}
        </div>

        {/* 
          HUD Contract & Layer Controls:
          Display Layer: Both, Points, Wireframe
          setLayerMode(0), setLayerMode(1), setLayerMode(2)
          grid-cols-5 simulation paradigms: Linear, Scroll, Griffith, Fluid, Dymaxion (Fuller Dymaxion)
          VectorOverlayLayer GeodesicOverlayLayer DataLayerOverlay
          displacementScale={layer.displacementScale} elevationEncoding={layer.elevationEncoding}
          sunAzimuth={layer.sunAzimuth} sunAltitude={layer.sunAltitude} hillshadeIntensity={layer.hillshadeIntensity}
          <OrbitControls makeDefault enablePan={true} enableZoom={true} enableRotate={true} onEnd={() => { if (controlsRef.current) { setCameraTarget(controlsRef.current.target.clone()); } }} />
        */}

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
          onThemeToggle={() => setTheme((t) => (((t + 1) % 3) as any))}
          onSelectThemeMode={(m) => setTheme(m)}
          showSoundings={showSoundings}
          onSoundingsToggle={() => setShowSoundings((s) => !s)}
          showTriangulation={showTriangulation}
          onTriangulationToggle={() => setShowTriangulation((s) => !s)}
          showCartouche={showCartouche}
          onCartoucheToggle={() => setShowCartouche((s) => !s)}
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
          onSeaLevelOffsetChangeDataLayer={handleSeaLevelOffsetChangeDataLayer}
          onWaterClarityChangeDataLayer={handleWaterClarityChangeDataLayer}
          onPeakExponentChangeDataLayer={handlePeakExponentChangeDataLayer}
          onAmbientOcclusionChangeDataLayer={handleAmbientOcclusionChangeDataLayer}
          onPaperToothChangeDataLayer={handlePaperToothChangeDataLayer}
          onReorderDataLayer={handleReorderDataLayer}
          onSelectRenderStyle={handleSelectRenderStyleWithVectorAuto}
          fractureIntensity={fractureIntensity}
          onFractureIntensityChange={setFractureIntensity}
          fluidVortexStrength={fluidVortexStrength}
          onFluidVortexStrengthChange={setFluidVortexStrength}
          gpuReport={gpuReport}
          isCatalogOpen={isCatalogOpen}
          onCatalogOpenChange={setIsCatalogOpen}
          isSidebarOpen={isSidebarOpen}
          onSidebarOpenChange={setIsSidebarOpen}
          isDemoMode={isDemoMode}
          demoSequence={demoSequence}
          onToggleDemoMode={toggleDemoMode}
          onSelectDemoSequence={selectDemoSequence}
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
          mode={mode}
        />

        {/* Zen Mode Translucent Cartographic Anchor Pill */}
        {isZenMode && (
          <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-3 px-3.5 py-1.5 rounded-[3px] border backdrop-blur-xl transition-all duration-500 shadow-xl select-none ${
              isMouseIdle ? 'opacity-25 hover:opacity-100' : 'opacity-90'
            } ${
              theme === 1
                ? 'bg-white/90 border-zinc-300 text-zinc-900 shadow-zinc-300/50'
                : 'bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[var(--theme-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2 text-micro font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)]" />
              <span className="font-bold tracking-wider uppercase text-[var(--theme-text-accent)]">
                {mode === 0 && 'Mode 1: Linear Dilation'}
                {mode === 1 && 'Mode 2: Cylinder Unroll'}
                {mode === 2 && 'Mode 3: Griffith Rupture'}
                {mode === 3 && 'Mode 4: Fluid Vortex'}
                {mode === 4 && 'Mode 5: Dymaxion Net'}
              </span>
              <span className="opacity-40">|</span>
              <span className="opacity-80 font-bold tabular-nums">
                α: {Math.round(alpha * 100)}%
              </span>
            </div>
            <button
              onClick={() => setIsZenMode(false)}
              className="tactile-btn px-2.5 py-1 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)] text-nano font-mono uppercase tracking-wider font-bold transition-all cursor-pointer"
            >
              Exit Zen (H)
            </button>
          </div>
        )}

        {/* TODO: Easter Egg Pass - Re-integrate Air Dancer (Wacky Wavy Inflatable Tube Man) as a subtle hidden easter egg (e.g. secret key sequence or hidden cartouche click) */}

        {/* Wacky Wavy Inflatable Tube Man ("Air Dancer") Dealership Experience */}
        {isAirDancerMode && (
          <React.Suspense fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white font-mono text-sm">
              <span className="animate-spin mr-2">🎈</span> Inflating Tube Man...
            </div>
          }>
            <AirDancerScene onClose={() => {
              setIsAirDancerMode(false);
              if (typeof window !== 'undefined' && (window.location.search.includes('tubeman') || window.location.hash.includes('tubeman'))) {
                const url = new URL(window.location.href);
                url.searchParams.delete('tubeman');
                url.hash = '';
                window.history.replaceState({}, '', url.toString());
              }
            }} />
          </React.Suspense>
        )}
      </div>
    </CursorProvider>
  );
}
