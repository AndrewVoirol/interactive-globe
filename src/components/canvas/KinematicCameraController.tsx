// ============================================================================
// File: src/components/canvas/KinematicCameraController.tsx
// Architecture: Native Standalone Inertial & Kinematic Camera Controller
// Description: Zero-dependency camera flight and inertial damping controller
//              matching Drei OrbitControls glide (decay factor 0.05).
// ============================================================================

import React, { useEffect, useRef } from 'react';
import { Vector3, PerspectiveCamera, Vec3Tuple, sphericalToCartesian, cartesianToSpherical } from '../../core/math/cameraMath';

export const DEFAULT_DAMPING_FACTOR = 0.05;
export const DEFAULT_ROTATE_SPEED = 0.005;
export const DEFAULT_ZOOM_SPEED = 0.01;
export const DEFAULT_PAN_SPEED = 0.001;

export interface KinematicCameraControllerProps {
  targetPos?: Vector3 | Vec3Tuple | null;
  onArrived?: () => void;
  controlsRef?: React.RefObject<any>;
  onTargetChange?: (target: Vector3 | Vec3Tuple) => void;
  camera?: PerspectiveCamera;
  canvas?: HTMLCanvasElement | null;
  dampingFactor?: number;
}

/**
 * Pure class for native camera kinematics and inertial gliding
 */
export class NativeInertialCameraController {
  public radius = 15;
  public theta = 1.5184; // 87°E (Himalayas / Tibetan Plateau)
  public phi = 1.0821;   // 28°N
  public target = new Vector3(0, 0, 0);

  public velTheta = 0;
  public velPhi = 0;
  public velRadius = 0;
  public velPanX = 0;
  public velPanY = 0;

  public dampingFactor: number;
  public rotateSpeed: number;
  public zoomSpeed: number;
  public panSpeed: number;

  public minRadius = 6.0;
  public maxRadius = 50.0;

  constructor(options: {
    dampingFactor?: number;
    rotateSpeed?: number;
    zoomSpeed?: number;
    panSpeed?: number;
  } = {}) {
    this.dampingFactor = options.dampingFactor ?? DEFAULT_DAMPING_FACTOR;
    this.rotateSpeed = options.rotateSpeed ?? DEFAULT_ROTATE_SPEED;
    this.zoomSpeed = options.zoomSpeed ?? DEFAULT_ZOOM_SPEED;
    this.panSpeed = options.panSpeed ?? DEFAULT_PAN_SPEED;
  }

  public addRotateDelta(dx: number, dy: number): void {
    this.velTheta -= dx * this.rotateSpeed;
    this.velPhi -= dy * this.rotateSpeed;
  }

  public addPanDelta(dx: number, dy: number): void {
    const scale = this.radius * this.panSpeed;
    this.velPanX -= dx * scale;
    this.velPanY += dy * scale;
  }

  public addZoomDelta(deltaY: number): void {
    this.velRadius += deltaY * this.zoomSpeed;
  }

  public update(dt = 1 / 60): boolean {
    const decay = Math.pow(1 - this.dampingFactor, Math.max(1, dt * 60));

    let moved = false;

    if (
      Math.abs(this.velTheta) > 1e-6 ||
      Math.abs(this.velPhi) > 1e-6 ||
      Math.abs(this.velRadius) > 1e-6 ||
      Math.abs(this.velPanX) > 1e-6 ||
      Math.abs(this.velPanY) > 1e-6
    ) {
      this.theta += this.velTheta;
      this.phi = Math.min(Math.max(this.phi + this.velPhi, 0.001), Math.PI - 0.001);
      this.radius = Math.min(Math.max(this.radius + this.velRadius, this.minRadius), this.maxRadius);
      this.target.x += this.velPanX;
      this.target.y += this.velPanY;

      this.velTheta *= decay;
      this.velPhi *= decay;
      this.velRadius *= decay;
      this.velPanX *= decay;
      this.velPanY *= decay;

      if (Math.abs(this.velTheta) < 1e-6) this.velTheta = 0;
      if (Math.abs(this.velPhi) < 1e-6) this.velPhi = 0;
      if (Math.abs(this.velRadius) < 1e-6) this.velRadius = 0;
      if (Math.abs(this.velPanX) < 1e-6) this.velPanX = 0;
      if (Math.abs(this.velPanY) < 1e-6) this.velPanY = 0;

      moved = true;
    }

    return moved;
  }

  public applyToCamera(camera: PerspectiveCamera | { position: Vector3; lookAt: (t: Vector3) => void; updateMatrixWorld?: () => void }): void {
    const cart = sphericalToCartesian(this.radius, this.phi, this.theta);
    camera.position.set(
      this.target.x + cart[0],
      this.target.y + cart[1],
      this.target.z + cart[2]
    );
    camera.lookAt(this.target);
    camera.updateMatrixWorld?.();
  }
}

/**
 * KinematicCameraController React Component
 * Manages programmatic camera fly-to animations and targetPos convergence.
 */
export const KinematicCameraController: React.FC<KinematicCameraControllerProps> = ({
  targetPos,
  onArrived,
  controlsRef,
  onTargetChange,
  camera,
  dampingFactor = DEFAULT_DAMPING_FACTOR,
}) => {
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!targetPos) return;

    const tPos = Array.isArray(targetPos)
      ? new Vector3(targetPos[0], targetPos[1], targetPos[2])
      : targetPos;

    const step = () => {
      let cam = camera;
      let ctrl = controlsRef?.current;

      if (ctrl?.object) {
        cam = ctrl.object;
      }

      if (!cam) return;

      cam.position.lerp(tPos, 0.08);

      if (ctrl?.target) {
        if (typeof ctrl.target.lerp === 'function') {
          ctrl.target.lerp(new Vector3(0, 0, 0), 0.08);
        }
        ctrl.update?.();
        onTargetChange?.(ctrl.target);
      }

      if (cam.position.distanceTo(tPos) < 0.05) {
        cam.position.copy(tPos);
        onArrived?.();
      } else {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [targetPos, onArrived, controlsRef, onTargetChange, camera]);

  return null;
};

export default KinematicCameraController;
