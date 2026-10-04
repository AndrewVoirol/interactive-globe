// ============================================================================
// File: src/components/hud/instruments/HypsometricReliefCurve.tsx
// 2D Hypsometric Mountain Elevation Curve
// Direct interactive control of 3D Relief Amplitude and Peak Sharpness
// ============================================================================

import React, { useRef, useCallback, useMemo } from 'react';

export interface HypsometricReliefCurveProps {
  displacementScale?: number; // 0.00 to 0.25 (3D Relief extrusion height)
  peakExponent?: number; // 0.5 to 3.0 (Hypsometric sharpness curve)
  onDisplacementChange?: (scale: number) => void;
  onPeakExponentChange?: (exponent: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
  children?: React.ReactNode;
}

export const HypsometricReliefCurve: React.FC<HypsometricReliefCurveProps> = ({
  displacementScale = 0.055,
  peakExponent = 1.4,
  onDisplacementChange = () => {},
  onPeakExponentChange = () => {},
  isLight = false,
  theme = isLight ? 1 : 0,
  children,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const defaultDisplacement = theme === 1 ? 0.14 : theme === 2 ? 0.11 : 0.12;
  const defaultPeakExponent = theme === 1 ? 1.6 : theme === 2 ? 1.4 : 1.3;

  const handleReset = useCallback(() => {
    onDisplacementChange(defaultDisplacement);
    onPeakExponentChange(defaultPeakExponent);
  }, [defaultDisplacement, defaultPeakExponent, onDisplacementChange, onPeakExponentChange]);

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
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic or unsupported
    }
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

  // SVG coordinate geometry: 300 x 100 coordinate space
  // Baseline datum at y=74 leaves a dedicated 26px sub-baseline stratum for collision-free axis markers
  const { strokePath, fillPath, hachures, peakX, peakY, yBase } = useMemo(() => {
    const baselineY = 74;
    const ceilingY = 14;

    const normY = Math.max(0.0, Math.min(1.0, 1 - displacementScale / 0.25));
    const normX = Math.max(0.0, Math.min(1.0, (peakExponent - 0.5) / 2.5));

    const py = ceilingY + normY * (baselineY - ceilingY);
    const px = 20 + normX * 260;

    const numSteps = 24;
    const pts: [number, number][] = [];
    for (let i = 0; i <= numSteps; i++) {
      const x = (i / numSteps) * px;
      const u = (px - x) / Math.max(1, px);
      const t = Math.cos(u * Math.PI * 0.5);
      const y = baselineY - (baselineY - py) * Math.pow(t, peakExponent);
      pts.push([x, y]);
    }
    for (let i = 1; i <= numSteps; i++) {
      const x = px + (i / numSteps) * (300 - px);
      const u = (x - px) / Math.max(1, 300 - px);
      const t = Math.cos(u * Math.PI * 0.5);
      const y = baselineY - (baselineY - py) * Math.pow(t, peakExponent);
      pts.push([x, y]);
    }

    const stroke = 'M ' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
    const fill =
      `M 0 100 L 0 ${baselineY.toFixed(1)} ` +
      pts.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
      ` L 300 ${baselineY.toFixed(1)} L 300 100 Z`;

    // Theme 1 intaglio alpine hachures: anchored strictly to the mountain surface
    const hachureLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const hx = 20 + i * 15;
      const u = hx <= px ? (px - hx) / Math.max(1, px) : (hx - px) / Math.max(1, 300 - px);
      const clampedU = Math.max(0, Math.min(1, u));
      const t = Math.cos(clampedU * Math.PI * 0.5);
      const hy = baselineY - (baselineY - py) * Math.pow(t, peakExponent);
      if (hy < baselineY - 1) {
        const distToPeak = Math.abs(hx - px);
        const hLen = Math.min(baselineY - hy, 4 + (1 - distToPeak / 150) * 8);
        hachureLines.push({ x1: hx, y1: hy, x2: hx, y2: hy + hLen });
      }
    }

    return {
      strokePath: stroke,
      fillPath: fill,
      hachures: hachureLines,
      peakX: px,
      peakY: py,
      yBase: baselineY,
    };
  }, [displacementScale, peakExponent]);

