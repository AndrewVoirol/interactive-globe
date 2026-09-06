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
}

export const PolarSunCompass: React.FC<PolarSunCompassProps> = ({
  azimuth,
  altitude,
  onChange,
  isLight = false,
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

  return (
    <div
      className={`p-2 rounded-xl border transition-all ${
        isLight ? 'bg-zinc-50 border-zinc-200 shadow-sm' : 'bg-white/[0.02] border-white/10'
      }`}
    >
      <div className="flex items-center justify-between text-[9px] mb-1.5">
        <span className="font-bold flex items-center gap-1.5 text-amber-500 dark:text-amber-400">
          <span
            className={`w-1.5 h-1.5 rounded-full bg-amber-400 ${
              isSweetspot ? 'shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse' : ''
            }`}
          ></span>
          Sun Compass
        </span>
        <div className="flex items-center gap-1 font-mono text-[8px]">
          <span className="text-zinc-400">Sun Azimuth:</span>
          <span className="font-bold text-amber-500 dark:text-amber-300 tabular-nums">{Math.round(azimuth)}°</span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400">Sun Alt:</span>
          <span className="font-bold text-amber-500 dark:text-amber-300 tabular-nums">{Math.round(altitude)}°</span>
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
          className={`relative w-24 h-24 rounded-full border flex items-center justify-center cursor-crosshair select-none touch-none ${
            isLight
              ? 'bg-zinc-100 border-zinc-300'
              : 'bg-black/40 border-white/20'
          }`}
          style={{
            background: isLight
              ? 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.06) 100%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 70%, transparent 100%)',
          }}
        >
          {/* Concentric Altitude Rings (45° and 70°) */}
          <div
            className={`absolute w-16 h-16 rounded-full border pointer-events-none ${
              isLight ? 'border-zinc-300/80' : 'border-white/10'
            }`}
          ></div>
          <div
            className={`absolute w-8 h-8 rounded-full border pointer-events-none ${
              isLight ? 'border-zinc-300/80' : 'border-white/10'
            }`}
          ></div>

          {/* Cardinal Axes */}
          <div
            className={`absolute w-full h-[1px] pointer-events-none ${
              isLight ? 'bg-zinc-300' : 'bg-white/15'
            }`}
          ></div>
          <div
            className={`absolute h-full w-[1px] pointer-events-none ${
              isLight ? 'bg-zinc-300' : 'bg-white/15'
            }`}
          ></div>

          {/* Cardinal Directions */}
          <span className="absolute top-0.5 text-[7px] text-zinc-400 font-bold pointer-events-none">N</span>
          <span className="absolute right-1 text-[7px] text-zinc-400 font-bold pointer-events-none">E</span>
          <span className="absolute bottom-0.5 text-[7px] text-zinc-400 font-bold pointer-events-none">S</span>
          <span className="absolute left-1 text-[7px] text-zinc-400 font-bold pointer-events-none">W</span>

          {/* NW Imhof Sweetspot Notch (315° / 45°) */}
          <div
            className="absolute -top-0.5 -left-0.5 w-2 h-2 border-t-2 border-l-2 border-amber-400 pointer-events-none opacity-80"
            title="Swiss Relief NW Light Angle"
          ></div>

          {/* Draggable Sun Reticle */}
          <div
            className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full bg-amber-400 border border-black shadow-[0_0_8px_rgba(251,191,36,0.9)] pointer-events-none transition-transform duration-75"
            style={{
              transform: `translate(${reticleX}px, ${reticleY}px)`,
            }}
          ></div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[7px] text-zinc-500 font-mono mt-1 px-1">
        <span>IMHOF NW SWEETSPOT (315° / 45°)</span>
        <button
          onClick={() => onChange(315, 45)}
          className="text-amber-500 hover:text-amber-400 font-bold"
        >
          [RESET]
        </button>
      </div>
    </div>
  );
};
