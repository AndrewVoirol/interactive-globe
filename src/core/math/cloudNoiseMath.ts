// ============================================================================
// File: src/core/math/cloudNoiseMath.ts
// Pure Math Parity Module for 3D Perlin-Worley Cloud Noise (Invariant §46)
// Zero external dependencies. Zero Three.js imports.
//
// Invariants:
//   - Invariant §46: Test Import Integrity Contract (Bit-exact parity with WGSL)
// ============================================================================

export const CLOUD_NOISE_SIZE = 128;
export const WORLEY_PERIODS = [8, 16, 32] as const;
export const PERLIN_PERIODS = [4, 8, 16] as const;
export const WORLEY_OCTAVE_FREQUENCIES = [8, 16, 32] as const;

/**
 * Fast Permutation-Free 3D Integer Hash (PCG3D).
 * Bit-exact match with WGSL `pcg3d(p_in: vec3<u32>) -> vec3<f32>`.
 * Returns 3 pseudo-random floats in [0.0, 1.0).
 */
export function pcg3d(x: number, y: number, z: number): [number, number, number] {
  let vx = (Math.imul(x >>> 0, 1664525) + 1013904223) >>> 0;
  let vy = (Math.imul(y >>> 0, 1664525) + 1013904223) >>> 0;
  let vz = (Math.imul(z >>> 0, 1664525) + 1013904223) >>> 0;

  vx = (vx + Math.imul(vy, vz)) >>> 0;
  vy = (vy + Math.imul(vz, vx)) >>> 0;
  vz = (vz + Math.imul(vx, vy)) >>> 0;

  vx = (vx ^ (vx >>> 16)) >>> 0;
  vy = (vy ^ (vy >>> 16)) >>> 0;
  vz = (vz ^ (vz >>> 16)) >>> 0;

  vx = (vx + Math.imul(vy, vz)) >>> 0;
  vy = (vy + Math.imul(vz, vx)) >>> 0;
  vz = (vz + Math.imul(vx, vy)) >>> 0;

  return [vx / 4294967296.0, vy / 4294967296.0, vz / 4294967296.0];
}

/**
 * 3D Hash vector alias taking a 3-element coordinate tuple.
 */
export function hash33(p: [number, number, number]): [number, number, number] {
  return pcg3d(p[0], p[1], p[2]);
}

/**
 * Ken Perlin's C²-continuous quintic polynomial: 6t⁵ - 15t⁴ + 10t³.
 * First and second derivatives are zero at t = 0 and t = 1.
 */
export function quinticHermite(t: number): number {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

/**
 * 3D Quintic Hermite interpolation weight vector.
 */
export function quinticFade3(t: [number, number, number]): [number, number, number] {
  return [quinticHermite(t[0]), quinticHermite(t[1]), quinticHermite(t[2])];
}

/**
 * Normalized gradient vector on S² for periodic cell corner.
 */
export function perlinGradient(corner: [number, number, number], period: number): [number, number, number] {
  const p = Math.floor(period) >>> 0;
  const wx = ((Math.floor(corner[0]) % p) + p) % p;
  const wy = ((Math.floor(corner[1]) % p) + p) % p;
  const wz = ((Math.floor(corner[2]) % p) + p) % p;
  const [rx, ry, rz] = pcg3d(wx, wy, wz);
  const gx = rx * 2.0 - 1.0;
  const gy = ry * 2.0 - 1.0;
  const gz = rz * 2.0 - 1.0;
  const len = Math.hypot(gx, gy, gz);
  if (len < 0.001) {
    return [0.57735, 0.57735, 0.57735];
  }
  return [gx / len, gy / len, gz / len];
}

/**
 * Periodic 3D Perlin Gradient Noise in [0.0, 1.0].
 * Evaluated over periodic period `period` with quintic Hermite smoothing.
 */
export function periodicPerlin3D(x: number, y: number, z: number, period: number): number {
  const p = Math.floor(period);
  const sx = x * p;
  const sy = y * p;
  const sz = z * p;

  const i0x = Math.floor(sx);
  const i0y = Math.floor(sy);
  const i0z = Math.floor(sz);

  const f0x = sx - i0x;
  const f0y = sy - i0y;
  const f0z = sz - i0z;

  const wx = quinticHermite(f0x);
  const wy = quinticHermite(f0y);
  const wz = quinticHermite(f0z);

  const dotGrad = (dx: number, dy: number, dz: number) => {
    const grad = perlinGradient([i0x + dx, i0y + dy, i0z + dz], p);
    return grad[0] * (f0x - dx) + grad[1] * (f0y - dy) + grad[2] * (f0z - dz);
  };

  const d000 = dotGrad(0, 0, 0);
  const d100 = dotGrad(1, 0, 0);
  const d010 = dotGrad(0, 1, 0);
  const d110 = dotGrad(1, 1, 0);
  const d001 = dotGrad(0, 0, 1);
  const d101 = dotGrad(1, 0, 1);
  const d011 = dotGrad(0, 1, 1);
  const d111 = dotGrad(1, 1, 1);

  const x00 = d000 + wx * (d100 - d000);
  const x10 = d010 + wx * (d110 - d010);
  const x01 = d001 + wx * (d101 - d001);
  const x11 = d011 + wx * (d111 - d011);

  const y0 = x00 + wy * (x10 - x00);
  const y1 = x01 + wy * (x11 - x01);

  const val = y0 + wz * (y1 - y0);
  return Math.max(0.0, Math.min(1.0, val * 0.9 + 0.5));
}

/**
 * Alias for periodicPerlin3D.
 */
export function perlinNoise3D(x: number, y: number, z: number, period: number): number {
  return periodicPerlin3D(x, y, z, period);
}

/**
 * Periodic 3D Worley Cellular Distance in [0.0, 1.0].
 * Inverted so that 1.0 represents cellular centers (billows) and 0.0 represents boundary channels.
 */
export function periodicWorley3D(x: number, y: number, z: number, period: number): number {
  const p = Math.floor(period);
  const sx = x * p;
  const sy = y * p;
  const sz = z * p;

  const i0x = Math.floor(sx);
  const i0y = Math.floor(sy);
  const i0z = Math.floor(sz);

  const f0x = sx - i0x;
  const f0y = sy - i0y;
  const f0z = sz - i0z;

  let minDistSq = 100.0;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = (((i0x + dx) % p) + p) % p;
        const cellY = (((i0y + dy) % p) + p) % p;
        const cellZ = (((i0z + dz) % p) + p) % p;

        const [fx, fy, fz] = pcg3d(cellX, cellY, cellZ);
        const diffX = (dx + fx) - f0x;
        const diffY = (dy + fy) - f0y;
        const diffZ = (dz + fz) - f0z;

        const distSq = diffX * diffX + diffY * diffY + diffZ * diffZ;
        if (distSq < minDistSq) {
          minDistSq = distSq;
        }
      }
    }
  }

  const dist = Math.sqrt(minDistSq);
  return Math.max(0.0, Math.min(1.0, 1.0 - dist));
}

