// ============================================================================
// File: src/components/hud/instruments/StratosphericTelemetryInstrument.tsx
// Stratospheric Telemetry Caliper Instrument: Tropospheric Altitude & Kinematics HUD
// Ported from testbed/weather.html #caliper-card into production React HUD card
// Display: Cursor Target, Camera Elevation, Pitch/Heading, Tropospheric Regime,
//          Raymarch Interval, Forecast Cycle, Strata Color Mode, Grid Resolution
// Invariants: Rule 6 (Single-Border, 10px Clearance, Ivory Vellum Card Tone)
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { VernierSlider } from '../../ui/VernierSlider';
import type { ResolutionTier } from '../../../types';

export interface StratosphericTelemetryInstrumentProps {
  theme?: 0 | 1 | 2; // 0: Marie Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  isLight?: boolean;
  cloudFalseColor?: boolean;
  resolution?: ResolutionTier;
  onPitchChange?: (pitchDeg: number) => void;
  className?: string;
}

const EARTH_RADIUS_KM = 6371.0;
const GLOBE_RADIUS_UNITS = 5.0;
const KM_PER_UNIT = EARTH_RADIUS_KM / GLOBE_RADIUS_UNITS; // ~1274.2 km/unit

function unitDistToKm(d: number): number {
  const elevUnits = Math.max(0.00001, d - GLOBE_RADIUS_UNITS);
  return elevUnits * KM_PER_UNIT;
}

function getStratumName(km: number): string {
  if (km > 100.0) return 'ORBITAL SPACE';
  if (km > 20.0) return 'STRATOSPHERE';
  if (km > 12.0) return 'UPPER TROPOSPHERE (ABOVE CIRRUS)';
  if (km > 6.0) return 'HIGH STRATA (INSIDE CIRRUS DECK)';
  if (km > 2.0) return 'MID STRATA (ALTOCUMULUS FLIGHT)';
  if (km > 0.8) return 'LOW STRATA (MARINE STRATUS BASE)';
  return 'SUB-CLOUD CEILING (ON TERRAIN)';
}

