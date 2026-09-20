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
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Equirectangular planar' },
  ],
  1: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Closed spherical cylinder' },
    { t: 0.3, label: 'SEAM DECOUPLING', desc: 'Antimeridian longitudinal cut' },
    { t: 0.7, label: 'CYLINDER UNROLL', desc: 'Circumferential unrolling' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Unrolled Mercator cylinder' },
  ],
  2: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Hoop stress along seam' },
    { t: 0.3, label: 'ANTIMERIDIAN RUPTURE', desc: 'Griffith LEFM equatorial crack' },
    { t: 0.7, label: 'FLAP PEELING', desc: 'Elastic stress dissipation' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Unrolled planar fracture' },
  ],
  3: [
    { t: 0.0, label: 'SPHERE (K > 0)', desc: 'Viscous quiescence' },
    { t: 0.3, label: 'LIQUEFACTION', desc: 'Hydrodynamic viscosity collapse' },
    { t: 0.7, label: 'VORTEX ADVECTION', desc: 'Turbulent Lamb-Oseen flow' },
    { t: 1.0, label: 'PLANAR MAP (K = 0)', desc: 'Conformal planar equilibrium' },
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const alphaRef = useRef(alpha);
  alphaRef.current = alpha;
  const lastSyncRef = useRef(0);
  const throttleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        cancelAnimationFrame(throttleTimerRef.current);
      }
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_SCRUB_ALPHA__ = undefined;
      }
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
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      let normX = 0;
      if (svg && typeof svg.createSVGPoint === 'function' && typeof svg.getScreenCTM === 'function') {
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const pt = svg.createSVGPoint();
          pt.x = clientX;
          pt.y = clientY;
          const svgP = pt.matrixTransform(ctm.inverse());
          normX = (svgP.x - 15) / 210;
        } else if (boxRef.current) {
          const rect = boxRef.current.getBoundingClientRect();
          const rawFrac = (clientX - rect.left) / (rect.width || 1);
          normX = (rawFrac - 15 / 240) / (210 / 240);
        }
      } else if (boxRef.current) {
        const rect = boxRef.current.getBoundingClientRect();
        const rawFrac = (clientX - rect.left) / (rect.width || 1);
        normX = (rawFrac - 15 / 240) / (210 / 240);
      }
      normX = Math.max(0.0, Math.min(1.0, normX));

      // Zero-Latency Sub-Frame Scrub Channel:
      // Direct write to window for immediate 120 FPS render loop sampling
      if (typeof window !== 'undefined') {
        (window as any).__INDICATRIX_SCRUB_ALPHA__ = normX;
      }

      alphaRef.current = normX;

      // Throttle React setAlpha(normX) to ~30Hz / rAF to eliminate VDOM diff storms
      const now = performance.now();
      if (now - lastSyncRef.current >= 33) {
        lastSyncRef.current = now;
        onAlphaChange(normX);
      } else if (!throttleTimerRef.current) {
        throttleTimerRef.current = requestAnimationFrame(() => {
          throttleTimerRef.current = null;
          lastSyncRef.current = performance.now();
          onAlphaChange(alphaRef.current);
        });
      }
    },
    [onAlphaChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    if (throttleTimerRef.current) {
      cancelAnimationFrame(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    boxRef.current?.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    isDraggingRef.current = false;
    if (throttleTimerRef.current) {
      cancelAnimationFrame(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    try {
      boxRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    // Clear zero-latency scrub channel and commit final value to React state
    const finalAlpha = alphaRef.current;
    if (typeof window !== 'undefined') {
      (window as any).__INDICATRIX_SCRUB_ALPHA__ = undefined;
    }
    onAlphaChange(finalAlpha);
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
    <div className="flex flex-col items-center w-72 sm:w-80 md:w-[350px] select-none">
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
            onAlphaChange(Math.max(0.0, alpha - step));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onAlphaChange(Math.min(1.0, alpha + step));
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
        <svg ref={svgRef} className="w-full h-full pointer-events-none" viewBox="0 0 240 36">
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
            r={isHovered || isDragging ? 5.5 : 4.5}
            fill={sextantTokens.thumbFill}
            stroke={sextantTokens.thumbStroke}
            strokeWidth="2"
            className={`shadow-sm ${isDragging ? '' : 'transition-all duration-150'}`}
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
      <div className="text-nano sm:text-micro font-mono tracking-wider uppercase mt-0.5 w-full h-3.5 leading-tight text-center truncate">
        <span className="font-bold text-[var(--theme-text-accent)]">{currentMilestone.label}</span>
        <span className="opacity-70 text-[var(--theme-text-secondary)]"> • {currentMilestone.desc}</span>
      </div>
    </div>
  );
};
