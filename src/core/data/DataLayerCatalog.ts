// ============================================================================
// File: src/core/data/DataLayerCatalog.ts
// Cartographic Multi-Source Data Layer Catalog & Preset Registry
// ============================================================================

export type BlendModeType = 0 | 1 | 2 | 3; // 0 = Normal, 1 = Additive, 2 = Multiply, 3 = Screen

export interface CartographicLegend {
  colorStops: string[];
  minLabel: string;
  maxLabel: string;
  unit: string;
}

export interface DataLayerPreset {
  id: string;
  name: string;
  category: 'satellite' | 'night' | 'topo' | 'ocean' | 'thermal' | 'vectors' | 'point' | 'field';
  type: string;
  details: string;
  url: string;
  defaultOpacity: number;
  defaultBlendMode: BlendModeType;
  attribution: string;
  legend: CartographicLegend;
  elevationEncoding?: 'luminance' | 'mapbox' | 'terrarium';
  defaultDisplacementScale?: number;
}

export const DATA_LAYER_CATALOG: DataLayerPreset[] = [
  {
    id: 'global-dem-crust',
    name: 'NASA/GEBCO 3D Crust & Bathymetry',
    category: 'topo',
    type: 'DEM Crust (ETOPO/GEBCO)',
    details: 'Physical lithosphere: Mariana Trench (-11,000m) to Mount Everest (+8,848m)',
    url: '/earth-elevation-dem.webp',
    defaultOpacity: 0.95,
    defaultBlendMode: 0,
    defaultDisplacementScale: 0.12,
    attribution: 'NASA Earth Observatory / GEBCO / NOAA NCEI',
    legend: {
      colorStops: ['#020617', '#0284c7', '#15803d', '#d97706', '#ffffff'],
      minLabel: '-11,000m Trench',
      maxLabel: '+8,848m Peak',
      unit: 'Lithosphere',
    },
  },
  {
    id: 'nasa-blue-marble',
    name: 'NASA Blue Marble & Bathymetry',
    category: 'satellite',
    type: 'WMTS EPSG:3857',
    details: 'NASA Earth Observatory true-color orbital imagery & shaded bathymetry',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    defaultOpacity: 0.90,
    defaultBlendMode: 0,
    defaultDisplacementScale: 0.08,
    attribution: 'NASA Earth Observatory / EOSDIS GIBS',
    legend: {
      colorStops: ['#0b1329', '#1e3a8a', '#15803d', '#ca8a04', '#f8fafc'],
      minLabel: 'Bathymetry',
      maxLabel: 'Elevation',
      unit: 'Orbital',
    },
  },
  {
    id: 'esri-world-imagery',
    name: 'Esri World Satellite Imagery',
    category: 'satellite',
    type: 'Raster XYZ',
    details: 'High-resolution global orbital & aerial satellite surface photography',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    defaultOpacity: 0.90,
    defaultBlendMode: 0,
    defaultDisplacementScale: 0.08,
    attribution: 'Esri, Maxar, Earthstar Geographics',
    legend: {
      colorStops: ['#0f172a', '#1e3a8a', '#166534', '#a16207', '#f8fafc'],
      minLabel: 'Sea',
      maxLabel: 'Land',
      unit: 'Optical',
    },
  },
  {
    id: 'global-bathymetry-ocean',
    name: 'Global Ocean Bathymetry & Relief',
    category: 'ocean',
    type: 'Raster XYZ',
    details: 'GEBCO seafloor topography, continental shelves, and abyssal trenches',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    defaultOpacity: 0.85,
    defaultBlendMode: 0,
    defaultDisplacementScale: 0.08,
    attribution: 'GEBCO, NOAA, Esri, DeLorme',
    legend: {
      colorStops: ['#020617', '#0f172a', '#1e293b', '#0369a1', '#38bdf8'],
      minLabel: '-11,000m Trench',
      maxLabel: '0m Shelf',
      unit: 'Depth',
    },
  },
  {
    id: 'usgs-topo-map',
    name: 'USGS Topographic Map',
    category: 'topo',
    type: 'Raster XYZ',
    details: 'USGS National Map hypsometric elevation contours & hydrology',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    defaultOpacity: 0.80,
    defaultBlendMode: 0,
    defaultDisplacementScale: 0.08,
    attribution: 'U.S. Geological Survey / The National Map',
    legend: {
      colorStops: ['#0284c7', '#86efac', '#fef08a', '#f97316', '#b91c1c'],
      minLabel: '0m',
      maxLabel: '+4,400m',
      unit: 'USGS Topo',
    },
  },
  {
    id: 'nasa-city-lights',
    name: 'NASA Blue Marble Night Lights',
    category: 'night',
    type: 'WMTS EPSG:3857',
    details: 'Suomi NPP VIIRS nocturnal anthropogenic illumination & city glows',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    defaultOpacity: 0.90,
    defaultBlendMode: 1, // Additive for glowing city lights
    defaultDisplacementScale: 0.08,
    attribution: 'NASA Earth Observatory / VIIRS / NOAA',
    legend: {
      colorStops: ['#000000', '#7c2d12', '#d97706', '#fef08a', '#ffffff'],
      minLabel: '0.1 nW/cm²',
      maxLabel: '500 nW/cm²',
      unit: 'Luminance',
    },
  },
  {
    id: 'osm-topo-terrain',
    name: 'OpenTopoMap Topographic Relief',
    category: 'topo',
    type: 'Raster XYZ',
    details: 'Contour relief, hillshading, and global hypsometric topography',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    defaultOpacity: 0.85,
    defaultBlendMode: 0,
    defaultDisplacementScale: 0.08,
    attribution: 'OpenStreetMap contributors, SRTM',
    legend: {
      colorStops: ['#0284c7', '#22c55e', '#eab308', '#9a3412', '#78716c'],
      minLabel: '-100m',
      maxLabel: '+4,000m',
      unit: 'Relief',
    },
  },
];

export function getPresetById(id: string): DataLayerPreset | undefined {
  return DATA_LAYER_CATALOG.find((item) => item.id === id);
}
