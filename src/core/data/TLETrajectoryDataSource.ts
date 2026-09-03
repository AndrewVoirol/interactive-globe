// ============================================================================
// File: src/core/data/TLETrajectoryDataSource.ts
// Procedural Mock Data Generator: Synthetic Orbital Trajectory Ephemeris
// Note: Procedural/synthetic mock data generator for testing orbital trajectory renderers.
//       Synthesizes analytical circular orbital trajectories; does not parse NORAD two-line elements.
// ============================================================================

import { IDataSource, DataSourceCategory, BoundingBox3D, SpatialDataChunk } from './IDataSource';

export interface SatelliteMetadata {
  noradId: number;
  name: string;
  inclinationDeg: number;
  periodMinutes: number;
}

/**
 * Procedural mock data source that computes analytical circular orbital paths
 * for validating satellite trajectory visualization pipelines without external SGP4/TLE dependencies.
 */
export class TLETrajectoryDataSource implements IDataSource<SatelliteMetadata> {
  public readonly id: string;
  public readonly type: DataSourceCategory = 'point';
  public readonly isStreaming = true;

  private lastChunk: SpatialDataChunk<SatelliteMetadata> | null = null;

  constructor(id: string = 'spacex-norad-tle') {
    this.id = id;
  }

  public async fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<SatelliteMetadata>> {
    const satCount = 500;
    const positions = new Float32Array(satCount * 3);
    const velocities = new Float32Array(satCount * 3);

    for (let i = 0; i < satCount; i++) {
      const theta = (i / satCount) * Math.PI * 2;
      const r = 5.6; // 400km LEO altitude scaled to globe radius (5.0 + 0.6)

      positions[i * 3 + 0] = r * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(theta * 0.5);
      positions[i * 3 + 2] = r * Math.sin(theta);

      velocities[i * 3 + 0] = -0.1 * Math.sin(theta);
      velocities[i * 3 + 1] = 0.05 * Math.cos(theta * 0.5);
      velocities[i * 3 + 2] = 0.1 * Math.cos(theta);
    }

    const attributes = new Map<string, Float32Array>();
    attributes.set('position', positions);
    attributes.set('velocity', velocities);

    this.lastChunk = {
      chunkId: `tle-chunk-${Date.now()}`,
      bounds,
      vertexCount: satCount,
      attributes,
      meta: { noradId: 25544, name: 'ISS / Starlink Constellation', inclinationDeg: 51.64, periodMinutes: 92.68 }
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
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
