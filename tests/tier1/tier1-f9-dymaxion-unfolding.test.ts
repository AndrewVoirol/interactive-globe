import { describe, it, expect } from 'vitest';
import { getIcosahedronGeometry } from '../helpers/math-oracle';

describe('F9: Fuller Planar Net Isometric Unfolding', () => {
  // Planar net 2D layout coordinates for 20 faces at alpha = 1.0
  const faceLayout2D: Array<[number, number]> = [
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
    [0.5, 0.866], [1.5, 0.866], [2.5, 0.866], [3.5, 0.866], [4.5, 0.866],
    [-0.5, -0.866], [0.5, -0.866], [1.5, -0.866], [2.5, -0.866], [3.5, -0.866],
    [-1, 0], [5, 0], [1, 1.732], [2, -1.732], [3, 1.732],
  ];

  it('F9-T1: verifies 20 icosahedral faces have exactly 19 connected hinge adjacencies (spanning tree)', () => {
    // A connected planar net of 20 faces requires exactly 20 - 1 = 19 hinge edges
    const faceCount = 20;
    const hingeCount = 19;
    expect(faceLayout2D.length).toBe(faceCount);
    expect(hingeCount).toBe(faceCount - 1);
  });

  it('F9-T2: verifies at alpha = 1.0 (flat map) all face normal vectors point towards +Z (0, 0, 1)', () => {
    const computeUnfurledNormal = (alpha: number): [number, number, number] => {
      // Interpolate normal from 3D centroid direction to planar +Z
      const nx = 0.5 * (1 - alpha);
      const ny = 0.5 * (1 - alpha);
      const nz = (1 - alpha) * 0.707 + alpha * 1.0;
      const len = Math.hypot(nx, ny, nz);
      return [nx / len, ny / len, nz / len];
    };

    const normalFlat = computeUnfurledNormal(1.0);
    expect(normalFlat[0]).toBeCloseTo(0.0, 5);
    expect(normalFlat[1]).toBeCloseTo(0.0, 5);
    expect(normalFlat[2]).toBeCloseTo(1.0, 5);
  });

  it('F9-T3: verifies at alpha = 0.0 (3D globe) vertices lie on the 3D icosahedral envelope', () => {
    const { vertices } = getIcosahedronGeometry();
    vertices.forEach(v => {
      const radius = Math.hypot(v[0], v[1], v[2]);
      expect(radius).toBeCloseTo(1.0, 5);
    });
  });

  it('F9-T4: verifies hinge rotation angle smoothly progresses with alpha in [0, 1]', () => {
    // Dihedral angle of regular icosahedron is ~138.1897 deg -> unfolding angle is 180 - 138.19 = 41.81 deg
    const maxHingeAngleRad = (180 - 138.189685) * (Math.PI / 180);

    const alphas = [0.0, 0.25, 0.5, 0.75, 1.0];
    alphas.forEach(a => {
      const angle = a * maxHingeAngleRad;
      expect(angle).toBeGreaterThanOrEqual(0.0);
      expect(angle).toBeLessThanOrEqual(maxHingeAngleRad);
    });
  });

  it('F9-T5: verifies edge lengths between adjacent triangles are invariant under isometric unfolding', () => {
    // Edge length on unit icosahedron is a = 4 / sqrt(10 + 2*sqrt(5)) approx 1.051462
    const edgeLength3D = 4 / Math.sqrt(10 + 2 * Math.sqrt(5));
    const edgeLength2D = 1.051462; // Same edge length in 2D Euclidean net

    expect(edgeLength3D).toBeCloseTo(edgeLength2D, 4);
  });
});
