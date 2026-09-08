// ============================================================================
// File: src/components/hud/instruments/HypsometricReliefCurve.tsx
// 2D Hypsometric Mountain Elevation Curve
// Direct interactive control of 3D Relief Amplitude and Peak Sharpness
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface HypsometricReliefCurveProps {
  displacementScale?: number; // 0.00 to 0.25 (3D Relief extrusion height)
  peakExponent?: number; // 0.5 to 3.0 (Hypsometric sharpness curve)
  onDisplacementChange?: (scale: number) => void;
  onPeakExponentChange?: (exponent: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
}

export const HypsometricReliefCurve: React.FC<HypsometricReliefCurveProps> = ({
  displacementScale = 0.08,
  peakExponent = 1.4,
  onDisplacementChange = () => {},
  onPeakExponentChange = () => {},
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
        mountainBg: 'bg-[#0d1724]',
        mountainBorder: 'border-[#3b597a]/60',
        gradStops: ['#0e1824', '#4f79a3', '#e8edf2'],
        strokeColor: '#e8edf2',
      }
    : theme === 1
    ? {
        mountainBg: 'bg-[#f4ede0]',
        mountainBorder: 'border-[#b8ad98]/60',
        gradStops: ['#9e6d50', '#cfb588', '#fdfcf9'],
        strokeColor: '#8c4820',
      }
    : {
        mountainBg: 'bg-[#0c1219]',
        mountainBorder: 'border-[#3a4d61]/60',
        gradStops: ['#0f171f', '#23778a', '#cbb692'],
        strokeColor: '#38bdf8',
      };

  return (
    <div className="p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]">
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono-draft">
        <span className="font-bold flex items-center gap-1.5 text-[var(--theme-text-accent)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse"></span>
          Hypsometric Relief
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className="text-[var(--theme-text-secondary)]">3D Relief:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {displacementScale.toFixed(2)}x
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Peak Sharp:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {peakExponent.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Interactive Mountain Cross-Section */}
      <div
        ref={boxRef}
        tabIndex={0}
        role="slider"
        aria-label="Hypsometric 3D Relief and Sharpness Curve"
        aria-valuemin={0}
        aria-valuemax={0.25}
        aria-valuenow={displacementScale}
        onKeyDown={(e) => {
          const dispStep = e.shiftKey ? 0.02 : 0.005;
          const sharpStep = e.shiftKey ? 0.2 : 0.05;
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onDisplacementChange(Math.min(0.25, displacementScale + dispStep));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onDisplacementChange(Math.max(0.00, displacementScale - dispStep));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            onPeakExponentChange(Math.min(3.0, peakExponent + sharpStep));
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onPeakExponentChange(Math.max(0.5, peakExponent - sharpStep));
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => {
          onDisplacementChange(0.08);
          onPeakExponentChange(1.4);
        }}
        title="Drag peak summit vertically (amplitude) and horizontally (peak sharpness) — Double-click to reset (0.08 / 1.4x), Arrow keys to nudge"
        className={`relative w-full h-20 rounded-[2px] border overflow-hidden cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${tokens.mountainBg} ${tokens.mountainBorder}`}
      >
        <svg className="w-full h-full pointer-events-none" viewBox="0 0 300 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`reliefGrad-${theme}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={tokens.gradStops[0]} stopOpacity="0.3" />
              <stop offset="60%" stopColor={tokens.gradStops[1]} stopOpacity="0.5" />
              <stop offset="100%" stopColor={tokens.gradStops[2]} stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {/* Medium-Adaptive Scientific Profile Graphics */}
          {theme === 1 ? (
            // Cream Rag Paper: Swiss alpine ridge hachure engraving lines
            <g className="hachures-cream opacity-40 stroke-[#8c4820]" strokeWidth="0.75" strokeLinecap="round">
              {Array.from({ length: 18 }).map((_, i) => {
                const hx = 20 + i * 15;
                const distToPeak = Math.abs(hx - peakX);
                const hy = peakY + (distToPeak / 150) * (96 - peakY);
                if (hy >= 94) return null;
                return (
                  <line
                    key={i}
                    x1={hx}
                    y1={hy}
                    x2={hx}
                    y2={Math.min(96, hy + 6 + (1 - distToPeak / 150) * 10)}
                  />
                );
              })}
            </g>
          ) : theme === 2 ? (
            // Prussian Cyanotype: CAD parabolic coordinate grid & millimeter ticks
            <g className="cad-grid-cyanotype opacity-30 stroke-[#4fa3e3]" strokeWidth="0.5">
              <line x1="0" y1="25" x2="300" y2="25" strokeDasharray="2 4" />
              <line x1="0" y1="50" x2="300" y2="50" strokeDasharray="2 4" />
              <line x1="0" y1="75" x2="300" y2="75" strokeDasharray="2 4" />
              {Array.from({ length: 11 }).map((_, i) => (
                <line key={i} x1={i * 30} y1="0" x2={i * 30} y2="100" strokeDasharray="2 4" />
              ))}
            </g>
          ) : (
            // Marie Tharp: Sonar fathometer acoustic trace with Mid-Atlantic axial rift valley profile
            <g className="fathometer-tharp opacity-40">
              {/* Axial rift valley acoustic trace */}
              <path
                d={`M ${Math.max(0, peakX - 25)} ${peakY + 12} L ${peakX} ${peakY + 4} L ${Math.min(300, peakX + 25)} ${peakY + 12}`}
                fill="none"
                stroke="#34d399"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <line x1={peakX} y1="0" x2={peakX} y2="100" stroke="#00e5ff" strokeWidth="0.5" strokeDasharray="1 4" opacity="0.6" />
            </g>
          )}

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
        <div className="absolute top-1 left-1.5 text-nano font-mono-draft pointer-events-none opacity-80 text-[var(--theme-text-secondary)]">
          PEAK AMPLITUDE (0.25x)
        </div>
        <div className="absolute bottom-1 left-1.5 text-nano font-mono-draft pointer-events-none opacity-80 text-[var(--theme-text-secondary)]">
          SEA LEVEL BASELINE (0m)
        </div>
        <div className="absolute bottom-1 right-1.5 text-nano font-mono-draft pointer-events-none font-bold text-[var(--theme-text-accent)]">
          ARÊTE SHARPNESS ◄►
        </div>
      </div>

      <div className="flex items-center justify-between text-nano font-mono-draft mt-1 px-1 opacity-75">
        <span>DRAG SUMMIT VERTICALLY / HORIZONTALLY</span>
        <button
          onClick={() => {
            onDisplacementChange(theme === 1 ? 0.14 : (theme === 2 ? 0.11 : 0.12));
            onPeakExponentChange(theme === 1 ? 1.6 : (theme === 2 ? 1.4 : 1.3));
          }}
          className="font-bold hover:underline text-[var(--theme-text-accent)]"
        >
          [RESET]
        </button>
      </div>
    </div>
  );
};
