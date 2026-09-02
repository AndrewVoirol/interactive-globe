import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { FeatureCollection, WorldAtlas } from './types';

const COLORS = {
  SPACE_BG: '#020305',
  OCEAN_BG: '#05080f',
  DOT: 'rgba(96, 165, 250, 0.85)',
  MESH: 'rgba(96, 165, 250, 0.15)',
  GRATICULE: 'rgba(100, 130, 180, 0.08)',
  SPHERE_GLOW: 'rgba(56, 189, 248, 0.15)',
};

const morphMutator = d3.geoProjectionMutator((t: number) => {
  return (lambda: number, phi: number): [number, number] => {
    const oX = Math.cos(phi) * Math.sin(lambda);
    const oY = Math.sin(phi);
    const eX = lambda;
    const eY = phi;
    return [
      (1 - t) * oX + t * eX,
      (1 - t) * oY + t * eY
    ];
  };
});

const sharedProj = morphMutator(0);
const sharedPath = d3.geoPath(sharedProj);
const graticule = d3.geoGraticule().step([15, 15])();
const sphere = { type: 'Sphere' } as any;

export const GlobeVisualization: React.FC = () => {
  const [alpha, setAlpha] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meshDataRef = useRef<FeatureCollection | null>(null);
  const pointsDataRef = useRef<any>(null);

  const physics = useRef({
    lon: 0, lat: -15, vLon: 0, vLat: 0,
    isDragging: false, lastX: 0, lastY: 0, lastTime: 0,
    width: 0, height: 0, dpr: 1
  });

  useEffect(() => {
    let isMounted = true;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json')
      .then((res) => res.json())
      .then((data: WorldAtlas) => {
        if (!isMounted) return;
        const feats = topojson.feature(data as any, data.objects.countries) as unknown as FeatureCollection;
        
        // 1. Fibonacci Sphere Generation (The most mathematically honest spherical distribution)
        const points: [number, number][] = [];
        const TOTAL_POINTS = 14000;
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        
        for (let i = 0; i < TOTAL_POINTS; i++) {
          const z = 1 - (i / (TOTAL_POINTS - 1)) * 2;
          const radius = Math.sqrt(1 - z * z);
          const theta = 2 * Math.PI * i / goldenRatio;
          const x = Math.cos(theta) * radius;
          const y = Math.sin(theta) * radius;
          
          const lat = Math.asin(z) * (180 / Math.PI);
          const lon = Math.atan2(y, x) * (180 / Math.PI);
          
          // Filter to only points that land on the geometry
          for (const feat of feats.features) {
            if (d3.geoContains(feat as any, [lon, lat])) {
              points.push([lon, lat]);
              break;
            }
          }
        }
        
        // 2. Delaunay Triangulation on the Fibonacci points
        const delaunay = d3.Delaunay.from(points);
        const { triangles } = delaunay;
        
        const features: any[] = [];
        // Max edge distance prevents ocean crossing
        // Distance roughly matches the spacing of 14,000 points on a sphere
        const MAX_DIST_SQ = 6.0 ** 2; 
        
        for (let i = 0; i < triangles.length; i += 3) {
          const p0 = points[triangles[i]];
          const p1 = points[triangles[i+1]];
          const p2 = points[triangles[i+2]];
          
          const dist2 = (a: number[], b: number[]) => (a[0]-b[0])**2 + (a[1]-b[1])**2;
          if (dist2(p0, p1) < MAX_DIST_SQ && dist2(p1, p2) < MAX_DIST_SQ && dist2(p2, p0) < MAX_DIST_SQ) {
            features.push({
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [[ p0, p1, p2, p0 ]] },
              properties: {}
            });
          }
        }
        
        meshDataRef.current = { type: "FeatureCollection", features };
        pointsDataRef.current = { type: "MultiPoint", coordinates: points };
        setIsLoading(false);
      })
      .catch(console.error);
    return () => { isMounted = false; };
  }, []);

  const updateDimensions = useCallback(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    
    physics.current.width = width;
    physics.current.height = height;
    physics.current.dpr = dpr;
    canvasRef.current.width = width * dpr;
    canvasRef.current.height = height * dpr;
  }, []);

  useEffect(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [updateDimensions]);

  useEffect(() => {
    let frameId: number;
    
    const render = () => {
      const p = physics.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { alpha: false });
      if (!ctx || p.width === 0 || p.height === 0 || !meshDataRef.current) {
        frameId = requestAnimationFrame(render);
        return;
      }

      if (!p.isDragging) {
        if (Math.abs(p.vLon) > 0.001 || Math.abs(p.vLat) > 0.001) {
          p.lon += p.vLon;
          p.lat = Math.max(-60, Math.min(60, p.lat + p.vLat));
          p.vLon *= 0.94;
          p.vLat *= 0.94;
        } else {
          p.lon += 0.2 * (1 - alpha * 0.95);
        }
      }

      ctx.save();
      ctx.scale(p.dpr, p.dpr);
      const bgGrad = ctx.createRadialGradient(p.width * 0.5, p.height * 0.5, 0, p.width * 0.5, p.height * 0.5, Math.max(p.width, p.height));
      bgGrad.addColorStop(0, COLORS.SPACE_BG);
      bgGrad.addColorStop(1, '#000000');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, p.width, p.height);

      const cx = p.width / 2;
      const cy = p.height / 2;
      const globeRadius = Math.min(p.width, p.height) * 0.38;
      const mapScale = (p.width * 0.44) / Math.PI;
      const scale = (1 - alpha) * globeRadius + alpha * mapScale;

      morphMutator(alpha);
      sharedProj.scale(scale).translate([cx, cy]).rotate([p.lon, p.lat * (1 - alpha), 0]);

      const clipAngle = 90 + alpha * 90;
      sharedProj.preclip((stream: any) => {
        let s = stream;
        if (alpha > 0.001) s = d3.geoClipAntimeridian(s);
        return d3.geoClipCircle(clipAngle * Math.PI / 180)(s);
      });

      sharedPath.context(ctx);

      // Sphere Base
      ctx.beginPath();
      sharedPath(sphere);
      ctx.fillStyle = COLORS.OCEAN_BG;
      ctx.fill();
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.15 + alpha * 0.20})`;
      ctx.lineWidth = 1.0;
      ctx.shadowColor = COLORS.SPHERE_GLOW;
      ctx.shadowBlur = (1 - alpha * 0.5) * 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Graticules
      ctx.beginPath();
      sharedPath(graticule);
      ctx.strokeStyle = COLORS.GRATICULE;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // The Geometric Connections (Subtle)
      ctx.beginPath();
      sharedPath(meshDataRef.current);
      ctx.strokeStyle = COLORS.MESH;
      ctx.lineWidth = 0.4;
      ctx.stroke();
      
      // The Fibonacci Point Cloud (Prominent)
      ctx.beginPath();
      sharedPath.pointRadius(1.2);
      sharedPath(pointsDataRef.current);
      ctx.fillStyle = COLORS.DOT;
      ctx.fill();

      ctx.restore();
      frameId = requestAnimationFrame(render);
    };
    
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [alpha]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    physics.current.isDragging = true;
    physics.current.lastX = e.clientX;
    physics.current.lastY = e.clientY;
    physics.current.lastTime = performance.now();
    physics.current.vLon = 0;
    physics.current.vLat = 0;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = physics.current;
    if (!p.isDragging) return;
    const now = performance.now();
    const dt = Math.max(now - p.lastTime, 1);
    const dx = e.clientX - p.lastX;
    const dy = e.clientY - p.lastY;
    
    const sens = alpha > 0.5 ? 0.25 : 0.40;
    p.lon += dx * sens;
    p.lat = Math.max(-60, Math.min(60, p.lat - dy * sens));
    p.vLon = (dx / dt) * 3;
    p.vLat = (-dy / dt) * 3;
    
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    p.lastTime = now;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (canvasRef.current && canvasRef.current.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    physics.current.isDragging = false;
  };

  return (
    <div className="relative w-full h-full flex flex-col font-mono bg-[#020408] overflow-hidden">
      <div ref={containerRef} className="w-full h-full relative cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="absolute inset-0 w-full h-full touch-none block"
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-zinc-400 text-xs tracking-widest uppercase">
            Calculating Fibonacci Distribution...
          </div>
        )}
      </div>
      <div className="absolute bottom-10 inset-x-0 flex justify-center z-10 pointer-events-none">
        <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-black/60 border border-sky-500/20 backdrop-blur-xl shadow-2xl pointer-events-auto">
          <span className="text-[10px] text-sky-500/70 font-bold uppercase tracking-widest">Sphere</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.005"
            value={alpha}
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            className="w-48 sm:w-64 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
          <span className="text-[10px] text-sky-500/70 font-bold uppercase tracking-widest">Map</span>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen">
      <GlobeVisualization />
    </div>
  );
};

export default App;
