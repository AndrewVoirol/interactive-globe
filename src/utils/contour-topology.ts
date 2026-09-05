// ============================================================================
// File: src/utils/contour-topology.ts
// Architecture: Milestone 2 — Isoline Contour Ingestion & Topological Severance
// Mathematical Grounding: Indicatrix Research Dossier (Frontier 2: Sections 2.1–2.6)
// Topics: 32-Byte Binary Header Decoding, Simon l'Huilier (1786) Spherical Excess,
//         Van Oosterom & Strackee (1983) Sliver Stability, Analytical Antimeridian
//         Great-Circle Severance, Fuller Dymaxion 20-Facet Sutherland-Hodgman Clipping,
//         and Nielson's Asymptotic Decider Saddle Ambiguity Resolution.
// ============================================================================

import {
  UNIT_VERTICES,
  ICOSAHEDRON_FACES,
  UNIT_CENTROIDS,
  DYMAXION_FACE_VERTICES_2D,
  projectToDymaxion2D,
  RADIUS as DEFAULT_RADIUS,
} from './dymaxion';

export type Point2D = [number, number];         // [lon, lat] in degrees
export type Point3D = [number, number, number]; // [x, y, z] Cartesian on S^2
export type Segment2D = [Point2D, Point2D];
export type Segment3D = [Point3D, Point3D];

export interface SeveredSegment {
  p1: Point2D;
  p2: Point2D;
}

export interface ContourMeshHeader {
  magic: number;          // 0x47454F4D ('GEOM') or 0x434F4E54 ('CONT')
  version: number;        // schema version, e.g. 1
  pointCount: number;     // number of vertices N
  indexCount: number;     // number of line indices M (M/2 segments)
  minElevation: number;   // minimum geomorphological elevation in meters
  maxElevation: number;   // maximum geomorphological elevation in meters
  isoCount: number;       // number of discrete isovalues (12 levels)
  reserved: number;       // format flags / reserved word
}

export interface DecodedContourMesh {
  header: ContourMeshHeader;
  positions3D: Float32Array;   // 3 floats per vertex (x, y, z on S^2)
  target2D: Float32Array;      // 2 floats per vertex (Mercator x, y)
  dymaxion2D: Float32Array;    // 2 floats per vertex (Fuller 2D net x, y)
  typeData: Float32Array;      // 1 float per vertex (normalized elevation [0, 1])
  lineIndices: Uint32Array;    // line list indices (2 per segment)
}

export type ContourMeshData = DecodedContourMesh;

export interface BilinearCellValues {
  f00: number; // Bottom-Left (u=0, v=0)
  f10: number; // Bottom-Right (u=1, v=0)
  f01: number; // Top-Left (u=0, v=1)
  f11: number; // Top-Right (u=1, v=1)
}

// Canonical Magic Constants
export const MAGIC_GEOM = 0x47454F4D; // ASCII 'GEOM' (0x4D, 0x4F, 0x45, 0x47)
export const MAGIC_CONT = 0x434F4E54; // ASCII 'CONT' (0x54, 0x4E, 0x4F, 0x43)
export const HEADER_BYTE_SIZE = 32;

// ============================================================================
// 1. Binary Mesh Header & Columnar Array Ingestion (Zero-Copy)
// ============================================================================

/**
 * Parses the 32-byte header of a contour mesh binary buffer.
 * Supports both 0x47454F4D ('GEOM') and 0x434F4E54 ('CONT') magic words.
 */
export function parseContourMeshHeader(buffer: ArrayBuffer | ArrayBufferView): ContourMeshHeader {
  const byteLength = buffer.byteLength;
  if (byteLength < HEADER_BYTE_SIZE) {
    throw new Error(`Contour mesh buffer too small: ${byteLength} bytes (expected >= ${HEADER_BYTE_SIZE})`);
  }

  const rawBuffer = 'buffer' in buffer ? buffer.buffer : buffer;
  const baseOffset = 'byteOffset' in buffer ? buffer.byteOffset : 0;
  const view = new DataView(rawBuffer, baseOffset, HEADER_BYTE_SIZE);

  const magic = view.getUint32(0, true);
  if (magic !== MAGIC_GEOM && magic !== MAGIC_CONT) {
    throw new Error(
      `Invalid contour mesh magic: 0x${magic.toString(16).toUpperCase()} (expected 0x${MAGIC_GEOM.toString(16).toUpperCase()} or 0x${MAGIC_CONT.toString(16).toUpperCase()})`
    );
  }

  const version = view.getUint32(4, true);
  const pointCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);

  // Words 4..7: elevation metadata / offsets / reserved
  const minElevation = view.getFloat32(16, true);
  const maxElevation = view.getFloat32(20, true);
  const isoCount = view.getUint32(24, true);
  const reserved = view.getUint32(28, true);

  return {
    magic,
    version,
    pointCount,
    indexCount,
    minElevation,
    maxElevation,
    isoCount,
    reserved,
  };
}

