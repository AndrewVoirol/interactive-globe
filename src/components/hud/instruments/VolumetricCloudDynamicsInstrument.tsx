// ============================================================================
// File: src/components/hud/instruments/VolumetricCloudDynamicsInstrument.tsx
// Volumetric Cloud Physics Control Station
// Unifies Vertical Structure, Billow Detail, and Planetary Scale into tactile SVGs
// Invariants: §2 (Clearance), §4 (Single-Border), §24 (Zero-Recompile)
// ============================================================================

import React, { useRef, useCallback } from 'react';

export interface VolumetricCloudDynamicsInstrumentProps {
  cloudThickness: number;
  onCloudThicknessChange: (val: number) => void;
  cloudLowTop: number;
  onCloudLowTopChange: (val: number) => void;
  
  cloudErosion: number;
  onCloudErosionChange: (val: number) => void;
  cloudExtinction: number;
  onCloudExtinctionChange: (val: number) => void;
  
  cloudFreqHoriz: number;
  onCloudFreqHorizChange: (val: number) => void;
  cloudFreqVert: number;
  onCloudFreqVertChange: (val: number) => void;
  
  theme?: 0 | 1 | 2;
  isLight?: boolean;
  className?: string;
}

export const VolumetricCloudDynamicsInstrument: React.FC<VolumetricCloudDynamicsInstrumentProps> = ({
  cloudThickness, onCloudThicknessChange,
  cloudLowTop, onCloudLowTopChange,
  cloudErosion, onCloudErosionChange,
  cloudExtinction, onCloudExtinctionChange,
  cloudFreqHoriz, onCloudFreqHorizChange,
  cloudFreqVert, onCloudFreqVertChange,
  theme: propTheme,
  isLight = false,
  className = '',
}) => {
  const activeTheme: 0 | 1 | 2 = propTheme !== undefined ? propTheme : isLight ? 1 : 0;

  // --------------------------------------------------------------------------
  // Panel 1: Vertical Structure (Thickness & Ceiling)
  // --------------------------------------------------------------------------
  const vertRef = useRef<HTMLDivElement>(null);
  const isDraggingVertRef = useRef(false);
  const activeVertThumbRef = useRef<'thickness' | 'ceiling' | null>(null);

  const updateVert = useCallback((clientX: number, clientY: number, forceThumb?: 'thickness' | 'ceiling') => {
    if (!vertRef.current) return;
    const rect = vertRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    let target = forceThumb || activeVertThumbRef.current;
    if (!target) {
      target = x < 0.5 ? 'thickness' : 'ceiling';
      activeVertThumbRef.current = target;
    }
    const valY = 1.0 - y;

    if (target === 'thickness') {
      const val = 0.04 + valY * (0.35 - 0.04);
      onCloudThicknessChange(Math.max(0.04, Math.min(0.35, Math.round(val * 100) / 100)));
    } else {
      const val = 0.15 + valY * (0.60 - 0.15);
      onCloudLowTopChange(Math.max(0.15, Math.min(0.60, Math.round(val * 100) / 100)));
    }
  }, [onCloudThicknessChange, onCloudLowTopChange]);

  const handleVertDown = (e: React.PointerEvent) => {
    isDraggingVertRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    activeVertThumbRef.current = null;
    updateVert(e.clientX, e.clientY);
  };
  const handleVertMove = (e: React.PointerEvent) => {
    if (!isDraggingVertRef.current) return;
    updateVert(e.clientX, e.clientY);
  };
  const handleVertUp = (e: React.PointerEvent) => {
    isDraggingVertRef.current = false;
    activeVertThumbRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };
  const handleVertReset = () => {
    onCloudThicknessChange(0.19);
    onCloudLowTopChange(0.45);
  };

  // --------------------------------------------------------------------------
  // Panel 2: Billow Detail (Erosion X & Extinction Y)
  // --------------------------------------------------------------------------
  const billowRef = useRef<HTMLDivElement>(null);
  const isDraggingBillowRef = useRef(false);

  const updateBillow = useCallback((clientX: number, clientY: number) => {
    if (!billowRef.current) return;
    const rect = billowRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    const erosion = 0.20 + x * (1.20 - 0.20);
    const extinction = 10.0 + (1.0 - y) * (50.0 - 10.0);

    onCloudErosionChange(Math.max(0.20, Math.min(1.20, Math.round(erosion * 100) / 100)));
    onCloudExtinctionChange(Math.max(10.0, Math.min(50.0, Math.round(extinction))));
  }, [onCloudErosionChange, onCloudExtinctionChange]);

  const handleBillowDown = (e: React.PointerEvent) => {
    isDraggingBillowRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateBillow(e.clientX, e.clientY);
  };
  const handleBillowMove = (e: React.PointerEvent) => {
    if (!isDraggingBillowRef.current) return;
    updateBillow(e.clientX, e.clientY);
  };
  const handleBillowUp = (e: React.PointerEvent) => {
    isDraggingBillowRef.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };
  const handleBillowReset = () => {
    onCloudErosionChange(0.85);
    onCloudExtinctionChange(28.0);
  };

  // --------------------------------------------------------------------------
  // Panel 3: Planetary Scale (FreqHoriz X & FreqVert Y)
  // --------------------------------------------------------------------------
  const scaleRef = useRef<HTMLDivElement>(null);
  const isDraggingScaleRef = useRef(false);

  const updateScale = useCallback((clientX: number, clientY: number) => {
    if (!scaleRef.current) return;
    const rect = scaleRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    const horiz = 12.0 + x * (56.0 - 12.0);
    const vert = 4.0 + (1.0 - y) * (24.0 - 4.0);

    onCloudFreqHorizChange(Math.max(12.0, Math.min(56.0, Math.round(horiz))));
    onCloudFreqVertChange(Math.max(4.0, Math.min(24.0, Math.round(vert))));
  }, [onCloudFreqHorizChange, onCloudFreqVertChange]);

  const handleScaleDown = (e: React.PointerEvent) => {
    isDraggingScaleRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateScale(e.clientX, e.clientY);
  };
  const handleScaleMove = (e: React.PointerEvent) => {
    if (!isDraggingScaleRef.current) return;
    updateScale(e.clientX, e.clientY);
  };
  const handleScaleUp = (e: React.PointerEvent) => {
    isDraggingScaleRef.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };
  const handleScaleReset = () => {
    onCloudFreqHorizChange(32.0);
    onCloudFreqVertChange(12.0);
  };

  // --------------------------------------------------------------------------
  // Normalized Values (0 to 1) for SVG Drawing
  // --------------------------------------------------------------------------
  const normThickness = (cloudThickness - 0.04) / (0.35 - 0.04);
  const normCeiling = (cloudLowTop - 0.15) / (0.60 - 0.15);
  const normErosion = (cloudErosion - 0.20) / (1.20 - 0.20);
  const normExtinction = (cloudExtinction - 10.0) / (50.0 - 10.0);
  const normFreqHoriz = (cloudFreqHoriz - 12.0) / (56.0 - 12.0);
  const normFreqVert = (cloudFreqVert - 4.0) / (24.0 - 4.0);

  // SVG Coordinates for Calipers
  // Vertical Structure (Thickness & Ceiling)
  // Let bottom (surface) be y=80, top be y=10. Total tropospheric span = 70.
  // thickness controls the absolute height of the entire shell
  const tY = 80 - normThickness * 70; 
  // ceiling controls the relative height (0 to 1) of the low cloud boundary *within* that shell
  // wait, in the shader, cloudLowTop is a normalized [0, 1] value representing altitude inside the shell.
  // So the physical Y coordinate of the ceiling is relative to the absolute thickness!
  const cY = 80 - (cloudLowTop) * (80 - tY);

  // Mid and High boundaries in the shader (approximate visual locations based on AtmosphericColumn logic)
  const midTop = 80 - (0.75) * (80 - tY);
  const highTop = 80 - (0.95) * (80 - tY);

  // Billow Detail
  const bX = 20 + normErosion * 200;
  const eY = 80 - normExtinction * 70; // 10 to 80

  // Planetary Scale
  const hX = 20 + normFreqHoriz * 200;
  const vY = 80 - normFreqVert * 70;

  return (
    <div className={`flex flex-col space-y-2.5 ${className}`}>
      
      {/* 1. Vertical Structure */}
      <div className="p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] group">
        <div className="flex items-start justify-between text-micro mb-1.5 font-mono">
          <div className="flex flex-col min-w-0">
            <span className="font-bold tracking-wider text-[var(--theme-text-secondary)] uppercase truncate group-hover:text-[var(--theme-text-accent)] transition-colors">
              VERTICAL STRUCTURE
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Shell Thickness (All Strata) &amp; Cumulus Deck
            </span>
          </div>
          <div className="flex flex-col items-end text-nano font-mono leading-tight shrink-0 ml-1.5 pt-0.5">
            <div><span className="text-[var(--theme-text-secondary)]">Thick:</span> <span className="font-bold">{(cloudThickness * 100).toFixed(1)}%</span></div>
            <div><span className="text-[var(--theme-text-secondary)]">Ceil:</span> <span className="font-bold">{Math.round(cloudLowTop * 100)}%</span></div>
          </div>
        </div>
        
        <div
          ref={vertRef}
          onPointerDown={handleVertDown}
          onPointerMove={handleVertMove}
          onPointerUp={handleVertUp}
          onPointerCancel={handleVertUp}
          onDoubleClick={handleVertReset}
          title="Drag left side to scale total Tropospheric Height (affects all strata). Drag right side to adjust Cumulus Ceiling proportion."
          className="relative w-full h-32 rounded-[2px] overflow-hidden cursor-crosshair select-none touch-none shadow-inner bg-[var(--theme-instrument-viewport-bg)] border border-[var(--theme-instrument-viewport-border)] hover:border-[var(--theme-card-border-hover)] transition-colors"
        >
          <svg className="w-full h-full pointer-events-none" viewBox="0 0 240 100" preserveAspectRatio="none">
            {/* Base Planetary Curvature */}
            <path d="M 0 80 Q 120 75 240 80 L 240 100 L 0 100 Z" fill="var(--theme-instrument-ink)" fillOpacity="0.1" />
            <path d="M 0 80 Q 120 75 240 80" fill="none" stroke="var(--theme-instrument-ink)" strokeWidth="1" strokeOpacity="0.5" />
            <text x="120" y="92" textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.5" fontSize="6" fontFamily="monospace" fontWeight="bold">PLANETARY CRUST</text>

            <g stroke="var(--theme-instrument-ink)" strokeWidth="0.5" strokeOpacity="0.15">
              <line x1="120" y1="0" x2="120" y2="80" strokeDasharray="2 2" />
            </g>

            {/* The Atmospheric Volume / Strata Layers */}
            {/* High Stratum (Cirrus) */}
            <rect x="50" y={highTop} width="140" height={Math.max(0, midTop - highTop)} fill="var(--theme-instrument-ink)" fillOpacity="0.05" />
            <text x="120" y={highTop + 4} textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.5" fontSize="4.5" fontFamily="monospace">HIGH (CIRRUS)</text>
            
            {/* Mid Stratum (Altocumulus) */}
            <rect x="45" y={midTop} width="150" height={Math.max(0, cY - midTop)} fill="var(--theme-instrument-ink)" fillOpacity="0.1" />
            <text x="120" y={midTop + (cY - midTop)/2 + 2} textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.5" fontSize="4.5" fontFamily="monospace">MID (ALTOCUMULUS)</text>

            {/* Low Stratum (Cumulus/Stratus) */}
            {/* Drawn from the 'Ceiling' down to surface */}
            <rect x="40" y={cY} width="160" height={Math.max(0, 80 - cY)} fill="var(--theme-instrument-ink)" fillOpacity="0.2" />
            <text x="120" y={cY + (80 - cY)/2 + 2} textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.7" fontSize="4.5" fontFamily="monospace" fontWeight="bold">LOW (CUMULUS / STRATUS)</text>

            {/* Left Caliper: Absolute Troposphere Thickness (scales entire column) */}
            <line x1="10" y1={tY} x2="40" y2={tY} stroke="var(--theme-instrument-caliper)" strokeWidth="1.5" />
            <line x1="38" y1={tY} x2="38" y2="80" stroke="var(--theme-instrument-caliper)" strokeWidth="1" strokeDasharray="2 2" />
            <polygon points={`10,${tY} 16,${tY-4} 16,${tY+4}`} fill="var(--theme-instrument-caliper)" />
            <text x="16" y={tY-3} textAnchor="start" fill="var(--theme-instrument-caliper)" fontSize="5.5" fontFamily="monospace" fontWeight="bold">TROPOSPHERE</text>
            <text x="16" y={tY+6} textAnchor="start" fill="var(--theme-instrument-caliper)" fontSize="5" fontFamily="monospace">(ALL STRATA)</text>
            
            {/* Right Caliper: Low Deck Ceiling (proportion within the column) */}
            <line x1="200" y1={cY} x2="230" y2={cY} stroke="var(--theme-instrument-caliper)" strokeWidth="1.5" />
            <polygon points={`230,${cY} 224,${cY-4} 224,${cY+4}`} fill="var(--theme-instrument-caliper)" />
            <text x="224" y={cY-3} textAnchor="end" fill="var(--theme-instrument-caliper)" fontSize="5.5" fontFamily="monospace" fontWeight="bold">CUMULUS CEIL</text>

          </svg>
        </div>
      </div>

      {/* 2. Billow Detail */}
      <div className="p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] group">
        <div className="flex items-start justify-between text-micro mb-1.5 font-mono">
          <div className="flex flex-col min-w-0">
            <span className="font-bold tracking-wider text-[var(--theme-text-secondary)] uppercase truncate group-hover:text-[var(--theme-text-accent)] transition-colors">
              BILLOW DETAIL (ALL STRATA)
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Erosion Shape (X) &amp; Extinction Density (Y)
            </span>
          </div>
          <div className="flex flex-col items-end text-nano font-mono leading-tight shrink-0 ml-1.5 pt-0.5">
            <div><span className="text-[var(--theme-text-secondary)]">Eros:</span> <span className="font-bold">{cloudErosion.toFixed(2)}</span></div>
            <div><span className="text-[var(--theme-text-secondary)]">Extn:</span> <span className="font-bold">{Math.round(cloudExtinction)}</span></div>
          </div>
        </div>
        
        <div
          ref={billowRef}
          onPointerDown={handleBillowDown}
          onPointerMove={handleBillowMove}
          onPointerUp={handleBillowUp}
          onPointerCancel={handleBillowUp}
          onDoubleClick={handleBillowReset}
          title="Drag horizontally for Erosion (more broken clouds). Drag vertically for Extinction (denser/darker clouds)."
          className="relative w-full h-28 rounded-[2px] overflow-hidden cursor-crosshair select-none touch-none shadow-inner bg-[var(--theme-instrument-viewport-bg)] border border-[var(--theme-instrument-viewport-border)] hover:border-[var(--theme-card-border-hover)] transition-colors"
        >
          <svg className="w-full h-full pointer-events-none" viewBox="0 0 240 90" preserveAspectRatio="none">
            {/* Axis hints */}
            <text x="120" y="85" textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.4" fontSize="5" fontFamily="monospace">MORE SOLID ← EROSION → MORE BROKEN</text>
            <text x="5" y="45" textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.4" fontSize="5" fontFamily="monospace" transform="rotate(-90 5,45)">TRANSLUCENT ← EXTINCTION → OPAQUE</text>

            <g stroke="var(--theme-instrument-ink)" strokeWidth="0.5" strokeOpacity="0.1">
              {[20,40,60].map(y => <line key={y} x1="0" y1={y} x2="240" y2={y} />)}
              {[40,80,120,160,200].map(x => <line key={x} x1={x} y1="0" x2={x} y2="90" />)}
            </g>

            {/* Cloud Puff Visualization */}
            <g transform={`translate(${120}, ${45}) scale(1.5)`}>
              {/* Core blob */}
              <circle cx="0" cy="0" r={16 - normErosion*4} fill="var(--theme-instrument-ink)" fillOpacity={0.1 + normExtinction*0.6} />
              
              {/* Secondary blobs */}
              <circle cx="-12" cy="4" r={10 - normErosion*8} fill="var(--theme-instrument-ink)" fillOpacity={0.1 + normExtinction*0.5} />
              <circle cx="12" cy="4" r={10 - normErosion*8} fill="var(--theme-instrument-ink)" fillOpacity={0.1 + normExtinction*0.5} />
              <circle cx="-6" cy="-8" r={12 - normErosion*6} fill="var(--theme-instrument-ink)" fillOpacity={0.1 + normExtinction*0.4} />
              <circle cx="8" cy="-6" r={11 - normErosion*5} fill="var(--theme-instrument-ink)" fillOpacity={0.1 + normExtinction*0.4} />

              {/* Subtractive bites (Simulating Worley Erosion) */}
              <circle cx="-14" cy="-10" r={normErosion * 8} fill="var(--theme-instrument-viewport-bg)" />
              <circle cx="14" cy="-8" r={normErosion * 7} fill="var(--theme-instrument-viewport-bg)" />
              <circle cx="0" cy="12" r={normErosion * 6} fill="var(--theme-instrument-viewport-bg)" />
              <circle cx="-8" cy="8" r={normErosion * 4} fill="var(--theme-instrument-viewport-bg)" />
              <circle cx="8" cy="10" r={normErosion * 5} fill="var(--theme-instrument-viewport-bg)" />
            </g>

            {/* Reticle / Crosshair */}
            <line x1="0" y1={eY} x2="240" y2={eY} stroke="var(--theme-instrument-caliper)" strokeWidth="0.8" strokeDasharray="2 2" />
            <line x1={bX} y1="0" x2={bX} y2="90" stroke="var(--theme-instrument-caliper)" strokeWidth="0.8" strokeDasharray="2 2" />
            <circle cx={bX} cy={eY} r="3" fill="none" stroke="var(--theme-instrument-caliper)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      {/* 3. Planetary Scale */}
      <div className="p-2 rounded-[3px] border shadow-sm transition-all bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] group">
        <div className="flex items-start justify-between text-micro mb-1.5 font-mono">
          <div className="flex flex-col min-w-0">
            <span className="font-bold tracking-wider text-[var(--theme-text-secondary)] uppercase truncate group-hover:text-[var(--theme-text-accent)] transition-colors">
              PLANETARY SCALE (ALL STRATA)
            </span>
            <span className="text-nano text-[var(--theme-text-muted)] truncate">
              Horizontal (X) &amp; Vertical (Y) Freq
            </span>
          </div>
          <div className="flex flex-col items-end text-nano font-mono leading-tight shrink-0 ml-1.5 pt-0.5">
            <div><span className="text-[var(--theme-text-secondary)]">Horz:</span> <span className="font-bold">{Math.round(cloudFreqHoriz)}×</span></div>
            <div><span className="text-[var(--theme-text-secondary)]">Vert:</span> <span className="font-bold">{Math.round(cloudFreqVert)}×</span></div>
          </div>
        </div>
        
        <div
          ref={scaleRef}
          onPointerDown={handleScaleDown}
          onPointerMove={handleScaleMove}
          onPointerUp={handleScaleUp}
          onPointerCancel={handleScaleUp}
          onDoubleClick={handleScaleReset}
          title="Drag horizontally to increase planetary cell count (popcorn vs massive). Drag vertically to increase vertical stacked layers."
          className="relative w-full h-28 rounded-[2px] overflow-hidden cursor-crosshair select-none touch-none shadow-inner bg-[var(--theme-instrument-viewport-bg)] border border-[var(--theme-instrument-viewport-border)] hover:border-[var(--theme-card-border-hover)] transition-colors"
        >
          <svg className="w-full h-full pointer-events-none" viewBox="0 0 240 90" preserveAspectRatio="none">
            {/* Axis hints */}
            <text x="120" y="85" textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.4" fontSize="5" fontFamily="monospace">MASSIVE SYSTEMS ← HORIZ FREQ → POPCORN CELLS</text>
            <text x="5" y="45" textAnchor="middle" fill="var(--theme-instrument-ink)" fillOpacity="0.4" fontSize="5" fontFamily="monospace" transform="rotate(-90 5,45)">MONOLITHIC ← VERT FREQ → STACKED LAYERS</text>

            <g stroke="var(--theme-instrument-ink)" strokeWidth="0.5" strokeOpacity="0.1">
              {[20,40,60].map(y => <line key={y} x1="0" y1={y} x2="240" y2={y} />)}
              {[40,80,120,160,200].map(x => <line key={x} x1={x} y1="0" x2={x} y2="90" />)}
            </g>

            {/* Visualize frequency as a grid of cloud dots */}
            <g fill="var(--theme-instrument-ink)" fillOpacity="0.3">
              {Array.from({length: Math.max(3, Math.round(cloudFreqHoriz/2))}).map((_, xIdx, xArr) => {
                return Array.from({length: Math.max(1, Math.round(cloudFreqVert/2))}).map((_, yIdx, yArr) => {
                  const cx = 20 + (200 / (xArr.length)) * (xIdx + 0.5);
                  const cy = 10 + (60 / (yArr.length)) * (yIdx + 0.5);
                  const rx = (100 / xArr.length) - 1;
                  const ry = (30 / yArr.length) - 1;
                  return (
                    <ellipse key={`${xIdx}-${yIdx}`} cx={cx} cy={cy} rx={Math.max(1, rx)} ry={Math.max(1, ry)} />
                  );
                });
              })}
            </g>

            {/* Crosshair Caliper */}
            <line x1="0" y1={vY} x2="240" y2={vY} stroke="var(--theme-instrument-caliper)" strokeWidth="0.8" strokeDasharray="2 2" />
            <line x1={hX} y1="0" x2={hX} y2="90" stroke="var(--theme-instrument-caliper)" strokeWidth="0.8" strokeDasharray="2 2" />
            <polygon points={`${hX},${vY-3} ${hX+3},${vY} ${hX},${vY+3} ${hX-3},${vY}`} fill="none" stroke="var(--theme-instrument-caliper)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default VolumetricCloudDynamicsInstrument;
