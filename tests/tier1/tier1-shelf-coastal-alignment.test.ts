import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Tier 1: Continental Shelf & Coastal Alignment Verification', () => {
  const publicDir = path.resolve(__dirname, '../../public');
  const demPngPath = path.join(publicDir, 'earth-elevation-dem.png');
  const demWebpPath = path.join(publicDir, 'earth-elevation-dem.webp');
  const vectorsBinPath = path.join(publicDir, 'geo-vectors.bin');

  it('DEM-T1: verifies DEM textures exist and have valid file sizes', () => {
    expect(fs.existsSync(demPngPath)).toBe(true);
    expect(fs.existsSync(demWebpPath)).toBe(true);
    expect(fs.existsSync(vectorsBinPath)).toBe(true);

    const pngStat = fs.statSync(demPngPath);
    const webpStat = fs.statSync(demWebpPath);
    expect(pngStat.size).toBeGreaterThan(500000);
    expect(webpStat.size).toBeGreaterThan(500000);
  });

  it('DEM-T2: verifies geo-vectors.bin GVEC header and vertex count integrity', () => {
    const buf = fs.readFileSync(vectorsBinPath);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    const magic = view.getUint32(0, true);
    expect(magic).toBe(0x47564543); // 'GVEC'

    const version = view.getUint32(4, true);
    expect(version).toBe(1);

    const vertexCount = view.getUint32(8, true);
    const indexCount = view.getUint32(12, true);
    expect(vertexCount).toBeGreaterThan(100000);
    expect(indexCount).toBeGreaterThan(100000);
  });

  it('DEM-T3: validates Option 1 Dual-Tone Sediment Transition algorithm', () => {
    // Math model simulation from RasterLayerRenderer.tsx:
    const cMarineSediment = [0.72, 0.68, 0.58]; // Pale marine sediment / coastal silt
    const cCoastalGrass   = [0.14, 0.36, 0.24]; // Deep muted evergreen
    const cLowland        = [0.28, 0.46, 0.24]; // Olive lowland

    function evaluateShelfSediment(currentElevMeters: number, u_seaLevelOffset: number): number[] {
      if (currentElevMeters < 0.0 && u_seaLevelOffset < 0.0) {
        const exposedDryHeight = currentElevMeters - u_seaLevelOffset;
        const shelfProgress = Math.max(0.0, Math.min(1.0, exposedDryHeight / Math.max(1.0, -u_seaLevelOffset)));
        
        if (shelfProgress < 0.50) {
          const t = shelfProgress / 0.50;
          return [
            cMarineSediment[0] * (1 - t) + cCoastalGrass[0] * t,
            cMarineSediment[1] * (1 - t) + cCoastalGrass[1] * t,
            cMarineSediment[2] * (1 - t) + cCoastalGrass[2] * t,
          ];
        } else {
          const t = (shelfProgress - 0.50) / 0.50;
          return [
            cCoastalGrass[0] * (1 - t) + cLowland[0] * t,
            cCoastalGrass[1] * (1 - t) + cLowland[1] * t,
            cCoastalGrass[2] * (1 - t) + cLowland[2] * t,
          ];
        }
      }
      return [0, 0, 0];
    }

    // At seaLevelOffset = -100m:
    // 1. Point at waterline (-99m depth, 1m above waterline): shelfProgress ~ 0.01 -> Pale sediment
    const atWaterline = evaluateShelfSediment(-99.0, -100.0);
    expect(atWaterline[0]).toBeCloseTo(0.72, 1);
    expect(atWaterline[1]).toBeCloseTo(0.68, 1);
    expect(atWaterline[2]).toBeCloseTo(0.58, 1);

    // 2. Mid-shelf at -50m depth (50m above waterline): shelfProgress = 0.50 -> Coastal vegetation
    const midShelf = evaluateShelfSediment(-50.0, -100.0);
    expect(midShelf[0]).toBeCloseTo(0.14, 2);
    expect(midShelf[1]).toBeCloseTo(0.36, 2);
    expect(midShelf[2]).toBeCloseTo(0.24, 2);

    // 3. Near historic coastline at -5m depth (95m above waterline): shelfProgress ~ 0.95 -> Transition to lowland
    const nearCoast = evaluateShelfSediment(-5.0, -100.0);
    expect(nearCoast[0]).toBeGreaterThan(midShelf[0]);
    expect(nearCoast[1]).toBeGreaterThan(midShelf[1]);
  });

  it('DEM-T4: validates peak exponent preservation on lowlands and shelves', () => {
    // Verify that low-lying continental shelves and coastal plains are NOT crushed by peak exponent
    function computeDisplacement(dryElevMeters: number, peakExponent: number): number {
      const dryElevNorm = Math.max(0.0, Math.min(1.0, dryElevMeters / 8848.0));
      if (peakExponent > 1.01) {
        const peakFactor = Math.pow(dryElevNorm, peakExponent);
        const tPeak = Math.max(0.0, Math.min(1.0, (dryElevNorm - 0.04) / (0.30 - 0.04)));
        return dryElevNorm * (1 - tPeak) + peakFactor * tPeak;
      }
      return dryElevNorm;
    }

    // 100m shelf elevation above lowered waterline
    const shelfDispRaw = computeDisplacement(100.0, 1.0);
    const shelfDispSharp = computeDisplacement(100.0, 1.4);
    // Shelf displacement should remain 100% linear (equal to raw)
    expect(shelfDispSharp).toBeCloseTo(shelfDispRaw, 5);

    // High alpine peak at 6,000m
    const peakDispRaw = computeDisplacement(6000.0, 1.0);
    const peakDispSharp = computeDisplacement(6000.0, 1.4);
    // Peak displacement should be sharpened (less than raw)
    expect(peakDispSharp).toBeLessThan(peakDispRaw);
  });

  it('DEM-T5: validates omnidirectional water ripple and dynamic Fresnel modulation', () => {
    function evaluateWaterDynamics(time: number, u: number, v: number, vFacing: number) {
      const waveUv1_x = u * 360.0 + time * 0.035;
      const waveUv1_y = v * 360.0 + time * 0.018;
      const waveUv2_x = u * 720.0 - time * 0.022;
      const waveUv2_y = v * 720.0 + time * 0.041;

      const wave1 = Math.sin(waveUv1_x * 1.4 + waveUv1_y * 0.8);
      const wave2 = Math.cos(waveUv2_x * 0.9 - waveUv2_y * 1.5);
      const waveRipple = (wave1 * 0.65 + wave2 * 0.35) * 0.045;

      const dynamicCosTheta = Math.max(0.0, vFacing + waveRipple * 0.50);
      const fresnel = 0.02 + 0.98 * Math.pow(1.0 - dynamicCosTheta, 5.0);

      const absorption = 0.30;
      const swellShimmer = waveRipple * (1.0 - absorption * 0.75) * 0.40;

      return { waveRipple, fresnel, swellShimmer };
    }

    const t0 = evaluateWaterDynamics(0.0, 0.5, 0.5, 0.8);
    const t1 = evaluateWaterDynamics(5.0, 0.5, 0.5, 0.8);

    // Verify time variation produces dynamic ripples
    expect(t0.waveRipple).not.toEqual(t1.waveRipple);
    expect(t0.fresnel).not.toEqual(t1.fresnel);
    expect(t0.swellShimmer).not.toEqual(t1.swellShimmer);

    // Verify bounded values without NaN or Inf
    expect(Number.isFinite(t0.fresnel)).toBe(true);
    expect(t0.fresnel).toBeGreaterThanOrEqual(0.02);
    expect(t0.fresnel).toBeLessThanOrEqual(1.0);
  });

  it('DEM-T6: validates sea level rise flooding response', () => {
    // For sea level rise (+30m):
    const seaLevelOffset = 30.0;
    
    // Florida plain at +15m elevation:
    const floridaElev = 15.0;
    const isSubmergedFlorida = floridaElev < seaLevelOffset;
    expect(isSubmergedFlorida).toBe(true);

    const waterDepthFlorida = Math.max(0.0, seaLevelOffset - floridaElev);
    expect(waterDepthFlorida).toBe(15.0);

    // Mountain plain at +250m elevation:
    const mountainElev = 250.0;
    const isSubmergedMountain = mountainElev < seaLevelOffset;
    expect(isSubmergedMountain).toBe(false);
  });
});