/**
 * Ingests and decodes the 5 columnar arrays of the contour mesh binary buffer.
 * Leverages direct typed array views over ArrayBuffer without heap re-allocation.
 */
export function decodeContourMesh(buffer: ArrayBuffer | ArrayBufferView): DecodedContourMesh {
  const header = parseContourMeshHeader(buffer);
  const { pointCount, indexCount } = header;

  const posByteLength = pointCount * 3 * 4;
  const tarByteLength = pointCount * 2 * 4;
  const dymByteLength = pointCount * 2 * 4;
  const typByteLength = pointCount * 1 * 4;
  const idxByteLength = indexCount * 4;
  const expectedTotalBytes = HEADER_BYTE_SIZE + posByteLength + tarByteLength + dymByteLength + typByteLength + idxByteLength;

  const rawBuffer = 'buffer' in buffer ? buffer.buffer : buffer;
  const baseOffset = 'byteOffset' in buffer ? buffer.byteOffset : 0;

  if (buffer.byteLength < expectedTotalBytes) {
    throw new Error(
      `Contour mesh buffer truncated: ${buffer.byteLength} bytes (expected ${expectedTotalBytes} bytes for ${pointCount} vertices and ${indexCount} indices)`
    );
  }

  const posOffset = baseOffset + HEADER_BYTE_SIZE;
  const tarOffset = posOffset + posByteLength;
  const dymOffset = tarOffset + tarByteLength;
  const typOffset = dymOffset + dymByteLength;
  const idxOffset = typOffset + typByteLength;

  // Direct typed views without array copying
  const positions3D = new Float32Array(rawBuffer, posOffset, pointCount * 3);
  const target2D = new Float32Array(rawBuffer, tarOffset, pointCount * 2);
  const dymaxion2D = new Float32Array(rawBuffer, dymOffset, pointCount * 2);
  const typeData = new Float32Array(rawBuffer, typOffset, pointCount * 1);
  const lineIndices = new Uint32Array(rawBuffer, idxOffset, indexCount);

  return {
    header,
    positions3D,
    target2D,
    dymaxion2D,
    typeData,
    lineIndices,
  };
}

export const parseContourMeshBinary = decodeContourMesh;

// ============================================================================
// 2. Spherical Geometry & Simon l'Huilier Spherical Excess
// ============================================================================

/**
 * Normalizes a 3D vector to unit sphere S^2
 */
export function toUnit(p: Point3D): Point3D {
  const len = Math.hypot(p[0], p[1], p[2]);
  if (len < 1e-15) return [0, 0, 1];
  return [p[0] / len, p[1] / len, p[2] / len];
}

/**
 * Converts spherical coordinates [lon, lat] in degrees to Cartesian coordinates on unit sphere S^2.
 * Coordinate convention matches projection.ts:
 * x = cos(phi) * sin(theta) [East]
 * y = sin(phi)              [North]
 * z = cos(phi) * cos(theta) [Prime Meridian]
 */
export function lonLatToUnitSphere(lonDeg: number, latDeg: number): Point3D {
  const phi = (latDeg * Math.PI) / 180;
  const theta = (lonDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.sin(theta), Math.sin(phi), cosPhi * Math.cos(theta)];
}

/**
 * Converts Cartesian coordinates [x, y, z] on sphere S^2 to [lon, lat] in degrees.
 */
export function unitSphereToLonLat(vec: Point3D): Point2D {
  const u = toUnit(vec);
  const latRad = Math.asin(Math.max(-1.0, Math.min(1.0, u[1])));
  const lonRad = Math.atan2(u[0], u[2]);
  return [(lonRad * 180) / Math.PI, (latRad * 180) / Math.PI];
}

