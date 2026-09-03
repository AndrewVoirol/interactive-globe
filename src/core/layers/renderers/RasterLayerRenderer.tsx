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
import { BlendModeType } from '../../data/DataLayerCatalog';

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
}

const tileOverlayVertexShader = `
uniform float u_unfurl;
uniform float u_time;
uniform int u_mode; // 0 = Linear, 1 = Scroll, 2 = Griffith, 3 = Fluid, 4 = Dymaxion
uniform float u_displacementScale;
uniform int u_includeBathymetry;
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
    float oceanDepth = -(1.0 - dem.g); // -1..0 representing -11000m..0m

    float signedH = (u_includeBathymetry == 1)
        ? mix(oceanDepth * (11000.0 / 8848.0), landElev, isLand)
        : (isLand * landElev);

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
uniform int u_theme;
uniform int u_isDemPreset; // 1 = Render full NASA/GEBCO Hypsometric Topo & Bathymetry
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

// Analytical Surface Normal via DEM finite differences
vec3 computeDEMNormal(vec2 uv, float dispScale) {
    vec2 ts = vec2(1.0 / 2048.0, 1.0 / 1024.0);
    
    vec4 demC = texture2D(u_demTexture, uv);
    vec4 demR = texture2D(u_demTexture, uv + vec2(ts.x, 0.0));
    vec4 demU = texture2D(u_demTexture, uv + vec2(0.0, ts.y));

    float hC = (demC.a - 0.5) * 2.0;
    float hR = (demR.a - 0.5) * 2.0;
    float hU = (demU.a - 0.5) * 2.0;

    float dHx = (hR - hC) * (dispScale * 60.0 + 1.0);
    float dHy = (hU - hC) * (dispScale * 60.0 + 1.0);
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

    if (u_isDemPreset == 1) {
        // ====================================================================
        // Unified NASA/GEBCO Topography & Bathymetry Hypsometric Pass
        // ====================================================================
        if (isLand > 0.4) {
            // Continental Land Topography Color Ramp
            vec3 cCoastal = vec3(0.08, 0.45, 0.22); // Coastal Emerald
            vec3 cLowland = vec3(0.25, 0.58, 0.18); // Lowland Green
            vec3 cPlateau = vec3(0.72, 0.55, 0.18); // Plateau Amber
            vec3 cAlpine  = vec3(0.55, 0.38, 0.24); // Mountain Ochre
            vec3 cSnow    = vec3(0.96, 0.97, 0.98); // Snow Alpine Peak

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
            // Ocean Bathymetry Depth Gradient
            vec3 cTrench = vec3(0.01, 0.02, 0.09); // Mariana Trench Midnight
            vec3 cAbyss  = vec3(0.03, 0.14, 0.32); // Abyssal Plain Navy
            vec3 cBasin  = vec3(0.05, 0.28, 0.52); // Mid-Ocean Basin Blue
            vec3 cShelf  = vec3(0.08, 0.58, 0.78); // Continental Shelf Cyan
            vec3 cCoast  = vec3(0.25, 0.82, 0.95); // Coastal Shallow Turquoise

            float d = clamp(bathLevel, 0.0, 1.0);
            if (d < 0.25) {
                rgb = mix(cTrench, cAbyss, d / 0.25);
            } else if (d < 0.60) {
                rgb = mix(cAbyss, cBasin, (d - 0.25) / 0.35);
            } else if (d < 0.88) {
                rgb = mix(cBasin, cShelf, (d - 0.60) / 0.28);
            } else {
                rgb = mix(cShelf, cCoast, (d - 0.88) / 0.12);
            }
        }
    } else {
        // Standard Optical Satellite / Topo Map Texture Drape Pass
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
    vec3 demNormal = computeDEMNormal(vDemUv, u_displacementScale);
    float NdotL = max(0.12, dot(demNormal, sunDir));
    float hillshadeFactor = mix(1.0, NdotL * 1.35, u_hillshadeIntensity);
    rgb *= hillshadeFactor;

    // Specular Water Sheen for Oceanic Surfaces
    if (isLand < 0.5) {
        float waterSpec = pow(max(0.0, dot(reflect(-sunDir, demNormal), vec3(0.0, 0.0, 1.0))), 16.0) * 0.35;
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
  widthSegments: number = 128,
  heightSegments: number = 64,
  radius: number = 4.985,
  mapRadius: number = 5.0
): THREE.BufferGeometry {
  const PI = Math.PI;

  const numCols = widthSegments + 1;
  const numRows = heightSegments + 1;
  const totalVertices = numCols * numRows;

  const positions = new Float32Array(totalVertices * 3);
  const target2D = new Float32Array(totalVertices * 2);
  const uvs = new Float32Array(totalVertices * 2);
  const demUvs = new Float32Array(totalVertices * 2);

  let vIdx = 0;
  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments; // 0.0 at South (-85.05 deg), 1.0 at North (+85.05 deg)
    const mercY = PI * (2.0 * v - 1.0);
    const phi = 2.0 * Math.atan(Math.exp(mercY)) - PI / 2.0;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const targetY = mapRadius * mercY;
    const demV = (phi + PI / 2.0) / PI; // Equirectangular latitude coordinate [0, 1]

    for (let i = 0; i <= widthSegments; i++) {
      const u = i / widthSegments; // 0.0 at -180 deg, 1.0 at +180 deg
      const lambda = -PI + u * 2.0 * PI;
      const sinLam = Math.sin(lambda);
      const cosLam = Math.cos(lambda);

      const x3D = radius * cosPhi * sinLam;
      const y3D = radius * sinPhi;
      const z3D = radius * cosPhi * cosLam;

      const targetX = mapRadius * lambda;
      const demU = u; // Equirectangular longitude coordinate [0, 1]

      positions[vIdx * 3 + 0] = x3D;
      positions[vIdx * 3 + 1] = y3D;
      positions[vIdx * 3 + 2] = z3D;

      target2D[vIdx * 2 + 0] = targetX;
      target2D[vIdx * 2 + 1] = targetY;

      uvs[vIdx * 2 + 0] = u;
      uvs[vIdx * 2 + 1] = v;

      demUvs[vIdx * 2 + 0] = demU;
      demUvs[vIdx * 2 + 1] = demV;

      vIdx++;
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < heightSegments; j++) {
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
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

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

  const isDemPreset = !sourceUrl || sourceUrl.includes('earth-elevation-dem') || sourceUrl.includes('global-dem');

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
      materialRef.current.uniforms.u_isDemPreset.value = isDemPreset ? 1 : 0;
      materialRef.current.needsUpdate = true;
    }
  }, [texture, demTexture, isDemPreset]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_unfurl.value = unfurlProgress;
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.u_mode.value = mode;
      materialRef.current.uniforms.u_theme.value = theme;
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
    return buildMercatorGridGeometry(256, 128, 4.985, 5.0);
  }, []);

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


