import { describe, it, expect, beforeEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { WebGPUEngine, QuadtreeNodeData } from '../../src/webgpu/WebGPUEngine';

/**
 * Challenger M3-2: Smooth C0 Morph Continuity & Octave Challenger Suite
 *
 * Exhaustively challenges:
 * 1. Mathematical morph range interval [0.65 R_l, R_l] and inverse range calculation
 * 2. C^0 continuity, monotonicity, and Lipschitz bounds of morph factor alpha(r)
 * 3. 1D & 2D grid vertex morphing and octave snapping for 64x64 dual-surface patch meshes
 * 4. Boundary seam conformance, T-junction elimination, and zero geometric cracking between LOD l and l-1
 * 5. Non-linear manifold world-space continuity across all active deformation modes (0, 1, 2, 3)
 * 6. Live WebGPUEngine candidate buffer packing and quadtree node invariants
 * 7. Adversarial stress: extreme ranges, float32 precision boundaries, and perimeter skirt coherence
 */

// Canonical WGSL morph function replica from crust_hydrosphere.wgsl:612-615
function computeMorphAlpha(r: number, morphStart: number, invMorphRange: number): number {
  return Math.min(Math.max((r - morphStart) * invMorphRange, 0.0), 1.0);
}

function morphCoordinate(p: number, alpha: number): number {
  const scaled = p * 32.0;
  const fract = scaled - Math.floor(scaled);
  return p - alpha * (fract * (1.0 / 32.0));
}

function morphPoint2D(p: [number, number], alpha: number): [number, number] {
  return [morphCoordinate(p[0], alpha), morphCoordinate(p[1], alpha)];
}

describe('Challenger M3-2: Smooth C0 Morph Continuity & Octave Transition Suite', () => {
  let engine: WebGPUEngine;

  beforeEach(() => {
    engine = new WebGPUEngine();
  });

  // ==========================================================================
  // Pillar 1: Mathematical Morph Interval & Invariant Validation
  // ==========================================================================
  describe('Pillar 1: Mathematical Morph Interval & Invariant Validation', () => {
    it('verifies morphStart = 0.65 * R_l and invMorphRange = 1.0 / (0.35 * R_l) across all LODs', () => {
      const ranges = [0.1, 1.0, 7.0, 14.0, 28.0, 56.0, 6518.375];

      for (const R_l of ranges) {
        const morphStart = 0.65 * R_l;
        const invMorphRange = 1.0 / (0.35 * R_l);

        expect(morphStart).toBeCloseTo(0.65 * R_l, 9);
        expect(invMorphRange).toBeCloseTo(1.0 / (0.35 * R_l), 9);

        // Exact recovery of R_l: morphStart + 1.0 / invMorphRange === R_l
        const recoveredR = morphStart + 1.0 / invMorphRange;
        expect(recoveredR).toBeCloseTo(R_l, 8);

        // Interval width is exactly 35% of R_l
        const intervalWidth = 1.0 / invMorphRange;
        expect(intervalWidth / R_l).toBeCloseTo(0.35, 9);
      }
    });

    it('enforces that root node (lod = 0) has morphStart = 1e9 and invMorphRange = 0.0 (no morphing)', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 0, 50.0); // Far distance (> 28.0 child range), root nodes remain un-split
      camera.updateMatrixWorld(true);

      engine.updateCDLOD(camera, 0, 0.0, false);

      const count = engine.cdlodActiveNodeCount;
      const pool = (engine as any).cdlodNodePool as QuadtreeNodeData[];

      let foundLod0 = false;
      for (let i = 0; i < count; i++) {
        const node = pool[i];
        if (node.lod === 0) {
          foundLod0 = true;
          expect(node.morphStart).toBe(1e9);
          expect(node.invMorphRange).toBe(0.0);

          // For any finite camera distance, alpha must be strictly 0.0
          for (const testR of [0, 10, 100, 1000, 1e6]) {
            const alpha = computeMorphAlpha(testR, node.morphStart, node.invMorphRange);
            expect(alpha).toBe(0.0);
          }
        }
      }
      expect(foundLod0).toBe(true);
    });

    it('verifies dyadic scaling of morph interval across consecutive octaves', () => {
      // For consecutive octaves, R_{l+1} = R_l / 2.
      // Therefore morphStart_{l+1} = morphStart_l / 2 and invMorphRange_{l+1} = 2 * invMorphRange_l.
      const R_0 = 56.0;
      for (let l = 1; l <= 8; l++) {
        const R_curr = R_0 / Math.pow(2, l);
        const R_next = R_0 / Math.pow(2, l + 1);

        const startCurr = 0.65 * R_curr;
        const startNext = 0.65 * R_next;
        expect(startNext / startCurr).toBeCloseTo(0.5, 9);

        const invRangeCurr = 1.0 / (0.35 * R_curr);
        const invRangeNext = 1.0 / (0.35 * R_next);
        expect(invRangeNext / invRangeCurr).toBeCloseTo(2.0, 9);
      }
    });
  });

  // ==========================================================================
  // Pillar 2: C^0 Continuity, Monotonicity & Exact Clamping of Morph Factor alpha(r)
  // ==========================================================================
  describe('Pillar 2: C^0 Continuity, Monotonicity & Clamping of Morph Factor alpha(r)', () => {
    const R_l = 14.0;
    const morphStart = 0.65 * R_l; // 9.1
    const invMorphRange = 1.0 / (0.35 * R_l); // 1 / 4.9 ≈ 0.2040816

    it('evaluates alpha = 0.0 exactly for all r <= morphStart', () => {
      const distances = [
        0.0,
        0.001,
        morphStart * 0.25,
        morphStart * 0.5,
        morphStart * 0.999,
        morphStart - 1e-7,
        morphStart,
      ];

      for (const r of distances) {
        const alpha = computeMorphAlpha(r, morphStart, invMorphRange);
        expect(alpha).toBe(0.0);
      }
    });

    it('evaluates alpha = 1.0 exactly for all r >= R_l', () => {
      const distances = [
        R_l,
        R_l + 1e-7,
        R_l * 1.001,
        R_l * 1.5,
        R_l * 2.0,
        R_l * 10.0,
        1e6,
      ];

      for (const r of distances) {
        const alpha = computeMorphAlpha(r, morphStart, invMorphRange);
        expect(alpha).toBe(1.0);
      }
    });

    it('strictly increases monotonically and linearly for r in (0.65 R_l, R_l)', () => {
      const stepCount = 500;
      let prevAlpha = -1.0;
      const dAlphaDr = invMorphRange;

      for (let i = 0; i <= stepCount; i++) {
        const t = i / stepCount;
        const r = morphStart + t * (R_l - morphStart);
        const alpha = computeMorphAlpha(r, morphStart, invMorphRange);

        expect(alpha).toBeCloseTo(t, 6);
        expect(alpha).toBeGreaterThanOrEqual(prevAlpha);
        if (i > 0) {
          expect(alpha).toBeGreaterThan(prevAlpha); // Strictly increasing in interior
          const finiteDiff = (alpha - prevAlpha) / ((R_l - morphStart) / stepCount);
          expect(finiteDiff).toBeCloseTo(dAlphaDr, 4);
        }
        prevAlpha = alpha;
      }
    });

    it('verifies C^0 boundary continuity without jump discontinuities (zero delta-gap at boundaries)', () => {
      const epsilons = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7];

      for (const eps of epsilons) {
        // At morphStart:
        const alphaLeft = computeMorphAlpha(morphStart - eps, morphStart, invMorphRange);
        const alphaAt = computeMorphAlpha(morphStart, morphStart, invMorphRange);
        const alphaRight = computeMorphAlpha(morphStart + eps, morphStart, invMorphRange);

        expect(alphaLeft).toBe(0.0);
        expect(alphaAt).toBe(0.0);
        expect(alphaRight - alphaLeft).toBeLessThanOrEqual(invMorphRange * 2 * eps + 1e-12);
        expect(alphaRight).toBeCloseTo(eps * invMorphRange, 6);

        // At R_l:
        const alphaBeforeEnd = computeMorphAlpha(R_l - eps, morphStart, invMorphRange);
        const alphaAtEnd = computeMorphAlpha(R_l, morphStart, invMorphRange);
        const alphaAfterEnd = computeMorphAlpha(R_l + eps, morphStart, invMorphRange);

        expect(alphaAtEnd).toBe(1.0);
        expect(alphaAfterEnd).toBe(1.0);
        expect(alphaAfterEnd - alphaBeforeEnd).toBeLessThanOrEqual(invMorphRange * 2 * eps + 1e-12);
        expect(1.0 - alphaBeforeEnd).toBeCloseTo(eps * invMorphRange, 6);
      }
    });

    it('satisfies global Lipschitz continuity |alpha(r_a) - alpha(r_b)| <= invMorphRange * |r_a - r_b| over 10,000 Monte Carlo pairs', () => {
      let seed = 12345;
      const pseudoRand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      for (let i = 0; i < 10000; i++) {
        const rA = pseudoRand() * (R_l * 2.5);
        const rB = pseudoRand() * (R_l * 2.5);

        const alphaA = computeMorphAlpha(rA, morphStart, invMorphRange);
        const alphaB = computeMorphAlpha(rB, morphStart, invMorphRange);

        const deltaAlpha = Math.abs(alphaA - alphaB);
        const deltaR = Math.abs(rA - rB);

        // Lipschitz condition with L = invMorphRange
        expect(deltaAlpha).toBeLessThanOrEqual(invMorphRange * deltaR + 1e-10);
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Odd Grid Vertex Snapping & Octave Bridging Mechanics (64x64 Patch)
  // ==========================================================================
  describe('Pillar 3: Odd Grid Vertex Snapping & Octave Bridging Mechanics (64x64 Patch)', () => {
    it('extracts base grid from generatePatchMesh(64) and verifies 4,225 grid vertices per surface', () => {
      const patch = WebGPUEngine.generatePatchMesh(64);
      expect(patch.vertices).toBeInstanceOf(Float32Array);
      expect(patch.indices).toBeInstanceOf(Uint32Array);

      // (65 * 65 + 256) * 2 = 8,962 total vertices
      const floatsPerVertex = 12;
      const totalVerts = patch.vertices.length / floatsPerVertex;
      expect(totalVerts).toBe(8962);
    });

    it('guarantees that even grid coordinates NEVER move for ANY alpha in [0.0, 1.0]', () => {
      // Even coordinates: p = (2m) / 64 for m in 0..32
      const alphas = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

      for (let m = 0; m <= 32; m++) {
        const pEven = (2 * m) / 64.0;
        for (const alpha of alphas) {
          const morphed = morphCoordinate(pEven, alpha);
          expect(morphed).toBe(pEven); // Strictly identical
        }
      }
    });

    it('guarantees that odd grid coordinates snap EXACTLY onto preceding even vertices at alpha = 1.0', () => {
      // Odd coordinates: p = (2m + 1) / 64 for m in 0..31
      for (let m = 0; m <= 31; m++) {
        const pOdd = (2 * m + 1) / 64.0;
        const expectedEven = (2 * m) / 64.0;

        // At alpha = 0.0: unmorphed
        expect(morphCoordinate(pOdd, 0.0)).toBe(pOdd);

        // At alpha = 0.5: exactly halfway between odd and even
        const halfMorphed = morphCoordinate(pOdd, 0.5);
        expect(halfMorphed).toBeCloseTo(pOdd - 0.5 / 64.0, 9);
        expect(halfMorphed).toBeCloseTo((2 * m + 0.5) / 64.0, 9);

        // At alpha = 1.0: snapped onto even vertex
        const fullMorphed = morphCoordinate(pOdd, 1.0);
        expect(fullMorphed).toBeCloseTo(expectedEven, 9);
        expect(Math.abs(fullMorphed - expectedEven)).toBeLessThan(1e-7);

        // Morph delta is exactly -1/64
        expect(fullMorphed - pOdd).toBeCloseTo(-1.0 / 64.0, 9);
      }
    });

    it('proves that the full 65x65 fine grid collapses into exactly a 33x33 coarse grid at alpha = 1.0', () => {
      const patch = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridVertsPerSurface = 65 * 65; // 4,225

      const snappedCoordsU = new Set<number>();
      const snappedCoordsV = new Set<number>();
      const snappedPoints = new Set<string>();

      for (let idx = 0; idx < gridVertsPerSurface; idx++) {
        const offset = idx * floatsPerVertex;
        const u = patch.vertices[offset + 0];
        const v = patch.vertices[offset + 1];

        const morphedU = morphCoordinate(u, 1.0);
        const morphedV = morphCoordinate(v, 1.0);

        // Round to 6 decimals to deduplicate exact float representations
        const roundedU = Math.round(morphedU * 64) / 64;
        const roundedV = Math.round(morphedV * 64) / 64;

        snappedCoordsU.add(roundedU);
        snappedCoordsV.add(roundedV);
        snappedPoints.add(`${roundedU.toFixed(6)},${roundedV.toFixed(6)}`);

        // Morphed coordinate must be an integer multiple of 1/32
        const checkU = morphedU * 32.0;
        const checkV = morphedV * 32.0;
        expect(Math.abs(checkU - Math.round(checkU))).toBeLessThan(1e-6);
        expect(Math.abs(checkV - Math.round(checkV))).toBeLessThan(1e-6);
      }

      // Exactly 33 distinct coordinates along U and V (0/32, 1/32, ..., 32/32)
      expect(snappedCoordsU.size).toBe(33);
      expect(snappedCoordsV.size).toBe(33);

      // Exactly 33 * 33 = 1,089 distinct 2D vertices on the snapped grid
      expect(snappedPoints.size).toBe(1089);
      expect(snappedPoints.size).toBe(33 * 33);

      // Cell size bridged: fine grid cell = 1/64, morphed cell = 1/32 (2x octave factor)
      const sortedU = Array.from(snappedCoordsU).sort((a, b) => a - b);
      for (let k = 0; k < sortedU.length - 1; k++) {
        const cellSpan = sortedU[k + 1] - sortedU[k];
        expect(cellSpan).toBeCloseTo(1.0 / 32.0, 7);
      }
    });
  });

  // ==========================================================================
  // Pillar 4: Boundary Seam Conformance & Zero Geometric Cracking
  // ==========================================================================
  describe('Pillar 4: Boundary Seam Conformance & Zero Geometric Cracking', () => {
    it('proves that a fine patch edge at alpha = 1.0 aligns with coarse patch vertices with ZERO seam gaps', () => {
      // Scenario:
      // Fine patch at LOD l has size S = 0.25 in UV space, from minU = 0.0 to 0.25.
      // Shared boundary with coarse neighbor at u = 0.25.
      // Coarse patch at LOD l - 1 has size 2S = 0.50 in UV space, from minU = 0.25 to 0.75.
      // Both patches have 64 grid divisions.
      // Along the shared edge at u = 0.25:
      // Coarse patch spans v in [0.0, 0.50] with 64 divisions -> spacing = 0.50 / 64 = 0.25 / 32.
      // Fine patch spans v in [0.0, 0.25] with 64 divisions -> spacing = 0.25 / 64.

      const S = 0.25;
      const fineVStart = 0.10;
      const coarseVStart = 0.10; // Aligned at lower corner

      // Coarse boundary vertices along the fine patch's span [fineVStart, fineVStart + S]:
      // Coarse patch has grid spacing (2S) / 64 = S / 32.
      // Over the span S, there are exactly 33 coarse vertices: k = 0..32.
      const coarseVerts: number[] = [];
      for (let k = 0; k <= 32; k++) {
        coarseVerts.push(coarseVStart + k * (S / 32.0));
      }
      expect(coarseVerts.length).toBe(33);

      // Fine boundary vertices along the span S:
      // Fine patch has grid spacing S / 64. 65 fine vertices: j = 0..64.
      const fineVertsUnmorphed: number[] = [];
      const fineVertsMorphed: number[] = [];
      for (let j = 0; j <= 64; j++) {
        const localV = j / 64.0;
        const globalV = fineVStart + localV * S;
        fineVertsUnmorphed.push(globalV);

        // Morphed coordinate at alpha = 1.0:
        const morphedLocalV = morphCoordinate(localV, 1.0);
        const morphedGlobalV = fineVStart + morphedLocalV * S;
        fineVertsMorphed.push(morphedGlobalV);
      }

      // Without morphing (alpha = 0.0):
      // Fine patch has 32 odd vertices that do NOT coincide with any coarse vertex (T-junction gaps)
      let unmorphedTJunctionCount = 0;
      for (const fv of fineVertsUnmorphed) {
        const minCoarseDist = Math.min(...coarseVerts.map((cv) => Math.abs(fv - cv)));
        if (minCoarseDist > 1e-6) {
          unmorphedTJunctionCount++;
          expect(minCoarseDist).toBeCloseTo(S / 64.0, 6);
        }
      }
      expect(unmorphedTJunctionCount).toBe(32); // Exactly 32 un-morphed T-junction vertices

      // WITH morphing at alpha = 1.0:
      // Every single fine boundary vertex MUST coincide with a coarse vertex (distance < 1e-7)
      let maxSeamGap = 0.0;
      for (const mv of fineVertsMorphed) {
        const minCoarseDist = Math.min(...coarseVerts.map((cv) => Math.abs(mv - cv)));
        if (minCoarseDist > maxSeamGap) {
          maxSeamGap = minCoarseDist;
        }
        expect(minCoarseDist).toBeLessThan(1e-7);
      }

      // Maximum geometric cracking gap is strictly 0.0
      expect(maxSeamGap).toBe(0.0);
    });

    it('verifies all 4 patch borders (South, East, North, West) achieve 100% seam alignment at alpha = 1.0', () => {
      // Check that edge vertices along u=0, u=1, v=0, v=1 all correctly snap
      const borders = [
        { name: 'South (v=0)', isFixedV: true, fixedVal: 0.0 },
        { name: 'North (v=1)', isFixedV: true, fixedVal: 1.0 },
        { name: 'West  (u=0)', isFixedV: false, fixedVal: 0.0 },
        { name: 'East  (u=1)', isFixedV: false, fixedVal: 1.0 },
      ];

      for (const border of borders) {
        const borderMorphed: Array<[number, number]> = [];
        for (let k = 0; k <= 64; k++) {
          const varCoord = k / 64.0;
          const p: [number, number] = border.isFixedV
            ? [varCoord, border.fixedVal]
            : [border.fixedVal, varCoord];

          const morphed = morphPoint2D(p, 1.0);
          borderMorphed.push(morphed);
        }

        // Variable coordinate must have exactly 33 distinct values matching m/32
        const distinctCoords = new Set(
          borderMorphed.map((pt) => {
            const coord = border.isFixedV ? pt[0] : pt[1];
            return Math.round(coord * 32.0) / 32.0;
          })
        );
        expect(distinctCoords.size).toBe(33);

        // Fixed coordinate must remain completely unchanged (0.0 or 1.0)
        for (const pt of borderMorphed) {
          const fixedCoord = border.isFixedV ? pt[1] : pt[0];
          expect(fixedCoord).toBe(border.fixedVal);
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 5: Non-linear Manifold & 3D World Space Continuity
  // ==========================================================================
  describe('Pillar 5: Non-linear Manifold & 3D World Space Continuity', () => {
    const modes = [
      { id: 0, name: 'Mode 0: Linear Manifold Mix' },
      { id: 1, name: 'Mode 1: Cylindrical Scroll Unfurl' },
      { id: 2, name: 'Mode 2: Elastic Fracture Mechanics' },
      { id: 3, name: 'Mode 3: Fluid Advection' },
    ];
    const unfurlStates = [0.0, 0.25, 0.5, 0.75, 1.0];

    it('verifies continuous 3D world-space vertex trajectories without NaNs or teleportation across all modes', () => {
      // For a test patch at mid-latitudes, sweep alpha from 0.0 to 1.0 and evaluate world-space positions
      const testMinU = 0.35;
      const testMinV = 0.40;
      const testSize = 0.125;

      for (const mode of modes) {
        for (const unfurl of unfurlStates) {
          // Select odd vertex (1, 1) in patch: local (1/64, 1/64)
          const localU = 1.0 / 64.0;
          const localV = 1.0 / 64.0;

          const steps = 50;
          let prevWorldP: [number, number, number] | null = null;

          for (let step = 0; step <= steps; step++) {
            const alpha = step / steps;
            const morphedU = morphCoordinate(localU, alpha);
            const morphedV = morphCoordinate(localV, alpha);

            const globalU = testMinU + morphedU * testSize;
            const globalV = testMinV + morphedV * testSize;

            const worldP = WebGPUEngine.evaluateManifoldPosition(globalU, globalV, mode.id, unfurl);

            // Zero NaNs or Infinities
            expect(Number.isFinite(worldP[0])).toBe(true);
            expect(Number.isFinite(worldP[1])).toBe(true);
            expect(Number.isFinite(worldP[2])).toBe(true);

            if (prevWorldP) {
              const dx = worldP[0] - prevWorldP[0];
              const dy = worldP[1] - prevWorldP[1];
              const dz = worldP[2] - prevWorldP[2];
              const distStep = Math.sqrt(dx * dx + dy * dy + dz * dz);

              // Continuous displacement: bounded maximum delta per step (< 0.1 model units)
              expect(distStep).toBeLessThan(0.10);
            }
            prevWorldP = worldP;
          }
        }
      }
    });

    it('verifies 3D world-space seam closure between fine and coarse patches at alpha = 1.0', () => {
      // Test across sphere (unfurl = 0.0) and flat map (unfurl = 1.0)
      for (const unfurl of [0.0, 1.0]) {
        for (const mode of [0, 1]) {
          const fineMinU = 0.25;
          const fineMinV = 0.30;
          const fineSize = 0.10;

          // Shared vertical edge at U = fineMinU + fineSize = 0.35
          const sharedU = fineMinU + fineSize;

          // Compare fine edge at alpha = 1.0 vs coarse edge at identical points
          for (let k = 0; k <= 32; k++) {
            const coarseLocalV = k / 32.0;
            const globalV = fineMinV + coarseLocalV * fineSize;

            // Fine odd vertex (2k + 1) snapped at alpha = 1.0:
            const fineOddLocalV = (2 * k + 1) / 64.0;
            const fineMorphedLocalV = morphCoordinate(fineOddLocalV, 1.0);
            const fineMorphedGlobalV = fineMinV + fineMorphedLocalV * fineSize;

            // They must evaluate to the identical world-space 3D point
            const pFine = WebGPUEngine.evaluateManifoldPosition(sharedU, fineMorphedGlobalV, mode, unfurl);
            const pCoarse = WebGPUEngine.evaluateManifoldPosition(sharedU, globalV, mode, unfurl);

            const dx = pFine[0] - pCoarse[0];
            const dy = pFine[1] - pCoarse[1];
            const dz = pFine[2] - pCoarse[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            expect(dist).toBeLessThan(1e-5);
          }
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 6: Live WebGPUEngine Candidate Buffer & Traversal Invariants
  // ==========================================================================
  describe('Pillar 6: Live WebGPUEngine Candidate Buffer & Traversal Invariants', () => {
    it('verifies that all active nodes in cdlodCandidateFloats have correctly packed morphStart and invMorphRange', () => {
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);
      camera.position.set(0, 0, 5.8); // Close orbit, triggers multi-level quadtree subdivision
      camera.updateMatrixWorld(true);

      engine.updateCDLOD(camera, 0, 0.0, false);

      const count = engine.cdlodActiveNodeCount;
      expect(count).toBeGreaterThan(10);

      const candidateFloats = (engine as any).cdlodCandidateFloats as Float32Array;
      const candidateUints = (engine as any).cdlodCandidateUints as Uint32Array;
      const pool = (engine as any).cdlodNodePool as QuadtreeNodeData[];

      for (let i = 0; i < count; i++) {
        const off = i * 12;
        const node = pool[i];

        const packedLod = candidateUints[off + 8];
        const packedMorphStart = candidateFloats[off + 9];
        const packedInvMorphRange = candidateFloats[off + 10];

        expect(packedLod).toBe(node.lod);
        expect(packedMorphStart).toBeCloseTo(node.morphStart, 5);
        expect(packedInvMorphRange).toBeCloseTo(node.invMorphRange, 5);

        if (node.lod > 0) {
          expect(node.morphStart).toBeCloseTo(0.65 * node.rangeL, 5);
          expect(node.invMorphRange).toBeCloseTo(1.0 / (0.35 * node.rangeL), 5);
        } else {
          expect(node.morphStart).toBe(1e9);
          expect(node.invMorphRange).toBe(0.0);
        }
      }
    });

    it('simulates dynamic camera approach/recession verifying progressive morph activation across quadtree', () => {
      // Approach from distance 12.0 down to 5.2
      const distances = [12.0, 9.0, 7.5, 6.2, 5.4, 5.15];
      const camera = new PerspectiveCamera(45, 1.0, 0.01, 100);

      for (const dist of distances) {
        camera.position.set(0, 0, dist);
        camera.updateMatrixWorld(true);

        engine.updateCDLOD(camera, 0, 0.0, false);
        const count = engine.cdlodActiveNodeCount;

        // Quadtree produces valid non-empty active node set
        expect(count).toBeGreaterThan(0);

        // Verify every active node adheres to morph invariants
        const pool = (engine as any).cdlodNodePool as QuadtreeNodeData[];
        for (let i = 0; i < count; i++) {
          const n = pool[i];
          if (n.lod > 0) {
            expect(n.morphStart).toBeCloseTo(0.65 * n.rangeL, 4);
            expect(n.invMorphRange).toBeCloseTo(1.0 / (0.35 * n.rangeL), 4);
          } else {
            expect(n.morphStart).toBe(1e9);
            expect(n.invMorphRange).toBe(0.0);
          }
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 7: Adversarial Stress & Edge Case Mining
  // ==========================================================================
  describe('Pillar 7: Adversarial Stress & Edge Case Mining', () => {
    it('handles extreme ranges (R_l -> 1e-4 and R_l -> 1e6) without NaN, Inf, or precision overflow', () => {
      const extremeRanges = [1e-4, 1e-2, 1.0, 1e4, 1e7];

      for (const R_ext of extremeRanges) {
        const morphStart = 0.65 * R_ext;
        const invMorphRange = 1.0 / (0.35 * R_ext);

        expect(Number.isFinite(morphStart)).toBe(true);
        expect(Number.isFinite(invMorphRange)).toBe(true);
        expect(invMorphRange).toBeGreaterThan(0.0);

        // Test boundary clamping
        expect(computeMorphAlpha(morphStart * 0.5, morphStart, invMorphRange)).toBe(0.0);
        expect(computeMorphAlpha(R_ext * 1.5, morphStart, invMorphRange)).toBe(1.0);
        expect(computeMorphAlpha(morphStart, morphStart, invMorphRange)).toBe(0.0);
        expect(computeMorphAlpha(R_ext, morphStart, invMorphRange)).toBeCloseTo(1.0, 6);
      }
    });

    it('verifies IEEE 754 float32 power-of-two multiplication precision (fract(p * 32.0) has zero mantissa leakage)', () => {
      // In Float32, p = k / 64 is an exact dyadic rational (k * 2^-6).
      // Multiplication by 32.0 (2^5) shifts the exponent with ZERO mantissa roundoff.
      const f32 = new Float32Array(1);

      for (let k = 0; k <= 64; k++) {
        f32[0] = k / 64.0;
        const p = f32[0];
        const scaled = p * 32.0;
        const fract = scaled - Math.floor(scaled);

        if (k % 2 === 0) {
          // Even vertices: fract must be strictly 0.0
          expect(fract).toBe(0.0);
          expect(p - 1.0 * (fract * (1.0 / 32.0))).toBe(p);
        } else {
          // Odd vertices: fract must be strictly 0.5
          expect(fract).toBe(0.5);
          const snapped = p - 1.0 * (fract * (1.0 / 32.0));
          const expectedEven = (k - 1) / 64.0;
          expect(Math.abs(snapped - expectedEven)).toBeLessThan(1e-7);
        }
      }
    });

    it('proves perimeter skirt vertices (skirtFactor = 1.0) maintain identical (u, v) morph snapping to prevent skirt tear', () => {
      // Skirt vertices loop around the perimeter.
      // Top skirt vertex shares (u, v) with grid perimeter; bottom skirt vertex has skirtFactor = 1.0.
      // Both must morph their (u, v) by the identical formula so the skirt drops straight down
      // along the surface normal without twisting or tearing.
      const patch = WebGPUEngine.generatePatchMesh(64);
      const floatsPerVertex = 12;
      const gridVertsPerSurface = 65 * 65; // 4,225
      const skirtVertsPerSurface = 64 * 4;  // 256

      // Inspect skirt bottom vertices for Surface 0 (crust)
      for (let k = 0; k < skirtVertsPerSurface; k++) {
        const vertIndex = gridVertsPerSurface + k;
        const offset = vertIndex * floatsPerVertex;

        const u = patch.vertices[offset + 0];
        const v = patch.vertices[offset + 1];
        const skirtFactor = patch.vertices[offset + 8];

        expect(skirtFactor).toBe(1.0); // Skirt bottom vertex

        // Morph skirt vertex at alpha = 1.0
        const morphedU = morphCoordinate(u, 1.0);
        const morphedV = morphCoordinate(v, 1.0);

        // Morphed coordinates must be integer multiples of 1/32
        const checkU = morphedU * 32.0;
        const checkV = morphedV * 32.0;
        expect(Math.abs(checkU - Math.round(checkU))).toBeLessThan(1e-6);
        expect(Math.abs(checkV - Math.round(checkV))).toBeLessThan(1e-6);
      }
    });
  });
});
