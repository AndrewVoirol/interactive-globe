import { useState, useEffect, useRef } from 'react';
import { isWebGPUSupported } from '../webgpu/support';
import { ThemeManager, ThemePalette } from '../core/themes';
import { ProceduralAudioEngine } from '../core/audio';

import { LoadedDataInfo, SimulationMode, GeodesicOverlayMode, ResolutionTier } from '../types';

export type { SimulationMode, GeodesicOverlayMode, LoadedDataInfo, ResolutionTier };

export function useEngineState() {
  const [backend, setBackend] = useState<'webgl2' | 'webgpu'>(
    typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'webgl2'
  );
  const [theme, setThemeState] = useState<0 | 1>(ThemeManager.getInstance().getMode()); // 0 = Dark Cyber, 1 = Light Monochrome
  const [themePalette, setThemePalette] = useState<ThemePalette>(ThemeManager.getInstance().getPalette());
  const [hasWebGPU, setHasWebGPU] = useState<boolean>(false);
  const [alpha, setAlpha] = useState(0); 
  const [mode, setMode] = useState<SimulationMode>(0); // Default to Mode 0 (Linear Mix)
  const [layerMode, setLayerMode] = useState<0 | 1 | 2>(0); // Default to 0 (Both: Points + Hairlines)
  const [cursorPhysicsEnabled, setCursorPhysicsEnabled] = useState<boolean>(false);
  const [resolution, setResolution] = useState<ResolutionTier>('1M');
  const [fps, setFps] = useState(60);
  const [isHudOpen, setIsHudOpen] = useState(true);

  // Cartographic Overlays state
  const [activeOverlay, setActiveOverlay] = useState<GeodesicOverlayMode>('off');
  const [showLandmarks, setShowLandmarks] = useState<boolean>(false);
  const [showTissot, setShowTissot] = useState<boolean>(false);
  const [showVectors, setShowVectors] = useState<boolean>(true);

  // Auto-morph playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playDirection, setPlayDirection] = useState<1 | -1>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);

  // Live Simulation Parameters & GPU Profiler Telemetry
  const [fractureIntensity, setFractureIntensity] = useState<number>(1.0);
  const [fluidVortexStrength, setFluidVortexStrength] = useState<number>(1.0);
  const [gpuReport, setGpuReport] = useState<any>(null);

  // Phase 4 Managers
  const audioEngineRef = useRef<ProceduralAudioEngine | null>(null);

  if (!audioEngineRef.current) {
    audioEngineRef.current = new ProceduralAudioEngine(true);
  }

  const [dataInfo, setDataInfo] = useState<LoadedDataInfo>({ 
    pointCount: 100000, 
    lineCount: 300000,
    format: 'BIN (Zero-Copy)',
    loadTimeMs: 0,
    vramMb: 4.57
  });

  // Keep ThemeManager in sync
  useEffect(() => {
    const unsubscribe = ThemeManager.getInstance().subscribe((palette) => {
      setThemeState(palette.mode);
      setThemePalette(palette);
    });
    return unsubscribe;
  }, []);

  const setTheme = (newMode: (0 | 1) | ((prev: 0 | 1) => 0 | 1)) => {
    const resolvedMode = typeof newMode === 'function' ? newMode(ThemeManager.getInstance().getMode()) : newMode;
    ThemeManager.getInstance().setMode(resolvedMode);
  };

  useEffect(() => {
    isWebGPUSupported().then((supported) => {
      setHasWebGPU(supported);
      if (supported) {
        setBackend('webgpu');
      }
    });
  }, []);

  // Auto-morph loop: decoupled continuous accumulator + throttled UI state sync
  useEffect(() => {
    if (!isPlaying) {
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_ANIM_ALPHA__ = undefined;
      }
      return;
    }
    let animId: number;
    let lastT = performance.now();
    let lastUiSync = performance.now();
    let curAlpha = alpha;

    const tick = (now: number) => {
      const dt = (now - lastT) * 0.001;
      lastT = now;
      const step = dt * 0.20 * playbackSpeed * playDirection;
      curAlpha += step;
      if (curAlpha >= 1.0) {
        curAlpha = 1.0;
        setPlayDirection(-1);
      } else if (curAlpha <= 0.0) {
        curAlpha = 0.0;
        setPlayDirection(1);
      }

      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_ANIM_ALPHA__ = curAlpha;
      }

      // Throttled UI state sync at 20 Hz (every 50ms) to eliminate 120 Hz React Virtual DOM diff storms
      if (now - lastUiSync >= 50) {
        setAlpha(curAlpha);
        lastUiSync = now;
      }

      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_ANIM_ALPHA__ = undefined;
      }
      setAlpha(curAlpha);
    };
  }, [isPlaying, playDirection, playbackSpeed]);

  return {
    backend, setBackend,
    theme, setTheme,
    themePalette,
    hasWebGPU, setHasWebGPU,
    alpha, setAlpha,
    mode, setMode,
    layerMode, setLayerMode,
    cursorPhysicsEnabled, setCursorPhysicsEnabled,
    resolution, setResolution,
    fps, setFps,
    isHudOpen, setIsHudOpen,
    activeOverlay, setActiveOverlay,
    showLandmarks, setShowLandmarks,
    showTissot, setShowTissot,
    showVectors, setShowVectors,
    isPlaying, setIsPlaying,
    playDirection, setPlayDirection,
    playbackSpeed, setPlaybackSpeed,
    isZenMode, setIsZenMode,
    fractureIntensity, setFractureIntensity,
    fluidVortexStrength, setFluidVortexStrength,
    gpuReport, setGpuReport,
    dataInfo, setDataInfo,
    audioEngine: audioEngineRef.current,
  };
}

export type EngineStateHook = ReturnType<typeof useEngineState>;
