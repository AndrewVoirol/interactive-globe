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
  theme?: 0 | 1 | 2;
}

export const HypsometricReliefCurve: React.FC<HypsometricReliefCurveProps> = ({
  displacementScale,
  peakExponent,
  onDisplacementChange,
  onPeakExponentChange,
  isLight = false,
  theme = isLight ? 1 : 0,
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
  const normY = Math.max(0.05, Math.min(0.95, 1 - displacementScale / 0.25));
  const normX = Math.max(0.05, Math.min(0.95, (peakExponent - 0.5) / 2.5));

  const peakY = normY * 100;
  const peakX = normX * 300;

  const strokePath = `M 0 96 Q ${peakX} ${peakY} 300 96`;
  const fillPath = `M 0 100 L 0 96 Q ${peakX} ${peakY} 300 96 L 300 100 Z`;

  const tokens = theme === 2
    ? {
        cardBg: 'bg-[#101c2b]/95 border-[#263c54] text-[#e8edf2]',
        mountainBg: 'bg-[#0d1724]',
        mountainBorder: 'border-[#3b597a]/60',
        gradStops: ['#0e1824', '#4f79a3', '#e8edf2'],
        strokeColor: '#e8edf2',
        textColor: 'text-[#8ea4bd]',
        accent: 'text-[#c5a059]',
        valColor: 'text-[#e8edf2]',
      }
    : theme === 1
    ? {
        cardBg: 'bg-[#f8f3e8]/95 border-[#d8cfbc] text-[#2b241a]',
        mountainBg: 'bg-[#f4ede0]',
        mountainBorder: 'border-[#b8ad98]/60',
        gradStops: ['#9e6d50', '#cfb588', '#fdfcf9'],
        strokeColor: '#8c4820',
        textColor: 'text-[#7d715d]',
        accent: 'text-[#8c4820]',
        valColor: 'text-[#2b241a]',
      }
    : {
        cardBg: 'bg-[#0f161f]/95 border-[#333e4d] text-[#f0ede6]',
        mountainBg: 'bg-[#0c1219]',
        mountainBorder: 'border-[#3a4d61]/60',
        gradStops: ['#0f171f', '#23778a', '#cbb692'],
        strokeColor: '#38bdf8',
        textColor: 'text-[#a2998a]',
        accent: 'text-[#c5a059]',
        valColor: 'text-[#f0ede6]',
      };

  return (
    <div className={`p-2 rounded-[3px] border shadow-sm transition-all ${tokens.cardBg}`}>
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono-draft">
        <span className={`font-bold flex items-center gap-1.5 ${tokens.accent}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse"></span>
          Hypsometric Relief
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className={tokens.textColor}>3D Relief:</span>
          <span className={`font-bold tabular-nums ${tokens.valColor}`}>
            {displacementScale.toFixed(2)}x
          </span>
          <span className="opacity-40">•</span>
          <span className={tokens.textColor}>Peak Sharp:</span>
          <span className={`font-bold tabular-nums ${tokens.valColor}`}>
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
        className={`relative w-full h-20 rounded-[2px] border overflow-hidden cursor-crosshair select-none touch-none shadow-inner ${tokens.mountainBg} ${tokens.mountainBorder}`}
      >
        <svg className="w-full h-full pointer-events-none" viewBox="0 0 300 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`reliefGrad-${theme}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={tokens.gradStops[0]} stopOpacity="0.3" />
              <stop offset="60%" stopColor={tokens.gradStops[1]} stopOpacity="0.5" />
              <stop offset="100%" stopColor={tokens.gradStops[2]} stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill={`url(#reliefGrad-${theme})`} />
          <path d={strokePath} fill="none" stroke={tokens.strokeColor} strokeWidth="2.0" strokeLinecap="round" />
          <circle
            cx={peakX}
            cy={peakY}
            r="4.5"
            fill="#fdfcf9"
            stroke="#c5a059"
            strokeWidth="2"
            className="shadow-sm"
          />
        </svg>

        {/* Labels */}
        <div className={`absolute top-1 left-1.5 text-[7px] font-mono-draft pointer-events-none opacity-80 ${tokens.textColor}`}>
          PEAK AMPLITUDE (0.25x)
        </div>
        <div className={`absolute bottom-1 left-1.5 text-[7px] font-mono-draft pointer-events-none opacity-80 ${tokens.textColor}`}>
          SEA LEVEL BASELINE (0m)
        </div>
        <div className={`absolute bottom-1 right-1.5 text-[7px] font-mono-draft pointer-events-none font-bold ${tokens.accent}`}>
          ARÊTE SHARPNESS ◄►
        </div>
      </div>

      <div className="flex items-center justify-between text-[7px] font-mono-draft mt-1 px-1 opacity-75">
        <span>DRAG SUMMIT VERTICALLY / HORIZONTALLY</span>
        <button
          onClick={() => {
            onDisplacementChange(theme === 1 ? 0.14 : (theme === 2 ? 0.11 : 0.12));
            onPeakExponentChange(theme === 1 ? 1.6 : (theme === 2 ? 1.4 : 1.3));
          }}
          className={`font-bold hover:underline ${tokens.accent}`}
        >
          [PRESET]
        </button>
      </div>
    </div>
  );
};
