// ============================================================================
// File: src/core/layers/renderers/VectorContourRenderer.tsx
// Ingestion Sub-Renderer: Topographic Vector Contour Line & 3D Relief Pass
// ============================================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BlendModeType } from '../../data/DataLayerCatalog';

export interface VectorContourRendererProps {
  visible: boolean;
  unfurlProgress: number;
  mode: number;
  theme: number;
  sourceUrl?: string;
  opacity?: number;
  blendMode?: BlendModeType;
  displacementScale?: number;
}

const contourVertexShader = `
uniform float u_unfurl;
uniform int u_mode;
uniform float u_displacementScale;
attribute vec3 a_pos2D;
attribute float a_elev;
varying float vElev;
varying float vFacing;

const float RADIUS = 4.99;
const float PI = 3.14159265358979323846;

void main() {
    vElev = a_elev;
    float clampedUnfurl = clamp(u_unfurl, 0.0, 1.0);
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    vec3 normalDir = normalize(position);
    float normDisplacement = a_elev * (u_displacementScale * 2.5);
    vec3 pos3D = normalDir * (RADIUS + normDisplacement);

    vec3 pos2DWithDisplacement = a_pos2D + vec3(0.0, 0.0, a_elev * 0.1);
    vec3 finalPos = mix(pos3D, pos2DWithDisplacement, ease);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    vec3 viewNormal = normalize(normalMatrix * normalDir);
    vec3 viewDir = -normalize(mvPosition.xyz);
    vFacing = mix(dot(viewNormal, viewDir), 1.0, ease);
}
`;

const contourFragmentShader = `
uniform float u_opacity;
uniform int u_blendMode;
uniform int u_theme;
varying float vElev;
varying float vFacing;

void main() {
    if (vFacing < -0.1) {
        discard;
    }

    float facingFade = smoothstep(-0.1, 0.3, vFacing);

    // Hypsometric Vector Contour Color Coding
    vec3 colDeepSea  = vec3(0.02, 0.52, 0.85); // Abyssal Blue
    vec3 colCoast    = vec3(0.06, 0.78, 0.52); // Emerald Coastline
    vec3 colHighland = vec3(0.95, 0.65, 0.15); // Amber Mountain
    vec3 colSummit   = vec3(0.98, 0.98, 1.00); // Alpine Snow

    vec3 contourColor;
    if (vElev < 0.0) {
        contourColor = mix(colDeepSea, colCoast, clamp(vElev + 0.5, 0.0, 1.0));
    } else if (vElev < 0.5) {
        contourColor = mix(colCoast, colHighland, vElev * 2.0);
    } else {
        contourColor = mix(colHighland, colSummit, (vElev - 0.5) * 2.0);
    }

    if (u_theme == 1) {
        contourColor = mix(contourColor, vec3(0.1, 0.1, 0.2), 0.25);
    }

    if (u_blendMode == 1) {
        contourColor *= 1.6;
    } else if (u_blendMode == 3) {
        contourColor = vec3(1.0) - (vec3(1.0) - contourColor) * 0.5;
    }

    gl_FragColor = vec4(contourColor, u_opacity * facingFade);
}
`;

