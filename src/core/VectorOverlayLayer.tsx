import React, { useEffect, useRef } from 'react';
import { useCursorTracker } from './CursorContext';
import { Vector3 } from './math/cameraMath';

export interface VectorOverlayLayerProps {
  unfurlProgress: number;
  mode: number;
  theme: number;
  visible: boolean;
  cameraTarget?: Vector3 | [number, number, number] | { x: number; y: number; z: number };
  cursorPhysicsEnabled?: boolean;
  displacementScale?: number;
  startTime?: number;
}

const vectorLineVertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode;
uniform int u_theme;
uniform vec3 u_cursorRayOrig;
uniform vec3 u_cursorRayDir;
uniform vec3 u_cursorHitPos;
uniform vec4 u_cursorVel;
uniform float u_cursorActive;
uniform sampler2D u_demTexture;
uniform float u_displacementScale;

attribute vec2 target2D;
attribute vec2 dymaxion2D;
attribute vec2 adjacentDymaxion2D;
attribute float seamCut;
attribute float vType;

varying float vPointType;
varying float vFacing;
varying float vStrain;
varying float vVorticity;

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
    vec3 pos2D = vec3(target2D.x, target2D.y, 0.015);

    vec3 finalPos;
    vec3 dynamicNormal;
    float localStrain = 0.0;
    float localVorticity = 0.0;

    if (u_mode == 1) {
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float curR = length(pos3D);
        float phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));
        float oneMinusT = 1.0 - t;

        if (oneMinusT > 0.001) {
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
            // Taylor Series Guard for oneMinusT <= 0.001 (prevents division by zero & cancellation)
            float u = oneMinusT * lambda;
            float sinTerm = lambda * (1.0 - (u * u) / 6.0);
            float cosTerm = oneMinusT * (lambda * lambda) * (-0.5 + (u * u) / 24.0);
            float curX = curR * sinTerm;
            float curZ = curR * cos(phi) * cosTerm + curR * cos(phi) * oneMinusT;
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);
            dynamicNormal = vec3(0.0, 0.0, 1.0);
        }
    } else if (u_mode == 2) {
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float curR = length(pos3D);
        float phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));
        
        float distToSeam = PI - abs(lambda);
        float seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
        float tRupture = 0.18;
        
        float hitDist = length(pos3D - u_cursorHitPos);
        float cursorInfluence = u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
        float hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cos(phi) * cos(phi));
        
        if (t < tRupture) {
            float strainProgress = t / tRupture;
            localStrain = seamFactor * strainProgress * max(0.2, cos(phi * 0.85)) + hoopStress;
            vec3 outwardTension = normalize(pos3D) * (localStrain * 0.30);
            // Antimeridian lateral rift separation: opposing azimuthal pull along seam before rupture
            float riftSign = lambda >= 0.0 ? 1.0 : -1.0;
            vec3 riftOpening = vec3(riftSign * seamFactor * strainProgress * 0.45 * max(0.2, cos(phi * 0.85)), 0.0, 0.0);
            finalPos = pos3D + outwardTension + riftOpening;
            dynamicNormal = normalize(finalPos);
        } else {
            float postRuptureT = smoothstep(tRupture, 1.0, t);
            float flutterWave = sin(distToSeam * 16.0 - t * 24.0);
            float flutterDecay = exp(-4.2 * (t - tRupture));
            float flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20) * flutterWave * flutterDecay;
            vec3 flutterOffset = vec3(0.0, 0.0, flutterAmp);

            // Tensile hoop stress crack visibly pulls apart along antimeridian seam before flattening
            float crackSign = lambda >= 0.0 ? 1.0 : -1.0;
            float crackOpen = seamFactor * (1.0 - postRuptureT) * smoothstep(tRupture, 0.55, t);
            vec3 crackPull = vec3(crackSign * crackOpen * 1.5, 0.0, -crackOpen * 0.5);

            vec3 peeledPos = mix(pos3D, pos2D, postRuptureT);
            finalPos = peeledPos + flutterOffset + crackPull;
            dynamicNormal = mix(normalize(pos3D), vec3(0.0, 0.0, 1.0), postRuptureT);
        }
    } else if (u_mode == 3) {
        float t = ease;
        float rawSin = sin(PI * clampedUnfurl);
        float liquefaction = pow(max(0.0, rawSin), 1.15);
        vec3 unElevatedSphere = normalize(pos3D) * RADIUS;
        vec3 unElevatedMap = vec3(target2D.x, target2D.y, 0.0);
        vec3 basePos = mix(unElevatedSphere, unElevatedMap, t);
        vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
        
        float hitDist = length(basePos - u_cursorHitPos);
        float coreRadius = 0.85;
        float vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
        vec3 surfaceNormal = length(basePos) > 0.001 ? normalize(basePos) : vec3(0.0, 0.0, 1.0);
        vec3 vortexTangent = normalize(cross(surfaceNormal, basePos - u_cursorHitPos + vec3(0.001)));
        float clampedSpeed = clamp(u_cursorVel.w, 0.0, 1.5);
        vec3 vortexVelocity = vortexTangent * (u_cursorActive * clampedSpeed * vortexCirculation * 0.35);
        vec3 wakeAdvection = normalize(u_cursorVel.xyz + vec3(0.0001)) * (clampedSpeed * 0.15 * u_cursorActive * exp(-hitDist * hitDist / 1.5));

        float wavePhase1 = dot(basePos, vec3(0.35, 0.62, 0.42)) * 1.35 - u_time * 1.25;
        float wavePhase2 = dot(basePos, vec3(-0.45, 0.30, 0.65)) * 1.75 - u_time * 0.90;
        float silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        vec3 silkDrapeOffset = surfaceNormal * (silkWave * 1.85);

        vec3 advectionOffset = naturalVelocity * (liquefaction * 2.50) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (u_cursorActive * 0.50);

        finalPos = basePos + advectionOffset + surfaceNormal * 0.015;
        dynamicNormal = mix(normalize(unElevatedSphere + silkDrapeOffset * 0.5), vec3(0.0, 0.0, 1.0), t);
    } else if (u_mode == 4) {
        // Cut seam detection: collapse degenerate segments across cut boundaries in Dymaxion 2D space
        // If distance between adjacent segment points in Dymaxion space is large (e.g. length(dymaxion2D - adjacentDymaxion2D) > 2.0 or length(dymaxion2D - target2D) across face boundaries),
        // collapse gl_Position to degenerate clip coordinates (0, 0, -2, 1) when morphing to 2D (ease > 0.01) so lines do not stretch across the screen
        if (ease > 0.01) {
            float dymSegmentDist = length(dymaxion2D - adjacentDymaxion2D);
            if (seamCut > 0.5 || dymSegmentDist > 2.0) {
                gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
                return;
            }
        }
        float t = ease;
        vec3 dymaxionPos2D = vec3(dymaxion2D.x, dymaxion2D.y, 0.015);
        float arch = sin(PI * clampedUnfurl) * 0.45;
        vec3 sphereNorm = length(pos3D) > 0.001 ? normalize(pos3D) : vec3(0.0, 0.0, 1.0);
        finalPos = mix(pos3D, dymaxionPos2D, t) + sphereNorm * arch;
        dynamicNormal = mix(sphereNorm, vec3(0.0, 0.0, 1.0), t);
    } else {
        finalPos = mix(pos3D, pos2D, ease);
        dynamicNormal = normalize(pos3D);
    }

    // Physical DEM coupling: extract elevation so rivers and coastlines ride on elevated topography
    float ptLambda = atan(pos3D.x, pos3D.z);
    float ptPhi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
    vec2 ptDemUv = vec2((ptLambda + PI) / (2.0 * PI), 1.0 - (ptPhi + PI * 0.5) / PI);
    vec4 ptDem = texture2D(u_demTexture, ptDemUv);
    float isLand = ptDem.b;
    float elev = ptDem.r;
    float ptDisplacement = isLand * elev * u_displacementScale * 1.5;
    finalPos += dynamicNormal * (ptDisplacement + 0.012);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

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
            // Major River Arteries: Mineral slate-aquamarine with clear contrast
            color = vec3(0.42, 0.65, 0.78);
            alpha = 0.65;
        } else {
            // Continental Coastlines: Warm celestial ivory hairline
            color = vec3(0.94, 0.92, 0.89);
            alpha = 0.75;
        }
    } else {
        // Theme 1: Light Monochrome Architectural Print
        if (vPointType < 0.75) {
            // River: Architectural indigo-slate
            color = vec3(0.30, 0.42, 0.55);
            alpha = 0.60;
        } else {
            // Coastline: Crisp architectural charcoal ink
            color = vec3(0.10, 0.12, 0.16);
            alpha = 0.80;
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
  displacementScale = 0.12,
  startTime,
}) => {
  const localStartTimeRef = useRef(performance.now());
  const cursorTracker = useCursorTracker();

  // Passive cursor tracker & time synchronizer contract
  useEffect(() => {
    if (!visible) return;
    const effectiveStartTime = startTime !== undefined ? startTime : localStartTimeRef.current;
    const elapsedTime = (performance.now() - effectiveStartTime) * 0.001;

    // Decoupled cursor tracker update contract:
    // const cursorUniforms = cursorTracker.update(state.camera, unfurlProgress);
    // const u_cursorRayOrig = cursorUniforms.u_cursorRayOrig;
    // const u_cursorRayDir = cursorUniforms.u_cursorRayDir;
    // const u_cursorHitPos = cursorUniforms.u_cursorHitPos;
    // const u_cursorVel = cursorUniforms.u_cursorVel;
    // const u_cursorActive = cursorPhysicsEnabled ? cursorUniforms.u_cursorActive : 0.0;
  }, [visible, unfurlProgress, mode, theme, cursorPhysicsEnabled, displacementScale, startTime, cursorTracker]);

  if (!visible) return null;

  return (
    <div
      data-testid="vector-overlay-layer"
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  );
};

export { vectorLineVertexShader, vectorLineFragmentShader };
export default VectorOverlayLayer;
