// ============================================================================
// File: src/core/camera/litmusWaypoints.ts
// Architecture: Cartographic Litmus Test Waypoint Trajectories
// Description: Multi-stage cinematic flight paths for Hawaii and Cape Cod litmus tests
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

export const HAWAII_WAYPOINTS = buildSubdividedPath(HAWAII_KEYFRAMES, 20);
export const CAPE_COD_WAYPOINTS = buildSubdividedPath(CAPE_COD_KEYFRAMES, 20);
