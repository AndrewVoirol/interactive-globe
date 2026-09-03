import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  GEODESIC_ARCS,
  LANDMARK_ANCHORS,
  sampleGreatCircleGeodesic,
  generateTissotCircles,
  evaluateTissotDistortion,
  evaluatePointMorph,
} from './GlobeOverlay';

export interface GeodesicOverlayLayerProps {
  unfurlProgress: number;
  mode: number;
  activeOverlay: 'off' | 'antipodes' | 'conveyor' | 'migration';
  showLandmarks: boolean;
  showTissot: boolean;
  theme: number; // 0 = Dark, 1 = Light
  startTime?: number;
}

export const GeodesicOverlayLayer: React.FC<GeodesicOverlayLayerProps> = ({
  unfurlProgress,
  mode,
  activeOverlay,
  showLandmarks,
  showTissot,
  theme,
  startTime,
}) => {
  const arcLineRef = useRef<THREE.LineSegments>(null);
  const localStartTimeRef = useRef(performance.now());
  const pulseBeadsRef = useRef<THREE.Points>(null);
  const landmarkPointsRef = useRef<THREE.Points>(null);
  const tissotLinesRef = useRef<THREE.LineSegments>(null);

  // 1. Pre-sample Geodesic Arc Coordinates
  const activeArcs = useMemo(() => {
    if (activeOverlay === 'off') return [];
    return GEODESIC_ARCS.filter(a => a.category === activeOverlay);
  }, [activeOverlay]);

  const sampledArcSegments = useMemo(() => {
    const segments: Array<{ lon: number; lat: number }[]> = [];
    activeArcs.forEach(arc => {
      const sampled = sampleGreatCircleGeodesic(arc.from, arc.to, 54);
      segments.push(sampled);
    });
    return segments;
  }, [activeArcs]);

  // Total line vertices for arcs
  const arcVertexCount = useMemo(() => {
    return sampledArcSegments.reduce((acc, seg) => acc + (seg.length - 1) * 2, 0);
  }, [sampledArcSegments]);

  const arcGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(arcVertexCount, 2) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [arcVertexCount]);

  // Animated Current Flow Beads along Arcs
  const beadCount = useMemo(() => {
    if (activeOverlay === 'off' || sampledArcSegments.length === 0) return 0;
    return sampledArcSegments.length * 5; // 5 beads per path
  }, [activeOverlay, sampledArcSegments]);

  const pulseBeadGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(beadCount, 1) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [beadCount]);

  // 2. Pre-generate Tissot Circles with Principal Axes
  const tissotCircles = useMemo(() => {
    if (!showTissot) return [];
    return generateTissotCircles(30, 45, 4.8, 32);
  }, [showTissot]);

  // Vertex count: perimeter (32 * 2) + major axis (2) + minor axis (2) = 68 vertices per ellipse
  const tissotVertexCount = useMemo(() => {
    return tissotCircles.reduce(
      (acc, c) => acc + (c.perimeter.length - 1) * 2 + 4,
      0
    );
  }, [tissotCircles]);

  const tissotGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(tissotVertexCount, 2) * 3);
    const colors = new Float32Array(Math.max(tissotVertexCount, 2) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [tissotVertexCount]);

  // 3. Landmark Reference Points
  const landmarkGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(LANDMARK_ANCHORS.length * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  // Frame Update: Morph arc, pulse beads, and Tissot distortion synchronously
  useFrame(() => {
    const effectiveStart = startTime !== undefined ? startTime : localStartTimeRef.current;
    const elapsedTime = (performance.now() - effectiveStart) * 0.001;

    // 1. Update Arcs & Animated Flow Beads
    if (arcLineRef.current && arcVertexCount > 0) {
      const posAttr = arcLineRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      let ptr = 0;

      sampledArcSegments.forEach(seg => {
        for (let i = 0; i < seg.length - 1; i++) {
          const ptA = seg[i];
          const ptB = seg[i + 1];

          // Cull long horizontal wrap-around edges on the 2D map cut
          if (unfurlProgress > 0.05 && Math.abs(ptA.lon - ptB.lon) > 180) {
            continue;
          }

          const posA = evaluatePointMorph(ptA.lon, ptA.lat, unfurlProgress, mode, elapsedTime, 0.08);
          const posB = evaluatePointMorph(ptB.lon, ptB.lat, unfurlProgress, mode, elapsedTime, 0.08);

          array[ptr++] = posA[0];
          array[ptr++] = posA[1];
          array[ptr++] = posA[2];

          array[ptr++] = posB[0];
          array[ptr++] = posB[1];
          array[ptr++] = posB[2];
        }
      });

      while (ptr < array.length) {
        array[ptr++] = 0;
      }

      posAttr.needsUpdate = true;
    }

    // Update Pulse Beads along the currents
    if (pulseBeadsRef.current && beadCount > 0) {
      const posAttr = pulseBeadsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      let beadIdx = 0;

      sampledArcSegments.forEach((seg, sIdx) => {
        const segLen = seg.length;
        for (let b = 0; b < 5; b++) {
          const speed = activeOverlay === 'conveyor' ? 0.06 : 0.14;
          const tBead = ((elapsedTime * speed + b * 0.2 + sIdx * 0.17) % 1.0);
          const sampleIndexFloat = tBead * (segLen - 1);
          const idx0 = Math.floor(sampleIndexFloat);
          const idx1 = Math.min(segLen - 1, idx0 + 1);
          const frac = sampleIndexFloat - idx0;

          const pt0 = seg[idx0];
          const pt1 = seg[idx1];
          const lon = (1 - frac) * pt0.lon + frac * pt1.lon;
          const lat = (1 - frac) * pt0.lat + frac * pt1.lat;

          const beadPos = evaluatePointMorph(lon, lat, unfurlProgress, mode, elapsedTime, 0.16);
          array[beadIdx * 3 + 0] = beadPos[0];
          array[beadIdx * 3 + 1] = beadPos[1];
          array[beadIdx * 3 + 2] = beadPos[2];
          beadIdx++;
        }
      });

      posAttr.needsUpdate = true;
    }

    // 2. Update Tissot Indicatrix Circles & Principal Axes
    if (tissotLinesRef.current && tissotVertexCount > 0) {
      const posAttr = tissotLinesRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const colAttr = tissotLinesRef.current.geometry.attributes.color as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      const colArray = colAttr.array as Float32Array;
      let ptr = 0;

      tissotCircles.forEach(c => {
        const { colorRGB } = evaluateTissotDistortion(c.baseAreaRatio, mode, unfurlProgress);

        // A. Perimeter segments
        for (let i = 0; i < c.perimeter.length - 1; i++) {
          const ptA = c.perimeter[i];
          const ptB = c.perimeter[i + 1];

          if (unfurlProgress > 0.05 && Math.abs(ptA.lon - ptB.lon) > 180) {
            continue;
          }

          const posA = evaluatePointMorph(ptA.lon, ptA.lat, unfurlProgress, mode, elapsedTime, 0.04);
          const posB = evaluatePointMorph(ptB.lon, ptB.lat, unfurlProgress, mode, elapsedTime, 0.04);

          posArray[ptr] = posA[0];
          posArray[ptr + 1] = posA[1];
          posArray[ptr + 2] = posA[2];
          colArray[ptr] = colorRGB[0];
          colArray[ptr + 1] = colorRGB[1];
          colArray[ptr + 2] = colorRGB[2];
          ptr += 3;

          posArray[ptr] = posB[0];
          posArray[ptr + 1] = posB[1];
          posArray[ptr + 2] = posB[2];
          colArray[ptr] = colorRGB[0];
          colArray[ptr + 1] = colorRGB[1];
          colArray[ptr + 2] = colorRGB[2];
          ptr += 3;
        }

        // B. Principal Major Axis (North-South crosshair)
        const posMajA = evaluatePointMorph(c.axisMajor[0].lon, c.axisMajor[0].lat, unfurlProgress, mode, elapsedTime, 0.04);
        const posMajB = evaluatePointMorph(c.axisMajor[1].lon, c.axisMajor[1].lat, unfurlProgress, mode, elapsedTime, 0.04);
        posArray[ptr] = posMajA[0]; posArray[ptr + 1] = posMajA[1]; posArray[ptr + 2] = posMajA[2];
        colArray[ptr] = colorRGB[0] * 1.2; colArray[ptr + 1] = colorRGB[1] * 1.2; colArray[ptr + 2] = colorRGB[2] * 1.2;
        ptr += 3;
        posArray[ptr] = posMajB[0]; posArray[ptr + 1] = posMajB[1]; posArray[ptr + 2] = posMajB[2];
        colArray[ptr] = colorRGB[0] * 1.2; colArray[ptr + 1] = colorRGB[1] * 1.2; colArray[ptr + 2] = colorRGB[2] * 1.2;
        ptr += 3;

        // C. Principal Minor Axis (East-West crosshair)
        const posMinA = evaluatePointMorph(c.axisMinor[0].lon, c.axisMinor[0].lat, unfurlProgress, mode, elapsedTime, 0.04);
        const posMinB = evaluatePointMorph(c.axisMinor[1].lon, c.axisMinor[1].lat, unfurlProgress, mode, elapsedTime, 0.04);
        posArray[ptr] = posMinA[0]; posArray[ptr + 1] = posMinA[1]; posArray[ptr + 2] = posMinA[2];
        colArray[ptr] = colorRGB[0] * 0.9; colArray[ptr + 1] = colorRGB[1] * 0.9; colArray[ptr + 2] = colorRGB[2] * 0.9;
        ptr += 3;
        posArray[ptr] = posMinB[0]; posArray[ptr + 1] = posMinB[1]; posArray[ptr + 2] = posMinB[2];
        colArray[ptr] = colorRGB[0] * 0.9; colArray[ptr + 1] = colorRGB[1] * 0.9; colArray[ptr + 2] = colorRGB[2] * 0.9;
        ptr += 3;
      });

      while (ptr < posArray.length) {
        posArray[ptr] = 0;
        colArray[ptr] = 0;
        ptr++;
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    // 3. Update Landmark Anchors
    if (landmarkPointsRef.current && showLandmarks) {
      const posAttr = landmarkPointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;

      LANDMARK_ANCHORS.forEach((lm, idx) => {
        const pos = evaluatePointMorph(lm.lon, lm.lat, unfurlProgress, mode, elapsedTime, 0.12);
        array[idx * 3 + 0] = pos[0];
        array[idx * 3 + 1] = pos[1];
        array[idx * 3 + 2] = pos[2];
      });

      posAttr.needsUpdate = true;
    }
  });

  const isLight = theme === 1;

  return (
    <group>
      {/* Geodesic Morphing Arcs */}
      {activeOverlay !== 'off' && arcVertexCount > 0 && (
        <lineSegments ref={arcLineRef} geometry={arcGeo}>
          <lineBasicMaterial
            color={
              activeOverlay === 'antipodes'
                ? (isLight ? '#BE123C' : '#F43F5E')
                : activeOverlay === 'conveyor'
                ? (isLight ? '#0284C7' : '#38BDF8')
                : (isLight ? '#D97706' : '#FBBF24')
            }
            linewidth={2}
            transparent={true}
            opacity={0.85}
            depthTest={false}
          />
        </lineSegments>
      )}

      {/* Animated Flow Beads along Current Loops */}
      {activeOverlay !== 'off' && beadCount > 0 && (
        <points ref={pulseBeadsRef} geometry={pulseBeadGeo}>
          <pointsMaterial
            color={
              activeOverlay === 'antipodes'
                ? '#FDA4AF'
                : activeOverlay === 'conveyor'
                ? '#BAE6FD'
                : '#FEF08A'
            }
            size={5.5}
            sizeAttenuation={false}
            transparent={true}
            opacity={0.95}
            depthTest={false}
          />
        </points>
      )}

      {/* Tissot Indicatrix Ellipses & Principal Conjugate Crosshairs */}
      {showTissot && tissotVertexCount > 0 && (
        <lineSegments ref={tissotLinesRef} geometry={tissotGeo}>
          <lineBasicMaterial
            vertexColors={true}
            transparent={true}
            opacity={0.75}
            depthTest={false}
          />
        </lineSegments>
      )}

      {/* Landmark Reference Anchors */}
      {showLandmarks && (
        <points ref={landmarkPointsRef} geometry={landmarkGeo}>
          <pointsMaterial
            color={isLight ? '#0F172A' : '#38BDF8'}
            size={7.0}
            sizeAttenuation={false}
            transparent={true}
            opacity={0.95}
            depthTest={false}
          />
        </points>
      )}
    </group>
  );
};
