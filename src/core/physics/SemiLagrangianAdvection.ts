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

/**
 * Evaluates 1D Catmull-Rom cubic spline interpolation at fractional offset f in [0, 1].
 * C¹-continuous Hermite polynomial basis.
 */
export function catmullRom1D(f: number, p0: number, p1: number, p2: number, p3: number): number {
  const f2 = f * f;
  const f3 = f2 * f;
  const c0 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const c1 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  const c2 = -0.5 * p0 + 0.5 * p2;
  const c3 = p1;
  return ((c0 * f + c1) * f + c2) * f + c3;
}

/**
 * 3D Catmull-Rom Tricubic Spline Interpolation over a dense 3D scalar density grid.
 * Minimizes numerical dissipation in semi-Lagrangian advection (Section 1.2).
 *
 * @param volume 1D Float32Array containing W*H*D scalar samples.
 * @param dims [width, height, depth] dimensions of the grid.
 * @param uvw Normalized sample coordinates in [0, 1]³ (wraps in U, clamps in V and W).
 * @returns Interpolated scalar density value.
 */
export function catmullRomTricubic(
  volume: Float32Array,
  dims: [number, number, number],
  uvw: [number, number, number]
): number {
  const [w, h, d] = dims;
  const pX = uvw[0] * w - 0.5;
  const pY = uvw[1] * h - 0.5;
  const pZ = uvw[2] * d - 0.5;

  const iX = Math.floor(pX);
  const iY = Math.floor(pY);
  const iZ = Math.floor(pZ);

  const fX = pX - iX;
  const fY = pY - iY;
  const fZ = pZ - iZ;

  function sampleGrid(x: number, y: number, z: number): number {
    // Periodic wrap in X (longitude)
    const wrappedX = ((x % w) + w) % w;
    // Clamp in Y (latitude) and Z (altitude)
    const clampedY = Math.max(0, Math.min(h - 1, y));
    const clampedZ = Math.max(0, Math.min(d - 1, z));
    const idx = (clampedZ * h + clampedY) * w + wrappedX;
    return volume[idx] || 0.0;
  }

  // Tricubic Catmull-Rom evaluation: 4 slices along Z, each containing 4 lines along Y of 4 taps along X (zero-allocation)
  function evalSliceY(j: number, k: number): number {
    const p0 = sampleGrid(iX - 1, iY + j, iZ + k);
    const p1 = sampleGrid(iX + 0, iY + j, iZ + k);
    const p2 = sampleGrid(iX + 1, iY + j, iZ + k);
    const p3 = sampleGrid(iX + 2, iY + j, iZ + k);
    return catmullRom1D(fX, p0, p1, p2, p3);
  }

  function evalSliceZ(k: number): number {
    const y0 = evalSliceY(-1, k);
    const y1 = evalSliceY(0, k);
    const y2 = evalSliceY(1, k);
    const y3 = evalSliceY(2, k);
    return catmullRom1D(fY, y0, y1, y2, y3);
  }

  const z0 = evalSliceZ(-1);
  const z1 = evalSliceZ(0);
  const z2 = evalSliceZ(1);
  const z3 = evalSliceZ(2);

  return catmullRom1D(fZ, z0, z1, z2, z3);
}

/**
 * Second-Order Runge-Kutta (RK2) Semi-Lagrangian Back-Trajectory Integrator (Section 1.2).
 * Traces a parcel backwards along the 3D velocity field to determine departure position x_dep.
 *
 * @param uvw Arrival position in [0, 1]³ normalized coordinates.
 * @param dt Timestep in seconds.
 * @param velocityFn Function mapping position [u, v, w] to velocity vector [du/dt, dv/dt, dw/dt] in UVW/s.
 * @returns Departure coordinates [u_dep, v_dep, w_dep] in [0, 1]³.
 */
export function rk2BackTrajectory3D(
  uvw: [number, number, number],
  dt: number,
  velocityFn: (pos: [number, number, number]) => [number, number, number]
): [number, number, number] {
  function stepCoord(pos: [number, number, number], delta: [number, number, number]): [number, number, number] {
    let u = (pos[0] - delta[0]) % 1.0;
    if (u < 0.0) u += 1.0;
    const v = Math.max(0.0001, Math.min(0.9999, pos[1] - delta[1]));
    const w = Math.max(0.0, Math.min(1.0, pos[2] - delta[2]));
    return [u, v, w];
  }

  // Step 1: Midpoint departure position x* = x - (dt / 2) * u(x, t)
  const u0 = velocityFn(uvw);
  const halfDt = dt * 0.5;
  const xStar = stepCoord(uvw, [u0[0] * halfDt, u0[1] * halfDt, u0[2] * halfDt]);

  // Step 2: Velocity evaluation at midpoint u(x*, t + dt/2)
  const uHalf = velocityFn(xStar);

  // Step 3: Full departure position x_dep = x - dt * u(x*, t + dt/2)
  return stepCoord(uvw, [uHalf[0] * dt, uHalf[1] * dt, uHalf[2] * dt]);
}

/**
 * Computes terrain-induced vertical velocity (orographic lift) w = u . grad(h).
 */
export function computeOrographicLift(
  windMps: [number, number],
  gradH: [number, number]
): number {
  return windMps[0] * gradH[0] + windMps[1] * gradH[1];
}

/**
 * Thermodynamic Source / Sink Coupling (Section 1.2):
 * Computes adiabatic orographic condensation and subsidence dissipation.
 */
export function computeThermodynamicCoupling(
  rhoStar: number,
  uDotGradH: number,
  wCrit: number,
  gammaCond: number,
  kappaEvap: number,
  rh: number,
  dt: number,
  minDens: number = 0.0,
  maxDens: number = 1.0
): { rhoNew: number; sCond: number; sEvap: number } {
  const sCond = gammaCond * Math.max(0.0, uDotGradH - wCrit);
  const sEvap = kappaEvap * Math.max(0.0, 1.0 - rh) * rhoStar;
  const rhoNew = Math.max(minDens, Math.min(maxDens, rhoStar + dt * (sCond - sEvap)));
  return { rhoNew, sCond, sEvap };
}
