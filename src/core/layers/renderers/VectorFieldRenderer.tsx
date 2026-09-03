// ============================================================================
// File: src/core/layers/renderers/VectorFieldRenderer.tsx
// Ingestion Sub-Renderer: NOAA Vector Field Dynamics & Flow Particle Pass
// ============================================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VectorFieldDataSource } from '../../data/VectorFieldDataSource';
import { BlendModeType } from '../../data/DataLayerCatalog';

export interface VectorFieldRendererProps {
  visible: boolean;
  unfurlProgress: number;
  mode: number;
  theme: number;
  sourceUrl?: string;
  opacity?: number;
  blendMode?: BlendModeType;
}

const vectorFieldVertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode;
attribute vec4 a_vectorField; // u, v, w, magnitude
attribute vec3 a_pos2D;
varying vec4 vFieldData;
varying float vFacing;

const float RADIUS = 5.01;
const float PI = 3.14159265358979323846;

void main() {
    vFieldData = a_vectorField;
    float clampedUnfurl = clamp(u_unfurl, 0.0, 1.0);
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    // Particle flow advection offset along U/V wind direction
    float flowTime = mod(u_time * 1.5 + a_vectorField.w, 3.0);
    vec3 flowOffset = vec3(a_vectorField.x, a_vectorField.y, 0.0) * (flowTime * 0.005);

    vec3 normalDir = normalize(position);
    vec3 pos3D = (normalDir * RADIUS) + flowOffset;

    vec3 pos2DWithFlow = a_pos2D + flowOffset;
    vec3 finalPos = mix(pos3D, pos2DWithFlow, ease);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = mix(5.0, 3.5, ease) * (250.0 / -mvPosition.z);

    vec3 viewNormal = normalize(normalMatrix * normalDir);
    vec3 viewDir = -normalize(mvPosition.xyz);
    vFacing = mix(dot(viewNormal, viewDir), 1.0, ease);
}
`;

const vectorFieldFragmentShader = `
uniform float u_opacity;
uniform int u_blendMode;
uniform int u_theme;
varying vec4 vFieldData; // u, v, w, magnitude
varying float vFacing;

void main() {
    if (vFacing < -0.1) {
        discard;
    }

    vec2 circUv = gl_PointCoord - vec2(0.5);
    float distSq = dot(circUv, circUv);
    if (distSq > 0.25) {
        discard;
    }

    float glow = smoothstep(0.25, 0.05, distSq);
    float facingFade = smoothstep(-0.1, 0.3, vFacing);
    float normMag = clamp(vFieldData.w / 20.0, 0.0, 1.0);

    // Dynamic wind velocity color ramp: Cyan (calm) -> Green -> Yellow -> Red (gale)
    vec3 colCalm = vec3(0.02, 0.65, 0.85);
    vec3 colMild = vec3(0.1, 0.85, 0.45);
    vec3 colStrong = vec3(0.95, 0.75, 0.1);
    vec3 colGale = vec3(0.95, 0.25, 0.15);

    vec3 fieldColor = mix(colCalm, colMild, smoothstep(0.0, 0.33, normMag));
    fieldColor = mix(fieldColor, colStrong, smoothstep(0.33, 0.66, normMag));
    fieldColor = mix(fieldColor, colGale, smoothstep(0.66, 1.0, normMag));

    if (u_blendMode == 1) {
        fieldColor *= 1.6;
    }

    gl_FragColor = vec4(fieldColor * glow, u_opacity * facingFade * glow);
}
`;

export const VectorFieldRenderer: React.FC<VectorFieldRendererProps> = ({
  visible,
  unfurlProgress,
  mode,
  theme,
  sourceUrl,
  opacity = 0.80,
  blendMode = 1,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  const dataSource = useMemo(() => {
    return new VectorFieldDataSource('noaa-grib2-wind');
  }, [sourceUrl]);

  useEffect(() => {
    if (!visible) return;
    let isMounted = true;

    dataSource.fetch({ minLon: -180, maxLon: 180, minLat: -85, maxLat: 85, minAlt: 0, maxAlt: 0 }, 3)
      .then((chunk) => {
        if (!isMounted) return;
        const fieldData = chunk.attributes.get('vectorField');
        if (!fieldData) return;

        const count = chunk.vertexCount;
        const pos3DArray = new Float32Array(count * 3);
        const pos2DArray = new Float32Array(count * 3);
        const fieldArray = new Float32Array(count * 4);
        const gridDim = Math.sqrt(count);
        const radius = 5.01;
        const PI = Math.PI;

        for (let y = 0; y < gridDim; y++) {
          for (let x = 0; x < gridDim; x++) {
            const idx = y * gridDim + x;
            const lon = -170 + (x / (gridDim - 1)) * 340;
            const lat = -75 + (y / (gridDim - 1)) * 150;

            const phi = (90 - lat) * (PI / 180);
            const theta = (lon + 180) * (PI / 180);

            pos3DArray[idx * 3 + 0] = -radius * Math.sin(phi) * Math.cos(theta);
            pos3DArray[idx * 3 + 1] = radius * Math.cos(phi);
            pos3DArray[idx * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

            const mapX = (lon / 180) * PI * 4.975;
            const mapY = (lat / 90) * (PI / 2) * 4.975;
            pos2DArray[idx * 3 + 0] = mapX;
            pos2DArray[idx * 3 + 1] = mapY;
            pos2DArray[idx * 3 + 2] = 0.03;

            fieldArray[idx * 4 + 0] = fieldData[idx * 4 + 0];
            fieldArray[idx * 4 + 1] = fieldData[idx * 4 + 1];
            fieldArray[idx * 4 + 2] = fieldData[idx * 4 + 2];
            fieldArray[idx * 4 + 3] = fieldData[idx * 4 + 3];
          }
        }

        const bufGeo = new THREE.BufferGeometry();
        bufGeo.setAttribute('position', new THREE.BufferAttribute(pos3DArray, 3));
        bufGeo.setAttribute('a_pos2D', new THREE.BufferAttribute(pos2DArray, 3));
        bufGeo.setAttribute('a_vectorField', new THREE.BufferAttribute(fieldArray, 4));
        setGeometry(bufGeo);
      });

    return () => {
      isMounted = false;
    };
  }, [visible, dataSource, sourceUrl]);

  const uniforms = useMemo(
    () => ({
      u_unfurl: { value: unfurlProgress },
      u_time: { value: 0 },
      u_mode: { value: mode },
      u_theme: { value: theme },
      u_opacity: { value: opacity },
      u_blendMode: { value: blendMode },
    }),
    []
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.u_mode.value = mode;
      materialRef.current.uniforms.u_theme.value = theme;
      materialRef.current.uniforms.u_opacity.value = opacity;
      materialRef.current.uniforms.u_blendMode.value = blendMode;
    }
  });

  if (!visible || !geometry) return null;

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vectorFieldVertexShader}
        fragmentShader={vectorFieldFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </points>
  );
};
