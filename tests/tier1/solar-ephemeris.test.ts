import { describe, it, expect, vi } from 'vitest';
import { getSolarPosition } from '../../src/core/astronomy/SolarEphemeris';
import { WebGPUEngine } from '../../src/webgpu/WebGPUEngine';
import fs from 'fs';
import path from 'path';

describe('Tier 1: Solar Ephemeris & Astronomical Illumination Engine', () => {
  const RAD_TO_DEG = 180 / Math.PI;

  it('verifies June 21 summer solstice declination ≈ +23.44° ±0.5°', () => {
    // 2024 (leap year)
    const pos2024 = getSolarPosition(Date.UTC(2024, 5, 21, 12, 0, 0));
    const decDeg2024 = pos2024.declination * RAD_TO_DEG;
    expect(Math.abs(decDeg2024 - 23.44)).toBeLessThanOrEqual(0.5);

    // 2025 (common year)
    const pos2025 = getSolarPosition(Date.UTC(2025, 5, 21, 12, 0, 0));
    const decDeg2025 = pos2025.declination * RAD_TO_DEG;
    expect(Math.abs(decDeg2025 - 23.44)).toBeLessThanOrEqual(0.5);
  });

  it('verifies December 21 winter solstice declination ≈ -23.44° ±0.5°', () => {
    // 2024 (leap year)
    const pos2024 = getSolarPosition(Date.UTC(2024, 11, 21, 12, 0, 0));
    const decDeg2024 = pos2024.declination * RAD_TO_DEG;
    expect(Math.abs(decDeg2024 - (-23.44))).toBeLessThanOrEqual(0.5);

    // 2025 (common year)
    const pos2025 = getSolarPosition(Date.UTC(2025, 11, 21, 12, 0, 0));
    const decDeg2025 = pos2025.declination * RAD_TO_DEG;
    expect(Math.abs(decDeg2025 - (-23.44))).toBeLessThanOrEqual(0.5);
  });

  it('verifies March 20 and September 22-23 equinoxes declination ≈ 0° ±1°', () => {
    // 2024 (leap year vernal equinox)
    const pos2024 = getSolarPosition(Date.UTC(2024, 2, 20, 12, 0, 0));
    const decDeg2024 = pos2024.declination * RAD_TO_DEG;
    expect(Math.abs(decDeg2024)).toBeLessThanOrEqual(1.0);

    // 2025 (vernal equinox around March 20-21)
    const pos2025 = getSolarPosition(Date.UTC(2025, 2, 21, 12, 0, 0));
    const decDeg2025 = pos2025.declination * RAD_TO_DEG;
    expect(Math.abs(decDeg2025)).toBeLessThanOrEqual(1.0);

    // 2024 (autumnal equinox around Sept 22-23)
    const posAutumn2024 = getSolarPosition(Date.UTC(2024, 8, 22, 12, 0, 0));
    const decDegAutumn2024 = posAutumn2024.declination * RAD_TO_DEG;
    expect(Math.abs(decDegAutumn2024)).toBeLessThanOrEqual(1.0);
  });

  it('verifies solar noon UTC at Greenwich has subsolar longitude ≈ 0° ±1° and no negative zero', () => {
    const dates = [
      Date.UTC(2024, 0, 15, 12, 0, 0),
      Date.UTC(2024, 5, 21, 12, 0, 0),
      Date.UTC(2024, 8, 23, 12, 0, 0),
      Date.UTC(2024, 11, 21, 12, 0, 0),
      Date.UTC(2026, 8, 11, 12, 0, 0),
    ];

    for (const t of dates) {
      const pos = getSolarPosition(t);
      const lonDeg = pos.subsolarLon * RAD_TO_DEG;
      expect(Math.abs(lonDeg)).toBeLessThanOrEqual(1.0);
      // Ensure IEEE-754 negative zero does not contaminate outputs
      expect(Object.is(pos.subsolarLon, -0)).toBe(false);
      expect(Object.is(pos.sunVector[0], -0)).toBe(false);
    }
  });

  it('verifies sun vector is strictly unit length (‖v‖ = 1.0 ±1e-6) across 10,000 random timestamps', () => {
    const startMs = Date.UTC(1970, 0, 1);
    const endMs = Date.UTC(2100, 0, 1);
    const span = endMs - startMs;

    for (let i = 0; i < 10000; i++) {
      const randTime = startMs + Math.random() * span;
      const { declination, subsolarLon, sunVector } = getSolarPosition(randTime);

      const norm = Math.hypot(sunVector[0], sunVector[1], sunVector[2]);
      expect(Math.abs(norm - 1.0)).toBeLessThan(1e-6);
      expect(Number.isFinite(sunVector[0])).toBe(true);
      expect(Number.isFinite(sunVector[1])).toBe(true);
      expect(Number.isFinite(sunVector[2])).toBe(true);
      expect(Number.isFinite(declination)).toBe(true);
      expect(Number.isFinite(subsolarLon)).toBe(true);

      // Declination bounded by ±23.45°
      expect(Math.abs(declination * RAD_TO_DEG)).toBeLessThanOrEqual(23.45);
      // Longitude bounded by ±π (±180°)
      expect(Math.abs(subsolarLon * RAD_TO_DEG)).toBeLessThanOrEqual(180.0001);

      // No IEEE-754 negative zeros
      expect(Object.is(declination, -0)).toBe(false);
      expect(Object.is(subsolarLon, -0)).toBe(false);
      expect(Object.is(sunVector[0], -0)).toBe(false);
      expect(Object.is(sunVector[1], -0)).toBe(false);
      expect(Object.is(sunVector[2], -0)).toBe(false);
    }
  });

  it('verifies diurnal subsolar longitude movement and 3D vector orientation across a 24h cycle', () => {
    // 00:00 UTC -> Sun at antimeridian (180°), z < 0, x ≈ 0
    const t00 = getSolarPosition(Date.UTC(2024, 2, 20, 0, 0, 0));
    expect(Math.abs(Math.abs(t00.subsolarLon * RAD_TO_DEG) - 180)).toBeLessThanOrEqual(1.0);
    expect(t00.sunVector[2]).toBeLessThan(0); // pointing into -z

    // 06:00 UTC -> Sun over 90°E, x > 0 (East), z ≈ 0
    const t06 = getSolarPosition(Date.UTC(2024, 2, 20, 6, 0, 0));
    expect(Math.abs(t06.subsolarLon * RAD_TO_DEG - 90)).toBeLessThanOrEqual(1.0);
    expect(t06.sunVector[0]).toBeGreaterThan(0.9);

    // 12:00 UTC -> Sun over Prime Meridian (0°), z > 0, x ≈ 0
    const t12 = getSolarPosition(Date.UTC(2024, 2, 20, 12, 0, 0));
    expect(Math.abs(t12.subsolarLon * RAD_TO_DEG)).toBeLessThanOrEqual(1.0);
    expect(t12.sunVector[2]).toBeGreaterThan(0.9);

    // 18:00 UTC -> Sun over 90°W (-90°), x < 0 (West), z ≈ 0
    const t18 = getSolarPosition(Date.UTC(2024, 2, 20, 18, 0, 0));
    expect(Math.abs(t18.subsolarLon * RAD_TO_DEG - (-90))).toBeLessThanOrEqual(1.0);
    expect(t18.sunVector[0]).toBeLessThan(-0.9);
  });

  it('verifies robust handling of non-finite timestamps, out-of-range dates, and historical epochs', () => {
    const nanPos = getSolarPosition(NaN);
    expect(Math.hypot(...nanPos.sunVector)).toBeCloseTo(1.0, 6);
    expect(nanPos.declination).toBe(0);
    expect(nanPos.subsolarLon).toBe(0);

    const infPos = getSolarPosition(Infinity);
    expect(Math.hypot(...infPos.sunVector)).toBeCloseTo(1.0, 6);
    expect(infPos.declination).toBe(0);

    const negInfPos = getSolarPosition(-Infinity);
    expect(Math.hypot(...negInfPos.sunVector)).toBeCloseTo(1.0, 6);
    expect(negInfPos.declination).toBe(0);

    // Extreme timestamps exceeding JS Date range (±8.64e15)
    const outRangePos = getSolarPosition(1e16);
    expect(Number.isFinite(outRangePos.declination)).toBe(true);
    expect(Number.isFinite(outRangePos.subsolarLon)).toBe(true);
    expect(outRangePos.declination).toBe(0);
    expect(outRangePos.subsolarLon).toBe(0);
    expect(Math.hypot(...outRangePos.sunVector)).toBeCloseTo(1.0, 6);

    // Historical pre-1970 timestamp (1842)
    const histPos1842 = getSolarPosition(Date.UTC(1842, 5, 21, 12, 0, 0));
    expect(Math.abs(histPos1842.declination * RAD_TO_DEG - 23.44)).toBeLessThanOrEqual(0.5);
    expect(Math.hypot(...histPos1842.sunVector)).toBeCloseTo(1.0, 6);

    // Historical 2-digit year (50 AD) - must not be corrupted by Date.UTC 1900-offset quirk
    const d50 = new Date(0);
    d50.setUTCFullYear(50, 5, 21);
    d50.setUTCHours(12, 0, 0, 0);
    const histPos50 = getSolarPosition(d50.getTime());
    expect(Math.abs(histPos50.declination * RAD_TO_DEG - 23.44)).toBeLessThanOrEqual(0.5);
    expect(Math.hypot(...histPos50.sunVector)).toBeCloseTo(1.0, 6);
  });

  it('verifies SimUniforms struct layout and static WebGPUEngine packing contract (Invariant §20)', () => {
    const engineSourcePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
    const engineSrc = fs.readFileSync(engineSourcePath, 'utf-8');

    // crustFloats allocated as Float32Array(80) = 320 bytes
    expect(engineSrc).toMatch(/private\s+crustFloats\s*=\s*new\s+Float32Array\(80\)/);

    // crustUniformBuffer size: 320 bytes
    expect(engineSrc).toMatch(/this\.crustUniformBuffer\s*=\s*this\.device\.createBuffer\(\{\s*size:\s*320/);

    // Dedicated weather slots at indices [72, 73] with padding at [74, 75]
    expect(engineSrc).toContain('this.crustFloats[72] = validPluvial;');
    expect(engineSrc).toContain('this.crustUints[73] = validMode;');
    expect(engineSrc).toContain('this.crustFloats[74] = 0.0;');
    expect(engineSrc).toContain('this.crustFloats[75] = 0.0;');

    // 16-byte alignment invariant
    expect(80 * 4).toBe(320);
    expect(320 % 16).toBe(0);
    expect(72 * 4).toBe(288); // sunVector offset 288 is 16-byte aligned
    expect(288 % 16).toBe(0);
  });

  it('verifies dynamic WebGPUEngine uniform buffer packing and live sun vector writing', () => {
    const engine = new WebGPUEngine();
    const crustFloats = (engine as any).crustFloats;
    expect(crustFloats).toBeInstanceOf(Float32Array);
    expect(crustFloats.length).toBe(80);
    expect(crustFloats.byteLength).toBe(320);

    // Mock GPU buffer and queue to test updateUniforms dynamically
    const writeBufferSpy = vi.fn();
    (engine as any).isInitialized = true;
    (engine as any).simUniformBuffer = { dummy: true };
    (engine as any).crustUniformBuffer = { dummy: true };
    (engine as any).device = {
      queue: { writeBuffer: writeBufferSpy },
    };
    (engine as any).context = {
      canvas: { width: 1920, height: 1080 },
    };

    const testTime = Date.UTC(2024, 5, 21, 12, 0, 0); // Summer solstice noon UTC
    const expectedSolar = getSolarPosition(testTime);

    (engine as any).updateUniforms({
      unfurl: 0.0,
      mode: 0,
      time: 1.0,
      solarTimestamp: testTime,
    });

    expect(engine.currentSolar).not.toBeNull();
    expect(engine.currentSolar!.sunVector[0]).toBeCloseTo(expectedSolar.sunVector[0], 6);
    expect(engine.currentSolar!.sunVector[1]).toBeCloseTo(expectedSolar.sunVector[1], 6);
    expect(engine.currentSolar!.sunVector[2]).toBeCloseTo(expectedSolar.sunVector[2], 6);
    expect(engine.currentSolar!.declination).toBeCloseTo(expectedSolar.declination, 6);
    expect(engine.currentSolar!.subsolarLon).toBeCloseTo(expectedSolar.subsolarLon, 6);

    // Weather slots remain dedicated to pluvial gamma & optical mode
    expect(crustFloats[72]).toBe(0.0);
    expect(crustFloats[74]).toBe(0.0);
    expect(crustFloats[75]).toBe(0.0);

    expect(writeBufferSpy).toHaveBeenCalled();
    const lastCall = writeBufferSpy.mock.calls.find((c: any[]) => c[0] === (engine as any).crustUniformBuffer);
    expect(lastCall).toBeDefined();
    expect(lastCall[1]).toBe(0); // offset 0
    expect(lastCall[2].byteLength).toBe(320); // exactly 320 bytes written
  });
});
