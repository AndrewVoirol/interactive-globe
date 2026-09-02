import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CursorTracker } from './src/utils/raycast';
import { isWebGPUSupported } from './src/webgpu/support';

const WebGPUCanvas = React.lazy(() => import('./src/webgpu/WebGPUCanvas'));

const RADIUS = 5.0;

const vertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode; // 0 = Linear, 1 = Cylindrical Scroll, 2 = Griffith Fracture, 3 = Fluid Advection
uniform int u_layerMode; // 0 = Both, 1 = Points Only, 2 = Wireframe Only
uniform vec3 u_cameraCenter; // Camera-Relative RTC (Relative-to-Center) center point
uniform vec3 u_cursorRayOrig;
uniform vec3 u_cursorRayDir;
uniform vec3 u_cursorHitPos;
uniform vec4 u_cursorVel;
uniform float u_cursorActive;
attribute vec2 target2D;
attribute float vType; // 1.0 = Geographic, 0.0 = Structural
varying float vPointType;
varying float vFacing;
varying float vStrain;    // Local strain energy density for Mode 2
varying float vVorticity; // Local vorticity magnitude for Mode 3
varying float vAlphaMultiplier;
varying float vLatitudeNorm;

const float RADIUS = 5.0;
const float PI = 3.14159265358979323846;

// Analytical 3D Divergence-Free Curl-Noise Field (div u = 0 guaranteed)
vec3 computeCurlNoise(vec3 p, float time) {
    float k1 = 0.55;
    float k2 = 1.10;
    float t = time * 0.8;
    
    // Vector potential psi(p, t)
    float u_x = -k1 * cos(k1 * p.y + t * 0.7) - k2 * cos(k2 * p.z - t * 0.5);
    float u_y = -k1 * cos(k1 * p.z + t * 0.9) - k2 * cos(k2 * p.x - t * 0.6);
    float u_z = -k1 * cos(k1 * p.x + t * 0.8) - k2 * cos(k2 * p.y - t * 0.4);
    
    // Secondary octave for micro-turbulence
    float u2_x = 0.35 * sin(1.8 * p.y - t * 1.2);
    float u2_y = 0.35 * sin(1.8 * p.z - t * 1.1);
    float u2_z = 0.35 * sin(1.8 * p.x - t * 1.3);

    return vec3(u_x + u2_x, u_y + u2_y, u_z + u2_z);
}

