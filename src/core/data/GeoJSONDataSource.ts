// ============================================================================
// File: src/core/data/GeoJSONDataSource.ts
// Procedural Mock Data Generator: Synthetic Vector Boundary Points
// Note: Procedural/synthetic mock data generator for testing vector boundary pipelines.
//       Synthesizes bounded random coordinate arrays; does not parse external GeoJSON files.
// ============================================================================

import { IDataSource, DataSourceCategory, BoundingBox3D, SpatialDataChunk } from './IDataSource';

export interface GeoJSONMetadata {
  featureCount: number;
  geometryType: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
  layerName: string;
}

/**
 * Procedural mock data source that synthesizes spatial coordinate arrays within
 * specified bounding boxes for testing vector boundary sub-renderers without network I/O.
 */
export class GeoJSONDataSource implements IDataSource<GeoJSONMetadata> {
  public readonly id: string;
  public readonly type: DataSourceCategory = 'vector';
  public readonly isStreaming = false;

  private endpointUrl: string = '';
  private lastChunk: SpatialDataChunk<GeoJSONMetadata> | null = null;

  constructor(id: string = 'usgs-geojson-boundaries') {
    this.id = id;
  }

  public async connect(endpointUrl: string): Promise<boolean> {
    this.endpointUrl = endpointUrl;
    return true;
  }

  public async fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<GeoJSONMetadata>> {
    const pointCount = 1000;
    const positions = new Float32Array(pointCount * 3);

    for (let i = 0; i < pointCount; i++) {
      const lon = bounds.minLon + Math.random() * (bounds.maxLon - bounds.minLon);
      const lat = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
      positions[i * 3 + 0] = lon;
      positions[i * 3 + 1] = lat;
      positions[i * 3 + 2] = 0;
    }

    const attributes = new Map<string, Float32Array>();
    attributes.set('position', positions);

    this.lastChunk = {
      chunkId: `geojson-${zoom}-${Date.now()}`,
      bounds,
      vertexCount: pointCount,
      attributes,
      meta: { featureCount: 1, geometryType: 'LineString', layerName: 'boundaries' }
    };

    return this.lastChunk;
  }

  public toGPUBinding(deviceOrGl?: GPUDevice | WebGL2RenderingContext): GPUBuffer | WebGLBuffer | null {
    if (!this.lastChunk) return null;
    const pos = this.lastChunk.attributes.get('position');
    if (!pos) return null;

    if (deviceOrGl && 'createBuffer' in deviceOrGl && typeof deviceOrGl.createBuffer === 'function') {
      const device = deviceOrGl as GPUDevice;
      if ('queue' in device && device.queue) {
        const buffer = device.createBuffer({
          size: pos.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffer, 0, pos.buffer, pos.byteOffset, pos.byteLength);
        return buffer;
      }
    }
    return null;
  }

  public async disconnect(): Promise<void> {
    this.lastChunk = null;
  }
}