/**
 * Chordal arcsine formula for geodesic distance on the unit sphere S^2:
 * d = 2 * asin( min(1.0, ||u - v|| / 2) )
 * Eliminates arccos catastrophic floating-point cancellation for nearby points.
 */
export function computeChordalDistance(u: Point3D, v: Point3D): number {
  const uUnit = toUnit(u);
  const vUnit = toUnit(v);
  const dx = uUnit[0] - vUnit[0];
  const dy = uUnit[1] - vUnit[1];
  const dz = uUnit[2] - vUnit[2];
  const chordLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const halfChord = Math.min(1.0, chordLength * 0.5);
  return 2.0 * Math.asin(halfChord);
}

export const geodesicDistance = computeChordalDistance;

/**
 * Evaluates Simon l'Huilier's (1786) spherical excess formula from side lengths (a, b, c):
 * tan(E / 4) = sqrt( tan(s/2) * tan((s-a)/2) * tan((s-b)/2) * tan((s-c)/2) )
 * where s = (a + b + c) / 2 is the spherical semiperimeter.
 */
export function computeSphericalExcessLHuilier(a: number, b: number, c: number): number {
  const s = (a + b + c) * 0.5;
  const sa = s - a;
  const sb = s - b;
  const sc = s - c;

  // Degenerate, collinear, or negative radicand guard
  if (sa <= 0.0 || sb <= 0.0 || sc <= 0.0 || s <= 0.0) {
    return 0.0;
  }

  // Antipodal / hemisphere boundary guard
  if (s >= Math.PI || a >= Math.PI - 1e-7 || b >= Math.PI - 1e-7 || c >= Math.PI - 1e-7) {
    return 0.0;
  }

  const tanS2 = Math.tan(s * 0.5);
  const tanSa2 = Math.tan(sa * 0.5);
  const tanSb2 = Math.tan(sb * 0.5);
  const tanSc2 = Math.tan(sc * 0.5);

  const product = tanS2 * tanSa2 * tanSb2 * tanSc2;
  if (product <= 0.0 || !Number.isFinite(product)) {
    return 0.0;
  }

  const tanE4 = Math.sqrt(product);
  return 4.0 * Math.atan(tanE4);
}

/**
 * Evaluates Van Oosterom & Strackee (1983) scalar triple product formula:
 * tan(E / 2) = |vA . (vB x vC)| / (1 + vA.vB + vB.vC + vC.vA)
 * Maintains precision down to 10^-16 for high-aspect-ratio sliver triangles.
 */
export function computeSphericalExcessVanOosterom(A: Point3D, B: Point3D, C: Point3D): number {
  const vA = toUnit(A);
  const vB = toUnit(B);
  const vC = toUnit(C);

  // Cross product vB x vC
  const cX = vB[1] * vC[2] - vB[2] * vC[1];
  const cY = vB[2] * vC[0] - vB[0] * vC[2];
  const cZ = vB[0] * vC[1] - vB[1] * vC[0];

  // Scalar triple product numerator
  const num = Math.abs(vA[0] * cX + vA[1] * cY + vA[2] * cZ);

  // Dot product denominator
  const dotAB = vA[0] * vB[0] + vA[1] * vB[1] + vA[2] * vB[2];
  const dotBC = vB[0] * vC[0] + vB[1] * vC[1] + vB[2] * vC[2];
  const dotCA = vC[0] * vA[0] + vC[1] * vA[1] + vC[2] * vA[2];
  const den = 1.0 + dotAB + dotBC + dotCA;

  if (num < 1e-15 || !Number.isFinite(num)) {
    return 0.0;
  }

  const E = 2.0 * Math.atan2(num, den);
  return Math.max(0.0, E);
}

/**
 * Evaluates true spherical triangle area DeltaOmega = E * R^2 on S^2.
 * Dynamically switches to Van Oosterom & Strackee for sliver triangles where min(s-a, s-b, s-c) < 10^-11
 * or where floating-point cancellation occurs.
 */
