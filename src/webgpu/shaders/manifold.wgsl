// ============================================================================
// File: src/webgpu/shaders/manifold.wgsl
// Target: Unified Manifold Kinematics & Solenoidal Vector Noise
// Authoritative Reference: SHADERS_SPEC_LEDGER.md §3
// Dispatches: Mode 0 (Linear), Mode 1 (Cylindrical), Mode 2 (LEFM), Mode 3 (Fluid)
// Modes 0..3 active; 4-mode architecture.
// ============================================================================

const PI: f32 = 3.14159265358979;
const RADIUS: f32 = 5.0;

// Analytical 3D Solenoidal Vector Field (div u = 0 guaranteed, zero Cartesian lattice)
// Canonical implementation extracted from physics_sim.wgsl & crust_hydrosphere.wgsl
fn computeCurlNoise(p: vec3<f32>, time: f32) -> vec3<f32> {
    let t: f32 = time * 0.75;
    
    let rot = mat3x3<f32>(
        vec3<f32>(0.00,  0.80,  0.60),
        vec3<f32>(-0.80, 0.36, -0.48),
        vec3<f32>(-0.60, -0.48, 0.64)
    );
    let rotT = transpose(rot);

    let q1 = rot * (p * 0.45);
    let q2 = rot * (rot * (p * 0.95));

    let ux = -0.55 * cos(0.55 * q1.y + t * 0.7) - 0.45 * cos(0.95 * q1.z - t * 0.5);
    let uy = -0.55 * cos(0.55 * q1.z + t * 0.9) - 0.45 * cos(0.95 * q1.x - t * 0.6);
    let uz = -0.55 * cos(0.55 * q1.x + t * 0.8) - 0.45 * cos(0.95 * q1.y - t * 0.4);

    let u2x = 0.25 * sin(1.5 * q2.y - t * 1.2);
    let u2y = 0.25 * sin(1.5 * q2.z - t * 1.1);
    let u2z = 0.25 * sin(1.5 * q2.x - t * 1.3);

    let out1 = rotT * vec3<f32>(ux, uy, uz);
    let out2 = rotT * (rotT * vec3<f32>(u2x, u2y, u2z));

    return out1 + out2;
}

struct DeformedVertex {
    pos: vec3<f32>,
    normal: vec3<f32>,
};