  const tokens = theme === 2
    ? {
        mountainBg: 'bg-[#0d1724]',
        mountainBorder: 'border-[#3b597a]/60',
        gradStops: ['#0e1824', '#4f79a3', '#e8edf2'],
        strokeColor: '#e8edf2',
        datumColor: '#4fa3e3',
      }
    : theme === 1
    ? {
        mountainBg: 'bg-[#f4ede0]',
        mountainBorder: 'border-[#b8ad98]/60',
        gradStops: ['#9e6d50', '#cfb588', '#fdfcf9'],
        strokeColor: '#8c4820',
        datumColor: '#8c4820',
      }
    : {
        mountainBg: 'bg-[#0c1219]',
        mountainBorder: 'border-[#3a4d61]/60',
        gradStops: ['#0f171f', '#23778a', '#cbb692'],
        strokeColor: '#38bdf8',
        datumColor: '#38bdf8',
      };

  return (
    <div
      data-instrument="hypsometric-relief"
      className="p-2.5 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] space-y-2"
    >
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <span className="font-bold uppercase tracking-wider text-micro flex items-center gap-1.5 text-[var(--theme-text-accent)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)]"></span>
          Hypsometric Relief
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className="text-[var(--theme-text-secondary)]">3D Relief:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {displacementScale.toFixed(2)}×
          </span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Peak Sharpness:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">
            {peakExponent.toFixed(1)}×
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
        aria-valuetext={`3D Relief ${displacementScale.toFixed(2)}×, Peak Sharpness ${peakExponent.toFixed(1)}×`}
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
          } else if (e.key === 'Home') {
            e.preventDefault();
            onDisplacementChange(0.0);
          } else if (e.key === 'End') {
            e.preventDefault();
            onDisplacementChange(0.25);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            handleReset();
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleReset}
        title="Drag peak summit vertically (3D Relief) and horizontally (Peak Sharpness) — Double-click or Enter to reset, Arrow keys to nudge"
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

          {/* Cartographic Zero-Elevation Datum Baseline */}
          <line
            x1="0"
            y1={yBase}
            x2="300"
            y2={yBase}
            stroke={tokens.datumColor}
            strokeWidth="0.75"
            strokeDasharray="2 3"
            opacity="0.4"
          />

          {/* Sub-baseline Lithospheric Bedrock Stratum */}
          <rect
            x="0"
            y={yBase}
            width="300"
            height={100 - yBase}
            fill={tokens.datumColor}
            fillOpacity="0.05"
          />

          {/* Medium-Adaptive Scientific Profile Graphics */}
          {theme === 1 ? (
            // Cream Rag Paper: Swiss alpine ridge hachure engraving lines
            <g className="hachures-cream opacity-40 stroke-[#8c4820]" strokeWidth="0.75" strokeLinecap="round">
              {hachures.map((h, i) => (
                <line key={i} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} />
              ))}
            </g>
          ) : theme === 2 ? (
            // Prussian Cyanotype: CAD parabolic coordinate grid & millimeter ticks
            <g className="cad-grid-cyanotype opacity-30 stroke-[#4fa3e3]" strokeWidth="0.5">
              <line x1="0" y1="20" x2="300" y2="20" strokeDasharray="2 4" />
              <line x1="0" y1="40" x2="300" y2="40" strokeDasharray="2 4" />
              <line x1="0" y1="60" x2="300" y2="60" strokeDasharray="2 4" />
              <line x1="0" y1={yBase} x2="300" y2={yBase} strokeDasharray="2 4" />
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
            stroke={theme === 2 ? '#a5d5ff' : theme === 1 ? '#8c4820' : 'var(--theme-text-accent)'}
            strokeWidth="2"
            className="shadow-sm"
          />
        </svg>

        {/* Viewport Scale & Datum Markers */}
        <div
          className={`absolute top-1.5 left-2 text-nano font-mono text-[var(--theme-text-secondary)] pointer-events-none select-none transition-opacity duration-150 ${
            displacementScale >= 0.22 && peakExponent <= 0.8 ? 'opacity-40' : 'opacity-80'
          }`}
        >
          Max 3D Relief (0.25×)
        </div>
        <div className="absolute inset-x-2 bottom-1.5 flex items-center justify-between pointer-events-none text-nano font-mono select-none">
          <span className="opacity-80 text-[var(--theme-text-secondary)] tracking-tight">
            Baseline (0.00×)
          </span>
          <span className="font-bold text-[var(--theme-text-accent)] tracking-tight opacity-85">
            Peak Sharpness
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-nano font-mono mt-1 px-1 opacity-75">
        <span>Drag summit vertically / horizontally</span>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center justify-center min-h-[22px] px-1.5 py-0.5 -my-0.5 -mr-1 rounded-[1px] font-bold hover:underline text-[var(--theme-text-accent)] cursor-pointer"
        >
          Reset
        </button>
      </div>

      {children}
    </div>
  );
};