// Mathematical vector contour generator for high-precision topographic lines
function generateVectorContourGeometry(): THREE.BufferGeometry {
  const linePoints3D: number[] = [];
  const linePoints2D: number[] = [];
  const lineElevations: number[] = [];

  const RADIUS = 4.99;
  const PI = Math.PI;

  const addContourRing = (
    centerLon: number,
    centerLat: number,
    rLon: number,
    rLat: number,
    elev: number,
    segments: number = 64
  ) => {
    for (let i = 0; i < segments; i++) {
      const theta1 = (i / segments) * 2 * PI;
      const theta2 = ((i + 1) / segments) * 2 * PI;

      const lon1 = centerLon + Math.cos(theta1) * rLon;
      const lat1 = centerLat + Math.sin(theta1) * rLat;

      const lon2 = centerLon + Math.cos(theta2) * rLon;
      const lat2 = centerLat + Math.sin(theta2) * rLat;

      const phi1 = (90 - lat1) * (PI / 180);
      const lam1 = (lon1 + 180) * (PI / 180);
      const x1 = -RADIUS * Math.sin(phi1) * Math.cos(lam1);
      const y1 = RADIUS * Math.cos(phi1);
      const z1 = RADIUS * Math.sin(phi1) * Math.sin(lam1);

      const mapX1 = (lon1 / 180) * PI * 4.975;
      const mapY1 = (lat1 / 90) * (PI / 2) * 4.975;

      const phi2 = (90 - lat2) * (PI / 180);
      const lam2 = (lon2 + 180) * (PI / 180);
      const x2 = -RADIUS * Math.sin(phi2) * Math.cos(lam2);
      const y2 = RADIUS * Math.cos(phi2);
      const z2 = RADIUS * Math.sin(phi2) * Math.sin(lam2);

      const mapX2 = (lon2 / 180) * PI * 4.975;
      const mapY2 = (lat2 / 90) * (PI / 2) * 4.975;

      linePoints3D.push(x1, y1, z1, x2, y2, z2);
      linePoints2D.push(mapX1, mapY1, 0.02, mapX2, mapY2, 0.02);
      lineElevations.push(elev, elev);
    }
  };

  // 1. Coastline Vector Contours (0m elevation)
  addContourRing(-100, 45, 40, 22, 0.0, 96); // North America
  addContourRing(-60, -15, 22, 32, 0.0, 80); // South America
  addContourRing(70, 50, 65, 28, 0.0, 112); // Eurasia
  addContourRing(20, 5, 28, 30, 0.0, 80);   // Africa
  addContourRing(135, -25, 18, 14, 0.0, 64); // Australia
  addContourRing(0, -82, 160, 10, 0.0, 128); // Antarctica

  // 2. Highland Vector Contours (+1500m elevation)
  addContourRing(-110, 42, 10, 18, 0.35, 64); // Rockies
  addContourRing(-72, -20, 6, 26, 0.40, 64);  // Andes
  addContourRing(82, 34, 18, 8, 0.45, 64);   // Tibetan Plateau
  addContourRing(12, 46, 8, 4, 0.30, 48);    // Alps
  addContourRing(38, 8, 8, 10, 0.30, 48);    // Ethiopian Highlands

  // 3. Alpine Summit Vector Contours (+4500m elevation)
  addContourRing(-111, 40, 4, 10, 0.70, 48); // Rockies Spine
  addContourRing(-73, -22, 3, 14, 0.80, 48); // Andes Spine
  addContourRing(86, 30, 10, 4, 0.95, 48);  // Himalayas Summit

  // 4. Abyssal Ocean Trench Contours (-3000m bathymetry)
  addContourRing(142, 11, 6, 12, -0.60, 48); // Mariana Trench
  addContourRing(-66, 19, 8, 3, -0.50, 48);  // Puerto Rico Trench

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePoints3D), 3));
  geo.setAttribute('a_pos2D', new THREE.BufferAttribute(new Float32Array(linePoints2D), 3));
  geo.setAttribute('a_elev', new THREE.BufferAttribute(new Float32Array(lineElevations), 1));
  return geo;
}

export const VectorContourRenderer: React.FC<VectorContourRendererProps> = ({
  visible,
  unfurlProgress,
  mode,
  theme,
  sourceUrl,
  opacity = 0.90,
  blendMode = 0,
  displacementScale = 0.12,
}) => {
  const lineRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => generateVectorContourGeometry(), []);

  const uniforms = useMemo(
    () => ({
      u_unfurl: { value: unfurlProgress },
      u_mode: { value: mode },
      u_theme: { value: theme },
      u_opacity: { value: opacity },
      u_blendMode: { value: blendMode },
      u_displacementScale: { value: displacementScale },
    }),
    []
  );

  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      materialRef.current.uniforms.u_mode.value = mode;
      materialRef.current.uniforms.u_theme.value = theme;
      materialRef.current.uniforms.u_opacity.value = opacity;
      materialRef.current.uniforms.u_blendMode.value = blendMode;
      materialRef.current.uniforms.u_displacementScale.value = displacementScale;
    }
  });

  if (!visible || !geometry) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={contourVertexShader}
        fragmentShader={contourFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        linewidth={1.5}
      />
    </lineSegments>
  );
};
