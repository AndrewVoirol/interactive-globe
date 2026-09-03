// ============================================================================
// File: src/core/layers/renderers/VectorBoundaryRenderer.tsx
// Ingestion Sub-Renderer: GeoJSON Vector Boundary Line Pass
// ============================================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GeoJSONDataSource } from '../../data/GeoJSONDataSource';
import { BlendModeType } from '../../data/DataLayerCatalog';

export interface VectorBoundaryRendererProps {
  visible: boolean;
  unfurlProgress: number;
  mode: number;
  theme: number;
  sourceUrl?: string;
  opacity?: number;
  blendMode?: BlendModeType;
}

const vectorLineVertexShader = `
uniform float u_unfurl;
uniform int u_mode;
attribute vec3 a_pos2D;
varying float vFacing;

const float RADIUS = 4.98;
const float PI = 3.14159265358979323846;

void main() {
    float clampedUnfurl = clamp(u_unfurl, 0.0, 1.0);
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    vec3 normalDir = normalize(position);
    vec3 pos3D = normalDir * (RADIUS + 0.01);
    vec3 finalPos = mix(pos3D, a_pos2D, ease);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    vec3 viewNormal = normalize(normalMatrix * normalDir);
    vec3 viewDir = -normalize(mvPosition.xyz);
    vFacing = mix(dot(viewNormal, viewDir), 1.0, ease);
}
`;

const vectorLineFragmentShader = `
uniform float u_opacity;
uniform int u_blendMode;
uniform int u_theme;
varying float vFacing;

void main() {
    if (vFacing < -0.1) {
        discard;
    }

    float facingFade = smoothstep(-0.1, 0.3, vFacing);
    vec3 lineColor = (u_theme == 1) ? vec3(0.02, 0.45, 0.88) : vec3(0.22, 0.74, 0.97);
    
    if (u_blendMode == 1) {
        lineColor *= 1.5;
    } else if (u_blendMode == 3) {
        lineColor = vec3(1.0) - (vec3(1.0) - lineColor) * 0.5;
    }

    gl_FragColor = vec4(lineColor, u_opacity * facingFade);
}
`;

export const VectorBoundaryRenderer: React.FC<VectorBoundaryRendererProps> = ({
  visible,
  unfurlProgress,
  mode,
  theme,
  sourceUrl,
  opacity = 0.85,
  blendMode = 0,
}) => {
  const lineRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  const dataSource = useMemo(() => {
    return new GeoJSONDataSource('vector-geojson-data');
  }, [sourceUrl]);

  useEffect(() => {
    if (!visible) return;
    let isMounted = true;

    dataSource.fetch({ minLon: -180, maxLon: 180, minLat: -85, maxLat: 85, minAlt: 0, maxAlt: 0 }, 3)
      .then((chunk) => {
        if (!isMounted) return;
        const positions = chunk.attributes.get('position');
        if (!positions) return;

        const count = chunk.vertexCount;
        const pos3DArray = new Float32Array(count * 3);
        const pos2DArray = new Float32Array(count * 3);
        const radius = 4.98;
        const PI = Math.PI;

        for (let i = 0; i < count; i++) {
          const lon = positions[i * 3 + 0];
          const lat = positions[i * 3 + 1];

          const phi = (90 - lat) * (PI / 180);
          const theta = (lon + 180) * (PI / 180);

          pos3DArray[i * 3 + 0] = -radius * Math.sin(phi) * Math.cos(theta);
          pos3DArray[i * 3 + 1] = radius * Math.cos(phi);
          pos3DArray[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

          const mapX = (lon / 180) * PI * radius;
          const mapY = (lat / 90) * (PI / 2) * radius;
          pos2DArray[i * 3 + 0] = mapX;
          pos2DArray[i * 3 + 1] = mapY;
          pos2DArray[i * 3 + 2] = 0.02;
        }

        const bufGeo = new THREE.BufferGeometry();
        bufGeo.setAttribute('position', new THREE.BufferAttribute(pos3DArray, 3));
        bufGeo.setAttribute('a_pos2D', new THREE.BufferAttribute(pos2DArray, 3));
        setGeometry(bufGeo);
      });

    return () => {
      isMounted = false;
    };
  }, [visible, dataSource, sourceUrl]);

  const uniforms = useMemo(
    () => ({
      u_unfurl: { value: unfurlProgress },
      u_mode: { value: mode },
      u_theme: { value: theme },
      u_opacity: { value: opacity },
      u_blendMode: { value: blendMode },
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
    }
  });

  if (!visible || !geometry) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vectorLineVertexShader}
        fragmentShader={vectorLineFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        linewidth={1.5}
      />
    </lineSegments>
  );
};
