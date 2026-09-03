import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface VectorOverlayLayerProps {
  unfurlProgress: number;
  mode: number;
  theme: number;
  visible: boolean;
  cameraTarget?: THREE.Vector3;
}

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

    vec3 color = vec3(0.92, 0.90, 0.87);
    float alpha = 0.45;

    if (u_theme == 0) {
        // Theme 0: Obsidian & Celestial Platinum
        if (vPointType < 0.75) {
            // Major River Arteries: Mineral slate-aquamarine
            color = vec3(0.42, 0.62, 0.72);
            alpha = 0.35;
        } else {
            // Continental Coastlines: Warm celestial ivory hairline
            color = vec3(0.92, 0.90, 0.87);
            alpha = 0.45;
        }
    } else {
        // Theme 1: Light Monochrome Architectural Print
        if (vPointType < 0.75) {
            // River: Muted slate
            color = vec3(0.35, 0.45, 0.55);
            alpha = 0.30;
        } else {
            // Coastline: Architectural charcoal ink
            color = vec3(0.12, 0.14, 0.18);
            alpha = 0.40;
        }
    }

    gl_FragColor = vec4(color, alpha);
}
`;

export const VectorOverlayLayer: React.FC<VectorOverlayLayerProps> = ({
  unfurlProgress,
  mode,
  theme,
  visible,
  cameraTarget,
}) => {
  const lineSegmentsRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

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
      u_layerMode: { value: 0 },
      u_cameraCenter: { value: new THREE.Vector3(0, 0, 0) },
      u_cursorRayOrig: { value: new THREE.Vector3(0, 0, 0) },
      u_cursorRayDir: { value: new THREE.Vector3(0, 0, 1) },
      u_cursorHitPos: { value: new THREE.Vector3(0, 0, 0) },
      u_cursorVel: { value: new THREE.Vector4(0, 0, 0, 0) },
      u_cursorActive: { value: 0.0 },
      u_dpr: { value: typeof window !== 'undefined' ? window.devicePixelRatio : 1.0 },
    }),
    []
  );

  useFrame((state) => {
    if (!materialRef.current || !visible) return;
    const mat = materialRef.current;
    mat.uniforms.u_unfurl.value = unfurlProgress;
    mat.uniforms.u_time.value = state.clock.getElapsedTime();
    mat.uniforms.u_mode.value = mode;
    mat.uniforms.u_theme.value = theme;
    if (cameraTarget) {
      mat.uniforms.u_cameraCenter.value.copy(cameraTarget);
    }
  });

  if (!visible || !geometry) return null;

  return (
    <lineSegments ref={lineSegmentsRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={`
          uniform float u_unfurl;
          uniform float u_time;
          uniform int u_mode;
          uniform vec3 u_cameraCenter;
          attribute vec2 target2D;
          attribute vec2 dymaxion2D;
          attribute float vType;
          varying float vPointType;
          varying float vFacing;

          const float RADIUS = 5.0;
          const float PI = 3.14159265358979323846;

          void main() {
              vPointType = vType;
              float alpha = clamp(u_unfurl, 0.0, 1.0);
              float ease = smoothstep(0.0, 1.0, alpha);

              vec3 posSphere = position;
              vec3 finalPos = posSphere;

              if (u_mode == 0) {
                  // Linear Mix
                  vec3 posMap = vec3(target2D.x, target2D.y, 0.0);
                  finalPos = mix(posSphere, posMap, ease);
              } else if (u_mode == 1) {
                  // Cylindrical Scroll
                  float theta = atan(posSphere.x, posSphere.z);
                  float lon = theta;
                  float currentAngle = (1.0 - ease) * lon;
                  float curR = mix(RADIUS, 0.0001, ease);
                  float rolledX = curR * sin(currentAngle);
                  float rolledZ = curR * cos(currentAngle);
                  float scrollY = mix(posSphere.y, target2D.y, ease);
                  float unrolledX = target2D.x * ease;
                  finalPos = vec3(unrolledX + rolledX, scrollY, rolledZ);
              } else if (u_mode == 2) {
                  // Griffith LEFM
                  float theta = atan(posSphere.x, posSphere.z);
                  float seamDistance = PI - abs(theta);
                  float tRupture = 0.18;
                  float progress = clamp(alpha / tRupture, 0.0, 1.0);
                  float crackOpening = smoothstep(0.0, 1.0, progress) * (1.0 - seamDistance / PI);
                  vec3 posMap = vec3(target2D.x, target2D.y, 0.0);
                  finalPos = mix(posSphere, posMap, ease + crackOpening * 0.15 * (1.0 - ease));
              } else if (u_mode == 3) {
                  // Fluid flow
                  vec3 posMap = vec3(target2D.x, target2D.y, 0.0);
                  float wave = sin(posSphere.x * 2.0 + u_time * 2.0) * sin(posSphere.y * 2.0 + u_time * 1.5);
                  vec3 fluidPos = mix(posSphere, posMap, ease);
                  finalPos = fluidPos + vec3(0.0, 0.0, wave * 0.1 * sin(PI * alpha));
              } else if (u_mode == 4) {
                  // Fuller Dymaxion
                  vec3 dymaxionPos = vec3(dymaxion2D.x, dymaxion2D.y, 0.0);
                  finalPos = mix(posSphere, dymaxionPos, ease);
              }

              // Compute facing normal for backface attenuation
              vec3 worldNorm = normalize(posSphere);
              vec4 mvPosition = modelViewMatrix * vec4(finalPos - u_cameraCenter, 1.0);
              vec3 viewDir = -normalize(mvPosition.xyz);
              vFacing = dot(worldNorm, viewDir);

              gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={vectorLineFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </lineSegments>
  );
};
