// ============================================================================
// File: src/core/physics/OrigamiCraneFlightSolver.ts
// Architecture: Autonomous Lagrangian Flight Physics & Orographic Soaring
// Description: Simulates low-Reynolds origami paper crane aerodynamics, wing flex,
//              ridge-lift seeking over 3D DEM relief, thermal circling, and manifold morphing.
// ============================================================================

import { VectorFieldDataSource } from '../data/VectorFieldDataSource';
import { SimulationMode } from '../../types';

export interface CraneState {
  lon: number;            // Geographic longitude in degrees (-180 to 180)
  lat: number;            // Geographic latitude in degrees (-90 to 90)
  altitude: number;       // Altitude offset above base sphere radius (meters MSL)
  terrainElevation: number; // Local terrain elevation in meters MSL
  clearance: number;      // Terrain ground clearance in meters AGL (strictly >= 80m)
  heading: number;        // Heading in radians (0 = North, PI/2 = East)
  pitch: number;          // Pitch in radians (positive = nose up)
  roll: number;           // Roll / bank angle in radians (positive = right wing down)
  airspeed: number;       // Airspeed in m/s (typically 12 - 24 m/s)
  groundSpeed: number;    // Ground speed in m/s (airspeed + wind)
  glideRatio: number;     // Effective instantaneous glide ratio (L/D)
  wingFlex: number;       // Dynamic wing deflection in radians (-0.15 to +0.25)
  variometer: number;     // Vertical climb/sink rate in m/s
  flightDuration: number; // Elapsed flight time in seconds
  distanceTraveled: number; // Cumulative distance in km
  isAirborne: boolean;    // Active flight status
  currentStratum: 'surface' | 'jetstream';
}

export interface CraneStepParams {
  dt: number;
  unfurl: number;
  mode: SimulationMode;
  elevationSampler?: (lon: number, lat: number) => { elevationMeters: number; gradEast: number; gradNorth: number };
}

export class OrigamiCraneFlightSolver {
  private state: CraneState;
  private wingFlexVel: number = 0;
  private baseRadius: number = 5.0; // Standard Indicatrix sphere radius

  // Aerodynamic constants for folded paper origami craft
  private readonly mass = 0.045; // kg
  private readonly wingArea = 0.085; // m^2
  private readonly airDensity = 1.225; // kg/m^3 at sea level
  private readonly glideRatio = 9.5; // Lift-to-drag ratio L/D
  private readonly minAirspeed = 8.0; // Stall speed in m/s
  private readonly cruiseAirspeed = 15.0; // Trim airspeed in m/s
  private readonly maxAirspeed = 38.0; // High-speed dive limit

  constructor(initialLon: number = -68.5, initialLat: number = -32.5, initialAltMeters: number = 2500) {
    // Default initial location: Andes Cordillera near Aconcagua / Bariloche (famed mountain wave soaring)
    this.state = {
      lon: initialLon,
      lat: initialLat,
      altitude: initialAltMeters,
      terrainElevation: 0.0,
      clearance: initialAltMeters,
      glideRatio: this.glideRatio,
      heading: Math.PI * 0.45, // Eastward heading
      pitch: 0.02,
      roll: 0.0,
      airspeed: this.cruiseAirspeed,
      groundSpeed: this.cruiseAirspeed,
      wingFlex: 0.0,
      variometer: 0.0,
      flightDuration: 0.0,
      distanceTraveled: 0.0,
      isAirborne: true,
      currentStratum: 'surface',
    };
  }

  public getState(): CraneState {
    return { ...this.state };
  }

  public reset(lon: number, lat: number, altitudeMeters: number = 2000): void {
    this.state.lon = lon;
    this.state.lat = lat;
    this.state.altitude = Math.max(500, altitudeMeters);
    this.state.terrainElevation = 0.0;
    this.state.clearance = this.state.altitude;
    this.state.glideRatio = this.glideRatio;
    this.state.heading = Math.random() * Math.PI * 2.0;
    this.state.pitch = 0.01;
    this.state.roll = 0.0;
    this.state.airspeed = this.cruiseAirspeed;
    this.state.groundSpeed = this.cruiseAirspeed;
    this.state.wingFlex = 0.0;
    this.state.variometer = 0.0;
    this.state.flightDuration = 0.0;
    this.state.distanceTraveled = 0.0;
    this.state.isAirborne = true;
    this.state.currentStratum = this.state.altitude > 8000 ? 'jetstream' : 'surface';
    this.wingFlexVel = 0;
  }

