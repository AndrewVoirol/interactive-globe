// ============================================================================
// File: src/components/hud/instruments/CurvatureUnfurlSextant.tsx
// Gaussian Curvature Unfurl Sextant
// Interactive 180° topological curvature arc measuring surface flattening (K > 0 to K = 0)
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SimulationMode } from '../../../types';

export interface CurvatureUnfurlSextantProps {
  alpha: number; // 0.000 (Sphere) to 1.000 (Map)
  onAlphaChange: (val: number) => void;
  onGlideToAlpha?: (target: number) => void;
  mode?: SimulationMode;
  theme?: 0 | 1 | 2;
  isLight?: boolean;
}

interface MilestoneStage {
  t: number;
  label: string;
  desc: string;
}

const MILESTONES_BY_MODE: Record<number, MilestoneStage[]> = {
  0: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Closed Riemannian sphere' },
    { t: 0.3, label: 'LINEAR DILATION', desc: 'Spheroidal metric interpolation' },
    { t: 0.7, label: 'PLANAR TRANSITION', desc: 'Coordinate transformation' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Equirectangular planar projection' },
  ],
  1: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Closed spherical cylinder' },
    { t: 0.3, label: 'SEAM DECOUPLING', desc: 'Antimeridian longitudinal cut' },
    { t: 0.7, label: 'CYLINDER UNROLL', desc: 'Circumferential unrolling' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Unrolled Mercator cylinder' },
  ],
  2: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Hoop stress accumulating along seam' },
    { t: 0.3, label: 'ANTIMERIDIAN RUPTURE', desc: 'Griffith LEFM crack opens at equator' },
    { t: 0.7, label: 'FLAP PEELING', desc: 'Elastic stress dissipation' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Unrolled planar fracture manifold' },
  ],
  3: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Viscous quiescence' },
    { t: 0.3, label: 'LIQUEFACTION', desc: 'Hydrodynamic viscosity collapse' },
    { t: 0.7, label: 'VORTEX ADVECTION', desc: 'Turbulent Lamb-Oseen flow' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Conformal planar equilibrium' },
  ],
  4: [
    { t: 0.0, label: 'ICOSA CODES', desc: '20 spherical equilateral faces' },
    { t: 0.4, label: 'HINGE ROTATION', desc: 'Facet decoupling along edges' },
    { t: 0.8, label: 'NET DEPLOYMENT', desc: 'Planar triangular deployment' },
    { t: 1.0, label: 'DYMAXION (K = 0)', desc: 'Fuller zero-distortion net' },
  ],
};

