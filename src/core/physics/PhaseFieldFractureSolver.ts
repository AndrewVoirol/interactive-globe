// ============================================================================
// File: src/core/physics/PhaseFieldFractureSolver.ts
// Architecture: Governed Computational Physics (Mode 2 - Griffith LEFM)
// Description: Phase-Field continuum fracture dynamics with crack tip propagation
// ============================================================================

export interface PhaseFieldSolverConfig {
  nodeCount: number;
  gc: number;         // Critical strain energy release rate G_c (J/m^2)
  l0: number;         // Crack length scale parameter l_0 (m)
  eta: number;        // Numerical mobility parameter eta (Pa·s)
  yieldStress: number;// Rupture stress threshold sigma_Y (Pa)
}

export interface PhaseFieldStepParams {
  dt: number;
  time: number;
  unfurl: number;
  cursorPos?: [number, number, number];
  cursorIntensity?: number;
  nodePositions?: Float32Array; // 3 * N (xyz)
}

export class PhaseFieldFractureSolver {
  private config: PhaseFieldSolverConfig;
  private damageField: Float32Array;      // Phase variable d in [0, 1]
  private histEnergy: Float32Array;       // Historical max tensile energy H+
  private hoopStresses: Float32Array;     // Westergaard hoop stress sigma_theta_theta
  private displacements: Float32Array;    // 3 * N displacement vectors (xyz)

  constructor(config: Partial<PhaseFieldSolverConfig> = {}) {
    this.config = {
      nodeCount: config.nodeCount || 1000,
      gc: config.gc ?? 2.7,
      l0: config.l0 ?? 0.05,
      eta: config.eta ?? 0.01,
      yieldStress: config.yieldStress ?? 1.5,
    };

    const n = this.config.nodeCount;
    this.damageField = new Float32Array(n);
    this.histEnergy = new Float32Array(n);
    this.hoopStresses = new Float32Array(n);
    this.displacements = new Float32Array(n * 3);
  }

  public initialize(positions?: Float32Array): void {
    this.damageField.fill(0);
    this.histEnergy.fill(0);
    this.hoopStresses.fill(0);
    this.displacements.fill(0);
  }

  /**
   * Calculates Westergaard Mode I near-tip hoop stress sigma_theta_theta(r, theta)
   */
  public computeWestergaardHoopStress(r: number, theta: number, KI: number): number {
    const safeR = Math.max(r, 0.001);
    const factor = KI / Math.sqrt(2 * Math.PI * safeR);
    const halfTheta = theta / 2;
    const angleTerm = Math.cos(halfTheta) * (1 + Math.sin(halfTheta) * Math.sin(1.5 * theta));
    return Math.max(0, factor * angleTerm);
  }

  /**
   * Calculates crack tip propagation latitude boundary phi_crack(t)
   */
  public computeCrackTipFront(time: number): number {
    const tRupture = 0.18;
    if (time < tRupture) return 0;
    const progress = Math.min(1.0, Math.max(0.0, (time - tRupture) / 0.42));
    const smoothProgress = progress * progress * (3 - 2 * progress);
    return (Math.PI / 2) * smoothProgress;
  }

