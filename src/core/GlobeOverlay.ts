/**
 * Indicatrix Engine: Cartographic Overlays & Geodesic Systems
 * 
 * Provides mathematically grounded cartographic features:
 * 1. Antipodal Bridges (through-the-Earth duality)
 * 2. Thermohaline Global Ocean Conveyor Belt
 * 3. Pelagic Biological Geodesic Migrations (Bar-tailed Godwit & Arctic Tern)
 * 4. Cartographic Reference Landmarks (Point Nemo, Challenger Deep, Greenwich, Everest)
 * 5. Tissot's Indicatrix Dynamic Deformation Rings
 */

import * as THREE from 'three';
import { projectToDymaxion2D } from '../utils/dymaxion';

export const RADIUS = 5.0;
const PI = Math.PI;
const MAX_LAT = 85.0511287798066;

export interface GeoCoordinate {
  lat: number;
  lon: number;
  label?: string;
  category?: 'landmark' | 'antipode' | 'ocean' | 'migration';
  subtext?: string;
}

export interface GeodesicArcDefinition {
  id: string;
  name: string;
  category: 'antipodes' | 'conveyor' | 'migration';
  description: string;
  from: GeoCoordinate;
  to: GeoCoordinate;
  color: string;
  intermediatePoints?: GeoCoordinate[];
}

export const LANDMARK_ANCHORS: GeoCoordinate[] = [
  { lat: 51.4769, lon: 0.0, label: 'Greenwich 0°', subtext: 'Prime Meridian Origin', category: 'landmark' },
  { lat: -48.8767, lon: -123.3933, label: 'Point Nemo', subtext: 'Pole of Inaccessibility (2,688 km to land)', category: 'landmark' },
  { lat: 11.3733, lon: 142.5917, label: 'Challenger Deep', subtext: '-10,928 m Mariana Trench', category: 'landmark' },
  { lat: 27.9881, lon: 86.9250, label: 'Mt. Everest', subtext: '+8,849 m Terrestrial Apex', category: 'landmark' },
  { lat: 0.0, lon: 180.0, label: 'Antimeridian 180°', subtext: 'Planar Seam / International Date Line', category: 'landmark' },
];

export const GEODESIC_ARCS: GeodesicArcDefinition[] = [
  // 1. Antipodal Bridges (Through-the-Earth diametric pairs)
  {
    id: 'antipode-madrid-nz',
    name: 'Madrid ↔ Weber (New Zealand)',
    category: 'antipodes',
    description: 'Exact antipodal pairing: diametrically opposite through Earth\'s core.',
    from: { lat: 40.4168, lon: -3.7038, label: 'Madrid' },
    to: { lat: -40.4168, lon: 176.2962, label: 'Weber (NZ)' },
    color: '#F43F5E',
  },
  {
    id: 'antipode-hawaii-botswana',
    name: 'Honolulu ↔ Okavango (Botswana)',
    category: 'antipodes',
    description: 'Pacific ocean volcanic apex to African inland delta antipode.',
    from: { lat: 21.3069, lon: -157.8583, label: 'Honolulu' },
    to: { lat: -21.3069, lon: 22.1417, label: 'Okavango Delta' },
    color: '#EC4899',
  },
  {
    id: 'antipode-bogota-jakarta',
    name: 'Bogotá ↔ Jakarta',
    category: 'antipodes',
    description: 'Equatorial Andean plateau to Sunda Strait archipelago antipode.',
    from: { lat: 4.7110, lon: -74.0721, label: 'Bogotá' },
    to: { lat: -6.2088, lon: 106.8456, label: 'Jakarta' },
    color: '#FB7185',
  },

  // 2. Global Ocean Thermohaline Conveyor Belt
  {
    id: 'conveyor-north-atlantic',
    name: 'North Atlantic Deep Water Sinking',
    category: 'conveyor',
    description: 'Dense cold brine sinks near Greenland, driving the planetary heat engine.',
    from: { lat: 68.0, lon: -15.0, label: 'Greenland Sea' },
    to: { lat: 0.0, lon: -28.0, label: 'Equatorial Atlantic' },
    color: '#38BDF8',
  },
  {
    id: 'conveyor-south-atlantic-circumpolar',
    name: 'Antarctic Circumpolar Deep Loop',
    category: 'conveyor',
    description: 'Deep cold current rounds Antarctica into the Indian Ocean basin.',
    from: { lat: 0.0, lon: -28.0, label: 'Equatorial Atlantic' },
    to: { lat: -55.0, lon: 30.0, label: 'Southern Ocean Loop' },
    color: '#0284C7',
  },
  {
    id: 'conveyor-indian-pacific-upwelling',
    name: 'Pacific Upwelling Warm Return',
    category: 'conveyor',
    description: 'Deep abyssal water warms and upwells in the North Pacific, returning westward.',
    from: { lat: -55.0, lon: 150.0, label: 'South Pacific' },
    to: { lat: 45.0, lon: -160.0, label: 'North Pacific Upwelling' },
    color: '#818CF8',
  },

  // 3. Biological Non-Stop Geodesic Migrations
  {
    id: 'migration-godwit',
    name: 'Bar-tailed Godwit (Alaska → New Zealand)',
    category: 'migration',
    description: 'Longest non-stop flight: 11,000 km across open Pacific in 11 continuous days without feeding.',
    from: { lat: 61.5, lon: -165.5, label: 'Yukon-Kuskokwim (AK)' },
    to: { lat: -37.2, lon: 175.5, label: 'Firth of Thames (NZ)' },
    color: '#FBBF24',
  },
  {
    id: 'migration-arctic-tern',
    name: 'Arctic Tern Pole-to-Pole Voyage',
    category: 'migration',
    description: '70,000 km annual odyssey tracing the Atlantic pressure belts from Arctic ice to Antarctica.',
    from: { lat: 72.0, lon: -35.0, label: 'Arctic Tundra' },
    to: { lat: -70.0, lon: -20.0, label: 'Weddell Sea (Antarctica)' },
    color: '#34D399',
  },
];

