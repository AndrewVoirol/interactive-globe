// ============================================================================
// File: src/core/math/sgp4.ts
// NORAD Two-Line Element (TLE) Parser & SGP4 / Keplerian Orbital Propagator
// ============================================================================

export interface TLEOrbitalElements {
  catalogNumber: number;
  epochYear: number;
  epochDay: number;
  inclinationRad: number;
  raanRad: number;
  eccentricity: number;
  argPerigeeRad: number;
  meanAnomalyRad: number;
  meanMotionRadPerSec: number;
  semiMajorAxisKm: number;
}

export interface SatelliteState {
  position: [number, number, number]; // Cartesian coordinates scaled to globe (r ~ 5.0 - 5.8)
  velocity: [number, number, number]; // Tangential velocity vector
  radiusKm: number;
  speedKmS: number;
}

/**
 * Compute NORAD modulo-10 checksum for a 68-character TLE line prefix.
 * Digits '0'-'9' add their numeric value.
 * Minus '-' adds 1. All other characters (spaces, letters, plus, decimal) add 0.
 * Returns checksum digit (0-9).
 */
export function computeTLEChecksum(line68: string): number {
  let sum = 0;
  const len = Math.min(line68.length, 68);
  for (let i = 0; i < len; i++) {
    const ch = line68[i];
    if (ch >= '0' && ch <= '9') {
      sum += ch.charCodeAt(0) - 48;
    } else if (ch === '-') {
      sum += 1;
    }
  }
  return sum % 10;
}

/**
 * Parse standard NORAD 69-character Two-Line Element (TLE) record.
 */
export function parseTLE(line1: string, line2: string): TLEOrbitalElements {
  const catalogNumber = parseInt(line1.substring(2, 7).trim(), 10);
  const epochYear = parseInt(line1.substring(18, 20).trim(), 10);
  const epochDay = parseFloat(line1.substring(20, 32).trim());

  const inclinationDeg = parseFloat(line2.substring(8, 16).trim());
  const raanDeg = parseFloat(line2.substring(17, 25).trim());
  const eccentricity = parseFloat('0.' + line2.substring(26, 33).trim());
  const argPerigeeDeg = parseFloat(line2.substring(34, 42).trim());
  const meanAnomalyDeg = parseFloat(line2.substring(43, 51).trim());
  const meanMotionRevsPerDay = parseFloat(line2.substring(52, 63).trim());

  const meanMotionRadPerSec = (meanMotionRevsPerDay * 2 * Math.PI) / 86400;
  // Earth gravitational parameter mu = 398600.4418 km^3/s^2
  const mu = 398600.4418;
  const semiMajorAxisKm = Math.cbrt(mu / Math.pow(meanMotionRadPerSec, 2));

  return {
    catalogNumber,
    epochYear,
    epochDay,
    inclinationRad: (inclinationDeg * Math.PI) / 180,
    raanRad: (raanDeg * Math.PI) / 180,
    eccentricity,
    argPerigeeRad: (argPerigeeDeg * Math.PI) / 180,
    meanAnomalyRad: (meanAnomalyDeg * Math.PI) / 180,
    meanMotionRadPerSec,
    semiMajorAxisKm,
  };
}

/**
 * Propagates Keplerian orbital position at elapsed time deltaSec from epoch.
 * Returns Cartesian position [x, y, z] scaled to globe coordinate system (radius = 5.0).
 */
export function propagateOrbitalPosition(
  elements: TLEOrbitalElements,
  deltaSec: number,
  earthRadiusKm = 6378.137,
  globeScaleRadius = 5.0
): [number, number, number] {
  const { inclinationRad, raanRad, eccentricity, argPerigeeRad, meanAnomalyRad, meanMotionRadPerSec, semiMajorAxisKm } = elements;

  // Mean anomaly at elapsed time
  let M = (meanAnomalyRad + meanMotionRadPerSec * deltaSec) % (2 * Math.PI);
  if (M < 0) M += 2 * Math.PI;

  // Solve Kepler's equation M = E - e*sin(E) via Newton-Raphson
  let E = M;
  for (let iter = 0; iter < 10; iter++) {
    const f = E - eccentricity * Math.sin(E) - M;
    const fPrime = 1.0 - eccentricity * Math.cos(E);
    const deltaE = f / fPrime;
    E -= deltaE;
    if (Math.abs(deltaE) < 1e-8) break;
  }

  // True anomaly nu
  const sinNu = (Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity)) * Math.sin(E)) / (1 - eccentricity * Math.cos(E));
  const cosNu = (Math.cos(E) - eccentricity) / (1 - eccentricity * Math.cos(E));
  const nu = Math.atan2(sinNu, cosNu);

  // Radial distance in km
  const rKm = semiMajorAxisKm * (1 - eccentricity * Math.cos(E));

  // Position in orbital plane
  const u = nu + argPerigeeRad; // Argument of latitude
  const xOrb = rKm * Math.cos(u);
  const yOrb = rKm * Math.sin(u);

  // Rotate into ECI Cartesian frame
  const cosRaan = Math.cos(raanRad);
  const sinRaan = Math.sin(raanRad);
  const cosInc = Math.cos(inclinationRad);
  const sinInc = Math.sin(inclinationRad);

  const xEci = xOrb * cosRaan - yOrb * sinRaan * cosInc;
  const yEci = xOrb * sinRaan + yOrb * cosRaan * cosInc;
  const zEci = yOrb * sinInc;

  // Normalize relative to Earth radius and scale to globe representation (Y-up representation)
  const scale = globeScaleRadius / earthRadiusKm;
  return [xEci * scale, zEci * scale, yEci * scale];
}

/**
 * Propagate both Cartesian position and velocity state vector.
 */
export function propagateOrbitalState(
  elements: TLEOrbitalElements,
  deltaSec: number,
  earthRadiusKm = 6378.137,
  globeScaleRadius = 5.0
): SatelliteState {
  const pos = propagateOrbitalPosition(elements, deltaSec, earthRadiusKm, globeScaleRadius);
  const dt = 1.0;
  const posNext = propagateOrbitalPosition(elements, deltaSec + dt, earthRadiusKm, globeScaleRadius);

  const vx = (posNext[0] - pos[0]) / dt;
  const vy = (posNext[1] - pos[1]) / dt;
  const vz = (posNext[2] - pos[2]) / dt;

  const rScaled = Math.hypot(pos[0], pos[1], pos[2]);
  const radiusKm = (rScaled / globeScaleRadius) * earthRadiusKm;
  const speedKmS = Math.hypot(vx, vy, vz) * (earthRadiusKm / globeScaleRadius);

  return {
    position: pos,
    velocity: [vx, vy, vz],
    radiusKm,
    speedKmS,
  };
}