export function computeSphericalTriangleArea(
  A: Point3D,
  B: Point3D,
  C: Point3D,
  radius: number = 1.0
): number {
  const vA = toUnit(A);
  const vB = toUnit(B);
  const vC = toUnit(C);

  const a = computeChordalDistance(vB, vC);
  const b = computeChordalDistance(vA, vC);
  const c = computeChordalDistance(vA, vB);

  // Antipodal guard
  if (a >= Math.PI - 1e-7 || b >= Math.PI - 1e-7 || c >= Math.PI - 1e-7) {
    return 0.0;
  }

  const s = (a + b + c) * 0.5;
  if (s >= Math.PI || s <= 0.0) {
    return 0.0;
  }

  const sa = s - a;
  const sb = s - b;
  const sc = s - c;
  const minDiff = Math.min(sa, Math.min(sb, sc));

  // Sliver triangle switch threshold (10^-11 radians) or subtractive cancellation:
  // When sides satisfy a + b ≈ c, subtractive cancellation in float64 causes minDiff < 10^-11 (or <= 0).
  // Dynamically switch to Van Oosterom & Strackee (1983) scalar triple product!
  if (minDiff < 1e-11) {
    const E_vo = computeSphericalExcessVanOosterom(vA, vB, vC);
    return E_vo * radius * radius;
  }

  // Degenerate checks for standard triangles
  if (sa <= 0.0 || sb <= 0.0 || sc <= 0.0) {
    return 0.0;
  }

  const E = computeSphericalExcessLHuilier(a, b, c);
  return E * radius * radius;
}

export const sphericalTriangleEffectiveArea = computeSphericalTriangleArea;

// ============================================================================
// 3. Spherical Visvalingam-Whyatt Simplification on S^2
// ============================================================================

/**
 * Simplifies a spherical polyline using the Spherical Visvalingam-Whyatt algorithm.
 * Guarantees monotonic removal threshold, preserved endpoints, and >= 3 unique vertices (4 points) for closed rings.
 */
export function simplifyPolylineSpherical(
  poly: Point2D[],
  targetVertexCount: number,
  radius: number = 1.0
): Point2D[] {
  const n = poly.length;
  if (n <= targetVertexCount || n <= 2) {
    return poly.slice();
  }

  const isClosed = n > 2 && poly[0][0] === poly[n - 1][0] && poly[0][1] === poly[n - 1][1];
  // For closed rings: minimum 3 unique vertices + closing point = 4 points total
  const minKeep = isClosed ? 4 : 2;
  const effectiveTarget = Math.max(minKeep, targetVertexCount);

  if (n <= effectiveTarget) {
    return poly.slice();
  }

  // Linked list representation
  interface Node {
    idx: number;
    pt: Point2D;
    prev: Node | null;
    next: Node | null;
    area: number;
    removed: boolean;
  }

  const nodes: Node[] = poly.map((pt, i) => ({
    idx: i,
    pt,
    prev: null,
    next: null,
    area: 0,
    removed: false,
  }));

  for (let i = 0; i < n; i++) {
    if (i > 0) nodes[i].prev = nodes[i - 1];
    if (i < n - 1) nodes[i].next = nodes[i + 1];
  }

  const computeNodeArea = (node: Node): number => {
    if (!node.prev || !node.next) return Infinity;
    const vA = lonLatToUnitSphere(node.prev.pt[0], node.prev.pt[1]);
    const vB = lonLatToUnitSphere(node.pt[0], node.pt[1]);
    const vC = lonLatToUnitSphere(node.next.pt[0], node.next.pt[1]);
    return computeSphericalTriangleArea(vA, vB, vC, radius);
  };

  // Assign initial areas
  nodes[0].area = Infinity;
  nodes[n - 1].area = Infinity;
  for (let i = 1; i < n - 1; i++) {
    nodes[i].area = computeNodeArea(nodes[i]);
  }

  let remainingCount = n;
  let maxAreaEliminated = 0.0;

  while (remainingCount > effectiveTarget) {
    let minArea = Infinity;
    let minNode: Node | null = null;

    for (let i = 1; i < n - 1; i++) {
      const node = nodes[i];
      if (!node.removed && node.area < minArea) {
        minArea = node.area;
        minNode = node;
      }
    }

    if (!minNode || minArea === Infinity) {
      break;
    }

    // Monotonic area threshold
    maxAreaEliminated = Math.max(maxAreaEliminated, minArea);
    minNode.removed = true;
    remainingCount--;

    // Re-link neighbors
    const prevNode = minNode.prev!;
    const nextNode = minNode.next!;
    prevNode.next = nextNode;
    nextNode.prev = prevNode;

    // Update neighbor effective areas
    if (prevNode.prev) {
      prevNode.area = Math.max(maxAreaEliminated, computeNodeArea(prevNode));
    }
    if (nextNode.next) {
      nextNode.area = Math.max(maxAreaEliminated, computeNodeArea(nextNode));
    }
  }

  const simplified: Point2D[] = [];
  let curr: Node | null = nodes[0];
  while (curr) {
    if (!curr.removed) {
      simplified.push(curr.pt);
    }
    curr = curr.next;
  }

  if (isClosed && simplified.length >= 3) {
    // Maintain closed property
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      simplified.push([first[0], first[1]]);
    }
  }

  return simplified;
}

