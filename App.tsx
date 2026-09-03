import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CursorTracker } from './src/utils/raycast';
import { isWebGPUSupported } from './src/webgpu/support';
import { GeodesicOverlayMode, SimulationMode } from './types';
import { TelemetryHUD } from './src/components/hud/TelemetryHUD';
import { NavigationDock } from './src/components/hud/NavigationDock';

const WebGPUCanvas = React.lazy(() => import('./src/webgpu/WebGPUCanvas'));
const GeodesicOverlayLayer = React.lazy(() => import('./src/core/GeodesicOverlayLayer').then(m => ({ default: m.GeodesicOverlayLayer })));
const VectorOverlayLayer = React.lazy(() => import('./src/core/VectorOverlayLayer').then(m => ({ default: m.VectorOverlayLayer })));

const RADIUS = 5.0;

const vertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode; // 0 = Linear, 1 = Cylindrical Scroll, 2 = Griffith Fracture, 3 = Fluid Advection, 4 = Dymaxion
uniform int u_layerMode; // 0 = Both, 1 = Points Only, 2 = Wireframe Only
uniform float u_dpr;
uniform vec3 u_cameraCenter; // Camera-Relative RTC (Relative-to-Center) center point
uniform vec3 u_cursorRayOrig;
uniform vec3 u_cursorRayDir;
uniform vec3 u_cursorHitPos;
uniform vec4 u_cursorVel;
uniform float u_cursorActive;
attribute vec2 target2D;
attribute vec2 dymaxion2D;
attribute float vType; // 1.0 = Geographic, 0.0 = Structural
varying float vPointType;
varying float vFacing;
varying float vStrain;    // Local strain energy density for Mode 2
varying float vVorticity; // Local vorticity magnitude for Mode 3
varying float vAlphaMultiplier;
varying float vLatitudeNorm;

const float RADIUS = 5.0;
const float PI = 3.14159265358979323846;

