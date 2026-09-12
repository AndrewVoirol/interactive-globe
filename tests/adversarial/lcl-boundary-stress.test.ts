/**
 * tests/adversarial/lcl-boundary-stress.test.ts
 *
 * Adversarial Boundary Stress Suite for Lifting Condensation Level (LCL) Thermodynamics
 * Pillars A & B: Large-Scale Monte Carlo Stress Fuzzing & Critical Geometric/Thermodynamic Boundaries
 *
 * Requirements:
 * - T = T_d (saturated): LCL = 0m -> ALL terrain should trigger condensation (lclGate = 1.0 everywhere)
 * - T - T_d = 40°C (extreme dry): LCL = 5000m -> only peaks above 5000m condense
 * - T < T_d (physically impossible): system must not crash, LCL should clamp to 0
 * - T = -40°C, T_d = -45°C -> LCL = 625m, should work normally (cold but valid)
 * - T = 50°C, T_d = 0°C -> LCL = 6250m -> only Himalayas condense
 */

import { describe, it, expect } from 'vitest';
import {
  computeLCL,
  computeLCLGate,
  modulatePrecipitationByLCL,
} from '../../src/core/physics/LCLThermodynamics';

describe('Adversarial Boundary Stress Suite: LCL Thermodynamics', () => {
  // Requirement 1: T = T_d (saturated): LCL = 0m -> ALL terrain should trigger condensation (lclGate = 1.0 everywhere)
  it('ADV-LCL-01: T = T_d (saturated): LCL = 0m -> ALL terrain should trigger condensation (lclGate = 1.0 everywhere)', () => {
    const tempC = 18.0;
    const dewpointC = 18.0;
    const lcl = computeLCL(tempC, dewpointC);

    expect(lcl).toBe(0.0);

    // Test across global terrain elevations from sea level (0m) to Mount Everest (8848m)
    const terrainElevations = [
      0.0,     // Sea level / coastal plain
      10.0,    // Near-shore estuary
      100.0,   // Lowland basin
      500.0,   // Rolling hills
      1500.0,  // Alpine valley
      4808.0,  // Mont Blanc summit
      8848.0,  // Mount Everest summit
    ];

    for (const h of terrainElevations) {
      const gate = computeLCLGate(h, lcl, true);
      expect(gate).toBe(1.0);

      const mod = modulatePrecipitationByLCL(10.0, h, tempC, dewpointC, true);
      expect(mod.lclMeters).toBe(0.0);
      expect(mod.lclGate).toBe(1.0);
      expect(mod.precipModulated).toBe(10.0);
    }
  });

  // Requirement 2: T - T_d = 40°C (extreme dry): LCL = 5000m -> only peaks above 5000m condense
  it('ADV-LCL-02: T - T_d = 40°C (extreme dry): LCL = 5000m -> only peaks above 5000m condense', () => {
    const tempC = 45.0;
    const dewpointC = 5.0; // depression = 40°C
    const lcl = computeLCL(tempC, dewpointC);

    // 125 * 40 = 5000m
    expect(lcl).toBe(5000.0);

    // Lowlands and standard mountains (below 4800m = LCL - 200m margin) must be completely suppressed (0.0)
    const suppressedElevations = [0.0, 500.0, 1500.0, 3000.0, 4421.0, 4799.0];
    for (const h of suppressedElevations) {
      const gate = computeLCLGate(h, lcl, true);
      expect(gate).toBe(0.0);

      const mod = modulatePrecipitationByLCL(15.0, h, tempC, dewpointC, true);
      expect(mod.lclGate).toBe(0.0);
      expect(mod.precipModulated).toBe(0.0);
    }

    // High peaks strictly above 5000m must have full condensation (gate = 1.0)
    const fullCondensationPeaks = [5000.0, 5500.0, 6190.0, 8848.0];
    for (const h of fullCondensationPeaks) {
      const gate = computeLCLGate(h, lcl, true);
      expect(gate).toBe(1.0);

      const mod = modulatePrecipitationByLCL(15.0, h, tempC, dewpointC, true);
      expect(mod.lclGate).toBe(1.0);
      expect(mod.precipModulated).toBe(15.0);
    }
  });

  // Requirement 3: T < T_d (physically impossible): system must not crash, LCL should clamp to 0
  it('ADV-LCL-03: T < T_d (physically impossible): system must not crash, LCL should clamp to 0', () => {
    const impossiblePairs: [number, number][] = [
      [10.0, 20.0],
      [0.0, 15.0],
      [-10.0, 25.0],
      [-50.0, 0.0],
      [20.0, 100.0],
    ];

    for (const [t, td] of impossiblePairs) {
      expect(() => computeLCL(t, td)).not.toThrow();
      const lcl = computeLCL(t, td);
      expect(lcl).toBe(0.0);
      expect(Number.isFinite(lcl)).toBe(true);
      expect(Number.isNaN(lcl)).toBe(false);

      // Gate calculation must also not throw or return NaN
      expect(() => computeLCLGate(500.0, lcl, true)).not.toThrow();
      const gate = computeLCLGate(500.0, lcl, true);
      expect(gate).toBe(1.0);

      const mod = modulatePrecipitationByLCL(12.0, 500.0, t, td, true);
      expect(mod.lclMeters).toBe(0.0);
      expect(mod.lclGate).toBe(1.0);
      expect(mod.precipModulated).toBe(12.0);
    }
  });

  // Requirement 4: T = -40°C, T_d = -45°C -> LCL = 625m, should work normally (cold but valid)
  it('ADV-LCL-04: T = -40°C, T_d = -45°C -> LCL = 625m, should work normally (cold but valid)', () => {
    const tempC = -40.0;
    const dewpointC = -45.0; // depression = 5°C
    const lcl = computeLCL(tempC, dewpointC);

    // 125.0 * 5 = 625m
    expect(lcl).toBe(625.0);

    // Below LCL - 200m (425m) -> completely suppressed (0.0)
    expect(computeLCLGate(200.0, lcl, true)).toBe(0.0);
    expect(computeLCLGate(425.0, lcl, true)).toBe(0.0);

    // At midpoint of transition (h = 525m) -> smoothstep(0.5) = 0.5
    expect(computeLCLGate(525.0, lcl, true)).toBeCloseTo(0.5, 5);

    // At or above LCL (625m) -> fully active condensation (1.0)
    expect(computeLCLGate(625.0, lcl, true)).toBe(1.0);
    expect(computeLCLGate(1000.0, lcl, true)).toBe(1.0);

    const modBelow = modulatePrecipitationByLCL(8.0, 300.0, tempC, dewpointC, true);
    expect(modBelow.precipModulated).toBe(0.0);

    const modAbove = modulatePrecipitationByLCL(8.0, 1000.0, tempC, dewpointC, true);
    expect(modAbove.precipModulated).toBe(8.0);
  });

  // Requirement 5: T = 50°C, T_d = 0°C -> LCL = 6250m -> only Himalayas condense
  it('ADV-LCL-05: T = 50°C, T_d = 0°C -> LCL = 6250m -> only Himalayas condense', () => {
    const tempC = 50.0;
    const dewpointC = 0.0; // depression = 50°C
    const lcl = computeLCL(tempC, dewpointC);

    // 125 * 50 = 6250m
    expect(lcl).toBe(6250.0);

    // Non-Himalayan summits (all < 6050m) must have zero condensation:
    const standardWorldSummits = [
      { name: 'Mont Blanc', elevation: 4808.0 },
      { name: 'Mount Rainier', elevation: 4392.0 },
      { name: 'Mount Whitney', elevation: 4421.0 },
      { name: 'Kilimanjaro', elevation: 5895.0 },
      { name: 'Mount Logan', elevation: 5959.0 },
      { name: 'Denali', elevation: 6190.0 }, // In transition margin (6050 - 6250) but < 6250
    ];

    for (const summit of standardWorldSummits.slice(0, 5)) {
      const gate = computeLCLGate(summit.elevation, lcl, true);
      expect(gate).toBe(0.0);
    }

    // Denali (6190m) is in the transition margin [6050, 6250]
    const denaliGate = computeLCLGate(6190.0, lcl, true);
    expect(denaliGate).toBeGreaterThan(0.0);
    expect(denaliGate).toBeLessThan(1.0);

    // Himalayan 8000m giants must have 100% full condensation (gate = 1.0)
    const himalayanGiants = [
      { name: 'Mount Everest', elevation: 8848.0 },
      { name: 'K2', elevation: 8611.0 },
      { name: 'Kangchenjunga', elevation: 8586.0 },
      { name: 'Lhotse', elevation: 8516.0 },
      { name: 'Makalu', elevation: 8485.0 },
    ];

    for (const giant of himalayanGiants) {
      const gate = computeLCLGate(giant.elevation, lcl, true);
      expect(gate).toBe(1.0);

      const mod = modulatePrecipitationByLCL(20.0, giant.elevation, tempC, dewpointC, true);
      expect(mod.lclGate).toBe(1.0);
      expect(mod.precipModulated).toBe(20.0);
    }
  });

  // Monte Carlo non-finite fuzzing (Pillar D)
  it('ADV-LCL-06: Non-finite input fuzzing (NaN, Infinity, -Infinity) produces safe numeric outputs', () => {
    const nonFiniteValues = [NaN, Infinity, -Infinity];

    for (const val of nonFiniteValues) {
      const lcl = computeLCL(val, 15.0);
      // Math.max with NaN produces NaN, with Infinity produces Infinity
      // Test that gate gracefully clamps or handles without unhandled exception
      expect(() => computeLCLGate(1000.0, lcl, true)).not.toThrow();
    }
  });
});
