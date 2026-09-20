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
            // ── Mode 1: Authentic 2-Stage Developable Scroll Unfurl (§3) ──
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);

            if (ease <= 0.35) {
                // Stage 1: Sphere to Developable Cylinder (K = 1/R^2 -> 0)
                let t1 = smoothstep(0.0, 0.35, ease);
                let r_phi = mix(RADIUS * cosLat, RADIUS, t1);
                let curY = mix(pos3D.y, mercator2D.y, t1 * 0.5);
                let curX = r_phi * sin(lonRad);
                let curZ = r_phi * cos(lonRad);
                out.pos = vec3<f32>(curX, curY, curZ);

                let cylNorm = vec3<f32>(sin(lonRad), 0.0, cos(lonRad));
                out.normal = normalize(mix(sphereNorm, cylNorm, t1));
            } else {
                // Stage 2: Cylinder Unrolling onto Drafting Table
                let t2 = smoothstep(0.35, 1.0, ease);
                let s = 1.0 - t2;
                let u = s * lonRad;
                var curX: f32;
                var curZ: f32;

                if (abs(u) > 0.02) {
                    curX = RADIUS * (sin(u) / s);
                    curZ = RADIUS * ((cos(u) - 1.0) / s) + RADIUS * s;
                } else {
                    let u2 = u * u;
                    curX = RADIUS * lonRad * (1.0 - u2 / 6.0);
                    curZ = -s * RADIUS * (lonRad * lonRad) * (0.5 - u2 / 24.0) + RADIUS * s;
                }
                let yStage1 = mix(pos3D.y, mercator2D.y, 0.5);
                let curY = mix(yStage1, mercator2D.y, t2);
                out.pos = vec3<f32>(curX, curY, curZ);

                let rawNorm = vec3<f32>(sin(u), 0.0, cos(u));
                out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.0001);
            }
        }

        case 2u: {
            // ── Mode 2: Tectonic Crust Fracture (Mid-Atlantic Ridge Calving, §4) ──
            // Single geological seam along Mid-Atlantic Ridge (lambda_rift ≈ -28° ≈ -0.48869 rad)
            let lambdaRift: f32 = -0.48869219;
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);

            let dRift = abs(lonRad - lambdaRift);
            let fSeam = 1.0 - smoothstep(0.0, 0.70, dRift);
            let crackSign = select(-1.0, 1.0, lonRad >= lambdaRift);

            // Eastward surface tangent vector on sphere
            let tEast = normalize(vec3<f32>(sphereNorm.z, 0.0, -sphereNorm.x));

            let fracMult = select(1.0, hitPos.w, hitPos.w > 0.01);
            let hitDist = length(pos3D - hitPos.xyz);
            let cursorInfluence = curActive * exp(-hitDist * hitDist / (2.0 * 0.64));
            let hoopStress = cursorInfluence * 0.45 * fracMult * (1.0 + 2.0 * cosLat * cosLat);

            if (ease <= 0.15) {
                // Pre-Rupture Dilatation & Crack Nucleation (alpha in [0.00, 0.15])
                let deltaR = 0.06 * RADIUS * (ease / 0.15) + hoopStress * (1.0 - ease);
                let crackProg = smoothstep(0.01, 0.15, ease);
                let crackDilation = crackSign * fSeam * (0.08 * crackProg);

                out.pos = pos3D + sphereNorm * deltaR + tEast * crackDilation;
                out.normal = sphereNorm;
            } else {
                // Crustal Plate Peeling & Calving (alpha in [0.15, 1.00])
                let tPeel = smoothstep(0.15, 1.0, ease);
                let baseSphereDilated = pos3D + sphereNorm * (0.06 * RADIUS);
                let basePos = mix(baseSphereDilated, pos2D, tPeel);

                let flutterWave = sin(18.0 * dRift - 20.0 * ease);
                let flutterDecay = exp(-3.5 * ease);
                let wFlutter = flutterWave * flutterDecay * fSeam * fracMult * (tPeel * (1.0 - tPeel));

                let crackWidth = crackSign * fSeam * (0.08 + 0.40 * tPeel);
                let rawNorm = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), tPeel);
                let baseNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);

                out.pos = basePos + baseNorm * wFlutter + tEast * (crackWidth * (1.0 - tPeel));
                out.normal = baseNorm;
            }
        }

        case 3u: {
            // ── Mode 3: Hydrodynamic Fluid Relaxation & Suspended Silk Sheet (§5) ──
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
            let rawSin = sin(PI * clampedUnfurl);
            let volumePreserve = sphereNorm * (RADIUS * 0.50 * rawSin);
            let basePos = mix(pos3D, pos2D, ease) + volumePreserve;

            // Low-frequency suspended silk sheet traveling harmonics
            let phi1 = 0.45 * basePos.x + 0.60 * basePos.y - 1.2 * simTime;
            let phi2 = -0.50 * basePos.x + 0.35 * basePos.y - 0.8 * simTime;
            let capillaryDecay = 1.0 - smoothstep(0.85, 1.0, ease);
            let zSilk = (0.35 * sin(phi1) + 0.20 * cos(phi2)) * rawSin * capillaryDecay;

            let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(basePos), length(basePos) > 0.001);
            let rawNorm = mix(surfaceNormal, vec3<f32>(0.0, 0.0, 1.0), ease);
            let normManifold = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);

            // Cursor Lamb-Oseen vortex interaction in fluid medium
            var cursorOffset = vec3<f32>(0.0);
            if (curActive > 0.001) {
                let hitDist = length(basePos - hitPos.xyz);
                let coreRadius: f32 = 0.85;
                let vortexCirc = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
                let vortexTangent = normalize(cross(normManifold, basePos - hitPos.xyz + vec3<f32>(0.001)));
                let clampedSpeed = clamp(curVel.w, 0.0, 1.5);
                let vortexVel = vortexTangent * (curActive * clampedSpeed * vortexCirc * 0.35);
                let wakeAdv = normalize(curVel.xyz + vec3<f32>(0.0001)) * (clampedSpeed * 0.15 * curActive * exp(-hitDist * hitDist / 1.5));
                cursorOffset = (vortexVel + wakeAdv) * (rawSin * capillaryDecay * 0.25);
            }

            out.pos = basePos + surfaceNormal * zSilk + cursorOffset;
            out.normal = normManifold;
        }

        default: {
            // ── Mode 0: Polar-Convergent Geodesic Unfolding (§2) ──
            // Eliminates polar circular hole tearing and interior chord deflation
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);

            // Effective longitude dilation: S3(alpha) = 3*alpha^2 - 2*alpha^3
            let s3 = ease * ease * (3.0 - 2.0 * ease);
            let lonEff = lonRad * (cosLat + (1.0 - cosLat) * s3);
            let pos2DEff = vec3<f32>(lonEff * RADIUS, pos2D.y, 0.0);

            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0),
                                    normalize(pos3D),
                                    length(pos3D) > 0.001);

            // Radial elevation preservation: prevents interior chord deflation
            let chordLift = sphereNorm * (RADIUS * (1.0 - ease) * sin(PI * ease) * 0.28);
            out.pos = mix(pos3D, pos2DEff, ease) + chordLift;

            let rawNorm = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), ease);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);
        }
    }

    return out;
}
