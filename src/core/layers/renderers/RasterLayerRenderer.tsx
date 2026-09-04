// ============================================================================
// File: src/core/layers/renderers/RasterLayerRenderer.tsx
// Ingestion Sub-Renderer: Precision Web Mercator Raster Imagery & 3D Crustal DEM
// Features: NASA/GEBCO 3D Topography + Bathymetry, true physical crustal displacement,
//           dynamic analytical hillshading, ocean depth gradients, and Mode 0-3 morphing.
// ============================================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RasterTileDataSource } from '../../data/RasterTileDataSource';
import { BlendModeType, DataLayerRenderStyle } from '../../data/DataLayerCatalog';

export interface RasterLayerRendererProps {
  visible: boolean;
  unfurlProgress: number;
  mode: number;
  theme: number;
  sourceUrl?: string;
  opacity?: number;
  blendMode?: BlendModeType;
  displacementScale?: number;
  elevationEncoding?: 'luminance' | 'mapbox' | 'terrarium';
  sunAzimuth?: number;
  sunAltitude?: number;
  hillshadeIntensity?: number;
  includeBathymetry?: boolean;
  renderStyle?: DataLayerRenderStyle;
  resolution?: '100k' | '1M';
}

const tileOverlayVertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode; // 0 = Linear, 1 = Scroll, 2 = Griffith, 3 = Fluid, 4 = Dymaxion
uniform float u_displacementScale;
uniform int u_includeBathymetry;
uniform int u_renderStyle; // 0 = Architectural, 1 = Hybrid, 2 = Photoreal
uniform sampler2D u_tileTexture;
uniform sampler2D u_demTexture;

attribute vec2 target2D;
attribute vec2 demUv;

varying vec2 vUv;
varying vec2 vDemUv;
varying float vFacing;
varying float vDisplacement;
varying float vElevNormalized;
varying float vIsLand;
varying float vModeAlpha;

const float RADIUS = 4.985;
const float PI = 3.14159265358979323846;

