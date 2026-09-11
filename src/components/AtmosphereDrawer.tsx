// ============================================================================
// File: src/components/AtmosphereDrawer.tsx
// Atmospheric Cloud Strata Controls & Horizon Cross-Section Preset Drawer
// Calibrated Atmospheric Scale [1.0 .. 12.0] & Shadow Intensity [0.0 .. 0.60]
// Invariants: §2 (10px Moat/20px Gutters), §4 (Single-Border), §6 (Ivory Vellum), §21 (Collapsing)
// ============================================================================

import React, { useState, useCallback } from 'react';
import { VernierSlider } from './ui/VernierSlider';

export interface AtmosphereDrawerProps {
  theme?: 0 | 1 | 2;
  isLight?: boolean;
  showClouds?: boolean;
  onShowCloudsChange?: (v: boolean) => void;
  showCloudLow?: boolean;
  onShowCloudLowChange?: (v: boolean) => void;
  showCloudMid?: boolean;
  onShowCloudMidChange?: (v: boolean) => void;
  showCloudHigh?: boolean;
  onShowCloudHighChange?: (v: boolean) => void;
  cloudDriftSpeed?: number;
  onCloudDriftSpeedChange?: (v: number) => void;
  cloudOpacity?: number;
  onCloudOpacityChange?: (v: number) => void;
  atmosphericScale?: number;
  onAtmosphericScaleChange?: (v: number) => void;
  shadowIntensity?: number;
  onShadowIntensityChange?: (v: number) => void;
  onHorizonPresetClick?: () => void;
  onSnapCamera?: (snap: 'equator' | 'pole' | 'seam' | 'isometric' | 'horizon') => void;
  onTogglePlanetaryLayer?: (id: string, force?: boolean) => void;
  className?: string;
}

