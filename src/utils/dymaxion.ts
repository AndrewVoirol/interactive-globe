/**
 * Fuller Dymaxion Polyhedral Unfolding Math Module (Milestone M4 / Feature F8 & F9)
 * 
 * Implements 20-facet regular icosahedron projection (Golden Ratio phi ≈ 1.61803398875),
 * 12 canonical vertices, 20 triangular facets, unit centroid normal assignment,
 * central gnomonic projection, and Buckminster Fuller 2D planar net unfolding.
 */

export const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio 1.618033988749895
export const RADIUS = 5.0;

// Canonical raw icosahedron vertices (unnormalized)
const RAW_VERTICES: Array<[number, number, number]> = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

// 20 triangular face indices
export const ICOSAHEDRON_FACES: Array<[number, number, number]> = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

// Normalized unit vertices
export const UNIT_VERTICES: Array<[number, number, number]> = RAW_VERTICES.map(v => {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
});

// Normalized unit centroids for 20 faces
export const UNIT_CENTROIDS: Array<[number, number, number]> = ICOSAHEDRON_FACES.map(f => {
  const v0 = UNIT_VERTICES[f[0]];
  const v1 = UNIT_VERTICES[f[1]];
  const v2 = UNIT_VERTICES[f[2]];
  const cx = (v0[0] + v1[0] + v2[0]) / 3;
  const cy = (v0[1] + v1[1] + v2[1]) / 3;
  const cz = (v0[2] + v1[2] + v2[2]) / 3;
  const len = Math.hypot(cx, cy, cz);
  return [cx / len, cy / len, cz / len];
});

// 2D Fuller planar net face layout positions (center of each triangular facet in 2D net grid)
export const DYMAXION_FACE_LAYOUT_2D: Array<[number, number]> = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [0.5, 0.8660254], [1.5, 0.8660254], [2.5, 0.8660254], [3.5, 0.8660254], [4.5, 0.8660254],
  [-0.5, -0.8660254], [0.5, -0.8660254], [1.5, -0.8660254], [2.5, -0.8660254], [3.5, -0.8660254],
  [-1, 0], [5, 0], [1, 1.7320508], [2, -1.7320508], [3, 1.7320508],
];

// Inverted flag for each face (true = inverted triangle pointing down, false = upright pointing up)
export const DYMAXION_FACE_INVERTED: boolean[] = [
  false, true, false, true, false,
  true, false, true, false, true,
  false, true, false, true, false,
  true, false, false, true, false,
];

// Precomputed 2D triangle vertices for each face in the flat net (side length s = 1.0)
const SQRT3_DIV_3 = Math.sqrt(3) / 3; // ~0.57735027
const SQRT3_DIV_6 = Math.sqrt(3) / 6; // ~0.28867513

export const DYMAXION_FACE_VERTICES_2D: Array<[[number, number], [number, number], [number, number]]> = DYMAXION_FACE_LAYOUT_2D.map((center, i) => {
  const [cx, cy] = center;
  const inverted = DYMAXION_FACE_INVERTED[i];
  if (!inverted) {
    // Upright triangle: apex on top, base on bottom
    const u0: [number, number] = [cx, cy + SQRT3_DIV_3];
    const u1: [number, number] = [cx - 0.5, cy - SQRT3_DIV_6];
    const u2: [number, number] = [cx + 0.5, cy - SQRT3_DIV_6];
    return [u0, u1, u2];
  } else {
    // Inverted triangle: base on top, apex on bottom
    const u0: [number, number] = [cx, cy - SQRT3_DIV_3];
    const u1: [number, number] = [cx + 0.5, cy + SQRT3_DIV_6];
    const u2: [number, number] = [cx - 0.5, cy + SQRT3_DIV_6];
    return [u0, u1, u2];
  }
});

/**
 * Returns canonical geometry of the regular icosahedron
 */
export function getIcosahedronGeometry(radius = 1.0): {
  vertices: Array<[number, number, number]>;
  faces: Array<[number, number, number]>;
  centroids: Array<[number, number, number]>;
  inradius: number;
  edgeLength: number;
} {
  const vertices = UNIT_VERTICES.map(v => [v[0] * radius, v[1] * radius, v[2] * radius] as [number, number, number]);
  const centroids = UNIT_CENTROIDS.map(c => [c[0], c[1], c[2]] as [number, number, number]);
  const edgeLength = (2 * radius) / Math.sqrt(1 + PHI * PHI);
  const inradius = (edgeLength * PHI * PHI) / (2 * Math.sqrt(3));

  return {
    vertices,
    faces: ICOSAHEDRON_FACES,
    centroids,
    inradius,
    edgeLength,
  };
}

/**
 * Assigns a 3D unit vector to the closest icosahedral face and computes gnomonic projection
 */
