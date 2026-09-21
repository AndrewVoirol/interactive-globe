/**
 * Indicatrix Engine: Cartographic Overlays & Geodesic Systems
 * 
 * Provides mathematically grounded cartographic features:
 * 1. Antipodal Bridges (through-the-Earth duality)
 * 2. Thermohaline Global Ocean Conveyor Belt
 * 3. Pelagic Biological Geodesic Migrations (Bar-tailed Godwit & Arctic Tern)
 * 4. Cartographic Reference Landmarks (Point Nemo, Challenger Deep, Greenwich, Everest)
 * 5. Tissot's Indicatrix Dynamic Deformation Rings
 */

import { Vector3 } from './math/cameraMath';

export const RADIUS = 5.0;
const PI = Math.PI;
const MAX_LAT = 85.0511287798066;

export interface GeoCoordinate {
  lat: number;
  lon: number;
  label?: string;
  category?: 'landmark' | 'antipode' | 'ocean' | 'migration';
  subtext?: string;
}

export interface GeodesicArcDefinition {
  id: string;
  name: string;
  category: 'antipodes' | 'conveyor' | 'migration';
  description: string;
  from: GeoCoordinate;
  to: GeoCoordinate;
  color: string;
  intermediatePoints?: GeoCoordinate[];
}

export const LANDMARK_ANCHORS: GeoCoordinate[] = [
  { lat: 51.4769, lon: 0.0, label: 'Greenwich 0°', subtext: 'Prime Meridian Origin', category: 'landmark' },
  { lat: -48.8767, lon: -123.3933, label: 'Point Nemo', subtext: 'Pole of Inaccessibility (2,688 km to land)', category: 'landmark' },
  { lat: 11.3733, lon: 142.5917, label: 'Challenger Deep', subtext: '-10,928 m Mariana Trench', category: 'landmark' },
  { lat: 27.9881, lon: 86.9250, label: 'Mt. Everest', subtext: '+8,849 m Terrestrial Apex', category: 'landmark' },
  { lat: 0.0, lon: 180.0, label: 'Antimeridian 180°', subtext: 'Planar Seam / International Date Line', category: 'landmark' },
];

export const GEODESIC_ARCS: GeodesicArcDefinition[] = [
  // 1. Antipodal Bridges (Through-the-Earth diametric pairs)
  {
    id: 'antipode-madrid-nz',
    name: 'Madrid ↔ Weber (New Zealand)',
    category: 'antipodes',
    description: 'Exact antipodal pairing: diametrically opposite through Earth\'s core.',
    from: { lat: 40.4168, lon: -3.7038, label: 'Madrid' },
    to: { lat: -40.4168, lon: 176.2962, label: 'Weber (NZ)' },
    color: '#F43F5E',
  },
  {
    id: 'antipode-hawaii-botswana',
    name: 'Honolulu ↔ Okavango (Botswana)',
    category: 'antipodes',
    description: 'Pacific ocean volcanic apex to African inland delta antipode.',
    from: { lat: 21.3069, lon: -157.8583, label: 'Honolulu' },
    to: { lat: -21.3069, lon: 22.1417, label: 'Okavango Delta' },
    color: '#EC4899',
  },
  {
    id: 'antipode-bogota-jakarta',
    name: 'Bogotá ↔ Jakarta',
    category: 'antipodes',
    description: 'Equatorial Andean plateau to Sunda Strait archipelago antipode.',
    from: { lat: 4.7110, lon: -74.0721, label: 'Bogotá' },
    to: { lat: -6.2088, lon: 106.8456, label: 'Jakarta' },
    color: '#FB7185',
  },

  // 2. Global Ocean Thermohaline Conveyor Belt
  {
    id: 'conveyor-north-atlantic',
    name: 'North Atlantic Deep Water Sinking',
    category: 'conveyor',
    description: 'Dense cold brine sinks near Greenland, driving the planetary heat engine.',
    from: { lat: 68.0, lon: -15.0, label: 'Greenland Sea' },
    to: { lat: 0.0, lon: -28.0, label: 'Equatorial Atlantic' },
    color: '#38BDF8',
  },
  {
    id: 'conveyor-south-atlantic-circumpolar',
    name: 'Antarctic Circumpolar Deep Loop',
    category: 'conveyor',
    description: 'Deep cold current rounds Antarctica into the Indian Ocean basin.',
    from: { lat: 0.0, lon: -28.0, label: 'Equatorial Atlantic' },
    to: { lat: -55.0, lon: 30.0, label: 'Southern Ocean Loop' },
    color: '#0284C7',
  },
  {
    id: 'conveyor-indian-pacific-upwelling',
    name: 'Pacific Upwelling Warm Return',
    category: 'conveyor',
    description: 'Deep abyssal water warms and upwells in the North Pacific, returning westward.',
    from: { lat: -55.0, lon: 150.0, label: 'South Pacific' },
    to: { lat: 45.0, lon: -160.0, label: 'North Pacific Upwelling' },
    color: '#818CF8',
  },

  // 3. Biological Non-Stop Geodesic Migrations
  {
    id: 'migration-godwit',
    name: 'Bar-tailed Godwit (Alaska → New Zealand)',
    category: 'migration',
    description: 'Longest non-stop flight: 11,000 km across open Pacific in 11 continuous days without feeding.',
    from: { lat: 61.5, lon: -165.5, label: 'Yukon-Kuskokwim (AK)' },
    to: { lat: -37.2, lon: 175.5, label: 'Firth of Thames (NZ)' },
    color: '#FBBF24',
  },
  {
    id: 'migration-arctic-tern',
    name: 'Arctic Tern Pole-to-Pole Voyage',
    category: 'migration',
    description: '70,000 km annual odyssey tracing the Atlantic pressure belts from Arctic ice to Antarctica.',
    from: { lat: 72.0, lon: -35.0, label: 'Arctic Tundra' },
    to: { lat: -70.0, lon: -20.0, label: 'Weddell Sea (Antarctica)' },
    color: '#34D399',
  },
];

