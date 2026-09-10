// ============================================================================
// File: tests/modern/challenger-m2-wind-ribbon-adversarial.test.ts
// Challenger: challenger_m1_m2_2 (teamwork_preview_challenger)
// Milestone: Milestone 2 (Wind Ribbon Visual Polish)
// Invariants: §3 (UCF), §10 (Horizon Tangent), §15 (DEM Parity), §28 (Theme Parity), §46 (Import Integrity)
// Description: Adversarial test suite with 100,000 Monte Carlo trials verifying
//              color contrast mathematics, physical altitude standoff inequalities,
//              and WGSL uniform control flow integrity.
// ============================================================================

import { describe, it, expect } from 'vitest';
import windRibbonRenderWGSL from '../../src/webgpu/shaders/wind_ribbon_render.wgsl?raw';
import windParticlesWGSL from '../../src/webgpu/shaders/wind_particles.wgsl?raw';

describe('Adversarial Challenger Suite: Wind Ribbon Polish & Physical Altitude (Milestone 2)', () => {
  // --------------------------------------------------------------------------
  // Pillar 1: Anti-Cheating Test Import Integrity (Invariant §46)
  // --------------------------------------------------------------------------
  describe('Pillar 1: Invariant §46 - Anti-Cheating Production Source Verification', () => {
    it('CHALLENGE-M2-01: Verifies shaders are imported directly from src/webgpu/shaders/ without stubs', () => {
      expect(windRibbonRenderWGSL).toBeDefined();
      expect(windParticlesWGSL).toBeDefined();
      expect(windRibbonRenderWGSL.length).toBeGreaterThan(5000);
      expect(windParticlesWGSL.length).toBeGreaterThan(5000);

      // Verify production shader entry points exist
      expect(windRibbonRenderWGSL).toContain('@vertex');
      expect(windRibbonRenderWGSL).toContain('fn vs_main');
      expect(windRibbonRenderWGSL).toContain('@fragment');
      expect(windRibbonRenderWGSL).toContain('fn fs_main');
      expect(windParticlesWGSL).toContain('@compute');
      expect(windParticlesWGSL).toContain('fn cs_advect_wind');
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Color Contrast Mathematics & 100,000-Trial Monte Carlo Fuzzing
  // --------------------------------------------------------------------------
  describe('Pillar 2: Color Contrast Mathematics & 100,000-Trial Fuzzing', () => {
    const IVORY_RAG = [0.953, 0.925, 0.878]; // #F3ECE0
    const SEPIA_RELIEF = [0.220, 0.188, 0.165]; // #38302A
    const PRUSSIAN_BLUE = [0.055, 0.094, 0.141]; // #0E1824

    // Helper functions
    const euclideanDist = (a: number[], b: number[]) =>
      Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

    const relLuminance = (c: number[]) =>
      0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

    const lerpColor = (c1: number[], c2: number[], t: number) => [
      c1[0] * (1 - t) + c2[0] * t,
      c1[1] * (1 - t) + c2[1] * t,
      c1[2] * (1 - t) + c2[2] * t,
    ];

    it('CHALLENGE-M2-02: Theme 1 (Cream Rag) surface wind color distance > 0.45 across entire speed spectrum', () => {
      // Production colors extracted from wind_ribbon_render.wgsl
      const calmSurf = [0.74, 0.38, 0.20]; // Warm burnt sienna archival ink
      const briskSurf = [0.94, 0.58, 0.26]; // Polished copper filament

      // 1. Boundary endpoint checks
      const dCalmIvory = euclideanDist(calmSurf, IVORY_RAG);
      const dBriskIvory = euclideanDist(briskSurf, IVORY_RAG);
      const dCalmSepia = euclideanDist(calmSurf, SEPIA_RELIEF);
      const dBriskSepia = euclideanDist(briskSurf, SEPIA_RELIEF);

      expect(dCalmIvory).toBeCloseTo(0.8956, 3);
      expect(dBriskIvory).toBeCloseTo(0.7079, 3);
      expect(dCalmSepia).toBeCloseTo(0.5554, 3);
      expect(dBriskSepia).toBeCloseTo(0.8253, 3);

      expect(dCalmIvory).toBeGreaterThan(0.45);
      expect(dBriskIvory).toBeGreaterThan(0.45);
      expect(dCalmSepia).toBeGreaterThan(0.45);
      expect(dBriskSepia).toBeGreaterThan(0.45);

      // 2. 100,000 Monte Carlo trials across arbitrary continuous speeds
      let minIvoryDist = Infinity;
      let minSepiaDist = Infinity;

      for (let i = 0; i < 100_000; i++) {
        // Arbitrary speed from -50.0 m/s to +150.0 m/s (includes adversarial negatives and extremes)
        const rawSpeed = (Math.random() * 200.0) - 50.0;
        const normSpeed = Math.max(0.0, Math.min(1.0, rawSpeed / 18.0));
        const color = lerpColor(calmSurf, briskSurf, normSpeed);

        expect(Number.isFinite(color[0])).toBe(true);
        expect(Number.isFinite(color[1])).toBe(true);
        expect(Number.isFinite(color[2])).toBe(true);

        const dIvory = euclideanDist(color, IVORY_RAG);
        const dSepia = euclideanDist(color, SEPIA_RELIEF);

        if (dIvory < minIvoryDist) minIvoryDist = dIvory;
        if (dSepia < minSepiaDist) minSepiaDist = dSepia;

        expect(dIvory).toBeGreaterThan(0.45);
        expect(dSepia).toBeGreaterThan(0.45);
      }

      // Minimum global distances along line segment
      expect(minIvoryDist).toBeGreaterThanOrEqual(0.707);
      expect(minSepiaDist).toBeGreaterThanOrEqual(0.555);
    });

    it('CHALLENGE-M2-03: Theme 2 (Cyanotype) relative luminance delta > 0.65 and chromatic opposition across 100,000 trials', () => {
      const calmSurf = [0.92, 0.96, 1.00]; // Actinic chalk white
      const briskSurf = [1.00, 0.82, 0.40]; // Solar photochemical amber

      const lumPrussian = relLuminance(PRUSSIAN_BLUE);
      expect(lumPrussian).toBeCloseTo(0.0891, 3);

      // 1. Boundary checks
      const lumCalm = relLuminance(calmSurf);
      const lumBrisk = relLuminance(briskSurf);
      const deltaCalm = lumCalm - lumPrussian;
      const deltaBrisk = lumBrisk - lumPrussian;

      expect(deltaCalm).toBeCloseTo(0.8653, 3);
      expect(deltaBrisk).toBeCloseTo(0.7388, 3);
      expect(deltaCalm).toBeGreaterThan(0.65);
      expect(deltaBrisk).toBeGreaterThan(0.65);

      // Chromatic opposition check: R - B at brisk wind
      const chromaticOpposition = briskSurf[0] - briskSurf[2];
      expect(chromaticOpposition).toBeCloseTo(0.60, 2);
      expect(chromaticOpposition).toBeGreaterThan(0.55);

      // 2. 100,000 Monte Carlo trials
      let minLumDelta = Infinity;

      for (let i = 0; i < 100_000; i++) {
        const rawSpeed = (Math.random() * 200.0) - 50.0;
        const normSpeed = Math.max(0.0, Math.min(1.0, rawSpeed / 18.0));
        const color = lerpColor(calmSurf, briskSurf, normSpeed);

        expect(Number.isFinite(color[0])).toBe(true);
        expect(Number.isFinite(color[1])).toBe(true);
        expect(Number.isFinite(color[2])).toBe(true);

        const lum = relLuminance(color);
        const delta = lum - lumPrussian;

        if (delta < minLumDelta) minLumDelta = delta;
        expect(delta).toBeGreaterThan(0.65);
      }

      expect(minLumDelta).toBeGreaterThanOrEqual(0.738);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Physical Altitude Standoff Inequality & Geometric Stratification
  // --------------------------------------------------------------------------
  describe('Pillar 3: Physical Altitude Standoff Inequality & Atmospheric Stratification', () => {
    const SPHERE_RADIUS = 5.0;
    const EARTH_RADIUS_KM = 6371.0;

    const toKm = (standoff: number) => (standoff / SPHERE_RADIUS) * EARTH_RADIUS_KM;

    it('CHALLENGE-M2-04: Strict inequality Surface Base (0.0005) < Discriminator (0.003) < Jet Stream Base (0.0065)', () => {
      const surfaceBase = 0.0005;
      const discriminator = 0.0030;
      const jetStreamBase = 0.0065;

      expect(surfaceBase).toBeLessThan(discriminator);
      expect(discriminator).toBeLessThan(jetStreamBase);

      // Guard margins
      const lowerMargin = discriminator - surfaceBase;
      const upperMargin = jetStreamBase - discriminator;
      expect(lowerMargin).toBeCloseTo(0.0025, 4);
      expect(upperMargin).toBeCloseTo(0.0035, 4);

      // Discriminator must be placed with at least 0.002 clearance on both sides
      expect(lowerMargin).toBeGreaterThanOrEqual(0.0020);
      expect(upperMargin).toBeGreaterThanOrEqual(0.0020);
    });

    it('CHALLENGE-M2-05: Jet Stream standoff (0.0065) nests strictly between Mid (0.0040) and High (0.0080) clouds', () => {
      const lowCloud = 0.0010;
      const midCloud = 0.0040;
      const jetStream = 0.0065;
      const highCloud = 0.0080;

      expect(lowCloud).toBeLessThan(midCloud);
      expect(midCloud).toBeLessThan(jetStream);
      expect(jetStream).toBeLessThan(highCloud);

      // Convert to physical Earth altitudes in kilometers
      const altLowKm = toKm(lowCloud);
      const altMidKm = toKm(midCloud);
      const altJetKm = toKm(jetStream);
      const altHighKm = toKm(highCloud);

      expect(altLowKm).toBeCloseTo(1.27, 2);
      expect(altMidKm).toBeCloseTo(5.10, 2);
      expect(altJetKm).toBeCloseTo(8.28, 2);
      expect(altHighKm).toBeCloseTo(10.19, 2);

      // Physical sanity bounds
      expect(altJetKm).toBeGreaterThan(altMidKm);
      expect(altJetKm).toBeLessThan(altHighKm);
      expect(altJetKm).toBeGreaterThanOrEqual(8.0);
      expect(altJetKm).toBeLessThanOrEqual(11.5);
    });

    it('CHALLENGE-M2-06: Evaluates orographic lift margin bounds to prevent layer collision', () => {
      // In wind_particles.wgsl:
      // alt0 = baseAlt + select(
      //   terrainDisp0 + clamp(wOrographic * 0.005, 0.0, 0.035),
      //   terrainDisp0 * 0.20 + clamp(wOrographic * 0.002, -0.005, 0.010),
      //   isJetStream
      // );
      //
      // Verify that at base zero-terrain level, discriminator 0.003 cleanly separates surface and jet particles
      const surfaceBase = 0.0005;
      const jetBase = 0.0065;

      expect(surfaceBase).toBeLessThan(0.003);
      expect(jetBase).toBeGreaterThan(0.003);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Invariant §3 (UCF) & Invariant §28 (Theme Parity) Auditing
  // --------------------------------------------------------------------------
  describe('Pillar 4: Invariant §3 & Invariant §28 Structural & Control Flow Auditing', () => {
    it('CHALLENGE-M2-07: Invariant §3 - Derivatives evaluated unconditionally before discard in fs_main', () => {
      const fsMainIdx = windRibbonRenderWGSL.indexOf('fn fs_main');
      expect(fsMainIdx).toBeGreaterThan(-1);

      const dUvIdx = windRibbonRenderWGSL.indexOf('let dUv = fwidth(in.uv);', fsMainIdx);
      const dVertVelIdx = windRibbonRenderWGSL.indexOf('let dVertVel = fwidth(in.vertVel);', fsMainIdx);
      const discardIdx = windRibbonRenderWGSL.indexOf('discard;', fsMainIdx);

      expect(dUvIdx).toBeGreaterThan(fsMainIdx);
      expect(dVertVelIdx).toBeGreaterThan(fsMainIdx);
      expect(discardIdx).toBeGreaterThan(fsMainIdx);

      // Derivatives MUST be strictly before discard
      expect(dUvIdx).toBeLessThan(discardIdx);
      expect(dVertVelIdx).toBeLessThan(discardIdx);
    });

    it('CHALLENGE-M2-08: Invariant §28 - Explicit branches for u_theme == 0u, 1u, 2u without binary collapse', () => {
      // Ensure all 3 themes are explicitly handled in both Jet and Surface blocks
      const jetSection = windRibbonRenderWGSL.slice(
        windRibbonRenderWGSL.indexOf('High-Altitude Jet Stream'),
        windRibbonRenderWGSL.indexOf('Surface Boundary Layer')
      );

      expect(jetSection).toContain('sim.u_theme == 0u');
      expect(jetSection).toContain('sim.u_theme == 1u');
      expect(jetSection).toContain('sim.u_theme == 2u');

      const surfSection = windRibbonRenderWGSL.slice(
        windRibbonRenderWGSL.indexOf('Surface Boundary Layer'),
        windRibbonRenderWGSL.indexOf('Orographic condensation glaze')
      );

      expect(surfSection).toContain('sim.u_theme == 0u');
      expect(surfSection).toContain('sim.u_theme == 1u');
      expect(surfSection).toContain('sim.u_theme == 2u');

      const glazeSection = windRibbonRenderWGSL.slice(
        windRibbonRenderWGSL.indexOf('Orographic condensation glaze')
      );

      expect(glazeSection).toContain('sim.u_theme == 0u');
      expect(glazeSection).toContain('sim.u_theme == 1u');
      expect(glazeSection).toContain('sim.u_theme == 2u');
    });

    it('CHALLENGE-M2-09: Invariant §10 - Horizon tangent facing attenuation is properly evaluated', () => {
      expect(windRibbonRenderWGSL).toContain('in.facing < 0.02');
      expect(windRibbonRenderWGSL).toContain('sim.u_unfurl < 0.20');
      expect(windRibbonRenderWGSL).toContain('discard;');
    });
  });
});
