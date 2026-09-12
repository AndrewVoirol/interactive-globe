// ============================================================================
// File: src/core/camera/litmusWaypoints.ts
// Architecture: Cartographic Litmus Test Waypoint Trajectories
// Description: Multi-stage cinematic flight paths for Hawaii, Cape Cod, Grand Canyon, and Mount Fuji
// ============================================================================

import { Vector3 } from '../math/cameraMath';
import { Waypoint3D } from './TrajectoryCameraController';

/**
 * Convert geodetic coordinates (longitude, latitude, altitude radius)
 * to 3D Cartesian coordinates matching the Indicatrix spherical coordinate system:
 * phi = (90 - lat) * PI / 180 (polar angle from +Y)
 * theta = lon * PI / 180 (azimuth around Y axis)
 * x = R * sin(phi) * sin(theta)
 * y = R * cos(phi)
 * z = R * sin(phi) * cos(theta)
 */
export function geodeticToCartesian(lonDeg: number, latDeg: number, radius: number): Vector3 {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = (lonDeg * Math.PI) / 180;
  return new Vector3(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta)
  );
}

export interface LitmusKeyframe {
  lonDeg: number;
  latDeg: number;
  radius: number;
  targetLonDeg: number;
  targetLatDeg: number;
  targetRadius: number;
  fov?: number;
}

/**
 * Subdivides geodetic keyframes into densely-sampled Waypoint3D entries
 * ensuring spherical arc interpolation (smooth altitude and orientation, zero ground clipping)
 */
export function buildSubdividedPath(
  keyframes: LitmusKeyframe[],
  samplesPerSegment = 15
): Waypoint3D[] {
  if (keyframes.length === 0) return [];
  if (keyframes.length === 1) {
    const k = keyframes[0];
    return [
      {
        position: geodeticToCartesian(k.lonDeg, k.latDeg, k.radius),
        target: geodeticToCartesian(k.targetLonDeg, k.targetLatDeg, k.targetRadius),
        fov: k.fov ?? 50,
      },
    ];
  }

  const waypoints: Waypoint3D[] = [];

  for (let s = 0; s < keyframes.length - 1; s++) {
    const k0 = keyframes[s];
    const k1 = keyframes[s + 1];
    const steps = s === keyframes.length - 2 ? samplesPerSegment + 1 : samplesPerSegment;

    for (let i = 0; i < steps; i++) {
      const t = i / samplesPerSegment;
      // Smooth cosine easing per segment
      const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);

      const lon = k0.lonDeg + (k1.lonDeg - k0.lonDeg) * ease;
      const lat = k0.latDeg + (k1.latDeg - k0.latDeg) * ease;
      const r = Math.max(5.8, k0.radius + (k1.radius - k0.radius) * ease);

      const tLon = k0.targetLonDeg + (k1.targetLonDeg - k0.targetLonDeg) * ease;
      const tLat = k0.targetLatDeg + (k1.targetLatDeg - k0.targetLatDeg) * ease;
      const tR = k0.targetRadius + (k1.targetRadius - k0.targetRadius) * ease;

      const fov0 = k0.fov ?? 50;
      const fov1 = k1.fov ?? 50;
      const fov = fov0 + (fov1 - fov0) * ease;

      waypoints.push({
        position: geodeticToCartesian(lon, lat, r),
        target: geodeticToCartesian(tLon, tLat, tR),
        fov,
      });
    }
  }

  return waypoints;
}

/**
 * Hawaii Sequence Keyframes (5-10 seconds per medium):
 * - Start: Wide Pacific view showing Hawaiian Emperor seamount chain
 * - Waypoint 1: Dolly toward Big Island, centering on Mauna Kea
 * - Waypoint 2: Orbit slightly to reveal Mauna Loa and Kilauea caldera
 * - End: Hold on Big Island showing volcanic ridges, shelf bathymetry, and land-ocean transition
 */
export const HAWAII_KEYFRAMES: LitmusKeyframe[] = [
  // 1. Start: Wide Pacific view showing Hawaiian Emperor seamount chain
  {
    lonDeg: -168.0,
    latDeg: 28.0,
    radius: 13.5,
    targetLonDeg: -158.0,
    targetLatDeg: 22.0,
    targetRadius: 5.0,
    fov: 52,
  },
  // Intermediate descent along Emperor Chain towards Hawaiian Ridge
  {
    lonDeg: -160.0,
    latDeg: 22.5,
    radius: 9.5,
    targetLonDeg: -156.0,
    targetLatDeg: 20.5,
    targetRadius: 5.0,
    fov: 50,
  },
  // 2. Waypoint 1: Dolly toward Big Island, centering on Mauna Kea
  {
    lonDeg: -155.5,
    latDeg: 20.25,
    radius: 7.2,
    targetLonDeg: -155.47,
    targetLatDeg: 19.82,
    targetRadius: 5.0,
    fov: 48,
  },
  // 3. Waypoint 2: Orbit slightly to reveal Mauna Loa and Kilauea caldera
  {
    lonDeg: -155.05,
    latDeg: 19.25,
    radius: 6.3,
    targetLonDeg: -155.45,
    targetLatDeg: 19.45,
    targetRadius: 5.0,
    fov: 46,
  },
  // 4. End: Hold on Big Island (Litmus canonical: 19.65°N, 155.55°W, zoom 6.1)
  {
    lonDeg: -155.55,
    latDeg: 19.65,
    radius: 6.1,
    targetLonDeg: -155.55,
    targetLatDeg: 19.65,
    targetRadius: 5.0,
    fov: 45,
  },
];

