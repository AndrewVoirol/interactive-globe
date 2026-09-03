import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CursorTracker } from '../utils/raycast';

export interface VectorOverlayLayerProps {
  unfurlProgress: number;
  mode: number;
  theme: number;
  visible: boolean;
  cameraTarget?: THREE.Vector3;
  cursorPhysicsEnabled?: boolean;
  startTime?: number;
}

const vectorLineVertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode;
uniform int u_theme;
uniform vec3 u_cameraCenter;
uniform vec3 u_cursorRayOrig;
uniform vec3 u_cursorRayDir;
uniform vec3 u_cursorHitPos;
uniform vec4 u_cursorVel;
uniform float u_cursorActive;

attribute vec2 target2D;
attribute vec2 dymaxion2D;
attribute float vType;

varying float vPointType;
varying float vFacing;

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
    float clampedUnfurl = clamp(u_unfurl, 0.0, 1.0);
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    vec3 pos3D = position;
    // Slight elevation in 2D to avoid coplanar z-fighting with the base plane
    vec3 pos2D = vec3(target2D.x, target2D.y, 0.015);

    vec3 finalPos;
    vec3 dynamicNormal;

    if (u_mode == 1) {
        // =========================================================================
        // Mode 1: Constant-Radius Cylindrical Scroll
        // =========================================================================
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float curR = length(pos3D);
        float phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));

        if (t < 0.999) {
            float invOneMinusT = 1.0 / (1.0 - t);
            float curAngle = (1.0 - t) * lambda;
            
            float curX = (curR * invOneMinusT) * sin(curAngle);
            float curZ = (curR * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (curR * cos(phi) * (1.0 - t));
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);

            vec3 T_lambda = vec3(curR * cos(curAngle), 0.0, -curR * cos(phi) * sin(curAngle));
            vec3 T_phi = vec3(0.0, mix(curR * cos(phi), curR / max(cos(phi), 0.05), t), -curR * sin(phi) * invOneMinusT * (cos(curAngle) - 1.0) - curR * sin(phi) * (1.0 - t));
            vec3 rawNorm = cross(T_lambda, T_phi);
            dynamicNormal = length(rawNorm) > 0.0001 ? normalize(rawNorm) : normalize(pos3D);
        } else {
            finalPos = pos2D;
            dynamicNormal = vec3(0.0, 0.0, 1.0);
        }
    } else if (u_mode == 2) {
        // =========================================================================
        // Mode 2: Griffith Linear Elastic Fracture Mechanics (LEFM)
        // =========================================================================
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float curR = length(pos3D);
        float phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));
        
        float distToSeam = PI - abs(lambda);
        float seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
        float tRupture = 0.18;
        
        // Passive cursor raycast distance and tensile hoop stress concentration
        float hitDist = length(pos3D - u_cursorHitPos);
        float cursorInfluence = u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
        float hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cos(phi) * cos(phi));
        
        if (t < tRupture) {
            float strainProgress = t / tRupture;
            float localStrain = seamFactor * strainProgress * max(0.2, cos(phi * 0.85)) + hoopStress;
            vec3 outwardTension = normalize(pos3D) * (localStrain * 0.30);
            finalPos = pos3D + outwardTension;
            dynamicNormal = normalize(finalPos);
        } else {
            float postRuptureT = smoothstep(tRupture, 1.0, t);
            float flutterWave = sin(distToSeam * 16.0 - t * 24.0);
            float flutterDecay = exp(-4.2 * (t - tRupture));
            float flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20) * flutterWave * flutterDecay;
            vec3 flutterOffset = vec3(0.0, 0.0, flutterAmp);

            vec3 peeledPos = mix(pos3D, pos2D, postRuptureT);
            finalPos = peeledPos + flutterOffset;
            dynamicNormal = mix(normalize(pos3D), vec3(0.0, 0.0, 1.0), postRuptureT);
        }
    } else if (u_mode == 3) {
        // =========================================================================
        // Mode 3: Incompressible Fluid Advection
        // =========================================================================
        float t = ease;
        float rawSin = sin(PI * clampedUnfurl);
        float liquefaction = pow(max(0.0, rawSin), 1.15);
        vec3 unElevatedSphere = normalize(pos3D) * RADIUS;
        vec3 unElevatedMap = vec3(target2D.x, target2D.y, 0.0);
        vec3 basePos = mix(unElevatedSphere, unElevatedMap, t);
        vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
        
        // Passive cursor vortex perturbation
        float hitDist = length(basePos - u_cursorHitPos);
        float coreRadius = 0.85;
        float vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
        vec3 surfaceNormal = length(basePos) > 0.001 ? normalize(basePos) : vec3(0.0, 0.0, 1.0);
        vec3 vortexTangent = normalize(cross(surfaceNormal, basePos - u_cursorHitPos + vec3(0.001)));
        float clampedSpeed = clamp(u_cursorVel.w, 0.0, 1.5);
        vec3 vortexVelocity = vortexTangent * (u_cursorActive * clampedSpeed * vortexCirculation * 0.35);
        vec3 wakeAdvection = normalize(u_cursorVel.xyz + vec3(0.0001)) * (clampedSpeed * 0.15 * u_cursorActive * exp(-hitDist * hitDist / 1.5));

        // Silk drape wave dynamics
        float wavePhase1 = dot(basePos, vec3(0.35, 0.62, 0.42)) * 1.35 - u_time * 1.25;
        float wavePhase2 = dot(basePos, vec3(-0.45, 0.30, 0.65)) * 1.75 - u_time * 0.90;
        float silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        vec3 silkDrapeOffset = surfaceNormal * silkWave;

        vec3 advectionOffset = naturalVelocity * (liquefaction * 1.55) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (u_cursorActive * 0.25);

        finalPos = basePos + advectionOffset + surfaceNormal * 0.015;
        dynamicNormal = mix(normalize(unElevatedSphere + silkDrapeOffset * 0.5), vec3(0.0, 0.0, 1.0), t);
    } else if (u_mode == 4) {
        // =========================================================================
        // Mode 4: Fuller Dymaxion Polyhedral Net Unfolding
        // =========================================================================
        float t = ease;
        vec3 dymaxionPos2D = vec3(dymaxion2D.x, dymaxion2D.y, 0.015);
        float arch = sin(PI * clampedUnfurl) * 0.45;
        vec3 sphereNorm = length(pos3D) > 0.001 ? normalize(pos3D) : vec3(0.0, 0.0, 1.0);
        finalPos = mix(pos3D, dymaxionPos2D, t) + sphereNorm * arch;
        dynamicNormal = mix(sphereNorm, vec3(0.0, 0.0, 1.0), t);
    } else {
        // Mode 0: Linear Mix
        finalPos = mix(pos3D, pos2D, ease);
        dynamicNormal = normalize(pos3D);
    }

    // Camera-Relative RTC Projection
    vec3 rtcPos = finalPos - u_cameraCenter;
    vec4 mvPosition = modelViewMatrix * vec4(rtcPos + u_cameraCenter, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Correct view-space normal transformation for backface culling
    vec3 viewNormal = normalize(normalMatrix * dynamicNormal);
    vec3 viewDir = -normalize(mvPosition.xyz);
    float facing = dot(viewNormal, viewDir);

    if (u_mode == 1 || u_mode == 2 || u_mode == 3 || u_mode == 4) {
        vFacing = mix(facing, dot(normalize(normalMatrix * vec3(0.0, 0.0, 1.0)), viewDir), pow(ease, 2.0));
    } else {
        vFacing = mix(facing, 1.0, ease);
    }
}
`;

const vectorLineFragmentShader = `
uniform int u_theme;
uniform float u_unfurl;
uniform int u_mode;
varying float vPointType;
varying float vFacing;