// Unified manifold deformation core evaluating Modes 0..3
fn evaluateManifoldCore(
    pos3D: vec3<f32>,
    mercator2D: vec2<f32>,
    unfurl: f32,
    mode: u32,
    simTime: f32,
    hitPos: vec4<f32>,
    curActive: f32,
    curVel: vec4<f32>,
) -> DeformedVertex {
    let clampedUnfurl = clamp(unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);
    var out: DeformedVertex;
    let pos2D = vec3<f32>(mercator2D.x, mercator2D.y, 0.0);

    // Rule 21 & Rule 28 compliance: switch dispatch prevents source-scanning regex collisions
    switch (mode) {
        case 1u: {
            // ── Mode 1: Cylindrical Scroll Unfurl ──────────────────────────
            let oneMinusT = 1.0 - ease;
            let lonRad = atan2(pos3D.x, pos3D.z);
            let latRad = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
            let cosLat = cos(latRad);
            let sinLat = sin(latRad);

            if (oneMinusT > 0.001) {
                let invOneMinusT = 1.0 / oneMinusT;
                let curAngle = oneMinusT * lonRad;
                let curX = (RADIUS * invOneMinusT) * sin(curAngle);
                let curZ = (RADIUS * cosLat * invOneMinusT) * (cos(curAngle) - 1.0)
                         + (RADIUS * cosLat * oneMinusT);
                let curY = mix(pos3D.y, pos2D.y, ease);
                out.pos = vec3<f32>(curX, curY, curZ);

                // Analytical normal via tangent-frame cross product
                let T_lambda = vec3<f32>(
                    RADIUS * cos(curAngle),
                    0.0,
                    -RADIUS * cosLat * sin(curAngle)
                );
                let T_phi = vec3<f32>(
                    0.0,
                    mix(RADIUS * cosLat, RADIUS / max(cosLat, 0.05), ease),
                    -RADIUS * sinLat * invOneMinusT * (cos(curAngle) - 1.0)
                        - RADIUS * sinLat * oneMinusT
                );
                let rawNorm = cross(T_lambda, T_phi);
                out.normal = select(normalize(pos3D), normalize(rawNorm),
                                    length(rawNorm) > 0.0001);
            } else {
                // Taylor expansion guard near oneMinusT <= 0.001 (sinc limit)
                let u = oneMinusT * lonRad;
                let sinTerm = lonRad * (1.0 - (u * u) / 6.0);
                let cosTerm = oneMinusT * (lonRad * lonRad) * (-0.5 + (u * u) / 24.0);
                let curX = RADIUS * sinTerm;
                let curZ = RADIUS * cosLat * cosTerm + RADIUS * cosLat * oneMinusT;
                let curY = mix(pos3D.y, pos2D.y, ease);
                out.pos = vec3<f32>(curX, curY, curZ);
                out.normal = vec3<f32>(0.0, 0.0, 1.0);
            }
        }

        case 2u: {
            // ── Mode 2: Griffith Linear Elastic Fracture Mechanics ─────────
            let lonRad = atan2(pos3D.x, pos3D.z);
            let latRad = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
            let distToSeam = PI - abs(lonRad);
            let seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
            let tRupture: f32 = 0.18;

            let fracMult = select(1.0, hitPos.w, hitPos.w > 0.01);
            let hitDist = length(pos3D - hitPos.xyz);
            let cursorInfluence = curActive * exp(-hitDist * hitDist / (2.0 * 0.64));
            let hoopStress = cursorInfluence * 0.45 * fracMult
                           * (1.0 + 2.0 * cos(latRad) * cos(latRad));

            if (ease < tRupture) {
                let strainProgress = ease / tRupture;
                let localStrain = seamFactor * strainProgress
                                * max(0.2, cos(latRad * 0.85)) + hoopStress;
                out.pos = pos3D + normalize(pos3D) * (localStrain * 0.30);
                out.normal = normalize(out.pos);
            } else {
                let postRuptureT = smoothstep(tRupture, 1.0, ease);
                let flutterWave = sin(distToSeam * 16.0 - ease * 24.0);
                let flutterDecay = exp(-4.2 * (ease - tRupture));
                let flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20)
                               * flutterWave * flutterDecay * fracMult;
                out.pos = mix(pos3D, pos2D, postRuptureT)
                        + vec3<f32>(0.0, 0.0, flutterAmp);
                out.normal = mix(normalize(pos3D), vec3<f32>(0.0, 0.0, 1.0),
                                 postRuptureT);
            }
        }

        case 3u: {
            // ── Mode 3: Fluid Advection & Lamb-Oseen Vortex Wake ──────────
            let rawSin = sin(PI * clampedUnfurl);
            let liquefaction = pow(max(0.0, rawSin), 1.15);
            let unElevatedSphere = normalize(pos3D) * RADIUS;
            let basePos = mix(unElevatedSphere, pos2D, ease);
            let naturalVel = computeCurlNoise(basePos, simTime);

            let hitDist = length(basePos - hitPos.xyz);
            let coreRadius: f32 = 0.85;
            let vortexCirc = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius)))
                           / (hitDist + 0.05);
            let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0),
                                       normalize(basePos),
                                       length(basePos) > 0.001);
            let vortexTangent = normalize(cross(surfaceNormal,
                                                basePos - hitPos.xyz + vec3<f32>(0.001)));
            let clampedSpeed = clamp(curVel.w, 0.0, 1.5);
            let vortexVelocity = vortexTangent
                               * (curActive * clampedSpeed * vortexCirc * 0.35);
            let wakeAdvection = normalize(curVel.xyz + vec3<f32>(0.0001))
                              * (clampedSpeed * 0.15 * curActive
                                 * exp(-hitDist * hitDist / 1.5));

            let wavePhase1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35
                           - simTime * 1.25;
            let wavePhase2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75
                           - simTime * 0.90;
            let silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35)
                         * liquefaction * 0.65;
            let silkDrape = surfaceNormal * silkWave;

            let advectionOffset = naturalVel * (liquefaction * 1.55)
                                + silkDrape
                                + (vortexVelocity + wakeAdvection)
                                  * (curActive * 0.25);
            out.pos = basePos + advectionOffset + surfaceNormal * 0.015;
            out.normal = mix(normalize(unElevatedSphere + silkDrape * 0.5),
                             vec3<f32>(0.0, 0.0, 1.0), ease);
        }

        default: {
            // ── Mode 0: Spheroidal Metric Dilation (Default) ──────────────
            // Eliminates polar pinched gourd collapse during unfurling by continuously
            // dilating latitude parallels as K -> 0 (sphere to cylinder transition).
            let lonRad = atan2(pos3D.x, pos3D.z);
            let latRad = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
            let cosLat = max(cos(latRad), 0.02);
            
            // Continuous spheroidal dilation factor: as ease -> 1, parallels expand
            // smoothly from sphere (cosLat) to cylinder (1.0), maintaining convex curvature
            let dilation = pow(1.0 / cosLat, ease);
            
            let dilatedPos3D = vec3<f32>(
                pos3D.x * dilation,
                pos3D.y,
                pos3D.z * dilation
            );
            
            // z-depth flattens continuously with (1.0 - ease)
            let curZ = dilatedPos3D.z * (1.0 - ease);
            let curX = mix(dilatedPos3D.x, pos2D.x, ease);
            let curY = mix(pos3D.y, pos2D.y, ease);
            
            out.pos = vec3<f32>(curX, curY, curZ);
            
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0),
                                    normalize(pos3D),
                                    length(pos3D) > 0.001);
            let mixedNorm = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), ease);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0),
                                normalize(mixedNorm),
                                length(mixedNorm) > 0.0001);
        }
    }

    return out;
}
