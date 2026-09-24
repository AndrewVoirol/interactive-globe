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

// ----------------------------------------------------------------------------
// Mode 0: Equirectangular 2:1 Developable Folio Wave Kinematics & Analytical Normal
// ----------------------------------------------------------------------------
fn evaluateModeZero(pos3D: vec3<f32>, target2D: vec2<f32>, unfurl: f32) -> DeformedVertex {
    var out: DeformedVertex;
    let alpha = clamp(unfurl, 0.0, 1.0);
    let lonRad = select(atan2(pos3D.x, pos3D.z), target2D.x / RADIUS, abs(target2D.x) > 0.00001 || abs(target2D.y) > 0.00001);
    let clampedY = clamp(pos3D.y / RADIUS, -1.0, 1.0);
    let latRad = asin(clampedY);
    let cosLat = cos(latRad);
    let sinLat = clampedY;

    let normLon = lonRad / PI;
    let absNormLon = abs(normLon);
    let absNormLat = abs(latRad) / (PI * 0.5);

    // Boundary envelope: zero derivatives at alpha=0 and alpha=1
    let sZero = smoothstep(0.0, 0.10, alpha);
    let sOne = 1.0 - smoothstep(0.90, 1.0, alpha);
    let env = sin(PI * alpha) * sZero * sOne;

    // Pin #1: C2 smooth ease-in
    let alphaEased = alpha * alpha * (3.0 - 2.0 * alpha);

    // Living directional peel: subtle 4% phase shift
    let waveBias = normLon * 0.040 * env;
    let latWeight = 1.0 - cosLat;
    let latFactor = 1.0 - 0.14 * env * latWeight;
    let easeLocal = clamp(alphaEased * latFactor - waveBias, 0.0, 1.0);

    // Synchronized parallel expansion across full living range (0.05 to 0.85)
    let tParallel = smoothstep(0.05, 0.85, easeLocal);
    let parallelWidth = mix(cosLat, 1.0, tParallel);
    let rPar = RADIUS * parallelWidth;

    // Developable circular arc unroll with C^inf smooth spine relaxation:
    let sBase = max(0.0, 1.0 - easeLocal);
    let cosHalfLon = cos(lonRad * 0.5);
    let spineWeight = cosHalfLon * cosHalfLon * cosHalfLon * cosHalfLon;
    let sLocal = sBase * (1.0 - 0.10 * env * spineWeight);
    let uAngle = sLocal * lonRad;

    var curX: f32;
    var curZ: f32;
    if (abs(uAngle) > 0.02) {
        let sDiv = max(0.0001, sLocal);
        curX = rPar * (sin(uAngle) / sDiv);
        curZ = rPar * ((cos(uAngle) - 1.0) / sDiv + sLocal);
    } else {
        let u2 = uAngle * uAngle;
        curX = rPar * lonRad * (1.0 - u2 / 6.0);
        curZ = -sLocal * rPar * (lonRad * lonRad) * (0.5 - u2 / 24.0) + rPar * sLocal;
    }

    // Direct arc normal for outward tactile lip curl
    let normX = sin(uAngle);
    let normZ = cos(uAngle);

    // Living mid-to-late envelope: maintains tactile edge flexibility through alpha in [0.20, 0.85]
    let safeAlpha = max(0.0001, alpha);
    let envLate = select(0.0, sin(PI * pow(safeAlpha, 0.72)) * (1.0 - smoothstep(0.88, 1.0, alpha)), alpha > 0.0);

    // Asymmetric Chiral Seam Dynamics (Pins #1, #2, #3, #4):
    let fWest = select(0.0, sin(PI * pow(safeAlpha, 0.60)) * (1.0 - 0.25 * alpha) * 1.15, alpha > 0.0);
    let fEast = (2.0 * alpha - 0.34) * (1.0 - 0.20 * alpha) * 1.05;
    let flapChiral = select(fWest, fEast, normLon > 0.0);

    // Seam Lip Dynamics with Unified Polar Scaling
    let seamZone = smoothstep(0.50, 1.0, absNormLon);
    let microRim = sin(smoothstep(0.75, 1.0, absNormLon) * PI * 0.5);
    let latTaper = 0.35 + 0.65 * cosLat;
    let poleScale = cosLat + (1.0 - cosLat) * tParallel;

    let lipMag = (seamZone * 0.150 * flapChiral + microRim * 0.070 * env) * RADIUS * envLate * latTaper * poleScale;
    curX = curX + normX * lipMag * 0.70;
    curZ = curZ + (normZ * 0.80 + 0.65) * lipMag;

    // Polar Corner Dog-Ear Curl (tParallel gated)
    let cornerLon = smoothstep(0.68, 1.0, absNormLon);
    let cornerLat = smoothstep(0.58, 0.98, absNormLat);
    let cornerZone = cornerLon * cornerLat;
    let cornerCurlMag = sin(cornerZone * PI * 0.5) * RADIUS * 0.095 * envLate * tParallel;
    curX = curX + normX * cornerCurlMag * 0.45;
    curZ = curZ + (normZ * 0.65 + 0.65) * cornerCurlMag;
    let chiralCornerZ = sinLat * sin(cornerZone * PI * 0.5) * RADIUS * 0.060 * envLate * tParallel;
    curZ = curZ + chiralCornerZ;

    // Perimeter Edge Margin Drape & Anti-Stiffness (with poleScale)
    let distEdgeLon = 1.0 - absNormLon;
    let distEdgeLat = 1.0 - absNormLat;
    let edgeDist = min(distEdgeLon, distEdgeLat);
    let edgeMarginZone = 1.0 - smoothstep(0.0, 0.45, edgeDist);
    let edgeWave = 0.55 * cos(lonRad * 2.0 - 0.4 * alpha) * cos(latRad * 1.3) + 0.45 * sin(lonRad * 3.0 + 0.5) * (0.45 + 0.55 * cosLat);
    let marginDrapeZ = edgeMarginZone * edgeWave * RADIUS * 0.085 * envLate * (0.40 + 0.60 * cosLat) * poleScale;
    curZ = curZ + marginDrapeZ;

    // In-plane organic boundary breathing along seam (with poleScale)
    let edgeFlexX = sin(latRad * 2.5 + alpha * 1.2) * (1.0 - smoothstep(0.0, 0.35, distEdgeLon)) * RADIUS * 0.035 * envLate * (0.40 + 0.60 * cosLat) * poleScale;
    curX = curX + edgeFlexX;

    // Polar Rim Undulation & Drape (tParallel gated)
    let polarRimZone = 1.0 - smoothstep(0.0, 0.35, distEdgeLat);
    let polarRimWaveZ = cos(lonRad * 2.5 - 0.3 * alpha) * sin(lonRad * 1.5 + 0.4);
    let polarDrapeZ = polarRimZone * polarRimWaveZ * RADIUS * 0.045 * envLate * tParallel;
    curZ = curZ + polarDrapeZ;

    // Subtle living wave across the sheet (with poleScale)
    let waveFlex = envLate * (1.0 - 0.5 * alpha) * sin(lonRad * 0.5 + 0.3) * RADIUS * 0.030 * poleScale;
    curZ = curZ + waveFlex;

    // Gentle uniform sheet loft
    let chordLiftZ = (0.60 + 0.40 * cosLat) * RADIUS * 0.06 * env;
    curZ = curZ + chordLiftZ;

    // Vertical transformation: Pure Equirectangular 2:1
    let yArc = RADIUS * latRad;
    let tStraighten = tParallel;
    let yStraight = mix(RADIUS * sinLat, yArc, tStraighten);

    // Gentle polar rim breathing in Y
    let polarRimFlexY = sinLat * polarRimZone * cos(lonRad * 2.0 - 0.2 * alpha) * RADIUS * 0.018 * envLate * tParallel;
    let curY = yStraight + polarRimFlexY;

    out.pos = vec3<f32>(curX, curY, curZ);

    // Closed-form analytical normal N_base = T_lambda x T_phi
    let dyDPhi = RADIUS * mix(cosLat, 1.0, tStraighten);
    let negDrDPhi = RADIUS * sinLat * (1.0 - tParallel);
    var bracket: f32;
    if (abs(uAngle) > 0.02) {
        let sDiv = max(0.0001, sLocal);
        bracket = (1.0 - cos(uAngle)) / sDiv + sLocal * cos(uAngle);
    } else {
        let u2 = uAngle * uAngle;
        bracket = sLocal * (lonRad * lonRad * (0.5 - u2 / 24.0) + (1.0 - u2 * 0.5));
    }
    let rawNx = dyDPhi * sin(uAngle);
    let rawNy = negDrDPhi * bracket;
    let rawNz = dyDPhi * cos(uAngle);
    let rawNorm = vec3<f32>(rawNx, rawNy, rawNz);
    out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.00001);

    return out;
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
            // ── Mode 1: Parchment Scroll Unfurl with Tight Roll Dynamics (§3) ──
            // Rapid cylinder formation by alpha = 0.20 eliminates polar puckering;
            // cylinder rolls up tightly like parchment before unfurling flat onto drafting sheet.
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);

            // Phase 1: Rapid cylinder formation (alpha in [0.0, 0.20])
            let tCyl = smoothstep(0.0, 0.20, ease);
            let rCyl = mix(RADIUS * cosLat, RADIUS, tCyl);

            // Phase 2: Parchment tight roll-up compression (tightens cylinder radius before unrolling)
            let tRoll = sin(PI * smoothstep(0.15, 0.40, ease));
            let rScroll = rCyl * (1.0 - 0.20 * tRoll);

            // Phase 3: Unrolling curvature relaxation onto drafting table (alpha in [0.20, 1.00])
            let tUnroll = smoothstep(0.20, 1.0, ease);
            let s = 1.0 - tUnroll;
            let u = s * lonRad;

            var curX: f32;
            var curZ: f32;

            if (abs(u) > 0.02) {
                let sDiv = max(0.0001, s);
                curX = rScroll * (sin(u) / sDiv);
                curZ = rScroll * ((cos(u) - 1.0) / sDiv + s);
            } else {
                let u2 = u * u;
                curX = rScroll * lonRad * (1.0 - u2 / 6.0);
                curZ = -s * rScroll * (lonRad * lonRad) * (0.5 - u2 / 24.0) + rScroll * s;
            }

            // Polar Puckering Elimination: Y stays cylindrical during formation, then unrolls to Mercator
            let curY = mix(pos3D.y, mercator2D.y, tUnroll);
            out.pos = vec3<f32>(curX, curY, curZ);

            let cylNorm = vec3<f32>(sin(u), 0.0, cos(u));
            let rawNorm = mix(sphereNorm, select(vec3<f32>(0.0, 0.0, 1.0), normalize(cylNorm), length(cylNorm) > 0.0001), tCyl);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);
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
            // ── Mode 3: Hydrodynamic Fluid Relaxation & Viscous Streamline Shear (§5) ──
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
            let rawSin = sin(PI * clampedUnfurl);
            let liquefaction = rawSin * (1.0 - 0.35 * ease);
            let volumePreserve = sphereNorm * (RADIUS * 0.50 * rawSin);
            let basePos = mix(pos3D, pos2D, ease) + volumePreserve;

            let baseLen = length(basePos);
            let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(basePos), baseLen > 0.001);

            // Solenoidal curl noise projected strictly onto the surface tangent plane
            // (Eliminates radial bunching and knobby marbles while delivering authentic fluid streamline flow)
            let rawCurl = computeCurlNoise(basePos, simTime * 1.5);
            let normalComp = dot(rawCurl, surfaceNormal);
            let tangentCurl = rawCurl - surfaceNormal * normalComp;
            let fluidShear = tangentCurl * (RADIUS * 0.28 * liquefaction);

            // 3-Octave dispersion-coupled gravity-capillary surface waves (multi-axis 3D traveling wave harmonics with faster undulation)
            let phi1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35 - simTime * 2.8;
            let phi2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75 - simTime * 2.2;
            let phi3 = dot(basePos, vec3<f32>(0.55, -0.40, 0.35)) * 2.10 - simTime * 3.4;
            let capillaryDecay = 1.0 - smoothstep(0.85, 1.0, ease);
            let zCapillary = (0.45 * sin(phi1) + 0.30 * cos(phi2) + 0.20 * sin(phi3)) * liquefaction * capillaryDecay;

            // Cursor Lamb-Oseen vortex interaction in fluid medium
            var cursorOffset = vec3<f32>(0.0);
            if (curActive > 0.001) {
                let hitDist = length(basePos - hitPos.xyz);
                let coreRadius: f32 = 0.85;
                let vortexCirc = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
                let vortexTangent = normalize(cross(surfaceNormal, basePos - hitPos.xyz + vec3<f32>(0.001)));
                let clampedSpeed = clamp(curVel.w, 0.0, 1.5);
                let vortexVel = vortexTangent * (curActive * clampedSpeed * vortexCirc * 0.35);
                let wakeAdv = normalize(curVel.xyz + vec3<f32>(0.0001)) * (clampedSpeed * 0.15 * curActive * exp(-hitDist * hitDist / 1.5));
                cursorOffset = (vortexVel + wakeAdv) * (rawSin * capillaryDecay * 0.25);
            }

            out.pos = basePos + fluidShear + surfaceNormal * zCapillary + cursorOffset;

            let rawNorm = mix(surfaceNormal, vec3<f32>(0.0, 0.0, 1.0), ease);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);
        }

        default: {
            out = evaluateModeZero(pos3D, mercator2D, unfurl);
        }
    }

    return out;
}