// ============================================================================
// 4. Analytical Antimeridian Great-Circle Severance (180° Seam)
// ============================================================================

/**
 * Evaluates exact analytical intersection of a great-circle segment with the antimeridian plane (x=0, z<0).
 * Splits crossing segments into two subsegments snapped to +/-180.00000° with identical crossing latitude phi*,
 * guaranteeing 3D globe C^0 continuity (0 visual tears) and 2D map screen streak elimination.
 */
export function severAntimeridianSegment(p1: Point2D, p2: Point2D): SeveredSegment[] {
  const [lon1, lat1] = p1;
  const [lon2, lat2] = p2;

  const deltaLon = Math.abs(lon1 - lon2);
  if (deltaLon <= 180.0) {
    return [{ p1, p2 }];
  }

  // Segment crosses the antimeridian seam
  const v1 = lonLatToUnitSphere(lon1, lat1);
  const v2 = lonLatToUnitSphere(lon2, lat2);

  // Normal to great circle plane: n = v1 x v2
  const nx = v1[1] * v2[2] - v1[2] * v2[1];
  const ny = v1[2] * v2[0] - v1[0] * v2[2];
  const nz = v1[0] * v2[1] - v1[1] * v2[0];

  // Meridian intersection vector: L = n x x_hat = (0, nz, -ny)
  const H = Math.hypot(nz, ny);
  let phiStarDeg: number;

  if (H < 1e-12) {
    // Degenerate polar crossing: midpoint fallback
    phiStarDeg = (lat1 + lat2) * 0.5;
  } else {
    // Oriented to antimeridian half-plane where z < 0 (i.e. -ny * sign < 0 => sign = ny >= 0 ? 1 : -1)
    const sign = ny >= 0 ? 1.0 : -1.0;
    const yStar = (sign * nz) / H;
    const zStar = (sign * -ny) / H; // guaranteed zStar <= 0
    const phiStarRad = Math.atan2(yStar, -zStar);
    phiStarDeg = (phiStarRad * 180.0) / Math.PI;
  }

  // Snapped boundary points
  const signLon1 = lon1 >= 0 ? 1.0 : -1.0;
  const snap1: Point2D = [signLon1 * 180.0, phiStarDeg];
  const snap2: Point2D = [-signLon1 * 180.0, phiStarDeg];

  return [
    { p1, p2: snap1 },
    { p1: snap2, p2 },
  ];
}

/**
 * Severs a full polyline crossing the 180° antimeridian into independent open line strips.
 */
export function severPolylineAntimeridian(points: Point2D[]): Point2D[][] {
  if (points.length < 2) {
    return [points.slice()];
  }

  const strips: Point2D[][] = [];
  let currentStrip: Point2D[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const pA = points[i];
    const pB = points[i + 1];
    const severed = severAntimeridianSegment(pA, pB);

    if (severed.length === 1) {
      currentStrip.push(severed[0].p2);
    } else {
      // Crosses antimeridian: close first strip and begin second strip
      currentStrip.push(severed[0].p2);
      strips.push(currentStrip);
      currentStrip = [severed[1].p1, severed[1].p2];
    }
  }

  if (currentStrip.length > 1) {
    strips.push(currentStrip);
  }

  return strips;
}

export const clipPolylineAntimeridian = severPolylineAntimeridian;

// ============================================================================
// 5. Fuller Dymaxion 20-Facet Boundary Severance (14 Cut Edges)
// ============================================================================

