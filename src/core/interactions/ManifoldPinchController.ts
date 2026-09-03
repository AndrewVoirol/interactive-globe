/**
 * Indicatrix Engine — Signature Manifold Pinch Controller & Spring-Damper Dynamics
 * 
 * Implements a pressure-sensitive manifold interaction model governed by damped harmonic
 * oscillation mechanics (F = -kx - cv) and a 4-state Finite State Machine (FSM):
 * IDLE -> HOVER_PROBE -> PINCH_ENGAGED -> RELEASE_REBOUND
 * 
 * Conforms strictly to design-language.md Section 6.
 */

import { ProceduralAudioEngine } from '../audio/ProceduralAudioEngine';

export type PinchFSMState = 'IDLE' | 'HOVER_PROBE' | 'PINCH_ENGAGED' | 'RELEASE_REBOUND';

export interface ManifoldPinchState {
  fsmState: PinchFSMState;
  hitPosition: [number, number, number];
  pinchDepth: number; // Current displacement magnitude [0.0, 1.0]
  strainEnergy: number; // E = 0.5 * k * z^2
  cursorActive: number; // 0.0 or 1.0 for shader uniform
  reboundOscillation: number; // Current z(t) during recoil phase
}

export class ManifoldPinchController {
  private fsmState: PinchFSMState = 'IDLE';
  private hitPos: [number, number, number] = [0, 0, 0];
  private pinchDepth: number = 0; // z_pinch
  private initialPinchDepth: number = 0;
  private reboundTimeSeconds: number = 0;
  private isPointerDown: boolean = false;
  private isPointerInside: boolean = false;

  // Spring & Damping Physical Constants (design-language.md 6.3)
  private readonly springStiffnessK: number = 45.0; // N/m
  private readonly dampingGamma: number = 6.5; // s^-1 (damping ratio zeta = 0.25)
  private readonly dampedFrequencyOmegaD: number = 28.0; // rad/s
  private readonly sigmaPinch: number = 0.64; // Gaussian influence radius

  private audioEngine: ProceduralAudioEngine | null = null;

  constructor(audioEngine?: ProceduralAudioEngine) {
    if (audioEngine) {
      this.audioEngine = audioEngine;
    }
  }

  public setAudioEngine(engine: ProceduralAudioEngine): void {
    this.audioEngine = engine;
  }

  public getState(): ManifoldPinchState {
    const strainEnergy = 0.5 * this.springStiffnessK * this.pinchDepth * this.pinchDepth;
    const reboundOscillation =
      this.fsmState === 'RELEASE_REBOUND'
        ? this.computeDampedOscillation(this.initialPinchDepth, this.reboundTimeSeconds)
        : 0;

    return {
      fsmState: this.fsmState,
      hitPosition: [...this.hitPos],
      pinchDepth: this.fsmState === 'RELEASE_REBOUND' ? Math.abs(reboundOscillation) : this.pinchDepth,
      strainEnergy,
      cursorActive: this.fsmState !== 'IDLE' ? 1.0 : 0.0,
      reboundOscillation,
    };
  }

  public getFSMState(): PinchFSMState {
    return this.fsmState;
  }

  /**
   * Pointer enters viewport
   */
  public onPointerEnter(): void {
    this.isPointerInside = true;
    if (this.fsmState === 'IDLE') {
      this.transitionTo('HOVER_PROBE');
    }
  }

  /**
   * Pointer leaves viewport
   */
  public onPointerLeave(): void {
    this.isPointerInside = false;
    this.isPointerDown = false;
    if (this.fsmState === 'HOVER_PROBE') {
      this.transitionTo('IDLE');
    } else if (this.fsmState === 'PINCH_ENGAGED') {
      this.onPointerUp();
    }
  }

  /**
   * Passive raycast hover update
   */
  public onHoverMove(hitX: number, hitY: number, hitZ: number): void {
    this.hitPos = [hitX, hitY, hitZ];
    if (this.fsmState === 'IDLE' && this.isPointerInside) {
      this.transitionTo('HOVER_PROBE');
    }
  }

  /**
   * MouseDown or Touch Pinch engaged
   */
  public onPointerDown(hitX?: number, hitY?: number, hitZ?: number, targetDepth: number = 0.75): void {
    if (hitX !== undefined && hitY !== undefined && hitZ !== undefined) {
      this.hitPos = [hitX, hitY, hitZ];
    }
    this.isPointerDown = true;
    this.pinchDepth = Math.max(0.0, Math.min(1.0, targetDepth));
    this.transitionTo('PINCH_ENGAGED');
  }

  /**
   * MouseUp or Touch Release rebound
   */
  public onPointerUp(): void {
    if (this.fsmState === 'PINCH_ENGAGED') {
      this.isPointerDown = false;
      this.initialPinchDepth = this.pinchDepth;
      this.reboundTimeSeconds = 0;
      this.transitionTo('RELEASE_REBOUND');

      // Trigger resonant audio ping
      if (this.audioEngine) {
        this.audioEngine.triggerRebound(this.initialPinchDepth);
      }
    }
  }

  /**
   * Frame-by-frame physics simulation tick
   * 
   * @param deltaSeconds Frame step duration in seconds
   */
  public update(deltaSeconds: number): ManifoldPinchState {
    if (this.fsmState === 'RELEASE_REBOUND') {
      this.reboundTimeSeconds += deltaSeconds;
      const zVal = this.computeDampedOscillation(this.initialPinchDepth, this.reboundTimeSeconds);

      // Oscillation decay condition (|z(t)| < 0.001)
      if (Math.abs(zVal) < 0.001 && this.reboundTimeSeconds > 0.15) {
        this.pinchDepth = 0;
        this.transitionTo(this.isPointerInside ? 'HOVER_PROBE' : 'IDLE');
      }
    }

    return this.getState();
  }

  /**
   * Analytical solution for damped harmonic oscillation:
   * z(t) = z_pinch * e^(-gamma * t) * cos(omega_d * t)
   */
  public computeDampedOscillation(zPinch: number, t: number): number {
    if (t < 0) return zPinch;
    const decay = Math.exp(-this.dampingGamma * t);
    const oscillation = Math.cos(this.dampedFrequencyOmegaD * t);
    return zPinch * decay * oscillation;
  }

  /**
   * Local surface Gaussian normal displacement:
   * delta_p(r) = -n * z_pinch * exp(-r^2 / (2 * sigma^2))
   */
  public computeDisplacementAtDistance(distanceR: number, depth: number = this.pinchDepth): number {
    return depth * Math.exp(-(distanceR * distanceR) / (2.0 * this.sigmaPinch * this.sigmaPinch));
  }

  private transitionTo(newState: PinchFSMState): void {
    if (this.fsmState !== newState) {
      this.fsmState = newState;
    }
  }
}
