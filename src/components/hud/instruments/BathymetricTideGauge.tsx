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
}

export const BathymetricTideGauge: React.FC<BathymetricTideGaugeProps> = ({
  seaLevelOffset,
  waterClarity,
  onSeaLevelChange,
  onWaterClarityChange,
  isLight = false,
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

  // Convert seaLevelOffset (-150 to +100) to height percentage (0% to 100%)
  const waterPct = Math.max(0, Math.min(100, ((seaLevelOffset + 150) / 250) * 100));

  return (
    <div
      className={`p-2 rounded-xl border transition-all ${
        isLight ? 'bg-zinc-50 border-zinc-200 shadow-sm' : 'bg-white/[0.02] border-white/10'
      }`}
    >
      <div className="flex items-center justify-between text-[9px] mb-1.5">
        <span className="font-bold flex items-center gap-1.5 text-cyan-500 dark:text-cyan-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          Bathymetric Tide Gauge
        </span>
        <div className="flex items-center gap-1 font-mono text-[8px]">
          <span className="text-zinc-400">Sea Level:</span>
          <span className="font-bold text-cyan-500 dark:text-cyan-300 tabular-nums">
            {seaLevelOffset > 0 ? `+${seaLevelOffset}m` : `${seaLevelOffset}m`}
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400">Clarity:</span>
          <span className="font-bold text-sky-500 dark:text-sky-300 tabular-nums">
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
        className={`relative w-full h-20 rounded border overflow-hidden cursor-ns-resize select-none touch-none ${
          isLight ? 'bg-zinc-100/90 border-zinc-300' : 'bg-zinc-950/80 border-white/15'
        }`}
      >
        {/* Continental Shelf Silhouette in background */}
        <div className="absolute inset-0 flex items-end opacity-20 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
            <polygon points="0,100 0,35 60,40 120,60 180,90 300,95 300,100" fill="#64748B" />
          </svg>
        </div>

        {/* Dynamic Water Volume */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-cyan-500/30 border-t-2 border-cyan-400 pointer-events-none transition-none"
          style={{ height: `${waterPct}%` }}
        >
          <div
            className="w-full h-full bg-gradient-to-b from-cyan-400/25 to-blue-950/90"
            style={{ opacity: 0.2 + waterClarity * 0.6 }}
          ></div>
        </div>

        {/* Sea Level Caliper Reticle Line */}
        <div
          className="absolute left-0 right-0 h-0.5 bg-cyan-300 pointer-events-none shadow-[0_0_8px_rgba(6,182,212,0.9)]"
          style={{ bottom: `${waterPct}%` }}
        >
          <div className="absolute right-1.5 -top-2.5 px-1 py-0.2 rounded bg-cyan-950/90 border border-cyan-400/80 text-cyan-200 text-[7px] font-mono font-bold">
            ◄ CALIPER ►
          </div>
        </div>

        {/* Reference Geological Markers */}
        <div className={`absolute left-1.5 top-1 text-[7px] font-mono pointer-events-none ${
          isLight ? 'text-zinc-600 font-semibold' : 'text-zinc-400'
        }`}>
          +100m (Flood)
        </div>
        <div className={`absolute left-1.5 top-[40%] text-[7px] font-mono font-bold pointer-events-none ${
          isLight ? 'text-cyan-800' : 'text-cyan-400'
        }`}>
          0m (Present)
        </div>
        <div className={`absolute left-1.5 bottom-1 text-[7px] font-mono pointer-events-none ${
          isLight ? 'text-zinc-600 font-semibold' : 'text-zinc-500'
        }`}>
          -150m (Ice Age LGM)
        </div>
      </div>

      {/* Optical Water Clarity Absorption Slider */}
      <div className="flex items-center justify-between text-[8px] text-zinc-400 mt-1.5 px-0.5">
        <span className={`font-bold flex items-center gap-1 ${isLight ? 'text-sky-800' : 'text-sky-400'}`}>
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
            className="w-24 accent-cyan-400 cursor-pointer h-1 rounded"
          />
          <span className="w-8 text-right font-mono font-bold text-sky-400">
            {Math.round(waterClarity * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
