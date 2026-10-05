// ============================================================================
// File: src/components/hud/CuratorsColophon.tsx
// Curator's Colophon / Sheet Cartouche
// Provides unambiguous cartographic data provenance and technical datum references.
// ============================================================================

import React from 'react';

export interface CuratorsColophonProps {
  theme: 0 | 1 | 2;
  isWeatherActive?: boolean;
  isRadarActive?: boolean;
  className?: string;
}

export const CuratorsColophon: React.FC<CuratorsColophonProps> = ({
  theme,
  isWeatherActive = false,
  isRadarActive = false,
  className = '',
}) => {
  const activeBadgeStyle = 'bg-[var(--theme-status-sage-15)] text-[var(--theme-status-sage)]';

  return (
    <div
      data-testid="curators-colophon"
      className={`rounded-[3px] border p-2.5 font-mono text-nano transition-all shadow-sm select-none bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-secondary)] font-telemetry ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-1.5 mb-2 border-current/20">
        <span className="font-bold tracking-wider uppercase text-micro text-current">
          Curator's Colophon
        </span>
      </div>

      {/* Data Provenance Ledger */}
      <div className="space-y-1.5 text-nano leading-tight">
        <span className="opacity-70 block text-nano uppercase tracking-wider font-medium">
          Provenance
        </span>
        <ul className="space-y-1 opacity-85 text-nano pl-0.5 leading-snug">
          <li className="flex items-start gap-1">
            <span className="opacity-50 select-none">•</span>
            <span>
              <strong className="text-current font-semibold">Crust & Bathymetry:</strong> NOAA ETOPO 2022 (15″ DEM)
            </span>
          </li>
          <li className="flex items-start gap-1">
            <span className="opacity-50 select-none">•</span>
            <span className="flex-1">
              <strong className="text-current font-semibold">Atmospheric Modeling:</strong> WeatherNext 3 (0.1°) & NOAA GFS (10 m winds)
              {isWeatherActive && (
                <span
                  data-testid="colophon-badge-weathernext"
                  className={`ml-1.5 px-1.5 py-0.5 rounded-[2px] text-nano font-mono font-bold tracking-wider uppercase align-middle inline-block ${activeBadgeStyle}`}
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
                  className={`ml-1.5 px-1.5 py-0.5 rounded-[2px] text-nano font-mono font-bold tracking-wider uppercase align-middle inline-block ${activeBadgeStyle}`}
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
  );
};
