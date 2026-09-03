import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { 
  sampleGreatCircleGeodesic, 
  evaluatePointMorph, 
  GEODESIC_ARCS,
  LANDMARK_ANCHORS,
  generateTissotCircles
} from '../../src/core/GlobeOverlay';
import { generateDymaxionBuffer } from '../../src/utils/dymaxion';

describe('Indicatrix Engine Architectural Extensions', () => {
  const appPath = path.resolve(__dirname, '../../App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  describe('1. Buckminster Fuller Dymaxion (Mode 4) Paradigm Integration', () => {
    it('verifies App.tsx has 5-column simulation paradigm selector', () => {
      expect(appCode).toContain('grid-cols-5');
      expect(appCode).toContain('Dymaxion');
      expect(appCode).toContain('Fuller Dymaxion');
    });

    it('verifies App.tsx provides dymaxion2D BufferAttribute on both mesh and points', () => {
      expect(appCode).toContain("meshGeo.setAttribute('dymaxion2D'");
      expect(appCode).toContain("pointGeo.setAttribute('dymaxion2D'");
      expect(appCode).toContain('attribute vec2 dymaxion2D;');
    });

    it('verifies Dymaxion buffer generation operates deterministically with zero NaNs', () => {
      const sampleBuffer = new Float32Array([
        0.0, 5.0, 0.0,  // North pole
        0.0, -5.0, 0.0, // South pole
        5.0, 0.0, 0.0,  // Equator 0 lon
        0.0, 0.0, 5.0   // Equator 90 lon
      ]);
      const dymaxion = generateDymaxionBuffer(sampleBuffer);
      expect(dymaxion.length).toBe(8); // 4 points * 2 coords
      for (let i = 0; i < dymaxion.length; i++) {
        expect(Number.isFinite(dymaxion[i])).toBe(true);
        expect(Number.isNaN(dymaxion[i])).toBe(false);
      }
    });
  });

  describe('2. Geodesic Sampling & Morphing Dynamics', () => {
    it('samples great circle arcs with strict spherical normalization', () => {
      const madrid = { lon: -3.7038, lat: 40.4168 };
      const nz = { lon: 176.2962, lat: -40.4168 };
      const samples = sampleGreatCircleGeodesic(madrid, nz, 20);

      expect(samples.length).toBe(21); // 20 segments -> 21 points
      for (const pt of samples) {
        expect(Number.isFinite(pt.lon)).toBe(true);
        expect(Number.isFinite(pt.lat)).toBe(true);
        expect(pt.lat).toBeGreaterThanOrEqual(-90);
        expect(pt.lat).toBeLessThanOrEqual(90);
      }
    });

    it('evaluates point morph seamlessly across all 5 simulation modes without NaNs', () => {
      for (let m = 0; m <= 4; m++) {
        for (let a = 0; a <= 10; a++) {
          const alpha = a / 10;
          const [x, y, z] = evaluatePointMorph(-3.7038, 40.4168, alpha, m);
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
          expect(Number.isFinite(z)).toBe(true);
          expect(Number.isNaN(x)).toBe(false);
        }
      }
    });

    it('verifies curated scientific datasets (Antipodes, Conveyor, Pelagic, Landmarks)', () => {
      const antipodes = GEODESIC_ARCS.filter(a => a.category === 'antipodes');
      const conveyor = GEODESIC_ARCS.filter(a => a.category === 'conveyor');
      const migration = GEODESIC_ARCS.filter(a => a.category === 'migration');

      expect(antipodes.length).toBeGreaterThanOrEqual(3);
      expect(conveyor.length).toBeGreaterThanOrEqual(1);
      expect(migration.length).toBeGreaterThanOrEqual(2);
      expect(LANDMARK_ANCHORS.length).toBeGreaterThanOrEqual(5);
      
      const nemo = LANDMARK_ANCHORS.find(l => l.label?.includes('Nemo'));
      expect(nemo).toBeDefined();
      expect(nemo?.lon).toBeCloseTo(-123.3933, 1);
    });
  });

  describe('3. Tissot Indicatrix Cartographic Deformation Circles', () => {
    it('generates small distortion circles with valid angular resolution', () => {
      const circles = generateTissotCircles(30, 45, 4.5, 16);
      expect(circles.length).toBeGreaterThan(0);
      for (const c of circles) {
        expect(c.perimeter.length).toBe(17); // 16 segments + 1 closing point
        for (const pt of c.perimeter) {
          expect(Number.isFinite(pt.lat)).toBe(true);
          expect(Number.isFinite(pt.lon)).toBe(true);
          expect(pt.lat).toBeGreaterThanOrEqual(-90);
          expect(pt.lat).toBeLessThanOrEqual(90);
        }
      }
    });
  });

  describe('4. Kinematic Controls, Playback & Zen Mode', () => {
    it('verifies auto-morph playback loop and direction toggle in App.tsx', () => {
      expect(appCode).toContain('isPlaying');
      expect(appCode).toContain('playbackSpeed');
      expect(appCode).toContain('setPlayDirection');
      expect(appCode).toContain('requestAnimationFrame');
    });

    it('verifies smooth kinematic camera damping in App.tsx', () => {
      expect(appCode).toContain('KinematicCameraController');
      expect(appCode).toContain('camera.position.lerp');
      expect(appCode).toContain('controlsRef.current.target.lerp');
    });

    it('verifies Zen mode toggle and keyboard shortcuts (Space, H, 1-5)', () => {
      expect(appCode).toContain('isZenMode');
      expect(appCode).toContain("e.code === 'Space'");
      expect(appCode).toContain("e.key === 'h' || e.key === 'H'");
      expect(appCode).toContain("e.key === '5'");
    });
  });
});