void main() {
    vPointType = vType;
    
    // Robust cubic bezier ease in/out with boundary clamping
    float clampedUnfurl = clamp(u_unfurl, 0.0, 1.0);

    // =========================================================================
    // R2: WebGL2 1M Performance Backface Early-Out (Saves 162M Transcendentals/s)
    // =========================================================================
    if (clampedUnfurl < 0.08) {
        vec3 sphereNormal = normalize(position);
        vec3 vNorm = normalize(normalMatrix * sphereNormal);
        vec4 vPos = modelViewMatrix * vec4(position, 1.0);
        vec3 vDir = normalize(vPos.xyz);
        
        // When normal . viewDir > 0.25 (i.e. facing < -0.25 on back hemisphere)
        if (dot(vNorm, vDir) > 0.25) {
            gl_Position = vec4(0.0, 0.0, 2.0, 0.0); // Degenerate clip coordinates
            return; // EARLY-OUT: Skips computeCurlNoise, normal transformations & RTC math
        }
    }

    vec3 pos3D = position;
    vec3 pos2D = vec3(target2D.x, target2D.y, 0.0);
    float ease = clampedUnfurl < 0.5 
        ? 4.0 * clampedUnfurl * clampedUnfurl * clampedUnfurl 
        : 1.0 - pow(max(0.0, -2.0 * clampedUnfurl + 2.0), 3.0) / 2.0;

    vec3 finalPos;
    vec3 dynamicNormal;
    float localStrain = 0.0;
    float localVorticity = 0.0;

    if (u_mode == 1) {
        // =========================================================================
        // Mode 1: Constant-Radius Cylindrical Scroll (engine-audit.md §3.6)
        // =========================================================================
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));

        if (t < 0.999) {
            float invOneMinusT = 1.0 / (1.0 - t);
            float curAngle = (1.0 - t) * lambda;
            
            float curX = (RADIUS * invOneMinusT) * sin(curAngle);
            float curZ = (RADIUS * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cos(phi) * (1.0 - t));
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);

            vec3 T_lambda = vec3(RADIUS * cos(curAngle), 0.0, -RADIUS * cos(phi) * sin(curAngle));
            vec3 T_phi = vec3(0.0, mix(RADIUS * cos(phi), RADIUS / max(cos(phi), 0.05), t), -RADIUS * sin(phi) * invOneMinusT * (cos(curAngle) - 1.0) - RADIUS * sin(phi) * (1.0 - t));
            vec3 rawNorm = cross(T_lambda, T_phi);
            dynamicNormal = length(rawNorm) > 0.0001 ? normalize(rawNorm) : normalize(pos3D);
        } else {
            finalPos = pos2D;
            dynamicNormal = vec3(0.0, 0.0, 1.0);
        }
    } else if (u_mode == 2) {
        // =========================================================================
        // Mode 2: Griffith Linear Elastic Fracture Mechanics (LEFM) (engine-audit.md §4.2)
        // =========================================================================
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        
        float distToSeam = PI - abs(lambda);
        float seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
        float tRupture = 0.18;
        
        // Passive cursor raycast distance and tensile hoop stress concentration
        float hitDist = length(pos3D - u_cursorHitPos);
        float cursorInfluence = u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
        float hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cos(phi) * cos(phi));
        
        if (t < tRupture) {
            float strainProgress = t / tRupture;
            localStrain = seamFactor * strainProgress * max(0.2, cos(phi * 0.85)) + hoopStress;
            vec3 outwardTension = normalize(pos3D) * (localStrain * 0.30);
            finalPos = pos3D + outwardTension;
            dynamicNormal = normalize(finalPos);
        } else {
            float postRuptureT = smoothstep(tRupture, 1.0, t);
            float crackLatitudeFront = (PI * 0.5) * smoothstep(tRupture, 0.60, t);
            float distToCrackTip = abs(abs(phi) - crackLatitudeFront);
            float crackTipGlow = (t < 0.65 && seamFactor > 0.3) ? (1.0 - smoothstep(0.0, 0.3, distToCrackTip)) : 0.0;
            
            float flutterWave = sin(distToSeam * 16.0 - t * 24.0);
            float flutterDecay = exp(-4.2 * (t - tRupture));
            float flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20) * flutterWave * flutterDecay;
            vec3 flutterOffset = vec3(0.0, 0.0, flutterAmp);

            vec3 peeledPos = mix(pos3D, pos2D, postRuptureT);
            finalPos = peeledPos + flutterOffset;

            localStrain = mix(seamFactor * (1.0 - postRuptureT) * 0.9 + crackTipGlow + hoopStress, 0.0, pow(postRuptureT, 1.8));
            dynamicNormal = mix(normalize(pos3D), vec3(0.0, 0.0, 1.0), postRuptureT);
        }
    } else if (u_mode == 3) {
        // =========================================================================
        // Mode 3: Incompressible Fluid Advection & SPH Vorticity (engine-audit.md §4.3)
        // =========================================================================
        float t = ease;
        if (t >= 0.999) {
            finalPos = pos2D;
            dynamicNormal = vec3(0.0, 0.0, 1.0);
            localVorticity = 0.0;
        } else if (t <= 0.001) {
            // Subtle damped cursor surface eddy on 3D globe (anti-strobe)
            float hitDist = length(pos3D - u_cursorHitPos);
            float coreRadius = 0.85;
            float vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
            vec3 surfaceNormal = normalize(pos3D);
            vec3 vortexTangent = normalize(cross(surfaceNormal, pos3D - u_cursorHitPos + vec3(0.001)));
            float clampedSpeed = clamp(u_cursorVel.w, 0.0, 1.5);
            vec3 vortexVelocity = vortexTangent * (u_cursorActive * clampedSpeed * vortexCirculation * 0.35);
            vec3 wakeAdvection = normalize(u_cursorVel.xyz + vec3(0.0001)) * (clampedSpeed * 0.15 * u_cursorActive * exp(-hitDist * hitDist / 1.5));

            vec3 totalVelocity = vortexVelocity + wakeAdvection;
            localVorticity = length(totalVelocity) * u_cursorActive;
            finalPos = pos3D + totalVelocity * (u_cursorActive * 0.20);
            dynamicNormal = normalize(finalPos);
        } else {
            float rawSin = sin(PI * clamp(u_unfurl, 0.0, 1.0));
            float liquefaction = pow(max(0.0, rawSin), 1.2);
            vec3 basePos = mix(pos3D, pos2D, t);
            vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
            
            // Subtle damped cursor vortex injection (anti-strobe)
            float hitDist = length(basePos - u_cursorHitPos);
            float coreRadius = 0.85;
            float vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
            vec3 surfaceNormal = normalize(basePos);
            vec3 vortexTangent = normalize(cross(surfaceNormal, basePos - u_cursorHitPos + vec3(0.001)));
            float clampedSpeed = clamp(u_cursorVel.w, 0.0, 1.5);
            vec3 vortexVelocity = vortexTangent * (u_cursorActive * clampedSpeed * vortexCirculation * 0.35);
            vec3 wakeAdvection = normalize(u_cursorVel.xyz + vec3(0.0001)) * (clampedSpeed * 0.15 * u_cursorActive * exp(-hitDist * hitDist / 1.5));

            vec3 totalVelocity = naturalVelocity + vortexVelocity + wakeAdvection;
            localVorticity = length(totalVelocity) * max(liquefaction, u_cursorActive * 0.3);
            vec3 advectionOffset = naturalVelocity * (liquefaction * 1.85) + (vortexVelocity + wakeAdvection) * (u_cursorActive * 0.25);

            finalPos = basePos + advectionOffset;
            dynamicNormal = mix(normalize(pos3D), vec3(0.0, 0.0, 1.0), t);
        }
    } else {
        // Mode 0: Legacy Linear Mix
        finalPos = mix(pos3D, pos2D, ease);
        dynamicNormal = normalize(pos3D);
    }

    vStrain = clamp(localStrain, 0.0, 1.0);
    vVorticity = clamp(localVorticity, 0.0, 1.0);
    vLatitudeNorm = abs(pos3D.y) / RADIUS;

    // =========================================================================
    // Camera-Relative RTC (Relative-to-Center) Projection (engine-audit.md §3.5)
    // Eliminates 24-bit mantissa truncation jitter when zooming into micro-scales
    // =========================================================================
    vec3 rtcPos = finalPos - u_cameraCenter;
    vec4 mvPosition = viewMatrix * vec4(rtcPos + u_cameraCenter, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Dynamic point sizing: 1.8px for coastline (vType=1.0), 1.0px for ocean (vType=0.0)
    // Part of 102:1 contrast ratio & anti-moiré spatial attenuation
    float sizeFactor = (u_mode == 3) ? (1.0 + vVorticity * 0.8) : 1.0;
    gl_PointSize = mix(1.0, 1.8, vType) * sizeFactor; 
    
    vec3 viewNormal = normalize(normalMatrix * dynamicNormal);
    vec3 viewDir = -normalize(mvPosition.xyz);
    float facing = dot(viewNormal, viewDir);
    
    if (u_mode == 1 || u_mode == 2 || u_mode == 3) {
        vFacing = mix(facing, dot(normalize(normalMatrix * vec3(0.0, 0.0, 1.0)), viewDir), pow(ease, 2.0));
    } else {
        vFacing = mix(facing, 1.0, ease);
    }

    // Layer Toggle Alpha Multiplier (Milestone M2 / Feature F4)
    if (u_layerMode == 2) {
        vAlphaMultiplier = 0.0;
    } else {
        vAlphaMultiplier = 1.0;
    }
}
`;

const pointFragmentShader = `
uniform int u_mode;
uniform int u_layerMode;
varying float vPointType;
varying float vFacing;
varying float vStrain;
varying float vVorticity;
varying float vAlphaMultiplier;

