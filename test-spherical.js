import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';
import { geoDelaunay } from 'd3-geo-voronoi';

async function run() {
  const data = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json());
  const feats = topojson.feature(data, data.objects.countries);
  
  const TOTAL_POINTS = 30000;
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const validPoints = [];
  
  for (let i = 0; i < TOTAL_POINTS; i++) {
    const z = 1 - (i / (TOTAL_POINTS - 1)) * 2;
    const radius = Math.sqrt(1 - z * z);
    const theta = 2 * Math.PI * i / goldenRatio;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    
    const lat = Math.asin(z) * (180 / Math.PI);
    const lon = Math.atan2(y, x) * (180 / Math.PI);
    
    let onLand = false;
    for (const feat of feats.features) {
      if (d3.geoContains(feat, [lon, lat])) {
        onLand = true;
        break;
      }
    }
    if (onLand) validPoints.push([lon, lat]);
  }
  
  console.log("Points on land:", validPoints.length);
  
  const delaunay = geoDelaunay(validPoints);
  const triangles = delaunay.triangles;
  
  // Calculate max allowed distance
  const sphereRadius = 5.0;
  const maxArcDist = 0.08 * sphereRadius; // roughly 4-5 degrees
  const maxDistSq = maxArcDist * maxArcDist;
  
  let validTriCount = 0;
  for (let i = 0; i < triangles.length; i++) {
     const t = triangles[i]; // t is [i0, i1, i2]
     const p0 = validPoints[t[0]];
     const p1 = validPoints[t[1]];
     const p2 = validPoints[t[2]];
     
     // 3D Cartesian dist
     const c0 = toCartesian(p0[0], p0[1], sphereRadius);
     const c1 = toCartesian(p1[0], p1[1], sphereRadius);
     const c2 = toCartesian(p2[0], p2[1], sphereRadius);
     
     const dist2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
     
     if (dist2(c0, c1) < maxDistSq && dist2(c1, c2) < maxDistSq && dist2(c2, c0) < maxDistSq) {
         validTriCount++;
     }
  }
  console.log("Valid Triangles:", validTriCount, "out of", triangles.length);
}

function toCartesian(lon, lat, r) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return [
        -(r * Math.sin(phi) * Math.cos(theta)),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    ];
}

run();
