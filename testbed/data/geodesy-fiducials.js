// ═══════════════════════════════════════════════════════════════════════════════
// ILRS Satellite Laser Ranging (SLR) Core Ground-Truth Stations (ITRF2020 / WGS84)
// Millimeter-accurate optical retroreflector tracking monuments anchoring space geodesy.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  const stations = [
    { id: '7840', name: 'Herstmonceux', country: 'United Kingdom', lat: 50.8674, lon: 0.3361, heightMeters: 74.0 },
    { id: '7080', name: 'McDonald Observatory', country: 'United States', lat: 30.6798, lon: -104.0152, heightMeters: 2075.0 },
    { id: '7119', name: 'Haleakala (Maui)', country: 'United States', lat: 20.7072, lon: -156.2575, heightMeters: 3067.0 },
    { id: '8834', name: 'Wettzell', country: 'Germany', lat: 49.1442, lon: 12.8780, heightMeters: 666.0 },
    { id: '7090', name: 'Yarragadee', country: 'Australia', lat: -29.0465, lon: 115.3470, heightMeters: 241.0 },
    { id: '7501', name: 'Hartebeesthoek', country: 'South Africa', lat: -25.8897, lon: 27.7072, heightMeters: 1555.0 },
    { id: '7941', name: 'Matera', country: 'Italy', lat: 40.6491, lon: 16.7045, heightMeters: 536.0 },
    { id: '7810', name: 'Zimmerwald', country: 'Switzerland', lat: 46.8771, lon: 7.4653, heightMeters: 907.0 },
    { id: '7237', name: 'Changchun', country: 'China', lat: 43.7906, lon: 125.4433, heightMeters: 268.0 },
    { id: '7841', name: 'Potsdam', country: 'Germany', lat: 52.3806, lon: 13.0642, heightMeters: 97.0 },
    { id: '7839', name: 'Graz Lustbuehel', country: 'Austria', lat: 47.0671, lon: 15.4935, heightMeters: 495.0 },
    { id: '7825', name: 'Mount Stromlo', country: 'Australia', lat: -35.3161, lon: 149.0097, heightMeters: 783.0 },
    { id: '7105', name: 'Greenbelt (GSFC)', country: 'United States', lat: 39.0206, lon: -76.8278, heightMeters: 49.0 },
    { id: '7110', name: 'Monument Peak', country: 'United States', lat: 32.8913, lon: -116.4241, heightMeters: 1828.0 },
    { id: '7403', name: 'Arequipa', country: 'Peru', lat: -16.4655, lon: -71.4928, heightMeters: 2489.0 },
    { id: '7406', name: 'San Juan', country: 'Argentina', lat: -31.5125, lon: -68.6258, heightMeters: 649.0 },
    { id: '7845', name: 'Grasse (MeO)', country: 'France', lat: 43.7547, lon: 6.9214, heightMeters: 1323.0 },
    { id: '7824', name: 'San Fernando', country: 'Spain', lat: 36.4636, lon: -6.2058, heightMeters: 42.0 },
    { id: '1873', name: 'Simeiz', country: 'Ukraine', lat: 44.4000, lon: 33.9900, heightMeters: 360.0 },
    { id: '1884', name: 'Riga', country: 'Latvia', lat: 56.9489, lon: 24.0583, heightMeters: 25.0 },
    { id: '7124', name: 'Tahiti Geodetic Obs', country: 'French Polynesia', lat: -17.5768, lon: -149.6089, heightMeters: 98.0 },
    { id: '7210', name: 'Maui NEOS Peak', country: 'United States', lat: 20.7082, lon: -156.2570, heightMeters: 3058.0 },
    { id: '7308', name: 'Koganei (Tokyo)', country: 'Japan', lat: 35.7100, lon: 139.4936, heightMeters: 105.0 },
    { id: '7328', name: 'Tokyo KSP', country: 'Japan', lat: 35.6581, lon: 139.5422, heightMeters: 60.0 },
    { id: '7335', name: 'Kashima Space Research', country: 'Japan', lat: 35.9536, lon: 140.6622, heightMeters: 43.0 },
    { id: '7337', name: 'Miura Station', country: 'Japan', lat: 35.1558, lon: 139.6200, heightMeters: 48.0 },
    { id: '7339', name: 'Tateyama Station', country: 'Japan', lat: 34.9819, lon: 139.8406, heightMeters: 32.0 },
    { id: '7838', name: 'Simosato Hydrographic', country: 'Japan', lat: 33.5786, lon: 135.9372, heightMeters: 101.0 },
    { id: '7821', name: 'Shanghai (Sheshan)', country: 'China', lat: 31.0994, lon: 121.1917, heightMeters: 24.0 },
    { id: '7827', name: 'Wuhan Observatory', country: 'China', lat: 30.5333, lon: 114.3667, heightMeters: 85.0 },
    { id: '7829', name: 'Beijing (Fangshan)', country: 'China', lat: 39.6086, lon: 115.8925, heightMeters: 273.0 },
    { id: '7832', name: 'Riyadh Laser Observatory', country: 'Saudi Arabia', lat: 24.7247, lon: 46.6508, heightMeters: 620.0 },
    { id: '7835', name: 'Katsively', country: 'Ukraine', lat: 44.3986, lon: 33.9786, heightMeters: 40.0 },
    { id: '7849', name: 'Borowiec Astrogeodynamic', country: 'Poland', lat: 52.2772, lon: 17.0736, heightMeters: 123.0 },
    { id: '7836', name: 'Helwan Satellite Station', country: 'Egypt', lat: 29.8600, lon: 31.3436, heightMeters: 139.0 },
    { id: '7122', name: 'Mazatlan Station', country: 'Mexico', lat: 23.2333, lon: -106.4167, heightMeters: 15.0 },
    { id: '7249', name: 'Brasilia Geodetic', country: 'Brazil', lat: -15.9472, lon: -47.8778, heightMeters: 1120.0 },
    { id: '7405', name: 'Concepcion (TIGO)', country: 'Chile', lat: -36.8436, lon: -73.0253, heightMeters: 137.0 },
    { id: '7843', name: 'Orroral Valley Tracking', country: 'Australia', lat: -35.6264, lon: 148.9531, heightMeters: 960.0 },
    { id: '7820', name: 'Kunming Satellite Obs', country: 'China', lat: 25.0294, lon: 102.7972, heightMeters: 1985.0 }
  ];

  window.__ILRS_FIDUCIALS__ = stations;
})();
