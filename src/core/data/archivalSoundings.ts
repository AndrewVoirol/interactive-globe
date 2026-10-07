// ============================================================================
// File: src/core/data/archivalSoundings.ts
// Architecture: Bathymetric Soundings & Geodetic Benchmarks Data
// Description: Archival depth sounding and geodetic reference survey stations
// ============================================================================

export interface BathymetricSounding {
  name: string;
  depthM: number;
  depthFm: number;
  lat: number;
  lon: number;
}

export const ARCHIVAL_SOUNDINGS: BathymetricSounding[] = [
  { name: 'Challenger Deep', depthM: 10994, depthFm: 6012, lat: 11.37, lon: 142.25 },
  { name: 'Puerto Rico Trench', depthM: 8376, depthFm: 4580, lat: 19.84, lon: -66.50 },
  { name: 'Java Trench', depthM: 7450, depthFm: 4074, lat: -10.32, lon: 111.45 },
  { name: 'Molloy Deep', depthM: 5550, depthFm: 3035, lat: 79.14, lon: 2.78 },
  { name: 'Romanche Trench', depthM: 7761, depthFm: 4243, lat: -0.22, lon: -18.35 },
  { name: 'Mid-Atlantic Ridge', depthM: 3850, depthFm: 2105, lat: 26.10, lon: -35.20 },
  { name: 'South Sandwich Trench', depthM: 8266, depthFm: 4520, lat: -55.40, lon: -26.50 },
  { name: 'Philippine Basin', depthM: 10540, depthFm: 5763, lat: 10.15, lon: 126.70 },
  { name: 'Aleutian Trench', depthM: 7679, depthFm: 4199, lat: 52.00, lon: -173.00 },
  { name: 'Sargasso Abyssal Plain', depthM: 5400, depthFm: 2953, lat: 28.00, lon: -60.00 },
  { name: 'Peru-Chile Trench', depthM: 8065, depthFm: 4410, lat: -23.00, lon: -76.00 },
  { name: 'Diamantina Deep', depthM: 7079, depthFm: 3870, lat: -35.00, lon: 104.00 },
];

export interface GeodeticBenchmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export const GEODETIC_BENCHMARKS: GeodeticBenchmark[] = [
  { id: 'GRW', name: 'Greenwich Obs.', lat: 51.48, lon: 0.0 },
  { id: 'ALX', name: 'Alexandria', lat: 31.20, lon: 29.92 },
  { id: 'QTO', name: 'Quito Equatorial', lat: -0.18, lon: -78.47 },
  { id: 'TKO', name: 'Tokyo Meridian', lat: 35.68, lon: 139.77 },
  { id: 'CPT', name: 'Cape of Good Hope', lat: -33.92, lon: 18.42 },
  { id: 'REK', name: 'Reykjavik Geodetic', lat: 64.14, lon: -21.94 },
  { id: 'HNL', name: 'Honolulu Pacific', lat: 21.31, lon: -157.86 },
  { id: 'SYD', name: 'Sydney Observatory', lat: -33.86, lon: 151.21 },
  { id: 'VAL', name: 'Valparaíso Survey', lat: -33.05, lon: -71.62 },
];

export const GEODETIC_EDGES: [string, string][] = [
  ['GRW', 'ALX'],
  ['GRW', 'REK'],
  ['REK', 'QTO'],
  ['QTO', 'VAL'],
  ['VAL', 'HNL'],
  ['HNL', 'TKO'],
  ['TKO', 'SYD'],
  ['SYD', 'CPT'],
  ['CPT', 'ALX'],
  ['ALX', 'TKO'],
  ['GRW', 'QTO'],
];

export const BENCHMARKS_MAP = new Map<string, GeodeticBenchmark>(
  GEODETIC_BENCHMARKS.map((b) => [b.id, b])
);
