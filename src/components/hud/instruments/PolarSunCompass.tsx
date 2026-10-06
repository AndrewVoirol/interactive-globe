// ============================================================================
// File: src/components/hud/instruments/PolarSunCompass.tsx
// 2D Polar Sun Compass: Interactive azimuthal & elevation solar dial
// Classic Eduard Imhof northwest lighting sweetspot (315° / 45°)
//
// Precision surveyor's instrument with:
//   - 144×144px machined dial with graduated bezel (5°/10°/30° ticks)
//   - Crosshair reticle with extending hair lines
//   - Azimuthal bearing vector line from center to crosshair
//   - Theme-adaptive ornaments (compass rose / protractor / sonar sweep)
//   - Imhof 315° detent marker on the bezel
//   - Tactile snap at 315° azimuth during drag
// ============================================================================

import React, { useRef, useCallback, useState } from 'react';

export interface PolarSunCompassProps {
  azimuth: number; // 0° to 360° (0 = North, 90 = East, 180 = South, 270 = West)
  altitude: number; // 10° (horizon) to 85° (zenith)
  onChange: (azimuth: number, altitude: number) => void;
  isLight?: boolean;
  theme?: 0 | 1 | 2;
  children?: React.ReactNode;
}

// SVG viewBox constants — 200×200 gives room for cardinals outside the bezel
const VB = 200;
const CX = VB / 2; // 100
const CY = VB / 2; // 100

// Radii in viewBox units
const BEZEL_OUTER = 82;   // Outer edge of machined bezel ring
const BEZEL_INNER = 78;   // Inner edge of machined bezel ring (3px visual width at scale)
const TICK_OUTER = BEZEL_INNER; // Ticks start at inner bezel edge
const TICK_MAJOR = 70;    // Major tick inner endpoint (30° intervals)
const TICK_MINOR = 73;    // Minor tick inner endpoint (10° intervals)
const TICK_HAIR = 75;     // Hairline tick inner endpoint (5° intervals)
const DIAL_RADIUS = 68;   // Usable dial face radius
const NUMERAL_R = 64;     // Degree numeral placement radius

// Altitude ring radii (center=85°, edge=10°, linear mapping over 75° range)
// Ring at altitude A°: r = ((85 - A) / 75) * DIAL_RADIUS
const altitudeRings = [20, 40, 60, 80].map((alt) => ({
  alt,
  r: ((85 - alt) / 75) * DIAL_RADIUS,
  opacity: alt >= 60 ? 0.2 : alt >= 40 ? 0.3 : 0.4,
}));

// Imhof sweetspot constants
const IMHOF_AZ = 315;
const IMHOF_ALT = 45;
const SNAP_THRESHOLD = 5; // ±5° snap zone

/** Convert compass bearing (0°=N, CW) to math angle (0°=E, CCW in SVG coords which are CW) */
const bearingToRad = (bearing: number) => ((bearing - 90) * Math.PI) / 180;

/** Generate SVG tick marks for the graduated bezel */
const generateBezelTicks = (theme: 0 | 1 | 2) => {
  const ticks: React.ReactNode[] = [];

  for (let deg = 0; deg < 360; deg += 5) {
    const rad = bearingToRad(deg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const isMajor = deg % 30 === 0;
    const isMinor = deg % 10 === 0;

    const innerR = isMajor ? TICK_MAJOR : isMinor ? TICK_MINOR : TICK_HAIR;
    const strokeW = isMajor ? 1.2 : isMinor ? 0.7 : 0.35;

    ticks.push(
      <line
        key={`tick-${deg}`}
        x1={CX + cos * innerR}
        y1={CY + sin * innerR}
        x2={CX + cos * TICK_OUTER}
        y2={CY + sin * TICK_OUTER}
        stroke="var(--theme-instrument-ink)"
        strokeWidth={strokeW}
        opacity={isMajor ? 0.85 : isMinor ? 0.55 : 0.3}
      />
    );
  }

  return ticks;
};

/** Generate cardinal degree numerals at 0/90/180/270 */
const generateNumerals = () => {
  const cardinals = [
    { deg: 0, label: '0' },
    { deg: 90, label: '90' },
    { deg: 180, label: '180' },
    { deg: 270, label: '270' },
  ];

  return cardinals.map(({ deg, label }) => {
    const rad = bearingToRad(deg);
    const x = CX + Math.cos(rad) * NUMERAL_R;
    const y = CY + Math.sin(rad) * NUMERAL_R;
    return (
      <text
        key={`num-${deg}`}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--theme-instrument-ink)"
        fontSize="7"
        fontFamily="var(--theme-font-telemetry, 'IBM Plex Mono', monospace)"
        fontWeight="600"
        opacity="0.65"
      >
        {label}
      </text>
    );
  });
};

