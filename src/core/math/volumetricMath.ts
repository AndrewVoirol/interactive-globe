// ============================================================================
// File: src/core/math/volumetricMath.ts
// Pure Math Parity Module for Volumetric Clouds & Psychrometrics (Invariant §46)
// Zero external dependencies. Zero Three.js imports. Zero WebGPU or DOM calls.
// ============================================================================

export const EARTH_RADIUS_KM = 6371.0;
export const EARTH_CIRCUMFERENCE_KM = 40030.17359204114;
export const EARTH_MERIDIAN_KM = 20015.08679602057;

export const DEFAULT_SUN_AZIMUTH_DEG = 315.0; // NW key light
export const DEFAULT_SUN_ALTITUDE_DEG = 45.0;
export const MIN_SUN_ALTITUDE_DEG = 5.0;
export const MAX_SUN_ALTITUDE_DEG = 85.0;
export const SHADOW_PENUMBRA_KM = 20.0;

export const EARTH_RADIUS_UNITS = 5.0;
export const EARTH_RADIUS_METERS = 6371000.0;
export const TROPOSPHERE_MAX_ALTITUDE_METERS = 12000.0;
export const DEFAULT_CLOUD_THICKNESS_METERS = 1500.0;
export const DEFAULT_EXTINCTION_COEFFICIENT = 45.0;

export type Vec3 = [number, number, number];

export interface RaySphereHit {
  tNear: number;
  tFar: number;
}

export interface TroposphericInterval {
  tStart: number;
  tEnd: number;
}

export const TROPOSPHERIC_STRATA = {
  low: {
    baseMeters: 500.0,
    topMeters: 2500.0,
    nominalAltitudeMeters: 1500.0,
    opticalWeight: 1.0,
  },
  mid: {
    baseMeters: 3000.0,
    topMeters: 7000.0,
    nominalAltitudeMeters: 5000.0,
    opticalWeight: 0.70,
  },
  high: {
    baseMeters: 8000.0,
    topMeters: 12000.0,
    nominalAltitudeMeters: 10000.0,
    opticalWeight: 0.30,
  },
} as const;

// 4 Poisson disk tap offsets (rotated constellation with unit radius)
export const POISSON_DISK_4_TAPS: ReadonlyArray<[number, number]> = [
  [-0.38, -0.92],
  [0.92, -0.38],
  [0.38, 0.92],
  [-0.92, 0.38],
];

/**
 * Standard smoothstep polynomial: 3t² - 2t³.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) {
    return x >= edge1 ? 1.0 : 0.0;
  }
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Computes the Lifting Condensation Level (LCL) in meters.
 * Espy formula: h_base = 125.0 * max(T - T_d, 0.0).
 * Safe handling for NaNs and non-finites.
 */
export function computeLCL(tempC: number, dewpointC: number): number {
  if (!Number.isFinite(tempC) || !Number.isFinite(dewpointC)) {
    return 0.0;
  }
  return 125.0 * Math.max(tempC - dewpointC, 0.0);
}

/**
 * Alias for computeLCL conforming to camera/atmosphere naming convention.
 */
export function computeLCLHeightMeters(tempC: number, dewpointC: number): number {
  return computeLCL(tempC, dewpointC);
}

/**
 * Computes surface dew point from dry-bulb temperature and relative humidity
 * using the Sonntag (1990) formulation of the Magnus-Tetens approximation.
 */
export function computeDewPointFromRH(tempC: number, rhPercent: number): number {
  if (!Number.isFinite(tempC) || !Number.isFinite(rhPercent)) {
    return tempC;
  }
  const rh = Math.max(0.01, Math.min(100.0, rhPercent));
  const a = 17.625;
  const b = 243.04;
  const alpha = (a * tempC) / (b + tempC) + Math.log(rh / 100.0);
  return (b * alpha) / (a - alpha);
}

/**
 * Computes relative humidity [0, 100]% from dry-bulb temperature and dew point.
 */
export function computeRHFromDewPoint(tempC: number, dewpointC: number): number {
  if (!Number.isFinite(tempC) || !Number.isFinite(dewpointC)) {
    return 100.0;
  }
  const safeTd = Math.min(tempC, dewpointC);
  const a = 17.625;
  const b = 243.04;
  const rh = 100.0 * Math.exp((a * safeTd) / (b + safeTd) - (a * tempC) / (b + tempC));
  return Math.max(0.0, Math.min(100.0, rh));
}

/**
 * Evaluates the thermodynamic LCL condensation gate [0.0, 1.0].
 * Below (lclMeters - 200m), gate = 0.0. Above lclMeters, gate = 1.0.
 */
export function computeLCLGate(
  elevMeters: number,
  lclMeters: number,
  enabled: boolean = true
): number {
  if (!enabled) return 1.0;
  return smoothstep(lclMeters - 200.0, lclMeters, elevMeters);
}

/**
 * Computes cloud deck vertical boundaries considering local LCL.
 */