/**
 * Precomputed inward-pointing great-circle edge normal planes for each icosahedral facet.
 * Face plane normal M_{k, e} satisfies M . C_k > 0.
 */
export const DYMAXION_FACE_EDGE_PLANES: Point3D[][] = ICOSAHEDRON_FACES.map((face, fIdx) => {
  const v3D = [UNIT_VERTICES[face[0]], UNIT_VERTICES[face[1]], UNIT_VERTICES[face[2]]];
  const centroid = UNIT_CENTROIDS[fIdx];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 0]];

  return edges.map(([eA, eB]) => {
    const pA = v3D[eA];
    const pB = v3D[eB];
    // Cross product pA x pB
    const mx = pA[1] * pB[2] - pA[2] * pB[1];
    const my = pA[2] * pB[0] - pA[0] * pB[2];
    const mz = pA[0] * pB[1] - pA[1] * pB[0];
    const len = Math.hypot(mx, my, mz) || 1.0;
    let norm: Point3D = [mx / len, my / len, mz / len];

    // Orient inward toward facet centroid
    if (norm[0] * centroid[0] + norm[1] * centroid[1] + norm[2] * centroid[2] < 0) {
      norm = [-norm[0], -norm[1], -norm[2]];
    }
    return norm;
  });
});

/**
 * Spherical Sutherland-Hodgman clipping of a 3D great-circle segment against an icosahedral facet.
 * Returns the clipped subsegment on S^2 or null if the segment lies completely outside the facet.
 */
export function clipSegmentDymaxion(
  p1: Point3D,
  p2: Point3D,
  faceIndex: number
): Point3D[] | null {
  if (faceIndex < 0 || faceIndex >= 20) return null;

  const r1 = Math.hypot(p1[0], p1[1], p1[2]) || DEFAULT_RADIUS;
  const r2 = Math.hypot(p2[0], p2[1], p2[2]) || DEFAULT_RADIUS;
  const avgR = (r1 + r2) * 0.5;

  let q1 = toUnit(p1);
  let q2 = toUnit(p2);
  const planes = DYMAXION_FACE_EDGE_PLANES[faceIndex];
  const EPS = 1e-10;

  for (let e = 0; e < 3; e++) {
    const plane = planes[e];
    const d1 = plane[0] * q1[0] + plane[1] * q1[1] + plane[2] * q1[2];
    const d2 = plane[0] * q2[0] + plane[1] * q2[1] + plane[2] * q2[2];

    if (d1 < -EPS && d2 < -EPS) {
      return null; // Entirely outside
    }

    if (d1 >= -EPS && d2 >= -EPS) {
      // Entirely inside with respect to this edge
      continue;
    }

    const t = Math.max(0.0, Math.min(1.0, d1 / (d1 - d2)));
    const inter: Point3D = [
      (1.0 - t) * q1[0] + t * q2[0],
      (1.0 - t) * q1[1] + t * q2[1],
      (1.0 - t) * q1[2] + t * q2[2],
    ];
    const interUnit = toUnit(inter);

    if (d1 >= -EPS && d2 < -EPS) {
      q2 = interUnit;
    } else {
      q1 = interUnit;
    }
  }

  // Check degenerate point
  const segDist = computeChordalDistance(q1, q2);
  if (segDist < 1e-9) {
    return null;
  }

  return [
    [q1[0] * avgR, q1[1] * avgR, q1[2] * avgR],
    [q2[0] * avgR, q2[1] * avgR, q2[2] * avgR],
  ];
}

/**
 * Partitions a spherical polyline into sub-polylines clipped to each of the 20 Fuller Dymaxion facets.
 */
