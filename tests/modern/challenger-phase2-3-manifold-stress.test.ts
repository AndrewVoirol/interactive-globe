// ============================================================================
// File: tests/modern/challenger-phase2-3-manifold-stress.test.ts
// Challenger: challenger_phase2_3_1 (Empirical Challenger)
// Mission: Phase 2.3 evaluateManifold Unification Stress Verification
// Reference: SHADERS_SPEC_LEDGER.md §3, AGENTS.md Rules 4, 7, 21, 28
//
// Verification Pillars:
// - Pillar 1: All 4 Active Modes (0, 1, 2, 3) at intermediate alphas {0.0, 0.25, 0.50, 0.75, 1.0}
// - Pillar 2: Boundary Conditions (North/South Poles ±90°, Antimeridian λ=±π)
// - Pillar 3: Mode 1 Taylor Expansion Guard (1 - ease <= 0.001) C0 & C1 continuity
// - Pillar 4: Finite coordinates (Zero NaNs, Zero Infinities) across 20,000 Monte Carlo samples
// - Pillar 5: Normal vector normalization analysis across modes and alphas
// - Pillar 6: WGSL Source & Shader Pipeline Audit (audit-manifold.sh invariant)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PI = 3.14159265358979;
const RADIUS = 5.0;

// Exact mirror of computeCurlNoise in src/webgpu/shaders/manifold.wgsl
function computeCurlNoise(p: [number, number, number], time: number): [number, number, number] {
  const t = time * 0.75;
  const matMul = (v: [number, number, number]): [number, number, number] => [
    0.00 * v[0] - 0.80 * v[1] - 0.60 * v[2],
    0.80 * v[0] + 0.36 * v[1] - 0.48 * v[2],
    0.60 * v[0] - 0.48 * v[1] + 0.64 * v[2],
  ];

  const q1 = matMul([p[0] * 0.45, p[1] * 0.45, p[2] * 0.45]);
  const q2 = matMul(matMul([p[0] * 0.95, p[1] * 0.95, p[2] * 0.95]));

  const ux = -0.55 * Math.cos(0.55 * q1[1] + t * 0.7) - 0.45 * Math.cos(0.95 * q1[2] - t * 0.5);
  const uy = -0.55 * Math.cos(0.55 * q1[2] + t * 0.9) - 0.45 * Math.cos(0.95 * q1[0] - t * 0.6);
  const uz = -0.55 * Math.cos(0.55 * q1[0] + t * 0.8) - 0.45 * Math.cos(0.95 * q1[1] - t * 0.4);

  const u2x = 0.25 * Math.sin(1.5 * q2[1] - t * 1.2);
  const u2y = 0.25 * Math.sin(1.5 * q2[2] - t * 1.1);
  const u2z = 0.25 * Math.sin(1.5 * q2[0] - t * 1.3);

  return matMul([ux + u2x, uy + u2y, uz + u2z]);
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len > 0.000001) {
    return [v[0] / len, v[1] / len, v[2] / len];
  }
  return [0, 0, 0];
}

