// ============================================================================
// File: src/core/data/IDataSource.ts
// Architecture: Heterogeneous Data Ingestion Architecture
// Description: Common interface for raster, vector, point, and field drivers
// ============================================================================

export type DataSourceCategory = 'raster' | 'vector' | 'point' | 'field';

export interface BoundingBox3D {
  minLon: number; maxLon: number;
  minLat: number; maxLat: number;
  minAlt: number; maxAlt: number;
}

export interface SpatialDataChunk<T = Record<string, any>> {
  chunkId: string;
  bounds: BoundingBox3D;
  vertexCount: number;
  attributes: Map<string, Float32Array | Uint32Array>;
  meta: T;
}

export interface IDataSource<TMeta = Record<string, any>> {
  readonly id: string;
  readonly type: DataSourceCategory;
  readonly isStreaming?: boolean;

  /**
   * Establish network sockets or stream endpoints
   */
  connect?(endpointUrl: string): Promise<boolean>;

  /**
   * Fetch spatial chunk bounded by lat/lon/altitude window and zoom level
   */
  fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<TMeta>>;

  /**
   * Convert latest chunk attributes to a GPU Buffer (WebGPU or WebGL Buffer)
   */
  toGPUBinding(deviceOrGl?: GPUDevice | WebGL2RenderingContext): GPUBuffer | WebGLBuffer | null;

  /**
   * Optional physics driver field data (force vector/displacement field)
   */
  getPhysicsField?(): Float32Array | null;

  /**
   * Disconnect and release resources
   */
  disconnect?(): Promise<void>;
}
