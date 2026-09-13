/**
 * LCLThermodynamics.ts
 *
 * Lifting Condensation Level (LCL) thermodynamic gating for orographic precipitation.
 *
 * Physical Model:
 *   LCL ≈ 125.0 × max(T - T_d, 0.0) meters
 * where T is surface temperature (°C) and T_d is dewpoint temperature (°C).
 *
 * Orographic condensation gate:
 *   If summit elevation h(x) is below LCL - 200m, no condensation occurs (gate = 0.0).
 *   Between LCL - 200m and LCL, condensation smoothly initiates via smoothstep.
 *   Above LCL, condensation is fully active (gate = 1.0).
 *   When thermodynamic gating is disabled (OFF), gate = 1.0 everywhere (legacy behavior).
 *
 * Architecture Invariants:
 * - Invariant §3: Unconditional uniform control flow evaluation
 * - Invariant §15: Cross-pipeline DEM mathematical parity (elevMeters = demSample.a * 19772.0 - 10924.0)
 * - Invariant §20: 16-byte WGSL struct alignment discipline
 */

import { computeLCL, computeLCLGate } from '../math/volumetricMath';

export { computeLCL, computeLCLGate };

/**
 * Modulates raw precipitation rate by the thermodynamic LCL gate.
 *
 * @param precipRate Raw precipitation rate (mm/h)
 * @param elevMeters Surface elevation in meters (from DEM decode)
 * @param tempC Surface temperature in °C
 * @param dewpointC Surface dewpoint in °C
 * @param enabled Whether thermodynamic gating is enabled (default: true)
 */
export function modulatePrecipitationByLCL(
  precipRate: number,
  elevMeters: number,
  tempC: number,
  dewpointC: number,
  enabled: boolean = true
): { lclMeters: number; lclGate: number; precipModulated: number } {
  const lclMeters = computeLCL(tempC, dewpointC);
  const lclGate = computeLCLGate(elevMeters, lclMeters, enabled);
  return {
    lclMeters,
    lclGate,
    precipModulated: precipRate * lclGate,
  };
}
