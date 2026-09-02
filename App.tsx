import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const RADIUS = 5.0;

const vertexShader = `
uniform float u_unfurl;
attribute vec2 target2D;
attribute float vType; // 1.0 = Geographic, 0.0 = Structural
varying float vPointType;
varying float vFacing;

void main() {
    vPointType = vType;
    vec3 pos3D = position;
    vec3 pos2D = vec3(target2D.x, target2D.y, 0.0);
    float ease = u_unfurl < 0.5 ? 4.0 * u_unfurl * u_unfurl * u_unfurl : 1.0 - pow(-2.0 * u_unfurl + 2.0, 3.0) / 2.0;
    vec3 finalPos = mix(pos3D, pos2D, ease);
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = mix(2.0, 3.0, vType); 
    
    vec3 normal = normalize(pos3D);
    vec3 viewNormal = normalize(normalMatrix * normal);
    vec3 viewDir = -normalize(mvPosition.xyz);
    float facing = dot(viewNormal, viewDir);
    
    // When morphing to map, everything becomes fully front-facing
    vFacing = mix(facing, 1.0, ease);
}
`;

const pointFragmentShader = `
varying float vPointType;
varying float vFacing;
void main() {
    float backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, vFacing));
    vec3 geographicColor = vec3(0.49, 0.827, 0.988);
    vec3 structuralColor = vec3(0.05, 0.15, 0.25);
    vec3 color = mix(structuralColor, geographicColor, vPointType);
    float alpha = mix(0.15, 1.0, vPointType);
    gl_FragColor = vec4(color, alpha * backfaceDimming);
}
`;

const meshFragmentShader = `
varying float vPointType;
varying float vFacing;
void main() {
    float backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, vFacing));
    vec3 geographicColor = vec3(0.22, 0.74, 0.97) * 0.8;
    vec3 structuralColor = vec3(0.02, 0.1, 0.2) * 0.3;
    vec3 color = mix(structuralColor, geographicColor, vPointType);
    
    float alpha = mix(0.08, 0.9, pow(vPointType, 2.0));
    gl_FragColor = vec4(color, alpha * backfaceDimming);
}
`;

const GeometryLayer: React.FC<{ unfurlProgress: number }> = ({ unfurlProgress }) => {
  const meshMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const pointMaterialRef = useRef<THREE.ShaderMaterial>(null);
  
  const [geoData, setGeoData] = useState<{ 
    pointsBuffer: Float32Array; 
    target2DBuffer: Float32Array; 
    typeBuffer: Float32Array;
    lineIndices: Uint32Array;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const cacheBuster = import.meta.env.DEV ? '?v=' + Date.now() : '';
    fetch('/geo-mesh-100k.json' + cacheBuster)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        setGeoData({ 
            pointsBuffer: new Float32Array(data.pointsBuffer), 
            target2DBuffer: new Float32Array(data.target2DBuffer), 
            typeBuffer: new Float32Array(data.typeBuffer),
            lineIndices: new Uint32Array(data.lineIndices)
        });
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
    geo.setAttribute('vType', new THREE.BufferAttribute(geoData.typeBuffer, 1));
    geo.setIndex(new THREE.BufferAttribute(geoData.lineIndices, 1));
    return geo;
  }, [geoData]);

  if (!geometry) return null;

  return (
    <group>
      <lineSegments geometry={geometry}>
        <shaderMaterial ref={meshMaterialRef} vertexShader={vertexShader} fragmentShader={meshFragmentShader} transparent={true} depthTest={false} uniforms={{ u_unfurl: { value: 0 } }} />
      </lineSegments>
      <points geometry={geometry}>
        <shaderMaterial ref={pointMaterialRef} vertexShader={vertexShader} fragmentShader={pointFragmentShader} transparent={true} depthTest={false} uniforms={{ u_unfurl: { value: 0 } }} />
      </points>
    </group>
  );
};



export default function App() {
  const [alpha, setAlpha] = useState(0); window.setAlpha = setAlpha;

  return (
    <div className="relative w-screen h-screen flex flex-col font-mono bg-[#020408] overflow-hidden">
      <div className="w-full h-full relative">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <React.Suspense fallback={null}>
            <GeometryLayer unfurlProgress={alpha} />
                      </React.Suspense>
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} autoRotate={alpha < 0.01} autoRotateSpeed={0.5} />
        </Canvas>
      </div>

      <div className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-2 z-10 pointer-events-none">
        <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-black/60 border border-sky-500/20 backdrop-blur-xl shadow-2xl pointer-events-auto">
           <span className="text-[10px] text-sky-500/70 font-bold uppercase tracking-widest">Unified Field</span>
           <input type="range" min="0" max="1" step="0.001" value={alpha} onChange={(e) => setAlpha(parseFloat(e.target.value))} className="w-48 sm:w-64 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-400" />
           <span className="text-[10px] text-sky-500/70 font-bold uppercase tracking-widest">Map</span>
        </div>
      </div>
    </div>
  );
}
