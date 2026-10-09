// ============================================================================
// File: tests/modern/data-provenance-overlay.test.tsx
// DataProvenanceOverlay Unit & Integration Tests (Precision Terrain Phase 5)
// ============================================================================

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import {
  DataProvenanceOverlay,
  getActiveInsetDataset,
  formatLatitude,
  formatLongitude,
  formatAltitude,
  formatGroundElevation,
  formatWaterDepth,
} from '../../src/components/hud/DataProvenanceOverlay';
import { AtmosphereDrawer } from '../../src/components/AtmosphereDrawer';
import {
  updateProvenanceTelemetry,
  getProvenanceTelemetry,
  DEFAULT_PROVENANCE_TELEMETRY,
} from '../../src/core/DevToolsAPI';

describe('DataProvenanceOverlay & Provenance Telemetry (Phase 5)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // Reset to defaults
    updateProvenanceTelemetry(DEFAULT_PROVENANCE_TELEMETRY);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (window as any).__INDICATRIX_CAMERA__;
    delete (window as any).__INDICATRIX_ENGINE__;
    delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    delete (window as any).__INDICATRIX_PROVENANCE_TELEMETRY__;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Rendering & Invariant Metadata Checks
  // --------------------------------------------------------------------------
  it('PROV-01: renders card with required base dataset, vertical datum, and telemetry labels', async () => {
    await act(async () => {
      root.render(<DataProvenanceOverlay theme={0} />);
    });

    const card = container.querySelector('[data-testid="data-provenance-overlay"]');
    expect(card).not.toBeNull();

    // Required Authoritative Strings
    expect(card?.textContent).toContain('GEBCO 2024 / FABDEM Bare-Earth (15 arc-sec / 30m)');
    expect(card?.textContent).toContain('WGS84 Ellipsoidal / EGM2008 Geoid Corrected');

    // Section Titles and Headers
    expect(card?.textContent).toContain('Data Provenance');
    expect(card?.textContent).toContain('Active Base Dataset:');
    expect(card?.textContent).toContain('Active Inset Dataset:');
    expect(card?.textContent).toContain('Vertical Datum:');
    expect(card?.textContent).toContain('Cursor Telemetry');
    expect(card?.textContent).toContain('Latitude:');
    expect(card?.textContent).toContain('Longitude:');
    expect(card?.textContent).toContain('Altitude:');
    expect(card?.textContent).toContain('Ground Elevation:');
    expect(card?.textContent).toContain('Water Depth:');
  });

  // --------------------------------------------------------------------------
  // 2. Active Inset Litmus Bounds Geodesy
  // --------------------------------------------------------------------------
  it('PROV-02: dynamically switches to NOAA CUDEM (3m LiDAR) in Hawaii and Cape Cod litmus zones', () => {
    // Hawaii bounds (18°N-23°N, 161°W-154°W)
    expect(getActiveInsetDataset(19.8206, -155.4681)).toBe('NOAA CUDEM (3m LiDAR)');
    expect(getActiveInsetDataset(20.0, -158.0)).toBe('NOAA CUDEM (3m LiDAR)');

    // Cape Cod bounds (41°N-43°N, 71°W-69°W)
    expect(getActiveInsetDataset(41.6688, -70.2962)).toBe('NOAA CUDEM (3m LiDAR)');
    expect(getActiveInsetDataset(42.0, -70.0)).toBe('NOAA CUDEM (3m LiDAR)');

    // Engine regional active override
    expect(getActiveInsetDataset(0, 0, 'hawaii')).toBe('NOAA CUDEM (3m LiDAR)');
    expect(getActiveInsetDataset(0, 0, 'capecod')).toBe('NOAA CUDEM (3m LiDAR)');
  });

  it('PROV-03: dynamically switches to USGS 3DEP (30m) in Grand Canyon litmus zone', () => {
    // Grand Canyon bounds (35.9°N-36.5°N, 112.5°W-111.5°W)
    expect(getActiveInsetDataset(36.0544, -112.1401)).toBe('USGS 3DEP (30m)');
    expect(getActiveInsetDataset(36.1, -112.0)).toBe('USGS 3DEP (30m)');

    // Engine regional active override
    expect(getActiveInsetDataset(0, 0, 'grand-canyon')).toBe('USGS 3DEP (30m)');
  });

  it('PROV-03b: dynamically switches to Copernicus GLO-30 (30m) in Mount Fuji litmus zone', () => {
    // Mount Fuji bounds (35.2°N-35.5°N, 138.5°E-139.0°E)
    expect(getActiveInsetDataset(35.3606, 138.7274)).toBe('Copernicus GLO-30 (30m)');
    expect(getActiveInsetDataset(35.4, 138.8)).toBe('Copernicus GLO-30 (30m)');

    // Engine regional active override
    expect(getActiveInsetDataset(0, 0, 'fuji')).toBe('Copernicus GLO-30 (30m)');
  });

  it('PROV-04: defaults to None (Global Topobathy) outside regional litmus bounds', () => {
    // Mount Everest
    expect(getActiveInsetDataset(27.9881, 86.9250)).toBe('None (Global Topobathy)');
    // Mariana Trench
    expect(getActiveInsetDataset(11.3733, 142.5917)).toBe('None (Global Topobathy)');
    // Null/undefined coordinates
    expect(getActiveInsetDataset(undefined, undefined)).toBe('None (Global Topobathy)');
  });

  // --------------------------------------------------------------------------
  // 3. Reactive DevToolsAPI Streaming (Zero-Thrash Verification)
  // --------------------------------------------------------------------------
  it('PROV-05: updates DOM text directly via DevToolsAPI reactive streaming without re-mounting', async () => {
    await act(async () => {
      root.render(<DataProvenanceOverlay theme={1} />);
    });

    const latEl = container.querySelector('[data-testid="telemetry-cursor-lat"]');
    const lonEl = container.querySelector('[data-testid="telemetry-cursor-lon"]');
    const altEl = container.querySelector('[data-testid="telemetry-cursor-alt"]');
    const elevEl = container.querySelector('[data-testid="telemetry-ground-elev"]');
    const depthEl = container.querySelector('[data-testid="telemetry-water-depth"]');
    const insetEl = container.querySelector('[data-testid="provenance-inset-dataset"]');

    expect(latEl).not.toBeNull();
    expect(lonEl).not.toBeNull();

    // Stream Everest telemetry update
    act(() => {
      updateProvenanceTelemetry({
        latitude: 27.9881,
        longitude: 86.925,
        altitudeMeters: 850,
        groundElevationMeters: 8848.86,
        waterDepthMeters: 0,
        insetDataset: 'None (Global Topobathy)',
      });
    });

    expect(latEl?.textContent).toBe('27.9881° N');
    expect(lonEl?.textContent).toBe('86.9250° E');
    expect(altEl?.textContent).toBe('850 m');
    expect(elevEl?.textContent).toBe('+8,849 m');
    expect(depthEl?.textContent).toBe('0 m');
    expect(insetEl?.textContent).toBe('None (Global Topobathy)');

    // Stream Mariana Trench telemetry update
    act(() => {
      updateProvenanceTelemetry({
        latitude: -11.3733,
        longitude: 142.5917,
        altitudeMeters: 12000,
        groundElevationMeters: -10924.0,
        waterDepthMeters: 10924.0,
        insetDataset: 'None (Global Topobathy)',
      });
    });

    expect(latEl?.textContent).toBe('11.3733° S');
    expect(lonEl?.textContent).toBe('142.5917° E');
    expect(altEl?.textContent).toBe('12 km');
    expect(elevEl?.textContent).toBe('-10,924 m');
    expect(depthEl?.textContent).toBe('10,924 m');

    // Stream Hawaii litmus zone telemetry update
    act(() => {
      updateProvenanceTelemetry({
        latitude: 19.8206,
        longitude: -155.4681,
        altitudeMeters: 25,
        groundElevationMeters: 4207.3,
        waterDepthMeters: 0,
        insetDataset: 'NOAA CUDEM (3m LiDAR)',
      });
    });

    expect(latEl?.textContent).toBe('19.8206° N');
    expect(lonEl?.textContent).toBe('155.4681° W');
    expect(altEl?.textContent).toBe('25 m');
    expect(elevEl?.textContent).toBe('+4,207 m');
    expect(insetEl?.textContent).toBe('NOAA CUDEM (3m LiDAR)');
  });

  // --------------------------------------------------------------------------
  // 4. AtmosphereDrawer Integration Test
  // --------------------------------------------------------------------------
  it('PROV-06: mounts seamlessly inside AtmosphereDrawer alongside StratosphericTelemetry', async () => {
    await act(async () => {
      root.render(<AtmosphereDrawer theme={0} showClouds={true} />);
    });

    const provCard = container.querySelector('[data-testid="data-provenance-overlay"]');
    const stratCard = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');

    expect(provCard).not.toBeNull();
    expect(stratCard).not.toBeNull();
    expect(provCard?.textContent).toContain('Active Base Dataset:');
    expect(provCard?.textContent).toContain('GEBCO 2024 / FABDEM Bare-Earth');
  });

  // --------------------------------------------------------------------------
  // 5. Formatting Utilities & Robustness
  // --------------------------------------------------------------------------
  it('PROV-07: formats coordinates, altitudes, elevations, and water depths accurately', () => {
    expect(formatLatitude(0)).toBe('0.0000° N');
    expect(formatLatitude(45.5)).toBe('45.5000° N');
    expect(formatLatitude(-33.8688)).toBe('33.8688° S');

    expect(formatLongitude(0)).toBe('0.0000° E');
    expect(formatLongitude(139.6917)).toBe('139.6917° E');
    expect(formatLongitude(-122.4194)).toBe('122.4194° W');

    expect(formatAltitude(50)).toBe('50 m');
    expect(formatAltitude(15000)).toBe('15 km');
    expect(formatAltitude(12742000)).toBe('12,742 km');

    expect(formatGroundElevation(0)).toBe('0 m');
    expect(formatGroundElevation(4478)).toBe('+4,478 m');
    expect(formatGroundElevation(-5000)).toBe('-5,000 m');

    expect(formatWaterDepth(0)).toBe('0 m');
    expect(formatWaterDepth(-100)).toBe('0 m');
    expect(formatWaterDepth(3812)).toBe('3,812 m');
  });
});