/** Imhof sweetspot detent marker on the bezel */
const ImhofDetent = () => {
  const startRad = bearingToRad(IMHOF_AZ - 8);
  const endRad = bearingToRad(IMHOF_AZ + 8);
  const midR = (BEZEL_OUTER + BEZEL_INNER) / 2;

  const x1 = CX + Math.cos(startRad) * midR;
  const y1 = CY + Math.sin(startRad) * midR;
  const x2 = CX + Math.cos(endRad) * midR;
  const y2 = CY + Math.sin(endRad) * midR;

  return (
    <g opacity="0.9">
      {/* Highlighted arc segment at 315° */}
      <path
        d={`M ${x1} ${y1} A ${midR} ${midR} 0 0 1 ${x2} ${y2}`}
        stroke="var(--theme-text-accent)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Small diamond detent notch */}
      <polygon
        points={(() => {
          const rad = bearingToRad(IMHOF_AZ);
          const cx = CX + Math.cos(rad) * BEZEL_OUTER;
          const cy = CY + Math.sin(rad) * BEZEL_OUTER;
          const perpRad = rad + Math.PI / 2;
          const dx = Math.cos(perpRad) * 2.5;
          const dy = Math.sin(perpRad) * 2.5;
          const outX = CX + Math.cos(rad) * (BEZEL_OUTER + 4);
          const outY = CY + Math.sin(rad) * (BEZEL_OUTER + 4);
          return `${cx + dx},${cy + dy} ${outX},${outY} ${cx - dx},${cy - dy}`;
        })()}
        fill="var(--theme-text-accent)"
        opacity="0.7"
      />
    </g>
  );
};

/** Machined bezel ring — metallic gradient rim */
const BezelRing = ({ theme }: { theme: 0 | 1 | 2 }) => {
  const gradientId = `bezel-gradient-${theme}`;

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          {theme === 1 ? (
            // Cream: warm brass bezel
            <>
              <stop offset="0%" stopColor="#A08050" stopOpacity="0.9" />
              <stop offset="35%" stopColor="#C8A870" stopOpacity="1" />
              <stop offset="65%" stopColor="#8A6838" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#D4B880" stopOpacity="0.85" />
            </>
          ) : theme === 2 ? (
            // Cyanotype: cold steel bezel
            <>
              <stop offset="0%" stopColor="#4A6A88" stopOpacity="0.9" />
              <stop offset="35%" stopColor="#7094B8" stopOpacity="1" />
              <stop offset="65%" stopColor="#3A5570" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#6A90B0" stopOpacity="0.85" />
            </>
          ) : (
            // Tharp: dark gunmetal bezel
            <>
              <stop offset="0%" stopColor="#2A3A48" stopOpacity="0.9" />
              <stop offset="35%" stopColor="#4A6270" stopOpacity="1" />
              <stop offset="65%" stopColor="#1E2E3C" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#3A5060" stopOpacity="0.85" />
            </>
          )}
        </linearGradient>
      </defs>
      {/* Outer ring body */}
      <circle
        cx={CX}
        cy={CY}
        r={(BEZEL_OUTER + BEZEL_INNER) / 2}
        stroke={`url(#${gradientId})`}
        strokeWidth={BEZEL_OUTER - BEZEL_INNER}
        fill="none"
      />
      {/* Inner highlight edge */}
      <circle
        cx={CX}
        cy={CY}
        r={BEZEL_INNER}
        stroke="var(--theme-instrument-ink)"
        strokeWidth="0.5"
        fill="none"
        opacity="0.3"
      />
      {/* Outer shadow edge */}
      <circle
        cx={CX}
        cy={CY}
        r={BEZEL_OUTER}
        stroke="var(--theme-instrument-ink)"
        strokeWidth="0.5"
        fill="none"
        opacity="0.2"
      />
    </>
  );
};