// Analytical 3D Solenoidal Vector Field for Mode 3 Fluid Advection
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
    vUv = uv;
    vDemUv = demUv;
    float clampedUnfurl = clamp(u_unfurl, 0.0, 1.0);
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    vec3 pos3D = position;
    vec3 pos2D = vec3(target2D.x, target2D.y, 0.005);

    vec3 finalPos;
    vec3 dynamicNormal;

    // Exact analytic spherical coordinates from demUv (eliminates antimeridian branch-cut flips)
    float lambda = -PI + demUv.x * 2.0 * PI;
    float phi = -PI * 0.5 + demUv.y * PI;

    // Mode 4 (Dymaxion): Gracefully fade out continuous raster mesh to avoid icosahedral seam tearing
    if (u_mode == 4) {
        vModeAlpha = 1.0 - smoothstep(0.02, 0.25, clampedUnfurl);
        finalPos = mix(pos3D, pos2D, ease);
        dynamicNormal = mix(normalize(pos3D), vec3(0.0, 0.0, 1.0), ease);
    } else if (u_mode == 1) {
        // Mode 1: Cylindrical Unrolling along Mercator Longitudinal Seam
        vModeAlpha = 1.0;
        float t = ease;
        float oneMinusT = 1.0 - t;

        if (oneMinusT > 0.001) {
            float invOneMinusT = 1.0 / oneMinusT;
            float curAngle = oneMinusT * lambda;
            
            float curX = (RADIUS * invOneMinusT) * sin(curAngle);
            float curZ = (RADIUS * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cos(phi) * oneMinusT);
            float curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3(curX, curY, curZ);

            // Smooth rotating cylindrical normal (guaranteed outward orientation, zero edge inversion)
            vec3 nCyl = vec3(sin(curAngle) * cos(phi), sin(phi) * oneMinusT, cos(curAngle) * cos(phi) + t * sin(phi) * sin(phi));
            dynamicNormal = normalize(nCyl);
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
        // Mode 2: Griffith LEFM Fracture
        vModeAlpha = 1.0;
        float t = ease;
        float distToSeam = PI - abs(lambda);
        float seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
        float tRupture = 0.18;

        if (t < tRupture) {
            float strainProgress = t / tRupture;
            float localStrain = seamFactor * strainProgress * max(0.2, cos(phi * 0.85));
            vec3 outwardTension = normalize(pos3D) * (localStrain * 0.30);
            finalPos = pos3D + outwardTension;
            dynamicNormal = normalize(finalPos);
        } else {
            float postRuptureT = smoothstep(tRupture, 1.0, t);
            vec3 peeledPos = mix(pos3D, pos2D, postRuptureT);
            finalPos = peeledPos;
            float curAngle = (1.0 - postRuptureT) * lambda;
            vec3 nRot = vec3(sin(curAngle) * cos(phi), (1.0 - postRuptureT) * sin(phi), cos(curAngle) * cos(phi) + postRuptureT * sin(phi) * sin(phi));
            dynamicNormal = normalize(nRot);
        }
    } else if (u_mode == 3) {
        // Mode 3: Fluid Advection
        vModeAlpha = 1.0;
        float t = ease;
        float rawSin = sin(PI * clampedUnfurl);
        float liquefaction = pow(max(0.0, rawSin), 1.15);
        vec3 basePos = mix(pos3D, pos2D, t);
        vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
        vec3 surfaceNormal = length(basePos) > 0.001 ? normalize(basePos) : vec3(0.0, 0.0, 1.0);

        float wavePhase1 = dot(basePos, vec3(0.35, 0.62, 0.42)) * 1.35 - u_time * 1.25;
        float silkWave = sin(wavePhase1) * liquefaction * 0.35;
        vec3 silkDrapeOffset = surfaceNormal * silkWave;
        vec3 advectionOffset = naturalVelocity * (liquefaction * 0.85) + silkDrapeOffset;

        finalPos = basePos + advectionOffset;
        dynamicNormal = mix(normalize(pos3D + silkDrapeOffset * 0.5), vec3(0.0, 0.0, 1.0), t);
    } else {
        // Mode 0: Linear Mix with smooth rotating normal
        vModeAlpha = 1.0;
        finalPos = mix(pos3D, pos2D, ease);
        float curAngle = (1.0 - ease) * lambda;
        vec3 nRot = vec3(sin(curAngle) * cos(phi), (1.0 - ease) * sin(phi), cos(curAngle) * cos(phi) + ease * sin(phi) * sin(phi));
        dynamicNormal = normalize(nRot);
    }

    // Sample true physical DEM crustal displacement from NOAA/GEBCO texture
    vec4 dem = texture2D(u_demTexture, demUv);
    float isLand = dem.b;
    float landElev = dem.r; // 0..1 representing 0..8848m
    float oceanDepth = -(1.0 - dem.g); // -1..0 representing trench to sea level
    float signedH = 0.0;
    if (u_renderStyle == 1 || u_renderStyle == 2) {
        // Hybrid & Photoreal: Continents elevate naturally above sea level (R = 5.0).
        // Oceans remain on the smooth sea-level sphere, eliminating polygon spires.
        signedH = isLand * landElev;
    } else {
        // Architectural: Continents elevate with crisp relief.
        // Seafloor has gentle 0.20x indentation so trenches are sculpted without spires.
        signedH = (u_includeBathymetry == 1)
            ? mix(oceanDepth * 0.20, landElev, isLand)
            : (isLand * landElev);
    }

    vIsLand = isLand;
    vElevNormalized = signedH;
    vDisplacement = signedH * u_displacementScale;

    // Physical crustal extrusion along dynamic normal
    finalPos += dynamicNormal * (vDisplacement * 1.5);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    vec3 viewNormal = normalize(normalMatrix * dynamicNormal);
    vec3 viewDir = -normalize(mvPosition.xyz);
    vFacing = mix(dot(viewNormal, viewDir), 1.0, ease);
}
`;

const tileOverlayFragmentShader = `
uniform sampler2D u_tileTexture;
uniform sampler2D u_demTexture;
uniform float u_opacity;
uniform int u_blendMode; // 0 = Normal, 1 = Additive, 2 = Multiply, 3 = Screen
uniform int u_theme;     // 0 = Dark Obsidian, 1 = Light Archival
uniform int u_isDemPreset; // 1 = Render full NASA/GEBCO Hypsometric Topo & Bathymetry
uniform int u_renderStyle; // 0 = Architectural, 1 = Hybrid, 2 = Photoreal
uniform float u_displacementScale;
uniform float u_sunAzimuth;
uniform float u_sunAltitude;
uniform float u_hillshadeIntensity;
uniform vec2 u_texelSize;