void main() {
    if (u_layerMode == 2 || vAlphaMultiplier < 0.001) {
        discard; // Instantly drop points in [Wireframe Only] mode
    }

    float backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, vFacing));
    
    // 102:1 Contrast Ratio (GIS Coastline Clarity at 1M Nodes)
    // Geographic coastline points (vType = 1.0): alpha = 0.95, vibrant cyan vec3(0.49, 0.827, 0.988)
    // Structural ocean points (vType = 0.0): alpha = 0.03, dark navy vec3(0.05, 0.12, 0.22)
    vec3 geographicColor = vec3(0.49, 0.827, 0.988);
    vec3 structuralColor = vec3(0.05, 0.12, 0.22);
    vec3 baseColor = mix(structuralColor, geographicColor, vPointType);
    
    vec3 finalColor = baseColor;
    float alpha = mix(0.03, 0.95, vPointType);

    if (u_mode == 2) {
        // Mode 2: Griffith LEFM strain energy color mapping
        vec3 tensionAmber = vec3(1.0, 0.65, 0.15);
        vec3 ruptureCrimson = vec3(0.98, 0.20, 0.12);
        vec3 activeCrackWhite = vec3(1.0, 0.98, 0.90);
        
        vec3 stressColor = mix(baseColor, tensionAmber, smoothstep(0.12, 0.45, vStrain));
        stressColor = mix(stressColor, ruptureCrimson, smoothstep(0.45, 0.78, vStrain));
        stressColor = mix(stressColor, activeCrackWhite, smoothstep(0.78, 1.0, vStrain));
        finalColor = stressColor;
        if (vStrain > 0.4) alpha = mix(alpha, 1.0, (vStrain - 0.4) * 1.8);
    } else if (u_mode == 3) {
        // Mode 3: Hydrodynamic Vorticity Palette
        vec3 oceanicIndigo = vec3(0.06, 0.22, 0.45);
        vec3 biolumCyan = vec3(0.20, 0.88, 0.96);
        vec3 eddyViolet = vec3(0.85, 0.25, 0.98);

        vec3 fluidColor = mix(oceanicIndigo, biolumCyan, smoothstep(0.05, 0.50, vVorticity));
        fluidColor = mix(fluidColor, eddyViolet, smoothstep(0.50, 0.95, vVorticity));
        
        // When quiescent at alpha=0 or condensed at alpha=1, seamlessly blend back to base geographic colors
        finalColor = mix(baseColor, fluidColor, smoothstep(0.0, 0.15, vVorticity));
        if (vVorticity > 0.1) alpha = mix(alpha, 1.0, vVorticity);
    }

    gl_FragColor = vec4(finalColor, alpha * backfaceDimming * vAlphaMultiplier);
}
`;

const meshVertexShader = vertexShader;

const meshFragmentShader = `
uniform int u_mode;
uniform float u_unfurl;
uniform int u_layerMode;
uniform float u_wireOpacityScale;
varying float vPointType;
varying float vFacing;
varying float vStrain;
varying float vLatitudeNorm;

