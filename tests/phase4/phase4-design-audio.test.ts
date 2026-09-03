// ============================================================================
// File: tests/phase4/phase4-design-audio.test.ts
// Unit & Integration Test Suite for Phase 4 Crafted Visual Design & Audio Experience
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ThemeManager,
  DARK_CYBER_THEME,
  LIGHT_MONOCHROME_THEME,
} from '../../src/core/themes';

import {
  oklchToRgb,
  getStrainEnergyColor,
  getFluidVorticityColor,
  COLOR_TENSION_AMBER,
  COLOR_RUPTURE_CRIMSON,
  COLOR_CRACK_WHITE,
  COLOR_OCEANIC_INDIGO,
  COLOR_BIOLUM_CYAN,
  COLOR_EDDY_VIOLET,
  OKLCH_TO_RGB_GLSL,
  OKLCH_TO_RGB_WGSL,
} from '../../src/styles/color';

import {
  ProceduralAudioEngine,
  DYMAXION_CHIME_FREQUENCIES,
} from '../../src/core/audio';

import { WhimsicalEffectsManager } from '../../src/core/effects';
import { ManifoldPinchController } from '../../src/core/interactions';

describe('Phase 4: Crafted Visual Design & Procedural Audio Experience Test Suite', () => {
  // ==========================================================================
  // Section 1: Visual & Theme Systems (src/styles/, src/core/themes/)
  // ==========================================================================
  describe('1. ThemeManager & Color Palette Standards', () => {
    let themeMgr: ThemeManager;

    beforeEach(() => {
      themeMgr = ThemeManager.getInstance(0);
      themeMgr.setMode(0); // Reset to Dark Cyber
    });

    it('should initialize with Theme 0 (Dark Cyber) by default', () => {
      expect(themeMgr.getMode()).toBe(0);
      const palette = themeMgr.getPalette();
      expect(palette.mode).toBe(0);
      expect(palette.name).toContain('Dark Cyber');
      expect(palette.viewportBackground.hex).toBe('#090B10');
      expect(palette.geographicCoastlines.hex).toBe('#EAE6DE');
      expect(palette.structuralOceanNodes.hex).toBe('#1E2633');
    });

    it('should switch to Theme 1 (Light Monochrome) and update color parameters', () => {
      themeMgr.setMode(1);
      expect(themeMgr.getMode()).toBe(1);
      const palette = themeMgr.getPalette();
      expect(palette.name).toContain('Light Monochrome');
      expect(palette.viewportBackground.hex).toBe('#F8FAFC');
      expect(palette.geographicCoastlines.hex).toBe('#14171C');
      expect(palette.structuralOceanNodes.hex).toBe('#D1D5DB');
    });

    it('should toggle theme mode using toggleTheme()', () => {
      expect(themeMgr.getMode()).toBe(0);
      const toggled = themeMgr.toggleTheme();
      expect(toggled).toBe(1);
      expect(themeMgr.getMode()).toBe(1);
    });

    it('should notify subscriber listeners on theme state changes', () => {
      const listener = vi.fn();
      const unsubscribe = themeMgr.subscribe(listener);

      // Called immediately on subscribe
      expect(listener).toHaveBeenCalledWith(DARK_CYBER_THEME);

      themeMgr.setMode(1);
      expect(listener).toHaveBeenCalledWith(LIGHT_MONOCHROME_THEME);

      unsubscribe();
    });
  });

  describe('2. OKLCH-to-Linear sRGB & Paradigm Palette Utilities', () => {
    it('should compute analytical OKLCH-to-Linear sRGB conversion for known values', () => {
      // Pure White L=1.0, C=0.0, h=0
      const white = oklchToRgb(1.0, 0.0, 0.0);
      expect(white.r).toBeCloseTo(1.0, 2);
      expect(white.g).toBeCloseTo(1.0, 2);
      expect(white.b).toBeCloseTo(1.0, 2);

      // Dark Black L=0.0, C=0.0, h=0
      const black = oklchToRgb(0.0, 0.0, 0.0);
      expect(black.r).toBeCloseTo(0.0, 2);
      expect(black.g).toBeCloseTo(0.0, 2);
      expect(black.b).toBeCloseTo(0.0, 2);
    });

    it('should map Griffith LEFM strain energy density (Mode 2) to correct color stages', () => {
      const baseColor = { r: 0.1, g: 0.1, b: 0.1 };

      const cZero = getStrainEnergyColor(0.0, baseColor);
      expect(cZero).toEqual(baseColor);

      const cAmber = getStrainEnergyColor(0.45, baseColor);
      expect(cAmber.r).toBeCloseTo(COLOR_TENSION_AMBER.r, 2);

      const cCrimson = getStrainEnergyColor(0.78, baseColor);
      expect(cCrimson.r).toBeCloseTo(COLOR_RUPTURE_CRIMSON.r, 2);

      const cWhite = getStrainEnergyColor(1.0, baseColor);
      expect(cWhite.r).toBeCloseTo(COLOR_CRACK_WHITE.r, 2);
    });

    it('should map Fluid vorticity magnitude (Mode 3) to correct color stages', () => {
      const baseColor = { r: 0.1, g: 0.1, b: 0.1 };

      const cZero = getFluidVorticityColor(0.0, baseColor);
      expect(cZero).toEqual(baseColor);

      const cIndigo = getFluidVorticityColor(0.50, baseColor);
      expect(cIndigo.r).toBeCloseTo(COLOR_OCEANIC_INDIGO.r, 2);

      const cCyan = getFluidVorticityColor(0.85, baseColor);
      expect(cCyan.r).toBeCloseTo(COLOR_BIOLUM_CYAN.r, 2);

      const cViolet = getFluidVorticityColor(1.0, baseColor);
      expect(cViolet.r).toBeCloseTo(COLOR_EDDY_VIOLET.r, 2);
    });

    it('should expose non-empty GLSL and WGSL analytical shader chunk strings', () => {
      expect(OKLCH_TO_RGB_GLSL).toContain('vec3 oklch2rgb');
      expect(OKLCH_TO_RGB_WGSL).toContain('fn oklch2rgb');
    });
  });

  // ==========================================================================
  // Section 2: Procedural Web Audio API Engine (src/core/audio/)
  // ==========================================================================
  describe('3. ProceduralAudioEngine Synthesizers', () => {
    let audio: ProceduralAudioEngine;

    beforeEach(() => {
      audio = new ProceduralAudioEngine();
    });

    afterEach(() => {
      audio.dispose();
    });

    it('should instantiate safely and manage mute state', () => {
      expect(audio.getIsMuted()).toBe(false);
      audio.setMute(true);
      expect(audio.getIsMuted()).toBe(true);
    });

    it('should expose correct 5-tone icosahedral chime frequency series', () => {
      expect(DYMAXION_CHIME_FREQUENCIES).toEqual([261.63, 329.63, 392.00, 493.88, 523.25]);
    });

    it('should trigger Mode 2 rupture synthesizer without throw', () => {
      expect(() => audio.triggerRupture(1.0)).not.toThrow();
    });

    it('should update Mode 3 flow velocity synthesizer without throw', () => {
      expect(() => audio.updateFlowVelocity(0.75)).not.toThrow();
      expect(() => audio.stopFlowSynthesizer()).not.toThrow();
    });

    it('should trigger Mode 4 Dymaxion chimes for various facet indices', () => {
      expect(() => audio.triggerChime(0)).not.toThrow();
      expect(() => audio.triggerChime(3)).not.toThrow();
      expect(() => audio.triggerChime(19)).not.toThrow();
    });

    it('should trigger signature pinch rebound ping without throw', () => {
      expect(() => audio.triggerRebound(0.8)).not.toThrow();
    });
  });

  // ==========================================================================
  // Section 3: Organic Whimsical Moments (src/core/effects/)
  // ==========================================================================
  describe('4. WhimsicalEffectsManager', () => {
    let effects: WhimsicalEffectsManager;

    beforeEach(() => {
      effects = new WhimsicalEffectsManager();
    });

    it('should detect Fibonacci polar camera alignment when theta < 0.5 degrees', () => {
      // Camera looking straight down at North Pole (0, 5, 0)
      const northPoleState = effects.update([0, 5, 0], 4, 0.0, 0.0);
      expect(northPoleState.isPolarAligned).toBe(true);
      expect(northPoleState.polarAngleDegrees).toBeLessThan(0.5);
      expect(northPoleState.pointScaleMultiplier).toBe(1.2);

      // Camera at equator (5, 0, 0)
      const equatorState = effects.update([5, 0, 0], 4, 0.0, 0.0);
      expect(equatorState.isPolarAligned).toBe(false);
      expect(equatorState.polarAngleDegrees).toBeCloseTo(90, 1);
      expect(equatorState.pointScaleMultiplier).toBe(1.0);
    });

    it('should activate harmonic standing waves in Mode 4 during alpha in [0.45, 0.55]', () => {
      // Active in window
      const activeState = effects.update([5, 0, 0], 4, 0.50, 1.0);
      expect(activeState.isStandingWaveActive).toBe(true);
      expect(activeState.standingWaveAmplitude).not.toBe(0);

      // Inactive outside window
      const inactiveState = effects.update([5, 0, 0], 4, 0.20, 1.0);
      expect(inactiveState.isStandingWaveActive).toBe(false);
      expect(inactiveState.standingWaveAmplitude).toBe(0);
    });

    it('should compute standing wave eigenmode offset using y(x, t) formula', () => {
      const offset = effects.computeStandingWaveOffset(0.5, 1.05, 0.0, 0.15);
      expect(typeof offset).toBe('number');
      expect(Math.abs(offset)).toBeLessThanOrEqual(0.15);
    });

    it('should trigger Dymaxion 20-facet specular flash sweep when alpha >= 0.998 in Mode 4', () => {
      const flashState = effects.update([5, 0, 0], 4, 0.999, 0.0);
      expect(flashState.isSpecularFlashActive).toBe(true);
      expect(flashState.activeFacetIndex).toBeGreaterThanOrEqual(0);
      expect(flashState.activeFacetIndex).toBeLessThanOrEqual(19);
    });
  });

  // ==========================================================================
  // Section 4: Signature Pinch Interaction (src/core/interactions/)
  // ==========================================================================
  describe('5. ManifoldPinchController & Damped Spring Dynamics', () => {
    let controller: ManifoldPinchController;
    let mockAudio: ProceduralAudioEngine;

    beforeEach(() => {
      mockAudio = new ProceduralAudioEngine();
      controller = new ManifoldPinchController(mockAudio);
    });

    afterEach(() => {
      mockAudio.dispose();
    });

    it('should start in IDLE state', () => {
      expect(controller.getFSMState()).toBe('IDLE');
      const state = controller.getState();
      expect(state.cursorActive).toBe(0.0);
      expect(state.strainEnergy).toBe(0.0);
    });

    it('should transition to HOVER_PROBE on pointer enter and hover move', () => {
      controller.onPointerEnter();
      expect(controller.getFSMState()).toBe('HOVER_PROBE');

      controller.onHoverMove(1.0, 2.0, 3.0);
      const state = controller.getState();
      expect(state.hitPosition).toEqual([1.0, 2.0, 3.0]);
      expect(state.cursorActive).toBe(1.0);
    });

    it('should transition to PINCH_ENGAGED on pointer down and calculate strain energy', () => {
      controller.onPointerEnter();
      controller.onPointerDown(1.0, 1.0, 1.0, 0.8);
      expect(controller.getFSMState()).toBe('PINCH_ENGAGED');

      const state = controller.getState();
      expect(state.pinchDepth).toBe(0.8);
      // E = 0.5 * 45 * 0.8^2 = 14.4 J
      expect(state.strainEnergy).toBeCloseTo(14.4, 2);
    });

    it('should transition to RELEASE_REBOUND on pointer up and execute damped harmonic recoil', () => {
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 0, 1.0);
      controller.onPointerUp();

      expect(controller.getFSMState()).toBe('RELEASE_REBOUND');

      // Check damped oscillation calculation: z(t) = z_pinch * e^(-6.5 t) * cos(28 t)
      const zInitial = controller.computeDampedOscillation(1.0, 0.0);
      expect(zInitial).toBeCloseTo(1.0, 4);

      const zAfter100ms = controller.computeDampedOscillation(1.0, 0.1);
      // e^(-0.65) * cos(2.8)
      expect(Math.abs(zAfter100ms)).toBeLessThan(1.0);
    });

    it('should decay rebound oscillation and transition back to HOVER_PROBE / IDLE', () => {
      controller.onPointerEnter();
      controller.onPointerDown(0, 0, 0, 0.5);
      controller.onPointerUp();

      // Step physics tick forward by 1.0 seconds (rebound oscillation decays below 0.001 threshold)
      controller.update(1.0);

      expect(controller.getFSMState()).toBe('HOVER_PROBE');
    });

    it('should calculate Gaussian surface displacement delta_p(r)', () => {
      const dispCenter = controller.computeDisplacementAtDistance(0.0, 1.0);
      expect(dispCenter).toBeCloseTo(1.0, 4);

      const dispFar = controller.computeDisplacementAtDistance(2.0, 1.0);
      expect(dispFar).toBeLessThan(dispCenter);
    });
  });
});
