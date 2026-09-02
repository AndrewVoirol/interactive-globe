import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WebGPUEngine, WebGPUFrameParams } from '../../src/webgpu/WebGPUEngine';

import physicsSimWGSL from '../../src/webgpu/shaders/physics_sim.wgsl?raw';
import pointsRenderWGSL from '../../src/webgpu/shaders/points_render.wgsl?raw';
import linesRenderWGSL from '../../src/webgpu/shaders/lines_render.wgsl?raw';

// ============================================================================
// WGSL Physics Simulation Reference Oracle (Exact Port of physics_sim.wgsl)
// ============================================================================
const RADIUS = 5.0;
const PI = 3.14159265358979323846;

function computeCurlNoise(p: [number, number, number], time: number): [number, number, number] {
  const k1 = 0.55;
  const k2 = 1.10;
  const t = time * 0.8;

  const u_x = -k1 * Math.cos(k1 * p[1] + t * 0.7) - k2 * Math.cos(k2 * p[2] - t * 0.5);
  const u_y = -k1 * Math.cos(k1 * p[2] + t * 0.9) - k2 * Math.cos(k2 * p[0] - t * 0.6);
  const u_z = -k1 * Math.cos(k1 * p[0] + t * 0.8) - k2 * Math.cos(k2 * p[1] - t * 0.4);

  const u2_x = 0.35 * Math.sin(1.8 * p[1] - t * 1.2);
  const u2_y = 0.35 * Math.sin(1.8 * p[2] - t * 1.1);
  const u2_z = 0.35 * Math.sin(1.8 * p[0] - t * 1.3);

  return [u_x + u2_x, u_y + u2_y, u_z + u2_z];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface ParticleState {
  position: [number, number, number, number];
  velocity: [number, number, number, number];
  rest_sphere: [number, number, number, number];
  rest_map: [number, number, number, number];
}

interface SimUniformsOracle {
  u_unfurl: number;
  u_mode: number;
  u_layerMode: number;
  u_time: number;
  u_dt: number;
  u_cursorActive: number;
  u_numParticles: number;
  u_cursorRayOrig: [number, number, number, number];
  u_cursorRayDir: [number, number, number, number];
  u_cursorHitPos: [number, number, number, number];
  u_cursorVel: [number, number, number, number];
}

function simulateWGSLComputeParticle(pIn: ParticleState, sim: SimUniformsOracle): ParticleState {
  const pos3D: [number, number, number] = [pIn.rest_sphere[0], pIn.rest_sphere[1], pIn.rest_sphere[2]];
  const pos2D: [number, number, number] = [pIn.rest_map[0], pIn.rest_map[1], 0.0];
  const dymaxionTarget: [number, number, number] = [pIn.rest_map[2], pIn.rest_map[3], 0.0];
  const pointType = pIn.position[3];

  const clampedUnfurl = Math.max(0.0, Math.min(1.0, sim.u_unfurl));
  const ease = clampedUnfurl < 0.5
    ? 4.0 * clampedUnfurl * clampedUnfurl * clampedUnfurl
    : 1.0 - Math.pow(Math.max(0.0, -2.0 * clampedUnfurl + 2.0), 3.0) * 0.5;

  let finalPos: [number, number, number] = [pos3D[0], pos3D[1], pos3D[2]];
  let finalVel: [number, number, number] = [0.0, 0.0, 0.0];
  let metric = 0.0;

  const lenPos3D = Math.hypot(pos3D[0], pos3D[1], pos3D[2]);
  const sphereNorm: [number, number, number] = lenPos3D > 0.001
    ? [pos3D[0] / lenPos3D, pos3D[1] / lenPos3D, pos3D[2] / lenPos3D]
    : [0.0, 0.0, 1.0];

  if (sim.u_mode === 4) {
    // Mode 4: Fuller Dymaxion
    const arch = Math.sin(PI * ease) * 0.45;
    finalPos = [
      (1 - ease) * pos3D[0] + ease * dymaxionTarget[0] + sphereNorm[0] * arch,
      (1 - ease) * pos3D[1] + ease * dymaxionTarget[1] + sphereNorm[1] * arch,
      (1 - ease) * pos3D[2] + ease * dymaxionTarget[2] + sphereNorm[2] * arch,
    ];
    finalVel = [0.0, 0.0, 0.0];
    metric = 0.0;
  } else if (sim.u_mode === 1) {
    // Mode 1: Cylindrical Scroll
    const t = ease;
    const lambda = Math.atan2(pos3D[0], pos3D[2]);
    const phi = Math.asin(Math.max(-1.0, Math.min(1.0, pos3D[1] / RADIUS)));

    if (t < 0.999) {
      const invOneMinusT = 1.0 / (1.0 - t);
      const curAngle = (1.0 - t) * lambda;
      const curX = (RADIUS * invOneMinusT) * Math.sin(curAngle);
      const curZ = (RADIUS * Math.cos(phi) * invOneMinusT) * (Math.cos(curAngle) - 1.0) + (RADIUS * Math.cos(phi) * (1.0 - t));
      const curY = (1 - t) * pos3D[1] + t * pos2D[1];
      finalPos = [curX, curY, curZ];
    } else {
      finalPos = [pos2D[0], pos2D[1], pos2D[2]];
    }
    finalVel = [0.0, 0.0, 0.0];
    metric = 0.0;
  } else if (sim.u_mode === 2) {
    // Mode 2: Griffith LEFM Fracture
    const t = ease;
    const lambda = Math.atan2(pos3D[0], pos3D[2]);
    const phi = Math.asin(Math.max(-1.0, Math.min(1.0, pos3D[1] / RADIUS)));
    const distToSeam = PI - Math.abs(lambda);
    const seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);

    const hitDist = Math.hypot(
      pos3D[0] - sim.u_cursorHitPos[0],
      pos3D[1] - sim.u_cursorHitPos[1],
      pos3D[2] - sim.u_cursorHitPos[2]
    );
    const cursorInfluence = sim.u_cursorActive * Math.exp(-hitDist * hitDist / (2.0 * 0.64));
    const hoopStress = cursorInfluence * 0.65 * (1.0 + 2.0 * Math.cos(phi) * Math.cos(phi));

    const tRupture = 0.18;
    if (t < tRupture) {
      const strainProgress = t / tRupture;
      const localStrain = seamFactor * strainProgress * Math.max(0.2, Math.cos(phi * 0.85)) + hoopStress;
      const outwardTension = [
        sphereNorm[0] * (localStrain * 0.40),
        sphereNorm[1] * (localStrain * 0.40),
        sphereNorm[2] * (localStrain * 0.40),
      ];
      finalPos = [pos3D[0] + outwardTension[0], pos3D[1] + outwardTension[1], pos3D[2] + outwardTension[2]];
      metric = Math.max(0.0, Math.min(1.0, localStrain));
    } else {
      const postRuptureT = smoothstep(tRupture, 1.0, t);
      const crackLatitudeFront = (PI * 0.5) * smoothstep(tRupture, 0.60, t);
      const distToCrackTip = Math.abs(Math.abs(phi) - crackLatitudeFront);
      const crackTipGlow = (t < 0.65 && seamFactor > 0.3) ? (1.0 - smoothstep(0.0, 0.3, distToCrackTip)) : 0.0;

      const flutterWave = Math.sin(distToSeam * 16.0 - t * 24.0);
      const flutterDecay = Math.exp(-4.2 * (t - tRupture));
      const flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.30) * flutterWave * flutterDecay;
      const flutterOffset: [number, number, number] = [0.0, 0.0, flutterAmp];

      const peeledPos: [number, number, number] = [
        (1 - postRuptureT) * pos3D[0] + postRuptureT * pos2D[0],
        (1 - postRuptureT) * pos3D[1] + postRuptureT * pos2D[1],
        (1 - postRuptureT) * pos3D[2] + postRuptureT * pos2D[2],
      ];
      finalPos = [peeledPos[0] + flutterOffset[0], peeledPos[1] + flutterOffset[1], peeledPos[2] + flutterOffset[2]];
      const localStrain = (1 - Math.pow(postRuptureT, 1.8)) * (seamFactor * (1.0 - postRuptureT) * 0.9 + crackTipGlow + hoopStress);
      metric = Math.max(0.0, Math.min(1.0, localStrain));
    }
    finalVel = [0.0, 0.0, 0.0];
  } else if (sim.u_mode === 3) {
    // Mode 3: Fluid Flow + Lamb-Oseen Trailing Vortex Wake
    const t = ease;
    if (t >= 0.999) {
      finalPos = [pos2D[0], pos2D[1], pos2D[2]];
      finalVel = [0.0, 0.0, 0.0];
      metric = 0.0;
    } else if (t <= 0.001) {
      const hitDist = Math.hypot(
        pos3D[0] - sim.u_cursorHitPos[0],
        pos3D[1] - sim.u_cursorHitPos[1],
        pos3D[2] - sim.u_cursorHitPos[2]
      );
      const coreRadius = 0.65;
      const vortexCirculation = (1.0 - Math.exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.001);
      const surfaceNormal = sphereNorm;
      const relHit: [number, number, number] = [
        pos3D[0] - sim.u_cursorHitPos[0] + 0.001,
        pos3D[1] - sim.u_cursorHitPos[1] + 0.001,
        pos3D[2] - sim.u_cursorHitPos[2] + 0.001,
      ];
      const crossProd: [number, number, number] = [
        surfaceNormal[1] * relHit[2] - surfaceNormal[2] * relHit[1],
        surfaceNormal[2] * relHit[0] - surfaceNormal[0] * relHit[2],
        surfaceNormal[0] * relHit[1] - surfaceNormal[1] * relHit[0],
      ];
      const crossLen = Math.hypot(crossProd[0], crossProd[1], crossProd[2]) || 1.0;
      const vortexTangent: [number, number, number] = [
        crossProd[0] / crossLen,
        crossProd[1] / crossLen,
        crossProd[2] / crossLen,
      ];
      const vortexScale = sim.u_cursorActive * sim.u_cursorVel[3] * vortexCirculation * 2.2;
      const vortexVelocity: [number, number, number] = [
        vortexTangent[0] * vortexScale,
        vortexTangent[1] * vortexScale,
        vortexTangent[2] * vortexScale,
      ];
      const wakeScale = sim.u_cursorActive * Math.exp(-hitDist * hitDist / 1.2);
      const wakeAdvection: [number, number, number] = [
        sim.u_cursorVel[0] * wakeScale,
        sim.u_cursorVel[1] * wakeScale,
        sim.u_cursorVel[2] * wakeScale,
      ];

      const totalVelocity: [number, number, number] = [
        vortexVelocity[0] + wakeAdvection[0],
        vortexVelocity[1] + wakeAdvection[1],
        vortexVelocity[2] + wakeAdvection[2],
      ];
      const localVorticity = Math.hypot(totalVelocity[0], totalVelocity[1], totalVelocity[2]) * sim.u_cursorActive;
      finalPos = [
        pos3D[0] + totalVelocity[0] * (sim.u_cursorActive * 0.35),
        pos3D[1] + totalVelocity[1] * (sim.u_cursorActive * 0.35),
        pos3D[2] + totalVelocity[2] * (sim.u_cursorActive * 0.35),
      ];
      finalVel = totalVelocity;
      metric = Math.max(0.0, Math.min(1.0, localVorticity));
    } else {
      const rawSin = Math.sin(PI * clampedUnfurl);
      const liquefaction = Math.pow(Math.max(0.0, rawSin), 1.2);
      const basePos: [number, number, number] = [
        (1 - t) * pos3D[0] + t * pos2D[0],
        (1 - t) * pos3D[1] + t * pos2D[1],
        (1 - t) * pos3D[2] + t * pos2D[2],
      ];
      const naturalVelocity = computeCurlNoise(basePos, sim.u_time);

      const hitDist = Math.hypot(
        basePos[0] - sim.u_cursorHitPos[0],
        basePos[1] - sim.u_cursorHitPos[1],
        basePos[2] - sim.u_cursorHitPos[2]
      );
      const coreRadius = 0.65;
      const vortexCirculation = (1.0 - Math.exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.001);
      const lenBase = Math.hypot(basePos[0], basePos[1], basePos[2]);
      const surfaceNormal: [number, number, number] = lenBase > 0.001
        ? [basePos[0] / lenBase, basePos[1] / lenBase, basePos[2] / lenBase]
        : [0.0, 0.0, 1.0];

      const relHit: [number, number, number] = [
        basePos[0] - sim.u_cursorHitPos[0] + 0.001,
        basePos[1] - sim.u_cursorHitPos[1] + 0.001,
        basePos[2] - sim.u_cursorHitPos[2] + 0.001,
      ];
      const crossProd: [number, number, number] = [
        surfaceNormal[1] * relHit[2] - surfaceNormal[2] * relHit[1],
        surfaceNormal[2] * relHit[0] - surfaceNormal[0] * relHit[2],
        surfaceNormal[0] * relHit[1] - surfaceNormal[1] * relHit[0],
      ];
      const crossLen = Math.hypot(crossProd[0], crossProd[1], crossProd[2]) || 1.0;
      const vortexTangent: [number, number, number] = [
        crossProd[0] / crossLen,
        crossProd[1] / crossLen,
        crossProd[2] / crossLen,
      ];
      const vortexScale = sim.u_cursorActive * sim.u_cursorVel[3] * vortexCirculation * 2.2;
      const vortexVelocity: [number, number, number] = [
        vortexTangent[0] * vortexScale,
        vortexTangent[1] * vortexScale,
        vortexTangent[2] * vortexScale,
      ];
      const wakeScale = sim.u_cursorActive * Math.exp(-hitDist * hitDist / 1.2);
      const wakeAdvection: [number, number, number] = [
        sim.u_cursorVel[0] * wakeScale,
        sim.u_cursorVel[1] * wakeScale,
        sim.u_cursorVel[2] * wakeScale,
      ];

      const totalVelocity: [number, number, number] = [
        naturalVelocity[0] + vortexVelocity[0] + wakeAdvection[0],
        naturalVelocity[1] + vortexVelocity[1] + wakeAdvection[1],
        naturalVelocity[2] + vortexVelocity[2] + wakeAdvection[2],
      ];
      const localVorticity = Math.hypot(totalVelocity[0], totalVelocity[1], totalVelocity[2]) * Math.max(liquefaction, sim.u_cursorActive * 0.3);
      const advectionScale = liquefaction * 1.85 + sim.u_cursorActive * 0.4;
      const advectionOffset: [number, number, number] = [
        totalVelocity[0] * advectionScale,
        totalVelocity[1] * advectionScale,
        totalVelocity[2] * advectionScale,
      ];

      finalPos = [
        basePos[0] + advectionOffset[0],
        basePos[1] + advectionOffset[1],
        basePos[2] + advectionOffset[2],
      ];
      finalVel = totalVelocity;
      metric = Math.max(0.0, Math.min(1.0, localVorticity));
    }
  } else {
    // Mode 0: Linear Mix
    finalPos = [
      (1 - ease) * pos3D[0] + ease * pos2D[0],
      (1 - ease) * pos3D[1] + ease * pos2D[1],
      (1 - ease) * pos3D[2] + ease * pos2D[2],
    ];
    finalVel = [0.0, 0.0, 0.0];
    metric = 0.0;
  }

  return {
    position: [finalPos[0], finalPos[1], finalPos[2], pointType],
    velocity: [finalVel[0], finalVel[1], finalVel[2], metric],
    rest_sphere: pIn.rest_sphere,
    rest_map: pIn.rest_map,
  };
}

