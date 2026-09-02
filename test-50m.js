import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';

async function run() {
  const data = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json());
  const mesh = topojson.mesh(data, data.objects.countries, (a, b) => a !== b);
  console.log("Mesh extracted. Type:", mesh.type);
  console.log("Coordinates length:", mesh.coordinates.length);
}
run();
