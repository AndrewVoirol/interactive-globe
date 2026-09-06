/**
 * Analytical Screen-Space Raycasting & Physics Perturbation Math
 * Implements R4 (Passive Raycast Cursor Perturbation)
 * - Non-blocking passive screen NDC tracking with Exponential Moving Average (EMA) velocity filter
 * - Analytical O(1) camera world ray unprojection and manifold intersection (zero CPU mesh raycasting)
 * - Lamb-Oseen trailing rotational vortex circulation and momentum wake advection (Mode 3 Fluid)
 * - Westergaard / Irwin tensile hoop stress concentration and crack probe amplification (Mode 2 Griffith)
 */

import { Vector3, Vector4, PerspectiveCamera, IVector3 } from '../core/math/cameraMath';

export const RADIUS = 5.0;

export interface RaycastHitResult {
  hit: boolean;
  hitPos: [number, number, number] | null;
  distance: number;
}

export interface CursorUniforms {
  u_cursorRayOrig: Vector3;
  u_cursorRayDir: Vector3;
  u_cursorHitPos: Vector3;
  u_cursorVel: Vector4; // xyz: 3D velocity vector, w: scalar speed
  u_cursorActive: number;     // 1.0 = active hover, 0.0 = idle / decayed
}

/**
 * Maps screen client coordinates (pixels) to Normalized Device Coordinates (NDC) [-1, 1]
 */
export function screenToNDC(
  clientX: number,
  clientY: number,
  clientWidth: number,
  clientHeight: number
): { ndcX: number; ndcY: number } {
  const w = Math.max(1, clientWidth);
  const h = Math.max(1, clientHeight);
  const ndcX = (clientX / w) * 2 - 1;
  const ndcY = 1 - (clientY / h) * 2;
  return { ndcX, ndcY };
}

/**
 * Analytical Ray-Sphere Intersection
 * Solves ||(r0 + t*d)||^2 = R^2 for sphere centered at origin (0, 0, 0)
 * Returns closest front-facing intersection t >= 0
 */