  /**
   * Advances the origami crane aerodynamic simulation by dt seconds.
   */
  public step(params: CraneStepParams, windSource?: VectorFieldDataSource): void {
    if (!this.state.isAirborne) return;

    const dt = Math.min(params.dt, 0.1); // Clamp maximum sub-step
    const { lon, lat, altitude, heading, airspeed } = this.state;

    // 1. Determine active stratum based on altitude (transition to Jet Stream above 7,000m)
    const stratum = altitude > 7000 ? 'jetstream' : 'surface';
    this.state.currentStratum = stratum;

    // 2. Sample atmospheric horizontal wind vector [u, v] (East, North)
    const [uWind, vWind] = windSource ? windSource.sampleVelocity(lon, lat, stratum) : [0, 0];

    // 3. Evaluate terrain elevation and orographic slope updrafts
    const { elevationMeters, gradEast, gradNorth } = params.elevationSampler
      ? params.elevationSampler(lon, lat)
      : { elevationMeters: 0, gradEast: 0, gradNorth: 0 };
    const terrainElev = elevationMeters;

    // Kinematic surface orographic updraft: w_sfc = u*gradEast + v*gradNorth
    const orographicUpdraftSfc = uWind * gradEast + vWind * gradNorth;

    // Vertical scale-height decay: eta(z, h) = exp(-max(0, z - h) / 2500)
    const heightAboveTerrain = Math.max(0, altitude - terrainElev);
    const scaleHeightDecay = Math.exp(-heightAboveTerrain / 2500.0);
    const localOrographicUpdraft = orographicUpdraftSfc * scaleHeightDecay;

    // Thermal updraft procedural model (convective bubbling in equatorial/mid-latitude afternoon)
    const thermalCycle = Math.sin(lon * 0.05 + lat * 0.08 + this.state.flightDuration * 0.2);
    const thermalUpdraft = thermalCycle > 0.6 ? (thermalCycle - 0.6) * 4.0 : 0.0;

    // Net atmospheric vertical air motion w(z)
    const verticalAirMotion = localOrographicUpdraft + thermalUpdraft;

    // 4. Glider aerodynamics:
    // Natural sink rate in still air: V_sink = Airspeed / GlideRatio (L/D)
    const stillAirSink = airspeed / this.glideRatio;
    let netClimbRate = verticalAirMotion - stillAirSink;
    this.state.variometer = netClimbRate;

    // 5. Autopilot steering decisions:
    // - Ridge soaring ("Ride the Ridge"): align heading along ridge crest (perpendicular to slope gradient)
    // - Thermal soaring: circle in rising convective column
    // - Cruising: drift downwind along streamlines with soft wandering
    let targetRoll = 0.0;
    let targetHeading = heading;

    if (localOrographicUpdraft > 1.0) {
      // Ride the ridge: align heading perpendicular to slope gradient
      const ridgeAngle = Math.atan2(-gradEast, gradNorth);
      targetHeading = ridgeAngle;
      targetRoll = 0.05 * Math.sin(this.state.flightDuration * 0.5);
    } else if (netClimbRate > 1.2) {
      // Circle gently in thermal / wave core
      targetRoll = 0.35; // ~20 degrees bank
      targetHeading += 0.4 * dt;
    } else {
      // Cruise downwind / along streamlines with slight wandering
      const windAngle = Math.atan2(uWind, vWind);
      const angleDiff = Math.atan2(Math.sin(windAngle - heading), Math.cos(windAngle - heading));
      targetHeading += angleDiff * 0.25 * dt;
      targetRoll = Math.max(-0.25, Math.min(0.25, angleDiff * 0.5));
    }

    // Smooth heading and roll transitions
    this.state.heading = targetHeading;
    this.state.roll += (targetRoll - this.state.roll) * (2.0 * dt);

    // 6. Airspeed and Pitch governing:
    // Dive slightly for airspeed if too slow; pull up in updrafts
    const targetAirspeed = netClimbRate > 1.0 ? this.minAirspeed + 2.0 : this.cruiseAirspeed;
    this.state.airspeed += (targetAirspeed - airspeed) * (1.5 * dt);
    this.state.airspeed = Math.max(this.minAirspeed, Math.min(this.maxAirspeed, this.state.airspeed));

    this.state.pitch = Math.atan2(netClimbRate, this.state.airspeed);

    // 7. Dynamic wing flex physics (damped harmonic oscillator responding to vertical load)
    const loadFactor = (netClimbRate + 9.81) / 9.81; // G-load
    const targetWingFlex = Math.max(-0.15, Math.min(0.25, (loadFactor - 1.0) * 0.12));
    const kSpring = 45.0;
    const cDamping = 6.0;
    const flexAccel = kSpring * (targetWingFlex - this.state.wingFlex) - cDamping * this.wingFlexVel;
    this.wingFlexVel += flexAccel * dt;
    this.state.wingFlex += this.wingFlexVel * dt;

    // 8. Integrate geographic position & ground velocity:
    const airNorth = this.state.airspeed * Math.cos(this.state.heading);
    const airEast = this.state.airspeed * Math.sin(this.state.heading);

    const groundNorth = airNorth + vWind;
    const groundEast = airEast + uWind;
    this.state.groundSpeed = Math.hypot(groundNorth, groundEast);

    const earthRadius = 6371000.0;
    const cosLat = Math.cos((lat * Math.PI) / 180.0);
    const safeCosLat = Math.max(0.01, Math.abs(cosLat));

    // Lookahead anticipation to avoid mountain summits before impact
    const lookaheadSec = 2.0;
    const lookaheadLat = Math.max(-88.0, Math.min(88.0, lat + (groundNorth * lookaheadSec / earthRadius) * (180.0 / Math.PI)));
    const lookaheadLon = ((lon + (groundEast * lookaheadSec / (earthRadius * safeCosLat)) * (180.0 / Math.PI) + 180.0) % 360.0) - 180.0;
    const minClearance = 80.0; // meters above ground

    if (params.elevationSampler) {
      const ahead = params.elevationSampler(lookaheadLon, lookaheadLat);
      const targetAltAhead = ahead.elevationMeters + minClearance;
      if (this.state.altitude < targetAltAhead) {
        const anticipatoryClimb = Math.min(8.0, (targetAltAhead - this.state.altitude) / lookaheadSec);
        netClimbRate = Math.max(netClimbRate, anticipatoryClimb);
      }
    }

    const dLat = (groundNorth * dt / earthRadius) * (180.0 / Math.PI);
    const dLon = (groundEast * dt / (earthRadius * safeCosLat)) * (180.0 / Math.PI);

    this.state.lat = Math.max(-88.0, Math.min(88.0, lat + dLat));
    this.state.lon = ((lon + dLon + 180.0) % 360.0) - 180.0;

    // Altitude integration
    this.state.altitude += netClimbRate * dt;

    // Hard ground clearance enforcement (>= 80.0m) preventing mountain clipping
    if (this.state.altitude < terrainElev + minClearance) {
      this.state.altitude = terrainElev + minClearance;
      if (netClimbRate < 0) netClimbRate = 0;
    }

    // Telemetry updates
    this.state.variometer = netClimbRate;
    this.state.clearance = Math.max(0, this.state.altitude - terrainElev);
    this.state.terrainElevation = terrainElev;
    this.state.glideRatio =
      this.state.variometer > 0
        ? 99.0
        : Math.min(99.0, Number((this.state.groundSpeed / Math.max(0.1, -this.state.variometer)).toFixed(1)));

    this.state.flightDuration += dt;
    this.state.distanceTraveled += (this.state.groundSpeed * dt) / 1000.0;
  }

