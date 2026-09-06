// ============================================================================
// File: src/components/hud/instruments/HypsometricReliefCurve.tsx
// 2D Hypsometric Mountain Elevation Curve
// Direct interactive control of 3D Relief Amplitude and Peak Sharpness
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface HypsometricReliefCurveProps {
  displacementScale: number; // 0.00 to 0.25 (3D Relief extrusion height)
  peakExponent: number; // 0.5 to 3.0 (Hypsometric sharpness curve)
  onDisplacementChange: (scale: number) => void;
  onPeakExponentChange: (exponent: number) => void;
  isLight?: boolean;
}

export const HypsometricReliefCurve: React.FC<HypsometricReliefCurveProps> = ({
  displacementScale,
  peakExponent,
  onDisplacementChange,
  onPeakExponentChange,
  isLight = false,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      const normX = Math.max(0.08, Math.min(0.92, (clientX - rect.left) / rect.width));
      const normY = Math.max(0.08, Math.min(0.92, (clientY - rect.top) / rect.height));

      // Y maps to displacementScale: top is 0.25x, bottom is 0.00x
      const newScale = parseFloat(((1 - normY) * 0.25).toFixed(2));
      // X maps to peakExponent: left is 0.5x, right is 3.0x
      const newExponent = parseFloat((0.5 + normX * 2.5).toFixed(1));

      onDisplacementChange(Math.max(0.0, Math.min(0.25, newScale)));
      onPeakExponentChange(Math.max(0.5, Math.min(3.0, newExponent)));
    },
    [onDisplacementChange, onPeakExponentChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // SVG dimensions: 300 x 100
  // Peak coordinates derived from displacementScale (0.00 -> 0.25) and peakExponent (0.5 -> 3.0)
  const normY = Math.max(0.05, Math.min(0.95, 1 - displacementScale / 0.25));
  const normX = Math.max(0.05, Math.min(0.95, (peakExponent - 0.5) / 2.5));

  const peakY = normY * 100;
  const peakX = normX * 300;

  // Bezier curve for mountain profile
  const strokePath = `M 0 96 Q ${peakX} ${peakY} 300 96`;
  const fillPath = `M 0 100 L 0 96 Q ${peakX} ${peakY} 300 96 L 300 100 Z`;

  return (
    <div
      className={`p-2 rounded-xl border transition-all ${
        isLight ? 'bg-zinc-50 border-zinc-200 shadow-sm' : 'bg-white/[0.02] border-white/10'
      }`}
    >
      <div className="flex items-center justify-between text-[9px] mb-1.5">
        <span className="font-bold flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Hypsometric Relief
        </span>
        <div className="flex items-center gap-1 font-mono text-[8px]">
          <span className="text-zinc-400">3D Relief:</span>
          <span className="font-bold text-emerald-500 dark:text-emerald-300 tabular-nums">
            {displacementScale.toFixed(2)}x
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400">Peak Sharp:</span>
          <span className="font-bold text-teal-500 dark:text-teal-300 tabular-nums">
            {peakExponent.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Interactive Mountain Cross-Section */}
      <div
        ref={boxRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Drag peak summit vertically (amplitude) and horizontally (peak sharpness)"
        className={`relative w-full h-20 rounded border overflow-hidden cursor-crosshair select-none touch-none ${
          isLight ? 'bg-zinc-100/90 border-zinc-300' : 'bg-zinc-950/80 border-white/15'
        }`}
      >
        <svg className="w-full h-full pointer-events-none" viewBox="0 0 300 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="reliefGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.2" />
              <stop offset="60%" stopColor="#10B981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#34D399" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill="url(#reliefGrad)" />
          <path d={strokePath} fill="none" stroke="#34D399" strokeWidth="2.5" />
          <circle
            cx={peakX}
            cy={peakY}
            r="4.5"
            fill="#FFFFFF"
            stroke="#059669"
            strokeWidth="2"
            className="shadow-sm"
          />
        </svg>

        {/* Labels */}
        <div className="absolute top-1 left-1.5 text-[7px] font-mono text-emerald-400/80 pointer-events-none">
          PEAK AMPLITUDE (0.25x)
        </div>
        <div className="absolute bottom-1 left-1.5 text-[7px] font-mono text-zinc-500 pointer-events-none">
          SEA LEVEL BASELINE (0m)
        </div>
        <div className="absolute bottom-1 right-1.5 text-[7px] font-mono text-teal-400/80 pointer-events-none">
          ARÊTE SHARPNESS ◄►
        </div>
      </div>

      <div className="flex items-center justify-between text-[7px] text-zinc-500 font-mono mt-1 px-1">
        <span>DRAG SUMMIT VERTICALLY / HORIZONTALLY</span>
        <button
          onClick={() => {
            onDisplacementChange(0.14);
            onPeakExponentChange(1.4);
          }}
          className="text-emerald-500 hover:text-emerald-400 font-bold"
        >
          [DEFAULT 0.14x / 1.4x]
        </button>
      </div>
    </div>
  );
};
