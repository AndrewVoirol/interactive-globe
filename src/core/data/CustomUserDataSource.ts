// ============================================================================
// File: src/core/data/CustomUserDataSource.ts
// Ingestion Driver: Custom User CSV / GeoJSON Client Ingestion Source
// ============================================================================

import { IDataSource, DataSourceCategory, BoundingBox3D, SpatialDataChunk } from './IDataSource';

export interface CustomUserMetadata {
  filename: string;
  rowCount: number;
  columns: string[];
}

export class CustomUserDataSource implements IDataSource<CustomUserMetadata> {
  public readonly id: string;
  public readonly type: DataSourceCategory = 'point';
  public readonly isStreaming = false;

  private userPositions: Float32Array | null = null;
  private lastChunk: SpatialDataChunk<CustomUserMetadata> | null = null;

  constructor(id: string = 'custom-user-csv') {
    this.id = id;
  }

  public parseCSV(csvContent: string): void {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return;

    const dataRows = lines.slice(1);
    const count = dataRows.length;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const parts = dataRows[i].split(',');
      const lat = parseFloat(parts[0]) || 0;
      const lon = parseFloat(parts[1]) || 0;
      const val = parseFloat(parts[2]) || 0;

      positions[i * 3 + 0] = lon;
      positions[i * 3 + 1] = lat;
      positions[i * 3 + 2] = val;
    }

    this.userPositions = positions;
  }

  public async fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<CustomUserMetadata>> {
    const pos = this.userPositions || new Float32Array([0, 0, 0]);
    const vertexCount = pos.length / 3;

    const attributes = new Map<string, Float32Array>();
    attributes.set('position', pos);

    this.lastChunk = {
      chunkId: `user-data-${Date.now()}`,
      bounds,
      vertexCount,
      attributes,
      meta: { filename: 'custom_data.csv', rowCount: vertexCount, columns: ['lat', 'lon', 'value'] }
    };

    return this.lastChunk;
  }

  public toGPUBinding(deviceOrGl?: GPUDevice | WebGL2RenderingContext): GPUBuffer | WebGLBuffer | null {
    if (!this.userPositions) return null;

    if (deviceOrGl && 'createBuffer' in deviceOrGl && typeof deviceOrGl.createBuffer === 'function') {
      const device = deviceOrGl as GPUDevice;
      if ('queue' in device && device.queue) {
        const buffer = device.createBuffer({
          size: this.userPositions.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffer, 0, this.userPositions.buffer, this.userPositions.byteOffset, this.userPositions.byteLength);
        return buffer;
      }
    }
    return null;
  }

  public async disconnect(): Promise<void> {
    this.userPositions = null;
    this.lastChunk = null;
  }
}
