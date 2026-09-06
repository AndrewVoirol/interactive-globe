// ============================================================================
// File: src/core/data/TLETrajectoryDataSource.ts
// CelesTrak Starlink & ISS TLE Orbit Data Source (with procedural / synthetic fallback)
// Implements NORAD Two-Line Element (TLE) ingestion & Keplerian / SGP4 orbital propagation.
// ============================================================================

import { IDataSource, DataSourceCategory, BoundingBox3D, SpatialDataChunk } from './IDataSource';
import { parseTLE, propagateOrbitalState, TLEOrbitalElements } from '../math/sgp4';

export interface SatelliteMetadata {
  noradId: number;
  name: string;
  inclinationDeg: number;
  periodMinutes: number;
  semiMajorAxisKm: number;
  eccentricity: number;
}

export interface TLERecord {
  name: string;
  line1: string;
  line2: string;
}

/**
 * Planetary Satellite Trajectory Data Source that ingests CelesTrak active Starlink & ISS TLEs
 * and propagates real-time Keplerian / SGP4 orbital trajectories.
 */
export class TLETrajectoryDataSource implements IDataSource<SatelliteMetadata> {
  public readonly id: string;
  public readonly type: DataSourceCategory = 'point';
  public readonly isStreaming = true;

  private lastChunk: SpatialDataChunk<SatelliteMetadata> | null = null;
  private satellites: TLERecord[] = [];
  private parsedElements: Array<{ record: TLERecord; elements: TLEOrbitalElements }> = [];

  constructor(id: string = 'spacex-norad-tle') {
    this.id = id;
    this.initDefaultCatalog();
  }

  /**
   * Initializes canonical default catalog (ISS 25544 and Starlink records).
   */
  private initDefaultCatalog(): void {
    const defaultRecords: TLERecord[] = [
      {
        name: 'ISS (ZARYA)',
        line1: '1 25544U 98067A   26248.84752315  .00012456  00000+0  22485-3 0  9998',
        line2: '2 25544  51.6418 214.3294 0005824  69.2541 290.9142 15.49842106512340',
      },
      {
        name: 'TIANGONG (CSS)',
        line1: '1 48274U 21035A   26248.61420138  .00018520  00000+0  21500-3 0  9999',
        line2: '2 48274  41.4720 180.2150 0004500  85.3400 274.8200 15.62500000184208',
      },
      {
        name: 'STARLINK-30001',
        line1: '1 55000U 23001A   26248.50000000  .00005000  00000+0  10000-3 0  9991',
        line2: '2 55000  53.2000 120.5000 0001500  45.0000 315.0000 15.05000000123450',
      },
      {
        name: 'STARLINK-30002',
        line1: '1 55001U 23001B   26248.51000000  .00005000  00000+0  10000-3 0  9993',
        line2: '2 55001  53.2000 140.5000 0001500  45.0000 335.0000 15.05000000123455',
      },
    ];

    this.setSatellites(defaultRecords);
  }

  public setSatellites(records: TLERecord[]): void {
    this.satellites = records;
    this.parsedElements = records.map((record) => ({
      record,
      elements: parseTLE(record.line1, record.line2),
    }));
  }

  /**
   * Loads TLE JSON array from disk or URL.
   */
  public async loadTLE(urlOrData?: string | TLERecord[]): Promise<void> {
    if (Array.isArray(urlOrData)) {
      this.setSatellites(urlOrData);
      return;
    }

    const defaultUrl = typeof urlOrData === 'string' ? urlOrData : '/data/tle-starlink.json';

    // 1. Browser environment fetch
    if (typeof fetch !== 'undefined') {
      try {
        const response = await fetch(defaultUrl);
        if (response.ok) {
          const list = await response.json();
          if (Array.isArray(list) && list.length > 0) {
            this.setSatellites(list);
            return;
          }
        }
      } catch {
        // Fall through
      }
    }

    // 2. Node / test environment filesystem access
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        const fs = await import(/* @vite-ignore */ 'fs');
        const path = await import(/* @vite-ignore */ 'path');
        const candidates = [
          path.resolve(process.cwd(), 'public/data/tle-starlink.json'),
          path.resolve(__dirname, '../../../public/data/tle-starlink.json'),
          path.resolve(defaultUrl),
        ];

        for (const p of candidates) {
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf8');
            const list = JSON.parse(raw);
            if (Array.isArray(list) && list.length > 0) {
              this.setSatellites(list);
              return;
            }
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  public async fetch(bounds: BoundingBox3D, zoom: number): Promise<SpatialDataChunk<SatelliteMetadata>> {
    if (this.parsedElements.length === 0) {
      await this.loadTLE();
    }

    const satCount = 500; // Standard 500 orbital trajectory points
    const positions = new Float32Array(satCount * 3);
    const velocities = new Float32Array(satCount * 3);

    const numSats = Math.max(1, this.parsedElements.length);
    const pointsPerSat = Math.floor(satCount / numSats);
    let sampleIdx = 0;

    // Propagate orbital arcs across satellites
    for (let s = 0; s < numSats && sampleIdx < satCount; s++) {
      const { elements } = this.parsedElements[s];
      const periodSec = (2 * Math.PI) / elements.meanMotionRadPerSec;

      const ptsForThis = (s === numSats - 1) ? (satCount - sampleIdx) : pointsPerSat;

      for (let p = 0; p < ptsForThis; p++) {
        const t = (p / ptsForThis) * periodSec;
        const state = propagateOrbitalState(elements, t, 6378.137, 5.0);

        positions[sampleIdx * 3 + 0] = state.position[0];
        positions[sampleIdx * 3 + 1] = state.position[1];
        positions[sampleIdx * 3 + 2] = state.position[2];

        velocities[sampleIdx * 3 + 0] = state.velocity[0];
        velocities[sampleIdx * 3 + 1] = state.velocity[1];
        velocities[sampleIdx * 3 + 2] = state.velocity[2];

        sampleIdx++;
      }
    }

    const attributes = new Map<string, Float32Array>();
    attributes.set('position', positions);
    attributes.set('velocity', velocities);

    const primary = this.parsedElements[0] || {
      elements: {
        catalogNumber: 25544,
        inclinationRad: 51.64 * (Math.PI / 180),
        meanMotionRadPerSec: 0.001126,
        semiMajorAxisKm: 6790.0,
        eccentricity: 0.0005,
      },
      record: { name: 'ISS (ZARYA)' },
    };

    const periodMin = (2 * Math.PI) / (primary.elements.meanMotionRadPerSec * 60);

    this.lastChunk = {
      chunkId: `tle-chunk-${Date.now()}`,
      bounds,
      vertexCount: satCount,
      attributes,
      meta: {
        noradId: primary.elements.catalogNumber,
        name: primary.record.name,
        inclinationDeg: primary.elements.inclinationRad * (180 / Math.PI),
        periodMinutes: periodMin,
        semiMajorAxisKm: primary.elements.semiMajorAxisKm,
        eccentricity: primary.elements.eccentricity,
      },
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

  public getSatellites(): TLERecord[] {
    return this.satellites;
  }

  public async disconnect(): Promise<void> {
    this.lastChunk = null;
    this.satellites = [];
    this.parsedElements = [];
  }
}
