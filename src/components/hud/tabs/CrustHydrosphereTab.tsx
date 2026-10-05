import React, { useState, useCallback } from 'react';
import { PolarSunCompass } from '../instruments/PolarSunCompass';
import { HypsometricReliefCurve } from '../instruments/HypsometricReliefCurve';
import { BathymetricTideGauge } from '../instruments/BathymetricTideGauge';
import { TactileSwitch } from '../../ui/TactileSwitch';
import { VernierSlider } from '../../ui/VernierSlider';
import { ThemeManager } from '../../../core/themes/ThemeManager';
import type { DataLayerItem } from '../UnifiedRightSidebar';

export const PIGMENT_SWATCHES: Record<0 | 1 | 2, Array<{ hex: string; depth: string }>> = {
  0: [{ hex: '#0f171f', depth: '-11,000m' }, { hex: '#22384a', depth: 'Shelf Break' }, { hex: '#3b788a', depth: 'Coastal' }, { hex: '#cbb692', depth: 'Steppe' }, { hex: '#f4ede1', depth: 'Glacial' }],
  1: [{ hex: '#263b52', depth: '-11,000m' }, { hex: '#77998b', depth: 'Shelf Break' }, { hex: '#cfb588', depth: 'Coastal' }, { hex: '#9e6d50', depth: 'Steppe' }, { hex: '#fdfcf9', depth: 'Glacial' }],
  2: [{ hex: '#0e1824', depth: '-11,000m' }, { hex: '#162b42', depth: 'Shelf Break' }, { hex: '#294d75', depth: 'Coastal' }, { hex: '#4f79a3', depth: 'Steppe' }, { hex: '#e8edf2', depth: 'Glacial' }],
};

export interface CrustHydrosphereTabProps {
  theme: 0 | 1 | 2;
  isLight: boolean;
  primaryLayer?: DataLayerItem;
  primaryLayerId: string;
  onHillshadeChangeDataLayer?: (id: string, azimuth: number, intensity: number, altitude?: number) => void;
  onDisplacementScaleChangeDataLayer?: (id: string, scale: number) => void;
  onPeakExponentChangeDataLayer?: (id: string, exponent: number) => void;
  onAmbientOcclusionChangeDataLayer?: (id: string, ao: number) => void;
  onSeaLevelOffsetChangeDataLayer?: (id: string, offset: number) => void;
  onWaterClarityChangeDataLayer?: (id: string, clarity: number) => void;
  onPaperToothChangeDataLayer?: (id: string, tooth: number) => void;
  isolatedStratum: number | null;
  setIsolatedStratum: (stratum: number | null) => void;
  onIsolatedStratumChange?: (stratum: number | null, swatch?: { hex: string; depth: string } | null) => void;
  applyMediumCalibration: (targetMode: 0 | 1 | 2) => void;
  layerMode: 0 | 1 | 2;
  onLayerModeChange: (l: 0 | 1 | 2) => void;
  showVectors: boolean;
  onVectorsToggle: () => void;
  showSoundings?: boolean;
  onSoundingsToggle?: () => void;
  showTriangulation?: boolean;
  onTriangulationToggle?: () => void;
  showLandmarks: boolean;
  onLandmarksToggle: () => void;
  propShowClouds?: boolean;
  handleToggleClouds: (val: boolean) => void;
  terrainShadows?: boolean;
  onTerrainShadowsToggle?: () => void;
  onTerrainShadowsChange?: (enabled: boolean) => void;
  penumbraSoftness?: number;
  onPenumbraSoftnessChange?: (softness: number) => void;
  geomorphicHydrology?: boolean;
  onGeomorphicHydrologyToggle?: () => void;
  onGeomorphicHydrologyChange?: (enabled: boolean) => void;
  pluvialDischargeCoupling?: number;
  onPluvialDischargeCouplingChange?: (val: number) => void;
  bedrockIncision?: number;
  onBedrockIncisionChange?: (val: number) => void;
}

