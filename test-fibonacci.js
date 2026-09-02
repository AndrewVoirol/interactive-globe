import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';

async function run() {
  const data = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json());
  const feats = topojson.feature(data, data.objects.countries);
  
  const N = 5000;
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const points = [];
  
  for (let i = 0; i < N; i++) {
    const z = 1 - (i / (N - 1)) * 2;
    const radius = Math.sqrt(1 - z * z);
    const theta = 2 * Math.PI * i / goldenRatio;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    const lat = Math.asin(z) * (180 / Math.PI);
    const lon = Math.atan2(y, x) * (180 / Math.PI);
    
    // Check if on land
    let onLand = false;
    for (const feat of feats.features) {
      if (d3.geoContains(feat, [lon, lat])) {
        onLand = true;
        break;
      }
    }
    if (onLand) points.push([lon, lat]);
  }
  
  console.log("Fibonacci points on land:", points.length);
}
run();