/** Crosshair reticle SVG — center dot + extending hair lines + surrounding circle */
const CrosshairReticle = ({
  x,
  y,
  isDragging,
}: {
  x: number;
  y: number;
  isDragging: boolean;
}) => {
  const hairLen = 8;
  const circleR = 5;

  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: isDragging ? 'none' : 'transform 75ms ease-out',
      }}
    >
      {/* Surrounding circle */}
      <circle
        cx={CX}
        cy={CY}
        r={circleR}
        stroke="var(--theme-slider-thumb-bg)"
        strokeWidth="1.2"
        fill="none"
        opacity="0.9"
      />
      {/* Center dot */}
      <circle
        cx={CX}
        cy={CY}
        r="1.5"
        fill="var(--theme-slider-thumb-bg)"
      />
      {/* Hair lines — extending beyond the circle */}
      <line x1={CX - circleR - hairLen} y1={CY} x2={CX - circleR} y2={CY}
        stroke="var(--theme-slider-thumb-bg)" strokeWidth="0.8" opacity="0.8" />
      <line x1={CX + circleR} y1={CY} x2={CX + circleR + hairLen} y2={CY}
        stroke="var(--theme-slider-thumb-bg)" strokeWidth="0.8" opacity="0.8" />
      <line x1={CX} y1={CY - circleR - hairLen} x2={CX} y2={CY - circleR}
        stroke="var(--theme-slider-thumb-bg)" strokeWidth="0.8" opacity="0.8" />
      <line x1={CX} y1={CY + circleR} x2={CX} y2={CY + circleR + hairLen}
        stroke="var(--theme-slider-thumb-bg)" strokeWidth="0.8" opacity="0.8" />
    </g>
  );
};

