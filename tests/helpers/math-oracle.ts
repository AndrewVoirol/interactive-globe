/**
 * Mathematical Oracle and Reference Models for 1,000,000-Node Globe-to-Map Matrix
 * Implements authoritative mathematical specifications from PROJECT.md, TEST_INFRA.md, and ORIGINAL_REQUEST.md
 */

export const RADIUS = 5.0;
export const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio 1.618033988749895

/**
 * 3D Spherical Coordinates (lon/lat in degrees -> 3D Cartesian coordinates)
 */
export function toSphere(lon: number, lat: number, radius = RADIUS): [number, number, number] {
  const lambda = lon * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  return [
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda),
  ];
}

/**
 * Mercator 2D Projection with latitude clamping at [-85, 85]
 */
export function toMercator(lon: number, lat: number, radius = RADIUS, maxLat = 85): [number, number] {
  const lambda = lon * (Math.PI / 180);
  const clampedLat = Math.max(-maxLat, Math.min(maxLat, lat));
  const phi = clampedLat * (Math.PI / 180);
  const x = lambda * radius;
  const y = radius * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
}

/**
 * Generates N Fibonacci sphere points [lon, lat] and [x, y, z]
 */
export function generateFibonacciSphere(N: number, radius = RADIUS): {
  coords: Array<[number, number]>;
  points3D: Float32Array;
  target2D: Float32Array;
} {
  const coords: Array<[number, number]> = [];
  const points3D = new Float32Array(N * 3);
  const target2D = new Float32Array(N * 2);

  for (let i = 0; i < N; i++) {
    const z = N === 1 ? 0 : 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = (2 * Math.PI * i) / PHI;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;

    const lat = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI);
    const lon = Math.atan2(y, x) * (180 / Math.PI);

    coords.push([lon, lat]);

    const spherePos = toSphere(lon, lat, radius);
    points3D[i * 3 + 0] = spherePos[0];
    points3D[i * 3 + 1] = spherePos[1];
    points3D[i * 3 + 2] = spherePos[2];

    const merc = toMercator(lon, lat, radius);
    target2D[i * 2 + 0] = merc[0];
    target2D[i * 2 + 1] = merc[1];
  }

  return { coords, points3D, target2D };
}

/**
 * Divergence-Free 3D Curl-Noise Field
 * Evaluates psi(p, t) vector potential and computes exact analytical curl u = curl(psi)
 */
export function computeCurlNoise(p: [number, number, number], time: number): [number, number, number] {
  const k1 = 0.55;
  const k2 = 1.10;
  const t = time * 0.8;

  const [px, py, pz] = p;

  const u_x = -k1 * Math.cos(k1 * py + t * 0.7) - k2 * Math.cos(k2 * pz - t * 0.5);
  const u_y = -k1 * Math.cos(k1 * pz + t * 0.9) - k2 * Math.cos(k2 * px - t * 0.6);
  const u_z = -k1 * Math.cos(k1 * px + t * 0.8) - k2 * Math.cos(k2 * py - t * 0.4);

  const u2_x = 0.35 * Math.sin(1.8 * py - t * 1.2);
  const u2_y = 0.35 * Math.sin(1.8 * pz - t * 1.1);
  const u2_z = 0.35 * Math.sin(1.8 * px - t * 1.3);

  return [u_x + u2_x, u_y + u2_y, u_z + u2_z];
}

/**
 * Numerical Divergence of computeCurlNoise at position p (d(ux)/dx + d(uy)/dy + d(uz)/dz)
 */
export function computeDivergence(p: [number, number, number], time: number, eps = 1e-4): number {
  const [x, y, z] = p;
  const ux_plus = computeCurlNoise([x + eps, y, z], time)[0];
  const ux_minus = computeCurlNoise([x - eps, y, z], time)[0];
  const dux_dx = (ux_plus - ux_minus) / (2 * eps);

  const uy_plus = computeCurlNoise([x, y + eps, z], time)[1];
  const uy_minus = computeCurlNoise([x, y - eps, z], time)[1];
  const duy_dy = (uy_plus - uy_minus) / (2 * eps);

  const uz_plus = computeCurlNoise([x, y, z + eps], time)[2];
  const uz_minus = computeCurlNoise([x, y, z - eps], time)[2];
  const duz_dz = (uz_plus - uz_minus) / (2 * eps);

  return dux_dx + duy_dy + duz_dz;
}

/**
 * Lamb-Oseen Vortex Circulation & Tangential Velocity Model
 */
export function lambOseenVortex(
  r: number,
  t: number,
  gamma = 1.0,
  nu = 0.1,
  t0 = 0.2
): { vTheta: number; vorticity: number } {
  const effectiveT = Math.max(0.001, t + t0);
  const coreRadiusSq = 4 * nu * effectiveT;

  if (r <= 1e-7) {
    // Limit r -> 0: vTheta -> 0, vorticity = gamma / (pi * coreRadiusSq)
    return {
      vTheta: 0,
      vorticity: gamma / (Math.PI * coreRadiusSq),
    };
  }

  const vTheta = (gamma / (2 * Math.PI * r)) * (1 - Math.exp(-(r * r) / coreRadiusSq));
  const vorticity = (gamma / (Math.PI * coreRadiusSq)) * Math.exp(-(r * r) / coreRadiusSq);

  return { vTheta, vorticity };
}

/**
 * Griffith Linear Elastic Fracture Mechanics (LEFM) Tensile Hoop Stress Model
 */