varying vec2 vUv;
varying vec2 vDemUv;
varying float vFacing;
varying float vDisplacement;
varying float vElevNormalized;
varying float vIsLand;
varying float vModeAlpha;

// Analytical Surface Normal via DEM symmetric finite differences across land and bathymetry
vec3 computeDEMNormal(vec2 uv, float dispScale, int renderStyle) {
    vec2 ts = vec2(1.0 / 2048.0, 1.0 / 1024.0);
    
    vec4 demR = texture2D(u_demTexture, uv + vec2(ts.x, 0.0));
    vec4 demL = texture2D(u_demTexture, uv - vec2(ts.x, 0.0));
    vec4 demU = texture2D(u_demTexture, uv + vec2(0.0, ts.y));
    vec4 demD = texture2D(u_demTexture, uv - vec2(0.0, ts.y));

    float hR, hL, hU, hD;
    if (renderStyle == 0) {
        // Architectural: Land relief + 0.20x bathymetric trenches
        hR = demR.b > 0.5 ? demR.r : -(1.0 - demR.g) * 0.20;
        hL = demL.b > 0.5 ? demL.r : -(1.0 - demL.g) * 0.20;
        hU = demU.b > 0.5 ? demU.r : -(1.0 - demU.g) * 0.20;
        hD = demD.b > 0.5 ? demD.r : -(1.0 - demD.g) * 0.20;
    } else if (renderStyle == 1) {
        // Hybrid: Land relief + submerged bathymetry slopes
        hR = demR.b > 0.5 ? demR.r : -(1.0 - demR.g) * 0.45;
        hL = demL.b > 0.5 ? demL.r : -(1.0 - demL.g) * 0.45;
        hU = demU.b > 0.5 ? demU.r : -(1.0 - demU.g) * 0.45;
        hD = demD.b > 0.5 ? demD.r : -(1.0 - demD.g) * 0.45;
    } else {
        // Photoreal: Land topography
        hR = demR.b > 0.5 ? demR.r : 0.0;
        hL = demL.b > 0.5 ? demL.r : 0.0;
        hU = demU.b > 0.5 ? demU.r : 0.0;
        hD = demD.b > 0.5 ? demD.r : 0.0;
    }

    float dHx = (hR - hL) * 0.5 * (dispScale * 65.0 + 1.2);
    float dHy = (hU - hD) * 0.5 * (dispScale * 65.0 + 1.2);
    return normalize(vec3(-dHx, -dHy, 1.0));
}