/**
 * Converts Lon/Lat degrees to 3D Cartesian coordinates on sphere of given radius
 */
export function geoToSphere(lon: number, lat: number, r = RADIUS): [number, number, number] {
  const lambda = (lon * PI) / 180;
  const phi = (lat * PI) / 180;
  return [
    r * Math.cos(phi) * Math.sin(lambda),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(lambda),
  ];
}

/**
 * Converts Lon/Lat degrees to 2D Web Mercator coordinates
 */
export function geoToMercator(lon: number, lat: number, r = RADIUS): [number, number] {
  const lambda = (lon * PI) / 180;
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const phi = (clampedLat * PI) / 180;
  const x = lambda * r;
  const y = r * Math.log(Math.tan(PI / 4 + phi / 2));
  return [x, y];
}

/**
 * Evaluates the exact dynamic position of a geographic point (lon, lat) at morph progress alpha
 * across any of the 5 simulation paradigms (0=Linear, 1=Scroll, 2=Griffith, 3=Fluid, 4=Dymaxion)
 */
export function evaluatePointMorph(
  lon: number,
  lat: number,
  alpha: number,
  mode: number,
  time = 0,
  elevationOffset = 0.05
): [number, number, number] {
  const p3D = geoToSphere(lon, lat, RADIUS + elevationOffset);
  const p2D = geoToMercator(lon, lat, RADIUS);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const ease = clampedAlpha * clampedAlpha * (3 - 2 * clampedAlpha);

  if (mode === 4) {
    // Mode 4: Fuller Dymaxion
    const [dymX, dymY] = projectToDymaxion2D(p3D);
    const arch = Math.sin(PI * ease) * 0.45;
    const normLen = Math.hypot(p3D[0], p3D[1], p3D[2]) || 1.0;
    const nx = p3D[0] / normLen;
    const ny = p3D[1] / normLen;
    const nz = p3D[2] / normLen;
    return [
      (1 - ease) * p3D[0] + ease * dymX + nx * arch,
      (1 - ease) * p3D[1] + ease * dymY + ny * arch,
      (1 - ease) * p3D[2] + ease * 0.0 + nz * arch,
    ];
  } else if (mode === 1) {
    // Mode 1: Cylindrical Scroll
    const t = ease;
    const lambda = (lon * PI) / 180;
    const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * PI) / 180;
    if (t < 0.999) {
      const invOneMinusT = 1.0 / (1.0 - t);
      const curAngle = (1.0 - t) * lambda;
      const curX = (RADIUS * invOneMinusT) * Math.sin(curAngle);
      const curZ = (RADIUS * Math.cos(phi) * invOneMinusT) * (Math.cos(curAngle) - 1.0) + (RADIUS * Math.cos(phi) * (1.0 - t));
      const curY = (1.0 - t) * p3D[1] + t * p2D[1];
      return [curX, curY, curZ];
    } else {
      return [p2D[0], p2D[1], 0];
    }
  } else if (mode === 2) {
    // Mode 2: Griffith Fracture
    const t = ease;
    const lambda = (lon * PI) / 180;
    const distToSeam = PI - Math.abs(lambda);
    const seamFactor = 1.0 - Math.max(0, Math.min(1, distToSeam / 0.75));
    const tRupture = 0.18;
    if (t < tRupture) {
      const strain = seamFactor * (t / tRupture);
      const normLen = Math.hypot(p3D[0], p3D[1], p3D[2]) || 1.0;
      return [
        p3D[0] + (p3D[0] / normLen) * strain * 0.3,
        p3D[1] + (p3D[1] / normLen) * strain * 0.3,
        p3D[2] + (p3D[2] / normLen) * strain * 0.3,
      ];
    } else {
      const postRuptureT = (t - tRupture) / (1 - tRupture);
      const peeledX = (1 - postRuptureT) * p3D[0] + postRuptureT * p2D[0];
      const peeledY = (1 - postRuptureT) * p3D[1] + postRuptureT * p2D[1];
      const flutterWave = Math.sin(distToSeam * 16.0 - t * 24.0);
      const flutterDecay = Math.exp(-4.2 * (t - tRupture));
      const flutterZ = (1 - postRuptureT) * p3D[2] + 0.5 * seamFactor * flutterWave * flutterDecay;
      return [peeledX, peeledY, flutterZ];
    }
  } else if (mode === 3) {
    // Mode 3: Fluid Flow
    const t = ease;
    const rawSin = Math.sin(PI * clampedAlpha);
    const liquefaction = Math.pow(Math.max(0, rawSin), 1.15);
    const basePos: [number, number, number] = [
      (1 - t) * p3D[0] + t * p2D[0],
      (1 - t) * p3D[1] + t * p2D[1],
      (1 - t) * p3D[2] + t * 0.0,
    ];
    // Gentle macro fluid displacement
    const k1 = 0.55;
    const uX = -k1 * Math.cos(k1 * basePos[1] + time * 0.56);
    const uY = -k1 * Math.cos(k1 * basePos[2] + time * 0.72);
    const uZ = -k1 * Math.cos(k1 * basePos[0] + time * 0.64);
    return [
      basePos[0] + uX * liquefaction * 1.2,
      basePos[1] + uY * liquefaction * 1.2,
      basePos[2] + uZ * liquefaction * 1.2,
    ];
  } else {
    // Mode 0: Linear Mix
    return [
      (1 - ease) * p3D[0] + ease * p2D[0],
      (1 - ease) * p3D[1] + ease * p2D[1],
      (1 - ease) * p3D[2] + ease * 0.0,
    ];
  }
}

