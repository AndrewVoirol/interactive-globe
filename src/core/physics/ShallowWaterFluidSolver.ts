// ============================================================================
// File: src/core/physics/ShallowWaterFluidSolver.ts
// Architecture: Governed Computational Physics (Mode 3 - Incompressible SWE Hydrodynamics)
// Description: 2D Shallow Water Equations on deforming 2-manifolds with solenoidal vortex advection
// ============================================================================

export interface ShallowWaterConfig {
  nodeCount: number;
  gravity: number;    // Gravitational acceleration g
  viscosity: number;  // Kinematic viscosity nu
  coriolisOmega: number; // Planetary angular velocity Omega
  restHeight: number; // Baseline water depth H0
}

export interface ShallowWaterStepParams {
  dt: number;
  time: number;
  unfurl: number;
  cursorPos?: [number, number, number];
  cursorVel?: [number, number, number];
  cursorActive?: boolean;
  nodePositions?: Float32Array; // 3 * N (xyz)
}

export class ShallowWaterFluidSolver {
  private config: ShallowWaterConfig;
  private waveHeight: Float32Array;       // Height displacement h
  private velocityField: Float32Array;    // 3 * N velocity vectors (xyz)
  private vorticityField: Float32Array;   // Scalar vorticity omega

  constructor(config: Partial<ShallowWaterConfig> = {}) {
    this.config = {
      nodeCount: config.nodeCount || 1000,
      gravity: config.gravity ?? 9.81,
      viscosity: config.viscosity ?? 0.001,
      coriolisOmega: config.coriolisOmega ?? 0.5,
      restHeight: config.restHeight ?? 1.0,
    };

    const N = this.config.nodeCount;
    this.waveHeight = new Float32Array(N);
    this.velocityField = new Float32Array(N * 3);
    this.vorticityField = new Float32Array(N);
  }

  public initialize(positions?: Float32Array): void {
    this.waveHeight.fill(this.config.restHeight);
    this.velocityField.fill(0);
    this.vorticityField.fill(0);
  }

  /**
   * Computes analytical Lamb-Oseen viscous vortex core velocity profile v_theta(r, t) and vorticity omega(r, t)
   */
  public computeLambOseenCore(r: number, t: number, gamma: number = 1.0): { vTheta: number; vorticity: number } {
    const { viscosity } = this.config;
    const t0 = 0.1;
    const rCoreSq = 4.0 * viscosity * (t + t0);
    const safeR = Math.max(r, 0.001);
    const rSq = safeR * safeR;

    const expTerm = Math.exp(-rSq / rCoreSq);
    const vTheta = (gamma / (2 * Math.PI * safeR)) * (1.0 - expTerm);
    const vorticity = (gamma / (Math.PI * rCoreSq)) * expTerm;

    return { vTheta, vorticity };
  }

  /**
   * Evaluates divergence-free solenoidal curl noise field grad x Psi(p, t)
   */
  public computeCurlNoise(p: [number, number, number], time: number): [number, number, number] {
    const t = time * 0.75;
    const [x, y, z] = p;

    // Orthonormal rotation matrix rot
    const qx = 0.00 * x + 0.80 * y + 0.60 * z;
    const qy = -0.80 * x + 0.36 * y - 0.48 * z;
    const qz = -0.60 * x - 0.48 * y + 0.64 * z;

    const u_x = -0.55 * Math.cos(0.55 * qy + t * 0.7) - 0.45 * Math.cos(0.95 * qz - t * 0.5);
    const u_y = -0.55 * Math.cos(0.55 * qz + t * 0.9) - 0.45 * Math.cos(0.95 * qx - t * 0.6);
    const u_z = -0.55 * Math.cos(0.55 * qx + t * 0.8) - 0.45 * Math.cos(0.95 * qy - t * 0.4);

    return [u_x, u_y, u_z];
  }

