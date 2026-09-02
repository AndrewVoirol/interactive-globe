
import type { Feature as GeoJsonFeature, FeatureCollection as GeoJsonFeatureCollection, Geometry } from 'geojson';
import type { Objects, Topology as TopojsonTopology } from 'topojson-specification';
import type { GeoProjection } from 'd3';

export type Feature = GeoJsonFeature;
export type FeatureCollection = GeoJsonFeatureCollection<Geometry>;

export interface WorldAtlas extends TopojsonTopology {
  objects: Objects<{
    countries: {
      type: "GeometryCollection";
      geometries: Array<{
        type: "Polygon" | "MultiPolygon";
        arcs: number[][][] | number[][][][];
        id: string;
        properties: {
          name: string;
        };
      }>;
    };
    land: {
      type: "GeometryCollection";
      geometries: Array<{
        type: "Polygon" | "MultiPolygon";
        arcs: number[][][] | number[][][][];
      }>;
    };
  }>;
}

export type RenderStyle = 'vector' | 'dot-matrix';

export interface TelemetryData {
  lon: number;
  lat: number;
  alpha: number;
  superellipseN: number;
  pointCount: number;
  fps: number;
  renderStyle: RenderStyle;
  isAutoRotating: boolean;
}

export interface CustomInterpolatorInstance {
  t: number;
  source: GeoProjection;
  target: GeoProjection;
  projection: GeoProjection;
  interpolatePoint: (coords: [number, number], tOverride?: number) => [number, number] | null;
}