/** Theme-specific interior ornaments — the character layer */
const ThemeOrnaments = ({
  theme,
  angleRad,
}: {
  theme: 0 | 1 | 2;
  angleRad: number;
}) => {
  if (theme === 1) {
    // Cream Rag Paper: Intaglio copper compass rose — 8-point star with fine detailing
    return (
      <g className="compass-rose-cream" opacity="0.45">
        {/* Primary 4-point star (N/S/E/W) */}
        <polygon points={`${CX},${CY - DIAL_RADIUS + 8} ${CX + 3},${CY - 10} ${CX},${CY} ${CX - 3},${CY - 10}`}
          fill="var(--theme-instrument-ink)" opacity="0.7" />
        <polygon points={`${CX},${CY + DIAL_RADIUS - 8} ${CX - 3},${CY + 10} ${CX},${CY} ${CX + 3},${CY + 10}`}
          fill="var(--theme-instrument-ink)" opacity="0.7" />
        <polygon points={`${CX + DIAL_RADIUS - 8},${CY} ${CX + 10},${CY + 3} ${CX},${CY} ${CX + 10},${CY - 3}`}
          fill="var(--theme-instrument-ink)" opacity="0.7" />
        <polygon points={`${CX - DIAL_RADIUS + 8},${CY} ${CX - 10},${CY - 3} ${CX},${CY} ${CX - 10},${CY + 3}`}
          fill="var(--theme-instrument-ink)" opacity="0.7" />

        {/* Secondary 4-point star (NE/SE/SW/NW) — shorter, thinner */}
        {[45, 135, 225, 315].map((deg) => {
          const rad = bearingToRad(deg);
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const perpCos = Math.cos(rad + Math.PI / 2);
          const perpSin = Math.sin(rad + Math.PI / 2);
          const tipR = DIAL_RADIUS - 18;
          const baseR = 8;
          return (
            <polygon
              key={`star-${deg}`}
              points={[
                `${CX + cos * tipR},${CY + sin * tipR}`,
                `${CX + perpCos * 2 + cos * baseR},${CY + perpSin * 2 + sin * baseR}`,
                `${CX},${CY}`,
                `${CX - perpCos * 2 + cos * baseR},${CY - perpSin * 2 + sin * baseR}`,
              ].join(' ')}
              fill="var(--theme-instrument-ink)"
              opacity="0.4"
            />
          );
        })}

        {/* Decorative inner ring with fleur detail */}
        <circle cx={CX} cy={CY} r="18" stroke="var(--theme-instrument-ink)" strokeWidth="0.5" fill="none" opacity="0.5" />
      </g>
    );
  }

  if (theme === 2) {
    // Prussian Cyanotype: Architectural CAD protractor — fine sub-degree divisions
    return (
      <g className="protractor-cyanotype" opacity="0.5">
        {/* Inner precision circle */}
        <circle cx={CX} cy={CY} r={DIAL_RADIUS - 10} stroke="var(--theme-instrument-ink)"
          strokeWidth="0.4" strokeDasharray="2 3" fill="none" />
        {/* 15-degree radial guide lines from center to inner tick radius */}
        {Array.from({ length: 24 }).map((_, i) => {
          const rad = bearingToRad(i * 15);
          return (
            <line
              key={`guide-${i}`}
              x1={CX + Math.cos(rad) * 12}
              y1={CY + Math.sin(rad) * 12}
              x2={CX + Math.cos(rad) * (DIAL_RADIUS - 6)}
              y2={CY + Math.sin(rad) * (DIAL_RADIUS - 6)}
              stroke="var(--theme-instrument-ink)"
              strokeWidth={i % 6 === 0 ? '0.6' : '0.25'}
              opacity={i % 6 === 0 ? 0.5 : 0.25}
            />
          );
        })}
        {/* Center precision crosshair dot */}
        <circle cx={CX} cy={CY} r="1.5" fill="var(--theme-instrument-ink)" opacity="0.6" />
      </g>
    );
  }

  // Marie Tharp: Acoustic sonar beam sweep with concentric sounding depth rings
  return (
    <g className="sonar-sweep-tharp" opacity="0.45">
      {/* Radial sounding vector from center to edge */}
      <line
        x1={CX}
        y1={CY}
        x2={CX + Math.cos(angleRad) * (DIAL_RADIUS - 4)}
        y2={CY + Math.sin(angleRad) * (DIAL_RADIUS - 4)}
        stroke="var(--theme-instrument-ink)"
        strokeWidth="1.0"
        opacity="0.7"
      />
      {/* Sonar sweep arc (±15° from bearing) */}
      <path
        d={(() => {
          const sweepAngle = 0.26; // ~15°
          const r = DIAL_RADIUS - 4;
          const x1 = CX + Math.cos(angleRad - sweepAngle) * r;
          const y1 = CY + Math.sin(angleRad - sweepAngle) * r;
          const x2 = CX + Math.cos(angleRad + sweepAngle) * r;
          const y2 = CY + Math.sin(angleRad + sweepAngle) * r;
          return `M ${CX} ${CY} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
        })()}
        fill="var(--theme-instrument-ink)"
        opacity="0.1"
      />
      {/* Ping emanation rings */}
      {[18, 32, 48].map((r, i) => (
        <circle
          key={`ping-${i}`}
          cx={CX}
          cy={CY}
          r={r}
          stroke="var(--theme-instrument-ink-secondary)"
          strokeWidth="0.6"
          strokeDasharray={i === 0 ? '1 2' : '2 3'}
          fill="none"
          opacity={0.35 - i * 0.08}
        />
      ))}
    </g>
  );
};


// =============================================================================
// Main Component
// =============================================================================

export const PolarSunCompass: React.FC<PolarSunCompassProps> = ({
  azimuth,
  altitude,
  onChange,
  isLight = false,
  theme = isLight ? 1 : 0,
  children,
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [isGrabbed, setIsGrabbed] = useState(false);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const maxR = Math.max(10, rect.width / 2 - 10);

      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxR);
      const angleRad = Math.atan2(dy, dx);
      let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
      if (angleDeg < 0) angleDeg += 360;
      if (angleDeg >= 360) angleDeg = 0;

      // Subtle snap detent at Imhof 315°
      if (Math.abs(angleDeg - IMHOF_AZ) <= SNAP_THRESHOLD) {
        angleDeg = IMHOF_AZ;
      }

      // Distance maps to altitude: center = 85° (high sun), edge = 10° (grazing light)
      const altDeg = Math.round(85 - (dist / maxR) * 75);
      const clampedAlt = Math.max(10, Math.min(85, altDeg));

      // Snap altitude to Imhof sweetspot if azimuth is also at sweetspot
      const finalAlt =
        angleDeg === IMHOF_AZ && Math.abs(clampedAlt - IMHOF_ALT) <= 5
          ? IMHOF_ALT
          : clampedAlt;

      onChange(angleDeg, finalAlt);
    },
    [onChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    setIsGrabbed(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    setIsGrabbed(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was lost
    }
  };

  // Convert current (azimuth, altitude) back to SVG viewBox coordinates
  const angleRad = bearingToRad(azimuth);
  const normDist = Math.max(0, Math.min(1, (85 - altitude) / 75));
  const reticleDist = normDist * DIAL_RADIUS;
  const reticleX = Math.cos(angleRad) * reticleDist;
  const reticleY = Math.sin(angleRad) * reticleDist;

  // Sweetspot detection for header indicator
  const isSweetspot = Math.abs(azimuth - IMHOF_AZ) <= 10 && Math.abs(altitude - IMHOF_ALT) <= 8;

  // Sun vector line endpoint (from center to reticle position, but extended slightly)
  const vectorEndX = CX + Math.cos(angleRad) * (reticleDist > 4 ? reticleDist - 4 : 0);
  const vectorEndY = CY + Math.sin(angleRad) * (reticleDist > 4 ? reticleDist - 4 : 0);

  return (
    <div
      data-instrument="polar-sun-compass"
      className="p-2.5 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] space-y-2"
    >
      {/* Header: Title + Live Readout */}
      <div className="flex items-center justify-between text-micro mb-1.5 font-mono">
        <span className="font-bold uppercase tracking-wider text-micro flex items-center gap-1.5 text-[var(--theme-text-accent)]">
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
          <span className="text-[var(--theme-text-secondary)]">Sun Altitude:</span>
          <span className="font-bold tabular-nums text-[var(--theme-text-primary)]">{Math.round(altitude)}°</span>
        </div>
      </div>

      {/* Interactive Dial Viewport — 144×144px with cardinal labels outside */}
      <div className="flex items-center justify-center py-1">
        <div className="relative" style={{ width: 172, height: 172 }}>
          {/* Cardinal direction labels — outside the bezel ring */}
          <span className="absolute left-1/2 -translate-x-1/2 top-0 text-micro font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]" style={{ letterSpacing: '0.08em' }}>N</span>
          <span className="absolute top-1/2 -translate-y-1/2 right-0 text-micro font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]" style={{ letterSpacing: '0.08em' }}>E</span>
          <span className="absolute left-1/2 -translate-x-1/2 bottom-0 text-micro font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]" style={{ letterSpacing: '0.08em' }}>S</span>
          <span className="absolute top-1/2 -translate-y-1/2 left-0 text-micro font-cartouche font-bold pointer-events-none text-[var(--theme-text-secondary)]" style={{ letterSpacing: '0.08em' }}>W</span>

          {/* The dial itself — centered inside the label frame */}
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
            className={`absolute inset-[14px] rounded-full cursor-crosshair select-none touch-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none`}
            style={{
              boxShadow: 'inset 0 2px 6px var(--theme-panel-shadow)',
            }}
          >
            {/* Full SVG dial face */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${VB} ${VB}`}
              style={{ borderRadius: '50%', overflow: 'hidden' }}
            >
              {/* Dial face background */}
              <defs>
                <radialGradient id="dial-bg-gradient">
                  <stop offset="0%" stopColor="var(--theme-instrument-viewport-bg-center)" />
                  <stop offset="100%" stopColor="var(--theme-instrument-viewport-bg)" />
                </radialGradient>
              </defs>
              <circle cx={CX} cy={CY} r={BEZEL_INNER} fill="url(#dial-bg-gradient)" />

              {/* Concentric altitude rings — unlabeled, decreasing opacity */}
              {altitudeRings.map(({ alt, r, opacity }) => (
                <circle
                  key={`alt-ring-${alt}`}
                  cx={CX}
                  cy={CY}
                  r={r}
                  stroke="var(--theme-instrument-viewport-border)"
                  strokeWidth="0.5"
                  fill="none"
                  opacity={opacity}
                />
              ))}

              {/* Cardinal axis crosshair lines */}
              <line x1={CX} y1={CY - DIAL_RADIUS + 4} x2={CX} y2={CY + DIAL_RADIUS - 4}
                stroke="var(--theme-instrument-viewport-border)" strokeWidth="0.4" opacity="0.35" />
              <line x1={CX - DIAL_RADIUS + 4} y1={CY} x2={CX + DIAL_RADIUS - 4} y2={CY}
                stroke="var(--theme-instrument-viewport-border)" strokeWidth="0.4" opacity="0.35" />

              {/* Theme-specific ornaments — the character layer */}
              <ThemeOrnaments theme={theme} angleRad={angleRad} />

              {/* Azimuthal bearing vector line — from center toward reticle */}
              {reticleDist > 4 && (
                <line
                  x1={CX}
                  y1={CY}
                  x2={vectorEndX}
                  y2={vectorEndY}
                  stroke="var(--theme-slider-thumb-bg)"
                  strokeWidth="1.0"
                  opacity="0.55"
                  strokeLinecap="round"
                />
              )}

              {/* Machined bezel ring */}
              <BezelRing theme={theme} />

              {/* Graduated tick marks */}
              {generateBezelTicks(theme)}

              {/* Cardinal degree numerals */}
              {generateNumerals()}

              {/* Imhof 315° detent marker */}
              <ImhofDetent />

              {/* Crosshair reticle — the draggable sun position */}
              <CrosshairReticle
                x={reticleX}
                y={reticleY}
                isDragging={isDraggingRef.current}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Footer: Sweetspot reference + Reset */}
      <div className="flex items-center justify-between text-nano font-mono mt-1 px-1 opacity-75">
        <span>NW Relief (315° • 45°)</span>
        <button
          type="button"
          onClick={() => onChange(315, 45)}
          className="inline-flex items-center justify-center min-h-[22px] px-1.5 py-0.5 -my-0.5 -mr-1 rounded-[1px] font-bold hover:underline text-[var(--theme-text-accent)] cursor-pointer"
        >
          Reset
        </button>
      </div>

      {children}
    </div>
  );
};
