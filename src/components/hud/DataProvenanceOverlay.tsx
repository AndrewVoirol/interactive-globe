// ============================================================================
// File: src/components/hud/DataProvenanceOverlay.tsx
// Real-time Data Provenance & Geodetic Telemetry Instrument (Precision Terrain Phase 5)
//
// Invariants:
// - Rule 2: 10px Clearance Moat / 20px Gutters
// - Rule 6: Ivory Vellum Card Tone & Single-Border Enclosure
// - Zero-GC / Zero-Thrash: Subscribed to DevToolsAPI reactive store; direct DOM
//   ref mutations bypass React component tree reconciliation.
// ============================================================================

import React, { useEffect, useRef } from 'react';
import {
  ProvenanceTelemetryData,
  DEFAULT_PROVENANCE_TELEMETRY,
  subscribeProvenanceTelemetry,
  getProvenanceTelemetry,
} from '../../core/DevToolsAPI';

export interface DataProvenanceOverlayProps {
  theme?: 0 | 1 | 2; // 0: Marie Tharp, 1: Cream Rag, 2: Prussian Cyanotype
  isLight?: boolean;
  className?: string;

  // Controlled/Testing Prop Overrides
  baseDataset?: string;
  insetDataset?: string;
  verticalDatum?: string;
  latitude?: number;
  longitude?: number;
  altitudeMeters?: number;
  groundElevationMeters?: number;
  waterDepthMeters?: number;
}

/**
 * Determines the active high-resolution regional inset dataset based on
 * litmus test region coordinates and active engine regional DEM state.
 */
export function getActiveInsetDataset(lat?: number, lon?: number, activeRegionId?: string | null): string {
  if (activeRegionId === 'hawaii' || activeRegionId === 'capecod' || activeRegionId === 'cape-cod') {
    return 'NOAA CUDEM (3m LiDAR)';
  }
  if (activeRegionId === 'grand-canyon') {
    return 'USGS 3DEP (30m)';
  }
  if (activeRegionId === 'fuji') {
    return 'Copernicus GLO-30 (30m)';
  }

  if (lat !== undefined && lon !== undefined) {
    // Hawaii litmus bounds: 18°N-23°N, 161°W-154°W
    if (lon >= -161.0 && lon <= -154.0 && lat >= 18.0 && lat <= 23.0) {
      return 'NOAA CUDEM (3m LiDAR)';
    }
    // Cape Cod litmus bounds: 41°N-43°N, 71°W-69°W
    if (lon >= -71.0 && lon <= -69.0 && lat >= 41.0 && lat <= 43.0) {
      return 'NOAA CUDEM (3m LiDAR)';
    }
    // Grand Canyon litmus bounds: 35.9°N-36.5°N, 112.5°W-111.5°W
    if (lon >= -112.5 && lon <= -111.5 && lat >= 35.9 && lat <= 36.5) {
      return 'USGS 3DEP (30m)';
    }
    // Mount Fuji litmus bounds: 35.2°N-35.5°N, 138.5°E-139.0°E
    if (lon >= 138.5 && lon <= 139.0 && lat >= 35.2 && lat <= 35.5) {
      return 'Copernicus GLO-30 (30m)';
    }
  }

  return 'None (Global Topobathy)';
}

export function formatLatitude(lat?: number): string {
  if (lat === undefined || !Number.isFinite(lat)) return '0.0000°';
  const hemi = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(4)}° ${hemi}`;
}

export function formatLongitude(lon?: number): string {
  if (lon === undefined || !Number.isFinite(lon)) return '0.0000°';
  const hemi = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lon).toFixed(4)}° ${hemi}`;
}

