
import type { Feature as GeoJsonFeature, FeatureCollection as GeoJsonFeatureCollection, Geometry } from 'geojson';
import type { Objects, Topology as TopojsonTopology } from 'topojson-specification';

export type Feature = GeoJsonFeature;
export type FeatureCollection = GeoJsonFeatureCollection;

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
