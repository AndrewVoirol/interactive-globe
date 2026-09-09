// ============================================================================
// File: src/core/camera/TrajectoryCameraController.ts
// Architecture: 5-Mode Kinematic Trajectory Flight Controller
// Description: Multi-mode flight camera with geodesic centripetal banking & HUD projection
// ============================================================================

import { Vector3, Quaternion, IVector3 } from '../math/cameraMath';
import { RTCCamera, AltitudeRegime } from './RTCCamera';

export type CameraKinematicMode = 
  | 'orbital' 
  | 'free-flight-6dof' 
  | 'follow-path' 
  | 'cockpit-hud' 
  | 'dolly-cinematic';

export interface FlightControlInputs {
  pitchUp: number;     // [-1.0..1.0] (W/S)
  yawRight: number;    // [-1.0..1.0] (A/D)
  rollRight: number;   // [-1.0..1.0] (Q/E)
  throttle: number;    // [0.0..1.0] (Shift/Ctrl)
}

export interface Waypoint3D {
  position: Vector3;
  target?: Vector3;
  fov?: number;
}

export class TrajectoryCameraController {
  public mode: CameraKinematicMode = 'orbital';
  public rtcCamera: RTCCamera = new RTCCamera();

  // Kinematic parameters
  public position: Vector3 = new Vector3(0, 0, 15);
  public orientation: Quaternion = new Quaternion();
  public velocity: Vector3 = new Vector3();
  public target: Vector3 = new Vector3(0, 0, 0);

  private angularVelocity: Vector3 = new Vector3();
  private speed = 0.0;
  private readonly maxSpeed = 2.5; // Globe units / second
  private readonly acceleration = 1.2;
  private readonly damping = 0.94;

  // Path follower & Cinematic Dolly states
  private pathWaypoints: Waypoint3D[] = [];
  private pathProgress = 0; // [0.0..1.0]
  private dollyFov = 60;
  private duration = 8.0; // Sequence duration in seconds
  private isPlaying = true;
  private loop = false;

  public setMode(newMode: CameraKinematicMode): void {
    this.mode = newMode;
  }

  public setWaypoints(waypoints: Waypoint3D[], duration = 8.0, loop = false): void {
    this.pathWaypoints = waypoints;
    this.pathProgress = 0;
    this.duration = duration > 0 ? duration : 8.0;
    this.loop = loop;
    this.isPlaying = true;
    if (waypoints.length > 0) {
      this.position.copy(waypoints[0].position);
      if (waypoints[0].target) this.target.copy(waypoints[0].target);
      if (waypoints[0].fov) this.dollyFov = waypoints[0].fov;
    }
  }

  public setDuration(seconds: number): void {
    this.duration = Math.max(0.1, seconds);
  }

  public getDuration(): number {
    return this.duration;
  }

  public getProgress(): number {
    return this.pathProgress;
  }

  public setProgress(p: number): void {
    this.pathProgress = Math.max(0, Math.min(1, p));
    this.applyWaypointsAtProgress(this.pathProgress);
  }

  public getFov(): number {
    return this.dollyFov;
  }

  public isFinished(): boolean {
    return this.pathProgress >= 1.0;
  }

