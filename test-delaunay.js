import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';

async function run() {
  const data = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json());
  const feats = topojson.feature(data, data.objects.countries);
  
  let points = [];
  const step = 4.0; // coarser for testing
  for (const feat of feats.features) {
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    const scan = (coords) => {
      for (const pt of coords) {
        if (pt[0] < minLng) minLng = pt[0];
        if (pt[0] > maxLng) maxLng = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }
    };
    if (feat.geometry.type === 'Polygon') scan(feat.geometry.coordinates[0]);
    else if (feat.geometry.type === 'MultiPolygon') {
      for (const poly of feat.geometry.coordinates) scan(poly[0]);
    }
    
    for (let lat = Math.floor(minLat/step)*step; lat <= Math.ceil(maxLat/step)*step; lat += step) {
      for (let lng = Math.floor(minLng/step)*step; lng <= Math.ceil(maxLng/step)*step; lng += step) {
        // Add random jitter to break up the perfect grid
        const jLng = lng + (Math.random() - 0.5) * step * 0.8;
        const jLat = lat + (Math.random() - 0.5) * step * 0.8;
        if (d3.geoContains(feat, [jLng, jLat])) points.push([jLng, jLat]);
      }
    }
  }
  
  console.log("Points generated:", points.length);
  const delaunay = d3.Delaunay.from(points);
  const { triangles } = delaunay;
  
  let validTriangles = 0;
  const MAX_DIST_SQ = (step * 2) ** 2; // Maximum allowed squared distance between vertices
  for (let i = 0; i < triangles.length; i += 3) {
    const p0 = points[triangles[i]];
    const p1 = points[triangles[i + 1]];
    const p2 = points[triangles[i + 2]];
    
    const dist2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2;
    if (dist2(p0, p1) < MAX_DIST_SQ && dist2(p1, p2) < MAX_DIST_SQ && dist2(p2, p0) < MAX_DIST_SQ) {
      validTriangles++;
    }
  }
  console.log("Valid Triangles formed:", validTriangles);
}
run();
