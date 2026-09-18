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


describe('Indicatrix Engine Architectural Extensions', () => {
  const appPath = fs.existsSync(path.resolve(__dirname, '../../src/App.tsx')) ? path.resolve(__dirname, '../../src/App.tsx') : path.resolve(__dirname, '../../App.tsx');
  let appCode = fs.readFileSync(appPath, 'utf-8');
  const geoPath = path.resolve(__dirname, '../../src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoPath)) {
    appCode += '\n' + fs.readFileSync(geoPath, 'utf-8');
  }
  const kinematicPath = path.resolve(__dirname, '../../src/components/canvas/KinematicCameraController.tsx');
  if (fs.existsSync(kinematicPath)) {
    appCode += '\n' + fs.readFileSync(kinematicPath, 'utf-8');
  }



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

    it('evaluates point morph seamlessly across all 4 simulation modes without NaNs', () => {
      for (let m = 0; m <= 3; m++) {
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
      const circles = generateTissotCircles(30, 45, 4.8, 36);
      expect(circles.length).toBeGreaterThan(0);
      const equatorCircle = circles.find(c => c.center.lat === 0 && c.center.lon === 0);
      expect(equatorCircle).toBeDefined();
      expect(equatorCircle!.perimeter.length).toBe(37);
      expect(equatorCircle!.baseAreaRatio).toBeCloseTo(1.0, 2);
      expect(equatorCircle!.axisMajor.length).toBe(2);
      expect(equatorCircle!.axisMinor.length).toBe(2);
      for (const pt of equatorCircle!.perimeter) {
        expect(Number.isFinite(pt.lat)).toBe(true);
        expect(Number.isFinite(pt.lon)).toBe(true);
      }
    });
  });

  describe('4. Kinematic Controls, Playback & Zen Mode', () => {
    it('verifies auto-morph playback loop and controls in App.tsx', () => {
      expect(appCode).toContain('isPlaying');
      expect(appCode).toContain('playbackSpeed');
      expect(appCode).toContain('requestAnimationFrame');
    });

    it('verifies smooth kinematic camera damping in App.tsx', () => {
      expect(appCode).toContain('KinematicCameraController');
      if (fs.existsSync(geoPath)) {
        expect(appCode).toContain('camera.position.lerp');
        expect(appCode).toContain('controlsRef.current.target.lerp');
      }
    });

    it('verifies Zen mode toggle and keyboard shortcuts (Space, H, 1-4)', () => {
      expect(appCode).toContain('isZenMode');
      expect(appCode).toContain("e.code === 'Space'");
      expect(appCode).toContain("e.key === 'h' || e.key === 'H'");
      expect(appCode).toContain("e.key === '4'");
    });
  });
});