export function computeCloudDeckBoundaries(
  stratum: 'low' | 'mid' | 'high',
  lclMeters: number = 500.0
): { baseMeters: number; topMeters: number; thicknessMeters: number } {
  const spec = TROPOSPHERIC_STRATA[stratum];
  if (stratum === 'low') {
    const base = Math.max(spec.baseMeters, lclMeters);
    const top = Math.max(base + 500.0, spec.topMeters);
    return { baseMeters: base, topMeters: top, thicknessMeters: top - base };
  }
  return {
    baseMeters: spec.baseMeters,
    topMeters: spec.topMeters,
    thicknessMeters: spec.topMeters - spec.baseMeters,
  };
}

/**
 * Evaluates vertical cloud density profile factor S(z) in [0.0, 1.0].
 */
export function computeVerticalCloudProfile(
  altitudeMeters: number,
  baseMeters: number,
  topMeters: number,
  transitionMarginMeters: number = 150.0
): number {
  const bottomGate = smoothstep(
    baseMeters - transitionMarginMeters,
    baseMeters + transitionMarginMeters * 0.5,
    altitudeMeters
  );
  const topGate = smoothstep(
    topMeters + transitionMarginMeters,
    topMeters - transitionMarginMeters * 0.5,
    altitudeMeters
  );
  return bottomGate * topGate;
}

/**
 * Computes composite column-integrated cloud cover using maximum-random overlap rule.
 */
export function computeColumnIntegratedCloudCover(
  lowCover: number,
  midCover: number,
  highCover: number,
  weights: [number, number, number] = [1.0, 0.70, 0.30]
): number {
  const cl = Math.max(0.0, Math.min(1.0, lowCover)) * weights[0];
  const cm = Math.max(0.0, Math.min(1.0, midCover)) * weights[1];
  const ch = Math.max(0.0, Math.min(1.0, highCover)) * weights[2];
  return 1.0 - (1.0 - cl) * (1.0 - cm) * (1.0 - ch);
}

/**
 * Computes equirectangular ground shadow UV offset matching crust_hydrosphere.wgsl:697-719.
 */
export function computeCloudShadowOffset(
  uvY: number,
  sunAzimuthDeg: number = DEFAULT_SUN_AZIMUTH_DEG,
  sunAltitudeDeg: number = DEFAULT_SUN_ALTITUDE_DEG,
  cloudAltKm: number = 2.5
): { deltaU: number; deltaV: number } {
  const azDeg = sunAzimuthDeg > 0.0 ? sunAzimuthDeg : DEFAULT_SUN_AZIMUTH_DEG;
  const altDeg = sunAltitudeDeg > 0.0 ? sunAltitudeDeg : DEFAULT_SUN_ALTITUDE_DEG;

  const radAz = (azDeg * Math.PI) / 180.0;
  const radAlt = Math.max(
    (MIN_SUN_ALTITUDE_DEG * Math.PI) / 180.0,
    Math.min((MAX_SUN_ALTITUDE_DEG * Math.PI) / 180.0, (altDeg * Math.PI) / 180.0)
  );
  const tanAlt = Math.tan(radAlt);

  const latNorm = (uvY - 0.5) * Math.PI;
  const cosLat = Math.max(0.15, Math.cos(latNorm));

  const deltaU = -(cloudAltKm / (tanAlt * EARTH_CIRCUMFERENCE_KM)) * (Math.cos(radAz) / cosLat);
  const deltaV = (cloudAltKm / (tanAlt * EARTH_MERIDIAN_KM)) * Math.sin(radAz);

  return { deltaU, deltaV };
}

/**
 * Computes soft shadow factor from sampled cloud density and intensity.
 * Matching crust_hydrosphere.wgsl:750.
 */
export function computeCloudShadowFactor(cloudDensity: number, intensity: number): number {
  const dens = Math.max(0.0, Math.min(1.0, cloudDensity));
  const inten = Math.max(0.0, Math.min(0.60, intensity));
  const shadowFactor = 1.0 - inten * smoothstep(0.10, 0.35, dens);
  return Math.max(0.0, Math.min(1.0, shadowFactor));
}

/**
 * Beer-Lambert exponential transmittance: T = exp(-max(0, opticalDepth)).
 */
export function beerLambert(opticalDepth: number): number {
  return Math.exp(-Math.max(0.0, opticalDepth));
}

/**
 * Alias for beerLambert conforming to test suite naming.
 */
export function computeBeerLambertTransmission(opticalDepth: number): number {
  return beerLambert(opticalDepth);
}

/**
 * Evaluates a single raymarch step transmittance and opacity.
 */
export function integrateOpticalStep(
  currentTransmittance: number,
  density: number,
  sigmaT: number,
  stepSize: number
): { nextTransmittance: number; stepAlpha: number } {
  const stepOpticalDepth = Math.max(0.0, density) * sigmaT * stepSize;
  const stepTransmittance = Math.exp(-stepOpticalDepth);
  const nextTransmittance = currentTransmittance * stepTransmittance;
  const stepAlpha = 1.0 - stepTransmittance;
  return { nextTransmittance, stepAlpha };
}

/**
 * Single-lobe Henyey-Greenstein phase function.
 */
export function henyeyGreenstein(cosTheta: number, g: number): number {
  const clampedG = Math.max(-0.999, Math.min(0.999, g));
  const denom = 1.0 + clampedG * clampedG - 2.0 * clampedG * cosTheta;
  return (1.0 / (4.0 * Math.PI)) * ((1.0 - clampedG * clampedG) / Math.pow(Math.max(0.0001, denom), 1.5));
}

