/**
 * Canonical Cartographic & Projection Mathematics Module
 *
 * Implements canonical forward and inverse geographic projections:
 * - Spherical 3D Cartesian coordinates (lon/lat -> [x, y, z])
 * - Web Mercator 2D planar projection with 85.0511° latitude clamp
 * - S-curve cubic Bezier transition easing
 * - Divergence-free analytical 3D solenoidal curl noise
 */

export const RADIUS = 5.0;
export const MAX_LAT = 85.0511287798066;

/**
 * Converts Longitude/Latitude in degrees to 3D Cartesian coordinates on a sphere
 */
export function toSphere(lon: number, lat: number, radius = RADIUS): [number, number, number] {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  return [
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda),
  ];
}

/**
 * Converts Longitude/Latitude in degrees to 2D Web Mercator planar coordinates
 */
export function toMercator(
  lon: number,
  lat: number,
  radius = RADIUS,
  maxLat = MAX_LAT
): [number, number] {
  const lambda = (lon * Math.PI) / 180;
  const clampedLat = Math.max(-maxLat, Math.min(maxLat, lat));
  const phi = (clampedLat * Math.PI) / 180;
  const x = lambda * radius;
  const y = radius * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
}

/**
 * Aliases for geographic naming conventions
 */
export const geoToSphere = toSphere;
export const geoToMercator = toMercator;

/**
 * Evaluates cubic Bezier ease-in-out curve for smooth manifold unfurling
 * Bounded strictly to [0, 1] without overshoot
 */
export function evaluateCubicBezierEase(alpha: number): number {
  const clamped = Math.max(0.0, Math.min(1.0, alpha));
  return clamped < 0.5
    ? 4.0 * clamped * clamped * clamped
    : 1.0 - Math.pow(Math.max(0.0, -2.0 * clamped + 2.0), 3.0) / 2.0;
}

/**
 * Evaluates divergence-free solenoidal 3D curl noise
 * Velocity magnitude ||u|| is strictly bounded and non-NaN
 */
export function computeCurlNoise(
  p: [number, number, number],
  time: number
): [number, number, number] {
  const k1 = 0.55;
  const k2 = 1.10;
  const t = time * 0.8;

  const ux = -k1 * Math.cos(k1 * p[1] + t * 0.7) - k2 * Math.cos(k2 * p[2] - t * 0.5);
  const uy = -k1 * Math.cos(k1 * p[2] + t * 0.9) - k2 * Math.cos(k2 * p[0] - t * 0.6);
  const uz = -k1 * Math.cos(k1 * p[0] + t * 0.8) - k2 * Math.cos(k2 * p[1] - t * 0.4);

  const u2x = 0.35 * Math.sin(1.8 * p[1] - t * 1.2);
  const u2y = 0.35 * Math.sin(1.8 * p[2] - t * 1.1);
  const u2z = 0.35 * Math.sin(1.8 * p[0] - t * 1.3);

  return [ux + u2x, uy + u2y, uz + u2z];
}
