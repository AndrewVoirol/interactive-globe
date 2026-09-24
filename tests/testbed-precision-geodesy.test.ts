// ============================================================================
// File: tests/testbed-precision-geodesy.test.ts
// Precision Unit Tests for Geodesy, Space Geodesy Fiducials, ICESat-2, & Tectonics
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Load geodesy module
// @ts-ignore
import geodesy from '../testbed/geodesy.js';

describe('Testbed Precision Geodesy & Tissot Deformation Suite', () => {
  const projectRoot = path.resolve(__dirname, '..');

  // --------------------------------------------------------------------------
  // 1. Great Circle & Rhumb Line Solvers
  // --------------------------------------------------------------------------
  describe('1. Great Circle vs Rhumb Line Navigational Solvers', () => {
    it('GEO-01: calculates Trans-Atlantic Great Circle distance within known benchmark (~5,550 km)', () => {
      // JFK to LHR
      const res = geodesy.solveGreatCircle(40.6413, -73.7781, 51.4700, -0.4543);
      expect(res.distanceKm).toBeGreaterThan(5500);
      expect(res.distanceKm).toBeLessThan(5600);
      expect(res.initialBearingDeg).toBeGreaterThan(45);
      expect(res.initialBearingDeg).toBeLessThan(60);
      expect(res.points.length).toBe(100);
    });

    it('GEO-02: calculates Trans-Pacific Great Circle distance within known benchmark (~8,280 km)', () => {
      // HND to SFO
      const res = geodesy.solveGreatCircle(35.5494, 139.7798, 37.6213, -122.3790);
      expect(res.distanceKm).toBeGreaterThan(8200);
      expect(res.distanceKm).toBeLessThan(8350);
      // Climbs to North Pacific high latitudes
      expect(res.peakLatDeg).toBeGreaterThan(48.0);
    });

    it('GEO-03: calculates Trans-Polar Arctic route climbing over Greenland (~7,520 km)', () => {
      // FAI to FRA
      const res = geodesy.solveGreatCircle(64.8153, -147.8561, 50.0379, 8.5622);
      expect(res.distanceKm).toBeGreaterThan(7000);
      expect(res.distanceKm).toBeLessThan(7200);
      expect(res.peakLatDeg).toBeGreaterThan(70.0);
    });

    it('GEO-04: enforces geodesic inequality s_rhumb >= s_gc across all routes', () => {
      geodesy.PRECALIBRATED_ROUTES.forEach((r: any) => {
        const evalRes = geodesy.evaluateRoute(r);
        expect(evalRes.rhumbLine.distanceKm).toBeGreaterThanOrEqual(evalRes.greatCircle.distanceKm - 0.001);
        expect(evalRes.geodesicDeltaKm).toBeGreaterThanOrEqual(-0.001);
      });
    });

    it('GEO-05: verifies Equatorial route has nearly zero geodesic delta (< 0.5%)', () => {
      const eqRoute = geodesy.PRECALIBRATED_ROUTES.find((r: any) => r.id === 'equatorial');
      expect(eqRoute).toBeDefined();
      const evalRes = geodesy.evaluateRoute(eqRoute);
      expect(evalRes.geodesicDeltaPercent).toBeLessThan(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Analytical Tissot Metric Deformation Tensor
  // --------------------------------------------------------------------------
  describe('2. Analytical Tissot Deformation Metric Tensor', () => {
    it('TIS-01: Equator (phi = 0) exhibits zero distortion (a = 1, b = 1, s = 1, 2omega = 0°)', () => {
      const tensor = geodesy.computeTissotTensor(0.0);
      expect(tensor.a).toBeCloseTo(1.0, 5);
      expect(tensor.b).toBeCloseTo(1.0, 5);
      expect(tensor.s).toBeCloseTo(1.0, 5);
      expect(tensor.maxAngularDistortionDeg).toBeCloseTo(0.0, 4);
      expect(tensor.gammaDeg).toBe(0.0);
    });

    it('TIS-02: 60° Latitude exhibits exact analytical scale factor a = 2.0 and 2omega = 2*arcsin(1/3)', () => {
      const tensor = geodesy.computeTissotTensor(60.0);
      // sec(60 deg) = 2.0
      expect(tensor.a).toBeCloseTo(2.0, 5);
      expect(tensor.b).toBeCloseTo(1.0, 5);
      expect(tensor.s).toBeCloseTo(2.0, 5);

      // (2 - 1) / (2 + 1) = 1/3
      // 2 * arcsin(1/3) * 180 / pi ≈ 38.9424°
      const theoretical2OmegaDeg = 2.0 * Math.asin(1.0 / 3.0) * (180.0 / Math.PI);
      expect(tensor.maxAngularDistortionDeg).toBeCloseTo(theoretical2OmegaDeg, 3);
    });

    it('TIS-03: verifies tensor components match metric tensor coefficients E = cos^2(phi), G = 1', () => {
      for (let lat = -80; lat <= 80; lat += 20) {
        const tensor = geodesy.computeTissotTensor(lat);
        const rad = lat * Math.PI / 180;
        const cosRad = Math.cos(rad);
        expect(tensor.E).toBeCloseTo(cosRad * cosRad, 6);
        expect(tensor.G).toBeCloseTo(1.0, 6);
        expect(tensor.F).toBe(0.0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Space Geodesy Ground Truth: ILRS SLR Fiducials
  // --------------------------------------------------------------------------
  describe('3. Space Geodesy Ground Truth: ILRS SLR Stations', () => {
    const fiducialsPath = path.join(projectRoot, 'testbed/data/geodesy-fiducials.js');
    const content = fs.readFileSync(fiducialsPath, 'utf-8');

    // Execute in sandboxed object
    const sandboxWindow: any = {};
    const runner = new Function('window', content);
    runner(sandboxWindow);

    it('ILRS-01: exposes exactly 40 core SLR stations in window.__ILRS_FIDUCIALS__', () => {
      const stations = sandboxWindow.__ILRS_FIDUCIALS__;
      expect(Array.isArray(stations)).toBe(true);
      expect(stations.length).toBe(40);
    });

    it('ILRS-02: verifies all 40 stations have valid WGS84 coordinates and metadata', () => {
      const stations = sandboxWindow.__ILRS_FIDUCIALS__;
      stations.forEach((st: any) => {
        expect(st.id).toBeDefined();
        expect(st.name).toBeDefined();
        expect(st.country).toBeDefined();
        expect(typeof st.heightMeters).toBe('number');
        expect(st.lat).toBeGreaterThanOrEqual(-90);
        expect(st.lat).toBeLessThanOrEqual(90);
        expect(st.lon).toBeGreaterThanOrEqual(-180);
        expect(st.lon).toBeLessThanOrEqual(180);
      });
    });

    it('ILRS-03: verifies presence of primary reference stations (Herstmonceux, Haleakala, McDonald, Wettzell)', () => {
      const stations = sandboxWindow.__ILRS_FIDUCIALS__;
      const ids = stations.map((s: any) => s.id);
      expect(ids).toContain('7840'); // Herstmonceux
      expect(ids).toContain('7119'); // Haleakala
      expect(ids).toContain('7080'); // McDonald
      expect(ids).toContain('8834'); // Wettzell
      expect(ids).toContain('7090'); // Yarragadee
    });
  });

  // --------------------------------------------------------------------------
  // 4. NASA ICESat-2 (ATLAS) 532nm Polar Laser Tracks
  // --------------------------------------------------------------------------
  describe('4. NASA ICESat-2 Laser Tracks Data Integrity', () => {
    const laserPath = path.join(projectRoot, 'testbed/data/icesat2-laser.js');
    const content = fs.readFileSync(laserPath, 'utf-8');

    const sandboxWindow: any = {};
    const runner = new Function('window', content);
    runner(sandboxWindow);

    it('ICE-01: exposes Greenland and Antarctic tracks in window.__ICESAT2_TRACKS__', () => {
      const tracks = sandboxWindow.__ICESAT2_TRACKS__;
      expect(Array.isArray(tracks)).toBe(true);
      expect(tracks.length).toBe(2);
      expect(tracks[0].laserWavelengthNm).toBe(532);
      expect(tracks[1].laserWavelengthNm).toBe(532);
    });

    it('ICE-02: verifies Greenland Track 0187 spans 60°N to 83°N with summit elevation > 3200m', () => {
      const tracks = sandboxWindow.__ICESAT2_TRACKS__;
      const greenland = tracks[0];
      expect(greenland.points.length).toBeGreaterThanOrEqual(70);
      const latitudes = greenland.points.map((p: any) => p.lat);
      const heights = greenland.points.map((p: any) => p.heightMeters);
      expect(Math.min(...latitudes)).toBeCloseTo(60.0, 0);
      expect(Math.max(...latitudes)).toBeGreaterThanOrEqual(83.0);
      expect(Math.max(...heights)).toBeGreaterThanOrEqual(3210.0);
    });

    it('ICE-03: verifies Antarctic Track 1387 spans -65°S to -88°S with plateau elevation > 2800m', () => {
      const tracks = sandboxWindow.__ICESAT2_TRACKS__;
      const antarctica = tracks[1];
      expect(antarctica.points.length).toBeGreaterThanOrEqual(70);
      const latitudes = antarctica.points.map((p: any) => p.lat);
      const heights = antarctica.points.map((p: any) => p.heightMeters);
      expect(Math.max(...latitudes)).toBeCloseTo(-65.0, 0);
      expect(Math.min(...latitudes)).toBeLessThanOrEqual(-88.0);
      expect(Math.max(...heights)).toBeGreaterThanOrEqual(2830.0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Continental Drift & Tectonic Geodynamics
  // --------------------------------------------------------------------------
  describe('5. Continental Drift & Tectonic Geodynamics Data Integrity', () => {
    const tectonicsPath = path.join(projectRoot, 'testbed/data/tectonics.js');
    const content = fs.readFileSync(tectonicsPath, 'utf-8');

    const sandboxWindow: any = {};
    const runner = new Function('window', content);
    runner(sandboxWindow);

    it('TEC-01: exposes boundaries and vectors in window.__TECTONIC_DATA__', () => {
      const tec = sandboxWindow.__TECTONIC_DATA__;
      expect(tec).toBeDefined();
      expect(Array.isArray(tec.boundaries)).toBe(true);
      expect(Array.isArray(tec.vectors)).toBe(true);
      expect(tec.vectors.length).toBe(30);
    });

    it('TEC-02: verifies plate boundaries include divergent, convergent, and transform mechanisms', () => {
      const boundaries = sandboxWindow.__TECTONIC_DATA__.boundaries;
      const types = new Set(boundaries.map((b: any) => b.type));
      expect(types.has('divergent')).toBe(true);
      expect(types.has('convergent')).toBe(true);
      expect(types.has('transform')).toBe(true);

      const names = boundaries.map((b: any) => b.name);
      expect(names.some((n: string) => n.includes('Mid-Atlantic Ridge'))).toBe(true);
      expect(names.some((n: string) => n.includes('Mariana Trench'))).toBe(true);
      expect(names.some((n: string) => n.includes('San Andreas'))).toBe(true);
    });

    it('TEC-03: verifies ITRF2020 velocity vectors have speed, azimuth, and correct directional components', () => {
      const vectors = sandboxWindow.__TECTONIC_DATA__.vectors;
      vectors.forEach((v: any) => {
        expect(v.speedMmYr).toBeGreaterThan(0);
        expect(v.azimuthDeg).toBeGreaterThanOrEqual(0);
        expect(v.azimuthDeg).toBeLessThan(360);
        const azRad = v.azimuthDeg * Math.PI / 180;
        const expectedVe = parseFloat((v.speedMmYr * Math.sin(azRad)).toFixed(2));
        const expectedVn = parseFloat((v.speedMmYr * Math.cos(azRad)).toFixed(2));
        expect(v.ve).toBeCloseTo(expectedVe, 1);
        expect(v.vn).toBeCloseTo(expectedVn, 1);
      });

      // Hawaii Pacific plate motion NW (~72 mm/yr)
      const hawaii = vectors.find((v: any) => v.station.includes('Hawaii'));
      expect(hawaii).toBeDefined();
      expect(hawaii.speedMmYr).toBe(72.0);
      expect(hawaii.plate).toBe('Pacific');

      // Easter Island fastest spreading (~155 mm/yr)
      const easter = vectors.find((v: any) => v.station.includes('Easter Island'));
      expect(easter).toBeDefined();
      expect(easter.speedMmYr).toBe(155.0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Extended Precision Verification Audit Suite (12 Tests)
  // --------------------------------------------------------------------------
  describe('6. Extended Precision Verification Audit Suite (12 Tests)', () => {
    const htmlPath = path.join(projectRoot, 'testbed/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    it('AUDIT-01: verifies presence of window.__RUN_EXTENDED_PRECISION_AUDIT__ and alias', () => {
      expect(html).toContain('window.__RUN_EXTENDED_PRECISION_AUDIT__ = function()');
      expect(html).toContain('window.__RUN_PROJECTION_AUDIT__ = window.__RUN_EXTENDED_PRECISION_AUDIT__');
    });

    it('AUDIT-02: executes all 12 precision tests and achieves overallPass: true', () => {
      const windowMock: any = {
        addEventListener: () => {},
        document: {
          getElementById: () => ({ getContext: () => null, addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } }),
          querySelectorAll: () => []
        }
      };

      // Load all datasets into windowMock
      new Function('window', 'globalThis', fs.readFileSync(path.join(projectRoot, 'testbed/geodesy.js'), 'utf-8'))(windowMock, windowMock);
      new Function('window', fs.readFileSync(path.join(projectRoot, 'testbed/data/geodesy-fiducials.js'), 'utf-8'))(windowMock);
      new Function('window', fs.readFileSync(path.join(projectRoot, 'testbed/data/icesat2-laser.js'), 'utf-8'))(windowMock);
      new Function('window', fs.readFileSync(path.join(projectRoot, 'testbed/data/tectonics.js'), 'utf-8'))(windowMock);
      new Function('window', fs.readFileSync(path.join(projectRoot, 'testbed/coastlines-110m.js'), 'utf-8'))(windowMock);

      const auditFnMatch = html.match(/window\.__RUN_EXTENDED_PRECISION_AUDIT__ = function\(\) \{([\s\S]*?)\n\};/);
      const evalMatch = html.match(/function evalOptionCCPU\(lonRad[\s\S]*?\n\}/);
      const smoothstepMatch = html.match(/function smoothstep\(e0, e1, x\) \{[\s\S]*?\n\}/);

      expect(auditFnMatch).not.toBeNull();
      expect(evalMatch).not.toBeNull();
      expect(smoothstepMatch).not.toBeNull();

      const sandbox = {
        window: windowMock,
        document: windowMock.document,
        RADIUS: 5.0,
        PI: Math.PI,
        TWO_PI: Math.PI * 2,
        showAuditModal: () => {},
        lastAuditReport: null
      };

      const fnRunner = new Function('sandbox',
        'with(sandbox) {' +
          smoothstepMatch![0] + '\n' +
          evalMatch![0] + '\n' +
          'const fn = function() {' + auditFnMatch![1] + '};' +
          'return fn();' +
        '}'
      );

      const report = fnRunner(sandbox);
      expect(report.tests.length).toBe(12);
      expect(report.overallPass).toBe(true);

      // Verify each individual test passed
      report.tests.forEach((t: any, idx: number) => {
        expect(t.pass, `Test ${idx + 1} (${t.name}) failed: ${t.metric}`).toBe(true);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 7. WebGPU §10.3.3 and Rule 7 Invariants (Point & Line Pipelines)
  // --------------------------------------------------------------------------
  describe('7. WebGPU Invariants: Point Pipeline & Geometric Standoff Ceiling', () => {
    const htmlPath = path.join(projectRoot, 'testbed/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    it('WGPU-01: verifies dedicated point-list pipeline exists for geodetic benchmarks', () => {
      expect(html).toContain("topology: 'point-list'");
      expect(html).toContain('vs_point');
      expect(html).toContain('fs_point');
      expect(html).toContain('pointVertBuffer');
    });

    it('WGPU-02: verifies zero hardware depthBias on non-polygonal pipelines (§10.3.3)', () => {
      const linePipelineIdx = html.indexOf('const linePipeline =');
      const pointPipelineIdx = html.indexOf('const pointPipeline =');
      expect(linePipelineIdx).toBeGreaterThan(0);
      expect(pointPipelineIdx).toBeGreaterThan(0);

      const linePipeBlock = html.slice(linePipelineIdx, pointPipelineIdx);
      const pointPipeBlock = html.slice(pointPipelineIdx, pointPipelineIdx + 1200);

      expect(linePipeBlock).not.toMatch(/depthBias:\s*[1-9]/);
      expect(pointPipeBlock).not.toMatch(/depthBias:\s*[1-9]/);
    });

    it('WGPU-03: enforces strict normal standoff ceiling z_standoff <= 0.020 across all layers', () => {
      const standoffMatches = Array.from(html.matchAll(/(?:addLineSegment|addPoint|addPolylineWithSeamCrossing)\([^)]*?,\s*(0\.\d+)\s*,\s*[01]\.0\s*\)/g));
      expect(standoffMatches.length).toBeGreaterThan(5);
      standoffMatches.forEach(m => {
        const val = parseFloat(m[1]);
        expect(val, `Standoff ${val} exceeds invariant 0.020`).toBeLessThanOrEqual(0.020001);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 8. Antimeridian Seam Crossing & Polyline Continuity
  // --------------------------------------------------------------------------
  describe('8. Antimeridian Seam Crossing & Polyline Continuity', () => {
    const htmlPath = path.join(projectRoot, 'testbed/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    it('SEAM-01: verifies presence of antimeridian polyline splitter', () => {
      expect(html).toContain('function addPolylineWithSeamCrossing(');
    });

    it('SEAM-02: verifies seam crossing interpolation creates continuous segments meeting at +/-180°', () => {
      const seamFnMatch = html.match(/function addPolylineWithSeamCrossing\([\s\S]*?\n  \}/);
      expect(seamFnMatch).not.toBeNull();

      const segments: any[] = [];
      const addLineSegment = (lon0: number, lat0: number, lon1: number, lat1: number) => {
        segments.push({ lon0, lat0, lon1, lat1 });
      };

      const runner = new Function('PI', 'addLineSegment',
        seamFnMatch![0] + '\n' +
        'return addPolylineWithSeamCrossing;'
      );
      const addPoly = runner(Math.PI, addLineSegment);

      // Test Tokyo (179.376°E, 47.964°N) to SFO (-179.509°W, 48.068°N)
      const pts = [
        { lon: 179.37636, lat: 47.96419 },
        { lon: -179.50926, lat: 48.06842 }
      ];
      addPoly(pts, 1, 1, 1, 1, 0.02, 0.0);

      // Must split into 2 segments: p0 -> +180 and -180 -> p1
      expect(segments.length).toBe(2);
      expect(segments[0].lon1).toBeCloseTo(Math.PI, 6);
      expect(segments[1].lon0).toBeCloseTo(-Math.PI, 6);
      expect(segments[0].lat1).toBeCloseTo(segments[1].lat0, 6);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Dual Projection Analytical Tissot Tensor (Conformal Mercator vs Equirectangular)
  // --------------------------------------------------------------------------
  describe('9. Dual Projection Tissot Tensor (Conformal Mercator vs Equirectangular)', () => {
    it('TIS-04: verifies Web Mercator endpoint produces conformal metric (a = b = sec(phi), 2omega = 0°)', () => {
      const tensorEq = geodesy.computeTissotTensor(60.0, 0, 0); // Equirectangular
      const tensorMerc = geodesy.computeTissotTensor(60.0, 0, 1); // Web Mercator

      // Equirectangular: a = 2.0, b = 1.0, 2omega = 38.9°
      expect(tensorEq.a).toBeCloseTo(2.0, 5);
      expect(tensorEq.b).toBeCloseTo(1.0, 5);
      expect(tensorEq.maxAngularDistortionDeg).toBeGreaterThan(30.0);

      // Web Mercator: conformal circle everywhere: a = 2.0, b = 2.0, s = 4.0, 2omega = 0.0°
      expect(tensorMerc.a).toBeCloseTo(2.0, 5);
      expect(tensorMerc.b).toBeCloseTo(2.0, 5);
      expect(tensorMerc.s).toBeCloseTo(4.0, 5);
      expect(tensorMerc.maxAngularDistortionDeg).toBe(0.0);
    });
  });
});