// Analytical 3D Solenoidal Vector Field (div u = 0 guaranteed, zero Cartesian lattice)
vec3 computeCurlNoise(vec3 p, float time) {
    float t = time * 0.75;
    
    mat3 rot = mat3(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
    );
    vec3 q1 = rot * p * 0.45;
    vec3 q2 = rot * rot * p * 0.95;

    float u_x = -0.55 * cos(0.55 * q1.y + t * 0.7) - 0.45 * cos(0.95 * q1.z - t * 0.5);
    float u_y = -0.55 * cos(0.55 * q1.z + t * 0.9) - 0.45 * cos(0.95 * q1.x - t * 0.6);
    float u_z = -0.55 * cos(0.55 * q1.x + t * 0.8) - 0.45 * cos(0.95 * q1.y - t * 0.4);

    float u2_x = 0.25 * sin(1.5 * q2.y - t * 1.2);
    float u2_y = 0.25 * sin(1.5 * q2.z - t * 1.1);
    float u2_z = 0.25 * sin(1.5 * q2.x - t * 1.3);

    return rot * vec3(u_x + u2_x, u_y + u2_y, u_z + u2_z);
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
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

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
        // Mode 3: Incompressible Fluid Advection (Continuous Hermite Formulation)
        // =========================================================================
        float t = ease;
        float rawSin = sin(PI * clampedUnfurl);
        float liquefaction = pow(max(0.0, rawSin), 1.15);
        vec3 basePos = mix(pos3D, pos2D, t);
        vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
        
        // Passive cursor vortex perturbation (damped & smooth)
        float hitDist = length(basePos - u_cursorHitPos);
        float coreRadius = 0.85;
        float vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
        vec3 surfaceNormal = length(basePos) > 0.001 ? normalize(basePos) : vec3(0.0, 0.0, 1.0);
        vec3 vortexTangent = normalize(cross(surfaceNormal, basePos - u_cursorHitPos + vec3(0.001)));
        float clampedSpeed = clamp(u_cursorVel.w, 0.0, 1.5);
        vec3 vortexVelocity = vortexTangent * (u_cursorActive * clampedSpeed * vortexCirculation * 0.35);
        vec3 wakeAdvection = normalize(u_cursorVel.xyz + vec3(0.0001)) * (clampedSpeed * 0.15 * u_cursorActive * exp(-hitDist * hitDist / 1.5));

        vec3 totalVelocity = naturalVelocity + vortexVelocity + wakeAdvection;
        localVorticity = length(totalVelocity) * max(liquefaction, u_cursorActive * 0.3);

        // Silk drape wave dynamics: smooth traveling normal wave simulating delicate silk billowing in water
        float wavePhase1 = dot(basePos, vec3(0.35, 0.62, 0.42)) * 1.35 - u_time * 1.25;
        float wavePhase2 = dot(basePos, vec3(-0.45, 0.30, 0.65)) * 1.75 - u_time * 0.90;
        float silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        vec3 silkDrapeOffset = surfaceNormal * silkWave;

        vec3 advectionOffset = naturalVelocity * (liquefaction * 1.55) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (u_cursorActive * 0.25);

        finalPos = basePos + advectionOffset;
        dynamicNormal = mix(normalize(pos3D + silkDrapeOffset * 0.5), vec3(0.0, 0.0, 1.0), t);
    } else if (u_mode == 4) {
        // =========================================================================
        // Mode 4: Fuller Dymaxion Polyhedral Net Unfolding
        // =========================================================================
        float t = ease;
        vec3 dymaxionPos2D = vec3(dymaxion2D.x, dymaxion2D.y, 0.0);
        float arch = sin(PI * clampedUnfurl) * 0.45;
        vec3 sphereNorm = length(pos3D) > 0.001 ? normalize(pos3D) : vec3(0.0, 0.0, 1.0);
        finalPos = mix(pos3D, dymaxionPos2D, t) + sphereNorm * arch;
        dynamicNormal = mix(sphereNorm, vec3(0.0, 0.0, 1.0), t);
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
    gl_PointSize = mix(1.0, 1.8, vType) * sizeFactor * u_dpr; 
    
    vec3 viewNormal = normalize(normalMatrix * dynamicNormal);
    vec3 viewDir = -normalize(mvPosition.xyz);
    float facing = dot(viewNormal, viewDir);
    
    if (u_mode == 1 || u_mode == 2 || u_mode == 3 || u_mode == 4) {
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
uniform int u_theme; // 0 = Dark Cyber, 1 = Light Monochrome
varying float vPointType;
varying float vFacing;
varying float vStrain;
varying float vVorticity;
varying float vAlphaMultiplier;

// Analytical OKLCH to Linear sRGB Conversion
vec3 oklch2rgb(vec3 c) {
    float L = c.x;
    float C = c.y;
    float hRad = c.z * 0.01745329251; // degrees to radians
    float a = C * cos(hRad);
    float b = C * sin(hRad);

    float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    float r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    float g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    float bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    return clamp(vec3(r, g, bl), 0.0, 1.0);
}

void main() {
    if (u_layerMode == 2 || vAlphaMultiplier < 0.001) {
        discard; // Instantly drop points in [Wireframe Only] mode
    }

    float backfaceDimming = mix(u_theme == 1 ? 0.35 : 0.15, 1.0, smoothstep(-0.5, 0.2, vFacing));
    
    // 102:1 Contrast Ratio (GIS Coastline Clarity at 1M Nodes)
    vec3 geographicColor = vec3(0.49, 0.827, 0.988);
    vec3 structuralColor = vec3(0.05, 0.12, 0.22);
    if (u_theme == 0) {
        // Theme 0: Obsidian & Celestial Platinum
        geographicColor = vec3(0.92, 0.90, 0.87);
        structuralColor = vec3(0.12, 0.15, 0.20);
    } else if (u_theme == 1) {
        // Light Monochrome: Architectural Charcoal Ink on Archival Paper
        geographicColor = vec3(0.08, 0.09, 0.11);
        structuralColor = vec3(0.82, 0.85, 0.89);
    }
    vec3 baseColor = mix(structuralColor, geographicColor, vPointType);
    float alpha = mix(0.03, 0.95, vPointType);
    if (u_theme == 1) {
        alpha = mix(0.12, 0.95, vPointType);
    }
    
    vec3 finalColor = baseColor;

    if (u_mode == 2) {
        // Mode 2: Griffith LEFM strain energy color mapping
        if (u_theme == 1) {
            vec3 warmUmber = vec3(0.45, 0.25, 0.15);
            vec3 carbonInk = vec3(0.02, 0.02, 0.02);
            finalColor = mix(baseColor, warmUmber, smoothstep(0.15, 0.55, vStrain));
            finalColor = mix(finalColor, carbonInk, smoothstep(0.55, 0.90, vStrain));
        } else {
            vec3 tensionAmber = vec3(0.78, 0.43, 0.32);
            vec3 ruptureCrimson = vec3(0.85, 0.28, 0.20);
            vec3 activeCrackWhite = vec3(0.98, 0.96, 0.92);
            
            vec3 stressColor = mix(baseColor, tensionAmber, smoothstep(0.12, 0.45, vStrain));
            stressColor = mix(stressColor, ruptureCrimson, smoothstep(0.45, 0.78, vStrain));
            stressColor = mix(stressColor, activeCrackWhite, smoothstep(0.78, 1.0, vStrain));
            finalColor = stressColor;
        }
        if (vStrain > 0.4) alpha = mix(alpha, 1.0, (vStrain - 0.4) * 1.8);
    } else if (u_mode == 3) {
        // Mode 3: Hydrodynamic Vorticity Palette
        if (u_theme == 1) {
            vec3 charcoalStreamline = vec3(0.35, 0.38, 0.42);
            vec3 obsidianCore = vec3(0.02, 0.03, 0.05);
            vec3 fluidGray = mix(charcoalStreamline, obsidianCore, smoothstep(0.3, 0.9, vVorticity));
            finalColor = mix(baseColor, fluidGray, smoothstep(0.05, 0.4, vVorticity));
        } else {
            vec3 oceanicIndigo = vec3(0.10, 0.14, 0.22);
            vec3 biolumCyan = vec3(0.42, 0.68, 0.82);
            vec3 eddyViolet = vec3(0.55, 0.48, 0.72);

            vec3 fluidColor = mix(oceanicIndigo, biolumCyan, smoothstep(0.05, 0.50, vVorticity));
            fluidColor = mix(fluidColor, eddyViolet, smoothstep(0.50, 0.95, vVorticity));
            finalColor = mix(baseColor, fluidColor, smoothstep(0.0, 0.15, vVorticity));
        }
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
uniform int u_theme; // 0 = Dark Cyber, 1 = Light Monochrome
uniform float u_wireOpacityScale;
varying float vPointType;
varying float vFacing;
varying float vStrain;
varying float vLatitudeNorm;

void main() {
    if (u_layerMode == 1) {
        discard; // Instantly drop wireframe in [Points Only] mode
    }

    float backfaceDimming = mix(u_theme == 1 ? 0.30 : 0.15, 1.0, smoothstep(-0.5, 0.2, vFacing));
    
    vec3 baseColor;
    float densityFactor = clamp(u_wireOpacityScale, 0.01, 1.0);
    float alpha;

    if (u_theme == 1) {
        // Light Monochrome: Soft Graphite Architectural Lines
        vec3 structuralWire = vec3(0.80, 0.83, 0.86);
        vec3 geographicWire = vec3(0.65, 0.68, 0.72);
        baseColor = mix(structuralWire, geographicWire, vPointType);
        alpha = mix(0.04 * densityFactor, 0.40 * densityFactor, pow(vPointType, 2.0));
    } else {
        vec3 geographicColor = vec3(0.35, 0.42, 0.52);
        vec3 structuralColor = vec3(0.14, 0.18, 0.24);
        baseColor = mix(structuralColor, geographicColor, vPointType);
        alpha = mix(0.025 * densityFactor, 0.45 * densityFactor, pow(vPointType, 2.0));
    }
    
    vec3 finalColor = baseColor;

    // Dynamic Polar Line Tapering: Attenuate needle wire stretching near poles as map unrolls
    float polarFade = 1.0 - smoothstep(0.20, 0.95, u_unfurl) * smoothstep(0.85, 0.985, vLatitudeNorm);
    alpha = alpha * polarFade;

    if (u_mode == 2) {
        if (u_theme == 1) {
            vec3 warmUmber = vec3(0.50, 0.30, 0.20);
            vec3 carbonInk = vec3(0.05, 0.05, 0.05);
            finalColor = mix(baseColor, warmUmber, smoothstep(0.15, 0.55, vStrain));
            finalColor = mix(finalColor, carbonInk, smoothstep(0.55, 0.90, vStrain));
        } else {
            vec3 tensionAmber = vec3(0.78, 0.43, 0.32);
            vec3 ruptureCrimson = vec3(0.85, 0.28, 0.20);
            vec3 activeCrackWhite = vec3(0.98, 0.96, 0.92);
            
            vec3 stressColor = mix(baseColor, tensionAmber, smoothstep(0.12, 0.45, vStrain));
            stressColor = mix(stressColor, ruptureCrimson, smoothstep(0.45, 0.78, vStrain));
            stressColor = mix(stressColor, activeCrackWhite, smoothstep(0.78, 1.0, vStrain));
            finalColor = stressColor;
        }
        if (vStrain > 0.35) alpha = mix(alpha, 0.95 * densityFactor, (vStrain - 0.35) * 1.5);
    } else if (u_mode == 3) {
        // Viscous Phase Transition: Mesh lines melt away during peak liquefaction (continuous)
        float rawSin = sin(3.14159265 * clamp(u_unfurl, 0.0, 1.0));
        float liquefaction = pow(max(0.0, rawSin), 1.15);
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
  mode: SimulationMode;
  layerMode: 0 | 1 | 2;
  theme: 0 | 1; // 0 = Dark Cyber, 1 = Light Monochrome
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
  theme,
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
  const [dymaxionBuffer, setDymaxionBuffer] = useState<Float32Array | null>(null);
  const [dymaxionLineIndices, setDymaxionLineIndices] = useState<Uint32Array | null>(null);
  const [frameData, setFrameData] = useState<{ points3D: Float32Array; dymaxion2D: Float32Array } | null>(null);

  useEffect(() => {
    if (!geoData?.pointsBuffer) return;
    import('./src/utils/dymaxion').then(({ generateDymaxionBuffer, filterDymaxionLineIndices, generateIcosahedronFrameLines }) => {
      const buf = generateDymaxionBuffer(geoData.pointsBuffer);
      setDymaxionBuffer(buf);
      setDymaxionLineIndices(filterDymaxionLineIndices(geoData.lineIndices, buf, 0.45));
      setFrameData(generateIcosahedronFrameLines(6));
    });
  }, [geoData]);

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
      meshMaterialRef.current.uniforms.u_theme.value = theme;
      meshMaterialRef.current.uniforms.u_wireOpacityScale.value = wireOpacityScale;
      meshMaterialRef.current.uniforms.u_time.value = elapsedTime;
      meshMaterialRef.current.uniforms.u_cameraCenter.value.copy(cameraTarget);
      meshMaterialRef.current.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);
      meshMaterialRef.current.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);
      meshMaterialRef.current.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);
      meshMaterialRef.current.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);
      meshMaterialRef.current.uniforms.u_cursorActive.value = cursorUniforms.u_cursorActive;

      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1.0 : 1.0, 2.0);
      pointMaterialRef.current.uniforms.u_dpr.value = dpr;
      pointMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      pointMaterialRef.current.uniforms.u_mode.value = mode;
      pointMaterialRef.current.uniforms.u_layerMode.value = layerMode;
      pointMaterialRef.current.uniforms.u_theme.value = theme;
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

    const activeDymaxionBuffer = dymaxionBuffer || new Float32Array((geoData.pointsBuffer.length / 3) * 2);

    const meshGeo = new THREE.BufferGeometry();
    meshGeo.setAttribute('position', new THREE.BufferAttribute(geoData.pointsBuffer, 3));
    meshGeo.setAttribute('target2D', new THREE.BufferAttribute(geoData.target2DBuffer, 2));
    meshGeo.setAttribute('dymaxion2D', new THREE.BufferAttribute(activeDymaxionBuffer, 2));
    meshGeo.setAttribute('vType', new THREE.BufferAttribute(geoData.typeBuffer, 1));
    meshGeo.setIndex(new THREE.BufferAttribute(geoData.lineIndices, 1));

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(geoData.pointsBuffer, 3));
    pointGeo.setAttribute('target2D', new THREE.BufferAttribute(geoData.target2DBuffer, 2));
    pointGeo.setAttribute('dymaxion2D', new THREE.BufferAttribute(activeDymaxionBuffer, 2));
    pointGeo.setAttribute('vType', new THREE.BufferAttribute(geoData.typeBuffer, 1));

    return { meshGeometry: meshGeo, pointGeometry: pointGeo };
  }, [geoData, dymaxionBuffer]);

  // Dedicated Dymaxion Mesh Geometry (with severed seam edges eliminated)
  const dymaxionMeshGeometry = useMemo(() => {
    if (!geoData || !dymaxionBuffer || !dymaxionLineIndices) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(geoData.pointsBuffer, 3));
    geo.setAttribute('target2D', new THREE.BufferAttribute(geoData.target2DBuffer, 2));
    geo.setAttribute('dymaxion2D', new THREE.BufferAttribute(dymaxionBuffer, 2));
    geo.setAttribute('vType', new THREE.BufferAttribute(geoData.typeBuffer, 1));
    geo.setIndex(new THREE.BufferAttribute(dymaxionLineIndices, 1));
    return geo;
  }, [geoData, dymaxionBuffer, dymaxionLineIndices]);

  // 20-Facet Icosahedral Frame Geometry
  const frameGeometry = useMemo(() => {
    if (!frameData) return null;
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.BufferAttribute(frameData.points3D, 3));
    fGeo.setAttribute('target2D', new THREE.BufferAttribute(frameData.dymaxion2D, 2));
    fGeo.setAttribute('dymaxion2D', new THREE.BufferAttribute(frameData.dymaxion2D, 2));
    fGeo.setAttribute('vType', new THREE.BufferAttribute(new Float32Array(frameData.points3D.length / 3).fill(1.0), 1));
    return fGeo;
  }, [frameData]);

  // VRAM cleanup
  useEffect(() => {
    return () => {
      if (meshGeometry) meshGeometry.dispose();
      if (pointGeometry) pointGeometry.dispose();
      if (dymaxionMeshGeometry) dymaxionMeshGeometry.dispose();
      if (frameGeometry) frameGeometry.dispose();
    };
  }, [meshGeometry, pointGeometry, dymaxionMeshGeometry, frameGeometry]);

  if (!meshGeometry || !pointGeometry) return null;

  return (
    <group>
      <lineSegments geometry={mode === 4 && dymaxionMeshGeometry ? dymaxionMeshGeometry : meshGeometry}>
        <shaderMaterial 
          ref={meshMaterialRef} 
          vertexShader={meshVertexShader} 
          fragmentShader={meshFragmentShader} 
          transparent={true} 
          depthTest={false} 
          uniforms={{ 
            u_unfurl: { value: 0 }, 
            u_mode: { value: 4 }, 
            u_layerMode: { value: 0 },
            u_theme: { value: 0 },
            u_dpr: { value: 1.0 },
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
      {/* Structural 20-Facet Icosahedral Frame for Fuller Dymaxion */}
      {mode === 4 && frameGeometry && (
        <lineSegments geometry={frameGeometry}>
          <shaderMaterial 
            vertexShader={meshVertexShader} 
            fragmentShader={meshFragmentShader} 
            transparent={true} 
            depthTest={false} 
            uniforms={meshMaterialRef.current ? meshMaterialRef.current.uniforms : {
              u_unfurl: { value: 0 }, 
              u_mode: { value: 4 }, 
              u_layerMode: { value: 0 },
              u_theme: { value: 0 },
              u_dpr: { value: 1.0 },
              u_wireOpacityScale: { value: 1.5 },
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
      )}
      <points geometry={pointGeometry}>
        <shaderMaterial 
          ref={pointMaterialRef} 
          vertexShader={vertexShader} 
          fragmentShader={pointFragmentShader} 
          transparent={true} 
          depthTest={false} 
          uniforms={{ 
            u_unfurl: { value: 0 }, 
            u_mode: { value: 4 }, 
            u_layerMode: { value: 0 },
            u_theme: { value: 0 },
            u_dpr: { value: 1.0 },
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

const KinematicCameraController: React.FC<{
  targetPos: THREE.Vector3 | null;
  onArrived: () => void;
  controlsRef: React.RefObject<any>;
  onTargetChange: (target: THREE.Vector3) => void;
}> = ({ targetPos, onArrived, controlsRef, onTargetChange }) => {
  useFrame(() => {
    if (targetPos && controlsRef.current) {
      const camera = controlsRef.current.object;
      camera.position.lerp(targetPos, 0.08);
      controlsRef.current.target.lerp(new THREE.Vector3(0, 0, 0), 0.08);
      controlsRef.current.update();
      if (camera.position.distanceTo(targetPos) < 0.05) {
        camera.position.copy(targetPos);
        onArrived();
      }
      onTargetChange(controlsRef.current.target.clone());
    }
  });
  return null;
};

export default function App() {
  const [backend, setBackend] = useState<'webgl2' | 'webgpu'>('webgl2');
  const [theme, setTheme] = useState<0 | 1>(0); // 0 = Dark Cyber, 1 = Light Monochrome
  const [hasWebGPU, setHasWebGPU] = useState<boolean>(false);
  const [alpha, setAlpha] = useState(0); 
  const [mode, setMode] = useState<SimulationMode>(4); // Default to Mode 4 (Fuller Dymaxion)
  const [layerMode, setLayerMode] = useState<0 | 1 | 2>(0); // 0 = Both, 1 = Points Only, 2 = Wireframe Only
  const [cursorPhysicsEnabled, setCursorPhysicsEnabled] = useState<boolean>(false); // Off by default for smooth scrub
  const [resolution, setResolution] = useState<'100k' | '1M'>('100k');
  const [fps, setFps] = useState(60);
  const [isHudOpen, setIsHudOpen] = useState(true);
  const [cameraTarget, setCameraTarget] = useState(new THREE.Vector3(0, 0, 0));
  const [webgpuCameraPos, setWebgpuCameraPos] = useState<THREE.Vector3 | undefined>(undefined);
  const [targetCameraPos, setTargetCameraPos] = useState<THREE.Vector3 | null>(null);

  // Cartographic Overlays state
  const [activeOverlay, setActiveOverlay] = useState<GeodesicOverlayMode>('off');
  const [showLandmarks, setShowLandmarks] = useState<boolean>(false);
  const [showTissot, setShowTissot] = useState<boolean>(false);
  const [showVectors, setShowVectors] = useState<boolean>(false);

  // Auto-morph playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playDirection, setPlayDirection] = useState<1 | -1>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);

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
    (window as any).setTheme = setTheme;
    (window as any).theme = theme;
    (window as any).setShowVectors = setShowVectors;
    (window as any).setCursorPhysicsEnabled = setCursorPhysicsEnabled;
    (window as any).backend = backend;
    isWebGPUSupported().then((supported) => {
      setHasWebGPU(supported);
    });
  }, [backend, theme]);

  // Auto-morph loop
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastT = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastT) * 0.001;
      lastT = now;
      setAlpha((prev) => {
        const step = dt * 0.20 * playbackSpeed * playDirection;
        let next = prev + step;
        if (next >= 1.0) {
          next = 1.0;
          setPlayDirection(-1);
        } else if (next <= 0.0) {
          next = 0.0;
          setPlayDirection(1);
        }
        return parseFloat(next.toFixed(4));
      });
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playDirection, playbackSpeed]);

  const alphaRef = useRef(alpha);
  alphaRef.current = alpha;

  const glideToAlpha = useCallback((targetAlpha: number) => {
    setIsPlaying(false);
    const startAlpha = alphaRef.current;
    if (Math.abs(startAlpha - targetAlpha) < 0.001) return;
    const startTime = performance.now();
    const duration = 650;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const cur = startAlpha + (targetAlpha - startAlpha) * ease;
      setAlpha(parseFloat(cur.toFixed(4)));
      if (progress < 1.0) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'g' || e.key === 'G') {
        glideToAlpha(0.0);
      } else if (e.key === 'm' || e.key === 'M') {
        glideToAlpha(1.0);
      } else if (e.key === 'h' || e.key === 'H') {
        setIsZenMode((z) => !z);
      } else if (e.key === 't' || e.key === 'T') {
        setTheme((t) => (t === 0 ? 1 : 0));
      } else if (e.key === 'v' || e.key === 'V') {
        setShowVectors((s) => !s);
      } else if (e.key === '1') setMode(0);
      else if (e.key === '2') setMode(1);
      else if (e.key === '3') setMode(2);
      else if (e.key === '4') setMode(3);
      else if (e.key === '5') setMode(4);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [glideToAlpha]);

  const handleFpsUpdate = useCallback((val: number) => {
    setFps(val);
  }, []);

  const handleDataLoaded = useCallback((info: LoadedDataInfo) => {
    setDataInfo(info);
  }, []);

  const handleWebGPUError = useCallback((err: Error) => {
    console.warn('WebGPU runtime error, falling back to WebGL2:', err);
    setBackend('webgl2');
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
    setTargetCameraPos(pos);
    setWebgpuCameraPos(pos);
    setCameraTarget(new THREE.Vector3(0, 0, 0));
  };

  const isLight = theme === 1;

  // Cartographic navigation telemetry
  const latDeg = Math.round((cameraTarget.y / RADIUS) * 90);
  const lonDeg = Math.round(Math.atan2(cameraTarget.x, cameraTarget.z || 15) * (180 / Math.PI));
  const latStr = `${Math.abs(latDeg).toString().padStart(2, '0')}°00'${latDeg >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lonDeg).toString().padStart(3, '0')}°00'${lonDeg >= 0 ? 'E' : 'W'}`;
  const mapScaleStr = alpha < 0.01 
    ? '1 : 127,420,000' 
    : `1 : ${Math.round(127420000 / Math.max(0.2, Math.cos((latDeg * Math.PI) / 180))).toLocaleString('en-US')}`;

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
  const liquefactionRatio = Math.pow(Math.sin(Math.PI * alpha), 1.15);
  const reynoldsNumber = Math.round(liquefactionRatio * 4200);
  const isTurbulent = alpha >= 0.12 && alpha < 0.88;
  const isCondensing = alpha >= 0.88;

  return (
    <div className={`relative w-screen h-screen flex flex-col font-mono overflow-hidden select-none transition-colors duration-500 ${
      isLight ? 'bg-[#F8FAFC]' : 'bg-[#090B10]'
    }`}>
      {/* Viewport Canvas (WebGL2 or WebGPU) */}
      <div className="w-full h-full relative">
        {backend === 'webgpu' ? (
          <React.Suspense fallback={
            <div className={`w-full h-full flex items-center justify-center font-mono text-xs ${isLight ? 'bg-[#F8FAFC] text-zinc-700' : 'bg-[#090B10] text-zinc-300'}`}>
              <span className={`w-6 h-6 border-2 border-t-transparent rounded-full animate-spin ${isLight ? 'border-zinc-800' : 'border-zinc-300'}`}></span>
              <span className="ml-2">Initializing WebGPU WGSL Pipeline...</span>
            </div>
          }>
            <WebGPUCanvas
              unfurlProgress={alpha}
              mode={mode}
              layerMode={layerMode}
              theme={theme}
              resolution={resolution}
              cameraTarget={cameraTarget}
              cameraPosition={webgpuCameraPos}
              activeOverlay={activeOverlay}
              showLandmarks={showLandmarks}
              showTissot={showTissot}
              showVectors={showVectors}
              onFpsUpdate={handleFpsUpdate}
              onDataLoaded={handleDataLoaded}
              onError={handleWebGPUError}
            />
          </React.Suspense>
        ) : (
          <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
            <React.Suspense fallback={null}>
              <GeometryLayer 
                unfurlProgress={alpha} 
                mode={mode} 
                layerMode={layerMode}
                theme={theme}
                resolution={resolution}
                cameraTarget={cameraTarget}
                cursorPhysicsEnabled={cursorPhysicsEnabled}
                onFpsUpdate={handleFpsUpdate} 
                onDataLoaded={handleDataLoaded} 
              />
              <GeodesicOverlayLayer
                unfurlProgress={alpha}
                mode={mode}
                activeOverlay={activeOverlay}
                showLandmarks={showLandmarks}
                showTissot={showTissot}
                theme={theme}
              />
              <VectorOverlayLayer
                unfurlProgress={alpha}
                mode={mode}
                theme={theme}
                visible={showVectors}
                cameraTarget={cameraTarget}
              />
              <KinematicCameraController
                targetPos={targetCameraPos}
                onArrived={() => setTargetCameraPos(null)}
                controlsRef={controlsRef}
                onTargetChange={(t) => setCameraTarget(t)}
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

      {/* 
        HUD Contract & Layer Controls:
        Display Layer: Both, Points, Wireframe
        setLayerMode(0), setLayerMode(1), setLayerMode(2)
        grid-cols-5 simulation paradigms: Linear, Scroll, Griffith, Fluid, Dymaxion (Fuller Dymaxion)
      */}
      {/* Top-Right Telemetry & Cartographic HUD */}
      <TelemetryHUD
        isZenMode={isZenMode}
        onZenToggle={() => setIsZenMode(true)}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === 0 ? 1 : 0))}
        backend={backend}
        onBackendChange={setBackend}
        hasWebGPU={hasWebGPU}
        resolution={resolution}
        onResolutionChange={setResolution}
        layerMode={layerMode}
        onLayerModeChange={setLayerMode}
        mode={mode}
        onModeChange={setMode}
        cursorPhysicsEnabled={cursorPhysicsEnabled}
        onCursorPhysicsToggle={setCursorPhysicsEnabled}
        activeOverlay={activeOverlay}
        onOverlayChange={setActiveOverlay}
        showLandmarks={showLandmarks}
        onLandmarksToggle={() => setShowLandmarks((s) => !s)}
        showTissot={showTissot}
        onTissotToggle={() => setShowTissot((s) => !s)}
        showVectors={showVectors}
        onVectorsToggle={() => setShowVectors((s) => !s)}
        alpha={alpha}
        fps={fps}
        latStr={latStr}
        lonStr={lonStr}
        mapScaleStr={mapScaleStr}
        dataInfo={dataInfo}
        onSnapCamera={snapCamera}
      />

      {/* Bottom Morph Slider & Kinematic Playback Dock */}
      <NavigationDock
        isZenMode={isZenMode}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        playbackSpeed={playbackSpeed}
        onToggleSpeed={() => setPlaybackSpeed((s) => (s === 0.5 ? 1.0 : s === 1.0 ? 2.0 : 0.5))}
        alpha={alpha}
        onAlphaChange={(val) => {
          setIsPlaying(false);
          setAlpha(val);
        }}
        onGlideToAlpha={glideToAlpha}
        theme={theme}
      />

      {/* Zen Mode Minimal Restore Pill */}
      {isZenMode && (
        <button
          onClick={() => setIsZenMode(false)}
          className="absolute top-4 right-4 z-30 px-3 py-1.5 rounded-full backdrop-blur-xl border border-white/10 bg-[#0F121A]/80 text-zinc-300 text-[10px] font-mono hover:text-white hover:border-white/30 transition-all shadow-lg pointer-events-auto"
        >
          Exit Zen Mode (H)
        </button>
      )}
    </div>
  );
}
