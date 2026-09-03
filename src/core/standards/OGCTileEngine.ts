// ============================================================================
// File: src/core/standards/OGCTileEngine.ts
// Architecture: Geospatial Standards Engine (OGC API - Tiles & Features)
// Description: WMTS quadtree tile pyramid traversal & zero-copy vector stream parsing
// ============================================================================

export type TileMatrixSet = 'WorldCRS84Quad' | 'WebMercatorQuad';

export interface TileCoordinate {
  z: number;
  x: number;
  y: number;
  matrixSet: TileMatrixSet;
}

export interface TileBoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface VectorFeatureStream {
  featureCount: number;
  positions: Float32Array;   // 3 * N (xyz)
  target2D: Float32Array;    // 2 * N (xy)
  featureIds: Uint32Array;   // N
  attributeMap: Map<string, ArrayLike<number>>;
}

export class OGCTileEngine {
  private cache: Map<string, { tile: TileCoordinate; data: ArrayBuffer }> = new Map();
  private maxCacheSize: number;

  constructor(maxCacheSize: number = 256) {
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Computes WMTS quadtree tile key string "matrixSet/z/x/y"
   */
  public getTileKey(tile: TileCoordinate): string {
    return `${tile.matrixSet}/${tile.z}/${tile.x}/${tile.y}`;
  }

  /**
   * Calculates bounding box (minLon, maxLon, minLat, maxLat) for a tile coordinate
   */
  public computeTileBoundingBox(tile: TileCoordinate): TileBoundingBox {
    const { z, x, y, matrixSet } = tile;
    const numTiles = 1 << z; // 2^z

    if (matrixSet === 'WorldCRS84Quad') {
      const tileWidthLon = 360.0 / numTiles;
      const tileHeightLat = 180.0 / numTiles;

      const minLon = -180.0 + x * tileWidthLon;
      const maxLon = minLon + tileWidthLon;
      const maxLat = 90.0 - y * tileHeightLat;
      const minLat = maxLat - tileHeightLat;

      return { minLon, maxLon, minLat, maxLat };
    } else {
      // WebMercatorQuad
      const tileWidthLon = 360.0 / numTiles;
      const minLon = -180.0 + x * tileWidthLon;
      const maxLon = minLon + tileWidthLon;

      const n1 = Math.PI - (2.0 * Math.PI * y) / numTiles;
      const n2 = Math.PI - (2.0 * Math.PI * (y + 1)) / numTiles;

      const maxLat = (180.0 / Math.PI) * Math.atan(0.5 * (Math.exp(n1) - Math.exp(-n1)));
      const minLat = (180.0 / Math.PI) * Math.atan(0.5 * (Math.exp(n2) - Math.exp(-n2)));

      return { minLon, maxLon, minLat, maxLat };
    }
  }

  /**
   * Traverses quadtree index pyramid to find all intersecting tiles at target zoom z
   */
  public traversePyramid(
    bounds: TileBoundingBox,
    zoomLevel: number,
    matrixSet: TileMatrixSet = 'WorldCRS84Quad'
  ): TileCoordinate[] {
    const tiles: TileCoordinate[] = [];
    const z = Math.max(0, Math.min(22, Math.floor(zoomLevel)));
    const numTiles = 1 << z;

    if (matrixSet === 'WorldCRS84Quad') {
      const tileWidthLon = 360.0 / numTiles;
      const tileHeightLat = 180.0 / numTiles;

      const minX = Math.max(0, Math.floor((bounds.minLon + 180.0) / tileWidthLon));
      const maxX = Math.min(numTiles - 1, Math.floor((bounds.maxLon + 180.0) / tileWidthLon));

      const minY = Math.max(0, Math.floor((90.0 - bounds.maxLat) / tileHeightLat));
      const maxY = Math.min(numTiles - 1, Math.floor((90.0 - bounds.minLat) / tileHeightLat));

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tiles.push({ z, x, y, matrixSet });
        }
      }
    } else {
      // WebMercatorQuad
      const clampLat = (lat: number) => Math.max(-85.05112878, Math.min(85.05112878, lat));
      const latToY = (lat: number) => {
        const rad = (clampLat(lat) * Math.PI) / 180.0;
        return Math.floor(((1.0 - Math.log(Math.tan(rad) + 1.0 / Math.cos(rad)) / Math.PI) / 2.0) * numTiles);
      };

      const minX = Math.max(0, Math.floor(((bounds.minLon + 180.0) / 360.0) * numTiles));
      const maxX = Math.min(numTiles - 1, Math.floor(((bounds.maxLon + 180.0) / 360.0) * numTiles));

      const minY = Math.max(0, Math.min(numTiles - 1, latToY(bounds.maxLat)));
      const maxY = Math.max(0, Math.min(numTiles - 1, latToY(bounds.minLat)));

      for (let x = minX; x <= maxX; x++) {
        for (let y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y++) {
          tiles.push({ z, x, y, matrixSet });
        }
      }
    }