  /**
   * Advances phase-field evolution equation: eta * dot_d = G_c * l_0 * laplacian(d) - (1-d)*H+
   */
  public step(params: PhaseFieldStepParams): void {
    const { dt, time, unfurl, cursorPos, cursorIntensity = 0.0, nodePositions } = params;
    const N = this.config.nodeCount;
    const { gc, l0, eta } = this.config;

    const crackFrontLat = this.computeCrackTipFront(time);
    const tRupture = 0.18;
    const isRuptured = time >= tRupture;

    for (let i = 0; i < N; i++) {
      const idx3 = i * 3;
      let x = 0, y = 0, z = 0;
      if (nodePositions && nodePositions.length >= idx3 + 3) {
        x = nodePositions[idx3];
        y = nodePositions[idx3 + 1];
        z = nodePositions[idx3 + 2];
      }

      // Compute spherical latitude & antimeridian seam proximity
      const norm = Math.hypot(x, y, z) || 1.0;
      const lat = Math.asin(Math.min(1.0, Math.max(-1.0, y / norm)));
      const lon = Math.atan2(x, z);
      const seamDist = Math.abs(Math.abs(lon) - Math.PI);

      // Effective Stress Intensity Factor KI
      let KI = 1.0;
      if (cursorPos) {
        const dx = x - cursorPos[0];
        const dy = y - cursorPos[1];
        const dz = z - cursorPos[2];
        const dCursorSq = dx * dx + dy * dy + dz * dz;
        KI += cursorIntensity * 3.5 * Math.exp(-dCursorSq / 0.5);
      }

      // Westergaard hoop stress calculation
      const r = Math.max(0.01, seamDist);
      const theta = lat;
      const sigmaTheta = this.computeWestergaardHoopStress(r, theta, KI);
      this.hoopStresses[i] = sigmaTheta;

      // Tensile strain energy density Psi_e+
      const seamFactor = Math.max(0, 1.0 - seamDist / 0.75);
      const tensileEnergy = 0.5 * sigmaTheta * sigmaTheta + seamFactor * unfurl * 2.0;

      // Historical maximum energy tracking H+
      if (tensileEnergy > this.histEnergy[i]) {
        this.histEnergy[i] = tensileEnergy;
      }
      const HPlus = this.histEnergy[i];

      // Discrete Laplacian estimate along sphere latitude neighbours
      const currentD = this.damageField[i];
      const laplacianD = -4.0 * currentD + (i > 0 ? this.damageField[i - 1] : currentD) + (i < N - 1 ? this.damageField[i + 1] : currentD);

      // Phase field evolution rhs: max(0, 2*(1-d)*H+/gc - d/l0 + l0*laplacianD)
      const drivingForce = (2 * (1 - currentD) * HPlus) / gc - currentD / l0 + l0 * laplacianD;
      const dotD = Math.max(0, drivingForce / eta);
      let newD = Math.min(1.0, currentD + dotD * dt);

      // Geometric crack tip front enforcement
      if (isRuptured && Math.abs(lat) >= crackFrontLat && seamDist < 0.4) {
        newD = Math.max(newD, Math.min(1.0, (time - tRupture) / 0.35));
      }

      this.damageField[i] = newD;

      // Post-rupture acoustic boundary flutter wave
      const stiffnessFactor = (1 - newD) * (1 - newD);
      let flutterZ = 0;
      if (isRuptured && newD > 0.2) {
        const flutterDecay = Math.exp(-4.2 * (time - tRupture));
        flutterZ = (0.5 * seamFactor + 0.2 * cursorIntensity) * Math.sin(16 * seamDist - 24 * time) * flutterDecay;
      }

      // Compute displacement vector offset
      const outwardDisp = (1.0 - stiffnessFactor) * 0.30;
      this.displacements[idx3] = (x / norm) * outwardDisp;
      this.displacements[idx3 + 1] = (y / norm) * outwardDisp + flutterZ * 0.1;
      this.displacements[idx3 + 2] = (z / norm) * outwardDisp;
    }
  }

  public getDamageField(): Float32Array {
    return this.damageField;
  }

  public getHoopStresses(): Float32Array {
    return this.hoopStresses;
  }

  public getDisplacements(): Float32Array {
    return this.displacements;
  }

  public getStiffnessDecay(nodeIndex: number): number {
    const d = this.damageField[nodeIndex] || 0;
    return (1 - d) * (1 - d);
  }

  public dispose(): void {
    this.damageField = new Float32Array(0);
    this.histEnergy = new Float32Array(0);
    this.hoopStresses = new Float32Array(0);
    this.displacements = new Float32Array(0);
  }
}
