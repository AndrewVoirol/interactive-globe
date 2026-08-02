import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { FeatureCollection, WorldAtlas } from './types';
import type { GeoProjection } from 'd3';

const COLORS = {
    LAND: "#c8d6e5",
    OCEAN: "#0a0e17",
    GRATICULE: "rgba(100, 130, 180, 0.12)",
    STROKE: "rgba(10, 14, 23, 0.6)",
    OUTLINE: "rgba(100, 140, 200, 0.25)"
};

const GlobeVisualization: React.FC = () => {
    const [isGlobe, setIsGlobe] = useState(true);
    const [isAnimating, setIsAnimating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const globeProjectionRef = useRef<d3.GeoProjection | null>(null);
    const flatProjectionRef = useRef<d3.GeoProjection | null>(null);
    const customInterpolatorRef = useRef<any>(null);
    const pathGeneratorRef = useRef<d3.GeoPath<any, d3.GeoPermissibleObjects> | null>(null);
    const animationTimerRef = useRef<d3.Timer | null>(null);
    const countriesRef = useRef<FeatureCollection | null>(null);
    const graticuleRef = useRef<d3.GeoGraticuleGenerator | null>(null);
    const isDrawingThrottledRef = useRef(false);

    // Ref to hold the latest state for D3 handlers to prevent stale closures
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const stateRef = useRef({ isGlobe, isAnimating, dimensions });
    useEffect(() => {
        stateRef.current = { isGlobe, isAnimating, dimensions };
    }, [isGlobe, isAnimating, dimensions]);

    const setSize = useCallback(() => {
        if (canvasContainerRef.current) {
            const width = canvasContainerRef.current.clientWidth;
            const height = width * 0.55;
            setDimensions({ width, height });
        }
    }, []);
    
    useEffect(() => {
        setSize();
        window.addEventListener('resize', setSize);
        return () => window.removeEventListener('resize', setSize);
    }, [setSize]);

    const draw = useCallback((projOverride?: GeoProjection) => {
        if (!contextRef.current || !countriesRef.current || !graticuleRef.current || !pathGeneratorRef.current || !globeProjectionRef.current) return;
        
        const context = contextRef.current;
        const { width, height } = dimensions;

        const currentProjection = projOverride || (isGlobe ? globeProjectionRef.current : flatProjectionRef.current);
        if(!currentProjection) return;

        pathGeneratorRef.current.projection(currentProjection);
        context.clearRect(0, 0, width, height);

        context.fillStyle = COLORS.OCEAN;
        context.fillRect(0, 0, width, height);
        
        const t = customInterpolatorRef.current?.t ?? (isGlobe ? 0 : 1);
        const sphereAlpha = 1 - t;

        if (sphereAlpha > 0.01) {
            context.globalAlpha = sphereAlpha;
            context.beginPath();
            const spherePath = d3.geoPath(globeProjectionRef.current, context);
            spherePath({type: "Sphere"});
            context.fillStyle = COLORS.OCEAN;
            context.fill();
            context.strokeStyle = COLORS.OUTLINE;
            context.lineWidth = 1.5;
            context.stroke();
            context.globalAlpha = 1;
        }

        context.beginPath();
        pathGeneratorRef.current(graticuleRef.current());
        context.strokeStyle = COLORS.GRATICULE;
        context.lineWidth = 0.5;
        context.stroke();

        context.beginPath();
        pathGeneratorRef.current(countriesRef.current);
        context.fillStyle = COLORS.LAND;
        context.fill();
        context.strokeStyle = COLORS.STROKE;
        context.lineWidth = 0.4;
        context.stroke();
    }, [isGlobe, dimensions]);
    
    const drawRef = useRef(draw);
    useEffect(() => {
        drawRef.current = draw;
    });

    const stopAutoRotation = useCallback(() => {
        if (animationTimerRef.current) {
            animationTimerRef.current.stop();
            animationTimerRef.current = null;
        }
    }, []);

    const startAutoRotation = useCallback(() => {
        stopAutoRotation();
        animationTimerRef.current = d3.timer(elapsed => {
            if (globeProjectionRef.current) {
                const rotate = globeProjectionRef.current.rotate();
                const speed = 0.015;
                const lastTime = (animationTimerRef.current as any).lastTime || elapsed;
                globeProjectionRef.current.rotate([rotate[0] + speed * (elapsed - lastTime), rotate[1], rotate[2]]);
                (animationTimerRef.current as any).lastTime = elapsed;
                draw();
            }
        });
    }, [draw, stopAutoRotation]);

    useEffect(() => {
        if (isGlobe && !isAnimating) {
            startAutoRotation();
        } else {
            stopAutoRotation();
        }
        return () => stopAutoRotation();
    }, [isGlobe, isAnimating, startAutoRotation, stopAutoRotation]);

    useEffect(() => {
        if (!canvasRef.current || !canvasContainerRef.current) return;
        
        contextRef.current = canvasRef.current.getContext('2d');
        globeProjectionRef.current = d3.geoOrthographic();
        flatProjectionRef.current = d3.geoEquirectangular();
        pathGeneratorRef.current = d3.geoPath(globeProjectionRef.current, contextRef.current);

        const CustomInterpolator = function(this: any, source: GeoProjection, target: GeoProjection) {
            this.t = 0;
            this.source = source;
            this.target = target;
            
            this.projection = d3.geoProjection(function(this: any, lon_rad: number, lat_rad: number) {
                const lon_deg = lon_rad * 180 / Math.PI;
                const lat_deg = lat_rad * 180 / Math.PI;
        
                const p1 = this.target([lon_deg, lat_deg]);
                const p0 = this.source([lon_deg, lat_deg]);
        
                if (p0) { // Point is visible on the front
                    return [
                        (1 - this.t) * p0[0] + this.t * p1[0],
                        (1 - this.t) * p0[1] + this.t * p1[1],
                    ];
                }
        
                // Point is on the back, calculate its "unfurling" path
                const [lon_center_deg, lat_center_deg] = this.source.rotate();
                
                const back_rotation: [number, number, number] = [lon_center_deg + 180, -lat_center_deg, 0];
                const back_projection = d3.geoOrthographic()
                    .scale(this.source.scale())
                    .translate(this.source.translate())
                    .rotate(back_rotation);
        
                const p0_back = back_projection([lon_deg, lat_deg]);
        
                if (!p0_back) {
                    return p1; // Fallback, should rarely be hit with this logic
                }
                
                let relative_lon = lon_deg - (-lon_center_deg);
                relative_lon = (relative_lon + 540) % 360 - 180;
                const sign = Math.sign(relative_lon) || 1;
        
                const canvas_center = this.source.translate();
                const globe_radius = this.source.scale();
        
                const y_relative = p0_back[1] - canvas_center[1];
                
                const radius_squared = globe_radius * globe_radius;
                const y_squared = y_relative * y_relative;
                const x_offset = (radius_squared > y_squared) ? Math.sqrt(radius_squared - y_squared) : 0;
                
                const p0_start_x = canvas_center[0] + sign * x_offset;
                const p0_start_y = p0_back[1];
                
                const p0_start = [p0_start_x, p0_start_y];
        
                return [
                    (1 - this.t) * p0_start[0] + this.t * p1[0],
                    (1 - this.t) * p0_start[1] + this.t * p1[1],
                ];
        
            }.bind(this));
        
            this.stream = (s: any) => this.projection.stream(s);
        };
        
        customInterpolatorRef.current = new (CustomInterpolator as any)(globeProjectionRef.current, flatProjectionRef.current);

        const requestThrottledDraw = () => {
            if (isDrawingThrottledRef.current) return;
            isDrawingThrottledRef.current = true;
            window.requestAnimationFrame(() => {
                drawRef.current();
                isDrawingThrottledRef.current = false;
            });
        };

        const drag = d3.drag()
            .on("start", stopAutoRotation)
            .on("drag", (event) => {
                if (stateRef.current.isAnimating || !stateRef.current.isGlobe || !globeProjectionRef.current) return;
                const rotate = globeProjectionRef.current.rotate();
                const k = 0.5;
                globeProjectionRef.current.rotate([
                    rotate[0] + event.dx * k,
                    Math.max(-90, Math.min(90, rotate[1] - event.dy * k)),
                    rotate[2]
                ]);
                requestThrottledDraw();
            });

        const zoom = d3.zoom()
            .scaleExtent([0.7, 12])
            .on("start", stopAutoRotation)
            .on("zoom", event => {
                if (stateRef.current.isAnimating || !stateRef.current.isGlobe || !globeProjectionRef.current) return;
                const baseScale = stateRef.current.dimensions.height / 2.1;
                globeProjectionRef.current.scale(baseScale * event.transform.k);
                requestThrottledDraw();
            });

        const canvasSelection = d3.select(canvasRef.current);
        canvasSelection.call(drag as any).call(zoom as any);
        canvasSelection.on("wheel.zoom", null);
        
        d3.json<WorldAtlas>("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json").then((data) => {
            if (data) {
                countriesRef.current = topojson.feature(data, data.objects.countries) as FeatureCollection;
                graticuleRef.current = d3.geoGraticule();
                setIsLoading(false);
                draw();
            }
        }).catch(error => console.error("Error loading world data:", error));

        return () => {
          stopAutoRotation();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!globeProjectionRef.current || !flatProjectionRef.current || dimensions.width === 0) return;
        const { width, height } = dimensions;
        const globeScale = height / 2.1;

        globeProjectionRef.current
            .scale(globeScale)
            .translate([width / 2, height / 2])
            .clipAngle(90);

        flatProjectionRef.current
            .scale(width / (2 * Math.PI) * 0.95)
            .translate([width / 2, height / 2]);
        
        draw();
    }, [dimensions, draw]);
    
    const handleToggle = () => {
        if (isAnimating || !globeProjectionRef.current || !flatProjectionRef.current) return;
        
        setIsAnimating(true);

        const currentRotate = globeProjectionRef.current.rotate();
        flatProjectionRef.current.rotate([-currentRotate[0], -currentRotate[1], -currentRotate[2]]);
        
        const targetT = isGlobe ? 1 : 0;

        d3.transition()
            .duration(800)
            .ease(d3.easeCubicInOut)
            .tween("projection", () => {
                const i = d3.interpolate(customInterpolatorRef.current.t, targetT);
                return (t: number) => {
                    customInterpolatorRef.current.t = i(t);
                    draw(customInterpolatorRef.current.projection);
                };
            })
            .on("end", () => {
                setIsGlobe(prev => !prev);
                setIsAnimating(false);
            });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen w-screen font-sans overflow-hidden p-4 md:p-8"
             style={{ background: 'linear-gradient(145deg, #0d1117 0%, #161b22 50%, #0d1117 100%)' }}>
            <h1 className="text-white text-2xl md:text-3xl font-bold mb-6 tracking-tight opacity-90">
                Interactive Globe
            </h1>
            <div ref={canvasContainerRef} className="canvas-container w-full max-w-5xl relative">
                <canvas 
                    ref={canvasRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    className="block w-full h-auto cursor-move rounded-xl"
                />
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl"
                         style={{ background: COLORS.OCEAN }}>
                        <div className="flex flex-col items-center gap-4">
                            <div className="loading-spinner"></div>
                            <span className="text-white text-sm opacity-50 tracking-wide">Loading world data…</span>
                        </div>
                    </div>
                )}
                <button 
                    id="toggle"
                    onClick={handleToggle}
                    disabled={isAnimating || isLoading}
                    className="toggle-btn"
                >
                    {isAnimating ? 'Transitioning…' : `Toggle to ${isGlobe ? 'Map' : 'Globe'}`}
                </button>
            </div>
            <p className="mt-4 text-sm opacity-30 text-white">
                Drag to rotate · Scroll to zoom · Click toggle to switch view
            </p>
        </div>
    );
};

const App: React.FC = () => {
  return <GlobeVisualization />;
};

export default App;
