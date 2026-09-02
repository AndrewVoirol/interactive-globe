import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3';

async function run() {
  const data = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json());
  const feats = topojson.feature(data, data.objects.countries);
  console.log("Features:", feats.features.length);
  
  let allDots = [];
  const step = 1.35;
  let count = 0;
  for (const feat of feats.features) {
      if (count++ > 5) break; // test first 5 features
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      const scanCoords = (coords) => {
        for (const pt of coords) {
          if (pt[0] < minLng) minLng = pt[0];
          if (pt[0] > maxLng) maxLng = pt[0];
          if (pt[1] < minLat) minLat = pt[1];
          if (pt[1] > maxLat) maxLat = pt[1];
        }
      };
      if (feat.geometry.type === 'Polygon') scanCoords(feat.geometry.coordinates[0]);
      else if (feat.geometry.type === 'MultiPolygon') {
        for (const poly of feat.geometry.coordinates) scanCoords(poly[0]);
      }
      
      const startLat = Math.max(-85, Math.floor(minLat / step) * step);
      const endLat = Math.min(85, Math.ceil(maxLat / step) * step);
      const startLng = Math.floor(minLng / step) * step;
      const endLng = Math.ceil(maxLng / step) * step;
      
      for (let lat = startLat; lat <= endLat; lat += step) {
        for (let lng = startLng; lng <= endLng; lng += step) {
          const pt = [lng, lat];
          if (d3.geoContains(feat, pt)) allDots.push(pt);
        }
      }
  }
  console.log("Dots found:", allDots.length);
}
run();