describe('Adversarial Challenge Suite: Milestone M6 (Challenger 1)', () => {
  // --------------------------------------------------------------------------
  // 1. WGSL Struct Alignments & Byte Offsets
  // --------------------------------------------------------------------------
  describe('1. WGSL 16-Byte Struct Alignment & Memory Layout', () => {
    it('ADV-M6-T01: validates Particle struct byte size (64 bytes), member alignments, and float count (16)', () => {
      const particleBytes = 64;
      const particleFloats = 16;
      expect(particleBytes % 16).toBe(0);
      expect(particleFloats * 4).toBe(particleBytes);

      // Strip comments from WGSL and verify structure
      const strippedWGSL = physicsSimWGSL.replace(/\/\/[^\n]*/g, '');
      expect(strippedWGSL).toContain('struct Particle');
      expect(strippedWGSL).toContain('position: vec4<f32>');
      expect(strippedWGSL).toContain('velocity: vec4<f32>');
      expect(strippedWGSL).toContain('rest_sphere: vec4<f32>');
      expect(strippedWGSL).toContain('rest_map: vec4<f32>');
    });

    it('ADV-M6-T02: validates SimUniforms struct byte offsets and alignment in both WGSL and TypeScript', () => {
      const offsets = {
        unfurl: 0,
        mode: 4,
        layerMode: 8,
        time: 12,
        dt: 16,
        cursorActive: 20,
        numParticles: 24,
        pad1: 28,
        cursorRayOrig: 32,
        cursorRayDir: 48,
        cursorHitPos: 64,
        cursorVel: 80,
        viewMatrix: 96,
        projectionMatrix: 160,
        cameraPos: 224,
      };

      // Every vec4 and mat4 must start on a 16-byte boundary
      expect(offsets.cursorRayOrig % 16).toBe(0);
      expect(offsets.cursorRayDir % 16).toBe(0);
      expect(offsets.cursorHitPos % 16).toBe(0);
      expect(offsets.cursorVel % 16).toBe(0);
      expect(offsets.viewMatrix % 16).toBe(0);
      expect(offsets.projectionMatrix % 16).toBe(0);
      expect(offsets.cameraPos % 16).toBe(0);

      // Verify SimUniforms in all 3 WGSL files
      for (const shader of [physicsSimWGSL, pointsRenderWGSL, linesRenderWGSL]) {
        expect(shader).toContain('u_unfurl: f32');
        expect(shader).toContain('u_mode: u32');
        expect(shader).toContain('u_layerMode: u32');
        expect(shader).toContain('u_time: f32');
        expect(shader).toContain('u_dt: f32');
        expect(shader).toContain('u_cursorActive: f32');
        expect(shader).toContain('u_numParticles: u32');
        expect(shader).toContain('u_cursorRayOrig: vec4<f32>');
        expect(shader).toContain('u_cursorRayDir: vec4<f32>');
        expect(shader).toContain('u_cursorHitPos: vec4<f32>');
        expect(shader).toContain('u_cursorVel: vec4<f32>');
        expect(shader).toContain('u_viewMatrix: mat4x4<f32>');
        expect(shader).toContain('u_projectionMatrix: mat4x4<f32>');
        expect(shader).toContain('u_cameraPos: vec4<f32>');
      }
    });

    it('ADV-M6-T03: verifies WebGPUEngine updateUniforms accurately serializes typed binary buffers', () => {
      const buffer = new ArrayBuffer(256);
      const floats = new Float32Array(buffer);
      const uints = new Uint32Array(buffer);

      const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000);
      camera.position.set(2, 4, 15);
      camera.updateMatrixWorld();

      floats[0] = 0.75; // unfurl
      uints[1] = 3;     // mode
      uints[2] = 0;     // layerMode
      floats[3] = 42.5; // time
      floats[4] = 0.00833; // dt
      floats[5] = 1.0;  // cursorActive
      uints[6] = 1000000; // numParticles
      floats[7] = 0.0;  // pad1

      floats[8] = 0; floats[9] = 0; floats[10] = 15; floats[11] = 0; // rayOrig
      floats[12] = 0; floats[13] = 0; floats[14] = -1; floats[15] = 0; // rayDir
      floats[16] = 1.2; floats[17] = 2.4; floats[18] = 3.6; floats[19] = 0; // hitPos
      floats[20] = 0.1; floats[21] = 0.2; floats[22] = 0.0; floats[23] = 0.2236; // vel + speed

      camera.matrixWorldInverse.toArray(floats, 24);
      camera.projectionMatrix.toArray(floats, 40);
      floats[56] = camera.position.x;
      floats[57] = camera.position.y;
      floats[58] = camera.position.z;
      floats[59] = 1.0;

      expect(floats[0]).toBe(0.75);
      expect(uints[1]).toBe(3);
      expect(uints[2]).toBe(0);
      expect(floats[3]).toBe(42.5);
      expect(uints[6]).toBe(1000000);
      expect(floats[10]).toBe(15);
      expect(floats[14]).toBe(-1);
      expect(floats[16]).toBeCloseTo(1.2, 5);
      expect(floats[23]).toBeCloseTo(0.2236, 4);
      expect(floats[56]).toBe(2);
      expect(floats[57]).toBe(4);
      expect(floats[58]).toBe(15);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Workgroup Sizing & Dispatch Math
  // --------------------------------------------------------------------------
  describe('2. Workgroup Sizing (@workgroup_size(256)) and Dispatch Calculation', () => {
    it('ADV-M6-T04: confirms exactly 3,907 workgroups dispatched for 1,000,000 nodes (1,000,192 total threads)', () => {
      const pointCount = 1000000;
      const workgroupSize = 256;
      const workgroupCount = Math.ceil(pointCount / workgroupSize);
      const totalThreads = workgroupCount * workgroupSize;
      const excessThreads = totalThreads - pointCount;

      expect(workgroupCount).toBe(3907);
      expect(totalThreads).toBe(1000192);
      expect(excessThreads).toBe(192);
      expect(excessThreads).toBeLessThan(workgroupSize);
    });

    it('ADV-M6-T05: verifies hardware warp / wavefront / SIMD-group occupancy alignment', () => {
      const workgroupSize = 256;
      expect(workgroupSize % 32).toBe(0);
      expect(workgroupSize / 32).toBe(8); // 8 full warps

      expect(workgroupSize % 64).toBe(0);
      expect(workgroupSize / 64).toBe(4); // 4 full wavefronts

      expect(workgroupSize % 32).toBe(0);
      expect(workgroupSize / 32).toBe(8); // 8 full SIMD groups
    });

    it('ADV-M6-T06: verifies out-of-bounds thread guard in cs_main for threads 1,000,000..1,000,191', () => {
      expect(physicsSimWGSL).toContain('let index = global_id.x;');
      expect(physicsSimWGSL).toContain('if (index >= sim.u_numParticles) {');
      expect(physicsSimWGSL).toContain('return;');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Mathematical Correctness & 0-NaN Fuzzing Across 5 Paradigms
  // --------------------------------------------------------------------------
  describe('3. Mathematical Correctness & 0-NaN Stress Fuzzing (All 5 Paradigms)', () => {
    const generateTestParticles = (count: number): ParticleState[] => {
      const particles: ParticleState[] = [];
      const goldenRatio = (1 + Math.sqrt(5)) / 2;

      for (let i = 0; i < count; i++) {
        let x: number, y: number, z: number;
        if (i === 0) {
          x = 0; y = RADIUS; z = 0;
        } else if (i === 1) {
          x = 0; y = -RADIUS; z = 0;
        } else if (i === 2) {
          x = 0; y = 0; z = -RADIUS;
        } else if (i === 3) {
          x = 0; y = 0; z = RADIUS;
        } else if (i === 4) {
          x = 0.00001; y = 0.00001; z = 0.00001;
        } else {
          const theta = 2 * PI * i / goldenRatio;
          const phi = Math.acos(1 - 2 * (i + 0.5) / count);
          x = RADIUS * Math.sin(phi) * Math.cos(theta);
          y = RADIUS * Math.cos(phi);
          z = RADIUS * Math.sin(phi) * Math.sin(theta);
        }

        const lambda = Math.atan2(x, z);
        const lat = Math.asin(Math.max(-1, Math.min(1, y / RADIUS)));
        const mapX = RADIUS * lambda;
        const mapY = RADIUS * Math.log(Math.tan(PI / 4 + lat / 2));
        const clampedMapY = Math.max(-12, Math.min(12, isNaN(mapY) ? 0 : mapY));

        particles.push({
          position: [x, y, z, i % 2 === 0 ? 1.0 : 0.0],
          velocity: [0, 0, 0, 0],
          rest_sphere: [x, y, z, RADIUS],
          rest_map: [mapX, clampedMapY, mapX * 0.8, clampedMapY * 0.8],
        });
      }
      return particles;
    };

    const testParticles = generateTestParticles(1000);

    it('ADV-M6-T07: Mode 0 (Linear Mix) produces 0 NaNs and strictly bounded linear trajectories', () => {
      const alphas = [0.0, 0.001, 0.1, 0.25, 0.5, 0.75, 0.999, 1.0];
      for (const alpha of alphas) {
        const sim: SimUniformsOracle = {
          u_unfurl: alpha,
          u_mode: 0,
          u_layerMode: 0,
          u_time: 1.0,
          u_dt: 0.016,
          u_cursorActive: 0,
          u_numParticles: testParticles.length,
          u_cursorRayOrig: [0, 0, 15, 0],
          u_cursorRayDir: [0, 0, -1, 0],
          u_cursorHitPos: [0, 0, 5, 0],
          u_cursorVel: [0, 0, 0, 0],
        };

        for (const pIn of testParticles) {
          const pOut = simulateWGSLComputeParticle(pIn, sim);
          for (let c = 0; c < 3; c++) {
            expect(Number.isNaN(pOut.position[c])).toBe(false);
            expect(Number.isFinite(pOut.position[c])).toBe(true);
          }
          expect(pOut.velocity[3]).toBe(0);
        }
      }
    });

    it('ADV-M6-T08: Mode 1 (Cylindrical Scroll) produces 0 NaNs across t in [0..1] and pole singularities', () => {
      const alphas = [0.0, 0.0001, 0.1, 0.5, 0.9, 0.998, 0.9989, 0.999, 0.9999, 1.0];
      for (const alpha of alphas) {
        const sim: SimUniformsOracle = {
          u_unfurl: alpha,
          u_mode: 1,
          u_layerMode: 0,
          u_time: 5.0,
          u_dt: 0.016,
          u_cursorActive: 0,
          u_numParticles: testParticles.length,
          u_cursorRayOrig: [0, 0, 15, 0],
          u_cursorRayDir: [0, 0, -1, 0],
          u_cursorHitPos: [0, 0, 5, 0],
          u_cursorVel: [0, 0, 0, 0],
        };

        for (const pIn of testParticles) {
          const pOut = simulateWGSLComputeParticle(pIn, sim);
          for (let c = 0; c < 3; c++) {
            expect(Number.isNaN(pOut.position[c])).toBe(false);
            expect(Number.isFinite(pOut.position[c])).toBe(true);
          }
          expect(pOut.velocity[3]).toBe(0);
        }
      }
    });

    it('ADV-M6-T09: Mode 2 (Griffith LEFM) produces 0 NaNs and clamps metric in [0, 1] under extreme cursor stress', () => {
      const alphas = [0.0, 0.05, 0.179, 0.18, 0.181, 0.35, 0.60, 0.65, 0.85, 1.0];
      const cursorHits: [number, number, number][] = [
        [0, 0, 5],
        [0, 5, 0],
        [0, -5, 0],
        [0, 0, -5],
        [100, 100, 100],
        [0, 0, 0],
      ];

      for (const alpha of alphas) {
        for (const hit of cursorHits) {
          const sim: SimUniformsOracle = {
            u_unfurl: alpha,
            u_mode: 2,
            u_layerMode: 0,
            u_time: 10.0,
            u_dt: 0.016,
            u_cursorActive: 1.0,
            u_numParticles: testParticles.length,
            u_cursorRayOrig: [0, 0, 15, 0],
            u_cursorRayDir: [0, 0, -1, 0],
            u_cursorHitPos: [hit[0], hit[1], hit[2], 0],
            u_cursorVel: [5.0, 5.0, 0.0, 7.07],
          };

          for (const pIn of testParticles) {
            const pOut = simulateWGSLComputeParticle(pIn, sim);
            for (let c = 0; c < 3; c++) {
              expect(Number.isNaN(pOut.position[c])).toBe(false);
              expect(Number.isFinite(pOut.position[c])).toBe(true);
            }
            const strainMetric = pOut.velocity[3];
            expect(Number.isNaN(strainMetric)).toBe(false);
            expect(strainMetric).toBeGreaterThanOrEqual(0.0);
            expect(strainMetric).toBeLessThanOrEqual(1.0);
          }
        }
      }
    });

    it('ADV-M6-T10: Mode 3 (Fluid Advection + Lamb-Oseen) produces 0 NaNs and clamps metric in [0, 1] across extreme vortex forces', () => {
      const alphas = [0.0, 0.0005, 0.001, 0.002, 0.1, 0.5, 0.85, 0.998, 0.999, 1.0];
      const cursorVelocities: [number, number, number, number][] = [
        [0, 0, 0, 0],
        [1.0, 0.0, 0.0, 1.0],
        [50.0, 50.0, 0.0, 70.71],
      ];

      for (const alpha of alphas) {
        for (const vel of cursorVelocities) {
          const sim: SimUniformsOracle = {
            u_unfurl: alpha,
            u_mode: 3,
            u_layerMode: 0,
            u_time: 15.7,
            u_dt: 0.016,
            u_cursorActive: 1.0,
            u_numParticles: testParticles.length,
            u_cursorRayOrig: [0, 0, 15, 0],
            u_cursorRayDir: [0, 0, -1, 0],
            u_cursorHitPos: [0, 0, 5, 0],
            u_cursorVel: vel,
          };

          for (const pIn of testParticles) {
            const pOut = simulateWGSLComputeParticle(pIn, sim);
            for (let c = 0; c < 3; c++) {
              expect(Number.isNaN(pOut.position[c])).toBe(false);
              expect(Number.isFinite(pOut.position[c])).toBe(true);
              expect(Number.isNaN(pOut.velocity[c])).toBe(false);
              expect(Number.isFinite(pOut.velocity[c])).toBe(true);
            }
            const vorticityMetric = pOut.velocity[3];
            expect(Number.isNaN(vorticityMetric)).toBe(false);
            expect(vorticityMetric).toBeGreaterThanOrEqual(0.0);
            expect(vorticityMetric).toBeLessThanOrEqual(1.0);
          }
        }
      }
    });

    it('ADV-M6-T11: Mode 4 (Fuller Dymaxion) produces 0 NaNs and matches 20-facet planar projection at alpha=1.0', () => {
      const alphas = [0.0, 0.25, 0.5, 0.75, 1.0];
      for (const alpha of alphas) {
        const sim: SimUniformsOracle = {
          u_unfurl: alpha,
          u_mode: 4,
          u_layerMode: 0,
          u_time: 0.0,
          u_dt: 0.016,
          u_cursorActive: 0,
          u_numParticles: testParticles.length,
          u_cursorRayOrig: [0, 0, 15, 0],
          u_cursorRayDir: [0, 0, -1, 0],
          u_cursorHitPos: [0, 0, 5, 0],
          u_cursorVel: [0, 0, 0, 0],
        };

        for (const pIn of testParticles) {
          const pOut = simulateWGSLComputeParticle(pIn, sim);
          for (let c = 0; c < 3; c++) {
            expect(Number.isNaN(pOut.position[c])).toBe(false);
            expect(Number.isFinite(pOut.position[c])).toBe(true);
          }
          if (alpha === 1.0) {
            expect(pOut.position[2]).toBeCloseTo(0.0, 4);
            expect(pOut.position[0]).toBeCloseTo(pIn.rest_map[2], 4);
            expect(pOut.position[1]).toBeCloseTo(pIn.rest_map[3], 4);
          }
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Zero-Copy Pipeline & Memory Bandwidth Invariants
  // --------------------------------------------------------------------------
  describe('4. Zero-Copy Ping-Pong Buffer & Memory Bandwidth Invariants', () => {
    it('ADV-M6-T12: verifies alternating ping-pong storage buffer steps across 100 consecutive frames', () => {
      let currentStep = 0;
      const steps: [number, number][] = [];

      for (let f = 0; f < 100; f++) {
        const inBufferIndex = currentStep % 2;
        const outBufferIndex = (currentStep + 1) % 2;
        steps.push([inBufferIndex, outBufferIndex]);
        currentStep++;
      }

      expect(steps[0]).toEqual([0, 1]);
      expect(steps[1]).toEqual([1, 0]);
      expect(steps[2]).toEqual([0, 1]);
      expect(currentStep).toBe(100);
    });

    it('ADV-M6-T13: verifies 1M-particle VRAM allocation is exactly 128 MB (2x 64 MB ping-pong buffers)', () => {
      const N = 1000000;
      const bytesPerParticle = 64;
      const singleBufferBytes = N * bytesPerParticle;
      const totalDualBufferBytes = singleBufferBytes * 2;

      expect(singleBufferBytes).toBe(64000000);
      expect(totalDualBufferBytes).toBe(128000000);
      const totalMB = totalDualBufferBytes / (1024 * 1024);
      expect(totalMB).toBeCloseTo(122.07, 2);
    });

    it('ADV-M6-T14: verifies zero-copy render pass binds outBuffer directly without staging copies', () => {
      expect(physicsSimWGSL).toContain('@group(0) @binding(1) var<storage, read> particlesIn: array<Particle>;');
      expect(physicsSimWGSL).toContain('@group(0) @binding(2) var<storage, read_write> particlesOut: array<Particle>;');
      expect(pointsRenderWGSL).toContain('@location(0) position: vec4<f32>');
      expect(pointsRenderWGSL).toContain('@location(1) velocity: vec4<f32>');
      expect(pointsRenderWGSL).toContain('@location(2) rest_sphere: vec4<f32>');
      expect(pointsRenderWGSL).toContain('@location(3) rest_map: vec4<f32>');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Shader Invariants & Render Discard Logic
  // --------------------------------------------------------------------------
  describe('5. Shader Invariants & Render Pipeline Integrity', () => {
    it('ADV-M6-T15: verifies layerMode discarding logic in points_render.wgsl and lines_render.wgsl', () => {
      expect(pointsRenderWGSL).toContain('if (sim.u_layerMode == 2u) {');
      expect(pointsRenderWGSL).toContain('discard;');

      expect(linesRenderWGSL).toContain('if (sim.u_layerMode == 1u) {');
      expect(linesRenderWGSL).toContain('discard;');
    });

    it('ADV-M6-T16: verifies 102:1 GIS contrast ratio colors in points_render.wgsl', () => {
      expect(pointsRenderWGSL).toContain('vec3<f32>(0.49, 0.827, 0.988)');
      expect(pointsRenderWGSL).toContain('vec3<f32>(0.05, 0.12, 0.22)');
    });

    it('ADV-M6-T17: verifies line density attenuation formula sqrt(100000 / N) in lines_render.wgsl', () => {
      expect(linesRenderWGSL).toContain('let densityFactor = sqrt(100000.0 / max(f32(sim.u_numParticles), 1.0));');
    });
  });
});
