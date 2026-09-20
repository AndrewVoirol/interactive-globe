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

// ----------------------------------------------------------------------------
// Horizon Limb Falloff Specification (§1)
// ----------------------------------------------------------------------------
fn horizonFalloff(facing: f32, tau: f32, killEdge0: f32, killEdge1: f32) -> f32 {
    let maxPath: f32 = 12.5; // ≈ sqrt(π·X/2) for engine atmosphere
    let path = min(1.0 / max(facing, 1.0 / maxPath), maxPath);
    let transmission = exp(-tau * path);
    let killTerm = smoothstep(killEdge0, killEdge1, facing);
    return transmission * killTerm;
}

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
    let ease = clampedUnfurl;
    var out: DeformedVertex;
    let pos2D = vec3<f32>(mercator2D.x, mercator2D.y, 0.0);

    // Rule 21 & Rule 28 compliance: switch dispatch prevents source-scanning regex collisions
    switch (mode) {
        case 1u: {
            // ── Mode 1: Cylindrical Scroll Unfurl ──────────────────────────
            let oneMinusT = 1.0 - ease;
            // Direct canonical geodetic extraction: eliminates lossy atan2 flipping at seam
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);
            let sinLat = sin(latRad);
            let r_phi = mix(RADIUS * cosLat, RADIUS, ease);

            let s = oneMinusT;
            let u = s * lonRad;
            var curX: f32;
            var curZ: f32;
            var f_sin: f32;
            var f_cos: f32;

            if (abs(u) > 0.02) {
                f_sin = sin(u) / s;
                f_cos = (cos(u) - 1.0) / s;
                curX = r_phi * f_sin;
                curZ = r_phi * f_cos + r_phi * s;
            } else {
                let u2 = u * u;
                let u4 = u2 * u2;
                f_sin = lonRad * (1.0 - u2 / 6.0 + u4 / 120.0);
                f_cos = -s * (lonRad * lonRad) * (0.5 - u2 / 24.0 + u4 / 720.0);
                curX = r_phi * f_sin;
                curZ = r_phi * f_cos + r_phi * s;
            }
            let curY = mix(pos3D.y, pos2D.y, ease);
            out.pos = vec3<f32>(curX, curY, curZ);

            // Analytical normal via exact tangent-frame cross product
            let T_lambda = vec3<f32>(
                r_phi * cos(u),
                0.0,
                -r_phi * sin(u)
            );
            let T_phi = vec3<f32>(
                -RADIUS * sinLat * sin(u),
                mix(RADIUS * cosLat, RADIUS / max(cosLat, 0.05), ease),
                -s * RADIUS * sinLat * (f_cos + s)
            );
            let rawNorm = cross(T_lambda, T_phi);
            let normLen = length(rawNorm);
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
            out.normal = select(mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), ease), normalize(rawNorm), normLen > 0.0001);
        }

        case 2u: {
            // ── Mode 2: Griffith Linear Elastic Fracture Mechanics ─────────
            // Active from alpha = 0.00: continuous shell peeling, progressive tensile
            // crack opening, and flexural acoustic emissions along the antimeridian seam
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);
            let sinLat = sin(latRad);
            let distToSeam = PI - abs(lonRad);
            let seamFactor = 1.0 - smoothstep(0.0, 0.85, distToSeam);
            let tRupture: f32 = 0.18;

            let fracMult = select(1.0, hitPos.w, hitPos.w > 0.01);
            let hitDist = length(pos3D - hitPos.xyz);
            let cursorInfluence = curActive * exp(-hitDist * hitDist / (2.0 * 0.64));
            let hoopStress = cursorInfluence * 0.45 * fracMult
                           * (1.0 + 2.0 * cosLat * cosLat);

            // Sphere unit normal
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0),
                                    normalize(pos3D),
                                    length(pos3D) > 0.001);

            // C1 continuous unroll progress starting smoothly at tRupture = 0.18
            let tau = select(0.0, smoothstep(tRupture, 1.0, ease), ease >= tRupture);
            let unrollProg = tau;
            let s = 1.0 - unrollProg;
            let r_phi = mix(RADIUS * cosLat, RADIUS, unrollProg);
            let u = s * lonRad;

            var baseX: f32;
            var baseZ: f32;
            var f_sin: f32;
            var f_cos: f32;

            if (abs(u) > 0.02) {
                f_sin = sin(u) / s;
                f_cos = (cos(u) - 1.0) / s;
                baseX = r_phi * f_sin;
                baseZ = r_phi * f_cos + r_phi * s;
            } else {
                let u2 = u * u;
                let u4 = u2 * u2;
                f_sin = lonRad * (1.0 - u2 / 6.0 + u4 / 120.0);
                f_cos = -s * (lonRad * lonRad) * (0.5 - u2 / 24.0 + u4 / 720.0);
                baseX = r_phi * f_sin;
                baseZ = r_phi * f_cos + r_phi * s;
            }
            let baseY = mix(pos3D.y, pos2D.y, unrollProg);
            let basePos = vec3<f32>(baseX, baseY, baseZ);

            // Tangent frame on unrolling cylindrical manifold
            let T_lambda = vec3<f32>(
                r_phi * cos(u),
                0.0,
                -r_phi * sin(u)
            );
            let T_phi = vec3<f32>(
                -RADIUS * sinLat * sin(u),
                mix(RADIUS * cosLat, RADIUS / max(cosLat, 0.05), unrollProg),
                -s * RADIUS * sinLat * (f_cos + s)
            );
            let rawNorm = cross(T_lambda, T_phi);
            let normLen = length(rawNorm);
            let baseNorm = select(mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), unrollProg),
                                  normalize(rawNorm),
                                  normLen > 0.0001);

            // Griffith Fracture Superimposed Dynamics:
            // 1. Stored elastic strain outward displacement (active from alpha = 0.00 along seam flaring)
            let localStrain = seamFactor * sin(PI * ease) * max(0.2, cos(latRad * 0.85)) + hoopStress * (1.0 - ease);
            let outwardTension = baseNorm * (localStrain * 0.30 * (1.0 - unrollProg));

            // 2. Antimeridian lateral rift separation (crack flanks pull apart continuously with smooth C1 dilation)
            let crackSign = select(-1.0, 1.0, lonRad >= 0.0);
            let crackOpen = seamFactor * (1.0 - unrollProg) * sin(PI * 0.5 * tau);
            let tearOffset = vec3<f32>(crackSign * crackOpen * 0.60, 0.0, -crackOpen * 0.25);

            // 3. Normal-aligned flexural flutter waves (smooth C1/C2 continuous acoustic emissions)
            let flutterWave = sin(distToSeam * 16.0) * sin(8.0 * tau);
            let flutterDecay = exp(-3.5 * tau);
            let flutterAmp = (0.45 * seamFactor + cursorInfluence * 0.20)
                           * flutterWave * flutterDecay * (tau * (1.0 - tau)) * fracMult;
            let flutterOffset = baseNorm * flutterAmp;

            out.pos = basePos + outwardTension + tearOffset + flutterOffset;
            out.normal = select(baseNorm, vec3<f32>(0.0, 0.0, 1.0), unrollProg >= 1.0);
        }

        case 3u: {
            // ── Mode 3: Fluid Advection & Lamb-Oseen Vortex Wake ──────────
            // Orbital swelling ballooning factor eliminates interior volumetric collapse
            // Simulates silk fabric suspended and floating in a fluid medium
            let rawSin = sin(PI * clampedUnfurl);
            let liquefaction = pow(max(0.0, rawSin), 0.90);
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0),
                                    normalize(pos3D),
                                    length(pos3D) > 0.001);
            let unElevatedSphere = sphereNorm * RADIUS;
            let basePos = mix(unElevatedSphere, pos2D, ease);

            // Orbital swelling ballooning displacement
            // Preserves volumetric presence throughout mid-flight transition
            let balloonAmp = RADIUS * 0.50 * rawSin;
            let swelledBasePos = basePos + sphereNorm * balloonAmp;

            let naturalVel = computeCurlNoise(swelledBasePos, simTime);

            let hitDist = length(swelledBasePos - hitPos.xyz);
            let coreRadius: f32 = 0.85;
            let vortexCirc = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius)))
                           / (hitDist + 0.05);
            let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0),
                                       normalize(swelledBasePos),
                                       length(swelledBasePos) > 0.001);
            let vortexTangent = normalize(cross(surfaceNormal,
                                                swelledBasePos - hitPos.xyz + vec3<f32>(0.001)));
            let clampedSpeed = clamp(curVel.w, 0.0, 1.5);
            let vortexVelocity = vortexTangent
                               * (curActive * clampedSpeed * vortexCirc * 0.35);
            let wakeAdvection = normalize(curVel.xyz + vec3<f32>(0.0001))
                              * (clampedSpeed * 0.15 * curActive
                                 * exp(-hitDist * hitDist / 1.5));

            // Multi-harmonic silk drape traveling wave
            let wavePhase1 = dot(swelledBasePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35
                           - simTime * 1.25;
            let wavePhase2 = dot(swelledBasePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75
                           - simTime * 0.90;
            let silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35)
                         * liquefaction * 0.65;
            let silkDrape = surfaceNormal * silkWave;

            let advectionOffset = naturalVel * (liquefaction * 1.55)
                                + silkDrape
                                + (vortexVelocity + wakeAdvection)
                                  * (curActive * 0.25);

            out.pos = swelledBasePos + advectionOffset + surfaceNormal * 0.015;
            let rawNorm = mix(normalize(unElevatedSphere + silkDrape * 0.5),
                             vec3<f32>(0.0, 0.0, 1.0), ease);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);
        }

        default: {
            // ── Mode 0: Linear Manifold Mix (Default) ─────────────────────
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0),
                                    normalize(pos3D),
                                    length(pos3D) > 0.001);
            out.pos = mix(pos3D, pos2D, ease);
            let rawNorm = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), ease);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);
        }
    }

    return out;
}
