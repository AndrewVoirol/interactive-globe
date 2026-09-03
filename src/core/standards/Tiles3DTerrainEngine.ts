// ============================================================================
// File: src/core/standards/Tiles3DTerrainEngine.ts
// Architecture: Geospatial Standards Engine (OGC 3D Tiles 1.1 & Terrain Ingestion)
// Description: Hierarchical OBB parsing & spherical elevation displacement mapping R(lambda, phi) = R0 + h(lambda, phi)
// ============================================================================

export interface OrientedBoundingBoxOBB {
  center: [number, number, number];
  halfAxisX: [number, number, number]; // Vector u0
  halfAxisY: [number, number, number]; // Vector u1
  halfAxisZ: [number, number, number]; // Vector u2
}

export interface TerrainTileHeader {
  tileId: string;
  obb: OrientedBoundingBoxOBB;
  geometricError: number;
  minHeight: number;
  maxHeight: number;
  children?: TerrainTileHeader[];
}

export interface DisplacementResult {
  position3D: [number, number, number];
  position2D: [number, number, number];
  height: number;
}

export class Tiles3DTerrainEngine {
  private baseRadius: number;
  private heightScale: number;

  constructor(baseRadius: number = 5.0, heightScale: number = 0.001) {
    this.baseRadius = baseRadius;
    this.heightScale = heightScale;
  }

  /**
   * Parses 12-element OBB array [cx, cy, cz, ux0, ux1, ux2, uy0, uy1, uy2, uz0, uz1, uz2]
   */
  public parseOBB(obbArray: number[]): OrientedBoundingBoxOBB {
    if (obbArray.length < 12) {
      return {
        center: [0, 0, 0],
        halfAxisX: [1, 0, 0],
        halfAxisY: [0, 1, 0],
        halfAxisZ: [0, 0, 1],
      };
    }

    return {
      center: [obbArray[0], obbArray[1], obbArray[2]],
      halfAxisX: [obbArray[3], obbArray[4], obbArray[5]],
      halfAxisY: [obbArray[6], obbArray[7], obbArray[8]],
      halfAxisZ: [obbArray[9], obbArray[10], obbArray[11]],
    };
  }

  /**
   * Tests if point p is inside Oriented Bounding Box (OBB)
   */
  public isPointInsideOBB(p: [number, number, number], obb: OrientedBoundingBoxOBB): boolean {
    const d = [
      p[0] - obb.center[0],
      p[1] - obb.center[1],
      p[2] - obb.center[2],
    ];

    const projX = Math.abs(d[0] * obb.halfAxisX[0] + d[1] * obb.halfAxisX[1] + d[2] * obb.halfAxisX[2]);
    const projY = Math.abs(d[0] * obb.halfAxisY[0] + d[1] * obb.halfAxisY[1] + d[2] * obb.halfAxisY[2]);
    const projZ = Math.abs(d[0] * obb.halfAxisZ[0] + d[1] * obb.halfAxisZ[1] + d[2] * obb.halfAxisZ[2]);

    const lenX = Math.hypot(obb.halfAxisX[0], obb.halfAxisX[1], obb.halfAxisX[2]);
    const lenY = Math.hypot(obb.halfAxisY[0], obb.halfAxisY[1], obb.halfAxisY[2]);
    const lenZ = Math.hypot(obb.halfAxisZ[0], obb.halfAxisZ[1], obb.halfAxisZ[2]);

    return projX <= lenX * lenX && projY <= lenY * lenY && projZ <= lenZ * lenZ;
  }

  /**
   * Computes spherical elevation displacement mapping: R(lambda, phi) = R0 + h(lambda, phi)
   * 3D Sphere Position: p3D = (R0 + S * h) * (cos phi sin lambda, sin phi, cos phi cos lambda)
   * 2D Planar Map Position: p2D = (xMap(lambda), yMap(phi), S * h)
   */
  public computeElevationDisplacement(
    lonDeg: number,
    latDeg: number,
    elevationMeters: number,
    unfurl: number = 0
  ): DisplacementResult {
    const radLon = (lonDeg * Math.PI) / 180.0;
    const radLat = (latDeg * Math.PI) / 180.0;

    const R0 = this.baseRadius;
    const scaledHeight = elevationMeters * this.heightScale;
    const R = R0 + scaledHeight;

    // 3D Spherical Displaced Position
    const x3D = R * Math.cos(radLat) * Math.sin(radLon);
    const y3D = R * Math.sin(radLat);
    const z3D = R * Math.cos(radLat) * Math.cos(radLon);

    // 2D Planar Web Mercator Displaced Position
    const x2D = R0 * radLon;
    const clampedLat = Math.max(-85.0, Math.min(85.0, latDeg));
    const radClampLat = (clampedLat * Math.PI) / 180.0;
    const y2D = R0 * Math.log(Math.tan(Math.PI / 4.0 + radClampLat / 2.0));
    const z2D = scaledHeight;

    return {
      position3D: [x3D, y3D, z3D],
      position2D: [x2D, isNaN(y2D) ? 0 : y2D, z2D],
      height: scaledHeight,
    };
  }

  /**
   * Decodes Quantized Mesh tile array buffer and applies elevation perturbation across vertex positions
   */
  public decodeQuantizedMesh(
    vertexCount: number,
    quantizedPositions: Uint16Array, // 3 * N (u, v, height)
    bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
    minHeight: number,
    maxHeight: number
  ): { positions3D: Float32Array; target2D: Float32Array } {
    const positions3D = new Float32Array(vertexCount * 3);
    const target2D = new Float32Array(vertexCount * 2);

    const lonRange = bounds.maxLon - bounds.minLon;
    const latRange = bounds.maxLat - bounds.minLat;
    const heightRange = maxHeight - minHeight;

    let uAcc = 0;
    let vAcc = 0;
    let hAcc = 0;

    for (let i = 0; i < vertexCount; i++) {
      const uRaw = quantizedPositions[i * 3 + 0];
      const vRaw = quantizedPositions[i * 3 + 1];
      const hRaw = quantizedPositions[i * 3 + 2];

      // Decode ZigZag delta encoding
      uAcc += (uRaw >> 1) ^ -(uRaw & 1);
      vAcc += (vRaw >> 1) ^ -(vRaw & 1);
      hAcc += (hRaw >> 1) ^ -(hRaw & 1);

      const normU = uAcc / 32767.0;
      const normV = vAcc / 32767.0;
      const normH = hAcc / 32767.0;

      const lon = bounds.minLon + normU * lonRange;
      const lat = bounds.minLat + normV * latRange;
      const elev = minHeight + normH * heightRange;

      const disp = this.computeElevationDisplacement(lon, lat, elev);

      positions3D[i * 3 + 0] = disp.position3D[0];
      positions3D[i * 3 + 1] = disp.position3D[1];
      positions3D[i * 3 + 2] = disp.position3D[2];

      target2D[i * 2 + 0] = disp.position2D[0];
      target2D[i * 2 + 1] = disp.position2D[1];
    }

    return { positions3D, target2D };
  }
}