/**
 * Converts Lon/Lat degrees to 3D Cartesian coordinates on sphere of given radius
 */
export function geoToSphere(lon: number, lat: number, r = RADIUS): [number, number, number] {
  const lambda = (lon * PI) / 180;
  const phi = (lat * PI) / 180;
  return [
    r * Math.cos(phi) * Math.sin(lambda),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(lambda),
  ];
}

/**
 * Converts Lon/Lat degrees to 2D Web Mercator coordinates
 */
export function geoToMercator(lon: number, lat: number, r = RADIUS): [number, number] {
  const lambda = (lon * PI) / 180;
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const phi = (clampedLat * PI) / 180;
  const x = lambda * r;
  const y = r * Math.log(Math.tan(PI / 4 + phi / 2));
  return [x, y];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function computeCurlNoiseTS(p: [number, number, number], time: number): [number, number, number] {
  const t = time * 0.75;
  const q1x = (0.80 * p[1] + 0.60 * p[2]) * 0.45;
  const q1y = (-0.80 * p[0] + 0.36 * p[1] - 0.48 * p[2]) * 0.45;
  const q1z = (-0.60 * p[0] - 0.48 * p[1] + 0.64 * p[2]) * 0.45;

  const q2x = (0.80 * q1y + 0.60 * q1z) * 0.95;
  const q2y = (-0.80 * q1x + 0.36 * q1y - 0.48 * q1z) * 0.95;
  const q2z = (-0.60 * q1x - 0.48 * q1y + 0.64 * q1z) * 0.95;

  const ux = -0.55 * Math.cos(0.55 * q1y + t * 0.7) - 0.45 * Math.cos(0.95 * q1z - t * 0.5);
  const uy = -0.55 * Math.cos(0.55 * q1z + t * 0.9) - 0.45 * Math.cos(0.95 * q1x - t * 0.6);
  const uz = -0.55 * Math.cos(0.55 * q1x + t * 0.8) - 0.45 * Math.cos(0.95 * q1y - t * 0.4);

  const u2x = 0.25 * Math.sin(1.5 * q2y - t * 1.2);
  const u2y = 0.25 * Math.sin(1.5 * q2z - t * 1.1);
  const u2z = 0.25 * Math.sin(1.5 * q2x - t * 1.3);

  const vx = ux + u2x;
  const vy = uy + u2y;
  const vz = uz + u2z;

  return [
    0.00 * vx + 0.80 * vy + 0.60 * vz,
    -0.80 * vx + 0.36 * vy - 0.48 * vz,
    -0.60 * vx - 0.48 * vy + 0.64 * vz,
  ];
}

/**
 * Evaluates the exact dynamic position of a geographic point (lon, lat) at morph progress alpha
 * across any of the 4 simulation paradigms (0=Linear, 1=Scroll, 2=Griffith, 3=Fluid)
 */
export function evaluatePointMorph(
  lon: number,
  lat: number,
  alpha: number,
  mode: number,
  time = 0,
  elevationOffset = 0.05,
  cursorHitPos?: [number, number, number],
  cursorVel?: [number, number, number, number],
  cursorActive = 0
): [number, number, number] {
  const p3D = geoToSphere(lon, lat, RADIUS + elevationOffset);
  const p2D = geoToMercator(lon, lat, RADIUS);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const ease = clampedAlpha;

  if (mode === 1) {
    // Mode 1: Parchment Scroll Unfurl with Tight Roll Dynamics (§3)
    const lambda = (lon * PI) / 180;
    const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * PI) / 180;
    const cosLat = Math.cos(phi);

    const smoothstep = (e0: number, e1: number, x: number): number => {
      const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
      return t * t * (3.0 - 2.0 * t);
    };

    // Phase 1: Rapid cylinder formation (alpha in [0.0, 0.20])
    const tCyl = smoothstep(0.0, 0.20, ease);
    const rCyl = (1.0 - tCyl) * (RADIUS * cosLat) + tCyl * RADIUS;

    // Phase 2: Parchment tight roll-up compression (tightens cylinder radius before unrolling)
    const tRoll = Math.sin(PI * smoothstep(0.15, 0.40, ease));
    const rScroll = rCyl * (1.0 - 0.20 * tRoll);

    // Phase 3: Unrolling curvature relaxation onto drafting table (alpha in [0.20, 1.00])
    const tUnroll = smoothstep(0.20, 1.0, ease);
    const s = 1.0 - tUnroll;
    const uAngle = s * lambda;

    let curX: number;
    let curZ: number;

    if (Math.abs(uAngle) > 0.02) {
      const sDiv = Math.max(0.0001, s);
      curX = rScroll * (Math.sin(uAngle) / sDiv);
      curZ = rScroll * ((Math.cos(uAngle) - 1.0) / sDiv + s);
    } else {
      const u2 = uAngle * uAngle;
      curX = rScroll * lambda * (1.0 - u2 / 6.0);
      curZ = -s * rScroll * (lambda * lambda) * (0.5 - u2 / 24.0) + rScroll * s;
    }

    // Polar Puckering Elimination: Y stays cylindrical during formation, then unrolls to Mercator
    const curY = p3D[1] * (1.0 - tUnroll) + p2D[1] * tUnroll;
    return [curX, curY, curZ];
  } else if (mode === 2) {
    // Mode 2: Tectonic Crust Fracture (Mid-Atlantic Ridge Calving, §4)
    const lambda = (lon * PI) / 180;
    const lambdaRift = -0.48869219;
    const dRift = Math.abs(lambda - lambdaRift);
    const smoothstep = (e0: number, e1: number, x: number): number => {
      const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
      return t * t * (3.0 - 2.0 * t);
    };
    const fSeam = 1.0 - smoothstep(0.0, 0.70, dRift);
    const crackSign = lambda >= lambdaRift ? 1.0 : -1.0;

    const pLen = Math.hypot(p3D[0], p3D[1], p3D[2]) || 1.0;
    const sphereNorm: [number, number, number] = [p3D[0] / pLen, p3D[1] / pLen, p3D[2] / pLen];

    const tEast: [number, number, number] = [sphereNorm[2], 0.0, -sphereNorm[0]];
    const tEastLen = Math.hypot(tEast[0], tEast[1], tEast[2]) || 1.0;
    tEast[0] /= tEastLen;
    tEast[2] /= tEastLen;

    if (ease <= 0.15) {
      const deltaR = 0.06 * RADIUS * (ease / 0.15);
      const crackProg = smoothstep(0.01, 0.15, ease);
      const crackDilation = crackSign * fSeam * (0.08 * crackProg);

      return [
        p3D[0] + sphereNorm[0] * deltaR + tEast[0] * crackDilation,
        p3D[1] + sphereNorm[1] * deltaR,
        p3D[2] + sphereNorm[2] * deltaR + tEast[2] * crackDilation,
      ];
    } else {
      const tPeel = smoothstep(0.15, 1.0, ease);
      const baseSphereDilated: [number, number, number] = [
        p3D[0] + sphereNorm[0] * (0.06 * RADIUS),
        p3D[1] + sphereNorm[1] * (0.06 * RADIUS),
        p3D[2] + sphereNorm[2] * (0.06 * RADIUS),
      ];
      const baseX = baseSphereDilated[0] * (1.0 - tPeel) + p2D[0] * tPeel;
      const baseY = baseSphereDilated[1] * (1.0 - tPeel) + p2D[1] * tPeel;
      const baseZ = baseSphereDilated[2] * (1.0 - tPeel) + 0.0;

      const flutterWave = Math.sin(18.0 * dRift - 20.0 * ease);
      const flutterDecay = Math.exp(-3.5 * ease);
      const wFlutter = flutterWave * flutterDecay * fSeam * (tPeel * (1.0 - tPeel));

      const crackWidth = crackSign * fSeam * (0.08 + 0.40 * tPeel);

      const rawNx = sphereNorm[0] * (1.0 - tPeel);
      const rawNy = sphereNorm[1] * (1.0 - tPeel);
      const rawNz = sphereNorm[2] * (1.0 - tPeel) + 1.0 * tPeel;
      const nLen = Math.hypot(rawNx, rawNy, rawNz) || 1.0;
      const baseNorm: [number, number, number] = [rawNx / nLen, rawNy / nLen, rawNz / nLen];

      return [
        baseX + baseNorm[0] * wFlutter + tEast[0] * (crackWidth * (1.0 - tPeel)),
        baseY + baseNorm[1] * wFlutter,
        baseZ + baseNorm[2] * wFlutter + tEast[2] * (crackWidth * (1.0 - tPeel)),
      ];
    }
  } else if (mode === 3) {
    // Mode 3: Hydrodynamic Fluid Relaxation & Viscous Streamline Shear (§5)
    const p3DLen = Math.hypot(p3D[0], p3D[1], p3D[2]) || 1.0;
    const sphereNorm: [number, number, number] = [p3D[0] / p3DLen, p3D[1] / p3DLen, p3D[2] / p3DLen];
    const rawSin = Math.sin(PI * clampedAlpha);
    const liquefaction = rawSin * (1.0 - 0.35 * ease);
    const volumePreserve = RADIUS * 0.50 * rawSin;

    const basePos: [number, number, number] = [
      p3D[0] * (1.0 - ease) + p2D[0] * ease + sphereNorm[0] * volumePreserve,
      p3D[1] * (1.0 - ease) + p2D[1] * ease + sphereNorm[1] * volumePreserve,
      p3D[2] * (1.0 - ease) + 0.0 + sphereNorm[2] * volumePreserve,
    ];

    // 3-Octave dispersion-coupled gravity-capillary surface waves (multi-axis 3D traveling wave harmonics with faster undulation)
    const phi1 = (basePos[0] * 0.35 + basePos[1] * 0.62 + basePos[2] * 0.42) * 1.35 - time * 2.8;
    const phi2 = (basePos[0] * -0.45 + basePos[1] * 0.30 + basePos[2] * 0.65) * 1.75 - time * 2.2;
    const phi3 = (basePos[0] * 0.55 + basePos[1] * -0.40 + basePos[2] * 0.35) * 2.10 - time * 3.4;
    const smoothstep = (e0: number, e1: number, x: number): number => {
      const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
      return t * t * (3.0 - 2.0 * t);
    };
    const capillaryDecay = 1.0 - smoothstep(0.85, 1.0, ease);
    const zCapillary = (0.45 * Math.sin(phi1) + 0.30 * Math.cos(phi2) + 0.20 * Math.sin(phi3)) * liquefaction * capillaryDecay;

    const baseLen = Math.hypot(basePos[0], basePos[1], basePos[2]) || 1.0;
    const surfaceNormal: [number, number, number] = [basePos[0] / baseLen, basePos[1] / baseLen, basePos[2] / baseLen];

    return [
      basePos[0] + surfaceNormal[0] * zCapillary,
      basePos[1] + surfaceNormal[1] * zCapillary,
      basePos[2] + surfaceNormal[2] * zCapillary,
    ];
  } else {
    // Mode 0: Polar-Convergent Geodesic Unfolding with Tactile Peeling Lip (§2)
    const lambda = (lon * PI) / 180;
    const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * PI) / 180;
    const cosLat = Math.cos(phi);

    const smoothstep = (e0: number, e1: number, x: number): number => {
      const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
      return t * t * (3.0 - 2.0 * t);
    };

    // Staged meridional unbending:
    // Prevents premature polar height explosion and vertical cat ears/spikes
    const tUnbend = smoothstep(0.15, 0.85, ease);
    const yPhysical = p3D[1] * (1.0 - tUnbend) + (RADIUS * phi) * tUnbend;
    const tMercator = smoothstep(0.60, 1.0, ease);
    const curY = yPhysical * (1.0 - tMercator) + p2D[1] * tMercator;

    // Decoupled intermediate parallel expansion (eliminates intermediate diamond/rhombus silhouette):
    const tParallel = smoothstep(0.18, 0.82, ease);
    const parallelWidth = cosLat * (1.0 - tParallel) + 1.0 * tParallel;
    const curX = p3D[0] * (1.0 - ease) + (p2D[0] * parallelWidth) * ease;

    // Planar depth convergence with latitude-tapered chord lift:
    const chordLiftZ = cosLat * RADIUS * (1.0 - ease) * Math.sin(PI * ease) * 0.28;
    const curZ = p3D[2] * (1.0 - ease) + chordLiftZ;

    // ── Tactile Boundary Peel Envelope (Happy Middle Space) ──
    // 1. Time envelope: smooth C1 onset (smoothstep 0.0 to 0.45) and relaxation back to planar map
    const uAlpha = clampedAlpha;
    const alphaPeel = smoothstep(0.0, 0.45, uAlpha);
    const ePeel = Math.sin(PI * alphaPeel) * (1.0 - uAlpha);

    // 2. Progressive peeling front (Option B: Deep Unrolling Wave):
    // Rolls inward across the outer 75% of longitude (|lon| >= 45° at peak alpha),
    // giving deep unrolling propagation across all continents while keeping the 45° prime meridian strip stable.
    const lonNorm = Math.abs(lambda) / PI;
    const peelFront = 0.90 - smoothstep(0.0, 0.55, uAlpha) * 0.65;
    const fPeel = smoothstep(peelFront, 1.0, lonNorm);

    // 3. Strict polar attenuation (proportional to cosLat):
    // Ensures peeling displacement vanishes at the polar singularities (cosLat -> 0).
    // Completely eliminates layer buckling, folding over into itself, and inverted polar points!
    const polarScale = cosLat;

    // 4. Outward radial normal in horizontal plane (points strictly AWAY from globe core):
    const horizLen = Math.hypot(p3D[0], p3D[2]);
    const horizNorm: [number, number, number] = horizLen > 0.001
      ? [p3D[0] / horizLen, 0.0, p3D[2] / horizLen]
      : [0.0, 0.0, -1.0];

    // 5. Intrinsic parallel tangent vector (curves along the circle of latitude):
    const horizTan: [number, number, number] = horizLen > 0.001
      ? [horizNorm[2], 0.0, -horizNorm[0]]
      : [1.0, 0.0, 0.0];
    const rollSign = lambda >= 0.0 ? -1.0 : 1.0;
    const rollTan: [number, number, number] = [
      horizTan[0] * rollSign,
      0.0,
      horizTan[2] * rollSign,
    ];

    // 6. Tangential Involute Barrel Roll (Chopes Slab Lip Curvature):
    const thetaRoll = fPeel * 1.0;
    const liftBarrel = RADIUS * 0.35 * ePeel * (1.0 - Math.cos(thetaRoll)) * polarScale;
    const flareBarrel = RADIUS * 0.22 * ePeel * Math.sin(thetaRoll) * polarScale;

    return [
      curX + horizNorm[0] * liftBarrel + rollTan[0] * flareBarrel,
      curY,
      curZ + horizNorm[2] * liftBarrel + rollTan[2] * flareBarrel,
    ];
  }
}

