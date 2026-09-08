// ============================================================================
// File: src/components/hud/instruments/BathymetricTideGauge.tsx
// Hydrostatic Bathymetric Tide Gauge
// Direct interactive control of Sea Level Offset and Beer-Lambert Water Clarity
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface BathymetricTideGaugeProps {
  seaLevelOffset?: number; // -150m (LGM Ice Age) to +100m (Marine Transgression)
  waterClarity?: number; // 0.10 to 1.00 (Beer-Lambert optical depth penetration)
  onSeaLevelChange?: (offset: number) => void;
  onWaterClarityChange?: (clarity: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
}

export const BathymetricTideGauge: React.FC<BathymetricTideGaugeProps> = ({
  seaLevelOffset = 0,
  waterClarity = 0.75,
  onSeaLevelChange = () => {},
  onWaterClarityChange = () => {},
  isLight = false,
  theme = isLight ? 1 : 0,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateFromPointer = useCallback(
    (clientY: number) => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      const normY = Math.max(0.04, Math.min(0.96, (clientY - rect.top) / rect.height));
      const bottomPct = (1 - normY) * 100;

      // Range: -150m to +100m (250m span)
      // Step: 5m
      const rawMeters = -150 + (bottomPct / 100) * 250;
      const steppedMeters = Math.round(rawMeters / 5) * 5;
      const clampedMeters = Math.max(-150, Math.min(100, steppedMeters));

      onSeaLevelChange(clampedMeters);
    },
    [onSeaLevelChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const waterPct = Math.max(0, Math.min(100, ((seaLevelOffset + 150) / 250) * 100));

  const tokens = theme === 2
    ? {
        boxBg: 'bg-[#0d1724] border-[#3b597a]/60',
        waterBorder: 'border-[#4f79a3]',
        waterGrad: 'from-[#4f79a3]/30 to-[#0e1824]/90',
        caliperLine: 'bg-[#c5a059]',
        caliperBadge: 'bg-[#0e1824] border-[#c5a059] text-[#c5a059]',
      }
    : theme === 1
    ? {
        boxBg: 'bg-[#f4ede0] border-[#b8ad98]/60',
        waterBorder: 'border-[#77998b]',
        waterGrad: 'from-[#77998b]/35 to-[#263b52]/80',
        caliperLine: 'bg-[#8c4820]',
        caliperBadge: 'bg-[#fdfcf9] border-[#8c4820] text-[#8c4820]',
      }
    : {
        boxBg: 'bg-[#0c1219] border-[#3a4d61]/60',
        waterBorder: 'border-[#00e5ff]',
        waterGrad: 'from-[#00e5ff]/25 to-[#0b141f]/90',
        caliperLine: 'bg-[#00e5ff]',
        caliperBadge: 'bg-[#0a111a] border-[#00e5ff] text-[#00e5ff]',
      };

  return (
    <div className="p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]">
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <span className="font-bold flex items-center gap-1.5 text-[var(--theme-text-accent)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse"></span>
          Bathymetric Tide Gauge
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className="text-[var(--theme-text-secondary)]">Sea Level:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {seaLevelOffset > 0 ? `+${seaLevelOffset}m` : `${seaLevelOffset}m`}
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Clarity:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {Math.round(waterClarity * 100)}%
          </span>
        </div>
      </div>

      {/* Interactive Water Column Depth Gauge */}
      <div
        ref={boxRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => onSeaLevelChange(0)}
        title="Drag waterline caliper vertically to raise/lower sea level (Double-click to reset to 0m)"
        className={`relative w-full h-20 rounded-[2px] border overflow-hidden cursor-ns-resize select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] ${tokens.boxBg}`}
      >
        {/* Continental Shelf Silhouette in background */}
        <div className="absolute inset-0 flex items-end opacity-15 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
            <polygon points="0,100 0,35 60,40 120,60 180,90 300,95 300,100" fill="currentColor" />
          </svg>
        </div>

        {/* Medium-Adaptive Hydrostatic Markings */}
        <div className="absolute top-0 bottom-0 right-14 w-8 pointer-events-none z-10 opacity-70">
          <svg className="w-full h-full" viewBox="0 0 40 100" preserveAspectRatio="none">
            {theme === 1 ? (
              // Cream Rag Paper: Archival hydrographic tide benchmark staff with decimeter blocks
              <g className="tide-staff-cream text-[#8c4820]">
                <rect x="15" y="0" width="8" height="100" fill="none" stroke="currentColor" strokeWidth="0.75" />
                {Array.from({ length: 10 }).map((_, i) => (
                  <g key={i}>
                    {i % 2 === 0 && <rect x="15" y={i * 10} width="8" height="10" fill="currentColor" opacity="0.6" />}
                    <line x1="12" y1={i * 10} x2="26" y2={i * 10} stroke="currentColor" strokeWidth="0.5" />
                  </g>
                ))}
              </g>
            ) : theme === 2 ? (
              // Prussian Cyanotype: Hydrostatic manometer glass tube with millimeter calibration ticks
              <g className="manometer-cyanotype text-[#4fa3e3]">
                <rect x="16" y="2" width="6" height="96" rx="3" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.8" />
                {Array.from({ length: 20 }).map((_, i) => (
                  <line
                    key={i}
                    x1="22"
                    y1={5 + i * 4.6}
                    x2={i % 5 === 0 ? "30" : "26"}
                    y2={5 + i * 4.6}
                    stroke="currentColor"
                    strokeWidth={i % 5 === 0 ? "0.8" : "0.4"}
                  />
                ))}
              </g>
            ) : (
              // Marie Tharp: CTD oceanographic bathymetric pressure column with dbar calibrations
              <g className="ctd-column-tharp text-[#00e5ff]">
                <line x1="20" y1="0" x2="20" y2="100" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1 3" />
                {[0, 25, 50, 75, 100].map((y, i) => (
                  <g key={i}>
                    <line x1="14" y1={y} x2="26" y2={y} stroke="currentColor" strokeWidth="0.75" />
                    <circle cx="20" cy={y} r="1.5" fill="currentColor" />
                  </g>
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* Dynamic Water Volume */}
        <div
          className={`absolute bottom-0 left-0 right-0 border-t-2 pointer-events-none transition-none ${tokens.waterBorder}`}
          style={{ height: `${waterPct}%` }}
        >
          <div
            className={`w-full h-full bg-gradient-to-b ${tokens.waterGrad}`}
            style={{ opacity: 0.3 + waterClarity * 0.7 }}
          ></div>
        </div>

        {/* Sea Level Caliper Reticle Line */}
        <div
          className={`absolute left-0 right-0 h-0.5 pointer-events-none ${tokens.caliperLine} shadow-[0_1px_4px_rgba(0,0,0,0.4)]`}
          style={{ bottom: `${waterPct}%` }}
        >
          <div className={`absolute right-1.5 -top-2.5 px-1 py-0.2 rounded-[2px] border font-mono font-bold text-nano ${tokens.caliperBadge}`}>
            ◄ CALIPER ►
          </div>
        </div>

        {/* Reference Geological Markers */}
        <div className="absolute left-1.5 top-1 text-nano font-mono pointer-events-none opacity-80 text-[var(--theme-text-secondary)]">
          +100m (Flood)
        </div>
        <div className="absolute left-1.5 top-[40%] text-nano font-mono font-bold pointer-events-none text-[var(--theme-text-accent)]">
          0m (Datum MLLW)
        </div>
        <div className="absolute left-1.5 bottom-1 text-nano font-mono pointer-events-none opacity-80 text-[var(--theme-text-secondary)]">
          -150m (Ice Age LGM)
        </div>
      </div>

      {/* Optical Water Clarity Absorption Slider with .slider-archival */}
      <div className="flex items-center justify-between text-nano font-mono mt-1.5 px-0.5">
        <span className="font-bold flex items-center gap-1 text-[var(--theme-text-accent)]">
          Beer-Lambert Clarity:
        </span>
        <div className="flex items-center gap-2">
          <input
            id="tide-gauge-water-clarity"
            name="waterClarity"
            type="range"
            min="0.10"
            max="1.00"
            step="0.05"
            value={waterClarity}
            onChange={(e) => onWaterClarityChange(parseFloat(e.target.value))}
            className="w-24 slider-archival cursor-pointer"
          />
          <span className="w-8 text-right font-mono font-bold text-nano tabular-nums text-[var(--theme-text-primary)]">
            {Math.round(waterClarity * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