/**
 * Cape Cod Sequence Keyframes (5-10 seconds per medium):
 * - Start: Wide Atlantic coast view showing New England
 * - Waypoint 1: Dolly toward Cape Cod, centering on the hook
 * - End: Hold on the peninsula showing narrow forearm, bay, and shelf bathymetry off Provincetown
 */
export const CAPE_COD_KEYFRAMES: LitmusKeyframe[] = [
  // 1. Start: Wide Atlantic coast view showing New England
  {
    lonDeg: -66.5,
    latDeg: 43.5,
    radius: 13.0,
    targetLonDeg: -70.5,
    targetLatDeg: 42.0,
    targetRadius: 5.0,
    fov: 52,
  },
  // Intermediate descent over Gulf of Maine & Georges Bank
  {
    lonDeg: -68.8,
    latDeg: 42.6,
    radius: 9.2,
    targetLonDeg: -70.2,
    targetLatDeg: 41.9,
    targetRadius: 5.0,
    fov: 50,
  },
  // 2. Waypoint 1: Dolly toward Cape Cod, centering on the hook
  {
    lonDeg: -69.8,
    latDeg: 42.15,
    radius: 7.2,
    targetLonDeg: -70.18,
    targetLatDeg: 42.05,
    targetRadius: 5.0,
    fov: 48,
  },
  // Intermediate forearm & Cape Cod Bay approach
  {
    lonDeg: -70.05,
    latDeg: 42.05,
    radius: 6.4,
    targetLonDeg: -70.15,
    targetLatDeg: 41.95,
    targetRadius: 5.0,
    fov: 46,
  },
  // 3. End: Hold on Cape Cod peninsula (Litmus canonical: 42°N, 70°W, zoom 6.2)
  {
    lonDeg: -70.0,
    latDeg: 42.0,
    radius: 6.2,
    targetLonDeg: -70.2,
    targetLatDeg: 41.9,
    targetRadius: 5.0,
    fov: 45,
  },
];

/**
 * Grand Canyon Sequence Keyframes (5-10 seconds per medium):
 * - Start: Wide Colorado Plateau view
 * - Waypoint 1: Kaibab Plateau descent toward South Rim
 * - Waypoint 2: South Rim approach focusing on Bright Angel canyon incision
 * - Waypoint 3: Gorge oblique revealing stepped stratigraphy and river incision
 * - End: Hold on Grand Canyon central gorge (36.06°N, -112.14°W, zoom 5.8)
 */
export const GRAND_CANYON_KEYFRAMES: LitmusKeyframe[] = [
  // 1. Wide Colorado Plateau
  {
    lonDeg: -114.0,
    latDeg: 37.5,
    radius: 13.0,
    targetLonDeg: -112.14,
    targetLatDeg: 36.06,
    targetRadius: 5.0,
    fov: 52,
  },
  // 2. Kaibab Plateau descent
  {
    lonDeg: -113.0,
    latDeg: 36.8,
    radius: 9.0,
    targetLonDeg: -112.14,
    targetLatDeg: 36.06,
    targetRadius: 5.0,
    fov: 50,
  },
  // 3. South Rim approach
  {
    lonDeg: -112.4,
    latDeg: 36.25,
    radius: 7.2,
    targetLonDeg: -112.14,
    targetLatDeg: 36.06,
    targetRadius: 5.0,
    fov: 48,
  },
  // 4. Gorge oblique
  {
    lonDeg: -112.2,
    latDeg: 36.12,
    radius: 6.2,
    targetLonDeg: -112.14,
    targetLatDeg: 36.06,
    targetRadius: 5.0,
    fov: 46,
  },
  // 5. Canonical Hold on Grand Canyon gorge
  {
    lonDeg: -112.14,
    latDeg: 36.06,
    radius: 5.8,
    targetLonDeg: -112.14,
    targetLatDeg: 36.06,
    targetRadius: 5.0,
    fov: 45,
  },
];

/**
 * Mount Fuji Sequence Keyframes (5-10 seconds per medium):
 * - Start: Wide Japanese archipelago overview
 * - Waypoint 1: Honshu descent over Chubu / Kanto regions
 * - Waypoint 2: Fuji Five Lakes approach from northern piedmont
 * - Waypoint 3: Oblique view of summit caldera and Hoei crater
 * - End: Canonical hold centered on Fuji caldera (35.36°N, 138.73°E, zoom 5.8)
 */
