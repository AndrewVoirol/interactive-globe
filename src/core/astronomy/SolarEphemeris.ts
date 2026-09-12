/**
 * SolarEphemeris.ts
 *
 * Astronomical solar position computation for the Indicatrix Engine.
 * Computes solar declination, subsolar longitude, and the normalized 3D
 * geocentric sun direction vector from any UTC timestamp.
 *
 * Uses the analytical solar approximation for cartographic illumination:
 * - Day of year: d = floor((utcEpochMs - Date.UTC(year, 0, 1)) / 86400000)
 * - Solar declination: δ ≈ -23.44° × cos(360° / 365.24 × (d + 10))
 * - Subsolar longitude: λ_sun ≈ -15° × (hourUTC - 12.0)
 * - Geocentric vector: x = cos(δ) * sin(λ_sun), y = sin(δ), z = cos(δ) * cos(λ_sun)
 */

export interface SolarPosition {
  /** Solar declination in radians (approx. [-23.44°, +23.44°]) */
  declination: number;
  /** Subsolar longitude in radians (approx. [-π, +π]) */
  subsolarLon: number;
  /** Normalized 3D sun direction vector in geocentric coordinates (x, y, z) */
  sunVector: [number, number, number];
}

const DEG_TO_RAD = Math.PI / 180;
const MS_PER_DAY = 86400000;

/**
 * Computes astronomical solar position from a UTC timestamp in epoch milliseconds.
 *
 * @param utcEpochMs - Timestamp in milliseconds since Unix epoch (UTC)
 * @returns SolarPosition containing declination (rad), subsolarLon (rad), and unit sunVector
 */
export function getSolarPosition(utcEpochMs: number): SolarPosition {
  if (!Number.isFinite(utcEpochMs)) {
    return {
      declination: 0,
      subsolarLon: 0,
      sunVector: [0, 0, 1],
    };
  }

  const date = new Date(utcEpochMs);
  if (!Number.isFinite(date.getTime())) {
    return {
      declination: 0,
      subsolarLon: 0,
      sunVector: [0, 0, 1],
    };
  }

  const year = date.getUTCFullYear();
  // Handle JS Date.UTC quirk where 0 <= year <= 99 is treated as 1900 + year
  let startOfYear: number;
  if (year >= 0 && year < 100) {
    const s = new Date(0);
    s.setUTCFullYear(year, 0, 1);
    s.setUTCHours(0, 0, 0, 0);
    startOfYear = s.getTime();
  } else {
    startOfYear = Date.UTC(year, 0, 1);
  }
  const d = Math.floor((utcEpochMs - startOfYear) / MS_PER_DAY);

  // Solar declination: δ ≈ -23.44° × cos(360° / 365.24 × (d + 10))
  const declinationDeg = -23.44 * Math.cos(((360 / 365.24) * (d + 10)) * DEG_TO_RAD);
  const declination = (declinationDeg * DEG_TO_RAD) || 0;

  // Subsolar longitude: λ_sun ≈ -15° × (hourUTC - 12.0)
  const hourUTC =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;
  const subsolarLonDeg = -15 * (hourUTC - 12.0);
  const subsolarLon = (subsolarLonDeg * DEG_TO_RAD) || 0;

  // Normalized 3D sun direction vector in geocentric coordinates
  // Consistent with Indicatrix Engine sphere mapping:
  // x = cos(lat) * sin(lon)
  // y = sin(lat)
  // z = cos(lat) * cos(lon)
  const cosDec = Math.cos(declination);
  const x = (cosDec * Math.sin(subsolarLon)) || 0;
  const y = (Math.sin(declination)) || 0;
  const z = (cosDec * Math.cos(subsolarLon)) || 0;

  const len = Math.hypot(x, y, z);
  const sunVector: [number, number, number] =
    len > 0 ? [(x / len) || 0, (y / len) || 0, (z / len) || 0] : [0, 0, 1];

  return {
    declination,
    subsolarLon,
    sunVector,
  };
}
