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

