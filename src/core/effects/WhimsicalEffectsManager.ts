/**
 * Indicatrix Engine — Organic Whimsical Effects Manager
 * 
 * Orchestrates three geometric and physical whimsical moments:
 * 1. Fibonacci Pole Alignment & Moiré Ring Resonance (theta < 0.5 deg)
 * 2. Harmonic Edge Standing Waves along Dymaxion Facet Hinge Lines (alpha in [0.45, 0.55])
 * 3. Dymaxion 20-Facet Specular Flash Sweep (alpha >= 0.998)
 * 
 * Conforms strictly to design-language.md Section 5.
 */

export interface WhimsicalEffectsState {
  // Moment 1: Fibonacci Polar Alignment
  isPolarAligned: boolean;
  polarAngleDegrees: number;
  pointScaleMultiplier: number; // 1.2x when aligned, 1.0x default

  // Moment 2: Harmonic Edge Standing Waves
  isStandingWaveActive: boolean;
  standingWaveAmplitude: number;

  // Moment 3: Dymaxion 20-Facet Specular Flash
  isSpecularFlashActive: boolean;
  activeFacetIndex: number | null; // 0 to 19 when sweeping, null otherwise
}

export class WhimsicalEffectsManager {
  private flashStartTime: number | null = null;
  private flashDurationMs: number = 350; // 350ms total sweep across 20 facets
  private lastAlpha: number = 0;

  /**
   * Evaluates all 3 organic whimsical moments based on frame kinematics and simulation state.
   * 
   * @param cameraPosition [x, y, z] camera position in world space
   * @param mode Active simulation paradigm (0..4)
   * @param alpha Morph unfurl progress [0.0, 1.0]
   * @param timeSeconds Elapsed engine time in seconds
   * @param deltaMs Frame delta time in milliseconds
   */
  public update(
    cameraPosition: [number, number, number],
    mode: number,
    alpha: number,
    timeSeconds: number,
    deltaMs: number = 16.6
  ): WhimsicalEffectsState {
    // -------------------------------------------------------------------------
    // Moment 1: Fibonacci Pole Alignment & Moiré Ring Resonance
    // -------------------------------------------------------------------------
    const camX = cameraPosition[0];
    const camY = cameraPosition[1];
    const camZ = cameraPosition[2];
    const camDist = Math.sqrt(camX * camX + camY * camY + camZ * camZ);

    let polarAngleDegrees = 90;
    let isPolarAligned = false;

    if (camDist > 0.001) {
      // Angle theta relative to Y axis (+Y or -Y pole)
      const cosTheta = Math.abs(camY) / camDist;
      const clampedCos = Math.max(-1.0, Math.min(1.0, cosTheta));
      const thetaRad = Math.acos(clampedCos);
      polarAngleDegrees = (thetaRad * 180.0) / Math.PI;

      // Trigger condition: theta < 0.5 degrees
      if (polarAngleDegrees < 0.5) {
        isPolarAligned = true;
      }
    }

    const pointScaleMultiplier = isPolarAligned ? 1.2 : 1.0;

    // -------------------------------------------------------------------------
    // Moment 2: Harmonic Edge Standing Waves (Dymaxion Hinge Vibration)
    // -------------------------------------------------------------------------
    // Trigger condition: mode === 4 and alpha in [0.45, 0.55]
    const isStandingWaveActive = mode === 4 && alpha >= 0.45 && alpha <= 0.55;
    let standingWaveAmplitude = 0;

    if (isStandingWaveActive) {
      // Envelope peaks at alpha = 0.50
      const envelope = 1.0 - Math.abs(alpha - 0.50) / 0.05;
      const omega = 12.0; // Oscillation frequency
      standingWaveAmplitude = 0.15 * envelope * Math.cos(omega * timeSeconds);
    }

    // -------------------------------------------------------------------------
    // Moment 3: Dymaxion 20-Facet Specular Flash Sweep
    // -------------------------------------------------------------------------
    // Trigger condition: mode === 4 and alpha >= 0.998
    const isAtPlanarity = mode === 4 && alpha >= 0.998;
    const justReachedPlanarity = isAtPlanarity && this.lastAlpha < 0.998;

    if (justReachedPlanarity || (isAtPlanarity && this.flashStartTime === null)) {
      this.flashStartTime = performance.now();
    } else if (!isAtPlanarity) {
      this.flashStartTime = null;
    }

    this.lastAlpha = alpha;

    let isSpecularFlashActive = false;
    let activeFacetIndex: number | null = null;

    if (isAtPlanarity && this.flashStartTime !== null) {
      const elapsed = performance.now() - this.flashStartTime;
      if (elapsed <= this.flashDurationMs) {
        isSpecularFlashActive = true;
        const progress = elapsed / this.flashDurationMs;
        activeFacetIndex = Math.min(19, Math.floor(progress * 20));
      }
    }

    return {
      isPolarAligned,
      polarAngleDegrees,
      pointScaleMultiplier,
      isStandingWaveActive,
      standingWaveAmplitude,
      isSpecularFlashActive,
      activeFacetIndex,
    };
  }

  /**
   * Computes the standing wave eigenmode displacement y(x, t) = A * sin(pi * x / L) * cos(omega * t)
   */
  public computeStandingWaveOffset(
    x: number,
    L: number = 1.05,
    timeSeconds: number = 0.0,
    amplitude: number = 0.15
  ): number {
    return amplitude * Math.sin((Math.PI * x) / L) * Math.cos(12.0 * timeSeconds);
  }
}