/**
 * Dual-lobe Henyey-Greenstein phase function modeling forward Mie glare + backward rim.
 */
export function dualLobeHenyeyGreenstein(
  cosTheta: number,
  g1: number = 0.82,
  g2: number = -0.25,
  weight: number = 0.70
): number {
  return weight * henyeyGreenstein(cosTheta, g1) + (1.0 - weight) * henyeyGreenstein(cosTheta, g2);
}

/**
 * Backward-compatible alias for dualLobeHenyeyGreenstein conforming to Challenger and Milestone specifications.
 */
export const dualHenyeyGreensteinPhase = dualLobeHenyeyGreenstein;

/**
 * Evaluates 1-tap solar crevice shadow transmittance matching
 * volumetric_cloud.wgsl.
 *
 * @param shadowDensity Sampled scalar cloud density at light step offset [0.0, 1.0]
 * @param extinctionCoeff Cloud extinction coefficient sigma_t (default: DEFAULT_EXTINCTION_COEFFICIENT = 45.0)
 * @param stepDistanceWorld World distance step toward solar disk (default: 0.0006, ~765m)
 * @param opticalMultiplier Empirical crevice shadow amplifier (default: 4.0)
 * @returns Transmittance factor in (0.0, 1.0]
 */
export function computeSunShadowTransmittance(
  shadowDensity: number,
  extinctionCoeff: number = DEFAULT_EXTINCTION_COEFFICIENT,
  stepDistanceWorld: number = 0.0006,
  opticalMultiplier: number = 4.0
): number {
  const d = Math.max(0.0, Math.min(1.0, shadowDensity));
  const opticalDepthSun = d * extinctionCoeff * stepDistanceWorld * opticalMultiplier;
  return Math.exp(-opticalDepthSun);
}

/**
 * Evaluates crevice ambient occlusion from local and shadow probe densities.
 * Deep crevices between cloud billows receive diffuse skylight attenuation.
 *
 * @param shadowDensity Sampled density along the sun ray [0.0, 1.0]
 * @param localDensity Sampled density at the current raymarch step [0.0, 1.0]
 * @param aoStrength Scaling strength (default: 0.85)
 * @param minAO Minimum diffuse ambient occlusion floor (default: 0.12)
 * @returns Ambient occlusion factor in [minAO, 1.0]
 */
export function computeCreviceAmbientOcclusion(
  shadowDensity: number,
  localDensity: number = 0.0,
  aoStrength: number = 0.85,
  minAO: number = 0.12
): number {
  const s = Math.max(0.0, Math.min(1.0, shadowDensity));
  const l = Math.max(0.0, Math.min(1.0, localDensity));
  const combined = 0.60 * s + 0.40 * l;
  return Math.max(minAO, Math.min(1.0, 1.0 - combined * aoStrength));
}

/**
 * Medium inking palette interface conforming to Invariant §24 & §28.
 */
export interface CloudMediumPalette {
  theme: number;
  name: string;
  sunColor: [number, number, number];
  midColor: [number, number, number];
  ambientColor: [number, number, number];
  inkAbsorption: number;
  inkDensityFactor: number;
}

/**
 * Period-accurate archival cloud drafting palettes for Themes 0, 1, 2.
 * Conforms strictly to Invariants §24 and §28.
 */
export const CLOUD_MEDIUM_PALETTES: Readonly<Record<number, CloudMediumPalette>> = {
  0: {
    theme: 0,
    name: 'Marie Tharp (1977) Physiographic Chart',
    sunColor: [1.00, 0.96, 0.91],     // Warm lithographic sunlit cream
    midColor: [0.72, 0.78, 0.84],     // Pale ocean-illuminated parchment glaze
    ambientColor: [0.12, 0.20, 0.32], // Deep oceanic indigo shadow (#1E293B)
    inkAbsorption: 1.0,
    inkDensityFactor: 1.0,
  },
  1: {
    theme: 1,
    name: 'Cream Rag (310 GSM Cotton Rag)',
    sunColor: [0.98, 0.94, 0.88],     // Soft warm absorbent ivory wash
    midColor: [0.64, 0.58, 0.50],     // Raw umber watercolor glaze
    ambientColor: [0.22, 0.19, 0.16], // Archival sepia-charcoal ink wash (#38302A)
    inkAbsorption: 0.92,
    inkDensityFactor: 0.92,
  },
  2: {
    theme: 2,
    name: 'Prussian Cyanotype (1842 Blueprint)',
    sunColor: [0.88, 0.96, 1.00],     // Actinic solarized blueprint highlight
    midColor: [0.31, 0.48, 0.64],     // Washed architectural cerulean wash (#4F79A3)
    ambientColor: [0.00, 0.19, 0.33], // Deep Prussian blue / ferric ferrocyanide (#003153)
    inkAbsorption: 1.15,
    inkDensityFactor: 1.15,
  },
};

/**
 * Retrieves cloud medium palette with safe clamping to [0, 2].
 */
export function getCloudMediumPalette(themeIndex: number): CloudMediumPalette {
  const clamped = Math.max(0, Math.min(2, Math.floor(themeIndex)));
  return CLOUD_MEDIUM_PALETTES[clamped];
}