export function projectPointToDymaxionFace(p: [number, number, number] | Float32Array): {
  faceIndex: number;
  maxDot: number;
  gnomonicPos: [number, number, number];
} {
  const len = Math.hypot(p[0], p[1], p[2]);
  const safeLen = len < 1e-7 ? 1.0 : len;
  const unitP: [number, number, number] = [p[0] / safeLen, p[1] / safeLen, p[2] / safeLen];

  let maxDot = -Infinity;
  let bestFace = 0;

  for (let i = 0; i < UNIT_CENTROIDS.length; i++) {
    const c = UNIT_CENTROIDS[i];
    const dot = unitP[0] * c[0] + unitP[1] * c[1] + unitP[2] * c[2];
    if (dot > maxDot) {
      maxDot = dot;
      bestFace = i;
    }
  }

  const denom = maxDot > 0 ? maxDot : 1.0;
  const gnomonicPos: [number, number, number] = [
    unitP[0] / denom,
    unitP[1] / denom,
    unitP[2] / denom,
  ];

  return { faceIndex: bestFace, maxDot, gnomonicPos };
}

/**
 * Computes barycentric coordinates (u, v, w) of point p on 3D triangle (v0, v1, v2)
 */
export function computeBarycentricCoordinates(
  p: [number, number, number],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): [number, number, number] {
  const e0x = v1[0] - v0[0], e0y = v1[1] - v0[1], e0z = v1[2] - v0[2];
  const e1x = v2[0] - v0[0], e1y = v2[1] - v0[1], e1z = v2[2] - v0[2];
  const e2x = p[0] - v0[0], e2y = p[1] - v0[1], e2z = p[2] - v0[2];

  const d00 = e0x * e0x + e0y * e0y + e0z * e0z;
  const d01 = e0x * e1x + e0y * e1y + e0z * e1z;
  const d11 = e1x * e1x + e1y * e1y + e1z * e1z;
  const d20 = e2x * e0x + e2y * e0y + e2z * e0z;
  const d21 = e2x * e1x + e2y * e1y + e2z * e1z;

  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 1e-10) {
    return [1 / 3, 1 / 3, 1 / 3];
  }

  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  const u = 1.0 - v - w;

  return [Math.max(0, u), Math.max(0, v), Math.max(0, w)];
}

/**
 * Projects a 3D point on sphere to 2D Fuller planar net coordinates
 */
export function projectToDymaxion2D(
  p: [number, number, number] | Float32Array,
  scale = 3.2,
  offsetX = -2.0,
  offsetY = 0.0
): [number, number] {
  const { faceIndex, gnomonicPos } = projectPointToDymaxionFace(p);
  const face = ICOSAHEDRON_FACES[faceIndex];
  const v0 = UNIT_VERTICES[face[0]];
  const v1 = UNIT_VERTICES[face[1]];
  const v2 = UNIT_VERTICES[face[2]];

  const [b0, b1, b2] = computeBarycentricCoordinates(gnomonicPos, v0, v1, v2);
  const bSum = b0 + b1 + b2 || 1.0;
  const nb0 = b0 / bSum, nb1 = b1 / bSum, nb2 = b2 / bSum;

  const [u0, u1, u2] = DYMAXION_FACE_VERTICES_2D[faceIndex];
  const netX = (nb0 * u0[0] + nb1 * u1[0] + nb2 * u2[0] + offsetX) * scale;
  const netY = (nb0 * u0[1] + nb1 * u1[1] + nb2 * u2[1] + offsetY) * scale;

  return [netX, netY];
}

/**
 * Generates an N x 2 Float32Array buffer of 2D Dymaxion coordinates for an N x 3 points buffer
 */
export function generateDymaxionBuffer(points3D: Float32Array): Float32Array {
  const pointCount = points3D.length / 3;
  const dymaxionBuffer = new Float32Array(pointCount * 2);

  for (let i = 0; i < pointCount; i++) {
    const px = points3D[i * 3 + 0];
    const py = points3D[i * 3 + 1];
    const pz = points3D[i * 3 + 2];

    const [u, v] = projectToDymaxion2D([px, py, pz]);
    dymaxionBuffer[i * 2 + 0] = u;
    dymaxionBuffer[i * 2 + 1] = v;
  }

  return dymaxionBuffer;
}

/**
 * Continuous Dymaxion Morphing Evaluator
 * Blends between 3D sphere and 2D planar net with arching height modulation h_arch
 */
