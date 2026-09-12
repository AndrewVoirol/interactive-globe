// ============================================================================
// File: src/core/physics/SemiLagrangianAdvection.ts
// Architecture: Riemannian Exponential Map & Spherical Geodesic Semi-Lagrangian Advection on S²
// Invariant §18: Spherical metric arc-length evaluation on S² manifold
// ============================================================================

export const EARTH_RADIUS_M: number = 6371000.0;
export const INV_EARTH_RADIUS_M: number = 1.5696123e-7;
export const PI_F32: number = 3.14159265358979323846;
export const INV_PI_F32: number = 0.31830988618379067154;
export const INV_TWO_PI_F32: number = 0.15915494309189533577;

/**
 * Evaluates exact great-circle departure points on S² for semi-Lagrangian advection.
 * Eliminates flat-earth tangent plane singularities and polar division-by-zero artifacts.
 *
 * @param arrivalUV [u, v] Arrival coordinates in [0, 1]² where v=0 is North Pole, v=1 is South Pole.
 * @param windVelMps [u, v] Wind velocity vector in m/s (eastward, northward).
 * @param deltaTSeconds Integration timestep in seconds.
 * @returns [uv_x, uv_y] Great-circle departure UV coordinates in [0, 1]².
 */
export function mapSphericalGeodesicUV(
  arrivalUV: [number, number],
  windVelMps: [number, number],
  deltaTSeconds: number
): [number, number] {
  const phi_a = (0.5 - arrivalUV[1]) * PI_F32;
  const cos_phi_a = Math.cos(phi_a);
  const sin_phi_a = Math.sin(phi_a);
  const lam_p = windVelMps[0] * (INV_EARTH_RADIUS_M * deltaTSeconds);
  const phi_p = windVelMps[1] * (INV_EARTH_RADIUS_M * deltaTSeconds);
  const sigma_sq = lam_p * lam_p + phi_p * phi_p;
  const sigma = Math.sqrt(sigma_sq);
  const sinc = sigma > 1e-4 ? Math.sin(sigma) / Math.max(sigma, 1e-7) : 1.0 - sigma_sq * 0.16666667;
  const cos_sigma = Math.cos(sigma);
  const c_lam = sinc * lam_p;
  const c_phi = sinc * phi_p;
  const sin_phi_d = Math.max(-1.0, Math.min(1.0, c_phi * cos_phi_a + cos_sigma * sin_phi_a));
  const phi_d = Math.asin(sin_phi_d);
  const y = c_lam;
  const x = cos_sigma * cos_phi_a - c_phi * sin_phi_a;
  const delta_lambda = Math.atan2(y, x);
  // WGSL fract(x): x - floor(x)
  const rawX = arrivalUV[0] + delta_lambda * INV_TWO_PI_F32 + 1.0;
  const uv_x = rawX - Math.floor(rawX);
  const uv_y = Math.max(0.0001, Math.min(0.9999, 0.5 - phi_d * INV_PI_F32));
  return [uv_x, uv_y];
}

/**
 * Bidirectional semi-Lagrangian great-circle advection interpolation between two temporal states.
 */
export function sampleAdvectedPrecipitationField(
  arrivalUV: [number, number],
  windVelMps: [number, number],
  tau: number,
  sampleTexture: (uv: [number, number], slot: number) => number
): number {
  const uv0 = mapSphericalGeodesicUV(arrivalUV, [-windVelMps[0], -windVelMps[1]], tau * 3600.0);
  const uv1 = mapSphericalGeodesicUV(arrivalUV, [windVelMps[0], windVelMps[1]], (1.0 - tau) * 3600.0);
  const s0 = sampleTexture(uv0, 0);
  const s1 = sampleTexture(uv1, 1);
  return s0 * (1.0 - tau) + s1 * tau;
}
