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
          tabIndex={0}
          role="slider"
          aria-label="Solar Azimuth and Altitude Reticle"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={azimuth}
          onKeyDown={(e) => {
            const azStep = e.shiftKey ? 15 : 5;
            const altStep = e.shiftKey ? 10 : 2;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              onChange((azimuth + azStep) % 360, altitude);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onChange((azimuth - azStep + 360) % 360, altitude);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(azimuth, Math.min(90, altitude + altStep));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(azimuth, Math.max(5, altitude - altStep));
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={() => onChange(315, 45)}
          title="Drag reticle to position sun vector (Double-click to reset to Imhof 315° / 45°, Arrow keys to nudge)"
          className={`relative w-24 h-24 rounded-full border flex items-center justify-center cursor-crosshair select-none touch-none shadow-inner transition-all duration-200 hover:shadow-[0_0_12px_var(--theme-focus-ring)] hover:border-[var(--theme-card-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${tokens.dialBorder}`}
          style={{
            background: tokens.dialBg,
          }}
        >
          {/* Medium-Adaptive Era-Specific Dial Artifacts */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            {theme === 1 ? (
              // Cream Rag Paper: Intaglio copper compass rose & Roman cardinal markers
              <g className="compass-rose-cream text-[#8c4820] opacity-60">
                <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1 2" />
                <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="0.5" />
                {/* 8-point compass star */}
                <polygon points="50,14 52,42 50,50 48,42" fill="currentColor" opacity="0.8" />
                <polygon points="50,86 48,58 50,50 52,58" fill="currentColor" opacity="0.8" />
                <polygon points="86,50 58,52 50,50 58,48" fill="currentColor" opacity="0.8" />
                <polygon points="14,50 42,48 50,50 42,52" fill="currentColor" opacity="0.8" />
                <polygon points="75,25 54,46 50,50 52,44" fill="currentColor" opacity="0.5" />
                <polygon points="25,75 46,54 50,50 44,56" fill="currentColor" opacity="0.5" />
                <polygon points="75,75 54,54 50,50 56,52" fill="currentColor" opacity="0.5" />
                <polygon points="25,25 46,46 50,50 44,48" fill="currentColor" opacity="0.5" />
                {/* NW 315° Imhof solar notch target */}
                <circle cx="28" cy="28" r="4" stroke="#c5a059" strokeWidth="1" strokeDasharray="1.5 1.5" fill="none" opacity="0.9" />
              </g>
            ) : theme === 2 ? (
              // Prussian Cyanotype: Architectural CAD protractor with 5° division ticks
              <g className="protractor-cyanotype text-[#4fa3e3] opacity-60">
                <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="0.75" />
                <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
                {/* 5-degree and 15-degree division graduation ticks */}
                {Array.from({ length: 24 }).map((_, i) => {
                  const rad = (i * 15 * Math.PI) / 180;
                  const x1 = 50 + Math.cos(rad) * 42;
                  const y1 = 50 + Math.sin(rad) * 42;
                  const x2 = 50 + Math.cos(rad) * 46;
                  const y2 = 50 + Math.sin(rad) * 46;
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={i % 2 === 0 ? "1" : "0.5"} />;
                })}
                {/* Coordinate crosshair ticks */}
                <circle cx="50" cy="50" r="1.5" fill="currentColor" />
              </g>
            ) : (
              // Marie Tharp: Acoustic sonar beam sweep with concentric sounding depth rings
              <g className="sonar-sweep-tharp text-[#34d399] opacity-50">
                <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" />
                <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="0.75" />
                <circle cx="50" cy="50" r="16" stroke="currentColor" strokeWidth="0.75" />
                {/* Radial sounding vectors */}
                <line x1="50" y1="50" x2={50 + Math.cos(angleRad) * 44} y2={50 + Math.sin(angleRad) * 44} stroke="#00e5ff" strokeWidth="1.2" opacity="0.85" />
                <path d={`M 50 50 L ${50 + Math.cos(angleRad - 0.25) * 44} ${50 + Math.sin(angleRad - 0.25) * 44} A 44 44 0 0 1 ${50 + Math.cos(angleRad + 0.25) * 44} ${50 + Math.sin(angleRad + 0.25) * 44} Z`} fill="#00e5ff" opacity="0.12" />
              </g>
            )}
          </svg>

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
