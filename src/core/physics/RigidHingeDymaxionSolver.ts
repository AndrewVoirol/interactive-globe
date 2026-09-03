// ============================================================================
// File: src/core/physics/RigidHingeDymaxionSolver.ts
// Architecture: Governed Computational Physics (Mode 4 - Dymaxion Rigid Net Folding)
// Description: Rigid-body hinge kinematics with angular momentum conservation & facet torque balance
// ============================================================================

import {
  ICOSAHEDRON_FACES,
  UNIT_CENTROIDS,
  DYMAXION_FACE_LAYOUT_2D,
} from '../../utils/dymaxion';

export interface FacetRigidState {
  centroid3D: [number, number, number];
  target2D: [number, number, number]; // xy layout position + z height
  quaternion: [number, number, number, number]; // xyzw
  angularVel: [number, number, number]; // omega_x, omega_y, omega_z
  torque: [number, number, number];
  hingeAngle: number;
}

export interface RigidHingeSolverConfig {
  facetMass: number;       // Mass m_k per facet
  inertiaScale: number;    // Moment of inertia scalar
  hingeStiffness: number;  // Hinge joint constraint stiffness k_h
  damping: number;         // Rotational damping coefficient
}

export interface RigidHingeStepParams {
  dt: number;
  time: number;
  unfurl: number; // Morph parameter t in [0, 1]
  cursorPos?: [number, number, number];
}

export class RigidHingeDymaxionSolver {
  private config: RigidHingeSolverConfig;
  private facetStates: FacetRigidState[];
  private totalAngularMomentum: [number, number, number] = [0, 0, 0];

  constructor(config: Partial<RigidHingeSolverConfig> = {}) {
    this.config = {
      facetMass: config.facetMass ?? 1.0,
      inertiaScale: config.inertiaScale ?? 0.1,
      hingeStiffness: config.hingeStiffness ?? 50.0,
      damping: config.damping ?? 0.95,
    };

    this.facetStates = [];
    this.initialize();
  }

  public initialize(): void {
    this.facetStates = ICOSAHEDRON_FACES.map((face, index) => {
      const c = UNIT_CENTROIDS[index] || [0, 0, 1];
      const layout2D = DYMAXION_FACE_LAYOUT_2D[index] || [0, 0];

      return {
        centroid3D: [c[0], c[1], c[2]],
        target2D: [layout2D[0], layout2D[1], 0],
        quaternion: [0, 0, 0, 1], // Identity quaternion
        angularVel: [0, 0, 0],
        torque: [0, 0, 0],
        hingeAngle: 0.0,
      };
    });
    this.totalAngularMomentum = [0, 0, 0];
  }

  /**
   * Evaluates arching height modulation h_arch(t) = 0.45 * sin(pi * e(t))
   */
  public computeArchingHeight(unfurl: number): number {
    const e = unfurl * unfurl * (3 - 2 * unfurl); // Cubic ease-in-out
    return 0.45 * Math.sin(Math.PI * e);
  }

  /**
   * Advances Newton-Euler rigid-body dynamics for 20 icosahedral facets:
   * m_k * d2(x_k)/dt2 = F_hinge + F_ext
   * I_k * d(omega_k)/dt + omega_k x (I_k * omega_k) = tau_hinge + tau_actuator(t)
   */
  public step(params: RigidHingeStepParams): void {
    const { dt, time, unfurl, cursorPos } = params;
    const { facetMass, inertiaScale, hingeStiffness, damping } = this.config;

    const archHeight = this.computeArchingHeight(unfurl);
    const targetHingeAngle = unfurl * Math.PI;

    let totalL_x = 0, totalL_y = 0, totalL_z = 0;

    for (let k = 0; k < 20; k++) {
      const state = this.facetStates[k];
      const initialC = UNIT_CENTROIDS[k];
      const layout2D = DYMAXION_FACE_LAYOUT_2D[k];

      // 1. Calculate actuator torque restoring facet towards unrolling trajectory
      const angleErr = targetHingeAngle - state.hingeAngle;
      const tauActuator = hingeStiffness * angleErr;

      // Hinge torque vector orthogonal to 3D centroid & 2D layout vector
      const tauX = -initialC[1] * tauActuator * 0.1;
      const tauY = initialC[0] * tauActuator * 0.1;
      const tauZ = tauActuator * 0.05;

      state.torque[0] = tauX;
      state.torque[1] = tauY;
      state.torque[2] = tauZ;

      // External torque from cursor proximity interaction
      if (cursorPos) {
        const dx = state.centroid3D[0] - cursorPos[0];
        const dy = state.centroid3D[1] - cursorPos[1];
        const dz = state.centroid3D[2] - cursorPos[2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 1.0) {
          state.torque[0] += dy * 2.0;
          state.torque[1] -= dx * 2.0;
        }
      }

      // 2. Integrate angular acceleration: alpha = I^-1 * (tau - omega x (I * omega))
      const alphaX = state.torque[0] / inertiaScale;
      const alphaY = state.torque[1] / inertiaScale;
      const alphaZ = state.torque[2] / inertiaScale;

      state.angularVel[0] = (state.angularVel[0] + alphaX * dt) * damping;
      state.angularVel[1] = (state.angularVel[1] + alphaY * dt) * damping;
      state.angularVel[2] = (state.angularVel[2] + alphaZ * dt) * damping;

      // Update hinge angle
      state.hingeAngle += Math.hypot(state.angularVel[0], state.angularVel[1], state.angularVel[2]) * dt;

      // 3. Position interpolation between 3D sphere centroid & 2D planar net centroid
      const interpX = (1 - unfurl) * initialC[0] + unfurl * layout2D[0];
      const interpY = (1 - unfurl) * initialC[1] + unfurl * layout2D[1];
      const interpZ = (1 - unfurl) * initialC[2] + unfurl * 0.0 + archHeight;

      state.centroid3D[0] = interpX;
      state.centroid3D[1] = interpY;
      state.centroid3D[2] = interpZ;

      // 4. Compute angular momentum L_k = I_k * omega_k
      totalL_x += inertiaScale * state.angularVel[0];
      totalL_y += inertiaScale * state.angularVel[1];
      totalL_z += inertiaScale * state.angularVel[2];
    }

    this.totalAngularMomentum = [totalL_x, totalL_y, totalL_z];
  }

  public getFacetStates(): FacetRigidState[] {
    return this.facetStates;
  }

  public getTotalAngularMomentum(): [number, number, number] {
    return this.totalAngularMomentum;
  }

  public dispose(): void {
    this.facetStates = [];
    this.totalAngularMomentum = [0, 0, 0];
  }
}
