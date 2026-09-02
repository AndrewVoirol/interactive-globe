import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';
import { geoDelaunay } from 'd3-geo-voronoi';

const RADIUS = 5.0;

const toSphere = (lon, lat) => {
  const lambda = lon * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  return [
    RADIUS * Math.cos(phi) * Math.sin(lambda),
    RADIUS * Math.sin(phi),
    RADIUS * Math.cos(phi) * Math.cos(lambda)
  ];
};

const toMercator = (lon, lat) => {
  const lambda = lon * (Math.PI / 180);
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const phi = clampedLat * (Math.PI / 180);
  const x = lambda * RADIUS;
  const y = RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
};

async function precompute() {
    console.log('Fetching TopoJSON (50m for classification)...');
    const data50 = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json());
    
    // THE FIX: Use the unified 'land' geometry instead of iterating over individual 'countries'
    // This bypasses the spherical winding order bugs in D3 for massive MultiPolygons like Canada and Russia
    const landFeature = topojson.feature(data50, data50.objects.land);
    
    console.log('Building Continuous Volumetric Matrix (20,000 nodes)...');
    
    const allPoints = [];
    const isLandArray = []; 

    const TOTAL_POINTS = 20000;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    
    for (let i = 0; i < TOTAL_POINTS; i++) {
        const z = 1 - (i / (TOTAL_POINTS - 1)) * 2;
        const r = Math.sqrt(1 - z * z);
        const theta = 2 * Math.PI * i / goldenRatio;
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        const lat = Math.asin(z) * (180 / Math.PI);
        const lon = Math.atan2(y, x) * (180 / Math.PI);
        
        allPoints.push([lon, lat]);
        
        // Test against the single unified land feature
        const onLand = d3.geoContains(landFeature, [lon, lat]);
        isLandArray.push(onLand ? 1.0 : 0.0);
        
        if (i > 0 && i % 2000 === 0) console.log(`Classified ${i} nodes...`);
    }

    console.log('Triangulating Global Unified Mesh (this takes a few seconds)...');
    const delaunay = geoDelaunay(allPoints);
    const triangles = delaunay.triangles;
    
    console.log('Computing Final Buffers...');
    const pointsArray = [];
    const target2DArray = [];
    
    for (let i = 0; i < allPoints.length; i++) {
        const [lon, lat] = allPoints[i];
        pointsArray.push(...toSphere(lon, lat));
        target2DArray.push(...toMercator(lon, lat));
    }
    
    const lineEdges = new Set();
    const addEdge = (a, b) => {
        if (Math.abs(allPoints[a][0] - allPoints[b][0]) > 90) return;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        lineEdges.add(key);
    };
    
    for (let i = 0; i < triangles.length; i++) {
        const t = triangles[i];
        addEdge(t[0], t[1]);
        addEdge(t[1], t[2]);
        addEdge(t[2], t[0]);
    }
    
    const lineIndicesArray = [];
    lineEdges.forEach(key => {
        const [a, b] = key.split('-').map(Number);
        lineIndicesArray.push(a, b);
    });

    console.log(`Generated ${lineIndicesArray.length / 2} geometric edges.`);
    
    console.log('Writing to public/geo-mesh.json...');
    const output = {
        pointsBuffer: pointsArray,
        target2DBuffer: target2DArray,
        typeBuffer: isLandArray,
        lineIndices: lineIndicesArray
    };
    fs.writeFileSync('public/geo-mesh.json', JSON.stringify(output));
    console.log('Done!');
}
precompute();