    return tiles;
  }

  /**
   * OGC API - Features zero-copy vector stream parsing: parses GeoJSON / FlatGeobuf features directly into GPU buffers
   */
  public parseVectorFeatureStream(geoJson: any): VectorFeatureStream {
    const features = geoJson?.features || [];
    const featureCount = features.length;

    let totalPoints = 0;
    features.forEach((f: any) => {
      const geomType = f?.geometry?.type;
      const coords = f?.geometry?.coordinates;
      if (geomType === 'Point') totalPoints += 1;
      else if (geomType === 'LineString' && Array.isArray(coords)) totalPoints += coords.length;
      else if (geomType === 'Polygon' && Array.isArray(coords?.[0])) totalPoints += coords[0].length;
    });

    const positions = new Float32Array(totalPoints * 3);
    const target2D = new Float32Array(totalPoints * 2);
    const featureIds = new Uint32Array(totalPoints);
    const attributeMap = new Map<string, ArrayLike<number>>();

    let pointIdx = 0;
    const R = 5.0;

    features.forEach((f: any, fIdx: number) => {
      const coordsList: number[][] = [];
      const geomType = f?.geometry?.type;
      const geomCoords = f?.geometry?.coordinates;

      if (geomType === 'Point' && Array.isArray(geomCoords)) {
        coordsList.push(geomCoords);
      } else if (geomType === 'LineString' && Array.isArray(geomCoords)) {
        coordsList.push(...geomCoords);
      } else if (geomType === 'Polygon' && Array.isArray(geomCoords?.[0])) {
        coordsList.push(...geomCoords[0]);
      }

      coordsList.forEach(([lon, lat]) => {
        const radLon = (lon * Math.PI) / 180.0;
        const radLat = (lat * Math.PI) / 180.0;

        // 3D Sphere position: (R cos lat sin lon, R sin lat, R cos lat cos lon)
        const x3D = R * Math.cos(radLat) * Math.sin(radLon);
        const y3D = R * Math.sin(radLat);
        const z3D = R * Math.cos(radLat) * Math.cos(radLon);

        // 2D Web Mercator target position
        const x2D = R * radLon;
        const y2D = R * Math.log(Math.tan(Math.PI / 4.0 + radLat / 2.0));

        positions[pointIdx * 3 + 0] = x3D;
        positions[pointIdx * 3 + 1] = y3D;
        positions[pointIdx * 3 + 2] = z3D;

        target2D[pointIdx * 2 + 0] = x2D;
        target2D[pointIdx * 2 + 1] = isNaN(y2D) ? 0 : y2D;

        featureIds[pointIdx] = fIdx;
        pointIdx++;
      });
    });

    return {
      featureCount,
      positions,
      target2D,
      featureIds,
      attributeMap,
    };
  }

  public storeTileInCache(tile: TileCoordinate, data: ArrayBuffer): void {
    const key = this.getTileKey(tile);
    if (this.cache.size >= this.maxCacheSize) {
      // LRU eviction of first entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { tile, data });
  }

  public getCachedTile(tile: TileCoordinate): ArrayBuffer | undefined {
    const key = this.getTileKey(tile);
    const item = this.cache.get(key);
    if (item) {
      // Refresh LRU order
      this.cache.delete(key);
      this.cache.set(key, item);
      return item.data;
    }
    return undefined;
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