/**
 * Alias for periodicWorley3D.
 */
export function worleyNoise3D(x: number, y: number, z: number, period: number): number {
  return periodicWorley3D(x, y, z, period);
}

/**
 * Linear remap with division-by-zero protection and clamping to [outMin, outMax].
 */
export function remap(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const denom = inMax - inMin;
  const safeDenom = Math.abs(denom) < 0.0001 ? (denom < 0 ? -0.0001 : 0.0001) : denom;
  const t = Math.max(0.0, Math.min(1.0, (val - inMin) / safeDenom));
  return outMin + t * (outMax - outMin);
}

/**
 * Schneider Dilated Remap combining Perlin base with inverted Worley noise.
 */
export function combinePerlinWorley(perlin: number, worley: number): number {
  const billowThreshold = (1.0 - worley) * 0.75;
  const remapped = remap(perlin, billowThreshold, 1.0, 0.0, 1.0);
  return Math.max(0.0, Math.min(1.0, remapped / 0.75));
}

/**
 * Evaluates the full 4-channel cloud noise vector at normalized coordinate p in [0, 1]³:
 *   - Channel 0 (Red):   Perlin-Worley billow base (3-octave Perlin + Worley dilated remap)
 *   - Channel 1 (Green): Worley erosion octave 1 (period 8)
 *   - Channel 2 (Blue):  Worley erosion octave 2 (period 16)
 *   - Channel 3 (Alpha): Worley erosion octave 3 (period 32)
 */
export function evaluateCloudNoise(p: [number, number, number]): [number, number, number, number] {
  const [x, y, z] = p;

  // Channels Green, Blue, Alpha: 3 octaves of Worley erosion (periods 8, 16, 32)
  const worley8 = periodicWorley3D(x, y, z, 8);
  const worley16 = periodicWorley3D(x, y, z, 16);
  const worley32 = periodicWorley3D(x, y, z, 32);

  // Channel Red: Perlin-Worley billow base
  const perlin4 = periodicPerlin3D(x, y, z, 4);
  const perlin8 = periodicPerlin3D(x, y, z, 8);
  const perlin16 = periodicPerlin3D(x, y, z, 16);
  const perlinFbm = 0.625 * perlin4 + 0.250 * perlin8 + 0.125 * perlin16;

  const worley4 = periodicWorley3D(x, y, z, 4);
  const worleyBaseFbm = 0.625 * worley4 + 0.250 * worley8 + 0.125 * worley16;

  // Schneider Dilated Remap
  const perlinWorley = combinePerlinWorley(perlinFbm, worleyBaseFbm);

  return [perlinWorley, worley8, worley16, worley32];
}

/**
 * Sample a single cloud noise voxel at normalized (x, y, z) coordinates in [0, 1]³.
 */
export function sampleCloudNoiseVoxel(x: number, y: number, z: number): [number, number, number, number] {
  return evaluateCloudNoise([x, y, z]);
}
