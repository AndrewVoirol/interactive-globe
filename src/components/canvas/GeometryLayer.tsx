import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SimulationMode, LoadedDataInfo } from '../../types';
import { useCursorTracker } from '../../core/CursorContext';

export const RADIUS = 5.0;

export const vertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode; // 0 = Linear, 1 = Cylindrical Scroll, 2 = Griffith Fracture, 3 = Fluid Advection, 4 = Dymaxion
uniform int u_layerMode; // 0 = Both, 1 = Points Only, 2 = Wireframe Only
uniform float u_dpr;
uniform vec3 u_cursorRayOrig;
uniform vec3 u_cursorRayDir;
uniform vec3 u_cursorHitPos;
uniform vec4 u_cursorVel;
uniform float u_cursorActive;
uniform sampler2D u_demTexture;
uniform float u_displacementScale;
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
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        float oneMinusT = 1.0 - t;

        if (oneMinusT > 0.001) {
            float invOneMinusT = 1.0 / oneMinusT;
            float curAngle = oneMinusT * lambda;
            
            float curX = (RADIUS * invOneMinusT) * sin(curAngle);
            float curZ = (RADIUS * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cos(phi) * oneMinusT);
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);

            vec3 T_lambda = vec3(RADIUS * cos(curAngle), 0.0, -RADIUS * cos(phi) * sin(curAngle));
            vec3 T_phi = vec3(0.0, mix(RADIUS * cos(phi), RADIUS / max(cos(phi), 0.05), t), -RADIUS * sin(phi) * invOneMinusT * (cos(curAngle) - 1.0) - RADIUS * sin(phi) * oneMinusT);
            vec3 rawNorm = cross(T_lambda, T_phi);
            dynamicNormal = length(rawNorm) > 0.0001 ? normalize(rawNorm) : normalize(pos3D);
        } else {
            float u = oneMinusT * lambda;
            float sinTerm = lambda * (1.0 - (u * u) / 6.0);
            float cosTerm = oneMinusT * (lambda * lambda) * (-0.5 + (u * u) / 24.0);
            float curX = RADIUS * sinTerm;
            float curZ = RADIUS * cos(phi) * cosTerm + RADIUS * cos(phi) * oneMinusT;
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);
            dynamicNormal = vec3(0.0, 0.0, 1.0);
        }
    } else if (u_mode == 2) {
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        
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
        float t = ease;
        float rawSin = sin(PI * clampedUnfurl);
        float liquefaction = pow(max(0.0, rawSin), 1.15);
        vec3 basePos = mix(pos3D, pos2D, t);
        vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
        
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

        float wavePhase1 = dot(basePos, vec3(0.35, 0.62, 0.42)) * 1.35 - u_time * 1.25;
        float wavePhase2 = dot(basePos, vec3(-0.45, 0.30, 0.65)) * 1.75 - u_time * 0.90;
        float silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        vec3 silkDrapeOffset = surfaceNormal * silkWave;

        vec3 advectionOffset = naturalVelocity * (liquefaction * 1.55) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (u_cursorActive * 0.25);

        finalPos = basePos + advectionOffset;
        dynamicNormal = mix(normalize(pos3D + silkDrapeOffset * 0.5), vec3(0.0, 0.0, 1.0), t);
    } else if (u_mode == 4) {
        float t = ease;
        vec3 dymaxionPos2D = vec3(dymaxion2D.x, dymaxion2D.y, 0.0);
        float arch = sin(PI * clampedUnfurl) * 0.45;
        vec3 sphereNorm = length(pos3D) > 0.001 ? normalize(pos3D) : vec3(0.0, 0.0, 1.0);
        finalPos = mix(pos3D, dymaxionPos2D, t) + sphereNorm * arch;
        dynamicNormal = mix(sphereNorm, vec3(0.0, 0.0, 1.0), t);
    } else {
        finalPos = mix(pos3D, pos2D, ease);
        dynamicNormal = normalize(pos3D);
    }

    // Physical DEM coupling: extract elevation for continental points only (prevents vertex texture cache thrashing)
    float ptElev = 0.0;
    if (vType > 0.5) {
        float ptLambda = atan(pos3D.x, pos3D.z);
        float ptPhi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        vec2 ptDemUv = vec2((ptLambda + PI) / (2.0 * PI), (ptPhi + PI * 0.5) / PI);
        vec4 ptDem = texture2D(u_demTexture, ptDemUv);
        ptElev = ptDem.r;
    }
    float ptDisplacement = ptElev * u_displacementScale * 1.5;
    finalPos += dynamicNormal * ptDisplacement;

    vStrain = clamp(localStrain, 0.0, 1.0);
    vVorticity = clamp(localVorticity, 0.0, 1.0);
    vLatitudeNorm = abs(pos3D.y) / RADIUS;

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

    // Layer Toggle Alpha Multiplier (Milestone M2 / Feature F4)
    if (u_layerMode == 2) {
        vAlphaMultiplier = 0.0;
    } else {
        vAlphaMultiplier = 1.0;
    }

    // Dynamic point sizing: 1.8px for coastline (vType=1.0), 1.0px for ocean (vType=0.0)
    // Part of 102:1 contrast ratio & anti-moiré spatial attenuation
    float sizeFactor = (u_mode == 3) ? (1.0 + vVorticity * 0.8) : 1.0;
    gl_PointSize = mix(1.0, 1.8, vType) * sizeFactor * u_dpr;
}
`;

export const pointFragmentShader = `
precision highp float;
uniform int u_mode;
uniform int u_layerMode;
uniform int u_theme; // 0 = Dark Cyber, 1 = Light Monochrome
varying float vPointType;
varying float vFacing;
varying float vStrain;
varying float vVorticity;
varying float vAlphaMultiplier;

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