/**
 * Computes golden hour rim lighting intensity combining dual-lobe HG phase
 * and forward phase boost when sunAltitudeDeg < 15.0°.
 */
export function computeGoldenHourRimIntensity(
  cosTheta: number,
  sunAltitudeDegOrG1: number = 45.0,
  g2: number = -0.25,
  weight: number = 0.70
): number {
  let g1 = 0.82;
  let sunAltitudeDeg = 45.0;
  if (Math.abs(sunAltitudeDegOrG1) <= 1.0) {
    g1 = sunAltitudeDegOrG1;
  } else {
    sunAltitudeDeg = sunAltitudeDegOrG1;
  }
  const ct = Math.max(-0.9999, Math.min(0.9999, cosTheta));
  const phase = dualLobeHenyeyGreenstein(ct, g1, g2, weight);
  if (sunAltitudeDeg < 15.0) {
    const sunAlt = Math.max(0.0, sunAltitudeDeg);
    const t = Math.max(0.0, Math.min(1.0, (15.0 - sunAlt) / 12.0));
    const sunsetWarmth = t * t * (3.0 - 2.0 * t);
    const forwardBoost = Math.max(0.0, ct) * sunsetWarmth * 0.40;
    return phase * (1.0 + forwardBoost);
  }
  return phase;
}

/**
 * Computes sunset solar color warming (Rayleigh reddening at low sun altitudes).
 */
export function computeSunsetSolarColor(
  baseSunColor: Vec3,
  sunAltitudeDeg: number
): Vec3 {
  const sunAlt = Math.max(0.0, Math.min(90.0, sunAltitudeDeg));
  if (sunAlt >= 15.0) return [baseSunColor[0], baseSunColor[1], baseSunColor[2]];
  const t = Math.max(0.0, Math.min(1.0, (15.0 - sunAlt) / (15.0 - 3.0)));
  const sunsetWarmth = t * t * (3.0 - 2.0 * t);
  const factor = sunsetWarmth * 0.75;
  const warmColor: Vec3 = [1.00, 0.72, 0.42];
  return [
    baseSunColor[0] * (1.0 - factor) + warmColor[0] * factor,
    baseSunColor[1] * (1.0 - factor) + warmColor[1] * factor,
    baseSunColor[2] * (1.0 - factor) + warmColor[2] * factor,
  ];
}


/**
 * Computes ray intersection with a sphere centered at the origin.
 * @param r0 Ray origin in world units
 * @param dir Normalized ray direction
 * @param radius Sphere radius in world units
 * @returns { tNear, tFar } or null if no intersection
 */
export function intersectRaySphere(r0: Vec3, dir: Vec3, radius: number): RaySphereHit | null {
  const b = r0[0] * dir[0] + r0[1] * dir[1] + r0[2] * dir[2];
  const c = r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2] - radius * radius;
  const d = b * b - c;
  if (d < 0.0) return null;
  const sqrtD = Math.sqrt(d);
  return {
    tNear: -b - sqrtD,
    tFar: -b + sqrtD,
  };
}

/**
 * Computes the tropospheric raymarch interval bounded by inner and outer concentric spheres.
 * @param r0 Ray origin
 * @param dir Normalized ray direction
 * @param rBottom Inner cloud boundary radius (R0 + h_base)
 * @param rTop Outer cloud boundary radius (R0 + h_top)
 */
export function computeTroposphericInterval(
  r0: Vec3,
  dir: Vec3,
  rBottom: number,
  rTop: number
): TroposphericInterval | null {
  const hitTop = intersectRaySphere(r0, dir, rTop);
  if (!hitTop || hitTop.tFar < 0.0) return null;

  const hitBottom = intersectRaySphere(r0, dir, rBottom);

  let tStart = Math.max(0.0, hitTop.tNear);
  let tEnd = hitTop.tFar;

  if (hitBottom) {
    if (hitBottom.tNear > 0.0) {
      // Ray hits inner sphere from outside
      tEnd = Math.min(tEnd, hitBottom.tNear);
    } else if (hitBottom.tFar > 0.0) {
      // Ray starts inside inner sphere
      tStart = Math.max(tStart, hitBottom.tFar);
    }
  }

  if (tStart >= tEnd) return null;
  return { tStart, tEnd };
}

/**
 * Clamps the raymarch interval to the planetary terrain distance.
 * Prevents clouds from rendering beneath or through the crust.
 */
export function clampRayIntervalToTerrain(
  tStart: number,
  tEnd: number,
  tTerrain: number
): TroposphericInterval | null {
  if (tTerrain <= tStart) return null;
  return {
    tStart,
    tEnd: Math.min(tEnd, tTerrain),
  };
}

/**
 * Converts meters above sea level to world radius units.
 */
export function metersToWorldUnits(meters: number): number {
  return (meters / EARTH_RADIUS_METERS) * EARTH_RADIUS_UNITS;
}

/**
 * Converts world radius units to meters above sea level.
 */
export function worldUnitsToMeters(units: number): number {
  return (units / EARTH_RADIUS_UNITS) * EARTH_RADIUS_METERS;
}

/**
 * Computes inner and outer cloud shell sphere radii.
 */