export function partitionPolylineByDymaxionFacets(poly: Point2D[]): Map<number, Point2D[][]> {
  const result = new Map<number, Point2D[][]>();

  if (poly.length < 2) {
    return result;
  }

  for (let f = 0; f < 20; f++) {
    const faceStrips: Point2D[][] = [];
    let currentStrip: Point2D[] = [];

    for (let i = 0; i < poly.length - 1; i++) {
      const p1 = lonLatToUnitSphere(poly[i][0], poly[i][1]);
      const p2 = lonLatToUnitSphere(poly[i + 1][0], poly[i + 1][1]);
      const clipped = clipSegmentDymaxion(p1, p2, f);

      if (clipped) {
        const ptA = unitSphereToLonLat(clipped[0]);
        const ptB = unitSphereToLonLat(clipped[1]);

        if (currentStrip.length === 0) {
          currentStrip.push(ptA, ptB);
        } else {
          const last = currentStrip[currentStrip.length - 1];
          const dist = Math.hypot(last[0] - ptA[0], last[1] - ptA[1]);
          if (dist < 1e-5) {
            currentStrip.push(ptB);
          } else {
            faceStrips.push(currentStrip);
            currentStrip = [ptA, ptB];
          }
        }
      } else {
        if (currentStrip.length > 0) {
          faceStrips.push(currentStrip);
          currentStrip = [];
        }
      }
    }

    if (currentStrip.length > 0) {
      faceStrips.push(currentStrip);
    }

    if (faceStrips.length > 0) {
      result.set(f, faceStrips);
    }
  }

  return result;
}

// ============================================================================
// 6. Nielson's Asymptotic Decider & Saddle Ambiguity Resolution
// ============================================================================

/**
 * Evaluates bilinear interpolation coefficients and saddle point for a cell.
 * B(u, v) = alpha + beta*u + gamma*v + delta*u*v
 * Saddle coordinates: u_s = -gamma / delta, v_s = -beta / delta
 * Exact saddle value: S = (F00 * F11 - F10 * F01) / delta
 */
export function computeBilinearSaddle(cell: BilinearCellValues): {
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
  uSaddle: number;
  vSaddle: number;
  saddleValue: number;
  hasSaddleInCell: boolean;
} {
  const { f00, f10, f01, f11 } = cell;
  const alpha = f00;
  const beta = f10 - f00;
  const gamma = f01 - f00;
  const delta = f11 - f10 - f01 + f00;

  if (Math.abs(delta) < 1e-12) {
    return {
      alpha,
      beta,
      gamma,
      delta,
      uSaddle: 0.5,
      vSaddle: 0.5,
      saddleValue: (f00 + f10 + f01 + f11) * 0.25,
      hasSaddleInCell: false,
    };
  }

  const uSaddle = -gamma / delta;
  const vSaddle = -beta / delta;
  const saddleValue = (f00 * f11 - f10 * f01) / delta;
  const hasSaddleInCell = uSaddle > 0.0 && uSaddle < 1.0 && vSaddle > 0.0 && vSaddle < 1.0;

  return {
    alpha,
    beta,
    gamma,
    delta,
    uSaddle,
    vSaddle,
    saddleValue,
    hasSaddleInCell,
  };
}

/**
 * Resolves diagonal topological ambiguities for Marching Squares Case 5 (0101) and Case 10 (1010)
 * via Nielson's Asymptotic Decider theorem.
 * Edge indices: e0 (bottom), e1 (right), e2 (top), e3 (left).
 */
export function resolveAsymptoticDecider(
  cell: BilinearCellValues,
  isovalue: number,
  caseType: 5 | 10
): {
  saddleValue: number;
  connectEdges: [[number, number], [number, number]];
} {
  const { saddleValue } = computeBilinearSaddle(cell);

  let connectEdges: [[number, number], [number, number]];
  if (caseType === 5) {
    if (saddleValue >= isovalue) {
      // Connect e0 <-> e1, e3 <-> e2
      connectEdges = [[0, 1], [3, 2]];
    } else {
      // Connect e0 <-> e3, e1 <-> e2
      connectEdges = [[0, 3], [1, 2]];
    }
  } else {
    // Case 10
    if (saddleValue >= isovalue) {
      // Connect e0 <-> e3, e1 <-> e2
      connectEdges = [[0, 3], [1, 2]];
    } else {
      // Connect e0 <-> e1, e3 <-> e2
      connectEdges = [[0, 1], [3, 2]];
    }
  }

  return { saddleValue, connectEdges };
}

/**
 * Linearly interpolates edge intersection parameter t in [0, 1] with guarded fallback for near-equal values.
 */
export function interpolateContourEdge(fA: number, fB: number, isovalue: number): number {
  const diff = fB - fA;
  if (Math.abs(diff) < 1e-12) {
    return 0.5; // Guarded stable midpoint fallback
  }
  return Math.max(0.0, Math.min(1.0, (isovalue - fA) / diff));
}