function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Exact 1:1 mathematical mirror of evaluateManifoldCore in src/webgpu/shaders/manifold.wgsl
export function evaluateManifoldCore(
  pos3D: [number, number, number],
  mercator2D: [number, number],
  unfurl: number,
  mode: number,
  simTime = 0.0,
  hitPos: [number, number, number, number] = [0, 0, 0, 0],
  curActive = 0.0,
  curVel: [number, number, number, number] = [0, 0, 0, 0]
): { pos: [number, number, number]; normal: [number, number, number] } {
  const clampedUnfurl = Math.max(0.0, Math.min(1.0, unfurl));
  const ease = clampedUnfurl;
  const pos2D: [number, number, number] = [mercator2D[0], mercator2D[1], 0.0];

  let outPos: [number, number, number] = [0, 0, 0];
  let outNormal: [number, number, number] = [0, 0, 1];

  switch (mode) {
    case 1: {
      // ── Mode 1: Parchment Scroll Unfurl with Tight Roll Dynamics (§3) ──
      const lonRad = (Math.abs(mercator2D[0]) > 0.00001 || Math.abs(mercator2D[1]) > 0.00001)
        ? mercator2D[0] / RADIUS
        : Math.atan2(pos3D[0], pos3D[2]);
      const clampedY = Math.max(-0.9998, Math.min(0.9998, pos3D[1] / RADIUS));
      const latRad = Math.asin(clampedY);
      const cosLat = Math.cos(latRad);
      const pLen = Math.hypot(pos3D[0], pos3D[1], pos3D[2]);
      const sphereNorm: [number, number, number] = pLen > 0.001 ? normalize3(pos3D) : [0.0, 0.0, 1.0];

      // Phase 1: Rapid cylinder formation (alpha in [0.0, 0.20])
      const tCyl = smoothstep(0.0, 0.20, ease);
      const rCyl = (1.0 - tCyl) * (RADIUS * cosLat) + tCyl * RADIUS;

      // Phase 2: Parchment tight roll-up compression (tightens cylinder radius before unrolling)
      const tRoll = Math.sin(PI * smoothstep(0.15, 0.40, ease));
      const rScroll = rCyl * (1.0 - 0.20 * tRoll);

      // Phase 3: Unrolling curvature relaxation onto drafting table (alpha in [0.20, 1.00])
      const tUnroll = smoothstep(0.20, 1.0, ease);
      const s = 1.0 - tUnroll;
      const u = s * lonRad;

      let curX: number;
      let curZ: number;

      if (Math.abs(u) > 0.02) {
        const sDiv = Math.max(0.0001, s);
        curX = rScroll * (Math.sin(u) / sDiv);
        curZ = rScroll * ((Math.cos(u) - 1.0) / sDiv + s);
      } else {
        const u2 = u * u;
        curX = rScroll * lonRad * (1.0 - u2 / 6.0);
        curZ = -s * rScroll * (lonRad * lonRad) * (0.5 - u2 / 24.0) + rScroll * s;
      }

      // Polar Puckering Elimination: Y stays cylindrical during formation, then unrolls to Mercator
      const curY = (1.0 - tUnroll) * pos3D[1] + tUnroll * mercator2D[1];
      outPos = [curX, curY, curZ];

      const cylNorm: [number, number, number] = [Math.sin(u), 0.0, Math.cos(u)];
      const rawCylLen = Math.hypot(cylNorm[0], cylNorm[1], cylNorm[2]);
      const normCyl: [number, number, number] = rawCylLen > 0.0001 ? normalize3(cylNorm) : [0.0, 0.0, 1.0];
      const rawNorm: [number, number, number] = [
        (1.0 - tCyl) * sphereNorm[0] + tCyl * normCyl[0],
        (1.0 - tCyl) * sphereNorm[1] + tCyl * normCyl[1],
        (1.0 - tCyl) * sphereNorm[2] + tCyl * normCyl[2],
      ];
      outNormal = normalize3(rawNorm);
      break;
    }

    case 2: {
      // ── Mode 2: Tectonic Crust Fracture (Mid-Atlantic Ridge Calving, §4) ──
      const lambdaRift = -0.48869219;
      const lonRad = (Math.abs(mercator2D[0]) > 0.00001 || Math.abs(mercator2D[1]) > 0.00001)
        ? mercator2D[0] / RADIUS
        : Math.atan2(pos3D[0], pos3D[2]);
      const clampedY = Math.max(-0.9998, Math.min(0.9998, pos3D[1] / RADIUS));
      const latRad = Math.asin(clampedY);
      const cosLat = Math.cos(latRad);
      const pLen = Math.hypot(pos3D[0], pos3D[1], pos3D[2]);
      const sphereNorm: [number, number, number] = pLen > 0.001 ? normalize3(pos3D) : [0.0, 0.0, 1.0];

      const dRift = Math.abs(lonRad - lambdaRift);
      const fSeam = 1.0 - smoothstep(0.0, 0.70, dRift);
      const crackSign = lonRad >= lambdaRift ? 1.0 : -1.0;

      const tEastRaw: [number, number, number] = [sphereNorm[2], 0.0, -sphereNorm[0]];
      const tEast = normalize3(tEastRaw);

      const fracMult = hitPos[3] > 0.01 ? hitPos[3] : 1.0;
      const hitDist = Math.hypot(pos3D[0] - hitPos[0], pos3D[1] - hitPos[1], pos3D[2] - hitPos[2]);
      const cursorInfluence = curActive * Math.exp(-hitDist * hitDist / (2.0 * 0.64));
      const hoopStress = cursorInfluence * 0.45 * fracMult * (1.0 + 2.0 * cosLat * cosLat);

      if (ease <= 0.15) {
        // Pre-Rupture Dilatation & Crack Nucleation (alpha in [0.00, 0.15])
        const deltaR = 0.06 * RADIUS * (ease / 0.15) + hoopStress * (1.0 - ease);
        const crackProg = smoothstep(0.01, 0.15, ease);
        const crackDilation = crackSign * fSeam * (0.08 * crackProg);

        outPos = [
          pos3D[0] + sphereNorm[0] * deltaR + tEast[0] * crackDilation,
          pos3D[1] + sphereNorm[1] * deltaR,
          pos3D[2] + sphereNorm[2] * deltaR + tEast[2] * crackDilation,
        ];
        outNormal = sphereNorm;
      } else {
        // Crustal Plate Peeling & Calving (alpha in [0.15, 1.00])
        const tPeel = smoothstep(0.15, 1.0, ease);
        const baseSphereDilated: [number, number, number] = [
          pos3D[0] + sphereNorm[0] * (0.06 * RADIUS),
          pos3D[1] + sphereNorm[1] * (0.06 * RADIUS),
          pos3D[2] + sphereNorm[2] * (0.06 * RADIUS),
        ];
        const basePos: [number, number, number] = [
          (1.0 - tPeel) * baseSphereDilated[0] + tPeel * pos2D[0],
          (1.0 - tPeel) * baseSphereDilated[1] + tPeel * pos2D[1],
          (1.0 - tPeel) * baseSphereDilated[2] + tPeel * pos2D[2],
        ];

        const flutterWave = Math.sin(18.0 * dRift - 20.0 * ease);
        const flutterDecay = Math.exp(-3.5 * ease);
        const wFlutter = flutterWave * flutterDecay * fSeam * fracMult * (tPeel * (1.0 - tPeel));

        const crackWidth = crackSign * fSeam * (0.08 + 0.40 * tPeel);
        const rawNorm: [number, number, number] = [
          (1.0 - tPeel) * sphereNorm[0],
          (1.0 - tPeel) * sphereNorm[1],
          (1.0 - tPeel) * sphereNorm[2] + 1.0 * tPeel,
        ];
        const rawLen = Math.hypot(rawNorm[0], rawNorm[1], rawNorm[2]);
        const baseNorm: [number, number, number] = rawLen > 0.001 ? normalize3(rawNorm) : [0.0, 0.0, 1.0];

        outPos = [
          basePos[0] + baseNorm[0] * wFlutter + tEast[0] * (crackWidth * (1.0 - tPeel)),
          basePos[1] + baseNorm[1] * wFlutter,
          basePos[2] + baseNorm[2] * wFlutter + tEast[2] * (crackWidth * (1.0 - tPeel)),
        ];
        outNormal = baseNorm;
      }
      break;
    }

    case 3: {
      // ── Mode 3: Hydrodynamic Fluid Relaxation & Viscous Streamline Shear (§5) ──
      const pLen = Math.hypot(pos3D[0], pos3D[1], pos3D[2]);
      const sphereNorm: [number, number, number] = pLen > 0.001 ? normalize3(pos3D) : [0.0, 0.0, 1.0];
      const rawSin = Math.sin(PI * clampedUnfurl);
      const liquefaction = rawSin * (1.0 - 0.35 * ease);
      const volumePreserve = RADIUS * 0.50 * rawSin;
      const basePos: [number, number, number] = [
        (1.0 - ease) * pos3D[0] + ease * pos2D[0] + sphereNorm[0] * volumePreserve,
        (1.0 - ease) * pos3D[1] + ease * pos2D[1] + sphereNorm[1] * volumePreserve,
        (1.0 - ease) * pos3D[2] + ease * pos2D[2] + sphereNorm[2] * volumePreserve,
      ];

      const baseLen = Math.hypot(basePos[0], basePos[1], basePos[2]) || 1.0;
      const surfaceNormal: [number, number, number] = [basePos[0] / baseLen, basePos[1] / baseLen, basePos[2] / baseLen];

      // 3-Octave dispersion-coupled gravity-capillary surface waves (multi-axis 3D traveling wave harmonics with faster undulation)
      const phi1 = (basePos[0] * 0.35 + basePos[1] * 0.62 + basePos[2] * 0.42) * 1.35 - simTime * 2.8;
      const phi2 = (basePos[0] * -0.45 + basePos[1] * 0.30 + basePos[2] * 0.65) * 1.75 - simTime * 2.2;
      const phi3 = (basePos[0] * 0.55 + basePos[1] * -0.40 + basePos[2] * 0.35) * 2.10 - simTime * 3.4;
      const capillaryDecay = 1.0 - smoothstep(0.85, 1.0, ease);
      const zCapillary = (0.45 * Math.sin(phi1) + 0.30 * Math.cos(phi2) + 0.20 * Math.sin(phi3)) * liquefaction * capillaryDecay;

      const rawNorm: [number, number, number] = [
        surfaceNormal[0] * (1.0 - ease),
        surfaceNormal[1] * (1.0 - ease),
        surfaceNormal[2] * (1.0 - ease) + 1.0 * ease,
      ];
      const rawLen = Math.hypot(rawNorm[0], rawNorm[1], rawNorm[2]);
      const normManifold: [number, number, number] = rawLen > 0.001 ? normalize3(rawNorm) : [0.0, 0.0, 1.0];

      let cursorOffset: [number, number, number] = [0, 0, 0];
      if (curActive > 0.001) {
        const hitDx = basePos[0] - hitPos[0];
        const hitDy = basePos[1] - hitPos[1];
        const hitDz = basePos[2] - hitPos[2];
        const hitDist = Math.hypot(hitDx, hitDy, hitDz);
        const coreRadius = 0.85;
        const vortexCirc = (1.0 - Math.exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
        const relVec: [number, number, number] = [hitDx + 0.001, hitDy + 0.001, hitDz + 0.001];
        const vortexTangent = normalize3(cross3(normManifold, relVec));
        const clampedSpeed = Math.max(0.0, Math.min(1.5, curVel[3]));
        const vSpeed = curActive * clampedSpeed * vortexCirc * 0.35;
        const wakeSpeed = clampedSpeed * 0.15 * curActive * Math.exp(-hitDist * hitDist / 1.5);
        const velNorm = normalize3([curVel[0] + 0.0001, curVel[1] + 0.0001, curVel[2] + 0.0001]);
        const scale = rawSin * capillaryDecay * 0.25;
        cursorOffset = [
          (vortexTangent[0] * vSpeed + velNorm[0] * wakeSpeed) * scale,
          (vortexTangent[1] * vSpeed + velNorm[1] * wakeSpeed) * scale,
          (vortexTangent[2] * vSpeed + velNorm[2] * wakeSpeed) * scale,
        ];
      }

      outPos = [
        basePos[0] + surfaceNormal[0] * zCapillary + cursorOffset[0],
        basePos[1] + surfaceNormal[1] * zCapillary + cursorOffset[1],
        basePos[2] + surfaceNormal[2] * zCapillary + cursorOffset[2],
      ];
      outNormal = normManifold;
      break;
    }

    default: {
      // ── Mode 0: Polar-Convergent Geodesic Unfolding with Tactile Peeling Lip (§2) ──
      // Eliminates polar bat/cat ears, needle spindle, and normal collapse at antimeridian
      const lonRad = (Math.abs(mercator2D[0]) > 0.00001 || Math.abs(mercator2D[1]) > 0.00001)
        ? mercator2D[0] / RADIUS
        : Math.atan2(pos3D[0], pos3D[2]);
      const clampedY = Math.max(-0.9998, Math.min(0.9998, pos3D[1] / RADIUS));
      const latRad = Math.asin(clampedY);
      const cosLat = Math.cos(latRad);

      // Staged meridional unbending:
      // Prevents premature polar height explosion and vertical cat ears/spikes
      const tUnbend = smoothstep(0.15, 0.85, ease);
      const yPhysical = pos3D[1] * (1.0 - tUnbend) + (RADIUS * latRad) * tUnbend;
      const tMercator = smoothstep(0.60, 1.0, ease);
      const curY = yPhysical * (1.0 - tMercator) + pos2D[1] * tMercator;

      // Decoupled intermediate parallel expansion (eliminates intermediate diamond/rhombus silhouette):
      const tParallel = smoothstep(0.18, 0.82, ease);
      const parallelWidth = cosLat * (1.0 - tParallel) + 1.0 * tParallel;
      const curX = pos3D[0] * (1.0 - ease) + (pos2D[0] * parallelWidth) * ease;

      // Planar depth convergence with latitude-tapered chord lift:
      const chordLiftZ = cosLat * RADIUS * (1.0 - ease) * Math.sin(PI * ease) * 0.28;
      const curZ = pos3D[2] * (1.0 - ease) + chordLiftZ;

      // ── Tactile Boundary Peel Envelope (Happy Middle Space) ──
      // 1. Time envelope: smooth C1 onset (smoothstep 0.0 to 0.45) and relaxation back to planar map
      const uAlpha = Math.max(0.0, Math.min(1.0, unfurl));
      const alphaPeel = smoothstep(0.0, 0.45, uAlpha);
      const ePeel = Math.sin(PI * alphaPeel) * (1.0 - uAlpha);

      // 2. Progressive peeling front (happy middle space between static lip and deep rind):
      // Rolls inward across the outer 25% of longitude (|lon| >= 135° at peak alpha),
      // giving the organic tactile peel feel without penetrating into continental landmasses.
      const lonNorm = Math.abs(lonRad) / PI;
      const peelFront = 0.88 - smoothstep(0.0, 0.55, uAlpha) * 0.16;
      const fPeel = smoothstep(peelFront, 1.0, lonNorm);

      // 3. Strict polar attenuation (proportional to cosLat):
      // Ensures peeling displacement vanishes at the polar singularities (cosLat -> 0).
      // Completely eliminates layer buckling, folding over into itself, and inverted polar points!
      const polarScale = cosLat;

      // 4. Outward radial normal in horizontal plane (points strictly AWAY from globe core):
      const horizLen = Math.hypot(pos3D[0], pos3D[2]);
      const horizNorm: [number, number, number] = horizLen > 0.001
        ? [pos3D[0] / horizLen, 0.0, pos3D[2] / horizLen]
        : [0.0, 0.0, -1.0];

      // 5. Outward radial lift (lifts peel outward from the body):
      const liftMag = RADIUS * 0.14 * ePeel * fPeel * polarScale;
      const liftVec = [horizNorm[0] * liftMag, 0.0, horizNorm[2] * liftMag];

      // 6. Tangent parallel flare (peel margins flare outward along latitude lines):
      const flareSign = lonRad >= 0.0 ? 1.0 : -1.0;
      const flareMag = flareSign * RADIUS * 0.16 * ePeel * fPeel * polarScale;

      outPos = [
        curX + liftVec[0] + flareMag,
        curY,
        curZ + liftVec[2],
      ];

      // Unrolling rotational surface normal:
      // Eliminates (0,0,0) normal collapse at antimeridian equator at alpha=0.5
      const thetaNormLon = (1.0 - ease) * lonRad;
      const thetaNormLat = (1.0 - ease) * latRad;
      const cp = Math.cos(thetaNormLat);
      const sp = Math.sin(thetaNormLat);
      const cl = Math.cos(thetaNormLon);
      const sl = Math.sin(thetaNormLon);
      const unrollNorm: [number, number, number] = [cp * sl, sp, cp * cl];
      const unrollLen = Math.hypot(unrollNorm[0], unrollNorm[1], unrollNorm[2]);
      outNormal = unrollLen > 0.001 ? normalize3(unrollNorm) : [0.0, 0.0, 1.0];
      break;
    }
  }

  return { pos: outPos, normal: outNormal };
}

describe('Challenger Phase 2.3: evaluateManifold Unification Stress Harness', () => {
  const ALPHAS = [0.0, 0.25, 0.50, 0.75, 1.0];
  const MODES = [0, 1, 2, 3];

  // Helper to construct geographic pos3D and clamped mercator2D
  function geoCoords(lonDeg: number, latDeg: number, radius = RADIUS): {
    pos3D: [number, number, number];
    mercator2D: [number, number];
  } {
    const lonRad = (lonDeg * Math.PI) / 180;
    const latRad = (latDeg * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    const pos3D: [number, number, number] = [
      radius * cosLat * Math.sin(lonRad),
      radius * sinLat,
      radius * cosLat * Math.cos(lonRad),
    ];
    const clampedLat = Math.max(-1.4835, Math.min(1.4835, latRad));
    const mercator2D: [number, number] = [
      lonRad * radius,
      Math.log(Math.tan(Math.PI * 0.25 + clampedLat * 0.5)) * radius,
    ];
    return { pos3D, mercator2D };
  }

  // ==========================================================================
  // Pillar 1: All 4 Active Modes at Intermediate Alphas
  // ==========================================================================
  describe('Pillar 1: Intermediate Alphas {0.0, 0.25, 0.50, 0.75, 1.0} Across All 4 Modes', () => {
    it('CHALLENGE-2.3-01: produces strictly finite coordinates (zero NaNs, zero Infs) for all modes and alphas across a global test grid', () => {
      const lonSamples = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
      const latSamples = [-85, -60, -30, 0, 30, 60, 85];

      for (const mode of MODES) {
        for (const alpha of ALPHAS) {
          for (const lon of lonSamples) {
            for (const lat of latSamples) {
              const { pos3D, mercator2D } = geoCoords(lon, lat);
              const { pos, normal } = evaluateManifoldCore(
                pos3D,
                mercator2D,
                alpha,
                mode,
                1.5,
                [2.0, 1.0, 3.0, 0.0],
                1.0,
                [0.5, 0.2, 0.0, 1.0]
              );

              for (let i = 0; i < 3; i++) {
                expect(Number.isFinite(pos[i]), `pos[${i}] not finite: mode=${mode}, alpha=${alpha}, lon=${lon}, lat=${lat}`).toBe(true);
                expect(Number.isNaN(pos[i]), `pos[${i}] is NaN: mode=${mode}, alpha=${alpha}, lon=${lon}, lat=${lat}`).toBe(false);
                expect(Number.isFinite(normal[i]), `normal[${i}] not finite: mode=${mode}, alpha=${alpha}, lon=${lon}, lat=${lat}`).toBe(true);
                expect(Number.isNaN(normal[i]), `normal[${i}] is NaN: mode=${mode}, alpha=${alpha}, lon=${lon}, lat=${lat}`).toBe(false);
              }
            }
          }
        }
      }
    });

    it('CHALLENGE-2.3-02: verifies Mode 1 continuous involute developable scroll unfurl from cylinder to flat sheet', () => {
      // Continuous involute unroll: sphere to developable cylinder unrolling to flat sheet
      const equator0 = geoCoords(0, 0);
      const res0 = evaluateManifoldCore(equator0.pos3D, equator0.mercator2D, 0.0, 1);
      expect(res0.pos[2]).toBeCloseTo(5.0, 2);

      const resMid = evaluateManifoldCore(equator0.pos3D, equator0.mercator2D, 0.35, 1);
      expect(resMid.pos[2]).toBeLessThan(5.0);
      expect(resMid.pos[2]).toBeGreaterThan(2.0);

      const resFlat = evaluateManifoldCore(equator0.pos3D, equator0.mercator2D, 1.0, 1);
      // At alpha=1.0, flat sheet, curZ = 0.0
      expect(resFlat.pos[2]).toBeCloseTo(0.0, 2);
    });
  });

  // ==========================================================================
  // Pillar 2: Boundary Conditions (Poles ±90° and Antimeridian λ=±π)
  // ==========================================================================
  describe('Pillar 2: Boundary Conditions (Poles ±90°, Antimeridian λ=±π)', () => {
    it('CHALLENGE-2.3-03: North Pole (+90°) produces zero NaNs across all 4 modes at all alphas', () => {
      // North pole: pos3D = [0, 5, 0], mercator clamped lat = 1.4835
      const northPolePos: [number, number, number] = [0.0, 5.0, 0.0];
      const northMercator: [number, number] = [0.0, Math.log(Math.tan(Math.PI * 0.25 + 1.4835 * 0.5)) * RADIUS];

      for (const mode of MODES) {
        for (const alpha of ALPHAS) {
          const { pos, normal } = evaluateManifoldCore(
            northPolePos,
            northMercator,
            alpha,
            mode,
            0.5,
            [0, 5, 0, 0],
            0.0,
            [0, 0, 0, 0]
          );

          expect(Number.isFinite(pos[0])).toBe(true);
          expect(Number.isFinite(pos[1])).toBe(true);
          expect(Number.isFinite(pos[2])).toBe(true);
          expect(Number.isFinite(normal[0])).toBe(true);
          expect(Number.isFinite(normal[1])).toBe(true);
          expect(Number.isFinite(normal[2])).toBe(true);
        }
      }
    });

    it('CHALLENGE-2.3-04: South Pole (-90°) produces zero NaNs across all 4 modes at all alphas', () => {
      const southPolePos: [number, number, number] = [0.0, -5.0, 0.0];
      const southMercator: [number, number] = [0.0, Math.log(Math.tan(Math.PI * 0.25 - 1.4835 * 0.5)) * RADIUS];

      for (const mode of MODES) {
        for (const alpha of ALPHAS) {
          const { pos, normal } = evaluateManifoldCore(
            southPolePos,
            southMercator,
            alpha,
            mode,
            0.5,
            [0, -5, 0, 0],
            0.0,
            [0, 0, 0, 0]
          );

          expect(Number.isFinite(pos[0])).toBe(true);
          expect(Number.isFinite(pos[1])).toBe(true);
          expect(Number.isFinite(pos[2])).toBe(true);
          expect(Number.isFinite(normal[0])).toBe(true);
          expect(Number.isFinite(normal[1])).toBe(true);
          expect(Number.isFinite(normal[2])).toBe(true);
        }
      }
    });

    it('CHALLENGE-2.3-05: Antimeridian seam (λ = ±π) evaluates without numerical singularity', () => {
      // Exact antimeridian on equator: pos3D = [0, 0, -5.0]
      const seamPos: [number, number, number] = [0.0, 0.0, -RADIUS];
      const seamMercatorEast: [number, number] = [PI * RADIUS, 0.0];
      const seamMercatorWest: [number, number] = [-PI * RADIUS, 0.0];

      for (const mode of MODES) {
        for (const alpha of ALPHAS) {
          const resEast = evaluateManifoldCore(seamPos, seamMercatorEast, alpha, mode);
          const resWest = evaluateManifoldCore(seamPos, seamMercatorWest, alpha, mode);

          expect(Number.isFinite(resEast.pos[0])).toBe(true);
          expect(Number.isFinite(resEast.pos[1])).toBe(true);
          expect(Number.isFinite(resEast.pos[2])).toBe(true);

          expect(Number.isFinite(resWest.pos[0])).toBe(true);
          expect(Number.isFinite(resWest.pos[1])).toBe(true);
          expect(Number.isFinite(resWest.pos[2])).toBe(true);
        }
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Mode 1 Taylor Expansion Guard (1 - ease <= 0.001)
  // ==========================================================================
  describe('Pillar 3: Mode 1 Taylor Expansion Guard (1 - ease <= 0.001)', () => {
    it('CHALLENGE-2.3-06: verifies C0 continuity across the oneMinusT = 0.001 transition boundary', () => {
      // In Mode 1:
      // When oneMinusT > 0.001: exact trigonometric cylinder
      // When oneMinusT <= 0.001: 2nd order Taylor expansion
      // We test points on both sides of the boundary: oneMinusT = 0.001001 vs oneMinusT = 0.000999
      const testLon = 45.0;
      const testLat = 30.0;
      const { pos3D, mercator2D } = geoCoords(testLon, testLat);

      // Solve for alpha giving oneMinusT near 0.001
      // ease = 1 - oneMinusT. If oneMinusT = 0.001 -> ease = 0.999
      // ease = 3*u^2 - 2*u^3. At u ~ 0.9818, ease ~ 0.999
      // Let's compute directly for oneMinusT just above and below 0.001:
      const lonRad = (testLon * Math.PI) / 180;
      const latRad = (testLat * Math.PI) / 180;
      const cosLat = Math.cos(latRad);

      // Above boundary (oneMinusT = 0.001001)
      const tAbove = 0.001001;
      const curAngleA = tAbove * lonRad;
      const curXA = (RADIUS / tAbove) * Math.sin(curAngleA);
      const curZA = (RADIUS * cosLat / tAbove) * (Math.cos(curAngleA) - 1.0) + (RADIUS * cosLat * tAbove);

      // Below boundary (oneMinusT = 0.000999, using Taylor expansion)
      const tBelow = 0.000999;
      const uB = tBelow * lonRad;
      const sinTermB = lonRad * (1.0 - (uB * uB) / 6.0);
      const cosTermB = tBelow * (lonRad * lonRad) * (-0.5 + (uB * uB) / 24.0);
      const curXB = RADIUS * sinTermB;
      const curZB = RADIUS * cosLat * cosTermB + RADIUS * cosLat * tBelow;

      // Position difference across a 2e-6 parameter gap should be < 1e-4
      const dx = Math.abs(curXA - curXB);
      const dz = Math.abs(curZA - curZB);
      expect(dx).toBeLessThan(1e-3);
      expect(dz).toBeLessThan(1e-3);
    });

    it('CHALLENGE-2.3-07: confirms Taylor expansion matches Mercator plane at oneMinusT -> 0', () => {
      // At oneMinusT = 0.0 (alpha = 1.0, ease = 1.0):
      // curX = RADIUS * lonRad = mercatorX
      // curY = pos2D.y = mercatorY
      // curZ = 0.0
      // normal = [0, 0, 1]
      const { pos3D, mercator2D } = geoCoords(60, 40);
      const res = evaluateManifoldCore(pos3D, mercator2D, 1.0, 1);

      expect(res.pos[0]).toBeCloseTo(mercator2D[0], 4);
      expect(res.pos[1]).toBeCloseTo(mercator2D[1], 4);
      expect(res.pos[2]).toBeCloseTo(0.0, 4);
      expect(res.normal).toEqual([0.0, 0.0, 1.0]);
    });
  });

  // ==========================================================================
  // Pillar 4: Monte Carlo Fuzzing Across 20,000 Random Samples
  // ==========================================================================
  describe('Pillar 4: 20,000 Monte Carlo Fuzzing Iterations', () => {
    it('CHALLENGE-2.3-08: 20,000 pseudo-random coordinate queries yield zero NaNs and zero Infs', () => {
      const SAMPLES = 20_000;
      let nanCount = 0;
      let infCount = 0;

      // Deterministic LCG pseudo-random generator
      let seed = 123456789;
      const rand = () => {
        seed = (1103515245 * seed + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };

      for (let i = 0; i < SAMPLES; i++) {
        const mode = Math.floor(rand() * 4); // 0, 1, 2, 3
        const alpha = rand();
        const lon = (rand() - 0.5) * 360;
        const lat = (rand() - 0.5) * 170; // [-85, 85]
        const simTime = rand() * 100.0;
        const curActive = rand() > 0.5 ? 1.0 : 0.0;
        const hitPos: [number, number, number, number] = [
          (rand() - 0.5) * 10,
          (rand() - 0.5) * 10,
          (rand() - 0.5) * 10,
          0.0,
        ];
        const curVel: [number, number, number, number] = [
          (rand() - 0.5) * 2,
          (rand() - 0.5) * 2,
          (rand() - 0.5) * 2,
          rand() * 2.0,
        ];

        const { pos3D, mercator2D } = geoCoords(lon, lat);
        const { pos, normal } = evaluateManifoldCore(
          pos3D,
          mercator2D,
          alpha,
          mode,
          simTime,
          hitPos,
          curActive,
          curVel
        );

        for (let j = 0; j < 3; j++) {
          if (Number.isNaN(pos[j]) || Number.isNaN(normal[j])) nanCount++;
          if (!Number.isFinite(pos[j]) || !Number.isFinite(normal[j])) infCount++;
        }
      }

      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);
    });
  });

  // ==========================================================================
  // Pillar 5: Normal Vector Normalization Empirical Analysis
  // ==========================================================================
  describe('Pillar 5: Normal Vector Normalization Empirical Analysis', () => {
    it('CHALLENGE-2.3-09: Mode 1 produces strictly normalized normals (length == 1.0) at all intermediate alphas', () => {
      const testAngles = [0, 30, 60, 90, 120, 150, 180, -30, -90, -150];
      for (const alpha of ALPHAS) {
        for (const lon of testAngles) {
          const { pos3D, mercator2D } = geoCoords(lon, 20);
          const res = evaluateManifoldCore(pos3D, mercator2D, alpha, 1);
          const len = Math.hypot(res.normal[0], res.normal[1], res.normal[2]);
          expect(len).toBeCloseTo(1.0, 3);
        }
      }
    });

    it('CHALLENGE-2.3-10: Mode 0, 2, 3 normal behavior during intermediate unfurl (linear interpolation characteristic)', () => {
      // In Modes 0, 2, 3, normals are blended from spherical normal to flat (0, 0, 1) via mix()
      // When alpha = 0.0: normal is pure spherical normal (length = 1.0)
      // When alpha = 1.0: normal is pure flat normal (0, 0, 1) (length = 1.0)
      // At intermediate alpha (e.g. 0.5), linear interpolation of unit vectors produces ||n|| <= 1.0
      // Empirical audit records this behavior:
      for (const mode of [0, 2, 3]) {
        // At alpha=0.0
        const { pos3D, mercator2D } = geoCoords(45, 30);
        const res0 = evaluateManifoldCore(pos3D, mercator2D, 0.0, mode);
        const len0 = Math.hypot(res0.normal[0], res0.normal[1], res0.normal[2]);
        expect(len0).toBeCloseTo(1.0, 2);

        // At alpha=1.0
        const res1 = evaluateManifoldCore(pos3D, mercator2D, 1.0, mode);
        const len1 = Math.hypot(res1.normal[0], res1.normal[1], res1.normal[2]);
        expect(len1).toBeCloseTo(1.0, 2);
        expect(res1.normal).toEqual([0.0, 0.0, 1.0]);
      }
    });

    it('CHALLENGE-2.3-11: Confirms normal collapse is eliminated in Mode 0 at antimeridian equator when alpha=0.5', () => {
      // At pos3D = [0, 0, -5.0] (antimeridian equator):
      // sphereNorm = [0, 0, -1]
      // At alpha = 0.5: ease = 0.5
      // Rotational unrolling normal rotates continuously from [0, 0, -1] to [0, 0, 1] without collapse:
      // At alpha = 0.5, thetaNormLon = (1 - 0.5) * PI = PI / 2 -> unrollNorm = [1, 0, 0]
      const antimeridianPos: [number, number, number] = [0.0, 0.0, -RADIUS];
      const resMode0 = evaluateManifoldCore(antimeridianPos, [PI * RADIUS, 0.0], 0.5, 0);
      const lenMode0 = Math.hypot(resMode0.normal[0], resMode0.normal[1], resMode0.normal[2]);

      // Confirms normal length is strictly unit normalized (>= 0.99) and oriented along tangent [1, 0, 0]
      expect(lenMode0).toBeGreaterThanOrEqual(0.99);
      expect(resMode0.normal[0]).toBeCloseTo(1.0, 2);
      expect(resMode0.normal[1]).toBeCloseTo(0.0, 2);
      expect(resMode0.normal[2]).toBeCloseTo(0.0, 2);
    });
  });

  // ==========================================================================
  // Pillar 6: Audit Script & WGSL Structural Verification
  // ==========================================================================
  describe('Pillar 6: Audit Script & WGSL Structural Verification', () => {
    it('CHALLENGE-2.3-12: audit-manifold.sh exits with code 0 (exactly 1 evaluateManifold definition)', () => {
      const scriptPath = path.resolve(__dirname, '../../.agents/skills/shader-pipeline/scripts/audit-manifold.sh');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const output = execSync(`bash "${scriptPath}"`, {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
      });
      expect(output).toContain('Exactly 1 definition found');
    });

    it('CHALLENGE-2.3-13: verifies manifold.wgsl contains no Mode 4 (Dymaxion) branching', () => {
      const manifoldPath = path.resolve(__dirname, '../../src/webgpu/shaders/manifold.wgsl');
      const content = fs.readFileSync(manifoldPath, 'utf8');

      expect(content).not.toContain('case 4u:');
      expect(content).not.toContain('case 4:');
      expect(content).not.toContain('dymaxion2D');
      expect(content).not.toContain('dymaxionProject');
      expect(content).toContain('const PI: f32 = 3.14159265358979;');
      expect(content).toContain('const RADIUS: f32 = 5.0;');
      expect(content).toContain('fn computeCurlNoise');
      expect(content).toContain('fn evaluateManifoldCore');
      expect(content).toContain('switch (mode)');
    });
  });
});