export const CurvatureUnfurlSextant: React.FC<CurvatureUnfurlSextantProps> = ({
  alpha,
  onAlphaChange,
  onGlideToAlpha,
  mode = 0,
  isLight = false,
  theme = isLight ? 1 : 0,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const lastClientXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const momentumRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
    };
  }, []);

  // Theme-aware mineral pigment tokens
  const sextantTokens = theme === 2
    ? {
        arcStroke: '#4f79a3',
        thumbFill: '#e8edf2',
        thumbStroke: '#4f79a3',
        activeTick: '#a5d5ff',
        inactiveTick: 'rgba(232, 237, 242, 0.25)',
        rayStroke: 'rgba(232, 237, 242, 0.08)',
      }
    : theme === 1
    ? {
        arcStroke: '#8c4820',
        thumbFill: '#fdfcf9',
        thumbStroke: '#8c4820',
        activeTick: '#8c4820',
        inactiveTick: 'rgba(43, 36, 26, 0.25)',
        rayStroke: 'rgba(43, 36, 26, 0.12)',
      }
    : {
        arcStroke: '#3b788a',
        thumbFill: '#f0ede6',
        thumbStroke: '#c5a059',
        activeTick: '#c5a059',
        inactiveTick: 'rgba(240, 237, 230, 0.25)',
        rayStroke: 'rgba(240, 237, 230, 0.08)',
      };

  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      const padPct = 15 / 240;
      const rawFrac = (clientX - rect.left) / rect.width;
      let normX = (rawFrac - padPct) / (1.0 - 2 * padPct);
      normX = Math.max(0.0, Math.min(1.0, normX));

      onAlphaChange(parseFloat(normX.toFixed(3)));
    },
    [onAlphaChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    lastClientXRef.current = e.clientX;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
    boxRef.current?.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const now = performance.now();
    const dt = now - lastTimeRef.current;
    if (dt > 4 && boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      const dx = (e.clientX - lastClientXRef.current) / (rect.width * (1.0 - 2 * (15 / 240)));
      velocityRef.current = dx / dt; // normalized fraction per ms
      lastClientXRef.current = e.clientX;
      lastTimeRef.current = now;
    }
    updateFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      boxRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    // If stationary before releasing, cancel coasting
    const now = performance.now();
    if (now - lastTimeRef.current > 50) {
      velocityRef.current = 0;
    }

    // Micro-momentum coasting (20-50ms inertia decay, strictly clamped to 2-5 alpha units)
    let vel = velocityRef.current;
    // Clamp velocity to enforce 2-5 alpha units (0.02 - 0.05) maximum overshoot
    vel = Math.max(-0.0015, Math.min(0.0015, vel));
    if (Math.abs(vel) > 0.0002) {
      let currentAlpha = alpha;
      const step = () => {
        vel *= 0.60; // rapid friction damping over 20-50ms (2-3 frames)
        if (Math.abs(vel) < 0.00008) {
          momentumRafRef.current = null;
          return;
        }
        currentAlpha = Math.max(0.0, Math.min(1.0, currentAlpha + vel * 16));
        onAlphaChange(parseFloat(currentAlpha.toFixed(3)));
        momentumRafRef.current = requestAnimationFrame(step);
      };
      momentumRafRef.current = requestAnimationFrame(step);
    }
  };

  // SVG dimensions: 240 x 36
  const peakY = 6 + alpha * 20;
  const pathD = `M 15 26 Q 120 ${peakY} 225 26`;

  const t = Math.max(0, Math.min(1, alpha));
  const thumbX = 15 + t * 210;
  const thumbY = (1 - t) * (1 - t) * 26 + 2 * (1 - t) * t * peakY + t * t * 26;

  const milestones = MILESTONES_BY_MODE[mode] || MILESTONES_BY_MODE[0];
  let currentMilestone = milestones[0];
  if (alpha >= 0.85) currentMilestone = milestones[3];
  else if (alpha >= 0.5) currentMilestone = milestones[2];
  else if (alpha >= 0.15) currentMilestone = milestones[1];

  return (
    <div className="flex flex-col items-center w-56 sm:w-64 select-none">
      {/* Interactive Sextant Arc Scrubber */}
      <div
        ref={boxRef}
        tabIndex={0}
        role="slider"
        aria-label="Topological Curvature Unfurl Sextant"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={parseFloat(alpha.toFixed(3))}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.05 : 0.01;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onAlphaChange(parseFloat(Math.max(0.0, alpha - step).toFixed(3)));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onAlphaChange(parseFloat(Math.min(1.0, alpha + step).toFixed(3)));
          } else if (e.key === 'Home') {
            e.preventDefault();
            onAlphaChange(0.0);
          } else if (e.key === 'End') {
            e.preventDefault();
            onAlphaChange(1.0);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onDoubleClick={() => onGlideToAlpha?.(alpha < 0.5 ? 1.0 : 0.0)}
        title="Drag vernier reticle along curvature arc (Double-click to toggle Globe/Map, Arrow keys to nudge)"
        className={`relative w-full h-9 rounded-[2px] border flex items-center justify-center cursor-pointer select-none touch-none shadow-inner bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${
          isHovered ? 'shadow-[0_0_12px_var(--theme-focus-ring)] border-[var(--theme-card-border-hover)]' : ''
        }`}
      >
        <svg className="w-full h-full pointer-events-none" viewBox="0 0 240 36">
          {/* Radial reference rays */}
          <line x1="120" y1="34" x2="15" y2="10" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="68" y2="6" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="120" y2="4" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="172" y2="6" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="225" y2="10" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />

          {/* Magnetic tick markers */}
          <circle cx="15" cy="26" r="2" fill={alpha < 0.15 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />
          <circle cx="78" cy="17" r="2" fill={alpha >= 0.15 && alpha < 0.5 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />
          <circle cx="162" cy="17" r="2" fill={alpha >= 0.5 && alpha < 0.85 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />
          <circle cx="225" cy="26" r="2" fill={alpha >= 0.85 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />

          {/* Curvature Unfurling Arc */}
          <path
            d={pathD}
            fill="none"
            stroke={sextantTokens.arcStroke}
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Reticle Thumb */}
          <circle
            cx={thumbX}
            cy={thumbY}
            r={isHovered ? 5.5 : 4.5}
            fill={sextantTokens.thumbFill}
            stroke={sextantTokens.thumbStroke}
            strokeWidth="2"
            className="shadow-sm transition-all duration-150"
          />
        </svg>

        {/* Milestone Tick Labels */}
        <div className="absolute top-1 left-2 text-nano font-mono font-bold pointer-events-none text-[var(--theme-text-accent)]">
          K &gt; 0
        </div>
        <div className="absolute top-1 right-2 text-nano font-mono font-bold pointer-events-none text-[var(--theme-text-accent)]">
          K = 0
        </div>
      </div>

      {/* Stage Telemetry Tag */}
      <div className="text-micro font-mono tracking-wider uppercase mt-0.5 w-full h-3.5 leading-tight text-center truncate">
        <span className="font-bold text-[var(--theme-text-accent)]">{currentMilestone.label}</span>
        <span className="opacity-70 text-[var(--theme-text-secondary)]"> • {currentMilestone.desc}</span>
      </div>
    </div>
  );
};