  /**
   * Computes the 3D cartographic world position and orientation vectors on the manifold,
   * factoring in the active simulation mode (Sphere, Scroll, Fracture, Fluid, Dymaxion).
   */
  public computeCartographicState(unfurl: number, mode: SimulationMode): {
    worldPos: [number, number, number];
    forwardVec: [number, number, number];
    upVec: [number, number, number];
    rightVec: [number, number, number];
  } {
    const { lon, lat, altitude, heading } = this.state;

    // Spherical position on unit manifold
    const lonRad = (lon * Math.PI) / 180.0;
    const latRad = (lat * Math.PI) / 180.0;

    // Convert cartographic altitude (meters) to scene radius offset
    // Standoff +0.06 units guarantees altitude above high-relief 3D mountain peaks
    const altScale = 0.00003;
    const currentRadius = this.baseRadius + 0.06 + altitude * altScale;

    const sphereX = currentRadius * Math.cos(latRad) * Math.sin(lonRad);
    const sphereY = currentRadius * Math.sin(latRad);
    const sphereZ = currentRadius * Math.cos(latRad) * Math.cos(lonRad);

    // Planar flat position (Plate Carrée / Equirectangular projection)
    const flatX = (lonRad / Math.PI) * (this.baseRadius * Math.PI * 0.5);
    const flatY = (latRad / (Math.PI * 0.5)) * (this.baseRadius * 0.5);
    const flatZ = 0.06 + altitude * altScale;

    // Morph interpolation matching Indicatrix ease
    const clampedUnfurl = Math.max(0.0, Math.min(1.0, unfurl));
    const ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    let posX = sphereX;
    let posY = sphereY;
    let posZ = sphereZ;

    if (mode === 1) {
      // Cylindrical scroll
      const oneMinusT = 1.0 - ease;
      if (oneMinusT > 0.001) {
        const curAngle = oneMinusT * lonRad;
        posX = (currentRadius / oneMinusT) * Math.sin(curAngle);
        posZ = (currentRadius * Math.cos(latRad) / oneMinusT) * (Math.cos(curAngle) - 1.0) + (currentRadius * Math.cos(latRad) * oneMinusT);
        posY = (1.0 - ease) * sphereY + ease * flatY;
      } else {
        posX = flatX;
        posY = flatY;
        posZ = flatZ;
      }
    } else if (mode === 4) {
      // Fuller Dymaxion arch interpolation
      const arch = Math.sin(Math.PI * ease) * 0.45;
      const len = Math.hypot(sphereX, sphereY, sphereZ) || 1.0;
      const normX = sphereX / len;
      const normY = sphereY / len;
      const normZ = sphereZ / len;
      posX = (1.0 - ease) * sphereX + ease * flatX + normX * arch;
      posY = (1.0 - ease) * sphereY + ease * flatY + normY * arch;
      posZ = (1.0 - ease) * sphereZ + ease * flatZ + normZ * arch;
    } else {
      // Linear / default blend
      posX = (1.0 - ease) * sphereX + ease * flatX;
      posY = (1.0 - ease) * sphereY + ease * flatY;
      posZ = (1.0 - ease) * sphereZ + ease * flatZ;
    }

    // Local surface normal
    const len = Math.hypot(posX, posY, posZ) || 1.0;
    const surfNorm: [number, number, number] = [posX / len, posY / len, posZ / len];

    // Surface East & North tangent vectors
    const eEast: [number, number, number] = [
      Math.cos(lonRad),
      0,
      -Math.sin(lonRad),
    ];
    const eNorth: [number, number, number] = [
      -Math.sin(latRad) * Math.sin(lonRad),
      Math.cos(latRad),
      -Math.sin(latRad) * Math.cos(lonRad),
    ];

    // Forward heading on surface
    const fwdX = eNorth[0] * Math.cos(heading) + eEast[0] * Math.sin(heading);
    const fwdY = eNorth[1] * Math.cos(heading) + eEast[1] * Math.sin(heading);
    const fwdZ = eNorth[2] * Math.cos(heading) + eEast[2] * Math.sin(heading);

    return {
      worldPos: [posX, posY, posZ],
      forwardVec: [fwdX, fwdY, fwdZ],
      upVec: surfNorm,
      rightVec: [
        fwdY * surfNorm[2] - fwdZ * surfNorm[1],
        fwdZ * surfNorm[0] - fwdX * surfNorm[2],
        fwdX * surfNorm[1] - fwdY * surfNorm[0],
      ],
    };
  }
}
