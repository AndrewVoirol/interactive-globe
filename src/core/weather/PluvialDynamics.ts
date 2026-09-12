/**
 * PluvialDynamics.ts
 *
 * Canonical hydrology and pluvial dynamics module for the Indicatrix Engine.
 * Formulates rainfall-driven river channel width modulation following
 * Leopold-Maddock hydraulic power laws (Invariant §7 & §16).
 */

export const PLUVIAL_MAX_PRECIP_MM_HR = 50.0;
export const RIVER_MIN_WIDTH_PX = 0.40;
export const RIVER_MAX_WIDTH_PX = 1.98;
export const COASTLINE_WIDTH_PX = 3.40;

/**
 * Evaluates the pluvial dilation factor for river channels under precipitation.
 *
 * WGSL reference (crust_hydrosphere.wgsl):
 * let pluvialFactor = 1.0 + sim.u_pluvial_gamma * sqrt(clamp(precipRate, 0.0, 50.0));
 *
 * @param precipRate - Rainfall intensity in mm/hr
 * @param gamma - Pluvial coupling factor [0.0, 2.0]
 */
export function computePluvialFactor(precipRate: number, gamma: number): number {
  const clampedRate = Math.min(Math.max(precipRate, 0.0), PLUVIAL_MAX_PRECIP_MM_HR);
  return 1.0 + gamma * Math.sqrt(clampedRate);
}

export const evalPluvialFactor = computePluvialFactor;

/**
 * Computes river width given a base width, precipitation rate, and pluvial coupling.
 */
export function computeRiverWidth(baseWidth: number, precipRate: number, gamma: number): number {
  return baseWidth * computePluvialFactor(precipRate, gamma);
}

/**
 * Evaluates river width along a geomorphic descent profile (0 = alpine headwaters, 1 = estuary confluence).
 *
 * @param descentAccum - Normalized geomorphic accumulation [0.0, 1.0]
 * @param precipRate - Rainfall intensity in mm/hr
 * @param gamma - Pluvial coupling factor [0.0, 2.0]
 */
export function evaluateRiverWidth(
  descentAccum: number,
  precipRate: number,
  gamma: number
): { baseWidth: number; pluvialFactor: number; finalWidth: number } {
  const clampedDescent = Math.max(0.0, Math.min(1.0, descentAccum));
  const baseWidth = RIVER_MIN_WIDTH_PX + (RIVER_MAX_WIDTH_PX - RIVER_MIN_WIDTH_PX) * clampedDescent;
  const pluvialFactor = computePluvialFactor(precipRate, gamma);
  return {
    baseWidth,
    pluvialFactor,
    finalWidth: baseWidth * pluvialFactor,
  };
}

/**
 * Spherical UV parameterization for precipitation texture coordinates.
 * Maps (u, v) in [0, 1]² to geodetic longitude [-π, π], latitude [-π/2, π/2],
 * and reprojected precipitation texture coordinates (precipU, precipV).
 */
export function evalPrecipUV(
  u: number,
  v: number
): { lon: number; lat: number; precipU: number; precipV: number; x: number; y: number } {
  const lon = (u - 0.5) * 2.0 * Math.PI;
  const lat = (0.5 - v) * Math.PI;
  const precipU = (lon + Math.PI) / (2.0 * Math.PI);
  const precipV = (Math.PI * 0.5 - lat) / Math.PI;
  return {
    lon,
    lat,
    precipU,
    precipV,
    x: precipU,
    y: precipV,
  };
}
