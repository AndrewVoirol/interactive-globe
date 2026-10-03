import React, { useState, useMemo, useCallback } from 'react';
import { SimulationMode, GeodesicOverlayMode } from '../../../types';
import { TactileSwitch } from '../../ui/TactileSwitch';
import { VernierSlider } from '../../ui/VernierSlider';
import { TactileSelect } from '../../ui/TactileSelect';

export interface KinematicsTabProps {
  theme: 0 | 1 | 2;
  mode: SimulationMode;
  alpha: number;
  latStr: string;
  cameraPosition?: [number, number, number];
  onSnapCamera: (v: 'equator' | 'pole' | 'seam' | 'isometric' | 'horizon') => void;
  isDemoMode?: boolean;
  demoSequence?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji';
  onToggleDemoMode?: (seq?: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => void;
  onSelectDemoSequence?: (seq: 'hawaii' | 'cape-cod' | 'grand-canyon' | 'fuji') => void;
  fractureIntensity?: number;
  onFractureIntensityChange?: (v: number) => void;
  fluidVortexStrength?: number;
  onFluidVortexStrengthChange?: (v: number) => void;
  showTissot: boolean;
  onTissotToggle: () => void;
  activeOverlay: GeodesicOverlayMode;
  onOverlayChange: (o: GeodesicOverlayMode) => void;
}

export const PROJECTION_MODES = [
  { id: 0, roman: 'I', label: 'Linear' },
  { id: 1, roman: 'II', label: 'Scroll' },
  { id: 2, roman: 'III', label: 'Fracture' },
  { id: 3, roman: 'IV', label: 'Fluid' },
] as const;

export const DEMO_PRESETS = [
  { id: 'hawaii', label: 'Hawaii', coordinates: "19°49'N 155°28'W", description: 'Volcanic hotspot & ocean trench' },
  { id: 'cape-cod', label: 'Cape Cod', coordinates: "41°54'N 70°03'W", description: 'Coastal spit & moraine barrier' },
  { id: 'grand-canyon', label: 'Grand Canyon', coordinates: "36°06'N 112°06'W", description: 'Riparian orogeny & canyon incision' },
  { id: 'fuji', label: 'Mount Fuji', coordinates: "35°21'N 138°43'E", description: 'Stratovolcano & caldera relief' },
] as const;

export const KinematicsTab: React.FC<KinematicsTabProps> = ({
  theme,
  mode,
  alpha,
  latStr,
  cameraPosition,
  onSnapCamera,
  isDemoMode = false,
  demoSequence = 'hawaii',
  onToggleDemoMode,
  onSelectDemoSequence,
  fractureIntensity = 1.0,
  onFractureIntensityChange,
  fluidVortexStrength = 1.0,
  onFluidVortexStrengthChange,
  showTissot,
  onTissotToggle,
  activeOverlay,
  onOverlayChange,
}) => {
  const [activeSnap, setActiveSnap] = useState<'equator' | 'pole' | 'seam' | 'isometric' | 'horizon' | null>(null);

  const attitudeReadout = useMemo(() => {
    const pos = cameraPosition || [0, 0, 15];
    const [x, y, z] = pos;
    const r = Math.sqrt(x * x + y * y + z * z);
    const alt = r > 0.001 ? r.toFixed(1) : '15.0';
    let pitch = (Math.asin(Math.max(-1, Math.min(1, y / (r || 1)))) * (180 / Math.PI)).toFixed(1);
    if (pitch === '-0.0') pitch = '0.0';
    let yaw = (Math.atan2(x, z) * (180 / Math.PI)).toFixed(1);
    if (yaw === '-0.0') yaw = '0.0';
    return `PITCH: ${pitch}° · YAW: ${yaw}° · ALT: ${alt} R`;
  }, [cameraPosition]);

  const parsedLat = useMemo(() => {
    if (!latStr) return 0;
    const match = latStr.match(/(\d+)°(?:(\d+)['\u2032])?([NS])?/);
    if (!match) return 0;
    const deg = parseFloat(match[1]) + (match[2] ? parseFloat(match[2]) / 60 : 0);
    return match[3] === 'S' ? -deg : deg;
  }, [latStr]);

  const tissotTelemetry = useMemo(() => {
    const latRad = (parsedLat * Math.PI) / 180;
    const cosLat = Math.max(0.087, Math.cos(latRad));
    const eqArea = ((1 - alpha) * 1.0 + alpha * 1.0).toFixed(3);
    const camBaseRatio = mode === 1 ? 1.0 / (cosLat * cosLat) : mode === 0 ? 1.0 / cosLat : 1.0;
    const localArea = ((1 - alpha) * 1.0 + alpha * camBaseRatio).toFixed(3);
    const polarBaseRatio = mode === 1 ? 131.6 : mode === 0 ? 11.5 : mode === 3 ? 1.0 : 1.12;
    const polarVal = (1 - alpha) * 1.0 + alpha * polarBaseRatio;
    const polarStr = mode === 1 ? (alpha < 0.01 ? '1.000×' : `${polarVal.toFixed(1)}× (85° limit)`) : `${polarVal.toFixed(2)}×`;
    return { eqArea, localArea, polarStr };
  }, [parsedLat, alpha, mode]);

  const handleSelectGeodesicFeed = useCallback(
    (feed: GeodesicOverlayMode) => {
      onOverlayChange?.(feed);
      if (typeof window !== 'undefined') {
        const camDev = (window as any).__INDICATRIX_CAMERA__;
        if (feed === 'conveyor') {
          if (camDev?.easeToCoordinates) camDev.easeToCoordinates(-165, 10, 14.0, 1.4);
          else if (camDev?.lookAtCoordinates) camDev.lookAtCoordinates(-165, 10, 14.0);
        } else if (feed === 'migration') {
          if (camDev?.easeToCoordinates) camDev.easeToCoordinates(-175, 15, 14.0, 1.4);
          else if (camDev?.lookAtCoordinates) camDev.lookAtCoordinates(-175, 15, 14.0);
        } else if (feed === 'antipodes') {
          if (camDev?.easeToCoordinates) camDev.easeToCoordinates(-65, 0, 14.0, 1.4);
          else if (camDev?.lookAtCoordinates) camDev.lookAtCoordinates(-65, 0, 14.0);
        }
      }
    },
    [onOverlayChange]
  );

  return (
    <>
      {/* 1. Spatial Vantage & Flight Deck */}
      <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
            Spatial Vantage & Flight Deck
          </div>
          <span className="text-nano font-mono opacity-60 text-[var(--theme-text-muted)]">
            Attitude
          </span>
        </div>

        <div className="px-2 py-1 rounded-[2px] bg-[var(--theme-control-bg)] border border-[var(--theme-control-border)] text-nano font-mono tracking-wider text-center text-[var(--theme-text-accent)] tabular-nums font-semibold">
          {attitudeReadout}
        </div>

        <div className="grid grid-cols-5 gap-1 text-nano font-bold">
          {([
            { key: 'equator', label: 'Equator', glyph: '⊝' },
            { key: 'pole', label: 'Pole', glyph: '⊙' },
            { key: 'seam', label: 'Seam', glyph: '⦶' },
            { key: 'isometric', label: 'Iso', glyph: '◬' },
            { key: 'horizon', label: 'Horizon', glyph: '☵' },
          ] as const).map((snap) => {
            const isSnapActive = activeSnap === snap.key;
            return (
              <button
                key={snap.key}
                type="button"
                onClick={() => {
                  setActiveSnap(snap.key);
                  onSnapCamera(snap.key);
                }}
                data-glyph={snap.glyph}
                aria-pressed={isSnapActive}
                title={`${snap.label} (${snap.glyph})`}
                className={`py-1.5 px-0.5 rounded-[2px] border transition-all cursor-pointer text-center truncate select-none flex flex-col items-center justify-center before:content-[attr(data-glyph)] before:block before:text-micro before:leading-none before:opacity-75 before:mb-0.5 ${
                  isSnapActive
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-semibold ring-1 ring-[var(--theme-control-active-ring)]'
                    : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] hover:bg-[var(--theme-card-bg)]'
                }`}
              >
                <span>{snap.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => onSnapCamera?.('horizon')}
            title="Set camera pitch to 78.0° tangent grazing angle for volumetric atmospheric profile view"
            className="w-full py-1.5 px-2 rounded-[2px] border text-nano font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-control-active-border)]"
          >
            <span>☵</span>
            <span>Horizon Cross-Section (78.0°)</span>
          </button>
        </div>

        <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                Flyover Tour
              </span>
              <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                Cinematic orbital & regional insets
              </span>
            </div>
            <TactileSwitch
              checked={Boolean(isDemoMode)}
              onChange={() => onToggleDemoMode?.(demoSequence)}
              title="Toggle Continuous Cinematics & Regional Insets Tour"
              label={isDemoMode ? 'Active' : 'Off'}
            />
          </div>
          <TactileSelect
            id="sidebar-demo-sequence"
            value={demoSequence || 'hawaii'}
            ariaLabel="Demo Sequence Preset"
            disabled={!isDemoMode}
            onChange={(val) => onSelectDemoSequence?.(val as any)}
            options={DEMO_PRESETS}
          />
        </div>
      </div>

      {/* 2. Projection Manifold Station */}
      <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2 transition-all shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
            Projection Manifold
          </span>
          <span className="text-nano font-mono text-[var(--theme-text-muted)]">
            Dock Controlled
          </span>
        </div>

        <div
          className="px-2.5 py-1.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] flex items-center justify-between transition-all"
          title="Projection mode is controlled via the Navigation Dock"
        >
          <div className="flex flex-col">
            <span className="text-nano font-mono uppercase tracking-wider text-[var(--theme-text-muted)]">
              Active Manifold
            </span>
            <span className="text-micro font-bold font-mono text-[var(--theme-text-primary)]">
              Mode {PROJECTION_MODES[mode]?.roman ?? 'I'} · {PROJECTION_MODES[mode]?.label ?? 'Linear'}
            </span>
          </div>
          <span className="text-nano font-mono px-2 py-0.5 rounded-[2px] bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-sm font-semibold">
            Synchronized
          </span>
        </div>

        {mode === 2 && (
          <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <VernierSlider
              id="sidebar-fracture-intensity"
              label="Fracture"
              tooltip="Griffith linear elastic fracture mechanics (LEFM) rift expansion multiplier (0.50× to 2.50×)"
              value={fractureIntensity ?? 1.0}
              min={0.5}
              max={2.5}
              step={0.05}
              defaultValue={1.0}
              readout={`${(fractureIntensity ?? 1.0).toFixed(2)}×`}
              onChange={(v) => onFractureIntensityChange?.(v)}
            />
          </div>
        )}

        {mode === 3 && (
          <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <VernierSlider
              id="sidebar-vortex-strength"
              label="Vortex"
              tooltip="Lamb-Oseen hydrodynamic vortex circulation intensity for fluid manifold unfurling (0.20× to 3.00×)"
              value={fluidVortexStrength ?? 1.0}
              min={0.2}
              max={3.0}
              step={0.05}
              defaultValue={1.0}
              readout={`${(fluidVortexStrength ?? 1.0).toFixed(2)}×`}
              onChange={(v) => onFluidVortexStrengthChange?.(v)}
            />
          </div>
        )}

        <div className="pt-2 border-t border-[var(--theme-card-border)] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                Distortion Indicatrix
              </span>
              <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                Tissot deformation ellipses
              </span>
            </div>
            <TactileSwitch
              checked={showTissot}
              onChange={onTissotToggle}
              title="Toggle Tissot Distortion Indicatrix Ellipses"
              label={showTissot ? 'Active' : 'Off'}
            />
          </div>

          {showTissot && (
            <div className="p-2 rounded-[2px] border text-micro space-y-1.5 tabular-nums bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]">
              <div className="flex justify-between items-center text-nano uppercase tracking-wider font-semibold">
                <span>Distortion Metric</span>
                <span className="text-[var(--theme-status-sage)] font-bold">Morphing</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-nano font-mono">
                <div>
                  <span className="text-[var(--theme-text-muted)] block truncate text-nano uppercase">Eq. Area:</span>
                  <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.eqArea}×</span>
                </div>
                <div>
                  <span className="text-[var(--theme-text-muted)] block truncate text-nano uppercase">Local ({latStr.trim()}):</span>
                  <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.localArea}×</span>
                </div>
                <div>
                  <span className="text-[var(--theme-text-muted)] block truncate text-nano uppercase">Polar Dilation:</span>
                  <span className="font-semibold text-[var(--theme-text-primary)]">{tissotTelemetry.polarStr}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Global Geodesic Feeds Card */}
      <div className="p-2.5 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] space-y-2.5 transition-all shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
            Global Geodesic Feeds
          </div>
          <span className="text-nano font-mono text-[var(--theme-text-muted)] opacity-80">
            {activeOverlay === 'off' ? 'Off' : activeOverlay}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => handleSelectGeodesicFeed('off')}
            className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
              activeOverlay === 'off'
                ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm font-semibold'
                : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] bg-[var(--theme-control-bg)]'
            }`}
          >
            Off
          </button>
          <button
            type="button"
            onClick={() => handleSelectGeodesicFeed('antipodes')}
            title="Antipodal Geodesic Connectors"
            className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
              activeOverlay === 'antipodes'
                ? theme === 1
                  ? 'bg-[#8C4820] text-[#FDFCF9] border-[#6D3414] shadow-sm font-semibold ring-1 ring-[#8C4820]/40'
                  : 'bg-rose-500/35 text-rose-200 border-rose-400/80 shadow-[0_0_10px_rgba(244,63,94,0.4)] ring-1 ring-rose-400/60 font-semibold'
                : theme === 1
                ? 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[#8C4820] hover:border-[#8C4820]/40 bg-[var(--theme-control-bg)]'
                : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-accent)] hover:border-[var(--theme-control-border-hover)] bg-[var(--theme-control-bg)]'
            }`}
          >
            Antipodes
          </button>
          <button
            type="button"
            onClick={() => handleSelectGeodesicFeed('conveyor')}
            title="Global Oceanic Conveyor Belt"
            className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
              activeOverlay === 'conveyor'
                ? theme === 1
                  ? 'bg-[#1A4457] text-[#FDFCF9] border-[#102D3A] shadow-sm font-semibold ring-1 ring-[#1A4457]/40'
                  : 'bg-sky-500/35 text-sky-200 border-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.4)] ring-1 ring-sky-400/60 font-semibold'
                : theme === 1
                ? 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[#1A4457] hover:border-[#1A4457]/40 bg-[var(--theme-control-bg)]'
                : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-sky-500 hover:border-sky-400/50 bg-[var(--theme-control-bg)]'
            }`}
          >
            Conveyor
          </button>
          <button
            type="button"
            onClick={() => handleSelectGeodesicFeed('migration')}
            title="Great Circle Migration"
            className={`py-1.5 px-1 rounded-[2px] text-nano font-bold transition-all text-center border cursor-pointer ${
              activeOverlay === 'migration'
                ? theme === 1
                  ? 'bg-[#7D4700] text-[#FDFCF9] border-[#5A3300] shadow-sm font-semibold ring-1 ring-[#7D4700]/40'
                  : 'bg-[var(--theme-status-amber)]/35 text-[var(--theme-status-amber)] border-[var(--theme-status-amber)]/80 shadow-[0_0_10px_var(--theme-status-amber)] ring-1 ring-[var(--theme-status-amber)]/60 font-semibold'
                : theme === 1
                ? 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[#7D4700] hover:border-[#7D4700]/40 bg-[var(--theme-control-bg)]'
                : 'border-[var(--theme-control-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-status-amber)] hover:border-[var(--theme-status-amber)]/50 bg-[var(--theme-control-bg)]'
            }`}
          >
            Migration
          </button>
        </div>
      </div>
    </>
  );
};