export function computeDymaxionMorph(
  p3D: [number, number, number],
  dymaxionTarget2D: [number, number],
  alpha: number
): {
  position: [number, number, number];
  normal: [number, number, number];
  arch: number;
} {
  const clampedAlpha = Math.max(0.0, Math.min(1.0, alpha));
  const ease = clampedAlpha < 0.5
    ? 4.0 * clampedAlpha * clampedAlpha * clampedAlpha
    : 1.0 - Math.pow(Math.max(0.0, -2.0 * clampedAlpha + 2.0), 3.0) / 2.0;

  const len3D = Math.hypot(p3D[0], p3D[1], p3D[2]) || 1.0;
  const norm3D: [number, number, number] = [p3D[0] / len3D, p3D[1] / len3D, p3D[2] / len3D];

  const target3D: [number, number, number] = [dymaxionTarget2D[0], dymaxionTarget2D[1], 0.0];

  // Shell expansion arching height modulation
  const arch = Math.sin(Math.PI * ease) * 0.45;

  const posX = (1.0 - ease) * p3D[0] + ease * target3D[0] + norm3D[0] * arch;
  const posY = (1.0 - ease) * p3D[1] + ease * target3D[1] + norm3D[1] * arch;
  const posZ = (1.0 - ease) * p3D[2] + ease * target3D[2] + norm3D[2] * arch;

  // Dynamic normal interpolation
  const nX = (1.0 - ease) * norm3D[0] + ease * 0.0;
  const nY = (1.0 - ease) * norm3D[1] + ease * 0.0;
  const nZ = (1.0 - ease) * norm3D[2] + ease * 1.0;
  const nLen = Math.hypot(nX, nY, nZ) || 1.0;

  return {
    position: [posX, posY, posZ],
    normal: [nX / nLen, nY / nLen, nZ / nLen],
    arch,
  };
}

/**
 * Filters line indices for Dymaxion mode to eliminate spiderweb edges crossing cut facet seams.
 * Two vertices in the same facet or connected hinge have ||u_a - u_b|| < 0.45.
 * Edges crossing severed seams have ||u_a - u_b|| >= 0.45.
 */
export function filterDymaxionLineIndices(
  lineIndices: Uint32Array,
  dymaxionBuffer: Float32Array,
  maxEdgeDist = 0.80
): Uint32Array {
  const maxDistSq = maxEdgeDist * maxEdgeDist;
  const filtered: number[] = [];
  const len = lineIndices.length;

  for (let i = 0; i < len; i += 2) {
    const a = lineIndices[i];
    const b = lineIndices[i + 1];

    const ax = dymaxionBuffer[a * 2 + 0];
    const ay = dymaxionBuffer[a * 2 + 1];
    const bx = dymaxionBuffer[b * 2 + 0];
    const by = dymaxionBuffer[b * 2 + 1];

    const dx = ax - bx;
    const dy = ay - by;

    if (dx * dx + dy * dy < maxDistSq) {
      filtered.push(a, b);
    }
  }

  return new Uint32Array(filtered);
}

/**
 * Generates the 20 icosahedral facet frame boundary lines for architectural folding visualization.
 * Returns { points3D, dymaxion2D, indices } for LineSegments rendering.
 */
export function generateIcosahedronFrameLines(samplesPerEdge = 6): {
  points3D: Float32Array;
  dymaxion2D: Float32Array;
} {
  const linePoints3D: number[] = [];
  const lineDymaxion2D: number[] = [];

  for (let f = 0; f < 20; f++) {
    const face = ICOSAHEDRON_FACES[f];
    const v3D = [UNIT_VERTICES[face[0]], UNIT_VERTICES[face[1]], UNIT_VERTICES[face[2]]];
    const v2D = DYMAXION_FACE_VERTICES_2D[f];

    const edges: [number, number][] = [[0, 1], [1, 2], [2, 0]];
    for (const [e0, e1] of edges) {
      const pA3D = v3D[e0];
      const pB3D = v3D[e1];
      const pA2D = v2D[e0];
      const pB2D = v2D[e1];

      for (let s = 0; s < samplesPerEdge; s++) {
        const t0 = s / samplesPerEdge;
        const t1 = (s + 1) / samplesPerEdge;

        // Spherical slerp for 3D
        const slerp3D = (t: number): [number, number, number] => {
          const x = (1 - t) * pA3D[0] + t * pB3D[0];
          const y = (1 - t) * pA3D[1] + t * pB3D[1];
          const z = (1 - t) * pA3D[2] + t * pB3D[2];
          const len = Math.hypot(x, y, z) || 1.0;
          return [(x / len) * RADIUS * 1.002, (y / len) * RADIUS * 1.002, (z / len) * RADIUS * 1.002];
        };

        const lerp2D = (t: number): [number, number] => {
          return [
            ((1 - t) * pA2D[0] + t * pB2D[0] - 2.0) * 2.35,
            ((1 - t) * pA2D[1] + t * pB2D[1]) * 2.35,
          ];
        };

        const pt0_3D = slerp3D(t0);
        const pt1_3D = slerp3D(t1);
        const pt0_2D = lerp2D(t0);
        const pt1_2D = lerp2D(t1);

        linePoints3D.push(pt0_3D[0], pt0_3D[1], pt0_3D[2], pt1_3D[0], pt1_3D[1], pt1_3D[2]);
        lineDymaxion2D.push(pt0_2D[0], pt0_2D[1], pt1_2D[0], pt1_2D[1]);
      }
    }
  }

  return {
    points3D: new Float32Array(linePoints3D),
    dymaxion2D: new Float32Array(lineDymaxion2D),
  };
}
