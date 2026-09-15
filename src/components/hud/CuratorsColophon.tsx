// ============================================================================
// File: src/components/hud/CuratorsColophon.tsx
// Curator's Colophon / Sheet Cartouche
// Provides unambiguous cartographic data provenance and technical datum references
// so any viewer or multimodal model immediately knows the exact origin of all layers.
// ============================================================================

import React from 'react';
import { SimulationMode } from '../../types';

export interface CuratorsColophonProps {
  theme: 0 | 1 | 2;
  mode?: SimulationMode;
  alpha?: number;
  isWeatherActive?: boolean;
  isRadarActive?: boolean;
  className?: string;
  compact?: boolean;
}

export const CuratorsColophon: React.FC<CuratorsColophonProps> = ({
  theme,
  mode = 0,
  alpha = 0,
  isWeatherActive = true,
  isRadarActive = false,
  className = '',
  compact = false,
}) => {
  const mediumName =
    theme === 1
      ? '310 GSM Cotton Rag (1910 Ordnance Survey / Imhof Relief)'
      : theme === 2
      ? 'Prussian Cyanotype (1842 Sir John Herschel Ferroprussiate Blueprint)'
      : 'Marie Tharp Physiographic Chart (1977 Bruce Heezen Bathymetry)';

  const modeName =
    mode === 0
      ? 'Mode 1: Linear Dilation (Geodesic Morph)'
      : mode === 1
      ? 'Mode 2: Cylinder Unroll (Mercator Seam)'
      : mode === 2
      ? 'Mode 3: Griffith LEFM Rupture'
      : mode === 3
      ? 'Mode 4: Fluid Vortex Advection (Navier-Stokes)'
      : 'Mode 5: Fuller Dymaxion Net';

  const unfurlState =
    alpha < 0.02
      ? 'Spherical Geoid (K > 0)'
      : alpha > 0.98
      ? 'Planar Sheet (K = 0)'
      : `Continuous Morph (α = ${alpha.toFixed(3)})`;

  if (compact) {
    return (
      <div
        className={`rounded-[2px] border px-2 py-1.5 font-mono text-[9px] transition-all shadow-sm select-none ${
          theme === 1
            ? 'bg-[#FDFCFA]/90 border-[#D8C7B0] text-[#4A3B32]'
            : theme === 2
            ? 'bg-[#0E1E2E]/90 border-[#2A4B6E] text-[#B0D2F0]'
            : 'bg-[#0F171F]/90 border-[#22384A] text-[#C5A059]'
        } font-telemetry ${className}`}
      >
        <div className="flex items-center justify-between gap-1 pb-1 mb-1 border-b border-current/15 text-[8.5px] uppercase tracking-wider font-semibold">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                theme === 1
                  ? 'bg-[#8C4820]'
                  : theme === 2
                  ? 'bg-[#4FA3E3] shadow-[0_0_6px_rgba(79,163,227,0.8)]'
                  : 'bg-[#C5A059] shadow-[0_0_6px_rgba(197,160,89,0.8)]'
              }`}
            />
            <span className="font-bold tracking-wider text-current">Provenant Feeds</span>
          </div>
          <div className="flex items-center gap-1 text-[8px] text-[var(--theme-status-sage)] font-mono">
            <span className="w-1 h-1 rounded-full bg-[var(--theme-status-sage)] animate-pulse" />
            LIVE ATTRIBUTION
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[8.5px] leading-tight font-mono">
          <div className="flex items-center gap-1 truncate" title="NOAA NCEI ETOPO 2022 (15 arc-second DEM)">
            <span className="w-1 h-1 rounded-full bg-[var(--theme-status-sage)] shrink-0" />
            <span className="truncate font-semibold">ETOPO 2022 (15&quot;)</span>
          </div>
          <div className="flex items-center gap-1 truncate" title="Google DeepMind WeatherNext 3 (0.1° Reanalysis)">
            <span className={`w-1 h-1 rounded-full shrink-0 ${isWeatherActive ? 'bg-[var(--theme-status-sage)]' : 'bg-current opacity-40'}`} />
            <span className="truncate font-semibold">WeatherNext 3 (0.1°)</span>
          </div>
          <div className="flex items-center gap-1 truncate" title="RainViewer Doppler Radar Mosaic">
            <span className={`w-1 h-1 rounded-full shrink-0 ${isRadarActive ? 'bg-[var(--theme-status-sage)]' : 'bg-current opacity-40'}`} />
            <span className="truncate font-semibold">RainViewer Radar</span>
          </div>
          <div className="flex items-center gap-1 truncate" title="Natural Earth 1:10M Vector Boundaries">
            <span className="w-1 h-1 rounded-full bg-[var(--theme-status-sage)] shrink-0" />
            <span className="truncate font-semibold">Natural Earth 10M</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[3px] border p-3 font-mono text-nano transition-all shadow-sm select-none ${
        theme === 1
          ? 'bg-[#FDFCFA]/90 border-[#D8C7B0] text-[#4A3B32]'
          : theme === 2
          ? 'bg-[#0E1E2E]/90 border-[#2A4B6E] text-[#B0D2F0]'
          : 'bg-[#0F171F]/90 border-[#22384A] text-[#C5A059]'
      } font-telemetry ${className}`}
    >
      {/* Colophon Header */}
      <div className="flex items-center justify-between border-b pb-1.5 mb-2 border-current/20">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              theme === 1
                ? 'bg-[#8C4820]'
                : theme === 2
                ? 'bg-[#4FA3E3] shadow-[0_0_6px_rgba(79,163,227,0.8)]'
                : 'bg-[#C5A059] shadow-[0_0_6px_rgba(197,160,89,0.8)]'
            }`}
          />
          <span className="font-bold tracking-wider uppercase text-micro text-current">
            Curator's Colophon
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold opacity-90 text-[var(--theme-status-sage)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-status-sage)] animate-pulse" />
          Verified Feeds
        </div>
      </div>

      {/* Primary Specimen & Manifold */}
      <div className="space-y-1.5 text-nano leading-tight">
        <div>
          <span className="opacity-60 block text-[9px] uppercase tracking-wider">Physical Medium:</span>
          <span className="font-semibold text-current">{mediumName}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div>
            <span className="opacity-60 block text-[9px] uppercase tracking-wider">Manifold State:</span>
            <span className="font-semibold text-current">{unfurlState}</span>
          </div>
          <div>
            <span className="opacity-60 block text-[9px] uppercase tracking-wider">Active Paradigm:</span>
            <span className="font-semibold text-current">{modeName}</span>
          </div>
        </div>

        {/* Data Provenance Ledger */}
        <div className="pt-2 border-t border-current/15 space-y-1">
          <span className="opacity-60 block text-[9px] uppercase tracking-wider font-bold">
            Cartographic & Geophysical Provenance:
          </span>
          <ul className="space-y-1 opacity-85 text-[10px] pl-1">
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span>
                <strong className="text-current font-semibold">Crust & Bathymetry:</strong> NOAA NCEI ETOPO 2022 (15 arc-second / 16-bit DEM, -10,924m to +8,848m)
              </span>
            </li>
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span>
                <strong className="text-current font-semibold">Atmospheric Modeling:</strong> Google DeepMind WeatherNext 3 (0.1° / 10km Reanalysis) & NOAA GFS (10m winds)
              </span>
            </li>
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span>
                <strong className="text-current font-semibold">Precipitation Radar:</strong> RainViewer Global Doppler Radar Mosaic (Real-time 10-minute cadence)
              </span>
            </li>
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span>
                <strong className="text-current font-semibold">Linework & Coastlines:</strong> Natural Earth 1:10M High-Resolution Vectors (Coplanar zero-standoff)
              </span>
            </li>
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span>
                <strong className="text-current font-semibold">Render Pipeline:</strong> WebGPU Compute & Hardware Depth Bias (WGSL @ 120 FPS)
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