void main() {
    // Backface attenuation when near spherical state
    float sphereFactor = 1.0 - smoothstep(0.0, 0.35, u_unfurl);
    if (sphereFactor > 0.0 && vFacing < -0.15) {
        discard; // Suppress backface lines on far side of the globe
    }

    // Fade backface lines near the horizon gently
    float facingFade = mix(0.3, 1.0, smoothstep(-0.15, 0.25, vFacing));

    vec3 color;
    float alpha;

    if (u_theme == 0) {
        // Theme 0: Obsidian & Celestial Platinum
        if (vPointType < 0.75) {
            // Major River Arteries: Mineral slate-aquamarine
            color = vec3(0.42, 0.65, 0.78);
            alpha = 0.40;
        } else {
            // Continental Coastlines: Warm celestial ivory hairline
            color = vec3(0.94, 0.92, 0.89);
            alpha = 0.55;
        }
    } else {
        // Theme 1: Light Monochrome Architectural Print
        if (vPointType < 0.75) {
            // River: Muted slate
            color = vec3(0.30, 0.42, 0.55);
            alpha = 0.35;
        } else {
            // Coastline: Architectural charcoal ink
            color = vec3(0.10, 0.12, 0.16);
            alpha = 0.55;
        }
    }

    gl_FragColor = vec4(color, alpha * facingFade);
}
`;

export const VectorOverlayLayer: React.FC<VectorOverlayLayerProps> = ({
  unfurlProgress,
  mode,
  theme,
  visible,
  cameraTarget,
  cursorPhysicsEnabled = true,
  startTime,
}) => {
  const lineSegmentsRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const localStartTimeRef = useRef(performance.now());

  // Passive cursor tracker for fluid vortex and Griffith hoop stress interaction
  const cursorTracker = useMemo(() => new CursorTracker(), []);

  useEffect(() => {
    cursorTracker.attach(window);
    return () => {
      cursorTracker.detach();
    };
  }, [cursorTracker]);

  // Lazy fetch the zero-copy binary buffer only when first enabled
  useEffect(() => {
    if (!visible || geometry) return;

    let isMounted = true;
    fetch('/geo-vectors.bin')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.arrayBuffer();
      })
      .then((arrayBuffer) => {
        if (!isMounted) return;

        const view = new DataView(arrayBuffer);
        const magic = view.getUint32(0, true);
        if (magic !== 0x47564543) {
          console.warn('VectorOverlayLayer: Invalid GVEC magic header:', magic.toString(16));
          return;
        }

        const vertexCount = view.getUint32(8, true);
        const indexCount = view.getUint32(12, true);

        let offset = 32;
        const positions = new Float32Array(arrayBuffer, offset, vertexCount * 3);
        offset += vertexCount * 3 * 4;

        const target2D = new Float32Array(arrayBuffer, offset, vertexCount * 2);
        offset += vertexCount * 2 * 4;

        const dymaxion2D = new Float32Array(arrayBuffer, offset, vertexCount * 2);
        offset += vertexCount * 2 * 4;

        const vType = new Float32Array(arrayBuffer, offset, vertexCount * 1);
        offset += vertexCount * 1 * 4;

        const indices = new Uint32Array(arrayBuffer, offset, indexCount);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('target2D', new THREE.BufferAttribute(target2D, 2));
        geo.setAttribute('dymaxion2D', new THREE.BufferAttribute(dymaxion2D, 2));
        geo.setAttribute('vType', new THREE.BufferAttribute(vType, 1));
        geo.setIndex(new THREE.BufferAttribute(indices, 1));

        setGeometry(geo);
      })
      .catch((err) => {
        console.warn('Failed to load geo-vectors.bin:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [visible, geometry]);

  const uniforms = useMemo(
    () => ({
      u_unfurl: { value: unfurlProgress },
      u_time: { value: 0 },
      u_mode: { value: mode },
      u_theme: { value: theme },
      u_cameraCenter: { value: new THREE.Vector3(0, 0, 0) },
      u_cursorRayOrig: { value: new THREE.Vector3(0, 0, 0) },
      u_cursorRayDir: { value: new THREE.Vector3(0, 0, 1) },
      u_cursorHitPos: { value: new THREE.Vector3(0, 0, 0) },
      u_cursorVel: { value: new THREE.Vector4(0, 0, 0, 0) },
      u_cursorActive: { value: 0.0 },
    }),
    []
  );

  useFrame((state) => {
    if (!materialRef.current || !visible) return;
    const mat = materialRef.current;
    const effectiveStartTime = startTime !== undefined ? startTime : localStartTimeRef.current;
    mat.uniforms.u_unfurl.value = unfurlProgress;
    mat.uniforms.u_time.value = (performance.now() - effectiveStartTime) * 0.001;
    mat.uniforms.u_mode.value = mode;
    mat.uniforms.u_theme.value = theme;
    if (cameraTarget) {
      mat.uniforms.u_cameraCenter.value.copy(cameraTarget);
    }

    // Sample passive cursor tracker
    const cursorUniforms = cursorTracker.update(state.camera, unfurlProgress);
    mat.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);
    mat.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);
    mat.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);
    mat.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);
    mat.uniforms.u_cursorActive.value = cursorPhysicsEnabled ? cursorUniforms.u_cursorActive : 0.0;
  });

  if (!visible || !geometry) return null;

  return (
    <lineSegments ref={lineSegmentsRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vectorLineVertexShader}
        fragmentShader={vectorLineFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </lineSegments>
  );
};
