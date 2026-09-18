// ============================================================================
// File: src/components/hud/CuratorsColophon.tsx
// Curator's Colophon / Sheet Cartouche
// Provides unambiguous cartographic data provenance and technical datum references.
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
}

export const CuratorsColophon: React.FC<CuratorsColophonProps> = ({
  theme,
  mode = 0,
  alpha = 0,
  isWeatherActive = false,
  isRadarActive = false,
  className = '',
}) => {
  const mediumName =
    theme === 1
      ? 'Cotton Rag (Swiss Relief)'
      : theme === 2
      ? 'Prussian Cyanotype (Blueprint)'
      : 'Marie Tharp (Physiographic)';

  const modeName =
    mode === 0
      ? 'Linear'
      : mode === 1
      ? 'Scroll'
      : mode === 2
      ? 'Fracture'
      : 'Fluid';

  const unfurlState =
    alpha < 0.02
      ? 'Spherical'
      : alpha > 0.98
      ? 'Planar'
      : `Morph (α = ${alpha.toFixed(3)})`;

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
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-1.5 mb-2 border-current/20">
        <span className="font-bold tracking-wider uppercase text-micro text-current">
          Curator's Colophon
        </span>
      </div>

      {/* Primary Specimen & Manifold */}
      <div className="space-y-1.5 text-nano leading-tight">
        <div>
          <span className="opacity-60 block text-micro uppercase tracking-wider">Medium:</span>
          <span className="font-semibold text-current">{mediumName}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div>
            <span className="opacity-60 block text-micro uppercase tracking-wider">State:</span>
            <span className="font-semibold text-current">{unfurlState}</span>
          </div>
          <div>
            <span className="opacity-60 block text-micro uppercase tracking-wider">Projection:</span>
            <span className="font-semibold text-current">{modeName}</span>
          </div>
        </div>

        {/* Data Provenance Ledger */}
        <div className="pt-2 border-t border-current/15 space-y-1">
          <span className="opacity-60 block text-micro uppercase tracking-wider font-bold">
            Provenance
          </span>
          <ul className="space-y-1 opacity-85 text-body pl-1">
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span>
                <strong className="text-current font-semibold">Crust & Bathymetry:</strong> NOAA ETOPO 2022 (15&quot; DEM)
              </span>
            </li>
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span className="flex-1">
                <strong className="text-current font-semibold">Atmospheric Modeling:</strong> WeatherNext 3 (0.1°) & NOAA GFS (10m winds)
                {isWeatherActive && (
                  <span
                    data-testid="colophon-badge-weathernext"
                    className="ml-1.5 px-1 py-0.2 rounded text-nano font-mono font-bold tracking-wider uppercase border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 align-middle inline-block"
                  >
                    [WEATHERNEXT: ACTIVE]
                  </span>
                )}
              </span>
            </li>
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span className="flex-1">
                <strong className="text-current font-semibold">Precipitation Radar:</strong> RainViewer Radar
                {isRadarActive && (
                  <span
                    data-testid="colophon-badge-radar"
                    className="ml-1.5 px-1 py-0.2 rounded text-nano font-mono font-bold tracking-wider uppercase border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 align-middle inline-block"
                  >
                    [RADAR: ACTIVE]
                  </span>
                )}
              </span>
            </li>
            <li className="flex items-start gap-1">
              <span className="opacity-50 select-none">•</span>
              <span>
                <strong className="text-current font-semibold">Linework:</strong> Natural Earth (1:10M)
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
