import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  LITMUS_SEQUENCES,
  GRAND_CANYON_KEYFRAMES,
  FUJI_KEYFRAMES,
  GRAND_CANYON_WAYPOINTS,
  FUJI_WAYPOINTS,
  SAMPLE_REGIONAL_INSETS,
} from '../../src/core/camera/litmusWaypoints';

/**
 * Adversarial Challenger Stage 2 Verification Suite:
 * Rigorous empirical stress testing of Stage 2 Regional High-Resolution DEM Insets
 * (Grand Canyon & Mount Fuji), binary decoding, boundary feathering, and camera safety invariants.
 */

describe('Adversarial Challenger: Regional DEM Insets Gate 2 Integrity', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const regionalDir = path.join(projectRoot, 'public', 'regional');
  const manifestPath = path.join(regionalDir, 'manifest.json');
  const gcBinPath = path.join(regionalDir, 'dem-grand-canyon-30m.bin');
  const fujiBinPath = path.join(regionalDir, 'dem-fuji-30m.bin');
  const gcWebpPath = path.join(regionalDir, 'dem-grand-canyon-30m.webp');
  const fujiWebpPath = path.join(regionalDir, 'dem-fuji-30m.webp');
  const etopoPath = path.join(projectRoot, 'public', 'earth-etopo2022-dem-u16.bin');

  const Z_MIN_GLOBAL = -10924.0;
  const Z_MAX_GLOBAL = 8848.0;
  const Z_SPAN = Z_MAX_GLOBAL - Z_MIN_GLOBAL; // 19772.0
  const Z_MAX_LAND = 8848.0;
  const D_MAX_OCEAN = 10924.0;

  it('STAGE2-CHALLENGE-01: validates manifest.json schema, bounds, and asset paths', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    expect(manifest.version).toBe('1.0');
    expect(manifest.elevationEncoding).toBeDefined();
    expect(manifest.elevationEncoding.zMin).toBe(-10924.0);
    expect(manifest.elevationEncoding.zMax).toBe(8848.0);
    expect(manifest.elevationEncoding.zSpan).toBe(19772.0);
    expect(manifest.elevationEncoding.channels.R).toBe('land_elevation_normalized_to_8848m');
    expect(manifest.elevationEncoding.channels.G).toBe('ocean_depth_normalized_to_10924m');
    expect(manifest.elevationEncoding.channels.B).toBe('shoreline_land_mask');
    expect(manifest.elevationEncoding.channels.A).toBe('full_range_signed_elevation_normalized');

    const regions = manifest.regions;
    expect(Array.isArray(regions)).toBe(true);
    expect(regions.length).toBe(4);

    const regionIds = regions.map((r: any) => r.id);
    expect(regionIds).toContain('hawaii');
    expect(regionIds).toContain('capecod');
    expect(regionIds).toContain('grand-canyon');
    expect(regionIds).toContain('fuji');

    for (const r of regions) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.name).toBe('string');
      expect(typeof r.bounds.minLon).toBe('number');
      expect(typeof r.bounds.maxLon).toBe('number');
      expect(typeof r.bounds.minLat).toBe('number');
      expect(typeof r.bounds.maxLat).toBe('number');
      expect(r.bounds.maxLon).toBeGreaterThan(r.bounds.minLon);
      expect(r.bounds.maxLat).toBeGreaterThan(r.bounds.minLat);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);

      const targetBin = path.join(projectRoot, 'public', r.binUrl.replace(/^\//, ''));
      const targetWebp = path.join(projectRoot, 'public', r.webpUrl.replace(/^\//, ''));
      expect(fs.existsSync(targetBin)).toBe(true);
      expect(fs.existsSync(targetWebp)).toBe(true);

      const binStats = fs.statSync(targetBin);
      expect(binStats.size).toBe(r.width * r.height * 8);

      expect(typeof r.minElevationMeters).toBe('number');
      expect(typeof r.maxElevationMeters).toBe('number');
      expect(r.maxElevationMeters).toBeGreaterThan(r.minElevationMeters);
      expect(Number.isFinite(r.minElevationMeters)).toBe(true);
      expect(Number.isFinite(r.maxElevationMeters)).toBe(true);
    }
  });

  it('STAGE2-CHALLENGE-02: verifies exact byte size contract: 900 x 540 x 8 = 3,888,000 bytes', () => {
    expect(fs.existsSync(gcBinPath)).toBe(true);
    expect(fs.existsSync(fujiBinPath)).toBe(true);

    const gcStats = fs.statSync(gcBinPath);
    const fujiStats = fs.statSync(fujiBinPath);

    const expectedBytes = 900 * 540 * 8; // 3,888,000 bytes
    expect(gcStats.size).toBe(expectedBytes);
    expect(fujiStats.size).toBe(expectedBytes);

    expect(fs.existsSync(gcWebpPath)).toBe(true);
    expect(fs.existsSync(fujiWebpPath)).toBe(true);
    expect(fs.statSync(gcWebpPath).size).toBeGreaterThan(50000);
    expect(fs.statSync(fujiWebpPath).size).toBeGreaterThan(50000);
  });

  it('STAGE2-CHALLENGE-03: decodes all 486,000 pixels of Grand Canyon DEM and asserts physical elevation invariants', () => {
    const buf = fs.readFileSync(gcBinPath);
    expect(buf.length).toBe(3888000);

    const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    const totalPixels = 900 * 540;
    expect(u16.length).toBe(totalPixels * 4);

    let minLandElev = Infinity;
    let maxLandElev = -Infinity;
    let minSignedElev = Infinity;
    let maxSignedElev = -Infinity;
    let nonzeroBathymetryCount = 0;
    let fullyLandMaskCount = 0;
    let maxCrossChannelDelta = 0;

    for (let p = 0; p < totalPixels; p++) {
      const r = u16[p * 4 + 0];
      const g = u16[p * 4 + 1];
      const b = u16[p * 4 + 2];
      const a = u16[p * 4 + 3];

      // Assert uint16 range and non-NaN
      expect(Number.isFinite(r)).toBe(true);
      expect(Number.isFinite(g)).toBe(true);
      expect(Number.isFinite(b)).toBe(true);
      expect(Number.isFinite(a)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(65535);

      const landMeters = (r / 65535.0) * Z_MAX_LAND;
      const oceanMeters = (g / 65535.0) * D_MAX_OCEAN;
      const signedMeters = (a / 65535.0) * Z_SPAN + Z_MIN_GLOBAL;

      if (landMeters < minLandElev) minLandElev = landMeters;
      if (landMeters > maxLandElev) maxLandElev = landMeters;
      if (signedMeters < minSignedElev) minSignedElev = signedMeters;
      if (signedMeters > maxSignedElev) maxSignedElev = signedMeters;

      if (g > 0) nonzeroBathymetryCount++;
      if (b === 65535) fullyLandMaskCount++;

      // In Grand Canyon, elevation is positive land, so landMeters and signedMeters must match closely (< 1m quantization)
      const delta = Math.abs(landMeters - signedMeters);
      if (delta > maxCrossChannelDelta) maxCrossChannelDelta = delta;
    }

    // Grand Canyon physical elevation rubric: strictly between 500m (Colorado River bed) and 2850m (Kaibab Plateau)
    expect(minLandElev).toBeGreaterThanOrEqual(500.0);
    expect(minLandElev).toBeLessThanOrEqual(700.0);
    expect(maxLandElev).toBeGreaterThanOrEqual(2750.0);
    expect(maxLandElev).toBeLessThanOrEqual(2850.0);

    expect(minSignedElev).toBeGreaterThanOrEqual(500.0);
    expect(maxSignedElev).toBeLessThanOrEqual(2850.0);

    // Grand Canyon is 100% inland land: bathymetry must be 0 everywhere
    expect(nonzeroBathymetryCount).toBe(0);

    // Shoreline land mask must be 1.0 (65535) across the entire inland plateau
    expect(fullyLandMaskCount).toBe(totalPixels);

    // Cross-channel parity check between R (land) and A (signed elevation)
    expect(maxCrossChannelDelta).toBeLessThan(0.6); // Quantization delta <= 0.6m
  });

  it('STAGE2-CHALLENGE-04: decodes all 486,000 pixels of Mount Fuji DEM and asserts physical volcanic elevation invariants', () => {
    const buf = fs.readFileSync(fujiBinPath);
    expect(buf.length).toBe(3888000);

    const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    const totalPixels = 900 * 540;
    expect(u16.length).toBe(totalPixels * 4);

    let minLandElev = Infinity;
    let maxLandElev = -Infinity;
    let minSignedElev = Infinity;
    let maxSignedElev = -Infinity;
    let nonzeroBathymetryCount = 0;
    let maxCrossChannelDelta = 0;

    for (let p = 0; p < totalPixels; p++) {
      const r = u16[p * 4 + 0];
      const g = u16[p * 4 + 1];
      const b = u16[p * 4 + 2];
      const a = u16[p * 4 + 3];

      expect(Number.isFinite(r)).toBe(true);
      expect(Number.isFinite(g)).toBe(true);
      expect(Number.isFinite(b)).toBe(true);
      expect(Number.isFinite(a)).toBe(true);

      const landMeters = (r / 65535.0) * Z_MAX_LAND;
      const oceanMeters = (g / 65535.0) * D_MAX_OCEAN;
      const signedMeters = (a / 65535.0) * Z_SPAN + Z_MIN_GLOBAL;

      if (landMeters < minLandElev) minLandElev = landMeters;
      if (landMeters > maxLandElev) maxLandElev = landMeters;
      if (signedMeters < minSignedElev) minSignedElev = signedMeters;
      if (signedMeters > maxSignedElev) maxSignedElev = signedMeters;

      if (g > 0) nonzeroBathymetryCount++;

      const delta = Math.abs(landMeters - signedMeters);
      if (delta > maxCrossChannelDelta) maxCrossChannelDelta = delta;
    }

    // Mount Fuji physical elevation rubric: summit is 3,776m; base in Suruga/Kanto basin is > 0m
    expect(minLandElev).toBeGreaterThanOrEqual(0.0);
    expect(minLandElev).toBeLessThanOrEqual(100.0);
    expect(maxLandElev).toBeGreaterThanOrEqual(3700.0);
    expect(maxLandElev).toBeLessThanOrEqual(3776.0);

    expect(minSignedElev).toBeGreaterThanOrEqual(0.0);
    expect(maxSignedElev).toBeLessThanOrEqual(3776.0);

    // Selected bounding box [138.5, 139.0, 35.2, 35.5] is strictly onshore; bathymetry should be 0
    expect(nonzeroBathymetryCount).toBe(0);

    // Cross-channel parity
    expect(maxCrossChannelDelta).toBeLessThan(0.6);
  });

  it('STAGE2-CHALLENGE-05: verifies seamless boundary feathering with global ETOPO 2022 DEM base', () => {
    expect(fs.existsSync(etopoPath)).toBe(true);
    const etopoBuf = fs.readFileSync(etopoPath);
    const etopoU16 = new Uint16Array(etopoBuf.buffer, etopoBuf.byteOffset, etopoBuf.length / 2);
    expect(etopoU16.length).toBe(4096 * 8192 * 4);

    function sampleEtopo(lon: number, lat: number): number {
      const rowF = Math.min(4095.0, Math.max(0.0, (90.0 - lat) / 180.0 * 4096.0));
      const colF = Math.min(8191.0, Math.max(0.0, (lon + 180.0) / 360.0 * 8192.0));

      const r0 = Math.floor(rowF);
      const r1 = Math.min(4095, r0 + 1);
      const fr = rowF - r0;

      const c0 = Math.floor(colF);
      const c1 = (c0 + 1) % 8192;
      const fc = colF - c0;

      const samplePixel = (r: number, c: number) => {
        const idx = (r * 8192 + c) * 4 + 3; // A channel
        const raw = etopoU16[idx];
        return (raw / 65535.0) * Z_SPAN + Z_MIN_GLOBAL;
      };

      const top = (1.0 - fc) * samplePixel(r0, c0) + fc * samplePixel(r0, c1);
      const bottom = (1.0 - fc) * samplePixel(r1, c0) + fc * samplePixel(r1, c1);
      return (1.0 - fr) * top + fr * bottom;
    }

    // Inspect Grand Canyon perimeter pixels
    const gcBuf = fs.readFileSync(gcBinPath);
    const gcU16 = new Uint16Array(gcBuf.buffer, gcBuf.byteOffset, gcBuf.length / 2);
    const w = 900;
    const h = 540;

    const getGCElev = (col: number, row: number) => {
      const rawA = gcU16[(row * w + col) * 4 + 3];
      return (rawA / 65535.0) * Z_SPAN + Z_MIN_GLOBAL;
    };

    // Evaluate perimeter points on all 4 borders
    const gcMinLon = -112.5;
    const gcMaxLon = -111.5;
    const gcMinLat = 35.9;
    const gcMaxLat = 36.5;

    let sampleCount = 0;
    let perimeterCorrelationError = 0;

    // Top border (row = 0, lat = maxLat)
    for (let col = 0; col < w; col += 30) {
      const lon = gcMinLon + (col / (w - 1)) * (gcMaxLon - gcMinLon);
      const lat = gcMaxLat;
      const regElev = getGCElev(col, 0);
      const baseElev = sampleEtopo(lon, lat);
      perimeterCorrelationError += Math.abs(regElev - baseElev);
      sampleCount++;
    }

    // Bottom border (row = h - 1, lat = minLat)
    for (let col = 0; col < w; col += 30) {
      const lon = gcMinLon + (col / (w - 1)) * (gcMaxLon - gcMinLon);
      const lat = gcMinLat;
      const regElev = getGCElev(col, h - 1);
      const baseElev = sampleEtopo(lon, lat);
      perimeterCorrelationError += Math.abs(regElev - baseElev);
      sampleCount++;
    }

    // Left border (col = 0, lon = minLon)
    for (let row = 0; row < h; row += 30) {
      const lon = gcMinLon;
      const lat = gcMaxLat - (row / (h - 1)) * (gcMaxLat - gcMinLat);
      const regElev = getGCElev(0, row);
      const baseElev = sampleEtopo(lon, lat);
      perimeterCorrelationError += Math.abs(regElev - baseElev);
      sampleCount++;
    }

    // Right border (col = w - 1, lon = maxLon)
    for (let row = 0; row < h; row += 30) {
      const lon = gcMaxLon;
      const lat = gcMaxLat - (row / (h - 1)) * (gcMaxLat - gcMinLat);
      const regElev = getGCElev(w - 1, row);
      const baseElev = sampleEtopo(lon, lat);
      perimeterCorrelationError += Math.abs(regElev - baseElev);
      sampleCount++;
    }

    const avgPerimeterError = perimeterCorrelationError / sampleCount;
    // Regional precomputation initializes from bilinear ETOPO base; perimeter error should be small
    expect(avgPerimeterError).toBeLessThan(120.0); // Within reasonable terrain variation
  });

  it('STAGE2-CHALLENGE-06: executes Monte Carlo stress fuzzing over 50,000 points on shader blend weight function', () => {
    // WGSL getRegionalBlendWeight logic
    function getRegionalBlendWeight(
      lon: number,
      lat: number,
      minLon: number,
      minLat: number,
      maxLon: number,
      maxLat: number,
      active: boolean = true
    ): number {
      if (!active) return 0.0;
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return 0.0;

      const regU = (lon - minLon) / (maxLon - minLon);
      const regV = (maxLat - lat) / (maxLat - minLat);

      const blendDeg = 0.5;
      const lonSpan = maxLon - minLon;
      const latSpan = maxLat - minLat;
      const marginU = Math.min(0.49, Math.max(0.001, blendDeg / lonSpan));
      const marginV = Math.min(0.49, Math.max(0.001, blendDeg / latSpan));

      const distU = Math.min(regU, 1.0 - regU);
      const distV = Math.min(regV, 1.0 - regV);

      const smoothstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.min(1.0, Math.max(0.0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3.0 - 2.0 * t);
      };

      const weightU = smoothstep(0.0, marginU, distU);
      const weightV = smoothstep(0.0, marginV, distV);
      return weightU * weightV;
    }

    // 1. Exact boundary probing
    const bounds = [-112.5, 35.9, -111.5, 36.5];
    expect(getRegionalBlendWeight(bounds[0], 36.2, bounds[0], bounds[1], bounds[2], bounds[3])).toBe(0.0);
    expect(getRegionalBlendWeight(bounds[2], 36.2, bounds[0], bounds[1], bounds[2], bounds[3])).toBe(0.0);
    expect(getRegionalBlendWeight(-112.0, bounds[1], bounds[0], bounds[1], bounds[2], bounds[3])).toBe(0.0);
    expect(getRegionalBlendWeight(-112.0, bounds[3], bounds[0], bounds[1], bounds[2], bounds[3])).toBe(0.0);

    // Center point should achieve peak weight
    const centerWeight = getRegionalBlendWeight(-112.0, 36.2, bounds[0], bounds[1], bounds[2], bounds[3]);
    expect(centerWeight).toBeGreaterThan(0.99);

    // 2. Monte Carlo 50,000 iterations over global domain
    for (let i = 0; i < 50_000; i++) {
      const testLon = (Math.random() * 360.0) - 180.0;
      const testLat = (Math.random() * 180.0) - 90.0;
      const weight = getRegionalBlendWeight(testLon, testLat, bounds[0], bounds[1], bounds[2], bounds[3]);

      expect(Number.isFinite(weight)).toBe(true);
      expect(Number.isNaN(weight)).toBe(false);
      expect(weight).toBeGreaterThanOrEqual(0.0);
      expect(weight).toBeLessThanOrEqual(1.0);

      // Outside bounds must strictly be 0.0
      if (testLon < bounds[0] || testLon > bounds[2] || testLat < bounds[1] || testLat > bounds[3]) {
        expect(weight).toBe(0.0);
      }
    }
  });

  it('STAGE2-CHALLENGE-07: asserts camera trajectory keyframes adhere to Safety Floor Invariant #19 (R >= 5.8)', () => {
    // Grand Canyon Keyframes & Waypoints
    expect(GRAND_CANYON_KEYFRAMES.length).toBe(5);
    for (const kf of GRAND_CANYON_KEYFRAMES) {
      expect(kf.radius).toBeGreaterThanOrEqual(5.8);
      expect(Number.isFinite(kf.lonDeg)).toBe(true);
      expect(Number.isFinite(kf.latDeg)).toBe(true);
      expect(kf.fov).toBeGreaterThanOrEqual(30.0);
      expect(kf.fov).toBeLessThanOrEqual(60.0);
    }

    expect(GRAND_CANYON_WAYPOINTS.length).toBeGreaterThanOrEqual(80);
    for (const wp of GRAND_CANYON_WAYPOINTS) {
      expect(wp.position.length()).toBeGreaterThanOrEqual(5.79);
      expect(Number.isFinite(wp.position.x)).toBe(true);
      expect(Number.isFinite(wp.position.y)).toBe(true);
      expect(Number.isFinite(wp.position.z)).toBe(true);
    }

    // Mount Fuji Keyframes & Waypoints
    expect(FUJI_KEYFRAMES.length).toBe(5);
    for (const kf of FUJI_KEYFRAMES) {
      expect(kf.radius).toBeGreaterThanOrEqual(5.8);
      expect(Number.isFinite(kf.lonDeg)).toBe(true);
      expect(Number.isFinite(kf.latDeg)).toBe(true);
      expect(kf.fov).toBeGreaterThanOrEqual(30.0);
      expect(kf.fov).toBeLessThanOrEqual(60.0);
    }

    expect(FUJI_WAYPOINTS.length).toBeGreaterThanOrEqual(80);
    for (const wp of FUJI_WAYPOINTS) {
      expect(wp.position.length()).toBeGreaterThanOrEqual(5.79);
      expect(Number.isFinite(wp.position.x)).toBe(true);
      expect(Number.isFinite(wp.position.y)).toBe(true);
      expect(Number.isFinite(wp.position.z)).toBe(true);
    }

    // Litmus sequences mapping
    expect(LITMUS_SEQUENCES['hawaii']).toBeDefined();
    expect(LITMUS_SEQUENCES['cape-cod']).toBeDefined();
    expect(LITMUS_SEQUENCES['grand-canyon']).toBeDefined();
    expect(LITMUS_SEQUENCES['fuji']).toBeDefined();

    // Sample regional insets
    expect(SAMPLE_REGIONAL_INSETS.length).toBe(4);
    const insetIds = SAMPLE_REGIONAL_INSETS.map(s => s.id);
    expect(insetIds).toContain('hawaii');
    expect(insetIds).toContain('capecod');
    expect(insetIds).toContain('grand-canyon');
    expect(insetIds).toContain('fuji');
  });
});