export function formatAltitude(altMeters?: number): string {
  if (altMeters === undefined || !Number.isFinite(altMeters)) return '0 m';
  if (Math.abs(altMeters) >= 10000) {
    const km = altMeters / 1000;
    return `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(altMeters).toLocaleString()} m`;
}

export function formatGroundElevation(elevMeters?: number): string {
  if (elevMeters === undefined || !Number.isFinite(elevMeters)) return '0 m';
  const prefix = elevMeters > 0 ? '+' : '';
  return `${prefix}${Math.round(elevMeters).toLocaleString()} m`;
}

export function formatWaterDepth(depthMeters?: number): string {
  if (depthMeters === undefined || !Number.isFinite(depthMeters) || depthMeters <= 0) return '0 m';
  return `${Math.round(depthMeters).toLocaleString()} m`;
}

export const DataProvenanceOverlay: React.FC<DataProvenanceOverlayProps> = ({
  theme: propTheme,
  isLight = false,
  className = '',
  baseDataset: propBaseDataset,
  insetDataset: propInsetDataset,
  verticalDatum: propVerticalDatum,
  latitude: propLat,
  longitude: propLon,
  altitudeMeters: propAlt,
  groundElevationMeters: propElev,
  waterDepthMeters: propDepth,
}) => {
  // DOM element refs for zero-thrash, zero-reconciliation in-place text updates
  const baseSpanRef = useRef<HTMLSpanElement>(null);
  const insetSpanRef = useRef<HTMLSpanElement>(null);
  const datumSpanRef = useRef<HTMLSpanElement>(null);
  const latSpanRef = useRef<HTMLSpanElement>(null);
  const lonSpanRef = useRef<HTMLSpanElement>(null);
  const altSpanRef = useRef<HTMLSpanElement>(null);
  const elevSpanRef = useRef<HTMLSpanElement>(null);
  const depthSpanRef = useRef<HTMLSpanElement>(null);

  // Initial values from props or DevToolsAPI singleton store
  const initialData = getProvenanceTelemetry();
  const initialBase = propBaseDataset ?? initialData.baseDataset;
  const initialInset =
    propInsetDataset ??
    (propLat !== undefined && propLon !== undefined
      ? getActiveInsetDataset(propLat, propLon)
      : initialData.insetDataset);
  const initialDatum = propVerticalDatum ?? initialData.verticalDatum;
  const initialLat = propLat ?? initialData.latitude;
  const initialLon = propLon ?? initialData.longitude;
  const initialAlt = propAlt ?? initialData.altitudeMeters;
  const initialElev = propElev ?? initialData.groundElevationMeters;
  const initialDepth = propDepth ?? initialData.waterDepthMeters;

  useEffect(() => {
    let isMounted = true;

    const applyTelemetryToDOM = (data: ProvenanceTelemetryData) => {
      if (!isMounted) return;

      if (baseSpanRef.current && propBaseDataset === undefined) {
        baseSpanRef.current.textContent = data.baseDataset;
      }
      if (insetSpanRef.current && propInsetDataset === undefined) {
        insetSpanRef.current.textContent = data.insetDataset;
      }
      if (datumSpanRef.current && propVerticalDatum === undefined) {
        datumSpanRef.current.textContent = data.verticalDatum;
      }
      if (latSpanRef.current && propLat === undefined) {
        latSpanRef.current.textContent = formatLatitude(data.latitude);
      }
      if (lonSpanRef.current && propLon === undefined) {
        lonSpanRef.current.textContent = formatLongitude(data.longitude);
      }
      if (altSpanRef.current && propAlt === undefined) {
        altSpanRef.current.textContent = formatAltitude(data.altitudeMeters);
      }
      if (elevSpanRef.current && propElev === undefined) {
        elevSpanRef.current.textContent = formatGroundElevation(data.groundElevationMeters);
      }
      if (depthSpanRef.current && propDepth === undefined) {
        depthSpanRef.current.textContent = formatWaterDepth(data.waterDepthMeters);
      }
    };

    // 1. Subscribe to reactive events from DevToolsAPI
    const unsubscribe = subscribeProvenanceTelemetry(applyTelemetryToDOM);

    // 2. Fallback gentle 10Hz polling loop to handle out-of-band camera or test manipulations
    const interval = setInterval(() => {
      if (!isMounted) return;
      if (typeof window === 'undefined') return;

      const cam = (window as any).__INDICATRIX_CAMERA__;
      const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__ || (window as any).__INDICATRIX_ENGINE__;

      if (cam && propLat === undefined && propLon === undefined) {
        const coords =
          (typeof cam.getCursorCoords === 'function' ? cam.getCursorCoords() : cam.cursorCoords) ||
          (typeof cam.getActiveCoords === 'function' ? cam.getActiveCoords() : cam.activeCoords);

        if (coords) {
          const lat = coords.lat ?? 0;
          const lon = coords.lon ?? 0;
          let altM = 12742000;

          if (typeof cam.getCamDist === 'function') {
            const cd = cam.getCamDist();
            if (Number.isFinite(cd)) altM = Math.max(0, (cd - 5.0) * 1274200);
          } else if (typeof cam.getAltitudeUnits === 'function') {
            const altU = cam.getAltitudeUnits();
            if (Number.isFinite(altU)) altM = Math.max(0, altU * 1274200);
          }

          let elevM = 0;
          if (engine && typeof engine.sampleCPUElevation === 'function') {
            const sampleRes = engine.sampleCPUElevation(lon, lat);
            elevM = sampleRes?.elevationMeters ?? 0;
          }

          const activeReg = engine?.getActiveRegionalDEM ? engine.getActiveRegionalDEM() : null;
          const inset = getActiveInsetDataset(lat, lon, activeReg);

          const liveData: ProvenanceTelemetryData = {
            baseDataset: DEFAULT_PROVENANCE_TELEMETRY.baseDataset,
            insetDataset: inset,
            verticalDatum: DEFAULT_PROVENANCE_TELEMETRY.verticalDatum,
            latitude: lat,
            longitude: lon,
            altitudeMeters: altM,
            groundElevationMeters: elevM,
            waterDepthMeters: elevM < 0 ? -elevM : 0,
          };

          applyTelemetryToDOM(liveData);
        }
      }
    }, 100);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [
    propBaseDataset,
    propInsetDataset,
    propVerticalDatum,
    propLat,
    propLon,
    propAlt,
    propElev,
    propDepth,
  ]);

  return (
    <div
      data-instrument="data-provenance"
      data-testid="data-provenance-overlay"
      className={`p-2.5 rounded-[3px] border shadow-sm transition-all space-y-2 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] font-mono ${className}`}
      style={{ fontFamily: "var(--theme-font-telemetry, 'IBM Plex Mono', monospace)" }}
    >
      {/* 1. Header: Status Beacon & Title */}
      <div className="flex items-start justify-between text-micro mb-1 font-mono border-b border-[var(--theme-card-border-50)] pb-1.5">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-pulse-indicator)] animate-pulse shrink-0" />
            <span className="font-bold tracking-wider text-[var(--theme-text-accent)] uppercase truncate">
              Data Provenance
            </span>
          </div>
          <span className="text-nano text-[var(--theme-text-muted)] truncate pl-3">
            Geodesy & Topobathy Authority
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-nano shrink-0 ml-1.5 pt-0.5">
          <span className="text-[var(--theme-text-secondary)] uppercase tracking-wider text-[9px]">
            15" / 30m / 3m
          </span>
        </div>
      </div>

      {/* 2. Authority & Dataset Provenance Rows */}
      <div className="space-y-1.5 font-mono text-body leading-tight">
        {/* Base Dataset */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--theme-text-muted)] text-[9px] uppercase tracking-wider">
            Active Base Dataset:
          </span>
          <span
            data-testid="provenance-base-dataset"
            ref={baseSpanRef}
            className="font-semibold text-[var(--theme-text-primary)] text-body truncate"
            title={initialBase}
          >
            {initialBase}
          </span>
        </div>

        {/* Inset Dataset */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--theme-text-muted)] text-[9px] uppercase tracking-wider">
            Active Inset Dataset:
          </span>
          <span
            data-testid="provenance-inset-dataset"
            ref={insetSpanRef}
            className="font-semibold text-[var(--theme-status-sage)] text-body truncate"
            title={initialInset}
          >
            {initialInset}
          </span>
        </div>

        {/* Vertical Datum */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--theme-text-muted)] text-[9px] uppercase tracking-wider">
            Vertical Datum:
          </span>
          <span
            data-testid="provenance-vertical-datum"
            ref={datumSpanRef}
            className="font-semibold text-[var(--theme-text-secondary)] text-body truncate"
            title={initialDatum}
          >
            {initialDatum}
          </span>
        </div>
      </div>

      {/* 3. Real-time Cursor Telemetry Matrix */}
      <div className="pt-2 border-t border-[var(--theme-card-border-50)] space-y-1.5">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-[var(--theme-text-muted)]">
          <span className="font-bold">Cursor Telemetry</span>
          <span className="text-nano text-[var(--theme-text-muted)]">10 Hz Live</span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-body">
          {/* Latitude */}
          <div className="flex justify-between items-center">
            <span className="text-[var(--theme-text-muted)] text-[9px] shrink-0">Latitude:</span>
            <span
              data-testid="telemetry-cursor-lat"
              ref={latSpanRef}
              className="font-semibold text-[var(--theme-text-primary)] tabular-nums truncate text-right ml-1"
            >
              {formatLatitude(initialLat)}
            </span>
          </div>

          {/* Longitude */}
          <div className="flex justify-between items-center">
            <span className="text-[var(--theme-text-muted)] text-[9px] shrink-0">Longitude:</span>
            <span
              data-testid="telemetry-cursor-lon"
              ref={lonSpanRef}
              className="font-semibold text-[var(--theme-text-primary)] tabular-nums truncate text-right ml-1"
            >
              {formatLongitude(initialLon)}
            </span>
          </div>

          {/* Altitude */}
          <div className="flex justify-between items-center">
            <span className="text-[var(--theme-text-muted)] text-[9px] shrink-0">Altitude:</span>
            <span
              data-testid="telemetry-cursor-alt"
              ref={altSpanRef}
              className="font-semibold text-[var(--theme-text-primary)] tabular-nums truncate text-right ml-1"
            >
              {formatAltitude(initialAlt)}
            </span>
          </div>

          {/* Ground Elevation */}
          <div className="flex justify-between items-center">
            <span className="text-[var(--theme-text-muted)] text-[9px] shrink-0">Ground Elevation:</span>
            <span
              data-testid="telemetry-ground-elev"
              ref={elevSpanRef}
              className="font-semibold text-[var(--theme-status-sage)] tabular-nums truncate text-right ml-1"
            >
              {formatGroundElevation(initialElev)}
            </span>
          </div>
        </div>

        {/* Water Depth */}
        <div className="pt-1 border-t border-[var(--theme-card-border-30)] flex items-center justify-between text-body">
          <span className="text-[var(--theme-text-muted)] text-[9px] uppercase tracking-wider">
            Water Depth:
          </span>
          <span
            data-testid="telemetry-water-depth"
            ref={depthSpanRef}
            className="font-semibold text-[var(--theme-text-accent)] tabular-nums"
          >
            {formatWaterDepth(initialDepth)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DataProvenanceOverlay;