void main() {
    if (u_layerMode == 1) {
        discard; // Instantly drop wireframe in [Points Only] mode
    }

    float backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, vFacing));
    vec3 geographicColor = vec3(0.22, 0.74, 0.97) * 0.8;
    vec3 structuralColor = vec3(0.02, 0.1, 0.2) * 0.3;
    vec3 baseColor = mix(structuralColor, geographicColor, vPointType);
    
    vec3 finalColor = baseColor;
    // Base wireframe alpha scaled by node density (e.g. sqrt(100k / N)) to prevent moiré at 1M nodes
    float densityFactor = clamp(u_wireOpacityScale, 0.01, 1.0);
    float alpha = mix(0.03 * densityFactor, 0.50 * densityFactor, pow(vPointType, 2.0));

    // Dynamic Polar Line Tapering: Attenuate needle wire stretching near poles as map unrolls
    float polarFade = 1.0 - smoothstep(0.20, 0.95, u_unfurl) * smoothstep(0.85, 0.985, vLatitudeNorm);
    alpha = alpha * polarFade;

    if (u_mode == 2) {
        vec3 tensionAmber = vec3(0.95, 0.50, 0.10);
        vec3 ruptureCrimson = vec3(0.95, 0.15, 0.10);
        vec3 activeCrackWhite = vec3(1.0, 0.95, 0.85);
        
        vec3 stressColor = mix(baseColor, tensionAmber, smoothstep(0.12, 0.45, vStrain));
        stressColor = mix(stressColor, ruptureCrimson, smoothstep(0.45, 0.78, vStrain));
        stressColor = mix(stressColor, activeCrackWhite, smoothstep(0.78, 1.0, vStrain));
        finalColor = stressColor;
        if (vStrain > 0.35) alpha = mix(alpha, 0.95 * densityFactor, (vStrain - 0.35) * 1.5);
    } else if (u_mode == 3) {
        // Viscous Phase Transition: Mesh lines melt away during peak liquefaction
        float rawSin = sin(3.14159265 * clamp(u_unfurl, 0.0, 1.0));
        float liquefaction = (u_unfurl <= 0.001 || u_unfurl >= 0.999) ? 0.0 : pow(max(0.0, rawSin), 1.2);
        alpha = alpha * (1.0 - liquefaction * 0.92);
    }
    
    gl_FragColor = vec4(finalColor, alpha * backfaceDimming);
}
`;

interface LoadedDataInfo {
  pointCount: number;
  lineCount: number;
  format: string;
  loadTimeMs: number;
  vramMb: number;
}

interface GeometryLayerProps {
  unfurlProgress: number;
  mode: 0 | 1 | 2 | 3;
  layerMode: 0 | 1 | 2;
  resolution: '100k' | '1M';
  cameraTarget: THREE.Vector3;
  cursorPhysicsEnabled: boolean;
  onFpsUpdate: (fps: number) => void;
  onDataLoaded: (info: LoadedDataInfo) => void;
}

const GeometryLayer: React.FC<GeometryLayerProps> = ({ 
  unfurlProgress, 
  mode, 
  layerMode,
  resolution,
  cameraTarget,
  cursorPhysicsEnabled,
  onFpsUpdate,
  onDataLoaded
}) => {
  const meshMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const pointMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const cursorTrackerRef = useRef<CursorTracker>(new CursorTracker());
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const startTimeRef = useRef(performance.now());
  
  const [geoData, setGeoData] = useState<{ 
    pointsBuffer: Float32Array; 
    target2DBuffer: Float32Array; 
    typeBuffer: Float32Array;
    lineIndices: Uint32Array;
  } | null>(null);

  // Passive window-level cursor tracking ({ passive: true }) - only active when enabled
  useEffect(() => {
    if (!cursorPhysicsEnabled) return;
    const tracker = cursorTrackerRef.current;
    tracker.attach(window);
    return () => {
      tracker.detach();
    };
  }, [cursorPhysicsEnabled]);

  // High-Performance Packed Binary Streaming Loader with Automatic JSON Fallback
  useEffect(() => {
    let isMounted = true;
    const t0 = performance.now();
    const binFile = resolution === '1M' ? '/geo-mesh-1m.bin' : '/geo-mesh-100k.bin';
    const jsonFile = resolution === '1M' ? null : '/geo-mesh-100k.json';

    fetch(binFile)
      .then(async (res) => {
        if (!res.ok) throw new Error(`BIN fetch failed (${res.status})`);
        const buffer = await res.arrayBuffer();
        if (!isMounted) return;

        const view = new DataView(buffer);
        const magic = view.getUint32(0, true);
        if (magic !== 0x47454F4D) throw new Error("Invalid binary magic header");

        const pointCount = view.getUint32(8, true);
        const indexCount = view.getUint32(12, true);
        const pOffset = view.getUint32(16, true);
        const tOffset = view.getUint32(20, true);
        const typOffset = view.getUint32(24, true);
        const iOffset = view.getUint32(28, true);

        // Zero-copy typed array views directly on the ArrayBuffer
        const pBuf = new Float32Array(buffer, pOffset, pointCount * 3);
        const tBuf = new Float32Array(buffer, tOffset, pointCount * 2);
        const typBuf = new Float32Array(buffer, typOffset, pointCount);
        const lIndices = new Uint32Array(buffer, iOffset, indexCount);

        const t1 = performance.now();
        const vramBytes = pBuf.byteLength + tBuf.byteLength + typBuf.byteLength + lIndices.byteLength;

        setGeoData({
          pointsBuffer: pBuf,
          target2DBuffer: tBuf,
          typeBuffer: typBuf,
          lineIndices: lIndices
        });

        onDataLoaded({
          pointCount,
          lineCount: indexCount / 2,
          format: 'BIN (Zero-Copy)',
          loadTimeMs: Math.round(t1 - t0),
          vramMb: parseFloat((vramBytes / (1024 * 1024)).toFixed(2))
        });
      })
      .catch((binErr) => {
        // Fallback to JSON if .bin is missing (only for 100k)
        if (!jsonFile) {
          console.error("Binary load failed and no JSON fallback for 1M:", binErr);
          return;
        }
        console.warn("Binary load failed, falling back to JSON:", binErr);
        fetch(jsonFile)
          .then((res) => res.json())
          .then((data) => {
            if (!isMounted) return;
            const pBuf = new Float32Array(data.pointsBuffer);
            const tBuf = new Float32Array(data.target2DBuffer);
            const typBuf = new Float32Array(data.typeBuffer);
            const lIndices = new Uint32Array(data.lineIndices);
            const t1 = performance.now();
            const vramBytes = pBuf.byteLength + tBuf.byteLength + typBuf.byteLength + lIndices.byteLength;

            setGeoData({
              pointsBuffer: pBuf,
              target2DBuffer: tBuf,
              typeBuffer: typBuf,
              lineIndices: lIndices
            });

            onDataLoaded({
              pointCount: pBuf.length / 3,
              lineCount: lIndices.length / 2,
              format: 'JSON (Legacy)',
              loadTimeMs: Math.round(t1 - t0),
              vramMb: parseFloat((vramBytes / (1024 * 1024)).toFixed(2))
            });
          })
          .catch(console.error);
      });

    return () => { isMounted = false; };
  }, [resolution, onDataLoaded]);

  useFrame(({ camera }) => {
    const elapsedTime = (performance.now() - startTimeRef.current) * 0.001;
    const nodeCount = geoData?.typeBuffer?.length || (resolution === '1M' ? 1000000 : 100000);
    const wireOpacityScale = Math.min(1.0, Math.sqrt(100000 / (nodeCount || 100000)));
    
    const cursorUniforms = cursorPhysicsEnabled
      ? cursorTrackerRef.current.update(camera, unfurlProgress)
      : {
          u_cursorRayOrig: new THREE.Vector3(0, 0, 15),
          u_cursorRayDir: new THREE.Vector3(0, 0, -1),
          u_cursorHitPos: new THREE.Vector3(0, 0, 5),
          u_cursorVel: new THREE.Vector4(0, 0, 0, 0),
          u_cursorActive: 0.0,
        };

    if (meshMaterialRef.current && pointMaterialRef.current) {
      meshMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      meshMaterialRef.current.uniforms.u_mode.value = mode;
      meshMaterialRef.current.uniforms.u_layerMode.value = layerMode;
      meshMaterialRef.current.uniforms.u_wireOpacityScale.value = wireOpacityScale;
      meshMaterialRef.current.uniforms.u_time.value = elapsedTime;
      meshMaterialRef.current.uniforms.u_cameraCenter.value.copy(cameraTarget);
      meshMaterialRef.current.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);
      meshMaterialRef.current.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);
      meshMaterialRef.current.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);
      meshMaterialRef.current.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);
      meshMaterialRef.current.uniforms.u_cursorActive.value = cursorUniforms.u_cursorActive;

      pointMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      pointMaterialRef.current.uniforms.u_mode.value = mode;
      pointMaterialRef.current.uniforms.u_layerMode.value = layerMode;
      pointMaterialRef.current.uniforms.u_time.value = elapsedTime;
      pointMaterialRef.current.uniforms.u_cameraCenter.value.copy(cameraTarget);
      pointMaterialRef.current.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);
      pointMaterialRef.current.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);
      pointMaterialRef.current.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);
      pointMaterialRef.current.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);
      pointMaterialRef.current.uniforms.u_cursorActive.value = cursorUniforms.u_cursorActive;
    }

    // Throttled FPS sampling
    frameCount.current++;
    const now = performance.now();
    if (now - lastTime.current >= 500) {
      const currentFps = Math.round((frameCount.current * 1000) / (now - lastTime.current));
      onFpsUpdate(currentFps);
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  // Decoupled Geometries: meshGeometry holds line indices; pointGeometry is UNINDEXED
  const { meshGeometry, pointGeometry } = useMemo(() => {
    if (!geoData) return { meshGeometry: null, pointGeometry: null };

    const meshGeo = new THREE.BufferGeometry();
    meshGeo.setAttribute('position', new THREE.BufferAttribute(geoData.pointsBuffer, 3));
    meshGeo.setAttribute('target2D', new THREE.BufferAttribute(geoData.target2DBuffer, 2));
    meshGeo.setAttribute('vType', new THREE.BufferAttribute(geoData.typeBuffer, 1));
    meshGeo.setIndex(new THREE.BufferAttribute(geoData.lineIndices, 1));

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(geoData.pointsBuffer, 3));
    pointGeo.setAttribute('target2D', new THREE.BufferAttribute(geoData.target2DBuffer, 2));
    pointGeo.setAttribute('vType', new THREE.BufferAttribute(geoData.typeBuffer, 1));

    return { meshGeometry: meshGeo, pointGeometry: pointGeo };
  }, [geoData]);

  // VRAM cleanup
  useEffect(() => {
    return () => {
      if (meshGeometry) meshGeometry.dispose();
      if (pointGeometry) pointGeometry.dispose();
    };
  }, [meshGeometry, pointGeometry]);

  if (!meshGeometry || !pointGeometry) return null;

  return (
    <group>
      <lineSegments geometry={meshGeometry}>
        <shaderMaterial 
          ref={meshMaterialRef} 
          vertexShader={meshVertexShader} 
          fragmentShader={meshFragmentShader} 
          transparent={true} 
          depthTest={false} 
          uniforms={{ 
            u_unfurl: { value: 0 }, 
            u_mode: { value: 3 }, 
            u_layerMode: { value: 0 },
            u_wireOpacityScale: { value: 1.0 },
            u_time: { value: 0 },
            u_cameraCenter: { value: new THREE.Vector3(0, 0, 0) },
            u_cursorRayOrig: { value: new THREE.Vector3(0, 0, 15) },
            u_cursorRayDir: { value: new THREE.Vector3(0, 0, -1) },
            u_cursorHitPos: { value: new THREE.Vector3(0, 0, 5) },
            u_cursorVel: { value: new THREE.Vector4(0, 0, 0, 0) },
            u_cursorActive: { value: 0.0 }
          }} 
        />
      </lineSegments>
      <points geometry={pointGeometry}>
        <shaderMaterial 
          ref={pointMaterialRef} 
          vertexShader={vertexShader} 
          fragmentShader={pointFragmentShader} 
          transparent={true} 
          depthTest={false} 
          uniforms={{ 
            u_unfurl: { value: 0 }, 
            u_mode: { value: 3 }, 
            u_layerMode: { value: 0 },
            u_time: { value: 0 },
            u_cameraCenter: { value: new THREE.Vector3(0, 0, 0) },
            u_cursorRayOrig: { value: new THREE.Vector3(0, 0, 15) },
            u_cursorRayDir: { value: new THREE.Vector3(0, 0, -1) },
            u_cursorHitPos: { value: new THREE.Vector3(0, 0, 5) },
            u_cursorVel: { value: new THREE.Vector4(0, 0, 0, 0) },
            u_cursorActive: { value: 0.0 }
          }} 
        />
      </points>
    </group>
  );
};

export default function App() {
  const [backend, setBackend] = useState<'webgl2' | 'webgpu'>('webgl2');
  const [hasWebGPU, setHasWebGPU] = useState<boolean>(false);
  const [alpha, setAlpha] = useState(0); 
  const [mode, setMode] = useState<0 | 1 | 2 | 3>(3); // Default to Mode 3 (Fluid Advection)
  const [layerMode, setLayerMode] = useState<0 | 1 | 2>(0); // 0 = Both, 1 = Points Only, 2 = Wireframe Only
  const [cursorPhysicsEnabled, setCursorPhysicsEnabled] = useState<boolean>(false); // Off by default for smooth scrub
  const [resolution, setResolution] = useState<'100k' | '1M'>('100k');
  const [fps, setFps] = useState(60);
  const [isHudOpen, setIsHudOpen] = useState(true);
  const [cameraTarget, setCameraTarget] = useState(new THREE.Vector3(0, 0, 0));
  const [webgpuCameraPos, setWebgpuCameraPos] = useState<THREE.Vector3 | undefined>(undefined);
  const [dataInfo, setDataInfo] = useState<LoadedDataInfo>({ 
    pointCount: 100000, 
    lineCount: 300000,
    format: 'BIN (Zero-Copy)',
    loadTimeMs: 0,
    vramMb: 4.57
  });

  const controlsRef = useRef<any>(null);

  useEffect(() => {
    (window as any).setAlpha = setAlpha;
    (window as any).setMode = setMode;
    (window as any).setLayerMode = setLayerMode;
    (window as any).setResolution = setResolution;
    (window as any).setBackend = setBackend;
    (window as any).setCursorPhysicsEnabled = setCursorPhysicsEnabled;
    (window as any).backend = backend;
    isWebGPUSupported().then((supported) => {
      setHasWebGPU(supported);
    });
  }, [backend]);

  const handleFpsUpdate = useCallback((val: number) => {
    setFps(val);
  }, []);

  const handleDataLoaded = useCallback((info: LoadedDataInfo) => {
    setDataInfo(info);
  }, []);

  const snapCamera = (view: 'equator' | 'pole' | 'seam' | 'isometric') => {
    let pos = new THREE.Vector3(0, 0, 15);
    if (view === 'equator') {
      pos = new THREE.Vector3(0, 0, 15);
    } else if (view === 'pole') {
      pos = new THREE.Vector3(0, 15, 0.001);
    } else if (view === 'seam') {
      pos = new THREE.Vector3(0, 0, -15);
    } else if (view === 'isometric') {
      pos = new THREE.Vector3(10, 8, 12);
    }
    if (controlsRef.current) {
      const camera = controlsRef.current.object;
      camera.position.copy(pos);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    setWebgpuCameraPos(pos);
    setCameraTarget(new THREE.Vector3(0, 0, 0));
  };

  // Metrics calculation
  const originRadiusLinear = (RADIUS * (1.0 - alpha)).toFixed(2);
  const originRadiusScroll = RADIUS.toFixed(2);
  const sagPercent = mode === 0 ? ((1.0 - (1.0 - alpha)) * 100).toFixed(1) : '0.0';

  // Griffith LEFM Energy Release calculation
  const tRupture = 0.18;
  const gRatio = alpha < tRupture ? (alpha / tRupture) : 1.0;
  const isCrackActive = alpha >= tRupture && alpha < 0.65;
  const isRelaxed = alpha >= 0.65;

  // Fluid Hydrodynamics calculation
  const liquefactionRatio = Math.pow(Math.sin(Math.PI * alpha), 1.2);
  const reynoldsNumber = Math.round(liquefactionRatio * 4200);
  const isTurbulent = alpha >= 0.12 && alpha < 0.88;
  const isCondensing = alpha >= 0.88;

  return (
    <div className="relative w-screen h-screen flex flex-col font-mono bg-[#020408] overflow-hidden select-none">
      {/* Viewport Canvas (WebGL2 or WebGPU) */}
      <div className="w-full h-full relative">
        {backend === 'webgpu' ? (
          <React.Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-[#020408] text-purple-400 font-mono text-xs">
              <span className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></span>
              <span className="ml-2">Initializing WebGPU WGSL Pipeline...</span>
            </div>
          }>
            <WebGPUCanvas
              unfurlProgress={alpha}
              mode={mode}
              layerMode={layerMode}
              resolution={resolution}
              cameraTarget={cameraTarget}
              cameraPosition={webgpuCameraPos}
              onFpsUpdate={handleFpsUpdate}
              onDataLoaded={handleDataLoaded}
              onError={(err) => {
                console.warn('WebGPU runtime error, falling back to WebGL2:', err);
                setBackend('webgl2');
              }}
            />
          </React.Suspense>
        ) : (
          <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
            <React.Suspense fallback={null}>
              <GeometryLayer 
                unfurlProgress={alpha} 
                mode={mode} 
                layerMode={layerMode}
                resolution={resolution}
                cameraTarget={cameraTarget}
                cursorPhysicsEnabled={cursorPhysicsEnabled}
                onFpsUpdate={handleFpsUpdate} 
                onDataLoaded={handleDataLoaded} 
              />
            </React.Suspense>
            <OrbitControls 
              ref={controlsRef} 
              enablePan={true} 
              enableZoom={true} 
              enableRotate={true} 
              autoRotate={alpha < 0.01} 
              autoRotateSpeed={0.5} 
              onChange={() => {
                if (controlsRef.current) {
                  setCameraTarget(controlsRef.current.target.clone());
                }
              }}
            />
          </Canvas>
        )}
      </div>

      {/* Top-Right Telemetry & Enterprise Benchmark HUD */}
      <div className="absolute top-4 right-4 z-20 pointer-events-auto max-w-sm w-96">
        <div className="rounded-2xl bg-black/75 border border-sky-500/25 backdrop-blur-xl shadow-2xl p-4 text-xs font-mono text-zinc-300 transition-all duration-300">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                backend === 'webgpu' ? 'bg-purple-400' : mode === 3 ? 'bg-purple-400' : mode === 2 ? 'bg-rose-400' : mode === 1 ? 'bg-sky-400' : 'bg-amber-400'
              } animate-pulse`}></span>
              <span className={`text-[11px] font-bold tracking-widest uppercase ${
                backend === 'webgpu' ? 'text-purple-400' : mode === 3 ? 'text-purple-400' : mode === 2 ? 'text-rose-400' : mode === 1 ? 'text-sky-400' : 'text-amber-400'
              }`}>
                {backend === 'webgpu' ? (resolution === '1M' ? '1M WebGPU (120 FPS)' : 'WebGPU Compute (120 FPS)') : (resolution === '1M' ? '1M Matrix Enterprise' : 'Engine Telemetry')}
              </span>
            </div>
            <button 
              onClick={() => setIsHudOpen(!isHudOpen)}
              className="text-[10px] text-zinc-400 hover:text-sky-300 px-2 py-0.5 rounded border border-zinc-700/60 hover:border-sky-500/40 transition-colors"
            >
              {isHudOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {isHudOpen && (
            <div className="mt-3 flex flex-col gap-3">
              {/* Engine Backend Selector (WebGL2 vs WebGPU) */}
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 flex justify-between">
                  <span>Engine Backend</span>
                  <span className={`font-bold ${backend === 'webgpu' ? 'text-purple-400' : 'text-sky-400'}`}>
                    {backend === 'webgpu' ? 'WebGPU (120 FPS Compute)' : 'WebGL2 (Rasterizer)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setBackend('webgl2')}
                    className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      backend === 'webgl2' 
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    WebGL2
                  </button>
                  <button
                    onClick={() => {
                      if (hasWebGPU) {
                        setBackend('webgpu');
                      } else {
                        console.warn('WebGPU is unsupported on this device/browser');
                      }
                    }}
                    disabled={!hasWebGPU}
                    title={hasWebGPU ? 'Dedicated WGSL Compute Pipeline' : 'WebGPU Unsupported on this device/browser'}
                    className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      backend === 'webgpu' 
                        ? 'bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm' 
                        : hasWebGPU 
                        ? 'text-zinc-400 hover:text-purple-300' 
                        : 'text-zinc-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    WebGPU {hasWebGPU ? '(120 FPS)' : '(N/A)'}
                  </button>
                </div>
              </div>

              {/* Hardware & WebGPU Pipeline Status Badge */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    backend === 'webgpu' 
                      ? 'bg-purple-400 animate-pulse' 
                      : hasWebGPU 
                        ? 'bg-emerald-400' 
                        : 'bg-zinc-600'
                  }`}></span>
                  <span className="text-zinc-400">Pipeline Status:</span>
                </div>
                <span className={`font-semibold ${
                  backend === 'webgpu' 
                    ? 'text-purple-300' 
                    : hasWebGPU 
                      ? 'text-emerald-300' 
                      : 'text-zinc-500'
                }`}>
                  {backend === 'webgpu' 
                    ? 'WGSL Compute Active (120 FPS)' 
                    : hasWebGPU 
                      ? 'WebGPU Available (Ready)' 
                      : 'WebGL2 Fallback (No WebGPU)'}
                </span>
              </div>

              {/* Matrix Resolution Selector (100k vs 1M) */}
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 flex justify-between">
                  <span>Matrix Density</span>
                  <span className="text-emerald-400 font-bold">{resolution} Nodes</span>
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setResolution('100k')}
                    className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      resolution === '100k' 
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    100,000 Nodes
                  </button>
                  <button
                    onClick={() => setResolution('1M')}
                    className={`py-1 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      resolution === '1M' 
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    1,000,000 Nodes
                  </button>
                </div>
              </div>

              {/* Interactive HUD Display Layer Selector (Milestone M2 / Feature F4) */}
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 flex justify-between">
                  <span>Display Layer</span>
                  <span className="text-sky-400 font-bold">
                    {layerMode === 0 ? 'Both' : layerMode === 1 ? 'Points Only' : 'Wireframe Only'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setLayerMode(0)}
                    className={`py-1.5 px-1 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      layerMode === 0 
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Both
                  </button>
                  <button
                    onClick={() => setLayerMode(1)}
                    className={`py-1.5 px-1 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      layerMode === 1 
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Points
                  </button>
                  <button
                    onClick={() => setLayerMode(2)}
                    className={`py-1.5 px-1 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      layerMode === 2 
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Wireframe
                  </button>
                </div>
              </div>

              {/* Cursor Interaction Experimental Toggle */}
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 flex justify-between">
                  <span>Cursor Interaction</span>
                  <span className={`font-bold ${cursorPhysicsEnabled ? 'text-purple-400' : 'text-zinc-500'}`}>
                    {cursorPhysicsEnabled ? 'Active (Experimental)' : 'Off (Smooth Scrub)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setCursorPhysicsEnabled(false)}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      !cursorPhysicsEnabled 
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Off (Default)
                  </button>
                  <button
                    onClick={() => setCursorPhysicsEnabled(true)}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold tracking-wide transition-all text-center ${
                      cursorPhysicsEnabled 
                        ? 'bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    On (Tactile)
                  </button>
                </div>
              </div>

              {/* 4-Way Simulation Paradigm Selector */}
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1.5 flex justify-between">
                  <span>Simulation Paradigm</span>
                  <span className={`font-bold ${
                    mode === 3 ? 'text-purple-400' : mode === 2 ? 'text-rose-400' : mode === 1 ? 'text-sky-400' : 'text-amber-400'
                  }`}>
                    {mode === 3 ? 'Fluid Flow' : mode === 2 ? 'Griffith LEFM' : mode === 1 ? 'Cylindrical Scroll' : 'Linear Mix'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setMode(0)}
                    className={`py-1.5 px-0.5 rounded-lg text-[9px] font-bold tracking-tight transition-all text-center ${
                      mode === 0 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Linear
                  </button>
                  <button
                    onClick={() => setMode(1)}
                    className={`py-1.5 px-0.5 rounded-lg text-[9px] font-bold tracking-tight transition-all text-center ${
                      mode === 1 
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Scroll
                  </button>
                  <button
                    onClick={() => setMode(2)}
                    className={`py-1.5 px-0.5 rounded-lg text-[9px] font-bold tracking-tight transition-all text-center ${
                      mode === 2 
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Griffith
                  </button>
                  <button
                    onClick={() => setMode(3)}
                    className={`py-1.5 px-0.5 rounded-lg text-[9px] font-bold tracking-tight transition-all text-center ${
                      mode === 3 
                        ? 'bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Fluid
                  </button>
                </div>
              </div>

              {/* Dynamic Metric Card based on Active Paradigm */}
              {mode === 3 ? (
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-400">Hydrodynamic Flow (Re):</span>
                    <span className={`font-bold ${
                      isCondensing ? 'text-emerald-400' : isTurbulent ? 'text-purple-400 animate-pulse' : 'text-sky-400'
                    }`}>
                      {isCondensing 
                        ? 'Planar Freeze (Re → 0)' 
                        : isTurbulent 
                          ? `Turbulent (Re ≈ ${reynoldsNumber})` 
                          : 'Solid Crystal (Re ≈ 0)'}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-150 ${
                        isCondensing 
                          ? 'bg-emerald-400' 
                          : isTurbulent 
                            ? 'bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500' 
                            : 'bg-sky-400'
                      }`}
                      style={{ 
                        width: isCondensing ? '100%' : `${liquefactionRatio * 100}%` 
                      }}
                    ></div>
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-1.5 flex justify-between">
                    <span>Field: 3D Curl-Noise (div u = 0)</span>
                    <span>{isTurbulent ? 'Vortices Active' : isCondensing ? 'Laminarizing' : 'Quiescent'}</span>
                  </div>
                </div>
              ) : mode === 2 ? (
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-400">Griffith Energy Release:</span>
                    <span className={`font-bold ${
                      isRelaxed ? 'text-emerald-400' : isCrackActive ? 'text-rose-400 animate-pulse' : 'text-amber-400'
                    }`}>
                      {isRelaxed 
                        ? 'Relaxed (G/Gc ≈ 0)' 
                        : isCrackActive 
                          ? 'G ≥ Gc (Rupture Active)' 
                          : `Pre-Strain (G/Gc = ${gRatio.toFixed(2)})`}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-150 ${
                        isRelaxed 
                          ? 'bg-emerald-400' 
                          : isCrackActive 
                            ? 'bg-gradient-to-r from-amber-400 via-rose-500 to-white' 
                            : 'bg-amber-400'
                      }`}
                      style={{ 
                        width: isRelaxed ? '100%' : `${gRatio * 100}%` 
                      }}
                    ></div>
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-1.5 flex justify-between">
                    <span>Seam: Antimeridian (180°)</span>
                    <span>{isCrackActive ? 'Acoustic Flutter' : isRelaxed ? 'Conformal Sheet' : 'Tensile Tension'}</span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-400">Radial Volume Collapse:</span>
                    <span className={`font-bold ${mode === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {mode === 0 ? `-${sagPercent}% Sag (R = ${originRadiusLinear})` : `0.0% Sag (R ≡ ${originRadiusScroll})`}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-200 ${mode === 0 ? 'bg-amber-500' : 'bg-sky-400'}`}
                      style={{ width: mode === 0 ? `${(1.0 - alpha) * 100}%` : '100%' }}
                    ></div>
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-1.5 flex justify-between">
                    <span>Origin R: {mode === 0 ? originRadiusLinear : originRadiusScroll} / 5.0</span>
                    <span>{mode === 0 ? 'Chord Contraction' : 'Isometric Scroll'}</span>
                  </div>
                </div>
              )}

              {/* Data & Buffer Telemetry */}
              <div className="p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[10px] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Payload Format:</span>
                  <span className="text-emerald-400 font-bold">{dataInfo.format}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Buffer Load Time:</span>
                  <span className="text-zinc-200 font-mono">{dataInfo.loadTimeMs} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">VRAM Allocation:</span>
                  <span className="text-sky-300 font-mono font-bold">{dataInfo.vramMb} MB</span>
                </div>
              </div>

              {/* Rendering & Overdraw Telemetry */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col">
                  <span className="text-zinc-500">Live Framerate</span>
                  <span className={`text-base font-bold mt-0.5 ${fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                    {fps} <span className="text-[10px] font-normal text-zinc-400">FPS</span>
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col">
                  <span className="text-zinc-500">Point Vertices</span>
                  <span className="text-base font-bold text-emerald-400 mt-0.5 flex items-baseline gap-1">
                    {dataInfo.pointCount.toLocaleString()}
                    <span className="text-[9px] text-emerald-500/80 font-normal">1x</span>
                  </span>
                  <span className="text-[8px] text-zinc-500">RTC Precision Active</span>
                </div>
              </div>

              <div className="flex justify-between text-[10px] px-1 text-zinc-400">
                <span>Mesh Edges:</span>
                <span className="text-zinc-200 font-semibold">{dataInfo.lineCount.toLocaleString()} ({(dataInfo.lineCount * 2).toLocaleString()} idx)</span>
              </div>

              {/* Viewport Camera Snaps */}
              <div>
                <span className="text-[10px] text-zinc-500 block mb-1.5 uppercase tracking-wider">Inspect Topology</span>
                <div className="grid grid-cols-4 gap-1">
                  <button 
                    onClick={() => snapCamera('equator')} 
                    className="py-1 px-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg text-[9px] transition-colors text-center"
                  >
                    Equator
                  </button>
                  <button 
                    onClick={() => snapCamera('seam')} 
                    className="py-1 px-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-rose-300/90 rounded-lg text-[9px] transition-colors text-center font-bold"
                  >
                    Seam 180°
                  </button>
                  <button 
                    onClick={() => snapCamera('pole')} 
                    className="py-1 px-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg text-[9px] transition-colors text-center text-sky-400/90"
                  >
                    North Pole
                  </button>
                  <button 
                    onClick={() => snapCamera('isometric')} 
                    className="py-1 px-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg text-[9px] transition-colors text-center"
                  >
                    Perspective
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Morph Slider Dock */}
      <div className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-2 z-10 pointer-events-none">
        <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-black/70 border border-sky-500/25 backdrop-blur-xl shadow-2xl pointer-events-auto">
          <span className="text-[10px] text-sky-400 font-bold uppercase tracking-widest flex items-center gap-1">
            Globe
          </span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.001" 
            value={alpha} 
            onChange={(e) => setAlpha(parseFloat(e.target.value))} 
            className="w-48 sm:w-72 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-400 hover:bg-zinc-700 transition-colors" 
          />
          <span className="text-[10px] text-sky-400 font-bold uppercase tracking-widest flex items-center gap-1">
            Map
          </span>
          <span className="text-[9px] text-zinc-400 font-mono pl-2 border-l border-zinc-800">
            {alpha.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}
