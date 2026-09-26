import { useState, useEffect, useRef, useCallback } from 'react';
import { isWebGPUSupported } from '../webgpu/support';
import { ThemeManager, ThemePalette, ThemeMode, ArchivalMediumId } from '../core/themes';

import { LoadedDataInfo, SimulationMode, GeodesicOverlayMode, ResolutionTier } from '../types';

export type { SimulationMode, GeodesicOverlayMode, LoadedDataInfo, ResolutionTier };

export function useEngineState() {
  const [backend, setBackend] = useState<'webgl2' | 'webgpu'>(
    typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'webgl2'
  );
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const tm = ThemeManager.getInstance();
    tm.setMode(1);
    return 1;
  }); // 0 = Tharp, 1 = Cream, 2 = Cyanotype
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

  // Archival Cartographic Detail Toggles
  const [showSoundings, setShowSoundings] = useState<boolean>(true);
  const [showTriangulation, setShowTriangulation] = useState<boolean>(false);
  const [showCartouche, setShowCartouche] = useState<boolean>(true);

  // Auto-morph playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playDirection, setPlayDirection] = useState<1 | -1>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const playbackClockRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);

  // Live Simulation Parameters & GPU Profiler Telemetry
  const [fractureIntensity, setFractureIntensity] = useState<number>(1.0);
  const [fluidVortexStrength, setFluidVortexStrength] = useState<number>(1.0);
  const [gpuReport, setGpuReport] = useState<any>(null);

  // Atmospheric Cloud Strata State (Milestone 5)
  const [showClouds, setShowCloudsState] = useState<boolean>(false);
  const [showCloudLow, setShowCloudLowState] = useState<boolean>(true);
  const [showCloudMid, setShowCloudMidState] = useState<boolean>(true);
  const [showCloudHigh, setShowCloudHighState] = useState<boolean>(true);
  const [cloudDriftSpeed, setCloudDriftSpeedState] = useState<number>(500);
  const [cloudOpacity, setCloudOpacityState] = useState<number>(0.8);
  const [cloudFalseColor, setCloudFalseColorState] = useState<boolean>(false);

  const setShowClouds = (v: boolean | ((prev: boolean) => boolean)) => {
    setShowCloudsState(v);
  };
  const setShowCloudLow = (v: boolean | ((prev: boolean) => boolean)) => {
    setShowCloudLowState(v);
  };
  const setShowCloudMid = (v: boolean | ((prev: boolean) => boolean)) => {
    setShowCloudMidState(v);
  };
  const setShowCloudHigh = (v: boolean | ((prev: boolean) => boolean)) => {
    setShowCloudHighState(v);
  };
  const setCloudFalseColor = (v: boolean | ((prev: boolean) => boolean)) => {
    setCloudFalseColorState(v);
  };
  const setCloudDriftSpeed = (v: number | ((prev: number) => number)) => {
    setCloudDriftSpeedState((prev) => {
      const val = typeof v === 'function' ? v(prev) : v;
      if (typeof val !== 'number' || !Number.isFinite(val)) return prev;
      return Math.max(0, Math.min(2000, val));
    });
  };
  const setCloudOpacity = (v: number | ((prev: number) => number)) => {
    setCloudOpacityState((prev) => {
      const val = typeof v === 'function' ? v(prev) : v;
      if (typeof val !== 'number' || !Number.isFinite(val)) return prev;
      return Math.max(0.1, Math.min(1.0, val));
    });
  };

  const setCloudOptions = (
    options: Partial<{
      showClouds: boolean;
      showCloudLow: boolean;
      showCloudMid: boolean;
      showCloudHigh: boolean;
      cloudDriftSpeed: number;
      cloudOpacity: number;
      cloudFalseColor: boolean;
    }>
  ) => {
    if (options.showClouds !== undefined) setShowCloudsState(options.showClouds);
    if (options.showCloudLow !== undefined) setShowCloudLowState(options.showCloudLow);
    if (options.showCloudMid !== undefined) setShowCloudMidState(options.showCloudMid);
    if (options.showCloudHigh !== undefined) setShowCloudHighState(options.showCloudHigh);
    if (options.cloudFalseColor !== undefined) setCloudFalseColorState(options.cloudFalseColor);
    if (options.cloudDriftSpeed !== undefined && typeof options.cloudDriftSpeed === 'number' && Number.isFinite(options.cloudDriftSpeed)) {
      setCloudDriftSpeedState(Math.max(0, Math.min(2000, options.cloudDriftSpeed)));
    }
    if (options.cloudOpacity !== undefined && typeof options.cloudOpacity === 'number' && Number.isFinite(options.cloudOpacity)) {
      setCloudOpacityState(Math.max(0.1, Math.min(1.0, options.cloudOpacity)));
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__INDICATRIX_CLOUD_STATE__ = {
        showClouds,
        showCloudLow,
        showCloudMid,
        showCloudHigh,
        cloudDriftSpeed,
        cloudOpacity,
        cloudFalseColor,
      };
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__ = setCloudOptions;
    }
  }, [showClouds, showCloudLow, showCloudMid, showCloudHigh, cloudDriftSpeed, cloudOpacity, cloudFalseColor]);

  const [cdlodDiagnosticMode, setCdlodDiagnosticModeState] = useState<number>(0);

  const setCdlodDiagnosticMode = (mode: number | ((prev: number) => number)) => {
    setCdlodDiagnosticModeState((prev) => {
      const val = typeof mode === 'function' ? mode(prev) : mode;
      const resolved = typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.min(3, Math.round(val))) : 0;
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_CDLOD_DIAGNOSTIC_MODE__ = resolved;
        window.dispatchEvent(new CustomEvent('indicatrix:cdlod-diag', { detail: resolved }));
      }
      return resolved;
    });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__INDICATRIX_CDLOD_DIAGNOSTIC_MODE__ = cdlodDiagnosticMode;
      (window as any).__INDICATRIX_SET_CDLOD_DIAGNOSTIC_MODE__ = setCdlodDiagnosticMode;
    }
  }, [cdlodDiagnosticMode]);

  const [dataInfo, setDataInfo] = useState<LoadedDataInfo>({ 
    pointCount: 100000, 
    lineCount: 300000,
    format: 'BIN (Zero-Copy)',
    loadTimeMs: 0,
    vramMb: 4.57
  });

  const [isolatedStratum, setIsolatedStratumState] = useState<number | null>(() => ThemeManager.getInstance().getIsolatedStratum());

  // Keep ThemeManager in sync
  useEffect(() => {
    const unsubscribe = ThemeManager.getInstance().subscribe((palette) => {
      setThemeState(palette.mode);
      setThemePalette(palette);
      setIsolatedStratumState(ThemeManager.getInstance().getIsolatedStratum());
    });
    return unsubscribe;
  }, []);

  const setTheme = (newMode: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => {
    const resolvedMode = typeof newMode === 'function' ? newMode(ThemeManager.getInstance().getMode()) : newMode;
    ThemeManager.getInstance().setMode(resolvedMode);
  };

  const setMediumId = (id: ArchivalMediumId) => {
    ThemeManager.getInstance().setMediumId(id);
  };

  const setIsolatedStratum = (stratum: number | null, swatch?: { name: string; hex: string; depth: string } | null) => {
    ThemeManager.getInstance().setIsolatedStratum(stratum, swatch);
    setIsolatedStratumState(stratum);
  };

  useEffect(() => {
    isWebGPUSupported().then((supported) => {
      setHasWebGPU(supported);
      if (supported) {
        setBackend('webgpu');
      }
    });
  }, []);

  // Auto-morph loop: decoupled continuous accumulator + UI-level quintic smootherstep easing
  useEffect(() => {
    if (!isPlaying) {
      wasPlayingRef.current = false;
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_ANIM_ALPHA__ = undefined;
      }
      return;
    }

    // Invert current alpha so playback starts seamlessly from the current slider position
    const invertQuintic = (target: number): number => {
      if (target <= 0.0) return 0.0;
      if (target >= 1.0) return 1.0;

      // Cubic initial guess near flat boundaries where S_5'(t) -> 0
      let t = target;
      if (target <= 0.05) {
        t = Math.cbrt(target / 10.0);
      } else if (target >= 0.95) {
        t = 1.0 - Math.cbrt((1.0 - target) / 10.0);
      }

      for (let i = 0; i < 4; i++) {
        const t2 = t * t;
        const t3 = t2 * t;
        const oneMinusT = 1.0 - t;
        const f = t3 * (t * (t * 6.0 - 15.0) + 10.0) - target;
        const df = 30.0 * t2 * oneMinusT * oneMinusT;
        const d2f = 60.0 * t * oneMinusT * (1.0 - 2.0 * t);
        const denom = 2.0 * df * df - f * d2f;
        if (Math.abs(denom) < 1e-12) break;
        const step = (2.0 * f * df) / denom;
        t = Math.max(0.0, Math.min(1.0, t - step));
      }
      return t;
    };

    const evaluateEase = (t: number): number => {
      const c = Math.max(0.0, Math.min(1.0, t));
      return c * c * c * (c * (c * 6.0 - 15.0) + 10.0);
    };

    if (!wasPlayingRef.current) {
      wasPlayingRef.current = true;
      playbackClockRef.current = invertQuintic(alpha);
      if (playbackClockRef.current >= 1.0 && playDirection > 0) {
        setPlayDirection(-1);
      } else if (playbackClockRef.current <= 0.0 && playDirection < 0) {
        setPlayDirection(1);
      }
    }

    let animId: number;
    let lastT = performance.now();
    let lastUiSync = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastT) * 0.001;
      lastT = now;
      const step = dt * 0.20 * playbackSpeed * playDirection;
      playbackClockRef.current += step;
      if (playbackClockRef.current >= 1.0) {
        playbackClockRef.current = 1.0;
        setPlayDirection(-1);
      } else if (playbackClockRef.current <= 0.0) {
        playbackClockRef.current = 0.0;
        setPlayDirection(1);
      }

      const easedAlpha = evaluateEase(playbackClockRef.current);

      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_ANIM_ALPHA__ = easedAlpha;
      }

      // Throttled UI state sync at 20 Hz (every 50ms) to eliminate 120 Hz React Virtual DOM diff storms
      if (now - lastUiSync >= 50) {
        setAlpha(easedAlpha);
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
      // Guard against overwriting manual drag value on unmount
      if (typeof window === 'undefined' || (window as any).__INDICATRIX_SCRUB_ALPHA__ === undefined) {
        setAlpha(evaluateEase(playbackClockRef.current));
      }
    };
  }, [isPlaying, playDirection, playbackSpeed]);

  // Centralized glide kinematics & mode coordination (R4)
  const glideAnimRef = useRef<number | null>(null);
  const alphaRef = useRef(alpha);
  alphaRef.current = alpha;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const cancelGlide = useCallback(() => {
    if (glideAnimRef.current !== null) {
      cancelAnimationFrame(glideAnimRef.current);
      glideAnimRef.current = null;
    }
    if (typeof window !== 'undefined') {
      (window as any).__INDICATRIX_SCRUB_ALPHA__ = undefined;
    }
  }, []);

  const glideToAlpha = useCallback((targetAlpha: number, duration: number = 650) => {
    cancelGlide();
    setIsPlaying(false);
    const startAlpha = alphaRef.current;
    const clampedTarget = Math.max(0.0, Math.min(1.0, targetAlpha));
    if (Math.abs(startAlpha - clampedTarget) < 0.0001) return;
    const startTime = performance.now();
    let lastUiSync = startTime;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // Quintic smootherstep easing
      const ease = progress * progress * progress * (progress * (progress * 6.0 - 15.0) + 10.0);
      const cur = startAlpha + (clampedTarget - startAlpha) * ease;
      alphaRef.current = cur;
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_SCRUB_ALPHA__ = cur;
      }
      // UI state sync at ~60Hz (every 16ms) for smooth sextant reticle tracking
      if (now - lastUiSync >= 16) {
        setAlpha(cur);
        lastUiSync = now;
      }
      if (progress < 1.0) {
        glideAnimRef.current = requestAnimationFrame(animate);
      } else {
        glideAnimRef.current = null;
        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_SCRUB_ALPHA__ = undefined;
        }
        alphaRef.current = clampedTarget;
        setAlpha(clampedTarget);
      }
    };
    glideAnimRef.current = requestAnimationFrame(animate);
  }, [cancelGlide]);

  const glideToMode = useCallback((targetMode: SimulationMode) => {
    if (modeRef.current === targetMode) return;
    cancelGlide();
    setIsPlaying(false);

    if (alphaRef.current < 0.01) {
      modeRef.current = targetMode;
      setMode(targetMode);
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_MODE__ = targetMode;
      }
      return;
    }

    const startAlpha = alphaRef.current;
    const startTime = performance.now();
    let lastUiSync = startTime;
    let switchedMode = false;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < 250) {
        // Phase 1: 250ms cubic ease-in to alpha = 0.00
        const p = Math.min(1.0, elapsed / 250);
        const easeIn = p * p * p;
        const curAlpha = Math.max(0.0, startAlpha * (1.0 - easeIn));
        alphaRef.current = curAlpha;
        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_SCRUB_ALPHA__ = curAlpha;
        }
        if (now - lastUiSync >= 16) {
          setAlpha(curAlpha);
          lastUiSync = now;
        }
        glideAnimRef.current = requestAnimationFrame(animate);
      } else if (elapsed < 280) {
        // Singularity point: 30ms dwell window at alpha = 0.000 for clean mode handover
        if (!switchedMode) {
          modeRef.current = targetMode;
          setMode(targetMode);
          if (typeof window !== 'undefined') {
            (window as any).__INDICATRIX_MODE__ = targetMode;
          }
          switchedMode = true;
        }
        alphaRef.current = 0.0;
        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_SCRUB_ALPHA__ = 0.0;
        }
        if (now - lastUiSync >= 16) {
          setAlpha(0.0);
          lastUiSync = now;
        }
        glideAnimRef.current = requestAnimationFrame(animate);
      } else if (elapsed < 630) {
        // Phase 2: 350ms cubic ease-out restore to startAlpha
        if (!switchedMode) {
          modeRef.current = targetMode;
          setMode(targetMode);
          if (typeof window !== 'undefined') {
            (window as any).__INDICATRIX_MODE__ = targetMode;
          }
          switchedMode = true;
        }
        const p = Math.min(1.0, (elapsed - 280) / 350);
        const q = 1.0 - p;
        const easeOut = 1.0 - q * q * q;
        const curAlpha = Math.min(1.0, startAlpha * easeOut);
        alphaRef.current = curAlpha;
        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_SCRUB_ALPHA__ = curAlpha;
        }
        if (now - lastUiSync >= 16) {
          setAlpha(curAlpha);
          lastUiSync = now;
        }
        glideAnimRef.current = requestAnimationFrame(animate);
      } else {
        if (!switchedMode) {
          modeRef.current = targetMode;
          setMode(targetMode);
          if (typeof window !== 'undefined') {
            (window as any).__INDICATRIX_MODE__ = targetMode;
          }
        }
        glideAnimRef.current = null;
        if (typeof window !== 'undefined') {
          (window as any).__INDICATRIX_SCRUB_ALPHA__ = undefined;
          (window as any).__INDICATRIX_MODE__ = undefined;
        }
        alphaRef.current = startAlpha;
        setAlpha(startAlpha);
      }
    };
    glideAnimRef.current = requestAnimationFrame(animate);
  }, [cancelGlide]);

  useEffect(() => {
    if (isPlaying) {
      cancelGlide();
    }
  }, [isPlaying, cancelGlide]);

  useEffect(() => {
    return () => {
      if (glideAnimRef.current !== null) {
        cancelAnimationFrame(glideAnimRef.current);
        glideAnimRef.current = null;
      }
    };
  }, []);

  return {
    backend, setBackend,
    theme, setTheme,
    setMediumId,
    themePalette,
    isolatedStratum, setIsolatedStratum,
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
    showSoundings, setShowSoundings,
    showTriangulation, setShowTriangulation,
    showCartouche, setShowCartouche,
    isPlaying, setIsPlaying,
    playDirection, setPlayDirection,
    playbackSpeed, setPlaybackSpeed,
    isZenMode, setIsZenMode,
    fractureIntensity, setFractureIntensity,
    fluidVortexStrength, setFluidVortexStrength,
    gpuReport, setGpuReport,
    dataInfo, setDataInfo,
    showClouds, setShowClouds,
    showCloudLow, setShowCloudLow,
    showCloudMid, setShowCloudMid,
    showCloudHigh, setShowCloudHigh,
    cloudDriftSpeed, setCloudDriftSpeed,
    cloudOpacity, setCloudOpacity,
    cloudFalseColor, setCloudFalseColor,
    setCloudOptions,
    cdlodDiagnosticMode, setCdlodDiagnosticMode,
    glideToAlpha,
    glideToMode,
    cancelGlide,
  };
}

export type EngineStateHook = ReturnType<typeof useEngineState>;