export function griffithHoopStress(
  r: number,
  theta: number,
  KI = 1.0,
  cursorHitDist = Infinity,
  beta = 1.5,
  sigmaC = 1.0
): { sigmaThetaTheta: number; localStrain: number; effectiveKI: number } {
  // Proximity amplification factor from cursor
  const proximityBoost = Number.isFinite(cursorHitDist) ? beta * Math.exp(-(cursorHitDist * cursorHitDist) / (2 * sigmaC * sigmaC)) : 0;
  const effectiveKI = KI * (1.0 + proximityBoost);

  const safeR = Math.max(0.01, r);
  const factor = effectiveKI / Math.sqrt(2 * Math.PI * safeR);
  const halfTheta = theta / 2;
  const angleTerm = Math.cos(halfTheta) * (1 + Math.sin(halfTheta) * Math.sin(1.5 * theta));

  const sigmaThetaTheta = Math.max(0, factor * angleTerm);
  const localStrain = Math.min(0.4, sigmaThetaTheta * 0.1);

  return { sigmaThetaTheta, localStrain, effectiveKI };
}

/**
 * Icosahedral Geometry (12 vertices, 20 triangular faces)
 */
export function getIcosahedronGeometry(): {
  vertices: Array<[number, number, number]>;
  faces: Array<[number, number, number]>;
  centroids: Array<[number, number, number]>;
} {
  const phi = PHI;
  const rawVerts: Array<[number, number, number]> = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];

  // Normalize vertices to unit sphere
  const vertices = rawVerts.map(v => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len] as [number, number, number];
  });

  const faces: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const centroids = faces.map(f => {
    const v0 = vertices[f[0]];
    const v1 = vertices[f[1]];
    const v2 = vertices[f[2]];
    const cx = (v0[0] + v1[0] + v2[0]) / 3;
    const cy = (v0[1] + v1[1] + v2[1]) / 3;
    const cz = (v0[2] + v1[2] + v2[2]) / 3;
    const len = Math.hypot(cx, cy, cz);
    return [cx / len, cy / len, cz / len] as [number, number, number];
  });

  return { vertices, faces, centroids };
}

/**
 * Assigns a 3D unit vector to the closest icosahedral face and computes gnomonic projection
 */
export function projectPointToDymaxionFace(p: [number, number, number]): {
  faceIndex: number;
  maxDot: number;
  gnomonicPos: [number, number, number];
} {
  const { centroids } = getIcosahedronGeometry();
  const len = Math.hypot(p[0], p[1], p[2]);
  const unitP: [number, number, number] = [p[0] / len, p[1] / len, p[2] / len];

  let maxDot = -Infinity;
  let bestFace = 0;

  for (let i = 0; i < centroids.length; i++) {
    const c = centroids[i];
    const dot = unitP[0] * c[0] + unitP[1] * c[1] + unitP[2] * c[2];
    if (dot > maxDot) {
      maxDot = dot;
      bestFace = i;
    }
  }

  // Gnomonic projection onto the face plane
  const cBest = centroids[bestFace];
  const denom = maxDot > 0 ? maxDot : 1.0;
  const gnomonicPos: [number, number, number] = [
    unitP[0] / denom,
    unitP[1] / denom,
    unitP[2] / denom,
  ];

  return { faceIndex: bestFace, maxDot, gnomonicPos };
}

/**
 * Analytical Ray-Sphere Intersection
 */
export function raySphereIntersect(
  rayOrig: [number, number, number],
  rayDir: [number, number, number],
  radius = RADIUS
): { hit: boolean; hitPos: [number, number, number] | null; distance: number } {
  const [ox, oy, oz] = rayOrig;
  const [dx, dy, dz] = rayDir;

  const dirLen = Math.hypot(dx, dy, dz);
  if (dirLen < 1e-8) {
    return { hit: false, hitPos: null, distance: Infinity };
  }

  const ndx = dx / dirLen;
  const ndy = dy / dirLen;
  const ndz = dz / dirLen;

  const a = 1.0;
  const b = 2 * (ox * ndx + oy * ndy + oz * ndz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return { hit: false, hitPos: null, distance: Infinity };
  }

  const sqrtDisc = Math.sqrt(discriminant);
  let t = (-b - sqrtDisc) / (2 * a);
  if (t < 0) {
    t = (-b + sqrtDisc) / (2 * a);
  }

  if (t < 0) {
    return { hit: false, hitPos: null, distance: Infinity };
  }

  const hitPos: [number, number, number] = [
    ox + t * ndx,
    oy + t * ndy,
    oz + t * ndz,
  ];

  return { hit: true, hitPos, distance: t };
}

/**
 * WebGL2 Backface Early-Out Culling Decision
 */
export function shouldCullBackface(
  normal: [number, number, number],
  viewDir: [number, number, number],
  alpha: number,
  threshold = -0.25
): boolean {
  if (alpha >= 0.08) return false; // Only cull on 3D globe state (alpha < 0.08)
  const dot = normal[0] * viewDir[0] + normal[1] * viewDir[1] + normal[2] * viewDir[2];
  return dot < threshold;
}

/**
 * Wireframe Moiré Opacity Scaling as a function of Node Count N
 */
export function computeWireframeOpacityScale(N: number): number {
  if (N <= 0) return 1.0;
  return Math.min(1.0, Math.sqrt(100000 / N));
}

/**
 * Layer Mode Opacity Multipliers
 * mode 0 = Both, 1 = Points Only, 2 = Wireframe Only
 */
export function getLayerOpacities(layerMode: number): { pointsOpacity: number; wireframeOpacity: number } {
  switch (layerMode) {
    case 1: // Points Only
      return { pointsOpacity: 1.0, wireframeOpacity: 0.0 };
    case 2: // Wireframe Only
      return { pointsOpacity: 0.0, wireframeOpacity: 1.0 };
    case 0: // Both
    default:
      return { pointsOpacity: 1.0, wireframeOpacity: 1.0 };
  }
}
