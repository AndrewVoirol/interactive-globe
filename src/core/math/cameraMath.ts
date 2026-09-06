// ============================================================================
// File: src/core/math/cameraMath.ts
// Architecture: Zero-Dependency Camera Linear Algebra & Spherical Kinematics
// Description: High-performance ES6 Float32Array vector, matrix, and projection math
//              replacing Three.js math across the entire Indicatrix engine.
// ============================================================================

export interface SphericalCoords {
  radius: number;
  phi: number;   // Polar angle from +Y axis [0, PI]
  theta: number; // Azimuthal angle around Y axis [-PI, PI]
}

export type Vec3Tuple = [number, number, number];
export type Vec4Tuple = [number, number, number, number];

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

export interface IVector4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ============================================================================
// Vector3: High-Performance Pure 3D Vector
// ============================================================================
export class Vector3 implements IVector3 {
  public x: number;
  public y: number;
  public z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  public copy(v: IVector3 | Vec3Tuple | Float32Array): this {
    if (Array.isArray(v) || v instanceof Float32Array) {
      this.x = v[0];
      this.y = v[1];
      this.z = v[2];
    } else {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
    }
    return this;
  }

  public setFromMatrixPosition(m: { elements: ArrayLike<number> }): this {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }

  public clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  public add(v: IVector3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  public addVectors(a: IVector3, b: IVector3): this {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }

  public addScaledVector(v: IVector3, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  public sub(v: IVector3): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  public subVectors(a: IVector3, b: IVector3): this {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  public multiplyScalar(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  public scale(s: number): this {
    return this.multiplyScalar(s);
  }

  public dot(v: IVector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  public cross(v: IVector3): this {
    const ax = this.x, ay = this.y, az = this.z;
    const bx = v.x, by = v.y, bz = v.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  public crossVectors(a: IVector3, b: IVector3): this {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  public lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  public length(): number {
    return Math.sqrt(this.lengthSq());
  }

  public distanceTo(v: IVector3): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  public normalize(): this {
    const len = this.length();
    if (len > 1e-12) {
      const inv = 1 / len;
      this.x *= inv;
      this.y *= inv;
      this.z *= inv;
    } else {
      this.x = 0;
      this.y = 0;
      this.z = 0;
    }
    return this;
  }

  public lerp(v: IVector3, alpha: number): this {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }

  public lerpVectors(a: IVector3, b: IVector3, alpha: number): this {
    this.x = a.x + (b.x - a.x) * alpha;
    this.y = a.y + (b.y - a.y) * alpha;
    this.z = a.z + (b.z - a.z) * alpha;
    return this;
  }

  public applyMatrix4(m: Matrix4 | Float32Array): this {
    const e = m instanceof Matrix4 ? m.elements : m;
    const x = this.x, y = this.y, z = this.z;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }

  public project(camera: { matrixWorldInverse: Matrix4; projectionMatrix: Matrix4 }): this {
    this.applyMatrix4(camera.matrixWorldInverse);
    this.applyMatrix4(camera.projectionMatrix);
    return this;
  }

  public unproject(camera: { matrixWorldInverse: Matrix4; projectionMatrix: Matrix4 }): this {
    const pv = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    return this.applyMatrix4(pv);
  }

  public applyQuaternion(q: { x: number; y: number; z: number; w: number }): this {
    const x = this.x, y = this.y, z = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }

  public toArray(target: number[] | Float32Array = [], offset = 0): number[] | Float32Array {
    target[offset] = this.x;
    target[offset + 1] = this.y;
    target[offset + 2] = this.z;
    return target;
  }

  public fromArray(source: ArrayLike<number>, offset = 0): this {
    this.x = source[offset];
    this.y = source[offset + 1];
    this.z = source[offset + 2];
    return this;
  }

  public toTuple(): Vec3Tuple {
    return [this.x, this.y, this.z];
  }
}

// ============================================================================
// Vector4: Pure 4D Vector (for velocities, homogeneous coords, colors)
// ============================================================================
export class Vector4 implements IVector4 {
  public x: number;
  public y: number;
  public z: number;
  public w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  public set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  public copy(v: IVector4 | Vec4Tuple | Float32Array): this {
    if (Array.isArray(v) || v instanceof Float32Array) {
      this.x = v[0];
      this.y = v[1];
      this.z = v[2];
      this.w = v[3];
    } else {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      this.w = v.w;
    }
    return this;
  }

  public clone(): Vector4 {
    return new Vector4(this.x, this.y, this.z, this.w);
  }

  public toArray(target: number[] | Float32Array = [], offset = 0): number[] | Float32Array {
    target[offset] = this.x;
    target[offset + 1] = this.y;
    target[offset + 2] = this.z;
    target[offset + 3] = this.w;
    return target;
  }
}

// ============================================================================
// Quaternion: Pure Rotation Quaternion for 6DOF Kinematics
// ============================================================================
export class Quaternion {
  public x: number;
  public y: number;
  public z: number;
  public w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  public set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  public identity(): this {
    return this.set(0, 0, 0, 1);
  }

  public normalize(): this {
    let l = Math.hypot(this.x, this.y, this.z, this.w);
    if (l < 1e-12) {
      return this.identity();
    }
    l = 1 / l;
    this.x *= l;
    this.y *= l;
    this.z *= l;
    this.w *= l;
    return this;
  }

  public setFromAxisAngle(axis: IVector3, angle: number): this {
    const halfAngle = angle * 0.5;
    const s = Math.sin(halfAngle);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(halfAngle);
    return this;
  }

  public multiply(q: Quaternion): this {
    const qax = this.x, qay = this.y, qaz = this.z, qaw = this.w;
    const qbx = q.x, qby = q.y, qbz = q.z, qbw = q.w;
    this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    return this;
  }

  public setFromEuler(x: number, y: number, z: number): this {
    const c1 = Math.cos(x * 0.5), c2 = Math.cos(y * 0.5), c3 = Math.cos(z * 0.5);
    const s1 = Math.sin(x * 0.5), s2 = Math.sin(y * 0.5), s3 = Math.sin(z * 0.5);
    this.x = s1 * c2 * c3 + c1 * s2 * s3;
    this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 - s1 * s2 * c3;
    this.w = c1 * c2 * c3 + s1 * s2 * s3;
    return this;
  }
}

// ============================================================================
// Matrix4: 4x4 Column-Major Matrix for WebGPU & Camera Transformations
// ============================================================================
export class Matrix4 {
  public elements: Float32Array;

  constructor() {
    this.elements = new Float32Array(16);
    this.identity();
  }

  public identity(): this {
    const e = this.elements;
    e.fill(0);
    e[0] = 1; e[5] = 1; e[10] = 1; e[15] = 1;
    return this;
  }

  public set(
    n11: number, n12: number, n13: number, n14: number,
    n21: number, n22: number, n23: number, n24: number,
    n31: number, n32: number, n33: number, n34: number,
    n41: number, n42: number, n43: number, n44: number
  ): this {
    const te = this.elements;
    te[0] = n11; te[4] = n12; te[8] = n13; te[12] = n14;
    te[1] = n21; te[5] = n22; te[9] = n23; te[13] = n24;
    te[2] = n31; te[6] = n32; te[10] = n33; te[14] = n34;
    te[3] = n41; te[7] = n42; te[11] = n43; te[15] = n44;
    return this;
  }

  public copy(m: Matrix4 | Float32Array): this {
    const src = m instanceof Matrix4 ? m.elements : m;
    this.elements.set(src);
    return this;
  }

  public clone(): Matrix4 {
    const m = new Matrix4();
    m.copy(this);
    return m;
  }

  public toArray(target: number[] | Float32Array = [], offset = 0): number[] | Float32Array {
    const te = this.elements;
    for (let i = 0; i < 16; i++) {
      target[offset + i] = te[i];
    }
    return target;
  }

  public lookAt(eye: IVector3, target: IVector3, up: IVector3): this {
    const lookMat = createLookAtMatrix(
      [eye.x, eye.y, eye.z],
      [target.x, target.y, target.z],
      [up.x, up.y, up.z]
    );
    this.elements.set(lookMat);
    return this;
  }

  public perspective(fovRad: number, aspect: number, near: number, far: number): this {
    const persMat = createPerspectiveMatrix(fovRad, aspect, near, far);
    this.elements.set(persMat);
    return this;
  }

  public multiply(m: Matrix4): this {
    return this.multiplyMatrices(this, m);
  }

  public multiplyMatrices(a: Matrix4, b: Matrix4): this {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];

    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return this;
  }

  public invert(): this {
    const te = this.elements;
    const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3];
    const n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
    const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11];
    const n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];

    const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

    if (det === 0) {
      this.identity();
      return this;
    }

    const invDet = 1 / det;

    te[0] = t11 * invDet;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * invDet;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * invDet;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * invDet;

    te[4] = t12 * invDet;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * invDet;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * invDet;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * invDet;

    te[8] = t13 * invDet;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * invDet;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * invDet;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * invDet;

    te[12] = t14 * invDet;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * invDet;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * invDet;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * invDet;

    return this;
  }
}

// ============================================================================
// Perspective Camera: Standalone Camera Object matching Three.js APIs
// ============================================================================
export class PerspectiveCamera {
  public position: Vector3;
  public target: Vector3;
  public up: Vector3;
  public fov: number; // in degrees
  public aspect: number;
  public near: number;
  public far: number;
  public matrixWorldInverse: Matrix4;
  public projectionMatrix: Matrix4;

  constructor(fov = 45, aspect = 1, near = 0.1, far = 1000) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.position = new Vector3(0, 0, 15);
    this.target = new Vector3(0, 0, 0);
    this.up = new Vector3(0, 1, 0);
    this.matrixWorldInverse = new Matrix4();
    this.projectionMatrix = new Matrix4();
    this.updateProjectionMatrix();
    this.updateMatrixWorld();
  }

  public updateProjectionMatrix(): void {
    const fovRad = (this.fov * Math.PI) / 180;
    this.projectionMatrix.perspective(fovRad, this.aspect, this.near, this.far);
  }

  public updateMatrixWorld(): void {
    this.matrixWorldInverse.lookAt(this.position, this.target, this.up);
  }

  public lookAt(target: IVector3 | Vec3Tuple): void {
    if (Array.isArray(target)) {
      this.target.set(target[0], target[1], target[2]);
    } else {
      this.target.copy(target);
    }
    this.updateMatrixWorld();
  }

  public getWorldDirection(target: Vector3 = new Vector3()): Vector3 {
    target.subVectors(this.target, this.position).normalize();
    return target;
  }

  public getWorldPosition(target: Vector3 = new Vector3()): Vector3 {
    target.copy(this.position);
    return target;
  }
}

// ============================================================================
// Pure Spherical & Cartesian Trig Functions
// ============================================================================

/**
 * Converts spherical coordinates (radius, phi, theta) to Cartesian [x, y, z].
 * Convention:
 * - phi: polar angle from +Y axis [0, PI]
 * - theta: azimuthal angle around Y axis [-PI, PI] (0 = +Z)
 */
export function sphericalToCartesian(
  radius: number,
  phi: number,
  theta: number,
  target?: Float32Array | Vec3Tuple
): Float32Array {
  const sinPhi = Math.sin(phi);
  const x = radius * sinPhi * Math.sin(theta);
  const y = radius * Math.cos(phi);
  const z = radius * sinPhi * Math.cos(theta);

  if (target instanceof Float32Array) {
    target[0] = x;
    target[1] = y;
    target[2] = z;
    return target;
  }
  if (Array.isArray(target)) {
    target[0] = x;
    target[1] = y;
    target[2] = z;
    return new Float32Array(target);
  }
  return new Float32Array([x, y, z]);
}

/**
 * Converts Cartesian [x, y, z] to spherical coordinates { radius, phi, theta }.
 */
export function cartesianToSpherical(x: number, y: number, z: number): SphericalCoords {
  const radius = Math.sqrt(x * x + y * y + z * z);
  if (radius < 1e-9) {
    return { radius: 0, phi: 0, theta: 0 };
  }
  const phi = Math.acos(Math.max(-1.0, Math.min(1.0, y / radius)));
  const theta = Math.atan2(x, z);
  return { radius, phi, theta };
}

// ============================================================================
// Matrix Creation Functions (WebGPU & Render Loop Integration)
// ============================================================================

/**
 * Creates a 4x4 View (LookAt) Matrix (Column-major Float32Array(16)).
 */
export function createLookAtMatrix(
  eye: Float32Array | ArrayLike<number>,
  target: Float32Array | ArrayLike<number>,
  up: Float32Array | ArrayLike<number> = [0, 1, 0],
  out?: Float32Array
): Float32Array {
  const m = out || new Float32Array(16);

  const eyex = eye[0], eyey = eye[1], eyez = eye[2];
  const upx = up[0], upy = up[1], upz = up[2];
  const targetx = target[0], targety = target[1], targetz = target[2];

  // zAxis = normalize(eye - target)
  let z0 = eyex - targetx;
  let z1 = eyey - targety;
  let z2 = eyez - targetz;
  let lenZ = Math.hypot(z0, z1, z2);
  if (lenZ < 1e-12) {
    z2 = 1;
    lenZ = 1;
  }
  z0 /= lenZ; z1 /= lenZ; z2 /= lenZ;

  // xAxis = normalize(cross(up, zAxis))
  let x0 = upy * z2 - upz * z1;
  let x1 = upz * z0 - upx * z2;
  let x2 = upx * z1 - upy * z0;
  let lenX = Math.hypot(x0, x1, x2);
  if (lenX < 1e-12) {
    // Up and zAxis are collinear
    x0 = 1; x1 = 0; x2 = 0;
    lenX = 1;
  }
  x0 /= lenX; x1 /= lenX; x2 /= lenX;

  // yAxis = cross(zAxis, xAxis)
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  // Column 0
  m[0] = x0;
  m[1] = y0;
  m[2] = z0;
  m[3] = 0;

  // Column 1
  m[4] = x1;
  m[5] = y1;
  m[6] = z1;
  m[7] = 0;

  // Column 2
  m[8] = x2;
  m[9] = y2;
  m[10] = z2;
  m[11] = 0;

  // Column 3 (Translation)
  m[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
  m[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
  m[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
  m[15] = 1;

  return m;
}

/**
 * Creates a 4x4 Perspective Projection Matrix (Column-major Float32Array(16)).
 * Default produces standard right-handed projection compatible with WebGPU WGSL pipelines.
 */
export function createPerspectiveMatrix(
  fovRad: number,
  aspect: number,
  near: number,
  far: number,
  out?: Float32Array
): Float32Array {
  const m = out || new Float32Array(16);
  m.fill(0);

  const f = 1.0 / Math.tan(fovRad / 2.0);
  const nf = 1.0 / (near - far);

  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1.0;
  m[14] = 2.0 * far * near * nf;
  m[15] = 0.0;

  return m;
}

// ============================================================================
// Ray Unprojection & Point Projection
// ============================================================================

/**
 * Unprojects screen normalized device coordinates (ndcX, ndcY in [-1, 1]) into
 * a world-space ray origin and normalized direction vector.
 */
export function unprojectScreenRay(
  ndcX: number,
  ndcY: number,
  viewMatrix: Float32Array | Matrix4,
  projMatrix: Float32Array | Matrix4,
  camPos?: Float32Array | Vec3Tuple | IVector3
): { rayOrig: Vec3Tuple; rayDir: Vec3Tuple } {
  const vMat = viewMatrix instanceof Matrix4 ? viewMatrix : new Matrix4().copy(viewMatrix);
  const pMat = projMatrix instanceof Matrix4 ? projMatrix : new Matrix4().copy(projMatrix);

  // Compute inverse(P * V) = inverse(V) * inverse(P)
  const pv = new Matrix4().multiplyMatrices(pMat, vMat);
  const invPV = pv.invert();

  // Near point (ndcZ = -1) and Far point (ndcZ = 1)
  const nearPt = new Vector3(ndcX, ndcY, -1.0).applyMatrix4(invPV);
  const farPt = new Vector3(ndcX, ndcY, 1.0).applyMatrix4(invPV);

  const dir = new Vector3().subVectors(farPt, nearPt).normalize();

  let orig: Vec3Tuple;
  if (camPos) {
    if (Array.isArray(camPos) || camPos instanceof Float32Array) {
      orig = [camPos[0], camPos[1], camPos[2]];
    } else {
      orig = [camPos.x, camPos.y, camPos.z];
    }
  } else {
    orig = [nearPt.x, nearPt.y, nearPt.z];
  }

  return {
    rayOrig: orig,
    rayDir: [dir.x, dir.y, dir.z],
  };
}

/**
 * Projects a 3D world-space coordinate to screen pixels or NDC.
 */
export function projectPoint(
  point: IVector3 | Vec3Tuple,
  viewMatrix: Float32Array | Matrix4,
  projMatrix: Float32Array | Matrix4,
  viewportWidth = 1,
  viewportHeight = 1
): { x: number; y: number; z: number; visible: boolean } {
  const px = Array.isArray(point) ? point[0] : point.x;
  const py = Array.isArray(point) ? point[1] : point.y;
  const pz = Array.isArray(point) ? point[2] : point.z;

  const v = new Vector3(px, py, pz);
  const vMat = viewMatrix instanceof Matrix4 ? viewMatrix : new Matrix4().copy(viewMatrix);
  const pMat = projMatrix instanceof Matrix4 ? projMatrix : new Matrix4().copy(projMatrix);

  v.applyMatrix4(vMat);
  const isBehindCamera = v.z > 0; // In right-handed camera space, visible objects have negative Z
  v.applyMatrix4(pMat);

  // v is now in NDC [-1, 1]
  const screenX = ((v.x + 1) * 0.5) * viewportWidth;
  const screenY = ((1 - v.y) * 0.5) * viewportHeight;

  return {
    x: screenX,
    y: screenY,
    z: v.z,
    visible: !isBehindCamera && v.z >= -1 && v.z <= 1.0 + 1e-6,
  };
}

// ============================================================================
// Spherical Slerp Utility
// ============================================================================
export function slerpVec3(
  v1: IVector3 | Vec3Tuple,
  v2: IVector3 | Vec3Tuple,
  t: number
): Vec3Tuple {
  const a = Array.isArray(v1) ? new Vector3(v1[0], v1[1], v1[2]) : new Vector3(v1.x, v1.y, v1.z);
  const b = Array.isArray(v2) ? new Vector3(v2[0], v2[1], v2[2]) : new Vector3(v2.x, v2.y, v2.z);

  a.normalize();
  b.normalize();

  let dot = a.dot(b);
  dot = Math.max(-1.0, Math.min(1.0, dot));

  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (sinOmega < 1e-6) {
    const res = new Vector3().lerpVectors(a, b, t).normalize();
    return [res.x, res.y, res.z];
  }

  const c1 = Math.sin((1 - t) * omega) / sinOmega;
  const c2 = Math.sin(t * omega) / sinOmega;

  const res = new Vector3()
    .addScaledVector(a, c1)
    .addScaledVector(b, c2)
    .normalize();

  return [res.x, res.y, res.z];
}