/**
 * Samples a Great Circle arc between two geographic coordinates using spherical slerp
 * @param from Starting coordinate
 * @param to Ending coordinate
 * @param steps Number of interpolation samples along the geodesic
 */
export function sampleGreatCircleGeodesic(
  from: GeoCoordinate,
  to: GeoCoordinate,
  steps = 64
): Array<{ lon: number; lat: number }> {
  const v1 = new THREE.Vector3(...geoToSphere(from.lon, from.lat, 1.0));
  const v2 = new THREE.Vector3(...geoToSphere(to.lon, to.lat, 1.0));

  const dot = Math.max(-1.0, Math.min(1.0, v1.dot(v2)));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  const points: Array<{ lon: number; lat: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    let pt: THREE.Vector3;
    if (sinOmega < 1e-6) {
      // Points are identical or antipodal; linear fallback
      pt = new THREE.Vector3().lerpVectors(v1, v2, u).normalize();
    } else {
      const c1 = Math.sin((1 - u) * omega) / sinOmega;
      const c2 = Math.sin(u * omega) / sinOmega;
      pt = new THREE.Vector3()
        .addScaledVector(v1, c1)
        .addScaledVector(v2, c2)
        .normalize();
    }

    // Recover lon/lat from unit 3D sphere
    const lat = Math.asin(Math.max(-1, Math.min(1, pt.y))) * (180 / PI);
    const lon = Math.atan2(pt.x, pt.z) * (180 / PI);
    points.push({ lon, lat });
  }

  return points;
}

