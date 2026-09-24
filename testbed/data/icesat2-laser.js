// ═══════════════════════════════════════════════════════════════════════════════
// NASA ICESat-2 (ATLAS) 532nm Polar Laser Altimetry Orbital Ground Tracks
// High-resolution photon-counting elevation transects across Greenland & Antarctica.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  // Helper to generate smooth monotonic cubic interpolation along waypoints
  function interpolateTrack(waypoints, steps) {
    const points = [];
    const n = waypoints.length;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const scaledT = t * (n - 1);
      const idx = Math.min(Math.floor(scaledT), n - 2);
      const frac = scaledT - idx;
      // Cosine smoothing between waypoints
      const smoothFrac = (1 - Math.cos(frac * Math.PI)) * 0.5;
      const w0 = waypoints[idx];
      const w1 = waypoints[idx + 1];
      const lat = w0.lat + (w1.lat - w0.lat) * smoothFrac;
      const lon = w0.lon + (w1.lon - w0.lon) * smoothFrac;
      const elev = w0.elev + (w1.elev - w0.elev) * smoothFrac;
      points.push({
        lat: parseFloat(lat.toFixed(4)),
        lon: parseFloat(lon.toFixed(4)),
        heightMeters: parseFloat(elev.toFixed(1))
      });
    }
    return points;
  }

  // Greenland Track 0187 (Ocean to 3216m Ice Sheet Summit to Arctic Sea Ice)
  const greenlandWaypoints = [
    { lat: 60.0, lon: -45.0, elev: 15.0 },     // Cape Farewell coast
    { lat: 62.5, lon: -43.8, elev: 1250.0 },   // Southern dome ascent
    { lat: 65.0, lon: -42.2, elev: 2280.0 },   // South-central divide
    { lat: 68.0, lon: -40.5, elev: 2790.0 },   // Ice cap plateau
    { lat: 70.5, lon: -39.2, elev: 3080.0 },   // Approaching summit
    { lat: 72.58, lon: -38.45, elev: 3216.0 }, // Summit Camp (highest point)
    { lat: 74.5, lon: -40.8, elev: 3050.0 },   // Northern plateau slope
    { lat: 77.4, lon: -51.1, elev: 2450.0 },   // NEEM ice core transect
    { lat: 79.5, lon: -57.2, elev: 1650.0 },   // North-west ice margin
    { lat: 81.2, lon: -61.5, elev: 720.0 },    // Petermann glacier head
    { lat: 82.5, lon: -63.8, elev: 140.0 },    // Fjord grounding line
    { lat: 83.2, lon: -65.0, elev: 2.0 }       // Arctic sea ice edge
  ];

  // Antarctic Track 1387 (Ronne Ice Shelf to 2840m South Pole Plateau)
  const antarcticWaypoints = [
    { lat: -65.0, lon: -50.0, elev: 35.0 },    // Ronne Ice Shelf front
    { lat: -67.5, lon: -52.5, elev: 55.0 },    // Outer floating shelf
    { lat: -71.0, lon: -56.0, elev: 95.0 },    // Mid ice shelf
    { lat: -74.2, lon: -62.5, elev: 480.0 },   // Grounding line / Evans stream
    { lat: -77.0, lon: -68.0, elev: 1450.0 },  // Ellsworth mountain flank
    { lat: -79.8, lon: -75.5, elev: 2150.0 },  // Polar ice divide ascent
    { lat: -82.5, lon: -85.0, elev: 2550.0 },  // East Antarctic high plateau
    { lat: -85.0, lon: -98.0, elev: 2740.0 },  // High polar plateau
    { lat: -87.0, lon: -115.0, elev: 2815.0 }, // Transantarctic flank
    { lat: -88.5, lon: -135.0, elev: 2840.0 }  // Amundsen-Scott South Pole vicinity
  ];

  window.__ICESAT2_TRACKS__ = [
    {
      id: 'Track-0187',
      name: 'ICESat-2 Track 0187 (Greenland Summit Transect)',
      region: 'Greenland Ice Sheet',
      laserWavelengthNm: 532,
      points: interpolateTrack(greenlandWaypoints, 75)
    },
    {
      id: 'Track-1387',
      name: 'ICESat-2 Track 1387 (Antarctic Polar Plateau)',
      region: 'Antarctica',
      laserWavelengthNm: 532,
      points: interpolateTrack(antarcticWaypoints, 75)
    }
  ];
})();