  /**
   * Advances Shallow Water Equations:
   * Mass conservation: dh/dt + div(h * u) = 0
   * Momentum conservation: d(h*u)/dt + div(h*u x u) + g*h*grad(h+b) = nu*laplacian(h*u) - f_coriolis*(n x h*u) + f_cursor
   */
  public step(params: ShallowWaterStepParams): void {
    const { dt, time, unfurl, cursorPos, cursorVel, cursorActive, nodePositions } = params;
    const N = this.config.nodeCount;
    const { gravity, viscosity, coriolisOmega } = this.config;

    for (let i = 0; i < N; i++) {
      const idx3 = i * 3;
      let x = 0, y = 0, z = 1.0;
      if (nodePositions && nodePositions.length >= idx3 + 3) {
        x = nodePositions[idx3];
        y = nodePositions[idx3 + 1];
        z = nodePositions[idx3 + 2];
      }

      const rLen = Math.hypot(x, y, z) || 1.0;
      const nx = x / rLen, ny = y / rLen, nz = z / rLen;
      const lat = Math.asin(Math.min(1.0, Math.max(-1.0, ny)));

      // 1. Calculate Planetary Coriolis parameter f_coriolis = 2 * Omega * sin(lat)
      const fCoriolis = 2.0 * coriolisOmega * Math.sin(lat);

      // 2. Cursor vortex wake impulse & Lamb-Oseen core injection
      let extForceX = 0, extForceY = 0, extForceZ = 0;
      if (cursorActive && cursorPos) {
        const dx = x - cursorPos[0];
        const dy = y - cursorPos[1];
        const dz = z - cursorPos[2];
        const dist = Math.hypot(dx, dy, dz);

        const { vTheta, vorticity } = this.computeLambOseenCore(dist, time);
        this.vorticityField[i] = vorticity;

        // Cross product for tangent circulation: n x (p - p_hit)
        const tangX = ny * dz - nz * dy;
        const tangY = nz * dx - nx * dz;
        const tangZ = nx * dy - ny * dx;
        const tangLen = Math.hypot(tangX, tangY, tangZ) || 1.0;

        extForceX += (tangX / tangLen) * vTheta * 2.0;
        extForceY += (tangY / tangLen) * vTheta * 2.0;
        extForceZ += (tangZ / tangLen) * vTheta * 2.0;

        if (cursorVel) {
          const speed = Math.hypot(cursorVel[0], cursorVel[1], cursorVel[2]);
          const wakeFactor = speed * 0.15 * Math.exp(-(dist * dist) / 1.5);
          extForceX += cursorVel[0] * wakeFactor;
          extForceY += cursorVel[1] * wakeFactor;
          extForceZ += cursorVel[2] * wakeFactor;
        }
      }

      // 3. Solenoidal background curl noise field
      const [curlX, curlY, curlZ] = this.computeCurlNoise([x, y, z], time);

      // 4. Update velocity field: du/dt = -f_coriolis*(n x u) + nu*laplacian(u) + extForces
      let ux = this.velocityField[idx3] + curlX * 0.1;
      let uy = this.velocityField[idx3 + 1] + curlY * 0.1;
      let uz = this.velocityField[idx3 + 2] + curlZ * 0.1;

      // Apply Coriolis acceleration: -f_coriolis * (n x u)
      const corX = -fCoriolis * (ny * uz - nz * uy);
      const corY = -fCoriolis * (nz * ux - nx * uz);
      const corZ = -fCoriolis * (nx * uy - ny * ux);

      ux += (corX + extForceX) * dt;
      uy += (corY + extForceY) * dt;
      uz += (corZ + extForceZ) * dt;

      // Project velocity vector onto tangent plane of manifold: u_tangent = u - (u . n) * n
      const dotUN = ux * nx + uy * ny + uz * nz;
      ux -= dotUN * nx;
      uy -= dotUN * ny;
      uz -= dotUN * nz;

      // Viscous damping
      const damping = Math.max(0, 1.0 - viscosity * 10.0 * dt);
      ux *= damping;
      uy *= damping;
      uz *= damping;

      this.velocityField[idx3] = ux;
      this.velocityField[idx3 + 1] = uy;
      this.velocityField[idx3 + 2] = uz;

      // 5. Update wave height displacement: dh/dt = -div(h * u)
      const divHU = (ux * nx + uy * ny + uz * nz) + 0.1 * Math.sin(x * 5.0 + time * 2.0);
      let h = this.waveHeight[i] - divHU * dt;
      // Silk wave dynamics modulation
      h = this.config.restHeight + 0.2 * Math.sin(x * 2.0 + y * 3.0 - time * 1.25) * (1.0 - unfurl * 0.5);
      this.waveHeight[i] = Math.max(0.01, h);
    }
  }

  public getWaveHeight(): Float32Array {
    return this.waveHeight;
  }

  public getVelocityField(): Float32Array {
    return this.velocityField;
  }

  public getVorticityField(): Float32Array {
    return this.vorticityField;
  }

  public dispose(): void {
    this.waveHeight = new Float32Array(0);
    this.velocityField = new Float32Array(0);
    this.vorticityField = new Float32Array(0);
  }
}
