// ============================================================================
// File: src/core/data/GeoTIFFDataSource.ts
// Procedural Mock Data Generator: Synthetic Cloud-Optimized GeoTIFF (COG) Surface
// Note: Procedural/synthetic mock data generator for testing raster DEM rendering.
//       Synthesizes analytical sinusoidal elevation grids; does not parse external TIFF binaries.
// ============================================================================

import { IDataSource, DataSourceCategory, BoundingBox3D, SpatialDataChunk } from './IDataSource';

export interface GeoTIFFMetadata {
  projection: string;
  bands: number;
  width: number;
  height: number;
  nodata?: number;
}

/**
 * Procedural mock data source that generates synthetic DEM elevation grids
 * via analytical trigonometric equations for deterministic rendering pipeline verification.
 */
export class GeoTIFFDataSource implements IDataSource<GeoTIFFMetadata> {
  public readonly id: string;
  public readonly type: DataSourceCategory = 'raster';
  public readonly isStreaming = false;

  private endpointUrl: string = '';
  private lastChunk: SpatialDataChunk<GeoTIFFMetadata> | null = null;
  private gpuBuffer: GPUBuffer | WebGLBuffer | null = null;

  constructor(id: string = 'nasa-eosdis-geotiff') {
    this.id = id;
  }

  public async connect(endpointUrl: string): Promise<boolean> {
    this.endpointUrl = endpointUrl;
    return true;
  }

  public async fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<GeoTIFFMetadata>> {
    const width = 256;
    const height = 256;
    const vertexCount = width * height;
    const elevationData = new Float32Array(vertexCount);

    // Synthesize DEM elevation sample grid based on bounds
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const u = x / width;
        const v = y / height;
        elevationData[idx] = Math.sin(u * Math.PI * 4) * Math.cos(v * Math.PI * 4) * 500;
      }
    }

    const attributes = new Map<string, Float32Array>();
    attributes.set('elevation', elevationData);

    this.lastChunk = {
      chunkId: `cog-${zoom}-${bounds.minLon.toFixed(1)}-${bounds.minLat.toFixed(1)}`,
      bounds,
      vertexCount,
      attributes,
      meta: { projection: 'EPSG:4326', bands: 1, width, height, nodata: -9999 }
    };

    return this.lastChunk;
  }

  public toGPUBinding(deviceOrGl?: GPUDevice | WebGL2RenderingContext): GPUBuffer | WebGLBuffer | null {
    if (!this.lastChunk) return null;
    const elevationData = this.lastChunk.attributes.get('elevation');
    if (!elevationData) return null;

    if (deviceOrGl && 'createBuffer' in deviceOrGl && typeof deviceOrGl.createBuffer === 'function') {
      const device = deviceOrGl as GPUDevice;
      if ('queue' in device && device.queue) {
        const buffer = device.createBuffer({
          size: elevationData.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffer, 0, elevationData.buffer, elevationData.byteOffset, elevationData.byteLength);
        this.gpuBuffer = buffer;
        return buffer;
      }
    }
    return null;
  }

  public getPhysicsField(): Float32Array | null {
    const attr = this.lastChunk?.attributes.get('elevation');
    return attr instanceof Float32Array ? attr : null;
  }

  public async disconnect(): Promise<void> {
    this.lastChunk = null;
    this.gpuBuffer = null;
  }
}
