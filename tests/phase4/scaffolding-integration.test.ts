// ============================================================================
// File: tests/phase4/scaffolding-integration.test.ts
// Behavioral Test Suite: Scaffolding & Integration Track Final Verification
// Covers:
// 1. DataLayerOverlay dynamic routing across 4 sub-renderers
// 2. WhimsicalEffectsManager lifecycle & Fibonacci Moiré ring scaling
// 3. ManifoldPinchController damped spring-damper dynamics & surface perturbation
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { DataLayerOverlay, DataLayerOverlayProps } from '../../src/core/layers/DataLayerOverlay';
import { WhimsicalEffectsManager, WhimsicalEffectsState } from '../../src/core/WhimsicalEffectsManager';
import { ManifoldPinchController, ManifoldPinchState } from '../../src/core/ManifoldPinchController';

describe('Scaffolding & Integration Track: Production Systems Verification', () => {
  // ==========================================================================
  // Task 1: DataLayerOverlay Dynamic Routing
  // ==========================================================================
  describe('1. DataLayerOverlay Dynamic Sub-Renderer Routing', () => {
    const baseProps: DataLayerOverlayProps = {
      visible: true,
      unfurlProgress: 0.5,
      mode: 0,
      theme: 0,
      sourceUrl: '/test-data.bin',
      opacity: 0.9,
      displacementScale: 0.12,
    };

    it('returns null when visible is false regardless of category', () => {
      const hidden = DataLayerOverlay({ ...baseProps, visible: false, category: 'vectors' });
      expect(hidden).toBeNull();
    });

    it('routes "vectors" category to VectorBoundaryRenderer with props passed through', () => {
      const element = DataLayerOverlay({ ...baseProps, category: 'vectors' });
      expect(element).not.toBeNull();
      expect(React.isValidElement(element)).toBe(true);
      const props = (element as React.ReactElement<any>).props;
      expect(props.category).toBe('vectors');
      expect(props.unfurlProgress).toBe(0.5);
      expect(props.opacity).toBe(0.9);
    });

    it('routes "point" category to VectorContourRenderer with displacementScale', () => {
      const element = DataLayerOverlay({ ...baseProps, category: 'point', displacementScale: 0.18 });
      expect(element).not.toBeNull();
      expect(React.isValidElement(element)).toBe(true);
      const props = (element as React.ReactElement<any>).props;
      expect(props.category).toBe('point');
      expect(props.displacementScale).toBe(0.18);
    });

    it('routes "field" category to VectorFieldRenderer with velocity flow props', () => {
      const element = DataLayerOverlay({ ...baseProps, category: 'field' });
      expect(element).not.toBeNull();
      expect(React.isValidElement(element)).toBe(true);
      const props = (element as React.ReactElement<any>).props;
      expect(props.category).toBe('field');
    });

    it('routes raster categories ("topo", "ocean", "thermal", "night", "satellite") to RasterLayerRenderer', () => {
      const rasterCategories = ['topo', 'ocean', 'thermal', 'night', 'satellite'] as const;
      rasterCategories.forEach((cat) => {
        const element = DataLayerOverlay({ ...baseProps, category: cat });
        expect(element).not.toBeNull();
        expect(React.isValidElement(element)).toBe(true);
        expect((element as React.ReactElement<any>).props.category).toBe(cat);
      });
    });

    it('falls back safely to RasterLayerRenderer when category is undefined or unknown', () => {
      const elementDefault = DataLayerOverlay({ ...baseProps, category: undefined });
      expect(elementDefault).not.toBeNull();
      expect(React.isValidElement(elementDefault)).toBe(true);

      const elementUnknown = DataLayerOverlay({ ...baseProps, category: 'unknown-future-layer' });
      expect(elementUnknown).not.toBeNull();
      expect(React.isValidElement(elementUnknown)).toBe(true);
    });
  });

  // ==========================================================================
  // Task 2: WhimsicalEffectsManager Lifecycle & Moiré Scaling
  // ==========================================================================
  describe('2. WhimsicalEffectsManager Lifecycle & Polar Resonance', () => {
    let manager: WhimsicalEffectsManager;

    beforeEach(() => {
      manager = new WhimsicalEffectsManager();
    });

    it('detects North Pole view alignment (< 0.5°) and triggers pointScaleMultiplier = 1.2', () => {
      // Camera looking down +Y axis (North Pole)
      const stateNorth = manager.update([0, 15, 0], 0, 0.0, 1.0);
      expect(stateNorth.isPolarAligned).toBe(true);
      expect(stateNorth.polarAngleDegrees).toBeLessThan(0.5);
      expect(stateNorth.pointScaleMultiplier).toBe(1.2);
    });

    it('detects South Pole view alignment (< 0.5°) and triggers pointScaleMultiplier = 1.2', () => {
      // Camera looking up -Y axis (South Pole)
      const stateSouth = manager.update([0, -15, 0], 0, 0.0, 1.0);
      expect(stateSouth.isPolarAligned).toBe(true);
      expect(stateSouth.polarAngleDegrees).toBeLessThan(0.5);
      expect(stateSouth.pointScaleMultiplier).toBe(1.2);
    });

    it('detects equatorial viewing and sets pointScaleMultiplier = 1.0', () => {
      // Camera at equator along +Z axis
      const stateEquator = manager.update([0, 0, 15], 0, 0.0, 1.0);
      expect(stateEquator.isPolarAligned).toBe(false);
      expect(stateEquator.polarAngleDegrees).toBeCloseTo(90, 1);
      expect(stateEquator.pointScaleMultiplier).toBe(1.0);
    });

    it('activates harmonic standing waves in Mode 4 during alpha in [0.45, 0.55]', () => {
      const activeState = manager.update([10, 0, 10], 4, 0.50, 2.5);
      expect(activeState.isStandingWaveActive).toBe(true);
      expect(activeState.standingWaveAmplitude).not.toBe(0);

      const inactiveState = manager.update([10, 0, 10], 4, 0.30, 2.5);
      expect(inactiveState.isStandingWaveActive).toBe(false);
      expect(inactiveState.standingWaveAmplitude).toBe(0);
    });

    it('evaluates Dymaxion specular flash sweep when reaching planarity (alpha >= 0.998 in Mode 4)', () => {
      const flashState = manager.update([0, 0, 15], 4, 0.999, 1.0);
      expect(flashState.isSpecularFlashActive).toBe(true);
      expect(flashState.activeFacetIndex).toBeGreaterThanOrEqual(0);
      expect(flashState.activeFacetIndex).toBeLessThanOrEqual(19);
    });
  });

  // ==========================================================================
  // Task 3: ManifoldPinchController Spring-Damper Dynamics
  // ==========================================================================
  describe('3. ManifoldPinchController Damped Harmonic Oscillator & Normal Perturbation', () => {
    let controller: ManifoldPinchController;

    beforeEach(() => {
      controller = new ManifoldPinchController();
    });

    it('initializes in IDLE state with zero displacement and cursorActive = 0', () => {
      expect(controller.getFSMState()).toBe('IDLE');
      const state = controller.getState();
      expect(state.cursorActive).toBe(0.0);
      expect(state.pinchDepth).toBe(0.0);
      expect(state.strainEnergy).toBe(0.0);
    });

    it('engages pinch on pointer down with specified depth', () => {
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 5.0, 0.85);
      expect(controller.getFSMState()).toBe('PINCH_ENGAGED');
      
      const state = controller.getState();
      expect(state.cursorActive).toBe(1.0);
      expect(state.pinchDepth).toBe(0.85);
      // E = 0.5 * k * z^2 = 0.5 * 45 * 0.85^2
      expect(state.strainEnergy).toBeCloseTo(0.5 * 45.0 * 0.85 * 0.85, 2);
    });

    it('computes displaced hit position along normal vector during engagement', () => {
      // Hit on sphere at (0, 0, 5) -> normal is (0, 0, 1)
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 5.0, 1.0);

      const displaced = controller.getDisplacedHitPosition();
      expect(displaced[0]).toBeCloseTo(0, 4);
      expect(displaced[1]).toBeCloseTo(0, 4);
      // Inward depression along normal: 5.0 - 1.0 * 1.0 * 0.35 = 4.65
      expect(displaced[2]).toBeLessThan(5.0);
      expect(displaced[2]).toBeCloseTo(4.65, 2);
    });

    it('transitions to RELEASE_REBOUND on pointer up and executes damped harmonic oscillation', () => {
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 5.0, 1.0);
      controller.onPointerUp();

      expect(controller.getFSMState()).toBe('RELEASE_REBOUND');

      // Check damped oscillation formula z(t) = z0 * e^(-gamma*t) * cos(omega_d*t)
      // gamma = 6.5, omega_d = 28.0
      const z0 = controller.computeDampedOscillation(1.0, 0.0);
      expect(z0).toBeCloseTo(1.0, 4);

      const z50ms = controller.computeDampedOscillation(1.0, 0.05);
      // Decay factor e^(-6.5 * 0.05) = e^(-0.325) ≈ 0.7225
      // Cosine factor cos(28 * 0.05) = cos(1.4) ≈ 0.1699
      expect(z50ms).toBeCloseTo(Math.exp(-6.5 * 0.05) * Math.cos(28.0 * 0.05), 4);

      // Verify finite bounded motion with 0 NaNs
      for (let t = 0; t <= 1.0; t += 0.05) {
        const val = controller.computeDampedOscillation(1.0, t);
        expect(Number.isFinite(val)).toBe(true);
        expect(Math.abs(val)).toBeLessThanOrEqual(1.0);
      }
    });

    it('decays rebound oscillation and returns to HOVER_PROBE when pointer is inside', () => {
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 5.0, 0.5);
      controller.onPointerUp();

      // Step physics by 1 second (decay threshold reached)
      controller.update(1.0);
      expect(controller.getFSMState()).toBe('HOVER_PROBE');
    });

    it('returns to IDLE after rebound decay if pointer left during oscillation', () => {
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 5.0, 0.5);
      controller.onPointerUp();
      controller.onPointerLeave();

      // Step physics past decay threshold
      controller.update(1.0);
      expect(controller.getFSMState()).toBe('IDLE');
    });
  });
});