void main() {
    float effectiveAlpha = u_opacity * vModeAlpha;
    if (effectiveAlpha <= 0.005 || vFacing < -0.2) {
        discard;
    }

    vec4 dem = texture2D(u_demTexture, vDemUv);
    float isLand = dem.b;
    float landElev = dem.r;
    float bathLevel = dem.g;

    vec3 rgb;

    if (u_renderStyle == 0) {
        // ====================================================================
        // Direction A: Architectural Topographic Relief ("Less is More")
        // Tone-on-tone Eduard Imhof relief shading & analytical isocontours
        // ====================================================================
        if (u_theme == 0) {
            // Theme 0: Obsidian Abyss & Celestial Platinum
            if (isLand > 0.45) {
                // Continental Landmass: Obsidian base rising to Platinum peaks
                vec3 cLowland = vec3(0.12, 0.15, 0.20);
                vec3 cMidland = vec3(0.32, 0.36, 0.44);
                vec3 cAlpine  = vec3(0.65, 0.68, 0.74);
                vec3 cSummit  = vec3(0.92, 0.90, 0.87);

                float h = clamp(landElev, 0.0, 1.0);
                if (h < 0.30) {
                    rgb = mix(cLowland, cMidland, h / 0.30);
                } else if (h < 0.70) {
                    rgb = mix(cMidland, cAlpine, (h - 0.30) / 0.40);
                } else {
                    rgb = mix(cAlpine, cSummit, (h - 0.70) / 0.30);
                }

                // Analytical Topographic Micro-Contours & Index Contours
                float topoCycle = landElev * 24.0;
                float topoDist = abs(fract(topoCycle - 0.5) - 0.5);
                float topoLine = 1.0 - smoothstep(0.0, 0.08, topoDist);

                float indexCycle = landElev * 4.8;
                float indexDist = abs(fract(indexCycle - 0.5) - 0.5);
                float indexLine = 1.0 - smoothstep(0.0, 0.12, indexDist);

                float combinedTopo = topoLine * 0.22 + indexLine * 0.40;
                rgb = mix(rgb, vec3(0.96, 0.94, 0.90), combinedTopo);
            } else {
                // Ocean Bathymetry: Deep Obsidian Abyss & Subsurface Isobaths
                vec3 cTrench = vec3(0.03, 0.04, 0.06);
                vec3 cAbyss  = vec3(0.05, 0.07, 0.11);
                vec3 cShelf  = vec3(0.09, 0.15, 0.22);

                float d = clamp(bathLevel, 0.0, 1.0);
                if (d < 0.50) {
                    rgb = mix(cTrench, cAbyss, d / 0.50);
                } else {
                    rgb = mix(cAbyss, cShelf, (d - 0.50) / 0.50);
                }

                // Bathymetric Depth Isobaths & Index Isobaths
                float bathCycle = bathLevel * 16.0;
                float bathDist = abs(fract(bathCycle - 0.5) - 0.5);
                float bathLine = 1.0 - smoothstep(0.0, 0.09, bathDist);

                float bathIndexCycle = bathLevel * 4.0;
                float bathIndexDist = abs(fract(bathIndexCycle - 0.5) - 0.5);
                float bathIndexLine = 1.0 - smoothstep(0.0, 0.12, bathIndexDist);

                float combinedBath = bathLine * 0.20 + bathIndexLine * 0.38;
                rgb = mix(rgb, vec3(0.24, 0.42, 0.60), combinedBath);
            }
        } else {
            // Theme 1: Light Architectural Print on Archival Paper
            if (isLand > 0.45) {
                // Swiss Topographic Map: Bone Paper to Deep Graphite Shadows
                vec3 cLowland = vec3(0.96, 0.97, 0.98);
                vec3 cMidland = vec3(0.82, 0.85, 0.89);
                vec3 cAlpine  = vec3(0.55, 0.58, 0.64);
                vec3 cSummit  = vec3(0.18, 0.20, 0.24);

                float h = clamp(landElev, 0.0, 1.0);
                if (h < 0.30) {
                    rgb = mix(cLowland, cMidland, h / 0.30);
                } else if (h < 0.70) {
                    rgb = mix(cMidland, cAlpine, (h - 0.30) / 0.40);
                } else {
                    rgb = mix(cAlpine, cSummit, (h - 0.70) / 0.30);
                }

                // Fine Technical Pencil Isocontours & Index Contours
                float topoCycle = landElev * 24.0;
                float topoDist = abs(fract(topoCycle - 0.5) - 0.5);
                float topoLine = 1.0 - smoothstep(0.0, 0.08, topoDist);

                float indexCycle = landElev * 4.8;
                float indexDist = abs(fract(indexCycle - 0.5) - 0.5);
                float indexLine = 1.0 - smoothstep(0.0, 0.12, indexDist);

                float combinedTopo = topoLine * 0.18 + indexLine * 0.36;
                rgb = mix(rgb, vec3(0.10, 0.12, 0.16), combinedTopo);
            } else {
                // Pale Archival Water Basin & Subtle Gray Isobaths
                vec3 cTrench = vec3(0.88, 0.91, 0.94);
                vec3 cAbyss  = vec3(0.92, 0.94, 0.96);
                vec3 cShelf  = vec3(0.95, 0.97, 0.98);

                float d = clamp(bathLevel, 0.0, 1.0);
                rgb = mix(cTrench, cShelf, d);

                float bathCycle = bathLevel * 16.0;
                float bathDist = abs(fract(bathCycle - 0.5) - 0.5);
                float bathLine = 1.0 - smoothstep(0.0, 0.09, bathDist);

                float bathIndexCycle = bathLevel * 4.0;
                float bathIndexDist = abs(fract(bathIndexCycle - 0.5) - 0.5);
                float bathIndexLine = 1.0 - smoothstep(0.0, 0.12, bathIndexDist);

                float combinedBath = bathLine * 0.18 + bathIndexLine * 0.32;
                rgb = mix(rgb, vec3(0.60, 0.66, 0.72), combinedBath);
            }
        }
    } else if (u_renderStyle == 1) {
        // ====================================================================
        // Direction B: Hydrosphere & Bathymetric Depth (Two-Surface Model)
        // Volumetric Beer-Lambert depth absorption, translucent continental shelf,
        // and physical 3D continental elevation.
        // ====================================================================
        if (isLand > 0.45) {
            // Muted, restrained natural hypsometric palette (no neon/cartoon colors)
            vec3 cCoastal = vec3(0.14, 0.36, 0.24); // Deep Muted Evergreen
            vec3 cLowland = vec3(0.28, 0.46, 0.24); // Olive Lowland
            vec3 cPlateau = vec3(0.55, 0.46, 0.28); // Weathered Ochre
            vec3 cAlpine  = vec3(0.48, 0.42, 0.36); // Slate Mountain
            vec3 cSnow    = vec3(0.94, 0.95, 0.96); // Alpine Snow

            float h = clamp(landElev, 0.0, 1.0);
            if (h < 0.15) {
                rgb = mix(cCoastal, cLowland, h / 0.15);
            } else if (h < 0.45) {
                rgb = mix(cLowland, cPlateau, (h - 0.15) / 0.30);
            } else if (h < 0.75) {
                rgb = mix(cPlateau, cAlpine, (h - 0.45) / 0.30);
            } else {
                rgb = mix(cAlpine, cSnow, (h - 0.75) / 0.25);
            }
        } else {
            // Volumetric Beer-Lambert depth attenuation in liquid ocean basin
            float waterDepth = clamp(1.0 - bathLevel, 0.0, 1.0);
            float absorption = 1.0 - exp(-waterDepth * 3.4);

            vec3 cShallowShelf = vec3(0.06, 0.52, 0.64); // Translucent Cyan Reef/Shelf
            vec3 cMidBasin     = vec3(0.03, 0.22, 0.44); // Oceanic Blue
            vec3 cAbyssalTrench = (u_theme == 1) ? vec3(0.12, 0.18, 0.28) : vec3(0.01, 0.03, 0.10); // Deep Abyssal Abyss

            if (absorption < 0.40) {
                rgb = mix(cShallowShelf, cMidBasin, absorption / 0.40);
            } else {
                rgb = mix(cMidBasin, cAbyssalTrench, (absorption - 0.40) / 0.60);
            }

            // Physical Schlick Fresnel water surface reflectance
            float cosTheta = max(0.0, vFacing);
            float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
            rgb = mix(rgb, (u_theme == 1) ? vec3(0.85, 0.90, 0.96) : vec3(0.15, 0.25, 0.38), fresnel * 0.45);
        }
    } else {
        // ====================================================================
        // Direction C: Photoreal Orbital Satellite & Shaded Bathymetry
        // Satellite imagery drape with analytical normal-mapped hillshading
        // ====================================================================
        vec4 texColor = texture2D(u_tileTexture, vUv);
        rgb = texColor.rgb;
    }

    // Directional Sun Vector Computation
    float azRad = radians(u_sunAzimuth);
    float altRad = radians(u_sunAltitude);
    vec3 sunDir = normalize(vec3(
        sin(azRad) * cos(altRad),
        cos(azRad) * cos(altRad),
        sin(altRad)
    ));

    // Analytical Dynamic Hillshading via DEM Surface Normals
    vec3 demNormal = computeDEMNormal(vDemUv, u_displacementScale, u_renderStyle);
    float NdotL = max(0.08, dot(demNormal, sunDir));
    float hillshadeFactor = mix(1.0, NdotL * 1.45, u_hillshadeIntensity);
    
    // Apply hillshading to land; in Architectural mode, apply to both land and seabed
    if (u_renderStyle == 0 || isLand > 0.45) {
        rgb *= hillshadeFactor;
    }

    // Specular Water Sheen for Oceanic Surfaces (Direction B & C)
    if (isLand < 0.5 && (u_renderStyle == 1 || u_renderStyle == 2)) {
        vec3 halfVec = normalize(sunDir + vec3(0.0, 0.0, 1.0));
        float waterSpec = pow(max(0.0, dot(demNormal, halfVec)), 24.0) * 0.40;
        rgb += vec3(waterSpec);
    }

    // Facing Fade & Alpha Clipping
    float facingFade = smoothstep(-0.2, 0.25, vFacing);
    float alpha = effectiveAlpha * facingFade;

    // Apply Shader Blend Modes
    if (u_blendMode == 1) {
        rgb = rgb * alpha * 1.5;
    } else if (u_blendMode == 2) {
        rgb = mix(vec3(1.0), rgb, alpha);
    } else if (u_blendMode == 3) {
        rgb = 1.0 - (1.0 - rgb) * (1.0 - vec3(alpha * 0.8));
    }

    gl_FragColor = vec4(rgb, alpha);
}
`;

function buildMercatorGridGeometry(
  widthSegments: number = 256,
  heightSegments: number = 128,
  radius: number = 4.985,
  mapRadius: number = 5.0
): THREE.BufferGeometry {
  const PI = Math.PI;

  const numCols = widthSegments + 1;
  const innerRows = heightSegments + 1;
  const totalRows = innerRows + 2; // +1 south cap row, +1 north cap row
  const totalVertices = numCols * totalRows;

  const positions = new Float32Array(totalVertices * 3);
  const target2D = new Float32Array(totalVertices * 2);
  const uvs = new Float32Array(totalVertices * 2);
  const demUvs = new Float32Array(totalVertices * 2);

  let vIdx = 0;

  // Row 0: South Pole Cap (lat = -90°, seals Antarctic hole)
  for (let i = 0; i <= widthSegments; i++) {
    const u = i / widthSegments;
    const lambda = -PI + u * 2.0 * PI;
    positions[vIdx * 3 + 0] = 0.0;
    positions[vIdx * 3 + 1] = -radius;
    positions[vIdx * 3 + 2] = 0.0;
    target2D[vIdx * 2 + 0] = mapRadius * lambda;
    target2D[vIdx * 2 + 1] = -mapRadius * PI;
    uvs[vIdx * 2 + 0] = u;
    uvs[vIdx * 2 + 1] = 0.0;
    demUvs[vIdx * 2 + 0] = u;
    demUvs[vIdx * 2 + 1] = 0.0;
    vIdx++;
  }

  // Rows 1 to innerRows: Mercator body (lat = -85.05° to +85.05°)
  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments;
    const mercY = PI * (2.0 * v - 1.0);
    const phi = 2.0 * Math.atan(Math.exp(mercY)) - PI / 2.0;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const targetY = mapRadius * mercY;
    const demV = (phi + PI / 2.0) / PI;

    for (let i = 0; i <= widthSegments; i++) {
      const u = i / widthSegments;
      const lambda = -PI + u * 2.0 * PI;
      const sinLam = Math.sin(lambda);
      const cosLam = Math.cos(lambda);

      positions[vIdx * 3 + 0] = radius * cosPhi * sinLam;
      positions[vIdx * 3 + 1] = radius * sinPhi;
      positions[vIdx * 3 + 2] = radius * cosPhi * cosLam;

      target2D[vIdx * 2 + 0] = mapRadius * lambda;
      target2D[vIdx * 2 + 1] = targetY;

      uvs[vIdx * 2 + 0] = u;
      uvs[vIdx * 2 + 1] = v;

      demUvs[vIdx * 2 + 0] = u;
      demUvs[vIdx * 2 + 1] = demV;

      vIdx++;
    }
  }

  // Row totalRows - 1: North Pole Cap (lat = +90°, seals Arctic hole)
  for (let i = 0; i <= widthSegments; i++) {
    const u = i / widthSegments;
    const lambda = -PI + u * 2.0 * PI;
    positions[vIdx * 3 + 0] = 0.0;
    positions[vIdx * 3 + 1] = radius;
    positions[vIdx * 3 + 2] = 0.0;
    target2D[vIdx * 2 + 0] = mapRadius * lambda;
    target2D[vIdx * 2 + 1] = mapRadius * PI;
    uvs[vIdx * 2 + 0] = u;
    uvs[vIdx * 2 + 1] = 1.0;
    demUvs[vIdx * 2 + 0] = u;
    demUvs[vIdx * 2 + 1] = 1.0;
    vIdx++;
  }

  const indices: number[] = [];
  for (let j = 0; j < totalRows - 1; j++) {
    for (let i = 0; i < widthSegments; i++) {
      const a = j * numCols + i;
      const b = j * numCols + (i + 1);
      const c = (j + 1) * numCols + (i + 1);
      const d = (j + 1) * numCols + i;

      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('target2D', new THREE.BufferAttribute(target2D, 2));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('demUv', new THREE.BufferAttribute(demUvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

export const RasterLayerRenderer: React.FC<RasterLayerRendererProps> = ({
  visible,
  unfurlProgress,
  mode,
  theme,
  sourceUrl,
  opacity = 0.95,
  blendMode = 0,
  displacementScale = 0.12,
  sunAzimuth = 315.0,
  sunAltitude = 45.0,
  hillshadeIntensity = 0.70,
  includeBathymetry = true,
  renderStyle,
  resolution = '100k',
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Map renderStyle string to shader integer uniform: 0 = Architectural, 1 = Hybrid, 2 = Photoreal
  const computedRenderStyle = useMemo(() => {
    if (renderStyle === 'architectural') return 0;
    if (renderStyle === 'hybrid') return 1;
    if (renderStyle === 'photoreal') return 2;
    if (sourceUrl && (sourceUrl.includes('BlueMarble') || sourceUrl.includes('ArcGIS') || sourceUrl.includes('World_Imagery'))) {
      return 2;
    }
    if (sourceUrl && sourceUrl.includes('hybrid')) {
      return 1;
    }
    return 0; // Default to Architectural
  }, [renderStyle, sourceUrl]);

  // Load global high-precision NASA/GEBCO DEM elevation texture
  const demTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/earth-elevation-dem.webp');
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const isDemPreset = !sourceUrl || sourceUrl.includes('earth-elevation-dem') || computedRenderStyle === 0 || computedRenderStyle === 1;

  const dataSource = useMemo(() => {
    return new RasterTileDataSource('data-layer-raster', sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    if (!visible) return;
    if (isDemPreset) {
      setTexture(demTexture);
      return;
    }

    let isMounted = true;
    let currentTex: THREE.Texture | null = null;

    dataSource.loadTilePyramidTexture(sourceUrl, 2)
      .then((tex) => {
        if (isMounted) {
          currentTex = tex;
          setTexture(tex);
        } else {
          tex.dispose();
        }
      })
      .catch(() => {
        if (isMounted) {
          dataSource.loadTilePyramidTexture(sourceUrl, 1).then((tex) => {
            currentTex = tex;
            setTexture(tex);
          });
        }
      });

    return () => {
      isMounted = false;
      if (currentTex) {
        currentTex.dispose();
      }
    };
  }, [visible, dataSource, sourceUrl, isDemPreset, demTexture]);

  const uniforms = useMemo(
    () => ({
      u_unfurl: { value: unfurlProgress },
      u_time: { value: 0 },
      u_mode: { value: mode },
      u_theme: { value: theme },
      u_renderStyle: { value: computedRenderStyle },
      u_opacity: { value: opacity },
      u_blendMode: { value: blendMode },
      u_isDemPreset: { value: isDemPreset ? 1 : 0 },
      u_includeBathymetry: { value: includeBathymetry ? 1 : 0 },
      u_displacementScale: { value: displacementScale },
      u_sunAzimuth: { value: sunAzimuth },
      u_sunAltitude: { value: sunAltitude },
      u_hillshadeIntensity: { value: hillshadeIntensity },
      u_texelSize: { value: new THREE.Vector2(1.0 / 2048.0, 1.0 / 1024.0) },
      u_tileTexture: { value: demTexture },
      u_demTexture: { value: demTexture },
    }),
    []
  );

  useEffect(() => {
    if (texture && materialRef.current) {
      materialRef.current.uniforms.u_tileTexture.value = texture;
      materialRef.current.uniforms.u_demTexture.value = demTexture;
      materialRef.current.uniforms.u_renderStyle.value = computedRenderStyle;
      materialRef.current.uniforms.u_isDemPreset.value = isDemPreset ? 1 : 0;
      materialRef.current.needsUpdate = true;
    }
  }, [texture, demTexture, isDemPreset, computedRenderStyle]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.u_mode.value = mode;
      materialRef.current.uniforms.u_theme.value = theme;
      materialRef.current.uniforms.u_renderStyle.value = computedRenderStyle;
      materialRef.current.uniforms.u_opacity.value = opacity;
      materialRef.current.uniforms.u_blendMode.value = blendMode;
      materialRef.current.uniforms.u_isDemPreset.value = isDemPreset ? 1 : 0;
      materialRef.current.uniforms.u_includeBathymetry.value = includeBathymetry ? 1 : 0;
      materialRef.current.uniforms.u_displacementScale.value = displacementScale;
      materialRef.current.uniforms.u_sunAzimuth.value = sunAzimuth;
      materialRef.current.uniforms.u_sunAltitude.value = sunAltitude;
      materialRef.current.uniforms.u_hillshadeIntensity.value = hillshadeIntensity;
    }
  });

  const geometry = useMemo(() => {
    const widthSegs = resolution === '1M' ? 384 : 256;
    const heightSegs = resolution === '1M' ? 192 : 128;
    return buildMercatorGridGeometry(widthSegs, heightSegs, 4.985, 5.0);
  }, [resolution]);

  if (!visible || !texture || !geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={tileOverlayVertexShader}
        fragmentShader={tileOverlayFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};


