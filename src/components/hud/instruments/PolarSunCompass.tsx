// ============================================================================
// File: src/components/hud/instruments/PolarSunCompass.tsx
// 2D Polar Sun Compass: Interactive azimuthal & elevation solar dial
// Classic Eduard Imhof northwest lighting sweetspot (315° / 45°)
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface PolarSunCompassProps {
  azimuth: number; // 0° to 360° (0 = North, 90 = East, 180 = South, 270 = West)
  altitude: number; // 10° (horizon) to 85° (zenith)
  onChange: (azimuth: number, altitude: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
}

export const PolarSunCompass: React.FC<PolarSunCompassProps> = ({
  azimuth,
  altitude,
  onChange,
  isLight = false,
  theme = isLight ? 1 : 0,
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const maxR = Math.max(10, rect.width / 2 - 6);

      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxR);
      const angleRad = Math.atan2(dy, dx);
      let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
      if (angleDeg < 0) angleDeg += 360;
      if (angleDeg >= 360) angleDeg = 0;

      // Distance maps to altitude: center = 85° (high sun), edge = 10° (grazing light)
      const altDeg = Math.round(85 - (dist / maxR) * 75);
      const clampedAlt = Math.max(10, Math.min(85, altDeg));

      onChange(angleDeg, clampedAlt);
    },
    [onChange]
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
      // Ignore if pointer capture was lost
    }
  };

  // Convert current (azimuth, altitude) back to (x, y) relative to dial center
  const angleRad = ((azimuth - 90) * Math.PI) / 180;
  // Altitude 85 = 0px radius; Altitude 10 = maxR
  const dialRadius = 38; // half of 76px interior
  const normDist = Math.max(0, Math.min(1, (85 - altitude) / 75));
  const reticleDist = normDist * dialRadius;
  const reticleX = Math.cos(angleRad) * reticleDist;
  const reticleY = Math.sin(angleRad) * reticleDist;

  const isSweetspot = Math.abs(azimuth - 315) <= 10 && Math.abs(altitude - 45) <= 8;

  const tokens = theme === 2
    ? {
        dialBg: 'radial-gradient(circle, #18293d 0%, #0d1724 100%)',
        dialBorder: 'border-[#3b597a]',
        ringBorder: 'border-[#3b597a]/40',
        axisColor: 'bg-[#3b597a]/50',
      }
    : theme === 1
    ? {
        dialBg: 'radial-gradient(circle, #fdfcf9 0%, #ece4d2 100%)',
        dialBorder: 'border-[#b8ad98]',
        ringBorder: 'border-[#b8ad98]/50',
        axisColor: 'bg-[#b8ad98]/60',
      }
    : {
        dialBg: 'radial-gradient(circle, #1a2633 0%, #0c1219 100%)',
        dialBorder: 'border-[#3a4d61]',
        ringBorder: 'border-[#3a4d61]/40',
        axisColor: 'bg-[#3a4d61]/50',
      };

  return (
    <div className="p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]">
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <span className="font-bold flex items-center gap-1.5 text-[var(--theme-text-accent)]">
          <span
            className={`w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] ${
              isSweetspot ? 'shadow-sm animate-pulse' : ''
            }`}
          ></span>
          Sun Compass
        </span>
        <div className="flex items-center gap-1 font-mono text-nano">
          <span className="text-[var(--theme-text-secondary)]">Sun Azimuth:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">{Math.round(azimuth)}°</span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--theme-text-secondary)]">Sun Alt:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">{Math.round(altitude)}°</span>
        </div>
      </div>

      {/* Interactive Dial Viewport */}
      <div className="flex items-center justify-center py-1">
        <div
          ref={dialRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={() => onChange(315, 45)}
          title="Drag reticle to position sun vector (Double-click to reset to Imhof 315° / 45°)"
          className={`relative w-24 h-24 rounded-full border flex items-center justify-center cursor-crosshair select-none touch-none shadow-inner ${tokens.dialBorder}`}
          style={{
            background: tokens.dialBg,
          }}
        >
          {/* Concentric Altitude Rings (45° and 70°) */}
          <div
            className={`absolute w-16 h-16 rounded-full border pointer-events-none ${tokens.ringBorder}`}
          ></div>
          <div
            className={`absolute w-8 h-8 rounded-full border pointer-events-none ${tokens.ringBorder}`}
          ></div>

          {/* Cardinal Axes */}
          <div
            className={`absolute w-full h-[1px] pointer-events-none ${tokens.axisColor}`}
          ></div>
          <div
            className={`absolute h-full w-[1px] pointer-events-none ${tokens.axisColor}`}
          ></div>

          {/* Cardinal Directions */}
          <span className="absolute top-0.5 text-nano font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]">N</span>
          <span className="absolute right-1 text-nano font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]">E</span>
          <span className="absolute bottom-0.5 text-nano font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]">S</span>
          <span className="absolute left-1 text-nano font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]">W</span>

          {/* NW Imhof Sweetspot Notch (315° / 45°) */}
          <div
            className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 border-t-2 border-l-2 border-[#c5a059] pointer-events-none opacity-90"
            title="Swiss Relief NW Light Angle (315° / 45°)"
          ></div>

          {/* Draggable Brass Sun Reticle */}
          <div
            className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full bg-[#c5a059] border border-[#7c6230] shadow-[0_1px_4px_rgba(0,0,0,0.5)] pointer-events-none transition-transform duration-75"
            style={{
              transform: `translate(${reticleX}px, ${reticleY}px)`,
            }}
          ></div>
        </div>
      </div>

      <div className="flex items-center justify-between text-nano font-mono mt-1 px-1 opacity-75">
        <span>IMHOF NW SWEETSPOT (315° / 45°)</span>
        <button
          onClick={() => onChange(315, 45)}
          className="font-bold hover:underline text-[var(--theme-text-accent)]"
        >
          [RESET]
        </button>
      </div>
    </div>
  );
};