/**
 * Tissot Indicatrix Item definition
 */
export interface TissotIndicatrixItem {
  center: GeoCoordinate;
  perimeter: GeoCoordinate[];
  axisMajor: [GeoCoordinate, GeoCoordinate]; // Principal major axis (North-South)
  axisMinor: [GeoCoordinate, GeoCoordinate]; // Principal minor axis (East-West)
  baseAreaRatio: number; // Theoretical distortion in Mercator = sec^2(lat)
}

/**
 * Tissot Indicatrix Circle Grid Generator
 * Generates an array of small circles with principal conjugate axes at regular latitude/longitude intervals
 */
export function generateTissotCircles(
  latInterval = 30,
  lonInterval = 45,
  angularRadiusDeg = 4.8,
  circlePoints = 36
): TissotIndicatrixItem[] {
  const circles: TissotIndicatrixItem[] = [];

  for (let lat = -60; lat <= 60; lat += latInterval) {
    const latRad = (lat * PI) / 180;
    // In Mercator, area scale factor s = sec^2(lat)
    const cosLat = Math.max(0.01, Math.cos(latRad));
    const baseAreaRatio = 1.0 / (cosLat * cosLat);

    for (let lon = -180; lon < 180; lon += lonInterval) {
      const center: GeoCoordinate = { lat, lon, label: `Indicatrix ${lat}°` };
      const perimeter: GeoCoordinate[] = [];

      const rRad = (angularRadiusDeg * PI) / 180;
      const lonRad = (lon * PI) / 180;

      for (let i = 0; i <= circlePoints; i++) {
        const theta = (i / circlePoints) * 2 * PI;
        const pLat = Math.asin(
          Math.sin(latRad) * Math.cos(rRad) + Math.cos(latRad) * Math.sin(rRad) * Math.cos(theta)
        );
        const pLon =
          lonRad +
          Math.atan2(
            Math.sin(theta) * Math.sin(rRad) * Math.cos(latRad),
            Math.cos(rRad) - Math.sin(latRad) * Math.sin(pLat)
          );

        perimeter.push({
          lat: (pLat * 180) / PI,
          lon: ((pLon * 180) / PI + 540) % 360 - 180,
        });
      }

      // Principal major axis: North-South meridian crosshair
      const axisMajor: [GeoCoordinate, GeoCoordinate] = [
        { lat: Math.max(-89.9, lat - angularRadiusDeg), lon, label: 'S' },
        { lat: Math.min(89.9, lat + angularRadiusDeg), lon, label: 'N' },
      ];

      // Principal minor axis: East-West parallel crosshair
      const axisMinor: [GeoCoordinate, GeoCoordinate] = [
        { lat, lon: ((lon - angularRadiusDeg / cosLat) + 540) % 360 - 180, label: 'W' },
        { lat, lon: ((lon + angularRadiusDeg / cosLat) + 540) % 360 - 180, label: 'E' },
      ];

      circles.push({ center, perimeter, axisMajor, axisMinor, baseAreaRatio });
    }
  }

  return circles;
}

/**
 * Calculates current areal dilation and returns hex color and ratio:
 * - Emerald (#10B981) for area preservation s <= 1.18
 * - Amber (#F59E0B) for moderate stretch 1.18 < s <= 2.2
 * - Crimson (#F43F5E) for extreme polar distortion s > 2.2
 */
export function evaluateTissotDistortion(
  baseAreaRatio: number,
  mode: number,
  alpha: number
): { s: number; colorHex: string; colorRGB: [number, number, number] } {
  // If Dymaxion (Mode 4), area is preserved across all facets (max distortion < 1.05)
  const targetRatio = mode === 4 ? 1.04 : baseAreaRatio;
  const currentS = (1 - alpha) * 1.0 + alpha * targetRatio;

  if (currentS <= 1.18) {
    return { s: currentS, colorHex: '#10B981', colorRGB: [0.063, 0.725, 0.506] }; // Emerald
  } else if (currentS <= 2.2) {
    return { s: currentS, colorHex: '#F59E0B', colorRGB: [0.961, 0.620, 0.043] }; // Amber
  } else {
    return { s: currentS, colorHex: '#F43F5E', colorRGB: [0.957, 0.247, 0.369] }; // Crimson
  }
}
