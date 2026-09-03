import { useState, useEffect, useRef } from 'react';
import { isWebGPUSupported } from '../webgpu/support';
import { ThemeManager, ThemePalette } from '../core/themes';
import { ProceduralAudioEngine } from '../core/audio';

import { LoadedDataInfo, SimulationMode, GeodesicOverlayMode } from '../types';

export type { SimulationMode, GeodesicOverlayMode, LoadedDataInfo };

export function useEngineState() {
  const [backend, setBackend] = useState<'webgl2' | 'webgpu'>('webgl2');
  const [theme, setThemeState] = useState<0 | 1>(ThemeManager.getInstance().getMode()); // 0 = Dark Cyber, 1 = Light Monochrome
  const [themePalette, setThemePalette] = useState<ThemePalette>(ThemeManager.getInstance().getPalette());
  const [hasWebGPU, setHasWebGPU] = useState<boolean>(false);
  const [alpha, setAlpha] = useState(0); 
  const [mode, setMode] = useState<SimulationMode>(4); // Default to Mode 4 (Fuller Dymaxion)
  const [layerMode, setLayerMode] = useState<0 | 1 | 2>(0); // 0 = Both, 1 = Points Only, 2 = Wireframe Only
  const [cursorPhysicsEnabled, setCursorPhysicsEnabled] = useState<boolean>(false);
  const [resolution, setResolution] = useState<'100k' | '1M'>('100k');
  const [fps, setFps] = useState(60);
  const [isHudOpen, setIsHudOpen] = useState(true);

  // Cartographic Overlays state
  const [activeOverlay, setActiveOverlay] = useState<GeodesicOverlayMode>('off');
  const [showLandmarks, setShowLandmarks] = useState<boolean>(false);
  const [showTissot, setShowTissot] = useState<boolean>(false);
  const [showVectors, setShowVectors] = useState<boolean>(false);

  // Auto-morph playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playDirection, setPlayDirection] = useState<1 | -1>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);

  // Phase 4 Managers
  const audioEngineRef = useRef<ProceduralAudioEngine | null>(null);

  if (!audioEngineRef.current) {
    audioEngineRef.current = new ProceduralAudioEngine();
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
    });
  }, []);

  // Auto-morph loop
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastT = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastT) * 0.001;
      lastT = now;
      setAlpha((prev) => {
        const step = dt * 0.20 * playbackSpeed * playDirection;
        let next = prev + step;
        if (next >= 1.0) {
          next = 1.0;
          setPlayDirection(-1);
        } else if (next <= 0.0) {
          next = 0.0;
          setPlayDirection(1);
        }
        return next;
      });
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
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
    dataInfo, setDataInfo,
    audioEngine: audioEngineRef.current,
  };
}

export type EngineStateHook = ReturnType<typeof useEngineState>;