export function raySphereIntersect(
  rayOrig: [number, number, number] | Vector3,
  rayDir: [number, number, number] | Vector3,
  radius = RADIUS
): RaycastHitResult {
  const ox = Array.isArray(rayOrig) ? rayOrig[0] : rayOrig.x;
  const oy = Array.isArray(rayOrig) ? rayOrig[1] : rayOrig.y;
  const oz = Array.isArray(rayOrig) ? rayOrig[2] : rayOrig.z;

  const dx = Array.isArray(rayDir) ? rayDir[0] : rayDir.x;
  const dy = Array.isArray(rayDir) ? rayDir[1] : rayDir.y;
  const dz = Array.isArray(rayDir) ? rayDir[2] : rayDir.z;

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
 * Analytical Ray-Plane Intersection (for 2D Map planar net at Z = planeZ)
 */
export function rayPlaneIntersect(
  rayOrig: [number, number, number] | Vector3,
  rayDir: [number, number, number] | Vector3,
  planeZ = 0.0
): RaycastHitResult {
  const ox = Array.isArray(rayOrig) ? rayOrig[0] : rayOrig.x;
  const oy = Array.isArray(rayOrig) ? rayOrig[1] : rayOrig.y;
  const oz = Array.isArray(rayOrig) ? rayOrig[2] : rayOrig.z;

  const dx = Array.isArray(rayDir) ? rayDir[0] : rayDir.x;
  const dy = Array.isArray(rayDir) ? rayDir[1] : rayDir.y;
  const dz = Array.isArray(rayDir) ? rayDir[2] : rayDir.z;

  if (Math.abs(dz) < 1e-6) {
    return { hit: false, hitPos: null, distance: Infinity };
  }

  const t = (planeZ - oz) / dz;
  if (t < 0) {
    return { hit: false, hitPos: null, distance: Infinity };
  }

  const hitPos: [number, number, number] = [
    ox + t * dx,
    oy + t * dy,
    oz + t * dz,
  ];

  return { hit: true, hitPos, distance: t };
}

/**
 * Unprojects screen NDC (x, y) into camera world ray origin and normalized direction
 */
export function unprojectScreenToRay(
  ndcX: number,
  ndcY: number,
  camera: PerspectiveCamera | any
): { rayOrig: Vector3; rayDir: Vector3 } {
  const rayOrig = new Vector3();
  const rayDir = new Vector3();

  // Ray origin is camera world position
  if (typeof camera.getWorldPosition === 'function') {
    camera.getWorldPosition(rayOrig);
  } else if (camera.position) {
    rayOrig.copy(camera.position);
  }

  // Unproject near point in clip space (z = -1) to world space
  const targetPoint = new Vector3(ndcX, ndcY, 0.5);
  targetPoint.unproject(camera);

  rayDir.subVectors(targetPoint, rayOrig).normalize();

  return { rayOrig, rayDir };
}

/**
 * Computes the manifold hit point across continuous morphing parameter alpha in [0, 1]
 * - alpha = 0: Analytical sphere intersection (radius = 5.0)
 * - alpha = 1: Analytical plane intersection (Z = 0.0)
 * - alpha in (0, 1): Smooth blend between sphere hit and plane hit
 */
export function computeManifoldHit(
  rayOrig: Vector3 | IVector3 | [number, number, number],
  rayDir: Vector3 | IVector3 | [number, number, number],
  alpha: number,
  radius = RADIUS
): { hit: boolean; hitPos: Vector3; distance: number } {
  const ro = rayOrig instanceof Vector3 
    ? rayOrig 
    : Array.isArray(rayOrig) 
      ? new Vector3(rayOrig[0], rayOrig[1], rayOrig[2]) 
      : new Vector3(rayOrig.x, rayOrig.y, rayOrig.z);
  const rd = rayDir instanceof Vector3 
    ? rayDir 
    : Array.isArray(rayDir) 
      ? new Vector3(rayDir[0], rayDir[1], rayDir[2]) 
      : new Vector3(rayDir.x, rayDir.y, rayDir.z);

  const sphereResult = raySphereIntersect(ro, rd, radius);
  const planeResult = rayPlaneIntersect(ro, rd, 0.0);

  const clampedAlpha = Math.max(0.0, Math.min(1.0, alpha));

  if (clampedAlpha <= 0.05) {
    if (sphereResult.hit && sphereResult.hitPos) {
      return {
        hit: true,
        hitPos: new Vector3(...sphereResult.hitPos),
        distance: sphereResult.distance,
      };
    }
    // Fallback if ray missed sphere: project along ray at default radius distance
    const defaultDist = Math.max(5.0, ro.length() - radius);
    const fallbackHit = ro.clone().addScaledVector(rd, defaultDist);
    return { hit: false, hitPos: fallbackHit, distance: defaultDist };
  }

  if (clampedAlpha >= 0.95) {
    if (planeResult.hit && planeResult.hitPos) {
      return {
        hit: true,
        hitPos: new Vector3(...planeResult.hitPos),
        distance: planeResult.distance,
      };
    }
    const defaultDist = Math.max(5.0, Math.abs(ro.z));
    const fallbackHit = ro.clone().addScaledVector(rd, defaultDist);
    return { hit: false, hitPos: fallbackHit, distance: defaultDist };
  }

  // During transition: blend between sphere hit and plane hit
  const sPos = sphereResult.hit && sphereResult.hitPos 
    ? new Vector3(...sphereResult.hitPos) 
    : ro.clone().addScaledVector(rd, Math.max(5.0, ro.length() - radius));

  const pPos = planeResult.hit && planeResult.hitPos 
    ? new Vector3(...planeResult.hitPos) 
    : ro.clone().addScaledVector(rd, Math.max(5.0, Math.abs(ro.z)));

  const blendedPos = new Vector3().lerpVectors(sPos, pPos, clampedAlpha);
  const blendedDist = ro.distanceTo(blendedPos);

  return {
    hit: sphereResult.hit || planeResult.hit,
    hitPos: blendedPos,
    distance: blendedDist,
  };
}

/**
 * Lamb-Oseen Vortex Circulation & Tangential Velocity Model (Mode 3 Fluid Flow)
 * Evaluates exact analytical velocity profile and decaying vorticity
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
 * Griffith Linear Elastic Fracture Mechanics (LEFM) Tensile Hoop Stress Model (Mode 2)
 * Concentrates tensile hoop stress around the crack tip and cursor probe
 */
export function griffithHoopStress(
  r: number,
  theta: number,
  KI = 1.0,
  cursorHitDist = Infinity,
  beta = 1.5,
  sigmaC = 1.0
): { sigmaThetaTheta: number; localStrain: number; effectiveKI: number } {
  const proximityBoost = Number.isFinite(cursorHitDist)
    ? beta * Math.exp(-(cursorHitDist * cursorHitDist) / (2 * sigmaC * sigmaC))
    : 0;
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
 * Passive Cursor Tracker Class
 * Maintains stateful NDC coordinates, smoothed EMA velocity, decay on idle,
 * unprojected camera ray, and manifold hit position without blocking OrbitControls.
 */
export class CursorTracker {
  public ndcX = 0;
  public ndcY = 0;
  public prevNdcX = 0;
  public prevNdcY = 0;
  
  public velX = 0;
  public velY = 0;
  public smoothedSpeed = 0;

  public rayOrig = new Vector3(0, 0, 15);
  public rayDir = new Vector3(0, 0, -1);
  public hitPos = new Vector3(0, 0, 5);
  public worldVel = new Vector3(0, 0, 0);

  public activeIntensity = 0.0;
  public lastMoveTime = 0;
  public isInside = false;

  private prevHitPos = new Vector3(0, 0, 5);
  private lastUpdateTime = performance.now();
  private cleanupListeners: (() => void) | null = null;

  private alphaEma = 0.35; // Smoothing factor for Exponential Moving Average
  private tauDecay = 0.25; // Inactivity decay time constant in seconds (250 ms)

  private static sharedListenersMap = new Map<EventTarget, {
    instances: Set<CursorTracker>;
    onPointerMove: (e: any) => void;
    onPointerLeave: () => void;
  }>();

  /**
   * Attaches passive window pointer event listeners ({ passive: true })
   * Does NOT call stopPropagation or preventDefault, preserving OrbitControls gestures.
   * Consolidates duplicate target listeners into a single shared manager.
   */
  public attach(container?: HTMLElement | Window | EventTarget): void {
    const target = container || (typeof window !== 'undefined' ? window : null);
    if (!target) return;

    this.detach();

    let entry = CursorTracker.sharedListenersMap.get(target);
    if (!entry) {
      const instances = new Set<CursorTracker>();
      const onPointerMove = (e: any) => {
        const width = (typeof window !== 'undefined' && target === window) || !('clientWidth' in (target as any))
          ? (typeof window !== 'undefined' ? window.innerWidth : 1920)
          : (target as HTMLElement).clientWidth;
        const height = (typeof window !== 'undefined' && target === window) || !('clientHeight' in (target as any))
          ? (typeof window !== 'undefined' ? window.innerHeight : 1080)
          : (target as HTMLElement).clientHeight;

        const { ndcX, ndcY } = screenToNDC(e.clientX ?? 0, e.clientY ?? 0, width, height);
        const now = performance.now();

        instances.forEach((inst) => {
          inst.prevNdcX = inst.ndcX;
          inst.prevNdcY = inst.ndcY;
          inst.ndcX = ndcX;
          inst.ndcY = ndcY;
          inst.lastMoveTime = now;
          inst.isInside = true;
          inst.activeIntensity = 1.0;
        });
      };

      const onPointerLeave = () => {
        instances.forEach((inst) => {
          inst.isInside = false;
        });
      };

      target.addEventListener('pointermove', onPointerMove as EventListener, { passive: true });
      target.addEventListener('pointerleave', onPointerLeave as EventListener, { passive: true });

      entry = { instances, onPointerMove, onPointerLeave };
      CursorTracker.sharedListenersMap.set(target, entry);
    }

    entry.instances.add(this);

    this.cleanupListeners = () => {
      const currentEntry = CursorTracker.sharedListenersMap.get(target);
      if (currentEntry) {
        currentEntry.instances.delete(this);
        if (currentEntry.instances.size === 0) {
          target.removeEventListener('pointermove', currentEntry.onPointerMove as EventListener);
          target.removeEventListener('pointerleave', currentEntry.onPointerLeave as EventListener);
          CursorTracker.sharedListenersMap.delete(target);
        }
      }
    };
  }

  public detach(): void {
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
  }

  /**
   * Updates raycasting, EMA velocities, and decay for the current frame
   */
  public update(camera: PerspectiveCamera | any, alpha: number): CursorUniforms {
    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastUpdateTime) * 0.001);
    this.lastUpdateTime = now;

    // 1. Calculate NDC velocity with Exponential Moving Average (EMA)
    const rawVelX = (this.ndcX - this.prevNdcX) / dt;
    const rawVelY = (this.ndcY - this.prevNdcY) / dt;
    const rawSpeed = Math.hypot(rawVelX, rawVelY);

    this.velX = this.alphaEma * rawVelX + (1 - this.alphaEma) * this.velX;
    this.velY = this.alphaEma * rawVelY + (1 - this.alphaEma) * this.velY;
    this.smoothedSpeed = this.alphaEma * rawSpeed + (1 - this.alphaEma) * this.smoothedSpeed;

    // 2. Inactivity decay when cursor is stationary
    const timeSinceMove = (now - this.lastMoveTime) * 0.001;
    if (timeSinceMove > 0.06) {
      this.activeIntensity = Math.exp(-(timeSinceMove - 0.06) / this.tauDecay);
      if (this.activeIntensity < 0.001) this.activeIntensity = 0.0;
    } else {
      this.activeIntensity = 1.0;
    }

    if (!this.isInside) {
      this.activeIntensity *= 0.90;
    }

    // 3. Unproject camera ray
    const { rayOrig, rayDir } = unprojectScreenToRay(this.ndcX, this.ndcY, camera);
    this.rayOrig.copy(rayOrig);
    this.rayDir.copy(rayDir);

    // 4. Compute 3D manifold hit point
    const { hitPos } = computeManifoldHit(rayOrig, rayDir, alpha, RADIUS);
    this.prevHitPos.copy(this.hitPos);
    this.hitPos.copy(hitPos);

    // 5. 3D World velocity on manifold
    this.worldVel.subVectors(this.hitPos, this.prevHitPos).multiplyScalar(1.0 / dt);
    const worldSpeed = Math.min(10.0, this.worldVel.length());

    return {
      u_cursorRayOrig: this.rayOrig,
      u_cursorRayDir: this.rayDir,
      u_cursorHitPos: this.hitPos,
      u_cursorVel: new Vector4(this.worldVel.x, this.worldVel.y, this.worldVel.z, worldSpeed),
      u_cursorActive: this.activeIntensity,
    };
  }

  public getUniforms(): CursorUniforms {
    const worldSpeed = Math.min(10.0, this.worldVel.length());
    return {
      u_cursorRayOrig: this.rayOrig,
      u_cursorRayDir: this.rayDir,
      u_cursorHitPos: this.hitPos,
      u_cursorVel: new Vector4(this.worldVel.x, this.worldVel.y, this.worldVel.z, worldSpeed),
      u_cursorActive: this.activeIntensity,
    };
  }
}
