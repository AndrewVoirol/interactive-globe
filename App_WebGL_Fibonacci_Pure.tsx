import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';
import { geoDelaunay } from 'd3-geo-voronoi';
import type { FeatureCollection, WorldAtlas } from './types';

// The Mathematical First Principles GPU Morphing Dot Matrix
const RADIUS = 5.0;

const vertexShader = `
uniform float u_unfurl;
attribute vec2 target2D;

void main() {
    vec3 pos3D = position;
    vec3 pos2D = vec3(target2D.x, target2D.y, 0.0);
    
    // Cubic ease for smooth mechanical morph
    float ease = u_unfurl < 0.5 ? 4.0 * u_unfurl * u_unfurl * u_unfurl : 1.0 - pow(-2.0 * u_unfurl + 2.0, 3.0) / 2.0;
    
    vec3 finalPos = mix(pos3D, pos2D, ease);
    
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = 2.5;
}
`;

const fragmentShader = `
uniform vec3 u_color;
void main() {
    gl_FragColor = vec4(u_color, 1.0);
}
`;

const GeometryLayer: React.FC<{ unfurlProgress: number }> = ({ unfurlProgress }) => {
  const meshMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const pointMaterialRef = useRef<THREE.ShaderMaterial>(null);
  
  const [geoData, setGeoData] = useState<{ 
    pointsBuffer: Float32Array; 
    target2DBuffer: Float32Array; 
    lineIndices: Uint32Array 
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json')
      .then((res) => res.json())
      .then((data: WorldAtlas) => {
        if (!isMounted) return;
        const feats = topojson.feature(data as any, data.objects.countries) as unknown as FeatureCollection;
        
        const TOTAL_POINTS = 15000;
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const validPoints: [number, number][] = [];
        
        for (let i = 0; i < TOTAL_POINTS; i++) {
          const z = 1 - (i / (TOTAL_POINTS - 1)) * 2;
          const r = Math.sqrt(1 - z * z);
          const theta = 2 * Math.PI * i / goldenRatio;
          const x = Math.cos(theta) * r;
          const y = Math.sin(theta) * r;
          
          const lat = Math.asin(z) * (180 / Math.PI);
          const lon = Math.atan2(y, x) * (180 / Math.PI);
          
          let onLand = false;
          for (const feat of feats.features) {
            if (d3.geoContains(feat as any, [lon, lat])) {
              onLand = true;
              break;
            }
          }
          if (onLand) validPoints.push([lon, lat]);
        }

        // True Spherical Delaunay
        const delaunay = geoDelaunay(validPoints);
        const triangles = delaunay.triangles;
        
        const pointsBuffer = new Float32Array(validPoints.length * 3);
        const target2DBuffer = new Float32Array(validPoints.length * 2);
        
        for (let i = 0; i < validPoints.length; i++) {
            const lon = validPoints[i][0];
            const lat = validPoints[i][1];
            
            const lambda = lon * (Math.PI / 180);
            const phi = lat * (Math.PI / 180);
            
            // 3D Spherical Position
            pointsBuffer[i*3 + 0] = -RADIUS * Math.cos(phi) * Math.sin(lambda);
            pointsBuffer[i*3 + 1] = RADIUS * Math.sin(phi);
            pointsBuffer[i*3 + 2] = RADIUS * Math.cos(phi) * Math.cos(lambda);
            
            // 2D Equirectangular Target
            target2DBuffer[i*2 + 0] = lambda * RADIUS;
            target2DBuffer[i*2 + 1] = phi * RADIUS;
        }

        // Generate unique Line Segments and sever antimeridian crossing
        const lineEdges = new Set<string>();
        const addEdge = (a: number, b: number) => {
            if (Math.abs(validPoints[a][0] - validPoints[b][0]) > 90) return; // Prevent horizontal tearing
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            lineEdges.add(key);
        };
        
        // Prevent huge triangles spanning oceans
        const maxArcDist = 5.0; // degrees
        
        for (let i = 0; i < triangles.length; i++) {
            const t = triangles[i];
            const p0 = validPoints[t[0]];
            const p1 = validPoints[t[1]];
            const p2 = validPoints[t[2]];
            
            const distSq = (a: number[], b: number[]) => (a[0]-b[0])**2 + (a[1]-b[1])**2;
            if (distSq(p0, p1) < maxArcDist**2 && distSq(p1, p2) < maxArcDist**2 && distSq(p2, p0) < maxArcDist**2) {
                addEdge(t[0], t[1]);
                addEdge(t[1], t[2]);
                addEdge(t[2], t[0]);
            }
        }
        
        const lineIndices = new Uint32Array(lineEdges.size * 2);
        let idx = 0;
        lineEdges.forEach(key => {
            const [a, b] = key.split('-').map(Number);
            lineIndices[idx++] = a;
            lineIndices[idx++] = b;
        });

        setGeoData({ pointsBuffer, target2DBuffer, lineIndices });
      })
      .catch(console.error);
    return () => { isMounted = false; };
  }, []);

  useFrame(() => {
    if (meshMaterialRef.current && pointMaterialRef.current) {
      meshMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      pointMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;
    }
  });

  const geometry = useMemo(() => {
    if (!geoData) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(geoData.pointsBuffer, 3));
    geo.setAttribute('target2D', new THREE.BufferAttribute(geoData.target2DBuffer, 2));
    geo.setIndex(new THREE.BufferAttribute(geoData.lineIndices, 1));
    return geo;
  }, [geoData]);

  if (!geometry) return null;

  return (
    <group>
      <lineSegments geometry={geometry}>
        <shaderMaterial
          ref={meshMaterialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent={true}
          uniforms={{
            u_unfurl: { value: 0 },
            u_color: { value: new THREE.Color('#38bdf8').multiplyScalar(0.2) } // mesh color
          }}
        />
      </lineSegments>
      <points geometry={geometry}>
        <shaderMaterial
          ref={pointMaterialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent={true}
          uniforms={{
            u_unfurl: { value: 0 },
            u_color: { value: new THREE.Color('#7dd3fc') } // dot color
          }}
        />
      </points>
    </group>
  );
};

export const GlobeVisualization: React.FC = () => {
  const [alpha, setAlpha] = useState(0);

  return (
    <div className="relative w-full h-full flex flex-col font-mono bg-[#020408] overflow-hidden">
      <div className="w-full h-full relative">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <ambientLight intensity={1.0} />
          <React.Suspense fallback={null}>
            <GeometryLayer unfurlProgress={alpha} />
          </React.Suspense>
          <OrbitControls 
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true}
            autoRotate={alpha < 0.01}
            autoRotateSpeed={0.5}
          />
        </Canvas>
      </div>

      <div className="absolute bottom-10 inset-x-0 flex justify-center z-10 pointer-events-none">
        <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-black/60 border border-sky-500/20 backdrop-blur-xl shadow-2xl pointer-events-auto">
          <span className="text-[10px] text-sky-500/70 font-bold uppercase tracking-widest">Sphere</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
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
