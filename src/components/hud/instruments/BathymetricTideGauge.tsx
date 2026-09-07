// ============================================================================
// File: src/components/hud/instruments/BathymetricTideGauge.tsx
// Hydrostatic Bathymetric Tide Gauge
// Direct interactive control of Sea Level Offset and Beer-Lambert Water Clarity
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface BathymetricTideGaugeProps {
  seaLevelOffset: number; // -150m (LGM Ice Age) to +100m (Marine Transgression)
  waterClarity: number; // 0.10 to 1.00 (Beer-Lambert optical depth penetration)
  onSeaLevelChange: (offset: number) => void;
  onWaterClarityChange: (clarity: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
}

export const BathymetricTideGauge: React.FC<BathymetricTideGaugeProps> = ({
  seaLevelOffset,
  waterClarity,
  onSeaLevelChange,
  onWaterClarityChange,
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
        cardBg: 'bg-[#101c2b]/95 border-[#263c54] text-[#e8edf2]',
        boxBg: 'bg-[#0d1724] border-[#3b597a]/60',
        waterBorder: 'border-[#4f79a3]',
        waterGrad: 'from-[#4f79a3]/30 to-[#0e1824]/90',
        caliperLine: 'bg-[#c5a059]',
        caliperBadge: 'bg-[#0e1824] border-[#c5a059] text-[#c5a059]',
        textColor: 'text-[#8ea4bd]',
        accent: 'text-[#c5a059]',
        valColor: 'text-[#e8edf2]',
      }
    : theme === 1
    ? {
        cardBg: 'bg-[#f8f3e8]/95 border-[#d8cfbc] text-[#2b241a]',
        boxBg: 'bg-[#f4ede0] border-[#b8ad98]/60',
        waterBorder: 'border-[#77998b]',
        waterGrad: 'from-[#77998b]/35 to-[#263b52]/80',
        caliperLine: 'bg-[#8c4820]',
        caliperBadge: 'bg-[#fdfcf9] border-[#8c4820] text-[#8c4820]',
        textColor: 'text-[#7d715d]',
        accent: 'text-[#8c4820]',
        valColor: 'text-[#2b241a]',
      }
    : {
        cardBg: 'bg-[#0f161f]/95 border-[#333e4d] text-[#f0ede6]',
        boxBg: 'bg-[#0c1219] border-[#3a4d61]/60',
        waterBorder: 'border-[#00e5ff]',
        waterGrad: 'from-[#00e5ff]/25 to-[#0b141f]/90',
        caliperLine: 'bg-[#00e5ff]',
        caliperBadge: 'bg-[#0a111a] border-[#00e5ff] text-[#00e5ff]',
        textColor: 'text-[#a2998a]',
        accent: 'text-[#c5a059]',
        valColor: 'text-[#f0ede6]',
      };

  return (
    <div className={`p-2 rounded-[3px] border shadow-sm transition-all ${tokens.cardBg}`}>
      <div className="flex items-center justify-between text-[9px] mb-1.5 font-mono-draft">
        <span className={`font-bold flex items-center gap-1.5 ${tokens.accent}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#c5a059] animate-pulse"></span>
          Bathymetric Tide Gauge
        </span>
        <div className="flex items-center gap-1 font-mono text-[8px]">
          <span className={tokens.textColor}>Sea Level:</span>
          <span className={`font-bold tabular-nums ${tokens.valColor}`}>
            {seaLevelOffset > 0 ? `+${seaLevelOffset}m` : `${seaLevelOffset}m`}
          </span>
          <span className="opacity-40">•</span>
          <span className={tokens.textColor}>Clarity:</span>
          <span className={`font-bold tabular-nums ${tokens.valColor}`}>
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
        className={`relative w-full h-20 rounded-[2px] border overflow-hidden cursor-ns-resize select-none touch-none shadow-inner ${tokens.boxBg}`}
      >
        {/* Continental Shelf Silhouette in background */}
        <div className="absolute inset-0 flex items-end opacity-15 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
            <polygon points="0,100 0,35 60,40 120,60 180,90 300,95 300,100" fill="currentColor" />
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
          <div className={`absolute right-1.5 -top-2.5 px-1 py-0.2 rounded-[2px] border font-mono-draft font-bold text-[7px] ${tokens.caliperBadge}`}>
            ◄ CALIPER ►
          </div>
        </div>

        {/* Reference Geological Markers */}
        <div className={`absolute left-1.5 top-1 text-[7px] font-mono-draft pointer-events-none opacity-80 ${tokens.textColor}`}>
          +100m (Flood)
        </div>
        <div className={`absolute left-1.5 top-[40%] text-[7px] font-mono-draft font-bold pointer-events-none ${tokens.accent}`}>
          0m (Datum MLLW)
        </div>
        <div className={`absolute left-1.5 bottom-1 text-[7px] font-mono-draft pointer-events-none opacity-80 ${tokens.textColor}`}>
          -150m (Ice Age LGM)
        </div>
      </div>

      {/* Optical Water Clarity Absorption Slider with .slider-archival */}
      <div className="flex items-center justify-between text-[8px] font-mono-draft mt-1.5 px-0.5">
        <span className={`font-bold flex items-center gap-1 ${tokens.accent}`}>
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
          <span className={`w-8 text-right font-mono font-bold tabular-nums ${tokens.valColor}`}>
            {Math.round(waterClarity * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