export const AtmosphereDrawer: React.FC<AtmosphereDrawerProps> = ({
  theme = 0,
  isLight = false,
  showClouds: propShowClouds,
  onShowCloudsChange,
  showCloudLow: propShowCloudLow,
  onShowCloudLowChange,
  showCloudMid: propShowCloudMid,
  onShowCloudMidChange,
  showCloudHigh: propShowCloudHigh,
  onShowCloudHighChange,
  cloudDriftSpeed: propCloudDriftSpeed,
  onCloudDriftSpeedChange,
  cloudOpacity: propCloudOpacity,
  onCloudOpacityChange,
  atmosphericScale: propAtmosphericScale,
  onAtmosphericScaleChange,
  shadowIntensity: propShadowIntensity,
  onShadowIntensityChange,
  onHorizonPresetClick,
  onSnapCamera,
  onTogglePlanetaryLayer,
  className = '',
}) => {
  const [internalShowClouds, setInternalShowClouds] = useState<boolean>(true);
  const [internalShowCloudLow, setInternalShowCloudLow] = useState<boolean>(true);
  const [internalShowCloudMid, setInternalShowCloudMid] = useState<boolean>(true);
  const [internalShowCloudHigh, setInternalShowCloudHigh] = useState<boolean>(true);
  const [internalCloudDriftSpeed, setInternalCloudDriftSpeed] = useState<number>(1.0);
  const [internalCloudOpacity, setInternalCloudOpacity] = useState<number>(0.8);
  const [internalAtmosphericScale, setInternalAtmosphericScale] = useState<number>(3.5);
  const [internalShadowIntensity, setInternalShadowIntensity] = useState<number>(0.45);

  const curShowClouds = propShowClouds !== undefined ? propShowClouds : internalShowClouds;
  const curShowCloudLow = propShowCloudLow !== undefined ? propShowCloudLow : internalShowCloudLow;
  const curShowCloudMid = propShowCloudMid !== undefined ? propShowCloudMid : internalShowCloudMid;
  const curShowCloudHigh = propShowCloudHigh !== undefined ? propShowCloudHigh : internalShowCloudHigh;
  const curCloudDriftSpeed = propCloudDriftSpeed !== undefined ? propCloudDriftSpeed : internalCloudDriftSpeed;
  const curCloudOpacity = propCloudOpacity !== undefined ? propCloudOpacity : internalCloudOpacity;
  const curAtmosphericScale = propAtmosphericScale !== undefined ? propAtmosphericScale : internalAtmosphericScale;
  const curShadowIntensity = propShadowIntensity !== undefined ? propShadowIntensity : internalShadowIntensity;

  const handleToggleClouds = (val: boolean) => {
    setInternalShowClouds(val);
    onShowCloudsChange?.(val);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showClouds: val });
    }
  };

  const handleToggleCloudLow = () => {
    const next = !curShowCloudLow;
    setInternalShowCloudLow(next);
    onShowCloudLowChange?.(next);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudLow: next });
    }
  };

  const handleToggleCloudMid = () => {
    const next = !curShowCloudMid;
    setInternalShowCloudMid(next);
    onShowCloudMidChange?.(next);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudMid: next });
    }
  };

  const handleToggleCloudHigh = () => {
    const next = !curShowCloudHigh;
    setInternalShowCloudHigh(next);
    onShowCloudHighChange?.(next);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ showCloudHigh: next });
    }
  };

  const handleCloudDriftChange = (val: number) => {
    const clamped = Math.max(0.0, Math.min(3.0, val));
    setInternalCloudDriftSpeed(clamped);
    onCloudDriftSpeedChange?.(clamped);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ cloudDriftSpeed: clamped });
    }
  };

  const handleCloudOpacityChange = (val: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, val));
    setInternalCloudOpacity(clamped);
    onCloudOpacityChange?.(clamped);
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
      (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ cloudOpacity: clamped });
    }
  };

  const handleAtmosphericScaleChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const clamped = Math.max(1.0, Math.min(12.0, val));
    setInternalAtmosphericScale(clamped);
    onAtmosphericScaleChange?.(clamped);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__) {
        (window as any).__INDICATRIX_SET_ATMOSPHERIC_SCALE__(clamped);
      }
      if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ atmosphericScale: clamped });
      }
    }
  };

  const handleShadowIntensityChange = (val: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const clamped = Math.max(0.0, Math.min(0.60, val));
    setInternalShadowIntensity(clamped);
    onShadowIntensityChange?.(clamped);
    if (typeof window !== 'undefined') {
      if ((window as any).__INDICATRIX_SET_SHADOW_INTENSITY__) {
        (window as any).__INDICATRIX_SET_SHADOW_INTENSITY__(clamped);
      }
      if ((window as any).__INDICATRIX_SET_CLOUD_OPTIONS__) {
        (window as any).__INDICATRIX_SET_CLOUD_OPTIONS__({ shadowIntensity: clamped });
      }
    }
  };

  const handleHorizonCrossSectionPreset = useCallback(() => {
    // 1. Ensure master clouds are enabled
    if (!curShowClouds) {
      handleToggleClouds(true);
    }
    // 2. Ensure Jet Stream is active
    onTogglePlanetaryLayer?.('noaa-gfs-jetstream', true);

    // 3. Set atmospheric scale >= 6.0x for clear visual strata separation
    if (curAtmosphericScale <= 1.05) {
      handleAtmosphericScaleChange(6.0);
    }

    // 4. Custom preset callback or snap camera
    if (onHorizonPresetClick) {
      onHorizonPresetClick();
    } else if (onSnapCamera) {
      onSnapCamera('horizon');
    }

    // 5. Invoke programmatic hook if available in window
    if (typeof window !== 'undefined' && (window as any).__INDICATRIX_CAMERA__?.snapHorizonCrossSection) {
      (window as any).__INDICATRIX_CAMERA__.snapHorizonCrossSection(1.6);
    }
  }, [curShowClouds, curAtmosphericScale, onHorizonPresetClick, onSnapCamera, onTogglePlanetaryLayer]);

  return (
    <div
      className={`p-2 rounded-[3px] border space-y-2 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] ${className}`}
    >
      {/* Header with Master Switch */}
      <div className="flex items-center justify-between text-nano font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
        <span className="flex items-center gap-1.5">
          <span>Atmospheric Cloud Strata</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={curShowClouds}
          onClick={() => handleToggleClouds(!curShowClouds)}
          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            curShowClouds
              ? 'bg-[var(--theme-control-active-bg)] ring-1 ring-[var(--theme-control-active-border)]'
              : 'bg-[var(--theme-control-bg)] border border-[var(--theme-control-border)]'
          }`}
          title="Master Atmosphere Deck (All Cloud Layers)"
        >
          <span
            className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              curShowClouds
                ? 'translate-x-3 bg-[var(--theme-text-accent)]'
                : 'translate-x-0 bg-[var(--theme-text-muted)]'
            }`}
          />
        </button>
      </div>

      {/* Collapsible Strata Instrumentation (Invariant §21) */}
      {curShowClouds && (
        <div className="space-y-2 pt-1 border-t border-[var(--theme-card-border)]">
          {/* Tri-Altitude Layer Toggles */}
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={handleToggleCloudLow}
              className={`py-1 px-1.5 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                curShowCloudLow
                  ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm'
                  : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
              }`}
              title="Low Stratus / Fog (1–2 km altitude)"
            >
              <span className="font-bold text-nano">LOW</span>
              <span className="text-nano opacity-75">1–2 km</span>
            </button>
            <button
              type="button"
              onClick={handleToggleCloudMid}
              className={`py-1 px-1.5 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                curShowCloudMid
                  ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm'
                  : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
              }`}
              title="Mid Altocumulus (4–6 km altitude)"
            >
              <span className="font-bold text-nano">MID</span>
              <span className="text-nano opacity-75">4–6 km</span>
            </button>
            <button
              type="button"
              onClick={handleToggleCloudHigh}
              className={`py-1 px-1.5 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                curShowCloudHigh
                  ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm'
                  : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
              }`}
              title="High Cirrus (10–12 km altitude)"
            >
              <span className="font-bold text-nano">HIGH</span>
              <span className="text-nano opacity-75">10–12 km</span>
            </button>
          </div>

          {/* Cloud Drift Speed Vernier Slider */}
          <VernierSlider
            id="sidebar-cloud-drift"
            label="Drift Speed"
            sublabel="Atmospheric Advection"
            value={curCloudDriftSpeed}
            min={0.0}
            max={3.0}
            step={0.1}
            readout={`${curCloudDriftSpeed.toFixed(1)}x`}
            onChange={handleCloudDriftChange}
          />

          {/* Cloud Opacity Vernier Slider */}
          <VernierSlider
            id="sidebar-cloud-opacity"
            label="Cloud Opacity"
            sublabel="Strata Density"
            value={curCloudOpacity}
            min={0.1}
            max={1.0}
            step={0.05}
            readout={`${Math.round(curCloudOpacity * 100)}%`}
            onChange={handleCloudOpacityChange}
          />

          {/* Atmospheric Scale Vernier Slider (Spec §2.3) */}
          <VernierSlider
            id="sidebar-atmospheric-scale"
            label="Atmospheric Scale"
            sublabel="Troposphere Standoff Exaggeration (k_exagg)"
            value={curAtmosphericScale}
            min={1.0}
            max={12.0}
            step={0.1}
            readout={`${curAtmosphericScale.toFixed(1)}x`}
            onChange={handleAtmosphericScaleChange}
          />

          {/* Shadow Intensity Vernier Slider (Spec §2.1) */}
          <VernierSlider
            id="sidebar-shadow-intensity"
            label="Shadow Intensity"
            sublabel="Dynamic Cloud Ground Shadows"
            value={curShadowIntensity}
            min={0.0}
            max={0.60}
            step={0.05}
            readout={`${Math.round(curShadowIntensity * 100)}%`}
            onChange={handleShadowIntensityChange}
          />

          {/* 1-Click Horizon Cross-Section (78°) Camera Preset Button */}
          <button
            type="button"
            onClick={handleHorizonCrossSectionPreset}
            className={`w-full py-1.5 px-2 rounded-[2px] border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
              theme === 1
                ? 'bg-[#96641e]/20 hover:bg-[#96641e]/35 text-[#52350c] border-[#96641e]/40'
                : theme === 2
                ? 'bg-[#3a5578]/30 hover:bg-[#3a5578]/50 text-[#dbe5f0] border-[#5a6e8c]/50'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
            }`}
            title="1-Click Horizon Cross-Section (Pitch 78°, Oblique Limb View)"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-nano truncate flex items-center gap-1">
                <span>◬</span>
                <span>Horizon Cross-Section (78°)</span>
              </span>
              <span className="text-nano text-[var(--theme-text-muted)] truncate opacity-80">
                Pitch 78.0° • Atmospheric Strata
              </span>
            </div>
            <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] border shrink-0 bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)]">
              78.0° Oblique
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AtmosphereDrawer;