  public setIsPlaying(playing: boolean): void {
    this.isPlaying = playing;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public reset(): void {
    this.pathProgress = 0;
    this.isPlaying = false;
    if (this.pathWaypoints.length > 0) {
      this.position.copy(this.pathWaypoints[0].position);
      if (this.pathWaypoints[0].target) this.target.copy(this.pathWaypoints[0].target);
      if (this.pathWaypoints[0].fov) this.dollyFov = this.pathWaypoints[0].fov;
    }
  }

  /**
   * Geodesic Centripetal Banking Angle equation:
   * phi_bank = atan2(v^2, g * R_turn)
   */
  public computeGeodesicBanking(turnRadius: number, gravity = 9.81): number {
    if (Math.abs(turnRadius) < 0.001) return 0;
    const vSq = this.speed * this.speed;
    return Math.atan2(vSq, gravity * turnRadius);
  }

  /**
   * Main per-frame update tick
   */
  public update(dt: number, inputs?: FlightControlInputs): void {
    if (this.mode === 'free-flight-6dof' || this.mode === 'cockpit-hud') {
      this.update6DOF(dt, inputs || { pitchUp: 0, yawRight: 0, rollRight: 0, throttle: 0 });
    } else if (this.mode === 'follow-path') {
      this.updatePathFollower(dt);
    } else if (this.mode === 'dolly-cinematic') {
      this.updateDollyCinematic(dt);
    }

    // Synchronize rtcCamera position
    this.rtcCamera.cameraPosition.copy(this.position);
    this.rtcCamera.cameraTarget.copy(this.target);
  }

  private update6DOF(dt: number, inputs: FlightControlInputs): void {
    // 1. Integrate speed and throttle
    const targetSpeed = inputs.throttle * this.maxSpeed;
    this.speed += (targetSpeed - this.speed) * this.acceleration * dt;

    // 2. Compute angular rotations (Pitch, Yaw, Roll)
    const pitchTorque = inputs.pitchUp * 1.5;
    const yawTorque = inputs.yawRight * 1.0;
    const rollTorque = inputs.rollRight * 2.0;

    this.angularVelocity.x += pitchTorque * dt;
    this.angularVelocity.y += yawTorque * dt;
    this.angularVelocity.z += rollTorque * dt;

    this.angularVelocity.multiplyScalar(this.damping);

    const deltaRotation = new Quaternion().setFromEuler(
      this.angularVelocity.x * dt,
      this.angularVelocity.y * dt,
      this.angularVelocity.z * dt
    );
    this.orientation.multiply(deltaRotation);
    this.orientation.normalize();

    // 3. Forward translation
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.orientation);
    this.velocity.copy(forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    if (this.mode === 'cockpit-hud') {
      this.target.copy(this.position).add(forward);
    } else {
      this.target.copy(this.position).addScaledVector(forward, 5.0);
    }
  }

  private updatePathFollower(dt: number): void {
    if (this.pathWaypoints.length < 2) return;

    this.pathProgress += dt * 0.1;
    if (this.pathProgress > 1.0) this.pathProgress -= 1.0;

    const totalSegs = this.pathWaypoints.length - 1;
    const scaledProgress = this.pathProgress * totalSegs;
    const index = Math.floor(scaledProgress);
    const fraction = scaledProgress - index;

    const wp0 = this.pathWaypoints[index];
    const wp1 = this.pathWaypoints[Math.min(index + 1, totalSegs)];

    this.position.lerpVectors(wp0.position, wp1.position, fraction);

    // Centripetal banking calculation along turn
    const turnRadius = 10.0;
    const bankAngle = this.computeGeodesicBanking(turnRadius);
    this.orientation.setFromAxisAngle(new Vector3(0, 0, 1), bankAngle);

    const forward = new Vector3(0, 0, -1).applyQuaternion(this.orientation);
    this.target.copy(this.position).add(forward);
  }

  private updateDollyCinematic(dt: number): void {
    if (this.pathWaypoints.length < 2) return;
    if (!this.isPlaying) return;

    const speed = this.duration > 0 ? 1.0 / this.duration : 0.05;
    this.pathProgress += dt * speed;

    if (this.pathProgress >= 1.0) {
      if (this.loop) {
        this.pathProgress -= 1.0;
      } else {
        this.pathProgress = 1.0;
        this.isPlaying = false;
      }
    }

    this.applyWaypointsAtProgress(this.pathProgress);
  }

  public applyWaypointsAtProgress(progress: number): void {
    if (this.pathWaypoints.length < 2) return;
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const totalSegs = this.pathWaypoints.length - 1;
    const scaledProgress = clampedProgress * totalSegs;
    const index = Math.min(Math.floor(scaledProgress), totalSegs - 1);
    const fraction = scaledProgress - index;

    const wp0 = this.pathWaypoints[index];
    const wp1 = this.pathWaypoints[Math.min(index + 1, totalSegs)];

    this.position.lerpVectors(wp0.position, wp1.position, fraction);

    // Globe safety floor: radius >= 5.8 to avoid near-plane clipping
    const currentRadius = this.position.length();
    if (currentRadius < 5.8) {
      this.position.multiplyScalar(5.8 / Math.max(0.001, currentRadius));
    }

    if (wp0.target && wp1.target) {
      this.target.lerpVectors(wp0.target, wp1.target, fraction);
    } else if (wp0.target) {
      this.target.copy(wp0.target);
    }
    if (wp0.fov && wp1.fov) {
      this.dollyFov = wp0.fov + (wp1.fov - wp0.fov) * fraction;
    } else if (wp0.fov) {
      this.dollyFov = wp0.fov;
    }
  }

  public getRtcMatrices() {
    return this.rtcCamera.getRtcMatrices();
  }
}
