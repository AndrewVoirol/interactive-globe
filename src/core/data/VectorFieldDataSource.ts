// ============================================================================
// File: src/core/data/VectorFieldDataSource.ts
// Procedural Mock Data Generator: Synthetic Atmospheric / Oceanic Vector Field
// Note: Procedural/synthetic mock data generator for testing vector flow renderers.
//       Synthesizes bounded random velocity grids; does not parse external GRIB2 files.
// ============================================================================

import { IDataSource, DataSourceCategory, BoundingBox3D, SpatialDataChunk } from './IDataSource';

export interface VectorFieldMetadata {
  parameter: 'wind_u_v' | 'ocean_current' | 'magnetic_field';
  gridResolutionDeg: number;
  uMin: number; uMax: number;
  vMin: number; vMax: number;
}

/**
 * Procedural mock data source that generates synthetic 2D/3D velocity vector grids
 * for testing particle advection and vector field visualizations without GRIB2 decoders.
 */
export class VectorFieldDataSource implements IDataSource<VectorFieldMetadata> {
  public readonly id: string;
  public readonly type: DataSourceCategory = 'field';
  public readonly isStreaming = true;

  private lastChunk: SpatialDataChunk<VectorFieldMetadata> | null = null;
  private physicsVectors: Float32Array | null = null;

  constructor(id: string = 'noaa-nws-grib2-wind') {
    this.id = id;
  }

  public async fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<VectorFieldMetadata>> {
    const gridDim = 64; // 64x64 grid
    const totalNodes = gridDim * gridDim;
    const vectors = new Float32Array(totalNodes * 4); // u, v, w, magnitude

    for (let i = 0; i < totalNodes; i++) {
      const u = (Math.random() - 0.5) * 30.0; // Wind U component (-15..15 m/s)
      const v = (Math.random() - 0.5) * 30.0; // Wind V component (-15..15 m/s)
      const mag = Math.sqrt(u * u + v * v);

      vectors[i * 4 + 0] = u;
      vectors[i * 4 + 1] = v;
      vectors[i * 4 + 2] = 0.0;
      vectors[i * 4 + 3] = mag;
    }

    this.physicsVectors = vectors;

    const attributes = new Map<string, Float32Array>();
    attributes.set('vectorField', vectors);

    this.lastChunk = {
      chunkId: `vectorfield-${zoom}-${Date.now()}`,
      bounds,
      vertexCount: totalNodes,
      attributes,
      meta: {
        parameter: 'wind_u_v',
        gridResolutionDeg: 0.5,
        uMin: -15.0, uMax: 15.0,
        vMin: -15.0, vMax: 15.0,
      }
    };

    return this.lastChunk;
  }

  public toGPUBinding(deviceOrGl?: GPUDevice | WebGL2RenderingContext): GPUBuffer | WebGLBuffer | null {
    if (!this.physicsVectors) return null;

    if (deviceOrGl && 'createBuffer' in deviceOrGl && typeof deviceOrGl.createBuffer === 'function') {
      const device = deviceOrGl as GPUDevice;
      if ('queue' in device && device.queue) {
        const buffer = device.createBuffer({
          size: this.physicsVectors.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffer, 0, this.physicsVectors.buffer, this.physicsVectors.byteOffset, this.physicsVectors.byteLength);
        return buffer;
      }
    }
    return null;
  }

  public getPhysicsField(): Float32Array | null {
    return this.physicsVectors;
  }

  public async disconnect(): Promise<void> {
    this.lastChunk = null;
    this.physicsVectors = null;
  }
}
