// ============================================================================
// File: src/core/physics/PhysicsSolverRegistry.ts
// Architecture: Governed Computational Physics (Registry & GPU Binding Layer)
// Description: Binds physics engines to GPU storage buffers & uniform updates across Modes 0-4
// ============================================================================

import { PhaseFieldFractureSolver } from './PhaseFieldFractureSolver';
import { ShallowWaterFluidSolver } from './ShallowWaterFluidSolver';
import { RigidHingeDymaxionSolver } from './RigidHingeDymaxionSolver';

export interface IPhysicsSolver {
  readonly id: string;
  readonly modeIndex: number;
  initialize(nodeCount: number, positions?: Float32Array): void;
  step(dt: number, time: number, unfurl: number, extraParams?: Record<string, any>): void;
  updateGPUBuffer(interleavedBuffer: Float32Array): void;
  getUniformUpdates(): Float32Array;
  dispose(): void;
}

export interface PhysicsFrameData {
  dt: number;
  time: number;
  unfurl: number;
  mode: number;
  cursorPos?: [number, number, number];
  cursorVel?: [number, number, number];
  cursorIntensity?: number;
}

export class PhysicsSolverRegistry {
  private solvers: Map<number, IPhysicsSolver> = new Map();
  private activeMode: number = 0;
  private nodeCount: number = 1000;

  // Governed Solvers
  public readonly phaseFieldSolver: PhaseFieldFractureSolver;
  public readonly shallowWaterSolver: ShallowWaterFluidSolver;
  public readonly rigidHingeSolver: RigidHingeDymaxionSolver;

  constructor(nodeCount: number = 1000) {
    this.nodeCount = nodeCount;

    this.phaseFieldSolver = new PhaseFieldFractureSolver({ nodeCount });
    this.shallowWaterSolver = new ShallowWaterFluidSolver({ nodeCount });
    this.rigidHingeSolver = new RigidHingeDymaxionSolver();

    this.registerBuiltinAdapters();
  }

  private registerBuiltinAdapters(): void {
    // Mode 2 Adapter: Phase-Field Brittle Fracture
    this.registerSolver({
      id: 'phase-field-fracture',
      modeIndex: 2,
      initialize: (count, pos) => this.phaseFieldSolver.initialize(pos),
      step: (dt, time, unfurl, extra = {}) => {
        this.phaseFieldSolver.step({
          dt,
          time,
          unfurl,
          cursorPos: extra.cursorPos,
          cursorIntensity: extra.cursorIntensity,
          nodePositions: extra.nodePositions,
        });
      },
      updateGPUBuffer: (buffer) => {
        const displacements = this.phaseFieldSolver.getDisplacements();
        const damage = this.phaseFieldSolver.getDamageField();
        const count = Math.min(buffer.length / 16, damage.length);

        for (let i = 0; i < count; i++) {
          const base = i * 16;
          const dispIdx = i * 3;
          // Apply displacement offset to position xyz
          buffer[base + 0] += displacements[dispIdx];
          buffer[base + 1] += displacements[dispIdx + 1];
          buffer[base + 2] += displacements[dispIdx + 2];

          // Store damage factor in velocity metric field
          buffer[base + 7] = damage[i];
        }
      },
      getUniformUpdates: () => new Float32Array([2.0, this.phaseFieldSolver.computeCrackTipFront(0.18)]),
      dispose: () => this.phaseFieldSolver.dispose(),
    });

    // Mode 3 Adapter: 2D Shallow Water Equations Hydrodynamics
    this.registerSolver({
      id: 'shallow-water-hydrodynamics',
      modeIndex: 3,
      initialize: (count, pos) => this.shallowWaterSolver.initialize(pos),
      step: (dt, time, unfurl, extra = {}) => {
        this.shallowWaterSolver.step({
          dt,
          time,
          unfurl,
          cursorPos: extra.cursorPos,
          cursorVel: extra.cursorVel,
          cursorActive: !!extra.cursorPos,
          nodePositions: extra.nodePositions,
        });
      },
      updateGPUBuffer: (buffer) => {
        const vel = this.shallowWaterSolver.getVelocityField();
        const waveH = this.shallowWaterSolver.getWaveHeight();
        const count = Math.min(buffer.length / 16, waveH.length);

        for (let i = 0; i < count; i++) {
          const base = i * 16;
          const velIdx = i * 3;
          // Update particle velocity xyz
          buffer[base + 4] = vel[velIdx];
          buffer[base + 5] = vel[velIdx + 1];
          buffer[base + 6] = vel[velIdx + 2];
          // Update wave height displacement
          buffer[base + 7] = waveH[i];
        }
      },
      getUniformUpdates: () => new Float32Array([3.0, 9.81, 0.001]),
      dispose: () => this.shallowWaterSolver.dispose(),
    });

    // Mode 4 Adapter: Rigid Hinge Dymaxion Folding
    this.registerSolver({
      id: 'rigid-hinge-dymaxion',
      modeIndex: 4,
      initialize: () => this.rigidHingeSolver.initialize(),
      step: (dt, time, unfurl, extra = {}) => {
        this.rigidHingeSolver.step({
          dt,
          time,
          unfurl,
          cursorPos: extra.cursorPos,
        });
      },
      updateGPUBuffer: (buffer) => {
        const facetStates = this.rigidHingeSolver.getFacetStates();
        // Propagate facet rigid transformations
        if (facetStates.length > 0) {
          const archH = this.rigidHingeSolver.computeArchingHeight(0.5);
          buffer[7] = archH;
        }
      },
      getUniformUpdates: () => {
        const L = this.rigidHingeSolver.getTotalAngularMomentum();
        return new Float32Array([4.0, L[0], L[1], L[2]]);
      },
      dispose: () => this.rigidHingeSolver.dispose(),
    });
  }

  public registerSolver(solver: IPhysicsSolver): void {
    this.solvers.set(solver.modeIndex, solver);
  }

  public getSolver(modeIndex: number): IPhysicsSolver | undefined {
    return this.solvers.get(modeIndex);
  }

  public setMode(modeIndex: number): void {
    this.activeMode = modeIndex;
  }

  public get activeModeIndex(): number {
    return this.activeMode;
  }

  public stepActiveSolver(frameData: PhysicsFrameData, nodePositions?: Float32Array): void {
    this.activeMode = frameData.mode;
    const solver = this.solvers.get(this.activeMode);
    if (solver) {
      solver.step(frameData.dt, frameData.time, frameData.unfurl, {
        cursorPos: frameData.cursorPos,
        cursorVel: frameData.cursorVel,
        cursorIntensity: frameData.cursorIntensity,
        nodePositions,
      });
    }
  }

  public bindToGPUBuffer(interleavedBuffer: Float32Array): void {
    const solver = this.solvers.get(this.activeMode);
    if (solver) {
      solver.updateGPUBuffer(interleavedBuffer);
    }
  }

  public getActiveUniforms(): Float32Array {
    const solver = this.solvers.get(this.activeMode);
    return solver ? solver.getUniformUpdates() : new Float32Array([this.activeMode, 0, 0, 0]);
  }

  public dispose(): void {
    this.solvers.forEach((s) => s.dispose());
    this.solvers.clear();
    this.phaseFieldSolver.dispose();
    this.shallowWaterSolver.dispose();
    this.rigidHingeSolver.dispose();
  }
}