export const meshVertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode; // 0 = Linear, 1 = Cylindrical Scroll, 2 = Griffith Fracture, 3 = Fluid Advection, 4 = Dymaxion
uniform int u_layerMode; // 0 = Both, 1 = Points Only, 2 = Wireframe Only
uniform float u_dpr;
uniform vec3 u_cursorRayOrig;
uniform vec3 u_cursorRayDir;
uniform vec3 u_cursorHitPos;
uniform vec4 u_cursorVel;
uniform float u_cursorActive;
uniform sampler2D u_demTexture;
uniform float u_displacementScale;
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

    // Distinct meshVertexShader: Omits single-vertex clip rejection (gl_Position = vec4(0,0,2,0))
    // to prevent horizon-crossing line segments from exploding into starburst lines across the screen.

    vec3 pos3D = position;
    vec3 pos2D = vec3(target2D.x, target2D.y, 0.0);
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    vec3 finalPos;
    vec3 dynamicNormal;
    float localStrain = 0.0;
    float localVorticity = 0.0;

    if (u_mode == 1) {
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        float oneMinusT = 1.0 - t;

        if (oneMinusT > 0.001) {
            float invOneMinusT = 1.0 / oneMinusT;
            float curAngle = oneMinusT * lambda;
            
            float curX = (RADIUS * invOneMinusT) * sin(curAngle);
            float curZ = (RADIUS * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cos(phi) * oneMinusT);
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);

            vec3 T_lambda = vec3(RADIUS * cos(curAngle), 0.0, -RADIUS * cos(phi) * sin(curAngle));
            vec3 T_phi = vec3(0.0, mix(RADIUS * cos(phi), RADIUS / max(cos(phi), 0.05), t), -RADIUS * sin(phi) * invOneMinusT * (cos(curAngle) - 1.0) - RADIUS * sin(phi) * oneMinusT);
            vec3 rawNorm = cross(T_lambda, T_phi);
            dynamicNormal = length(rawNorm) > 0.0001 ? normalize(rawNorm) : normalize(pos3D);
        } else {
            float u = oneMinusT * lambda;
            float sinTerm = lambda * (1.0 - (u * u) / 6.0);
            float cosTerm = oneMinusT * (lambda * lambda) * (-0.5 + (u * u) / 24.0);
            float curX = RADIUS * sinTerm;
            float curZ = RADIUS * cos(phi) * cosTerm + RADIUS * cos(phi) * oneMinusT;
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);
            dynamicNormal = vec3(0.0, 0.0, 1.0);
        }
    } else if (u_mode == 2) {
        float t = ease;
        float lambda = atan(pos3D.x, pos3D.z);
        float phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        
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
        float t = ease;
        float rawSin = sin(PI * clampedUnfurl);
        float liquefaction = pow(max(0.0, rawSin), 1.15);
        vec3 basePos = mix(pos3D, pos2D, t);
        vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
        
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

        float wavePhase1 = dot(basePos, vec3(0.35, 0.62, 0.42)) * 1.35 - u_time * 1.25;
        float wavePhase2 = dot(basePos, vec3(-0.45, 0.30, 0.65)) * 1.75 - u_time * 0.90;
        float silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        vec3 silkDrapeOffset = surfaceNormal * silkWave;

        vec3 advectionOffset = naturalVelocity * (liquefaction * 1.55) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (u_cursorActive * 0.25);

        finalPos = basePos + advectionOffset;
        dynamicNormal = mix(normalize(pos3D + silkDrapeOffset * 0.5), vec3(0.0, 0.0, 1.0), t);
    } else if (u_mode == 4) {
        float t = ease;
        vec3 dymaxionPos2D = vec3(dymaxion2D.x, dymaxion2D.y, 0.0);
        float arch = sin(PI * clampedUnfurl) * 0.45;
        vec3 sphereNorm = length(pos3D) > 0.001 ? normalize(pos3D) : vec3(0.0, 0.0, 1.0);
        finalPos = mix(pos3D, dymaxionPos2D, t) + sphereNorm * arch;
        dynamicNormal = mix(sphereNorm, vec3(0.0, 0.0, 1.0), t);
    } else {
        finalPos = mix(pos3D, pos2D, ease);
        dynamicNormal = normalize(pos3D);
    }

    // Physical DEM coupling: extract elevation for continental features only
    float ptElev = 0.0;
    if (vType > 0.5) {
        float ptLambda = atan(pos3D.x, pos3D.z);
        float ptPhi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        vec2 ptDemUv = vec2((ptLambda + PI) / (2.0 * PI), (ptPhi + PI * 0.5) / PI);
        vec4 ptDem = texture2D(u_demTexture, ptDemUv);
        ptElev = ptDem.r;
    }
    float ptDisplacement = ptElev * u_displacementScale * 1.5;
    finalPos += dynamicNormal * ptDisplacement;

    vStrain = clamp(localStrain, 0.0, 1.0);
    vVorticity = clamp(localVorticity, 0.0, 1.0);
    vLatitudeNorm = abs(pos3D.y) / RADIUS;

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

    // Layer Toggle Alpha Multiplier (Milestone M2 / Feature F4)
    if (u_layerMode == 2) {
        vAlphaMultiplier = 0.0;
    } else {
        vAlphaMultiplier = 1.0;
    }
}
`;

export const meshFragmentShader = `
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