export const FUJI_KEYFRAMES: LitmusKeyframe[] = [
  // 1. Wide Japanese Archipelago
  {
    lonDeg: 136.5,
    latDeg: 37.0,
    radius: 13.0,
    targetLonDeg: 138.73,
    targetLatDeg: 35.36,
    targetRadius: 5.0,
    fov: 52,
  },
  // 2. Honshu descent
  {
    lonDeg: 137.8,
    latDeg: 36.0,
    radius: 9.0,
    targetLonDeg: 138.73,
    targetLatDeg: 35.36,
    targetRadius: 5.0,
    fov: 50,
  },
  // 3. Fuji Five Lakes approach
  {
    lonDeg: 138.4,
    latDeg: 35.6,
    radius: 7.2,
    targetLonDeg: 138.73,
    targetLatDeg: 35.36,
    targetRadius: 5.0,
    fov: 48,
  },
  // 4. Crater oblique
  {
    lonDeg: 138.6,
    latDeg: 35.45,
    radius: 6.2,
    targetLonDeg: 138.73,
    targetLatDeg: 35.36,
    targetRadius: 5.0,
    fov: 46,
  },
  // 5. Canonical hold on Fuji caldera
  {
    lonDeg: 138.73,
    latDeg: 35.36,
    radius: 5.8,
    targetLonDeg: 138.73,
    targetLatDeg: 35.36,
    targetRadius: 5.0,
    fov: 45,
  },
];

export const HAWAII_WAYPOINTS = buildSubdividedPath(HAWAII_KEYFRAMES, 20);
export const CAPE_COD_WAYPOINTS = buildSubdividedPath(CAPE_COD_KEYFRAMES, 20);
export const GRAND_CANYON_WAYPOINTS = buildSubdividedPath(GRAND_CANYON_KEYFRAMES, 20);
export const FUJI_WAYPOINTS = buildSubdividedPath(FUJI_KEYFRAMES, 20);

export interface LitmusSequenceConfig {
  id: string;
  name: string;
  keyframes: LitmusKeyframe[];
  waypoints: Waypoint3D[];
  focus: { lon: number; lat: number; radius: number };
}

export const LITMUS_SEQUENCES: Record<string, LitmusSequenceConfig> = {
  hawaii: {
    id: 'hawaii',
    name: 'Hawaii (Litmus)',
    keyframes: HAWAII_KEYFRAMES,
    waypoints: HAWAII_WAYPOINTS,
    focus: { lon: -155.55, lat: 19.65, radius: 6.1 },
  },
  'cape-cod': {
    id: 'cape-cod',
    name: 'Cape Cod (Litmus)',
    keyframes: CAPE_COD_KEYFRAMES,
    waypoints: CAPE_COD_WAYPOINTS,
    focus: { lon: -70.0, lat: 42.0, radius: 6.2 },
  },
  'grand-canyon': {
    id: 'grand-canyon',
    name: 'Grand Canyon',
    keyframes: GRAND_CANYON_KEYFRAMES,
    waypoints: GRAND_CANYON_WAYPOINTS,
    focus: { lon: -112.14, lat: 36.06, radius: 5.8 },
  },
  fuji: {
    id: 'fuji',
    name: 'Mount Fuji',
    keyframes: FUJI_KEYFRAMES,
    waypoints: FUJI_WAYPOINTS,
    focus: { lon: 138.73, lat: 35.36, radius: 5.8 },
  },
};

export interface RegionalInsetMetadata {
  id: string;
  name: string;
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  width: number;
  height: number;
  binUrl: string;
  webpUrl: string;
}

export const SAMPLE_REGIONAL_INSETS: RegionalInsetMetadata[] = [
  {
    id: 'hawaii',
    name: 'Hawaii',
    bounds: { minLon: -161.0, maxLon: -154.0, minLat: 18.0, maxLat: 23.0 },
    width: 5400,
    height: 3600,
    binUrl: '/regional/hawaii-dem-u16.bin',
    webpUrl: '/regional/hawaii-dem.webp',
  },
  {
    id: 'capecod',
    name: 'Cape Cod',
    bounds: { minLon: -71.0, maxLon: -69.0, minLat: 41.0, maxLat: 43.0 },
    width: 2400,
    height: 2400,
    binUrl: '/regional/capecod-dem-u16.bin',
    webpUrl: '/regional/capecod-dem.webp',
  },
  {
    id: 'grand-canyon',
    name: 'Grand Canyon',
    bounds: { minLon: -112.5, maxLon: -111.5, minLat: 35.9, maxLat: 36.5 },
    width: 900,
    height: 540,
    binUrl: '/regional/dem-grand-canyon-30m.bin',
    webpUrl: '/regional/dem-grand-canyon-30m.webp',
  },
  {
    id: 'fuji',
    name: 'Mount Fuji',
    bounds: { minLon: 138.5, maxLon: 139.0, minLat: 35.2, maxLat: 35.5 },
    width: 900,
    height: 540,
    binUrl: '/regional/dem-fuji-30m.bin',
    webpUrl: '/regional/dem-fuji-30m.webp',
  },
];
