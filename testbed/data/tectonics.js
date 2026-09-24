// ═══════════════════════════════════════════════════════════════════════════════
// Global Tectonic Plate Boundaries (Peter Bird 2003) & ITRF2020 Velocity Vectors
// Categorized by Divergent Ridges, Convergent Subduction Trenches, and Transform Faults.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  // ─── 1. Plate Boundaries (Bird 2003 / USGS) ───
  const boundaries = [
    // ── DIVERGENT (Spreading Ridges / Rifts) ──
    {
      name: 'Mid-Atlantic Ridge (North)',
      type: 'divergent',
      coords: [
        [-18.5, 66.5], [-17.2, 64.8], [-23.5, 63.5], [-27.8, 62.1], [-30.2, 58.5],
        [-34.8, 52.6], [-33.2, 45.1], [-30.5, 38.2], [-38.8, 30.1], [-43.2, 24.5],
        [-46.1, 15.2], [-44.0, 7.8], [-38.5, 3.2], [-32.5, 0.8], [-28.1, -0.5]
      ]
    },
    {
      name: 'Mid-Atlantic Ridge (South)',
      type: 'divergent',
      coords: [
        [-28.1, -0.5], [-22.5, -2.5], [-17.8, -7.2], [-14.2, -12.5], [-13.8, -19.5],
        [-14.5, -25.2], [-13.2, -32.0], [-15.8, -38.5], [-17.5, -45.2], [-14.8, -50.1],
        [-4.2, -54.2], [5.5, -53.8], [15.2, -52.5]
      ]
    },
    {
      name: 'East Pacific Rise',
      type: 'divergent',
      coords: [
        [-107.5, 23.5], [-105.8, 20.2], [-104.5, 15.1], [-103.2, 10.5], [-102.5, 5.2],
        [-103.8, 0.0], [-106.2, -6.5], [-110.5, -12.8], [-112.8, -18.5], [-113.5, -25.2],
        [-112.1, -32.5], [-111.5, -39.8], [-112.5, -46.5], [-115.8, -52.5], [-122.5, -55.8]
      ]
    },
    {
      name: 'Southeast Indian Ridge',
      type: 'divergent',
      coords: [
        [70.5, -49.5], [78.2, -48.2], [88.5, -46.5], [98.2, -45.2], [108.5, -46.8],
        [118.2, -49.5], [128.5, -52.2], [138.2, -54.5], [148.5, -56.8], [158.2, -59.5]
      ]
    },
    {
      name: 'Southwest Indian Ridge',
      type: 'divergent',
      coords: [
        [15.2, -52.5], [22.5, -48.2], [32.1, -44.5], [42.5, -40.2], [52.8, -34.5],
        [62.5, -30.2], [67.8, -25.5]
      ]
    },
    {
      name: 'Red Sea & Gulf of Aden Rift',
      type: 'divergent',
      coords: [
        [34.5, 27.8], [36.2, 24.5], [38.5, 20.8], [41.2, 16.5], [43.5, 12.8],
        [46.2, 12.1], [50.8, 12.5], [54.5, 13.2]
      ]
    },

    // ── CONVERGENT (Subduction Trenches & Collisions) ──
    {
      name: 'Mariana Trench',
      type: 'convergent',
      coords: [
        [145.2, 23.5], [144.5, 20.5], [143.8, 17.5], [144.2, 14.5], [145.1, 12.2],
        [143.5, 11.2], [141.8, 12.1]
      ]
    },
    {
      name: 'Japan & Kuril Trench',
      type: 'convergent',
      coords: [
        [140.2, 34.5], [141.8, 36.5], [143.2, 39.5], [144.8, 42.5], [147.2, 45.5],
        [151.5, 48.8], [156.8, 52.2], [162.5, 55.5]
      ]
    },
    {
      name: 'Aleutian Trench',
      type: 'convergent',
      coords: [
        [162.5, 55.5], [170.2, 53.5], [178.5, 51.8], [-175.2, 51.5], [-168.5, 52.2],
        [-160.5, 53.8], [-152.2, 55.5], [-145.5, 57.2], [-138.5, 58.8]
      ]
    },
    {
      name: 'Peru-Chile Trench (Atacama)',
      type: 'convergent',
      coords: [
        [-81.2, -4.5], [-80.5, -9.5], [-78.2, -14.5], [-74.5, -18.5], [-71.8, -23.5],
        [-71.5, -29.5], [-72.2, -35.5], [-74.5, -41.5], [-75.8, -46.5]
      ]
    },
    {
      name: 'Java / Sunda Trench',
      type: 'convergent',
      coords: [
        [93.5, 10.5], [94.2, 5.5], [97.5, 0.5], [101.5, -4.2], [106.8, -7.5],
        [112.5, -9.5], [118.8, -10.8], [125.2, -10.2], [130.5, -8.5]
      ]
    },
    {
      name: 'Himalayan Frontal Thrust Collision',
      type: 'convergent',
      coords: [
        [74.5, 34.8], [78.2, 31.5], [82.5, 29.2], [87.8, 27.8], [92.5, 27.2],
        [96.8, 28.5]
      ]
    },
    {
      name: 'Tonga-Kermadec Trench',
      type: 'convergent',
      coords: [
        [-173.5, -15.5], [-174.2, -20.5], [-175.5, -26.5], [-177.2, -32.5], [-178.5, -38.5]
      ]
    },

    // ── TRANSFORM FAULTS (Strike-Slip) ──
    {
      name: 'San Andreas Fault Zone',
      type: 'transform',
      coords: [
        [-115.5, 32.5], [-116.8, 33.8], [-118.2, 34.6], [-120.1, 35.8], [-121.8, 36.9],
        [-122.5, 37.8], [-123.8, 38.8], [-124.3, 40.0]
      ]
    },
    {
      name: 'Alpine Fault (New Zealand)',
      type: 'transform',
      coords: [
        [171.5, -42.0], [170.5, -43.2], [169.2, -44.2], [167.5, -45.5]
      ]
    },
    {
      name: 'North Anatolian Fault',
      type: 'transform',
      coords: [
        [27.5, 40.7], [30.2, 40.8], [33.5, 40.9], [36.8, 40.5], [40.5, 39.8]
      ]
    },
    {
      name: 'Queen Charlotte Fault',
      type: 'transform',
      coords: [
        [-130.5, 51.0], [-132.2, 53.2], [-134.8, 55.5], [-137.0, 58.0]
      ]
    },
    {
      name: 'Dead Sea Transform',
      type: 'transform',
      coords: [
        [34.5, 28.0], [35.0, 30.2], [35.5, 32.1], [36.1, 34.2], [36.5, 36.5]
      ]
    }
  ];

  // ─── 2. ITRF2020 Plate Motion Velocity Field (30 Global Benchmarks) ───
  // Velocities in mm/year, azimuth in degrees clockwise from North.
  const vectors = [
    { station: 'KOKB / MKEA (Hawaii)', plate: 'Pacific', lat: 20.7072, lon: -156.2575, speedMmYr: 72.0, azimuthDeg: 302.0 },
    { station: 'EISL (Easter Island)', plate: 'Nazca/Pacific', lat: -27.1258, lon: -109.3672, speedMmYr: 155.0, azimuthDeg: 95.0 },
    { station: 'GLPS (Galapagos)', plate: 'Nazca', lat: -0.9025, lon: -90.3039, speedMmYr: 54.0, azimuthDeg: 85.0 },
    { station: 'REYK (Reykjavik, Iceland)', plate: 'North America / Eurasia', lat: 64.1389, lon: -21.9556, speedMmYr: 20.0, azimuthDeg: 105.0 },
    { station: 'LHAZ (Lhasa, Tibet)', plate: 'Eurasia', lat: 29.6572, lon: 91.1042, speedMmYr: 45.0, azimuthDeg: 25.0 },
    { station: 'GODE / PASA (California)', plate: 'North America', lat: 35.2472, lon: -116.7892, speedMmYr: 38.0, azimuthDeg: 320.0 },
    { station: 'TSKB (Tsukuba / Tokyo)', plate: 'Okhotsk / Eurasia', lat: 36.1056, lon: 140.0889, speedMmYr: 35.0, azimuthDeg: 290.0 },
    { station: 'SANT (Santiago, Chile)', plate: 'South America', lat: -33.1500, lon: -70.6686, speedMmYr: 66.0, azimuthDeg: 78.0 },
    { station: 'YAR2 (Yarragadee, Australia)', plate: 'Australia', lat: -29.0465, lon: 115.3470, speedMmYr: 68.0, azimuthDeg: 35.0 },
    { station: 'HRAO (Hartebeesthoek)', plate: 'Nubia (Africa)', lat: -25.8897, lon: 27.7072, speedMmYr: 24.0, azimuthDeg: 55.0 },
    { station: 'MCM4 (McMurdo, Antarctica)', plate: 'Antarctica', lat: -77.8492, lon: 166.6694, speedMmYr: 14.0, azimuthDeg: 5.0 },
    { station: 'OHI3 (O Higgins, Antarctic Pen.)', plate: 'Antarctica', lat: -63.3214, lon: -57.8997, speedMmYr: 18.0, azimuthDeg: 65.0 },
    { station: 'GUAM (Guam, Mariana)', plate: 'Mariana / Philippine Sea', lat: 13.5892, lon: 144.8683, speedMmYr: 58.0, azimuthDeg: 295.0 },
    { station: 'TAHT (Papeete, Tahiti)', plate: 'Pacific', lat: -17.5768, lon: -149.6089, speedMmYr: 67.0, azimuthDeg: 298.0 },
    { station: 'FAIR (Fairbanks, Alaska)', plate: 'North America', lat: 64.9781, lon: -147.4989, speedMmYr: 16.0, azimuthDeg: 245.0 },
    { station: 'HERS (Herstmonceux, UK)', plate: 'Eurasia', lat: 50.8674, lon: 0.3361, speedMmYr: 22.0, azimuthDeg: 50.0 },
    { station: 'WTZR (Wettzell, Germany)', plate: 'Eurasia', lat: 49.1442, lon: 12.8780, speedMmYr: 23.0, azimuthDeg: 52.0 },
    { station: 'BRAZ (Brasilia, Brazil)', plate: 'South America', lat: -15.9472, lon: -47.8778, speedMmYr: 15.0, azimuthDeg: 340.0 },
    { station: 'KERG (Kerguelen Islands)', plate: 'Antarctica', lat: -49.3514, lon: 70.2556, speedMmYr: 12.0, azimuthDeg: 45.0 },
    { station: 'DGAR (Diego Garcia)', plate: 'Capricorn / India', lat: -7.2697, lon: 72.3703, speedMmYr: 52.0, azimuthDeg: 38.0 },
    { station: 'NTUS (Singapore)', plate: 'Sunda', lat: 1.3458, lon: 103.6797, speedMmYr: 28.0, azimuthDeg: 105.0 },
    { station: 'COCO (Cocos Keeling Is.)', plate: 'Australia', lat: -12.1883, lon: 96.8339, speedMmYr: 65.0, azimuthDeg: 22.0 },
    { station: 'UNSJ (San Juan, Argentina)', plate: 'South America', lat: -31.5125, lon: -68.6258, speedMmYr: 22.0, azimuthDeg: 80.0 },
    { station: 'AREQ (Arequipa, Peru)', plate: 'South America', lat: -16.4655, lon: -71.4928, speedMmYr: 58.0, azimuthDeg: 75.0 },
    { station: 'AUCK (Auckland, New Zealand)', plate: 'Pacific', lat: -36.6028, lon: 174.8344, speedMmYr: 42.0, azimuthDeg: 240.0 },
    { station: 'CHAT (Chatham Island)', plate: 'Pacific', lat: -43.9556, lon: -176.5658, speedMmYr: 49.0, azimuthDeg: 265.0 },
    { station: 'RYAD (Riyadh, Saudi Arabia)', plate: 'Arabia', lat: 24.7247, lon: 46.6508, speedMmYr: 32.0, azimuthDeg: 35.0 },
    { station: 'BOGT (Bogota, Colombia)', plate: 'South America', lat: 4.6403, lon: -74.0808, speedMmYr: 18.0, azimuthDeg: 70.0 },
    { station: 'BRMU (St David, Bermuda)', plate: 'North America', lat: 32.3703, lon: -64.6961, speedMmYr: 21.0, azimuthDeg: 255.0 },
    { station: 'NYA1 (Ny-Alesund, Svalbard)', plate: 'Eurasia', lat: 78.9297, lon: 11.8653, speedMmYr: 17.0, azimuthDeg: 40.0 }
  ];

  // Precalculate ve and vn in mm/year for exact kinematic auditing
  vectors.forEach(v => {
    const azRad = v.azimuthDeg * Math.PI / 180;
    v.ve = parseFloat((v.speedMmYr * Math.sin(azRad)).toFixed(2));
    v.vn = parseFloat((v.speedMmYr * Math.cos(azRad)).toFixed(2));
  });

  window.__TECTONIC_DATA__ = {
    boundaries,
    vectors
  };
})();