/**
 * Samples a Great Circle arc between two geographic coordinates using spherical slerp
 * @param from Starting coordinate
 * @param to Ending coordinate
 * @param steps Number of interpolation samples along the geodesic
 */
export function sampleGreatCircleGeodesic(
  from: GeoCoordinate,
  to: GeoCoordinate,
  steps = 64
): Array<{ lon: number; lat: number }> {
  const v1 = new Vector3(...geoToSphere(from.lon, from.lat, 1.0));
  const v2 = new Vector3(...geoToSphere(to.lon, to.lat, 1.0));

  const dot = Math.max(-1.0, Math.min(1.0, v1.dot(v2)));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  const points: Array<{ lon: number; lat: number }> = [];

  // Antipodal points: precalculate orthogonal tangent normal once to sweep a 180° great circle semicircle
  // Gram-Schmidt projection against polar axis (or equatorial axis if near poles)
  let antipodalOrtho: Vector3 | null = null;
  if (dot < -0.999999) {
    const ref = Math.abs(v1.y) < 0.99 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    antipodalOrtho = new Vector3().copy(ref).addScaledVector(v1, -v1.dot(ref)).normalize();
  }

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    let pt: Vector3;
    if (antipodalOrtho) {
      const angle = Math.PI * u;
      pt = new Vector3()
        .addScaledVector(v1, Math.cos(angle))
        .addScaledVector(antipodalOrtho, Math.sin(angle))
        .normalize();
    } else if (sinOmega < 1e-6) {
      // Identical/coincident points
      pt = v1.clone();
    } else {
      const c1 = Math.sin((1 - u) * omega) / sinOmega;
      const c2 = Math.sin(u * omega) / sinOmega;
      pt = new Vector3()
        .addScaledVector(v1, c1)
        .addScaledVector(v2, c2)
        .normalize();
    }

    // Recover lon/lat from unit 3D sphere
    const lat = Math.asin(Math.max(-1, Math.min(1, pt.y))) * (180 / PI);
    const lon = Math.atan2(pt.x, pt.z) * (180 / PI);
    points.push({ lon, lat });
  }

  return points;
}

