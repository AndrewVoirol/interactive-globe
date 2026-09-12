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

/**
 * Computes the Lifting Condensation Level (LCL) in meters.
 * Air parcel temperature T and dewpoint T_d in Celsius (°C).
 * If T < T_d (super-saturated / dewpoint depression negative), clamps to 0.0m.
 */
export function computeLCL(tempC: number, dewpointC: number): number {
  return 125.0 * Math.max(tempC - dewpointC, 0.0);
}

/**
 * Evaluates the smooth thermodynamic LCL gate factor [0.0, 1.0].
 * smoothstep(lclMeters - 200.0, lclMeters, elevMeters)
 *
 * @param elevMeters Crust surface elevation in meters
 * @param lclMeters Lifting Condensation Level in meters
 * @param enabled Whether thermodynamic gating is active (default: true). When false, returns 1.0.
 */
export function computeLCLGate(
  elevMeters: number,
  lclMeters: number,
  enabled: boolean = true
): number {
  if (!enabled) {
    return 1.0;
  }
  const edge0 = lclMeters - 200.0;
  const edge1 = lclMeters;
  if (edge1 <= edge0) {
    return elevMeters >= edge1 ? 1.0 : 0.0;
  }
  const t = Math.max(0.0, Math.min(1.0, (elevMeters - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t); // smoothstep
}

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