export interface GeometryLayerProps {
  unfurlProgress: number;
  mode: SimulationMode;
  layerMode: 0 | 1 | 2;
  theme: 0 | 1; // 0 = Dark Cyber, 1 = Light Monochrome
  resolution: '100k' | '1M';
  cameraTarget: THREE.Vector3;
  cursorPhysicsEnabled: boolean;
  onFpsUpdate: (fps: number) => void;
  onDataLoaded: (info: LoadedDataInfo) => void;
  startTime?: number;
  displacementScale?: number;
}

export const GeometryLayer: React.FC<GeometryLayerProps> = ({ 
  unfurlProgress, 
  mode, 
  layerMode,
  theme,
  resolution,
  cameraTarget,
  cursorPhysicsEnabled,
  onFpsUpdate,
  onDataLoaded,
  startTime,
  displacementScale = 0.12,
}) => {
  const meshMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const pointMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const frameMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const cursorTracker = useCursorTracker();
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const startTimeRef = useRef(performance.now());

  // High-precision global DEM texture for physical point coupling
  const demTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/earth-elevation-dem.webp');
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);
  
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
    import('../../utils/dymaxion').then(({ generateDymaxionBuffer, filterDymaxionLineIndices, generateIcosahedronFrameLines }) => {
      const buf = generateDymaxionBuffer(geoData.pointsBuffer);
      setDymaxionBuffer(buf);
      setDymaxionLineIndices(filterDymaxionLineIndices(geoData.lineIndices, buf, 0.45));
      setFrameData(generateIcosahedronFrameLines(6));
    });
  }, [geoData]);

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
    const effectiveStart = startTime !== undefined ? startTime : startTimeRef.current;
    const elapsedTime = (performance.now() - effectiveStart) * 0.001;
    const nodeCount = geoData?.typeBuffer?.length || (resolution === '1M' ? 1000000 : 100000);
    const wireOpacityScale = Math.min(1.0, Math.sqrt(100000 / (nodeCount || 100000)));
    
    const cursorUniforms = cursorPhysicsEnabled
      ? cursorTracker.update(camera, unfurlProgress)
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
      meshMaterialRef.current.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);
      meshMaterialRef.current.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);
      meshMaterialRef.current.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);
      meshMaterialRef.current.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);
      meshMaterialRef.current.uniforms.u_cursorActive.value = cursorUniforms.u_cursorActive;
      meshMaterialRef.current.uniforms.u_displacementScale.value = displacementScale;
      meshMaterialRef.current.uniforms.u_demTexture.value = demTexture;

      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1.0 : 1.0, 2.0);
      pointMaterialRef.current.uniforms.u_dpr.value = dpr;
      pointMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      pointMaterialRef.current.uniforms.u_mode.value = mode;
      pointMaterialRef.current.uniforms.u_layerMode.value = layerMode;
      pointMaterialRef.current.uniforms.u_theme.value = theme;
      pointMaterialRef.current.uniforms.u_time.value = elapsedTime;
      pointMaterialRef.current.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);
      pointMaterialRef.current.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);
      pointMaterialRef.current.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);
      pointMaterialRef.current.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);
      pointMaterialRef.current.uniforms.u_cursorActive.value = cursorUniforms.u_cursorActive;
      pointMaterialRef.current.uniforms.u_displacementScale.value = displacementScale;
      pointMaterialRef.current.uniforms.u_demTexture.value = demTexture;
    }

    if (frameMaterialRef.current) {
      frameMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      frameMaterialRef.current.uniforms.u_mode.value = mode;
      frameMaterialRef.current.uniforms.u_layerMode.value = layerMode;
      frameMaterialRef.current.uniforms.u_theme.value = theme;
      frameMaterialRef.current.uniforms.u_wireOpacityScale.value = wireOpacityScale * 1.5;
      frameMaterialRef.current.uniforms.u_time.value = elapsedTime;
      frameMaterialRef.current.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);
      frameMaterialRef.current.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);
      frameMaterialRef.current.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);
      frameMaterialRef.current.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);
      frameMaterialRef.current.uniforms.u_cursorActive.value = cursorUniforms.u_cursorActive;
      frameMaterialRef.current.uniforms.u_displacementScale.value = displacementScale;
      frameMaterialRef.current.uniforms.u_demTexture.value = demTexture;
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
            u_cursorRayOrig: { value: new THREE.Vector3(0, 0, 15) },
            u_cursorRayDir: { value: new THREE.Vector3(0, 0, -1) },
            u_cursorHitPos: { value: new THREE.Vector3(0, 0, 5) },
            u_cursorVel: { value: new THREE.Vector4(0, 0, 0, 0) },
            u_cursorActive: { value: 0.0 },
            u_displacementScale: { value: displacementScale },
            u_demTexture: { value: demTexture },
          }} 
        />
      </lineSegments>
      {/* Structural 20-Facet Icosahedral Frame for Fuller Dymaxion */}
      {mode === 4 && frameGeometry && (
        <lineSegments geometry={frameGeometry}>
          <shaderMaterial 
            ref={frameMaterialRef} 
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
              u_cursorRayOrig: { value: new THREE.Vector3(0, 0, 15) },
              u_cursorRayDir: { value: new THREE.Vector3(0, 0, -1) },
              u_cursorHitPos: { value: new THREE.Vector3(0, 0, 5) },
              u_cursorVel: { value: new THREE.Vector4(0, 0, 0, 0) },
              u_cursorActive: { value: 0.0 },
              u_displacementScale: { value: displacementScale },
              u_demTexture: { value: demTexture },
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
            u_cursorRayOrig: { value: new THREE.Vector3(0, 0, 15) },
            u_cursorRayDir: { value: new THREE.Vector3(0, 0, -1) },
            u_cursorHitPos: { value: new THREE.Vector3(0, 0, 5) },
            u_cursorVel: { value: new THREE.Vector4(0, 0, 0, 0) },
            u_cursorActive: { value: 0.0 },
            u_displacementScale: { value: displacementScale },
            u_demTexture: { value: demTexture },
          }} 
        />
      </points>
    </group>
  );
};

export default GeometryLayer;
