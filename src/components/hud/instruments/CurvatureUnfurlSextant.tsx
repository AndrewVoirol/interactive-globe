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
  onCancelGlide?: () => void;
  mode?: SimulationMode;
  theme?: 0 | 1 | 2;
  isLight?: boolean;
}

interface MilestoneStage {
  t: number;
  label: string;
  desc: string;
  sub: string;
}

const MILESTONES_BY_MODE: Record<number, MilestoneStage[]> = {
  0: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Closed Riemannian sphere', sub: 'Closed Riemannian sphere' },
    { t: 0.3, label: 'LINEAR DILATION', desc: 'Spheroidal metric interpolation', sub: 'Spheroidal metric interpolation' },
    { t: 0.7, label: 'PLANAR TRANSITION', desc: 'Coordinate transformation', sub: 'Coordinate transformation' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Equirectangular planar projection', sub: 'Equirectangular planar projection' },
  ],
  1: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Closed spherical cylinder', sub: 'Closed spherical cylinder' },
    { t: 0.3, label: 'SEAM DECOUPLING', desc: 'Antimeridian longitudinal cut', sub: 'Antimeridian longitudinal cut' },
    { t: 0.7, label: 'CYLINDER UNROLL', desc: 'Circumferential unrolling', sub: 'Circumferential unrolling' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Unrolled Mercator cylinder', sub: 'Unrolled Mercator cylinder' },
  ],
  2: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Hoop stress accumulating along seam', sub: 'Hoop stress accumulating along seam' },
    { t: 0.3, label: 'ANTIMERIDIAN RUPTURE', desc: 'Griffith LEFM crack opens at equator', sub: 'Griffith LEFM crack opens at equator' },
    { t: 0.7, label: 'FLAP PEELING', desc: 'Elastic stress dissipation', sub: 'Elastic stress dissipation' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Unrolled planar fracture manifold', sub: 'Unrolled planar fracture manifold' },
  ],
  3: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Viscous quiescence', sub: 'Viscous quiescence' },
    { t: 0.3, label: 'LIQUEFACTION', desc: 'Hydrodynamic viscosity collapse', sub: 'Hydrodynamic viscosity collapse' },
    { t: 0.7, label: 'VORTEX ADVECTION', desc: 'Turbulent Lamb-Oseen flow', sub: 'Turbulent Lamb-Oseen flow' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Conformal planar equilibrium', sub: 'Conformal planar equilibrium' },
  ],
  4: [
    { t: 0.0, label: 'ICOSA CODES', desc: '20 spherical equilateral faces', sub: '20 spherical equilateral faces' },
    { t: 0.4, label: 'HINGE ROTATION', desc: 'Facet decoupling along edges', sub: 'Facet decoupling along edges' },
    { t: 0.8, label: 'NET DEPLOYMENT', desc: 'Planar triangular deployment', sub: 'Planar triangular deployment' },
    { t: 1.0, label: 'DYMAXION (K = 0)', desc: 'Fuller zero-distortion net', sub: 'Fuller zero-distortion net' },
  ],
};

const MILESTONE_DETENTS = [0.000, 0.300, 0.700, 1.000];
const SNAP_RADIUS = 0.015;
const VELOCITY_BREAKAWAY = 0.0004;

const snapToDetent = (val: number, velocity: number): number => {
  if (Math.abs(velocity) > VELOCITY_BREAKAWAY) {
    return val;
  }
  for (const m of MILESTONE_DETENTS) {
    if (Math.abs(val - m) <= SNAP_RADIUS) {
      return m;
    }
  }
  return val;
};

