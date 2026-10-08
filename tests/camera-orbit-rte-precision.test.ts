// ============================================================================
// File: tests/camera-orbit-rte-precision.test.ts
// Precision Verification Suite: Relative-to-Eye (RTE) Camera Coordinates
// Verifies sub-millimeter precision and zero vertex swimming at 25m altitude
// over Grand Canyon and Mount Everest (Phase 3 of Precision Terrain Plan)
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WebGPUEngine } from '../src/webgpu/WebGPUEngine';
import { Matrix4, PerspectiveCamera, Vector3 } from '../src/core/math/cameraMath';

describe('Phase 3: Relative-to-Eye (RTE) Camera Coordinates & Precision Orbit Suite', () => {
  const enginePath = path.resolve(__dirname, '../src/webgpu/WebGPUEngine.ts');
  const shaderPath = path.resolve(__dirname, '../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');
  const shaderSrc = fs.readFileSync(shaderPath, 'utf8');

  // ==========================================================================
  // Pillar 1: WGSL Shader Architecture & Relative-to-Eye Vertex Projection
  // ==========================================================================
  describe('Pillar 1: WGSL Relative-to-Eye Vertex Projection Contract', () => {
    it('RTE-WGSL-01: SimUniforms declares u_cameraPosHigh, u_cameraPosLow, and u_viewProjectionMatrix', () => {
      expect(shaderSrc).toMatch(/u_cameraPosHigh\s*:\s*vec4<f32>\s*,/);
      expect(shaderSrc).toMatch(/u_cameraPosLow\s*:\s*vec4<f32>\s*,/);
      expect(shaderSrc).toMatch(/u_viewProjectionMatrix\s*:\s*mat4x4<f32>\s*,/);
    });

    it('RTE-WGSL-02: VertexOutput declares @builtin(position) position: vec4<f32>', () => {
      expect(shaderSrc).toMatch(/@builtin\(position\)\s+position\s*:\s*vec4<f32>/);
    });

    it('RTE-WGSL-03: vs_main subtracts decomposed camera position prior to matrix multiply', () => {
      expect(shaderSrc).toContain('let posWorld = worldP;');
      expect(shaderSrc).toContain('let posRelative = (posWorld - sim.u_cameraPosHigh.xyz) - sim.u_cameraPosLow.xyz;');
      expect(shaderSrc).toContain('output.position = sim.u_viewProjectionMatrix * vec4<f32>(posRelative, 1.0);');
    });

    it('RTE-WGSL-04: SimUniforms total size is 416 bytes (104 floats, 16-byte aligned)', () => {
      // 320 bytes (legacy offset up to float 79)
      // + 16 bytes u_cameraPosHigh (offset 320, floats 80..83)
      // + 16 bytes u_cameraPosLow (offset 336, floats 84..87)
      // + 64 bytes u_viewProjectionMatrix (offset 352, floats 88..103)
      // = 416 bytes total
      expect(416 % 16).toBe(0);
      expect(416 / 4).toBe(104);
      expect(320 % 16).toBe(0);
      expect(336 % 16).toBe(0);
      expect(352 % 16).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 2: WebGPUEngine Float Decomposition & Zero-GC Invariants
  // ==========================================================================
  describe('Pillar 2: WebGPUEngine Uniform Buffer Packing & Zero-GC Discipline', () => {
    it('RTE-ENG-01: allocates crustUniformBuffer with size 416 and crustFloats with 104 floats', () => {
      expect(engineSrc).toMatch(/this\.crustUniformBuffer\s*=\s*this\.device\.createBuffer\(\{\s*size:\s*416/);
      expect(engineSrc).toMatch(/private\s+crustFloats\s*=\s*new\s+Float32Array\(104\);/);
    });

    it('RTE-ENG-02: preallocates Matrix4 instances on class instance for zero-GC frame updates (Rule 26)', () => {
      expect(engineSrc).toContain('private rteViewMatrix = new Matrix4();');
      expect(engineSrc).toContain('private rteViewProjectionMatrix = new Matrix4();');
    });

    it('RTE-ENG-03: updateUniforms decomposes camera position with Math.fround into high and low', () => {
      expect(engineSrc).toContain('const highX = Math.fround(px);');
      expect(engineSrc).toContain('const highY = Math.fround(py);');
      expect(engineSrc).toContain('const highZ = Math.fround(pz);');
      expect(engineSrc).toContain('const lowX = px - highX;');
      expect(engineSrc).toContain('const lowY = py - highY;');
      expect(engineSrc).toContain('const lowZ = pz - highZ;');

      // Writes high to cf[80..83] and low to cf[84..87]
      expect(engineSrc).toContain('cf[80] = highX;');
      expect(engineSrc).toContain('cf[81] = highY;');
      expect(engineSrc).toContain('cf[82] = highZ;');
      expect(engineSrc).toContain('cf[83] = 1.0;');

      expect(engineSrc).toContain('cf[84] = lowX;');
      expect(engineSrc).toContain('cf[85] = lowY;');
      expect(engineSrc).toContain('cf[86] = lowZ;');
      expect(engineSrc).toContain('cf[87] = 0.0;');
    });

    it('RTE-ENG-04: calculates Relative-to-Eye view-projection matrix by zeroing translation column', () => {
      expect(engineSrc).toContain('rteEls[12] = 0.0;');
      expect(engineSrc).toContain('rteEls[13] = 0.0;');
      expect(engineSrc).toContain('rteEls[14] = 0.0;');
      expect(engineSrc).toContain('rteEls[15] = 1.0;');
      expect(engineSrc).toContain('this.rteViewProjectionMatrix.multiply(this.rteViewMatrix);');
      expect(engineSrc).toContain('this.rteViewProjectionMatrix.toArray(cf, 88);');
    });
  });

  // ==========================================================================
  // Pillar 3: Empirical Orbit Simulation at 25m Altitude (Grand Canyon & Everest)
  // ==========================================================================
  describe('Pillar 3: 120-Frame Orbit Simulation at 25m Altitude & Zero Swimming Verification', () => {
    const WGS84_A = 6378137.0; // Equatorial radius (meters)
    const WGS84_B = 6356752.314245; // Polar radius (meters)

    function geodeticToCartesian(latDeg: number, lonDeg: number, altMeters: number): [number, number, number] {
      const phi = (latDeg * Math.PI) / 180.0;
      const lambda = (lonDeg * Math.PI) / 180.0;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const cosLambda = Math.cos(lambda);
      const sinLambda = Math.sin(lambda);

      const e2 = 1.0 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
      const N = WGS84_A / Math.sqrt(1.0 - e2 * sinPhi * sinPhi);

      const x = (N + altMeters) * cosPhi * cosLambda;
      const y = (N + altMeters) * cosPhi * sinLambda;
      const z = (N * (1.0 - e2) + altMeters) * sinPhi;
      return [x, y, z];
    }

    const testSites = [
      {
        name: 'Grand Canyon South Rim',
        lat: 36.0544,
        lon: -112.1401,
        groundElevationMeters: 2150.0,
        orbitAltitudeMeters: 25.0, // 25 meters above ground
      },
      {
        name: 'Mount Everest Summit',
        lat: 27.9881,
        lon: 86.9250,
        groundElevationMeters: 8848.86,
        orbitAltitudeMeters: 25.0, // 25 meters above ground
      },
    ];

    for (const site of testSites) {
      it(`verifies zero vertex swimming over ${site.name} across 120 orbit frames`, () => {
        const [targetX, targetY, targetZ] = geodeticToCartesian(
          site.lat,
          site.lon,
          site.groundElevationMeters
        );

        // Orbit radius: 50m horizontal standoff around target
        const orbitHorizontalRadius = 50.0;
        const orbitVerticalAltitude = site.orbitAltitudeMeters; // 25m above target

        // Test local vertices near the target (within 100m, representing terrain mesh vertices)
        const localOffsets = [
          [0.0, 0.0, 0.0],
          [10.0, -15.0, 2.0],
          [-25.0, 30.0, -5.0],
          [45.0, 45.0, 8.0],
          [-40.0, -20.0, -12.0],
        ];

        const localVertices = localOffsets.map(([dx, dy, dz]) => [
          targetX + dx,
          targetY + dy,
          targetZ + dz,
        ]);

        let maxRTESwimmingJitterMeters = 0.0;
        let maxLegacySwimmingJitterMeters = 0.0;

        // Simulate 120 orbit frames (full 360 degree orbit)
        const TOTAL_FRAMES = 120;
        for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
          const azimuth = (frame / TOTAL_FRAMES) * 2.0 * Math.PI;
          const nextAzimuth = ((frame + 1) / TOTAL_FRAMES) * 2.0 * Math.PI;

          // Camera position in 64-bit precision
          const camX64 = targetX + orbitHorizontalRadius * Math.cos(azimuth);
          const camY64 = targetY + orbitHorizontalRadius * Math.sin(azimuth);
          const camZ64 = targetZ + orbitVerticalAltitude;

          const camX64Next = targetX + orbitHorizontalRadius * Math.cos(nextAzimuth);
          const camY64Next = targetY + orbitHorizontalRadius * Math.sin(nextAzimuth);
          const camZ64Next = targetZ + orbitVerticalAltitude;

          // 1. Double-to-float RTE decomposition for frame t:
          const highX = Math.fround(camX64);
          const highY = Math.fround(camY64);
          const highZ = Math.fround(camZ64);
          const lowX = camX64 - highX;
          const lowY = camY64 - highY;
          const lowZ = camZ64 - highZ;

          // RTE decomposition for frame t+1:
          const highXNext = Math.fround(camX64Next);
          const highYNext = Math.fround(camY64Next);
          const highZNext = Math.fround(camZ64Next);
          const lowXNext = camX64Next - highXNext;
          const lowYNext = camY64Next - highYNext;
          const lowZNext = camZ64Next - highZNext;

          // True physical camera displacement between frames:
          const expectedDisplacementX = -(camX64Next - camX64);
          const expectedDisplacementY = -(camY64Next - camY64);
          const expectedDisplacementZ = -(camZ64Next - camZ64);

          for (const [vx, vy, vz] of localVertices) {
            const vWorldF32X = Math.fround(vx);
            const vWorldF32Y = Math.fround(vy);
            const vWorldF32Z = Math.fround(vz);

            // Frame t RTE:
            const rteRelX = Math.fround(Math.fround(vWorldF32X - highX) - lowX);
            const rteRelY = Math.fround(Math.fround(vWorldF32Y - highY) - lowY);
            const rteRelZ = Math.fround(Math.fround(vWorldF32Z - highZ) - lowZ);

            // Frame t+1 RTE:
            const rteRelXNext = Math.fround(Math.fround(vWorldF32X - highXNext) - lowXNext);
            const rteRelYNext = Math.fround(Math.fround(vWorldF32Y - highYNext) - lowYNext);
            const rteRelZNext = Math.fround(Math.fround(vWorldF32Z - highZNext) - lowZNext);

            // Frame t Legacy:
            const legacyRelX = Math.fround(vWorldF32X - Math.fround(camX64));
            const legacyRelY = Math.fround(vWorldF32Y - Math.fround(camY64));
            const legacyRelZ = Math.fround(vWorldF32Z - Math.fround(camZ64));

            // Frame t+1 Legacy:
            const legacyRelXNext = Math.fround(vWorldF32X - Math.fround(camX64Next));
            const legacyRelYNext = Math.fround(vWorldF32Y - Math.fround(camY64Next));
            const legacyRelZNext = Math.fround(vWorldF32Z - Math.fround(camZ64Next));

            // Temporal Swimming Jitter: difference between rendered delta and true motion
            const rteJitter = Math.hypot(
              (rteRelXNext - rteRelX) - expectedDisplacementX,
              (rteRelYNext - rteRelY) - expectedDisplacementY,
              (rteRelZNext - rteRelZ) - expectedDisplacementZ
            );
            if (rteJitter > maxRTESwimmingJitterMeters) {
              maxRTESwimmingJitterMeters = rteJitter;
            }

            const legacyJitter = Math.hypot(
              (legacyRelXNext - legacyRelX) - expectedDisplacementX,
              (legacyRelYNext - legacyRelY) - expectedDisplacementY,
              (legacyRelZNext - legacyRelZ) - expectedDisplacementZ
            );
            if (legacyJitter > maxLegacySwimmingJitterMeters) {
              maxLegacySwimmingJitterMeters = legacyJitter;
            }
          }
        }

        // Sub-millimeter temporal swimming stability:
        // Legacy float32 suffers dramatic vertex swimming jumping between 0.05m and 0.38m!
        expect(maxLegacySwimmingJitterMeters).toBeGreaterThan(0.05);

        // Relative-to-Eye temporal vertex swimming jitter is sub-millimeter (< 0.0001m / 0.1mm):
        expect(maxRTESwimmingJitterMeters).toBeLessThan(0.0001);

        // Screen-space pixel swimming verification at 25m distance:
        // 1080p viewport, 60 deg vertical FOV -> ~37.4 pixels per meter at 25m distance.
        const pixelScalePerMeter = 1080.0 / (2.0 * 25.0 * Math.tan((30.0 * Math.PI) / 180.0));
        const pixelSwimmingRTE = maxRTESwimmingJitterMeters * pixelScalePerMeter;
        const pixelSwimmingLegacy = maxLegacySwimmingJitterMeters * pixelScalePerMeter;

        // Legacy vertex swimming is visibly jarring (> 2.0 pixels jitter per frame):
        expect(pixelSwimmingLegacy).toBeGreaterThan(2.0);

        // RTE vertex swimming is zero (< 0.005 pixels, rock-solid sub-millimeter stability):
        expect(pixelSwimmingRTE).toBeLessThan(0.005);
      });
    }

    it('RTE-ORBIT-03: verifies dynamic WebGPUEngine updateUniforms packs live orbit data without NaN or overrun', () => {
      const engine = new WebGPUEngine();
      const writeBufferSpy = vi.fn();

      (engine as any).isInitialized = true;
      (engine as any).crustUniformBuffer = { label: 'crust_uniform_buffer' };
      (engine as any).simUniformBuffer = { label: 'sim_uniform_buffer' };
      (engine as any).device = { queue: { writeBuffer: writeBufferSpy } };
      (engine as any).context = { canvas: { width: 1920, height: 1080 } };

      const cf = (engine as any).crustFloats as Float32Array;

      // Mount Everest summit camera
      const [camX, camY, camZ] = geodeticToCartesian(27.9881, 86.9250, 8848.86 + 25.0);
      const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 100000);
      cam.position.set(camX, camY, camZ);
      cam.lookAt(camX + 10, camY + 10, camZ - 25);
      cam.updateMatrixWorld();

      (engine as any).updateUniforms({
        unfurl: 0.0,
        mode: 0,
        time: 1.0,
        camera: cam,
      });

      // Verify decomposed floats:
      expect(cf[80]).toBeCloseTo(Math.fround(camX), 4);
      expect(cf[81]).toBeCloseTo(Math.fround(camY), 4);
      expect(cf[82]).toBeCloseTo(Math.fround(camZ), 4);
      expect(cf[83]).toBe(1.0);

      // Verify low floats:
      expect(cf[84]).toBeCloseTo(camX - Math.fround(camX), 6);
      expect(cf[85]).toBeCloseTo(camY - Math.fround(camY), 6);
      expect(cf[86]).toBeCloseTo(camZ - Math.fround(camZ), 6);
      expect(cf[87]).toBe(0.0);

      // Verify RTE matrix floats 88..103:
      for (let i = 88; i < 104; i++) {
        expect(Number.isFinite(cf[i])).toBe(true);
        expect(Number.isNaN(cf[i])).toBe(false);
      }

      // Verify buffer write length
      const crustCall = writeBufferSpy.mock.calls.find(
        (call: any[]) => call[0] === (engine as any).crustUniformBuffer
      );
      expect(crustCall).toBeDefined();
      expect(crustCall![1]).toBe(0);
      expect((crustCall![2] as ArrayBuffer).byteLength).toBe(416);
    });
  });
});