/**
 * Tissot Indicatrix Item definition
 */
export interface TissotIndicatrixItem {
  center: GeoCoordinate;
  perimeter: GeoCoordinate[];
  axisMajor: [GeoCoordinate, GeoCoordinate]; // Principal major axis (North-South)
  axisMinor: [GeoCoordinate, GeoCoordinate]; // Principal minor axis (East-West)
  baseAreaRatio: number; // Theoretical distortion in Mercator = sec^2(lat)
}

/**
 * Tissot Indicatrix Circle Grid Generator
 * Generates an array of small circles with principal conjugate axes at regular latitude/longitude intervals
 */
export function generateTissotCircles(
  latInterval = 30,
  lonInterval = 45,
  angularRadiusDeg = 4.8,
  circlePoints = 36
): TissotIndicatrixItem[] {
  const circles: TissotIndicatrixItem[] = [];

  for (let lat = -60; lat <= 60; lat += latInterval) {
    const latRad = (lat * PI) / 180;
    // In Mercator, area scale factor s = sec^2(lat)
    const cosLat = Math.max(0.01, Math.cos(latRad));
    const baseAreaRatio = 1.0 / (cosLat * cosLat);

    for (let lon = -180; lon < 180; lon += lonInterval) {
      const center: GeoCoordinate = { lat, lon, label: `Indicatrix ${lat}°` };
      const perimeter: GeoCoordinate[] = [];

      const rRad = (angularRadiusDeg * PI) / 180;
      const lonRad = (lon * PI) / 180;

      for (let i = 0; i <= circlePoints; i++) {
        const theta = (i / circlePoints) * 2 * PI;
        const pLat = Math.asin(
          Math.sin(latRad) * Math.cos(rRad) + Math.cos(latRad) * Math.sin(rRad) * Math.cos(theta)
        );
        const pLon =
          lonRad +
          Math.atan2(
            Math.sin(theta) * Math.sin(rRad) * Math.cos(latRad),
            Math.cos(rRad) - Math.sin(latRad) * Math.sin(pLat)
          );

        perimeter.push({
          lat: (pLat * 180) / PI,
          lon: ((pLon * 180) / PI + 540) % 360 - 180,
        });
      }

      // Principal major axis: North-South meridian crosshair
      const axisMajor: [GeoCoordinate, GeoCoordinate] = [
        { lat: Math.max(-89.9, lat - angularRadiusDeg), lon, label: 'S' },
        { lat: Math.min(89.9, lat + angularRadiusDeg), lon, label: 'N' },
      ];

      // Principal minor axis: East-West parallel crosshair
      const axisMinor: [GeoCoordinate, GeoCoordinate] = [
        { lat, lon: ((lon - angularRadiusDeg / cosLat) + 540) % 360 - 180, label: 'W' },
        { lat, lon: ((lon + angularRadiusDeg / cosLat) + 540) % 360 - 180, label: 'E' },
      ];

      circles.push({ center, perimeter, axisMajor, axisMinor, baseAreaRatio });
    }
  }

  return circles;
}

