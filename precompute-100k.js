import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';
import { geoDelaunay } from 'd3-geo-voronoi';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';

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

if (isMainThread) {
    async function precompute() {
        console.log('Fetching TopoJSON (50m for classification to avoid 10m winding bugs)...');
        const data50 = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json());
        const landFeature = topojson.feature(data50, data50.objects.land);
        
        console.log('Building Ultra-Dense Continuous Volumetric Matrix (100,000 nodes)...');
        
        const allPoints = [];
        const TOTAL_POINTS = 100000;
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
        }

        const THREADS = 10;
        const chunkSize = Math.ceil(TOTAL_POINTS / THREADS);
        const workers = [];
        const isLandArray = new Array(TOTAL_POINTS).fill(0);
        
        let completed = 0;
        
        console.log(`Spawning ${THREADS} worker threads for classification...`);
        for (let i = 0; i < THREADS; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, TOTAL_POINTS);
            const chunk = allPoints.slice(start, end);
            
            workers.push(new Promise((resolve) => {
                const worker = new Worker(fileURLToPath(import.meta.url), {
                    workerData: { chunk, landFeature, start }
                });
                worker.on('message', (msg) => {
                    for (let j = 0; j < msg.results.length; j++) {
                        isLandArray[start + j] = msg.results[j];
                    }
                    completed++;
                    console.log(`Worker ${completed}/${THREADS} finished.`);
                    resolve();
                });
            }));
        }
        
        await Promise.all(workers);
        console.log('Classification complete.');
        
        console.log('Triangulating Global Unified Mesh (this takes a while for 100k)...');
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
        
        console.log('Writing to public/geo-mesh-100k.json...');
        const output = {
            pointsBuffer: pointsArray,
            target2DBuffer: target2DArray,
            typeBuffer: isLandArray,
            lineIndices: lineIndicesArray
        };
        fs.writeFileSync('public/geo-mesh-100k.json', JSON.stringify(output));
        console.log('Done! (geo-mesh-100k.json)');
    }
    precompute();
} else {
    const d3 = await import('d3');
    const { chunk, landFeature } = workerData;
    const results = [];
    for (let i = 0; i < chunk.length; i++) {
        results.push(d3.geoContains(landFeature, chunk[i]) ? 1.0 : 0.0);
    }
    parentPort.postMessage({ results });
}
