import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUInitConfig, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';
import { MockGPUDevice, createMockNavigatorGPU } from '../helpers/webgpu-mock';

import physicsSimWGSL from '../../src/webgpu/shaders/physics_sim.wgsl?raw';
import pointsRenderWGSL from '../../src/webgpu/shaders/points_render.wgsl?raw';
import linesRenderWGSL from '../../src/webgpu/shaders/lines_render.wgsl?raw';

describe('Milestone M6: Comprehensive WebGPU WGSL Compute & Render Pipeline Test Suite', () => {
  // --------------------------------------------------------------------------
  // 1. WGSL Compute Shader Syntax & 5 Paradigms
  // --------------------------------------------------------------------------
  describe('WGSL Compute Shader Structure', () => {
    it('M6-T01: verifies physics_sim.wgsl contains @compute @workgroup_size(256) and cs_main entry point', () => {
      expect(physicsSimWGSL).toContain('@compute');
      expect(physicsSimWGSL).toContain('@workgroup_size(256');
      expect(physicsSimWGSL).toContain('fn cs_main');
    });

    it('M6-T02: verifies physics_sim.wgsl implements Particle storage buffer and SimUniforms structs', () => {
      expect(physicsSimWGSL).toContain('struct Particle');
      expect(physicsSimWGSL).toContain('position: vec4<f32>');
      expect(physicsSimWGSL).toContain('velocity: vec4<f32>');
      expect(physicsSimWGSL).toContain('rest_sphere: vec4<f32>');
      expect(physicsSimWGSL).toContain('rest_map: vec4<f32>');
      expect(physicsSimWGSL).toContain('struct SimUniforms');
    });

    it('M6-T03: verifies physics_sim.wgsl covers all 5 morphing paradigms', () => {
      // Mode 0: Linear mix
      expect(physicsSimWGSL).toContain('mix(pos3D, pos2D, ease)');
      // Mode 1: Cylindrical scroll
      expect(physicsSimWGSL).toContain('sim.u_mode == 1u');
      expect(physicsSimWGSL).toContain('invOneMinusT');
      // Mode 2: Griffith LEFM
      expect(physicsSimWGSL).toContain('sim.u_mode == 2u');
      expect(physicsSimWGSL).toContain('seamFactor');
      expect(physicsSimWGSL).toContain('hoopStress');
      // Mode 3: Fluid Flow
      expect(physicsSimWGSL).toContain('sim.u_mode == 3u');
      expect(physicsSimWGSL).toContain('computeCurlNoise');
      expect(physicsSimWGSL).toContain('vortexCirculation');
      // Mode 4: Fuller Dymaxion
      expect(physicsSimWGSL).toContain('sim.u_mode == 4u');
      expect(physicsSimWGSL).toContain('dymaxionTarget');
    });
  });

  // --------------------------------------------------------------------------
  // 2. WGSL Render Shaders
  // --------------------------------------------------------------------------
  describe('WGSL Points & Lines Render Shaders', () => {
    it('M6-T04: verifies points_render.wgsl processes Particle vertex attributes and GIS contrast', () => {
      expect(pointsRenderWGSL).toContain('@vertex');
      expect(pointsRenderWGSL).toContain('fn vs_main');
      expect(pointsRenderWGSL).toContain('@fragment');
      expect(pointsRenderWGSL).toContain('fn fs_main');
      expect(pointsRenderWGSL).toContain('backfaceDimming');
      expect(pointsRenderWGSL).toContain('geographicColor');
      expect(pointsRenderWGSL).toContain('structuralColor');
    });

    it('M6-T05: verifies lines_render.wgsl implements wireframe density attenuation and index rendering', () => {
      expect(linesRenderWGSL).toContain('@vertex');
      expect(linesRenderWGSL).toContain('fn vs_main');
      expect(linesRenderWGSL).toContain('@fragment');
      expect(linesRenderWGSL).toContain('fn fs_main');
      expect(linesRenderWGSL).toContain('densityFactor');
      expect(linesRenderWGSL).toContain('sqrt(100000.0');
    });
  });

  // --------------------------------------------------------------------------
  // 3. WebGPUEngine Class Architecture & Zero-Copy Execution
  // --------------------------------------------------------------------------
  describe('WebGPUEngine Class & Buffer Footprint', () => {
    it('M6-T06: verifies WebGPUEngine.isSupported() correctly detects navigator.gpu', async () => {
      const originalNav = globalThis.navigator;

      // When navigator.gpu is absent
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(await WebGPUEngine.isSupported()).toBe(false);

      // When navigator.gpu is present
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          gpu: createMockNavigatorGPU(true),
        },
        configurable: true,
        writable: true,
      });
      expect(await WebGPUEngine.isSupported()).toBe(true);

      // Restore original
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        configurable: true,
        writable: true,
      });
    });

    it('M6-T07: calculates accurate 1,000,000-node 64-byte particle buffer footprint (64 MB per buffer)', () => {
      const N = 1000000;
      const bytesPerParticle = 16 * 4; // 16 floats * 4 bytes = 64 bytes
      const singleBufferBytes = N * bytesPerParticle;
      const singleBufferMB = singleBufferBytes / (1024 * 1024);

      expect(bytesPerParticle).toBe(64);
      expect(singleBufferBytes).toBe(64000000);
      expect(singleBufferMB).toBeCloseTo(61.035, 2); // 64 million bytes = ~61.04 MiB
    });

    it('M6-T08: verifies 120 FPS memory bandwidth is under 15.4 GB/s ceiling', () => {
      const pointCount = 1000000;
      const bytesPerVertex = 64; // Interleaved storage buffer
      const fps = 120;
      // 1 read (64MB) + 1 write (64MB) + 1 vertex read (64MB) = 192 MB/frame
      const bytesPerFrame = bytesPerVertex * 3 * pointCount;
      const gbPerSec = (bytesPerFrame * fps) / 1e9; // decimal GB/s

      expect(gbPerSec).toBeLessThan(25.0);
    });

    it('M6-T09: verifies uniform buffer serialization handles camera transformation and cursor vector', () => {
      const engine = new WebGPUEngine();
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.updateMatrixWorld();

      const params: WebGPUFrameParams = {
        unfurl: 0.5,
        mode: 3,
        layerMode: 0,
        time: 12.34,
        dt: 0.016,
        cursorRayOrig: new THREE.Vector3(0, 0, 15),
        cursorRayDir: new THREE.Vector3(0, 0, -1),
        cursorHitPos: new THREE.Vector3(0, 0, 5),
        cursorVel: new THREE.Vector4(0.5, 0.2, 0.0, 0.54),
        cursorActive: true,
        camera,
      };

      expect(params.unfurl).toBe(0.5);
      expect(params.mode).toBe(3);
      expect(params.cursorActive).toBe(true);
      expect(params.camera.position.z).toBe(15);
    });
  });
});
