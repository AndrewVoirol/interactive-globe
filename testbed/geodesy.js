// ═══════════════════════════════════════════════════════════════════════════════
// Navigational Geodesy & Tissot Metric Deformation Tensor
// Closed-form Great Circle Geodesic (Orthodrome) vs Rhumb Line (Loxodrome) Solvers
// Analytical Tissot Deformation Metric Tensor on Equirectangular / Plate Carrée
// ═══════════════════════════════════════════════════════════════════════════════

(function(root, factory) {
  const lib = factory();
  if (typeof root !== 'undefined') {
    root.__GEODESY__ = lib;
  }
  if (typeof window !== 'undefined') {
    window.__GEODESY__ = lib;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__GEODESY__ = lib;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
    module.exports.default = lib;
  }
  if (typeof define === 'function' && define.amd) {
    define([], function() { return lib; });
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function() {
  'use strict';

  const PI = Math.PI;
  const TWO_PI = 2.0 * PI;
  const DEG2RAD = PI / 180.0;
  const RAD2DEG = 180.0 / PI;
  const EARTH_RADIUS_KM = 6371.0088; // IUGG mean spherical radius of Earth

  function toRad(deg) { return deg * DEG2RAD; }
  function toDeg(rad) { return rad * RAD2DEG; }

  // Normalize longitude to [-180, 180)
  function normLonDeg(lon) {
    let l = (lon + 180.0) % 360.0;
    if (l < 0) l += 360.0;
    return l - 180.0;
  }

  // Normalize longitude to [-PI, PI)
  function normLonRad(lon) {
    let l = (lon + PI) % TWO_PI;
    if (l < 0) l += TWO_PI;
    return l - PI;
  }

  // ─── 1. Great Circle Solver (Spherical Geodesic / Slerp) ───
  function solveGreatCircle(lat1Deg, lon1Deg, lat2Deg, lon2Deg, numPoints = 100) {
    const phi1 = toRad(lat1Deg);
    const lam1 = toRad(lon1Deg);
    const phi2 = toRad(lat2Deg);
    const lam2 = toRad(lon2Deg);
    const dLam = normLonRad(lam2 - lam1);

    // Haversine formulation for central angular distance c
    const sinDPhi2 = Math.sin((phi2 - phi1) * 0.5);
    const sinDLam2 = Math.sin(dLam * 0.5);
    const a = sinDPhi2 * sinDPhi2 + Math.cos(phi1) * Math.cos(phi2) * sinDLam2 * sinDLam2;
    const c = 2.0 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1.0 - a)));
    const distanceKm = EARTH_RADIUS_KM * c;

    // Initial bearing (forward azimuth) from point 1 to point 2
    const yInit = Math.sin(dLam) * Math.cos(phi2);
    const xInit = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
    let initBearingDeg = toDeg(Math.atan2(yInit, xInit));
    if (initBearingDeg < 0) initBearingDeg += 360.0;

    // Final bearing from point 1 arriving at point 2
    const yFin = Math.sin(-dLam) * Math.cos(phi1);
    const xFin = Math.cos(phi2) * Math.sin(phi1) - Math.sin(phi2) * Math.cos(phi1) * Math.cos(-dLam);
    let finBearingDeg = toDeg(Math.atan2(yFin, xFin)) + 180.0;
    if (finBearingDeg >= 360.0) finBearingDeg -= 360.0;

    // Peak vertex latitude (maximum absolute latitude reached by geodesic)
    const sinAlpha1 = Math.sin(toRad(initBearingDeg));
    const cosPhiMax = Math.abs(Math.cos(phi1) * sinAlpha1);
    const phiMaxRad = Math.acos(Math.max(0, Math.min(1.0, cosPhiMax)));
    const peakLatDeg = toDeg(phiMaxRad);

    // Slerp interpolation between points 1 and 2 in 3D Cartesian coordinates
    const points = [];
    const sinC = Math.sin(c);
    const cosPhi1 = Math.cos(phi1);
    const cosPhi2 = Math.cos(phi2);
    const p1x = cosPhi1 * Math.cos(lam1);
    const p1y = cosPhi1 * Math.sin(lam1);
    const p1z = Math.sin(phi1);
    const p2x = cosPhi2 * Math.cos(lam2);
    const p2y = cosPhi2 * Math.sin(lam2);
    const p2z = Math.sin(phi2);

    for (let i = 0; i < numPoints; i++) {
      const f = i / (numPoints - 1);
      let px, py, pz;
      if (sinC > 1e-7) {
        const A = Math.sin((1.0 - f) * c) / sinC;
        const B = Math.sin(f * c) / sinC;
        px = A * p1x + B * p2x;
        py = A * p1y + B * p2y;
        pz = A * p1z + B * p2z;
      } else {
        px = p1x; py = p1y; pz = p1z;
      }
      const lat = toDeg(Math.atan2(pz, Math.hypot(px, py)));
      const lon = normLonDeg(toDeg(Math.atan2(py, px)));
      points.push({
        lat: parseFloat(lat.toFixed(5)),
        lon: parseFloat(lon.toFixed(5))
      });
    }

    return {
      distanceKm: parseFloat(distanceKm.toFixed(3)),
      initialBearingDeg: parseFloat(initBearingDeg.toFixed(2)),
      finalBearingDeg: parseFloat(finBearingDeg.toFixed(2)),
      peakLatDeg: parseFloat(peakLatDeg.toFixed(2)),
      centralAngleRad: c,
      points
    };
  }

  // ─── 2. Rhumb Line Solver (Loxodrome - Constant Compass Course) ───
  function solveRhumbLine(lat1Deg, lon1Deg, lat2Deg, lon2Deg, numPoints = 100) {
    const phi1 = toRad(lat1Deg);
    const lam1 = toRad(lon1Deg);
    const phi2 = toRad(lat2Deg);
    const lam2 = toRad(lon2Deg);
    const dPhi = phi2 - phi1;
    let dLam = lam2 - lam1;

    // Shortest path around antimeridian
    if (Math.abs(dLam) > PI) {
      dLam = dLam > 0 ? -(TWO_PI - dLam) : (TWO_PI + dLam);
    }

    // Isometric latitude difference: Δψ = ln(tan(π/4 + φ2/2) / tan(π/4 + φ1/2))
    const safeTan1 = Math.tan(PI * 0.25 + Math.max(-1.55, Math.min(1.55, phi1)) * 0.5);
    const safeTan2 = Math.tan(PI * 0.25 + Math.max(-1.55, Math.min(1.55, phi2)) * 0.5);
    const dPsi = Math.log(safeTan2 / safeTan1);

    // Constant compass bearing β
    let bearingDeg = toDeg(Math.atan2(dLam, dPsi));
    if (bearingDeg < 0) bearingDeg += 360.0;

    // Scaling factor q = Δφ / Δψ (or cos(φ) if along parallel)
    let q;
    if (Math.abs(dPsi) > 1e-9) {
      q = dPhi / dPsi;
    } else {
      q = Math.cos(phi1);
    }

    const distanceKm = EARTH_RADIUS_KM * Math.hypot(dPhi, q * dLam);

    // Interpolation along constant compass course in isometric latitude
    const points = [];
    const psi1 = Math.log(safeTan1);
    const psi2 = Math.log(safeTan2);

    for (let i = 0; i < numPoints; i++) {
      const f = i / (numPoints - 1);
      let lat, lon;
      if (Math.abs(dPhi) > 1e-6) {
        const psi = psi1 + f * (psi2 - psi1);
        lat = toDeg(2.0 * Math.atan(Math.exp(psi)) - PI * 0.5);
      } else {
        lat = lat1Deg;
      }
      lon = normLonDeg(lon1Deg + toDeg(f * dLam));
      points.push({
        lat: parseFloat(lat.toFixed(5)),
        lon: parseFloat(lon.toFixed(5))
      });
    }

    return {
      distanceKm: parseFloat(distanceKm.toFixed(3)),
      constantBearingDeg: parseFloat(bearingDeg.toFixed(2)),
      points
    };
  }

  // ─── 3. Analytical Tissot Metric Deformation Tensor ───
  // Closed-form differential geometry of:
  // - Equirectangular / Plate Carrée (endpoint = 0):
  //   x = R*λ, y = R*φ
  //   E = R²cos²φ, F = 0, G = R²
  //   E' = R², F' = 0, G' = R²
  //   a = sec(φ), b = 1.000, s = sec(φ), 2ω = 2*arcsin((sec(φ)-1)/(sec(φ)+1))
  // - Web Mercator (endpoint = 1):
  //   x = R*λ, y = R*ln(tan(π/4 + φ/2))
  //   Conformal: a = sec(φ), b = sec(φ), s = sec²(φ), 2ω = 0.0°
  function computeTissotTensor(latDeg, lonDeg = 0, endpoint = 0) {
    const phi = toRad(latDeg);
    const cosPhi = Math.cos(phi);
    const absCosPhi = Math.abs(cosPhi);
    const secPhi = absCosPhi > 1e-6 ? (1.0 / absCosPhi) : 1e6;

    const isMercator = endpoint === 1 || endpoint === 'mercator';

    if (isMercator) {
      const a = secPhi;
      const b = secPhi;
      const s = a * b;
      return {
        latDeg,
        lonDeg,
        projection: 'mercator',
        a: parseFloat(a.toFixed(6)),
        b: parseFloat(b.toFixed(6)),
        s: parseFloat(s.toFixed(6)),
        maxAngularDistortionRad: 0.0,
        maxAngularDistortionDeg: 0.0,
        gammaDeg: 0.0,
        E: cosPhi * cosPhi,
        F: 0.0,
        G: 1.0,
        E_prime: 1.0,
        F_prime: 0.0,
        G_prime: 1.0
      };
    }

    // Normal Equirectangular
    const a = secPhi;
    const b = 1.0;
    const s = a * b;
    const sinOmega = (a - b) / (a + b);
    const omegaRad = Math.asin(Math.max(-1.0, Math.min(1.0, sinOmega)));
    const maxAngularDistortionRad = 2.0 * omegaRad;
    const maxAngularDistortionDeg = maxAngularDistortionRad * RAD2DEG;
    const gammaDeg = 0.0;

    return {
      latDeg,
      lonDeg,
      projection: 'equirectangular',
      a: parseFloat(a.toFixed(6)),
      b: parseFloat(b.toFixed(6)),
      s: parseFloat(s.toFixed(6)),
      maxAngularDistortionRad,
      maxAngularDistortionDeg: parseFloat(maxAngularDistortionDeg.toFixed(4)),
      gammaDeg,
      // Metric components
      E: cosPhi * cosPhi,
      F: 0.0,
      G: 1.0,
      E_prime: 1.0,
      F_prime: 0.0,
      G_prime: 1.0
    };
  }

  // ─── 4. Pre-Calibrated Trans-Oceanic Routes ───
  const PRECALIBRATED_ROUTES = [
    {
      id: 'transatlantic',
      name: 'Trans-Atlantic Corridor',
      origin: { name: 'New York (JFK)', lat: 40.6413, lon: -73.7781 },
      destination: { name: 'London Heathrow (LHR)', lat: 51.4700, lon: -0.4543 },
      description: 'North Atlantic Tracks (NAT) great circle arc climbing to 52°N latitude.'
    },
    {
      id: 'transpacific',
      name: 'Trans-Pacific Great Circle',
      origin: { name: 'Tokyo Haneda (HND)', lat: 35.5494, lon: 139.7798 },
      destination: { name: 'San Francisco (SFO)', lat: 37.6213, lon: -122.3790 },
      description: 'Pacific rim route curving past Aleutian Trench at 52°N.'
    },
    {
      id: 'transpolar',
      name: 'Trans-Polar Arctic Route',
      origin: { name: 'Fairbanks (FAI)', lat: 64.8153, lon: -147.8561 },
      destination: { name: 'Frankfurt (FRA)', lat: 50.0379, lon: 8.5622 },
      description: 'Polar arc traversing Greenland Ice Sheet at 75°N summit.'
    },
    {
      id: 'equatorial',
      name: 'Equatorial Maritime Highway',
      origin: { name: 'Singapore (SIN)', lat: 1.3644, lon: 103.9915 },
      destination: { name: 'Nairobi (NBO)', lat: -1.3192, lon: 36.9275 },
      description: 'Indian Ocean equatorial crossing where Great Circle and Rhumb line coincide.'
    }
  ];

  // Helper to evaluate full route contrast with Geodesic Delta
  function evaluateRoute(route) {
    const gc = solveGreatCircle(route.origin.lat, route.origin.lon, route.destination.lat, route.destination.lon, 100);
    const rhumb = solveRhumbLine(route.origin.lat, route.origin.lon, route.destination.lat, route.destination.lon, 100);
    const deltaKm = rhumb.distanceKm - gc.distanceKm;
    const deltaPercent = (deltaKm / gc.distanceKm) * 100.0;

    return {
      route,
      greatCircle: gc,
      rhumbLine: rhumb,
      geodesicDeltaKm: parseFloat(deltaKm.toFixed(3)),
      geodesicDeltaPercent: parseFloat(deltaPercent.toFixed(2))
    };
  }

  return {
    EARTH_RADIUS_KM,
    solveGreatCircle,
    solveRhumbLine,
    computeTissotTensor,
    PRECALIBRATED_ROUTES,
    evaluateRoute
  };
});