export function computeCloudLayerRadii(
  lclMeters: number,
  thicknessMeters: number = DEFAULT_CLOUD_THICKNESS_METERS
): { rBottom: number; rTop: number } {
  const clampedLcl = Math.max(100.0, Math.min(lclMeters, 5000.0));
  const rBottom = EARTH_RADIUS_UNITS + metersToWorldUnits(clampedLcl);
  const rTop = rBottom + metersToWorldUnits(thicknessMeters);
  return { rBottom, rTop };
}

/**
 * Reconstructs 3D world position from depth buffer value and inverse view-projection matrix.
 */
export function reconstructWorldPositionFromDepth(
  screenX: number,
  screenY: number,
  depth: number,
  width: number,
  height: number,
  invViewProj: Float32Array | number[]
): Vec3 {
  const ndcX = (screenX / width) * 2.0 - 1.0;
  const ndcY = 1.0 - (screenY / height) * 2.0;
  const ndcZ = depth;

  const m = invViewProj;
  const x = m[0] * ndcX + m[4] * ndcY + m[8] * ndcZ + m[12];
  const y = m[1] * ndcX + m[5] * ndcY + m[9] * ndcZ + m[13];
  const z = m[2] * ndcX + m[6] * ndcY + m[10] * ndcZ + m[14];
  const w = m[3] * ndcX + m[7] * ndcY + m[11] * ndcZ + m[15];

  const invW = w !== 0.0 ? 1.0 / w : 1.0;
  return [x * invW, y * invW, z * invW];
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
 * Analytical 1D Cumulus Height-Density Profile with Convective Buoyancy Expansion.
 * - Flat thermodynamic base at LCL (lowBottom).
 * - Rapid rise in lower 16% of stratum.
 * - Convective mushrooming lateral spread in the upper 40% before inversion cap.
 * - Rounded dome decay terminating at lowTop.
 */
export function cumulusHeightProfile(hNorm: number, lowBottom: number, lowTop: number): number {
  if (hNorm <= lowBottom || hNorm >= lowTop) {
    return 0.0;
  }
  const delta = Math.max(0.0001, lowTop - lowBottom);
  const z = Math.max(0.0, Math.min(1.0, (hNorm - lowBottom) / delta));

  const baseRise = smoothstep(0.0, 0.16, z);
  const topDecay = 1.0 - smoothstep(0.28, 1.0, z);
  const mushroomSpread = 1.0 + 0.22 * Math.sin(Math.PI * Math.max(0.0, Math.min(1.0, (z - 0.35) / 0.65)));

  return Math.max(0.0, Math.min(1.0, baseRise * topDecay * mushroomSpread));
}

/**
 * Decoupled Spherical 3D Sampling Coordinate.
 * Horizontally maps along the unit sphere normal n = p / |p| scaled by freqHoriz.
 * Vertically scales along the radial normal by hNorm * freqVert, traversing multiple complete Worley periods.
 */
export function sphericalNoiseCoord(
  pos: Vec3,
  hNorm: number,
  freqHoriz: number,
  freqVert: number,
  timeDrift: number
): Vec3 {
  const [px, py, pz] = pos;
  const len = Math.hypot(px, py, pz);
  const invLen = len > 1e-6 ? 1.0 / len : 1.0;
  const nx = px * invLen;
  const ny = py * invLen;
  const nz = pz * invLen;

  const radialScale = freqHoriz + hNorm * freqVert;
  const driftX = timeDrift * 0.10;
  const driftZ = timeDrift * 0.05;

  return [
    nx * radialScale + driftX,
    ny * radialScale,
    nz * radialScale + driftZ,
  ];
}

/**
 * Schneider Dynamic Threshold Remapping with Convective Domain Warping & Altitude Erosion.
 */
export function schneiderDensityRemap(
  baseNoise: number,
  macroCoverage: number,
  heightProfile: number,
  worleyDetail: number = 0.0,
  erosionStrength: number = 0.0,
  zNorm: number = 0.5
): number {
  const targetCoverage = macroCoverage * heightProfile;
  if (targetCoverage <= 0.001) {
    return 0.0;
  }

  const threshold = Math.max(0.0, Math.min(0.85, 1.0 - targetCoverage * 1.35));
  const baseHull = remap(baseNoise, threshold, 1.0, 0.0, 1.0);

  if (baseHull <= 0.0 || erosionStrength <= 0.0) {
    return baseHull;
  }

  const altitudeErosion = 0.08 + 0.77 * Math.pow(Math.max(0.0, Math.min(1.0, zNorm)), 0.75);
  const effectiveErosion = worleyDetail * altitudeErosion * erosionStrength * 0.35;

  return remap(baseHull, effectiveErosion, 1.0, 0.0, 1.0);
}

/**
 * Analytical intersection of a 3D ray with an axis-aligned bounding box / planar slab.
 * Uses Kay-Kajiya slab method with division-by-zero protection.
 */
export function intersectRaySlab(
  r0: Vec3,
  dir: Vec3,
  slabMin: Vec3,
  slabMax: Vec3
): RaySphereHit | null {
  const eps = 1e-6;
  const safeDir: Vec3 = [
    Math.abs(dir[0]) < eps ? (dir[0] >= 0 ? eps : -eps) : dir[0],
    Math.abs(dir[1]) < eps ? (dir[1] >= 0 ? eps : -eps) : dir[1],
    Math.abs(dir[2]) < eps ? (dir[2] >= 0 ? eps : -eps) : dir[2],
  ];

  const invDir: Vec3 = [1.0 / safeDir[0], 1.0 / safeDir[1], 1.0 / safeDir[2]];

  const t0: Vec3 = [
    (slabMin[0] - r0[0]) * invDir[0],
    (slabMin[1] - r0[1]) * invDir[1],
    (slabMin[2] - r0[2]) * invDir[2],
  ];
  const t1: Vec3 = [
    (slabMax[0] - r0[0]) * invDir[0],
    (slabMax[1] - r0[1]) * invDir[1],
    (slabMax[2] - r0[2]) * invDir[2],
  ];

  const tMinX = Math.min(t0[0], t1[0]);
  const tMaxX = Math.max(t0[0], t1[0]);
  const tMinY = Math.min(t0[1], t1[1]);
  const tMaxY = Math.max(t0[1], t1[1]);
  const tMinZ = Math.min(t0[2], t1[2]);
  const tMaxZ = Math.max(t0[2], t1[2]);

  const tNear = Math.max(Math.max(tMinX, tMinY), tMinZ);
  const tFar = Math.min(Math.min(tMaxX, tMaxY), tMaxZ);

  if (tNear > tFar || tFar < 0.0) {
    return null;
  }

  return {
    tNear,
    tFar,
  };
}

/**
 * Computes the raymarch interval through a planar tropospheric slab.
 * Safely handles camera positioned inside the slab (tNear <= 0.0).
 */
export function computePlanarTroposphericInterval(
  r0: Vec3,
  dir: Vec3,
  slabMin: Vec3,
  slabMax: Vec3
): TroposphericInterval | null {
  const hit = intersectRaySlab(r0, dir, slabMin, slabMax);
  if (!hit) return null;

  const tStart = Math.max(0.0, hit.tNear);
  const tEnd = hit.tFar;

  if (tStart >= tEnd) return null;
  return { tStart, tEnd };
}

/**
 * Maps world-space position in the planar slab to normalized coordinates:
 * u, v in [0, 1] across the map sheet, and hNorm in [0, 1] vertical tropospheric altitude.
 * Supports Mode 0 (Equirectangular 2:1) and Mode 1 (Mercator).
 */
export function mapPlanarCoordinates(
  pos: Vec3,
  radius: number = 5.0,
  deltaZ: number = 0.19,
  mode: number = 0
): { u: number; v: number; hNorm: number } {
  const [px, py, pz] = pos;
  const hNorm = Math.max(0.0, Math.min(1.0, pz / Math.max(1e-5, deltaZ)));

  const twoPiR = 2.0 * Math.PI * radius;
  const rawU = (px / twoPiR) + 0.5;
  const u = rawU - Math.floor(rawU); // fract in [0, 1)

  let v = 0.5;
  if (mode >= 1) {
    // Mode 1..3: Mercator projection (clamped to max latitude +/- 85 deg ≈ 3.12865 R)
    const clampedY = Math.max(-3.13, Math.min(3.13, py / radius));
    const phi = 2.0 * Math.atan(Math.exp(clampedY)) - Math.PI * 0.5;
    v = Math.max(0.001, Math.min(0.999, 0.5 - (phi / Math.PI)));
  } else {
    // Mode 0: Equirectangular 2:1
    const piR = Math.PI * radius;
    v = Math.max(0.001, Math.min(0.999, 0.5 - (py / piR)));
  }

  return { u, v, hNorm };
}

/**
 * Computes isotropic 3D procedural noise coordinate in the planar tropospheric slab.
 * Scales the latitudinal axis by 0.5 to maintain square cells for the 2:1 equirectangular aspect ratio.
 */
export function computePlanarNoiseCoord(
  u: number,
  v: number,
  hNorm: number,
  freqHoriz: number,
  freqVert: number,
  timeDrift: number
): Vec3 {
  const nx = u * freqHoriz;
  const ny = v * (freqHoriz * 0.5);
  const nz = hNorm * freqVert;

  const driftX = timeDrift * 0.10;
  const driftZ = timeDrift * 0.05;

  return [
    nx + driftX,
    ny,
    nz + driftZ,
  ];
}

// ============================================================================
// Macro Chart Manifold Kinematics & Closed-Form Inversion (Invariant §47)
// Pure developable cylinder unroll with parallel expansion and analytical normal.
// Zero tactile seam lips, zero dog-ears, zero margin waves, zero spine weight.
// Invertibility strictly guaranteed for spatial raycasting, queries, and volumes.
// ============================================================================

export interface MacroChartPoint {
  pos: Vec3;
  normal: Vec3;
}

export interface InvertedMacroCoord {
  lambda: number;
  phi: number;
  h: number;
}

/**
 * Solves the monotonic transcendental equation for latitude phi given Cartesian y:
 * y(phi) = (1 - t) * R * sin(phi) + t * R * phi
 * Uses blended inverse trigonometric initialization followed by Newton-Raphson iteration.
 */
function solveMacroPhi(y: number, tStraighten: number, radius: number): number {
  const yMax = radius * (1.0 - tStraighten + tStraighten * Math.PI * 0.5);
  if (y >= yMax) return Math.PI * 0.5;
  if (y <= -yMax) return -Math.PI * 0.5;
  if (tStraighten <= 1e-6) return Math.asin(Math.max(-1.0, Math.min(1.0, y / radius)));
  if (tStraighten >= 0.999999) return y / radius;

  const normY = y / yMax;
  let phi = (1.0 - tStraighten) * Math.asin(Math.max(-0.9999, Math.min(0.9999, normY))) +
            tStraighten * (normY * Math.PI * 0.5);

  for (let i = 0; i < 6; i++) {
    const f = (1.0 - tStraighten) * radius * Math.sin(phi) + tStraighten * radius * phi - y;
    const df = (1.0 - tStraighten) * radius * Math.cos(phi) + tStraighten * radius;
    if (Math.abs(df) < 1e-12) break;
    const delta = f / df;
    phi -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return Math.max(-Math.PI * 0.5, Math.min(Math.PI * 0.5, phi));
}

/**
 * Solves 3x3 linear system A * x = b where A is specified by its 3 column vectors.
 */
function solve3x3Columns(
  col0: Vec3,
  col1: Vec3,
  col2: Vec3,
  b: Vec3
): Vec3 | null {
  const det3 = (c0: Vec3, c1: Vec3, c2: Vec3): number =>
    c0[0] * (c1[1] * c2[2] - c1[2] * c2[1]) -
    c0[1] * (c1[0] * c2[2] - c1[2] * c2[0]) +
    c0[2] * (c1[0] * c2[1] - c1[1] * c2[0]);

  const d = det3(col0, col1, col2);
  if (Math.abs(d) < 1e-12) return null;
  const d0 = det3(b, col1, col2);
  const d1 = det3(col0, b, col2);
  const d2 = det3(col0, col1, b);
  return [d0 / d, d1 / d, d2 / d];
}

/**
 * Evaluates the pure developable macro chart F(lambda, phi, h; alpha) on CPU.
 * 
 * Kinematic characteristics:
 * - At alpha = 0: Pure sphere of given radius R with radial normal.
 * - At alpha = 1: Pure 2:1 equirectangular planar sheet with normal (0, 0, 1).
 * - For alpha in (0, 1): Developable cylinder unroll with parallel expansion.
 * - Height h is offset along the closed-form analytical normal n_F.
 */
export function evaluateMacroChartCPU(
  lambda: number,
  phi: number,
  h: number,
  alpha: number,
  radius: number = EARTH_RADIUS_UNITS
): MacroChartPoint {
  const alphaClamped = Math.max(0.0, Math.min(1.0, alpha));
  const alphaEased = alphaClamped * alphaClamped * (3.0 - 2.0 * alphaClamped);
  const tParallel = smoothstep(0.05, 0.85, alphaEased);
  const cosLat = Math.cos(phi);
  const sinLat = Math.sin(phi);
  const parallelWidth = cosLat * (1.0 - tParallel) + tParallel;
  const rPar = radius * parallelWidth;
  const s = Math.max(0.0, 1.0 - alphaEased);
  const uAngle = s * lambda;

  let curX: number;
  let curZ: number;
  if (Math.abs(uAngle) > 0.02) {
    const sDiv = Math.max(0.0001, s);
    curX = rPar * (Math.sin(uAngle) / sDiv);
    curZ = rPar * ((Math.cos(uAngle) - 1.0) / sDiv + s);
  } else {
    const u2 = uAngle * uAngle;
    curX = rPar * lambda * (1.0 - u2 / 6.0);
    curZ = rPar * s * (1.0 - lambda * lambda * 0.5 * (1.0 - u2 / 12.0));
  }

  const tStraighten = smoothstep(0.20, 0.95, alphaEased);
  const curY = (1.0 - tStraighten) * radius * sinLat + tStraighten * radius * phi;

  // Closed-form analytical normal N_base = T_lambda x T_phi
  const dyDPhi = radius * (cosLat * (1.0 - tStraighten) + tStraighten);
  const negDrDPhi = radius * sinLat * (1.0 - tParallel);
  let bracket: number;
  if (Math.abs(uAngle) > 0.02) {
    const sDiv = Math.max(0.0001, s);
    bracket = (1.0 - Math.cos(uAngle)) / sDiv + s * Math.cos(uAngle);
  } else {
    const u2 = uAngle * uAngle;
    bracket = s * (lambda * lambda * (0.5 - u2 / 24.0) + (1.0 - u2 * 0.5));
  }

  const rawNx = dyDPhi * Math.sin(uAngle);
  const rawNy = negDrDPhi * bracket;
  const rawNz = dyDPhi * Math.cos(uAngle);
  const rawLen = Math.hypot(rawNx, rawNy, rawNz);
  const normal: Vec3 = rawLen > 1e-6
    ? [rawNx / rawLen, rawNy / rawLen, rawNz / rawLen]
    : [0.0, 0.0, 1.0];

  const pos: Vec3 = [
    curX + normal[0] * h,
    curY + normal[1] * h,
    curZ + normal[2] * h,
  ];

  return { pos, normal };
}

/**
 * Inverts the macro chart F^-1(x, y, z; alpha) -> { lambda, phi, h } on CPU.
 * 
 * Regimes:
 * - Regime A (alpha <= 0.001): Pure spherical coordinate conversion.
 * - Regime B (s < 1e-6 or alpha >= 0.9999): Pure equirectangular planar projection.
 * - Regime C (intermediate): Hybrid analytical seeding + Newton-Raphson refinement.
 * 
 * Guarantees round-trip precision <= 1e-4 interior, <= 1e-3 polar, and zero NaNs/Infs.
 */
export function invertMacroChart(
  pos: Vec3,
  alpha: number,
  radius: number = EARTH_RADIUS_UNITS
): InvertedMacroCoord {
  const [tx, ty, tz] = pos;
  const alphaClamped = Math.max(0.0, Math.min(1.0, alpha));
  const alphaEased = alphaClamped * alphaClamped * (3.0 - 2.0 * alphaClamped);
  const s = Math.max(0.0, 1.0 - alphaEased);

  // Regime A: Pure Sphere
  if (alphaClamped <= 0.001) {
    const rho = Math.hypot(tx, ty, tz);
    const h = rho - radius;
    const phi = Math.asin(Math.max(-1.0, Math.min(1.0, ty / Math.max(1e-6, rho))));
    const lambda = Math.atan2(tx, tz);
    return { lambda, phi, h };
  }

  // Regime B: Pure Planar Sheet
  if (s < 1e-6 || alphaClamped >= 0.9999) {
    return {
      lambda: tx / radius,
      phi: ty / radius,
      h: tz,
    };
  }

  // Regime C: Intermediate Developable Cylinder Unroll
  const tStraighten = smoothstep(0.20, 0.95, alphaEased);
  const tParallel = smoothstep(0.05, 0.85, alphaEased);
  const sDiv = Math.max(0.0001, s);

  let lambda: number;
  let phi: number;
  let h: number;

  if (alphaClamped < 0.30) {
    // Near sphere: spherical seed provides rapid global convergence
    const rho = Math.hypot(tx, ty, tz);
    h = rho - radius;
    phi = Math.asin(Math.max(-0.9999, Math.min(0.9999, ty / Math.max(1e-6, rho))));
    lambda = Math.atan2(tx, tz);
  } else {
    // Intermediate/planar: developable cylinder unroll seed
    phi = solveMacroPhi(ty, tStraighten, radius);
    const cosLat = Math.cos(phi);
    const parallelWidth = cosLat * (1.0 - tParallel) + tParallel;
    const rPar = radius * parallelWidth;
    const Rc = rPar / sDiv;
    const Cz = rPar * (s - 1.0 / sDiv);
    const sZero = smoothstep(0.0, 0.10, alphaClamped);
    const sOne = 1.0 - smoothstep(0.90, 1.0, alphaClamped);
    const env = Math.sin(Math.PI * alphaClamped) * sZero * sOne;
    const dz_lift = (0.60 + 0.40 * cosLat) * radius * 0.06 * env;
    const dz = (tz - dz_lift) - Cz;
    lambda = Math.atan2(tx, dz) / s;
    h = Math.hypot(tx, dz) - Rc;
  }

  // Multi-dimensional Newton-Raphson refinement
  for (let iter = 0; iter < 6; iter++) {
    const current = evaluateMacroChartCPU(lambda, phi, h, alphaClamped, radius);
    const rx = tx - current.pos[0];
    const ry = ty - current.pos[1];
    const rz = tz - current.pos[2];
    if (Math.hypot(rx, ry, rz) < 1e-11) break;

    const eps = 1e-6;
    const pLamP = evaluateMacroChartCPU(lambda + eps, phi, h, alphaClamped, radius);
    const pLamM = evaluateMacroChartCPU(lambda - eps, phi, h, alphaClamped, radius);
    const jLam: Vec3 = [
      (pLamP.pos[0] - pLamM.pos[0]) / (2.0 * eps),
      (pLamP.pos[1] - pLamM.pos[1]) / (2.0 * eps),
      (pLamP.pos[2] - pLamM.pos[2]) / (2.0 * eps),
    ];

    const pPhiP = evaluateMacroChartCPU(lambda, phi + eps, h, alphaClamped, radius);
    const pPhiM = evaluateMacroChartCPU(lambda, phi - eps, h, alphaClamped, radius);
    const jPhi: Vec3 = [
      (pPhiP.pos[0] - pPhiM.pos[0]) / (2.0 * eps),
      (pPhiP.pos[1] - pPhiM.pos[1]) / (2.0 * eps),
      (pPhiP.pos[2] - pPhiM.pos[2]) / (2.0 * eps),
    ];

    const jH: Vec3 = current.normal;

    const delta = solve3x3Columns(jLam, jPhi, jH, [rx, ry, rz]);
    if (!delta) break;

    lambda = Math.max(-Math.PI, Math.min(Math.PI, lambda + delta[0]));
    phi = Math.max(-Math.PI * 0.49999, Math.min(Math.PI * 0.49999, phi + delta[1]));
    h += delta[2];
  }

  return { lambda, phi, h };
}