export const CrustHydrosphereTab: React.FC<CrustHydrosphereTabProps> = ({
  theme,
  isLight,
  primaryLayer,
  primaryLayerId,
  onHillshadeChangeDataLayer,
  onDisplacementScaleChangeDataLayer,
  onPeakExponentChangeDataLayer,
  onAmbientOcclusionChangeDataLayer,
  onSeaLevelOffsetChangeDataLayer,
  onWaterClarityChangeDataLayer,
  onPaperToothChangeDataLayer,
  isolatedStratum,
  setIsolatedStratum,
  onIsolatedStratumChange,
  applyMediumCalibration,
  layerMode,
  onLayerModeChange,
  showVectors,
  onVectorsToggle,
  showSoundings,
  onSoundingsToggle,
  showTriangulation,
  onTriangulationToggle,
  showLandmarks,
  onLandmarksToggle,
  propShowClouds,
  handleToggleClouds,
  terrainShadows: propTerrainShadows,
  onTerrainShadowsToggle,
  onTerrainShadowsChange,
  penumbraSoftness: propPenumbraSoftness,
  onPenumbraSoftnessChange,
  geomorphicHydrology: propGeomorphicHydrology,
  onGeomorphicHydrologyToggle,
  onGeomorphicHydrologyChange,
  pluvialDischargeCoupling: propPluvialDischargeCoupling,
  onPluvialDischargeCouplingChange,
  bedrockIncision: propBedrockIncision,
  onBedrockIncisionChange,
}) => {
  const [internalTerrainShadows, setInternalTerrainShadows] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__;
      if (live?.terrainShadows !== undefined) return Boolean(live.terrainShadows);
      if (live?.showTerrainShadows !== undefined) return Boolean(live.showTerrainShadows);
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine && typeof engine.isTerrainShadowsEnabled === 'function') {
        return engine.isTerrainShadowsEnabled();
      }
    }
    return false;
  });

  const [internalPenumbraSoftness, setInternalPenumbraSoftness] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__;
      if (live?.penumbraSoftness !== undefined) return live.penumbraSoftness;
    }
    return 1.5;
  });

  const activeTerrainShadows = propTerrainShadows !== undefined ? propTerrainShadows : internalTerrainShadows;
  const activePenumbraSoftness = propPenumbraSoftness !== undefined ? propPenumbraSoftness : internalPenumbraSoftness;

  const handleToggleTerrainShadows = useCallback((nextVal?: boolean) => {
    const val = nextVal !== undefined ? nextVal : !activeTerrainShadows;
    setInternalTerrainShadows(val);
    if (onTerrainShadowsChange) {
      onTerrainShadowsChange(val);
    } else if (onTerrainShadowsToggle) {
      onTerrainShadowsToggle();
    }
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__ || {};
      live.terrainShadows = val;
      live.showTerrainShadows = val;
      (window as any).__INDICATRIX_LIVE_UNIFORMS__ = live;
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine) {
        if (typeof engine.setTerrainShadowsEnabled === 'function') {
          engine.setTerrainShadowsEnabled(val);
        }
        if (typeof engine.updateTerrainShadowUniforms === 'function') {
          engine.updateTerrainShadowUniforms({
            penumbraSoftness: activePenumbraSoftness,
          });
        }
      }
    }
  }, [activeTerrainShadows, activePenumbraSoftness, onTerrainShadowsChange, onTerrainShadowsToggle]);

  const handlePenumbraSoftnessChange = useCallback((val: number) => {
    setInternalPenumbraSoftness(val);
    onPenumbraSoftnessChange?.(val);
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__ || {};
      live.penumbraSoftness = val;
      (window as any).__INDICATRIX_LIVE_UNIFORMS__ = live;
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine && typeof engine.updateTerrainShadowUniforms === 'function') {
        engine.updateTerrainShadowUniforms({
          penumbraSoftness: val,
        });
      }
    }
  }, [onPenumbraSoftnessChange]);

  const [internalGeomorphicHydrology, setInternalGeomorphicHydrology] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__;
      if (live?.geomorphicHydrology !== undefined) return Boolean(live.geomorphicHydrology);
      if (live?.showDrainageHydrology !== undefined) return Boolean(live.showDrainageHydrology);
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine && typeof engine.isDrainageHydrologyEnabled === 'function') {
        return engine.isDrainageHydrologyEnabled();
      }
    }
    return false;
  });

  const [internalPluvialDischargeCoupling, setInternalPluvialDischargeCoupling] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__;
      if (live?.pluvialDischargeCoupling !== undefined) return live.pluvialDischargeCoupling;
    }
    return 1.0;
  });

  const [internalBedrockIncision, setInternalBedrockIncision] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__;
      if (live?.bedrockIncision !== undefined) return live.bedrockIncision;
    }
    return 1.0;
  });

  const activeGeomorphicHydrology = propGeomorphicHydrology !== undefined ? propGeomorphicHydrology : internalGeomorphicHydrology;
  const activePluvialDischargeCoupling = propPluvialDischargeCoupling !== undefined ? propPluvialDischargeCoupling : internalPluvialDischargeCoupling;
  const activeBedrockIncision = propBedrockIncision !== undefined ? propBedrockIncision : internalBedrockIncision;

  const handleToggleGeomorphicHydrology = useCallback((nextVal?: boolean) => {
    const val = nextVal !== undefined ? nextVal : !activeGeomorphicHydrology;
    setInternalGeomorphicHydrology(val);
    if (onGeomorphicHydrologyChange) {
      onGeomorphicHydrologyChange(val);
    } else if (onGeomorphicHydrologyToggle) {
      onGeomorphicHydrologyToggle();
    }
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__ || {};
      live.geomorphicHydrology = val;
      live.showDrainageHydrology = val;
      (window as any).__INDICATRIX_LIVE_UNIFORMS__ = live;
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine) {
        if (typeof engine.setDrainageHydrologyEnabled === 'function') {
          engine.setDrainageHydrologyEnabled(val);
        }
        if (typeof engine.updateDrainageUniforms === 'function') {
          engine.updateDrainageUniforms({
            pluvialCoupling: activePluvialDischargeCoupling,
            bedrockIncision: activeBedrockIncision,
          });
        }
      }
    }
  }, [activeGeomorphicHydrology, activePluvialDischargeCoupling, activeBedrockIncision, onGeomorphicHydrologyChange, onGeomorphicHydrologyToggle]);

  const handlePluvialDischargeCouplingChange = useCallback((val: number) => {
    setInternalPluvialDischargeCoupling(val);
    onPluvialDischargeCouplingChange?.(val);
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__ || {};
      live.pluvialDischargeCoupling = val;
      (window as any).__INDICATRIX_LIVE_UNIFORMS__ = live;
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine && typeof engine.updateDrainageUniforms === 'function') {
        engine.updateDrainageUniforms({
          pluvialCoupling: val,
        });
      }
    }
  }, [onPluvialDischargeCouplingChange]);

  const handleBedrockIncisionChange = useCallback((val: number) => {
    setInternalBedrockIncision(val);
    onBedrockIncisionChange?.(val);
    if (typeof window !== 'undefined') {
      const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__ || {};
      live.bedrockIncision = val;
      (window as any).__INDICATRIX_LIVE_UNIFORMS__ = live;
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (engine && typeof engine.updateDrainageUniforms === 'function') {
        engine.updateDrainageUniforms({
          bedrockIncision: val,
        });
      }
    }
  }, [onBedrockIncisionChange]);

  return (
    <>
      {/* 1. Solar Illumination & Hillshade Station */}
      <PolarSunCompass
        theme={theme}
        azimuth={primaryLayer?.sunAzimuth ?? 315}
        altitude={primaryLayer?.sunAltitude ?? 45}
        onChange={(azimuth, altitude) => {
          onHillshadeChangeDataLayer?.(
            primaryLayerId,
            azimuth,
            primaryLayer?.hillshadeIntensity ?? 0.65,
            altitude
          );
          if (typeof window !== 'undefined') {
            const live = (window as any).__INDICATRIX_LIVE_UNIFORMS__ || {};
            live.sunAzimuth = azimuth;
            live.sunAltitude = altitude;
            (window as any).__INDICATRIX_LIVE_UNIFORMS__ = live;
            const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
            if (engine && typeof engine.updateTerrainShadowUniforms === 'function') {
              engine.updateTerrainShadowUniforms({
                sunAzimuth: azimuth,
                sunAltitude: altitude,
              });
            }
          }
        }}
        isLight={isLight}
      >
        {/* Dynamic Terrain Horizon Self-Shadows & Canyon Lighting */}
        <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                Terrain Self-Shadows
              </span>
              <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                Horizon occlusion & canyon shadow rays
              </span>
            </div>
            <TactileSwitch
              id="sidebar-terrain-shadows-toggle"
              checked={activeTerrainShadows}
              onChange={handleToggleTerrainShadows}
              title="Toggle Dynamic Terrain Horizon Self-Shadows"
              label={activeTerrainShadows ? 'Active' : 'Off'}
              indicatorColor="var(--theme-status-amber)"
            />
          </div>

          {/* Collapsible Slider: Penumbra Softness */}
          <div
            className={`transition-all duration-150 ease-out overflow-hidden ${
              activeTerrainShadows
                ? 'max-h-[120px] opacity-100 space-y-1.5 pointer-events-auto'
                : 'max-h-0 opacity-0 p-0 m-0 pointer-events-none'
            }`}
            style={{ transitionTimingFunction: 'var(--theme-spring-switch, cubic-bezier(0.34, 1.35, 0.64, 1))' }}
          >
            <div className="flex items-center justify-between text-nano pt-1">
              <span className="text-[var(--theme-text-secondary)] font-bold uppercase tracking-wider">
                Penumbra Softness:
              </span>
              <span className="font-semibold tabular-nums text-[var(--theme-text-primary)] font-mono">
                {activePenumbraSoftness.toFixed(2)}×
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="sidebar-terrain-shadow-softness"
                name="penumbraSoftness"
                type="range"
                min="0.5"
                max="3.0"
                step="0.05"
                value={activePenumbraSoftness}
                aria-label="Penumbra Softness"
                title="Penumbra Softness (Double-click to reset: 1.5×)"
                onDoubleClick={() => handlePenumbraSoftnessChange(1.5)}
                onChange={(e) => handlePenumbraSoftnessChange(parseFloat(e.target.value))}
                className="flex-1 slider-archival cursor-pointer h-1 rounded-[1px]"
              />
            </div>
          </div>
        </div>
      </PolarSunCompass>

      {/* 2. Hypsometric Relief & Lithosphere Station */}
      <HypsometricReliefCurve
        theme={theme}
        displacementScale={primaryLayer?.displacementScale ?? 0.08}
        peakExponent={primaryLayer?.peakExponent ?? 1.4}
        onDisplacementChange={(scale) => onDisplacementScaleChangeDataLayer?.(primaryLayerId, scale)}
        onPeakExponentChange={(exponent) => onPeakExponentChangeDataLayer?.(primaryLayerId, exponent)}
        isLight={isLight}
      >
        <div className="pt-2 border-t border-[var(--theme-card-border)]">
          <VernierSlider
            id="sidebar-crevice-ao"
            label="Crevice Depth"
            sublabel="DEM surface curvature ambient occlusion"
            tooltip="Darkens concave ravines and canyon floors via DEM surface curvature"
            value={primaryLayer?.ambientOcclusion ?? 0.65}
            min={0.0}
            max={1.0}
            step={0.05}
            defaultValue={0.65}
            readout={`${Math.round((primaryLayer?.ambientOcclusion ?? 0.65) * 100)}%`}
            onChange={(v) => onAmbientOcclusionChangeDataLayer?.(primaryLayerId, v)}
            className="!border-0 !bg-transparent !p-0 !shadow-none"
          />
        </div>

        {/* Elevation Stratum Filter */}
        <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-1">
          <div className="flex items-center justify-between text-nano font-medium text-[var(--theme-text-secondary)]">
            <span className="uppercase tracking-wider">Hypsometric Strata</span>
            {isolatedStratum !== null && (
              <button
                type="button"
                onClick={() => {
                  setIsolatedStratum(null);
                  onIsolatedStratumChange?.(null, null);
                  ThemeManager.getInstance().setIsolatedStratum(null, null);
                  if (primaryLayerId) {
                    applyMediumCalibration(theme);
                  }
                }}
                className="cursor-pointer text-nano text-[var(--theme-text-accent)] hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1" role="group" aria-label="Hypsometric stratum pigment pans">
            {PIGMENT_SWATCHES[theme].map((swatch, idx) => {
              const isIsolated = isolatedStratum === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    const nextStratum = isolatedStratum === idx ? null : idx;
                    const nextSwatch = nextStratum !== null ? swatch : null;
                    setIsolatedStratum(nextStratum);
                    onIsolatedStratumChange?.(nextStratum, nextSwatch);
                    ThemeManager.getInstance().setIsolatedStratum(nextStratum, nextSwatch);

                    if (primaryLayerId) {
                      if (nextStratum === null) {
                        applyMediumCalibration(theme);
                      } else if (idx === 0) {
                        onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, -25);
                        onWaterClarityChangeDataLayer?.(primaryLayerId, 0.92);
                      } else if (idx === 1) {
                        onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, -8);
                        onWaterClarityChangeDataLayer?.(primaryLayerId, 0.82);
                        onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.72);
                      } else if (idx === 2) {
                        onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, 0);
                        onWaterClarityChangeDataLayer?.(primaryLayerId, 0.75);
                      } else if (idx === 3) {
                        onPeakExponentChangeDataLayer?.(primaryLayerId, 1.3);
                        onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.12);
                      } else if (idx === 4) {
                        onPeakExponentChangeDataLayer?.(primaryLayerId, 2.0);
                        onDisplacementScaleChangeDataLayer?.(primaryLayerId, 0.16);
                        onAmbientOcclusionChangeDataLayer?.(primaryLayerId, 0.75);
                      }
                    }
                  }}
                  className={`pigment-pan p-1 rounded-[2px] border text-center flex flex-col items-center gap-1 transition-all shadow-sm cursor-pointer select-none ${
                    isIsolated
                      ? 'ring-2 ring-[var(--theme-text-accent)] border-[var(--theme-control-active-border)] bg-[var(--theme-control-active-bg)]'
                      : 'border-[var(--theme-card-border)] bg-[var(--theme-control-bg)] hover:border-[var(--theme-card-border-hover)]'
                  }`}
                  title={`${swatch.depth} (${swatch.hex})`}
                  aria-label={`Isolate ${swatch.depth} stratum (${swatch.hex})`}
                  aria-pressed={isIsolated}
                >
                  <div
                    className="w-full h-3.5 rounded-[1px] border border-black/20 shadow-inner shrink-0"
                    style={{ backgroundColor: swatch.hex }}
                  />
                  <div className={`text-nano font-mono ${isIsolated ? 'opacity-100' : 'opacity-80'} uppercase tracking-tighter ${
                    isIsolated
                      ? 'text-[var(--theme-control-active-text)]'
                      : 'text-[var(--theme-text-secondary)]'
                  } shrink-0 truncate w-full text-center`}>
                    {swatch.depth}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </HypsometricReliefCurve>

      {/* 3. Bathymetric Hydrosphere & Drainage Station */}
      <BathymetricTideGauge
        theme={theme}
        seaLevelOffset={primaryLayer?.seaLevelOffset ?? 0}
        waterClarity={primaryLayer?.waterClarity ?? 0.75}
        onSeaLevelChange={(offset) => onSeaLevelOffsetChangeDataLayer?.(primaryLayerId, offset)}
        onWaterClarityChange={(clarity) => onWaterClarityChangeDataLayer?.(primaryLayerId, clarity)}
        isLight={isLight}
      >
        {/* Dynamic Geomorphic Drainage Basin Synthesis & Leopold-Maddock Hydrology */}
        <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                Geomorphic Hydrology
              </span>
              <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                D-∞ catchment routing & Leopold-Maddock
              </span>
            </div>
            <TactileSwitch
              id="sidebar-geomorphic-hydrology-toggle"
              checked={activeGeomorphicHydrology}
              onChange={handleToggleGeomorphicHydrology}
              title="Toggle Dynamic Geomorphic Hydrology & Basin Accumulation"
              label={activeGeomorphicHydrology ? 'Active' : 'Off'}
              indicatorColor="var(--theme-status-amber)"
            />
          </div>

          {/* Collapsible Sliders: Pluvial Discharge Coupling & Bedrock Incision */}
          <div
            className={`transition-all duration-150 ease-out overflow-hidden ${
              activeGeomorphicHydrology
                ? 'max-h-[160px] opacity-100 space-y-2 pointer-events-auto'
                : 'max-h-0 opacity-0 p-0 m-0 pointer-events-none'
            }`}
            style={{ transitionTimingFunction: 'var(--theme-spring-switch, cubic-bezier(0.34, 1.35, 0.64, 1))' }}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between text-nano pt-1">
                <span className="text-[var(--theme-text-secondary)] font-bold uppercase tracking-wider">
                  Pluvial Coupling:
                </span>
                <span className="font-semibold tabular-nums text-[var(--theme-text-primary)] font-mono">
                  {activePluvialDischargeCoupling.toFixed(2)}×
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="sidebar-pluvial-discharge-coupling"
                  name="pluvialDischargeCoupling"
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={activePluvialDischargeCoupling}
                  aria-label="Pluvial Discharge Coupling"
                  title="Pluvial Discharge Coupling (Double-click to reset: 1.0×)"
                  onDoubleClick={() => handlePluvialDischargeCouplingChange(1.0)}
                  onChange={(e) => handlePluvialDischargeCouplingChange(parseFloat(e.target.value))}
                  className="flex-1 slider-archival cursor-pointer h-1 rounded-[1px]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-nano">
                <span className="text-[var(--theme-text-secondary)] font-bold uppercase tracking-wider">
                  Bedrock Incision:
                </span>
                <span className="font-semibold tabular-nums text-[var(--theme-text-primary)] font-mono">
                  {activeBedrockIncision.toFixed(2)}×
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="sidebar-bedrock-incision"
                  name="bedrockIncision"
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={activeBedrockIncision}
                  aria-label="Bedrock Incision"
                  title="Bedrock Incision (Double-click to reset: 1.0×)"
                  onDoubleClick={() => handleBedrockIncisionChange(1.0)}
                  onChange={(e) => handleBedrockIncisionChange(parseFloat(e.target.value))}
                  className="flex-1 slider-archival cursor-pointer h-1 rounded-[1px]"
                />
              </div>
            </div>
          </div>
        </div>
      </BathymetricTideGauge>

      {/* 1. Manifold Strata Station */}
      <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
            Manifold Strata
          </div>
          <span className="text-nano font-mono opacity-60 text-[var(--theme-text-muted)]">
            {layerMode === 0 ? '0 · Composite' : layerMode === 1 ? '1 · Stipple' : '2 · Lattice'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          {([
            { id: 0, label: 'Composite', glyph: '⛶', title: '0: Composite — Combined stipple nodes and wireframe lattice' },
            { id: 1, label: 'Stipple', glyph: '•', title: '1: Stipple — Discrete point sounding matrix only' },
            { id: 2, label: 'Lattice', glyph: '◇', title: '2: Lattice — Triangulated Delaunay wireframe mesh only' },
          ] as const).map((s) => {
            const isActive = layerMode === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onLayerModeChange(s.id as 0 | 1 | 2)}
                title={s.title}
                aria-pressed={isActive}
                className={`tactile-btn cursor-pointer py-1.5 px-1 rounded-[2px] text-nano font-mono uppercase tracking-tight text-center border transition-all flex flex-col items-center gap-0.5 ${
                  isActive
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-bold shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                    : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                }`}
              >
                <span className="text-micro leading-none opacity-70" aria-hidden="true">{s.glyph}</span>
                <span className="truncate w-full">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Vector Ink & Geodetic Survey Feeds Station */}
      <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
              Vectors (V)
            </span>
            <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
              Coastlines & graticule linework
            </span>
          </div>
          <TactileSwitch
            checked={showVectors}
            onChange={onVectorsToggle}
            title="Toggle Coastline & Boundary Vectors (Press V)"
            label={showVectors ? 'Active' : 'Off'}
          />
        </div>

        {/* Geodetic Survey Feeds: Soundings, Triangulation, Landmarks */}
        <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-1.5">
          <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
            Geodetic Survey Feeds
          </div>
          <div className="space-y-1.5 pt-0.5">
            <TactileSwitch
              checked={showSoundings}
              onChange={onSoundingsToggle}
              title="Toggle Soundings"
              label="Soundings"
              sublabel="Marine bathymetric depth matrix"
              indicatorColor="var(--theme-status-slate)"
            />
            <TactileSwitch
              checked={showTriangulation}
              onChange={onTriangulationToggle}
              title="Toggle Triangulation"
              label="Triangulation"
              sublabel="Geodetic Delaunay survey baseline"
              indicatorColor="var(--theme-text-accent)"
            />
            <TactileSwitch
              checked={showLandmarks}
              onChange={onLandmarksToggle}
              title="Toggle Landmarks"
              label="Landmarks"
              sublabel="Astronomical observatories & promontories"
              indicatorColor="var(--theme-status-amber)"
            />
          </div>
        </div>
      </div>

      {/* Atmospheric Clouds & DeepMind WeatherNext 3 Master Switch */}
      <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
              Atmospheric Clouds
            </span>
            <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
              DeepMind WeatherNext 3 (0.1° AI) & 3D Raymarch
            </span>
          </div>
          <TactileSwitch
            id="sidebar-cartography-clouds-toggle"
            checked={Boolean(propShowClouds)}
            onChange={handleToggleClouds}
            title="Master toggle for atmospheric cloud cover and 3D volumetric raymarching"
            label={propShowClouds ? 'Active' : 'Off'}
            indicatorColor="var(--theme-status-slate)"
          />
        </div>
      </div>
    </>
  );
};