export const CurvatureUnfurlSextant: React.FC<CurvatureUnfurlSextantProps> = ({
  alpha = 0,
  onAlphaChange,
  onGlideToAlpha,
  onCancelGlide,
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
  const stationaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInteractedAlphaRef = useRef<number>(alpha);

  useEffect(() => {
    lastInteractedAlphaRef.current = alpha;
  }, [alpha]);

  useEffect(() => {
    return () => {
      if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
      if (stationaryTimeoutRef.current) clearTimeout(stationaryTimeoutRef.current);
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

  const [dragAlpha, setDragAlpha] = useState<number | null>(null);

  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      // Active arc span: calibrated pointer clientX relative to SVG arc path [15, 225] inside 240 viewBox
      const leftMargin = rect.width * (15 / 240);
      const arcWidth = rect.width * (210 / 240);
      const rawFrac = (clientX - (rect.left + leftMargin)) / arcWidth;
      let normX = Math.max(0.0, Math.min(1.0, rawFrac));

      // Magnetic milestone detents with velocity breakaway
      const snappedX = snapToDetent(normX, velocityRef.current);
      const nextAlpha = parseFloat(snappedX.toFixed(3));

      // Render reticle thumb using local drag coordinates, bypassing 30Hz React throttle
      lastInteractedAlphaRef.current = nextAlpha;
      setDragAlpha(nextAlpha);
      onAlphaChange(nextAlpha);
    },
    [onAlphaChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onCancelGlide?.();
    isDraggingRef.current = true;
    if (stationaryTimeoutRef.current) {
      clearTimeout(stationaryTimeoutRef.current);
      stationaryTimeoutRef.current = null;
    }
    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    lastClientXRef.current = e.clientX;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
    try {
      boxRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    if (stationaryTimeoutRef.current) {
      clearTimeout(stationaryTimeoutRef.current);
      stationaryTimeoutRef.current = null;
    }
    const now = performance.now();
    const dt = now - lastTimeRef.current;
    if (dt > 4 && boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        const arcWidth = rect.width * (210 / 240);
        const dx = (e.clientX - lastClientXRef.current) / arcWidth;
        velocityRef.current = dx / dt; // normalized fraction per ms
        lastClientXRef.current = e.clientX;
        lastTimeRef.current = now;
      }
    }
    updateFromPointer(e.clientX);

    // If pointer stops moving within a milestone detent radius while still dragging,
    // decay velocity and snap activeAlpha directly to milestone after brief pause (40ms)
    stationaryTimeoutRef.current = setTimeout(() => {
      if (!isDraggingRef.current) return;
      velocityRef.current = 0;
      updateFromPointer(lastClientXRef.current);
    }, 40);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (stationaryTimeoutRef.current) {
      clearTimeout(stationaryTimeoutRef.current);
      stationaryTimeoutRef.current = null;
    }
    try {
      if (!boxRef.current?.hasPointerCapture || boxRef.current.hasPointerCapture(e.pointerId)) {
        boxRef.current?.releasePointerCapture?.(e.pointerId);
      }
    } catch {
      // Ignore
    }

    // If stationary before releasing, cancel coasting
    const now = performance.now();
    if (now - lastTimeRef.current > 50) {
      velocityRef.current = 0;
    }

    const finalAlpha = dragAlpha !== null ? dragAlpha : alpha;
    let currentAlpha = finalAlpha;
    if (lastInteractedAlphaRef.current !== null && lastInteractedAlphaRef.current !== undefined) {
      currentAlpha = lastInteractedAlphaRef.current;
    }
    if (Math.abs(velocityRef.current) <= VELOCITY_BREAKAWAY) {
      currentAlpha = snapToDetent(currentAlpha, velocityRef.current);
      if (MILESTONE_DETENTS.some((m) => Math.abs(currentAlpha - m) <= SNAP_RADIUS)) {
        velocityRef.current = 0;
      }
    }

    // Micro-momentum coasting (20-50ms inertia decay, strictly clamped to 2-5 alpha units)
    let vel = velocityRef.current;
    // Clamp velocity to enforce 2-5 alpha units (0.02 - 0.05) maximum overshoot
    vel = Math.max(-0.0015, Math.min(0.0015, vel));
    if (Math.abs(vel) > 0.0002) {
      const step = () => {
        vel *= 0.60; // rapid friction damping over 20-50ms (2-3 frames)
        currentAlpha = Math.max(0.0, Math.min(1.0, currentAlpha + vel * 16));
        if (Math.abs(vel) <= VELOCITY_BREAKAWAY) {
          const snapped = snapToDetent(currentAlpha, vel);
          if (snapped !== currentAlpha) {
            currentAlpha = snapped;
            vel = 0;
          }
        }
        const clampedAlpha = parseFloat(currentAlpha.toFixed(3));
        setDragAlpha(clampedAlpha);
        onAlphaChange(clampedAlpha);
        if (Math.abs(vel) < 0.00008) {
          momentumRafRef.current = null;
          setDragAlpha(null);
          return;
        }
        momentumRafRef.current = requestAnimationFrame(step);
      };
      momentumRafRef.current = requestAnimationFrame(step);
    } else {
      lastInteractedAlphaRef.current = currentAlpha;
      setDragAlpha(null);
      onAlphaChange(currentAlpha);
    }
  };

  // Local drag alpha takes precedence during interactions to bypass 30Hz React throttle
  const activeAlpha = dragAlpha !== null ? dragAlpha : alpha;

  // SVG dimensions: 240 x 36
  const peakY = 6 + activeAlpha * 20;
  const pathD = `M 15 26 Q 120 ${peakY} 225 26`;

  // Quadratic Bezier formula: B(t) = (1-t)^2 * P0 + 2*(1-t)*t * P1 + t^2 * P2
  const getBezierY = (tVal: number) =>
    (1 - tVal) * (1 - tVal) * 26 + 2 * (1 - tVal) * tVal * peakY + tVal * tVal * 26;

  const t = Math.max(0, Math.min(1, activeAlpha));
  const thumbX = 15 + t * 210;
  const thumbY = getBezierY(t);

  // Dynamic intermediate tick marker y-coordinates so ticks sit flush on the track line at alpha = 1.0 (no floating dots)
  const tick2Y = getBezierY(0.3);
  const tick3Y = getBezierY(0.7);

  const milestones = MILESTONES_BY_MODE[mode] || MILESTONES_BY_MODE[0];
  let currentMilestone = milestones[0];
  // Milestone 4 threshold adjusted to alpha >= 0.98
  if (activeAlpha >= 0.98) currentMilestone = milestones[3];
  else if (activeAlpha >= 0.5) currentMilestone = milestones[2];
  else if (activeAlpha >= 0.15) currentMilestone = milestones[1];

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
        aria-valuenow={parseFloat(activeAlpha.toFixed(3))}
        aria-valuetext={`${(activeAlpha * 100).toFixed(0)}% — ${currentMilestone.label}: ${currentMilestone.sub}`}
        onKeyDown={(e) => {
          onCancelGlide?.();
          if (momentumRafRef.current) {
            cancelAnimationFrame(momentumRafRef.current);
            momentumRafRef.current = null;
          }
          velocityRef.current = 0;
          if (dragAlpha !== null) setDragAlpha(null);
          const step = e.shiftKey ? 0.05 : 0.01;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(parseFloat(Math.max(0.0, activeAlpha - step).toFixed(3)));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(parseFloat(Math.min(1.0, activeAlpha + step).toFixed(3)));
          } else if (e.key === 'Home') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(0.0);
          } else if (e.key === 'End') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(1.0);
          } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'PageUp') {
            e.preventDefault();
            e.stopPropagation();
            const next = MILESTONE_DETENTS.find((m) => m > activeAlpha + 0.001) ?? 1.0;
            onAlphaChange(parseFloat(next.toFixed(3)));
          } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'PageDown') {
            e.preventDefault();
            e.stopPropagation();
            const prev = [...MILESTONE_DETENTS].reverse().find((m) => m < activeAlpha - 0.001) ?? 0.0;
            onAlphaChange(parseFloat(prev.toFixed(3)));
          } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '1') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(0.0);
          } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '2') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(0.3);
          } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '3') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(0.7);
          } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '4') {
            e.preventDefault();
            e.stopPropagation();
            onAlphaChange(1.0);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onDoubleClick={() => {
          if (momentumRafRef.current) {
            cancelAnimationFrame(momentumRafRef.current);
            momentumRafRef.current = null;
          }
          velocityRef.current = 0;
          setDragAlpha(null);
          const refAlpha = dragAlpha !== null ? dragAlpha : lastInteractedAlphaRef.current;
          onGlideToAlpha?.(refAlpha < 0.5 ? 1.0 : 0.0);
        }}
        title="Drag vernier reticle along curvature arc (Double-click to toggle Globe/Map, Arrow keys to nudge)"
        className={`relative w-full h-9 rounded-[2px] border flex items-center justify-center cursor-pointer select-none touch-none shadow-inner bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] focus-visible:outline-none ${
          isHovered ? 'shadow-[0_0_12px_var(--theme-focus-ring)] border-[var(--theme-card-border-hover)]' : ''
        }`}
        style={{ touchAction: 'none' }}
      >
        <svg className="w-full h-full pointer-events-none" viewBox="0 0 240 36" preserveAspectRatio="none">
          {/* Radial reference rays */}
          <line x1="120" y1="34" x2="15" y2="10" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="68" y2="6" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="120" y2="4" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="172" y2="6" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />
          <line x1="120" y1="34" x2="225" y2="10" stroke={sextantTokens.rayStroke} strokeDasharray="2 2" />

          {/* Magnetic tick markers - dynamically sit flush on Bezier track */}
          <circle cx="15" cy="26" r="2" fill={activeAlpha < 0.15 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />
          <circle cx="78" cy={tick2Y} r="2" fill={activeAlpha >= 0.15 && activeAlpha < 0.5 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />
          <circle cx="162" cy={tick3Y} r="2" fill={activeAlpha >= 0.5 && activeAlpha < 0.98 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />
          <circle cx="225" cy="26" r="2" fill={activeAlpha >= 0.98 ? sextantTokens.activeTick : sextantTokens.inactiveTick} />

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
            r={isHovered || dragAlpha !== null ? 5.5 : 4.5}
            fill={sextantTokens.thumbFill}
            stroke={sextantTokens.thumbStroke}
            strokeWidth="2"
            className="shadow-sm"
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
