/**
 * Indicatrix Engine — Organic Whimsical Effects Manager
 * 
 * Orchestrates geometric and physical whimsical moments:
 * 1. Fibonacci Pole Alignment & Moiré Ring Resonance (theta < 0.5 deg)
 * 
 * Conforms strictly to design-language.md Section 5.1.
 */

import { SimulationMode } from '../../types';

export interface WhimsicalEffectsState {
  // Moment 1: Fibonacci Polar Alignment & Moiré Ring Resonance
  isPolarAligned: boolean;
  polarAngleDegrees: number;
  pointScaleMultiplier: number; // 1.2x when aligned, 1.0x default
}

export class WhimsicalEffectsManager {
  /**
   * Evaluates organic whimsical moments based on frame kinematics and simulation state.
   * 
   * @param cameraPosition [x, y, z] camera position in world space
   * @param mode Active simulation paradigm (0..3, SimulationMode)
   * @param alpha Morph unfurl progress [0.0, 1.0]
   * @param timeSeconds Elapsed engine time in seconds
   * @param deltaMs Frame delta time in milliseconds
   */
  public update(
    cameraPosition: [number, number, number],
    mode: SimulationMode,
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

    return {
      isPolarAligned,
      polarAngleDegrees,
      pointScaleMultiplier,
    };
  }
}
