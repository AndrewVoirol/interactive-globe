// ============================================================================
// File: src/core/layers/renderers/SatelliteTrajectoryRenderer.tsx
// Ingestion Sub-Renderer: TLE Orbital Satellite Point & Trajectory Pass
// ============================================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TLETrajectoryDataSource } from '../../data/TLETrajectoryDataSource';
import { BlendModeType } from '../../data/DataLayerCatalog';

export interface SatelliteTrajectoryRendererProps {
  visible: boolean;
  unfurlProgress: number;
  mode: number;
  theme: number;
  sourceUrl?: string;
  opacity?: number;
  blendMode?: BlendModeType;
}

const satellitePointVertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode;
attribute vec3 a_velocity;
attribute vec3 a_pos2D;
varying float vFacing;

const float RADIUS = 5.2; // Orbital radius above 4.975 globe
const float PI = 3.14159265358979323846;

void main() {
    float clampedUnfurl = clamp(u_unfurl, 0.0, 1.0);
    float ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    // Orbit motion simulation along velocity vectors
    vec3 animatedPos = position + a_velocity * sin(u_time * 0.5 + position.x);
    vec3 normalDir = normalize(animatedPos);
    vec3 pos3D = normalDir * RADIUS;

    vec3 finalPos = mix(pos3D, a_pos2D, ease);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = mix(6.0, 4.0, ease) * (300.0 / -mvPosition.z);

    vec3 viewNormal = normalize(normalMatrix * normalDir);
    vec3 viewDir = -normalize(mvPosition.xyz);
    vFacing = mix(dot(viewNormal, viewDir), 1.0, ease);
}
`;

const satellitePointFragmentShader = `
uniform float u_opacity;
uniform int u_blendMode;
uniform int u_theme;
varying float vFacing;

void main() {
    if (vFacing < -0.15) {
        discard;
    }

    // Circular glowing point sprite
    vec2 circUv = gl_PointCoord - vec2(0.5);
    float distSq = dot(circUv, circUv);
    if (distSq > 0.25) {
        discard;
    }

    float glow = smoothstep(0.25, 0.0, distSq);
    float facingFade = smoothstep(-0.15, 0.35, vFacing);

    vec3 satColor = (u_theme == 1) ? vec3(0.1, 0.7, 0.9) : vec3(0.2, 0.9, 0.6);
    if (u_blendMode == 1) {
        satColor *= 1.8;
    }

    gl_FragColor = vec4(satColor * glow, u_opacity * facingFade * glow);
}
`;

export const SatelliteTrajectoryRenderer: React.FC<SatelliteTrajectoryRendererProps> = ({
  visible,
  unfurlProgress,
  mode,
  theme,
  sourceUrl,
  opacity = 0.95,
  blendMode = 1,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  const dataSource = useMemo(() => {
    return new TLETrajectoryDataSource('spacex-norad-tle');
  }, [sourceUrl]);

  useEffect(() => {
    if (!visible) return;
    let isMounted = true;

    dataSource.fetch({ minLon: -180, maxLon: 180, minLat: -85, maxLat: 85, minAlt: 0, maxAlt: 0 }, 3)
      .then((chunk) => {
        if (!isMounted) return;
        const positions = chunk.attributes.get('position');
        const velocities = chunk.attributes.get('velocity');
        if (!positions || !velocities) return;

        const count = chunk.vertexCount;
        const pos3DArray = new Float32Array(count * 3);
        const pos2DArray = new Float32Array(count * 3);
        const velArray = new Float32Array(count * 3);
        const radius = 5.2;
        const PI = Math.PI;

        for (let i = 0; i < count; i++) {
          const x = positions[i * 3 + 0];
          const y = positions[i * 3 + 1];
          const z = positions[i * 3 + 2];

          pos3DArray[i * 3 + 0] = x;
          pos3DArray[i * 3 + 1] = y;
          pos3DArray[i * 3 + 2] = z;

          velArray[i * 3 + 0] = velocities[i * 3 + 0];
          velArray[i * 3 + 1] = velocities[i * 3 + 1];
          velArray[i * 3 + 2] = velocities[i * 3 + 2];

          // Map Cartesian 3D orbit position to lat/lon for 2D flat projection
          const lat = Math.asin(y / radius) * (180 / PI);
          const lon = Math.atan2(z, x) * (180 / PI);

          const mapX = (lon / 180) * PI * 4.975;
          const mapY = (lat / 90) * (PI / 2) * 4.975;
          pos2DArray[i * 3 + 0] = mapX;
          pos2DArray[i * 3 + 1] = mapY;
          pos2DArray[i * 3 + 2] = 0.05;
        }

        const bufGeo = new THREE.BufferGeometry();
        bufGeo.setAttribute('position', new THREE.BufferAttribute(pos3DArray, 3));
        bufGeo.setAttribute('a_velocity', new THREE.BufferAttribute(velArray, 3));
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
        vertexShader={satellitePointVertexShader}
        fragmentShader={satellitePointFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </points>
  );
};