export const StratosphericTelemetryInstrument: React.FC<StratosphericTelemetryInstrumentProps> = ({
  theme: propTheme,
  isLight = false,
  cloudFalseColor = false,
  resolution: propResolution,
  onPitchChange,
  className = '',
}) => {
  const activeTheme: 0 | 1 | 2 = propTheme !== undefined ? propTheme : isLight ? 1 : 0;

  const [camDist, setCamDist] = useState<number>(15.0);
  const [pitch, setPitch] = useState<number>(0.0);
  const [heading, setHeading] = useState<number>(0.0);
  const [coords, setCoords] = useState<{ lat?: number; lon?: number } | null>(null);
  const [cloudSteps, setCloudSteps] = useState<number>(32);

  // Poll camera and coordinate telemetry at ~10 Hz without React tree thrash
  useEffect(() => {
    let active = true;

    const poll = () => {
      if (!active || typeof window === 'undefined') return;
      const cam = (window as any).__INDICATRIX_CAMERA__;
      if (cam) {
        if (typeof cam.getPitch === 'function') {
          setPitch(cam.getPitch());
        } else if (cam.pitch !== undefined) {
          setPitch(cam.pitch);
        }
        const activeCoords = (typeof cam.getCursorCoords === 'function' ? cam.getCursorCoords() : cam.cursorCoords)
          || (typeof cam.getActiveCoords === 'function' ? cam.getActiveCoords() : cam.activeCoords);
        if (activeCoords) {
          const c = activeCoords;
          setCoords((prev) => {
            if (!prev || prev.lat !== c.lat || prev.lon !== c.lon) {
              return { lat: c.lat, lon: c.lon };
            }
            return prev;
          });
        }
        if (typeof cam.getCamDist === 'function') {
          const cd = cam.getCamDist();
          if (Number.isFinite(cd)) {
            setCamDist(cd);
          }
        } else if (typeof cam.getAltitudeUnits === 'function') {
          const alt = cam.getAltitudeUnits();
          if (Number.isFinite(alt)) {
            setCamDist(GLOBE_RADIUS_UNITS + alt);
          }
        } else if (typeof cam.getSpherical === 'function') {
          const s = cam.getSpherical();
          if (s && Number.isFinite(s.radius)) {
            setCamDist(s.radius);
          }
        }
      }
      const engine = (window as any).__INDICATRIX_ENGINE__;
      if (!cam?.getCamDist && !cam?.getAltitudeUnits && engine && engine.cameraRef && engine.cameraRef.position) {
        const d = engine.cameraRef.position.length();
        if (Number.isFinite(d)) {
          setCamDist(d);
        }
      }
      const webgpuEngine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
      if (webgpuEngine && typeof webgpuEngine.getCloudMaxSteps === 'function') {
        const s = webgpuEngine.getCloudMaxSteps();
        if (Number.isFinite(s)) {
          setCloudSteps(s);
        }
      }
    };

    poll();
    const interval = setInterval(poll, 100);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handlePitchSliderChange = useCallback(
    (newPitch: number) => {
      const clamped = Math.max(0, Math.min(85, newPitch));
      setPitch(clamped);
      if (typeof window !== 'undefined') {
        const cam = (window as any).__INDICATRIX_CAMERA__;
        if (cam && typeof cam.setPitch === 'function') {
          cam.setPitch(clamped);
        } else {
          (window as any).__INDICATRIX_LIVE_UNIFORMS__ = {
            ...((window as any).__INDICATRIX_LIVE_UNIFORMS__ || {}),
            cameraPitchDeg: clamped,
          };
        }
      }
      onPitchChange?.(clamped);
    },
    [onPitchChange]
  );

  const km = unitDistToKm(camDist);
  const kmStr =
    km >= 10.0
      ? `${km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
      : `${(km * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} m`;

  const stratum = getStratumName(km);

  // Tropospheric Regime calculation
  const rOuter = GLOBE_RADIUS_UNITS + 0.035;
  let regimeText = 'REGIME 1: ORBITAL SPACE';
  let regimeColor = 'text-[var(--theme-text-accent)]';
  if (camDist <= rOuter && camDist >= GLOBE_RADIUS_UNITS) {
    regimeText = 'REGIME 2: INSIDE TROPOSPHERE';
    regimeColor = 'text-[var(--theme-status-sage)]';
  } else if (camDist < GLOBE_RADIUS_UNITS) {
    regimeText = 'REGIME 3: SUB-CLOUD CEILING';
    regimeColor = 'text-[var(--theme-status-amber)]';
  }

  // Raymarch interval through tropospheric bounding shell
  let rayRangeKm = 0;
  if (camDist > rOuter) {
    rayRangeKm = 0.035 * KM_PER_UNIT;
  } else if (camDist >= GLOBE_RADIUS_UNITS) {
    rayRangeKm = (camDist - GLOBE_RADIUS_UNITS) * KM_PER_UNIT;
  } else {
    rayRangeKm = (rOuter - camDist) * KM_PER_UNIT;
  }

  const cursorTargetStr =
    coords?.lat !== undefined && coords?.lon !== undefined
      ? `${Math.abs(coords.lat).toFixed(2)}°${coords.lat >= 0 ? 'N' : 'S'}, ${Math.abs(coords.lon).toFixed(2)}°${coords.lon >= 0 ? 'E' : 'W'}`
      : 'Hover over globe...';

  return (
    <div
      className={`p-2 rounded-[3px] border shadow-sm transition-all space-y-2 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] ${className}`}
      data-testid="stratospheric-telemetry-instrument"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--theme-control-border)]/50 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-body text-[var(--theme-text-accent)] font-bold">◬</span>
          <span className="font-mono text-nano uppercase tracking-wider font-bold">
            Stratospheric Telemetry
          </span>
        </div>
        <span className="text-body font-mono font-bold text-[var(--theme-status-sage)] px-1 py-px rounded-[2px] bg-[var(--theme-status-sage)]/10 border border-[var(--theme-status-sage)]/30">
          60 FPS
        </span>
      </div>

      {/* Telemetry rows */}
      <div className="space-y-1 font-mono text-title leading-tight">
        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Cursor Target:</span>
          <span className="font-semibold text-[var(--theme-status-sage)] text-body truncate max-w-[170px]" title={cursorTargetStr}>
            {cursorTargetStr}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Camera Elevation:</span>
          <span className="font-semibold text-[var(--theme-text-primary)] text-body">{kmStr}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Camera Pitch / Hdg:</span>
          <span className="font-semibold text-[var(--theme-text-primary)] text-body">
            {pitch.toFixed(1)}° (Hdg {heading.toFixed(0)}°)
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Tropospheric Regime:</span>
          <span className={`font-bold text-body ${regimeColor}`}>{regimeText}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Current Stratum:</span>
          <span className="font-bold text-[var(--theme-status-amber)] text-body truncate max-w-[180px]">{stratum}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Raymarch Interval:</span>
          <span className="font-semibold text-[var(--theme-text-primary)] text-body">
            {rayRangeKm.toFixed(1)} km
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Raymarch Step Budget:</span>
          <span className="font-semibold text-[var(--theme-text-primary)] text-body">
            {cloudSteps} steps ({propResolution || (cloudSteps <= 16 ? '100k' : cloudSteps <= 32 ? '1M' : cloudSteps <= 40 ? '3M' : cloudSteps <= 48 ? '4M' : cloudSteps <= 56 ? '8M' : '16M')})
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Forecast Cycle:</span>
          <span className="font-semibold text-[var(--theme-status-amber)] text-body">2026-09-24 10:00Z (+0–11h)</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Strata Color Mode:</span>
          <span className="font-semibold text-[var(--theme-text-accent)] text-body">
            {cloudFalseColor ? 'Doppler Spectral' : 'Archival Ink Wash'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Grid Resolution:</span>
          <span className="font-semibold text-[var(--theme-text-secondary)] text-body">
            3600 × 1801 (0.1°)
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[var(--theme-text-muted)] text-body">Wind Vector Field:</span>
          <span className="font-semibold text-[var(--theme-status-sage)] text-body">rg16float (Active)</span>
        </div>
      </div>

      {/* Interactive Camera Horizon Pitch Vernier Slider */}
      <div className="space-y-1.5 pt-1.5 border-t border-[var(--theme-control-border)]/50">
        <div className="flex items-center justify-between text-nano">
          <span className="font-mono uppercase tracking-wider text-[var(--theme-text-muted)]">
            Horizon Pitch Angle
          </span>
          <span className="font-mono font-bold text-body text-[var(--theme-text-primary)]">
            {pitch.toFixed(1)}°
          </span>
        </div>

        <VernierSlider
          id="camera-horizon-tilt"
          value={pitch}
          min={0}
          max={85}
          step={1}
          onChange={handlePitchSliderChange}
          label="Camera Horizon Tilt"
          unit="°"
        />

        {/* Quick Pitch Presets */}
        <div className="grid grid-cols-4 gap-1 pt-0.5">
          {[
            { label: '0° Nadir', val: 0.0 },
            { label: '45° Oblique', val: 45.0 },
            { label: '78° Horizon', val: 78.0 },
            { label: '85° Grazing', val: 85.0 },
          ].map((preset) => {
            const isActive = Math.abs(pitch - preset.val) < 2.0;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePitchSliderChange(preset.val)}
                className={`py-1 px-1 rounded-[2px] border text-center transition-all cursor-pointer font-mono text-micro ${
                  isActive
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-bold shadow-2xs'
                    : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
                }`}
                title={`Set camera tilt to ${preset.val}°`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
